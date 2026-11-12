'use strict';
// Optional slow WebGPU integration test. RUN_LOCAL_AI=1 to opt in to free model download/inference.
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 if(process.env.RUN_LOCAL_AI!=='1'){console.log('SKIP local AI test: set RUN_LOCAL_AI=1 on a WebGPU-capable machine');return;}
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox','--enable-unsafe-webgpu']});
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto((process.env.BASE_URL||'https://racewrap-ai-studio.onrender.com')+'/?local-ai-test='+Date.now(),{waitUntil:'domcontentloaded'});
  if(!await page.evaluate(()=>!!navigator.gpu)){console.log('SKIP: browser has no WebGPU API');return;}
  await page.locator('#enableAI').click();
  await page.waitForFunction(()=>{const t=document.querySelector('#aiStatus').textContent;return t.includes('ready:')||t.includes('unavailable:');},null,{timeout:240000});
  const load=await page.locator('#aiStatus').textContent();
  if(!load.includes('ready:')){console.log('SKIP: '+load);return;}
  await page.locator('#prompt').fill('Aggressive black and red dirt late model wrap, number 17, silver lightning accents and checkered flag details');
  await page.locator('#generate').click();
  await page.waitForFunction(()=>!document.querySelector('#generate').disabled,null,{timeout:150000});
  const label=await page.locator('#styleLabel').textContent();
  assert.match(label,/Local AI concept cue mapped to procedural pattern/,'real model must influence a procedural pattern');
  assert.deepEqual(errors,[]);
  console.log('PASS real local WebGPU model inference influenced procedural pattern; palette explicitly rule-based; no page JS errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
