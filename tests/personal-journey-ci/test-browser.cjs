'use strict';
// An actual UI journey. Never inject users, store methods, publication results,
// workout data or Auth sessions into the page. SQL is used only to install
// canonical disposable contracts and to observe the effects of browser actions.
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {start,AUTH,REST}=require('./local-server.cjs');
const {verify}=require('./verify-source.cjs');
const SECRET='hq-auth-ci-only-hs256-secret-never-use-in-production-20260930';
const PG='postgresql://postgres:hq_auth_ci_postgres_test_only@127.0.0.1:55433/hq_auth_ci';
const ROOT=path.resolve(__dirname,'../..'),OUT=path.join(ROOT,'artifacts/personal-journey-ci');
const BASE=process.env.BASE_URL||process.env.MT_BASE||'http://127.0.0.1:58765';
const summary={schemaVersion:1,scope:'real-browser-real-auth-real-postgrest-disposable',status:'running',checks:[],
  limitations:['Auth identity is created confirmed by the local admin API; self-signup, email delivery and email confirmation are not tested.',
    'No hosted Supabase gateway, production database, payment, AI, push, WhatsApp, GPS or external exercise media is used.',
    'Chat/agenda/nutrition background RPCs outside the installed minimum may return real missing-contract errors. Their behavior is not claimed.',
    'This supplements, and never replaces, all 90 preceding Auth/PostgREST checks.'],network:[],externalBlocked:[],dialogs:[]};
let phase='environment guard',operation='none',client,server,browser,personal,pupil,anonKey,serviceKey;
const safeCode=v=>typeof v==='string'&&/^[a-zA-Z0-9_]{1,60}$/.test(v)?v:'UNCLASSIFIED';
function guard(){
  assert.equal(process.env.CI,'true');assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.RUNNER_OS,'Linux');
  assert.equal(process.env.TORQUE_PERSONAL_JOURNEY_CI,'1');assert.equal(process.env.HQ_AUTH_CI_DISPOSABLE,'1');
  assert.equal(BASE,'http://127.0.0.1:58765');
  for(const [name,value] of Object.entries({HQ_AUTH_CI_PG_URL:PG,HQ_AUTH_CI_AUTH_URL:AUTH,HQ_AUTH_CI_REST_URL:REST,HQ_AUTH_CI_JWT_SECRET:SECRET}))assert.equal(process.env[name],value);
  const previous=JSON.parse(fs.readFileSync(path.join(ROOT,'artifacts/hq-auth-ci/checks.json'),'utf8'));
  assert.equal(previous.status,'pass');assert.equal(previous.checks.length,90);assert(previous.checks.every(c=>c.status==='pass'));
  summary.precedingAuthChecks=previous.checks.length;summary.source=verify();fs.mkdirSync(OUT,{recursive:true});
}
const sign=role=>{const now=Math.floor(Date.now()/1000);const data=[{alg:'HS256',typ:'JWT'},{role,iss:'supabase',iat:now,exp:now+3600}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');return data+'.'+crypto.createHmac('sha256',SECRET).update(data).digest('base64url');};
async function request(base,route,{method='POST',body,token=anonKey}={}){
  assert([AUTH,REST].includes(base));assert(route.startsWith('/')&&!route.startsWith('//'));assert.equal(new URL(route,base).origin,base);
  const response=await fetch(base+route,{method,redirect:'error',signal:AbortSignal.timeout(15000),headers:{apikey:anonKey,Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  let data=null;try{data=await response.json();}catch{}
  return {ok:response.ok,status:response.status,data};
}
async function check(name,run){phase=name;await run();summary.checks.push({name,status:'pass'});console.log('OK '+summary.checks.length+' '+name);}
async function until(read,predicate,{timeout=20000,code='STATE_TIMEOUT'}={}){
  const end=Date.now()+timeout;
  for(;;){const value=await read();if(predicate(value))return value;if(Date.now()>=end)throw Object.assign(new Error('Expected state did not arrive'),{code});await new Promise(r=>setTimeout(r,150));}
}
async function rows(sql,params=[]){return (await client.query(sql,params)).rows;}
async function screenshot(page,name){await page.screenshot({path:path.join(OUT,name+'.png'),fullPage:false,animations:'disabled'});}
async function context(label,viewport){
  const ctx=await browser.newContext({viewport,locale:'pt-BR',timezoneId:'America/Sao_Paulo',serviceWorkers:'block',permissions:[]});
  await ctx.route('**/*',async route=>{
    let url;try{url=new URL(route.request().url());}catch{return route.abort('blockedbyclient');}
    if(url.origin===BASE)return route.continue();
    summary.externalBlocked.push({context:label,method:route.request().method(),origin:url.protocol==='http:'||url.protocol==='https:'?url.origin:'non-http',resource:route.request().resourceType()});
    await route.abort('blockedbyclient');
  });
  await ctx.routeWebSocket('**/*',socket=>{summary.externalBlocked.push({context:label,resource:'websocket'});socket.close();});
  ctx.on('page',page=>{
    page.setDefaultTimeout(20000);
    page.on('pageerror',e=>{summary.browserErrors=summary.browserErrors||[];summary.browserErrors.push({context:label,name:safeCode(e.name)});});
    page.on('dialog',async dialog=>{
      const creating=operation==='create workout sheet'&&dialog.type()==='prompt'&&/^Nome da ficha/.test(dialog.message());
      const blocked=dialog.type()==='alert'&&/ainda não tem o app criado/.test(dialog.message());
      summary.dialogs.push({context:label,type:dialog.type(),expected:creating,code:blocked?'FIRST_PUBLICATION_REQUIRES_ACCESS':creating?'WORKOUT_NAME':'DISMISSED'});
      if(creating)await dialog.accept('A — Treino isolado');else await dialog.dismiss();
    });
  });
  return ctx;
}
async function main(){
  guard();anonKey=sign('anon');serviceKey=sign('service_role');
  const {Client}=require('../sql/node_modules/pg');
  client=new Client({connectionString:PG,application_name:'personal_browser_journey_ci',connectionTimeoutMillis:10000});await client.connect();
  await check('canonical application contracts extend the already-approved disposable database',async()=>{
    summary.applicationContracts=await require('./application-contracts.cjs').install({client});
    await until(()=>request(REST,'/rpc/app_aluno_estado',{body:{t:'nonexistent-journey-readiness-token'}}),r=>{
      if(r.status===404&&r.data?.code==='PGRST202')return false;
      assert.equal(r.ok,true);assert.deepEqual(r.data,{ok:false,motivo:'sem_registro'});return true;
    },{code:'APPLICATION_SCHEMA_RELOAD_TIMEOUT'});
  });
  const identity={email:'personal-browser-'+crypto.randomBytes(8).toString('hex')+'@example.test',password:'Isolated-Journey-'+crypto.randomBytes(20).toString('hex')};
  await check('confirmed synthetic identity exists without any browser session or membership',async()=>{
    const created=await request(AUTH,'/admin/users',{token:serviceKey,body:{email:identity.email,password:identity.password,email_confirm:true,user_metadata:{syntheticFixture:true,nome:'Personal CI'}}});
    assert.equal(created.ok,true);identity.id=created.data.id;assert.match(identity.id,/^[a-f0-9-]{36}$/);
    assert.equal((await rows('select 1 from auth.sessions where user_id=$1',[identity.id])).length,0);
    assert.equal((await rows('select 1 from public.membros where user_id=$1',[identity.id])).length,0);
  });
  server=await start({root:ROOT,anonKey});assert.equal(server.origin,BASE);
  const {chromium}=require('../ci/node_modules/playwright');browser=await chromium.launch({args:['--no-sandbox']});
  const pc=await context('personal',{width:1280,height:900});personal=await pc.newPage();
  let accountId,studentId,token;
  await check('browser password sign-in creates a real Auth session and one typed Personal account',async()=>{
    operation='open Personal login';await personal.goto(BASE+'/personal.html',{waitUntil:'domcontentloaded'});
    await personal.locator('#mgEmail').fill(identity.email);await personal.locator('#mgSenha').fill(identity.password);
    operation='submit actual login';await personal.locator('#mgBtn').click();
    const memberships=await until(()=>rows("select m.academia_id,m.papel,s.tipo from public.membros m join public.saas_clientes s on s.academia_id=m.academia_id where m.user_id=$1",[identity.id]),r=>r.length>0);
    assert.equal(memberships.length,1);assert.equal(memberships[0].papel,'dono');assert.equal(memberships[0].tipo,'personal');accountId=memberships[0].academia_id;
    assert((await rows('select 1 from auth.sessions where user_id=$1',[identity.id])).length>0);
    await personal.locator('#gateModulo').waitFor({state:'hidden'});
    assert(server.events.some(e=>e.route==='auth:POST:/token'&&e.status===200));
    assert(server.events.some(e=>e.route==='rest:POST:/rpc/criar_personal'&&e.status===200));
    // A confirmed identity without an island receives the default studio name
    // from the real account flow. Fill the name only if that form is presented.
    await personal.locator('#obNome:visible, #obP4Aluno:visible').first().waitFor({state:'visible'});
    if(await personal.locator('#obNome').isVisible()){
      operation='name the Personal';await personal.locator('#obNome').fill('Personal fictício CI');await personal.locator('#obOk').click();
    }
    await personal.locator('#obP4Aluno').waitFor({state:'visible'});await screenshot(personal,'01-personal-first-use');
  });
  const studio=async()=>{const result=await rows("select valor,atualizado from public.dados where academia_id=$1 and chave='mtapp:ptStudio'",[accountId]);return result[0]||null;};
  await check('minimum pupil registration persists through real optimistic cloud writes without invitation',async()=>{
    operation='create pupil';await personal.locator('#obP4Aluno').click();await personal.locator('#aNome').fill('Aluno fictício CI');
    await personal.locator('#aAdd').click();await personal.locator('#naTreino').waitFor({state:'visible'});
    const stored=await until(studio,s=>s?.valor?.alunos?.some(a=>a.nome==='Aluno fictício CI'));
    const student=stored.valor.alunos.find(a=>a.nome==='Aluno fictício CI');studentId=student.id;
    assert(!student.appTokenP);assert(!student.acessoEm);
    assert.equal((await rows('select 1 from public.app_aluno where academia_id=$1',[accountId])).length,0);
    assert(server.events.some(e=>/rest:POST:\/rpc\/(dados_cas|dados_personal_patch)$/.test(e.route||'')&&e.status===200));
    await screenshot(personal,'02-pupil-saved');
  });
  await check('a real UI workout sheet and exercise persist in the Personal cloud document',async()=>{
    operation='open workout editor';await personal.locator('#naTreino').click();assert.equal(await personal.locator('#tAluno').inputValue(),studentId);
    operation='create workout sheet';await personal.locator('#tFicha').click();
    await personal.locator('[data-exbusca]').waitFor({state:'attached'});
    if(!await personal.locator('[data-exbusca]').isVisible())await personal.locator('[data-exadd]').click();
    await personal.locator('[data-exbusca]').fill('Supino reto com barra');
    await personal.locator('[data-exchip][data-nome="Supino reto com barra"]').click();
    await personal.locator('[data-exser]').fill('1');await personal.locator('[data-exrep]').fill('5');
    await personal.locator('[data-excarga]').fill('20');
    operation='save exercise';await personal.locator('[data-additem]').click();
    const stored=await until(studio,s=>s?.valor?.treinosV2?.[studentId]?.fichas?.[0]?.itens?.length===1);
    const sheet=stored.valor.treinosV2[studentId].fichas[0];assert.equal(sheet.titulo,'A — Treino isolado');
    const ex=stored.valor.exercicios.find(e=>e.id===sheet.itens[0].exId);assert.equal(ex.nome,'Supino reto com barra');
    assert.equal((await rows('select 1 from public.app_aluno where academia_id=$1',[accountId])).length,0);
    await screenshot(personal,'03-workout-draft');
  });
  let published;
  await check('explicit review and first publication create the pupil package without prior access or messages',async()=>{
    operation='review first publication';await personal.locator('#tdPublica').click();await personal.locator('#acPublicar').waitFor({state:'visible'});
    await screenshot(personal,'04-review-prescription');operation='confirm first publication';await personal.locator('#acPublicar').click();
    published=await until(async()=>{
      if(summary.dialogs.some(d=>d.code==='FIRST_PUBLICATION_REQUIRES_ACCESS'))throw Object.assign(new Error('First publication needs absent access'),{code:'FIRST_PUBLICATION_REQUIRES_ACCESS'});
      return (await rows('select token,dados,revogado_em,visto_em from public.app_aluno where academia_id=$1',[accountId]))[0];
    },r=>!!r?.dados?.dados?.guiaFichasP?.length,{code:'PUBLICATION_NOT_CONFIRMED'});
    token=published.token;assert.equal(published.revogado_em,null);assert.equal(published.visto_em,null);
    assert.equal(published.dados.dados.a.id,studentId);assert.equal(published.dados.dados.a.nome,'Aluno fictício CI');
    assert(published.dados.sourceUpdatedAt);assert.equal(published.dados.html,'');
    assert(server.events.some(e=>e.route==='rest:POST:/rpc/app_aluno_publica_cas'&&e.status===200));
    await personal.locator('#tEnvioStatus').filter({hasText:'Enviado!'}).waitFor({state:'visible'});
    const stored=await until(studio,s=>!!s?.valor?.alunos?.find(a=>a.id===studentId)?.appPubEm);
    assert(!stored.valor.alunos.find(a=>a.id===studentId).acessoEm);
    await screenshot(personal,'05-publication-confirmed');
  });
  await check('a separate pupil browser receives the published workout using only its genuine app token',async()=>{
    const ac=await context('pupil',{width:390,height:844});assert.deepEqual((await ac.storageState()).origins,[]);pupil=await ac.newPage();
    operation='open published pupil app';await pupil.goto(BASE+'/app/?t='+encodeURIComponent(token),{waitUntil:'domcontentloaded'});
    await pupil.locator('#navApp').waitFor({state:'visible'});
    await until(()=>rows('select visto_em from public.app_aluno where token=$1',[token]),r=>!!r[0]?.visto_em);
    // The minimum journey deliberately publishes only a workout. The actual
    // nutrition runtime creates its section only for a plan or past records;
    // this second context has no past records. Do not fabricate a meal plan.
    operation='verify pupil navigation against the published package';
    const nutritionPublished=!!published.dados.dados.nutricaoApp;
    assert.equal(await pupil.locator('#navApp [data-msec="alimentacao"]').count(),nutritionPublished?1:0);
    if(nutritionPublished)assert(await pupil.locator('#navApp [data-msec="alimentacao"]').isVisible());
    assert.equal(await pupil.locator('#navApp button').count(),nutritionPublished?5:4);
    summary.navigation={nutritionPublished,nutritionJourneyVerified:false,reason:'Workout-only minimum registration; no nutrition plan was created.'};
    assert.equal(await pupil.evaluate(()=>Object.keys(localStorage).some(k=>/^sb-.*-auth-token$/.test(k))),false);
    assert(server.events.some(e=>e.route==='rest:POST:/rpc/app_aluno_estado'&&e.status===200));
    await pupil.keyboard.press('Escape');await screenshot(pupil,'06-pupil-home');
    operation='view prescribed workout';await pupil.locator('#navApp [data-msec="treino"]').click();
    await pupil.locator('.guiabtn').first().waitFor({state:'visible'});await screenshot(pupil,'07-pupil-workout');
    operation='start prescribed workout';await pupil.locator('.guiabtn').first().click();
    await pupil.locator('#gEx').filter({hasText:'Supino reto com barra'}).waitFor({state:'visible'});
    assert.equal(await pupil.locator('#gReps').inputValue(),'5');assert.equal(await pupil.locator('#gKg').inputValue(),'20');
    await screenshot(pupil,'08-pupil-player');
  });
  await check('the pupil records a real set and its event is accepted by the disposable server',async()=>{
    operation='record prescribed set';await pupil.locator('#gSerie').click();
    // The real player first stores the form (result, still uncompleted), then
    // marks the set (a correction referencing that result). Prove both events
    // and their ancestry instead of mistaking a correct revision for a failure.
    const events=(await until(()=>rows("select evento from public.app_treino_eventos where token=$1",[token]),r=>r.some(x=>x.evento?.type==='correction'&&x.evento?.value?.feito===true),{code:'SET_EVENT_NOT_CONFIRMED'})).map(x=>x.evento);
    const completed=events.find(e=>e.type==='correction'&&e.value.feito===true);
    assert.equal(completed.value.kg,20);assert.equal(completed.value.r,5);assert.equal(completed.target,'0:0:0');
    assert.equal(completed.parents.length,1);
    const original=events.find(e=>e.id===completed.parents[0]);assert(original);assert.equal(original.type,'result');
    assert.equal(original.value.feito,false);assert.equal(original.value.kg,20);assert.equal(original.value.r,5);
    assert.equal(original.target,completed.target);assert.equal(original.session,completed.session);assert.deepEqual(original.parents,[]);
    assert(!events.some(e=>Array.isArray(e.parents)&&e.parents.includes(completed.id)),'Completed revision must remain the current head');
    assert(events.some(e=>e.type==='start'&&e.kind==='musculacao'&&e.session===completed.session));
    summary.seriesEvidence={type:completed.type,originalPreserved:true,parentCount:1,currentHeadCompleted:true,weight:20,repetitions:5};
    assert(server.events.some(e=>e.route==='rest:POST:/rpc/app_treino_eventos_grava'&&e.status===200));
    await screenshot(pupil,'09-pupil-set-recorded');
  });
  await check('journey has no JavaScript failures, external delivery, generated credentials or fabricated success',async()=>{
    assert.deepEqual(summary.browserErrors||[],[]);
    assert(!server.events.some(e=>e.kind==='proxy'&&/envia|pagamento|billing|aluno_define_login/.test(e.route)));
    assert(!server.events.some(e=>/^\/functions\/v1\/(?:push-envia|envia-email|pagamentos|personal-billing)/.test(e.route||'')));
    assert(!server.events.some(e=>e.kind==='deny'&&e.method==='POST'),'Unexpected mutation refused by diagnostic transport');
    assert(!summary.externalBlocked.some(e=>e.method&&!['GET','HEAD'].includes(e.method)),'External mutation attempted by browser');
    assert.equal((await rows('select count(*)::int as n from personal_billing.accounts where academia_id=$1',[accountId]))[0].n,0);
    summary.externalEffects='none; fixed loopback Auth/PostgREST only';
  });
  summary.status='pass';console.log('PASS '+summary.checks.length+' real browser journey groups; email delivery remains unverified');
}
main().catch(async error=>{
  summary.status='fail';summary.failure={phase,operation,code:safeCode(error.code||error.name)};
  console.error('FAIL '+phase+' operation='+operation+' ['+summary.failure.code+']');process.exitCode=1;
  if(fs.existsSync(OUT)){for(const [page,label] of [[personal,'personal'],[pupil,'pupil']])if(page&&!page.isClosed())await screenshot(page,'failure-'+label).catch(()=>{});}
}).finally(async()=>{
  if(browser)await browser.close().catch(()=>{});if(server){summary.network=server.events;await server.close().catch(()=>{});}if(client)await client.end().catch(()=>{});
  // No trace/HAR/storage state, response bodies, Auth keys, app tokens or passwords.
  if(fs.existsSync(OUT))fs.writeFileSync(path.join(OUT,'journey.json'),JSON.stringify(summary,null,2)+'\n');
});
