/* Concorrência real da lista atômica do Personal; banco local descartável. */
'use strict';
const assert = require('node:assert/strict'), crypto = require('node:crypto'), fs = require('node:fs');
const { Client } = require('./sql/node_modules/pg');
const { ids, bootstrap, login, initial } = require('./_confiabilidade-sql');
const patch = require('../assets/studio-patches');
const pause = ms => new Promise(r => setTimeout(r, ms));
process.on('unhandledRejection', e => { console.error(e); process.exitCode = 1; });
(async () => {
  if (!process.env.PGTESTURL) throw Error('Defina PGTESTURL para PostgreSQL local descartável; veja tests/sql/README.md.');
  const url = new URL(process.env.PGTESTURL);
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol) && ['127.0.0.1','[::1]'].includes(url.hostname) && !url.search && !url.hash, 'Somente loopback, sem parâmetros');
  const options = {host:url.hostname.replace(/[\[\]]/g,''),port:Number(url.port||5432),user:decodeURIComponent(url.username),password:decodeURIComponent(url.password),database:decodeURIComponent(url.pathname.slice(1)),connectionTimeoutMillis:5000};
  const db = 'torque_agenda_test_' + crypto.randomBytes(8).toString('hex');
  const admin = new Client(options), clients=[]; let created=false, n=0;
  const ok = (v, label) => {assert.ok(v,label);n++;console.log('OK '+label);};
  async function connection() {const c=new Client({...options,database:db});await c.connect();clients.push(c);await c.query("set statement_timeout='10s';set lock_timeout='8s';set idle_in_transaction_session_timeout='30s'");return c;}
  try {
    await admin.connect(); await admin.query('create database '+db);created=true;
    const observer=await connection();await observer.query(bootstrap);
    const sql=fs.readFileSync(require('node:path').join(__dirname,'../supabase-setup.sql'),'utf8');
    const start=sql.indexOf('-- ==================== CONFIABILIDADE INTERNA v845');assert.ok(start>0);
    await observer.query(sql.slice(start));
    const before={...initial(),sessoes:[]};
    await observer.query("insert into dados values($1,'mtapp:ptStudio',$2,clock_timestamp())",[ids.a,before]);
    const a=await connection(),b=await connection(); await a.query(login());await b.query(login(ids.v,ids.t));
    const session=id=>({id,alunoId:'a',data:'2030-10-04',hora:'09:00',feita:false});
    const left={...before,sessoes:[session('left')]},right={...before,sessoes:[session('right')]};
    const opsA=patch.diff(before,left),opsB=patch.diff(before,right);
    ok(opsA.length===1 && opsA[0].caminho.join('.')==='sessoes', 'lista de sessões é uma operação atômica, não merge por IDs aleatórios');
    const apply=(c,ops)=>c.query('select * from dados_personal_patch($1,$2)',[ids.a,JSON.stringify(ops)]);
    await a.query('begin');await apply(a,opsA);
    const pidA=(await a.query('select pg_backend_pid() pid')).rows[0].pid;
    const pidB=(await b.query('select pg_backend_pid() pid')).rows[0].pid;
    ok(pidA!==pidB,'duas conexões PostgreSQL independentes');
    const racing=apply(b,opsB).then(r=>({r}),e=>({e}));
    let blocked=false; const deadline=Date.now()+5000;
    while(Date.now()<deadline){const r=await observer.query('select $1::int=any(pg_blocking_pids($2)) blocked',[pidA,pidB]);if(r.rows[0].blocked){blocked=true;break;}await pause(20);}
    ok(blocked,'segunda gravação espera efetivamente o lock da primeira');
    await a.query('commit'); const loser=await racing;
    ok(loser.e && loser.e.code==='PT409','segunda versão da mesma lista recebe conflito em vez de duplicar');
    const read=async()=> (await observer.query("select valor from dados where academia_id=$1 and chave='mtapp:ptStudio'",[ids.a])).rows[0].valor;
    ok((await read()).sessoes.length===1,'após duas tentativas concorrentes há uma sessão persistida');
    const retries=await Promise.all([apply(a,opsA),apply(b,opsA)]);
    ok(retries.length===2 && (await read()).sessoes.length===1,'mesmo patch após ACK perdido é idempotente');
    const saved=await read(),cancelled={...saved,sessoes:[]};
    await apply(a,patch.diff(saved,cancelled));
    const rebooked={...cancelled,sessoes:[session('rebooked')]};
    await apply(b,patch.diff(cancelled,rebooked));
    ok((await read()).sessoes.length===1 && (await read()).sessoes[0].id==='rebooked','cancelamento seguido de reagendamento persiste uma única sessão');
    await b.query(login(ids.w,ids.z));let denied;try{await apply(b,patch.diff(rebooked,{...rebooked,sessoes:[]}));}catch(e){denied=e;}
    ok(denied && (await read()).sessoes.length===1,'outra academia não pode gravar a lista');
    console.log(n+' verificações PostgreSQL reais de agenda passaram.');
  } finally {for(const c of clients)await c.end().catch(()=>{});if(created)await admin.query('drop database '+db);await admin.end();}
})().catch(e=>{console.error(e);process.exitCode=1;});
