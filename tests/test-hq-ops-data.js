/* HQ adapter regression tests: no network, browser, credentials or production writes. */
'use strict';
const assert = require('node:assert/strict');
const D = require('../assets/hq-ops-data.js');
const NOW = '2026-09-30T16:00:00.000Z';
const copy = x => JSON.parse(JSON.stringify(x));
let checks = 0, sequence = 0;
async function test(name, run) { await run(); checks += 1; console.log('  OK ' + name); }
function cmd(type, payload, extra) { return Object.assign({ type, idempotencyKey: 'test-command-' + (++sequence), reason: 'Revisão operacional de exemplo', payload }, extra); }
function server(role = 'admin') {
  const s = D.sampleSnapshot(NOW); s.meta.mode = 'server'; s.role = role; s.permissions = D.permissions[role].slice(); return s;
}
function stub(config = {}) {
  const calls = []; let active = config.session === false ? null : { user: { id: '00000000-0000-4000-8000-000000009000' } };
  const client = {
    auth: { getSession: async () => { calls.push('getSession'); if (config.authError) return { error: config.authError }; return { data: { session: active } }; } },
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === 'hq_sou_admin') return { data: config.admin === undefined ? true : config.admin };
      if (config.rpc) return config.rpc(name, args);
      if (name === 'hq_ops_snapshot') return { data: server() };
      return { error: { code: 'PGRST202' } };
    }
  };
  return { client, calls, setSession: value => { active = value; }, config };
}
function rpcNames(s) { return s.calls.filter(x => typeof x === 'object').map(x => x.name); }
function legacyResponse(name) {
  const account = { id: '00000000-0000-4000-8000-000000000001', nome: 'Conta de teste', criada: '2026-08-01', tipo: 'personal', status: 'ativo', plano: 'pro', obs: 'PRIVATE', zap: 'PRIVATE', ultima_msg: 'PRIVATE', ultima_pagina: 'app?t=PRIVATE', ultima_atividade: NOW };
  if (name === 'hq_ops_snapshot') return { error: { code: 'PGRST202' } };
  if (name === 'hq_kpis') return { data: { clientes: 1, ativos: 1, mrr: 49.90 } };
  if (name === 'hq_uso') return { data: { academias: 1, recursos: [{ nome: 'Fichas', usam: 1 }] } };
  if (name === 'hq_receita_mensal') return { data: [{ mes: '2026-09', total: 29.94 }] };
  return { data: [account] };
}

(async () => {
  await test('Demo determinística, identificada e sem dados pessoais', () => {
    const a = D.sampleSnapshot(NOW), b = D.sampleSnapshot(NOW);
    assert.deepEqual(a, b); assert.equal(a.meta.mode, 'demo'); assert.equal(a.meta.persistence, 'session-only');
    assert.ok(a.accounts.every(x => /^Conta Exemplo /.test(x.name)));
    assert.ok(a.payments.some(x => x.amountCents === 2994));
    assert.ok(a.subscriptions.some(x => x.endsAt)); assert.ok(a.events.some(x => x.type === 'account_closed'));
    assert.equal(a.invoices[10].totalCents - a.payments.find(x => x.invoiceId === a.invoices[10].id).amountCents, 3000);
  });
  await test('Leitura retorna cópia isolada e store novo reinicia sessão', async () => {
    const store = D.createDemoStore({ now: NOW }); const first = await store.load(); first.accounts[0].name = 'alterado';
    assert.equal((await store.load()).accounts[0].name, 'Conta Exemplo A');
    await store.command(cmd('lead.create', { name: 'Oportunidade Exemplo nova' }));
    assert.equal((await D.createDemoStore({ now: NOW }).load()).leads.length, 21);
  });
  await test('Perfis limitam fontes e exportação; troca só existe na simulação', async () => {
    const store = D.createDemoStore({ now: NOW }); const support = await store.setRole('support');
    assert.equal(support.invoices.length, 0); assert.equal(support.sources.invoices.reason, 'forbidden');
    assert.ok(!support.permissions.includes('reports.export'));
    assert.ok((await store.setRole('finance')).permissions.includes('reports.export'));
    assert.throws(() => store.setRole('superuser'), { code: 'INVALID_ROLE' });
    assert.equal(typeof D.createLiveStore(stub()).setRole, 'undefined');
  });
  await test('Fonte financeira indisponível não pode ser contornada por papel', async () => {
    const store = D.createDemoStore({ now: NOW, role: 'support' });
    await assert.rejects(store.command(cmd('expense.create', { payee: 'Fornecedor', label: 'Serviço', totalCents: 100, dueDate: '2026-09-30' })), { code: 'FORBIDDEN' });
  });
  await test('Fatura nova, baixa parcial e saldo exato com idempotência', async () => {
    const store = D.createDemoStore({ now: NOW }); const initial = await store.load();
    const invoice = await store.command(cmd('invoice.create', { accountId: initial.accounts[0].id, label: 'Fatura de exemplo', totalCents: 4990, dueDate: '2026-09-30', competenceDate: '2026-09-01' }));
    const payment = cmd('invoice.recordPayment', { id: invoice.id, amountCents: 2994, paidAt: '2026-09-30', reference: 'Manual exemplo' });
    const result = await store.command(payment); assert.equal(result.ok, true);
    assert.equal((await store.command(copy(payment))).replayed, true);
    const snap = await store.load(); assert.equal(snap.payments.filter(x => x.invoiceId === invoice.id).length, 1);
    assert.equal(snap.invoices.find(x => x.id === invoice.id).status, 'partial'); assert.equal(snap.audit.length, 2);
    await assert.rejects(store.command(Object.assign({}, payment, { payload: Object.assign({}, payment.payload, { amountCents: 2995 }) })), { code: 'IDEMPOTENCY_CONFLICT' });
    await assert.rejects(store.command(cmd('invoice.recordPayment', { id: invoice.id, amountCents: 1997, paidAt: '2026-09-30', reference: 'Excesso' })), { code: 'OVERPAYMENT' });
    await store.command(cmd('invoice.recordPayment', { id: invoice.id, amountCents: 1996, paidAt: '2026-09-30', reference: 'Saldo' }));
    assert.equal((await store.load()).invoices.find(x => x.id === invoice.id).status, 'paid');
  });
  await test('Despesa nova e baixa não inventam transferência externa', async () => {
    const store = D.createDemoStore({ now: NOW });
    const e = await store.command(cmd('expense.create', { payee: 'Fornecedor Exemplo', label: 'Serviço', totalCents: 499, dueDate: '2026-09-30' }));
    await store.command(cmd('expense.recordPayment', { id: e.id, amountCents: 499, paidAt: NOW, reference: 'Registro externo' }));
    const s = await store.load(); assert.equal(s.expenses.find(x => x.id === e.id).status, 'paid');
    assert.equal(s.expensePayments.find(x => x.expenseId === e.id).origin, 'manual');
  });
  await test('Centavos, datas impossíveis, futuro e referências inválidas são rejeitados sem auditoria falsa', async () => {
    const store = D.createDemoStore({ now: NOW }); const s = await store.load();
    const base = { payee: 'Fornecedor', label: 'Serviço', totalCents: 100, dueDate: '2026-09-30' };
    for (const value of [-1, 0, 1.5, '100', Infinity, 100000000001]) await assert.rejects(store.command(cmd('expense.create', Object.assign({}, base, { totalCents: value }))), { code: 'INVALID_MONEY' });
    await assert.rejects(store.command(cmd('expense.create', Object.assign({}, base, { dueDate: '2026-02-30' }))), { code: 'INVALID_DATE' });
    await assert.rejects(store.command(cmd('invoice.recordPayment', { id: s.invoices[11].id, amountCents: 100, paidAt: '2026-10-01', reference: 'Futuro' })), { code: 'INVALID_DATE' });
    await assert.rejects(store.command(cmd('invoice.create', { accountId: '00000000-0000-4000-8000-000000999999', label: 'X', totalCents: 100, dueDate: '2026-09-30' })), { code: 'INVALID_REFERENCE' });
    assert.equal((await store.load()).audit.length, 0);
  });
  await test('Payload fechado rejeita acesso, owner inexistente e perda sem motivo', async () => {
    const store = D.createDemoStore({ now: NOW });
    await assert.rejects(store.command(cmd('lead.create', { name: 'Teste', accessStatus: 'active' })), { code: 'INVALID_PAYLOAD' });
    await assert.rejects(store.command(cmd('lead.create', { name: 'Teste', owner: '00000000-0000-4000-8000-000000999999' })), { code: 'INVALID_REFERENCE' });
    await assert.rejects(store.command(cmd('lead.create', { name: 'Teste', stage: 'perdido' })), { code: 'INVALID_PAYLOAD' });
    await assert.rejects(store.command(cmd('account.grantAccess', {})), { code: 'INVALID_COMMAND' });
  });
  await test('Pedido de cancelamento preserva contrato e acesso e aparece na fila', async () => {
    const store = D.createDemoStore({ now: NOW }); const before = await store.load();
    await store.command(cmd('subscription.requestCancel', { accountId: before.accounts[0].id, id: before.subscriptions[0].id, note: 'Pedido de exemplo' }));
    const after = await store.load(); assert.deepEqual(after.subscriptions, before.subscriptions); assert.deepEqual(after.accounts, before.accounts);
    assert.equal(after.subscriptionRequests.length, 1); assert.equal(after.subscriptionRequests[0].status, 'pending');
  });
  await test('Mensagem ao cliente é rascunho não enviado e caso tem auditoria', async () => {
    const store = D.createDemoStore({ now: NOW }); const s = await store.load();
    await store.command(cmd('case.message', { id: s.cases[0].id, text: 'Mensagem de exemplo', visibility: 'customer' }));
    await store.command(cmd('case.update', { id: s.cases[0].id, status: 'resolvido', owner: s.currentUserId }));
    const after = await store.load(); assert.equal(after.cases[0].messages[0].delivery, 'not_sent'); assert.equal(after.cases[0].resolvedAt, NOW);
    assert.equal(after.audit[0].actorId, s.currentUserId); assert.equal(after.audit[0].reason, 'Revisão operacional de exemplo');
  });
  await test('Incidente, vínculo de conta e mudança de estado funcionam', async () => {
    const store = D.createDemoStore({ now: NOW }); const s = await store.load();
    const i = await store.command(cmd('incident.create', { title: 'Incidente exemplo', severity: 'alta', accountIds: [s.accounts[0].id], release: 'demo-local' }));
    await store.command(cmd('incident.update', { id: i.id, status: 'monitorando' }));
    assert.equal((await store.load()).incidents.find(x => x.id === i.id).status, 'monitorando');
  });
  await test('Observadores isolados e descarte impedem novas ações', async () => {
    const store = D.createDemoStore({ now: NOW }); let changes = 0;
    const unsubscribe = store.subscribe(() => { changes += 1; }); store.subscribe(() => { throw new Error('view error'); });
    await store.command(cmd('lead.create', { name: 'Exemplo' })); assert.equal(changes, 1);
    unsubscribe(); await store.command(cmd('lead.create', { name: 'Outro exemplo' })); assert.equal(changes, 1);
    store.dispose(); assert.throws(() => store.load(), { code: 'DISPOSED' }); await assert.rejects(store.command(cmd('lead.create', { name: 'Não permitido' })), { code: 'DISPOSED' });
  });
  await test('Sem sessão nenhuma RPC é chamada', async () => {
    const client = stub({ session: false }); const s = await D.createLiveStore(client).load();
    assert.deepEqual(rpcNames(client), []); assert.equal(s.role, null); assert.equal(s.accounts.length, 0); assert.equal(s.meta.authenticated, false);
  });
  await test('Gate legado precede snapshot e nunca lê tabelas diretamente', async () => {
    const client = stub(); const s = await D.createLiveStore(client).load();
    assert.deepEqual(rpcNames(client), ['hq_sou_admin', 'hq_ops_snapshot']); assert.equal(s.meta.mode, 'live'); assert.equal(s.role, 'admin');
  });
  await test('Staff válido entra somente via novo guard; false admin não concede fallback', async () => {
    const good = stub({ admin: false, rpc: () => ({ data: server('finance') }) });
    assert.equal((await D.createLiveStore(good).load()).role, 'finance');
    const absent = stub({ admin: false, rpc: () => ({ error: { code: 'PGRST202' } }) });
    const denied = await D.createLiveStore(absent).load(); assert.equal(denied.role, null);
    assert.deepEqual(rpcNames(absent), ['hq_sou_admin', 'hq_ops_snapshot']);
  });
  await test('Fallback legado usa apenas sete consultas sem efeitos e descarta PII', async () => {
    const client = stub({ rpc: legacyResponse }); const store = D.createLiveStore(client); const s = await store.load();
    assert.equal(s.meta.compatibility, 'legacy-readonly'); assert.equal(s.meta.commandsAvailable, false);
    assert.equal(s.sources.subscriptions.status, 'unavailable'); assert.equal(s.sources.events.status, 'unavailable'); assert.equal(s.sources.invoices.status, 'unavailable');
    assert.equal(s.accounts[0].sourceStatus, 'ativo'); assert.equal(s.accounts[0].accessStatus, 'unknown'); assert.equal(s.accounts[0].status, undefined);
    assert.ok(!JSON.stringify(s).includes('PRIVATE')); assert.ok(!s.permissions.some(x => x.endsWith('.write')));
    assert.deepEqual(rpcNames(client), ['hq_sou_admin', 'hq_ops_snapshot', 'hq_kpis', 'hq_clientes', 'hq_receita_mensal', 'hq_suporte_threads', 'hq_erros', 'hq_saude', 'hq_uso']);
    await assert.rejects(store.command(cmd('lead.create', { name: 'Não gravar' })), { code: 'READ_ONLY' });
    assert.ok(!rpcNames(client).includes('hq_ops_command')); assert.ok(!rpcNames(client).includes('hq_suporte_lista'));
  });
  await test('Erro comum e resposta nula no snapshot não viram fallback nem zero', async () => {
    for (const reply of [{ error: { code: 'NETWORK', message: 'token PRIVATE' } }, { data: null }]) {
      const client = stub({ rpc: () => reply }); const s = await D.createLiveStore(client).load();
      assert.deepEqual(rpcNames(client), ['hq_sou_admin', 'hq_ops_snapshot']); assert.equal(s.sources.accounts.status, 'error');
      assert.ok(!JSON.stringify(s).includes('PRIVATE')); assert.equal(s.accounts.length, 0);
    }
  });
  await test('Falha mantém último sucesso explicitamente stale e remove comandos', async () => {
    let error = false; const client = stub({ rpc: () => error ? { error: { code: 'NETWORK' } } : { data: server() } });
    const store = D.createLiveStore(client); const before = await store.load(); error = true; const after = await store.load();
    assert.deepEqual(after.accounts, before.accounts); assert.equal(after.sources.accounts.status, 'stale'); assert.equal(after.meta.commandsAvailable, false);
    assert.ok(!after.permissions.includes('finance.write')); error = false; assert.equal((await store.load()).sources.accounts.status, 'ready');
  });
  await test('Revogação apaga cópia; sessão nova não herda último sucesso', async () => {
    const client = stub(); const store = D.createLiveStore(client); await store.load();
    client.config.admin = false; client.config.rpc = () => ({ error: { code: '42501' } });
    const denied = await store.load(); assert.equal(denied.accounts.length, 0); assert.equal(denied.role, null);
    const c2 = stub(); const st2 = D.createLiveStore(c2); await st2.load(); c2.setSession({ user: { id: '00000000-0000-4000-8000-000000009001' } }); c2.config.rpc = () => ({ error: { code: 'NETWORK' } });
    const other = await st2.load(); assert.equal(other.accounts.length, 0); assert.equal(other.sources.accounts.status, 'error');
  });
  await test('Falha de autenticação limpa dados em vez de mostrar snapshot antigo', async () => {
    const client = stub(); const store = D.createLiveStore(client); await store.load(); client.config.authError = { code: 'NETWORK' };
    const s = await store.load(); assert.equal(s.accounts.length, 0); assert.equal(s.role, null); assert.equal(s.meta.commandsAvailable, false);
  });
  await test('Staff sem confirmação atual de escopo não mantém dados privados antigos', async () => {
    let unavailable = false;
    const client = stub({ admin: false, rpc: () => unavailable ? { error: { code: 'NETWORK' } } : { data: server('finance') } });
    const store = D.createLiveStore(client); assert.ok((await store.load()).invoices.length > 0);
    unavailable = true; const s = await store.load(); assert.equal(s.role, null); assert.equal(s.invoices.length, 0);
  });
  await test('Permissões fabricadas, modo demo em live e lista ausente são rejeitados', async () => {
    for (const mutate of [s => { s.role = 'support'; s.permissions = ['finance.write']; }, s => { s.meta.mode = 'demo'; }, s => { delete s.accounts; }]) {
      const data = server(); mutate(data); const client = stub({ rpc: () => ({ data }) }); const s = await D.createLiveStore(client).load();
      assert.equal(s.meta.commandsAvailable, false); assert.equal(s.accounts.length, 0); assert.equal(s.sources.accounts.status, 'error');
    }
  });
  await test('Fonte com erro preserva só domínio autorizado e bloqueia respectivo comando', async () => {
    let data = server(); const client = stub({ rpc: () => ({ data }) }); const store = D.createLiveStore(client); const first = await store.load();
    data = server(); data.sources.invoices.status = 'error'; data.invoices = [];
    const s = await store.load(); assert.equal(s.sources.invoices.status, 'stale'); assert.deepEqual(s.invoices, first.invoices);
    await assert.rejects(store.command(cmd('invoice.recordPayment', { id: first.invoices[11].id, amountCents: 100, paidAt: '2026-09-30', reference: 'Teste' })), { code: 'SOURCE_NOT_READY' });
    assert.ok(!rpcNames(client).includes('hq_ops_command'));
  });
  await test('Cobertura pendente de suporte legado é preservada somente para perfil autorizado', async () => {
    const data = server('support'); data.sources.cases.scope = 'opsOnly';
    data.sources.legacySupport = { status: 'unavailable', origin: 'public.saas_tickets+public.suporte_chamados', updatedAt: null, migrationPending: true, reason: 'migration_pending' };
    const authorized = await D.createLiveStore(stub({ admin: false, rpc: () => ({ data }) })).load();
    assert.equal(authorized.sources.cases.scope, 'opsOnly'); assert.equal(authorized.sources.legacySupport.migrationPending, true);
    const finance = server('finance'); finance.sources.legacySupport = data.sources.legacySupport;
    assert.equal((await D.createLiveStore(stub({ rpc: () => ({ data: finance }) })).load()).sources.legacySupport, undefined);
  });
  await test('Comando live usa envelope guardado e recarrega; baixa concorrente cabe ao servidor', async () => {
    let writes = 0; const original = cmd('invoice.recordPayment', { id: server().invoices[0].id, amountCents: 4990, paidAt: '2026-09-29', reference: 'Replay confirmado' });
    const client = stub({ rpc: (name, args) => { if (name === 'hq_ops_snapshot') return { data: server() }; writes += 1; assert.deepEqual(args, { p_command: original }); return { data: { ok: true, type: original.type, id: original.payload.id, replayed: true } }; } });
    const store = D.createLiveStore(client); const result = await store.command(original);
    assert.equal(result.ok, true); assert.equal(writes, 1); assert.equal(rpcNames(client).filter(x => x === 'hq_ops_snapshot').length, 2);
  });
  await test('RPC de comando ausente desliga gravação e não tenta alternativa legada', async () => {
    const client = stub({ rpc: name => name === 'hq_ops_snapshot' ? { data: server() } : { error: { code: 'PGRST202' } } });
    const store = D.createLiveStore(client); await assert.rejects(store.command(cmd('lead.create', { name: 'Exemplo' })), { code: 'READ_ONLY' });
    await assert.rejects(store.command(cmd('lead.create', { name: 'Exemplo' })), { code: 'READ_ONLY' });
    assert.equal(rpcNames(client).filter(x => x === 'hq_ops_command').length, 1);
  });
  await test('Legado falha por fonte, preserva sucesso como stale e não mascara ausência', async () => {
    let errors = false; const client = stub({ rpc: name => errors && name === 'hq_clientes' ? { error: { code: 'NETWORK' } } : legacyResponse(name) });
    const store = D.createLiveStore(client); await store.load(); errors = true; const s = await store.load();
    assert.equal(s.sources.accounts.status, 'stale'); assert.equal(s.accounts.length, 1); assert.equal(s.sources['legacy.hq_kpis'].status, 'ready');
    const noValue = stub({ rpc: name => name === 'hq_clientes' ? { data: null } : legacyResponse(name) });
    assert.equal((await D.createLiveStore(noValue).load()).sources.accounts.status, 'error');
  });
  await test('Leituras simultâneas compartilham consulta sem duplicar efeitos', async () => {
    const client = stub(); const store = D.createLiveStore(client); const [a, b] = await Promise.all([store.load(), store.load()]);
    assert.deepEqual(a, b); assert.equal(rpcNames(client).filter(x => x === 'hq_ops_snapshot').length, 1);
  });
  await test('Sign-out limpa assinantes imediatamente e cancela resposta antiga em voo', async () => {
    const client = stub(); let authChange, release, unsubscribed = false;
    client.client.auth.onAuthStateChange = fn => { authChange = fn; return { data: { subscription: { unsubscribe: () => { unsubscribed = true; } } } }; };
    const store = D.createLiveStore(client); let latest; store.subscribe(s => { latest = s; }); await store.load();
    client.config.rpc = () => new Promise(resolve => { release = resolve; });
    const pending = store.load();
    for (let n = 0; n < 10 && !release; n += 1) await Promise.resolve();
    assert.equal(typeof release, 'function'); authChange('SIGNED_OUT', null); assert.equal(latest.accounts.length, 0);
    release({ data: server() }); const result = await pending; assert.equal(result.accounts.length, 0); assert.equal(result.meta.authenticated, false);
    store.dispose(); assert.equal(unsubscribed, true);
  });
  await test('Datas com fuso válidas são aceitas; timestamp em data de cancelamento não', async () => {
    const store = D.createDemoStore({ now: NOW }); const s = await store.load();
    await store.command(cmd('lead.create', { name: 'Exemplo de horário', nextActionAt: '2026-09-30T23:30:00-03:00' }));
    await assert.rejects(store.command(cmd('lead.create', { name: 'Horário impossível', nextActionAt: '2026-09-30T24:00:00Z' })), { code: 'INVALID_DATE' });
    await assert.rejects(store.command(cmd('subscription.requestCancel', { accountId: s.accounts[0].id, effectiveAt: '2026-10-01T00:00:00Z' })), { code: 'INVALID_DATE' });
    await store.command(cmd('subscription.requestCancel', { accountId: s.accounts[0].id, effectiveAt: '2026-10-01' }));
  });
  console.log('\nHQ data adapter: ' + checks + ' testes passaram; nenhuma rede utilizada.');
})().catch(error => { console.error(error); process.exitCode = 1; });
