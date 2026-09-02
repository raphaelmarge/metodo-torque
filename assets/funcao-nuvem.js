/* TORQUE ON — chamador de Edge Function com token sempre fresco.
 *
 * Motivo de existir: "funciona por um tempo e depois dá erro". O crachá de
 * login (access_token) do servidor vale cerca de 1 hora. Com o painel aberto o
 * dia todo, ou com o sistema aberto em dois lugares ao mesmo tempo (o refresh
 * de um invalida o do outro), a hora passa e a próxima chamada leva 401 — e
 * antes isso aparecia como "publique a chat-envia", que não tem nada a ver.
 *
 * O que este arquivo faz:
 *   1. renova o crachá ANTES de chamar, quando ele está perto de vencer;
 *   2. se mesmo assim vier 401/403, renova e tenta MAIS UMA vez;
 *   3. se o crachá NOVO também levar 401, o problema não é a sessão — é o
 *      portão do servidor recusando aquela função, e o recado diz isso;
 *   4. e, havendo apelido configurado (MT_FN_APELIDO), repete a chamada na
 *      função de reserva antes de desistir.
 * Assim o professor não vê erro nenhum no caso comum — o sistema se recupera
 * sozinho —, e quando não dá pra recuperar, ele ouve a verdade.
 *
 * Uso: MT_FUNCAO.chama(nuvem.client, "chat-envia", { acao: "ia_treino" }, "A IA de treino")
 *      → Promise de { ...resposta } ou { erro: "recado pro humano" }
 */
(function (raiz) {
  var MARGEM = 120;   // renova quando falta menos de 2 minutos
  var apelidoOk = {}; // apelido que já deu certo nesta página: usa direto

  // segundos que faltam pro crachá vencer; null quando não dá pra saber
  function faltaPra(tok) {
    try {
      var p = String(tok).split(".")[1];
      if (!p) return null;
      var corpo = JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/")));
      if (!corpo || !corpo.exp) return null;
      return corpo.exp - Math.floor(Date.now() / 1000);
    } catch (e) { return null; }
  }

  function renova(client) {
    if (!client || !client.auth || typeof client.auth.refreshSession !== "function") return Promise.resolve("");
    return client.auth.refreshSession().then(function (r) {
      return (r && r.data && r.data.session && r.data.session.access_token) || "";
    }, function () { return ""; });
  }

  /* Crachá pronto pra usar: renova sozinho quando está pra vencer.
   * Devolve "" quando não há sessão — quem chama tem que avisar o humano. */
  function token(client) {
    if (!client || !client.auth || typeof client.auth.getSession !== "function") return Promise.resolve("");
    return client.auth.getSession().then(function (s) {
      var tok = (s && s.data && s.data.session && s.data.session.access_token) || "";
      if (!tok) return renova(client);
      var falta = faltaPra(tok);
      if (falta === null || falta > MARGEM) return tok; // ainda vale (ou não dá pra ler: usa como está)
      return renova(client).then(function (novo) {
        // renovação falhou mas o crachá ainda não venceu: tenta com o que tem
        return novo || (falta > 0 ? tok : "");
      });
    }, function () { return ""; });
  }

  function traduz(nome, status, texto, json) {
    if (raiz.MT_ERRO_FUNCAO) return raiz.MT_ERRO_FUNCAO(nome, status, texto, json);
    return "A função " + nome + " não respondeu como esperado (HTTP " + status + ").";
  }

  function semSessao(oQue) {
    /* Avisa a página inteira, não só quem chamou: assim o painel pode botar o
     * botão de entrar de novo na frente do professor, em vez de esconder o
     * recado no rodapé de um card. */
    try { raiz.dispatchEvent(new CustomEvent("mt:sessao-caiu", { detail: { oQue: oQue || "" } })); } catch (e) {}
    if (raiz.MT_ERRO_FUNCAO) return raiz.MT_ERRO_FUNCAO.semSessao(oQue);
    return "Sua sessão da nuvem caiu — saia da conta e entre de novo.";
  }

  /* 401 com crachá NOVO em folha não é sessão caída: é o portão do servidor
   * barrando aquela função. Dizer "entre de novo" aqui manda a pessoa fazer um
   * login que não resolve nada — e some com o problema de vista.
   * v757: e também não adianta mandar o cliente abrir a página de diagnóstico:
   * ela é do dono do sistema. A tela diz o que é verdade (não é ele, e a gente
   * já sabe) e o detalhe técnico fica no console pra quem for consertar. */
  function portaoRecusou(nome, status) {
    try {
      console.error("[TORQUE ON] portão barrou a chamada — " + nome + " (HTTP " + status +
        ") com crachá renovado: não é a sessão do usuário nem a chave do site.");
    } catch (e) {}
    return "Esse recurso está fora do ar agora — não é coisa sua nem do seu login, " +
      "a gente já foi avisado. Tente de novo daqui a pouco.";
  }

  function apelidoDe(nome) {
    var m = raiz.MT_FN_APELIDO || {};
    var alt = m[nome] || "";
    return alt && alt !== nome ? alt : "";
  }

  function chama(client, nome, corpo, oQue) {
    var cfg = raiz.MT_CLOUD || {};
    if (!cfg.url) return Promise.resolve({ erro: "Este aparelho está sem a configuração da nuvem — recarregue a página." });
    var alvo = apelidoOk[nome] || nome;

    function envia(qual, tok) {
      return fetch(cfg.url + "/functions/v1/" + qual, {
        method: "POST",
        headers: { apikey: cfg.anonKey, Authorization: "Bearer " + tok, "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      }).then(function (r) {
        /* Ler como TEXTO primeiro: resposta que não é JSON (erro do portão,
         * HTML de erro, função antiga) fazia o r.json() estourar e virar
         * "sem conexão" — mentira que mandava procurar defeito na internet. */
        return r.text().then(function (t) {
          var j = null;
          try { j = JSON.parse(t); } catch (e) {}
          var ok = r.status >= 200 && r.status < 300;
          var d = (ok && j) ? j : { erro: traduz(qual, r.status, t, j) };
          d.__status = r.status;
          return d;
        });
      });
    }
    function barrado(d) { return d && (d.__status === 401 || d.__status === 403); }

    // última cartada: a função de reserva, quando o dono configurou um apelido
    function tentaApelido(tok, d) {
      var alt = apelidoDe(alvo);
      if (!alt || alt === alvo) return d;
      return envia(alt, tok).then(function (d2) {
        if (barrado(d2)) return d;
        apelidoOk[nome] = alt; // deu certo: as próximas já vão direto
        return d2;
      }, function () { return d; });
    }

    return token(client).then(function (tok) {
      if (!tok) return { erro: semSessao(oQue), __status: 401 };
      return envia(alvo, tok).then(function (d) {
        if (!barrado(d)) return d;
        // crachá recusado no meio do caminho: renova e tenta MAIS UMA vez
        return renova(client).then(function (novo) {
          if (!novo) {
            // não deu pra renovar: aí sim a sessão pode ter morrido de verdade
            return tentaApelido(tok, { erro: semSessao(oQue), __status: d.__status });
          }
          return envia(alvo, novo).then(function (d2) {
            if (!barrado(d2)) return d2;
            // crachá novo em folha e mesmo assim barrado: é o portão, não você
            return tentaApelido(novo, { erro: portaoRecusou(alvo, d2.__status), __status: d2.__status });
          });
        });
      });
    });
  }

  raiz.MT_FUNCAO = { chama: chama, token: token, faltaPra: faltaPra };
})(typeof self !== "undefined" ? self : this);
