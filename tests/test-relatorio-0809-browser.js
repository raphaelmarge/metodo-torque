/* Aceitação no painel REAL e no HTML gerado. Nunca toca produção. */
const assert=require('node:assert/strict'),fs=require('fs');
let chromium;try{chromium=require('playwright').chromium;}catch(_){chromium=require('/opt/node22/lib/node_modules/playwright').chromium;}
const {comMockNuvem}=require('./_nuvem');const BASE=process.env.BASE_URL||'http://127.0.0.1:8765';
let browser,n=0;function ok(v,m){assert.ok(v,m);n++;console.log('OK '+m);}function eq(v,e,m){assert.deepEqual(v,e,m);n++;console.log('OK '+m);}
(async()=>{
 browser=comMockNuvem(await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/opt/pw-browsers/chromium',args:['--no-sandbox']}));
 const ctx=await browser.newContext({viewport:{width:1280,height:900},timezoneId:'America/Sao_Paulo',serviceWorkers:'block'});
 await ctx.route('**://*.supabase.co/**',r=>r.abort());
 const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 await p.clock.setFixedTime(new Date('2026-09-11T09:00:00-03:00'));
 await p.goto(BASE+'/demo-personal.html');await p.click('#btnDemo');await p.waitForURL(/personal\.html/);await p.waitForFunction(()=>window.__ptStudio&&window.MT_RELATORIO_0809);
 await p.evaluate(()=>{
  const s=MTStore.read('ptStudio',{});
  s.alunos=[{id:'r-a',nome:'Aluno Pacote Sintético',ativo:true,modo:'mes',valor:200,desde:'2026-07-01',metaSemana:3,pacote:{total:13,usadas:1},appTokenP:'synthetic-local-a'},
   {id:'r-b',nome:'Aluno Mensal Sintético',ativo:true,modo:'mes',valor:200,desde:'2026-07-01',metaSemana:3,atendimento:'consultoria online',appTokenP:'synthetic-local-b'}];
  s.contratosPT=[{id:'rc-a',alunoId:'r-a',status:'encerrado',planoId:'rp',inicio:'2026-07-01'},{id:'rc-b',alunoId:'r-b',status:'ativo',planoId:'rp',inicio:'2026-07-01',diaVenc:5}];
  s.planosPT=[{id:'rp',nome:'Mensal sintético',valor:200,cobranca:'mes'}];s.pagamentos=[{id:'r-pay',alunoId:'r-a',valor:200,data:'2026-09-01',forma:'Pix',desc:'Lançamento sintético'}];s.pagamentosAuditoria=[];s.sessoes=[];s.agFixas=[];
  s.treinosV2={'r-a':{fichas:[{id:'rf-a',titulo:'Ficha própria A',itens:[]}],cardio:[],plano:{dias:{5:[{tp:'ficha',id:'rf-a'}]}}},'r-b':{fichas:[{id:'rf-b',titulo:'Ficha de outro aluno',itens:[]}]}};
  s.config=Object.assign({},s.config,{dia1Off:true,zapFilaOff:true});localStorage.setItem('mtapp:ptStudio',JSON.stringify(s));__ptStudio.render();
 });
 async function nav(k){await p.evaluate(k=>document.querySelector('#abas [data-a="'+k+'"]').click(),k);}
 async function treino(k){await nav('treinos');await p.evaluate(k=>document.querySelector('#trAbas [data-tra="'+k+'"]').click(),k);}
 async function perfil(id,area){await nav('alunos');await p.locator('#listaAlunos [data-abreperfil="'+id+'"]').click();if(area)await p.evaluate(area=>document.querySelector('#pfAbas [data-pfa="'+area+'"]').click(),area);}
 const store=()=>p.evaluate(()=>MTStore.read('ptStudio',{}));
 const fin=await p.evaluate(()=>{const s=MTStore.read('ptStudio',{});return [__cobrancaVencida(s,s.alunos[0]),!!__cobrancaVencida(s,s.alunos[1])];});eq(fin,[null,true],'regra canônica distingue pacote de mensalidade ativa');
 await perfil('r-a','fin');ok(!/devendo/.test(await p.locator('#pfFinSituacao').innerText()),'perfil aberto pelo botão real não mostra dívida fictícia');
 if(!await p.locator('#pfPagamentosHistorico').evaluate(e=>e.open))await p.locator('#pfPagamentosHistorico>summary').click();await p.locator('#pfFin [data-edita-pagamento="r-pay"]').click();
 ok(await p.locator('dialog.r809-dialog').isVisible(),'ação Editar existe no fluxo real, não só no gancho de teste');
 const dlg=p.locator('dialog.r809-dialog');await dlg.locator('[name=valor]').fill('180');await dlg.locator('[name=data]').fill('2026-09-02');await dlg.locator('[type=submit]').click();
 let s=await store();eq(s.pagamentos[0].valor,180,'edição grava o recebimento');eq(s.pagamentosAuditoria.length,1,'edição registra auditoria');eq(s.pagamentosAuditoria[0].antes.valor,200,'auditoria preserva valor anterior');eq(s.pagamentosAuditoria[0].depois.valor,180,'auditoria contém valor posterior');
 // Tocar no mesmo recebimento após mudança concorrente não sobrescreve a sessão nova.
 if(!await p.locator('#pfPagamentosHistorico').evaluate(e=>e.open))await p.locator('#pfPagamentosHistorico>summary').click();
 await p.locator('#pfFin [data-edita-pagamento="r-pay"]').click();await dlg.locator('[name=valor]').fill('170');
 await p.evaluate(()=>{const s=MTStore.read('ptStudio',{});s.pagamentos[0].valor=181;localStorage.setItem('mtapp:ptStudio',JSON.stringify(s));});
 await dlg.locator('[type=submit]').click();ok((await dlg.locator('[role=status]').innerText()).includes('outra sessão'),'conflito conserva rascunho e avisa');eq((await store()).pagamentos[0].valor,181,'conflito não sobrescreve dado mais novo');await dlg.locator('[data-cancel]').click();
 await perfil('r-a','fin');if(!await p.locator('#pfPagamentosHistorico').evaluate(e=>e.open))await p.locator('#pfPagamentosHistorico>summary').click();await p.locator('#pfFin [data-edita-pagamento="r-pay"]').click();
 await p.evaluate(()=>{const s=MTStore.read('ptStudio',{});s.pagamentos.push({id:'r-other',alunoId:'r-b',data:'2026-09-01',valor:3});localStorage.setItem('mtapp:ptStudio',JSON.stringify(s));});
 await dlg.locator('[name=valor]').fill('175');await dlg.locator('[type=submit]').click();eq((await store()).pagamentos.length,2,'edição preserva alteração concorrente em outro recebimento');
 await perfil('r-b','cadastro');ok(!await p.locator('#pfIrAgenda').isVisible(),'consultoria online não oferece botão Agendar no perfil');
 await p.locator('#pfAtendimento').selectOption('híbrido');await p.locator('#pfSalvar').click();ok(await p.locator('#pfIrAgenda').isVisible(),'híbrido volta a permitir agenda sem restaurar modal global');
 await p.locator('#pfAtendimento').selectOption('consultoria online');await p.locator('#pfSalvar').click();
 eq(await p.evaluate(()=>__dadosApp(MTStore.read('ptStudio',{}).alunos[1],'teste').atendimento),'consultoria online','tipo de atendimento viaja pelo publicador canônico');
 await nav('agenda');await p.evaluate(()=>{document.getElementById('sAluno').value='r-b';document.getElementById('sData').value='2026-09-14';document.getElementById('sHora').value='09:00';document.getElementById('sAdd').click();});eq((await store()).sessoes.length,0,'criação direta de sessão online é bloqueada');
 const geradas=await p.evaluate(()=>{const s=MTStore.read('ptStudio',{});s.agFixas=[{id:'fixa-test',ids:['r-a','r-b'],diaSem:[1,2,3,4,5],hora:'09:00',desde:'2026-09-11'}];__agFixas.estende(s);return s.sessoes.map(x=>x.alunoId);});ok(geradas.length>0&&geradas.every(x=>x==='r-a'),'recorrência não gera novas sessões do aluno online');
 await treino('plano');await p.locator('#plnAluno').selectOption('r-a');
 const opts=await p.locator('#r809DataTreino').textContent();ok(opts.includes('Ficha própria A')&&!opts.includes('outro aluno'),'planejamento só oferece fichas do aluno selecionado');
 await p.locator('#r809Data').fill('2026-09-18');await p.locator('#r809Data').dispatchEvent('change');await p.locator('#r809DataRest').click();
 eq((await store()).treinosV2['r-a'].plano.datas['2026-09-18'],[],'descanso grava exceção por data');
 await p.locator('#r809Data').fill('2026-09-11');await p.locator('#r809Data').dispatchEvent('change');await p.locator('#r809DataTreino').selectOption('ficha:rf-a');await p.locator('#r809DataHora').fill('07:00');await p.locator('#r809DataAdd').click();
 await p.locator('#plnSalva').click();s=await store();ok(!!s.treinosV2['r-a'].plano.datas['2026-09-11'],'salvar semana não apaga planejamento por datas');
 const pac=await p.evaluate(()=>__dadosApp(MTStore.read('ptStudio',{}).alunos[0],'teste'));eq(pac.planoDatas['2026-09-11'][0].n,'Ficha própria A','publicação resolve a ficha certa para a data');
 // Teste de concorrência no editor de data, mantendo o rascunho aberto.
 await p.locator('#r809Data').fill('2026-09-25');await p.locator('#r809Data').dispatchEvent('change');await p.evaluate(()=>{const s=MTStore.read('ptStudio',{});s.treinosV2['r-a'].plano.datas['2026-09-25']=[];localStorage.setItem('mtapp:ptStudio',JSON.stringify(s));});await p.locator('#r809DataAdd').click();ok((await p.locator('#r809DataStatus').innerText()).includes('outra sessão'),'edição de data detecta revisão concorrente');
 await treino('cardio');await p.locator('#cbAluno').selectOption('r-a');await p.locator('#cbEditor').evaluate(e=>e.open=true);await p.locator('#r809Corrida details').evaluateAll(es=>es.forEach(e=>e.open=true));
 await p.locator('#r809ZonaNome').fill('Limiar sintético');await p.locator('#r809ZonaMin').fill('5:00');await p.locator('#r809ZonaMax').fill('6:00');await p.locator('#r809ZonaAdd').click();
 s=await store();eq(s.treinosV2['r-a'].zonasCorrida.length,1,'zona é salva na biblioteca deste aluno');const zid=s.treinosV2['r-a'].zonasCorrida[0].id;
 await p.locator('[data-r827-add="repetir"]').click();await p.locator('#r809BlocoTipo').selectOption('repetir');await p.locator('#r809BlocoReps').fill('2');await p.locator('#r809AlvoValor').fill('.1');await p.locator('#r809AlvoUnidade').selectOption('km');await p.locator('#r809AlvoEsforco').selectOption('zona');await p.locator('#r809ZonaAlvo').selectOption(zid);await p.locator('#r809RecValor').fill('45');await p.locator('#r809RecUnidade').selectOption('s');await p.locator('#r809BlocoAdd').click();
 await p.locator('#cbNome').fill('Estrutura sintética');await p.locator('#cbSalva').click();s=await store();eq(s.treinosV2['r-a'].cardio[0].blocos[0].repeticoes,2,'formulário real salva estrutura de corrida');eq(s.treinosV2['r-a'].cardio[0].blocos[0].alvo.zona.nome,'Limiar sintético','treino preserva snapshot da zona selecionada');
 const cId=s.treinosV2['r-a'].cardio[0].id;await p.locator('[data-cbed="'+cId+'"]').click();ok((await p.locator('#r809BlocosLista').innerText()).includes('Limiar sintético'),'reabrir treino preserva blocos e alvo');
 await p.locator('#cbAluno').selectOption('r-b');ok(!(await p.locator('#r809ZonasLista').innerText()).includes('Limiar'),'outro aluno não recebe zona nem formulário do anterior');await p.locator('#cbAluno').selectOption('r-a');ok((await p.locator('#r809BlocosLista').innerText()).includes('Limiar'),'alternar aluno preserva o rascunho de blocos no aluno certo');
 for(const width of [390,1280]){await p.setViewportSize({width,height:900});ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'editor sem overflow em '+width+'px');}
 fs.mkdirSync('test-output',{recursive:true});await p.screenshot({path:'test-output/r809-personal.png',fullPage:true});
 const dto=await p.evaluate(()=>{const d=__dadosApp(MTStore.read('ptStudio',{}).alunos[0],'teste');d.atendimento='consultoria online';d.vidsApp=[{t:'Conteúdo de teste',c:'Metodologia',u:'https://example.com/test'}];return d;});
 const html=await p.evaluate(d=>MT_APP_ALUNO.monta(d),dto);const aluno=await ctx.newPage();aluno.on('pageerror',e=>errors.push(e.message));aluno.on('dialog',d=>d.accept());await aluno.clock.setFixedTime(new Date('2026-09-11T09:00:00-03:00'));
 await ctx.route(BASE+'/r809-aluno.html',r=>r.fulfill({contentType:'text/html',body:html}));await aluno.goto(BASE+'/r809-aluno.html');await aluno.waitForFunction(()=>window.__plnHoje&&window.__crGuia);
 eq(await aluno.evaluate(()=>__plnHoje()[0].h),'07:00','app do aluno usa a data específica no treino de hoje');eq(await aluno.evaluate(()=>__plnDia(5,'2026-09-18')),[],'descanso aparece também no app');ok(!await aluno.locator('#agPedeJa').isVisible(),'aluno online não recebe oferta de aula presencial');
 const steps=await aluno.evaluate(()=>{ document.querySelector('[data-cbstart]').click(); return __crGuia.monta(__cr.plano); });eq(steps.length,4,'player real executa esforço e recuperação repetidos');eq(steps[0].km,.1,'player respeita distância da etapa');eq(steps[1].s,45,'player respeita segundos da recuperação');ok(steps[0].d.includes('5:00–6:00 min/km'),'alvo por zona chega ao player');
 await aluno.evaluate(()=>document.documentElement.classList.add('claro'));const light=await aluno.locator('#vidCard .vidbtn').evaluate(e=>getComputedStyle(e).color);ok(light!=='rgb(255, 255, 255)','conteúdo novo não fica branco no modo claro');await aluno.evaluate(()=>document.documentElement.classList.remove('claro'));const dark=await aluno.locator('#vidCard .vidbtn').evaluate(e=>getComputedStyle(e).color);ok(light!==dark,'modo escuro permanece independente do tema do aparelho');
 await aluno.screenshot({path:'test-output/r809-aluno.png',fullPage:true});
 eq(errors,[],'painel e app gerado sem erros de JavaScript');console.log(n+' verificações de integração do relatório passaram.');await ctx.close();
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
