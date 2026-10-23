'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let chromium;
if(process.env.TORQUE_PLAYWRIGHT)({chromium}=require(process.env.TORQUE_PLAYWRIGHT));
else{try{({chromium}=require('playwright'));}catch{({chromium}=require('/opt/node22/lib/node_modules/playwright'));}}
const BASE=(process.env.BASE_URL||'http://127.0.0.1:8765').replace(/\/$/,'');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.TORQUE_BROWSER_EXECUTABLE?{executablePath:process.env.TORQUE_BROWSER_EXECUTABLE}:{})});
 let checks=0;const pass=name=>{checks++;console.log('PASS '+name);};
 try{
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:900}}),errors=[],external=[];
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.origin!==new URL(BASE).origin||route.request().method()!=='GET'){external.push(url.origin+url.pathname);return route.abort();}
   if(url.pathname.endsWith('/nutri/config.js'))return route.fulfill({contentType:'application/javascript',body:'window.TORQUE_NUTRI_CONFIG={};'});
   if(url.pathname.endsWith('/nutri/app.js'))return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(__dirname,'../nutri/app.js'),'utf8')+'\nwindow.__substitutionsFixture={S,render,openEditor,published};'});
   return route.continue();
  });
  const page=await context.newPage();page.on('pageerror',error=>{errors.push(error.message);console.error('PAGE ERROR: '+error.message);});
  page.on('requestfailed',request=>console.error('REQUEST FAILED: '+new URL(request.url()).pathname+' '+request.failure()?.errorText));
  await page.goto(BASE+'/nutri/demo-nutricionista.html');await page.locator('.demo-notice').waitFor();
  const key=await page.evaluate(async()=>{
   const f=__substitutionsFixture;await f.openEditor(f.S.selected);
   const {makeFoodItem}=await import('/nutri/food-measures.js');
   const rice=MT_NUTRI_FOODS.find(food=>food.id==='taco:3');
   const index=f.S.edit.refeicoes[0].itens.length;
   f.S.edit.refeicoes[0].itens.push(makeFoodItem(rice,150,'g',{id:'demo-rice-substitutions'}));
   f.S.patients.find(p=>p.id===f.S.selected).restrictions='Restrição fictícia: revisar alergia antes de prescrever.';
   f.render();return '0:'+index;
  });
  const publishedBefore=await page.evaluate(()=>structuredClone(__substitutionsFixture.published()));
  const target=()=>page.evaluate(()=>structuredClone(__substitutionsFixture.S.edit.refeicoes[0].itens.at(-1)));
  const targetBefore=await target();
  await page.locator('[data-alternative="'+key+'"]').click();
  assert.match(await page.locator('.substitution-target').innerText(),/150 g/);
  assert((await page.locator('[data-substitution-select]').count())>0,'known cooked rice offers candidates');
  assert.match(await page.locator('#modal').innerText(),/Restrição fictícia/);
  assert.deepEqual(await target(),targetBefore);assert.deepEqual(await page.evaluate(()=>__substitutionsFixture.published()),publishedBefore);
  await page.locator('[data-substitution-select]').last().click();
  assert.equal(await page.locator('#modal').evaluate(dialog=>dialog.scrollTop),0,'a low suggestion opens its review at the top');
  assert.equal(await page.locator('.substitution-back').evaluate(button=>document.activeElement===button),true);
  await page.locator('[data-portion-measure-unit]').selectOption('g');
  await page.locator('[data-portion-measure-quantity]').fill('80');
  const originalComparison=await page.locator('#food-portion-comparison').innerText();
  await page.locator('[data-portion-measure-quantity]').fill('125');
  assert.notEqual(await page.locator('#food-portion-comparison').innerText(),originalComparison);
  assert.deepEqual(await target(),targetBefore,'preview never edits the working copy');
  await page.locator('#close-modal').click();assert.deepEqual(await target(),targetBefore);
  pass('suggestions and editable comparisons preview the target without changing draft or published plan');

  await page.locator('[data-food-measure-quantity="'+key+'"]').fill('0');
  await page.locator('[data-alternative="'+key+'"]').click();
  assert.equal(await page.locator('#modal').evaluate(dialog=>dialog.open),false);
  assert.equal(await page.locator('[data-food-measure-quantity="'+key+'"]').inputValue(),'0');
  assert.deepEqual(await target(),targetBefore);
  await page.locator('[data-food-measure-quantity="'+key+'"]').fill('150');
  pass('an invalid visible main quantity cannot calculate suggestions from stale state');

  await page.locator('[data-alternative="'+key+'"]').click();await page.locator('[data-substitution-select]').first().click();
  await page.locator('[data-portion-measure-unit]').selectOption('g');await page.locator('[data-portion-measure-quantity]').fill('125');
  const comparedRows=await page.locator('#food-portion-comparison tbody tr').evaluateAll(rows=>rows.map(row=>[...row.querySelectorAll('td')].map(td=>td.textContent.trim())));
  assert.equal(comparedRows.length,4);
  await page.locator('#modal-form button[type="submit"]').click();
  const withAlternative=await target(),alternative=withAlternative.substituicoes[0];
  assert.equal(alternative.qtd,125);assert.equal(alternative.measurement.selectedMeasureId,'g');assert(!alternative.id.startsWith('suggestion:'));assert.notEqual(alternative.id,withAlternative.id);
  for(const [index,nutrient] of ['k','pt','cb','g'].entries()){
   const expected=alternative.measurement.nutrients[nutrient]*1.25,original=targetBefore[nutrient]*targetBefore.qtd;
   assert(Math.abs(alternative[nutrient]*alternative.qtd-expected)<1e-8,nutrient);
   const displayed=comparedRows[index].map(value=>Number(value.replace(/\./g,'').replace(',','.').replace('−','-')));
   assert(Math.abs(displayed[0]-original)<.006,nutrient+' original');assert(Math.abs(displayed[1]-expected)<.006,nutrient+' candidate');assert(Math.abs(displayed[2]-(expected-original))<.006,nutrient+' delta');
  }
  const withoutAlternatives={...withAlternative};delete withoutAlternatives.substituicoes;assert.deepEqual(withoutAlternatives,targetBefore);
  assert.deepEqual(await page.evaluate(()=>__substitutionsFixture.published()),publishedBefore);
  await page.locator('[data-action="save-draft"]').click();
  assert.deepEqual(await page.evaluate(()=>__substitutionsFixture.published()),publishedBefore);
  pass('explicit confirmation adds only a measured alternative to the draft and saving does not publish');

  await page.locator('[data-alternative="'+key+'"]').click();await page.locator('[data-substitution-select]').first().click();
  await page.evaluate(()=>{const f=__substitutionsFixture,item=f.S.edit.refeicoes[0].itens.at(-1);item.qtd=151;});
  await page.locator('#modal-form button[type="submit"]').click();
  assert.equal((await target()).substituicoes.length,1);assert.equal(await page.locator('#modal').evaluate(dialog=>dialog.open),true);
  assert.match(await page.locator('#modal-feedback').innerText(),/mudou|novamente|reabra/i);
  await page.locator('#close-modal').click();await page.evaluate(()=>{const f=__substitutionsFixture;f.S.edit.refeicoes[0].itens.at(-1).qtd=150;f.render();});
  pass('a target edited after preview invalidates the pending suggestion');

  await page.locator('[data-action="publish-plan"]').click();await page.locator('#confirm-plan-review').check();await page.locator('#modal-form button[type="submit"]').click();
  await page.waitForFunction(()=>__substitutionsFixture.published().version===2);
  const publishedAfter=await page.evaluate(()=>structuredClone(__substitutionsFixture.published()));
  await page.evaluate(()=>{const f=__substitutionsFixture;f.S.role='patient';f.S.page='food';f.render();});
  await page.locator('.plan-alternatives summary').filter({hasText:targetBefore.nome}).click();
  assert.match(await page.locator('#app').innerText(),/125 g/);assert((await page.locator('#app').innerText()).includes(alternative.nome));
  await page.evaluate(id=>{const food=MT_NUTRI_FOODS.find(x=>x.id===id);if(food)food.k=999;__substitutionsFixture.render();},alternative.measurement.catalogId);
  assert.deepEqual(await page.evaluate(()=>__substitutionsFixture.published()),publishedAfter);
  pass('publication explicitly exposes the chosen quantity to the patient and retains its independent snapshot');

  await page.evaluate(async()=>{
   const f=__substitutionsFixture;f.S.role='nutri';await f.openEditor(f.S.selected);
   const {makeFoodItem}=await import('/nutri/food-measures.js');
   f.S.edit.refeicoes[0].itens.push(makeFoodItem({id:'fixture:unclassified',n:'Preparação sem grupo reconhecido',c:'Miscelâneas',baseAmount:100,baseUnit:'g',k:100,pt:5,cb:15,g:2,measures:[],source:'Demonstração isolada'},100,'g',{id:'unclassified'}));
   f.render();
  });
  const unknownKey=await page.evaluate(()=>'0:'+(__substitutionsFixture.S.edit.refeicoes[0].itens.length-1));
  await page.locator('[data-alternative="'+unknownKey+'"]').click();assert.equal(await page.locator('[data-substitution-select]').count(),0);
  await page.locator('[data-substitution-tab="catalog"]').click();await page.locator('[data-catalog-search]').fill('banana prata');await page.locator('[data-catalog-select]').first().click();
  await page.locator('[data-portion-measure-quantity]').fill('75');
  const gramsComparison=await page.locator('#food-portion-comparison').innerText();
  const householdUnit=await page.locator('[data-portion-measure-unit] option').evaluateAll(options=>options.find(option=>option.value!=='g')?.value);assert(householdUnit,'banana has an explicit household measure');
  await page.locator('[data-portion-measure-unit]').selectOption(householdUnit);assert.equal(await page.locator('#food-portion-comparison').innerText(),gramsComparison,'changing equivalent units preserves all compared nutrients');
  await page.locator('[data-portion-measure-unit]').selectOption('g');await page.locator('#modal-form button[type="submit"]').click();
  assert.equal((await target()).substituicoes[0].qtd,75);assert.deepEqual(await page.evaluate(()=>__substitutionsFixture.published()),publishedAfter);
  pass('an unclassified target offers no fabricated match and retains the manual catalog workflow');

  for(const light of [false,true]){
   await page.setViewportSize({width:390,height:844});await page.evaluate(light=>document.body.classList.toggle('theme-light',light),light);
   await page.locator('[data-alternative="'+key+'"]').click();
   const geometry=await page.locator('#modal').evaluate(dialog=>({width:dialog.clientWidth,scroll:dialog.scrollWidth,left:dialog.getBoundingClientRect().left,right:dialog.getBoundingClientRect().right,viewport:innerWidth}));
   assert(geometry.scroll<=geometry.width+1,'modal has no horizontal overflow');assert(geometry.left>=0&&geometry.right<=geometry.viewport+1);
   assert(await page.locator('[data-substitution-tab="catalog"]').isVisible());await page.locator('#close-modal').click();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);pass('suggestions remain usable in both mobile themes without JavaScript errors or external writes');
  await context.close();console.log(checks+' substitution UI checks passed');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
