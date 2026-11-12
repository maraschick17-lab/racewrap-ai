'use strict';
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.BASE_URL||'https://racewrap-ai-studio.onrender.com';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox']});
 try {
  for(const mobile of [false,true]){
   const context=await browser.newContext({viewport:{width:mobile?390:1280,height:mobile?844:900},hasTouch:mobile,isMobile:mobile});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   try{
    await page.goto(base+'/?durableDraft='+Date.now(),{waitUntil:'domcontentloaded'});
    const save=page.locator('#saveDraftNow');
    assert.equal(await save.isDisabled(),true,'manual save must require a template');
    const svg='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="white"/></svg>';
    await page.locator('#template').setInputFiles({name:'licensed-draft.svg',mimeType:'image/svg+xml',buffer:Buffer.from(svg)});
    await page.waitForFunction(()=>document.querySelector('#sourceMeta').textContent.includes('licensed-draft.svg'));
    assert.equal(await save.isEnabled(),true);
    await page.locator('#number').fill('63');
    await save.click();
    await page.waitForFunction(()=>document.querySelector('#autosaveStatus').textContent.includes('Draft saved in this browser'));
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>!document.querySelector('#recoverDraft').disabled);
    await page.locator('#recoverDraft').click();
    await page.waitForFunction(()=>document.querySelector('#sourceMeta').textContent.includes('licensed-draft.svg'));
    assert.equal(await page.locator('#number').inputValue(),'63','manual save should restore current edits');
    // Clear pending debounce and committed draft. It must not reappear after reload.
    await page.locator('#clearDraft').click();
    await page.waitForFunction(()=>document.querySelector('#autosaveStatus').textContent.includes('Browser draft cleared'));
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.querySelector('#autosaveStatus').textContent.includes('Autosave will start'));
    assert.equal(await page.locator('#recoverDraft').isDisabled(),true,'cleared draft must remain absent');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'horizontal overflow');
    assert.deepEqual(errors,[],'page JS errors');
    console.log('PASS committed manual draft save, recovery, clear and reload; '+(mobile?'390px touch':'1280px desktop'));
   }finally{await context.close();}
  }
 }finally{await browser.close();}
})().catch(err=>{console.error('FAIL',err.stack);process.exitCode=1});
