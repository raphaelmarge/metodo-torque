/* Só dados fictícios. Não acessa DOM, rede, banco ou dados de alunos. */
'use strict';
const assert = require('node:assert/strict');
const H = require('../app/treino-historico-core');
let checks = 0;
function test(name, fn) { fn(); checks++; console.log('OK ' + name); }
function memory() {
  const rows = new Map();
  return { rows, fail: false, get length() { return rows.size; }, key(i) { return [...rows.keys()][i] || null; },
    getItem(k) { return rows.has(k) ? rows.get(k) : null; },
    setItem(k, v) { if (this.remaining != null && this.remaining-- <= 0) throw new Error('QuotaExceededError'); if (this.fail) throw new Error('QuotaExceededError'); rows.set(k, v); } };
}
function make(storage = memory(), scope = 'aluno-ficticio', actor = 'aparelho-a', guard = () => true) {
  return H.create({ storage, scope, actor, active: guard, now: () => new Date('2026-10-03T12:00:00.000Z') });
}
const prescription = { name: 'Ficha sintética A', exercises: [{ id: 'exercise-a', name: 'Movimento fictício', sets: [{ id: 'set-a', reps: '8-10', kg: null, rest: 0 }] }] };
const start = { id: 'session-a', kind: 'musculacao', date: '2026-09-03', prescribed: prescription };
const first = { id: 'result-a', session: start.id, target: 'set-a', expected: [], value: { reps: null, kg: 0, done: true } };
const correction = { id: 'correction-a', session: start.id, target: 'set-a', expected: ['result-a'], value: { reps: 8, kg: 0, done: true }, correction: true, reason: 'Repetições esquecidas' };
test('snapshot de um mês atrás não muda com ficha atual nem objetos devolvidos', () => {
  const j = make(); const input = structuredClone(start); j.start(input);
  input.prescribed.exercises[0].sets[0].reps = '99';
  j.start({ ...input, prescribed: { name: 'Ficha nova' } });
  const view = j.session(start.id); view.prescribed.name = 'Alteração externa';
  assert.deepEqual(j.session(start.id).prescribed, prescription);
  assert.equal(j.list()[0].date, '2026-09-03');
});
test('duplo toque e sync duplicado não duplicam registro ou conclusão', () => {
  const j = make(); j.start(start); j.record(first); j.record(first);
  j.finish({ id: 'finish-a', session: start.id, value: { partial: true } });
  j.finish({ id: 'finish-a', session: start.id, value: { partial: false } });
  const before = H.canonical(j.read()); j.ingest(j.packet()); j.ingest(j.packet());
  assert.equal(H.canonical(j.read()), before); assert.equal(Object.keys(j.read()).length, 3);
  assert.equal(j.session(start.id).finish.value.partial, true);
});
test('edição posterior mantém original, autoria, motivo, data e encerramento', () => {
  const j = make(); j.start(start); j.record(first); j.finish({ id: 'finish-a', session: start.id, value: { partial: true } }); j.record(correction);
  const v = j.session(start.id), t = v.targets['set-a'];
  assert.deepEqual(t.original[0].value, first.value); assert.deepEqual(t.value, correction.value);
  assert.equal(t.revisions.length, 2); assert.equal(t.revisions[1].actor, 'aparelho-a');
  assert.equal(t.revisions[1].at, '2026-10-03T12:00:00.000Z'); assert.equal(t.revisions[1].reason, correction.reason);
  assert.equal(v.date, start.date); assert.equal(v.finished, true);
  assert.throws(() => j.record({ ...first, id: 'attempt-new', expected: ['correction-a'] }), /SESSION_FINISHED/);
});
test('voltar/cancelar consulta não grava, não inicia descanso e não dispara recompensa', () => {
  const storage = memory(), j = make(storage); j.start(start); j.record(first);
  const before = [...storage.rows]; j.list(); j.session(start.id); j.session(start.id);
  assert.deepEqual([...storage.rows], before);
  assert.ok([...storage.rows.keys()].every(k => k.startsWith('tqWorkoutJournal:')));
});
test('quota offline falha atomicamente sem apagar sessão; reload e retry preservam tudo', () => {
  const storage = memory(), j = make(storage); j.start(start); j.record(first);
  const before = [...storage.rows]; storage.fail = true;
  assert.throws(() => j.record(correction), /QuotaExceededError/); assert.deepEqual([...storage.rows], before);
  storage.fail = false; const reload = make(storage); reload.record(correction);
  assert.deepEqual(reload.session(start.id).targets['set-a'].value, correction.value);
});
test('duas abas em alvos diferentes não substituem documento compartilhado', () => {
  const storage = memory(), a = make(storage), b = make(storage, 'aluno-ficticio', 'aparelho-b');
  a.start(start); a.record(first); b.record({ ...first, id: 'result-b', target: 'set-b' });
  assert.equal(Object.keys(a.session(start.id).targets).length, 2);
});
test('rascunho obsoleto é recusado sem apagar revisão mais recente', () => {
  const storage = memory(), a = make(storage), b = make(storage, 'aluno-ficticio', 'aparelho-b');
  a.start(start); a.record(first); a.record(correction);
  assert.throws(() => b.record({ ...correction, id: 'correction-stale' }), /STALE_REVISION/);
  assert.equal(a.session(start.id).targets['set-a'].revisions.length, 2);
});
test('edições offline concorrentes preservam ambas; nenhuma vence pelo relógio', () => {
  const a = make(), b = make(memory(), 'aluno-ficticio', 'aparelho-b');
  a.start(start); a.record(first); b.ingest(a.packet()); a.record(correction);
  b.record({ ...correction, id: 'correction-b', value: { reps: 9, kg: 0, done: true } });
  const left = H.merge(a.packet(), b.packet()), right = H.merge(b.packet(), a.packet());
  assert.equal(H.canonical(left), H.canonical(right)); a.ingest(right); b.ingest(left);
  const t = a.session(start.id).targets['set-a']; assert.equal(t.conflict, true); assert.equal(t.value, null);
  assert.deepEqual(t.heads, ['correction-a', 'correction-b']);
  a.record({ ...correction, id: 'resolution-a', expected: t.heads, reason: 'Conferido após sincronizar', value: { reps: 9, kg: 0, done: true } });
  b.ingest(a.packet()); const solved = b.session(start.id).targets['set-a'];
  assert.equal(solved.conflict, false); assert.equal(solved.revisions.length, 4); assert.equal(solved.value.reps, 9);
});
test('união é associativa e reenvio atrasado não restaura resultado antigo', () => {
  const j = make(); j.start(start); j.record(first); const a = j.packet(); j.record(correction); const b = j.packet();
  j.finish({ id: 'finish-a', session: start.id, value: {} }); const c = j.packet();
  assert.equal(H.canonical(H.merge(H.merge(a,b),c)), H.canonical(H.merge(a,H.merge(b,c))));
  j.ingest(a); assert.equal(j.session(start.id).targets['set-a'].value.reps, 8);
});
test('ingestão parcial por quota é recuperável e parents ausentes ficam pendentes', () => {
  const source = make(); source.start(start); source.record(first); source.record(correction);
  const target = make(); const data = source.packet();
  target.ingest({ ['start:' + start.id]: data['start:' + start.id], 'correction-a': data['correction-a'] });
  assert.deepEqual(target.session(start.id).pendingParents, ['correction-a']);
  assert.deepEqual(Object.keys(target.session(start.id).targets), []);
  target.ingest(data); assert.equal(target.session(start.id).targets['set-a'].value.reps, 8);
});
test('quota durante ingestão preserva prefixo e retry completa sem duplicar', () => {
  const source = make(); source.start(start); source.record(first); source.record(correction);
  const storage = memory(), dest = make(storage); storage.remaining = 1;
  assert.throws(() => dest.ingest(source.packet()), /QuotaExceededError/); assert.equal(storage.length, 1);
  storage.remaining = null; dest.ingest(source.packet()); assert.equal(storage.length, 3);
  assert.equal(dest.session(start.id).targets['set-a'].value.reps, 8);
});
test('encerramentos concorrentes preservam recibos mas representam uma sessão concluída', () => {
  const a = make(), b = make(memory(), 'aluno-ficticio', 'aparelho-b');
  a.start(start); a.record(first); b.ingest(a.packet());
  a.finish({ id: 'finish-a', session: start.id, value: { partial: true } });
  b.finish({ id: 'finish-b', session: start.id, value: { partial: true } });
  a.ingest(b.packet()); const v = a.session(start.id);
  assert.equal(a.list().length, 1); assert.equal(v.finishes.length, 2); assert.equal(v.finished, true);
});
test('ID colidido e lote inválido são rejeitados antes de persistir', () => {
  const j = make(); j.start(start); j.record(first); const original = H.canonical(j.read());
  assert.throws(() => j.record({ ...first, value: { kg: 500 } }), /EVENT_ID_COLLISION/);
  assert.throws(() => j.ingest({ broken: {} }), /INVALID_EVENT/);
  assert.equal(H.canonical(j.read()), original);
});
test('troca de identidade bloqueia leitura, escrita, envio e restauração', () => {
  const storage = memory(); let active = true; const j = make(storage, 'aluno-ficticio', 'aparelho-a', () => active);
  j.start(start); j.record(first); const packet = j.packet(), before = [...storage.rows]; active = false;
  for (const fn of [() => j.read(), () => j.packet(), () => j.list(), () => j.record(correction), () => j.ingest(packet)]) assert.throws(fn, /IDENTITY_CHANGED/);
  assert.deepEqual([...storage.rows], before); assert.deepEqual(make(storage, 'outro-aluno').list(), []);
});
test('legado não inventa prescrição, mantém somente resultados realmente disponíveis', () => {
  const j = make(); j.start({ id: 'legacy-a', kind: 'musculacao', date: start.date, legacy: true, prescribed: {} });
  j.record({ ...first, session: 'legacy-a', value: { kg: 30, reps: null } });
  assert.equal(j.session('legacy-a').legacy, true); assert.deepEqual(j.session('legacy-a').prescribed, {});
  assert.throws(() => j.start({ ...start, id: 'legacy-b', legacy: true }), /LEGACY_PRESCRIPTION_UNKNOWN/);
});
test('importação legada conserva horário desconhecido e correção mantém seu horário real', () => {
  const j=make();
  const old={v:1,id:'start:legacy-unknown',session:'legacy-unknown',type:'start',at:null,actor:'legacy-import',legacyImport:true,date:start.date,kind:'corrida',prescribed:{},legacy:true};
  const result={v:1,id:'legacy-result',session:old.session,type:'result',at:null,actor:'legacy-import',legacyImport:true,target:'result',parents:[],value:{k:1,s:100}};
  j.ingest({[old.id]:old,[result.id]:result});j.ingest(j.packet());j.start({...start,id:'known-time'});
  assert.equal(j.session(old.session).startedAt,null);assert.equal(j.session(old.session).targets.result.original[0].at,null);
  assert.equal(j.list().length,2);assert.equal(j.session(old.session).finished,false);
  j.record({id:'edit-legacy',session:old.session,target:'result',expected:[result.id],correction:true,reason:'Distância conferida',value:{k:1.1,s:100}});
  assert.equal(j.session(old.session).targets.result.revisions[1].at,'2026-10-03T12:00:00.000Z');
  for(const invalid of [{...old,legacy:false},{...old,legacyImport:false},{...old,actor:'device'}, {...result,legacyImport:false},{...result,parents:['unknown']},{...result,type:'correction',reason:'Sem horário'}, {...result,type:'finish'}]) {
    assert.throws(()=>H.merge({}, {[invalid.id]:invalid}),/INVALID_EVENT/);
  }
  const absent={...result};delete absent.at;assert.throws(()=>H.merge({}, {[absent.id]:absent}),/INVALID_EVENT/);
  assert.throws(()=>j.ingest({another:{...result,id:'another',session:'known-time'}}),/INVALID_LEGACY_SESSION/);
});
test('corrida preserva intervalos, distância, tempo, ritmo, rota e origem separadamente', () => {
  const j = make(); const p = { name: 'Corrida fictícia', intervals: [{ id: 'interval-a', distanceM: 200, restSeconds: 60 }] };
  const result = { intervals: [{ id: 'interval-a', distanceM: 198, seconds: 55 }], distanceKm: 1.1, seconds: 360, pace: '5:27', route: [{ lat: 0, lng: 0 }], source: 'gps' };
  j.start({ id: 'run-a', kind: 'corrida', date: start.date, prescribed: p });
  j.record({ id: 'run-result', session: 'run-a', target: 'activity', expected: [], value: result });
  j.record({ id: 'run-edit', session: 'run-a', target: 'activity', expected: ['run-result'], correction: true, reason: 'Distância manual conferida', value: { ...result, distanceKm: 1.2, pace: '5:00', source: 'manual' } });
  const v = j.session('run-a'); assert.deepEqual(v.prescribed, p); assert.deepEqual(v.targets.activity.original[0].value, result);
  assert.deepEqual(v.targets.activity.value.route, result.route); assert.equal(v.targets.activity.value.source, 'manual');
});
test('circuito guarda rodadas/movimentos/reps/tempo/carga sem criar campos ausentes', () => {
  const j = make(); j.start({ id: 'circuit-a', kind: 'circuito', date: start.date, prescribed: { rounds: 4, movements: [{ id: 'move-a', reps: 10 }] } });
  const result = { rounds: 2, movements: [{ id: 'move-a', reps: 7, kg: null }], seconds: 80, partial: true };
  j.record({ id: 'circuit-result', session: 'circuit-a', target: 'round-2', expected: [], value: result });
  assert.deepEqual(j.session('circuit-a').targets['round-2'].value, result);
});
test('executar novamente usa outro ID; corrigir mantém data e sessão', () => {
  const j = make(); j.start(start); j.record(first); j.record(correction); j.start({ ...start, id: 'session-b' });
  assert.equal(j.list().length, 2); assert.equal(Object.keys(j.session('session-b').targets).length, 0);
});
test('JSON inseguro, números não finitos, datas impossíveis e ciclos são recusados', () => {
  assert.throws(() => H.canonical({ n: NaN }), /INVALID_JSON/);
  assert.throws(() => H.canonical(JSON.parse('{"__proto__":{}}')), /UNSAFE_KEY/);
  assert.throws(() => make().start({ ...start, date: '2026-02-30' }), /INVALID_START/);
  const j = make(); j.start(start); j.record(first); j.record(correction); const events = j.read();
  events['result-a'].parents = ['correction-a']; assert.throws(() => H.project(events, start.id), /REVISION_CYCLE/);
});
console.log(checks + ' cenários de histórico por sessão passaram.');
