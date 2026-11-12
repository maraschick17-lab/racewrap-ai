'use strict';
/* Original, procedural style directions; these swatches are not car-body templates or AI-generated imagery. */
document.addEventListener('DOMContentLoaded',()=>{
  const anchor=document.querySelector('.quick-workflow');
  if(!anchor)return;
  const styles=[
    {id:'voltage',name:'BLACKOUT VOLTAGE',tag:'HIGH IMPACT',description:'Electric red / carbon black',base:'#111722',accent:'#f02c3e',trim:'#f7f7f4',pattern:'lightning',secondary:'checker',angle:'-25',scale:'125',opacity:'85',secondaryOpacity:'42',x:'44',y:'51'},
    {id:'velocity',name:'BLUE VELOCITY',tag:'MODERN',description:'Cobalt / ice / white',base:'#0b2552',accent:'#00b5ec',trim:'#eaf9ff',pattern:'ribbons',secondary:'slashes',angle:'20',scale:'140',opacity:'85',secondaryOpacity:'40',x:'47',y:'50'},
    {id:'throwback',name:'SUNSET THROWBACK',tag:'RETRO',description:'Burnt orange / cream / black',base:'#f4772d',accent:'#1c1c23',trim:'#fff2d2',pattern:'chevrons',secondary:'checker',angle:'-15',scale:'115',opacity:'80',secondaryOpacity:'48',x:'44',y:'50'},
    {id:'apex',name:'NEON APEX',tag:'NIGHT RACE',description:'Acid lime / charcoal / white',base:'#191d22',accent:'#b9f73b',trim:'#f5f8f1',pattern:'slashes',secondary:'burst',angle:'-35',scale:'135',opacity:'90',secondaryOpacity:'35',x:'48',y:'50'}
  ];
  const section=document.createElement('section');section.className='rw-gallery';section.id='designDirections';section.setAttribute('aria-labelledby','rw-gallery-heading');
  const style=document.createElement('style');style.textContent=`
  .rw-gallery{margin:26px 0 18px;padding:24px;border:1px solid #334258;border-radius:20px;background:linear-gradient(145deg,#172336,#0c131e 65%);box-shadow:0 22px 50px #050a1366}
  .rw-gallery-header{display:flex;align-items:end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:18px}.rw-gallery h2{margin:5px 0 0;font-size:clamp(23px,2.8vw,34px);letter-spacing:-.9px;color:#fff}.rw-gallery-eyebrow{font-size:11px;font-weight:900;letter-spacing:2px;color:#79b8ff}.rw-gallery-lede{margin:0;max-width:460px;font-size:13px;color:#b3c4db}
  .rw-gallery-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.rw-gallery-card{min-width:0;overflow:hidden;padding:0;border:1px solid #43536b;border-radius:14px;background:#131e2c;text-align:left;transition:transform .15s,border-color .15s,box-shadow .15s;cursor:pointer;color:white}.rw-gallery-card:hover{transform:translateY(-3px);border-color:#a3caff}.rw-gallery-card:focus-visible{outline:3px solid #a3caff;outline-offset:3px}.rw-gallery-card[aria-pressed=true]{border:2px solid #71b4ff;box-shadow:0 0 0 2px #71b4ff44}
  .rw-gallery-art{height:142px;position:relative;overflow:hidden;isolation:isolate;background:var(--base)}.rw-gallery-art:before{content:'';position:absolute;inset:-45%;background:repeating-linear-gradient(112deg,transparent 0 18px,var(--accent) 18px 38px,transparent 38px 63px,var(--trim) 63px 70px,transparent 70px 100px);transform:translateX(12%) skewX(-14deg);clip-path:polygon(0 12%,100% 0,80% 100%,0 83%);opacity:.96}.rw-gallery-art:after{content:'';position:absolute;inset:0;background:linear-gradient(0deg,#090e1e55,transparent 70%);pointer-events:none}.rw-gallery-art[data-style=velocity]:before{background:repeating-linear-gradient(155deg,transparent 0 23px,var(--accent) 23px 50px,var(--trim) 50px 55px,transparent 55px 88px);transform:rotate(-7deg)}.rw-gallery-art[data-style=throwback]:before{background:repeating-linear-gradient(130deg,var(--accent) 0 15px,var(--trim) 15px 22px,transparent 22px 65px);transform:skewX(18deg)}.rw-gallery-art[data-style=apex]:before{background:repeating-linear-gradient(145deg,transparent 0 28px,var(--accent) 28px 40px,var(--trim) 40px 45px,transparent 45px 68px);transform:rotate(12deg)}
  .rw-gallery-number{position:absolute;z-index:1;right:18px;bottom:10px;font:italic 900 74px/1 Impact,'Arial Black',sans-serif;letter-spacing:-6px;color:var(--trim);-webkit-text-stroke:2px var(--base);filter:drop-shadow(4px 5px 0 #000a)}.rw-gallery-tag{position:absolute;z-index:1;top:12px;left:12px;background:#080d17c9;border:1px solid #ffffff44;border-radius:20px;padding:5px 9px;font-size:10px;letter-spacing:1.2px;font-weight:900}.rw-gallery-info{padding:14px 14px 16px}.rw-gallery-name{display:block;font-size:14px;letter-spacing:.6px;font-weight:900}.rw-gallery-description{display:block;font-size:12px;color:#aebdd0;margin-top:5px}.rw-gallery-palette{display:flex;gap:5px;margin-top:12px}.rw-gallery-palette i{width:27px;height:7px;border-radius:3px;border:1px solid #ffffff4d}
  .rw-gallery-footer{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-top:15px}.rw-gallery-status{font-size:12px;color:#b5c8dd}.rw-gallery-status strong{color:#fff}.rw-gallery-footnote{font-size:11px;color:#94a8bf}
  @media(max-width:1050px){.rw-gallery-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:580px){.rw-gallery{padding:14px;margin:18px 0}.rw-gallery-grid{gap:9px}.rw-gallery-art{height:110px}.rw-gallery-number{font-size:56px}.rw-gallery-info{padding:11px}.rw-gallery-name{font-size:12px}.rw-gallery-description{font-size:11px}.rw-gallery-tag{font-size:8px}}
  `;
  document.head.appendChild(style);
  section.innerHTML='<div class="rw-gallery-header"><div><span class="rw-gallery-eyebrow">WRAP LAB / START WITH A LOOK</span><h2 id="rw-gallery-heading">Choose a race-ready design direction.</h2></div><p class="rw-gallery-lede">Four bold, editable procedural starting points. Load a car, pick a look, then drag graphics and add your sponsors.</p></div><div class="rw-gallery-grid" role="group" aria-label="Wrap design directions"></div><div class="rw-gallery-footer"><span class="rw-gallery-status" role="status" aria-live="polite">Choose a style to apply colors and graphic layers.</span><span class="rw-gallery-footnote">Original abstract style previews — not car renders, AI images, or print-ready layouts.</span></div>';
  const grid=section.querySelector('.rw-gallery-grid');
  for(const preset of styles){
    const button=document.createElement('button');button.type='button';button.className='rw-gallery-card';button.dataset.design=preset.id;button.setAttribute('aria-pressed','false');
    button.style.setProperty('--base',preset.base);button.style.setProperty('--accent',preset.accent);button.style.setProperty('--trim',preset.trim);
    button.innerHTML='<div class="rw-gallery-art" data-style="'+preset.id+'"><span class="rw-gallery-tag">'+preset.tag+'</span><span class="rw-gallery-number" aria-hidden="true">17</span></div><div class="rw-gallery-info"><span class="rw-gallery-name">'+preset.name+'</span><span class="rw-gallery-description">'+preset.description+'</span><span class="rw-gallery-palette"><i style="background:'+preset.base+'"></i><i style="background:'+preset.accent+'"></i><i style="background:'+preset.trim+'"></i></span></div>';
    button.addEventListener('click',()=>{
      const fields={base:preset.base,accent:preset.accent,trim:preset.trim,pattern:preset.pattern,secondaryPattern:preset.secondary,patternAngle:preset.angle,patternScale:preset.scale,patternOpacity:preset.opacity,secondaryOpacity:preset.secondaryOpacity,patternX:preset.x,patternY:preset.y};
      for(const [id,value] of Object.entries(fields)){const input=document.getElementById(id);if(input){input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));}}
      section.querySelectorAll('.rw-gallery-card').forEach(card=>card.setAttribute('aria-pressed',String(card===button)));
      section.querySelector('.rw-gallery-status').innerHTML='<strong>'+preset.name+'</strong> applied. Existing race number and sponsor artwork preserved.';
      document.getElementById('styleLabel')?.setAttribute('title','Procedural styling, not AI-generated artwork');
    });
    grid.appendChild(button);
  }
  anchor.before(section);
});

