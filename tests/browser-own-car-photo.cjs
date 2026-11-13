'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.BASE_URL||'https://racewrap-ai-studio.onrender.com';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox']});
 try{
  for(const width of [1280,390]){
   const page=await browser.newPage({viewport:{width,height:850},isMobile:width===390,hasTouch:width===390,acceptDownloads:true});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   const response=await page.goto(base+(base.includes('?')?'&':'?')+'ownPhoto='+Date.now(),{waitUntil:'domcontentloaded'});
   assert.equal(response.status(),200);
   await page.locator('[data-car="stock"]').click();
   assert.match(await page.locator('#starterStatus').innerText(),/NOT body-accurate/);
   const photo=await page.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=320;
    const c=canvas.getContext('2d');c.fillStyle='#dce3e9';c.fillRect(0,0,640,320);
    c.fillStyle='#143a75';c.fillRect(45,135,550,120);
    c.fillStyle='#0a101a';c.beginPath();c.arc(150,250,48,0,7);c.arc(490,250,48,0,7);c.fill();
    return canvas.toDataURL('image/png').split(',')[1];
   });
   const buffer=Buffer.from(photo,'base64');
   const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.locator('#ownCarButton').click()]);
   await chooser.setFiles({name:'my-stock-car.png',mimeType:'image/png',buffer});
   await page.waitForFunction(()=>document.querySelector('#sourceMeta').textContent.includes('my-stock-car.png'));
   assert.match(await page.locator('#sourceMeta').innerText(),/YOUR CAR PHOTO.*NOT.*print-ready/i);
   assert.equal(await page.locator('#body').inputValue(),'stock');
   assert.equal(await page.locator('#bodyImage').evaluate(el=>el.naturalWidth),640);
   await page.locator('#number').fill('88');
   const [projectDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#saveProject').click()]);
   assert.match(projectDownload.suggestedFilename(),/\.json$/i);
   const projectJson=fs.readFileSync(await projectDownload.path(),'utf8');
   assert.ok(projectJson.includes('my-stock-car.png'),'Editable project retains original car photo');
   const [pngDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#savePNG').click()]);
   assert.match(pngDownload.suggestedFilename(),/\.png$/i);
   assert.equal(fs.readFileSync(await pngDownload.path()).subarray(1,4).toString(),'PNG');
   const [chooser2]=await Promise.all([page.waitForEvent('filechooser'),page.locator('#ownCarButton').click()]);
   await chooser2.setFiles({name:'new-stock-photo.png',mimeType:'image/png',buffer});
   await page.waitForFunction(()=>document.querySelector('#sourceMeta').textContent.includes('new-stock-photo.png'));
   assert.equal(await page.locator('#restorePrevious').isDisabled(),false);
   await page.locator('#restorePrevious').click();
   await page.waitForFunction(()=>document.querySelector('#sourceMeta').textContent.includes('my-stock-car.png'));
   assert.equal(await page.locator('#number').inputValue(),'88');
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);
   assert.equal(overflow,false,'No horizontal overflow at '+width);
   assert.deepEqual(errors,[]);
   await page.close();
  }
  console.log('PASS actual car photo upload, Stock Car warning, reversible replacement, number restoration, desktop/mobile, no page errors');
 }finally{await browser.close();}
})().catch(e=>{console.error('FAIL',e);process.exitCode=1;});