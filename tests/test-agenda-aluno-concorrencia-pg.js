'use strict';
// Independent sessions on an explicitly local disposable PostgreSQL server.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),pg=require('./sql/node_modules/pg'),F=require('./_operacao-prioridades-sql');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let checks=0;function ok(v,m){assert.ok(v,m);console.log('OK '+(++checks)+' '+m);}
(async()=>{let url;try{url=new URL(process.env.PGTESTURL);}catch{throw Error('Defina PGTESTURL da instância descartável local.');}
 if(!['postgres:','postgresql:'].includes(url.protocol)||!['127.0.0.1','[::1]'].includes(url.hostname)||!['','/','/postgres'].includes(url.pathname)||url.search||url.hash)throw Error('Somente PostgreSQL local descartável é permitido.');
 const options={host:url.hostname.replace(/[\[\]]/g,''),port:Number(url.port||5432),user:decodeURIComponent(url.username||'postgres'),password:decodeURIComponent(url.password),database:'postgres',connectionTimeoutMillis:5000,query_timeout:10000};
 const name='torque_agenda_test_'+crypto.randomBytes(8).toString('hex'),clients=[];let created=false;
 async function connect(database){const c=new pg.Client({...options,database});await c.connect();clients.push(c);await c.query("set statement_timeout='8s';set lock_timeout='6s'");return c;}
 const admin=await connect('postgres');
 try{await admin.query('create database '+name);created=true;const a=await connect(name),b=await connect(name),watch=await connect(name);
  await a.query(F.fixture);await a.query(F.read(F.agenda));const bPid=(await b.query('select pg_backend_pid() id')).rows[0].id;
  async function blocked(){for(let i=0;i<60;i++){const s=(await watch.query('select wait_event_type from pg_stat_activity where pid=$1',[bPid])).rows[0];if(s&&s.wait_event_type==='Lock')return;await pause(20);}throw Error('Segunda conexão não aguardou lock no servidor');}
  const call=(c,token='aluno-a',hora='09:00')=>c.query("select public.app_agenda_pede($1,'2026-10-07',$2,'Concorrência sintética') r",[token,hora]).then(r=>r.rows[0].r);
  await a.query('begin');const first=await call(a);const pending=call(b);await blocked();await a.query('commit');const second=await pending;
  ok(first.ok&&second.duplicado&&first.id===second.id,'duas conexões, um pedido e o mesmo recibo');
  ok(Number((await watch.query("select count(*) n from app_agenda where token='aluno-a'")).rows[0].n)===1,'nenhuma duplicata gravada sob concorrência');
  for(let h=0;h<9;h++)await call(a,'aluno-limite',String(h).padStart(2,'0')+':00');
  await a.query('begin');await call(a,'aluno-limite','09:00');const eleventh=call(b,'aluno-limite','10:00');await blocked();await a.query('commit');ok((await eleventh).erro==='muitos_pedidos','limite de dez atômico para intenções concorrentes distintas');
  await a.query("begin;update app_aluno set revogado_em=now() where token='aluno-revogado'");const revoked=call(b,'aluno-revogado');await blocked();await a.query('commit');ok((await revoked).erro==='token_invalido','revogação aguardada impede pedido com token anteriormente válido');
  ok(Number((await watch.query("select count(*) n from app_agenda where token='aluno-revogado'")).rows[0].n)===0,'revogação não deixa pedido tardio');
  console.log(checks+' grupos de concorrência PostgreSQL passaram.');
 }finally{for(const c of clients.slice(1))await c.end().catch(()=>{});if(created){assert.match(name,/^torque_agenda_test_[a-f0-9]{16}$/);await admin.query('drop database '+name);}await admin.end();}
})().catch(e=>{console.error(e);process.exitCode=1;});
