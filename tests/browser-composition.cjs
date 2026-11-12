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
  const response=await page.goto(base+'/?composition='+Date.now(),{waitUntil:'domcontentloaded'});
  assert.equal(response.status(),200);
  await page.waitForFunction(()=>document.querySelector('#patternX')&&document.querySelector('#logoLeft'));
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="white"/></svg>';
  await page.locator('#template').setInputFiles({name:'licensed-fixture.svg',mimeType:'image/svg+xml',buffer:Buffer.from(svg)});
  await page.waitForFunction(()=>document.querySelector('#sourceMeta').textContent.includes('licensed-fixture'));
  for(const [id,value] of [['patternX','80'],['patternY','65']]){
   await page.locator('#'+id).evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},value);
  }
  const transform=await page.locator('#patternLayer').innerHTML();
  assert.match(transform,/translate\(450\.00 82\.50\)/);
  const png64=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=100;c.height=50;c.getContext('2d').fillRect(0,0,100,50);return c.toDataURL('image/png').split(',')[1];});
  await page.locator('#logo').setInputFiles({name:'sponsor.png',mimeType:'image/png',buffer:Buffer.from(png64,'base64')});
  await page.waitForFunction(()=>document.querySelector('#logoList button'));
  const before=await page.locator('#logoGraphic').evaluate(el=>parseFloat(el.style.left));
  await page.locator('#logoRight').click();
  const after=await page.locator('#logoGraphic').evaluate(el=>parseFloat(el.style.left));
  assert.equal(after,before+1,'touch nudge failed');
  const projectDownload=page.waitForEvent('download');
  await page.locator('#saveProject').click();
  const project=JSON.parse(fs.readFileSync(await (await projectDownload).path(),'utf8'));
  assert.equal(project.fields.patternX,'80');assert.equal(project.fields.patternY,'65');
  assert.equal(parseFloat(project.positions.logoGraphic.left),after);
  const svgDownload=page.waitForEvent('download');
  await page.locator('#save').click();
  const output=fs.readFileSync(await (await svgDownload).path(),'utf8');
  assert.match(output,/translate\(450\.00 82\.50\)/);
  const width=await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth);
  assert.equal(width,true,'horizontal overflow on mobile');
  assert.deepEqual(errors,[],'browser errors');
  console.log('PASS composition positions, sponsor touch nudging, project persistence, SVG export, 390px mobile, zero page errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
