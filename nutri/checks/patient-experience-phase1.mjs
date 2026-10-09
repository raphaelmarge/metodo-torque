import assert from 'node:assert/strict';
import fs from 'node:fs';

// Actual presentation module + actual pure care helpers. No network, database,
// account writes or browser layout assertions. Run with Node 22 or newer.
const root = new URL('../', import.meta.url);
const moduleURL = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const read = name => fs.readFileSync(new URL(name, root), 'utf8');
const assessmentURL = moduleURL(read('assessment.js'));
const medalURL = moduleURL(read('vendor/medalha-visual.js'));
const progressURL = moduleURL(read('care-progress.js'));
const patientSource = read('patient-experience.js')
  .replace("'./assessment.js'", JSON.stringify(assessmentURL))
  .replace("'./vendor/medalha-visual.js'", JSON.stringify(medalURL))
  .replace("'./care-progress.js'", JSON.stringify(progressURL));

const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : ['2026-10-09T12:00:00'])); }
};
globalThis.self = globalThis;
await import(moduleURL(read('vendor/medalhas-core.js')));
await import(moduleURL(read('vendor/nutricao-core.js')));
const {createPatientExperience} = await import(moduleURL(patientSource));
const TODAY = '2026-10-09';
const escape = value => String(value ?? '').replace(/[&<>"']/g, character =>
  ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));
const tests = [];
const test = (name, fn) => tests.push({name, fn});

function fixture() {
  const patient = {id: 'p1', name: 'Ana Silva', clinician_id: 'nutri1', goal: 'Organizar minha rotina'};
  const plan = {v: 1, titulo: 'Meu plano', aguaMl: 1800,
    refeicoes: [{id: 'lunch', titulo: 'Almoço', hora: '', receitaId: 'recipe1',
      itens: [{id: 'food1', nome: 'Arroz', qtd: 1, porcao: '100 g', k: 130, pt: 3, cb: 28, g: 0}]}],
    receitas: [{id: 'recipe1', nome: 'Arroz da rotina', tempo: 20,
      ingredientes: ['Arroz'], modo: ['Cozinhar']}]};
  const state = {selected: 'p1', user: {id: 'user1'}, role: 'patient',
    clinic: {name: 'Clínica', professional_name: 'Nutri Helena', weekly_goal: 5, color: '#5de0b4'},
    logs: [], records: [], appointments: [], challenges: []};
  let dayButtons = [];
  globalThis.document = {querySelector: () => null,
    querySelectorAll: selector => selector === '[data-view-day]' ? dayButtons : []};
  const H = {state: () => state, esc: escape, today: () => TODAY, dateLabel: day => day,
    heading: () => '', render: () => {}, modal: () => {}, run: fn => fn(), toast: () => {},
    published: () => ({id: 'plan1', patient_id: patient.id, status: 'published', data: plan, version: 2}),
    logs: p => state.logs.filter(row => row.patient_id === (p || patient).id),
    metrics: () => ({}), badgeDefs: () => [], moodName: mood => mood || '',
    mealsView: (selectedPlan, buttons) => selectedPlan.refeicoes.map(meal =>
      `<p>${escape(meal.titulo)}${buttons ? '<button data-log-meal="' + escape(meal.id) + '">Registrar</button>' : ''}</p>`).join('')};
  // Intentionally no H.stats: isolated presentation fixtures must work without
  // the enclosing app, and the shared pure summary is the source of care data.
  const P = {pat: () => patient, resources: () => [],
    patientPages: [['journal', 'Diário'], ['recipes', 'Receitas'], ['goals', 'Metas'],
      ['achievements', 'Conquistas'], ['clinical', 'Avaliações'], ['forms', 'Questionários'],
      ['documents', 'Documentos'], ['booking', 'Consultas'], ['community', 'Comunidade'],
      ['profile-settings', 'Perfil'], ['payments', 'Pagamentos'], ['benefits', 'Benefícios'],
      ['settings', 'Ajustes'], ['support', 'Ajuda']]};
  const A = {all: () => [], photos: () => []};
  const experience = createPatientExperience(H, P, A);
  const entry = {id: 'entry1', patient_id: 'p1', kind: 'food_journal', visibility: 'patient',
    created_by: 'user1', clinician_id: 'nutri1', version: 2,
    data: {day: TODAY, mealId: 'lunch', planVersion: 2,
      items: [{nome: 'Arroz', qtd: 1, porcao: '100 g'}]}};
  return {state, plan, H, P, A, experience, entry,
    viewDay(day) { dayButtons = [{dataset: {viewDay: day}}]; experience.bind(); dayButtons[0].onclick(); }};
}

test('First use puts a useful action before XP and measurements without H.stats', () => {
  const {experience} = fixture(), html = experience.home();
  assert(html.includes('first-care'));
  assert(html.indexOf('contextual-care') < html.indexOf('journey-strip'));
  assert(html.indexOf('contextual-care') < html.indexOf('home-evolution'));
  assert(html.includes('patient-cover'));
  assert(html.includes('TORQUE NUTRI'));
  assert(!html.includes('NaN'));
});

test('Return after three days refers to missing records rather than missed dieting', () => {
  const {state, experience} = fixture();
  state.logs = [{patient_id: 'p1', day: '2026-10-05', mood: 'good', meals: []}];
  const html = experience.home();
  assert(html.includes('return-care'));
  assert(html.includes('Há alguns dias sem registros'));
  assert(!html.includes('Você abandonou'));
  assert(!html.includes('Você não seguiu'));
});

test('A weight-only current log is not displayed as recorded care', () => {
  const {state, experience} = fixture();
  state.logs = [{patient_id: 'p1', day: TODAY, weight: 70, meals: []}];
  const html = experience.home();
  assert(html.includes('first-care'));
  assert(html.includes('0 de 5 dias'));
  assert(experience.achievements().includes('0 XP na sua jornada'));
});

test('Water is visible in the care week while adherence stays explicitly unconfirmed', () => {
  const {state, experience} = fixture();
  state.logs = [{patient_id: 'p1', day: TODAY, water_ml: 250, meals: [], followed: false}];
  const html = experience.home();
  assert(html.includes('Sexta, 2026-10-09, cuidado registrado'));
  assert(html.includes('Você ainda não confirmou'));
  assert(html.includes('Confirme somente se seguiu seu plano'));
  assert(html.includes('1 de 5 dias'));
});

test('Other patients and private records cannot appear as care or expose their content', () => {
  const {state, experience, entry} = fixture();
  state.logs = [{patient_id: 'p2', day: TODAY, meals: ['lunch']}];
  state.records = [{...entry, id: 'foreign', patient_id: 'p2',
    data: {...entry.data, note: 'SEGREDO DE OUTRO PACIENTE'}},
    {...entry, id: 'private', visibility: 'private', data: {...entry.data, note: 'NOTA PRIVADA'}}];
  const html = experience.home();
  assert(html.includes('first-care'));
  assert(html.includes('0 de 5 dias'));
  assert(!html.includes('SEGREDO'));
  assert(!html.includes('NOTA PRIVADA'));
});

test('A matching journal and quick marker count once without implying adherence', () => {
  const {state, experience, entry} = fixture();
  state.records = [entry];
  state.logs = [{patient_id: 'p1', day: TODAY, meals: ['lunch'], followed: false}];
  const html = experience.home();
  assert(html.includes('1 <span>registros'));
  assert(html.includes('1/1 com registro'));
  assert(html.includes('Você ainda não confirmou'));
});

test('Associated recipe links use the published plan meal and snapshot', () => {
  const {experience} = fixture(), html = experience.home();
  assert(html.includes('Arroz da rotina'));
  assert(html.includes('data-x="plan-recipe" data-id="lunch"'));
  assert(html.includes('Ver preparo'));
  assert(!html.includes('Receita indicada automaticamente'));
});

test('Real feedback requires professional authorship, is escaped and flags a later edit', () => {
  const {state, experience, entry} = fixture();
  const feedback = {id: 'feedback1', patient_id: 'p1', kind: 'nutrition_feedback',
    visibility: 'patient', clinician_id: 'nutri1', created_by: 'nutri1', version: 1,
    created_at: '2026-10-09T12:00:00Z',
    data: {entryId: 'entry1', entryVersion: 1, text: 'Boa organização <script>'}};
  state.records = [entry, feedback];
  const html = experience.home();
  assert(html.includes('Boa organização &lt;script&gt;'));
  assert(html.includes('relato foi atualizado depois'));
  feedback.created_by = 'user1';
  assert(!experience.home().includes('Boa organização'));
  feedback.created_by = 'nutri1'; feedback.visibility = 'private';
  assert(!experience.home().includes('Boa organização'));
});

test('History shows actual snapshots with no controls that write meal, water or check-in', () => {
  const {state, experience, entry, viewDay} = fixture();
  state.records = [{...entry, data: {...entry.data, day: '2026-10-08', note: 'Relato histórico'}}];
  experience.home();
  viewDay('2026-10-08');
  const html = experience.home();
  assert(html.includes('Relato histórico'));
  assert(html.includes('plano de referência 2'));
  for (const attribute of ['data-log-meal', 'data-action="water"', 'data-action="checkin"', 'data-action="followed"']) {
    assert(!html.includes(attribute), attribute);
  }
});

test('Achievements explain capped daily XP and the preserved previous credits', () => {
  const {state, experience, entry} = fixture();
  state.records = [entry];
  state.logs = [{patient_id: 'p1', day: TODAY, meals: ['lunch'], weight: 70, water_ml: 5000, mood: 'good', followed: true}];
  const html = experience.achievements();
  assert(html.includes('20 XP na sua jornada'));
  assert(html.includes('até 20 XP por dia'));
  assert(html.includes('créditos anteriores foram preservados'));
  assert(!html.includes('pesagem +5'));
});

test('The grouped patient menu keeps all fourteen existing destinations', () => {
  const {experience, P} = fixture(), html = experience.menu();
  for (const [page] of P.patientPages) assert(html.includes('data-page="' + page + '"'), page);
});

let failed = 0;
for (const {name, fn} of tests) {
  try { await fn(); console.log('PASS ' + name); }
  catch (error) { failed++; console.error('FAIL ' + name + '\n' + error.stack); }
}
globalThis.Date = RealDate;
console.log(`${tests.length - failed}/${tests.length} patient presentation phase 1 checks passed.`);
if (failed) process.exitCode = 1;
