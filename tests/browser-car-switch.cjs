'use strict';
// Verify three car types, accurate editor metadata, recoverable switch and touch viewport.
// PLAYWRIGHT_MODULE=/path/to/playwright CHROME_PATH=/path/to/chrome node tests/browser-car-switch.cjs
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.BASE_URL||'https://racewrap-ai-studio.onrender.com/index.html';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox']});
 try{
  for(const width of [1280,390]){
   const page=await browser.newPage({viewport:{width,height:850},isMobile:width===390,hasTouch:width===390});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   const response=await page.goto(base+(base.includes('?')?'&':'?')+'carSwitch='+Date.now(),{waitUntil:'networkidle',timeout:45000});
   assert.equal(response.status(),200);
   await page.locator('[data-car="modified"]').click();
   await page.waitForFunction(()=>document.querySelector('#starterImage').naturalWidth>0);
   assert.match(await page.locator('#selectedCarName').innerText(),/Modified/);
   await page.locator('#useStarter').click();
   await page.waitForFunction(()=>document.querySelector('#sourceMeta').textContent.includes('Modified concept.webp'));
   assert.match(await page.locator('#sourceMeta').innerText(),/Original visual concept only/);
   await page.locator('#number').fill('42');
   await page.locator('#panelName').fill('Left door');
   await page.locator('#tracePanel').click();
   const overlay=page.locator('#panelOverlay');
   await overlay.scrollIntoViewIfNeeded();
   const bounds=await overlay.boundingBox();
   assert.ok(bounds&&bounds.width>120&&bounds.height>40);
   for(const [x,y] of [[.25,.25],[.55,.25],[.55,.65]])await overlay.click({position:{x:Math.min(bounds.width-5,bounds.width*x),y:Math.min(bounds.height-5,bounds.height*y)}});
   await page.locator('#finishPanel').click();
   assert.match(await page.locator('#panelStatus').innerText(),/1 artwork mask/);
   await page.locator('[data-car="stock"]').click();
   const stockWidth=await page.locator('#starterImage').evaluate(e=>e.naturalWidth);
   assert.ok(stockWidth>0,'Stock Car concept image must decode');
   await page.locator('#useStarter').click();
   await page.waitForFunction(()=>document.querySelector('#sourceMeta').textContent.includes('Stock Car concept.webp'),null,{timeout:12000}).catch(async e=>{throw Error('Stock import failed: '+await page.locator('#status').innerText()+' / '+await page.locator('#starterStatus').innerText()+' / '+e.message);});
   assert.match(await page.locator('#panelStatus').innerText(),/No artwork masks/);
   assert.equal(await page.locator('#restorePrevious').isDisabled(),false);
   await page.locator('#restorePrevious').click();
   await page.waitForFunction(()=>document.querySelector('#sourceMeta').textContent.includes('Modified concept.webp'));
   assert.equal(await page.locator('#number').inputValue(),'42');
   assert.match(await page.locator('#panelStatus').innerText(),/1 artwork mask/);
   assert.match(await page.locator('#panelDimensions').innerText(),/Left door/);
   assert.equal(await page.locator('#restorePrevious').isDisabled(),true);
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);
   assert.equal(overflow,false,'no horizontal overflow');
   assert.deepEqual(errors,[],'no browser errors');
   console.log('PASS '+width+'px car selection, undo backup, mask/number restoration, no page errors');
   await page.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
