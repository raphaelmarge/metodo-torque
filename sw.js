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
var VERSION = "mt-v604";
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
  "assets/versao.js",
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
  // construtor do app do aluno: fonte única do código do app
  "app/aluno-builder.js",
  // skin do redesenho: a camada visual que o builder embute no app publicado
  "app/aluno-skin.js",
  "privacidade.html",
  "excluir-conta.html",
  "diagnostico.html",
  "gifs.html",
  "meta.html",
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

  // código das Edge Functions (o funcoes.html copia dali pro Supabase), o
  // supabase-setup.sql (o sql.html copia dali pro SQL Editor) e o construtor do
  // app do aluno: SEMPRE rede primeiro. Servir do cache aqui fazia o professor
  // copiar e publicar uma função VELHA sem perceber — foi assim que a
  // chat-envia "republicada" continuou sem a IA de treino. Pro SQL é ainda mais
  // sério: rodar uma versão velha do setup pode recriar estruturas erradas no
  // banco. E o aluno-builder.js é a FONTE ÚNICA do app do aluno: servir ele do
  // cache é o mesmo que desligar o conserto automático que ele existe pra dar.
  // Nos três casos o cache continua valendo como reserva, pro app abrir offline.
  if (url.pathname.indexOf("/supabase/functions/") > -1 ||
      url.pathname.indexOf("supabase-setup.sql") > -1 ||
      url.pathname.indexOf("/app/aluno-builder.js") > -1 ||
      url.pathname.indexOf("/app/aluno-skin.js") > -1) {
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
