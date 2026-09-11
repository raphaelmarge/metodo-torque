/* Service worker do portal TORQUE ON — precache completo para uso offline. */
importScripts("assets/content.js");

/* A versão fica CRAVADA aqui, e não só no assets/versao.js.
 *
 * O navegador decide se existe service worker novo comparando os BYTES deste
 * arquivo. Com a versão só no arquivo importado, o sw.js ficava igualzinho lote
 * após lote — 18 versões seguidas, do mt-v491 ao mt-v509 — e o iPhone nunca
 * trocava o service worker, porque o Safari não confere os arquivos importados.
 * O aparelho seguia servindo do cache TODO js do site, inclusive o
 * app/aluno-builder.js (o "código único" do app do aluno), e reiniciar o celular
 * não adiantava: o problema não estava no aparelho, estava no aviso que nunca
 * chegava. O pwa-update.js já pedia "procura versão nova" a cada abertura; era
 * a resposta que vinha sempre igual.
 *
 * tests/test-versao.js não deixa este número ficar diferente do versao.js. */
var VERSION = "mt-v821";
var PRECACHE = "precache-" + VERSION;
var RUNTIME = "runtime-" + VERSION;
var VISAO = "mt-visao-v1";
var MAPA = "mt-mapa-v1";

var CORE = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "assets/app.css",
  "assets/app.js",
  "assets/content.js",
  "assets/versao.js",
  "assets/relatorio-0809.js",
  "assets/relatorio-0809.css",
  "assets/acompanhamento.js",
  "assets/prescricao-series.js",
  "assets/personal-usabilidade.css",
  "assets/personal-gestao.css",
  "assets/personal-gestao.js",
  "assets/nutricao-core.js",
  "assets/personal-nutricao.js",
  "assets/personal-nutricao.css",
  "assets/onboarding-consultoria.js",
  "assets/personal-onboarding.js",
  "assets/personal-onboarding.css",
  "assets/personal-torque-one.css",
  "assets/personal-torque-one.js",
  "assets/personal-acompanhamento.css",
  "assets/personal-ferramentas.css",
  "assets/personal-ferramentas.js",
  "assets/personal-questionarios.js",
  "assets/personal-questionarios.css",
  "assets/personal-comunicacao.css",
  "assets/pwa-update.js",
  "assets/access-config.js",
  "assets/access.js",
  "assets/cloud-config.js",
  "assets/erro-funcao.js",
  "assets/funcao-nuvem.js",
  "assets/vendor/supabase.js",
  "assets/vendor/qrcode.js",
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
  "assets/landing-personal.css",
  "assets/landing-personal.js",
  "manifest-personal.webmanifest",
  "torqueon.html",
  "torquesys.html",
  "apps/hq.html",
  "aluno-login.html",
  "pagina.html",
  "nutricao.html",
  "manifest-nutricao.webmanifest",
  "assets/alimentos-db.js",
  "assets/receitas-db.js",
  "assets/exercicios-db.js",
  "assets/composicao-corporal.js",
  "assets/avaliacao-ui.js",
  "assets/scanner-visao.js",
  "assets/scanner-corporal.js",
  "assets/scanner-camera.js",
  "assets/modulo-conta.js",
  "assets/excluir-conta.js",
  "assets/bot-builder.js",
  "assets/demo-nuvem.js",
  "app/aluno-builder.js",
  "app/aluno-skin.js",
  "app/nutri-builder.js",
  "app/nutri-skin.js",
  "privacidade.html",
  "excluir-conta.html",
  "diagnostico.html",
  "gifs.html",
  "meta.html",
  "quest.html",
  "anamnese.html",
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
      return cache.addAll(CORE.concat(DOC_PAGES).map(function (u) {
        return new Request(u, { cache: "no-cache" });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k.indexOf("mt-app-") === 0) return null;
        if (k !== PRECACHE && k !== RUNTIME && k !== VISAO && k !== MAPA) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("push", function (event) {
  var d = {};
  try { d = event.data ? event.data.json() : {}; } catch (err) {}
  event.waitUntil(self.registration.showNotification(d.t || "TORQUE ON", {
    body: d.b || "",
    icon: "assets/icons/icon-personal-192.png",
    badge: "assets/icons/icon-personal-192.png",
  }));
});
self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: "window" }).then(function (lista) {
    if (lista.length) return lista[0].focus();
    return clients.openWindow("personal.html");
  }));
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (url.pathname.indexOf("/assets/vendor/maplibre/") > -1) {
    event.respondWith(caches.open(MAPA).then(function (cache) {
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

  if (url.pathname.endsWith(".mp4")) return;

  if (url.pathname.indexOf("/supabase/functions/") > -1 ||
      url.pathname.indexOf("supabase-setup.sql") > -1 ||
      url.pathname.indexOf("/app/aluno-builder.js") > -1 ||
      url.pathname.indexOf("/app/aluno-skin.js") > -1 ||
      url.pathname.indexOf("/app/nutri-builder.js") > -1 ||
      url.pathname.indexOf("/app/nutri-skin.js") > -1) {
    event.respondWith(
      fetch(req, { cache: "no-cache" }).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(RUNTIME).then(function (cache) { cache.put(req, copy); });
        }
        return res;
      }).catch(function () {
        return caches.match(req, { ignoreSearch: true }).then(function (hit) {
          return hit || Response.error();
        });
      })
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
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