/* Propostas locais: interrupção, isolamento, ajustes e falhas antes de aplicar. */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const { comMockNuvem } = require('./_nuvem.js');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765';
let browser, checks = 0;
const ok = (v, name) => { assert.ok(v, name); checks++; console.log('OK: ' + name); };
const eq = (a, b, name) => { assert.deepEqual(a, b, name); checks++; console.log('OK: ' + name); };
(async () => {
  browser = comMockNuvem(await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }));
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', serviceWorkers: 'block' });
  const errors = [], network = [];
  await context.route('**://*.supabase.co/**', r => { network.push(r.request().url()); return r.abort(); });
  const p = await context.newPage();
  p.on('pageerror', e => errors.push(e.message));
  p.on('dialog', d => d.type() === 'confirm' ? d.accept() : d.dismiss());
  await p.goto(BASE + '/demo-personal.html'); await p.locator('#btnDemo').click(); await p.waitForURL(/personal\.html/);
  await p.waitForFunction(() => window.__iaRevisao && window.mockNuvem);
  await p.evaluate(() => {
    const S = window.MTStore, st = S.read('ptStudio', {}), ex = st.exercicios[0];
    st.alunos = [{ id: 'draft-a', nome: 'Aluno Fictício A', ativo: true, anamnese: { nivel: 'intermediario', dias: 3 } }, { id: 'draft-b', nome: 'Aluno Fictício B', ativo: true }];
    st.treinosV2 = { 'draft-a': { fichas: [{ id: 'original', titulo: 'Treino original', itens: [{ exId: ex.id, series: 2, reps: '12', descanso: 60 }] }] }, 'draft-b': { fichas: [] } };
    st.config = Object.assign({}, st.config, { dia1Off: true, zapFilaOff: true });
    st.avaliacoes = []; st.sessoes = []; st.pagamentos = []; st.agFixas = []; st.bloqueios = [];
    localStorage.setItem('mtapp:ptStudio', JSON.stringify(st)); window.__ptStudio.render();
  });
  async function setup(page = p) {
    await page.waitForFunction(() => window.__iaRevisao && window.mockNuvem);
    await page.evaluate(() => {
      const S = window.MTStore; S.cloud = () => window.mockNuvem({ aid: 'draft-test-account' });
      window.__draftCalls = 0; window.__draftDelay = false;
      window.MT_FUNCAO.chama = (client, fn, body) => {
        if (body.acao === 'ping') return Promise.resolve({ regras: ['briefManda', 'mes'] });
        window.__draftCalls++;
        const answer = { ok: true, texto: JSON.stringify(window.__draftResponse || { fichas: [{ titulo: 'Proposta fictícia', itens: [{ nome: S.read('ptStudio', {}).exercicios[0].nome, series: 2, reps: '8', descanso: 60, seriesDetalhadas: [{ reps: '8', carga: 10, descanso: 60 }, { reps: '10', carga: 0, descanso: 0 }] }] }], resumo: 'Somente dados fictícios.' }) };
        return window.__draftDelay ? new Promise(resolve => { window.__draftResolve = () => resolve(answer); }) : Promise.resolve(answer);
      };
      document.querySelector('#abas [data-a="treinos"]').click();
      const area = document.getElementById('trArea'); area.value = 'auto'; area.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await student('draft-a', page);
  }
  async function student(id, page = p) { await page.evaluate(id => { const sel = document.getElementById('taAluno'); sel.value = id; sel.dispatchEvent(new Event('change', { bubbles: true })); }, id); }
  const snap = () => p.evaluate(() => JSON.stringify(window.MTStore.read('ptStudio', {}).treinosV2));
  const draft = () => p.evaluate(() => window.__iaRevisao.estado().rascunho);
  const saved = () => p.evaluate(() => { const k = Object.keys(localStorage).find(k => k.startsWith('mtlocal:treino-proposta:v1:') && k.includes('draft-a:musculacao')); return k ? { key: k, value: JSON.parse(localStorage.getItem(k)) } : null; });
  async function generate() { await p.locator('#taIA').click(); await p.waitForFunction(() => !document.getElementById('taRevisao').hidden); }
  async function edit(attr, value, page = p) {
    const locator = page.locator('[data-taajuste="' + attr + '"]');
    await locator.evaluate(el => { for (let q = el.parentElement; q; q = q.parentElement) if (q.tagName === 'DETAILS') q.open = true; });
    await locator.fill(value); return locator;
  }
  await setup(); const initial = await snap();
  await p.locator('#taDias').selectOption('4'); await p.locator('#taDuracao').fill('45'); await generate();
  ok(await saved(), 'Proposta salva em chave local por conta, aluno e modalidade');
  eq(await snap(), initial, 'Guardar rascunho não modifica o treino salvo');
  await edit('fichas:0:titulo', 'Ajustada antes de aplicar');
  await edit('fichas:0:itens:0:seriesDetalhadas:0:carga', '');
  await edit('fichas:0:itens:0:seriesDetalhadas:1:carga', '0');
  await edit('fichas:0:itens:0:seriesDetalhadas:1:descanso', '0');
  eq((await draft()).treino.fichas[0].itens[0].seriesDetalhadas.map(s => s.carga), [null, 0], 'Ajuste preserva diferença entre carga vazia e zero');
  const validDraft = (await saved()).value.rascunho;
  const invalid = await edit('fichas:0:itens:0:seriesDetalhadas:0:descanso', '-1');
  await p.locator('#taAplicar').click(); eq(await snap(), initial, 'Descanso inválido bloqueia aplicação');
  eq((await saved()).value.rascunho.treino, validDraft.treino, 'Valor inválido não substitui o último rascunho válido');
  ok(await invalid.evaluate(el => document.activeElement === el), 'Erro abre campos avançados e devolve foco ao ajuste inválido');
  await invalid.fill('90');
  for (const width of [390, 1280]) {
    await p.setViewportSize({ width, height: 900 });
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Revisão e ajuste sem transbordar em ' + width + 'px');
    if (process.env.TORQUE_QA_SHOTS) { fs.mkdirSync(process.env.TORQUE_QA_SHOTS, { recursive: true }); await p.locator('#taAjustes').screenshot({ path: path.join(process.env.TORQUE_QA_SHOTS, 'ia-ajustes-' + width + '.png') }); }
  }
  await p.reload(); await setup();
  ok(await p.locator('#taRecuperacao').isVisible(), 'Recarregar oferece recuperação explícita do aluno selecionado');
  ok(await p.locator('#taRevisao').isHidden(), 'Recarregar não aplica nem abre automaticamente uma proposta');
  await p.locator('#taRecuperar').click();
  eq(await p.locator('#taDias').inputValue(), '4', 'Recuperação restaura a configuração usada na proposta');
  eq(await p.locator('#taDuracao').inputValue(), '45', 'Recuperação restaura duração');
  eq((await draft()).treino.fichas[0].titulo, 'Ajustada antes de aplicar', 'Recuperação preserva ajustes feitos antes da interrupção');
  eq(await p.evaluate(() => window.__draftCalls), 0, 'Retomar proposta não faz nova chamada à IA');
  await student('draft-b'); ok(await p.locator('#taRecuperacao').isHidden(), 'Outro aluno não recebe proposta do aluno anterior');
  await student('draft-a'); await p.locator('#taRecuperar').click();
  await p.locator('#taDias').selectOption('3');
  ok(await p.locator('#taRecuperacao').isVisible(), 'Mudar configuração guarda a proposta anterior para recuperação');
  await p.locator('#taRecuperar').click();
  await p.evaluate(() => { const S = window.MTStore, st = S.read('ptStudio', {}); st.treinosV2['draft-a'].fichas[0].titulo = 'Edição posterior'; S.write('ptStudio', st); });
  const changed = await snap(); await p.locator('#taAplicar').click();
  eq(await snap(), changed, 'Proposta recuperada desatualizada não substitui edição posterior');
  ok(/mudaram desde a gera/.test(await p.locator('#taAplicacaoStatus').innerText()), 'Revisão mantém aviso de proposta desatualizada');
  await p.locator('#taDescartar').click(); eq(await saved(), null, 'Descartar remove a cópia recuperável');
  await generate();
  await p.evaluate(() => { window.__draftWrite = MTStore.write; MTStore.write = () => false; });
  await p.locator('#taAplicar').click(); eq(await snap(), changed, 'Falha de aplicação conserva o treino salvo');
  ok(await saved(), 'Falha de aplicação mantém rascunho recuperável');
  await p.evaluate(() => { MTStore.write = window.__draftWrite; });
  await p.locator('#taAplicar').click();
  ok(await p.locator('#taEnviaApp').isVisible(), 'Aplicar oferece publicação como ação posterior');
  eq(await saved(), null, 'Aplicação bem-sucedida remove rascunho pendente');
  const applied = await snap(); await p.locator('#taAplicar').dispatchEvent('click'); eq(await snap(), applied, 'Repetir aplicação não altera novamente o treino');
  await generate(); const accountDraft = (await saved()).value;
  await p.evaluate(() => { MTStore.cloud = () => window.mockNuvem({ aid: 'other-account' }); });
  await p.locator('#taAplicar').click(); eq(await snap(), applied, 'Troca de conta bloqueia aplicação do rascunho anterior');
  await student('draft-b'); await student('draft-a'); ok(await p.locator('#taRecuperacao').isHidden(), 'Conta diferente não oferece recuperação por ID de aluno coincidente');
  await setup(); await p.locator('#taRecuperar').click();
  // Outra aba no mesmo contexto representa o mesmo aparelho, com revisão independente.
  const q = await context.newPage(); q.on('dialog', d => d.type() === 'confirm' ? d.accept() : d.dismiss()); q.on('pageerror', e => errors.push(e.message));
  await q.goto(BASE + '/personal.html'); await setup(q); await q.locator('#taRecuperar').click();
  await edit('fichas:0:titulo', 'Versão mais recente na segunda aba', q);
  const newer = (await saved()).value;
  await edit('fichas:0:titulo', 'Ajuste antigo na primeira aba');
  eq((await saved()).value, newer, 'Editar rascunho antigo não sobrescreve revisão salva na outra aba');
  ok(/Outra aba/.test(await p.locator('#taRascunhoStatus').innerText()), 'Conflito de rascunho informa que ajustes estão apenas nesta tela');
  await p.locator('#taAplicar').click(); eq(await snap(), applied, 'Conflito de revisão local também impede aplicar versão antiga');
  await p.locator('#taRecuperar').click(); eq((await draft()).treino.fichas[0].titulo, 'Versão mais recente na segunda aba', 'Retomar conflito usa a versão mais recente'); await q.close();
  await p.locator('#taDescartar').click();
  await p.evaluate(() => { window.__draftSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v) { if (k.startsWith('mtlocal:treino-proposta:')) throw new DOMException('Quota', 'QuotaExceededError'); return window.__draftSetItem.call(this, k, v); }; });
  await generate();
  ok(/Não foi possível guardar/.test(await p.locator('#taRascunhoStatus').innerText()), 'Falha no armazenamento local nunca anuncia rascunho salvo');
  ok(await p.locator('#taSalvarRascunho').isVisible(), 'Falha oferece tentar salvar de novo');
  await p.evaluate(() => { Storage.prototype.setItem = window.__draftSetItem; }); await p.locator('#taSalvarRascunho').click(); ok(await saved(), 'Retry salva a proposta mantida em memória');
  const good = await saved();
  await student('draft-b');
  for (const corrupt of ['{invalido', JSON.stringify({ ...good.value, rascunho: { ...good.value.rascunho, treino: { fichas: [null] } } }), JSON.stringify({ ...good.value, rascunho: { ...good.value.rascunho, treino: { fichas: [{ titulo: 'Inválida', itens: [null] }] } } })]) {
    await p.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: good.key, value: corrupt });
    await student('draft-a'); ok(await p.locator('#taRecuperacao').isHidden(), 'Rascunho corrompido não é oferecido para aplicação'); await student('draft-b');
  }
  await p.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), good);
  await student('draft-a'); await p.locator('#taRecuperar').click(); await p.locator('#taDescartar').click();
  for (const [tipo, campo, resposta] of [
    ['wod', 'wods', { wods: [{ nome: 'Circuito fictício', tipo: 'amrap', min: 12, movs: [{ q: '10', n: 'Agachamento livre' }] }] }],
    ['corrida', 'cardio', { cardio: [{ nome: 'Corrida fictícia', tipo: 'continuo', mod: 'corrida', dist: 3 }] }],
  ]) {
    await p.evaluate(resposta => { window.__draftResponse = resposta; }, resposta);
    await p.locator('#taTipo').selectOption(tipo); await generate();
    await edit(campo + ':0:obs', 'Orientação revisada antes de aplicar');
    await student('draft-b'); await student('draft-a');
    ok(await p.locator('#taRecuperacao').isVisible(), tipo + ': proposta válida recuperável na modalidade certa');
    await p.locator('#taRecuperar').click();
    eq((await draft()).treino[campo][0].obs, 'Orientação revisada antes de aplicar', tipo + ': recuperação preserva ajuste');
    eq(await snap(), applied, tipo + ': revisão e recuperação não alteram treino salvo');
    await p.locator('#taDescartar').click();
  }
  await p.locator('#taTipo').selectOption('musculacao');
  await p.evaluate(() => { window.__draftResponse = { fichas: [{ titulo: 'Séries iguais', itens: [{ nome: MTStore.read('ptStudio', {}).exercicios[0].nome, series: 3, reps: '12', descanso: 60 }] }] }; });
  await generate();
  const qtd = await edit('fichas:0:itens:0:series', '31'); await p.locator('#taAplicar').click();
  eq(await snap(), applied, 'Quantidade acima de 30 séries não aplica silenciosamente');
  await qtd.fill('4'); await edit('fichas:0:itens:0:carga', '0');
  eq((await draft()).treino.fichas[0].itens[0].series, 4, 'Quantidade válida é ajustada na proposta uniforme');
  await p.locator('#taDescartar').click();
  await p.evaluate(() => { delete window.__draftResponse; });
  await p.evaluate(() => {
    const S = MTStore, st = S.read('ptStudio', {}), exId = st.exercicios[0].id;
    st.treinosV2['draft-a'] = { fichas: [{ id: 'legado', titulo: 'Legado fictício', itens: [
      { exId, series: '3', reps: '10', carga: '12.5', obs: 'Preservar orientação' },
      { exId, series: '2', reps: '10', descanso: '0', carga: '0' },
      { exId, series: '2', reps: '10', descanso: 45.5, carga: '20', seriesDetalhadas: [{ reps: 8, carga: null }, { reps: '10', carga: '0', descanso: 0 }] },
    ] }] };
    S.write('ptStudio', st);
  });
  const legacySaved = await snap();
  await p.locator('#taAlternativas').evaluate(el => { el.open = true; }); await p.locator('#taEvoluir').click();
  await p.waitForFunction(() => !document.getElementById('taRevisao').hidden);
  const legacyDraft = (await draft()).treino.fichas[0].itens;
  eq(legacyDraft.map(it => it.series), [3, 2, 2], 'Evolução normaliza quantidade legada em texto somente na proposta');
  eq(legacyDraft.slice(0, 2).map(it => [it.reps, it.carga, it.descanso]), [['11', 12.5, 60], ['11', 0, 0]], 'Evolução conserva carga textual, ausência de descanso e zeros pelo contrato do player');
  eq(legacyDraft[2].seriesDetalhadas, [{ reps: '8', carga: null, descanso: 45.5 }, { reps: '10', carga: 0, descanso: 0 }], 'Séries individuais legadas mantêm carga vazia, zero e descanso compatível');
  eq(await snap(), legacySaved, 'Normalizar evolução não altera prescrição legada antes de aplicar');
  await p.reload(); await setup();
  ok(await p.locator('#taRecuperacao').isVisible(), 'Evolução legada continua recuperável após recarregar');
  await p.locator('#taRecuperar').click();
  eq((await draft()).treino.fichas[0].itens, legacyDraft, 'Recuperar evolução legada conserva toda prescrição normalizada');
  await p.locator('#taAplicar').click();
  eq(await p.evaluate(() => MTStore.read('ptStudio', {}).treinosV2['draft-a'].fichas[0].itens), legacyDraft, 'Aplicação da evolução recuperada grava a prescrição revisada');
  await generate(); await p.reload(); await setup();
  ok(await p.locator('#taRecuperacao').isVisible(), 'Geração com IA a partir de aluno com histórico legado também é recuperável');
  await p.locator('#taRecuperar').click(); await p.locator('#taDescartar').click();
  await p.evaluate(() => { window.__draftDelay = true; });
  await p.locator('#taIA').click(); await p.waitForFunction(() => typeof window.__draftResolve === 'function');
  await p.evaluate(async () => { MTStore.cloud = () => window.mockNuvem({ aid: 'other-account' }); window.__draftResolve(); await Promise.resolve(); await Promise.resolve(); });
  ok(await p.locator('#taRevisao').isHidden(), 'Resposta atrasada de outra conta não entra na revisão');
  eq(await saved(), null, 'Resposta atrasada de outra conta não recebe carimbo da conta atual');
  eq(network, [], 'Teste não chamou banco remoto'); eq(errors, [], 'Fluxo sem erros JavaScript');
  console.log(checks + ' verificações de recuperação de propostas passaram.');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
