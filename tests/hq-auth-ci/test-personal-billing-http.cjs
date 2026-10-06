'use strict';
// Independent SQL/RPC acceptance. Real Auth proof exists only when called by
// the guarded hq-auth-ci harness; the local runner explicitly uses SQL fixtures.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
module.exports=async function({client,executeScript,check,rpc,good,rejected,waitRPC,createUser,sessionId,
  revokeSession,anonKey,serviceKey,transport}){
  assert(['http-real-auth','sql-fixture'].includes(transport));
  const scalar=async(sql,values=[])=>Object.values((await client.query(sql,values)).rows[0])[0];
  const ids={a:crypto.randomUUID(),b:crypto.randomUUID(),legacy:crypto.randomUUID()};
  const users={a:await createUser('billing-a'),b:await createUser('billing-b'),staff:await createUser('billing-staff')};
  const actor=u=>({userId:u.id,sessionId:sessionId(u)});
  const common={environment:'test',merchantId:'acc_Fixture'};
  const call=(action,data={},token=serviceKey)=>rpc(token,'personal_billing_service',{p_action:action,p_data:{...common,...data}});
  const own=(which='a')=>({academiaId:ids[which],actor:actor(users[which==='legacy'?'a':which])});
  const status=async(which='a')=>good(await call('status',own(which))).status;
  const original=await client.query('select * from public.academias order by id');
  const priorFunction=await scalar("select pg_get_functiondef('public.minha_assinatura()'::regprocedure)");
  const lease=async(which='a')=>{const leaseId=crypto.randomUUID();const r=good(await call('lease',{...own(which),leaseId}));assert.equal(r.busy,false);return leaseId;};
  const commit=(leaseId,invoices,extra={})=>call('commit',{...own(),leaseId,subscriptionId:'sub_FixtureA',subscriptionStatus:'active',invoices,...extra});
  let lid,invoice;
  await check('billing: optional installation leaves legacy function and existing accounts unchanged',async()=>{
    if(transport==='http-real-auth'){
      assert.equal(await scalar('select current_database()'),'hq_auth_ci');
      assert.equal(await scalar("select to_regclass('auth.schema_migrations') is not null"),true);
    }
    await client.query('alter table public.membros add column if not exists papel text not null default \'funcionario\'');
    await (executeScript||client.query.bind(client))(fs.readFileSync(path.join(__dirname,'../../supabase/releases/personal-billing-optional/migrations/20261006161032_personal_billing_saas_optin.sql'),'utf8'));
    await waitRPC(serviceKey,'personal_billing_service',r=>r.ok,{p_action:'due',p_data:common});
    assert.deepEqual((await client.query('select * from public.academias order by id')).rows,original.rows);
    assert.equal(await scalar("select pg_get_functiondef('public.minha_assinatura()'::regprocedure)"),priorFunction);
    for(const key of ['a','b','legacy'])await client.query("insert into public.academias(id,nome,criada,assinatura_status) values($1,$2,now()-interval '40 days','trial')",[ids[key],'Synthetic billing '+key]);
    for(const id of Object.values(ids))await client.query("insert into public.saas_clientes(academia_id,tipo,status) values($1,'personal','trial')",[id]);
    await client.query("insert into public.membros(academia_id,user_id,papel) values($1,$2,'dono'),($3,$4,'dono'),($5,$2,'dono'),($1,$6,'funcionario')",[ids.a,users.a.id,ids.b,users.b.id,ids.legacy,users.staff.id]);
  });
  await check('billing: direct anonymous/authenticated API roles cannot forge service actor or touch ledger',async()=>{
    for(const user of [null,anonKey,users.a,users.b,users.staff])rejected(await call('status',own(),user),'42501');
    for(const role of ['anon','authenticated','service_role']){
      assert.equal(await scalar("select has_table_privilege($1,'personal_billing.accounts','SELECT')",[role]),false);
      assert.equal(await scalar("select has_table_privilege($1,'personal_billing.invoices','INSERT')",[role]),false);
    }
  });
  await check('billing: canonical memberships isolate two owners and exclude staff',async()=>{
    assert.deepEqual(new Set(good(await call('accounts',{actor:actor(users.a)})).accounts.map(x=>x.id)),new Set([ids.a,ids.legacy]));
    assert.deepEqual(good(await call('accounts',{actor:actor(users.b)})).accounts.map(x=>x.id),[ids.b]);
    assert.deepEqual(good(await call('accounts',{actor:actor(users.staff)})).accounts,[]);
    for(const other of [users.b,users.staff])for(const action of ['authorize','status','reserve','cancel_request'])
      rejected(await call(action,{...own(),actor:actor(other),attemptId:crypto.randomUUID(),leaseId:crypto.randomUUID()}),'42501');
    assert.equal(await scalar('select count(*)::int from personal_billing.accounts'),0);
  });
  await check('billing: session identity cannot be paired with another user or omitted',async()=>{
    for(const forged of [null,{}, {userId:users.a.id,sessionId:sessionId(users.b)}, {userId:users.a.id,sessionId:crypto.randomUUID()}])
      rejected(await call('status',{...own(),actor:forged}),'42501');
  });
  await check('billing: other products and missing product metadata cannot start a Personal checkout',async()=>{
    for(const kind of ['academia','studio','box','outro','nutri']){
      await client.query('update public.saas_clientes set tipo=$1 where academia_id=$2',[kind,ids.b]);
      assert.deepEqual(good(await call('accounts',{actor:actor(users.b)})).accounts,[]);
      rejected(await call('reserve',{...own('b'),attemptId:crypto.randomUUID(),leaseId:crypto.randomUUID()}),'42501');
    }
    await client.query('delete from public.saas_clientes where academia_id=$1',[ids.b]);
    rejected(await call('reserve',{...own('b'),attemptId:crypto.randomUUID(),leaseId:crypto.randomUUID()}),'42501');
    await client.query("insert into public.saas_clientes(academia_id,tipo,status) values($1,'personal','trial')",[ids.b]);
    assert.equal(await scalar('select count(*)::int from personal_billing.accounts'),0);
  });
  await check('billing: legacy lifetime, courtesy and blocked accounts preserve effective access',async()=>{
    for(const [state,end,expected,young] of [
      ['vitalicia',null,true,false],['ativa',"now()-interval '1 day'",true,false],['atrasada',null,true,false],
      ['cortesia',"now()+interval '1 day'",true,false],['cortesia',"now()-interval '1 second'",false,false],
      ['cortesia',null,false,false],['cortesia',"'infinity'::timestamptz",false,false],
      ['bloqueada',null,false,true],['cancelada',null,false,true],['vencida',null,false,true]]){
      await client.query('update public.academias set assinatura_status=$1,assinatura_vence='+(end||'null')+',criada=now()-interval \''+(young?'1':'40')+' days\' where id=$2',[state,ids.legacy]);
      const s=await status('legacy');assert.equal(s.managed,false);assert.equal(s.accessActive,expected,state);
      if(state==='vitalicia'){assert.equal(s.accessKind,'lifetime');assert.equal(s.accessUntil,null);}
      rejected(await call('reserve',{...own('legacy'),attemptId:crypto.randomUUID(),leaseId:crypto.randomUUID()}));
    }
  });
  await check('billing: 14-day trial and separate 3-day grace derive only from account creation',async()=>{
    for(const [age,expected] of [["14 days -1 second",true],["14 days",true],["17 days -1 second",true],["17 days",false]]){
      await client.query("update public.academias set criada=now()-interval '"+age+"',assinatura_status='trial',assinatura_vence=null where id=$1",[ids.legacy]);
      const s=await status('legacy');assert.equal(s.accessActive,expected,age);
      assert.equal(Date.parse(s.graceEndsAt)-Date.parse(s.trialEndsAt),3*86400000);
    }
  });
  await check('billing: replay and competing attempt IDs reserve exactly one provider dispatch',async()=>{
    const candidates=[0,1].map(()=>({leaseId:crypto.randomUUID(),attemptId:crypto.randomUUID()}));
    // Only the HTTP transport has independent request transactions. The local SQL
    // adapter deliberately uses one connection and must not claim concurrency.
    const results=transport==='http-real-auth'
      ?await Promise.all(candidates.map(c=>call('reserve',{...own(),...c})))
      :[await call('reserve',{...own(),...candidates[0]}),await call('reserve',{...own(),...candidates[1]})];
    const reserved=results.map(good);assert.equal(reserved.filter(r=>r.dispatch).length,1);
    const winner=candidates[reserved.findIndex(r=>r.dispatch)],attemptId=winner.attemptId;lid=winner.leaseId;
    assert.equal(good(await call('reserve',{...own(),leaseId:crypto.randomUUID(),attemptId})).dispatch,false);
    assert.equal(good(await call('reserve',{...own(),leaseId:crypto.randomUUID(),attemptId:crypto.randomUUID()})).dispatch,false);
    rejected(await call('reserve',{...own('b'),leaseId:crypto.randomUUID(),attemptId}));
    assert.equal(await scalar('select count(*)::int from personal_billing.attempts'),1);
    assert.equal(await scalar('select count(*)::int from personal_billing.accounts'),1);
  });
  await check('billing: customer binding and subscription dispatch require current owner and matching lease',async()=>{
    rejected(await call('bind_customer',{...own(),leaseId:crypto.randomUUID(),customerId:'cus_Intruso'}));
    good(await call('bind_customer',{...own(),leaseId:lid,customerId:'cus_FixtureA'}));
    rejected(await call('bind_customer',{...own(),leaseId:lid,customerId:'cus_Other'}));
    await client.query('delete from public.membros where academia_id=$1 and user_id=$2',[ids.a,users.a.id]);
    rejected(await call('mark_submitting',{...own(),leaseId:lid}),'42501');
    await client.query("insert into public.membros(academia_id,user_id,papel) values($1,$2,'dono')",[ids.a,users.a.id]);
    good(await call('mark_submitting',{...own(),leaseId:lid}));
  });
  await check('billing: uncertain timeout retains attempt and forbids an automatic new charge',async()=>{
    good(await call('attempt_failed',{...own(),leaseId:lid,definitive:false,reason:'synthetic_timeout'}));
    const before=await status();assert.equal(before.state,'pending');assert.equal(before.retryAllowed,false);assert.equal(before.accessActive,false);
    const replay=good(await call('reserve',{...own(),leaseId:crypto.randomUUID(),attemptId:crypto.randomUUID()}));
    assert.equal(replay.dispatch,false);assert.equal(replay.status.attemptId,before.attemptId);
    lid=await lease();good(await call('bind_subscription',{...own(),leaseId:lid,subscriptionId:'sub_FixtureA'}));
    rejected(await call('bind_subscription',{...own(),leaseId:lid,subscriptionId:'sub_Other'}));
  });
  await check('billing: malformed, premature or wrong-value paid records cannot grant access',async()=>{
    invoice=await scalar("select jsonb_build_object('id','in_FixtureA','chargeId','ch_FixtureA','status','paid','amount',4990,'periodStart',now()-interval '1 day','periodEnd',now()+interval '29 days','paidAt',now()-interval '1 hour')");
    for(const key of ['periodStart','periodEnd','paidAt','chargeId']){const bad={...invoice};delete bad[key];rejected(await commit(lid,[bad]));}
    for(const change of [{amount:1},{amount:4991},{paidAt:'infinity'},{periodEnd:'infinity'},{paidAt:'2099-01-01T00:00:00Z'},
      {periodStart:'2000-01-01T00:00:00Z'}, {periodEnd:invoice.periodStart}])rejected(await commit(lid,[{...invoice,...change}]));
    assert.equal(await scalar('select count(*)::int from personal_billing.invoices'),0);
    assert.equal((await status()).accessActive,false);
  });
  await check('billing: confirmed paid period expires on server time without a webhook',async()=>{
    const paid=good(await commit(lid,[invoice]));assert.equal(paid.accessActive,true);assert.equal(paid.state,'paid');
    assert.equal(paid.canCancel,true);
    await client.query("update public.academias set assinatura_status='bloqueada' where id=$1",[ids.a]);
    const blocked=await status();assert.equal(blocked.accessActive,false);assert.equal(blocked.accessKind,'blocked');
    await client.query("update public.academias set assinatura_status='trial' where id=$1",[ids.a]);
    assert.equal((await status()).accessActive,true);
    await client.query("update personal_billing.invoices set period_end=now()-interval '1 second' where academia_id=$1",[ids.a]);
    const expired=await status();assert.equal(expired.accessActive,false);assert.equal(expired.state,'expired');
    await client.query('update personal_billing.invoices set period_end=$1 where academia_id=$2',[invoice.periodEnd,ids.a]);
  });
  await check('billing: cancel pending is honest and canceled renewal keeps only its paid period',async()=>{
    await client.query("update public.saas_clientes set tipo='outro' where academia_id=$1",[ids.a]);
    assert(good(await call('accounts',{actor:actor(users.a)})).accounts.some(x=>x.id===ids.a));
    assert.equal((await status()).canCancel,true);
    lid=crypto.randomUUID();good(await call('cancel_request',{...own(),leaseId:lid}));
    assert.equal((await status()).state,'cancel_pending');assert.equal((await status()).renewalCanceled,false);
    const canceled=good(await commit(lid,[invoice],{subscriptionStatus:'canceled'}));
    assert.equal(canceled.state,'canceled');assert.equal(canceled.renewalCanceled,true);assert.equal(canceled.accessActive,true);
    assert.equal(canceled.canCancel,false);
    lid=await lease();const old=good(await commit(lid,[invoice]));assert.equal(old.renewalCanceled,true);
    assert.equal(Date.parse(old.paidThrough),Date.parse(invoice.periodEnd));
    await client.query("update public.saas_clientes set tipo='personal' where academia_id=$1",[ids.a]);
  });
  await check('billing: event replay is unique and payload reuse cannot replace its meaning',async()=>{
    const e={eventId:'evt_Fixture',fingerprint:'a'.repeat(64),resourceKind:'invoice',resourceId:invoice.id};
    good(await call('event',e));good(await call('event',e));
    rejected(await call('event',{...e,fingerprint:'b'.repeat(64)}));
    assert.equal(await scalar('select count(*)::int from personal_billing.events'),1);
    lid=await lease();good(await commit(lid,[invoice],{eventId:e.eventId}));
    assert.equal(good(await call('event',e)).state,'done');
  });
  await check('billing: refund is terminal and old paid snapshot never restores access',async()=>{
    lid=await lease();const refunded=good(await commit(lid,[{...invoice,status:'revoked',reason:'refund_or_dispute'}]));
    assert.equal(refunded.accessActive,false);assert.equal(refunded.state,'needs_review');
    lid=await lease();const stale=good(await commit(lid,[invoice]));
    assert.equal(stale.accessActive,false);assert.equal(stale.state,'needs_review');
    assert.equal(await scalar('select revoked from personal_billing.invoices where academia_id=$1',[ids.a]),true);
  });
  await check('billing: stale lease and incomplete invoice scan cannot overwrite the ledger',async()=>{
    const old=await lease();await client.query("update personal_billing.accounts set lease_until=now()-interval '1 second' where academia_id=$1",[ids.a]);
    const current=await lease();rejected(await commit(old,[invoice]));rejected(await commit(current,[]));
    assert.equal((await status()).accessActive,false);good(await call('release',{...own(),leaseId:current}));
  });
  await check('billing: logout removes session authorization even while old access token remains',async()=>{
    await revokeSession(users.a);rejected(await call('status',own()),'42501');
    assert.equal(good(await call('status',own('b'))).status.academiaId,ids.b);
  });
  await check('billing: expired server session rejects a still-signed user identity',async()=>{
    await client.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[sessionId(users.b)]);
    try{rejected(await call('status',own('b')),'42501');}
    finally{await client.query('update auth.sessions set not_after=null where id=$1',[sessionId(users.b)]);}
    assert.equal(good(await call('status',own('b'))).status.academiaId,ids.b);
  });
  await check('billing: existing legacy customers and access function remain unchanged',async()=>{
    assert.equal(await scalar("select pg_get_functiondef('public.minha_assinatura()'::regprocedure)"),priorFunction);
    const nowRows=(await client.query('select * from public.academias where id<>all($1::uuid[]) order by id',[Object.values(ids)])).rows;
    assert.deepEqual(nowRows,original.rows);
  });
};
