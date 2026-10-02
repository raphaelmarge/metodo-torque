/* Local package/suspension proof in disposable PGlite. No remote connection,
 * HTTP/Auth certification, deployment or destructive production rollback. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const runtime=['./runtime/node_modules/@electric-sql/pglite','../../torque-hq-implementation/tests/runtime/node_modules/@electric-sql/pglite']
  .map(p=>path.resolve(__dirname,p)).find(p=>fs.existsSync(p));
if(!runtime)throw Error('Prepare tests/runtime for local SQL tests.');
const {PGlite}=require(runtime);
const {fixtureSQL}=require('./test-hq-concurrency-pg.js');
const ROOT=path.resolve(__dirname,'..');
const RELEASE=path.join(ROOT,'supabase/releases/hq-team-admin-local');
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const lf=s=>s.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const admin='65000000-0000-4000-8000-000000000001';
const staff='65000000-0000-4000-8000-000000000002';
const account='65000000-0000-4000-8000-000000000003';
let checks=0;
function check(v,label){assert.ok(v,label);console.log('OK '+(++checks)+' - '+label);}
async function main(){
  const manifest=JSON.parse(fs.readFileSync(path.join(RELEASE,'manifest.json'),'utf8'));
  check(manifest.schemaVersion===1 && manifest.mode==='existing-admin-team-registry-only' && manifest.staffEnabled===false && manifest.accessProvisioningAvailable===false,'manifest declares administrative registry only, no grant or enabled gate');
  check(manifest.baseCommit==='fe49263d36afc88dbcf853e327c43ab3a936a3de' && manifest.status==='local-preparation-not-applied','manifest pins local base and unapplied state');
  assert.deepEqual(manifest.migrationAllowlist,['migrations/20260930232737_hq_team_registry.sql']);
  assert.deepEqual(fs.readdirSync(path.join(RELEASE,'migrations')),['20260930232737_hq_team_registry.sql']);
  check(manifest.migration.file===manifest.migrationAllowlist[0],'only the real CLI migration is allowlisted; no OPS/ledger/portal installation');
  const expectedSources=['supabase/hq-team-registry-proposal.sql','supabase/rollback/hq-team-suspend.sql','supabase/rollback/hq-team-resume.sql'];
  const entries=[manifest.migration,manifest.rollback.suspend,manifest.rollback.resume];
  const bundled=entries.map((entry,i)=>{
    assert.equal(entry.source,expectedSources[i]);
    const target=path.resolve(RELEASE,entry.file);
    assert.ok(target.startsWith(RELEASE+path.sep) && !entry.file.includes('..'));
    const bytes=fs.readFileSync(target,'utf8');
    assert.equal(bytes,lf(bytes));assert.equal(bytes,lf(read(entry.source)));assert.equal(sha(bytes),entry.sha256);
    return bytes;
  });
  check(bundled.length===3,'migration and both recovery scripts match canonical LF bytes and SHA256');
  check(bundled.slice(1).every(s=>!/(drop\s+(table|schema)|truncate|delete\s+from)/i.test(s)),'recovery scripts contain no destructive table/schema/data removal');
  check(bundled.every(s=>s.includes('pg_advisory_xact_lock(714882,1)') && s.includes('pg_advisory_xact_lock(714882,3)')),'installer and recovery share ordered OPS/team transaction locks');
  const [install,suspend,resume]=bundled;
  const db=new PGlite();
  const notices=[];
  const reservedFunctions=async()=> (await db.query(`select p.oid,n.nspname,p.proname,p.proargtypes::text arguments,
    p.proacl::text acl,p.proconfig,p.prosecdef,p.prorettype,p.proargmodes,p.prokind,p.prosrc
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='public' and left(p.proname,8)='hq_team_')
       or (n.nspname='torque_hq' and (left(p.proname,15)='suspended_team_' or left(p.proname,8)='hq_team_'))
    order by p.oid`)).rows;
  const driftSignatures=[
    'public.hq_team_snapshot(text)',
    'public.hq_team_command(jsonb,text)',
    'public.hq_team_legacy_snapshot()',
    'torque_hq.suspended_team_snapshot(text)',
    'torque_hq.suspended_team_legacy_snapshot()',
    'torque_hq.hq_team_snapshot(text)',
    'torque_hq.hq_team_legacy_snapshot()',
    'torque_hq.hq_team_command(jsonb)'
  ];
  async function obstruction(signature){
    assert.ok(driftSignatures.includes(signature));
    await db.exec(`create function ${signature} returns jsonb language plpgsql security definer set search_path='' as $$
      begin
        if to_regprocedure('torque_hq.team_require_admin()') is not null then perform torque_hq.team_require_admin(); end if;
        return '{"fixture":"legacy"}'::jsonb;
      end $$;
      revoke all on function ${signature} from public;
      grant execute on function ${signature} to authenticated`);
  }
  const endpoints=async()=> (await db.query(`select
    to_regprocedure('public.hq_team_snapshot()')::oid live_snapshot,
    to_regprocedure('public.hq_team_command(jsonb)')::oid live_command,
    to_regprocedure('torque_hq.suspended_team_snapshot()')::oid parked_snapshot,
    to_regprocedure('torque_hq.suspended_team_command(jsonb)')::oid parked_command,
    to_regprocedure('public.hq_ops_snapshot()')::oid ops_snapshot,
    to_regprocedure('public.hq_ops_command(jsonb)')::oid ops_command`)).rows[0];
  async function data(){
    const result={};
    const tables=(await db.query("select tablename from pg_tables where schemaname='torque_hq' order by tablename")).rows;
    for(const {tablename} of tables){assert.match(tablename,/^[a-z_]+$/);result[tablename]=(await db.query('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),\'[]\') value from torque_hq.'+tablename+' t')).rows[0].value;}
    result.auth=(await db.query('select jsonb_agg(to_jsonb(t) order by id) value from auth.users t')).rows[0].value;
    result.admins=(await db.query('select jsonb_agg(to_jsonb(t) order by user_id) value from public.saas_admins t')).rows[0].value;
    return result;
  }
  async function request(user,fn,role='authenticated'){
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user})]);
    await db.exec('set role '+role);
    try{return await fn();}finally{await db.exec('reset role');}
  }
  const call=command=>request(admin,()=>db.query('select public.hq_team_command($1::jsonb) value',[JSON.stringify(command)]));
  async function failure(script,label,code='55000'){
    const before=await data(),ids=await endpoints(),functions=await reservedFunctions(),noticeCount=notices.length;
    await assert.rejects(()=>db.exec(script),e=>e.code===code,label);
    await db.exec('rollback');
    assert.deepEqual(await data(),before);assert.deepEqual(await endpoints(),ids);
    assert.deepEqual(await reservedFunctions(),functions);assert.equal(notices.length,noticeCount);
    check(true,label+'; preserves data/gate/OIDs/ACLs and sends no NOTIFY');
  }
  try{
    await db.exec(fixtureSQL);
    await db.query('insert into auth.users(id) values($1),($2)',[admin,staff]);
    await db.query('insert into public.saas_admins values($1)',[admin]);
    await db.query("insert into public.academias(id,nome) values($1,'Synthetic recovery account')",[account]);
    await db.exec(read('supabase/hq-ops-proposal.sql'));
    await db.query("insert into torque_hq.staff(user_id,role,enabled) values($1,'support',true)",[staff]);
    await db.query('insert into torque_hq.staff_account_scope(user_id,account_id,granted_by) values($1,$2,$3)',[staff,account,admin]);
    await db.listen('pgrst',payload=>notices.push(payload));
    for(const signature of driftSignatures){
      await obstruction(signature);
      await failure(install,'installation rejects reserved RPC drift '+signature);
      await db.exec('drop function '+signature); // Only the deliberately injected synthetic obstruction.
    }
    await db.exec(install);
    const command={type:'team.create',payload:{name:'Synthetic recovery member',contact:'test@example.test',proposedRole:'admin'},reason:'Disposable recovery test',idempotencyKey:'recovery-fixed-001'};
    const result=(await call(command)).rows[0].value;
    const baseline=await data(),ids=await endpoints();
    check(baseline.team_registry.length===1 && baseline.team_registry_audit.length===1 && baseline.team_registry_commands.length===1,'versioned migration and actual RPC create a single audited synthetic registry record');
    await db.exec('update torque_hq.settings set staff_enabled=true where id'); // Explicit fixture only.
    await db.exec(suspend);
    let state=await endpoints();
    check(state.live_snapshot===null && state.live_command===null && state.parked_snapshot===ids.live_snapshot && state.parked_command===ids.live_command,'suspension removes two public RPCs and preserves their OIDs privately');
    assert.deepEqual(await data(),baseline);
    check(state.ops_snapshot===ids.ops_snapshot && state.ops_command===ids.ops_command,'suspension preserves all data, Auth, staff, scope, audit and OPS endpoints; gate becomes false');
    for(const role of ['anon','authenticated','service_role']){
      const acl=(await db.query("select has_function_privilege($1,'torque_hq.suspended_team_snapshot()','execute') a,has_function_privilege($1,'torque_hq.suspended_team_command(jsonb)','execute') b,has_table_privilege($1,'torque_hq.team_registry','select') c,has_schema_privilege($1,'torque_hq','usage') d",[role])).rows[0];
      check(Object.values(acl).every(v=>v===false),'suspended endpoints and private records inaccessible to '+role);
    }
    await assert.rejects(()=>request(admin,()=>db.query('select public.hq_team_snapshot()')),e=>e.code==='42883');
    check(true,'missing endpoint returns unavailable condition, not an empty successful registry');
    await db.exec(suspend);assert.deepEqual(await data(),baseline);assert.deepEqual(await endpoints(),state);
    check(true,'repeated suspension is idempotent');
    await failure(install,'installer refuses suspended team reapplication without duplicating data','42P07');
    await db.exec('update torque_hq.settings set staff_enabled=true where id');
    await db.exec(resume);
    assert.deepEqual(await endpoints(),ids);assert.deepEqual(await data(),baseline);
    check(true,'resume restores same OIDs and data while forcing staff gate off');
    for(const role of ['anon','authenticated','service_role']){
      const acl=(await db.query("select has_function_privilege($1,'public.hq_team_snapshot()','execute') a,has_function_privilege($1,'public.hq_team_command(jsonb)','execute') b",[role])).rows[0];
      check(acl.a===(role==='authenticated') && acl.b===(role==='authenticated'),'resume restores only authenticated RPC entrypoints for '+role);
    }
    const snap=(await request(admin,()=>db.query('select public.hq_team_snapshot() value'))).rows[0].value;
    check(snap.team[0].id===result.id && snap.team[0].accessState==='accessPending' && snap.meta.staffGateEnabled===false,'existing admin recovers registry with honest pending access');
    await assert.rejects(()=>request(staff,()=>db.query('select public.hq_team_snapshot()')),e=>e.code==='42501');
    check(true,'real staff with scope stays denied after resume');
    const replay=(await call(command)).rows[0].value;
    check(replay.replayed && replay.id===result.id,'original idempotency receipt survives suspension/resume');
    assert.deepEqual(await data(),baseline);
    await db.exec(resume);assert.deepEqual(await endpoints(),ids);assert.deepEqual(await data(),baseline);
    check(true,'repeated resume preserves OIDs and has no duplicate command/audit');

    for(const signature of driftSignatures){
      await obstruction(signature);
      await db.exec('update torque_hq.settings set staff_enabled=true where id'); // Must remain unchanged on failure.
      await failure(suspend,'suspension rejects reserved RPC drift '+signature);
      await failure(resume,'resume rejects reserved RPC drift '+signature);
      if(signature==='public.hq_team_snapshot(text)'){
        const legacy=(await request(admin,()=>db.query("select public.hq_team_snapshot('fixture'::text) value"))).rows[0].value;
        check(legacy.fixture==='legacy' && (await endpoints()).live_snapshot===ids.live_snapshot,'overload repro now refuses suspension; leaves original RPCs and foreign callable overload untouched');
      }
      await db.exec('drop function '+signature); // Fixture cleanup only, never performed by recovery SQL.
      await db.exec('update torque_hq.settings set staff_enabled=false where id');
    }
    await db.exec(suspend);
    await obstruction('torque_hq.suspended_team_snapshot(text)');
    await failure(suspend,'repeated suspension rejects an extra parked overload');
    await failure(resume,'parked state resume rejects an extra parked overload');
    await db.exec('drop function torque_hq.suspended_team_snapshot(text)');
    await db.exec(resume);
    assert.deepEqual(await endpoints(),ids);assert.deepEqual(await data(),baseline);

    await db.exec('alter function public.hq_team_snapshot() set schema torque_hq; alter function torque_hq.hq_team_snapshot() rename to suspended_team_snapshot; update torque_hq.settings set staff_enabled=true where id');
    await failure(suspend,'mixed live/parked suspension refused');
    await failure(resume,'mixed live/parked resume refused');
    await db.exec('alter function torque_hq.suspended_team_snapshot() rename to hq_team_snapshot; alter function torque_hq.hq_team_snapshot() set schema public; update torque_hq.settings set staff_enabled=false where id');
    await db.exec("create function torque_hq.suspended_team_snapshot() returns jsonb language sql as $$ select '{}'::jsonb $$");
    await failure(suspend,'public/parked duplicate collision refused');
    await failure(resume,'resume refuses duplicate collision');
    await db.exec('drop function torque_hq.suspended_team_snapshot()'); // Synthetic obstruction, not recovery SQL.
    await db.exec("create function torque_hq.hq_team_command(jsonb) returns jsonb language sql as $$ select '{}'::jsonb $$");
    await failure(suspend,'intermediate rename namespace collision refused');
    await db.exec('drop function torque_hq.hq_team_command(jsonb)');
    await db.exec('alter function public.hq_team_command(jsonb) rename to test_absent_team_command');
    await failure(suspend,'missing endpoint refused');
    await failure(resume,'missing endpoint resume refused');
    await db.exec('alter function public.test_absent_team_command(jsonb) rename to hq_team_command');
    await db.exec('delete from torque_hq.settings'); // Synthetic broken dependency only.
    await failure(suspend,'missing settings row refused');
    await failure(resume,'resume does not invent missing settings');
    await db.exec('insert into torque_hq.settings values(true,false)');
    await db.exec('alter function torque_hq.team_require_admin() rename to test_absent_team_require_admin');
    await failure(suspend,'missing authorization helper refused');
    await failure(resume,'resume with missing authorization helper refused');
    await db.exec('alter function torque_hq.test_absent_team_require_admin() rename to team_require_admin');
    await db.exec('alter table torque_hq.team_registry_audit rename to test_absent_team_audit');
    await failure(suspend,'missing audit table refused');
    await failure(resume,'resume with missing audit table refused');
    await db.exec('alter table torque_hq.test_absent_team_audit rename to team_registry_audit');
    await db.exec(read('supabase/rollback/hq-ops-suspend.sql'));
    await db.exec(suspend); // Safety shutdown remains possible after OPS was suspended first.
    await failure(resume,'OPS must be active before team resume');
    await db.exec(read('supabase/rollback/hq-ops-resume.sql'));
    await db.exec(resume);
    assert.deepEqual(await endpoints(),ids);assert.deepEqual(await data(),baseline);
    check(true,'OPS then team resume recovers same registry and identities after combined suspension');
    check(notices.length>=8 && notices.every(n=>n==='reload schema'),'local SQL notification delivery observed; does not certify actual PostgREST cache refresh');
  }finally{await db.close();}
  console.log('PASS '+checks+' checks: isolated team package/suspension in PGlite; no remote or HTTP/concurrency proof.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
