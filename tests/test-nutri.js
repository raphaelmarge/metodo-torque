'use strict';

// Executa os workers e os checks reais com rede/cache/Auth simulados em memória.
// Não publica, não chama APIs e não lê sessões ou registros reais.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {spawnSync} = require('node:child_process');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const origin = 'https://www.torqueon.com.br';
const workerURL = new URL('/sw.js', origin);

function response(url, body = 'portal-network') {
  return {url, body, ok: true, type: 'basic', clone() { return response(this.url, this.body); }};
}

function portalWorker({offline = false} = {}) {
  const listeners = new Map(), storage = new Map();
  const calls = {fetch: [], match: [], open: [], put: [], deleted: [], precache: [], claim: 0};
  const key = request => new URL(typeof request === 'string' ? request : request.url, workerURL).href;
  const caches = {
    async open(name) {
      calls.open.push(name);
      if (!storage.has(name)) storage.set(name, new Map());
      const entries = storage.get(name);
      return {
        async addAll(requests) { calls.precache.push(...requests.map(key)); },
        async match(request) { calls.match.push({name, url: key(request)}); return entries.get(key(request)); },
        async put(request, value) { calls.put.push({name, url: key(request)}); entries.set(key(request), value); }
      };
    },
    async match(request, options = {}) {
      calls.match.push({name: options.cacheName, url: key(request)});
      return storage.get(options.cacheName)?.get(key(request));
    },
    async keys() { return [...storage.keys()]; },
    async delete(name) { calls.deleted.push(name); return storage.delete(name); }
  };
  class WorkerRequest {
    constructor(url, options = {}) { this.url = key(url); this.method = options.method || 'GET'; }
  }
  const context = vm.createContext({
    URL, Promise, caches, Request: WorkerRequest,
    location: workerURL,
    importScripts(...files) {
      for (const file of files) {
        assert.equal(file, 'assets/content.js', 'Dependência inesperada no SW raiz: ' + file);
        const filename = path.join(root, file);
        vm.runInContext(fs.readFileSync(filename, 'utf8'), context, {filename, timeout: 1000});
      }
    },
    self: {
      location: workerURL, MT_DOCS: [], MT_APPS: [],
      clients: {async claim() { calls.claim++; }},
      async skipWaiting() {},
      addEventListener(type, callback) { listeners.set(type, callback); }
    },
    async fetch(request) {
      calls.fetch.push(key(request));
      if (offline) throw Error('Mock offline');
      return response(key(request));
    },
    Response: {error() { return {type: 'error', ok: false}; }}
  });
  vm.runInContext(source, context, {filename: path.join(root, 'sw.js'), timeout: 1000});
  function dispatch(type, request) {
    assert(listeners.has(type), 'O worker real precisa registrar ' + type);
    const waits = [];
    let answer;
    listeners.get(type)({request, waitUntil(promise) { waits.push(Promise.resolve(promise)); }, respondWith(promise) { answer = Promise.resolve(promise); }});
    return {
      handled: !!answer,
      async done() {
        const result = answer ? await answer : undefined;
        while (waits.length) await Promise.all(waits.splice(0));
        await Promise.resolve();
        return result;
      }
    };
  }
  return {
    calls, storage, dispatch, precache: context.PRECACHE, runtime: context.RUNTIME,
    request(url, {mode = 'cors', method = 'GET', authenticated = false} = {}) {
      return dispatch('fetch', {url: key(url), mode, method, headers: {has: name => authenticated && name.toLowerCase() === 'authorization'}});
    }
  };
}

const tests = [];
function test(name, run) { tests.push({name, run}); }

test('SW raiz deixa navegações, assets e APIs /nutri/ para o worker Nutri', async () => {
  for (const offline of [false, true]) {
    const h = portalWorker({offline});
    // Mesmo caches antigas do portal não podem responder ao novo produto.
    for (const name of [h.precache, h.runtime]) h.storage.set(name, new Map([
      [origin + '/', response(origin + '/', 'portal-index')],
      [origin + '/nutri/app.js', response(origin + '/nutri/app.js', 'portal-stale-nutri')]
    ]));
    for (const url of [
      '/nutri', '/nutri/', '/nutri/?entrar=1&perfil=nutri', '/nutri/?code=mock-code&convite=mock-invite',
      '/nutri/index.html', '/nutri/app.js', '/nutri/platform.js', '/nutri/style.css',
      '/nutri/config.js', '/nutri/sw.js', '/nutri/manifest.webmanifest', '/nutri/icon.svg',
      '/nutri/vendor/supabase.js', '/nutri/assets/fonts/files/archivo-latin-500-normal.woff2',
      '/nutri/rest/v1/patients', '/nutri/auth/v1/token', '/nutri/functions/v1/mock',
      '/nutri/assets/vendor/maplibre/mock.js', '/nutri/app/nutri-builder.js'
    ]) for (const mode of ['navigate', 'cors']) for (const authenticated of [false, true]) {
      const event = h.request(url, {mode, authenticated});
      assert.equal(event.handled, false, `O SW raiz interceptou ${url}, ${mode}, auth=${authenticated}, offline=${offline}`);
      assert.equal(await event.done(), undefined);
    }
    assert.equal(h.calls.fetch.length, 0, 'Não deve buscar /nutri/ por conta própria');
    assert.equal(h.calls.match.length, 0, 'Não deve oferecer fallback do portal para /nutri/');
    assert.equal(h.calls.open.length, 0, 'Não deve abrir cache do portal para /nutri/');
    assert.equal(h.calls.put.length, 0, 'Não deve persistir requests Nutri ou códigos de acesso');
  }
});

test('a exclusão /nutri/ preserva as rotas do portal, Personal e Nutri legado', async () => {
  for (const url of ['/torqueon.html', '/personal.html', '/nutricao.html', '/nutri-other/', '/nutrition/']) {
    const h = portalWorker(), event = h.request(url, {mode: 'navigate'});
    assert.equal(event.handled, true, 'O SW raiz deixou de tratar ' + url);
    assert.equal((await event.done()).body, 'portal-network');
    assert.deepEqual(h.calls.fetch, [origin + url]);
  }
  const h = portalWorker(), legacy = h.request('/app/nutri-builder.js');
  assert.equal(legacy.handled, true);
  assert.equal((await legacy.done()).body, 'portal-network');
});

test('a ativação do SW raiz mantém caches Nutri e de outros produtos', async () => {
  const h = portalWorker();
  const preserved = [h.precache, h.runtime, 'torque-nutri-nutri-v1', 'torque-nutri-nutri-v2',
    'torque-nutri-platform-v3', 'torque-nutri-platform:%2Fnutri%2F:v5',
    'torque-nutri-platform:%2F:v5', 'mt-app-v1', 'mt-mapa-v1', 'mt-visao-v1'];
  for (const name of ['precache-mt-v1', 'runtime-mt-v1', ...preserved]) h.storage.set(name, new Map());
  await h.dispatch('activate').done();
  assert.deepEqual(h.calls.deleted.sort(), ['precache-mt-v1', 'runtime-mt-v1']);
  for (const name of preserved) assert(h.storage.has(name), 'Cache de outro produto removida: ' + name);
  assert.equal(h.calls.claim, 1);
});

test('o precache do portal não incorpora arquivos da plataforma /nutri/', async () => {
  const h = portalWorker();
  await h.dispatch('install').done();
  assert(h.calls.precache.length > 0, 'O teste precisa exercitar o install real');
  for (const url of h.calls.precache) assert(!/^\/nutri(?:\/|$)/.test(new URL(url).pathname), 'Arquivo Nutri no precache raiz: ' + url);
});

for (const check of ['auth-access.cjs', 'basepath-assets.cjs', 'assessment.mjs', 'platform-flows.cjs',
  'care-progress.mjs', 'journal-model.mjs', 'plan-recipes.mjs', 'patient-experience-phase1.mjs', 'personal-alignment.mjs']) {
  test('checks reais do Torque Nutri: ' + check, () => {
    const filename = path.join(root, 'nutri/checks', check);
    assert(fs.existsSync(filename), 'Check Nutri ausente; o pacote deve incluir ' + filename);
    const result = spawnSync(process.execPath, [filename], {cwd: root, stdio: 'inherit', timeout: 60000});
    if (result.error) throw result.error;
    assert.equal(result.status, 0, 'Check Nutri falhou: ' + check + (result.signal ? ' (' + result.signal + ')' : ''));
  });
}

(async () => {
  let failed = 0;
  for (const {name, run} of tests) {
    try { await run(); console.log('  ✅ ' + name); }
    catch (error) { failed++; console.error('  ❌ ' + name + '\n' + error.stack); }
  }
  console.log(`\nTorque Nutri no ecossistema: ${tests.length - failed}/${tests.length} checks aprovados.`);
  if (failed) process.exitCode = 1;
})();

