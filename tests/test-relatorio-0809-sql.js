/* RPC real em PostgreSQL/PGlite isolado, tokens e academias fictícios. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.TORQUE_PGLITE||'./runtime/node_modules/@electric-sql/pglite');
let n=0;function ok(v,m){assert.ok(v,m);n++;console.log('OK '+m);}
(async()=>{const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create table dados(academia_id uuid,chave text,valor jsonb);
 create table app_aluno(token text primary key,academia_id uuid,revogado_em timestamptz);
 create table app_agenda(id bigserial primary key,academia_id uuid,token text,dia date,hora text,obs text,status text default 'pedido');
 create function app_aluno_ativo(t text) returns uuid language sql stable security definer set search_path=public as $$select academia_id from app_aluno where token=t and revogado_em is null$$;
 create function hoje_br() returns date language sql stable as $$select '2026-09-11'::date$$;`);
 const migration=fs.readFileSync(path.join(__dirname,'../migrations/20260911_agenda_modalidade_v822.sql'),'utf8');await db.exec(migration);
 const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
 const alunos=[{appTokenP:'online',modalidade:'consultoria online'},{appTokenP:'hybrid',modalidade:'consultoria online',atendimento:'híbrido'},{appTokenP:'legacy',modo:'mes'},{appTokenP:'typed',modalidade:'presencial',atendimento:'on-line'}];
 await db.query("insert into dados values($1,'mtapp:ptStudio',$2),($3,'mtapp:ptStudio',$4)",[A,{alunos},B,{alunos:[{appTokenP:'legacy',modalidade:'online'}]}]);
 for(const token of ['online','hybrid','legacy','typed','revoked'])await db.query('insert into app_aluno values($1,$2,$3)',[token,A,token==='revoked'?'2026-09-01':null]);
 const call=async(token,dia='2026-09-12')=>(await db.query('select app_agenda_pede($1,$2,$3,$4) as r',[token,dia,'09:00','Teste sintético'])).rows[0].r;
 const count=async()=>Number((await db.query('select count(*) as n from app_agenda')).rows[0].n);
 await db.exec('set role anon');
 ok((await call('online')).erro==='atendimento_online','token de consultoria online bloqueado');
 ok((await call('typed')).erro==='atendimento_online','tipo explícito online prevalece sobre plano presencial');
 ok((await call('missing')).erro==='token_invalido','token inexistente continua bloqueado');
 ok((await call('revoked')).erro==='token_invalido','token revogado continua bloqueado');
 ok((await call('hybrid')).ok===true,'híbrido explícito permite pedido');
 ok((await call('legacy')).ok===true,'cadastro legado preservado; outra academia não muda modalidade');
 ok((await call('legacy','2026-09-10')).erro==='dia_invalido','data passada continua bloqueada');
 ok((await call('legacy',null)).erro==='dia_invalido','data vazia continua bloqueada');
 for(let i=0;i<9;i++)await call('legacy');
 ok((await call('legacy')).erro==='muitos_pedidos','limite pré-existente de dez pedidos preservado');
 await db.exec('reset role');ok(await count()===11,'recusas não inserem sessões/pedidos');
 const before=await count();await db.exec(migration);ok(await count()===before,'reaplicar definição não reescreve dados');
 console.log(n+' verificações SQL de agenda passaram (PGlite isolado).');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
