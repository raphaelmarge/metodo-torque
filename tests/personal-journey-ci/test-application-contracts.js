'use strict';
// Local extraction/guard tests. These do NOT claim a running Auth/PostgREST or
// browser journey. install() is exercised against genuine Auth only by CI.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { statements, lastFunction, buildPlan, manifest, install, body } = require('./application-contracts.cjs');
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
let count = 0;
async function check(name, fn) { await fn(); console.log('OK ' + (++count) + ' ' + name); }
async function main() {
  await check('SQL splitter preserves quoted semicolons and nested blocks', () => {
    const input = "/* outer /* nested; */ end */ select 'a;''b'; -- ;\ncreate function public.f() returns text language sql as $code$ select ';'; $code$; select \"semi;column\";";
    const split = statements(input); assert.equal(split.length, 3);
    assert(split[0].includes("'a;''b'")); assert(split[1].includes("select ';';"));
    assert.throws(() => statements("select 'unfinished;"));
    assert.throws(() => statements('select 1'));
    assert.throws(() => statements('select 1; /* unfinished'));
  });
  await check('duplicate RPC selection uses the last complete body and excludes neighboring SQL', () => {
    const old = 'create or replace function public.f() returns jsonb language sql as $$select null::jsonb;$$;';
    const next = 'create or replace function public.f() returns jsonb language sql as $$select jsonb_build_object(\'visto_em\',now());$$;';
    const chosen = lastFunction(old + '\nselect pg_sleep(1);\n' + next + '\nselect 42;', 'public.f');
    assert.equal(chosen.definitions, 2); assert.equal(chosen.sql, next);
    assert.throws(() => lastFunction(old, 'public.missing'));
    assert.throws(() => lastFunction(old, 'public.f; select 1'));
  });
  const plan = buildPlan(), record = manifest();
  await check('manifest fingerprints complete source bytes and every extracted contract', () => {
    assert.equal(record.sources.length, 6); assert.equal(record.preservedFunctions.length, 8);
    for (const item of record.sources) assert.equal(item.sha256, sha(fs.readFileSync(path.join(__dirname, '../..', item.file), 'utf8')));
    assert(record.contracts.length > 35);
    assert(record.contracts.every(x => /^[a-f0-9]{64}$/.test(x.sha256)));
    assert.equal(sha(buildPlan().sql), sha(plan.sql));
  });
  await check('student readers are current seen-time versions and return preserves reserved modules', () => {
    for (const name of ['app_aluno_estado', 'app_aluno_busca']) {
      const selected = record.contracts.find(x => x.label === 'public.' + name);
      assert(selected.definitions >= 2);
      assert.match(body(lastFunction(plan.sql, 'public.' + name).sql), /visto_em/);
      assert.match(body(lastFunction(plan.sql, 'public.' + name).sql), /revogado_em/);
    }
    const giveBack = body(lastFunction(plan.sql, 'public.app_aluno_devolve').sql);
    assert(giveBack.includes("- 'nutricaoV1' - 'nutricao' - 'onboardingConsultoria' - 'consultoriaAceite'"));
    assert(giveBack.includes('public.app_retorno_mescla'));
    assert(plan.sql.includes('create or replace function public.app_lista_mescla'));
  });
  await check('canonical optimistic locking, RPC enforcement and event validation are present', () => {
    for (const token of ['PT409', 'PT426', 'mt.sync_rpc', 'mt.app_publica_rpc', 'EVENT_ID_COLLISION', 'SESSION_NOT_FOUND', 'REVISION_CYCLE_OR_DEPTH']) assert(plan.sql.includes(token), token);
    for (const name of ['dados_carimba_tg', 'dados_hist_tg', 'dados_exige_rpc_tg', 'app_aluno_exige_rpc_tg', 'app_aluno_hist_tg'])
      assert(record.contracts.some(x => x.label === 'trigger:' + name));
    for (const name of ['public.minha_assinatura', 'public.criar_personal', 'public.dados_personal_patch', 'torque_private.personal_session_valid'])
      assert(record.preservedFunctions.some(x => x.name === name));
  });
  await check('allowlist does not install the setup side effects or any Auth substitute', () => {
    assert(!/create\s+(?:or\s+replace\s+)?(?:table|function)\s+auth\./i.test(plan.sql));
    assert(!/cron\.|net\.|http_post|pg_sleep|create\s+extension|regua_config|push_prof/i.test(plan.sql));
    assert(!/insert\s+into\s+(?:public\.)?(?:academias|membros|saas_clientes)\s*\(/i.test(plan.sql));
    assert(!/create\s+(?:or\s+replace\s+)?function\s+public\.(?:minha_assinatura|criar_personal|criar_academia)\s*\(/i.test(plan.sql));
  });
  await check('installer refuses non-CI or remote connections before executing any SQL', async () => {
    const original = { CI: process.env.CI, HQ_AUTH_CI_DISPOSABLE: process.env.HQ_AUTH_CI_DISPOSABLE };
    let queried = false;
    const client = { connectionParameters: { host: 'remote.invalid', port: 55433, database: 'hq_auth_ci' }, query: () => { queried = true; throw new Error('Must not query'); } };
    try {
      process.env.CI = 'false'; process.env.HQ_AUTH_CI_DISPOSABLE = '1';
      await assert.rejects(() => install({ client })); assert.equal(queried, false);
      process.env.CI = 'true';
      await assert.rejects(() => install({ client })); assert.equal(queried, false);
      client.connectionParameters.host = '127.0.0.1'; client.connectionParameters.database = 'postgres';
      await assert.rejects(() => install({ client })); assert.equal(queried, false);
    } finally { for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
  });
  console.log('PASS ' + count + ' application contract extraction/guard checks; no Auth or browser execution claimed.');
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { main };
