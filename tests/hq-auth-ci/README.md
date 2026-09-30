# Homologação descartável de Auth e PostgREST

Esta pilha existe somente no runner Linux do workflow `.github/workflows/hq-auth.yml`. Não conecta ao Supabase remoto, não publica o produto e não instala Docker no computador do usuário. Todas as senhas e a chave HS256 são **fixtures públicas de teste**, inadequadas para qualquer ambiente persistente.

O workflow instala as dependências dos testes e chama `bash tests/hq-auth-ci/run.sh`. O runner exige a identidade do GitHub Actions, usa exclusivamente o socket Docker local e cria um projeto exclusivo por execução/tentativa. Um processo Node do runner encaminha somente `127.0.0.1:55433`, `127.0.0.1:59999` e `127.0.0.1:53000` aos containers PostgreSQL, Auth e REST. Antes de abrir as portas, verifica labels de projeto/serviço, participação exclusiva na rede interna esperada, NetworkID e IPv4 privado dentro da subnet desse projeto. Nenhum destino ou porta é configurável por URL externa. A rede dos containers continua `internal: true`; não há SMTP, OAuth, hooks externos ou acesso de saída pelos serviços. Downloads ocorrem na preparação de dependências e no pull das imagens, antes dos testes.

O encaminhamento evita a limitação [internal bridge + published ports](https://github.com/moby/moby/issues/36174), observada no primeiro CI: três serviços saudáveis internamente, mas conexão recusada na porta publicada do host. O Docker documenta o [acesso direto do host à bridge interna](https://docs.docker.com/engine/network/port-publishing/#gateway-modes). O runner confirma conectividade TCP com os destinos e os três listeners antes dos testes. O processo não registra conteúdo de tráfego e é encerrado, junto com seus sockets, no cleanup; a bridge não ganha uma rede externa.

| Serviço | Imagem fixada | Fonte oficial |
| --- | --- | --- |
| PostgreSQL | `postgres:17.11-bookworm` | [docker-library/postgres](https://github.com/docker-library/postgres/blob/master/versions.json) |
| Supabase Auth | `supabase/gotrue:v2.196.0` | [Compose oficial Supabase](https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml), [Auth v2.196.0](https://github.com/supabase/auth/tree/v2.196.0) |
| PostgREST | `postgrest/postgrest:v14.17` | [Compose oficial Supabase](https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml), [PostgREST v14.17](https://github.com/PostgREST/postgrest/tree/v14.17) |

As tags não usam `latest`. O runner registra os IDs e RepoDigests efetivamente resolvidos, sem afirmar imutabilidade de uma tag. Uma atualização desses pins exige nova execução dos testes.

O health check `postgrest --ready` está implementado na [CLI v14.17](https://github.com/PostgREST/postgrest/blob/v14.17/src/PostgREST/CLI.hs#L131-L134) e consulta o endpoint do servidor administrativo configurado. A imagem x86-64 usa [Cmd `/bin/postgrest`, sem EntryPoint](https://github.com/PostgREST/postgrest/blob/v14.17/nix/tools/docker/default.nix#L20-L26); o `command: ["postgrest"]` também segue o Compose oficial Supabase.

`db-init.sql` prepara apenas roles, extensões e o schema vazio de Auth. O próprio GoTrue aplica suas migrations e cria `auth.users`, `auth.sessions`, `auth.uid()` e `auth.jwt()`: [uid oficial](https://github.com/supabase/auth/blob/v2.196.0/migrations/20220224000811_update_auth_functions.up.sql), [jwt oficial](https://github.com/supabase/auth/blob/v2.196.0/migrations/20220531120530_add_auth_jwt_function.up.sql). Não há substituição desses helpers nem inserção SQL de usuários nesta homologação HTTP. O harness cria usuários pela API administrativa e faz login por senha para obter tokens reais de usuário; somente as chaves sintéticas de serviço/anon e casos negativos são assinados pelo teste.

`public-fixtures.sql` exige que Auth já esteja pronto e cria somente as dependências mínimas do aplicativo, com RLS e sem acesso direto às tabelas para os roles de API. O harness aplica os pacotes versionados e verifica as RPCs via PostgREST. O teste concorrente preexistente roda antes, em outro banco de nome aleatório, descartado por ele; seus stubs de Auth não entram no banco `hq_auth_ci`.

O contrato do harness é `CI=true`, `HQ_AUTH_CI_DISPOSABLE=1`, `HQ_AUTH_CI_PG_URL` no banco `hq_auth_ci`, `HQ_AUTH_CI_AUTH_URL=http://127.0.0.1:59999`, `HQ_AUTH_CI_REST_URL=http://127.0.0.1:53000` e a chave sintética definida em `run.sh`. A URL Auth aponta diretamente para GoTrue, sem prefixo `/auth/v1`.

`artifacts/hq-auth-ci/infra.json` contém somente commit, imagem/digest, estado/saúde/exit code dos containers e resultado da limpeza. `checks.json` é o resumo sanitizado do harness. Não coletar Docker logs, inspect completo, variáveis, JWTs, refresh tokens, corpos de login ou tabelas Auth como artefatos. A rotina de saída executa `down --volumes --remove-orphans` apenas para este projeto, inclusive após falha. Cancelamento forçado ainda depende do descarte do runner efêmero pelo GitHub.

Depois da limpeza, o runner publica no `GITHUB_STEP_SUMMARY` somente uma projeção validada de estado/saúde/exit code, resultado da limpeza e IDs/digests das três imagens. Não faz upload de artefatos nem publica o JSON completo.

Este ensaio cobre PostgreSQL, Auth e PostgREST reais; não reproduz toda a plataforma hospedada. Gateway/API keys de produção, políticas de MFA, e-mail entregue, envio de convites, navegador/CSP e pagamentos reais ficam fora deste escopo. Sucesso aqui não autoriza ativação ou migração em produção.
