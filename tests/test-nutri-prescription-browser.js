'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
let chromium;
if (process.env.TORQUE_PLAYWRIGHT) ({chromium} = require(process.env.TORQUE_PLAYWRIGHT));
else { try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } }
const BASE = (process.env.BASE_URL || 'http://127.0.0.1:8765').replace(/\/$/, '');
const ORIGIN = new URL(BASE).origin;
const draftKey = 'torque-nutri-draft:demo:demo-0';
const draft = page => page.evaluate(key => JSON.parse(sessionStorage.getItem(key)).data, draftKey);
let browser, checks = 0;
const pass = message => { checks++; console.log('PASS ' + message); };

(async () => {
  browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined), args: ['--no-sandbox']});
  const context = await browser.newContext({serviceWorkers: 'block', viewport: {width: 1280, height: 900}});
  const external = [], errors = [];
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== ORIGIN || !['GET', 'HEAD'].includes(request.method())) { external.push(url.origin + url.pathname); return route.abort(); }
    if (url.pathname.endsWith('/nutri/config.js')) return route.fulfill({status: 200, contentType: 'application/javascript', body: 'window.TORQUE_NUTRI_CONFIG = {};'});
    return route.continue();
  });
  await context.routeWebSocket('**/*', socket => { external.push('websocket'); socket.close(); });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const plans = async () => page.locator('.sidebar [data-page="plans"]').click();
  const editor = async () => page.locator('[data-edit-plan="demo-0"]').click();
  const firstPublished = () => page.locator('.patient-row').filter({has: page.locator('[data-edit-plan="demo-0"]')});
  await page.goto(BASE + '/nutri/demo-nutricionista.html');
  await plans(); await editor();
  assert.match(await page.locator('main').textContent(), /Contexto nutricional/);
  assert.match(await page.locator('main').textContent(), /Intolerância à lactose/);
  assert.equal(await page.locator('[data-follow-page="journal"][data-follow-patient="demo-0"]').count(), 2);
  await page.locator('#plan-title').fill('Plano revisado em consulta');
  const initial = await draft(page);
  await page.locator('[data-duplicate-meal="0"]').click();
  let current = await draft(page);
  assert.equal(current.refeicoes.length, initial.refeicoes.length + 1);
  assert.notEqual(current.refeicoes[1].id, initial.refeicoes[0].id);
  assert.notEqual(current.refeicoes[1].itens[0].id, initial.refeicoes[0].itens[0].id);
  await page.locator('[data-duplicate-food="1:0"]').click();
  current = await draft(page);
  assert.equal(current.refeicoes[1].itens.length, initial.refeicoes[0].itens.length + 1);
  assert.notEqual(current.refeicoes[1].itens[0].id, current.refeicoes[1].itens[1].id);
  pass('actual editor duplicates meals and foods using fresh IDs');

  const copied = current.refeicoes[1].id, copiedFood = current.refeicoes[1].itens[1].id;
  await page.locator('[data-move-meal="1:-1"]').click();
  await page.locator('[data-move-food="0:1:-1"]').click();
  for (let day = 0; day < 7; day++) await page.locator(`[data-meal-day="0:${day}"]`).uncheck();
  await page.locator('[data-meal-day="0:1"]').check();
  current = await draft(page);
  assert.equal(current.refeicoes[0].id, copied);
  assert.equal(current.refeicoes[0].itens[0].id, copiedFood);
  assert.deepEqual(current.refeicoes[0].dias, [1]);
  await page.locator('[data-action="save-draft"]').click();
  await plans();
  assert.match(await firstPublished().textContent(), /Publicado · v1/);
  assert.match(await firstPublished().textContent(), /Minha rotina alimentar/);
  await editor();
  assert.equal(await page.locator('#plan-title').inputValue(), 'Plano revisado em consulta');
  assert.equal(await page.locator('[data-meal-day="0:1"]').isChecked(), true);
  assert.equal(await page.locator('[data-meal-day="0:2"]').isChecked(), false);
  await page.locator('#plan-notes').fill('Orientações revisadas.');
  assert.equal((await draft(page)).refeicoes[0].id, copied);
  pass('reordered IDs and weekday selections persist in a draft without publishing');

  await page.locator('[data-action="publish-plan"]').first().click();
  assert.match(await page.locator('#modal-body').textContent(), /Próxima versão: 2/);
  assert.match(await page.locator('#modal-body').textContent(), /Seg/);
  await page.locator('#cancel-modal').click();
  await plans();
  assert.match(await firstPublished().textContent(), /Publicado · v1/);
  await editor();
  assert.equal(await page.locator('#plan-notes').inputValue(), 'Orientações revisadas.');
  pass('canceling publication review keeps both the current publication and the edited draft');

  for (const width of [320, 375, 800, 1280]) {
    await page.setViewportSize({width, height: 900});
    for (const light of [false, true]) {
      await page.evaluate(value => document.body.classList.toggle('theme-light', value), light);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      assert.equal(overflow, false, 'editor layout at ' + width + ' px, light=' + light);
    }
  }
  pass('editor remains within the viewport at 320/375/800/1280 px in both themes');
  await page.locator('[data-action="publish-plan"]').first().click();
  await page.locator('#modal-form button[type="submit"]').click();
  assert.equal(await page.locator('#modal').evaluate(dialog => dialog.open), true);
  assert.equal(await page.locator('#confirm-plan-review').isChecked(), false);
  await page.locator('#confirm-plan-review').check();
  await page.locator('#modal-form button[type="submit"]').click();
  await page.waitForFunction(() => !document.querySelector('#modal').open);
  await plans();
  assert.match(await firstPublished().textContent(), /Publicado · v2/);
  assert.match(await firstPublished().textContent(), /Plano revisado em consulta/);
  await editor();
  await page.locator('[data-x="plan-history"]').click();
  assert.equal(await page.locator('#modal [data-x="record-detail"]').count(), 2);
  pass('explicit review confirmation publishes once and retains both historical snapshots');
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  pass('test uses only the isolated demo without requests to APIs or real accounts');
  console.log(checks + ' prescription browser checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); });
