'use strict';
// Runs only after the parent harness's fixed-loopback/real-GoTrue guards.
// PostgreSQL writes below are synthetic fixtures; authorization assertions use HTTP.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

module.exports = async function ({ client, check, rpc, good, rejected, waitRPC,
  rest, users, accountA, accountB, anonKey, serviceKey }) {
  const { admin, outsider, supportB, finance } = users;
  const scalar = async (sql, values = []) => Object.values((await client.query(sql, values)).rows[0])[0];
  const read = async (actor = admin, body = {}) => rpc(actor, 'hq_ops_legacy_support', body);
  const audit = async (actor, body) => rpc(actor, 'hq_ops_export_audit', body);
  const snapshot = async actor => good(await rpc(actor, 'hq_ops_snapshot'));
  const migration = name => fs.readFileSync(path.join(__dirname, '../../supabase/migrations', name), 'utf8');
  const tableNames = ['saas_tickets', 'suporte_chamados'];
  const frozenLegacy = async () => {
    const result = {};
    for (const table of tableNames) result[table] = (await client.query('select to_jsonb(t) as row from public.' + table + ' t order by id')).rows;
    return result;
  };
  const authorityBefore = {
    admins: (await client.query('select * from public.saas_admins order by user_id')).rows,
    staff: (await client.query('select * from torque_hq.staff order by user_id')).rows,
    gate: await scalar('select staff_enabled from torque_hq.settings'),
    accounts: (await client.query('select * from public.academias order by id')).rows
  };
  assert.equal(authorityBefore.gate, false);
  let legacyBefore;
  await check('operational fixtures use real Auth identities and protect both old support tables', async () => {
    assert.equal(await scalar('select current_database()'), 'hq_auth_ci');
    assert.equal(await scalar("select to_regclass('public.saas_tickets') is null and to_regclass('public.suporte_chamados') is null"), true);
    // These are application dependencies only. Never replace Auth tables/helpers.
    await client.query(`create table public.saas_tickets(
      id uuid primary key,academia_id uuid references public.academias(id),de text,quem text,texto text,lida boolean,criado timestamptz);
      create table public.suporte_chamados(
      id uuid primary key,protocolo text unique,academia_id uuid references public.academias(id),user_id uuid references auth.users(id),
      email text,tipo text,mensagem text,status text,resposta text,criado_em timestamptz);
      alter table public.saas_tickets enable row level security;
      alter table public.suporte_chamados enable row level security;
      revoke all on public.saas_tickets,public.suporte_chamados from public,anon,authenticated,service_role;`);
    // Equal timestamps and equal IDs across sources exercise the full keyset tuple.
    for (let i = 0; i < 5; i++) {
      const id = crypto.randomUUID(), account = i === 4 ? accountB : accountA;
      await client.query(`insert into public.saas_tickets values($1,$2,$3,'Private synthetic sender',$4,$5,now()-interval '2 hours')`,
        [id, account, i === 3 ? 'admin' : 'cliente', i === 2 ? 'S'.repeat(8100) : 'Synthetic old ticket', i % 2 === 0]);
      await client.query(`insert into public.suporte_chamados values($1,$2,$3,$4,'private-fixture@example.test','duvida',
        'Synthetic old request',$5,$6,now()-interval '2 hours')`,
        [id, 'CI-OLD-' + i, account, outsider.id, i % 2 ? 'aberto' : 'respondido', i === 2 ? 'R'.repeat(8100) : 'Synthetic stored reply']);
    }
    // Explicitly equal timestamps, independent of separate INSERT transaction times.
    await client.query("update public.saas_tickets set criado=date_trunc('hour',now())-interval '2 hours'; update public.suporte_chamados set criado_em=date_trunc('hour',now())-interval '2 hours'");
    legacyBefore = await frozenLegacy();
  });
  await check('updated HQ migrations preserve original messages, staff gate and administrator registry', async () => {
    await client.query(migration('20261006144202_hq_operacao_estados_exportacao.sql'));
    await client.query(migration('20261006145701_hq_suporte_legado_leitura.sql'));
    await waitRPC(admin, 'hq_ops_snapshot', r => r.ok && r.data?.meta?.exportAuditAvailable === true);
    await waitRPC(admin, 'hq_ops_legacy_support', r => r.ok && r.data?.readOnly === true);
    assert.deepEqual(await frozenLegacy(), legacyBefore);
    assert.equal(await scalar('select staff_enabled from torque_hq.settings'), false);
    assert.deepEqual((await client.query('select * from public.saas_admins order by user_id')).rows, authorityBefore.admins);
    assert.deepEqual((await client.query('select * from torque_hq.staff order by user_id')).rows, authorityBefore.staff);
  });
  await check('updated snapshot keeps unknown deadlines and unmonitored integrations truthful over HTTP', async () => {
    try {
      await client.query("update public.academias set assinatura_status='trial',assinatura_vence=now()+interval '2 days' where id=$1", [accountA]);
      await client.query("update public.academias set assinatura_status='trial',assinatura_vence=null where id=$1", [accountB]);
      const s = await snapshot(admin), a = s.accounts.find(row => row.id === accountA), b = s.accounts.find(row => row.id === accountB);
      assert.equal(a.trialStatus, 'trial'); assert.equal(a.accessStatus, 'trial');
      assert(Number.isFinite(Date.parse(a.trialEndsAt))); assert.equal(b.trialEndsAt, null);
      for (const domain of ['integrations', 'subscriptions']) assert.equal(s.sources[domain].updatedAt, null);
      assert.equal(s.sources.events.status, 'unavailable');
      assert.equal(s.sources.events.reason, 'instrumentation_not_available');
      assert.equal(s.sources.cases.scope, 'opsOnly'); assert.equal(s.sources.cases.deliveryConnected, false);
      for (const actor of [undefined, anonKey, outsider, serviceKey]) rejected(await rpc(actor, 'hq_ops_snapshot'), '42501');
    } finally {
      for (const a of authorityBefore.accounts) await client.query('update public.academias set assinatura_status=$1,assinatura_vence=$2 where id=$3', [a.assinatura_status,a.assinatura_vence,a.id]);
    }
  });
  const exportBody = {
    p_report: 'trials', p_filters: { from: '2026-10-01', to: '2026-10-31', timeZone: 'America/Sao_Paulo', product: 'personal' },
    p_snapshot_at: new Date().toISOString(), p_rows: 2,
    p_content_sha256: crypto.createHash('sha256').update('Synthetic CSV content: never sent to RPC').digest('hex'),
    p_idempotency_key: 'ci-export-' + crypto.randomUUID()
  };
  let receipt;
  const exportRows = async () => (await client.query("select * from torque_hq.audit where action='report.export.requested' order by id")).rows;
  await check('export HTTP rejects anonymous, ordinary, forged-metadata and service actors without audit writes', async () => {
    const before = await exportRows();
    for (const actor of [undefined, anonKey, outsider, serviceKey, supportB, finance]) rejected(await audit(actor, exportBody), '42501');
    assert.deepEqual(await exportRows(), before);
  });
  await check('administrator export stores server actor and SHA256 metadata, never CSV or delivery claims', async () => {
    receipt = good(await audit(admin, exportBody));
    assert.equal(receipt.ok, true); assert.equal(receipt.replayed, false); assert.equal(receipt.effect, 'export_request_recorded');
    const row = (await client.query('select * from torque_hq.audit where id=$1', [receipt.id])).rows[0];
    assert.equal(row.actor_id, admin.id); assert.equal(row.actor_role, 'admin'); assert.equal(row.action, 'report.export.requested');
    assert.equal(row.idempotency_key, exportBody.p_idempotency_key); assert.match(row.payload_hash, /^[a-f0-9]{64}$/);
    assert.deepEqual(Object.keys(row.after_value).sort(), ['contentSha256','filters','report','rows','snapshotAt','type'].sort());
    assert.equal(row.after_value.contentSha256, exportBody.p_content_sha256); assert.equal(row.after_value.rows, 2);
    assert.equal(row.after_value.report, 'trials'); assert.deepEqual(row.after_value.filters, exportBody.p_filters);
    assert.match(row.reason, /salvamento no aparelho nao comprovado/);
    assert.equal(row.payload_hash, await scalar('select encode(sha256(convert_to(after_value::text,\'UTF8\')),\'hex\') from torque_hq.audit where id=$1', [receipt.id]));
  });
  await check('export retry has one receipt and a changed payload with the same key is denied', async () => {
    const before = await exportRows(), replay = good(await audit(admin, exportBody));
    assert.equal(replay.id, receipt.id); assert.equal(replay.replayed, true);
    rejected(await audit(admin, { ...exportBody, p_rows: 3 }), '22023');
    assert.deepEqual(await exportRows(), before);
    assert.equal(Number(await scalar('select count(*) from torque_hq.commands where actor_id=$1 and idempotency_key=$2', [admin.id,exportBody.p_idempotency_key])), 1);
  });
  await check('export validates report, filters, bounds, timestamp, hash and key before recording', async () => {
    const before = await exportRows();
    const invalid = [
      { p_report: 'unknown' }, { p_filters: null }, { p_filters: [] }, { p_filters: { csv: 'not accepted' } },
      { p_filters: { product: 1 } }, { p_filters: { product: 'x'.repeat(101) } }, { p_rows: -1 }, { p_rows: 100001 },
      { p_snapshot_at: null }, { p_snapshot_at: new Date(Date.now() + 3600000).toISOString() },
      { p_snapshot_at: new Date(Date.now() - 172800000).toISOString() }, { p_content_sha256: 'not-sha256' },
      { p_idempotency_key: 'short' }
    ];
    for (const patch of invalid) rejected(await audit(admin, { ...exportBody, p_idempotency_key: 'ci-invalid-' + crypto.randomUUID(), ...patch }));
    assert.deepEqual(await exportRows(), before);
  });
  await check('staff export gate and report permissions are enforced by the server with genuine user JWTs', async () => {
    const financeBody = { ...exportBody, p_report: 'cash', p_idempotency_key: 'ci-finance-' + crypto.randomUUID() };
    const staffBefore = (await client.query('select enabled from torque_hq.staff where user_id=$1', [finance.id])).rows[0];
    try {
      await client.query('update torque_hq.settings set staff_enabled=true');
      await client.query('update torque_hq.staff set enabled=true where user_id=$1', [finance.id]);
      assert.equal(good(await audit(finance, financeBody)).ok, true);
      for (const report of ['support', 'support-history', 'pipeline', 'funnel', 'incidents']) {
        rejected(await audit(finance, { ...financeBody, p_report: report, p_idempotency_key: 'ci-domain-' + crypto.randomUUID() }), '42501');
      }
      rejected(await audit(supportB, { ...exportBody, p_report: 'support' }), '42501');
      await client.query('update torque_hq.staff set enabled=false where user_id=$1', [finance.id]);
      rejected(await audit(finance, financeBody), '42501');
    } finally {
      await client.query('update torque_hq.settings set staff_enabled=$1', [authorityBefore.gate]);
      await client.query('update torque_hq.staff set enabled=$1 where user_id=$2', [staffBefore.enabled,finance.id]);
    }
  });
  let firstPage;
  await check('legacy HTTP bridge denies ordinary, anonymous and service identities and ignores editable metadata', async () => {
    for (const actor of [undefined, anonKey, outsider, serviceKey, supportB, finance]) rejected(await rpc(actor, 'hq_ops_legacy_support'), '42501');
    try {
      await client.query('update torque_hq.settings set staff_enabled=true');
      for (const actor of [supportB, finance]) rejected(await read(actor), '42501');
    } finally { await client.query('update torque_hq.settings set staff_enabled=$1', [authorityBefore.gate]); }
    assert.deepEqual(await frozenLegacy(), legacyBefore);
  });
  await check('legacy administrator read paginates equal timestamps and IDs across both channels without duplicates', async () => {
    firstPage = good(await read(admin, { p_limit: 3 }));
    assert.equal(firstPage.readOnly, true); assert.equal(firstPage.scope, 'legacyOnly'); assert.equal(firstPage.delivery, 'not_verified');
    assert.equal(firstPage.rows.length, 3); assert(firstPage.nextCursor);
    const all = [...firstPage.rows]; let cursor = firstPage.nextCursor, pages = 1;
    while (cursor) {
      assert(pages++ < 10, 'Pagination must terminate');
      const next = good(await read(admin, { p_limit: 3, p_cursor: cursor }));
      assert.equal(next.asOf, firstPage.asOf); assert(next.rows.length <= 3);
      all.push(...next.rows); cursor = next.nextCursor;
    }
    assert.equal(all.length, 10); assert.equal(new Set(all.map(row => row.source + ':' + row.id)).size, 10);
    assert.deepEqual(new Set(all.map(row => row.source)), new Set(tableNames));
    assert(all.every(row => row.delivery === 'not_verified'));
    for (const row of all) {
      assert.deepEqual(Object.keys(row).sort(), ['id','source','accountId','accountName','createdAt','direction','status','protocol','message','reply','truncated','delivery'].sort());
      assert(row.message.length <= 8000 && row.reply.length <= 8000);
    }
    assert.equal(all.filter(row => row.truncated === true).length, 2);
    const text = JSON.stringify(all);
    assert(!text.includes('private-fixture@example.test')); assert(!text.includes('Private synthetic sender')); assert(!text.includes(outsider.id));
    assert(all.some(row => row.status === 'nao_lida_no_legado')); assert(all.some(row => row.status === 'lida_no_legado'));
    assert(all.some(row => row.reply === 'Synthetic stored reply' && row.status === 'respondido'));
  });
  await check('legacy filter and cursor validation remain server-owned', async () => {
    const scoped = good(await read(admin, { p_limit: 50, p_academia: accountB }));
    assert.equal(scoped.rows.length, 2); assert(scoped.rows.every(row => row.accountId === accountB));
    assert.equal(scoped.nextCursor, null);
    rejected(await read(admin, { p_limit: 3, p_academia: accountB, p_cursor: firstPage.nextCursor }), '22023');
    for (const limit of [0,51,null]) rejected(await read(admin, { p_limit: limit }), '22023');
    for (const cursor of [{}, [], { ...firstPage.nextCursor, unexpected: 'field' }, { ...firstPage.nextCursor, cutoff: 'infinity' }]) {
      rejected(await read(admin, { p_cursor: cursor }), '22023');
    }
  });
  await check('revoking administrator access immediately denies reads and export replay with the existing Auth JWT', async () => {
    const before = await exportRows(), token = admin.token;
    try {
      await client.query('delete from public.saas_admins where user_id=$1', [admin.id]);
      rejected(await read(admin, { p_cursor: firstPage.nextCursor, p_limit: 3 }), '42501');
      rejected(await audit(admin, exportBody), '42501');
      rejected(await rpc(admin, 'hq_ops_snapshot'), '42501');
      assert.equal(admin.token, token); assert.deepEqual(await exportRows(), before);
    } finally { await client.query('insert into public.saas_admins(user_id) values($1) on conflict do nothing', [admin.id]); }
    assert.equal(good(await audit(admin, exportBody)).replayed, true);
    assert.equal(good(await read(admin)).readOnly, true);
  });
  await check('updated functions expose only authenticated RPC entrypoints and no direct legacy table access', async () => {
    for (const table of tableNames) for (const actor of [admin.token, outsider.token, anonKey, serviceKey]) {
      rejected(await rest('/' + table + '?select=*', { token: actor, method: 'GET' }), '42501');
      const body = table === 'saas_tickets' ? { lida: true } : { status: 'resolved' };
      rejected(await rest('/' + table, { token: actor, method: 'PATCH', body }), '42501');
    }
    for (const [name, body] of [['hq_ops_export_audit', exportBody], ['hq_ops_legacy_support', {}]]) {
      rejected(await rpc('not-a-jwt', name, body), undefined, 401);
    }
    for (const signature of ['public.hq_ops_export_audit(text,jsonb,timestamptz,integer,text,text)', 'public.hq_ops_legacy_support(jsonb,integer,uuid)']) {
      for (const role of ['anon','authenticated','service_role']) {
        assert.equal(await scalar('select has_function_privilege($1,$2,\'execute\')', [role,signature]), role === 'authenticated');
      }
    }
    const fn = (await client.query("select provolatile,proconfig from pg_proc where oid='public.hq_ops_legacy_support(jsonb,integer,uuid)'::regprocedure")).rows[0];
    assert.equal(fn.provolatile, 's'); assert(fn.proconfig.includes('search_path=""'));
  });
  await check('all legacy reads and denied writes preserve every stored field and original access settings', async () => {
    assert.deepEqual(await frozenLegacy(), legacyBefore);
    assert.deepEqual((await client.query('select * from public.saas_admins order by user_id')).rows, authorityBefore.admins);
    assert.deepEqual((await client.query('select * from torque_hq.staff order by user_id')).rows, authorityBefore.staff);
    assert.equal(await scalar('select staff_enabled from torque_hq.settings'), authorityBefore.gate);
    assert.deepEqual((await client.query('select * from public.academias order by id')).rows, authorityBefore.accounts);
    const before = await frozenLegacy();
    await client.query(migration('20261006145701_hq_suporte_legado_leitura.sql'));
    assert.deepEqual(await frozenLegacy(), before);
  });
};
