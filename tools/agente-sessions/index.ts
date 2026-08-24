// App mínimo que conversa com um agente gerenciado (Managed Agents) da Anthropic.
//
// O agente JÁ existe e é versionado — ele guarda model, system e tools. Este
// programa só abre uma SESSÃO apontando pra ele, manda uma mensagem e imprime
// o texto do agente conforme ele chega.
//
// Rodar:  npm install && npm start -- "sua pergunta aqui"
// Ver o README.md ao lado pra credencial e variáveis.

import Anthropic from "@anthropic-ai/sdk";

const AGENT_ID = process.env.AGENT_ID || "agent_01UpntLgVCZw9rJ74Vx1YBVy";
const ENVIRONMENT_ID = process.env.ENVIRONMENT_ID || "env_01964BhQv9WSjwN3Vcun6ZWj";

// Sem argumento, o cliente resolve a credencial sozinho, nesta ordem:
// ANTHROPIC_API_KEY → ANTHROPIC_AUTH_TOKEN → perfil do `ant auth login`.
const client = new Anthropic();

/* O log de andamento vai pro stderr de propósito: assim o stdout carrega SÓ a
 * resposta do agente, e dá pra fazer `npm start -- "..." > resposta.txt`. */
function aviso(msg: string): void {
  process.stderr.write(msg + "\n");
}

async function main(): Promise<void> {
  const pergunta = process.argv.slice(2).join(" ").trim() ||
    "Oi! Se apresente em uma frase e diga o que você consegue fazer.";

  /* Agente (uma vez, já criado) → Sessão (a cada execução). O campo `agent`
   * aceita só o ID: model/system/tools moram no agente, nunca aqui. Passar o
   * ID como string usa a versão mais recente dele. */
  const session = await client.beta.sessions.create({
    agent: AGENT_ID,
    environment_id: ENVIRONMENT_ID,
  });
  aviso(`sessão: ${session.id}  (status: ${session.status})`);

  /* Stream PRIMEIRO, envio depois — o stream só entrega o que acontece depois
   * que ele abre. Invertendo a ordem, os primeiros eventos chegam todos de uma
   * vez, em bloco, e o texto não sai aos poucos. */
  const stream = await client.beta.sessions.events.stream(session.id);
  await client.beta.sessions.events.send(session.id, {
    events: [{ type: "user.message", content: [{ type: "text", text: pergunta }] }],
  });

  let escreveu = false;

  for await (const event of stream) {
    switch (event.type) {
      case "agent.message":
        for (const bloco of event.content) {
          if (bloco.type === "text") {
            process.stdout.write(bloco.text);
            escreveu = true;
          }
        }
        break;

      case "session.error":
        /* A forma exata do payload de erro não está documentada na skill, então
         * imprimo o evento inteiro em vez de inventar nome de campo. */
        aviso("\nerro na sessão: " + JSON.stringify(event));
        process.exitCode = 1;
        return;

      case "session.status_terminated":
        aviso("\n(sessão encerrada)");
        return;

      case "session.status_idle":
        /* Não basta parar no primeiro `idle`: a sessão fica ociosa de passagem
         * enquanto espera algo DE VOLTA de nós (confirmação de ferramenta,
         * resultado de ferramenta custom). Só `requires_action` continua. */
        if (event.stop_reason.type === "requires_action") {
          aviso("\n(o agente está esperando uma resposta do cliente — " +
            "este app mínimo não trata ferramentas, então para por aqui)");
          process.exitCode = 1;
          return;
        }
        // end_turn (normal), retries_exhausted (falhou) ou budget_reached (teto de gasto)
        if (event.stop_reason.type !== "end_turn") {
          aviso(`\n(parou por: ${event.stop_reason.type})`);
          process.exitCode = 1;
          return;
        }
        if (escreveu) process.stdout.write("\n");
        return;
    }
  }
}

main().catch((e: unknown) => {
  process.exitCode = 1;
  // Cadeia do mais específico pro mais genérico. APIConnectionError vem ANTES de
  // APIError porque no SDK de TypeScript ela é subclasse dele (no Python são irmãs).
  if (e instanceof Anthropic.NotFoundError) {
    aviso(`\nNão achei o agente ou o ambiente (404). Confira AGENT_ID (${AGENT_ID}) ` +
      `e ENVIRONMENT_ID (${ENVIRONMENT_ID}) — e se a chave é do workspace certo.`);
  } else if (e instanceof Anthropic.AuthenticationError) {
    aviso("\nCredencial recusada (401). Exporte ANTHROPIC_API_KEY ou rode `ant auth login`.");
  } else if (e instanceof Anthropic.RateLimitError) {
    aviso("\nLimite de uso atingido (429). Espere um pouco e tente de novo.");
  } else if (e instanceof Anthropic.APIConnectionError) {
    aviso("\nNão consegui falar com a API (rede/proxy).");
  } else if (e instanceof Anthropic.APIError) {
    aviso(`\nA API recusou (${e.status ?? "?"} ${e.type ?? ""}): ${e.message}`);
  } else {
    aviso("\nErro inesperado: " + (e instanceof Error ? e.message : String(e)));
  }
});
