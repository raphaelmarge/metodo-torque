/* Contratos estáticos complementares. Execução real: tests/sql/test-reliability.py. */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'supabase-setup.sql'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'migrations/20260909_ptstudio_cas_v807.sql'), 'utf8');
let n = 0;
function ok(value, message) { assert.ok(value, message); n++; console.log('  OK ' + message); }
ok(/alter table public\.dados add column if not exists base_atualizado timestamptz/i.test(sql), 'schema aceita a revisão-base no upsert');
ok(/tg_op = 'UPDATE'[\s\S]{0,140}old\.chave = 'mtapp:ptStudio'/i.test(migration), 'UPDATE protege o agregado crítico inclusive contra renomeação');
ok(/new\.base_atualizado is null or old\.atualizado is distinct from new\.base_atualizado/i.test(migration), 'revisão ausente ou antiga é recusada');
ok(/errcode = 'PT409'/.test(migration), 'conflito tem código estável');
ok(/greatest\(clock_timestamp\(\), old\.atualizado \+ interval '1 microsecond'\)/.test(migration), 'relógio do servidor gera revisões distintas na mesma transação');
ok(/after insert on public\.dados/.test(migration), 'inclusão real tem validação separada sem apagar EXCLUDED');
ok(/before insert or update of dados, academia_id, token on public\.app_aluno/.test(migration), 'publicação protegida não intercepta atualizações só de retorno');
ok(/for share;/.test(migration), 'publicação bloqueia a revisão da fonte durante a gravação');
for (const name of ['dados_carimba', 'dados_base_insercao_valida', 'app_aluno_valida_fonte']) {
 const re = new RegExp('create or replace function public\\.' + name + '\\(\\)[\\s\\S]*?end \\$\\$;');
 const m = migration.match(re), s = sql.match(re);
 ok(m && s && m[0] === s[0], name + ': migração e instalação nova usam exatamente a mesma função');
 ok(migration.includes('revoke execute on function public.' + name + '() from public, anon, authenticated;'), name + ': sem execução pública direta');
}
ok(fs.existsSync(path.join(root, 'tests/sql/test-reliability.py')), 'existe teste PostgreSQL executável separado dos mocks');
console.log(n + ' contratos estáticos passaram; a prova de execução SQL é outro job.');
