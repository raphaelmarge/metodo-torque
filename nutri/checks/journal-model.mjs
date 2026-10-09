import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../journal-model.js', import.meta.url), 'utf8');
const {resolveJournalPlan, buildJournalItems, findJournalForMeal} = await import(
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const tests = [];
const test = (name, fn) => tests.push({name, fn});
const food = (id = 'rice', extra = {}) => ({id, nome: 'Arroz cozido', qtd: 1, porcao: '100 g', k: 130, pt: 2.5, cb: 28, g: 0.3, ...extra});
const oldPlan = {titulo: 'Plano anterior', refeicoes: [{id: 'lunch', titulo: 'Almoço', itens: [food()]}]};
const published = {id: 'stable-plan', patient_id: 'patient-a', status: 'published', version: 8,
  data: {titulo: 'Plano atual', refeicoes: [{id: 'lunch', itens: [food('rice', {k: 999, pt: 90})]}]}};
const record = (id, data, extra = {}) => ({id, patient_id: 'patient-a', kind: 'food_journal', visibility: 'patient',
  version: 1, created_at: '2026-10-08T12:00:00Z', data, ...extra});
const snapshot = extra => record('plan-snapshot', {planId: 'stable-plan', planVersion: 7, plan: oldPlan}, {kind: 'plan_version', ...extra});
const entry = extra => record('old-report', {day: '2026-10-08', mealId: 'lunch', planVersion: 7, items: [food('legacy-food-id')]}, extra);

test('New reports use only the published plan of the selected patient', () => {
  const result = resolveJournalPlan({published, patientId: 'patient-a'});
  assert.deepEqual(result, {plan: published.data, planVersion: 8, mealId: null, lockedToHistory: false});
  result.plan.refeicoes[0].itens[0].k = 0;
  assert.equal(published.data.refeicoes[0].itens[0].k, 999);
  for (const plan of [null, {...published, patient_id: 'patient-b'}, {...published, status: 'draft'}, {...published, version: '8'}]) {
    assert.deepEqual(resolveJournalPlan({published: plan, patientId: 'patient-a'}),
      {plan: null, planVersion: null, mealId: null, lockedToHistory: false});
  }
});

test('A published plan change cannot replace historical reference or nutrition', () => {
  const existing = entry();
  const context = resolveJournalPlan({published, records: [snapshot()], patientId: 'patient-a', existing});
  assert.equal(context.planVersion, 7);
  assert.equal(context.mealId, 'lunch');
  assert.equal(context.lockedToHistory, true);
  assert.equal(context.plan.titulo, 'Plano anterior');
  const oldFood = context.plan.refeicoes[0].itens[0];
  const items = buildJournalItems([{...oldFood, source: oldFood, qtd: 2}]);
  assert.equal(items[0].k, 130);
  assert.equal(items[0].pt, 2.5);
  assert.equal(items[0].qtd, 2);
  assert.equal(published.version, 8);
  context.plan.refeicoes[0].itens[0].k = 5;
  assert.equal(oldPlan.refeicoes[0].itens[0].k, 130);
  assert.equal(existing.data.planVersion, 7);
});

test('Missing, private, other-patient and wrong-version snapshots never fill historical macros', () => {
  for (const records of [[], [snapshot({visibility: 'private'})], [snapshot({patient_id: 'patient-b'})],
    [record('wrong-version', {planVersion: 6, plan: oldPlan}, {kind: 'plan_version'})],
    [record('wrong-plan', {planId: 'another-plan', planVersion: 7, plan: oldPlan}, {kind: 'plan_version'})]]) {
    const result = resolveJournalPlan({published, records, patientId: 'patient-a', existing: entry()});
    assert.deepEqual(result, {plan: null, planVersion: 7, mealId: 'lunch', lockedToHistory: true});
  }
  const currentVersion = entry({data: {...entry().data, planVersion: 8}});
  assert.equal(resolveJournalPlan({published, patientId: 'patient-a', existing: currentVersion}).plan, null);
});

test('Archived snapshots cannot provide historical plan or nutrition', () => {
  for (const archived of [snapshot({archived: true}), snapshot({data: {...snapshot().data, archived: true}})]) {
    const result = resolveJournalPlan({published, records: [archived], patientId: 'patient-a', existing: entry()});
    assert.deepEqual(result, {plan: null, planVersion: 7, mealId: 'lunch', lockedToHistory: true});
  }
  const live = snapshot();
  assert.equal(resolveJournalPlan({published, records: [live, snapshot({id: 'archived-copy', archived: true})], patientId: 'patient-a', existing: entry()}).plan.titulo, 'Plano anterior');
});

test('Archived journal cannot be opened for editing', () => {
  for (const existing of [entry({archived: true}), entry({data: {...entry().data, archived: true}})]) {
    assert.throws(() => resolveJournalPlan({published, records: [snapshot()], patientId: 'patient-a', existing}), /indisponível/);
  }
});

test('Historical meal IDs and legacy unversioned reports are preserved', () => {
  const existing = entry({data: {...entry().data, mealId: 'meal-no-longer-prescribed'}});
  const result = resolveJournalPlan({published, records: [snapshot()], patientId: 'patient-a', existing});
  assert.equal(result.mealId, 'meal-no-longer-prescribed');
  assert.deepEqual(resolveJournalPlan({published, patientId: 'patient-a', existing: entry({data: {items: []}})}),
    {plan: null, planVersion: null, mealId: null, lockedToHistory: true});
  assert.throws(() => resolveJournalPlan({published, patientId: 'patient-a', existing: entry({patient_id: 'patient-b'})}), /indisponível/);
  assert.throws(() => resolveJournalPlan({published, patientId: 'patient-a', existing: entry({visibility: 'private'})}), /indisponível/);
});

test('Old food IDs survive edits, and output contains only RPC item fields', () => {
  const oldItem = food('legacy-id', {unknown: 'keep out'});
  const result = buildJournalItems([{...oldItem, source: oldItem, unknown: 'keep out', status: 'followed'}]);
  assert.equal(result[0].id, 'legacy-id');
  assert.deepEqual(Object.keys(result[0]).sort(), ['id', 'nome', 'qtd', 'porcao', 'k', 'pt', 'cb', 'g'].sort());
  assert.equal(result[0].k, oldItem.k);
  assert.equal(oldItem.unknown, 'keep out');
});

test('Name coincidence, changed portion and absent provenance cannot carry nutrition', () => {
  const source = food();
  for (const row of [{...source}, {...source, id: 'custom-id', source}, {...source, nome: 'Arroz integral', source},
    {...source, porcao: 'colher', source}, {nome: source.nome, qtd: 1, porcao: source.porcao, source}]) {
    const item = buildJournalItems([row])[0];
    for (const key of ['k', 'pt', 'cb', 'g']) assert.equal(Object.hasOwn(item, key), false);
  }
});

test('Each explicitly known macro survives; missing and invalid nutrients never become zero', () => {
  const partial = {id: 'rice', nome: 'Arroz cozido', qtd: 1, porcao: '100 g', k: 130, cb: 28};
  const result = buildJournalItems([{...partial, source: partial}])[0];
  assert.equal(result.k, 130);
  assert.equal(result.cb, 28);
  assert.equal(Object.hasOwn(result, 'pt'), false);
  assert.equal(Object.hasOwn(result, 'g'), false);
  for (const invalid of [undefined, null, '2.5', NaN, -1, Infinity, 100001]) {
    const source = food('rice', {k: invalid});
    const item = buildJournalItems([{...source, source}])[0];
    assert.equal(Object.hasOwn(item, 'k'), false);
    assert.equal(item.pt, 2.5);
    assert.equal(item.cb, 28);
    assert.equal(item.g, 0.3);
  }
  const source = food('water', {nome: 'Água', porcao: '200 ml', k: 0, pt: 0, cb: 0, g: 0});
  assert.equal(buildJournalItems([{...source, source}])[0].k, 0);
});

test('An explicit legacy source without an ID retains its own known macros without inventing an ID', () => {
  const source = {nome: 'Arroz cozido', qtd: 1, porcao: '100 g', k: 130, pt: 2.5};
  const item = buildJournalItems([{...source, source, qtd: 2}])[0];
  assert.deepEqual(item, {...source, qtd: 2});
  assert.equal(Object.hasOwn(item, 'id'), false);
  assert.equal(Object.hasOwn(item, 'cb'), false);
  assert.equal(Object.hasOwn(item, 'g'), false);
  const assignedId = buildJournalItems([{...source, id: 'new-identity', source}])[0];
  assert.equal(Object.hasOwn(assignedId, 'k'), false);
  assert.equal(Object.hasOwn(assignedId, 'pt'), false);
  const changedPortion = buildJournalItems([{...source, porcao: 'colher', source}])[0];
  assert.equal(Object.hasOwn(changedPortion, 'k'), false);
});

test('An explicitly selected alternative carries only its own nutrition and quantity', () => {
  const alternative = food('potato', {nome: 'Batata cozida', porcao: '80 g', k: 69, pt: 1.2, cb: 16, g: 0.1});
  const item = buildJournalItems([{...alternative, qtd: '1,5', source: alternative}])[0];
  assert.deepEqual(item, {...alternative, qtd: 1.5});
  assert.equal(item.k, 69);
  assert.equal(alternative.qtd, 1);
});

test('Item limits match save_food_journal, including its 100-character portion limit', () => {
  for (const rows of [null, {}, [], Array.from({length: 101}, () => food()), [null],
    [food('rice', {nome: ''})], [food('rice', {nome: 'x'.repeat(201)})],
    [food('rice', {porcao: 'x'.repeat(101)})], [food('rice', {porcao: ' '})],
    [food('', {})], [food('x'.repeat(161))]]) assert.throws(() => buildJournalItems(rows));
  for (const qtd of [null, '', ' ', true, {}, [], 0, -1, 1001, Infinity, NaN, '0x10', 'abc']) {
    assert.throws(() => buildJournalItems([food('rice', {qtd})]), /Quantidade/);
  }
  const maximum = {id: 'x'.repeat(160), nome: 'a'.repeat(200), qtd: 1000, porcao: 'b'.repeat(100)};
  assert.deepEqual(buildJournalItems(Array.from({length: 100}, () => maximum))[0], maximum);
});

test('Last exact journal lookup isolates patient, visibility, day, meal and plan version', () => {
  const first = entry({id: 'first'});
  const last = entry({id: 'last', updated_at: '2026-10-08T13:00:00Z'});
  const rows = [first, entry({id: 'foreign', patient_id: 'patient-b', updated_at: '2026-10-09T13:00:00Z'}),
    entry({id: 'private', visibility: 'private', updated_at: '2026-10-09T13:00:00Z'}),
    entry({id: 'next-version', data: {...first.data, planVersion: 8}}),
    entry({id: 'other-day', data: {...first.data, day: '2026-10-07'}}),
    entry({id: 'other-meal', data: {...first.data, mealId: 'dinner'}}), last];
  const query = {records: rows, patientId: 'patient-a', day: '2026-10-08', mealId: 'lunch', planVersion: 7};
  const before = structuredClone(rows);
  assert.equal(findJournalForMeal(query), last);
  assert.deepEqual(rows, before);
  assert.equal(findJournalForMeal({...query, patientId: 'missing'}), null);
  assert.equal(findJournalForMeal({...query, planVersion: '7'}), null);
  assert.equal(findJournalForMeal({...query, mealId: null}), null);
  assert.equal(findJournalForMeal({...query, records: []}), null);
});

test('Archived journal is excluded from exact meal lookup', () => {
  const live = entry({id: 'live'});
  const query = {patientId: 'patient-a', day: '2026-10-08', mealId: 'lunch', planVersion: 7};
  for (const archived of [entry({id: 'archived-row', archived: true, updated_at: '2026-10-09T12:00:00Z'}),
    entry({id: 'archived-data', data: {...entry().data, archived: true}, updated_at: '2026-10-09T13:00:00Z'})]) {
    assert.equal(findJournalForMeal({...query, records: [archived]}), null);
    assert.equal(findJournalForMeal({...query, records: [live, archived]}), live);
  }
});

test('Legacy unknown versions never match current versions; equal timestamps have stable ordering', () => {
  const rows = [entry({id: 'a', data: {day: '2026-10-08', mealId: 'lunch'}}),
    entry({id: 'z', data: {day: '2026-10-08', mealId: 'lunch', planVersion: null}})];
  const query = {records: rows, patientId: 'patient-a', day: '2026-10-08', mealId: 'lunch', planVersion: null};
  assert.equal(findJournalForMeal(query).id, 'z');
  assert.equal(findJournalForMeal({...query, records: [...rows].reverse()}).id, 'z');
  assert.equal(findJournalForMeal({...query, planVersion: 8}), null);
});

let failed = 0;
for (const {name, fn} of tests) {
  try { await fn(); console.log('PASS ' + name); }
  catch (error) { failed++; console.error('FAIL ' + name + '\n' + error.stack); }
}
console.log(`${tests.length - failed}/${tests.length} journal model regressions passed.`);
if (failed) process.exitCode = 1;
