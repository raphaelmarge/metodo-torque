/* Evolução: consulta global e sessões reais, sem escrever cargas ao filtrar. */
const assert=require('assert/strict'),fs=require('fs'),path=require('path');
let chromium;try{chromium=require('playwright').chromium;}catch(_){chromium=require('/opt/node22/lib/node_modules/playwright').chromium;}
const BASE=process.env.BASE_URL||'http://127.0.0.1:8765';
let browser,checks=0;function ok(v,m){assert.ok(v,m);checks++;console.log('OK: '+m);}function eq(a,b,m){assert.deepEqual(a,b,m);checks++;console.log('OK: '+m);}
(async()=>{
 global.self=global;global.MT_CLOUD={url:'https://evolucao.invalid',anonKey:'teste'};
 require('../app/aluno-skin.js');require('../app/aluno-builder.js');
 const day=n=>{const d=new Date(2026,8,7,12);d.setDate(d.getDate()-n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
 const registros={
  'Supino reto':[{d:day(100),kg:80,r:3},{d:day(40),kg:60,r:5},
   {d:day(0),g:2,i:'0:0:0',serie:1,feito:true,kg:20,r:5},{d:day(0),g:2,i:'0:0:1',serie:2,feito:true,kg:25,r:8},{d:day(0),g:2,i:'0:0:2',serie:3,feito:true,kg:30,r:10},
   {d:day(0),g:2,i:'0:0:3',serie:4,feito:false,kg:999,r:999},{d:day(0),g:2,i:'1:0:0',serie:1,feito:true,kg:15,r:10}],
  'Elevação lateral':[{d:day(0),g:2,i:'0:1:0',serie:1,feito:true,kg:8,r:12}],
  'Só anotado':[{d:day(0),g:2,i:'0:2:0',serie:1,feito:false,kg:800,r:10}],
  'Histórico longo':Array.from({length:14},(_,i)=>({d:day(i+1),kg:10+i,r:10})),
  'Limite de dias':[{d:day(29),kg:1,r:1},{d:day(30),kg:2,r:1},{d:day(89),kg:3,r:1},{d:day(90),kg:4,r:1}],
  "Remada d'água":[{d:day(0),kg:12,r:8}]
 };
 const names=Object.keys(registros),items=names.map((nome,i)=>({nome,grupo:i===0?'Peito':i===1?'Ombro':'Costas',series:4,reps:'10',descanso:60}));
 const D={a:{id:'evo-test',nome:'Aluno Evolução'},studio:'Studio teste',cfg:{},avs:[],fichasApp:[{titulo:'A — Teste',itens:items}],guiaFichasP:[{n:'A — Teste',it:names.map(e=>({e,s:4,r:'10',d:60}))}],fexs:names.map(n=>({n,s:4})),atualizador:'',wodsApp:[],cardiosApp:[]};
 Object.assign(D,{COR:'#7c3aed',COR2:'#5b21b6',CORC:'#a78bfa',CORE:'#4c1d95',CORCL1:'#ddd6fe',CORCL2:'#ede9fe',PAL:['#0d0c10','#111017','#18151f','#1e1927','#25202f','#2b2536','#312b3d','#383045','#40374e','#473f58','#504660','#594e6a','#625874']});
 const html=global.MT_APP_ALUNO.monta(D);
 for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim())new Function(m[1]);ok(true,'Todos os scripts do app gerado compilam');
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/opt/pw-browsers/chromium',args:['--no-sandbox']});
 const ctx=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/Sao_Paulo',locale:'pt-BR',serviceWorkers:'block'}),page=await ctx.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await ctx.route('**/*',r=>r.request().url()===BASE+'/evolucao-test.html'?r.fulfill({contentType:'text/html',body:html}):r.abort());
 await ctx.addInitScript(registros=>{localStorage.setItem('ptdc',JSON.stringify(registros));localStorage.setItem('ptfeitos',JSON.stringify({'2026-09-07':1,'2026-09-06':1,'2026-09-05':1,'2026-08-27':1}));localStorage.setItem('ptmapv','"ano"');localStorage.setItem('pttour','{}');localStorage.setItem('ptonb','{"feito":true}');},registros);
 await page.clock.setFixedTime(new Date('2026-09-07T12:00:00Z'));await page.goto(BASE+'/evolucao-test.html');await page.waitForFunction(()=>window.__cgEvolucao&&window.__evSub);
 const fontesResumo=()=>page.evaluate(()=>Object.fromEntries(['ptdc','ptfeitos','pthab','ptpeso','ptrpe'].map(k=>[k,localStorage.getItem(k)])));
 const resumoInicial=await fontesResumo();
 await page.evaluate(()=>{window.__trocaSec('evolucao');window.__evSub('conq');});
 eq(await page.locator('#evAbas [data-evsub-bt=conq]').textContent(),'Resumo','Resumo mantém a rota conq existente');
 ok(await page.locator('#evTopoNv').isVisible()&&await page.locator('#evXp').isVisible()&&await page.locator('#evNvNum').isVisible(),'Nível e XP aparecem imediatamente no cabeçalho do Resumo');
 const legendaXp=page.locator('#evTopoNv').getByText(/treino ou cardio = 10 XP/);
 ok(await legendaXp.count()===1&&await legendaXp.evaluate(e=>getComputedStyle(e).display==='none'&&e.getBoundingClientRect().height===0),'Explicação de como ganhar XP permanece no código, mas não aparece nem ocupa espaço no cabeçalho');
 ok(!await page.locator('#evTopoAlt').isVisible(),'Cabeçalho alternativo não disputa espaço com o nível no Resumo');
 eq(await page.locator('#evNvNum').textContent(),await page.locator('#nvNum').textContent(),'Nível destacado conserva o valor canônico');
 ok(await page.locator('#cqTiles').isVisible()&&await page.locator('#cqGraf').isVisible(),'Constância e semanas continuam acessíveis depois das medalhas');
 eq(await page.locator('#evReconhecimentos>h2').textContent(),'Suas medalhas','Medalhas têm título próprio e visível');
 ok(await page.locator('#evReconhecimentos').evaluate(e=>e.tagName==='SECTION'&&!e.closest('details')),'Medalhas ficam em seção permanente, sem acordeão externo');
 ok(await page.evaluate(()=>{const ids=['evTopoNv','evReconhecimentos','evResumoTitulo','cqTiles','cqGraf','evCalendario'];return ids.every((id,i)=>!i||!!(document.getElementById(ids[i-1]).compareDocumentPosition(document.getElementById(id))&Node.DOCUMENT_POSITION_FOLLOWING));}),'Leitura segue nível, medalhas, constância, semanas e calendário');
 eq(await page.locator('#cqTiles>div').nth(0).locator('b').textContent(),'3 dias','Sequência mantém os dias realizados');
 eq(await page.locator('#cqTiles>div').nth(1).locator('b').textContent(),'3','Total do mês mantém a conta existente');
 eq(await page.locator('#evResumo').getAttribute('data-evsub'),'conq','Cartão reorganizado conserva classificação Evolução');
 ok(await page.locator('#evCalendario').isVisible()&&await page.locator('#evCalendarioAno').isVisible(),'Calendário mensal e histórico anual aparecem juntos mesmo com preferência legada Ano');
 ok(await page.evaluate(()=>['evCalendario','evCalendarioAno'].every(id=>{const e=document.getElementById(id);return e.tagName==='SECTION'&&!e.closest('details')&&!e.querySelector('summary');})),'Os dois calendários são seções abertas, sem controles retráteis');
 eq(await page.locator('#evCalendario>h2').textContent(),'Calendário mensal','Calendário mensal tem título próprio');
 eq(await page.locator('#evCalendarioAno>h2').textContent(),'Histórico anual','Histórico anual tem título próprio');
 eq(await page.locator('#mapVm,#mapVa').count(),0,'Não há alternância que esconda um dos calendários');
 ok(await page.locator('#cqGrid').isVisible()&&!await page.locator('#nvCard').isVisible(),'Grade de medalhas aparece sem duplicar o cartão de nível');
 eq(await page.locator('#evTopo #evXp').count(),1,'XP permanece no cabeçalho nativo da Evolução');
 eq(await page.locator('#cqGrid>button:visible').count(),6,'As seis primeiras medalhas aparecem sem interação');
 eq(await page.locator('#cqVerMais').getAttribute('aria-controls'),'cqGrid','Expansão aponta para a grade de medalhas');
 eq(await page.locator('#cqVerMais').getAttribute('aria-expanded'),'false','Estado inicial informa que há medalhas recolhidas');
 const medalhasIniciais=await page.locator('#cqGrid>button').evaluateAll(bs=>bs.map(b=>({indice:b.dataset.cqi,conquistada:b.dataset.cqok,texto:b.textContent})));
 const ids=['cqTiles','cqGraf','mapaAno','evCalendario','evCalendarioAno','mapaHistoricoAno','cqGrid','cqVerMais','evTopoNv','evRing','evNvNum','evXp','evFalta','evReconhecimentos','evResumoTitulo','retroCard','retroShare','retroFecha','btnCardStories'];
 ok(await page.evaluate(ids=>ids.every(id=>document.querySelectorAll('#'+id).length===1),ids),'Todos os hooks preservados têm ID único');
 await page.evaluate(ids=>{window.__evoTestNodes=ids.map(id=>document.getElementById(id));},ids);
 eq(await page.locator('#mapaAnoRol div[title]').count(),364,'Histórico anual conserva52 semanas completas, com364 dias');
 ok(/setembro de 2026/i.test(await page.locator('#mapaAno').textContent())&&await page.locator('#mapProx').isDisabled(),'Mês atual inclui o ano e bloqueia avançar para o futuro');
 ok(await page.locator('#mapaAnoRol').evaluate(e=>{const d=e.querySelector('[title="2026-09-07"]').getBoundingClientRect(),r=e.getBoundingClientRect();return d.left>=r.left-1&&d.right<=r.right+1;}),'Mapa anual abre mostrando a semana atual');
 const anualInicial=await page.locator('#mapaAnoRol').evaluate(e=>{e.scrollLeft=-120;window.__evoAnual=e;return{pos:e.scrollLeft,html:e.innerHTML};});
 await page.evaluate(()=>{window.__evoMapWrites=0;window.__evoSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='ptmapv')window.__evoMapWrites++;return window.__evoSetItem.call(this,k,v);};});
 await page.locator('#mapAnt').click();eq(await page.evaluate(()=>window.__mapaMes.mes()),1,'Mês anterior seleciona agosto');
 eq(await page.evaluate(()=>document.activeElement.id),'mapAnt','Navegação mensal conserva o foco da seta após repintar os dias');
 ok(/agosto de 2026/i.test(await page.locator('#mapaAno').textContent())&&await page.locator('#mapaAno [data-cal-dia]').count()===31,'Agosto mostra ano e31 dias');
 eq(await page.locator('#mapaAnoRol').evaluate(e=>({pos:e.scrollLeft,html:e.innerHTML})),anualInicial,'Mudar o mês preserva dados e posição do histórico anual');
 ok(await page.locator('#mapaAnoRol').evaluate(e=>e===window.__evoAnual),'Navegação mensal não substitui o histórico anual');
 await page.evaluate(()=>{window.__evSub('corpo');window.__evSub('conq');});
 ok(await page.locator('#mapaAno').isVisible()&&await page.locator('#mapaAnoRol').isVisible()&&await page.evaluate(()=>window.__mapaMes.mes())===1,'Voltar ao Resumo mantém ambos os calendários e o mês escolhido');
 eq(await page.locator('#mapaAnoRol').evaluate(e=>({pos:e.scrollLeft,html:e.innerHTML})),anualInicial,'Voltar à aba preserva dados e posição escolhida do histórico anual');
 await page.locator('#mapProx').click();
 ok(await page.evaluate(()=>window.__mapaMes.mes())===0&&await page.locator('#mapProx').isDisabled(),'Próximo mês retorna ao atual e impede ultrapassá-lo');
 await page.evaluate(()=>{for(let i=0;i<9;i++)document.getElementById('mapAnt').click();});
 ok(/dezembro de 2025/i.test(await page.locator('#mapaAno').textContent()),'Mês anterior atravessa o limite do ano');
 await page.locator('#mapProx').click();ok(/janeiro de 2026/i.test(await page.locator('#mapaAno').textContent()),'Próximo mês atravessa dezembro para janeiro do ano seguinte');
 await page.evaluate(()=>{for(let i=0;i<23;i++)document.getElementById('mapAnt').click();});
 ok(/fevereiro de 2024/i.test(await page.locator('#mapaAno').textContent())&&await page.locator('#mapaAno [data-cal-dia]').count()===29,'Fevereiro bissexto conserva os29 dias no ano correto');
 await page.evaluate(()=>{for(let i=0;i<31;i++)document.getElementById('mapProx').click();});
 eq(await page.evaluate(()=>localStorage.getItem('ptmapv')),'"ano"','Navegar meses não regrava a preferência legada');
 eq(await page.evaluate(()=>{Storage.prototype.setItem=window.__evoSetItem;return window.__evoMapWrites;}),0,'Nenhuma navegação escreve ptmapv, nem mesmo o mesmo valor legado');
 eq(await fontesResumo(),resumoInicial,'Consultar ambos os calendários não modifica os dados de evolução');
 await page.waitForFunction(()=>document.getElementById('evXp').textContent===document.getElementById('xpNum').textContent+' XP');eq(await page.locator('#evXp').textContent(),(await page.locator('#xpNum').textContent())+' XP','XP visível conserva o valor canônico após a animação');
 ok(await page.locator('#evFalta').isVisible()&&await page.locator('#evFalta').evaluate(e=>/^faltam \d+ pro nível \d+$/.test(e.textContent)&&document.getElementById('nvCard').textContent.includes(e.textContent)),'Progresso até o próximo nível permanece visível e igual ao cálculo existente');
 await page.locator('#cqVerMais').click();ok(await page.locator('#cqGrid>button').nth(6).isVisible(),'Ver todas alcança as medalhas além das seis iniciais');
 eq(await page.locator('#cqVerMais').getAttribute('aria-expanded'),'true','Expansão das medalhas atualiza o estado acessível');
 eq(await page.locator('#cqGrid>button:visible').count(),medalhasIniciais.length,'Expandir revela todas as medalhas existentes');
 await page.locator('#cqGrid>button').first().click();ok(await page.locator('#cqFull').isVisible(),'Medalha continua abrindo o modal');await page.locator('#cqVolta').click();ok(!await page.locator('#cqFull').isVisible(),'Voltar fecha a medalha sem perder o resumo');
 await page.evaluate(()=>window.__evSub('corpo'));ok(await page.locator('#evTopoAlt').isVisible()&&!await page.locator('#evReconhecimentos').isVisible(),'Corpo conserva seu cabeçalho e não exibe medalhas de outra subaba');
 await page.evaluate(()=>window.__evSub('conq'));ok(await page.locator('#evTopoNv').isVisible()&&await page.locator('#cqGrid>button').nth(6).isVisible()&&await page.locator('#cqVerMais').getAttribute('aria-expanded')==='true','Navegar preserva expansão das medalhas e restaura o nível no topo');
 ok(await page.evaluate(ids=>ids.every((id,i)=>document.getElementById(id)===window.__evoTestNodes[i]),ids),'Repinturas preservam os nós e eventos existentes');
 await page.locator('#cqVerMais').click();
 eq(await page.locator('#cqGrid>button:visible').count(),6,'Mostrar menos volta às seis medalhas sem esconder toda a seção');
 eq(await page.locator('#cqVerMais').getAttribute('aria-expanded'),'false','Recolher atualiza o estado acessível');
 await page.waitForFunction(()=>{const r=document.getElementById('evTopoNv').getBoundingClientRect();return r.top>=-1&&r.bottom<innerHeight;});
 ok(await page.locator('#evTopoNv').evaluate(e=>e.getBoundingClientRect().top<innerHeight/4),'Recolher retorna ao nível no topo da Evolução');
 await page.evaluate(()=>{window.__evSub('cargas');window.__evSub('conq');});
 eq(await page.locator('#cqGrid>button:visible').count(),6,'Navegar também preserva medalhas parcialmente recolhidas');
 eq(await page.locator('#cqGrid>button').evaluateAll(bs=>bs.map(b=>({indice:b.dataset.cqi,conquistada:b.dataset.cqok,texto:b.textContent}))),medalhasIniciais,'Expandir, recolher e navegar não alteram medalhas nem seus valores');
 eq(await fontesResumo(),resumoInicial,'Consultar nível e medalhas não altera registros, frequência, hábitos, peso ou esforço');
 await page.locator('#btnCardStories').click();ok(await page.locator('#artePrev').isVisible(),'Compartilhar progresso abre a prévia local existente');await page.locator('#arteFecha').click();
 ok(await page.locator('#retroCard').evaluate(e=>getComputedStyle(e).display==='none'&&e.getBoundingClientRect().height===0),'Card mensal fica oculto mesmo com dados do mês anterior');await page.evaluate(()=>{window.__retro();window.__evSub('corpo');window.__evSub('conq');});ok(!await page.locator('#retroCard').isVisible()&&await page.locator('#btnCardStories').isVisible(),'Repintar e navegar mantêm o card mensal oculto e compartilhar progresso disponível');
 await page.evaluate(()=>{const f=JSON.parse(localStorage.getItem('ptfeitos'));f['2026-09-04']=1;localStorage.setItem('ptfeitos',JSON.stringify(f));window.__evSub('corpo');window.__evSub('conq');});
 eq(await page.locator('#cqTiles>div').nth(1).locator('b').textContent(),'4','Retornar ao Resumo atualiza a frequência salva');
 eq(await page.locator('#cqTiles>div').nth(0).locator('b').textContent(),'4 dias','Retornar ao Resumo atualiza a sequência salva');
 await page.evaluate(()=>{window.__evSub('cargas');window.__pintaCargas();});
 const snapshot=await page.evaluate(()=>localStorage.getItem('ptdc'));
 eq(await page.locator('#cgPeriodo').inputValue(),'90','Começa nos últimos90 dias');
 eq(await page.locator('#evCargas [data-cgbusca]').count(),1,'Busca global possui um único campo estável');
 await page.locator('#cgBusca').fill('elevacao');eq(await page.locator('[data-cgex]').count(),1,'Busca sem acento atravessa todos os grupos');ok((await page.locator('[data-cgex]').textContent()).includes('Elevação lateral'),'Resultado encontrado no grupo correto');
 ok(await page.locator('#cgBusca').evaluate(e=>document.activeElement===e),'Filtrar preserva o foco do campo');
 await page.locator('[data-cgab="Ombro"]').click();eq(await page.locator('[data-cgex]').count(),0,'Grupo pode ser recolhido com busca ativa');await page.locator('[data-cgab="Ombro"]').click();eq(await page.locator('[data-cgex]').count(),1,'Grupo reabre sem apagar busca');
 await page.locator('#cgBusca').fill("Remada d'água");await page.locator('[data-cgex]').click();ok(await page.locator('#cgHistorico').isVisible(),'Nome com apóstrofo abre seu histórico sem colidir com outro exercício');
 await page.locator('#cgBusca').fill('supino');await page.locator('[data-cgex]').click();
 eq(await page.locator('[data-cg-dia]').count(),2,'Sete registros de três sessões viram dois dias no gráfico');
 eq(await page.locator('[data-cg-dia="2026-09-07"] b').textContent(),'30','Gráfico usa o máximo concluído do dia, sem anotação999');
 eq(await page.locator('.ev793-session').count(),3,'Duas fichas no mesmo dia continuam sessões separadas');
 ok((await page.locator('.ev793-stats').textContent()).includes('80 kg'),'Máxima geral preserva registro anterior ao período');
 ok((await page.locator('.ev793-stats').textContent()).includes('88 kg'),'1RM mantém Epley do recorde geral');
 const sessoes=await page.evaluate(()=>window.__cgEvolucao.dados().Peito.exs[0].sessoes.map(s=>({d:s.d,fi:s.fi,volume:s.volume,pend:s.anotadas})));
 eq(sessoes.find(s=>s.d==='2026-09-07'&&s.fi==='0').volume,600,'Volume soma20×5+25×8+30×10 realizados');
 eq(sessoes.find(s=>s.d==='2026-09-07'&&s.fi==='1').volume,150,'Outra ficha não mistura volume da primeira');
 eq(sessoes.find(s=>s.d==='2026-09-07'&&s.fi==='0').pend,1,'Anotação ainda não concluída permanece identificada no histórico');
 eq(await page.evaluate(()=>window.__seriesAluno.volume(0,'2026-09-07')),792,'Cálculo canônico do player segue preservado, sem inventar volume das séries restantes');
 await page.locator('.ev793-session').nth(1).locator('summary').click();ok((await page.locator('.ev793-session').nth(1).textContent()).includes('Anotada · não concluída'),'Expandir sessão distingue anotação de série concluída');
 await page.evaluate(()=>window.__pintaCargas());ok(await page.locator('.ev793-session').nth(1).evaluate(e=>e.open),'Atualizar o histórico conserva sessão aberta');
 await page.locator('#cgPeriodo').selectOption('30');eq(await page.locator('.ev793-session').count(),2,'30 dias remove somente as sessões antigas');
 await page.locator('#cgPeriodo').selectOption('todo');eq(await page.locator('.ev793-session').count(),4,'Todo o histórico recupera a anotação legada');
 eq(await page.evaluate(()=>window.__metaCarga.max('Supino reto')),80,'Filtro não altera fonte da meta');
 const limites=async periodo=>{await page.locator('#cgPeriodo').selectOption(periodo);return page.evaluate(()=>Object.values(window.__cgEvolucao.dados()).flatMap(g=>g.exs).find(e=>e.n==='Limite de dias').sessoes.length);};
 eq(await limites('30'),1,'30 dias inclui hoje−29 e exclui hoje−30');eq(await limites('90'),3,'90 dias inclui hoje−89 e exclui hoje−90');
 await page.locator('#cgBusca').fill('Histórico longo');await page.locator('[data-cgex]').click();eq(await page.locator('.ev793-session').count(),10,'Histórico começa com10 sessões');await page.locator('#cgMais').click();eq(await page.locator('.ev793-session').count(),14,'Ver mais alcança todas as sessões');
 await page.locator('#cgBusca').fill('Só anotado');await page.locator('[data-cgex]').click();eq(await page.locator('[data-cg-dia]').count(),0,'Exercício apenas anotado não produz gráfico');eq(await page.evaluate(()=>window.__maxPorExercicio().some(x=>x.n==='Só anotado')),false,'Exercício apenas anotado não produz recorde');
 eq(await page.locator('.ev793-stats b').allTextContents(),['—','—'],'Ausência de máxima e1RM não vira zero realizado');
 await page.locator('#cgBusca').fill('nenhum-exercicio');eq(await page.locator('[data-cgex]').count(),0,'Busca vazia não conserva outro exercício aberto');ok((await page.locator('#cgBox').textContent()).includes('Nenhum exercício'),'Resultado vazio explica como recuperar a lista');
 await page.locator('#cgBusca').fill('supino');await page.locator('#cgPeriodo').selectOption('30');await page.evaluate(()=>{window.__evSub('conq');window.__evSub('cargas');});eq(await page.locator('#cgBusca').inputValue(),'supino','Navegar conserva busca');eq(await page.locator('#cgPeriodo').inputValue(),'30','Navegar conserva período');
 eq(await page.evaluate(()=>localStorage.getItem('ptdc')),snapshot,'Busca, filtro, expansão e gráficos não modificam histórico');
 ok(!await page.locator('#cgMetas').evaluate(e=>e.open)&&!await page.locator('#cgEsforco').evaluate(e=>e.open),'Meta e esforço começam recolhidos e acessíveis');
 ok(!await page.locator('#recBox details').evaluate(e=>e.open),'Recordes começam recolhidos em Cargas');await page.locator('#recBox summary').click();await page.evaluate(()=>window.__pintaCargas());ok(await page.locator('#recBox details').evaluate(e=>e.open),'Recordes preservam abertura após atualização');
 await page.evaluate(()=>window.__evSub('corpo'));ok(!await page.locator('#recBox').isVisible(),'Recordes não aparecem fora da aba Cargas');await page.evaluate(()=>window.__evSub('cargas'));
 const mistura=await page.evaluate(()=>window.__cgEvolucao.sessoes([{d:'2026-09-07',g:1,i:'0:0',kg:99,r:10},{d:'2026-09-07',g:2,i:'0:0:0',serie:1,feito:true,kg:20,r:5},{d:'2026-09-07',g:2,i:'0:0:0',serie:1,feito:true,kg:22,r:5},{d:'2026-09-07',kg:10,r:2}]).find(s=>s.fi==='0').volume);
 eq(mistura,110,'Séries substituem legado do mesmo slot e duplicação de slot usa o último registro');
 await page.evaluate(()=>{window.__gGrava('Supino reto',22,5,'0:0:0');window.__pintaCargas();});eq(await page.evaluate(()=>window.__cgEvolucao.dados().Peito.exs[0].sessoes.find(s=>s.fi==='0').volume),610,'Editar pelo gravador existente atualiza apenas a série correta');
 if(await page.locator('[data-cgex]').getAttribute('aria-expanded')!=='true')await page.locator('[data-cgex]').click();
 for(const width of [320,390])for(const claro of [false,true]){await page.setViewportSize({width,height:844});await page.evaluate(claro=>{document.documentElement.classList.toggle('claro',claro);scrollTo(0,0);},claro);await page.waitForTimeout(550);ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Sem overflow em'+width+'px '+(claro?'claro':'escuro'));if(process.env.EVO_CAPTURE_DIR){fs.mkdirSync(process.env.EVO_CAPTURE_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.EVO_CAPTURE_DIR,'evolucao-'+width+'-'+(claro?'claro':'escuro')+'.png')});}}
 await page.evaluate(()=>window.__evSub('conq'));
 for(const width of [320,390])for(const claro of [false,true]){
  await page.setViewportSize({width,height:844});if(await page.locator('#cqVerMais').getAttribute('aria-expanded')==='true')await page.locator('#cqVerMais').click();
  await page.evaluate(claro=>{document.documentElement.classList.toggle('claro',claro);scrollTo(0,0);},claro);await page.waitForTimeout(550);
  ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Resumo sem overflow em '+width+'px '+(claro?'claro':'escuro'));
  ok(await page.locator('#evTopoNv').isVisible()&&await page.locator('#evXp').isVisible()&&await page.locator('#evFalta').isVisible()&&!await legendaXp.isVisible()&&await page.locator('#cqGrid>button:visible').count()===6,'Nível, XP, progresso e seis medalhas visíveis, sem explicação de pontos, em '+width+'px '+(claro?'claro':'escuro'));
  if(process.env.EVO_CAPTURE_DIR)await page.screenshot({path:path.join(process.env.EVO_CAPTURE_DIR,'resumo-'+width+'-'+(claro?'claro':'escuro')+'.png')});
  ok(await page.locator('#mapaAno').isVisible()&&await page.locator('#mapaAnoRol').isVisible(),'Mês e ano permanecem abertos em '+width+'px '+(claro?'claro':'escuro'));
  ok(await page.locator('#mapaAno .ev800-map-nav button').evaluateAll(bs=>bs.every(b=>{const r=b.getBoundingClientRect();return r.width>=44&&r.height>=44;})),'Setas do calendário mantêm alvos de toque de44px em '+width+'px');
  await page.locator('#cqVerMais').click();
  ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Calendário e medalhas expandidos sem overflow em '+width+'px '+(claro?'claro':'escuro'));
 }
 eq(errors,[],'Nenhum erro JavaScript');console.log('PASSOU: '+checks+' verificações de Evolução');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
