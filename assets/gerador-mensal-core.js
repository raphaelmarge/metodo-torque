/* Motor mensal puro. Não persiste, não publica, não chama IA e não diagnostica. */
(function (root, factory) {
  'use strict';
  var catalog = typeof module === 'object' && module.exports ? require('./gerador-mensal-catalogo.js') : root.MT_GERADOR_MENSAL_CATALOGO;
  var api = factory(catalog);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MT_GERADOR_MENSAL = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (catalogModule) {
  'use strict';
  var VERSION = '1.0.0', RULE_VERSION = '2026-10-23.1';
  var OBJECTIVES = { hipertrofia: 'Ganhar massa muscular', emagrecimento: 'Reduzir gordura corporal', forca: 'Aumentar a força', condicionamento: 'Melhorar o condicionamento', saude: 'Saúde e autonomia' };
  var LEVELS = { iniciante: 'Iniciante', intermediario: 'Intermediário', avancado: 'Avançado' };
  var PARAMETERS = [
    { id: 'identity', label: 'Identificação, idade e população elegível' },
    { id: 'anamnese', label: 'Anamnese, origem e situação dos dados' },
    { id: 'health', label: 'Condições, sintomas e lesões' },
    { id: 'function', label: 'Capacidade funcional e acessibilidade' },
    { id: 'guidance', label: 'Orientações e restrições profissionais' },
    { id: 'level', label: 'Nível confirmado na modalidade' },
    { id: 'return', label: 'Retorno após pausa e readaptação' },
    { id: 'objectives', label: 'Objetivo principal e secundário' },
    { id: 'priorities', label: 'Prioridades musculares e preferências' },
    { id: 'schedule', label: 'Dias disponíveis e duração' },
    { id: 'equipment', label: 'Equipamentos e ambiente' },
    { id: 'recovery', label: 'Recuperação, sono e outras atividades' },
    { id: 'previous', label: 'Continuidade da etapa anterior' },
    { id: 'performance', label: 'Adesão, registros e esforço comparável' },
    { id: 'assessment', label: 'Avaliações físicas e métodos' },
    { id: 'closure', label: 'Relato mensal e validação do personal' },
    { id: 'protocol', label: 'Dose, progressão e regras versionadas' }
  ];
  var EVIDENCE = [
    ['R01', 'Individualização', 'https://pubmed.ncbi.nlm.nih.gov/37414459/', 'Adultos de estudos de treinamento resistido', 'Objetivo, rotina e experiência', 'Selecionar opções compatíveis; nenhuma ficha universal.'],
    ['R02', 'Força', 'https://pubmed.ncbi.nlm.nih.gov/41843416/', 'Adultos saudáveis', 'Elegibilidade e dose aprovada', 'Não estimar carga inicial pelo peso corporal nem exigir teste máximo.'],
    ['R03', 'Volume', 'https://acsm.org/resistance-training-guidelines-update-2026/', 'Adultos saudáveis', 'Dose e tolerância revisadas', 'Volume aprovado; séries secundárias não contabilizadas neste protocolo.'],
    ['R04', 'Esforço', 'https://pubmed.ncbi.nlm.nih.gov/41843416/', 'Adultos saudáveis', 'Escala identificada e interpretação confirmada', 'Falha não é exigida; escala de sessão 1–3 não é RPE 1–10.'],
    ['R05', 'Progressão', 'https://pubmed.ncbi.nlm.nih.gov/35038063/', 'Populações estudadas em treinamento resistido', 'Dados comparáveis e fechamento confirmado', 'Incrementos e suficiência são parâmetros profissionais, não uma fórmula validada pelo estudo.'],
    ['R06', 'Continuidade', 'https://acsm.org/resistance-training-guidelines-update-2026/', 'Adultos saudáveis', 'Exercício ainda compatível', 'Manter movimentos é política de produto apoiada na viabilidade; não copiar carga entre variações.'],
    ['R07', 'Individualidade e gênero', 'https://pubmed.ncbi.nlm.nih.gov/40028215/', 'Adultos saudáveis dos estudos', 'Dados individuais', 'Gênero e XP não alteram dose, elegibilidade ou prioridades.'],
    ['R08', 'Saúde e capacidade', 'https://doi.org/10.2337/dc26-S005', 'Conforme orientação assistencial individual', 'Orientação específica com autoria, data e escopo', 'Sem cálculo de medicação; diagnóstico isolado não determina exercício.'],
    ['R09', 'Retorno após lesão', 'https://doi.org/10.1249/mss.0000000000003371', 'Contexto individual de retorno', 'Orientação vigente revisada', 'Menos dor ou mais carga não retira restrição nem atesta cura.']
  ].map(function (r) { return { id: r[0], name: r[1], version: RULE_VERSION, source: r[2], population: r[3], prerequisites: r[4], requiredData: r[4], action: r[1], exceptions:'Dados insuficientes, população não coberta ou orientações conflitantes exigem revisão individual.', limits: r[5], technicalOwner: 'Profissional que aprovar o protocolo individual', reviewedAt: null, editorialDate: '2026-10-23', clinicallyValidated: false }; });
  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
  function decisionData(v) {
    if(Array.isArray(v))return v.map(decisionData);
    if(!v || typeof v!=='object')return v;
    var out={};Object.keys(v).forEach(function(k){if(['gender','genderIdentity','genero','sexo','sex','xp','points','pontos','gamification','__proto__','constructor','prototype'].indexOf(k)<0)out[k]=decisionData(v[k]);});return out;
  }
  function list(v) { return Array.isArray(v) ? v : []; }
  function finite(v) { return (typeof v==='number'||typeof v==='string') && String(v).trim()!=='' && isFinite(Number(v)); }
  function num(v) { return finite(v) ? Number(v) : null; }
  function sorted(v) { return list(v).slice().sort(); }
  function stable(v) {
    if (v === undefined) return 'null';
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    return '{' + Object.keys(v).filter(function (k) { return v[k] !== undefined; }).sort().map(function (k) { return JSON.stringify(k) + ':' + stable(v[k]); }).join(',') + '}';
  }
  // Deterministic change detector, not an authentication/signature primitive.
  function hash(v) { var text = stable(v), h1 = 2166136261, h2 = 2246822519; for (var i = 0; i < text.length; i++) { h1 = Math.imul(h1 ^ text.charCodeAt(i), 16777619); h2 = Math.imul(h2 ^ text.charCodeAt(i), 3266489917); } return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0'); }
  function issue(code, message, severity, field) { return { code: code, message: message, severity: severity || 'error', field: field || '' }; }
  function dateValid(v) { if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}/.test(v)||!isFinite(Date.parse(v)))return false;var day=v.slice(0,10),d=new Date(day+'T12:00:00Z');return isFinite(d.getTime())&&d.toISOString().slice(0,10)===day; }
  function defaultConfig() {
    var doses = {};
    Object.keys(OBJECTIVES).forEach(function (objective) {
      doses[objective] = {};
      Object.keys(LEVELS).forEach(function (level) {
        doses[objective][level] = { sets: level === 'iniciante' ? 2 : 3, repsMin: objective === 'forca' ? 6 : 8,
          repsMax: objective === 'forca' ? 8 : 12, restSeconds: objective === 'forca' ? 120 : 90,
          targetRpeMin: 6, targetRpeMax: 8, maxExercises: level === 'iniciante' ? 5 : level === 'intermediario' ? 6 : 7 };
      });
    });
    return { version: '1', approved: false, author: '', date: '',
      status: 'Proposta operacional para revisão profissional; não validada clinicamente',
      scope: 'Componente de treinamento resistido para adulto elegível. Condicionamento, mobilidade e equilíbrio complementares requerem planejamento específico.',
      doses: doses, minComparableSessions: 2, maxLoadIncreasePct: 5, loadIncrementKg: 1,
      warmupMinutes: 5, transitionSeconds: 60, secondsPerRep: 4, durationToleranceMinutes: 0,
      minExercises: 3, minAge: 18, maxAge: null, countSecondaryMuscles: false,
      progression: 'load_only', readaptationSets: 1, maxWeeklyPrimarySets: 18,
      maximumDays: 6, minimumRecoveryHours: 24, loadIncrements: {} };
  }
  function normalize(input) {
    input = input || {}; var student = input.student || {}, gm = student.geradorMensal || {};
    var p = decisionData(clone(gm.perfil || student.profile || {})), t = clone(input.training || {});
    // Identity/gamification never participate in selection or prescribed dose.
    ['gender', 'genero', 'sexo', 'sex', 'xp', 'points', 'pontos', 'gamification'].forEach(function (k) { delete p[k]; });
    p.days = sorted(list(p.days).map(Number)); p.equipment = sorted(p.equipment); p.priorities = sorted(p.priorities);
    p.conditions = list(p.conditions); p.functional = p.functional || { unavailable: [], available: [] };
    p.guidance = p.guidance || {}; p.preferences = p.preferences || { prefer: [], avoid: [] };
    var catalog = input.catalog === undefined ? clone(catalogModule.exercises) : clone(Array.isArray(input.catalog) ? input.catalog : input.catalog.exercises || []);
    catalog.sort(function (a, b) { return String(a.id).localeCompare(String(b.id)); });
    return { studentId: String(student.id || ''), profile: p, sources: decisionData({anamnese:student.anamnese||{},reportedProfile:student.reportedProfile||{},reportedAnamnesis:student.reportedAnamnesis||{},anamnesisReportedAt:student.anamnesisReportedAt||'',notes:student.notes||''}), training: {
      previousFichas: list(t.previousFichas || t.fichas), logs: list(t.logs).map(function(r){if(Array.isArray(r.equipment))r.equipment=r.equipment.join('|');return r;}), plannedSessions: list(t.plannedSessions), schedule:t.schedule||{},
      monthReport: t.monthReport || null, period: t.period || {}, nextPeriod: t.nextPeriod || {},
      manualReview: t.manualReview || null, active: t.active && t.active.id ? {id:String(t.active.id)} : null
    }, assessments: clone(list(input.assessments)), catalog: catalog, config: clone(input.config || gm.config || defaultConfig()) };
  }
  function versions(data) { return { engine: VERSION, rules: RULE_VERSION, catalog: hash(data.catalog), config: String(data.config.version || ''), configHash: hash(data.config) }; }
  function snapshot(input) { var data = normalize(input), v = versions(data); return { hash: hash({ data: data, versions: v }), data: data, versions: v }; }
  function periodContains(date, period) { var d = String(date || '').slice(0, 10); return dateValid(d) && (!period.start || d >= period.start) && (!period.end || d <= period.end); }
  function uniqueRecords(records, issues) {
    var byId = {}, invalid = {};
    list(records).forEach(function (r) {
      if (!r.id) { issues.push(issue('log_id_missing', 'Registro sem identificador não entra na evolução.', 'warning')); return; }
      if (byId[r.id] && stable(byId[r.id]) !== stable(r)) invalid[r.id] = true;
      else byId[r.id] = r;
    });
    Object.keys(invalid).forEach(function (id) { issues.push(issue('log_conflict', 'Registros divergentes com o mesmo identificador foram excluídos: ' + id, 'warning')); });
    return Object.keys(byId).sort().filter(function (id) { return !invalid[id]; }).map(function (id) { return byId[id]; });
  }
  function metrics(input) {
    var d = input && input.studentId !== undefined && input.profile ? input : normalize(input), issues = [], groups = {}, rpe = [], sessionEfforts = {}, work = {};
    var rows = uniqueRecords(d.training.logs, issues).filter(function (r) {
      if (r.completed !== true || !periodContains(r.date, d.training.period)) return false;
      if (!r.exerciseId || !r.sessionId || !finite(r.reps) || !Number.isInteger(Number(r.reps)) || Number(r.reps) <= 0 || Number(r.reps) > 1000 || (r.load != null && (!finite(r.load) || Number(r.load) < 0 || Number(r.load) > 2000))) {
        issues.push(issue('invalid_record', 'Registro incompleto ou impossível não entra no cálculo: ' + r.id, 'warning')); return false;
      }
      return true;
    });
    rows.forEach(function (r) {
      if (finite(r.rpe) && Number(r.rpe) >= 1 && Number(r.rpe) <= 10) rpe.push(Number(r.rpe));
      if (finite(r.sessionEffort) && Number(r.sessionEffort) >= 1 && Number(r.sessionEffort) <= 3) sessionEfforts[r.sessionId] = Number(r.sessionEffort);
      // Missing identity/context metadata is explicitly non-comparable.
      var compatible = r.equipment && r.unit && r.loadBasis && r.variation && r.context && finite(r.load);
      if (!compatible) return;
      var key = stable([r.exerciseId, r.equipment, r.unit, r.loadBasis, r.variation, r.context, Number(r.reps)]);
      var g = groups[key] || (groups[key] = { key: key, exerciseId: r.exerciseId, equipment: r.equipment, unit: r.unit, loadBasis: r.loadBasis, variation: r.variation, context: r.context, reps: Number(r.reps), sessions: {} });
      var session = g.sessions[r.sessionId] || (g.sessions[r.sessionId] = { id: r.sessionId, date: r.date, loads: [], reps: [], rpes: [] });
      session.loads.push(Number(r.load)); session.reps.push(Number(r.reps)); if (finite(r.rpe)) session.rpes.push(Number(r.rpe));
      if (r.unit === 'kg') work[key] = (work[key] || 0) + Number(r.load) * Number(r.reps);
    });
    var exercise = Object.keys(groups).sort().map(function (key) {
      var g = groups[key], sessions = Object.keys(g.sessions).map(function (id) { var s = g.sessions[id], uniform=s.loads.every(function(load){return load===s.loads[0];}); return { id: id, date: s.date, completedSets: s.loads.length, load: uniform?s.loads[0]:null, uniformLoad:uniform, reps: g.reps, rpe: s.rpes.length===s.loads.length ? s.rpes.reduce(function (a,b) { return a+b; },0) / s.rpes.length : null }; }).sort(function (a,b) { return String(a.date).localeCompare(String(b.date)) || a.id.localeCompare(b.id); });
      var first = sessions[0], last = sessions[sessions.length - 1];
      return { key: key, exerciseId: g.exerciseId, equipment: g.equipment, unit: g.unit, loadBasis: g.loadBasis, variation: g.variation, context: g.context,
        reps: g.reps, sessions: sessions, count: sessions.length, baseline: first.load, latest: last.load,
        absoluteChange: sessions.length > 1 && last.load!==null && first.load!==null ? last.load - first.load : null,
        percentChange: sessions.length > 1 && last.load!==null && first.load > 0 ? (last.load - first.load) / first.load * 100 : null,
        externalWork: work[key] === undefined ? null : work[key] };
    });
    var plans = uniqueRecords(d.training.plannedSessions, issues).filter(function (s) { return periodContains(s.date, d.training.period); });
    var eligible = plans.filter(function (s) { return s.eligible !== false && s.status !== 'paused'; });
    var completed = eligible.filter(function (s) { return s.status === 'completed'; });
    var sessionLinks={};plans.forEach(function(s){list(s.sessionIds).forEach(function(id){sessionLinks[id]=s.id;});});
    var knownSessions = {}; rows.forEach(function (r) { knownSessions[sessionLinks[r.sessionId]||r.sessionId] = true; }); completed.forEach(function (s) { knownSessions[s.id] = true; });
    var complete = completed.filter(function (s) { return s.recordsComplete === true; }).length;
    var assessment = [], assessmentGroups = {}, methods={};
    d.assessments.forEach(function (a) {
      Object.keys(a.measurements || {}).forEach(function (name) {
        var m = a.measurements[name]; if (!m || !finite(m.value) || !m.unit || !a.method || !a.context || !dateValid(a.date)) { issues.push(issue('assessment_not_comparable', 'Avaliação sem método, unidade ou contexto comparável.', 'warning')); return; }
        var key = stable([name, a.method, a.context, m.unit]); (assessmentGroups[key] || (assessmentGroups[key] = [])).push({ date: a.date, value: Number(m.value), name: name, method: a.method, unit: m.unit, context: a.context });
        var methodKey=stable([a.method,a.context,m.unit]);(methods[name]||(methods[name]={}))[methodKey]=true;
      });
    });
    Object.keys(assessmentGroups).sort().forEach(function (key) { var arr = assessmentGroups[key].sort(function(a,b){return a.date.localeCompare(b.date);}); if (arr.length > 1) assessment.push({ name: arr[0].name, method: arr[0].method, unit: arr[0].unit, context: arr[0].context, from: arr[0], to: arr[arr.length-1], delta: arr[arr.length-1].value-arr[0].value, interpretation: 'Diferença descritiva; sem ajuste automático da dose.' }); });
    Object.keys(methods).forEach(function(name){if(Object.keys(methods[name]).length>1)issues.push(issue('assessment_method_changed','Método, unidade ou contexto diferentes em '+name+': não comparar entre métodos.','warning'));});
    return { adherence: eligible.length ? completed.length / eligible.length * 100 : null, plannedEligible: eligible.length, completed: completed.length,
      paused: plans.filter(function(s){return s.status==='paused';}).length, missed: eligible.filter(function(s){return s.status==='missed';}).length,
      unknown: eligible.filter(function(s){return s.status!=='completed' && s.status!=='missed';}).length,
      coverage: Object.keys(knownSessions).length ? Math.min(complete,Object.keys(knownSessions).length)/Object.keys(knownSessions).length*100 : null,
      extraSessions: Object.keys(knownSessions).filter(function(id){return !plans.some(function(s){return s.id===id;});}).length,
      completedSets: rows.length, exercises: exercise, effort: { seriesRpe: { scale: 'RPE 1–10', values: rpe }, session: { scale: 'Sessão 1–3', values: Object.keys(sessionEfforts).sort().map(function(k){return sessionEfforts[k];}) } }, assessments: assessment, issues: issues };
  }
  function catalogValid(ex) { return !!(ex && ex.id && ex.nome && ex.grupo && ex.pattern && Array.isArray(ex.equipment) && Array.isArray(ex.requirements) && Array.isArray(ex.primaryMuscles) && ex.primaryMuscles.length && ex.unit && ex.loadBasis && ex.variation && finite(ex.complexity) && ex.metadata && ex.metadata.reviewed === true && ex.metadata.author && dateValid(ex.metadata.date)); }
  function clinical(p) { return p.healthStatus === 'reported' || p.conditions.length > 0 || list(p.functional.unavailable).length > 0 || !!(p.physiology && (p.physiology.pregnant || p.physiology.postpartum || p.physiology.requiresProtocol)); }
  function configIssues(c, p) {
    var issues = []; if (c.approved !== true || !String(c.author || '').trim() || !dateValid(c.date) || !c.version) issues.push(issue('config_not_approved', 'O personal precisa revisar e aprovar os parâmetros com nome, data e versão.', 'error', 'config'));
    var bounds = { minComparableSessions:[2,100], maxLoadIncreasePct:[0,20], loadIncrementKg:[0.01,100], warmupMinutes:[0,60], transitionSeconds:[0,600], secondsPerRep:[1,20], durationToleranceMinutes:[0,10], minExercises:[1,16], readaptationSets:[1,8], maxWeeklyPrimarySets:[1,50], maximumDays:[1,7], minimumRecoveryHours:[0,168], minAge:[18,100] };
    Object.keys(bounds).forEach(function(k){ if(!finite(c[k]) || Number(c[k])<bounds[k][0] || Number(c[k])>bounds[k][1]) issues.push(issue('config_invalid', 'Parâmetro inválido: '+k, 'error', 'config.'+k)); });
    Object.keys(c.loadIncrements||{}).forEach(function(id){if(!finite(c.loadIncrements[id])||Number(c.loadIncrements[id])<=0||Number(c.loadIncrements[id])>100)issues.push(issue('increment_invalid','Informe um degrau de carga válido para '+id+'.','error','config.loadIncrements'));});
    if(c.countSecondaryMuscles!==false || c.progression!=='load_only') issues.push(issue('config_unsupported','Este protocolo contabiliza somente o músculo primário e progride apenas carga.','error','config'));
    var dose = ((c.doses || {})[p.objective] || {})[p.level];
    if (!dose || !Number.isInteger(dose.sets) || dose.sets<1 || dose.sets>8 || !Number.isInteger(dose.repsMin) || !Number.isInteger(dose.repsMax) || dose.repsMin<1 || dose.repsMax<dose.repsMin || dose.repsMax>50 || !finite(dose.restSeconds) || dose.restSeconds<0 || dose.restSeconds>600 || !finite(dose.targetRpeMin) || !finite(dose.targetRpeMax) || dose.targetRpeMin<1 || dose.targetRpeMax>10 || dose.targetRpeMin>dose.targetRpeMax || !Number.isInteger(dose.maxExercises) || dose.maxExercises<c.minExercises || dose.maxExercises>16) issues.push(issue('dose_invalid','Revise séries, repetições, descanso, esforço e quantidade de exercícios para este objetivo e nível.','error','config.doses'));
    return issues;
  }
  function prepare(input) {
    var snap = snapshot(input), d = snap.data, p = d.profile, issues = [], c = d.config, t = d.training;
    if (!d.studentId) issues.push(issue('student_missing','Escolha o aluno.'));
    if (!finite(p.age) || p.age<c.minAge || (c.maxAge!=null && p.age>c.maxAge)) issues.push(issue('age_outside_scope','Idade ausente ou fora da população deste protocolo. Conduza o planejamento individual manual.','error','age'));
    if (!OBJECTIVES[p.objective]) issues.push(issue('objective_missing','Confirme um dos cinco objetivos principais.','error','objective'));
    if (p.secondaryObjective && (!OBJECTIVES[p.secondaryObjective] || p.secondaryObjective===p.objective)) issues.push(issue('secondary_objective_invalid','O objetivo secundário deve ser diferente do principal.','error','secondaryObjective'));
    if (!LEVELS[p.level]) issues.push(issue('level_missing','Confirme o nível atual na musculação.','error','level'));
    if (!dateValid(p.reviewedAt)) issues.push(issue('profile_unreviewed','A anamnese e o nível precisam de revisão inicial datada.','error','reviewedAt'));
    if (p.healthStatus!=='none' && p.healthStatus!=='reported') issues.push(issue('health_unknown','Confirme a situação de saúde; ausência de resposta não significa ausência de condição.','error','healthStatus'));
    if (!p.days.length || p.days.length>c.maximumDays || p.days.some(function(day){return !Number.isInteger(day)||day<0||day>6;}) || new Set(p.days).size!==p.days.length) issues.push(issue('schedule_invalid','Escolha dias distintos da semana dentro do limite aprovado.','error','days'));
    if (!finite(p.minutes) || p.minutes<=c.warmupMinutes || p.minutes>240) issues.push(issue('duration_invalid','Informe uma duração viável para as sessões.','error','minutes'));
    if (!dateValid(t.nextPeriod.start) || !dateValid(t.nextPeriod.end) || t.nextPeriod.end<t.nextPeriod.start || Date.parse(t.nextPeriod.end)-Date.parse(t.nextPeriod.start)>62*86400000) issues.push(issue('period_invalid','Defina início e fim da próxima etapa mensal (até 62 dias).','error','nextPeriod'));
    var extraordinary=t.manualReview&&t.manualReview.extraordinaryConfirmed===true;
    var initialAdoption=t.manualReview&&t.manualReview.initialAdoptionConfirmed===true;
    if(initialAdoption&&(!t.previousFichas.length||(t.active&&t.active.id)||extraordinary))issues.push(issue('initial_adoption_unavailable','A adoção inicial vale somente para fichas legadas sem etapa mensal ativa e não pode ser combinada com revisão extraordinária.','error','manualReview.initialAdoptionConfirmed'));
    if(extraordinary&&(!t.previousFichas.length||!String(t.manualReview.extraordinaryReason||'').trim()))issues.push(issue('extraordinary_reason','A revisão extraordinária exige uma etapa anterior e um motivo explícito.','error','manualReview.extraordinaryReason'));
    if (t.previousFichas.length && (!dateValid(t.period.start)||!dateValid(t.period.end)||t.period.end<t.period.start||t.nextPeriod.start<t.period.end||(t.nextPeriod.start===t.period.end&&!extraordinary))) issues.push(issue('previous_period_invalid','Confirme o período concluído e inicie a próxima etapa depois dele. A mesma data exige revisão extraordinária explícita.','error','period'));
    if (t.previousFichas.length && !initialAdoption && (!t.monthReport || !dateValid(t.monthReport.reportedAt))) issues.push(issue('month_report_missing','Registre o fechamento mensal informado pelo aluno.','error','monthReport'));
    if(p.pendingHealthReview || (t.monthReport&&t.monthReport.pendingHealthReview))issues.push(issue('health_report_pending','Há um relato novo de saúde ainda não revisado. Registre a revisão e atualize as orientações antes de gerar.','error','guidance'));
    if (t.monthReport && (t.monthReport.newSymptoms || t.monthReport.newLimitation || t.monthReport.healthChanged) && !(p.guidance.reviewed && dateValid(p.guidance.date) && String(p.guidance.date).slice(0,10)>=String(t.monthReport.reportedAt).slice(0,10))) issues.push(issue('new_health_report','Um novo relato de saúde requer orientação atualizada e revisão antes da geração.','error','guidance'));
    if (clinical(p)) {
      var g = p.guidance;
      if (!g.reviewed || !String(g.author||'').trim() || !dateValid(g.date) || !String(g.scope||'').trim() || !list(g.allowedExerciseIds).length) issues.push(issue('clinical_guidance_missing','Este perfil exige orientação individual com responsável, data, escopo e exercícios explicitamente autorizados. A seleção clínica é manual assistida.','error','guidance'));
      if (g.expiresAt && g.expiresAt<t.nextPeriod.end) issues.push(issue('guidance_expired','A orientação não cobre toda a próxima etapa; solicite revisão.','error','guidance'));
    }
    var limitBounds={maxLoadKg:[0,2000],maxSets:[1,8],maxReps:[1,50],minRestSeconds:[0,600]};
    Object.keys(p.guidance.limits||{}).forEach(function(k){var value=p.guidance.limits[k],b=limitBounds[k];if(!b||!finite(value)||Number(value)<b[0]||Number(value)>b[1]||((k==='maxSets'||k==='maxReps')&&!Number.isInteger(Number(value))))issues.push(issue('guidance_limit_invalid','Limite individual ausente, inválido ou não suportado: '+k+'. Revise a orientação antes de gerar.','error','guidance.limits'));});
    if(p.guidance.expiresAt&&!dateValid(p.guidance.expiresAt))issues.push(issue('guidance_expiry_invalid','Confira a data de validade da orientação.','error','guidance'));
    if(list(p.functional.available).some(function(r){return list(p.functional.unavailable).indexOf(r)>=0;}))issues.push(issue('functional_conflict','Uma capacidade está marcada como disponível e indisponível. Resolva o conflito com a avaliação atual.','error','functional'));
    if (p.returning && !(t.manualReview && t.manualReview.readaptationConfirmed===true)) issues.push(issue('readaptation_missing','Confirme a readaptação atual no fechamento. A experiência histórica permanece.','error','returning'));
    var catalogIds = {};
    d.catalog.forEach(function(ex){if(catalogIds[ex.id])issues.push(issue('duplicate_catalog_id','O catálogo contém identificadores repetidos.'));catalogIds[ex.id]=true;});
    if (!d.catalog.some(catalogValid)) issues.push(issue('catalog_missing','Não há exercícios com metadados funcionais revisados.'));
    if (d.catalog.some(function(ex){return !catalogValid(ex);})) issues.push(issue('catalog_unreviewed','Exercícios sem metadados revisados não participam da seleção.','warning'));
    var patterns={},requirements={};d.catalog.filter(catalogValid).forEach(function(ex){patterns[ex.pattern]=true;ex.requirements.forEach(function(r){requirements[r]=true;});});
    if(list(p.guidance.allowedExerciseIds).concat(list(p.guidance.blockedExerciseIds)).some(function(id){return !catalogIds[id];}))issues.push(issue('guidance_unknown_exercise','Uma orientação referencia exercício ausente do catálogo atual. Revise a seleção específica.','error','guidance'));
    if(list(p.guidance.blockedPatterns).some(function(pattern){return !patterns[pattern];})||list(p.functional.unavailable).some(function(req){return !requirements[req];}))issues.push(issue('functional_unknown','Uma restrição funcional não possui correspondência no catálogo atual; precisa de revisão.','error','functional'));
    issues = issues.concat(configIssues(c,p));
    var met = metrics(d); issues = issues.concat(met.issues);
    if (p.secondaryObjective) issues.push(issue('secondary_scope','O objetivo secundário orienta a revisão do personal; esta etapa usa a dose do objetivo principal.','info'));
    if (p.objective==='condicionamento'||p.objective==='saude'||p.objective==='emagrecimento') issues.push(issue('resistance_component','A proposta cobre o componente de força. Condicionamento aeróbio, mobilidade e equilíbrio devem ser planejados pelo personal quando indicados.','info'));
    return { ok: !issues.some(function(i){return i.severity==='error';}), snapshot: snap, metrics: met, issues: issues, profile: p, parameters: clone(PARAMETERS) };
  }
  function validationContent(v) { var out=clone(v); delete out.id; delete out.integrity; return out; }
  function validate(input, decision) {
    var prep=prepare(input), o=decision||{}, issues=prep.issues.slice();
    if (!String(o.author||'').trim() || !dateValid(o.at)) issues.push(issue('validation_author','Identifique o personal e a data da validação.'));
    if (o.status!=='confirmed' && o.status!=='corrected') issues.push(issue('validation_incomplete','Dados insuficientes permanecem pendentes; não autorizam nova etapa.'));
    if (o.status==='corrected' && !String(o.notes||'').trim()) issues.push(issue('correction_reason','Registre o motivo da correção; preserve o relato original.'));
    if (clinical(prep.profile) && o.clinicalReviewed!==true) issues.push(issue('clinical_review','Confirme a revisão das orientações individuais, sem inferir cura.'));
    if(prep.snapshot.data.training.manualReview&&prep.snapshot.data.training.manualReview.extraordinaryConfirmed===true&&o.clinicalReviewed!==true)issues.push(issue('extraordinary_review','A revisão extraordinária exige confirmação explícita das condições e orientações atuais.'));
    var initialAdoption=prep.snapshot.data.training.manualReview&&prep.snapshot.data.training.manualReview.initialAdoptionConfirmed===true;
    if(initialAdoption&&!String(o.notes||'').trim())issues.push(issue('initial_adoption_reason','Registre a revisão inicial das fichas legadas e o motivo da adoção. O histórico sem fechamento não autoriza progressão.'));
    if (issues.some(function(i){return i.severity==='error';})) return {ok:false,validation:null,issues:issues};
    var v={snapshotHash:prep.snapshot.hash,snapshot:prep.snapshot,author:String(o.author).trim(),at:o.at,status:o.status,notes:o.notes||'',techniqueConfirmed:o.techniqueConfirmed===true,effortConfirmed:o.effortConfirmed===true,targetMet:o.targetMet===true,clinicalReviewed:o.clinicalReviewed===true,initialAdoption:initialAdoption?{author:String(o.author).trim(),at:o.at,reason:String(o.notes).trim()}:null};
    v.integrity=hash(validationContent(v));v.id='gm-validation-'+v.integrity;
    return {ok:true,validation:v,issues:issues};
  }
  function validValidation(v,snap){return !!(v && v.snapshotHash===snap.hash && v.snapshot && v.snapshot.hash===snap.hash && hash({data:v.snapshot.data,versions:v.snapshot.versions})===snap.hash && v.integrity===hash(validationContent(v)) && v.id==='gm-validation-'+v.integrity && (v.status==='confirmed'||v.status==='corrected') && v.author && dateValid(v.at));}
  function compatible(ex,p){
    if(!catalogValid(ex))return false;
    var g=p.guidance||{}, unavailable=list(p.functional.unavailable);
    if (ex.equipment.some(function(eq){return p.equipment.indexOf(eq)<0;})) return false;
    if (ex.requirements.some(function(r){return unavailable.indexOf(r)>=0;})) return false;
    if (list(g.blockedExerciseIds).indexOf(ex.id)>=0 || list(g.blockedPatterns).indexOf(ex.pattern)>=0) return false;
    if ((clinical(p)||list(g.allowedExerciseIds).length) && list(g.allowedExerciseIds).indexOf(ex.id)<0) return false;
    if (list(p.preferences.avoid).indexOf(ex.id)>=0) return false;
    if (ex.complexity > ({iniciante:1,intermediario:2,avancado:3}[p.level]||1)) return false;
    return true;
  }
  function previousItems(d){var all={};d.training.previousFichas.forEach(function(f){list(f.itens).forEach(function(it){if(!all[it.exId])all[it.exId]=it;});});return all;}
  function executionContext(ex,p){var g=p.guidance||{};return {id:'gm-context-'+hash({exercise:ex.id,version:ex.version||'1',equipment:ex.equipment,position:ex.position,range:ex.range,requirements:ex.requirements,guidance:{scope:g.scope||'',executionNotes:g.executionNotes||'',limits:g.limits||{}},functional:p.functional||{}}),source:'prescribed_configuration',reviewRequired:true};}
  function estimatedMinutes(items,c){return Math.round((c.warmupMinutes*60+items.reduce(function(n,it){return n+it.series*Number(it.reps)*c.secondsPerRep+Math.max(0,it.series-1)*it.descanso+c.transitionSeconds;},0))/6)/10;}
  function proposalContent(p){var copy=clone(p);delete copy.contentHash;return copy;}
  function generate(input,validation){
    var prep=prepare(input),d=prep.snapshot.data,p=d.profile,c=d.config,issues=prep.issues.slice(),notes=[];
    if(!validValidation(validation,prep.snapshot))issues.push(issue('validation_stale','Confirme os dados atuais antes de gerar. A validação mudou ou está desatualizada.'));
    if(issues.some(function(i){return i.severity==='error';}))return{ok:false,proposal:null,issues:issues};
    var candidates=d.catalog.filter(function(ex){return compatible(ex,p);});
    if(!candidates.length)return{ok:false,proposal:null,issues:issues.concat(issue('no_compatible_exercise','Nenhum exercício satisfaz simultaneamente as orientações, a capacidade e os equipamentos. Complete o catálogo ou conduza a prescrição manual.'))};
    var dose=c.doses[p.objective][p.level],previous=previousItems(d),weekly={},used={},fichas=[],justifications=[],limits=p.guidance.limits||{};
    var extraordinary=d.training.manualReview&&d.training.manualReview.extraordinaryConfirmed===true;
    var initialAdoption=d.training.manualReview&&d.training.manualReview.initialAdoptionConfirmed===true;
    var progressAllowed=d.training.previousFichas.length>0 && validation.techniqueConfirmed && validation.effortConfirmed && validation.targetMet && !p.returning && !extraordinary && !initialAdoption;
    var sets=Math.min(dose.sets,p.returning?c.readaptationSets:dose.sets,finite(limits.maxSets)?Number(limits.maxSets):dose.sets);
    var rest=Math.max(dose.restSeconds,finite(limits.minRestSeconds)?Number(limits.minRestSeconds):dose.restSeconds);
    var reps=Math.min(dose.repsMax,finite(limits.maxReps)?Number(limits.maxReps):dose.repsMax);
    if(sets<1||reps<dose.repsMin)return{ok:false,proposal:null,issues:issues.concat(issue('conflicting_dose','As orientações de dose conflitam com o protocolo aprovado. Revise os limites individualmente.'))};
    var basePatterns=['knee','hip','push','pull','core','shoulder','arm_flexion','arm_extension','calf'];
    p.days.forEach(function(day,di){
      var items=[],patternUsed={},patternOrder=basePatterns.slice();
      if(p.days.length>=4){var upper=di%2===0;patternOrder=upper?['push','pull','shoulder','arm_flexion','arm_extension','core']:['knee','hip','calf','core'];}
      // Priorities order compatible movements but never remove all other groups.
      patternOrder.sort(function(a,b){var pa=candidates.some(function(ex){return ex.pattern===a&&ex.primaryMuscles.some(function(m){return p.priorities.indexOf(m)>=0;});})?0:1;var pb=candidates.some(function(ex){return ex.pattern===b&&ex.primaryMuscles.some(function(m){return p.priorities.indexOf(m)>=0;});})?0:1;return pa-pb||basePatterns.indexOf(a)-basePatterns.indexOf(b);});
      patternOrder.forEach(function(pattern){
        if(items.length>=dose.maxExercises)return;
        var choices=candidates.filter(function(ex){return ex.pattern===pattern && ex.primaryMuscles.every(function(m){return (weekly[m]||0)+sets<=c.maxWeeklyPrimarySets;});});
        choices.sort(function(a,b){function rank(ex){return (previous[ex.id]?-100:0)+(list(p.preferences.prefer).indexOf(ex.id)>=0?-20:0)+(used[ex.id]||0)*2+ex.complexity;}return rank(a)-rank(b)||a.id.localeCompare(b.id);});
        if(!choices.length)return;
        var ex=choices[0],old=previous[ex.id],load=null,action='initial',why='Dose inicial revisada; avaliar a carga individualmente.',evolution=null,context=executionContext(ex,p);
        var itemSets=sets,itemReps=reps,itemRest=rest;
        if(old&&!p.returning){
          if(Number.isInteger(old.series)&&old.series>=1&&old.series<=sets)itemSets=old.series;
          if(finite(old.reps)&&Number.isInteger(Number(old.reps))&&Number(old.reps)>=dose.repsMin&&Number(old.reps)<=reps)itemReps=Number(old.reps);
          if(finite(old.descanso)&&Number(old.descanso)>=rest&&Number(old.descanso)<=600)itemRest=Number(old.descanso);
        }
        var exact=prep.metrics.exercises.filter(function(m){return m.exerciseId===ex.id && m.unit===ex.unit && m.loadBasis===ex.loadBasis && m.variation===ex.variation && m.equipment===ex.equipment.join('|') && stable(m.context)===stable(context);}).sort(function(a,b){return b.count-a.count||a.key.localeCompare(b.key);})[0];
        if(old){action='maintain';why='Continuidade do exercício; a carga exige contexto comparável.';}
        if(exact && exact.unit==='kg' && exact.latest!==null){
          load=exact.latest;why='Mantida a carga das séries comparáveis mais recentes, para conferência do personal.';
          // Progress only when EVERY compared session attained target with a full dose.
          var consistent=exact.count>=c.minComparableSessions && exact.reps>=dose.repsMax && exact.sessions.every(function(s){return s.uniformLoad && s.completedSets>=itemSets && s.rpe!==null && s.rpe>=dose.targetRpeMin && s.rpe<=dose.targetRpeMax;});
          if(progressAllowed && consistent && load>0){var step=num((c.loadIncrements||{})[ex.id]);if(step===null)step=num(ex.incrementKg);if(step===null)step=Number(c.loadIncrementKg);var pct=step/load*100;
            if(step>0 && pct<=c.maxLoadIncreasePct && (!finite(limits.maxLoadKg)||load+step<=Number(limits.maxLoadKg))){evolution={from:load,to:Math.round((load+step)*1000)/1000,increment:step,percent:pct};load=evolution.to;action='progress';why='Meta, execução e esforço confirmados; séries e sessões comparáveis suficientes; incremento dentro do limite aprovado.';}
            else why='Mantida: o menor incremento disponível excede o limite aprovado ou falta um degrau válido.';
          } else if(!consistent) why='Mantida para consolidação: faltam séries, esforço ou sessões comparáveis suficientes para progressão.';
        }
        if(p.returning){load=null;action='readapt';why='Retorno confirmado: dose de readaptação aprovada e nova avaliação da carga.';}
        if(initialAdoption){load=null;action=p.returning?'readapt':'adopt';evolution=null;why='Adoção inicial do gerador com fichas legadas: sem evolução presumida. Avaliar e confirmar a carga individual antes de liberar.';}
        if(finite(limits.maxLoadKg) && load!==null && load>Number(limits.maxLoadKg)){load=null;action='review';why='Carga anterior excede a orientação vigente; avaliar nova carga antes de liberar.';}
        var item={exId:ex.id,nome:ex.nome,series:itemSets,reps:String(itemReps),descanso:itemRest,carga:load,obs:'Esforço orientado: RPE '+dose.targetRpeMin+'–'+dose.targetRpeMax+'. '+why,geradorMensal:{action:action,exerciseVersion:ex.version||'1',unit:ex.unit,loadBasis:ex.loadBasis,variation:ex.variation,equipment:ex.equipment.join('|'),context:context,rules:['R01','R03','R04','R05','R06'],evolution:evolution}};
        if(estimatedMinutes(items.concat(item),c)>Number(p.minutes)+c.durationToleranceMinutes)return;
        items.push(item);patternUsed[pattern]=true;used[ex.id]=(used[ex.id]||0)+1;ex.primaryMuscles.forEach(function(m){weekly[m]=(weekly[m]||0)+itemSets;});
        justifications.push({day:day,exerciseId:ex.id,action:action,message:why,comparison:exact?{sessions:exact.count,reps:exact.reps,unit:exact.unit}:null});
      });
      if(items.length<c.minExercises)issues.push(issue('session_incomplete','Não há combinação de '+c.minExercises+' exercícios compatíveis no tempo disponível para o dia '+day+'. Revise tempo, catálogo ou limites, sem remover restrições.'));
      fichas.push({id:'gm-ficha-'+hash([prep.snapshot.hash,day]),titulo:String.fromCharCode(65+di)+' — '+(p.days.length>=4?(di%2===0?'Membros superiores':'Membros inferiores'):'Corpo todo'),day:day,itens:items,estimatedMinutes:estimatedMinutes(items,c)});
    });
    if(issues.some(function(i){return i.severity==='error';}))return{ok:false,proposal:null,issues:issues};
    // Calendar spacing is surfaced for review; no implicit recovery prescription.
    p.days.forEach(function(day,i){if(p.days.length>1){var next=p.days[(i+1)%p.days.length];var hours=((next-day+7)%7)*24;if(hours<c.minimumRecoveryHours)issues.push(issue('recovery_spacing','A agenda tem intervalo menor que o mínimo aprovado; revise a distribuição.'));}});
    if(issues.some(function(i){return i.severity==='error';}))return{ok:false,proposal:null,issues:issues};
    if(!progressAllowed)notes.push('Nenhuma progressão automática de carga: exige fechamento confirmado, técnica, esforço, meta e registros comparáveis.');
    if(extraordinary)notes.push('Revisão extraordinária da etapa em execução: '+d.training.manualReview.extraordinaryReason+'. Não há progressão automática de carga nesta revisão.');
    if(initialAdoption)notes.push('Primeira adoção do gerador: '+validation.initialAdoption.reason+'. O personal revisou o ponto de partida; a ausência de fechamento legado não cria evolução nem carga automática.');
    if(clinical(p))notes.push('Seleção manual assistida dentro dos exercícios autorizados. As orientações clínicas permanecem vigentes.');
    notes.push('Volume: séries contadas apenas para músculos primários; não estima hipertrofia.','Tempo estimado inclui execução, descansos, preparação e transição; tolerância '+c.durationToleranceMinutes+' min.','XP e gênero não participam da dose.');
    var proposal={id:'gm-proposal-'+hash([prep.snapshot.hash,validation.id]),studentId:d.studentId,snapshotHash:prep.snapshot.hash,validationId:validation.id,period:clone(d.training.nextPeriod),status:'proposal_generated',versions:prep.snapshot.versions,fichas:fichas,
      exercises:clone(d.catalog.filter(function(ex){return !!used[ex.id];})),justifications:justifications,notes:notes,metrics:prep.metrics,weeklyPrimarySets:weekly,issues:issues,parameters:clone(PARAMETERS),scope:c.scope,initialAdoption:clone(validation.initialAdoption||null),extraordinary:extraordinary?{reason:d.training.manualReview.extraordinaryReason,author:validation.author,at:validation.at}:null,ruleReview:{author:c.author,date:c.date,scope:c.scope,clinicallyValidated:false},evidence:clone(EVIDENCE),
      followUp:['Registrar séries realmente executadas, carga, repetições e esforço na escala indicada.','Relatar dificuldades e novas limitações assim que surgirem.','Revisar a evolução e as avaliações no próximo fechamento.']};
    proposal.contentHash=hash(proposalContent(proposal));return{ok:true,proposal:proposal,issues:issues};
  }
  function checkProposal(input,proposal,validation){
    var prep=prepare(input),issues=prep.issues.filter(function(i){return i.severity==='error';});
    if(!proposal||proposal.studentId!==prep.snapshot.data.studentId||proposal.snapshotHash!==prep.snapshot.hash)issues.push(issue('proposal_stale','Anamnese, evolução, treino, catálogo ou parâmetros mudaram. Valide os dados e gere outra proposta.'));
    if(!validValidation(validation,prep.snapshot)||!proposal||proposal.validationId!==validation.id)issues.push(issue('validation_stale','A validação desta proposta não corresponde aos dados atuais.'));
    if(proposal&&proposal.contentHash!==hash(proposalContent(proposal)))issues.push(issue('proposal_changed','A proposta foi alterada após a geração. Registre a revisão profissional e revalide antes de aplicar.'));
    return{ok:!issues.length,issues:issues};
  }
  function reviseProposal(input,proposal,validation,patches,review){
    var check=checkProposal(input,proposal,validation),issues=check.issues.slice(),r=review||{};
    if(!String(r.author||'').trim()||!dateValid(r.at)||!String(r.reason||'').trim())issues.push(issue('review_identity','Informe responsável, data e motivo dos ajustes.'));
    if(!Array.isArray(patches)||!patches.length)issues.push(issue('review_empty','Informe os ajustes para revisar a proposta.'));
    if(issues.length)return{ok:false,proposal:null,issues:issues};
    var d=normalize(input),p=d.profile,c=d.config,next=clone(proposal),dose=c.doses[p.objective][p.level],limits=p.guidance.limits||{},weekly={},used={};
    patches.forEach(function(patch){
      var f=next.fichas.find(function(x){return x.id===patch.fichaId;}),index=patch.itemIndex;
      if(!f||!Number.isInteger(index)||!f.itens[index]){issues.push(issue('review_target','O exercício revisado não pertence à proposta atual.'));return;}
      var it=f.itens[index],changes=patch.changes||{};
      if(Object.keys(changes).some(function(k){return ['exId','series','reps','descanso','carga'].indexOf(k)<0;})){issues.push(issue('review_field','A revisão contém um campo não permitido.'));return;}
      var baseLoad=it.geradorMensal.evolution?num(it.geradorMensal.evolution.from):num(it.carga);
      if((!changes.exId||changes.exId===it.exId)&&baseLoad!==null&&baseLoad>0&&num(changes.carga)!==null&&Number(changes.carga)>baseLoad*(1+c.maxLoadIncreasePct/100)+0.000001)issues.push(issue('review_increment','O aumento de carga ultrapassa o limite aprovado. Revise o protocolo e gere novamente.'));
      if(changes.exId && changes.exId!==it.exId){
        var ex=d.catalog.find(function(x){return x.id===changes.exId;});
        if(!ex||!compatible(ex,p)){issues.push(issue('replacement_incompatible','A substituição não satisfaz todas as restrições atuais.'));return;}
        it.exId=ex.id;it.nome=ex.nome;it.carga=null;it.geradorMensal={action:'replace',exerciseVersion:ex.version||'1',unit:ex.unit,loadBasis:ex.loadBasis,variation:ex.variation,equipment:ex.equipment.join('|'),context:executionContext(ex,p),rules:['R01','R08'],evolution:null};
      }
      ['series','reps','descanso','carga'].forEach(function(k){if(Object.prototype.hasOwnProperty.call(changes,k))it[k]=k==='carga'&&changes[k]===null?null:num(changes[k]);});
      it.geradorMensal.reviewedBy=r.author;it.geradorMensal.reviewedAt=r.at;
      it.obs='Revisão do personal: '+r.reason+'. Esforço orientado: RPE '+dose.targetRpeMin+'–'+dose.targetRpeMax+'.';
    });
    next.fichas.forEach(function(f){
      f.itens.forEach(function(it){
        var ex=d.catalog.find(function(x){return x.id===it.exId;});
        if(!ex||!compatible(ex,p)){issues.push(issue('review_incompatible','A ficha contém exercício incompatível.'));return;}
        var maxSets=Math.min(dose.sets,p.returning?c.readaptationSets:dose.sets,finite(limits.maxSets)?Number(limits.maxSets):dose.sets),maxReps=Math.min(dose.repsMax,finite(limits.maxReps)?Number(limits.maxReps):dose.repsMax),minRest=Math.max(dose.restSeconds,finite(limits.minRestSeconds)?Number(limits.minRestSeconds):0);
        if(!Number.isInteger(it.series)||it.series<1||it.series>maxSets||!finite(it.reps)||Number(it.reps)<dose.repsMin||Number(it.reps)>maxReps||!Number.isInteger(Number(it.reps))||!finite(it.descanso)||it.descanso<minRest||it.descanso>600|| (it.carga!==null&&(!finite(it.carga)||it.carga<0||it.carga>2000||(finite(limits.maxLoadKg)&&it.carga>Number(limits.maxLoadKg)))))issues.push(issue('review_dose','Um ajuste ultrapassa a dose ou orientação aprovada. Revise o protocolo e gere novamente para ampliar os limites.'));
        if(ex.unit!=='kg'&&it.carga!==null)issues.push(issue('review_load_unit','Este exercício não usa carga externa em kg neste protocolo.'));
        it.reps=String(it.reps);used[ex.id]=true;ex.primaryMuscles.forEach(function(m){weekly[m]=(weekly[m]||0)+it.series;});
      });
      f.estimatedMinutes=estimatedMinutes(f.itens,c);if(f.estimatedMinutes>p.minutes+c.durationToleranceMinutes)issues.push(issue('review_duration','A revisão ultrapassa o tempo aprovado para a sessão.'));
    });
    if(Object.keys(weekly).some(function(m){return weekly[m]>c.maxWeeklyPrimarySets;}))issues.push(issue('review_volume','A revisão ultrapassa o volume semanal aprovado.'));
    if(issues.length)return{ok:false,proposal:null,issues:issues};
    next.exercises=clone(d.catalog.filter(function(ex){return used[ex.id];}));next.weeklyPrimarySets=weekly;
    next.revisions=list(next.revisions).concat([{author:r.author,at:r.at,reason:r.reason,previousContentHash:proposal.contentHash,patches:clone(patches)}]);
    next.justifications.push({action:'professional_revision',message:r.reason,author:r.author,at:r.at});next.contentHash=hash(proposalContent(next));
    return{ok:true,proposal:next,issues:next.issues||[]};
  }
  return{VERSION:VERSION,RULE_VERSION:RULE_VERSION,OBJECTIVES:OBJECTIVES,LEVELS:LEVELS,EVIDENCE:EVIDENCE,PARAMETERS:PARAMETERS,defaultConfig:defaultConfig,prepare:prepare,snapshot:snapshot,validate:validate,generate:generate,checkProposal:checkProposal,reviseProposal:reviseProposal,metrics:metrics,hash:hash,catalogValid:catalogValid};
}));
