/* Real disposable PostgreSQL + simulated Pagar.me/Auth HTTP contracts.
 * Real Auth/PostgREST authorization is independently covered by hq-auth-ci.
 * Never accepts a remote database or contacts a real payment provider.
 */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Client } = require(process.env.TORQUE_PG_MODULE || './sql/node_modules/pg');
(async () => {
  const url = new URL(process.env.PGTESTURL || '');
  assert(['postgres:','postgresql:'].includes(url.protocol) && ['127.0.0.1','[::1]'].includes(url.hostname) && !url.search && !url.hash,
    'PGTESTURL must be a disposable loopback PostgreSQL database');
  const options = { host: url.hostname.replace(/[\[\]]/g,''), port: Number(url.port || 5432),
    user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database: decodeURIComponent(url.pathname.slice(1)) };
  const dbName = 'torque_billing_' + randomUUID().replace(/-/g,''), admin = new Client(options);
  let db, created = false, passed = 0;
  const ok = (v, label) => { assert(v, label); passed++; console.log('OK ' + label); };
  const ids = { a: randomUUID(), b: randomUUID(), u: randomUUID(), v: randomUUID(), s: randomUUID(), t: randomUUID() };
  const now = new Date(), ago = d => new Date(now - d * 864e5).toISOString(), future = d => new Date(+now + d * 864e5).toISOString();
  const owner = { userId: ids.u, sessionId: ids.s }, other = { userId: ids.v, sessionId: ids.t };
  const scope = { environment: 'test', merchantId: 'acc_Fixture' };
  try {
    await admin.connect();
    for(const role of ['anon','authenticated','service_role']) await admin.query(`do $$ begin
      if not exists(select 1 from pg_roles where rolname='${role}') then create role ${role} nologin; end if;
      exception when duplicate_object then null; end $$;`);
    await admin.query('create database ' + dbName); created = true;
    db = new Client({ ...options, database: dbName }); await db.connect();
    await db.query(`create schema auth;
      create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
      create table public.academias(id uuid primary key,nome text,criada timestamptz,assinatura_status text,assinatura_via text,assinatura_vence timestamptz);
      create table public.membros(academia_id uuid,user_id uuid,papel text);
      create table public.saas_clientes(academia_id uuid,tipo text);
      grant usage on schema public to anon,authenticated,service_role;`);
    await db.query('insert into auth.sessions values($1,$2,null),($3,$4,null)', [ids.s,ids.u,ids.t,ids.v]);
    await db.query("insert into public.academias values($1,'A',$3,'trial',null,null),($2,'B',$3,'trial',null,null)", [ids.a,ids.b,ago(20)]);
    await db.query("insert into membros values($1,$2,'dono'),($3,$4,'dono')", [ids.a,ids.u,ids.b,ids.v]);
    await db.query("insert into saas_clientes values($1,'personal'),($2,'personal')",[ids.a,ids.b]);
    await db.query(fs.readFileSync(path.join(__dirname,'../supabase/releases/personal-billing-optional/migrations/20261006161032_personal_billing_saas_optin.sql'),'utf8'));
    const rpc = async (action,data={}) => (await db.query('select public.personal_billing_service($1,$2::jsonb) result', [action,JSON.stringify({...scope,...data})])).rows[0].result;
    const jwt = user => 'test.' + Buffer.from(JSON.stringify({ sub: user === ids.u ? ids.u : ids.v, role:'authenticated',
      session_id:user===ids.u?ids.s:ids.t, exp:Math.floor(+now/1000)+3600 })).toString('base64url') + '.synthetic';
    let providerCalls = [], mode = '', sub = null, invoices = [], charges = {}, customer = null, postSubscriptions = 0;
    const plan = { id:'plan_Fixture',status:'active',currency:'BRL',interval:'month',interval_count:1,billing_type:'prepaid',
      payment_methods:['credit_card'],items:[{status:'active',quantity:1,pricing_scheme:{price:4990,scheme_type:'unit'}}] };
    const json = (v,status=200) => new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json'}});
    const fakeFetch = async (url,options={}) => {
      const u = new URL(url);
      if (u.origin==='https://synthetic.supabase.invalid') {
        if (u.pathname==='/auth/v1/user') {
          const token=options.headers.Authorization?.slice(7);
          return token===jwt(ids.u)?json({id:ids.u,is_anonymous:false}):token===jwt(ids.v)?json({id:ids.v,is_anonymous:false}):json({},401);
        }
        assert.equal(u.pathname,'/rest/v1/rpc/personal_billing_service');
        const p=JSON.parse(options.body);
        if(p.p_action==='reserve'&&mode==='reserve_timeout'){
          await rpc(p.p_action,p.p_data);throw Error('simulated lost reservation response');
        }
        try { return json(await rpc(p.p_action,p.p_data)); } catch(e) { return json({message:e.message,code:e.code},400); }
      }
      assert.equal(u.origin,'https://api.pagar.me','test must never forward a network request');
      providerCalls.push({path:u.pathname,method:options.method||'GET',body:options.body?JSON.parse(options.body):null});
      const route=u.pathname.replace('/core/v5',''), method=options.method||'GET', body=options.body?JSON.parse(options.body):null;
      if(route==='/plans/plan_Fixture'){if(mode==='plan_failure')return json({},503);return json(plan);}
      if(route==='/customers' && method==='POST'){
        customer={...body,id:'cus_Fixture'};return json(customer);
      }
      if(route==='/customers' && method==='GET')return json({data:customer?[customer]:[]});
      if(route==='/customers/cus_Fixture/cards')return json({id:'card_Fixture'});
      if(route==='/subscriptions' && method==='POST'){
        postSubscriptions++;
        sub={...body,id:'sub_Fixture',customer:{id:body.customer_id},status:'active'};
        if(mode==='timeout')throw Error('simulated lost response after provider committed');
        return json(sub);
      }
      if(route==='/subscriptions' && method==='GET')return json({data:sub?[sub]:[]});
      if(route==='/subscriptions/'+sub?.id && method==='GET')return json(sub);
      if(route==='/subscriptions/'+sub?.id && method==='DELETE'){
        if(mode==='cancel_timeout')throw Error('simulated provider timeout');
        if(mode==='cancel_ack')return json({id:sub.id,status:'active'});
        sub.status='canceled';return json(sub);
      }
      if(route==='/invoices')return json({data:invoices});
      if(route.startsWith('/invoices/'))return json(invoices.find(x=>x.id===route.slice(10)));
      if(route.startsWith('/charges/'))return json(charges[route.slice(9)]);
      throw Error('Unexpected synthetic provider route: '+route);
    };
    const {createPersonalBillingHandler,createPersonalBillingRuntime,createPersonalBillingWebhookHandler}=await import('../supabase/functions/_shared/personal-billing-handler.mjs');
    const env={SUPABASE_URL:'https://synthetic.supabase.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service',
      PERSONAL_BILLING_ENVIRONMENT:'test',PERSONAL_BILLING_MERCHANT_ID:'acc_Fixture',PERSONAL_BILLING_PLAN_ID:'plan_Fixture',
      PERSONAL_BILLING_SECRET_KEY:'sk_test_fixture',PERSONAL_BILLING_PUBLIC_KEY:'pk_test_fixture',
      PERSONAL_BILLING_WEBHOOK_SECRET:'synthetic-webhook-secret-at-least-thirty-two-characters'};
    const deps={env,fetch:fakeFetch,now:()=>now.toISOString()};
    const call=async(handler,body,user=ids.u)=>{
      const r=await handler(new Request('https://synthetic.invalid',{method:'POST',headers:{Authorization:'Bearer '+jwt(user)},body:JSON.stringify(body)}));
      return {status:r.status,...await r.json()};
    };
    const input={action:'checkout',academiaId:ids.a,attemptId:randomUUID(),cardToken:'token_Fixture',
      customer:{name:'Fixture Owner',email:'owner@example.invalid',address:{country:'BR',state:'SP',city:'São Paulo',zip_code:'01001000',line_1:'1, Rua fictícia, Centro'}}};
    let handler=createPersonalBillingHandler(deps);
    const off=await call(handler,input);
    ok(off.error==='billing_disabled' && providerCalls.length===0,'gate off makes zero Pagar.me calls');
    ok((await call(handler,{action:'accounts'})).accounts.length===1,'accounts returns only current owner academy');
    ok((await call(handler,{action:'status',academiaId:ids.b})).status===403,'another owner account is denied');
    ok((await call(handler,{...input,planId:'plan_Attacker'})).status===422,'client cannot inject server plan');
    env.PERSONAL_BILLING_NEW_SUBSCRIPTIONS_ENABLED='true';env.PERSONAL_BILLING_HOMOLOGATED='true';
    handler=createPersonalBillingHandler(deps);mode='plan_failure';
    const beforeReserve=await call(handler,input);
    ok(beforeReserve.error==='checkout_not_started'&&beforeReserve.attemptNotStarted&&beforeReserve.retryable,
      'explicit plan lookup failure certifies checkout never reached reservation');
    ok((await db.query('select count(*)::int n from personal_billing.attempts')).rows[0].n===0,'pre-reservation error leaves no attempt and can be retried');
    mode='reserve_timeout';const lostReserve=await call(handler,input);
    ok(lostReserve.error!=='checkout_not_started'&&!lostReserve.attemptNotStarted,'lost reservation response is never certified as not started');
    const reserved=(await db.query('select lease_id from personal_billing.accounts where academia_id=$1',[ids.a])).rows[0];
    await rpc('attempt_failed',{academiaId:ids.a,leaseId:reserved.lease_id,definitive:true,reason:'synthetic_before_post'});
    input.attemptId=randomUUID();mode='timeout';
    const unknown=await call(handler,input);
    ok(unknown.state==='pending' && unknown.retryAllowed===false && postSubscriptions===1,'lost POST result remains pending with one provider subscription');
    const duplicate=await call(handler,{...input,attemptId:randomUUID()});
    ok(duplicate.state==='pending' && postSubscriptions===1,'a new browser attempt cannot repeat an ambiguous POST');
    const rt=createPersonalBillingRuntime(deps);
    mode=''; await rt.sync(ids.a);
    let status=(await rpc('status',{academiaId:ids.a,actor:owner})).status;
    ok(status.state==='expired' && !status.accessActive,'active provider subscription without paid invoice grants no access');
    const paidInvoice={id:'in_First',status:'paid',amount:4990,payment_method:'credit_card',subscription:{id:sub.id},customer:{id:customer.id},
      period:{start_at:ago(2),end_at:future(29)},charges:[{id:'ch_First'}]};
    invoices=[paidInvoice];charges.ch_First={id:'ch_First',invoice:{id:'in_First'},customer:{id:customer.id},currency:'BRL',payment_method:'credit_card',
      status:'paid',amount:4990,paid_amount:4990,paid_at:ago(1),last_transaction:{status:'captured'}};
    await rt.sync(ids.a);status=(await rpc('status',{academiaId:ids.a,actor:owner})).status;
    ok(status.state==='paid' && status.accessActive && Date.parse(status.paidThrough)===Date.parse(future(29)),'canonical paid invoice grants exactly its finite paid period');
    await db.query("update academias set assinatura_status='bloqueada' where id=$1",[ids.a]);
    const blocked=(await rpc('status',{academiaId:ids.a,actor:owner})).status;
    ok(!blocked.accessActive&&blocked.accessKind==='blocked','a paid invoice does not bypass an administrative account block');
    await db.query("update academias set assinatura_status='trial' where id=$1",[ids.a]);
    invoices.push({...paidInvoice,id:'in_Renewal',status:'failed',period:{start_at:future(29),end_at:future(60)},charges:[]});
    await rt.sync(ids.a);status=(await rpc('status',{academiaId:ids.a,actor:owner})).status;
    ok(status.accessActive&&status.paymentIssue==='payment_failed','failed renewal is visible without removing the already paid current period');
    const before=await db.query('select * from personal_billing.invoices');
    await rt.sync(ids.a);
    ok((await db.query('select count(*)::int n from personal_billing.invoices')).rows[0].n===2,'repeated canonical snapshot is idempotent');
    const lease1=randomUUID(),lease2=randomUUID();
    await rpc('lease',{academiaId:ids.a,leaseId:lease1});
    const concurrent=await rpc('lease',{academiaId:ids.a,leaseId:lease2});
    ok(concurrent.busy,'concurrent reconciliation cannot read with a second active lease');
    await db.query("update personal_billing.accounts set lease_until=now()-interval '1 second'");
    await rpc('lease',{academiaId:ids.a,leaseId:lease2});
    await assert.rejects(rpc('commit',{academiaId:ids.a,leaseId:lease1,subscriptionId:sub.id,subscriptionStatus:'active',invoices:[]}),/stale_lease/);
    ok(true,'expired reader cannot overwrite a newer reconciliation');await rpc('release',{academiaId:ids.a,leaseId:lease2});
    mode='cancel_ack';const pending=await call(handler,{action:'cancel',academiaId:ids.a});
    ok(pending.state==='cancel_pending' && !pending.renewalCanceled && pending.accessActive,'HTTP success with active subscription does not claim cancellation');
    mode='cancel_timeout';const timeoutCancel=await call(handler,{action:'cancel',academiaId:ids.a});
    ok(timeoutCancel.state==='cancel_pending' && timeoutCancel.canCancel,'cancel timeout keeps an explicit retry available for the same subscription');
    mode='';const canceled=await call(handler,{action:'cancel',academiaId:ids.a});
    ok(canceled.renewalCanceled && canceled.state==='canceled' && canceled.accessActive,'confirmed cancellation preserves current paid period');
    const webhook=createPersonalBillingWebhookHandler(deps);
    const event={id:'hook_Refund',type:'charge.refunded',account:{id:'acc_Fixture'},data:{id:'ch_First'}};
    const deliver=secret=>webhook(new Request('https://synthetic.invalid',{method:'POST',headers:{'x-personal-billing-secret':secret},body:JSON.stringify(event)}));
    ok((await deliver('attacker')).status===401,'unauthenticated events cannot access provider or ledger');
    charges.ch_First.status='refunded';charges.ch_First.refunded_amount=4990;
    ok((await deliver(env.PERSONAL_BILLING_WEBHOOK_SECRET)).status===200,'authenticated event reconciles provider charge and commits receipt');
    status=(await rpc('status',{academiaId:ids.a,actor:owner})).status;
    ok(!status.accessActive && status.state==='needs_review','confirmed refund removes that invoice entitlement');
    charges.ch_First.status='paid';delete charges.ch_First.refunded_amount;
    await rt.sync(ids.a);status=(await rpc('status',{academiaId:ids.a,actor:owner})).status;
    ok(!status.accessActive,'stale paid snapshot cannot resurrect refunded access');
    const replay=await deliver(env.PERSONAL_BILLING_WEBHOOK_SECRET);
    ok((await replay.json()).duplicate===true,'completed event receipt deduplicates delivery');
    const rows=await db.query("select (select count(*) from personal_billing.events where state='done') events,(select count(*) from personal_billing.invoices) invoices");
    ok(Number(rows.rows[0].events)===1 && Number(rows.rows[0].invoices)===2,'event completion and normalized invoice ledger remain consistent');
    const persisted=JSON.stringify((await db.query('select to_jsonb(x) x from personal_billing.accounts x')).rows)+
      JSON.stringify((await db.query('select to_jsonb(x) x from personal_billing.attempts x')).rows);
    ok(!persisted.includes('token_Fixture')&&!persisted.includes('owner@example.invalid'),'ledger contains neither card token nor customer PII');
    const raw=(await db.query('select assinatura_status,assinatura_via,assinatura_vence from academias where id=$1',[ids.a])).rows[0];
    ok(raw.assinatura_status==='trial' && raw.assinatura_via===null && raw.assinatura_vence===null,'optional SaaS does not rewrite legacy entitlement fields');
    // Install the access opt-in using the actual legacy snapshot and diff helpers.
    await db.query(`create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function public.minhas_academias() returns setof uuid language sql stable as $$ select academia_id from public.membros where user_id=auth.uid() $$;
      create table assinatura_regras(id int,dias_teste int,dias_carencia int); insert into assinatura_regras values(1,14,3);
      create table dados(academia_id uuid,chave text,valor jsonb,atualizado timestamptz default now(),primary key(academia_id,chave));
      create table app_aluno(token text primary key,academia_id uuid,dados jsonb,atualizado timestamptz default now(),revogado_em timestamptz);
      create schema torque_private;`);
    const reliability=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20260926232430_confiabilidade_interna.sql'),'utf8');
    await db.query(reliability.slice(reliability.indexOf('create or replace function torque_private.studio_at'),reliability.indexOf('create table if not exists public.personal_alteracoes')));
    await db.query(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261005150924_personal_cortesia_temporaria.sql'),'utf8'));
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids.v]);
    const legacyBefore=(await db.query('select public.minha_assinatura() s')).rows[0].s;
    await db.query(fs.readFileSync(path.join(__dirname,'../supabase/releases/personal-billing-optional/migrations/20261006162018_personal_billing_access_optin.sql'),'utf8'));
    const legacyAfter=(await db.query('select public.minha_assinatura() s')).rows[0].s;
    ok(JSON.stringify(legacyBefore)===JSON.stringify(legacyAfter),'access opt-in returns unchanged legacy snapshot for an unbound account');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids.u]);
    const linked=(await db.query('select public.minha_assinatura() s')).rows[0].s;
    ok(linked.travado===true&&linked.via==='pagarme_saas','existing application RPC enforces finite ledger entitlement for bound account');
    const student={id:'fixture-student',nome:'Fixture',appTokenP:'fixture-app',appPubEm:'2026-10-01',appVer:1};
    const document={alunos:[student],treinosV2:{}};
    await db.query("select set_config('request.jwt.claim.sub','',false)");
    await db.query("insert into dados(academia_id,chave,valor) values($1,'mtapp:ptStudio',$2)",[ids.a,document]);
    await db.query("insert into app_aluno(token,academia_id,dados) values('fixture-app',$1,'{}')",[ids.a]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids.u]);
    await assert.rejects(db.query("update dados set valor=valor||'{\"secretBypass\":true}' where academia_id=$1",[ids.a]),e=>e.code==='PT402');
    ok(true,'expired SaaS cannot bypass UI to write the canonical professional document');
    await assert.rejects(db.query("update app_aluno set dados='{\"newWorkout\":true}' where academia_id=$1",[ids.a]),e=>e.code==='PT402');
    ok(true,'expired SaaS cannot publish a new student app package');
    await assert.rejects(db.query("update dados set valor='[]' where academia_id=$1",[ids.a]),e=>e.code==='PT402');
    ok(true,'changing the document root type cannot bypass the revocation exception');
    await db.query("update app_aluno set revogado_em=now() where academia_id=$1",[ids.a]);
    const revoked={...student,appRevogadoEm:'2026-10-06'};delete revoked.appPubEm;delete revoked.appVer;
    await db.query("update dados set valor=$2 where academia_id=$1",[ids.a,{...document,alunos:[revoked]}]);
    ok(true,'strict access revocation remains available after SaaS expiry');
    await assert.rejects(db.query("update dados set valor=$2 where academia_id=$1",[ids.a,{...document,alunos:[{...revoked,nome:'Injected edit'}]}]),e=>e.code==='PT402');
    ok(true,'revocation cannot conceal an unrelated student edit');
    ok((await db.query('select valor from dados where academia_id=$1',[ids.a])).rowCount===1,'read/export stays available after expiry');
    await db.query("update academias set assinatura_status='vitalicia' where id=$1",[ids.a]);
    ok((await db.query('select public.minha_assinatura() s')).rows[0].s.travado===false,'administrative lifetime benefit takes precedence over expired SaaS');
    await db.query("update dados set valor=valor||'{\"lifetimeEdit\":true}' where academia_id=$1",[ids.a]);
    ok(true,'lifetime access keeps professional writes');
    await db.query("update academias set assinatura_status='trial' where id=$1",[ids.a]);
    await db.query('delete from dados where academia_id=$1',[ids.a]);
    ok(true,'expiry does not prevent deletion of personal data');
    await db.query("select set_config('request.jwt.claim.sub','',false)");
    await db.query("insert into dados(academia_id,chave,valor) values($1,'mtapp:ptStudio','{}')",[ids.b]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids.v]);
    for(const statusName of ['trial','bloqueada','cancelada','cortesia']) {
      await db.query('update academias set assinatura_status=$2,assinatura_vence=null where id=$1',[ids.b,statusName]);
      await assert.rejects(db.query("update dados set valor=valor||'{\"write\":1}' where academia_id=$1",[ids.b]),e=>e.code==='PT402');
    }
    ok(true,'core write guards preserve the existing denied states even without initiating checkout');
    for(const statusName of ['ativa','atrasada','vitalicia']) {
      await db.query('update academias set assinatura_status=$2 where id=$1',[ids.b,statusName]);
      await db.query("update dados set valor=valor||'{\"legacyWrite\":1}' where academia_id=$1",[ids.b]);
      await assert.rejects(rpc('reserve',{academiaId:ids.b,actor:other,attemptId:randomUUID(),leaseId:randomUUID()}),/benefit_or_subscription_exists/);
    }
    ok(true,'legacy active/late/lifetime writes stay unchanged and cannot start a parallel SaaS subscription');
    await db.query("update academias set assinatura_status='trial' where id=$1",[ids.b]);
    await db.query('delete from dados where academia_id=$1',[ids.b]);
    await assert.rejects(db.query("insert into app_aluno(token,academia_id,dados) values('bypass-deleted-document',$1,'{}')",[ids.b]),e=>e.code==='PT402');
    ok(true,'deleting the professional document cannot remove the known product scope and bypass publication guard');
    const deletedAttempt=randomUUID(),deletedLease=randomUUID();
    await rpc('reserve',{academiaId:ids.b,actor:other,attemptId:deletedAttempt,leaseId:deletedLease});
    await rpc('bind_customer',{academiaId:ids.b,actor:other,customerId:'cus_Deleted',leaseId:deletedLease});
    await rpc('mark_submitting',{academiaId:ids.b,actor:other,leaseId:deletedLease});
    // Provider has accepted the in-flight POST, but the live account is deleted
    // before its response can bind. Only its reserved code can recover it.
    sub={id:'sub_Deleted',code:'tp_'+deletedAttempt,status:'active',customer:{id:'cus_Deleted'},
      metadata:{product:'torque_personal_saas',academia_id:ids.b,attempt_id:deletedAttempt}};
    const postCount=postSubscriptions;
    await db.query('delete from academias where id=$1',[ids.b]);
    ok((await db.query('select deleted_at from personal_billing.accounts where academia_id=$1',[ids.b])).rows[0].deleted_at!==null,
      'account deletion succeeds and leaves only a financial cancellation tombstone');
    await assert.rejects(rpc('bind_subscription',{academiaId:ids.b,subscriptionId:sub.id,leaseId:deletedLease}));
    ok(true,'in-flight create response cannot bind an account after deletion');
    const lost=sub;sub=null;await rt.sync(ids.b);
    ok((await db.query('select state from personal_billing.accounts where academia_id=$1',[ids.b])).rows[0].state==='cancel_pending',
      'empty provider scan does not pretend an ambiguous deleted subscription was canceled');
    sub=lost;await rt.sync(ids.b);
    const tombstone=(await db.query('select * from personal_billing.accounts where academia_id=$1',[ids.b])).rows[0];
    ok(tombstone.state==='deleted'&&tombstone.subscription_id==='sub_Deleted'&&sub.status==='canceled',
      'deleted in-flight subscription is recovered by reserved code and cancellation is confirmed');
    const deletes=providerCalls.filter(x=>x.method==='DELETE').length;
    await rt.sync(ids.b);
    ok(providerCalls.filter(x=>x.method==='DELETE').length===deletes&&postSubscriptions===postCount,
      'deleted-account reconciliation never creates a new subscription or repeats a confirmed cancellation');
    await db.query('delete from auth.sessions where id=$1',[ids.s]);
    ok((await call(handler,{action:'status',academiaId:ids.a})).status===401,'revoked session is rejected even when Auth fixture still recognizes JWT');
    console.log(passed+' real PostgreSQL / simulated gateway integration checks passed.');
  } finally {
    if(db)await db.end();if(created)await admin.query('drop database '+dbName);await admin.end();
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
