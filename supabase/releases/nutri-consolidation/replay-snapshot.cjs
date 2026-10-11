/* Structural replay for DISPOSABLE LOCAL TESTS ONLY. Does not connect to Supabase.
 * Source: catalog metadata; Auth is a deliberately minimal synthetic substitute.
 * Defaults for future objects, managed extensions, PostgREST, Auth HTTP, Storage,
 * cron and platform configuration are outside this replay.
 */
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('../../../tests/runtime/node_modules/@electric-sql/pglite');
const { pgcrypto } = require('../../../tests/runtime/node_modules/@electric-sql/pglite/dist/contrib/pgcrypto.cjs');
const snapshot = JSON.parse(fs.readFileSync(path.join(__dirname, 'snapshot.json'), 'utf8'));
const qi = s => '"' + s.replaceAll('"', '""') + '"';
const ident = x => qi(x.schema) + '.' + qi(x.table_name || x.tablename || x.name);

function structuralSql() {
  const sql = ['SET search_path = public, extensions, pg_catalog;', 'SET check_function_bodies = false;'];
  for (const t of snapshot.relations) {
    if (t.kind !== 'r') throw new Error('Unimplemented relation kind ' + t.kind);
    const cols = snapshot.columns.filter(x => x.schema === t.schema && x.table_name === t.name);
    sql.push('CREATE TABLE ' + ident(t) + ' (\n' + cols.map(c => {
      const type = snapshot.column_types.find(x => x.schema === c.schema && x.table_name === c.table_name && x.column_name === c.column_name);
      return qi(c.column_name) + ' ' + type.sql_type + (c.is_nullable === 'NO' ? ' NOT NULL' : '');
    }).join(',\n') + '\n);');
  }
  for (const f of snapshot.functions) sql.push(f.definition + ';');
  for (const c of snapshot.columns.filter(x => x.column_default !== null))
    sql.push('ALTER TABLE ' + ident(c) + ' ALTER COLUMN ' + qi(c.column_name) + ' SET DEFAULT ' + c.column_default + ';');
  for (const kind of ['p', 'u', 'c', 'f']) for (const c of snapshot.constraints.filter(x => x.type === kind))
    sql.push('ALTER TABLE ' + ident(c) + ' ADD CONSTRAINT ' + qi(c.name) + ' ' + c.definition + (c.validated ? '' : ' NOT VALID') + ';');
  for (const i of snapshot.indexes) {
    if (!snapshot.constraints.some(c => c.schema === i.schema && c.table_name === i.tablename && c.name === i.indexname && ['p', 'u'].includes(c.type))) sql.push(i.indexdef + ';');
  }
  for (const t of snapshot.triggers) sql.push(t.definition + ';');
  for (const p of snapshot.policies) sql.push('CREATE POLICY ' + qi(p.policyname) + ' ON ' + ident(p) + ' AS ' + p.permissive + ' FOR ' + p.cmd + ' TO ' + p.roles.map(qi).join(',') + (p.qual ? ' USING (' + p.qual + ')' : '') + (p.with_check ? ' WITH CHECK (' + p.with_check + ')' : '') + ';');
  for (const t of snapshot.relations) {
    if (t.rls) sql.push('ALTER TABLE ' + ident(t) + ' ENABLE ROW LEVEL SECURITY;');
    if (t.force_rls) sql.push('ALTER TABLE ' + ident(t) + ' FORCE ROW LEVEL SECURITY;');
    sql.push('REVOKE ALL ON ' + ident(t) + ' FROM PUBLIC, anon, authenticated, service_role;');
  }
  for (const g of snapshot.grants) sql.push('GRANT ' + g.privilege_type + ' ON ' + ident(g) + ' TO ' + qi(g.grantee) + (g.is_grantable === 'YES' ? ' WITH GRANT OPTION' : '') + ';');
  for (const g of snapshot.column_grants.filter(g => !snapshot.grants.some(t => t.schema === g.schema && t.table_name === g.table_name && t.grantee === g.grantee && t.privilege_type === g.privilege_type)))
    sql.push('GRANT ' + g.privilege_type + '(' + qi(g.column_name) + ') ON ' + ident(g) + ' TO ' + qi(g.grantee) + (g.is_grantable === 'YES' ? ' WITH GRANT OPTION' : '') + ';');
  for (const f of snapshot.functions) {
    const name = ident(f) + '(' + f.identity_arguments + ')';
    sql.push('REVOKE ALL ON FUNCTION ' + name + ' FROM PUBLIC, anon, authenticated, service_role;');
    if (!f.acl) throw new Error('Function default ACL requires explicit handling: ' + name);
    for (const entry of f.acl.slice(1, -1).split(',')) {
      const [role, rest] = entry.split('=');
      if (rest.startsWith('X')) sql.push('GRANT EXECUTE ON FUNCTION ' + name + ' TO ' + (role ? qi(role) : 'PUBLIC') + ';');
    }
  }
  sql.push('SET check_function_bodies = true;');
  return sql.join('\n');
}

async function createSnapshotDb() {
  const db = new PGlite({ extensions: { pgcrypto } });
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE SCHEMA private; CREATE SCHEMA extensions;
      GRANT USAGE ON SCHEMA public, auth, extensions TO anon, authenticated, service_role;
      GRANT USAGE ON SCHEMA private TO authenticated;
      CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
      CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz, is_anonymous boolean DEFAULT false);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;`);
    await db.exec(structuralSql());
    return db;
  } catch (error) { await db.close(); throw error; }
}

module.exports = { createSnapshotDb, structuralSql, snapshot };
if (require.main === module) process.stdout.write(structuralSql() + '\n');
