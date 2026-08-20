/* TORQUE ON — tradutor honesto de erro de Edge Function.
 *
 * Motivo de existir: quando o Supabase recusava a chamada no portão (HTTP 401
 * "Invalid credentials"), o corpo da resposta não tem o campo `erro`, então
 * todas as telas caíam no recado genérico "IA indisponível agora — publique a
 * chat-envia com a ANTHROPIC_API_KEY". O Raphael republicou a função três
 * vezes atrás de um problema que nunca esteve nela: era credencial (sessão
 * caída ou chave do site), e o sistema mandava ele pro lugar errado.
 *
 * Regra desta função: só falar em publicar/republicar quando o sinal for
 * MESMO de função ausente ou velha. Erro de credencial diz credencial.
 *
 * Uso: MT_ERRO_FUNCAO("chat-envia", r.status, textoDaResposta, jsonOuNull)
 */
(function (raiz) {
  function curto(t) {
    return String(t == null ? "" : t).replace(/\s+/g, " ").trim().slice(0, 160);
  }

  function traduz(nome, status, texto, json) {
    nome = nome || "função";
    var d = json;
    if (d && typeof d === "object" && d.erro) return String(d.erro); // a própria função explicou

    var msg = (d && typeof d === "object" && (d.message || d.msg)) || "";
    var codigo = (d && typeof d === "object" && d.code) || "";

    if (status === 404 || /not found|does not exist/i.test(msg)) {
      return "A função " + nome + " não está publicada neste projeto do Supabase. " +
        "Abra www.torqueon.com.br/funcoes.html, copie o código e publique com este nome exato.";
    }
    if (status === 401 || status === 403) {
      return "O Supabase recusou a credencial da chamada (HTTP " + status +
        (codigo ? " " + codigo : "") + ") — a função " + nome + " nem chegou a rodar, então republicar ela NÃO resolve. " +
        "Quase sempre é a sua sessão: saia da conta e entre de novo. Se continuar, abra www.torqueon.com.br/diagnostico.html.";
    }
    if (status === 405) {
      return "A função " + nome + " recusou o método da chamada (405) — publique de novo a versão atual em www.torqueon.com.br/funcoes.html.";
    }
    if (status === 429) {
      return "Muitas chamadas seguidas (429) — espere um minuto e tente de novo.";
    }
    if (status === 546 || /boot|worker/i.test(msg)) {
      return "A função " + nome + " subiu com erro no Supabase (HTTP " + status + ", BOOT_ERROR). Abra Edge Functions → " + nome +
        " → Logs pra ver a linha do erro, e publique de novo o código de www.torqueon.com.br/funcoes.html.";
    }
    if (status >= 500) {
      return "A função " + nome + " respondeu com erro do servidor (HTTP " + status + ")" +
        (msg ? ": " + curto(msg) : "") + " — veja os Logs dela no Supabase.";
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
