import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../care-progress.js', import.meta.url), 'utf8');
const {CARE_POLICY_START, careSummary, mealPresence, nextMeal} = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const TODAY = '2026-10-09';
const tests = [];
const test = (name, fn) => tests.push({name, fn});
const log = (day = TODAY, extra = {}) => ({patient_id: 'a', day, meals: [], water_ml: 0, followed: false, ...extra});
const journal = (id, day = TODAY, extra = {}, data = {}) => ({
  id, patient_id: 'a', kind: 'food_journal', visibility: 'patient', version: 1,
  created_at: day + 'T12:00:00Z', data: {day, mealId: 'lunch', planVersion: 2, items: [{nome: 'Alimento relatado', qtd: 1, porcao: 'porção'}], ...data}, ...extra
});
const goal = (id, target, created = TODAY + 'T12:00:00Z', extra = {}) => ({
  id, patient_id: 'a', kind: 'goal_update', visibility: 'patient', version: 1,
  created_at: created, data: {target}, ...extra
});
const summary = extra => careSummary({patientId: 'a', logs: [], records: [], today: TODAY, clinicGoal: 4, ...extra});
const meal = (id, hora, extra = {}) => ({id, hora, titulo: id, itens: [], ...extra});
const plan = {refeicoes: [meal('breakfast', '07:30'), meal('lunch', '12:30'), meal('snack', '16:00'), meal('dinner', '19:30')]};
const next = extra => nextMeal({plan, day: TODAY, now: '15:00', recordedMealIds: [], ...extra});

test('first use has no invented care or adherence', () => {
  assert.equal(CARE_POLICY_START, TODAY);
  assert.deepEqual(summary(), {days: 0, target: 4, goalOrigin: 'clinic', followedDays: 0, xp: 0, dayXP: 0, lastCareDay: null, mealCount: 0, careDays: []});
});

test('legacy history keeps its original formula across the policy boundary', () => {
  const result = summary({logs: [
    log('2026-10-08', {followed: true, weight: 70, water_ml: 1750, meals: ['breakfast', 'lunch']}),
    log(TODAY, {followed: true, weight: 69, water_ml: 5000, meals: ['breakfast', 'lunch', 'dinner'], mood: 'good'})
  ]});
  assert.equal(result.xp, 21 + 20);
  assert.equal(result.dayXP, 20);
  assert.equal(result.followedDays, 2);
  assert.equal(result.mealCount, 5);
});

test('legacy check-in and detailed journal do not manufacture old XP', () => {
  const result = summary({logs: [log('2026-10-08', {sleep: 7, note: 'Uma dificuldade'})], records: [journal('old', '2026-10-08')]});
  assert.equal(result.xp, 0);
  assert.equal(result.days, 1);
});

test('new weight alone earns no XP and does not claim dietary care', () => {
  const result = summary({logs: [log(TODAY, {weight: 69})]});
  assert.equal(result.xp, 0);
  assert.equal(result.days, 0);
  assert.equal(result.lastCareDay, null);
  assert.equal(summary({logs: [log('2026-10-08', {weight: 70})]}).xp, 5);
});

test('explicit followed confirmation remains visible care but awards no new XP', () => {
  const result = summary({logs: [log(TODAY, {followed: true})]});
  assert.equal(result.dayXP, 0);
  assert.equal(result.xp, 0);
  assert.equal(result.days, 1);
  assert.equal(result.followedDays, 1);
  assert.deepEqual(result.careDays, [TODAY]);
  assert.equal(summary({logs: [log(TODAY, {followed: true, water_ml: 250})]}).dayXP, 10);
  assert.equal(summary({logs: [log(TODAY, {followed: true, water_ml: 250, mood: 'good'})], records: [journal('meal')]}).dayXP, 20);
  assert.equal(summary({logs: [log('2026-10-08', {followed: true})]}).xp, 10);
});

test('water earns one care reward independent of volume', () => {
  for (const amount of [1, 250, 20000]) assert.equal(summary({logs: [log(TODAY, {water_ml: amount})]}).dayXP, 10);
  assert.equal(summary({logs: [log(TODAY, {water_ml: 0})]}).dayXP, 0);
});

test('check-ins reward disclosure, including a valid zero hours of sleep', () => {
  for (const patch of [{mood: 'bad'}, {sleep: 0}, {note: 'Preciso ajustar a rotina'}]) {
    const result = summary({logs: [log(TODAY, patch)]});
    assert.equal(result.dayXP, 15);
    assert.equal(result.followedDays, 0);
  }
  assert.equal(summary({logs: [log(TODAY, {sleep: null, note: '   ', mood: 'unknown'})]}).dayXP, 0);
});

test('off-plan journal is care without inferring adherence', () => {
  const result = summary({records: [journal('outside', TODAY, {}, {mealId: null})]});
  assert.equal(result.dayXP, 15);
  assert.equal(result.days, 1);
  assert.equal(result.followedDays, 0);
  assert.equal(result.mealCount, 1);
});

test('many meals, check-in edits and replay remain capped at twenty per day', () => {
  const rows = [log(TODAY, {water_ml: 250, meals: ['lunch', 'lunch'], mood: 'good'}), log(TODAY, {water_ml: 1500, meals: ['dinner'], note: 'Editado'})];
  const entry = journal('j');
  const result = summary({logs: rows, records: [entry, entry, {...entry, version: 2, data: {...entry.data, note: 'Nova anotação'}}]});
  assert.equal(result.dayXP, 20);
  assert.equal(result.days, 1);
  assert.equal(result.mealCount, 2);
});

test('same-day meal marker and journal form a union; off-plan entries remain distinct', () => {
  const result = mealPresence({patientId: 'a', day: TODAY, logs: [log(TODAY, {meals: ['lunch', 'lunch']})], records: [journal('j'), journal('off-1', TODAY, {}, {mealId: null}), journal('off-2', TODAY, {}, {mealId: null})], planVersion: 2});
  assert.deepEqual(result.mealIds, ['lunch']);
  assert.equal(result.count, 3);
  assert.equal(result.entries.length, 3);
});

test('journal of an old plan remains care but never marks a republished plan', () => {
  const result = mealPresence({patientId: 'a', day: TODAY, records: [journal('old-plan', TODAY, {}, {planVersion: 1})], planVersion: 2});
  assert.deepEqual(result.mealIds, []);
  assert.equal(result.entries.length, 1);
  assert.equal(result.count, 1);
  assert.equal(summary({records: result.entries}).dayXP, 15);
  const unknown = mealPresence({patientId: 'a', day: TODAY, records: [journal('unknown', TODAY, {}, {planVersion: null})], planVersion: 2});
  assert.deepEqual(unknown.mealIds, []);
});

test('legacy marker with evidence of another plan version cannot complete the current plan', () => {
  const logs = [log(TODAY, {meals: ['lunch']})];
  const records = [journal('old-plan', TODAY, {}, {planVersion: 1})];
  const result = mealPresence({patientId: 'a', day: TODAY, logs, records, planVersion: 2});
  assert.deepEqual(result.mealIds, []);
  assert.equal(result.count, 1);
  assert.equal(result.entries.length, 1);
  assert.equal(summary({logs, records}).mealCount, 1);
  assert.deepEqual(mealPresence({patientId: 'a', day: TODAY, logs, records}).mealIds, ['lunch']);
});

test('exact current-version report wins over old evidence without awarding the same meal twice', () => {
  const result = mealPresence({patientId: 'a', day: TODAY, logs: [log(TODAY, {meals: ['lunch']})], records: [
    journal('old-plan', TODAY, {}, {planVersion: 1}), journal('current-plan')
  ], planVersion: 2});
  assert.deepEqual(result.mealIds, ['lunch']);
  assert.equal(result.count, 1);
  assert.equal(result.entries.length, 2);
});

test('a pure legacy marker keeps its accepted presence without inventing a plan version', () => {
  const logs = [log(TODAY, {meals: ['lunch']})];
  const result = mealPresence({patientId: 'a', day: TODAY, logs, planVersion: 2});
  assert.deepEqual(result.mealIds, ['lunch']);
  assert.equal(result.count, 1);
  assert.deepEqual(logs[0].meals, ['lunch']);
  assert.equal(logs[0].planVersion, undefined);
});

test('private, other-patient and other-day reports cannot invalidate a legacy marker', () => {
  const result = mealPresence({patientId: 'a', day: TODAY, logs: [log(TODAY, {meals: ['lunch']})], records: [
    journal('private-old', TODAY, {visibility: 'private'}, {planVersion: 1}),
    journal('other-patient-old', TODAY, {patient_id: 'b'}, {planVersion: 1}),
    journal('other-day-old', '2026-10-08', {}, {planVersion: 1})
  ], planVersion: 2});
  assert.deepEqual(result.mealIds, ['lunch']);
  assert.equal(result.count, 1);
  assert.equal(result.entries.length, 0);
});

test('private, archived, invalid, future and other-patient data are excluded', () => {
  const result = summary({logs: [log('2026-10-10', {followed: true}), log('2026-02-30', {meals: ['x']}), log(TODAY, {patient_id: 'b', followed: true}), log(TODAY, {archived: true, water_ml: 1000})], records: [
    journal('private', TODAY, {visibility: 'private'}), journal('other', TODAY, {patient_id: 'b'}),
    journal('archived', TODAY, {}, {archived: true}), journal('future', '2026-10-10'), journal('invalid', '2026-02-30'),
    journal('empty', TODAY, {}, {items: []})
  ]});
  assert.equal(result.xp, 0);
  assert.equal(result.mealCount, 0);
  assert.deepEqual(result.careDays, []);
});

test('newer archive or private revision cannot resurrect an older visible journal', () => {
  for (const changed of [{visibility: 'private'}, {data: {day: TODAY, archived: true}}]) {
    const result = summary({records: [journal('same'), journal('same', TODAY, {version: 2, ...changed})]});
    assert.equal(result.dayXP, 0);
    assert.equal(result.mealCount, 0);
  }
});

test('weekly care is Monday through today and independent of perfect plan days', () => {
  const result = summary({logs: [log('2026-10-04', {water_ml: 250}), log('2026-10-05', {water_ml: 250}), log('2026-10-08', {mood: 'good'}), log(TODAY, {note: 'Dificuldade relatada'})]});
  assert.equal(result.days, 3);
  assert.equal(result.followedDays, 0);
  assert.equal(result.lastCareDay, TODAY);
  assert.deepEqual(result.careDays, ['2026-10-04', '2026-10-05', '2026-10-08', TODAY]);
});

test('latest valid shared personal target wins; invalid and future goals do not', () => {
  const result = summary({records: [
    goal('old', 5, '2026-10-06T12:00:00Z'),
    goal('edited', 3, '2026-10-05T12:00:00Z', {updated_at: '2026-10-08T13:00:00Z'}),
    goal('private', 7, TODAY + 'T16:00:00Z', {visibility: 'private'}),
    goal('invalid', 8), goal('future', 2, '2026-10-10T12:00:00Z'),
    goal('bad-date', 2, '2026-02-30T12:00:00Z'), goal('other', 1, undefined, {patient_id: 'b'})
  ]});
  assert.equal(result.target, 3);
  assert.equal(result.goalOrigin, 'personal');
  assert.equal(summary({records: [goal('fraction', 2.5)]}).target, 4);
});

test('goal timestamps use the same local calendar as today, including late evening', () => {
  const lateLocalTime = new Date(2026, 9, 9, 23, 30).toISOString();
  const tomorrowLocalTime = new Date(2026, 9, 10, 0, 30).toISOString();
  assert.equal(summary({records: [goal('tonight', 2, lateLocalTime)]}).target, 2);
  assert.equal(summary({records: [goal('tomorrow', 2, tomorrowLocalTime)]}).target, 4);
});

test('correction changes the summary rather than pretending to be an immutable ledger', () => {
  const before = summary({logs: [log(TODAY, {meals: ['lunch'], water_ml: 250})]});
  const after = summary({logs: [log(TODAY, {water_ml: 250})]});
  assert.equal(before.dayXP, 15);
  assert.equal(after.dayXP, 10);
  assert.equal(after.mealCount, 0);
});

test('invalid summary date is rejected; leap-day validity is exact', () => {
  assert.throws(() => summary({today: '2026-02-30'}), TypeError);
  assert.equal(careSummary({patientId: 'a', today: '2024-02-29', logs: [log('2024-02-29', {followed: true})], clinicGoal: 1}).days, 1);
});

test('afternoon home does not force pending breakfast', () => {
  const result = next();
  assert.equal(result.meal.id, 'snack');
  assert.equal(result.state, 'upcoming');
  assert.equal(next({now: '14:00'}).meal.id, 'lunch');
  assert.equal(next({now: '14:31'}).state, 'none');
});

test('explicit context window boundaries are inclusive, with no generic oldest fallback', () => {
  const one = {refeicoes: [meal('lunch', '12:30')]};
  assert.equal(next({plan: one, now: '11:30'}).state, 'upcoming');
  assert.equal(next({plan: one, now: '11:29'}).state, 'none');
  assert.equal(next({plan: one, now: '12:30'}).state, 'ready');
  assert.equal(next({plan: one, now: '14:30'}).state, 'ready');
  assert.equal(next({plan: one, now: '14:31'}).reason, 'outside-window');
});

test('recorded meals are excluded and complete day has no new consumption suggestion', () => {
  assert.equal(next({now: '16:00', recordedMealIds: ['snack']}).state, 'none');
  assert.equal(next({recordedMealIds: plan.refeicoes.map(x => x.id)}).reason, 'all-recorded');
});

test('plan future start is respected; overdue review keeps the current plan available', () => {
  assert.equal(next({plan: {...plan, startOn: '2026-10-10'}}).state, 'not-started');
  assert.equal(next({plan: {...plan, inicio: '2026-10-10'}}).state, 'not-started');
  assert.equal(next({plan: {...plan, endOn: '2026-10-01'}}).meal.id, 'snack');
  assert.equal(next({plan: {...plan, ativo: false}}).reason, 'inactive-plan');
});

test('numeric weekdays are respected and written context never guesses a schedule', () => {
  const configured = {dias: 'dias de trabalho', refeicoes: [meal('monday', '16:00', {dias: [1]}), meal('friday', '16:00', {dias: [5]})]};
  assert.equal(next({plan: configured}).meal.id, 'friday');
  assert.equal(next({plan: {...configured, dias: [1]}}).reason, 'no-meals-today');
});

test('out-of-order schedules are chronological; untimed meals keep an honest fallback', () => {
  assert.equal(next({plan: {refeicoes: [meal('dinner', '19:30'), meal('snack', '16:00'), meal('breakfast', '07:30')]}}).meal.id, 'snack');
  assert.equal(next({plan: {refeicoes: [meal('routine', '')]}}).reason, 'without-time');
  assert.equal(next({now: '25:30'}).reason, 'invalid-time');
  assert.equal(next({plan: null}).reason, 'no-plan');
});

test('identical meal times keep original ordering before and after that time', () => {
  const sameTime = {refeicoes: [meal('first', '16:00'), meal('second', '16:00')]};
  assert.equal(next({plan: sameTime, now: '15:30'}).meal.id, 'first');
  assert.equal(next({plan: sameTime, now: '16:30'}).meal.id, 'first');
  assert.equal(next({plan: sameTime, now: '16:30', recordedMealIds: ['first']}).meal.id, 'second');
});

test('Date context uses its local calendar and never suggests editing another day', () => {
  const local = new Date(2026, 9, 9, 15, 0);
  assert.equal(next({now: local}).meal.id, 'snack');
  assert.equal(next({now: new Date(2026, 9, 10, 15, 0)}).reason, 'different-day');
});

test('summaries and contextual selection never mutate caller data', () => {
  const input = {logs: [log(TODAY, {meals: ['lunch', 'lunch']})], records: [journal('j'), goal('g', 3)], plan};
  const before = structuredClone(input);
  summary(input);
  mealPresence({patientId: 'a', day: TODAY, ...input, planVersion: 2});
  next({plan: input.plan});
  assert.deepEqual(input, before);
});

let failures = 0;
for (const {name, fn} of tests) {
  try { fn(); process.stdout.write('PASS ' + name + '\n'); }
  catch (error) { failures++; process.stderr.write('FAIL ' + name + '\n' + error.stack + '\n'); }
}
process.stdout.write(`${tests.length - failures}/${tests.length} care-progress checks passed\n`);
if (failures) process.exitCode = 1;
