/* Transporte do journal; sem ativação automática, conclusão ou recompensas.
 * RPCs correspondem exclusivamente à proposta SQL local de histórico.
 */
(function (root) {
  'use strict';
  function makeSync(C) {
    var running = null, prefix = 'tqWorkoutSync:' + encodeURIComponent(C.scope) + ':';
    function check() { if (!C.active()) throw new Error('IDENTITY_CHANGED'); }
    function bytes(v) { return new TextEncoder().encode(JSON.stringify(v)).length; }
    function ordered(events) {
      var out = [], visiting = new Set(), done = new Set();
      function visit(e) {
        if (done.has(e.id)) return;
        if (visiting.has(e.id)) throw new Error('REVISION_CYCLE');
        visiting.add(e.id);
        if (e.type !== 'start') {
          var start = events['start:' + e.session]; if (!start) throw new Error('SESSION_NOT_FOUND'); visit(start);
        }
        (e.parents || []).forEach(function (id) { if (!events[id]) throw new Error('MISSING_PARENT'); visit(events[id]); });
        visiting.delete(e.id); done.add(e.id); out.push(e);
      }
      Object.keys(events).sort().forEach(function (key) { visit(events[key]); }); return out;
    }
    async function rpc(name, args) {
      check(); var result = await C.rpc(name, args); check();
      if (!result || result.ok !== true) throw new Error(result && result.erro || 'SYNC_UNAVAILABLE');
      return result;
    }
    async function pull() {
      check(); var cursor = C.storage.getItem(prefix + 'cursor') || '0';
      if (!/^\d+$/.test(cursor)) throw new Error('INVALID_CURSOR');
      while (true) {
        var result = await rpc('app_treino_eventos_lista', { t: C.token, p_apos: cursor });
        if (!Array.isArray(result.eventos) || typeof result.cursor !== 'string' || !/^\d+$/.test(result.cursor) || typeof result.mais !== 'boolean' || BigInt(result.cursor) < BigInt(cursor) || (result.mais && BigInt(result.cursor) <= BigInt(cursor))) throw new Error('INVALID_SYNC_RESPONSE');
        var events = Object.create(null);
        result.eventos.forEach(function (e) { if (!e || typeof e.id !== 'string' || Object.prototype.hasOwnProperty.call(events, e.id)) throw new Error('INVALID_SYNC_RESPONSE'); events[e.id] = e; });
        await C.journal.ingest(events); check();
        Object.keys(events).forEach(function (id) { C.storage.setItem(prefix + 'ack:' + id, '1'); });
        // No cursor advance before every event has been persisted locally.
        C.storage.setItem(prefix + 'cursor', result.cursor); cursor = result.cursor;
        if (!result.mais) return;
      }
    }
    async function send(batch) {
      var result = await rpc('app_treino_eventos_grava', { t: C.token, p_eventos: batch });
      if (!Array.isArray(result.ids) || result.ids.length !== batch.length || result.ids.some(function (id, i) { return id !== batch[i].id; })) throw new Error('INVALID_SYNC_ACK');
      // Receipts are optimizations only. Losing one causes an idempotent resend.
      batch.forEach(function (event) { check(); C.storage.setItem(prefix + 'ack:' + event.id, '1'); });
    }
    async function run() {
      check(); if (C.status) C.status('enviando');
      try {
        await pull();
        var events = await C.journal.read(), queue = ordered(events), batch = [];
        for (var i = 0; i < queue.length; i++) {
          check(); var e = queue[i]; if (C.storage.getItem(prefix + 'ack:' + e.id) === '1') continue;
          if (bytes([e]) > 4000000) throw new Error('EVENT_TOO_LARGE');
          if (batch.length && (batch.length === 50 || bytes(batch.concat([e])) > 3900000)) { await send(batch); batch = []; }
          batch.push(e);
        }
        if (batch.length) await send(batch);
        await pull(); check();
        var latest = await C.journal.read(); check();
        var pending = Object.keys(latest).some(function (id) { return C.storage.getItem(prefix + 'ack:' + id) !== '1'; });
        if (C.status) C.status(pending ? 'pendente' : 'sincronizado');
        return { ok: true, pending: pending };
      } catch (e) { if (C.status) C.status('pendente', e.message); throw e; }
    }
    return { run: function () {
      if (!running) running = run().finally(function () { running = null; });
      return running;
    } };
  }
  // Keep permission refusal distinct from transport failure. Neither permits
  // deleting local data, moving the cursor, sending after a denied read, or
  // pretending that a proposed RPC is installed.
  function http(C) {
    return async function(name,args) {
      var response,result,operation=name==='app_treino_eventos_lista'?'read':'write';
      function fail(code){var e=new Error(code);e.code=code;e.operation=operation;throw e;}
      try {response=await C.fetch(C.url+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:C.key,Authorization:'Bearer '+C.key,'Content-Type':'application/json'},body:JSON.stringify(args)});}catch(_){fail('NETWORK_ERROR');}
      try {result=await response.json();}catch(_){result=null;}
      if(response.status===401||response.status===403||result&&result.erro==='sem_acesso')fail('REMOTE_DENIED');
      if(response.status===404||result&&result.code==='PGRST202')fail('RPC_UNAVAILABLE');
      if(!response.ok)fail('REMOTE_HTTP_ERROR');
      if(!result)fail('INVALID_SYNC_RESPONSE');
      return result;
    };
  }
  var api = { create: makeSync, http: http };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MT_TREINO_HISTORICO_SYNC = api;
})(typeof self !== 'undefined' ? self : this);
