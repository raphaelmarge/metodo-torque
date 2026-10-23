'use strict';
const assert = require('node:assert/strict');
const A = require('../assets/personal-gerador-mensal-adapter.js');
const C = require('../assets/gerador-mensal-catalogo.js');
function state() {
  return { alunos: [{ id: 'a', nome: 'Aluno sintético', nasc: '1990-10-15', anamnese: { nivel: 'intermediário' },
    geradorMensal: { period: { start: '2026-10-01', end: '2026-10-31' }, nextPeriod: { start: '2026-11-01', end: '2026-11-30' } },
    retorno: { feitos: { '2026-10-05': true, '2026-10-06': true }, rpe: { '2026-10-05': 3 }, cargas: { Exercicio: [
      { g: 2, feito: true, d: '2026-10-05', hid: 's1', i: '0:0:0', serie: 1, exercicioId: 'ex', r: 10, kg: 20 },
      { g: 2, feito: false, d: '2026-10-05', hid: 's1', i: '0:0:1', serie: 2, exercicioId: 'ex', r: 10, kg: 20 },
      { g: 1, d: '2026-10-05', kg: 100 },
      { g: 2, feito: true, d: '2026-09-30', r: 10, kg: 20 }
    ] } } }], exercicios: [{ id: 'bad', nome: C.exercises[0].nome }],
    treinosV2: { a: { fichas: [{ id: 'f', titulo: 'Ficha', itens: [] }], plano: { dias: { '1': [{ tp: 'ficha', id: 'f' }], '6': [{ tp: 'ficha', id: 'f' }] }, datas: { '2026-10-06': [{ tp: 'ficha', id: 'f', h: '08:00' }, { tp: 'ficha', id: 'f', h: '18:00' }], '2026-10-12': [] } } } }, avaliacoes: [] };
}
let n = 0;
function test(label, fn) { fn(); console.log('OK ' + label); n++; }
test('build é determinístico, isolado e não modifica o estado', () => {
  const s = state(), before = JSON.stringify(s), a = A.build(s, 'a');
  assert.deepEqual(a, A.build(s, 'a')); assert.equal(JSON.stringify(s), before); assert.equal(a.student.geradorMensal.perfil.age, 36);
  a.training.previousFichas[0].titulo = 'Alterado'; assert.equal(s.treinosV2.a.fichas[0].titulo, 'Ficha');
  assert.throws(() => A.build(s, 'outro'), /Aluno não encontrado/);
});
test('apenas séries concluídas entram e a escala legada não vira RPE', () => {
  const logs = A.build(state(), 'a').training.logs;
  assert.equal(logs.length, 1); assert.equal(logs[0].sessionId, 's1'); assert.equal(logs[0].sessionEffort, 3);
  assert.equal(logs[0].rpe, null); assert.equal(logs[0].equipment, ''); assert.equal(logs[0].loadBasis, ''); assert.equal(logs[0].variation, '');
});
test('mês inteiro, descanso explícito e duas sessões na mesma data', () => {
  const rows = A.build(state(), 'a').training.plannedSessions;
  assert.equal(rows.length, 10); assert.ok(rows.some(r => r.date === '2026-10-31'));
  assert.ok(!rows.some(r => r.date === '2026-10-12')); assert.equal(rows.find(r => r.date === '2026-10-05').status, 'completed');
  assert.equal(rows.filter(r => r.date === '2026-10-06' && r.status === 'unknown').length, 2);
  assert.equal(new Set(rows.map(r => r.id)).size, rows.length);
});
test('falta e pausa exigem confirmação explícita do personal', () => {
  const s = state(), row = A.build(s, 'a').training.plannedSessions[0];
  s.alunos[0].geradorMensal.sessionReviews = { [row.id]: { status: 'paused', reviewed: false } };
  assert.equal(A.build(s, 'a').training.plannedSessions[0].status, 'unknown');
  s.alunos[0].geradorMensal.sessionReviews[row.id].reviewed = true;
  assert.equal(A.build(s, 'a').training.plannedSessions[0].eligible, false);
});
test('não importa compatibilidade clínica pelo nome do exercício', () => {
  const result = A.build(state(), 'a'); assert.equal(result.catalog.length, C.exercises.length); assert.ok(!result.catalog.some(x => x.id === 'bad'));
  assert.equal(result.student.geradorMensal.perfil.healthStatus, 'unknown'); assert.equal(result.student.geradorMensal.perfil.reviewedAt, undefined);
});
test('revisões de saúde preservam autoria e ficam pendentes até revisão explícita', () => {
  const s = state(); s.alunos[0].geradorMensal.active = { id: 'c1' };
  const revision = { id: 'r1', cycleId: 'c1', kind: 'health', createdAt: '2026-10-15T10:00:00Z', author: 'aluno', data: { symptoms: 'sim', healthChanges: 'Dor nova' } };
  s.alunos[0].retorno.geradorMensal = { version: 1, reports: { c1: { revisions: { r1: revision } } } };
  let input = A.build(s, 'a'); assert.equal(input.training.monthReport.pendingHealthReview, true); assert.equal(input.student.geradorMensal.perfil.pendingHealthReview, true);
  s.alunos[0].geradorMensal.healthReviewedRevisionIds = ['r1']; input = A.build(s, 'a'); assert.equal(input.training.monthReport.pendingHealthReview, false);
  assert.deepEqual(input.training.monthReport.allRevisions, [revision]);
});
test('avaliações preservam método, câmera não vira medida de fita', () => {
  const s = state(); s.avaliacoes = [{ id: 'av1', alunoId: 'a', data: '2026-10-01', peso: 70, cintura: 80, gordura: 20, gorduraFonte: 'dobras', metodoDobras: 'p3', scan: { circ: { cintura: 85 } } }, { id: 'outro', alunoId: 'b', data: '2026-10-01', peso: 99 }];
  const rows = A.build(s, 'a').assessments; assert.equal(rows.length, 3); assert.equal(rows.find(r => r.method === 'dobras:p3').measurements.gordura.unit, '%');
  assert.equal(rows.find(r => r.method === 'estimativa-foto').measurements.cintura.value, 85);
  assert.equal(rows.find(r => r.id === 'av1:medidas').measurements.cintura.value, 80);
});
test('anamnese relatada não herda revisão profissional e mantém origem', () => {
  const s = state(); s.alunos[0].anamnese.geradorMensal = { age: 30, source: 'aluno', status: 'relatada', healthStatus: 'reported', conditions: [{ id: 'diabetes' }] };
  const input = A.build(s, 'a'); assert.equal(input.student.geradorMensal.perfil.source, 'aluno'); assert.equal(input.student.geradorMensal.perfil.reviewedAt, undefined);
  assert.equal(input.student.reportedProfile.conditions[0].id, 'diabetes');
});
test('água de bioimpedância conserva litros do formulário de origem', () => {
  const s = state(); s.avaliacoes = [{ id: 'bia', alunoId: 'a', data: '2026-10-01', bia: { agua: 42, mme: 30 } }];
  const a = A.build(s, 'a').assessments[0]; assert.equal(a.measurements.agua.unit, 'L'); assert.equal(a.measurements.mme.unit, 'kg');
});
console.log(n + ' cenários do adaptador mensal passaram.');
