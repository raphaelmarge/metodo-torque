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
        window.mirrorWarnings = [];
        window.journal = MT_TREINO_HISTORICO.createLocked({ storage: localStorage, locks: navigator.locks, scope: 'synthetic-only', actor, active: () => allowed, mirrorError: (error, state) => mirrorWarnings.push({ name: error.name, committed: state.committed }) });
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
    await pages[1].evaluate(() => { window.oldStorage = Object.fromEntries(Object.entries(localStorage)); });
    await Promise.all(pages.map((p, i) => p.evaluate(i => journal.finish({ id: 'finish-' + i, session: 'session-a', value: { partial: true } }), i)));
    assert.equal(await pages[0].evaluate(async () => (await journal.session('session-a')).finishes.length), 1);
    console.log('OK duplo encerramento simultâneo com locks preserva uma conclusão');
    // Deterministic stale renderer: this client never receives another tab's
    // localStorage updates. IDB must supply the already committed finish.
    const staleResult = await pages[1].evaluate(async () => {
      const rows = new Map(Object.entries(oldStorage));
      const storage = { get length() { return rows.size; }, key: i => [...rows.keys()][i], getItem: k => rows.has(k) ? rows.get(k) : null, setItem: (k, v) => rows.set(k, v) };
      const stale = MT_TREINO_HISTORICO.createLocked({ storage, locks: navigator.locks, scope: 'synthetic-only', actor: 'stale-renderer', active: () => true });
      await stale.finish({ id: 'finish-stale', session: 'session-a', value: { partial: false } });
      return stale.session('session-a');
    });
    assert.equal(staleResult.finishes.length, 1);
    assert.notEqual(staleResult.finish.id, 'finish-stale');
    assert.equal(staleResult.finish.value.partial, true);
    console.log('OK snapshot local deliberadamente obsoleto respeita a conclusão transacional');
    for (let round = 0; round < 40; round++) {
      const sid = 'finish-stress-' + round;
      await pages[round % 2].evaluate(sid => journal.start({ id: sid, kind: 'circuito', date: '2026-09-03', prescribed: {} }), sid);
      const outcomes = await Promise.all(pages.map((p, i) => p.evaluate(({ sid, i }) => journal.finish({ id: sid + '-' + i, session: sid, value: { rounds: i + 1 } }), { sid, i })));
      assert.equal(outcomes[0].id, outcomes[1].id, 'ambas as abas recebem o mesmo encerramento na rodada ' + round);
      assert.equal(await pages[0].evaluate(async sid => (await journal.session(sid)).finishes.length, sid), 1);
    }
    console.log('OK 40 pares de encerramentos concorrentes preservam um evento por sessão');
    await pages[0].evaluate(async () => {
      window.abortJournal = MT_TREINO_HISTORICO.createLocked({ storage: localStorage, locks: navigator.locks, scope: 'aborted-finish', actor: 'abort-a', active: () => true });
      await abortJournal.start({ id: 'abort-session', kind: 'circuito', date: '2026-09-03', prescribed: {} });
    });
    await pages[1].evaluate(() => {
      const rows = new Map(Object.entries(localStorage));
      const storage = { get length() { return rows.size; }, key: i => [...rows.keys()][i], getItem: k => rows.has(k) ? rows.get(k) : null, setItem: (k, v) => rows.set(k, v) };
      window.staleAbortJournal = MT_TREINO_HISTORICO.createLocked({ storage, locks: navigator.locks, scope: 'aborted-finish', actor: 'abort-b', active: () => true });
    });
    const abortedFinish = await pages[0].evaluate(async () => {
      const original = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function () { const request = original.apply(this, arguments); this.transaction.abort(); return request; };
      try { await abortJournal.finish({ id: 'aborted-a', session: 'abort-session', value: { rounds: 1 } }); }
      catch (error) { return { name: error.name, pending: localStorage.getItem('tqWorkoutJournal:aborted-finish:aborted-a') }; }
      finally { IDBObjectStore.prototype.put = original; }
    });
    assert(abortedFinish, 'transação abortada não anuncia sucesso');
    await pages[1].evaluate(() => staleAbortJournal.finish({ id: 'committed-b', session: 'abort-session', value: { rounds: 2 } }));
    const recoveredFinish = await pages[0].evaluate(async () => {
      await abortJournal.finish({ id: 'aborted-a', session: 'abort-session', value: { rounds: 1 } });
      return abortJournal.session('abort-session');
    });
    assert.equal(recoveredFinish.finishes.length, 1, 'retry após aborto não promove um encerramento que nunca foi confirmado');
    assert.equal(recoveredFinish.finish.id, 'committed-b');
    assert.equal(abortedFinish.pending, null, 'evento abortado não escapa do staging para o espelho local');
    console.log('OK aborto real seguido de outra aba e retry mantém somente o encerramento confirmado');
    const before = await pages[0].evaluate(() => journal.packet());
    await init(pages[0], 'tab-0');
    assert.deepEqual(await pages[0].evaluate(() => journal.packet()), before);
    await pages[0].click('#cancel');
    assert.deepEqual(await pages[0].evaluate(() => journal.packet()), before);
    console.log('OK reload/cancelar sem perder progresso ou produzir eventos');
    await ctx.setOffline(true);
    const quota = await pages[0].evaluate(async () => {
      const t = (await journal.session('session-a')).targets['set-a'];
      const original = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function () { throw new DOMException('Quota', 'QuotaExceededError'); };
      try {
        await journal.record({ id: 'quota-edit', session: 'session-a', target: 'set-a', expected: t.heads, correction: true, reason: 'Reps esquecidas', value: { reps: 12 } });
      } catch (e) { return e.name; } finally { IDBObjectStore.prototype.put = original; }
    });
    assert.equal(quota, 'QuotaExceededError');
    assert.deepEqual(await pages[0].evaluate(() => journal.packet()), before);
    await pages[0].evaluate(async () => {
      const t = (await journal.session('session-a')).targets['set-a'];
      const e = { id: 'quota-edit', session: 'session-a', target: 'set-a', expected: t.heads, correction: true, reason: 'Reps esquecidas', value: { reps: 12 } };
      await journal.record(e); await journal.record(e);
    });
    assert.equal(await pages[1].evaluate(async () => (await journal.session('session-a')).targets['set-a'].value.reps), 12);
    console.log('OK quota da autoridade offline mantém original; retry/duplo toque salva uma correção');
    const mirrorCommit = await pages[0].evaluate(async () => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function () { throw new DOMException('Mirror quota', 'QuotaExceededError'); };
      try { return await journal.record({ id: 'mirror-only', session: 'session-a', target: 'mirror-target', expected: [], correction: true, reason: 'Correção offline', value: { reps: 11 } }); }
      finally { Storage.prototype.setItem = original; }
    });
    assert.equal(mirrorCommit.id, 'mirror-only', 'evento durável não é anunciado como falha por falta de espaço no espelho');
    assert.deepEqual(await pages[0].evaluate(() => mirrorWarnings), [{ name: 'QuotaExceededError', committed: true }]);
    assert.equal(await pages[1].evaluate(async () => (await journal.session('session-a')).targets['mirror-target'].value.reps), 11);
    await init(pages[0], 'tab-0');
    assert.equal(await pages[0].evaluate(async () => (await journal.session('session-a')).targets['mirror-target'].value.reps), 11);
    assert(await pages[0].evaluate(() => localStorage.getItem('tqWorkoutJournal:synthetic-only:mirror-only')));
    console.log('OK espelho sem espaço conserva sucesso durável; outra aba e reload recuperam o evento');
    const failedCommit = await pages[0].evaluate(async () => {
      const original = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function () { throw new Error('SYNTHETIC_IDB_COMMIT_FAILURE'); };
      try { await journal.record({ id: 'commit-retry', session: 'session-a', target: 'commit-target', expected: [], correction: true, reason: 'Teste de repetição', value: { reps: 7 } }); }
      catch (error) { return error.message; }
      finally { IDBObjectStore.prototype.put = original; }
    });
    assert.equal(failedCommit, 'SYNTHETIC_IDB_COMMIT_FAILURE');
    assert.equal(await pages[0].evaluate(() => localStorage.getItem('tqWorkoutJournal:synthetic-only:commit-retry')), null, 'evento sem commit não é publicado no espelho');
    await pages[0].evaluate(() => journal.record({ id: 'commit-retry', session: 'session-a', target: 'commit-target', expected: [], correction: true, reason: 'Teste de repetição', value: { reps: 7 } }));
    assert.equal(await pages[1].evaluate(async () => (await journal.session('session-a')).targets['commit-target'].revisions.length), 1);
    console.log('OK falha de commit descarta somente staging e retry confirma uma única vez');
    const currentPacket = await pages[0].evaluate(() => journal.packet());
    const otherStudent = await pages[0].evaluate(async () => {
      const other = MT_TREINO_HISTORICO.createLocked({ storage: localStorage, locks: navigator.locks, scope: 'another-student', actor: 'tab-0', active: () => allowed });
      await other.start({ id: 'session-a', kind: 'corrida', date: '2026-09-03', prescribed: { name: 'Outro aluno fictício' } });
      await other.record({ id: 'write-0', session: 'session-a', target: 'set-a', expected: [], value: { distance: 500 } });
      return other.session('session-a');
    });
    assert.equal(otherStudent.kind, 'corrida');
    assert.deepEqual(otherStudent.targets['set-a'].value, { distance: 500 });
    assert.equal(Object.keys(otherStudent.targets).length, 1);
    assert.deepEqual(await pages[0].evaluate(() => journal.packet()), currentPacket, 'mesmos IDs em outro escopo não misturam alunos');
    console.log('OK escopos de alunos isolam sessões e eventos com os mesmos IDs');
    await pages[1].evaluate(() => {
      window.holdingLock = false;
      window.testGate = navigator.locks.request('tqWorkoutJournal:synthetic-only', async () => {
        window.holdingLock = true;
        await new Promise(resolve => { window.releaseTestGate = resolve; });
      });
    });
    await pages[1].waitForFunction(() => holdingLock);
    await pages[0].evaluate(() => {
      window.queuedResult = journal.record({ id: 'wrong-identity', session: 'session-a', target: 'identity-target', expected: [], correction: true, reason: 'Operação em fila', value: { reps: 1 } })
        .then(() => 'saved', error => error.code);
      window.allowed = false;
    });
    await pages[1].evaluate(async () => { releaseTestGate(); await testGate; });
    assert.equal(await pages[0].evaluate(() => queuedResult), 'IDENTITY_CHANGED');
    assert.deepEqual(await pages[1].evaluate(() => journal.packet()), currentPacket, 'troca de identidade durante a espera não grava no escopo anterior');
    console.log('OK operação em fila revalida a identidade ao adquirir o lock');
    assert.equal(await pages[0].evaluate(async () => { allowed = false; try { await journal.packet(); } catch(e) { return e.code; } }), 'IDENTITY_CHANGED');
    assert.equal(await pages[1].evaluate(() => { try { MT_TREINO_HISTORICO.createLocked({}); } catch(e) { return e.code; } }), 'LOCKS_UNAVAILABLE');
    assert.equal(await pages[1].evaluate(() => { try { MT_TREINO_HISTORICO.createLocked({ locks: navigator.locks, indexedDB: {} }); } catch(e) { return e.code; } }), 'TRANSACTION_STORAGE_UNAVAILABLE');
    console.log('OK identidade trocada e ausência de locks/IDB não degradam para escrita insegura');
    await ctx.close();
    console.log('13 cenários de navegador passaram.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
