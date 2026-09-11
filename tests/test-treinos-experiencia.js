/* Navegação e rascunhos de Treinos: revisar primeiro, aplicar ao destinatário certo. */
const assert = require('assert/strict');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const { comMockNuvem } = require('./_nuvem.js');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765';
const AREAS = ['fichas', 'auto', 'wod', 'cardio', 'plano', 'grupo', 'ex', 'videos'];
let browser, checks = 0;
const eq = (a, b, name) => { assert.deepEqual(a, b, name); checks++; console.log('OK: ' + name); };
const ok = (v, name) => { assert.ok(v, name); checks++; console.log('OK: ' + name); };
(async () => {
  browser = comMockNuvem(await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }));
  const context = await browser.newContext({ viewport: { width: 360, height: 844 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', serviceWorkers: 'block' });
  const network = [], errors = [], dialogs = [];
  await context.route('**://*.supabase.co/**', route => { network.push(route.request().url()); return route.abort(); });
  const p = await context.newPage();
  p.on('pageerror', e => errors.push(e.message));
  p.on('dialog', async d => { dialogs.push(d.message()); if (d.type() === 'confirm') await d.accept(); else await d.dismiss(); });
  await p.clock.setFixedTime(new Date('2026-09-07T09:00:00-03:00'));
  await p.goto(BASE + '/demo-personal.html'); await p.locator('#btnDemo').click(); await p.waitForURL(/personal\.html/);
  await p.waitForFunction(() => window.__iaRevisao && window.mockNuvem && window.__demoNuvem);
  await p.evaluate(() => {
    const S = window.MTStore, st = S.read('ptStudio', {});
    window.__trCloudOriginal = S.cloud; window.__trChamaOriginal = window.MT_FUNCAO.chama;
    const exId = st.exercicios[0].id;
    st.alunos = [
      { id: 'tr-a', nome: 'Ágata Oliveira de Albuquerque e Vasconcelos', ativo: true, appTokenP: 'tr-token-a', metaSemana: 3, anamnese: { nivel: 'intermediario', dias: 3 } },
      { id: 'tr-b', nome: 'Beatriz Santana', ativo: true, appTokenP: 'tr-token-b', metaSemana: 2 },
    ];
    st.treinosV2 = {};
    for (const a of st.alunos) st.treinosV2[a.id] = {
      fichas: [{ id: a.id + '-f', titulo: 'A — Prescrição original', itens: [{ exId, series: 3, reps: '10', descanso: 60, carga: 20, seriesDetalhadas: [{ reps: '5', carga: 20, descanso: 90 }, { reps: '8', carga: 15, descanso: 60 }, { reps: '10', carga: 0, descanso: 0 }] }] }],
      wods: [{ id: a.id + '-w', nome: 'Circuito original', tipo: 'amrap', min: 12, movs: [{ q: '10', n: 'Agachamento livre' }], mov: ['10 Agachamento livre'] }],
      cardio: [{ id: a.id + '-c', nome: 'Corrida original', tipo: 'continuo', mod: 'corrida', dist: 5, pace: '6:30' }],
      mes: { wod: { geradoEm: '2026-09-07', semanas: [1, 2, 3, 4].map(n => ({ n, foco: 'Circuito', ajuste: 'Conforme revisão' })) }, corrida: { geradoEm: '2026-09-07', semanas: [1, 2, 3, 4].map(n => ({ n, foco: 'Corrida', ajuste: 'Conforme revisão' })) } },
      plano: { dias: { '1': [{ tp: 'ficha', id: a.id + '-f', h: '07:00' }], '2': [{ tp: 'wod', id: a.id + '-w', h: '08:00' }], '3': [{ tp: 'cardio', id: a.id + '-c', h: '09:00' }] } },
    };
    st.gruposPT = [{ id: 'tr-g', nome: 'Grupo de exemplo', alunoIds: ['tr-a', 'tr-b'] }];
    st.sessoes = []; st.avaliacoes = []; st.pagamentos = []; st.agFixas = []; st.bloqueios = [];
    st.videoteca = [{ id: 'tr-v', titulo: 'Mobilidade de quadril', categoria: 'Mobilidade', url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' }];
    st.config = Object.assign({}, st.config, { dia1Off: true, zapFilaOff: true });
    localStorage.setItem('mtapp:ptStudio', JSON.stringify(st)); window.__ptStudio.render();
    document.querySelector('#abas [data-a="treinos"]').click();
    const sel = document.getElementById('tAluno'); sel.value = 'tr-a'; sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const area = async v => {
    if (await p.locator('#trArea').isVisible()) await p.locator('#trArea').selectOption(v);
    else await p.locator('#trAbas [data-tra="' + v + '"]').click();
  };
  const open = async selector => {
    const all = p.locator(selector).locator('xpath=ancestor::details');
    for (let i = 0; i < await all.count(); i++) if (!await all.nth(i).evaluate(e => e.open)) await all.nth(i).locator(':scope > summary').click();
  };
  const student = async (id, value) => {
    const search = p.locator('#' + id + 'Busca');
    if (await search.count()) { await search.fill(value === 'tr-a' ? 'Ágata' : 'Beatriz'); await p.locator('#' + id + 'BuscaLista [data-bval="' + value + '"]').click(); }
    else await p.locator('#' + id).selectOption(value);
  };
  const snap = () => p.evaluate(() => JSON.stringify(window.MTStore.read('ptStudio', {}).treinosV2));
  const data = () => p.evaluate(() => window.MTStore.read('ptStudio', {}));
  const initial = await snap();
  for (const width of [360, 1280]) {
    await p.setViewportSize({ width, height: 900 });
    for (const a of AREAS) {
      await area(a);
      eq(await p.evaluate(() => ({ select: document.getElementById('trArea').value, tab: document.querySelector('#trAbas [aria-pressed="true"]')?.dataset.tra || document.querySelector('#trAbas .ativa')?.dataset.tra, shown: [...new Set([...document.querySelectorAll('#vTreinos [data-trsec]')].filter(e => !e.hidden).map(e => e.dataset.trsec))] })), { select: a, tab: a, shown: [a] }, 'Navegação sincronizada ' + width + 'px: ' + a);
    }
  }
  eq(await snap(), initial, 'Navegar pelas oito áreas não altera fichas nem outras modalidades');
  eq(await p.locator('#taAluno').inputValue(), 'tr-a', 'Área sem seleção aproveita o aluno de Musculação');
  await area('auto'); await student('taAluno', 'tr-b'); await area('fichas'); await area('auto');
  eq(await p.locator('#taAluno').inputValue(), 'tr-b', 'Navegar preserva seleção já existente de outra área');
  await p.setViewportSize({ width: 390, height: 844 }); await area('auto'); await student('taAluno', 'tr-a');
  await p.locator('#taIA').click(); await p.waitForFunction(() => !document.getElementById('taRevisao').hidden);
  ok((await p.locator('#taRevisaoMeta').textContent()).includes('Exemplo de demonstração'), 'Demo identifica a origem simulada na revisão');
  ok((await p.locator('#taRevisaoAvisos').textContent()).includes('Nenhuma IA foi consultada'), 'Demo não se apresenta como geração real');
  eq(await snap(), initial, 'Demonstração gera somente rascunho'); await p.locator('#taDescartar').click();

  await p.evaluate(() => {
    const S = window.MTStore;
    S.cloud = () => window.mockNuvem({ aid: 'treinos-test' });
    window.__trCalls = []; window.__trDelay = false; window.__trError = false;
    window.__trResposta = { fichas: [{ titulo: 'A — Séries revisadas', itens: [{ nome: S.read('ptStudio', {}).exercicios[0].nome, series: 3, reps: '10', descanso: 60, carga: 20, seriesDetalhadas: [{ reps: '5', carga: 20, descanso: 90 }, { reps: '8', carga: 15, descanso: 60 }, { reps: '10', carga: 0, descanso: 0 }] }] }], resumo: 'Proposta de teste para revisar.' };
    window.MT_FUNCAO.chama = (client, fn, body) => {
      if (body.acao === 'ping') return Promise.resolve({ regras: ['briefManda', 'mes'] });
      window.__trCalls.push(JSON.parse(JSON.stringify(body)));
      const response = window.__trError ? { erro: 'Serviço temporariamente indisponível.' } : { ok: true, texto: window.__trRaw === undefined ? JSON.stringify(window.__trResposta) : window.__trRaw };
      if (window.__trDelay) return new Promise(resolve => { window.__trResolve = () => resolve(response); });
      return Promise.resolve(response);
    };
    window.__brief.confereReset();
  });
  await p.locator('#taDias').selectOption('4'); await p.locator('#taDuracao').fill('45');
  await p.locator('#taIA').click(); await p.waitForFunction(() => !document.getElementById('taRevisao').hidden);
  eq(await snap(), initial, 'Resposta da IA não muda a prescrição antes da revisão');
  eq(await p.evaluate(() => { const d = window.__iaRevisao.estado().rascunho; return { aluno: d.alunoId, dias: d.params.dias, duracao: d.params.duracao }; }), { aluno: 'tr-a', dias: 4, duracao: 45 }, 'Rascunho captura aluno, frequência e duração solicitados');
  ok(/5.*8.*10/s.test(await p.locator('#taPrevia').textContent()), 'Prévia apresenta repetições diferentes por série');
  await p.evaluate(() => { window.__trDraftAplicado = window.__iaRevisao.estado().rascunho; });
  await p.locator('#taAplicar').click();
  const applied = await data();
  eq(applied.treinosV2['tr-a'].fichas[0].itens[0].seriesDetalhadas, [{ reps: '5', carga: 20, descanso: 90 }, { reps: '8', carga: 15, descanso: 60 }, { reps: '10', carga: 0, descanso: 0 }], 'Aplicação preserva reps/cargas/descansos individuais, incluindo zero');
  eq(applied.treinosV2['tr-a'].cardio, JSON.parse(initial)['tr-a'].cardio, 'Aplicar musculação conserva corrida');
  eq(applied.treinosV2['tr-a'].mes, JSON.parse(initial)['tr-a'].mes, 'Aplicar musculação conserva planos do mês das outras modalidades');
  eq(applied.treinosV2['tr-b'], JSON.parse(initial)['tr-b'], 'Aplicação não altera outro aluno');
  const afterApply = await snap();
  ok(await p.evaluate(() => !!window.__iaRevisao.aplica(window.__trDraftAplicado).erro), 'Reaplicar o mesmo rascunho é recusado'); eq(await snap(), afterApply, 'Reaplicação não duplica nem sobrescreve');
  ok(await p.locator('#taAbrirTreino').isVisible(), 'Aplicação oferece ajuste e publicação explícitos');

  for (const reason of ['cancelar', 'aluno', 'modalidade']) {
    await student('taAluno', 'tr-a'); await p.locator('#taTipo').selectOption('musculacao');
    await p.evaluate(() => { window.__trDelay = true; window.__trResolve = null; });
    const before = await snap(); await p.locator('#taIA').click(); await p.waitForFunction(() => typeof window.__trResolve === 'function');
    if (reason === 'cancelar') await p.locator('#taCancelarGeracao').click();
    if (reason === 'aluno') await student('taAluno', 'tr-b');
    if (reason === 'modalidade') await p.locator('#taTipo').selectOption('wod');
    await p.evaluate(async () => { window.__trResolve(); await Promise.resolve(); await Promise.resolve(); });
    eq(await snap(), before, 'Resposta atrasada não grava após trocar ' + reason);
    ok(await p.locator('#taRevisao').isHidden(), 'Resposta atrasada não invade revisão: ' + reason);
  }
  await student('taAluno', 'tr-a'); await p.locator('#taTipo').selectOption('musculacao');
  await p.evaluate(() => { window.__trDelay = false; });
  await p.locator('#taIA').click(); await p.waitForFunction(() => !document.getElementById('taRevisao').hidden);
  await p.evaluate(() => { const S = window.MTStore, st = S.read('ptStudio', {}); st.treinosV2['tr-a'].fichas[0].titulo = 'Alteração manual depois da proposta'; S.write('ptStudio', st); });
  const manual = await snap(); await p.locator('#taAplicar').click();
  eq(await snap(), manual, 'Conflito com edição manual mantém a versão salva');
  ok(/mudaram desde a geração/.test(await p.locator('#taStatus').textContent()), 'Conflito pede nova proposta antes de substituir');
  await p.locator('#taDescartar').click();
  await p.evaluate(() => { window.__trError = true; }); await p.locator('#taIA').click();
  await p.waitForFunction(() => !window.__iaRevisao.estado().gerando);
  eq(await snap(), manual, 'Erro da geração conserva todo treino salvo');
  ok(await p.locator('#taRevisao').isHidden(), 'Erro não oferece aplicar proposta inexistente');
  await p.evaluate(() => { window.__trError = false; }); await p.locator('#taIA').click(); await p.waitForFunction(() => !document.getElementById('taRevisao').hidden);
  await p.evaluate(() => { window.__trWriteOriginal = window.MTStore.write; window.MTStore.write = () => false; });
  await p.locator('#taAplicar').click(); eq(await snap(), manual, 'Falha de armazenamento mantém a prescrição anterior');
  ok(await p.locator('#taAplicar').isEnabled(), 'Falha de armazenamento mantém rascunho para tentar novamente');
  await p.evaluate(() => { window.MTStore.write = window.__trWriteOriginal; }); await p.locator('#taDescartar').click();
  await p.locator('#taIA').click(); await p.waitForFunction(() => !document.getElementById('taRevisao').hidden);
  await p.evaluate(() => { const S = window.MTStore, st = S.read('ptStudio', {}); window.__trNomeOriginal = st.exercicios[0].nome; st.exercicios[0].nome = 'Nome alterado após revisar'; S.write('ptStudio', st); });
  await p.locator('#taAplicar').click();
  ok(/renomeado na biblioteca/.test(await p.locator('#taStatus').textContent()), 'Renomear exercício após revisão exige gerar novamente');
  eq(await snap(), manual, 'Nome alterado na biblioteca não aplica um movimento diferente');
  await p.locator('#taDescartar').click();
  await p.evaluate(() => { const S = window.MTStore, st = S.read('ptStudio', {}); st.exercicios[0].nome = window.__trNomeOriginal; S.write('ptStudio', st); });
  for (const [tipo, campo] of [['musculacao', 'fichas'], ['wod', 'wods'], ['corrida', 'cardio']]) {
    await p.locator('#taTipo').selectOption(tipo);
    for (const texto of ['resposta que não é JSON', JSON.stringify({ [campo]: [null] })]) {
      await p.evaluate(t => { window.__trRaw = t; }, texto);
      const before = await snap(); await p.locator('#taIA').click();
      await p.waitForFunction(() => !window.__iaRevisao.estado().gerando, null, { timeout: 5000 });
      eq(await snap(), before, tipo + ': resposta malformada conserva treino');
      ok(await p.locator('#taIA').isEnabled() && await p.locator('#taRevisao').isHidden(), tipo + ': erro encerra espera e permite tentar novamente');
    }
  }
  await p.evaluate(() => { delete window.__trRaw; }); await p.locator('#taTipo').selectOption('musculacao');
  await p.locator('#taIA').click(); await p.waitForFunction(() => !document.getElementById('taRevisao').hidden);
  ok(await p.locator('#taAplicar').isEnabled(), 'Proposta válida volta a funcionar após respostas malformadas'); await p.locator('#taDescartar').click();
  await p.locator('#taDias').selectOption('3'); await p.locator('#taDuracao').fill('');
  await open('#taGerar'); await p.locator('#taGerar').click(); await p.waitForFunction(() => !document.getElementById('taRevisao').hidden);
  eq(await snap(), manual, 'Gerador por catálogo também exige revisão antes de gravar'); await p.locator('#taDescartar').click();
  await p.evaluate(() => { const S = window.MTStore, st = S.read('ptStudio', {}), t = st.treinosV2['tr-a']; delete t.geradaIA; t.fichas[0].itens.push({ exId: st.exercicios[1].id, series: 3, reps: '10', descanso: 60 }); S.write('ptStudio', st); });
  const beforeEvolution = await snap(); await p.locator('#taEvoluir').click(); await p.waitForFunction(() => !document.getElementById('taRevisao').hidden);
  eq(await snap(), beforeEvolution, 'Revisar progressão da semana não grava automaticamente');
  const evolution = await p.evaluate(() => window.__iaRevisao.estado().rascunho.treino.fichas[0].itens);
  eq(evolution[0].seriesDetalhadas, JSON.parse(beforeEvolution)['tr-a'].fichas[0].itens[0].seriesDetalhadas, 'Progressão conserva todas as séries individuais');
  ok(evolution[1].reps !== '10', 'Progressão revisa exercício uniforme elegível'); await p.locator('#taDescartar').click();
  for (const [answers, expected] of [
    [{}, 'não respondido — nenhuma resposta registrada'],
    [{ parq1: false }, 'incompleto — 1 de 7 respostas registradas'],
    [Object.fromEntries(Array.from({ length: 7 }, (_, i) => ['parq' + (i + 1), false])), 'nenhuma resposta SIM nas 7 respostas registradas'],
    [{ parq1: true }, 'PAR-Q'],
  ]) {
    const captured = await p.evaluate(async answers => {
      const S = window.MTStore, st = S.read('ptStudio', {}), a = st.alunos.find(x => x.id === 'tr-a');
      for (let i = 1; i <= 7; i++) delete a.anamnese['parq' + i]; Object.assign(a.anamnese, answers); S.write('ptStudio', st);
      await new Promise(resolve => window.__iaTreino('tr-a', 'hipertrofia', 'academia', resolve, 'musculacao', { preview: true }));
      return window.__trCalls.at(-1).dados;
    }, answers);
    ok(captured.includes(expected) && !/liberado para treinar/.test(captured), 'Contexto do PAR-Q preserva o estado factual: ' + expected);
  }

  // Formulários de circuito e corrida guardam rascunhos por aluno, inclusive erro de gravação.
  for (const [tab, prefix, name] of [['wod', 'wp', 'Circuito editado de Ágata'], ['cardio', 'cb', 'Corrida editada de Ágata']]) {
    await area(tab); await student(prefix + 'Aluno', 'tr-a'); await open('#' + prefix + 'Nome');
    await p.locator('#' + prefix + 'Nome').fill(name);
    if (tab === 'cardio') await p.locator('#cbModo').selectOption('simples');
    if (tab === 'wod') { await p.locator('#wpMovLinhas .wpe').first().fill('Agachamento livre'); await p.locator('#wpMovLinhas .wpq').first().fill('12'); }
    const before = await snap(); await student(prefix + 'Aluno', 'tr-b');
    eq(await p.locator('#' + prefix + 'Nome').inputValue(), '', tab + ': aluno B não herda rascunho de A');
    await student(prefix + 'Aluno', 'tr-a'); eq(await p.locator('#' + prefix + 'Nome').inputValue(), name, tab + ': voltar a A recupera rascunho');
    eq(await snap(), before, tab + ': digitar e alternar aluno não grava');
    await p.evaluate(() => { window.__trWriteOriginal = window.MTStore.write; window.MTStore.write = () => false; });
    await p.locator('#' + prefix + 'Salva').click(); eq(await p.locator('#' + prefix + 'Nome').inputValue(), name, tab + ': falha de escrita conserva formulário'); eq(await snap(), before, tab + ': falha de escrita conserva salvo');
    await p.evaluate(() => { window.MTStore.write = window.__trWriteOriginal; }); await p.locator('#' + prefix + 'Salva').click();
    eq((await data()).treinosV2['tr-a'][tab === 'wod' ? 'wods' : 'cardio'].at(-1).nome, name, tab + ': salvar grava no aluno escolhido');
    await student(prefix + 'Aluno', 'tr-b'); await student(prefix + 'Aluno', 'tr-a'); eq(await p.locator('#' + prefix + 'Nome').inputValue(), '', tab + ': próxima inclusão começa limpa');
    await open('#' + prefix + 'Nome'); await p.locator('#' + prefix + 'Nome').fill('Rascunho a descartar');
    await p.locator('#' + prefix + 'Editor > summary').click(); await p.locator('#' + prefix + 'Editor > summary').click();
    eq(await p.locator('#' + prefix + 'Nome').inputValue(), 'Rascunho a descartar', tab + ': recolher formulário conserva o rascunho');
    const beforeClear = await snap(); await p.locator('#' + prefix + 'Limpa').click();
    await student(prefix + 'Aluno', 'tr-b'); await student(prefix + 'Aluno', 'tr-a');
    eq(await p.locator('#' + prefix + 'Nome').inputValue(), '', tab + ': limpar descarta também cache do rascunho');
    eq(await snap(), beforeClear, tab + ': limpar rascunho não apaga treinos salvos');
    const original = tab === 'wod' ? 'tr-a-w' : 'tr-a-c', attr = tab === 'wod' ? 'wprm' : 'cbrm';
    await open('[' + 'data-' + attr + '="' + original + '"]'); await p.locator('[data-' + attr + '="' + original + '"]').click();
    const state = (await data()).treinosV2['tr-a'];
    ok(!JSON.stringify(state.plano).includes(original), tab + ': remover treino retira sua referência da semana');
    ok(JSON.stringify(state.plano).includes(state.fichas[0].id), tab + ': remover treino conserva musculação na semana');
  }

  await area('plano'); await student('plnAluno', 'tr-a');
  const planBefore = await snap();
  await p.locator('#plnSalva').click(); eq(await snap(), planBefore, 'Semana com treino removido não sobrescreve planejamento válido');
  ok(/indisponível/.test(await p.locator('#plnStatus').textContent()), 'Semana informa vínculo indisponível no rascunho anterior');
  await p.locator('[data-plnsel="1:0"]').selectOption('ficha:' + (await data()).treinosV2['tr-a'].fichas[0].id);
  for (const day of ['2', '3']) if (await p.locator('[data-plnrm="' + day + ':0"]').count()) await p.locator('[data-plnrm="' + day + ':0"]').click();
  await open('[data-plncopia="1:4"]'); await p.locator('[data-plncopia="1:4"]').click();
  const copied = await p.evaluate(() => JSON.parse(JSON.stringify(window.__planoPT.rasc())));
  eq(copied['4'], copied['1'], 'Copiar dia preserva exercício, tipo e horário');
  eq(await snap(), planBefore, 'Copiar dia altera apenas rascunho');
  await student('plnAluno', 'tr-b'); await student('plnAluno', 'tr-a');
  eq(await p.evaluate(() => window.__planoPT.rasc()['4']), copied['4'], 'Semana restaura rascunho do aluno correto');
  await p.locator('#plnSalva').click(); eq((await data()).treinosV2['tr-a'].plano.dias['4'], copied['4'], 'Salvar semana confirma cópia do dia');

  await area('grupo'); await open('[data-gredit="tr-g"]'); await p.locator('[data-gredit="tr-g"]').click();
  ok(await p.locator('.grCheck[value="tr-a"]').isChecked() && await p.locator('.grCheck[value="tr-b"]').isChecked(), 'Editar grupo carrega os membros existentes');
  await p.locator('.grCheck[value="tr-a"]').uncheck(); await p.locator('#grAdd').click();
  eq((await data()).gruposPT[0].alunoIds, ['tr-b'], 'Salvar membros altera somente o grupo escolhido');
  await p.locator('#geOrigem').selectOption('tr-a'); await p.locator('#geGrupo').selectOption('tr-g');
  ok(/Beatriz/.test(await p.locator('#geResumo').textContent()) && !/Ágata/.test(await p.locator('#geResumo').textContent()), 'Revisão do grupo identifica destinatários, excluindo origem');
  const grupoAntes = (await data()).treinosV2; await p.locator('#geEnviar').click(); await p.waitForFunction(() => !document.getElementById('geEnviar').disabled);
  const grupoDepois = (await data()).treinosV2;
  eq(grupoDepois['tr-a'], grupoAntes['tr-a'], 'Copiar ao grupo não regrava aluno de origem');
  eq(grupoDepois['tr-b'].fichas[0].itens, grupoAntes['tr-a'].fichas[0].itens, 'Grupo recebe a ficha revisada com séries individuais');
  eq({ wod: grupoDepois['tr-b'].wods, cardio: grupoDepois['tr-b'].cardio, mes: grupoDepois['tr-b'].mes }, { wod: grupoAntes['tr-b'].wods, cardio: grupoAntes['tr-b'].cardio, mes: grupoAntes['tr-b'].mes }, 'Grupo preserva circuitos, corrida e seus planos mensais individuais');

  await area('ex'); const catalogBefore = await p.locator('#exLista [data-exabrir],#exLista [data-exedit]').count();
  await p.locator('#catMais').click(); ok(await p.locator('#exLista [data-exabrir],#exLista [data-exedit]').count() > catalogBefore, 'Mostrar mais preserva paginação progressiva do catálogo');
  await p.locator('#catBusca').fill('agachamento'); ok((await p.locator('#exLista').textContent()).toLowerCase().includes('agachamento'), 'Busca do catálogo continua utilizável');

  await area('videos'); await p.locator('[data-vtpedit="tr-v"]').click();
  eq(await p.locator('#vtpTitulo').inputValue(), 'Mobilidade de quadril', 'Editar conteúdo carrega o item escolhido');
  await p.locator('#vtpTitulo').fill('Mobilidade revisada'); await p.locator('#vtpAdd').click();
  let st = await data(); eq(st.videoteca.length, 1, 'Editar conteúdo mantém o mesmo registro'); eq(st.videoteca[0].id, 'tr-v', 'Editar preserva identificador do conteúdo');
  ok(!!st.config.appEditGeralEm && /Publique/.test(await p.locator('#vtpStatus').textContent()), 'Conteúdo salvo marca necessidade de publicação');
  await p.locator('#vtpBusca').fill('revisada'); eq(await p.locator('#vtpLista [data-vtpedit]').count(), 1, 'Busca encontra o título editado'); await p.locator('#vtpBusca').fill('');
  await p.evaluate(() => { const S = window.MTStore, st = S.read('ptStudio', {}); st.videoteca = Array.from({ length: 31 }, (_, i) => ({ id: 'legacy-' + i, titulo: 'Conteúdo legado ' + i, categoria: 'Geral', url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' })); S.write('ptStudio', st); window.__biblioteca.renderVideotecaPT(); });
  await p.locator('#vtpTitulo').fill('Excedente bloqueado'); await p.locator('#vtpUrl').fill('https://www.youtube.com/watch?v=aqz-KE-bpKQ'); await p.locator('#vtpAdd').click();
  eq((await data()).videoteca.length, 31, 'Limite de30 bloqueia novo conteúdo sem apagar excedentes antigos');
  eq(await p.locator('#vtpTitulo').inputValue(), 'Excedente bloqueado', 'Limite conserva formulário para corrigir');
  await p.locator('[data-vtpedit="legacy-30"]').click(); await p.locator('#vtpTitulo').fill('Último legado editado'); await p.locator('#vtpAdd').click();
  eq((await data()).videoteca.at(-1).titulo, 'Último legado editado', 'Conteúdo legado excedente continua editável');
  const dlgBefore = dialogs.length; await p.locator('[data-vtprm="legacy-30"]').click();
  ok(dialogs.slice(dlgBefore).some(x => /Excluir este conteúdo/.test(x)), 'Exclusão de conteúdo exige confirmação'); eq((await data()).videoteca.length, 30, 'Excluir remove somente conteúdo confirmado');
  await p.evaluate(() => { window.MTStore.cloud = window.__trCloudOriginal; window.MT_FUNCAO.chama = window.__trChamaOriginal; });
  eq(network, [], 'Nenhuma chamada chega ao Supabase real'); eq(errors, [], 'Sem erros de JavaScript nos novos fluxos');
  await context.close(); console.log('PASSOU: ' + checks + ' verificações');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
