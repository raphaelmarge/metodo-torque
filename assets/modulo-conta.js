/* TORQUE ON — conta própria dos módulos (TORQUE PERSONAL / TORQUE NUTRI).
 * Cada produto tem a PRÓPRIA tela de entrar/criar conta, com a marca dele —
 * nada de mandar o personal ou o nutricionista para o portal da academia.
 * Por baixo, a conta continua sendo uma "ilha" exclusiva no Supabase
 * (mesma segurança/isolamento de sempre). */
self.MT_moduloConta = function (cfg) {
  "use strict";
  var NUVEM = self.MT_CLOUD && self.MT_CLOUD.url && self.MT_CLOUD.anonKey;
  var S = window.MTStore;
  var aba = "entrar";
  var recuperando = /(?:^|[&#])type=recovery(?:&|$)/.test(location.hash || "");
  var contaConhecida = false;
  try {
    var perfilConta = JSON.parse(localStorage.getItem("mtapp:perfil"));
    var identidadeConta = JSON.parse(localStorage.getItem("mtsync:identidade"));
    contaConhecida = !!((perfilConta && perfilConta.nuvem) || (identidadeConta && identidadeConta.user_id));
  } catch (e) {}
  var sb = null;
  function $(id) { return document.getElementById(id); }
  var inputCss = "width:100%;margin-bottom:8px;padding:13px;border-radius:11px;border:1px solid #3a3446;background:rgba(0,0,0,.28);color:#fff;font-family:inherit;font-size:14px;box-sizing:border-box;";

  var div = document.createElement("div");
  div.id = "gateModulo";
  div.hidden = true;
  div.style.cssText = "position:fixed;inset:0;z-index:60;background:" + cfg.fundo + ";display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto;";
  div.innerHTML =
    '<div role="dialog" aria-modal="true" aria-label="Acesso à conta" style="width:100%;max-width:400px;max-height:calc(100dvh - 40px);overflow:auto;box-sizing:border-box;background:' + cfg.cardBg + ";border:1px solid " + cfg.borda + ';border-radius:18px;padding:28px 24px;color:#fff;box-shadow:0 24px 70px -24px rgba(0,0,0,.7);">' +
    '<div style="text-align:center;margin-bottom:16px;"><span style="font-size:11px;letter-spacing:.22em;color:' + cfg.corTag + ';font-weight:700;">TORQUE ON</span>' +
    '<h2 style="font-size:24px;margin:4px 0 0;font-weight:800;color:#fff;">TORQUE <span style="color:' + cfg.corTag + ';">' + cfg.marca + "</span></h2>" +
    '<p style="color:#9b96a8;font-size:13px;margin-top:6px;line-height:1.5;">' + cfg.sub + "</p></div>" +
    '<div style="display:flex;gap:8px;margin-bottom:14px;">' +
    '<button type="button" id="mgAbaEntrar" style="flex:1;padding:10px;border-radius:10px;color:#fff;font-weight:800;cursor:pointer;font-family:inherit;">Entrar</button>' +
    '<button type="button" id="mgAbaCriar" style="flex:1;padding:10px;border-radius:10px;color:#fff;font-weight:800;cursor:pointer;font-family:inherit;">Criar conta</button></div>' +
    '<form id="mgForm">' +
    '<input id="mgNome" aria-label="Nome" placeholder="' + (cfg.nomeCampo || "Nome") + '" hidden autocomplete="organization" style="' + inputCss + '">' +
    '<input id="mgEmail" aria-label="Seu e-mail" type="email" placeholder="Seu e-mail" required autocomplete="username" style="' + inputCss + '">' +
    '<input id="mgSenha" aria-label="Senha" type="password" placeholder="Senha (mínimo 6 caracteres)" required minlength="6" autocomplete="current-password" style="' + inputCss + '">' +
    '<input id="mgSenha2" type="password" placeholder="Repita a nova senha" aria-label="Repita a nova senha" hidden autocomplete="new-password" style="' + inputCss + '">' +
    '<p id="mgErro" hidden style="font-size:13px;margin:6px 0;line-height:1.5;"></p>' +
    '<button id="mgBtn" style="width:100%;padding:14px;border:none;border-radius:11px;background:' + cfg.grad + ';color:#fff;font-weight:800;font-size:15px;cursor:pointer;font-family:inherit;">Entrar →</button></form>' +
    '<button type="button" id="mgEsqueci" style="background:none;border:none;color:#c4b5fd;min-height:44px;font-size:14px;cursor:pointer;width:100%;font-family:inherit;">Esqueci minha senha</button>' +
    '<button type="button" id="mgLocal" style="background:none;border:none;color:#8a8695;font-size:12.5px;margin-top:14px;cursor:pointer;width:100%;font-family:inherit;">→ Experimentar sem conta (dados só neste aparelho)</button>' +
    '<p id="mgRodape" style="font-size:12px;color:#8a8695;margin:12px 0 0;line-height:1.5;text-align:center;">Criar a conta é grátis e leva 1 minuto — <a href="torqueon.html" style="color:' + cfg.corTag + ';font-weight:700;">conheça o TORQUE ON</a>.</p></div>';
  document.body.appendChild(div);
  // dentro do app da loja não pode link pra página de venda na web (regra Apple/Google)
  try {
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
      $("mgRodape").hidden = true;
    }
  } catch (e) {}

  function erro(m, ok) { var el = $("mgErro"); el.innerHTML = m; el.style.color = ok ? "#86efac" : "#fca5a5"; el.hidden = false; }
  function aplica() {
    var criar = aba === "criar";
    var nova = aba === "novaSenha", recuperar = aba === "recuperar";
    $("mgAbaEntrar").style.cssText += ";background:" + (criar ? "none" : cfg.grad) + ";border:1px solid " + (criar ? cfg.borda : cfg.corTag) + ";";
    $("mgAbaCriar").style.cssText += ";background:" + (criar ? cfg.grad : "none") + ";border:1px solid " + (criar ? cfg.corTag : cfg.borda) + ";";
    $("mgNome").hidden = !criar;
    $("mgNome").required = criar;
    $("mgEmail").hidden = nova;
    $("mgEmail").required = !nova;
    $("mgSenha").hidden = recuperar;
    $("mgSenha").required = !recuperar;
    $("mgSenha").minLength = nova ? 10 : 6;
    $("mgSenha").placeholder = nova ? "Nova senha (mínimo 10 caracteres)" : "Senha (mínimo 6 caracteres)";
    $("mgSenha").setAttribute("autocomplete", criar || nova ? "new-password" : "current-password");
    $("mgSenha2").hidden = !nova;
    $("mgSenha2").required = nova;
    $("mgEsqueci").hidden = criar || nova || recuperar;
    $("mgLocal").hidden = nova || recuperar;
    $("mgBtn").textContent = nova ? "Salvar nova senha" : recuperar ? "Enviar link de recuperação" : criar ? "Criar minha conta →" : "Entrar →";
    $("mgErro").hidden = true;
  }
  $("mgAbaEntrar").addEventListener("click", function () { aba = "entrar"; aplica(); });
  $("mgAbaCriar").addEventListener("click", function () { aba = "criar"; aplica(); });
  $("mgEsqueci").addEventListener("click", function () { aba = "recuperar"; aplica(); $("mgEmail").focus(); });
  self.addEventListener("mt:sessao-caiu", function () {
    // Uma função indisponível no demo não encerra uma sessão que nunca existiu.
    if (!NUVEM || recuperando || !contaConhecida) return;
    aba = "entrar"; aplica(); div.hidden = false;
    erro("Sua sessão terminou. Entre novamente para sincronizar. O trabalho salvo neste aparelho foi preservado.");
  });
  self.addEventListener("mt:conta-divergente", function () {
    aba = "entrar"; aplica(); div.hidden = false; $("mgLocal").hidden = true;
    erro("Este aparelho contém dados de outra conta. Entre na conta anterior para sincronizá-los ou use outro perfil do navegador para a nova conta.");
  });

  /* v756: o estúdio guardado aqui é MESMO o do demo? O demo-personal.html
   * semeia 24 alunos com token dtk1…dtk24 — se TODO aluno tem esse token, é
   * ele. Sem aluno nenhum, não há o que perder. Qualquer outra coisa (um aluno
   * de verdade que seja) é do professor e NÃO se apaga. Na dúvida (JSON
   * quebrado), também não se apaga. */
  function estudioEhDoDemo() {
    try {
      var cru = localStorage.getItem("mtapp:ptStudio");
      if (!cru) return true;
      var st = JSON.parse(cru);
      if (!st || typeof st !== "object") return false;
      var al = Array.isArray(st.alunos) ? st.alunos : [];
      if (!al.length) return true;
      return al.every(function (a) { return a && /^dtk\d+$/.test(String(a.appTokenP || "")); });
    } catch (e) { return false; }
  }
  window.__estudioEhDoDemo = estudioEhDoDemo; // testes

  function fecha() { div.hidden = true; }
  function depois() {
    fecha();
    try { localStorage.removeItem(cfg.flag); } catch (e) {}
    /* v745: entrou/criou a conta vindo do DEMO? As marcas do demo não tinham
     * saída e o estúdio de mentira (24 alunos, Carla no chat) subia pra nuvem
     * na primeira puxada — o painel de verdade virava demo em todo aparelho.
     * Limpa ANTES de ligar a sincronização. */
    /* v756 — ISTO APAGOU O ESTÚDIO DE UM PROFESSOR DE VERDADE. A marca do demo
     * (mtapp:ptDemo) tinha sido sincronizada pra conta dele semanas antes e
     * ficou no aparelho; ao entrar na conta, a limpeza abaixo apagava o
     * ptStudio REAL — 11 alunos, 77 sessões, 15 pagamentos — e o painel vazio
     * subia pra nuvem. A marca sozinha NÃO basta: o estúdio só sai quando ele
     * é MESMO o do demo (todo aluno com token dtkN, que é como o
     * demo-personal.html semeia), e mesmo assim fica uma cópia guardada. */
    try {
      if (localStorage.getItem("mtapp:ptDemo") === "1") {
        var doDemo = estudioEhDoDemo();
        var fora = ["mtapp:ptDemo", "mtapp:ptDemoNuvem", "mtapp:ptSemConta"];
        if (doDemo) {
          try {
            var cru = localStorage.getItem("mtapp:ptStudio");
            if (cru) localStorage.setItem("mtsync:bak:mtapp:ptStudio", cru);
          } catch (e2) {}
          fora = fora.concat(["mtapp:ptStudio", "mtapp:ptImagens"]);
        }
        fora.forEach(function (k) { try { localStorage.removeItem(k); } catch (e3) {} });
        // apagou de propósito: a trava do apagão do store não pode ver o "antes"
        if (doDemo && S && S.esqueceChave) { S.esqueceChave("ptStudio"); S.esqueceChave("ptImagens"); }
        window.__demoLimpo = doDemo;      // apagou o estúdio de mentira?
        window.__demoMarcas = true;       // as marcas saíram de qualquer jeito
      }
    } catch (e) {}
    if (S && S.iniciaSync) S.iniciaSync();
    if (cfg.depois) cfg.depois();
  }
  function vincula(user, silencioso) {
    contaConhecida = true;
    var identidade = null, anterior = null;
    try {
      identidade = JSON.parse(localStorage.getItem("mtsync:identidade"));
      anterior = JSON.parse(localStorage.getItem("mtapp:academia"));
      if (!identidade) { var perfilAnterior = JSON.parse(localStorage.getItem("mtapp:perfil")); if (perfilAnterior && perfilAnterior.nuvem) identidade = { email: perfilAnterior.email }; }
    } catch (e) {}
    function compativel(aid) {
      if (identidade && ((identidade.user_id && identidade.user_id !== user.id) ||
          (!identidade.user_id && identidade.email && identidade.email.toLowerCase() !== String(user.email || "").toLowerCase()) ||
          (aid && identidade.academia_id && identidade.academia_id !== aid))) {
        div.hidden = false; $("mgLocal").hidden = true;
        erro("Este aparelho contém dados de outra conta. Entre na conta anterior ou use outro perfil do navegador para a nova conta.");
        return false;
      }
      return true;
    }
    if (!compativel()) return Promise.resolve();
    return sb.from("membros").select("academia_id, papel, nome, academias(nome)").eq("user_id", user.id).then(function (r) {
      if (r.error) { div.hidden = false; erro("Não foi possível verificar seu acesso. Tente novamente quando a conexão voltar."); return; }
      var membros = r.data || [];
      var m = membros.find(function (x) { return anterior && anterior.id === x.academia_id; }) || membros[0];
      if (m) {
        if (!compativel(m.academia_id)) return;
        try {
          localStorage.setItem("mtapp:academia", JSON.stringify({ id: m.academia_id, user_id: user.id, papel: m.papel, nome: (m.academias && m.academias.nome) || "", codigo_equipe: "" }));
          localStorage.setItem("mtapp:perfil", JSON.stringify({ nome: (user.user_metadata || {}).nome || m.nome || (user.email || "").split("@")[0], email: user.email || "", nuvem: true }));
        } catch (e) {}
        depois();
        return;
      }
      if (identidade && identidade.academia_id) {
        div.hidden = false;
        erro("Seu vínculo com a equipe não está disponível. Fale com o dono do studio para verificar o acesso. Os dados deste aparelho foram preservados.");
        return;
      }
      // conta sem ilha ainda: cria a ilha deste produto com o nome do studio/consultório
      var nomeIlha = (cfg.nomeIlha && cfg.nomeIlha()) || cfg.marca + " de " + (user.email || "conta").split("@")[0];
      return sb.rpc("criar_academia", { p_nome_academia: nomeIlha, p_nome_membro: "" }).then(function (rr) {
        if (rr.error) { div.hidden = false; erro("Não deu para criar sua conta: " + rr.error.message); return; }
        if (cfg.salvaNome) cfg.salvaNome(nomeIlha);
        return vincula(user, silencioso);
      });
    }, function () { if (!silencioso) erro("Sem conexão para verificar sua conta — tente de novo."); });
  }

  $("mgForm").addEventListener("submit", function (e) {
    e.preventDefault();
    $("mgErro").hidden = true;
    $("mgBtn").disabled = true;
    var fim = function () { $("mgBtn").disabled = false; };
    var email = $("mgEmail").value.trim(), senha = $("mgSenha").value;
    if (aba === "recuperar") {
      sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }).then(function (r) {
        if (r.error) { erro("Não foi possível enviar o link agora. Aguarde um pouco e tente novamente."); return; }
        erro("Se este e-mail estiver cadastrado, você receberá um link para criar uma nova senha. Confira também o spam.", true);
      }, function () { erro("Sem conexão. Tente novamente quando a internet voltar."); }).finally(fim);
      return;
    }
    if (aba === "novaSenha") {
      if (senha.length < 10 || senha !== $("mgSenha2").value) { fim(); erro("Use pelo menos 10 caracteres e repita a mesma senha nos dois campos."); return; }
      sb.auth.updateUser({ password: senha }).then(function (r) {
        if (r.error) { erro("Não foi possível trocar a senha. O link pode ter expirado; solicite outro em Esqueci minha senha."); return; }
        recuperando = false; $("mgSenha").value = ""; $("mgSenha2").value = "";
        aba = "entrar"; aplica(); erro("Senha atualizada. Entre com a nova senha.", true);
        return sb.auth.signOut({ scope: "global" }).catch(function () {});
      }, function () { erro("Sem conexão. Sua senha não foi alterada; tente novamente."); }).finally(fim);
      return;
    }
    if (aba === "criar") {
      var nome = $("mgNome").value.trim();
      sb.auth.signUp({ email: email, password: senha, options: { data: { nome: nome } } }).then(function (r) {
        fim();
        if (r.error) {
          erro(/already|registrad/i.test(r.error.message || "")
            ? "Esse e-mail já tem conta — toque em Entrar e use a sua senha."
            : "Não deu pra criar a conta: " + r.error.message);
          return;
        }
        if (cfg.salvaNome && nome) cfg.salvaNome(nome);
        var sess = r.data && r.data.session;
        if (sess && r.data.user) { vincula(r.data.user); return; }
        // projeto com confirmação de e-mail ligada: avisa e volta pra aba Entrar
        aba = "entrar"; aplica();
        erro("Conta criada! Confirme no e-mail que acabamos de te enviar e depois entre aqui com a sua senha.", true);
      }, function () { fim(); erro("Sem conexão para criar a conta. Tente novamente."); });
      return;
    }
    sb.auth.signInWithPassword({ email: email, password: senha }).then(function (r) {
      fim();
      if (r.error) { erro("Login ou senha incorretos. Se você ainda não tem conta, toque em <b>Criar conta</b> aqui em cima."); return; }
      vincula(r.data.user);
    }, function () { fim(); erro("Sem conexão para entrar. Tente novamente."); });
  });
  $("mgLocal").addEventListener("click", function () {
    try { localStorage.setItem(cfg.flag, "1"); } catch (e) {}
    fecha();
    if (cfg.depois) cfg.depois();
  });

  var api = {
    abre: function (qualAba) { if (!NUVEM) { alert("A nuvem não está configurada neste site."); return; } aba = qualAba === "criar" ? "criar" : "entrar"; aplica(); div.hidden = false; },
    criaColaborador: function () {
      if (!confirm("O colaborador terá acesso aos dados da equipe, inclusive financeiros. As telas ocultas não tornam esses dados privados.\n\nEsta pessoa está autorizada a receber esses dados?")) return;
      var nome = prompt("Nome do colaborador:"); if (!nome) return;
      var email = prompt("E-mail do colaborador (será o login):"); if (!email) return;
      var chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789", senha = "";
      var rnd = new Uint32Array(10);
      if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(rnd);
      for (var i = 0; i < 10; i++) senha += chars[(rnd[i] || Math.floor(Math.random() * 1e9)) % chars.length];
      sb.rpc("equipe_cria_login", { p_email: email.trim(), p_senha: senha, p_nome: nome.trim(), p_papel: "funcionario" }).then(function (r) {
        if (r.error) { alert("Não deu: " + r.error.message); return; }
        var msg = "Seu acesso ao TORQUE ON:\nSite: " + location.origin + location.pathname + "\nLogin: " + email.trim().toLowerCase() + "\nSenha: " + senha + "\n\nDica: troque a senha depois de entrar.";
        if (navigator.clipboard) navigator.clipboard.writeText(msg);
        alert("Login criado e copiado! Cole no WhatsApp do colaborador:\n\n" + msg);
      }, function () { alert("Sem conexão com a nuvem agora."); });
    },
    // segurança da conta: trocar a senha sem sair do painel
    trocaSenha: function () {
      if (!sb) { alert("A nuvem não está configurada neste site."); return; }
      sb.auth.getSession().then(function (r) {
        var sess = r && r.data && r.data.session;
        if (!sess) { alert("Entre na sua conta primeiro."); return; }
        var s1 = prompt("Senha nova (mínimo 6 caracteres):");
        if (s1 === null) return;
        s1 = String(s1);
        if (s1.length < 6) { alert("A senha precisa de pelo menos 6 caracteres."); return; }
        var s2 = prompt("Repita a senha nova:");
        if (s2 === null) return;
        if (s1 !== String(s2)) { alert("As duas senhas estão diferentes — tente de novo."); return; }
        sb.auth.updateUser({ password: s1 }).then(function (r2) {
          if (r2 && r2.error) { alert("Não deu pra trocar: " + r2.error.message); return; }
          alert("Senha trocada! Da próxima vez que entrar, use a senha nova.");
        }, function () { alert("Sem conexão com a nuvem agora — tente de novo."); });
      });
    },
    sair: function () {
      if (!confirm("Sair da sua conta neste aparelho? (os dados locais continuam aqui)")) return;
      sb.auth.signOut().finally(function () {
        try { localStorage.removeItem("mtapp:academia"); localStorage.removeItem(cfg.flag); } catch (e) {}
        location.reload();
      });
    },
  };

  if (NUVEM) {
    sb = window.MT_supabase || window.supabase.createClient(self.MT_CLOUD.url, self.MT_CLOUD.anonKey);
    window.MT_supabase = sb;
    // O callback só muda a tela: chamar auth de dentro dele pode bloquear a sessão.
    if (typeof sb.auth.onAuthStateChange === "function") sb.auth.onAuthStateChange(function (evento) {
      if (evento === "PASSWORD_RECOVERY") {
        recuperando = true; aba = "novaSenha"; aplica(); div.hidden = false;
        $("mgSenha").focus();
      }
    });
    sb.auth.getSession().then(function (r) {
      var sess = r.data && r.data.session;
      if (recuperando) {
        aba = sess ? "novaSenha" : "recuperar"; aplica(); div.hidden = false;
        if (!sess) erro("O link de recuperação expirou ou é inválido. Solicite um novo link.");
        return;
      }
      if (sess && sess.user) { vincula(sess.user, true); return; }
      var pulou = false;
      try { pulou = !!localStorage.getItem(cfg.flag); } catch (e) {}
      if (!pulou) { aplica(); div.hidden = false; }
    }, function () {
      aplica(); div.hidden = false;
      erro("Não foi possível verificar sua sessão. Confira a conexão e tente entrar novamente.");
    });
  }
  return api;
};
