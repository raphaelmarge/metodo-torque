const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const P=require('../assets/studio-patches');
const scaffold=fs.readFileSync(path.join(__dirname,'test-sync-identidade.js'),'utf8').split('let count = 0;')[0];
const setup=new Function('require','__dirname',scaffold+'\nreturn setup;')(require,__dirname);
const helper=fs.readFileSync(path.join(__dirname,'../assets/studio-patches.js'),'utf8');
const K='mtapp:ptStudio',A='2026-09-06T12:00:00+00:00',B='2026-09-06T13:00:00+00:00';
const initial=()=>({alunos:[{id:'a',nome:'A'},{id:'b',nome:'B'}],treinosV2:{a:{fichas:[{id:'f1',nome:'A'},{id:'f2',nome:'B'}]}},config:{cor:'azul'}});
const copy=x=>JSON.parse(JSON.stringify(x));let count=0;
async function test(name,fn){await fn();count++;console.log('OK '+name);}
async function env(rpc){const opts={rows:[{chave:K,valor:initial(),atualizado:A}],rpc:(name,args)=>name==='personal_sessao_ativa'?{data:true}:rpc(name,args)};const x=await setup(opts);vm.runInContext(helper,x.ctx);await x.start();return {...x,opts};}
(async()=>{
 await test('operações se limitam ao aluno e à ficha alterados',()=>{
  const a=initial(),b=initial();b.alunos[0].nome='Nova';b.treinosV2.a.fichas[1].nome='Novo treino';
  const ops=P.diff(a,b);assert.deepEqual(ops.map(x=>x.caminho),[['alunos','a'],['treinosV2','a','fichas','f2']]);assert.deepEqual(P.apply(a,ops),b);
 });
 await test('reordenação, remoção e formatos sem ID mantêm listas atômicas',()=>{
  for(const change of [a=>a.alunos.reverse(),a=>a.alunos.shift(),a=>a.alunos.unshift({id:'c',nome:'C'}),a=>a.alunos.push({nome:'Sem ID'})]){
   const a=initial(),b=initial();change(b);const ops=P.diff(a,b);assert.deepEqual(ops[0].caminho,['alunos']);assert.deepEqual(P.apply(a,ops),b);
  }
 });
 await test('repetição é idempotente e mesmo item divergente recusa',()=>{
  const a=initial(),b=initial(),c=initial();b.alunos[0].nome='B';c.alunos[0].nome='C';const ops=P.diff(a,b);
  assert.deepEqual(P.apply(b,ops),b);assert.throws(()=>P.apply(c,ops));assert.throws(()=>P.apply(a,[{caminho:['__proto__'],antes:{existe:false},depois:{existe:true,valor:{x:1}}}]));assert.equal({}.x,undefined);
 });
 await test('confirmação traz edição remota de outro aluno sem aumentar a operação enviada',async()=>{
  let server=initial();server.alunos[1].nome='B remoto';
  const x=await env((name,args)=>name==='dados_personal_patch'?{data:[{chave:K,valor:server=P.apply(server,args.p_operacoes),atualizado:B}]}:{data:[]});
  const st=x.ctx.MTStore.read('ptStudio');st.alunos[0].nome='A local';x.ctx.MTStore.write('ptStudio',st);await x.ctx.__MTSync.enviaSujas();
  const call=x.calls.find(c=>c.rpc==='dados_personal_patch');assert.equal(call.args.p_operacoes.length,1);assert.equal(call.args.p_operacoes[0].caminho.join('/'),'alunos/a');
  assert.deepEqual(JSON.parse(x.memory.get(K)).alunos.map(a=>a.nome),['A local','B remoto']);assert.ok(!x.ctx.__MTSync._estado.sujas[K]);
 });
 await test('edição durante envio é reaplicada sobre a confirmação e continua na fila',async()=>{
  let release;const wait=new Promise(r=>release=r);const x=await env(name=>name==='dados_personal_patch'?wait:{data:[]});
  let st=x.ctx.MTStore.read('ptStudio');st.alunos[0].nome='Primeira';x.ctx.MTStore.write('ptStudio',st);const sending=x.ctx.__MTSync.enviaSujas();
  assert.ok(x.ctx.MTStore.saude().pendentes>0&&x.ctx.MTStore.saude().enviando);
  st=x.ctx.MTStore.read('ptStudio');st.alunos[0].nome='Segunda';x.ctx.MTStore.write('ptStudio',st);
  const remote=initial();remote.alunos[0].nome='Primeira';remote.alunos[1].nome='Remoto';release({data:[{chave:K,valor:remote,atualizado:B}]});await sending;
  assert.deepEqual(JSON.parse(x.memory.get(K)).alunos.map(a=>a.nome),['Segunda','Remoto']);assert.ok(x.ctx.__MTSync._estado.sujas[K]);assert.equal(x.ctx.__MTSync.baseDe(K),B);
 });
 await test('consulta remota concilia somente mudanças independentes',async()=>{
  const x=await env(name=>({data:[]}));
  const st=x.ctx.MTStore.read('ptStudio');st.alunos[0].nome='Local';x.ctx.MTStore.write('ptStudio',st);
  const remote=initial();remote.alunos[1].nome='Remoto';x.opts.rows=[{chave:K,valor:remote,atualizado:B}];await x.ctx.__MTSync.puxa();
  assert.deepEqual(JSON.parse(x.memory.get(K)).alunos.map(a=>a.nome),['Local','Remoto']);assert.ok(!x.ctx.__MTSync._estado.conflitos?.[K]);
 });
 await test('falha em outro módulo não repete um patch já confirmado e continua no diagnóstico',async()=>{
  const x=await env((name,args)=>name==='dados_personal_patch'?{data:[{chave:K,valor:P.apply(initial(),args.p_operacoes),atualizado:B}]}:{error:{code:'XX001'}});
  const st=x.ctx.MTStore.read('ptStudio');st.alunos[0].nome='Nova';x.ctx.MTStore.write('ptStudio',st);x.ctx.MTStore.write('diario',{nota:'fictícia'});await x.ctx.__MTSync.enviaSujas();
  assert.ok(!x.ctx.__MTSync._estado.sujas[K]);assert.ok(x.ctx.__MTSync._estado.sujas['mtapp:diario']);assert.equal(x.ctx.MTStore.saude().falhas.sincronizacao.codigo,'XX001');
 });
 await test('confirmação atrasada depois do logout não grava dados',async()=>{
  let release;const wait=new Promise(r=>release=r);const x=await env(name=>name==='dados_personal_patch'?wait:{data:[]});
  const st=x.ctx.MTStore.read('ptStudio');st.alunos[0].nome='Local';x.ctx.MTStore.write('ptStudio',st);const sending=x.ctx.__MTSync.enviaSujas();await x.logout();
  const remote=initial();remote.alunos[1].nome='Resposta atrasada';release({data:[{chave:K,valor:remote,atualizado:B}]});await sending;assert.doesNotMatch(x.memory.get(K),/Resposta atrasada/);
 });
 await test('sessão encerrada para o painel sem descartar o trabalho local',async()=>{
  const x=await env(()=>({data:[]}));const raw=x.memory.get(K);x.opts.rpc=()=>({data:false});
  await x.ctx.__MTSync.puxa();assert.equal(x.ctx.MTStore.cloud(),null);assert.equal(x.memory.get(K),raw);
 });
 console.log(count+' cenários de sincronização por item aprovados.');
})().catch(e=>{console.error(e);process.exitCode=1;});
