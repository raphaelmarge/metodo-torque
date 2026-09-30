'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Reports = require('../assets/hq-ops-reports.js');
const Metrics = require('../assets/hq-ops-metrics.js');
const Data = require('../assets/hq-ops-data.js');
const now = '2026-09-30T15:00:00Z';
const baseFilters = { from: '2026-09-01', to: '2026-09-30', timeZone: 'America/Sao_Paulo', now };
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('ok ' + passed + ' - ' + name); }
function snapshot() { return Data.sampleSnapshot(now); }
function context(s, filters, permissions) { return { snapshot: s, filters: Object.assign({}, baseFilters, filters), metrics: Metrics, can: p => (permissions || s.permissions).includes(p) }; }
function build(id, filters, s) { s = s || snapshot(); return Reports.buildReport(s, context(s, filters), id); }

test('browser and CommonJS expose the same no-network API', () => {
  const sandbox = { Intl, Date, Set, WeakMap };
  vm.createContext(sandbox); vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/hq-ops-reports.js'), 'utf8'), sandbox);
  assert.deepEqual(Object.keys(sandbox.HQOpsReports), Object.keys(Reports));
  assert.equal(typeof sandbox.HQOpsReports.render, 'function');
});
test('permissions hide catalog entries and deny direct report/export access', () => {
  const s = snapshot(), ctx = context(s, {}, ['support.read']);
  const html = Reports.render(s, ctx);
  assert(html.includes('Fila e prazos')); assert(!html.includes('Caixa: entradas'));
  const denied = Reports.buildReport(s, ctx, 'cash');
  assert.equal(denied.status, 'denied'); assert.deepEqual(denied.rows, []);
  assert.throws(() => Reports.exportCsv(s, ctx, 'cash'), /forbidden/);
  assert.equal(Reports.buildReport(s, context(s, {}, ['reports.export']), 'cash').status, 'denied');
  assert.equal(Reports.buildReport(s, context(s, {}, ['customers.read']), 'subscriptions').status, 'denied');
});
test('missing, stale and failed sources never become zero/empty successful tables', () => {
  for (const status of ['unavailable', 'stale', 'error']) {
    const s = snapshot(); s.sources.payments.status = status;
    const model = build('cash', {}, s);
    assert.equal(model.status, status); assert.equal(model.rows.length, 0);
    const html = Reports.render(s, context(s, { report: 'cash' }));
    assert(!html.includes('Nenhum registro neste recorte'));
    assert.throws(() => Reports.exportCsv(s, context(s), 'cash'), /not_exportable/);
  }
});
test('a real empty source is displayed as empty while a zero denominator stays undefined', () => {
  const s = snapshot(); s.payments = [];
  const model = build('cash', {}, s);
  assert.equal(model.status, 'ready'); assert.equal(model.summaries[0].value, 0); assert.equal(model.count, 0);
  assert(Reports.render(s, context(s, { report: 'cash' })).includes('Nenhum registro neste recorte'));
  s.subscriptions = [];
  assert(Reports.render(s, context(s, { report: 'subscriptions' })).includes('Sem denominador'));
});
test('pipeline uses the real stage field and counts only period-matching opportunities', () => {
  const s = snapshot(), model = build('pipeline', {}, s);
  assert.equal(model.status, 'ready'); assert.equal(model.count, 21);
  assert.equal(model.summaries.find(m => m.key === 'novo').value, 6);
  const filtered = build('pipeline', { rowStatus: 'novo' }, s);
  assert.equal(filtered.count, 6); assert.equal(filtered.summaries.find(m => m.key === 'novo').value, 6);
  assert.equal(build('pipeline', { product: 'personal' }, s).status, 'unavailable');
  assert.equal(build('pipeline', { cohort: '2026-09' }, s).status, 'unavailable');
});
test('table status cannot silently change the churn denominator', () => {
  const plain = build('subscriptions'), filtered = build('subscriptions', { rowStatus: 'not-a-state' });
  assert.deepEqual(filtered.summaries.map(m => [m.key, m.value, m.base]), plain.summaries.map(m => [m.key, m.value, m.base]));
  assert.equal(filtered.count, 0);
});
test('month cohort scopes the population with explicit date boundaries and real rows', () => {
  const s = snapshot(), model = build('accounts', { cohort: '2026-09' }, s);
  assert.deepEqual(model.filters.cohort, { from: '2026-09-01', to: '2026-09-30' });
  assert(model.rows.length > 0);
  assert(model.rows.every(r => Metrics.dateKey(r.createdAt, baseFilters.timeZone).startsWith('2026-09')));
  const cash = build('payables', { cohort: '2026-09' }, s);
  assert.equal(cash.status, 'unavailable');
});
test('funnel exposes the same 30-day mature denominator and clickable row population as metrics', () => {
  const s = snapshot(), opts = Object.assign({}, baseFilters, { from: '2026-06-01' });
  const result = Metrics.compute(s, opts), model = Reports.buildReport(s, context(s, opts), 'funnel', { reportMetric: 'maturePaid' });
  assert.equal(result.cohort.observationDays, 30);
  assert.equal(model.status, 'ready');
  assert.equal(model.count, result.cohort.maturePaid);
  assert.equal(model.summaries.find(m => m.key === 'conversion').base, result.cohort.mature);
  assert.deepEqual(model.rows, result.cohort.drilldowns.maturePaid);
  assert(model.report.definition.includes('trial comercial continua com 14 dias'));
});
test('receivable report retains cents, settlement allocations, and today time-zone semantics', () => {
  const s = snapshot();
  s.invoices = [{ id: 'invoice-precise', accountId: s.accounts[0].id, totalCents: 2994, dueDate: '2026-09-30', competenceDate: '2026-09-01', status: 'open' }];
  s.payments = [{ id: 'partial', invoiceId: 'invoice-precise', accountId: s.accounts[0].id, amountCents: 997, paidAt: now, confirmed: true, kind: 'payment' }];
  const model = build('receivables', {}, s);
  assert.equal(model.summaries[0].value, 1997); assert.equal(model.rows[0].balanceCents, 1997);
  const csv = Reports.exportCsv(s, context(s), 'receivables');
  assert(csv.includes('19,97')); assert(!csv.includes('20,00'));
});
test('CSV requires export and domain permissions, includes provenance, and excludes unnecessary PII', () => {
  const s = snapshot(); s.leads[0].id = ' =HYPERLINK("https://evil.invalid")';
  s.leads[0].name = 'NAME-PRIVATE'; s.leads[0].email = 'secret@example.invalid'; s.leads[0].notes = 'NOTES-PRIVATE';
  const csv = Reports.exportCsv(s, context(s), 'pipeline');
  assert.equal(csv.charCodeAt(0), 0xFEFF); assert(csv.includes('\r\n'));
  assert(csv.includes('SIMULAÇÃO LOCAL — DADOS FICTÍCIOS'));
  assert(csv.includes('synthetic_demo')); assert(csv.includes('Definição'));
  assert(csv.includes('"\' =HYPERLINK(""https://evil.invalid"")"'));
  assert(!csv.includes('NAME-PRIVATE')); assert(!csv.includes('secret@example.invalid')); assert(!csv.includes('NOTES-PRIVATE'));
  assert.throws(() => Reports.exportCsv(s, context(s, {}, ['reports.export']), 'pipeline'), /not_exportable/);
});
test('all export rows respect filters beyond the current pagination page', () => {
  const s = snapshot(), model = build('pipeline', {}, s);
  assert.equal(model.pageCount, 2); assert.equal(model.pageRows.length, 20);
  const second = build('pipeline', { page: 2 }, s); assert.equal(second.pageRows.length, 1);
  const csv = Reports.exportCsv(s, context(s, { page: 2, rowStatus: 'novo' }), 'pipeline');
  assert(csv.includes('"novo"')); assert(!csv.includes('"proposta"'));
});
test('every report survives unavailable data and invalid date filters', () => {
  const s = snapshot(); Object.keys(s.sources).forEach(k => { s.sources[k].status = 'unavailable'; });
  for (const id of ['funnel', 'pipeline', 'accounts', 'subscriptions', 'trials', 'mrr', 'cash', 'receivables', 'payables', 'competence', 'referrals', 'support', 'support-history', 'incidents', 'incident-history']) {
    assert.equal(typeof Reports.render(s, context(s, { report: id })), 'string');
    assert.equal(typeof Reports.render(s, context(s, { report: id, from: '2026-10-01', to: '2026-09-01' })), 'string');
  }
});
test('source names, statuses, IDs and origins are escaped and never injected as HTML', () => {
  const s = snapshot(); s.leads[0].id = '<img src=x onerror=alert(1)>'; s.leads[0].stage = '<script>alert(1)</script>';
  s.sources.leads.origin = '<svg onload=alert(1)>';
  const html = Reports.render(s, context(s, { report: 'pipeline' }));
  assert(!html.includes('<img')); assert(!html.includes('<svg')); assert(!html.includes('<script>'));
  assert(html.includes('&lt;img')); assert(html.includes('&lt;svg'));
});
test('referrals remain a link to the canonical module without a copied ledger/export', () => {
  const s = snapshot(), html = Reports.render(s, context(s, { report: 'referrals' }));
  assert(html.includes('data-hqr-area="referrals"')); assert(!html.includes('data-hqr-export'));
  assert.throws(() => Reports.exportCsv(s, context(s), 'referrals'), /not_exportable/);
});
test('support and incident history include resolved records but never invent product allocations', () => {
  const s = snapshot(), history = build('support-history', {}, s);
  assert.equal(history.status, 'ready'); assert(history.rows.some(r => r.status === 'resolvido'));
  const resolved = build('support-history', { rowStatus: 'resolvido' }, s);
  assert.equal(resolved.count, 1); assert(resolved.summaries.some(m => m.key === 'aberto'));
  s.incidents.push({ id: 'global', status: 'resolvido', createdAt: '2026-09-20T15:00:00Z' });
  const incidents = build('incident-history', {}, s);
  assert(incidents.rows.some(r => r.id === 'global'));
  assert.equal(build('incident-history', { product: 'personal' }, s).status, 'unavailable');
});
test('partial support coverage stays visible and travels with definitions and CSV without importing old tickets', () => {
  const s = snapshot(); s.meta.synthetic = false;
  s.sources.cases.scope = 'opsOnly';
  s.sources.legacySupport = { status: 'unavailable', reason: 'migration_pending', migrationPending: true, scope: 'legacyOnly', origin: 'public.saas_tickets+public.suporte_chamados', updatedAt: null };
  s.legacySupport = [{ id: 'LEGACY-PRIVATE-NEVER-IMPORTED', status: 'aberto' }];
  for (const id of ['support', 'support-history']) {
    const model = build(id, {}, s), html = Reports.render(s, context(s, { report: id }));
    assert.equal(model.status, 'ready');
    assert(model.coverageNotice.includes('somente os chamados da nova operação'));
    assert(model.report.definition.includes('não representam todo o suporte'));
    assert(model.sources.some(source => source.domain === 'legacySupport' && source.status === 'unavailable'));
    assert(html.includes('data-hqr-coverage role="note"'));
    assert(html.indexOf('data-hqr-coverage') < html.indexOf('hq-reports-summary'));
    assert(html.includes('Integração do histórico pendente'));
    assert(!html.includes('LEGACY-PRIVATE'));
    const csv = Reports.exportCsv(s, context(s), id);
    assert(csv.includes('Cobertura do atendimento')); assert(csv.includes('public.saas_tickets+public.suporte_chamados'));
    assert(csv.includes('opsOnly')); assert(csv.includes('Integração do histórico pendente')); assert(!csv.includes('LEGACY-PRIVATE'));
  }
  delete s.sources.legacySupport;
  assert(build('support', {}, s).sources.some(source => source.domain === 'legacySupport' && source.reason === 'migration_pending'));
  delete s.sources.cases.scope;
  assert(build('support', {}, s).coverageNotice.includes('ainda não confirmada'));
});

async function browserTest() {
  const { chromium } = require('./ci/node_modules/playwright');
  const executablePath = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
  const browser = await chromium.launch(Object.assign({ headless: true }, executablePath ? { executablePath } : {}));
  try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [], requests = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => { requests.push(route.request().url()); return route.abort(); });
  await page.setContent('<!doctype html><html lang="pt-BR"><body><main id="reports"></main></body></html>');
  for (const file of ['hq-ops-metrics.js', 'hq-ops-data.js', 'hq-ops-reports.js']) await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, '../assets', file), 'utf8') });
  await page.evaluate(({ now, filters }) => {
    const s = HQOpsData.sampleSnapshot(now);
    window.actions = []; window.ctx = { snapshot: s, filters, can: p => s.permissions.includes(p), navigate: (area, f) => actions.push({ area, filters: f }), openDetail: (kind, id) => actions.push({ kind, id }) };
    const el = document.getElementById('reports'); el.innerHTML = HQOpsReports.render(s, ctx); window.cleanupReports = HQOpsReports.bind(el, ctx);
  }, { now, filters: baseFilters });
  await page.locator('[data-hqr-report="pipeline"]').click();
  assert.equal(await page.locator('tbody tr').count(), 20);
  await page.locator('[data-hqr-page="2"]').click(); assert.equal(await page.locator('tbody tr').count(), 1);
  await page.locator('[data-hqr-stage="novo"]').click(); assert.equal(await page.locator('tbody tr').count(), 6);
  await page.locator('[data-hqr-detail]').first().click();
  assert.equal((await page.evaluate(() => actions.at(-1))).kind, 'lead');
  await page.locator('[name=from]').fill('2026-09-15'); await page.locator('[data-hqr-filters] button[type=submit]').click();
  assert.equal(await page.locator('tbody tr').count(), 1, JSON.stringify(await page.evaluate(() => ({ filters: ctx.filters, rows: Array.from(document.querySelectorAll('tbody tr')).map(r => r.textContent) }))));
  await page.locator('[data-hqr-report=""]').click(); await page.locator('[data-hqr-report="receivables"]').click();
  assert(await page.locator('[data-hqr-metric="arDueToday"]').count());
  await page.locator('[data-hqr-metric="arProjected"]').click();
  await page.locator('[data-hqr-period]').filter({ hasText: '2026-09-30' }).click();
  assert.equal(await page.locator('[name=from]').inputValue(), '2026-09-30');
  assert.equal(await page.locator('[name=to]').inputValue(), '2026-09-30');
  await page.locator('[data-hqr-area="finance"]').click();
  assert.equal((await page.evaluate(() => actions.at(-1))).area, 'finance');
  await page.evaluate(() => { const el = document.getElementById('reports'); HQOpsReports.bind(el, ctx); HQOpsReports.bind(el, ctx); });
  const before = await page.evaluate(() => actions.length);
  await page.locator('[data-hqr-area="finance"]').click();
  assert.equal(await page.evaluate(() => actions.length), before + 1);
  assert.deepEqual(errors, []); assert.deepEqual(requests, []);
  passed++; console.log('ok ' + passed + ' - browser: catalogue, paging, stage/date filters, drilldowns, chart interval and listener lifecycle; no network');
  } finally { await browser.close(); }
}
(async () => { if (!process.argv.includes('--unit-only')) await browserTest(); console.log('\n' + passed + ' grupos de testes de relatórios aprovados.'); })().catch(error => { console.error(error); process.exitCode = 1; });
