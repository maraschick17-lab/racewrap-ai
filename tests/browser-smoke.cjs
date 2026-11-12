'use strict';
// Optional real-browser smoke test. Requires Playwright and a Chrome/Chromium installation.
// Usage: PLAYWRIGHT_MODULE=/path/to/playwright CHROME_PATH=/path/to/chrome node tests/browser-smoke.cjs
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.BASE_URL||'https://racewrap-ai-studio.onrender.com';
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox']});
  const page=await browser.newPage({acceptDownloads:true,viewport:{width:1280,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try {
    const response=await page.goto(base+'/?smoke='+Date.now(),{waitUntil:'domcontentloaded'});
    assert.equal(response.status(),200);
    assert.equal(await page.locator('#enableAI').count(),1,'Local AI opt-in control missing');
    const svg='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="white"/></svg>';
    await page.locator('#template').setInputFiles({name:'licensed-test.svg',mimeType:'image/svg+xml',buffer:Buffer.from(svg)});
    await page.waitForFunction(()=>document.querySelector('#sourceMeta').textContent.includes('licensed-test.svg'));
    const png64=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=180;c.height=60;c.getContext('2d').fillRect(0,0,180,60);return c.toDataURL('image/png').split(',')[1];});
    const png=Buffer.from(png64,'base64');
    await page.locator('#logo').setInputFiles([{name:'a.png',mimeType:'image/png',buffer:png},{name:'b.png',mimeType:'image/png',buffer:png}]);
    await page.waitForFunction(()=>document.querySelectorAll('#logoList button').length===2);
    await page.locator('#logoList button').nth(1).click();
    await page.locator('#logoSize').evaluate(el=>{el.value='38';el.dispatchEvent(new Event('input',{bubbles:true}));});
    assert.equal(await page.locator('#extraLogo1').evaluate(el=>el.style.width),'38%');
    await page.locator('#tracePanel').click();
    await page.locator('#panelOverlay').scrollIntoViewIfNeeded();
    const rect=await page.locator('#panelOverlay').boundingBox();
    for(const [x,y] of [[.18,.35],[.75,.35],[.73,.75],[.18,.75]])await page.mouse.click(rect.x+rect.width*x,rect.y+rect.height*y);
    await page.locator('#finishPanel').click();
    assert.match(await page.locator('#panelStatus').textContent(),/1 artwork mask/);
    const [conceptDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#save').click()]);
    const concept=fs.readFileSync(await conceptDownload.path(),'utf8');
    assert.equal((concept.match(/<image /g)||[]).length,3);
    assert.ok(concept.includes('racewrapPanelClip'),'Concept SVG lacks panel mask');
    const [projectDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#saveProject').click()]);
    const project=JSON.parse(fs.readFileSync(await projectDownload.path(),'utf8'));
    assert.equal(project.extraLogos.length,1);
    assert.equal(project.panelMasks.length,1);
    await page.locator('#removeLogo').click();
    assert.equal(await page.locator('#logoList button').count(),1);
    await page.locator('#openProject').setInputFiles({name:'project.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
    await page.waitForFunction(()=>document.querySelectorAll('#logoList button').length===2);
    assert.match(await page.locator('#panelStatus').textContent(),/1 artwork mask/);
    await page.locator('#generate').click();
    await page.waitForFunction(()=>!document.querySelector('#generate').disabled,{timeout:30000});
    assert.equal(errors.length,0,'Browser JavaScript errors: '+errors.join('; '));
    console.log('PASS: import, two logos, independent sizing, panel masks, SVG export, JSON restore, rule-based design, zero page errors');
  } finally {await browser.close();}
})().catch(e=>{console.error('FAIL',e.stack);process.exitCode=1});
