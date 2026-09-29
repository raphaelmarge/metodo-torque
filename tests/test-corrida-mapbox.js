/* Mapbox no app canônico: SDK, rede e coordenadas são sintéticos.
 * Não faz chamadas à Mapbox, cobra carregamentos ou lê dados de alunos. */
'use strict';
const assert = require('node:assert/strict');
let chromium; try { chromium = require('playwright').chromium; } catch (_) { chromium = require('/opt/node22/lib/node_modules/playwright').chromium; }
const { comMockNuvem } = require('./_nuvem.js');
global.self = global;
require('../app/aluno-skin.js');
require('../app/aluno-builder.js');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765';
const TOKEN = 'pk.token-publico-sintetico-mapbox';
const D = { a: { id: 'mapa-sintetico', nome: 'Corredor Sintético', appTokenP: 'aluno-ficticio-mapa' }, studio: 'Teste isolado', COR: '#7c3aed', COR2: '#5925ba', CORC: '#b395ff', CORE: '#33155c', CORCL1: '#d6c4ff', CORCL2: '#e8ddff', cfg: {}, cardiosApp: [{ id: 'corrida-ficticia', nome: 'Corrida sintética', mod: 'corrida', tipo: 'continuo', dist: 5 }] };
const html = MT_APP_ALUNO.monta(D);
let browser, n = 0;
function ok(v, text) { assert.ok(v, text); n++; console.log('OK ' + text); }
function eq(v, want, text) { assert.deepEqual(v, want, text); n++; console.log('OK ' + text); }

// O SDK só responde quando o teste emite seus eventos; assim ele pode atrasar,
// falhar e perder o estilo sem mascarar corridas assíncronas da integração.
function sdkMock(options) {
  const M = window.__mbMock = { maps: [], calls: [], supported: options.supported !== false };
  const copy = v => v == null ? v : JSON.parse(JSON.stringify(v));
  function MapFake(opts) {
    if (options.constructorError) throw new Error('WebGL sintético indisponível');
    this.options = { ...opts, container: typeof opts.container === 'string' ? opts.container : opts.container.id };
    this.container = typeof opts.container === 'string' ? document.getElementById(opts.container) : opts.container;
    this.handlers = {}; this.sources = {}; this.layers = {}; this.ready = false; this.removed = false;
    this.id = M.maps.length; this.canvas = document.createElement('canvas');
    this.container.appendChild(this.canvas); M.maps.push(this);
    M.calls.push(['construct', this.id, this.options]);
    for (const control of ['dragPan', 'scrollZoom', 'boxZoom', 'dragRotate', 'keyboard', 'doubleClickZoom', 'touchZoomRotate']) this[control] = { disable() {}, enable() {}, disableRotation() {} };
  }
  MapFake.prototype.on = function (name, cb) { (this.handlers[name] ||= []).push(cb); return this; };
  MapFake.prototype.off = function (name, cb) { this.handlers[name] = (this.handlers[name] || []).filter(x => x !== cb); return this; };
  MapFake.prototype.once = function (name, cb) { const fn = e => { this.off(name, fn); cb(e); }; return this.on(name, fn); };
  MapFake.prototype.emit = function (name, data) { if (name === 'style.load' || name === 'load') this.ready = true; for (const cb of [...(this.handlers[name] || [])]) cb(data || {}); };
  MapFake.prototype.isStyleLoaded = MapFake.prototype.loaded = function () { return this.ready; };
  MapFake.prototype.addSource = function (id, source) {
    const s = this.sources[id] = copy(source); s.setData = data => { s.data = copy(data); M.calls.push(['data', this.id, id]); };
    M.calls.push(['source', this.id, id]); return this;
  };
  MapFake.prototype.getSource = function (id) { return this.sources[id]; };
  MapFake.prototype.removeSource = function (id) { delete this.sources[id]; return this; };
  MapFake.prototype.addLayer = function (layer) { this.layers[layer.id] = copy(layer); M.calls.push(['layer', this.id, layer.id]); return this; };
  MapFake.prototype.getLayer = function (id) { return this.layers[id]; };
  MapFake.prototype.removeLayer = function (id) { delete this.layers[id]; return this; };
  MapFake.prototype.setStyle = function (style) { this.sources = {}; this.layers = {}; this.ready = false; this.options.style = style; M.calls.push(['style', this.id, style]); return this; };
  for (const method of ['resize', 'easeTo', 'jumpTo', 'fitBounds', 'setPaintProperty', 'setLayoutProperty', 'setTerrain', 'setProjection', 'addControl', 'stop']) {
    MapFake.prototype[method] = function (...args) { M.calls.push([method, this.id, ...copy(args)]); return this; };
  }
  MapFake.prototype.getCanvas = function () { return this.canvas; };
  MapFake.prototype.getContainer = function () { return this.container; };
  MapFake.prototype.getZoom = function () { return 16; };
  MapFake.prototype.getBearing = function () { return 0; };
  MapFake.prototype.getStyle = function () { return { layers: Object.values(this.layers) }; };
  MapFake.prototype.remove = function () { this.removed = true; this.handlers = {}; this.canvas.remove(); M.calls.push(['remove', this.id]); };
  function Marker() { this.setLngLat = () => this; this.addTo = () => this; this.remove = () => this; this.setRotation = () => this; }
  function LngLatBounds(a, b) { this.points = a ? [a, b] : []; this.extend = p => { this.points.push(p); return this; }; this.toArray = () => this.points; }
  window.mapboxgl = { version: '3.30.0', Map: MapFake, Marker, LngLatBounds, supported: () => M.supported, AttributionControl: function (o) { this.options = o; }, NavigationControl: function (o) { this.options = o; } };
}

const route = [
  { lat: -20, lng: -44 }, { lat: -20.001, lng: -44.001 },
  { lat: -20.004, lng: -44.004, quebra: true }, { lat: -20.005, lng: -44.005 }
];
async function fixture(options = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const requests = [], errors = [];
  await ctx.route('**/*', r => {
    const url = new URL(r.request().url());
    if (url.origin === new URL(BASE).origin) return r.continue();
    requests.push(url.href);
    if (url.pathname.endsWith('/mapbox-gl.css') && !options.cssError) return r.fulfill({ contentType: 'text/css', body: '.mapboxgl-canvas{position:absolute;inset:0}' });
    return r.abort();
  });
  await ctx.route(BASE + '/mapbox-sintetico.html', r => r.fulfill({ contentType: 'text/html', body: html }));
  await ctx.addInitScript(({ options, token }) => {
    window.MT_MAPA = { mapboxToken: options.token === undefined ? token : options.token };
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: options.offline !== true });
    localStorage.setItem('ptcrCfg', JSON.stringify({ cd: 0, fb: 'off', ap: 0, bl: 0 }));
  }, { options, token: TOKEN });
  if (!options.noSdk) await ctx.addInitScript(sdkMock, options);
  const p = await ctx.newPage(); p.setDefaultTimeout(7000); p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
  await p.goto(BASE + '/mapbox-sintetico.html');
  await p.waitForFunction(() => window.__crMapbox && window.__crMapa);
  await p.evaluate(() => {
    const box = document.createElement('div'); box.id = 'mapbox-fixture'; box.style.cssText = 'position:fixed;inset:0;background:#eee;z-index:99999';
    const canvas = document.createElement('canvas'); canvas.id = 'mapbox-canvas'; canvas.width = 390; canvas.height = 300; canvas.style.cssText = 'display:block;width:390px;height:300px';
    box.appendChild(canvas); document.body.appendChild(box);
  });
  const draw = async (extra = {}) => p.evaluate(({ route, extra }) => __crMapbox.pinta({ rota: route, posicao: route.at(-1), ativo: true, estilo: 'escuro', rumo: 45, ...extra, canvas: document.getElementById(extra.canvas || 'mapbox-canvas') }), { route, extra });
  const ready = async () => {
    await p.waitForFunction(() => __mbMock.maps.length > 0);
    await p.evaluate(() => { const map = __mbMock.maps.at(-1); map.emit('style.load'); map.emit('load'); });
    return draw();
  };
  const state = () => p.evaluate(() => __crMapbox.estado());
  return { ctx, p, requests, errors, draw, ready, state };
}

(async () => {
  browser = comMockNuvem(await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] }));
  for (const [label, options] of [
    ['sem token', { token: '' }], ['token secreto recusado', { token: 'sk.segredo-sintetico' }],
    ['offline', { offline: true }], ['WebGL sem suporte', { supported: false }], ['falha ao construir WebGL', { constructorError: true }], ['CSS indisponível', { cssError: true }]
  ]) {
    const f = await fixture(options);
    eq(await f.draw(), false, label + ': mapa legado permanece responsável pelo trajeto');
    await f.p.waitForTimeout(40);
    eq(await f.p.evaluate(() => __mbMock.maps.length), 0, label + ': não abre uma instância paga');
    ok(!JSON.stringify(await f.state()).includes(options.token || TOKEN), label + ': diagnóstico não expõe credencial');
    eq(f.errors, [], label + ': não interrompe o app com erro de JavaScript');
    await f.ctx.close();
  }

  const f = await fixture();
  eq(await f.p.evaluate(() => __mbMock.maps.length), 0, 'abrir o app com corrida oculta não abre mapa nem consome carregamento');
  eq(await f.draw({ rota: [], posicao: null }), false, 'sem posição observada não apresenta uma localização inventada');
  eq(await f.p.evaluate(() => __mbMock.maps.length), 0, 'aguardar o primeiro GPS não abre mapa em coordenadas fictícias');
  await f.p.evaluate(() => { document.getElementById('mapbox-canvas').style.display = 'none'; });
  eq(await f.draw(), false, 'canvas oculto não inicia o mapa');
  eq(await f.p.evaluate(() => __mbMock.maps.length), 0, 'canvas oculto não consome carregamento');
  await f.p.evaluate(() => { document.getElementById('mapbox-canvas').style.display = 'block'; });
  eq(await f.draw(), false, 'enquanto o SDK prepara o mapa o trajeto legado continua disponível');
  await f.p.waitForFunction(() => __mbMock.maps.length === 1);
  await f.draw();
  ok(await f.p.locator('#crMapboxHost').isHidden(), 'repintura durante carregamento não sobrepõe um mapa vazio ao trajeto legado');
  eq(await f.ready(), true, 'mapa pronto assume a área somente depois do carregamento');
  eq(await f.p.evaluate(() => __mbMock.maps.length), 1, 'repinturas concorrentes criam uma única instância');
  const initial = await f.p.evaluate(() => {
    const map = __mbMock.maps[0];
    return { options: map.options, sources: Object.values(map.sources).map(s => s.data).filter(Boolean), layers: Object.values(map.layers), calls: __mbMock.calls };
  });
  ok(initial.options.attributionControl !== false, 'atribuição obrigatória do provedor permanece habilitada');
  ok(initial.options.logoPosition !== false, 'integração não desabilita o logotipo do provedor');
  ok(initial.options.accessToken === TOKEN || await f.p.evaluate(() => mapboxgl.accessToken === window.MT_MAPA.mapboxToken), 'token público chega apenas à configuração do SDK');
  ok(!JSON.stringify(await f.state()).includes(TOKEN), 'estado de diagnóstico omite o token público');
  function geometries(sources) {
    return sources.flatMap(data => data.type === 'FeatureCollection' ? data.features.map(ft => ft.geometry) : [data.type === 'Feature' ? data.geometry : data]);
  }
  const lines = geometries(initial.sources).filter(g => g && g.type === 'MultiLineString');
  eq(lines.map(g => g.coordinates), [[[[ -44, -20 ], [ -44.001, -20.001 ]], [[ -44.004, -20.004 ], [ -44.005, -20.005 ]]]], 'trajeto preserva a lacuna de sinal como dois segmentos independentes');
  ok(initial.layers.some(layer => layer.type === 'line'), 'trajeto possui camada visível sobre o mapa');
  ok(!initial.calls.some(c => c[0] === 'fitBounds'), 'corrida ativa não reenquadra todo o percurso a cada GPS');
  const camera = initial.calls.filter(c => ['easeTo', 'jumpTo'].includes(c[0])).at(-1);
  eq(camera && camera[2].center, [-44.005, -20.005], 'câmera acompanha a última posição observada');

  await f.p.evaluate(() => { const canvas = document.createElement('canvas'); canvas.id = 'mapbox-full'; canvas.width = 390; canvas.height = 844; canvas.style.cssText = 'display:block;width:390px;height:844px'; document.getElementById('mapbox-fixture').appendChild(canvas); });
  eq(await f.draw({ canvas: 'mapbox-full' }), true, 'o mesmo mapa pode ocupar a execução em tela cheia');
  eq(await f.p.evaluate(() => __mbMock.maps.length), 1, 'trocar do card para tela cheia reaproveita a instância e a franquia');
  ok(await f.p.evaluate(() => __mbMock.calls.some(c => c[0] === 'resize')), 'mudança de tamanho recalcula a área do mapa');
  await f.p.evaluate(() => __crMapbox.suspende());
  eq(await f.draw(), true, 'reabrir o mapa depois de ocultá-lo aproveita o mapa já preparado');
  eq(await f.p.evaluate(() => __mbMock.maps.length), 1, 'ocultar e reabrir não cria carregamento adicional');

  await f.draw({ estilo: 'claro' });
  ok(await f.p.evaluate(() => __mbMock.calls.some(c => c[0] === 'style')), 'troca de estilo chega à instância existente');
  await f.draw({ estilo: 'claro' });
  ok(await f.p.locator('#crMapboxHost').isHidden(), 'durante carregamento do novo estilo o trajeto legado continua descoberto');
  await f.p.evaluate(() => __mbMock.maps[0].emit('style.load'));
  await f.draw({ estilo: 'claro' });
  const afterStyle = await f.p.evaluate(() => Object.values(__mbMock.maps[0].sources).map(s => s.data).filter(Boolean));
  eq(geometries(afterStyle).filter(g => g && g.type === 'MultiLineString').map(g => g.coordinates), lines.map(g => g.coordinates), 'trocar o estilo restaura o trajeto com suas lacunas');
  eq(await f.p.evaluate(() => __mbMock.maps.length), 1, 'trocar o estilo não reconstrói a instância');
  await f.draw({ ativo: false, estilo: 'claro' });
  ok(await f.p.evaluate(() => __mbMock.calls.some(c => c[0] === 'fitBounds')), 'atividade pausada permite enquadrar o percurso completo');
  const kmRoute = [{ lat: 0, lng: 0 }, { lat: 0, lng: .012 }, { lat: 1, lng: 1, quebra: true }, { lat: 1, lng: 1.008 }];
  await f.draw({ rota: kmRoute, posicao: kmRoute.at(-1), estilo: 'claro' });
  const markers = await f.p.evaluate(() => Object.values(__mbMock.maps[0].sources).flatMap(s => s.data && s.data.features || []).filter(ft => ft.properties.texto));
  eq(markers.map(ft => ft.properties.texto), ['1', '2'], 'marcos de quilômetro somam somente os trechos observados, ignorando a lacuna');
  ok(markers[0].geometry.coordinates[0] > 0 && markers[0].geometry.coordinates[0] < .012 && markers[1].geometry.coordinates[0] > 1 && markers[1].geometry.coordinates[0] < 1.008, 'cada marco cai dentro de um segmento registrado');
  await f.p.evaluate(() => __mbMock.maps[0].emit('dragstart'));
  const beforePan = await f.p.evaluate(() => __mbMock.calls.filter(c => ['easeTo', 'jumpTo', 'fitBounds'].includes(c[0])).length);
  await f.draw({ rota: kmRoute, posicao: { lat: 1, lng: 1.009 }, estilo: 'claro' });
  eq(await f.p.evaluate(() => __mbMock.calls.filter(c => ['easeTo', 'jumpTo', 'fitBounds'].includes(c[0])).length), beforePan, 'explorar o mapa manualmente suspende a câmera automática');
  await f.p.evaluate(() => __crMapbox.destroi());
  ok(await f.p.evaluate(() => __mbMock.maps.every(m => m.removed)), 'destruir o adapter libera todas as instâncias WebGL');
  eq(f.errors, [], 'trajeto, câmera, estilos e ciclo de vida sem erros no app');
  await f.ctx.close();

  const failure = await fixture();
  await failure.draw(); await failure.ready();
  await failure.p.evaluate(() => __mbMock.maps[0].emit('error', { error: { status: 401, message: 'Token sintético recusado' } }));
  eq(await failure.draw(), false, 'credencial recusada devolve o trajeto ao canvas legado');
  const countAfterError = await failure.p.evaluate(() => __mbMock.maps.length);
  for (let i = 0; i < 4; i++) await failure.draw();
  eq(await failure.p.evaluate(() => __mbMock.maps.length), countAfterError, 'erro de autorização não cria laço de novas instâncias');
  eq(failure.errors, [], 'falha do fornecedor não interrompe a execução da corrida');
  await failure.ctx.close();

  const missing = await fixture({ noSdk: true });
  eq(await missing.draw(), false, 'CDN indisponível mantém o trajeto legado durante a tentativa');
  await missing.p.waitForTimeout(300);
  eq(await missing.draw(), false, 'falha do download não esconde o trajeto nem declara Mapbox pronto');
  ok(missing.requests.some(url => url.includes('api.mapbox.com/mapbox-gl-js/')), 'SDK é solicitado somente ao abrir um mapa com posição');
  ok(!missing.requests.some(url => url.includes(TOKEN)), 'download do SDK não carrega o token na URL');
  eq(missing.errors, [], 'falha da CDN é tratada sem promessa rejeitada ou erro global');
  await missing.ctx.close();

  // Navegação real da corrida: o painel de métricas não precisa de um mapa
  // escondido, e abrir/fechar sua tela não reconstrói o SDK a cada toque.
  const live = await fixture();
  await live.p.evaluate(route => {
    document.getElementById('mapbox-fixture').remove();
    document.querySelector('[data-cbstart]').click();
    document.getElementById('crGo').click();
    __crMapa.set({ rota: route, lastPos: route.at(-1), run: true, t0: Date.now(), acum: 0, pagF: 0 });
    __pintaCr(); __crMapa.desenha();
  }, route);
  eq(await live.p.evaluate(() => __mbMock.maps.length), 0, 'painel de métricas da corrida não carrega um mapa atrás da tela');
  await live.p.evaluate(() => document.getElementById('crMapBtnF').click());
  await live.p.waitForFunction(() => __mbMock.maps.length === 1);
  await live.p.evaluate(() => { __mbMock.maps[0].emit('style.load'); __crMapa.desenha(); });
  eq((await live.state()).canvas, 'crMapaFull', 'botão Ver o mapa integra Mapbox ao canvas real da corrida');
  ok(await live.p.locator('#crMapboxHost').isVisible(), 'mapa carregado fica visível na tela de execução');
  ok(await live.p.locator('#crGoF').isVisible(), 'controle de pausar continua visível sobre o mapa');
  await live.p.evaluate(() => document.getElementById('crMapBtnF').click());
  ok(await live.p.locator('#crMapboxHost').isHidden(), 'voltar ao painel suspende o mapa e libera a interação das métricas');
  await live.p.evaluate(() => document.getElementById('crMapBtnF').click());
  eq(await live.p.evaluate(() => __mbMock.maps.length), 1, 'alternar painel e mapa reais reaproveita a instância');
  await live.p.evaluate(() => document.getElementById('crFullFecha').click());
  ok(await live.p.locator('#crFull').isHidden(), 'fechar o mapa mantém a navegação normal do app');
  eq(live.errors, [], 'navegação real entre painel, mapa e app sem erros de JavaScript');
  await live.ctx.close();

  const three = await fixture();
  async function open3d(fixture) {
    await fixture.p.evaluate(route => {
      const code = [__crMapa.rota.cod(route.slice(0, 2)), __crMapa.rota.cod(route.slice(2))];
      __crMapa.abre3D(code, 'Trajeto sintético');
    }, route);
  }
  await open3d(three);
  await three.p.waitForFunction(() => __mbMock.maps.length === 1);
  const threeOptions = await three.p.evaluate(() => __mbMock.maps[0].options);
  ok(String(threeOptions.style).startsWith('mapbox://styles/mapbox/'), 'trajeto 3D usa o provedor Mapbox quando configurado');
  eq(threeOptions.attributionControl, true, 'trajeto 3D preserva a atribuição do Mapbox');
  eq(threeOptions.accessToken, TOKEN, 'trajeto 3D recebe somente o token público configurado');
  await three.p.evaluate(() => { __mbMock.maps[0].emit('style.load'); __mbMock.maps[0].emit('load'); });
  const threeData = await three.p.evaluate(() => ({ sources: Object.values(__mbMock.maps[0].sources), calls: __mbMock.calls }));
  eq(geometries(threeData.sources.map(s => s.data).filter(Boolean)).filter(g => g && g.type === 'MultiLineString').map(g => g.coordinates), lines.map(g => g.coordinates), '3D mantém os mesmos segmentos sem inventar ligação entre lacunas');
  ok(threeData.sources.some(s => s.type === 'raster-dem' && s.url === 'mapbox://mapbox.mapbox-terrain-dem-v1') && threeData.calls.some(c => c[0] === 'setTerrain'), '3D configura a fonte de relevo após o estilo estar disponível');
  await three.p.evaluate(() => document.getElementById('cr3Dx').click());
  eq(await three.p.locator('#cr3D').count(), 0, 'fechar o 3D remove seu diálogo');
  ok(await three.p.evaluate(() => __mbMock.maps[0].removed), 'fechar o 3D libera a instância WebGL');
  await three.p.evaluate(route => {
    __crMapa.abre3D(__crMapa.rota.cod(route.slice(0, 2)), 'Abrir e fechar');
    __crMapa.fecha3D();
  }, route);
  await three.p.waitForTimeout(40);
  eq(await three.p.evaluate(() => __mbMock.maps.length), 1, 'fechar antes da resposta do SDK não deixa um mapa órfão');
  eq(three.errors, [], 'abertura, relevo e fechamento do 3D sem erros globais');
  await three.ctx.close();

  const unavailable3d = await fixture();
  await unavailable3d.p.clock.install();
  await open3d(unavailable3d);
  await unavailable3d.p.waitForFunction(() => __mbMock.maps.length === 1);
  await unavailable3d.p.evaluate(() => __mbMock.maps[0].emit('error', { error: { status: 403, message: 'Estilo fictício indisponível' } }));
  await unavailable3d.p.clock.fastForward(9100);
  const message3d = await unavailable3d.p.locator('#cr3Dav').textContent();
  ok(!/seu trajeto está aí/i.test(message3d), 'falha antes do estilo 3D não afirma que um trajeto inexistente está na tela');
  ok(await unavailable3d.p.evaluate(() => typeof __mbMock.maps[0].options.style === 'object' && Object.keys(__mbMock.maps[0].options.style.sources).length === 0), '3D recusado troca para um estilo local sem novas dependências remotas');
  await unavailable3d.p.evaluate(() => __mbMock.maps[0].emit('style.load'));
  const fallback3dSources = await unavailable3d.p.evaluate(() => Object.values(__mbMock.maps[0].sources));
  eq(geometries(fallback3dSources.map(s => s.data).filter(Boolean)).filter(g => g && g.type === 'MultiLineString').map(g => g.coordinates), lines.map(g => g.coordinates), 'alternativa local preserva todos os segmentos do percurso mesmo sem estilo remoto');
  ok(!fallback3dSources.some(s => s.type === 'raster-dem'), 'alternativa local não volta a solicitar o relevo indisponível');
  ok(/Ruas e relevo indisponíveis/.test(await unavailable3d.p.locator('#cr3Dav').textContent()), 'aluno recebe uma explicação honesta da alternativa sem ruas nem relevo');
  ok(await unavailable3d.p.locator('#cr3Dx').isVisible(), 'falha do fornecedor preserva a saída do 3D');
  eq(unavailable3d.errors, [], 'estilo 3D recusado não interrompe o app');
  await unavailable3d.ctx.close();
  console.log(n + ' verificações de integração Mapbox passaram.');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
