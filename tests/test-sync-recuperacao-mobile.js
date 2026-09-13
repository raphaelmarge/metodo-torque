/* Recuperação de conflitos: fixtures fictícias, sem rede nem dados de produção. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const scaffold=fs.readFileSync(path.join(__dirname,'test-sync-identidade.js'),'utf8').split('let count = 0;')[0];
const setup=new Function('require','__dirname',scaffold+'\nreturn setup;')(require,__dirname);
const K='mtapp:ptStudio',A='2026-09-12T12:00:00+00:00',B='2026-09-13T14:00:00+00:00';
const old=()=>({alunos:[{id:'aluno-local-ficticio'}],treinosV2:{},questionarios:[]});
const current=()=>({alunos:[{id:'aluno-local-ficticio'},{id:'aluno-PC-ficticio'}],treinosV2:{},questionarios:[]});
const row=(valor=current(),atualizado=B)=>({chave:K,valor,atualizado});
const tick=()=>new Promise(r=>setImmediate(r));
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve};};
function idb(x,opts={}){
 const archive=new Map(),pending=[];let writes=0;
 x.ctx.indexedDB={open(){const request={};setImmediate(()=>{
  if(opts.blocked){request.onblocked?.();return;}
  const db={objectStoreNames:{contains:()=>true},close(){},transaction(){
   const tx={abort(){tx.onabort?.();},objectStore(){return {put(value,key){writes++;
    const commit=()=>{if(opts.abort){tx.onabort?.();return;}archive.set(key,value);tx.oncomplete?.();};
    if(opts.hold)pending.push(commit);else setImmediate(commit);
   }};}};return tx;
  }};request.result=db;request.onsuccess?.();
 });return request;}};
 return {archive,pending,get writes(){return writes;}};
}
function denyBackups(x){const original=x.ctx.localStorage.setItem;x.ctx.localStorage.setItem=(k,v)=>{
 if(k.startsWith('mtsync:conflito:')){const e=new Error('cota de teste');e.name='QuotaExceededError';throw e;}return original(k,v);
};}
async function conflict(options={}){
 const opts={rows:[row()],local:{[K]:old(),'mtsync:ts':{[K]:'2026-09-12T13:00:00.000Z'}},...options};
 const x=await setup(opts);await x.start();assert.ok(x.ctx.__MTSync._estado.conflitos[K]);return {x,opts};
}
let passed=0;
async function test(name,fn){await fn();passed++;console.log('  OK '+name);}
(async()=>{
 await test('salvar sem mudança preserva carimbo, revisão e fila limpa',async()=>{
  const x=await setup({rows:[row(old(),A)]});await x.start();const before=x.memory.get('mtsync:ts');
  let notifications=0;x.ctx.MTStore.onChange(()=>notifications++);
  assert.equal(x.ctx.MTStore.write('ptStudio',x.ctx.MTStore.read('ptStudio')),true);
  assert.equal(x.memory.get('mtsync:ts'),before);assert.equal(x.ctx.__MTSync.baseDe(K),A);
  assert.ok(!x.ctx.__MTSync._estado.sujas[K]);assert.equal(notifications,0);
 });
 await test('aluno criado no PC aparece no celular após salvamento idêntico',async()=>{
  const opts={rows:[row(old(),A)]},x=await setup(opts);await x.start();x.ctx.MTStore.write('ptStudio',x.ctx.MTStore.read('ptStudio'));
  opts.rows=[row()];await x.ctx.__MTSync.puxa();assert.equal(x.ctx.MTStore.read('ptStudio').alunos.length,2);
  assert.ok(!x.ctx.__MTSync._estado.conflitos?.[K]);assert.equal(x.calls.filter(c=>c.rpc==='dados_cas').length,0);
 });
 await test('edição real ainda exige resolução e não sobrescreve a nuvem',async()=>{
  const opts={rows:[row(old(),A)]},x=await setup(opts);await x.start();const st=x.ctx.MTStore.read('ptStudio');st.nota='edição real';x.ctx.MTStore.write('ptStudio',st);
  opts.rows=[row()];await x.ctx.__MTSync.puxa();assert.ok(x.ctx.__MTSync._estado.conflitos[K]);assert.match(x.memory.get(K),/edição real/);
 });
 await test('cota local cheia usa IndexedDB confirmado e carrega o aluno do PC',async()=>{
  const {x}=await conflict();const archive=idb(x);denyBackups(x);
  assert.equal(await x.ctx.__MTSync.resolveConflito(K),true);assert.equal(x.ctx.MTStore.read('ptStudio').alunos.length,2);
  assert.equal(x.ctx.__MTSync.baseDe(K),B);assert.ok(!x.ctx.__MTSync._estado.conflitos[K]);
  assert.ok([...archive.archive.values()].some(v=>JSON.parse(v).raw===JSON.stringify(old())));
  assert.equal(x.calls.filter(c=>c.rpc==='dados_cas').length,0);
 });
 await test('cópia local idêntica é reutilizada quando IndexedDB não existe',async()=>{
  const {x}=await conflict();const keys=[...x.memory.keys()].filter(k=>k.startsWith('mtsync:conflito:'));denyBackups(x);
  assert.equal(await x.ctx.__MTSync.resolveConflito(K),true);assert.deepEqual([...x.memory.keys()].filter(k=>k.startsWith('mtsync:conflito:')),keys);
 });
 await test('falha de ambos os armazenamentos conserva painel e proteção',async()=>{
  const x=await setup({rows:[row()],local:{[K]:old(),'mtsync:ts':{[K]:'2026-09-12T13:00:00.000Z'}}});denyBackups(x);idb(x,{blocked:true});await x.start();
  const reads=x.calls.filter(c=>c.table==='dados').length;
  assert.equal(await x.ctx.__MTSync.resolveConflito(K),false);assert.equal(x.memory.get(K),JSON.stringify(old()));assert.ok(x.ctx.__MTSync._estado.conflitos[K]);
  assert.equal(x.calls.filter(c=>c.table==='dados').length,reads);
 });
 await test('transação abortada não é anunciada como backup durável',async()=>{
  const x=await setup({rows:[row()],local:{[K]:old(),'mtsync:ts':{[K]:'2026-09-12T13:00:00.000Z'}}});denyBackups(x);const archive=idb(x,{abort:true});await x.start();
  assert.equal(await x.ctx.__MTSync.resolveConflito(K),false);assert.equal(archive.archive.size,0);assert.equal(x.memory.get(K),JSON.stringify(old()));
 });
 await test('logout durante backup não aplica resposta nem cruza conta',async()=>{
  const {x}=await conflict(),archive=idb(x,{hold:true});const result=x.ctx.__MTSync.resolveConflito(K);await tick();await x.logout();
  // Não há migração quando o original não pode ser apagado; libera todos os commits agendados.
  for(let i=0;i<8;i++){archive.pending.splice(0).forEach(commit=>commit());await tick();}
  assert.equal(await result,false);assert.equal(x.memory.get(K),JSON.stringify(old()));
  assert.ok([...archive.archive.keys()].every(k=>k.startsWith('mtsync:conflito:academy-a:')));
 });
 await test('edição feita durante backup continua local e não é descartada',async()=>{
  const {x}=await conflict(),archive=idb(x,{hold:true});const result=x.ctx.__MTSync.resolveConflito(K);await tick();
  const st=x.ctx.MTStore.read('ptStudio');st.nota='edição durante backup';x.ctx.MTStore.write('ptStudio',st);
  for(let i=0;i<8;i++){archive.pending.splice(0).forEach(commit=>commit());await tick();}
  assert.equal(await result,false);assert.match(x.memory.get(K),/edição durante backup/);assert.ok(x.ctx.__MTSync._estado.sujas[K]);
 });
 await test('edição durante consulta não é substituída por resposta atrasada',async()=>{
  const {x,opts}=await conflict(),wait=deferred();opts.pullPromise=wait.promise;
  const result=x.ctx.__MTSync.resolveConflito(K);await tick();const st=x.ctx.MTStore.read('ptStudio');st.nota='edição durante consulta';x.ctx.MTStore.write('ptStudio',st);
  wait.resolve({data:[row()]});assert.equal(await result,false);assert.match(x.memory.get(K),/edição durante consulta/);
 });
 await test('logout durante consulta ignora resposta atrasada',async()=>{
  const {x,opts}=await conflict(),wait=deferred();opts.pullPromise=wait.promise;const result=x.ctx.__MTSync.resolveConflito(K);await tick();await x.logout();
  wait.resolve({data:[row()]});assert.equal(await result,false);assert.equal(x.memory.get(K),JSON.stringify(old()));
 });
 await test('erro remoto, ausência e formato inválido mantêm a cópia local',async()=>{
  for(const response of [{error:{message:'offline'}},{data:[]},{data:[{...row(),chave:'outra-chave'}]},{data:[{...row(),valor:null}]},{data:[{...row(),valor:[]}]}]){
   const {x,opts}=await conflict();opts.pullPromise=Promise.resolve(response);assert.equal(await x.ctx.__MTSync.resolveConflito(K),false);
   assert.equal(x.memory.get(K),JSON.stringify(old()));assert.ok(x.ctx.__MTSync._estado.conflitos[K].erro);
  }
 });
 await test('cópias antigas só saem da cota após commit e outras contas ficam intactas',async()=>{
  const {x}=await conflict(),archive=idb(x);const same='mtsync:conflito:academy-a:anterior',other='mtsync:conflito:academy-b:outra';
  const text=JSON.stringify({chave:K,raw:'rascunho anterior fictício'});x.memory.set(same,text);x.memory.set(other,'não tocar');x.memory.set('mtapp:ptImagens','{"foto":"preservar"}');
  const remove=x.ctx.localStorage.removeItem;x.ctx.localStorage.removeItem=k=>{if(k.startsWith('mtsync:conflito:'))assert.equal(archive.archive.get(k),x.memory.get(k));return remove(k);};
  assert.equal(await x.ctx.__MTSync.resolveConflito(K),true);assert.equal(archive.archive.get(same),text);assert.ok(!x.memory.has(same));
  assert.equal(x.memory.get(other),'não tocar');assert.equal(x.memory.get('mtapp:ptImagens'),'{"foto":"preservar"}');
 });
 await test('revisão não avança quando a cota recusa metadados',async()=>{
  const {x}=await conflict();const before=x.memory.get('mtsync:ts'),base=x.ctx.__MTSync.baseDe(K),original=x.ctx.localStorage.setItem;
  x.ctx.localStorage.setItem=(k,v)=>{if(k==='mtsync:base:academy-a')throw Error('cota de teste');return original(k,v);};
  assert.equal(await x.ctx.__MTSync.resolveConflito(K),false);assert.equal(x.memory.get(K),JSON.stringify(old()));
  assert.equal(x.memory.get('mtsync:ts'),before);assert.equal(x.ctx.__MTSync.baseDe(K),base);
 });
 await test('revisão é revertida quando painel remoto maior não cabe',async()=>{
  const {x}=await conflict();const before=x.memory.get('mtsync:ts'),base=x.ctx.__MTSync.baseDe(K),original=x.ctx.localStorage.setItem;idb(x);
  x.ctx.localStorage.setItem=(k,v)=>{if(k===K&&v!==JSON.stringify(old()))throw Error('cota de teste');return original(k,v);};
  assert.equal(await x.ctx.__MTSync.resolveConflito(K),false);assert.equal(x.memory.get(K),JSON.stringify(old()));
  assert.equal(x.memory.get('mtsync:ts'),before);assert.equal(x.ctx.__MTSync.baseDe(K),base);assert.ok(x.ctx.__MTSync._estado.conflitos[K]);
 });
 await test('nova edição de ouvinte após recuperação conserva sua fila de envio',async()=>{
  const {x}=await conflict();let changed=false;x.ctx.MTStore.onChange(k=>{if(k!=='ptStudio'||changed)return;changed=true;
   const st=x.ctx.MTStore.read('ptStudio');st.nota='edição após recuperar';x.ctx.MTStore.write('ptStudio',st);
  });assert.equal(await x.ctx.__MTSync.resolveConflito(K),true);assert.match(x.memory.get(K),/edição após recuperar/);assert.ok(x.ctx.__MTSync._estado.sujas[K]);
 });
 await test('formulário local obsoleto reabre estado atual sem sobrescrevê-lo',async()=>{
  const x=await setup({rows:[row(old(),A)]});await x.start();const stale=x.ctx.MTStore.read('ptStudio'),fresh=x.ctx.MTStore.read('ptStudio');fresh.nota='atual';x.ctx.MTStore.write('ptStudio',fresh);
  stale.nota='rascunho de formulário';assert.equal(x.ctx.MTStore.write('ptStudio',stale),false);idb(x);denyBackups(x);
  assert.equal(await x.ctx.__MTSync.resolveConflito(K),true);assert.match(x.memory.get(K),/atual/);assert.ok(!x.ctx.__MTSync._estado.conflitos[K]);
 });
 await test('cliques concorrentes compartilham uma única recuperação',async()=>{
  const {x}=await conflict();const before=x.calls.filter(c=>c.table==='dados').length;
  const a=x.ctx.__MTSync.resolveConflito(K),b=x.ctx.__MTSync.resolveConflito(K);assert.equal(a,b);assert.equal(await a,true);
  assert.equal(x.calls.filter(c=>c.table==='dados').length-before,1);
 });
 console.log(passed+' cenários de recuperação móvel passaram.');
})().catch(e=>{console.error(e);process.exitCode=1;});
