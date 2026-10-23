'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let chromium;
if(process.env.TORQUE_PLAYWRIGHT)({chromium}=require(process.env.TORQUE_PLAYWRIGHT));
else{try{({chromium}=require('playwright'));}catch{({chromium}=require('/opt/node22/lib/node_modules/playwright'));}}
const BASE=(process.env.BASE_URL||'http://127.0.0.1:8765').replace(/\/$/,''),ORIGIN=new URL(BASE).origin;

(async()=>{
 const executablePath=process.env.TORQUE_CHROMIUM_EXECUTABLE_PATH||process.env.TORQUE_BROWSER_EXECUTABLE;
 const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
 let checks=0;const pass=name=>{checks++;console.log('PASS '+name);};
 try{
  const context=await browser.newContext({serviceWorkers:'block',timezoneId:'America/Sao_Paulo',viewport:{width:1280,height:900},hasTouch:true}),external=[],errors=[];
  await context.route('**/*',route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin!==ORIGIN||!['GET','HEAD'].includes(request.method())){external.push(request.method()+' '+url.origin+url.pathname);return route.abort();}
   if(url.pathname.endsWith('/nutri/config.js'))return route.fulfill({contentType:'application/javascript',body:'window.TORQUE_NUTRI_CONFIG={};'});
   if(url.pathname.endsWith('/nutri/app.js'))return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(__dirname,'../nutri/app.js'),'utf8')+'\nwindow.__patientChoicesFixture={S,render,published};'});
   return route.continue();
  });
  await context.routeWebSocket('**/*',socket=>{external.push('websocket');socket.close();});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  page.setDefaultTimeout(10000);

  async function fixture(){
   await page.locator('.demo-notice').waitFor();
   return page.evaluate(async()=>{
    const f=window.__patientChoicesFixture,{makeFoodItem}=await import('/nutri/food-measures.js');
    const today=new Date(),day=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');
    const tomorrow=new Date(day+'T12:00:00Z');tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
    // Entirely synthetic fixtures isolate portion arithmetic from source accuracy.
    const food=(id,n,values,unit='g',measures=[])=>({id,n,c:'Demonstração isolada',baseAmount:100,baseUnit:unit,...values,measures,source:'Fixture de teste; não é prescrição real'});
    const rice=makeFoodItem(food('fixture:rice','Arroz de teste',{k:130,pt:2,cb:28,g:1}),150,'g',{id:'main-rice'});
    rice.substituicoes=[makeFoodItem(food('fixture:potato','Batata de teste',{k:80,pt:2,cb:18,g:0}),125,'g',{id:'alt-potato'})];
    const chicken=makeFoodItem(food('fixture:chicken','Frango de teste',{k:160,pt:30,cb:0,g:4}),100,'g',{id:'main-chicken'});
    chicken.substituicoes=[makeFoodItem(food('fixture:tofu','Tofu de teste',{k:100,pt:10,cb:5,g:4},'g',[{id:'slice',label:'fatia de teste',amount:60,unit:'g',source:'Equivalência sintética explícita'}]),2,'slice',{id:'alt-tofu'})];
    const fruit={id:'main-fruit',nome:'Fruta de teste',porcao:'1 unidade',qtd:1,k:84,pt:1,cb:21,g:0,substituicoes:[makeFoodItem(food('fixture:milk','Bebida de teste',{k:50,pt:3,cb:5,g:2},'ml'),200,'ml',{id:'alt-milk'}),{id:'alt-unknown',nome:'Opção histórica incompleta',porcao:'1 unidade',qtd:2,k:20,pt:1,cb:null,g:0}]};
    const plan={v:1,titulo:'Plano isolado de escolhas',refeicoes:[
     {id:'hidden-meal',titulo:'Refeição de outro dia',hora:'06:00',dias:[tomorrow.getUTCDay()],itens:[{id:'hidden-item',nome:'Não escolher hoje',porcao:'1 unidade',qtd:1,k:900,pt:90,cb:90,g:9}]},
     {id:'lunch',titulo:'Almoço de teste',hora:'12:00',dias:[],itens:[rice,chicken]},
     {id:'snack',titulo:'Lanche de teste',hora:'16:00',dias:[],itens:[fruit]}
    ]};
    const publication=f.published();publication.id='fixture-patient-plan';publication.version=7;publication.data=plan;
    f.S.records=[];f.S.logs=[];f.S.page='food';f.render();
    return {day,tomorrow:tomorrow.toISOString().slice(0,10),patientId:f.S.selected};
   });
  }
  const row=key=>page.locator('[data-patient-food-row="'+key+'"]');
  const choice=key=>page.locator('[data-patient-food-choice="'+key+'"]');
  const readDay=async()=>Object.fromEntries(await Promise.all(['k','pt','cb','g'].map(async key=>[key,(await page.locator('.plan-nutrition .nutrient-'+key+' dd').innerText()).trim()])));
  async function assertDay(expected){
   const shown=await readDay();
   for(const key of ['k','pt','cb','g']){
    const unit=key==='k'?'kcal':'g';
    if(expected[key]===null)assert.equal(shown[key],'Não informado '+unit,'day '+key);
    else{assert(shown[key].endsWith(' '+unit));assert.equal(Number(shown[key].slice(0,-unit.length).trim().replace(',','.')),expected[key],'day '+key);}
   }
  }
  async function assertMeal(index,expected){
   for(const key of ['k','pt','cb','g']){
    const text=await page.locator('[data-patient-meal-total="'+index+':'+key+'"]').innerText();
    assert.equal(text==='Não informado'?null:Number(text.replace(',','.')),expected[key],'meal '+index+' '+key);
   }
  }
  async function choose(key,method='click'){
   const parentKey=key.split(':').slice(0,2).join(':'),details=row(parentKey).locator('.plan-alternatives');
   if(!await details.evaluate(element=>element.open))await details.locator('summary').click();
   if(method==='keyboard'){await choice(key).focus();await page.keyboard.press('Enter');}
   else if(method==='tap')await choice(key).tap();else await choice(key).click();
   assert.equal(await choice(key).getAttribute('aria-pressed'),'true','selected choice '+key);
  }
  const clinicalState=()=>page.evaluate(()=>{const {S}=__patientChoicesFixture;return structuredClone({plans:S.plans,logs:S.logs,records:S.records,patients:S.patients});});
  const baseline={k:439,pt:34,cb:63,g:5.5};
  await page.goto(BASE+'/nutri/demo-paciente.html');const dates=await fixture(),before=await clinicalState();
  assert.equal(await page.locator('.plan-meal').count(),2);
  assert.equal(await choice('0:0:0').count(),0,'the filtered meal index must not replace the original plan index');
  await assertDay(baseline);
  await row('1:0').locator('.plan-alternatives summary').click();
  const potatoText=await choice('1:0:0').innerText();
  assert.match(potatoText,/Batata de teste/);assert.match(potatoText,/125 g/);assert.match(potatoText,/100(?:,0{1,2})?\s*kcal/);
  for(const [label,expected] of [['Proteínas',2.5],['Carboidratos',22.5],['Gorduras',0]]){
   const match=potatoText.match(new RegExp(label+'\\s*([0-9.,]+)\\s*g'));
   assert(match,'option shows '+label);assert.equal(Number(match[1].replace(',','.')),expected,label+' uses the approved alternative amount');
  }
  await choose('1:0:0','keyboard');
  assert.equal(await choice('1:0:0').evaluate(button=>button===document.activeElement),true,'keyboard focus survives the choice render');
  assert.equal(await row('1:0').locator('.plan-food-name').innerText(),'Batata de teste');
  assert.equal(await row('1:0').locator('.plan-food-portion').innerText(),'125 g');
  assert.deepEqual(await row('1:0').locator(':scope > .plan-food-macros b').allTextContents(),['100','2,5','22,5','0']);
  await assertDay({k:344,pt:33.5,cb:43.5,g:4});
  await assertMeal(1,{k:260,pt:32.5,cb:22.5,g:4});
  assert.deepEqual(await clinicalState(),before);
  pass('approved alternatives show their own portion and four nutrients; keyboard selection updates the original-index row and meal/day totals without recording consumption');

  await choose('1:1:0');
  assert.match(await row('1:1').locator('.plan-food-portion').innerText(),/2 × fatia de teste \(120 g\)/);
  await assertDay({k:304,pt:15.5,cb:49.5,g:4.8});
  await assertMeal(1,{k:220,pt:14.5,cb:28.5,g:4.8});
  await choose('2:0:0');
  assert.equal(await row('2:0').locator('.plan-food-portion').innerText(),'200 ml');
  await assertDay({k:320,pt:20.5,cb:38.5,g:8.8});
  await assertMeal(2,{k:100,pt:6,cb:10,g:4});
  assert.deepEqual(await clinicalState(),before);
  pass('multiple selections add the prescribed gram, household and volume amounts once, independently of each main-food quantity');

  await page.reload();await fixture();
  await assertDay({k:320,pt:20.5,cb:38.5,g:8.8});
  assert.equal(await row('1:0').locator('.plan-food-name').innerText(),'Batata de teste');
  await page.locator('#patient-plan-date').fill(dates.tomorrow);await page.locator('#patient-plan-date').dispatchEvent('change');
  await assertDay({k:1339,pt:124,cb:153,g:14.5});
  assert.equal(await row('1:0').locator('.plan-food-name').innerText(),'Arroz de teste');
  await page.locator('#patient-plan-date').fill(dates.day);await page.locator('#patient-plan-date').dispatchEvent('change');
  await assertDay({k:320,pt:20.5,cb:38.5,g:8.8});
  pass('reload restores this publication and date; another date starts from its own scheduled meals without inheriting choices');

  const afterReload=await clinicalState();
  await choose('1:0:-1');await choose('1:1:-1');await choose('2:0:-1');
  await assertDay(baseline);assert.deepEqual(await clinicalState(),afterReload);
  assert.equal(await row('1:0').locator('.plan-food-name').innerText(),'Arroz de teste');
  await choose('2:0:1');
  await assertDay({k:395,pt:35,cb:null,g:5.5});
  await assertMeal(2,{k:40,pt:2,cb:null,g:0});
  assert.match(await choice('2:0:1').innerText(),/Não informado/);
  assert.match(await page.locator('.plan-meal').last().innerText(),/Não informado/);
  assert.deepEqual(await clinicalState(),afterReload);
  await choose('2:0:-1');
  pass('returning to the original restores totals and a historical alternative with missing carbohydrate keeps that total unknown instead of zero');

  await choose('1:0:0');
  await page.evaluate(()=>{const f=__patientChoicesFixture;f.published().version++;f.render();});
  await assertDay(baseline);assert.equal(await row('1:0').locator('.plan-food-name').innerText(),'Arroz de teste');
  pass('a new published version does not reuse the previous alternatives');

  // Simulate independent loaded account contexts while all network is blocked.
  await page.evaluate(()=>{const f=__patientChoicesFixture;f.S.demo=false;f.S.user={id:'fixture-account-a'};f.render();});
  await choose('1:0:0');
  await page.evaluate(()=>{const f=__patientChoicesFixture;f.S.user={id:'fixture-account-b'};f.render();});
  await assertDay(baseline);
  await page.evaluate(()=>{const f=__patientChoicesFixture;f.S.user={id:'fixture-account-a'};f.render();});
  await assertDay({k:344,pt:33.5,cb:43.5,g:4});
  await page.evaluate(()=>{const f=__patientChoicesFixture,second=f.S.patients[1],original=f.published();f.S.plans=f.S.plans.filter(plan=>plan.patient_id!==second.id);f.S.plans.push({...structuredClone(original),id:'fixture-patient-plan-other',patient_id:second.id});f.S.selected=second.id;f.render();});
  await assertDay(baseline);
  await page.evaluate(id=>{const f=__patientChoicesFixture;f.S.selected=id;f.render();},dates.patientId);
  await assertDay({k:344,pt:33.5,cb:43.5,g:4});
  pass('separate loaded accounts and patients cannot inherit another context’s choices');

  const isolatedState=await clinicalState();
  for(const width of [320,390])for(const light of [false,true]){
   await page.setViewportSize({width,height:844});
   await page.evaluate(value=>{document.body.classList.toggle('theme-light',value);document.body.classList.add('large-text');},light);
   await choose('1:0:-1','tap');await choose('1:0:0','tap');
   const geometry=await choice('1:0:0').evaluate(button=>{const box=button.getBoundingClientRect();return {width:box.width,height:box.height,ownOverflow:button.scrollWidth>button.clientWidth+1,pageOverflow:document.documentElement.scrollWidth>innerWidth+1};});
   assert(geometry.width>=44&&geometry.height>=44,'touch target '+width+' light='+light);
   assert.equal(geometry.ownOverflow,false,'choice has no clipped content '+width+' light='+light);
   assert.equal(geometry.pageOverflow,false,'page has no horizontal overflow '+width+' light='+light);
   await assertDay({k:344,pt:33.5,cb:43.5,g:4});
  }
  assert.deepEqual(await clinicalState(),isolatedState);
  pass('320px and 390px layouts support touch in both themes with large text');

  for(const change of ['publication-data','publication-version','account']){
   const stale=await page.evaluate(async change=>{
    const f=__patientChoicesFixture,button=document.querySelector('[data-patient-food-choice="1:1:0"]'),handler=button.onclick;
    const stored=()=>Object.fromEntries(Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)]));
    const clinical=()=>structuredClone({plans:f.S.plans,patients:f.S.patients,logs:f.S.logs,records:f.S.records});
    // The DOM and its closure deliberately remain from the previous context.
    // In-place publication edits exercise the same-object case, not replacement.
    if(change==='publication-data')f.published().data.orientacoes='Versão do conteúdo alterada em memória';
    else if(change==='publication-version')f.published().version++;
    else f.S.user={id:'fixture-account-after-stale-handler'};
    const storageBefore=stored(),clinicalBefore=clinical();
    await handler.call(button);
    const result={storageBefore,storageAfter:stored(),clinicalBefore,clinicalAfter:clinical(),feedback:document.querySelector('#toast').textContent};
    f.render();return result;
   },change);
   assert.deepEqual(stale.storageAfter,stale.storageBefore,change+' stale handler must not persist into the new context');
   assert.deepEqual(stale.clinicalAfter,stale.clinicalBefore,change+' stale handler must not change clinical state');
   assert.match(stale.feedback,/plano novamente/i,change+' explains that the old control is stale');
   assert.equal(await choice('1:1:0').getAttribute('aria-pressed'),'false',change+' alternative remains unselected');
   assert.equal(await row('1:1').locator('.plan-food-name').innerText(),'Frango de teste');
   await assertDay(baseline);
  }
  pass('captured click handlers cannot write after in-place publication changes or an account switch before rerender');
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  pass('all checks finish without JavaScript errors or external requests');
  await context.close();console.log(checks+' patient food choice browser checks passed');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
