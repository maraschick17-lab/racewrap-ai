'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.BASE_URL||'https://racewrap-ai-studio.onrender.com';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true,hasTouch:true,isMobile:true});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  const response=await page.goto(base+'/?sponsor-layout='+Date.now(),{waitUntil:'domcontentloaded'});
  assert.equal(response.status(),200);
  await page.waitForFunction(()=>document.querySelector('script[src*="sponsor-layout-21"]')&&document.querySelector('#arrangeLogos'));
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="white"/></svg>';
  await page.locator('#template').setInputFiles({name:'licensed-fixture.svg',mimeType:'image/svg+xml',buffer:Buffer.from(svg)});
  await page.waitForFunction(()=>document.querySelector('#sourceMeta').textContent.includes('licensed-fixture'));
  for(let i=0;i<6;i++){
    const png=await page.evaluate(i=>{
      const c=document.createElement('canvas');c.width=i%2?40:160;c.height=i%2?120:40;
      c.getContext('2d').fillStyle='#a31425';c.getContext('2d').fillRect(0,0,c.width,c.height);
      return c.toDataURL('image/png').split(',')[1];
    },i);
    await page.locator('#logo').setInputFiles({name:'sponsor-'+i+'.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
    await page.waitForFunction(n=>document.querySelectorAll('#logoList button').length===n,i+1);
  }
  const before=await page.evaluate(()=>['logoGraphic',...Array.from({length:5},(_,i)=>'extraLogo'+(i+1))].map(id=>{
    const e=document.getElementById(id);return {id,left:e.style.left,top:e.style.top,width:e.style.width,z:e.style.zIndex};
  }));
  await page.locator('#arrangeLogos').click();
  assert.match(await page.locator('#status').innerText(),/Arranged 6 logos/);
  assert.equal(await page.locator('#undoArrangeLogos').isEnabled(),true);
  const after=await page.evaluate(()=>['logoGraphic',...Array.from({length:5},(_,i)=>'extraLogo'+(i+1))].map(id=>{
    const e=document.getElementById(id),r=e.getBoundingClientRect(),c=document.querySelector('#canvas').getBoundingClientRect();
    return {id,left:e.style.left,top:e.style.top,width:e.style.width,z:e.style.zIndex,x:r.left,y:r.top,w:r.width,h:r.height,cx:c.left,cy:c.top,cw:c.width,ch:c.height};
  }));
  assert.notDeepEqual(after.map(x=>x.left),before.map(x=>x.left));
  for(const a of after){
    assert(a.x>=a.cx-1&&a.y>=a.cy-1&&a.x+a.w<=a.cx+a.cw+1&&a.y+a.h<=a.cy+a.ch+1,'logo must fit canvas '+a.id);
  }
  for(let i=0;i<after.length;i++)for(let j=i+1;j<after.length;j++){
    const a=after[i],b=after[j];
    assert(a.x+a.w<=b.x+.5||b.x+b.w<=a.x+.5||a.y+a.h<=b.y+.5||b.y+b.h<=a.y+.5,'logos must not overlap');
  }
  const d=page.waitForEvent('download');await page.locator('#saveProject').click();
  const json=fs.readFileSync(await (await d).path(),'utf8');
  const saved=JSON.parse(json);
  assert.equal(saved.extraLogos.length,5);
  assert.equal(saved.extraLogos[0].left,after[1].left);
  await page.locator('#undoArrangeLogos').click();
  const undone=await page.evaluate(()=>['logoGraphic',...Array.from({length:5},(_,i)=>'extraLogo'+(i+1))].map(id=>{
    const e=document.getElementById(id);return {id,left:e.style.left,top:e.style.top,width:e.style.width,z:e.style.zIndex};
  }));
  assert.deepEqual(undone,before,'Undo restores exact sponsor placements and stacking');
  await page.locator('#openProject').setInputFiles({name:'saved.json',mimeType:'application/json',buffer:Buffer.from(json)});
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('project restored'));
  const restored=await page.evaluate(()=>document.querySelector('#extraLogo6').style.left);
  assert.equal(restored,after[1].left,'arrangement must survive project round-trip');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'390px viewport overflow');
  assert.deepEqual(errors,[],'browser JS errors');
  console.log('PASS sponsor auto-arrange: 6 mixed-aspect logos, no collisions, undo, JSON round-trip, 390px touch, zero JS errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
