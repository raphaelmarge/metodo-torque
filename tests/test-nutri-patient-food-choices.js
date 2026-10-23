'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
  const moduleFile=name=>pathToFileURL(path.resolve(__dirname,'../nutri',name));
  const {createPatientFoodChoices:create}=await import(moduleFile('patient-food-choices.js'));
  const {makeFoodItem,changeFoodMeasure,measuredItemNutrition}=await import(moduleFile('food-measures.js'));
  const {planDaySummary,prescribedTotals}=await import(moduleFile('day-summary.js'));
  let passed=0;const pass=text=>{passed++;console.log('PASS '+text);};
  const near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} differs from ${b}`);
  const day='2026-10-23',nextDay='2026-10-24'; // Friday then Saturday.
  const legacy={id:'main',nome:'Alimento principal',qtd:3,porcao:'1 porção',k:100,pt:4,cb:20,g:1};
  const alternative={id:'alternative',nome:'Alternativa prescrita',qtd:2,porcao:'1 fatia',k:75,pt:3,cb:12,g:2,fb:null};
  const measured=makeFoodItem({id:'test:food',n:'Alimento medido',baseAmount:100,baseUnit:'g',k:120,pt:2,cb:26,g:.5,sodiumMg:0,fb:null,brand:'Marca teste',source:'Fonte de teste',sourceUrl:'https://example.test/food',measures:[{id:'spoon',label:'colher de sopa',amount:25,unit:'g',source:'Medida de teste'}]},175,'g',{id:'measured-alternative'});
  const spoon=changeFoodMeasure(measured,'spoon');
  const missing={id:'missing',nome:'Nutrientes parcialmente informados',qtd:1.5,porcao:'1 porção',k:80,pt:null,cb:10};
  const plan=()=>({id:'plan-a',patient_id:'patient-a',status:'published',version:2,data:{titulo:'Plano publicado',startOn:'2026-10-01',endOn:'2026-10-10',refeicoes:[{id:'inactive',titulo:'Só sábado',dias:[6],itens:[{...legacy,id:'inactive-food',substituicoes:[alternative]}]},{id:'meal-a',titulo:'Almoço',dias:[],itens:[{...legacy,substituicoes:[alternative,spoon,missing]},{...legacy,id:'second-food',nome:'Segundo principal',substituicoes:[{...alternative,id:'second-alternative'}]}]}]}});
  function fixture({storage,publication=plan(),demo=false}={}){
    const values=new Map();let reads=0,writes=0;
    const local=storage||{getItem:key=>{reads++;return values.get(key)??null;},setItem:(key,value)=>{writes++;values.set(key,value);}};
    const state={demo,role:'patient',user:demo?null:{id:'user-a'},clinic:{id:'clinic-a'}};
    let patient={id:'patient-a',clinic_id:'clinic-a',...(demo?{}:{user_id:'user-a'})},current=structuredClone(publication);
    const H={state:()=>state,published:()=>current},pat=()=>patient;
    return {H,state,pat,local,values,api:create(H,{pat,storage:local}),get current(){return current;},set current(value){current=value;},get patient(){return patient;},set patient(value){patient=value;},counts:()=>({reads,writes}),reload:()=>create(H,{pat,storage:local})};
  }
  const f=fixture(),original=structuredClone(f.current);
  assert.deepEqual(f.api.read(f.current,day),{});assert.equal(f.api.choose(f.current,day,'1:0',0).saved,true);
  assert.deepEqual(f.api.read(f.current,day),{'1:0':0});assert.equal(f.api.selectedItem(f.current,day,1,0).qtd,2);
  const selected=f.api.selectedPlan(f.current,day);assert.deepEqual(selected.refeicoes[1].itens[0],alternative);assert.equal(selected.refeicoes[1].id,'meal-a');
  assert.deepEqual(f.current,original);assert.equal(prescribedTotals([selected.refeicoes[1].itens[0]]).k,150,'alternative quantity is not multiplied by main qtd=3');
  selected.refeicoes[1].itens[0].qtd=999;selected.refeicoes[0].itens[0].nome='changed';assert.deepEqual(f.current,original);assert.equal(f.api.selectedItem(f.current,day,1,0).qtd,2);
  const returned=f.api.read(f.current,day);returned['1:0']=2;assert.equal(f.api.read(f.current,day)['1:0'],0);
  assert.deepEqual(f.reload().read(f.current,day),{'1:0':0});assert.match(f.api.message(),/salva/);assert(f.values.keys().next().value.startsWith('torque-nutri-patient-food-choices:v1:'));
  pass('selects only the prescribed alternative at original indices, preserves its quantity and snapshots, and restores an independent local copy');

  f.api.choose(f.current,day,'1:0',1);const measuredResult=f.api.selectedItem(f.current,day,1,0);assert.deepEqual(measuredResult,spoon);assert.equal(measuredResult.qtd,7);
  const measuredTotals=measuredItemNutrition(measuredResult);near(measuredTotals.baseQuantity,175);near(measuredTotals.total.k,210);assert.equal(measuredTotals.total.fb,null);
  assert.equal(measuredResult.measurement.sourceUrl,'https://example.test/food');assert.equal(measuredResult.measurement.brand,'Marca teste');
  f.api.choose(f.current,day,'1:0',2);assert.deepEqual(f.api.selectedItem(f.current,day,1,0),missing);
  const summary=planDaySummary(f.api.selectedPlan(f.current,day),day);assert.deepEqual(summary.mealIndices,[1]);assert.equal(summary.totals.pt,null);assert.equal(summary.totals.g,null);near(summary.totals.k,420);near(summary.totals.cb,75);
  assert.equal(f.current.data.refeicoes[1].itens[0].qtd,3);
  pass('measured alternatives retain household equivalences and unknown legacy macros remain unknown in the day totals');

  f.api.choose(f.current,day,'1:1',0);f.api.choose(f.current,nextDay,'0:0',0);
  assert.deepEqual(f.api.read(f.current,day),{'1:0':2,'1:1':0});assert.deepEqual(f.api.read(f.current,nextDay),{'0:0':0});
  assert.equal(f.api.selectedItem(f.current,day,0,0),null);assert.deepEqual(f.api.selectedItem(f.current,nextDay,1,0),original.data.refeicoes[1].itens[0]);
  f.api.choose(f.current,day,'1:0',-1);assert.deepEqual(f.api.read(f.current,day),{'1:1':0});assert.deepEqual(f.api.selectedItem(f.current,day,1,0),original.data.refeicoes[1].itens[0]);
  assert.deepEqual(f.api.read(f.current,nextDay),{'0:0':0});
  for(const [date,key,option] of [[day,'0:0',0],['2026-02-30','1:0',0],['bad','1:0',0],[day,'1:0',9],[day,'1:0','0'],[day,'1:0',{}],[day,'1:0',.5],[day,'01:0',0],[day,'1:-1',0],[day,'__proto__',0]])assert.throws(()=>f.api.choose(f.current,date,key,option));
  assert.equal(f.api.selectedPlan(f.current,'invalid'),null);assert.deepEqual(f.api.read(f.current,'2026-02-30'),{});
  for(const overrides of [{ativo:false},{startOn:'2026-11-01'},{fim:'2026-10-22'}]){const closed=fixture();Object.assign(closed.current.data,overrides);assert.throws(()=>closed.api.choose(closed.current,day,'1:0',0));assert.equal(closed.api.selectedItem(closed.current,day,1,0),null);}
  pass('choices are date-specific, principal selection clears only its override, and invalid dates, inactive meals or arbitrary options are rejected');

  function isolated(change){const x=fixture();x.api.choose(x.current,day,'1:0',0);change(x);assert.deepEqual(x.api.read(x.current,day),{});return x;}
  isolated(x=>{x.state.user.id='user-b';x.patient.user_id='user-b';});
  isolated(x=>{x.state.clinic.id='clinic-b';x.patient.clinic_id='clinic-b';});
  isolated(x=>{x.patient.id='patient-b';x.current.patient_id='patient-b';});
  isolated(x=>{x.current.id='plan-b';});isolated(x=>{x.current.version++;});
  isolated(x=>{x.current.data.refeicoes.reverse();});
  isolated(x=>{x.current.data.refeicoes[1].itens.reverse();});
  isolated(x=>{x.current.data.refeicoes[1].itens[0].substituicoes.reverse();});
  isolated(x=>{x.current.data.refeicoes[1].itens[0].substituicoes[0].qtd=2.5;});
  isolated(x=>{x.state.demo=true;x.state.user=null;});
  const switched=fixture();switched.api.choose(switched.current,day,'1:0',0);const accountA=structuredClone(switched.state.user);switched.state.user={id:'user-b'};switched.patient.user_id='user-b';assert.deepEqual(switched.api.read(switched.current,day),{});switched.api.choose(switched.current,day,'1:0',1);switched.state.user=accountA;switched.patient.user_id=accountA.id;assert.deepEqual(switched.api.read(switched.current,day),{'1:0':0});
  const stale=fixture(),captured=structuredClone(stale.current);stale.current.version++;assert.throws(()=>stale.api.choose(captured,day,'1:0',0));assert.equal(stale.api.selectedPlan(captured,day),null);assert.equal(stale.counts().writes,0);
  const staleData=fixture(),capturedData=structuredClone(staleData.current);staleData.current.data.refeicoes[1].itens[0].substituicoes.reverse();assert.throws(()=>staleData.api.choose(capturedData,day,'1:0',0));
  pass('account, clinic, patient, publication, version and content signatures isolate choices, including reordered options and stale publications');

  for(const change of [x=>x.state.role='nutri',x=>x.state.user=null,x=>x.state.clinic.id='wrong-clinic',x=>x.patient.user_id='wrong-user',x=>x.current.patient_id='wrong-patient',x=>x.current.status='draft',x=>x.current.version=0,x=>x.current=null]){
    const denied=fixture();change(denied);assert.throws(()=>denied.api.choose(denied.current,day,'1:0',0));assert.equal(denied.counts().writes,0);assert.equal(denied.api.selectedPlan(denied.current,day),null);
  }
  const demo=fixture({demo:true});demo.api.choose(demo.current,day,'1:0',1);demo.current.id='regenerated-plan';demo.current.data.refeicoes.forEach((meal,mi)=>{meal.id='regenerated-meal-'+mi;meal.itens.forEach((item,ii)=>{item.id='regenerated-item-'+mi+'-'+ii;item.substituicoes.forEach((alt,ai)=>alt.id='regenerated-alt-'+mi+'-'+ii+'-'+ai);});});
  assert.deepEqual(demo.reload().read(demo.current,day),{'1:0':1});assert.equal(demo.reload().selectedItem(demo.current,day,1,0).id,'regenerated-alt-1-0-1');
  demo.current.version++;assert.deepEqual(demo.reload().read(demo.current,day),{});
  pass('only the current patient context can choose; demo survives regenerated seed ids while keeping patient, version and composition boundaries');

  let failRead=false,failWrite=false;const map=new Map(),storage={getItem:key=>{if(failRead)throw Error('blocked');return map.get(key)??null;},setItem:(key,value)=>{if(failWrite)throw Error('quota');map.set(key,value);}};
  const limited=fixture({storage});failWrite=true;assert.deepEqual(limited.api.choose(limited.current,day,'1:0',0),{saved:false});assert.equal(limited.api.selectedItem(limited.current,day,1,0).id,alternative.id);assert.match(limited.api.message(),/somente nesta sessão/);assert.deepEqual(limited.reload().read(limited.current,day),{});
  assert.throws(()=>limited.api.choose(limited.current,day,'1:0',999));assert.equal(limited.api.selectedItem(limited.current,day,1,0).id,alternative.id,'invalid option does not erase unsaved session choice');
  failWrite=false;assert.equal(limited.api.choose(limited.current,day,'1:0',1).saved,true);assert.deepEqual(limited.reload().read(limited.current,day),{'1:0':1});
  failRead=true;const blocked=limited.reload();assert.deepEqual(blocked.read(limited.current,day),{});assert.match(blocked.message(),/recuperar/);assert.equal(blocked.choose(limited.current,day,'1:0',0).saved,false);assert.equal(blocked.selectedItem(limited.current,day,1,0).id,alternative.id);failRead=false;assert.deepEqual(limited.reload().read(limited.current,day),{'1:0':1},'a read failure does not overwrite an unread saved preference');
  pass('storage failures are explicit, retain session choices, permit retry and never overwrite unread saved data');

  const corrupted=fixture();corrupted.api.choose(corrupted.current,day,'1:0',0);const [storageKey,serialized]=[...corrupted.values.entries()][0],valid=JSON.parse(serialized);
  for(const raw of ['not json',JSON.stringify({...valid,v:2}),JSON.stringify({...valid,day:nextDay}),JSON.stringify({...valid,context:'other-patient'}),JSON.stringify({...valid,choices:{'0:0':0}}),JSON.stringify({...valid,choices:{'1:0':99}}),JSON.stringify({...valid,choices:{'1:0':{nome:'Injected food',qtd:1,k:0}}})]){
    corrupted.values.set(storageKey,raw);const restored=corrupted.reload();assert.deepEqual(restored.read(corrupted.current,day),{});assert.match(restored.message(),/recuperar/);assert.deepEqual(restored.selectedItem(corrupted.current,day,1,0),original.data.refeicoes[1].itens[0]);
  }
  assert.deepEqual(corrupted.current,original);assert.equal(Object.hasOwn(corrupted.H,'saveLog'),false);assert.equal(Object.hasOwn(corrupted.H,'saveRecord'),false);
  pass('corrupt or copied storage never injects a food or changes the publication, and the engine requires no journal or cloud writer');
  console.log(passed+' patient food choice groups passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
