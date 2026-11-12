'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.BASE_URL||'https://racewrap-ai-studio.onrender.com';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox']});
 try {
  for(const mobile of [false,true]) {
   const context=await browser.newContext({viewport:{width:mobile?390:1280,height:mobile?844:900},hasTouch:mobile,isMobile:mobile,acceptDownloads:true});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   try {
    const response=await page.goto(base+'/?panelcsv='+Date.now(),{waitUntil:'domcontentloaded'});
    assert.equal(response.status(),200);
    const button=page.locator('#exportPanelReport');
    assert.equal(await button.isDisabled(),true,'report must require ruler and polygon');
    const svg='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="white"/></svg>';
    await page.locator('#template').setInputFiles({name:'licensed-panel.svg',mimeType:'image/svg+xml',buffer:Buffer.from(svg)});
    await page.waitForFunction(()=>document.querySelector('#sourceMeta').textContent.includes('licensed-panel'));
    await page.locator('#panelName').fill('=SUM(1,2)');
    await page.locator('#tracePanel').click();
    await page.locator('#panelOverlay').scrollIntoViewIfNeeded();
    let box=await page.locator('#panelOverlay').boundingBox();
    for(const [x,y] of [[.1,.2],[.6,.2],[.6,.6],[.1,.6]]) {
     if(mobile)await page.touchscreen.tap(box.x+box.width*x,box.y+box.height*y);
     else await page.mouse.click(box.x+box.width*x,box.y+box.height*y);
    }
    await page.locator('#finishPanel').click();
    assert.equal(await button.isDisabled(),true,'uncalibrated report must remain disabled');
    await page.locator('#inch').fill('20');
    await page.locator('#measureSpan').click();
    await page.locator('#rulerOverlay').scrollIntoViewIfNeeded();
    box=await page.locator('#rulerOverlay').boundingBox();
    for(const [x,y] of [[.2,.5],[.7,.5]]) {
     if(mobile)await page.touchscreen.tap(box.x+box.width*x,box.y+box.height*y);
     else await page.mouse.click(box.x+box.width*x,box.y+box.height*y);
    }
    assert.equal(await button.isEnabled(),true,'calibrated panel report should be enabled');
    const [dl]=await Promise.all([page.waitForEvent('download'),button.click()]);
    assert.equal(dl.suggestedFilename(),'racewrap-panel-reference.csv');
    const csv=fs.readFileSync(await dl.path(),'utf8');
    assert.match(csv,/Panel,?"/);
    assert.match(csv,/20\.0","10\.0","200\.0"/);
    assert.match(csv,/"'=SUM\(1,2\)"/,'spreadsheet formula must be inert');
    assert.match(csv,/UNVERIFIED RASTER REFERENCE - NOT PRINT READY/);
    assert.ok(csv.includes('\r\n'),'CSV must use CRLF row endings');
    const [saved]=await Promise.all([page.waitForEvent('download'),page.locator('#saveProject').click()]);
    const project=fs.readFileSync(await saved.path());
    await page.locator('#clearPanels').click();
    assert.equal(await button.isDisabled(),true,'clearing masks disables export');
    await page.locator('#openProject').setInputFiles({name:'restore.json',mimeType:'application/json',buffer:project});
    await page.waitForFunction(()=>document.querySelector('#exportPanelReport').disabled===false);
    const [dl2]=await Promise.all([page.waitForEvent('download'),button.click()]);
    assert.equal(fs.readFileSync(await dl2.path(),'utf8'),csv,'round-tripped project should reproduce report');
    await page.locator('#clearSpan').click();
    assert.equal(await button.isDisabled(),true,'clearing ruler disables report');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile/desktop horizontal overflow');
    assert.deepEqual(errors,[],'page JS errors');
    console.log('PASS reference CSV export, formula sanitization, calibration gate, project round-trip, '+(mobile?'390px touch':'1280px desktop'));
   } finally {await context.close();}
  }
 } finally {await browser.close();}
})().catch(err=>{console.error(err);process.exit(1);});
