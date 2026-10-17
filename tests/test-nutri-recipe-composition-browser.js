'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let chromium;if(process.env.TORQUE_PLAYWRIGHT)({chromium}=require(process.env.TORQUE_PLAYWRIGHT));else{try{({chromium}=require('playwright'));}catch{({chromium}=require('/opt/node22/lib/node_modules/playwright'));}}
const BASE=process.env.BASE_URL||'http://127.0.0.1:8765';
(async()=>{
 const browser=await chromium.launch({headless:true});let checks=0;
 try{
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:900}}),errors=[],external=[];
 await context.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.origin!==new URL(BASE).origin||route.request().method()!=='GET'){external.push(url.href);return route.abort();}
  if(url.pathname.endsWith('/nutri/config.js'))return route.fulfill({contentType:'application/javascript',body:'window.TORQUE_NUTRI_CONFIG={};'});
  if(url.pathname.endsWith('/nutri/app.js'))return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(__dirname,'../nutri/app.js'),'utf8')+'\nwindow.__recipeFixture={S,render,openEditor,published};'});
  return route.continue();
 });
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 const pass=name=>{checks++;console.log('PASS '+name);};
 await page.goto(BASE+'/nutri/demo-nutricionista.html');await page.locator('.demo-notice').waitFor();
 await page.evaluate(()=>{const f=window.__recipeFixture;for(const [id,n,k,pt,cb,g] of [['fa','Ingrediente A de teste',100,10,20,2],['fb','Ingrediente B de teste',50,5,10,1]])f.S.resources.push({id,kind:'food',clinic_id:f.S.clinic.id,shared:true,version:1,data:{n,p:'100 g',k,pt,cb,g,source:'Dados sintéticos'}});f.S.page='recipes';f.render();});
 await page.evaluate(()=>{const f=window.__recipeFixture;f.S.resources.push({id:'legacy-recipe-test',title:'Receita legada de teste',kind:'recipe',clinic_id:f.S.clinic.id,shared:false,version:7,data:{categoria:'Legada',rendimento:3,ingredientes:['Arroz em texto'],modo:['Prepare normalmente.'],k:250,pt:8,g:0,inicio:'2026-01-01',metadata:{origin:'legacy-import',tags:['keep']},observacoes:'Sirva morno.'}});f.render();});
 await page.locator('[data-x="edit-recipe"][data-id="legacy-recipe-test"]').click();assert.equal(await page.locator('#recipe-category').inputValue(),'Legada');assert.equal(await page.locator('#recipe-yield').inputValue(),'3');await page.locator('#recipe-title').fill('Receita legada revisada');await page.locator('#recipe-review').check();await page.locator('#modal-form button[type=submit]').click();await page.locator('#modal').waitFor({state:'hidden'});
 const legacy=await page.evaluate(()=>window.__recipeFixture.S.resources.find(x=>x.id==='legacy-recipe-test'));assert.equal(legacy.data.k,250);assert.equal(legacy.data.pt,8);assert.equal(legacy.data.g,0);assert(!Object.hasOwn(legacy.data,'cb'));assert.equal(legacy.data.inicio,'2026-01-01');assert.deepEqual(legacy.data.metadata,{origin:'legacy-import',tags:['keep']});assert.equal(legacy.shared,false);assert.deepEqual(legacy.data.ingredientes,['Arroz em texto']);
 pass('editing legacy text recipes preserves partial macros, zero values, dates, private sharing and custom metadata');
 await page.locator('[data-x="resource-new"][data-id="recipe"]').click();
 await page.locator('#recipe-title').fill('Receita estruturada de teste');await page.locator('#recipe-yield').fill('2');
 await page.locator('#recipe-search').fill('Ingrediente A de teste');await page.locator('[data-recipe-add]').click();await page.locator('[data-recipe-quantity="0"]').fill('2');
 await page.locator('#recipe-search').fill('Ingrediente B de teste');await page.locator('[data-recipe-add]').click();
 assert.match(await page.locator('#recipe-nutrition').innerText(),/125 kcal/);assert.match(await page.locator('#recipe-nutrition').innerText(),/12,5 g de proteína/);
 await page.locator('#recipe-steps').fill('Misture os ingredientes.\nPrepare conforme orientação.');await page.locator('#recipe-source').fill('Fonte sintética para teste');await page.locator('#recipe-notes').fill('Sirva morno após descansar.');await page.locator('#recipe-text').fill('Azeite ainda sem quantidade');assert.match(await page.locator('#recipe-nutrition').innerText(),/Há ingredientes ainda sem quantificação/);assert.doesNotMatch(await page.locator('#recipe-nutrition').innerText(),/125 kcal/);
 for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'recipe editor width '+width);assert(await page.locator('#modal').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'recipe modal width '+width);}
 if(process.env.TORQUE_TEST_OUTPUT_DIR){fs.mkdirSync(process.env.TORQUE_TEST_OUTPUT_DIR,{recursive:true});await page.locator('#modal').evaluate(el=>el.scrollTop=0);await page.locator('#modal').screenshot({path:path.join(process.env.TORQUE_TEST_OUTPUT_DIR,'nutri-receita-editor.png')});}
 await page.locator('#recipe-review').check();await page.locator('#modal-form button[type=submit]').click();await page.locator('#modal').waitFor({state:'hidden'});
 const recipeId=await page.evaluate(()=>window.__recipeFixture.S.resources.find(x=>x.title==='Receita estruturada de teste').id);
 await page.locator('[data-x="recipe-detail"][data-id="clinic:'+recipeId+'"]').click();assert.match(await page.locator('#modal-body').innerText(),/Azeite ainda sem quantidade/);assert.match(await page.locator('#modal-body').innerText(),/Sirva morno após descansar/);await page.locator('#close-modal').click();
 pass('professional saves pending ingredients visibly and partial composition never presents complete nutrition on mobile or desktop');
 await page.evaluate(async()=>{const f=window.__recipeFixture;await f.openEditor(f.S.selected);f.S.edit.refeicoes=[{id:'recipe-meal',titulo:'Almoço',hora:'12:00',itens:[]}];f.render();});
 await page.locator('[data-x="prescribe-recipe"]').click();await page.locator('#recipe-prescribe-choice').selectOption('clinic:'+recipeId);await page.locator('#recipe-prescribe-review').check();await page.locator('#modal-form button[type=submit]').click();await page.locator('#modal-feedback').waitFor({state:'visible'});assert.match(await page.locator('#modal-feedback').innerText(),/ingredientes sem quantidade/);assert.equal(await page.evaluate(()=>window.__recipeFixture.S.edit.refeicoes[0].itens.length),0);await page.locator('#cancel-modal').click();
 pass('pending text ingredients block prescription without changing the draft even after professional confirmation');
 await page.evaluate(()=>{const f=window.__recipeFixture;f.S.page='recipes';f.render();});await page.locator('[data-x="edit-recipe"][data-id="'+recipeId+'"]').click();assert.equal(await page.locator('[data-recipe-quantity="0"]').inputValue(),'2');assert.equal(await page.locator('#recipe-yield').inputValue(),'2');assert.equal(await page.locator('#recipe-text').inputValue(),'Azeite ainda sem quantidade');await page.locator('#recipe-text').fill('');assert.match(await page.locator('#recipe-nutrition').innerText(),/125 kcal/);await page.locator('#recipe-review').check();await page.locator('#modal-form button[type=submit]').click();await page.locator('#modal').waitFor({state:'hidden'});
 await page.evaluate(()=>{const f=window.__recipeFixture;f.S.page='editor';f.render();});
 await page.locator('[data-x="prescribe-recipe"]').click();await page.locator('#recipe-prescribe-choice').selectOption('clinic:'+recipeId);await page.locator('#recipe-prescribe-quantity').fill('2');await page.locator('#recipe-prescribe-review').check();await page.locator('#modal-form button[type=submit]').click();
 const state=await page.evaluate(()=>{const f=window.__recipeFixture;return {item:f.S.edit.refeicoes[0].itens[0],published:f.published().data.refeicoes.flatMap(x=>x.itens)}});
 assert.equal(state.item.k,125);assert.equal(state.item.qtd,2);assert.equal(state.item.recipeComposition.ingredients[0].qtd,2);assert(!state.published.some(x=>x.recipeComposition));
 pass('explicitly prescribing servings adds a detached numeric food snapshot only to the draft');
 await page.locator('[data-action="save-draft"]').click();await page.evaluate(()=>window.__recipeFixture.openEditor(window.__recipeFixture.S.selected));assert.match(await page.locator('.prescription-food').innerText(),/250/);
 await page.locator('[data-action="publish-plan"]').click();await page.locator('#confirm-plan-review').check();await page.locator('#modal-form button[type=submit]').click();await page.waitForFunction(()=>window.__recipeFixture.published().version===2);
 const snapshot=await page.evaluate(()=>window.__recipeFixture.published().data.refeicoes[0].itens[0].recipeComposition);assert.equal(snapshot.ingredients.length,2);
 await page.evaluate(id=>{const f=window.__recipeFixture;f.S.resources.find(x=>x.id===id).data.composition.ingredients[0].qtd=99;f.S.role='patient';f.S.page='recipes';f.render();},recipeId);
 const linked=page.locator('.recipe-section').filter({has:page.getByRole('heading',{name:'Receitas do meu plano',exact:true})});await linked.locator('[data-x="plan-recipe"]').click();assert.match(await page.locator('#modal-body').innerText(),/2 × 100 g/);assert.doesNotMatch(await page.locator('#modal-body').innerText(),/99 ×/);assert.match(await page.locator('#modal-body').innerText(),/Sirva morno após descansar/);await page.locator('#close-modal').click();
 pass('saved draft and published patient preparation retain ingredients when the source recipe changes');
 const groceries=await page.evaluate(async()=>{const {shoppingList}=await import('./shopping.js');const f=window.__recipeFixture,plan=f.published().data;return shoppingList({...plan,refeicoes:[{...plan.refeicoes[0],receitaId:'legacy-info-only'}]},'2026-10-17','2026-10-17');});
 assert.deepEqual(groceries.items.map(x=>[x.nome,x.qtd]),[['Ingrediente A de teste',2],['Ingrediente B de teste',1]]);
 pass('shopping expands whole-recipe snapshots for prescribed servings and never counts legacy informational links twice');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);pass('no JavaScript errors, external calls or writes in the isolated demo');
 await context.close();console.log(checks+' recipe browser checks passed');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
