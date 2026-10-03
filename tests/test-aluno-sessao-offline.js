/* Dados sintéticos; sem servidor, credenciais ou rede externa. */
'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const core = require('../nativo/aluno/sessao');
const clone = x => JSON.parse(JSON.stringify(x));
const header = () => ({ v: 1, scopeId: 'synthetic-student', sessionId: 'synthetic-session', deviceId: 'watch-a', plan: { id: 'plan-a', revision: 'r1', activity: 'run', steps: [{ id: 'step-a', label: 'Trecho sintético', durationMs: 60000, distanceM: null }] } });
const event = (seq, type, data = {}) => ({ v: 1, id: 'event-' + seq, seq, deviceId: 'watch-a', type, at: '2026-10-03T12:00:00.000Z', data });
const sample = (elapsedMs = 1000, distanceM = null) => ({ elapsedMs, distanceM, heartRateBpm: null, position: null });
const started = () => ({ header: header(), events: [event(1, 'start'), event(2, 'sample', sample())] });

test('repetição, conflito, ordem, escopo, dispositivo e versão', () => {
  const batch = started(), r = core.merge(null, batch);
  assert.deepEqual(core.merge(r, clone(batch)), r);
  const conflict = clone(batch); conflict.events[1].data.elapsedMs = 2000;
  assert.throws(() => core.merge(r, conflict), /EVENT_CONFLICT/);
  for (const field of ['scopeId', 'sessionId', 'deviceId']) {
    const other = clone(batch); other.header[field] += '-other';
    assert.throws(() => core.merge(r, other), /SESSION_CONFLICT/);
  }
  const future = header(); future.v = 2;
  assert.throws(() => core.project(future, []), /UNSUPPORTED_VERSION/);
  assert.throws(() => core.project(header(), [event(2, 'start')]), /INVALID_EVENT/);
  assert.throws(() => core.project(header(), [{ ...event(1, 'start'), deviceId: 'phone' }]), /INVALID_EVENT/);
  assert.throws(() => core.project(header(), [{ ...event(1, 'start'), v: 2 }]), /UNSUPPORTED_VERSION/);
  assert.throws(() => core.merge(false, batch), /INVALID_FIELDS/);
  assert.throws(() => core.merge(null, { header: header(), events: [event(2, 'sample', sample()), event(1, 'start')] }), /INVALID_EVENT/);
  assert.deepEqual(core.merge(r, { header: header(), events: [batch.events[1], batch.events[0]] }), r);
  assert.throws(() => core.merge(null, { header: header(), events: [null] }), /INVALID_FIELDS/);
  assert.throws(() => core.project(header(), [event(1, 'start', new Date())]), /INVALID_FIELDS/);
});

test('plano é snapshot independente; revisão nova não muda execução antiga', () => {
  const batch = started(), r = core.merge(null, batch);
  batch.header.plan.steps[0].durationMs = 120000;
  assert.equal(r.header.plan.steps[0].durationMs, 60000);
  assert.throws(() => core.merge(r, batch), /SESSION_CONFLICT/);
  batch.header.plan.revision = 'r2';
  assert.throws(() => core.merge(r, batch), /SESSION_CONFLICT/);
});

test('interrupção, pausa, GPS ausente, parcial e métricas não inventadas', () => {
  const b = started();
  b.events.push(event(3, 'gps', { status: 'denied' }), event(4, 'interrupt'), event(5, 'resume'), event(6, 'sample', sample(1100)), event(7, 'finish', { result: 'partial' }));
  const s = core.project(b.header, b.events);
  assert.equal(s.elapsedMs, 1100); assert.equal(s.distanceM, null);
  assert.equal(s.heartRateBpm, null); assert.deepEqual(s.route, []);
  assert.equal(s.result, 'partial'); assert.equal(s.gps, 'denied');
  assert.throws(() => core.project(b.header, [...b.events, event(8, 'resume')]), /SESSION_FINISHED/);
  assert.throws(() => core.project(b.header, [event(1, 'start'), event(2, 'pause'), event(3, 'sample', sample())]), /INVALID_SAMPLE/);
  assert.throws(() => core.project(b.header, [event(1, 'start'), event(2, 'finish', { result: 'complete' })]), /INVALID_FINISH/);
  assert.throws(() => core.project(b.header, [...started().events, event(3, 'sample', sample(1))]), /INVALID_SAMPLE/);
  assert.throws(() => core.project(b.header, [event(1, 'start'), event(2, 'sample', sample(1000, 10)), event(3, 'sample', sample(2000, 9))]), /INVALID_DISTANCE/);
  assert.throws(() => core.project(b.header, [event(1, 'start'), event(2, 'sample', { ...sample(), position: { lat: 91, lng: 0, accuracyM: 5, segmentId: 'a' } })]), /INVALID_POSITION/);
  assert.throws(() => core.merge(null, { header: header(), events: [event(1, 'start'), event(2, 'sample', sample(1000, NaN))] }), /INVALID_DISTANCE/);
});

test('IndexedDB real: reabertura offline, concorrência, rollback, ACK e retry após resposta perdida', async () => {
  let chromium;
  try { chromium = require('./ci/node_modules/playwright').chromium; }
  catch (_) { try { chromium = require('playwright').chromium; } catch (_) { chromium = require('/opt/node22/lib/node_modules/playwright').chromium; } }
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext();
    await context.route('**/*', route => route.request().url() === 'https://session.test/' ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Synthetic session</title>' }) : route.abort());
    const page = await context.newPage(); await page.goto('https://session.test/');
    await page.addScriptTag({ path: path.join(__dirname, '../nativo/aluno/sessao.js') });
    await page.addScriptTag({ path: path.join(__dirname, '../nativo/aluno/indexeddb.js') });
    await context.setOffline(true);
    const result = await page.evaluate(async ({ b, next }) => {
      const store = TorqueSessionStore(indexedDB, 'synthetic'), j = TorqueSessao.journal(store);
      await j.receive(b); await store.close();
      const a = TorqueSessionStore(indexedDB, 'synthetic'), c = TorqueSessionStore(indexedDB, 'synthetic');
      const ja = TorqueSessao.journal(a), jc = TorqueSessao.journal(c);
      const recovery = await ja.recover(b.header);
      const retries = await Promise.all([ja.receive(b), jc.receive(b)]);
      let conflict;
      try { await ja.receive({ header: b.header, events: [next, { ...next, id: 'conflict' }] }); } catch (e) { conflict = e.message; }
      const afterRollback = await ja.read(b.header);
      let gap;
      try { await ja.receive({ header: b.header, events: [{ ...next, seq: 4 }] }); } catch (e) { gap = e.message; }
      const raceHeader = { ...b.header, sessionId: 'concurrent-conflict' };
      await ja.receive({ header: raceHeader, events: b.events });
      const race = await Promise.allSettled([
        ja.receive({ header: raceHeader, events: [next] }),
        jc.receive({ header: raceHeader, events: [{ ...next, type: 'pause' }] })
      ]);
      const raceStates = race.map(x => x.status), raceError = race.find(x => x.status === 'rejected').reason.message;
      const raceRecord = await ja.read(raceHeader);
      // Destino local separado simula servidor/telefone. ACK perdido: reenvio exato.
      const dest = TorqueSessionStore(indexedDB, 'synthetic-destination'), receiver = TorqueSessao.journal(dest);
      const pending = await ja.pending(b.header); await receiver.receive(pending);
      const ack = await receiver.receive(pending);
      await jc.receive({ header: b.header, events: [next] }); // chega evento enquanto envia
      await ja.acknowledge(b.header, ack); await ja.acknowledge(b.header, ack);
      const remaining = await ja.pending(b.header);
      let invalidAck;
      try { await ja.acknowledge(b.header, { ...ack, scopeId: 'other' }); } catch (e) { invalidAck = e.message; }
      let quota;
      const failing = TorqueSessao.journal({ read: a.read, update: () => Promise.reject(new Error('QuotaExceededError')) });
      try { await failing.receive({ header: b.header, events: [next] }); } catch (e) { quota = e.message; }
      const final = await ja.read(b.header), received = await receiver.read(b.header);
      let lostResponse;
      try { await ja.sync(b.header, async batch => { await receiver.receive(batch); throw new Error('LOST_RESPONSE'); }); }
      catch (e) { lostResponse = e.message; }
      const afterLost = await ja.pending(b.header);
      await ja.sync(b.header, batch => receiver.receive(batch));
      const afterSync = await ja.pending(b.header);
      // O adapter usa IDB real; injetamos falta de espaço no ponto de gravação.
      const put = IDBObjectStore.prototype.put;
      const full = () => { throw new DOMException('Synthetic quota', 'QuotaExceededError'); };
      IDBObjectStore.prototype.put = full;
      let fullWrite;
      try { await ja.receive({ header: b.header, events: [{ ...next, id: 'resume-4', seq: 4, type: 'resume' }] }); }
      catch (e) { fullWrite = e.name; }
      finally { IDBObjectStore.prototype.put = put; }
      const preserved = await ja.read(b.header);
      await ja.receive({ header: b.header, events: [{ ...next, id: 'resume-4', seq: 4, type: 'resume' }] });
      const ack4 = await receiver.receive(await ja.pending(b.header));
      IDBObjectStore.prototype.put = full;
      let fullAck;
      try { await ja.sync(b.header, async () => ack4); }
      catch (e) { fullAck = e.name; }
      finally { IDBObjectStore.prototype.put = put; }
      const unacked = await ja.pending(b.header);
      await ja.sync(b.header, batch => receiver.receive(batch));
      await ja.acknowledge(b.header, ack); // confirmação antiga não retrocede
      const staleAck = await ja.pending(b.header);
      const otherHeader = { ...b.header, scopeId: 'other-student' };
      await ja.receive({ header: otherHeader, events: b.events });
      const other = await ja.read(otherHeader);
      const corruptHeader = { ...b.header, sessionId: 'corrupt' }, corruptKey = TorqueSessao.key(corruptHeader);
      await a.update(corruptKey, () => false);
      let corruptRead, corruptWrite;
      try { await ja.read(corruptHeader); } catch (e) { corruptRead = e.message; }
      try { await ja.receive({ header: corruptHeader, events: [] }); } catch (e) { corruptWrite = e.message; }
      const corruptPreserved = await a.read(corruptKey);
      const nullKey = TorqueSessao.key({ ...corruptHeader, sessionId: 'corrupt-null' });
      await a.update(nullKey, () => null);
      let nullRead, nullWrite;
      try { await a.read(nullKey); } catch (e) { nullRead = e.message; }
      try { await a.update(nullKey, () => ({ replaced: true })); } catch (e) { nullWrite = e.message; }
      await Promise.all([a.close(), c.close(), dest.close()]);
      return { recovery, retries, conflict, afterRollback, gap, raceStates, raceError, raceRecord, remaining, invalidAck, quota, final, received, lostResponse, afterLost, afterSync, fullWrite, preserved, fullAck, unacked, staleAck, other, corruptRead, corruptWrite, corruptPreserved, nullRead, nullWrite };
    }, { b: started(), next: event(3, 'interrupt') });
    assert.equal(result.recovery.state.status, 'paused'); assert.equal(result.recovery.needsInterrupt, true);
    assert.equal(result.recovery.state.elapsedMs, 1000);
    assert.equal(result.retries[0].through, 2); assert.equal(result.retries[1].through, 2);
    assert.equal(result.conflict, 'EVENT_CONFLICT'); assert.equal(result.afterRollback.events.length, 2);
    assert.equal(result.gap, 'INVALID_EVENT');
    assert.deepEqual(result.raceStates.sort(), ['fulfilled', 'rejected']);
    assert.equal(result.raceError, 'EVENT_CONFLICT'); assert.equal(result.raceRecord.events.length, 3);
    assert.equal(result.remaining.events.length, 1); assert.equal(result.remaining.events[0].seq, 3);
    assert.equal(result.invalidAck, 'INVALID_ACK'); assert.equal(result.quota, 'QuotaExceededError');
    assert.equal(result.final.acked, 2); assert.equal(result.final.events.length, 3);
    assert.equal(result.received.events.length, 2);
    assert.equal(result.lostResponse, 'LOST_RESPONSE'); assert.equal(result.afterLost.events.length, 1);
    assert.equal(result.afterSync.events.length, 0);
    assert.equal(result.fullWrite, 'QuotaExceededError'); assert.equal(result.preserved.events.length, 3);
    assert.equal(result.fullAck, 'QuotaExceededError'); assert.equal(result.unacked.events.length, 1);
    assert.equal(result.staleAck.events.length, 0); assert.equal(result.other.events.length, 2);
    assert.equal(result.corruptRead, 'INVALID_FIELDS'); assert.equal(result.corruptWrite, 'INVALID_FIELDS');
    assert.equal(result.corruptPreserved, false);
    assert.equal(result.nullRead, 'CORRUPT_STORAGE'); assert.equal(result.nullWrite, 'CORRUPT_STORAGE');
  } finally { await browser.close(); }
});
