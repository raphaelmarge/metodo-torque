/* Browser real, HTTP somente loopback e perfil efemero. Nao usa o servidor do
 * desenvolvedor, credenciais, dados reais, gateways nem banco. A fixture de SW
 * legado reproduz caches mt-v849; a instalacao/atualizacao usa os SWs reais.
 * BASE_URL seleciona o host loopback; a porta desta fixture continua efemera
 * para nao instalar workers no servidor compartilhado de tests/run.sh.
 * Executar: node tests/test-personal-sales-cache.js (CHROMIUM_PATH opcional).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const fixtureAddress = new URL(process.env.BASE_URL || 'http://127.0.0.1:8765');
assert.equal(fixtureAddress.protocol, 'http:', 'cache fixture requires local HTTP');
assert.ok(['127.0.0.1', 'localhost'].includes(fixtureAddress.hostname), 'cache fixture accepts only loopback BASE_URL');
assert.ok(!fixtureAddress.username && !fixtureAddress.password && fixtureAddress.pathname === '/' && !fixtureAddress.search && !fixtureAddress.hash,
  'BASE_URL must be a loopback origin without credentials or path');
let chromium;
try { chromium = require('playwright').chromium; }
catch (_) { try { chromium = require('./ci/node_modules/playwright').chromium; }
  catch (_) { chromium = require('/opt/node22/lib/node_modules/playwright').chromium; } }
const ROOT = path.resolve(__dirname, '..');
const source = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const current = source('assets/versao.js').match(/MT_VERSAO\s*=\s*"(mt-v\d+)"/)[1];
const previous = 'mt-v' + (Number(current.slice(4)) - 1);
const salesFiles = ['personal-assinatura.html', 'assets/personal-sales-intent.js', 'assets/personal-sales.css'];
const portalFiles = [...salesFiles, 'assets/modulo-conta.js', 'assets/versao.js', 'personal.html',
  'apps/hq.html', 'assets/hq-referrals.js', 'assets/hq-referrals.css'];
let rootPhase = 'legacy', appPhase = 'legacy', browser, context, server, base;
const responseErrors = [];
let checks = 0;
const pass = label => { checks++; console.log('OK ' + label); };
const mime = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html',
  '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };

function legacyWorker(cache, urls) {
  return `const CACHE=${JSON.stringify(cache)};
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(${JSON.stringify(urls)})).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {if(e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
e.respondWith(caches.match(e.request,{cacheName:CACHE,ignoreSearch:true}).then(hit => hit || fetch(e.request)));});`;
}
function respond(req, res) {
  const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  res.setHeader('Cache-Control', 'no-store');
  const send = (text, type = 'text/javascript', status = 200) => {
    if (status >= 400) responseErrors.push({ pathname, status, rootPhase, appPhase });
    res.writeHead(status, { 'Content-Type': type + '; charset=utf-8' }); res.end(text);
  };
  if (pathname.endsWith('/__cache-test.html')) return send('<!doctype html><meta charset="utf-8"><title>Cache local fixture</title><p>Fixture local</p>', 'text/html');
  if (pathname === '/sw.js' && rootPhase === 'legacy') return send(legacyWorker('precache-' + previous,
    ['/personal.html', '/assets/modulo-conta.js', '/assets/versao.js']));
  if (pathname === '/app/app-sw.js' && appPhase === 'legacy') return send(legacyWorker('mt-app-' + previous,
    ['/app/index.html', '/app/aluno-builder.js', '/assets/versao.js']));
  if (rootPhase === 'legacy' && pathname === '/assets/versao.js') return send('self.MT_VERSAO="' + previous + '";');
  if (rootPhase === 'legacy' && pathname === '/assets/modulo-conta.js') return send('self.LEGACY_CONTA=true;');
  if (rootPhase === 'legacy' && pathname === '/personal.html') return send('<!doctype html><title>Legacy panel</title><p>LEGACY_PERSONAL</p>', 'text/html');
  if (appPhase === 'legacy' && pathname === '/app/aluno-builder.js') return send('self.LEGACY_BUILDER=true;');
  if (rootPhase === 'broken' && pathname === '/assets/personal-sales-intent.js') return send('fixture installation failure', 'text/plain', 503);
  if (appPhase === 'broken' && pathname === '/app/aluno-skin.js') return send('fixture installation failure', 'text/plain', 503);
  if (pathname.startsWith('/api/') || pathname.startsWith('/auth/v1/') || pathname.startsWith('/functions/v1/') || pathname.startsWith('/rest/v1/') || pathname === '/__auth-file.json') {
    // Cabecalho propositalmente cacheavel para provar o bypass dos workers.
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return send(JSON.stringify({ fixture: true, path: pathname }), 'application/json');
  }
  let relative = pathname.replace(/^\/+/, '') || 'index.html';
  if (relative.endsWith('/')) relative += 'index.html';
  const target = path.resolve(ROOT, relative);
  if (!target.startsWith(ROOT + path.sep)) return send('outside fixture root', 'text/plain', 403);
  try {
    const data = fs.readFileSync(target);
    res.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream' });
    res.end(data);
  } catch (_) { send('not found', 'text/plain', 404); }
}
async function install(page, script, scope) {
  await page.evaluate(async ({ script, scope }) => {
    const registration = await navigator.serviceWorker.register(script, { scope, updateViaCache: 'none' });
    if (registration.active?.state === 'activated') return;
    await new Promise((resolve, reject) => {
      const worker = registration.installing || registration.waiting;
      const timer = setTimeout(() => reject(Error('install timeout')), 25000);
      const check = () => {
        if (worker.state === 'activated') { clearTimeout(timer); resolve(); }
        if (worker.state === 'redundant') { clearTimeout(timer); reject(Error('install failed')); }
      };
      worker.addEventListener('statechange', check); check();
    });
  }, { script, scope });
  await page.waitForFunction(script => navigator.serviceWorker.controller?.scriptURL.endsWith(script), script);
}
async function update(page, scope) {
  return page.evaluate(async scope => {
    const registration = await navigator.serviceWorker.getRegistration(scope);
    const result = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('update timeout')), 25000);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        const check = () => {
          if (worker.state === 'activated' || worker.state === 'redundant') {
            clearTimeout(timer); resolve(worker.state);
          }
        };
        worker.addEventListener('statechange', check); check();
      }, { once: true });
    });
    await registration.update();
    return result;
  }, scope);
}
async function textAt(page, relative, options) {
  return page.evaluate(async ({ relative, options }) => (await fetch('/' + relative, options)).text(), { relative, options });
}
async function verifyPreserved(page, names) {
  const values = await page.evaluate(async names => {
    const result = {};
    for (const name of names) result[name] = await (await (await caches.open(name)).match('/__data/' + name)).text();
    result.local = localStorage.getItem('tq_app_pacote');
    result.localPanel = localStorage.getItem('fixture-panel-data');
    return result;
  }, names);
  for (const name of names) assert.equal(values[name], 'preserve:' + name);
  assert.equal(values.local, '{"fixture":"student-package"}');
  assert.equal(values.localPanel, 'preserve-panel');
}
async function verifySensitiveRequests(page) {
  const requests = [
    ['api/payment-status', {}], ['auth/v1/user', {}], ['functions/v1/payment-callback', {}],
    ['rest/v1/rpc/hq_referrals_snapshot', {}],
    ['__auth-file.json', { headers: { Authorization: 'Bearer fixture-only-not-a-credential' } }],
    ['supabase/functions/_shared/personal-sales.mjs', {}]
  ];
  for (const [relative, options] of requests) assert.ok(await textAt(page, relative, options));
  const stored = await page.evaluate(async () => {
    const urls = [];
    for (const name of await caches.keys()) for (const req of await (await caches.open(name)).keys()) urls.push(req.url);
    return urls;
  });
  for (const [relative] of requests) assert.ok(!stored.some(url => url === base + '/' + relative), 'nao guardar ' + relative);
  await context.setOffline(true);
  try {
    for (const [relative, options] of requests) {
      const failed = await page.evaluate(async ({ relative, options }) => {
        try { await fetch('/' + relative, options); return false; } catch (_) { return true; }
      }, { relative, options });
      assert.equal(failed, true, 'offline deve falhar sem resposta de pagamento/auth: ' + relative);
    }
  } finally { await context.setOffline(false); }
}

(async () => {
  assert.equal(current, source('sw.js').match(/^var VERSION = "(mt-v\d+)";/m)[1]);
  assert.equal(current, source('app/app-sw.js').match(/^var VERSION = "(mt-v\d+)";/m)[1]);
  server = http.createServer(respond);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, fixtureAddress.hostname, resolve); });
  fixtureAddress.port = String(server.address().port);
  base = fixtureAddress.origin;
  const executablePath = process.env.CHROMIUM_PATH || ['/opt/pw-browsers/chromium',
    'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(candidate => fs.existsSync(candidate));
  browser = await chromium.launch({ headless: true, executablePath, args: ['--no-sandbox', '--disable-background-networking',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'] });
  context = await browser.newContext({ serviceWorkers: 'allow' });
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  const page = await context.newPage();
  await page.goto(base + '/__cache-test.html');
  await install(page, '/sw.js', '/');
  const appPage = await context.newPage();
  await appPage.goto(base + '/app/__cache-test.html');
  await install(appPage, '/app/app-sw.js', '/app/');
  const preserved = ['mt-mapa-v1', 'mt-visao-v1', 'mt-data-v1', 'mt-app-data'];
  await page.evaluate(async ({ names, previous }) => {
    localStorage.setItem('tq_app_pacote', '{"fixture":"student-package"}');
    localStorage.setItem('fixture-panel-data', 'preserve-panel');
    for (const name of names) await (await caches.open(name)).put('/__data/' + name, new Response('preserve:' + name));
    await (await caches.open('runtime-' + previous)).put('/__old-runtime.txt', new Response('legacy runtime'));
    // Prova de isolamento: cache preservado do aluno tem uma copia antiga de
    // recurso compartilhado, criada ANTES do precache novo do portal.
    await (await caches.open('mt-app-' + previous)).put('/assets/modulo-conta.js', new Response('LEGACY_CHILD_CONTA'));
  }, { names: preserved, previous });
  assert.match(await textAt(page, 'assets/modulo-conta.js'), /LEGACY_CONTA/);
  pass('registro legado, caches e dados locais preparados sem tocar perfil real');

  rootPhase = 'broken';
  assert.equal(await update(page, '/'), 'redundant');
  await context.setOffline(true);
  assert.match(await textAt(page, 'assets/modulo-conta.js'), /LEGACY_CONTA/);
  await context.setOffline(false);
  await verifyPreserved(page, preserved);
  pass('falha do precache do portal mantem worker anterior utilizavel offline');

  rootPhase = 'current';
  assert.equal(await update(page, '/'), 'activated');
  let names = await page.evaluate(() => caches.keys());
  assert.ok(!names.includes('precache-' + previous) && !names.includes('runtime-' + previous));
  assert.ok(names.includes('precache-' + current) && names.includes('mt-app-' + previous));
  await verifyPreserved(page, preserved);
  for (const relative of portalFiles) assert.equal(await textAt(page, relative), source(relative), relative + ' atualizado');
  pass('portal atualizado recebe modulo-conta/personal atuais e preserva dados/cache do aluno');

  await context.setOffline(true);
  for (const relative of portalFiles) assert.equal(await textAt(page, relative), source(relative), relative + ' offline');
  await page.goto(base + '/personal-assinatura.html?cupom=TEST_ONLY');
  assert.equal(await page.locator('.sales-price strong').innerText(), 'R$ 49,90');
  assert.ok(await page.locator('#salesCheckout').isDisabled());
  assert.equal(await page.locator('#salesCoupon').inputValue(), 'TEST_ONLY');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('torque:sales:intent:v1')), null);
  await context.setOffline(false);
  pass('nova rota e seus CSS/JS abrem offline; cupom nao concede desconto nem checkout');
  await verifySensitiveRequests(page);
  pass('portal nao armazena nem repete offline respostas locais de pagamento/auth/core financeiro');

  appPhase = 'broken';
  assert.equal(await update(appPage, '/app/'), 'redundant');
  assert.ok((await appPage.evaluate(() => caches.keys())).includes('mt-app-' + previous));
  await context.setOffline(true);
  assert.match(await textAt(appPage, 'app/aluno-builder.js'), /LEGACY_BUILDER/);
  await context.setOffline(false);
  await verifyPreserved(appPage, preserved);
  pass('falha do precache do aluno nao ativa esqueleto incompleto nem apaga copia anterior');

  appPhase = 'current';
  assert.equal(await update(appPage, '/app/'), 'activated');
  names = await appPage.evaluate(() => caches.keys());
  assert.ok(!names.includes('mt-app-' + previous) && names.includes('mt-app-' + current));
  assert.ok(names.includes('precache-' + current));
  await verifyPreserved(appPage, preserved);
  await context.setOffline(true);
  for (const relative of ['app/index.html', 'app/aluno-builder.js', 'app/aluno-skin.js', 'assets/versao.js']) {
    assert.equal(await textAt(appPage, relative), source(relative), relative + ' aluno offline');
  }
  const missing = await appPage.evaluate(async () => {
    try { await fetch('/app/fixture-missing.js'); return false; } catch (_) { return true; }
  });
  assert.equal(missing, true, 'sub-recurso ausente nao recebe HTML com status 200');
  await context.setOffline(false);
  pass('aluno atualizado usa esqueleto completo offline; dados/mapa/visao/portal preservados');
  await verifySensitiveRequests(appPage);
  pass('worker do aluno tambem ignora pagamento, auth e core financeiro');

  await context.close();
  context = await browser.newContext({ serviceWorkers: 'allow' });
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  const fresh = await context.newPage();
  await fresh.goto(base + '/__cache-test.html');
  await install(fresh, '/sw.js', '/');
  await context.setOffline(true);
  await fresh.goto(base + '/personal-assinatura.html');
  assert.equal(await fresh.locator('.sales-price strong').innerText(), 'R$ 49,90');
  assert.ok(await fresh.locator('#salesCheckout').isDisabled());
  for (const relative of salesFiles) assert.equal(await textAt(fresh, relative), source(relative));
  pass('instalacao limpa tambem contem a nova rota e ativos offline');
  console.log(checks + ' cenarios reais de cache passaram (' + previous + ' -> ' + current + ').');
})().catch(error => { console.error(error); console.error('HTTP fixture errors:', responseErrors); process.exitCode = 1; }).finally(async () => {
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close();
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
