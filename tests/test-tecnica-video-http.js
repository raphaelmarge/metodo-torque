/* Three real migrations, local Postgres; only Vault/cron/http are mocks. No network. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('./runtime/node_modules/@electric-sql/pglite'),{pgcrypto}=require('./runtime/node_modules/@electric-sql/pglite/dist/contrib/pgcrypto.cjs');
let n=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);n++;},ok=(a,m)=>{assert.ok(a,m);n++;};
const dir=path.join(__dirname,'../supabase/migrations'),migration=fs.readFileSync(path.join(dir,'20261017183412_tecnica_video_dispatch_http_privado.sql'),'utf8');
async function setup(existing=false){
 const pg=new PGlite({extensions:{pgcrypto}});
 await pg.exec(`
 create role anon;create role authenticated;create role service_role bypassrls;create role supabase_admin;
 create table public.academias(id uuid primary key);create table public.app_aluno(token text primary key,academia_id uuid references academias(id),revogado_em timestamptz);
 create function public.app_aluno_ativo(t text) returns uuid language sql as $$select academia_id from public.app_aluno where token=t and revogado_em is null$$;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create schema extensions;create extension pgcrypto with schema extensions;
 create schema torque_http authorization postgres;grant usage,create on schema torque_http to public;
 create schema vault;create table vault.secrets(secret text,name text unique,description text);
 create view vault.decrypted_secrets as select secret as decrypted_secret,name from vault.secrets;
 create function vault.create_secret(secret text,name text,description text) returns uuid language plpgsql as $$begin insert into vault.secrets values(secret,name,description);return gen_random_uuid();end$$;
 create schema net;create table net.http_request_queue(id bigint generated always as identity,url text,headers jsonb);
 grant usage on schema net to anon,authenticated;grant select on net.http_request_queue to public;
 create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $$begin raise exception 'pg_net must never be called';end$$;
 create schema cron;create table cron.job(name text,schedule text,command text);
 create function cron.schedule(name text,schedule text,command text) returns bigint language plpgsql as $$begin insert into cron.job values(name,schedule,command);return 1;end$$;
 create schema fixture;
 create table fixture.curl_options(curlopt text primary key,value text);
 insert into fixture.curl_options values('CURLOPT_CONNECTTIMEOUT_MS','2500'),('CURLOPT_USERAGENT','Existing app');
 create table fixture.http_state(status integer,content text,fail boolean,calls integer default 0,authorized boolean,method text,uri text,body text,header_names text[],timeout_ms text,connect_ms text,client_log text);
 insert into fixture.http_state(status,content,fail) values(200,'{"ok":true,"processed":2,"failed":0,"deferred":1}',false);
 create type torque_http.http_header as (field varchar,value varchar);
 create type torque_http.http_request as (method varchar,uri varchar,headers torque_http.http_header[],content_type varchar,content varchar);
 create type torque_http.http_response as (status integer,content_type varchar,headers torque_http.http_header[],content varchar);
 create function torque_http.http(r torque_http.http_request) returns torque_http.http_response language plpgsql as $$
 declare s fixture.http_state%rowtype;expected text;result torque_http.http_response;
 begin
  select decrypted_secret into expected from vault.decrypted_secrets where name='tecnica_video_cleanup';
  select * into s from fixture.http_state;
  if s.fail then raise exception 'Request containing % failed',expected;end if;
  update fixture.http_state set calls=calls+1,authorized=(select count(*)=1 and bool_and(h.field='Authorization' and h.value='Bearer '||expected) from unnest(r.headers) h),
   method=r.method,uri=r.uri,body=r.content,header_names=(select array_agg(h.field::text) from unnest(r.headers) h),
   timeout_ms=current_setting('http.timeout_msec',true),connect_ms=(select value from fixture.curl_options where curlopt='CURLOPT_CONNECTTIMEOUT_MS'),client_log=current_setting('client_min_messages');
  result:=(s.status,'application/json',array[('Set-Cookie',expected)::torque_http.http_header],s.content)::torque_http.http_response;
  return result;
 end$$;
 create function torque_http.http_set_curlopt(opt varchar,val varchar) returns boolean language plpgsql as $$begin insert into fixture.curl_options values(opt,val) on conflict(curlopt) do update set value=excluded.value;return true;end$$;
 create function torque_http.http_list_curlopt() returns table(curlopt text,value text) language sql as $$select * from fixture.curl_options$$;
 create function torque_http.http_reset_curlopt() returns boolean language plpgsql as $$begin delete from fixture.curl_options;return true;end$$;
 -- Match platform-owned functions with PUBLIC EXECUTE, which schema ACL must block.
 alter function torque_http.http(torque_http.http_request) owner to supabase_admin;
 alter function torque_http.http_set_curlopt(varchar,varchar) owner to supabase_admin;
 alter function torque_http.http_list_curlopt() owner to supabase_admin;
 alter function torque_http.http_reset_curlopt() owner to supabase_admin;
 create function fixture.install_http(location text default 'torque_http') returns void language plpgsql as $$declare extid oid:=999999;begin
  insert into pg_catalog.pg_extension(oid,extname,extowner,extnamespace,extrelocatable,extversion)
   select extid,'http','supabase_admin'::regrole,location::regnamespace,false,'mock';
  insert into pg_catalog.pg_depend(classid,objid,objsubid,refclassid,refobjid,refobjsubid,deptype)
   select 'pg_catalog.pg_proc'::regclass,p.oid,0,'pg_catalog.pg_extension'::regclass,extid,0,'e'
   from pg_catalog.pg_proc p where p.pronamespace='torque_http'::regnamespace and p.proname in ('http','http_set_curlopt','http_list_curlopt','http_reset_curlopt');
 end$$;
 `);
 await pg.exec(fs.readFileSync(path.join(dir,'20261017180206_tecnica_video_privada.sql'),'utf8'));
 await pg.exec(fs.readFileSync(path.join(dir,'20261017182409_tecnica_video_agendamento_privado.sql'),'utf8'));
 // Match the observed production ACL, where the preceding REVOKE had no effect.
 await pg.exec('grant select on net.http_request_queue to public');
 if(existing===true)await pg.exec("select fixture.install_http('extensions')");
 if(existing==='inherited')await pg.exec('create role http_creator;grant http_creator to anon;grant create on schema torque_http to http_creator');
 if(!existing)await pg.exec(migration.replace("execute 'create extension http with schema torque_http';",'perform fixture.install_http();'));
 return pg;
}
(async()=>{let pg;try{
 pg=await setup();
 const scalar=async(sql,args=[])=>(await pg.query(sql,args)).rows[0];
 const run=async()=>{const {id}=await scalar('select public.tecnica_limpeza_dispara() as id');return id===null?null:scalar('select * from torque_private.tecnica_limpeza_execucoes where id=$1',[id]);};
 eq(await run(),null,'Disabled config never dispatches');eq((await scalar('select count(*)::integer n from torque_private.tecnica_limpeza_execucoes')).n,0,'Disabled config creates no request log');
 for(const role of ['anon','authenticated','service_role']){
  eq((await scalar("select has_function_privilege($1,'public.tecnica_limpeza_dispara()','EXECUTE') as allowed",[role])).allowed,false,role+' cannot dispatch');
  eq((await scalar("select has_function_privilege($1,'torque_http.http(torque_http.http_request)','EXECUTE') as allowed",[role])).allowed,true,role+' inherits platform PUBLIC EXECUTE');
  eq((await scalar("select has_schema_privilege($1,'torque_http','USAGE') as allowed",[role])).allowed,false,role+' cannot use private HTTP schema');
  eq((await scalar("select has_schema_privilege($1,'torque_http','CREATE') as allowed",[role])).allowed,false,role+' cannot create in private HTTP schema');
  await pg.exec('set role '+role);
  for(const sql of ['select torque_http.http(null::torque_http.http_request)','select torque_http.http_reset_curlopt()',"create function torque_http.injected() returns boolean language sql as 'select true'"]){await assert.rejects(pg.query(sql),e=>e.code==='42501'&&e.message.includes('schema torque_http'),role+' denied by real schema ACL');n++;}
  await pg.exec('reset role');
 }
 eq((await scalar("select pg_get_userbyid(nspowner) as owner from pg_namespace where nspname='torque_http'")).owner,'postgres','Private schema belongs to postgres');
 eq((await scalar("select pg_get_userbyid(proowner) as owner from pg_proc where oid='torque_http.http(torque_http.http_request)'::regprocedure")).owner,'supabase_admin','Fixture retains platform function owner');
 for(const role of ['anon','authenticated']){
  eq((await scalar("select has_table_privilege($1,'net.http_request_queue','SELECT') as allowed",[role])).allowed,true,'Shared net ACL unchanged '+role);
  eq((await scalar("select has_table_privilege($1,'torque_private.tecnica_limpeza_execucoes','SELECT') as allowed",[role])).allowed,false,'Private result log '+role);
 }
 eq((await scalar("select relrowsecurity as rls from pg_class where oid='torque_private.tecnica_limpeza_execucoes'::regclass")).rls,true,'Result log has RLS');
 eq((await scalar("select has_table_privilege('service_role','torque_private.tecnica_limpeza_execucoes','SELECT') as allowed")).allowed,true,'Service may observe sanitized results');
 await pg.exec("update public.tecnica_limpeza_config set endpoint='https://fixture.supabase.co/functions/v1/tecnica-limpeza',ativo=true");
 let log=await run(),http=await scalar('select * from fixture.http_state');
 eq(log.resultado,'ok','Valid response completes execution');eq([log.http_status,log.processed,log.failed,log.deferred],[200,2,0,1],'Only bounded counts recorded');ok(log.iniciado_em&&log.terminado_em,'Execution timestamps recorded');
 eq(http.authorized,true,'Only private Vault Bearer sent');eq(http.method,'POST','Worker keeps POST contract');eq(http.header_names,['Authorization'],'No custom secret header');eq(http.body,'{}','Request cannot choose cleanup paths');eq(http.uri,'https://fixture.supabase.co/functions/v1/tecnica-limpeza','Configured HTTPS endpoint unchanged');eq([http.timeout_ms,http.connect_ms],['55000','5000'],'Hard HTTP and connection timeouts');
 eq(http.client_log,'warning','Debug headers never emitted to caller');eq((await scalar("select value from fixture.curl_options where curlopt='CURLOPT_CONNECTTIMEOUT_MS'")).value,'2500','Connection setting restored');
 eq((await scalar("select value from fixture.curl_options where curlopt='CURLOPT_USERAGENT'")).value,'Existing app','Unrelated curl options preserved');
 await pg.exec("delete from fixture.curl_options where curlopt='CURLOPT_CONNECTTIMEOUT_MS';insert into fixture.curl_options values('CURLOPT_CONNECTTIMEOUT','30')");await run();eq((await pg.query('select * from fixture.curl_options order by curlopt')).rows,[{curlopt:'CURLOPT_CONNECTTIMEOUT',value:'30'},{curlopt:'CURLOPT_USERAGENT',value:'Existing app'}],'Seconds-only timeout restored with no new millisecond override');
 await pg.exec('delete from fixture.curl_options');await run();eq((await pg.query('select * from fixture.curl_options')).rows,[],'Initially unset curl options remain unset');await pg.exec("insert into fixture.curl_options values('CURLOPT_CONNECTTIMEOUT_MS','2500')");
 const secret=(await scalar("select decrypted_secret from vault.decrypted_secrets where name='tecnica_video_cleanup'")).decrypted_secret;
 eq(JSON.stringify(log).includes(secret),false,'Response headers are never stored');
 await pg.query('update fixture.http_state set content=$1',[JSON.stringify({ok:true,processed:0,failed:0,deferred:0,error:secret,headers:{Authorization:secret}})]);
 log=await run();eq(log.resultado,'ok','Extra untrusted response fields ignored');eq(JSON.stringify(log).includes(secret),false,'Extra body fields are never stored');
 await pg.exec(`update fixture.http_state set status=503,content='{"ok":false,"processed":2,"failed":1,"deferred":3}'`);log=await run();eq([log.resultado,log.http_status,log.processed,log.failed,log.deferred],['http_error',503,2,1,3],'Partial failure retains counts without declaring success');
 await pg.exec("update fixture.http_state set status=401,content='unauthorized'");log=await run();eq([log.resultado,log.http_status,log.processed],['http_error',401,null],'HTTP failure does not invent counts');
 for(const content of ['<html>error</html>','{"ok":true,"processed":51,"failed":0,"deferred":0}','{"ok":true,"processed":"2","failed":0,"deferred":0}','{"ok":true,"processed":0,"failed":0,"deferred":0.5}']){
  await pg.query('update fixture.http_state set status=200,content=$1',[content]);log=await run();eq([log.resultado,log.processed,log.failed,log.deferred],['invalid_response',null,null,null],'Malformed or out-of-contract result rejected');
 }
 await pg.exec('update fixture.http_state set fail=true');log=await run();eq([log.resultado,log.http_status,log.processed],['transport_error',null,null],'Network exception becomes redacted result');eq(JSON.stringify(log).includes(secret),false,'Transport error text never persisted');eq((await scalar("select value from fixture.curl_options where curlopt='CURLOPT_CONNECTTIMEOUT_MS'")).value,'2500','Connection setting restored on error');await pg.exec('update fixture.http_state set fail=false');
 const beforeDebug=(await scalar('select calls from fixture.http_state')).calls;await pg.exec("set log_min_messages='debug2'");log=await run();eq(log.resultado,'configuration_error','Server DEBUG2 fails closed');eq((await scalar('select calls from fixture.http_state')).calls,beforeDebug,'No HTTP request with verbose server logging');await pg.exec('reset log_min_messages');
 await pg.exec("update vault.secrets set secret='invalid' where name='tecnica_video_cleanup'");const calls=(await scalar('select calls from fixture.http_state')).calls;log=await run();eq(log.resultado,'configuration_error','Invalid Vault credential fails closed');eq((await scalar('select calls from fixture.http_state')).calls,calls,'Invalid credential never sent');await pg.query("update vault.secrets set secret=$1 where name='tecnica_video_cleanup'",[secret]);
 await pg.exec('drop type torque_http.http_request cascade');log=await run();eq(log.resultado,'configuration_error','Missing HTTP capability fails closed');
 eq((await scalar('select count(*)::integer n from net.http_request_queue')).n,0,'No request or secret ever reaches pg_net');
 const job=await scalar('select * from cron.job');eq(job.schedule,'*/10 * * * *','Existing ten-minute schedule preserved');eq(job.command,'select public.tecnica_limpeza_dispara();','Existing job invokes replacement helper');eq(job.command.includes(secret),false,'Cron SQL never contains secret');
 const columns=(await pg.query("select column_name from information_schema.columns where table_schema='torque_private' and table_name='tecnica_limpeza_execucoes' order by ordinal_position")).rows.map(x=>x.column_name);eq(columns,['id','iniciado_em','terminado_em','resultado','http_status','processed','failed','deferred'],'Log schema has no URI, headers, body or error text');
 await pg.close();pg=await setup(true);
 await assert.rejects(pg.exec(migration),e=>e.message.includes('HTTP já instalado em outro schema'),'Pre-existing extension in another schema fails closed');n++;await pg.exec('rollback');
 eq((await pg.query("select n.nspname as location from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='http'")).rows[0].location,'extensions','Existing extension is never moved');eq((await pg.query("select has_function_privilege('anon','torque_http.http(torque_http.http_request)','EXECUTE') as allowed")).rows[0].allowed,true,'Pre-existing function grants remain unchanged');
 eq((await pg.query('select ativo from public.tecnica_limpeza_config')).rows[0].ativo,false,'Failed migration leaves scheduler disabled');
 await pg.close();pg=await setup('inherited');await assert.rejects(pg.exec(migration.replace("execute 'create extension http with schema torque_http';",'perform fixture.install_http();')),e=>e.message.includes('Não foi possível restringir o schema privado HTTP'),'Inherited CREATE also fails closed');n++;await pg.exec('rollback');eq((await pg.query("select count(*)::integer n from pg_extension where extname='http'")).rows[0].n,0,'Inherited CREATE blocks extension installation');
 ok(!/\bnet[.]http_post\s*\(/i.test(migration),'Replacement does not invoke pg_net');ok(!/\b(?:grant|revoke)\b[^;]*\bnet[.]/i.test(migration),'Replacement never changes shared net privileges');
 console.log('PASS técnica HTTP privado: '+n+' verificações SQL locais; sem rede ou credenciais reais.');
}finally{if(pg)await pg.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
