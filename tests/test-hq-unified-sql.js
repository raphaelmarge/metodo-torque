/* Integration of the three LOCAL domains and the ledger contract correction in
 * one ephemeral PostgreSQL/WASM.
 * No network, Supabase URL, credentials, migrations in production or real users.
 * Historical ledger fixtures are inserted only by this disposable DB's owner;
 * the actual campaign remains OFF throughout. PGlite does not verify HTTP Auth
 * middleware or scheduling/locks across independent PostgreSQL connections.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('./runtime/node_modules/@electric-sql/pglite');
const uid = n => `50000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const users = Object.fromEntries(['admin','finance','support','sales','engineering','viewer','partnerA','partnerB','outsider','unverified'].map((name,i) => [name,uid(i+1)]));
const sessions = Object.fromEntries(Object.keys(users).map((name,i) => [name,uid(i+1001)]));
const accountA = uid(101), accountB = uid(102), customerA = uid(201), customerB = uid(202);
const files = [
  '../supabase/migrations/20260930193716_hq_referrals_ledger.sql',
  '../supabase/hq-referrals-payment-contract-proposal.sql',
  '../supabase/hq-ops-proposal.sql',
  '../supabase/hq-influencer-portal-proposal.sql'
];
let checks = 0, sequence = 0;
async function test(name, run) { await run(); console.log('OK ' + (++checks) + ' - ' + name); }
async function denied(run, code) { await assert.rejects(run, error => error.code === code); }

(async () => {
  const db = new PGlite();
  let partnerA, partnerB, couponA, couponB, inviteA, inviteB, invoiceId, expenseId;
  let ledgerDefinition, opsDefinition;
  const expiry = new Date(Date.now() + 7 * 86400000).toISOString();
  async function actor(name, role = 'authenticated') {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify(name ? { sub: users[name], session_id: sessions[name], role: 'authenticated' } : {})]);
    if (role !== 'owner') await db.exec('set role ' + role);
  }
  async function rpc(name, input) {
    return (await db.query('select public.' + name + '(' + (input === undefined ? '' : '$1') + ') as value', input === undefined ? [] : [input])).rows[0].value;
  }
  async function ops(type, payload, idempotencyKey = 'unified-local-' + (++sequence)) {
    return rpc('hq_ops_command', { type, payload, idempotencyKey, reason: 'Conferência da integração local' });
  }
  async function scalar(sql, args = []) { return Object.values((await db.query(sql, args)).rows[0])[0]; }
  async function definition(schema) {
    return (await db.query(`select p.proname,pg_get_function_identity_arguments(p.oid) args,md5(pg_get_functiondef(p.oid)) hash
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=$1 order by p.proname,args`, [schema])).rows;
  }
  async function historicLedgerFixture(customerId, partner, coupon, status, paidCents) {
    await db.query("insert into hq_referrals_private.customers(id,revision,context,core_state,partner_id,coupon_id,status) values($1,1,$2,'{}',$3,$4,'paid')", [customerId, { customerLabel: 'PRIVATE CUSTOMER SENTINEL', email: 'private-customer@example.test', health: 'PRIVATE HEALTH SENTINEL' }, partner.id, coupon.id]);
    await db.query("insert into hq_referrals_private.commissions(id,customer_id,partner_id,coupon_id,core_id,core_entry,status,amount_cents,claimable_cents,paid_cents,eligible_at) values($1,$2,$3,$4,$5,'{}',$6,1996,1996,$7,now())", [customerId === customerA ? uid(301) : uid(302), customerId, partner.id, coupon.id, 'synthetic-historical-' + customerId, status, paidCents]);
  }
  try {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
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
    `);
    for (const name of Object.keys(users)) {
      await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,$3)', [users[name], name.toLowerCase() + '@example.test', name === 'unverified' ? null : '2026-01-01T12:00:00Z']);
      await db.query('insert into auth.sessions(id,user_id) values($1,$2)', [sessions[name], users[name]]);
    }
    await db.query('insert into public.saas_admins values($1)', [users.admin]);
    await db.query("insert into public.academias(id,nome,assinatura_status) values($1,'Conta Exemplo A','trial'),($2,'Conta Exemplo B','ativa')", [accountA, accountB]);
    await db.query("insert into public.saas_clientes values($1,'personal','trial'),($2,'personal','ativo')", [accountA, accountB]);

    await test('Propostas e correcao incremental aplicam juntas sem substituir contratos de outros modulos', async () => {
      const gateBefore = await scalar("select md5(pg_get_functiondef('public.hq_sou_admin()'::regprocedure))");
      await db.exec(fs.readFileSync(path.join(__dirname, files[0]), 'utf8'));
      await db.exec(fs.readFileSync(path.join(__dirname, files[1]), 'utf8'));
      ledgerDefinition = await definition('hq_referrals_private');
      await db.exec(fs.readFileSync(path.join(__dirname, files[2]), 'utf8'));
      opsDefinition = await definition('torque_hq');
      await db.exec(fs.readFileSync(path.join(__dirname, files[3]), 'utf8'));
      assert.deepEqual(await definition('hq_referrals_private'), ledgerDefinition);
      assert.deepEqual(await definition('torque_hq'), opsDefinition);
      assert.equal(await scalar("select md5(pg_get_functiondef('public.hq_sou_admin()'::regprocedure))"), gateBefore);
      assert.equal(await scalar('select count(*)::int from torque_hq.staff'), 0);
      assert.equal(await scalar('select count(*)::int from hq_influencer_private.memberships'), 0);
      assert.equal(await scalar('select count(*)::int from auth.users'), Object.keys(users).length);
    });
    for (const role of ['finance','support','sales','engineering','viewer']) await db.query('insert into torque_hq.staff(user_id,role,enabled) values($1,$2,true)', [users[role], role]);
    await test('Instalacao minima nega staff mesmo se uma linha habilitada existir', async () => {
      assert.equal(await scalar('select staff_enabled from torque_hq.settings where id'), false);
      for (const name of ['finance','support','sales','engineering','viewer']) {
        await actor(name); await denied(() => rpc('hq_ops_snapshot'), '42501');
        await denied(() => ops('lead.create', { name: 'Nao deve existir' }), '42501');
      }
      await actor('admin'); assert.equal((await rpc('hq_ops_snapshot')).role, 'admin');
      await actor(null, 'owner');
      // Optional staff mode is enabled only in this disposable fixture, never by installation.
      await db.exec('update torque_hq.settings set staff_enabled=true where id');
    });

    await test('Schemas continuam privados, todas as tabelas têm RLS e nenhum papel API ganha escrita direta', async () => {
      const tables = (await db.query(`select n.nspname,c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname in ('torque_hq','hq_referrals_private','hq_influencer_private') and c.relkind='r'`)).rows;
      assert.equal(tables.length, 27); assert.ok(tables.every(t => t.relrowsecurity));
      for (const role of ['anon','authenticated','service_role']) for (const table of tables) {
        const name = table.nspname + '.' + table.relname;
        assert.equal(await scalar('select has_table_privilege($1,$2,$3)', [role, name, 'SELECT,INSERT,UPDATE,DELETE']), false, role + ' / ' + name);
      }
      const duplicateRpc = await scalar(`select count(*)::int from (select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and (proname like 'hq_ops_%' or proname like 'hq_referrals_%' or proname like 'hq_influencer_%' or proname like 'influencer_%') group by proname having count(*)>1) x`);
      assert.equal(duplicateRpc, 0);
    });

    await test('Admin conserva seus três contratos e campanha comercial permanece OFF', async () => {
      await actor('admin');
      const operations = await rpc('hq_ops_snapshot'), ledger = await rpc('hq_referrals_snapshot'), invites = await rpc('hq_influencer_admin_snapshot');
      assert.equal(operations.role, 'admin'); assert.equal(operations.accounts.length, 2); assert.ok(operations.permissions.includes('reports.export'));
      assert.equal(ledger.campaign.enabled, false); assert.equal(ledger.campaign.approved, true);
      assert.deepEqual([ledger.campaign.basePriceCents,ledger.campaign.discountBps,ledger.campaign.commissionBps,ledger.campaign.reserveBps,ledger.campaign.torqueBps], [4990,4000,4000,1000,1000]);
      assert.deepEqual(ledger.commissions, []); assert.deepEqual(invites.invites, []); assert.equal(invites.deliveryAvailable, false);
      assert.equal(operations.sources.subscriptions.status, 'unavailable'); assert.equal(operations.sources.legacySupport.migrationPending, true);
      partnerA = await rpc('hq_referrals_save_partner', { name: 'Parceiro Exemplo A', contact: 'PRIVATE CONTACT SENTINEL A', status: 'active' });
      partnerB = await rpc('hq_referrals_save_partner', { name: 'Parceiro Exemplo B', contact: 'PRIVATE CONTACT SENTINEL B', status: 'active' });
      couponA = await rpc('hq_referrals_save_coupon', { partnerId: partnerA.id, code: 'UNIFIED_A', status: 'ready' });
      couponB = await rpc('hq_referrals_save_coupon', { partnerId: partnerB.id, code: 'UNIFIED_B', status: 'ready' });
    });

    await test('Financeiro opera livro manual sem herdar convites, administração de cupons ou ledger de parceiros', async () => {
      await actor('finance'); assert.equal(await rpc('hq_sou_admin'), false);
      const s = await rpc('hq_ops_snapshot'); assert.equal(s.role, 'finance'); assert.ok(s.permissions.includes('finance.write'));
      assert.equal(s.audit.length, 0); assert.equal(s.sources.payments.scope, 'manualOnly');
      for (const [name,input] of [['hq_influencer_admin_snapshot'],['hq_influencer_list_invites'],['hq_influencer_prepare_invite',{}],['hq_influencer_revoke_access',{}]]) await denied(() => rpc(name,input), 'IP403');
      for (const [name,input] of [['hq_referrals_snapshot'],['hq_referrals_save_partner',{}],['hq_referrals_save_coupon',{}],['hq_referrals_review',{}],['hq_referrals_record_payment',{}]]) await denied(() => rpc(name,input), 'HQ403');
      await denied(() => rpc('hq_referrals_load_customer', customerA), '42501');
      await denied(() => rpc('hq_referrals_commit_customer', {}), '42501');
      await denied(() => rpc('influencer_accept_invite'), 'IP403');
      await denied(() => rpc('influencer_portal_snapshot'), 'IP403');
      const invoice = await ops('invoice.create', { accountId: accountA, label: 'Fatura manual integrada', totalCents: 4990, dueDate: '2026-10-21' }); invoiceId = invoice.id;
      await ops('invoice.recordPayment', { id: invoiceId, amountCents: 2994, paidAt: '2020-01-01', reference: 'PRIVATE MANUAL RECEIPT' });
      const expense = await ops('expense.create', { payee: 'Fornecedor Exemplo', label: 'Despesa manual integrada', totalCents: 499, dueDate: '2026-10-21' }); expenseId = expense.id;
      await ops('expense.recordPayment', { id: expenseId, amountCents: 499, paidAt: '2020-01-01', reference: 'PRIVATE MANUAL EXPENSE' });
      const after = await rpc('hq_ops_snapshot'); assert.equal(after.invoices[0].status, 'partial'); assert.equal(after.expenses[0].status, 'paid');
      assert.deepEqual([after.payments[0].amountCents,after.expensePayments[0].amountCents], [2994,499]);
      await actor('admin'); const ledger = await rpc('hq_referrals_snapshot'); assert.equal(ledger.commissions.length, 0); assert.equal(ledger.payments.length, 0);
    });

    await test('Papel de operação não concede acesso por outro módulo ou por metadata editável', async () => {
      await actor(null, 'owner');
      await db.query('update auth.users set raw_user_meta_data=$1 where id=$2', [{ role: 'admin', partnerId: partnerA.id, email: 'partnera@example.test' }, users.outsider]);
      for (const name of ['support','sales','engineering','viewer']) {
        await actor(name); assert.equal((await rpc('hq_ops_snapshot')).role, name);
        await denied(() => rpc('hq_referrals_snapshot'), 'HQ403'); await denied(() => rpc('hq_influencer_admin_snapshot'), 'IP403');
        await denied(() => rpc('influencer_portal_snapshot'), 'IP403');
      }
      await actor('outsider'); await denied(() => rpc('hq_ops_snapshot'), '42501'); await denied(() => rpc('hq_referrals_snapshot'), 'HQ403');
      await denied(() => rpc('hq_influencer_admin_snapshot'), 'IP403'); await denied(() => rpc('influencer_accept_invite'), 'IP403');
    });

    await test('Convites preparam vínculo sem criar usuários, enviar mensagens ou habilitar campanha', async () => {
      await actor('admin');
      inviteA = await rpc('hq_influencer_prepare_invite', { partnerId: partnerA.id, email: 'PARTNERA@example.test', expiresAt: expiry, reason: 'Piloto fictício integrado A' });
      inviteB = await rpc('hq_influencer_prepare_invite', { partnerId: partnerB.id, email: 'partnerb@example.test', expiresAt: expiry, reason: 'Piloto fictício integrado B' });
      assert.equal(inviteA.authUserCreated, false); assert.equal(inviteA.delivery, 'unavailable');
      assert.equal((await rpc('hq_influencer_admin_snapshot')).invites.length, 2);
      assert.equal((await rpc('hq_referrals_snapshot')).campaign.enabled, false);
      await actor(null, 'owner'); assert.equal(await scalar('select count(*)::int from auth.users'), Object.keys(users).length);
      assert.equal(await scalar('select count(*)::int from hq_influencer_private.memberships'), 0);
    });

    await test('Parceiro aceita somente seu convite confirmado, sem escolher ID de outro parceiro', async () => {
      await actor('outsider'); await denied(() => rpc('influencer_accept_invite'), 'IP403');
      await actor('unverified'); await denied(() => rpc('influencer_accept_invite'), 'IP403');
      await actor('partnerA'); assert.deepEqual(await rpc('influencer_accept_invite'), { accepted: true });
      assert.deepEqual(await rpc('influencer_accept_invite'), { accepted: true });
      await actor('partnerB'); assert.deepEqual(await rpc('influencer_accept_invite'), { accepted: true });
      await denied(() => db.query('select public.influencer_portal_snapshot($1::uuid)', [partnerA.id]), '42883');
      await actor(null, 'owner'); assert.equal(await scalar('select count(*)::int from hq_influencer_private.memberships'), 2);
    });

    await test('Histórico sintético reutiliza o ledger existente; nenhum segundo ledger nasce no portal', async () => {
      await actor(null, 'owner');
      await historicLedgerFixture(customerA, partnerA, couponA, 'paid', 1996);
      await historicLedgerFixture(customerB, partnerB, couponB, 'pending', 0);
      await db.query('insert into hq_referrals_private.payments(id,partner_id,amount_cents,reference,operation_id,actor_id) values($1,$2,1996,$3,$4,$5)', [uid(401),partnerA.id,'PRIVATE BANK SENTINEL',uid(501),users.admin]);
      const portalTables = (await db.query("select tablename from pg_tables where schemaname='hq_influencer_private' order by tablename")).rows.map(x => x.tablename);
      assert.deepEqual(portalTables, ['audit','invites','memberships']);
      assert.equal(await scalar('select count(*)::int from torque_hq.payments'), 1);
      assert.equal(await scalar('select count(*)::int from hq_referrals_private.payments'), 1);
      assert.equal(await scalar('select enabled from hq_referrals_private.campaign'), false);
    });

    await test('Portais A/B veem somente projeção de seus cupons e saldos sem PII ou financeiro operacional', async () => {
      await actor('partnerA'); const a = await rpc('influencer_portal_snapshot');
      await actor('partnerB'); const b = await rpc('influencer_portal_snapshot');
      assert.equal(a.partner.displayName, 'Parceiro Exemplo A'); assert.equal(b.partner.displayName, 'Parceiro Exemplo B');
      assert.deepEqual(a.coupons.map(x => x.code), ['UNIFIED_A']); assert.deepEqual(b.coupons.map(x => x.code), ['UNIFIED_B']);
      assert.deepEqual([a.counts.attributed,a.balances.paidCents,a.payments.length], [1,1996,1]);
      assert.deepEqual([b.counts.attributed,b.balances.pendingCents,b.payments.length], [1,1996,0]);
      assert.equal(a.counts.firstPaymentsAfterTrial, null);
      assert.equal(b.counts.firstPaymentsAfterTrial, null);
      assert.equal(a.firstPayments.unknownCount, 1);
      assert.equal(b.firstPayments.unknownCount, 1);
      assert.equal(a.campaign.enabled, false); assert.equal(b.campaign.enabled, false);
      const serialized = JSON.stringify(a) + JSON.stringify(b);
      for (const forbidden of ['PRIVATE',customerA,customerB,accountA,accountB,invoiceId,expenseId,'example.test','customerLabel','customerId','partnerId']) assert.equal(serialized.includes(forbidden), false, forbidden);
      assert.equal(a.availability.automaticTransfer, false); assert.equal(a.availability.payoutDetails, false);
    });

    await test('Membership não promove parceiro a operador, administrador ou ingestão privilegiada', async () => {
      for (const name of ['partnerA','partnerB']) {
        await actor(name); assert.equal(await rpc('hq_sou_admin'), false);
        await denied(() => rpc('hq_ops_snapshot'), '42501');
        await denied(() => ops('expense.create', { payee: 'Ataque', label: 'Ataque', dueDate: '2026-10-21', totalCents: 100 }), '42501');
        await denied(() => rpc('hq_referrals_snapshot'), 'HQ403');
        await denied(() => rpc('hq_referrals_save_partner', { name: 'Ataque', status: 'active' }), 'HQ403');
        await denied(() => rpc('hq_referrals_record_payment', {}), 'HQ403');
        await denied(() => rpc('hq_referrals_load_customer', customerA), '42501');
        await denied(() => rpc('hq_referrals_commit_customer', {}), '42501');
        await denied(() => rpc('hq_influencer_list_invites'), 'IP403');
        await denied(() => rpc('hq_influencer_revoke_access', { inviteId: inviteB.id, reason: 'Ataque' }), 'IP403');
      }
    });

    await test('Tabelas e helpers privados continuam inacessíveis após combinar todos os GRANTs', async () => {
      for (const name of ['admin','finance','partnerA']) {
        await actor(name);
        for (const table of ['torque_hq.staff','torque_hq.payments','hq_referrals_private.customers','hq_referrals_private.commissions','hq_influencer_private.invites','hq_influencer_private.memberships']) await denied(() => db.query('select * from ' + table), '42501');
        await denied(() => db.query('select hq_influencer_private.identity()'), '42501');
        await denied(() => db.query("insert into torque_hq.staff(user_id,role,enabled) values($1,'finance',true)", [users.partnerA]), '42501');
        await denied(() => db.query("update hq_influencer_private.memberships set partner_id=$1", [partnerB.id]), '42501');
      }
    });

    await test('Anon e service_role não herdam interfaces administrativas ou portal', async () => {
      const adminRpcs = ['hq_ops_snapshot','hq_referrals_snapshot','hq_influencer_admin_snapshot','hq_influencer_list_invites','influencer_accept_invite','influencer_portal_snapshot'];
      for (const role of ['anon','service_role']) {
        await actor('admin', role);
        for (const name of adminRpcs) await denied(() => rpc(name), '42501');
        await denied(() => rpc('hq_ops_command', {}), '42501');
        await denied(() => rpc('hq_influencer_prepare_invite', {}), '42501');
      }
      await actor(null, 'service_role');
      const allowed = await rpc('hq_referrals_load_customer', uid(9999)); assert.equal(allowed.revision, 0);
      await denied(() => db.query('update hq_referrals_private.campaign set enabled=true'), '42501');
    });

    await test('OFF é constraint real; aprovar elegibilidade e editar história não contornam gate', async () => {
      await actor('admin');
      await denied(() => rpc('hq_referrals_review', { commissionId: uid(302), decision: 'eligible', reason: 'Teste campanha desativada', expectedRevision: 1, operationId: uid(502) }), 'HQ422');
      await actor(null, 'owner');
      await denied(() => db.query('update hq_referrals_private.campaign set enabled=true'), '23514');
      await denied(() => db.query('delete from hq_referrals_private.payments'), 'HQ422');
      await denied(() => db.query('delete from hq_influencer_private.audit'), 'IP403');
      assert.equal(await scalar('select enabled from hq_referrals_private.campaign'), false);
      assert.equal(await scalar('select count(*)::int from hq_referrals_private.commissions'), 2);
    });

    await test('Cancelamento operacional registra pedido sem alterar acesso ou comissão do parceiro', async () => {
      await actor('finance');
      await ops('subscription.requestCancel', { accountId: accountA, effectiveAt: '2026-10-21', note: 'Pedido fictício' });
      const s = await rpc('hq_ops_snapshot'); assert.equal(s.subscriptionRequests.length, 1); assert.equal(s.accounts.find(x => x.id === accountA).accessStatus, 'trial');
      await actor('partnerA'); const p = await rpc('influencer_portal_snapshot'); assert.equal(p.balances.paidCents, 1996); assert.equal(p.commissions[0].status, 'paid');
      await actor('admin'); const ledger = await rpc('hq_referrals_snapshot'); assert.equal(ledger.campaign.enabled, false); assert.equal(ledger.payments.length, 1);
    });

    await test('Sessão de parceiro revogada e convite revogado bloqueiam somente vínculo correspondente', async () => {
      await actor(null, 'owner'); await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1", [sessions.partnerA]);
      await actor('partnerA'); await denied(() => rpc('influencer_portal_snapshot'), 'IP401');
      await actor('partnerB'); assert.equal((await rpc('influencer_portal_snapshot')).partner.displayName, 'Parceiro Exemplo B');
      await actor(null, 'owner'); await db.query('update auth.sessions set not_after=null where id=$1', [sessions.partnerA]);
      await actor('admin'); assert.deepEqual(await rpc('hq_influencer_revoke_access', { inviteId: inviteA.id, reason: 'Encerramento fictício' }), { revoked: true });
      await actor('partnerA'); await denied(() => rpc('influencer_portal_snapshot'), 'IP403'); await denied(() => rpc('influencer_accept_invite'), 'IP403');
      await actor('partnerB'); assert.equal((await rpc('influencer_portal_snapshot')).balances.pendingCents, 1996);
      await actor('finance'); assert.equal((await rpc('hq_ops_snapshot')).invoices.length, 1);
      await actor(null, 'owner'); assert.equal(await scalar('select count(*)::int from hq_referrals_private.commissions'), 2);
    });

    await test('Revogação de staff e admin não deixa acesso residual via outro contrato', async () => {
      await actor(null, 'owner'); await db.query('update torque_hq.staff set enabled=false where user_id=$1', [users.finance]);
      await actor('finance'); await denied(() => rpc('hq_ops_snapshot'), '42501'); await denied(() => rpc('hq_referrals_snapshot'), 'HQ403'); await denied(() => rpc('hq_influencer_admin_snapshot'), 'IP403');
      await actor(null, 'owner'); await db.query('delete from public.saas_admins where user_id=$1', [users.admin]);
      await actor('admin'); await denied(() => rpc('hq_ops_snapshot'), '42501'); await denied(() => rpc('hq_referrals_snapshot'), 'HQ403'); await denied(() => rpc('hq_influencer_admin_snapshot'), 'IP403');
      await actor('partnerB'); assert.equal((await rpc('influencer_portal_snapshot')).campaign.enabled, false);
    });

    await test('Estado final comprova separação de livros e auditorias após todas as negativas', async () => {
      await actor(null, 'owner');
      assert.equal(await scalar('select count(*)::int from torque_hq.invoices'), 1);
      assert.equal(await scalar('select count(*)::int from torque_hq.payments'), 1);
      assert.equal(await scalar('select count(*)::int from torque_hq.expense_payments'), 1);
      assert.equal(await scalar('select count(*)::int from hq_referrals_private.payments'), 1);
      assert.equal(await scalar('select count(*)::int from hq_referrals_private.commissions'), 2);
      assert.equal(await scalar("select count(*)::int from hq_influencer_private.memberships where status='active'"), 1);
      assert.equal(await scalar('select count(*)::int from torque_hq.commands'), await scalar('select count(*)::int from torque_hq.audit'));
      assert.equal(await scalar('select bool_and(actor_id=$1) from torque_hq.audit', [users.finance]), true);
      assert.equal(await scalar('select enabled from hq_referrals_private.campaign'), false);
    });
    console.log(`PASS ${checks} grupos de integração SQL unificada; quatro arquivos reais, banco efêmero e zero acesso remoto.`);
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
