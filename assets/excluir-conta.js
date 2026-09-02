/* TORQUE ON — exclusão de conta pelo próprio usuário.
 *
 * A Google Play exige, desde 2023, que todo app com login ofereça a exclusão
 * da conta DENTRO do app e também por um endereço na web (a nossa página
 * excluir-conta.html). A Apple pede o mesmo na diretriz 5.1.1(v). Sem isso o
 * app é recusado na revisão — não é opcional.
 *
 * O que este arquivo faz: pede confirmação em duas etapas (uma delas digitada,
 * pra não acontecer por engano), chama a função excluir_minha_conta no
 * Supabase, limpa o aparelho e recarrega. Sem conta na nuvem, ainda assim
 * apaga tudo que está guardado localmente — que é o único dado que existe.
 */
(function (raiz) {
  var E = {};

  E.TEXTO_CONFIRMA = "EXCLUIR";

  /* Apaga o que o TORQUE ON guardou neste aparelho. Só as chaves do sistema:
   * nada de limpar o localStorage inteiro, que pode ter coisa de outro site
   * hospedado no mesmo domínio. */
  E.limpaAparelho = function () {
    /* v756: aqui a limpeza é DE PROPÓSITO (o professor confirmou apagar a
     * conta), então avisa a trava do apagão do store.js — senão qualquer
     * gravação que aconteça entre isto e a saída da página seria recusada com
     * um alerta assustador, e a memória de contagem ficaria com o "antes". */
    try { raiz.__MT_LIMPANDO = true; } catch (eL) {}
    try {
      var fora = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf("mtapp:") === 0) fora.push(k);
      }
      fora.forEach(function (k) {
        localStorage.removeItem(k);
        try {
          if (raiz.MTStore && raiz.MTStore.esqueceChave) raiz.MTStore.esqueceChave(k.slice(6));
        } catch (eE) {}
      });
    } catch (e) {}
    try {
      if (raiz.caches && caches.keys) {
        caches.keys().then(function (ks) {
          ks.forEach(function (k) { caches.delete(k); });
        });
      }
    } catch (e) {}
  };

  /* exclui({sb, aoAviso}) — sb é o cliente Supabase já logado (ou null).
   * Devolve promessa que resolve com {ok:true} ou {cancelado:true}. */
  E.exclui = function (op) {
    op = op || {};
    var diz = op.aoAviso || function () {};
    var naNuvem = !!op.sb;

    var aviso = naNuvem
      ? "Isto apaga a sua conta e TODOS os dados dela: alunos, treinos, avaliações, pagamentos, dietas e conversas. Se você for o único dono, a ilha inteira vai junto — inclusive pra sua equipe.\n\nNão dá pra desfazer. Tem certeza?"
      : "Isto apaga todos os dados guardados neste aparelho: alunos, treinos, avaliações e pagamentos.\n\nNão dá pra desfazer. Tem certeza?";
    if (!raiz.confirm(aviso)) return Promise.resolve({ cancelado: true });

    var digitou = raiz.prompt("Pra confirmar, digite " + E.TEXTO_CONFIRMA + " (em maiúsculas):", "");
    if (String(digitou || "").trim().toUpperCase() !== E.TEXTO_CONFIRMA) {
      return Promise.resolve({ cancelado: true });
    }

    if (!naNuvem) {
      /* Sem sessão, isto apaga SÓ este aparelho. Era aqui que o sistema mentia:
       * o profissional "formatava o perfil", via tudo zerado e achava que tinha
       * acabado — mas os alunos continuavam com o app funcionando, alimentado
       * pela nuvem, porque a nuvem nem foi tocada. */
      raiz.alert("Atenção: você não está conectado à sua conta.\n\nIsto apaga só os dados DESTE aparelho. Seus alunos continuam com o app funcionando normalmente.\n\nPra apagar de verdade, entre na sua conta e repita.");
      diz("Apagando os dados deste aparelho…");
      E.limpaAparelho();
      return Promise.resolve({ ok: true, local: true, avisou: true });
    }

    diz("Apagando a sua conta…");
    /* Primeiro corta o acesso de TODOS os alunos: a academia só é apagada quando
     * você é o único dono, então sem esta faxina os apps continuariam abrindo
     * numa ilha que tem outro dono. Se a RPC ainda não existe no banco, segue
     * em frente — o cascade da academia resolve o caso simples. */
    return op.sb.rpc("app_aluno_faxina", { p_tokens: [] }).catch(function () { return null; }).then(function () {
      return op.sb.rpc("excluir_minha_conta");
    }).then(function (r) {
      if (r.error) throw new Error(r.error.message || "não consegui apagar a conta agora");
      // o usuário já não existe: a sessão morre junto, então nem adianta signOut
      E.limpaAparelho();
      return { ok: true };
    });
  };

  /* liga(botaoId, cfg) — pendura o fluxo num botão da tela. cfg.sb é uma
   * FUNÇÃO que devolve o cliente logado na hora do clique (a sessão pode ter
   * mudado depois que a página carregou). */
  E.liga = function (botaoId, cfg) {
    var bt = document.getElementById(botaoId);
    if (!bt) return;
    cfg = cfg || {};
    bt.addEventListener("click", function () {
      var sb = cfg.sb ? cfg.sb() : null;
      bt.disabled = true;
      E.exclui({ sb: sb, aoAviso: cfg.aoAviso }).then(function (r) {
        if (r.cancelado) { bt.disabled = false; return; }
        if (cfg.aoAviso) cfg.aoAviso("Conta apagada. Até uma próxima. 👋");
        setTimeout(function () { location.href = cfg.destino || "index.html"; }, 1200);
      }).catch(function (e) {
        bt.disabled = false;
        if (cfg.aoAviso) cfg.aoAviso("Não deu certo: " + e.message);
        else raiz.alert("Não deu certo: " + e.message);
      });
    });
  };

  raiz.MT_EXCLUIR = E;
})(typeof self !== "undefined" ? self : this);
