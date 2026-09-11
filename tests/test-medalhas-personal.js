/* Editor real de medalhas, com alunos sintéticos e todas as rotas externas bloqueadas. */
const assert = require('node:assert/strict');
let chromium;
try { chromium = require('playwright').chromium; } catch (_) { chromium = require('/opt/node22/lib/node_modules/playwright').chromium; }
const { comMockNuvem } = require('./_nuvem.js');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765';
let browser, checks = 0;
function eq(actual, expected, message) { assert.deepEqual(actual, expected, message); checks++; console.log('OK: ' + message); }
function ok(value, message) { assert.ok(value, message); checks++; console.log('OK: ' + message); }
(async () => {
  browser = comMockNuvem(await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] }));
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'America/Sao_Paulo', serviceWorkers: 'block' });
  let supabaseRequests = 0;
  await ctx.route('**/*', route => {
    const url = new URL(route.request().url());
    if (/supabase\./.test(url.hostname)) supabaseRequests++;
    return url.origin === new URL(BASE).origin ? route.continue() : route.abort();
  });
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', error => errors.push(error.message));
  p.on('dialog', dialog => dialog.accept());
  await p.clock.setFixedTime(new Date('2026-09-11T12:00:00-03:00'));
  await p.goto(BASE + '/demo-personal.html');
  await p.locator('#btnDemo').click();
  await p.waitForURL(/personal\.html/);
  await p.waitForFunction(() => window.__medalhasPersonal && window.__dadosApp && document.getElementById('persArea'));
  await p.evaluate(() => {
    const s = MTStore.read('ptStudio', {});
    s.alunos = [{ id: 'medalha-a', nome: 'Ágata Medalhas', ativo: true, appPubEm: '2026-09-01T12:00:00Z', retorno: { feitos: { '2026-09-10': 1 } } },
      { id: 'medalha-b', nome: 'Beatriz Medalhas', ativo: true }];
    s.config = Object.assign({}, s.config, { medalhasEvolutivas: [], conquistas: [], dia1Off: true, zapFilaOff: true, medalhaTestePreservado: 'configuração independente' });
    s.treinosV2 = { 'medalha-a': { fichas: [{ id: 'forca-preservada', titulo: 'Ficha preservada', itens: [] }], cardio: [] } };
    delete s.config.appEditGeralEm;
    localStorage.setItem('mtapp:ptStudio', JSON.stringify(s));
    __ptStudio.render(); __medalhasPersonal.render();
  });
  const store = () => p.evaluate(() => MTStore.read('ptStudio', {}));
  const raw = () => p.evaluate(() => localStorage.getItem('mtapp:ptStudio'));
  const chosen = async () => (await store()).config.medalhasEvolutivas;
  const cards = () => p.locator('#cqELista [data-cqe-item]');
  const ids = () => cards().evaluateAll(items => items.map(item => item.dataset.cqeItem));
  async function search(value, group = '') { await p.locator('#cqEGrupo').selectOption(group); await p.locator('#cqEBusca').fill(value); }
  async function open(id) { await p.locator('[data-cqe-edit="' + id + '"]').click(); }
  async function toggle(id) { await p.locator('[data-cqe-toggle="' + id + '"]').click(); }
  async function writeFailure(on) {
    await p.evaluate(fail => {
      if (fail) {
        window.__medalhaWriteOriginal = MTStore.write; window.__medalhaWriteCalls = 0;
        MTStore.write = function (key, value) { if (key === 'ptStudio') { window.__medalhaWriteCalls++; return false; } return window.__medalhaWriteOriginal.apply(this, arguments); };
      } else MTStore.write = window.__medalhaWriteOriginal;
    }, on);
  }

  eq(await p.locator('#abas [data-a]').evaluateAll(items => items.map(item => item.dataset.a)),
    ['dash', 'alunos', 'agenda', 'treinos', 'chat', 'nutricao', 'avaliacoes', 'quest', 'assessoria', 'desafio', 'pagamentos', 'relatorios', 'sitepro', 'pers', 'imagens', 'config', 'conta', 'ajuda'],
    'as 18 áreas do Personal permanecem na navegação');
  await p.locator('#abas [data-a="pers"]').click();
  await p.locator('#persArea').selectOption('medalhas');
  ok(await p.locator('#vPers [data-ptf-pane="medalhas"] #cqPersonalCard').isVisible(), 'Medalhas abre na Personalização');
  ok(!await p.locator('#vPers [data-ptf-pane="marca"]').isVisible(), 'subaba Medalhas mantém separadas as cores e a logo');
  const catalogue = await p.evaluate(() => MT_MEDALHAS.catalogo);
  ok(await p.evaluate(() => MT_MEDALHAS_CATALOGO.length >= 317), 'ao menos 317 benchmarks e opções HYROX estão disponíveis');
  eq(new Set(catalogue.map(item => item.id)).size, catalogue.length, 'catálogo integrado não repete identificadores');
  ok(catalogue.length > 317, 'catálogo conserva as medalhas de corrida, nutrição e hábitos');
  eq(await cards().count(), 24, 'lista inicial usa paginação de 24 opções');
  ok((await p.locator('#cqEContagem').innerText()).startsWith(catalogue.length + ' opções'), 'contador inclui todo o catálogo');
  await p.locator('#cqEMais').click();
  eq(await cards().count(), 48, 'Mostrar mais conserva as opções anteriores');
  const beforeBrowse = await raw();
  await search('  FRÁN  ');
  ok((await ids()).includes('cf-fran'), 'busca Fran aceita maiúsculas, espaços e acentos');
  await search('constancia alimentar');
  eq(await ids(), ['nutri-dias'], 'busca sem acento encontra Constância alimentar');
  for (const group of ['hyrox', 'corrida', 'nutricao']) {
    await search('', group);
    const expected = catalogue.filter(item => item.grupo === group).map(item => item.id);
    ok(expected.length > 0, 'catálogo contém modalidade ' + group);
    eq(await ids(), expected.slice(0, 24), 'filtro ' + group + ' exibe apenas sua modalidade');
  }
  await search('fran', 'hyrox');
  eq(await cards().count(), 0, 'busca e modalidade se combinam sem resultados de outro esporte');
  ok((await p.locator('#cqELista').innerText()).includes('Nenhuma medalha encontrada'), 'estado vazio orienta a ajustar a busca');
  const last = await p.evaluate(() => MT_MEDALHAS_CATALOGO.at(-1));
  await search(last.n);
  ok((await ids()).includes(last.id), 'busca alcança a última opção externa sem paginar');
  eq(await raw(), beforeBrowse, 'buscar, filtrar e paginar não gravam configurações');

  await search('fran'); await toggle('cf-fran');
  eq((await chosen()).map(item => item.id), ['cf-fran'], 'Ativar salva somente a medalha escolhida');
  eq(await p.locator('[data-cqe-toggle="cf-fran"]').getAttribute('aria-pressed'), 'true', 'ativação aparece no botão da medalha');
  ok(!!(await store()).config.appEditGeralEm, 'salvar marca o conteúdo para publicação');
  eq((await store()).alunos[0].appPubEm, '2026-09-01T12:00:00Z', 'salvar medalhas não simula publicação do app');
  await toggle('cf-fran'); eq(await chosen(), [], 'Desativar remove somente a seleção');
  await p.locator('#cqEAtivas').click(); eq(await cards().count(), 0, 'filtro Ativas respeita seleção vazia');
  await p.locator('#cqETodas').click(); await open('cf-fran');
  const fran = catalogue.find(item => item.id === 'cf-fran');
  eq(await p.locator('#cqECriterio').innerText(), fran.criterio, 'editor explica o registro que conta para Fran');
  eq(await p.locator('#cqEFonte').getAttribute('href'), fran.fonte, 'referência oficial permanece separada do critério');
  ok(/^https:\/\/www\.crossfit\.com\//.test(fran.fonte), 'Fran aponta para a fonte oficial CrossFit');
  eq(await p.locator('#cqEFonte').getAttribute('rel'), 'noopener noreferrer', 'fonte externa abre com isolamento de janela');
  await p.locator('#cqENome').fill('Minha jornada Fran');
  for (const metas of ['1', '5, 3', '2, 2', '0, 3', '1, inválido', '1, 1000001']) {
    const before = await raw(); await p.locator('#cqEMetas').fill(metas); await p.locator('#cqESalvar').click();
    eq(await raw(), before, 'metas inválidas não gravam: ' + metas);
    eq(await p.locator('#cqEMetas').inputValue(), metas, 'erro conserva as metas para corrigir: ' + metas);
    ok(await p.locator('#cqEEditor').isVisible(), 'erro mantém o editor aberto');
  }
  await p.locator('#cqEMetas').fill('2, 4, 8'); await p.locator('#cqENome').fill('');
  const beforeEmpty = await raw(); await p.locator('#cqESalvar').click(); eq(await raw(), beforeEmpty, 'nome vazio não salva configuração');
  await p.locator('#cqENome').fill('Minha jornada Fran');
  ok((await p.locator('#cqEPrevia').innerText()).includes('Etapa 3: 8'), 'prévia mostra as metas crescentes digitadas');
  await writeFailure(true);
  const beforeFailure = await raw(); await p.locator('#cqESalvar').click();
  ok(await p.evaluate(() => window.__medalhaWriteCalls > 0), 'cenário de falha alcança a gravação real do editor');
  eq(await raw(), beforeFailure, 'falha de escrita conserva todo o estado salvo');
  eq([await p.locator('#cqENome').inputValue(), await p.locator('#cqEMetas').inputValue()], ['Minha jornada Fran', '2, 4, 8'], 'falha conserva nome e metas do rascunho');
  ok(await p.locator('#cqEEditor').isVisible(), 'falha de escrita mantém formulário aberto');
  ok((await p.locator('#cqEStatus').innerText()).includes('Não foi possível salvar'), 'falha informa que é possível tentar novamente');
  await writeFailure(false); await p.locator('#cqESalvar').click();
  eq(await chosen(), [{ id: 'cf-fran', nome: 'Minha jornada Fran', metas: [2, 4, 8] }], 'tentar novamente salva nome e metas sem copiar o catálogo');
  ok(!await p.locator('#cqEEditor').isVisible(), 'salvamento confirmado fecha o editor');
  await open('cf-fran');
  eq(await p.locator('#cqENome').inputValue(), 'Minha jornada Fran', 'Ajustar reabre o nome salvo');
  eq(await p.locator('#cqEMetas').inputValue(), '2, 4, 8', 'Ajustar reabre as metas salvas');
  await p.locator('#cqEMetas').fill('2, 4'); await p.locator('#cqESalvar').click();
  eq((await chosen())[0].metas, [2, 4], 'mínimo de duas metas crescentes é aceito');
  await open('cf-fran'); await p.locator('#cqEMetas').fill('2, 4, 8'); await p.locator('#cqESalvar').click(); await open('cf-fran');
  await p.locator('#cqERestaurar').click();
  eq(await p.locator('#cqEMetas').inputValue(), fran.metas.join(', '), 'Restaurar recupera sugestões somente no rascunho');
  eq((await chosen())[0].metas, [2, 4, 8], 'restaurar no formulário não altera metas salvas');
  await p.locator('#cqEFechar').click();

  // Uma edição concorrente da mesma medalha exige nova leitura, sem perder o rascunho.
  await open('cf-fran'); await p.locator('#cqENome').fill('Rascunho concorrente');
  await p.evaluate(() => { const s = MTStore.read('ptStudio', {}); s.config.medalhasEvolutivas[0].nome = 'Nome salvo em outra edição'; MTStore.write('ptStudio', s); });
  const concurrent = await raw(); await p.locator('#cqESalvar').click();
  eq(await raw(), concurrent, 'edição concorrente não é sobrescrita');
  eq(await p.locator('#cqENome').inputValue(), 'Rascunho concorrente', 'conflito mantém o texto ainda não salvo');
  ok((await p.locator('#cqEStatus').innerText()).includes('outra edição'), 'conflito pede conferência explícita');
  await p.locator('#cqEFechar').click();
  await writeFailure(true); const beforeToggleFailure = await raw(); await toggle('cf-fran');
  eq(await raw(), beforeToggleFailure, 'falha ao desativar conserva a seleção');
  eq(await p.locator('[data-cqe-toggle="cf-fran"]').getAttribute('aria-pressed'), 'true', 'falha ao desativar mantém o estado visual ativo');
  await writeFailure(false);

  await search('', 'hyrox'); await p.locator('#cqEAtivarGrupo').click();
  const hyroxIds = catalogue.filter(item => item.grupo === 'hyrox').map(item => item.id);
  eq((await chosen()).map(item => item.id).sort(), ['cf-fran', ...hyroxIds].sort(), 'Ativar resultados acrescenta o grupo e preserva Fran');
  await search('', 'crossfit'); await p.locator('#cqEAtivarGrupo').click();
  const crossfitIds = catalogue.filter(item => item.grupo === 'crossfit').map(item => item.id);
  eq((await chosen()).length, new Set([...crossfitIds, ...hyroxIds]).size, 'ativação de mais de 300 opções não é truncada no limite antigo');
  eq((await chosen()).find(item => item.id === 'cf-fran').nome, 'Nome salvo em outra edição', 'ativar grupo conserva a personalização existente');
  const dto = await p.evaluate(() => __dadosApp(MTStore.read('ptStudio', {}).alunos[0], 'teste-medalhas'));
  eq(dto.medalhasApp.map(item => item.id).sort(), (await chosen()).map(item => item.id).sort(), 'pacote contém exatamente as medalhas selecionadas');
  eq(dto.medalhasApp.find(item => item.id === 'cf-fran').metas, [2, 4, 8], 'pacote conserva as metas personalizadas');
  eq(dto.medalhasApp.find(item => item.id === 'cf-fran').fonte, fran.fonte, 'pacote conserva a fonte oficial');
  eq(dto.medalhasApp.find(item => item.id === 'cf-fran').criterio, fran.criterio, 'pacote conserva o critério do registro');
  ok(dto.medalhasApp.every(item => !('valor' in item) && !('nivel' in item) && !('proxima' in item)), 'pacote contém definições, sem progresso ou conquistas inventadas');
  ok((await chosen()).every(item => Object.keys(item).sort().join(',') === 'id,metas,nome'), 'configuração persistida guarda somente seleção, nome e metas');

  await search('fran');
  await p.locator('#cqLegadas > summary').click();
  await p.locator('#cqPersNome').fill('Medalha livre de teste'); await p.locator('#cqPersMeta').fill('25'); await p.locator('#cqPersAdd').click();
  const legacy = (await store()).config.conquistas;
  eq(legacy.map(item => [item.n, item.meta]), [['Medalha livre de teste', 25]], 'cqPersAdd continua criando medalha livre por total de treinos');
  eq(await p.evaluate(() => __dadosApp(MTStore.read('ptStudio', {}).alunos[0], 'teste-legado').cfg.conquistas), legacy, 'pacote conserva as medalhas livres no contrato anterior');
  ok((await p.locator('#cqPersLista').innerText()).includes('Medalha livre de teste'), 'medalha livre aparece na lista anterior');
  eq((await chosen()).length, new Set([...crossfitIds, ...hyroxIds]).size, 'medalha livre conserva as seleções evolutivas');
  await p.locator('#cqLegadas > summary').click();
  eq((await store()).config.medalhaTestePreservado, 'configuração independente', 'editor conserva configurações independentes');
  eq((await store()).treinosV2['medalha-a'].fichas[0].titulo, 'Ficha preservada', 'editor conserva as fichas do aluno');
  eq((await store()).alunos[0].retorno.feitos, { '2026-09-10': 1 }, 'editor conserva o histórico de registros do aluno');

  // Cores e geometria são verificadas na tela real, com o editor aberto.
  await p.locator('#persArea').selectOption('marca');
  await p.evaluate(() => { const input = document.getElementById('cfgCor'); input.value = '#0ea5e9'; input.dispatchEvent(new Event('change')); });
  await p.locator('#persArea').selectOption('medalhas'); await open('cf-fran');
  for (const light of [false, true]) {
    await p.evaluate(wanted => { if (document.documentElement.classList.contains('claro') !== wanted) document.getElementById('btnTemaPt').click(); }, light);
    const colors = await p.evaluate(() => {
      const editor = document.getElementById('cqEEditor'), icon = document.querySelector('.cqe-symbol'), probe = document.createElement('span');
      probe.style.color = 'var(--pt-roxo-claro)'; editor.appendChild(probe);
      const result = { icon: getComputedStyle(icon).color, expected: getComputedStyle(probe).color, border: getComputedStyle(editor).borderTopColor, bg: getComputedStyle(editor).backgroundColor, text: getComputedStyle(editor).color };
      probe.remove(); return result;
    });
    eq(colors.icon, colors.expected, 'ícone herda a cor personalizada no tema ' + (light ? 'claro' : 'escuro'));
    eq(colors.border, 'rgb(14, 165, 233)', 'editor usa a cor personalizada na borda');
    ok(colors.bg !== colors.text, 'texto e superfície mantêm cores distintas');
    for (const width of [320, 390, 1440]) {
      await p.setViewportSize({ width, height: 1000 });
      const layout = await p.evaluate(() => {
        const card = document.getElementById('cqPersonalCard'), visible = [...card.querySelectorAll('input,select,button,a')].filter(el => el.getClientRects().length);
        return { page: document.documentElement.scrollWidth, viewport: innerWidth, card: card.clientWidth, content: card.scrollWidth,
          outside: visible.filter(el => { const r = el.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1; }).map(el => el.id || el.textContent),
          smallButtons: visible.filter(el => el.tagName === 'BUTTON' && el.getBoundingClientRect().height < 43.5).map(el => el.id || el.textContent) };
      });
      ok(layout.page <= layout.viewport + 1 && layout.content <= layout.card + 1, 'sem rolagem horizontal em ' + width + 'px / ' + (light ? 'claro' : 'escuro') + ': ' + JSON.stringify(layout));
      eq(layout.outside, [], 'controles ficam dentro da tela em ' + width + 'px');
      eq(layout.smallButtons, [], 'botões de medalhas preservam alvos de toque em ' + width + 'px');
    }
  }
  eq(supabaseRequests, 0, 'nenhuma chamada é enviada ao Supabase real');
  eq(errors, [], 'editor completo executa sem erros JavaScript');
  await ctx.close(); console.log('PASSOU: ' + checks + ' verificações de medalhas no Personal');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
