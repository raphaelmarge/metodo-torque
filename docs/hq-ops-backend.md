# Backend operacional HQ — proposta local

Estado: **SQL preparado e testado apenas em PostgreSQL/WASM descartável. Não aplicado ao Supabase.** Base do checkout: `7019199b27d60068c581a8dd83c08a6df2d7f83d`. Esta entrega não cria usuário, credencial, assinatura, pagamento externo, permissão real, webhook ou migração remota.

O arquivo `supabase/hq-ops-proposal.sql` é uma proposta explícita, fora de `supabase/migrations`. Ele pressupõe as tabelas existentes `public.academias`, `public.saas_admins`, `public.saas_clientes` e Supabase Auth. Deve ser revisado e convertido em migração versionada somente após autorização de aplicação. Executar o arquivo novamente após sucesso falha nas tabelas existentes; não é um instalador idempotente e não deve ser incluído em deploy automático.

## Separação e autorização

Os dados internos ficam no schema `torque_hq`: `staff`, `leads`, `invoices`, `payments`, `expenses`, `expense_payments`, `incidents`, `cases`, `case_messages`, `subscription_requests`, `commands` e `audit`. Todas as tabelas têm RLS e nenhum acesso direto de `anon`/`authenticated`; o schema não recebe `USAGE` desses papéis. As funções auxiliares também não são APIs. Não existe leitura de `dados`, pacotes de alunos, prontuários ou conteúdo de treino.

Somente `public.hq_ops_snapshot()` e `public.hq_ops_command(p_command jsonb)` recebem `EXECUTE` de `authenticated`; `PUBLIC` e `anon` são revogados. Ambas usam `SECURITY DEFINER`, `search_path=''`, referências qualificadas e guarda de identidade no servidor. O proprietário de instalação precisa ser um papel de banco confiável; clientes nunca recebem esse papel.

`auth.uid()` é o ator. A presença em `public.saas_admins` concede o papel administrativo existente. Os demais papéis dependem de `torque_hq.staff(user_id,role,enabled)`; a proposta não insere nenhuma linha e `enabled` nasce falso. Não existe comando cliente para conceder acesso. A remoção/desabilitação é consultada em cada RPC, inclusive antes de replay idempotente.

| Papel | Dados e operações autorizados |
|---|---|
| `admin` | Todos os domínios e comandos da allowlist; auditoria e `reports.export` |
| `finance` | Contas, contas a pagar/receber, registros manuais, solicitações de cancelamento e `reports.export`; sem leads, atendimento, incidentes ou auditoria global |
| `sales` | Apenas leads próprios; cria atribuídos a si, sem transferir para outra pessoa; sem listar clientes globais |
| `support` | Chamados próprios ou sem responsável e contas vinculadas a esses chamados; pode assumir, criar, atualizar, anotar e preparar respostas |
| `engineering` | Incidentes e UUIDs de contas afetadas, sem nomes de clientes, mensagens ou financeiro |
| `viewer` | Somente fatos básicos de contas, com nome substituído por `Conta`; sem escrita ou exportação |

`permissions` é uma lista de strings: `sales.read/write`, `customers.read/write`, `finance.read/write`, `support.read/write`, `health.read/write`, `audit.read`, `reports.export`. `customers.write` nesta versão habilita somente **solicitação** de cancelamento. A UI deve verificar também a permissão de leitura do domínio ao exportar; `reports.export` não concede acesso a dados adicionais. Não há RPC de exportação nem registro de exportação no servidor nesta versão.

Um usuário `staff` pode não ser `saas_admin`. O adapter pode consultar `hq_sou_admin` para decidir fallback legado; o valor falso não deve impedir a tentativa de `hq_ops_snapshot`, que faz sua própria autorização. Snapshot negado ou indisponível e `hq_sou_admin=false` mantêm o painel bloqueado. Nunca usar falha de autorização como justificativa para carregar fontes legadas.

## Snapshot

Sem argumentos. Retorna:

```js
{
  version: 1,
  meta: { mode: 'server', generatedAt: 'ISO', commandsAvailable: true },
  now: 'ISO', role: 'admin', permissions: ['...'], currentUserId: 'UUID',
  operators: [{ id: 'UUID', name: 'rótulo de papel + identificador' }],
  accounts: [], subscriptions: [], invoices: [], payments: [],
  expenses: [], expensePayments: [], leads: [], events: [],
  cases: [], incidents: [], audit: [], integrations: [],
  subscriptionRequests: [], sources: { /* metadados por domínio */ }
}
```

`operators` não consulta nome/e-mail de `auth.users`: usa rótulos do papel e parte do UUID, limita a lista conforme atribuição permitida. Clientes recebem somente o conjunto autorizado no servidor; filtros, busca, listas e contagens no navegador não têm acesso a linhas ocultas.

Formas dos registros:

| Lista | Campos |
|---|---|
| `accounts` | `id,name,product,createdAt,status,trialEndsAt,accessStatus` |
| `invoices` | `id,accountId,label,dueDate,competenceDate,totalCents,status,origin,createdAt` |
| `payments` | `id,accountId,invoiceId,paidAt,amountCents,kind,confirmed,origin,reference` |
| `expenses` | `id,payee,label,dueDate,totalCents,competenceDate,status,origin` |
| `expensePayments` | `id,expenseId,paidAt,amountCents,kind,confirmed,origin,reference` |
| `leads` | `id,name,stage,source,notes,createdAt,updatedAt,owner,nextActionAt,lossReason` |
| `cases` | `id,accountId,subject,channel,priority,status,owner,nextActionAt,createdAt,updatedAt,firstResponseAt,resolvedAt,incidentId,messages` |
| `messages` | `id,text,visibility,delivery,createdAt,actorId` |
| `incidents` | `id,title,severity,status,owner,release,accountIds,createdAt,updatedAt` |
| `audit` | `id,actorId,actorRole,action,objectId,reason,idempotencyKey,payloadHash,createdAt` |
| `subscriptionRequests` | `id,accountId,externalId,effectiveAt,status,note,createdAt` |

As contas usam os fatos de `academias` e `saas_clientes`. `status` é a classificação comercial legada; `accessStatus` é `academias.assinatura_status`. Não são equivalentes a pagamento confirmado. `trialEndsAt` permanece `null`: o backend não infere a data de criação como início contratual do trial.

As fontes financeiras novas são **somente manuais** (`origin:'manual'`, `scope:'manualOnly'`). `ready` significa que esse livro manual está disponível, não que todas as operações reais do negócio foram reconciliadas. Não misturar automaticamente `saas_pagamentos` com este ledger. `competenceDate:null` é competência desconhecida, não a data do pagamento.

O atendimento tem cobertura `sources.cases.scope:'opsOnly'`: somente casos criados na nova central. O SQL não lê, copia nem marca mensagens de `saas_tickets` ou `suporte_chamados`. `sources.legacySupport` declara `unavailable`, `reason:'migration_pending'`, `migrationPending:true` e `updatedAt:null` para quem pode ler atendimento. Para outros papéis, indica somente `forbidden`. A interface deve manter esse aviso visível e rotular contagens como casos da nova central; zero novo não significa ausência de atendimento histórico. No fallback legado, `hq_suporte_threads` fornece somente resumo, não a íntegra das mensagens nem a outra tabela de chamados.

Uma integração futura segura precisa de RPC de leitura separada, paginada, inicialmente administrativa, com projeção de campos mínimos e sem chamada a `hq_suporte_lista` (essa RPC antiga marca mensagens como lidas). Migração/importação e atribuição dos registros antigos exigem decisão e trabalho próprios. O acesso explícito ao painel legado não equivale a uma fonte de histórico integrada nesta central.

`subscriptions` e `integrations` ficam vazios e `unavailable`, pois não há integração contratual confiável nesta proposta. `events` fica vazio/indisponível: não há eventos de visita, ativação ou conversão inventados. Dados não autorizados ficam vazios e a fonte retorna `unavailable` com `reason:'forbidden'`. `sources.updatedAt` representa a consulta do snapshot quando disponível, não a ocorrência do último evento. Considere qualquer KPI de assinatura, MRR, conversão ou SLA de resposta indisponível quando faltar sua fonte, e não zero.

## Comandos

Envelope obrigatório, enviado como argumento `p_command`:

```js
{
  type: 'invoice.recordPayment',
  idempotencyKey: 'UUID-ou-chave-estavel-8-a-128-caracteres',
  reason: 'Recebimento conferido manualmente',
  payload: { id: 'UUID-da-fatura', amountCents: 2994, paidAt: '2026-10-21', reference: 'comprovante-123' }
}
```

O motivo tem 3–500 caracteres; o payload total não pode ultrapassar 20 KB. Campos desconhecidos são rejeitados no envelope e no payload. A chave deve ser mantida ao repetir uma tentativa cujo resultado seja desconhecido. Resposta: `{ok:true,id,type,replayed:false,externalEffect:false}`. O replay do mesmo ator, chave e conteúdo retorna o mesmo ID com `replayed:true`; chave reutilizada com conteúdo diferente falha. O hash SHA-256 cobre todo o JSONB canônico, incluindo o motivo.

| `type` | `payload` |
|---|---|
| `lead.create` | `name`; opcionais `stage,source,notes,owner,nextActionAt,lossReason` |
| `lead.update` | `id`; opcionais `name,stage,source,notes,owner,nextActionAt,lossReason` |
| `invoice.create` | `accountId,dueDate,totalCents`; opcionais `label,competenceDate` |
| `expense.create` | `payee,label,dueDate,totalCents`; opcional `competenceDate` |
| `invoice.recordPayment` | `id,amountCents,paidAt`; opcional `reference` |
| `expense.recordPayment` | `id,amountCents,paidAt`; opcional `reference` |
| `case.create` | `subject`; opcionais `accountId,channel,priority,status,owner,nextActionAt,incidentId` |
| `case.update` | `id`; opcionais `accountId,subject,priority,status,owner,nextActionAt,incidentId`; o canal de origem é preservado |
| `case.message` | `id,text`; opcional `visibility` |
| `incident.create` | `title`; opcionais `severity,status,owner,release,accountIds` |
| `incident.update` | `id`; opcionais `title,severity,status,owner,release,accountIds` |
| `subscription.requestCancel` | `accountId`; opcionais `id` (referência externa informativa), `effectiveAt,note` |

Vocabulários:

- Lead: `novo,contato,demo,proposta,fechado,perdido`. Perda exige `lossReason`.
- Chamado: `aberto,em_andamento,aguardando,resolvido`; canal `manual,app,email,whatsapp`.
- Incidente: `aberto,investigando,monitorando,resolvido`.
- Prioridade e severidade: `baixa,media,alta,critica`.
- Faturas/despesas: `open,partial,paid`, calculado pelos registros de pagamento.
- Mensagem: `visibility:internal|customer`. Interna fica `delivery:internal`; resposta ao cliente fica `delivery:not_sent`.

IDs são UUIDs. `owner` aceita UUID de administrador ou staff habilitado do domínio pertinente, ou `null`; nunca nome livre. Datas civis exigem `YYYY-MM-DD` válido entre 2000 e 2100. Instantes aceitam data civil (meia-noite UTC) ou ISO com fuso explícito. Valores exigem número JSON inteiro positivo em centavos, no máximo `100000000000`; strings, frações, zero e negativos falham. Pagamento no futuro não pode ser confirmado. O horário de auditoria, abertura, resolução e edição vem do servidor.

Cada baixa bloqueia a fatura/despesa com `FOR UPDATE`, soma o já registrado e rejeita excesso. A referência não vazia é única por fatura/despesa, protegendo contra outra chave para o mesmo comprovante. Replay, reserva de comando, alteração e auditoria participam da mesma transação. Falha desfaz todos. As tabelas guardam ator real, e a auditoria guarda razão, hash e antes/depois. O snapshot de auditoria omite antes/depois para não expor corpo de mensagens por padrão.

`confirmed:true` em pagamento significa **confirmado manualmente pelo operador**, sem confirmação de gateway. A versão inicial não possui comando de estorno ou saída financeira externa; `kind` permanece `payment`. A referência do pagamento não é verificada em banco/gateway. Não é contabilidade fiscal nem conciliação automatizada.

Nenhuma mensagem é enviada para WhatsApp, e-mail ou aplicativo. O primeiro rascunho não preenche `firstResponseAt`, preservando a honestidade do SLA. Cancelamento apenas cria `subscription_requests.status='requested'`: não cancela gateway, não altera acesso, não modifica `saas_clientes` e não altera `academias`.

## Verificação local

```powershell
node tests/test-hq-ops-sql.js
node tests/test-hq-ops-auth-browser.js
```

O teste usa a dependência fixada `@electric-sql/pglite` de `tests/runtime` e uma base em memória. Cria somente fixtures sintéticas. Em 30/09/2026: **67 verificações passaram**, cobrindo RLS/grants, anonimato, usuário comum, staff desabilitado, acesso por papel, propriedade de leads/chamados, ator real, idempotência, payload diferente, centavos, datas, referências, parcial/saldo AP/AR, ausência de efeitos externos, auditoria atômica, revogação e declaração da cobertura incompleta de atendimento.

PGlite verifica SQL real, mas não substitui testes de sessões concorrentes no PostgreSQL remoto, PostgREST, JWT real, MFA, backups, volume, índices sob carga, envio externo ou gateway. O desenho usa locks de linha e chave única; o teste ainda não demonstra contenção entre conexões independentes.

O teste de autorização no navegador abre a rota real `apps/hq.html` com cliente e respostas sintéticos, servidor em loopback e toda rede externa bloqueada. **22 verificações passaram**: ausência do store genérico de academia, troca de usuário, redução de papel na mesma sessão, remoção de detalhes/mensagens do DOM, leitura e comando negados, limpeza de diálogos e ausência de fallback privilegiado. O teste exige Playwright de `tests/ci` e Chrome local (ou `CHROMIUM_PATH`). Ele valida integração da interface; não autentica um usuário real nem acessa o Supabase.

## Dependências antes de aplicação e lançamento

1. Revisar a proposta e gerar uma migração versionada após autorização explícita, com cópia/restauração testada. Não incluir o schema `torque_hq` nos schemas expostos pelo Data API.
2. Escolher responsáveis e conceder staff por operação administrativa auditável; nenhum acesso é presumido ou criado nesta entrega. Definir MFA e sessão revogada para HQ antes de uso por equipe; a guarda atual usa `auth.uid` e vínculo administrativo, não exige `aal2` nem consulta `auth.sessions`.
3. Decidir importação dos leads/configuração antiga sem sincronizá-los pelo `dados` das academias. A proposta não migra `hqLeads`, `hqConfig`, tickets ou recebimentos históricos.
4. Concluir Pagar.me e validar vínculo de cada objeto ao cliente, assinatura de webhook, idempotência, estorno, conciliação e segregação da cobrança SaaS. Asaas continua alternativa não conectada.
5. Associar o módulo influencers existente por identificadores e contrato de eventos, sem criar cadastro paralelo. Regra aprovada: R$ 49,90 mensais, 14 dias grátis, primeira cobrança com cupom R$ 29,94, comissão única R$ 19,96 após pagamento, reserva R$ 4,99 e saldo Torque R$ 4,99; renovação sem comissão. Nenhum desses pagamentos é executado nesta proposta. Compra antes do trial permanece decisão pendente.
6. Acrescentar paginação/filtros de servidor quando volume exigir. O snapshot inicial não limita silenciosamente a coleção; evitar usar o retorno integral como solução indefinida para bases grandes. Definir retenção da auditoria/idempotência e registro de exportações antes de crescimento.
