/* Fluxos financeiros reais com alunos fictícios. Toda navegação é servida do
 * checkout pelo Playwright; rede, WhatsApp e cobranças externas não são usados. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let chromium;try{chromium=require('playwright').chromium;}catch(_){try{chromium=require('./ci/node_modules/playwright').chromium;}catch(_){chromium=require('/opt/node22/lib/node_modules/playwright').chromium;}}
const {comMockNuvem}=require('./_nuvem');
const R=require('../assets/relatorio-0809');
let n=0,browser;
function eq(a,b,m){assert.deepEqual(a,b,m);console.log('OK '+m);n++;}
function ok(a,m){assert.ok(a,m);console.log('OK '+m);n++;}
const meta=acao=>({id:'audit-'+n,acao,em:'2026-09-11T12:00:00Z',por:'conta-sintetica'});
const base={id:'mensal',alunoId:'a',valor:200,data:'2026-09-11',forma:'Pix',eventoId:'evento-preservado'};
const st={pagamentos:[{...base},{id:'serv',alunoId:'a',valor:40,data:'2026-09-11',forma:'Pix',desc:'Massagem'}]};
R.alteraRecebimento(st,'mensal',JSON.stringify(st.pagamentos[0]),{...base,desc:'Anotação da correção'},meta('editar'));
eq(R.recebimentoTipo(st.pagamentos[0]),'aulas','anotação mantém a natureza da mensalidade legada');
R.alteraRecebimento(st,'serv',JSON.stringify(st.pagamentos[1]),{...st.pagamentos[1],desc:''},meta('editar'));
eq(R.recebimentoTipo(st.pagamentos[1]),'servico','apagar descrição de serviço não o transforma em mensalidade');
const snap=JSON.stringify(st.pagamentos[0]);
R.alteraRecebimento(st,'mensal',snap,{motivo:'Duplicado'},meta('anular'));
eq(R.recebimentosAtivos(st).length,1,'anulação exclui do cálculo e conserva a outra entrada');
eq(st.pagamentos.length,2,'nenhum recebimento é apagado');
eq(st.pagamentos[0].eventoId,'evento-preservado','anulação mantém eventoId para não repetir baixa automática');
eq(st.pagamentosAuditoria.at(-1).antes,JSON.parse(snap),'auditoria preserva todos os campos anteriores');
assert.throws(()=>R.alteraRecebimento(st,'mensal',snap,{motivo:'Repetir'},meta('anular')),/outra sessão/);n++;
eq(R.recebimentoDuplicados(st,{...base,id:'novo',eventoId:undefined}).length,0,'anulado não dispara possível duplicidade');

(async()=>{
 const launch={args:['--no-sandbox']};
 if(process.env.CHROMIUM_PATH)launch.executablePath=process.env.CHROMIUM_PATH;
 else if(fs.existsSync('/opt/pw-browsers/chromium'))launch.executablePath='/opt/pw-browsers/chromium';
 browser=comMockNuvem(await chromium.launch(launch));
 const ctx=await browser.newContext({viewport:{width:1280,height:900},timezoneId:'America/Sao_Paulo',serviceWorkers:'block'});
 const root=path.resolve(__dirname,'..'),BASE='http://torque-financeiro.test',errors=[];
 const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png','.webp':'image/webp'};
 await ctx.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.origin!==BASE)return route.abort();
   const f=path.resolve(root,'.'+decodeURIComponent(u.pathname));
   if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile())return route.fulfill({status:404,body:''});
   return route.fulfill({contentType:mime[path.extname(f)]||'application/octet-stream',body:fs.readFileSync(f)});
 });
 const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.dismiss());
 await p.clock.setFixedTime(new Date('2026-09-11T09:00:00-03:00'));
 await p.goto(BASE+'/demo-personal.html');await p.click('#btnDemo');await p.waitForURL(/personal\.html/);await p.waitForFunction(()=>window.__ptStudio&&window.__incluiRecebimentosManuais);
 await p.evaluate(()=>{
   const s=MTStore.read('ptStudio',{});
   s.alunos=[{id:'pkg',nome:'Pacote Sintético',ativo:true,zap:'000000001',modo:'mes',valor:200,pacote:{total:13,usadas:1}},{id:'a',nome:'Mensal Sintético',ativo:true,zap:'000000002',modo:'mes',valor:200},{id:'b',nome:'Devedor Sintético B',ativo:true,zap:'000000003',modo:'mes',valor:200},{id:'c',nome:'Devedor Sintético C',ativo:true,zap:'000000004',modo:'mes',valor:200}];
   s.pagamentos=[{id:'p1',alunoId:'a',data:'2026-09-11',valor:200,forma:'Pix'},{id:'srv',alunoId:'a',data:'2026-09-11',valor:40,forma:'Pix',desc:'Massagem'}];
   s.pagamentosAuditoria=[];s.sessoes=[];s.contratosPT=[];s.planosPT=[];s.agFixas=[];s.treinosV2={};s.config=Object.assign({},s.config,{dia1Off:true,zapFilaOff:true});
   localStorage.setItem('mtapp:ptStudio',JSON.stringify(s));window.__renderPT();
   window.__financeCalls=[];window.__financeConfirms=[];window.__acceptFinance=true;
   window.confirm=m=>{__financeConfirms.push(m);return __acceptFinance;};window.alert=()=>{};
   window.open=u=>{__financeCalls.push(u);return {};};
 });
 const store=()=>p.evaluate(()=>MTStore.read('ptStudio',{}));
 const nav=()=>p.evaluate(()=>document.querySelector('#abas [data-a="pagamentos"]').click());
 async function edit(id){await nav();await p.locator('#listaPagamentos [data-edita-pagamento="'+id+'"]').click();}
 const dlg=p.locator('dialog.r809-dialog');
 await nav();await p.locator('#pgCobrarTodos').click();
 eq(await p.evaluate(()=>__financeCalls.length),2,'Cobrar todos usa somente os dois devedores da lista');
 ok(await p.evaluate(()=>__financeCalls.every(u=>!u.includes('000000001'))),'pacote pré-pago não entra na cobrança coletiva');
 await edit('p1');await dlg.locator('[name=desc]').fill('Correção de lançamento');await dlg.locator('[type=submit]').click();
 eq(await p.evaluate(()=>__idxPT(MTStore.read('ptStudio',{})).pagouMes('a','2026-09')),true,'descrição editada pela tela mantém a mensalidade quitada');
 eq(await p.evaluate(()=>__dashDados('2026-09').fatAulas),200,'receita de aulas preservada após a anotação');
 eq((await store()).pagamentosAuditoria.length,1,'edição real grava auditoria');
 await edit('srv');await dlg.locator('[name=desc]').fill('');await dlg.locator('[type=submit]').click();
 eq(await p.evaluate(()=>__dashDados('2026-09').fatAulas),200,'serviço editado continua fora da receita de aulas');
 // O formulário manual avisa, permite desistir e permite recebimento legítimo.
 await nav();await p.locator('#fgRecebimento > summary').click();await p.locator('#pAluno').selectOption('a');await p.locator('#pValor').fill('200');
 await p.evaluate(()=>{__acceptFinance=false;__financeConfirms=[];});await p.locator('#pAdd').click();
 eq((await store()).pagamentos.length,2,'recusar duplicidade conserva somente os lançamentos originais');
 eq(await p.locator('#pValor').inputValue(),'200','recusa conserva o valor do formulário');
 ok(await p.evaluate(()=>__financeConfirms.some(x=>x.includes('Possível duplicidade'))),'aviso de duplicidade aparece no formulário real');
 await p.evaluate(()=>__acceptFinance=true);await p.locator('#pAdd').click();
 eq((await store()).pagamentos.length,3,'confirmar permite outro pagamento legítimo');
 const novo=(await store()).pagamentos.find(x=>!['p1','srv'].includes(x.id)).id;
 // Falha na gravação deve manter o motivo e o registro original.
 await edit(novo);await dlg.locator('summary').filter({hasText:'Anular recebimento'}).click();await dlg.locator('[name=motivo]').fill('Lançamento duplicado');
 await p.evaluate(()=>{window.__financeWrite=MTStore.write;MTStore.write=()=>false;});await dlg.locator('[data-anular]').click();
 ok(await dlg.isVisible(),'falha de gravação mantém o diálogo aberto');
 eq(await dlg.locator('[name=motivo]').inputValue(),'Lançamento duplicado','falha conserva o motivo digitado');
 ok(!(await store()).pagamentos.find(x=>x.id===novo).anulacao,'falha não altera o recebimento armazenado');
 await p.evaluate(()=>MTStore.write=__financeWrite);await dlg.locator('[data-anular]').click();
 eq(await p.evaluate(()=>__dashDados('2026-09').fat),240,'anulação retira somente o lançamento duplicado dos totais');
 eq(await p.evaluate(()=>__idxPT(MTStore.read('ptStudio',{})).pagouMes('a','2026-09')),true,'outro pagamento válido mantém a quitação');
 await edit('p1');await dlg.locator('summary').filter({hasText:'Anular recebimento'}).click();await dlg.locator('[name=motivo]').fill('Recebimento incorreto');await dlg.locator('[data-anular]').click();
 eq(await p.evaluate(()=>__dashDados('2026-09').fat),40,'dashboard exclui os dois anulados');
 eq(await p.evaluate(()=>__dashDados('2026-09').fatAulas),0,'receita de aulas exclui os dois anulados');
 eq(await p.evaluate(()=>__idxPT(MTStore.read('ptStudio',{})).pagouMes('a','2026-09')),false,'anular o último pagamento reabre a quitação');
 eq((await store()).pagamentos.length,3,'histórico conserva inclusive os dois recebimentos anulados');
 await edit('p1');ok((await dlg.innerText()).includes('Recebimento incorreto'),'histórico anulado apresenta motivo');
 eq(await dlg.locator('[data-anular]').count(),0,'histórico anulado não oferece segunda anulação');await dlg.locator('[data-cancel]').click();
 // Mesmo recebimento alterado por outra sessão: rejeita sem descartar rascunho.
 await edit('srv');await dlg.locator('[name=valor]').fill('35');
 await p.evaluate(()=>{const s=MTStore.read('ptStudio',{});s.pagamentos.find(x=>x.id==='srv').valor=41;localStorage.setItem('mtapp:ptStudio',JSON.stringify(s));});
 await dlg.locator('[type=submit]').click();ok((await dlg.locator('[role=status]').innerText()).includes('outra sessão'),'conflito é informado pelo diálogo');
 eq((await store()).pagamentos.find(x=>x.id==='srv').valor,41,'conflito preserva o valor mais recente');await dlg.locator('[data-cancel]').click();
 await edit('srv');await dlg.locator('[name=valor]').fill('39');
 await p.evaluate(()=>{const s=MTStore.read('ptStudio',{});s.pagamentos.push({id:'outra-edicao',alunoId:'b',valor:25,data:'2026-09-11',forma:'Pix'});localStorage.setItem('mtapp:ptStudio',JSON.stringify(s));});
 await dlg.locator('[type=submit]').click();ok((await store()).pagamentos.some(x=>x.id==='outra-edicao'),'edição mantém recebimento concorrente de outro aluno');
 const csv=await p.evaluate(()=>{const original=MTStore.baixaCSV;let rows;MTStore.baixaCSV=(name,data)=>{rows=data;};try{__gestaoPT.exportaHistorico();}finally{MTStore.baixaCSV=original;}return rows;});
 eq(csv.filter(row=>row[5]==='Anulado').length,2,'CSV conserva anulados com situação explícita');
 ok(csv.some(row=>row[6]==='Recebimento incorreto'),'CSV conserva o motivo da anulação');
 eq(await p.evaluate(()=>{
   const a={id:'hora',modo:'sessao',valor:100},s={alunos:[a],contratosPT:[],pagamentos:[{id:'hora-p',alunoId:'hora',valor:200,data:'2026-09-11',tipoRecebimento:'aulas',desc:'Anotação livre'}],sessoes:[{id:'hora-s',alunoId:'hora',feita:true,data:'2026-09-11'}]};
   const antes=__financeiroPT.carteira(s,a).saldo;
   MT_RELATORIO_0809.alteraRecebimento(s,'hora-p',JSON.stringify(s.pagamentos[0]),{motivo:'Duplicado'},{id:'audit-hora',acao:'anular',em:'2026-09-11T12:00:00Z',por:'teste'});
   return [antes,__financeiroPT.carteira(s,a).saldo];
 }),[100,-100],'carteira usa natureza explícita e recalcula o mesmo estado após anulação');
 // Permissão removida enquanto o formulário está aberto.
 await edit('srv');await dlg.locator('[name=valor]').fill('38');await p.evaluate(()=>document.querySelector('#abas [data-a="pagamentos"]').style.display='none');await dlg.locator('[type=submit]').click();
 ok((await dlg.locator('[role=status]').innerText()).includes('permissão'),'permissão é revalidada ao salvar');
 eq((await store()).pagamentos.find(x=>x.id==='srv').valor,39,'perda de permissão não altera o valor');
 await p.evaluate(()=>document.querySelector('#abas [data-a="pagamentos"]').style.display='');
 for(const width of [390,1280]){await p.setViewportSize({width,height:900});ok(await dlg.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'diálogo financeiro sem overflow em '+width+'px');}
 eq(errors,[],'fluxos sem erros JavaScript');
 await ctx.close();console.log(n+' verificações financeiras passaram.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
