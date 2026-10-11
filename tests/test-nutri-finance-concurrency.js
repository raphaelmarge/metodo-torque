/* Real PostgreSQL, two writers + an observer. Synthetic disposable database only.
 * Uses pg_blocking_pids as evidence, never timing alone or PGlite as concurrency proof.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, randomUUID } = require('node:crypto');
const { setTimeout: pause } = require('node:timers/promises');
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const A=id(1),B=id(2),PA=id(3),PB=id(4),CA=id(11),CB=id(12),RA=id(21),RB=id(22);
let checks=0;
const release=path.join(__dirname,'../supabase/releases/nutri-consolidation');

function connectionOptions() {
  if (!process.env.PGTESTURL) throw new Error('Defina PGTESTURL para PostgreSQL local descartável. Consulte tests/sql/README.md.');
  let url; try { url=new URL(process.env.PGTESTURL); } catch { throw new Error('PGTESTURL inválida.'); }
  if (!['postgres:','postgresql:'].includes(url.protocol) || !['127.0.0.1','[::1]'].includes(url.hostname) || url.search || url.hash)
    throw new Error('PGTESTURL aceita apenas 127.0.0.1 ou [::1], sem parâmetros ou fragmento; não use túneis ou dados reais.');
  return {host:url.hostname.replace(/^\[|\]$/g,''),port:Number(url.port||5432),
    user:decodeURIComponent(url.username||'postgres'),password:decodeURIComponent(url.password),
    database:decodeURIComponent(url.pathname.slice(1)||'postgres'),ssl:false,
    connectionTimeoutMillis:5000,query_timeout:12000};
}

async function main() {
  const options=connectionOptions();
  let pg; try { pg=require('./sql/node_modules/pg'); } catch { throw new Error('Instale o cliente fixado: npm ci --prefix tests/sql --ignore-scripts'); }
  const dbName='nutri_finance_test_'+randomBytes(10).toString('hex');
  assert.match(dbName,/^nutri_finance_test_[0-9a-f]{20}$/);
  const clients=[]; let created=false;
  async function connect(database,name) {
    const c=new pg.Client({...options,database,application_name:name});
    await c.connect(); clients.push(c);
    await c.query("set statement_timeout='10s'; set lock_timeout='8s'; set idle_in_transaction_session_timeout='30s'");
    return c;
  }
  const admin=await connect(options.database,'nutri-finance-test-control');
  let observer,left,right;
  const check=async(name,fn)=>{await fn();checks++;console.log('OK '+name);};
  try {
    const version=(await admin.query("select version() description,current_setting('server_version_num')::int num")).rows[0];
    assert(version.num>=170000,'PostgreSQL 17 ou superior é obrigatório.');
    console.log(version.description);
    await admin.query('create database '+dbName); created=true;
    observer=await connect(dbName,'nutri-finance-test-observer');
    await observer.query(`do $$begin
      if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
      if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
      if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
      end$$;
      create schema auth; create schema private; create schema extensions;
      grant usage on schema public,auth,extensions to anon,authenticated,service_role;
      grant usage on schema private to authenticated;
      create extension pgcrypto with schema extensions;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;`);
    const roles=(await observer.query("select rolname,rolsuper,rolbypassrls from pg_roles where rolname in ('anon','authenticated')")).rows;
    assert.equal(roles.length,2); assert(roles.every(r=>!r.rolsuper&&!r.rolbypassrls),'Papéis clientes não podem ignorar RLS.');
    await observer.query(fs.readFileSync(path.join(release,'snapshot.sql'),'utf8'));
    await observer.query(fs.readFileSync(path.join(release,'supabase/migrations/20261011184245_nutri_manual_finance_ledger.sql'),'utf8'));
    await observer.query(`insert into auth.users(id,email,email_confirmed_at) values
      ('${A}','a@example.test',now()),('${B}','b@example.test',now()),('${PA}','pa@example.test',now()),('${PB}','pb@example.test',now());
      insert into public.clinics(id,owner_id,name,professional_name) values
      ('${CA}','${A}','Clínica sintética A','Profissional A'),('${CB}','${B}','Clínica sintética B','Profissional B');
      insert into public.patients(id,clinic_id,clinician_id,user_id,name,email,invite_code,invite_expires_at) values
      ('${RA}','${CA}','${A}','${PA}','Paciente A','pa@example.test',null,null),
      ('${RB}','${CB}','${B}','${PB}','Paciente B','pb@example.test',null,null);`);
    left=await connect(dbName,'nutri-finance-test-left'); right=await connect(dbName,'nutri-finance-test-right');
    const leftPid=(await left.query('select pg_backend_pid() pid')).rows[0].pid;
    const rightPid=(await right.query('select pg_backend_pid() pid')).rows[0].pid;
    assert.notEqual(leftPid,rightPid); console.log('PIDs independentes: '+leftPid+' e '+rightPid);
    const today=(await observer.query('select current_date::text as today')).rows[0].today;
    async function who(client,user=A) {
      await client.query('reset role'); await client.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
      await client.query('set role authenticated');
    }
    const command=async(client,data,operation=randomUUID())=>(await client.query('select public.nutri_finance_command($1,$2::jsonb) result',[operation,JSON.stringify(data)])).rows[0].result;
    const draft=(owner=A)=>({action:'create',clinic_id:owner===A?CA:CB,patient_id:owner===A?RA:RB,
      kind:'income',title:'Concorrência sintética',amount_cents:10000,due_on:today,competency_on:null});
    const pay=(e,amount,version=e.version)=>({action:'pay',entry_id:e.id,expected_version:version,amount_cents:amount,occurred_on:today,method:'manual'});
    const refund=(e,amount,version=e.version)=>({...pay(e,amount,version),action:'refund',reason:'Devolução sintética'});
    const fresh=async()=>{await who(left);await who(right);return(await command(left,draft())).entries[0];};
    function pending(fn) {
      const result={finished:false};
      result.promise=fn().then(value=>({value}),error=>({error})).then(value=>{result.finished=true;return value;});
      return result;
    }
    async function blocked(task,label) {
      const deadline=Date.now()+5000;
      while(Date.now()<deadline) {
        const row=(await observer.query('select $2::int=any(pg_blocking_pids($1::int)) blocked',[rightPid,leftPid])).rows[0];
        if(row.blocked){console.log('  Lock observado: '+label);return;}
        if(task.finished) throw new Error(label+': segunda conexão terminou sem disputar o lock esperado.');
        await pause(20);
      }
      throw new Error(label+': PostgreSQL não confirmou o bloqueio.');
    }
    async function row(entry) {
      return(await observer.query(`select e.version,e.status,e.amount_cents,
        coalesce(sum(v.amount_cents) filter(where v.kind in ('opening','payment')),0)::int received,
        coalesce(sum(v.amount_cents) filter(where v.kind='refund'),0)::int refunded,
        count(*) filter(where v.kind='payment')::int payments
        from public.financial_entries e join private.nutri_finance_events v on v.entry_id=e.id
        where e.id=$1 group by e.id`,[entry.id])).rows[0];
    }
    async function race(dataA,dataB,operationA=randomUUID(),operationB=randomUUID(),commit=true) {
      await left.query('begin');
      const winner=await command(left,dataA,operationA);
      const task=pending(()=>command(right,dataB,operationB));
      await blocked(task,dataA.action+'/'+dataB.action);
      await left.query(commit?'commit':'rollback');
      return {winner,loser:await task.promise};
    }

    await check('mesma operação concorrente retorna resposta única e um só pagamento',async()=>{
      const e=await fresh(),op=randomUUID(),data=pay(e,4000);
      const result=await race(data,data,op,op);
      assert.ifError(result.loser.error); assert.deepEqual(result.loser.value,result.winner);
      assert.deepEqual(await row(e),{version:2,status:'pending',amount_cents:'10000',received:4000,refunded:0,payments:1});
    });
    await check('mesmo UUID concorrente com payload diferente falha após esperar',async()=>{
      const e=await fresh(),op=randomUUID();
      const result=await race(pay(e,3000),pay(e,4000),op,op);
      assert.equal(result.loser.error?.code,'22023'); assert.equal((await row(e)).received,3000);
      assert.equal((await row(e)).payments,1);
    });
    await check('operações distintas na mesma versão: apenas uma confirma',async()=>{
      const e=await fresh();const result=await race(pay(e,6000),pay(e,6000));
      assert.equal(result.loser.error?.code,'40001');assert.equal((await row(e)).received,6000);
      assert.equal((await row(e)).version,2);assert.equal((await row(e)).payments,1);
    });
    await check('versão antecipada reconta saldo após lock e rejeita pagamento excessivo',async()=>{
      const e=await fresh();const result=await race(pay(e,6000),pay(e,5000,2));
      assert.equal(result.loser.error?.code,'22023');assert.equal((await row(e)).received,6000);
      const paid=(await command(right,pay(e,4000,2))).entries[0];
      assert.equal(paid.status,'paid');assert.equal(paid.received_cents,10000);assert.equal(paid.balance_cents,0);
      assert.equal((await row(e)).payments,2);
    });
    await check('devoluções concorrentes recontam líquido e impedem saldo negativo',async()=>{
      let e=await fresh();e=(await command(left,pay(e,10000))).entries[0];
      const result=await race(refund(e,7000),refund(e,4000,e.version+1));
      assert.equal(result.loser.error?.code,'22023');assert.equal((await row(e)).refunded,7000);
      const done=(await command(right,refund(e,3000,e.version+1))).entries[0];
      assert.equal(done.refunded_cents,10000);assert.equal(done.net_paid_cents,0);
    });
    await check('rollback libera retry da mesma operação sem eventos órfãos',async()=>{
      const e=await fresh(),op=randomUUID(),data=pay(e,4000);
      const result=await race(data,data,op,op,false);
      assert.ifError(result.loser.error);assert.equal(result.loser.value.entries[0].received_cents,4000);
      assert.equal((await row(e)).payments,1);assert.equal((await row(e)).version,2);
      const n=(await observer.query('select count(*)::int n from private.nutri_finance_operations where owner_id=$1 and operation_id=$2',[A,op])).rows[0].n;
      assert.equal(n,1);
    });
    await check('dono distinto não lê/grava entrada alheia nem compartilha resposta idempotente',async()=>{
      const e=await fresh(),op=randomUUID(); await left.query('begin');
      const winner=await command(left,pay(e,4000),op);
      await who(right,B);
      await assert.rejects(command(right,pay(e,4000),op),error=>error.code==='42501');
      const own=await command(right,draft(B),op);
      assert.equal(own.entries[0].owner_id,B);assert.notEqual(own.entries[0].id,winner.entries[0].id);
      const rows=(await right.query('select id from public.financial_entries')).rows;
      assert.deepEqual(rows,[{id:own.entries[0].id}]);
      await left.query('commit');
      assert.equal((await row(e)).received,4000);
    });
    console.log('PASS '+checks+' cenários Nutri com PostgreSQL real, duas conexões e bloqueios observados; sem produção/Auth HTTP.');
  } finally {
    // Bound statement/lock timeouts ensure failed races cannot hang cleanup.
    for(const client of clients.slice(1).reverse()) { try { await client.end(); } catch {} }
    try { if(created) await admin.query('drop database '+dbName+' with (force)'); }
    finally { await admin.end(); }
  }
}
main().catch(error=>{console.error('FAIL Nutri PostgreSQL real:',error.code||'',error.message);process.exitCode=1;});
