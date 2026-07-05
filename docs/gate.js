// Proteção leve dos materiais: sem cadastro feito no portal, volta para a
// entrada. Só age quando o controle de acesso está ligado (access-config.js).
(function () {
  try {
    var cfg = self.MT_ACCESS;
    if (cfg && cfg.exigirCadastro && !localStorage.getItem("mtapp:perfil")) {
      window.top.location.replace("../index.html");
    }
  } catch (e) {}
})();
