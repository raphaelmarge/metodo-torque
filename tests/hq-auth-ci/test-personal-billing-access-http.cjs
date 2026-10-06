'use strict';
// Real Auth/PostgREST in CI; the local runner labels its synthetic SQL adapter.
// Application table fixtures are minimal; revocation/patch/return functions below
// are loaded unchanged from canonical product sources, never replaced by stubs.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const waitSchemaTable=require('./wait-schema-table.cjs');
module.exports=async function({client,executeScript,check,rpc,rest,good,rejected,waitRPC,createUser,sessionId,revokeSession,anonKey,serviceKey,transport}){
  assert(['http-real-auth','sql-fixture'].includes(transport));
  const run=executeScript||client.query.bind(client),read=p=>fs.readFileSync(path.join(__dirname,'../..',p),'utf8');
  const scalar=async(sql,v=[])=>Object.values((await client.query(sql,v)).rows[0])[0];
  const users={a:await createUser('billing-access-a'),b:await createUser('billing-access-b')};
  const ids={a:crypto.randomUUID(),b:crypto.randomUUID()},tokens={a:'synthetic-access-'+crypto.randomUUID(),b:'synthetic-access-'+crypto.randomUUID()};
  const docs=k=>({alunos:[{id:'student',nome:'Synthetic student',appTokenP:tokens[k],appPubEm:'2026-01-01',appVer:1}],treinosV2:{student:{fichas:[{id:'f1',nome:'Synthetic workout'}]}}});
  const scope={environment:'test',merchantId:'acc_Fixture'};
  const own=k=>({...scope,academiaId:ids[k],actor:{userId:users[k].id,sessionId:sessionId(users[k])}});
  const service=(action,data)=>rpc(serviceKey,'personal_billing_service',{p_action:action,p_data:data});
  const route=(table,k)=>'/'+table+'?academia_id=eq.'+ids[k]+(table==='dados'?'&chave=eq.mtapp%3AptStudio':'');
  const req=(user,table,k,method='GET',body)=>rest(route(table,k),{token:typeof user==='string'?user:user?.token||user,method,body,headers:{Prefer:'return=representation'}});
  const patch=(user,k,name)=>rpc(user,'dados_personal_patch',{p_academia:ids[k],p_operacoes:[{caminho:['treinosV2','student','fichas','f1'],antes:{existe:true,valor:{id:'f1',nome:'Synthetic workout'}},depois:{existe:true,valor:{id:'f1',nome:name}}}]});
  const extract=(sql,name)=>{const start=sql.indexOf('create or replace function public.'+name+'(');assert(start>=0,name);const end=sql.indexOf('$$;',sql.indexOf('as $$',start));assert(end>start,name);return sql.slice(start,end+3);};
  let legacyBefore;
  await check('billing access: canonical application functions install on disposable table fixtures',async()=>{
    assert.equal(await scalar("select to_regclass('public.dados') is null and to_regclass('public.app_aluno') is null"),true);
    await run(`alter table public.membros add column if not exists nome text not null default '';
      alter table public.membros drop constraint if exists membros_academia_id_fkey;
      alter table public.membros add constraint membros_academia_id_fkey foreign key(academia_id) references public.academias(id) on delete cascade;
      alter table public.saas_clientes drop constraint if exists saas_clientes_academia_id_fkey;
      alter table public.saas_clientes add constraint saas_clientes_academia_id_fkey foreign key(academia_id) references public.academias(id) on delete cascade;
      create table public.dados(academia_id uuid references public.academias(id) on delete cascade,chave text,valor jsonb,atualizado timestamptz default clock_timestamp(),primary key(academia_id,chave));
      create table public.app_aluno(token text primary key,academia_id uuid references public.academias(id) on delete cascade,dados jsonb,retorno jsonb,login text,senha text,atualizado timestamptz default now(),revogado_em timestamptz);
      create table public.dados_hist(academia_id uuid,valor jsonb);create table public.app_aluno_hist(academia_id uuid,dados jsonb);
      create table public.push_subs(token text);
      alter table public.dados enable row level security;alter table public.app_aluno enable row level security;
      create policy dados_membros on public.dados for all to authenticated using(academia_id in(select public.minhas_academias())) with check(academia_id in(select public.minhas_academias()));
      create policy app_aluno_membros on public.app_aluno for all to authenticated using(academia_id in(select public.minhas_academias())) with check(academia_id in(select public.minhas_academias()));
      grant select,insert,update,delete on public.dados,public.app_aluno to authenticated;`);
    const setup=read('supabase-setup.sql');
    for(const name of ['aluno_revoga_acesso','app_aluno_busca','app_retorno_mescla','app_hist_apaga_academia','excluir_minha_conta'])await run(extract(setup,name));
    await run(extract(read('supabase/migrations/20260909190000_onboarding_integridade_e_retorno_reservado.sql'),'app_aluno_devolve'));
    await run(`revoke all on function public.aluno_revoga_acesso(text,boolean) from public,anon;
      grant execute on function public.aluno_revoga_acesso(text,boolean) to authenticated;
      revoke all on function public.excluir_minha_conta(),public.app_hist_apaga_academia(uuid) from public,anon;
      grant execute on function public.excluir_minha_conta() to authenticated;
      revoke all on function public.app_aluno_busca(text),public.app_aluno_devolve(text,jsonb) from public;
      grant execute on function public.app_aluno_busca(text),public.app_aluno_devolve(text,jsonb) to anon,authenticated;`);
    await run(read('supabase/migrations/20260926232430_confiabilidade_interna.sql'));
    for(const k of ['a','b']){
      await client.query("insert into public.academias(id,nome,criada,assinatura_status) values($1,$2,now()-interval '40 days',$3)",[ids[k],'Synthetic access '+k,k==='b'?'ativa':'trial']);
      await client.query("insert into public.saas_clientes(academia_id,tipo,status) values($1,'personal','trial')",[ids[k]]);
      await client.query("insert into public.membros(academia_id,user_id,papel,nome) values($1,$2,'dono','Synthetic owner')",[ids[k],users[k].id]);
      await client.query("insert into public.app_aluno(token,academia_id,dados,retorno,login,senha) values($1,$2,'{\"workout\":true}','{\"sessions\":3}','synthetic-login','synthetic-hash')",[tokens[k],ids[k]]);
      await client.query("insert into public.dados(academia_id,chave,valor) values($1,'mtapp:ptStudio',$2)",[ids[k],docs(k)]);
    }
    await waitRPC(users.a,'minha_assinatura',r=>r.ok);
    legacyBefore=good(await rpc(users.b,'minha_assinatura'));
    good(await service('reserve',{...own('a'),attemptId:crypto.randomUUID(),leaseId:crypto.randomUUID()}));
    await run(read('supabase/releases/personal-billing-optional/migrations/20261006162018_personal_billing_access_optin.sql'));
    await waitRPC(users.a,'minha_assinatura',r=>r.ok&&r.data?.via==='pagarme_saas');
    for(const table of ['dados','app_aluno'])await waitSchemaTable({
      probe:()=>req(users.a,table,'a'),assertReady:rows=>{
        assert.equal(rows.length,1);assert.equal(rows[0].academia_id,ids.a);
        if(table==='dados')assert.deepEqual(rows[0].valor,docs('a'));
        else{assert.equal(rows[0].token,tokens.a);assert.deepEqual(rows[0].dados,{workout:true});}
      }
    });
  });
  await check('billing access: unbound legacy response is identical and only bound expired account locks',async()=>{
    assert.deepEqual(good(await rpc(users.b,'minha_assinatura')),legacyBefore);
    const bound=good(await rpc(users.a,'minha_assinatura'));assert.equal(bound.academia_id,ids.a);assert.equal(bound.travado,true);
    for(const user of [undefined,anonKey])rejected(await rpc(user,'minha_assinatura'),'42501');
    assert.equal(good(await rpc(serviceKey,'minha_assinatura')),null);
  });
  await check('billing access: expired owner reads own data but cannot alter workout or publish',async()=>{
    assert.deepEqual(good(await req(users.a,'dados','a'))[0].valor,docs('a'));
    assert.deepEqual(good(await req(users.a,'dados','b')),[]);
    rejected(await patch(users.a,'a','Must not persist'),'PT402');
    rejected(await req(users.a,'app_aluno','a','PATCH',{dados:{workout:'Must not publish'}}),'PT402');
    rejected(await req(users.a,'dados','a','PATCH',{valor:[] }),'PT402');
    assert.deepEqual(good(await req(users.a,'dados','a'))[0].valor,docs('a'));
    good(await patch(users.b,'b','Legacy remains editable'));
  });
  await check('billing access: student token can read and return records despite professional expiry',async()=>{
    assert.deepEqual(good(await rpc(anonKey,'app_aluno_busca',{t:tokens.a})),{workout:true});
    assert.equal(good(await rpc(anonKey,'app_aluno_devolve',{t:tokens.a,p_dados:{sessions:4}})).ok,true);
    assert.equal(await scalar('select retorno->>\'sessions\' from public.app_aluno where token=$1',[tokens.a]),'4');
  });
  await check('billing access: existing Personal trial cannot bypass its expired deadline by avoiding checkout',async()=>{
    await client.query("update public.academias set assinatura_status='trial' where id=$1",[ids.b]);
    try{
      assert.equal(good(await rpc(users.b,'minha_assinatura')).travado,true);
      rejected(await req(users.b,'dados','b','PATCH',{valor:docs('b')}),'PT402');
      rejected(await req(users.b,'app_aluno','b','PATCH',{dados:{workout:'Must not publish'}}),'PT402');
      assert.equal(good(await service('status',own('b'))).status.managed,false);
    }finally{await client.query("update public.academias set assinatura_status='ativa' where id=$1",[ids.b]);}
  });
  await check('billing access: real revocation RPC works after expiry and preserves student history',async()=>{
    const before=good(await req(users.a,'dados','a'))[0];
    rejected(await rpc(users.b,'personal_acesso_revoga',{p_academia:ids.a,p_aluno:'student',p_revisao:before.atualizado}),'PT409');
    const result=good(await rpc(users.a,'personal_acesso_revoga',{p_academia:ids.a,p_aluno:'student',p_revisao:before.atualizado}));
    const student=result[0].valor.alunos[0];assert(student.appRevogadoEm);assert(!('appVer' in student));assert(!('appPubEm' in student));
    const access=(await client.query('select * from public.app_aluno where token=$1',[tokens.a])).rows[0];
    assert(access.revogado_em);assert.equal(access.dados,null);assert.equal(access.login,'');assert.equal(access.senha,'');assert.equal(access.retorno.sessions,4);
    assert.equal(good(await rpc(anonKey,'app_aluno_busca',{t:tokens.a})),null);
    assert.equal(good(await rpc(anonKey,'app_aluno_devolve',{t:tokens.a,p_dados:{sessions:999}})).erro,'sem_acesso');
    const forged=structuredClone(result[0].valor);forged.alunos[0].nome='Forbidden extra edit';
    rejected(await req(users.a,'dados','a','PATCH',{valor:forged}),'PT402');
    rejected(await req(users.a,'app_aluno','a','PATCH',{retorno:{sessions:999},revogado_em:new Date().toISOString()}),'PT402');
  });
  await check('billing access: explicit lifetime and finite courtesy preserve access despite ledger',async()=>{
    for(const status of ['vitalicia','cortesia']){
      await client.query("update public.academias set assinatura_status=$1,assinatura_vence=now()+interval '1 day' where id=$2",[status,ids.a]);
      const s=good(await rpc(users.a,'minha_assinatura'));assert.equal(s.status,status);assert.equal(s.travado,false);assert.notEqual(s.via,'pagarme_saas');
      good(await req(users.a,'dados','a','PATCH',{valor:docs('a')}));
    }
    await client.query("update public.academias set assinatura_vence=now()-interval '1 second' where id=$1",[ids.a]);
    assert.equal(good(await rpc(users.a,'minha_assinatura')).travado,true);
    rejected(await patch(users.a,'a','Expired courtesy cannot write'),'PT402');
  });
  await check('billing access: administrative denial overrides a paid period in the public subscription view',async()=>{
    await client.query("insert into personal_billing.invoices(academia_id,id,charge_id,status,amount,period_start,period_end,paid_at) values($1,'in_Access','ch_Access','paid',4990,now()-interval '1 day',now()+interval '29 days',now()-interval '1 hour')",[ids.a]);
    await client.query("update public.academias set assinatura_status='bloqueada' where id=$1",[ids.a]);
    const blocked=good(await rpc(users.a,'minha_assinatura'));
    assert.equal(blocked.travado,true);assert.equal(blocked.status,'bloqueada');
    rejected(await patch(users.a,'a','Paid cannot override administrator block'),'PT402');
  });
  await check('billing access: unbound blocked states and expired courtesy retain their server restriction',async()=>{
    for(const state of ['cortesia','bloqueada','cancelada','vencida']){
      await client.query("update public.academias set assinatura_status=$1,assinatura_vence=now()-interval '1 second' where id=$2",[state,ids.b]);
      assert.equal(good(await rpc(users.b,'minha_assinatura')).travado,true);
      rejected(await req(users.b,'dados','b','PATCH',{valor:docs('b')}),'PT402');
      rejected(await req(users.b,'app_aluno','b','PATCH',{dados:{workout:'Must not publish'}}),'PT402');
    }
    await client.query("update public.academias set assinatura_status='atrasada' where id=$1",[ids.b]);
    assert.equal(good(await rpc(users.b,'minha_assinatura')).travado,false);
    good(await req(users.b,'dados','b','PATCH',{valor:docs('b')}));
  });
  await check('billing access: deleting the local studio cannot erase the expired Personal product scope',async()=>{
    await client.query("update public.academias set assinatura_status='trial' where id=$1",[ids.b]);
    good(await req(users.b,'dados','b','DELETE'));
    rejected(await req(users.b,'app_aluno','b','PATCH',{dados:{workout:'Must not publish'}}),'PT402');
    assert.equal(good(await service('status',own('b'))).status.managed,false);
    // Restore only the disposable fixture for the subsequent revoked-session test.
    await client.query("update public.academias set assinatura_status='ativa' where id=$1",[ids.b]);
    await client.query("insert into public.dados(academia_id,chave,valor) values($1,'mtapp:ptStudio',$2)",[ids.b,docs('b')]);
  });
  await check('billing access: account cleanup remains allowed and revoked session cannot mutate data',async()=>{
    good(await req(users.a,'app_aluno','a','DELETE'));good(await req(users.a,'dados','a','DELETE'));
    assert.equal(await scalar('select count(*)::int from public.dados where academia_id=$1',[ids.a]),0);
    await revokeSession(users.b);
    assert.deepEqual(good(await req(users.b,'dados','b')),[]);
    rejected(await rpc(users.b,'dados_personal_patch',{p_academia:ids.b,p_operacoes:[]}),'PT409');
  });
  await check('billing access: canonical account deletion removes Auth and product data while retaining cancellation queue',async()=>{
    await client.query("insert into public.dados_hist values($1,'{\"private\":true}');",[ids.a]);
    await client.query("insert into public.app_aluno_hist values($1,'{\"private\":true}');",[ids.a]);
    rejected(await rpc(anonKey,'excluir_minha_conta'),'42501');
    const result=good(await rpc(users.a,'excluir_minha_conta'));assert.equal(result.ok,true);assert.equal(result.ilhas_apagadas,1);
    assert.equal(await scalar('select count(*)::int from public.academias where id=$1',[ids.a]),0);
    assert.equal(await scalar('select count(*)::int from auth.users where id=$1',[users.a.id]),0);
    for(const table of ['membros','dados','app_aluno','dados_hist','app_aluno_hist'])assert.equal(await scalar('select count(*)::int from public.'+table+' where academia_id=$1',[ids.a]),0);
    const row=(await client.query('select * from personal_billing.accounts where academia_id=$1',[ids.a])).rows[0];
    assert(row.deleted_at);assert.equal(row.state,'cancel_pending');assert.equal(row.lease_id,null);
    const due=good(await service('due',scope));assert(due.accounts.some(x=>x.academiaId===ids.a));
    rejected(await service('status',own('a')),'42501');
  });
};
