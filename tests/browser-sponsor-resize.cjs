 'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.BASE_URL||'http://127.0.0.1:43137';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox']});
 try{for(const width of [1280,390]){
 const page=await browser.newPage({viewport:{width,height:850},hasTouch:width===390,isMobile:width===390,acceptDownloads:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.locator('#template').setInputFiles({name:'licensed.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="white"/></svg>')});
 await page.waitForFunction(()=>document.querySelector('#sourceMeta').textContent.includes('licensed.svg'));
 for(let i=0;i<2;i++){
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=200;c.height=100;const x=c.getContext('2d');x.fillStyle='#a03040';x.fillRect(0,0,200,100);return c.toDataURL().split(',')[1];});
 await page.locator('#logo').setInputFiles({name:'sponsor'+i+'.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await page.waitForFunction(n=>document.querySelectorAll('#logoList button').length===n,i+1);
 }
 await page.locator('#logoList button').first().click();
 await page.locator('#sponsorResize').waitFor({state:'visible'});
 const original=await page.locator('#logoGraphic').evaluate(e=>({width:e.style.width,left:e.style.left,top:e.style.top}));
 const other=await page.locator('[id^="extraLogo"]').evaluate(e=>e.style.width);
 await page.locator('#sponsorResize').scrollIntoViewIfNeeded();
 const handle=await page.locator('#sponsorResize').boundingBox();
 const x=handle.x+handle.width/2,y=handle.y+handle.height/2;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+35,y+17.5,{steps:5});await page.mouse.up();
 const after=await page.locator('#logoGraphic').evaluate(e=>({width:e.style.width,left:e.style.left,top:e.style.top,ratio:e.offsetWidth/e.offsetHeight}));
 assert(parseFloat(after.width)>parseFloat(original.width),'drag grows logo');
 assert.equal(after.left,original.left);assert.equal(after.top,original.top);assert(Math.abs(after.ratio-2)<.1);
 assert.equal(await page.locator('[id^="extraLogo"]').evaluate(e=>e.style.width),other,'other sponsor unchanged');
 await page.locator('#sponsorResize').focus();await page.keyboard.press('ArrowRight');
 assert(parseFloat(await page.locator('#logoGraphic').evaluate(e=>e.style.width))>parseFloat(after.width));
 const beforeCancel=await page.locator('#logoGraphic').evaluate(e=>e.style.width);
 const b=await page.locator('#sponsorResize').boundingBox();await page.mouse.move(b.x+18,b.y+18);await page.mouse.down();await page.mouse.move(b.x+45,b.y+30);await page.keyboard.press('Escape');await page.mouse.up();
 assert.equal(await page.locator('#logoGraphic').evaluate(e=>e.style.width),beforeCancel);
 if(width===390){
 await page.locator('#sponsorResize').scrollIntoViewIfNeeded();
 const h=await page.locator('#sponsorResize').boundingBox(),cdp=await page.context().newCDPSession(page);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:h.x+18,y:h.y+18}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:h.x+38,y:h.y+28}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
 assert.equal(await page.locator('#logoGraphic').evaluate(e=>e.style.width),beforeCancel,'cancelled touch restores size');
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:h.x+18,y:h.y+18}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:h.x+38,y:h.y+28}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 assert(parseFloat(await page.locator('#logoGraphic').evaluate(e=>e.style.width))>parseFloat(beforeCancel),'real browser touch grows logo');
 await cdp.detach();
 }
 const finalWidth=await page.locator('#logoGraphic').evaluate(e=>e.style.width);
 const d=page.waitForEvent('download');await page.locator('#saveProject').click();const saved=JSON.parse(fs.readFileSync(await(await d).path(),'utf8'));
 assert.equal(saved.positions.logoGraphic.width,finalWidth);
 const svgD=page.waitForEvent('download');await page.locator('#save').click();const svg=fs.readFileSync(await(await svgD).path(),'utf8');assert(!svg.includes('sponsorSelection'));assert(!svg.includes('sponsorResize'));
 await page.locator('#canvasLock').click();await page.locator('#sponsorResize').waitFor({state:'hidden'});
 await page.locator('#canvasLock').click();await page.locator('#sponsorResize').waitFor({state:'visible'});
 await page.locator('#openProject').setInputFiles({name:'resized.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
 await page.waitForFunction(w=>document.querySelector('#logoGraphic').style.width===w,finalWidth);
 await page.locator('#logoList button').first().click();await page.locator('#sponsorResize').waitFor({state:'visible'});
 assert.equal(await page.locator('#logoGraphic').evaluate(e=>e.style.width),finalWidth,'resized width restored from project');
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));assert.deepEqual(errors,[]);
 console.log('PASS '+width+'px sponsor corner resize, aspect, independent logos, keyboard, Escape, project/export, scroll lock');await page.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
