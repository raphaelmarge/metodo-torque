// RLS e operações reais; bases efêmeras sem registros da produção.
const assert=require('node:assert/strict'),{PGlite}=require('./runtime/node_modules/@electric-sql/pglite');
const {ids,bootstrap,migration,login,initial}=require('./_confiabilidade-sql');
const patch=require('../assets/studio-patches');
let n=0;function ok(c,m){assert.ok(c,m);console.log('OK '+m);n++;}
(async()=>{
 const db=new PGlite();
 try{
  await db.exec(bootstrap);await db.exec(migration);
  const initialDoc=initial();
  await db.query("insert into dados(academia_id,chave,valor) values($1,'mtapp:ptStudio',$2),($3,'mtapp:ptStudio',$2)",[ids.a,JSON.stringify(initialDoc),ids.b]);
  await db.query("insert into app_aluno values('token-ficticio',$1,null,'{}','{\"series\":3}')",[ids.a]);
  await db.exec(login());
  const apply=async ops=>(await db.query('select * from dados_personal_patch($1,$2)',[ids.a,JSON.stringify(ops)])).rows[0];
  const read=async()=>(await db.query("select valor from dados where academia_id=$1 and chave='mtapp:ptStudio'",[ids.a])).rows[0].valor;
  const changed=(id,value)=>{const d=initial();d.alunos.find(x=>x.id===id).nome=value;return d;};
  await apply(patch.diff(initialDoc,changed('a','Ana atualizada')));
  await apply(patch.diff(initialDoc,changed('b','Bia atualizada')));
  let current=await read();ok(current.alunos[0].nome==='Ana atualizada'&&current.alunos[1].nome==='Bia atualizada','edições de alunos diferentes com a mesma base se conciliam');
  let err;try{await apply(patch.diff(initialDoc,changed('a','Sobrescrever')))}catch(e){err=e;}ok(err&&err.code==='PT409','mesmo aluno em conflito não é sobrescrito');
  const beforeCount=(await db.query('select count(*)::int as n from personal_alteracoes')).rows[0].n;
  await apply(patch.diff(initialDoc,changed('a','Ana atualizada')));
  ok((await db.query('select count(*)::int as n from personal_alteracoes')).rows[0].n===beforeCount,'repetição após resposta perdida não duplica histórico');
  const f1=initial(),f2=initial();f1.treinosV2.a.fichas[0].nome='Ficha 1 nova';f2.treinosV2.a.fichas[1].nome='Ficha 2 nova';
  await apply(patch.diff(initialDoc,f1));await apply(patch.diff(initialDoc,f2));
  current=await read();ok(current.treinosV2.a.fichas.every(x=>x.nome.includes('nova')),'duas fichas distintas do mesmo aluno são conciliadas');
  const h=(await db.query("select * from personal_alteracoes where caminho=array['treinosV2','a','fichas','f1'] order by criado_em desc limit 1")).rows[0];
  ok(h.autor_id===ids.u&&h.autor_nome==='Pessoa A'&&h.antes.valor.nome==='A'&&h.depois.valor.nome==='Ficha 1 nova','histórico preserva autor, item, antes e depois');
  await db.query('select * from personal_alteracao_restaura($1,$2)',[ids.a,h.id]);
  current=await read();ok(current.treinosV2.a.fichas[0].nome==='A'&&current.treinosV2.a.fichas[1].nome==='Ficha 2 nova','restauração seletiva preserva outra ficha');
  let restored=current,edited=JSON.parse(JSON.stringify(current));edited.treinosV2.a.fichas[0].nome='Edição posterior';await apply(patch.diff(restored,edited));
  err=null;try{await db.query('select * from personal_alteracao_restaura($1,$2)',[ids.a,h.id]);}catch(e){err=e;}ok(err&&err.code==='PT409','histórico não cobre edição posterior');
  const before=await read(),next=JSON.parse(JSON.stringify(before));next.config.cor='verde';const batch=patch.diff(before,next).concat(patch.diff(initialDoc,changed('a','Antiga')));
  err=null;try{await apply(batch);}catch(e){err=e;}ok(err&&err.code==='PT409'&&(await read()).config.cor==='azul','conflito no fim do lote reverte todas as operações');
  ok((await db.query('select * from dados where academia_id=$1',[ids.b])).rows.length===0,'RLS não lê outra academia');
  err=null;try{await db.query('select * from dados_personal_patch($1,$2)',[ids.b,JSON.stringify(patch.diff(initialDoc,changed('a','Intruso')))]);}catch(e){err=e;}ok(err&&err.code==='PT409','RLS não grava outra academia');
  err=null;try{await db.query('delete from personal_alteracoes');}catch(e){err=e;}ok(err&&err.code==='42501','usuário não apaga histórico');
  const sessions=(await db.query('select * from personal_sessoes()')).rows;ok(sessions.length===1&&sessions[0].atual&&sessions[0].id===ids.s,'lista de sessões é restrita à própria pessoa');
  const revision=(await db.query('select atualizado from dados where academia_id=$1',[ids.a])).rows[0].atualizado;
  await db.query('select * from personal_acesso_revoga($1,$2,$3)',[ids.a,'a',revision]);
  const access=(await db.query('select * from app_aluno')).rows[0];ok(access.revogado_em&&access.dados===null&&access.retorno.series===3&&(await read()).alunos[0].appRevogadoEm,'revogação atualiza painel e preserva registros do aluno');
  const accessHistory=(await db.query("select id from personal_alteracoes where caminho=array['alunos','a'] order by criado_em desc limit 1")).rows[0];
  err=null;try{await db.query('select * from personal_alteracao_restaura($1,$2)',[ids.a,accessHistory.id]);}catch(e){err=e;}ok(err,'recuperação genérica não religa acesso revogado');
  await db.exec('reset role');await db.query('delete from auth.sessions where id=$1',[ids.s]);await db.exec(login());
  ok((await db.query('select * from dados')).rows.length===0&&(await db.query('select * from personal_alteracoes')).rows.length===0,'sessão revogada perde leitura mesmo com JWT antigo');
  err=null;try{await apply([]);}catch(e){err=e;}ok(err&&err.code==='PT409','sessão revogada não grava');
  await db.exec('reset role;set role anon');err=null;try{await db.query('select * from personal_sessoes()');}catch(e){err=e;}ok(err&&err.code==='42501','anônimo não acessa sessões');
  err=null;try{await apply([]);}catch(e){err=e;}ok(err&&err.code==='42501','anônimo não acessa sincronização');
  console.log(n+' verificações SQL de confiabilidade aprovadas.');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

if(process.env.PGTESTURL)(async()=>{
 const {Client}=require('./sql/node_modules/pg'),crypto=require('node:crypto');
 const url=new URL(process.env.PGTESTURL);assert.ok(['127.0.0.1','[::1]'].includes(url.hostname)&&!url.search&&!url.hash,'Somente PostgreSQL isolado local');
 const name='torque_internal_'+crypto.randomBytes(8).toString('hex'),admin=new Client({connectionString:url.href}),clients=[];let created=false;
 try{
  await admin.connect();await admin.query('create database '+name);created=true;url.pathname='/'+name;
  for(let i=0;i<2;i++){const c=new Client({connectionString:url.href});await c.connect();await c.query("set statement_timeout='10s'");clients.push(c);}
  const [a,b]=clients;await a.query(bootstrap);await a.query(migration);
  await a.query("insert into dados(academia_id,chave,valor) values($1,'mtapp:ptStudio',$2)",[ids.a,JSON.stringify(initial())]);
  await a.query(login());await b.query(login(ids.v,ids.t));
  const da=initial(),db=initial();da.alunos[0].nome='A concorrente';db.alunos[1].nome='B concorrente';
  await Promise.all([a,b].map((c,i)=>c.query('select * from dados_personal_patch($1,$2)',[ids.a,JSON.stringify(patch.diff(initial(),i?db:da))])));
  const merged=(await a.query('select valor from dados')).rows[0].valor;assert.equal(merged.alunos[0].nome,'A concorrente');assert.equal(merged.alunos[1].nome,'B concorrente');
  const one=structuredClone(merged),two=structuredClone(merged);one.alunos[0].nome='Versão 1';two.alunos[0].nome='Versão 2';
  const results=await Promise.allSettled([a,b].map((c,i)=>c.query('select * from dados_personal_patch($1,$2)',[ids.a,JSON.stringify(patch.diff(merged,i?two:one))])));
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.find(x=>x.status==='rejected').reason.code,'PT409');
  console.log('OK PostgreSQL real: alunos distintos se conciliam; mesmo aluno confirma apenas uma edição.');
 }finally{await Promise.all(clients.map(c=>c.end()));if(created)await admin.query('drop database '+name);await admin.end();}
})().catch(e=>{console.error(e);process.exitCode=1;});
