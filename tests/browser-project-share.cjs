'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const url=process.env.BASE_URL||'https://racewrap-ai-studio.onrender.com/index.html';
const fixture='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="#fff"/></svg>';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,acceptDownloads:true});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
   Object.defineProperty(navigator,'canShare',{configurable:true,value:opts=>Array.isArray(opts.files)&&opts.files.length===1});
   Object.defineProperty(navigator,'share',{configurable:true,value:async opts=>{
     window.__shared={title:opts.title,name:opts.files[0].name,type:opts.files[0].type,json:await opts.files[0].text()};
   }});
 });
 try{
   const response=await page.goto(url+'?share-test='+Date.now(),{waitUntil:'domcontentloaded'});
   assert.equal(response.status(),200);
   await page.waitForFunction(()=>document.querySelector('script[src*="studio-v3.js?v=native-project-share-22"]'));
   await page.locator('#template').setInputFiles({name:'licensed-share-fixture.svg',mimeType:'image/svg+xml',buffer:Buffer.from(fixture)});
   await page.waitForFunction(()=>document.querySelector('#sourceMeta').textContent.includes('licensed-share-fixture'));
   await page.locator('#number').fill('27');
   await page.locator('#shareProject').click();
   await page.waitForFunction(()=>Boolean(window.__shared));
   const shared=await page.evaluate(()=>window.__shared);
   assert.equal(shared.name,'racewrap-project.json');
   assert.equal(shared.type,'application/json');
   assert.match(shared.title,/RaceWrap AI/);
   const project=JSON.parse(shared.json);
   assert.equal(project.version,2);
   assert.equal(project.fields.number,'27');
   assert.ok(project.template.data.startsWith('data:image/png;base64,'));
   assert.equal(await page.locator('#shareProject').isEnabled(),true);
   assert.match(await page.locator('#status').innerText(),/share sheet/i);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
   assert.deepEqual(errors,[]);
 }finally{await context.close();}
 const fallback=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,acceptDownloads:true});
 const second=await fallback.newPage(),errors2=[];
 second.on('pageerror',e=>errors2.push(e.message));
 await second.addInitScript(()=>{
   Object.defineProperty(navigator,'canShare',{configurable:true,value:undefined});
   Object.defineProperty(navigator,'share',{configurable:true,value:undefined});
 });
 try{
   await second.goto(url+'?fallback-test='+Date.now(),{waitUntil:'domcontentloaded'});
   await second.locator('#template').setInputFiles({name:'licensed-fallback.svg',mimeType:'image/svg+xml',buffer:Buffer.from(fixture)});
   await second.waitForFunction(()=>document.querySelector('#sourceMeta').textContent.includes('licensed-fallback'));
   const pending=second.waitForEvent('download');
   await second.locator('#shareProject').click();
   const downloaded=await pending;
   assert.equal(downloaded.suggestedFilename(),'racewrap-project.json');
   const project=JSON.parse(fs.readFileSync(await downloaded.path(),'utf8'));
   assert.equal(project.version,2);
   assert.equal(project.template.name,'licensed-fallback.svg');
   assert.match(await second.locator('#status').innerText(),/downloaded instead/i);
   assert.equal(await second.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
   assert.deepEqual(errors2,[]);
 }finally{await fallback.close();await browser.close();}
 console.log('PASS project share: native file handoff, complete JSON, unsupported-browser download fallback, 390px touch, zero JS errors');
})().catch(e=>{console.error(e);process.exit(1);});
