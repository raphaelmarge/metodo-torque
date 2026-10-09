const BASE = new URL('./', self.location.href);
const CACHE_PREFIX = 'torque-nutri-platform:' + encodeURIComponent(BASE.pathname) + ':';
const CACHE = CACHE_PREFIX + 'v7';
const FILES = ['./', 'index.html', 'demo-paciente.html', 'demo-nutricionista.html', 'app.js', 'platform.js', 'assessment.js', 'patient-experience.js', 'patient.css', 'vendor/medalha-visual.js', 'assets/nutrition-cover.png', 'style.css', 'config.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'vendor/supabase.js', 'vendor/nutricao-core.js', 'vendor/medalhas-core.js', 'vendor/identidade-marca.js', 'vendor/alimentos-db.js', 'vendor/receitas-db.js', 'vendor/composicao-corporal.js', 'assets/fonts/archivo.css', 'assets/fonts/files/archivo-latin-600-normal.woff2', 'assets/fonts/files/archivo-latin-700-normal.woff2', 'assets/fonts/files/archivo-latin-800-normal.woff2', 'assets/fonts/files/archivo-latin-500-normal.woff2', 'assets/fonts/files/archivo-latin-400-normal.woff2', 'assets/fonts/files/archivo-latin-ext-700-normal.woff2', 'assets/fonts/files/archivo-latin-ext-800-normal.woff2', 'assets/fonts/files/archivo-vietnamese-400-normal.woff2', 'assets/fonts/files/archivo-vietnamese-500-normal.woff2', 'assets/fonts/files/archivo-latin-ext-600-normal.woff2', 'assets/fonts/files/archivo-latin-ext-400-normal.woff2', 'assets/fonts/files/archivo-vietnamese-800-normal.woff2', 'assets/fonts/files/archivo-vietnamese-700-normal.woff2', 'assets/fonts/files/archivo-vietnamese-600-normal.woff2', 'assets/fonts/files/archivo-latin-ext-500-normal.woff2'];
const STATIC_URLS = new Set(FILES.map(file => new URL(file, BASE).href));
const INDEX_URL = new URL('index.html', BASE).href;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll([...STATIC_URLS])));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;
  // Only public app files are cached. API calls and other Torque applications pass through.
  const cacheKey = new URL(url.pathname, BASE.origin).href;
  if (!STATIC_URLS.has(cacheKey)) return;
  event.respondWith(fetch(request).then(response => {
    const responseURL = response.url ? new URL(response.url) : url;
    const responseKey = new URL(responseURL.pathname, responseURL.origin).href;
    // Auth links may carry private codes in Response.url; never persist those responses.
    if (response.ok && !url.search && !responseURL.search && STATIC_URLS.has(responseKey)) {
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(cacheKey, response.clone())).catch(() => {}));
    }
    return response;
  }).catch(async () => {
    const cache = await caches.open(CACHE);
    const stored = await cache.match(cacheKey);
    if (stored) return stored;
    if (request.mode === 'navigate') return await cache.match(INDEX_URL) || Response.error();
    return Response.error();
  }));
});
