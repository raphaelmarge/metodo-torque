/* PostgreSQL embarcado descartável: tokens e registros exclusivamente fictícios. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('./runtime/node_modules/@electric-sql/pglite');
const H = require('../app/treino-historico-core');
(async () => {
  const db = new PGlite(); let checks = 0;
  async function test(name, f) { await f(); checks++; console.log('OK ' + name); }
  const e = { v: 1, id: 'start:s-a', session: 's-a', type: 'start', at: '2026-10-03T12:00:00.000Z', actor: 'device-a', date: '2026-09-03', kind: 'musculacao', prescribed: { name: 'Ficha fictícia' }, legacy: false };
  const r = { v: 1, id: 'result-a', session: 's-a', type: 'result', at: e.at, actor: e.actor, target: 'set-a', parents: [], value: { reps: null, kg: 0 } };
  const c = { ...r, id: 'correction-a', type: 'correction', parents: [r.id], reason: 'Repetições esquecidas', value: { reps: 8, kg: 0 } };
  async function save(token, es) { return (await db.query('select public.app_treino_eventos_grava($1,$2::jsonb) as v', [token, JSON.stringify(es)])).rows[0].v; }
  async function read(token, cursor = '0') { return (await db.query('select public.app_treino_eventos_lista($1,$2::bigint) as v', [token, cursor])).rows[0].v; }
  try {
    await db.exec("create role anon; create role authenticated; create table public.app_aluno(token text primary key,revogado_em timestamptz); insert into public.app_aluno values('synthetic-a',null),('synthetic-b',null),('synthetic-revoked',now());");
    const sql = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261005150945_treino_historico_eventos.sql'), 'utf8');
    await db.exec(sql); await db.exec(sql); // migração reaplicável no banco descartável
    await test('tabela RLS e acesso direto negado aos dois papéis', async () => {
      assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.app_treino_eventos'::regclass")).rows[0].relrowsecurity, true);
      for (const role of ['anon','authenticated']) {
        await db.exec('set role ' + role);
        await assert.rejects(db.query('select * from public.app_treino_eventos'), /permission denied/);
        await db.exec('reset role');
      }
    });
    await db.exec('set role anon');
    await test('token ativo autoriza snapshot + resultado; leitura de outro aluno não vaza', async () => {
      assert.equal((await save('synthetic-a', [r,e])).ok, true);
      assert.equal((await read('synthetic-a')).eventos.length, 2);
      assert.deepEqual((await read('synthetic-b')).eventos, []);
    });
    await test('duplo envio é idempotente e correção preserva original', async () => {
      await save('synthetic-a', [e,r,c]); await save('synthetic-a', [c]);
      const all = (await read('synthetic-a')).eventos; assert.equal(all.length, 3);
      const view = H.project(Object.fromEntries(all.map(x => [x.id,x])), e.session);
      assert.equal(view.targets['set-a'].original[0].value.reps, null);
      assert.equal(view.targets['set-a'].value.reps, 8);
    });
    await test('colisão reverte lote inteiro sem substituir nem inserir parcialmente', async () => {
      await assert.rejects(save('synthetic-a', [{ ...r, id: 'tentative' }, { ...r, value: { reps: 99 } }]), /EVENT_ID_COLLISION/);
      assert.equal((await read('synthetic-a')).eventos.length, 3);
    });
    await test('edições concorrentes são preservadas e aparecem como conflito', async () => {
      await save('synthetic-a', [{ ...c, id: 'correction-b', actor: 'device-b', value: { reps: 9, kg: 0 } }]);
      const all = (await read('synthetic-a')).eventos;
      const view = H.project(Object.fromEntries(all.map(x => [x.id,x])), e.session);
      assert.equal(view.targets['set-a'].conflict, true); assert.equal(view.targets['set-a'].value, null);
    });
    await test('pais de outro aluno, sessão ausente e ciclos são rejeitados', async () => {
      await assert.rejects(save('synthetic-b', [c]), /SESSION_NOT_FOUND/);
      await assert.rejects(save('synthetic-b', [e,c]), /INVALID_PARENT/);
      assert.equal((await read('synthetic-b')).eventos.length, 0);
      await assert.rejects(save('synthetic-a', [{ ...r, id: 'cycle-a', parents: ['cycle-b'] }, { ...r, id: 'cycle-b', parents: ['cycle-a'] }]), /REVISION_CYCLE/);
    });
    await test('revogação e token desconhecido bloqueiam leitura/escrita', async () => {
      for (const token of ['synthetic-revoked','synthetic-missing']) {
        assert.equal((await save(token,[e])).erro, 'sem_acesso'); assert.equal((await read(token)).erro, 'sem_acesso');
      }
    });
    await test('validação rejeita legado fabricado, data inválida, lote excessivo e cursor negativo', async () => {
      await assert.rejects(save('synthetic-b',[{ ...e, legacy: true }]), /INVALID_EVENT/);
      await assert.rejects(save('synthetic-b',[{ ...e, date: '2026-02-30' }]), /INVALID_EVENT/);
      await assert.rejects(save('synthetic-b',Array(51).fill(e)), /BATCH_TOO_LARGE/);
      await assert.rejects(read('synthetic-a','-1'), /INVALID_CURSOR/);
    });
    await test('paginação não trunca histórico; reenvio não altera cursor', async () => {
      const more = Array.from({length:49},(_,i) => ({ ...r, id: 'extra-' + i, target: 'set-' + i }));
      await save('synthetic-a', more);
      const a = await read('synthetic-a'); assert.equal(a.eventos.length, 50); assert.equal(a.mais, true);
      const b = await read('synthetic-a', a.cursor); assert.equal(b.eventos.length, 3); assert.equal(b.mais, false);
      await save('synthetic-a',more); const end = await read('synthetic-a',b.cursor); assert.equal(end.eventos.length, 0); assert.equal(end.cursor,b.cursor);
    });
    console.log(checks + ' cenários SQL locais passaram. Não testa concorrência de conexões PostgreSQL reais.');
  } finally { await db.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
