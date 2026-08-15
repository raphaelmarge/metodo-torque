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
  var sb = null;
  function $(id) { return document.getElementById(id); }
  var inputCss = "width:100%;margin-bottom:8px;padding:13px;border-radius:11px;border:1px solid #3a3446;background:rgba(0,0,0,.28);color:#fff;font-family:inherit;font-size:14px;box-sizing:border-box;";

  var div = document.createElement("div");
  div.id = "gateModulo";
  div.hidden = true;
  div.style.cssText = "position:fixed;inset:0;z-index:60;background:" + cfg.fundo + ";display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto;";
  div.innerHTML =
    '<div style="width:100%;max-width:400px;background:' + cfg.cardBg + ";border:1px solid " + cfg.borda + ';border-radius:18px;padding:28px 24px;color:#fff;box-shadow:0 24px 70px -24px rgba(0,0,0,.7);">' +
    '<div style="text-align:center;margin-bottom:16px;"><span style="font-size:11px;letter-spacing:.22em;color:' + cfg.corTag + ';font-weight:700;">TORQUE ON</span>' +
    '<h2 style="font-size:24px;margin:4px 0 0;font-weight:800;color:#fff;">TORQUE <span style="color:' + cfg.corTag + ';">' + cfg.marca + "</span></h2>" +
    '<p style="color:#9b96a8;font-size:13px;margin-top:6px;line-height:1.5;">' + cfg.sub + "</p></div>" +
    '<div style="display:flex;gap:8px;margin-bottom:14px;">' +
    '<button type="button" id="mgAbaEntrar" style="flex:1;padding:10px;border-radius:10px;color:#fff;font-weight:800;cursor:pointer;font-family:inherit;">Entrar</button>' +
    '<button type="button" id="mgAbaCriar" style="flex:1;padding:10px;border-radius:10px;color:#fff;font-weight:800;cursor:pointer;font-family:inherit;">Criar conta</button></div>' +
    '<form id="mgForm">' +
    '<input id="mgNome" placeholder="' + (cfg.nomeCampo || "Nome") + '" hidden autocomplete="organization" style="' + inputCss + '">' +
    '<input id="mgEmail" type="email" placeholder="Seu e-mail" required autocomplete="username" style="' + inputCss + '">' +
    '<input id="mgSenha" type="password" placeholder="Senha (mínimo 6 caracteres)" required minlength="6" autocomplete="current-password" style="' + inputCss + '">' +
    '<p id="mgErro" hidden style="font-size:13px;margin:6px 0;line-height:1.5;"></p>' +
    '<button id="mgBtn" style="width:100%;padding:14px;border:none;border-radius:11px;background:' + cfg.grad + ';color:#fff;font-weight:800;font-size:15px;cursor:pointer;font-family:inherit;">Entrar →</button></form>' +
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
    $("mgAbaEntrar").style.cssText += ";background:" + (criar ? "none" : cfg.grad) + ";border:1px solid " + (criar ? cfg.borda : cfg.corTag) + ";";
    $("mgAbaCriar").style.cssText += ";background:" + (criar ? cfg.grad : "none") + ";border:1px solid " + (criar ? cfg.corTag : cfg.borda) + ";";
    $("mgNome").hidden = !criar;
    $("mgNome").required = criar;
    $("mgSenha").setAttribute("autocomplete", criar ? "new-password" : "current-password");
    $("mgBtn").textContent = criar ? "Criar minha conta →" : "Entrar →";
    $("mgErro").hidden = true;
  }
  $("mgAbaEntrar").addEventListener("click", function () { aba = "entrar"; aplica(); });
  $("mgAbaCriar").addEventListener("click", function () { aba = "criar"; aplica(); });

  function fecha() { div.hidden = true; }
  function depois() {
    fecha();
    try { localStorage.removeItem(cfg.flag); } catch (e) {}
    if (S && S.iniciaSync) S.iniciaSync();
    if (cfg.depois) cfg.depois();
  }
  function vincula(user, silencioso) {
    return sb.from("membros").select("academia_id, papel, nome, academias(nome)").then(function (r) {
      var m = r.data && r.data[0];
      if (m) {
        try {
          localStorage.setItem("mtapp:academia", JSON.stringify({ id: m.academia_id, papel: m.papel, nome: (m.academias && m.academias.nome) || "", codigo_equipe: "" }));
          localStorage.setItem("mtapp:perfil", JSON.stringify({ nome: (user.user_metadata || {}).nome || m.nome || (user.email || "").split("@")[0], email: user.email || "", nuvem: true }));
        } catch (e) {}
        depois();
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
      });
      return;
    }
    sb.auth.signInWithPassword({ email: email, password: senha }).then(function (r) {
      fim();
      if (r.error) { erro("Login ou senha incorretos. Se você ainda não tem conta, toque em <b>Criar conta</b> aqui em cima."); return; }
      vincula(r.data.user);
    });
  });
  $("mgLocal").addEventListener("click", function () {
    try { localStorage.setItem(cfg.flag, "1"); } catch (e) {}
    fecha();
    if (cfg.depois) cfg.depois();
  });

  var api = {
    abre: function (qualAba) { if (!NUVEM) { alert("A nuvem não está configurada neste site."); return; } aba = qualAba === "criar" ? "criar" : "entrar"; aplica(); div.hidden = false; },
    criaColaborador: function () {
      var nome = prompt("Nome do colaborador:"); if (!nome) return;
      var email = prompt("E-mail do colaborador (será o login):"); if (!email) return;
      var chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789", senha = "";
      var rnd = new Uint32Array(10);
      if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(rnd);
      for (var i = 0; i < 10; i++) senha += chars[(rnd[i] || Math.floor(Math.random() * 1e9)) % chars.length];
      sb.rpc("equipe_cria_login", { p_email: email.trim(), p_senha: senha, p_nome: nome.trim(), p_papel: "equipe" }).then(function (r) {
        if (r.error) { alert("Não deu: " + r.error.message); return; }
        var msg = "Seu acesso ao TORQUE ON:\nSite: " + location.origin + location.pathname + "\nLogin: " + email.trim().toLowerCase() + "\nSenha: " + senha + "\n\nDica: troque a senha depois de entrar.";
        if (navigator.clipboard) navigator.clipboard.writeText(msg);
        alert("Login criado e copiado! Cole no WhatsApp do colaborador:\n\n" + msg);
      }, function () { alert("Sem conexão com a nuvem agora."); });
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
    sb.auth.getSession().then(function (r) {
      var sess = r.data && r.data.session;
      if (sess && sess.user) { vincula(sess.user, true); return; }
      var pulou = false;
      try { pulou = !!localStorage.getItem(cfg.flag); } catch (e) {}
      if (!pulou) { aplica(); div.hidden = false; }
    });
  }
  return api;
};
