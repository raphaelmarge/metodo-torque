/* Integrated HQ workflows. Synthetic session only; all external requests blocked. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('./ci/node_modules/playwright');
const { createServer } = require('../tools/hq-ops/serve.cjs');

async function run() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const launch = { headless: true, args: ['--no-sandbox'] };
  const localChrome = process.env.CHROMIUM_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  if (fs.existsSync(localChrome)) launch.executablePath = localChrome;
  let browser, checks = 0;
  try {
    browser = await chromium.launch(launch);
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, serviceWorkers: 'block' });
    const external = [], errors = [];
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin !== origin) { external.push(route.request().url()); return route.abort(); }
      return route.continue();
    });
    // Observe the real demo adapter and allow source-status fixtures without exposing a production client.
    await context.addInitScript(() => {
      window.__hqBrowserCommands = [];
      window.__hqBrowserSourceOverrides = {};
      Object.defineProperty(window, 'HQOpsData', {
        configurable: true,
        set(api) {
          const wrapped = Object.assign({}, api);
          wrapped.createDemoStore = options => {
            const store = api.createDemoStore(window.__hqBrowserNow ? Object.assign({}, options, { now: window.__hqBrowserNow }) : options);
            const observed = Object.assign({}, store, {
              async load() {
                const snapshot = await store.load();
                Object.keys(window.__hqBrowserSourceOverrides).forEach(k => {
                  snapshot.sources[k] = Object.assign({}, snapshot.sources[k], window.__hqBrowserSourceOverrides[k]);
                });
                window.__hqBrowserSnapshot = JSON.parse(JSON.stringify(snapshot));
                return snapshot;
              },
              async command(command) {
                const result = await store.command(command);
                window.__hqBrowserCommands.push({ command: JSON.parse(JSON.stringify(command)), result: JSON.parse(JSON.stringify(result)) });
                return result;
              }
            });
            window.__hqBrowserStore = observed;
            return observed;
          };
          Object.defineProperty(window, 'HQOpsData', { configurable: true, writable: true, value: wrapped });
        }
      });
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.setDefaultTimeout(7000);
    async function test(name, fn) { await fn(); checks++; console.log('ok ' + checks + ' - ' + name); }
    async function nav(area) { await page.locator('.hq-nav [data-nav="' + area + '"]').click(); await page.locator('#hqArea [data-hq-area="' + area + '"]').waitFor(); }
    const dialog = () => page.locator('dialog[open]');
    async function field(name, value) {
      const el = dialog().locator('[name="' + name + '"]');
      if (await el.evaluate(n => n.tagName === 'SELECT')) await el.selectOption(value);
      else await el.fill(value);
    }
    async function submit(reason) {
      await field('reason', reason || 'Evidência fictícia do ensaio local.');
      await dialog().locator('button[type="submit"]').click();
      const result = await page.waitForFunction(() => {
        const d = document.querySelector('dialog[open]');
        if (!d) return { ok: true };
        const error = d.querySelector('[role="alert"]');
        if (error && error.textContent.trim()) return { error: error.textContent };
        return false;
      });
      const outcome = await result.jsonValue();
      assert.equal(outcome.error, undefined, 'form submission: ' + outcome.error);
    }
    async function snapshot() { return page.evaluate(() => JSON.parse(JSON.stringify(window.__hqBrowserSnapshot))); }
    async function openAction(action, id) {
      await page.locator('[data-hq-action="' + action + '"]' + (id ? '[data-id="' + id + '"]' : '')).first().click();
      await dialog().waitFor();
    }
    let leadId, caseId, incidentId, invoiceId, expenseId, accountId;
    await test('preview loads actual shell and adapter without external requests', async () => {
      await page.goto(origin + '/apps/hq-ops-preview.html');
      await page.locator('.hq-stats .hq-stat').first().waitFor();
      const s = await snapshot(); accountId = s.accounts[0].id;
      assert.equal(s.meta.mode, 'demo'); assert.equal(s.meta.synthetic, true); assert.deepEqual(external, []);
    });
    await test('create and edit a lead with stage, owner and follow-up', async () => {
      await nav('sales'); await openAction('lead.create');
      await field('name', 'Oportunidade fictícia do navegador'); await field('stage', 'contato');
      await field('owner', (await snapshot()).currentUserId); await field('nextActionAt', '2026-10-01'); await submit();
      let s = await snapshot(); const lead = s.leads.find(x => x.name === 'Oportunidade fictícia do navegador');
      assert.ok(lead); leadId = lead.id; assert.equal(lead.stage, 'contato');
      await openAction('lead.update', leadId); await field('stage', 'proposta'); await field('nextActionAt', '2026-10-03'); await submit();
      s = await snapshot(); assert.equal(s.leads.find(x => x.id === leadId).stage, 'proposta');
      assert.match(await page.locator('tr').filter({ has: page.locator('[data-id="' + leadId + '"]') }).innerText(), /Proposta/);
    });
    await test('create incident, link an affected account and record release', async () => {
      await nav('health'); await openAction('incident.create'); await field('title', 'Incidente fictício do navegador');
      await field('severity', 'alta'); await field('status', 'investigando'); await field('owner', (await snapshot()).currentUserId);
      await field('release', 'revisao-local'); await field('affectedAccount', accountId); await submit();
      let i = (await snapshot()).incidents.find(x => x.title === 'Incidente fictício do navegador'); incidentId = i.id;
      assert.deepEqual(i.accountIds, [accountId]); assert.equal(i.release, 'revisao-local');
      await openAction('incident.update', incidentId); await field('status', 'monitorando'); await submit('Correção fictícia em observação.');
      i = (await snapshot()).incidents.find(x => x.id === incidentId); assert.equal(i.status, 'monitorando');
    });
    await test('create and organize case with incident and next action', async () => {
      await nav('support'); await openAction('case.create'); await field('subject', 'Caso fictício do navegador');
      await field('accountId', accountId); await field('priority', 'alta'); await field('owner', (await snapshot()).currentUserId);
      await field('nextActionAt', '2026-10-01'); await field('incidentId', incidentId); await submit();
      const c = (await snapshot()).cases.find(x => x.subject === 'Caso fictício do navegador'); caseId = c.id;
      assert.equal(c.incidentId, incidentId); assert.equal(c.channel, 'manual');
      await openAction('case.update', caseId); await field('status', 'em_andamento'); await field('nextActionAt', '2026-10-02'); await submit();
      assert.equal((await snapshot()).cases.find(x => x.id === caseId).status, 'em_andamento');
    });
    await test('internal note and customer draft remain distinct and are never delivered', async () => {
      await openAction('case.message', caseId); await field('visibility', 'internal');
      await field('text', 'Nota fictícia <img src=x onerror=alert(1)>'); await submit();
      await openAction('case.message', caseId); await field('visibility', 'customer'); await field('text', 'Rascunho fictício sem envio.'); await submit();
      const c = (await snapshot()).cases.find(x => x.id === caseId);
      assert.equal(c.messages.length, 2); assert.equal(c.messages[0].delivery, 'internal'); assert.equal(c.messages[1].delivery, 'not_sent');
      assert.ok(!c.firstResponseAt, 'draft cannot fabricate effective first response');
      await openAction('case.history', caseId); assert.match(await dialog().innerText(), /Nota interna/); assert.match(await dialog().innerText(), /não enviado/);
      assert.equal(await dialog().locator('img').count(), 0); await dialog().getByRole('button', { name: 'Fechar', exact: true }).click();
    });
    await test('manual receivable accepts partial receipt and preserves remaining balance', async () => {
      await nav('finance'); await openAction('invoice.create'); await field('accountId', accountId); await field('label', 'Cobrança fictícia do navegador');
      await field('total', '100,00'); await field('dueDate', '2026-09-30'); await field('competenceDate', '2026-09-30'); await submit();
      const invoice = (await snapshot()).invoices.find(x => x.label === 'Cobrança fictícia do navegador'); invoiceId = invoice.id;
      await openAction('invoice.recordPayment', invoiceId); await field('amount', '25,00'); await field('paidAt', '2026-09-30'); await field('reference', 'FICTICIO-REC-001'); await submit();
      const s = await snapshot(); assert.equal(s.invoices.find(x => x.id === invoiceId).status, 'partial');
      assert.equal(s.payments.find(x => x.invoiceId === invoiceId).amountCents, 2500);
      const row = page.locator('tr').filter({ has: page.locator('[data-id="' + invoiceId + '"]') }); assert.match(await row.innerText(), /75,00/);
      await openAction('invoice.recordPayment', invoiceId); await field('amount', '76,00'); await field('reference', 'FICTICIO-INVALIDO'); await field('reason', 'Tentativa excessiva fictícia.');
      const before = await page.evaluate(() => window.__hqBrowserCommands.length); await dialog().locator('[type="submit"]').click();
      await page.waitForFunction(() => /ultrapassa/.test(document.querySelector('dialog [role="alert"]').textContent));
      assert.equal(await page.evaluate(() => window.__hqBrowserCommands.length), before); await dialog().getByRole('button', { name: 'Voltar', exact: true }).click();
    });
    await test('manual payable accepts partial payment without creating receivables', async () => {
      await openAction('expense.create'); await field('payee', 'Fornecedor fictício'); await field('label', 'Despesa fictícia do navegador');
      await field('total', '200,00'); await field('dueDate', '2026-09-30'); await submit();
      await page.locator('[data-hq-set-filter="tab"][data-value="payable"]').click();
      expenseId = (await snapshot()).expenses.find(x => x.label === 'Despesa fictícia do navegador').id;
      await openAction('expense.recordPayment', expenseId); await field('amount', '60,00'); await field('paidAt', '2026-09-30'); await field('reference', 'FICTICIO-PAG-001'); await submit();
      const s = await snapshot(); assert.equal(s.expenses.find(x => x.id === expenseId).status, 'partial');
      assert.equal(s.expensePayments.find(x => x.expenseId === expenseId).amountCents, 6000);
      assert.match(await page.locator('tr').filter({ has: page.locator('[data-id="' + expenseId + '"]') }).innerText(), /140,00/);
    });
    await test('cancellation creates visible request without changing subscription or access', async () => {
      await nav('customers'); const before = await snapshot(); const sub = before.subscriptions.find(x => x.accountId === accountId && x.status === 'active'); assert.ok(sub);
      await openAction('subscription.requestCancel', sub.id); await submit('Pedido fictício do navegador.');
      const after = await snapshot(); const request = after.subscriptionRequests.find(x => x.accountId === accountId);
      assert.ok(request); assert.equal(request.note, 'Pedido fictício do navegador.');
      assert.deepEqual(after.subscriptions.find(x => x.id === sub.id), sub);
      assert.deepEqual(after.accounts.find(x => x.id === accountId), before.accounts.find(x => x.id === accountId));
      assert.match(await page.locator('#hqArea').innerText(), /Pedido fictício do navegador/);
    });
    await test('audit exposes authorized actions and their reasons without edit controls', async () => {
      await nav('admin'); assert.match(await page.locator('#hqArea').innerText(), /Pedido fictício do navegador/);
      assert.equal(await page.locator('#hqArea [data-hq-action]').count(), 0);
      const s = await snapshot(); assert.ok(s.audit.some(x => (x.action || x.type) === 'case.message')); assert.ok(s.audit.some(x => (x.action || x.type) === 'invoice.recordPayment'));
    });
    await test('source failure never appears as zero financial balance', async () => {
      await page.evaluate(() => { window.__hqBrowserSourceOverrides.payments = { status: 'error', message: 'Falha fictícia na fonte de recebimentos.' }; });
      await page.locator('#hqRefresh').click(); await nav('finance');
      // The explicit tab selection avoids using a previously opened payable ledger.
      if (await page.locator('[data-hq-set-filter="tab"][data-value="receivable"]').count()) await page.locator('[data-hq-set-filter="tab"][data-value="receivable"]').click();
      assert.match(await page.locator('#hqArea').innerText(), /Falha fictícia|dados suficientes/);
      assert.equal(await page.locator('#hqArea .hq-section-stats').count(), 0);
      await page.evaluate(() => { window.__hqBrowserSourceOverrides = {}; }); await page.locator('#hqRefresh').click();
    });
    await test('role change removes finance and write controls from viewer', async () => {
      await page.locator('#hqDemoRole').selectOption('viewer'); await page.waitForFunction(() => window.__hqBrowserSnapshot.role === 'viewer');
      assert.equal(await page.locator('.hq-nav [data-nav="finance"]').count(), 0);
      await nav('customers'); const buttons = page.locator('[data-hq-action="subscription.requestCancel"]');
      for (let i = 0; i < await buttons.count(); i++) assert.equal(await buttons.nth(i).isDisabled(), true);
      const denied = await page.evaluate(async () => { try { await window.__hqBrowserStore.command({ type: 'invoice.create', idempotencyKey: 'browser-forbidden-001', reason: 'Teste de recusa.', payload: { accountId: window.__hqBrowserSnapshot.accounts[0].id, label: 'Negado', totalCents: 100, dueDate: '2026-09-30' } }); return false; } catch (_) { return true; } });
      assert.equal(denied, true); await page.locator('#hqDemoRole').selectOption('admin'); await page.waitForFunction(() => window.__hqBrowserSnapshot.role === 'admin');
    });
    await test('local filters do not leak into unrelated areas or survive explicit tab reset', async () => {
      await nav('support'); await page.locator('[data-hq-filter="status"]').selectOption('resolvido'); await nav('finance');
      assert.equal(await page.locator('[data-hq-filter="status"]').inputValue(), '', 'support status leaked into finance');
      await page.locator('[data-hq-filter="status"]').selectOption('outstanding'); await page.locator('[data-hq-filter="due"]').selectOption('today');
      await page.locator('[data-hq-set-filter="tab"][data-value="payable"]').click();
      assert.equal(await page.locator('[data-hq-filter="status"]').inputValue(), '', 'deleted status filter was merged back');
      assert.equal(await page.locator('[data-hq-filter="due"]').inputValue(), '', 'deleted due filter was merged back');
    });
    await test('support preserves hidden incident link and distinguishes unavailable subscription', async () => {
      await page.locator('#hqDemoRole').selectOption('support'); await page.waitForFunction(() => window.__hqBrowserSnapshot.role === 'support');
      const before = await snapshot(); assert.equal(before.incidents.length, 0); assert.equal(before.cases.find(x => x.id === caseId).incidentId, incidentId);
      await nav('support'); await openAction('case.update', caseId);
      assert.equal(await dialog().locator('[name="incidentId"]').count(), 0);
      await field('nextActionAt', '2026-10-03'); await submit('Acompanhamento fictício preservando o incidente.');
      const after = await snapshot(); assert.equal(after.cases.find(x => x.id === caseId).incidentId, incidentId);
      const last = await page.evaluate(() => window.__hqBrowserCommands.at(-1).command);
      assert.equal(Object.hasOwn(last.payload, 'incidentId'), false);
      await nav('customers'); assert.match(await page.locator('#hqArea').innerText(), /Assinatura indisponível/);
      assert.doesNotMatch(await page.locator('#hqArea').innerText(), /Sem assinatura vinculada/);
      await page.locator('#hqDemoRole').selectOption('admin'); await page.waitForFunction(() => window.__hqBrowserSnapshot.role === 'admin');
    });
    await test('partial support coverage remains explicit and legacy link is admin-only', async () => {
      await page.evaluate(() => { window.__hqBrowserSourceOverrides.cases = { scope: 'opsOnly', message: 'Somente casos da nova central; histórico anterior não incorporado.' }; window.__hqBrowserSourceOverrides.legacySupport = { status: 'unavailable', migrationPending: true }; });
      await page.locator('#hqRefresh').click(); await nav('support');
      assert.match(await page.locator('#hqArea').innerText(), /histórico anterior não incorporado/);
      assert.equal(await page.locator('#hqArea a[href="hq.html?legacy=1"]').count(), 1);
      await page.locator('#hqDemoRole').selectOption('support'); await page.waitForFunction(() => window.__hqBrowserSnapshot.role === 'support'); await nav('support');
      assert.match(await page.locator('#hqArea').innerText(), /histórico anterior não incorporado/);
      assert.equal(await page.locator('#hqArea a[href="hq.html?legacy=1"]').count(), 0);
      await page.evaluate(() => { window.__hqBrowserSourceOverrides = {}; });
      await page.locator('#hqDemoRole').selectOption('admin'); await page.waitForFunction(() => window.__hqBrowserSnapshot.role === 'admin');
    });
    await test('selected UTC civil day agrees with financial due-today filter near midnight', async () => {
      const midnight = await context.newPage(); midnight.on('pageerror', e => errors.push(e.message));
      await midnight.addInitScript(() => { window.__hqBrowserNow = '2026-10-01T01:30:00Z'; });
      await midnight.goto(origin + '/apps/hq-ops-preview.html'); await midnight.locator('.hq-stats .hq-stat').first().waitFor();
      await midnight.locator('#hqFilters [name="timeZone"]').selectOption('UTC'); await midnight.locator('#hqFilters button').click();
      await midnight.locator('.hq-nav [data-nav="finance"]').click(); await midnight.locator('[data-hq-filter="due"]').selectOption('today');
      const dueDates = await midnight.locator('.hq-table tbody tr').evaluateAll(rows => rows.map(row => row.cells[2].textContent.trim()));
      assert.ok(dueDates.length > 0, 'UTC today contains demo invoices on 01/10');
      assert.ok(dueDates.every(d => d === '01/10/2026'), 'all due dates must use selected UTC day');
      await midnight.locator('#hqFilters [name="timeZone"]').selectOption('America/Sao_Paulo'); await midnight.locator('#hqFilters button').click();
      const brazilDates = await midnight.locator('.hq-table tbody tr').evaluateAll(rows => rows.map(row => row.cells[2].textContent.trim()));
      assert.ok(brazilDates.length > 0, 'Brazil today contains demo invoices on 30/09');
      assert.ok(brazilDates.every(d => d === '30/09/2026'), 'Brazil due dates must differ at this instant');
      await midnight.close();
    });
    const live = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
    await live.route('**/*', route => {
      if (new URL(route.request().url()).origin !== origin) { external.push(route.request().url()); return route.abort(); }
      return route.continue();
    });
    await live.addInitScript(() => {
      window.__hqAuthListeners = [];
      window.__hqAuthUser = '00000000-0000-4000-8000-000000009000';
      window.__hqDenyCommand = false;
      window.MT_supabase = {
        auth: {
          getSession: async () => ({ data: { session: { user: { id: window.__hqAuthUser } } } }),
          onAuthStateChange: listener => { window.__hqAuthListeners.push(listener); return { data: { subscription: { unsubscribe() {} } } }; }
        },
        async rpc(name) {
          if (name === 'hq_sou_admin') return { data: true };
          if (name === 'hq_ops_snapshot') {
            const s = window.HQOpsData.sampleSnapshot({ now: '2026-09-30T15:00:00Z' });
            s.meta.mode = 'server'; s.meta.authenticated = true; s.currentUserId = window.__hqAuthUser;
            s.accounts[0].name = 'Conta sentinela fictícia'; return { data: s };
          }
          if (name === 'hq_ops_command') return window.__hqDenyCommand ? { error: { code: '42501', message: 'Permissão revogada no ensaio.' } } : { data: { ok: true } };
          return { error: { code: 'PGRST202', message: 'Não simulado.' } };
        }
      };
    });
    await test('changing authenticated user clears old data and open details immediately', async () => {
      const lp = await live.newPage(); lp.setDefaultTimeout(7000); lp.on('pageerror', e => errors.push(e.message));
      await lp.goto(origin + '/apps/hq.html'); await lp.locator('.hq-nav [data-nav="customers"]').click();
      await lp.getByRole('button', { name: 'Conta sentinela fictícia', exact: true }).click(); await lp.locator('dialog[open]').waitFor();
      await lp.evaluate(() => { window.__hqAuthUser = '00000000-0000-4000-8000-000000009001'; [...window.__hqAuthListeners].forEach(fn => fn('SIGNED_IN', { user: { id: window.__hqAuthUser } })); });
      await lp.getByText(/Acesso indisponível/).waitFor();
      assert.equal(await lp.locator('dialog[open]').count(), 0); assert.equal(await lp.getByText('Conta sentinela fictícia', { exact: true }).count(), 0);
      await lp.close();
    });
    await test('server authorization denial clears the operational form and sensitive data', async () => {
      const lp = await live.newPage(); lp.setDefaultTimeout(7000); lp.on('pageerror', e => errors.push(e.message));
      await lp.goto(origin + '/apps/hq.html'); await lp.locator('.hq-nav [data-nav="sales"]').click();
      await lp.locator('[data-hq-action="lead.create"]').click(); const d = lp.locator('dialog[open]');
      await d.locator('[name="name"]').fill('Tentativa fictícia negada'); await d.locator('[name="nextActionAt"]').fill('2026-10-01');
      await d.locator('[name="reason"]').fill('Verificação de revogação de acesso.');
      await lp.evaluate(() => { window.__hqDenyCommand = true; }); await d.locator('[type="submit"]').click();
      await lp.getByText(/Acesso indisponível/).waitFor();
      assert.equal(await lp.locator('dialog[open]').count(), 0); assert.equal(await lp.locator('.hq-nav').count(), 0);
      assert.equal(await lp.getByText('Tentativa fictícia negada', { exact: true }).count(), 0); await lp.close();
    });
    await live.close();
    await test('completed workflows emitted no page errors or external requests', async () => {
      assert.deepEqual(errors, []); assert.deepEqual(external, []);
      assert.ok((await page.evaluate(() => window.__hqBrowserCommands)).every(x => x.result.ok && x.command.reason && x.command.idempotencyKey));
    });
    await context.close();
    console.log('HQ integrated workflows: ' + checks + ' groups passed. Synthetic session only; external network blocked.');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
