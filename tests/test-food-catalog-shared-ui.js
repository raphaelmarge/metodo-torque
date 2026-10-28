'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let chromium;try{({chromium}=require(process.env.TORQUE_PLAYWRIGHT||'playwright'));}catch{({chromium}=require('/opt/node22/lib/node_modules/playwright'));}
const BASE=(process.env.BASE_URL||'http://127.0.0.1:8765').replace(/\/$/,''),root=path.join(__dirname,'..');
const extra=JSON.parse(fs.readFileSync(path.join(root,'nutri/data/openfoodfacts-expansion-20261028.json')));
async function area(page,value){if(await page.locator('#pnArea').isVisible())await page.locator('#pnArea').selectOption(value);else await page.locator('[data-pna="'+value+'"]').click();}
(async()=>{
 const browser=await chromium.launch({headless:true,...((process.env.CHROMIUM_PATH||process.env.TORQUE_BROWSER_EXECUTABLE)?{executablePath:process.env.CHROMIUM_PATH||process.env.TORQUE_BROWSER_EXECUTABLE}:{})});
 try{
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:900}}),errors=[];
  // Only local GETs: this test never reads or writes a real account.
  await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(BASE).origin&&route.request().method()==='GET'?route.continue():route.abort());
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(BASE+'/demo-personal.html');await page.locator('#btnDemo').click();await page.waitForURL(/personal\.html/);await page.waitForFunction(()=>window.MT_PERSONAL_NUTRICAO&&window.__renderPT);
  await page.evaluate(()=>{
   const S=MTStore,st=S.read('ptStudio',{});
   const legacy={id:'old-item',alimId:'cat:Arroz branco cozido',nome:'Arroz branco cozido',porcao:'100 g',qtd:2,k:130,pt:2.5,cb:28,g:.2};
   st.alunos=[{id:'catalog-test',nome:'Aluno fictício do catálogo',ativo:true}];
   st.nutricaoV1={favoritos:['cat:Arroz branco cozido'],alimentos:[{id:'private-test',nome:'Alimento privado de teste',porcao:'1 unidade',qtd:1,k:120,pt:5,cb:20,g:2,fonte:'Rótulo próprio'}],planos:{'catalog-test':{v:1,id:'plan-test',ativo:true,titulo:'Plano preservado',refeicoes:[{id:'meal-test',titulo:'Almoço',itens:[legacy]}]}}};
   st.config={...st.config,dia1Off:true,zapFilaOff:true};S.write('ptStudio',st);window.__beforeCatalog=JSON.stringify(st.nutricaoV1);window.__renderPT();
  });
  await page.locator('#abas [data-a="nutricao"]').click();await area(page,'biblioteca');
  assert.match(await page.locator('#pnTotalCatalogo').innerText(),/13748|13.748/);
  for(const food of [extra.find(x=>x.baseUnit==='g'),extra.find(x=>x.baseUnit==='ml')]){
   assert(food);await page.locator('#pnBusca').fill(food.brand);
   assert.match(await page.locator('#pnTotalCatalogo').innerText(),/[1-9]/);
   await page.locator('#pnBusca').fill(food.barcode);
   const result=await page.locator('#pnCatalogo').innerText();assert(result.includes(food.n));assert(result.includes(food.brand));assert(result.includes(food.p));assert(result.includes('Open Food Facts'));
  }
  await page.locator('#pnBusca').fill('arroz, tipo 1, cozido');assert((await page.locator('#pnCatalogo').innerText()).includes('TACO'));
  await page.locator('#pnBusca').fill('Alimento privado de teste');assert((await page.locator('#pnCatalogo').innerText()).includes('Rótulo próprio'));
  assert(await page.evaluate(()=>JSON.stringify(MTStore.read('ptStudio',{}).nutricaoV1)===window.__beforeCatalog),'Browsing does not mutate plans, favorites or private foods');
  await page.locator('#pnBusca').fill(extra.find(x=>x.baseUnit==='ml').barcode);
  for(const width of [320,390,1280]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Catalog fits '+width+'px');}
  await page.setViewportSize({width:1280,height:900});await area(page,'plano');await page.locator('#pnAluno').selectOption('catalog-test');await page.locator('#pnEditar').click();
  const food=extra.find(x=>x.baseUnit==='ml');await page.locator('[data-pnfood="0"]').click();await page.locator('#pnPickBusca').fill(food.barcode);await page.locator('#pnPickLista [data-pnadd]').click();
  await page.locator('[data-pnqref="0"][data-pnqitem="1"]').fill('2');
  const snapshot=await page.evaluate(()=>JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('ptNutriDraft:v814:')))).plano.refeicoes[0].itens);
  assert.equal(snapshot[0].k,130);assert.equal(snapshot[0].qtd,2);assert.equal(snapshot[1].alimId,'cat:'+food.id);assert.equal(snapshot[1].porcao,'100 ml');assert.equal(snapshot[1].qtd,'2');assert.equal(snapshot[1].k,food.k);assert.equal(snapshot[1].baseGramas,undefined);assert(snapshot[1].fonte.includes(food.sourceUrl));
  assert(await page.evaluate(()=>JSON.stringify(MTStore.read('ptStudio',{}).nutricaoV1)===window.__beforeCatalog),'Draft does not alter the saved plan');
  const publication=await page.evaluate(()=>{
   const st=MTStore.read('ptStudio',{}),draft=JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('ptNutriDraft:v814:'))));
   st.nutricaoV1.planos['catalog-test']=draft.plano;
   const pack=MT_PERSONAL_NUTRICAO.pacote(st,'catalog-test');return {count:pack.catalogo.length,ids:pack.catalogo.map(x=>x.alimId),error:MT_NUTRICAO.validaPlanoEntrada(pack),item:pack.refeicoes[0].itens[1]};
  });
  assert.equal(publication.count,1550);assert(!publication.error);assert(publication.ids.includes('cat:'+food.id));assert(publication.ids.includes('private-test'));assert(publication.ids.includes('cat:Arroz branco cozido'));assert.equal(publication.item.k,food.k);assert.equal(publication.item.qtd,2);
  assert.deepEqual(errors,[]);console.log('PASS shared catalog in Personal UI: brand/barcode search, TACO, private foods, unchanged plans/favorites, mobile layout and branded ml draft.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
