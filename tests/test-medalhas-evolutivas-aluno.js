/* Pacotes sintéticos, runtime canônico e armazenamento local; nenhuma escrita no backend. */
const assert=require('node:assert/strict');
let chromium;try{chromium=require('playwright').chromium;}catch(_){chromium=require('/opt/node22/lib/node_modules/playwright').chromium;}
const {comMockNuvem}=require('./_nuvem.js'),BASE=process.env.BASE_URL||'http://127.0.0.1:8765';
global.self=global;require('../app/aluno-skin.js');const M=require('../app/medalhas-core.js');require('../app/aluno-builder.js');
let browser,n=0;function ok(v,m){assert.ok(v,m);n++;console.log('OK '+m);}function eq(v,w,m){assert.deepEqual(v,w,m);n++;console.log('OK '+m);}
const fran={id:'teste-fran',n:'Fran',grupo:'crossfit',icone:'trofeu',metrica:'circuitosNome',filtro:{nome:'Fran'},metas:[1,3,5,10,20],unidade:'registros',criterio:'Resultados completos salvos com o nome Fran, adaptado ou Rx.'};
const defs=[fran,...M.pacote(['treinos-dias','corrida-registros','corrida-distancia','habito-agua','habito-sono','nutri-dias'])];
const D={a:{id:'medalhas-sinteticas',nome:'Aluno Sintético',appTokenP:'token-sintetico-medalhas'},studio:'Teste de medalhas',cfg:{},wodsApp:[],cardiosApp:[],COR:'#7c3aed',COR2:'#5925ba',CORC:'#b395ff',CORE:'#33155c',CORCL1:'#d6c4ff',CORCL2:'#e8ddff',medalhasApp:defs};
// Instrumentação somente do teste: lê o contador fechado e observa a gravação canônica.
function htmlFor(extra={}){return MT_APP_ALUNO.monta({...D,...extra}).replace('window.__cqAbre=cqAbre;','window.__cqAbre=cqAbre;window.__testeCQ=function(){return {n:CQGANHAS.n,tot:CQGANHAS.tot};};window.__testeSv=Sv;window.__testeXP=xpDados;');}
const html=htmlFor();for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim())new Function(m[1]);ok(true,'scripts gerados compilam com runtime isolado e definições selecionadas');
const dados={ptfeitos:{'2026-09-07':1,'2026-09-08':1},ptwodres:{a:[{d:'2026-09-08',n:'Fran',r:'8:00',tp:'fortime',cf:'adp'},{d:'2026-09-09',n:'Fran',r:'7:00',tp:'fortime',cf:'rx'},{d:'2026-09-10',n:'Fran',r:'Não terminou',nf:1}]},ptcardio:[{d:'2026-09-09',n:'Por tempo',m:'corrida',s:600,k:0},{d:'2026-09-10',n:'Corrida',m:'corrida',s:1800,k:5}],pthab:{'2026-09-08':[true,true,true,false]},ptdc:{},ptpeso:{},ptqa:{},ptckh:{}};
(async()=>{
 browser=comMockNuvem(await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/opt/pw-browsers/chromium',args:['--no-sandbox']}));
 const ctx=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/Sao_Paulo',locale:'pt-BR',serviceWorkers:'block'}),p=await ctx.newPage(),errors=[];let posts=0;
 p.on('pageerror',e=>errors.push(e.message));await ctx.route('**/*',r=>{if(r.request().method()==='POST')posts++;return r.request().url()===BASE+'/medalhas-sinteticas.html'?r.fulfill({contentType:'text/html',body:html}):r.abort();});
 await ctx.addInitScript(dados=>{localStorage.setItem('tq_app_token','token-sintetico-medalhas');Object.entries(dados).forEach(([k,v])=>localStorage.setItem(k,JSON.stringify(v)));localStorage.setItem('pttour','{}');localStorage.setItem('ptonb','{"feito":true}');},dados);
 await p.clock.setFixedTime(new Date('2026-09-11T12:00:00-03:00'));await p.goto(BASE+'/medalhas-sinteticas.html');await p.waitForFunction(()=>window.__meAluno&&window.__evSub&&window.__testeCQ);
 await p.evaluate(()=>{__trocaSec('evolucao');__evSub('conq');});
 eq(await p.locator('#cqGrid>[data-me-id]').count(),defs.length,'somente as sete definições publicadas viram famílias no aluno');
 eq(await p.locator('#cqGrid>button:visible').count(),6,'seis medalhas visíveis na grade sem abrir tudo');
 const legacyCount=await p.locator('#cqGrid>[data-cqi]').count();ok(legacyCount>0,'conquistas legadas e seus identificadores permanecem acessíveis');
 ok(await p.locator('#meProxima').isVisible()&&await p.locator('#meProxima').evaluate(e=>e.parentElement.id==='evReconhecimentos'&&!!(e.compareDocumentPosition(document.getElementById('cqGrid'))&Node.DOCUMENT_POSITION_FOLLOWING)),'próximo objetivo fica visível antes da grade, na seção de medalhas');
 const state=await p.evaluate(()=>__meAluno.estados().map(x=>[x.d.id,x.p.valor,x.p.nivel,x.p.proxima]));
 eq(state.find(x=>x[0]==='teste-fran'),['teste-fran',2,1,3],'Fran conta resultados completos adaptados e Rx, excluindo não concluído');
 eq(state.find(x=>x[0]==='corrida-registros')[1],2,'corrida por tempo sem GPS conta como sessão no aluno');
 eq(state.find(x=>x[0]==='corrida-distancia')[1],5,'distância não é inventada na sessão por tempo');
 const fontes=()=>p.evaluate(keys=>Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)])),Object.keys(dados));
 const antes=await fontes(),xp=await p.evaluate(()=>__testeXP()),contagem=await p.evaluate(()=>__testeCQ());
 const soma=await p.evaluate(()=>__meAluno.pinta());eq(soma,{n:6,tot:7},'uma família conquistada conta uma medalha, independente do número de níveis');
 await p.evaluate(()=>{for(let i=0;i<4;i++){__evResumoPinta();__meAluno.pinta();}});eq(await p.evaluate(()=>__testeCQ()),contagem,'repintar não acumula medalhas no retorno ao personal');
 await p.locator('[data-me-id="teste-fran"]').click();ok(await p.locator('#meDetalhe').isVisible(),'toque abre evolução individual em diálogo');
 ok((await p.locator('#meDetalhe').textContent()).includes('Bronze · Nível 1 conquistado')&&(await p.locator('#meDetalhe .me-milestones').textContent()).includes('Prata'),'nível atual e próximos degraus têm nomes visuais distintos');
 await p.locator('#meDetalhe [data-me-pin]').click();ok((await p.locator('#meProxima').textContent()).includes('Fran')&&(await p.locator('#meProxima').textContent()).includes('fixado'),'aluno pode fixar a medalha prioritária');
 eq(await p.evaluate(()=>__testeCQ()),contagem,'fixar objetivo não altera contadores de retorno');
 ok(!(await p.evaluate(()=>__meAluno.chave)).includes(D.a.appTokenP),'chave da preferência não expõe token em texto');
 await p.locator('#meDetalhe [data-me-share]').click();await p.waitForSelector('#artePrev img');ok(await p.locator('#artePrev #arteShare').isVisible(),'compartilhar conquista reaproveita a prévia de arte existente');await p.locator('#arteFecha').click();
 await p.locator('#cqVerMais').click();eq(await p.locator('#cqGrid>button:visible').count(),await p.locator('#cqGrid>button').count(),'expandir mostra novas famílias e todas as medalhas legadas');
 await p.locator('#cqGrid>[data-cqi][data-cqok="1"]').first().click();ok(await p.locator('#cqFull').isVisible(),'medalha legada conserva seu modal anterior');await p.evaluate(()=>{document.getElementById('cqFull').style.display='none';});
 await p.evaluate(()=>{__evSub('corpo');__evSub('conq');});ok((await p.locator('#meProxima').textContent()).includes('Fran'),'navegar entre abas preserva prioridade');
 eq(await fontes(),antes,'consulta, expansão, prioridade e arte não alteram fontes de atividade');eq(await p.evaluate(()=>__testeXP()),xp,'explorar medalhas não concede XP');eq(posts,0,'interações de consulta não enviam atividade para o backend');
 await p.evaluate(()=>{const h=JSON.parse(localStorage.getItem('pthab'));h['2026-09-11']=[true,false,false,false];__testeSv('pthab',h);});eq((await p.evaluate(()=>__meAluno.estados())).find(x=>x.d.id==='habito-agua').p.valor,2,'gravação canônica de hábito atualiza medalhas imediatamente');
 for(const width of [320,390,1280]){await p.setViewportSize({width,height:844});ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'grade sem rolagem horizontal em '+width+'px');await p.evaluate(()=>__meAluno.abre('teste-fran'));ok(await p.locator('#meDetalhe').evaluate(e=>e.scrollWidth<=e.clientWidth+1&&e.getBoundingClientRect().right<=innerWidth),'diálogo cabe em '+width+'px');await p.keyboard.press('Escape');}
 await p.evaluate(()=>{document.documentElement.classList.add('claro');__meAluno.abre('teste-fran');});ok(await p.locator('#meDetalhe').evaluate(e=>getComputedStyle(e).color!==getComputedStyle(e).backgroundColor),'tema claro mantém contraste entre texto e superfície');await p.keyboard.press('Escape');
 eq(errors,[],'sem erros de JavaScript durante evolução, modal, pin, arte e navegação');
 // A ausência do core conserva o documento legado; configuração vazia conserva uma próxima meta geral.
 const saved=global.MT_MEDALHAS;delete global.MT_MEDALHAS;const legacy=htmlFor({medalhasApp:undefined});global.MT_MEDALHAS=saved;
 for(const [name,body,expected] of [['vazio',htmlFor({medalhasApp:[]}),true],['legado',legacy,false]]){const c=await browser.newContext({serviceWorkers:'block'}),q=await c.newPage();await c.route('**/*',r=>r.request().url()===BASE+'/'+name+'.html'?r.fulfill({contentType:'text/html',body}):r.abort());await q.goto(BASE+'/'+name+'.html');await q.waitForFunction(()=>window.__evSub);await q.evaluate(()=>{__trocaSec('evolucao');__evSub('conq');});eq(await q.locator('#meProxima').count(),expected?1:0,name+' preserva comportamento compatível sem pacote');if(!expected)eq(await q.locator('#cqGrid>[data-cqi]').count(),legacyCount,'todas as famílias legadas coincidem com documento sem core');if(expected){eq(await q.locator('[data-me-id]').count(),0,'configuração vazia não ativa catálogo inteiro');ok((await q.locator('#meProxima').textContent()).includes('1'),'configuração vazia ainda oferece próxima meta de treino');}await c.close();}
 await ctx.close();console.log(n+' verificações do aluno com medalhas evolutivas passaram.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
