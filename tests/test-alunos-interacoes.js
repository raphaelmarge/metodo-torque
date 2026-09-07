/* Interações da carteira: filtrar e abrir atalhos não alteram dados do aluno.
 * Somente dados sintéticos, relógio fixo e cliente de nuvem compartilhado. */
const assert = require('assert/strict');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const { comMockNuvem } = require('./_nuvem.js');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765';
let browser, checks = 0;
function equal(actual, expected, message) { assert.deepEqual(actual, expected, message); console.log('OK: ' + message); checks++; }
function truth(value, message) { assert.ok(value, message); console.log('OK: ' + message); checks++; }

(async () => {
  browser = comMockNuvem(await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }));
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', serviceWorkers: 'block' });
  const network = [], errors = [], dialogs = [];
  await context.route('**://*.supabase.co/**', route => { network.push(route.request().url()); return route.abort(); });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => { dialogs.push(dialog.message()); return dialog.dismiss(); });
  await page.clock.setFixedTime(new Date('2026-09-07T09:00:00-03:00'));
  await page.goto(BASE + '/demo-personal.html');
  await page.locator('#btnDemo').click();
  await page.waitForURL(/personal\.html/);
  await page.waitForFunction(() => window.__alFiltro && window.__alBusca && window.mockNuvem);
  await page.evaluate(() => {
    const S = window.MTStore, st = S.read('ptStudio', {});
    window.__alTestCloud = S.cloud;
    window.__alTestWrites = [];
    const mensagens = {
      'token-agata': [{ de: 'aluno', texto: 'Mensagem exclusiva de Ágata', criado: '2026-09-07T11:00:00Z', lida: true }],
      'token-joao': [{ de: 'aluno', texto: 'Mensagem exclusiva de João', criado: '2026-09-07T11:05:00Z', lida: true }],
    };
    S.cloud = () => window.mockNuvem({ aid: 'alunos-test', tabelas: {
      app_chat: q => mensagens[q.filtros.token] || [],
    }, onEscreve: w => window.__alTestWrites.push({ tabela: w.tabela, acao: w.acao, corpo: w.corpo }) });
    st.alunos = [
      { id: 'qa-agata', nome: 'Ágata Oliveira', zap: '(31) 9 8765-4321', ativo: true, appTokenP: 'token-agata' },
      { id: 'qa-joao', nome: 'João Àvila de Albuquerque e Vasconcelos', zap: '31991234567', ativo: true, appTokenP: 'token-joao' },
      { id: 'qa-devedor', nome: 'José dos Santos', zap: '31993456789', ativo: true, modo: 'mes', valor: 300, venc: 5, desde: '2026-08-01' },
      { id: 'qa-sumindo', nome: 'Maria Sumindo', ativo: true },
      { id: 'qa-novo', nome: 'Beto Novo', ativo: true, appTokenP: 'token-revogado', appRevogadoEm: '2026-09-06T12:00:00Z' },
      { id: 'qa-encerrada', nome: 'Renata Encerrada', ativo: false },
      { id: 'qa-sem-ficha', nome: 'Luísa Sem Ficha', ativo: true },
    ];
    for (let i = 0; i < 65; i++) st.alunos.push({ id: 'qa-extra-' + String(i).padStart(3, '0'), nome: 'Zilda Paginação ' + String(i).padStart(3, '0'), ativo: true });
    // Os dois apps de chat já estão atualizados: o timer de migração não faz parte deste fluxo.
    st.alunos.filter(a => a.appTokenP).forEach(a => { a.appVer = window.MT_VERSAO; a.appPubEm = '2026-09-07T12:00:00.000Z'; });
    st.sessoes = [
      { id: 'qa-agata-past', alunoId: 'qa-agata', data: '2026-09-07', hora: '06:00', feita: false },
      { id: 'qa-agata-done', alunoId: 'qa-agata', data: '2026-09-07', hora: '09:30', feita: true },
      { id: 'qa-agata-absent', alunoId: 'qa-agata', data: '2026-09-07', hora: '10:00', faltou: true },
      { id: 'qa-agata-next', alunoId: 'qa-agata', data: '2026-09-07', hora: '11:30' },
      { id: 'qa-joao-no-time', alunoId: 'qa-joao', data: '2026-09-07', hora: '' },
      { id: 'qa-joao-future', alunoId: 'qa-joao', data: '2026-09-08', hora: '07:45' },
      { id: 'qa-sumindo-last', alunoId: 'qa-sumindo', data: '2026-09-01', hora: '07:00', feita: true },
      { id: 'qa-devedor-last', alunoId: 'qa-devedor', data: '2026-09-01', hora: '08:00', feita: true },
    ];
    st.pagamentos = []; st.bloqueios = []; st.agFixas = [];
    st.servicosPT = [{ id: 'qa-servico', nome: 'Avaliação sintética', valor: 50 }];
    st.planosPT = [{ id: 'qa-plano', nome: 'Mensal <Força>', valor: 300 }];
    st.contratosPT = [{ id: 'qa-contrato', alunoId: 'qa-devedor', planoId: 'qa-plano', status: 'ativo', inicio: '2026-08-01', diaVenc: 5 }];
    st.config = Object.assign({}, st.config, { dia1Off: true, zapFilaOff: true, atrasoDias: 0 });
    const exId = (st.exercicios[0] || {}).id;
    st.treinosV2 = {};
    st.alunos.forEach(a => { if (a.id !== 'qa-sem-ficha') st.treinosV2[a.id] = { fichasEm: '2026-09-06', fichas: [{ id: 'ficha-' + a.id, titulo: 'A — Força e estabilidade', itens: exId ? [{ exId, series: 3, reps: '10', descanso: 60 }] : [] }] }; });
    localStorage.setItem('mtapp:ptStudio', JSON.stringify(st));
    window.__ptStudio.render();
    window.__vaiAba('alunos'); window.__alFiltro('ativos');
  });
  const ids = () => page.locator('#listaAlunos [data-alrow]').evaluateAll(rows => rows.map(r => r.dataset.alrow));
  const state = () => page.evaluate(() => {
    const st = window.MTStore.read('ptStudio', {});
    return { alunos: st.alunos, sessoes: st.sessoes, pagamentos: st.pagamentos, treinosV2: st.treinosV2, contratosPT: st.contratosPT, agFixas: st.agFixas };
  });
  const initial = await state();
  const back = async () => { if (await page.locator('#pfFechar').isVisible()) await page.locator('#pfFechar').click(); await page.evaluate(() => window.__vaiAba('alunos')); };
  const open = async id => {
    const button = page.locator('[data-alquick="' + id + '"]');
    if (await button.getAttribute('aria-expanded') !== 'true') await button.click();
    await page.locator('#ali-panel-' + id).waitFor({ state: 'visible' });
  };
  const action = (id, kind) => page.locator('#ali-panel-' + id + ' .ali-shortcuts [data-alacao="' + kind + '"]');

  equal(await page.locator('#alFiltrosPainel').isVisible(), false, 'filtros começam recolhidos');
  equal(await page.locator('#alOrdem').inputValue(), 'nome', 'ordem padrão é Nome');
  equal((await ids()).length, 60, 'carteira grande começa com 60 alunos');
  equal(await page.locator('.ali-panel,[data-acoes]').count(), 0, 'painéis e menu administrativo só existem quando abertos');
  truth(/71 alunos encontrados.*60/.test(await page.locator('#alResultados').innerText()), 'resultado informa total e lote atual');
  await page.locator('#alMais').click();
  equal((await ids()).length, 71, 'Ver mais completa o restante sem duplicar aluno');
  equal(new Set(await ids()).size, 71, 'paginação mantém IDs únicos');
  for (const [query, expected] of [['agata', 'qa-agata'], ['AVILA', 'qa-joao'], ['(31) 98765-4321', 'qa-agata']]) {
    await page.locator('#alBusca').fill(query);
    equal(await ids(), [expected], 'busca normalizada encontra ' + query);
  }
  await page.locator('#alBusca').fill('nome inexistente');
  equal(await ids(), [], 'busca alfabética ausente não corresponde a todo telefone');
  await page.locator('#alLimparBusca').click();
  equal(await page.locator('#alBusca').inputValue(), '', 'Limpar busca também limpa o campo visível');
  equal((await ids()).length, 60, 'nova busca volta ao primeiro lote');

  await page.locator('#alFiltrosBt').click();
  await page.locator('[data-alctx="hoje"]').click();
  equal(await ids(), ['qa-agata', 'qa-joao'], 'Hoje reúne os alunos com sessão no dia');
  await page.locator('#alBusca').fill('joao');
  equal(await ids(), ['qa-joao'], 'contexto Hoje combina com busca sem acento');
  await page.locator('[data-alf="devendo"]').click();
  equal(await ids(), [], 'status, contexto e busca são combinados');
  await page.locator('#alLimparFiltros').click();
  equal(await page.locator('#alBusca').inputValue(), 'joao', 'Limpar filtros preserva o termo de busca');
  equal(await ids(), ['qa-joao'], 'Limpar filtros retorna ao status ativo');
  await page.locator('#alLimparBusca').click();
  await page.locator('[data-alctx="treino"]').click();
  equal(await ids(), ['qa-sem-ficha'], 'Treino a revisar encontra a prescrição ausente');
  await page.locator('[data-alctx="sem-sessao"]').click();
  truth(!(await ids()).includes('qa-agata') && !(await ids()).includes('qa-joao') && (await ids()).includes('qa-sem-ficha'), 'Sem sessão exclui pendentes de hoje ou futuras');
  equal(await page.locator('#alContextos [aria-pressed="true"]').count(), 1, 'contextos são mutuamente exclusivos');
  await page.locator('[data-alf="sumindo"]').click();
  equal(await ids(), ['qa-devedor', 'qa-sumindo'], 'Sumindo preserva a régua canônica mesmo se o aluno também deve');
  await page.locator('#alLimparFiltros').click();
  await page.locator('#alOrdem').selectOption('proxima');
  equal((await ids()).slice(0, 2), ['qa-joao', 'qa-agata'], 'Próxima sessão preserva o pendente sem horário e a sessão anterior de hoje');
  truth(/06:00/.test(await page.locator('[data-alrow="qa-agata"]').innerText()), 'próxima da lista mantém a sessão pendente de hoje às 06:00');
  await page.locator('#alOrdem').selectOption('prioridades');
  equal((await ids())[0], 'qa-sem-ficha', 'Prioridades traz a prescrição que precisa de atenção');
  await page.locator('#alOrdem').selectOption('nome');
  await page.locator('#alFiltrosBt').click();

  await open('qa-agata');
  equal(await page.locator('.ali-panel').count(), 1, 'Ações abre um único painel');
  equal(await page.locator('#ali-panel-qa-agata [data-alacao]').evaluateAll(buttons => [...new Set(buttons.map(b => b.dataset.aluno))]), ['qa-agata'], 'todos os atalhos pertencem ao aluno aberto');
  await open('qa-joao');
  equal(await page.locator('.ali-panel').count(), 1, 'abrir outro aluno remove o painel anterior');
  equal(await page.locator('[data-alquick="qa-agata"]').getAttribute('aria-expanded'), 'false', 'botão anterior anuncia painel fechado');
  equal(await page.locator('[data-acoes="qa-joao"]').isVisible(), false, 'Mais opções começa fechado');
  await page.locator('[data-mais="qa-joao"]').click();
  truth(await page.locator('[data-acoes="qa-joao"] [data-rm="qa-joao"]').isVisible(), 'administrativo abre para o aluno correto');
  await page.keyboard.press('Escape');
  equal(await page.locator('.ali-panel').count(), 0, 'Escape fecha o painel e seu menu administrativo');
  equal(await page.evaluate(() => document.activeElement.getAttribute('data-alquick')), 'qa-joao', 'Escape devolve o foco ao botão Ações do mesmo aluno');
  await open('qa-devedor');
  await page.evaluate(() => {
    const nav = document.querySelector('#abas [data-a="pagamentos"]');
    window.__alTestPagStyle = nav.style.display; nav.style.display = 'none';
  });
  await action('qa-devedor', 'financeiro').click();
  truth(await page.locator('#vAlunos').isVisible(), 'Financeiro reavalia o modo colaborador mesmo com botão já renderizado');
  truth(dialogs.length === 1 && /modo colaborador/.test(dialogs[0]), 'ação financeira bloqueada orienta sobre a permissão atual');
  await page.evaluate(() => { document.querySelector('#abas [data-a="pagamentos"]').style.display = window.__alTestPagStyle; });
  equal(await state(), initial, 'buscar, filtrar, ordenar e abrir menus não grava dados de negócio');

  await page.locator('#listaAlunos [data-abreperfil="qa-agata"]').click();
  equal(await page.locator('#pfTitulo').innerText(), 'Ágata Oliveira', 'nome continua abrindo o perfil correto');
  await back(); await open('qa-joao'); await action('qa-joao', 'treino').click();
  equal(await page.locator('#tAluno').inputValue(), 'qa-joao', 'Treino seleciona o aluno do painel');
  equal(await page.locator('#taAluno').inputValue(), 'qa-joao', 'montador e gerador usam o mesmo aluno');
  await back(); await open('qa-devedor'); await action('qa-devedor', 'financeiro').click();
  equal(await page.locator('#pfTitulo').innerText(), 'José dos Santos', 'Financeiro abre o perfil individual correto');
  truth(await page.locator('[data-pfsec="fin"]').isVisible(), 'Financeiro individual está visível');
  await back(); await open('qa-agata');
  await page.locator('#ali-panel-qa-agata [data-alacao="agenda"]').click();
  equal(await page.locator('#pfTitulo').innerText(), 'Ágata Oliveira', 'Ver agenda abre o aluno correspondente');
  truth(await page.locator('#pfAgenda').isVisible(), 'agenda individual segura fica visível');
  equal(await state(), initial, 'abrir perfil, treino, financeiro e agenda não altera sessões ou cobranças');

  // Uma remarcação abandonada não pode contaminar o atalho Agendar de outro aluno.
  await page.locator('#pfFechar').click();
  await page.evaluate(() => { window.__vaiAba('agenda'); window.__agAba('sessoes'); });
  await page.locator('#vAgenda [data-smais="qa-agata-past"]:visible').first().click();
  await page.locator('#vAgenda [data-sremarca="qa-agata-past"]:visible').first().click();
  equal(await page.evaluate(() => window.__agRemarca.id()), 'qa-agata-past', 'fixture entra numa remarcação real');
  await page.locator('#sTurmaBt').click();
  await page.locator('#sTipo').selectOption('qa-servico');
  await page.evaluate(() => {
    document.querySelector('#sTurmaChips .stc').checked = true;
    document.getElementById('sRep').checked = true;
    document.getElementById('sRepAte').value = '2026-10-01';
    document.querySelector('#sRepDias .srd').checked = true;
  });
  await back(); await open('qa-joao'); await action('qa-joao', 'agendar').click();
  equal(await page.locator('#sAluno').inputValue(), 'qa-joao', 'Agendar identifica o aluno escolhido');
  equal(await page.evaluate(() => ({ edit: window.__agRemarca.id(), turma: !document.getElementById('sTurmaBox').hidden,
    checks: document.querySelectorAll('#sTurmaChips .stc:checked').length, rep: document.getElementById('sRep').checked,
    ate: document.getElementById('sRepAte').value, dias: document.querySelectorAll('#sRepDias .srd:checked').length,
    tipo: document.getElementById('sTipo').value })), { edit: null, turma: false, checks: 0, rep: false, ate: '', dias: 0, tipo: '' }, 'atalho limpa remarcação, turma, repetição e serviço anteriores');
  equal(await state(), initial, 'preparar novo agendamento não modifica a sessão anterior');

  await back(); await open('qa-agata'); await action('qa-agata', 'chat').click();
  await page.waitForFunction(() => document.getElementById('chatMsgs').textContent.includes('Mensagem exclusiva de Ágata'));
  await page.locator('#chatTexto').fill('Rascunho exclusivo para Ágata');
  await back(); await open('qa-joao'); await action('qa-joao', 'chat').click();
  equal(await page.locator('#chatTitulo').innerText(), 'João Àvila de Albuquerque e Vasconcelos', 'Chat abre o destinatário correto');
  equal(await page.locator('#chatTexto').inputValue(), '', 'rascunho de Ágata não aparece na conversa de João');
  await page.locator('#chatTexto').fill('Rascunho exclusivo para João');
  await back(); await open('qa-agata'); await action('qa-agata', 'chat').click();
  equal(await page.locator('#chatTexto').inputValue(), 'Rascunho exclusivo para Ágata', 'voltar à conversa recupera seu próprio rascunho');

  // A consulta antiga chega depois da conversa nova; não pode pintar A sobre B.
  await page.evaluate(() => {
    const original = window.MTStore.cloud;
    window.MTStore.cloud = () => {
      const n = original(), from = n.client.from.bind(n.client);
      n.client.from = tabela => {
        const q = from(tabela), then = q.then.bind(q);
        q.then = (fn, err) => tabela === 'app_chat' && q.filtros.token === 'token-agata' && q.colunas === 'de,texto,criado,lida'
          ? new Promise(resolve => { window.__alLateResolve = () => resolve(fn({ data: [{ de: 'aluno', texto: 'RESPOSTA ATRASADA DE ÁGATA', criado: '2026-09-07T12:01:00Z', lida: true }], error: null })); })
          : then(fn, err);
        return q;
      };
      return n;
    };
    window.__chatPT.abre('qa-agata');
  });
  await page.waitForFunction(() => typeof window.__alLateResolve === 'function');
  await back(); await open('qa-joao'); await action('qa-joao', 'chat').click();
  await page.waitForFunction(() => document.getElementById('chatMsgs').textContent.includes('Mensagem exclusiva de João'));
  await page.evaluate(() => window.__alLateResolve());
  equal(await page.locator('#chatTitulo').innerText(), 'João Àvila de Albuquerque e Vasconcelos', 'resposta tardia mantém o título do destinatário atual');
  truth(!(await page.locator('#chatMsgs').innerText()).includes('ATRASADA') && (await page.locator('#chatMsgs').innerText()).includes('João'), 'resposta de outra conversa não substitui as mensagens atuais');
  equal(await page.locator('#chatTexto').inputValue(), 'Rascunho exclusivo para João', 'resposta tardia também preserva o rascunho atual');
  equal(await page.locator('#chatAlunos [data-chat="qa-novo"]').count(), 0, 'acesso revogado não aparece como conversa acionável');
  await back(); await open('qa-novo'); await action('qa-novo', 'chat').click();
  truth(await page.locator('#vAlunos').isVisible(), 'Chat com acesso revogado mantém o professor na lista');
  equal(await page.locator('#chatTitulo').innerText(), 'João Àvila de Albuquerque e Vasconcelos', 'atalho bloqueado não troca o destinatário atual');
  truth(dialogs.length === 2 && /app com acesso ativo/.test(dialogs[1]), 'atalho de aluno revogado explica que o acesso precisa estar ativo');
  await page.locator('#listaAlunos [data-abreperfil="qa-novo"]').click();
  await page.locator('#pfIrChat').click();
  truth(await page.locator('#vPerfil').isVisible(), 'Chat do perfil sem acesso mantém o perfil aberto');
  equal(await page.locator('#chatTitulo').innerText(), 'João Àvila de Albuquerque e Vasconcelos', 'Chat bloqueado do perfil não apresenta uma conversa anterior como destino');
  truth(dialogs.length === 3 && /app com acesso ativo/.test(dialogs[2]), 'Chat do perfil usa o mesmo aviso de acesso ativo');
  equal(await state(), initial, 'atalhos de conversa não alteram os dados do aluno');
  equal(await page.evaluate(() => window.__alTestWrites.filter(w => w.tabela === 'app_chat' && w.acao === 'insert')), [], 'nenhuma mensagem é enviada durante a navegação');
  await page.evaluate(() => { window.MTStore.cloud = window.__alTestCloud; });
  equal(dialogs.length, 3, 'somente os avisos de permissão e acesso revogado foram exibidos');
  equal(errors, [], 'nenhum erro JavaScript nos novos caminhos');
  equal(network, [], 'nenhuma requisição real ao Supabase');
  console.log(checks + ' verificações passaram.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
