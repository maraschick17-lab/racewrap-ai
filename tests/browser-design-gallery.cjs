'use strict';
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.BASE_URL||'http://127.0.0.1:43137';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox']});
 try{
  for(const width of [1280,390]){
   const page=await browser.newPage({viewport:{width,height:850},isMobile:width===390,hasTouch:width===390});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/?gallery='+Date.now(),{waitUntil:'domcontentloaded'});
   await page.locator('.rw-gallery-card').first().waitFor();
   assert.equal(await page.locator('.rw-gallery-card').count(),4);
   assert.equal(await page.locator('.rw-gallery-card[aria-pressed="true"]').count(),0);
   const template='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="white"/></svg>';
   await page.locator('#template').setInputFiles({name:'licensed-fixture.svg',mimeType:'image/svg+xml',buffer:Buffer.from(template)});
   await page.waitForFunction(()=>document.getElementById('sourceMeta').textContent.includes('licensed-fixture'));
   await page.locator('#number').fill('42');
   await page.locator('#sponsor').fill('LOCAL SPONSOR');
   await page.locator('[data-design="velocity"]').click();
   assert.equal(await page.locator('#base').inputValue(),'#0b2552');
   assert.equal(await page.locator('#pattern').inputValue(),'ribbons');
   assert.equal(await page.locator('#secondaryPattern').inputValue(),'slashes');
   assert.equal(await page.locator('#number').inputValue(),'42');
   assert.equal(await page.locator('#sponsor').inputValue(),'LOCAL SPONSOR');
   assert.equal(await page.locator('.rw-gallery-card[aria-pressed="true"]').count(),1);
   await page.locator('[data-design="apex"]').click();
   assert.equal(await page.locator('#accent').inputValue(),'#b9f73b');
   assert.equal(await page.locator('#pattern').inputValue(),'slashes');
   assert.equal(await page.locator('#number').inputValue(),'42');
   assert.equal(await page.locator('#sponsor').inputValue(),'LOCAL SPONSOR');
   assert.equal(await page.locator('#patternLayer').evaluate(el=>getComputedStyle(el).display),'block','procedural graphics rendered');
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
   assert.equal(overflow,false,'no horizontal overflow at '+width);
   assert.deepEqual(errors,[]);
   await page.close();
  }
  console.log('PASS design gallery: 4 visual directions, editable controls, preserved number/sponsor, desktop/mobile, no page errors');
 }finally{await browser.close();}
})().catch(e=>{console.error('FAIL',e);process.exitCode=1;});

