/* Execute the real session handlers with the real in-memory demo adapter.
 * Presentation is stubbed; storage, network and production data are never used. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const suite = fs.readFileSync(path.join(root, 'assets/personal-pro-suite.js'), 'utf8');
const demo = fs.readFileSync(path.join(root, 'assets/demo-central-pro-data.js'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
let checks = 0;
function eq(actual, expected, label) { assert.deepEqual(clone(actual), clone(expected), label); checks++; }
function ok(value, label) { assert.ok(value, label); checks++; }
const exercises = [{ id: 'exercise-1', sourceId: 'supino', name: 'Supino', sets: [
  { id: 'set-1', reps: '5', load: '20', rest: 60, done: false },
  { id: 'set-2', reps: '8', load: '18', rest: 60, done: false }
] }];

function setup() {
  const fields = new Map();
  const offline = new Map([
    ['ptflow:sessao:v1', JSON.stringify({ localId: 'offline-active', alunoId: 'demo-ana', serverId: 'flow-active', sets: [{ exercicio: 'Remada', reps: '8', carga: '35', rpe: '2' }] })],
    ['ptflow:fila:v1', JSON.stringify([{ localId: 'offline-queued', alunoId: 'demo-ana', finishedAt: '2026-09-29T15:00:00Z', sets: [{ exercicio: 'Agachamento', reps: '10', carga: '40', rpe: '3' }] }])]
  ]);
  const storageBefore = [...offline];
  const calls = [];
  let storageReads = 0, storageWrites = 0;
  function field(selector) {
    if (!fields.has(selector)) fields.set(selector, { value: '', textContent: '', className: '', disabled: false, options: [], selectedOptions: [], appendChild(option) { this.options.push(option); } });
    return fields.get(selector);
  }
  field('#ptProWorkout').value = 'ficha-a';
  field('#ptProWorkout').options = [{ value: 'ficha-a', textContent: 'A · Superior' }];
  field('#ptProWorkout').selectedOptions = field('#ptProWorkout').options;
  const realm = vm.createContext({
    console, URL, setTimeout, clearTimeout,
    document: { documentElement: { dataset: { demo: 'central-pro' } }, querySelector: field, querySelectorAll: () => [] },
    location: { href: 'http://127.0.0.1/demo-central-pro.html', origin: 'http://127.0.0.1' },
    localStorage: {
      getItem(key) { storageReads++; return offline.get(key) || null; },
      setItem(key, value) { storageWrites++; offline.set(key, value); },
      removeItem(key) { storageWrites++; offline.delete(key); }
    },
    fetch() { throw new Error('A sessão não pode acessar rede no teste.'); },
    Option: function (label, value) { this.textContent = label; this.value = value; }
  });
  realm.window = realm;
  vm.runInContext(demo, realm, { filename: 'assets/demo-central-pro-data.js' });
  const demoClient = realm.MT_CENTRAL_PRO_DEMO.client;
  realm.MT_supabase = { auth: demoClient.auth, from(table) { calls.push(table); return demoClient.from(table); } };
  const entry = "  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load);else load();";
  assert.ok(suite.includes(entry), 'Ponto de inicialização real encontrado');
  vm.runInContext(suite.replace(entry, `
    renderExercises=function(){}; updateSessionButtons=function(){};
    window.sessionTest={state:state,start:startSession,save:saveSession};
  `), realm, { filename: 'assets/personal-pro-suite.js' });
  const api = realm.sessionTest;
  api.state.students = [{ id: 'demo-ana', name: 'Ana' }];
  api.state.selected = api.state.students[0];
  api.state.exercises = clone(exercises);
  return {
    api, field, calls,
    snapshot: () => clone(realm.MT_CENTRAL_PRO_DEMO.snapshot()),
    async insert(data, extra = {}) {
      const result = await demoClient.from('personal_sessoes').insert(Object.assign({
        academia_id: 'demo-academia', profissional_id: 'demo-prof-marina', aluno_id: 'demo-ana',
        status: 'em_andamento', dados: clone(data), iniciado_em: '2026-09-29T12:00:00Z'
      }, extra)).select('*').single();
      assert.equal(result.error, null, 'Fixture válida no adaptador real');
      return clone(result.data);
    },
    async update(id, payload) {
      const result = await demoClient.from('personal_sessoes').update(payload).eq('id', id).select('*').single();
      assert.equal(result.error, null, 'Atualização concorrente válida');
      return clone(result.data);
    },
    assertOfflineUnchanged() {
      eq([...offline], storageBefore, 'Rascunho e fila offline do atendimento integrado preservados integralmente');
      eq([storageReads, storageWrites], [0, 0], 'Central Pro não lê nem escreve as chaves locais de outro fluxo');
    }
  };
}

(async () => {
  const flow = { origem: 'fluxo_v833', local_id: 'flow-local-17', observacao: 'Manter RPE', series: [{ exercicio: 'Remada', reps: '8', carga: '30', rpe: '2' }], extra: { acompanhamento: true } };
  let t = setup();
  await t.insert(flow);
  let before = t.snapshot();
  await t.api.start();
  eq(t.api.state.session, null, 'Não assume atendimento integrado em andamento');
  ok(t.field('#ptProSessStatus').textContent.includes('atendimento integrado'), 'Orienta concluir no fluxo que iniciou a sessão');
  eq(t.snapshot(), before, 'Não cria outra sessão nem altera origem, local_id, RPE ou metadados do fluxo');
  t.assertOfflineUnchanged();

  t = setup();
  await t.insert(flow, { iniciado_em: '2026-09-29T10:00:00Z' });
  await t.insert({ origem: 'central_pro', series: [], planejado: clone(exercises) }, { iniciado_em: '2026-09-29T13:00:00Z' });
  before = t.snapshot();
  await t.api.start();
  eq(t.api.state.session, null, 'Detecta sessão integrada mesmo quando a Central Pro é mais recente');
  eq(t.snapshot(), before, 'Consulta todas as sessões abertas antes de permitir retomada');

  t = setup();
  await t.insert(flow, { aluno_id: 'demo-bruno' });
  await t.insert(flow, { profissional_id: 'demo-prof-rafael' });
  const concluded = await t.insert(flow, { status: 'concluida', encerrado_em: '2026-09-29T13:00:00Z' });
  before = t.snapshot();
  await t.api.start();
  ok(t.api.state.session, 'Fluxo de outro aluno, profissional ou já concluído não bloqueia o aluno selecionado');
  let rows = t.snapshot().personal_sessoes;
  eq(rows.length, before.personal_sessoes.length + 1, 'Cria uma única sessão própria');
  let current = rows.find(row => row.id === t.api.state.session.id);
  eq(current.dados.origem, 'central_pro', 'Novas sessões usam origem estável');
  eq(current.dados.series, [], 'Metas preenchidas não viram realizações');
  eq(rows.filter(row => row.id !== current.id), before.personal_sessoes, 'Nenhuma sessão de outro fluxo foi alterada');
  eq(rows.find(row => row.id === concluded.id).dados, flow, 'Histórico integrado mantém todos os campos');
  t.api.state.exercises[0].sets[0].done = true;
  t.field('#ptProSessObs').value = 'Primeira série registrada';
  await t.api.save(false);
  current = t.snapshot().personal_sessoes.find(row => row.id === current.id);
  eq(current.dados.series.map(row => row.reps), ['5'], 'Salva apenas séries realizadas da Central Pro');
  const savedId = current.id;
  t.api.state.session = null;
  t.api.state.exercises = clone(exercises);
  await t.api.start();
  eq(t.api.state.session.id, savedId, 'Retoma sua sessão sem duplicar');
  eq(t.api.state.exercises[0].sets[0].done, true, 'Retomada preserva as marcações');
  await t.api.save(true);
  current = t.snapshot().personal_sessoes.find(row => row.id === savedId);
  eq(current.status, 'concluida', 'Finaliza apenas a sessão própria');
  eq(current.dados.origem, 'central_pro', 'Origem permanece após conclusão');
  t.assertOfflineUnchanged();

  for (const withPlan of [false, true]) {
    t = setup();
    const legacy = { observacao: 'Rascunho anterior', series: [{ exercicio: 'Supino', reps: '8', carga: '22' }], local_id: 'legacy-kept', extra: { protocolo: 7 } };
    if (withPlan) { legacy.planejado = clone(exercises); legacy.planejado[0].sets[0].done = true; legacy.ficha = { id: 'ficha-a', nome: 'A · Superior' }; }
    const row = await t.insert(legacy);
    await t.api.start();
    eq(t.api.state.session.id, row.id, withPlan ? 'Retoma legado com prescrição detalhada' : 'Retoma v830 publicado, apenas observacao + series');
    eq(t.field('#ptProSessObs').value, legacy.observacao, 'Observação anterior preservada');
    eq(t.api.state.exercises[0].sets[0].done, true, 'Registro realizado legado permanece marcado');
    await t.api.save(false);
    let saved = t.snapshot().personal_sessoes.find(item => item.id === row.id);
    eq(saved.dados.origem, 'central_pro', 'Primeiro salvamento identifica a origem do legado');
    eq(saved.dados.local_id, legacy.local_id, 'Metadado local_id não é descartado');
    eq(saved.dados.extra, legacy.extra, 'Metadados não editados permanecem intactos');
    eq(saved.dados.series[0].reps, withPlan ? '5' : '8', 'Retomada usa as repetições corretas do contrato legado');
    await t.api.save(true);
    eq(t.snapshot().personal_sessoes.length, 1, 'Salvar e concluir o legado não cria outra sessão');
    t.assertOfflineUnchanged();
  }

  for (const data of [{ origem: 'outro_modulo', series: [], planejado: clone(exercises) }, { series: [{ desconhecido: true }] }]) {
    t = setup(); await t.insert(data); before = t.snapshot();
    await t.api.start();
    eq(t.api.state.session, null, 'Não assume origem desconhecida nem registro legado malformado');
    eq(t.snapshot(), before, 'Dados desconhecidos permanecem intactos');
  }

  t = setup(); await t.api.start();
  const id = t.api.state.session.id;
  await t.update(id, { dados: flow });
  before = t.snapshot();
  t.api.state.exercises[0].sets[0].done = true;
  await t.api.save(true);
  eq(t.snapshot(), before, 'Gravação condicionada à origem rejeita sessão assumida por outro fluxo durante a edição');
  ok(t.api.state.session && t.api.state.session.dirty, 'Conflito conserva o rascunho da Central Pro');
  ok(t.field('#ptProSessStatus').className.includes('erro'), 'Conflito aparece como erro, não sucesso');
  t.assertOfflineUnchanged();

  console.log(`central-pro-coexistencia: ${checks} verificações passaram`);
})().catch(error => { console.error(error); process.exitCode = 1; });
