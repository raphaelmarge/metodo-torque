/* Real PostgreSQL only: independent connections + server-observed locks.
 * Uses the CI's existing disposable localhost service. No HTTP/JWT verification.
 * Never apply these Auth stubs or synthetic fixtures to Supabase/production.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { setTimeout: pause } = require('node:timers/promises');
const uid = n => `60000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const users = { admin: uid(1), finance: uid(2), finance2: uid(3), outsider: uid(4), admin2: uid(5) };
const sessions = { admin: uid(1001), finance: uid(1002), finance2: uid(1003), outsider: uid(1004), admin2: uid(1005) };
const account = uid(101);
const sources = [
  '../supabase/migrations/20260930193716_hq_referrals_ledger.sql',
  '../supabase/hq-referrals-payment-contract-proposal.sql',
  '../supabase/hq-ops-proposal.sql',
  '../supabase/hq-influencer-portal-proposal.sql'
];
let checks = 0, sequence = 0;
function ok(value, label) { assert.ok(value, label); checks++; console.log('OK ' + label); }
function equal(value, expected, label) { assert.deepEqual(value, expected, label); checks++; console.log('OK ' + label); }

function connectionOptions(raw = process.env.PGTESTURL) {
  if (!raw) throw new Error('Defina PGTESTURL para o PostgreSQL local descartavel do CI; consulte docs/HQ-HOMOLOGACAO-LOCAL.md.');
  let url;
  try { url = new URL(raw); } catch { throw new Error('PGTESTURL invalida; nenhuma conexao iniciada.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1', '[::1]'].includes(url.hostname) || url.search || url.hash) {
    throw new Error('PGTESTURL aceita somente 127.0.0.1 ou [::1], sem parametros ou fragmento; nunca use tunel ou banco real.');
  }
  if (!['', '/', '/postgres'].includes(url.pathname)) throw new Error('A conexao de controle deve usar somente o banco postgres da instancia descartavel.');
  return {
    host: url.hostname.replace(/^\[|\]$/g, ''), port: Number(url.port || 5432),
    user: decodeURIComponent(url.username || 'postgres'), password: decodeURIComponent(url.password),
    database: 'postgres', ssl: false, connectionTimeoutMillis: 5000, query_timeout: 12000
  };
}

// Real Auth belongs to the later HTTP suite. These stubs deliberately cover only
// database authorization with controlled claims; no tokens/credentials are made.
const fixtureSQL = `
  do $$begin
    if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
  end$$;
  create schema auth;
  grant usage on schema auth,public to anon,authenticated,service_role;
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb
  $$;
  create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
  create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz,raw_user_meta_data jsonb default '{}');
  create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);
  create table public.saas_admins(user_id uuid primary key references auth.users(id));
  create table public.academias(id uuid primary key,nome text,criada timestamptz default now(),assinatura_status text);
  create table public.saas_clientes(academia_id uuid primary key references public.academias(id),tipo text,status text);
  alter table public.saas_admins enable row level security;
  alter table public.academias enable row level security;
  alter table public.saas_clientes enable row level security;
  create function public.hq_sou_admin() returns boolean language sql security definer set search_path='' as $$
    select exists(select 1 from public.saas_admins where user_id=auth.uid())
  $$;
`;

async function main() {
  const options = connectionOptions();
  // A missing or changed Equipe release must fail closed, without falling back
  // to proposal SQL. The shared loader validates its exact allowlist/LF/hashes.
  const teamPackage = require('./hq-auth-ci/package-input.cjs').loadPackages().team;
  assert.ok(teamPackage && teamPackage.migrations.length === 1, 'Pacote versionado Equipe obrigatorio');
  let pg;
  try { pg = require('./sql/node_modules/pg'); }
  catch { throw new Error('Cliente SQL ausente: npm ci --prefix tests/sql --ignore-scripts --no-audit --no-fund'); }
  const database = 'torque_hq_test_' + crypto.randomBytes(10).toString('hex');
  assert.match(database, /^torque_hq_test_[0-9a-f]{20}$/);
  const clients = [];
  let created = false, control;
  async function connect(db, name) {
    const client = new pg.Client({ ...options, database: db, application_name: name });
    await client.connect(); clients.push(client);
    await client.query("set statement_timeout='10s'; set lock_timeout='8s'; set idle_in_transaction_session_timeout='30s'; set default_transaction_isolation='read committed'");
    return client;
  }
  try {
    control = await connect('postgres', 'torque-hq-test-control');
    const version = (await control.query("select version() version,current_setting('server_version_num')::int num")).rows[0];
    ok(version.num >= 150000, 'PostgreSQL real 15+'); console.log(version.version);
    await control.query('create database ' + database); created = true;
    const observer = await connect(database, 'torque-hq-test-observer');
    await observer.query(fixtureSQL);
    const roles = (await observer.query("select rolname,rolsuper,rolbypassrls from pg_roles where rolname in ('anon','authenticated')")).rows;
    ok(roles.length === 2 && roles.every(r => !r.rolsuper && !r.rolbypassrls), 'Papeis clientes nao ignoram RLS');
    for (const name of Object.keys(users)) {
      await observer.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,'2020-01-01')", [users[name], name + '@example.test']);
      await observer.query('insert into auth.sessions(id,user_id) values($1,$2)', [sessions[name], users[name]]);
    }
    await observer.query('insert into public.saas_admins values($1),($2)', [users.admin,users.admin2]);
    await observer.query("insert into public.academias(id,nome,assinatura_status) values($1,'Conta sintetica','trial')", [account]);
    await observer.query("insert into public.saas_clientes values($1,'personal','trial')", [account]);
    for (const source of sources) await observer.query(fs.readFileSync(path.join(__dirname, source), 'utf8'));
    equal((await observer.query('select count(*)::int n from torque_hq.staff')).rows[0].n, 0, 'Instalacao nao concede staff');
    for (const migration of teamPackage.migrations) await observer.query(migration);
    equal((await observer.query('select staff_enabled from torque_hq.settings where id')).rows[0].staff_enabled,false,'Pacote Equipe preserva gate desligado');
    equal((await observer.query('select count(*)::int n from torque_hq.team_registry')).rows[0].n,0,'Pacote Equipe nao inventa cadastros');
    await observer.query("insert into torque_hq.staff(user_id,role,enabled) values($1,'finance',true),($2,'finance',true)", [users.finance, users.finance2]);
    const left = await connect(database, 'torque-hq-test-left');
    const right = await connect(database, 'torque-hq-test-right');
    const leftPid = Number((await left.query('select pg_backend_pid() pid')).rows[0].pid);
    const rightPid = Number((await right.query('select pg_backend_pid() pid')).rows[0].pid);
    const observerPid = Number((await observer.query('select pg_backend_pid() pid')).rows[0].pid);
    ok(new Set([leftPid,rightPid,observerPid]).size === 3, 'Conexoes independentes: ' + [leftPid,rightPid,observerPid].join(', '));

    async function actor(client, name, role = 'authenticated') {
      assert.ok(['authenticated','anon'].includes(role));
      await client.query('reset role');
      await client.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify(name ? { sub:users[name],session_id:sessions[name],role:'authenticated' } : {})]);
      await client.query('set role ' + role);
    }
    const envelope = (type,payload,key = 'hq-concurrency-' + (++sequence)) => ({ type,payload,idempotencyKey:key,reason:'Teste sintetico de concorrencia' });
    const command = async (client,input) => (await client.query('select public.hq_ops_command($1::jsonb) value', [JSON.stringify(input)])).rows[0].value;
    const snapshot = async client => (await client.query('select public.hq_ops_snapshot() value')).rows[0].value;
    const scalar = async (sql,args = []) => Object.values((await observer.query(sql,args)).rows[0])[0];
    const keyCounts = async key => (await observer.query(`select
      (select count(*)::int from torque_hq.commands where idempotency_key=$1) commands,
      (select count(*)::int from torque_hq.audit where idempotency_key=$1) audit`, [key])).rows[0];
    async function denied(run,code,label) { await assert.rejects(run,e => e.code === code,label); ok(true,label); }
    function pending(run) {
      const out = { finished:false };
      out.result = run().then(value => ({value}),error => ({error})).then(result => { out.finished=true; return result; });
      return out;
    }
    async function blocked(work,label) {
      const deadline = Date.now()+5000;
      while (Date.now()<deadline) {
        if ((await observer.query('select $2::int=any(pg_blocking_pids($1::int)) blocked',[rightPid,leftPid])).rows[0].blocked) {
          ok(true,label + ': lock confirmado por pg_blocking_pids'); return;
        }
        if (work.finished) throw new Error(label + ': terminou sem disputar o lock esperado');
        await pause(20); // Poll only; server lock, not elapsed sleep, proves concurrency.
      }
      throw new Error(label + ': bloqueio nao observado no servidor');
    }
    async function compete(first,second,{ rollback=false,label,send=command }) {
      await left.query('begin');
      try {
        const winner = await send(left,first);
        const work = pending(() => send(right,second));
        await blocked(work,label);
        await left.query(rollback ? 'rollback' : 'commit');
        return { winner, ...(await work.result) };
      } catch (error) { await left.query('rollback').catch(() => {}); throw error; }
    }
    async function createDocument(kind,totalCents=1000) {
      const payload = { totalCents,dueDate:'2026-10-21',label:'Documento sintetico' };
      if (kind==='invoice') payload.accountId=account; else payload.payee='Fornecedor sintetico';
      return command(left,envelope(kind+'.create',payload));
    }
    const payment = (kind,id,amountCents,reference,key) => envelope(kind+'.recordPayment',{id,amountCents,paidAt:'2020-01-01',reference},key);

    await actor(left,'finance');
    await denied(()=>snapshot(left),'42501','Instalacao minima nega staff habilitado enquanto gate esta desligado');
    await actor(left,'admin');
    equal((await snapshot(left)).role,'admin','Instalacao minima preserva admin existente');
    await observer.query('update torque_hq.settings set staff_enabled=true where id'); // Explicit extended-mode fixture.
    await actor(left,'admin','anon');
    await denied(() => snapshot(left),'42501','Anon nao chama snapshot mesmo com sub de admin controlado');
    await actor(left,null); await denied(() => snapshot(left),'42501','Authenticated sem sub bloqueado');
    await actor(left,'outsider'); await denied(() => snapshot(left),'42501','Usuario comum bloqueado');
    await actor(left,'finance'); await actor(right,'finance');
    await denied(() => left.query('select * from torque_hq.payments'),'42501','Financeiro nao acessa tabela privada diretamente');

    const same = envelope('invoice.create',{accountId:account,totalCents:1000,dueDate:'2026-10-21'},'same-key-concurrent');
    let race = await compete(same,same,{label:'Mesmo ator e chave'});
    assert.ifError(race.error);
    ok(race.value.replayed && race.value.id===race.winner.id,'Replay concorrente retorna o mesmo ID');
    equal(await keyCounts(same.idempotencyKey),{commands:1,audit:1},'Replay produz uma reserva e uma auditoria');
    equal(await scalar('select count(*)::int from torque_hq.invoices where id=$1',[race.winner.id]),1,'Replay produz uma fatura');

    const divergent = {...same,idempotencyKey:'divergent-concurrent'};
    race=await compete(divergent,{...divergent,payload:{...divergent.payload,totalCents:2000}},{label:'Mesma chave com conteudo divergente'});
    equal(race.error?.code,'22023','Payload divergente falha depois do commit vencedor');
    equal(await keyCounts(divergent.idempotencyKey),{commands:1,audit:1},'Divergencia nao duplica reserva ou auditoria');

    const reverted={...same,idempotencyKey:'rollback-concurrent'};
    race=await compete(reverted,reverted,{rollback:true,label:'Mesmo comando aguardando rollback'});
    assert.ifError(race.error);
    ok(!race.value.replayed && race.value.id!==race.winner.id,'Rollback permite uma nova confirmacao sem reutilizar efeito desfeito');
    equal(await scalar('select count(*)::int from torque_hq.invoices where id=$1',[race.winner.id]),0,'Fatura desfeita nao existe');
    equal(await keyCounts(reverted.idempotencyKey),{commands:1,audit:1},'Somente efeito confirmado depois do rollback e auditado');

    // Different operators and keys must still serialize on the financial object.
    await actor(right,'finance2');
    for (const kind of ['invoice','expense']) {
      const doc=await createDocument(kind);
      const first=payment(kind,doc.id,700,kind+'-first',kind+'-overpay-winner');
      const second=payment(kind,doc.id,700,kind+'-second',kind+'-overpay-loser');
      race=await compete(first,second,{label:kind+' duas baixas acima do saldo'});
      equal(race.error?.code,'P0001',kind+' rejeita segunda baixa acima do saldo');
      assert.match(race.error.message,/excede saldo/);
      const table=kind==='invoice'?'payments':'expense_payments', field=kind==='invoice'?'invoice_id':'expense_id';
      equal(await scalar('select sum(amount_cents)::int from torque_hq.'+table+' where '+field+'=$1',[doc.id]),700,kind+' preserva total confirmado');
      equal(await keyCounts(second.idempotencyKey),{commands:0,audit:0},kind+' falha reverte reserva e auditoria');
      await command(right,payment(kind,doc.id,300,kind+'-remainder',kind+'-remainder-key'));
      equal(await scalar('select status from torque_hq.'+(kind==='invoice'?'invoices':'expenses')+' where id=$1',[doc.id]),'paid',kind+' fecha apenas no total exato');

      const receipt=await createDocument(kind,2000);
      const receiptA=payment(kind,receipt.id,500,kind+'-same-receipt',kind+'-receipt-first');
      const receiptB=payment(kind,receipt.id,500,kind+'-same-receipt',kind+'-receipt-second');
      race=await compete(receiptA,receiptB,{label:kind+' mesmo comprovante e chaves distintas'});
      equal(race.error?.code,'23505',kind+' comprovante repetido falha por unicidade');
      equal(await scalar('select count(*)::int from torque_hq.'+table+' where '+field+'=$1',[receipt.id]),1,kind+' nao duplica comprovante');
      equal(await keyCounts(receiptB.idempotencyKey),{commands:0,audit:0},kind+' comprovante rejeitado nao deixa reserva');
    }

    // No global financial lock: independent documents can commit while A stays open.
    const independentA=await createDocument('invoice'), independentB=await createDocument('invoice');
    await left.query('begin');
    try {
      await command(left,payment('invoice',independentA.id,100,'independent-A','independent-A-key'));
      const result=await command(right,payment('invoice',independentB.id,100,'independent-B','independent-B-key'));
      ok(result.ok,'Documentos independentes nao esperam uma transacao financeira global');
      await left.query('commit');
    } catch(error) { await left.query('rollback').catch(()=>{}); throw error; }

    // Equipe is only an administrative registry. Test its own idempotency and
    // row-version locks using the same independent backend connections, while
    // the staff gate is explicitly off. Auth below is still this DB's SQL stub.
    await observer.query('update torque_hq.settings set staff_enabled=false where id');
    const teamCommand = async (client,input) => (await client.query('select public.hq_team_command($1::jsonb) value',[JSON.stringify(input)])).rows[0].value;
    const teamSnapshot = async client => (await client.query('select public.hq_team_snapshot() value')).rows[0].value;
    const teamCounts = async (key,who=users.admin) => (await observer.query(`select
      (select count(*)::int from torque_hq.team_registry_commands where actor_id=$2 and idempotency_key=$1) commands,
      (select count(*)::int from torque_hq.team_registry_audit where actor_id=$2 and idempotency_key=$1) audit`,[key,who])).rows[0];
    const protectedState = async () => scalar(`select jsonb_build_object(
      'authUsers',(select md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'[]')) from auth.users t),
      'authSessions',(select md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'[]')) from auth.sessions t),
      'admins',(select md5(coalesce(jsonb_agg(to_jsonb(t) order by user_id)::text,'[]')) from public.saas_admins t),
      'gate',(select md5(jsonb_agg(to_jsonb(t))::text) from torque_hq.settings t),
      'staff',(select md5(coalesce(jsonb_agg(to_jsonb(t) order by user_id)::text,'[]')) from torque_hq.staff t),
      'scope',(select md5(coalesce(jsonb_agg(to_jsonb(t) order by user_id,account_id)::text,'[]')) from torque_hq.staff_account_scope t),
      'opsCommands',(select count(*) from torque_hq.commands),'opsAudit',(select count(*) from torque_hq.audit),
      'commissions',(select count(*) from hq_referrals_private.commissions)
    )`);
    const protectedBefore = await protectedState();
    await actor(left,'admin'); await actor(right,'admin');
    const teamSame = envelope('team.create',{name:'Pessoa sintetica concorrente',proposedRole:'viewer'},'team-same-key');
    race = await compete(teamSame,teamSame,{send:teamCommand,label:'Equipe mesmo ator e chave'});
    assert.ifError(race.error);
    ok(race.value.replayed && race.value.id===race.winner.id && race.value.member.version===1,'Equipe replay concorrente preserva ID e versao');
    equal(await teamCounts(teamSame.idempotencyKey),{commands:1,audit:1},'Equipe replay confirma exatamente um comando e uma auditoria');
    equal(await scalar('select count(*)::int from torque_hq.team_registry where id=$1',[race.winner.id]),1,'Equipe replay cria somente um cadastro');
    const memberId = race.winner.id;

    const teamDifferent = {...teamSame,idempotencyKey:'team-divergent-key'};
    race = await compete(teamDifferent,{...teamDifferent,payload:{...teamDifferent.payload,name:'Outro cadastro sintetico'}},{send:teamCommand,label:'Equipe chave igual e conteudo divergente'});
    equal(race.error?.code,'22023','Equipe payload divergente falha apos commit vencedor');
    equal(await teamCounts(teamDifferent.idempotencyKey),{commands:1,audit:1},'Equipe divergencia nao duplica comando nem auditoria');
    equal(await scalar('select name from torque_hq.team_registry where id=$1',[race.winner.id]),teamDifferent.payload.name,'Equipe divergencia nao sobrescreve cadastro vencedor');

    const teamRollback = {...teamSame,idempotencyKey:'team-rollback-key'};
    race = await compete(teamRollback,teamRollback,{send:teamCommand,rollback:true,label:'Equipe aguardando rollback da mesma chave'});
    assert.ifError(race.error);
    ok(!race.value.replayed && race.value.id!==race.winner.id,'Equipe rollback libera chave sem reaproveitar cadastro desfeito');
    equal(await scalar('select count(*)::int from torque_hq.team_registry where id=$1',[race.winner.id]),0,'Equipe cadastro desfeito nao sobrevive ao rollback');
    equal(await teamCounts(teamRollback.idempotencyKey),{commands:1,audit:1},'Equipe so audita o comando confirmado apos rollback');

    await actor(right,'admin2');
    const teamEditA = envelope('team.update',{id:memberId,expectedVersion:1,name:'Edicao vencedora sintetica'},'team-version-winner');
    const teamEditB = envelope('team.update',{id:memberId,expectedVersion:1,name:'Edicao concorrente sintetica'},'team-version-loser');
    race = await compete(teamEditA,teamEditB,{send:teamCommand,label:'Equipe dois administradores editam a mesma versao'});
    equal(race.error?.code,'40001','Equipe segunda edicao rejeita versao desatualizada');
    equal((await observer.query('select version,name,updated_by from torque_hq.team_registry where id=$1',[memberId])).rows[0],
      {version:2,name:teamEditA.payload.name,updated_by:users.admin},'Equipe conserva os campos, versao e ator vencedores');
    equal(await teamCounts(teamEditA.idempotencyKey),{commands:1,audit:1},'Equipe edicao vencedora tem uma auditoria');
    equal(await teamCounts(teamEditB.idempotencyKey,users.admin2),{commands:0,audit:0},'Equipe conflito reverte reserva idempotente e auditoria');
    equal(await scalar('select count(*)::int from torque_hq.team_registry_audit where object_id=$1',[memberId]),2,'Equipe cadastro e unica edicao confirmada produzem duas auditorias');
    const teamRetriedEdit = {...teamEditB,payload:{...teamEditB.payload,expectedVersion:2}};
    const updated = await teamCommand(right,teamRetriedEdit);
    ok(!updated.replayed && updated.member.version===3,'Equipe chave de edicao rejeitada pode ser reenviada com versao atual');
    equal(await teamCounts(teamRetriedEdit.idempotencyKey,users.admin2),{commands:1,audit:1},'Equipe reenvio corrigido confirma exatamente uma vez');

    const teamReview = envelope('team.review',{id:memberId,expectedVersion:3,reviewStatus:'approved'},'team-review-winner');
    const teamStatus = envelope('team.setStatus',{id:memberId,expectedVersion:3,status:'inactive'},'team-status-loser');
    race = await compete(teamReview,teamStatus,{send:teamCommand,label:'Equipe revisao e inativacao disputam mesma versao'});
    equal(race.error?.code,'40001','Equipe inativacao concorrente nao sobrescreve revisao confirmada');
    ok(race.winner.member.reviewStatus==='approved' && race.winner.member.version===4 && race.winner.member.effectiveAccess===false && race.winner.accessGranted===false,'Equipe aprovacao concorrente registra revisao sem conceder acesso');
    equal(await teamCounts(teamReview.idempotencyKey),{commands:1,audit:1},'Equipe revisao confirmada e auditada uma vez');
    equal(await teamCounts(teamStatus.idempotencyKey,users.admin2),{commands:0,audit:0},'Equipe inativacao rejeitada nao reserva chave nem auditoria');

    // Revocation takes effect after its commit, on the next RPC, including a
    // previously successful command's replay. It does not cancel in-flight RPCs.
    const teamBeforeRevoke = await scalar('select count(*)::int from torque_hq.team_registry_commands');
    await observer.query('delete from public.saas_admins where user_id=$1',[users.admin2]);
    await denied(()=>teamSnapshot(right),'42501','Equipe administrador revogado perde leitura na conexao existente');
    await denied(()=>teamCommand(right,teamRetriedEdit),'42501','Equipe administrador revogado nao obtem replay antigo');
    await denied(()=>teamCommand(right,envelope('team.update',{id:memberId,expectedVersion:4,name:'Tentativa negada'})),'42501','Equipe administrador revogado nao envia comando novo');
    equal(await scalar('select count(*)::int from torque_hq.team_registry_commands'),teamBeforeRevoke,'Equipe revogacao nao deixa reserva de comando');
    equal((await teamSnapshot(left)).currentUserId,users.admin,'Equipe revogacao preserva outro administrador autorizado');
    await observer.query('insert into public.saas_admins values($1)',[users.admin2]); // Restore only the test's own authority fixture.
    equal(await protectedState(),protectedBefore,'Equipe preserva Auth, autoridades, staff, scopes, gate e dados OPS/ledger');
    equal(await scalar(`select count(*)::int from (
      select c.actor_id,c.idempotency_key from torque_hq.team_registry_commands c
      left join torque_hq.team_registry_audit a using(actor_id,idempotency_key)
      group by c.actor_id,c.idempotency_key having count(a.id)<>1
    ) inconsistent`),0,'Equipe cada comando confirmado possui exatamente uma auditoria');
    ok(await scalar('select bool_and(result is not null) from torque_hq.team_registry_commands'),'Equipe nenhuma reserva idempotente permanece incompleta');
    await observer.query('update torque_hq.settings set staff_enabled=true where id'); // Restore prior OPS extended-mode fixture only.
    await actor(left,'finance'); await actor(right,'finance2');

    // This boundary is deliberately AFTER revocation commits, not cancellation of
    // a command already authorized/in flight before that commit.
    const countsBefore=await scalar('select count(*)::int from torque_hq.commands');
    await observer.query('update torque_hq.staff set enabled=false where user_id=$1',[users.finance]);
    await denied(()=>snapshot(left),'42501','Revogacao staff vale na proxima RPC da conexao existente');
    await denied(()=>command(left,same),'42501','Revogado nao obtem replay de chave antiga');
    await denied(()=>command(left,envelope('invoice.create',same.payload)),'42501','Revogado nao grava com chave nova');
    equal(await scalar('select count(*)::int from torque_hq.commands'),countsBefore,'Revogacao nao deixa comando reservado');
    equal((await snapshot(right)).role,'finance','Revogacao nao afeta outro operador autorizado');
    await actor(left,'admin');
    equal((await left.query('select public.hq_referrals_snapshot() value')).rows[0].value.campaign.enabled,false,'Integracao preserva campanha desligada');
    await observer.query('delete from auth.sessions where id=$1',[sessions.admin]);
    await denied(()=>left.query('select public.hq_influencer_admin_snapshot()'),'IP401','Portal recusa sessao revogada com claims antigos');
    await observer.query('delete from public.saas_admins where user_id=$1',[users.admin]);
    await denied(()=>snapshot(left),'42501','Remocao admin bloqueia HQ na proxima RPC');
    equal(await scalar('select count(*)::int from hq_referrals_private.commissions'),0,'Baixas manuais nao geram comissao');
    equal(await scalar('select count(*)::int from torque_hq.commands'),await scalar('select count(*)::int from torque_hq.audit'),'Cada comando confirmado tem exatamente uma auditoria');
    ok(await scalar('select bool_and(result is not null) from torque_hq.commands'),'Nenhuma reserva idempotente fica incompleta');
    console.log('PASS '+checks+' verificacoes HQ em PostgreSQL real; Auth HTTP/JWT/MFA fora deste escopo.');
  } finally {
    // Only clients and the random database created by this run are removed.
    for (const client of clients.slice(1).reverse()) {
      try { await client.query('rollback'); } catch { /* best effort on failed sessions */ }
      try { await client.end(); } catch { /* owned connection only */ }
    }
    if (control) {
      try { if (created) await control.query('drop database '+database+' with (force)'); }
      finally { await control.end(); }
    }
  }
}

module.exports={ connectionOptions,fixtureSQL,sources };
if (require.main===module) main().catch(error=>{
  console.error('FAIL HQ PostgreSQL real:',error.code||'',error.message);
  process.exitCode=1;
});
