/* Fluxo real de cancelamento/devolução com fixtures sintéticas. Nenhuma API financeira. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let chromium;try{chromium=require('playwright').chromium;}catch(_){try{chromium=require('./ci/node_modules/playwright').chromium;}catch(_){chromium=require('/opt/node22/lib/node_modules/playwright').chromium;}}
const {comMockNuvem}=require('./_nuvem');
let browser,n=0;
function ok(x,m){assert.ok(x,m);n++;console.log('OK '+m);}
function eq(x,y,m){assert.deepEqual(x,y,m);n++;console.log('OK '+m);}
(async()=>{
 const launch={args:['--no-sandbox']};if(process.env.CHROMIUM_PATH)launch.executablePath=process.env.CHROMIUM_PATH;else if(fs.existsSync('/opt/pw-browsers/chromium'))launch.executablePath='/opt/pw-browsers/chromium';
 browser=comMockNuvem(await chromium.launch(launch));
 const context=await browser.newContext({viewport:{width:1280,height:920},timezoneId:'America/Sao_Paulo',locale:'pt-BR',serviceWorkers:'block',acceptDownloads:true});
 const ROOT=path.resolve(__dirname,'..'),BASE=(process.env.BASE_URL||'http://torque-financeiro.test').replace(/\/+$/,''),errors=[];
 const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png','.webp':'image/webp'};
 await context.route('**/*',route=>{
  const u=new URL(route.request().url());if(u.origin!==BASE)return route.abort();
  const file=path.resolve(ROOT,'.'+decodeURIComponent(u.pathname));
  if(!file.startsWith(ROOT+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
  return route.fulfill({contentType:mime[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
 });
 const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.dismiss());
 await p.clock.setFixedTime(new Date('2026-09-14T13:00:00-03:00'));
 await p.goto(BASE+'/demo-personal.html');await p.click('#btnDemo');await p.waitForURL(/personal\.html/);await p.waitForFunction(()=>window.__ptStudio&&window.MT_ESTORNOS);
 await p.evaluate(()=>{
  const s=MTStore.read('ptStudio',{});
  s.alunos=[{id:'a',nome:'Aluno Sintético A',ativo:true,modo:'sessao',valor:100,pacote:{total:10,usadas:2,renova:true}}, {id:'b',nome:'Aluno Sintético B',ativo:true,modo:'mes',valor:250}, {id:'auto',nome:'Aluno Cobrança Sintética',ativo:true,modo:'mes',valor:100,assinaturaAs:'assinatura-ficticia'}];
  s.pagamentos=[{id:'p1',alunoId:'a',data:'2026-09-01',valor:600,forma:'Pix',tipoRecebimento:'aulas'}, {id:'p2',alunoId:'b',data:'2026-08-01',valor:250,forma:'Dinheiro',tipoRecebimento:'aulas'}, {id:'gateway',alunoId:'auto',data:'2026-09-01',valor:100,forma:'Cartão',eventoId:'evento-ficticio'}];
  s.contratosPT=[{id:'c-a',alunoId:'a',status:'ativo',inicio:'2026-09-01',modo:'sessao',valor:100}];s.planosPT=[];
  s.sessoes=[{id:'feita',alunoId:'a',data:'2026-09-10',hora:'08:00',feita:true}, {id:'futura',alunoId:'a',data:'2026-09-15',hora:'09:00',feita:false}, {id:'futura-b',alunoId:'b',data:'2026-09-15',hora:'10:00',feita:false}];
  s.agFixas=[];s.treinosV2={};s.pagamentosAuditoria=[];s.estornosPT=[];s.cancelamentosPT=[];
  s.config=Object.assign({},s.config,{dia1Off:true,zapFilaOff:true,reguaOff:true});
  localStorage.setItem('mtapp:ptStudio',JSON.stringify(s));window.__renderPT();window.__originalPayment=JSON.stringify(s.pagamentos[0]);
  window.__externalCalls=[];window.open=u=>{__externalCalls.push(u);return {};};window.alert=()=>{};
 });
 const st=()=>p.evaluate(()=>MTStore.read('ptStudio',{}));
 const dlg=()=>p.locator('dialog.pt-refund-dialog');
 const nav=()=>p.evaluate(()=>document.querySelector('#abas [data-a="pagamentos"]').click());
 async function open(id){await nav();await p.locator('#listaPagamentos [data-pt-estorno="'+id+'"]').click();}
 async function request(id,value,reason='Devolução acordada com o cliente'){
  await open(id);await dlg().locator('[name=valor]').fill(String(value));await dlg().locator('[name=motivo]').fill(reason);await dlg().locator('[data-revisar]').click();
 }
 async function confirmManual(rid,date,ref='Comprovante sintético 123'){
  await dlg().locator('[data-pt-refund-confirm="'+rid+'"]').click();await dlg().locator('[name=data]').fill(date);await dlg().locator('[name=comprovanteRef]').fill(ref);await dlg().locator('[name=confirmo]').check();
 }
 await request('p1',150);
 eq((await st()).estornosPT.length,0,'conferência inicial não grava nem devolve dinheiro');
 ok((await dlg().locator('[data-resumo]').innerText()).includes('pendente'),'revisão informa que o pedido fica pendente');
 await p.evaluate(()=>{window.__writeOriginal=MTStore.write;MTStore.write=()=>false;});await dlg().locator('[data-confirmar]').click();
 ok(await dlg().isVisible(),'erro de persistência mantém o formulário');eq((await st()).estornosPT.length,0,'erro não modifica pagamentos/devoluções');
 eq(await dlg().locator('[name=valor]').inputValue(),'150','erro mantém o valor preenchido');
 await p.evaluate(()=>MTStore.write=__writeOriginal);await dlg().locator('[data-confirmar]').click();
 const r1=(await st()).estornosPT[0].id;eq((await st()).estornosPT[0].status,'pendente','pedido é salvo como pendente');
 eq(await p.evaluate(()=>__dashDados('2026-09').fat),700,'pendência não reduz o caixa');
 await open('p1');await confirmManual(r1,'2026-09-14');await dlg().locator('[data-revisar]').click();await dlg().locator('[data-confirmar]').click();
 eq((await st()).estornosPT[0].status,'devolvido_manual','somente a confirmação registra dinheiro devolvido manualmente');
 eq(await p.evaluate(()=>__dashDados('2026-09').fat),550,'financeiro considera a saída de 150 no mês correto');
 eq(await p.evaluate(()=>JSON.stringify(MTStore.read('ptStudio',{}).pagamentos[0])===__originalPayment),true,'pagamento original intacto');
 const csv=await p.evaluate(()=>{let rows;const old=MTStore.baixaCSV;MTStore.baixaCSV=(_,r)=>rows=r;try{__gestaoPT.exportaHistorico();}finally{MTStore.baixaCSV=old;}return rows;});
 const row=csv.find(x=>x[1]==='Aluno Sintético A');ok(row&&row.length===10,'CSV original ganha colunas explícitas sem perder os campos anteriores');
 await nav();await p.locator('#listaPagamentos [data-edita-pagamento=p1]').click();
 eq(await p.locator('dialog.r809-dialog [data-anular]').count(),0,'lançamento com devolução não oferece anulação');
 eq(await p.locator('dialog.r809-dialog [type=submit]').count(),0,'lançamento original com devolução fica somente leitura');await p.locator('dialog.r809-dialog [data-cancel]').click();
 await request('p1',450);await dlg().locator('[data-confirmar]').click();const r2=(await st()).estornosPT.at(-1).id;
 await open('p1');eq(await dlg().locator('[name=valor]').count(),0,'soma de devolvido e reservado impede excesso');
 await dlg().locator('[data-pt-refund-desistir="'+r2+'"]').click();await dlg().locator('[name=motivo]').fill('Solicitação incorreta, manter saldo');await dlg().locator('[data-revisar]').click();await dlg().locator('[data-confirmar]').click();
 eq((await st()).estornosPT[1].status,'cancelado','desistência mantém histórico sem alterar a devolução realizada');
 await open('p1');eq(await dlg().locator('[name=valor]').inputValue(),'450','desistência libera somente o saldo reservado');await dlg().locator('[data-fechar]').click();
 // Concorrência no mesmo recebimento: formulário continua sem regravar base obsoleta.
 await request('p1',50);await p.evaluate(()=>{const s=MTStore.read('ptStudio',{});s.pagamentos[0].valor=601;localStorage.setItem('mtapp:ptStudio',JSON.stringify(s));});
 await dlg().locator('[data-confirmar]').click();ok((await dlg().locator('[role=status]').innerText()).includes('mudaram'),'concorrência financeira impede confirmar com base obsoleta');eq((await st()).estornosPT.length,2,'conflito não cria devolução');await dlg().locator('[data-fechar]').click();
 await p.evaluate(()=>{const s=MTStore.read('ptStudio',{});s.pagamentos[0].valor=600;localStorage.setItem('mtapp:ptStudio',JSON.stringify(s));});
 // Outra pessoa alterada não se perde na confirmação.
 await request('p2',75);await p.evaluate(()=>{const s=MTStore.read('ptStudio',{});s.pagamentos.push({id:'concorrente',alunoId:'b',valor:20,data:'2026-09-14',forma:'Pix'});localStorage.setItem('mtapp:ptStudio',JSON.stringify(s));});await dlg().locator('[data-confirmar]').click();
 const r3=(await st()).estornosPT.at(-1).id;ok((await st()).pagamentos.some(x=>x.id==='concorrente'),'novo recebimento de outro aluno é preservado');
 await open('p2');await confirmManual(r3,'2026-09-14');await dlg().locator('[data-revisar]').click();await dlg().locator('[data-confirmar]').click();
 eq(await p.evaluate(()=>__dashDados('2026-08').fat),250,'recebimento de agosto mantém caixa de agosto');eq(await p.evaluate(()=>__dashDados('2026-09').fat),495,'saída de setembro não altera retroativamente agosto');
 // Permissão muda durante revisão; nenhum write.
 await request('p1',25);await p.evaluate(()=>document.querySelector('#abas [data-a="pagamentos"]').style.display='none');await dlg().locator('[data-confirmar]').click();
 ok((await dlg().locator('[role=status]').innerText()).includes('permissão'),'revalida permissão antes da confirmação');eq((await st()).estornosPT.length,3,'permissão removida bloqueia registro');await dlg().locator('[data-fechar]').click();await p.evaluate(()=>document.querySelector('#abas [data-a="pagamentos"]').style.display='');
 // Gateway não é acionado; cobrança automática precisa ser tratada no fluxo próprio.
 await p.evaluate(()=>{__perfilPT('auto');__pfAba('fin');});await p.locator('#pfFin [data-pt-cancelar=auto]').click();
 ok((await dlg().innerText()).includes('aguarde a confirmação do provedor'),'bloqueia cancelamento com assinatura automática vinculada');eq(await dlg().locator('form').count(),0,'assinatura não é cancelada apenas localmente');await dlg().locator('[data-fechar]').click();
 await request('gateway',10);await dlg().locator('[data-confirmar]').click();const rg=(await st()).estornosPT.at(-1).id;
 await open('gateway');await confirmManual(rg,'2026-09-14');await dlg().locator('[data-revisar]').click();eq(await dlg().locator('[data-revisao]').isVisible(),false,'gateway exige segunda confirmação de conferência externa');await dlg().locator('[name=confereGateway]').check();await dlg().locator('[data-revisar]').click();await dlg().locator('[data-confirmar]').click();
 // Cancelamento + devolução são atômicos no mesmo save; nome/motivo escapados.
 await p.evaluate(()=>{__perfilPT('a');__pfAba('fin');});await p.locator('#pfFin [data-pt-cancelar=a]').click();
 await dlg().locator('[name=motivo]').fill('Cancelamento acordado <img src=x onerror="window.__xss=true">');await dlg().locator('[name=pagamento]').selectOption('p1');await dlg().locator('[name=valor]').fill('100');await dlg().locator('[name=confereExterno]').check();await dlg().locator('[data-revisar]').click();
 eq((await st()).alunos[0].ativo,true,'prévia do cancelamento não encerra cliente');
 for(const width of [320,390,1280]){await p.setViewportSize({width,height:920});ok(await dlg().evaluate(e=>e.scrollWidth<=e.clientWidth+1),'cancelamento sem overflow em '+width+'px');}
 if(process.env.TORQUE_EVIDENCE_DIR){fs.mkdirSync(process.env.TORQUE_EVIDENCE_DIR,{recursive:true});await p.setViewportSize({width:390,height:920});await p.screenshot({path:path.join(process.env.TORQUE_EVIDENCE_DIR,'cancelamento-mobile.png')});}
 await dlg().locator('[data-confirmar]').click();const final=await st();
 eq(final.alunos[0].ativo,false,'cancelamento encerra acompanhamento');eq(final.alunos[0].pacote.renova,false,'interrompe renovação automática do pacote local');eq(final.alunos[0].pacote.total,10,'preserva quantidade original do pacote');
 eq(final.cancelamentosPT.length,1,'cancelamento fica auditado');eq(final.cancelamentosPT[0].sessoesCanceladas.map(x=>x.id),['futura'],'somente sessão futura não realizada é arquivada');ok(final.sessoes.some(x=>x.id==='feita')&&final.sessoes.some(x=>x.id==='futura-b'),'preserva sessão realizada e agenda de outro aluno');eq(final.contratosPT[0].status,'encerrado','encerra contrato ativo');eq(final.estornosPT.at(-1).status,'pendente','não finge devolver no cancelamento');
 ok(!await p.evaluate(()=>window.__xss),'motivo com markup não executa código');
 await open('p1');await dlg().locator('[data-pt-refund-recibo="'+r1+'"]').click({trial:true});
 const downloadPromise=p.waitForEvent('download');await dlg().locator('[data-pt-refund-recibo="'+r1+'"]').click();const download=await downloadPromise;const declared=fs.readFileSync(await download.path(),'utf8');
 ok(declared.includes('Não é comprovante bancário')&&declared.includes('Nenhuma transferência foi executada'),'declaração distingue registro manual de confirmação bancária');ok(declared.includes('Content-Security-Policy'),'declaração bloqueia scripts e rede');
 eq(await p.evaluate(()=>__externalCalls),[],'nenhuma cobrança/mensagem externa é aberta pelo novo fluxo');eq(errors,[],'fluxos sem exceções JavaScript');
 console.log(n+' verificações da interface de cancelamento/devolução passaram.');await context.close();
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
