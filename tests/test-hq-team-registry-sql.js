/* Synthetic, disposable PGlite only. No network/Auth service/production access.
 * The sibling runtime fallback is read-only convenience for an isolated checkout.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const runtime = ['./runtime/node_modules/@electric-sql/pglite', '../../torque-hq-implementation/tests/runtime/node_modules/@electric-sql/pglite']
  .map(p => path.resolve(__dirname, p)).find(p => fs.existsSync(p));
if (!runtime) throw new Error('Prepare tests/runtime before running the disposable SQL suite.');
const { PGlite } = require(runtime);
const { fixtureSQL } = require('./test-hq-concurrency-pg.js');
const sql = fs.readFileSync(path.join(__dirname, '../supabase/hq-team-registry-proposal.sql'), 'utf8');
const ops = fs.readFileSync(path.join(__dirname, '../supabase/hq-ops-proposal.sql'), 'utf8');
const uid = n => '64000000-0000-4000-8000-' + String(n).padStart(12, '0');
const users = { admin:uid(1), admin2:uid(2), outsider:uid(3), finance:uid(4), sales:uid(5), support:uid(6), engineering:uid(7), viewer:uid(8) };
const accountA = uid(101), accountB = uid(102);
let checks = 0, sequence = 0;
function check(value,label) { assert.ok(value,label); console.log('OK ' + (++checks) + ' - ' + label); }
async function denies(fn,code,label) { await assert.rejects(fn,e=>e.code===code,label); check(true,label); }
async function main() {
  const db = new PGlite();
  let current = 'admin', currentRole = 'authenticated', extraClaims = {};
  async function actor(name,role='authenticated',claims={}) {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({sub:users[name] || undefined,...claims})]);
    await db.exec('set role ' + role);
    current=name; currentRole=role; extraClaims=claims;
  }
  async function owner(query,params=[]) {
    await db.exec('reset role');
    try { return await db.query(query,params); }
    finally { await actor(current,currentRole,extraClaims); }
  }
  const snapshot = async () => (await db.query('select public.hq_team_snapshot() as value')).rows[0].value;
  const envelope = (type,payload,key='team-test-'+(++sequence),reason='Revisao sintetica local') => ({type,payload,idempotencyKey:key,reason});
  const send = async value => (await db.query('select public.hq_team_command($1::jsonb) as value',[JSON.stringify(value)])).rows[0].value;
  const command = (type,payload,key,reason) => send(envelope(type,payload,key,reason));
  const count = async table => (await owner('select count(*)::int n from torque_hq.'+table)).rows[0].n;
  async function protectedState() {
    return (await owner(`select jsonb_build_object(
      'auth',(select jsonb_agg(to_jsonb(u) order by id) from auth.users u),
      'admins',(select jsonb_agg(to_jsonb(a) order by user_id) from public.saas_admins a),
      'gate',(select jsonb_agg(to_jsonb(s)) from torque_hq.settings s),
      'staff',(select jsonb_agg(to_jsonb(s) order by user_id) from torque_hq.staff s),
      'scope',(select jsonb_agg(to_jsonb(s) order by user_id,account_id) from torque_hq.staff_account_scope s),
      'opsAudit',(select count(*) from torque_hq.audit),'opsCommands',(select count(*) from torque_hq.commands)
    ) value`)).rows[0].value;
  }
  try {
    await db.exec(fixtureSQL);
    await db.query('insert into auth.users(id,email) select x, x::text || $1 from unnest($2::uuid[]) x',['@example.test',Object.values(users)]);
    await db.query('insert into public.saas_admins values($1),($2)',[users.admin,users.admin2]);
    await db.query("insert into public.academias(id,nome) values($1,'Fixture A'),($2,'Fixture B')",[accountA,accountB]);
    await db.exec(ops);
    for (const role of ['finance','sales','support','engineering','viewer']) {
      await db.query('insert into torque_hq.staff(user_id,role,enabled) values($1,$2,true)',[users[role],role]);
    }
    await db.query('insert into torque_hq.staff_account_scope(user_id,account_id,granted_by) values($1,$2,$3)',[users.support,accountA,users.admin]);
    await db.exec('alter default privileges grant execute on functions to service_role; alter default privileges grant all on tables to service_role');
    const prior = await protectedState();
    await db.exec('reset role');
    await db.exec('update torque_hq.settings set staff_enabled=true where id');
    await denies(()=>db.exec(sql),'55000','installer refuses staff gate enabled instead of expanding current access');
    await db.exec('rollback');
    check((await db.query("select to_regclass('torque_hq.team_registry')::text x,staff_enabled from torque_hq.settings")).rows.every(r=>r.x===null && r.staff_enabled),'refused installation preserves gate and creates no team table');
    await db.exec('update torque_hq.settings set staff_enabled=false where id');
    await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/rollback/hq-ops-suspend.sql'),'utf8'));
    await denies(()=>db.exec(sql),'55000','installer refuses suspended OPS instead of exposing new endpoints during suspension');
    await db.exec('rollback');
    check((await db.query("select to_regprocedure('public.hq_team_snapshot()')::text x")).rows[0].x===null,'suspended dependency leaves team endpoint absent');
    await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/rollback/hq-ops-resume.sql'),'utf8'));
    await db.exec(sql);
    await actor('admin');
    check(JSON.stringify(await protectedState())===JSON.stringify(prior),'installation preserves Auth/admins/staff/scope/gate and OPS audit');
    let snap = await snapshot();
    check(snap.team.length===0 && snap.audit.length===0,'installation invents no employees or invitations');
    check(snap.meta.staffGateEnabled===false && snap.meta.accessProvisioningAvailable===false,'snapshot states actual disabled gate and unavailable provisioning');
    check(snap.currentUserId===users.admin && snap.sources.team.status==='ready' && snap.sources.team.scope==='administrativeRegistryOnly','source and actual administrator identity are explicit');
    check(snap.meta.roleMatrixKind==='referenceOnly' && snap.meta.roleMatrix.length===6,'reference matrix covers exactly the six proposed profiles');
    for (const row of snap.meta.roleMatrix) {
      const expected = (await owner('select torque_hq.permissions($1) p',[row.role])).rows[0].p.concat(row.role==='admin'?['team.read','team.write','team.review']:[]);
      check(JSON.stringify(row.permissions)===JSON.stringify(expected) && row.effectiveAccess===false,'matrix derives server permissions for '+row.role+' without granting them');
    }
    const tables = (await owner("select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='torque_hq' and c.relname in ('team_registry','team_registry_commands','team_registry_audit')")).rows;
    check(tables.length===3 && tables.every(t=>t.relrowsecurity),'three private tables enable RLS');
    const definitions = (await owner("select p.proname,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='public' and p.proname like 'hq_team_%') or (n.nspname='torque_hq' and p.proname like 'team_%')")).rows;
    check(definitions.length===6 && definitions.every(p=>p.prosecdef===p.proname.startsWith('hq_team_') && p.proconfig.includes('search_path=""')),'only the two public endpoints are definers; every function pins empty search path');
    for (const role of ['anon','authenticated','service_role']) {
      const acl=(await owner("select has_function_privilege($1,'public.hq_team_snapshot()','EXECUTE') snapshot,has_function_privilege($1,'public.hq_team_command(jsonb)','EXECUTE') command,has_function_privilege($1,'torque_hq.team_require_admin()','EXECUTE') helper,has_table_privilege($1,'torque_hq.team_registry','SELECT') data,has_table_privilege($1,'torque_hq.team_registry_audit','INSERT') audit",[role])).rows[0];
      check(acl.snapshot===(role==='authenticated') && acl.command===(role==='authenticated') && !acl.helper && !acl.data && !acl.audit,'explicit grants/revokes constrain '+role+' including inherited service defaults');
    }
    const create = envelope('team.create',{name:'Pessoa sintetica A',contact:users.outsider+'@example.test',proposedRole:'admin'},'create-fixed-0001');
    const first = await send(create);
    check(first.ok && !first.externalEffect && !first.accessGranted && !first.member.effectiveAccess,'create returns no external action or effective grant');
    check(first.member.status==='active' && first.member.accessState==='accessPending' && first.member.reviewStatus==='pending' && first.member.version===1,'active proposal begins pending without an Auth identity');
    check(!Object.hasOwn(first.member,'authUserId') && first.member.createdBy===users.admin,'employee ID is a registry identifier, not an Auth link');
    const replay = await send(create);
    check(replay.replayed && replay.id===first.id && await count('team_registry')===1 && await count('team_registry_audit')===1,'identical retry makes no duplicate employee or audit');
    await denies(()=>send({...create,reason:'Outro motivo sintetico'}),'22023','same idempotency key with different reason is rejected');
    await denies(()=>command('team.create',{...create.payload,permissions:['team.write']}),'22023','forged payload permissions rejected');
    await denies(()=>command('team.create',{...create.payload,effectiveAccess:true}),'22023','forged effective access rejected');
    await denies(()=>command('team.create',{...create.payload,userId:users.outsider}),'22023','Auth identity linkage cannot be injected');
    await denies(()=>command('team.create',{...create.payload,accountId:accountA}),'22023','tenant scope cannot be injected into a global administrative registry');
    await denies(()=>send({...create,idempotencyKey:'forged-envelope-1',role:'admin'}),'22023','forged envelope role rejected');
    for (const type of ['staff.grant','team.invite','team.delete','settings.enableStaff']) {
      await denies(()=>command(type,{id:first.id}),'22023','operation '+type+' does not exist');
    }
    const malformed = [
      ['short name',{name:'A',proposedRole:'viewer'}],['long name',{name:'A'.repeat(161),proposedRole:'viewer'}],
      ['contact object',{name:'Teste',contact:{email:'bad'},proposedRole:'viewer'}],['contact too long',{name:'Teste',contact:'x'.repeat(255),proposedRole:'viewer'}],
      ['control characters',{name:'Teste\nPessoa',proposedRole:'viewer'}],['unknown profile',{name:'Teste',proposedRole:'owner'}]
    ];
    for (const [label,payload] of malformed) await denies(()=>command('team.create',payload),'22023','rejects '+label);
    await denies(()=>command('team.create',create.payload,undefined,''),'22023','all mutations require a reason');
    await denies(()=>command('team.create',create.payload,'tiny'),'22023','idempotency key requires minimum length');
    for (const value of [null,{},[],false]) await denies(()=>send(value),'22023','malformed command envelope rejected');
    await denies(()=>db.query('select * from torque_hq.team_registry'),'42501','app admin cannot read private registry directly');
    await denies(()=>db.query('delete from torque_hq.team_registry_audit'),'42501','app admin cannot erase audit');
    for (const name of ['outsider','finance','sales','support','engineering','viewer']) {
      await actor(name,'authenticated',{role:'admin',app_metadata:{role:'admin'},user_metadata:{role:'admin'}});
      await denies(snapshot,'42501',name+' cannot read employee/contact/counts even with forged role claims');
      await denies(()=>command('team.update',{id:first.id,expectedVersion:1,name:'Negado'}),'42501',name+' cannot edit a known registry ID');
      await denies(()=>command('team.review',{id:first.id,expectedVersion:1,reviewStatus:'approved'}),'42501',name+' cannot approve a known proposal');
    }
    await actor('outsider');
    await denies(()=>db.query('select public.hq_ops_snapshot()'),'42501','proposed admin record does not authorize the HQ');
    await actor('support');
    await owner('update torque_hq.settings set staff_enabled=true where id'); // Explicit extended-mode fixture only.
    await denies(snapshot,'42501','real enabled staff remains denied even with own account scope and gate on');
    await owner('update torque_hq.settings set staff_enabled=false where id');
    for (const role of ['anon','service_role']) {
      await actor('admin',role);
      await denies(snapshot,'42501',role+' cannot call snapshot even with admin sub');
      await denies(()=>send(create),'42501',role+' cannot call command even with admin sub');
    }
    await actor(''); await denies(snapshot,'42501','missing identity denied before reading any row');
    await actor('admin');
    await owner('delete from public.saas_admins where user_id=$1',[users.admin]);
    await denies(()=>send(create),'42501','revoked admin cannot replay a previously authorized command');
    await denies(snapshot,'42501','revoked admin cannot read cached registry server-side');
    await owner('insert into public.saas_admins values($1)',[users.admin]);
    let result=await command('team.review',{id:first.id,expectedVersion:1,reviewStatus:'approved'});
    check(result.member.reviewStatus==='approved' && result.member.reviewedBy===users.admin && result.member.accessState==='accessPending' && !result.accessGranted,'approval records review only, never grants access');
    await actor('outsider');
    await denies(snapshot,'42501','approved admin proposal with matching Auth email still cannot read registry');
    await denies(()=>db.query('select public.hq_ops_snapshot()'),'42501','approved admin proposal with matching Auth email still cannot access OPS');
    await actor('admin');
    await denies(()=>command('team.review',{id:first.id,expectedVersion:2,reviewStatus:'approved'}),'22023','approved proposal cannot be reviewed again without editing');
    const beforeConflict = await count('team_registry_commands');
    await denies(()=>command('team.update',{id:first.id,expectedVersion:1,name:'Versao antiga'}),'40001','optimistic version rejects stale edits');
    check(await count('team_registry_commands')===beforeConflict,'stale edit rolls back idempotency reservation');
    result=await command('team.update',{id:first.id,expectedVersion:2,contact:'',proposedRole:'finance'});
    check(result.member.version===3 && result.member.contact==='' && result.member.reviewStatus==='pending' && result.member.reviewedAt===null,'editing clears contact and invalidates previous approval');
    await denies(()=>command('team.update',{id:first.id,expectedVersion:3,proposedRole:'finance'}),'22023','no-op update does not fabricate audit activity');
    await denies(()=>command('team.update',{id:first.id,expectedVersion:3}),'22023','empty edit is rejected');
    for (const version of [0,-1,1.5,'3',null,2147483647]) await denies(()=>command('team.setStatus',{id:first.id,expectedVersion:version,status:'inactive'}),'22023','invalid expectedVersion '+JSON.stringify(version)+' rejected');
    result=await command('team.setStatus',{id:first.id,expectedVersion:3,status:'inactive'});
    check(result.member.status==='inactive' && result.member.accessState==='disabled' && result.member.version===4,'inactivation persists administrative disabled state');
    await denies(()=>command('team.review',{id:first.id,expectedVersion:4,reviewStatus:'approved'}),'22023','inactive record cannot receive proposal approval');
    result=await command('team.setStatus',{id:first.id,expectedVersion:4,status:'active'});
    check(result.member.reviewStatus==='pending' && result.member.accessState==='accessPending' && result.member.version===5,'reactivation returns to pending review/access');
    result=await command('team.review',{id:first.id,expectedVersion:5,reviewStatus:'rejected'});
    check(result.member.reviewStatus==='rejected' && result.member.accessState==='accessPending' && !result.member.effectiveAccess,'rejected review is retained without granting access');
    await denies(()=>command('team.update',{id:uid(9999),expectedVersion:1,name:'Inexistente'}),'P0002','unknown employee fails without creating anything');
    await actor('admin2');
    const second=await send(create);
    check(second.id!==first.id && !second.replayed,'idempotency namespace is scoped to authenticated actor');
    await actor('admin');
    snap=await snapshot();
    check(snap.audit.length===await count('team_registry_commands') && snap.audit.every(a=>a.actorId && a.reason && a.changedFields.length),'one committed audit per command with actual actor and reason');
    check(snap.audit.every(a=>!JSON.stringify(a.before).includes(create.payload.contact) && !Object.hasOwn(a.after,'contact') && !Object.hasOwn(a.after,'name')),'audit before/after excludes redundant name and contact');
    check(snap.audit.some(a=>a.action==='team.update' && a.changedFields.includes('contact')),'audit tracks changed contact field without repeating its value');
    const beforeRollback=await count('team_registry');
    await db.exec('begin');
    await command('team.create',{name:'Transacao revertida',proposedRole:'viewer'});
    await db.exec('rollback');
    check(await count('team_registry')===beforeRollback,'outer transaction rollback preserves atomic registry/command/audit boundary');
    check(JSON.stringify(await protectedState())===JSON.stringify(prior),'all operations preserve Auth/admins/staff/scope/gate and existing OPS state');
    const oid=(await owner("select 'public.hq_team_snapshot()'::regprocedure::oid id")).rows[0].id;
    await db.exec('reset role');
    await denies(()=>db.exec(sql),'42P07','reapplying additive installer fails safely instead of duplicating registry');
    await db.exec('rollback');
    await actor('admin');
    check((await owner("select 'public.hq_team_snapshot()'::regprocedure::oid id")).rows[0].id===oid && (await snapshot()).team.length===2,'failed reapply preserves original endpoint and employee records');
  } finally { await db.close(); }
  const missing = new PGlite();
  try {
    await missing.exec(fixtureSQL);
    await denies(()=>missing.exec(sql),'55000','installer refuses missing OPS dependency atomically');
    await missing.exec('rollback');
    check((await missing.query("select to_regprocedure('public.hq_team_snapshot()')::text x")).rows[0].x===null,'failed dependency check leaves no public endpoint');
  } finally { await missing.close(); }
  console.log('PASS ' + checks + ' checks: team registry PGlite; no HTTP/Auth or concurrency certification.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
