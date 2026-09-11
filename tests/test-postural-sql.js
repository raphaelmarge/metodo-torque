/* Migração e RLS com dados sintéticos em PostgreSQL/PGlite. Nunca conecta à produção. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.TORQUE_PGLITE||'./runtime/node_modules/@electric-sql/pglite');
const C=require('../assets/postural-core.js');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const U='33333333-3333-4333-8333-333333333333',V='44444444-4444-4444-8444-444444444444',W='55555555-5555-4555-8555-555555555555';
const ID='66666666-6666-4666-8666-666666666666',OTHER='77777777-7777-4777-8777-777777777777';
let checks=0;
const ok=(v,label)=>{assert.ok(v,label);checks++;console.log('OK '+label);};
(async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
   create table auth.users(id uuid primary key); create table public.academias(id uuid primary key);
   create table public.membros(academia_id uuid,user_id uuid);
   create table public.dados(academia_id uuid,chave text,valor jsonb);
   create function public.minhas_academias() returns setof uuid language sql stable security definer set search_path='' as $$select academia_id from public.membros where user_id=auth.uid()$$;
   grant select on public.dados to authenticated; alter table public.dados enable row level security;
   create policy dados_le on public.dados for select to authenticated using(academia_id in(select public.minhas_academias()));`);
  await db.query('insert into public.academias values($1),($2)',[A,B]);
  await db.query('insert into auth.users values($1),($2),($3)',[U,V,W]);
  await db.query('insert into public.membros values($1,$2),($1,$3),($4,$5)',[A,U,V,B,W]);
  await db.query(`insert into public.dados values($1,'mtapp:ptStudio','{"alunos":[{"id":"student"}]}'),($2,'mtapp:ptStudio','{"alunos":[{"id":"other-student"}]}')`,[A,B]);
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20260911030000_personal_postural.sql'),'utf8'));
  const who=async(uid=U,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec('set role '+role);};
  const doc=()=>C.create({width:800,height:1600,data:'data:image/jpeg;base64,/9j/2Q=='});
  const insert=(o={})=>db.query(`insert into public.personal_postural(id,academia_id,autor_id,aluno_id,data,vista,consentimento,documento) values($1,$2,$3,$4,'2026-09-01','frente',$5,$6) returning id`,[o.id||OTHER,o.aid||A,o.uid||U,o.student||'student',o.consent!==false,o.document||doc()]);
  const denied=async(fn,code,label)=>{let error;try{await fn();}catch(e){error=e;}ok(error&&error.code===code,label+' ('+(error&&error.code)+')');};
  const count=async()=>Number((await db.query('select count(*) n from public.personal_postural')).rows[0].n);
  await who('','anon');await denied(()=>db.query('select * from public.personal_postural'),'42501','anon não lê fotos');
  await denied(()=>insert(),'42501','anon não insere');
  await who('');await denied(()=>insert(),'42501','sem JWT não insere');
  await who();await insert({id:ID});ok(await count()===1,'autor lê seu snapshot');
  await denied(()=>insert({id:ID}),'23505','mesmo ID não sobrescreve');
  await denied(()=>db.query("update public.personal_postural set vista='costas' where id=$1",[ID]),'42501','UPDATE negado');
  await denied(()=>insert({uid:V}),'42501','autor não pode ser forjado');
  await denied(()=>insert({aid:B,student:'other-student'}),'42501','outra academia não recebe INSERT');
  await denied(()=>insert({student:'missing'}),'42501','aluno inexistente não recebe foto');
  await denied(()=>insert({consent:false}),'23514','consentimento falso rejeitado');
  for(const mutate of [d=>d.image.width=1601,d=>d.rotation='invalid',d=>d.image.data='https://example.invalid/photo',d=>d.marks=[{id:'n',type:'note',text:'',points:[{x:2,y:0}]}]]){
   const d=doc();mutate(d);await denied(()=>insert({document:d}),'23514','documento inválido rejeitado');
  }
  await who(V);ok(await count()===0,'colega da mesma academia não lê foto de outro autor');
  ok((await db.query('delete from public.personal_postural where id=$1 returning id',[ID])).rows.length===0,'colega não exclui foto de outro autor');
  await who(W);ok(await count()===0,'outra academia não lê foto');
  await db.exec('reset role');await db.query('delete from public.membros where user_id=$1',[U]);
  await who();ok(await count()===0,'vínculo revogado bloqueia leitura');
  await denied(()=>insert(),'42501','vínculo revogado bloqueia INSERT');
  await db.exec('reset role');await db.query('insert into public.membros values($1,$2)',[A,U]);
  await who();ok((await db.query('delete from public.personal_postural where id=$1 returning id',[ID])).rows.length===1,'autor confirma exclusão');
  ok(await count()===0,'snapshot excluído não reaparece');
  console.log(checks+' verificações SQL posturais passaram (PGlite isolado; não é homologação Supabase).');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
