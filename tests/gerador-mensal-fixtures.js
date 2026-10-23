'use strict';
const Core = require('../assets/gerador-mensal-core.js');
const Catalog = require('../assets/gerador-mensal-catalogo.js');
function state() {
  const config = Core.defaultConfig();
  Object.assign(config, { approved: true, author: 'Personal fictício de teste', date: '2026-10-23' });
  return {
    config: { dia1Off: true, zapFilaOff: true }, _exSeed: 1, _exSeed2: 1,
    alunos: [{ id: 'gm-test-a', nome: 'Aluno mensal sintético', ativo: true, nasc: '1990-01-01',
      anamnese: { nivel: 'intermediário', dias: '3', doencas: 'nenhuma informada' }, retorno: {},
      geradorMensal: { period: { start: '2026-10-01', end: '2026-10-31' }, nextPeriod: { start: '2026-11-01', end: '2026-11-30' }, config,
        perfil: { age: 36, healthStatus: 'none', conditions: [], functional: { unavailable: [], available: [] },
          level: 'intermediario', returning: false, objective: 'hipertrofia', secondaryObjective: '', priorities: [],
          days: [1, 3, 5], minutes: 60, equipment: Catalog.equipment.slice(), preferences: { prefer: [], avoid: [] },
          recovery: 'boa', physiology: {}, source: 'personal', reviewedAt: '2026-10-23T12:00:00Z' } } },
      { id: 'gm-test-b', nome: 'Outro aluno sintético', ativo: true, anamnese: {} }],
    treinosV2: { 'gm-test-a': { fichas: [], plano: { dias: {}, datas: {} } }, 'gm-test-b': { fichas: [{ id: 'other', titulo: 'Preservar outro aluno', itens: [] }] } },
    avaliacoes: [], exercicios: Catalog.exercises.map(x => JSON.parse(JSON.stringify(x))), sessoes: [], pagamentos: [], treinos: {}
  };
}
function decision(extra) { return Object.assign({ author: 'Personal fictício de teste', at: '2026-10-23T12:00:00Z', status: 'confirmed', techniqueConfirmed: true, effortConfirmed: true, targetMet: true }, extra || {}); }
module.exports = { state, decision };
