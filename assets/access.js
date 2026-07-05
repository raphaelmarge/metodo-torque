/* Portal Método Torque — cadastro com código de acesso.
 * Proteção leve, sem servidor: o código digitado é comparado por hash SHA-256
 * com a lista em access-config.js; o perfil do aluno fica salvo no navegador. */
(function () {
  "use strict";

  var CFG = window.MT_ACCESS || { exigirCadastro: false, codigos: [] };
  var LS_PERFIL = "mtapp:perfil";

  function getPerfil() {
    try { return JSON.parse(localStorage.getItem(LS_PERFIL)); } catch (e) { return null; }
  }

  function sha256(txt) {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(txt)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) {
        return ("0" + b.toString(16)).slice(-2);
      }).join("");
    });
  }

  var gate = document.getElementById("gate");
  var $ = function (id) { return document.getElementById(id); };

  function abreGate() {
    gate.hidden = false;
    document.body.classList.add("gated");
  }
  function fechaGate() {
    gate.hidden = true;
    document.body.classList.remove("gated");
    if (window.MT_onAcesso) window.MT_onAcesso();
  }

  window.MT_perfil = getPerfil;
  window.MT_sair = function () {
    if (!confirm("Sair do portal neste aparelho?")) return;
    localStorage.removeItem(LS_PERFIL);
    location.reload();
  };

  if (!CFG.exigirCadastro || getPerfil()) {
    // acesso liberado
    if (gate) gate.hidden = true;
    return;
  }

  abreGate();

  $("gateForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var codigo = $("gCodigo").value.trim();
    var nome = $("gNome").value.trim();
    var email = $("gEmail").value.trim();
    var zap = $("gZap").value.trim();
    var erro = $("gateErro");
    erro.hidden = true;

    sha256(codigo).then(function (hash) {
      if (CFG.codigos.indexOf(hash) === -1) {
        erro.textContent = "Código de acesso inválido. Confira com quem te passou o acesso.";
        erro.hidden = false;
        return;
      }
      var perfil = { nome: nome, email: email, zap: zap, desde: new Date().toISOString().slice(0, 10) };
      localStorage.setItem(LS_PERFIL, JSON.stringify(perfil));

      // notificação opcional do cadastro por e-mail (formsubmit.co)
      if (CFG.notificarEmail) {
        fetch("https://formsubmit.co/ajax/" + encodeURIComponent(CFG.notificarEmail), {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ _subject: "Novo cadastro no portal Método Torque", nome: nome, email: email, whatsapp: zap, data: perfil.desde }),
        }).catch(function () {});
      }
      fechaGate();
    });
  });
})();
