/* Fluxo real do Personal, com dados sintéticos e rede externa bloqueada. */
const assert=require('node:assert/strict');
let chromium;try{chromium=require('playwright').chromium;}catch(_){chromium=require('/opt/node22/lib/node_modules/playwright').chromium;}
const {comMockNuvem}=require('./_nuvem.js');
const BASE=process.env.BASE_URL||'http://127.0.0.1:8765';
let browser,n=0;
function ok(v,m){assert.ok(v,m);n++;console.log('OK '+m);}
function eq(v,w,m){assert.deepEqual(v,w,m);n++;console.log('OK '+m);}
(async()=>{
 browser=comMockNuvem(await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']}));
 const ctx=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});
 await ctx.route('**/*',r=>new URL(r.request().url()).origin===new URL(BASE).origin?r.continue():r.abort());
 const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 await p.goto(BASE+'/demo-personal.html');await p.click('#btnDemo');await p.waitForURL(/personal\.html/);await p.waitForFunction(()=>window.__cardiosPT&&window.MT_RELATORIO_0809);
 await p.evaluate(()=>{
  const s=MTStore.read('ptStudio',{}),z={id:'zona-a',nome:'Faixa original',tipo:'pace',min:300,max:360};
  s.alunos=[{id:'corrida-a',nome:'Corredor sintético A',ativo:true},{id:'corrida-b',nome:'Corredor sintético B',ativo:true}];
  s.config=Object.assign({},s.config,{dia1Off:true,zapFilaOff:true});
  s.treinosV2={'corrida-a':{fichas:[{id:'forca-a',titulo:'Musculação preservada',itens:[]}],zonasCorrida:[z],cardio:[
   {id:'corrida-1',nome:'Sequência original',tipo:'continuo',mod:'corrida',blocos:[{tipo:'aquecimento',alvo:{valor:5,unidade:'min',zona:z},repeticoes:1},{tipo:'repetir',repeticoes:2,alvo:{valor:.2,unidade:'km',zona:z},recuperacao:{valor:45,unidade:'s',zona:null}}]},
   {id:'corrida-2',nome:'Outra sequência',tipo:'continuo',mod:'corrida',blocos:[{tipo:'ativo',alvo:{valor:3,unidade:'km',zona:null},repeticoes:1}]}
  ]},'corrida-b':{fichas:[],zonasCorrida:[],cardio:[]}};
  localStorage.setItem('mtapp:ptStudio',JSON.stringify(s));__ptStudio.render();
 });
 await p.evaluate(()=>{document.querySelector('#abas [data-a="treinos"]').click();document.querySelector('#trAbas [data-tra="cardio"]').click();});
 await p.locator('#cbAluno').selectOption('corrida-a');await p.locator('[data-cbed="corrida-1"]').click();
 await p.locator('#r809BlocosBox').evaluate(e=>e.open=true);await p.locator('#r809ZonasBox').evaluate(e=>e.open=true);
 const store=()=>p.evaluate(()=>MTStore.read('ptStudio',{}));
 const blocks=()=>p.evaluate(()=>JSON.parse(document.getElementById('cbBlocos').value));
 const original=JSON.stringify((await store()).treinosV2['corrida-a'].cardio);
 await p.locator('[data-r809-block-edit="1"]').click();await p.locator('#r809BlocoReps').fill('3');await p.locator('#r809RecValor').fill('60');
 ok((await p.locator('#r809BlocoPreview').innerText()).includes('3×'),'prévia inclui repetições e recuperação antes de aplicar');
 await p.locator('#cbSalva').click();
 eq(JSON.stringify((await store()).treinosV2['corrida-a'].cardio),original,'salvar treino com bloco em edição preserva o rascunho e não descarta alterações');
 await p.locator('#r809BlocoAdd').click();eq((await blocks())[1].recuperacao.valor,60,'editar bloco aplica a nova recuperação no rascunho');
 eq(JSON.stringify((await store()).treinosV2['corrida-a'].cardio),original,'editar bloco não grava o treino antes de Salvar');
 await p.locator('[data-r809-block-copy="1"]').click();eq((await blocks()).length,3,'duplicar cria bloco independente na sequência');
 await p.locator('[data-r809-block-up="2"]').click();await p.locator('[data-r809-block-down="0"]').click();
 eq((await blocks()).map(b=>b.tipo),['repetir','aquecimento','repetir'],'subir e descer reordenam por ações acessíveis');
 await p.locator('[data-r809-block-edit="0"]').click();await p.locator('#r809AlvoValor').fill('0.4');await p.locator('#r809BlocoAdd').click();
 eq((await blocks())[2].alvo.valor,.2,'alterar cópia não modifica o bloco de origem');
 await p.locator('[data-r809-zone-edit="zona-a"]').click();await p.locator('#r809ZonaMin').fill('4:30');await p.locator('#r809ZonaMax').fill('5:30');await p.locator('#r809ZonaAdd').click();
 eq((await store()).treinosV2['corrida-a'].zonasCorrida[0].min,270,'editar zona mantém ID e salva novos limites na biblioteca');
 eq((await blocks())[0].alvo.zona.min,300,'alterar biblioteca preserva snapshot do rascunho');
 eq(JSON.stringify((await store()).treinosV2['corrida-a'].cardio),original,'alterar biblioteca preserva todos os treinos prescritos');
 await p.locator('[data-r809-block-edit="0"]').click();ok((await p.locator('#r809ZonaAlvo option:checked').innerText()).includes('Manter zona prescrita'),'editar bloco mostra que conservará a zona prescrita');
 await p.locator('#r809AlvoValor').fill('0.5');await p.locator('#r809BlocoAdd').click();eq((await blocks())[0].alvo.zona.min,300,'editar duração mantém snapshot antigo apesar da biblioteca atualizada');
 await p.locator('[data-r809-block-edit="0"]').click();await p.locator('#r809ZonaAlvo').selectOption('zona-a');await p.locator('#r809BlocoAdd').click();eq((await blocks())[0].alvo.zona.min,270,'troca explícita de zona usa a faixa atual da biblioteca');
 await p.locator('[data-r809-zone-copy="zona-a"]').click();eq((await store()).treinosV2['corrida-a'].zonasCorrida.length,1,'duplicar zona preenche rascunho sem gravar');
 await p.locator('#r809ZonaNome').fill('Velocidade sintética');await p.locator('#r809ZonaTipo').selectOption('velocidade');await p.locator('#r809ZonaMin').fill('8,5');await p.locator('#r809ZonaMax').fill('10');await p.locator('#r809ZonaAdd').click();
 let s=await store(),zid=s.treinosV2['corrida-a'].zonasCorrida[1].id;eq(s.treinosV2['corrida-a'].zonasCorrida[1].min,8.5,'cópia salva tipo e limites próprios');
 ok(zid!=='zona-a','cópia recebe novo ID');
 await p.locator('[data-r809-zone-edit="zona-a"]').click();await p.locator('#r809ZonaNome').fill('Rascunho em conflito');
 await p.evaluate(()=>{const s=MTStore.read('ptStudio',{});s.treinosV2['corrida-a'].zonasCorrida[0].nome='Outra sessão';localStorage.setItem('mtapp:ptStudio',JSON.stringify(s));});
 await p.locator('#r809ZonaAdd').click();ok((await p.locator('#r809CorridaStatus').innerText()).includes('outra sessão'),'edição de zona recusa sobrescrever revisão concorrente');
 eq(await p.locator('#r809ZonaNome').inputValue(),'Rascunho em conflito','conflito conserva os campos da zona');
 eq((await store()).treinosV2['corrida-a'].zonasCorrida[0].nome,'Outra sessão','conflito preserva a zona mais nova');
 await p.locator('#r809ZonaCancel').click();await p.evaluate(()=>MT_RELATORIO_0809.corrida());await p.locator('[data-r809-zone-edit="zona-a"]').click();
 await p.locator('#r809ZonaNome').fill('Zona revisada');
 await p.evaluate(zid=>{const s=MTStore.read('ptStudio',{});s.treinosV2['corrida-a'].zonasCorrida.find(z=>z.id===zid).nome='Alteração independente';localStorage.setItem('mtapp:ptStudio',JSON.stringify(s));},zid);
 await p.locator('#r809ZonaAdd').click();eq((await store()).treinosV2['corrida-a'].zonasCorrida[1].nome,'Alteração independente','edição preserva mudança concorrente em outra zona');
 await p.locator('[data-r809-zone-edit="zona-a"]').click();await p.locator('#r809ZonaNome').fill('Falha de armazenamento');
 await p.evaluate(()=>{window.__corridaWrite=MTStore.write;window.__corridaFail=1;MTStore.write=function(k,v){if(k==='ptStudio'&&__corridaFail-->0)return false;return __corridaWrite.apply(this,arguments);};});
 await p.locator('#r809ZonaAdd').click();eq(await p.locator('#r809ZonaNome').inputValue(),'Falha de armazenamento','save false conserva rascunho da zona');
 eq((await store()).treinosV2['corrida-a'].zonasCorrida[0].nome,'Zona revisada','save false não altera biblioteca');
 await p.locator('#r809ZonaAdd').click();eq((await store()).treinosV2['corrida-a'].zonasCorrida[0].nome,'Falha de armazenamento','nova tentativa salva sem duplicar zona');
 await p.locator('[data-r809-block-edit="0"]').click();await p.locator('#r809AlvoValor').fill('0.7');await p.locator('#r809ZonaNome').fill('Zona não salva A');
 await p.locator('#cbAluno').selectOption('corrida-b');eq(await p.locator('#r809AlvoValor').inputValue(),'','outro aluno não recebe subeditor de blocos');eq(await p.locator('#r809ZonaNome').inputValue(),'','outro aluno não recebe rascunho de zona');
 await p.locator('#cbAluno').selectOption('corrida-a');eq(await p.locator('#r809AlvoValor').inputValue(),'0.7','retornar ao aluno restaura edição do bloco');eq(await p.locator('#r809ZonaNome').inputValue(),'Zona não salva A','retornar ao aluno restaura zona em preenchimento');
 await p.evaluate(()=>{window.__corridaCloud=MTStore.cloud;window.__corridaOriginalState=localStorage.getItem('mtapp:ptStudio');MTStore.cloud=()=>null;window.__corridaUsuario=MTStore.usuario;MTStore.usuario=()=>({email:'outra-conta@sintetico.invalid'});const s=JSON.parse(__corridaOriginalState);s.treinosV2['corrida-a']={fichas:[],cardio:[],zonasCorrida:[]};localStorage.setItem('mtapp:ptStudio',JSON.stringify(s));__cardiosPT();});
 eq(await p.locator('#cbNome').inputValue(),'','mesmo ID em outra conta não restaura nome do treino');eq(await blocks(),[],'mesmo ID em outra conta não restaura blocos');eq(await p.locator('#r809ZonaNome').inputValue(),'','mesmo ID em outra conta não restaura zona');
 await p.evaluate(()=>{MTStore.cloud=__corridaCloud;MTStore.usuario=__corridaUsuario;localStorage.setItem('mtapp:ptStudio',__corridaOriginalState);__cardiosPT();});
 eq(await p.locator('#r809AlvoValor').inputValue(),'0.7','retornar à conta correta restaura subeditor isolado');
 await p.locator('#r809BlocoCancel').click();eq((await blocks())[0].alvo.valor,.5,'cancelar edição conserva valor aplicado anteriormente');
 await p.locator('[data-r809-block-edit="0"]').click();await p.locator('#r809AlvoValor').fill('0.9');await p.locator('[data-cbed="corrida-2"]').click();
 eq(await p.locator('#r809AlvoValor').inputValue(),'','abrir outro treino descarta subeditor da sequência anterior');eq((await blocks())[0].alvo.valor,3,'abrir outro treino lê seus próprios blocos');
 await p.locator('[data-r809-block-copy="0"]').click();await p.evaluate(()=>window.__corridaFail=1);const beforeFail=JSON.stringify(await blocks());await p.locator('#cbSalva').click();
 eq(JSON.stringify(await blocks()),beforeFail,'falha ao salvar treino conserva sequência montada');eq(await p.locator('#cbNome').inputValue(),'Outra sequência','falha ao salvar treino conserva modo de edição');
 await p.locator('#cbSalva').click();eq((await store()).treinosV2['corrida-a'].cardio.find(c=>c.id==='corrida-2').blocos.length,2,'nova tentativa salva no mesmo treino');eq(await blocks(),[],'sucesso limpa os blocos do rascunho');
 await p.locator('#cbAluno').selectOption('corrida-b');await p.locator('#cbAluno').selectOption('corrida-a');eq(await blocks(),[],'retornar ao aluno não ressuscita blocos já salvos');
 await p.locator('[data-cbed="corrida-1"]').click();await p.locator('[data-r809-block-edit="0"]').click();await p.locator('#r809AlvoValor').fill('99');await p.locator('#cbLimpa').click();
 eq(await blocks(),[],'limpar rascunho apaga somente sequência em montagem');eq(await p.locator('#r809AlvoValor').inputValue(),'','limpar rascunho limpa também o subeditor');
 eq((await store()).treinosV2['corrida-a'].fichas[0].titulo,'Musculação preservada','ações de corrida preservam fichas de musculação');
 await p.locator('[data-cbed="corrida-1"]').click();
 for(const theme of ['escuro','claro'])for(const width of [320,390,1280]){
  await p.setViewportSize({width,height:900});await p.evaluate(t=>document.documentElement.dataset.tema=t,theme);
  ok(await p.locator('#r809Corrida').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'corrida sem overflow '+width+' '+theme);
  ok(await p.locator('#r809Corrida button:visible').evaluateAll(es=>es.every(e=>e.getBoundingClientRect().height>=43.5)),'ações de corrida com alvo 44px '+width+' '+theme);
 }
 eq(errors,[],'fluxo executa sem erros JavaScript');await ctx.close();console.log(n+' verificações de corrida passaram.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
