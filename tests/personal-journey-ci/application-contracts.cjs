'use strict';
// Test infrastructure only. Run after hq-auth-ci's complete Auth/PostgREST suite.
// Product RPC bodies are extracted unchanged, never replaced by success stubs.
// This installer neither defines Auth objects nor creates users/sessions/data.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const SETUP = 'supabase-setup.sql';
const RELIABILITY = 'supabase/migrations/20260926232430_confiabilidade_interna.sql';
const EVENTS = 'supabase/migrations/20261005150945_treino_historico_eventos.sql';
const ACCESS = 'supabase/releases/personal-billing-optional/migrations/20261006162018_personal_billing_access_optin.sql';
const SIGNUP = 'supabase/releases/personal-billing-optional/migrations/20261006163141_personal_signup_product.sql';
const COURTESY = 'supabase/migrations/20261005150924_personal_cortesia_temporaria.sql';
const sha = text => crypto.createHash('sha256').update(text).digest('hex');

// Split only at top-level SQL semicolons. Dollar-quoted bodies, quoted strings,
// identifiers and nested block comments cannot smuggle another selected command.
function statements(sql) {
  const out = []; let start = 0, i = 0, quote = null, escapeString = false, dollar = null, comment = 0, line = false;
  while (i < sql.length) {
    const c = sql[i], next = sql[i + 1];
    if (line) { if (c === '\n') line = false; i++; continue; }
    if (comment) {
      if (c === '/' && next === '*') { comment++; i += 2; }
      else if (c === '*' && next === '/') { comment--; i += 2; }
      else i++;
      continue;
    }
    if (dollar) { if (sql.startsWith(dollar, i)) { i += dollar.length; dollar = null; } else i++; continue; }
    if (quote) {
      if (escapeString && c === '\\') i += 2;
      else if (c === quote && next === quote) i += 2;
      else if (c === quote) { quote = null; i++; }
      else i++;
      continue;
    }
    if (c === '-' && next === '-') { line = true; i += 2; continue; }
    if (c === '/' && next === '*') { comment = 1; i += 2; continue; }
    if (c === "'" || c === '"') {
      quote = c; escapeString = c === "'" && /(?:^|[^a-z_0-9])[e]$/i.test(sql.slice(Math.max(0, i - 2), i)); i++; continue;
    }
    if (c === '$') { const m = sql.slice(i).match(/^\$(?:[a-z_][a-z_0-9]*)?\$/i); if (m) { dollar = m[0]; i += dollar.length; continue; } }
    if (c === ';') { out.push(sql.slice(start, i + 1).trim()); start = i + 1; }
    i++;
  }
  assert(!quote && !dollar && !comment, 'Unterminated SQL source');
  assert.equal(stripLeadingComments(sql.slice(start)).trim(), '', 'Missing final SQL semicolon');
  return out.filter(Boolean);
}
function stripLeadingComments(sql) {
  let result = sql.trimStart();
  while (result.startsWith('--') || result.startsWith('/*')) {
    if (result.startsWith('--')) { const end = result.indexOf('\n'); result = end < 0 ? '' : result.slice(end + 1).trimStart(); }
    else {
      let depth = 1, i = 2;
      while (i < result.length && depth) {
        if (result.slice(i, i + 2) === '/*') { depth++; i += 2; }
        else if (result.slice(i, i + 2) === '*/') { depth--; i += 2; }
        else i++;
      }
      assert.equal(depth, 0, 'Unterminated leading comment'); result = result.slice(i).trimStart();
    }
  }
  return result;
}
function lastFunction(sql, qualifiedName) {
  assert.match(qualifiedName, /^[a-z_]+\.[a-z_]+$/);
  const matches = statements(sql).map(stripLeadingComments).filter(s => {
    const m = s.match(/^create\s+(?:or\s+replace\s+)?function\s+([a-z_]+\.[a-z_]+)\s*\(/i);
    return m && m[1].toLowerCase() === qualifiedName;
  });
  assert(matches.length, 'Canonical function missing: ' + qualifiedName);
  const chosen = matches.at(-1);
  assert.match(chosen, /\bas\s+\$(?:[a-z_][a-z_0-9]*)?\$/i);
  return { sql: chosen, definitions: matches.length };
}
function body(sql) {
  const m = sql.match(/\bas\s+(\$(?:[a-z_][a-z_0-9]*)?\$)([\s\S]*?)\1/i);
  assert(m, 'Missing SQL function body');
  return m[2].replace(/\r\n/g, '\n').trim();
}
const FUNCTIONS = [
  ['dados_carimba()', []], ['dados_guarda_hist()', []], ['dados_exige_rpc()', []],
  ['dados_cas(uuid,text,jsonb,timestamptz)', ['authenticated']],
  ['dados_grava(jsonb)', ['authenticated']],
  ['app_aluno_ativo(text)', ['anon', 'authenticated']],
  ['app_aluno_publica_cas(uuid,timestamptz,jsonb)', ['authenticated']],
  ['app_aluno_publica(uuid,jsonb)', ['authenticated']],
  ['app_aluno_exige_rpc()', []], ['app_aluno_guarda_hist()', []],
  ['app_aluno_estado(text)', ['anon', 'authenticated']],
  ['app_aluno_busca(text)', ['anon', 'authenticated']],
  ['app_alunos_vistos(text[])', ['authenticated']],
  ['app_lista_mescla(jsonb,jsonb)', []], ['app_retorno_mescla(jsonb,jsonb)', []],
  ['app_aluno_devolve(text,jsonb)', ['anon', 'authenticated']],
  ['app_aluno_treino_reg(text,date,jsonb)', ['anon', 'authenticated']]
];
const TRIGGERS = ['dados_carimba_tg', 'dados_hist_tg', 'dados_exige_rpc_tg', 'app_aluno_exige_rpc_tg', 'app_aluno_hist_tg'];
const PRESERVED = [
  [SETUP, 'public.criar_academia', 'text,text'],
  [SIGNUP, 'public.criar_personal', 'text,text'],
  [ACCESS, 'public.minha_assinatura', ''],
  [COURTESY, 'public.minha_assinatura', '', 'personal_billing.legacy_minha_assinatura'],
  [RELIABILITY, 'public.dados_personal_patch', 'uuid,jsonb'],
  [RELIABILITY, 'torque_private.studio_diff', 'jsonb,jsonb,text[]'],
  [RELIABILITY, 'torque_private.personal_session_valid', ''],
  [RELIABILITY, 'torque_private.personal_history', '']
];
function buildPlan() {
  const sources = Object.fromEntries([SETUP, RELIABILITY, EVENTS, ACCESS, SIGNUP, COURTESY]
    .map(file => [file, fs.readFileSync(path.join(ROOT, file), 'utf8')]));
  const units = [], entries = [], setup = statements(sources[SETUP]).map(stripLeadingComments);
  const add = (source, label, sql, details = {}) => { units.push(sql); entries.push({ source, label, sha256: sha(sql), ...details }); };
  for (const [signature, roles] of FUNCTIONS) {
    const name = 'public.' + signature.split('(')[0], selected = lastFunction(sources[SETUP], name);
    add(SETUP, name, selected.sql, { selection: 'last-definition', definitions: selected.definitions });
    units.push('revoke all on function public.' + signature + ' from public,anon,authenticated,service_role;');
    if (roles.length) units.push('grant execute on function public.' + signature + ' to ' + roles.join(',') + ';');
  }
  for (const name of TRIGGERS) {
    const matches = setup.filter(s => new RegExp('^create trigger ' + name + '\\s', 'i').test(s));
    assert.equal(matches.length, 1, name);
    const table = name.startsWith('dados_') ? 'dados' : 'app_aluno';
    units.push('drop trigger if exists ' + name + ' on public.' + table + ';');
    add(SETUP, 'trigger:' + name, matches[0]);
  }
  const table = setup.filter(s => /^create table if not exists public\.app_treino_log\s*\(/i.test(s));
  assert.equal(table.length, 1);
  // Must precede the first invocation of app_aluno_treino_reg; PL/pgSQL binds its
  // SQL lazily, and all installer statements commit atomically before browsers run.
  add(SETUP, 'table:app_treino_log', table[0]);
  for (const name of ['app_treino_log_dia', 'app_treino_log_unico', 'dados_hist_busca', 'app_aluno_hist_busca']) {
    const found = setup.filter(s => new RegExp('^create (?:unique )?index if not exists ' + name + '\\s', 'i').test(s));
    assert.equal(found.length, 1, name); add(SETUP, 'index:' + name, found[0]);
  }
  for (const name of ['academia_ver_minha', 'membros_ver_equipe', 'app_treino_log_membros']) {
    const found = setup.filter(s => new RegExp('^create policy "' + name + '"\\s', 'i').test(s));
    assert.equal(found.length, 1, name);
    const tableName = { academia_ver_minha: 'academias', membros_ver_equipe: 'membros', app_treino_log_membros: 'app_treino_log' }[name];
    units.push('drop policy if exists "' + name + '" on public.' + tableName + ';');
    add(SETUP, 'policy:' + name, found[0]);
  }
  const events = statements(sources[EVENTS]).map(stripLeadingComments).filter(s => !/^(begin|commit)\s*;$/i.test(s));
  assert(events.length > 10);
  for (const sql of events) add(EVENTS, 'event-migration-statement', sql);
  return { sql: units.join('\n'), entries,
    preserved: PRESERVED.map(([source, name, args, installedName]) => ({ source, name: installedName || name,
      signature: (installedName || name) + '(' + args + ')', body: body(lastFunction(sources[source], name).sql) })),
    sources: Object.entries(sources).map(([file, text]) => ({ file, sha256: sha(text) })) };
}
function manifest() {
  const plan = buildPlan();
  return { schemaVersion: 1, sources: plan.sources, contracts: plan.entries,
    preservedFunctions: plan.preserved.map(({ body: value, ...entry }) => ({ ...entry, bodySha256: sha(value) })),
    adaptations: ['Add missing nullable history columns to minimal preceding fixtures; retain all original row projections.',
      'Install canonical member SELECT policies and explicit authenticated table grants needed by the browser.',
      'Retain existing billing, live-session and member-isolation guards; no Auth fixtures or external services.'] };
}
async function preserveRows(client) {
  const names = ['academias', 'membros', 'saas_clientes', 'dados', 'app_aluno', 'dados_hist', 'app_aluno_hist'];
  const result = [];
  for (const table of names) {
    const columns = (await client.query('select attname from pg_attribute where attrelid=$1::regclass and attnum>0 and not attisdropped order by attnum', ['public.' + table])).rows.map(x => x.attname);
    assert(columns.length && columns.every(name => /^[a-z_]+$/.test(name)));
    const sql = 'select md5(coalesce(jsonb_agg(to_jsonb(q) order by to_jsonb(q)::text),\'[]\')::text) as fingerprint from (select ' + columns.join(',') + ' from public.' + table + ') q';
    result.push({ table, sql, fingerprint: (await client.query(sql)).rows[0].fingerprint });
  }
  return result;
}
async function install({ client }) {
  assert.equal(process.env.CI, 'true');
  assert.equal(process.env.HQ_AUTH_CI_DISPOSABLE, '1');
  const conn = client?.connectionParameters;
  assert(conn && conn.host === '127.0.0.1' && Number(conn.port) === 55433 && conn.database === 'hq_auth_ci', 'Only disposable real Auth CI connection accepted');
  const plan = buildPlan();
  const scalar = async (sql, values) => Object.values((await client.query(sql, values)).rows[0])[0];
  assert.equal(await scalar('select current_database()'), 'hq_auth_ci');
  assert.equal(await scalar("select to_regclass('auth.schema_migrations') is not null and to_regclass('auth.sessions') is not null and to_regprocedure('auth.uid()') is not null and to_regprocedure('auth.jwt()') is not null"), true);
  assert(Number(await scalar('select count(*) from auth.schema_migrations')) > 20, 'Official Auth migrations must already be installed');
  for (const signature of ['public.personal_billing_service(text,jsonb)', 'public.personal_acesso_revoga(uuid,text,timestamptz)'])
    assert.equal(await scalar('select to_regprocedure($1) is not null', [signature]), true, 'Run all existing HTTP checks first');
  for (const item of plan.preserved) {
    const value = await scalar('select prosrc from pg_proc where oid=to_regprocedure($1)', [item.signature]);
    assert.equal(value.replace(/\r\n/g, '\n').trim(), item.body, 'Pre-existing canonical function drift: ' + item.signature);
  }
  await client.query('begin');
  try {
    await client.query("set local lock_timeout='5s';set local statement_timeout='30s'");
    const snapshots = await preserveRows(client);
    await client.query(`
      alter table public.app_aluno add column if not exists visto_em timestamptz;
      alter table public.membros add column if not exists criado timestamptz not null default now();
      alter table public.dados_hist add column if not exists id bigint generated always as identity;
      alter table public.dados_hist add column if not exists chave text;
      alter table public.dados_hist add column if not exists atualizado timestamptz;
      alter table public.dados_hist add column if not exists guardado_em timestamptz not null default now();
      alter table public.app_aluno_hist add column if not exists id bigint generated always as identity;
      alter table public.app_aluno_hist add column if not exists token text;
      alter table public.app_aluno_hist add column if not exists retorno jsonb;
      alter table public.app_aluno_hist add column if not exists atualizado timestamptz;
      alter table public.app_aluno_hist add column if not exists guardado_em timestamptz not null default now();
      alter table public.dados_hist enable row level security;
      alter table public.app_aluno_hist enable row level security;
      revoke all on public.dados_hist,public.app_aluno_hist from public,anon,authenticated;
      grant select on public.academias,public.membros to authenticated;
    `);
    await client.query(plan.sql);
    await client.query(`alter table public.app_treino_log enable row level security;
      revoke all on public.app_treino_log from public,anon,authenticated;
      grant select,insert,update,delete on public.app_treino_log to authenticated;
      notify pgrst,'reload schema';`);
    for (const snapshot of snapshots) assert.equal((await client.query(snapshot.sql)).rows[0].fingerprint, snapshot.fingerprint, 'Existing fixture changed: ' + snapshot.table);
    for (const [signature, roles] of FUNCTIONS) {
      const installed = await client.query(`select prosrc,
        has_function_privilege('anon',oid,'EXECUTE') anon,
        has_function_privilege('authenticated',oid,'EXECUTE') authenticated
        from pg_proc where oid=to_regprocedure($1)`, ['public.' + signature]);
      assert.equal(installed.rows.length, 1, signature);
      assert.equal(installed.rows[0].prosrc.replace(/\r\n/g, '\n').trim(),
        body(lastFunction(plan.sql, 'public.' + signature.split('(')[0]).sql), signature);
      for (const role of ['anon', 'authenticated']) assert.equal(installed.rows[0][role], roles.includes(role), signature + ' ' + role);
    }
    const activeTriggers = (await client.query("select tgname from pg_trigger where not tgisinternal and tgenabled='O' and tgname=any($1::text[]) order by tgname", [TRIGGERS])).rows.map(x => x.tgname);
    assert.deepEqual(activeTriggers, [...TRIGGERS].sort());
    await client.query('commit');
    return { ...manifest(), preservedRowProjections: snapshots.map(({ table }) => table),
      verifiedInstalledFunctionCount: FUNCTIONS.length, verifiedInstalledTriggers: activeTriggers,
      transport: 'real-auth-preexisting', installed: true };
  } catch (error) { await client.query('rollback'); throw error; }
}
module.exports = { install, manifest, statements, lastFunction, buildPlan, body };
