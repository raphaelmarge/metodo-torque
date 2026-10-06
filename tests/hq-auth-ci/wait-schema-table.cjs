'use strict';
// A function already in PostgREST's cache can execute new SQL immediately while
// newly created tables are still absent. Readiness must probe the table itself.
module.exports=async function waitSchemaTable({probe,assertReady,timeoutMs=15000,
  now=Date.now,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
  const deadline=now()+timeoutMs;
  for(;;){
    const result=await probe();
    if(result.ok){assertReady(result.data);return;}
    // Retry only the documented missing-table cache response. Never hide an
    // authorization failure, a SQL error, a missing row or unexpected content.
    if(result.status!==404||result.data?.code!=='PGRST205'){
      const code=typeof result.data?.code==='string'&&/^[A-Za-z0-9_]{1,48}$/.test(result.data.code)?result.data.code:'UNCLASSIFIED';
      throw Object.assign(new Error('Table readiness request failed'),{code:'HTTP_'+result.status+'_'+code});
    }
    if(now()>=deadline)throw Object.assign(new Error('Table schema reload timeout'),{code:'SCHEMA_RELOAD_TIMEOUT'});
    await sleep(Math.min(200,deadline-now()));
  }
};
