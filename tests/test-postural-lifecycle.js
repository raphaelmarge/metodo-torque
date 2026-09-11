/* Exclusão de conta/academia em banco isolado; nenhum dado real. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.TORQUE_PGLITE||'./runtime/node_modules/@electric-sql/pglite');
const C=require('../assets/postural-core.js');
(async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
   create table auth.users(id uuid primary key); create table public.academias(id uuid primary key);
   create table public.membros(academia_id uuid,user_id uuid);
   create table public.dados(academia_id uuid,chave text,valor jsonb);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create function public.minhas_academias() returns setof uuid language sql stable security definer set search_path='' as $$select academia_id from public.membros where user_id=auth.uid()$$;`);
  for(const name of ['20260911030000_personal_postural.sql','20260911033500_personal_postural_account_cleanup.sql'])
   await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',name),'utf8'));
  const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
  const U='33333333-3333-4333-8333-333333333333',V='44444444-4444-4444-8444-444444444444';
  const I='55555555-5555-4555-8555-555555555555',J='66666666-6666-4666-8666-666666666666';
  await db.query('insert into public.academias values($1),($2)',[A,B]);
  await db.query('insert into auth.users values($1),($2)',[U,V]);
  const d=C.create({width:800,height:1600,data:'data:image/jpeg;base64,/9j/2Q=='});
  for(const [id,user] of [[I,U],[J,V]])
   await db.query(`insert into public.personal_postural(id,academia_id,autor_id,aluno_id,data,vista,consentimento,documento) values($1,$2,$3,'synthetic','2026-09-01','frente',true,$4)`,[id,A,user,d]);
  const count=async sql=>Number((await db.query(sql)).rows[0].n);
  assert.equal(await count('select count(*) n from public.personal_postural'),2);
  await db.query('delete from auth.users where id=$1',[U]);
  assert.equal(await count('select count(*) n from public.personal_postural'),1);
  assert.equal((await db.query('select autor_id from public.personal_postural')).rows[0].autor_id,V);
  assert.equal(await count('select count(*) n from public.academias'),2);
  await db.query('delete from public.academias where id=$1',[A]);
  assert.equal(await count('select count(*) n from public.personal_postural'),0);
  assert.equal(await count('select count(*) n from auth.users'),1);
  assert.equal((await db.query('select id from public.academias')).rows[0].id,B);
  console.log('Postural lifecycle: 7 verificações passaram; conta/academia excluem somente seus snapshots.');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
