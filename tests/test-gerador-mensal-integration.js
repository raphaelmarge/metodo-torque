/* Painel completo servido por interceptação local, sem rede ou dados reais. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { MOCK_NUVEM } = require('./_nuvem.js');
const F = require('./gerador-mensal-fixtures.js');
let playwright;
for (const name of [process.env.TORQUE_PLAYWRIGHT, 'playwright', './ci/node_modules/playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'), '/opt/node22/lib/node_modules/playwright'].filter(Boolean)) { try { playwright = require(name); break; } catch (_) {} }
if (!playwright) throw new Error('Configure TORQUE_PLAYWRIGHT.');
const root = path.resolve(__dirname, '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
let n = 0;
function eq(a, b, label) { assert.deepEqual(a, b, label); n++; console.log('OK ' + label); }
function ok(v, label) { assert.ok(v, label); n++; console.log('OK ' + label); }
(async () => {
  const browser = await playwright.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'America/Sao_Paulo', serviceWorkers: 'block' });
  await context.addInitScript(MOCK_NUVEM);
  const origin = new URL(process.env.BASE_URL || 'https://torque-panel-test.invalid').origin, external = [], errors = [];
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { external.push(url.href); return route.abort(); }
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: 'Recurso de teste ausente' });
    return route.fulfill({ contentType: mime[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
  });
  const p = await context.newPage(); p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.dismiss());
  try {
    await p.clock.setFixedTime(new Date('2026-11-01T12:00:00-03:00'));
    await p.goto(origin + '/demo-personal.html'); await p.locator('#btnDemo').click(); await p.waitForURL(/personal\.html/);
    await p.waitForFunction(() => window.__ptStudio && window.MT_PERSONAL_GERADOR_MENSAL);
    const seed = F.state(); seed.alunos[0].appTokenP = 'synthetic-monthly-token';
    seed.treinosV2['gm-test-a'].cardio = [{ id: 'existing-cardio', nome: 'Cardio preservado', tipo: 'continuo' }];
    seed.treinosV2['gm-test-a'].plano.datas['2026-11-03'] = [{ tp: 'cardio', id: 'existing-cardio', h: '18:00' }];
    await p.evaluate(seed => {
      window.testPublishCalls = 0;
      const mock = mockNuvem({ aid: 'monthly-test-academy', rpc: (name, args) => { if (name === 'app_aluno_publica_cas') testPublishCalls++; return Promise.resolve({ data: { ok: true }, error: null }); } });
      MTStore.cloud = () => mock; mockPublicacaoCas(mock);
      localStorage.setItem('mtapp:ptStudio', JSON.stringify(seed)); __ptStudio.render();
      document.querySelector('#abas [data-a="treinos"]').click(); __trAba('mensal');
    }, seed);
    await p.locator('#gmAluno').selectOption('gm-test-a');
    eq(await p.locator('#gmMinutes').inputValue(), '60', 'painel real carrega perfil do aluno escolhido');
    await p.locator('#gmDataConfirmed').check(); await p.locator('#gmPrepare').click();
    ok(await p.evaluate(() => !!MTStore.read('ptStudio', {}).alunos[0].geradorMensal.proposal), 'geração persiste no MTStore real');
    eq(await p.evaluate(() => testPublishCalls), 0, 'geração não publica por CAS');
    await p.locator('#gmApproveCheck').check(); await p.locator('#gmApprove').click();
    eq(await p.evaluate(() => MTStore.read('ptStudio', {}).treinosV2['gm-test-a'].fichas.length), 0, 'aprovação deixa treino atual inalterado');
    await p.evaluate(() => { window.testStoreWrite = MTStore.write; MTStore.write = () => false; });
    await p.locator('#gmApply').click();
    ok((await p.locator('#gmStatus').innerText()).includes('Não foi possível salvar'), 'falha de aplicação é informada no painel');
    eq(await p.evaluate(() => MTStore.read('ptStudio', {}).treinosV2['gm-test-a'].fichas.length), 0, 'falha de aplicação não deixa fichas parciais');
    eq(await p.evaluate(() => (MTStore.read('ptStudio', {}).alunos[0].geradorMensal.history || []).length), 0, 'falha de aplicação não acrescenta histórico');
    await p.evaluate(() => { MTStore.write = testStoreWrite; });
    await p.locator('#gmApply').click();
    let saved = await p.evaluate(() => MTStore.read('ptStudio', {}));
    eq(saved.treinosV2['gm-test-a'].fichas.length, 3, 'aplicação integra fichas da etapa ao editor existente');
    ok(saved.alunos[0].geradorMensal.active, 'aplicação registra etapa ativa');
    eq(saved.treinosV2['gm-test-a'].cardio[0].id, 'existing-cardio', 'aplicação preserva outra modalidade');
    ok(saved.treinosV2['gm-test-a'].plano.datas['2026-11-03'].some(x => x.id === 'existing-cardio'), 'calendário preserva atividade de outra modalidade');
    eq(saved.treinosV2['gm-test-b'].fichas[0].titulo, 'Preservar outro aluno', 'aplicação preserva outro aluno');
    eq(await p.evaluate(() => testPublishCalls), 0, 'aplicar não publica automaticamente');
    const legacyRoutes = await p.evaluate(async () => {
      const before = JSON.stringify(MTStore.read('ptStudio', {})), original = window.MT_FUNCAO; let calls = 0;
      window.MT_FUNCAO = Object.assign({}, original, { chama: () => { calls++; return Promise.resolve({ data: {}, error: null }); } });
      try {
        const ia = await new Promise(resolve => __iaTreino('gm-test-a', 'hipertrofia', 'academia', resolve, 'musculacao', { preview: true }));
        const generated = __treinoAuto.gera('gm-test-a', 'hipertrofia', 'academia');
        const evolved = __treinoAuto.evolui('gm-test-a');
        return { ia, generated, evolved, calls, unchanged: before === JSON.stringify(MTStore.read('ptStudio', {})) };
      } finally { window.MT_FUNCAO = original; }
    });
    ok(legacyRoutes.ia && /Gerador mensal/.test(legacyRoutes.ia.erro), 'IA legada recusa aluno com etapa mensal ativa');
    eq(legacyRoutes.calls, 0, 'IA legada é bloqueada antes de chamar serviço remoto');
    ok(legacyRoutes.generated && /Gerador mensal/.test(legacyRoutes.generated.erro), 'geração legada por catálogo recusa etapa mensal ativa');
    ok(legacyRoutes.evolved && /Gerador mensal/.test(legacyRoutes.evolved.erro), 'evolução legada recusa etapa mensal ativa');
    eq(legacyRoutes.unchanged, true, 'rotas legadas bloqueadas preservam o estado mensal completo');
    eq(await p.evaluate(() => { const s = MTStore.read('ptStudio', {}); s.alunos[0].appVer = 'versao-anterior'; s.alunos[0].appPubEm = '2026-10-15T12:00:00Z'; return __appsPendentes.pendente(s, s.alunos[0], true); }), false, 'versão antiga do app não autoriza autopublicar etapa ainda não entregue');
    ok(saved.alunos[0].appEditEm || saved.alunos[0].appPublicacaoPendente, 'aplicação sinaliza edição aguardando publicação');
    const exported = await p.evaluate(() => MT_PERSONAL_GERADOR_MENSAL.packet(MTStore.read('ptStudio', {}), 'gm-test-a'));
    ok(exported && exported.active && exported.active.id, 'pacote exporta identificação da etapa aplicada');
    ok(!JSON.stringify(exported).match(/conditions|healthDetails|anamnese|clinicalReviewed|birthDate|guidance/), 'pacote mensal não envia anamnese clínica');
    const packet = await p.evaluate(() => __pacoteApp(MTStore.read('ptStudio', {}).alunos[0], '2026-11-01T15:00:00Z'));
    eq(packet.dados.geradorMensal.active.id, saved.alunos[0].geradorMensal.active.id, 'pacote completo contém a etapa aprovada');
    ok(packet.dados.fichasApp[0].itens[0].geradorMensal.context, 'metadados comparáveis acompanham a execução prescrita');
    await p.locator('#gmPublish').click();
    ok(await p.locator('#acPublicar').isVisible(), 'Publicar abre a prévia existente para conferência final');
    eq(await p.evaluate(() => testPublishCalls), 0, 'abrir prévia não publica');
    await p.locator('#acPublicar').click();
    await p.waitForFunction(() => testPublishCalls === 1);
    eq(await p.evaluate(() => testPublishCalls), 1, 'publicação explícita usa uma chamada CAS simulada');
    await p.waitForFunction(() => !!MTStore.read('ptStudio', {}).alunos[0].geradorMensal.active.publishedAt);
    ok(await p.evaluate(() => !!MTStore.read('ptStudio', {}).alunos[0].geradorMensal.active.publishedAt), 'retorno confirmado da publicação grava o carimbo da etapa exata');
    const safety = await p.evaluate(() => {
      const original = MTStore.read('ptStudio', {}), results = {};
      const check = (name, change) => {
        const s = structuredClone(original); change(s);
        let blocked = false; try { MT_PERSONAL_GERADOR_MENSAL.packet(s, 'gm-test-a'); } catch (_) { blocked = true; }
        results[name] = { current: MT_PERSONAL_GERADOR_MENSAL.isCurrent(s, 'gm-test-a'), blocked };
      };
      check('unchanged', () => {});
      check('dose', s => { s.treinosV2['gm-test-a'].fichas[0].itens[0].series++; });
      check('schedule', s => { s.treinosV2['gm-test-a'].plano.datas['2026-11-02'] = []; });
      check('usedCatalog', s => { const id = s.treinosV2['gm-test-a'].fichas[0].itens[0].exId; s.exercicios.find(e => e.id === id).requirements.push('new_requirement'); });
      check('clinical', s => { s.alunos[0].geradorMensal.perfil.conditions.push({ id: 'new-condition', name: 'Nova condição informada' }); });
      check('healthReport', s => { s.alunos[0].retorno.geradorMensal = { version: 1, reports: { c: { revisions: { r: { id: 'r', cycleId: 'c', kind: 'health', createdAt: '2026-11-01T15:00:00Z', author: 'aluno', data: { symptoms: 'sim' } } } } } }; });
      check('legacyHealth', s => { s.alunos[0].retorno.anamnese = { lesoes: 'Lesão nova relatada' }; s.alunos[0].retorno.anamneseEm = '2026-11-01T16:00:00Z'; });
      check('otherStudent', s => { s.treinosV2['gm-test-b'].fichas[0].titulo = 'Mudou outro aluno'; });
      check('otherModality', s => { s.treinosV2['gm-test-a'].plano.datas['2026-11-03'].push({ tp: 'cardio', id: 'other-cardio', h: '19:00' }); });
      return results;
    });
    eq(safety.unchanged, { current: true, blocked: false }, 'publicação concluída conserva a assinatura da etapa');
    for (const [key, label] of [['dose', 'dose'], ['schedule', 'agenda de resistência'], ['usedCatalog', 'catálogo utilizado'], ['clinical', 'orientação clínica'], ['healthReport', 'relato de saúde'], ['legacyHealth', 'anamnese clínica legada']]) eq(safety[key], { current: false, blocked: true }, 'mudança de ' + label + ' impede pacote antigo');
    eq(safety.otherStudent, { current: true, blocked: false }, 'edição de outro aluno não invalida a etapa');
    eq(safety.otherModality, { current: true, blocked: false }, 'atividade de outra modalidade não altera assinatura de resistência');
    await p.reload(); await p.waitForFunction(() => window.__ptStudio && window.MT_PERSONAL_GERADOR_MENSAL);
    await p.evaluate(() => { MTStore.cloud = () => null; document.querySelector('#abas [data-a="treinos"]').click(); __trAba('mensal'); });
    await p.locator('#gmAluno').selectOption('gm-test-a');
    ok(await p.locator('#gmPublish').isVisible(), 'recarga conserva etapa aplicada e ação separada de publicação');
    saved = await p.evaluate(() => MTStore.read('ptStudio', {}));
    eq(saved.treinosV2['gm-test-a'].fichas.length, 3, 'recarga conserva fichas aplicadas');
    if (process.env.ARTIFACT_DIR) {
      fs.mkdirSync(process.env.ARTIFACT_DIR, { recursive: true });
      await p.locator('#gmSection').scrollIntoViewIfNeeded();
      await p.screenshot({ path: path.join(process.env.ARTIFACT_DIR, 'gerador-mensal-desktop.png'), fullPage: false, animations: 'disabled' });
    }
    await p.setViewportSize({ width: 390, height: 844 });
    await p.locator('#fecharMenuPt').dispatchEvent('click');
    await p.waitForFunction(() => !document.body.classList.contains('menu-aberto'));
    await p.waitForFunction(() => document.querySelector('#abas').getBoundingClientRect().right <= 0);
    await p.locator('#gmRoot .gm-overview').scrollIntoViewIfNeeded();
    const layout = await p.locator('#gmRoot').evaluate(el => ({ rootFits: el.getBoundingClientRect().right <= innerWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1, actionsFit: Array.from(el.querySelectorAll('.gm-actions button,.gm-note')).filter(n => n.getBoundingClientRect().width).every(n => n.getBoundingClientRect().right <= innerWidth + 1 && n.scrollWidth <= n.getBoundingClientRect().width + 1) }));
    eq(layout, { rootFits: true, actionsFit: true }, 'painel completo em 390px mantém ações e texto sem corte horizontal');
    if (process.env.ARTIFACT_DIR) {
      // O painel possui transições de resize; aguarde a pintura antes da captura visual.
      await p.waitForTimeout(500);
      await p.screenshot({ path: path.join(process.env.ARTIFACT_DIR, 'gerador-mensal-mobile.png'), fullPage: false, animations: 'disabled' });
    }
    eq(errors, [], 'painel completo não apresentou exceções JavaScript');
    ok(!external.some(url => /anthropic|openai|generativelanguage|api\.mistral/.test(url)), 'geração do painel não invoca modelo de linguagem');
    console.log(n + ' verificações de integração mensal passaram. Rede externa bloqueada: ' + external.length + ' solicitações de recursos legados.');
  } finally { await context.close(); await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
