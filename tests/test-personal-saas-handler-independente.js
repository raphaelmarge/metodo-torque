'use strict';
// Handler + canonical SQL, with synthetic Auth/provider transport. No remote
// fetch, card or payment; this does not claim an actual GoTrue login.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {PGlite}=require(process.env.TORQUE_PGLITE||'./runtime/node_modules/@electric-sql/pglite');
let makeHandler,checks=0;
async function fixture(options={}){
  const db=new PGlite(),a=crypto.randomUUID(),b=crypto.randomUUID(),u=crypto.randomUUID(),s=crypto.randomUUID();
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
    create table auth.sessions(id uuid,user_id uuid,not_after timestamptz);
    create table academias(id uuid primary key,nome text,criada timestamptz,assinatura_status text,assinatura_via text,assinatura_vence timestamptz);
    create table membros(academia_id uuid,user_id uuid,papel text);`);
  await db.query("insert into academias values($1,'Synthetic A',now()-interval '40 days','trial',null,null),($2,'Synthetic B',now()-interval '40 days','trial',null,null)",[a,b]);
  await db.query('insert into auth.sessions values($1,$2,null)',[s,u]);
  await db.query('insert into membros values($1,$2,$3)',[a,u,options.staff?'funcionario':'dono']);
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/releases/personal-billing-optional/migrations/20261006161032_personal_billing_saas_optin.sql'),'utf8'));
  const token='fixture.'+Buffer.from(JSON.stringify({sub:u,session_id:s,role:'authenticated',exp:options.expired?1:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture';
  const calls=[],stored={customers:[],subscriptions:[]};
  const env={SUPABASE_URL:'https://billing-db.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service',SUPABASE_ANON_KEY:'synthetic-anon',
    PERSONAL_BILLING_ENVIRONMENT:'test',PERSONAL_BILLING_MERCHANT_ID:'acc_Fixture',PERSONAL_BILLING_PLAN_ID:'plan_Fixture',
    PERSONAL_BILLING_SECRET_KEY:'sk_test_Fixture',PERSONAL_BILLING_PUBLIC_KEY:'pk_test_Fixture',
    PERSONAL_BILLING_NEW_SUBSCRIPTIONS_ENABLED:options.disabled?'false':'true',PERSONAL_BILLING_HOMOLOGATED:'true'};
  const fetch=async(url,init={})=>{
    const loc=new URL(url),method=init.method||'GET',body=init.body?JSON.parse(init.body):null;
    calls.push({origin:loc.origin,path:loc.pathname,method,body});
    if(loc.origin===env.SUPABASE_URL){
      if(loc.pathname==='/auth/v1/user')return Response.json(options.anonymous?{id:u,is_anonymous:true}:{id:u},{status:options.invalid?401:200});
      assert.equal(loc.pathname,'/rest/v1/rpc/personal_billing_service');
      assert.equal(init.headers.Authorization,'Bearer synthetic-service');
      try{return Response.json((await db.query('select public.personal_billing_service($1,$2) as value',[body.p_action,body.p_data])).rows[0].value);}
      catch(e){return Response.json({code:e.code,message:e.message},{status:400});}
    }
    assert.equal(loc.origin,'https://api.pagar.me');
    const route=loc.pathname.replace('/core/v5','');
    if(route==='/plans/plan_Fixture')return Response.json({id:'plan_Fixture',status:'active',currency:'BRL',interval:'month',interval_count:1,billing_type:'prepaid',payment_methods:['credit_card'],
      items:[{status:'active',quantity:1,pricing_scheme:{scheme_type:'unit',price:4990}}]});
    if(route==='/customers'&&method==='POST'){
      const c={...body,id:'cus_Fixture'};stored.customers.push(c);
      if(options.timeoutCustomer)throw Error('Synthetic lost create response');return Response.json(c);
    }
    if(route==='/customers'&&method==='GET')return Response.json({data:stored.customers});
    if(route==='/customers/cus_Fixture/cards'&&method==='POST'){
      if(options.revokeDuringCard)await db.query('delete from membros where user_id=$1',[u]);
      return Response.json({id:'card_Fixture'});
    }
    if(route==='/subscriptions'&&method==='POST'){
      const sub={...body,id:'sub_Fixture',status:'active',customer:{id:body.customer_id}};stored.subscriptions.push(sub);
      if(options.timeoutSubscription)throw Error('Synthetic lost create response');return Response.json(sub);
    }
    if(route==='/subscriptions'&&method==='GET')return Response.json({data:stored.subscriptions});
    if(route==='/subscriptions/sub_Fixture'&&method==='GET')return Response.json(stored.subscriptions[0]);
    if(route==='/invoices')return Response.json({data:[]});
    throw Error('Unexpected synthetic route '+method+' '+route);
  };
  const handler=makeHandler({env,fetch});
  const checkout={action:'checkout',academiaId:a,attemptId:crypto.randomUUID(),cardToken:'token_Fixture',
    customer:{name:'Pessoa fictícia',email:'billing@example.test',address:{line_1:'100, Rua Fictícia, Centro',zip_code:'00000000',city:'Teste',state:'SP',country:'BR'}}};
  return{db,a,b,calls,stored,checkout,async send(body,authorization='Bearer '+token){
    const r=await handler(new Request('https://edge.invalid/',{method:'POST',headers:{authorization,'Content-Type':'application/json'},body:JSON.stringify(body)}));
    return{status:r.status,body:await r.json()};},
    writes(){return calls.filter(c=>c.origin==='https://api.pagar.me'&&c.method!=='GET');},
    async makeReconcileDue(){await db.exec("update personal_billing.accounts set lease_until=now()-interval '1 second',checked_at=null");}};
}
async function test(label,options,run){const x=await fixture(options);try{await run(x);console.log('OK '+(++checks)+' '+label);}finally{await x.db.close();}}
(async()=>{
  ({createPersonalBillingHandler:makeHandler}=await import('../supabase/functions/_shared/personal-billing-handler.mjs'));
  await test('gate OFF never sends customer, card or subscription to provider',{disabled:true},async x=>{
    assert.equal((await x.send(x.checkout)).body.error,'billing_disabled');assert.equal(x.calls.filter(c=>c.origin==='https://api.pagar.me').length,0);
    assert.equal((await x.db.query('select count(*)::int as n from personal_billing.accounts')).rows[0].n,0);
  });
  for(const options of [{invalid:true},{anonymous:true},{expired:true}])await test('invalid/anonymous/expired session cannot reach billing RPC or provider',options,async x=>{
    assert.equal((await x.send(x.checkout)).status,401);assert.equal(x.calls.filter(c=>c.path!=='/auth/v1/user').length,0);
  });
  await test('staff and foreign academia cannot dispatch provider operations',{staff:true},async x=>{
    for(const academiaId of [x.a,x.b])assert.equal((await x.send({...x.checkout,academiaId})).status,403);assert.equal(x.writes().length,0);
  });
  await test('browser cannot choose foreign academia, price, provider bindings or raw card',{},async x=>{
    assert.equal((await x.send({...x.checkout,academiaId:x.b})).status,403);
    for(const extra of [{amount:1},{priceCents:1},{customerId:'cus_Other'},{subscriptionId:'sub_Other'},{planId:'plan_Other'},{card:{number:'not-a-card'}},{actor:{userId:'other'}}])
      assert.equal((await x.send({...x.checkout,...extra})).status,422);
    assert.equal(x.writes().length,0);
  });
  await test('one successful dispatch remains unpaid until a canonical invoice is confirmed',{},async x=>{
    const r=await x.send(x.checkout);assert.equal(r.body.ok,true);assert.equal(r.body.accessActive,false);assert.notEqual(r.body.state,'paid');
    assert.deepEqual(x.writes().map(c=>c.path),['/core/v5/customers','/core/v5/customers/cus_Fixture/cards','/core/v5/subscriptions']);
    const sub=x.stored.subscriptions[0];assert.equal(sub.customer_id,'cus_Fixture');assert.equal(sub.plan_id,'plan_Fixture');assert.equal(sub.metadata.academia_id,x.a);
    assert.equal(sub.card_id,'card_Fixture');assert.equal(sub.card_token,undefined);assert.equal(sub.discounts,undefined);
    await x.send(x.checkout);await x.send({...x.checkout,attemptId:crypto.randomUUID()});assert.equal(x.writes().length,3);
  });
  await test('lost subscription response reconciles same reservation without another POST',{timeoutSubscription:true},async x=>{
    const pending=await x.send(x.checkout);assert.equal(pending.status,202);assert.equal(pending.body.retryAllowed,false);
    await x.send({...x.checkout,attemptId:crypto.randomUUID()});assert.equal(x.stored.subscriptions.length,1);
    await x.makeReconcileDue();const recovered=await x.send({action:'status',academiaId:x.a});
    assert.equal(recovered.body.ok,true);assert.equal(recovered.body.accessActive,false);assert.equal(recovered.body.attemptId,x.checkout.attemptId);
    assert.equal(x.stored.subscriptions.length,1);assert.equal(x.writes().length,3);
  });
  await test('lost customer response is recovered before permitting a new card attempt',{timeoutCustomer:true},async x=>{
    assert.equal((await x.send(x.checkout)).status,202);await x.makeReconcileDue();
    const r=await x.send({action:'status',academiaId:x.a});assert.equal(r.body.state,'payment_failed');assert.equal(r.body.retryAllowed,true);
    assert.equal(x.stored.customers.length,1);assert.equal(x.stored.subscriptions.length,0);assert.equal(x.writes().length,1);
  });
  await test('owner revoked during card attachment cannot create a subscription',{revokeDuringCard:true},async x=>{
    const r=await x.send(x.checkout);assert.equal(r.body.ok,false);assert.equal(x.stored.subscriptions.length,0);
    assert.equal(x.writes().some(c=>c.path==='/core/v5/subscriptions'),false);
  });
  console.log(checks+' grupos handler+SQL aprovados; Auth/gateway fictícios, sem rede externa.');
})().catch(e=>{console.error(e);process.exitCode=1;});
