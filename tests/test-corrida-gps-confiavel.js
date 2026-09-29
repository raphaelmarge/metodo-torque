/* GPS no app realmente montado: relógio e geolocalização sintéticos, sem rede
 * externa nem posições de alunos. Nenhuma simulação certifica precisão física. */
'use strict';
const assert = require('node:assert/strict');
let chromium; try { chromium = require('playwright').chromium; } catch (_) { chromium = require('/opt/node22/lib/node_modules/playwright').chromium; }
const { comMockNuvem } = require('./_nuvem.js');
global.self = global; require('../app/aluno-skin.js'); require('../app/aluno-builder.js');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765';
const html = MT_APP_ALUNO.monta({ a: { id: 'gps-ficticio', nome: 'Corredor GPS Sintético', appTokenP: 'token-gps-ficticio' }, studio: 'Teste isolado', cfg: {} });
let browser, n = 0;
function ok(value, text) { assert.ok(value, text); n++; console.log('OK ' + text); }
function eq(value, want, text) { assert.deepEqual(value, want, text); n++; console.log('OK ' + text); }
(async () => {
  browser = comMockNuvem(await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] }));
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', timezoneId: 'America/Sao_Paulo' });
  await ctx.route('**/*', r => new URL(r.request().url()).origin === new URL(BASE).origin ? r.continue() : r.abort());
  await ctx.route(BASE + '/gps-confiavel-sintetico.html', r => r.fulfill({ contentType: 'text/html', body: html }));
  await ctx.addInitScript(() => {
    if (location.origin === 'null') return;
    localStorage.setItem('ptcrCfg', JSON.stringify({ cd: 0, fb: 'off', ap: 0, bl: 0 }));
    window.__gps = { next: 0, calls: {}, cleared: [] };
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      watchPosition: (success, error, options) => { const id = ++__gps.next; __gps.calls[id] = { success, error, options }; return id; },
      // Guardamos callbacks encerrados para testar a fila tardia do navegador.
      clearWatch: id => __gps.cleared.push(id)
    } });
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: () => Promise.resolve({ state: 'granted' }) } });
  });
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
  let now = Date.parse('2026-09-30T10:00:00-03:00');
  await p.clock.setFixedTime(new Date(now));
  await p.goto(BASE + '/gps-confiavel-sintetico.html'); await p.waitForFunction(() => window.__crSessao && window.__cr);
  async function tick(ms = 1000) { now += ms; await p.clock.setFixedTime(new Date(now)); }
  async function fix(lat = -20, options = {}) {
    const pos = { coords: { latitude: lat, longitude: -44, accuracy: 10, speed: 3, heading: 0, ...options.coords }, timestamp: now + (options.age || 0) };
    if (options.noTimestamp) delete pos.timestamp;
    await p.evaluate(({ pos, watch }) => { const call = __gps.calls[watch || __cr.watch]; if (!call) throw Error('watch não iniciado'); call.success(pos); }, { pos, watch: options.watch });
  }
  async function state() { return p.evaluate(() => ({ km: __cr.km, run: __cr.run, watch: __cr.watch, fix: __cr.gpsFix, stamp: __cr.gpsStamp, last: __cr.lastPos, route: __cr.rota, pace: __cr.jan, signal: document.getElementById('crSinal').dataset.estado })); }
  async function reset() {
    await p.evaluate(() => { document.getElementById('crZera').click(); __cr.mod = 'corrida'; document.getElementById('crGo').click(); });
  }
  async function error(code, watch) { await p.evaluate(({ code, watch }) => __gps.calls[watch || __cr.watch].error({ code, message: 'erro sintético' }), { code, watch }); }

  // A localização obtida enquanto se escolhe o treino não pertence à corrida.
  await p.evaluate(() => __crGpsLiga(false)); await fix(-20); await tick(10000); await fix(-20.0003);
  eq((await state()).km, 0, 'GPS antes da largada não registra distância');
  await p.evaluate(() => document.getElementById('crGo').click()); await tick(10000); await fix(-20.0006);
  eq((await state()).km, 0, 'primeiro ponto após iniciar não inclui deslocamento anterior à largada');
  await tick(10000); await fix(-20.0009);
  let s = await state(); const baseline = s;
  ok(s.km > .033 && s.km < .034 && s.route.length === 2, 'dois pontos válidos medem aproximadamente33m e desenham o trecho');
  eq(s.signal, 'bom', 'sinal bom exige leitura recente e válida');
  eq(await p.evaluate(() => __gps.calls[__cr.watch].options), { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }, 'watch solicita alta precisão com limites de idade e espera');
  await fix(-20.0018);
  eq((await state()).km, baseline.km, 'timestamp duplicado não soma uma segunda distância');
  eq((await state()).route, baseline.route, 'timestamp duplicado não move o percurso');
  await tick(1000); await fix(-20.0027, { age: -2000 });
  eq((await state()).last, baseline.last, 'posição fora de ordem não substitui a âncora válida');
  await tick(10000); await fix(-20.0012);
  ok((await state()).km > baseline.km, 'posição nova continua normalmente após duplicatas e eventos fora de ordem');

  s = await state(); await tick(1000); await fix(-20.0021);
  eq((await state()).km, s.km, 'salto de100m em1s não fabrica distância');
  eq((await state()).route, s.route, 'salto inválido não aparece no percurso');
  eq((await state()).signal, 'fraco', 'salto de GPS sinaliza leitura não confiável');
  await tick(1000); await fix(-20.0013);
  eq((await state()).km, s.km, 'retorno após salto reinicia a âncora sem ligar o trecho perdido');
  ok((await state()).route.at(-1).quebra, 'retorno após salto preserva uma quebra no trajeto');
  await tick(10000); await fix(-20.0016);
  ok((await state()).km > s.km, 'medição retorna no próximo deslocamento válido');

  const invalids = [
    { coords: { latitude: 91 } }, { coords: { longitude: -181 } }, { coords: { latitude: '20' } },
    { coords: { accuracy: -1 } }, { coords: { accuracy: 40.1 } }, { coords: { accuracy: null } },
    { age: 60000 }, { noTimestamp: true }
  ];
  for (let i = 0; i < invalids.length; i++) {
    await tick(1000); const before = await state(); await fix(-20.0017, invalids[i]); const after = await state();
    eq([after.km, after.route.length, after.signal], [before.km, before.route.length, 'fraco'], 'coordenada/precisão/timestamp inválido ' + (i + 1) + ' não altera distância nem trajeto');
  }
  await tick(1000); await fix(-20.0018, { coords: { accuracy: 40 } });
  eq((await state()).signal, 'bom', 'limite de40m permanece consistente entre status e filtro');
  const priorGap = await state();
  await tick(32000); await fix(-20.0024, { age: -16000 });
  eq([(await state()).km, (await state()).signal], [priorGap.km, 'fraco'], 'leitura entregue agora mas medida há16s é rejeitada');
  await fix(-20.0024);
  eq((await state()).km, priorGap.km, 'GPS atual depois da perda de sinal começa um novo trecho sem estimar distância');
  eq((await state()).pace.length, 1, 'pace recente não atravessa a lacuna de GPS');

  // Timeout não encerra o watch; permissão negada encerra e pede ação explícita.
  const unavailable = await p.evaluate(() => {
    const watch = __cr.watch;
    __gps.calls[watch].error({ code: 2, message: 'posição indisponível sintética' });
    return { watch, current: __cr.watch, text: document.getElementById('crInfo').textContent };
  });
  eq(unavailable.watch, unavailable.current, 'posição indisponível mantém a tentativa de recuperar o GPS');
  ok(/Localização indisponível/.test(unavailable.text) && /local aberto/.test(unavailable.text), 'posição indisponível orienta conferir sinal e GPS sem diagnosticar aparelho desligado');
  s = await state(); await error(3);
  eq((await state()).watch, s.watch, 'timeout mantém o watch para recuperar o sinal');
  await tick(1000); await fix(-20.0030);
  eq((await state()).km, s.km, 'recuperação de timeout não soma distância desconhecida');
  await error(1);
  eq((await state()).watch, null, 'permissão revogada encerra a captura');
  await tick(1000); await fix(-20.0033, { watch: s.watch });
  eq((await state()).km, s.km, 'callback enfileirado após revogação não modifica a corrida');
  await p.evaluate(() => __crGpsLiga(false));
  const newWatch = (await state()).watch;
  ok(newWatch !== s.watch, 'toque explícito permite uma nova tentativa de GPS');
  await error(1, s.watch);
  eq((await state()).watch, newWatch, 'erro tardio do watch anterior não encerra o novo');
  await tick(1000); await fix(-20.0033);
  await tick(10000); await fix(-20.0036);
  ok((await state()).km > s.km, 'nova captura volta a medir normalmente');

  // Background web permanece protegido; não afirmamos suporte com tela apagada.
  s = await state();
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  eq([(await state()).run, (await state()).watch], [false, null], 'ocultar o app pausa e encerra o GPS da sessão web');
  await tick(60000); await fix(-20.0045, { watch: s.watch });
  eq((await state()).km, s.km, 'callback após ocultar a página não inventa um percurso em segundo plano');
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); document.getElementById('crGo').click(); });
  await fix(-20.0045); await tick(10000); await fix(-20.0048);
  ok((await state()).km > s.km, 'retomada explícita mede somente novos pontos');
  s = await state(); await p.evaluate(() => localStorage.setItem('tq_app_token', 'outro-token-ficticio'));
  await tick(10000); await fix(-20.0051);
  eq((await state()).km, s.km, 'troca de identidade invalida callbacks do aluno anterior');
  await p.evaluate(() => localStorage.removeItem('tq_app_token'));

  // Limite considera modalidade e intervalo, não um teto de150m por callback.
  await reset(); await p.evaluate(() => { __cr.mod = 'bike'; }); await fix(-20); await tick(10000); await fix(-20.0018);
  s = await state(); ok(s.km > .19 && s.km < .21, 'bike mantém200m observados em10s sem descartar uma amostra válida');
  await tick(1000); await fix(-20.0027);
  eq((await state()).km, s.km, 'bike também rejeita salto de100m em1s');
  await reset(); await fix(-20); await tick(1000); await fix(-20.00005);
  await p.evaluate(() => { __cr.acum = 4; __cr.run = false; __cr.autoP = true; });
  const autoBefore = await state(); await tick(2000); await fix(-20.00010);
  ok((await state()).run && (await state()).km > autoBefore.km, 'deslocamento válido retoma a pausa automática e conta seu trecho');

  eq(errors, [], 'GPS inválido, erros, callbacks tardios e recuperação sem erros deJavaScript');
  await ctx.close(); console.log(n + ' verificações de GPS confiável passaram.');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
