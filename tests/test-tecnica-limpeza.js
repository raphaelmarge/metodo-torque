/* Cleanup lifecycle and worker auth. In-memory API only; no private data/network. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{stripTypeScriptTypes}=require('node:module');
let count=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);count++;},ok=(v,m)=>{assert.ok(v,m);count++;};
const A='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',R='cccccccc-cccc-4ccc-accc-cccccccccccc',F='dddddddd-dddd-4ddd-addd-dddddddddddd',P=A+'/'+R+'/'+F+'.mp4',DUE='2026-10-17T09:00:00.000Z',NOW=Date.parse('2026-10-17T10:00:00.000Z');
(async()=>{
 const {cleanupAdapter,cleanupHandler}=await import('../supabase/functions/_shared/tecnica-cleanup.mjs');
 function fixture({orphan=true,storageFail=false,ackFail=false,malicious=false}={}){
  const calls=[],queue=orphan?[{caminho:malicious?'../other/video.mp4':P,academia_id:A,limpeza_apos:DUE}]:[],reviews=orphan?[]:[{id:R,academia_id:A,limpeza_apos:DUE}];let stored=true,cleaned=false;
  const api=async(path,init={})=>{calls.push({path,...init});const u=new URL(path,'https://db.invalid'),method=init.method||'GET';
   if(path.startsWith('/storage/')){if(storageFail)throw Error('storage unavailable');stored=false;return [];}
   if(u.pathname.endsWith('app_tecnica_orfaos')){if(method==='GET')return structuredClone(queue);if(ackFail)throw Error('ack unavailable');queue.length=0;return null;}
   if(u.pathname.endsWith('app_tecnica_revisoes')){if(method==='GET')return structuredClone(reviews);if(ackFail)throw Error('ack unavailable');cleaned=true;return null;}
   if(u.pathname.endsWith('app_tecnica_arquivos'))return [{caminho:P}];throw Error('unexpected API');
  };return {api,calls,queue,state:()=>({stored,cleaned})};
 }
 let f=fixture(),run=cleanupAdapter(f.api);eq(await run({now:()=>NOW}),{processed:1,failed:0,deferred:0},'Órfão removido e confirmado');eq(f.state().stored,false,'Objeto removido no Storage');eq(f.queue.length,0,'Recibo retirado após confirmação');
 const removedAt=f.calls.findIndex(x=>x.path.startsWith('/storage/')),ackAt=f.calls.findIndex(x=>x.method==='DELETE'&&x.path.includes('/rest/'));ok(removedAt<ackAt,'Storage é chamado antes do DELETE da fila');ok(f.calls[ackAt].path.includes('limpeza_apos=eq.'+encodeURIComponent(DUE)),'Ack usa versão temporal exata do recibo');eq(JSON.parse(f.calls[removedAt].body),{prefixes:[P]},'Storage recebe apenas caminho da fila privada');
 f=fixture({storageFail:true});eq((await cleanupAdapter(f.api)({now:()=>NOW})).failed,1,'Falha de Storage é contada');eq(f.queue.length,1,'Falha de Storage preserva recibo');ok(!f.calls.some(x=>x.method==='DELETE'&&x.path.includes('/rest/')),'Falha de Storage não confirma limpeza');
 f=fixture({ackFail:true});await cleanupAdapter(f.api)({now:()=>NOW});eq(f.queue.length,1,'Falha de confirmação conserva retry');eq(f.state().stored,false,'Retry pode encontrar objeto já ausente');
 f=fixture();let failOnce=true;const retry=cleanupAdapter(async(path,init)=>{if(path.startsWith('/storage/')&&failOnce){failOnce=false;throw Error('rede');}return f.api(path,init);});await retry({now:()=>NOW});eq(f.queue.length,1,'Primeira falha mantém trabalho');eq((await retry({now:()=>NOW})).processed,1,'Nova execução conclui expurgo pendente');eq(f.queue.length,0,'Retry confirmado remove recibo');
 f=fixture({orphan:false});eq((await cleanupAdapter(f.api)({now:()=>NOW})).processed,1,'Tombstone também processado');ok(f.state().cleaned,'Tombstone só recebe limpo_em após Storage');eq(f.state().stored,false,'Mídia de tombstone removida');
 f=fixture({orphan:false,storageFail:true});await cleanupAdapter(f.api)({now:()=>NOW});eq(f.state().cleaned,false,'Falha não marca tombstone como limpo');
 f=fixture({malicious:true});eq((await cleanupAdapter(f.api)({now:()=>NOW})).failed,1,'Caminho fora do contrato é recusado');ok(!f.calls.some(x=>x.path.startsWith('/storage/')),'Caminho inválido nunca chega ao Storage');
 f=fixture();eq((await cleanupAdapter(f.api)({academia:B,now:()=>NOW})).failed,1,'Mesmo adaptador amplo não atravessa academia');ok(f.calls[0].path.includes('academia_id=eq.'+B),'Consulta oportunista escopada no tenant');
 f=fixture();eq((await cleanupAdapter(f.api)({now:()=>NOW,budgetMs:0})).deferred,1,'Prazo devolve trabalho à próxima execução');eq(f.queue.length,1,'Prazo preserva fila');
 let storageCount=0;const many=Array.from({length:60},(_,i)=>({caminho:A+'/'+R+'/dddddddd-dddd-4ddd-addd-'+String(i).padStart(12,'0')+'.mp4',academia_id:A,limpeza_apos:DUE}));const bulk=cleanupAdapter(async(path,init={})=>{if(path.startsWith('/storage/')){storageCount++;return [];}if(path.includes('app_tecnica_orfaos')&&!init.method)return many;return [];});eq((await bulk({now:()=>NOW})).processed,50,'Lote global limitado a cinquenta recibos');eq(storageCount,50,'Não faz upload/delete extra além do limite');
 let authCalls=0,cleanCalls=0,options;const secret='s'.repeat(64),handle=cleanupHandler({authorize:async value=>{authCalls++;return value===secret;},cleanup:async value=>{cleanCalls++;options=value;return {processed:1,failed:0,deferred:0};}});
 function request(method='POST',value=secret,body){return new Request('https://edge.invalid/?secret='+secret,{method,headers:value?{'x-tecnica-secret':value}:{},...(body?{body:JSON.stringify(body)}:{})});}
 eq((await handle(request('GET'))).status,405,'Worker exige POST');eq((await handle(request('POST',''))).status,401,'Segredo na query não autentica');eq((await handle(request('POST','wrong'.repeat(10)))).status,401,'Segredo incorreto é recusado');eq(cleanCalls,0,'Nenhuma limpeza antes da autorização');
 let response=await handle(request('POST',secret,{paths:['other'],academia:B,limit:999}));eq(response.status,200,'Segredo válido permite manutenção');eq(options,{limit:50,budgetMs:40000},'Body não controla tenant, caminhos ou limite');ok(!(await response.text()).includes(secret),'Resposta não expõe segredo');
 const badAuth=cleanupHandler({authorize:async()=>({ok:true}),cleanup:async()=>{throw Error('should not run');}});eq((await badAuth(request())).status,401,'RPC precisa devolver true booleano');
 const failure=cleanupHandler({authorize:async()=>true,cleanup:async()=>({processed:0,failed:1,deferred:0})});eq((await failure(request())).status,503,'Falha parcial é sinalizada ao scheduler');
 // Actual Edge adapter calls only the fixed RPC, with service credentials;
 // authorization never falls back to an anon token or request JSON.
 let edge,network=[];const code=fs.readFileSync(require('node:path').join(__dirname,'../supabase/functions/tecnica-limpeza/index.ts'),'utf8').replace(/^import .*\r?\n/gm,'');
 vm.runInNewContext(stripTypeScriptTypes(code),{Request,Response,AbortSignal,cleanupHandler,cleanupAdapter:()=>async()=>({processed:0,failed:0,deferred:0}),fetch:async(url,init)=>{network.push({url,init});return new Response('true');},Deno:{env:{get:k=>k==='SUPABASE_URL'?'https://db.invalid':k==='SUPABASE_SERVICE_ROLE_KEY'?'server-only':''},serve:f=>edge=f}});
 eq((await edge(request())).status,200,'Worker real usa autorização via RPC');eq(network[0].url,'https://db.invalid/rest/v1/rpc/tecnica_limpeza_autoriza','Endpoint de autorização fixo');eq(JSON.parse(network[0].init.body),{p_segredo:secret},'Segredo enviado apenas à RPC privada');eq(network[0].init.headers.Authorization,'Bearer server-only','RPC usa service role do servidor');ok(network[0].init.signal instanceof AbortSignal,'RPC e Storage recebem timeout de operação/execução');
 console.log('PASS técnica limpeza: '+count+' verificações');
})().catch(e=>{console.error(e);process.exitCode=1;});
