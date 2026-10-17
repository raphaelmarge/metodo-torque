# Expurgo de vídeos técnicos — mt-v866

## Ciclo de exclusão

O botão Excluir grava primeiro um tombstone, que bloqueia novos uploads e links
de leitura. Em seguida tenta apagar os objetos atuais no Storage. Os caminhos
ficam preservados por mais duas horas e cinco minutos, cobrindo URLs de upload
anteriormente assinadas e uma requisição de assinatura já em andamento.

Apagar definitivamente um aluno provoca `ON DELETE CASCADE`. Um trigger
`BEFORE DELETE` em `app_tecnica_revisoes` copia os caminhos para
`app_tecnica_orfaos` **antes** de desaparecerem os metadados dos arquivos. O
recibo guarda apenas caminho, academia e datas. Não contém token do aluno,
observações ou respostas. Não há FKs que possam apagar esses recibos junto com
alunos ou academias. A fila tem RLS e acesso apenas de `service_role`.

O trigger fica em `torque_private`, com `search_path` vazio e EXECUTE revogado
dos papéis públicos. Usa `SECURITY DEFINER` para que uma exclusão já autorizada
na tabela pai consiga registrar o expurgo mesmo quando o chamador não tem
INSERT na fila. Não recebe argumentos ou caminhos do cliente.

`supabase/functions/_shared/tecnica-cleanup.mjs` processa tombstones e órfãos.
Somente um Storage DELETE bem-sucedido permite confirmar o recibo. Falha de rede,
erro do Storage ou erro no acknowledgement mantém trabalho para a execução
seguinte. Um objeto já ausente pode ser apagado novamente com segurança.
O acknowledgement inclui o prazo lido para não remover um recibo cujo prazo foi
estendido por outra transação. Os caminhos são validados e o bucket é fixo.

A limpeza oportunista ao abrir a lista permanece limitada à academia da sessão,
com até dois recibos. O worker periódico processa até 50 recibos vencidos por
execução, de todas as academias, sem depender de outro acesso ao aplicativo.
Revogar acesso não apaga os vídeos automaticamente: o professor conserva o
comando de exclusão, sem receber acesso à mídia revogada.

## Autenticação e configuração do worker

Arquivos de implantação:

- `20261017180206_tecnica_video_privada.sql`: tabelas, recibos e trigger.
- `20261017182409_tecnica_video_agendamento_privado.sql`: Vault, autorização e
  agendamento, inicialmente sem endpoint ativo.
- `supabase/functions/tecnica-limpeza/index.ts`: worker interno.

O projeto deve ter `pgcrypto`, `supabase_vault`, `pg_cron` e `pg_net`. A migration
de agendamento gera o segredo aleatório diretamente no Vault; o valor não é
incluído no código, no histórico Git, no navegador ou em comandos de deployment.
O worker usa apenas `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`, fornecidos pelo
ambiente Supabase. Não precisa de um segundo secret sincronizado manualmente.

O contrato HTTP é POST com `x-tecnica-secret`. A Edge chama, com `service_role`,
`tecnica_limpeza_autoriza(p_segredo)`, que compara digests SHA-256 com o segredo
do Vault. Só o booleano `true` permite consultar a fila. Header ausente, segredo
inválido ou falha da RPC não iniciam limpeza. O corpo não é lido e não permite
escolher caminhos, academia, prazo ou quantidade. As respostas têm apenas
contagens e mensagens genéricas; não imprimir headers, corpo de autenticação,
paths ou valores de `vault.decrypted_secrets` em logs.

Esta função exige `verify_jwt=false`, pois usa autenticação interna obrigatória
e não um login de aluno ou profissional. Configuração equivalente:

```toml
[functions.tecnica-limpeza]
verify_jwt = false
```

Isso se aplica somente ao worker. Não altera a configuração de autenticação das
outras Edge Functions. A função de autorização não é executável por `anon` ou
`authenticated`, e a função SQL que dispara o job não é executável nem pelo
`service_role` da Edge. A migration também retira a leitura pública da fila
`net.http_request_queue`, que contém os headers até o envio pelo `pg_net`.

## Sequência de ativação

1. Aplicar as duas migrations na ordem e publicar `tecnica-video` e
   `tecnica-limpeza` com os helpers compartilhados. A migration de agendamento
   cria o job de dez em dez minutos, mas `tecnica_limpeza_config.ativo=false` e
   `endpoint=null` impedem qualquer chamada antes da ativação.
2. Conferir que o worker publicado usa `verify_jwt=false` e responde 401 a um
   POST sem `x-tecnica-secret`. Não extrair o segredo para testar manualmente.
3. Um operador autorizado define o endpoint HTTPS do **mesmo projeto** e ativa
   o singleton. O endpoint deve terminar em `/functions/v1/tecnica-limpeza`.
   Conferir o project ref antes de ativar; o SQL restringe o formato, não compara
   automaticamente o project ref com o ambiente que está recebendo a migration.
4. Usar `tecnica_limpeza_dispara()` como operador para enfileirar uma execução e
   observar somente ID, status HTTP e timeout em `net._http_response`. O job
   completar a consulta SQL significa que a requisição foi enfileirada;
   **não comprova** que a Edge retornou sucesso.
5. Conferir HTTP 200 e contagens, ausência de objetos de um caso sintético
   autorizado e retirada dos respectivos recibos. HTTP 503 mantém a fila para
   tentativa seguinte. `deferred` indica trabalho adiado pelo orçamento de
   tempo; verificar também a idade do recibo vencido mais antigo para detectar
   backlog. Desativar `ativo` interrompe novas chamadas sem apagar a fila.

A Edge tem um timeout global de 48 segundos e limites de 12 segundos por chamada,
abaixo dos 55 segundos configurados no `pg_net`. Não foi agendado nem implantado
remotamente por esta etapa; sem implantação e ativação, não há garantia de
expurgo periódico em produção.

## Verificação local

- `tests/test-tecnica-video-server.js`: 70 verificações com Postgres WASM,
  incluindo CASCADE por um papel sem INSERT na fila, exclusão direta da revisão,
  preservação dos caminhos e isolamento por permissões.
- `tests/test-tecnica-limpeza.js`: 40 verificações do worker/adaptador, incluindo
  falha/retry, confirmação após Storage, limite do lote, escopo de academia,
  caminhos inválidos, autenticação estrita e corpo ignorado.
- `tests/test-tecnica-video-agendamento.js`: 17 verificações SQL locais da
  configuração, Vault simulado, autorização e agendamento desativado.

Fontes oficiais consultadas em 17/10/2026:

- https://supabase.com/docs/guides/functions/schedule-functions
- https://supabase.com/docs/guides/functions/auth
- https://supabase.com/docs/guides/database/vault
- https://supabase.com/docs/guides/database/extensions/pg_net
- https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl

