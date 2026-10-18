/* Handler + migração executada em Postgres WASM local. Sem credenciais/rede. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{randomUUID}=require('node:crypto'),{stripTypeScriptTypes}=require('node:module');
const {PGlite}=require('./runtime/node_modules/@electric-sql/pglite');
let checks=0,pg;const A='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',TA='token-aluno-a',TB='token-aluno-b',TR='token-revogado',TQ='token-quota';
function ok(v,m){assert.ok(v,m);checks++;}function eq(a,b,m){assert.deepEqual(a,b,m);checks++;}
async function rejected(fn,status,m){await assert.rejects(fn,e=>e.status===status,m);checks++;}
(async()=>{
 const {handler,context,comment}=await import('../supabase/functions/_shared/tecnica-handler.mjs');pg=new PGlite();
 await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;create table public.academias(id uuid primary key);create table public.app_aluno(token text primary key,academia_id uuid references public.academias(id),revogado_em timestamptz);create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create function public.app_aluno_ativo(t text) returns uuid language sql security invoker set search_path='' as $$select academia_id from public.app_aluno where token=t and revogado_em is null$$;grant select,update on public.app_aluno to service_role;grant select on public.academias to service_role;grant usage on schema public to anon,authenticated,service_role;`);
 await pg.query('insert into academias values ($1),($2)',[A,B]);await pg.query('insert into app_aluno values ($1,$2,null),($3,$4,null),($5,$2,now()),($6,$2,null)',[TA,A,TB,B,TR,TQ]);
 await pg.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261017180206_tecnica_video_privada.sql'),'utf8'));
 eq((await pg.query("select public from storage.buckets where id='tecnica-privada'")).rows[0].public,false,'Bucket privado');
 for(const role of ['anon','authenticated']){eq((await pg.query("select has_table_privilege($1,'app_tecnica_revisoes','SELECT') as allowed",[role])).rows[0].allowed,false,role+' sem leitura direta');eq((await pg.query("select has_function_privilege($1,'public.tecnica_cria(uuid,text,uuid,jsonb)','EXECUTE') as allowed",[role])).rows[0].allowed,false,role+' sem executar RPC privilegiada');eq((await pg.query("select has_table_privilege($1,'app_tecnica_orfaos','SELECT,INSERT,DELETE') as allowed",[role])).rows[0].allowed,false,role+' sem acesso à fila órfã');eq((await pg.query("select has_function_privilege($1,'torque_private.tecnica_guarda_arquivos()','EXECUTE') as allowed",[role])).rows[0].allowed,false,role+' sem executar trigger privado');}
 await pg.exec('set role service_role');
 const q=async(sql,args=[])=>{try{return (await pg.query(sql,args)).rows;}catch(e){if(/^PT\d{3}$/.test(e.code))e.status=Number(e.code.slice(2));throw e;}};
 const media=new Map(),removed=[],signed=[];let cleanupCalls=0;
 const db={
  async student(token){const r=(await q('select public.app_aluno_ativo($1) as academia',[token]))[0];return r?.academia?{token,academia:r.academia}:null;},
  async professional(auth,academia){return auth==='Bearer personal-a'&&academia===A?{user:'personal-a',academia:A}:auth==='Bearer personal-b'&&academia===B?{user:'personal-b',academia:B}:null;},
  async active(token){return !!(await this.student(token));},async activeTokens(academia,tokens){return (await q('select public.tecnica_tokens_ativos($1,$2) as token',[academia,tokens])).map(r=>r.token);},
  async review(id){return (await q('select * from app_tecnica_revisoes where id=$1',[id]))[0];},
  list:async()=>q('select * from app_tecnica_revisoes order by criado_em desc limit 100'), // intentional broad adapter verifies handler scoping
  async create(x){return (await q('select * from public.tecnica_cria($1,$2,$3,$4)',[x.id,x.token,x.academia_id,x.contexto]))[0];},
  files:id=>q('select * from app_tecnica_arquivos where revisao_id=$1',[id]),
  async prepareFile(x){return (await q('select * from public.tecnica_prepara_arquivo($1,$2,$3,$4,$5,$6)',[x.id,x.revisao_id,x.academia_id,x.tipo,x.mime,x.bytes]))[0];},
  fileReady:(id,r,a)=>q('select public.tecnica_arquivo_pronto($1,$2,$3)',[id,r,a]),
  async update(r,patch){const values={...r,...patch};const rows=await q('update app_tecnica_revisoes set estado=$1,comentarios=$2,versao=versao+1 where id=$3 and versao=$4 and apagado_em is null returning *',[values.estado,JSON.stringify(values.comentarios),r.id,r.versao]);if(!rows.length)throw Object.assign(Error('Conflito'),{status:409});return rows[0];},
  async signUpload(p){signed.push(p);return {uploadUrl:'https://storage.invalid/'+p};},async signRead(p){return 'https://storage.invalid/read/'+p;},info:async p=>media.get(p),
  async removeFiles(paths){paths.forEach(p=>{removed.push(p);media.delete(p);});},tombstone:(id,a)=>q('select public.tecnica_apaga($1,$2)',[id,a]),cleanup:async()=>{cleanupCalls++;}
 };
 const run=handler(db),s=(action,body={})=>run({token:TA,action,...body},'Bearer public'),pro=(action,body={})=>run({actor:'personal',academia:A,action,...body},'Bearer personal-a');
 const ctx={exercicio:'Supino',exercicioId:'ex1',sessao:'session-1',ficha:'Treino A',serie:1,reps:'10',carga:'30'};let id=randomUUID(),created=await s('create',{id,context:ctx});
 eq(created.item.contexto.exercicio,'Supino','Criação retorna contexto');ok(!JSON.stringify(created).includes(TA),'Resposta não expõe token');
 eq((await pro('list',{studentToken:TQ})).items.length,0,'Filtro de aluno não depende apenas do adaptador');await rejected(()=>pro('get',{id,studentToken:TQ}),404,'Contexto de outro aluno no mesmo tenant recusa detalhe');
 eq(await s('create',{id,context:ctx}),created,'Replay idempotente do mesmo contexto');
 await rejected(()=>s('create',{id,context:{...ctx,serie:2}}),409,'Mesmo ID com outra série é conflito');
 await rejected(()=>run({actor:'personal',academia:A,action:'create',id:randomUUID(),context:ctx},'Bearer personal-a'),403,'Professor não fabrica upload do aluno');
 await rejected(()=>run({token:TB,action:'get',id},''),404,'Outro aluno não acessa a revisão');
 await rejected(()=>run({actor:'personal',academia:B,action:'get',id},'Bearer personal-b'),404,'Outra academia não acessa a revisão');
 await rejected(()=>run({token:TR,action:'list'},''),401,'Aluno revogado não consulta');
 await rejected(()=>s('upload',{id,fileId:randomUUID(),mime:'image/png',bytes:10}),400,'Formato errado recusado');
 await rejected(()=>s('upload',{id,fileId:randomUUID(),mime:'video/mp4',bytes:26214401}),400,'Tamanho acima do limite recusado');
 let fid=randomUUID(),upload=await s('upload',{id,fileId:fid,mime:'video/mp4',bytes:100});ok(upload.uploadUrl.includes(id)&&!upload.uploadUrl.includes(TA),'Caminho assinado usa UUIDs, sem token');
 let file=(await db.files(id))[0];media.set(file.caminho,{bytes:99,mime:'video/mp4'});await rejected(()=>s('complete',{id,fileId:fid}),409,'Bytes conferidos no servidor');
 media.set(file.caminho,{bytes:100,mime:'video/mp4'});let complete=await s('complete',{id,fileId:fid});eq(complete.item.estado,'pendente','Envio só fica pendente após conferência');
 eq(await s('upload',{id,fileId:fid,mime:'video/mp4',bytes:100}),{fileId:fid,ready:true},'Retry após confirmação perdida reaproveita o mesmo vídeo pronto');
 await rejected(()=>s('upload',{id,fileId:randomUUID(),mime:'video/mp4',bytes:100}),409,'Segundo vídeo após envio recusado');
 const rid=randomUUID();let reply=await pro('reply',{id,version:complete.item.versao,comment:{id:rid,texto:'Controle a descida',segundo:1.5,tracos:[[[0,0],[1,1]]]}});eq(reply.item.estado,'respondida','Resposta vinculada à revisão');
 eq(await pro('reply',{id,version:complete.item.versao,comment:{id:rid,texto:'Controle a descida',segundo:1.5,tracos:[[[0,0],[1,1]]]}}),reply,'Reenvio da mesma resposta não duplica');
 await rejected(()=>pro('reply',{id,version:reply.item.versao,comment:{id:rid,texto:'Outra resposta',segundo:1.5}}),409,'Replay de resposta com conteúdo diferente não é ignorado silenciosamente');
 await rejected(()=>pro('reply',{id,version:complete.item.versao,comment:{id:randomUUID(),texto:'Outra',segundo:1}}),409,'Resposta com versão velha recusada');
 await rejected(()=>s('reply',{id,version:reply.item.versao,comment:{id:randomUUID(),texto:'Sou o professor',segundo:0}}),403,'Aluno não responde como profissional');
 await rejected(()=>s('seen',{id,version:1}),409,'Leitura de resposta velha não marca nova como vista');
 eq((await s('seen',{id,version:reply.item.versao})).item.estado,'vista','Aluno confirma a versão recebida');
 const parallel=await Promise.allSettled(Array.from({length:14},()=>run({token:TQ,action:'create',id:randomUUID(),context:ctx},'')));
 eq(parallel.filter(x=>x.status==='fulfilled').length,10,'Quota no SQL limita novas revisões a dez');
 eq(parallel.filter(x=>x.status==='rejected'&&x.reason.status===429).length,4,'Excesso recebe quota, não inserção parcial');
 const draft=randomUUID();await s('create',{id:draft,context:ctx});let fileAttempts=await Promise.allSettled(Array.from({length:4},()=>s('upload',{id:draft,fileId:randomUUID(),mime:'video/mp4',bytes:50})));
 eq(fileAttempts.filter(x=>x.status==='fulfilled').length,1,'Reserva atômica impede múltiplos vídeos');eq((await db.files(draft)).length,1,'Um arquivo de vídeo armazenado por revisão');
 const audios=await Promise.allSettled(Array.from({length:23},()=>pro('upload',{id:draft,fileId:randomUUID(),mime:'audio/mp4',bytes:20})));
 eq(audios.filter(x=>x.status==='fulfilled').length,20,'Reserva de áudio respeita limite transacional de vinte');
 eq(audios.filter(x=>x.status==='rejected'&&x.reason.status===409).length,3,'Excesso de áudio não deixa linhas extras');
 const foreign=randomUUID();await run({token:TB,action:'create',id:foreign,context:ctx},'');
 await q('update app_aluno set revogado_em=now() where token=$1',[TQ]);let listed=await pro('list');ok(!listed.items.some(x=>x.id===foreign),'Lista protege academia mesmo se adaptador devolve linha indevida');eq(listed.items.filter(x=>x.revogado).length,10,'Lista do professor identifica alunos revogados para limpeza');ok(cleanupCalls>0,'Abrir lista tenta limpeza pendente');
 const revoked=listed.items.find(x=>x.revogado);let meta=await pro('get',{id:revoked.id,studentToken:TQ});eq(meta.files,[],'Acesso revogado não retorna mídia');eq(meta.item.comentarios,[],'Acesso revogado não retorna resposta com áudio');ok(meta.item.revogado,'Metadados identificam revogação');await rejected(()=>pro('upload',{id:revoked.id,fileId:randomUUID(),mime:'audio/mp4',bytes:10}),404,'Revogado não aceita novo áudio');await rejected(()=>pro('media',{id:revoked.id,fileId:randomUUID()}),404,'Revogado não assina mídia');await rejected(()=>pro('reply',{id:revoked.id,version:1,comment:{id:randomUUID(),segundo:0,texto:'Nova'}}),404,'Revogado não aceita resposta');await pro('delete',{id:revoked.id,studentToken:TQ});ok((await db.review(revoked.id)).apagado_em,'Professor exclui revisão de aluno revogado');
 await s('delete',{id});const deleted=await db.review(id);ok(deleted.apagado_em&&deleted.limpeza_apos,'Exclusão cria tombstone e prazo para upload tardio');eq(deleted.contexto,{},'Exclusão remove contexto da técnica');eq(deleted.comentarios,[],'Exclusão remove orientações privadas');ok(removed.includes(file.caminho),'Objeto atual excluído');eq((await db.files(id)).length,1,'Mantém caminho privado para limpeza posterior');
 await rejected(()=>s('get',{id}),404,'Tombstone não pode ser lido');await rejected(()=>s('media',{id,fileId:fid}),404,'Tombstone não assina mídia');await rejected(()=>s('create',{id,context:ctx}),404,'ID excluído nunca é reutilizado');
 eq(await s('delete',{id}),{ok:true},'Repetir exclusão é seguro');
 await rejected(()=>db.prepareFile({id:randomUUID(),revisao_id:id,academia_id:A,tipo:'audio',mime:'audio/mp4',bytes:1}),404,'SQL também impede arquivo depois da exclusão');
 let info=await q('select extract(epoch from (limpeza_apos-apagado_em)) as seconds from app_tecnica_revisoes where id=$1',[id]);eq(Number(info[0].seconds),7500,'Prazo cobre duas horas de URL e cinco minutos de margem');
 // Hard-delete receipts survive both direct revision removal and the complete
 // student cascade, without keeping student tokens, notes or media captions.
 const hardFile=randomUUID();await run({token:TB,action:'upload',id:foreign,fileId:hardFile,mime:'video/mp4',bytes:20},'');const hardPath=(await db.files(foreign))[0].caminho;
 await pg.exec('reset role;grant select,delete on app_aluno to authenticated;set role authenticated');await q('delete from app_aluno where token=$1',[TB]);await pg.exec('reset role;set role service_role');
 eq((await db.files(foreign)).length,0,'Cascade remove metadados dos arquivos');eq(await db.review(foreign),undefined,'Cascade remove a revisão do aluno');
 const orphan=(await q('select * from app_tecnica_orfaos where caminho=$1',[hardPath]))[0];eq(orphan.academia_id,B,'Fila preserva o tenant após apagar aluno');ok(!JSON.stringify(orphan).includes(TB),'Fila não guarda token ou contexto do aluno');
 const wait=await q('select extract(epoch from (limpeza_apos-enfileirado_em)) as seconds from app_tecnica_orfaos where caminho=$1',[hardPath]);ok(Number(wait[0].seconds)>=7499&&Number(wait[0].seconds)<=7501,'Cascade mantém margem para upload assinado tardio');
 await q('delete from app_tecnica_revisoes where id=$1',[draft]);eq(Number((await q('select count(*) as n from app_tecnica_orfaos where academia_id=$1',[A]))[0].n),21,'Delete direto também preserva todos os caminhos');
 eq(Number((await q("select count(*) as n from pg_constraint where conrelid='app_tecnica_orfaos'::regclass and contype='f'"))[0].n),0,'Fila não depende de FKs que apagam o recibo');
 const boundary=fs.readFileSync(path.join(__dirname,'../supabase/functions/tecnica-video/index.ts'),'utf8').replace(/^import .*\r?\n/gm,'');let edge;const mocked={Request,Response,Headers,AbortSignal,Uint8Array,TextDecoder,console,handler:()=>async()=>({ok:true}),cleanupAdapter:()=>async()=>({}),fetch:async()=>new Response('{}'),Deno:{env:{get:()=>''},serve:f=>edge=f}};vm.runInNewContext(stripTypeScriptTypes(boundary),mocked);
 eq((await edge(new Request('https://edge.invalid',{method:'POST',body:'bad json'}))).status,400,'JSON inválido é erro do pedido');
 eq((await edge(new Request('https://edge.invalid',{method:'POST',body:JSON.stringify({data:'é'.repeat(40000)})}))).status,413,'Limite usa bytes UTF-8 reais do corpo');
 eq((await edge(new Request('https://edge.invalid',{method:'GET'}))).status,405,'Endpoint recusa GET');
 await pg.close();console.log(`PASS técnica vídeo servidor: ${checks} verificações (SQL local + handler)`);
})().catch(async e=>{console.error(e);if(pg)await pg.close();process.exitCode=1;});
