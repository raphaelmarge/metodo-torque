# Backend HQ e cortesia temporária — 05/10/2026

Preparação da publicação integrada autorizada pelo proprietário. Este documento
registra o artefato revisado e as verificações locais; não comprova implantação
remota. A aplicação e o registro final da implantação pertencem à coordenação da
release. As referências anteriores a autorização futura descrevem as entregas
locais de setembro, não anulam a autorização atual.

## SQL exato e ordem

Aplicar somente a allowlist abaixo, após comparar o histórico e o catálogo do
projeto `metodo-torque` (`hdcufkaalxfhwmfwoiqp`). Não executar `db push` global nem
aplicar migrations encontradas por ordem de nome. OPS e Equipe não são instaladores
repetíveis; interromper em qualquer divergência em vez de reparar parcialmente.

| Ordem | Arquivo | SHA-256 dos bytes UTF-8/LF |
| --- | --- | --- |
| 1 | `supabase/releases/hq-admin-minimal/migrations/20260930225233_hq_ops_admin_minimal.sql` | `74fa28ef7e8436e746aae291fa5a8dac86fe57c600f6c1a6c9c412de4e707357` |
| 2 | `supabase/releases/hq-team-admin-local/migrations/20260930232737_hq_team_registry.sql` | `8c292d836891c5e8c0227201dab5707f549985c1c063d287a9e8aec86d176e6c` |
| 3 | `supabase/migrations/20261005150924_personal_cortesia_temporaria.sql` | `e087592eb1f7ee832f12d8fb735aafc97e3882ad13b9deb75e091589253cd79c` |

Os dois primeiros pacotes e seus rollbacks permanecem byte a byte iguais aos
manifests já versionados. O nome da terceira migration foi criado pela Supabase
CLI 2.118.0 com `migration new personal_cortesia_temporaria`; a CLI não foi ligada
ao projeto remoto. A regra de cortesia também pode ser aplicada independentemente
dos pacotes HQ, pois não depende deles.

## Efeito e preservação

OPS cria a central de registros administrativos e auditoria para os administradores
já presentes em `public.saas_admins`. Equipe acrescenta cadastro e revisão de
perfis propostos. `staff_enabled=false` permanece obrigatório. Nenhuma dessas
instalações cria usuários, concede escopos, aprova acessos, envia convites, move
dinheiro ou transforma resposta em mensagem enviada. Cancelamento permanece
pedido administrativo. Fontes financeiras externas e suporte legado não passam
a existir por instalar essas tabelas.

Os módulos opcionais de comissão/campanha/portal não pertencem à allowlist acima.
Não são dependências de OPS, Equipe ou cortesia. A instalação desses módulos no
banco descartável do teste de integração não é instrução para ativá-los no projeto.

A cortesia modifica apenas `public.minha_assinatura()`. Quando a linha já contém
`assinatura_status='cortesia'`, retorna `cortesia:true`, o prazo gravado em
`assinatura_vence` e a trava calculada no relógio do servidor. O instante do
vencimento já é encerrado. Prazo nulo ou infinito não libera acesso; texto inválido
é recusado pelo tipo `timestamptz`. O cálculo é independente do relógio do telefone.

Não existe concessão automática, prazo comercial inventado, reinício de trial,
novo endpoint de concessão nem mudança em clientes. `ativa`, `vitalicia`, `trial`,
`atrasada` e demais estados conservam integralmente a resposta anterior. A seleção
continua a primeira academia vinculada por `minhas_academias()`, como no contrato
vigente. O modo offline do painel permanece o já existente.

A RPC pessoal fixa `search_path=''`, exige `auth.uid()` e remove EXECUTE de
`PUBLIC`/`anon`. `authenticated` e `service_role` conservam EXECUTE; a chave de
serviço sem identidade continua recebendo `null`, não uma conta arbitrária.
Nenhuma outra ACL é alterada. A autenticação não adiciona imposição de MFA nem
revogação imediata de JWT por logout; o teste distingue isso de revogar o vínculo
ou o papel administrativo no banco, que vale na chamada seguinte.

## Evidência anterior à aplicação

Leitura de definições e metadados do Supabase em 05/10/2026 confirmou o contrato
legado de `minha_assinatura`, as colunas de assinatura em `academias` e a seleção
por `membros`. Não houve leitura de registros de alunos nem escrita remota nesta
preparação. O relatório de segurança remoto foi consultado: os avisos existentes
não foram tratados como autorização para revogar funções de outros produtos.

Foram executados com dados sintéticos:

| Verificação | Resultado local |
| --- | --- |
| `tests/test-personal-cortesia-sql.js` | 26 grupos aprovados em PGlite |
| mesmo teste com `--postgres` | 26 grupos aprovados em PostgreSQL 17.11 descartável |
| `tests/test-hq-ops-sql.js` | 103 verificações aprovadas |
| `tests/test-hq-backend-activation.js` | 17 grupos aprovados, pacote versionado |
| `tests/test-hq-team-registry-sql.js` | 105 verificações aprovadas |
| `tests/test-hq-team-activation.js` | 66 verificações aprovadas |
| `tests/test-hq-concurrency-pg.js` | 86 verificações aprovadas, conexões independentes e bloqueios observados no servidor |
| `tests/hq-auth-ci/package-input.cjs` | quatro manifests, allowlists, bytes LF e hashes aprovados |

A cobertura SQL inclui admin permitido, anon/usuário comum/equipe desligada
negados, isolamento de contas, metadata forjada, revogação de vínculo/papel,
idempotência, concorrência, saldos, auditoria, suspensão/retomada não destrutiva,
prazo de cortesia e igualdade dos estados legados. PGlite e os stubs da suíte SQL
não constituem prova de login real.

O harness `tests/hq-auth-ci` usa Auth e PostgREST reais no runner Linux descartável.
Foi estendido com seis grupos HTTP de cortesia e com a mesma recusa de JWT
malformado, assinatura inválida, algoritmo `none` e token expirado. Esses grupos
ainda devem passar no commit final da release. A pilha não é executada nem suas
guardas são removidas no Windows. O CI precisa também conservar os gates de OPS e
Equipe, incluindo reload HTTP dos endpoints após suspensão/retomada.

## Conferência final e recuperação

Antes: confirmar ausência de instalação conflitante, dependências e identidade do
projeto; congelar commit e hashes; conferir CI e disponibilidade operacional de
recuperação. Depois: conferir migrations, RLS, ACLs, `staff_enabled=false`, funções
e `search_path`; observar recarga do PostgREST e negação anônima por HTTP. Uma
resposta positiva autenticada exige sessão autorizada e não deve ser simulada
como evidência de login. Não inserir admin/cliente/convite real para um smoke test.

Para suspender HQ: usar primeiro `hq-team-suspend.sql`, depois
`hq-ops-suspend.sql`, dos próprios pacotes. Dados e auditoria são preservados. Para
retomar: OPS, depois Equipe, mantendo o gate desligado. Esses scripts não são
migrations para execução automática. A cortesia não altera dados; eventual
restauração da função deve utilizar a definição anterior capturada pela coordenação
e considerar que voltaria a negar cortesias. Não desativar benefício vigente
silenciosamente como correção de frontend.

Fontes verificadas: [Supabase Functions](https://supabase.com/docs/guides/database/functions),
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) e
[changelog PostgreSQL 15.19/17.11](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes).
Os pacotes desta frente não criam índices ltree/btree_gist, criptografia PGP legada
ou operadores com estimadores próprios mencionados nessa alteração.
