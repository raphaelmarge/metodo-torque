'use strict';
const assert=require('node:assert/strict'),wait=require('./hq-auth-ci/wait-schema-table.cjs');
(async()=>{
  let clock=0,calls=0,checked=false;
  const pending={ok:false,status:404,data:{code:'PGRST205'}};
  await wait({probe:async()=>++calls<3?pending:{ok:true,status:200,data:[{id:'owned-fixture'}]},
    assertReady:rows=>{assert.deepEqual(rows,[{id:'owned-fixture'}]);checked=true;},now:()=>clock,sleep:async ms=>{clock+=ms;}});
  assert.equal(calls,3);assert.equal(clock,400);assert.equal(checked,true);
  calls=0;clock=0;
  await assert.rejects(wait({probe:async()=>{calls++;return pending;},assertReady:()=>assert.fail('Table never became ready'),
    now:()=>clock,sleep:async ms=>{clock+=ms;},timeoutMs:500}),{code:'SCHEMA_RELOAD_TIMEOUT'});
  assert.equal(clock,500);assert.equal(calls,4);
  for(const response of [{ok:false,status:403,data:{code:'42501'}},{ok:false,status:401,data:{code:'PGRST301'}},
    {ok:false,status:404,data:{code:'42P01'}},{ok:false,status:500,data:{code:'XX000'}}]){
    let count=0;
    await assert.rejects(wait({probe:async()=>{count++;return response;},assertReady:()=>assert.fail(),sleep:async()=>assert.fail('Must not retry security or SQL errors')}));
    assert.equal(count,1);
  }
  await assert.rejects(wait({probe:async()=>({ok:true,status:200,data:[]}),assertReady:rows=>assert.equal(rows.length,1),sleep:async()=>assert.fail()}),assert.AssertionError);
  console.log('7 verificações de prontidão do cache aprovadas: atraso limitado, conteúdo obrigatório e falhas de permissão preservadas.');
})().catch(e=>{console.error(e);process.exitCode=1;});
