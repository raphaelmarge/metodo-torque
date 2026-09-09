/* Fluxos de Avaliações, Questionários e Desafio: filtros não alteram dados. */
const assert = require('assert/strict');
let chromium;
try { chromium = require(process.env.TORQUE_PLAYWRIGHT || 'playwright').chromium; }
catch (_) { chromium = require('/opt/node22/lib/node_modules/playwright').chromium; }
const { comMockNuvem } = require('./_nuvem.js');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765';
let browser, checks = 0;
const ok = (v, label) => { assert.ok(v, label); checks++; console.log('OK: ' + label); };
const eq = (a,b,label) => { assert.deepEqual(a,b,label); checks++; console.log('OK: '+label); };
(async()=>{
 browser = comMockNuvem(await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args:['--no-sandbox'] }));
 const ctx = await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/Sao_Paulo',serviceWorkers:'block'});
 const network=[], errors=[];
 await ctx.route('**://*.supabase.co/**', r=>{network.push(r.request().url());return r.abort();});
 const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.dismiss());
 await p.clock.setFixedTime(new Date('2026-09-07T12:00:00-03:00'));
 await p.goto(BASE+'/demo-personal.html');await p.click('#btnDemo');await p.waitForURL(/personal\.html/);
 await p.waitForFunction(()=>window.__acompExperiencia && window.mockNuvem);
 await p.evaluate(()=>{
  const st=MTStore.read('ptStudio',{});
  st.alunos=[{id:'ac-a',nome:'Ágata Albuquerque',ativo:true,appTokenP:'ac-ta',sexo:'F',altura:165,nasc:'1990-01-01'}, {id:'ac-b',nome:'Bruno Santana',ativo:true,appTokenP:'ac-tb',sexo:'M',altura:180,nasc:'1989-02-02'}, {id:'ac-c',nome:'Célia Rocha',ativo:true,appTokenP:'ac-tc'}];
  st.avaliacoes=[{id:'ac-v1',alunoId:'ac-a',data:'2026-08-01',peso:70},{id:'ac-v2',alunoId:'ac-a',data:'2026-09-01',peso:68},{id:'ac-v3',alunoId:'ac-b',data:'2026-09-02',peso:80}];
  st.questPerguntas=[{id:'ac-p1',sigla:'MOT',titulo:'Motivação',texto:'Como foi a motivação?',tipo:'linear',ops:[]},{id:'ac-p2',sigla:'DOR',titulo:'Dor',texto:'Sentiu dor?',tipo:'linear',ops:[],menosMelhor:true}];
  st.questionarios=[{id:'ac-q1',nome:'Check-in de rotina',perguntas:['ac-p1']},{id:'ac-q2',nome:'Acompanhamento de dor',perguntas:['ac-p2']}];
  st.desafio={nome:'Setembro em movimento',ini:'2026-09-01',fim:'2026-09-30',premio:'Medalha'};
  st.sessoes=[];st.agFixas=[];st.pagamentos=[];st.config=Object.assign({},st.config,{dia1Off:true,zapFilaOff:true});
  localStorage.setItem('mtapp:ptStudio',JSON.stringify(st));window.__ptStudio.render();
  const cloud=window.mockNuvem({aid:'ac-test',tabelas:{app_checkin:[{token:'ac-ta',dia:'2026-09-07',nota:2,texto:'Cansada'},{token:'ac-tb',dia:'2026-09-07',nota:5,texto:'Tudo certo'}],app_quest:[{token:'ac-ta',questionario:'Check-in de rotina',criado:'2026-09-07T12:00:00Z',dados:{pontuacao:2,respostas:[{pergunta:'Motivação',resposta:'Boa'}]}}]},rpc:()=>Promise.resolve({data:{ranking:[{nome:'Bruno Santana',dias:6},{nome:'Ágata Albuquerque',dias:4}]},error:null})});
  MTStore.cloud=()=>cloud;
 });
 const tab = async name=>p.evaluate(name=>document.querySelector('#abas [data-a="'+name+'"]').click(),name);
 const area = async (id,value)=>{if(await p.locator('#'+id).isVisible()) await p.selectOption('#'+id,value);else await p.evaluate(({id,value})=>({avArea:__avAba,qtArea:__qtAba,dsArea:__dsAba})[id](value),{id,value});};
 const select = async(id,value)=>p.evaluate(({id,value})=>{const el=document.getElementById(id);el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));},{id,value});
 const snapshot = ()=>p.evaluate(()=>JSON.stringify(MTStore.read('ptStudio',{}).avaliacoes));
 const avAntes=await snapshot();
 await tab('avaliacoes');
 for(const width of [390,1280]){
  await p.setViewportSize({width,height:844});
  for(const value of ['avaliar','historico']){
   await area('avArea',value);
   eq(await p.evaluate(()=>({sel:avArea.value,shown:[...new Set([...document.querySelectorAll('#vAvaliacoes [data-avsec]')].filter(x=>!x.hidden).map(x=>x.dataset.avsec))]})),{sel:value,shown:[value]},'Avaliações sincroniza área '+width+'px '+value);
  }
 }
 await p.setViewportSize({width:390,height:844});await area('avArea','avaliar');
 ok(await p.locator('label[for="avAlunoBusca"]').count(),'Aluno tem rótulo no campo visível de busca');
 await select('avAluno','ac-a');await p.fill('#avPeso','67');await p.locator('#avFitaBox > summary').click();await p.fill('#avCintura','71');
 await p.locator('#avBiaBox > summary').click();await p.fill('#biaAgua','38');
 await area('avArea','historico');await area('avArea','avaliar');
 eq(await p.inputValue('#avPeso'),'67','Navegar mantém medição em andamento');
 await select('avAluno','ac-a');eq(await p.inputValue('#avPeso'),'67','Mesmo aluno mantém medição');
 await select('avAluno','ac-b');
 eq(await p.evaluate(()=>[avPeso.value,avCintura.value,biaAgua.value]),['','',''],'Trocar aluno limpa peso/fita/bioimpedância alheios');
 eq(await p.inputValue('#avAltura'),'180','Altura vem do novo aluno');
 await area('avArea','historico');await p.fill('#avHistBusca','agata');await p.fill('#avHistDe','2026-09-01');
 eq(await p.locator('#listaAvaliacoes [data-avdet]').count(),1,'Busca ignora acentos');
 await p.locator('#listaAvaliacoes summary').click();
 eq(await p.locator('#listaAvaliacoes [data-avlaudo]').count(),1,'Período limita medições exibidas');
 ok((await p.locator('#listaAvaliacoes').innerText()).includes('-2'),'Comparação mantém medição anterior fora do período');
 await p.fill('#avHistAte','2026-08-01');ok((await p.locator('#listaAvaliacoes').innerText()).includes('data inicial'),'Intervalo invertido explica o erro');
 await p.click('#avHistLimpar');eq(await p.locator('#listaAvaliacoes [data-avlaudo]').count(),3,'Limpar restaura todas as medições');
 eq(await snapshot(),avAntes,'Filtros e navegação não alteram medições');
 await tab('quest');await p.waitForFunction(()=>document.querySelectorAll('#qsLista [data-qsit]').length===3);
 await p.selectOption('#qsFiltro','faltam');eq(await p.locator('#qsLista [data-qsit]:visible').count(),1,'Filtro semanal só pendentes');
 ok((await p.locator('#qsLista').innerText()).includes('Célia'),'Pendência mantém categoria canônica');
 await p.selectOption('#qsFiltro','todos');await p.fill('#qsBusca','agata');eq(await p.locator('#qsLista [data-qsit]:visible').count(),1,'Busca semanal ignora acentos');
 await p.fill('#qsBusca','ninguém');ok((await p.locator('#qsResultados').innerText()).includes('nenhum resultado'),'Filtro sem resultado explica estado');
 await area('qtArea','montar');await p.fill('#qpBusca','motivacao');eq(await p.locator('#qpLista [data-qp-row]:visible').count(),1,'Banco de perguntas pesquisável sem acento');
 await p.locator('#qqNovoBox > summary').click();await p.locator('.qqCheck[value="ac-p2"]').check();
 await area('qtArea','enviar');await select('qeAluno','ac-a');await select('qeQuest','ac-q2');
 await p.evaluate(()=>window.__questPT.render());
 eq(await p.evaluate(()=>[qeAluno.value,qeQuest.value,document.querySelector('.qqCheck[value="ac-p2"]').checked]),['ac-a','ac-q2',true],'Re-render preserva destinatário, questionário e escolha em andamento');
 await p.evaluate(()=>{qeSaida.hidden=false;qeLink.value='https://example.invalid/antigo';qeZap.href='https://example.invalid/antigo';qeAppAviso.hidden=false;qeAppAviso.textContent='Aviso antigo';});
  await select('qeAluno','ac-b');eq(await p.evaluate(()=>[qeSaida.hidden,qeLink.value,qeZap.hasAttribute('href'),qeAppAviso.hidden]),[true,'',false,true],'Trocar destinatário limpa link e avisos antigos');
 for(const button of ['qeGerar','qeApp']){
  await select('qeAluno','ac-a');await select('qeQuest','ac-q1');
  await p.evaluate(()=>{window.__acCloudBack=MTStore.cloud;window.__acPreparaBack=MTStore.preparaAppsSeguros;window.__acPublicaBack=MTStore.publicaAppsSeguros;const c=window.mockNuvem({aid:'ac-test'});window.__acResolve=null;MTStore.cloud=()=>c;MTStore.preparaAppsSeguros=()=>Promise.resolve({raw:localStorage.getItem('mtapp:ptStudio'),revisao:'2026-01-01T00:00:00Z',ciclo:1});MTStore.publicaAppsSeguros=()=>new Promise(resolve=>{window.__acResolve=resolve;});});
  await p.click('#'+button);await p.waitForFunction(()=>typeof window.__acResolve==='function');
  await select('qeAluno','ac-b');
  await p.evaluate(async()=>{window.__acResolve({data:[],error:null});await new Promise(r=>setTimeout(r,0));MTStore.cloud=window.__acCloudBack;MTStore.preparaAppsSeguros=window.__acPreparaBack;MTStore.publicaAppsSeguros=window.__acPublicaBack;});
  eq(await p.evaluate(()=>[qeAluno.value,qeSaida.hidden,qeAppAviso.hidden,qeAviso.textContent]),['ac-b',true,true,''],'Retorno atrasado de '+button+' não repinta envio de outro aluno');
 }
 await area('qtArea','resp');await p.click('#qrAtualizar');await p.waitForSelector('#qRespostas [data-qr-row]');
 await p.fill('#qrBusca','agata');eq(await p.locator('#qRespostas [data-qr-row]:visible').count(),1,'Respostas pesquisáveis por aluno');
 await p.fill('#qrBusca','bruno');eq(await p.locator('#qRespostas [data-qr-row]:visible').count(),0,'Resposta de outro aluno não aparece na busca');
 await tab('desafio');await area('dsArea','config');await p.fill('#dsNome','Rascunho local');await p.fill('#dsPremio','Livro');
 await p.evaluate(()=>window.__desafioPT.render());eq(await p.evaluate(()=>[dsNome.value,dsPremio.value]),['Rascunho local','Livro'],'Re-render não apaga rascunho do desafio');
 await area('dsArea','placar');await area('dsArea','config');eq(await p.inputValue('#dsNome'),'Rascunho local','Navegar mantém edição do desafio');
 await p.click('#dsDescartar');eq(await p.inputValue('#dsNome'),'Setembro em movimento','Descartar restaura desafio salvo');
 await p.click('#dsMes');ok(await p.locator('#dsDescartar').isVisible(),'Preencher mês cria rascunho explícito');await p.click('#dsDescartar');
 await area('dsArea','placar');await p.click('#dsAtualizar');await p.waitForSelector('#dsRanking [data-dsrank]');await p.fill('#dsBusca','agata');
  eq(await p.locator('#dsRanking [data-dsrank]:visible').count(),1,'Busca no placar ignora acento');ok((await p.locator('#dsRanking [data-dsrank]:visible').innerText()).includes('2º'),'Filtrar não recalcula posição no placar');
 await p.evaluate(()=>{window.__acRankingCloud=MTStore.cloud;const c=window.mockNuvem({aid:'ac-test',rpc:()=>new Promise(resolve=>{window.__acRankingResolve=resolve;})});MTStore.cloud=()=>c;window.__desafioPT.ranking();});
 await p.evaluate(async()=>{const st=MTStore.read('ptStudio',{});st.desafio.nome='Novo desafio';localStorage.setItem('mtapp:ptStudio',JSON.stringify(st));window.__acRankingResolve({data:{ranking:[{nome:'Placar antigo',dias:99}]},error:null});await new Promise(r=>setTimeout(r,0));MTStore.cloud=window.__acRankingCloud;});
 ok(!(await p.locator('#dsRanking').textContent()).includes('Placar antigo'),'Retorno do desafio anterior não repinta o placar');
 for(const width of [360,390,1280]){
  await p.setViewportSize({width,height:844});
  for(const [top,id,values] of [['avaliacoes','avArea',['avaliar','historico']],['quest','qtArea',['semana','enviar','montar','resp']],['desafio','dsArea',['config','placar','feed']]]){
   await tab(top);
   for(const value of values){await area(id,value);const layout=await p.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth,over:[...document.querySelectorAll('body *')].filter(x=>{const r=x.getBoundingClientRect();return r.width>0&&r.height>0&&(r.right>innerWidth+1||x.scrollWidth>r.width+4)&&r.left>=0;}).map(x=>({id:x.id||x.className||x.tagName,w:x.getBoundingClientRect().width,scroll:x.scrollWidth})).slice(0,12)}));ok(layout.width<=layout.viewport+1,'Sem overflow '+top+'/'+value+' '+width+'px '+(layout.width>layout.viewport+1?JSON.stringify(layout):''));}
  }
 }
 eq(errors,[],'Nenhum erro JavaScript');eq(network,[],'Nenhuma chamada real ao Supabase');
 console.log(checks+' verificações passaram.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
