# Relatórios operacionais do HQ — implementação local

Base de trabalho: `7019199b27d60068c581a8dd83c08a6df2d7f83d`, com o patch local de indicações integrado pela tarefa principal. Este módulo não publica código, aplica migrações, consulta produção nem grava dados de clientes.

## Escopo entregue

O dashboard permanece uma visão rápida. Relatórios oferece exploração com catálogo, gráficos de barras pequenos com valores, séries diárias/mensais, tabelas de 20 registros por página, acesso ao registro e atalhos para a operação correspondente. O catálogo contém:

| Área | Relatórios | Fonte |
| --- | --- | --- |
| Comercial | Funil e conversão de coortes; pipeline e próximos contatos | `accounts`, `events`, `payments`; `leads` |
| Clientes e assinaturas | Entradas e saídas; assinaturas e churn; trials próximos do vencimento | `accounts`, `events`, `subscriptions` |
| Financeiro | Receita recorrente; caixa; contas a receber; contas a pagar; competência | `subscriptions`, `invoices`, `payments`, `expenses`, `expensePayments` |
| Indicações | Cupons, comissões e repasses | Atalho para o módulo oficial `referrals`; não duplica o ledger |
| Atendimento | Fila e prazos; histórico por abertura, incluindo resolvidos | `cases` |
| Saúde do produto | Incidentes em acompanhamento; histórico por abertura | `incidents` |

Cada relatório apresenta definição, corte da consulta, fontes, origem e atualização. Não utiliza nome, email, assunto, mensagens ou notas nas colunas de exportação. Identificadores e estados bastam para chegar ao caso pelo botão de detalhe.

## Integração

Arquivos deste módulo: `assets/hq-ops-reports.js`, `tests/test-hq-ops-reports.js` e este documento. Carregar depois de `hq-ops-metrics.js`. A montagem é responsabilidade do shell autenticado:

```js
container.innerHTML = HQOpsReports.render(snapshot, ctx);
const cleanup = HQOpsReports.bind(container, ctx);
```

`ctx` contém `snapshot`, `filters`, `can(permission)`, `navigate(area, filters)`, `openDetail(kind, id)` e opcionalmente `notify(message)`. O motor vem de `ctx.metrics` ou `window.HQOpsMetrics`. A função `bind` devolve uma limpeza dos listeners e substitui bindings anteriores no mesmo contêiner. Não cria clientes de rede, persistência local ou credenciais.

Filtros do shell: `from`, `to`, `timeZone`, `now`, `product`, `accountId`, `accountStatus`/`status` e `cohort:{from,to}`. Filtros próprios: `report`, `reportMetric`, `rowStatus`, `page`. O controle mensal de coorte converte `YYYY-MM` em limites explícitos do mês; não altera o período principal. A navegação local preserva os filtros em `ctx.filters`.

`rowStatus` filtra somente as linhas. Os números gerais e denominadores permanecem identificados como a base selecionada, evitando mudar silenciosamente o churn ao escolher o estado de uma linha. O estado global da conta, quando passado pelo shell, usa `accountStatus`/`status` e alcança a população antes do cálculo.

Destinos: `sales`, `customers`, `finance`, `referrals`, `support`, `health`. Detalhes: `account`, `subscription`, `invoice`, `payment`, `expense`, `lead`, `case`, `incident`. Movimentos de MRR abrem a conta; recebimentos abrem a fatura quando vinculados; pagamentos de despesas abrem a obrigação. Não há mutações no módulo de relatórios.

Classes adicionais para o shell: `.hq-reports-catalog`, `.hq-reports-summary`, `.hq-report-stat`, `.hq-report-bar`, `.hq-report-series`, `.hq-source-list` e `.hq-table-wrap`, além dos componentes `.hq-card`, `.hq-btn`, `.hq-table`, `.hq-toolbar`, `.hq-field`, `.hq-section`.

## Regras dos indicadores

- Churn: contas pagantes no início que deixaram de ser pagantes no fim observado, divididas pela base pagante inicial. Sem denominador não resulta em zero.
- Entradas/saídas: números absolutos e percentuais sobre a base viva inicial. Contas internas/demonstração/cortesia ficam fora da base comercial, conforme o motor compartilhado.
- Conversão de coortes: janela analítica fixa padrão de **30 dias**, declarada no resultado, com pagamentos dentro dessa janela e somente contas já maduras no denominador. O trial comercial permanece **14 dias**. Publicação, checkout e pagamento são marcos independentes; pagamentos posteriores à janela podem aparecer no marco geral até o corte, mas não no numerador da conversão fixa.
- MRR: valor contratual recorrente vigente. Ganhos/perdas de MRR não representam lucro nem fluxo de caixa.
- Caixa: entradas, estornos e saídas confirmados pela data de pagamento. O resultado não é DRE nem confirmação de conciliação bancária.
- Contas a receber/pagar hoje: saldos de obrigações individuais vencendo na data atual no fuso da operação, mesmo quando o relatório histórico usa outro período. Pagamentos são aplicados à obrigação correspondente.
- Projeção: saldos futuros dentro do período escolhido. Não é recebimento ou pagamento executado.
- Competência: exige data explícita de competência. Datas de criação, vencimento e pagamento não a substituem.
- Suporte/incidentes: a fila atual ignora o período histórico de propósito e avisa isso. Relatórios de histórico aplicam o período à abertura, inclusive para registros hoje resolvidos; não inferem data de resolução, satisfação, SLA, disponibilidade ou usuários afetados.

Despesas globais sem alocação explícita não são rateadas entre contas/produtos. O histórico de incidentes ou chamados sem vínculo necessário também fica indisponível sob filtros de população. Pipeline sem produto informado não vira zero ao aplicar filtro de produto.

## Fontes e permissões

Fontes usam `sources[domain].status` com `ready`, `unavailable`, `error` ou `stale`. Apenas `ready` autoriza exibir/exportar registros; `ready` com lista vazia produz um vazio real. Falha, falta de fonte e atualização pendente têm mensagens distintas. Nenhuma delas é substituída por zero. Séries futuras de caixa ficam indisponíveis.

**Cobertura parcial de atendimento:** `sources.cases.scope = "opsOnly"` significa somente os chamados da nova operação. O histórico de `public.saas_tickets` e `public.suporte_chamados` não foi integrado. Os relatórios de fila e histórico mostram um aviso persistente antes dos números, repetido na definição e no CSV; os totais não são apresentados como todo o suporte. `sources.legacySupport` aparece como fonte indisponível com `reason: "migration_pending"`, `migrationPending: true` e `scope: "legacyOnly"`. Esses metadados não autorizam leitura nem importação de chamados antigos. Sem metadados explícitos de cobertura, o relatório avisa que a cobertura ainda não foi confirmada.

O catálogo e a construção direta de um relatório exigem suas permissões de leitura. Relatórios que combinam contas e valores contratuais exigem `customers.read` e `finance.read`; o funil completo também exige `sales.read`. A exportação exige adicionalmente `reports.export`. A validação é repetida ao exportar ou abrir um registro. A autorização real é responsabilidade do adapter/servidor: a interface não concede acesso nem substitui políticas de backend.

Exportação CSV: UTF-8 com BOM, separador `;`, quebras CRLF, aspas escapadas e neutralização de células que poderiam iniciar fórmulas (`=`, `+`, `-`, `@`, espaços/tabulações antes dessas sequências). Inclui período, fuso, coorte, estado, corte, definição e fontes. Exporta todos os registros filtrados, além da página visível, sempre pelas mesmas colunas mínimas da tabela. CSV da simulação traz **SIMULAÇÃO LOCAL — DADOS FICTÍCIOS**. Fontes indisponíveis, antigas ou sem linhas não têm exportação.

## Verificação realizada

```text
node tests/test-hq-ops-reports.js --browser
17 grupos de testes de relatórios aprovados
```

Inclui execução real em Chrome local: abrir catálogo/relatório, paginar, filtrar etapa e período, abrir registro, clicar no gráfico para mudar o intervalo, navegar à operação e rebinding sem duplicação de listeners. Todas as requisições de rede são bloqueadas; execução concluiu sem requisições nem erros de página.

Testes de dados e segurança cobrem permissão negada, exportação separada, estados das fontes, zero real, denominador vazio, estágio canônico do pipeline, coorte mensal, conversão de 30 dias, centavos e baixa parcial, CSV seguro, exclusão de PII desnecessária, paginação, HTML malicioso, fontes ausentes, datas inválidas, históricos resolvidos e não duplicação do módulo de indicações.

A cobertura parcial de atendimento também tem teste próprio: aviso antes dos indicadores, definição e CSV com escopo/origens, fonte antiga pendente e garantia de não incluir registros do legado nos números ou na exportação.

## Limites restantes

Os dados reais dependem de fontes e contratos homologados pelo backend. A integração analítica/exportação de indicações permanece no módulo oficial e não é inventada aqui. O teste do módulo não valida produção, autenticação HTTP real, pagamentos, concorrência PostgreSQL ou migrações; esses pontos pertencem à homologação unificada. Gráficos e números da prévia local são explicitamente fictícios e reiniciam com a sessão.
