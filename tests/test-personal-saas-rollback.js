'use strict';
// A rollback must restore the original contract and refuse financial history.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require(process.env.TORQUE_PGLITE||'./runtime/node_modules/@electric-sql/pglite');
const root=path.join(__dirname,'../supabase/releases/personal-billing-optional');
const sql=name=>fs.readFileSync(path.join(root,name),'utf8');
async function fixture(){
  const db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role;
    create schema auth;create schema torque_private;
    create function auth.uid() returns uuid language sql as $$select null::uuid$$;
    create table auth.sessions(id uuid,user_id uuid,not_after timestamptz);
    create table academias(id uuid primary key,nome text,criada timestamptz,assinatura_status text,assinatura_via text,assinatura_vence timestamptz);
    create table membros(academia_id uuid,user_id uuid,papel text);
    create table saas_clientes(academia_id uuid,tipo text);
    create table dados(academia_id uuid,chave text,valor jsonb);
    create table app_aluno(token text,academia_id uuid,dados jsonb,revogado_em timestamptz,atualizado timestamptz,login text,senha text);
    create table assinatura_regras(id integer,dias_teste integer,dias_carencia integer);
    insert into assinatura_regras values(1,14,3);
    create function torque_private.studio_diff(jsonb,jsonb,text[] default '{}'::text[]) returns setof jsonb language sql as $$select '{}'::jsonb where false$$;
    create function public.minha_assinatura() returns jsonb language sql stable security definer set search_path='' as $$select '{"original":true}'::jsonb$$;
    revoke all on function public.minha_assinatura() from public,anon;
    grant execute on function public.minha_assinatura() to authenticated,service_role;
    create function public.criar_personal(text,text) returns jsonb language sql as $$select '{"independent":true}'::jsonb$$;`);
  const original=(await db.query("select pg_get_functiondef('public.minha_assinatura()'::regprocedure) as body")).rows[0].body;
  await db.exec(sql('migrations/20261006161032_personal_billing_saas_optin.sql'));
  await db.exec(sql('migrations/20261006162018_personal_billing_access_optin.sql'));
  return{db,original};
}
(async()=>{
  let f=await fixture();
  try{
    await f.db.exec(sql('rollback-before-activation.sql'));
    assert.equal((await f.db.query("select pg_get_functiondef('public.minha_assinatura()'::regprocedure) as body")).rows[0].body,f.original);
    const row=(await f.db.query(`select to_regnamespace('personal_billing') is null as removed,
      has_function_privilege('authenticated','public.minha_assinatura()','EXECUTE') as member,
      has_function_privilege('service_role','public.minha_assinatura()','EXECUTE') as service,
      has_function_privilege('anon','public.minha_assinatura()','EXECUTE') as anonymous,
      to_regprocedure('public.criar_personal(text,text)') is not null as signup`)).rows[0];
    assert.deepEqual(row,{removed:true,member:true,service:true,anonymous:false,signup:true});
    console.log('PASS empty rollback restores exact original function, grants and independent signup');
  }finally{await f.db.close();}
  for(const record of ['account','event']){
    f=await fixture();
    try{
      if(record==='account')await f.db.exec("insert into personal_billing.accounts(academia_id,environment,merchant_id) values('00000000-0000-4000-8000-000000000001','test','acc_Fixture')");
      else await f.db.exec("insert into personal_billing.events(environment,merchant_id,id,fingerprint,resource_kind,resource_id) values('test','acc_Fixture','hook_Fixture',repeat('a',64),'subscription','sub_Fixture')");
      await assert.rejects(()=>f.db.exec(sql('rollback-before-activation.sql')),/billing_rollback_requires_empty_financial_ledger/);
      await f.db.exec('rollback');
      assert.equal((await f.db.query("select to_regprocedure('public.personal_billing_service(text,jsonb)') is not null as intact")).rows[0].intact,true);
      assert.equal((await f.db.query("select count(*)::int as count from pg_trigger where tgname in ('personal_billing_account_deleted','personal_billing_dados_guard','personal_billing_publicacao_guard')")).rows[0].count,3);
      console.log('PASS rollback refuses '+record+' and preserves billing functions/guards');
    }finally{await f.db.close();}
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
