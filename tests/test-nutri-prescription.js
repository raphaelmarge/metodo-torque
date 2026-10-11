'use strict';
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const path = require('node:path');

(async () => {
  const {duplicateMeal, duplicateFood, movePrescriptionItem, latestAnamnesis, publicationError, mealDaysLabel} = await import(pathToFileURL(path.join(__dirname, '../nutri/prescription.js')));
  let sequence = 0, checks = 0;
  const uid = () => 'new-' + ++sequence;
  const item = {id: 'food-a', alimId: 'catalog-a', nome: 'Arroz', porcao: '100 g', qtd: 2, k: 130, pt: 3, cb: 28, g: 0, substituicoes: [{id: 'alt-a', alimId: 'catalog-b', nome: 'Batata', qtd: 1}]};
  const source = {titulo: 'Plano original', refeicoes: [{id: 'meal-a', titulo: 'Almoço', hora: '12:30', dias: [1, 3, 5], receitaId: 'recipe-a', itens: [item, {...item, id: 'food-b', substituicoes: []}]}, {id: 'meal-b', titulo: 'Jantar', hora: '19:30', itens: [item]}], receitas: [{id: 'recipe-a', nome: 'Preparo', ing: ['Arroz']}]};
  const original = structuredClone(source);
  const pass = message => { checks++; console.log('PASS ' + message); };
  const mealCopy = duplicateMeal(source, 0, uid), duplicate = mealCopy.refeicoes[1];
  assert.deepEqual(source, original);
  assert.equal(mealCopy.refeicoes[2].id, 'meal-b');
  assert.equal(new Set([duplicate.id, ...duplicate.itens.map(x => x.id), duplicate.itens[0].substituicoes[0].id]).size, 4);
  assert.equal(duplicate.itens[0].alimId, item.alimId);
  assert.equal(duplicate.receitaId, 'recipe-a');
  assert.deepEqual(duplicate.dias, [1, 3, 5]);
  duplicate.itens[0].qtd = 8;
  duplicate.itens[0].substituicoes[0].qtd = 9;
  duplicate.dias.push(6);
  assert.deepEqual(mealCopy.refeicoes[0], source.refeicoes[0]);
  pass('duplicating a meal creates independent meal/food/alternative IDs and preserves recipe/catalog references');

  const foodCopy = duplicateFood(source, 0, 0, uid);
  assert.notEqual(foodCopy.refeicoes[0].itens[1].id, item.id);
  assert.notEqual(foodCopy.refeicoes[0].itens[1].substituicoes[0].id, item.substituicoes[0].id);
  foodCopy.refeicoes[0].itens[1].substituicoes[0].nome = 'Outra alternativa';
  assert.deepEqual(source, original);
  assert.equal(foodCopy.refeicoes[0].itens[0].substituicoes[0].nome, 'Batata');
  pass('duplicating a food preserves the source and independently copies substitutions');

  const reordered = movePrescriptionItem(source, 0, null, 1);
  assert.deepEqual(reordered.refeicoes.map(x => x.id), ['meal-b', 'meal-a']);
  assert.deepEqual(reordered.refeicoes[1], original.refeicoes[0]);
  const foodsReordered = movePrescriptionItem(source, 0, 0, 1);
  assert.deepEqual(foodsReordered.refeicoes[0].itens.map(x => x.id), ['food-b', 'food-a']);
  assert.deepEqual(movePrescriptionItem(source, 0, null, -1), source);
  assert.throws(() => movePrescriptionItem(source, 0, null, 9), /Movimento/);
  assert.deepEqual(source, original);
  pass('reordering meals/foods preserves identity, content and the original working copy');

  assert.throws(() => duplicateMeal({...source, refeicoes: Array(12).fill(source.refeicoes[0])}, 0, uid), /12 refeições/);
  assert.throws(() => duplicateFood({...source, refeicoes: [{...source.refeicoes[0], itens: Array(50).fill(item)}]}, 0, 0, uid), /50 alimentos/);
  pass('copy operations enforce existing prescription size limits');

  const records = [{id: 'older', patient_id: 'p1', kind: 'anamnesis', created_at: '2026-09-01', data: {}}, {id: 'newer', patient_id: 'p1', kind: 'anamnesis', created_at: '2026-10-01', data: {}}, {id: 'other-patient', patient_id: 'p2', kind: 'anamnesis', created_at: '2026-10-11', data: {}}, {id: 'archived', patient_id: 'p1', kind: 'anamnesis', created_at: '2026-10-12', data: {archived: true}}];
  assert.equal(latestAnamnesis(records, 'p1').id, 'newer');
  assert.equal(latestAnamnesis(records, 'p3'), null);
  assert.equal(latestAnamnesis(records, 'p1'), records[1]);
  pass('context reads the latest nonarchived anamnesis of the selected patient without making a second source');

  assert.equal(publicationError(source), '');
  assert.match(publicationError({refeicoes: []}), /Adicione/);
  assert.match(publicationError({refeicoes: [{titulo: '', itens: [item]}]}), /nome/);
  assert.match(publicationError({refeicoes: [{titulo: 'Almoço', hora: '25:00', itens: [item]}]}), /horários/);
  assert.match(publicationError({refeicoes: [{titulo: 'Almoço', dias: [7], itens: [item]}]}), /dias/);
  assert.equal(mealDaysLabel([]), 'Todos os dias');
  assert.equal(mealDaysLabel([1, 3, 5]), 'Seg, Qua, Sex');
  pass('publication requires complete meals and valid schedules, with readable days');
  console.log(checks + ' prescription checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
