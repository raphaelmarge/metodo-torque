/* Registro e atualização do service worker nas páginas de produto.
 *
 * Isto vivia SÓ no portal (assets/app.js). Quem instala o TORQUE PERSONAL ou o
 * TORQUE NUTRI na tela inicial abre direto a página do produto, que nunca
 * pedia "procura versão nova" — o aparelho ficava preso na versão antiga dos
 * arquivos de apoio (os .js do precache são servidos do cache primeiro), então
 * dava pra ver a página nova rodando script velho. Correção publicada e
 * problema que continua igual no celular: era isso.
 */
(function () {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;

  window.addEventListener("load", function () {
    navigator.serviceWorker.register("sw.js").then(function (reg) {
      // update() devolve promessa e falha sozinha em aba fechando/rede caída —
      // sem o catch vira erro solto no console
      if (reg.update) { try { var p = reg.update(); if (p && p.catch) p.catch(function () {}); } catch (e) {} }
    }).catch(function () {});
  });

  // versão nova assumiu o controle? recarrega uma vez, pra página e scripts
  // ficarem do mesmo lote
  if (navigator.serviceWorker.controller) {
    var recarregou = false;
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (recarregou) return;
      recarregou = true;
      location.reload();
    });
  }

  /* Saída de emergência: apaga tudo que está guardado e começa do zero. Os
   * ~17 MB do leitor de imagem ficam, porque baixar de novo num celular no 4G
   * é castigo — e eles não têm versão pra ficar velha. */
  window.MT_ATUALIZA = function () {
    var guardar = "mt-visao-v1";
    var limpa = (typeof caches === "undefined") ? Promise.resolve() :
      caches.keys().then(function (ks) {
        return Promise.all(ks.map(function (k) { return k === guardar ? null : caches.delete(k); }));
      });
    return limpa.then(function () {
      return navigator.serviceWorker.getRegistrations();
    }).then(function (regs) {
      return Promise.all(regs.map(function (r) { return r.unregister(); }));
    }).catch(function () {}).then(function () {
      location.reload();
    });
  };
})();
