/* Service worker do App do Aluno hospedado.
 *
 * Faz duas coisas: recebe as notificações push e guarda o esqueleto do app
 * (a página que abre + o construtor do site) pra ele abrir sem internet.
 *
 * Rede primeiro, cache como rede de segurança: assim uma correção publicada no
 * site chega na próxima vez que o aluno abrir, e no metrô sem sinal o app abre
 * mesmo assim com a última versão que ele viu. Os DADOS do aluno ficam no
 * localStorage (tq_app_pacote) — aqui só mora o código.
 */
try { importScripts("../assets/versao.js"); } catch (e) {}
var CACHE = "mt-app-" + (self.MT_VERSAO || "v1");
var ESQUELETO = [
  "./",
  "index.html",
  "aluno-builder.js",
  "manifest.webmanifest",
  "../assets/cloud-config.js",
  "../assets/versao.js",
  // a cara do redesenho é a Archivo — sem ela no esqueleto, o app offline
  // abria na fonte do sistema e ficava diferente do desenho
  "../assets/fonts/archivo.css",
  "../assets/fonts/files/archivo-latin-400-normal.woff2",
  "../assets/fonts/files/archivo-latin-500-normal.woff2",
  "../assets/fonts/files/archivo-latin-600-normal.woff2",
  "../assets/fonts/files/archivo-latin-700-normal.woff2",
  "../assets/fonts/files/archivo-latin-800-normal.woff2",
];

self.addEventListener("install", function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ESQUELETO); }).catch(function () {}));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.map(function (k) { return k !== CACHE && k.indexOf("mt-app-") === 0 ? caches.delete(k) : null; }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return; // nuvem e vídeos passam direto
  e.respondWith(
    fetch(req).then(function (r) {
      if (r && r.ok) { var cp = r.clone(); caches.open(CACHE).then(function (c) { c.put(req, cp); }); }
      return r;
    }).catch(function () {
      return caches.match(req).then(function (c) { return c || caches.match("index.html"); });
    })
  );
});

self.addEventListener("push", function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) {}
  e.waitUntil(self.registration.showNotification(d.t || "TORQUE FIT", {
    body: d.b || "",
    icon: "../assets/icons/icon-192.png",
    badge: "../assets/icons/icon-192.png",
  }));
});
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: "window" }).then(function (lista) {
    if (lista.length) return lista[0].focus();
    return clients.openWindow("./");
  }));
});
