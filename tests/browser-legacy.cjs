'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto((process.env.BASE_URL||'https://racewrap-ai-studio.onrender.com')+'/?legacy='+Date.now(),{waitUntil:'domcontentloaded'});
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="white"/></svg>';
  await page.locator('#template').setInputFiles({name:'licensed.svg',mimeType:'image/svg+xml',buffer:Buffer.from(svg)});
  await page.waitForFunction(()=>document.querySelector('#sourceMeta').textContent.includes('licensed.svg'));
  await page.locator('#slotSave0').click();
  await page.locator('#layoutRebase').click();
  const d=page.waitForEvent('download');await page.locator('#saveProject').click();
  const project=JSON.parse(fs.readFileSync(await (await d).path(),'utf8'));
  for(const key of ['secondaryPattern','secondaryX','secondaryY','secondaryOpacity']){
   delete project.fields[key];delete project.designSlots[0][key];delete project.layoutComparison.anchor[key];
  }
  await page.locator('#secondaryPattern').selectOption('checker');
  await page.locator('#openProject').setInputFiles({name:'old-project.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('restored'));
  assert.equal(await page.locator('#secondaryPattern').inputValue(),'none','legacy project resets second layer');
  assert.equal(await page.locator('#slotLoad0').isEnabled(),true,'legacy saved direction retained');
  assert.equal(await page.locator('#layout1').isEnabled(),true,'legacy layout comparison retained');
  await page.locator('#slotLoad0').click();
  assert.equal(await page.locator('#secondaryPattern').inputValue(),'none');
  assert.deepEqual(errors,[]);
  console.log('PASS legacy project retains saved directions and layouts, defaults secondary controls, zero JS errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
