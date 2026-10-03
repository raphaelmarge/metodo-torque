/* Tela real do Personal, fixtures sintéticas e rede externa bloqueada. */
'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('./ci/node_modules/playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8796';
let browser, checks = 0;
process.on('unhandledRejection', e => { console.error(e); process.exitCode = 1; });
const ok = (v, label) => { assert.ok(v, label); checks++; console.log('OK ' + label); };
async function open(context) {
  const page = await context.newPage();
  page.on('dialog', d => d.accept());
  await page.goto(BASE + '/personal.html');
  await page.waitForFunction(() => window.__agAba && window.MTStore);
  await page.evaluate(() => { document.querySelector('#abas [data-a="agenda"]').click(); window.__agAba('agendar'); });
  await form(page);
  return page;
}
async function form(page, hour = '09:00', aluno = 'synthetic-a') {
  await page.evaluate(({hour, aluno}) => {
    document.getElementById('sAluno').value = aluno;
    const d = new Date(); d.setDate(d.getDate() + 5);
    document.getElementById('sData').value = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    document.getElementById('sHora').value = hour;
    document.getElementById('sHora').dispatchEvent(new Event('change', {bubbles:true}));
  }, {hour, aluno});
}
const click = p => p.evaluate(async () => { document.getElementById('sAdd').click(); await window.__agendamentoPendente; });
const sessions = p => p.evaluate(() => MTStore.read('ptStudio', {}).sessoes);
const status = p => p.textContent('#sAgStatus');
(async () => {
  browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || undefined,args:['--no-sandbox']});
  const context = await browser.newContext({serviceWorkers:'block'});
  await context.route('**/*', r => new URL(r.request().url()).origin === new URL(BASE).origin ? r.continue() : r.abort());
  await context.addInitScript(() => {
    if (localStorage.getItem('agenda-fixture')) return;
    localStorage.setItem('agenda-fixture','1');
    localStorage.setItem('mtapp:ptSemConta','1');
    localStorage.setItem('mtapp:perfil', JSON.stringify({nome:'Profissional sintético'}));
    localStorage.setItem('mtapp:ptStudio', JSON.stringify({alunos:[{id:'synthetic-a',nome:'Aluno sintético A',ativo:true},{id:'synthetic-b',nome:'Aluno sintético B',ativo:true}],sessoes:[],pagamentos:[],treinos:{},config:{nome:'Studio sintético'},_exSeed:1}));
  });
  const page = await open(context);
  await page.evaluate(async () => { document.getElementById('sAdd').click(); document.getElementById('sAdd').click(); await window.__agendamentoPendente; });
  ok((await sessions(page)).length === 1, 'duplo clique cria só uma sessão');
  ok((await status(page)).startsWith('Sessão agendada com sucesso!'), 'feedback imediatamente após persistência local');
  ok(await page.locator('#sAgStatus').getAttribute('role') === 'status' && await page.evaluate(() => document.activeElement.id) === 'sAgStatus', 'feedback acessível recebe foco');
  ok(await page.textContent('#sAdd') === 'Sessão já agendada', 'botão indica sessão já agendada');
  await click(page);
  ok(await status(page) === 'Você já possui um agendamento para esta sessão.' && (await sessions(page)).length === 1, 'retry informa duplicata sem gravação');
  await page.reload(); await page.waitForFunction(() => window.__agAba); await page.evaluate(() => {document.querySelector('#abas [data-a="agenda"]').click();window.__agAba('agendar');}); await form(page); await click(page);
  ok((await sessions(page)).length === 1 && /já possui/.test(await status(page)), 'refresh mantém identidade e bloqueia duplicata');
  const other = await open(context); await form(page,'10:00'); await form(other,'10:00');
  await Promise.all([click(page),click(other)]);
  ok((await sessions(page)).filter(x => x.hora === '10:00').length === 1, 'duas abas concorrentes mantêm uma sessão');
  ok([await status(page),await status(other)].some(x => x === 'Você já possui um agendamento para esta sessão.'), 'aba concorrente identifica agendamento existente');
  await form(page,'11:00');
  await page.evaluate(() => { window.__originalWrite = MTStore.write; MTStore.write = () => false; });
  await click(page);
  ok(!/sucesso/.test(await status(page)) && !(await sessions(page)).some(x => x.hora === '11:00'), 'falha de persistência não anuncia sucesso nem insere');
  await page.evaluate(() => { MTStore.write = window.__originalWrite; });
  // Nuvem simulada só na fronteira do recibo. A API real do store é testada à parte.
  await page.evaluate(() => {
    const cloud = {aid:'synthetic-academy',client:{}};
    window.__originalCloud = MTStore.cloud; window.__originalConfirm = MTStore.confirmaPersonal;
    MTStore.cloud = () => cloud;
    MTStore.confirmaPersonal = () => new Promise(resolve => { window.__resolveAgenda = resolve; });
  });
  await page.evaluate(() => document.getElementById('sAdd').click());
  await page.waitForFunction(() => !!window.__resolveAgenda);
  ok(await page.isDisabled('#sAdd') && !/sucesso/.test(await status(page)), 'enquanto a nuvem não confirma, botão desabilitado e sem sucesso');
  await page.evaluate(async () => { window.__resolveAgenda({valor:MTStore.read('ptStudio',{})}); await window.__agendamentoPendente; });
  ok((await status(page)).startsWith('Sessão agendada com sucesso!'), 'recibo da nuvem libera feedback de sucesso');
  await form(page,'12:00');
  await page.evaluate(() => { MTStore.confirmaPersonal = () => Promise.resolve({error:{message:'offline sintético'}}); });
  await click(page); await click(page);
  ok(!/sucesso|já possui/.test(await status(page)) && (await sessions(page)).filter(x => x.hora === '12:00').length === 1, 'offline/falha mantém pendência e retry não duplica');
  await form(page,'13:00');
  await page.evaluate(() => { MTStore.confirmaPersonal = () => new Promise(resolve => {window.__resolveAgenda = resolve;}); });
  await page.clock.install();
  await page.evaluate(() => { window.__resolveAgenda = null; document.getElementById('sAdd').click(); });
  await page.waitForFunction(() => !!window.__resolveAgenda);
  const committed = await page.evaluate(() => MTStore.read('ptStudio',{}));
  await page.clock.fastForward(15001); await page.evaluate(() => window.__agendamentoPendente);
  ok(/demorou/.test(await status(page)) && !await page.isDisabled('#sAdd'), 'timeout tem resultado desconhecido e libera consulta');
  await page.evaluate(async committed => { window.__resolveAgenda({valor:committed}); await Promise.resolve(); await Promise.resolve(); }, committed);
  ok(/demorou/.test(await status(page)), 'resposta tardia não altera resultado já encerrado');
  await page.evaluate(committed => { MTStore.confirmaPersonal = () => Promise.resolve({valor:committed}); }, committed);
  await click(page);
  ok(await status(page) === 'Você já possui um agendamento para esta sessão.' && (await sessions(page)).filter(x=>x.hora==='13:00').length===1, 'retry após commit com ACK perdido consulta sem duplicar');
  await page.clock.resume();
  await page.evaluate(() => { MTStore.cloud = window.__originalCloud; MTStore.confirmaPersonal = window.__originalConfirm; });
  // Cancelamento pelo fluxo existente; não inventa um novo status.
  await page.evaluate(() => {window.__agAba('sessoes');window.__agVis.troca('mes');window.__agDia(document.getElementById('sData').value);});
  const last = (await sessions(page)).find(x => x.hora === '13:00');
  await page.evaluate(id => {document.querySelector('#listaSessoes [data-smais="'+id+'"]').click(); document.querySelector('#listaSessoes [data-cx="'+id+'"]').click();}, last.id);
  await page.evaluate(() => window.__agAba('agendar')); await form(page,'13:00'); await click(page);
  ok((await sessions(page)).filter(x=>x.hora==='13:00').length===1 && /sucesso/.test(await status(page)), 'cancelar permite reagendar uma única sessão');
  // Outro aluno pode ocupar o mesmo horário, preservando turma/conflito permitido.
  await form(page,'13:00','synthetic-b'); await click(page);
  ok((await sessions(page)).filter(x=>x.hora==='13:00').length===2, 'mesmo horário com outro aluno continua permitido');
  const remarca = (await sessions(page)).find(x => x.hora === '13:00' && x.alunoId === 'synthetic-a');
  await page.evaluate(id => {
    window.__agAba('sessoes');window.__agDia(document.getElementById('sData').value);
    document.querySelector('#listaSessoes [data-smais="'+id+'"]').click();
    document.querySelector('#listaSessoes [data-sremarca="'+id+'"]').click();
  }, remarca.id);
  await page.fill('#sHora','09:00');await click(page);
  ok(await status(page) === 'Você já possui um agendamento para esta sessão.' && (await sessions(page)).find(x=>x.id===remarca.id).hora==='13:00', 'remarcar sobre sessão existente é recusado sem alterar original');
  await page.fill('#sHora','14:00');await click(page);
  ok((await sessions(page)).find(x=>x.id===remarca.id).hora==='14:00' && /remarcada com sucesso/.test(await status(page)), 'remarcação preserva ID e confirma só após salvar');
  // Recorrência finita e fixa: retry nunca acrescenta outra série/regra.
  await form(page,'15:00');await page.check('#sRep');
  await page.evaluate(() => {const d=new Date(document.getElementById('sData').value+'T12:00:00');d.setDate(d.getDate()+14);document.getElementById('sRepAte').value=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');});
  await click(page);await click(page);
  ok((await sessions(page)).filter(x=>x.hora==='15:00').length===3 && /já possui/.test(await status(page)), 'recorrência finita mantém três sessões e bloqueia repetição do lote');
  await page.fill('#sHora','16:00');await page.fill('#sRepAte','');await click(page);
  const fixedBefore=await page.evaluate(()=>MTStore.read('ptStudio').agFixas.length);await click(page);
  ok(await page.evaluate(()=>MTStore.read('ptStudio').agFixas.length)===fixedBefore && /já possui/.test(await status(page)), 'regra fixa não se duplica');
  await page.uncheck('#sRep');await form(page,'17:00');await page.click('#sTurmaBt');
  await page.evaluate(()=>document.querySelectorAll('#sTurmaChips .stc').forEach(x=>{x.checked=true;}));
  await click(page);await click(page);
  ok((await sessions(page)).filter(x=>x.hora==='17:00').length===2 && /já possui/.test(await status(page)), 'turma preserva sessão individual de cada aluno e impede duplicar lote');
  await page.click('#sTurmaBt');await form(page,'18:00');
  await page.evaluate(()=>{const st=MTStore.read('ptStudio');st.alunos[0].atendimento='online';MTStore.write('ptStudio',st);});await click(page);
  ok(!(await sessions(page)).some(x=>x.hora==='18:00') && !/sucesso/.test(await status(page)), 'modalidade exclusivamente online continua sem sessão presencial');
  await context.close();
  console.log(checks+' verificações de agendamento passaram.');
})().catch(e => {console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
