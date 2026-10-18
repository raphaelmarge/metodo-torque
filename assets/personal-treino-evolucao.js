/* Variantes aprovadas e evolução da prescrição. Não publica nem altera registros realizados. */
(function (root) {
  'use strict';
  function copy(x) { return JSON.parse(JSON.stringify(x)); }
  function list(x) { return Array.isArray(x) ? x : []; }
  function text(x, max) { return typeof x === 'string' ? x.trim().slice(0, max || 120) : ''; }
  function fail(message) { throw new Error(message); }
  function number(x, min, max, nullable) {
    if (x == null || String(x).trim() === '') { if (nullable) return null; fail('Preencha os valores da série.'); }
    if (typeof x === 'boolean') fail('Valor de série inválido.');
    var n = Number(String(x).replace(',', '.')); if (!Number.isFinite(n) || n < min || n > max) fail('Confira os valores da série.'); return n;
  }
  function serie(s) {
    var r = text(String(s.reps == null ? '' : s.reps), 40); if (!r) fail('Informe repetições ou tempo.');
    var out = { reps: r, carga: number(s.carga, 0, 2000, true), descanso: number(s.descanso, 0, 1800, false) };
    if (s.rpe != null && s.rpe !== '') out.rpe = number(s.rpe, 1, 10, false); return out;
  }
  function series(it) {
    if (list(it.seriesDetalhadas).length > 30) fail('O limite é de 30 séries por exercício.');
    var n = Math.floor(number(it.series == null ? 3 : it.series, 1, 30, false));
    return (list(it.seriesDetalhadas).length ? it.seriesDetalhadas : Array.from({ length: n }, function () { return it; })).map(function (s) {
      return serie({ reps: s.reps == null ? it.reps : s.reps, carga: s.carga === undefined ? it.carga : s.carga, descanso: s.descanso == null ? (it.descanso == null ? 60 : it.descanso) : s.descanso, rpe: s.rpe == null ? it.rpe : s.rpe });
    });
  }
  function base(f) { return copy({ id: f.id, titulo: f.titulo || '', itens: list(f.itens), p2: f.p2 || null }); }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function cleanDraft(d, bank) {
    if (['curto', 'casa', 'viagem'].indexOf(d.tipo) < 0) fail('Escolha uma versão de treino.');
    var title = text(d.titulo, 80); if (!title) fail('Dê um nome à versão.');
    if (!list(d.itens).length || d.itens.length > 40) fail('Inclua de 1 a 40 exercícios.');
    var items = d.itens.map(function (it) {
      if (!bank.some(function (e) { return e.id === it.exId; })) fail('Escolha exercícios disponíveis na biblioteca.');
      var out = copy(it), rows = series(it); out.seriesDetalhadas = rows; out.series = rows.length; out.reps = rows[0].reps; out.carga = rows[0].carga; out.descanso = rows[0].descanso;
      out.obs = text(it.obs, 300); return out;
    });
    return { tipo: d.tipo, titulo: title, itens: items, p2: d.p2 ? copy(d.p2) : null, minutos: number(d.minutos, 1, 240, true) };
  }
  function saveDraft(f, draft, bank, stamp, id) {
    var d = cleanDraft(draft, bank), out = copy(f), variants = out.variantes || (out.variantes = []);
    var v = variants.find(function (x) { return x.id === id; });
    if (!v) { if (variants.length >= 12) fail('O limite é de 12 versões por ficha.'); v = { id: id, historico: [] }; variants.push(v); }
    if (!text(id, 120) || variants.some(function (x) { return x !== v && x.id === id; })) fail('Identificação da versão inválida.');
    v.rascunho = Object.assign(d, { base: base(f), editadoEm: stamp }); return out;
  }
  function approve(f, id, stamp) {
    var out = copy(f), v = list(out.variantes).find(function (x) { return x.id === id; });
    if (!v || !v.rascunho) fail('Salve um rascunho antes de aprovar.');
    if (!same(v.rascunho.base, base(f))) fail('A ficha original mudou. Reabra a versão e revise antes de aprovar.');
    if (v.aprovada) (v.historico || (v.historico = [])).push(copy(v.aprovada));
    v.aprovada = Object.assign(copy(v.rascunho), { versao: (v.aprovada && v.aprovada.versao || 0) + 1, aprovadaEm: stamp });
    delete v.rascunho; return out;
  }
  function revoke(f, id, stamp) {
    var out = copy(f), v = list(out.variantes).find(function (x) { return x.id === id; });
    if (!v || !v.aprovada) fail('Versão aprovada não encontrada.');
    (v.historico || (v.historico = [])).push(Object.assign(copy(v.aprovada), { retiradaEm: stamp }));
    v.rascunho = copy(v.aprovada); delete v.rascunho.versao; delete v.rascunho.aprovadaEm; delete v.aprovada; return out;
  }
  function approved(f) { return list(f.variantes).filter(function (v) { return v.id && v.aprovada && same(v.aprovada.base, base(f)); }); }
  function exporta(st, studentId, videoOf) {
    var t = (st.treinosV2 || {})[studentId], bank = list(st.exercicios), out = [];
    list(t && t.fichas).forEach(function (f, fi) {
      var vs = approved(f).map(function (v) {
        var a = v.aprovada, guia = { n: (f.titulo || 'Ficha') + ' · ' + a.titulo, fichaId: f.id, varianteId: v.id, varianteVersao: a.versao, varianteNome: a.titulo, p2: a.p2 && list(a.p2.l).length ? { k: a.p2.n || 'Cardio e alongamento', l: copy(a.p2.l) } : null, aq: null, it: [] };
        a.itens.forEach(function (it, ii) {
          var ex = bank.find(function (e) { return e.id === it.exId; }); if (!ex) return;
          var rows = series(it);
          guia.it.push({ exercicioId: ex.id, e: ex.nome, k: 'variante:' + f.id + ':' + v.id + ':' + a.versao + ':' + ii, s: rows.length, r: rows[0].reps, d: rows[0].descanso, carga: rows[0].carga, seriesDetalhadas: rows, g: ex.grupo || '', dc: ex.descricao || '', ob: it.obs || '', tc: it.tec || '', m: ex.semGif ? false : ex.gif || '', v: text(it.video || (videoOf ? videoOf(ex) : ex.semVideo ? '' : ex.video), 2000), al: list(it.alternativas), ap: Array.isArray(it.alternativas) });
          if (it.rpe != null) guia.it[guia.it.length - 1].rpe = it.rpe;
          guia.it[guia.it.length - 1].rpePorSerie = rows.map(function (s) { return s.rpe == null ? null : s.rpe; });
        });
        return guia.it.length === a.itens.length ? { id: v.id, tipo: a.tipo, titulo: a.titulo, versao: a.versao, minutos: a.minutos, aprovadaEm: a.aprovadaEm, guia: guia } : null;
      }).filter(Boolean);
      if (vs.length) out.push({ fichaId: f.id, fi: fi, variantes: vs });
    }); return out;
  }
  function validDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s + 'T12:00:00Z')) && new Date(s + 'T12:00:00Z').toISOString().slice(0, 10) === s; }
  function measured(v) { return (typeof v === 'number' || typeof v === 'string' && v.trim() !== '') && Number.isFinite(+v); }
  function propose(f, bank, loads, today, fi) {
    if (!validDate(today)) fail('Data de referência inválida.');
    var rows = [];
    list(f.itens).forEach(function (it, ei) {
      var ex = bank.find(function (e) { return e.id === it.exId; }) || {};
      series(it).forEach(function (before, si) {
        var seen = {}, evidence = list((loads || {})[ex.nome]).filter(function (r) {
          return r && r.g === 2 && r.feito === true && !r.varianteId && r.exercicioId === it.exId && r.serie === si + 1 &&
            typeof r.i === 'string' && r.i === fi + ':' + ei + ':' + si && validDate(r.d) && r.d <= today &&
            (Date.parse(today) - Date.parse(r.d)) <= 45 * 86400000 && measured(r.kg) && +r.kg >= 0 &&
            measured(r.r) && Number.isInteger(+r.r) && +r.r > 0 && measured(r.rpe) && +r.rpe >= 1 && +r.rpe <= 10;
        }).sort(function (a, b) { return b.d.localeCompare(a.d) || Number(+b.kg !== before.carga) - Number(+a.kg !== before.carga) || +b.rpe - +a.rpe || +a.r - +b.r; }).filter(function (r) { if (seen[r.d]) return false; seen[r.d] = true; return true; }).slice(0, 2).map(copy);
        var after = copy(before), eligible = false, reason = 'Registre duas sessões recentes, com a mesma carga, repetições e RPE, para receber uma sugestão.';
        var target = /^\d+$/.test(before.reps) ? +before.reps : null;
        if (target && before.carga != null && before.carga > 0 && evidence.length === 2 && evidence.every(function (r) { return +r.kg === before.carga && +r.r >= target && +r.rpe <= 7; })) {
          var step = Math.min(2.5, Math.max(.5, Math.round(before.carga * .025 * 2) / 2));
          if (before.carga + step <= 2000) { after.carga = Math.round((before.carga + step) * 100) / 100; eligible = true; reason = 'Meta de repetições atingida nas duas sessões, com RPE até 7. Confira o incremento e o equipamento disponível.'; }
        } else if (evidence.length) reason = !target ? 'Prescrição por faixa ou tempo: revisão manual pelo profissional.' : 'Há registros, mas os critérios para aumentar a carga não foram atendidos. Revise antes de ajustar.';
        rows.push({ key: ei + ':' + si, exerciseId: it.exId, name: ex.nome || 'Exercício', exercise: ei, set: si, before: before, after: after, eligible: eligible, reason: reason, evidence: evidence });
      });
    }); return { baseline: base(f), rows: rows, today: today, fi: fi };
  }
  function apply(f, proposal, decisions, stamp, id) {
    if (!same(base(f), proposal.baseline)) fail('A prescrição mudou. Gere uma revisão atualizada.');
    var out = copy(f), changes = [], used = {};
    list(decisions).forEach(function (d) {
      if (used[d.key]) fail('Decisão duplicada.'); used[d.key] = true;
      var row = proposal.rows.find(function (r) { return r.key === d.key; }); if (!row) fail('Série não encontrada.');
      if (d.action !== 'aprovar') return;
      var reason = text(d.reason, 300); if (!reason) fail('Informe o motivo de cada alteração aprovada.');
      var after = serie(d.after); if (same(after, row.before)) return;
      var item = out.itens[row.exercise], sets = series(item); sets[row.set] = Object.assign({}, sets[row.set], after);
      item.seriesDetalhadas = sets; item.series = sets.length; item.reps = sets[0].reps; item.carga = sets[0].carga; item.descanso = sets[0].descanso;
      changes.push({ key: d.key, exerciseId: row.exerciseId, name: row.name, serie: row.set + 1, antes: copy(row.before), depois: after, motivo: reason, registros: copy(row.evidence) });
    });
    if (!changes.length) fail('Selecione pelo menos uma alteração para aprovar.');
    (out.evolucoes || (out.evolucoes = [])).push({ id: id, em: stamp, alteracoes: changes }); return out;
  }
  function install(C) {
    var doc = root.document, active = null;
    if (!doc || !C) return null;
    function node(tag, txt, parent) { var n = doc.createElement(tag); if (txt != null) n.textContent = txt; if (parent) parent.appendChild(n); return n; }
    function button(txt, parent, click, secondary) { var b = node('button', txt, parent); b.type = 'button'; b.className = secondary ? 'btn sec' : 'btn'; b.onclick = click; return b; }
    function context(fid) {
      var st = C.load(), aid = C.student(), a = list(st.alunos).find(function (x) { return x.id === aid; }), t = (st.treinosV2 || {})[aid], fi = list(t && t.fichas).findIndex(function (x) { return x.id === fid; });
      if (!a || fi < 0) fail('Abra a ficha de um aluno.');
      return { state: st, student: a, fid: fid, fi: fi, f: copy(t.fichas[fi]), identity: C.identity(), snapshot: JSON.stringify(t.fichas[fi]) };
    }
    function commit(c, next) {
      if (C.identity() !== c.identity || C.student() !== c.student.id) fail('O aluno ou a conta mudou. Reabra a edição.');
      var now = context(c.fid); if (now.snapshot !== c.snapshot) fail('A ficha foi alterada em outra tela. Reabra a revisão.');
      now.state.treinosV2[c.student.id].fichas[now.fi] = next; C.markChanged(now.state, c.student.id);
      if (C.write(now.state) === false) fail('Não foi possível salvar. A edição continua aberta.');
      c.snapshot = JSON.stringify(next); c.f = copy(next); C.render();
    }
    function dialog(title) {
      if (active) active.close();
      var previous = doc.activeElement, d = node('dialog'); d.className = 'te-dialog'; d.setAttribute('aria-label', title);
      var header = node('header', null, d); node('h2', title, header); button('Fechar', header, function () { d.close(); }, true);
      var content = node('div', null, d); content.className = 'te-content'; var status = node('p', '', d); status.className = 'te-status'; status.setAttribute('role', 'status');
      d.addEventListener('close', function () { if (active === d) active = null; d.remove(); if (previous && previous.isConnected) previous.focus(); });
      doc.body.appendChild(d); active = d; d.showModal(); return { el: d, body: content, status: status, run: function (fn) { try { fn(); } catch (e) { status.textContent = e.message; } } };
    }
    function field(parent, label, value, type) { var l = node('label', label, parent), i = node(type === 'textarea' ? 'textarea' : 'input', null, l); if (type !== 'textarea') i.type = type || 'text'; i.value = value == null ? '' : value; return i; }
    function selector(parent, label, options, value) { var l = node('label', label, parent), s = node('select', null, l); options.forEach(function (o) { var el = node('option', o.label, s); el.value = o.value; }); s.value = value; return s; }
    function variants(fid) {
      var c; try { c = context(fid); } catch (e) { root.alert(e.message); return; }
      var d = dialog('Versões de ' + c.f.titulo), bank = list(c.state.exercicios), editingId = null, draft = null;
      function summary() {
        d.body.replaceChildren(); node('p', 'Crie alternativas para a rotina do aluno. Somente versões aprovadas entram na próxima publicação.', d.body);
        list(c.f.variantes).forEach(function (v) {
          var current = v.rascunho || v.aprovada, row = node('article', null, d.body); row.className = 'te-version-row';
          node('strong', current && current.titulo || 'Versão', row);
          node('p', v.aprovada ? (same(v.aprovada.base, base(c.f)) ? 'Aprovada · versão ' + v.aprovada.versao : 'Original alterado · precisa de nova revisão') + (v.rascunho ? ' · rascunho em edição' : '') : 'Rascunho', row);
          button('Editar e revisar', row, function () { editingId = v.id; draft = copy(current); draft.base = base(c.f); editor(); }, true);
          if (v.aprovada) button('Retirar da próxima publicação', row, function () { d.run(function () { commit(c, revoke(c.f, v.id, new Date().toISOString())); summary(); d.status.textContent = 'Retirada salva. Publique a ficha para atualizar o app do aluno.'; }); }, true);
        });
        var actions = node('div', null, d.body); actions.className = 'te-actions';
        ['curto', 'casa', 'viagem'].forEach(function (tipo) { button({ curto: '+ Versão curta', casa: '+ Em casa', viagem: '+ Em viagem' }[tipo], actions, function () {
          editingId = C.uid(); draft = { tipo: tipo, titulo: { curto: 'Treino curto', casa: 'Treino em casa', viagem: 'Treino em viagem' }[tipo], minutos: null, itens: copy(c.f.itens), p2: null }; editor();
        }, true); });
      }
      function editor() {
        d.body.replaceChildren(); var header = node('div', null, d.body); header.className = 'te-fields';
        var title = field(header, 'Nome da versão', draft.titulo); title.maxLength = 80; title.oninput = function () { draft.titulo = title.value; };
        var mins = field(header, 'Duração estimada (min)', draft.minutos, 'number'); mins.min = '1'; mins.max = '240'; mins.oninput = function () { draft.minutos = mins.value; };
        node('p', 'Ajuste exercícios e séries. A ficha completa permanece preservada.', d.body);
        draft.itens.forEach(function (it, ei) {
          var section = node('section', null, d.body); section.className = 'te-exercise';
          var select = selector(section, 'Exercício ' + (ei + 1), bank.map(function (ex) { return { value: ex.id, label: ex.nome }; }), it.exId);
          select.onchange = function () { it.exId = select.value; delete it.video; delete it.alternativas; it.obs = ''; };
          var sets = list(it.seriesDetalhadas).length ? it.seriesDetalhadas : series(it); it.seriesDetalhadas = sets;
          sets.forEach(function (s, si) {
            var row = node('div', null, section); row.className = 'te-series'; node('b', (si + 1) + 'ª', row);
            ['reps', 'carga', 'descanso'].forEach(function (k) { var input = field(row, { reps: 'Repetições / tempo', carga: 'Carga (kg)', descanso: 'Descanso (s)' }[k], s[k], 'text'); if (k !== 'reps') input.inputMode = 'decimal'; input.oninput = function () { s[k] = input.value; }; });
            button('Remover série', row, function () { if (sets.length <= 1) return; sets.splice(si, 1); editor(); }, true);
          });
          var actions = node('div', null, section); actions.className = 'te-actions';
          button('+ Série', actions, function () { if (sets.length >= 30) return; sets.push(copy(sets[sets.length - 1])); editor(); }, true);
          button('Remover exercício', actions, function () { draft.itens.splice(ei, 1); editor(); }, true);
          if (ei > 0) button('Subir', actions, function () { var prev = draft.itens[ei - 1]; draft.itens[ei - 1] = it; draft.itens[ei] = prev; editor(); }, true);
          var obs = field(section, 'Orientação para esta versão', it.obs || '', 'textarea'); obs.maxLength = 300; obs.oninput = function () { it.obs = obs.value; };
        });
        button('+ Exercício', d.body, function () { if (!bank.length) return; draft.itens.push({ exId: bank[0].id, series: 3, reps: '10', carga: null, descanso: 60 }); editor(); }, true);
        var actions = node('footer', null, d.body); actions.className = 'te-actions';
        button('Salvar rascunho', actions, function () { d.run(function () { commit(c, saveDraft(c.f, draft, bank, new Date().toISOString(), editingId)); summary(); d.status.textContent = 'Rascunho salvo. Ainda não está disponível para o aluno.'; }); }, true);
        button('Aprovar esta versão', actions, function () { d.run(function () { var saved = saveDraft(c.f, draft, bank, new Date().toISOString(), editingId); commit(c, approve(saved, editingId, new Date().toISOString())); summary(); d.status.textContent = 'Versão aprovada. Use a publicação da ficha para disponibilizar ao aluno.'; }); });
        button('Voltar às versões', actions, summary, true);
      }
      summary(); return d;
    }
    function progression(fid) {
      var c; try { c = context(fid); } catch (e) { root.alert(e.message); return; }
      var d = dialog('Revisar evolução · ' + c.f.titulo), proposal = propose(c.f, list(c.state.exercicios), (c.student.retorno || {}).cargas, C.today(), c.fi), decisions = [];
      node('p', 'Compare a prescrição com os registros concluídos. Selecione e justifique cada ajuste; o aluno recebe as mudanças após a publicação.', d.body);
      proposal.rows.forEach(function (row) {
        var section = node('section', null, d.body); section.className = 'te-progression';
        node('h3', row.name + ' · ' + (row.set + 1) + 'ª série', section);
        node('p', 'Atual: ' + row.before.reps + ' reps · ' + (row.before.carga == null ? 'carga livre' : row.before.carga + ' kg') + ' · ' + row.before.descanso + ' s', section);
        node('p', row.reason, section).className = 'te-muted';
        if (row.evidence.length) { var details = node('details', null, section); node('summary', 'Ver registros usados', details); row.evidence.forEach(function (r) { node('p', r.d.split('-').reverse().join('/') + ' · ' + r.r + ' reps · ' + r.kg + ' kg · RPE ' + r.rpe, details); }); }
        var values = node('div', null, section); values.className = 'te-fields'; var after = copy(row.after);
        ['reps', 'carga', 'descanso'].forEach(function (k) { var input = field(values, { reps: 'Nova repetição / tempo', carga: 'Nova carga (kg)', descanso: 'Novo descanso (s)' }[k], after[k]); if (k !== 'reps') input.inputMode = 'decimal'; input.oninput = function () { after[k] = input.value; }; });
        var reason = field(section, 'Motivo do ajuste', row.eligible ? 'Meta atingida com esforço controlado nas duas últimas sessões.' : '', 'textarea'); reason.maxLength = 300;
        var label = node('label', ' Aprovar alteração desta série', section); label.className = 'te-approve'; var check = doc.createElement('input'); check.type = 'checkbox'; label.prepend(check);
        decisions.push(function () { return { key: row.key, action: check.checked ? 'aprovar' : 'manter', after: after, reason: reason.value }; });
      });
      button('Salvar alterações aprovadas', d.body, function () { d.run(function () {
        var live = context(fid), latest = propose(live.f, list(live.state.exercicios), (live.student.retorno || {}).cargas, C.today(), live.fi);
        if (proposal.today !== latest.today || !same(proposal.rows.map(function (r) { return r.evidence; }), latest.rows.map(function (r) { return r.evidence; }))) fail('Os registros do aluno foram atualizados. Reabra a revisão para conferir.');
        var next = apply(c.f, proposal, decisions.map(function (fn) { return fn(); }), new Date().toISOString(), C.uid()); commit(c, next); d.el.close(); progression(fid);
      }); });
      var history = list(c.f.evolucoes); if (history.length) { var det = node('details', null, d.body); node('summary', 'Histórico de decisões (' + history.length + ')', det); history.slice().reverse().forEach(function (h) { node('h3', h.em.slice(0, 10).split('-').reverse().join('/'), det); list(h.alteracoes).forEach(function (x) { node('p', x.name + ' · série ' + x.serie + ': ' + x.antes.reps + ' / ' + (x.antes.carga == null ? '—' : x.antes.carga) + ' kg → ' + x.depois.reps + ' / ' + (x.depois.carga == null ? '—' : x.depois.carga) + ' kg. ' + x.motivo, det); }); }); }
      return d;
    }
    function click(e) { var b = e.target.closest && e.target.closest('[data-te-variants],[data-te-progression]'); if (!b) return; if (b.hasAttribute('data-te-variants')) variants(b.getAttribute('data-te-variants')); else progression(b.getAttribute('data-te-progression')); }
    doc.addEventListener('click', click);
    return { variants: variants, progression: progression, dispose: function () { doc.removeEventListener('click', click); if (active) active.close(); } };
  }
  var api = { base: base, series: series, saveDraft: saveDraft, approve: approve, revoke: revoke, approved: approved, exporta: exporta, propose: propose, apply: apply, install: install };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MT_TREINO_EVOLUCAO = api;
})(typeof window !== 'undefined' ? window : globalThis);
