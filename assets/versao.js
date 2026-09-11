/* Versão do pacote TORQUE ON — um lugar só.
 *
 * O sw.js importa daqui e as telas mostram o número, pra dar pra saber num
 * relance qual versão está rodando no aparelho. Sem isso, "já corrigi" e "aqui
 * continua igual" viram uma discussão sem prova: o celular pode estar servindo
 * uma versão velha e ninguém enxerga.
 */
(function (raiz) {
  raiz.MT_VERSAO = "mt-v821";
  /* v821: fechamento do relatório Torque Personal 08/09. O arquivo também é
   * importado pelo service worker; por isso a camada de UI só é carregada em
   * documentos do Personal/demo ou do app do aluno. */
  if (typeof document !== "undefined" && !document.getElementById("mt-r809-js")) {
    var p = location.pathname || "";
    var app = p.indexOf("/app/") >= 0;
    var personal = /\/(?:demo-)?personal\.html$/.test(p) || /\/(?:demo-)?personal\.html[/?#]/.test(p);
    if (app || personal) {
      var s = document.createElement("script");
      s.id = "mt-r809-js";
      s.src = (app ? "../" : "") + "assets/relatorio-0809.js?v=" + raiz.MT_VERSAO;
      s.defer = true;
      (document.head || document.documentElement).appendChild(s);
    }
  }
})(typeof self !== "undefined" ? self : this);