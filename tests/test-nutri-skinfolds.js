'use strict';
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const path = require('node:path');

(async () => {
 const {SKINFOLD_PROTOCOLS, calculateSkinfolds} = await import(pathToFileURL(path.join(__dirname, '../nutri/skinfolds.js')));
 let checks = 0;
 const test = (name, run) => {run(); checks++; console.log('PASS ' + name);};
 const approximately = (actual, expected, tolerance = 1e-10) => assert(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
 const request = (protocol = 'p3', sex = 'M', age = 30) => ({protocol, sex, age, skinfolds: {chest: 10, abdominal: 20, thigh: 30, triceps: 10, suprailiac: 20, subscapular: 10, midaxillary: 20, thighProximal: 30}});
 const failure = (input, code) => {
  const result = calculateSkinfolds(input);
  assert.equal(result.ok, false);
  assert.equal(result.code, code);
  assert.equal(typeof result.error, 'string');
  assert(result.error.length > 10);
  for (const key of ['fat', 'density', 'sum', 'sites']) assert.equal(Object.hasOwn(result, key), false, 'No partial result on error');
 };

 // Literal reference vectors were expanded by hand before invoking the module.
 // P3 M: 1.10938 - .049602 + .00576 - .007722 = 1.057816.
 // P3 F: 1.0994921 - .059574 + .00828 - .004176 = 1.0440221.
 // P7 M: 1.112 - .0608986 + .01078 - .0086478 = 1.0532336.
 // P7 F: 1.097 - .0657594 + .010976 - .0038484 = 1.0383682.
 // Guedes uses a sum of 100 mm, so log10(sum) is exactly 2.
 // Fat references are the decimal quotients 495/density - 450, not a second
 // implementation of the protocol equations inside the assertions.
 const vectors = [
  ['p3', 'M', 30, {chest: 10, abdominal: 20, thigh: 30}, 60, 1.057816, 17.945275927004318],
  ['p3', 'F', 30, {triceps: 10, suprailiac: 20, thigh: 30}, 60, 1.0440221, 24.127894419093236],
  ['p7', 'M', 30, {chest: 20, midaxillary: 20, triceps: 20, subscapular: 20, abdominal: 20, suprailiac: 20, thigh: 20}, 140, 1.0532336, 19.981208347322],
  ['p7', 'F', 30, {chest: 20, midaxillary: 20, triceps: 20, subscapular: 20, abdominal: 20, suprailiac: 20, thigh: 20}, 140, 1.0383682, 26.709514024023463],
  ['guedes', 'M', 22, {triceps: 20, suprailiac: 30, abdominal: 50}, 100, 1.03724, 27.228028228760943],
  ['guedes', 'F', 22, {subscapular: 30, suprailiac: 30, thighProximal: 40}, 100, 1.02524, 32.81378018805353]
 ];
 for (const [protocol, sex, age, skinfolds, sum, density, fat] of vectors) test(`${protocol} ${sex}: independent density and Siri reference`, () => {
  const result = calculateSkinfolds({protocol, sex, age, skinfolds});
  assert.equal(result.ok, true);
  assert.equal(result.protocol, protocol);
  assert.equal(result.sex, sex);
  assert.equal(result.age, age);
  assert.equal(result.formulaVersion, 1);
  assert.equal(result.sum, sum);
  approximately(result.density, density, 1e-12);
  approximately(result.fat, fat);
  assert.deepEqual(result.sites, skinfolds);
  assert.notEqual(result.fat, Math.round(result.fat * 10) / 10, 'Keep precision for the saved calculation');
 });

 test('Metadata lists the exact sex-specific sites and original age ranges', () => {
  assert.deepEqual(SKINFOLD_PROTOCOLS.map(x => x.id), ['p3', 'p7', 'guedes']);
  const [p3, p7, guedes] = SKINFOLD_PROTOCOLS;
  assert.deepEqual(p3.sites, {M: ['chest', 'abdominal', 'thigh'], F: ['triceps', 'suprailiac', 'thigh']});
  assert.deepEqual(p7.sites.M, ['chest', 'midaxillary', 'triceps', 'subscapular', 'abdominal', 'suprailiac', 'thigh']);
  assert.deepEqual(p7.sites.F, p7.sites.M);
  assert.deepEqual(guedes.sites, {M: ['triceps', 'suprailiac', 'abdominal'], F: ['subscapular', 'suprailiac', 'thighProximal']});
  for (const definition of [p3, p7]) assert.deepEqual(definition.ageRanges, {M: [18, 61], F: [18, 55]});
  assert.deepEqual(guedes.ageRanges, {M: [17, 27], F: [17, 29]});
  assert(SKINFOLD_PROTOCOLS.every(x => x.ageRequired === true && typeof x.reference === 'string'));
  assert.equal(p3.usesAge, true); assert.equal(p7.usesAge, true); assert.equal(guedes.usesAge, false);
 });

 test('No protocol or sex defaults are inferred from absent or unsupported inputs', () => {
  for (const input of [undefined, null, false, '', {}, {protocol: 'unknown'}, {protocol: 'P3'}]) failure(input, 'UNKNOWN_PROTOCOL');
  for (const sex of [undefined, null, '', 'm', 'f', 'other', true, 0, {}, ['M']]) failure({...request(), sex}, 'INVALID_SEX');
 });

 test('All protocols require an explicit numeric age in complete years', () => {
  for (const protocol of ['p3', 'p7', 'guedes']) {
   for (const age of [undefined, null, '']) failure({...request(protocol), age}, 'AGE_REQUIRED');
   for (const age of ['22', ' ', true, false, {}, [], 22.5, NaN, Infinity, -Infinity]) failure({...request(protocol), age}, 'INVALID_AGE');
  }
  assert.match(calculateSkinfolds({...request('guedes'), age: null}).error, /não entra na equação/);
 });

 test('Age range limits are inclusive and never silently extrapolated', () => {
  for (const definition of SKINFOLD_PROTOCOLS) for (const sex of ['M', 'F']) {
   const [minimum, maximum] = definition.ageRanges[sex];
   for (const age of [minimum, maximum]) assert.equal(calculateSkinfolds(request(definition.id, sex, age)).ok, true);
   for (const age of [minimum - 1, maximum + 1, -1, 0, 130]) failure(request(definition.id, sex, age), 'AGE_OUT_OF_RANGE');
  }
 });

 test('Age affects Pollock density but Guedes uses age only for applicability', () => {
  for (const sex of ['M', 'F']) {
   for (const protocol of ['p3', 'p7']) assert(calculateSkinfolds(request(protocol, sex, 18)).density > calculateSkinfolds(request(protocol, sex, 40)).density);
   const early = calculateSkinfolds(request('guedes', sex, 17));
   const later = calculateSkinfolds(request('guedes', sex, 27));
   assert.equal(early.density, later.density); assert.equal(early.fat, later.fat);
   assert.equal(early.age, 17); assert.equal(later.age, 27);
  }
 });

 test('Missing and invalid required skinfolds never become zero or partial calculations', () => {
  for (const skinfolds of [undefined, null, false, 0, [], '10,20,30']) failure({...request(), skinfolds}, 'MISSING_SKINFOLDS');
  for (const protocol of SKINFOLD_PROTOCOLS) for (const sex of ['M', 'F']) for (const key of protocol.sites[sex]) {
   const input = request(protocol.id, sex, 22);
   delete input.skinfolds[key]; failure(input, 'MISSING_SKINFOLD');
   for (const value of [undefined, null, '']) failure({...input, skinfolds: {...input.skinfolds, [key]: value}}, 'MISSING_SKINFOLD');
   for (const value of [0, -1, 150.001, NaN, Infinity, -Infinity, '10', '10,5', ' ', true, false, {}, [], new Number(10)]) failure({...input, skinfolds: {...input.skinfolds, [key]: value}}, 'INVALID_SKINFOLD');
  }
 });

 test('Fractional millimetres and the 150 mm input boundary are retained without rounding', () => {
  const input = request(); input.skinfolds = {chest: 10.125, abdominal: 20.25, thigh: 30.0625};
  const result = calculateSkinfolds(input); assert.equal(result.ok, true); assert.equal(result.sum, 60.4375); assert.deepEqual(result.sites, input.skinfolds);
  const upper = calculateSkinfolds({...request('guedes', 'M', 22), skinfolds: {triceps: 150, suprailiac: 10, abdominal: 10}});
  assert.equal(upper.ok, true); assert.equal(upper.sum, 170); assert.equal(upper.sites.triceps, 150);
 });

 test('Unrelated sites do not affect the sum and do not appear in the result snapshot', () => {
  const original = calculateSkinfolds(request());
  const input = request(); Object.assign(input.skinfolds, {biceps: Infinity, calf: -99, unknown: 1000, triceps: NaN, suprailiac: 150});
  const result = calculateSkinfolds(input); assert.deepEqual(result, original);
  const inherited = Object.create({chest: 10}); Object.assign(inherited, {abdominal: 20, thigh: 30});
  failure({...request(), skinfolds: inherited}, 'MISSING_SKINFOLD');
 });

 test('Guedes female proximal thigh is distinct from the Pollock thigh measurement', () => {
  const input = request('guedes', 'F', 29);
  const original = calculateSkinfolds(input); assert.equal(original.ok, true);
  const changedPollock = {...input, skinfolds: {...input.skinfolds, thigh: 150}};
  assert.deepEqual(calculateSkinfolds(changedPollock), original);
  delete changedPollock.skinfolds.thighProximal;
  failure(changedPollock, 'MISSING_SKINFOLD');
  assert.match(calculateSkinfolds(changedPollock).error, /Coxa proximal/);
 });

 test('Invalid calculated percentages are rejected without clamping to the assessment field limits', () => {
  failure({...request('p3', 'M', 18), skinfolds: {chest: 0.01, abdominal: 0.01, thigh: 0.01}}, 'INVALID_RESULT');
  failure({...request('p7', 'M', 18), skinfolds: Object.fromEntries(SKINFOLD_PROTOCOLS[1].sites.M.map(key => [key, 150]))}, 'INVALID_RESULT');
  failure({...request('guedes', 'F', 22), skinfolds: {subscapular: 0.01, suprailiac: 0.01, thighProximal: 0.01}}, 'INVALID_RESULT');
 });

 test('Input, returned site snapshots and public protocol definitions remain independent', () => {
  const input = request(); const before = structuredClone(input); Object.freeze(input.skinfolds); Object.freeze(input);
  const result = calculateSkinfolds(input); assert.equal(result.ok, true); result.sites.chest = 99;
  assert.deepEqual(input, before); assert.equal(calculateSkinfolds(input).sites.chest, 10);
  const definitionsBefore = JSON.stringify(SKINFOLD_PROTOCOLS);
  assert.throws(() => SKINFOLD_PROTOCOLS.push({}), TypeError);
  assert.throws(() => { SKINFOLD_PROTOCOLS[0].sites.M[0] = 'calf'; }, TypeError);
  assert.throws(() => { SKINFOLD_PROTOCOLS[2].ageRanges.F[1] = 99; }, TypeError);
  assert.equal(JSON.stringify(SKINFOLD_PROTOCOLS), definitionsBefore);
 });

 console.log(`${checks} skinfold calculation checks passed.`);
})().catch(error => {console.error(error); process.exitCode = 1;});
