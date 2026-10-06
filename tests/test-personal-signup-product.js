'use strict';
// Local SQL and the real account module with isolated UI/auth adapters. No real accounts.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.join(__dirname,'..');
const migration=fs.readFileSync(path.join(root,'supabase/releases/personal-billing-optional/migrations/20261006163141_personal_signup_product.sql'),'utf8');
const core=fs.readFileSync(path.join(root,'supabase-setup.sql'),'utf8');
const canonicalCreate=core.match(/create or replace function public\.criar_academia\(p_nome_academia text, p_nome_membro text\)[\s\S]*?\n\$\$;/)[0];
const code=fs.readFileSync(path.join(root,'assets/modulo-conta.js'),'utf8');
let checks=0;function pass(name){checks++;console.log('PASS '+name);}
async function moduleFixture(marca,{member=false,error=false}={}){
  const nodes={},calls=[],memory=new Map();let created=member;
  const el=id=>nodes[id]||(nodes[id]={id,style:{},attributes:{},value:'',hidden:false,disabled:false,textContent:'',innerHTML:'',events:{},focus(){},setAttribute(k,v){this.attributes[k]=v;},addEventListener(k,v){this.events[k]=v;}});
  const user={id:'fixture-user',email:'owner@example.invalid',user_metadata:{tipo:'personal'}};
  const sb={auth:{getSession:async()=>({data:{session:{user}}}),onAuthStateChange(){}},from(){return{select(){return this;},eq(){return this;},then(ok,bad){return Promise.resolve({data:created?[{academia_id:'fixture-account',papel:'dono',nome:'Teste',academias:{nome:'Conta original'}}]:[]}).then(ok,bad);}};},
    async rpc(name,body){calls.push({name,body});if(error)return{error:{message:'fixture unavailable'}};created=true;return{data:{academia_id:'fixture-account'}};}};
  const location=new URL('https://isolado.invalid/qualquer.html?produto=PERSONAL&marca=PERSONAL');
  const ctx={self:null,window:null,URL,URLSearchParams,location,console,document:{createElement:()=>el('gateModulo'),getElementById:el,body:{appendChild(){}}},addEventListener(){},localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},MT_CLOUD:{url:'https://isolado.invalid',anonKey:'public-fixture'},MT_supabase:sb,MTStore:{iniciaSync(){calls.push({sync:true});}}};
  ctx.self=ctx;ctx.window=ctx;vm.createContext(ctx);vm.runInContext(code,ctx);
  ctx.MT_moduloConta({marca,flag:'fixture',nomeIlha:()=> 'Conta antes do primeiro aluno',salvaNome:n=>calls.push({saved:n})});
  for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));
  return{calls,nodes};
}
(async()=>{
  // The product decision is the immutable page configuration, not a user/profile/URL claim.
  assert.match(fs.readFileSync(path.join(root,'personal.html'),'utf8'),/MT_moduloConta\(\{\s*marca: "PERSONAL"/);
  assert.match(fs.readFileSync(path.join(root,'nutricao.html'),'utf8'),/MT_moduloConta\(\{\s*marca: "NUTRI"/);
  const personal=await moduleFixture('PERSONAL');assert.deepEqual(personal.calls.filter(x=>x.name).map(x=>x.name),['criar_personal']);
  assert.deepEqual(Object.keys(personal.calls.find(x=>x.name).body).sort(),['p_nome_academia','p_nome_membro']);
  for(const other of ['NUTRI','ACADEMIA'])assert.deepEqual((await moduleFixture(other)).calls.filter(x=>x.name).map(x=>x.name),['criar_academia']);
  pass('configuração fixa Personal usa RPC tipada; Nutri/academia preservados mesmo com URL/perfil alegando Personal');
  const existing=await moduleFixture('PERSONAL',{member:true});assert(!existing.calls.some(x=>x.name));assert(existing.calls.some(x=>x.sync));
  pass('membresia existente é reutilizada sem RPC ou reclassificação');
  const unavailable=await moduleFixture('PERSONAL',{error:true});assert.deepEqual(unavailable.calls.filter(x=>x.name).map(x=>x.name),['criar_personal']);assert(!unavailable.calls.some(x=>x.sync));
  pass('RPC indisponível não faz fallback para conta sem produto');
  const {PGlite}=require(process.env.TORQUE_PGLITE||'./runtime/node_modules/@electric-sql/pglite');const db=new PGlite();
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role;
      create schema auth;create table auth.users(id uuid primary key,email text);
      create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      create table public.academias(id uuid primary key default gen_random_uuid(),nome text not null,codigo_equipe text unique,criada timestamptz default now());
      create table public.membros(academia_id uuid references public.academias(id),user_id uuid references auth.users(id),papel text,nome text,email text,primary key(academia_id,user_id));
      create table public.saas_clientes(academia_id uuid primary key references public.academias(id),tipo text check(tipo in ('personal','academia','nutri')),plano text,valor numeric,status text,obs text,atualizado timestamptz);
      create table public.dados(academia_id uuid,chave text,valor jsonb);
      grant usage on schema public,auth to anon,authenticated,service_role;`);
    await db.exec(canonicalCreate);await db.exec(migration);
    const user=async()=>{const u={id:crypto.randomUUID(),sid:crypto.randomUUID()};await db.query('insert into auth.users values($1,$2)',[u.id,'fixture@example.invalid']);await db.query('insert into auth.sessions values($1,$2,null)',[u.sid,u.id]);return u;};
    const rpc=async(u,role='authenticated',name='Primeiro Personal')=>{
      await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[u?.id||'',JSON.stringify(u?.sid?{session_id:u.sid}:{})]);
      await db.exec('set role '+role);
      try{return(await db.query('select public.criar_personal($1,$2) as result',[name,'Profissional Fictício'])).rows[0].result;}
      finally{await db.exec('reset role');}
    };
    const count=async()=>{const r=await db.query('select (select count(*) from public.academias)::int academias,(select count(*) from public.membros)::int membros,(select count(*) from public.saas_clientes)::int clientes');return r.rows[0];};
    const u=await user(),created=await rpc(u);
    const row=(await db.query('select a.nome,m.papel,c.tipo,c.plano,c.valor,c.status from academias a join membros m on m.academia_id=a.id join saas_clientes c on c.academia_id=a.id where a.id=$1',[created.academia_id])).rows[0];
    assert.deepEqual(row,{nome:'Primeiro Personal',papel:'dono',tipo:'personal',plano:'trial',valor:'0',status:'trial'});
    assert.equal((await db.query('select count(*)::int n from dados')).rows[0].n,0);
    pass('criação atômica registra Personal/trial antes de qualquer ptStudio ou aluno');
    const before=await count();await assert.rejects(()=>rpc(u),/account_already_exists/);assert.deepEqual(await count(),before);
    pass('repetição não cria segunda ilha nem altera a primeira');
    for(const tipo of ['academia','nutri']){
      const owner=await user(),id=crypto.randomUUID();
      await db.query('insert into academias(id,nome,codigo_equipe) values($1,$2,$3)',[id,'Conta '+tipo,crypto.randomUUID()]);
      await db.query('insert into membros values($1,$2,$3,$4,$5)',[id,owner.id,'dono','Original','original@example.invalid']);
      await db.query('insert into saas_clientes(academia_id,tipo,status) values($1,$2,$3)',[id,tipo,'ativo']);
      const prior=await count();await assert.rejects(()=>rpc(owner),/account_already_exists/);assert.deepEqual(await count(),prior);
      assert.equal((await db.query('select tipo from saas_clientes where academia_id=$1',[id])).rows[0].tipo,tipo);
    }
    pass('academia/Nutri existentes não são convertidos para Personal');
    const anonymousBefore=await count();await assert.rejects(()=>rpc(null,'anon'),/permission denied/);await assert.rejects(()=>rpc(u,'service_role'),/permission denied/);assert.deepEqual(await count(),anonymousBefore);
    pass('anon e service_role não executam cadastro de usuário');
    const expired=await user();await db.query("update auth.sessions set not_after=now()-interval '1 minute' where id=$1",[expired.sid]);await assert.rejects(()=>rpc(expired),/auth_required/);
    const revoked=await user();await db.query('delete from auth.sessions where id=$1',[revoked.sid]);await assert.rejects(()=>rpc(revoked),/auth_required/);
    const absent=await user();await assert.rejects(()=>rpc({id:absent.id}),/auth_required/);assert.deepEqual(await count(),anonymousBefore);
    pass('sessão expirada/revogada/sem session_id não cria ilha');
    const mismatch=await user();await assert.rejects(()=>rpc({id:absent.id,sid:mismatch.sid}),/auth_required/);
    pass('sessão de outra identidade é recusada');
    const invalid=await user();await assert.rejects(()=>rpc(invalid,'authenticated',' '),/invalid_input/);assert.deepEqual(await count(),anonymousBefore);
    pass('nome inválido falha antes de criar registros');
    await db.exec("create function public.reject_signup_fixture() returns trigger language plpgsql as $$begin raise exception 'fixture_classification_failed';end$$;create trigger reject_signup_fixture before insert on public.saas_clientes for each row execute function public.reject_signup_fixture();");
    const failing=await user(),rollbackBefore=await count();await assert.rejects(()=>rpc(failing),/fixture_classification_failed/);assert.deepEqual(await count(),rollbackBefore);
    await db.exec('drop trigger reject_signup_fixture on public.saas_clientes;drop function public.reject_signup_fixture();');
    const retry=await rpc(failing);assert(retry.academia_id);pass('falha ao classificar desfaz academia/membro e permite retentar sem ilha órfã');
    assert.equal((await db.query("select has_function_privilege('authenticated','public.criar_personal(text,text)','execute') yes")).rows[0].yes,true);
    assert.equal((await db.query("select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='criar_personal' and p.pronargs<>2")).rows[0].n,0);
    pass('contrato não oferece academia_id ou reclassificação como parâmetro');
  }finally{await db.close();}
  console.log(`PASS Personal signup product: ${checks} grupos locais; sessões SQL fictícias, sem prova de Auth HTTP.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
