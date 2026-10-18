/* Integração: pacote real do Personal → builder canônico → journal/SR/player.
 * Somente alunos sintéticos, navegador isolado e rede externa bloqueada.
 * A demo usa armazenamento volátil por projeto; retomada após reload é testada
 * com o mesmo builder em um app local com localStorage normal. */
'use strict';
process.env.TZ = 'America/Sao_Paulo';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.TORQUE_PLAYWRIGHT || './ci/node_modules/playwright');
const { clicarControle, preencherRegistro } = require('./helpers/player-template');
const BASE = new URL(process.env.BASE_URL || 'http://127.0.0.1:8830').origin;
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(BASE).hostname)) throw new Error('Use um servidor local de teste.');
let count = 0;
function ok(value, description) { assert.ok(value, description); count++; console.log('OK ' + description); }
function equal(value, expected, description) { assert.deepEqual(value, expected, description); count++; console.log('OK ' + description); }
const config = { viewport: { width: 390, height: 844 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', serviceWorkers: 'block' };
async function contextFor(browser, route, html) {
  const c = await browser.newContext(config);
  await c.route('**/*', r => {
    const u = new URL(r.request().url());
    if (u.origin !== BASE) return r.abort();
    if (route && u.pathname === route) return r.fulfill({ contentType: 'text/html; charset=utf-8', body: typeof html === 'function' ? html() : html });
    return r.continue();
  });
  await c.addInitScript(() => { localStorage.setItem('pttour', '{"como":"teste"}'); localStorage.setItem('ptonb', '{"feito":true}'); });
  return c;
}
async function ready(p) {
  await p.waitForFunction(() => window.__treinoHistorico && window.__treinoHistorico.ready() && window.__seriesAluno && window.__treinoVariantes);
  await p.evaluate(() => { if (window.__tour && window.__tour.on()) window.__tour.fim(); });
}
async function openFicha(p, fi = 0, ei = null) {
  await p.click('#navApp [data-msec="treino"]');
  const button = p.locator(ei == null ? '.guiabtn[data-g="' + fi + '"]' : '.inibtn[data-g="' + fi + '"][data-e="' + ei + '"]').first();
  const parents = button.locator('xpath=ancestor::details');
  for (let i = await parents.count() - 1; i >= 0; i--) if (!await parents.nth(i).evaluate(e => e.open)) await parents.nth(i).locator(':scope > summary').click();
  await button.click();
}
async function setValues(p, kg, reps, rpe) {
  await preencherRegistro(p, '#gKg', String(kg));
  await preencherRegistro(p, '#gReps', String(reps));
  if (rpe != null) await preencherRegistro(p, '#gRpe', String(rpe));
}
const records = p => p.evaluate(() => Object.values(JSON.parse(localStorage.getItem('ptdc') || '{}')).flat().filter(r => r.g === 2));
const journal = p => p.evaluate(() => window.__treinoHistorico.list().filter(s => s.kind === 'musculacao'));
const date = p => p.evaluate(() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); });

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const errors = [];
  try {
    const personal = await contextFor(browser); const p = await personal.newPage();
    p.on('pageerror', e => errors.push('Personal: ' + e.message));
    await p.goto(BASE + '/personal.html');
    await p.waitForFunction(() => window.__dadosApp && window.MT_TREINO_EVOLUCAO && window.MT_APP_ALUNO);
    const fixture = await p.evaluate(() => {
      const S = window.MTStore, T = window.MT_TREINO_EVOLUCAO, st = S.read('ptStudio', {});
      const a = { id: 'evolucao-integracao', nome: 'Aluno integração v866', status: 'ativo', appTokenP: '', atendimento: 'online' };
      const bank = [{ id: 'ei-supino', nome: 'Supino integração', grupo: 'Peito', semGif: true, semVideo: true }, { id: 'ei-remada', nome: 'Remada integração', grupo: 'Costas', semGif: true, semVideo: true }];
      const stamp = '2026-10-17T15:00:00.000Z';
      let f = { id: 'ei-ficha', titulo: 'A — Integração', itens: [
        { exId: 'ei-supino', series: 2, reps: '10', carga: 20, descanso: 0 },
        { exId: 'ei-remada', series: 1, reps: '8', carga: 30, descanso: 0 }
      ] };
      f = T.approve(T.saveDraft(f, { tipo: 'curto', titulo: 'Curto aprovado', minutos: 10, itens: [
        { exId: 'ei-supino', series: 2, reps: '5', carga: 10, descanso: 90, seriesDetalhadas: [{ reps: '5', carga: 10, descanso: 90 }, { reps: '8', carga: 12, descanso: 0 }] }
      ] }, bank, stamp, 'ei-curto'), 'ei-curto', stamp);
      f = T.approve(T.saveDraft(f, { tipo: 'casa', titulo: 'Casa aprovada', itens: [{ exId: 'ei-remada', series: 1, reps: '12', carga: 0, descanso: 0 }] }, bank, stamp, 'ei-casa'), 'ei-casa', stamp);
      f = T.saveDraft(f, { tipo: 'viagem', titulo: 'Rascunho não aprovado', itens: [f.itens[0]] }, bank, stamp, 'ei-rascunho');
      st.alunos = [a]; st.exercicios = bank; st.treinosV2 = { [a.id]: { fichas: [f] } };
      st.config = Object.assign({}, st.config, { nome: 'Studio integração', onboardingConsultoria: { ativo: false } });
      if (S.write('ptStudio', st) === false) throw new Error('Não foi possível criar fixture local');
      const D = window.__dadosApp(a, stamp);
      Object.assign(D, { atualizador: '', botApp: null, qa: null, avs: [], planoApp: null, wodsApp: [], cardiosApp: [], sessApp: [] });
      const duplicate = JSON.parse(JSON.stringify(D));
      duplicate.fichasApp[0].itens[1] = JSON.parse(JSON.stringify(duplicate.fichasApp[0].itens[0]));
      duplicate.guiaFichasP[0].it[1] = JSON.parse(JSON.stringify(duplicate.guiaFichasP[0].it[0]));
      return { D, html: window.MT_APP_ALUNO.monta(D), duplicate: window.MT_APP_ALUNO.monta(duplicate), legacy: window.MT_APP_ALUNO.monta(Object.assign({}, D, { treinoVariantesApp: [] })) };
    });
    equal(fixture.D.treinoVariantesApp[0].variantes.map(v => v.id), ['ei-curto', 'ei-casa'], 'Personal exporta as duas versões aprovadas, excluindo rascunho');
    equal(fixture.D.fichaIdsApp, ['ei-ficha'], 'identidade original viaja separada, preservando assinatura legada da GUIA');
    await personal.close();

    const app = await contextFor(browser, '/evolucao-integracao.html', fixture.html); const a = await app.newPage();
    a.on('pageerror', e => errors.push('Aluno: ' + e.message));
    await a.clock.setFixedTime(new Date('2026-10-17T15:00:00Z'));
    await a.goto(BASE + '/evolucao-integracao.html'); await ready(a);
    const original = await a.evaluate(() => structuredClone(window.GUIA[0]));
    await openFicha(a);
    equal(await a.locator('.te-aluno-option').count(), 3, 'player oferece original e duas versões, sem rascunho');
    if (process.env.EVOLUCAO_SCREENSHOT) {
      const file = path.resolve(process.env.EVOLUCAO_SCREENSHOT); fs.mkdirSync(path.dirname(file), { recursive: true });
      await a.screenshot({ path: file, fullPage: false });
    }
    await a.getByRole('button', { name: /Curto aprovado/ }).click();
    await a.waitForSelector('#gSerie', { state: 'visible' });
    equal(await a.evaluate(() => [GUIA[0].varianteId, GUIA[0].it.length, GUIA[0].it[0].exercicioId]), ['ei-curto', 1, 'ei-supino'], 'escolha usa a prescrição completa da variante e identidade do exercício');
    equal(await a.evaluate(() => window.__treinoVariantes.original(0)), original, 'abrir variante mantém snapshot da ficha original intacto');
    const firstId = (await journal(a))[0].id;
    await setValues(a, 10, 5, 6); await clicarControle(a, '#gSalvar');
    let rows = await records(a);
    equal(rows.map(r => [r.varianteId, r.varianteVersao, r.fichaId, r.exercicioId, r.kg, r.r, r.rpe, !!r.feito]), [['ei-curto', 1, 'ei-ficha', 'ei-supino', 10, 5, 6, false]], 'gGrava anota carga/reps/RPE e metadados sem inventar conclusão');
    await clicarControle(a, '#gSerie');
    const checkpoint = await a.evaluate(() => window.__acSessao.ler());
    ok(checkpoint.s === 1 && checkpoint.desc > Date.parse('2026-10-17T15:01:25Z'), 'SR conclui somente primeira série e persiste descanso de 90 s');
    equal((await records(a)).map(r => [r.feito, r.varianteId, r.hid]), [[true, 'ei-curto', firstId]], 'SR preserva metadados da variante na conclusão canônica');
    equal(await a.evaluate(() => Array.from(document.querySelectorAll('.setbtn')).map(b => b.dataset.feitas || b.getAttribute('aria-pressed') || '')), Array(original.it.length).fill(''), 'concluir variante não marca os botões da ficha original');
    const sets = await a.evaluate(d => JSON.parse(localStorage.getItem('ptsets_' + d) || '{}'), await date(a));
    ok(!sets[original.it[0].k || original.it[0].e], 'contador da ficha original permanece vazio');
    await a.reload(); await ready(a); await a.click('#navApp [data-msec="treino"]');
    await a.click('#acRetomar button');
    equal(await a.evaluate(() => [GUIA[0].varianteId, window.__gvDe().s, window.__gvDe().descAte]), ['ei-curto', 1, checkpoint.desc], 'reload retoma a variante, série e prazo absoluto do descanso');
    equal((await journal(a)).map(s => s.id), [firstId], 'retomada não abre sessão duplicada nem troca identidade');
    await a.evaluate(() => window.__zeraDescanso());
    await setValues(a, 12, 7, 8); await clicarControle(a, '#gSerie');
    await a.waitForSelector('#gFecharTreino', { state: 'visible' }); await a.click('#gFecharTreino');
    rows = await records(a);
    equal(rows.map(r => [r.serie, r.kg, r.r, r.rpe, r.feito]).sort((x, y) => x[0] - y[0]), [[1, 10, 5, 6, true], [2, 12, 7, 8, true]], 'segunda série salva o executado, sem substituir sete reps pelas oito prescritas');
    ok((await journal(a))[0].finished && !await a.evaluate(() => window.__acSessao.ler()), 'conclusão fecha sessão e limpa retomada');
    await a.click('#gFim');
    await a.click('#navApp [data-msec="treino"]');
    await a.locator('[data-th-new-muscle="0"]').click();
    await a.getByRole('button', { name: /Treino completo/ }).click();
    await a.waitForSelector('#gSerie', { state: 'visible' });
    equal(await a.evaluate(() => window.GUIA[0]), original, 'novo treino completo recupera a prescrição original sem alterações');
    await setValues(a, 20, 10, 7); await clicarControle(a, '#gSerie');
    rows = await records(a);
    const full = rows.filter(r => !r.varianteId);
    equal(full.map(r => [r.kg, r.r, r.exercicioId, r.feito]), [[20, 10, 'ei-supino', true]], 'execução original não herda identificação da variante');
    const sessions = await journal(a);
    equal(sessions.length, 2, 'novo treino cria outra sessão e preserva histórico anterior');
    const past = sessions.find(s => s.id === firstId);
    equal([past.prescribed.varianteId, past.targets['0:0:1'].value.r, past.finished], ['ei-curto', 7, true], 'sessão anterior conserva snapshot e execução da variante após treino completo');
    ok(full[0].hid !== firstId, 'resultados de variante e original nunca compartilham a mesma sessão');
    await app.close();

    const direct = await contextFor(browser, '/evolucao-exercicio.html', fixture.html); const x = await direct.newPage();
    x.on('pageerror', e => errors.push('Exercício original: ' + e.message));
    await x.goto(BASE + '/evolucao-exercicio.html'); await ready(x); await openFicha(x, 0, 1);
    await x.getByRole('button', { name: /Curto aprovado/ }).click();
    await x.waitForSelector('#gSerie', { state: 'visible' });
    equal(await x.evaluate(() => [__gvDe().e, document.getElementById('gEx').textContent]), [0, 'Supino integração'], 'escolher variante pelo exercício original inicia sua lista própria no primeiro exercício');
    const directId = (await journal(x))[0].id;
    await x.click('#gFechar'); await openFicha(x, 0, 1);
    equal(await x.getByRole('dialog', { name: 'Treino em andamento', exact: true }).count(), 1, 'exercício original não usa índice de uma variante em andamento');
    equal((await journal(x)).map(s => s.id), [directId], 'aviso do exercício original não altera nem duplica sessão ativa');
    await x.getByRole('button', { name: 'Continuar Curto aprovado', exact: true }).click();
    equal(await x.evaluate(() => [GUIA[0].varianteId, __gvDe().e, document.getElementById('gEx').textContent]), ['ei-curto', 0, 'Supino integração'], 'retomar exige ação explícita e conserva o exercício da sessão');
    await clicarControle(x, '#gSerie'); await x.evaluate(() => window.__zeraDescanso()); await clicarControle(x, '#gSerie');
    await x.click('#gFecharTreino'); await x.click('#gFim'); await openFicha(x, 0, 1);
    equal(await x.evaluate(() => [GUIA[0].varianteId || '', __gvDe().e, document.getElementById('gEx').textContent]), ['', 1, 'Remada integração'], 'após concluir variante, Iniciar exercício abre exatamente o exercício original escolhido');
    await setValues(x, 30, 8, 7); await clicarControle(x, '#gSerie');
    const directSessions = await journal(x);
    equal(directSessions.length, 2, 'início original cria outra sessão após variante concluída');
    equal(directSessions.find(s => s.id === directId).prescribed.varianteId, 'ei-curto', 'novo exercício original preserva snapshot da variante concluída');
    equal((await records(x)).filter(r => !r.varianteId).map(r => [r.i, r.exercicioId, r.kg, r.r]), [['0:1:0', 'ei-remada', 30, 8]], 'registro pelo botão do exercício mantém posição e identidade originais');
    await direct.close();

    const duplicated = await contextFor(browser, '/evolucao-repetidos.html', fixture.duplicate); const dup = await duplicated.newPage();
    dup.on('pageerror', e => errors.push('Exercício repetido: ' + e.message));
    await dup.goto(BASE + '/evolucao-repetidos.html'); await ready(dup); await openFicha(dup);
    await dup.getByRole('button', { name: /Curto aprovado/ }).click(); await clicarControle(dup, '#gSerie');
    equal(await dup.locator('.setbtn').allTextContents(), ['0/2 séries ✓', '0/2 séries ✓'], 'nomes repetidos na ficha original não recebem contador da variante por fallback de posição');
    equal((await journal(dup))[0].targets['0:0:0'].value.varianteId, 'ei-curto', 'série de nome repetido permanece registrada apenas na variante');
    await duplicated.close();

    const legacy = await contextFor(browser, '/evolucao-legado.html', fixture.legacy); const l = await legacy.newPage();
    l.on('pageerror', e => errors.push('Legado: ' + e.message));
    await l.goto(BASE + '/evolucao-legado.html'); await ready(l); await openFicha(l);
    equal(await l.locator('.te-aluno-dialog').count(), 0, 'ficha sem variantes abre diretamente pelo fluxo existente');
    await setValues(l, 20, 9, 7); await clicarControle(l, '#gSerie');
    const legacyRows = await records(l);
    equal(legacyRows.map(r => [r.kg, r.r, r.feito, !!r.varianteId]), [[20, 9, true, false]], 'aluno sem variantes registra série pelo mesmo histórico canônico');
    const legacyId = (await journal(l))[0].id;
    await l.reload(); await ready(l); await l.click('#navApp [data-msec="treino"]'); await l.click('#acRetomar button');
    equal((await journal(l)).map(s => s.id), [legacyId], 'reload sem variantes mantém sessão original existente');
    ok(!await l.evaluate(() => GUIA[0].varianteId), 'retomada legada permanece na ficha original');
    await legacy.close();

    const demo = await contextFor(browser); const d = await demo.newPage();
    d.on('pageerror', e => errors.push('Demo: ' + e.message));
    await d.goto(BASE + '/demo-aluno-sem-cadastro.html'); await ready(d); await openFicha(d);
    equal(await d.locator('.te-aluno-option').count(), 3, 'demo regenerada apresenta as alternativas curta e em casa');
    await d.getByRole('button', { name: /Treino curto · 20 minutos/ }).click();
    await d.waitForSelector('#gSerie', { state: 'visible' });
    await setValues(d, 10, 5, 6); await clicarControle(d, '#gSerie');
    const demoSession = (await journal(d)).find(s => s.prescribed && s.prescribed.varianteId === 'demo-variante-curto');
    ok(demoSession && demoSession.targets['0:0:0'].value.feito && demoSession.targets['0:0:0'].value.varianteId === 'demo-variante-curto', 'demo conclui série real na variante e mantém identificação no journal');
    await demo.close();
    equal(errors, [], 'nenhum erro de JavaScript no Personal, app, retomada, legado ou demo');
    console.log('\n' + count + ' verificações de integração passaram.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e.stack || e); process.exitCode = 1; });
