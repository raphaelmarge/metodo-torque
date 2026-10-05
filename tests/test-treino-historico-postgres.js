/* Duas conexões + observador, somente PostgreSQL descartável em loopback. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { Client } = require('./sql/node_modules/pg');
const H = require('../app/treino-historico-core');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  if (!process.env.PGTESTURL) throw Error('Defina PGTESTURL para PostgreSQL local descartável; este teste não é aprovado por omissão.');
  const url = new URL(process.env.PGTESTURL);
  if (!['postgres:','postgresql:'].includes(url.protocol) || !['127.0.0.1','[::1]'].includes(url.hostname) || url.search || url.hash) throw Error('PGTESTURL aceita somente banco descartável em loopback.');
  const opts = { host: url.hostname.replace(/[\[\]]/g,''), port: Number(url.port || 5432), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database: url.pathname.slice(1), connectionTimeoutMillis: 5000, query_timeout: 12000, ssl: false };
  const admin = new Client(opts); const name = 'torque_history_' + crypto.randomBytes(8).toString('hex');
  const clients = []; let created = false, checks = 0;
  try {
    await admin.connect(); await admin.query('CREATE DATABASE ' + name); created = true;
    for (let i=0;i<3;i++) { const c = new Client({ ...opts, database: name, application_name: name + '_' + i }); await c.connect(); clients.push(c); }
    const [a,b,watch] = clients;
    await a.query("DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$; CREATE TABLE public.app_aluno(token text primary key,revogado_em timestamptz); INSERT INTO public.app_aluno VALUES('synthetic-a',null);");
    await a.query(fs.readFileSync(require('node:path').join(__dirname,'../supabase/proposals/treino-historico.sql'),'utf8'));
    const start = {v:1,id:'start:s-a',session:'s-a',type:'start',actor:'device-a',at:'2026-10-03T12:00:00.000Z',date:'2026-09-03',kind:'musculacao',prescribed:{name:'Ficha fictícia'},legacy:false};
    const r = {v:1,id:'r-a',session:'s-a',type:'result',actor:'device-a',at:start.at,target:'set-a',parents:[],value:{reps:8}};
    const save = (c,es) => c.query("SELECT public.app_treino_eventos_grava('synthetic-a',$1::jsonb) as v",[JSON.stringify(es)]);
    async function blocked() {
      for (let i=0;i<50;i++) {
        const res = await watch.query('SELECT cardinality(pg_blocking_pids(pid))>0 AS blocked FROM pg_stat_activity WHERE application_name=$1',[name+'_1']);
        if(res.rows.some(x=>x.blocked))return;
        await delay(40);
      }
      throw Error('A segunda conexão não aguardou o lock por aluno.');
    }
    await a.query('BEGIN'); await save(a,[start,r]);
    const duplicate = save(b,[start,r]); await blocked(); await a.query('COMMIT'); await duplicate;
    assert.equal((await watch.query('SELECT count(*)::int AS n FROM public.app_treino_eventos')).rows[0].n,2);
    console.log('OK duas conexões: gravação duplicada aguarda lock e não duplica eventos'); checks++;
    const c1 = {...r,id:'edit-a',type:'correction',parents:['r-a'],reason:'Reps esquecidas',value:{reps:9}};
    const c2 = {...c1,id:'edit-b',actor:'device-b',value:{reps:10}};
    await a.query('BEGIN'); await save(a,[c1]); const concurrent = save(b,[c2]); await blocked(); await a.query('COMMIT'); await concurrent;
    const data=(await watch.query("SELECT public.app_treino_eventos_lista('synthetic-a',0) AS v")).rows[0].v;
    const v=H.project(Object.fromEntries(data.eventos.map(e=>[e.id,e])),'s-a');
    assert.deepEqual(v.targets['set-a'].heads,['edit-a','edit-b']); assert.equal(v.targets['set-a'].conflict,true);
    console.log('OK revisões concorrentes persistem ambas, sem overwrite'); checks++;
    await a.query('BEGIN');await a.query("UPDATE public.app_aluno SET revogado_em=now() WHERE token='synthetic-a'");
    const revoked=save(b,[{...r,id:'late-a'}]);await blocked();await a.query('COMMIT');
    assert.equal((await revoked).rows[0].v.erro,'sem_acesso');
    assert.equal((await watch.query("SELECT count(*)::int AS n FROM public.app_treino_eventos WHERE evento_id='late-a'")).rows[0].n,0);
    console.log('OK revogação concorrente bloqueia gravação tardia'); checks++;
    console.log(checks+' cenários de concorrência PostgreSQL real passaram.');
  } finally {
    for(const c of clients) await c.end().catch(()=>{});
    if(created) await admin.query('DROP DATABASE '+name).catch(()=>{});
    await admin.end();
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
