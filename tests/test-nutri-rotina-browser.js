/* Real Nutri UI + actual journal module. Only controlled fictional fixtures;
 * every external request, write request and WebSocket is blocked. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let chromium;
if (process.env.TORQUE_PLAYWRIGHT) ({chromium} = require(process.env.TORQUE_PLAYWRIGHT));
else { try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } }
const BASE = (process.env.BASE_URL || 'http://127.0.0.1:8765').replace(/\/$/, '');
const ORIGIN = new URL(BASE).origin;
const NUTRI = BASE + '/nutri/';
const DAY = '2026-10-09';
const FROZEN = '2026-10-09T12:00:00Z';
const PATIENT = '20000000-0000-4000-8000-000000000001';
const USER = '20000000-0000-4000-8000-000000000002';
const PLAN = '20000000-0000-4000-8000-000000000003';
const RECORD = '20000000-0000-4000-8000-000000000004';
const OUT = process.env.TORQUE_TEST_OUTPUT_DIR || (process.env.RUNNER_TEMP && path.join(process.env.RUNNER_TEMP, 'torque-testes'));
let browser, checks = 0;
const contexts = [];
function pass(message) { checks++; console.log('PASS ' + message); }

async function isolatedContext(options = {}) {
  const context = await browser.newContext({serviceWorkers: 'block', timezoneId: 'America/Sao_Paulo', viewport: {width: 1280, height: 900}, ...options});
  contexts.push(context);
  const apis = [], errors = [], missing = [];
  await context.addInitScript(({frozen}) => {
    const NativeDate = Date, milliseconds = NativeDate.parse(frozen);
    class FixedDate extends NativeDate { constructor(...args) { super(...(args.length ? args : [milliseconds])); } static now() { return milliseconds; } }
    window.Date = FixedDate;
  }, {frozen: FROZEN});
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    const api = /\.supabase\.co$/.test(url.hostname) || /^\/(rest|auth|functions|storage)\/v\d\//.test(url.pathname) || !['GET', 'HEAD'].includes(request.method());
    if (api) { apis.push({url: url.origin + url.pathname, method: request.method()}); return route.abort(); }
    if (url.origin !== ORIGIN) return route.abort();
    if (url.pathname.endsWith('/nutri/config.js')) return route.fulfill({status: 200, contentType: 'application/javascript', body: 'window.TORQUE_NUTRI_CONFIG = {};'});
    return route.continue();
  });
  if (typeof context.routeWebSocket !== 'function') throw Error('This regression requires Playwright with routeWebSocket to guarantee network isolation.');
  await context.routeWebSocket('**/*', socket => { apis.push({socket: true}); socket.close(); });
  context.on('page', page => {
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() === 404 && new URL(response.url()).origin === ORIGIN) missing.push(new URL(response.url()).pathname); });
  });
  return {context, apis, errors, missing};
}
function assertIsolated(h, name) {
  assert.deepEqual(h.apis, [], name + ': no API/write/socket attempt, including Supabase');
  assert.deepEqual(h.errors, [], name + ': no uncaught browser errors');
  assert.deepEqual(h.missing, [], name + ': every requested local dependency exists');
  pass(name + ' remains isolated from real accounts and data');
}
async function navigate(page, destination) {
  // The desktop sidebar is visible for functional checks; the patient mobile
  // navigation is exercised separately by the visual checks below.
  await page.locator('.sidebar [data-page="' + destination + '"]').click();
}
async function xp(page) {
  return Number((await page.locator('.journey-strip .grow small').textContent()).match(/(\d+)\s*XP/)[1]);
}
async function saveModal(page) {
  await page.locator('#journal-confirm').check();
  await page.locator('#modal-form button[type="submit"]').click();
  await page.waitForFunction(() => !document.querySelector('#modal').open);
}
async function noOverflow(page, label) {
  const geometry = await page.evaluate(() => {
    const root = document.documentElement, body = document.body;
    const dialog = document.querySelector('#modal');
    return {width: root.clientWidth, scroll: Math.max(root.scrollWidth, body.scrollWidth), dialog: dialog?.open ? {width: dialog.clientWidth, scroll: dialog.scrollWidth} : null};
  });
  assert(geometry.scroll <= geometry.width + 1, label + ': document horizontal overflow ' + JSON.stringify(geometry));
  if (geometry.dialog) assert(geometry.dialog.scroll <= geometry.dialog.width + 1, label + ': modal horizontal overflow ' + JSON.stringify(geometry));
}
async function screenshot(page, theme, size) {
  if (!OUT) return;
  fs.mkdirSync(OUT, {recursive: true});
  await page.screenshot({path: path.join(OUT, 'nutri-rotina-' + theme + '-' + size + '.png'), fullPage: true});
}

async function realDemo() {
  const h = await isolatedContext(), page = await h.context.newPage();
  await page.goto(NUTRI + 'index.html', {waitUntil: 'domcontentloaded'});
  await page.locator('[data-action="switch-role"]').click();
  await page.locator('.patient-experience').waitFor();
  const initialXP = await xp(page);
  assert.match(await page.locator('[data-action="followed"] strong').textContent(), /Você ainda não confirmou/);
  await page.getByRole('button', {name: 'Ver meu plano alimentar', exact: false}).click();
  await page.locator('[data-log-meal="breakfast"]').click();
  await page.locator('#journal-confirm').waitFor();
  assert.equal(await page.locator('[data-journal-row]').count(), 3, 'Prescribed foods initialize the report without an automatic save.');
  await saveModal(page);
  await navigate(page, 'today');
  assert.match(await page.locator('.habit-card[data-page="journal"] strong').textContent(), /^1\s+registros/);
  assert.match(await page.locator('[data-action="followed"] strong').textContent(), /Você ainda não confirmou/);
  const firstXP = await xp(page);
  assert.equal(firstXP - initialXP, 15, 'One reported-care day plus one food report grants exactly the current daily care points.');
  pass('real demo records consumption without confirming dietary adherence');
  await navigate(page, 'food');
  await page.locator('[data-log-meal="breakfast"]').click();
  assert.match(await page.locator('#modal-body h2').textContent(), /Revisar minha refeição/);
  await saveModal(page);
  await navigate(page, 'today');
  assert.equal(await xp(page), firstXP, 'Editing the same report grants no additional XP.');
  assert.match(await page.locator('.habit-card[data-page="journal"] strong').textContent(), /^1\s+registros/);
  assert.match(await page.locator('[data-action="followed"] strong').textContent(), /Você ainda não confirmou/);
  await page.locator('.habit-card[data-page="journal"]').click();
  assert.equal(await page.locator('article.journal-entry').count(), 1, 'Reopening the meal edits one record instead of inserting a duplicate.');
  assert.match(await page.locator('article.journal-entry').textContent(), /revisão 2/);
  pass('reopening and saving the same meal retains one record and one XP award');
  await navigate(page, 'today');
  await page.setViewportSize({width: 375, height: 812});
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => document.body.classList.toggle('theme-light', theme === 'light'), theme);
    await noOverflow(page, '375px ' + theme + ' home');
    await screenshot(page, theme, '375');
    await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
    await noOverflow(page, '375px ' + theme + ' 200% home');
    await screenshot(page, theme, '375-200pct');
    await page.evaluate(() => { document.documentElement.style.zoom = ''; });
    await page.locator('.habit-card[data-page="journal"]').click();
    await page.locator('[data-x="journal-edit"]').click();
    await noOverflow(page, '375px ' + theme + ' food modal');
    await screenshot(page, theme, '375-modal');
    await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
    await noOverflow(page, '375px ' + theme + ' 200% food modal');
    await screenshot(page, theme, '375-modal-200pct');
    await page.evaluate(() => { document.documentElement.style.zoom = ''; });
    await page.locator('#cancel-modal').click();
    await page.locator('.nav-btn[data-page="today"]').click();
  }
  pass('375px patient home and food modal fit dark/light themes at 100% and 200%');
  assertIsolated(h, 'real demo');
  await h.context.close();
}

const currentFood = {id: 'rice-current', nome: 'Arroz', qtd: 1, porcao: '100 g', k: 900, pt: 90, cb: 90, g: 90,
  substituicoes: [{id: 'beans-alternative', nome: 'Feijão', qtd: 1, porcao: '1 concha', k: 77, pt: 5}]};
function published() { return {id: PLAN, patient_id: PATIENT, status: 'published', version: 2, data: {titulo: 'Plano novo fictício', refeicoes: [{id: 'lunch', titulo: 'Almoço atual', hora: '12:30', itens: [currentFood]}]}}; }
function history() {
  return {id: RECORD, patient_id: PATIENT, created_by: USER, visibility: 'patient', kind: 'food_journal', title: 'Almoço antigo', version: 3,
    created_at: DAY + 'T11:00:00Z', data: {day: DAY, mealId: 'old-lunch', planVersion: 1, note: 'Relato fictício antigo', items: [
      {nome: 'Arroz', qtd: 1, porcao: '100 g', k: 110, pt: 2},
      {nome: 'Arroz', qtd: 1, porcao: '100 g', k: 77, pt: 5}
    ]}};
}
async function journalFixture({mode = 'success', existing = null, records = []} = {}) {
  const h = await isolatedContext(), page = await h.context.newPage();
  // A blank document on the same local origin prevents the main app from
  // bootstrapping while importing the actual modules and shipping CSS.
  await h.context.route(BASE + '/', route => route.fulfill({status: 200, contentType: 'text/html', body: '<!doctype html><link rel="icon" href="data:,"><title>Controlled journal fixture</title>'}));
  await page.goto(BASE + '/', {waitUntil: 'domcontentloaded'});
  await page.setContent('<!doctype html><html lang="pt-BR"><head><link rel="icon" href="data:,"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="' + NUTRI + 'style.css"><link rel="stylesheet" href="' + NUTRI + 'patient.css"></head><body><div id="fixture-status" role="status"></div><dialog id="modal"><div id="modal-body"></div></dialog></body></html>');
  await page.evaluate(async fixture => {
    const {createFoodJournal} = await import(fixture.nutri + 'food-journal.js');
    const {careSummary} = await import(fixture.nutri + 'care-progress.js');
    const clone = value => structuredClone(value);
    const state = {role: 'patient', demo: false, selected: fixture.patient, user: {id: fixture.user}, records: clone(fixture.records), logs: []};
    if (fixture.existing) state.records.push(clone(fixture.existing));
    const remote = clone(state.records), calls = [], ledger = new Map(), errors = [], toasts = [];
    let sequence = 10, loads = 0;
    const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    function persist(args) {
      const previous = ledger.get(args.p_operation_id);
      if (previous) { if (previous.payload !== JSON.stringify(args)) throw Error('Operation replay changed payload'); return clone(previous.record); }
      const original = remote.find(row => row.id === args.p_record_id);
      if (args.p_record_id && original?.version !== args.p_expected_version) throw Error('Unexpected stale revision in fixture');
      const row = {id: args.p_record_id || '30000000-0000-4000-8000-000000000001', patient_id: args.p_patient_id, created_by: fixture.user,
        kind: 'food_journal', visibility: 'patient', version: original ? original.version + 1 : 1, title: args.p_title, data: clone(args.p_data), updated_at: new Date().toISOString()};
      if (original) Object.assign(original, row); else remote.push(row);
      ledger.set(args.p_operation_id, {payload: JSON.stringify(args), record: clone(row)});
      return row;
    }
    const H = {state: () => state, esc, uid: () => '40000000-0000-4000-8000-' + String(sequence++).padStart(12, '0'), today: () => fixture.day,
      published: () => fixture.published, logs: () => state.logs, stats: () => careSummary({patientId: fixture.patient, logs: state.logs, records: state.records, today: fixture.day, clinicGoal: 5}),
      database: () => ({async rpc(name, args) {
        if (name !== 'save_food_journal') throw Error('Unexpected RPC: ' + name);
        calls.push({name, args: clone(args)}); const data = persist(args);
        if (calls.length === 1 && fixture.mode === 'unknown-thrown') throw Error('Resposta de rede desconhecida após gravar');
        if (calls.length === 1 && fixture.mode === 'unknown-returned') return {data: null, error: {code: 'PGRST000', message: 'Resposta de rede desconhecida após gravar'}};
        return {data, error: null};
      }}),
      render: () => { document.querySelector('#fixture-status').textContent = 'rendered'; }, toast: message => toasts.push(message),
      async saveLog() { throw Error('Consumption flow must never confirm daily dietary adherence.'); },
      modal(title, body, submit) {
        const dialog = document.querySelector('#modal');
        document.querySelector('#modal-body').innerHTML = '<h2>' + esc(title) + '</h2><form id="modal-form">' + body + '<div class="actions"><button type="button" id="cancel-modal">Cancelar</button><button type="submit">Salvar</button></div><p id="fixture-error" role="alert"></p></form>';
        document.querySelector('#cancel-modal').onclick = () => dialog.close();
        document.querySelector('#modal-form').onsubmit = async event => {
          event.preventDefault();
          try { await submit(); dialog.close(); }
          catch (error) { errors.push(error.message); document.querySelector('#fixture-error').textContent = error.message; }
        };
        dialog.showModal();
      }
    };
    const J = createFoodJournal(H, {pat: () => ({id: fixture.patient}), records: () => state.records,
      async saveRecord() { throw Error('Authenticated fixture must use the journal RPC.'); },
      async load() { loads++; state.records = clone(remote); }, async imageFile() { throw Error('No photo fixture supplied.'); }});
    window.__journalFixture = {state, calls, remote, errors, toasts, J, fixture, stats: H.stats, getLoads: () => loads};
  }, {nutri: NUTRI, patient: PATIENT, user: USER, day: DAY, published: published(), existing, records, mode});
  return {...h, page};
}
async function openFixture(h, existing = false) {
  await h.page.evaluate(existing => {
    const f = window.__journalFixture;
    if (existing) f.J.open(f.state.records.find(row => row.id === f.fixture.existing.id));
    else f.J.forMeal('lunch');
  }, existing);
}
async function fixtureResult(h) {
  return h.page.evaluate(() => {
    const f = window.__journalFixture;
    return {calls: f.calls, records: f.state.records, remote: f.remote, stats: f.stats(), loads: f.getLoads(), errors: f.errors, keys: Object.keys(sessionStorage)};
  });
}
async function uncertainReplay(mode) {
  const h = await journalFixture({mode}), page = h.page;
  await openFixture(h);
  await page.locator('#journal-note').fill('Relato fictício para conferir o envio.');
  await page.locator('#journal-confirm').check();
  await page.locator('#modal-form button[type="submit"]').click();
  await page.locator('#fixture-error').filter({hasText: 'Resposta de rede desconhecida'}).waitFor();
  const first = await fixtureResult(h);
  assert.equal(first.calls.length, 1);
  assert.equal(first.remote.filter(row => row.kind === 'food_journal').length, 1, 'The fixture committed the first operation before losing its response.');
  assert.equal(await page.locator('#journal-note').isDisabled(), true);
  assert(first.keys.some(key => key.startsWith('torque-nutri-journal-pending:')), 'Unknown outcomes retain their operation arguments.');
  await page.locator('#cancel-modal').click();
  await page.evaluate(() => { window.__journalFixture.fixture.published.version = 4; window.__journalFixture.fixture.published.data.refeicoes[0].itens[0].k = 999; });
  await openFixture(h);
  assert.equal(await page.locator('#journal-note').isDisabled(), true, 'Reopening keeps an uncertain operation immutable.');
  assert.match(await page.locator('#modal-form button[type="submit"]').textContent(), /Conferir envio/);
  await page.locator('#modal-form button[type="submit"]').click();
  await page.waitForFunction(() => !document.querySelector('#modal').open);
  const result = await fixtureResult(h);
  assert.equal(result.calls.length, 2);
  assert.deepEqual(result.calls[1], result.calls[0], 'Retry preserves the exact operation ID, expected revision and full payload after a plan change.');
  assert.equal(result.calls[1].args.p_data.planVersion, 2);
  assert.equal(result.calls[1].args.p_data.items[0].k, 900);
  assert.equal(result.records.filter(row => row.kind === 'food_journal').length, 1);
  assert.equal(result.stats.dayXP, 15);
  assert.equal(result.stats.followedDays, 0);
  assert.equal(result.loads, 1);
  assert(!result.keys.some(key => key.startsWith('torque-nutri-journal-')), 'Confirmed operations and drafts are removed after refresh succeeds.');
  pass(mode + ' replays the exact RPC once without duplicate records or XP');
  assertIsolated(h, mode); await h.context.close();
}
async function historicalDraft() {
  const existing = history();
  // Wrong-patient/private snapshots must not supply current-plan macros.
  const records = [{id: 'private-history', patient_id: PATIENT, visibility: 'private', kind: 'plan_version', data: {planVersion: 1, planId: PLAN, plan: published().data}},
    {id: 'other-history', patient_id: 'another-patient', visibility: 'patient', kind: 'plan_version', data: {planVersion: 1, planId: PLAN, plan: published().data}}];
  const h = await journalFixture({existing, records}), page = h.page;
  await openFixture(h, true);
  assert.equal(await page.locator('#journal-meal').inputValue(), 'old-lunch');
  assert.equal(await page.locator('#journal-meal').isDisabled(), true);
  await page.locator('[data-journal-remove="0"]').click();
  await page.locator('[data-journal-quantity]').fill('2');
  await page.locator('#journal-note').fill('Rascunho histórico fictício.');
  await page.locator('#cancel-modal').click();
  await openFixture(h, true);
  assert.equal(await page.locator('[data-journal-row]').count(), 1);
  assert.equal(await page.locator('[data-journal-quantity]').inputValue(), '2');
  assert.equal(await page.locator('#journal-note').inputValue(), 'Rascunho histórico fictício.');
  await saveModal(page);
  const result = await fixtureResult(h), args = result.calls[0].args, item = args.p_data.items[0];
  assert.equal(args.p_record_id, RECORD); assert.equal(args.p_expected_version, 3);
  assert.equal(args.p_data.planVersion, 1); assert.equal(args.p_data.mealId, 'old-lunch');
  assert.deepEqual(item, {nome: 'Arroz', qtd: 2, porcao: '100 g', k: 77, pt: 5}, 'Removing the first of identical idless legacy items preserves the second source by original index, including partial nutrients.');
  assert.equal(result.records.filter(row => row.kind === 'food_journal').length, 1);
  assert.equal(result.records.find(row => row.id === RECORD).version, 4);
  pass('historical draft preserves version, meal, idless item identity and partial macros after removal');
  assertIsolated(h, 'historical draft'); await h.context.close();
}
async function alternativeDraft() {
  const h = await journalFixture(), page = h.page;
  await openFixture(h);
  await page.locator('[data-journal-alternative="0"]').selectOption('1');
  await page.locator('[data-journal-quantity]').fill('2.5');
  await page.locator('#journal-note').fill('Substituição prescrita, porção ajustada.');
  await page.locator('#cancel-modal').click();
  await openFixture(h);
  assert.equal(await page.locator('[data-journal-name]').inputValue(), 'Feijão');
  assert.equal(await page.locator('[data-journal-quantity]').inputValue(), '2.5');
  assert.equal(await page.locator('#journal-note').inputValue(), 'Substituição prescrita, porção ajustada.');
  await saveModal(page);
  const result = await fixtureResult(h);
  assert.deepEqual(result.calls[0].args.p_data.items[0], {id: 'beans-alternative', nome: 'Feijão', qtd: 2.5, porcao: '1 concha', k: 77, pt: 5}, 'Quantity does not scale per-portion nutrients; missing nutrients remain absent.');
  assert.equal(result.calls[0].args.p_data.planVersion, 2);
  pass('new draft restores prescribed alternatives and quantity without inventing nutrients');
  assertIsolated(h, 'alternative draft'); await h.context.close();
}

(async () => {
  browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined), args: ['--no-sandbox']});
  await realDemo();
  await uncertainReplay('unknown-thrown');
  await uncertainReplay('unknown-returned');
  await historicalDraft();
  await alternativeDraft();
  console.log(checks + ' verificações de rotina e diário alimentar passaram.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  for (const context of contexts) await context.close().catch(() => {});
  if (browser) await browser.close();
});
