'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {start,classify,AUTH,REST}=require('./local-server.cjs');
(async()=>{
  for(const route of ['//evil.invalid/x','https://evil.invalid','/../.git/config','/%2e%2e/.git/config','/assets/../../.env','/assets/%5csecret.js','/tests/hq-auth-ci/run.sh','/supabase-setup.sql','/auth/v1/admin/users','/rest/v1/rpc/envia_email'])assert.equal(classify('GET',route).kind,'deny',route);
  for(const route of ['/auth/v1/admin/users','/auth/v1/signup','/rest/v1/rpc/excluir_minha_conta','/rest/v1/dados'])assert.equal(classify('POST',route).kind,'deny',route);
  assert.equal(classify('POST','/auth/v1/token?grant_type=password').target,AUTH);
  assert.equal(classify('POST','/rest/v1/rpc/app_aluno_publica_cas').target,REST);
  assert.equal(classify('POST','/functions/v1/push-envia').kind,'unavailable');
  const server=await start({root:path.resolve(__dirname,'../..'),anonKey:'test.anon.fixture',port:0});
  try{
    let r=await fetch(server.origin+'/assets/cloud-config.js');const config=await r.text();
    assert.equal(r.status,200);assert(config.includes(server.origin));assert(!config.includes('supabase.co'));assert(config.includes('bucket:""'));
    r=await fetch(server.origin+'/personal.html');assert.equal(r.status,200);assert((await r.text()).includes('id="tdPublica"'));
    r=await fetch(server.origin+'/app/?t=synthetic-not-an-access-token');assert.equal(r.status,200);
    r=await fetch(server.origin+'/functions/v1/push-envia',{method:'POST',body:'{}'});assert.equal(r.status,503);
    r=await fetch(server.origin+'/personal.html',{headers:{Origin:'https://external.invalid'}});assert.equal(r.status,403);
    r=await fetch(server.origin+'/.git/config');assert.equal(r.status,403);
    assert(server.events.every(e=>!('body'in e)&&!('headers'in e)&&!('url'in e)));
    console.log('PASS local-only transport, forbidden routes, unavailable external services, no fabricated RPC success');
  }finally{await server.close();}
})().catch(()=>{console.error('FAIL personal journey transport');process.exitCode=1;});
