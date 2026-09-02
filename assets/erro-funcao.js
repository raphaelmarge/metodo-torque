/* TORQUE ON — tradutor honesto de erro de função do servidor.
 *
 * Motivo de existir: quando o servidor recusava a chamada no portão (HTTP 401
 * "Invalid credentials"), o corpo da resposta não tem o campo `erro`, então
 * todas as telas caíam no recado genérico "IA indisponível agora — publique a
 * chat-envia com a ANTHROPIC_API_KEY". O Raphael republicou a função três
 * vezes atrás de um problema que nunca esteve nela: era credencial (sessão
 * caída ou chave do site), e o sistema mandava ele pro lugar errado.
 *
 * Regra desta função: NENHUM ramo manda o cliente publicar, republicar, abrir
 * Logs ou abrir a página de diagnóstico — nada disso está ao alcance dele.
 *
 * v757: publicar função, abrir Logs, conferir chave de servidor e abrir o
 * diagnóstico são trabalho do DONO do sistema — o cliente não tem esse acesso e
 * nunca vai ter. Mandar ele "publicar a função" fazia um personal trainer achar
 * que a culpa era dele e ficar travado. Agora o recado da tela é curto e
 * honesto ("está fora do ar, não é coisa sua"; no 401, "entre de novo", que é a
 * única coisa ao alcance dele) e o detalhe técnico vai pro console.error —
 * onde a gente lê quando ele manda o print.
 *
 * Uso: MT_ERRO_FUNCAO("chat-envia", r.status, textoDaResposta, jsonOuNull)
 */
(function (raiz) {
  function curto(t) {
    return String(t == null ? "" : t).replace(/\s+/g, " ").trim().slice(0, 160);
  }

  /* O detalhe que a TELA não mostra mais. Fica no console do navegador: é o
   * que a gente pede pro cliente printar quando alguma coisa não funciona. */
  function tecnico(oQue, nome, status, detalhe) {
    try { console.error("[TORQUE ON] " + oQue + " — " + nome + " (HTTP " + status + ") " + curto(detalhe)); } catch (e) {}
  }

  function traduz(nome, status, texto, json) {
    nome = nome || "função";
    var d = json;
    if (d && typeof d === "object" && d.erro) return String(d.erro); // a própria função explicou

    var msg = (d && typeof d === "object" && (d.message || d.msg)) || "";
    var codigo = (d && typeof d === "object" && d.code) || "";

    if (status === 404 || /not found|does not exist/i.test(msg)) {
      tecnico("recurso ausente no servidor", nome, status, msg || texto);
      return "Esse recurso está fora do ar agora — não é coisa sua, a gente já foi avisado. " +
        "Tente de novo daqui a pouco.";
    }
    if (status === 401 || status === 403) {
      /* O motivo TÉCNICO continua importando (o portão barrou antes da função
       * rodar, então republicar não resolveria nada) — só que quem precisa
       * saber disso somos nós. Pro cliente sobra a única coisa que ele PODE
       * fazer: entrar de novo. Se não for isso, ele merece ouvir que não é
       * culpa dele, em vez de ser mandado pra uma página de diagnóstico que é
       * do dono do sistema. */
      tecnico("portão recusou a credencial (a função nem rodou)", nome, status, codigo || msg || texto);
      return "Sua sessão pode ter caído — saia da conta e entre de novo. " +
        "Se continuar assim, não é coisa sua: a gente já foi avisado.";
    }
    if (status === 405) {
      // versão velha no ar do NOSSO lado: o cliente não publica nada
      tecnico("método recusado (versão publicada é velha)", nome, status, msg || texto);
      return "Esse recurso está fora do ar agora — não é coisa sua, a gente já foi avisado. " +
        "Tente de novo daqui a pouco.";
    }
    if (status === 429) {
      return "Muitas chamadas seguidas (429) — espere um minuto e tente de novo.";
    }
    if (status === 546 || /boot|worker/i.test(msg)) {
      tecnico("BOOT_ERROR (o recurso subiu quebrado)", nome, status, msg || texto);
      return "Esse recurso está fora do ar agora — não é coisa sua, a gente já foi avisado. " +
        "Tente de novo daqui a pouco.";
    }
    if (status >= 500) {
      tecnico("erro do servidor", nome, status, msg || texto);
      return "O servidor deu erro agora (HTTP " + status + ") — não é coisa sua. " +
        "Tente de novo daqui a pouco; se continuar assim, me avise.";
    }
    if (status >= 400) {
      return "A função " + nome + " recusou a chamada (HTTP " + status + ")" +
        (msg ? ": " + curto(msg) : (texto ? ": " + curto(texto) : "")) + ".";
    }
    return "A função " + nome + " respondeu algo inesperado (HTTP " + status + ")" +
      (texto ? ": " + curto(texto) : "") + ".";
  }

  // recado padrão de sessão caída — o mesmo em todas as telas
  traduz.semSessao = function (oQue) {
    return "Sua sessão da nuvem caiu — saia da conta e entre de novo (card Sua ilha). " +
      (oQue || "Este recurso") + " só funciona com você logado.";
  };

  raiz.MT_ERRO_FUNCAO = traduz;
})(typeof self !== "undefined" ? self : this);
