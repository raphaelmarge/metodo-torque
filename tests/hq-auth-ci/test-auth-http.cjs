'use strict';
// Disposable CI only. Positive user JWTs come exclusively from real Supabase Auth.
// No Auth table/helper stubs, no remote project, no outbound email/payment, no token logs.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { loadPackages } = require('./package-input.cjs');
const SECRET = 'hq-auth-ci-only-hs256-secret-never-use-in-production-20260930';
const PG = 'postgresql://postgres:hq_auth_ci_postgres_test_only@127.0.0.1:55433/hq_auth_ci';
const AUTH = 'http://127.0.0.1:59999';
const REST = 'http://127.0.0.1:53000';
const summary = { schemaVersion: 1, scope: 'disposable-direct-auth-postgrest', checks: [], observations: [], status: 'running' };
let phase = 'disposable environment guard', operation = 'none', client, packages;
const safeCode = value => typeof value === 'string' && /^[A-Za-z0-9_]{1,48}$/.test(value) ? value : 'UNCLASSIFIED';
function guard() {
  assert.equal(process.env.CI, 'true');
  assert.equal(process.env.HQ_AUTH_CI_DISPOSABLE, '1');
  for (const [key, expected] of Object.entries({ HQ_AUTH_CI_PG_URL: PG, HQ_AUTH_CI_AUTH_URL: AUTH, HQ_AUTH_CI_REST_URL: REST, HQ_AUTH_CI_JWT_SECRET: SECRET })) assert.equal(process.env[key], expected);
}
function sign(payload, header = { alg: 'HS256', typ: 'JWT' }) {
  const encoded = [header, payload].map(v => Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
  return encoded + '.' + crypto.createHmac('sha256', SECRET).update(encoded).digest('base64url');
}
const claims = token => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
const seconds = () => Math.floor(Date.now() / 1000);
let serviceKey, anonKey;
async function request(base, route, { token, method = 'POST', body = {}, headers = {} } = {}) {
  assert([AUTH, REST].includes(base));
  assert(route.startsWith('/') && !route.includes('://'));
  // Diagnostics contain only fixed route/command names and a nonidentifying
  // version number. Never log bodies, URLs with user IDs, credentials or JWTs.
  const routeLabel = /^\/rpc\/[a-z_]+$/.test(route) ? route : '/redacted-resource';
  operation = (base === AUTH ? 'auth' : 'rest') + ':' + method + ':' + routeLabel;
  const teamInput = body?.p_input;
  if (route === '/rpc/hq_team_command' && ['team.create', 'team.update', 'team.setStatus', 'team.review'].includes(teamInput?.type)) {
    operation += ':' + teamInput.type;
    if (Number.isInteger(teamInput.payload?.expectedVersion)) operation += ':version=' + teamInput.payload.expectedVersion;
  }
  const response = await fetch(base + route, { method, redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json', apikey: anonKey, ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body) }) });
  const raw = await response.text();
  let data; try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
  return { status: response.status, ok: response.ok, data };
}
function good(result) {
  if (!result.ok) { const error = new Error('HTTP check failed'); error.code = 'HTTP_' + result.status + '_' + safeCode(result.data?.code || result.data?.error_code); throw error; }
  return result.data;
}
function rejected(result, code, status) {
  assert.equal(result.ok, false);
  if (code) assert.equal(result.data?.code, code);
  if (status) assert.equal(result.status, status);
}
const rpc = (user, name, body = {}) => request(REST, '/rpc/' + name, { token: typeof user === 'string' ? user : user?.token, body });
const snap = async user => good(await rpc(user, 'hq_ops_snapshot'));
const envelope = (type, payload, key = crypto.randomUUID()) => ({ type, payload, reason: 'Synthetic CI authorization proof', idempotencyKey: key });
const command = (user, value) => rpc(user, 'hq_ops_command', { p_command: value });
const scalar = async (sql, values = []) => Object.values((await client.query(sql, values)).rows[0])[0];
async function check(label, fn) { phase = label; await fn(); summary.checks.push({ name: label, status: 'pass' }); console.log('OK ' + summary.checks.length + ' ' + label); }
function observe(name, value) { summary.observations.push({ name, value }); console.log('OBS ' + name + ': ' + value); }
async function waitRPC(user, name, predicate, body = {}) {
  const limit = Date.now() + 15000;
  do { const result = await rpc(user, name, body); if (predicate(result)) return result; await new Promise(resolve => setTimeout(resolve, 200)); } while (Date.now() < limit);
  throw Object.assign(new Error('Schema reload timeout'), { code: 'SCHEMA_RELOAD_TIMEOUT' });
}
async function login(user) {
  const response = good(await request(AUTH, '/token?grant_type=password', { body: { email: user.email, password: user.password } }));
  assert(response.access_token && response.refresh_token);
  assert.equal(response.user.id, user.id);
  user.token = response.access_token; user.refreshToken = response.refresh_token;
  assert.equal(claims(user.token).sub, user.id);
  assert.equal(claims(user.token).role, 'authenticated');
  assert.equal(typeof claims(user.token).session_id, 'string');
  return user;
}
async function createUser(name, confirmed = true) {
  const user = { email: 'hq-ci-' + name + '@example.test', password: 'Synthetic-CI-password-' + crypto.randomBytes(18).toString('hex') };
  const result = good(await request(AUTH, '/admin/users', { token: serviceKey, body: { email: user.email, password: user.password, email_confirm: confirmed, user_metadata: { syntheticFixture: true } } }));
  user.id = result.id; assert.match(user.id, /^[0-9a-f-]{36}$/);
  return confirmed ? login(user) : user;
}
async function storedData() {
  const result = {};
  const tables = (await client.query("select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('torque_hq','hq_referrals_private','hq_influencer_private') and c.relkind='r' and c.relname<>'settings' order by 1,2")).rows;
  for (const { nspname, relname } of tables) {
    assert.match(nspname + '.' + relname, /^[a-z_]+\.[a-z_]+$/);
    result[nspname + '.' + relname] = await scalar('select md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),\'[]\')::text) from ' + nspname + '.' + relname + ' t');
  }
  return result;
}
async function main() {
  guard(); serviceKey = sign({ role: 'service_role', iss: 'supabase', iat: seconds(), exp: seconds() + 3600 });
  anonKey = sign({ role: 'anon', iss: 'supabase', iat: seconds(), exp: seconds() + 3600 });
  await check('mandatory release manifests and byte hashes', async () => { packages = loadPackages(); summary.packages = Object.values(packages).map(p => p.metadata); });
  const { Client } = require('../sql/node_modules/pg');
  client = new Client({ connectionString: PG, connectionTimeoutMillis: 10000, application_name: 'hq_auth_ci_http' });
  await client.connect();
  await check('isolated database and official Auth migrations/helpers', async () => {
    assert.equal(await scalar('select current_database()'), 'hq_auth_ci');
    assert.equal(await scalar("select to_regclass('auth.schema_migrations') is not null and to_regclass('auth.sessions') is not null and to_regprocedure('auth.uid()') is not null and to_regprocedure('auth.jwt()') is not null"), true);
    assert(Number(await scalar('select count(*) from auth.schema_migrations')) > 20);
    assert.equal(await scalar("select to_regnamespace('torque_hq') is null and to_regnamespace('hq_referrals_private') is null and to_regnamespace('hq_influencer_private') is null"), true);
    assert.equal(Number(await scalar('select count(*) from auth.users')), 0);
  });
  const users = {};
  await check('Auth admin creates synthetic users; password grants issue genuine JWTs', async () => {
    for (const name of ['admin', 'outsider', 'supportA', 'supportB', 'finance', 'partnerA', 'partnerB']) users[name] = await createUser(name);
    users.unconfirmed = await createUser('unconfirmed', false);
    for (const user of Object.values(users).filter(u => u.token)) assert.equal(good(await request(AUTH, '/user', { token: user.token, method: 'GET' })).id, user.id);
  });
  const { admin, outsider, supportA, supportB, finance, partnerA, partnerB, unconfirmed } = users;
  const accountA = crypto.randomUUID(), accountB = crypto.randomUUID();
  await check('versioned installation preserves default staff denial and campaign OFF', async () => {
    await client.query('insert into public.saas_admins(user_id) values($1)', [admin.id]);
    await client.query("insert into public.academias(id,nome,criada,assinatura_status) values($1,'Synthetic account A',now(),'trial'),($2,'Synthetic account B',now(),'trial')", [accountA, accountB]);
    await client.query("insert into public.saas_clientes(academia_id,tipo,status) values($1,'personal','trial'),($2,'personal','trial')", [accountA, accountB]);
    for (const name of ['ops', 'referrals', 'influencer']) for (const sql of packages[name].migrations) await client.query(sql);
    await client.query("notify pgrst, 'reload schema'");
    await waitRPC(admin, 'hq_ops_snapshot', r => r.ok);
    await waitRPC(admin, 'hq_influencer_admin_snapshot', r => r.ok);
    assert.equal(await scalar('select staff_enabled from torque_hq.settings'), false);
    assert.equal(await scalar('select enabled from hq_referrals_private.campaign'), false);
    assert.equal(Number(await scalar('select count(*) from torque_hq.staff')), 0);
  });
  await check('anonymous, outsider and privileged API key cannot enter OPS', async () => {
    for (const actor of [undefined, anonKey, outsider, serviceKey]) rejected(await rpc(actor, 'hq_ops_snapshot'), '42501');
    rejected(await command(outsider, envelope('lead.create', { name: 'Must never exist' })), '42501');
  });
  await require('./test-cortesia-http.cjs')({ client, check, rpc, good, rejected, waitRPC,
    users, accountA, accountB, anonKey, serviceKey });
  await check('client-editable metadata cannot forge administrator or staff role', async () => {
    good(await request(AUTH, '/user', { token: outsider.token, method: 'PUT', body: { data: { role: 'admin', super_admin: true, app_metadata: { role: 'service_role' }, permissions: ['finance.write'], staff_enabled: true } } }));
    const refreshed = good(await request(AUTH, '/token?grant_type=refresh_token', { body: { refresh_token: outsider.refreshToken } }));
    outsider.token = refreshed.access_token; outsider.refreshToken = refreshed.refresh_token;
    assert.equal(claims(outsider.token).user_metadata.role, 'admin');
    assert.equal(claims(outsider.token).role, 'authenticated');
    rejected(await rpc(outsider, 'hq_ops_snapshot'), '42501');
  });
  let invoiceId;
  await check('existing administrator receives server permissions and auditable manual finance', async () => {
    const s = await snap(admin); assert.equal(s.role, 'admin'); assert.equal(s.currentUserId, admin.id);
    assert(s.permissions.includes('finance.write') && s.permissions.includes('reports.export'));
    assert.deepEqual(new Set(s.accounts.map(a => a.id)), new Set([accountA, accountB]));
    invoiceId = good(await command(admin, envelope('invoice.create', { accountId: accountA, totalCents: 4990, dueDate: '2020-01-01', label: 'Synthetic manual receivable' }))).id;
    const payment = envelope('invoice.recordPayment', { id: invoiceId, amountCents: 4990, paidAt: '2020-01-01T10:00:00Z', reference: 'CI-SYNTHETIC-RECEIPT' });
    assert.equal(good(await command(admin, payment)).externalEffect, false);
    assert.equal(good(await command(admin, payment)).replayed, true);
    rejected(await command(admin, { ...payment, payload: { ...payment.payload, amountCents: 1 } }), '22023');
    assert.equal(Number(await scalar('select count(*) from torque_hq.payments where invoice_id=$1', [invoiceId])), 1);
    assert.equal(await scalar('select actor_id from torque_hq.audit where idempotency_key=$1', [payment.idempotencyKey]), admin.id);
    assert.equal(claims(admin.token).aal, 'aal1');
    observe('MFA', 'Current HQ accepts a real password AAL1 session; AAL2 enforcement and MFA enrollment are not implemented or tested here.');
  });
  await check('enabled staff rows remain denied while private global staff gate is OFF', async () => {
    for (const [user, role] of [[supportA, 'support'], [supportB, 'support'], [finance, 'finance']]) {
      await client.query('insert into torque_hq.staff(user_id,role,enabled) values($1,$2,true)', [user.id, role]);
      rejected(await rpc(user, 'hq_ops_snapshot'), '42501');
    }
  });
  let caseA, caseB, ownCase, replayMessage;
  await check('explicit fixture enables staff; no support account scope is inferred', async () => {
    await client.query('update torque_hq.settings set staff_enabled=true'); // CI fixture only, never a client command.
    const s = await snap(supportA); assert.equal(s.role, 'support'); assert.equal(s.accounts.length, 0); assert.equal(s.cases.length, 0);
    assert.deepEqual(s.invoices, []); assert.deepEqual(s.audit, []);
    assert.equal(s.sources.invoices.reason, 'forbidden'); assert.equal(s.sources.audit.reason, 'forbidden');
    rejected(await command(supportA, envelope('case.create', { accountId: accountA, subject: 'Forbidden known account' })), '42501');
    rejected(await command(supportA, envelope('support.scope.grant', { userId: supportA.id, accountId: accountA })), '42501');
    rejected(await command(supportA, envelope('invoice.create', { accountId: accountA, totalCents: 100, dueDate: '2020-01-01' })), '42501');
    ownCase = good(await command(supportA, envelope('case.create', { accountId: null, subject: 'Private accountless case' }))).id;
    assert((await snap(supportA)).cases.some(c => c.id === ownCase));
    assert(!(await snap(supportB)).cases.some(c => c.id === ownCase));
    assert.equal((await snap(finance)).role, 'finance');
    rejected(await command(finance, envelope('case.create', { subject: 'Forbidden finance support mutation' })), '42501');
  });
  await check('administrator scopes support A/B; unassigned cases and messages stay isolated', async () => {
    good(await command(admin, envelope('support.scope.grant', { userId: supportA.id, accountId: accountA })));
    good(await command(admin, envelope('support.scope.grant', { userId: supportB.id, accountId: accountB })));
    caseA = good(await command(admin, envelope('case.create', { accountId: accountA, subject: 'Scoped A', owner: null }))).id;
    caseB = good(await command(admin, envelope('case.create', { accountId: accountB, subject: 'Scoped B', owner: null }))).id;
    replayMessage = envelope('case.message', { id: caseA, text: 'Internal synthetic scoped note', visibility: 'internal' });
    good(await command(supportA, replayMessage));
    const a = await snap(supportA), b = await snap(supportB);
    assert.deepEqual(a.accounts.map(x => x.id), [accountA]); assert.deepEqual(b.accounts.map(x => x.id), [accountB]);
    assert(a.cases.some(c => c.id === caseA)); assert(!a.cases.some(c => c.id === caseB));
    assert(!b.cases.some(c => [caseA, ownCase].includes(c.id))); assert(b.cases.some(c => c.id === caseB));
    rejected(await command(supportA, envelope('case.message', { id: caseB, text: 'Cross account attempt' })), '42501');
    rejected(await command(supportA, envelope('case.update', { id: ownCase, accountId: accountB })), '42501');
    rejected(await command(supportA, envelope('case.update', { id: caseA, owner: supportB.id })), '42501');
  });
  await check('scope and role revocation apply immediately to reads, writes and old replay keys', async () => {
    good(await command(admin, envelope('support.scope.revoke', { userId: supportA.id, accountId: accountA })));
    assert.equal((await snap(supportA)).accounts.length, 0); assert(!(await snap(supportA)).cases.some(c => c.id === caseA));
    rejected(await command(supportA, replayMessage), '42501');
    const ownMessage = envelope('case.message', { id: ownCase, text: 'Before role removal' });
    good(await command(supportA, ownMessage));
    await client.query('update torque_hq.staff set enabled=false where user_id=$1', [supportA.id]);
    rejected(await rpc(supportA, 'hq_ops_snapshot'), '42501'); rejected(await command(supportA, ownMessage), '42501');
    await client.query('delete from public.saas_admins where user_id=$1', [admin.id]);
    rejected(await rpc(admin, 'hq_ops_snapshot'), '42501');
    await client.query('insert into public.saas_admins(user_id) values($1)', [admin.id]);
  });
  await check('malformed, bad-signature, alg-none and expired JWTs fail at HTTP boundary', async () => {
    const parts = admin.token.split('.');
    const badSignature = parts.slice(0, 2).join('.') + '.' + (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1);
    const none = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url') + '.' + parts[1] + '.';
    const expired = sign({ ...claims(admin.token), iat: seconds() - 7200, exp: seconds() - 3600 });
    for (const token of ['not-a-jwt', badSignature, none, expired]) {
      rejected(await rpc(token, 'hq_ops_snapshot'), undefined, 401);
      rejected(await rpc(token, 'minha_assinatura'), undefined, 401);
    }
  });
  async function privateBoundary() {
    for (const schema of ['torque_hq', 'hq_referrals_private', 'hq_influencer_private']) for (const actor of [admin.token, outsider.token, serviceKey]) {
      rejected(await request(REST, '/rpc/snapshot', { token: actor, headers: { 'Content-Profile': schema } }), 'PGRST106', 406);
      rejected(await request(REST, '/audit?select=*', { token: actor, method: 'GET', headers: { 'Accept-Profile': schema } }), 'PGRST106', 406);
    }
    for (const role of ['anon', 'authenticated', 'service_role']) {
      assert.equal(await scalar("select has_function_privilege($1,'hq_referrals_private.first_payment_json(hq_referrals_private.customers)','execute')", [role]), false);
      assert.equal(await scalar("select count(*)=0 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('torque_hq','hq_referrals_private','hq_influencer_private') and c.relkind='r' and (not c.relrowsecurity or has_table_privilege($1,c.oid,'select,insert,update,delete'))", [role]), true);
    }
    rejected(await rpc(admin, 'first_payment_json', { r: {} }), 'PGRST202', 404);
    for (const actor of [admin.token, outsider.token, serviceKey]) {
      rejected(await request(REST, '/academias?select=*', { token: actor, method: 'GET' }), '42501');
      rejected(await request(REST, '/academias', { token: actor, body: { id: crypto.randomUUID(), nome: 'Denied direct table mutation' } }), '42501');
    }
  }
  await check('private schemas, RLS tables and first-payment helper are not API endpoints', privateBoundary);
  const partners = {}, coupons = {}, invites = {};
  await check('ledger admin-only and bridge service-only RPC grants are enforced over HTTP', async () => {
    rejected(await rpc(outsider, 'hq_referrals_snapshot'), 'HQ403');
    rejected(await rpc(serviceKey, 'hq_referrals_snapshot'), '42501');
    const random = crypto.randomUUID();
    rejected(await rpc(admin, 'hq_referrals_load_customer', { p_customer_key: random }), '42501');
    const bridge = good(await rpc(serviceKey, 'hq_referrals_load_customer', { p_customer_key: random }));
    assert.equal(bridge.revision, 0);
    for (const label of ['A', 'B', 'Unconfirmed']) {
      partners[label] = good(await rpc(admin, 'hq_referrals_save_partner', { p_input: { name: 'Synthetic partner ' + label, contact: 'Synthetic private contact ' + label, status: 'active' } }));
      coupons[label] = good(await rpc(admin, 'hq_referrals_save_coupon', { p_input: { partnerId: partners[label].id, code: 'CI_ONLY_' + label.toUpperCase(), status: 'ready' } }));
    }
    assert.equal(good(await rpc(admin, 'hq_referrals_snapshot')).campaign.enabled, false);
  });
  await check('invitations do not create Auth users or send email; confirmed A/B accept own membership', async () => {
    const before = Number(await scalar('select count(*) from auth.users'));
    for (const [label, user] of [['A', partnerA], ['B', partnerB], ['Unconfirmed', unconfirmed]]) {
      invites[label] = good(await rpc(admin, 'hq_influencer_prepare_invite', { p_input: { partnerId: partners[label].id, email: user.email, expiresAt: new Date(Date.now() + 86400000).toISOString(), reason: 'Synthetic CI invitation' } }));
      assert.equal(invites[label].delivery, 'unavailable'); assert.equal(invites[label].authUserCreated, false);
    }
    assert.equal(Number(await scalar('select count(*) from auth.users')), before);
    for (const user of [partnerA, partnerB]) assert.equal(good(await rpc(user, 'influencer_accept_invite')).accepted, true);
    rejected(await rpc(outsider, 'influencer_accept_invite'), 'IP403');
    rejected(await rpc(partnerA, 'hq_influencer_admin_snapshot'), 'IP403');
  });
  await check('unconfirmed email is denied by real Auth; confirming via Auth admin permits acceptance', async () => {
    const denied = await request(AUTH, '/token?grant_type=password', { body: { email: unconfirmed.email, password: unconfirmed.password } });
    rejected(denied); assert.equal(denied.data?.error_code, 'email_not_confirmed');
    good(await request(AUTH, '/admin/users/' + unconfirmed.id, { token: serviceKey, method: 'PUT', body: { email_confirm: true } }));
    await login(unconfirmed); assert.equal(good(await rpc(unconfirmed, 'influencer_accept_invite')).accepted, true);
  });
  const customerA = crypto.randomUUID(), customerUnknown = crypto.randomUUID(), customerB = crypto.randomUUID();
  await check('portal A/B projections isolate partner data and do not equate commissions with first receipts', async () => {
    for (const [id, label] of [[customerA, 'A'], [customerUnknown, 'A'], [customerB, 'B']]) {
      await client.query("insert into hq_referrals_private.customers(id,revision,context,core_state,partner_id,coupon_id,status) values($1,1,$2,'{}',$3,$4,'paid')", [id, { customerLabel: 'PRIVATE-SYNTHETIC-CUSTOMER-' + label, email: 'private-customer-' + label + '@example.test' }, partners[label].id, coupons[label].id]);
    }
    await client.query("insert into hq_referrals_private.commissions(customer_id,partner_id,coupon_id,core_id,core_entry,status,amount_cents,claimable_cents,paid_cents,eligible_at) values($1,$2,$3,'ci-history','{}','paid',1996,1996,1996,now())", [customerB, partners.B.id, coupons.B.id]);
    for (const [label, user, count] of [['A', partnerA, 2], ['B', partnerB, 1]]) {
      const s = good(await rpc(user, 'influencer_portal_snapshot')); assert.equal(s.version, 2);
      assert.equal(s.partner.displayName, 'Synthetic partner ' + label); assert.equal(s.counts.attributed, count);
      assert.equal(s.firstPayments.status, 'unavailable'); assert.equal(s.counts.firstPaymentsAfterTrial, null);
      assert(s.coupons.every(c => c.code === coupons[label].code));
      const serialized = JSON.stringify(s);
      for (const hidden of [customerA, customerB, customerUnknown, 'PRIVATE-SYNTHETIC', '@example.test', 'Synthetic private contact']) assert(!serialized.includes(hidden));
    }
    assert.equal(good(await rpc(partnerB, 'influencer_portal_snapshot')).counts.commissions, 1);
  });
  await check('verified first-payment event yields historical partial count, never fabricated active subscription', async () => {
    const account = { trusted: true, customerId: customerA, provider: 'pagarme', paymentHistoryVerified: true, firstPaidInvoiceId: 'ci-invoice', firstPaidAt: '2020-02-01T10:00:00Z', merchantAccountId: 'ci-merchant', subscriptionId: 'ci-subscription', trialEndsAt: '2020-01-15T10:00:00Z' };
    await client.query('update hq_referrals_private.customers set context=context||jsonb_build_object(\'account\',$2::jsonb) where id=$1', [customerA, account]);
    const body = { kind: 'payment_confirmed', verified: true, verification: { source: 'provider_api', checkedAt: '2020-02-01T10:01:00Z' }, customerId: customerA, provider: 'pagarme', merchantAccountId: 'ci-merchant', subscriptionId: 'ci-subscription', invoiceId: 'ci-invoice', paidAt: account.firstPaidAt, occurredAt: '2020-02-01T10:01:00Z', currency: 'BRL', amountCents: 2994 };
    await client.query("insert into hq_referrals_private.events(provider,merchant_id,event_id,customer_id,body,fingerprint,outcome) values('pagarme','ci-merchant','ci-first-payment',$1,$2,'{}','ci_synthetic_evidence')", [customerA, body]);
    const ledger = good(await rpc(admin, 'hq_referrals_snapshot')); assert.equal(ledger.contractVersion, 2);
    const first = ledger.referrals.find(r => r.id === customerA).firstPayment;
    assert.equal(first.status, 'verified'); assert.equal(first.amountCents, 2994); assert.equal(first.afterTrial, true);
    assert.equal(first.scope, 'historical_first_payment'); assert.equal(first.adjustments.status, 'unknown');
    const s = good(await rpc(partnerA, 'influencer_portal_snapshot'));
    assert.equal(s.firstPayments.status, 'partial'); assert.equal(s.firstPayments.verifiedAfterTrialCount, 1); assert.equal(s.firstPayments.unknownCount, 1);
    assert.equal(s.counts.firstPaymentsAfterTrial, null);
    assert.equal(await scalar('select enabled from hq_referrals_private.campaign'), false);
    observe('first_payment_fixture', 'Synthetic stored provider evidence tests projection only; no gateway verification or payment processing was performed.');
  });
  await check('membership revocation immediately rejects an otherwise valid Auth session', async () => {
    assert.equal(good(await rpc(admin, 'hq_influencer_revoke_access', { p_input: { inviteId: invites.B.id, reason: 'Synthetic access revocation' } })).revoked, true);
    assert.equal(good(await request(AUTH, '/user', { token: partnerB.token, method: 'GET' })).id, partnerB.id);
    rejected(await rpc(partnerB, 'influencer_portal_snapshot'), 'IP403');
  });
  await check('real Auth logout invalidates portal session and refresh while HQ retains unexpired JWT behavior', async () => {
    const session = claims(partnerA.token).session_id;
    good(await request(AUTH, '/logout?scope=local', { token: partnerA.token }));
    assert.equal(await scalar('select exists(select 1 from auth.sessions where id=$1 and user_id=$2)', [session, partnerA.id]), false);
    rejected(await rpc(partnerA, 'influencer_portal_snapshot'), 'IP401');
    rejected(await request(AUTH, '/token?grant_type=refresh_token', { body: { refresh_token: partnerA.refreshToken } }));
    await login(partnerA);
    good(await request(AUTH, '/logout?scope=local', { token: admin.token }));
    assert.equal((await snap(admin)).role, 'admin');
    observe('HQ_logout', 'Current HQ accepts its unexpired signed JWT after Auth logout; role removal still denies immediately. Portal requires an active Auth session.');
    rejected(await rpc(admin, 'hq_influencer_admin_snapshot'), 'IP401');
    await login(admin);
  });
  await check('OPS suspension removes HTTP RPCs; resume restores admin and resets staff gate OFF without losing data', async () => {
    const before = await storedData();
    await client.query(packages.ops.rollback.suspend);
    const missing = await waitRPC(admin, 'hq_ops_snapshot', r => r.status === 404 && r.data?.code === 'PGRST202'); rejected(missing, 'PGRST202', 404);
    rejected(await command(admin, envelope('lead.create', { name: 'Must never be created during suspension' })), 'PGRST202', 404);
    await client.query(packages.ops.rollback.suspend);
    assert.deepEqual(await storedData(), before);
    await client.query(packages.ops.rollback.resume); await waitRPC(admin, 'hq_ops_snapshot', r => r.ok);
    await client.query(packages.ops.rollback.resume);
    assert.equal((await snap(admin)).role, 'admin'); rejected(await rpc(supportB, 'hq_ops_snapshot'), '42501');
    assert.equal(await scalar('select staff_enabled from torque_hq.settings'), false); assert.deepEqual(await storedData(), before);
  });
  await check('optional suspension and ordered resume reload real PostgREST and preserve ledger/memberships/audit', async () => {
    const before = await storedData();
    await client.query(packages.influencer.rollback.suspend);
    await waitRPC(partnerA, 'influencer_portal_snapshot', r => r.status === 404 && r.data?.code === 'PGRST202');
    await client.query(packages.referrals.rollback.suspend);
    await waitRPC(admin, 'hq_referrals_snapshot', r => r.status === 404 && r.data?.code === 'PGRST202');
    rejected(await rpc(admin, 'hq_referrals_save_partner', { p_input: { name: 'Forbidden suspended write', status: 'active' } }), 'PGRST202', 404);
    rejected(await rpc(partnerA, 'influencer_accept_invite'), 'PGRST202', 404);
    await client.query(packages.influencer.rollback.suspend); await client.query(packages.referrals.rollback.suspend);
    await privateBoundary(); assert.deepEqual(await storedData(), before);
    await client.query(packages.referrals.rollback.resume); await waitRPC(admin, 'hq_referrals_snapshot', r => r.ok);
    await client.query(packages.influencer.rollback.resume); await waitRPC(partnerA, 'influencer_portal_snapshot', r => r.ok);
    await client.query(packages.referrals.rollback.resume); await client.query(packages.influencer.rollback.resume);
    assert.deepEqual(await storedData(), before); assert.equal(await scalar('select enabled from hq_referrals_private.campaign'), false);
    assert.equal(good(await rpc(partnerA, 'influencer_portal_snapshot')).firstPayments.verifiedAfterTrialCount, 1);
    rejected(await rpc(partnerB, 'influencer_portal_snapshot'), 'IP403');
    await privateBoundary();
  });
  // Team is installed only now: the existing OPS recovery check has restored
  // staff_enabled=false. These extra checks do not change the earlier modules.
  const teamCommand = (user, value) => rpc(user, 'hq_team_command', { p_input: value });
  const teamSnapshot = async user => good(await rpc(user, 'hq_team_snapshot'));
  async function protectedTeamAccess() {
    // Synthetic identities only, projected to authority fields. Password hashes,
    // sessions, tokens and metadata bodies are never read or placed in evidence.
    return scalar(`select jsonb_build_object(
      'identities',(select jsonb_agg(jsonb_build_object('id',id,'role',role) order by id) from auth.users),
      'admins',(select jsonb_agg(to_jsonb(a) order by user_id) from public.saas_admins a),
      'staff',(select jsonb_agg(to_jsonb(s) order by user_id) from torque_hq.staff s),
      'scope',(select jsonb_agg(to_jsonb(s) order by user_id,account_id) from torque_hq.staff_account_scope s),
      'gate',(select staff_enabled from torque_hq.settings where id),
      'roleGrants',(select jsonb_agg(jsonb_build_array(roleid,member,grantor,admin_option) order by roleid,member,grantor) from pg_catalog.pg_auth_members),
      'invitations',(select count(*) from hq_influencer_private.invites))`);
  }
  const teamFunctionState = async () => (await client.query(`select p.oid,n.nspname,p.proname,p.proowner,p.proacl::text acl,
    p.proconfig,md5(p.prosrc) body_hash,p.proargtypes::text arguments
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='public' and left(p.proname,8)='hq_team_')
       or (n.nspname='torque_hq' and (left(p.proname,15)='suspended_team_' or left(p.proname,8)='hq_team_'))
    order by p.oid`)).rows;
  let teamNotifications = 0;
  client.on('notification', event => { if (event.channel === 'pgrst' && event.payload === 'reload schema') teamNotifications++; });
  await client.query('listen pgrst');
  async function refusedTeamScript(sql) {
    const data = await storedData(), authority = await protectedTeamAccess(), functions = await teamFunctionState();
    const notifications = teamNotifications;
    await assert.rejects(() => client.query(sql), error => error.code === '55000');
    await client.query('rollback');
    assert.deepEqual(await storedData(), data); assert.deepEqual(await protectedTeamAccess(), authority);
    assert.deepEqual(await teamFunctionState(), functions); assert.equal(teamNotifications, notifications);
  }
  await check('team versioned migration adds only an empty administrative registry', async () => {
    const authority = await protectedTeamAccess();
    assert.equal(authority.gate, false);
    assert.equal(await scalar("select to_regclass('torque_hq.team_registry') is null"), true);
    for (const sql of packages.team.migrations) await client.query(sql);
    await waitRPC(admin, 'hq_team_snapshot', result => result.ok);
    const s = await teamSnapshot(admin);
    assert.equal(s.schemaVersion, 1); assert.equal(s.currentUserId, admin.id);
    assert.deepEqual(s.permissions, ['team.read', 'team.write', 'team.review']);
    assert.deepEqual(s.team, []); assert.deepEqual(s.audit, []);
    assert.equal(s.sources.team.scope, 'administrativeRegistryOnly');
    assert.equal(s.meta.staffGateEnabled, false); assert.equal(s.meta.accessProvisioningAvailable, false);
    assert.equal(s.meta.externalEffect, false); assert.equal(s.meta.roleMatrixKind, 'referenceOnly');
    assert(s.meta.roleMatrix.every(row => row.effectiveAccess === false));
    assert.deepEqual(await protectedTeamAccess(), authority);
  });
  let teamCreate, teamId, teamAuthority;
  await check('team anonymous, outsider, forged metadata, staff and service key are denied', async () => {
    teamAuthority = await protectedTeamAccess();
    const deniedCreate = envelope('team.create', { name: 'Denied synthetic team record', proposedRole: 'admin' });
    for (const actor of [undefined, anonKey, outsider, supportA, supportB, finance, partnerA, partnerB, serviceKey]) {
      rejected(await rpc(actor, 'hq_team_snapshot'), '42501');
      rejected(await teamCommand(actor, deniedCreate), '42501');
    }
    assert.equal(claims(outsider.token).user_metadata.role, 'admin');
    await client.query('update torque_hq.settings set staff_enabled=true where id'); // Explicit test fixture only.
    for (const role of ['finance', 'sales', 'support', 'engineering', 'viewer']) {
      await client.query('update torque_hq.staff set role=$1 where user_id=$2', [role, finance.id]);
      assert.equal((await snap(finance)).role, role);
      rejected(await rpc(finance, 'hq_team_snapshot'), '42501');
      rejected(await teamCommand(finance, deniedCreate), '42501');
    }
    await client.query("update torque_hq.staff set role='finance' where user_id=$1", [finance.id]);
    await client.query('update torque_hq.settings set staff_enabled=false where id');
    assert.deepEqual(await protectedTeamAccess(), teamAuthority);
    assert.deepEqual((await teamSnapshot(admin)).team, []);
  });
  await check('team admin creation is idempotent and proposed administrator never gains access', async () => {
    teamCreate = envelope('team.create', { name: 'Synthetic administrative member', contact: outsider.email, proposedRole: 'admin' });
    const first = good(await teamCommand(admin, teamCreate)); teamId = first.id;
    assert(first.ok); assert.equal(first.externalEffect, false); assert.equal(first.accessGranted, false);
    assert.equal(first.member.effectiveAccess, false); assert.equal(first.member.createdBy, admin.id);
    assert.equal(first.member.version, 1); assert.equal(first.member.reviewStatus, 'pending');
    assert.equal(first.member.accessState, 'accessPending'); assert.equal(Object.hasOwn(first.member, 'authUserId'), false);
    const replay = good(await teamCommand(admin, teamCreate)); assert.equal(replay.id, teamId); assert.equal(replay.replayed, true);
    rejected(await teamCommand(admin, { ...teamCreate, payload: { ...teamCreate.payload, proposedRole: 'finance' } }), '22023');
    assert.equal(Number(await scalar('select count(*) from torque_hq.team_registry')), 1);
    assert.equal(Number(await scalar('select count(*) from torque_hq.team_registry_audit')), 1);
    assert.equal(Number(await scalar('select count(*) from torque_hq.team_registry_commands')), 1);
    assert.deepEqual(await protectedTeamAccess(), teamAuthority);
    rejected(await rpc(outsider, 'hq_team_snapshot'), '42501'); rejected(await rpc(outsider, 'hq_ops_snapshot'), '42501');
  });
  await check('team review, edit, status and version rules persist without provisioning any access', async () => {
    let r = good(await teamCommand(admin, envelope('team.review', { id: teamId, expectedVersion: 1, reviewStatus: 'approved' })));
    assert.equal(r.member.reviewedBy, admin.id); assert.equal(r.member.version, 2); assert.equal(r.member.reviewStatus, 'approved');
    assert.equal(r.accessGranted, false); rejected(await rpc(outsider, 'hq_team_snapshot'), '42501');
    const beforeConflict = await storedData();
    // A business-version conflict must return once, not ask PostgREST to retry
    // the transaction as SQLSTATE 40001 would on the pinned PostgREST 14.
    rejected(await teamCommand(admin, envelope('team.update', { id: teamId, expectedVersion: 1, name: 'Stale synthetic edit' })), 'PT409', 409);
    assert.deepEqual(await storedData(), beforeConflict);
    r = good(await teamCommand(admin, envelope('team.update', { id: teamId, expectedVersion: 2, contact: '', proposedRole: 'support' })));
    assert.equal(r.member.contact, ''); assert.equal(r.member.version, 3); assert.equal(r.member.reviewStatus, 'pending'); assert.equal(r.member.reviewedAt, null);
    r = good(await teamCommand(admin, envelope('team.setStatus', { id: teamId, expectedVersion: 3, status: 'inactive' })));
    assert.equal(r.member.accessState, 'disabled'); assert.equal(r.member.version, 4);
    rejected(await teamCommand(admin, envelope('team.review', { id: teamId, expectedVersion: 4, reviewStatus: 'approved' })), '22023');
    r = good(await teamCommand(admin, envelope('team.setStatus', { id: teamId, expectedVersion: 4, status: 'active' })));
    assert.equal(r.member.version, 5); assert.equal(r.member.accessState, 'accessPending'); assert.equal(r.member.reviewStatus, 'pending');
    r = good(await teamCommand(admin, envelope('team.review', { id: teamId, expectedVersion: 5, reviewStatus: 'rejected' })));
    assert.equal(r.member.version, 6); assert.equal(r.member.reviewStatus, 'rejected'); assert.equal(r.member.effectiveAccess, false);
    const s = await teamSnapshot(admin); assert.equal(s.team.length, 1); assert.equal(s.team[0].version, 6); assert.equal(s.audit.length, 6);
    assert(s.audit.every(row => row.actorId === admin.id && row.reason && row.changedFields.length));
    assert(s.audit.every(row => !Object.hasOwn(row.after, 'name') && !Object.hasOwn(row.after, 'contact')));
    assert.equal(good(await teamCommand(admin, teamCreate)).replayed, true);
    assert.equal((await teamSnapshot(admin)).team[0].version, 6); // Replay is a historical receipt, not a reset.
    assert.deepEqual(await protectedTeamAccess(), teamAuthority);
  });
  await check('team rejects injected authority, unsupported delete/invite and malformed versions atomically', async () => {
    const before = await storedData();
    for (const injected of [{ userId: outsider.id }, { effectiveAccess: true }, { permissions: ['team.write'] }, { staff_enabled: true }]) {
      rejected(await teamCommand(admin, envelope('team.create', { name: 'Invalid synthetic record', proposedRole: 'viewer', ...injected })), '22023');
    }
    for (const type of ['team.delete', 'team.invite', 'staff.grant', 'settings.enableStaff']) rejected(await teamCommand(admin, envelope(type, { id: teamId })), '22023');
    for (const expectedVersion of [null, '6', 0, -1, 1.5, 2147483647]) rejected(await teamCommand(admin, envelope('team.setStatus', { id: teamId, expectedVersion, status: 'inactive' })), '22023');
    rejected(await teamCommand(admin, { ...envelope('team.create', { name: 'Invalid reason', proposedRole: 'viewer' }), reason: '' }), '22023');
    rejected(await teamCommand(admin, { ...envelope('team.create', { name: 'Invalid envelope role', proposedRole: 'viewer' }), role: 'admin' }), '22023');
    rejected(await teamCommand(outsider, envelope('team.update', { id: teamId, expectedVersion: 6, name: 'Known ID attack' })), '42501');
    rejected(await teamCommand(outsider, envelope('team.review', { id: teamId, expectedVersion: 6, reviewStatus: 'approved' })), '42501');
    assert.deepEqual(await storedData(), before); assert.deepEqual(await protectedTeamAccess(), teamAuthority);
  });
  await check('team admin revocation precedes replay even while the Auth session stays valid', async () => {
    const before = await storedData();
    await client.query('delete from public.saas_admins where user_id=$1', [admin.id]);
    assert.equal(good(await request(AUTH, '/user', { token: admin.token, method: 'GET' })).id, admin.id);
    rejected(await rpc(admin, 'hq_team_snapshot'), '42501'); rejected(await teamCommand(admin, teamCreate), '42501');
    await client.query('insert into public.saas_admins(user_id) values($1)', [admin.id]);
    assert.equal(good(await teamCommand(admin, teamCreate)).replayed, true);
    assert.deepEqual(await storedData(), before); assert.deepEqual(await protectedTeamAccess(), teamAuthority);
  });
  async function teamPrivateBoundary(parked = false) {
    for (const actor of [anonKey, admin.token, outsider.token, serviceKey]) {
      for (const table of ['team_registry', 'team_registry_commands', 'team_registry_audit']) {
        rejected(await request(REST, '/' + table + '?select=*', { token: actor, method: 'GET', headers: { 'Accept-Profile': 'torque_hq' } }), 'PGRST106', 406);
        rejected(await request(REST, '/' + table, { token: actor, body: {}, headers: { 'Content-Profile': 'torque_hq' } }), 'PGRST106', 406);
      }
      rejected(await request(REST, '/rpc/team_require_admin', { token: actor, headers: { 'Content-Profile': 'torque_hq' } }), 'PGRST106', 406);
    }
    for (const role of ['anon', 'authenticated', 'service_role']) {
      const state = (await client.query(`select
        has_schema_privilege($1,'torque_hq','usage') schema_usage,
        has_function_privilege($1,'torque_hq.team_require_admin()','execute') helper,
        has_function_privilege($1,$2,'execute') snapshot,
        has_function_privilege($1,$3,'execute') command`, [role,
        parked ? 'torque_hq.suspended_team_snapshot()' : 'public.hq_team_snapshot()',
        parked ? 'torque_hq.suspended_team_command(jsonb)' : 'public.hq_team_command(jsonb)'])).rows[0];
      assert.equal(state.schema_usage, false); assert.equal(state.helper, false);
      assert.equal(state.snapshot, !parked && role === 'authenticated'); assert.equal(state.command, !parked && role === 'authenticated');
    }
    await privateBoundary(); // Includes RLS and table privilege checks for the new three tables.
  }
  await check('team private registry, command receipts and audit are denied by HTTP schema boundary and ACL', () => teamPrivateBoundary());
  // Controlled DDL drift is created only inside this disposable test database.
  // It is an admin-guarded legacy-shaped overload, not an authorization bypass.
  const teamOverload = `create function public.hq_team_snapshot(p_filter text) returns jsonb
    language plpgsql security definer set search_path='' as $$ begin
      perform torque_hq.team_require_admin();
      return jsonb_build_object('syntheticLegacy',true,'count',(select count(*) from torque_hq.team_registry));
    end $$;
    revoke all on function public.hq_team_snapshot(text) from public,anon,authenticated,service_role;
    grant execute on function public.hq_team_snapshot(text) to authenticated;
    notify pgrst,'reload schema';`;
  await check('team install and suspension reject callable legacy overload without changing data, ACL or endpoints', async () => {
    await client.query(teamOverload);
    await waitRPC(admin, 'hq_team_snapshot', result => result.ok && result.data?.syntheticLegacy === true, { p_filter: '' });
    await refusedTeamScript(packages.team.migrations[0]);
    await refusedTeamScript(packages.team.rollback.suspend);
    assert.equal(good(await rpc(admin, 'hq_team_snapshot', { p_filter: '' })).syntheticLegacy, true);
    assert.equal((await teamSnapshot(admin)).team[0].version, 6);
    await client.query("drop function public.hq_team_snapshot(text); notify pgrst,'reload schema'");
    await waitRPC(admin, 'hq_team_snapshot', result => result.status === 404 && result.data?.code === 'PGRST202', { p_filter: '' });
  });
  await check('team suspension reloads PostgREST, denies reads and writes and preserves OIDs and stored records', async () => {
    const before = await storedData(), functions = await teamFunctionState();
    await client.query(packages.team.rollback.suspend);
    await waitRPC(admin, 'hq_team_snapshot', result => result.status === 404 && result.data?.code === 'PGRST202');
    rejected(await teamCommand(admin, teamCreate), 'PGRST202', 404);
    await teamPrivateBoundary(true);
    const paused = await teamFunctionState();
    assert.deepEqual(paused.map(f => [f.oid, f.proowner, f.body_hash]), functions.map(f => [f.oid, f.proowner, f.body_hash]));
    await client.query(packages.team.rollback.suspend);
    assert.deepEqual(await storedData(), before); assert.deepEqual(await teamFunctionState(), paused);
    assert.deepEqual(await protectedTeamAccess(), teamAuthority);
  });
  await check('team resume rejects an exposed overload and suspended OPS dependency atomically', async () => {
    await client.query(teamOverload);
    await waitRPC(admin, 'hq_team_snapshot', result => result.ok && result.data?.syntheticLegacy === true, { p_filter: '' });
    await refusedTeamScript(packages.team.rollback.resume);
    assert.equal(good(await rpc(admin, 'hq_team_snapshot', { p_filter: '' })).syntheticLegacy, true);
    await client.query("drop function public.hq_team_snapshot(text); notify pgrst,'reload schema'");
    await waitRPC(admin, 'hq_team_snapshot', result => result.status === 404 && result.data?.code === 'PGRST202', { p_filter: '' });
    await client.query(packages.ops.rollback.suspend);
    await waitRPC(admin, 'hq_ops_snapshot', result => result.status === 404 && result.data?.code === 'PGRST202');
    await refusedTeamScript(packages.team.rollback.resume);
    await client.query(packages.ops.rollback.resume); await waitRPC(admin, 'hq_ops_snapshot', result => result.ok);
  });
  await check('team resume restores only admin HTTP functionality, with identical OIDs, data and no staff activation', async () => {
    const before = await storedData(), paused = await teamFunctionState();
    await client.query(packages.team.rollback.resume); await waitRPC(admin, 'hq_team_snapshot', result => result.ok);
    const resumed = await teamFunctionState();
    assert.deepEqual(resumed.map(f => [f.oid, f.proowner, f.body_hash]), paused.map(f => [f.oid, f.proowner, f.body_hash]));
    await client.query(packages.team.rollback.resume);
    assert.deepEqual(await teamFunctionState(), resumed); assert.deepEqual(await storedData(), before);
    assert.equal((await teamSnapshot(admin)).team[0].version, 6);
    assert.equal(good(await teamCommand(admin, teamCreate)).replayed, true);
    rejected(await rpc(outsider, 'hq_team_snapshot'), '42501'); rejected(await rpc(finance, 'hq_team_snapshot'), '42501');
    await teamPrivateBoundary(); assert.deepEqual(await protectedTeamAccess(), teamAuthority);
    assert(teamNotifications >= 6);
    observe('team', 'Versioned administrative registry tested via real Auth JWTs and direct PostgREST; no Auth users, staff, invitations, scopes or access grants are provisioned by team operations.');
    observe('team_recovery', 'Real HTTP disappearance/restoration confirms PostgREST cache reload; synthetic legacy overload is refused atomically, preserved until its explicit fixture cleanup.');
  });
  // Test later additive migrations after the original release/suspension contracts.
  // User identities and tokens remain those issued by real GoTrue above.
  await require('./test-operacao-http.cjs')({ client, check, rpc, good, rejected, waitRPC,
    rest: (route, options) => request(REST, route, options),
    users, accountA, accountB, anonKey, serviceKey });
  const billingDeps={ client, check, rpc, good, rejected, waitRPC,
    rest:(route,options)=>request(REST,route,options),
    createUser, sessionId: user => claims(user.token).session_id,
    revokeSession: async user => {
      const id=claims(user.token).session_id;
      good(await request(AUTH, '/logout?scope=local', { token:user.token }));
      assert.equal(await scalar('select exists(select 1 from auth.sessions where id=$1)',[id]),false);
    }, anonKey, serviceKey, transport:'http-real-auth' };
  await require('./test-personal-billing-http.cjs')(billingDeps);
  await require('./test-personal-billing-access-http.cjs')(billingDeps);
  await require('./test-personal-signup-http.cjs')(billingDeps);
  observe('scope', 'Direct official Auth + PostgREST only. Kong/Envoy gateway, hosted project configuration, SMTP, frontend browser, MFA and production are outside this run.');
  summary.status = 'pass'; console.log('PASS ' + summary.checks.length + ' real Auth/PostgREST HTTP groups');
}
function writeSummary() {
  if (!process.env.HQ_AUTH_CI_ARTIFACT_DIR) return;
  const permitted = path.resolve(__dirname, '../../artifacts/hq-auth-ci');
  const requested = path.resolve(process.env.HQ_AUTH_CI_ARTIFACT_DIR);
  if (requested !== permitted) return;
  fs.mkdirSync(permitted, { recursive: true });
  fs.writeFileSync(path.join(permitted, 'checks.json'), JSON.stringify(summary, null, 2) + '\n');
}
main().catch(error => {
  summary.status = 'fail'; summary.failure = { check: phase, operation, code: safeCode(typeof error.code === 'string' ? error.code : error.name) };
  // Never print arbitrary errors, stack traces, HTTP bodies, user identities, or JWTs.
  console.error('FAIL ' + phase + ' [' + summary.failure.code + '] operation=' + operation); process.exitCode = 1;
}).finally(async () => { if (client) await client.end().catch(() => {}); writeSummary(); });
