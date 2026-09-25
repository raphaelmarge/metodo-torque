// SQL real em PGlite/pgcrypto isolado. Nenhum cadastro ou e-mail real.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require('./runtime/node_modules/@electric-sql/pglite');
const {pgcrypto}=require('./runtime/node_modules/@electric-sql/pglite/dist/contrib/pgcrypto.cjs');
let n=0;const ok=(c,m)=>{assert.ok(c,m);console.log('OK '+m);n++};
(async()=>{
 const db=new PGlite({extensions:{pgcrypto}});
 try {
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema extensions; create extension pgcrypto with schema extensions;
 create schema torque_private;
 create table torque_private.aluno_login_limite(chave text primary key);
 create table public.app_aluno(token text primary key,login text,senha text,revogado_em timestamptz,dados jsonb default '{}',retorno jsonb default '{}');
 grant usage on schema public,extensions to service_role;
 grant select,update on public.app_aluno to service_role;
 insert into public.app_aluno values('app-a','a@example.invalid',extensions.crypt('senha-original',extensions.gen_salt('bf')),null,'{"treino":"A"}','{"series":3}');
 insert into public.app_aluno values('app-b','b@example.invalid',extensions.crypt('senha-original',extensions.gen_salt('bf')),null,'{"treino":"B"}','{}');`);
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20260925012235_aluno_recuperacao_acesso.sql'),'utf8'));
 await db.exec("insert into torque_private.aluno_login_limite values (encode(extensions.digest('a@example.invalid','sha256'),'hex')), (encode(extensions.digest('b@example.invalid','sha256'),'hex'))");
 const call=async(name,args)=>(await db.query('select public.'+name+'($1,$2) as r',args)).rows[0].r;
 const begin=(email='a@example.invalid',h='a'.repeat(64))=>call('aluno_recuperacao_inicia',[email,h]);
 const end=(h='a'.repeat(64),pwd='senha-nova-forte')=>call('aluno_recuperacao_conclui',[h,pwd]);
 for(const role of ['anon','authenticated']){
  await db.exec('set role '+role);
  for(const fn of [()=>begin(),()=>end(),()=>db.query('select * from torque_private.aluno_recuperacao')]){
   let error;try{await fn()}catch(e){error=e}ok(error&&error.code==='42501',role+' sem permissão para acessar recuperação');
  }
  await db.exec('reset role');
 }
 await db.exec('set role service_role');
 ok((await begin()).email==='a@example.invalid','pedido retorna somente destino ao servidor');
 ok(!('email' in await begin()),'intervalo impede reenvio imediato');
 ok(!('email' in await begin('inexistente@example.invalid','c'.repeat(64))),'inexistente não cria link');
 ok(!(await end('d'.repeat(64))).ok,'segredo incorreto recusado');
 ok(!(await end('a'.repeat(64),'curta')).ok,'senha curta recusada');
 ok(!(await end('a'.repeat(64),'é'.repeat(40))).ok,'bcrypt não trunca senha longa');
 ok((await end()).ok,'link válido troca senha');
 ok(!(await end()).ok,'link usado não pode ser repetido');
 ok((await db.query("select chave from torque_private.aluno_login_limite")).rows.length===1 && (await db.query("select 1 from torque_private.aluno_login_limite where chave=encode(extensions.digest('b@example.invalid','sha256'),'hex')")).rows.length===1,'recuperação libera só as tentativas do login correto');
 const a=(await db.query("select senha=extensions.crypt('senha-nova-forte',senha) as nova,dados,retorno from public.app_aluno where token='app-a'")).rows[0];
 ok(a.nova&&a.dados.treino==='A'&&a.retorno.series===3,'troca preserva ficha e registros');
 ok((await db.query("select senha=extensions.crypt('senha-original',senha) as original from public.app_aluno where token='app-b'")).rows[0].original,'outro aluno preservado');
 await db.exec("update torque_private.aluno_recuperacao_limite set inicio=now()-interval '2 hours',ultimo=now()-interval '2 hours' where chave<>'global'");
 await begin('a@example.invalid','e'.repeat(64));
 await db.exec("update torque_private.aluno_recuperacao set expira=now()-interval '1 minute'");
 ok(!(await end('e'.repeat(64))).ok,'expiração impede troca');
 await db.exec("update torque_private.aluno_recuperacao_limite set ultimo=now()-interval '2 minutes' where chave<>'global'");
 await begin('a@example.invalid','f'.repeat(64));
 await db.exec("update public.app_aluno set senha=extensions.crypt('mudou-pelo-app',extensions.gen_salt('bf')) where token='app-a'");
 ok(!(await end('f'.repeat(64))).ok,'senha alterada depois invalida link anterior');
 await db.exec("update torque_private.aluno_recuperacao_limite set ultimo=now()-interval '2 minutes' where chave<>'global'");
 await begin('a@example.invalid','1'.repeat(64));
 await db.exec("update public.app_aluno set revogado_em=now() where token='app-a'");
 ok(!(await end('1'.repeat(64))).ok,'aluno revogado não recupera acesso');
 await db.exec("update torque_private.aluno_recuperacao_limite set ultimo=now()-interval '2 minutes' where chave<>'global'");
 ok(!('email' in await begin('a@example.invalid','2'.repeat(64))),'máximo de três links por hora');
 ok((await db.query("select bool_and(not prosecdef) as invoker from pg_proc where proname in ('aluno_recuperacao_inicia','aluno_recuperacao_conclui')")).rows[0].invoker,'RPCs não elevam privilégios');
 console.log(n+' verificações de recuperação SQL aprovadas.');
 }finally{await db.close()}
})().catch(e=>{console.error(e);process.exitCode=1});

// Duas conexões PostgreSQL no CI, sem usar o banco da aplicação.
if(process.env.PGTESTURL) (async()=>{
 const {Client}=require('./sql/node_modules/pg');const crypto=require('node:crypto');
 const url=new URL(process.env.PGTESTURL);
 assert.ok(['127.0.0.1','[::1]'].includes(url.hostname)&&!url.search&&!url.hash,'Somente PostgreSQL de teste local');
 const name='torque_recovery_'+crypto.randomBytes(10).toString('hex');
 const admin=new Client({connectionString:url.href}),clients=[];let created=false;
 try{
  await admin.connect();await admin.query('create database '+name);created=true;
  url.pathname='/'+name;
  for(let i=0;i<2;i++){const c=new Client({connectionString:url.href});await c.connect();await c.query("set statement_timeout='10s'");clients.push(c)}
  const a=clients[0],b=clients[1];
  await a.query(`do $$begin
    if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
    if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
    if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
    end$$;
    create schema extensions; create extension pgcrypto with schema extensions;
 create schema torque_private;
 create table torque_private.aluno_login_limite(chave text primary key);
    create table public.app_aluno(token text primary key,login text,senha text,revogado_em timestamptz);
    insert into public.app_aluno values('ficticio','corrida@example.invalid',extensions.crypt('anterior',extensions.gen_salt('bf')),null);`);
  await a.query(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20260925012235_aluno_recuperacao_acesso.sql'),'utf8'));
  await a.query("select public.aluno_recuperacao_inicia('corrida@example.invalid',$1)",['c'.repeat(64)]);
  const results=await Promise.all([a,b].map(c=>c.query('select public.aluno_recuperacao_conclui($1,$2) as r',['c'.repeat(64),'nova-senha-ficticia'])));
  assert.equal(results.filter(r=>r.rows[0].r.ok).length,1,'Exatamente uma troca concorrente deve vencer');
  console.log('OK PostgreSQL real: duas conexões consomem o link uma única vez');
 }finally{await Promise.all(clients.map(c=>c.end()));if(created)await admin.query('drop database '+name);await admin.end()}
})().catch(e=>{console.error(e);process.exitCode=1});
