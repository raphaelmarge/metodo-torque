/* Navegador real, duas abas, somente origem/identidades/dados fictícios. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765';
const FIXTURE = new URL('/history-fixture', BASE).href;
const { chromium } = require(process.env.TORQUE_PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  try {
    const ctx = await browser.newContext({ serviceWorkers: 'block' });
    await ctx.route('**/*', r => r.request().url() === FIXTURE
      ? r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Fixture fictícia</title><button id="cancel">Cancelar</button>' }) : r.abort());
    await ctx.addInitScript({ content: fs.readFileSync(path.join(__dirname, '../app/treino-historico-core.js'), 'utf8') });
    const pages = await Promise.all([ctx.newPage(), ctx.newPage()]);
    async function init(p, actor) {
      await p.goto(FIXTURE);
      await p.evaluate(actor => {
        window.allowed = true;
        window.journal = MT_TREINO_HISTORICO.createLocked({ storage: localStorage, locks: navigator.locks, scope: 'synthetic-only', actor, active: () => allowed });
      }, actor);
    }
    await Promise.all(pages.map((p, i) => init(p, 'tab-' + i)));
    await pages[0].evaluate(() => journal.start({ id: 'session-a', kind: 'musculacao', date: '2026-09-03', prescribed: { name: 'Ficha fictícia', sets: [{ id: 'set-a', reps: 8 }] } }));
    const outcomes = await Promise.all(pages.map((p, i) => p.evaluate(async i => {
      try { await journal.record({ id: 'write-' + i, session: 'session-a', target: 'set-a', expected: [], value: { reps: i + 8 } }); return 'ok'; }
      catch (e) { return e.code; }
    }, i)));
    assert.deepEqual(outcomes.slice().sort(), ['STALE_REVISION', 'ok']);
    console.log('OK duas abas: revisão concorrente obsoleta não sobrescreve a vencedora');
    await Promise.all(pages.map((p, i) => p.evaluate(async i => {
      for (let n = 0; n < 20; n++) await journal.record({ id: 'write-' + i + '-' + n, session: 'session-a', target: 'target-' + i + '-' + n, expected: [], value: { reps: n } });
    }, i)));
    assert.equal(await pages[0].evaluate(async () => Object.keys((await journal.session('session-a')).targets).length), 41);
    console.log('OK 40 gravações em alvos diferentes preservadas entre abas');
    await Promise.all(pages.map((p, i) => p.evaluate(i => journal.finish({ id: 'finish-' + i, session: 'session-a', value: { partial: true } }), i)));
    assert.equal(await pages[0].evaluate(async () => (await journal.session('session-a')).finishes.length), 1);
    console.log('OK duplo encerramento simultâneo com locks preserva uma conclusão');
    const before = await pages[0].evaluate(() => journal.packet());
    await init(pages[0], 'tab-0');
    assert.deepEqual(await pages[0].evaluate(() => journal.packet()), before);
    await pages[0].click('#cancel');
    assert.deepEqual(await pages[0].evaluate(() => journal.packet()), before);
    console.log('OK reload/cancelar sem perder progresso ou produzir eventos');
    await ctx.setOffline(true);
    const quota = await pages[0].evaluate(async () => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function () { throw new DOMException('Quota', 'QuotaExceededError'); };
      try {
        const t = (await journal.session('session-a')).targets['set-a'];
        await journal.record({ id: 'quota-edit', session: 'session-a', target: 'set-a', expected: t.heads, correction: true, reason: 'Reps esquecidas', value: { reps: 12 } });
      } catch (e) { return e.name; } finally { Storage.prototype.setItem = original; }
    });
    assert.equal(quota, 'QuotaExceededError');
    assert.deepEqual(await pages[0].evaluate(() => journal.packet()), before);
    await pages[0].evaluate(async () => {
      const t = (await journal.session('session-a')).targets['set-a'];
      const e = { id: 'quota-edit', session: 'session-a', target: 'set-a', expected: t.heads, correction: true, reason: 'Reps esquecidas', value: { reps: 12 } };
      await journal.record(e); await journal.record(e);
    });
    assert.equal(await pages[1].evaluate(async () => (await journal.session('session-a')).targets['set-a'].value.reps), 12);
    console.log('OK quota offline mantém original; retry/duplo toque salva uma correção');
    assert.equal(await pages[0].evaluate(async () => { allowed = false; try { await journal.packet(); } catch(e) { return e.code; } }), 'IDENTITY_CHANGED');
    assert.equal(await pages[1].evaluate(() => { try { MT_TREINO_HISTORICO.createLocked({}); } catch(e) { return e.code; } }), 'LOCKS_UNAVAILABLE');
    console.log('OK identidade trocada e ausência de locks não degradam para escrita insegura');
    await ctx.close();
    console.log('6 cenários de navegador passaram.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
