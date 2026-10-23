/* Actual diary and choice modules, fictional fixtures only. No backend traffic. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
let chromium;
if(process.env.TORQUE_PLAYWRIGHT)({chromium}=require(process.env.TORQUE_PLAYWRIGHT));
else{try{({chromium}=require('playwright'));}catch{({chromium}=require('/opt/node22/lib/node_modules/playwright'));}}
const BASE=(process.env.BASE_URL||'http://127.0.0.1:8765').replace(/\/$/,''),ORIGIN=new URL(BASE).origin;
const DAY='2026-10-23',BEFORE='2026-10-22';
let browser,checks=0;
const pass=name=>{checks++;console.log('PASS '+name);};

async function fixture(){
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1000,height:900}}),errors=[],writes=[];
 await context.route('**/*',route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!==ORIGIN||!['GET','HEAD'].includes(request.method())){writes.push(request.method()+' '+url.origin+url.pathname);return route.abort();}
  if(url.pathname.endsWith('/journal-choice-fixture'))return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="pt-BR"><head><link rel="icon" href="data:,"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><dialog id="modal"></dialog></body></html>'});
  return route.continue();
 });
 if(typeof context.routeWebSocket!=='function')throw Error('Playwright routeWebSocket is required for isolation.');
 await context.routeWebSocket('**/*',socket=>{writes.push('websocket');socket.close();});
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.goto(BASE+'/journal-choice-fixture');
 await page.evaluate(async({base,day,before})=>{
  const {createFoodJournal}=await import(base+'/nutri/food-journal.js');
  const {createPatientFoodChoices}=await import(base+'/nutri/patient-food-choices.js');
  const {makeFoodItem}=await import(base+'/nutri/food-measures.js');
  const clone=value=>structuredClone(value),patient={id:'patient-fixture',clinic_id:'clinic-fixture',user_id:'user-fixture'};
  const main=makeFoodItem({id:'fixture-rice',n:'Arroz cozido',baseAmount:100,baseUnit:'g',k:130,pt:2.5,cb:28,g:.3},150,'g',{id:'rice'});
  const alternative=makeFoodItem({id:'fixture-potato',n:'Batata cozida',baseAmount:100,baseUnit:'g',k:80,pt:2,cb:18,g:.1},125,'g',{id:'potato'});
  main.substituicoes=[alternative];
  const drink={id:'drink',nome:'Leite',qtd:1,porcao:'200 ml',k:120,pt:6,cb:10,g:6,
   substituicoes:[{id:'drink-alt',nome:'Bebida vegetal',qtd:1.5,porcao:'100 ml',k:40,pt:1,cb:5,g:2}]};
  const published={id:'plan-fixture',patient_id:patient.id,status:'published',version:2,data:{ativo:true,refeicoes:[
   {id:'lunch',titulo:'Almoço',itens:[main]},{id:'dinner',titulo:'Jantar',itens:[drink]}]}};
  const state={role:'patient',demo:false,clinic:{id:patient.clinic_id},selected:patient.id,user:{id:patient.user_id},records:[]};
  const calls=[],toasts=[],savedErrors=[];let sequence=0;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const H={state:()=>state,esc,uid:()=>`fixture-id-${++sequence}`,today:()=>day,published:()=>published,logs:()=>[],stats:()=>({xp:0}),
   toast:message=>toasts.push(message),render(){},saveLog(){throw Error('Choice/diary must not mark adherence.');},
   database:()=>({async rpc(name,args){if(name!=='save_food_journal')throw Error('Unexpected RPC');calls.push(clone(args));return {data:{id:'saved-fixture'},error:null};}}),
   modal(title,body,submit){
    const dialog=document.querySelector('#modal');dialog.innerHTML='<h2>'+esc(title)+'</h2><form id="modal-form">'+body+'<button type="button" id="cancel-modal">Cancelar</button><button type="submit">Salvar</button><p id="fixture-error"></p></form>';
    document.querySelector('#cancel-modal').onclick=()=>dialog.close();
    document.querySelector('#modal-form').onsubmit=async event=>{event.preventDefault();try{await submit();dialog.close();}catch(error){savedErrors.push(error.message);document.querySelector('#fixture-error').textContent=error.message;}};
    dialog.showModal();
   }};
  const foodChoices=createPatientFoodChoices(H,{pat:()=>patient});
  foodChoices.choose(published,day,'0:0',0);foodChoices.choose(published,day,'1:0',0);
  const J=createFoodJournal(H,{pat:()=>patient,foodChoices,records:()=>state.records,load:async()=>{},imageFile:async()=>null,saveRecord:async()=>{throw Error('Real fixture must use RPC.');}});
  window.F={H,J,foodChoices,state,published,main,alternative,drink,patient,calls,toasts,savedErrors,day,before,
   draftKey:'torque-nutri-journal-draft:user-fixture:patient-fixture:new:lunch',
   pendingKey:'torque-nutri-journal-pending:user-fixture:patient-fixture:new'};
 },{base:BASE,day:DAY,before:BEFORE});
 return {context,page,async close(){assert.deepEqual(errors,[],'no uncaught errors');assert.deepEqual(writes,[],'no network writes, external requests or sockets');await context.close();}};
}
const open=page=>page.evaluate(()=>F.J.forMeal('lunch'));
const close=page=>page.locator('#cancel-modal').click();
async function save(page){await page.locator('#journal-confirm').check();await page.locator('#modal-form button[type="submit"]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);}
async function changeDay(page,day){await page.locator('#journal-day').fill(day);await page.locator('#journal-day').dispatchEvent('change');}

async function initialChoice(){
 const h=await fixture(),{page}=h;
 try{
  const original=await page.evaluate(()=>structuredClone(F.published));await open(page);
  assert.equal(await page.locator('[data-journal-name]').inputValue(),'Batata cozida');
  assert.equal(await page.locator('[data-journal-quantity]').inputValue(),'125');
  assert.equal(await page.locator('[data-journal-portion]').inputValue(),'1 g');
  assert.equal(await page.locator('#journal-how').inputValue(),'substitution');
  assert.equal(await page.evaluate(()=>F.calls.length),0,'opening a choice does not save consumption');
  assert.deepEqual(await page.evaluate(()=>Object.keys(sessionStorage)),[],'opening does not create a draft automatically');
  assert.deepEqual(await page.evaluate(()=>F.published),original,'published prescription is immutable');
  await save(page);
  const payload=await page.evaluate(()=>F.calls[0].p_data),item=payload.items[0];
  assert.equal(item.id,'potato');assert.equal(item.qtd,125);assert.equal(item.porcao,'1 g');
  for(const [key,total] of Object.entries({k:100,pt:2.5,cb:22.5,g:.125}))assert(Math.abs(item[key]*item.qtd-total)<1e-8,key+' uses the selected quantity exactly once');
  assert.equal(payload.planVersion,2);assert.equal(payload.day,DAY);assert.equal(payload.mealId,'lunch');
  pass('new report starts with the chosen quantity and macros, saving only after explicit confirmation');
 }finally{await h.close();}
}
async function pristineContext(){
 const h=await fixture(),{page}=h;
 try{
  await open(page);await page.locator('#journal-note').fill('Observação preservada');await page.locator('#journal-title').fill('Meu relato');
  await changeDay(page,BEFORE);
  assert.equal(await page.locator('[data-journal-name]').inputValue(),'Arroz cozido');assert.equal(await page.locator('[data-journal-quantity]').inputValue(),'150');
  await changeDay(page,DAY);assert.equal(await page.locator('[data-journal-name]').inputValue(),'Batata cozida');
  await page.locator('#journal-meal').selectOption('dinner');
  assert.equal(await page.locator('[data-journal-name]').inputValue(),'Bebida vegetal');assert.equal(await page.locator('[data-journal-quantity]').inputValue(),'1.5');
  assert.equal(await page.locator('#journal-title').inputValue(),'Meu relato');assert.equal(await page.locator('#journal-note').inputValue(),'Observação preservada');
  assert.equal(await page.locator('#journal-choice-notice').isVisible(),false);assert.equal(await page.evaluate(()=>F.calls.length),0);
  pass('unedited food rows follow each date and meal without losing the title or notes');
 }finally{await h.close();}
}
async function editedContext(){
 const h=await fixture(),{page}=h;
 try{
  await open(page);await page.locator('[data-journal-quantity]').fill('85');await page.locator('#journal-confirm').check();
  await changeDay(page,BEFORE);
  assert.equal(await page.locator('[data-journal-name]').inputValue(),'Batata cozida');assert.equal(await page.locator('[data-journal-quantity]').inputValue(),'85');
  assert.equal(await page.locator('#journal-choice-notice').isVisible(),true);assert.equal(await page.locator('#journal-confirm').isChecked(),false);
  await page.locator('#journal-use-choices').click();assert.equal(await page.locator('[data-journal-name]').inputValue(),'Arroz cozido');
  await page.locator('[data-journal-name]').fill('Alimento informado por mim');await page.locator('#journal-meal').selectOption('dinner');
  assert.equal(await page.locator('[data-journal-name]').inputValue(),'Alimento informado por mim');
  await page.locator('#journal-use-choices').click();assert.equal(await page.locator('[data-journal-name]').inputValue(),'Leite');
  assert.equal(await page.evaluate(()=>F.calls.length),0);
  pass('date and meal changes preserve edited food rows until the patient explicitly reloads choices');
 }finally{await h.close();}
}
async function draftIsStable(){
 const h=await fixture(),{page}=h;
 try{
  await open(page);await page.locator('[data-journal-quantity]').fill('85');await page.locator('#journal-note').fill('Meu rascunho');await close(page);
  const saved=await page.evaluate(()=>sessionStorage.getItem(F.draftKey));
  await page.evaluate(()=>F.foodChoices.choose(F.published,F.day,'0:0',-1));await open(page);
  assert.equal(await page.locator('[data-journal-name]').inputValue(),'Batata cozida');assert.equal(await page.locator('[data-journal-quantity]').inputValue(),'85');
  assert.equal(await page.evaluate(()=>sessionStorage.getItem(F.draftKey)),saved,'restoring a draft does not rewrite its stored data');
  await page.locator('#journal-meal').selectOption('dinner');await close(page);await open(page);
  assert.equal(await page.locator('#journal-meal').inputValue(),'dinner','a changed draft meal survives reopening its original entry point');
  assert.equal(await page.locator('[data-journal-name]').inputValue(),'Batata cozida');assert.equal(await page.locator('#journal-note').inputValue(),'Meu rascunho');
  await page.locator('#journal-meal').selectOption('');await close(page);await open(page);
  assert.equal(await page.locator('#journal-meal').inputValue(),'','a deliberate outside-plan draft also survives its original meal entry point');
  assert.equal(await page.locator('[data-journal-quantity]').inputValue(),'85');
  await page.locator('#journal-meal').selectOption('dinner');
  await page.locator('#journal-how').selectOption('planned');assert.equal(await page.locator('[data-journal-name]').inputValue(),'Bebida vegetal');
  pass('a restored draft survives later choices and retains its changed meal until an explicit reset');
 }finally{await h.close();}
}
async function historicalAndPending(){
 const h=await fixture(),{page}=h;
 try{
  const historical={id:'old-journal',patient_id:'patient-fixture',kind:'food_journal',visibility:'patient',version:3,title:'Registro anterior',data:{day:BEFORE,mealId:'old-meal',planVersion:1,note:'Histórico',items:[{nome:'Alimento histórico',qtd:2,porcao:'1 unidade',k:77,pt:5}]}};
  await page.evaluate(existing=>F.J.open(existing),historical);
  assert.equal(await page.locator('[data-journal-name]').inputValue(),'Alimento histórico');assert.equal(await page.locator('#journal-meal').isDisabled(),true);
  await changeDay(page,DAY);assert.equal(await page.locator('[data-journal-quantity]').inputValue(),'2');await save(page);
  const first=await page.evaluate(()=>F.calls[0]);assert.deepEqual(first.p_data.items,historical.data.items);assert.equal(first.p_data.planVersion,1);assert.equal(first.p_data.mealId,'old-meal');
  const pending={p_operation_id:'pending-original',p_patient_id:'patient-fixture',p_record_id:null,p_expected_version:null,p_title:'Envio antigo',p_data:{day:BEFORE,mealId:'lunch',planVersion:1,items:[{id:'pending-food',nome:'Alimento do envio pendente',qtd:3,porcao:'1 colher',k:41}],note:'Original',image:null}};
  await page.evaluate(value=>sessionStorage.setItem(F.pendingKey,JSON.stringify(value)),pending);await open(page);
  assert.equal(await page.locator('[data-journal-name]').inputValue(),'Alimento do envio pendente');assert.equal(await page.locator('#journal-day').isDisabled(),true);
  await page.locator('#modal-form button[type="submit"]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);
  assert.deepEqual(await page.evaluate(()=>F.calls[1]),pending,'pending payload stays exact, including original version and nutrients');
  pass('historical records and pending operations keep their original food sources and payloads');
 }finally{await h.close();}
}

(async()=>{
 browser=await chromium.launch({headless:true,executablePath:process.env.TORQUE_BROWSER_EXECUTABLE||process.env.CHROMIUM_PATH||(fs.existsSync('/opt/pw-browsers/chromium')?'/opt/pw-browsers/chromium':undefined),args:['--no-sandbox']});
 for(const scenario of [initialChoice,pristineContext,editedContext,draftIsStable,historicalAndPending])await scenario();
 console.log(checks+' cenários de escolhas no diário passaram.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
