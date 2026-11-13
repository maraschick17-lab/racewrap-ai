const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 try{for(const mobile of [false,true]){
  const page=await browser.newPage({viewport:{width:mobile?390:1280,height:900},isMobile:mobile,hasTouch:mobile});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.BASE_URL||'http://127.0.0.1:43137');
  await page.locator('#useStarter').click();await page.waitForTimeout(650);
  const original=await page.locator('#graphic').evaluate(e=>parseFloat(getComputedStyle(e).fontSize));
  await page.locator('#numberStyle').selectOption('speed');await page.waitForTimeout(450);
  await page.locator('#numberScale').fill('150');await page.waitForTimeout(450);
  assert.equal(await page.locator('#graphic').evaluate(e=>getComputedStyle(e).fontStyle),'italic');
  assert(Math.abs(await page.locator('#graphic').evaluate(e=>parseFloat(getComputedStyle(e).fontSize))-original*1.5)<1);
  const save=async id=>{const [d]=await Promise.all([page.waitForEvent('download'),page.locator(id).click()]);return fs.readFileSync(await d.path(),'utf8')};
  const svg=await save('#save');
  assert.match(svg,/font-style="italic"/);assert.match(svg,/paint-order="stroke fill"/);
  const json=JSON.parse(await save('#saveProject'));
  assert.equal(json.fields.numberStyle,'speed');assert.equal(json.fields.numberScale,'150');
  await page.locator('#numberStyle').selectOption('block');await page.waitForTimeout(450);
  await page.locator('#undoDesign').click();
  await page.waitForFunction(()=>document.querySelector('#numberStyle').value==='speed');
  await page.locator('#redoDesign').click();await page.waitForFunction(()=>document.querySelector('#numberStyle').value==='block');
  await page.locator('#openProject').setInputFiles({name:'lettering.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(json))});
  await page.waitForFunction(()=>document.querySelector('#numberStyle').value==='speed');
  assert.equal(await page.locator('#numberScale').inputValue(),'150');
  delete json.fields.numberStyle;delete json.fields.numberScale;
  await page.locator('#openProject').setInputFiles({name:'legacy.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(json))});
  await page.waitForFunction(()=>document.querySelector('#numberStyle').value==='classic');
  assert.equal(await page.locator('#numberScale').inputValue(),'100');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
  await page.close();
 }console.log('PASS lettering styles, responsive sizing, SVG outline, JSON/legacy, undo/redo, desktop/mobile');}
 finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});

