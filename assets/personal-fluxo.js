/* TORQUE PERSONAL — Fluxo diário v833
 * Integra o que já existe: próxima melhor ação, atendimento presencial,
 * ficha 360°, busca universal e automações. Não cria um produto paralelo.
 */
(function () {
  'use strict';
  if (window.__PT_FLUXO__) return;
  window.__PT_FLUXO__ = { version: 'v833' };

  var S = window.MTStore;
  if (!S) return;
  var state = { alunoId: '', sessao: null, remoteTimer: 0, autosBusy: false, flushBusy: false };
  var SESSION_KEY = 'ptflow:sessao:v1';
  var QUEUE_KEY = 'ptflow:fila:v1';

  function $(id) { return document.getElementById(id); }
  function q(sel, root) { return (root || document).querySelector(sel); }
  function qa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function nowIso() { return new Date().toISOString(); }
  function today() { return S.todayISO ? S.todayISO() : new Date().toISOString().slice(0, 10); }
  function read() {
    var st = S.read('ptStudio', { alunos: [], sessoes: [], pagamentos: [], treinosV2: {}, avaliacoes: [] }) || {};
    st.alunos = st.alunos || []; st.sessoes = st.sessoes || []; st.treinosV2 = st.treinosV2 || {}; st.avaliacoes = st.avaliacoes || [];
    st.questionarios = st.questionarios || []; st.exercicios = st.exercicios || []; st.diarioPT = st.diarioPT || {};
    return st;
  }
  function active(st) { return (st.alunos || []).filter(function (a) { return a.ativo !== false; }); }
  function aluno(st, id) { return (st.alunos || []).find(function (a) { return a.id === id; }) || null; }
  function firstName(a) { return String((a && a.nome) || '').trim().split(/\s+/)[0] || 'Aluno'; }
  function daysBetween(iso, base) {
    if (!iso) return null;
    var a = Date.parse(String(iso).slice(0, 10) + 'T12:00:00');
    var b = Date.parse((base || today()) + 'T12:00:00');
    return isFinite(a) && isFinite(b) ? Math.floor((b - a) / 864e5) : null;
  }
  function lastDone(st, id) {
    return (st.sessoes || []).filter(function (x) { return x.alunoId === id && x.feita; })
      .sort(function (a, b) { return String(a.data).localeCompare(String(b.data)); }).pop() || null;
  }
  function nextSession(st, id) {
    var h = today();
    return (st.sessoes || []).filter(function (x) { return (!id || x.alunoId === id) && !x.feita && !x.faltou && String(x.data || '') >= h; })
      .sort(function (a, b) { return (String(a.data) + ' ' + String(a.hora || '')).localeCompare(String(b.data) + ' ' + String(b.hora || '')); })[0] || null;
  }
  function lastAssessment(st, id) {
    return (st.avaliacoes || []).filter(function (v) { return v.alunoId === id; })
      .sort(function (a, b) { return String(a.data || '').localeCompare(String(b.data || '')); }).pop() || null;
  }
  function trainingStamp(t, a) {
    if (!t) return '';
    return String(t.prescricaoEm || t.atualizadoEm || t.validade || (a && a.treinoEm) || '').slice(0, 10);
  }
  function painReport(a) {
    var cut = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10), found = [];
    (((a || {}).retorno || {}).notas || []).forEach(function (n) {
      if (!n || String(n.d || '') < cut) return;
      var tx = String(n.t || '');
      var clean = tx.replace(/\b(sem|nenhuma?|nada de|n[aã]o\s+(senti|tive|deu|doeu|incomodou))\s*(dor(es)?|desconforto|inc[oô]modo)?/gi, ' ');
      if (/\b(dor(es)?\b|doeu|doendo|dolorid\w*|machuc\w*|les[aã]o|lesion\w*|incomod\w*|desconfort\w*|fisgada|travou|travad\w*)/i.test(clean)) found.push({ d: String(n.d || ''), t: tx });
    });
    found.sort(function (x, y) { return x.d < y.d ? 1 : -1; });
    return found[0] || null;
  }
  function bestAction(st) {
    var acts = active(st), h = today(), next = nextSession(st);
    var pains = acts.map(function (a) { return { a: a, p: painReport(a) }; }).filter(function (x) { return x.p; })
      .sort(function (x, y) { return x.p.d < y.p.d ? 1 : -1; });
    if (pains[0]) return { type: 'pain', aluno: pains[0].a, title: 'Revisar relato de ' + firstName(pains[0].a), note: 'Relatou desconforto em ' + fmtDate(pains[0].p.d) + '. Abra a ficha antes do próximo treino.', primary: 'Abrir ficha' };
    if (next && next.data === h) {
      var na = aluno(st, next.alunoId);
      if (na) return { type: 'session', aluno: na, sessao: next, title: (next.hora ? next.hora + ' · ' : '') + na.nome, note: 'Próxima sessão de hoje. Registre cargas, repetições e esforço sem sair do painel.', primary: 'Iniciar sessão' };
    }
    var noTrain = acts.find(function (a) { var t = (st.treinosV2 || {})[a.id] || {}; return !(t.fichas || []).length && !(t.cardio || []).length && !(t.wods || []).length; });
    if (noTrain) return { type: 'workout', aluno: noTrain, title: 'Montar o primeiro treino de ' + firstName(noTrain), note: 'Aluno ativo sem ficha publicada. Você pode montar manualmente ou usar a IA já existente.', primary: 'Montar treino' };
    var stale = acts.map(function (a) { var t = (st.treinosV2 || {})[a.id] || {}, stamp = trainingStamp(t, a), d = daysBetween(stamp); return { a: a, t: t, d: d }; })
      .filter(function (x) { return x.d != null && x.d >= 56 && (x.t.fichas || []).length; }).sort(function (x, y) { return y.d - x.d; });
    if (stale[0]) return { type: 'ai', aluno: stale[0].a, title: 'Revisar treino de ' + firstName(stale[0].a), note: 'Prescrição sem revisão há ' + stale[0].d + ' dias. A IA pode propor ajustes; você continua aprovando antes de aplicar.', primary: 'Sugerir ajuste' };
    var inactive = acts.map(function (a) { var l = lastDone(st, a.id); return { a: a, d: l ? daysBetween(l.data) : null }; }).filter(function (x) { return x.d != null && x.d >= 10; }).sort(function (x, y) { return y.d - x.d; });
    if (inactive[0]) return { type: 'profile', aluno: inactive[0].a, title: 'Retomar contato com ' + firstName(inactive[0].a), note: 'Último treino registrado há ' + inactive[0].d + ' dias.', primary: 'Ver aluno' };
    var oldEval = acts.map(function (a) { var v = lastAssessment(st, a.id); return { a: a, d: v ? daysBetween(v.data) : null }; }).filter(function (x) { return x.d != null && x.d >= 90; }).sort(function (x, y) { return y.d - x.d; });
    if (oldEval[0]) return { type: 'evaluation', aluno: oldEval[0].a, title: 'Reavaliar ' + firstName(oldEval[0].a), note: 'Última avaliação há ' + oldEval[0].d + ' dias.', primary: 'Nova avaliação' };
    if (next) {
      var aNext = aluno(st, next.alunoId);
      if (aNext) return { type: 'profile', aluno: aNext, title: 'Preparar ' + firstName(aNext), note: 'Próxima sessão em ' + fmtDate(next.data) + (next.hora ? ' às ' + next.hora : '') + '.', primary: 'Abrir ficha' };
    }
    return { type: 'students', title: 'Planejar a semana', note: acts.length ? 'Nenhuma pendência urgente. Revise a carteira e organize os próximos atendimentos.' : 'Cadastre seu primeiro aluno para começar.', primary: acts.length ? 'Ver alunos' : 'Novo aluno' };
  }
  function fmtDate(v) {
    if (!v) return '—';
    if (S.fmtData) return S.fmtData(String(v).slice(0, 10));
    var p = String(v).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : v;
  }
  function nav(area) {
    var b = q('#abas [data-a="' + area + '"]') || q('[data-nav="' + area + '"]');
    if (b) b.click();
  }
  function openProfile(id) {
    state.alunoId = id || '';
    if (window.__perfilPT && id) window.__perfilPT(id);
    setTimeout(renderProfile360, 0);
  }
  function openWorkout(id, ai) {
    nav('treinos');
    setTimeout(function () {
      if (window.__trAba) window.__trAba(ai ? 'auto' : 'fichas');
      var el = $(ai ? 'taAluno' : 'tAluno'); if (el) { el.value = id; el.dispatchEvent(new Event('change', { bubbles: true })); }
    }, 0);
  }
  function openEval(id) {
    nav('avaliacoes');
    setTimeout(function () {
      if (window.__avAba) window.__avAba('avaliar');
      var el = $('avAluno'); if (el) { el.value = id; el.dispatchEvent(new Event('change', { bubbles: true })); }
    }, 0);
  }
  function openQuest(id) {
    nav('quest');
    setTimeout(function () {
      if (window.__qtAba) window.__qtAba('enviar');
      var el = $('qeAluno'); if (el) { el.value = id; el.dispatchEvent(new Event('change', { bubbles: true })); }
    }, 0);
  }
  function openNutrition(id) {
    nav('nutricao');
    setTimeout(function () {
      var el = $('pnAluno'); if (el) { el.value = id; el.dispatchEvent(new Event('change', { bubbles: true })); }
    }, 0);
  }

  function mountDashboard() {
    var root = $('vDash'), anchor = $('dashTopo');
    if (!root || !anchor || $('ptFlowHoje')) return;
    var box = document.createElement('section');
    box.id = 'ptFlowHoje'; box.className = 'ptf-today'; box.setAttribute('aria-labelledby', 'ptFlowHojeTit');
    box.innerHTML = '<header class="ptf-head"><div><span>SEU DIA</span><h2 id="ptFlowHojeTit">Próxima melhor ação</h2></div><button type="button" class="ptf-icon" data-ptf="refresh" aria-label="Atualizar">↻</button></header>' +
      '<div id="ptFlowBest" class="ptf-best"></div>' +
      '<nav class="ptf-quick" aria-label="Atalhos do dia"><button type="button" data-ptf="session-next">Iniciar sessão</button><button type="button" data-ptf="search">Busca universal</button><button type="button" data-ptf="autos">Automações</button></nav>';
    anchor.insertAdjacentElement('afterend', box);
    var resolver = $('dashResolver');
    var autos = document.createElement('details'); autos.id = 'ptFlowAutos'; autos.className = 'ptf-autos';
    autos.innerHTML = '<summary><span><b>Automações e providências</b><small id="ptFlowAutoResumo">Conecte a conta para carregar</small></span><i>›</i></summary>' +
      '<div class="ptf-auto-body"><div class="ptf-auto-actions"><button type="button" class="btn sec" data-ptf="activate-presets">Ativar automações recomendadas</button><button type="button" class="btn sec" data-ptf="reload-autos">Atualizar fila</button></div><div id="ptFlowAutoList" class="ptf-auto-list"><p class="muted">Abra para carregar.</p></div></div>';
    if (resolver) resolver.insertAdjacentElement('afterend', autos); else root.appendChild(autos);
    autos.addEventListener('toggle', function () { if (autos.open) loadAutomationPanel(); });
    renderDashboard();
  }
  function renderDashboard() {
    var el = $('ptFlowBest'); if (!el) return;
    var st = read(), a = bestAction(st);
    var person = a.aluno ? '<button type="button" class="ptf-person" data-ptf-profile="' + esc(a.aluno.id) + '">' + esc(a.aluno.nome) + '</button>' : '';
    el.innerHTML = '<div class="ptf-best-copy"><div class="ptf-best-kicker">' + (person || 'Hoje') + '</div><h3>' + esc(a.title) + '</h3><p>' + esc(a.note) + '</p></div>' +
      '<div class="ptf-best-actions"><button type="button" class="btn" data-ptf-best="' + esc(a.type) + '"' + (a.aluno ? ' data-aluno="' + esc(a.aluno.id) + '"' : '') + '>' + esc(a.primary) + '</button>' +
      (a.aluno ? '<button type="button" class="btn sec" data-ptf-profile="' + esc(a.aluno.id) + '">Aluno 360°</button>' : '') + '</div>';
  }

  function mountSessionDialog() {
    if ($('ptFlowSession')) return;
    var d = document.createElement('dialog'); d.id = 'ptFlowSession'; d.className = 'ptf-dialog';
    d.innerHTML = '<form method="dialog" class="ptf-dialog-shell"><header class="ptf-dialog-head"><div><span>ATENDIMENTO</span><h2>Sessão presencial</h2><p>Registre o treino pelo nome do aluno. Funciona offline e sincroniza quando a conexão voltar.</p></div><button class="ptf-close" value="cancel" aria-label="Fechar">×</button></header>' +
      '<div class="ptf-session-grid"><label>Aluno<select id="ptFlowSessAluno"></select></label><label>Ficha<select id="ptFlowSessFicha"><option value="">Livre</option></select></label><label class="ptf-wide">Observação inicial<textarea id="ptFlowSessObs" rows="2" placeholder="Ex.: ajuste de amplitude, foco técnico…"></textarea></label></div>' +
      '<div class="ptf-session-toolbar"><button type="button" class="btn" id="ptFlowSessStart">Iniciar sessão</button><button type="button" class="btn sec" id="ptFlowSessAdd" disabled>+ Exercício</button><span id="ptFlowSessStatus" role="status"></span></div>' +
      '<div id="ptFlowSessSets" class="ptf-session-sets"></div>' +
      '<footer class="ptf-session-footer"><button type="button" class="btn" id="ptFlowSessFinish" disabled>Finalizar e salvar</button><small>Se houver uma sessão de hoje na agenda, ela será marcada como feita ao finalizar.</small></footer></form>';
    document.body.appendChild(d);
    $('ptFlowSessAluno').addEventListener('change', function () { fillSessionWorkouts(this.value); });
    $('ptFlowSessFicha').addEventListener('change', fillSessionFromWorkout);
    $('ptFlowSessStart').addEventListener('click', startFlowSession);
    $('ptFlowSessAdd').addEventListener('click', function () { addSessionSet(); });
    $('ptFlowSessFinish').addEventListener('click', finishFlowSession);
  }
  function fillSessionStudents(preselect) {
    var st = read(), sel = $('ptFlowSessAluno'); if (!sel) return;
    sel.innerHTML = '<option value="">Escolha pelo nome</option>' + active(st).sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome)); }).map(function (a) { return '<option value="' + esc(a.id) + '">' + esc(a.nome) + '</option>'; }).join('');
    if (preselect && aluno(st, preselect)) sel.value = preselect;
    fillSessionWorkouts(sel.value);
  }
  function fillSessionWorkouts(id) {
    var st = read(), t = (st.treinosV2 || {})[id] || {}, sel = $('ptFlowSessFicha'); if (!sel) return;
    sel.innerHTML = '<option value="">Sessão livre</option>' + (t.fichas || []).map(function (f) { return '<option value="' + esc(f.id) + '">' + esc(f.titulo || f.nome || 'Ficha') + '</option>'; }).join('');
    $('ptFlowSessSets').innerHTML = '';
  }
  function openSession(id) {
    mountSessionDialog(); fillSessionStudents(id || (nextSession(read()) || {}).alunoId || '');
    state.sessao = null; $('ptFlowSessStart').disabled = false; $('ptFlowSessAdd').disabled = true; $('ptFlowSessFinish').disabled = true; $('ptFlowSessStatus').textContent = '';
    $('ptFlowSessSets').innerHTML = '';
    $('ptFlowSession').showModal();
  }
  function fillSessionFromWorkout() {
    if (state.sessao) return;
    var st = read(), id = $('ptFlowSessAluno').value, fid = $('ptFlowSessFicha').value, t = (st.treinosV2 || {})[id] || {};
    var f = (t.fichas || []).find(function (x) { return x.id === fid; });
    var box = $('ptFlowSessSets'); box.innerHTML = '';
    if (!f) return;
    (f.itens || []).forEach(function (it) {
      var ex = (st.exercicios || []).find(function (e) { return e.id === it.exId; });
      addSessionSet({ exercicio: (ex && ex.nome) || it.nome || '', reps: it.reps || '', carga: it.carga == null ? '' : it.carga, rpe: '' });
    });
  }
  function addSessionSet(v) {
    var box = $('ptFlowSessSets'); if (!box) return;
    v = v || {};
    var row = document.createElement('div'); row.className = 'ptf-set';
    row.innerHTML = '<label>Exercício<input data-k="exercicio" value="' + esc(v.exercicio || '') + '" placeholder="Nome do exercício"></label>' +
      '<label>Reps<input data-k="reps" value="' + esc(v.reps || '') + '" inputmode="numeric" placeholder="10"></label>' +
      '<label>Carga<input data-k="carga" value="' + esc(v.carga || '') + '" placeholder="kg"></label>' +
      '<label>RPE<select data-k="rpe"><option value="">—</option><option value="1">Leve</option><option value="2">Na medida</option><option value="3">Pesado</option></select></label>' +
      '<button type="button" class="ptf-set-remove" aria-label="Remover exercício">×</button>';
    q('[data-k="rpe"]', row).value = v.rpe || '';
    q('.ptf-set-remove', row).addEventListener('click', function () { row.remove(); });
    box.appendChild(row);
  }
  function sessionSets() {
    return qa('#ptFlowSessSets .ptf-set').map(function (r) { return { exercicio: q('[data-k="exercicio"]', r).value.trim(), reps: q('[data-k="reps"]', r).value.trim(), carga: q('[data-k="carga"]', r).value.trim(), rpe: q('[data-k="rpe"]', r).value }; }).filter(function (x) { return x.exercicio; });
  }
  function localSessionSave() { try { localStorage.setItem(SESSION_KEY, JSON.stringify(state.sessao || null)); } catch (e) {} }
  function queueRead() { try { var v = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  function queueWrite(v) { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(v || [])); return true; } catch (e) { return false; } }
  function cloudCtx() {
    var c = S.cloud && S.cloud(); if (!c || !c.client || !c.aid) return Promise.resolve(null);
    return c.client.auth.getSession().then(function (r) {
      var u = r && r.data && r.data.session && r.data.session.user;
      return u ? { client: c.client, aid: c.aid, user: u } : null;
    }, function () { return null; });
  }
  function startFlowSession() {
    var aid = $('ptFlowSessAluno').value, st = read(), a = aluno(st, aid);
    if (!a) { $('ptFlowSessStatus').textContent = 'Escolha um aluno.'; return; }
    var sess = { localId: 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2), alunoId: aid, alunoNome: a.nome, startedAt: nowIso(), obs: $('ptFlowSessObs').value.trim(), sets: [], serverId: null };
    state.sessao = sess; localSessionSave();
    $('ptFlowSessStart').disabled = true; $('ptFlowSessAdd').disabled = false; $('ptFlowSessFinish').disabled = false;
    if (!$('ptFlowSessSets').children.length) fillSessionFromWorkout();
    if (!$('ptFlowSessSets').children.length) addSessionSet();
    $('ptFlowSessStatus').textContent = 'Sessão iniciada · salvando…';
    cloudCtx().then(function (c) {
      if (!c || !state.sessao || state.sessao.localId !== sess.localId) { $('ptFlowSessStatus').textContent = 'Sessão iniciada offline.'; return; }
      return c.client.from('personal_sessoes').insert({ academia_id: c.aid, aluno_id: aid, profissional_id: c.user.id, status: 'em_andamento', iniciado_em: sess.startedAt, dados: { origem: 'fluxo_v833', observacao: sess.obs, series: [] } }).select('id').single().then(function (r) {
        if (r && !r.error && r.data && state.sessao && state.sessao.localId === sess.localId) { state.sessao.serverId = r.data.id; localSessionSave(); $('ptFlowSessStatus').textContent = 'Sessão iniciada · nuvem ativa.'; }
        else $('ptFlowSessStatus').textContent = 'Sessão iniciada neste aparelho; sincroniza depois.';
      });
    });
  }
  function markAgendaDone(id) {
    var st = read(), h = today(), hit = (st.sessoes || []).find(function (x) { return x.alunoId === id && x.data === h && !x.feita && !x.faltou; });
    if (!hit) return false;
    hit.feita = true; hit.faltou = false; hit.feitaEm = nowIso();
    return S.write('ptStudio', st) !== false;
  }
  function finishFlowSession() {
    if (!state.sessao) return;
    var sess = clone(state.sessao); sess.sets = sessionSets(); sess.obs = $('ptFlowSessObs').value.trim(); sess.finishedAt = nowIso();
    if (!sess.sets.length && !confirm('Finalizar esta sessão sem exercícios registrados?')) return;
    $('ptFlowSessFinish').disabled = true; $('ptFlowSessStatus').textContent = 'Finalizando…';
    var payload = { observacao: sess.obs, series: sess.sets, origem: 'fluxo_v833', local_id: sess.localId };
    cloudCtx().then(function (c) {
      if (!c) { enqueueSession(sess); return { offline: true }; }
      if (sess.serverId) return c.client.from('personal_sessoes').update({ status: 'concluida', encerrado_em: sess.finishedAt, dados: payload }).eq('id', sess.serverId).then(function (r) { if (r.error) { enqueueSession(sess); return { offline: true }; } return { ok: true }; });
      return c.client.from('personal_sessoes').insert({ academia_id: c.aid, aluno_id: sess.alunoId, profissional_id: c.user.id, status: 'concluida', iniciado_em: sess.startedAt, encerrado_em: sess.finishedAt, dados: payload }).then(function (r) { if (r.error) { enqueueSession(sess); return { offline: true }; } return { ok: true }; });
    }).then(function (result) {
      markAgendaDone(sess.alunoId);
      state.sessao = null; localSessionSave();
      $('ptFlowSessStatus').textContent = result && result.offline ? 'Salvo neste aparelho. A nuvem será atualizada quando a conexão voltar.' : 'Sessão salva e agenda atualizada.';
      renderDashboard(); if (state.alunoId === sess.alunoId) renderProfile360();
      setTimeout(function () { if ($('ptFlowSession').open) $('ptFlowSession').close(); }, 700);
    }).catch(function () {
      enqueueSession(sess); markAgendaDone(sess.alunoId); state.sessao = null; localSessionSave(); $('ptFlowSessStatus').textContent = 'Salvo neste aparelho. A sincronização será tentada novamente.';
    });
  }
  function enqueueSession(sess) {
    var qv = queueRead(), ix = qv.findIndex(function (x) { return x.localId === sess.localId; });
    if (ix >= 0) qv[ix] = sess; else qv.push(sess); queueWrite(qv);
  }
  function flushSessionQueue() {
    if (state.flushBusy) return;
    var items = queueRead(); if (!items.length) return;
    state.flushBusy = true;
    cloudCtx().then(function (c) {
      if (!c) return;
      var remaining = items.slice();
      return items.reduce(function (p, sess) {
        return p.then(function () {
          var payload = { observacao: sess.obs || '', series: sess.sets || [], origem: 'fluxo_v833', local_id: sess.localId };
          var req = sess.serverId ? c.client.from('personal_sessoes').update({ status: 'concluida', encerrado_em: sess.finishedAt || nowIso(), dados: payload }).eq('id', sess.serverId)
            : c.client.from('personal_sessoes').insert({ academia_id: c.aid, aluno_id: sess.alunoId, profissional_id: c.user.id, status: 'concluida', iniciado_em: sess.startedAt || nowIso(), encerrado_em: sess.finishedAt || nowIso(), dados: payload });
          return req.then(function (r) { if (!r.error) { remaining = remaining.filter(function (x) { return x.localId !== sess.localId; }); queueWrite(remaining); } });
        });
      }, Promise.resolve());
    }).finally(function () { state.flushBusy = false; });
  }

  function mountProfile360() {
    var sec = q('#vPerfil [data-pfsec="resumo"]');
    if (!sec || $('ptFlow360')) return;
    var box = document.createElement('section'); box.id = 'ptFlow360'; box.className = 'ptf-360';
    box.innerHTML = '<header class="ptf-360-head"><div><span>ALUNO 360°</span><h3>Visão completa</h3></div><button type="button" class="ptf-icon" data-ptf="refresh-profile" aria-label="Atualizar aluno">↻</button></header>' +
      '<div id="ptFlow360Kpis" class="ptf-360-kpis"></div><div id="ptFlow360Chart" class="ptf-week-chart"></div>' +
      '<div class="ptf-360-actions"><button type="button" class="btn" data-ptf="profile-session">Iniciar sessão</button><button type="button" class="btn sec" data-ptf="profile-ai">IA do treino</button><button type="button" class="btn sec" data-ptf="profile-week">Semana</button><button type="button" class="btn sec" data-ptf="profile-question">Questionário</button><button type="button" class="btn sec" data-ptf="profile-eval">Avaliação</button><button type="button" class="btn sec" data-ptf="profile-food">Nutrição</button></div>' +
      '<div class="ptf-360-grid"><div><h4>Linha do tempo</h4><div id="ptFlow360Timeline" class="ptf-timeline"></div></div><div><h4>Sinais de acompanhamento</h4><div id="ptFlow360Signals" class="ptf-signals"></div></div></div>';
    var proxima = $('pfProxima'); if (proxima) proxima.insertAdjacentElement('afterend', box); else sec.insertBefore(box, sec.firstChild);
  }
  function currentProfileId() {
    if (window.__perfilAtualPT) return window.__perfilAtualPT() || state.alunoId || '';
    if (state.alunoId) return state.alunoId;
    var title = $('pfTitulo'), nome = title && title.textContent.trim();
    if (nome) { var matches = active(read()).filter(function (a) { return String(a.nome || '').trim() === nome; }); if (matches.length === 1) return matches[0].id; }
    return '';
  }
  function weekBins(st, id) {
    var out = [], now = new Date(today() + 'T12:00:00');
    for (var i = 7; i >= 0; i--) {
      var end = new Date(now); end.setDate(end.getDate() - i * 7);
      var start = new Date(end); start.setDate(start.getDate() - 6);
      var si = isoDate(start), ei = isoDate(end), n = (st.sessoes || []).filter(function (x) { return x.alunoId === id && x.feita && x.data >= si && x.data <= ei; }).length;
      out.push({ label: String(end.getDate()).padStart(2, '0') + '/' + String(end.getMonth() + 1).padStart(2, '0'), n: n });
    }
    return out;
  }
  function isoDate(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function renderProfile360() {
    mountProfile360();
    var id = currentProfileId(), st = read(), a = aluno(st, id), root = $('ptFlow360');
    if (!root) return;
    if (!a) { root.hidden = true; return; }
    state.alunoId = id; root.hidden = false;
    var done30 = (st.sessoes || []).filter(function (x) { return x.alunoId === id && x.feita && daysBetween(x.data) <= 30; }).length;
    var future = (st.sessoes || []).filter(function (x) { return x.alunoId === id && !x.feita && !x.faltou && x.data >= today(); }).length;
    var tr = (st.treinosV2 || {})[id] || {}, trainAge = daysBetween(trainingStamp(tr, a));
    var av = lastAssessment(st, id), avAge = av ? daysBetween(av.data) : null;
    var last = lastDone(st, id), streak = +(((a.retorno || {}).seqSem) || 0);
    $('ptFlow360Kpis').innerHTML = kpi360('Treinos · 30 dias', done30, future + ' agendado(s)') + kpi360('Treino atual', (tr.fichas || []).length + ' ficha(s)', trainAge == null ? 'Sem data de prescrição' : trainAge + ' dias desde revisão') + kpi360('Última sessão', last ? fmtDate(last.data) : '—', last ? ((last.hora || '') + (streak ? ' · sequência ' + streak + ' sem.' : '')) : 'Nenhuma concluída') + kpi360('Avaliação', av ? fmtDate(av.data) : '—', avAge == null ? 'Sem avaliação' : avAge + ' dias atrás');
    var bins = weekBins(st, id), max = Math.max.apply(Math, bins.map(function (x) { return x.n; }).concat([1]));
    $('ptFlow360Chart').innerHTML = '<div class="ptf-chart-title"><b>Frequência · 8 semanas</b><span>' + done30 + ' nos últimos 30 dias</span></div><div class="ptf-bars">' + bins.map(function (x) { return '<div class="ptf-bar"><i style="height:' + Math.max(8, Math.round((x.n / max) * 100)) + '%"></i><b>' + x.n + '</b><small>' + x.label + '</small></div>'; }).join('') + '</div>';
    var timeline = [];
    (st.sessoes || []).filter(function (x) { return x.alunoId === id && (x.feita || x.faltou); }).slice().sort(function (x, y) { return String(y.data).localeCompare(String(x.data)); }).slice(0, 5).forEach(function (x) { timeline.push({ d: x.data, title: x.feita ? 'Sessão concluída' : 'Falta registrada', note: x.hora || '' }); });
    (st.avaliacoes || []).filter(function (x) { return x.alunoId === id; }).slice().sort(function (x, y) { return String(y.data).localeCompare(String(x.data)); }).slice(0, 3).forEach(function (x) { timeline.push({ d: x.data, title: 'Avaliação registrada', note: x.peso ? 'Peso ' + x.peso + ' kg' : '' }); });
    timeline.sort(function (x, y) { return String(y.d).localeCompare(String(x.d)); });
    $('ptFlow360Timeline').innerHTML = timeline.length ? timeline.slice(0, 7).map(timeItem).join('') : '<p class="muted">Ainda não há eventos locais registrados.</p>';
    var sig = [], p = painReport(a); if (p) sig.push('<button data-ptf-profile="' + esc(id) + '"><b>Relato para revisar</b><span>' + esc(fmtDate(p.d)) + ' · ' + esc(p.t.slice(0, 90)) + '</span></button>');
    if (trainAge != null && trainAge >= 56) sig.push('<button data-ptf="profile-ai"><b>Treino pede revisão</b><span>' + trainAge + ' dias desde a prescrição.</span></button>');
    if (last && daysBetween(last.data) >= 10) sig.push('<button data-ptf-profile="' + esc(id) + '"><b>Frequência caiu</b><span>' + daysBetween(last.data) + ' dias sem sessão concluída.</span></button>');
    if (avAge != null && avAge >= 90) sig.push('<button data-ptf="profile-eval"><b>Reavaliação</b><span>' + avAge + ' dias desde a última avaliação.</span></button>');
    if (!sig.length) sig.push('<div class="ptf-ok"><b>Sem alerta local importante</b><span>Continue acompanhando treino, frequência e respostas.</span></div>');
    $('ptFlow360Signals').innerHTML = sig.join('');
    loadRemote360(a, id);
  }
  function kpi360(label, value, note) { return '<div><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong><small>' + esc(note || '') + '</small></div>'; }
  function timeItem(x) { return '<div class="ptf-time-item"><time>' + esc(fmtDate(x.d)) + '</time><div><b>' + esc(x.title) + '</b>' + (x.note ? '<span>' + esc(x.note) + '</span>' : '') + '</div></div>'; }
  function loadRemote360(a, id) {
    clearTimeout(state.remoteTimer); state.remoteTimer = setTimeout(function () {
      var c = S.cloud && S.cloud(); if (!c || !c.client || !c.aid || !a.appTokenP || currentProfileId() !== id) return;
      Promise.all([
        c.client.from('app_treino_log').select('dia,exercicio,feitas,carga,criado').eq('academia_id', c.aid).eq('token', a.appTokenP).order('dia', { ascending: false }).limit(12),
        c.client.from('app_quest').select('questionario,dados,criado').eq('academia_id', c.aid).eq('token', a.appTokenP).order('criado', { ascending: false }).limit(8),
        c.client.from('app_agenda').select('dia,hora,status,criado').eq('academia_id', c.aid).eq('token', a.appTokenP).order('dia', { ascending: false }).limit(8)
      ]).then(function (rs) {
        if (currentProfileId() !== id) return;
        var tl = [], logs = rs[0] && !rs[0].error ? rs[0].data || [] : [], quests = rs[1] && !rs[1].error ? rs[1].data || [] : [], agendas = rs[2] && !rs[2].error ? rs[2].data || [] : [];
        logs.slice(0, 5).forEach(function (x) { tl.push({ d: x.dia, title: 'Registro no app · ' + (x.exercicio || 'treino'), note: (x.feitas ? x.feitas + ' série(s)' : '') + (x.carga ? ' · carga ' + x.carga : '') }); });
        quests.slice(0, 3).forEach(function (x) { tl.push({ d: String(x.criado || '').slice(0, 10), title: 'Questionário respondido', note: x.questionario || '' }); });
        agendas.slice(0, 3).forEach(function (x) { tl.push({ d: x.dia, title: 'Agenda do app · ' + (x.status || 'atualizada'), note: x.hora || '' }); });
        tl.sort(function (x, y) { return String(y.d).localeCompare(String(x.d)); });
        var box = $('ptFlow360Timeline'); if (box && tl.length) box.insertAdjacentHTML('beforeend', '<div class="ptf-cloud-title">ATUALIZAÇÕES DO APP</div>' + tl.slice(0, 7).map(timeItem).join(''));
      });
    }, 120);
  }

  function extendUniversalSearch() {
    var input = $('buscaAluno'), box = $('buscaAlunoLista'); if (!input || !box || input.dataset.ptflow) return;
    input.dataset.ptflow = '1'; input.placeholder = 'Buscar aluno, exercício, questionário, treino ou tela…';
    input.addEventListener('input', function () { setTimeout(function () { appendUniversalResults(input.value); }, 0); });
    input.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var built = box.querySelector('[data-busca-id],[data-busca-tela],[data-busca-cmd]');
      var own = box.querySelector('[data-ptf-search]');
      if (!built && own) { e.preventDefault(); e.stopImmediatePropagation(); own.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); }
    }, true);
    box.addEventListener('mousedown', function (e) {
      var item = e.target.closest && e.target.closest('[data-ptf-search]'); if (!item) return;
      e.preventDefault(); runSearchItem(item); input.value = ''; box.hidden = true;
    });
  }
  function norm(v) { return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  function appendUniversalResults(term) {
    var box = $('buscaAlunoLista'); if (!box) return;
    qa('[data-ptf-search-wrap]', box).forEach(function (x) { x.remove(); });
    var t = norm(term).trim(); if (t.length < 2) return;
    var st = read(), rows = [];
    (st.exercicios || []).filter(function (x) { return norm((x.nome || '') + ' ' + (x.grupo || '')).indexOf(t) >= 0; }).slice(0, 4).forEach(function (x) { rows.push({ kind: 'exercise', id: x.id, title: x.nome, sub: 'Exercício · ' + (x.grupo || 'biblioteca') }); });
    (st.questionarios || []).filter(function (x) { return norm(x.nome).indexOf(t) >= 0; }).slice(0, 3).forEach(function (x) { rows.push({ kind: 'question', id: x.id, title: x.nome, sub: 'Questionário' }); });
    active(st).forEach(function (a) {
      var tr = (st.treinosV2 || {})[a.id] || {};
      (tr.fichas || []).filter(function (f) { return norm(f.titulo || f.nome).indexOf(t) >= 0; }).slice(0, 2).forEach(function (f) { if (rows.length < 9) rows.push({ kind: 'workout', id: a.id, title: f.titulo || f.nome || 'Ficha', sub: 'Treino de ' + a.nome }); });
    });
    if (!rows.length) return;
    var wrap = document.createElement('div'); wrap.setAttribute('data-ptf-search-wrap', '1');
    wrap.innerHTML = '<div class="ptf-search-label">EXERCÍCIOS, QUESTIONÁRIOS E TREINOS</div>' + rows.slice(0, 8).map(function (r) { return '<div class="ptf-search-row" data-ptf-search="' + esc(r.kind) + '" data-id="' + esc(r.id) + '"><b>' + esc(r.title) + '</b><span>' + esc(r.sub) + '</span></div>'; }).join('');
    box.appendChild(wrap); box.hidden = false;
  }
  function runSearchItem(el) {
    var kind = el.getAttribute('data-ptf-search'), id = el.getAttribute('data-id');
    if (kind === 'workout') { openProfile(id); setTimeout(function () { var b = q('#pfAbas [data-pfa="treino"]'); if (b) b.click(); }, 0); return; }
    if (kind === 'exercise') { nav('treinos'); setTimeout(function () { if (window.__trAba) window.__trAba('ex'); var x = $('catBusca'); if (x) { var st = read(), ex = (st.exercicios || []).find(function (e) { return e.id === id; }); x.value = ex ? ex.nome : ''; x.dispatchEvent(new Event('input', { bubbles: true })); x.focus(); } }, 0); return; }
    if (kind === 'question') { nav('quest'); setTimeout(function () { if (window.__qtAba) window.__qtAba('respostas'); var st = read(), qu = (st.questionarios || []).find(function (x) { return x.id === id; }), b = $('qrBusca'); if (b) { b.value = qu ? qu.nome : ''; b.dispatchEvent(new Event('input', { bubbles: true })); } }, 0); }
  }

  var PRESETS = [
    { nome: 'Revisar questionário respondido', gatilho: 'questionario.respondido', acao: 'revisar_aluno' },
    { nome: 'Acompanhar novo aluno', gatilho: 'aluno.novo', acao: 'revisar_planejamento' },
    { nome: 'Recuperar sessão cancelada', gatilho: 'agenda.cancelada', acao: 'contatar_aluno' }
  ];
  function loadAutomationPanel() {
    var box = $('ptFlowAutoList'), label = $('ptFlowAutoResumo'); if (!box || state.autosBusy) return;
    state.autosBusy = true; box.innerHTML = '<p class="muted">Carregando automações e providências…</p>';
    cloudCtx().then(function (c) {
      if (!c) { label.textContent = 'Disponível quando a conta estiver conectada'; box.innerHTML = '<p class="muted">Entre na sua conta para usar automações compartilhadas entre computador e celular.</p>'; return; }
      return Promise.all([
        c.client.from('personal_automacoes').select('id,nome,gatilho,acao,ativa,criado_em').eq('academia_id', c.aid).order('criado_em', { ascending: false }).limit(40),
        c.client.from('personal_automacao_fila').select('id,aluno_id,gatilho,acao,status,criado_em').eq('academia_id', c.aid).eq('status', 'pendente').order('criado_em', { ascending: false }).limit(30)
      ]).then(function (rs) {
        var autos = rs[0] && !rs[0].error ? rs[0].data || [] : [], queue = rs[1] && !rs[1].error ? rs[1].data || [] : [], st = read();
        label.textContent = autos.filter(function (x) { return x.ativa; }).length + ' ativa(s) · ' + queue.length + ' providência(s)';
        box.innerHTML = '<div class="ptf-auto-cols"><div><h4>Automações</h4>' + (autos.length ? autos.map(function (x) { return '<div class="ptf-auto-item"><div><b>' + esc(x.nome) + '</b><span>' + esc(triggerLabel(x.gatilho)) + ' → ' + esc(actionLabel((x.acao || {}).tipo)) + '</span></div><em class="' + (x.ativa ? 'ok' : '') + '">' + (x.ativa ? 'ativa' : 'pausada') + '</em></div>'; }).join('') : '<p class="muted">Nenhuma automação criada.</p>') + '</div><div><h4>Providências</h4>' + (queue.length ? queue.map(function (x) { var a = aluno(st, x.aluno_id); return '<div class="ptf-auto-item"><div><b>' + esc(a ? a.nome : 'Aluno') + '</b><span>' + esc(actionLabel((x.acao || {}).tipo)) + ' · ' + esc(triggerLabel(x.gatilho)) + '</span></div><button type="button" class="btn sec mini" data-ptf-done="' + esc(x.id) + '">Concluir</button></div>'; }).join('') : '<p class="muted">Fila vazia.</p>') + '</div></div>';
      });
    }).catch(function () { if (label) label.textContent = 'Não foi possível carregar agora'; if (box) box.innerHTML = '<p class="muted">A nuvem não respondeu. O restante do Personal continua funcionando.</p>'; }).finally(function () { state.autosBusy = false; });
  }
  function triggerLabel(v) { return { 'questionario.respondido': 'Questionário respondido', 'aluno.novo': 'Novo aluno', 'agenda.cancelada': 'Sessão cancelada' }[v] || v || 'evento'; }
  function actionLabel(v) { return { revisar_aluno: 'Revisar aluno', contatar_aluno: 'Entrar em contato', revisar_planejamento: 'Revisar planejamento' }[v] || v || 'Providência'; }
  function activatePresets(btn) {
    if (btn) btn.disabled = true;
    cloudCtx().then(function (c) {
      if (!c) throw new Error('Entre na sua conta para ativar automações.');
      return c.client.from('personal_automacoes').select('nome').eq('academia_id', c.aid).then(function (r) {
        if (r.error) throw r.error; var names = (r.data || []).map(function (x) { return x.nome; });
        var missing = PRESETS.filter(function (p) { return names.indexOf(p.nome) < 0; });
        if (!missing.length) return [];
        return c.client.auth.getSession().then(function (s) { var u = s.data && s.data.session && s.data.session.user; if (!u) throw new Error('Sessão expirada.'); return c.client.from('personal_automacoes').insert(missing.map(function (p) { return { academia_id: c.aid, autor_id: u.id, nome: p.nome, gatilho: p.gatilho, condicao: {}, acao: { tipo: p.acao }, ativa: true }; })); });
      });
    }).then(function () { loadAutomationPanel(); }).catch(function (e) { alert(e.message || 'Não foi possível ativar agora.'); }).finally(function () { if (btn) btn.disabled = false; });
  }
  function completeQueue(id, btn) {
    if (!id || !btn) return; btn.disabled = true;
    cloudCtx().then(function (c) { if (!c) throw new Error('Conta desconectada.'); return c.client.from('personal_automacao_fila').update({ status: 'concluida', concluido_em: nowIso() }).eq('id', id); }).then(function (r) { if (r && r.error) throw r.error; loadAutomationPanel(); }).catch(function () { btn.disabled = false; });
  }

  function handleAction(e) {
    var p = e.target.closest && e.target.closest('[data-ptf-profile]'); if (p) { openProfile(p.getAttribute('data-ptf-profile')); return; }
    var best = e.target.closest && e.target.closest('[data-ptf-best]');
    if (best) {
      var type = best.getAttribute('data-ptf-best'), id = best.getAttribute('data-aluno');
      if (type === 'session') openSession(id); else if (type === 'workout') openWorkout(id, false); else if (type === 'ai') openWorkout(id, true); else if (type === 'evaluation') openEval(id); else if (type === 'profile' || type === 'pain') openProfile(id); else if (type === 'students') nav('alunos');
      return;
    }
    var a = e.target.closest && e.target.closest('[data-ptf]'); if (!a) return;
    var action = a.getAttribute('data-ptf'), idNow = currentProfileId();
    if (action === 'refresh') renderDashboard();
    else if (action === 'session-next') openSession((nextSession(read()) || {}).alunoId || '');
    else if (action === 'search') { var b = $('buscaAluno'); if (b) { b.focus(); b.select(); } }
    else if (action === 'autos') { var d = $('ptFlowAutos'); if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'center' }); loadAutomationPanel(); } }
    else if (action === 'activate-presets') activatePresets(a);
    else if (action === 'reload-autos') loadAutomationPanel();
    else if (action === 'refresh-profile') renderProfile360();
    else if (action === 'profile-session') openSession(idNow);
    else if (action === 'profile-ai') openWorkout(idNow, true);
    else if (action === 'profile-week') { nav('treinos'); setTimeout(function () { if (window.__trAba) window.__trAba('plano'); var x = $('plnAluno'); if (x) { x.value = idNow; x.dispatchEvent(new Event('change', { bubbles: true })); } }, 0); }
    else if (action === 'profile-question') openQuest(idNow);
    else if (action === 'profile-eval') openEval(idNow);
    else if (action === 'profile-food') openNutrition(idNow);
  }

  function observeProfile() {
    var root = $('vPerfil'); if (!root || root.dataset.ptflowObs) return;
    root.dataset.ptflowObs = '1';
    var mo = new MutationObserver(function () { if (!root.hidden) setTimeout(renderProfile360, 0); });
    mo.observe(root, { attributes: true, attributeFilter: ['hidden'] });
    var title = $('pfTitulo'); if (title) { var mt = new MutationObserver(function () { setTimeout(renderProfile360, 0); }); mt.observe(title, { childList: true, characterData: true, subtree: true }); }
  }
  function restoreActiveSession() {
    try { var v = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); if (v && v.alunoId && !v.finishedAt) state.sessao = v; } catch (e) {}
  }
  function mount() {
    mountDashboard(); mountProfile360(); mountSessionDialog(); extendUniversalSearch(); observeProfile(); restoreActiveSession();
    document.addEventListener('click', handleAction);
    document.addEventListener('click', function (e) { var done = e.target.closest && e.target.closest('[data-ptf-done]'); if (done) completeQueue(done.getAttribute('data-ptf-done'), done); });
    window.addEventListener('online', flushSessionQueue);
    if (S.onChange) S.onChange(function (key) { if (key === 'ptStudio') { renderDashboard(); if (!$('vPerfil').hidden) renderProfile360(); } });
    setTimeout(flushSessionQueue, 1200);
  }
  window.__PT_FLUXO__.render = renderDashboard;
  window.__PT_FLUXO__.bestAction = bestAction;
  window.__PT_FLUXO__.openSession = openSession;
  window.__PT_FLUXO__.renderProfile = renderProfile360;
  window.__PT_FLUXO__.flush = flushSessionQueue;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
