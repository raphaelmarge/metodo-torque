'use strict';
// Only synthetic data in PGlite, or --postgres in a disposable loopback database.
// This validates SQL authorization; it never simulates proof of a real Auth login.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const migrationFile = '20261005150924_personal_cortesia_temporaria.sql';
const migration = fs.readFileSync(path.join(__dirname, '../supabase/migrations', migrationFile), 'utf8');
const setup = fs.readFileSync(path.join(__dirname, '../supabase-setup.sql'), 'utf8');
const baseline = [...setup.matchAll(/create or replace function public\.minha_assinatura\(\)[\s\S]*?\$\$;/gi)].at(-1)[0];
const uid = n => '65000000-0000-4000-8000-' + String(n).padStart(12, '0');
let checks = 0;
async function check(label, fn) { await fn(); console.log('OK ' + (++checks) + ' ' + label); }

async function open() {
  if (!process.argv.includes('--postgres')) {
    const { PGlite } = require('./runtime/node_modules/@electric-sql/pglite');
    return new PGlite();
  }
  const url = new URL(process.env.PGTESTURL || 'invalid:');
  assert(['postgres:', 'postgresql:'].includes(url.protocol));
  assert(['127.0.0.1', '[::1]'].includes(url.hostname));
  assert(['', '/', '/postgres'].includes(url.pathname) && !url.search && !url.hash);
  const { Client } = require('./sql/node_modules/pg');
  const database = 'torque_cortesia_test_' + crypto.randomBytes(10).toString('hex');
  const options = { connectionString: url.href, connectionTimeoutMillis: 5000, query_timeout: 10000 };
  const control = new Client(options); await control.connect();
  let client;
  try {
    await control.query('create database ' + database);
    url.pathname = '/' + database;
    client = new Client({ ...options, connectionString: url.href }); await client.connect();
    return { exec: sql => client.query(sql), query: (sql, values) => client.query(sql, values),
      close: async () => { await client.end(); await control.query('drop database ' + database); await control.end(); } };
  } catch (error) {
    if (client) await client.end();
    await control.query('drop database if exists ' + database); await control.end(); throw error;
  }
}

async function main() {
  const db = await open();
  const query = async (sql, values = []) => (await db.query(sql, values)).rows;
  const scalar = async (sql, values = []) => Object.values((await query(sql, values))[0])[0];
  const actor = async (user, role = 'authenticated') => {
    assert(['authenticated', 'anon', 'service_role'].includes(role));
    await db.exec('reset role');
    await query("select set_config('request.jwt.claim.sub',$1,false)", [user || '']);
    await db.exec('set role ' + role);
  };
  const read = async user => { await actor(user); return scalar('select public.minha_assinatura()'); };
  const owner = async () => db.exec('reset role');
  try {
    await db.exec(`
      do $$begin
        if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
        if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
        if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
      end$$;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
      $$;
      grant usage on schema auth,public to anon,authenticated,service_role;
      create table public.academias(id uuid primary key,criada timestamptz not null,
        assinatura_status text not null,assinatura_via text,assinatura_vence timestamptz);
      create table public.membros(academia_id uuid references public.academias(id),user_id uuid,
        primary key(academia_id,user_id));
      create table public.assinatura_regras(id int primary key,dias_teste int,dias_carencia int);
      insert into public.assinatura_regras values(1,14,3);
      alter table public.academias enable row level security;
      alter table public.membros enable row level security;
      alter table public.assinatura_regras enable row level security;
      revoke all on public.academias,public.membros,public.assinatura_regras from public,anon,authenticated,service_role;
      create function public.minhas_academias() returns setof uuid language sql stable
        security definer set search_path='' as $$
        select academia_id from public.membros where user_id=auth.uid()
      $$;
    `);
    await db.exec(baseline);
    const cases = [
      ['trial', 'now() - interval \'5 days\'', null],
      ['trial', 'now() - interval \'16 days\'', null],
      ['trial', 'now() - interval \'18 days\'', null],
      ['ativa', 'now() - interval \'60 days\'', 'now() - interval \'1 day\''],
      ['vitalicia', 'now() - interval \'60 days\'', null],
      ['atrasada', 'now() - interval \'60 days\'', null],
      ['cancelada', 'now() - interval \'60 days\'', null],
      ['vencida', 'now() - interval \'60 days\'', null],
      ['bloqueada', 'now() - interval \'60 days\'', null],
      ['desconhecida', 'now() - interval \'60 days\'', null]
    ];
    // Keep now() identical for the baseline/new contract equality comparison.
    await db.exec('begin');
    for (let i = 0; i < cases.length; i++) {
      const [status, created, ends] = cases[i];
      await query(`insert into public.academias values($1,${created},$2,'legado',${ends || 'null'})`, [uid(100 + i), status]);
      await query('insert into public.membros values($1,$2)', [uid(100 + i), uid(1 + i)]);
    }
    const previous = [];
    for (let i = 0; i < cases.length; i++) previous.push(await read(uid(1 + i)));
    await owner();
    const before = await query('select * from public.academias order by id');
    // Migration is transactional itself; remove its boundary only to keep this
    // synthetic equality test inside the already open fixed-time transaction.
    await db.exec(migration.replace(/^begin;\s*$/m, '').replace(/^commit;\s*$/m, ''));
    for (let i = 0; i < cases.length; i++) await check('preserva contrato legado ' + cases[i][0] + ' ' + i, async () => {
      assert.deepEqual(await read(uid(1 + i)), previous[i]);
    });
    await owner();
    await check('instalacao nao altera assinatura, prazo ou vinculo de clientes', async () => {
      assert.deepEqual(await query('select * from public.academias order by id'), before);
      assert.equal(await scalar('select count(*)::int from public.membros'), cases.length);
    });
    await db.exec('commit');
    await check('migration completa repetida e atomica preserva registros', async () => {
      await db.exec(migration); assert.deepEqual(await query('select * from public.academias order by id'), before);
    });
    const courtesyAccount = uid(200), courtesyUser = uid(20);
    await query("insert into public.academias values($1,now()-interval '90 days','cortesia','cortesia',now()+interval '2 hours')", [courtesyAccount]);
    await query('insert into public.membros values($1,$2)', [courtesyAccount, courtesyUser]);
    await check('cortesia futura libera e informa seu prazo sem resetar trial', async () => {
      const value = await read(courtesyUser);
      assert.equal(value.status, 'cortesia'); assert.equal(value.cortesia, true);
      assert.equal(value.travado, false); assert.equal(value.dias_ate_travar, 1);
      assert.equal(value.academia_id, courtesyAccount); assert(value.dia_do_teste > 80);
    });
    for (const [label, value] of [['vencida', "now()-interval '1 second'"], ['nula', 'null'], ['infinita', "'infinity'::timestamptz"], ['infinita negativa', "'-infinity'::timestamptz"]]) {
      await check('cortesia ' + label + ' permanece identificada e trava', async () => {
        await owner(); await query('update public.academias set assinatura_vence=' + value + ' where id=$1', [courtesyAccount]);
        const result = await read(courtesyUser);
        assert.equal(result.cortesia, true); assert.equal(result.travado, true); assert.equal(result.dias_ate_travar, 0);
      });
    }
    await check('no instante exato do fim a cortesia terminou', async () => {
      await owner(); await db.exec('begin');
      await query('update public.academias set assinatura_vence=now() where id=$1', [courtesyAccount]);
      assert.equal((await read(courtesyUser)).travado, true); await owner(); await db.exec('commit');
    });
    await check('data malformada e recusada pelo tipo SQL sem conceder acesso', async () => {
      await owner(); await assert.rejects(query("update public.academias set assinatura_vence='prazo-invalido' where id=$1", [courtesyAccount]), e => e.code === '22007');
      assert.equal((await read(courtesyUser)).travado, true);
    });
    await check('dois profissionais veem apenas suas proprias assinaturas', async () => {
      assert.equal((await read(uid(1))).academia_id, uid(100));
      assert.equal((await read(courtesyUser)).academia_id, courtesyAccount);
      await owner(); await query('delete from public.membros where user_id=$1', [courtesyUser]);
      assert.equal(await read(courtesyUser), null);
    });
    await check('usuario sem vinculo ou sem identidade nao recebe assinatura', async () => {
      assert.equal(await read(uid(999)), null); assert.equal(await read(null), null);
    });
    await check('metadata editavel nao concede vinculo ou cortesia', async () => {
      await owner(); await query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: uid(999), user_metadata: { academia_id: courtesyAccount, role: 'admin', cortesia: true } })]);
      assert.equal(await read(uid(999)), null);
    });
    await check('anon nao executa RPC pessoal nem le tabela', async () => {
      await actor(null, 'anon');
      await assert.rejects(scalar('select public.minha_assinatura()'), e => e.code === '42501');
      await assert.rejects(query('select * from public.academias'), e => e.code === '42501');
    });
    await check('service_role preserva EXECUTE mas nao recebe conta sem identidade', async () => {
      await actor(null, 'service_role'); assert.equal(await scalar('select public.minha_assinatura()'), null);
    });
    await check('cliente autenticado nao altera assinatura nem regras', async () => {
      await actor(uid(1));
      await assert.rejects(query("update public.academias set assinatura_status='cortesia',assinatura_vence='2099-01-01'"), e => e.code === '42501');
      await assert.rejects(query('update public.assinatura_regras set dias_teste=999'), e => e.code === '42501');
    });
    await check('search_path fixo e ACLs preservam apenas authenticated e service_role', async () => {
      await owner();
      const proc = (await query("select proconfig,prosecdef from pg_proc where oid='public.minha_assinatura()'::regprocedure"))[0];
      assert.equal(proc.prosecdef, true); assert.deepEqual(proc.proconfig, ['search_path=""']);
      assert.equal(await scalar("select has_function_privilege('authenticated','public.minha_assinatura()','execute')"), true);
      assert.equal(await scalar("select has_function_privilege('service_role','public.minha_assinatura()','execute')"), true);
      assert.equal(await scalar("select has_function_privilege('anon','public.minha_assinatura()','execute')"), false);
    });
    console.log('PASS ' + checks + ' grupos SQL de cortesia — ' + (process.argv.includes('--postgres') ? 'PostgreSQL real descartavel' : 'PGlite descartavel'));
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
