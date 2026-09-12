/* Central Pro canônica em demonstração: somente memória fictícia, sem APIs reais. */
const assert = require('node:assert/strict');
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
  await p.clock.setFixedTime(new Date('2026-09-12T12:00:00-03:00'));
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
  for (const id of ['ptProImportAluno', 'ptProSessAluno', 'ptProWaitAluno', 'ptProCredAluno', 'ptProTeamAluno']) {
    eq(await p.locator('#' + id).evaluate(el => el.tagName), 'SELECT', id + ' oferece alunos fictícios sem pedir identificador técnico');
    ok(await p.locator('#' + id + ' option[value="demo-ana"]').count() === 1, id + ' inclui Ana');
  }
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
  await p.locator('#demoProExemplo').click();
  await p.waitForFunction(() => document.querySelector('#ptProFile').files.length === 1 && !document.querySelector('#ptProImportSave').disabled);
  ok(await p.locator('#ptProImportPreview tbody tr').count() > 0, 'exemplo abre uma prévia pelo input e parser reais');
  eq(await snapshot(), initial, 'carregar exemplo não salva importação automaticamente');
  const csv = 'exercicio,series,repeticoes,carga\n"Remada, unilateral",3,12,18 kg\nAgachamento,4,8,30 kg\n';
  await p.locator('#ptProFile').setInputFiles({ name: 'ficha-sintetica.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await p.waitForFunction(() => !document.querySelector('#ptProImportSave').disabled && document.querySelector('#ptProImportPreview').textContent.includes('Remada, unilateral'));
  eq(await p.locator('#ptProImportPreview tbody tr').count(), 2, 'CSV mantém duas linhas e vírgula dentro das aspas');
  await p.locator('#ptProImportAluno').selectOption('demo-ana');
  await p.locator('#ptProImportSave').click(); await waitCount('personal_importacoes', initial.personal_importacoes.length + 1);
  let after = await snapshot(), imported = after.personal_importacoes.find(row => row.nome_arquivo === 'ficha-sintetica.csv');
  eq({ aluno: imported.aluno_id, origem: imported.origem, status: imported.status, autor: imported.autor_id },
    { aluno: 'demo-ana', origem: 'csv', status: 'revisar', autor: 'demo-prof-marina' }, 'importação conserva aluno, autoria e revisão pendente');
  eq(imported.dados.linhas, [{ exercicio: 'Remada, unilateral', series: '3', repeticoes: '12', carga: '18 kg' }, { exercicio: 'Agachamento', series: '4', repeticoes: '8', carga: '30 kg' }], 'snapshot contém os dados realmente interpretados do arquivo');
  unchangedExcept(initial, after, 'personal_importacoes', 'importar não modifica sessões, automações, créditos ou equipe');
  ok(/rascunho.*revisão/i.test(await p.locator('#ptProImportStatus').innerText()), 'sucesso informa que a importação continua como rascunho');

  const beforeSession = after;
  await tab('presencial'); await p.locator('#ptProSessAluno').selectOption('demo-ana');
  await p.locator('#ptProSessObs').fill('Sessão fictícia acompanhada pela profissional.');
  await p.locator('#ptProSessStart').click(); await waitCount('personal_sessoes', beforeSession.personal_sessoes.length + 1);
  await p.waitForFunction(() => document.querySelectorAll('#ptProSets .ptpro-set').length === 1);
  let session = (await snapshot()).personal_sessoes.find(row => !beforeSession.personal_sessoes.some(old => old.id === row.id));
  eq([session.aluno_id, session.profissional_id, session.status], ['demo-ana', 'demo-prof-marina', 'em_andamento'], 'iniciar sessão grava aluno e profissional fictícios');
  await p.locator('#ptProSets .ptpro-set').nth(0).locator('[data-k="exercicio"]').fill('Agachamento');
  await p.locator('#ptProSets .ptpro-set').nth(0).locator('[data-k="reps"]').fill('8');
  await p.locator('#ptProSets .ptpro-set').nth(0).locator('[data-k="carga"]').fill('30 kg');
  await p.locator('#ptProAddSet').click();
  await p.locator('#ptProSets .ptpro-set').nth(1).locator('[data-k="exercicio"]').fill('Remada unilateral');
  await p.locator('#ptProSets .ptpro-set').nth(1).locator('[data-k="reps"]').fill('12');
  await p.locator('#ptProSets .ptpro-set').nth(1).locator('[data-k="carga"]').fill('18 kg');
  await p.locator('#ptProAddSet').click(); await p.locator('#ptProSets .ptpro-set').nth(2).getByRole('button', { name: 'Remover série' }).click();
  eq(await p.locator('#ptProSets .ptpro-set').count(), 2, 'adicionar e remover série conserva as outras linhas');
  await p.locator('#ptProSessFinish').click();
  await p.waitForFunction(id => MT_CENTRAL_PRO_DEMO.snapshot().personal_sessoes.find(row => row.id === id).status === 'concluida', session.id);
  after = await snapshot(); session = after.personal_sessoes.find(row => row.id === session.id);
  eq(session.dados, { observacao: 'Sessão fictícia acompanhada pela profissional.', series: [{ exercicio: 'Agachamento', reps: '8', carga: '30 kg' }, { exercicio: 'Remada unilateral', reps: '12', carga: '18 kg' }] }, 'finalização conserva as séries e observação preenchidas');
  ok(!!session.encerrado_em && await p.locator('#ptProSessFinish').isDisabled(), 'sessão concluída recebe encerramento e não oferece segunda finalização');
  eq(after.personal_sessoes.length, beforeSession.personal_sessoes.length + 1, 'finalizar atualiza a sessão existente sem duplicar');
  unchangedExcept(beforeSession, after, 'personal_sessoes', 'modo presencial altera apenas as sessões fictícias');

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
    await p.waitForFunction(event => document.querySelector('#ptProQueueList').textContent.includes(event), event);
  }

  await tab('agenda'); const beforeWait = await snapshot();
  await p.locator('#ptProWaitAluno').selectOption('demo-ana'); await p.locator('#ptProWaitDia').fill('2026-09-19'); await p.locator('#ptProWaitHora').fill('10:30');
  await p.locator('#ptProWaitSave').click(); await waitCount('personal_lista_espera', beforeWait.personal_lista_espera.length + 1);
  after = await snapshot(); const waiting = after.personal_lista_espera.find(row => !beforeWait.personal_lista_espera.some(old => old.id === row.id));
  eq([waiting.aluno_id, waiting.dia, waiting.hora.slice(0, 5), waiting.status], ['demo-ana', '2026-09-19', '10:30', 'aguardando'], 'lista de espera conserva aluno, data e horário escolhidos');
  unchangedExcept(beforeWait, after, 'personal_lista_espera', 'lista de espera não mexe em créditos ou sessões');
  await p.waitForFunction(() => document.querySelector('#ptProWaitList').textContent.includes('10:30'));
  await p.locator('#ptProCredAluno').selectOption('demo-ana');
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
  await p.locator('#ptProTeamAluno').selectOption('demo-ana'); await p.locator('#ptProResp').selectOption('demo-prof-rafael');
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
  await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.locator('#demoProRecomecar').click()]);
  await p.locator('#ptProSuite.aberta').waitFor({ state: 'visible' });
  eq(await snapshot(), initial, 'Recomeçar restaura somente as tabelas fictícias iniciais');
  eq(await storage(), storageBefore, 'Recomeçar não limpa autenticação nem dados do Personal');
  eq(denied, { external: 0, api: 0, writes: 0, sockets: 0 }, 'demonstração inteira não tenta acessar APIs, enviar POST ou abrir sockets');
  eq(errors, [], 'os cinco fluxos não produzem erros JavaScript');
  await context.close();
  console.log('PASSOU: ' + checks + ' verificações da demonstração Central Pro');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
