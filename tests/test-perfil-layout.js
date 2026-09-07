/* A ficha do aluno reúne oito áreas sem misturar pessoas, rascunhos ou acessos. */
const assert = require('assert/strict');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const { comMockNuvem } = require('./_nuvem.js');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765';
const AREAS = ['resumo', 'treino', 'freq', 'aval', 'quest', 'cadastro', 'app', 'fin'];
let browser, checks = 0;
function eq(value, expected, name) { assert.deepEqual(value, expected, name); checks++; console.log('OK: ' + name); }
function ok(value, name) { assert.ok(value, name); checks++; console.log('OK: ' + name); }

(async () => {
  browser = comMockNuvem(await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }));
  const context = await browser.newContext({ viewport: { width: 360, height: 844 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', serviceWorkers: 'block' });
  const network = [], errors = [], dialogs = [];
  await context.route('**://*.supabase.co/**', route => { network.push(route.request().url()); return route.abort(); });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => { dialogs.push(dialog.message()); return dialog.dismiss(); });
  await page.clock.setFixedTime(new Date('2026-09-07T09:00:00-03:00'));
  await page.goto(BASE + '/demo-personal.html'); await page.locator('#btnDemo').click(); await page.waitForURL(/personal\.html/);
  await page.waitForFunction(() => window.__perfilPT && window.mockNuvem);
  await page.evaluate(() => {
    const S = window.MTStore, st = S.read('ptStudio', {});
    window.__perfilCloudOriginal = S.cloud;
    window.__perfilWrites = [];
    window.__perfilRetornos = {
      'perfil-token-a': { peso: { '2026-09-07': 88.8 }, feitos: { '2026-09-07': 1 }, notas: [{ d: '2026-09-07', t: 'Registro exclusivo de Ágata' }] },
      'perfil-token-b': { peso: { '2026-09-07': 62.3 }, feitos: { '2026-09-06': 1 }, notas: [{ d: '2026-09-07', t: 'Registro exclusivo de Beatriz' }] },
    };
    S.cloud = () => {
      const n = window.mockNuvem({ aid: 'perfil-test', tabelas: {
        app_aluno: q => q.colunas === 'retorno' ? [{ retorno: window.__perfilRetornos[q.filtros.token] || {} }] : [],
        app_quest: q => [{ questionario: 'Check-in semanal', criado: '2026-09-07T10:00:00Z', dados: { pontuacao: 6, respostas: [{ sigla: 'MOTEX', pergunta: 'Como está a motivação?', resposta: q.filtros.token === 'perfil-token-b' ? 'Ótima' : 'Boa', pontos: 2 }] } }],
      }, onEscreve: w => window.__perfilWrites.push({ tabela: w.tabela, acao: w.acao }) });
      const from = n.client.from.bind(n.client);
      n.client.from = tb => {
        const q = from(tb), then = q.then.bind(q);
        q.then = (resolve, reject) => {
          if (window.__perfilAtrasaA && tb === 'app_aluno' && q.colunas === 'retorno' && q.filtros.token === 'perfil-token-a') {
            window.__perfilResolveA = () => resolve({ data: [{ retorno: { peso: { '2026-09-07': 199.9 }, notas: [{ d: '2026-09-07', t: 'RETORNO ATRASADO DE ÁGATA' }] } }], error: null });
            return;
          }
          return then(resolve, reject);
        };
        return q;
      };
      return n;
    };
    st.alunos = [
      { id: 'perfil-a', nome: 'Ágata Oliveira de Albuquerque e Vasconcelos', ativo: true, appTokenP: 'perfil-token-a', acessoEm: '2026-09-01', email: 'agata@example.test', objetivo: 'Ganhar força e melhorar o condicionamento com progressão gradual', valor: 200, modo: 'mes', metaSemana: 3 },
      { id: 'perfil-b', nome: 'Beatriz Santana', ativo: true, appTokenP: 'perfil-token-b', acessoEm: '2026-09-01', email: 'beatriz@example.test', objetivo: 'Condicionamento', valor: 250, modo: 'mes', metaSemana: 2 },
    ];
    st.alunos.forEach(a => { a.appVer = window.MT_VERSAO; a.appPubEm = '2026-09-07T12:00:00Z'; a.retorno = window.__perfilRetornos[a.appTokenP]; });
    st.sessoes = [
      { id: 'perfil-s-a', alunoId: 'perfil-a', data: '2026-09-07', hora: '11:30' },
      { id: 'perfil-s-b', alunoId: 'perfil-b', data: '2026-09-08', hora: '07:00' },
      { id: 'perfil-feita-a', alunoId: 'perfil-a', data: '2026-09-06', hora: '11:30', feita: true },
    ];
    st.pagamentos = []; st.contratosPT = []; st.planosPT = []; st.agFixas = []; st.bloqueios = []; st.avaliacoes = []; st.diarioPT = {};
    st.config = Object.assign({}, st.config, { dia1Off: true, zapFilaOff: true });
    const exId = st.exercicios[0].id;
    st.treinosV2 = {};
    st.alunos.forEach(a => { st.treinosV2[a.id] = { fichasEm: '2026-09-06', fichas: [{ id: a.id + '-ficha', titulo: 'A — Força e estabilidade', itens: [{ exId, series: 3, reps: '10', descanso: 60 }] }], plano: { dias: { '1': { tp: 'ficha', id: a.id + '-ficha' } } } }; });
    localStorage.setItem('mtapp:ptStudio', JSON.stringify(st)); window.__ptStudio.render(); window.__perfilPT('perfil-a');
  });
  const area = async value => {
    if (await page.locator('#pfArea').isVisible()) await page.locator('#pfArea').selectOption(value);
    else await page.locator('#pfAbas [data-pfa="' + value + '"]').click();
  };
  const selected = () => page.evaluate(() => ({
    select: document.getElementById('pfArea').value,
    tab: document.querySelector('#pfAbas .ativa').dataset.pfa,
    shown: [...new Set([...document.querySelectorAll('#vPerfil [data-pfsec]')].filter(e => !e.hidden).map(e => e.dataset.pfsec))],
  }));
  await page.waitForFunction(() => document.querySelector('#pfKpiPeso .v').textContent.includes('88,8'));
  eq(await page.locator('#pfArea option').evaluateAll(options => options.map(o => o.value)), AREAS, 'seletor móvel oferece as oito áreas da ficha');
  eq(await selected(), { select: 'resumo', tab: 'resumo', shown: ['resumo'] }, 'perfil abre no Resumo com seletor e abas sincronizados');
  for (const value of AREAS) {
    await area(value);
    eq(await selected(), { select: value, tab: value, shown: [value] }, 'seletor móvel abre somente a área ' + value);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const value of AREAS) {
    await page.locator('#pfAbas [data-pfa="' + value + '"]').click();
    eq(await selected(), { select: value, tab: value, shown: [value] }, 'aba desktop sincroniza a área ' + value);
  }
  eq(await page.locator('#vPerfil [id]').evaluateAll(elements => {
    const counts = {}; elements.forEach(e => counts[e.id] = (counts[e.id] || 0) + 1);
    return Object.keys(counts).filter(id => counts[id] > 1);
  }), [], 'áreas e conteúdo renderizado não duplicam IDs');
  eq(await page.locator('#pfAgenda').count(), 1, 'agenda individual possui uma única instância');
  eq(await page.locator('#pfAgenda').evaluate(e => e.closest('[data-pfsec]').dataset.pfsec), 'freq', 'agenda completa pertence à Frequência');
  eq(await page.locator('#pfPlanoResumo').evaluate(e => e.closest('[data-pfsec]').dataset.pfsec), 'treino', 'semana e resumo da prescrição pertencem a Treino');
  eq(await page.locator('#pfProxima').evaluate(e => e.closest('[data-pfsec]').dataset.pfsec), 'resumo', 'Resumo mantém a próxima sessão sem duplicar a agenda completa');

  await area('cadastro'); await page.locator('#pfNome').fill('Nome em edição ainda não salvo');
  await page.locator('#pfObs').fill('Observação em edição ainda não salva');
  await area('treino'); await area('cadastro');
  eq(await page.locator('#pfNome').inputValue(), 'Nome em edição ainda não salvo', 'trocar de aba preserva o nome em edição');
  eq(await page.locator('#pfObs').inputValue(), 'Observação em edição ainda não salva', 'trocar de aba preserva as observações em edição');
  eq(await page.evaluate(() => window.MTStore.read('ptStudio', {}).alunos[0].nome), 'Ágata Oliveira de Albuquerque e Vasconcelos', 'trocar de aba não salva o rascunho automaticamente');

  await area('resumo'); await page.locator('#pfProxima [data-pfagenda]').click();
  eq((await selected()).select, 'freq', 'próxima sessão abre a agenda individual na Frequência');
  ok(await page.locator('#pfAgenda').isVisible(), 'agenda individual fica visível após o atalho');
  await page.locator('#pfIrAgenda').click();
  eq(await page.locator('#sAluno').inputValue(), 'perfil-a', 'Agendar leva o aluno do perfil para o formulário');
  eq(await page.evaluate(() => window.MTStore.read('ptStudio', {}).sessoes.length), 3, 'abrir Agendar não cria ou altera sessões');
  await page.evaluate(() => window.__perfilPT('perfil-a')); await area('treino'); await page.locator('#pfMontaTreino').click();
  eq(await page.locator('#tAluno').inputValue(), 'perfil-a', 'Montar treino seleciona o aluno correto');
  eq(await page.locator('#taAluno').inputValue(), 'perfil-a', 'o gerador recebe o mesmo aluno');
  await page.evaluate(() => window.__perfilPT('perfil-a')); await page.locator('#pfIrChat').click();
  eq(await page.locator('#chatTitulo').innerText(), 'Ágata Oliveira de Albuquerque e Vasconcelos', 'Chat abre o destinatário do perfil');
  eq(await page.evaluate(() => window.__perfilWrites.filter(w => w.tabela === 'app_chat' && w.acao === 'insert')), [], 'abrir o chat não envia mensagem');

  // Uma resposta de perfil abandonado não pode substituir o aluno atual.
  await page.evaluate(() => { window.__perfilAtrasaA = true; window.__perfilPT('perfil-a'); });
  await page.waitForFunction(() => typeof window.__perfilResolveA === 'function');
  await page.evaluate(() => window.__perfilPT('perfil-b'));
  await page.waitForFunction(() => document.querySelector('#pfKpiPeso .v').textContent.includes('62,3'));
  await page.evaluate(() => window.__perfilResolveA());
  eq(await page.locator('#pfTitulo').innerText(), 'Beatriz Santana', 'resposta atrasada preserva o título do aluno atual');
  eq(await page.locator('#pfNome').inputValue(), 'Beatriz Santana', 'trocar de aluno substitui o cadastro pelo da pessoa escolhida');
  ok((await page.locator('#pfKpiPeso .v').innerText()).includes('62,3'), 'retorno atrasado não troca os indicadores do aluno atual');
  await area('app');
  ok(!(await page.locator('#pfAppDados').innerText()).includes('199,9') && !(await page.locator('#pfAppDados').innerText()).includes('RETORNO ATRASADO'), 'registros de outro aluno não entram na aba App');

  await page.evaluate(() => {
    const nav = document.querySelector('#abas [data-a="pagamentos"]'); window.__perfilNavAntes = nav.style.display; nav.style.display = 'none';
    window.__pfAba('fin');
  });
  ok(!(await page.locator('[data-pfsec="fin"]').isVisible()), 'guarda financeira bloqueia a área quando o acesso foi retirado');
  await page.evaluate(() => { document.querySelector('#abas [data-a="pagamentos"]').style.display = window.__perfilNavAntes; window.MTStore.cloud = window.__perfilCloudOriginal; });
  ok(dialogs.every(t => /colaborador|financeiro|dono/i.test(t)), 'nenhuma ação de envio ou exclusão foi solicitada');
  eq(network, [], 'nenhuma chamada alcança o Supabase real');
  eq(errors, [], 'nenhum erro JavaScript ao percorrer as oito áreas');
  console.log(checks + ' verificações passaram.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
