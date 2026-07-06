/* Portal Método Torque — controle de acesso.
 *
 * Modo NUVEM (MT_CLOUD preenchido): login com e-mail e senha via Supabase,
 * organizado por ACADEMIA — o dono cria a academia (com o código de acesso
 * do curso) e recebe um código da equipe; funcionários criam login próprio
 * com esse código. Os dados sincronizam por academia, sem misturar.
 *
 * Modo LOCAL (MT_CLOUD vazio): código de acesso + cadastro salvo no aparelho. */
(function () {
  "use strict";

  var ACESSO = window.MT_ACCESS || { exigirCadastro: false, codigos: [] };
  var NUVEM = window.MT_CLOUD && window.MT_CLOUD.url && window.MT_CLOUD.anonKey;
  var LS_PERFIL = "mtapp:perfil";
  var LS_ACAD = "mtapp:academia";
  var LS_INTENTO = "mtapp:intento";

  var $ = function (id) { return document.getElementById(id); };
  var gate = $("gate");

  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function lsSet(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

  function sha256(txt) {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(txt)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) {
        return ("0" + b.toString(16)).slice(-2);
      }).join("");
    });
  }

  function erro(msg) { var el = $("gateErro"); el.textContent = msg; el.className = "gate-erro"; el.hidden = false; }
  function aviso(msg) { var el = $("gateErro"); el.textContent = msg; el.className = "gate-ok"; el.hidden = false; }

  function abreGate() { gate.hidden = false; document.body.classList.add("gated"); }
  function fechaGate() {
    gate.hidden = true;
    document.body.classList.remove("gated");
    if (window.MT_onAcesso) window.MT_onAcesso();
    if (window.MTStore && window.MTStore.iniciaSync) window.MTStore.iniciaSync();
  }

  window.MT_perfil = function () { return lsGet(LS_PERFIL); };
  window.MT_academia = function () { return lsGet(LS_ACAD); };

  // ===================== MODO NUVEM =====================
  if (NUVEM) {
    var sb = window.MT_supabase || window.supabase.createClient(window.MT_CLOUD.url, window.MT_CLOUD.anonKey);
    window.MT_supabase = sb;

    var aba = "entrar";
    var vinculando = false; // logado mas ainda sem academia
    $("gateAbas").hidden = false;

    function aplicaAba() {
      var criar = aba === "criar", equipe = aba === "equipe", entrar = aba === "entrar";
      $("cCodigo").hidden = !criar;
      $("cAcademia").hidden = !criar;
      $("cEquipe").hidden = !equipe;
      $("cNome").hidden = entrar;
      $("cZap").hidden = entrar;
      $("cEmail").hidden = vinculando;
      $("cSenha").hidden = vinculando;
      $("gateEsqueci").hidden = !entrar || vinculando;

      $("gCodigo").required = criar && ACESSO.exigirCadastro;
      $("gAcademia").required = criar;
      $("gEquipe").required = equipe;
      $("gNome").required = !entrar;
      $("gEmail").required = !vinculando;
      $("gSenha").required = !vinculando;

      $("gateIntro").textContent = vinculando
        ? "Sua conta ainda não está ligada a uma academia. Crie a sua academia ou entre na equipe de uma existente."
        : criar ? "Para o DONO: crie a conta da sua academia com o código de acesso do curso. Você recebe um código da equipe para cadastrar seus funcionários."
        : equipe ? "Para a EQUIPE: crie seu login com o código da equipe que o dono da academia te passou."
        : "Entre com seu e-mail e senha. Os dados da sua academia sincronizam em todos os aparelhos.";
      $("gateBtn").textContent = vinculando ? "Vincular →" : criar ? "Criar academia →" : equipe ? "Entrar na equipe →" : "Entrar →";
      $("gateRodape").textContent = criar ? "Não tem o código do curso? Fale com o suporte do Método Torque."
        : equipe ? "Sem o código da equipe? Peça ao dono ou gerente da academia."
        : "Primeira vez? Use Criar academia (dono) ou Sou da equipe (funcionário).";
      $("gateErro").hidden = true;
      Array.prototype.forEach.call($("gateAbas").querySelectorAll("button"), function (b) {
        var a = b.getAttribute("data-aba");
        b.classList.toggle("ativa", a === aba);
        b.style.display = vinculando && a === "entrar" ? "none" : "";
      });
    }
    $("gateAbas").addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      aba = b.getAttribute("data-aba");
      aplicaAba();
    });
    aplicaAba();

    function salvaPerfil(user, membro) {
      var meta = (user && user.user_metadata) || {};
      lsSet(LS_PERFIL, {
        nome: (membro && membro.nome) || meta.nome || (user.email || "").split("@")[0],
        email: user.email || "",
        zap: meta.zap || "",
        papel: membro ? membro.papel : "",
        nuvem: true,
      });
    }

    // confere/estabelece o vínculo com uma academia
    function garanteVinculo(user) {
      return sb.from("membros").select("academia_id, papel, nome, academias(nome, codigo_equipe)").then(function (r) {
        var m = r.data && r.data[0];
        if (m) {
          lsSet(LS_ACAD, {
            id: m.academia_id, papel: m.papel,
            nome: (m.academias && m.academias.nome) || "",
            codigo_equipe: m.papel === "dono" && m.academias ? m.academias.codigo_equipe : "",
          });
          salvaPerfil(user, m);
          localStorage.removeItem(LS_INTENTO);
          fechaGate();
          return;
        }
        // sem vínculo ainda: executa a intenção guardada no cadastro, se houver
        var intento = lsGet(LS_INTENTO);
        if (intento) {
          var rpc = intento.tipo === "criar"
            ? sb.rpc("criar_academia", { p_nome_academia: intento.academia, p_nome_membro: intento.nome })
            : sb.rpc("entrar_na_equipe", { p_codigo: intento.codigo, p_nome: intento.nome });
          return rpc.then(function (rr) {
            localStorage.removeItem(LS_INTENTO);
            if (rr.error) { modoVincular("Não foi possível vincular: " + rr.error.message); return; }
            return garanteVinculo(user);
          });
        }
        modoVincular();
      }, function () {
        // sem rede: se já teve vínculo neste aparelho, segue offline
        if (lsGet(LS_ACAD)) { salvaPerfil(user, null); fechaGate(); }
        else modoVincular("Sem conexão para verificar sua academia. Tente de novo.");
      });
    }

    function modoVincular(msg) {
      vinculando = true;
      aba = "criar";
      abreGate();
      aplicaAba();
      if (msg) erro(msg);
    }

    window.MT_sair = function () {
      if (!confirm("Sair da sua conta neste aparelho?")) return;
      sb.auth.signOut().finally(function () {
        localStorage.removeItem(LS_PERFIL);
        localStorage.removeItem(LS_ACAD);
        localStorage.removeItem(LS_INTENTO);
        location.reload();
      });
    };

    $("gateForm").addEventListener("submit", function (e) {
      e.preventDefault();
      $("gateErro").hidden = true;
      $("gateBtn").disabled = true;
      var fim = function () { $("gateBtn").disabled = false; };
      var nome = $("gNome").value.trim();

      // já logado, só vinculando a academia
      if (vinculando) {
        var acao;
        if (aba === "criar") {
          var validaCurso = ACESSO.exigirCadastro
            ? sha256($("gCodigo").value.trim()).then(function (h) { return ACESSO.codigos.indexOf(h) !== -1; })
            : Promise.resolve(true);
          acao = validaCurso.then(function (ok) {
            if (!ok) throw new Error("Código de acesso do curso inválido.");
            return sb.rpc("criar_academia", { p_nome_academia: $("gAcademia").value.trim(), p_nome_membro: nome });
          });
        } else {
          acao = sb.rpc("entrar_na_equipe", { p_codigo: $("gEquipe").value.trim(), p_nome: nome });
        }
        acao.then(function (rr) {
          fim();
          if (rr && rr.error) { erro("Não deu: " + rr.error.message); return; }
          sb.auth.getSession().then(function (r) {
            vinculando = false;
            garanteVinculo(r.data.session.user);
          });
        }, function (err) { fim(); erro(err.message || "Não foi possível vincular."); });
        return;
      }

      var email = $("gEmail").value.trim();
      var senha = $("gSenha").value;

      if (aba === "entrar") {
        sb.auth.signInWithPassword({ email: email, password: senha }).then(function (r) {
          fim();
          if (r.error) {
            erro(r.error.message === "Invalid login credentials" ? "E-mail ou senha incorretos." : "Não foi possível entrar: " + r.error.message);
            return;
          }
          garanteVinculo(r.data.user);
        }, function () { fim(); erro("Sem conexão. Tente de novo."); });
        return;
      }

      // criar academia (dono) ou entrar na equipe (funcionário)
      var preparo;
      if (aba === "criar") {
        preparo = (ACESSO.exigirCadastro
          ? sha256($("gCodigo").value.trim()).then(function (h) { return ACESSO.codigos.indexOf(h) !== -1; })
          : Promise.resolve(true)
        ).then(function (ok) {
          if (!ok) throw new Error("Código de acesso do curso inválido. Confira com quem te passou.");
          lsSet(LS_INTENTO, { tipo: "criar", academia: $("gAcademia").value.trim(), nome: nome });
        });
      } else {
        preparo = Promise.resolve().then(function () {
          if (!$("gEquipe").value.trim()) throw new Error("Digite o código da equipe.");
          lsSet(LS_INTENTO, { tipo: "equipe", codigo: $("gEquipe").value.trim(), nome: nome });
        });
      }

      preparo.then(function () {
        return sb.auth.signUp({
          email: email, password: senha,
          options: { data: { nome: nome, zap: $("gZap").value.trim() } },
        });
      }).then(function (r) {
        fim();
        if (!r) return;
        if (r.error) {
          erro(/already registered/i.test(r.error.message) ? "Este e-mail já tem conta — use a aba Entrar." : "Não foi possível criar a conta: " + r.error.message);
          return;
        }
        if (r.data.session) { garanteVinculo(r.data.user); return; }
        aviso("Conta criada! Confirme o link enviado ao seu e-mail e depois entre na aba Entrar — o vínculo com a academia completa sozinho.");
      }, function (err) { fim(); erro(err.message || "Não foi possível criar a conta."); });
    });

    $("gateEsqueci").addEventListener("click", function () {
      var email = $("gEmail").value.trim();
      if (!email) { erro("Digite seu e-mail acima e toque de novo em Esqueci minha senha."); return; }
      sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }).then(function (r) {
        if (r.error) erro("Não deu: " + r.error.message);
        else aviso("Enviamos um link de redefinição para " + email + ".");
      });
    });

    sb.auth.getSession().then(function (r) {
      var sess = r.data && r.data.session;
      if (sess && sess.user) garanteVinculo(sess.user);
      else {
        localStorage.removeItem(LS_PERFIL);
        localStorage.removeItem(LS_ACAD);
        abreGate();
      }
    }, function () {
      if (lsGet(LS_PERFIL)) fechaGate(); else abreGate();
    });
    return;
  }

  // ===================== MODO LOCAL (código de acesso) =====================
  window.MT_sair = function () {
    if (!confirm("Sair do portal neste aparelho?")) return;
    localStorage.removeItem(LS_PERFIL);
    location.reload();
  };

  if (!ACESSO.exigirCadastro || lsGet(LS_PERFIL)) {
    if (gate) gate.hidden = true;
    if (window.MT_onAcesso) window.MT_onAcesso();
    return;
  }

  $("gCodigo").required = true;
  $("gNome").required = true;
  $("gEmail").required = true;
  abreGate();

  $("gateForm").addEventListener("submit", function (e) {
    e.preventDefault();
    sha256($("gCodigo").value.trim()).then(function (hash) {
      if (ACESSO.codigos.indexOf(hash) === -1) {
        erro("Código de acesso inválido. Confira com quem te passou o acesso.");
        return;
      }
      var perfil = { nome: $("gNome").value.trim(), email: $("gEmail").value.trim(), zap: $("gZap").value.trim(), desde: new Date().toISOString().slice(0, 10) };
      lsSet(LS_PERFIL, perfil);
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
