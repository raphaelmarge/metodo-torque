/* Disposable PGlite activation/recovery proof. No network, remote DB, Auth
 * credentials, deployment or production records. SQL notification delivery here
 * does not certify that a real PostgREST instance refreshed its schema cache.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PGlite } = require('./runtime/node_modules/@electric-sql/pglite');
const Data = require('../assets/hq-ops-data.js');
const ROOT = path.resolve(__dirname, '..');
const LF = text => text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const read = file => LF(fs.readFileSync(path.join(ROOT, file), 'utf8'));
const canonical = read('supabase/hq-ops-proposal.sql');
const suspend = read('supabase/rollback/hq-ops-suspend.sql');
const resume = read('supabase/rollback/hq-ops-resume.sql');
const uid = n => '62000000-0000-4000-8000-' + String(n).padStart(12, '0');
const USERS = { admin: uid(1), staff: uid(2), outsider: uid(3) };
const ACCOUNT = uid(101);
const LEGACY = ['hq_kpis', 'hq_clientes', 'hq_receita_mensal', 'hq_suporte_threads', 'hq_erros', 'hq_saude', 'hq_uso'];
let checks = 0;
async function test(label, fn) { await fn(); console.log('OK ' + (++checks) + ' - ' + label); }
async function denied(fn, code) { await assert.rejects(fn, error => error.code === code); }
function migrationInput() {
  const folder = path.join(ROOT, 'supabase/releases/hq-admin-minimal');
  const file = path.join(folder, 'manifest.json');
  assert(fs.existsSync(file), 'isolated versioned package required but not generated yet');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  assert.equal(manifest.schemaVersion, 1); assert.equal(manifest.mode, 'existing-admin-only');
  assert.equal(manifest.baseCommit, 'b05222a2852bd1e96d9a91804d3cd5bdd4f59d22');
  assert.equal(manifest.migration.source, 'supabase/hq-ops-proposal.sql');
  assert.match(manifest.migration.file, /^migrations\/[0-9]+_hq_ops_admin_minimal\.sql$/);
  assert.deepEqual(manifest.migrationAllowlist, [manifest.migration.file]);
  assert.equal(manifest.staffEnabled, false);
  const actual = fs.readdirSync(path.join(folder, 'migrations')).filter(f => f.endsWith('.sql')).sort();
  assert.deepEqual(actual, [path.basename(manifest.migration.file)], 'minimum package must contain exactly the allowlisted OPS migration');
  const sql = LF(fs.readFileSync(path.join(folder, manifest.migration.file), 'utf8'));
  assert.equal(sql, canonical, 'versioned migration must match the reviewed canonical SQL after LF normalization');
  assert.equal(sha(sql), manifest.migration.sha256);
  for (const [key, expected] of [['suspend', suspend], ['resume', resume]]) {
    const rollback = manifest.rollback[key];
    assert.equal(rollback.source, 'supabase/rollback/hq-ops-' + key + '.sql');
    assert.equal(rollback.file, 'rollback/hq-ops-' + key + '.sql');
    const packaged = LF(fs.readFileSync(path.join(folder, rollback.file), 'utf8'));
    assert.equal(packaged, expected, 'packaged rollback must match its canonical source');
    assert.equal(sha(packaged), rollback.sha256);
  }
  assert(!/hq_referrals_private|hq_influencer_private/.test(sql), 'OPS minimum cannot install referrals or the partner portal');
  return { sql, manifest, mode: 'isolated-versioned-ops-only' };
}

async function fixture(db) {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;
    create table public.saas_admins(user_id uuid primary key references auth.users(id));
    create table public.academias(id uuid primary key,nome text,criada timestamptz default now(),assinatura_status text);
    create table public.saas_clientes(academia_id uuid primary key references public.academias(id),tipo text,status text);
    alter table public.saas_admins enable row level security;
    alter table public.academias enable row level security;
    alter table public.saas_clientes enable row level security;
    create function public.hq_sou_admin() returns boolean language sql security definer set search_path='' as $$
      select exists(select 1 from public.saas_admins where user_id=auth.uid())
    $$;
    revoke all on function public.hq_sou_admin() from public,anon,service_role;
    grant execute on function public.hq_sou_admin() to authenticated;
  `);
  for (const id of Object.values(USERS)) await db.query('insert into auth.users values($1)', [id]);
  await db.query('insert into public.saas_admins values($1)', [USERS.admin]);
  await db.query("insert into public.academias values($1,'Conta sintetica de ativacao','2026-09-01T12:00:00Z','trial')", [ACCOUNT]);
  await db.query("insert into public.saas_clientes values($1,'personal','trial')", [ACCOUNT]);
  for (const name of LEGACY) {
    const result = name === 'hq_kpis' ? '{}' : name === 'hq_uso' ? '{"academias":0,"recursos":[]}' : '[]';
    await db.exec(`create function public.${name}() returns jsonb language sql security definer set search_path='' as $$ select '${result}'::jsonb $$;
      revoke all on function public.${name}() from public,anon,service_role;
      grant execute on function public.${name}() to authenticated;`);
  }
}

async function run() {
  const input = migrationInput();
  await test('pacote mínimo usa apenas a migração OPS allowlisted e fonte canônica', async () => {
    assert(!/\b(?:drop\s+(?:table|schema)|truncate|cascade)\b/i.test(suspend));
    assert(!/\b(?:drop\s+(?:table|schema)|truncate|cascade)\b/i.test(resume));
    assert(!/\b(?:insert|delete)\s+(?:into|from)\b/i.test(suspend + '\n' + resume));
    assert(/notify\s+pgrst\s*,\s*'reload schema'/i.test(input.sql));
    console.log('   installation mode: ' + input.mode + (input.manifest ? '; ' + input.manifest.migration.file : '; release manifest not generated yet'));
  });
  const db = new PGlite();
  let stopNotifications;
  const notifications = [];
  async function owner() { await db.exec('reset role'); }
  async function actor(user = 'admin', role = 'authenticated') {
    await owner(); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [USERS[user] || '']); await db.exec('set role ' + role);
  }
  async function scalar(sql, params = []) { return Object.values((await db.query(sql, params)).rows[0])[0]; }
  async function ownerQuery(sql, params = []) { await owner(); return db.query(sql, params); }
  async function script(sql) { await owner(); await db.exec(sql); }
  async function scriptRejected(sql, code = '55000', role) {
    if (role) await actor('admin', role); else await owner();
    try { await denied(() => db.exec(sql), code); } finally { await db.exec('rollback'); await owner(); }
  }
  async function rpc(name, args) {
    assert(/^[a-z_]+$/.test(name));
    return (await db.query('select public.' + name + '(' + (args === undefined ? '' : '$1::jsonb') + ') as value', args === undefined ? [] : [args])).rows[0].value;
  }
  const payload = { type: 'lead.create', payload: { name: 'Oportunidade sintetica preservada', stage: 'novo' }, idempotencyKey: 'activation-fixed-lead', reason: 'Teste local de preservacao' };
  async function command(type, body, key) { return rpc('hq_ops_command', { type, payload: body, idempotencyKey: key, reason: 'Teste local de preservacao' }); }
  async function tableData(schemas = ['torque_hq', 'public']) {
    await owner();
    const tables = (await db.query("select n.nspname schema,c.relname name from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=any($1::text[]) and c.relkind='r' order by 1,2", [schemas])).rows;
    const result = {};
    for (const table of tables) {
      assert(/^[a-z_]+$/.test(table.schema + table.name));
      if (table.name === 'settings') continue;
      result[table.schema + '.' + table.name] = await scalar(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from ${table.schema}.${table.name} t`);
    }
    return result;
  }
  async function functionState(schema = 'public') {
    await owner();
    return (await db.query(`select p.oid,p.proname,p.prosrc,p.proowner,p.prosecdef,p.proconfig,pg_get_function_identity_arguments(p.oid) args
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=$1 and (p.proname like 'hq_ops_%' or p.proname like 'suspended_ops_%') order by p.oid`, [schema])).rows;
  }
  async function privateChecks() {
    await owner();
    for (const role of ['anon', 'authenticated', 'service_role']) {
      assert.equal(await scalar("select has_schema_privilege($1,'torque_hq','usage')", [role]), false);
      const rows = (await db.query(`select has_table_privilege($1,c.oid,'SELECT,INSERT,UPDATE,DELETE') accessible
        from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='torque_hq' and c.relkind='r'`, [role])).rows;
      assert(rows.every(row => row.accessible === false));
    }
  }
  function sqlClient(user) {
    const calls = [];
    return {
      calls,
      auth: { getSession: async () => ({ data: { session: { user: { id: USERS[user] } } } }) },
      rpc: async (name, args) => {
        calls.push(name);
        try { return { data: await rpc(name, args && args.p_command) }; }
        catch (error) { return { error: { code: error.code, message: error.message } }; }
      }
    };
  }
  let installedFunctions, savedData, lead, installNotifications;
  try {
    await fixture(db);
    stopNotifications = await db.listen('pgrst', value => notifications.push(value));
    await test('suspender ou retomar antes da instalação falha sem criar schema', async () => {
      await scriptRejected(suspend); await scriptRejected(resume);
      assert.equal(await scalar("select to_regnamespace('torque_hq')"), null);
      assert.equal(notifications.length, 0);
    });
    await test('instalação mínima preserva admin existente, não cria staff/ledger/portal e emite reload', async () => {
      await script(input.sql);
      assert.deepEqual((await db.query('select * from torque_hq.settings')).rows, [{ id: true, staff_enabled: false }]);
      assert.equal(await scalar('select count(*)::int from torque_hq.staff'), 0);
      assert.equal(await scalar('select count(*)::int from public.saas_admins'), 1);
      assert.equal(await scalar("select to_regnamespace('hq_referrals_private')"), null);
      assert.equal(await scalar("select to_regnamespace('hq_influencer_private')"), null);
      assert.equal(await scalar("select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'hq_ops_%'"), 2);
      assert.equal(notifications.at(-1), 'reload schema'); installNotifications = notifications.length;
      await privateChecks(); installedFunctions = await functionState();
    });
    await test('somente admin existente acessa; staff enabled continua negado com gate false', async () => {
      await ownerQuery("insert into torque_hq.staff(user_id,role,enabled) values($1,'support',true)", [USERS.staff]);
      await ownerQuery('insert into torque_hq.staff_account_scope(user_id,account_id,granted_by) values($1,$2,$3)', [USERS.staff, ACCOUNT, USERS.admin]);
      for (const role of ['anon', 'service_role']) { await actor('admin', role); await denied(() => rpc('hq_ops_snapshot'), '42501'); }
      for (const user of ['staff', 'outsider', '']) { await actor(user); await denied(() => rpc('hq_ops_snapshot'), '42501'); await denied(() => rpc('hq_ops_command', payload), '42501'); }
      await actor('admin'); const snapshot = await rpc('hq_ops_snapshot');
      assert.equal(snapshot.role, 'admin'); assert.equal(snapshot.meta.commandsAvailable, true);
      assert.equal(snapshot.sources.cases.scope, 'opsOnly');
      assert.equal(snapshot.sources.subscriptions.status, 'unavailable');
      await denied(() => db.query('select * from torque_hq.staff_account_scope'), '42501');
    });
    await test('dados manuais, atendimento, comandos e auditoria são reais somente no banco efêmero', async () => {
      await actor('admin'); lead = await rpc('hq_ops_command', payload);
      const invoice = await command('invoice.create', { accountId: ACCOUNT, label: 'Cobranca sintetica', dueDate: '2026-10-21', totalCents: 4990 }, 'activation-invoice');
      await command('invoice.recordPayment', { id: invoice.id, amountCents: 2994, paidAt: '2020-01-01', reference: 'activation-local-only' }, 'activation-payment');
      const ticket = await command('case.create', { accountId: ACCOUNT, subject: 'Caso sintetico preservado', channel: 'manual', priority: 'media' }, 'activation-case');
      await command('case.message', { id: ticket.id, text: 'Rascunho de teste nao enviado', visibility: 'customer' }, 'activation-message');
      await command('subscription.requestCancel', { accountId: ACCOUNT, note: 'Pedido sem efeito externo' }, 'activation-cancel-request');
      const s = await rpc('hq_ops_snapshot');
      assert.equal(s.payments[0].amountCents, 2994); assert.equal(s.cases[0].messages[0].delivery, 'not_sent');
      assert.equal(s.subscriptionRequests[0].status, 'requested');
      savedData = await tableData(); assert(savedData['torque_hq.audit'].length >= 6);
    });
    await test('usuário de API não pode executar scripts de suspensão/retomada nem mudar o gate', async () => {
      await scriptRejected(suspend, '42501', 'authenticated');
      await scriptRejected(resume, '42501', 'authenticated');
      assert.deepEqual(await functionState(), installedFunctions);
      assert.deepEqual(await tableData(), savedData);
      await actor('admin'); await denied(() => db.exec('update torque_hq.settings set staff_enabled=true'), '42501');
    });
    await test('reaplicar instalação falha atomicamente, sem duplicar dados, funções ou auditoria', async () => {
      await scriptRejected(input.sql, '42P07');
      assert.deepEqual(await functionState(), installedFunctions);
      assert.deepEqual(await tableData(), savedData);
      assert.equal(notifications.length, installNotifications);
    });
    await test('suspensão remove as RPCs públicas, revoga execução e preserva todos os dados', async () => {
      await script(suspend);
      assert.equal(await scalar("select to_regprocedure('public.hq_ops_snapshot()')"), null);
      assert.equal(await scalar("select to_regprocedure('public.hq_ops_command(jsonb)')"), null);
      assert.equal((await functionState('torque_hq')).length, 2);
      for (const role of ['anon', 'authenticated', 'service_role']) {
        assert.equal(await scalar("select has_function_privilege($1,'torque_hq.suspended_ops_snapshot()','EXECUTE')", [role]), false);
        assert.equal(await scalar("select has_function_privilege($1,'torque_hq.suspended_ops_command(jsonb)','EXECUTE')", [role]), false);
        await actor('admin', role); await denied(() => db.query('select torque_hq.suspended_ops_snapshot()'), '42501'); await owner();
      }
      assert.equal(notifications.at(-1), 'reload schema');
      await privateChecks(); assert.deepEqual(await tableData(), savedData);
    });
    await test('adapter publicado cai no legado somente para admin, sem habilitar comandos', async () => {
      await actor('admin'); const client = sqlClient('admin'), store = Data.createLiveStore({ client });
      try {
        const state = await store.load();
        assert.equal(state.role, 'legacy_admin'); assert.equal(state.meta.compatibility, 'legacy-readonly'); assert.equal(state.meta.commandsAvailable, false);
        assert.equal(state.sources.finance.status, 'unavailable'); assert.equal(state.sources.subscriptions.status, 'unavailable');
        assert(LEGACY.every(name => client.calls.includes(name)));
        await assert.rejects(() => store.command(payload), e => e.code === 'READ_ONLY');
        assert(!client.calls.includes('hq_ops_command'));
      } finally { store.dispose(); }
      await actor('staff'); const staffClient = sqlClient('staff'), staffStore = Data.createLiveStore({ client: staffClient });
      try { const state = await staffStore.load(); assert.equal(state.role, null); assert.deepEqual(state.permissions, []); assert(!LEGACY.some(name => staffClient.calls.includes(name))); }
      finally { staffStore.dispose(); }
    });
    await test('repetir suspensão e reaplicar instalação suspensa não recria RPC ou perde dados', async () => {
      const parked = await functionState('torque_hq'); await script(suspend);
      assert.deepEqual(await functionState('torque_hq'), parked);
      await scriptRejected(input.sql, '42P07');
      assert.equal(await scalar("select to_regprocedure('public.hq_ops_snapshot()')"), null);
      assert.deepEqual(await functionState('torque_hq'), parked); assert.deepEqual(await tableData(), savedData);
    });
    await test('retomada mínima restaura os mesmos OIDs e força gate false preservando staff/escopos', async () => {
      await ownerQuery('update torque_hq.settings set staff_enabled=true where id');
      await script(resume);
      assert.equal(await scalar('select staff_enabled from torque_hq.settings where id'), false);
      assert.deepEqual(await functionState(), installedFunctions);
      assert.equal(await scalar("select to_regprocedure('torque_hq.suspended_ops_snapshot()')"), null);
      for (const signature of ['public.hq_ops_snapshot()', 'public.hq_ops_command(jsonb)']) {
        assert.equal(await scalar("select has_function_privilege('authenticated',$1,'EXECUTE')", [signature]), true);
        for (const role of ['anon', 'service_role']) assert.equal(await scalar("select has_function_privilege($1,$2,'EXECUTE')", [role, signature]), false);
      }
      assert.deepEqual(await tableData(), savedData); await privateChecks();
      await actor('staff'); await denied(() => rpc('hq_ops_snapshot'), '42501');
      await actor('admin'); assert.equal((await rpc('hq_ops_snapshot')).role, 'admin');
    });
    await test('retomar novamente e replay do comando não duplicam histórico nem efeito', async () => {
      await script(resume); await actor('admin'); const replay = await rpc('hq_ops_command', payload);
      assert.equal(replay.id, lead.id); assert.equal(replay.replayed, true);
      assert.deepEqual(await tableData(), savedData); assert.deepEqual(await functionState(), installedFunctions);
    });
    await test('permissão negada não se transforma em fallback legado por engano', async () => {
      await ownerQuery('revoke execute on function public.hq_ops_snapshot() from authenticated');
      await actor('admin'); const client = sqlClient('admin'), store = Data.createLiveStore({ client });
      try { const state = await store.load(); assert.equal(state.role, null); assert(!LEGACY.some(name => client.calls.includes(name))); }
      finally { store.dispose(); }
      await script(resume); // restores only the reviewed minimum grants
    });
    await test('suspensão e retomada repetidas mantêm todos os registros e o reload explícito', async () => {
      for (let i = 0; i < 2; i++) { const before = notifications.length; await script(suspend); await script(resume); assert.equal(notifications.length, before + 2); }
      assert.deepEqual(await tableData(), savedData); assert.deepEqual(await functionState(), installedFunctions);
    });
    await test('colisão de RPC falha sem alterações parciais nem ativação de staff', async () => {
      await ownerQuery("create function torque_hq.suspended_ops_snapshot() returns jsonb language sql as $$select '{}'::jsonb$$");
      await scriptRejected(suspend); assert.deepEqual(await functionState(), installedFunctions);
      await ownerQuery('drop function torque_hq.suspended_ops_snapshot()'); // test-only collision fixture
      await script(suspend);
      await ownerQuery('alter function torque_hq.suspended_ops_command(jsonb) rename to temporary_missing_contract');
      await ownerQuery('update torque_hq.settings set staff_enabled=true where id');
      const before = notifications.length;
      await scriptRejected(resume);
      assert.equal(await scalar('select staff_enabled from torque_hq.settings where id'), true, 'failed transaction must not partly change configuration');
      assert.equal(await scalar("select to_regprocedure('public.hq_ops_snapshot()')"), null);
      assert.equal(notifications.length, before);
      await ownerQuery('alter function torque_hq.temporary_missing_contract(jsonb) rename to suspended_ops_command');
      await script(resume); assert.deepEqual(await tableData(), savedData);
    });
    await test('estado misto é recusado em ambas as direções, sem reparo automático ou reload', async () => {
      await ownerQuery('alter function public.hq_ops_snapshot() set schema torque_hq');
      await ownerQuery('alter function torque_hq.hq_ops_snapshot() rename to suspended_ops_snapshot');
      const publicBefore = await functionState(), privateBefore = await functionState('torque_hq');
      const before = notifications.length;
      await scriptRejected(suspend); await scriptRejected(resume);
      assert.deepEqual(await functionState(), publicBefore); assert.deepEqual(await functionState('torque_hq'), privateBefore);
      assert.equal(notifications.length, before); assert.deepEqual(await tableData(), savedData);
      await ownerQuery('alter function torque_hq.suspended_ops_snapshot() rename to hq_ops_snapshot');
      await ownerQuery('alter function torque_hq.hq_ops_snapshot() set schema public');
      assert.deepEqual(await functionState(), installedFunctions);
    });
    await test('cenário separado com ledger existente preserva saldos, histórico e privilégios', async () => {
      // This explicit local fixture is NOT part of minimum installation. The
      // package above was already proven to contain OPS alone, with no ledger.
      await script(read('supabase/migrations/20260930193716_hq_referrals_ledger.sql'));
      await ownerQuery("insert into hq_referrals_private.partners(id,name,status) values($1,'Parceiro sintetico historico','active')", [uid(201)]);
      await ownerQuery("insert into hq_referrals_private.coupons(id,code,partner_id,status) values($1,'FIXTURE_40',$2,'ready')", [uid(202), uid(201)]);
      await ownerQuery("insert into hq_referrals_private.customers(id,revision,context,core_state,partner_id,coupon_id,status) values($1,1,'{}','{}',$2,$3,'paid')", [uid(203), uid(201), uid(202)]);
      await ownerQuery("insert into hq_referrals_private.commissions(id,customer_id,partner_id,coupon_id,core_id,core_entry,status,amount_cents,claimable_cents,paid_cents,eligible_at) values($1,$2,$3,$4,'fixture-only','{}','paid',1996,1996,1996,'2026-01-15')", [uid(204), uid(203), uid(201), uid(202)]);
      await ownerQuery("insert into hq_referrals_private.audit(action,actor_id,entity_id,details) values('fixture_historical',$1,$2,'{\"synthetic\":true}')", [USERS.admin, uid(204)]);
      const ledgerBefore = await tableData(['hq_referrals_private']);
      const ledgerAcl = (await db.query("select p.oid,p.proacl::text,md5(pg_get_functiondef(p.oid)) body from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='hq_referrals_private' or (n.nspname='public' and p.proname like 'hq_referrals_%') order by p.oid")).rows;
      await script(suspend); await script(resume);
      assert.deepEqual(await tableData(['hq_referrals_private']), ledgerBefore);
      assert.deepEqual((await db.query("select p.oid,p.proacl::text,md5(pg_get_functiondef(p.oid)) body from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='hq_referrals_private' or (n.nspname='public' and p.proname like 'hq_referrals_%') order by p.oid")).rows, ledgerAcl);
      assert.equal(await scalar('select enabled from hq_referrals_private.campaign'), false);
      assert.equal(await scalar("select to_regnamespace('hq_influencer_private')"), null);
      assert.deepEqual(await tableData(), savedData);
    });
    console.log('\n' + checks + ' grupos de ativação/recuperação aprovados; instalação ' + input.mode + '.');
    console.log('Somente banco efêmero. NOTIFY emitido; consumo real por PostgREST/HTTP/Auth/MFA e concorrência entre sessões continuam fora desta prova.');
  } finally { if (stopNotifications) await stopNotifications(); await db.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
