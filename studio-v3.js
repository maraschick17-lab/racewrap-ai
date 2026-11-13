'use strict';
/* RaceWrap AI concept editor. No backend, no paid services, no production cut files. */
(() => {
  const $ = id => document.getElementById(id);
  const status = message => { const el = $('status'); if (el) { el.textContent = message; el.setAttribute('role','status'); el.setAttribute('aria-live','polite'); } };
  const state = { source:'', sourceType:'', sourceName:'', width:0, height:0, logo:'', logoName:'', logoType:'', pattern:'slashes', ai:false };
  const palette = {black:'#16191e',white:'#f2f4f7',red:'#e52e2e',blue:'#247ee8',green:'#25b96e',orange:'#f77922',purple:'#9b50e4',yellow:'#e8bc25',gold:'#d8a83e',silver:'#c9d2da',gray:'#737e8a'};
  const MAX_FILE = 15*1024*1024;
  const canvas = $('canvas');
  const image = $('bodyImage');
  const overlays = [$('graphic'),$('sponsorGraphic'),$('logoGraphic')];
  // Original lettering treatments use system fonts; no manufacturer artwork.
  const lettering = document.createElement('fieldset');
  lettering.style.cssText='margin:12px 0;padding:12px;border:1px solid #48648b;border-radius:12px;min-width:0';
  lettering.innerHTML='<legend>Race number lettering</legend><label for="numberStyle">Lettering treatment</label><select id="numberStyle"><option value="classic">Classic outline</option><option value="speed">Speed italic</option><option value="block">Heavy block</option></select><label for="numberScale">Number size <output id="numberScaleValue">100%</output></label><input id="numberScale" type="range" min="60" max="180" step="5" value="100"><p class="muted">Accent fill and trim outline follow your palette. Drag the number on the car to position it.</p>';
  $('number').closest('label') ? $('number').closest('label').insertAdjacentElement('afterend',lettering) : $('number').insertAdjacentElement('afterend',lettering);
  function numberTreatment() {
    const style=['classic','speed','block'].includes($('numberStyle').value)?$('numberStyle').value:'classic';
    const scale=clamp(Number($('numberScale').value)||100,60,180)/100;
    return {style,scale,stroke:style==='block'?5:2,italic:style==='speed'};
  }
  function renderLettering() {
    const t=numberTreatment(), unit=canvas.clientWidth/1000;
    const el=$('graphic');
    el.style.fontSize=(75*t.scale*unit)+'px';
    el.style.lineHeight='1';el.style.fontFamily='Arial,sans-serif';el.style.fontWeight='900';
    el.style.fontStyle=t.italic?'italic':'normal';el.style.textShadow='none';
    el.style.webkitTextStroke=(t.stroke*unit)+'px '+$('trim').value;
    el.style.paintOrder='stroke fill';
    $('numberScaleValue').textContent=Math.round(t.scale*100)+'%';
  }
  new ResizeObserver(renderLettering).observe(canvas);
  $('numberStyle').addEventListener('input',refresh);
  $('numberScale').addEventListener('input',refresh);
  const extraLogos = [];
  let logoLayoutUndo=null;
  $('logoGraphic').style.zIndex='20';
  let selectedLogo = 0, nextLogoId = 1;
  const panelMasks = [];
  const panelNames = [];
  const panelFieldMeasurements = []; // User-entered field observations; never verified cut geometry.
  let draftPanel = [], tracingPanel = false;
  let rulerPoints = [], measuringSpan = false;
  let webLLMEngine = null, webLLMModel = '';
  let draftTimer = null;
  let layoutAnchor = null, layoutChoice = 0;
  let designSlots = [null,null,null];
  let canvasLocked = false;
  let patternMoveMode = null, patternPointer = null;
  // Session-only mobile editing mode. Locked artwork cannot capture touch drags,
  // allowing vertical scrolling across the imported template on small screens.
  function setCanvasLocked(locked) {
    canvasLocked=Boolean(locked);
    canvas.style.touchAction=canvasLocked?'pan-y':'none';
    for(const el of [...overlays,...extraLogos.map(item=>item.el)]) {
      el.style.pointerEvents=canvasLocked?'none':'auto';
      el.style.touchAction=canvasLocked?'pan-y':'none';
      el.style.cursor=canvasLocked?'default':'grab';
    }
    $('canvasLock').textContent=canvasLocked?'Unlock artwork to edit':'Lock artwork to scroll';
    $('canvasLock').setAttribute('aria-pressed',String(canvasLocked));
    $('canvasLockStatus').textContent=canvasLocked?'Artwork locked: swipe over the canvas to scroll the page. Unlock to drag the number or logos.':'Artwork editable: drag the number or logos. Lock artwork when you need to scroll on a phone.';
    updatePatternMoveUI();
  }
  const DRAFT_DB = 'racewrap-concept-drafts';
  function openDraftDB() {
    return new Promise((resolve,reject)=>{
      if(!window.indexedDB)return reject(Error('Browser storage unavailable'));
      const req=indexedDB.open(DRAFT_DB,1);
      req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('drafts'))req.result.createObjectStore('drafts');};
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||Error('Storage unavailable'));
    });
  }
  // Wait for the IndexedDB transaction to commit, not merely request success.
  // Serialize writes/deletes so a delayed autosave cannot resurrect a cleared draft.
  let draftMutationQueue=Promise.resolve();
  async function draftAction(mode,value,key='latest') {
    const execute=async()=>{
      const db=await openDraftDB();
      try {
        return await new Promise((resolve,reject)=>{
          const tx=db.transaction('drafts',mode==='read'?'readonly':'readwrite');
          let result;
          tx.oncomplete=()=>resolve(result);
          tx.onabort=()=>reject(tx.error||Error('Draft transaction aborted'));
          tx.onerror=()=>reject(tx.error||Error('Storage failed'));
          const store=tx.objectStore('drafts');
          const req=mode==='read'?store.get(key):mode==='delete'?store.delete(key):store.put(value,key);
          req.onsuccess=()=>{result=req.result;};
          req.onerror=()=>reject(req.error||Error('Draft operation failed'));
        });
      } finally {db.close();}
    };
    if(mode==='read')return execute();
    const pending=draftMutationQueue.then(execute,execute);
    draftMutationQueue=pending.catch(()=>{});
    return pending;
  }
  async function persistDraft() {
    if(!state.source)return false;
    try {
      const json=JSON.stringify(project());
      if(json.length>30*1024*1024)throw Error('Project exceeds 30 MB browser autosave limit');
      const savedAt=Date.now();
      await draftAction('write',{json,savedAt});
      $('autosaveStatus').textContent='Draft saved in this browser at '+new Date(savedAt).toLocaleTimeString()+'.';
      $('recoverDraft').disabled=false;$('clearDraft').disabled=false;
      return true;
    } catch(err){
      $('autosaveStatus').textContent='Autosave unavailable: '+err.message+'. Download project JSON instead.';
      return false;
    }
  }
  let queueHistory = () => {};
  function scheduleAutosave() {
    queueHistory();
    if(!state.source)return;
    clearTimeout(draftTimer);
    draftTimer=setTimeout(()=>{persistDraft();},1300);
  }
  async function checkDraft() {
    try {
      const draft=await draftAction('read');
      if(draft&&draft.json) {
        $('recoverDraft').disabled=false;$('clearDraft').disabled=false;
        $('autosaveStatus').textContent='Saved browser draft found ('+new Date(draft.savedAt).toLocaleString()+'). Restore it to continue.';
      } else $('autosaveStatus').textContent='Autosave will start after you import a template.';
      const previous=await draftAction('read',undefined,'previous-car');
      $('restorePrevious').disabled=!previous?.json;
    } catch(err){$('autosaveStatus').textContent='Browser autosave unavailable. Use Download editable project.';}
  }
  const percent = (value,total) => total ? 100*value/total : 0;
  const clamp = (x,min,max) => Math.min(max,Math.max(min,x));
  const safe = value => String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  function fileKind(file) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.svg')) return 'svg';
    if (name.endsWith('.pdf')) return 'pdf';
    if (name.endsWith('.png')) return 'png';
    if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'jpeg';
    if (name.endsWith('.webp')) return 'webp';
    return '';
  }
  function safeSVG(source) {
    if (source.length > MAX_FILE) throw Error('SVG exceeds 15 MB');
    const doc = new DOMParser().parseFromString(source,'image/svg+xml');
    if (doc.documentElement.localName !== 'svg' || doc.querySelector('parsererror')) throw Error('Invalid SVG');
    const blocked = new Set(['script','foreignObject','iframe','object','embed','audio','video','animate','set','animateTransform','animateMotion']);
    for (const el of doc.querySelectorAll('*')) {
      if (blocked.has(el.localName)) throw Error('SVG has unsupported active content');
      for (const attr of Array.from(el.attributes)) {
        const key=attr.name.toLowerCase(), value=attr.value.trim();
        if (key.startsWith('on') || /javascript:|data:text\/html|@import|expression\s*\(|url\s*\(\s*(?!['\"]?#)/i.test(value)) throw Error('SVG has unsafe attributes');
        if ((key === 'href' || key === 'xlink:href') && !value.startsWith('#') && !value.startsWith('data:image/png;base64,') && !value.startsWith('data:image/jpeg;base64,')) throw Error('External SVG resources are not supported');
      }
    }
    return new XMLSerializer().serializeToString(doc.documentElement);
  }
  async function loadImageURL(url) {
    const im = new Image();
    await new Promise((resolve,reject)=>{
      let timed = false;
      const t = setTimeout(()=>{ timed = true; im.onload = null; im.onerror = null; reject(Error('Image load timed out (allow extra time for large files or slow devices)')); }, 30000);
      im.onload = ()=>{ if(!timed){ clearTimeout(t); resolve(); } };
      im.onerror = ()=>{ clearTimeout(t); reject(Error('Image cannot be decoded')); };
      im.src = url;
    });
    if (!im.naturalWidth || !im.naturalHeight || im.naturalWidth*im.naturalHeight>50000000) throw Error('Image dimensions are invalid or too large');
    return im;
  }
  async function rasterize(file,kind,maxSize) {
    let url='', im;
    try {
      if (kind==='svg') {
        const source=safeSVG(await file.text());
        url=URL.createObjectURL(new Blob([source],{type:'image/svg+xml'}));
      } else {
        url=URL.createObjectURL(file);
      }
      im=await loadImageURL(url);
      const scale=Math.min(1,maxSize/Math.max(im.naturalWidth,im.naturalHeight));
      const out=document.createElement('canvas');
      out.width=Math.max(1,Math.round(im.naturalWidth*scale));
      out.height=Math.max(1,Math.round(im.naturalHeight*scale));
      out.getContext('2d').drawImage(im,0,0,out.width,out.height);
      return {data:out.toDataURL('image/png'),width:out.width,height:out.height,originalWidth:im.naturalWidth,originalHeight:im.naturalHeight};
    } finally {if(url) URL.revokeObjectURL(url);}
  }
  async function pdfPage(file,page=1) {
    let pdfjs;
    try {
      pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
    } catch(err) {
      throw Error('PDF rendering library unavailable: '+err.message);
    }
    const bytes=new Uint8Array(await file.arrayBuffer());
    const doc=await pdfjs.getDocument({data:bytes}).promise;
    const p=await doc.getPage(page);
    const initial=p.getViewport({scale:1});
    const viewport=p.getViewport({scale:Math.min(2.5,2200/Math.max(initial.width,initial.height))});
    const cv=document.createElement('canvas');
    cv.width=Math.round(viewport.width);cv.height=Math.round(viewport.height);
    await p.render({canvasContext:cv.getContext('2d'),viewport}).promise;
    return {data:cv.toDataURL('image/png'),width:cv.width,height:cv.height,pages:doc.numPages};
  }
  function refresh() {
    const ready=!!state.source;
    $('graphic').textContent=$('number').value.trim()||'17';
    $('graphic').style.color=$('accent').value;
    renderLettering();
    $('sponsorGraphic').textContent=$('sponsor').value.trim();
    $('graphic').style.display=ready?'block':'none';
    $('sponsorGraphic').style.display=ready&&!!$('sponsor').value.trim()?'block':'none';
    $('logoGraphic').style.display=ready&&!!state.logo?'block':'none';
    for (const item of extraLogos) item.el.style.display=ready?'block':'none';
    $('patternLayer').style.display=ready&&($('pattern').value!=='none'||$('secondaryPattern').value!=='none')?'block':'none';
    $('arrangeLogos').disabled=!ready||!logoItems().length;
    $('saveDraftNow').disabled=!ready;
    drawPattern();drawPanelOverlay();drawRuler();setCanvasLocked(canvasLocked);scheduleAutosave();
  }
  // Touch and mouse positioning uses the same saved 0–100% sliders as exports.
  // This is manual placement, not an AI-generated image or measured fitment.
  function updatePatternMoveUI() {
    const layer=$('patternLayer');
    const ready=!!state.source;
    const enabled=ready&&!canvasLocked&&!!patternMoveMode;
    layer.style.pointerEvents=enabled?'auto':'none';
    layer.style.touchAction=enabled?'none':'pan-y';
    layer.style.cursor=enabled?'move':'default';
    for(const [id,mode,patternId] of [['movePrimary','primary','pattern'],['moveSecondary','secondary','secondaryPattern']]) {
      const button=$(id);
      button.disabled=!ready||$(patternId).value==='none'||canvasLocked;
      button.setAttribute('aria-pressed',String(patternMoveMode===mode&&!canvasLocked));
      button.textContent=patternMoveMode===mode&&!canvasLocked?'Done moving '+mode:'Drag '+mode+' graphics';
    }
    $('patternMoveStatus').textContent=!ready?'Load a car or licensed template to position graphics.':
      canvasLocked?'Unlock artwork to move graphics.':
      patternMoveMode?'Drag anywhere on the canvas to move '+patternMoveMode+' graphics; use sliders for precise adjustments.':
      'Choose a layer to drag its graphics on the canvas. Sponsor logos and number have separate drag controls.';
  }
  function choosePatternMove(mode) {
    if(!state.source){status('Load a car or licensed template first.');return;}
    if(canvasLocked){status('Unlock artwork before moving graphics.');return;}
    const patternId=mode==='primary'?'pattern':'secondaryPattern';
    if($(patternId).value==='none'){status('Select a graphic treatment for this layer first.');return;}
    patternMoveMode=patternMoveMode===mode?null:mode;
    patternPointer=null;
    updatePatternMoveUI();
  }
  $('movePrimary').addEventListener('click',()=>choosePatternMove('primary'));
  $('moveSecondary').addEventListener('click',()=>choosePatternMove('secondary'));
  $('patternLayer').addEventListener('pointerdown',e=>{
    if(!patternMoveMode||!state.source||canvasLocked||tracingPanel||measuringSpan)return;
    if(e.pointerType==='mouse'&&e.button!==0)return;
    const xId=patternMoveMode==='primary'?'patternX':'secondaryX';
    const yId=patternMoveMode==='primary'?'patternY':'secondaryY';
    patternPointer={id:e.pointerId,x:e.clientX,y:e.clientY,xId,yId,startX:Number($(xId).value),startY:Number($(yId).value)};
    $('patternLayer').setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  $('patternLayer').addEventListener('pointermove',e=>{
    if(!patternPointer||patternPointer.id!==e.pointerId)return;
    const box=canvas.getBoundingClientRect();
    if(!box.width||!box.height)return;
    $(patternPointer.xId).value=String(Math.round(clamp(patternPointer.startX+(e.clientX-patternPointer.x)/box.width*100,0,100)));
    $(patternPointer.yId).value=String(Math.round(clamp(patternPointer.startY+(e.clientY-patternPointer.y)/box.height*100,0,100)));
    drawPattern();
    e.preventDefault();
  });
  function finishPatternMove(e) {
    if(!patternPointer||patternPointer.id!==e.pointerId)return;
    if(e.type==='pointercancel'){
      $(patternPointer.xId).value=String(patternPointer.startX);
      $(patternPointer.yId).value=String(patternPointer.startY);
    }
    patternPointer=null;
    refresh();
  }
  $('patternLayer').addEventListener('pointerup',finishPatternMove);
  $('patternLayer').addEventListener('pointercancel',finishPatternMove);
  // Procedural graphics; optional on-device AI selects controls, not image pixels.
  function patternShapes(style,accent,trim) {
    let shapes='';
    if(style==='slashes') shapes='<polygon points="90,420 320,90 390,90 160,420" fill="'+accent+'"/><polygon points="180,420 410,90 450,90 220,420" fill="'+trim+'"/>';
    if(style==='chevrons') shapes='<path d="M30 390 L300 95 L390 95 L125 390 Z M180 390 L450 95 L495 95 L230 390 Z" fill="'+accent+'"/>';
    if(style==='lightning') shapes='<path d="M50 400 L350 90 L260 260 L440 230 L130 460 L230 300 Z" fill="'+accent+'" stroke="'+trim+'" stroke-width="9"/>';
    if(style==='checker') {for(let r=0;r<3;r++)for(let c=0;c<8;c++)if((r+c)%2===0)shapes+='<rect x="'+(60+c*46)+'" y="'+(300+r*46)+'" width="46" height="46" fill="'+accent+'"/>';}
    if(style==='ribbons') {for(let i=0;i<6;i++)shapes+='<path d="M'+(25+i*32)+' 450 Q'+(150+i*32)+' 260 '+(280+i*32)+' 70" fill="none" stroke="'+(i%2?trim:accent)+'" stroke-width="'+(i%2?12:22)+'" stroke-linecap="round"/>';}
    if(style==='burst') {for(let i=0;i<9;i++){const a=(-72+i*18)*Math.PI/180,b=a+0.13;shapes+='<path d="M120 380 L'+(120+420*Math.cos(a)).toFixed(1)+' '+(380+420*Math.sin(a)).toFixed(1)+' L'+(120+420*Math.cos(b)).toFixed(1)+' '+(380+420*Math.sin(b)).toFixed(1)+' Z" fill="'+(i%2?trim:accent)+'"/>';}}
    return shapes;
  }
  function drawPattern() {
    const layer=$('patternLayer'),accent=$('accent').value,trim=$('trim').value;
    const angle=clamp(Number($('patternAngle').value)||0,-75,75),scale=clamp(Number($('patternScale').value)||100,50,180)/100;
    const dx=(clamp(Number($('patternX').value)||0,0,100)-35)*10,dy=(clamp(Number($('patternY').value)||0,0,100)-50)*5.5;
    let shapes='<g data-layer="primary" transform="translate('+dx.toFixed(2)+' '+dy.toFixed(2)+') translate(270 280) rotate('+angle+') scale('+scale+') translate(-270 -280)">'+patternShapes($('pattern').value,accent,trim)+'</g>';
    if($('secondaryPattern').value!=='none') {
      const sx=(Number($('secondaryX').value)-50)*10,sy=(Number($('secondaryY').value)-50)*5.5;
      const opacity=clamp(Number($('secondaryOpacity').value)||0,0,100)/100;
      shapes+='<g data-layer="secondary" opacity="'+opacity.toFixed(2)+'" transform="translate('+sx.toFixed(2)+' '+sy.toFixed(2)+') translate(270 280) scale(.75) translate(-270 -280)">'+patternShapes($('secondaryPattern').value,trim,accent)+'</g>';
    }
    const masks=panelMasks.map(p=>'<polygon points="'+p.map(([x,y])=>(x*1000).toFixed(2)+','+(y*550).toFixed(2)).join(' ')+'"/>').join('');
    const clipped=panelMasks.length?'<defs><clipPath id="racewrapPanelClip">'+masks+'</clipPath></defs><g clip-path="url(#racewrapPanelClip)">'+shapes+'</g>':shapes;
    layer.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 550" preserveAspectRatio="none" width="100%" height="100%">'+clipped+'</svg>';
    layer.style.opacity=String(Number($('patternOpacity').value)/100);
  }
  // Reject crossed, repeated or effectively zero-area traced polygons.
  // Coordinates are normalized to the source image; this validates a concept
  // mask only and does not verify physical panel geometry or print fitment.
  function polygonIssue(points) {
    if(!Array.isArray(points)||points.length<3)return 'Add at least three corners';
    if(points.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)||v<0||v>1)))return 'Corners must stay on the template';
    const width=Math.max(1,state.width),height=Math.max(1,state.height);
    const xy=points.map(([x,y])=>[x*width,y*height]);
    const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    const near=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<1;
    for(let i=0;i<xy.length;i++)if(near(xy[i],xy[(i+1)%xy.length]))return 'Adjacent corners are too close';
    const onSegment=(a,b,p)=>Math.abs(cross(a,b,p))<0.01&&p[0]>=Math.min(a[0],b[0])-.01&&p[0]<=Math.max(a[0],b[0])+.01&&p[1]>=Math.min(a[1],b[1])-.01&&p[1]<=Math.max(a[1],b[1])+.01;
    const intersects=(a,b,c,d)=>{
      const o1=cross(a,b,c),o2=cross(a,b,d),o3=cross(c,d,a),o4=cross(c,d,b);
      return ((o1>0&&o2<0||o1<0&&o2>0)&&(o3>0&&o4<0||o3<0&&o4>0))||
        onSegment(a,b,c)||onSegment(a,b,d)||onSegment(c,d,a)||onSegment(c,d,b);
    };
    for(let i=0;i<xy.length;i++)for(let j=i+1;j<xy.length;j++){
      if(j===i+1||(i===0&&j===xy.length-1))continue;
      if(intersects(xy[i],xy[(i+1)%xy.length],xy[j],xy[(j+1)%xy.length]))return 'Polygon edges cross or overlap';
    }
    let twiceArea=0;
    for(let i=0;i<xy.length;i++){const a=xy[i],b=xy[(i+1)%xy.length];twiceArea+=a[0]*b[1]-b[0]*a[1];}
    if(Math.abs(twiceArea)<8)return 'Polygon area is too small';
    return '';
  }
  function drawPanelOverlay() {
    const el=$('panelOverlay'), points=p=>p.map(([x,y])=>(x*1000).toFixed(2)+','+(y*550).toFixed(2)).join(' ');
    let svg=panelMasks.map(p=>'<polygon points="'+points(p)+'" fill="#ff533d" fill-opacity=".10" stroke="'+(polygonIssue(p)?'#ffb020':'#ff533d')+'" stroke-width="2" stroke-dasharray="8 5"/>').join('');
    if(draftPanel.length) {
      svg+='<polyline points="'+points(draftPanel)+'" fill="none" stroke="#00b8ff" stroke-width="3"/>';
      svg+=draftPanel.map(([x,y])=>'<circle cx="'+(x*1000).toFixed(2)+'" cy="'+(y*550).toFixed(2)+'" r="6" fill="#00b8ff"/>').join('');
    }
    el.innerHTML=svg;
    updatePanelMeasurements();
    el.style.display=(tracingPanel||panelMasks.length)?'block':'none';
    el.style.pointerEvents=tracingPanel?'all':'none';
    el.style.zIndex=tracingPanel?'10':'1';
    $('tracePanel').textContent=tracingPanel?'Cancel tracing':'Trace panel';
    const draftIssue=draftPanel.length>=3?polygonIssue(draftPanel):'';
    $('finishPanel').disabled=draftPanel.length<3||!!draftIssue;
    $('undoPoint').disabled=!draftPanel.length;
    $('clearPanels').disabled=!panelMasks.length&&!draftPanel.length;
    $('panelStatus').textContent=tracingPanel?(draftIssue?'Fix panel: '+draftIssue+'. Undo a point or cancel tracing.':'Tracing: '+draftPanel.length+' point(s). Click panel corners; finish with at least 3.'):panelMasks.length?panelMasks.length+' artwork mask(s) active. Pattern is clipped to traced regions.':'No artwork masks. Pattern covers the full template.';
  }
  function validFieldInches(value) {
    if(value===null||value===undefined||value==='')return null;
    const n=Number(value);
    return Number.isFinite(n)&&n>0&&n<=1000?n:null;
  }
  function panelReferenceSize(points,scale) {
    const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
    const width=(Math.max(...xs)-Math.min(...xs))*state.width/scale;
    const height=(Math.max(...ys)-Math.min(...ys))*state.height/scale;
    let twiceArea=0;
    for(let k=0;k<points.length;k++){
      const a=points[k],b=points[(k+1)%points.length];
      twiceArea+=a[0]*b[1]-b[0]*a[1];
    }
    return {width,height,area:Math.abs(twiceArea)*state.width*state.height/(2*scale*scale)};
  }
  function updatePanelMeasurements() {
    const container=$('panelDimensions');
    if(!container)return;
    container.replaceChildren();
    const scale=Number($('px').value)/Number($('inch').value);
    const calibrated=rulerPoints.length===2&&Number.isFinite(scale)&&scale>0;
    panelMasks.forEach((points,i)=>{
      const issue=polygonIssue(points);
      const row=document.createElement('div');
      row.style.cssText='border-top:1px solid #42536a;padding:10px 0;font-size:12px;color:#cbd5e1';
      const label=(panelNames[i]||'Panel '+(i+1)).slice(0,50);
      const reference=calibrated?panelReferenceSize(points,scale):null;
      const description=document.createElement('div');
      description.textContent=label+' · '+points.length+' corners · '+(issue?'INVALID GEOMETRY: '+issue:reference?('approx '+reference.width.toFixed(1)+' × '+reference.height.toFixed(1)+' in bounding box (image), '+reference.area.toFixed(1)+' in² traced area'):'calibrate the two-point ruler for approximate image bounds');
      row.appendChild(description);
      const inputs=document.createElement('div');
      inputs.style.cssText='display:flex;gap:10px;flex-wrap:wrap;margin:8px 0';
      const measured=panelFieldMeasurements[i]||{};
      for(const [axis,title] of [['width','Field width'],['height','Field height']]){
        const labelEl=document.createElement('label');
        labelEl.style.cssText='margin:0;flex:1;min-width:105px';
        labelEl.textContent=title+' (in)';
        const input=document.createElement('input');
        input.type='number';input.inputMode='decimal';input.min='0.01';input.max='1000';input.step='any';
        input.value=validFieldInches(measured[axis])===null?'':String(measured[axis]);
        input.setAttribute('aria-label',label+' '+title+' in inches');
        input.addEventListener('input',()=>{
          const raw=input.value;
          const entry=panelFieldMeasurements[i]||(panelFieldMeasurements[i]={width:null,height:null});
          entry[axis]=raw===''?null:validFieldInches(raw);
          input.setCustomValidity(raw!==''&&entry[axis]===null?'Enter a positive measurement up to 1000 inches.':'');
          scheduleAutosave();
        });
        input.addEventListener('change',updatePanelMeasurements);
        labelEl.appendChild(input);inputs.appendChild(labelEl);
      }
      row.appendChild(inputs);
      const fieldWidth=validFieldInches(measured.width),fieldHeight=validFieldInches(measured.height);
      if(fieldWidth!==null||fieldHeight!==null){
        const delta=(field,estimate)=>field===null||!reference?'n/a':((field/estimate-1)*100).toFixed(1)+'%';
        const note=document.createElement('div');
        note.style.color='#e2d5a5';
        note.textContent='Field observations saved · difference vs flat image bounds: width '+delta(fieldWidth,reference?.width)+', height '+delta(fieldHeight,reference?.height)+'. Perspective, curvature and tape path can explain differences. NOT verified fitment.';
        row.appendChild(note);
      }
      container.appendChild(row);
    });
    if(!panelMasks.length)container.textContent='Trace a panel to enter field measurements and see approximate image bounds.';
    $('exportPanelReport').disabled=!calibrated||!panelMasks.length||panelMasks.some(p=>!!polygonIssue(p));
  }
  // Reference-only measurements. The user supplies a known span on the source image;
  // raster perspective, bleed, curves and real-world panel geometry are NOT solved here.
  function exportPanelReference() {
    const scale=Number($('px').value)/Number($('inch').value);
    if(!state.source||rulerPoints.length!==2||!Number.isFinite(scale)||scale<=0||!panelMasks.length||panelMasks.some(p=>!!polygonIssue(p))) {
      status('Trace valid non-crossing panels and calibrate the two-point ruler before exporting approximate dimensions.');
      return;
    }
    const csvCell=value=>{
      const raw=String(value??'');
      // Excel and other spreadsheet programs may execute untrusted cell formulas.
      const guarded=/^\s*[=+\-@]/.test(raw)?"'"+raw:raw;
      return '"'+guarded.replace(/"/g,'""')+'"';
    };
    const lines=[['Panel','Vertices','Approx bounding width (in)','Approx bounding height (in)','Approx traced area (sq in)','Field width observed (in)','Field height observed (in)','Field width vs image bounds (%)','Field height vs image bounds (%)','Source image','Fitment status']];
    for(let i=0;i<panelMasks.length;i++){
      const points=panelMasks[i],reference=panelReferenceSize(points,scale);
      const field=panelFieldMeasurements[i]||{};
      const width=validFieldInches(field.width),height=validFieldInches(field.height);
      const delta=(actual,estimated)=>actual===null?'':((actual/estimated-1)*100).toFixed(1);
      lines.push([panelNames[i]||'Panel '+(i+1),points.length,reference.width.toFixed(1),reference.height.toFixed(1),reference.area.toFixed(1),width===null?'':width,height===null?'':height,delta(width,reference.width),delta(height,reference.height),state.sourceName,'UNVERIFIED RASTER REFERENCE - NOT PRINT READY; FIELD OBSERVATIONS NOT VERIFIED']);
    }
    download(lines.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n','racewrap-panel-reference.csv','text/csv;charset=utf-8');
    status('Approximate panel reference CSV downloaded for '+panelMasks.length+' traced panel(s). These are not cut dimensions or print-ready measurements.');
  }
  function drawRuler() {
    const el=$('rulerOverlay'), coords=([x,y])=>[(x*1000).toFixed(2),(y*550).toFixed(2)];
    const pts=rulerPoints.map(coords);
    let markup='';
    if(pts.length===2)markup='<line x1="'+pts[0][0]+'" y1="'+pts[0][1]+'" x2="'+pts[1][0]+'" y2="'+pts[1][1]+'" stroke="#00a6ff" stroke-width="5" stroke-dasharray="12 8"/>';
    for(const [x,y] of pts)markup+='<circle cx="'+x+'" cy="'+y+'" r="9" fill="#00a6ff" stroke="white" stroke-width="3"/>';
    el.innerHTML=markup;el.style.display=measuringSpan||pts.length?'block':'none';el.style.pointerEvents=measuringSpan?'all':'none';
    $('measureSpan').textContent=measuringSpan?'Cancel reference ruler':'Pick 2 reference points';
    $('clearSpan').disabled=!pts.length;
    const pixels=pts.length===2?Math.hypot((rulerPoints[1][0]-rulerPoints[0][0])*state.width,(rulerPoints[1][1]-rulerPoints[0][1])*state.height):0;
    updatePanelMeasurements();
    $('rulerStatus').textContent=measuringSpan?'Tap '+(2-pts.length)+' point(s) on the template.':pts.length===2?'Measured reference: '+pixels.toFixed(1)+' image px over '+$('inch').value+' in. Check both endpoints.':pts.length?'First point selected.':'No reference points selected.';
  }
  function setTemplate(result,name,kind) {
    state.source=result.data;state.width=result.width;state.height=result.height;state.sourceName=name;state.sourceType=kind;
    layoutAnchor=null;layoutChoice=0;
    logoLayoutUndo=null;$('undoArrangeLogos').disabled=true;
    designSlots=[null,null,null];updateDesignSlots();
    panelMasks.length=0;panelNames.length=0;panelFieldMeasurements.length=0;draftPanel=[];tracingPanel=false;rulerPoints=[];measuringSpan=false;drawRuler();
    patternMoveMode=null;patternPointer=null;
    image.src=state.source;image.style.display='block';$('empty').style.display='none';
    canvas.style.aspectRatio=state.width+' / '+state.height;canvas.style.minHeight='0';
    overlays.forEach(el=>{el.style.left=el=== $('graphic')?'34%':el===$('logoGraphic')?'55%':'32%';el.style.top=el=== $('graphic')?'35%':el===$('logoGraphic')?'57%':'72%';});
    $('sourceMeta').textContent=name+' · '+kind.toUpperCase()+' · '+state.width+'×'+state.height+' px (concept)';
    refresh();updateLayoutButtons();status('Template loaded. Drag the number, sponsor, and logo.');
  }
  async function importTemplate(file) {
    if(!file)return;
    const kind=fileKind(file);
    if(!kind || file.size>MAX_FILE){status('Template must be SVG, PNG, JPG, WebP or PDF, under 15 MB');return;}
    try {
      status('Preparing template…');
      const result=kind==='pdf'?await pdfPage(file):await rasterize(file,kind,2600);
      setTemplate(result,file.name,kind);
      if(kind==='pdf' && result.pages>1)status('PDF page 1 of '+result.pages+' loaded. Use a flat licensed template; PDF is rasterized for preview.');
    }catch(err){status('Template import failed: '+err.message);}
  }
  // Original concept art is a convenient starting point, not measured panel geometry.
  // Explicit click only: never overwrite a customer's saved browser draft on page load.
  window.RaceWrapLoadConcept = async (dataUrl,carName='Late Model') => {
    if(!['Late Model','Modified','Stock Car'].includes(carName))throw Error('Unsupported car type');
    if(typeof dataUrl!=='string'||!dataUrl.startsWith('data:image/webp;base64,'))throw Error(carName+' concept image unavailable');
    const response=await fetch(dataUrl);
    const blob=await response.blob();
    if(blob.type!=='image/webp'||blob.size<300)throw Error(carName+' concept image invalid');
    // A previous design must be recoverable before replacing its template.
    if(state.source) {
      const json=JSON.stringify(project());
      if(json.length>30*1024*1024)throw Error('Current project is too large to back up. Download editable JSON before changing cars.');
      try {
        await draftAction('write',{json,savedAt:Date.now()},'previous-car');
        $('restorePrevious').disabled=false;
      }catch(err){throw Error('Cannot back up current design ('+err.message+'). Download editable JSON before switching cars.');}
    }
    const filename='RaceWrap original '+carName+' concept.webp';
    await importTemplate(new File([blob],filename,{type:'image/webp'}));
    if(state.sourceName!==filename)throw Error(carName+' concept could not be imported');
    $('body').value=carName==='Modified'?'modified':carName==='Stock Car'?'stock':'late';
    scheduleAutosave();
    $('sourceMeta').textContent+=' · Original visual concept only; NOT measured panels';
    canvas.scrollIntoView({behavior:'smooth',block:'center'});
  };
  // Use the racer's own car photograph when our generic concept artwork is not body-faithful.
  // Photos give an honest visual preview, never a verified orthographic cut template.
  window.RaceWrapLoadOwnCar = async (file,carName='Stock Car') => {
    if(!['Late Model','Modified','Stock Car'].includes(carName))throw Error('Unsupported car type');
    if(!file || !['png','jpeg','webp'].includes(fileKind(file)) || file.size>MAX_FILE)throw Error('Choose a PNG, JPG or WebP car photo under 15 MB.');
    if(state.source) {
      const json=JSON.stringify(project());
      if(json.length>30*1024*1024)throw Error('Current project is too large to back up. Download editable JSON first.');
      try {
        await draftAction('write',{json,savedAt:Date.now()},'previous-car');
        $('restorePrevious').disabled=false;
      }catch(err){throw Error('Could not back up current design. Save editable JSON before replacing the car photo.');}
    }
    await importTemplate(file);
    if(state.sourceName!==file.name)throw Error('Car photo could not be imported.');
    $('body').value=carName==='Modified'?'modified':carName==='Stock Car'?'stock':'late';
    $('sourceMeta').textContent+=' — YOUR CAR PHOTO: perspective is unverified, NOT a measured wrap template or print-ready.';
    scheduleAutosave();
    canvas.scrollIntoView({behavior:'smooth',block:'center'});
  };
  function logoItems() {
    return (state.logo?[{el:$('logoGraphic'),data:state.logo,name:state.logoName,type:state.logoType}]:[]).concat(extraLogos);
  }
  // Keep the canvas and exported SVG in the same bottom-to-top sponsor order.
  function sortedLogos() {
    return logoItems().map((item,i)=>({item,i,z:Number(item.el.style.zIndex)||20+i}))
      .sort((a,b)=>a.z-b.z||a.i-b.i);
  }
  function normalizeLogoLayers() {
    sortedLogos().forEach(({item},i)=>{item.el.style.zIndex=String(20+i);});
  }
  function updateLayerControls() {
    const order=sortedLogos(),rank=order.findIndex(({i})=>i===selectedLogo);
    $('logoBackward').disabled=rank<=0;
    $('logoForward').disabled=rank<0||rank>=order.length-1;
    $('logoLayerStatus').textContent=rank<0?'Upload a logo to adjust which sponsor appears on top.':
      'Selected logo is layer '+(rank+1)+' of '+order.length+' (higher layers appear on top).';
  }
  function renderLogoList() {
    const items=logoItems(), list=$('logoList');
    list.replaceChildren();
    items.forEach((item,i)=>{
      const btn=document.createElement('button');
      btn.type='button';btn.className='secondary';
      btn.style.cssText='padding:7px 9px;font-size:12px;border:'+(i===selectedLogo?'2px solid #ff533d':'1px solid #48546a');
      btn.textContent=(i+1)+'. '+item.name.slice(0,22);
      btn.addEventListener('click',()=>selectLogo(i));
      list.appendChild(btn);
    });
    $('downloadLogo').disabled=!items.length;$('removeLogo').disabled=!items.length;
    $('logoInfo').textContent=items.length?items.length+' logo(s) · selected: '+items[Math.min(selectedLogo,items.length-1)].name+' · PNG preview':'No logo selected';
    updateLayerControls();
    $('arrangeLogos').disabled=!state.source||!items.length;
  }
  function selectLogo(index) {
    const items=logoItems();
    selectedLogo=clamp(index,0,Math.max(0,items.length-1));
    if(items[selectedLogo]) $('logoSize').value=parseFloat(items[selectedLogo].el.style.width)||22;
    renderLogoList();
    updateSponsorSelection();
  }

  // Manual deterministic layout aid; never label this as AI.
  async function arrangeSponsorLogos() {
    const items=logoItems();
    if(!state.source||!items.length){status('Import a template and logos first.');return;}
    $('arrangeLogos').disabled=true;
    try {
      await Promise.all(items.map(item=>item.el.decode().catch(()=>{})));
      const box=canvas.getBoundingClientRect();
      if(!box.width||!box.height)throw Error('Canvas dimensions unavailable');
      const previous=items.map(item=>({el:item.el,left:item.el.style.left,top:item.el.style.top,width:item.el.style.width}));
      const split=items.length>4?Math.ceil(items.length/2):0;
      const groups=split?[items.slice(0,split),items.slice(split)]:[items];
      groups.forEach((group,row)=>{
        const slot=1/group.length, top=split?(row===0?.035:.755):.755;
        group.forEach((item,col)=>{
          const aspect=(item.el.naturalWidth||2)/(item.el.naturalHeight||1);
          const width=Math.min((slot-.04)*100,.205*box.height/box.width*aspect*100);
          const height=width/100*box.width/box.height/aspect;
          item.el.style.width=width.toFixed(3)+'%';
          item.el.style.left=((col+.5)*slot*100-width/2).toFixed(3)+'%';
          item.el.style.top=((top+(.205-height)/2)*100).toFixed(3)+'%';
        });
      });
      logoLayoutUndo=previous;$('undoArrangeLogos').disabled=false;
      selectLogo(selectedLogo);scheduleAutosave();
      status('Arranged '+items.length+' logos in editable rows; use Undo arrangement to restore positions.');
    }catch(err){status('Sponsor arrangement failed: '+err.message);}
    finally{$('arrangeLogos').disabled=!state.source||!logoItems().length;}
  }
  function undoSponsorArrangement() {
    if(!logoLayoutUndo)return;
    for(const item of logoLayoutUndo)if(item.el.isConnected){
      item.el.style.left=item.left;item.el.style.top=item.top;item.el.style.width=item.width;
    }
    logoLayoutUndo=null;$('undoArrangeLogos').disabled=true;
    selectLogo(selectedLogo);scheduleAutosave();status('Previous sponsor positions and sizes restored.');
  }
  function addExtraLogo(data,name,type,placement={}) {
    const el=document.createElement('img');
    el.id='extraLogo'+nextLogoId++;
    el.alt='Sponsor logo: '+name;
    el.draggable=false;
    el.style.cssText='position:absolute;display:none;left:'+(placement.left||'40%')+';top:'+(placement.top||'45%')+';width:'+(placement.width||'22%')+';height:auto;cursor:grab;touch-action:none;user-select:none';
    el.src=data;canvas.appendChild(el);draggable(el);
    extraLogos.push({el,data,name,type});
    el.style.zIndex=String(20+extraLogos.length);
    el.addEventListener('pointerdown',()=>selectLogo(logoItems().findIndex(item=>item.el===el)));
    return el;
  }
  function clearExtraLogos() {
    for(const item of extraLogos)item.el.remove();
    extraLogos.length=0;
  }
  async function importLogo(file) {
    if(!file)return;
    const kind=fileKind(file);
    if(!['svg','png','jpeg','webp'].includes(kind)||file.size>MAX_FILE){$('logoInfo').textContent='Use SVG, PNG, JPG or WebP under 15 MB';return;}
    if(logoItems().length>=8){status('Maximum 8 sponsor logos per concept.');return;}
    try {
      const result=await rasterize(file,kind,2400);
      logoLayoutUndo=null;$('undoArrangeLogos').disabled=true;
      if(!state.logo) {
        state.logo=result.data;state.logoName=file.name;state.logoType=kind;
        $('logoGraphic').src=state.logo;
        $('logoGraphic').style.zIndex='20';
      } else addExtraLogo(result.data,file.name,kind);
      refresh();selectLogo(logoItems().length-1);
      status('Sponsor logo '+file.name+' converted to PNG and added. '+logoItems().length+'/8 logos.');
    }catch(err){$('logoInfo').textContent='Logo import failed: '+err.message;}
  }
  function enableDrop(target,input,handler) {
    target.addEventListener('click',e=>{if(e.target!==input)input.click();});
    target.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '||e.key==='Spacebar'||e.code==='Space'||e.keyCode===32){e.preventDefault();input.click();}});
    for(const type of ['dragenter','dragover'])target.addEventListener(type,e=>{e.preventDefault();target.style.borderColor='#ff533d';});
    for(const type of ['dragleave','drop'])target.addEventListener(type,e=>{e.preventDefault();target.style.borderColor='#647c99';});
    target.addEventListener('drop',e=>{const files=Array.from(e.dataTransfer.files);if(files.length)handler(files);});
    input.addEventListener('change',e=>{const files=Array.from(e.target.files);if(files.length)handler(files);input.value='';});
  }
  enableDrop($('dropzone'),$('logo'),async files=>{for(const file of files.slice(0,8))await importLogo(file);});
  enableDrop($('templateZone'),$('template'),files=>importTemplate(files[0]));
  function draggable(el) {
    let pointer=null;
    el.addEventListener('pointerdown',e=>{
      if(!state.source||canvasLocked)return;
      pointer={id:e.pointerId,x:e.clientX,y:e.clientY,left:el.offsetLeft,top:el.offsetTop};
      el.setPointerCapture(e.pointerId);el.style.cursor='grabbing';e.preventDefault();
    });
    el.addEventListener('pointermove',e=>{
      if(!pointer || e.pointerId!==pointer.id)return;
      const box=canvas.getBoundingClientRect();
      const x=clamp(pointer.left+e.clientX-pointer.x,0,box.width-el.offsetWidth);
      const y=clamp(pointer.top+e.clientY-pointer.y,0,box.height-el.offsetHeight);
      el.style.left=percent(x,box.width)+'%';el.style.top=percent(y,box.height)+'%';
    });
    const end=()=>{if(pointer)scheduleAutosave();pointer=null;el.style.cursor='grab';};
    el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);
  }
  overlays.forEach(draggable);
  $('logoGraphic').addEventListener('pointerdown',()=>selectLogo(0));
  function parsePrompt(prompt) {
    const words=prompt.toLowerCase();
    const colors=Object.entries(palette).filter(([name])=>new RegExp('\\b'+name+'\\b').test(words));
    const number=words.match(/(?:number|#|car\s*#)\s*(\d{1,4})/);
    const pattern=words.includes('lightning')?'lightning':words.includes('checker')?'checker':words.includes('chevron')?'chevrons':words.includes('ribbon')||words.includes('wave')?'ribbons':words.includes('burst')||words.includes('sunray')?'burst':words.includes('stripe')||words.includes('slash')?'slashes':null;
    return {base:colors[0]&&colors[0][1],accent:colors[1]&&colors[1][1]||colors[0]&&colors[0][1],trim:colors[2]&&colors[2][1],number:number&&number[1],pattern};
  }
  // The small local model can return free-form design cues. Map its actual
  // response to one of our procedural patterns; this mapping is deterministic.
  function patternFromAICue(raw) {
    const cue=String(raw||'').toLowerCase().slice(0,160);
    const patterns=[
      ['lightning',/\b(lightning|electric|bolt|thunder)\b/],
      ['checker',/\b(checker|checkered|flag|grid)\b/],
      ['ribbons',/\b(ribbons?|rhythm|flow|waves?|swoosh|motion)\b/],
      ['slashes',/\b(slashes?|speed|streak|stripes?|fast)\b/],
      ['burst',/\b(burst|energy|explosion|sunburst|rays?)\b/],
      ['chevrons',/\b(chevrons?|angular|geometric|zigzag)\b/],
      ['none',/\b(none|minimal|plain|clean)\b/]
    ];
    return patterns.find(([,re])=>re.test(cue))?.[0]||null;
  }
  function applyDesign(design) {
    for(const field of ['base','accent','trim'])if(/^#[0-9a-f]{6}$/i.test(design[field]||''))$(field).value=design[field];
    if(design.number)$('number').value=String(design.number).replace(/[^a-zA-Z0-9]/g,'').slice(0,4);
    if(['none','slashes','chevrons','lightning','checker','ribbons','burst'].includes(design.pattern))$('pattern').value=design.pattern;
    if(['none','slashes','chevrons','lightning','checker','ribbons','burst'].includes(design.secondaryPattern))$('secondaryPattern').value=design.secondaryPattern;
    for(const [key,min,max] of [['patternAngle',-75,75],['patternScale',50,180],['patternOpacity',5,95],['patternX',0,100],['patternY',0,100],['secondaryX',0,100],['secondaryY',0,100],['secondaryOpacity',0,100]]) {
      if(design[key]!==undefined && design[key]!==null && design[key]!=='' && Number.isFinite(Number(design[key])))$(key).value=clamp(Number(design[key]),min,max);
    }
    refresh();
  }
  // Saved directions are actual captured style controls, not new AI inference.
  // Sponsor artwork, placement, template and panel geometry remain unchanged.
  const designSlotKeys=['numberStyle','numberScale','number','base','accent','trim','pattern','patternAngle','patternScale','patternOpacity','patternX','patternY','secondaryPattern','secondaryX','secondaryY','secondaryOpacity'];
  function updateDesignSlots() {
    const names=['A','B','C'];
    for(let i=0;i<3;i++){
      const slot=designSlots[i], load=$('slotLoad'+i), save=$('slotSave'+i);
      load.disabled=!slot;
      load.textContent=slot?'View '+names[i]:'Empty '+names[i];
      save.disabled=!state.source;
      save.textContent=slot?'Replace '+names[i]:'Save '+names[i];
    }
    $('designSlotStatus').textContent=designSlots.filter(Boolean).length+' of 3 design directions saved. Styles only; sponsor placements stay put.';
  }
  function captureDesignSlot(index) {
    if(!state.source){status('Import a licensed template before saving design directions.');return;}
    designSlots[index]=Object.fromEntries(designSlotKeys.map(key=>[key,$(key).value]));
    updateDesignSlots();scheduleAutosave();
    status('Saved design direction '+['A','B','C'][index]+'. This captures controls, not a new AI image.');
  }
  function loadDesignSlot(index) {
    const slot=designSlots[index];
    if(!state.source||!slot)return;
    applyDesign(slot);state.ai=false;
    $('styleLabel').textContent='Saved design direction';
    layoutAnchor=currentLayout();layoutChoice=0;updateLayoutButtons();
    status('Restored direction '+['A','B','C'][index]+'. Sponsor artwork and positions unchanged.');
  }
  function validatedDesignSlots(raw) {
    if(!Array.isArray(raw))return [null,null,null];
    return [0,1,2].map(i=>{
      const item=raw[i];
      if(!item||typeof item!=='object'||Array.isArray(item))return null;
      const defaults={numberStyle:'classic',numberScale:'100',secondaryPattern:'none',secondaryX:'50',secondaryY:'50',secondaryOpacity:'65'};
      const normalized={...defaults,...item};
      if(!designSlotKeys.every(key=>typeof normalized[key]==='string'&&normalized[key].length<40))return null;
      if(!['classic','speed','block'].includes(normalized.numberStyle)||!Number.isFinite(Number(normalized.numberScale))||Number(normalized.numberScale)<60||Number(normalized.numberScale)>180)return null;
      if(!['none','slashes','chevrons','lightning','checker','ribbons','burst'].includes(item.pattern))return null;
      if(!['none','slashes','chevrons','lightning','checker','ribbons','burst'].includes(normalized.secondaryPattern))return null;
      if(!['base','accent','trim'].every(key=>/^#[0-9a-f]{6}$/i.test(item[key])))return null;
      if(!/^[a-zA-Z0-9]{1,4}$/.test(item.number))return null;
      for(const [key,min,max] of [['patternAngle',-75,75],['patternScale',50,180],['patternOpacity',5,95],['patternX',0,100],['patternY',0,100],['secondaryX',0,100],['secondaryY',0,100],['secondaryOpacity',0,100]]) {
        if(!Number.isFinite(Number(normalized[key]))||Number(normalized[key])<min||Number(normalized[key])>max)return null;
      }
      return Object.fromEntries(designSlotKeys.map(key=>[key,normalized[key]]));
    });
  }
  // These are deterministic layout comparisons of the current controls, not AI-generated artwork.
  const layoutKeys=['pattern','patternAngle','patternScale','patternOpacity','patternX','patternY','secondaryPattern','secondaryX','secondaryY','secondaryOpacity'];
  function currentLayout() {
    return Object.fromEntries(layoutKeys.map(key=>[key,$(key).value]));
  }
  function updateLayoutButtons() {
    for(let i=0;i<3;i++) {
      const button=$('layout'+i);
      button.disabled=!layoutAnchor;
      button.setAttribute('aria-pressed',String(!!layoutAnchor&&layoutChoice===i));
      button.style.outline=layoutAnchor&&layoutChoice===i?'2px solid #ff806f':'';
    }
    $('layoutRebase').disabled=!state.source;
    $('layoutStatus').textContent=layoutAnchor?'Compare original styling with two procedural layout variations. Sponsor positions, numbers and colors are preserved.':'Create a design or capture current controls to compare layouts.';
  }
  function captureLayout() {
    if(!state.source){status('Import a template before comparing layouts.');return;}
    layoutAnchor=currentLayout();layoutChoice=0;updateLayoutButtons();
    status('Captured current styling. Compare three layouts without moving sponsor logos.');
    scheduleAutosave();
  }
  function chooseLayout(index) {
    if(!layoutAnchor||index<0||index>2)return;
    const a=layoutAnchor;
    const num=(key,fallback)=>Number.isFinite(Number(a[key]))?Number(a[key]):fallback;
    let design={...a};
    if(index===1)design={
      ...a,pattern:a.pattern==='ribbons'?'lightning':'ribbons',
      patternAngle:clamp(num('patternAngle',0)+25,-75,75),
      patternScale:clamp(num('patternScale',100)*1.2,50,180),
      patternOpacity:clamp(num('patternOpacity',45)+12,5,95),
      patternX:clamp(num('patternX',35)+18,0,100),
      patternY:clamp(num('patternY',50)-10,0,100)
    };
    if(index===2)design={
      ...a,pattern:a.pattern==='chevrons'?'checker':'chevrons',
      patternAngle:clamp(num('patternAngle',0)-20,-75,75),
      patternScale:clamp(num('patternScale',100)*0.8,50,180),
      patternOpacity:clamp(num('patternOpacity',45)-10,5,95),
      patternX:clamp(num('patternX',35)-18,0,100),
      patternY:clamp(num('patternY',50)+10,0,100)
    };
    layoutChoice=index;applyDesign(design);updateLayoutButtons();
    status(['Original layout restored.','Flowing layout applied.','Compact layout applied.'][index]+' Procedural variation; not AI image generation.');
  }
  async function enableLocalAI() {
    if(!navigator.gpu){$('aiStatus').textContent='WebGPU is unavailable. The rule-based editor still works.';return;}
    $('enableAI').disabled=true;
    try {
      $('aiStatus').textContent='Checking graphics hardware and loading the local AI library…';
      const adapter=await navigator.gpu.requestAdapter();
      if(!adapter)throw Error('No usable WebGPU adapter');
      const webllm=await import('https://esm.run/@mlc-ai/web-llm@0.2.88');
      const ids=new Set(webllm.prebuiltAppConfig.model_list.map(m=>m.model_id));
      const preferred=adapter.features.has('shader-f16')?[
        'SmolLM2-360M-Instruct-q4f16_1-MLC','SmolLM2-135M-Instruct-q0f16-MLC'
      ]:[
        'SmolLM2-360M-Instruct-q4f32_1-MLC','SmolLM2-135M-Instruct-q0f32-MLC'
      ];
      const model=preferred.find(id=>ids.has(id));
      if(!model)throw Error('No compatible small model found');
      $('aiStatus').textContent='Downloading '+model+' to this browser; first load may take several minutes…';
      const engine=await webllm.CreateMLCEngine(model,{
        initProgressCallback:p=>{$('aiStatus').textContent='Local AI: '+(p.text||Math.round((p.progress||0)*100)+'%');}
      });
      webLLMEngine=engine;webLLMModel=model;
      $('aiStatus').textContent='Local WebGPU AI ready: '+model+'. Model is cached in this browser.';
      $('enableAI').textContent='Local AI ready';$('styleLabel').textContent='Local AI available';
      status('Local AI is loaded. Click Create design to generate a design.');
    } catch(err) {
      $('aiStatus').textContent='Local AI unavailable: '+err.message+'. Rule-based design still works.';
      $('enableAI').disabled=false;$('enableAI').textContent='Retry local AI';
    }
  }
  function parseModelDesign(answer) {
    const text=typeof answer==='string'?answer:'';
    const match=text.match(/\{[\s\S]*\}/);
    if(!match)return false;
    const result=JSON.parse(match[0]);
    if(!result||typeof result!=='object'||Array.isArray(result))return false;
    if(!['base','accent','trim','number','pattern','patternAngle','patternScale','patternOpacity','patternX','patternY','secondaryPattern','secondaryX','secondaryY','secondaryOpacity'].some(key=>result[key]!==undefined))return false;
    applyDesign(result);return true;
  }
  async function generate() {
    const prompt=$('prompt').value.trim();
    if(!prompt){status('Describe the design first.');return;}
    $('generate').disabled=true;
    try {
      let usedAI=false, mode='';
      const instruction='Choose the best graphic pattern for this racecar wrap description: '+prompt+'. Answer with exactly one word from: lightning, checker, ribbons, slashes, burst, chevrons, none.';
      if(webLLMEngine) {
        status('Asking the local WebGPU model to suggest a graphic pattern…');
        const response=await webLLMEngine.chat.completions.create({
          messages:[{role:'system',content:'You are a dirt racing graphic designer. Reply with one pattern word only.'},{role:'user',content:instruction}],
          temperature:0.1,max_tokens:24
        });
        const modelText=response.choices?.[0]?.message?.content||'';
        const suggested=patternFromAICue(modelText);
        if(suggested) {
          applyDesign({...parsePrompt(prompt),pattern:suggested});
          usedAI=true;mode='Local AI concept cue mapped to procedural pattern; rule-based palette';
        } else console.warn('Local AI pattern response unusable; applying labeled rule-based fallback',modelText.slice(0,120));
      } else {
        const api=window.LanguageModel;
        if(api && typeof api.availability==='function') {
          const availability=await api.availability();
          if(availability==='available') {
            status('Generating with built-in on-device AI…');
            const session=await api.create({temperature:0.3,topK:3});
            try {
              const answer=await session.prompt(instruction);
              const suggestion=patternFromAICue(answer);
              if(suggestion){applyDesign({...parsePrompt(prompt),pattern:suggestion});usedAI=true;mode='Built-in AI cue mapped to procedural pattern; rule-based palette';}
            } finally {session.destroy&&session.destroy();}
          }
        }
      }
      if(!usedAI)applyDesign(parsePrompt(prompt));
      state.ai=usedAI;
      if(state.source){layoutAnchor=currentLayout();layoutChoice=0;updateLayoutButtons();}
      $('styleLabel').textContent=usedAI?mode:'Rule-based concept';
      status(usedAI?mode+' applied. Review before saving.':'Rule-based design applied. No usable AI response was available.');
    } catch(err) {
      applyDesign(parsePrompt(prompt));state.ai=false;
      if(state.source){layoutAnchor=currentLayout();layoutChoice=0;updateLayoutButtons();}
      $('styleLabel').textContent='Rule-based concept';
      status('AI generation failed ('+err.message+'). Rule-based design applied.');
    } finally {$('generate').disabled=false;}
  }
  function download(data,name,mime) {
    const url=URL.createObjectURL(new Blob([data],{type:mime}));
    const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),5000);
  }
  function overlayMarkup(el,fontSize) {
    if(el.style.display==='none')return '';
    const left=parseFloat(el.style.left)||0,top=parseFloat(el.style.top)||0;
    const x=left/100*state.width,y=top/100*state.height;
    const isNumber=el===$('graphic'), t=numberTreatment();
    const font=fontSize*state.width/1000*(isNumber?t.scale:1);
    const attrs=isNumber?' font-style="'+(t.italic?'italic':'normal')+'" stroke="'+safe($('trim').value)+'" stroke-width="'+(t.stroke*state.width/1000).toFixed(2)+'" paint-order="stroke fill"':'';
    return '<text x="'+x.toFixed(2)+'" y="'+(isNumber?y:y+font).toFixed(2)+'"'+(isNumber?' dominant-baseline="text-before-edge"':'')+' font-family="Arial,sans-serif" font-weight="900" font-size="'+font.toFixed(2)+'" fill="'+safe(getComputedStyle(el).color)+'"'+attrs+'>'+safe(el.textContent)+'</text>';
  }
  function conceptSVG() {
    if(!state.source)return '';
    const width=state.width,height=state.height;
    const pattern=$('patternLayer').innerHTML.replace(/<svg[^>]*>/,'').replace(/<\/svg>\s*$/,'');
    const patternSvg=$('pattern').value==='none'&&$('secondaryPattern').value==='none'?'':'<g opacity="'+(Number($('patternOpacity').value)/100)+'" transform="scale('+(width/1000)+' '+(height/550)+')">'+pattern+'</g>';
    let markup='<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'" viewBox="0 0 '+width+' '+height+'">';
    markup+='<image href="'+state.source+'" width="'+width+'" height="'+height+'"/>'+patternSvg;
    markup+=overlayMarkup($('graphic'),75)+overlayMarkup($('sponsorGraphic'),26);
    for(const {item} of sortedLogos()) {
      const el=item.el;
      if(el.style.display==='none')continue;
      const x=(parseFloat(el.style.left)||0)*width/100,y=(parseFloat(el.style.top)||0)*height/100;
      const w=(parseFloat(el.style.width)||22)*width/100;
      const h=el.naturalWidth>0?w*el.naturalHeight/el.naturalWidth:w;
      markup+='<image href="'+item.data+'" x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'"/>';
    }
    markup+='</svg>';
    return markup;
  }
  function exportSVG() {
    const markup=conceptSVG();
    if(!markup){status('Import a licensed template first.');return;}
    download(markup,'racewrap-concept.svg','image/svg+xml');
    status('Concept SVG downloaded. Not scaled for print or panel cut paths.');
  }
  // Raster preview for sharing on phones; this is NOT a print-size export.
  async function exportPNG() {
    if(!state.source){status('Import a licensed template first.');return;}
    const button=$('savePNG');
    button.disabled=true;
    let svgUrl='';
    try {
      status('Preparing PNG concept preview…');
      const markup=conceptSVG();
      svgUrl=URL.createObjectURL(new Blob([markup],{type:'image/svg+xml;charset=utf-8'}));
      const preview=await loadImageURL(svgUrl);
      const ratio=Math.min(1,2400/Math.max(state.width,state.height));
      const output=document.createElement('canvas');
      output.width=Math.max(1,Math.round(state.width*ratio));
      output.height=Math.max(1,Math.round(state.height*ratio));
      const ctx=output.getContext('2d');
      if(!ctx)throw Error('Canvas unavailable');
      ctx.drawImage(preview,0,0,output.width,output.height);
      const png=await new Promise((resolve,reject)=>output.toBlob(blob=>blob?resolve(blob):reject(Error('PNG encoding failed')),'image/png'));
      const url=URL.createObjectURL(png);
      const a=document.createElement('a');
      a.href=url;a.download='racewrap-concept-preview.png';
      document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),5000);
      status('PNG concept preview downloaded ('+output.width+' × '+output.height+' px). Not print-ready.');
    } catch(err) {
      status('PNG preview failed: '+err.message+'. Download concept SVG or editable project instead.');
    } finally {
      if(svgUrl)URL.revokeObjectURL(svgUrl);
      button.disabled=false;
    }
  }
  // A client-facing concept board; source resolution and geometry remain unverified.
  async function exportBoard() {
    if(!state.source){status('Import a licensed template first.');return;}
    const button=$('saveBoard');button.disabled=true;
    let sourceURL='';
    try {
      status('Preparing presentation board...');
      sourceURL=URL.createObjectURL(new Blob([conceptSVG()],{type:'image/svg+xml;charset=utf-8'}));
      const preview=await loadImageURL(sourceURL);
      const canvas=document.createElement('canvas');canvas.width=2000;canvas.height=1400;
      const ctx=canvas.getContext('2d');
      if(!ctx)throw Error('Canvas unavailable');
      ctx.fillStyle='#0b1220';ctx.fillRect(0,0,2000,1400);
      const text=(value,x,y,size,color='#f3f6fc',max=1800)=>{
        ctx.font='700 '+size+'px Arial,sans-serif';ctx.fillStyle=color;
        ctx.fillText(String(value).replace(/[\r\n]/g,' '),x,y,max);
      };
      ctx.fillStyle=$('accent').value;ctx.fillRect(80,75,8,140);
      text('RACEWRAP / CONCEPT PRESENTATION',115,110,24,'#a9b9d0');
      text('#'+$('number').value+'  '+($('sponsor').value||'Wrap design direction'),115,178,52);
      text('Current editable design / Client review',115,220,24,'#a9b9d0');
      ctx.fillStyle='#e9edf3';ctx.fillRect(80,270,1840,830);
      const scale=Math.min(1740/state.width,730/state.height);
      const w=state.width*scale,h=state.height*scale;
      ctx.drawImage(preview,80+(1840-w)/2,270+(830-h)/2,w,h);
      text('COLOR DIRECTION',80,1160,22,'#a9b9d0');
      ['base','accent','trim'].forEach((id,i)=>{
        const x=80+i*320;ctx.fillStyle=$(id).value;ctx.fillRect(x,1190,72,56);
        text($(id).value.toUpperCase(),x+90,1227,27);
      });
      text('VISUAL CONCEPT ONLY - NOT PRINT-READY',80,1320,26,'#f5c879');
      text('Source resolution '+state.width+' x '+state.height+' px / Panel geometry and physical fitment unverified',80,1360,21,'#a9b9d0');
      const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('PNG encoding failed')),'image/png'));
      const url=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url;a.download='racewrap-presentation-board.png';document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),5000);
      status('Presentation board downloaded (2000 x 1400 px). Visual concept only. Not print-ready.');
    } catch(err){status('Presentation board failed: '+err.message);}
    finally {if(sourceURL)URL.revokeObjectURL(sourceURL);button.disabled=false;}
  }
  function project() {
    const fields={};
    for(const id of ['numberStyle','numberScale','prompt','body','number','base','accent','trim','sponsor','px','inch','pattern','patternOpacity','patternAngle','patternScale','patternX','patternY','secondaryPattern','secondaryX','secondaryY','secondaryOpacity','logoSize'])fields[id]=$(id).value;
    const positions={};
    for(const el of overlays)positions[el.id]={left:el.style.left,top:el.style.top,width:el.style.width,zIndex:el.style.zIndex};
    return {version:2,fields,positions,layoutComparison:layoutAnchor?{anchor:layoutAnchor,choice:layoutChoice}:null,designSlots:designSlots.map(slot=>slot?{...slot}:null),template:{data:state.source,name:state.sourceName,type:state.sourceType,width:state.width,height:state.height},logo:{data:state.logo,name:state.logoName,type:state.logoType},extraLogos:extraLogos.map(item=>({data:item.data,name:item.name,type:item.type,left:item.el.style.left,top:item.el.style.top,width:item.el.style.width,zIndex:item.el.style.zIndex})),panelMasks:panelMasks.map(p=>p.map(([x,y])=>[x,y])),panelNames:panelNames.slice(),panelFieldMeasurements:panelFieldMeasurements.map(entry=>({width:validFieldInches(entry?.width),height:validFieldInches(entry?.height)})),rulerPoints:rulerPoints.map(([x,y])=>[x,y])};
  }
  function saveProject() {
    if(!state.source){status('Import a template before saving a project.');return;}
    download(JSON.stringify(project()),'racewrap-project.json','application/json');
    status('Editable project downloaded. Keep the JSON file to resume later.');
  }
  async function shareProject() {
    if(!state.source){status('Import a licensed template before sharing a project.');return;}
    const json=JSON.stringify(project());
    const file=new File([json],'racewrap-project.json',{type:'application/json'});
    // Native file sharing works only on supporting secure-context browsers; never upload a project to a server.
    if(!navigator.share || !navigator.canShare || !navigator.canShare({files:[file]})) {
      download(json,file.name,file.type);
      status('File sharing is unavailable on this device. Editable project JSON downloaded instead.');
      return;
    }
    const button=$('shareProject');
    button.disabled=true;
    try {
      await navigator.share({title:'RaceWrap AI editable project',files:[file]});
      status('Editable project sent to the device share sheet. Save the JSON file to reopen it elsewhere.');
    } catch(err) {
      if(err.name==='AbortError')status('Sharing cancelled. Your design remains in the editor.');
      else {
        download(json,file.name,file.type);
        status('Device sharing failed. Editable project JSON downloaded instead.');
      }
    } finally {button.disabled=false;}
  }
  async function loadProject(file) {
    if(!file || file.size>20*1024*1024){status('Project must be under 20 MB');return;}
    try {
      const obj=JSON.parse(await file.text());
      if(obj.version!==2||!obj.template||!/^data:image\/(?:png|jpeg|webp);base64,/i.test(obj.template.data))throw Error('Unsupported project');
      if(obj.template.data.length>18*1024*1024)throw Error('Template too large');
      logoLayoutUndo=null;$('undoArrangeLogos').disabled=true;
      clearExtraLogos();state.logo='';state.logoName='';state.logoType='';$('logoGraphic').src='';$('logoGraphic').style.zIndex='20';
      for(const [key,value] of Object.entries({numberStyle:'classic',numberScale:'100',secondaryPattern:'none',secondaryX:'50',secondaryY:'50',secondaryOpacity:'65',...(obj.fields||{})}))if($(key)&&typeof value==='string'&&value.length<3000)$(key).value=value;
      setTemplate({data:obj.template.data,width:Number(obj.template.width),height:Number(obj.template.height)},String(obj.template.name||'Restored template').slice(0,100),obj.template.type||'png');
      if(obj.logo&&/^data:image\/png;base64,/.test(obj.logo.data||'')) {
        state.logo=obj.logo.data;state.logoName=obj.logo.name||'';state.logoType=obj.logo.type||'png';
        $('logoGraphic').src=state.logo;$('logoInfo').textContent=state.logoName+' · restored';
        $('downloadLogo').disabled=false;$('removeLogo').disabled=false;
      }
      for(const entry of (Array.isArray(obj.extraLogos)?obj.extraLogos.slice(0,7):[])) {
        if(!entry||!/^data:image\/png;base64,/.test(entry.data||'')||entry.data.length>12*1024*1024)continue;
        const pct=v=>typeof v==='string'&&/^\d+(?:\.\d+)?%$/.test(v)&&parseFloat(v)<=100?v:undefined;
        const el=addExtraLogo(entry.data,String(entry.name||'Sponsor').slice(0,100),String(entry.type||'png'),{left:pct(entry.left),top:pct(entry.top),width:pct(entry.width)});
        if(Number.isInteger(Number(entry.zIndex))&&Number(entry.zIndex)>=20&&Number(entry.zIndex)<=27)el.style.zIndex=String(entry.zIndex);
      }
      for(const [id,pos] of Object.entries(obj.positions||{}))if(overlays.some(el=>el.id===id)&&pos&&/^\d+(?:\.\d+)?%$/.test(pos.left)&&/^\d+(?:\.\d+)?%$/.test(pos.top)){$(id).style.left=pos.left;$(id).style.top=pos.top;if(typeof pos.width==='string'&&/^\d+(?:\.\d+)?%$/.test(pos.width)&&parseFloat(pos.width)<=100)$(id).style.width=pos.width;}
      if(!obj.positions?.logoGraphic?.width)$('logoGraphic').style.width=$('logoSize').value+'%';
      const primaryLayer=Number(obj.positions?.logoGraphic?.zIndex);
      if(Number.isInteger(primaryLayer)&&primaryLayer>=20&&primaryLayer<=27)$('logoGraphic').style.zIndex=String(primaryLayer);
      normalizeLogoLayers();
      if(Array.isArray(obj.panelMasks))for(const p of obj.panelMasks.slice(0,12)) {
        if(Array.isArray(p)&&p.length>=3&&p.length<=60&&p.every(point=>Array.isArray(point)&&point.length===2&&point.every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1))){panelMasks.push(p);const name=Array.isArray(obj.panelNames)?obj.panelNames[panelNames.length]:'';panelNames.push(typeof name==='string'&&name.trim()?name.trim().slice(0,50):'Panel '+panelMasks.length);const field=Array.isArray(obj.panelFieldMeasurements)?obj.panelFieldMeasurements[panelFieldMeasurements.length]:null;panelFieldMeasurements.push({width:validFieldInches(field?.width),height:validFieldInches(field?.height)});}
      }
      if(Array.isArray(obj.rulerPoints)&&obj.rulerPoints.length===2&&obj.rulerPoints.every(p=>Array.isArray(p)&&p.length===2&&p.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1)))rulerPoints=obj.rulerPoints.map(p=>p.slice());
      layoutAnchor=null;layoutChoice=0;
      const comparison=obj.layoutComparison;
      if(comparison&&comparison.anchor&&typeof comparison.anchor==='object') {
        const legacyAnchor={secondaryPattern:'none',secondaryX:'50',secondaryY:'50',secondaryOpacity:'65',...comparison.anchor};
        if(layoutKeys.every(k=>typeof legacyAnchor[k]==='string'&&legacyAnchor[k].length<30))
          layoutAnchor=Object.fromEntries(layoutKeys.map(k=>[k,legacyAnchor[k]]));
        layoutChoice=[0,1,2].includes(comparison.choice)?comparison.choice:0;
      }
      designSlots=validatedDesignSlots(obj.designSlots);
      updateDesignSlots();updateLayoutButtons();refresh();selectLogo(0);status('Editable project restored with '+logoItems().length+' sponsor logo(s).');
      return true;
    } catch(err){status('Project load failed: '+err.message);return false;}
  }
  $('rulerOverlay').addEventListener('pointerdown',e=>{
    if(!measuringSpan||!state.source)return;
    const box=canvas.getBoundingClientRect();
    rulerPoints.push([clamp((e.clientX-box.left)/box.width,0,1),clamp((e.clientY-box.top)/box.height,0,1)]);
    if(rulerPoints.length===2){
      const units=Math.hypot((rulerPoints[1][0]-rulerPoints[0][0])*state.width,(rulerPoints[1][1]-rulerPoints[0][1])*state.height);
      if(units>=2){$('px').value=units.toFixed(2);measuringSpan=false;calibrate();scheduleAutosave();status('Reference ruler calibrated. Verify actual measured span; not a print-fitment measurement.');}
      else rulerPoints.pop();
    }
    drawRuler();e.preventDefault();
  });
  $('measureSpan').addEventListener('click',()=>{
    if(!state.source){status('Import a licensed template before using the reference ruler.');return;}
    measuringSpan=!measuringSpan;
    if(measuringSpan){patternMoveMode=null;patternPointer=null;updatePatternMoveUI();rulerPoints=[];tracingPanel=false;draftPanel=[];drawPanelOverlay();}
    drawRuler();
  });
  $('clearSpan').addEventListener('click',()=>{rulerPoints=[];measuringSpan=false;drawRuler();scheduleAutosave();});
  function calibrate() {
    const units=Number($('px').value),inches=Number($('inch').value);
    $('calibration').textContent=units>0&&inches>0?'Reference: '+(units/inches).toFixed(3)+' image px/in · canvas approx '+(state.width/(units/inches)||0).toFixed(1)+' × '+(state.height/(units/inches)||0).toFixed(1)+' in including margins; NOT print-fitment':'Enter positive reference measurements in pixels and inches';
    drawRuler();
  }
  for(const id of ['number','base','accent','trim','sponsor','pattern','patternOpacity','patternAngle','patternScale','patternX','patternY','secondaryPattern','secondaryX','secondaryY','secondaryOpacity'])$(id).addEventListener('input',refresh);
  for(const id of ['prompt','body','px','inch','logoSize'])$(id).addEventListener('input',scheduleAutosave);
  for(const id of ['px','inch'])$(id).addEventListener('input',calibrate);
  $('logoSize').addEventListener('input',()=>{const item=logoItems()[selectedLogo];if(item)item.el.style.width=$('logoSize').value+'%';});
  $('arrangeLogos').addEventListener('click',arrangeSponsorLogos);
  $('undoArrangeLogos').addEventListener('click',undoSponsorArrangement);
  for(const [button,direction] of [['logoBackward',-1],['logoForward',1]]) {
    $(button).addEventListener('click',()=>{
      const order=sortedLogos(),rank=order.findIndex(({i})=>i===selectedLogo);
      const other=order[rank+direction];
      if(rank<0||!other)return;
      const current=order[rank].item.el;
      const old=current.style.zIndex;
      current.style.zIndex=other.item.el.style.zIndex;
      other.item.el.style.zIndex=old;
      normalizeLogoLayers();renderLogoList();scheduleAutosave();
      status('Sponsor stacking order updated. Higher layers cover lower layers.');
    });
  }
  // Small, accessible tap targets for accurate positioning on touch devices.
  for(const [id,axis,step] of [['logoLeft','left',-1],['logoRight','left',1],['logoUp','top',-1],['logoDown','top',1]]) {
    $(id).addEventListener('click',()=>{
      const item=logoItems()[selectedLogo];
      if(!item||!state.source){status('Add a sponsor logo and body template first.');return;}
      const el=item.el, current=parseFloat(el.style[axis])||0;
      const max=axis==='left'?Math.max(0,100-(parseFloat(el.style.width)||22)):100;
      el.style[axis]=clamp(current+step,0,max)+'%';
      scheduleAutosave();
      status('Sponsor logo moved '+(step<0?'back':'forward')+' 1% along '+axis+'.');
    });
  }

  $('panelOverlay').addEventListener('pointerdown',e=>{
    if(!tracingPanel||!state.source)return;
    const box=canvas.getBoundingClientRect();
    draftPanel.push([clamp((e.clientX-box.left)/box.width,0,1),clamp((e.clientY-box.top)/box.height,0,1)]);
    drawPanelOverlay();e.preventDefault();
  });
  $('tracePanel').addEventListener('click',()=>{
    if(!state.source){status('Import a licensed body template before tracing panels.');return;}
    tracingPanel=!tracingPanel;draftPanel=[];if(tracingPanel){patternMoveMode=null;patternPointer=null;updatePatternMoveUI();measuringSpan=false;drawRuler();}drawPanelOverlay();
  });
  $('finishPanel').addEventListener('click',()=>{
    const issue=polygonIssue(draftPanel);
    if(issue){status('Panel rejected: '+issue+'. Undo a point and retrace.');return;}
    panelMasks.push(draftPanel);
    panelNames.push($('panelName').value.trim().slice(0,50)||'Panel '+panelMasks.length);
    panelFieldMeasurements.push({width:null,height:null});
    $('panelName').value='';
    draftPanel=[];tracingPanel=false;drawPattern();drawPanelOverlay();
    scheduleAutosave();status('Artwork mask added. This is not a production cut path.');
  });
  $('undoPoint').addEventListener('click',()=>{draftPanel.pop();drawPanelOverlay();});
  $('clearPanels').addEventListener('click',()=>{panelMasks.length=0;panelNames.length=0;panelFieldMeasurements.length=0;draftPanel=[];drawPattern();drawPanelOverlay();scheduleAutosave();});
  $('enableAI').addEventListener('click',enableLocalAI);
  $('canvasLock').addEventListener('click',()=>{if(!canvasLocked){patternMoveMode=null;patternPointer=null;}setCanvasLocked(!canvasLocked);});
  $('layoutRebase').addEventListener('click',captureLayout);
  for(let i=0;i<3;i++){
    $('slotSave'+i).addEventListener('click',()=>captureDesignSlot(i));
    $('slotLoad'+i).addEventListener('click',()=>loadDesignSlot(i));
  }
  for(let i=0;i<3;i++)$('layout'+i).addEventListener('click',()=>chooseLayout(i));
  const promptPresets={
    classic:'Traditional dirt late model race wrap, deep black base, bright red lightning graphics, white trim, bold number 17, sponsor logos kept legible.',
    modern:'Modern dirt late model race wrap, dark blue base, silver flowing ribbons and sharp white accents, bold number 17, clean space for sponsors.',
    retro:'Retro dirt late model throwback wrap, orange base, cream chevron graphics, black accents, classic number 17, high-contrast sponsor placement.'
  };
  document.querySelectorAll('[data-prompt-preset]').forEach(button=>button.addEventListener('click',()=>{
    const preset=promptPresets[button.dataset.promptPreset];
    if(!preset)return;
    $('prompt').value=preset;
    $('prompt').focus();
    status('Starting prompt loaded. Edit it or select Create design. This preset is not AI-generated.');
  }));
  $('generate').addEventListener('click',generate);
  $('surprise').addEventListener('click',()=>{$('prompt').value='Blue and silver dirt late model number 21 with bold lightning graphics';generate();});
  $('save').addEventListener('click',exportSVG);
  $('savePNG').addEventListener('click',exportPNG);
  $('saveBoard').addEventListener('click',exportBoard);
  $('exportPanelReport').addEventListener('click',exportPanelReference);
  $('saveProject').addEventListener('click',saveProject);
  $('saveDraftNow').addEventListener('click',async()=>{
    clearTimeout(draftTimer);
    const button=$('saveDraftNow');
    button.disabled=true;
    $('autosaveStatus').textContent='Saving browser draft…';
    try {
      const saved=await persistDraft();
      if(saved)status('Browser draft saved after storage transaction completed. Download editable JSON for a portable backup.');
    } finally {button.disabled=!state.source;}
  });
  $('shareProject').addEventListener('click',shareProject);
  $('restorePrevious').addEventListener('click',async()=>{
    const button=$('restorePrevious');button.disabled=true;
    try{
      const backup=await draftAction('read',undefined,'previous-car');
      if(!backup?.json)throw Error('No previous car design backup found');
      const restored=await loadProject(new File([backup.json],'racewrap-previous-car.json',{type:'application/json'}));
      if(!restored)throw Error('Previous project could not be restored');
      await draftAction('delete',undefined,'previous-car');
      $('autosaveStatus').textContent='Previous car design restored. Save editable JSON to keep a portable copy.';
      status('Previous car design restored, including logos, masks and design controls.');
    }catch(err){status('Restore previous car failed: '+err.message);button.disabled=false;}
  });
  $('openProject').addEventListener('change',e=>loadProject(e.target.files[0]));
  $('downloadLogo').addEventListener('click',()=>{const item=logoItems()[selectedLogo];if(item){const a=document.createElement('a');a.href=item.data;a.download='sponsor-'+(selectedLogo+1)+'-normalized.png';a.click();}});
  $('removeLogo').addEventListener('click',()=>{
    logoLayoutUndo=null;$('undoArrangeLogos').disabled=true;
    if(!logoItems().length)return;
    if(selectedLogo===0&&state.logo) {
      const next=extraLogos.shift();
      if(next) {
        state.logo=next.data;state.logoName=next.name;state.logoType=next.type;
        $('logoGraphic').src=next.data;
        for(const prop of ['left','top','width'])$('logoGraphic').style[prop]=next.el.style[prop];
        $('logoGraphic').style.zIndex=next.el.style.zIndex;
        next.el.remove();
      } else {state.logo='';state.logoName='';state.logoType='';$('logoGraphic').src='';}
    } else {
      const index=selectedLogo-(state.logo?1:0);
      const item=extraLogos.splice(index,1)[0];if(item)item.el.remove();
    }
    normalizeLogoLayers();refresh();selectLogo(Math.min(selectedLogo,logoItems().length-1));
    status('Sponsor logo removed. '+logoItems().length+' remaining.');
  });
  $('recoverDraft').addEventListener('click',async()=>{
    try {
      clearTimeout(draftTimer);
      const draft=await draftAction('read');
      if(!draft?.json)throw Error('No saved draft found');
      const file=new File([draft.json],'racewrap-autosave.json',{type:'application/json'});
      await loadProject(file);
      $('autosaveStatus').textContent='Browser draft restored. Continue editing or download the project JSON.';
    }catch(err){$('autosaveStatus').textContent='Draft recovery failed: '+err.message;}
  });
  $('clearDraft').addEventListener('click',async()=>{
    clearTimeout(draftTimer);
    try {await draftAction('delete');$('recoverDraft').disabled=true;$('clearDraft').disabled=true;$('autosaveStatus').textContent='Browser draft cleared. Current canvas remains open.';}
    catch(err){$('autosaveStatus').textContent='Cannot clear draft: '+err.message;}
  });

  // Editor-only selection chrome. Exports enumerate artwork explicitly, so these
  // controls never become part of a concept PNG, SVG or saved project.
  const sponsorFrame=document.createElement('div');
  sponsorFrame.id='sponsorSelection';
  sponsorFrame.style.cssText='position:absolute;display:none;pointer-events:none;border:2px solid #45dcff;box-sizing:border-box;z-index:45';
  const resizeHandle=document.createElement('button');
  resizeHandle.id='sponsorResize';resizeHandle.type='button';
  resizeHandle.setAttribute('aria-label','Resize selected sponsor. Drag corner or use arrow keys; Shift for larger steps.');
  resizeHandle.title='Drag to resize sponsor ? Arrow keys for precision ? Escape to cancel';
  resizeHandle.textContent='?';
  resizeHandle.style.cssText='position:absolute;right:-10px;bottom:-10px;width:36px;height:36px;min-height:0;padding:0;border:2px solid #071822;border-radius:9px;background:#45dcff;color:#071822;font-size:24px;line-height:28px;pointer-events:auto;touch-action:none;cursor:nwse-resize';
  sponsorFrame.appendChild(resizeHandle);canvas.appendChild(sponsorFrame);
  const resizeHelp=document.createElement('p');
  resizeHelp.className='muted';resizeHelp.textContent='Select a sponsor on the car, then drag its cyan corner to resize. Arrow keys resize precisely; Escape cancels a drag.';
  $('logoSize').parentElement.appendChild(resizeHelp);
  let sponsorResize=null;
  function updateSponsorSelection() {
    const item=logoItems()[selectedLogo],el=item?.el;
    const visible=!!(state.source&&el&&el.complete&&el.naturalWidth&&!canvasLocked&&!tracingPanel&&!measuringSpan&&!patternMoveMode);
    const display=visible?'block':'none';
    if(sponsorFrame.style.display!==display)sponsorFrame.style.display=display;
    if(!visible)return;
    for(const [key,value] of Object.entries({left:el.offsetLeft+'px',top:el.offsetTop+'px',width:el.offsetWidth+'px',height:el.offsetHeight+'px'}))
      if(sponsorFrame.style[key]!==value)sponsorFrame.style[key]=value;
  }
  function resizeSponsor(el,width) {
    const box=canvas.getBoundingClientRect();
    const ratio=el.naturalHeight/el.naturalWidth;
    // Keep the top-left anchored and preserve the image aspect ratio, within
    // the artwork bounds. Existing slider/import placements remain compatible.
    const max=Math.max(0,Math.min(Number($('logoSize').max)||100,
      (box.width-el.offsetLeft)/box.width*100,
      (box.height-el.offsetTop)/(box.width*ratio)*100));
    const min=Math.min(Number($('logoSize').min)||1,max);
    const value=clamp(width,min,max);
    el.style.width=value.toFixed(3)+'%';$('logoSize').value=String(value);
    updateSponsorSelection();
  }
  resizeHandle.addEventListener('pointerdown',e=>{
    if(e.pointerType==='mouse'&&e.button!==0)return;
    const el=logoItems()[selectedLogo]?.el;
    if(!el||canvasLocked)return;
    const box=canvas.getBoundingClientRect(),ratio=el.naturalHeight/el.naturalWidth;
    sponsorResize={id:e.pointerId,el,x:e.clientX,y:e.clientY,width:el.style.width,start:parseFloat(el.style.width),canvasWidth:box.width,ratio};
    resizeHandle.setPointerCapture(e.pointerId);e.preventDefault();e.stopPropagation();
  });
  resizeHandle.addEventListener('pointermove',e=>{
    const r=sponsorResize;if(!r||e.pointerId!==r.id)return;
    // Project motion onto the aspect-ratio diagonal: either axis can resize.
    const delta=((e.clientX-r.x)+r.ratio*(e.clientY-r.y))/(1+r.ratio*r.ratio);
    resizeSponsor(r.el,r.start+delta/r.canvasWidth*100);e.preventDefault();
  });
  function finishSponsorResize(cancel=false) {
    const r=sponsorResize;if(!r)return;
    sponsorResize=null;
    if(cancel){r.el.style.width=r.width;$('logoSize').value=String(parseFloat(r.width));}
    if(resizeHandle.hasPointerCapture(r.id))resizeHandle.releasePointerCapture(r.id);
    updateSponsorSelection();scheduleAutosave();
    status(cancel?'Sponsor resize cancelled.':'Sponsor resized. Position and proportions preserved.');
  }
  resizeHandle.addEventListener('pointerup',()=>finishSponsorResize());
  resizeHandle.addEventListener('pointercancel',()=>finishSponsorResize(true));
  resizeHandle.addEventListener('lostpointercapture',()=>finishSponsorResize(true));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&sponsorResize){e.preventDefault();finishSponsorResize(true);}});
  resizeHandle.addEventListener('keydown',e=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
    e.preventDefault();const el=logoItems()[selectedLogo]?.el;if(!el||canvasLocked)return;
    resizeSponsor(el,parseFloat(el.style.width)+(e.shiftKey?5:1)*(['ArrowLeft','ArrowUp'].includes(e.key)?-1:1));scheduleAutosave();
  });
  new ResizeObserver(updateSponsorSelection).observe(canvas);
  new MutationObserver(records=>{
    if(records.some(r=>r.target!==sponsorFrame&&r.target!==resizeHandle))updateSponsorSelection();
  }).observe(canvas,{attributes:true,attributeFilter:['style','src'],childList:true,subtree:true});
  canvas.addEventListener('load',updateSponsorSelection,true);

  // Session-only full-project history. Image data strings are shared between snapshots.
  const history = [];
  let historyIndex = -1, historyTimer, restoringHistory = false;
  const historyBar = document.createElement('div');
  historyBar.className = 'actions';
  historyBar.style.marginBottom = '12px';
  historyBar.innerHTML = '<button type="button" class="secondary" id="undoDesign" disabled>Undo edit</button><button type="button" class="secondary" id="redoDesign" disabled>Redo edit</button><span id="historyStatus" class="muted" role="status">Session history starts when a car is loaded. Up to 30 edits.</span>';
  document.querySelector('.preview-head').insertAdjacentElement('afterend', historyBar);
  function updateHistory() {
    $('undoDesign').disabled = restoringHistory || historyIndex < 1;
    $('redoDesign').disabled = restoringHistory || historyIndex >= history.length - 1;
    if (history.length) $('historyStatus').textContent = 'Session edit ' + (historyIndex + 1) + ' of ' + history.length + '. Download JSON to keep your current design.';
  }
  function captureHistory() {
    clearTimeout(historyTimer);
    if (restoringHistory || !state.source) return;
    const snapshot = project();
    if (historyIndex >= 0 && JSON.stringify(history[historyIndex]) === JSON.stringify(snapshot)) return;
    history.splice(historyIndex + 1);
    history.push(snapshot);
    if (history.length > 30) history.shift();
    historyIndex = history.length - 1;
    updateHistory();
  }
  queueHistory = () => {
    if (restoringHistory || !state.source) return;
    if (historyIndex < 0) { clearTimeout(historyTimer); historyTimer = setTimeout(captureHistory, 0); return; }
    clearTimeout(historyTimer);
    historyTimer = setTimeout(captureHistory, 350);
  };
  async function travelHistory(delta) {
    if (restoringHistory) return;
    captureHistory();
    const target = historyIndex + delta;
    if (target < 0 || target >= history.length) return;
    restoringHistory = true; updateHistory();
    try {
      const restored = await loadProject(new File([JSON.stringify(history[target])], 'session-history.json', {type:'application/json'}));
      if (restored) {
        historyIndex = target;
        status(delta < 0 ? 'Edit undone. Redo is available.' : 'Edit redone.');
      }
    } finally { restoringHistory = false; updateHistory(); }
  }
  $('undoDesign').addEventListener('click', () => travelHistory(-1));
  $('redoDesign').addEventListener('click', () => travelHistory(1));
  // Preserve native text-field undo while offering familiar canvas shortcuts.
  document.addEventListener('keydown', event => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
    const key = event.key.toLowerCase();
    if (key === 'z' || key === 'y') {
      event.preventDefault(); travelHistory(key === 'y' || event.shiftKey ? 1 : -1);
    }
  });

  checkDraft();
  $('aiStatus').textContent=navigator.gpu?'Optional local WebGPU AI available to download, or use rule-based styling now.':window.LanguageModel?'Built-in browser AI may be available.':'Local WebGPU AI unavailable here; rule-based styling works.';
  calibrate();refresh();renderLogoList();updateLayoutButtons();updateDesignSlots();
})();