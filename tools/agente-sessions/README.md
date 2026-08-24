# agente-sessions

App mínimo que conversa com um **agente gerenciado** (Managed Agents) da Anthropic
e imprime a resposta conforme ela chega.

Não faz parte do site TORQUE ON — é uma ferramenta de linha de comando, igual ao
`tools/demo-aluno`.

## Rodar

```bash
cd tools/agente-sessions
npm install
export ANTHROPIC_API_KEY="sk-ant-..."        # ou: ant auth login
npm start -- "sua pergunta aqui"
```

Sem pergunta, ele manda uma de exemplo. O texto do agente sai no **stdout** e o
andamento no **stderr**, então dá pra desviar só a resposta:

```bash
npm start -- "resuma o repositório" > resposta.txt
```

Sem build: o Node 22 lê o `.ts` direto com `--experimental-strip-types`. Como isso
só apaga os tipos e não confere nada, existe um `npm run typecheck` que roda o
TypeScript de verdade (`--strict`).

## Configuração

| Variável | Padrão | O que é |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Credencial. Sem ela, o SDK também aceita `ANTHROPIC_AUTH_TOKEN` ou o perfil do `ant auth login`. |
| `AGENT_ID` | `agent_01UpntLgVCZw9rJ74Vx1YBVy` | O agente a conversar. |
| `ENVIRONMENT_ID` | `env_01964BhQv9WSjwN3Vcun6ZWj` | Onde as ferramentas do agente rodam. |

## Como funciona

**Agente (uma vez) → Sessão (a cada execução).** O agente é um objeto persistido e
versionado que guarda `model`, `system` e `tools`. Este app **não cria agente** —
ele já existe. A sessão só aponta pra ele pelo ID.

Dois detalhes que não são óbvios e estão no código:

1. **Stream primeiro, envio depois.** O stream só entrega o que acontece *depois*
   que ele abre — não tem replay. Mandando a mensagem antes, os primeiros eventos
   chegam todos juntos, em bloco, e o texto não sai aos poucos.

2. **Não basta parar no primeiro `session.status_idle`.** A sessão fica ociosa de
   passagem enquanto espera algo de volta do cliente. O que decide é o
   `stop_reason.type`:

   | `stop_reason.type` | Significa | O app faz |
   |---|---|---|
   | `end_turn` | terminou normalmente | encerra com sucesso |
   | `requires_action` | espera confirmação ou resultado de ferramenta | avisa e sai (este app é mínimo, não trata ferramentas) |
   | `retries_exhausted` | falhou de vez | avisa e sai com erro |
   | `budget_reached` | bateu o teto de gasto da sessão | avisa e sai com erro |

## Limites deste scaffold

- **Só uma pergunta e uma resposta.** Não tem laço de conversa nem histórico.
- **Não trata ferramentas.** Se o agente pedir uma ferramenta custom ou uma
  confirmação, ele para e avisa, em vez de responder ao pedido.
- **Não reconecta.** Se o stream cair, os eventos daquele intervalo se perdem (o
  SSE não tem replay). O jeito certo é, a cada reconexão, buscar
  `sessions.events.list()` e juntar removendo repetidos pelo `id` do evento.
- **Não arquiva a sessão** ao terminar. O ID sai no stderr pra você inspecionar
  depois; arquivar sessão é limpeza normal, mas foi deixado de fora de propósito.

## Código de saída

`0` quando o agente respondeu e a sessão terminou o turno. `1` em qualquer outro
caso — credencial recusada, agente ou ambiente não encontrado, limite de uso,
falha de rede, ou a sessão parando por um motivo que não seja `end_turn`.
