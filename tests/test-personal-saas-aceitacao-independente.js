'use strict';
// SQL only: synthetic sessions prove database authorization, never real Auth/JWT.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
async function open(){
  if(!process.argv.includes('--postgres')){
    const {PGlite}=require(process.env.TORQUE_PGLITE || './runtime/node_modules/@electric-sql/pglite');return new PGlite();
  }
  const url=new URL(process.env.PGTESTURL||'invalid:');
  assert(['postgres:','postgresql:'].includes(url.protocol));assert(['127.0.0.1','[::1]'].includes(url.hostname));
  assert(['','/','/postgres'].includes(url.pathname)&&!url.search&&!url.hash);
  const {Client,types}=require(process.env.TORQUE_PG || './sql/node_modules/pg');
  // PostgREST returns full timestamp precision; JS Date would truncate the
  // optimistic-lock revision to milliseconds and fabricate a PT409 conflict.
  types.setTypeParser(1184,value=>value);
  const control=new Client({connectionString:url.href,connectionTimeoutMillis:5000});await control.connect();
  const name='torque_billing_independent_'+crypto.randomBytes(10).toString('hex');
  let client;
  try{
    await control.query('create database '+name);url.pathname='/'+name;
    client=new Client({connectionString:url.href,connectionTimeoutMillis:5000,query_timeout:10000});await client.connect();
    return{query:client.query.bind(client),exec:client.query.bind(client),close:async()=>{await client.end();await control.query('drop database '+name);await control.end();}};
  }catch(e){if(client)await client.end();await control.query('drop database if exists '+name);await control.end();throw e;}
}
(async()=>{
  const db=await open();let count=0;
  try{
    await db.exec(`do $$begin
      if not exists(select 1 from pg_roles where rolname='anon') then create role anon;end if;
      if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated;end if;
      if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role;end if;end$$;
      create schema auth;create table auth.users(id uuid primary key,email text default 'synthetic@example.test');create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id) on delete cascade,not_after timestamptz,created_at timestamptz default now(),updated_at timestamptz default now(),user_agent text);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      grant usage on schema auth to anon,authenticated,service_role;
      create table public.academias(id uuid primary key,nome text,criada timestamptz,assinatura_status text,assinatura_via text,assinatura_vence timestamptz);
      create table public.membros(academia_id uuid,user_id uuid,primary key(academia_id,user_id));
      create table public.saas_clientes(academia_id uuid primary key references public.academias(id) on delete cascade,tipo text,status text);
      create function public.minhas_academias() returns setof uuid language sql stable security definer set search_path='' as $$select academia_id from public.membros where user_id=auth.uid()$$;
      create table public.assinatura_regras(id int primary key,dias_teste int,dias_carencia int);insert into public.assinatura_regras values(1,14,3);
      grant usage on schema public to anon,authenticated,service_role;`);
    await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261005150924_personal_cortesia_temporaria.sql'),'utf8'));
    const asUser=async(user,fn)=>{
      const role=user==='fixture-service'?'service_role':user&&user!=='fixture-anon'?'authenticated':'anon';
      await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[user?.id||'',JSON.stringify(user?.sid?{session_id:user.sid}:{})]);
      await db.exec('set role '+role);
      try{return{ok:true,status:200,data:await fn()};}
      catch(e){return{ok:false,status:400,data:{code:e.code,message:e.message}};}
      finally{await db.exec("reset role;select set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claims','{}',false)");}
    };
    const rpc=(user,name,body={})=>asUser(user,async()=>{
      const contracts={personal_billing_service:['p_action','p_data'],minha_assinatura:[],excluir_minha_conta:[],criar_personal:['p_nome_academia','p_nome_membro'],dados_personal_patch:['p_academia','p_operacoes'],personal_acesso_revoga:['p_academia','p_aluno','p_revisao'],app_aluno_busca:['t'],app_aluno_devolve:['t','p_dados']};
      assert(Object.hasOwn(contracts,name));const args=contracts[name],sql=args.map((_,i)=>'$'+(i+1)).join(',');
      const table=['dados_personal_patch','personal_acesso_revoga'].includes(name);
      const result=await db.query('select '+(table?'*':'public.'+name+'('+sql+') as value')+(table?' from public.'+name+'('+sql+')':''),args.map(k=>body[k]!==null&&typeof body[k]==='object'?JSON.stringify(body[k]):body[k]));
      return table?result.rows:result.rows[0].value;
    });
    const rest=(route,{token,method,body})=>asUser(token,async()=>{
      const u=new URL(route,'http://127.0.0.1');const table=u.pathname.slice(1);assert(['dados','app_aluno'].includes(table));
      const id=u.searchParams.get('academia_id');assert(id?.startsWith('eq.'));const values=[id.slice(3)];
      const where='academia_id=$1'+(table==='dados'?" and chave='mtapp:ptStudio'":'');let sql;
      if(method==='GET')sql='select * from public.'+table+' where '+where;
      else if(method==='DELETE')sql='delete from public.'+table+' where '+where+' returning *';
      else{assert.equal(method,'PATCH');const columns=Object.keys(body);assert(columns.length>0&&columns.every(k=>['valor','dados','retorno','revogado_em'].includes(k)));
        columns.forEach(k=>values.push(body[k]!==null&&typeof body[k]==='object'?JSON.stringify(body[k]):body[k]));sql='update public.'+table+' set '+columns.map((k,i)=>k+'=$'+(i+2)).join(',')+' where '+where+' returning *';}
      return (await db.query(sql,values)).rows;
    });
    const good=r=>{assert.equal(r.ok,true,r.data?.message);return r.data;};
    const deps={client:db,executeScript:sql=>db.exec(sql),rpc,rest,good,
      rejected:(r,code)=>{assert.equal(r.ok,false,'Expected refusal');if(code)assert.equal(r.data.code,code,r.data.message);},
      check:async(label,run)=>{await run();console.log('OK '+(++count)+' '+label);},
      waitRPC:async(u,n,p,b)=>assert(p(await rpc(u,n,b))),
      createUser:async()=>{const u={id:crypto.randomUUID(),sid:crypto.randomUUID()};await db.query('insert into auth.users(id) values($1)',[u.id]);await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[u.sid,u.id]);return u;},
      sessionId:u=>u.sid,revokeSession:u=>db.query('delete from auth.sessions where id=$1',[u.sid]),
      serviceKey:'fixture-service',anonKey:'fixture-anon',transport:'sql-fixture'};
    await require('./hq-auth-ci/test-personal-billing-http.cjs')(deps);
    await require('./hq-auth-ci/test-personal-billing-access-http.cjs')(deps);
    await require('./hq-auth-ci/test-personal-signup-http.cjs')(deps);
    console.log(count+' grupos SQL aprovados; sessões fictícias, sem prova de login Auth ou rede.');
  }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
