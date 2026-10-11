'use strict';

// Executes the actual worker in a VM. Fetch, CacheStorage and lifecycle events
// are in-memory mocks; these checks never call a server or access account data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const hostingPath = path.resolve(__dirname, '../.openai/hosting.json');
const directory = fs.existsSync(hostingPath)
  ? JSON.parse(fs.readFileSync(hostingPath, 'utf8')).static?.directory || 'dist'
  : fs.existsSync(path.resolve(__dirname, '../sw.js')) ? '.' : 'dist';
const staticRoot = path.resolve(__dirname, '..', directory);
const workerSource = fs.readFileSync(path.join(staticRoot, 'sw.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(staticRoot, 'manifest.webmanifest'), 'utf8'));
const html = fs.readFileSync(path.join(staticRoot, 'index.html'), 'utf8');
const origin = 'https://www.torqueon.com.br';

function response(url, body = 'network', ok = true) {
  return {url, body, ok, type: 'basic', clone() { return response(this.url, this.body, this.ok); }};
}
function worker(basepath, options = {}) {
  const listeners = new Map();
  const storage = new Map();
  const calls = {fetch: [], addAll: [], put: [], deleted: [], claim: 0};
  const caches = {
    async open(name) {
      if (!storage.has(name)) storage.set(name, new Map());
      const entries = storage.get(name);
      return {
        async addAll(urls) {
          calls.addAll.push(...urls);
          for (const url of urls) entries.set(url, response(url, 'precache'));
        },
        async put(key, value) { calls.put.push({name, key}); entries.set(key, value); },
        async match(key) { return entries.get(typeof key === 'string' ? key : key.url); }
      };
    },
    async keys() { return [...storage.keys()]; },
    async delete(name) { calls.deleted.push(name); return storage.delete(name); }
  };
  const context = vm.createContext({
    URL, Set, Promise, caches,
    self: {
      location: new URL(basepath + 'sw.js', origin),
      clients: {async claim() { calls.claim++; }},
      addEventListener(type, callback) { listeners.set(type, callback); }
    },
    async fetch(request) {
      calls.fetch.push(request.url);
      if (options.offline) throw Error('Mock offline');
      return response(options.responseURL || request.url, 'network', options.ok !== false);
    },
    Response: {error() { return {type: 'error', ok: false}; }}
  });
  Object.defineProperty(context, 'localStorage', {get() { throw Error('Worker must not access account snapshots.'); }});
  vm.runInContext(workerSource + '\n;globalThis.__worker = {BASE,CACHE_PREFIX,CACHE,STATIC_URLS,INDEX_URL};', context, {filename: path.join(staticRoot, 'sw.js')});
  function dispatch(type, request) {
    const waits = [];
    let result;
    listeners.get(type)({request, waitUntil(promise) { waits.push(Promise.resolve(promise)); }, respondWith(promise) { result = Promise.resolve(promise); }});
    return {
      handled: !!result,
      async done() {
        const value = result ? await result : undefined;
        while (waits.length) await Promise.all(waits.splice(0));
        return value;
      }
    };
  }
  const api = context.__worker;
  return {
    ...api, calls, storage, dispatch,
    request(url, {method = 'GET', mode = 'cors'} = {}) { return dispatch('fetch', {url: new URL(url, origin).href, method, mode}); }
  };
}

const tests = [];
function test(name, run) { tests.push({name, run}); }
const externalReference = /^(?:[a-z][a-z\d+.-]*:|\/)/i;
// Follow the actual startup graph instead of relying on a fixed asset count.
// WOFF2 is the shipped font source; old optional WOFF fallbacks are not shipped.
function startupAssets() {
  const assets = new Set(['./', 'index.html', 'demo-paciente.html', 'demo-nutricionista.html', 'assets/nutrition-cover.png', ...manifest.icons.map(icon => icon.src)]);
  const walk = relative => {
    if (assets.has(relative) && !['./', 'index.html'].includes(relative)) return;
    assets.add(relative);
    const file = path.join(staticRoot, relative);
    assert(fs.existsSync(file), 'Startup asset must exist: ' + relative);
    if (!/\.(?:js|css)$/.test(relative)) return;
    const source = fs.readFileSync(file, 'utf8');
    const references = relative.endsWith('.js')
      ? [...source.matchAll(/^import\s+[^;\n]+?\s+from\s+['"]([^'"]+)['"];?/mg)].map(match => match[1])
      : [...source.matchAll(/url\(\s*['"]?([^'"\s)]+)['"]?\s*\)/g)].map(match => match[1]).filter(value => value.endsWith('.woff2'));
    for (const reference of references) {
      assert(!externalReference.test(reference), 'Module/font dependency must stay local: ' + reference);
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(relative), reference));
      assert(!resolved.startsWith('../'), 'Dependency must stay beneath Nutri: ' + reference);
      walk(resolved);
    }
  };
  for (const filename of ['index.html', 'demo-paciente.html', 'demo-nutricionista.html']) {
    const page = filename === 'index.html' ? html : fs.readFileSync(path.join(staticRoot, filename), 'utf8');
    for (const match of page.matchAll(/\b(?:src|href)="([^"]+)"/g)) walk(match[1]);
  }
  return assets;
}
const requiredStartupAssets = startupAssets();

for (const basepath of ['/', '/nutri/']) {
  test(basepath + ': manifest identity, scope, launch URL and icons stay in the installed directory', async () => {
    const manifestURL = new URL(basepath + 'manifest.webmanifest', origin);
    for (const field of ['id', 'start_url', 'scope']) {
      assert(!externalReference.test(manifest[field]), field + ' must be relative');
      assert.equal(new URL(manifest[field], manifestURL).href, origin + basepath);
    }
    for (const icon of manifest.icons) {
      assert(!externalReference.test(icon.src), 'Icon must be relative');
      assert.equal(new URL(icon.src, manifestURL).pathname, basepath + icon.src);
      assert(fs.existsSync(path.join(staticRoot, icon.src)), 'The referenced icon must exist');
    }
  });

  test(basepath + ': every HTML asset resolves locally and exists', async () => {
    for (const filename of ['index.html', 'demo-paciente.html', 'demo-nutricionista.html']) {
    const indexURL = new URL(basepath + filename, origin);
    const page = filename === 'index.html' ? html : fs.readFileSync(path.join(staticRoot, filename), 'utf8');
    for (const match of page.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
      assert(!externalReference.test(match[1]), 'HTML reference must be relative: ' + match[1]);
      const url = new URL(match[1], indexURL);
      assert(url.pathname.startsWith(basepath));
      assert(fs.existsSync(path.join(staticRoot, match[1])), 'HTML asset must exist: ' + match[1]);
    }
    }
  });

  test(basepath + ': install precaches only existing Nutri files beneath the worker URL', async () => {
    const h = worker(basepath);
    await h.dispatch('install').done();
    assert.equal(h.calls.addAll.length, h.STATIC_URLS.size);
    assert.deepEqual([...h.calls.addAll].sort(), [...h.STATIC_URLS].sort());
    for (const file of requiredStartupAssets) assert(h.STATIC_URLS.has(new URL(file, h.BASE).href),
      'Startup dependency missing from offline precache: ' + file);
    for (const file of ['care-progress.js', 'journal-model.js', 'food-journal.js', 'plan-recipes.js', 'notifications.js']) {
      assert(requiredStartupAssets.has(file), 'The real module graph must include ' + file);
      assert(h.STATIC_URLS.has(new URL(file, h.BASE).href), 'New Nutri module must be precached: ' + file);
    }
    for (const asset of h.calls.addAll) {
      const url = new URL(asset);
      assert.equal(url.origin, origin);
      assert(url.pathname.startsWith(basepath));
      const relative = url.pathname.slice(basepath.length) || 'index.html';
      assert(fs.existsSync(path.join(staticRoot, relative)), 'Precache asset must exist: ' + relative);
    }
  });

  test(basepath + ': activation deletes only older caches of this Nutri directory', async () => {
    const h = worker(basepath);
    const otherPath = basepath === '/' ? '/nutri/' : '/';
    const other = worker(otherPath);
    const old = h.CACHE_PREFIX + 'v0';
    for (const name of [old, h.CACHE, other.CACHE, 'academia-v1', 'torque-personal-v1']) h.storage.set(name, new Map());
    await h.dispatch('activate').done();
    assert.deepEqual(h.calls.deleted, [old]);
    assert(h.storage.has(h.CACHE));
    assert(h.storage.has(other.CACHE));
    assert(h.storage.has('academia-v1'));
    assert(h.storage.has('torque-personal-v1'));
    assert.equal(h.calls.claim, 1);
  });

  test(basepath + ': other Torque apps, APIs, POST and unknown assets are never intercepted', async () => {
    const h = worker(basepath);
    const excluded = [
      '/academia/', '/academia/index.html', '/personal/', '/personal/app.js',
      '/rest/v1/patients', '/auth/v1/token', basepath + 'rest/v1/patients',
      basepath + 'auth/v1/token', basepath + 'storage/v1/object/private',
      basepath + 'functions/v1/private', basepath + 'api/patients',
      basepath + 'unknown.js', basepath + 'assets/fonts/files/missing.woff2',
      basepath + 'unknown-route', '/nutri-other/app.js',
      'https://supabase.example.test/rest/v1/patients'
    ];
    if (basepath !== '/') excluded.push('/', '/index.html', '/app.js', '/nutri/../personal/index.html');
    for (const url of excluded) assert.equal(h.request(url, {mode: 'navigate'}).handled, false, url);
    assert.equal(h.request(basepath + 'app.js', {method: 'POST'}).handled, false);
    assert.equal(h.calls.fetch.length, 0);
    assert.equal(h.calls.put.length, 0);
    assert.equal(h.storage.size, 0);
  });

  test(basepath + ': auth parameters never enter cached requests or responses', async () => {
    const h = worker(basepath);
    const event = h.request(basepath + '?code=private-code&convite=private-invite', {mode: 'navigate'});
    assert.equal(event.handled, true);
    const result = await event.done();
    assert.equal(result.body, 'network');
    assert.equal(h.calls.put.length, 0, 'Response.url with private parameters must not be persisted.');
    await h.request(basepath, {mode: 'navigate'}).done();
    assert.equal(h.calls.put.length, 1);
    assert.equal(h.calls.put[0].key, origin + basepath);
    assert(!h.calls.put[0].key.includes('private-'));
  });

  test(basepath + ': offline navigation falls back to the Nutri index while a missing script returns an error', async () => {
    const h = worker(basepath, {offline: true});
    const index = response(h.INDEX_URL, 'nutri-index');
    h.storage.set(h.CACHE, new Map([[h.INDEX_URL, index]]));
    const navigation = await h.request(basepath + '?entrar=1', {mode: 'navigate'}).done();
    assert.equal(navigation.body, 'nutri-index');
    const script = await h.request(basepath + 'app.js').done();
    assert.equal(script.type, 'error');
    assert.equal(h.calls.put.length, 0);
  });

  test(basepath + ': dedicated demo navigation keeps its own entry offline', async () => {
    const h = worker(basepath, {offline: true});
    await h.dispatch('install').done();
    for (const filename of ['demo-paciente.html', 'demo-nutricionista.html']) {
      const event = h.request(basepath + filename + '?entrar=1', {mode: 'navigate'});
      assert.equal(event.handled, true);
      const result = await event.done();
      assert.equal(result.url, origin + basepath + filename, 'The demo must not fall back to the account entry.');
      assert.equal(result.body, 'precache');
    }
    assert.equal(h.calls.put.length, 0);
  });

  test(basepath + ': HTTP errors and redirects outside Nutri are returned without being cached', async () => {
    const errorWorker = worker(basepath, {ok: false});
    const errorResult = await errorWorker.request(basepath + 'app.js').done();
    assert.equal(errorResult.ok, false);
    assert.equal(errorResult.body, 'network');
    assert.equal(errorWorker.calls.put.length, 0);
    const redirectWorker = worker(basepath, {responseURL: origin + '/personal/index.html'});
    await redirectWorker.request(basepath + 'app.js').done();
    assert.equal(redirectWorker.calls.put.length, 0);
    const crossOrigin = worker(basepath, {responseURL: 'https://supabase.example.test/auth/v1/token'});
    await crossOrigin.request(basepath + 'app.js').done();
    assert.equal(crossOrigin.calls.put.length, 0);
    const privateRedirect = worker(basepath, {responseURL: origin + basepath + '?code=private-code'});
    await privateRedirect.request(basepath + 'app.js').done();
    assert.equal(privateRedirect.calls.put.length, 0, 'Redirect response URLs must not persist private codes.');
  });
}

(async () => {
  let failed = 0;
  for (const {name, run} of tests) {
    try { await run(); console.log('PASS ' + name); }
    catch (error) { failed++; console.error('FAIL ' + name + '\n' + error.stack); }
  }
  console.log(`${tests.length - failed}/${tests.length} basepath asset regressions passed.`);
  if (failed) process.exitCode = 1;
})();

