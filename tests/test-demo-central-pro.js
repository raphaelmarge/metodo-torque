/* Central Pro canônica em demonstração: somente memória fictícia, sem APIs reais. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
let chromium;
try { chromium = require('playwright').chromium; } catch (_) { chromium = require('/opt/node22/lib/node_modules/playwright').chromium; }
const BASE = (process.env.BASE_URL || 'http://127.0.0.1:8765').replace(/\/$/, '');
const ORIGIN = new URL(BASE).origin;
const TABLES = ['membros', 'personal_importacoes', 'personal_sessoes', 'personal_automacoes', 'personal_automacao_fila', 'personal_lista_espera', 'personal_creditos', 'personal_aluno_equipe'];
const TABS = ['import', 'presencial', 'automacoes', 'agenda', 'equipe'];
let browser, checks = 0;
function eq(actual, expected, label) { assert.deepEqual(actual, expected, label); checks++; console.log('OK: ' + label); }
function ok(value, label) { assert.ok(value, label); checks++; console.log('OK: ' + label); }

(async () => {
  const outsideDemo = { window: {}, document: { documentElement: { dataset: {} } } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/demo-central-pro-data.js'), 'utf8'), outsideDemo);
  eq(outsideDemo.window.MT_CENTRAL_PRO_DEMO, undefined, 'fixture não é instalada numa página de produção');
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 960 }, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR', serviceWorkers: 'block', acceptDownloads: false });
  const denied = { external: 0, api: 0, writes: 0, sockets: 0 }, loaded = new Set();
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    const api = /supabase\./i.test(url.hostname) || /^\/(?:rest|auth|functions|realtime)\/v1\b|^\/api(?:\/|$)/.test(url.pathname);
    if (url.origin !== ORIGIN) denied.external++;
    if (api) denied.api++;
    if (request.method() !== 'GET') denied.writes++;
    if (url.origin !== ORIGIN || api || request.method() !== 'GET') return route.abort();
    if (url.pathname === '/demo-pro-storage-probe.html') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Preparação isolada</title>' });
    loaded.add(url.pathname);
    return route.continue();
  });
  await context.routeWebSocket('**/*', socket => { denied.sockets++; socket.close(); });
  const p = await context.newPage(), errors = [];
  p.on('pageerror', error => errors.push(error.message));
  p.on('dialog', dialog => dialog.accept());
  await p.clock.setFixedTime(new Date('2026-09-29T12:00:00-03:00'));
  // Semeia uma vez, antes de abrir o demo; reload não pode recriar sentinelas apagadas.
  await p.goto(BASE + '/demo-pro-storage-probe.html');
  await p.evaluate(() => {
    localStorage.setItem('mtapp:ptStudio', JSON.stringify({ alunos: [{ id: 'sentinela-local', nome: 'Dado sintético preservado' }], config: { tema: 'sentinela' } }));
    localStorage.setItem('mtapp:perfil', JSON.stringify({ email: 'sentinela@example.invalid', nuvem: true }));
    localStorage.setItem('mtsync:identidade', JSON.stringify({ user_id: 'sentinela-local', academia_id: 'sentinela-academia' }));
    localStorage.setItem('sb-demo-sentinela-auth-token', JSON.stringify({ access_token: 'valor-ficticio-sem-validade', user: { id: 'sentinela-local' } }));
    sessionStorage.setItem('auth-sentinela', 'sessao-ficticia-preservada');
  });
  const storage = () => p.evaluate(() => ({ local: Object.fromEntries(Object.entries(localStorage).sort()), session: Object.fromEntries(Object.entries(sessionStorage).sort()) }));
  const storageBefore = await storage();
  const response = await p.goto(BASE + '/demo-central-pro.html');
  eq(response.status(), 200, 'rota da demonstração responde sem login');
  ok(/connect-src 'none'/.test(await p.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')), 'CSP da demo proíbe conexões de rede');
  await p.locator('#ptProSuite.aberta').waitFor({ state: 'visible' });
  await p.waitForFunction(() => window.MT_CENTRAL_PRO_DEMO && window.__PT_PRO_SUITE__);
  const snapshot = () => p.evaluate(() => MT_CENTRAL_PRO_DEMO.snapshot());
  const initial = await snapshot();
  eq(Object.keys(initial).sort(), TABLES.slice().sort(), 'demo expõe apenas as oito tabelas fictícias previstas');
  eq(await p.locator('[data-ptpro-tab]').evaluateAll(items => items.map(item => item.dataset.ptproTab)), TABS, 'cinco abas canônicas estão disponíveis');
  eq(await p.locator('#ptProSuite').getAttribute('aria-hidden'), 'false', 'Central Pro abre diretamente');
  ok(/fict[ií]ci[oa]s?/i.test(await p.locator('#ptProSuite .ptpro-top').innerText()), 'aviso de dados fictícios fica visível dentro do painel');
  ok(loaded.has('/assets/personal-pro-suite.js') && loaded.has('/assets/personal-pro-suite.css'), 'demonstração usa JS e CSS reais da Central Pro');
  ok(await p.evaluate(() => window.MT_supabase === MT_CENTRAL_PRO_DEMO.client), 'módulo recebe somente o cliente fictício em memória');
  eq(await storage(), storageBefore, 'abrir o demo preserva autenticação, painel e armazenamento da origem');
  eq(denied, { external: 0, api: 0, writes: 0, sockets: 0 }, 'nenhuma tentativa de rede externa ou API antes da primeira interação');
  eq(await p.locator('[data-ptpro-tab].ativa').getAttribute('data-ptpro-tab'), 'presencial', 'atendimento presencial abre primeiro');
  eq(await p.locator('#ptProFile').evaluate(el => el.files.length), 0, 'abrir a demo não carrega importação automaticamente');
  ok(await p.locator('#ptProImportSave').isDisabled(), 'salvar importação permanece indisponível sem arquivo');
  ok(loaded.has('/assets/personal-pro-context.js'), 'demo usa o adaptador de contexto real');
  const fixture = await p.evaluate(() => MT_CENTRAL_PRO_DEMO.context);
  eq(fixture.students.map(a => a.id), ['demo-ana', 'demo-bruno', 'demo-carla'], 'contexto contém apenas os três alunos fictícios, sem sentinela do Personal');
  eq(fixture.students[0].workouts[0].exercises[0].sets, [{reps:'12',load:20,rest:90},{reps:'10',load:22,rest:90},{reps:'8',load:24,rest:90}], 'ficha de Ana oferece prescrição individual por série');
  eq(fixture.students.map(a => a.nutrition.pendingReviews), [2, 0, null], 'contexto distingue pendências, ausência de pendências e acompanhamento indisponível');
  ok(fixture.students.every(a => a.name && a.workouts.length && a.nextSession && a.checkin && !a.photo), 'alunos têm contexto coerente e usam iniciais sem carregar fotos externas');
  await p.evaluate(() => { const copy = MT_CENTRAL_PRO_DEMO.context; copy.students[0].workouts[0].exercises[0].sets[0].load = 999; });
  eq(await p.evaluate(() => MT_CENTRAL_PRO_DEMO.context), fixture, 'contexto devolve cópia; edição de sessão não modifica a prescrição fictícia');
  async function student(id, term) {
    await p.locator('#ptProStudentSearch').fill(term);
    await p.locator('#ptProStudentResults [data-ptpro-student="' + id + '"]').click();
    await p.waitForFunction(id => ['ptProImportAluno','ptProSessAluno','ptProWaitAluno','ptProCredAluno','ptProTeamAluno'].every(key => document.getElementById(key).value === id), id);
  }
  await student('demo-ana', 'Ana');
  for (const id of ['ptProImportAluno', 'ptProSessAluno', 'ptProWaitAluno', 'ptProCredAluno', 'ptProTeamAluno']) {
    eq(await p.locator('#' + id).getAttribute('type'), 'hidden', id + ' mantém identificador interno fora da digitação');
    eq(await p.locator('#' + id).inputValue(), 'demo-ana', id + ' acompanha a busca acessível pelo nome');
  }
  ok(/Ana Beatriz Souza/.test(await p.locator('#ptProSelectedStudent').innerText()), 'cabeçalho confirma o aluno escolhido');
  eq(await snapshot(), initial, 'buscar aluno e consultar ficha não grava nas tabelas');
  ok(/Boa disposição/.test(await p.locator('#ptProContext').innerText()) && /2 refeições para revisar/.test(await p.locator('#ptProContext').innerText()), 'painel contextual usa check-in e nutrição do aluno selecionado');
  await p.locator('[data-context-area="checkin"]').click();
  ok(/7 horas/.test(await p.locator('.ptpro-context-detail').innerText()), 'ação de check-in abre a resposta fictícia correspondente');
  await p.locator('[data-context-area="checkin"]').click();
  eq(await p.locator('.ptpro-context-detail').count(), 0, 'fechar detalhe de check-in não cria outro painel');

  async function tab(id) {
    await p.locator('[data-ptpro-tab="' + id + '"]').click();
    await p.locator('[data-ptpro-view="' + id + '"].ativa').waitFor({ state: 'visible' });
  }
  async function waitCount(table, count) { await p.waitForFunction(({ table, count }) => MT_CENTRAL_PRO_DEMO.snapshot()[table].length === count, { table, count }); }
  function unchangedExcept(before, after, table, label) {
    eq(Object.fromEntries(TABLES.filter(key => key !== table).map(key => [key, after[key]])),
      Object.fromEntries(TABLES.filter(key => key !== table).map(key => [key, before[key]])), label);
  }

  // Importa um File real pelo parser canônico; escolher arquivo permanece rascunho.
  await tab('import');
  await p.locator('#demoProExemplo').click();
  await p.waitForFunction(() => document.querySelector('#ptProFile').files.length === 1 && !document.querySelector('#ptProImportSave').disabled);
  ok(await p.locator('#ptProImportPreview tbody tr').count() > 0, 'exemplo abre uma prévia pelo input e parser reais');
  eq(await snapshot(), initial, 'carregar exemplo não salva importação automaticamente');
  const csv = 'exercicio,series,repeticoes,carga\n"Remada, unilateral",3,12,18 kg\nAgachamento,4,8,30 kg\n';
  await p.locator('#ptProFile').setInputFiles({ name: 'ficha-sintetica.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await p.waitForFunction(() => !document.querySelector('#ptProImportSave').disabled && Array.from(document.querySelectorAll('#ptProImportPreview input')).some(input => input.value === 'Remada, unilateral'));
  eq(await p.locator('#ptProImportPreview tbody tr').count(), 2, 'CSV mantém duas linhas e vírgula dentro das aspas');
  await student('demo-ana', 'Ana');
  await failNextWrite('personal_importacoes','insert');
  await p.locator('#ptProImportSave').click(); await p.locator('#ptProImportStatus.erro').waitFor();
  eq(await snapshot(), initial, 'falha de importação preserva todas as tabelas');
  eq(await p.locator('#ptProImportPreview tbody tr').count(), 2, 'falha de importação conserva a prévia para nova tentativa');
  ok(!await p.locator('#ptProImportSave').isDisabled(), 'falha de importação permite tentar salvar novamente');
  await p.locator('#ptProImportSave').click(); await waitCount('personal_importacoes', initial.personal_importacoes.length + 1);
  let after = await snapshot(), imported = after.personal_importacoes.find(row => row.nome_arquivo === 'ficha-sintetica.csv');
  eq({ aluno: imported.aluno_id, origem: imported.origem, status: imported.status, autor: imported.autor_id },
    { aluno: 'demo-ana', origem: 'csv', status: 'revisar', autor: 'demo-prof-marina' }, 'importação conserva aluno, autoria e revisão pendente');
  eq(imported.dados.linhas, [{ exercicio: 'Remada, unilateral', series: '3', repeticoes: '12', carga: '18 kg' }, { exercicio: 'Agachamento', series: '4', repeticoes: '8', carga: '30 kg' }], 'snapshot contém os dados realmente interpretados do arquivo');
  unchangedExcept(initial, after, 'personal_importacoes', 'importar não modifica sessões, automações, créditos ou equipe');
  ok(/rascunho.*revisão/i.test(await p.locator('#ptProImportStatus').innerText()), 'sucesso informa que a importação continua como rascunho');

  async function failNextWrite(table, operation) {
    await p.evaluate(({table, operation}) => {
      const client = MT_CENTRAL_PRO_DEMO.client, originalFrom = client.from;
      client.from = function (name) {
        const query = originalFrom.call(this, name);
        if (name !== table) return query;
        const originalWrite = query[operation];
        query[operation] = function (...args) {
          const result = originalWrite.apply(this, args);
          client.from = originalFrom;
          result.then = (resolve, reject) => Promise.resolve({data:null,error:{message:'Falha simulada ao salvar'},count:0}).then(resolve, reject);
          return result;
        };
        return query;
      };
    }, {table, operation});
  }
  async function beforeUnloadBlocked() {
    return p.evaluate(() => { const event = new Event('beforeunload', {cancelable:true}); return !window.dispatchEvent(event) && event.defaultPrevented; });
  }
  const beforeSession = after;
  await tab('presencial'); await student('demo-ana', 'Ana');
  await p.locator('#ptProWorkout').selectOption('demo-ana-a');
  const firstExercise = p.locator('#ptProSets details').filter({has:p.getByText('Agachamento livre', {exact:true})});
  await firstExercise.locator('summary').click();
  eq(await firstExercise.locator('[data-k="reps"]').evaluateAll(items => items.map(el => el.value)), ['12','10','8'], 'prescrição conserva repetições individuais antes da sessão');
  eq(await firstExercise.locator('[data-k="carga"]').evaluateAll(items => items.map(el => el.value)), ['20','22','24'], 'prescrição conserva cargas individuais antes da sessão');
  ok(/22 kg/.test(await firstExercise.locator('summary').innerText()), 'última carga real do contexto aparece ao lado da prescrição');
  ok(await firstExercise.locator('[data-k="reps"]').first().isDisabled() && await firstExercise.locator('[data-k="carga"]').first().isDisabled(), 'consulta da ficha não permite editar antes de iniciar');
  const plannedCount = fixture.students[0].workouts[0].exercises.reduce((n, ex) => n + ex.sets.length, 0);
  eq(await p.locator('#ptProSets .ptpro-set').count(), plannedCount, 'treino completo oferece todas as séries prescritas');
  eq(await snapshot(), beforeSession, 'abrir exercícios e trocar treino permanece somente leitura');
  await p.locator('#ptProSessStart').click(); await waitCount('personal_sessoes', beforeSession.personal_sessoes.length + 1);
  let session = (await snapshot()).personal_sessoes.find(row => !beforeSession.personal_sessoes.some(old => old.id === row.id));
  eq([session.aluno_id, session.profissional_id, session.status], ['demo-ana', 'demo-prof-marina', 'em_andamento'], 'iniciar sessão grava aluno e profissional fictícios');
  eq(session.dados.series, [], 'abrir sessão não marca séries prescritas como realizadas');
  eq(session.dados.ficha, {id:'demo-ana-a',nome:'A · Inferiores e core'}, 'sessão conserva a identificação da ficha prescrita');
  ok(await p.locator('#ptProStudentSearch').isDisabled() && await p.locator('#ptProWorkout').isDisabled(), 'aluno e ficha ficam protegidos durante atendimento ativo');
  await p.locator('#ptProSessFinish').click(); await p.locator('#ptProSessStatus.erro').waitFor();
  eq((await snapshot()).personal_sessoes.find(row => row.id === session.id).status, 'em_andamento', 'finalizar sem nenhuma série feita não conclui o atendimento');
  await p.locator('#ptProSessObs').fill('Sessão fictícia acompanhada pela profissional.');
  await firstExercise.locator('summary').click();
  const firstSet = firstExercise.locator('.ptpro-set').nth(0);
  await firstSet.locator('[data-k="reps"]').fill('9'); await firstSet.locator('[data-k="carga"]').fill('23');
  await firstSet.locator('[data-k="done"]').check();
  eq(await firstSet.locator('input:not([type="hidden"])').evaluateAll(items => items.map(el => el.dataset.k)), ['reps','carga','done'], 'registro mantém repetições antes da carga e marcação explícita');
  for (const entry of [{name:'Agachamento',reps:'8',load:'30 kg'},{name:'Remada unilateral',reps:'12',load:'18 kg'}]) {
    await p.locator('#ptProAddSet').click();
    const row = p.locator('#ptProSets details').last().locator('.ptpro-set');
    await row.locator('[data-k="exercicio"]').fill(entry.name); await row.locator('[data-k="reps"]').fill(entry.reps);
    await row.locator('[data-k="carga"]').fill(entry.load); await row.locator('[data-k="done"]').check();
  }
  await p.locator('#ptProAddSet').click(); await p.locator('#ptProSets details').last().getByRole('button', { name: /Remover série/ }).click();
  eq(await p.locator('#ptProSets .ptpro-set').count(), plannedCount + 2, 'adicionar e remover série manual conserva todas as linhas prescritas e preenchidas');
  eq(await beforeUnloadBlocked(), true, 'sessão alterada pede proteção de saída sem navegar');
  const beforeDraft = await snapshot();
  await failNextWrite('personal_sessoes','update'); await p.locator('#ptProSessSave').click();
  await p.locator('#ptProSessStatus.erro').waitFor();
  eq(await snapshot(), beforeDraft, 'falha ao salvar rascunho não modifica os registros');
  eq(await p.locator('#ptProSessObs').inputValue(), 'Sessão fictícia acompanhada pela profissional.', 'falha de gravação preserva observação no formulário');
  eq(await p.locator('#ptProSets [data-k="done"]:checked').count(), 3, 'falha de gravação preserva séries marcadas');
  await p.locator('#ptProSessSave').click();
  await p.waitForFunction(id => MT_CENTRAL_PRO_DEMO.snapshot().personal_sessoes.find(row => row.id === id).dados.series.length === 3, session.id);
  let savedDraft = (await snapshot()).personal_sessoes.find(row => row.id === session.id);
  eq(savedDraft.status, 'em_andamento', 'salvar rascunho mantém sessão em andamento');
  eq(await beforeUnloadBlocked(), false, 'rascunho salvo não impede saída sem alterações pendentes');
  eq(savedDraft.dados.series.map(({exercicio,reps,carga}) => ({exercicio,reps,carga})), [
    {exercicio:'Agachamento livre',reps:'9',carga:'23'},
    {exercicio:'Agachamento',reps:'8',carga:'30 kg'},
    {exercicio:'Remada unilateral',reps:'12',carga:'18 kg'}
  ], 'rascunho salva exatamente as séries feitas, incluindo as linhas manuais');
  eq(savedDraft.dados.planejado.reduce((n, ex) => n + ex.sets.length, 0), plannedCount + 2, 'rascunho conserva também as séries ainda não realizadas');
  await p.locator('#ptProClose').click(); await p.locator('#ptProSuiteBtn').click();
  await p.locator('#ptProSuite.aberta').waitFor({state:'visible'});
  eq((await snapshot()).personal_sessoes.length, beforeSession.personal_sessoes.length + 1, 'reabrir atendimento preserva o rascunho sem criar outra sessão');
  eq(await p.locator('#ptProSets [data-k="done"]:checked').count(), 3, 'reabrir preserva as séries realizadas');
  const beforeFinish = await snapshot();
  await failNextWrite('personal_sessoes','update'); await p.locator('#ptProSessFinish').click();
  await p.locator('#ptProSessStatus.erro').waitFor();
  eq(await snapshot(), beforeFinish, 'falha ao finalizar preserva o rascunho salvo');
  ok(!await p.locator('#ptProSessFinish').isDisabled(), 'falha de finalização mantém nova tentativa disponível');
  await p.locator('#ptProSessFinish').click();
  await p.waitForFunction(id => MT_CENTRAL_PRO_DEMO.snapshot().personal_sessoes.find(row => row.id === id).status === 'concluida', session.id);
  after = await snapshot(); session = after.personal_sessoes.find(row => row.id === session.id);
  eq(session.dados, savedDraft.dados, 'finalização conserva ficha, séries planejadas, séries feitas e observação do rascunho');
  ok(!!session.encerrado_em && await p.locator('#ptProSessFinish').isDisabled(), 'sessão concluída recebe encerramento e não oferece segunda finalização');
  eq(after.personal_sessoes.length, beforeSession.personal_sessoes.length + 1, 'finalizar atualiza a sessão existente sem duplicar');
  eq(await p.evaluate(() => MT_CENTRAL_PRO_DEMO.context), fixture, 'atendimento não reescreve a prescrição nem os dados de contexto');
  unchangedExcept(beforeSession, after, 'personal_sessoes', 'modo presencial altera apenas as sessões fictícias');
  eq(await beforeUnloadBlocked(), false, 'sessão concluída não bloqueia saída');
  const finishedId = session.id;
  await p.locator('#ptProSessStart').click(); await waitCount('personal_sessoes', beforeSession.personal_sessoes.length + 2);
  let secondSession = (await snapshot()).personal_sessoes.find(row => row.id !== finishedId);
  eq(secondSession.dados.series, [], 'nova sessão não herda séries marcadas na sessão anterior');
  eq(await p.locator('#ptProSessObs').inputValue(), '', 'nova sessão do mesmo aluno não herda observação anterior');
  await p.locator('#ptProSessObs').fill('Observação exclusiva da segunda sessão de Ana.');
  await firstExercise.locator('summary').click(); await firstExercise.locator('[data-k="done"]').first().check();
  await p.locator('#ptProSessFinish').click();
  await p.waitForFunction(id => MT_CENTRAL_PRO_DEMO.snapshot().personal_sessoes.find(row => row.id === id).status === 'concluida', secondSession.id);
  await student('demo-bruno', 'Bruno');
  eq(await p.locator('#ptProSessObs').inputValue(), '', 'trocar para Bruno limpa a observação de Ana');
  eq(await p.locator('#ptProWorkout').inputValue(), 'demo-bruno-a', 'troca de aluno carrega somente a ficha correspondente');
  eq((await snapshot()).personal_sessoes.find(row => row.id === finishedId).dados.observacao, 'Sessão fictícia acompanhada pela profissional.', 'nova sessão e troca de aluno não reescrevem o histórico anterior');
  await student('demo-ana', 'Ana');


  await tab('automacoes');
  const events = ['questionario.respondido', 'aluno.novo', 'agenda.cancelada'];
  eq(await p.locator('#demoProEvento option').evaluateAll(items => items.map(item => item.value)), events, 'simulador oferece os três eventos implementados');
  for (const [i, event] of events.entries()) {
    const beforeAuto = await snapshot(), name = 'Regra de teste ' + (i + 1);
    await p.locator('#ptProAutoNome').fill(name); await p.locator('#ptProAutoGatilho').selectOption(event);
    await p.locator('#ptProAutoAcao').selectOption('revisar_planejamento'); await p.locator('#ptProAutoSave').click();
    await waitCount('personal_automacoes', beforeAuto.personal_automacoes.length + 1);
    await p.waitForFunction(name => document.querySelector('#ptProAutoList').textContent.includes(name), name);
    after = await snapshot(); const rule = after.personal_automacoes.find(row => row.nome === name);
    eq([rule.gatilho, rule.acao.tipo, rule.ativa], [event, 'revisar_planejamento', true], 'criação conserva regra explícita de ' + event);
    unchangedExcept(beforeAuto, after, 'personal_automacoes', 'criar regra não executa providências de ' + event);
  }
  for (const event of events) {
    const beforeEvent = await snapshot(), rules = beforeEvent.personal_automacoes.filter(row => row.ativa && row.gatilho === event);
    await p.locator('#demoProEvento').selectOption(event); await p.locator('#demoProSimular').click();
    await waitCount('personal_automacao_fila', beforeEvent.personal_automacao_fila.length + rules.length);
    after = await snapshot(); const added = after.personal_automacao_fila.filter(row => !beforeEvent.personal_automacao_fila.some(old => old.id === row.id));
    eq(added.map(row => row.automacao_id).sort(), rules.map(row => row.id).sort(), 'simular ' + event + ' executa somente regras ativas correspondentes');
    ok(added.every(row => row.gatilho === event && row.origem.demonstracao === true && row.origem.rotulo === 'Simulação do demo'), 'fila de ' + event + ' identifica a simulação');
    unchangedExcept(beforeEvent, after, 'personal_automacao_fila', 'simular ' + event + ' não altera prescrições ou demais tabelas');
    await p.waitForFunction(label => document.querySelector('#ptProQueueList').textContent.includes(label), {'questionario.respondido':'Questionário respondido','aluno.novo':'Novo aluno','agenda.cancelada':'Sessão cancelada'}[event]);
  }

  const beforePause = await snapshot();
  await p.locator('[data-auto-toggle="demo-regra-questionario"]').click();
  await p.waitForFunction(() => !MT_CENTRAL_PRO_DEMO.snapshot().personal_automacoes.find(row => row.id === 'demo-regra-questionario').ativa);
  let paused = await snapshot();
  unchangedExcept(beforePause, paused, 'personal_automacoes', 'pausar regra não altera a fila existente ou os outros fluxos');
  const activeQuestionnaire = paused.personal_automacoes.filter(row => row.ativa && row.gatilho === 'questionario.respondido');
  await p.locator('#demoProEvento').selectOption('questionario.respondido'); await p.locator('#demoProSimular').click();
  await waitCount('personal_automacao_fila', paused.personal_automacao_fila.length + activeQuestionnaire.length);
  eq((await snapshot()).personal_automacao_fila.filter(row => !paused.personal_automacao_fila.some(old => old.id === row.id)).map(row => row.automacao_id).sort(), activeQuestionnaire.map(row => row.id).sort(), 'simulação respeita pausa feita pela interface real');
  await p.locator('[data-auto-toggle="demo-regra-questionario"]').click();
  await p.waitForFunction(() => MT_CENTRAL_PRO_DEMO.snapshot().personal_automacoes.find(row => row.id === 'demo-regra-questionario').ativa);
  const beforeResolve = await snapshot();
  await p.locator('[data-queue-done="demo-fila-ana"]').click();
  await p.waitForFunction(() => MT_CENTRAL_PRO_DEMO.snapshot().personal_automacao_fila.find(row => row.id === 'demo-fila-ana').status === 'concluida');
  after = await snapshot();
  eq(after.personal_automacao_fila.length, beforeResolve.personal_automacao_fila.length, 'resolver providência atualiza o registro existente sem duplicar');
  ok(!!after.personal_automacao_fila.find(row => row.id === 'demo-fila-ana').concluido_em, 'providência resolvida registra encerramento');
  unchangedExcept(beforeResolve, after, 'personal_automacao_fila', 'resolver providência não altera prescrições ou demais tabelas');
  await p.locator('#ptProQueueFilter').selectOption('concluida');
  eq(await p.locator('#ptProQueueList .ptpro-item').count(), 1, 'filtro mostra somente a providência concluída');
  await p.locator('#ptProQueueFilter').selectOption('all');
  eq(await p.locator('#ptProQueueList .ptpro-item').count(), after.personal_automacao_fila.length, 'filtro Todas conserva acesso ao histórico da fila');
  await p.locator('#ptProQueueFilter').selectOption('pendente');
  eq(await snapshot(), after, 'filtrar a fila não altera seu histórico');

  await tab('agenda'); const beforeWait = await snapshot();
  await student('demo-ana', 'Ana'); await p.locator('#ptProWaitDia').fill('2026-10-03'); await p.locator('#ptProWaitHora').fill('10:30');
  await p.locator('#ptProWaitSave').click(); await waitCount('personal_lista_espera', beforeWait.personal_lista_espera.length + 1);
  after = await snapshot(); const waiting = after.personal_lista_espera.find(row => !beforeWait.personal_lista_espera.some(old => old.id === row.id));
  eq([waiting.aluno_id, waiting.dia, waiting.hora.slice(0, 5), waiting.status], ['demo-ana', '2026-10-03', '10:30', 'aguardando'], 'lista de espera conserva aluno, data e horário escolhidos');
  unchangedExcept(beforeWait, after, 'personal_lista_espera', 'lista de espera não mexe em créditos ou sessões');
  await p.waitForFunction(() => document.querySelector('#ptProWaitList').textContent.includes('10:30'));
  await student('demo-ana', 'Ana');
  const beforeCredit = after;
  for (const balance of [6, 4]) {
    await p.locator('#ptProCredSaldo').fill(String(balance)); await p.locator('#ptProCredSave').click();
    await p.waitForFunction(balance => MT_CENTRAL_PRO_DEMO.snapshot().personal_creditos.some(row => row.aluno_id === 'demo-ana' && row.saldo === balance), balance);
  }
  after = await snapshot();
  eq(after.personal_creditos.filter(row => row.aluno_id === 'demo-ana').length, 1, 'atualizar crédito usa upsert sem criar dois saldos para Ana');
  eq(after.personal_creditos.filter(row => row.aluno_id !== 'demo-ana'), beforeCredit.personal_creditos.filter(row => row.aluno_id !== 'demo-ana'), 'atualizar Ana preserva os créditos dos outros alunos');
  unchangedExcept(beforeCredit, after, 'personal_creditos', 'ajuste de crédito não altera espera ou outros registros');
  await p.locator('#ptProCredSaldo').fill('-1'); await p.locator('#ptProCredSave').click();
  await p.locator('#ptProCredStatus.erro').waitFor(); eq(await snapshot(), after, 'saldo inválido não modifica o estado em memória');

  await tab('equipe');
  await p.waitForFunction(() => document.querySelector('#ptProResp option[value="demo-prof-marina"]') && document.querySelector('#ptProSub option[value="demo-prof-rafael"]'));
  await student('demo-ana', 'Ana'); await p.locator('#ptProResp').selectOption('demo-prof-rafael');
  await p.locator('#ptProSub').selectOption('demo-prof-rafael'); const beforeTeam = await snapshot();
  await p.locator('#ptProTeamSave').click(); await p.locator('#ptProTeamStatus.erro').waitFor();
  eq(await snapshot(), beforeTeam, 'responsável igual ao substituto é recusado sem gravar');
  await p.locator('#ptProSub').selectOption('demo-prof-marina'); await p.locator('#ptProTeamSave').click();
  await p.waitForFunction(() => MT_CENTRAL_PRO_DEMO.snapshot().personal_aluno_equipe.some(row => row.aluno_id === 'demo-ana' && row.responsavel_id === 'demo-prof-rafael' && row.substituto_id === 'demo-prof-marina'));
  after = await snapshot();
  eq(after.personal_aluno_equipe.filter(row => row.aluno_id === 'demo-ana').length, 1, 'equipe mantém um vínculo por aluno');
  eq(after.personal_aluno_equipe.filter(row => row.aluno_id !== 'demo-ana'), beforeTeam.personal_aluno_equipe.filter(row => row.aluno_id !== 'demo-ana'), 'trocar a equipe de Ana preserva responsáveis dos outros alunos');
  unchangedExcept(beforeTeam, after, 'personal_aluno_equipe', 'atribuir equipe altera somente o vínculo fictício');
  await p.waitForFunction(() => /Marina Costa/.test(document.querySelector('#ptProTeamList').textContent) && /Rafael Lima/.test(document.querySelector('#ptProTeamList').textContent));

  const beforeBrowse = await snapshot(), themeColors = [];
  await p.setViewportSize({ width: 390, height: 844 });
  await tab('automacoes');
  await p.locator('.ptpro-main').evaluate(el => { el.scrollTop = 300; });
  eq(await p.locator('.ptpro-main').evaluate(el => el.scrollTop), 300, 'caso móvel começa com conteúdo de Automações realmente rolado');
  await tab('automacoes');
  eq(await p.locator('.ptpro-main').evaluate(el => el.scrollTop), 300, 'reabrir a mesma aba preserva a posição usada pelo simulador');
  await tab('agenda');
  eq(await p.locator('.ptpro-main').evaluate(el => el.scrollTop), 0, 'trocar de Automações para Agenda abre o conteúdo no início');
  for (const [key, expected] of [['Home', 'import'], ['End', 'equipe'], ['ArrowLeft', 'agenda'], ['ArrowUp', 'automacoes'], ['ArrowDown', 'agenda'], ['ArrowRight', 'equipe'], ['ArrowRight', 'import'], ['ArrowLeft', 'equipe']]) {
    await p.keyboard.press(key);
    await p.locator('[data-ptpro-view="' + expected + '"].ativa').waitFor({ state: 'visible' });
    const state = await p.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('[data-ptpro-tab]'));
      return { focus: document.activeElement.dataset.ptproTab,
        active: tabs.filter(el => el.classList.contains('ativa')).map(el => el.dataset.ptproTab),
        selected: tabs.filter(el => el.getAttribute('aria-selected') === 'true').map(el => el.dataset.ptproTab),
        tabbable: tabs.filter(el => el.tabIndex === 0).map(el => el.dataset.ptproTab),
        othersSkipTab: tabs.filter(el => !el.classList.contains('ativa')).every(el => el.tabIndex === -1) };
    });
    eq(state, { focus: expected, active: [expected], selected: [expected], tabbable: [expected], othersSkipTab: true }, key + ' ativa ' + expected + ', move o foco e mantém somente uma aba na ordem de Tab');
  }
  for (let theme = 0; theme < 2; theme++) {
    if (theme) await p.locator('#demoProTema').click();
    themeColors.push(await p.locator('.ptpro-shell').evaluate(el => getComputedStyle(el).backgroundColor));
    for (const width of [320, 390, 768, 1280]) {
      await p.setViewportSize({ width, height: 960 });
      for (const id of TABS) {
        await tab(id);
        eq(await p.locator('.ptpro-view.ativa').count(), 1, id + ' conserva uma aba ativa em ' + width + 'px/tema ' + theme);
        const geometry = await p.evaluate(() => {
          const shell = document.querySelector('.ptpro-shell'), main = document.querySelector('.ptpro-main'), view = document.querySelector('.ptpro-view.ativa');
          return { document: document.documentElement.scrollWidth <= innerWidth + 1, shell: shell.scrollWidth <= shell.clientWidth + 1,
            main: main.scrollWidth <= main.clientWidth + 1, view: view.scrollWidth <= view.clientWidth + 1,
            right: shell.getBoundingClientRect().right <= innerWidth + 1, left: shell.getBoundingClientRect().left >= -1 };
        });
        ok(Object.values(geometry).every(Boolean), id + ' cabe em ' + width + 'px/tema ' + theme + ': ' + JSON.stringify(geometry));
      }
    }
  }
  ok(themeColors[0] !== themeColors[1], 'alternância de tema muda a superfície real do painel');
  eq(await snapshot(), beforeBrowse, 'navegação, tamanhos e temas não alteram dados dos cinco fluxos');
  eq(await storage(), storageBefore, 'todos os fluxos e temas preservam o armazenamento real da origem');
  await p.locator('#ptProClose').click(); ok(!await p.locator('#ptProSuite').isVisible(), 'Fechar conserva a navegação de retorno do painel');
  await p.locator('#ptProSuiteBtn').click(); await p.locator('#ptProSuite.aberta').waitFor({ state: 'visible' });
  eq(await snapshot(), beforeBrowse, 'reabrir Central Pro mantém o trabalho fictício da visita');
  // Duas leituras começam na identidade anterior e só respondem após a troca.
  await tab('agenda');
  await p.waitForFunction(() => document.querySelector('#ptProCredSaldo').value === '4');
  await p.locator('#ptProClose').click();
  await p.evaluate(() => {
    const originalLoad = PTProContext.load, client = MT_CENTRAL_PRO_DEMO.client, originalFrom = client.from;
    window.__proLateRead = {};
    PTProContext.load = options => new Promise(resolve => {
      window.__proLateRead.students = async () => resolve(await originalLoad(options));
    });
    client.from = function (table) {
      const query = originalFrom.call(this, table);
      if (table === 'personal_creditos') {
        const originalThen = query.then;
        query.then = function (resolve, reject) { window.__proLateRead.credit = () => originalThen.call(query, resolve, reject); };
      }
      return query;
    };
    window.__proLateRead.restore = () => { PTProContext.load = originalLoad; client.from = originalFrom; };
  });
  await p.locator('#ptProSuiteBtn').click();
  await p.waitForFunction(() => typeof window.__proLateRead.students === 'function' && typeof window.__proLateRead.credit === 'function');
  await p.evaluate(() => window.dispatchEvent(new CustomEvent('mt:conta-divergente')));
  const clearedIdentity = () => p.evaluate(() => ({
    ids:['ptProImportAluno','ptProSessAluno','ptProWaitAluno','ptProCredAluno','ptProTeamAluno'].map(id=>document.getElementById(id).value),
    selected:document.querySelector('#ptProSelectedStudent').textContent,
    rows:['ptProAutoList','ptProQueueList','ptProWaitList','ptProTeamList'].map(id=>document.getElementById(id).childElementCount),
    file:document.querySelector('#ptProFile').files.length,
    preview:document.querySelector('#ptProImportPreview').childElementCount,
    note:document.querySelector('#ptProSessObs').value,
    credit:document.querySelector('#ptProCredSaldo').value,
    creditDisabled:document.querySelector('#ptProCredSave').disabled,
    retry:!document.querySelector('#ptProRetryStudents').hidden,
    exercises:document.querySelectorAll('#ptProSets .ptpro-set').length
  }));
  const blankIdentity = {ids:['','','','',''],selected:'',rows:[0,0,0,0],file:0,preview:0,note:'',credit:'',creditDisabled:true,retry:true,exercises:0};
  eq(await clearedIdentity(), blankIdentity, 'troca de identidade limpa aluno, listas, arquivo, ficha, observação e crédito visíveis');
  await p.evaluate(async () => {
    const pending = window.__proLateRead; pending.restore();
    await Promise.all([pending.students(), pending.credit()]);
    await new Promise(resolve => setTimeout(resolve, 0));
    delete window.__proLateRead;
  });
  eq(await clearedIdentity(), blankIdentity, 'respostas antigas de alunos e créditos não repovoam a nova identidade');
  eq(await snapshot(), beforeBrowse, 'troca de identidade e descarte de respostas antigas preservam os registros salvos');
  eq(await storage(), storageBefore, 'troca de identidade da UI não altera sentinelas do Personal ou autenticação real');

  await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.locator('#demoProRecomecar').click()]);
  await p.locator('#ptProSuite.aberta').waitFor({ state: 'visible' });
  eq(await snapshot(), initial, 'Recomeçar restaura somente as tabelas fictícias iniciais');
  eq(await storage(), storageBefore, 'Recomeçar não limpa autenticação nem dados do Personal');
  eq(denied, { external: 0, api: 0, writes: 0, sockets: 0 }, 'demonstração inteira não tenta acessar APIs, enviar POST ou abrir sockets');
  eq(errors, [], 'os cinco fluxos não produzem erros JavaScript');
  await context.close();
  console.log('PASSOU: ' + checks + ' verificações da demonstração Central Pro');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
