'use strict';
// Verify manual pattern drag, layer independence, project persistence and concept SVG.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.BASE_URL||'https://racewrap-ai-studio.onrender.com/index.html';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox']});
 try{
  for(const width of [1280,390]){
   const page=await browser.newPage({viewport:{width,height:850},hasTouch:width===390,isMobile:width===390,acceptDownloads:true});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   const response=await page.goto(base+(base.includes('?')?'&':'?')+'patternDrag='+Date.now(),{waitUntil:'domcontentloaded',timeout:45000});
   assert.equal(response.status(),200);
   const svg='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="white"/></svg>';
   await page.locator('#template').setInputFiles({name:'licensed-pattern-test.svg',mimeType:'image/svg+xml',buffer:Buffer.from(svg)});
   await page.waitForFunction(()=>document.querySelector('#sourceMeta').textContent.includes('licensed-pattern-test'));
   await page.locator('#movePrimary').click();
   assert.equal(await page.locator('#movePrimary').getAttribute('aria-pressed'),'true');
   assert.equal(await page.locator('#patternLayer').evaluate(el=>getComputedStyle(el).pointerEvents),'auto');
   await page.locator('#patternLayer').scrollIntoViewIfNeeded();
   const bounds=await page.locator('#patternLayer').boundingBox();
   assert.ok(bounds&&bounds.width>100&&bounds.height>50);
   const beforeX=Number(await page.locator('#patternX').inputValue());
   const beforeY=Number(await page.locator('#patternY').inputValue());
   const x=bounds.x+bounds.width*.82,y=bounds.y+bounds.height*.2;
   await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+bounds.width*.12,y+bounds.height*.09,{steps:5});await page.mouse.up();
   const primaryX=Number(await page.locator('#patternX').inputValue()),primaryY=Number(await page.locator('#patternY').inputValue());
   assert.ok(primaryX>=beforeX+10&&primaryX<=beforeX+14,'primary horizontal drag failed');
   assert.ok(primaryY>=beforeY+7&&primaryY<=beforeY+11,'primary vertical drag failed');
   await page.locator('#secondaryPattern').selectOption('lightning');
   await page.locator('#moveSecondary').click();
   assert.equal(await page.locator('#moveSecondary').getAttribute('aria-pressed'),'true');
   const secondBefore=Number(await page.locator('#secondaryX').inputValue());
   await page.locator('#patternLayer').scrollIntoViewIfNeeded();
   const bounds2=await page.locator('#patternLayer').boundingBox();
   const x2=bounds2.x+bounds2.width*.82,y2=bounds2.y+bounds2.height*.2;
   await page.mouse.move(x2,y2);await page.mouse.down();await page.mouse.move(x2-bounds2.width*.1,y2,{steps:5});await page.mouse.up();
   assert.ok(Number(await page.locator('#secondaryX').inputValue())<=secondBefore-8,'secondary drag failed');
   assert.equal(Number(await page.locator('#patternX').inputValue()),primaryX,'secondary drag must not alter primary');
   const downloadPromise=page.waitForEvent('download');
   await page.locator('#saveProject').click();
   const json=JSON.parse(fs.readFileSync(await (await downloadPromise).path(),'utf8'));
   assert.equal(Number(json.fields.patternX),primaryX);
   assert.equal(Number(json.fields.patternY),primaryY);
   assert.equal(Number(json.fields.secondaryX),Number(await page.locator('#secondaryX').inputValue()));
   const svgDownload=page.waitForEvent('download');
   await page.locator('#save').click();
   const exported=fs.readFileSync(await (await svgDownload).path(),'utf8');
   assert.match(exported,/data-layer="primary"/);
   assert.match(exported,/data-layer="secondary"/);
   await page.locator('#canvasLock').click();
   assert.equal(await page.locator('#movePrimary').isDisabled(),true);
   assert.equal(await page.locator('#patternLayer').evaluate(el=>getComputedStyle(el).pointerEvents),'none');
   await page.locator('#canvasLock').click();
   await page.locator('#movePrimary').click();
   await page.locator('#tracePanel').click();
   assert.equal(await page.locator('#movePrimary').getAttribute('aria-pressed'),'false','panel tracing must exit drag mode');
   assert.equal(await page.locator('#patternLayer').evaluate(el=>getComputedStyle(el).pointerEvents),'none');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true,'horizontal overflow');
   assert.deepEqual(errors,[],'browser JS errors');
   console.log('PASS '+width+'px pattern drag, independent layers, JSON/SVG, lock, tracing, no page errors');
   await page.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
