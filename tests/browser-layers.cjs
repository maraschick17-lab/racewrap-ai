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
  const response=await page.goto(base+'/?layers='+Date.now(),{waitUntil:'domcontentloaded'});
  assert.equal(response.status(),200);
  await page.waitForFunction(()=>document.querySelector('#logoBackward')&&document.querySelector('#logoForward'));
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="white"/></svg>';
  await page.locator('#template').setInputFiles({name:'licensed-fixture.svg',mimeType:'image/svg+xml',buffer:Buffer.from(svg)});
  await page.waitForFunction(()=>document.querySelector('#sourceMeta').textContent.includes('licensed-fixture'));
  const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=80;c.height=40;return ['#e31a1c','#1f78b4','#33a02c'].map(color=>{c.getContext('2d').fillStyle=color;c.getContext('2d').fillRect(0,0,80,40);return c.toDataURL('image/png').split(',')[1];});});
  for(let i=0;i<3;i++){
   await page.locator('#logo').setInputFiles({name:'sponsor-'+i+'.png',mimeType:'image/png',buffer:Buffer.from(png[i],'base64')});
   await page.waitForFunction(n=>document.querySelectorAll('#logoList button').length===n,i+1);
  }
  assert.equal(await page.locator('#logoForward').isDisabled(),true,'top logo should not move further forward');
  assert.equal(await page.locator('#logoBackward').isEnabled(),true);
  await page.locator('#logoBackward').click();
  const layers=await page.evaluate(()=>['logoGraphic','extraLogo1','extraLogo2'].map(id=>Number(document.getElementById(id).style.zIndex)));
  assert.deepEqual(layers,[20,22,21],'layer swap must change stacking order');
  const d=page.waitForEvent('download');await page.locator('#saveProject').click();
  const json=fs.readFileSync(await (await d).path(),'utf8'),project=JSON.parse(json);
  assert.equal(Number(project.extraLogos[0].zIndex),22);
  assert.equal(Number(project.extraLogos[1].zIndex),21);
  const s=page.waitForEvent('download');await page.locator('#save').click();
  const output=fs.readFileSync(await (await s).path(),'utf8');
  const indexes=[project.logo.data,project.extraLogos[1].data,project.extraLogos[0].data].map(data=>output.indexOf(data));
  assert(indexes.every(i=>i>=0)&&indexes[0]<indexes[1]&&indexes[1]<indexes[2],'SVG paint order must match stacking order');
  await page.locator('#openProject').setInputFiles({name:'restore.json',mimeType:'application/json',buffer:Buffer.from(json)});
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('project restored'));
  const restored=await page.evaluate(()=>['logoGraphic','extraLogo3','extraLogo4'].map(id=>Number(document.getElementById(id).style.zIndex)));
  assert.deepEqual(restored,[20,22,21],'restored layers should preserve stacking order');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'390px viewport overflow');
  assert.deepEqual(errors,[],'browser JS errors');
  console.log('PASS sponsor layer order, SVG paint order, JSON round-trip, 390px touch viewport, zero JS errors');
 }finally{await browser.close();}
})().catch(err=>{console.error(err);process.exit(1);});
