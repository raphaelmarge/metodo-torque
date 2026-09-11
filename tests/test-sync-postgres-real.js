/* PostgreSQL real, duas conexões + observador; somente banco local descartável. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { setTimeout: pause } = require('node:timers/promises');

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const U = '33333333-3333-4333-8333-333333333333';
const V = '44444444-4444-4444-8444-444444444444';
const W = '55555555-5555-4555-8555-555555555555';
const K = 'mtapp:ptStudio';
let checks = 0;
function ok(value, label) { assert.ok(value, label); checks++; console.log('OK ' + label); }
function equal(value, expected, label) { assert.deepEqual(value, expected, label); checks++; console.log('OK ' + label); }

function connectionOptions() {
  if (!process.env.PGTESTURL) throw new Error('Defina PGTESTURL para PostgreSQL local descartável. Consulte tests/sql/README.md.');
  let url;
  try { url = new URL(process.env.PGTESTURL); } catch { throw new Error('PGTESTURL inválida; use uma URL PostgreSQL de teste em loopback.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1', '[::1]'].includes(url.hostname) || url.search || url.hash) {
    throw new Error('PGTESTURL aceita somente PostgreSQL em 127.0.0.1 ou [::1], sem parâmetros nem fragmento.');
  }
  return {
    host: url.hostname.replace(/^\[|\]$/g, ''), port: Number(url.port || 5432),
    user: decodeURIComponent(url.username || 'postgres'), password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1) || 'postgres'),
    connectionTimeoutMillis: 5000, query_timeout: 12000,
    application_name: 'torque-sync-concurrency-test', ssl: false
  };
}

function section(source, start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, 'Os blocos SQL canônicos mudaram; revise a extração, sem usar cópia antiga.');
  return source.slice(from, to);
}
function canonicalSQL() {
  const source = fs.readFileSync(path.join(__dirname, '../supabase-setup.sql'), 'utf8');
  return section(source, 'create table if not exists public.academias', '-- ==================== FUNÇÕES DE CADASTRO') +
    section(source, 'create table if not exists public.app_aluno (', '-- porta única do aluno:') +
    section(source, 'create table if not exists public.dados_hist (', '-- ==================== REDUNDÂNCIA: HISTÓRICO DO APP DO ALUNO');
}

async function main() {
  const options = connectionOptions();
  let pg;
  try { pg = require('./sql/node_modules/pg'); } catch {
    throw new Error('Instale o cliente fixado: npm ci --prefix tests/sql --ignore-scripts');
  }
  // Não converter carimbos para Date: PostgreSQL guarda microssegundos, e CAS exige igualdade exata.
  const types = new pg.TypeOverrides();
  types.setTypeParser(1184, value => value);
  const clients = [];
  const database = 'torque_sync_test_' + crypto.randomBytes(10).toString('hex');
  assert.match(database, /^torque_sync_test_[0-9a-f]{20}$/);
  let created = false;
  async function connect(db, name) {
    const client = new pg.Client({ ...options, database: db, types, application_name: name });
    await client.connect(); clients.push(client);
    await client.query("set statement_timeout='10s'; set lock_timeout='8s'; set idle_in_transaction_session_timeout='30s'");
    return client;
  }
  const admin = await connect(options.database, 'torque-sync-test-control');
  let observer;
  try {
    const version = (await admin.query('select version() as version, current_setting(\'server_version_num\')::int as num')).rows[0];
    ok(version.num >= 150000, 'PostgreSQL real versão 15 ou superior');
    console.log(version.version);
    await admin.query('create database ' + database);
    created = true;
    observer = await connect(database, 'torque-sync-test-observer');
    await observer.query(`do $$begin
      if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
      if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
      end$$;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid
      $$;
      grant usage on schema auth, public to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;`);
    const testRoles = (await observer.query("select rolname,rolsuper,rolbypassrls from pg_roles where rolname in ('anon','authenticated')")).rows;
    ok(testRoles.length===2 && testRoles.every(role=>!role.rolsuper && !role.rolbypassrls), 'Papéis de teste não são superusuários nem ignoram RLS');
    await observer.query(canonicalSQL());
    await observer.query(`grant select,insert,update,delete on public.academias, public.membros, public.dados, public.app_aluno to authenticated;
      grant select on public.dados_hist to authenticated;`);
    await observer.query('insert into auth.users(id) values($1),($2),($3)', [U,V,W]);
    await observer.query("insert into public.academias(id,nome,codigo_equipe) values($1,'Academia teste A','TESTA'),($2,'Academia teste B','TESTB')", [A,B]);
    await observer.query("insert into public.membros(academia_id,user_id,papel) values($1,$2,'dono'),($1,$3,'funcionario'),($4,$5,'dono')", [A,U,V,B,W]);
    const left = await connect(database, 'torque-sync-test-left');
    const right = await connect(database, 'torque-sync-test-right');
    const leftPid = Number((await left.query('select pg_backend_pid() pid')).rows[0].pid);
    const rightPid = Number((await right.query('select pg_backend_pid() pid')).rows[0].pid);
    ok(leftPid !== rightPid, 'Conexões independentes: PIDs ' + leftPid + ' e ' + rightPid);

    async function who(client, user = U, role = 'authenticated') {
      assert.ok(['anon', 'authenticated'].includes(role));
      await client.query('reset role');
      await client.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
      await client.query('set role ' + role);
    }
    async function denied(fn, code, label) {
      let err;
      try { await fn(); } catch (e) { err = e; }
      equal(err && err.code, code, label);
    }
    const cas = (client, key, data, stamp = null, academy = A) => client.query('select * from public.dados_cas($1,$2,$3::jsonb,$4::timestamptz)', [academy,key,JSON.stringify(data),stamp]);
    const common = (client, rows) => client.query('select * from public.dados_grava($1::jsonb)', [JSON.stringify(rows)]);
    const publish = (client, stamp, tokens, academy = A) => client.query('select public.app_aluno_publica_cas($1,$2::timestamptz,$3::jsonb) result', [academy,stamp,JSON.stringify(tokens.map(token=>({token,dados:{sourceUpdatedAt:stamp,dados:{a:{id:'aluno-sintetico'}}}})))]);
    const read = async (key = K, academy = A) => (await observer.query('select valor,atualizado from public.dados where academia_id=$1 and chave=$2', [academy,key])).rows[0];
    const countApps = async tokens => Number((await observer.query('select count(*) n from public.app_aluno where token=any($1::text[])', [tokens])).rows[0].n);
    async function blocked(pid, blocker, pending, label) {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const result = await observer.query('select $2::int=any(pg_blocking_pids($1::int)) blocked', [pid,blocker]);
        if (result.rows[0].blocked) { ok(true, label + ': bloqueio observado no servidor'); return; }
        if (pending.finished) throw new Error(label + ': a operação terminou sem disputar o lock esperado');
        await pause(20);
      }
      throw new Error(label + ': PostgreSQL não informou o bloqueio esperado');
    }
    function pending(fn) {
      const out = { finished: false };
      out.result = fn().then(value => ({value}), error => ({error})).then(result => { out.finished = true; return result; });
      return out;
    }
    async function fresh() {
      await who(left); await who(right,V);
      const row = await read();
      if (!row) return (await cas(left,K,{alunos:[{id:'aluno-sintetico'}]})).rows[0].atualizado;
      return row.atualizado;
    }

    await who(left,'','anon');
    await denied(() => cas(left,K,{}), '42501', 'Anon não executa dados_cas');
    await denied(() => common(left,[]), '42501', 'Anon não executa dados_grava');
    await denied(() => publish(left,'2026-01-01T00:00:00Z',['anon']), '42501', 'Anon não publica pacotes');
    await who(left,'');
    await denied(() => cas(left,K,{}), '42501', 'Authenticated sem JWT não cria dados');
    await who(left);
    const stamp0 = await fresh();
    await who(right,W);
    await cas(right,K,{tenant:'B'},null,B);
    equal((await right.query('select distinct academia_id from public.dados')).rows.map(r=>r.academia_id), [B], 'RLS limita leitura à própria academia');
    await denied(() => cas(right,K,{intruso:true},stamp0), 'PT409', 'Outra academia não altera painel pelo CAS');
    await denied(() => cas(right,'mtapp:intruso',{},null,A), '42501', 'Outra academia não cria chave via CAS');
    await denied(() => publish(right,stamp0,['intruso']), 'PT409', 'Outra academia não publica a fonte alheia');
    await who(right,V);
    await denied(() => common(right,[{academia_id:A,chave:'mtapp:atomico',valor:1},{academia_id:B,chave:'mtapp:intruso',valor:1}]), '42501', 'Lote comum com outra academia é rejeitado inteiro');
    equal(await read('mtapp:atomico'), undefined, 'Falha de RLS não deixa gravação parcial do lote comum');
    await denied(() => common(left,[{academia_id:A,chave:K,valor:{indevido:true}}]), 'PT400', 'dados_grava não contorna o CAS do painel');
    await common(left,[{academia_id:A,chave:'mtapp:comum',valor:{ok:1}}]);
    equal((await read('mtapp:comum')).valor,{ok:1},'Chaves comuns continuam sincronizando pela RPC');
    await denied(() => left.query('insert into public.dados(academia_id,chave,valor) values($1,$2,$3)', [A,'mtapp:legado',{}]), 'PT426', 'INSERT legado direto é bloqueado');
    await denied(() => left.query('update public.dados set valor=$1 where academia_id=$2 and chave=$3', [{indevido:true},A,K]), 'PT426', 'UPDATE legado direto é bloqueado após RPC em outra transação');
    await denied(() => left.query('insert into public.dados(academia_id,chave,valor) values($1,$2,$3) on conflict(academia_id,chave) do update set valor=excluded.valor', [A,K,{}]), 'PT426', 'UPSERT legado direto é bloqueado');
    await denied(() => left.query('insert into public.app_aluno(token,academia_id,dados) values($1,$2,$3)', ['legado',A,{}]), 'PT426', 'Publicação legado direta é bloqueada');
    equal((await read()).atualizado,stamp0,'Tentativas rejeitadas preservam a revisão do painel');

    // Duas criações com base null: a segunda espera a primeira e não substitui a linha.
    await left.query('begin');
    await cas(left,'mtapp:criacao',{vencedor:'A'});
    const creation = pending(() => cas(right,'mtapp:criacao',{vencedor:'B'}));
    await blocked(rightPid,leftPid,creation,'Criações simultâneas');
    await left.query('commit');
    equal((await creation.result).error?.code,'PT409','Somente uma criação com base null confirma');
    equal((await read('mtapp:criacao')).valor,{vencedor:'A'},'A criação vencedora permanece intacta');

    // Duas edições da mesma revisão: predicate recheck após o lock impede lost update.
    let stamp = await fresh();
    await left.query('begin');
    const winner = (await cas(left,K,{vencedor:'A',alunos:[{id:'aluno-sintetico'}]},stamp)).rows[0];
    const race = pending(() => cas(right,K,{vencedor:'B'},stamp));
    await blocked(rightPid,leftPid,race,'Edições da mesma revisão');
    await left.query('commit');
    equal((await race.result).error?.code,'PT409','Edição perdedora recebe PT409 depois do commit vencedor');
    equal((await read()).valor.vencedor,'A','Nenhum dado do perdedor substitui o vencedor');
    ok(winner.atualizado!==stamp,'A escrita confirmada fornece uma revisão nova');
    equal((await left.query('select * from public.dados_hist')).rows,[],'Histórico não é exposto ao cliente autenticado');
    ok(Number((await observer.query('select count(*) n from public.dados_hist where academia_id=$1 and chave=$2',[A,K])).rows[0].n)>0,'Histórico anterior é conservado no servidor');

    // Se o primeiro aparelho desfizer a transação, o segundo ainda pode confirmar a base válida.
    stamp = await fresh();
    await left.query('begin');
    await cas(left,K,{desfeito:true},stamp);
    const rollback = pending(() => cas(right,K,{aposRollback:true},stamp));
    await blocked(rightPid,leftPid,rollback,'Edição aguardando rollback');
    await left.query('rollback');
    ok(!(await rollback.result).error,'Rollback libera uma edição ainda baseada na revisão correta');
    equal((await read()).valor,{aposRollback:true},'Somente a edição confirmada após rollback aparece');

    // Um painel que muda enquanto a publicação espera invalida TODO o lote antigo.
    stamp = await fresh();
    await left.query('begin');
    await cas(left,K,{novoPainel:true},stamp);
    const stalePublish = pending(() => publish(right,stamp,['antigo-1','antigo-2']));
    await blocked(rightPid,leftPid,stalePublish,'Publicação antiga aguardando edição');
    await left.query('commit');
    equal((await stalePublish.result).error?.code,'PT409','Publicação antiga revalida a fonte após obter lock');
    equal(await countApps(['antigo-1','antigo-2']),0,'Lote antigo não deixa nenhum pacote parcial');

    // A ordem inversa também é serializada: fonte fica estável durante toda a publicação.
    stamp = await fresh();
    await left.query('begin');
    const published = await publish(left,stamp,['atual-1','atual-2']);
    equal(published.rows[0].result.publicados,2,'Lote válido publica todos os pacotes');
    const afterPublish = pending(() => cas(right,K,{aposPublicacao:true},stamp));
    await blocked(rightPid,leftPid,afterPublish,'Edição aguardando publicação');
    await left.query('commit');
    ok(!(await afterPublish.result).error,'Edição pode confirmar após publicação liberar a fonte');
    equal(await countApps(['atual-1','atual-2']),2,'Publicação concluída antes da edição conserva os dois pacotes');
    const sources=(await observer.query("select dados->>'sourceUpdatedAt' source from public.app_aluno where token=any($1::text[])",[['atual-1','atual-2']])).rows;
    ok(sources.every(r=>r.source===stamp),'Todos os pacotes guardam a mesma revisão efetivamente publicada');

    stamp = await fresh();
    await who(right,W);
    const otherStamp = (await read(K,B)).atualizado;
    await publish(right,otherStamp,['token-outra-academia'],B);
    await who(right,V);
    await denied(() => publish(left,stamp,['antes-do-conflito','token-outra-academia']), '42501', 'Token de outra academia não pode ser apropriado no lote');
    equal(await countApps(['antes-do-conflito']),0,'Conflito de token não deixa publicação parcial');
    equal((await observer.query('select academia_id from public.app_aluno where token=$1',['token-outra-academia'])).rows[0].academia_id,B,'Dono original do token é preservado');
    await denied(() => left.query('update public.app_aluno set dados=$1 where token=$2',[{indevido:true},'atual-1']), 'PT426', 'UPDATE legado de pacote continua bloqueado depois de publicação canônica');
    await observer.query('delete from public.membros where academia_id=$1 and user_id=$2',[A,V]);
    equal((await right.query('select * from public.dados where academia_id=$1',[A])).rows,[],'Revogação de vínculo remove leitura na próxima transação');
    await denied(() => cas(right,K,{revogado:true},stamp), 'PT409', 'Membro removido não grava mesmo com revisão conhecida');
    await denied(() => publish(right,stamp,['revogado']), 'PT409', 'Membro removido não publica mesmo com revisão conhecida');
    console.log('\n' + checks + ' verificações PostgreSQL real PASS; sem dados de produção.');
  } finally {
    for (const client of clients.slice(1).reverse()) {
      try { await client.end(); } catch { /* fechamento dos clientes pertencentes a esta execução */ }
    }
    try { if (created) await admin.query('drop database ' + database + ' with (force)'); }
    finally { await admin.end(); }
  }
}

main().catch(error => {
  console.error('FAIL PostgreSQL real:', error.code || '', error.message);
  process.exitCode = 1;
});
