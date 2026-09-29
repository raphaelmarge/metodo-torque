/* Central Pro: projeção somente leitura do Personal autenticado.
 * Não chama load() do painel (que pode migrar/gravar), não publica pacotes e
 * nunca usa o blob local sem comprovar sua identidade. Tokens não saem da API.
 */
(function (root) {
  'use strict';
  var clients = new WeakMap(), identityEpoch = 0;
  if (root.addEventListener) root.addEventListener('mt:conta-divergente', function () { identityEpoch++; });
  function text(v, max) { return typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, max || 200) : ''; }
  function object(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
  function list(v) { return Array.isArray(v) ? v : []; }
  function number(v, max) { if (typeof v === 'boolean' || v == null || String(v).trim() === '') return null; var n = Number(v); return Number.isFinite(n) && n >= 0 && n <= max ? n : null; }
  function date(v) { var s = text(v, 40), d = new Date(s + 'T12:00:00Z'); return /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : ''; }
  function time(v) { var s = text(v, 5); return /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? s : ''; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function cloud() { try { return root.MTStore && root.MTStore.cloud && root.MTStore.cloud(); } catch (_) { return null; } }
  function localIdentity() { try { return object(JSON.parse(root.localStorage.getItem('mtsync:identidade'))); } catch (_) { return {}; } }
  function tracker(client) {
    var found = clients.get(client); if (found) return found;
    found = { epoch: 0 }; clients.set(client, found);
    if (client.auth && typeof client.auth.onAuthStateChange === 'function') client.auth.onAuthStateChange(function (event) {
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' || event === 'USER_UPDATED') found.epoch++;
    });
    return found;
  }
  function unavailable(reason, code) { return { students: [], available: false, source: 'unavailable', reason: reason, code: code, context: null, selectedStudentId: '' }; }
  function demoSnapshot(options, onlyId) {
    var html = root.document && root.document.documentElement;
    if (!html || !html.dataset || html.dataset.demo !== 'central-pro') return null;
    var demo = root.MT_CENTRAL_PRO_DEMO, client = options && options.client || root.MT_supabase;
    if (!demo || !demo.client || client !== demo.client) return unavailable('Os dados da demonstração não estão disponíveis.', 'demo_unavailable');
    try {
      var fixture = demo.context, context = object(options && options.context);
      var expectedUser = text(object(context.user).id || context.userId, 100);
      if (!fixture || fixture.demo !== 'central-pro' || !fixture.academia_id || !fixture.userId || context.academia_id && context.academia_id !== fixture.academia_id || expectedUser && expectedUser !== fixture.userId) return unavailable('O contexto da demonstração mudou. Reabra a Central Pro.', 'demo_unavailable');
      // Mesmo o getter da fixture pode mudar: a API sempre devolve sua própria
      // cópia e jamais consulta credenciais, storage ou serviços na rota demo.
      var copied = JSON.parse(JSON.stringify(fixture));
      return { students: list(copied.students).filter(function (s) { return s && (!onlyId || s.id === onlyId); }), agenda: list(copied.agenda), available: true, source: 'demo', partial: false, updatedAt: '', context: { academia_id: copied.academia_id, userId: copied.userId }, selectedStudentId: '' };
    } catch (_) { return unavailable('Não foi possível carregar a demonstração. Recarregue a página.', 'demo_unavailable'); }
  }
  async function session(client) {
    try { var r = await client.auth.getSession(); return !r.error && r.data && r.data.session && r.data.session.user || null; } catch (_) { return null; }
  }
  function localMatches(c) {
    var current = cloud(), owner = localIdentity();
    return !!(current && current.client === c.client && current.aid === c.aid && owner.user_id === c.userId && owner.academia_id === c.aid);
  }
  async function authorize(options) {
    options = options || {};
    var current = cloud(), client = options.client || root.MT_supabase || current && current.client, context = object(options.context);
    if (!client || !client.auth || typeof client.auth.getSession !== 'function' || typeof client.from !== 'function') return null;
    var tracking = tracker(client), epoch = tracking.epoch, globalEpoch = identityEpoch, user = await session(client);
    var aid = text(context.academia_id || current && current.aid, 100), expectedUser = text(object(context.user).id || context.userId, 100);
    if (!user || !user.id || !aid || expectedUser && expectedUser !== user.id) return null;
    if (current && current.aid && (current.aid !== aid || current.client !== client)) return null;
    var response;
    try { response = await client.from('membros').select('academia_id,user_id,papel').eq('academia_id', aid).eq('user_id', user.id).limit(1); } catch (_) { return null; }
    var member = response && !response.error && list(response.data).find(function (m) { return m && m.academia_id === aid && m.user_id === user.id; });
    if (!member || tracking.epoch !== epoch || identityEpoch !== globalEpoch) return null;
    return { client: client, aid: aid, userId: user.id, tracking: tracking, epoch: epoch, globalEpoch: globalEpoch, contextInput: context, hadCloud: !!current };
  }
  async function current(c) {
    if (c.tracking.epoch !== c.epoch || identityEpoch !== c.globalEpoch) return false;
    var active = cloud(), expected = c.contextInput, inputUser = text(object(expected.user).id || expected.userId, 100);
    if (expected.academia_id && expected.academia_id !== c.aid || inputUser && inputUser !== c.userId) return false;
    if (active && (active.client !== c.client || active.aid !== c.aid) || c.hadCloud && !active) return false;
    var user = await session(c.client);
    return !!(user && user.id === c.userId && c.tracking.epoch === c.epoch && identityEpoch === c.globalEpoch);
  }
  function tokenStamp(st) { return JSON.stringify(list(st.alunos).map(function (a) { return [a && a.id, a && a.appTokenP, !!(a && a.appRevogadoEm)]; })); }
  async function snapshot(c) {
    if (localMatches(c) && root.MTStore && typeof root.MTStore.read === 'function') {
      try {
        var local = root.MTStore.read('ptStudio', null);
        if (local && typeof local === 'object' && !Array.isArray(local)) return { state: local, source: 'local', tokenStamp: tokenStamp(local), updatedAt: '' };
      } catch (_) { /* um cache indisponível não impede leitura autenticada */ }
    }
    var r = await c.client.from('dados').select('academia_id,chave,valor,atualizado').eq('academia_id', c.aid).eq('chave', 'mtapp:ptStudio').limit(1);
    if (r.error) throw new Error('Não foi possível consultar os alunos agora. Tente novamente.');
    var row = list(r.data).find(function (x) { return x && x.academia_id === c.aid && x.chave === 'mtapp:ptStudio'; });
    if (!row) return { state: {}, source: 'cloud', updatedAt: '' };
    var value = row.valor; if (typeof value === 'string') { try { value = JSON.parse(value); } catch (_) { value = {}; } }
    return { state: object(value), source: 'cloud', updatedAt: text(row.atualizado, 50) };
  }
  function photo(value) {
    var s = text(value, 400001); if (!s || s.length > 400000) return '';
    if (/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(s)) return s;
    try { var u = new URL(s, root.location && root.location.href); if (u.protocol === 'https:' && !u.username && !u.password && (root.location && u.origin === root.location.origin || /\.supabase\.co$/.test(u.hostname))) return u.href; } catch (_) {}
    return '';
  }
  function prescribedSets(item) {
    var individual = list(item.seriesDetalhadas), count = number(item.series != null ? item.series : item.s, 30);
    if (!individual.length && (count == null || count < 1) || !root.MT_APP_ALUNO || typeof root.MT_APP_ALUNO.normalizaSeries !== 'function') return [];
    var normalized; try { normalized = root.MT_APP_ALUNO.normalizaSeries(item); } catch (_) { return []; }
    return list(normalized).map(function (s, i) {
      var raw = object(individual[i]), rawReps = raw.reps != null && text(raw.reps) ? raw.reps : item.reps != null ? item.reps : item.r;
      var rawRest = raw.descanso != null ? raw.descanso : item.descanso != null ? item.descanso : item.d;
      return { reps: text(rawReps, 40) ? text(s.reps, 40) : '', load: number(s.carga, 2000), rest: number(rawRest, 1800) == null ? null : number(s.descanso, 1800) };
    });
  }
  function lastLoad(records, day) {
    return list(records).map(function (r, index) { return { raw: object(r), index: index }; }).filter(function (x) {
      var r = x.raw; return date(r.d) && r.d <= day && number(r.kg, 2000) != null && (r.g !== 2 || r.feito === true);
    }).sort(function (a, b) { return a.raw.d.localeCompare(b.raw.d) || a.index - b.index; }).pop();
  }
  function applyLoads(student, cargas, day, source) {
    student.workouts.forEach(function (w) { w.exercises.forEach(function (ex) {
      var last = lastLoad(object(cargas)[ex.name], day);
      ex.lastLoad = last ? Number(last.raw.kg) : null; ex.lastLoadDate = last ? last.raw.d : ''; ex.lastLoadSource = last ? source : '';
    }); });
  }
  function workoutNames(st, id, day) {
    var t = object(object(st.treinosV2)[id]), plan = object(t.plano), dates = object(plan.datas), weekday = new Date(day + 'T12:00:00').getDay();
    var entries = Object.prototype.hasOwnProperty.call(dates, day) ? dates[day] : object(plan.dias)[String(weekday)];
    return (Array.isArray(entries) ? entries : entries && typeof entries === 'object' ? [entries] : []).map(function (entry) {
      entry = object(entry);
      var sources = { ficha: t.fichas, wod: t.wods, cardio: t.cardio }, found = list(sources[entry.tp]).find(function (w) { return w.id === entry.id; });
      return found ? text(found.titulo || found.nome, 160) : '';
    }).filter(Boolean).join(' · ');
  }
  function nextSession(st, a, day) {
    var now = new Date(), hh = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    var rows = list(st.sessoes).filter(function (s) { return s && s.alunoId === a.id && !s.feita && !s.faltou && !s.cancelada && !s.cancelado && ['cancelada', 'cancelado'].indexOf(s.status) < 0 && date(s.data) && s.data >= day && (s.data !== day || !time(s.hora) || time(s.hora) >= hh); });
    rows.sort(function (a, b) { return a.data.localeCompare(b.data) || (time(a.hora) || '99:99').localeCompare(time(b.hora) || '99:99'); });
    var s = rows[0]; return s ? { id: text(s.id, 100), date: s.data, time: time(s.hora), studentName: text(a.nome, 160), workoutName: workoutNames(st, a.id, s.data) } : null;
  }
  function nutrition(st, id, day) {
    var p = object(object(object(st.nutricaoV1).planos)[id]), exists = !!Object.keys(p).length;
    var active = exists && p.ativo !== false && (!date(p.inicio) || p.inicio <= day) && (!date(p.fim) || p.fim >= day);
    return { pendingReviews: null, summary: exists ? active ? 'Plano alimentar ativo' : 'Plano alimentar fora de vigência ou pausado' : 'Sem plano alimentar cadastrado', active: active, records7Days: null, title: text(p.titulo, 160), consultedAt: '' };
  }
  function project(st, a, day) {
    var t = object(object(st.treinosV2)[a.id]), exercises = list(st.exercicios), seen = Object.create(null);
    var student = { id: text(a.id, 100), name: text(a.nome, 160), phone: text(a.zap || a.telefone, 80), photo: photo(a.fotoAluno || a.foto), active: a.ativo !== false, objective: text(a.objetivo, 300),
      workouts: list(t.fichas).filter(function (f) { return f && text(f.id, 100) && !seen[f.id] && (seen[f.id] = true); }).map(function (f) {
        return { id: text(f.id, 100), name: text(f.titulo, 160), exercises: list(f.itens).map(function (item, index) {
          item = object(item); var ex = exercises.find(function (e) { return e && e.id === item.exId; }) || {};
          return { id: text(item.exId, 100) || f.id + ':' + index, name: text(ex.nome || item.nome, 160), sets: prescribedSets(item), lastLoad: null, lastLoadDate: '', observation: text(item.obs, 1000) };
        }) };
      }), nextSession: nextSession(st, a, day), checkin: { summary: 'Sem check-in disponível', date: '', details: '', available: false }, nutrition: nutrition(st, a.id, day), legacyWorkout: text(object(st.treinos)[a.id], 20000) };
    if (!a.appRevogadoEm) applyLoads(student, object(a.retorno).cargas, day, 'saved');
    return student;
  }
  async function readOptional(query) { try { var r = await query(); return r && !r.error ? r.data : null; } catch (_) { return null; } }
  async function enrich(c, state, students, day) {
    var links = list(state.alunos).filter(function (a) { return a && !a.appRevogadoEm && /^[A-Za-z0-9_-]{10,300}$/.test(a.appTokenP || '') && students.some(function (s) { return s.id === a.id; }); });
    var partial = false;
    for (var offset = 0; offset < links.length; offset += 80) {
      if (!await current(c)) return false;
      var batch = links.slice(offset, offset + 80), tokens = Array.from(new Set(batch.map(function (a) { return a.appTokenP; })));
      var results = await Promise.all([
        readOptional(function () { return c.client.from('app_aluno').select('token,academia_id,revogado_em,cargas:retorno->cargas').eq('academia_id', c.aid).in('token', tokens).is('revogado_em', null); }),
        readOptional(function () { return c.client.from('app_checkin').select('token,academia_id,dia,nota,texto').eq('academia_id', c.aid).in('token', tokens).lte('dia', day).order('dia', { ascending: false }).limit(1000); }),
        readOptional(function () { return typeof c.client.rpc === 'function' ? c.client.rpc('personal_nutricao_resumo', { p_academia: c.aid, p_tokens: tokens, p_hoje: day }) : Promise.resolve({ error: true }); })
      ]);
      if (!await current(c)) return false;
      partial = partial || results.some(function (x) { return x == null; });
      batch.forEach(function (a) {
        var s = students.find(function (x) { return x.id === a.id; }), access = list(results[0]).find(function (row) { return row && row.token === a.appTokenP && row.academia_id === c.aid && !row.revogado_em; });
        if (Array.isArray(results[0])) applyLoads(s, access && access.cargas, day, 'cloud');
        if (!access) return; // não reaproveitar outro token ou acesso revogado
        var checkins = list(results[1]).filter(function (r) { return r && r.academia_id === c.aid && r.token === a.appTokenP && date(r.dia) && r.dia <= day && Number.isInteger(r.nota) && r.nota >= 1 && r.nota <= 5; }).sort(function (a, b) { return b.dia.localeCompare(a.dia); });
        if (checkins[0]) { var ck = checkins[0]; s.checkin = { summary: 'Check-in ' + ck.nota + '/5', date: ck.dia, details: text(ck.texto, 500), score: ck.nota, available: true }; }
        var summary = results[2], n = summary && summary.ok === true && summary.hoje === day && list(summary.alunos).find(function (r) { return r && r.token === a.appTokenP && Number.isInteger(r.registros7dias) && r.registros7dias >= 0; });
        if (n) { s.nutrition.records7Days = n.registros7dias; s.nutrition.consultedAt = text(summary.consultadoEm, 50); s.nutrition.summary = n.registros7dias + (n.registros7dias === 1 ? ' registro alimentar' : ' registros alimentares') + ' nos últimos 7 dias'; }
      });
    }
    return { partial: partial };
  }
  function selected(students) {
    var id = '';
    try {
      if (root.PTProPersonal && typeof root.PTProPersonal.selectedStudentId === 'function') id = root.PTProPersonal.selectedStudentId();
      else if (root.document) { var profile = root.document.getElementById('vPerfil'); if (profile && !profile.hidden) id = profile.getAttribute('data-aluno-id') || ''; }
    } catch (_) {}
    return students.some(function (s) { return s.id === id; }) ? id : '';
  }
  async function loadInternal(options, onlyId, skipEnrichment) {
    var demo = demoSnapshot(options, onlyId); if (demo) return demo;
    var c = await authorize(options); if (!c) return unavailable('Entre na conta vinculada ao Personal para consultar os alunos.', 'unauthorized');
    try {
      var snap = await snapshot(c), state = snap.state, day = today(), seen = Object.create(null);
      var students = list(state.alunos).filter(function (a) { return a && text(a.id, 100) && (!onlyId || a.id === onlyId) && !seen[a.id] && (seen[a.id] = true); }).map(function (a) { return project(state, a, day); });
      var extra = skipEnrichment ? { partial: false } : await enrich(c, state, students, day);
      if (!extra || !await current(c)) return unavailable('A conta mudou durante a consulta. Abra a Central Pro novamente.', 'identity_changed');
      if (snap.source === 'local' && (!localMatches(c) || tokenStamp(root.MTStore.read('ptStudio', null) || {}) !== snap.tokenStamp)) return unavailable('O acesso do aluno mudou durante a consulta. Atualize a lista.', 'identity_changed');
      return { students: students, available: true, source: snap.source, partial: extra.partial, updatedAt: snap.updatedAt, context: { academia_id: c.aid, userId: c.userId }, selectedStudentId: localMatches(c) ? selected(students) : '' };
    } catch (_) { return unavailable('Não foi possível consultar os alunos agora. Tente novamente.', 'unavailable'); }
  }
  async function load(options) { return loadInternal(options); }
  async function student(id, options) { id = text(id, 100); if (!id) return null; var result = await loadInternal(options, id); return result.available ? result.students.find(function (s) { return s.id === id; }) || null : null; }
  async function openArea(area, id, options) {
    if (['nutricao', 'questionarios', 'agenda'].indexOf(area) < 0 || !root.PTProPersonal || typeof root.PTProPersonal.openArea !== 'function') return false;
    var result = await loadInternal(options, text(id, 100), true);
    if (!result.available || result.source !== 'local' || !result.students.some(function (s) { return s.id === id; })) return false;
    try { return root.PTProPersonal.openArea(area, id, result.context) === true; } catch (_) { return false; }
  }
  root.PTProContext = { load: load, student: student, openArea: openArea };
})(typeof window !== 'undefined' ? window : globalThis);
