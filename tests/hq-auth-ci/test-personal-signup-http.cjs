'use strict';
// Canonical typed signup with real Auth/PostgREST in the guarded CI harness.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
module.exports=async function({client,executeScript,check,rpc,good,rejected,waitRPC,createUser,sessionId,revokeSession,anonKey,serviceKey,transport}){
  assert(['http-real-auth','sql-fixture'].includes(transport));
  const run=executeScript||client.query.bind(client),scalar=async(sql,v=[])=>Object.values((await client.query(sql,v)).rows[0])[0];
  const users={a:await createUser('personal-signup-a'),b:await createUser('personal-signup-b'),c:await createUser('personal-signup-c')};
  const input={p_nome_academia:'Synthetic Personal',p_nome_membro:'Synthetic Owner'};
  const signup=u=>rpc(u,'criar_personal',input),scope={environment:'test',merchantId:'acc_Fixture'};
  const service=(action,u,data={})=>rpc(serviceKey,'personal_billing_service',{p_action:action,p_data:{...scope,actor:{userId:u.id,sessionId:sessionId(u)},...data}});
  let a,b;
  await check('Personal signup: additive typed RPC retains all existing account product labels',async()=>{
    const before=(await client.query('select * from public.saas_clientes order by academia_id')).rows;
    await run(`alter table public.academias add column if not exists codigo_equipe text;
      alter table public.academias alter column id set default gen_random_uuid();
      alter table public.academias alter column criada set default now();
      alter table public.academias alter column assinatura_status set default 'trial';
      alter table public.membros add column if not exists email text not null default '';
      alter table public.saas_clientes add column if not exists plano text not null default 'trial';
      alter table public.saas_clientes add column if not exists valor numeric not null default 0;
      alter table public.saas_clientes add column if not exists obs text not null default '';
      alter table public.saas_clientes add column if not exists atualizado timestamptz not null default now();`);
    const setup=fs.readFileSync(path.join(__dirname,'../../supabase-setup.sql'),'utf8');
    const start=setup.indexOf('create or replace function public.criar_academia('),end=setup.indexOf('$$;',setup.indexOf('as $$',start));assert(start>=0&&end>start);
    await run(setup.slice(start,end+3));
    await run(fs.readFileSync(path.join(__dirname,'../../supabase/releases/personal-billing-optional/migrations/20261006163141_personal_signup_product.sql'),'utf8'));
    await waitRPC(serviceKey,'criar_personal',r=>!r.ok&&r.data?.code==='42501',input);
    const projected=(await client.query('select academia_id,tipo,status from public.saas_clientes order by academia_id')).rows;
    assert.deepEqual(projected,before.map(({academia_id,tipo,status})=>({academia_id,tipo,status})));
  });
  await check('Personal signup: anonymous, service role and expired sessions cannot create an account',async()=>{
    const before=await scalar('select count(*)::int from public.academias');
    for(const actor of [undefined,anonKey,serviceKey])rejected(await signup(actor),'42501');
    await client.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[sessionId(users.a)]);
    try{rejected(await signup(users.a),'42501');}finally{await client.query('update auth.sessions set not_after=null where id=$1',[sessionId(users.a)]);}
    assert.equal(await scalar('select count(*)::int from public.academias'),before);
  });
  await check('Personal signup: two actors each create one owned trial and correct product metadata',async()=>{
    const ledgers=await scalar('select count(*)::int from personal_billing.accounts');
    a=good(await signup(users.a));b=good(await signup(users.b));assert.notEqual(a.academia_id,b.academia_id);
    for(const [u,account] of [[users.a,a],[users.b,b]]){
      const row=(await client.query('select * from public.saas_clientes where academia_id=$1',[account.academia_id])).rows[0];
      assert.equal(row.tipo,'personal');assert.equal(row.plano,'trial');assert.equal(row.status,'trial');assert.equal(Number(row.valor),0);
      assert.equal(await scalar('select papel from public.membros where academia_id=$1 and user_id=$2',[account.academia_id,u.id]),'dono');
      assert.deepEqual(good(await service('accounts',u)).accounts.map(x=>x.id),[account.academia_id]);
      assert.equal(good(await rpc(u,'minha_assinatura')).travado,false);
    }
    assert.equal(await scalar('select count(*)::int from personal_billing.accounts'),ledgers);
    rejected(await service('reserve',users.a,{academiaId:b.academia_id,attemptId:crypto.randomUUID(),leaseId:crypto.randomUUID()}),'42501');
  });
  await check('Personal signup: repeated and concurrent requests never create a second academy',async()=>{
    rejected(await signup(users.a));
    const results=transport==='http-real-auth'?await Promise.all([signup(users.c),signup(users.c)]):[await signup(users.c),await signup(users.c)];
    assert.equal(results.filter(x=>x.ok).length,1);
    assert.equal(await scalar('select count(*)::int from public.membros where user_id=$1',[users.c.id]),1);
  });
  await check('Personal signup: existing non-Personal owner cannot reclassify their account',async()=>{
    await client.query("update public.saas_clientes set tipo='academia' where academia_id=$1",[b.academia_id]);
    rejected(await signup(users.b));
    assert.equal(await scalar('select tipo from public.saas_clientes where academia_id=$1',[b.academia_id]),'academia');
    assert.deepEqual(good(await service('accounts',users.b)).accounts,[]);
  });
  await check('Personal signup: revoked session cannot create after existing membership is removed',async()=>{
    await client.query('delete from public.membros where user_id=$1',[users.b.id]);
    await revokeSession(users.b);rejected(await signup(users.b),'42501');
    assert.equal(await scalar('select count(*)::int from public.membros where user_id=$1',[users.b.id]),0);
  });
};
