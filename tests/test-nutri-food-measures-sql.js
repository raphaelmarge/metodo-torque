// Exercise the captured schema in a disposable database with synthetic users.
// No live Supabase connection, migration or patient record is used.
'use strict';
const assert=require('node:assert/strict');
const {createSnapshotDb}=require('../supabase/releases/nutri-consolidation/replay-snapshot.cjs');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
(async()=>{
  const {makeFoodItem,changeFoodMeasure,measuredItemNutrition}=await import('../nutri/food-measures.js');
  const {makeRecipeFood}=await import('../nutri/recipe-composition.js');
  const {shoppingList,portionLabel}=await import('../nutri/shopping.js');
  const db=await createSnapshotDb(),query=(sql,args=[])=>db.query(sql,args);
  const clinician=id(1),patientUser=id(2),other=id(3),clinic=id(11),patient=id(21);
  const who=async user=>{await db.exec('reset role');await query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role authenticated');};
  try{
    await db.exec(`insert into auth.users(id,email,email_confirmed_at) values('${clinician}','clinician@example.test',now()),('${patientUser}','patient@example.test',now()),('${other}','other@example.test',now());
      insert into public.clinics(id,owner_id,name,professional_name) values('${clinic}','${clinician}','Teste','Teste');
      insert into public.patients(id,clinic_id,clinician_id,user_id,name,email,invite_code,invite_expires_at) values('${patient}','${clinic}','${clinician}','${patientUser}','Teste','patient@example.test',null,null);`);
    const source={id:'test:rice',n:'Arroz sintético',baseAmount:100,baseUnit:'g',k:100,pt:2,cb:20,g:1,fb:null,sodiumMg:0,source:'Fonte sintética',sourceUrl:'https://example.test/food',measures:[{id:'spoon',label:'colher de sopa',amount:25,unit:'g',source:'Fixture'}]};
    const rice=makeFoodItem(source,150,'g',{id:'rice'});
    const milk=makeFoodItem({id:'test:milk',n:'Leite sintético',brand:'Marca sintética',barcode:'12345678',baseAmount:100,baseUnit:'ml',k:50,pt:3,cb:4,g:2,calciumMg:100,source:'Rótulo sintético',measures:[{id:'glass',label:'copo',amount:200,unit:'ml',source:'Fixture'}]},250,'ml',{id:'milk'});
    const recipe=makeRecipeFood({v:1,recipeId:'test-recipe',title:'Preparação sintética',yield:2,ingredients:[rice,milk],steps:['Misture.'],source:'Fixture'},1,{id:'recipe',reviewedAt:'2026-10-22T12:00:00Z'});
    rice.substituicoes=[milk];
    const data={v:1,id:'plan',titulo:'Plano sintético',aguaMl:2000,refeicoes:[{id:'meal',titulo:'Almoço',hora:'12:00',itens:[rice,recipe]}]};
    await who(clinician);
    const draft=(await query("insert into public.plans(patient_id,clinician_id,status,data) values($1,$2,'draft',$3) returning *",[patient,clinician,data])).rows[0];
    const published=(await query('select * from public.publish_patient_plan($1,$2)',[patient,draft.version])).rows[0];
    assert.deepEqual(published.data,data);
    await who(patientUser);const visible=(await query('select * from public.plans')).rows[0];
    assert.deepEqual(visible.data.refeicoes[0].itens[0].measurement,rice.measurement);
    assert.deepEqual(visible.data.refeicoes[0].itens[0].substituicoes[0].measurement,milk.measurement);
    assert.equal(visible.data.refeicoes[0].itens[0].substituicoes[0].nome,'Leite sintético · Marca sintética');
    assert.deepEqual(visible.data.refeicoes[0].itens[1].recipeComposition.ingredients[0].measurement,rice.measurement);
    assert.equal(visible.data.refeicoes[0].itens[0].fb,null);assert.equal(visible.data.refeicoes[0].itens[0].sodiumMg,0);
    console.log('PASS publication and patient read preserve exact food, alternative and recipe measure snapshots without a schema migration');

    const changed=structuredClone(data);changed.refeicoes[0].itens[0]=changeFoodMeasure(rice,'spoon');
    await who(clinician);const next=(await query("update public.plans set data=$1 where id=$2 returning *",[changed,draft.id])).rows[0];
    const second=(await query('select * from public.publish_patient_plan($1,$2)',[patient,next.version])).rows[0];
    source.k=999;source.measures[0].amount=999;
    await who(patientUser);const history=(await query("select data from public.patient_records where kind='plan_version' order by created_at")).rows;
    const archived=history.find(row=>row.data.plan?.refeicoes?.[0]?.itens?.[0]?.measurement?.selectedMeasureId==='g');assert(archived);
    assert.deepEqual(archived.data.plan,data);assert.equal(second.data.refeicoes[0].itens[0].qtd,6);assert.equal(measuredItemNutrition(second.data.refeicoes[0].itens[0]).baseQuantity,150);
    const groceries=shoppingList(second.data,'2026-10-22','2026-10-22');assert(groceries.items.some(item=>portionLabel(item)==='6 × colher de sopa (150 g)'));
    await who(other);assert.equal((await query('select id from public.plans')).rows.length,0);assert.equal((await query("select id from public.patient_records where kind='plan_version'")).rows.length,0);
    console.log('PASS unit changes retain physical quantity, published history stays independent of the catalog, and another user sees neither plan nor snapshots');
  } finally { await db.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
