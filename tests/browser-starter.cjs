'use strict';
// Racecar-first landing regression: real concept asset + one-click import into active editor.
// PLAYWRIGHT_MODULE=/path/to/playwright CHROME_PATH=/path/to/chrome node tests/browser-starter.cjs
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.BASE_URL||'https://racewrap-ai-studio.onrender.com';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox']});
 const errors=[];
 try{
  for(const width of [1280,390]){
   const page=await browser.newPage({viewport:{width,height:850},isMobile:width===390,hasTouch:width===390});
   page.on('pageerror',e=>errors.push(e.message));
   const response=await page.goto(base+'/?starter='+Date.now(),{waitUntil:'networkidle',timeout:45000});
   assert.equal(response.status(),200);
   const hero=page.locator('#starterImage');
   await page.waitForFunction(()=>window.RaceWrapStarterImage?.startsWith('data:image/webp;base64,'));
   const details=await hero.evaluate(e=>({complete:e.complete,width:e.naturalWidth,height:e.naturalHeight}));
   assert.deepEqual(details,{complete:true,width:450,height:130},'original Late Model image must load');
   assert.equal(await page.locator('#bodyImage').isVisible(),false,'do not silently overwrite a project on load');
   await page.locator('#useStarter').click();
   await page.waitForFunction(()=>document.querySelector('#bodyImage').style.display==='block');
   assert.match(await page.locator('#sourceMeta').innerText(),/Original visual concept only/);
   assert.match(await page.locator('#sourceMeta').innerText(),/450×130/);
   assert.equal(await page.locator('#useStarter').isDisabled(),true);
   console.log('PASS '+width+'px car-first hero and one-click editor import');
   await page.close();
  }
  assert.deepEqual(errors,[],'browser JavaScript errors');
  console.log('PASS no browser errors');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
