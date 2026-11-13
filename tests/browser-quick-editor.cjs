'use strict';
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.BASE_URL||'http://127.0.0.1:43137';
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox']});
  try{
    for(const mobile of [false,true]){
      const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1280,height:900},isMobile:mobile,hasTouch:mobile,acceptDownloads:true});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      const response=await page.goto(base+'/?quick='+Date.now(),{waitUntil:'domcontentloaded'});
      assert.equal(response.status(),200);
      await page.locator('#quickEdit').waitFor();
      assert.equal(await page.locator('#quickNumber').inputValue(),'17');
      await page.locator('#useStarter').click();
      await page.waitForFunction(()=>document.querySelector('#bodyImage').style.display!=='none');
      await page.locator('#quickNumber').fill('77');
      assert.equal(await page.locator('#number').inputValue(),'77');
      assert.equal((await page.locator('#graphic').innerText()).trim(),'77');
      await page.locator('#quickAccent').fill('#00cc88');
      assert.equal(await page.locator('#accent').inputValue(),'#00cc88');
      await page.locator('#quickFocus').click();
      assert.equal(await page.locator('#quickFocus').getAttribute('aria-pressed'),'true');
      assert.equal(await page.locator('.grid>.panel:first-child').isVisible(),false);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#quickFocus').getAttribute('aria-pressed'),'false');
      assert.equal(await page.locator('.grid>.panel:first-child').isVisible(),true);
      await page.locator('#quickFocus').click();
      await page.locator('#quickSponsorJump').click();
      assert.equal(await page.locator('#quickFocus').getAttribute('aria-pressed'),'false');
      assert.equal(await page.evaluate(()=>document.activeElement.id),'dropzone');
      await page.locator('#quickExportJump').click();
      assert.equal(await page.evaluate(()=>document.activeElement.id),'saveProject');
      const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#saveProject').click()]);
      assert.match(download.suggestedFilename(),/\.json$/);
      const noOverflow=await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1);
      assert(noOverflow,'horizontal overflow '+(mobile?'mobile':'desktop'));
      assert.deepEqual(errors,[]);
      await page.close();
    }
    console.log('PASS quick editor number/colors, focus mode, project save, 1280px/390px, zero errors');
  }finally{await browser.close();}
})().catch(e=>{console.error('FAIL',e);process.exit(1)});
