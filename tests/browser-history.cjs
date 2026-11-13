const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 try {for(const mobile of [false,true]){
  const page=await browser.newPage({viewport:{width:mobile?390:1280,height:900},hasTouch:mobile,isMobile:mobile});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.BASE_URL||'http://127.0.0.1:43137');
  await page.locator('#useStarter').click();
  await page.waitForTimeout(600);
  const original=await page.locator('#number').inputValue();
  await page.locator('#number').fill('88');await page.waitForTimeout(450);
  await page.locator('#accent').fill('#00cc88');await page.waitForTimeout(450);
  await page.locator('#undoDesign').click();
  await page.waitForFunction(()=>document.querySelector('#accent').value!=='#00cc88');
  assert.equal(await page.locator('#number').inputValue(),'88');
  await page.locator('#undoDesign').click();
  await page.waitForFunction(v=>document.querySelector('#number').value===v,original);
  await page.locator('#redoDesign').click();
  await page.waitForFunction(()=>document.querySelector('#number').value==='88');
  await page.locator('#redoDesign').click();
  await page.waitForFunction(()=>document.querySelector('#accent').value==='#00cc88');
  await page.locator('#undoDesign').click();
  await page.waitForFunction(()=>document.querySelector('#accent').value!=='#00cc88');
  await page.locator('#number').fill('39');await page.waitForTimeout(450);
  assert(await page.locator('#redoDesign').isDisabled(),'new edit clears redo branch');
  const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=180;c.height=60;c.getContext('2d').fillRect(0,0,180,60);return c.toDataURL().split(',')[1];});
  await page.locator('#logo').setInputFiles({name:'sponsor.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await page.waitForFunction(()=>document.querySelectorAll('#logoList button').length===1);
  await page.waitForTimeout(450);
  await page.locator('#removeLogo').click();await page.waitForTimeout(450);
  assert.equal(await page.locator('#logoList button').count(),0);
  await page.locator('#undoDesign').click();
  await page.waitForFunction(()=>document.querySelectorAll('#logoList button').length===1);
  await page.locator('#graphic').scrollIntoViewIfNeeded();
  const before=await page.locator('#graphic').evaluate(el=>el.style.left);
  const box=await page.locator('#graphic').boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
  await page.mouse.move(box.x+box.width/2+25,box.y+box.height/2+10,{steps:4});await page.mouse.up();
  await page.waitForTimeout(450);
  assert.notEqual(await page.locator('#graphic').evaluate(el=>el.style.left),before);
  await page.locator('#undoDesign').click();
  await page.waitForFunction(v=>document.querySelector('#graphic').style.left===v,before);
  await page.locator('#tracePanel').click();
  await page.locator('#panelOverlay').scrollIntoViewIfNeeded();
  const panel=await page.locator('#panelOverlay').boundingBox();
  for(const [x,y] of [[.18,.35],[.75,.35],[.73,.75],[.18,.75]])await page.mouse.click(panel.x+panel.width*x,panel.y+panel.height*y);
  await page.locator('#finishPanel').click();await page.waitForTimeout(450);
  await page.locator('#clearPanels').click();await page.waitForTimeout(450);
  await page.locator('#undoDesign').click();
  await page.waitForFunction(()=>document.querySelector('#panelStatus').textContent.includes('1 artwork mask'));

  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert.deepEqual(errors,[]);await page.close();
 }console.log('PASS session undo/redo, independent edits, branch replacement, sponsor/mask restoration, canvas movement, desktop/mobile, no errors');}
 finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
