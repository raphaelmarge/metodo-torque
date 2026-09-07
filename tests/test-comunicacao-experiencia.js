/* Comunicação do Personal: dados corretos, rascunhos e estados de erro reais. */
const assert = require('assert/strict');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const { comMockNuvem } = require('./_nuvem.js');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765';
let browser, checks = 0;
const eq = (a, b, name) => { assert.deepEqual(a, b, name); checks++; console.log('OK: ' + name); };
const ok = (v, name) => { assert.ok(v, name); checks++; console.log('OK: ' + name); };
(async () => {
  browser = comMockNuvem(await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }));
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', serviceWorkers: 'block' });
  const network = [], errors = [], dialogs = [];
  await context.route('**://*.supabase.co/**', r => { network.push(r.request().url()); return r.abort(); });
  const p = await context.newPage(); p.on('pageerror', e => errors.push(e.message));
  p.on('dialog', d => { dialogs.push(d.message()); return d.dismiss(); });
  await p.clock.setFixedTime(new Date('2026-09-07T09:00:00-03:00'));
  await p.goto(BASE + '/demo-personal.html'); await p.locator('#btnDemo').click(); await p.waitForURL(/personal\.html/);
  await p.waitForFunction(() => window.__assessoriaUI && window.__chatPT && window.mockNuvem);
  await p.evaluate(() => {
    const S = window.MTStore, st = S.read('ptStudio', {}); window.__comCloudOriginal = S.cloud;
    st.alunos = [
      { id: 'com-a', nome: 'Ágata Oliveira de Albuquerque e Vasconcelos', ativo: true, appTokenP: 't-a', zap: '(31) 98888-1234', metaSemana: 3, retorno: { feitos: { '2026-09-07': 1, '2026-09-05': 1, '2026-09-99': 1, '2030-01-01': 1 } } },
      { id: 'com-b', nome: 'Beatriz Santana', ativo: true, appTokenP: 't-b', zap: '31977771234', retorno: { feitos: { '2026-09-01': 1 } } },
      { id: 'com-c', nome: 'Carlos Silva', ativo: true, appTokenP: 't-c', metaSemana: 1, retorno: { feitos: { '2026-09-07': 1 } } },
      { id: 'com-d', nome: 'Davi Nunes', ativo: true, appTokenP: 't-d' },
      { id: 'com-e', nome: 'Érica Acesso pausado', ativo: true, appTokenP: 't-e', appRevogadoEm: '2026-09-01', retorno: { feitos: { '2026-09-07': 1 } } },
      { id: 'com-f', nome: 'Fernando Sem app', ativo: true },
      { id: 'com-g', nome: 'Geraldo Inativo', ativo: false, appTokenP: 't-g' },
    ];
    st.sessoes = []; st.pagamentos = []; st.avaliacoes = []; st.agFixas = []; st.bloqueios = [];
    const exId = st.exercicios[0].id; st.treinosV2 = {};
    for (const a of st.alunos) st.treinosV2[a.id] = { fichas: [{ id: a.id + '-f', titulo: 'A — Treino de ' + a.nome, itens: [{ exId, series: 3, reps: '10', descanso: 60 }] }] };
    st.config = Object.assign({}, st.config, { dia1Off: true, zapFilaOff: true });
    localStorage.setItem('mtapp:ptStudio', JSON.stringify(st)); window.__ptStudio.render();
    window.__comMsgs = [
      { token: 't-a', de: 'aluno', texto: 'Dúvida sobre o treino de Ágata', criado: '2026-09-07T11:30:00Z', lida: false },
      { token: 't-a', de: 'personal', texto: 'Mensagem da noite anterior', criado: '2026-09-07T01:00:00Z', lida: false },
      { token: 't-b', de: 'aluno', texto: 'Mensagem exclusiva de Beatriz', criado: '2026-09-07T11:20:00Z', lida: false },
      { token: 't-e', de: 'aluno', texto: 'Revogado', criado: '2026-09-07T11:40:00Z', lida: false },
      { token: 't-g', de: 'aluno', texto: 'Inativo', criado: '2026-09-07T11:40:00Z', lida: false },
    ];
    window.__comLogs = [{ token: 't-a', dia: '2026-09-07', exercicio: 'Treinei' }, { token: 't-a', dia: '2026-09-06', exercicio: 'Treinei' }, { token: 't-b', dia: '2026-09-01', exercicio: 'Treinei' }];
    window.__comChecks = [{ token: 't-a', dia: '2026-09-07', nota: 4, peso: 72.4, texto: 'Check-in exclusivo de Ágata' }];
    window.__comWrites = []; window.__comListQueries = 0; window.__comConsultas = []; window.__comError = {}; window.__comPendingList = []; window.__comPendingAss = [];
    window.__comCloud = () => {
      const n = window.mockNuvem({ aid: 'com-test', tabelas: (q, tb) => {
        if (window.__comError[tb + ':' + q.acao] || (tb === 'app_chat' && q.filtros.token && window.__comError.conversa)) return { data: null, error: { message: 'Falha simulada' } };
        if (tb === 'app_chat') {
          if (q.acao === 'insert') { window.__comMsgs.unshift(Object.assign({ criado: '2026-09-07T12:00:00Z' }, q.corpo)); return { data: null, error: null }; }
          if (q.acao === 'update') { window.__comMsgs.filter(m => m.token === q.filtros.token && m.de === 'aluno').forEach(m => m.lida = true); return { data: null, error: null }; }
          if (!q.filtros.token) window.__comListQueries++;
          return window.__comMsgs.filter(m => !q.filtros.token || m.token === q.filtros.token).slice().sort((a, b) => b.criado.localeCompare(a.criado));
        }
        if (tb === 'app_treino_log') { window.__comConsultas.push(q.filtros.token); return window.__comLogs; }
        if (tb === 'app_checkin') return window.__comChecks;
        return [];
      }, onEscreve: w => window.__comWrites.push(w) });
      const from = n.client.from.bind(n.client);
      n.client.from = tb => {
        const q = from(tb), then = q.then.bind(q);
        q.then = (resolve, reject) => {
          if (q.acao === 'select' && tb === 'app_chat' && q.filtros.token === 't-a' && window.__comDelayA) { window.__comResolveA = () => resolve({ data: [{ token: 't-a', de: 'aluno', texto: 'Resposta atrasada exclusiva de Ágata', criado: '2026-09-07T11:59:00Z', lida: true }], error: null }); return Promise.resolve(); }
          if (q.acao === 'select' && tb === 'app_chat' && !q.filtros.token && window.__comDelayList) { const rows = JSON.parse(JSON.stringify(window.__comMsgs)); window.__comPendingList.push(() => resolve({ data: rows, error: null })); return Promise.resolve(); }
          if (q.acao === 'select' && tb === 'app_treino_log' && window.__comDelayAss) { const rows = JSON.parse(JSON.stringify(window.__comLogs)); return new Promise(res => { window.__comPendingAss.push(() => res({ data: rows, error: null })); }).then(resolve, reject); }
          if (q.acao === 'insert' && tb === 'app_chat' && window.__comDelaySend) return new Promise(res => { window.__comResolveSend = () => res({ data: null, error: null }); }).then(resolve, reject);
          return then(resolve, reject);
        }; return q;
      }; return n;
    };
    S.cloud = window.__comCloud;
  });
  const go = a => p.evaluate(a => document.querySelector('#abas [data-a="' + a + '"]').click(), a);
  const studio = () => p.evaluate(() => window.MTStore.read('ptStudio', {}));
  const snap = JSON.stringify(await studio());
  await go('chat'); await p.waitForFunction(() => document.querySelectorAll('#chatAlunos [data-chat]').length === 4);
  eq(await p.locator('#chNovas').textContent(), '2', 'Contador considera apenas alunos ativos com acesso válido');
  eq(await p.locator('#chatAlunos [data-chat="com-e"]').count(), 0, 'Chat não oferece destinatário com acesso revogado');
  const queryBefore = await p.evaluate(() => window.__comListQueries);
  await p.locator('#chatBusca').fill('agata'); eq(await p.locator('#chatAlunos [data-chat]').count(), 1, 'Busca ignora acentos');
  await p.locator('#chatBusca').fill('98888-1234'); ok(await p.locator('#chatAlunos [data-chat="com-a"]').isVisible(), 'Busca normaliza telefone');
  await p.locator('#chatBusca').fill(''); await p.locator('#chatFiltro').selectOption('novas'); eq(await p.locator('#chatAlunos [data-chat]').count(), 2, 'Filtro mostra conversas não lidas');
  eq(await p.evaluate(() => window.__comListQueries), queryBefore, 'Digitar e filtrar não consulta novamente a nuvem');
  await p.locator('#chatFiltro').selectOption('todas'); await p.locator('[data-chat="com-a"]').click();
  await p.waitForFunction(() => document.querySelector('#chatMsgs').textContent.includes('Dúvida sobre'));
  ok((await p.locator('#chatMsgs').textContent()).includes('06/09') || (await p.locator('#chatMsgs').textContent()).includes('06/set'), 'Separador de dia acompanha o fuso local da mensagem');
  await p.locator('#chatTexto').fill('Rascunho exclusivo de Ágata'); await p.locator('#chatVolta').click();
  await p.locator('#chatFiltro').selectOption('rascunhos'); eq(await p.locator('#chatAlunos [data-chat]').count(), 1, 'Lista filtra conversas com rascunhos');
  ok((await p.locator('#chatAlunos').textContent()).includes('Rascunho:'), 'Prévia da lista identifica rascunho');
  await p.locator('#chatFiltro').selectOption('todas'); await p.locator('[data-chat="com-b"]').click();
  eq(await p.locator('#chatTexto').inputValue(), '', 'Trocar aluno não mistura rascunhos'); await p.locator('#chatTexto').fill('Rascunho exclusivo de Beatriz');
  await p.locator('#chatVolta').click(); await p.locator('[data-chat="com-a"]').click(); eq(await p.locator('#chatTexto').inputValue(), 'Rascunho exclusivo de Ágata', 'Voltar recupera texto do aluno correto');
  const beforeQuick = dialogs.length; await p.locator('[data-chrap="Bora treinar 💪"]').click(); eq(await p.locator('#chatTexto').inputValue(), 'Rascunho exclusivo de Ágata', 'Recusar resposta rápida conserva texto existente'); ok(dialogs.length > beforeQuick, 'Substituir rascunho com resposta pronta pede confirmação');
  await p.locator('#chatTexto').fill('Linha um'); await p.locator('#chatTexto').press('Shift+Enter'); await p.locator('#chatTexto').press('L'); ok((await p.locator('#chatTexto').inputValue()).includes('\n'), 'Shift+Enter permite mensagem com mais de uma linha');
  eq(await p.evaluate(() => window.__comWrites.filter(w => w.acao === 'insert').length), 0, 'Escrever e navegar não envia mensagens');
  await p.locator('#chatTexto').fill('Falha preserva este texto'); await p.evaluate(() => { window.__comError['app_chat:insert'] = true; }); await p.locator('#chatEnviar').click();
  await p.waitForFunction(() => !document.getElementById('chatEnvioErro').hidden);
  eq(await p.locator('#chatTexto').inputValue(), 'Falha preserva este texto', 'Falha no envio mantém rascunho para tentar de novo');
  await p.evaluate(() => { window.__comError = {}; }); await p.locator('#chatEnviar').click(); await p.waitForFunction(() => !document.getElementById('chatTexto').value);
  eq(await p.evaluate(() => window.__comWrites.filter(w => w.acao === 'insert').at(-1).corpo.token), 't-a', 'Envio confirmado usa token do aluno escolhido');
  eq(await p.locator('#chatContagem').textContent(), '0/1000', 'Contador acompanha limpeza após sucesso');
  await p.evaluate(() => { document.getElementById('chatTexto').value = 'a'.repeat(1001); }); const writesBefore = await p.evaluate(() => window.__comWrites.length); await p.locator('#chatEnviar').click();
  eq(await p.evaluate(() => window.__comWrites.length), writesBefore, 'Texto acima de1000 é recusado sem truncar envio'); eq((await p.locator('#chatTexto').inputValue()).length, 1001, 'Limite conserva o texto completo para corrigir');
  await p.locator('#chatTexto').fill('Aguardando envio de Ágata'); await p.evaluate(() => { window.__comDelaySend = true; }); await p.locator('#chatEnviar').click();
  await p.locator('#chatVolta').click(); await p.locator('[data-chat="com-b"]').click(); await p.evaluate(() => { window.__comResolveSend(); window.__comDelaySend = false; });
  eq(await p.locator('#chatTexto').inputValue(), 'Rascunho exclusivo de Beatriz', 'Sucesso atrasado de A preserva rascunho de B');
  ok(await p.locator('#chatEnviar').isEnabled(), 'Outro destinatário não fica preso ao envio anterior');
  await p.locator('#chatVolta').click(); await p.evaluate(() => { window.__comDelayA = true; }); await p.locator('[data-chat="com-a"]').click();
  await p.locator('#chatVolta').click(); await p.locator('[data-chat="com-b"]').click(); await p.evaluate(() => { window.__comResolveA(); window.__comDelayA = false; });
  ok(!(await p.locator('#chatMsgs').textContent()).includes('Resposta atrasada exclusiva'), 'Consulta atrasada de A não invade conversa B');
  await p.evaluate(() => { window.__comError.conversa = true; }); await p.locator('#chatTexto').fill('Rascunho durante erro'); await p.evaluate(() => window.__chatPT.abre('com-b'));
  await p.waitForFunction(() => !document.getElementById('chatTenta').hidden);
  ok((await p.locator('#chatMsgs').textContent()).includes('Mensagem exclusiva de Beatriz'), 'Erro ao atualizar conserva conversa já carregada'); eq(await p.locator('#chatTexto').inputValue(), 'Rascunho durante erro', 'Erro de leitura conserva rascunho');
  await p.evaluate(() => { window.__comError = {}; }); await p.locator('#chatTenta').click(); await p.waitForFunction(() => document.getElementById('chatTenta').hidden);
  await p.evaluate(() => { const S = window.MTStore, st = S.read('ptStudio', {}); st.alunos.find(a => a.id === 'com-b').appRevogadoEm = '2026-09-07'; S.write('ptStudio', st); });
  const revokedBefore = await p.evaluate(() => window.__comWrites.length); await p.locator('#chatEnviar').click(); eq(await p.evaluate(() => window.__comWrites.length), revokedBefore, 'Enviar revalida acesso revogado após abrir conversa');
  await p.evaluate(() => { const S = window.MTStore, st = S.read('ptStudio', {}); delete st.alunos.find(a => a.id === 'com-b').appRevogadoEm; S.write('ptStudio', st); });
  await go('chat'); await p.locator('#chatVolta').click();
  await p.evaluate(() => { window.__comDelayList = true; window.__chatPT.render(); });
  await p.evaluate(() => { window.__comMsgs.unshift({ token: 't-c', de: 'aluno', texto: 'Lista nova prevalece', criado: '2026-09-07T12:10:00Z', lida: true }); window.__chatPT.render(); });
  await p.evaluate(() => { window.__comPendingList.at(-1)(); window.__comPendingList[0](); window.__comDelayList = false; });
  ok((await p.locator('#chatAlunos').textContent()).includes('Lista nova prevalece'), 'Lista descarta resposta de consulta superada');

  await go('assessoria'); await p.waitForFunction(() => document.querySelectorAll('[data-asaluno]').length === 6);
  const rows = await p.evaluate(() => window.__assessoriaUI.dados().map(x => ({ id: x.aluno.id, estado: x.estado, dias: x.dias, semana: x.semana })));
  eq(rows.find(x => x.id === 'com-a'), { id: 'com-a', estado: 'andamento', dias: 3, semana: 1 }, 'Assessoria une registros sem duplicar nem contar datas inválidas/futuras');
  eq(rows.find(x => x.id === 'com-b').estado, 'atencao', 'Cinco dias sem registro produzem atenção');
  eq(rows.find(x => x.id === 'com-c').estado, 'meta', 'Meta semanal usa frequência individual');
  eq(rows.find(x => x.id === 'com-d').estado, 'semregistro', 'Aluno sem histórico não é rotulado como parado');
  eq(rows.find(x => x.id === 'com-e').estado, 'semacesso', 'Acesso pausado fica distinto de ausência de treino');
  ok(await p.evaluate(() => !window.__comConsultas.flat().includes('t-e')), 'Consulta não inclui token de acesso revogado');
  await p.locator('#assessoriaBusca').fill('agata'); eq(await p.locator('[data-asaluno]').count(), 1, 'Busca da Assessoria ignora acentos');
  await p.locator('#assessoriaBusca').fill('98888'); ok(await p.locator('[data-asaluno="com-a"]').isVisible(), 'Assessoria busca por telefone'); await p.locator('#assessoriaBusca').fill('');
  await p.locator('#assessoriaFiltro').selectOption('atencao'); eq(await p.locator('[data-asaluno]').count(), 1, 'Filtro de atenção mostra somente o caso pendente');
  await p.locator('#assessoriaFiltro').selectOption('semacesso'); eq(await p.locator('[data-asaluno]').count(), 2, 'Filtro de acesso inclui não liberado e pausado');
  await p.locator('#assessoriaFiltro').selectOption('todos');
  ok(!await p.locator('[data-aschecks="com-a"]').evaluate(e => e.open), 'Check-ins começam recolhidos'); await p.locator('[data-aschecks="com-a"] summary').click();
  ok((await p.locator('[data-aschecks="com-a"]').textContent()).includes('Check-in exclusivo de Ágata'), 'Expandir mostra check-in do aluno correto');
  await p.locator('#assessoriaAtualiza').click(); await p.waitForFunction(() => !document.getElementById('assessoriaAtualiza').disabled);
  ok(await p.locator('[data-aschecks="com-a"]').evaluate(e => e.open), 'Atualizar registros preserva expansão do check-in');
  const wa = await p.locator('[data-asaluno="com-b"] a').getAttribute('href'); ok(wa.includes('5531977771234') && decodeURIComponent(wa).includes('Beatriz'), 'Mensagem pronta usa telefone e contexto do aluno certo sem enviar');
  await p.locator('[data-asaluno="com-a"] [data-asacao="treino"]').click(); eq(await p.locator('#tAluno').inputValue(), 'com-a', 'Revisar treino abre Musculação do aluno escolhido');
  await go('assessoria'); await p.waitForFunction(() => !document.getElementById('assessoriaAtualiza').disabled); await p.locator('[data-asaluno="com-b"] [data-asacao="chat"]').click();
  ok((await p.locator('#chatTitulo').textContent()).includes('Beatriz'), 'Atalho de Assessoria abre chat do aluno certo');
  await go('assessoria'); await p.evaluate(() => { window.__comError['app_treino_log:select'] = true; window.__assessoria(); });
  await p.waitForFunction(() => document.getElementById('assessoriaLista').textContent.includes('Não deu pra ler'));
  eq(await p.locator('[data-asaluno]').count(), 0, 'Erro de leitura não apresenta alunos como sem registros');
  await p.evaluate(() => { window.__comError = { 'app_checkin:select': true }; }); await p.locator('#assessoriaAtualiza').click(); await p.waitForFunction(() => document.querySelectorAll('[data-asaluno]').length === 6);
  ok((await p.locator('#assessoriaStatus').textContent()).includes('Check-ins indisponíveis'), 'Falha parcial separa check-ins indisponíveis de treinos carregados');
  await p.evaluate(() => { window.__comError = {}; window.__comDelayAss = true; window.__assessoria(); });
  await p.waitForFunction(() => window.__comPendingAss.length === 1);
  await p.evaluate(() => { window.__comLogs.push({ token: 't-d', dia: '2026-09-07' }); window.__assessoria(); }); await p.waitForFunction(() => window.__comPendingAss.length === 2);
  await p.evaluate(() => { window.__comPendingAss[1](); }); await p.waitForFunction(() => window.__assessoriaUI.dados().find(x => x.aluno.id === 'com-d').dias === 1);
  await p.evaluate(() => { window.__comPendingAss[0](); window.__comDelayAss = false; });
  eq(await p.evaluate(() => window.__assessoriaUI.dados().find(x => x.aluno.id === 'com-d').dias), 1, 'Assessoria descarta resposta antiga após atualização mais recente');

  await go('chat'); await p.locator('#chatVolta').click(); await p.locator('[data-cha="robo"]').click();
  const botBefore = (await studio()).config.bot;
  await p.locator('#botOiP').fill('Rascunho do robô'); await go('assessoria'); await go('chat'); await p.locator('[data-cha="robo"]').click();
  eq(await p.locator('#botOiP').inputValue(), 'Rascunho do robô', 'Sair e voltar preserva alterações não salvas do robô');
  await p.locator('#botOpsP').fill('Linha sem resposta'); await p.locator('#botSalvaP').click(); eq((await studio()).config.bot, botBefore, 'Linha incompleta não é descartada silenciosamente ao salvar robô');
  await p.locator('#botCancelaP').click(); eq((await studio()).config.bot, botBefore, 'Descartar restaura formulário sem mudar robô salvo');
  await p.evaluate(() => { window.MTStore.cloud = window.__comCloudOriginal; });
  eq(network, [], 'Nenhuma requisição alcançou Supabase real'); eq(errors, [], 'Fluxos não geram erros de JavaScript');
  await context.close(); console.log('PASSOU: ' + checks + ' verificações');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
