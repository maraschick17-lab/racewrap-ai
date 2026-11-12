'use strict';
// Simulated 390px touch regression for the canvas edit/scroll mode.
// Does not establish actual iPhone Safari behavior.
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.BASE_URL||'https://racewrap-ai-studio.onrender.com/index.html';
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,acceptDownloads:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try {
    const url=base+(base.includes('?')?'&':'?')+'scroll-lock='+Date.now();
    const response=await page.goto(url,{waitUntil:'domcontentloaded'});
    assert.equal(response.status(),200);
    assert.equal(await page.locator('nav[aria-label="Quick design workflow"] a').first().getAttribute('href'),'#templateZone');
    const svg='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="white"/></svg>';
    await page.locator('#template').setInputFiles({name:'licensed-test.svg',mimeType:'image/svg+xml',buffer:Buffer.from(svg)});
    await page.waitForFunction(()=>document.querySelector('#sourceMeta').textContent.includes('licensed-test.svg'));
    await page.locator('#canvasLock').click();
    assert.equal(await page.locator('#canvasLock').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#canvas').evaluate(el=>el.style.touchAction),'pan-y');
    assert.equal(await page.locator('#graphic').evaluate(el=>el.style.pointerEvents),'none');
    const lockedLeft=await page.locator('#graphic').evaluate(el=>el.style.left);
    await page.locator('#canvas').scrollIntoViewIfNeeded();
    const lockedBox=await page.locator('#graphic').boundingBox();
    await page.mouse.move(lockedBox.x+lockedBox.width/2,lockedBox.y+lockedBox.height/2);
    await page.mouse.down();await page.mouse.move(lockedBox.x+lockedBox.width/2+25,lockedBox.y+lockedBox.height/2+8,{steps:4});await page.mouse.up();
    assert.equal(await page.locator('#graphic').evaluate(el=>el.style.left),lockedLeft,'locked artwork moved');
    await page.locator('#canvasLock').click();
    assert.equal(await page.locator('#canvasLock').getAttribute('aria-pressed'),'false');
    assert.equal(await page.locator('#canvas').evaluate(el=>el.style.touchAction),'none');
    assert.equal(await page.locator('#graphic').evaluate(el=>el.style.pointerEvents),'auto');
    await page.locator('#graphic').scrollIntoViewIfNeeded();
    const box=await page.locator('#graphic').boundingBox();
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
    await page.mouse.down();await page.mouse.move(box.x+box.width/2+25,box.y+box.height/2+8,{steps:4});await page.mouse.up();
    assert.notEqual(await page.locator('#graphic').evaluate(el=>el.style.left),lockedLeft,'unlocked artwork did not move');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'horizontal overflow at 390px');
    assert.deepEqual(errors,[],'browser JavaScript errors');
    console.log('PASS: 390px touch canvas scroll lock prevents drag, unlock restores dragging, quick-start anchor, zero page errors');
  } finally {await browser.close();}
})().catch(err=>{console.error('FAIL',err.stack);process.exitCode=1});