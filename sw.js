/* Service worker do portal Método Torque — precache completo para uso offline. */
importScripts("assets/content.js");

var VERSION = "mt-v99";
var PRECACHE = "precache-" + VERSION;
var RUNTIME = "runtime-" + VERSION;

var CORE = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "assets/app.css",
  "assets/app.js",
  "assets/content.js",
  "assets/access-config.js",
  "assets/access.js",
  "assets/cloud-config.js",
  "assets/vendor/supabase.js",
  "docs/gate.js",
  "docs/preenchivel.js",
  "docs/mobile.css",
  "assets/icons/icon.svg",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "assets/icons/icon-maskable-512.png",
  "assets/icons/logo-torque-claro.svg",
  "assets/icons/logo-torque-escuro.svg",
  "assets/fonts/archivo.css",
  "assets/fonts/files/archivo-latin-400-normal.woff2",
  "assets/fonts/files/archivo-latin-500-normal.woff2",
  "assets/fonts/files/archivo-latin-600-normal.woff2",
  "assets/fonts/files/archivo-latin-700-normal.woff2",
  "assets/fonts/files/archivo-latin-800-normal.woff2",
  "assets/vendor/react.production.min.js",
  "assets/vendor/react-dom.production.min.js",
  "docs/support.js",
  "docs/doc-page.js",
  "docs/image-slot.js",
  "docs/deck-stage.js",
  "apps/store.js",
  "apps/apps.css",
];

var DOC_PAGES = (self.MT_DOCS || []).map(function (d) { return "docs/" + d.slug + ".html"; })
  .concat((self.MT_APPS || []).map(function (a) { return a.file; }));

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(PRECACHE).then(function (cache) {
      return cache.addAll(CORE.concat(DOC_PAGES));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== PRECACHE && k !== RUNTIME) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(RUNTIME).then(function (cache) { cache.put(req, copy); });
        }
        return res;
      }).catch(function () {
        if (req.mode === "navigate") return caches.match("./");
        return Response.error();
      });
    })
  );
});
