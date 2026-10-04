/* Status HTTP, negação de acesso e indisponibilidade testados sem rede externa. */
'use strict';
const assert=require('node:assert/strict');
const H=require('../app/treino-historico-core');
const Sync=require('../app/treino-historico-sync');
function storage(){const map=new Map();return{get length(){return map.size;},key:i=>[...map.keys()][i],getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>map.set(k,v)};}
(async()=>{
let count=0;
const tests=[
 ['resposta 403','REMOTE_DENIED',()=>({ok:false,status:403,json:async()=>({message:'denied'})})],
 ['token negado pela RPC','REMOTE_DENIED',()=>({ok:true,status:200,json:async()=>({ok:false,erro:'sem_acesso'})})],
 ['falha de conexão','NETWORK_ERROR',()=>{throw new TypeError('Failed to fetch');}],
 ['RPC ausente','RPC_UNAVAILABLE',()=>({ok:false,status:404,json:async()=>({code:'PGRST202'})})],
 ['falha HTTP de servidor','REMOTE_HTTP_ERROR',()=>({ok:false,status:500,json:async()=>({message:'server'})})],
 ['resposta inválida','INVALID_SYNC_RESPONSE',()=>({ok:true,status:200,json:async()=>{throw Error('JSON');}})]
];
for(const [label,code,response] of tests){
 const s=storage(),calls=[],j=H.create({storage:s,scope:'http-fixture',actor:'device',active:()=>true});
 j.start({id:'local-session',date:'2026-05-05',kind:'musculacao',prescribed:{name:'Sintética'}});const before=j.packet();
 const rpc=Sync.http({url:'https://invalid.example',key:'test-key',fetch:async(url,args)=>{calls.push({url,args});return response();}});
 const sync=Sync.create({storage:s,scope:'http-fixture',token:'synthetic-only',active:()=>true,journal:j,rpc});
 await assert.rejects(sync.run(),e=>e.code===code&&e.operation==='read');
 assert.equal(calls.length,1,'não envia eventos depois de leitura negada/falha');assert.deepEqual(j.packet(),before);assert.equal(s.getItem('tqWorkoutSync:http-fixture:cursor'),null);
 console.log('OK '+label+': classificado como '+code+'; sem envio, perda local ou avanço de cursor');count++;
}
// Um transporte bem-sucedido conserva múltiplas execuções por modalidade/data.
const server=[],s=storage(),j=H.create({storage:s,scope:'replay-fixture',actor:'device',active:()=>true});
for(const kind of ['musculacao','corrida','circuito'])for(let n=0;n<2;n++){
 const id=kind+'-'+n;j.start({id,date:'2026-05-05',kind,prescribed:{name:kind,load:n+1}});j.record({id:'result-'+id,session:id,target:'target',expected:[],value:{reps:n+4}});j.finish({id:'finish-'+id,session:id,value:{}});
}
const snapshot=j.packet();const rpc=async(name,args)=>{if(name==='app_treino_eventos_lista'){const events=server.slice(Number(args.p_apos));return{ok:true,eventos:events,cursor:String(server.length),mais:false};}for(const e of args.p_eventos){const old=server.find(x=>x.id===e.id);if(old)assert.deepEqual(old,e);else server.push(e);}return{ok:true,ids:args.p_eventos.map(e=>e.id)};};
const sync=Sync.create({storage:s,scope:'replay-fixture',token:'synthetic-only',active:()=>true,journal:j,rpc});await sync.run();await sync.run();assert.equal(server.length,18);assert.deepEqual(j.packet(),snapshot);assert.equal(j.list().length,6);
console.log('OK replay de seis execuções na mesma data preserva IDs, prescrições e resultados nas três modalidades');count++;
console.log(count+' cenários HTTP/replay aprovados.');
})().catch(e=>{console.error(e);process.exitCode=1;});
