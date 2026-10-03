# Agendar sessão — confirmação e repetição segura

Alvo confirmado pelo usuário: `personal.html`, tela **Agendar sessão** do Personal.
Base inspecionada: `e11509237f9205e75db8d90565c5fb6db501252c`.
Branch isolada: `fix/personal-session-booking`.

## Causa e comportamento

O handler de `sAdd` gravava `st.sessoes` por `save(st)` sem verificar o retorno.
Somente turmas e recorrências exibiam alerta; uma sessão avulsa ficava sem
confirmação. O aviso de choque permitia prosseguir inclusive para o mesmo
aluno/data/horário. Cada tentativa gerava outro ID aleatório.

Agora a tela:

- Exibe **Sessão agendada com sucesso!** após gravação confirmada, em região
  `role=status`, com foco quando o formulário continua visível.
- Em modo local, confirma a gravação local e informa **Salva neste aparelho.**
  Em conta conectada, aguarda recibo do conteúdo confirmado pela nuvem.
  Falha/offline/timeout não anunciam sucesso; a cópia pendente continua preservada.
- Captura a intenção antes de aguardar o lock; desabilita envio durante o trabalho.
  A seleção não muda silenciosamente a sessão que está sendo salva.
- Para sessão existente, informa **Você já possui um agendamento para esta sessão.**
  O botão indica **Sessão já agendada** no modo local ou **Conferir agendamento**
  quando precisa conferir a nuvem, inclusive depois de recarregar.
- Preserva alunos diferentes no mesmo horário, serviços distintos, os avisos de
  bloqueio/choque, modalidade online, turmas e recorrência. Identidade da sessão:
  aluno + data + horário + tipo de serviço (vazio = Personal). IDs e vínculo da
  sessão remarcada continuam intactos. Lote com duplicata é recusado integralmente.
- Duplicar uma regra fixa idêntica também é recusado. Cancelar uma sessão remove
  a ocorrência pelo fluxo existente, permitindo reagendar sem duplicação.

## Persistência e concorrência

`navigator.locks` serializa a leitura/validação/gravação entre abas da mesma
origem. Navegador sem essa API recebe erro explícito e não faz uma gravação
insegura. O lock é liberado em falha/timeout/fechamento da aba.

Isso não substitui o servidor. O modelo já possui:

1. `dados_personal_patch`: lock `FOR UPDATE`, comparação `antes/depois` e erro
   `PT409` quando outra versão da mesma lista venceu. `sessoes` é uma lista
   atômica, não uma união de itens com IDs aleatórios.
2. `dados_cas` para gravação da versão completa, com a revisão lida.
3. Reenvio do mesmo patch já aplicado é um no-op; RLS e sessão ativa continuam
   obrigatórias. Uma edição de outro aparelho não vira sobrescrita silenciosa.

`MTStore.confirmaPersonal()` aguarda a fila existente e devolve somente o
conteúdo que o store recebeu como confirmado, verificando revisão e ciclo da
conta. Nunca devolve o documento otimista como recibo. A tela confere que as
sessões solicitadas estão nesse conteúdo. Após 15s sem confirmação, informa
resultado desconhecido. Uma resposta tardia não muda o feedback daquela tentativa;
repetir confere a sessão pendente, sem criar outra.

A proteção de concorrência existente foi testada em PostgreSQL 17.11 real com
conexões independentes e observação de `pg_blocking_pids`. Por isso não foi
necessária nova migration/RPC/política. Não há constraint global nova de
unicidade: este PR protege o fluxo atual junto ao CAS existente, não uma escrita
arbitrária que crie duplicatas diretamente no JSON ou um cliente antigo que
escolha deliberadamente duplicar após ler a versão atual. Duplicatas históricas
não são apagadas. Qualquer futura alteração de banco/limpeza em produção exige
escopo e autorização adicionais; nenhum SQL remoto foi executado.

## Arquivos

- `personal.html`: feedback, intenção capturada, lock, validação e confirmação.
- `apps/store.js`: API de leitura do recibo confirmado; preserva CAS, fila e RLS.
- `assets/versao.js`, `sw.js`, `app/app-sw.js`: versão `mt-v853`, com arquivos já
  presentes no precache. Sem alteração de builder/skin; demos não precisam ser
  regeneradas por esta mudança.
- `tests/test-personal-agendamento.js`: tela real em Chromium, rede externa
  bloqueada, dados sintéticos, Web Locks/localStorage reais; recibos de rede
  controlados. Não é prova de HTTP/JWT do Supabase nem de produção.
- `tests/test-personal-agendamento-postgres.js`: banco descartável criado e
  removido em loopback, RPC canônica e políticas reais com fixtures locais.
- `tests/test-sync-cas.js`: recibo real do store com transporte simulado;
  resposta incompleta, falha, conflito e troca de conta não geram recibo.
- `tests/test-personal.js`: espera da conclusão assíncrona e expectativas novas
  de duplicata. As verificações de choque entre sessões distintas permanecem.

## Verificação local

Dependências dos três lockfiles instaladas usando `npm ci --prefix tests/<runtime|sql|ci>
--cache /tmp/torque-npm-cache --ignore-scripts --no-audit --no-fund`.
Servidor do worktree em `127.0.0.1:8796`. Comandos executados:

```sh
BASE_URL=http://127.0.0.1:8796 CHROMIUM_PATH=/usr/bin/chromium node tests/test-personal-agendamento.js
PGTESTURL=postgresql://postgres:torque-test-only@127.0.0.1:55438/postgres node tests/test-personal-agendamento-postgres.js
node tests/test-sync-cas.js
node tests/test-sync-identidade.js
node tests/test-studio-patches.js
node tests/test-agenda-contratos.js
node tests/test-confiabilidade-sql.js
PGTESTURL=postgresql://postgres:torque-test-only@127.0.0.1:55438/postgres node tests/test-sync-postgres-real.js
node tests/test-versao.js
NODE_PATH=$PWD/tests/ci/node_modules BASE_URL=http://127.0.0.1:8796 CHROMIUM_PATH=/usr/bin/chromium node tests/test-personal.js
git diff --check
```

Resultados focados: 23 verificações de UI; 8 verificações PostgreSQL de agenda;
18 cenários CAS/recibo; 13 de identidade/reconexão; 20 contratos da agenda;
18 SQL de confiabilidade; 47 PostgreSQL de sincronização; 17 de versão/cache.
Studio patches também aprovado. Todos usam dados sintéticos.

A execução ampla de `test-personal.js` parou num timeout do disclosure de
`#relCSV`, fora da agenda. Comparação com checkout-base e CI serão registradas
no PR; não se declara a suíte inteira aprovada com base nos testes focados.
Ambiente local: Node 24 e Chromium do sistema; CI prepara Node 22 e Playwright.

## Fora do escopo e entrega

O fluxo **Pedir um horário** do app do aluno é distinto: grava um pedido pendente
em `app_agenda_pede`, não uma sessão confirmada. Sua ausência de deduplicação foi
reproduzida localmente e registrada como achado separado; não foi corrigida aqui.

Nenhum arquivo de Pontal/HQ, núcleo nativo do PR866 ou branch dos PR864/865 foi
alterado. Sem merge, deploy, SQL remoto, dados reais ou credenciais novas.
O CLI GitHub informou token inválido; o conector existente foi validado para
preparar o draft PR. `.agents/skills` não existe no checkout e `/workspace/.agents`
está vazio; foram lidos `AGENTS.md` e contratos pertinentes.
