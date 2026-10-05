/* Histórico de sessões: núcleo independente de DOM, cronômetros e recompensas.
 * Eventos imutáveis; o armazenamento escreve uma chave por operação, nunca
 * substitui o documento inteiro de outra aba. Nenhum dado real neste módulo.
 */
(function (root) {
  'use strict';
  function runtime() {
    var VERSION = 1, kinds = ['musculacao', 'corrida', 'circuito'];
    function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
    function fail(code) { var e = new Error(code); e.code = code; throw e; }
    function plain(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
    function canonical(x) {
      if (x === null || typeof x === 'string' || typeof x === 'boolean') return JSON.stringify(x);
      if (typeof x === 'number' && Number.isFinite(x)) return JSON.stringify(x);
      if (Array.isArray(x)) return '[' + x.map(canonical).join(',') + ']';
      if (!plain(x)) fail('INVALID_JSON');
      return '{' + Object.keys(x).sort().map(function (k) {
        if (['__proto__', 'constructor', 'prototype'].indexOf(k) >= 0) fail('UNSAFE_KEY');
        return JSON.stringify(k) + ':' + canonical(x[k]);
      }).join(',') + '}';
    }
    function copy(x) { return JSON.parse(canonical(x)); }
    function id(x) { return typeof x === 'string' && /^[a-zA-Z0-9:_-]{1,180}$/.test(x); }
    function date(x) { return typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x + 'T12:00:00Z')) && new Date(x + 'T12:00:00Z').toISOString().slice(0,10) === x; }
    function instant(x) { return typeof x === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x) && Number.isFinite(Date.parse(x)) && new Date(x).toISOString() === x; }
    function legacyTime(e) { return e.legacyImport === true && e.at === null && e.actor === 'legacy-import' && ((e.type === 'start' && e.legacy === true) || (e.type === 'result' && Array.isArray(e.parents) && e.parents.length === 0)); }
    function unique(list) { return Array.from(new Set(list)).sort(); }
    function validate(e) {
      if (!plain(e) || e.v !== VERSION || !id(e.id) || !id(e.session) || !(instant(e.at) || legacyTime(e)) || !id(e.actor)) fail('INVALID_EVENT');
      if (['start', 'result', 'correction', 'finish'].indexOf(e.type) < 0) fail('INVALID_TYPE');
      if (e.type === 'start') {
        if (e.id !== 'start:' + e.session || !date(e.date) || kinds.indexOf(e.kind) < 0 || !plain(e.prescribed) || typeof e.legacy !== 'boolean') fail('INVALID_START');
        if (e.legacy && Object.keys(e.prescribed).length) fail('LEGACY_PRESCRIPTION_UNKNOWN');
      } else if (e.type === 'finish') {
        if (!plain(e.value)) fail('INVALID_FINISH');
      } else {
        if (!id(e.target) || !plain(e.value) || !Array.isArray(e.parents) || e.parents.some(function (p) { return !id(p) || p === e.id; }) || unique(e.parents).length !== e.parents.length) fail('INVALID_REVISION');
        if (e.type === 'correction' && (typeof e.reason !== 'string' || !e.reason.trim() || e.reason.length > 500)) fail('CORRECTION_REASON_REQUIRED');
      }
      if (canonical(e).length > 2000000) fail('EVENT_TOO_LARGE');
      return copy(e);
    }
    function parse(events) {
      if (!plain(events)) fail('INVALID_JOURNAL');
      var out = Object.create(null);
      Object.keys(events).sort().forEach(function (key) {
        var e = validate(typeof events[key] === 'string' ? JSON.parse(events[key]) : events[key]);
        if (key !== e.id) fail('EVENT_ID_MISMATCH');
        out[key] = e;
      });
      return out;
    }
    // A união é comutativa, associativa e idempotente. Mesmo ID com conteúdo
    // diferente é corrupção/conflito, nunca "última gravação vence".
    function merge(a, b) {
      var left = parse(a), right = parse(b);
      Object.keys(right).forEach(function (key) {
        if (own(left, key) && canonical(left[key]) !== canonical(right[key])) fail('EVENT_ID_COLLISION');
        left[key] = right[key];
      });
      return left;
    }
    function project(events, session) {
      var all = parse(events), start = all['start:' + session];
      if (!start) fail('SESSION_NOT_FOUND');
      var targets = Object.create(null), waiting = [];
      var finishes = Object.values(all).filter(function (e) { return e.session === session && e.type === 'finish'; })
        .sort(function (a, b) { return String(a.at || '').localeCompare(String(b.at || '')) || a.id.localeCompare(b.id); });
      var finish = finishes[0] || null;
      var revisions = Object.values(all).filter(function (e) { return e.session === session && (e.type === 'result' || e.type === 'correction'); });
      var valid = Object.create(null), visiting = Object.create(null), depths = Object.create(null);
      function ready(e) {
        if (own(valid, e.id)) return valid[e.id];
        if (visiting[e.id]) fail('REVISION_CYCLE');
        visiting[e.id] = true;
        var good = e.parents.every(function (p) {
          var parent = all[p];
          if (!parent) return false;
          if (parent.session !== session || parent.target !== e.target || ['result', 'correction'].indexOf(parent.type) < 0) fail('INVALID_PARENT');
          return ready(parent);
        });
        delete visiting[e.id]; valid[e.id] = good;
        if (good) depths[e.id] = e.parents.length ? 1 + Math.max.apply(null, e.parents.map(function (p) { return depths[p]; })) : 0;
        return good;
      }
      revisions.forEach(function (e) {
        if (!ready(e)) { waiting.push(e.id); return; }
        if (!targets[e.target]) targets[e.target] = { revisions: [], heads: [], original: [] };
        targets[e.target].revisions.push(e);
      });
      Object.keys(targets).forEach(function (key) {
        var t = targets[key], replaced = new Set();
        t.revisions.forEach(function (e) { e.parents.forEach(function (p) { replaced.add(p); }); });
        t.revisions.sort(function (a, b) { return depths[a.id] - depths[b.id] || String(a.at || '').localeCompare(String(b.at || '')) || a.id.localeCompare(b.id); });
        t.original = t.revisions.filter(function (e) { return !e.parents.length; });
        t.heads = t.revisions.filter(function (e) { return !replaced.has(e.id); }).map(function (e) { return e.id; }).sort();
        t.conflict = t.heads.length > 1;
        t.value = t.heads.length === 1 ? copy(all[t.heads[0]].value) : null;
      });
      return { id: session, date: start.date, kind: start.kind, prescribed: copy(start.prescribed), legacy: start.legacy,
        startedAt: start.at, finished: !!finish, finish: finish && copy(finish), finishes: finishes.map(copy), targets: targets, pendingParents: waiting.sort() };
    }
    function create(options) {
      var storage = options.storage, scope = options.scope, actor = options.actor;
      if (!storage || typeof scope !== 'string' || !scope || !id(actor) || typeof options.active !== 'function') fail('INVALID_STORE');
      var prefix = 'tqWorkoutJournal:' + encodeURIComponent(scope) + ':';
      function active() { if (!options.active()) fail('IDENTITY_CHANGED'); }
      function read() {
        active(); var out = Object.create(null);
        for (var i = 0; i < storage.length; i++) {
          var k = storage.key(i);
          if (k && k.indexOf(prefix) === 0) {
            var e = validate(JSON.parse(storage.getItem(k)));
            if (k !== prefix + e.id) fail('EVENT_ID_MISMATCH');
            out[e.id] = e;
          }
        }
        return out;
      }
      function write(event) {
        active(); var e = validate(event), encoded = canonical(e), key = prefix + e.id, previous = storage.getItem(key);
        if (previous !== null) {
          if (canonical(JSON.parse(previous)) !== encoded) fail('EVENT_ID_COLLISION');
          return copy(e);
        }
        // Single atomic setItem: quota failure leaves previous events intact.
        storage.setItem(key, encoded);
        if (storage.getItem(key) !== encoded) fail('WRITE_NOT_CONFIRMED');
        if (options.changed) options.changed();
        return copy(e);
      }
      function at() { return (options.now ? options.now() : new Date()).toISOString(); }
      function base(type, eventId, session) { return { v: VERSION, id: eventId, session: session, type: type, at: at(), actor: actor }; }
      function start(input) {
        var previous = read()['start:' + input.id];
        if (previous) {
          // Retrying cannot replace a prescription with today's program.
          if (previous.kind !== input.kind || previous.date !== input.date) fail('SESSION_ID_COLLISION');
          return project(read(), input.id);
        }
        write(Object.assign(base('start', 'start:' + input.id, input.id), { date: input.date, kind: input.kind, prescribed: copy(input.prescribed || {}), legacy: input.legacy === true }));
        return project(read(), input.id);
      }
      function record(input) {
        var events = read(), duplicate = events[input.id];
        if (duplicate) {
          if (duplicate.session !== input.session || duplicate.target !== input.target || canonical(duplicate.value) !== canonical(input.value) || duplicate.type !== (input.correction ? 'correction' : 'result') || (duplicate.reason || '') !== (input.correction ? input.reason : '')) fail('EVENT_ID_COLLISION');
          return copy(duplicate);
        }
        var view = project(events, input.session), t = view.targets[input.target], heads = t ? t.heads : [];
        if (!Array.isArray(input.expected) || canonical(unique(input.expected)) !== canonical(heads)) fail('STALE_REVISION');
        if (view.finished && !input.correction) fail('SESSION_FINISHED');
        var event = Object.assign(base(input.correction ? 'correction' : 'result', input.id, input.session), { target: input.target, parents: heads, value: copy(input.value) });
        if (input.correction) event.reason = input.reason;
        return write(event);
      }
      function finish(input) {
        var events = read(), view = project(events, input.session);
        if (view.finish) return copy(view.finish);
        return write(Object.assign(base('finish', input.id, input.session), { value: copy(input.value) }));
      }
      function ingest(remote) {
        // Validate the entire batch before the first write. Quota can interrupt
        // the batch; retry safely fills the missing events without deletions.
        var merged = merge(read(), remote);
        Object.values(merged).filter(function (e) { return e.type === 'start'; }).forEach(function (e) { project(merged, e.session); });
        Object.keys(merged).sort().forEach(function (key) { write(merged[key]); });
        return read();
      }
      function list() {
        var all = read();
        return Object.values(all).filter(function (e) { return e.type === 'start'; }).map(function (e) { return project(all, e.session); })
          .sort(function (a, b) { return b.date.localeCompare(a.date) || String(b.startedAt || '').localeCompare(String(a.startedAt || '')) || a.id.localeCompare(b.id); });
      }
      function packet() { var all = read(), out = Object.create(null); Object.keys(all).sort().forEach(function (k) { out[k] = canonical(all[k]); }); return out; }
      return { start: start, record: record, finish: finish, ingest: ingest, list: list, read: read, packet: packet, session: function (sid) { return project(read(), sid); } };
    }
    // All writers sharing a browser origin must use this serialized adapter.
    // Fail closed if locks are absent; do not pretend localStorage has CAS.
    function createLocked(options) {
      if (!options.locks || typeof options.locks.request !== 'function') fail('LOCKS_UNAVAILABLE');
      var store = create(options), out = {};
      Object.keys(store).forEach(function (method) {
        out[method] = function () {
          var args = Array.prototype.slice.call(arguments);
          return options.locks.request('tqWorkoutJournal:' + encodeURIComponent(options.scope), function () { return store[method].apply(store, args); });
        };
      });
      return out;
    }
    return { create: create, createLocked: createLocked, merge: merge, project: project, validate: validate, canonical: canonical, version: VERSION };
  }
  var api = runtime(); api.runtime = runtime;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MT_TREINO_HISTORICO = api;
})(typeof self !== 'undefined' ? self : this);
