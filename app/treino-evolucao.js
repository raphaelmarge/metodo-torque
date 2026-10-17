/* Seleção de versões aprovadas; execução e histórico ficam no player canônico. */
(function (root) {
  'use strict';
  function runtime(definitions, C) {
    var doc = typeof document !== 'undefined' ? document : null;
    function copy(x) { return JSON.parse(JSON.stringify(x)); }
    // O journal serializa objetos por chave. O checkpoint usa a assinatura da
    // GUIA: a variante precisa ter a mesma ordem antes e depois do reload.
    // A ficha original mantém sua representação histórica sem normalização.
    function snapshot(x) {
      function ordered(v) {
        if (Array.isArray(v)) return v.map(ordered);
        if (!v || typeof v !== 'object') return v;
        var out = Object.create(null); Object.keys(v).sort().forEach(function (k) { out[k] = ordered(v[k]); }); return out;
      }
      return copy(ordered(x));
    }
    var originals = copy(C.guia), defs = Array.isArray(definitions) ? copy(definitions) : [], opened = null, blocked = {};
    function fichaId(fi) { return originals[fi] && (originals[fi].fichaId || C.fichaIds && C.fichaIds[fi]) || ''; }
    function definition(fi) { return defs.find(function (d) { return d.fi === fi && originals[fi] && (!fichaId(fi) || fichaId(fi) === d.fichaId); }); }
    function check() { if (!C.identity()) throw new Error('O acesso mudou. Reabra o app para continuar.'); }
    function valid(g) { return g && Array.isArray(g.it) && g.it.length && g.it.every(function (it) { return it && typeof it.e === 'string' && Number.isInteger(it.s) && it.s > 0 && it.s <= 30; }); }
    function restoreOne(fi) {
      check(); var current = C.current(fi), prescribed = current && current.prescribed;
      if (!prescribed || !prescribed.varianteId || !valid(prescribed)) return current;
      if (!originals[fi] || !fichaId(fi) || fichaId(fi) !== prescribed.fichaId) throw new Error('A ficha desta sessão mudou de posição. Abra o histórico para consultar os registros preservados.');
      C.guia[fi] = snapshot(prescribed); if (C.changed) C.changed(); return current;
    }
    function restore() { originals.forEach(function (_, fi) { try { restoreOne(fi); delete blocked[fi]; } catch (e) { blocked[fi] = e.message; } }); return copy(blocked); }
    function select(fi, variantId) {
      check(); if (!originals[fi]) throw new Error('Ficha não encontrada.');
      var current = C.current(fi); if (current && !current.finished) throw new Error('Conclua o treino em andamento antes de iniciar outra versão.');
      var d = definition(fi), variant = d && d.variantes.find(function (v) { return v.id === variantId; });
      if (variantId && !variant) throw new Error('Esta versão não está mais disponível.');
      var selected = variant ? snapshot(variant.guia) : copy(originals[fi]);
      if (!valid(selected)) throw new Error('Esta versão está incompleta. Peça uma revisão ao personal.');
      // resetMuscle do histórico precisa enxergar as chaves da versão escolhida.
      // Em falha, a mesma prescrição continua disponível para retentar a operação.
      C.guia[fi] = selected;
      if (C.start(fi, copy(selected)) === false) throw new Error('Não foi possível iniciar. Tente novamente; o histórico anterior foi preservado.');
      if (C.changed) C.changed(); return copy(selected);
    }
    function show(fi, done) {
      check(); if (!doc || opened) return false;
      var d = definition(fi); if (!d || !d.variantes.length) return false;
      var previous = doc.activeElement, el = doc.createElement('dialog'); el.className = 'te-aluno-dialog'; el.setAttribute('aria-label', 'Qual versão cabe no seu dia?');
      function node(tag, text, parent) { var n = doc.createElement(tag); if (text != null) n.textContent = text; (parent || el).appendChild(n); return n; }
      node('h2', 'Qual versão cabe no seu dia?'); node('p', 'Escolha entre as opções aprovadas pelo seu personal.');
      var status = node('p', ''); status.setAttribute('role', 'status');
      function option(title, subtitle, id) {
        var b = node('button', null); b.type = 'button'; b.className = 'te-aluno-option'; node('strong', title, b); node('span', subtitle, b);
        b.onclick = function () { try { check(); select(fi, id); el.close(); done(); } catch (e) { status.textContent = e.message; } };
      }
      function exercises(n) { return n + (n === 1 ? ' exercício' : ' exercícios'); }
      option('Treino completo', exercises(originals[fi].it.length) + ' · prescrição original', '');
      d.variantes.forEach(function (v) { option(v.titulo, (v.minutos ? '~' + v.minutos + ' min · ' : '') + exercises(v.guia.it.length), v.id); });
      var close = node('button', 'Voltar'); close.type = 'button'; close.className = 'btnx'; close.onclick = function () { el.close(); };
      el.addEventListener('close', function () { opened = null; el.remove(); if (C.closed) C.closed(); if (previous && previous.isConnected) previous.focus(); });
      doc.body.appendChild(el); opened = el; el.showModal(); return true;
    }
    function beforeOpen(fi, ei, done) {
      try { check(); if (!originals[fi]) return false; if (restoreOne(fi)) return false; return show(fi, done); }
      catch (e) { if (C.notice) C.notice(e.message); if (C.closed) C.closed(); return true; }
    }
    function beforeNew(fi, done) {
      try {
        check(); var current = C.current(fi), d = originals[fi] && definition(fi);
        if ((!d || !d.variantes.length) && !(current && current.prescribed && current.prescribed.varianteId)) return false;
        current = restoreOne(fi);
        if (current && !current.finished) { if (C.notice) C.notice('Seu treino ainda está em andamento. Retome e conclua antes de iniciar outra versão.'); if (C.closed) C.closed(); done(true); return true; }
        if (originals[fi]) { C.guia[fi] = copy(originals[fi]); if (C.changed) C.changed(); }
        return show(fi, done);
      } catch (e) { if (C.notice) C.notice(e.message); if (C.closed) C.closed(); return true; }
    }
    return { restore: restore, restoreOne: restoreOne, beforeOpen: beforeOpen, beforeNew: beforeNew, select: select, original: function (fi) { return copy(originals[fi]); }, dispose: function () { if (opened) opened.close(); } };
  }
  var api = { runtime: runtime }; root.MT_TREINO_VARIANTES = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
