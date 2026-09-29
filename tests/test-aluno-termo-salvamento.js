/* Aceite do termo: dados sintéticos, identidade e falha real de armazenamento. */
process.env.TZ = 'America/Sao_Paulo';
const assert = require('assert/strict');
const { chromium } = require(process.env.TORQUE_PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright');
const { dados } = require('./test-aluno-player-experiencia');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8805';

async function abrir(browser, token = 'token-player') {
  global.self = global;
  global.MT_CLOUD = { url: 'https://termo.invalid', anonKey: 'teste' };
  require('../app/aluno-skin.js');
  require('../app/aluno-builder.js');
  const D = dados();
  D.termoApp = { t: 'Termo fictício para validar o aceite local.', v: 'termo-teste-v1' };
  const html = global.MT_APP_ALUNO.monta(D);
  for (const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(script[1]);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', serviceWorkers: 'block' });
  await ctx.route('**/*', route => route.request().url().startsWith(BASE) ? route.continue() : route.abort());
  await ctx.route(BASE + '/termo-salvamento-test.html', route => route.fulfill({ contentType: 'text/html', body: html }));
  await ctx.addInitScript(token => {
    if (!localStorage.getItem('tq_app_token')) localStorage.setItem('tq_app_token', token);
    localStorage.setItem('pttour', JSON.stringify({ como: 'teste' }));
    localStorage.setItem('ptonb', JSON.stringify({ feito: true }));
  }, token);
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', error => errors.push(error.message));
  await p.goto(BASE + '/termo-salvamento-test.html');
  await p.locator('#termoOv').waitFor({ state: 'visible' });
  return { p, ctx, errors };
}

async function main() {
  let total = 0;
  const ok = (value, message) => { assert.ok(value, message); total++; console.log('  ✅ ' + message); };
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const aceitar = p => p.getByRole('button', { name: 'Li e aceito', exact: true }).click();
  const aceite = p => p.evaluate(() => JSON.parse(localStorage.getItem('ptaceite') || 'null'));
  try {
    const normal = await abrir(browser);
    ok(await normal.p.locator('#termoOv').isVisible() && !await normal.p.locator('#termoAviso').isVisible(), 'termo abre sem apresentar erro antes da tentativa');
    await aceitar(normal.p);
    const salvo = await aceite(normal.p);
    ok(salvo && salvo.v === 'termo-teste-v1' && /^\d{4}-\d{2}-\d{2}$/.test(salvo.em), 'aceite válido salva versão e dia');
    ok(await normal.p.locator('#termoOv').count() === 0, 'aceite confirmado fecha o termo');
    await normal.p.reload();
    ok(await normal.p.locator('#termoOv').count() === 0 && JSON.stringify(await aceite(normal.p)) === JSON.stringify(salvo), 'reabertura reconhece a mesma versão sem pedir novo aceite');
    ok(normal.errors.length === 0, 'aceite normal não gera erro JavaScript');
    await normal.ctx.close();

    const quota = await abrir(browser);
    await quota.p.evaluate(() => {
      window.__setItemOriginal = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'ptaceite') throw new DOMException('Quota sintética', 'QuotaExceededError');
        return window.__setItemOriginal.call(this, key, value);
      };
    });
    await aceitar(quota.p);
    ok(await quota.p.locator('#termoOv').isVisible() && await aceite(quota.p) === null, 'falta de espaço mantém o termo aberto e não inventa aceite');
    ok(await quota.p.locator('#termoAviso[role="alert"]').isVisible() && /Libere espaço e tente novamente/.test(await quota.p.locator('#termoAviso').innerText()), 'falha apresenta aviso acessível dentro do termo');
    await aceitar(quota.p);
    ok(await quota.p.locator('#termoOv').isVisible() && await aceite(quota.p) === null, 'repetir com armazenamento ainda indisponível conserva a tela');
    await quota.p.evaluate(() => { Storage.prototype.setItem = window.__setItemOriginal; });
    await aceitar(quota.p);
    ok(await quota.p.locator('#termoOv').count() === 0 && (await aceite(quota.p)).v === 'termo-teste-v1', 'depois de liberar espaço o mesmo botão salva e fecha');
    ok(quota.errors.length === 0, 'falha e recuperação não geram erro JavaScript');
    await quota.ctx.close();

    const trocado = await abrir(browser);
    const aceiteOutro = { v: 'termo-outro-aluno', em: '2026-01-01' };
    await trocado.p.evaluate(aceiteOutro => {
      localStorage.setItem('tq_app_token', 'token-outro-aluno');
      localStorage.setItem('ptaceite', JSON.stringify(aceiteOutro));
    }, aceiteOutro);
    await aceitar(trocado.p);
    ok(await trocado.p.locator('#termoOv').isVisible(), 'troca de aluno durante leitura não fecha o termo como aceito');
    ok(JSON.stringify(await aceite(trocado.p)) === JSON.stringify(aceiteOutro), 'tentativa da página antiga preserva o aceite do outro aluno');
    ok(/acesso do aluno mudou.*Reabra seu link/.test(await trocado.p.locator('#termoAviso').innerText()), 'troca de identidade orienta reabrir o link correto');
    ok(trocado.errors.length === 0, 'bloqueio de identidade não gera erro JavaScript');
    await trocado.ctx.close();

    const antigo = await abrir(browser, 'tok-sem-construtor');
    await aceitar(antigo.p);
    ok(await antigo.p.locator('#termoOv').isVisible() && await aceite(antigo.p) === null, 'HTML aberto sobre token de outro cenário é bloqueado desde o início');
    await antigo.p.evaluate(() => localStorage.setItem('tq_app_token', 'token-player'));
    await antigo.p.reload();
    await aceitar(antigo.p);
    ok(await antigo.p.locator('#termoOv').count() === 0 && (await aceite(antigo.p)).v === 'termo-teste-v1', 'token correspondente, como atribuído pelo loader real, permite aceitar');
    ok(antigo.errors.length === 0, 'simulação do loader correto não gera erro JavaScript');
    await antigo.ctx.close();

    const adiado = await abrir(browser);
    await adiado.p.getByRole('button', { name: 'Deixar pra depois', exact: true }).click();
    ok(await adiado.p.locator('#termoOv').count() === 0 && await aceite(adiado.p) === null, 'adiar continua fechando a tela sem registrar aceite');
    await adiado.p.reload();
    ok(await adiado.p.locator('#termoOv').isVisible(), 'termo adiado reaparece na próxima abertura');
    await adiado.ctx.close();
    console.log('\n' + total + ' verificações do aceite passaram.');
  } finally { await browser.close(); }
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
