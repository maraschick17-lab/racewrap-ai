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
    const response=await page.goto(base+'/?polygon='+Date.now(),{waitUntil:'domcontentloaded'});
    assert.equal(response.status(),200);
    const script=await page.locator('script[src*="studio-v3"]').getAttribute('src');
    assert.match(script,/polygon-geometry-34/);
    const svg='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="white"/></svg>';
    await page.locator('#template').setInputFiles({name:'licensed-test.svg',mimeType:'image/svg+xml',buffer:Buffer.from(svg)});
    await page.waitForFunction(()=>document.querySelector('#sourceMeta').textContent.includes('licensed-test'));
    await page.locator('#tracePanel').click();
    const overlay=page.locator('#panelOverlay');
    await overlay.scrollIntoViewIfNeeded();
    const tap=async(x,y)=>{
      const b=await overlay.boundingBox();
      if(mobile)await page.touchscreen.tap(b.x+b.width*x,b.y+b.height*y);
      else await page.mouse.click(b.x+b.width*x,b.y+b.height*y);
    };
    for(const [x,y] of [[.1,.1],[.7,.7],[.1,.7],[.7,.1]])await tap(x,y);
    assert.match(await page.locator('#panelStatus').innerText(),/edges cross or overlap/);
    assert.equal(await page.locator('#finishPanel').isDisabled(),true,'bow-tie mask must be blocked');
    await page.locator('#undoPoint').click();
    assert.equal(await page.locator('#finishPanel').isEnabled(),true,'valid triangle should be allowed after undo');
    await page.locator('#finishPanel').click();
    assert.match(await page.locator('#panelStatus').innerText(),/1/);
    await page.locator('#inch').fill('20');
    await page.locator('#measureSpan').click();
    const ruler=page.locator('#rulerOverlay');
    await ruler.scrollIntoViewIfNeeded();
    const rb=await ruler.boundingBox();
    for(const [x,y] of [[.2,.5],[.7,.5]]){
      if(mobile)await page.touchscreen.tap(rb.x+rb.width*x,rb.y+rb.height*y);
      else await page.mouse.click(rb.x+rb.width*x,rb.y+rb.height*y);
    }
    assert.equal(await page.locator('#exportPanelReport').isEnabled(),true);
    const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#exportPanelReport').click()]);
    assert.match(fs.readFileSync(await download.path(),'utf8'),/UNVERIFIED RASTER REFERENCE - NOT PRINT READY/);
    const [saved]=await Promise.all([page.waitForEvent('download'),page.locator('#saveProject').click()]);
    const project=JSON.parse(fs.readFileSync(await saved.path(),'utf8'));
    project.panelMasks=[[[.1,.1],[.7,.7],[.1,.7],[.7,.1]]];
    const buffer=Buffer.from(JSON.stringify(project));
    await page.locator('#openProject').setInputFiles({name:'legacy-invalid.json',mimeType:'application/json',buffer});
    await page.waitForFunction(()=>document.querySelector('#panelDimensions').textContent.includes('INVALID GEOMETRY'));
    assert.equal(await page.locator('#exportPanelReport').isDisabled(),true,'invalid imported geometry must block reference CSV');
    assert.match(await page.locator('#panelDimensions').innerText(),/Polygon edges cross or overlap/);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal overflow');
    assert.deepEqual(errors,[],'no browser JavaScript errors');
    console.log('PASS polygon cross-check, undo, valid CSV, invalid legacy import, '+(mobile?'390px touch':'1280px desktop'));
   }finally{await context.close();}
  }
 }finally{await browser.close();}
})().catch(err=>{console.error(err);process.exit(1);});
