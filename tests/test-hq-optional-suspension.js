/* Optional modules only; ephemeral PGlite, synthetic Auth, zero network.
 * Tests transactional suspension/restoration, not Auth HTTP/JWT/MFA or deployment.
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {PGlite}=require('./runtime/node_modules/@electric-sql/pglite');
const {fixtureSQL}=require('./test-hq-concurrency-pg');
const ROOT=path.resolve(__dirname,'..');
const sha=text=>crypto.createHash('sha256').update(text).digest('hex');
const LF=text=>text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');
function readPackage(module){
 const folder=path.join(ROOT,'supabase/releases/hq-'+module+'-optional');
 const manifestFile=path.join(folder,'manifest.json');
 assert(fs.existsSync(manifestFile),'Pacote versionado obrigatorio ausente: '+module+'; nao ha fallback para proposta canonica');
 const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8').replace(/^\uFEFF/,''));
 assert.equal(manifest.schemaVersion,1);
 assert.equal(manifest.mode,module==='referrals'?'referrals-optional-separate-approval':'influencer-optional-blocked');
 assert.equal(manifest.baseCommit,'b05222a2852bd1e96d9a91804d3cd5bdd4f59d22');
 assert.equal(manifest.targetProjectRef,'hdcufkaalxfhwmfwoiqp'); // Metadata only; never connects.
 assert.equal(manifest.status,'local-preparation-not-applied');
 for(const field of ['approvalRequired','approvalSeparate','activationBlocked','frontendReleaseRequired'])assert.equal(manifest[field],true,field);
 assert.equal(manifest.campaignEnabled,false);
 if(module==='influencer'){assert.equal(manifest.uiEnabled,false);assert.equal(manifest.externalPrereqsAuth,true);}
 assert.equal(manifest.encoding,'UTF-8');assert.equal(manifest.lineEndings,'LF');assert.equal(manifest.hashAlgorithm,'SHA-256');
 assert.deepEqual(manifest.rollbackOrder,{suspend:module==='referrals'?['influencer-if-installed','referrals']:['influencer','referrals-if-requested'],resume:['referrals','influencer-if-approved']});
 const expected=module==='referrals'?[
  {source:'supabase/migrations/20260930193716_hq_referrals_ledger.sql',file:/^migrations\/20260930193716_hq_referrals_ledger\.sql$/},
  {source:'supabase/hq-referrals-payment-contract-proposal.sql',file:/^migrations\/[0-9]{14}_hq_referrals_payment_contract\.sql$/}
 ]:[{source:'supabase/hq-influencer-portal-proposal.sql',file:/^migrations\/[0-9]{14}_hq_influencer_portal_contract\.sql$/}];
 const entries=module==='referrals'?manifest.migrations:[manifest.migration];
 assert(Array.isArray(entries));assert.equal(entries.length,expected.length);
 const accepted=['manifest.json'];
 function checked(entry,source,filePattern){
  assert(entry&&typeof entry==='object');assert.equal(entry.source,source);assert.match(entry.file,filePattern);
  assert.match(entry.sha256,/^[0-9a-f]{64}$/);
  // The allowlisted relative path cannot escape the package or name a symlink.
  const full=path.resolve(folder,entry.file);assert(full.startsWith(folder+path.sep));assert(fs.lstatSync(full).isFile());
  const bytes=fs.readFileSync(full),sql=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
  assert(!sql.startsWith('\uFEFF')&&!sql.includes('\r'),'SQL empacotado deve ter UTF-8 sem BOM e LF: '+entry.file);
  assert.equal(sql,LF(read(source)),'SQL versionado diverge da fonte canonica LF: '+entry.file);
  assert.equal(sha(bytes),entry.sha256,'SHA-256 dos bytes empacotados: '+entry.file);
  assert.equal(sha(LF(read(source))),entry.sha256,'SHA-256 da fonte canonica LF: '+source);
  accepted.push(entry.file);return sql;
 }
 const migrations=entries.map((entry,i)=>checked(entry,expected[i].source,expected[i].file));
 assert.deepEqual(manifest.migrationAllowlist,entries.map(entry=>entry.file));
 const rollbacks={};
 assert.deepEqual(Object.keys(manifest.rollback).sort(),['resume','suspend']);
 for(const mode of ['suspend','resume']){
  const file='rollback/hq-'+module+'-'+mode+'.sql';
  assert.equal(manifest.rollback[mode].file,file);
  rollbacks[mode]=checked(manifest.rollback[mode],'supabase/'+file,/^rollback\/hq-(referrals|influencer)-(suspend|resume)\.sql$/);
 }
 function walk(dir,prefix=''){
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
   assert(!entry.isSymbolicLink(),'Pacote nao pode conter symlink');
   const relative=prefix+entry.name;
   if(entry.isDirectory()){assert(['migrations','rollback'].includes(relative),'Diretorio fora da allowlist');return walk(path.join(dir,entry.name),relative+'/');}
   assert(entry.isFile());return [relative];
  });
 }
 assert.deepEqual(walk(folder).sort(),accepted.sort(),'Pacote so pode conter manifest, migrations e rollbacks allowlisted');
 return{manifest,migrations,rollback:rollbacks};
}
// Mandatory manifests and exact copied bytes are checked BEFORE any database runs.
const packages={referrals:readPackage('referrals'),influencer:readPackage('influencer')};
const [ledger,paymentContract]=packages.referrals.migrations;
const [portal]=packages.influencer.migrations;
const rollback={referrals:packages.referrals.rollback,influencer:packages.influencer.rollback};
const whitelist={
 referrals:[['hq_referrals_snapshot','snapshot','','authenticated'],['hq_referrals_save_partner','save_partner','jsonb','authenticated'],['hq_referrals_save_coupon','save_coupon','jsonb','authenticated'],['hq_referrals_review','review','jsonb','authenticated'],['hq_referrals_record_payment','record_payment','jsonb','authenticated'],['hq_referrals_load_customer','load_customer','uuid','service_role'],['hq_referrals_commit_customer','commit_customer','jsonb','service_role']],
 influencer:[['hq_influencer_prepare_invite','prepare_invite','jsonb','authenticated'],['hq_influencer_list_invites','list_invites','','authenticated'],['hq_influencer_admin_snapshot','admin_snapshot','','authenticated'],['hq_influencer_revoke_access','revoke_access','jsonb','authenticated'],['influencer_accept_invite','accept_invite','','authenticated'],['influencer_portal_snapshot','snapshot','','authenticated']]
};
const uid=n=>'70000000-0000-4000-8000-'+String(n).padStart(12,'0');
const users={admin:uid(1),partner:uid(2),outsider:uid(3)};
const sessions={admin:uid(1001),partner:uid(1002),outsider:uid(1003)};
let checks=0;
async function test(label,fn){await fn();console.log('OK '+(++checks)+' '+label);}
const denied=(fn,code='42501')=>assert.rejects(fn,e=>e.code===code);

async function environment(withPortal){
 const db=new PGlite();let notifications=0;
 await db.exec(fixtureSQL);
 await db.listen('pgrst',payload=>{if(payload==='reload schema')notifications++;});
 for(const name of Object.keys(users)){
  await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,'2020-01-01')",[users[name],name+'@example.test']);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sessions[name],users[name]]);
 }
 await db.query('insert into public.saas_admins values($1)',[users.admin]);
 await db.exec(ledger);await db.exec(paymentContract);
 if(withPortal)await db.exec(portal);
 async function who(name='admin',role='authenticated'){
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(name?{sub:users[name],session_id:sessions[name]}:{})]);
  if(role!=='owner')await db.exec('set role '+role);
 }
 const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const rpc=async(name,payload)=>scalar('select public.'+name+'('+(payload===undefined?'':'$1')+') value',payload===undefined?[]:[payload]);
 async function apply(module,mode){await who(null,'owner');await db.exec(rollback[module][mode]);}
 async function data(){
  await who(null,'owner');const result={};
  const tables=(await db.query("select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('hq_referrals_private','hq_influencer_private','auth') and c.relkind='r' order by n.nspname,c.relname")).rows;
  for(const t of tables)result[t.nspname+'.'+t.relname]=await scalar('select md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),\'[]\')::text) hash from '+t.nspname+'.'+t.relname+' t');
  return result;
 }
 async function funcs(){await who(null,'owner');return(await db.query("select p.oid,p.proname,n.nspname,p.proowner,p.prosrc,p.proconfig,p.prosecdef,p.proacl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','hq_referrals_private','hq_influencer_private') order by p.oid")).rows;}
 async function state(module,parked){
  await who(null,'owner');
  for(const [pub,impl,args,grantee]of whitelist[module]){
   const live='public.'+pub+'('+args+')',hidden='hq_'+module+'_private.suspended_'+module+'_'+impl+'('+args+')';
   assert.equal(await scalar('select to_regprocedure($1)::oid is not null',[live]),!parked,live);
   assert.equal(await scalar('select to_regprocedure($1)::oid is not null',[hidden]),parked,hidden);
   if(!parked)for(const role of ['anon','authenticated','service_role']){
    assert.equal(await scalar('select has_function_privilege($1,$2,\'execute\')',[role,live]),role===grantee,live+' '+role);
    assert.equal(await scalar('select has_function_privilege($1,$2,\'execute\')',[role,'hq_'+module+'_private.'+impl+'('+args+')']),role===grantee,'private '+impl+' '+role);
   }
  }
  for(const role of ['anon','authenticated','service_role'])assert.equal(await scalar('select has_schema_privilege($1,$2,\'usage\')',[role,'hq_'+module+'_private']),!parked&&(role==='authenticated'||(module==='referrals'&&role==='service_role')));
 }
 async function failUnchanged(module,mode){
  const beforeData=await data(),beforeFuncs=await funcs(),beforeNotify=notifications;
  await denied(()=>apply(module,mode),'55000');await db.exec('rollback');
  assert.deepEqual(await data(),beforeData);assert.deepEqual(await funcs(),beforeFuncs);assert.equal(notifications,beforeNotify);
 }
 await who();const partner=await rpc('hq_referrals_save_partner',{name:'Parceiro sintetico',contact:'Contato reservado sintetico',status:'active'});
 const coupon=await rpc('hq_referrals_save_coupon',{partnerId:partner.id,code:'SYNTHETIC_OPTIONAL',status:'ready'});
 await who(null,'owner');
 await db.query("insert into hq_referrals_private.customers(id,revision,context,core_state,partner_id,coupon_id,status) values($1,1,$2,'{}',$3,$4,'paid')",[uid(200),{customerLabel:'SENTINEL PRIVATE CUSTOMER',email:'synthetic-customer@example.test'},partner.id,coupon.id]);
 await db.query("insert into hq_referrals_private.commissions(customer_id,partner_id,coupon_id,core_id,core_entry,status,amount_cents,claimable_cents,paid_cents,eligible_at) values($1,$2,$3,'synthetic-history','{}','paid',1996,1996,1996,now())",[uid(200),partner.id,coupon.id]);
 if(withPortal){
  await who();await rpc('hq_influencer_prepare_invite',{partnerId:partner.id,email:'partner@example.test',expiresAt:new Date(Date.now()+86400000).toISOString(),reason:'Vinculo sintetico local'});
  await who('partner');await rpc('influencer_accept_invite');
 }
 return {db,who,scalar,rpc,apply,data,funcs,state,failUnchanged,partner,coupon,notifications:()=>notifications};
}

(async()=>{
 await test('manifests obrigatorios, allowlists exatas, fontes LF e SHA-256 conferidos; execucao usa somente copias versionadas',async()=>{
  assert.equal(packages.referrals.migrations.length,2);assert.equal(packages.influencer.migrations.length,1);
  console.log('   pacote referrals: '+packages.referrals.manifest.migrationAllowlist.join(', '));
  console.log('   pacote influencer: '+packages.influencer.manifest.migrationAllowlist.join(', '));
 });
 const e=await environment(true);const{db,who,scalar,rpc,apply,data,funcs,state,failUnchanged,partner}=e;
 async function denyPaymentHelper(){
  for(const role of ['anon','authenticated','service_role']){
   await who('admin',role);
   await denied(()=>db.query('select hq_referrals_private.first_payment_json(null::hq_referrals_private.customers)'));
  }
 }
 try{
  await test('fixture usa ledger/portal reais, helper historico e nenhum schema OPS',async()=>{
   await who();assert.equal((await rpc('hq_referrals_snapshot')).campaign.enabled,false);
   await who('partner');const s=await rpc('influencer_portal_snapshot');assert.equal(s.partner.displayName,'Parceiro sintetico');assert.ok(!JSON.stringify(s).includes('SENTINEL PRIVATE CUSTOMER'));
   assert.equal(s.version,2);assert.equal(s.firstPayments.source,'verified_ledger_events');assert.equal(s.firstPayments.status,'unavailable');
   await who(null,'owner');assert.equal(await scalar("select to_regnamespace('torque_hq')::oid"),null);
  });
  await test('helper incremental de primeiro pagamento e privado para anon auth e service',denyPaymentHelper);
  const originalData=await data(),originalFunctions=await funcs();
  await test('ledger nao suspende enquanto portal ainda publica projecao',()=>failUnchanged('referrals','suspend'));
  await test('portal suspende integralmente e repetir nao altera registros',async()=>{
   const n=e.notifications();await apply('influencer','suspend');await state('influencer',true);await apply('influencer','suspend');
   assert.equal(e.notifications(),n+2);assert.deepEqual(await data(),originalData);
   const before=originalFunctions.filter(f=>f.nspname==='hq_referrals_private');assert.deepEqual((await funcs()).filter(f=>f.nspname==='hq_referrals_private'),before);
  });
  await test('portal suspenso nao permite wrappers, aliases, helpers nem escrita direta',async()=>{
   for(const role of ['anon','authenticated','service_role']){
    await who('admin',role);
    await denied(()=>rpc('hq_influencer_prepare_invite',{}),'42883');
    await denied(()=>db.query('select hq_influencer_private.suspended_influencer_snapshot()'));
    await denied(()=>db.query('select hq_influencer_private.snapshot()'));
    await denied(()=>db.query('select * from hq_influencer_private.memberships'));
    await denied(()=>db.query("update hq_influencer_private.memberships set status='revoked'"));
   }
   assert.deepEqual(await data(),originalData);
  });
  await test('ledger suspende depois do portal; replay preserva historico e emite reload',async()=>{
   const n=e.notifications();await apply('referrals','suspend');await state('referrals',true);await apply('referrals','suspend');
   assert.equal(e.notifications(),n+2);assert.deepEqual(await data(),originalData);
  });
  await test('ledger suspenso retira RPC e bloqueia invoker privado/helper/tabelas em todos papeis',async()=>{
   for(const role of ['anon','authenticated','service_role']){
    await who('admin',role);await denied(()=>rpc('hq_referrals_snapshot'),'42883');
    await denied(()=>db.query('select hq_referrals_private.snapshot()'));
    await denied(()=>db.query('select hq_referrals_private.suspended_referrals_snapshot()'));
    await denied(()=>db.query('select hq_referrals_private.load_customer($1)',[uid(200)]));
    await denied(()=>db.query('select * from hq_referrals_private.customers'));
    await denied(()=>db.query("insert into hq_referrals_private.partners(name,status) values('Ataque','active')"));
   }
   assert.deepEqual(await data(),originalData);
  });
  await test('portal nao retoma antes do ledger; falha atomica sem NOTIFY',()=>failUnchanged('influencer','resume'));
  await test('ledger exige campanha OFF e nao conserta configuracao ambigua',async()=>{
   await who(null,'owner');await db.exec('alter table hq_referrals_private.campaign drop constraint campaign_enabled_check');
   await db.exec('update hq_referrals_private.campaign set enabled=true');
   await failUnchanged('referrals','resume');
   await db.exec('update hq_referrals_private.campaign set enabled=false');
   await db.exec('alter table hq_referrals_private.campaign add constraint campaign_enabled_check check(not enabled)');
  });
  await test('ledger retoma somente grants exatos; segunda retomada e segura',async()=>{
   const n=e.notifications();await apply('referrals','resume');await state('referrals',false);await apply('referrals','resume');
   assert.equal(e.notifications(),n+2);assert.deepEqual(await data(),originalData);
   await who();assert.equal((await rpc('hq_referrals_snapshot')).campaign.enabled,false);
   await denied(()=>rpc('hq_referrals_load_customer',uid(200)));
   await who(null,'service_role');assert.equal((await rpc('hq_referrals_load_customer',uid(200))).revision,1);
   await denied(()=>rpc('hq_referrals_snapshot'));
   await who('outsider');await denied(()=>rpc('hq_referrals_snapshot'),'HQ403');
  });
  await test('portal retoma depois ledger sem novos usuarios convites ou memberships',async()=>{
   const n=e.notifications();await apply('influencer','resume');await state('influencer',false);await apply('influencer','resume');
   assert.equal(e.notifications(),n+2);assert.deepEqual(await data(),originalData);
   await who('partner');const s=await rpc('influencer_portal_snapshot');assert.equal(s.partner.displayName,'Parceiro sintetico');assert.equal(s.campaign.enabled,false);
   assert.equal(s.version,2);assert.equal(s.firstPayments.source,'verified_ledger_events');assert.equal(s.firstPayments.status,'unavailable');
   assert.ok(!JSON.stringify(s).includes('SENTINEL PRIVATE CUSTOMER'));await rpc('influencer_accept_invite');
   await denyPaymentHelper();
   assert.deepEqual(await data(),originalData);
  });
  await test('ciclo conserva OIDs corpo owner search_path SECURITY DEFINER e auxiliares privados',async()=>{
   assert.deepEqual(await funcs(),originalFunctions);
  });
  for(const module of ['referrals','influencer']){
   await test(module+' recusa estado misto sem modificar dados ACLs ou funcao',async()=>{
    // For ledger, dependent portal must first be safely parked.
    if(module==='referrals')await apply('influencer','suspend');
    await who(null,'owner');const [pub,impl,args]=whitelist[module][0],schema='hq_'+module+'_private',hidden='suspended_'+module+'_'+impl;
    await db.exec('alter function public.'+pub+'('+args+') set schema '+schema+'; alter function '+schema+'.'+pub+'('+args+') rename to '+hidden);
    await failUnchanged(module,'suspend');await failUnchanged(module,'resume');
    await db.exec('alter function '+schema+'.'+hidden+'('+args+') rename to '+pub+'; alter function '+schema+'.'+pub+'('+args+') set schema public');
    if(module==='referrals')await apply('influencer','resume');
   });
   await test(module+' recusa endpoint ausente, colisao live/parked e alias legado publico extra',async()=>{
    if(module==='referrals')await apply('influencer','suspend');
    await who(null,'owner');const [pub,impl]=whitelist[module][0],schema='hq_'+module+'_private',hidden='suspended_'+module+'_'+impl;
    // First endpoint of each module has different arity; use its exact signature.
    const args=whitelist[module][0][2],params=args?'p_input jsonb':'';
    await db.exec('alter function public.'+pub+'('+args+') rename to missing_optional_fixture');
    await failUnchanged(module,'suspend');await failUnchanged(module,'resume');
    await db.exec('alter function public.missing_optional_fixture('+args+') rename to '+pub);
    await db.exec("create function "+schema+'.'+hidden+'('+params+") returns jsonb language sql as $$ select '{}'::jsonb $$");
    await failUnchanged(module,'suspend');await failUnchanged(module,'resume');
    await db.exec('drop function '+schema+'.'+hidden+'('+args+')');
    const alias=module==='referrals'?'hq_referrals_legacy_extra':'hq_influencer_legacy_extra';
    await db.exec("create function public."+alias+"() returns jsonb language sql as $$ select '{}'::jsonb $$");
    await failUnchanged(module,'suspend');await failUnchanged(module,'resume');
    await db.exec('drop function public.'+alias+'()');
    if(module==='referrals')await apply('influencer','resume');
   });
  }
  await test('apos restauracao administracao segue funcional sem envio ou campanha ativa',async()=>{
   await who();const next=await rpc('hq_referrals_save_partner',{name:'Segundo parceiro sintetico',status:'active'});
   const invite=await rpc('hq_influencer_prepare_invite',{partnerId:next.id,email:'new-synthetic@example.test',expiresAt:new Date(Date.now()+86400000).toISOString(),reason:'Teste apos retomada'});
   assert.equal(invite.authUserCreated,false);assert.equal(invite.delivery,'unavailable');
   await rpc('hq_influencer_revoke_access',{inviteId:invite.id,reason:'Encerramento sintetico'});
   assert.equal((await rpc('hq_referrals_snapshot')).campaign.enabled,false);
   await who(null,'owner');assert.equal(await scalar('select count(*)::int from auth.users'),3);
  });
 }finally{await db.close();}
 const single=await environment(false);
 try{
  await test('ledger sem portal instalado suspende e retoma independentemente do OPS',async()=>{
   const before=await single.data();await single.apply('referrals','suspend');await single.state('referrals',true);
   await single.apply('referrals','resume');await single.state('referrals',false);assert.deepEqual(await single.data(),before);
  });
  await test('scripts nao instalam portal ausente nem criam objetos faltantes',async()=>{
   await single.failUnchanged('influencer','suspend');await single.failUnchanged('influencer','resume');
  });
 }finally{await single.db.close();}
 console.log('PASS '+checks+' grupos de suspensao opcional; nenhuma rede, migracao remota ou Auth HTTP.');
})().catch(error=>{console.error(error);process.exitCode=1;});
