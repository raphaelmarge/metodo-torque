/* Adaptador real; clientes, relógio, DOM e storage isolados. Sem rede/banco. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const rootPath = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(rootPath, 'assets/personal-pro-context.js'), 'utf8');
const builder = fs.readFileSync(path.join(rootPath, 'app/aluno-builder.js'), 'utf8');
const demoSource = fs.readFileSync(path.join(rootPath, 'assets/demo-central-pro-data.js'), 'utf8');
const suiteSource = fs.readFileSync(path.join(rootPath, 'assets/personal-pro-suite.js'), 'utf8');
const A = 'account-a', B = 'account-b', U = 'user-a', TOKEN = 'student-token-alpha';
const clone = x => x == null ? x : JSON.parse(JSON.stringify(x));
let checks = 0;
function eq(actual, expected, message) { assert.deepEqual(clone(actual), clone(expected), message); checks++; }
function ok(value, message) { assert.ok(value, message); checks++; }
const state = {
  alunos: [{ id: 'a1', nome: 'Ana Teste', zap: '5500000000000', objetivo: 'Objetivo de teste', appTokenP: TOKEN,
    retorno: { cargas: { Supino: [{ d: '2026-09-25', kg: 35, g: 2, feito: true }] } } }, { id: 'a2', nome: 'Bruno Teste', ativo: false }],
  exercicios: [{ id: 'ex1', nome: 'Supino' }, { id: 'ex2', nome: 'Prancha' }],
  treinosV2: { a1: { fichas: [{ id: 'f1', titulo: 'A · Superior', itens: [
    { exId: 'ex1', series: 3, reps: '10', descanso: 60, carga: 20, seriesDetalhadas: [{ reps: '5', carga: 30, descanso: 90 }, { reps: '8', carga: null, descanso: 0 }, { reps: '10', carga: 25, descanso: 75 }] },
    { exId: 'ex2', series: 2, reps: '30s', descanso: 0, carga: 0 },
  ] }], plano: { datas: { '2026-09-30': [{ tp: 'ficha', id: 'f1' }] } } } },
  sessoes: [
    { id: 'past', alunoId: 'a1', data: '2026-09-28', hora: '18:00' },
    { id: 'done', alunoId: 'a1', data: '2026-09-29', hora: '11:00', feita: true },
    { id: 'missed', alunoId: 'a1', data: '2026-09-29', hora: '12:00', faltou: true },
    { id: 'canceled', alunoId: 'a1', data: '2026-09-29', hora: '13:00', cancelada: true },
    { id: 'next', alunoId: 'a1', data: '2026-09-30', hora: '07:30' },
    { id: 'other', alunoId: 'a2', data: '2026-09-29', hora: '15:30' },
  ],
  nutricaoV1: { planos: { a1: { titulo: 'Plano alimentar A', ativo: true, inicio: '2026-09-01', fim: '2026-10-01', refeicoes: [] } } },
};

function setup(options = {}) {
  const calls = [], controls = { user: { id: U }, owner: { user_id: U, academia_id: A }, state: clone(options.state || state), cloud: null, localReads: 0, profile: { hidden: false, getAttribute: () => 'a1' }, events: {} };
  const fixedNow = Date.parse('2026-09-29T10:00:00-03:00');
  class FakeDate extends Date { constructor(...args) { super(...(args.length ? args : [fixedNow])); } static now() { return fixedNow; } }
  function defaultResponse(q) {
    if (q.table === 'membros') return { data: [{ academia_id: A, user_id: U, papel: 'dono' }] };
    if (q.table === 'dados') return { data: [{ academia_id: A, chave: 'mtapp:ptStudio', valor: controls.state, atualizado: '2026-09-29T12:00:00Z' }] };
    if (q.table === 'app_aluno') return { data: [{ academia_id: A, token: TOKEN, revogado_em: null, cargas: { Supino: [
      { d: '2026-09-29', kg: 900, g: 2, feito: false }, { d: '2026-09-28', kg: 40, g: 2, feito: true },
      { d: '2026-09-29', kg: null }, { d: '2026-10-01', kg: 950 }, { d: '2026-09-20', kg: 30 },
      { d: '2026-09-31', kg: 920 }, { d: '2026-09-29', kg: true },
    ] } }] };
    if (q.table === 'app_checkin') return { data: [
      { academia_id: B, token: TOKEN, dia: '2026-09-29', nota: 1, texto: 'NÃO DEVE APARECER' },
      { academia_id: A, token: 'another-token', dia: '2026-09-29', nota: 1 },
      { academia_id: A, token: TOKEN, dia: '2026-09-28', nota: 4, texto: 'Retorno fictício do aluno' },
    ] };
    if (q.table === 'rpc:personal_nutricao_resumo') return { data: { ok: true, hoje: '2026-09-29', inicio: '2026-09-23', consultadoEm: '2026-09-29T12:00:00Z', alunos: [{ token: TOKEN, registros7dias: 5 }] } };
    throw new Error('Consulta inesperada: ' + q.table);
  }
  function request(table) {
    const q = { table, filters: [] };
    const query = {};
    for (const method of ['select', 'eq', 'in', 'is', 'lte', 'order', 'limit']) query[method] = (...args) => { q.filters.push([method, ...args]); return query; };
    query.then = (resolve, reject) => {
      calls.push(q);
      return Promise.resolve().then(() => options.respond ? options.respond(q, controls, defaultResponse) : defaultResponse(q)).then(resolve, reject);
    };
    return query;
  }
  const client = { auth: { getSession: async () => ({ data: { session: controls.user ? { user: clone(controls.user) } : null } }), onAuthStateChange: fn => { controls.authEvent = fn; } }, from: request,
    rpc: (name, args) => { const q = { table: 'rpc:' + name, args, filters: [] }; calls.push(q); return Promise.resolve().then(() => options.respond ? options.respond(q, controls, defaultResponse) : defaultResponse(q)); } };
  controls.cloud = options.local ? { client, aid: A } : null;
  const env = { console, URL, Date: FakeDate, Promise, WeakMap, Set, Object, Array, Number, String, JSON,
    location: { href: 'https://example.invalid/personal.html', origin: 'https://example.invalid' },
    document: { getElementById: id => id === 'vPerfil' ? controls.profile : null },
    addEventListener: (name, fn) => { controls.events[name] = fn; },
    localStorage: { getItem: key => key === 'mtsync:identidade' ? JSON.stringify(controls.owner) : null, setItem() { throw Error('Adapter não pode gravar'); } },
    MT_supabase: client, MTStore: { cloud: () => controls.cloud, read: key => { assert.equal(key, 'ptStudio'); controls.localReads++; return clone(controls.state); }, write() { throw Error('Adapter não pode gravar'); } },
  };
  env.window = env; env.self = env;
  const context = vm.createContext(env);
  if (!options.noNormalizer) vm.runInContext(builder, context, { filename: 'aluno-builder.js' });
  vm.runInContext(source, context, { filename: 'personal-pro-context.js' });
  return { api: env.PTProContext, client, controls, env, realm: context, calls, options: { client, context: { academia_id: A, user: { id: U } } } };
}

// Exercita a função real da Central Pro. A consulta fica pendente para que a
// identidade possa mudar antes da primeira atribuição de state.ctx.
async function checkSuiteContextRace(mode) {
  const begin = suiteSource.indexOf('  async function context(){');
  const end = suiteSource.indexOf('  function clearIdentity(){', begin);
  assert.ok(begin >= 0 && end > begin, 'Função context real precisa ser encontrada');
  const controls = { user: { id: U }, host: null, reads: 0, cleared: 0, watched: 0 };
  const suiteState = { ctx: null, epoch: 0 };
  let release, entered;
  const pending = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  const client = {
    auth: { getSession: async () => { controls.reads++; return { data: { session: controls.user ? { user: clone(controls.user) } : null } }; } },
    from(table) {
      assert.equal(table, 'membros');
      const query = { select() { return query; }, eq() { return query; }, limit() { entered(); return pending; } };
      return query;
    },
  };
  controls.host = { client, aid: A };
  const env = { state: suiteState, window: { MT_supabase: client, MTStore: { cloud: () => controls.host && { client: controls.host.client, aid: controls.host.aid } } },
    sb: () => env.window.MT_supabase,
    watchIdentity: watched => { assert.equal(watched, client); controls.watched++; },
    clearIdentity: () => { controls.cleared++; suiteState.epoch++; suiteState.ctx = null; },
  };
  vm.runInNewContext(suiteSource.slice(begin, end), env, { filename: 'personal-pro-suite.js:context' });
  const operation = env.context();
  await started;
  eq(suiteState.ctx, null, mode + ': mudança ocorre antes do primeiro contexto');
  if (mode === 'user') controls.user = { id: 'signed-in-user-b' };
  if (mode === 'workspace') controls.host = { client, aid: B };
  if (mode === 'client') env.window.MT_supabase = { auth: {} };
  if (mode === 'signed-out') controls.user = null;
  if (mode === 'host-removed') controls.host = null;
  release({ data: [{ academia_id: A, user_id: U, papel: 'dono' }] });
  if (mode === 'unchanged') {
    const result = await operation;
    eq(result.user.id, U, 'Identidade estável mantém usuário'); eq(result.academia_id, A, 'Identidade estável mantém workspace');
    eq(suiteState.ctx, result, 'Somente contexto confirmado é publicado'); eq(controls.cleared, 0, 'Leitura estável não limpa a identidade');
  } else {
    await assert.rejects(operation, /A conta mudou durante a consulta/, mode + ': rejeita resposta da identidade anterior'); checks++;
    eq(suiteState.ctx, null, mode + ': contexto antigo nunca é publicado'); eq(controls.cleared, 1, mode + ': invalida a identidade');
  }
  eq(controls.reads, 2, mode + ': reconfirma a sessão depois da consulta pendente');
}

(async () => {
  let t = setup(), before = clone(t.controls.state), result = await t.api.load(t.options), ana = result.students[0];
  eq(result.available, true, 'Conta autenticada carrega dados'); eq(result.source, 'cloud', 'Sem vínculo local usa linha remota autorizada');
  eq(result.students.length, 2, 'Mantém alunos ativos e encerrados'); eq(result.students[1].active, false, 'Estado encerrado explícito');
  eq(ana.workouts[0].exercises[0].sets, [{ reps: '5', load: 30, rest: 90 }, { reps: '8', load: null, rest: 0 }, { reps: '10', load: 25, rest: 75 }], 'Séries individuais e carga nula preservadas');
  eq(ana.workouts[0].exercises[1].sets, [{ reps: '30s', load: 0, rest: 0 }, { reps: '30s', load: 0, rest: 0 }], 'Séries uniformes, tempo, zero e descanso zero preservados');
  eq(ana.workouts[0].exercises[0].lastLoad, 40, 'Última carga concluída, não rascunho/pico/futuro'); eq(ana.workouts[0].exercises[0].lastLoadDate, '2026-09-28', 'Data da última carga verdadeira');
  eq(ana.nextSession, { id: 'next', date: '2026-09-30', time: '07:30', studentName: 'Ana Teste', workoutName: 'A · Superior' }, 'Próxima sessão com ficha explicitamente programada');
  eq(ana.checkin.score, 4, 'Ignora check-in de outro tenant/token'); eq(ana.checkin.details, 'Retorno fictício do aluno', 'Mantém texto real');
  eq(ana.nutrition.records7Days, 5, 'Usa resumo real e leve'); eq(ana.nutrition.pendingReviews, null, 'Não finge saber revisões pendentes');
  eq(ana.photo, '', 'Foto ausente não vira URL da página'); eq(result.students[1].workouts, [], 'Sem ficha não inventa prescrição');
  eq(t.controls.state, before, 'Projeção não altera snapshot');
  ok(!JSON.stringify(result).includes(TOKEN), 'Não expõe tokens na API pública');
  ok(!t.calls.some(c => ['insert', 'update', 'upsert', 'delete'].includes(c.table)), 'Somente consultas');
  for (const call of t.calls.filter(c => !c.table.startsWith('rpc:'))) ok(call.filters.some(f => f[0] === 'eq' && f[1] === 'academia_id' && f[2] === A), call.table + ': filtro de tenant explícito');
  eq(t.controls.localReads, 0, 'Não lê localStorage de alunos sem binding');
  let detail = await t.api.student('a1', t.options); eq(detail.id, 'a1', 'API student retorna detalhe no mesmo contrato');
  eq(await t.api.student('missing', t.options), null, 'ID desconhecido não usa outro aluno');

  t = setup({ local: true }); result = await t.api.load(t.options);
  eq(result.source, 'local', 'Snapshot local autorizado preserva alterações ainda não sincronizadas'); eq(result.selectedStudentId, 'a1', 'Perfil visível e ID explícito selecionado');
  ok(!t.calls.some(c => c.table === 'dados'), 'Não baixa blob quando snapshot local tem proprietário confirmado');
  t.controls.profile.hidden = true; result = await t.api.load(t.options); eq(result.selectedStudentId, '', 'Perfil escondido não contamina seleção');
  t.controls.profile.hidden = false; t.controls.profile.getAttribute = () => 'unknown'; result = await t.api.load(t.options); eq(result.selectedStudentId, '', 'ID de DOM precisa existir no snapshot autorizado');
  t = setup({ local: true }); t.controls.owner.user_id = 'other-user'; result = await t.api.load(t.options);
  eq(result.source, 'cloud', 'Cache de outro usuário é ignorado'); eq(t.controls.localReads, 0, 'Não chega a ler blob de outro usuário');
  t = setup({ local: true }); t.controls.owner.academia_id = B; result = await t.api.load(t.options);
  eq(result.source, 'cloud', 'Cache de outro tenant é ignorado'); eq(t.controls.localReads, 0, 'Não lê alunos do tenant anterior');

  for (const mode of ['signed-out', 'wrong-user', 'wrong-tenant', 'membership-error', 'membership-empty', 'forged-membership']) {
    t = setup({ local: true, respond: (q, c, def) => q.table === 'membros' && mode.startsWith('membership') ? mode === 'membership-error' ? { error: true, data: [{ academia_id: A, user_id: U }] } : { data: [] } : q.table === 'membros' && mode === 'forged-membership' ? { data: [{ academia_id: B, user_id: U }] } : def(q) });
    if (mode === 'signed-out') t.controls.user = null;
    if (mode === 'wrong-user') t.options.context.user.id = 'another-user';
    if (mode === 'wrong-tenant') t.options.context.academia_id = B;
    result = await t.api.load(t.options);
    eq(result.available, false, mode + ': nega carregamento'); eq(result.students, [], mode + ': não devolve dados'); eq(t.controls.localReads, 0, mode + ': não consulta cache de alunos');
    ok(!t.calls.some(c => c.table === 'dados' || c.table === 'app_aluno'), mode + ': não consulta registros');
  }
  t = setup({ respond: (q, c, def) => q.table === 'dados' ? { data: [{ academia_id: B, chave: 'mtapp:ptStudio', valor: c.state }] } : def(q) });
  result = await t.api.load(t.options); eq(result.students, [], 'Linha retornada de outro tenant é descartada');
  t = setup({ respond: (q, c, def) => q.table === 'dados' ? { error: true } : def(q) });
  result = await t.api.load(t.options); eq(result.available, false, 'Falha de leitura não parece lista vazia bem-sucedida');

  for (const change of ['user', 'tenant', 'auth-event', 'binding', 'token']) {
    t = setup({ local: true, respond: (q, c, def) => {
      if (q.table === 'app_aluno') {
        if (change === 'user') c.user = { id: 'another-user' };
        if (change === 'tenant') c.cloud.aid = B;
        if (change === 'auth-event') c.authEvent('SIGNED_OUT');
        if (change === 'binding') c.owner.academia_id = B;
        if (change === 'token') c.state.alunos[0].appTokenP = 'another-token';
      }
      return def(q);
    } });
    result = await t.api.load(t.options); eq(result.available, false, change + ': invalida resposta em voo'); eq(result.students, [], change + ': não mostra dados após troca');
  }
  t = setup({ respond: (q, c, def) => q.table === 'app_aluno' ? { data: [{ academia_id: B, token: TOKEN, cargas: { Supino: [{ d: '2026-09-29', kg: 999 }] } }] } : def(q) });
  result = await t.api.load(t.options); eq(result.students[0].workouts[0].exercises[0].lastLoad, null, 'Token sem acesso confirmado não usa carga alheia nem cache'); eq(result.students[0].checkin.available, false, 'Check-in depende de token vigente da mesma conta');
  t = setup({ respond: (q, c, def) => ['app_aluno', 'app_checkin', 'rpc:personal_nutricao_resumo'].includes(q.table) ? { error: true } : def(q) });
  result = await t.api.load(t.options); eq(result.available, true, 'Falha opcional não remove ficha válida'); eq(result.partial, true, 'Complementos indisponíveis explicitados'); eq(result.students[0].nutrition.records7Days, null, 'Sem consulta, registro alimentar desconhecido'); eq(result.students[0].checkin.available, false, 'Sem consulta não inventa check-in');

  const sparse = clone(state); sparse.alunos[0].fotoAluno = 'javascript:alert(1)'; sparse.treinosV2.a1.fichas[0].itens = [{ exId: 'ex1' }, { exId: 'ex2', series: 1 }];
  t = setup({ state: sparse }); result = await t.api.load(t.options); ana = result.students[0];
  eq(ana.photo, '', 'Rejeita URL executável de foto'); eq(ana.workouts[0].exercises[0].sets, [], 'Sem quantidade não inventa três séries');
  eq(ana.workouts[0].exercises[1].sets, [{ reps: '', load: null, rest: null }], 'Campos de prescrição ausentes continuam vazios');
  t = setup({ noNormalizer: true }); result = await t.api.load(t.options); eq(result.students[0].workouts[0].exercises[0].sets, [], 'Sem normalizador canônico não cria contrato divergente');

  t = setup({ local: true }); let opened = null;
  t.env.PTProPersonal = { selectedStudentId: () => 'a1', openArea: (...args) => { opened = args; return true; } };
  eq(await t.api.openArea('nutricao', 'a1', t.options), true, 'Navegação passa pelo hook explícito após autorização');
  eq(opened, ['nutricao', 'a1', { academia_id: A, userId: U }], 'Hook recebe identidade verificada');
  opened = null; eq(await t.api.openArea('admin', 'a1', t.options), false, 'Área fora da lista não é acionada'); eq(opened, null, 'Não acionou hook não autorizado');
  eq(await t.api.openArea('agenda', 'missing', t.options), false, 'Navegação não escolhe outro aluno');
  t = setup(); t.env.PTProPersonal = { openArea: () => { throw Error('Não deve navegar usando cache sem dono'); } };
  eq(await t.api.openArea('agenda', 'a1', t.options), false, 'Não abre área privada com snapshot remoto e cache local sem vínculo');
  t = setup(); t.env.document.documentElement = { dataset: { demo: 'central-pro' } };
  vm.runInContext(demoSource, t.realm, { filename: 'demo-central-pro-data.js' });
  const fixture = t.env.MT_CENTRAL_PRO_DEMO, demoOptions = { client: fixture.client, context: { academia_id: fixture.context.academia_id, user: { id: fixture.context.userId } } };
  result = await t.api.load(demoOptions);
  eq(result.source, 'demo', 'Rota e cliente de demonstração reconhecidos juntos'); eq(result.students, fixture.context.students, 'Demo usa a fixture real completa');
  eq(result.agenda, fixture.context.agenda, 'Agenda fictícia preservada'); eq(t.calls, [], 'Demo não consulta cliente de produção'); eq(t.controls.localReads, 0, 'Demo não lê cache privado');
  result.students[0].workouts[0].exercises[0].sets[0].load = 999;
  detail = await t.api.student('demo-ana', demoOptions);
  eq(detail.workouts[0].exercises[0].sets[0].load, 20, 'Detalhe devolve cópia independente da prescrição');
  eq(await t.api.student('missing', demoOptions), null, 'ID desconhecido não seleciona outro aluno da demo');
  eq(await t.api.student('', demoOptions), null, 'Aluno vazio não carrega snapshot');
  t.env.PTProPersonal = { openArea: () => { throw Error('Não deve abrir área real a partir da demo'); } };
  eq(await t.api.openArea('agenda', 'demo-ana', demoOptions), false, 'Demo não navega para área privada real');
  result = await t.api.load(t.options); eq(result.available, false, 'Marcador demo não aceita cliente de produção'); eq(t.calls, [], 'Cliente incompatível não dispara consulta');
  result = await t.api.load({ client: fixture.client, context: { academia_id: 'other-tenant' } }); eq(result.available, false, 'Demo rejeita contexto de outro tenant');
  result = await t.api.load({ client: fixture.client, context: { academia_id: fixture.context.academia_id, userId: 'other-user' } }); eq(result.available, false, 'Demo rejeita contexto de outro usuário');
  t.env.document.documentElement.dataset.demo = '';
  result = await t.api.load(t.options); eq(result.source, 'cloud', 'Global de fixture não habilita demo na produção'); eq(result.students[0].id, 'a1', 'Produção usa exclusivamente aluno autorizado');
  t = setup(); t.env.document.documentElement = { dataset: { demo: 'central-pro' } };
  result = await t.api.load(t.options); eq(result.available, false, 'Rota demo sem fixture permanece indisponível'); eq(t.calls, [], 'Rota demo sem fixture não usa fallback real');
  for (const mode of ['unchanged', 'user', 'workspace', 'client', 'signed-out', 'host-removed']) await checkSuiteContextRace(mode);
  console.log(JSON.stringify({ ok: true, checks, suite: 'personal-pro-context', network: 'none' }));
})().catch(error => { console.error(error); process.exitCode = 1; });
