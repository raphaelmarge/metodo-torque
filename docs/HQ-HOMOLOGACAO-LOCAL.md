# Homologação local do HQ: evidências e pendências

Inventário e execução: **30/09/2026**, checkout `torque-hq-implementation`, branch `local/hq-operational-center`, base `7019199b27d60068c581a8dd83c08a6df2d7f83d` com alterações locais. Este documento não declara aplicação de SQL, autenticação HTTP homologada ou gateway conectado em produção.

**Resultado:** testes locais em PostgreSQL/WASM e navegador com serviços substituídos passaram. O teste novo de concorrência real está pronto para o PostgreSQL descartável já existente no CI, mas **a execução real permanece pendente até evidência do CI**. Não foi instalado nem iniciado serviço novo; nenhum banco remoto foi acessado nesta etapa.

## Ambiente encontrado

O inventário usou `Get-Command`, diretórios comuns de programas, nomes de processos/serviços e portas locais em escuta. Não procurou credenciais nem abriu dados de serviços.

| Recurso | Evidência local |
| --- | --- |
| Node.js, Chrome, Playwright e PGlite | Disponíveis; runtime do repositório instalado |
| `psql`, `postgres`, `initdb`, `pg_ctl`, `pg_isready` | Não encontrados no PATH nem nos diretórios comuns de PostgreSQL examinados |
| Docker, Podman, Supabase CLI | Não encontrados no PATH/diretórios comuns; nenhum processo/serviço correspondente |
| WSL | `wsl --list --verbose` informou que não está instalado; nenhuma instalação foi iniciada |
| Portas 5432, 55432, 54321, 54322, 3000, 8000 e 9999 | Nenhuma escuta encontrada; não houve consulta HTTP ou leitura de dados |
| `PGTESTURL` | Ausente; foi verificada apenas a presença da variável |
| Cliente `tests/sql/node_modules/pg` | Ausente localmente; lockfile fixa `pg@8.23.0` |
| PostgreSQL do CI | `.github/workflows/tests.yml` já define `postgres:17.11`, porta local 55432 e fixture descartável; não constitui prova de execução deste novo teste |

Essa busca cobre locais usuais e recursos em execução, não uma varredura exaustiva do disco. Não há `supabase/config.toml` local preparado para uma pilha Auth completa nesta entrega.

## O que foi efetivamente verificado

| Verificação | Resultado observado | Limite |
| --- | --- | --- |
| `node tests/test-hq-unified-sql.js` | 17 grupos passaram nesta etapa | Integra três SQL em PGlite com Auth sintético; sem concorrência entre conexões ou validação JWT |
| `node tests/test-confiabilidade-sql.js` | 18 verificações passaram nesta etapa | Com `PGTESTURL` ausente, somente trecho PGlite foi executado |
| `node tests/test-web-security.js` | 4 cenários passaram nesta etapa | VM/fetch substituídos; sem gateway ou identidade real |
| `node tests/test-hq-ops-sql.js` | 67 verificações passaram na etapa anterior desta mesma entrega | Autorização, filtros, valores, rollback, idempotência e auditoria com claims controlados |
| `node tests/test-hq-ops-auth-browser.js` | 22 verificações passaram na etapa anterior | Rota real em Chrome, respostas Supabase substituídas; troca de usuário, redução de papel, 42501, limpeza de DOM/diálogos; sem HTTP Auth real |
| `node --check tests/test-hq-concurrency-pg.js` | Passou | Sintaxe JavaScript |
| Guardas de configuração do novo runner | 10 verificações passaram sem conectar | Rejeita endereço remoto, hostname, protocolo, banco de controle indevido, query e fragmento |
| Fixture exportada do novo runner + três SQL canônicos | Aplicaram em PGlite | Valida o setup, não locks concorrentes reais |
| `node tests/test-hq-concurrency-pg.js` | **Não executado contra PostgreSQL: exit 1 por `PGTESTURL` ausente** | Nenhum PASS de concorrência foi emitido |

Os resultados da suíte geral e de `test-saas.js` são registrados pelo responsável pela integração; esta nota não os substitui. Guardar o SHA e o log do CI que realmente executar o novo runner antes de alterar a situação de pendente.

## Runner PostgreSQL real entregue

`tests/test-hq-concurrency-pg.js` reutiliza o serviço e cliente já previstos pelo CI. Aceita somente hosts literais `127.0.0.1`/`[::1]`, sem parâmetros/fragmento, com banco de controle `postgres`. Um endereço loopback não prova isolamento: não usar túnel, proxy para produção ou instância com dados reais.

Requer PostgreSQL 15+ (CI: 17.11), Node e `pg@8.23.0`. O usuário da fixture precisa criar um banco e, se ausentes, os papéis sintéticos `anon`, `authenticated`, `service_role`. O teste não concede esses papéis a pessoas reais. Cria `torque_hq_test_<20 caracteres hex aleatórios>`; no `finally`, fecha suas conexões e remove somente esse banco. Não remove bancos preexistentes ou papéis globais.

O banco recebe tabelas públicas mínimas e substitutos explícitos de `auth.uid()`/`auth.jwt()`, depois os arquivos canônicos, sem copiar suas funções para o teste:

1. `supabase/migrations/20260930193716_hq_referrals_ledger.sql`;
2. `supabase/hq-ops-proposal.sql`;
3. `supabase/hq-influencer-portal-proposal.sql`.

As conexões A, B e observadora têm PIDs distintos. A mantém uma transação aberta; B disputa a mesma operação; a observadora comprova o bloqueio por `pg_blocking_pids` antes do commit/rollback de A. O pequeno intervalo de polling não é usado como prova de concorrência. Os cenários financeiros usam o isolamento padrão `READ COMMITTED` declarado no setup.

| Cenário incluído | Critério de aprovação |
| --- | --- |
| Mesmo ator, chave e conteúdo | B aguarda A, recebe mesmo ID como replay; uma operação e uma auditoria |
| Mesma chave com conteúdo divergente | Uma confirma, outra recebe `22023`; nenhum efeito adicional |
| A desfaz enquanto B aguarda | B pode confirmar; objeto de A desaparece e sobra uma auditoria |
| Duas baixas AR/AP, operadores e chaves distintos | Lock por fatura/despesa; soma não ultrapassa saldo, tentativa recusada sem reserva/auditoria |
| Mesmo comprovante, chaves distintas | Uma baixa; segunda recebe `23505`; sem reserva órfã |
| Faturas diferentes | Segunda confirma enquanto a primeira transação permanece aberta; sem lock financeiro global |
| Revogação de staff já confirmada | Próxima RPC, inclusive replay antigo, recebe `42501`; outro operador continua autorizado |
| Remoção de admin e sessão do portal | Próxima RPC respeita o estado atual; portal com claims antigos recebe `IP401` para sessão removida |
| Integração do ledger | Campanha permanece desligada e baixas manuais não criam comissão |
| Atomicidade final | Quantidade de comandos = auditorias; todos os resultados idempotentes preenchidos |

Revogação de papel é testada **após seu commit e antes da próxima chamada**. O runner não promete cancelar uma operação que já passou pela autorização e estava em andamento. Corridas de aceite/revogação de convite, edição simultânea de chamados/leads e eventos reais do gateway são cenários adicionais, não cobertos por este runner. Edições atuais têm lock e auditoria, mas não um contrato de revisão otimista para impedir a última edição de substituir campos da anterior.

No CI existente, após preparar as dependências, executar `node tests/test-hq-concurrency-pg.js` como etapa obrigatória. O runner falha quando falta infraestrutura; não converte ausência do banco em aprovação ou fallback PGlite. A suíte existente `tests/test-sync-postgres-real.js` continua cobrindo concorrência de sincronização e não é substituída.

## Autenticação HTTP, JWT e MFA: pendências separadas

`set_config('request.jwt.claims', ...)` testa decisões SQL com uma identidade fornecida pelo teste. Não verifica assinatura JWT, login, refresh, expiração HTTP, PostgREST, API gateway ou MFA. Para homologar essa camada são necessários Auth/GoTrue, PostgREST, gateway, PostgreSQL e uma caixa de e-mail local, todos descartáveis, com usuários sintéticos. A pilha e o runner HTTP ainda não estão disponíveis nesta entrega.

Há também diferenças de implementação: `torque_hq.actor_role()` consulta `auth.uid()` e o cadastro atual de admin/staff, mas **não consulta `auth.sessions` nem exige `aal2`**. Já `hq_influencer_private.identity()` verifica sessão ativa e e-mail confirmado. Portanto, bloquear imediatamente um JWT antigo após revogar sua sessão e exigir MFA para operações do HQ são lacunas atuais, não meramente testes aguardando execução. JWTs podem continuar válidos até expirar; a validação adicional da sessão é uma decisão explícita de implementação. [Sessões do Supabase](https://supabase.com/docs/guides/auth/sessions).

Uma regra de MFA precisa ser aplicada no servidor, inclusive nas RPCs `SECURITY DEFINER`; esconder botões ou adicionar apenas uma política RLS nas tabelas privadas não substitui a guarda da função. A decisão proposta é exigir `aal2` para administração e comandos financeiros, com fluxo de recuperação definido. Essa regra não foi implementada nem ativada nesta entrega. [MFA do Supabase](https://supabase.com/docs/guides/auth/auth-mfa).

| Matriz HTTP/Auth a executar na pilha descartável | Resultado esperado / situação |
| --- | --- |
| Sem token, anon, usuário comum | Acesso negado sem dados de outros domínios |
| JWT válido de admin e cada staff | Mesmas permissões e filtros da matriz SQL; staff não depende de `hq_sou_admin=true` |
| Assinatura inválida, `alg=none`, expirado, `nbf` futuro, emissor/audiência indevidos | Rejeição pela camada HTTP/JWT conforme configuração explícita; nenhuma RPC privilegiada executada |
| Metadata editável declara admin/partner | Ignorada; autoridade vem de tabelas internas e identidade real |
| Token antigo após logout/revogação de sessão | Portal deve negar; HQ exige decisão/correção de guarda antes de prometer negação imediata |
| Papel removido ou desabilitado com JWT ainda válido | Próxima RPC negada, incluindo replay; validar também retorno HTTP e limpeza da UI |
| Refresh e troca de usuário enquanto leitura está pendente | Resposta antiga descartada, menus/detalhes/diálogos e estado privilegiado limpos |
| URLs diretas de tabelas e schemas privados | Nenhuma leitura/escrita por `anon`/`authenticated`; apenas RPCs explicitamente autorizadas |
| Parceiros A/B, convite expirado/revogado, e-mail não confirmado | Sem acesso cruzado, sem aceitar convite inadequado, sem expor clientes ou saúde |
| TOTP `aal1` e `aal2`, fator inválido/removido | Dependente da regra MFA ainda ausente; testar token atualizado após alteração do fator |
| Exportação | Exige leitura do domínio e `reports.export`; ausência de permissão não entrega linhas ou contagens ocultas |
| Fontes falhas ou não migradas | `unavailable/error` preservados; suporte `opsOnly` e histórico `migration_pending` não viram zero ou fonte pronta |

O futuro teste HTTP deve criar usuários apenas pela API Auth da pilha local e usar tokens realmente assinados. Não deve sobrescrever `auth.uid()`/`auth.jwt()` nessa pilha nem usar um JWT fabricado como evidência de autenticação válida. Usar TOTP sintético, sem SMS, OAuth, SMTP externo, dados de alunos ou credenciais de produção.

## Comandos propostos para preparação futura — não executados

O CI já possui o PostgreSQL necessário. Para repetir em outro Windows, um Docker Engine **local**, previamente instalado/autorizado e com `postgres:17.11` em cache, permitiria o exemplo abaixo. A senha é a fixture pública descartável do CI, sem reutilização fora do contêiner. `--pull=never` impede download implícito, `127.0.0.1` limita a porta e não há volume do host. O endpoint `npipe` evita um contexto Docker remoto. [Docker run](https://docs.docker.com/reference/cli/docker/container/run/).

```powershell
# PROPOSTA; não foi executada nesta entrega.
$hqPgContainer = 'torque-hq-homolog-' + (Get-Date -Format 'yyyyMMddHHmmss')
$hqPgContainerId = docker --host npipe:////./pipe/docker_engine run --pull=never --rm --detach --name $hqPgContainer --publish 127.0.0.1:55432:5432 --env POSTGRES_PASSWORD=torque-test-only postgres:17.11
if ($LASTEXITCODE -ne 0 -or -not $hqPgContainerId) { throw 'Contêiner local não criado' }
try {
  docker --host npipe:////./pipe/docker_engine exec $hqPgContainerId pg_isready -U postgres
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL ainda não pronto; não executar testes' }
  npm ci --prefix tests/sql --ignore-scripts --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'Dependência SQL não preparada' }
  # Usar em shell descartável sem PGTESTURL anterior.
  $env:PGTESTURL = 'postgresql://postgres:torque-test-only@127.0.0.1:55432/postgres'
  node tests/test-hq-concurrency-pg.js
  if ($LASTEXITCODE -ne 0) { throw 'Concorrência HQ reprovada' }
  node tests/test-sync-postgres-real.js
  if ($LASTEXITCODE -ne 0) { throw 'Concorrência sync reprovada' }
} finally {
  Remove-Item Env:PGTESTURL -ErrorAction SilentlyContinue
  docker --host npipe:////./pipe/docker_engine stop $hqPgContainerId
}
```

Para a camada HTTP, preparar futuramente uma versão fixada da Supabase CLI e suas imagens locais. Antes de usar, ler `supabase --help`, `supabase init --help`, `supabase start --help` e `supabase stop --help`. A CLI requer Docker/configuração e recomenda pelo menos 7 GB de RAM para a pilha completa. Usar **diretório vazio e isolado**, pois `start` pode aplicar migrations/seeds do diretório. Não iniciar a pilha na raiz deste repositório nem apontá-la para configuração de produção. [CLI do Supabase](https://supabase.com/docs/reference/cli/supabase-start).

Sequência proposta: `supabase --workdir <diretório-descartável> init`; revisar `config.toml`, identificador/portas exclusivos, exposição somente local, schemas públicos permitidos e provedores externos desabilitados; então `supabase --workdir <diretório-descartável> start`. Aplicar somente o baseline mínimo e os três SQL revisados **à instância local**, criando fixtures por Auth local. Nenhum `login`, `link`, `db push`, `--all` ou segredo remoto é necessário. Ao terminar, `supabase --workdir <diretório-descartável> stop` limita o encerramento ao projeto de teste. Esses comandos não foram executados e o futuro setup ainda requer revisão antes de rodar.

## Critério de encerramento

Registrar SHA, versões, nomes de cenários, PIDs e códigos de erro sanitizados; não anexar tokens, chaves ou conteúdo pessoal aos logs. A homologação de concorrência só encerra após CI com PostgreSQL real passar no SHA entregue. A homologação HTTP só encerra após pilha real, matriz negativa e decisão explícita sobre MFA/sessão. Aprovação de testes locais ou publicação de arquivos estáticos não implica autorização nem execução de migrations, gateway, envio de convites ou abertura de novos acessos.
