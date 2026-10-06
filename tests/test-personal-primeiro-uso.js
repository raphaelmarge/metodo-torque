/* Primeiro uso: fixture isolada, sem clientes ou chamadas de produção. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let playwright;
try { playwright = require('./ci/node_modules/playwright'); }
catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; playwright = require(process.env.TORQUE_PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright'); }
const { comMockNuvem } = require('./_nuvem.js');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765';
let browser, checks = 0;
const ok = (v, label) => { assert.ok(v, label); checks++; console.log('OK ' + label); };
const eq = (v, expected, label) => { assert.deepEqual(v, expected, label); checks++; console.log('OK ' + label); };
(async () => {
  browser = comMockNuvem(await playwright.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }));
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', locale: 'pt-BR' });
  await ctx.route('**/*', route => new URL(route.request().url()).origin === new URL(BASE).origin ? route.continue() : route.abort('blockedbyclient'));
  await ctx.addInitScript(() => {
    localStorage.setItem('mtapp:ptSemConta', '1');
    localStorage.setItem('mtapp:perfil', JSON.stringify({ nome: 'Teste isolado' }));
  });
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message));
  p.on('dialog', d => d.dismiss());
  await p.goto(BASE + '/personal.html');
  await p.waitForFunction(() => window.__ptStudio && window.__dia1Estado);
  await p.fill('#obNome', 'Personal fictício'); await p.click('#obOk');
  ok(await p.locator('#obP4').isVisible() && await p.locator('#obP2').isHidden(), 'Aluno é a primeira ação, antes de cobrança e Pix');
  await p.evaluate(() => {
    window.__primeiroCalls = [];
    const cloud = window.mockNuvem({ aid: 'academia-ficticia', rpc: (name, args) => {
      window.__primeiroCalls.push({ name, args }); return Promise.resolve({ data: { ok: true }, error: null });
    } });
    window.MTStore.cloud = () => cloud; window.mockPublicacaoCas(cloud);
    window.MT_FUNCAO.chama = (client, name) => { window.__primeiroCalls.push({ name }); return Promise.resolve({ ok: true }); };
    const st = window.MTStore.read('ptStudio', {});
    st.config.onboardingConsultoria = { ativo: true, contratoAtivo: true };
    window.MTStore.write('ptStudio', st);
  });
  await p.click('#obP4Aluno');
  ok(await p.locator('#naDadosComerciais').evaluate(e => !e.open), 'CPF e endereço permanecem disponíveis em área opcional');
  await p.waitForFunction(() => !document.getElementById('naOnboardingBox').hidden);
  ok(!await p.locator('#naOnboarding').isChecked(), 'Contrato ativo na configuração não bloqueia automaticamente o aluno novo');
  await p.fill('#aNome', 'Aluno fictício'); await p.fill('#aEmail', 'aluno@example.invalid');
  await p.evaluate(() => { window.__primeiroWrite = window.MTStore.write; window.MTStore.write = (key, v) => key === 'ptStudio' ? false : window.__primeiroWrite(key, v); });
  await p.click('#aAdd');
  ok(await p.locator('#naCadastroStatus').innerText().then(t => /Não foi possível salvar/.test(t)), 'Falha local mantém o cadastro pendente e visível');
  eq(await p.locator('#aNome').inputValue(), 'Aluno fictício', 'Falha mantém os campos preenchidos');
  eq(await p.evaluate(() => window.__dia1Estado(window.MTStore.read('ptStudio', {})).cadastro), false, 'Falha não conclui o checklist');
  await p.evaluate(() => { window.MTStore.write = window.__primeiroWrite; });
  await p.click('#aAdd');
  ok(await p.locator('#naTreino').isVisible() && await p.locator('#naComercial').evaluate(e => !e.open), 'Após salvar, treino é a ação principal e comércio fica recolhido');
  eq(await p.evaluate(() => {
    const s = window.MTStore.read('ptStudio', {}), a = s.alunos[0]; window.__primeiroAluno = a.id;
    return { alunos: s.alunos.length, cpf: a.cpf, contratos: s.contratosPT.length, pagamentos: s.pagamentos.length, token: !!a.appTokenP, acesso: !!a.acessoEm, convite: window.__primeiroCalls.some(x => /aluno_define_login|envia-email|app_aluno_publica_cas/.test(x.name)) };
  }), { alunos: 1, cpf: '', contratos: 0, pagamentos: 0, token: false, acesso: false, convite: false }, 'Cadastro com e-mail não cria acesso, publica, cobra ou envia convite');
  await p.click('#naTreino');
  eq(await p.locator('#tAluno').inputValue(), await p.evaluate(() => window.__primeiroAluno), 'Montar treino abre o aluno cadastrado');
  const states = await p.evaluate(() => {
    const s = window.MTStore.read('ptStudio', {}), id = s.alunos[0].id, exId = s.exercicios[0].id, read = () => { const e = window.__dia1Estado(s); return [e.cadastro, e.treino, e.publicado, e.aberto]; };
    s.config.dia1AppVisto = true; s.alunos[0].appTokenP = 'primeiro-uso-token';
    s.treinosV2[id] = { fichas: [{ id: 'vazia', titulo: 'A', itens: [] }] };
    const vazio = read();
    s.treinosV2[id] = { fichas: [{ id: 'ficha', titulo: 'A', itens: [{ exId, series: 3, reps: '10', descanso: 60 }] }] };
    const musculacao = read();
    s.treinosV2[id] = { fichas: [], wods: [{ id: 'wod', nome: 'Circuito', tipo: 'amrap', min: 5, mov: ['10 Agachamentos'] }] };
    const circuito = read();
    s.treinosV2[id] = { fichas: [], cardio: [{ id: 'corrida', nome: 'Corrida', tipo: 'continuo', mod: 'corrida', dist: 2 }] };
    const corrida = read();
    window.MTStore.write('ptStudio', s); return { vazio, musculacao, circuito, corrida };
  });
  eq(states.vazio, [true, false, false, false], 'Ficha vazia, token e flag legada não concluem treino, publicação ou abertura');
  for (const modalidade of ['musculacao', 'circuito', 'corrida']) eq(states[modalidade], [true, true, false, false], modalidade + ': prescrição salva ainda não é publicação');
  const failed = await p.evaluate(async () => {
    const S = window.MTStore, orig = S.publicaAppsSeguros;
    S.publicaAppsSeguros = () => Promise.resolve({ error: { message: 'Falha de teste' } });
    const r = await window.__publicaPacotes(S.cloud(), S.read('ptStudio', {}).alunos);
    S.publicaAppsSeguros = orig;
    return { falhou: !!r.erro, publicado: window.__dia1Estado(S.read('ptStudio', {})).publicado };
  });
  eq(failed, { falhou: true, publicado: false }, 'Falha de publicação não conclui a etapa');
  ok(await p.evaluate(async () => { const S = window.MTStore; const r = await window.__publicaPacotes(S.cloud(), S.read('ptStudio', {}).alunos); return r.ok && window.__dia1Estado(S.read('ptStudio', {})).publicado; }), 'Resposta confirmada de publicação libera a abertura, sem contrato ou cobrança');
  ok(await p.evaluate(() => {
    const S = window.MTStore, s = S.read('ptStudio', {});
    const reorder = v => Array.isArray(v) ? v.map(reorder) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).reverse().map(k => [k, reorder(v[k])])) : v;
    s.alunos[0].acompPublicado = reorder(s.alunos[0].acompPublicado); S.write('ptStudio', s);
    return window.__dia1Estado(S.read('ptStudio', {})).publicado;
  }), 'Ordem de chaves devolvida pelo JSONB não invalida uma publicação confirmada');
  eq(await p.evaluate(() => window.__primeiroCalls.filter(x => /aluno_define_login|envia-email/.test(x.name)).length), 0, 'Publicar não envia convite de acesso');
  await p.evaluate(() => {
    document.querySelector('#abas [data-a="dash"]').click();
    window.__dia1(window.MTStore.read('ptStudio', {}));
    window.__primeiroOpen = window.open; window.open = () => null;
  });
  await p.click('#dia1Card [data-d1="app"]');
  ok(/bloqueou/.test(await p.locator('#dia1Status').innerText()), 'Popup bloqueado oferece recuperação');
  eq(await p.evaluate(() => window.__dia1Estado(window.MTStore.read('ptStudio', {})).aberto), false, 'Popup bloqueado não registra sucesso');
  await p.evaluate(() => { window.open = () => ({ closed: true }); });
  await p.click('#dia1Card [data-d1="app"]');
  eq(await p.evaluate(() => window.__dia1Estado(window.MTStore.read('ptStudio', {})).aberto), false, 'Janela fechada antes do app não registra sucesso');
  // Popup real em rota interceptada: o primeiro documento é somente o loader.
  await ctx.route('**/app/?t=primeiro-uso-token', route => route.fulfill({ contentType: 'text/html', body: '<p id="loading">Carregando fixture</p>' }));
  await p.evaluate(() => { window.open = window.__primeiroOpen; });
  const popupPromise = ctx.waitForEvent('page'); await p.click('#dia1Card [data-d1="app"]'); const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  eq(await p.evaluate(() => window.__dia1Estado(window.MTStore.read('ptStudio', {})).aberto), false, 'Abrir somente o carregador não equivale ao app pronto');
  await popup.evaluate(() => { const e = document.createElement('div'); e.id = 'diasSem'; document.body.appendChild(e); });
  await p.waitForFunction(() => window.__dia1Estado(window.MTStore.read('ptStudio', {})).aberto);
  ok(await p.locator('#dia1Card').isHidden(), 'App carregado confirma a quarta etapa e encerra o guia');
  await popup.close();
  const revisions = await p.evaluate(() => {
    const s = window.MTStore.read('ptStudio', {}), id = s.alunos[0].id;
    s.treinosV2[id].cardio[0].dist = 3;
    const editado = window.__dia1Estado(s); s.alunos[0].appRevogadoEm = new Date().toISOString();
    const revogado = window.__dia1Estado(s); return { editado: [editado.publicado, editado.aberto], revogado: [revogado.publicado, revogado.aberto] };
  });
  eq(revisions, { editado: [false, false], revogado: [false, false] }, 'Prescrição alterada ou aluno revogado não herda abertura/publicação antiga');
  ok(await p.evaluate(() => { const s = window.MTStore.read('ptStudio', {}); s.treinosV2[s.alunos[0].id].cardio[0].dist = 3; window.__dia1(s); return document.getElementById('dia1Card').hidden; }), 'Guia já concluído não reaparece a cada edição posterior');
  const out = path.join(__dirname, 'out', 'personal-primeiro-uso'); fs.mkdirSync(out, { recursive: true });
  for (const width of [320, 390, 768, 1440]) for (const tema of ['escuro', 'claro']) {
    await p.setViewportSize({ width, height: 900 });
    await p.evaluate(tema => { if ((document.documentElement.dataset.tema === 'claro') !== (tema === 'claro')) document.getElementById('btnTemaPt').click(); document.getElementById('btnNovoAluno').click(); }, tema);
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.getElementById('dlgNovoAluno').getBoundingClientRect().right <= innerWidth + 1), width + '/' + tema + ': cadastro cabe na tela');
    if (width === 390) await p.screenshot({ path: path.join(out, tema + '.png'), animations: 'disabled' });
    await p.click('#naCancela');
  }
  await p.evaluate(() => document.getElementById('btnNovoAluno').click());
  await p.fill('#aNome', 'Segundo aluno fictício'); await p.fill('#aEmail', 'segundo@example.invalid');
  await p.click('#aAdd'); await p.locator('#naComercial > summary').click();
  await p.fill('#naValor', '123'); await p.locator('#naPagar').check();
  await p.click('#naPerfil');
  eq(await p.evaluate(() => window.MTStore.read('ptStudio', {}).pagamentos.length), 0, 'Abrir perfil não salva uma venda apenas preenchida no disclosure');
  eq(await p.evaluate(() => window.__primeiroCalls.filter(x => x.name === 'envia-email').length), 0, 'Visitar perfil também não envia convite');
  // A ação manual existente mantém a publicação e o envio explícitos, inteiramente mockados.
  await p.evaluate(() => document.getElementById('pfAcesso').click());
  await p.waitForFunction(() => window.__primeiroCalls.some(x => x.name === 'envia-email'));
  eq(await p.evaluate(() => ({ logins: window.__primeiroCalls.filter(x => x.name === 'aluno_define_login').length, emails: window.__primeiroCalls.filter(x => x.name === 'envia-email').length })), { logins: 1, emails: 1 }, 'Enviar acesso conscientemente cria um login e solicita um e-mail, uma vez');
  eq(errors, [], 'Nenhum erro JavaScript no fluxo');
  await ctx.close(); console.log(checks + ' verificações de primeiro uso aprovadas');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
