const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});try{
for(const width of [1280,390]){
 const page=await browser.newPage({viewport:{width,height:900},isMobile:width===390,hasTouch:width===390});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.BASE_URL);await page.locator('#openReview').click();assert.equal(await page.locator('#conceptReview').evaluate(e=>e.open),false);
 await page.locator('#useStarter').click();await page.waitForTimeout(650);
 await page.locator('#number').fill('81');
 const download=async id=>{const [d]=await Promise.all([page.waitForEvent('download'),page.locator(id).click()]);return fs.readFileSync(await d.path())};
 const before=await download('#saveProject');const svg=await download('#save');
 await page.locator('#openReview').click();await page.waitForFunction(()=>document.querySelector('#reviewImage').complete&&document.querySelector('#reviewImage').naturalWidth>0);
 assert.match(await page.locator('#reviewTitle').textContent(),/81/);
 assert.equal(await page.locator('#reviewPalette span').count(),3);
 const rendered=await page.locator('#reviewImage').evaluate(async e=>await(await fetch(e.src)).text());assert.equal(rendered,svg.toString());assert(!rendered.includes('numberResize'));
 await page.waitForTimeout(100);assert.equal(await page.locator('#reviewZoom').textContent(),'100%');
 await page.locator('#reviewZoomIn').click();await page.locator('#reviewZoomIn').click();assert.equal(await page.locator('#reviewZoom').textContent(),'225%');
 const transform=()=>page.locator('#reviewImage').evaluate(e=>e.style.transform);const start=await transform();const box=await page.locator('#reviewViewport').boundingBox();
 if(width===390){const cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+box.width/2-60,y:box.y+box.height/2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
 else {await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2-60,box.y+box.height/2);await page.mouse.up();}
 assert.notEqual(await transform(),start);
 await page.locator('#reviewBackdrop').selectOption('#101722');assert.equal(await page.locator('#reviewViewport').evaluate(e=>e.style.background),'rgb(16, 23, 34)');
 const png=await download('#reviewPNG');assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 const board=await download('#reviewBoard');assert.equal(board.readUInt32BE(16),2000);assert.equal(board.readUInt32BE(20),1400);
 await page.locator('#reviewViewport').focus();await page.keyboard.press('0');assert.equal(await page.locator('#reviewZoom').textContent(),'100%');
 await page.keyboard.press('Escape');assert.equal(await page.locator('#conceptReview').evaluate(e=>e.open),false);assert(await page.locator('#openReview').evaluate(e=>e===document.activeElement));
 const after=await download('#saveProject');assert.deepEqual(JSON.parse(after).fields,JSON.parse(before).fields);assert.deepEqual(JSON.parse(after).positions,JSON.parse(before).positions);
 await page.locator('#openReview').click();await page.locator('#closeReview').click();await page.waitForFunction(()=>!document.querySelector('#reviewImage').hasAttribute('src'));
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);await page.close();
}console.log('PASS concept review: desktop/touch pan, zoom, export parity, PNG/board, palette, keyboard, cleanup, unchanged project');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});

