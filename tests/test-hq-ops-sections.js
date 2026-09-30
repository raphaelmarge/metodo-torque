'use strict';
// Only synthetic fixtures, Node assert and a small DOM double. No server, browser or artifacts.
const assert = require('node:assert/strict');
const Sections = require('../assets/hq-ops-sections.js');
const tests = [];
const test = (name, run) => tests.push({ name, run });
const NOW = '2026-09-30T15:00:00Z';
const AREAS = { sales: 'sales.read', customers: 'customers.read', finance: 'finance.read', support: 'support.read', health: 'health.read', admin: 'audit.read' };
const WRITE = { sales: 'sales.write', customers: 'customers.write', finance: 'finance.write', support: 'support.write', health: 'health.write' };
const unsafe = `fixture-"'><img src=x onerror="fixture()">&`;
const escaped = 'fixture-&quot;&#39;&gt;&lt;img src=x onerror=&quot;fixture()&quot;&gt;&amp;';
function empty() {
  const s = { now: NOW, asOf: NOW };
  for (const key of ['accounts', 'subscriptions', 'leads', 'invoices', 'payments', 'expenses', 'expensePayments', 'cases', 'incidents', 'integrations', 'audit', 'operators']) s[key] = [];
  return s;
}
function fixture() {
  return Object.assign(empty(), {
    accounts: [{ id: 'acct-a', name: 'Conta Ficticia A', product: 'personal', status: 'ativo', accessStatus: 'active' }, { id: 'acct-b', name: 'Conta Ficticia B', product: 'nutri', status: 'trial' }],
    subscriptions: [{ id: 'sub-a', accountId: 'acct-a', status: 'active', monthlyCents: 4990, startedAt: '2026-09-01T12:00:00Z' }],
    operators: [{ id: 'op-a', name: 'Operador Ficticio A' }],
    leads: [{ id: 'lead-a', name: 'Oportunidade Ficticia', stage: 'contato', owner: 'op-a', nextActionAt: '2026-09-30', source: 'manual' }],
    invoices: [{ id: 'inv-a', accountId: 'acct-a', label: 'Cobranca Ficticia', totalCents: 4990, dueDate: '2026-09-30', status: 'open' }],
    expenses: [{ id: 'exp-a', payee: 'Fornecedor Ficticio', label: 'Despesa Ficticia', totalCents: 8000, dueDate: '2026-09-30', status: 'open' }],
    cases: [{ id: 'case-a', accountId: 'acct-a', subject: 'Caso Ficticio', status: 'aberto', priority: 'media', channel: 'manual', nextActionAt: '2026-09-30' }],
    incidents: [{ id: 'inc-a', title: 'Incidente Ficticio', status: 'investigando', severity: 'alta', accountIds: ['acct-a'] }],
    integrations: [{ name: 'Integracao Ficticia', status: 'unknown', message: 'Sem medicao sintetica' }],
    audit: [{ id: 'audit-a', action: 'case.create', reason: 'Registro ficticio', createdAt: NOW, result: 'success' }]
  });
}
function ctx(extra = {}) { return Object.assign({ now: NOW, can: () => true, money: n => 'cents:' + n, filters: {} }, extra); }
function render(area, s = fixture(), filters = {}, extra = {}) { return Sections.render(area, s, ctx(Object.assign({ filters }, extra))); }
function rows(html) {
  const body = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
  return body ? [...body[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(m => [...m[1].matchAll(/<td>([\s\S]*?)<\/td>/g)].map(c => c[1].replace(/<[^>]*>/g, ''))) : [];
}
function actionTags(html) { return html.match(/<button\b[^>]*\bdata-hq-action="[^"]*"[^>]*>/g) || []; }
function frozen(value) { Object.freeze(value); for (const child of Object.values(value)) if (child && typeof child === 'object') frozen(child); return value; }

test('all six sections escape text, IDs, states, filters and formatter output', () => {
  const s = fixture();
  s.accounts[0] = { id: unsafe, name: unsafe, product: unsafe, status: unsafe, accessStatus: unsafe };
  s.subscriptions[0] = { id: unsafe, accountId: unsafe, status: unsafe, monthlyCents: 4990 };
  s.operators[0] = { id: 'op-a', name: unsafe };
  s.leads[0] = { id: unsafe, name: unsafe, source: unsafe, stage: unsafe, owner: 'op-a', lossReason: unsafe };
  s.invoices[0] = { id: unsafe, accountId: unsafe, label: unsafe, origin: unsafe, totalCents: 4990 };
  s.expenses[0] = { id: unsafe, payee: unsafe, label: unsafe, totalCents: 1000 };
  s.payments = [{ accountId: unsafe, amountCents: 4990, origin: unsafe, reference: unsafe, kind: unsafe }];
  s.cases[0] = { id: unsafe, accountId: unsafe, subject: unsafe, protocol: unsafe, priority: unsafe, status: unsafe, channel: unsafe, owner: 'op-a' };
  s.incidents[0] = { id: unsafe, title: unsafe, severity: unsafe, status: unsafe, version: unsafe, owner: 'op-a' };
  s.integrations[0] = { name: unsafe, status: unsafe, message: unsafe };
  s.audit[0] = { action: unsafe, actorName: unsafe, targetType: unsafe, reason: unsafe, result: unsafe };
  for (const [area, filters] of [...Object.keys(AREAS).map(a => [a, {}]), ['finance', { tab: 'payable' }], ['finance', { tab: 'movements' }]]) {
    const html = render(area, s, { ...filters, q: unsafe }, { money: () => unsafe });
    assert.ok(html.includes(escaped), area + ' preserves escaped fixture text');
    assert.ok(!html.includes(unsafe), area + ' never interpolates raw fixture text');
    assert.ok(!/<img\b|<script\b|\sonerror="fixture\(\)"/i.test(html), area + ' creates no injected element or attribute');
    assert.ok(html.includes('value="' + escaped + '"'), area + ' escapes the search attribute');
    if (area !== 'admin') assert.ok(html.includes('data-id="' + escaped + '"') || filters.tab === 'movements', area + ' escapes record IDs');
  }
  s.subscriptions[0].status = 'active';
  assert.ok(render('customers', s).includes('data-account-id="' + escaped + '"'));
  assert.ok(render('customers', s).includes('<option value="' + escaped + '">' + escaped + '</option>'));
});

test('section access fails closed without inspecting protected collections', () => {
  const protectedData = new Proxy({}, { get() { throw Error('Protected collection was read'); } });
  for (const area of Object.keys(AREAS)) {
    for (const can of [undefined, () => false, () => 'true', () => { throw Error('permission unavailable'); }]) {
      assert.match(Sections.render(area, protectedData, { can }), /perfil/);
    }
    assert.match(render(area, fixture(), {}, { can: p => p === AREAS[area] }), /data-hq-area=/);
  }
  assert.doesNotMatch(Sections.render('missing', protectedData, { can: () => true }), /data-hq-area=/);
});

test('read permission preserves data and history while every write control is disabled', () => {
  for (const area of Object.keys(WRITE)) {
    const html = render(area, fixture(), {}, { can: p => p === AREAS[area] });
    const buttons = actionTags(html);
    assert.ok(buttons.length > 0, area);
    for (const button of buttons) {
      if (button.includes('data-hq-action="case.history"')) assert.doesNotMatch(button, / disabled/);
      else assert.match(button, / disabled/, area + ' denies mutation');
    }
    const allowed = render(area, fixture(), {}, { can: p => p === AREAS[area] || p === WRITE[area] });
    assert.ok(actionTags(allowed).every(b => !b.includes(' disabled')), area + ' enables its own write permission');
  }
});

test('renders without mutating frozen input and tolerates empty collections', () => {
  const s = frozen(fixture()), c = frozen(ctx());
  for (const area of Object.keys(AREAS)) {
    assert.equal(typeof Sections.render(area, s, c), 'string');
    assert.equal(typeof render(area, empty()), 'string');
  }
});

test('unavailable, error and loading sources never become empty success or zero balances', () => {
  const sources = [['sales', 'leads'], ['customers', 'accounts'], ['finance', 'invoices'], ['finance', 'payments'], ['finance', 'expenses', 'payable'], ['finance', 'expensePayments', 'payable'], ['finance', 'payments', 'movements'], ['support', 'cases'], ['health', 'incidents'], ['admin', 'audit']];
  for (const [area, domain, tab] of sources) for (const status of ['unavailable', 'error', 'loading']) {
    const s = fixture(); s.sources = { [domain]: { status, message: unsafe } };
    const html = render(area, s, { tab });
    assert.ok(html.includes(escaped), area + '/' + domain + '/' + status);
    assert.doesNotMatch(html, /<tbody>|class="hq-stat"|data-hq-action=|<img\b/);
  }
  const s = fixture(); s.sources = { invoices: { status: 'stale' }, payments: { status: 'ready' } };
  const stale = render('finance', s);
  assert.match(stale, /class="hq-notice"/); assert.equal(rows(stale)[0][4], 'cents:4990');
});

test('sales stages match EN/PT aliases in both directions', () => {
  for (const [en, pt] of [['new', 'novo'], ['contact', 'contato'], ['proposal', 'proposta'], ['won', 'fechado'], ['lost', 'perdido']]) {
    const s = empty();
    s.leads = [{ id: 'en', name: 'Fixture EN', stage: en }, { id: 'pt', name: 'Fixture PT', stage: pt }, { id: 'other', name: 'Other fixture', stage: 'demo' }];
    for (const stage of [en, pt]) assert.deepEqual(rows(render('sales', s, { stage })).map(r => r[0].match(/^Fixture (?:EN|PT)/)[0]), ['Fixture EN', 'Fixture PT']);
  }
});

test('sales follow-up includes today, excludes closed/lost and respects owner/search', () => {
  const s = empty();
  s.leads = [
    { id: 'late', name: 'Retomar Alpha', stage: 'contact', nextActionAt: '2026-09-29', owner: 'op-a' },
    { id: 'today', name: 'Retomar Beta', stage: 'novo', nextActionAt: '2026-09-30', owner: 'op-b' },
    { id: 'future', name: 'Retomar Future', stage: 'novo', nextActionAt: '2026-10-01', owner: 'op-a' },
    ...['won', 'fechado', 'lost', 'perdido'].map(stage => ({ id: stage, name: stage, stage, nextActionAt: '2026-09-29' }))
  ];
  const due = render('sales', s, { followup: 'due' });
  assert.equal(rows(due).length, 2);
  assert.equal(rows(render('sales', s, { followup: 'due', owner: 'op-a', q: 'ALPHA' })).length, 1);
  assert.match(due, /class="hq-overdue"/);
});

test('case state/priority aliases and product, account search and owner filters compose', () => {
  for (const [en, pt] of [['open', 'aberto'], ['triage', 'aberto'], ['reopened', 'aberto'], ['in_progress', 'em_andamento'], ['waiting_customer', 'aguardando'], ['waiting_external', 'aguardando'], ['resolved', 'resolvido']]) {
    const s = fixture();
    s.cases = [{ id: 'en', subject: 'Case EN', accountId: 'acct-a', status: en, priority: 'p1', owner: 'op-a' }, { id: 'pt', subject: 'Case PT', accountId: 'acct-a', status: pt, priority: 'alta', owner: 'op-a' }, { id: 'other', subject: 'Other fixture', accountId: 'acct-b', status: pt, priority: 'alta', owner: 'op-b' }];
    for (const status of [en, pt]) for (const priority of ['p1', 'alta']) {
      const result = rows(render('support', s, { status, priority, product: 'personal', owner: 'op-a', q: 'FICTICIA A' }));
      assert.equal(result.length, 2, en + '/' + pt);
      assert.deepEqual(result.map(r => r[0]), ['Case EN', 'Case PT']);
    }
  }
  const s = fixture(); s.cases[0].status = 'resolved'; s.cases[0].nextActionAt = '2026-09-29';
  assert.doesNotMatch(render('support', s), /class="hq-overdue"/);
});

test('finance balance uses confirmed receipts/refunds and both total aliases', () => {
  const s = fixture();
  s.invoices = [{ id: 'inv-a', accountId: 'acct-a', label: 'Legacy bool', amountCents: 10000 }, { id: 'inv-b', accountId: 'acct-a', label: 'Canonical status', totalCents: 10000 }];
  s.payments = [
    { invoiceId: 'inv-a', amountCents: 6000, confirmed: true }, { invoiceId: 'inv-a', amountCents: 1000, kind: 'refund', confirmed: true },
    { invoiceId: 'inv-a', amountCents: 9000, confirmed: false }, { invoiceId: 'other', amountCents: 5000, confirmed: true },
    { invoiceId: 'inv-b', amountCents: 6000, status: 'confirmed' }, { invoiceId: 'inv-b', amountCents: 1000, kind: 'refund', status: 'confirmed' },
    { invoiceId: 'inv-b', amountCents: 9000, status: 'pending' }
  ];
  const r = rows(render('finance', s));
  assert.deepEqual(r.map(row => row.slice(3, 5)), [['cents:10000', 'cents:5000'], ['cents:10000', 'cents:5000']]);
  assert.match(render('finance', s), /Saldo da lista<\/span><strong>cents:10000/);
});

test('finance excludes canceled balances from open and settled filters', () => {
  const s = fixture();
  s.invoices = ['canceled', 'cancelled', 'cancelado'].map((status, i) => ({ id: 'cancel-' + i, label: 'Cancel ' + i, totalCents: 9000, status }));
  s.invoices.push({ id: 'settled', label: 'Paid fixture', totalCents: 2000 }, { id: 'open', label: 'Open fixture', totalCents: 3000 });
  s.payments = [{ invoiceId: 'settled', amountCents: 2000, confirmed: true }];
  const canceled = rows(render('finance', s, { status: 'cancelled' }));
  assert.equal(canceled.length, 3); assert.ok(canceled.every(r => r[4] === 'cents:0' && !r[6].includes('Registrar')));
  assert.deepEqual(rows(render('finance', s, { status: 'outstanding' })).map(r => r[3]), ['cents:3000']);
  assert.deepEqual(rows(render('finance', s, { status: 'settled' })).map(r => r[3]), ['cents:2000']);
});

test('finance due filters include local today and week boundary, exclude undated records', () => {
  const s = fixture();
  s.invoices = ['2026-09-29', '2026-09-30', '2026-10-07', '2026-10-08', null].map((dueDate, i) => ({ id: String(i), label: 'Due ' + i, amountCents: 1000, dueDate }));
  const localMidnight = { now: '2026-10-01T01:30:00Z' };
  assert.deepEqual(rows(render('finance', s, { due: 'today' }, localMidnight)).map(r => r[2]), ['30/09/2026']);
  assert.deepEqual(rows(render('finance', s, { due: 'overdue' }, localMidnight)).map(r => r[2]), ['29/09/2026']);
  assert.deepEqual(rows(render('finance', s, { due: 'week' }, localMidnight)).map(r => r[2]), ['30/09/2026', '07/10/2026']);
  s.now = localMidnight.now; delete s.asOf;
  assert.equal(rows(render('finance', s, { due: 'today' }, { now: undefined })).length, 1, 'snapshot.now is a deterministic fallback');
});

test('payables use their own ledger and movements expose confirmation without changing inputs', () => {
  const s = fixture();
  s.expenses[0] = { id: 'exp-a', label: 'Expense alias', payee: 'Ficticio', amountCents: 8000, dueDate: '2026-09-30' };
  s.expensePayments = [{ expenseId: 'exp-a', amountCents: 3000, status: 'confirmed' }];
  s.payments = [{ invoiceId: 'exp-a', accountId: 'acct-a', amountCents: 1000, confirmed: true, origin: 'manual' }, { accountId: 'acct-b', amountCents: 1500, confirmed: false, origin: 'fixture' }];
  assert.equal(rows(render('finance', s, { tab: 'payable' }))[0][4], 'cents:5000');
  const movements = rows(render('finance', s, { tab: 'movements', product: 'personal' }));
  assert.equal(movements.length, 1); assert.equal(movements[0][4], 'Confirmado na fonte');
  assert.match(rows(render('finance', s, { tab: 'movements' }))[1][4], /^Sem confirma/);
});

test('customers select newest canonical subscription and escape its cancellation target', () => {
  const s = fixture();
  s.subscriptions = [
    { id: 'old-sub', accountId: 'acct-a', status: 'cancelled', startedAt: '2026-08-01T12:00:00Z', monthlyCents: 4990 },
    { id: 'new-sub', accountId: 'acct-a', status: 'trial', startedAt: '2026-09-20T12:00:00Z', trialEndsAt: '2026-10-04T12:00:00Z', monthlyCents: 4990 }
  ];
  const html = render('customers', s);
  assert.match(html, /data-hq-action="subscription.requestCancel" data-id="new-sub"/);
  assert.doesNotMatch(html, /data-id="old-sub"/);
  assert.equal(rows(html)[0][4], '04/10/2026');
});

test('cancelled or unknown subscriptions have no cancellation action and pending requests preserve access', () => {
  const s = fixture();
  for (const status of ['cancelled', 'cancelado', 'expired', 'unknown']) {
    s.subscriptions[0].status = status;
    assert.ok(!actionTags(render('customers', s)).some(tag => tag.includes('subscription.requestCancel')));
  }
  s.subscriptions[0].status = 'active';
  s.subscriptionRequests = [{ id: 'req-a', accountId: 'acct-a', status: 'pending', note: unsafe, createdAt: NOW }];
  const before = JSON.stringify(s), html = render('customers', s);
  assert.match(html, /Pedidos de cancelamento/); assert.ok(html.includes(escaped));
  assert.ok(!html.includes(unsafe)); assert.equal(JSON.stringify(s), before);
  assert.equal(s.accounts[0].accessStatus, 'active'); assert.equal(s.subscriptions[0].status, 'active');
});

// Deliberately small DOM surface: we exercise the exported bind API and real submit handlers.
class Element {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.attributes = {}; this.children = []; this.parentElement = null; this.listeners = new Map(); this.value = ''; this.textContent = ''; this.disabled = false; this.open = false; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null; }
  hasAttribute(name) { return Object.hasOwn(this.attributes, name); }
  append(...els) { for (const el of els) { el.parentElement = this; this.children.push(el); } }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); }
  removeEventListener(type, fn) { if (this.listeners.has(type)) this.listeners.get(type).delete(fn); }
  async emit(type, extra = {}) { const event = Object.assign({ target: this, preventDefault() { this.defaultPrevented = true; } }, extra); for (const fn of [...(this.listeners.get(type) || [])]) await fn(event); return event; }
  contains(el) { return el === this || this.children.some(child => child.contains(el)); }
  closest(selector) { const keys = selector.split(',').map(s => s.match(/^\[([^\]]+)\]$/)[1]); for (let el = this; el; el = el.parentElement) if (keys.some(k => el.hasAttribute(k))) return el; return null; }
  all() { return this.children.flatMap(child => [child, ...child.all()]); }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(el => el !== this); this.parentElement = null; }
  showModal() { this.open = true; }
  close() { this.open = false; for (const fn of [...(this.listeners.get('close') || [])]) fn({ target: this }); }
  reportValidity() { return this.valid !== false && this.all().filter(el => el.required).every(el => String(el.value).trim()); }
}
function el(tag, attrs = {}) { const node = new Element(tag); for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v); return node; }
function harness(extra = {}) {
  const container = el('main'), area = el('section', { 'data-hq-area': 'finance' }); container.append(area);
  const calls = [], notices = [], nav = [], details = [];
  const context = ctx({ snapshot: fixture(), command: async c => { calls.push(c); return { ok: true }; }, notify: n => notices.push(n), navigate: (...args) => nav.push(args), openDetail: (...args) => details.push(args), ...extra });
  const off = Sections.bind(container, context);
  async function click(attrs, disabled = false) { const button = el('button', attrs); button.disabled = disabled; const child = el('span'); button.append(child); area.append(button); await container.emit('click', { target: child }); return button; }
  async function open(type, id = '', accountId = '') {
    await click({ 'data-hq-action': type, 'data-id': id, 'data-account-id': accountId });
    const dialog = container.children.find(n => n.tagName === 'DIALOG');
    assert.ok(dialog, 'Action must open a form: ' + type);
    const form = dialog.children.find(n => n.tagName === 'FORM');
    const fields = Object.fromEntries(form.all().filter(n => n.name).map(n => [n.name, n]));
    return { dialog, form, fields, submit: async values => { for (const [k, v] of Object.entries(values)) { assert.ok(fields[k], 'Unknown form field: ' + k); fields[k].value = v; } await form.emit('submit'); } };
  }
  return { container, area, context, off, calls, notices, nav, details, click, open };
}

test('bind is idempotent, navigates from nested targets and clears stale tab filters', async () => {
  const initial = { q: 'fixture', status: 'outstanding', due: 'today', product: 'personal' };
  const h = harness({ filters: initial });
  const off = Sections.bind(h.container, h.context);
  assert.equal(h.container.listeners.get('click').size, 1); assert.equal(h.container.listeners.get('change').size, 1);
  await h.click({ 'data-hq-set-filter': 'tab', 'data-value': 'payable' });
  assert.deepEqual(h.nav, [['finance', { q: 'fixture', product: 'personal', tab: 'payable' }]]);
  assert.deepEqual(initial, { q: 'fixture', status: 'outstanding', due: 'today', product: 'personal' });
  const input = el('input', { 'data-hq-filter': 'q' }); input.value = unsafe; h.area.append(input);
  await h.container.emit('change', { target: input });
  assert.equal(h.nav[1][1].q, unsafe);
  await h.click({ 'data-hq-detail': 'account', 'data-id': 'acct-a' }); assert.deepEqual(h.details, [['account', 'acct-a']]);
  const foreign = el('button', { 'data-hq-action': 'invoice.create' }); await h.container.emit('click', { target: foreign });
  assert.equal(h.container.children.length, 1);
  off(); await h.click({ 'data-hq-set-filter': 'tab', 'data-value': 'receivable' });
  assert.equal(h.nav.length, 2); assert.equal(h.container.listeners.get('click').size, 0);
  assert.doesNotThrow(() => Sections.bind(null, {})());
});

test('forged or disabled actions cannot bypass write permission, history needs read permission', async () => {
  const h = harness({ can: () => false });
  for (const action of ['lead.create', 'invoice.create', 'expense.recordPayment', 'case.update', 'case.message', 'incident.create', 'subscription.requestCancel', 'case.history', 'unknown.command']) await h.click({ 'data-hq-action': action, 'data-id': 'fixture' });
  assert.equal(h.calls.length, 0); assert.equal(h.container.children.length, 1);
  const allowed = harness(); await allowed.click({ 'data-hq-action': 'invoice.create' }, true);
  assert.equal(allowed.container.children.length, 1);
});

const commandScenarios = [
  ['lead.create', '', { name: 'Novo ficticio', stage: 'contato', owner: 'op-a', nextActionAt: '2026-10-02', lossReason: '' }, { name: 'Novo ficticio', stage: 'contato', owner: 'op-a', nextActionAt: '2026-10-02', lossReason: '' }],
  ['lead.update', 'lead-a', { stage: 'perdido', lossReason: 'Fixture sem interesse', nextActionAt: '' }, { id: 'lead-a', name: 'Oportunidade Ficticia', stage: 'perdido', owner: 'op-a', nextActionAt: null, lossReason: 'Fixture sem interesse' }],
  ['invoice.create', '', { accountId: 'acct-a', label: 'Fatura ficticia', total: '29,94', dueDate: '2026-10-14', competenceDate: '' }, { accountId: 'acct-a', label: 'Fatura ficticia', totalCents: 2994, dueDate: '2026-10-14', competenceDate: null }],
  ['expense.create', '', { payee: 'Fornecedor Ficticio', label: 'Despesa ficticia', total: '4.99', dueDate: '2026-10-14', competenceDate: '2026-10-01' }, { payee: 'Fornecedor Ficticio', label: 'Despesa ficticia', totalCents: 499, dueDate: '2026-10-14', competenceDate: '2026-10-01' }],
  ['invoice.recordPayment', 'inv-a', { amount: '19,96', paidAt: '2026-09-30', reference: 'FIXTURE-PAY' }, { id: 'inv-a', amountCents: 1996, paidAt: '2026-09-30', reference: 'FIXTURE-PAY' }],
  ['expense.recordPayment', 'exp-a', { amount: '4,99', paidAt: '2026-09-30', reference: 'FIXTURE-EXP' }, { id: 'exp-a', amountCents: 499, paidAt: '2026-09-30', reference: 'FIXTURE-EXP' }],
  ['case.create', '', { subject: 'Novo caso ficticio', accountId: 'acct-a', priority: 'alta', status: 'aberto', owner: 'op-a', nextActionAt: '2026-10-01', incidentId: 'inc-a' }, { subject: 'Novo caso ficticio', accountId: 'acct-a', priority: 'alta', status: 'aberto', owner: 'op-a', nextActionAt: '2026-10-01', incidentId: 'inc-a', channel: 'manual' }],
  ['case.update', 'case-a', { status: 'resolvido', nextActionAt: '', owner: '', incidentId: '' }, { id: 'case-a', accountId: 'acct-a', subject: 'Caso Ficticio', priority: 'media', status: 'resolvido', owner: null, nextActionAt: null, incidentId: null }],
  ['case.message', 'case-a', { visibility: 'customer', text: 'Resposta ficticia' }, { id: 'case-a', visibility: 'customer', text: 'Resposta ficticia' }],
  ['incident.create', '', { title: 'Novo incidente ficticio', severity: 'critica', status: 'investigando', owner: 'op-a', release: 'fixture-v1', affectedAccount: 'acct-b' }, { title: 'Novo incidente ficticio', severity: 'critica', status: 'investigando', owner: 'op-a', release: 'fixture-v1', accountIds: ['acct-b'] }],
  ['incident.update', 'inc-a', { status: 'monitorando', owner: '', release: 'fixture-v2', affectedAccount: 'acct-a' }, { id: 'inc-a', title: 'Incidente Ficticio', severity: 'alta', status: 'monitorando', owner: null, release: 'fixture-v2', accountIds: ['acct-a'] }],
  ['subscription.requestCancel', 'sub-a', {}, { id: 'sub-a', accountId: 'acct-a', note: 'Evidencia ficticia' }]
];
for (const [type, id, values, payload] of commandScenarios) test(type + ' submits canonical envelope with reason and idempotency key', async () => {
  const h = harness(), before = JSON.stringify(h.context.snapshot);
  const form = await h.open(type, id, type === 'subscription.requestCancel' ? 'acct-a' : '');
  await form.submit({ ...values, reason: '  Evidencia ficticia  ' });
  assert.equal(h.calls.length, 1, 'exactly one executor call');
  const command = h.calls[0];
  assert.deepEqual(Object.keys(command).sort(), ['idempotencyKey', 'payload', 'reason', 'type']);
  assert.deepEqual(command.payload, payload);
  assert.equal(command.type, type); assert.equal(command.reason, 'Evidencia ficticia');
  assert.match(command.idempotencyKey, /^[a-zA-Z0-9_.:-]{8,120}$/);
  assert.equal(JSON.stringify(h.context.snapshot), before, 'form must not optimistically mutate snapshot');
  assert.ok(!h.container.contains(form.dialog), 'confirmed form closes');
});

test('invalid money, overpayment and future payment cannot reach executor', async () => {
  const h = harness(), f = await h.open('invoice.recordPayment', 'inv-a');
  for (const amount of ['0', '-1', '1.000,00', '1,234', 'NaN', '50,00']) {
    await f.submit({ amount, paidAt: '2026-09-30', reference: 'FIXTURE', reason: 'Teste ficticio' });
    assert.equal(h.calls.length, 0, amount); assert.ok(h.container.contains(f.dialog));
  }
  await f.submit({ amount: '1,00', paidAt: '2026-10-01' }); assert.equal(h.calls.length, 0);
  await f.submit({ amount: '1,00', paidAt: '2026-09-30' }); assert.equal(h.calls.length, 1);
});

test('active lead/case require follow-up and lost lead requires explanation', async () => {
  for (const type of ['lead.create', 'case.create']) {
    const h = harness(), f = await h.open(type);
    await f.submit({ [type === 'lead.create' ? 'name' : 'subject']: 'Fixture', nextActionAt: '', reason: 'Teste ficticio' });
    assert.equal(h.calls.length, 0); assert.ok(h.container.contains(f.dialog));
    if (type === 'lead.create') {
      await f.submit({ stage: 'perdido', lossReason: '' }); assert.equal(h.calls.length, 0);
      await f.submit({ lossReason: 'Motivo ficticio' }); assert.equal(h.calls.length, 1);
    }
  }
});

test('permission is rechecked at submit and missing executor never confirms a write', async () => {
  let allowed = true;
  const h = harness({ can: () => allowed }), f = await h.open('case.message', 'case-a');
  allowed = false; await f.submit({ text: 'Fixture', reason: 'Teste ficticio' });
  assert.equal(h.calls.length, 0); assert.ok(h.container.contains(f.dialog));
  const missing = harness({ command: undefined }), m = await missing.open('case.message', 'case-a');
  await m.submit({ text: 'Fixture', reason: 'Teste ficticio' });
  assert.ok(missing.container.contains(m.dialog)); assert.equal(missing.notices.length, 0);
});

test('cancel button and invalid required fields leave executor untouched', async () => {
  const h = harness(), f = await h.open('subscription.requestCancel', 'sub-a');
  await f.form.emit('submit'); assert.equal(h.calls.length, 0, 'missing required reason blocks submit');
  const cancel = f.form.all().find(node => node.tagName === 'BUTTON' && node.getAttribute('type') === 'button');
  assert.ok(cancel); await cancel.emit('click');
  assert.ok(!h.container.contains(f.dialog)); assert.equal(h.calls.length, 0);
});

test('cancellation without a linked subscription sends account and reason without inventing subscription ID', async () => {
  const h = harness(), f = await h.open('subscription.requestCancel', 'acct-b', 'acct-b');
  await f.submit({ reason: 'Pedido ficticio' });
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.calls[0].payload, { accountId: 'acct-b', note: 'Pedido ficticio' });
});

test('failed submit preserves content, reuses operation key and prevents duplicate in-flight submission', async () => {
  let release;
  const calls = [];
  const h = harness({ command: c => { calls.push(c); if (calls.length === 1) return new Promise(resolve => { release = resolve; }); return Promise.resolve({ ok: true }); } });
  const f = await h.open('case.message', 'case-a');
  const first = f.submit({ text: unsafe, reason: 'Teste ficticio' });
  await Promise.resolve();
  await f.form.emit('submit'); assert.equal(calls.length, 1);
  const cancelEvent = await f.dialog.emit('cancel'); assert.equal(cancelEvent.defaultPrevented, true);
  release({ ok: false, error: unsafe }); await first;
  assert.ok(h.container.contains(f.dialog)); assert.equal(f.fields.text.value, unsafe);
  const error = f.form.all().find(node => node.getAttribute('role') === 'alert');
  assert.equal(error.textContent, unsafe); assert.equal(error.children.length, 0);
  await f.form.emit('submit'); assert.equal(calls.length, 2);
  assert.equal(calls[0].idempotencyKey, calls[1].idempotencyKey);
  assert.ok(!h.container.contains(f.dialog));
});

test('history preserves unsafe message as text and distinguishes draft from internal note', async () => {
  const s = fixture();
  s.cases[0].messages = [{ text: unsafe, visibility: 'internal' }, { text: unsafe, visibility: 'customer', delivery: 'not_sent' }];
  const h = harness({ snapshot: s, can: p => p === 'support.read' });
  await h.click({ 'data-hq-action': 'case.history', 'data-id': 'case-a' });
  const dialog = h.container.children.find(n => n.tagName === 'DIALOG');
  assert.ok(dialog); assert.equal(h.calls.length, 0);
  const text = dialog.all().filter(n => n.tagName === 'P');
  assert.deepEqual(text.map(n => n.textContent), [unsafe, unsafe]); assert.ok(text.every(n => n.children.length === 0));
  const labels = dialog.all().filter(n => n.tagName === 'STRONG').map(n => n.textContent);
  assert.ok(labels[0].includes('Nota interna')); assert.ok(labels[1].includes('Rascunho'));
});

(async () => {
  const previousDocument = global.document, previousFetch = global.fetch;
  global.document = { createElement: tag => new Element(tag) };
  global.fetch = () => { throw Error('Network is forbidden in this synthetic test suite'); };
  let passed = 0, failed = 0;
  try {
    for (const t of tests) {
      try { await t.run(); passed++; console.log('ok ' + passed + ' - ' + t.name); }
      catch (error) { failed++; console.error('FAIL - ' + t.name + '\n' + error.stack); }
    }
  } finally {
    if (previousDocument === undefined) delete global.document; else global.document = previousDocument;
    global.fetch = previousFetch;
  }
  console.log(passed + ' groups passed; ' + failed + ' failed. Synthetic data only; no network or artifacts.');
  if (failed) process.exitCode = 1;
})();
