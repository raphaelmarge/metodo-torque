/* Portal Método Torque — controle de acesso.
 *
 * Dois modos, decididos por assets/cloud-config.js:
 *  - NUVEM (MT_CLOUD preenchido): login com e-mail e senha via Supabase.
 *    Criar conta exige o código de acesso. Sessão vale em qualquer aparelho
 *    e os dados dos programas sincronizam online (ver apps/store.js).
 *  - LOCAL (MT_CLOUD vazio): código de acesso + cadastro salvo no aparelho. */
(function () {
  "use strict";

  var ACESSO = window.MT_ACCESS || { exigirCadastro: false, codigos: [] };
  var NUVEM = window.MT_CLOUD && window.MT_CLOUD.url && window.MT_CLOUD.anonKey;
  var LS_PERFIL = "mtapp:perfil";

  var $ = function (id) { return document.getElementById(id); };
  var gate = $("gate");

  function getPerfil() {
    try { return JSON.parse(localStorage.getItem(LS_PERFIL)); } catch (e) { return null; }
  }
  function setPerfil(p) { localStorage.setItem(LS_PERFIL, JSON.stringify(p)); }

  function sha256(txt) {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(txt)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) {
        return ("0" + b.toString(16)).slice(-2);
      }).join("");
    });
  }

  function erro(msg) {
    var el = $("gateErro");
    el.textContent = msg;
    el.className = "gate-erro";
    el.hidden = false;
  }
  function aviso(msg) {
    var el = $("gateErro");
    el.textContent = msg;
    el.className = "gate-ok";
    el.hidden = false;
  }

  function abreGate() { gate.hidden = false; document.body.classList.add("gated"); }
  function fechaGate() {
    gate.hidden = true;
    document.body.classList.remove("gated");
    if (window.MT_onAcesso) window.MT_onAcesso();
    if (window.MTStore && window.MTStore.iniciaSync) window.MTStore.iniciaSync();
  }

  window.MT_perfil = getPerfil;

  // ===================== MODO NUVEM (login com senha) =====================
  if (NUVEM) {
    var sb = window.supabase.createClient(window.MT_CLOUD.url, window.MT_CLOUD.anonKey);
    window.MT_supabase = sb;

    var aba = "entrar";
    $("gateAbas").hidden = false;
    $("gateEsqueci").hidden = false;

    function aplicaAba() {
      var criar = aba === "criar";
      $("cCodigo").hidden = !criar;
      $("cNome").hidden = !criar;
      $("cZap").hidden = !criar;
      $("cSenha").hidden = false;
      $("gCodigo").required = criar && ACESSO.exigirCadastro;
      $("gNome").required = criar;
      $("gSenha").required = true;
      $("gateIntro").textContent = criar
        ? "Crie sua conta com o código de acesso que você recebeu na compra. Você poderá entrar de qualquer aparelho."
        : "Entre com seu e-mail e senha. Seus dados de gestão sincronizam automaticamente entre os aparelhos.";
      $("gateBtn").textContent = criar ? "Criar conta →" : "Entrar →";
      $("gateRodape").textContent = criar
        ? "Não tem código? Fale com o suporte do Método Torque."
        : "Primeira vez aqui? Toque em Criar conta.";
      $("gateErro").hidden = true;
      Array.prototype.forEach.call($("gateAbas").querySelectorAll("button"), function (b) {
        b.classList.toggle("ativa", b.getAttribute("data-aba") === aba);
      });
    }
    $("gateAbas").addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      aba = b.getAttribute("data-aba");
      aplicaAba();
    });
    aplicaAba();

    function sessaoOk(user) {
      var meta = (user && user.user_metadata) || {};
      setPerfil({
        nome: meta.nome || (user.email || "").split("@")[0],
        email: user.email || "",
        zap: meta.zap || "",
        nuvem: true,
        desde: (user.created_at || "").slice(0, 10),
      });
      fechaGate();
    }

    window.MT_sair = function () {
      if (!confirm("Sair da sua conta neste aparelho?")) return;
      sb.auth.signOut().finally(function () {
        localStorage.removeItem(LS_PERFIL);
        location.reload();
      });
    };

    $("gateForm").addEventListener("submit", function (e) {
      e.preventDefault();
      $("gateErro").hidden = true;
      var email = $("gEmail").value.trim();
      var senha = $("gSenha").value;
      $("gateBtn").disabled = true;
      var fim = function () { $("gateBtn").disabled = false; };

      if (aba === "entrar") {
        sb.auth.signInWithPassword({ email: email, password: senha }).then(function (r) {
          fim();
          if (r.error) {
            erro(r.error.message === "Invalid login credentials"
              ? "E-mail ou senha incorretos." : "Não foi possível entrar: " + r.error.message);
            return;
          }
          sessaoOk(r.data.user);
        }, function () { fim(); erro("Sem conexão. Tente de novo."); });
        return;
      }

      // criar conta: valida o código de acesso antes
      var codigo = $("gCodigo").value.trim();
      var valida = ACESSO.exigirCadastro
        ? sha256(codigo).then(function (h) { return ACESSO.codigos.indexOf(h) !== -1; })
        : Promise.resolve(true);
      valida.then(function (ok) {
        if (!ok) { fim(); erro("Código de acesso inválido. Confira com quem te passou o acesso."); return; }
        sb.auth.signUp({
          email: email,
          password: senha,
          options: { data: { nome: $("gNome").value.trim(), zap: $("gZap").value.trim() } },
        }).then(function (r) {
          fim();
          if (r.error) {
            erro(/already registered/i.test(r.error.message)
              ? "Este e-mail já tem conta — use a aba Entrar." : "Não foi possível criar a conta: " + r.error.message);
            return;
          }
          if (r.data.session) { sessaoOk(r.data.user); return; }
          aviso("Conta criada! Confirme o link que enviamos para o seu e-mail e depois entre na aba Entrar.");
          aba = "entrar";
          setTimeout(aplicaAba, 3500);
        }, function () { fim(); erro("Sem conexão. Tente de novo."); });
      });
    });

    $("gateEsqueci").addEventListener("click", function () {
      var email = $("gEmail").value.trim();
      if (!email) { erro("Digite seu e-mail acima e toque de novo em Esqueci minha senha."); return; }
      sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }).then(function (r) {
        if (r.error) erro("Não deu: " + r.error.message);
        else aviso("Enviamos um link de redefinição para " + email + ".");
      });
    });

    // sessão existente? entra direto; senão mostra o gate
    sb.auth.getSession().then(function (r) {
      var sess = r.data && r.data.session;
      if (sess && sess.user) sessaoOk(sess.user);
      else { localStorage.removeItem(LS_PERFIL); abreGate(); }
    }, function () {
      // sem rede: se já entrou antes neste aparelho, deixa usar offline
      if (getPerfil()) fechaGate(); else abreGate();
    });
    return;
  }

  // ===================== MODO LOCAL (código de acesso) =====================
  window.MT_sair = function () {
    if (!confirm("Sair do portal neste aparelho?")) return;
    localStorage.removeItem(LS_PERFIL);
    location.reload();
  };

  if (!ACESSO.exigirCadastro || getPerfil()) {
    if (gate) gate.hidden = true;
    if (window.MT_onAcesso) window.MT_onAcesso();
    return;
  }

  // campos obrigatórios do modo local
  $("gCodigo").required = true;
  $("gNome").required = true;
  abreGate();

  $("gateForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var codigo = $("gCodigo").value.trim();
    sha256(codigo).then(function (hash) {
      if (ACESSO.codigos.indexOf(hash) === -1) {
        erro("Código de acesso inválido. Confira com quem te passou o acesso.");
        return;
      }
      var perfil = { nome: $("gNome").value.trim(), email: $("gEmail").value.trim(), zap: $("gZap").value.trim(), desde: new Date().toISOString().slice(0, 10) };
      setPerfil(perfil);
      if (ACESSO.notificarEmail) {
        fetch("https://formsubmit.co/ajax/" + encodeURIComponent(ACESSO.notificarEmail), {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ _subject: "Novo cadastro no portal Método Torque", nome: perfil.nome, email: perfil.email, whatsapp: perfil.zap, data: perfil.desde }),
        }).catch(function () {});
      }
      fechaGate();
    });
  });
})();
