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
  var portalBase = new URL("../", document.currentScript && document.currentScript.src || new URL("assets/pwa-update.js", location.href).href);
  var portalWorker = new URL("sw.js", portalBase);

  window.addEventListener("load", function () {
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then(function (reg) {
      // update() devolve promessa e falha sozinha em aba fechando/rede caída —
      // sem o catch vira erro solto no console
      if (reg.update) { try { var p = reg.update(); if (p && p.catch) p.catch(function () {}); } catch (e) {} }
    }).catch(function () {});
  });

  // versão nova assumiu o controle? recarrega uma vez, pra página e scripts
  // ficarem do mesmo lote
  /* v747: mas só quando a página está OCIOSA — sem campo de texto focado e
   * sem envio pendente pra nuvem. Antes o reload vinha no meio de uma
   * anamnese, e com pendência de sync o beforeunload do painel abria um
   * "sair da página?" do nada. Fica tentando a cada 5 s até poder. */
  function ocioso() {
    try {
      var a = document.activeElement;
      if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== "checkbox" && a.type !== "radio" && a.type !== "button") return false;
      // Edição de variantes, análise de vídeo e jornadas podem continuar
      // depois que o campo perde o foco. Não interromper modal ou envio.
      if (document.querySelector('dialog[open]')) return false;
      var pending = document.querySelectorAll('[data-j-create], [data-j-complete]:disabled, [data-send]:disabled, [data-answer]:disabled');
      if (Array.prototype.some.call(pending, function (el) { return el.getClientRects().length > 0; })) return false;
      if (Array.prototype.some.call(document.querySelectorAll('video,audio'), function (media) { return !media.paused && !media.ended; })) return false;
      var st = window.__MTSync && window.__MTSync._estado;
      if (st && st.sujas && Object.keys(st.sujas).length) return false;
    } catch (e) {}
    return true;
  }
  window.MT_PWA_OCIOSO = ocioso; // teste
  if (navigator.serviceWorker.controller) {
    var recarregou = false;
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (recarregou) return;
      recarregou = true;
      (function tenta() {
        if (ocioso()) { location.reload(); return; }
        setTimeout(tenta, 5000);
      })();
    });
  }

  /* Reinstala somente o código deste portal. O app do aluno, outros produtos,
   * os recursos pesados sem versão, dados e filas não pertencem a esta limpeza. */
  window.MT_ATUALIZA = function () {
    var limpa = (typeof caches === "undefined") ? Promise.resolve() :
      caches.keys().then(function (ks) {
        return Promise.all(ks.filter(function (k) { return /^(precache|runtime)-mt-v\d+$/.test(k); })
          .map(function (k) { return caches.delete(k); }));
      });
    return limpa.then(function () {
      return navigator.serviceWorker.getRegistrations();
    }).then(function (regs) {
      return Promise.all(regs.filter(function (r) {
        if (r.scope !== portalBase.href) return false;
        return [r.active, r.waiting, r.installing].some(function (worker) {
          if (!worker) return false;
          try { var url = new URL(worker.scriptURL); return url.origin === portalWorker.origin && url.pathname === portalWorker.pathname; }
          catch (e) { return false; }
        });
      }).map(function (r) { return r.unregister(); }));
    }).catch(function () {}).then(function () {
      location.reload();
    });
  };
})();
