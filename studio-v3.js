'use strict';
/* RaceWrap AI concept editor. No backend, no paid services, no production cut files. */
(() => {
  const $ = id => document.getElementById(id);
  const status = message => { $('status').textContent = message; };
  const state = { source:'', sourceType:'', sourceName:'', width:0, height:0, logo:'', logoName:'', logoType:'', pattern:'slashes', ai:false };
  const palette = {black:'#16191e',white:'#f2f4f7',red:'#e52e2e',blue:'#247ee8',green:'#25b96e',orange:'#f77922',purple:'#9b50e4',yellow:'#e8bc25',gold:'#d8a83e',silver:'#c9d2da',gray:'#737e8a'};
  const MAX_FILE = 15*1024*1024;
  const canvas = $('canvas');
  const image = $('bodyImage');
  const overlays = [$('graphic'),$('sponsorGraphic'),$('logoGraphic')];
  const extraLogos = [];
  $('logoGraphic').style.zIndex='20';
  let selectedLogo = 0, nextLogoId = 1;
  const panelMasks = [];
  const panelNames = [];
  let draftPanel = [], tracingPanel = false;
  let rulerPoints = [], measuringSpan = false;
  let webLLMEngine = null, webLLMModel = '';
  let draftTimer = null;
  let layoutAnchor = null, layoutChoice = 0;
  let designSlots = [null,null,null];
  const DRAFT_DB = 'racewrap-concept-drafts';
  function openDraftDB() {
    return new Promise((resolve,reject)=>{
      if(!window.indexedDB)return reject(Error('Browser storage unavailable'));
      const req=indexedDB.open(DRAFT_DB,1);
      req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('drafts'))req.result.createObjectStore('drafts');};
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||Error('Storage unavailable'));
    });
  }
  async function draftAction(mode,value) {
    const db=await openDraftDB();
    try {
      return await new Promise((resolve,reject)=>{
        const tx=db.transaction('drafts',mode==='read'?'readonly':'readwrite');
        const store=tx.objectStore('drafts');
        const req=mode==='read'?store.get('latest'):mode==='delete'?store.delete('latest'):store.put(value,'latest');
        req.onsuccess=()=>resolve(req.result);
        req.onerror=()=>reject(req.error||Error('Draft operation failed'));
        tx.onerror=()=>reject(tx.error||Error('Storage failed'));
      });
    } finally {db.close();}
  }
  function scheduleAutosave() {
    if(!state.source)return;
    clearTimeout(draftTimer);
    draftTimer=setTimeout(async()=>{
      try {
        const json=JSON.stringify(project());
        if(json.length>30*1024*1024)throw Error('Project exceeds 30 MB browser autosave limit');
        const savedAt=Date.now();
        await draftAction('write',{json,savedAt});
        $('autosaveStatus').textContent='Draft saved in this browser at '+new Date(savedAt).toLocaleTimeString()+'.';
        $('recoverDraft').disabled=false;$('clearDraft').disabled=false;
      } catch(err){$('autosaveStatus').textContent='Autosave unavailable: '+err.message+'. Download project JSON instead.';}
    },1300);
  }
  async function checkDraft() {
    try {
      const draft=await draftAction('read');
      if(draft&&draft.json) {
        $('recoverDraft').disabled=false;$('clearDraft').disabled=false;
        $('autosaveStatus').textContent='Saved browser draft found ('+new Date(draft.savedAt).toLocaleString()+'). Restore it to continue.';
      } else $('autosaveStatus').textContent='Autosave will start after you import a template.';
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
    await new Promise((resolve,reject)=>{im.onload=resolve;im.onerror=()=>reject(Error('Image cannot be decoded'));im.src=url;});
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
    const pdfjs=await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
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
    $('graphic').style.webkitTextStroke='2px '+$('trim').value;
    $('sponsorGraphic').textContent=$('sponsor').value.trim();
    $('graphic').style.display=ready?'block':'none';
    $('sponsorGraphic').style.display=ready&&!!$('sponsor').value.trim()?'block':'none';
    $('logoGraphic').style.display=ready&&!!state.logo?'block':'none';
    for (const item of extraLogos) item.el.style.display=ready?'block':'none';
    $('patternLayer').style.display=ready&&$('pattern').value!=='none'?'block':'none';
    drawPattern();drawPanelOverlay();drawRuler();scheduleAutosave();
  }
  function drawPattern() {
    const layer=$('patternLayer'), style=$('pattern').value, accent=$('accent').value, trim=$('trim').value;
    let shapes='';
    if(style==='slashes') shapes='<polygon points="90,420 320,90 390,90 160,420" fill="'+accent+'"/><polygon points="180,420 410,90 450,90 220,420" fill="'+trim+'"/>';
    if(style==='chevrons') shapes='<path d="M30 390 L300 95 L390 95 L125 390 Z M180 390 L450 95 L495 95 L230 390 Z" fill="'+accent+'"/>';
    if(style==='lightning') shapes='<path d="M50 400 L350 90 L260 260 L440 230 L130 460 L230 300 Z" fill="'+accent+'" stroke="'+trim+'" stroke-width="9"/>';
    if(style==='checker') {for(let r=0;r<3;r++)for(let c=0;c<8;c++)if((r+c)%2===0)shapes+='<rect x="'+(60+c*46)+'" y="'+(300+r*46)+'" width="46" height="46" fill="'+accent+'"/>';}
    if(style==='ribbons') {for(let i=0;i<6;i++)shapes+='<path d="M'+(25+i*32)+' 450 Q'+(150+i*32)+' 260 '+(280+i*32)+' 70" fill="none" stroke="'+(i%2?trim:accent)+'" stroke-width="'+(i%2?12:22)+'" stroke-linecap="round"/>';}
    if(style==='burst') {for(let i=0;i<9;i++){const a=(-72+i*18)*Math.PI/180,b=a+0.13;shapes+='<path d="M120 380 L'+(120+420*Math.cos(a)).toFixed(1)+' '+(380+420*Math.sin(a)).toFixed(1)+' L'+(120+420*Math.cos(b)).toFixed(1)+' '+(380+420*Math.sin(b)).toFixed(1)+' Z" fill="'+(i%2?trim:accent)+'"/>';}}
    const angle=clamp(Number($('patternAngle').value)||0,-75,75),scale=clamp(Number($('patternScale').value)||100,50,180)/100;
    const dx=(clamp(Number($('patternX').value)||0,0,100)-35)*10,dy=(clamp(Number($('patternY').value)||0,0,100)-50)*5.5;
    shapes='<g transform="translate('+dx.toFixed(2)+' '+dy.toFixed(2)+') translate(270 280) rotate('+angle+') scale('+scale+') translate(-270 -280)">'+shapes+'</g>';
    const masks=panelMasks.map(p=>'<polygon points="'+p.map(([x,y])=>(x*1000).toFixed(2)+','+(y*550).toFixed(2)).join(' ')+'"/>').join('');
    const clipped=panelMasks.length?'<defs><clipPath id="racewrapPanelClip">'+masks+'</clipPath></defs><g clip-path="url(#racewrapPanelClip)">'+shapes+'</g>':shapes;
    layer.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 550" preserveAspectRatio="none" width="100%" height="100%">'+clipped+'</svg>';
    layer.style.opacity=String(Number($('patternOpacity').value)/100);
  }
  function drawPanelOverlay() {
    const el=$('panelOverlay'), points=p=>p.map(([x,y])=>(x*1000).toFixed(2)+','+(y*550).toFixed(2)).join(' ');
    let svg=panelMasks.map(p=>'<polygon points="'+points(p)+'" fill="#ff533d" fill-opacity=".10" stroke="#ff533d" stroke-width="2" stroke-dasharray="8 5"/>').join('');
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
    $('finishPanel').disabled=draftPanel.length<3;
    $('undoPoint').disabled=!draftPanel.length;
    $('clearPanels').disabled=!panelMasks.length&&!draftPanel.length;
    $('panelStatus').textContent=tracingPanel?'Tracing: '+draftPanel.length+' point(s). Click panel corners; finish with at least 3.':panelMasks.length?panelMasks.length+' artwork mask(s) active. Pattern is clipped to traced regions.':'No artwork masks. Pattern covers the full template.';
  }
  function updatePanelMeasurements() {
    const container=$('panelDimensions');
    if(!container)return;
    container.replaceChildren();
    const scale=Number($('px').value)/Number($('inch').value);
    const calibrated=rulerPoints.length===2 && Number.isFinite(scale) && scale>0;
    panelMasks.forEach((points,i)=>{
      const row=document.createElement('div');
      row.style.cssText='border-top:1px solid #42536a;padding:9px 0;font-size:12px;color:#cbd5e1';
      const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
      const w=(Math.max(...xs)-Math.min(...xs))*state.width;
      const h=(Math.max(...ys)-Math.min(...ys))*state.height;
      let area=0;
      for(let j=0;j<points.length;j++){const a=points[j],b=points[(j+1)%points.length];area+=a[0]*b[1]-b[0]*a[1];}
      area=Math.abs(area)*state.width*state.height/2;
      const label=(panelNames[i]||'Panel '+(i+1)).slice(0,50);
      row.textContent=label+' · '+points.length+' corners · '+(calibrated?('approx '+(w/scale).toFixed(1)+' × '+(h/scale).toFixed(1)+' in bounding box, '+(area/(scale*scale)).toFixed(1)+' in² traced area'):'use the two-point ruler for approximate dimensions');
      container.appendChild(row);
    });
    if(!panelMasks.length)container.textContent='Trace a panel to see its approximate measured bounds.';
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
    designSlots=[null,null,null];updateDesignSlots();
    panelMasks.length=0;panelNames.length=0;draftPanel=[];tracingPanel=false;rulerPoints=[];measuringSpan=false;drawRuler();
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
  }
  function selectLogo(index) {
    const items=logoItems();
    selectedLogo=clamp(index,0,Math.max(0,items.length-1));
    if(items[selectedLogo]) $('logoSize').value=parseFloat(items[selectedLogo].el.style.width)||22;
    renderLogoList();
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
    target.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();input.click();}});
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
      if(!state.source)return;
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
  function applyDesign(design) {
    for(const field of ['base','accent','trim'])if(/^#[0-9a-f]{6}$/i.test(design[field]||''))$(field).value=design[field];
    if(design.number)$('number').value=String(design.number).replace(/[^a-zA-Z0-9]/g,'').slice(0,4);
    if(['none','slashes','chevrons','lightning','checker','ribbons','burst'].includes(design.pattern))$('pattern').value=design.pattern;
    for(const [key,min,max] of [['patternAngle',-75,75],['patternScale',50,180],['patternOpacity',5,95],['patternX',0,100],['patternY',0,100]]) {
      if(design[key]!==undefined && design[key]!==null && design[key]!=='' && Number.isFinite(Number(design[key])))$(key).value=clamp(Number(design[key]),min,max);
    }
    refresh();
  }
  // Saved directions are actual captured style controls, not new AI inference.
  // Sponsor artwork, placement, template and panel geometry remain unchanged.
  const designSlotKeys=['number','base','accent','trim','pattern','patternAngle','patternScale','patternOpacity','patternX','patternY'];
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
      if(!designSlotKeys.every(key=>typeof item[key]==='string'&&item[key].length<40))return null;
      if(!['none','slashes','chevrons','lightning','checker','ribbons','burst'].includes(item.pattern))return null;
      if(!['base','accent','trim'].every(key=>/^#[0-9a-f]{6}$/i.test(item[key])))return null;
      if(!/^[a-zA-Z0-9]{1,4}$/.test(item.number))return null;
      for(const [key,min,max] of [['patternAngle',-75,75],['patternScale',50,180],['patternOpacity',5,95],['patternX',0,100],['patternY',0,100]]) {
        if(!Number.isFinite(Number(item[key]))||Number(item[key])<min||Number(item[key])>max)return null;
      }
      return Object.fromEntries(designSlotKeys.map(key=>[key,item[key]]));
    });
  }
  // These are deterministic layout comparisons of the current controls, not AI-generated artwork.
  const layoutKeys=['pattern','patternAngle','patternScale','patternOpacity','patternX','patternY'];
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
    if(!['base','accent','trim','number','pattern','patternAngle','patternScale','patternOpacity','patternX','patternY'].some(key=>result[key]!==undefined))return false;
    applyDesign(result);return true;
  }
  async function generate() {
    const prompt=$('prompt').value.trim();
    if(!prompt){status('Describe the design first.');return;}
    $('generate').disabled=true;
    try {
      let usedAI=false, mode='';
      const instruction='You are a racecar wrap design assistant. Return ONLY a JSON object with keys base, accent, trim (hex RGB colors), number (1-4 characters), pattern (one of none, slashes, chevrons, lightning, checker, ribbons, burst), patternAngle (degrees -75 to 75), patternScale (percent 50 to 180), patternOpacity (percent 5 to 95), patternX (horizontal position 0 to 100), patternY (vertical position 0 to 100). Make a cohesive racecar composition with balanced visual weight and legible sponsor logos. No other text. User request: '+prompt;
      if(webLLMEngine) {
        status('Generating with locally loaded WebGPU AI…');
        const response=await webLLMEngine.chat.completions.create({
          messages:[{role:'system',content:'Return only a compact JSON object describing racecar wrap styling.'},{role:'user',content:instruction}],
          temperature:0.2,max_tokens:220
        });
        usedAI=parseModelDesign(response.choices?.[0]?.message?.content||'');
        if(usedAI)mode='Local WebGPU AI design';
      } else {
        const api=window.LanguageModel;
        if(api && typeof api.availability==='function') {
          const availability=await api.availability();
          if(availability==='available') {
            status('Generating with built-in on-device AI…');
            const session=await api.create({temperature:0.3,topK:3});
            try {
              const answer=await session.prompt(instruction);
              usedAI=parseModelDesign(answer);
              if(usedAI)mode='Built-in browser AI design';
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
    const font=fontSize*state.width/1000;
    return '<text x="'+x.toFixed(2)+'" y="'+(y+font).toFixed(2)+'" font-family="Arial,sans-serif" font-weight="900" font-size="'+font.toFixed(2)+'" fill="'+safe(getComputedStyle(el).color)+'">'+safe(el.textContent)+'</text>';
  }
  function exportSVG() {
    if(!state.source){status('Import a licensed template first.');return;}
    const width=state.width,height=state.height;
    const pattern=$('patternLayer').innerHTML.replace(/<svg[^>]*>/,'').replace(/<\/svg>\s*$/,'');
    const patternSvg=$('pattern').value==='none'?'':'<g opacity="'+(Number($('patternOpacity').value)/100)+'" transform="scale('+(width/1000)+' '+(height/550)+')">'+pattern+'</g>';
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
    download(markup,'racewrap-concept.svg','image/svg+xml');
    status('Concept SVG downloaded. Not scaled for print or panel cut paths.');
  }
  function project() {
    const fields={};
    for(const id of ['prompt','body','number','base','accent','trim','sponsor','px','inch','pattern','patternOpacity','patternAngle','patternScale','patternX','patternY','logoSize'])fields[id]=$(id).value;
    const positions={};
    for(const el of overlays)positions[el.id]={left:el.style.left,top:el.style.top,width:el.style.width,zIndex:el.style.zIndex};
    return {version:2,fields,positions,layoutComparison:layoutAnchor?{anchor:layoutAnchor,choice:layoutChoice}:null,designSlots:designSlots.map(slot=>slot?{...slot}:null),template:{data:state.source,name:state.sourceName,type:state.sourceType,width:state.width,height:state.height},logo:{data:state.logo,name:state.logoName,type:state.logoType},extraLogos:extraLogos.map(item=>({data:item.data,name:item.name,type:item.type,left:item.el.style.left,top:item.el.style.top,width:item.el.style.width,zIndex:item.el.style.zIndex})),panelMasks:panelMasks.map(p=>p.map(([x,y])=>[x,y])),panelNames:panelNames.slice(),rulerPoints:rulerPoints.map(([x,y])=>[x,y])};
  }
  function saveProject() {
    if(!state.source){status('Import a template before saving a project.');return;}
    download(JSON.stringify(project()),'racewrap-project.json','application/json');
    status('Editable project downloaded. Keep the JSON file to resume later.');
  }
  async function loadProject(file) {
    if(!file || file.size>20*1024*1024){status('Project must be under 20 MB');return;}
    try {
      const obj=JSON.parse(await file.text());
      if(obj.version!==2||!obj.template||!/^data:image\/png;base64,/.test(obj.template.data))throw Error('Unsupported project');
      if(obj.template.data.length>18*1024*1024)throw Error('Template too large');
      clearExtraLogos();state.logo='';state.logoName='';state.logoType='';$('logoGraphic').src='';$('logoGraphic').style.zIndex='20';
      for(const [key,value] of Object.entries(obj.fields||{}))if($(key)&&typeof value==='string'&&value.length<3000)$(key).value=value;
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
        if(Array.isArray(p)&&p.length>=3&&p.length<=60&&p.every(point=>Array.isArray(point)&&point.length===2&&point.every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1))){panelMasks.push(p);const name=Array.isArray(obj.panelNames)?obj.panelNames[panelNames.length]:'';panelNames.push(typeof name==='string'&&name.trim()?name.trim().slice(0,50):'Panel '+panelMasks.length);}
      }
      if(Array.isArray(obj.rulerPoints)&&obj.rulerPoints.length===2&&obj.rulerPoints.every(p=>Array.isArray(p)&&p.length===2&&p.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1)))rulerPoints=obj.rulerPoints.map(p=>p.slice());
      layoutAnchor=null;layoutChoice=0;
      const comparison=obj.layoutComparison;
      if(comparison&&comparison.anchor&&typeof comparison.anchor==='object'&&
        layoutKeys.every(k=>typeof comparison.anchor[k]==='string'&&comparison.anchor[k].length<30)) {
        layoutAnchor=Object.fromEntries(layoutKeys.map(k=>[k,comparison.anchor[k]]));
        layoutChoice=[0,1,2].includes(comparison.choice)?comparison.choice:0;
      }
      designSlots=validatedDesignSlots(obj.designSlots);
      updateDesignSlots();updateLayoutButtons();refresh();selectLogo(0);status('Editable project restored with '+logoItems().length+' sponsor logo(s).');
    } catch(err){status('Project load failed: '+err.message);}
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
    if(measuringSpan){rulerPoints=[];tracingPanel=false;draftPanel=[];drawPanelOverlay();}
    drawRuler();
  });
  $('clearSpan').addEventListener('click',()=>{rulerPoints=[];measuringSpan=false;drawRuler();scheduleAutosave();});
  function calibrate() {
    const units=Number($('px').value),inches=Number($('inch').value);
    $('calibration').textContent=units>0&&inches>0?'Reference: '+(units/inches).toFixed(3)+' image px/in · canvas approx '+(state.width/(units/inches)||0).toFixed(1)+' × '+(state.height/(units/inches)||0).toFixed(1)+' in including margins; NOT print-fitment':'Enter positive reference measurements in pixels and inches';
    drawRuler();
  }
  for(const id of ['number','base','accent','trim','sponsor','pattern','patternOpacity','patternAngle','patternScale','patternX','patternY'])$(id).addEventListener('input',refresh);
  for(const id of ['prompt','body','px','inch','logoSize'])$(id).addEventListener('input',scheduleAutosave);
  for(const id of ['px','inch'])$(id).addEventListener('input',calibrate);
  $('logoSize').addEventListener('input',()=>{const item=logoItems()[selectedLogo];if(item)item.el.style.width=$('logoSize').value+'%';});
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
    tracingPanel=!tracingPanel;draftPanel=[];if(tracingPanel){measuringSpan=false;drawRuler();}drawPanelOverlay();
  });
  $('finishPanel').addEventListener('click',()=>{
    if(draftPanel.length<3)return;
    panelMasks.push(draftPanel);
    panelNames.push($('panelName').value.trim().slice(0,50)||'Panel '+panelMasks.length);
    $('panelName').value='';
    draftPanel=[];tracingPanel=false;drawPattern();drawPanelOverlay();
    scheduleAutosave();status('Artwork mask added. This is not a production cut path.');
  });
  $('undoPoint').addEventListener('click',()=>{draftPanel.pop();drawPanelOverlay();});
  $('clearPanels').addEventListener('click',()=>{panelMasks.length=0;panelNames.length=0;draftPanel=[];drawPattern();drawPanelOverlay();scheduleAutosave();});
  $('enableAI').addEventListener('click',enableLocalAI);
  $('layoutRebase').addEventListener('click',captureLayout);
  for(let i=0;i<3;i++){
    $('slotSave'+i).addEventListener('click',()=>captureDesignSlot(i));
    $('slotLoad'+i).addEventListener('click',()=>loadDesignSlot(i));
  }
  for(let i=0;i<3;i++)$('layout'+i).addEventListener('click',()=>chooseLayout(i));
  $('generate').addEventListener('click',generate);
  $('surprise').addEventListener('click',()=>{$('prompt').value='Blue and silver dirt late model number 21 with bold lightning graphics';generate();});
  $('save').addEventListener('click',exportSVG);
  $('saveProject').addEventListener('click',saveProject);
  $('openProject').addEventListener('change',e=>loadProject(e.target.files[0]));
  $('downloadLogo').addEventListener('click',()=>{const item=logoItems()[selectedLogo];if(item){const a=document.createElement('a');a.href=item.data;a.download='sponsor-'+(selectedLogo+1)+'-normalized.png';a.click();}});
  $('removeLogo').addEventListener('click',()=>{
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
  checkDraft();
  $('aiStatus').textContent=navigator.gpu?'Optional local WebGPU AI available to download, or use rule-based styling now.':window.LanguageModel?'Built-in browser AI may be available.':'Local WebGPU AI unavailable here; rule-based styling works.';
  calibrate();refresh();renderLogoList();updateLayoutButtons();updateDesignSlots();
})();