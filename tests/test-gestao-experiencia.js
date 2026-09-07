/* Consultas financeiras e menu: filtrar não altera saldo nem destinatário. */
const assert=require('assert/strict');
let chromium;try{chromium=require('playwright').chromium;}catch(_){chromium=require('/opt/node22/lib/node_modules/playwright').chromium;}
const {comMockNuvem}=require('./_nuvem.js');
const BASE=process.env.BASE_URL||'http://127.0.0.1:8765';
let browser,checks=0;
function eq(a,b,m){assert.deepEqual(a,b,m);checks++;console.log('OK: '+m);}
function ok(v,m){assert.ok(v,m);checks++;console.log('OK: '+m);}
(async()=>{
 browser=comMockNuvem(await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/opt/pw-browsers/chromium',args:['--no-sandbox']}));
 const ctx=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/Sao_Paulo',locale:'pt-BR',serviceWorkers:'block'}),p=await ctx.newPage(),errors=[],network=[];
 p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.dismiss());
 await ctx.route('**://*.supabase.co/**',r=>{network.push(r.request().url());return r.abort();});
 await p.clock.setFixedTime(new Date('2026-09-07T09:00:00-03:00'));
 await p.goto(BASE+'/demo-personal.html');await p.locator('#btnDemo').click();await p.waitForURL(/personal\.html/);
 await p.waitForFunction(()=>window.__gestaoPT&&document.getElementById('fgHistBusca')&&window.MT_FERRAMENTAS?.ready());
 await p.evaluate(()=>{
  const S=window.MTStore,st=S.read('ptStudio',{});
  st.alunos=[{id:'fin-a',nome:'Ágata Oliveira',ativo:true,valor:200,desde:'2026-01-01'},{id:'fin-b',nome:'Bruno Santos',ativo:true,valor:300,desde:'2026-01-01'}];
  st.pagamentos=Array.from({length:65},(_,i)=>({id:'fin-p'+i,alunoId:i%2?'fin-a':'fin-b',data:(i%2?'2026-08-':'2026-09-')+String(1+i%7).padStart(2,'0'),valor:100+i,forma:['Pix','Cartão','Dinheiro'][i%3],desc:i%2?'Avaliação física':'Massagem'}));
  st.planosPT=[{id:'fin-pl1',nome:'Mensal essencial',valor:200,cobranca:'mes',ciclo:1,treinosSem:3,modalidade:'presencial'},{id:'fin-pl2',nome:'Pacote funcional',valor:500,cobranca:'sessao',pacoteQtd:10,ciclo:1,treinosSem:0}];
  st.contratosPT=[{id:'fin-ct1',alunoId:'fin-a',planoId:'fin-pl1',status:'ativo',inicio:'2026-01-01',diaVenc:5},{id:'fin-ct2',alunoId:'fin-b',planoId:'fin-pl2',status:'encerrado',inicio:'2026-01-01',encerradoEm:'2026-08-01'}];
  st.despesas=[{id:'fin-d1',desc:'Aluguel sala',cat:'Repasse/aluguel',valor:900,data:'2026-01-01',fixa:true},{id:'fin-d2',desc:'Curso prático',cat:'Cursos e formação',valor:150,data:'2026-09-01'},{id:'fin-d3',desc:'Equipamento antigo',cat:'Equipamentos',valor:400,data:'2026-08-01'}];
  st.servicosPT=[{id:'fin-s1',nome:'Avaliação física',valor:120},{id:'fin-s2',nome:'Massagem',valor:90}];
  st.sessoes=[];st.avaliacoes=[];st.config=Object.assign({},st.config,{dia1Off:true,zapFilaOff:true});
  localStorage.setItem('mtapp:ptStudio',JSON.stringify(st));window.__renderPT();
 });
 const snapshot=()=>p.evaluate(()=>{const s=window.MTStore.read('ptStudio',{});return JSON.stringify([s.pagamentos,s.planosPT,s.contratosPT,s.despesas,s.alunos]);});
 const initial=await snapshot();
 async function main(k){if(await p.locator('#btnMenuPt').isVisible()&&!await p.locator('body').evaluate(e=>e.classList.contains('menu-aberto')))await p.locator('#btnMenuPt').click();await p.locator('#abas [data-a="'+k+'"]').click();}
 async function area(k){if(await p.locator('#pgArea').isVisible())await p.locator('#pgArea').selectOption(k);else await p.locator('#pgAbas [data-pga="'+k+'"]').click();}
 await main('pagamentos');
 for(const width of [360,1280]){await p.setViewportSize({width,height:900});for(const k of ['receb','planos','contratos','serv','desp']){await area(k);eq(await p.locator('#pgArea').inputValue(),k,'Área sincronizada '+k+' em '+width+'px');ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Sem overflow '+k+' em '+width+'px');}}
 await p.setViewportSize({width:390,height:844});await area('receb');
 eq(await p.locator('#listaPagamentos .sessao-pt').count(),30,'Histórico começa com30 registros');
 await p.locator('#fgHistMais').click();eq(await p.locator('#listaPagamentos .sessao-pt').count(),60,'Carregar mais alcança registros antes inacessíveis');
 await p.locator('#fgHistMais').click();eq(await p.locator('#listaPagamentos .sessao-pt').count(),65,'Última página completa');ok(!await p.locator('#fgHistMais').isVisible(),'Fim da paginação explícito');
 await p.locator('#fgHistBusca').fill('agata');ok((await p.locator('#listaPagamentos').textContent()).includes('Ágata'),'Busca sem acento encontra nome acentuado');ok(!(await p.locator('#listaPagamentos').textContent()).includes('Bruno'),'Busca exclui outro aluno');
 await p.locator('#fgHistMes').fill('2026-08');await p.locator('#fgHistForma').selectOption('Pix');
 const expect=await p.evaluate(()=>window.MTStore.read('ptStudio',{}).pagamentos.filter(x=>x.alunoId==='fin-a'&&x.data.startsWith('2026-08')&&x.forma==='Pix').map(x=>x.id).sort());
 eq(await p.evaluate(()=>window.__gestaoPT.resultados().map(x=>x.id).sort()),expect,'Nome, mês e forma combinam sobre todos os registros');
 await p.evaluate(()=>{window.MTStore.baixaCSV=(name,rows)=>window.__fgCSV={name,rows};});await p.locator('#fgHistCSV').click();eq(await p.evaluate(()=>window.__fgCSV.rows.length),expect.length+1,'CSV exporta exatamente os resultados filtrados');
 await p.locator('#fgHistBusca').fill('não existe');eq(await p.locator('#listaPagamentos .sessao-pt').count(),0,'Busca vazia não conserva linhas antigas');ok(await p.locator('#fgHistCSV').isDisabled(),'Sem resultados não oferece exportação vazia');
 await p.locator('#fgHistLimpar').click();eq(await p.locator('#listaPagamentos .sessao-pt').count(),30,'Limpar filtros restaura primeira página');
 await p.locator('#pgLancar').click();ok(await p.locator('#fgRecebimento').evaluate(e=>e.open),'Atalho de recebimento abre o formulário');eq(await p.locator('label[for="pAlunoBusca"]').count(),1,'Aluno pesquisável mantém rótulo visível associado');
 await area('contratos');eq(await p.locator('#ctLista [data-ctrm]').count(),1,'Contratos ativos mantêm ação encerrar');await p.locator('#fgContratoStatus').selectOption('encerrado');eq(await p.locator('#ctLista [data-ctrm]').count(),0,'Encerrados não oferecem encerrar novamente');ok((await p.locator('#ctLista').textContent()).includes('Bruno'),'Consulta recupera contrato encerrado');await p.locator('#fgContratoBusca').fill('ÁGATA');eq(await p.locator('#ctLista .sessao-pt').count(),0,'Filtro de contrato combina nome e situação');
 await area('planos');await p.locator('#fgPlanoBusca').fill('funcional');eq(await p.locator('#plLista .sessao-pt').count(),1,'Planos têm busca própria');await p.locator('[data-pldup="fin-pl2"]').click();eq(await p.locator('#plNome').inputValue(),'Cópia de Pacote funcional','Usar modelo inicia uma cópia identificada');eq(await p.locator('#plPacQtd').inputValue(),'10','Modelo preserva unidades do pacote');eq(await snapshot(),initial,'Navegar, filtrar, exportar e preparar cópia não altera dados financeiros');
 await p.locator('#plValor').fill('-50');await p.locator('#plAdd').click();eq(await snapshot(),initial,'Valor negativo não cria plano nem altera contratos');eq(await p.locator('#plValor').inputValue(),'-50','Validação preserva entrada para correção');
 await p.locator('#plValor').fill('500');await p.locator('#plCobranca').selectOption('mes');await p.locator('#plLink').fill('endereço incompleto');await p.locator('#plAdd').click();eq(await snapshot(),initial,'Link inválido não cria plano silenciosamente sem assinatura');
 await area('serv');await p.locator('#fgServicoBusca').fill('avaliacao');eq(await p.locator('#svLista .sessao-pt').count(),1,'Serviços pesquisam sem acento');eq(await p.locator('#svVServ option').count(),2,'Filtro do catálogo não troca opções de venda');
 await area('desp');await p.locator('#fgDespTipo').selectOption('fixa');eq(await p.locator('#dpLista [data-dpdel]').count(),1,'Filtro mensal usa despesas vigentes no período');ok((await p.locator('#fgDespResumo').textContent()).includes('900'),'Filtro mostra subtotal encontrado');const summary=await p.locator('#dpResumo').textContent();await p.locator('#fgDespCat').selectOption('Cursos e formação');eq(await p.locator('#dpLista [data-dpdel]').count(),0,'Categoria combina com recorrência');eq(await p.locator('#dpResumo').textContent(),summary,'Filtro não muda totais gerais do mês');
 await main('relatorios');await p.locator('#relMesInput').fill('2026-08');await p.locator('#relMesInput').dispatchEvent('change');eq(await p.evaluate(()=>window.__relMes.atual()),1,'Seletor de mês usa período canônico dos relatórios');eq(await p.evaluate(()=>window.__gestaoPT.periodo('2099-01')),false,'Mês futuro é recusado sem deslocar relatório');eq(await p.evaluate(()=>window.__relMes.atual()),1,'Rejeição preserva período anterior');await p.locator('#relMesHoje').click();eq(await p.locator('#relMesInput').inputValue(),'2026-09','Voltar ao mês atual sincroniza seletor');
 await p.locator('#btnMenuPt').click();await p.locator('#menuBuscaPt').fill('cobranca');ok(await p.locator('#abas [data-a="pagamentos"]').isVisible(),'Menu encontra área por sinônimo');ok(!await p.locator('#abas [data-a="treinos"]').isVisible(),'Busca do menu reduz opções');await p.evaluate(()=>document.querySelector('#abas [data-a="pagamentos"]').hidden=true);await p.locator('#menuBuscaPt').fill('');ok(!await p.locator('#abas [data-a="pagamentos"]').isVisible(),'Busca não revela área restringida');await p.evaluate(()=>document.querySelector('#abas [data-a="pagamentos"]').hidden=false);await p.locator('#menuBuscaPt').press('Escape');ok(!await p.locator('body').evaluate(e=>e.classList.contains('menu-aberto')),'Escape fecha menu');
 await p.setViewportSize({width:1024,height:900});await p.locator('#btnMenuPt').click();ok(await p.locator('#fecharMenuPt').isVisible(),'Menu recolhível oferece fechar também no tablet');eq(await p.locator('#menuBuscaPt').evaluate(e=>document.activeElement===e),true,'Busca recebe foco no menu do tablet');await p.locator('#menuBuscaPt').fill('fotos');ok(await p.locator('#abas [data-a="imagens"]').isVisible(),'Busca por fotos encontra a galeria');await p.locator('#menuBuscaPt').fill('cobranças');ok(await p.locator('#abas [data-a="pagamentos"]').isVisible(),'Busca reconhece cobranças no plural e com acento');await p.locator('#menuBuscaPt').press('Escape');ok(!await p.locator('body').evaluate(e=>e.classList.contains('menu-aberto')),'Escape fecha menu no tablet');
 eq(await snapshot(),initial,'Todos os filtros e atalhos preservam a fonte de dados');eq(errors,[],'Sem erros JavaScript');eq(network,[],'Nenhuma chamada real ao Supabase');console.log('PASSOU: '+checks+' verificações de Gestão');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
