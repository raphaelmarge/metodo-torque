// Executes real captured plan constraints, publication RPC and history triggers
// in disposable PGlite. Synthetic identities only; no production Auth/network.
const assert=require('node:assert/strict');
const {createSnapshotDb}=require('../supabase/releases/nutri-consolidation/replay-snapshot.cjs');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const A=id(1),B=id(2),PA=id(3),PB=id(4),CA=id(11),CB=id(12),RA=id(21),RB=id(22);
(async()=>{
 const {makeRecipeFood}=await import('../nutri/recipe-composition.js');
 const {previousPublishedPlan,comparePlans}=await import('../nutri/plan-changes.js');
 const {shoppingList}=await import('../nutri/shopping.js');
 const db=await createSnapshotDb(),query=(sql,args=[])=>db.query(sql,args);
 const who=async(user)=>{await db.exec('reset role');await query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role authenticated');};
 let checks=0;const check=async(name,fn)=>{await fn();checks++;console.log('OK '+name);};
 try{
  await db.exec(`insert into auth.users(id,email,email_confirmed_at) values('${A}','a@example.test',now()),('${B}','b@example.test',now()),('${PA}','pa@example.test',now()),('${PB}','pb@example.test',now());
   insert into public.clinics(id,owner_id,name,professional_name) values('${CA}','${A}','A','A'),('${CB}','${B}','B','B');
   insert into public.patients(id,clinic_id,clinician_id,user_id,name,email,invite_code,invite_expires_at) values('${RA}','${CA}','${A}','${PA}','A','pa@example.test',null,null),('${RB}','${CB}','${B}','${PB}','B','pb@example.test',null,null);`);
  const recipe={v:1,recipeId:'recipe-a',recipeVersion:1,title:'Arroz sintético',yield:2,ingredients:[{id:'rice',nome:'Arroz cozido',porcao:'100 g',qtd:3,k:100,pt:2,cb:20,g:1}],steps:['Preparar'],source:'Fixture'};
  const item=makeRecipeFood(recipe,1.5,{id:'recipe-item',reviewedAt:'2026-10-17T12:00:00Z'});
  const data={v:1,id:'plan-a',titulo:'Plano sintético',aguaMl:2000,startOn:'2026-10-12',refeicoes:[{id:'lunch',titulo:'Almoço',hora:'12:00',dias:[1,3,5],itens:[item]}]};
  await who(A);
  let draft=(await query("insert into public.plans(patient_id,clinician_id,status,data) values($1,$2,'draft',$3) returning *",[RA,A,data])).rows[0],published;
  await check('publicação preserva composição, frações e dias sem nova migração',async()=>{
   published=(await query('select * from public.publish_patient_plan($1,$2)',[RA,draft.version])).rows[0];
   assert.deepEqual(published.data,data);assert.equal(published.data.refeicoes[0].itens[0].qtd,1.5);
   assert.deepEqual(published.data.refeicoes[0].dias,[1,3,5]);
  });
  const first=structuredClone(published),second=structuredClone(data);second.refeicoes[0].itens[0].qtd=2;second.refeicoes[0].hora='13:00';
  await check('rascunho novo mantém paciente na publicação anterior e CAS rejeita versão antiga',async()=>{
   draft=(await query("update public.plans set data=$1 where patient_id=$2 and status='draft' returning *",[second,RA])).rows[0];
   await assert.rejects(()=>query('select * from public.publish_patient_plan($1,$2)',[RA,draft.version-1]),e=>e.code==='40001');
   await who(PA);assert.deepEqual((await query('select * from public.plans')).rows.map(x=>x.data),[data]);
  });
  await check('histórico imutável alimenta comparação e compras sem depender do catálogo',async()=>{
   await who(A);published=(await query('select * from public.publish_patient_plan($1,$2)',[RA,draft.version])).rows[0];
   recipe.ingredients[0].qtd=999;recipe.title='Catálogo alterado';
   await who(PA);const records=(await query("select * from public.patient_records where kind='plan_version'")).rows;
   const previous=previousPublishedPlan(records,published,RA);assert(previous);assert.deepEqual(previous.data.plan,first.data);
   const diff=comparePlans(previous.data.plan,published.data);assert(diff.changes.some(x=>x.label==='Porção'));assert(diff.changes.some(x=>x.label==='Horário'));
   const list=shoppingList(published.data,'2026-10-12','2026-10-18');assert.equal(list.items[0].qtd,9);assert.equal(list.items[0].nome,'Arroz cozido');
   assert.equal((await query("update public.patient_records set title='alterado' where id=$1 returning id",[previous.id])).rows.length,0);
  });
  await check('paciente e profissional alheios não leem plano, receita nem histórico',async()=>{
   for(const user of [B,PB]){await who(user);assert.equal((await query('select id from public.plans where patient_id=$1',[RA])).rows.length,0);assert.equal((await query("select id from public.patient_records where patient_id=$1 and kind='plan_version'",[RA])).rows.length,0);await assert.rejects(()=>query('select * from public.publish_patient_plan($1,$2)',[RA,draft.version]),e=>e.code==='42501');}
  });
  console.log(checks+' cenários de publicação da evolução Nutri passaram.');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
