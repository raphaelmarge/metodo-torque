// 🔁 Mensalidade no cartão (Pagar.me) — módulo compartilhado dos produtos
//
// Como funciona (e por que é seguro):
//   1. O personal/nutri abre o dialog e o cliente digita o cartão.
//   2. O NÚMERO do cartão vai DIRETO pro Pagar.me (tokenização no navegador,
//      certificado PCI) — a nossa nuvem NUNCA vê nem guarda o número.
//   3. Só o card_token volta e vai pra função "pagarme" (Supabase), que cria
//      a assinatura mensal com a chave secreta (que também nunca sai de lá).
//
// API: self.MT_cartaoRec = { abre(opts), status(id), cancela(id) }
//   abre({ valor, descricao, nome, email, zap, cor, onOk(d) })
(function () {
  "use strict";

  var dlg = null;     // <dialog> criado uma vez e reusado
  var aberto = null;  // opts da abertura atual

  function $id(i) { return document.getElementById(i); }

  function fmtBRL(v) {
    try { return window.MTStore.fmtBRL(+v || 0); }
    catch (e) { return "R$ " + (+v || 0).toFixed(2).replace(".", ","); }
  }

  function criaDialog() {
    if (dlg) return dlg;
    dlg = document.createElement("dialog");
    dlg.id = "dlgCartaoRec";
    dlg.style.cssText = "background:#1c1826;border:1px solid #2c2739;border-radius:14px;color:#eceaf2;max-width:420px;width:calc(100vw - 40px);padding:20px;font:inherit;";
    var inp = "width:100%;margin-top:4px;background:#14121a;border:1px solid #2c2739;border-radius:10px;color:#eceaf2;padding:10px 12px;font-size:15px;box-sizing:border-box;";
    var lab = "display:block;font-size:12.5px;color:#a9a4b5;margin:10px 0 0;";
    dlg.innerHTML =
      "<h3 style='margin:0 0 4px;font-size:17px;'>🔁 Mensalidade no cartão</h3>" +
      "<p id='crResumo' style='margin:0 0 4px;font-size:13px;color:#a9a4b5;'></p>" +
      "<label style='" + lab + "'>Número do cartão<input id='crNumero' inputmode='numeric' autocomplete='cc-number' placeholder='0000 0000 0000 0000' style='" + inp + "'></label>" +
      "<label style='" + lab + "'>Nome impresso no cartão<input id='crNome' autocomplete='cc-name' style='" + inp + "'></label>" +
      "<div style='display:flex;gap:10px;'>" +
        "<label style='" + lab + "flex:1;'>Validade (MM/AA)<input id='crVal' inputmode='numeric' autocomplete='cc-exp' placeholder='MM/AA' style='" + inp + "'></label>" +
        "<label style='" + lab + "flex:1;'>CVV<input id='crCvv' inputmode='numeric' autocomplete='cc-csc' placeholder='123' style='" + inp + "'></label>" +
      "</div>" +
      "<label style='" + lab + "'>CPF do titular (só números)<input id='crCpf' inputmode='numeric' placeholder='00000000000' style='" + inp + "'></label>" +
      "<label style='" + lab + "'>E-mail<input id='crEmail' type='email' autocomplete='email' style='" + inp + "'></label>" +
      "<div id='crErro' style='display:none;margin-top:10px;padding:8px 10px;border-radius:10px;background:#3a1c24;color:#fda4af;font-size:12.5px;'></div>" +
      "<button id='crEnviar' style='margin-top:14px;width:100%;border:0;border-radius:10px;padding:12px;font-weight:800;font-size:14.5px;color:#fff;cursor:pointer;'>Ativar mensalidade no cartão 🔁</button>" +
      "<button id='crFechar' style='margin-top:8px;width:100%;background:none;border:1px solid #2c2739;border-radius:10px;padding:9px;color:#a9a4b5;font-size:13px;cursor:pointer;'>✕ fechar</button>" +
      "<p style='margin:10px 0 0;font-size:11px;color:#8a8695;'>🔒 Seus dados do cartão vão direto pro Pagar.me (certificado PCI) — o TORQUE ON nunca vê nem guarda o número.</p>";
    document.body.appendChild(dlg);

    // número em blocos de 4 (13 a 19 dígitos)
    $id("crNumero").addEventListener("input", function () {
      var d = this.value.replace(/\D/g, "").slice(0, 19);
      this.value = d.replace(/(\d{4})(?=\d)/g, "$1 ");
    });
    // validade sempre no formato MM/AA
    $id("crVal").addEventListener("input", function () {
      var d = this.value.replace(/\D/g, "").slice(0, 4);
      this.value = d.length > 2 ? d.slice(0, 2) + "/" + d.slice(2) : d;
    });
    $id("crCvv").addEventListener("input", function () { this.value = this.value.replace(/\D/g, "").slice(0, 4); });
    $id("crCpf").addEventListener("input", function () { this.value = this.value.replace(/\D/g, "").slice(0, 11); });
    $id("crFechar").addEventListener("click", function () { dlg.close(); });
    $id("crEnviar").addEventListener("click", enviar);
    // defesa extra: fechou o dialog (sucesso, ✕ ou Esc) → nada do cartão fica nos campos
    dlg.addEventListener("close", function () {
      ["crNumero", "crVal", "crCvv", "crCpf"].forEach(function (id) { var el = $id(id); if (el) el.value = ""; });
    });
    return dlg;
  }

  function mostraErro(msg) {
    var e = $id("crErro");
    e.textContent = msg;
    e.style.display = "block";
  }

  function enviar() {
    var API = self.MT_cartaoRec;
    var opts = aberto || {};
    var numero = $id("crNumero").value.replace(/\D/g, "");
    var nome = $id("crNome").value.trim();
    var val = $id("crVal").value.trim();
    var cvv = $id("crCvv").value.trim();
    var cpf = $id("crCpf").value.replace(/\D/g, "");
    var email = $id("crEmail").value.trim();
    $id("crErro").style.display = "none";
    if (numero.length < 13 || numero.length > 19) { mostraErro("Confere o número do cartão — ele tem entre 13 e 19 dígitos."); return; }
    var m = val.match(/^(\d{2})\/(\d{2})$/);
    if (!m || +m[1] < 1 || +m[1] > 12) { mostraErro("Validade no formato MM/AA (ex.: 12/30)."); return; }
    var expMes = +m[1], expAno = +("20" + m[2]);
    var hoje = new Date();
    if (expAno < hoje.getFullYear() || (expAno === hoje.getFullYear() && expMes < hoje.getMonth() + 1)) { mostraErro("Esse cartão já venceu — confere a validade."); return; }
    if (!/^\d{3,4}$/.test(cvv)) { mostraErro("CVV é o código de 3 ou 4 números atrás do cartão."); return; }
    if (!nome) { mostraErro("Escreve o nome como está impresso no cartão."); return; }
    if (cpf.length !== 11) { mostraErro("CPF do titular com os 11 números, sem pontos nem traço."); return; }

    var b = $id("crEnviar");
    b.disabled = true;
    b.textContent = "⏳ Ativando…";
    function libera() { b.disabled = false; b.textContent = "Ativar mensalidade no cartão 🔁"; }

    API._chama({ acao: "chave_publica" }).then(function (r) {
      if (!r || r.erro || !r.publicKey) {
        libera();
        mostraErro((r && r.erro) || "A função pagarme ainda não está publicada na nuvem.");
        return;
      }
      API._tokeniza(r.publicKey, { number: numero, holder_name: nome, exp_month: expMes, exp_year: expAno, cvv: cvv }).then(function (token) {
        if (!token || !token.id) { libera(); mostraErro("Cartão recusado na validação — confere os dados."); return; }
        API._chama({
          acao: "assinar",
          card_token: token.id,
          valorCentavos: Math.round((+opts.valor || 0) * 100),
          descricao: opts.descricao,
          nome: nome,
          email: email,
          documento: cpf,
        }).then(function (d) {
          libera();
          if (d && d.ok) {
            dlg.close();
            if (opts.onOk) opts.onOk(d);
          } else {
            mostraErro((d && d.erro) || "Não deu pra ativar agora — tenta de novo em instantes.");
          }
        });
      }, function () { libera(); mostraErro("Sem conexão com o Pagar.me agora — tenta de novo."); });
    });
  }

  self.MT_cartaoRec = {
    // abre o dialog do cartão: opts = { valor (R$), descricao, nome, email, zap, cor, onOk(d) }
    abre: function (opts) {
      opts = opts || {};
      criaDialog();
      aberto = opts;
      var cor = /^#[0-9a-fA-F]{6}$/.test(String(opts.cor || "")) ? opts.cor : "#7c3aed";
      $id("crEnviar").style.background = cor;
      $id("crResumo").textContent = (opts.descricao || "Mensalidade") + " — " + fmtBRL(opts.valor) + " por mês, cobrado direto no cartão.";
      $id("crNumero").value = "";
      $id("crVal").value = "";
      $id("crCvv").value = "";
      $id("crCpf").value = "";
      $id("crNome").value = opts.nome || "";
      $id("crEmail").value = opts.email || "";
      $id("crErro").style.display = "none";
      var b = $id("crEnviar");
      b.disabled = false;
      b.textContent = "Ativar mensalidade no cartão 🔁";
      dlg.showModal();
    },
    // consulta o status da assinatura na nuvem → Promise<json>
    status: function (assinaturaId) {
      return this._chama({ acao: "assinatura_status", assinaturaId: assinaturaId });
    },
    // cancela a assinatura na nuvem → Promise<json>
    cancela: function (assinaturaId) {
      return this._chama({ acao: "assinatura_cancela", assinaturaId: assinaturaId });
    },
    // chama a função "pagarme" da nuvem (precisa estar logado)
    _chama: function (corpo) {
      var nuvem = window.MTStore && window.MTStore.cloud && window.MTStore.cloud();
      var cfg = self.MT_CLOUD || {};
      if (!nuvem || !cfg.url) return Promise.resolve({ erro: "Entre na sua conta pra usar a assinatura no cartão." });
      // MT_FUNCAO renova o crachá do login antes de chamar e tenta de novo se o
      // Supabase recusar — sem isso, painel aberto há mais de 1 hora dava 401
      return self.MT_FUNCAO.chama(nuvem.client, "pagarme", corpo, "A assinatura no cartão")
        .catch(function () { return { erro: "Sem conexão com a nuvem agora." }; });
    },
    // tokeniza o cartão DIRETO no Pagar.me (o número nunca passa pela nossa nuvem)
    _tokeniza: function (pk, cartao) {
      return fetch("https://api.pagar.me/core/v5/tokens?appId=" + encodeURIComponent(pk), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "card", card: cartao }),
      }).then(function (r) { return r.json(); });
    },
  };
  window.__cartaoRec = self.MT_cartaoRec; // testes
})();
