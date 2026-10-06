# Backend operacional HQ — proposta local

Estado: **preparacao local, nao aplicada ao Supabase**. Esta revisao parte de `b05222a2852bd1e96d9a91804d3cd5bdd4f59d22` e acrescenta modo minimo para administradores existentes, gate privado de equipe e escopo explicito de atendimento. Nao cria usuario, credencial, staff, vinculo de conta, assinatura, pagamento externo, webhook ou migracao remota. Aplicar o SQL concede novas capacidades operacionais aos administradores existentes; nao e uma alteracao apenas estrutural.

O arquivo `supabase/hq-ops-proposal.sql` é uma proposta explícita, fora de `supabase/migrations`. Ele pressupõe as tabelas existentes `public.academias`, `public.saas_admins`, `public.saas_clientes` e Supabase Auth. Deve ser revisado e convertido em migração versionada somente após autorização de aplicação. Executar o arquivo novamente após sucesso falha nas tabelas existentes; não é um instalador idempotente e não deve ser incluído em deploy automático.

## Separação e autorização

Os dados internos ficam no schema `torque_hq`: `settings`, `staff`, `staff_account_scope`, `leads`, `invoices`, `payments`, `expenses`, `expense_payments`, `incidents`, `cases`, `case_messages`, `subscription_requests`, `commands` e `audit`. As 14 tabelas tem RLS; grants de schema, tabelas, sequencias e auxiliares sao explicitamente revogados de `PUBLIC`, `anon`, `authenticated` e `service_role`. Nao ha policies nem `FORCE RLS`: o proprietario confiavel das funcoes executa as operacoes autorizadas. Revokes diretos nao removem eventual heranca de outros papeis; verificar ACLs efetivas antes da instalacao. Nao ha leitura de `dados`, pacotes de alunos, prontuarios ou treinos.

Somente `public.hq_ops_snapshot()` e `public.hq_ops_command(p_command jsonb)` recebem `EXECUTE` de `authenticated`; `PUBLIC`, `anon` e `service_role` sao explicitamente revogados. Ambas usam `SECURITY DEFINER`, `search_path=''`, referencias qualificadas e guarda no servidor. O proprietario de instalacao deve ser um papel confiavel, nunca entregue a clientes. A transacao emite `NOTIFY pgrst,'reload schema'`; emitir a notificacao nao comprova que PostgREST recarregou ou que Auth HTTP foi homologado.

`auth.uid()` e o ator. A presenca em `public.saas_admins` concede o papel administrativo antes do gate. `torque_hq.settings` recebe um unico seed `id=true,staff_enabled=false`. Mesmo um staff com `enabled=true` nao entra enquanto o gate estiver falso ou ausente. Os outros papeis exigem simultaneamente `settings.staff_enabled=true` e `staff.enabled=true`. Nenhum staff e inserido. Nenhum comando cliente cria/habilita staff ou muda o gate. Revogacao e desabilitacao valem na proxima RPC, inclusive antes de replay. Esta revisao nao acrescenta MFA nem verificacao de sessao ativa.

O atendimento usa `torque_hq.staff_account_scope(user_id,account_id,granted_by,created_at)`, com chave composta `(user_id,account_id)`. Somente admin existente concede/remove scope pelos comandos auditados `support.scope.grant/revoke`. O alvo deve ser staff de papel `support`, com usuario Auth e conta existentes. O comando nao cria usuario, nao habilita staff e nao liga o gate; pode preparar escopo com equipe desligada. Nao ha nova tela de gestao de papeis/escopos.

Conhecer o UUID ou ser responsavel pelo chamado nao concede a conta. O atendente ve contas preconcedidas e, entre elas, chamados proprios/sem responsavel. Chamado sem conta fica privado ao seu responsavel; criar intake ou remover o vinculo fixa o owner no atendente atual. Caso sem conta e sem owner fica restrito ao admin. Vincular/revincular exige scope preconcedido para a conta de destino. Revogar scope remove conta, chamados e mensagens da proxima leitura e bloqueia comandos/replays antigos, preservando historico. Isso nao promete cancelar operacao ja autorizada e em andamento.

| Papel | Dados e operações autorizados |
|---|---|
| `admin` | Todos os domínios e comandos da allowlist; auditoria e `reports.export` |
| `finance` | Contas, contas a pagar/receber, registros manuais, solicitações de cancelamento e `reports.export`; sem leads, atendimento, incidentes ou auditoria global |
| `sales` | Apenas leads próprios; cria atribuídos a si, sem transferir para outra pessoa; sem listar clientes globais |
| `support` | Contas explicitamente concedidas; dentro delas, chamados proprios ou sem responsavel; intake sem conta somente proprio; pode criar, assumir, atualizar, anotar e preparar respostas dentro desse escopo |
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

As contas usam os fatos de `academias` e `saas_clientes`. `status` é a classificação comercial legada; `accessStatus` é `academias.assinatura_status`. Não são equivalentes a pagamento confirmado. Na migração operacional de 6/10, `trialStatus` preserva o estado da assinatura e `trialEndsAt` usa somente `assinatura_vence` finito para trial; prazo ausente permanece desconhecido, sem inferir uma data pelo cadastro comercial.

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
| `support.scope.grant` | `userId,accountId`; somente admin existente, sem ativar staff |
| `support.scope.revoke` | `userId,accountId`; somente admin existente, preserva casos/mensagens |
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

O teste usa `@electric-sql/pglite` fixado em `tests/runtime`, banco em memoria e fixtures sinteticas. Nesta revisao local, **103 verificacoes passaram**: gate minimo negando todos os papeis staff mesmo habilitados; admin existente preservado; revogacao explicita de grants padrao de `service_role`; escopo sem autoatribuicao; relink protegido; intake privado; revogacao antes de leitura/comando/replay; grant/revoke auditados; e os cenarios financeiros/operacionais anteriores. As fixtures ligam a equipe por SQL administrativo explicito apenas no banco descartavel para testar os demais papeis. A instalacao real continua com gate falso.

A versao anterior passou 49 verificacoes de concorrencia em PostgreSQL 17.11 no CI, com locks observados entre conexoes independentes. `tests/test-hq-concurrency-pg.js` agora tambem testa o modo minimo e liga o gate explicitamente apenas na fixture; a execucao real desta revisao esta pendente. PGlite nao substitui essa execucao, PostgREST, JWT real, MFA, restauracao, volume, indices sob carga, envio externo ou gateway. Nenhum servico novo precisa ser instalado/iniciado como efeito colateral desta preparacao.

O teste de autorização no navegador abre a rota real `apps/hq.html` com cliente e respostas sintéticos, servidor em loopback e toda rede externa bloqueada. **22 verificações passaram**: ausência do store genérico de academia, troca de usuário, redução de papel na mesma sessão, remoção de detalhes/mensagens do DOM, leitura e comando negados, limpeza de diálogos e ausência de fallback privilegiado. O teste exige Playwright de `tests/ci` e Chrome local (ou `CHROMIUM_PATH`). Ele valida integração da interface; não autentica um usuário real nem acessa o Supabase.

## Dependências antes de aplicação e lançamento

1. Revisar a proposta e gerar uma migração versionada após autorização explícita, com cópia/restauração testada. Não incluir o schema `torque_hq` nos schemas expostos pelo Data API.
2. Manter `settings.staff_enabled=false` na ativacao minima. Uma futura abertura da equipe exige autorizacao separada para gate, staff habilitado, escopos e responsaveis. Definir MFA e sessao revogada antes do uso por equipe; a guarda atual usa `auth.uid` e vinculo administrativo, nao exige `aal2` nem consulta `auth.sessions`.
3. Decidir importação dos leads/configuração antiga sem sincronizá-los pelo `dados` das academias. A proposta não migra `hqLeads`, `hqConfig`, tickets ou recebimentos históricos.
4. Concluir Pagar.me e validar vínculo de cada objeto ao cliente, assinatura de webhook, idempotência, estorno, conciliação e segregação da cobrança SaaS. Asaas continua alternativa não conectada.
5. Associar o módulo influencers existente por identificadores e contrato de eventos, sem criar cadastro paralelo. Regra aprovada: R$ 49,90 mensais, 14 dias grátis, primeira cobrança com cupom R$ 29,94, comissão única R$ 19,96 após pagamento, reserva R$ 4,99 e saldo Torque R$ 4,99; renovação sem comissão. Nenhum desses pagamentos é executado nesta proposta. Em 6/10 o proprietário escolheu Pagar.me e cobrança somente após os 14 dias. A abertura da conta e a homologação continuam necessárias: `docs/personal/PAGARME-ATIVACAO-20261006.md`.
6. Acrescentar paginação/filtros e agregados de servidor quando volume exigir. O snapshot inicial não limita silenciosamente a coleção; evitar usar o retorno integral como solução indefinida para bases grandes. A migração de 6/10 registra solicitações de exportação com hash do CSV, corte e filtros; retenção da auditoria/idempotência continua decisão operacional.

## Ponte de leitura do suporte anterior — 6/10/2026

`hq_ops_legacy_support(jsonb,integer,uuid)` consulta `saas_tickets` e
`suporte_chamados` somente para administradores já presentes em `saas_admins`.
A interface apresenta 25 registros por página, filtro de conta, próxima página,
página anterior e erro com recarga. O servidor limita a 50, ordena por data,
origem e ID, e mantém o mesmo corte de criação entre páginas. Alterações de
status posteriores ao corte são lidas como estado atual, sem prometer snapshot
histórico transacional entre chamadas.

Não chama `hq_suporte_lista`, que marca mensagens como lidas. Não grava status,
respostas, leitura, novos tickets, migrações de dados ou concessões de acesso.
Email, nome do remetente e ID Auth não entram no resultado. Mensagens acima de
8.000 caracteres são explicitamente abreviadas; o canal original permanece
disponível. Resposta registrada nunca é apresentada como entregue.

Essa leitura é separada dos casos operacionais: números da nova central seguem
com escopo `opsOnly`, sem somar mensagens antigas como se fossem casos. Não há
disparo externo de resposta, confirmação de entrega ou importação do histórico
para `torque_hq.cases`.

Migração allowlist adicional: `20261006145701_hq_suporte_legado_leitura.sql`.
Índices de cursor e por conta preservam todas as linhas; DDL recusa espera de
lock acima de 5s e execução acima de 30s. Não ampliar timeout automaticamente
em produção: avaliar volume/contenção caso o índice não caiba nesse limite.
