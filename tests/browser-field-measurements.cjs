'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.BASE_URL||'https://racewrap-ai-studio.onrender.com';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox']});
 try{
  for(const mobile of [false,true]){
   const context=await browser.newContext({viewport:{width:mobile?390:1280,height:mobile?844:900},hasTouch:mobile,isMobile:mobile,acceptDownloads:true});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   try{
    const response=await page.goto(base+'/?field='+Date.now(),{waitUntil:'domcontentloaded'});
    assert.equal(response.status(),200);
    assert.match(await page.locator('script[src*="studio-v3"]').getAttribute('src'),/studio-v3\.js\?v=[a-z0-9-]+/);
    const svg='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="white"/></svg>';
    await page.locator('#template').setInputFiles({name:'licensed-field.svg',mimeType:'image/svg+xml',buffer:Buffer.from(svg)});
    await page.waitForFunction(()=>document.querySelector('#sourceMeta').textContent.includes('licensed-field'));
    await page.locator('#panelName').fill('Left door');
    await page.locator('#tracePanel').click();
    const overlay=page.locator('#panelOverlay');
    await overlay.scrollIntoViewIfNeeded();
    const box=await overlay.boundingBox();
    for(const [x,y] of [[.1,.2],[.6,.2],[.6,.6],[.1,.6]]){
      if(mobile)await page.touchscreen.tap(box.x+box.width*x,box.y+box.height*y);
      else await page.mouse.click(box.x+box.width*x,box.y+box.height*y);
    }
    await page.locator('#finishPanel').click();
    const width=page.getByRole('spinbutton',{name:'Left door Field width in inches'});
    const height=page.getByRole('spinbutton',{name:'Left door Field height in inches'});
    assert.equal(await width.count(),1);
    await width.fill('21.5');await width.press('Tab');
    await height.fill('11.25');await height.press('Tab');
    assert.match(await page.locator('#panelDimensions').innerText(),/Field observations saved/);
    await page.locator('#inch').fill('20');
    await page.locator('#measureSpan').click();
    const ruler=page.locator('#rulerOverlay');
    await ruler.scrollIntoViewIfNeeded();
    const rb=await ruler.boundingBox();
    for(const [x,y] of [[.2,.5],[.7,.5]]){
      if(mobile)await page.touchscreen.tap(rb.x+rb.width*x,rb.y+rb.height*y);
      else await page.mouse.click(rb.x+rb.width*x,rb.y+rb.height*y);
    }
    assert.match(await page.locator('#panelDimensions').innerText(),/difference vs flat image bounds/);
    const [dl]=await Promise.all([page.waitForEvent('download'),page.locator('#exportPanelReport').click()]);
    const csv=fs.readFileSync(await dl.path(),'utf8');
    assert.match(csv,/Field width observed \(in\)/);
    assert.match(csv,/"21.5","11.25"/);
    assert.match(csv,/UNVERIFIED RASTER REFERENCE - NOT PRINT READY/);
    const [saved]=await Promise.all([page.waitForEvent('download'),page.locator('#saveProject').click()]);
    const project=JSON.parse(fs.readFileSync(await saved.path(),'utf8'));
    assert.deepEqual(project.panelFieldMeasurements,[{width:21.5,height:11.25}]);
    await page.locator('#clearPanels').click();
    assert.equal(await page.getByRole('spinbutton',{name:'Left door Field width in inches'}).count(),0);
    await page.locator('#openProject').setInputFiles({name:'field-roundtrip.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
    await page.waitForFunction(()=>document.querySelector('#panelDimensions').textContent.includes('Field observations saved'));
    assert.equal(await page.getByRole('spinbutton',{name:'Left door Field width in inches'}).inputValue(),'21.5');
    assert.equal(await page.getByRole('spinbutton',{name:'Left door Field height in inches'}).inputValue(),'11.25');
    const [dl2]=await Promise.all([page.waitForEvent('download'),page.locator('#exportPanelReport').click()]);
    assert.equal(fs.readFileSync(await dl2.path(),'utf8'),csv);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'horizontal overflow');
    assert.deepEqual(errors,[],'page JS errors');
    console.log('PASS field observations, discrepancy, CSV and JSON round-trip, '+(mobile?'390px touch':'1280px desktop'));
   }finally{await context.close();}
  }
 }finally{await browser.close();}
})().catch(err=>{console.error(err);process.exit(1);});
