const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 try{for(const width of [1280,390]){
  const page=await browser.newPage({viewport:{width,height:900},isMobile:width===390,hasTouch:width===390});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.BASE_URL||'http://127.0.0.1:43137');
  await page.locator('#useStarter').click();await page.waitForTimeout(650);
  await page.locator('#number').fill('42');await page.locator('#sponsor').fill('LOCAL RACING');
  const save=async id=>{const [d]=await Promise.all([page.waitForEvent('download'),page.locator(id).click()]);return fs.readFileSync(await d.path(),'utf8')};
  for(const id of ['flames','scallops','sweep']){
   await page.locator('[data-composition-look='+id+']').click();await page.waitForTimeout(450);
   assert.equal(await page.locator('#pattern').inputValue(),id);
   assert.equal(await page.locator('#number').inputValue(),'42');assert.equal(await page.locator('#sponsor').inputValue(),'LOCAL RACING');
   assert.equal(await page.locator('#patternLayer [data-composition='+id+']').count(),1);
   const dimensions=await page.evaluate(()=>[document.querySelector('#canvas').clientHeight,document.querySelector('#patternLayer svg').getBoundingClientRect().height]);assert(Math.abs(dimensions[0]-dimensions[1])<2,'artwork SVG fills actual canvas height');
   const svg=await save('#save');assert(svg.includes('data-composition="'+id+'"'));assert(svg.includes('stroke="#'));
   await page.locator('#slotSave0').click();await page.locator('#pattern').selectOption('none');await page.locator('#slotLoad0').click();
   assert.equal(await page.locator('#pattern').inputValue(),id);
  }
  const json=JSON.parse(await save('#saveProject'));assert.equal(json.fields.pattern,'sweep');assert.equal(json.designSlots[0].pattern,'sweep');
  await page.locator('[data-composition-look=flames]').click();await page.waitForTimeout(450);
  await page.locator('#undoDesign').click();await page.waitForFunction(()=>document.querySelector('#pattern').value==='sweep');
  await page.locator('#redoDesign').click();await page.waitForFunction(()=>document.querySelector('#pattern').value==='flames');
  await page.locator('#openProject').setInputFiles({name:'composition.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(json))});
  await page.waitForFunction(()=>document.querySelector('#pattern').value==='sweep');
  await page.locator('#pattern').selectOption('none');await page.locator('#secondaryPattern').selectOption('scallops');
  assert.equal(await page.locator('#patternLayer [data-layer=secondary] [data-composition=scallops]').count(),1);
  assert((await save('#save')).includes('data-composition="scallops"'));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
  await page.close();
 }console.log('PASS signature compositions: desktop/mobile, artwork/export, preserved text, slots, JSON, history, secondary layer, no overflow/errors');}
 finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
