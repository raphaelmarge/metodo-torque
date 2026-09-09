/* Dados fictícios; nenhuma chamada à rede nem dado de produção. */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const scaffold = fs.readFileSync(path.join(__dirname, 'test-sync-identidade.js'), 'utf8').split('let count = 0;')[0];
const setup = new Function('require', '__dirname', scaffold + '\nreturn setup;')(require, __dirname);
const sql = fs.readFileSync(path.join(__dirname, '../supabase-setup.sql'), 'utf8');
const storeCode = fs.readFileSync(path.join(__dirname, '../apps/store.js'), 'utf8');
const K = 'mtapp:ptStudio', A = '2026-09-06T12:00:00+00:00', B = '2026-09-06T13:00:00+00:00', C = '2026-09-06T14:00:00+00:00';
const initial = () => ({ alunos: [{id:'aluno-ficticio'}], treinosV2: {}, questionarios: [{id:'questionario-ficticio'}] });
const dataRow = (valor, atualizado=A) => ({chave:K,valor,atualizado});
const deferred = () => {let resolve; return {promise:new Promise(r=>resolve=r),resolve};};
let passed=0;
async function test(name,fn){await fn(); passed++; console.log('  OK '+name);}
(async()=>{
 await test('envio leva a revisão lida, não o horário local',async()=>{
  const opts={rows:[dataRow(initial())]},x=await setup(opts); await x.start();
  const st=x.ctx.MTStore.read('ptStudio'); st.nota='edição fictícia'; x.ctx.MTStore.write('ptStudio',st); await x.ctx.__MTSync.enviaSujas();
  const call=x.calls.filter(c=>c.rpc==='dados_cas').at(-1);assert.equal(call.args.p_base_atualizado,A);
  assert.equal(call.args.p_chave,K);assert.equal(call.args.p_valor.nota,'edição fictícia');
  assert.equal(x.ctx.__MTSync.baseDe(K),B);
 });
 await test('cópia offline antiga sem base comprovada nunca sobrescreve a nuvem',async()=>{
  const x=await setup({rows:[dataRow(initial())],local:{[K]:{alunos:[{id:'antigo'}]},'mtsync:ts':{[K]:'2026-09-06T15:00:00.000Z'}}});await x.start();
  assert.ok(x.ctx.__MTSync._estado.conflitos[K]);assert.equal(x.calls.filter(c=>c.rows).length,0);
  assert.ok([...x.memory.keys()].some(k=>k.startsWith('mtsync:conflito:')));assert.match(x.memory.get(K),/antigo/);
 });
 await test('outra edição remota não muda a base de um rascunho local',async()=>{
  const opts={rows:[dataRow(initial())]},x=await setup(opts);await x.start();
  const st=x.ctx.MTStore.read('ptStudio');st.nota='rascunho';x.ctx.MTStore.write('ptStudio',st);
  opts.rows=[dataRow({...initial(),nota:'outra edição'},C)];await x.ctx.__MTSync.puxa();
  assert.equal(x.ctx.__MTSync.baseDe(K),A);assert.match(x.memory.get(K),/rascunho/);assert.ok(x.ctx.__MTSync._estado.conflitos[K]);
 });
 await test('PT409 conserva o rascunho e não tenta enviar repetidamente',async()=>{
  const opts={rows:[dataRow(initial())],sendPromise:Promise.resolve({error:{code:'PT409',message:'Conflito fictício'}})},x=await setup(opts);await x.start();
  const st=x.ctx.MTStore.read('ptStudio');st.nota='meu rascunho';x.ctx.MTStore.write('ptStudio',st);await x.ctx.__MTSync.enviaSujas();
  assert.ok(x.ctx.__MTSync._estado.conflitos[K]);const n=x.calls.filter(c=>c.rpc==='dados_cas').length;
  await x.ctx.__MTSync.enviaSujas();assert.equal(x.calls.filter(c=>c.rpc==='dados_cas').length,n);
  assert.match(x.memory.get(K),/meu rascunho/);
 });
 await test('edição durante um envio mantém a fila e usa a base da confirmação',async()=>{
  const wait=deferred(),opts={rows:[dataRow(initial())],sendPromise:wait.promise},x=await setup(opts);await x.start();
  let st=x.ctx.MTStore.read('ptStudio');st.nota='primeira';x.ctx.MTStore.write('ptStudio',st);const first=x.ctx.__MTSync.enviaSujas();
  st=x.ctx.MTStore.read('ptStudio');st.nota='segunda';x.ctx.MTStore.write('ptStudio',st);
  wait.resolve({data:[{chave:K,atualizado:B}]});await first;assert.equal(x.ctx.__MTSync._estado.sujas[K],true);assert.equal(x.ctx.__MTSync.baseDe(K),B);
  await x.ctx.__MTSync.enviaSujas();assert.equal(x.calls.filter(c=>c.rpc==='dados_cas').at(-1).args.p_base_atualizado,B);
 });
 await test('cursor não pula a atualização recebida enquanto há envio',async()=>{
  const wait=deferred(),opts={rows:[dataRow(initial())],sendPromise:wait.promise},x=await setup(opts);await x.start();
  let st=x.ctx.MTStore.read('ptStudio');st.nota='envio';x.ctx.MTStore.write('ptStudio',st);const first=x.ctx.__MTSync.enviaSujas();
  opts.rows=[dataRow({...initial(),nota:'remoto posterior'},C)];await x.ctx.__MTSync.puxa();assert.equal(x.ctx.__MTSync._estado.marca,A);
  wait.resolve({data:[{chave:K,atualizado:B}]});await first;await x.ctx.__MTSync.puxa();assert.match(x.memory.get(K),/remoto posterior/);
 });
 await test('formulário aberto antes de outra gravação não perde a versão atual',async()=>{
  const x=await setup({rows:[dataRow(initial())]});await x.start();const antigo=x.ctx.MTStore.read('ptStudio'),atual=x.ctx.MTStore.read('ptStudio');
  atual.nota='novo';assert.equal(x.ctx.MTStore.write('ptStudio',atual),true);antigo.nota='rascunho antigo';assert.equal(x.ctx.MTStore.write('ptStudio',antigo),false);
  assert.match(x.memory.get(K),/novo/);assert.ok([...x.memory.entries()].some(([k,v])=>k.startsWith('mtsync:conflito:')&&v.includes('rascunho antigo')));
 });
 await test('recarregar após conflito exige backup e confirmação explícita',async()=>{
  const opts={rows:[dataRow(initial())]},x=await setup(opts);await x.start();const st=x.ctx.MTStore.read('ptStudio');st.nota='offline';x.ctx.MTStore.write('ptStudio',st);
  opts.rows=[dataRow({...initial(),nota:'canônico'},C)];await x.ctx.__MTSync.puxa();assert.match(x.memory.get(K),/offline/);
  assert.equal(await x.ctx.__MTSync.resolveConflito(K),true);assert.match(x.memory.get(K),/canônico/);assert.equal(x.ctx.__MTSync.baseDe(K),C);
 });
 await test('publicação leva a revisão do painel já sincronizado',async()=>{
  const x=await setup({rows:[dataRow(initial())]});await x.start();const prep=await x.ctx.MTStore.preparaAppsSeguros();
  const r=await x.ctx.MTStore.publicaAppsSeguros([{token:'token-ficticio',academia_id:'academy-a',dados:{dados:{a:{id:'aluno-ficticio'}}}}],prep);
  assert.ok(!r.error);const pub=x.calls.find(c=>c.rpc==='app_aluno_publica_cas');assert.equal(pub.args.p_source_atualizado,A);assert.equal(pub.args.p_linhas[0].dados.sourceUpdatedAt,A);
 });
 await test('conflito impede publicar o pacote antigo do aluno',async()=>{
  const x=await setup({rows:[dataRow(initial())],local:{[K]:{alunos:[{id:'antigo'}]},'mtsync:ts':{[K]:'2026-09-06T15:00:00.000Z'}}});await x.start();
  const prep=await x.ctx.MTStore.preparaAppsSeguros();assert.ok(prep.error);const r=await x.ctx.MTStore.publicaAppsSeguros([{dados:{}}],prep);
  assert.ok(r.error);assert.ok(!x.calls.some(c=>c.rpc==='app_aluno_publica_cas'));
 });
 await test('avanço remoto ainda não puxado recusa atomicamente a publicação antiga',async()=>{
  const opts={rows:[dataRow(initial())]},x=await setup(opts);await x.start();const prep=await x.ctx.MTStore.preparaAppsSeguros();
  opts.rows=[dataRow({...initial(),nota:'remoto novo'},C)];
  const r=await x.ctx.MTStore.publicaAppsSeguros([{token:'token-ficticio',dados:{ficha:'antiga'}}],prep);
  assert.equal(r.error.code,'PT409');assert.ok(x.ctx.__MTSync._estado.conflitos[K]);
  const pub=x.calls.find(c=>c.rpc==='app_aluno_publica_cas');assert.equal(pub.args.p_source_atualizado,A);
 });
 await test('pacote montado antes de nova edição local nunca é publicado',async()=>{
  const x=await setup({rows:[dataRow(initial())]});await x.start();const prep=await x.ctx.MTStore.preparaAppsSeguros();
  const pacote=[{token:'token-ficticio',dados:{ficha:'antiga'}}],st=x.ctx.MTStore.read('ptStudio');st.nota='edição posterior';x.ctx.MTStore.write('ptStudio',st);
  const r=await x.ctx.MTStore.publicaAppsSeguros(pacote,prep);assert.ok(r.error);assert.ok(!x.calls.some(c=>c.rpc==='app_aluno_publica_cas'));
 });
 await test('banco compara e grava na mesma transação respeitando RLS',async()=>{
  assert.match(sql,/function public\.dados_cas[\s\S]*security invoker[\s\S]*d\.atualizado = p_base_atualizado/);
  assert.match(sql,/function public\.app_aluno_publica_cas[\s\S]*security invoker[\s\S]*for share/);
  assert.match(sql,/grant execute on function public\.dados_cas[^;]+to authenticated/);
  assert.match(sql,/revoke all on function public\.dados_cas[^;]+from public, anon/);
 });
 await test('clientes antigos não contornam as portas seguras',async()=>{
  assert.match(sql,/create trigger dados_exige_rpc_tg/);assert.match(sql,/create trigger app_aluno_exige_rpc_tg/);
  assert.match(sql,/errcode = 'PT426'/);assert.match(storeCode,/rpc\("dados_grava"/);assert.match(storeCode,/rpc\("dados_cas"/);
  for(const f of ['../personal.html','../nutricao.html','../apps/app-aluno.html']){
    const code=fs.readFileSync(path.join(__dirname,f),'utf8');assert.doesNotMatch(code,/from\(["']app_aluno["']\)\.upsert/);
  }
 });
 console.log(passed+' cenários de concorrência passaram.');
})().catch(e=>{console.error(e);process.exitCode=1;});
