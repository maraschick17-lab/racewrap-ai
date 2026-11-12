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
    $('patternLayer').style.display=ready&&$('pattern').value!=='none'?'block':'none';
    drawPattern();
  }
  function drawPattern() {
    const layer=$('patternLayer'), style=$('pattern').value, accent=$('accent').value, trim=$('trim').value;
    let shapes='';
    if(style==='slashes') shapes='<polygon points="90,420 320,90 390,90 160,420" fill="'+accent+'"/><polygon points="180,420 410,90 450,90 220,420" fill="'+trim+'"/>';
    if(style==='chevrons') shapes='<path d="M30 390 L300 95 L390 95 L125 390 Z M180 390 L450 95 L495 95 L230 390 Z" fill="'+accent+'"/>';
    if(style==='lightning') shapes='<path d="M50 400 L350 90 L260 260 L440 230 L130 460 L230 300 Z" fill="'+accent+'" stroke="'+trim+'" stroke-width="9"/>';
    if(style==='checker') {for(let r=0;r<3;r++)for(let c=0;c<8;c++)if((r+c)%2===0)shapes+='<rect x="'+(60+c*46)+'" y="'+(300+r*46)+'" width="46" height="46" fill="'+accent+'"/>';}
    layer.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 550" preserveAspectRatio="none" width="100%" height="100%">'+shapes+'</svg>';
    layer.style.opacity=String(Number($('patternOpacity').value)/100);
  }
  function setTemplate(result,name,kind) {
    state.source=result.data;state.width=result.width;state.height=result.height;state.sourceName=name;state.sourceType=kind;
    image.src=state.source;image.style.display='block';$('empty').style.display='none';
    canvas.style.aspectRatio=state.width+' / '+state.height;canvas.style.minHeight='0';
    overlays.forEach(el=>{el.style.left=el=== $('graphic')?'34%':el===$('logoGraphic')?'55%':'32%';el.style.top=el=== $('graphic')?'35%':el===$('logoGraphic')?'57%':'72%';});
    $('sourceMeta').textContent=name+' · '+kind.toUpperCase()+' · '+state.width+'×'+state.height+' px (concept)';
    refresh();status('Template loaded. Drag the number, sponsor, and logo.');
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
  async function importLogo(file) {
    if(!file)return;
    const kind=fileKind(file);
    if(!['svg','png','jpeg','webp'].includes(kind)||file.size>MAX_FILE){$('logoInfo').textContent='Use SVG, PNG, JPG or WebP under 15 MB';return;}
    try {
      const result=await rasterize(file,kind,2400);
      state.logo=result.data;state.logoName=file.name;state.logoType=kind;
      $('logoGraphic').src=state.logo;
      $('logoInfo').textContent=file.name+' · '+kind.toUpperCase()+' → PNG · '+result.width+'×'+result.height+' px';
      $('downloadLogo').disabled=false;$('removeLogo').disabled=false;
      if(kind==='jpeg') $('logoInfo').textContent+=' · JPG background remains opaque';
      refresh();status('Sponsor logo normalized and ready to position.');
    }catch(err){$('logoInfo').textContent='Logo import failed: '+err.message;}
  }
  function enableDrop(target,input,handler) {
    target.addEventListener('click',e=>{if(e.target!==input)input.click();});
    target.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();input.click();}});
    for(const type of ['dragenter','dragover'])target.addEventListener(type,e=>{e.preventDefault();target.style.borderColor='#ff533d';});
    for(const type of ['dragleave','drop'])target.addEventListener(type,e=>{e.preventDefault();target.style.borderColor='#647c99';});
    target.addEventListener('drop',e=>{if(e.dataTransfer.files[0])handler(e.dataTransfer.files[0]);});
    input.addEventListener('change',e=>{if(e.target.files[0])handler(e.target.files[0]);});
  }
  enableDrop($('dropzone'),$('logo'),importLogo);
  enableDrop($('templateZone'),$('template'),importTemplate);
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
    const end=()=>{pointer=null;el.style.cursor='grab';};
    el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);
  }
  overlays.forEach(draggable);
  function parsePrompt(prompt) {
    const words=prompt.toLowerCase();
    const colors=Object.entries(palette).filter(([name])=>new RegExp('\\b'+name+'\\b').test(words));
    const number=words.match(/(?:number|#|car\s*#)\s*(\d{1,4})/);
    const pattern=words.includes('lightning')?'lightning':words.includes('checker')?'checker':words.includes('chevron')?'chevrons':words.includes('stripe')||words.includes('slash')?'slashes':null;
    return {base:colors[0]&&colors[0][1],accent:colors[1]&&colors[1][1]||colors[0]&&colors[0][1],trim:colors[2]&&colors[2][1],number:number&&number[1],pattern};
  }
  function applyDesign(design) {
    for(const field of ['base','accent','trim'])if(/^#[0-9a-f]{6}$/i.test(design[field]||''))$(field).value=design[field];
    if(design.number)$('number').value=String(design.number).replace(/[^a-zA-Z0-9]/g,'').slice(0,4);
    if(['none','slashes','chevrons','lightning','checker'].includes(design.pattern))$('pattern').value=design.pattern;
    refresh();
  }
  async function generate() {
    const prompt=$('prompt').value.trim();
    if(!prompt){status('Describe the design first.');return;}
    $('generate').disabled=true;
    try {
      let usedAI=false;
      const api=window.LanguageModel;
      if(api && typeof api.availability==='function') {
        const availability=await api.availability();
        if(availability==='available') {
          status('Generating with on-device browser AI…');
          const session=await api.create({temperature:0.3,topK:3});
          try {
            const answer=await session.prompt('You are a racecar wrap design assistant. Return ONLY a JSON object with keys base, accent, trim (hex RGB colors), number (1-4 characters), and pattern (one of none, slashes, chevrons, lightning, checker). User request: '+prompt);
            const match=answer.match(/\{[\s\S]*\}/);
            if(match){applyDesign(JSON.parse(match[0]));usedAI=true;}
          } finally {session.destroy&&session.destroy();}
        }
      }
      if(!usedAI)applyDesign(parsePrompt(prompt));
      state.ai=usedAI;
      $('styleLabel').textContent=usedAI?'On-device AI design':'Rule-based concept';
      status(usedAI?'On-device AI generated design controls. Review before saving.':'Rule-based design applied. This browser has no available on-device AI model.');
    } catch(err) {
      applyDesign(parsePrompt(prompt));state.ai=false;$('styleLabel').textContent='Rule-based concept';
      status('On-device AI unavailable ('+err.message+'). Rule-based design applied.');
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
    if(state.logo && $('logoGraphic').style.display!=='none') {
      const el=$('logoGraphic'),x=(parseFloat(el.style.left)||0)*width/100,y=(parseFloat(el.style.top)||0)*height/100;
      const w=(parseFloat(el.style.width)||22)*width/100;
      markup+='<image href="'+state.logo+'" x="'+x+'" y="'+y+'" width="'+w+'" height="'+(w*el.naturalHeight/el.naturalWidth||w)+'"/>';
    }
    markup+='</svg>';
    download(markup,'racewrap-concept.svg','image/svg+xml');
    status('Concept SVG downloaded. Not scaled for print or panel cut paths.');
  }
  function project() {
    const fields={};
    for(const id of ['prompt','body','number','base','accent','trim','sponsor','px','inch','pattern','patternOpacity','logoSize'])fields[id]=$(id).value;
    const positions={};
    for(const el of overlays)positions[el.id]={left:el.style.left,top:el.style.top};
    return {version:2,fields,positions,template:{data:state.source,name:state.sourceName,type:state.sourceType,width:state.width,height:state.height},logo:{data:state.logo,name:state.logoName,type:state.logoType}};
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
      for(const [key,value] of Object.entries(obj.fields||{}))if($(key)&&typeof value==='string'&&value.length<3000)$(key).value=value;
      setTemplate({data:obj.template.data,width:Number(obj.template.width),height:Number(obj.template.height)},String(obj.template.name||'Restored template').slice(0,100),obj.template.type||'png');
      if(obj.logo&&/^data:image\/png;base64,/.test(obj.logo.data||'')) {
        state.logo=obj.logo.data;state.logoName=obj.logo.name||'';state.logoType=obj.logo.type||'png';
        $('logoGraphic').src=state.logo;$('logoInfo').textContent=state.logoName+' · restored';
        $('downloadLogo').disabled=false;$('removeLogo').disabled=false;
      }
      for(const [id,pos] of Object.entries(obj.positions||{}))if(overlays.some(el=>el.id===id)&&pos&&/^\d+(?:\.\d+)?%$/.test(pos.left)&&/^\d+(?:\.\d+)?%$/.test(pos.top)){$(id).style.left=pos.left;$(id).style.top=pos.top;}
      refresh();status('Editable project restored.');
    } catch(err){status('Project load failed: '+err.message);}
  }
  function calibrate() {
    const units=Number($('px').value),inches=Number($('inch').value);
    $('calibration').textContent=units>0&&inches>0?'Reference scale: '+(units/inches).toFixed(3)+' template units/in · unverified for print':'Enter positive measurements for reference calibration';
  }
  for(const id of ['number','base','accent','trim','sponsor','pattern','patternOpacity'])$(id).addEventListener('input',refresh);
  for(const id of ['px','inch'])$(id).addEventListener('input',calibrate);
  $('logoSize').addEventListener('input',()=>{$('logoGraphic').style.width=$('logoSize').value+'%';});
  $('generate').addEventListener('click',generate);
  $('surprise').addEventListener('click',()=>{$('prompt').value='Blue and silver dirt late model number 21 with bold lightning graphics';generate();});
  $('save').addEventListener('click',exportSVG);
  $('saveProject').addEventListener('click',saveProject);
  $('openProject').addEventListener('change',e=>loadProject(e.target.files[0]));
  $('downloadLogo').addEventListener('click',()=>{if(state.logo){const a=document.createElement('a');a.href=state.logo;a.download='sponsor-logo-normalized.png';a.click();}});
  $('removeLogo').addEventListener('click',()=>{state.logo='';state.logoName='';$('logoGraphic').src='';$('logoInfo').textContent='No logo selected';$('downloadLogo').disabled=true;$('removeLogo').disabled=true;$('logo').value='';refresh();});
  $('aiStatus').textContent=window.LanguageModel?'On-device AI may be available on this browser':'On-device AI unavailable here; rule-based fallback';
  calibrate();refresh();
})();