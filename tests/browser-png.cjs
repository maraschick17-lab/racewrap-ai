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
 try {
  const response=await page.goto(base+'/?png-preview='+Date.now(),{waitUntil:'domcontentloaded'});
  assert.equal(response.status(),200);
  await page.waitForFunction(()=>document.querySelector('script[src*="png-preview-11"]')&&document.querySelector('#savePNG'));
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="#ffffff"/></svg>';
  await page.locator('#template').setInputFiles({name:'licensed-fixture.svg',mimeType:'image/svg+xml',buffer:Buffer.from(svg)});
  await page.waitForFunction(()=>document.querySelector('#sourceMeta').textContent.includes('licensed-fixture'));
  await page.locator('#number').fill('17');
  await page.locator('#sponsor').fill('TEST SPONSOR');
  const downloadPromise=page.waitForEvent('download');
  await page.locator('#savePNG').click();
  const download=await downloadPromise;
  assert.equal(download.suggestedFilename(),'racewrap-concept-preview.png');
  const png=fs.readFileSync(await download.path());
  assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16),800);
  assert.equal(png.readUInt32BE(20),500);
  assert.match(await page.locator('#status').innerText(),/Not print-ready/);
  assert.equal(await page.locator('#savePNG').isEnabled(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  assert.deepEqual(errors,[]);
  console.log('PASS PNG preview: real 800x500 PNG download, mobile layout, zero JS errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
