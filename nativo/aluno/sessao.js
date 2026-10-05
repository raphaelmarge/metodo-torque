/* Contrato experimental v1. Sem DOM, rede, autenticação ou relógio implícito. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TorqueSessao = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const fail = code => { throw new Error(code); };
  const text = x => typeof x === 'string' && x.length > 0 && x.length <= 256;
  const number = x => Number.isFinite(x) && x >= 0;
  const copy = x => structuredClone(x);
  function canonical(x) {
    if (x === null || typeof x !== 'object') return JSON.stringify(x);
    if (Array.isArray(x)) return '[' + x.map(canonical).join(',') + ']';
    return '{' + Object.keys(x).sort().map(k => JSON.stringify(k) + ':' + canonical(x[k])).join(',') + '}';
  }
  function keys(x, allowed) {
    if (!x || typeof x !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(x)) || Object.keys(x).some(k => !allowed.includes(k))) fail('INVALID_FIELDS');
  }
  function validateHeader(h) {
    keys(h, ['v', 'scopeId', 'sessionId', 'deviceId', 'plan']);
    if (h.v !== 1) fail('UNSUPPORTED_VERSION');
    if (![h.scopeId, h.sessionId, h.deviceId].every(text)) fail('INVALID_ID');
    const p = h.plan;
    keys(p, ['id', 'revision', 'activity', 'steps']);
    if (!text(p.id) || !text(p.revision) || !['run', 'walk', 'bike'].includes(p.activity)) fail('INVALID_PLAN');
    if (!Array.isArray(p.steps) || !p.steps.length || p.steps.length > 1000) fail('INVALID_STEPS');
    Array.from(p.steps).forEach(s => {
      keys(s, ['id', 'label', 'durationMs', 'distanceM']);
      if (!text(s.id) || !text(s.label) || ![s.durationMs, s.distanceM].every(n => n === null || (number(n) && n > 0))) fail('INVALID_STEP');
    });
    if (new Set(p.steps.map(s => s.id)).size !== p.steps.length) fail('DUPLICATE_STEP');
  }
  function key(h) { validateHeader(h); return JSON.stringify([h.scopeId, h.sessionId]); }
  function project(h, events) {
    validateHeader(h);
    if (!Array.isArray(events)) fail('INVALID_EVENTS');
    const state = { status: 'ready', elapsedMs: 0, distanceM: null, heartRateBpm: null, route: [], gps: 'unknown', result: null };
    const ids = new Set();
    Array.from(events).forEach((e, i) => {
      keys(e, ['v', 'id', 'seq', 'deviceId', 'type', 'at', 'data']);
      if (e.v !== 1) fail('UNSUPPORTED_VERSION');
      if (!text(e.id) || ids.has(e.id) || e.seq !== i + 1 || e.deviceId !== h.deviceId || !text(e.at) || !Number.isFinite(Date.parse(e.at))) fail('INVALID_EVENT');
      ids.add(e.id);
      if (state.status === 'finished') fail('SESSION_FINISHED');
      const d = e.data;
      if (e.type === 'sample') {
        keys(d, ['elapsedMs', 'distanceM', 'heartRateBpm', 'position']);
        if (state.status !== 'running' || !number(d.elapsedMs) || d.elapsedMs < state.elapsedMs) fail('INVALID_SAMPLE');
        if (d.distanceM !== null && (!number(d.distanceM) || (state.distanceM !== null && d.distanceM < state.distanceM))) fail('INVALID_DISTANCE');
        if (d.heartRateBpm !== null && (!number(d.heartRateBpm) || d.heartRateBpm === 0)) fail('INVALID_HEART_RATE');
        if (d.position !== null) {
          keys(d.position, ['lat', 'lng', 'accuracyM', 'segmentId']);
          const p = d.position;
          if (!Number.isFinite(p.lat) || Math.abs(p.lat) > 90 || !Number.isFinite(p.lng) || Math.abs(p.lng) > 180 || !number(p.accuracyM) || !text(p.segmentId)) fail('INVALID_POSITION');
          state.route.push(copy(p));
        }
        state.elapsedMs = d.elapsedMs;
        if (d.distanceM !== null) state.distanceM = d.distanceM;
        state.heartRateBpm = d.heartRateBpm;
      } else if (e.type === 'gps') {
        keys(d, ['status']);
        if (!['available', 'unavailable', 'denied'].includes(d.status)) fail('INVALID_GPS');
        state.gps = d.status;
      } else if (e.type === 'finish') {
        keys(d, ['result']);
        // Conclusão de metas exige o futuro motor de etapas; v1 só encerra parcial.
        if (!['running', 'paused'].includes(state.status) || d.result !== 'partial') fail('INVALID_FINISH');
        state.status = 'finished'; state.result = d.result;
      } else {
        keys(d, []);
        const transitions = { start: ['ready', 'running'], pause: ['running', 'paused'], interrupt: ['running', 'paused'], resume: ['paused', 'running'] };
        const t = transitions[e.type];
        if (!t || state.status !== t[0]) fail('INVALID_TRANSITION');
        state.status = t[1];
      }
    });
    return state;
  }
  function validate(r) {
    keys(r, ['header', 'events', 'acked']);
    project(r.header, r.events);
    if (!Number.isInteger(r.acked) || r.acked < 0 || r.acked > r.events.length) fail('INVALID_ACK');
  }
  function merge(record, batch) {
    keys(batch, ['header', 'events']);
    const r = record === null ? { header: copy(batch.header), events: [], acked: 0 } : copy(record);
    validate(r);
    if (canonical(r.header) !== canonical(batch.header)) fail('SESSION_CONFLICT');
    if (!Array.isArray(batch.events)) fail('INVALID_EVENTS');
    for (const e of batch.events) {
      keys(e, ['v', 'id', 'seq', 'deviceId', 'type', 'at', 'data']);
      const existing = r.events.find(x => x.id === e.id || x.seq === e.seq);
      if (existing) { if (canonical(existing) !== canonical(e)) fail('EVENT_CONFLICT'); }
      else r.events.push(copy(e));
    }
    validate(r); return r;
  }
  // store.update deve ler/modificar/gravar em uma única transação atômica.
  function journal(store) {
    return {
      async receive(batch) {
        batch = copy(batch);
        const r = await store.update(key(batch.header), old => merge(old, batch));
        return { scopeId: r.header.scopeId, sessionId: r.header.sessionId, through: r.events.length, eventId: r.events.length ? r.events[r.events.length - 1].id : null };
      },
      async read(h) {
        h = copy(h);
        const r = await store.read(key(h));
        if (r !== null) { validate(r); if (canonical(r.header) !== canonical(h)) fail('SESSION_CONFLICT'); }
        return r;
      },
      async pending(h) {
        const r = await this.read(h); if (!r) fail('NOT_FOUND');
        return { header: r.header, events: r.events.slice(r.acked) };
      },
      async sync(h, send) {
        h = copy(h);
        const batch = await this.pending(h);
        if (!batch.events.length) return;
        const last = batch.events[batch.events.length - 1];
        const ack = await send(copy(batch));
        if (!ack || ack.through !== last.seq || ack.eventId !== last.id) fail('INVALID_ACK');
        await this.acknowledge(h, ack);
        return ack;
      },
      async acknowledge(h, ack) {
        h = copy(h); ack = copy(ack);
        return store.update(key(h), r => {
          if (!r) fail('NOT_FOUND'); validate(r);
          if (canonical(r.header) !== canonical(h)) fail('SESSION_CONFLICT');
          keys(ack, ['scopeId', 'sessionId', 'through', 'eventId']);
          if (ack.scopeId !== h.scopeId || ack.sessionId !== h.sessionId || !Number.isInteger(ack.through) || ack.through < 0 || ack.through > r.events.length || ack.eventId !== (ack.through ? r.events[ack.through - 1].id : null)) fail('INVALID_ACK');
          r.acked = Math.max(r.acked, ack.through); return r;
        });
      },
      async recover(h) {
        const r = await this.read(h); if (!r) fail('NOT_FOUND');
        const state = project(r.header, r.events);
        // Persistir interrupt antes de retomar. Não conta tempo desde o último sample.
        return { state: Object.assign({}, state, state.status === 'running' ? { status: 'paused' } : {}), needsInterrupt: state.status === 'running', nextSeq: r.events.length + 1 };
      }
    };
  }
  return { key, project, merge, journal };
});
