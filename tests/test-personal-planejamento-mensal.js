/* Painel real, dados sintéticos e rede de produção bloqueada. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
let chromium;
try { chromium = require('playwright').chromium; }
catch (_) { try { chromium = require('./ci/node_modules/playwright').chromium; } catch (_) { chromium = require('/opt/node22/lib/node_modules/playwright').chromium; } }
const {comMockNuvem} = require('./_nuvem.js');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765';
let browser, n = 0;
function eq(a, b, label) { assert.deepEqual(a, b, label); n++; console.log('OK ' + label); }
function ok(v, label) { assert.ok(v, label); n++; console.log('OK ' + label); }
(async () => {
  browser = comMockNuvem(await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',args:['--no-sandbox']}));
  const context = await browser.newContext({viewport:{width:1440,height:1050},timezoneId:'America/Sao_Paulo',serviceWorkers:'block'});
  await context.route('**://*.supabase.co/**', r => r.abort());
  const p = await context.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
  await p.clock.setFixedTime(new Date('2026-09-11T23:30:00-03:00'));
  await p.goto(BASE + '/demo-personal.html'); await p.click('#btnDemo'); await p.waitForURL(/personal\.html/);
  await p.waitForFunction(() => window.__ptStudio && window.MT_RELATORIO_0809);
  await p.evaluate(() => {
    const s = MTStore.read('ptStudio', {});
    s.alunos = [{id:'plm-a',nome:'Aluno calendário sintético A',ativo:true,desde:'2026-07-01'}, {id:'plm-b',nome:'Aluno calendário sintético B',ativo:true,desde:'2026-07-01'}];
    s.treinosV2 = {
      'plm-a': {fichas:[{id:'f-a',titulo:'Força A',itens:[]},{id:'f-b',titulo:'Força B',itens:[]}],cardio:[{id:'c-a',nome:'Corrida A',tipo:'continuo'}],plano:{dias:{1:[{tp:'ficha',id:'f-a',h:'07:00'},{tp:'cardio',id:'c-a',h:'18:00'}],5:[{tp:'ficha',id:'f-a',h:'07:00'}]},datas:{'2026-09-14':[{tp:'ficha',id:'f-a',h:'07:00'},{tp:'cardio',id:'c-a',h:'18:00'}],'2026-09-15':[],'2026-09-16':{tp:'ficha',id:'f-b',h:'08:00'},'2026-09-21':[],'2026-09-22':[{tp:'ficha',id:'f-b',h:'09:00'}]}}},
      'plm-b': {fichas:[{id:'f-outro',titulo:'Treino exclusivo do aluno B',itens:[]}],plano:{dias:{}}}
    };
    s.config = Object.assign({},s.config,{dia1Off:true,zapFilaOff:true});
    localStorage.setItem('mtapp:ptStudio',JSON.stringify(s)); __ptStudio.render();
    document.querySelector('#abas [data-a="treinos"]').click(); document.querySelector('#trAbas [data-tra="plano"]').click();
  });
  await p.locator('#plnAluno').selectOption('plm-a');
  const store = () => p.evaluate(() => MTStore.read('ptStudio',{}));
  const choose = async d => { await p.locator('#r809Data').fill(d); await p.locator('#r809Data').dispatchEvent('change'); };
  const editor = async (value,time) => { await p.locator('#r809DataTreino').selectOption(value); await p.locator('#r809DataHora').fill(time); };
  const save = () => p.locator('#r809DataAdd').click();
  const mutate = fn => p.evaluate(fn);
  eq(await p.locator('#r809Data').inputValue(),'2026-09-11','Hoje usa a data local mesmo quando UTC já está no dia seguinte');
  ok((await p.locator('#r809MesTitulo').innerText()).toLowerCase().includes('setembro de 2026'),'mês em português');
  eq(await p.locator('#r809MesGrid [aria-current=date]').getAttribute('data-r809-date'),'2026-09-11','marcação Hoje usa o fuso local');
  eq(await p.locator('#r809DataLista .plm-activity').count(),1,'agenda mostra atividade herdada da semana recorrente');
  await p.locator('#r809MesAnterior').click(); ok((await p.locator('#r809MesTitulo').innerText()).toLowerCase().includes('agosto'),'navega ao mês anterior');
  await p.locator('#r809MesProximo').click(); ok((await p.locator('#r809MesTitulo').innerText()).toLowerCase().includes('setembro'),'navega ao próximo mês');
  await choose('2028-02-29'); eq(await p.locator('#r809MesGrid [data-r809-date="2028-02-29"]').count(),1,'calendário inclui 29 de fevereiro em ano bissexto');
  await choose('2026-12-31'); await p.locator('#r809MesProximo').click(); ok((await p.locator('#r809MesTitulo').innerText()).toLowerCase().includes('janeiro de 2027'),'virada do ano mantém mês correto');
  await p.locator('#r809MesHoje').click(); eq(await p.locator('#r809Data').inputValue(),'2026-09-11','botão Hoje restaura dia e mês');
  await p.locator('#r809MesGrid [data-r809-date="2026-09-14"]').click();
  eq(await p.locator('#r809Data').inputValue(),'2026-09-14','seleção visual abre a agenda do dia escolhido');
  await p.locator('[data-r809-edit="0"]').click(); eq(await p.locator('#r809DataTreino').inputValue(),'ficha:f-a','Editar carrega a atividade existente');
  await editor('ficha:f-b','08:30'); await save();
  let s = await store();
  eq(s.treinosV2['plm-a'].plano.datas['2026-09-14'],[{tp:'ficha',id:'f-b',h:'08:30'},{tp:'cardio',id:'c-a',h:'18:00'}],'editar muda uma atividade e preserva a outra');
  eq(s.treinosV2['plm-a'].plano.dias['1'][0].id,'f-a','edição individual não muda semana recorrente');
  eq(s.treinosV2['plm-b'].plano.dias,{},'edição não muda outro aluno');
  await choose('2026-09-11'); await editor('cardio:c-a','18:30'); await save();
  eq((await store()).treinosV2['plm-a'].plano.datas['2026-09-11'].length,2,'adicionar preserva a atividade herdada da recorrência');
  await save(); ok((await p.locator('#r809DataStatus').innerText()).includes('já está programado'),'não duplica atividade no mesmo horário');
  await p.locator('[data-r809-del="2026-09-11:1"]').click();
  eq((await store()).treinosV2['plm-a'].plano.datas['2026-09-11'].length,1,'remover uma atividade mantém a outra');
  await p.locator('#r809DataRest').click(); eq((await store()).treinosV2['plm-a'].plano.datas['2026-09-11'],[],'descanso explícito substitui só a data');
  await p.locator('#r809DataReset').click(); ok(!Object.hasOwn((await store()).treinosV2['plm-a'].plano.datas,'2026-09-11'),'voltar à recorrência remove apenas a exceção');
  eq(await p.locator('#r809DataLista .plm-activity').count(),1,'recorrência reaparece na agenda após reset');
  await choose('2026-09-16'); await p.locator('[data-r809-edit="0"]').click(); await editor('ficha:f-a','09:15'); await save();
  eq((await store()).treinosV2['plm-a'].plano.datas['2026-09-16'],[{tp:'ficha',id:'f-a',h:'09:15'}],'edita data legada que guarda objeto único');
  // Rascunho + snapshot permanecem juntos ao alternar alunos e ao repintar.
  await choose('2026-09-14'); await p.locator('[data-r809-edit="0"]').click(); await editor('ficha:f-a','06:15');
  await p.locator('#plnAluno').selectOption('plm-b');
  ok(!(await p.locator('#r809DataTreino').innerText()).includes('Força A'),'aluno B só vê seus próprios treinos');
  await mutate(() => {const s=MTStore.read('ptStudio',{});s.treinosV2['plm-a'].plano.datas['2026-09-14'][0].h='10:00';localStorage.setItem('mtapp:ptStudio',JSON.stringify(s));});
  await p.locator('#plnAluno').selectOption('plm-a');
  eq(await p.locator('#r809Data').inputValue(),'2026-09-14','troca de aluno restaura a data do rascunho');
  eq(await p.locator('#r809DataHora').inputValue(),'06:15','troca de aluno conserva horário ainda não salvo');
  await p.evaluate(() => MT_RELATORIO_0809.plano()); await save();
  ok((await p.locator('#r809DataStatus').innerText()).includes('outra sessão'),'troca de aluno e render não renovam snapshot antigo');
  eq((await store()).treinosV2['plm-a'].plano.datas['2026-09-14'][0].h,'10:00','conflito não sobrescreve alteração concorrente');
  await p.locator('#r809DataReload').click(); eq(await p.locator('#r809DataHora').inputValue(),'','recarregar edição exige descarte explícito e abre versão atual');
  await p.locator('[data-r809-edit="0"]').click(); eq(await p.locator('#r809DataHora').inputValue(),'10:00','editor recarregado usa a atividade atual');
  // Mudança de recorrência também invalida editor que ainda herda a semana.
  await choose('2026-10-02'); await editor('ficha:f-b','08:00');
  await mutate(() => {const s=MTStore.read('ptStudio',{});s.treinosV2['plm-a'].plano.dias['5'][0].h='07:15';localStorage.setItem('mtapp:ptStudio',JSON.stringify(s));});
  await save(); ok((await p.locator('#r809DataStatus').innerText()).includes('outra sessão'),'conflito detecta mudança na recorrência herdada');
  await p.locator('#r809DataReload').click(); await save();
  eq((await store()).treinosV2['plm-a'].plano.datas['2026-10-02'].map(x=>x.h),['07:15','08:00'],'após conferir a versão atual, adiciona sem apagar nova recorrência');
  // Mudança de outra data continua compatível: grava a partir do estado mais recente.
  await choose('2026-10-06'); await editor('ficha:f-a','11:00');
  await mutate(() => {const s=MTStore.read('ptStudio',{});s.treinosV2['plm-a'].plano.datas['2026-10-07']=[];localStorage.setItem('mtapp:ptStudio',JSON.stringify(s));});
  await save(); eq((await store()).treinosV2['plm-a'].plano.datas['2026-10-07'],[],'save preserva alteração concorrente em outra data');
  // Falha real de gravação pelo MTStore mantém a edição aberta e os valores.
  await p.locator('[data-r809-edit="0"]').click(); await editor('ficha:f-b','12:15');
  await p.evaluate(() => {window.__plmWriteOrig=MTStore.write;MTStore.write=()=>false;}); await save();
  ok((await p.locator('#r809DataStatus').innerText()).includes('Não foi possível salvar'),'falha de save aparece no editor');
  eq(await p.locator('#r809DataHora').inputValue(),'12:15','falha conserva horário digitado');
  eq(await p.locator('#r809DataAdd').innerText(),'Salvar alteração','falha mantém modo de edição');
  eq((await store()).treinosV2['plm-a'].plano.datas['2026-10-06'][0].h,'11:00','falha mantém valor salvo anterior');
  await p.evaluate(() => {MTStore.write=window.__plmWriteOrig;delete window.__plmWriteOrig;}); await save();
  eq((await store()).treinosV2['plm-a'].plano.datas['2026-10-06'][0].h,'12:15','nova tentativa salva a mesma edição');
  // Conta diferente não recebe nem usa o rascunho da anterior.
  await choose('2026-10-08'); await editor('ficha:f-a','16:15');
  await p.evaluate(() => {window.__plmCloudOrig=MTStore.cloud;MTStore.cloud=()=>mockNuvem({aid:'conta-plm-b'});}); await save();
  ok((await p.locator('#r809DataStatus').innerText()).includes('conta ou o aluno mudou'),'troca de conta bloqueia save sem contexto atualizado');
  await p.evaluate(() => MT_RELATORIO_0809.plano()); eq(await p.locator('#r809DataHora').inputValue(),'','outra conta abre rascunho separado');
  await p.evaluate(() => {MTStore.cloud=window.__plmCloudOrig;delete window.__plmCloudOrig;MT_RELATORIO_0809.plano();});
  eq(await p.locator('#r809DataHora').inputValue(),'16:15','retornar à conta restaura seu próprio rascunho');
  // Cópia de semana efetiva, incluindo vários treinos e descansos explícitos.
  await choose('2026-09-14'); await p.locator('#r809CopiaSemana').click();
  let dlg=p.locator('dialog.plm-dialog');
  ok((await dlg.locator('[data-plm-resumo]').innerText()).includes('2 datas com ajustes serão mantidas'),'prévia mostra destinos ocupados e mantém por padrão');
  await dlg.locator('[name=semanas]').fill('2'); await dlg.locator('[data-plm-preview]').click(); await dlg.locator('[type=submit]').click();
  s=await store(); eq(s.treinosV2['plm-a'].plano.datas['2026-09-21'],[],'cópia padrão não sobrescreve descanso de destino');
  eq(s.treinosV2['plm-a'].plano.datas['2026-09-22'][0].h,'09:00','cópia padrão não sobrescreve atividade de destino');
  eq(s.treinosV2['plm-a'].plano.datas['2026-09-28'],s.treinosV2['plm-a'].plano.datas['2026-09-14'],'cópia mantém todas as atividades e horários na segunda semana');
  eq(s.treinosV2['plm-a'].plano.datas['2026-09-29'],[],'cópia preserva descanso da origem');
  eq(s.treinosV2['plm-a'].plano.datas['2026-09-30'],s.treinosV2['plm-a'].plano.datas['2026-09-16'],'cópia mantém o alinhamento do dia da semana');
  await p.locator('#r809CopiaSemana').click(); dlg=p.locator('dialog.plm-dialog');
  await dlg.locator('[name=modo]').selectOption('substituir'); await dlg.locator('[data-plm-preview]').click(); await dlg.locator('[type=submit]').click();
  ok((await dlg.locator('[role=status]').innerText()).includes('Confirme a substituição'),'substituição exige confirmação explícita');
  await dlg.locator('[name=confirma]').check(); await dlg.locator('[type=submit]').click();
  eq((await store()).treinosV2['plm-a'].plano.datas['2026-09-21'],(await store()).treinosV2['plm-a'].plano.datas['2026-09-14'],'substituição autorizada copia a semana');
  // Datas concorrentes ou conta/aluno alterados bloqueiam a cópia, mantendo diálogo.
  await p.locator('#r809CopiaSemana').click(); dlg=p.locator('dialog.plm-dialog');
  await dlg.locator('[name=destino]').fill('2026-11-02'); await dlg.locator('[data-plm-preview]').click();
  await mutate(() => {const s=MTStore.read('ptStudio',{});s.treinosV2['plm-a'].plano.datas['2026-11-03']=[];localStorage.setItem('mtapp:ptStudio',JSON.stringify(s));});
  await dlg.locator('[type=submit]').click(); ok((await dlg.locator('[role=status]').innerText()).includes('outra sessão'),'cópia detecta conflito no destino após a prévia');
  ok(!Object.hasOwn((await store()).treinosV2['plm-a'].plano.datas,'2026-11-02'),'cópia em conflito não aplica lote parcial');
  await dlg.locator('[data-plm-preview]').click();
  await p.evaluate(() => {window.__plmWriteOrig=MTStore.write;MTStore.write=()=>false;}); await dlg.locator('[type=submit]').click();
  ok(await dlg.isVisible(),'falha de save mantém diálogo de cópia aberto');
  eq(await dlg.locator('[name=destino]').inputValue(),'2026-11-02','falha de cópia conserva destino preenchido');
  ok((await dlg.locator('[role=status]').innerText()).includes('Não foi possível salvar'),'falha de cópia informa erro de gravação');
  await p.evaluate(() => {MTStore.write=window.__plmWriteOrig;delete window.__plmWriteOrig;});
  await p.evaluate(() => {document.getElementById('plnAluno').value='plm-b';MT_RELATORIO_0809.plano();}); await dlg.locator('[type=submit]').click();
  ok((await dlg.locator('[role=status]').innerText()).includes('conta ou o aluno mudou'),'cópia bloqueia troca de aluno enquanto diálogo está aberto');
  await p.evaluate(() => {document.getElementById('plnAluno').value='plm-a';MT_RELATORIO_0809.plano();}); await dlg.locator('[type=submit]').click();
  ok(!await p.locator('dialog.plm-dialog').count(),'mesmo rascunho de cópia pode ser salvo após voltar ao aluno');
  await p.locator('#r809CopiaSemana').click(); dlg=p.locator('dialog.plm-dialog');
  await dlg.locator('[name=destino]').fill('2026-09-20'); await dlg.locator('[data-plm-preview]').click();
  ok((await dlg.locator('[role=status]').innerText()).includes('semana de origem'),'domingo normaliza para segunda e não permite copiar uma semana sobre ela mesma');
  await dlg.locator('[name=destino]').fill('2026-12-07'); await dlg.locator('[data-plm-preview]').click();
  await mutate(() => {const s=MTStore.read('ptStudio',{});s.treinosV2['plm-a'].plano.datas['2026-09-15']=[{tp:'ficha',id:'f-a',h:'06:00'}];localStorage.setItem('mtapp:ptStudio',JSON.stringify(s));});
  await dlg.locator('[type=submit]').click(); ok((await dlg.locator('[role=status]').innerText()).includes('outra sessão'),'cópia detecta mudança na origem após a prévia');
  ok(!Object.hasOwn((await store()).treinosV2['plm-a'].plano.datas,'2026-12-07'),'conflito de origem não salva cópia desatualizada');
  await dlg.locator('[data-cancel]').click();
  // O objeto original de load deve chegar ao save para manter o CAS do MTStore.
  await choose('2026-11-13');
  await p.evaluate(()=>{window.__plmConfirmOrig=window.confirm;window.confirm=()=>{const s=MTStore.read('ptStudio',{});s.config.plmConcorrente='preservar';localStorage.setItem('mtapp:ptStudio',JSON.stringify(s));return true;};});
  await p.locator('#r809DataRest').click();
  eq((await store()).config.plmConcorrente,'preservar','CAS preserva mudança feita enquanto confirmação estava aberta');
  ok(!Object.hasOwn((await store()).treinosV2['plm-a'].plano.datas,'2026-11-13'),'CAS bloqueia gravação baseada em estado anterior à confirmação');
  ok((await p.locator('#r809DataStatus').innerText()).includes('Não foi possível salvar'),'CAS mantém editor com aviso de falha');
  await p.evaluate(()=>{window.confirm=window.__plmConfirmOrig;delete window.__plmConfirmOrig;});
  // Publicador canônico continua separado e resolve IDs para o aluno certo.
  const beforeWeekSave=(await store()).treinosV2['plm-a'].plano.datas;
  await p.locator('#plnSalva').click(); eq((await store()).treinosV2['plm-a'].plano.datas,beforeWeekSave,'salvar recorrência preserva todas as datas');
  const dto=await p.evaluate(() => __dadosApp(MTStore.read('ptStudio',{}).alunos[0],'teste'));
  eq(dto.planoDatas['2026-09-28'].map(x=>x.n),['Força B','Corrida A'],'DTO canônico mantém nomes e múltiplas atividades da data copiada');
  eq(dto.planoDatas['2026-09-29'],[],'DTO canônico mantém descanso copiado');
  eq(await p.locator('#abas [data-a]').count(),18,'todos os 18 destinos do Personal continuam presentes');
  // Temas, toque e geometria do componente e do documento em telas pequenas.
  await choose('2026-09-14'); fs.mkdirSync('test-output',{recursive:true});
  for(const theme of ['escuro','claro']){
    await p.evaluate(theme=>document.documentElement.setAttribute('data-tema',theme),theme);
    for(const width of [1440,390,320]){
      await p.setViewportSize({width,height:1050});
      if(width<=800){await p.locator('#fundoMenuPt').evaluate(e=>e.click());await p.waitForFunction(()=>document.getElementById('abas').getBoundingClientRect().right<=1);}
      const dimensions=await p.evaluate(()=>({doc:document.documentElement.scrollWidth,viewport:innerWidth,small:[...document.querySelectorAll('#r809Datas button')].filter(e=>!e.hidden&&e.getBoundingClientRect().height&&((e.getBoundingClientRect().height<43.9)||(e.getBoundingClientRect().width<43.9))).map(e=>({id:e.id,cls:e.className,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}))}));
      ok(dimensions.doc<=dimensions.viewport+1,'página sem overflow horizontal em '+width+'px / '+theme);
      eq(dimensions.small,[],'botões têm ao menos 44px em '+width+'px / '+theme);
      if(width===320)ok(await p.locator('.plm-scroll').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'os sete dias cabem na largura de 320px / '+theme);
      if(width!==390)await p.locator('#r809Datas').screenshot({path:'test-output/plm-'+theme+'-'+width+'.png',animations:'disabled'});
    }
  }
  eq(errors,[],'painel real sem erros de JavaScript');
  console.log(n+' verificações do calendário mensal passaram.'); await context.close();
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
