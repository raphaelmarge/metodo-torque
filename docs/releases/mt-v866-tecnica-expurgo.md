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
- `20261017183412_tecnica_video_dispatch_http_privado.sql`: substitui o transporte
  pelo cliente HTTP síncrono e adiciona recibos operacionais privados.
- `supabase/functions/tecnica-limpeza/index.ts`: worker interno.

O projeto deve ter `pgcrypto`, `supabase_vault`, `pg_cron` e `http`. A sequência
histórica também pressupõe `pg_net`, mas o dispatcher final não o usa. A terceira
migration instala `http` no schema dedicado `torque_http`, de propriedade de
`postgres`, se ainda não existir. Revoga USAGE e CREATE do schema para PUBLIC,
`anon`, `authenticated` e `service_role`, e verifica privilégios efetivos antes
e depois de instalar. Assim, mesmo funções cujo EXECUTE público foi concedido
pela plataforma não ficam invocáveis por esses papéis. O dispatcher continua
executável somente pelo operador/owner. Se `http` já estiver instalado em outro
schema, a migration falha fechada: não move a extensão nem altera seus grants.

A migration de agendamento gera o segredo aleatório diretamente no Vault; o valor não é
incluído no código, no histórico Git, no navegador ou em comandos de deployment.
O worker usa apenas `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`, fornecidos pelo
ambiente Supabase. Não precisa de um segundo secret sincronizado manualmente.

O contrato HTTP é POST com `Authorization: Bearer <segredo exclusivo do Vault>`.
Esse Bearer **não é** um JWT de usuário, chave anon ou service role. O antigo
cabeçalho `x-tecnica-secret` é recusado. A Edge chama, com `service_role`,
`tecnica_limpeza_autoriza(p_segredo)`, que compara digests SHA-256 com o segredo
do Vault. Só o booleano `true` permite consultar a fila. Bearer ausente, segredo
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
`service_role` da Edge.

## Transporte e limites de segurança

A inspeção do projeto em 17/10/2026 mostrou que o `REVOKE` da segunda migration
não alterou o SELECT herdado de PUBLIC em `net.http_request_queue`: seu grantor
e owner eram `supabase_admin`. O job continuava inativo e nenhum segredo havia
sido enviado. Por isso a terceira migration substitui a função de disparo, sem
alterar schemas, ACLs ou filas de `pg_net` e sem modificar a migration já aplicada.

Uma primeira tentativa da terceira migration também detectou grants HTTP de
`supabase_admin` que `postgres` não conseguia revogar. O guard abortou a transação
e a extensão permaneceu ausente. Como a migration não foi registrada, seu SQL foi
ajustado para instalar diretamente no schema privado controlado por `postgres`.
Não existe fallback para instalar funções de rede em um schema acessível ao cliente.

`torque_http.http` faz a chamada na própria conexão do cron. O segredo é obtido
em memória e enviado no cabeçalho padrão Authorization; nenhum pedido é gravado
em `net.http_request_queue`. O endpoint aceito é HTTPS, sem parâmetros, no caminho
fixo `/functions/v1/tecnica-limpeza` de um projeto Supabase. O operador deve conferir
que o project ref corresponde ao mesmo backend antes de ativar.

O pgsql-http segue redirecionamentos de POST. **Não há configuração suportada para
desativá-los nas versões 1.6/1.7**: não usar um GUC fictício FOLLOWLOCATION. O worker
destino não redireciona; o Authorization padrão recebe a proteção do libcurl contra
reenvio a outro host/protocolo/porta. Isso não equivale a uma proibição absoluta de
redirecionamentos, nem protege uma credencial de um endpoint do próprio projeto
que tenha sido comprometido. Não substituir Authorization por um header próprio.

O timeout total usa `http.timeout_msec=55000`, compatível com http 1.6 e 1.7.
`http_set_curlopt` limita conexão a 5 segundos e restaura a configuração anterior
também em falhas. O snapshot completo das opções, mantido somente em memória,
é restaurado com `http_reset_curlopt` e `http_set_curlopt`, preservando opções em
segundos, opções não relacionadas e ausência de overrides; nunca passa NULL ao setter.
O helper fixa `client_min_messages=warning`. Como a extensão escreve cabeçalhos em
DEBUG2, ele falha fechado antes de ler o Vault quando `log_min_messages` permitir
DEBUG2 ou mais detalhado. Não habilitar esse log para diagnosticar o worker.

Cada tentativa ativa gera um ID em `torque_private.tecnica_limpeza_execucoes`.
O registro contém somente horários, resultado de uma lista fechada, status HTTP e
três contagens inteiras entre 0 e 50. Não armazena endpoint, headers, corpo HTTP,
segredo, SQLERRM ou mensagens originais de transporte. Logs têm RLS, leitura apenas
do serviço/operador e retenção de 30 dias. O retorno bigint do dispatcher passa a
ser esse ID, não um request_id de pg_net. Um advisory lock evita disparos simultâneos
do cron e do operador na mesma transação/banco.

## Sequência de ativação

1. Aplicar as três migrations na ordem e publicar `tecnica-video` e
   `tecnica-limpeza` com os helpers compartilhados. Em uma atualização que já tem
   as duas primeiras, manter `ativo=false`, republicar o worker com Bearer e
   aplicar a terceira. A migration de agendamento
   cria o job de dez em dez minutos, mas `tecnica_limpeza_config.ativo=false` e
   `endpoint=null` impedem qualquer chamada antes da ativação.
2. Conferir que o worker publicado usa `verify_jwt=false` e responde 401 a um
   POST sem Authorization e com uma chave pública/JWT em seu lugar. Não extrair
   o segredo para testar manualmente. Conferir `http` em `torque_http`, owner
   `postgres` do schema, ausência efetiva de USAGE/CREATE para os três papéis e
   `log_min_messages` acima de DEBUG2. Testar que uma chamada direta às funções
   HTTP é negada mesmo quando `has_function_privilege` indicar EXECUTE público.
3. Um operador autorizado define o endpoint HTTPS do **mesmo projeto** e ativa
   o singleton. O endpoint deve terminar em `/functions/v1/tecnica-limpeza`.
   Conferir o project ref antes de ativar; o SQL restringe o formato, não compara
   automaticamente o project ref com o ambiente que está recebendo a migration.
4. Usar `tecnica_limpeza_dispara()` como operador e consultar o ID retornado em
   `torque_private.tecnica_limpeza_execucoes`. A chamada aguarda o HTTP, por até
   55 segundos; não rodá-la em uma transação com outras alterações pendentes.
   O job SQL terminar **não comprova** expurgo: conferir `resultado='ok'`,
   `http_status=200`, contagens e `terminado_em` no recibo. Não consultar headers
   ou corpos de chamadas em tabelas de extensões.
5. Conferir HTTP 200 e contagens, ausência de objetos de um caso sintético
   autorizado e retirada dos respectivos recibos. HTTP 503 mantém a fila para
   tentativa seguinte. `deferred` indica trabalho adiado pelo orçamento de
   tempo; verificar também a idade do recibo vencido mais antigo para detectar
   backlog. Desativar `ativo` interrompe novas chamadas sem apagar a fila.

A Edge tem um timeout global de 48 segundos e limites de 12 segundos por chamada,
abaixo dos 55 segundos configurados no dispatcher síncrono. Os testes locais
não substituem a homologação do http/libcurl e da Edge instalados no projeto.
Sem a terceira migration, o worker Bearer e a ativação conferida, não declarar
o expurgo periódico operacional.

## Verificação local

- `tests/test-tecnica-video-server.js`: 70 verificações com Postgres WASM,
  incluindo CASCADE por um papel sem INSERT na fila, exclusão direta da revisão,
  preservação dos caminhos e isolamento por permissões.
- `tests/test-tecnica-limpeza.js`: 47 verificações do worker/adaptador, incluindo
  falha/retry, confirmação após Storage, limite do lote, escopo de academia,
  caminhos inválidos, autenticação estrita e corpo ignorado.
- `tests/test-tecnica-video-agendamento.js`: 17 verificações SQL locais da
  migration histórica, Vault simulado, autorização e agendamento desativado.
  Esse teste com owner local não prova que o REVOKE funciona no Supabase real.
- `tests/test-tecnica-video-http.js`: 75 verificações SQL das três migrations,
  com HTTP simulado: Bearer privado, logs saneados, falhas, contagens inválidas,
  compatibilidade de timeout, restauração de curlopt, bloqueio de DEBUG2,
  preservação do SELECT público existente no pg_net e ausência total de envio
  à fila, além de chamadas reais negadas por USAGE/CREATE com EXECUTE público e
  owner de funções `supabase_admin`. Instalação existente em outro schema e
  CREATE herdado de outro papel bloqueiam a migration sem mover a extensão. A extensão
  nativa/libcurl não é executada pelo Postgres WASM.

## Verificação do backend publicado — 17/10/2026

No projeto de produção do Personal, `hdcufkaalxfhwmfwoiqp`, as três migrations
foram registradas como `20261017183150`, `20261017183155` e `20261017184338`.
As Edge Functions `tecnica-video` e `tecnica-limpeza` estão na versão 2, com
`verify_jwt=true` e `false`, respectivamente; o worker exige o Bearer privado.
O bucket permanece privado, as tabelas têm RLS e os papéis do cliente não têm
SELECT. O schema `torque_http`, de owner `postgres`, contém http 1.6 e não concede
USAGE/CREATE a `anon`, `authenticated` ou `service_role`.

POST sem autorização no vídeo foi recusado com 401. No worker, ausência de
Authorization, Bearer sintético inválido e o antigo header próprio retornaram 401.
A configuração foi ativada somente após essas verificações. A execução operacional
1 retornou HTTP 200 sem pendências. A execução 2 terminou às 18:44:16 UTC com
HTTP 200, `processed=1`, `failed=0` e `deferred=0`: um recibo sintético de objeto já
ausente passou pelo DELETE real do Storage e foi retirado da fila. Não restou
recibo do teste, não se criou objeto de aluno nem se utilizou um aluno real.

Isso verifica autenticação, transporte HTTP, fila e confirmação no ambiente real;
não equivale a um teste de upload e resposta com um aluno real. A publicação do
frontend é uma etapa separada, condicionada aos checks do commit final.

Fontes oficiais consultadas em 17/10/2026:

- https://supabase.com/docs/guides/functions/schedule-functions
- https://supabase.com/docs/guides/functions/auth
- https://supabase.com/docs/guides/database/vault
- https://supabase.com/docs/guides/database/extensions/pg_net
- https://supabase.com/docs/guides/database/extensions/http
- https://github.com/pramsey/pgsql-http
- https://raw.githubusercontent.com/pramsey/pgsql-http/v1.6.3/http.c
- https://raw.githubusercontent.com/pramsey/pgsql-http/v1.7.0/http.c
- https://curl.se/libcurl/c/CURLOPT_HTTPHEADER.html
- https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl
