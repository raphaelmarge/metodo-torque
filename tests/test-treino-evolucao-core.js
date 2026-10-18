/* Fichas e registros fictícios: nenhuma rede, banco ou conta real. */
'use strict';
const assert = require('node:assert/strict');
const T = require('../assets/personal-treino-evolucao');
const V = require('../app/treino-evolucao');
const H = require('../app/treino-historico-core');
const P = require('../assets/studio-patches');
const A = require('../assets/acompanhamento');
let count = 0;
function test(name, fn) { fn(); count++; console.log('OK ' + name); }
const copy = x => JSON.parse(JSON.stringify(x));
const bank = [{ id: 'ex-a', nome: 'Movimento A', grupo: 'Peito', descricao: 'Orientação', semGif: true, semVideo: true, video: 'https://invalid.example/video' }, { id: 'ex-b', nome: 'Movimento B', grupo: 'Costas' }];
const ficha = { id: 'f-a', titulo: 'A — Completo', capa: 'preservada.jpg', p2: { n: 'Alongamento', l: [{ t: 'Mobilidade', v: '5 min' }] }, itens: [{ exId: 'ex-a', series: 2, reps: '10', carga: 20, descanso: 0, obs: 'Controlar', tec: 'bi', rpe: 7 }, { exId: 'ex-b', series: 1, reps: '30 s', carga: null, descanso: 60 }] };
const stamp = '2026-10-17T15:00:00.000Z';
const draft = { tipo: 'curto', titulo: 'Hoje tenho 20 min', minutos: 20, itens: [copy(ficha.itens[0])] };
function saved() { return T.saveDraft(ficha, draft, bank, stamp, 'v-a'); }
function approved() { return T.approve(saved(), 'v-a', stamp); }
function state(f) { return { exercicios: bank, treinosV2: { aluno: { fichas: [f] } } }; }
test('rascunho separado não modifica a ficha original nem é exportado', () => {
  const before = copy(ficha), f = saved(); assert.deepEqual(ficha, before); assert.deepEqual(T.base(f), T.base(ficha)); assert.equal(T.exporta(state(f), 'aluno').length, 0);
});
test('aprovação explícita exporta somente o aluno escolhido, com identidade e versão', () => {
  const out = T.exporta(state(approved()), 'aluno'); assert.equal(out.length, 1); assert.equal(T.exporta(state(approved()), 'outro').length, 0);
  const g = out[0].variantes[0].guia; assert.equal(g.fichaId, ficha.id); assert.equal(g.varianteId, 'v-a'); assert.equal(g.varianteVersao, 1); assert.equal(g.it[0].s, 2); assert.equal(g.it[0].seriesDetalhadas[0].descanso, 0); assert.equal(g.it[0].rpePorSerie[0], 7);
});
test('sem vídeo/sem GIF e orientações permanecem respeitados', () => {
  const it = T.exporta(state(approved()), 'aluno')[0].variantes[0].guia.it[0]; assert.equal(it.v, ''); assert.equal(it.m, false); assert.equal(it.ob, 'Controlar'); assert.equal(it.tc, 'bi');
});
test('publicação não expõe rascunho que altera a última versão aprovada', () => {
  const f = T.saveDraft(approved(), { ...draft, titulo: 'Novo rascunho', itens: [ficha.itens[1]] }, bank, stamp, 'v-a');
  assert.equal(T.exporta(state(f), 'aluno')[0].variantes[0].titulo, draft.titulo); assert.equal(f.variantes[0].rascunho.titulo, 'Novo rascunho');
});
test('nova aprovação versiona e preserva o snapshot anterior', () => {
  const f = T.approve(T.saveDraft(approved(), { ...draft, titulo: 'Versão revisada' }, bank, stamp, 'v-a'), 'v-a', stamp);
  assert.equal(f.variantes[0].aprovada.versao, 2); assert.equal(f.variantes[0].historico[0].versao, 1); assert.equal(f.variantes[0].historico[0].titulo, draft.titulo);
});
test('mudança da ficha original impede exportação/aprovação obsoleta', () => {
  const f = approved(); f.itens[0].reps = '8'; assert.deepEqual(T.exporta(state(f), 'aluno'), []);
  const pending = saved(); pending.itens[0].carga = 30; assert.throws(() => T.approve(pending, 'v-a', stamp), /original mudou/);
});
test('retirada mantém histórico e rascunho mas não publica a versão', () => {
  const f = T.revoke(approved(), 'v-a', stamp); assert.deepEqual(T.exporta(state(f), 'aluno'), []); assert.equal(f.variantes[0].historico[0].retiradaEm, stamp); assert.ok(f.variantes[0].rascunho);
});
test('exercício removido não produz versão parcial para aluno', () => {
  const s = state(approved()); s.exercicios = []; assert.deepEqual(T.exporta(s, 'aluno'), []);
});
test('carga zero/vazia e descanso zero permanecem distintos', () => {
  assert.deepEqual(T.series({ series: 1, reps: '10', carga: null, descanso: 0 }), [{ reps: '10', carga: null, descanso: 0 }]);
  assert.equal(T.series({ series: 1, reps: '10', carga: '0', descanso: 0 })[0].carga, 0);
});
test('validações bloqueiam versão vazia, exercício inválido e limites', () => {
  assert.throws(() => T.saveDraft(ficha, { ...draft, itens: [] }, bank, stamp, 'v'), /1 a 40/);
  assert.throws(() => T.saveDraft(ficha, { ...draft, itens: [{ exId: 'nao-existe' }] }, bank, stamp, 'v'), /biblioteca/);
  assert.throws(() => T.saveDraft(ficha, { ...draft, tipo: 'automatica' }, bank, stamp, 'v'), /versão/);
  assert.throws(() => T.saveDraft(ficha, { ...draft, minutos: 0 }, bank, stamp, 'v'), /valores/);
  assert.throws(() => T.series({ series: 1, reps: '10', carga: -1 }), /valores/);
  assert.throws(() => T.series({ series: 1, seriesDetalhadas: Array(31).fill({ reps: '10', descanso: 0 }) }), /30/);
});
const record = (d, extra = {}) => ({ d, g: 2, i: '0:0:0', serie: 1, exercicioId: 'ex-a', kg: 20, r: 10, rpe: 7, feito: true, ...extra });
const loads = { 'Movimento A': [record('2026-10-10'), record('2026-10-15')] };
function proposal(input = loads, f = ficha) { return T.propose(f, bank, input, '2026-10-17', 0); }
test('duas sessões concluídas com carga atual/meta/RPE sugerem incremento moderado', () => {
  const p = proposal(); assert.equal(p.rows[0].eligible, true); assert.equal(p.rows[0].after.carga, 20.5); assert.equal(p.rows[1].eligible, false); assert.equal(ficha.itens[0].carga, 20);
});
test('nenhuma progressão automática com apenas uma sessão', () => { assert.equal(proposal({ 'Movimento A': [record('2026-10-15')] }).rows[0].eligible, false); });
test('duas repetições do mesmo dia não contam como duas sessões independentes', () => { assert.equal(proposal({ 'Movimento A': [record('2026-10-15'), record('2026-10-15')] }).rows[0].eligible, false); });
test('registros antigos, futuros, parciais, sem identidade, outra série ou variante são excluídos', () => {
  const bad = [record('2026-08-01'), record('2026-10-18'), record('2026-10-15', { feito: false }), record('2026-10-15', { exercicioId: undefined }), record('2026-10-15', { serie: 2 }), record('2026-10-15', { i: '1:0:0' }), record('2026-10-15', { varianteId: 'v-a' }), record('2026-10-15', { rpe: null }), record('2026-02-30')];
  assert.equal(proposal({ 'Movimento A': bad }).rows[0].evidence.length, 0);
});
test('RPE alto, carga diferente ou repetições incompletas não aumentam carga', () => {
  for (const change of [{ rpe: 9 }, { kg: 22 }, { r: 8 }]) assert.equal(proposal({ 'Movimento A': [record('2026-10-10', change), record('2026-10-15', change)] }).rows[0].eligible, false);
});
test('múltiplas sessões no dia não escondem esforço alto nem aceitam número booleano', () => {
  const p = proposal({ 'Movimento A': [record('2026-10-10'), record('2026-10-15'), record('2026-10-15', { rpe: 9 })] }); assert.equal(p.rows[0].eligible, false); assert.equal(p.rows[0].evidence[0].rpe, 9);
  assert.equal(proposal({ 'Movimento A': [record('2026-10-10', { rpe: true }), record('2026-10-15', { r: [10] })] }).rows[0].evidence.length, 0);
});
test('tempo/faixa de reps e peso do corpo exigem revisão manual', () => {
  for (const change of [{ reps: '8–12' }, { reps: '30 s' }, { carga: 0 }, { carga: null }]) { const f = copy(ficha); Object.assign(f.itens[0], change); assert.equal(proposal(loads, f).rows[0].eligible, false); }
});
test('revisão não aceita manter todas nem aprovação sem justificativa', () => {
  const p = proposal(); assert.throws(() => T.apply(ficha, p, [{ key: '0:0', action: 'manter' }], stamp, 'd'), /Selecione/);
  assert.throws(() => T.apply(ficha, p, [{ key: '0:0', action: 'aprovar', after: p.rows[0].after }], stamp, 'd'), /motivo/);
});
test('aprovação altera apenas a série escolhida e preserva RPE/observações/capa/parte 2', () => {
  const p = proposal(), f = T.apply(ficha, p, [{ key: '0:0', action: 'aprovar', after: { ...p.rows[0].after, rpe: undefined }, reason: 'Carga disponível conferida' }], stamp, 'd');
  assert.equal(f.itens[0].seriesDetalhadas[0].carga, 20.5); assert.equal(f.itens[0].seriesDetalhadas[1].carga, 20); assert.equal(f.itens[0].seriesDetalhadas[0].rpe, 7); assert.equal(f.capa, ficha.capa); assert.deepEqual(f.p2, ficha.p2); assert.deepEqual(f.itens[1], ficha.itens[1]); assert.equal(ficha.itens[0].carga, 20);
});
test('decisão mantém antes/depois/motivo/evidência sem reescrever execução', () => {
  const before = copy(loads), p = proposal(), f = T.apply(ficha, p, [{ key: '0:0', action: 'aprovar', after: p.rows[0].after, reason: 'Revisado pelo profissional' }], stamp, 'd');
  const h = f.evolucoes[0].alteracoes[0]; assert.equal(h.antes.carga, 20); assert.equal(h.depois.carga, 20.5); assert.equal(h.registros.length, 2); assert.deepEqual(loads, before);
});
test('revisão obsoleta e duplicada são recusadas', () => {
  const p = proposal(), f = copy(ficha); f.itens[0].carga = 25; const decision = { key: '0:0', action: 'aprovar', after: p.rows[0].after, reason: 'Revisado' };
  assert.throws(() => T.apply(f, p, [decision], stamp, 'd'), /mudou/); assert.throws(() => T.apply(ficha, p, [decision, decision], stamp, 'd'), /duplicada/);
});
function memory() { const rows = new Map(); return { get length() { return rows.size; }, key: i => [...rows.keys()][i], getItem: k => rows.get(k) || null, setItem: (k, v) => rows.set(k, v), removeItem: k => rows.delete(k) }; }
function env() {
  const storage = memory(); let active = true, counter = 0, currentId = null, failed = false;
  const journal = H.create({ storage, scope: 'ficticio-aluno', actor: 'aparelho-teste', active: () => active, now: () => new Date(stamp) });
  const original = { fichaId: 'f-a', n: ficha.titulo, it: [{ e: bank[0].nome, k: 'original:0', s: 2, r: '10', d: 0, exercicioId: 'ex-a', carga: 20 }] };
  const C = { guia: [copy(original)], identity: () => active, current: () => currentId ? journal.session(currentId) : null, changed: () => {}, start(fi, prescribed) { if (failed) return false; currentId = 'sessao-' + (++counter); journal.start({ id: currentId, kind: 'musculacao', date: '2026-10-17', prescribed }); return true; } };
  const definitions = T.exporta(state(approved()), 'aluno'); const api = V.runtime(definitions, C);
  return { C, api, journal, definitions, original, current: () => currentId, deny: () => { active = false; }, fail: x => { failed = x; } };
}
test('aluno escolhe variante sem modificar prescrição original', () => { const e = env(); e.api.select(0, 'v-a'); assert.equal(e.C.guia[0].varianteId, 'v-a'); assert.deepEqual(e.api.original(0), e.original); assert.notEqual(e.C.guia[0].it[0].k, e.original.it[0].k); });
test('registro da versão é ligado ao snapshot e preservado ao voltar ao completo', () => {
  const e = env(); e.api.select(0, 'v-a'); const sid = e.current(); e.journal.record({ id: 'registro', session: sid, target: '0:0:0', expected: [], value: { exercicioId: 'ex-a', kg: 20, r: 10, feito: true } }); e.journal.finish({ id: 'fim', session: sid, value: {} });
  e.api.select(0, ''); assert.equal(e.journal.list().length, 2); assert.equal(e.journal.session(sid).prescribed.varianteId, 'v-a'); assert.equal(e.journal.session(sid).targets['0:0:0'].value.kg, 20); assert.deepEqual(e.C.guia[0], e.original);
});
test('retomada após reload usa snapshot da versão já iniciada mesmo se retirada do pacote', () => {
  const e = env(); e.api.select(0, 'v-a'); const snapshot = copy(e.C.guia[0]); e.C.guia[0] = copy(e.original); const resumed = V.runtime([], e.C); resumed.restore(); assert.deepEqual(e.C.guia[0], snapshot);
});
test('assinatura do checkpoint continua idêntica após ordenação canônica do journal', () => {
  const e = env(); e.api.select(0, 'v-a'); const signature = JSON.stringify(e.C.guia);
  e.C.guia[0] = copy(e.original); const resumed = V.runtime(e.definitions, e.C); resumed.restore();
  assert.equal(JSON.stringify(e.C.guia), signature); assert.equal(JSON.stringify(resumed.original(0)), JSON.stringify(e.original));
});
test('troca de versão durante sessão aberta não apaga rascunho/execução', () => { const e = env(); e.api.select(0, 'v-a'); assert.throws(() => e.api.select(0, ''), /Conclua/); assert.equal(e.journal.list().length, 1); });
test('nova sessão após retirada usa original, nunca versão não aprovada', () => {
  const e = env(); e.api.select(0, 'v-a'); e.journal.finish({ id: 'fim', session: e.current(), value: {} }); e.C.guia[0] = copy(e.original); const resumed = V.runtime([], e.C); resumed.restore(); assert.ok(e.C.guia[0].varianteId); assert.equal(resumed.beforeNew(0, () => {}), false); assert.deepEqual(e.C.guia[0], e.original);
});
test('variante inexistente e mudança de identidade bloqueiam escrita', () => { const e = env(); assert.throws(() => e.api.select(0, 'outra'), /disponível/); e.deny(); assert.throws(() => e.api.select(0, 'v-a'), /acesso mudou/); });
test('falha local não confirma início nem apaga histórico anterior', () => { const e = env(); e.fail(true); assert.throws(() => e.api.select(0, 'v-a'), /Não foi possível/); assert.equal(e.journal.list().length, 0); e.fail(false); e.api.select(0, 'v-a'); assert.equal(e.journal.list().length, 1); });
test('snapshot de variante não é aplicado a outra ficha e não derruba o restante do app', () => { const e = env(); e.api.select(0, 'v-a'); e.C.guia[0] = { ...copy(e.original), fichaId: 'f-outro' }; const resumed = V.runtime([], e.C); assert.match(resumed.restore()[0], /mudou de posição/); assert.equal(e.C.guia[0].fichaId, 'f-outro'); assert.equal(resumed.beforeOpen(0, null, () => {}), true); });
test('IDs paralelos permitem retomar variante sem alterar assinatura do GUIA legado', () => {
  const e = env(); e.api.select(0, 'v-a'); const snapshot = copy(e.C.guia[0]); const legacy = copy(e.original); delete legacy.fichaId;
  e.C.guia[0] = legacy; e.C.fichaIds = ['f-a']; const resumed = V.runtime([], e.C); assert.deepEqual(resumed.original(0), legacy); resumed.restore(); assert.deepEqual(e.C.guia[0], snapshot);
});
test('patch incremental preserva variante/histórico e edição paralela de outro aluno', () => {
  const before = state(ficha); before.treinosV2.outro = { fichas: [{ ...copy(ficha), id: 'f-outro' }] };
  const after = copy(before); after.treinosV2.aluno.fichas[0] = approved(); const ops = P.diff(before, after);
  assert.deepEqual(ops[0].caminho, ['treinosV2', 'aluno', 'fichas', 'f-a']);
  const remote = copy(before); remote.treinosV2.outro.fichas[0].titulo = 'Edição em outra conta de aluno';
  const merged = P.apply(remote, ops); assert.equal(merged.treinosV2.aluno.fichas[0].variantes[0].aprovada.versao, 1); assert.equal(merged.treinosV2.outro.fichas[0].titulo, remote.treinosV2.outro.fichas[0].titulo);
  remote.treinosV2.aluno.fichas[0].itens[0].carga = 25; assert.throws(() => P.apply(remote, ops), /outro aparelho/);
});
test('prévia detecta nova aprovação/retirada sem expor rascunho ou histórico interno', () => {
  const before = A.snapshot(state(ficha), 'aluno'), after = A.snapshot(state(approved()), 'aluno');
  assert.match(A.diferencas(before, after).join('\n'), /nova versão aprovada/);
  assert.match(A.diferencas(after, before).join('\n'), /versão retirada/);
  const pending = T.saveDraft(approved(), { ...draft, titulo: 'Segredo de rascunho' }, bank, stamp, 'v-a');
  assert.deepEqual(A.snapshot(state(pending), 'aluno'), after);
  assert.doesNotMatch(JSON.stringify(after), /rascunho|historico|Segredo/);
});
test('pacotes sem alternativas mantêm criação canônica e retomada sinaliza preservar cursor', () => {
  const e = env(); e.C.start(0, e.original); const legacy = V.runtime([], e.C); assert.equal(legacy.beforeNew(0, () => {}), false);
  const versioned = V.runtime(e.definitions, e.C); let resume = false; assert.equal(versioned.beforeNew(0, v => { resume = v; }), true); assert.equal(resume, true);
});
console.log(count + ' cenários de versões e progressão passaram.');
