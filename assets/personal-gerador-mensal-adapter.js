/* Ponte somente de leitura entre ptStudio/retorno e o motor mensal.
 * Não confirma relatos, não escreve no Store e não infere equivalência de máquinas. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MT_GERADOR_MENSAL_ADAPTER = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  function object(x) { return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; }
  function list(x) { return Array.isArray(x) ? x : []; }
  function text(x) { return typeof x === 'string' ? x.trim() : ''; }
  function own(x, k) { return Object.prototype.hasOwnProperty.call(x, k); }
  function clone(x) {
    if (Array.isArray(x)) return x.map(clone);
    if (x && typeof x === 'object') { var o = {}; Object.keys(x).sort().forEach(function (k) { if (!['__proto__', 'prototype', 'constructor'].includes(k) && x[k] !== undefined) o[k] = clone(x[k]); }); return o; }
    return typeof x === 'number' && !Number.isFinite(x) ? null : x;
  }
  function numeric(x) { if (x == null || x === '' || typeof x === 'boolean') return null; var n = Number(String(x).replace(',', '.')); return Number.isFinite(n) ? n : null; }
  function date(x) { if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return ''; var d = new Date(x + 'T12:00:00Z'); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === x ? x : ''; }
  function range(x) { x = object(x); return { start: date(x.start || x.inicio), end: date(x.end || x.fim) }; }
  function inside(d, p) { return !!date(d) && (!p.start || d >= p.start) && (!p.end || d <= p.end); }
  function ageAt(birth, at) { if (!date(birth) || !date(at) || birth > at) return null; return +at.slice(0, 4) - +birth.slice(0, 4) - (at.slice(5) < birth.slice(5) ? 1 : 0); }
  function norm(s) { return text(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  function reports(ret, gm, period) {
    var data = object(ret.geradorMensal), all = [], activeId = text(gm.active && (gm.active.id || gm.active.cycleId));
    Object.keys(object(data.reports)).sort().forEach(function (cycleId) {
      var rows = object(data.reports[cycleId] && data.reports[cycleId].revisions);
      Object.keys(rows).sort().forEach(function (id) {
        var r = object(rows[id]);
        if (r.id !== id || r.cycleId !== cycleId || r.author !== 'aluno' || !['monthly', 'health'].includes(r.kind) || !date(text(r.createdAt).slice(0, 10))) return;
        all.push(clone(r));
      });
    });
    all.sort(function (a, b) { return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id); });
    var relevant = all.filter(function (r) { return activeId ? r.cycleId === activeId : inside(r.createdAt.slice(0, 10), period); });
    var monthly = relevant.filter(function (r) { return r.kind === 'monthly'; }), latest = monthly[monthly.length - 1] || relevant[relevant.length - 1] || null;
    var acknowledged = list(gm.healthReviewedRevisionIds);
    var pending = all.filter(function (r) { var d = object(r.data); return !acknowledged.includes(r.id) && (d.symptoms === 'sim' || !!text(d.healthChanges)); });
    return { cycleId: activeId, revisions: relevant, allRevisions: all, latest: latest,
      data: clone(latest && latest.data || {}), reportedAt: latest ? latest.createdAt : '',
      symptoms: pending.some(function (r) { return r.data.symptoms === 'sim'; }),
      healthChanges: pending.map(function (r) { return text(r.data.healthChanges); }).filter(Boolean).join('\n'),
      pendingHealthReview: pending.length > 0, pendingHealthRevisionIds: pending.map(function (r) { return r.id; }) };
  }
  function catalog(st, override) {
    var library = root.MT_GERADOR_MENSAL_CATALOGO;
    if (!library && typeof require === 'function') { try { library = require('./gerador-mensal-catalogo.js'); } catch (_) {} }
    var curated = Array.isArray(override) ? override : list(library && library.exercises), byId = {};
    curated.concat(list(st.exercicios)).forEach(function (e) {
      var m = object(e && e.metadata);
      if (!e || !text(e.id) || m.reviewed !== true || !text(m.author) || !date(m.date) || !text(e.pattern) || !Array.isArray(e.equipment) || !Array.isArray(e.requirements)) return;
      byId[e.id] = clone(e);
    });
    return Object.keys(byId).sort().map(function (id) { return byId[id]; });
  }
  function logsOf(ret, period) {
    var out = [], buckets = object(ret.cargas);
    Object.keys(buckets).sort().forEach(function (name) {
      list(buckets[name]).forEach(function (r, index) {
        if (!r || r.g !== 2 || r.feito !== true || !inside(r.d, period)) return;
        var sessionId = text(r.sessionId || r.hid), slot = text(r.i), exerciseId = text(r.exerciseId || r.exercicioId);
        var basis = ['total', 'per_side'].includes(r.loadBasis) ? r.loadBasis : '';
        // kg é a unidade explícita do registro legado. Os demais contextos precisam vir do registro.
        var unit = text(r.unit || r.unidade) || (own(r, 'kg') ? 'kg' : '');
        out.push({ id: text(r.id) || [sessionId || ('legacy:' + r.d), slot || index, exerciseId || name].join('|'),
          sessionId: sessionId, date: r.d, exerciseId: exerciseId, exerciseName: name,
          fichaId: text(r.fichaId), slot: slot, set: numeric(r.serie),
          equipment: Array.isArray(r.equipment) ? r.equipment.join('|') : text(r.equipment || r.equipamento),
          unit: unit, loadBasis: basis, variation: text(r.variation || r.varianteId),
          context: r.context == null ? '' : clone(r.context),
          reps: numeric(own(r, 'reps') ? r.reps : r.r), load: numeric(own(r, 'load') ? r.load : r.kg),
          completed: true, rpe: numeric(r.rpe), sessionEffort: [1, 2, 3].includes(numeric(object(ret.rpe)[r.d])) ? numeric(ret.rpe[r.d]) : null,
          source: 'retorno.cargas', sourceRecord: clone(r) });
      });
    });
    // Duplicatas idênticas não viram séries adicionais; colisões permanecem para o motor sinalizar.
    var seen = {};
    return out.sort(function (a, b) { return a.date.localeCompare(b.date) || a.id.localeCompare(b.id); }).filter(function (r) { var key = JSON.stringify(clone(r)); if (seen[key]) return false; seen[key] = true; return true; });
  }
  function sessionsOf(t, gm, ret, logs, period) {
    if (!period.start || !period.end || period.start > period.end) return [];
    var start = Date.parse(period.start + 'T12:00:00Z'), end = Date.parse(period.end + 'T12:00:00Z');
    if ((end - start) / 86400000 > 366) throw new Error('Confira o período do fechamento: ele ultrapassa 366 dias.');
    var plano = object(t.plano), days = object(plano.dias), dates = object(plano.datas), overrides = object(gm.sessionReviews), out = [];
    for (var ms = start; ms <= end; ms += 86400000) {
      var at = new Date(ms), d = at.toISOString().slice(0, 10), rows = own(dates, d) ? dates[d] : days[String(at.getUTCDay())];
      rows = Array.isArray(rows) ? rows : rows && typeof rows === 'object' ? [rows] : [];
      rows.forEach(function (r, index) {
        if (!r || !text(r.id) || !['ficha', 'cardio', 'wod'].includes(r.tp)) return;
        var id = [d, r.tp, r.id, text(r.h), index].join('|'), review = object(overrides[id]);
        var related = logs.filter(function (l) { return l.date === d && l.fichaId && l.fichaId === r.id; });
        // Uma marca do dia não comprova qual sessão foi feita em um dia com duas sessões.
        var completion = object(ret.geradorMensal && ret.geradorMensal.sessions)[id];
        var status = completion && completion.completed === true ? 'completed' : 'unknown';
        if (rows.length === 1 && object(ret.feitos)[d] === true && r.tp === 'ficha') status = 'completed';
        if (['completed', 'missed', 'unknown', 'paused'].includes(review.status) && review.reviewed === true) status = review.status;
        var ficha = list(t.fichas).find(function (f) { return f && f.id === r.id; });
        var expected = list(ficha && ficha.itens);
        var complete = expected.length > 0 && expected.every(function (item, exerciseIndex) {
          var count = list(item.seriesDetalhadas).length || numeric(item.series);
          if (!Number.isInteger(count) || count < 1 || count > 30) return false;
          for (var setIndex = 0; setIndex < count; setIndex++) {
            if (!related.some(function (l) {
              var parts = l.slot.split(':');
              return l.exerciseId === item.exId && l.set === setIndex + 1 && parts.length === 3 && +parts[1] === exerciseIndex &&
                l.load != null && l.reps > 0 && l.unit && l.equipment && l.loadBasis && l.variation && l.context;
            })) return false;
          }
          return true;
        });
        if (review.reviewed === true && typeof review.recordsComplete === 'boolean') complete = review.recordsComplete;
        var linked = rows.filter(function (x) { return x && x.tp === r.tp && x.id === r.id; }).length === 1 ? related.map(function (l) { return l.sessionId; }).filter(Boolean) : [];
        out.push({ id: id, date: d, fichaId: r.id, type: r.tp, time: text(r.h), status: status, sessionIds: Array.from(new Set(linked)).sort(),
          eligible: status !== 'paused', recordsComplete: complete, source: own(dates, d) ? 'plano.datas' : 'plano.dias', review: clone(review) });
      });
    }
    return out;
  }
  function assessmentsOf(st, id) {
    var out = [];
    list(st.avaliacoes).filter(function (a) { return a && a.alunoId === id && date(a.data || a.date); }).forEach(function (a, index) {
      var base = { id: text(a.id) || 'assessment-' + index, date: a.data || a.date, context: text(a.context || a.contexto), source: 'avaliacoes', sourceRecord: clone(a) };
      if (a.measurements && typeof a.measurements === 'object') { out.push(Object.assign({}, base, { method: text(a.method || a.metodo), measurements: clone(a.measurements) })); return; }
      var anthropometry = {}, bio = {}, photo = {}, n;
      ['peso', 'cintura', 'braco', 'quadril'].forEach(function (k) { n = numeric(a[k]); if (n != null) anthropometry[k] = { value: n, unit: k === 'peso' ? 'kg' : 'cm' }; });
      if (Object.keys(anthropometry).length) out.push(Object.assign({}, base, { id: base.id + ':medidas', method: text(a.metodoMedidas) || 'medidas-legadas-sem-protocolo', measurements: anthropometry }));
      n = numeric(a.gordura); if (n != null) {
        var method = a.gorduraFonte === 'dobras' ? 'dobras:' + text(a.metodoDobras) : text(a.gorduraFonte) || 'nao-informado';
        out.push(Object.assign({}, base, { id: base.id + ':gordura', method: method, measurements: { gordura: { value: n, unit: '%' } } }));
      }
      Object.keys(object(a.bia)).forEach(function (k) { n = numeric(a.bia[k]); if (n != null) bio[k] = { value: n, unit: ['mme', 'massaGordura', 'proteina', 'mineral'].includes(k) ? 'kg' : k === 'agua' ? 'L' : k === 'anguloFase' ? 'graus' : 'indice' }; });
      if (Object.keys(bio).length) out.push(Object.assign({}, base, { id: base.id + ':bia', method: text(a.metodoBia) || 'bioimpedancia-equipamento-nao-informado', measurements: bio }));
      Object.keys(object(a.scan && a.scan.circ)).forEach(function (k) { n = numeric(a.scan.circ[k]); if (n != null) photo[k] = { value: n, unit: 'cm' }; });
      if (Object.keys(photo).length) out.push(Object.assign({}, base, { id: base.id + ':foto', method: 'estimativa-foto', measurements: photo }));
    });
    return out.sort(function (a, b) { return a.date.localeCompare(b.date) || a.id.localeCompare(b.id); });
  }
  function build(st, id, overrides) {
    st = object(st); overrides = object(overrides);
    var a = list(st.alunos).find(function (s) { return s && s.id === id; });
    if (!a) throw new Error('Aluno não encontrado. Abra o aluno novamente.');
    var gm = object(a.geradorMensal), an = object(a.anamnese), ret = object(a.retorno || a.demoRetorno), t = object(object(st.treinosV2)[id]);
    var p = clone(object(overrides.perfil || gm.perfil)), reported = clone(object(an.geradorMensal));
    var period = range(overrides.period || gm.period || gm.active && gm.active.period), next = range(overrides.nextPeriod || gm.nextPeriod);
    // Ausência de perfil revisto mantém a origem relatada e não preenche confirmação.
    if (!Object.keys(p).length) p = reported;
    if (!own(p, 'age')) p.age = ageAt(text(p.birthDate || a.nasc), next.start || period.end);
    if (!p.level && an.nivel) p.level = norm(an.nivel);
    if (!p.healthStatus) p.healthStatus = 'unknown';
    var report = reports(ret, gm, period), logs = logsOf(ret, period);
    if (report.pendingHealthReview) p.pendingHealthReview = true;
    var input = { student: { id: a.id, name: text(a.nome), birthDate: text(a.nasc),
      genderIdentity: text(p.genderIdentity), geradorMensal: { perfil: p },
      anamnese: clone(an), reportedProfile: reported, reportedAnamnesis: clone(object(ret.anamnese)),
      anamnesisReportedAt: text(ret.anamneseEm), notes: text(a.obs) },
      training: { previousFichas: clone(list(t.fichas)), logs: logs,
        plannedSessions: sessionsOf(t, gm, ret, logs, period), monthReport: report, period: period, nextPeriod: next,
        schedule: clone(object(t.plano)), active: clone(object(gm.active)), healthReviewedRevisionIds: clone(list(gm.healthReviewedRevisionIds)),
        manualReview: clone(object(gm.manualReview)) },
      assessments: assessmentsOf(st, id), catalog: catalog(st, overrides.catalog), config: clone(object(overrides.config || gm.config)) };
    if (overrides.training) input.training = Object.assign(input.training, clone(overrides.training));
    if (overrides.assessments) input.assessments = clone(overrides.assessments);
    return input;
  }
  return { VERSION: '1.0.0', build: build, reports: reports, logs: logsOf, sessions: sessionsOf, assessments: assessmentsOf, date: date };
}));
