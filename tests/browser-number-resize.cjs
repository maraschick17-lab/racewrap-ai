const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});try{
for(const width of [1280,390]){
 const page=await browser.newPage({viewport:{width,height:900},isMobile:width===390,hasTouch:width===390});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.BASE_URL||'http://127.0.0.1:43137');await page.locator('#useStarter').click();await page.waitForTimeout(650);
 const pos=await page.locator('#graphic').evaluate(e=>[e.style.left,e.style.top]);
 const size=async()=>Number(await page.locator('#numberScale').inputValue());
 await page.locator('#numberResize').scrollIntoViewIfNeeded();let h=await page.locator('#numberResize').boundingBox();
 await page.mouse.move(h.x+18,h.y+18);await page.mouse.down();await page.mouse.move(h.x+38,h.y+28,{steps:5});await page.mouse.up();assert(await size()>100);
 assert.deepEqual(await page.locator('#graphic').evaluate(e=>[e.style.left,e.style.top]),pos);
 await page.waitForTimeout(450);const grown=await size();await page.locator('#undoDesign').click();await page.waitForFunction(()=>document.querySelector('#numberScale').value==='100');
 await page.locator('#redoDesign').click();await page.waitForFunction(v=>Number(document.querySelector('#numberScale').value)===v,grown);
 await page.locator('#numberResize').focus();await page.keyboard.press('ArrowLeft');assert.equal(await size(),grown-5);
 const before=await size();await page.locator('#numberResize').scrollIntoViewIfNeeded();h=await page.locator('#numberResize').boundingBox();
 await page.mouse.move(h.x+18,h.y+18);await page.mouse.down();await page.mouse.move(h.x+40,h.y+30);await page.keyboard.press('Escape');await page.mouse.up();assert.equal(await size(),before);
 if(width===390){
 const cdp=await page.context().newCDPSession(page);h=await page.locator('#numberResize').boundingBox();
 for(const cancel of [true,false]){
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:h.x+18,y:h.y+18}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:h.x+38,y:h.y+28}]});
 await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});
 assert(cancel?await size()===before:await size()>before);
 }await cdp.detach();
 }
 const save=async id=>{const [d]=await Promise.all([page.waitForEvent('download'),page.locator(id).click()]);return fs.readFileSync(await d.path(),'utf8')};
 const saved=JSON.parse(await save('#saveProject'));assert.equal(Number(saved.fields.numberScale),await size());
 const svg=await save('#save');assert(!svg.includes('numberSelection'));assert(!svg.includes('numberResize'));
 await page.locator('#numberScale').fill('60');await page.locator('#openProject').setInputFiles({name:'number.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
 await page.waitForFunction(v=>document.querySelector('#numberScale').value===v,saved.fields.numberScale);
 await page.locator('#canvasLock').click();await page.locator('#numberResize').waitFor({state:'hidden'});await page.locator('#canvasLock').click();await page.locator('#numberResize').waitFor({state:'visible'});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);await page.close();
}console.log('PASS direct number resize: desktop/touch, anchor, keyboard, cancel, undo/redo, JSON, export exclusion, scroll lock');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
