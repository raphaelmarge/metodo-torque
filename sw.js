/* Service worker do Método Torque.
 * Estratégia: network-first para HTML (conteúdo sempre atualizado quando há
 * internet), cache-first para o restante. Tudo é pré-cacheado na instalação,
 * então o app inteiro funciona offline. Ao publicar conteúdo novo, incremente
 * VERSION para forçar a atualização do cache. */
const VERSION = 'torque-v1';

const PAGES = [
  'index.html',
  'Apostilas - Índice.dc.html',
  'Método Torque - Deck.dc.html',
  'Apostila - Módulo 1.dc.html',
  'Apostila - Módulo 2.dc.html',
  'Apostila - Módulo 3.dc.html',
  'Apostila - Módulo 4.dc.html',
  'Apostila - Módulo 5.dc.html',
  'Apostila - Módulo 6.dc.html',
  'Apostila - Módulo 7.dc.html',
  'Apostila - Módulo 8.dc.html',
  'Apostila - Módulo Bônus.dc.html',
  'Diagnóstico 360.dc.html',
  'Planilha dos 7 Números.dc.html',
  'Planilha DRE Academia.dc.html',
  'Calculadora de Precificação.dc.html',
  'Planilha de Funil Comercial.dc.html',
  'Script de Vendas.dc.html',
  'Régua de Cobrança WhatsApp.dc.html',
  'Régua de Retenção WhatsApp.dc.html',
  'Onboarding 90 Dias.dc.html',
  'Briefing de Delegação.dc.html',
  'Pauta da Reunião Semanal.dc.html',
  'Checklists de Abertura e Fechamento.dc.html',
  'Controle de Manutenção e Limpeza.dc.html',
  'Inventário de Equipamentos.dc.html',
  'Calendário Anual de Campanhas.dc.html',
];

const ASSETS = [
  'support.js',
  'doc-page.js',
  'deck-stage.js',
  'image-slot.js',
  'app.js',
  'mobile.css',
  'vendor/react.production.min.js',
  'vendor/react-dom.production.min.js',
  'vendor/babel.min.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-48.png',
];

const PRECACHE = [...PAGES, ...ASSETS].map((p) => encodeURI('./' + p));

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Fontes do Google: cache-first oportunista para funcionarem offline.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(VERSION).then((cache) => cache.put(req, copy));
            return res;
          })
      )
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  const isHTML = req.mode === 'navigate' || url.pathname.endsWith('.html');
  if (isHTML) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match(encodeURI('./index.html'))))
    );
  } else {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(VERSION).then((cache) => cache.put(req, copy));
            return res;
          })
      )
    );
  }
});
