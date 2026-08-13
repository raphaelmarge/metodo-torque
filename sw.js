/* Service worker do portal Método Torque — precache completo para uso offline. */
importScripts("assets/content.js");

var VERSION = "mt-v383";
var PRECACHE = "precache-" + VERSION;
var RUNTIME = "runtime-" + VERSION;
// O leitor de imagem das Medidas pela câmera tem ~17 MB e vive numa cache
// PRÓPRIA, por dois motivos: o precache usa addAll (se um arquivo falhar, o
// service worker inteiro não instala e o site perde o offline), e o RUNTIME é
// apagado a cada versão nova — o professor baixaria os 17 MB de novo toda vez.
var VISAO = "mt-visao-v1";

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
  "assets/pagarme-cartao.js",
  "personal.html",
  "personal-vendas.html",
  "manifest-personal.webmanifest",
  "torqueon.html",
  "torquesys.html",
  "apps/hq.html",
  "aluno-login.html",
  "nutricao.html",
  "manifest-nutricao.webmanifest",
  "assets/alimentos-db.js",
  "assets/receitas-db.js",
  "assets/exercicios-db.js",
  "assets/exercicios-anim.js",
  "assets/composicao-corporal.js",
  "assets/scanner-visao.js",
  "assets/scanner-corporal.js",
  "assets/scanner-camera.js",
  "assets/modulo-conta.js",
  "assets/bot-builder.js",
  "privacidade.html",
  "quest.html",
  "assets/icons/icon-personal.svg",
  "assets/icons/icon-personal-192.png",
  "assets/icons/icon-nutri.svg",
  "assets/icons/icon-nutri-192.png",
];

var DOC_PAGES = (self.MT_DOCS || []).map(function (d) { return "docs/" + d.slug + ".html"; })
  .concat((self.MT_APPS || []).map(function (a) { return a.file; }));

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(PRECACHE).then(function (cache) {
      // cache: "reload" ignora o cache HTTP do navegador — cada versão nova
      // nasce 100% fresca (sem misturar página nova com script velho)
      return cache.addAll(CORE.concat(DOC_PAGES).map(function (u) {
        return new Request(u, { cache: "reload" });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== PRECACHE && k !== RUNTIME && k !== VISAO) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // leitor de imagem: cache própria, que atravessa as trocas de versão do site
  if (url.pathname.indexOf("/assets/vendor/mediapipe/") > -1) {
    event.respondWith(caches.open(VISAO).then(function (cache) {
      return cache.match(req).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        });
      });
    }));
    return;
  }

  // páginas (navegações): rede primeiro — quem está online sempre vê a
  // versão nova sem precisar limpar cache; o cache só entra offline
  if (req.mode === "navigate") {
    event.respondWith(
      // no-cache: revalida no servidor (senão o cache HTTP do navegador segura HTML velho)
      fetch(req, { cache: "no-cache" }).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(RUNTIME).then(function (cache) { cache.put(req, copy); });
        }
        return res;
      }).catch(function () {
        return caches.match(req, { ignoreSearch: true }).then(function (hit) {
          return hit || caches.match("./");
        });
      })
    );
    return;
  }

  // demais arquivos (css/js/fontes/imagens): cache primeiro (rápido/offline)
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
        return Response.error();
      });
    })
  );
});
