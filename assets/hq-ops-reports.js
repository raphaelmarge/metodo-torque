/* Operational reports: no network/storage and no writes to customer data.
 * Consume the authorized HQ snapshot; missing/stale/error sources never mean 0.
 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HQOpsReports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  var PAGE_SIZE = 20, bindings = typeof WeakMap === 'function' ? new WeakMap() : null;
  var STATES = { ready: 'Dados disponíveis', unavailable: 'Fonte indisponível', error: 'Falha na consulta', stale: 'Atualização pendente', denied: 'Acesso não autorizado' };
  var DOMAIN_LABELS = { accounts: 'Contas', subscriptions: 'Histórico de assinaturas', invoices: 'Faturas a receber', payments: 'Recebimentos confirmados', expenses: 'Obrigações a pagar', expensePayments: 'Pagamentos de despesas', leads: 'Oportunidades comerciais', events: 'Eventos confirmados', cases: 'Chamados da operação', legacySupport: 'Histórico de atendimento anterior', incidents: 'Incidentes' };
  var METRICS = {
    accountEntries: ['Contas que entraram', 'account'], accountExits: ['Contas que saíram', 'account'], openingAccounts: ['Base no início', 'account'], closingAccounts: ['Base no fim observado', 'account'],
    churn: ['Churn de contas pagantes', 'account'], payingAccounts: ['Contas pagantes no corte', 'account'], trialsExpiring: ['Trials a vencer em 7 dias', 'account'],
    mrr: ['MRR no fim observado', 'subscription'], mrrOpening: ['MRR no início', 'subscription'], mrrGained: ['MRR ganho', 'movement'], mrrLost: ['MRR perdido', 'movement'], arpa: ['Receita mensal por conta pagante', 'account'],
    cashIn: ['Entradas confirmadas', 'payment'], refunds: ['Estornos confirmados', 'payment'], cashOut: ['Saídas confirmadas', 'expensePayment'], netCash: ['Resultado do caixa', 'transaction'],
    arDueToday: ['A receber hoje', 'invoice'], arOverdue: ['A receber vencido', 'invoice'], arProjected: ['A receber projetado', 'invoice'],
    apDueToday: ['A pagar hoje', 'expense'], apOverdue: ['A pagar vencido', 'expense'], apProjected: ['A pagar projetado', 'expense'],
    incomeCompetence: ['Receita por competência', 'invoice'], expenseCompetence: ['Despesa por competência', 'expense'],
    openCases: ['Chamados abertos agora', 'case'], casesOverdue: ['Próxima ação vencida', 'case'], openIncidents: ['Incidentes abertos agora', 'incident']
  };
  var CATALOG = [
    { id: 'funnel', group: 'Comercial', title: 'Funil e conversão de coortes', description: 'Cadastros, publicação, checkout e primeiro pagamento.', permissions: ['sales.read', 'customers.read', 'finance.read'], area: 'sales', domains: ['accounts', 'events', 'payments'], type: 'cohort', metrics: [], definition: 'Coorte: contas criadas no período. Os marcos são independentes e não pressupõem uma sequência. Conversão = contas maduras que pagaram na janela fixa de observação ÷ contas maduras. A janela analítica é de 30 dias desde a criação; o trial comercial continua com 14 dias. Coortes imaturas ficam separadas. O marco de pagamento conta também pagamentos posteriores à janela, até o corte.' },
    { id: 'pipeline', group: 'Comercial', title: 'Pipeline e próximos contatos', description: 'Oportunidades cadastradas, etapas e acompanhamento.', permissions: ['sales.read'], area: 'sales', domains: ['leads'], type: 'leads', metrics: [], definition: 'Oportunidades criadas no período, agrupadas pela etapa atual. A distribuição por etapa é um retrato; não é taxa de conversão entre etapas nem receita contratada.' },
    { id: 'accounts', group: 'Clientes e assinaturas', title: 'Entradas e saídas de contas', description: 'Movimentação em números e percentuais sobre a base inicial.', permissions: ['customers.read'], area: 'customers', domains: ['accounts', 'events'], metrics: ['accountEntries', 'accountExits', 'openingAccounts', 'closingAccounts'], definition: 'Entradas são contas criadas no período observado. Saídas são contas únicas com encerramento/desativação confirmado no período. Percentuais usam a base viva imediatamente anterior ao início. Uma conta pode entrar e sair no mesmo período; reaberturas exigem histórico. Contas internas, demonstração e cortesia ficam fora da base comercial.' },
    { id: 'subscriptions', group: 'Clientes e assinaturas', title: 'Assinaturas e churn', description: 'Retenção e composição da base pagante.', permissions: ['customers.read', 'finance.read'], area: 'customers', domains: ['accounts', 'subscriptions'], metrics: ['churn', 'payingAccounts'], definition: 'Churn = contas pagantes no início que não estão pagantes no fim observado ÷ contas pagantes no início. Base inicial zero resulta em taxa sem denominador, nunca 0%. Assinatura pagante não comprova atividade no app.' },
    { id: 'trials', group: 'Clientes e assinaturas', title: 'Trials próximos do vencimento', description: 'Contas que exigem acompanhamento comercial nos próximos 7 dias.', permissions: ['customers.read'], area: 'customers', domains: ['accounts'], metrics: ['trialsExpiring'], definition: 'Contas classificadas como trial com término explícito entre agora e o início do sétimo dia seguinte, no fuso da operação. O recorte usa o dia atual, independente do período selecionado. Ausência de prazo não autoriza estimar a data pelo cadastro.' },
    { id: 'mrr', group: 'Financeiro', title: 'Receita recorrente e variação', description: 'MRR, ganhos e perdas contratuais sem confundir com caixa.', permissions: ['finance.read', 'customers.read'], area: 'finance', domains: ['accounts', 'subscriptions'], metrics: ['mrr', 'mrrOpening', 'mrrGained', 'mrrLost', 'arpa'], definition: 'MRR soma o valor mensal dos contratos recorrentes vigentes no corte. Ganhos/perdas são movimentos contratuais líquidos por conta e instante; não são lucro nem recebimentos. Receita por conta = MRR ÷ contas pagantes. Histórico incompleto torna o indicador indisponível.' },
    { id: 'cash', group: 'Financeiro', title: 'Caixa: entradas, saídas e estornos', description: 'Somente movimentações confirmadas pela data de pagamento.', permissions: ['finance.read'], area: 'finance', domains: ['payments', 'expensePayments'], metrics: ['cashIn', 'cashOut', 'refunds', 'netCash'], definition: 'Caixa usa a data do pagamento confirmado. Resultado = entradas − estornos − saídas confirmadas. Obrigações ainda abertas não entram no caixa. O resultado não representa lucro e não presume conciliação bancária.' },
    { id: 'receivables', group: 'Financeiro', title: 'Contas a receber', description: 'Vencimentos do dia, atrasos e projeção por fatura.', permissions: ['finance.read'], area: 'finance', domains: ['invoices', 'payments'], metrics: ['arDueToday', 'arOverdue', 'arProjected'], definition: 'Saldo da fatura = total − pagamentos aplicados + estornos aplicados, com mínimo zero. Hoje e vencidas usam o dia atual no fuso da operação. Projeção soma saldos com vencimento de hoje em diante dentro do período escolhido; não garante recebimento. Um pagamento em outra fatura não quita esta.' },
    { id: 'payables', group: 'Financeiro', title: 'Contas a pagar', description: 'Obrigações do dia, atrasos e previsão de desembolso.', permissions: ['finance.read'], area: 'finance', domains: ['expenses', 'expensePayments'], metrics: ['apDueToday', 'apOverdue', 'apProjected'], definition: 'Saldo da obrigação = total − pagamentos aplicados àquela obrigação. Hoje e vencidas usam o dia atual. Projeção soma saldos futuros dentro do período; não significa pagamento executado. Ausência de fonte de despesas não equivale a custo zero.' },
    { id: 'competence', group: 'Financeiro', title: 'Receitas e despesas por competência', description: 'Valores atribuídos à data de competência explícita.', permissions: ['finance.read'], area: 'finance', domains: ['invoices', 'expenses'], metrics: ['incomeCompetence', 'expenseCompetence'], definition: 'Valores integrais não anulados cuja data de competência esteja no período. Vencimento, criação e pagamento não substituem competência. Sem essa data explícita a série fica indisponível. Este relatório não é uma DRE contábil.' },
    { id: 'referrals', group: 'Indicações', title: 'Cupons, comissões e repasses', description: 'Consulte a apuração no módulo oficial de influenciadores.', permissions: ['finance.read'], area: 'referrals', domains: [], type: 'referrals', metrics: [], definition: 'O módulo de indicações é a fonte única de atribuições, comissões e repasses registrados. Este catálogo não recria o livro de comissões. A integração do contrato de relatório e exportação depende da homologação; nenhum saldo é estimado aqui.' },
    { id: 'support', group: 'Atendimento', title: 'Fila e prazos de atendimento', description: 'Chamados abertos, ações vencidas e acesso ao caso.', permissions: ['support.read'], area: 'support', domains: ['cases'], metrics: ['openCases', 'casesOverdue'], definition: 'Retrato da fila no momento da consulta, independente do período selecionado. Ação vencida é uma próxima ação explícita anterior ao momento atual em caso aberto; não é SLA contratual. Não inferir tempo de resposta ou satisfação sem eventos próprios.' },
    { id: 'support-history', group: 'Atendimento', title: 'Histórico de chamados por abertura', description: 'Chamados abertos no período, inclusive os já resolvidos.', permissions: ['support.read'], area: 'support', domains: ['cases'], type: 'records', kind: 'case', metrics: [], definition: 'Chamados criados no período, agrupados pelo estado atual. Inclui resolvidos; não é contagem de resoluções ocorridas no período. Próxima ação é prazo operacional, não SLA contratual. O conteúdo das mensagens não entra na exportação.' },
    { id: 'incidents', group: 'Saúde do produto', title: 'Incidentes em acompanhamento', description: 'Incidentes abertos, severidade e encaminhamento.', permissions: ['health.read'], area: 'health', domains: ['incidents'], metrics: ['openIncidents'], definition: 'Retrato dos incidentes abertos no momento da consulta, independente do período selecionado. Incidentes registrados não representam automaticamente quantidade de usuários afetados, disponibilidade ou taxa de erros.' },
    { id: 'incident-history', group: 'Saúde do produto', title: 'Histórico de incidentes por abertura', description: 'Incidentes criados no período, inclusive encerrados.', permissions: ['health.read'], area: 'health', domains: ['incidents'], type: 'records', kind: 'incident', metrics: [], definition: 'Incidentes criados no período, agrupados pelo estado atual. Inclui resolvidos; não representa taxa de falhas ou disponibilidade. Incidentes globais sem vínculo explícito não podem ser distribuídos entre produtos ou coortes.' }
  ];
  var COLUMNS = {
    account: [['id', 'Conta'], ['product', 'Produto'], ['status', 'Estado atual'], ['createdAt', 'Criação'], ['trialEndsAt', 'Fim do trial']],
    subscription: [['id', 'Contrato'], ['accountId', 'Conta'], ['status', 'Estado'], ['startsAt', 'Início'], ['endsAt', 'Fim exclusivo'], ['monthlyCents', 'Mensalidade']],
    movement: [['accountId', 'Conta'], ['occurredAt', 'Movimento'], ['deltaCents', 'Variação de MRR']],
    payment: [['id', 'Movimento'], ['accountId', 'Conta'], ['invoiceId', 'Fatura'], ['kind', 'Tipo'], ['paidAt', 'Pagamento'], ['amountCents', 'Valor']],
    expensePayment: [['id', 'Pagamento'], ['expenseId', 'Obrigação'], ['paidAt', 'Pagamento'], ['amountCents', 'Valor']],
    transaction: [['id', 'Movimento'], ['accountId', 'Conta'], ['invoiceId', 'Fatura'], ['expenseId', 'Obrigação'], ['flow', 'Sentido no caixa'], ['paidAt', 'Pagamento'], ['amountCents', 'Valor']],
    invoice: [['id', 'Fatura'], ['accountId', 'Conta'], ['status', 'Estado'], ['dueDate', 'Vencimento'], ['competenceDate', 'Competência'], ['totalCents', 'Total'], ['balanceCents', 'Saldo']],
    expense: [['id', 'Obrigação'], ['status', 'Estado'], ['dueDate', 'Vencimento'], ['competenceDate', 'Competência'], ['totalCents', 'Total'], ['balanceCents', 'Saldo']],
    lead: [['id', 'Oportunidade'], ['product', 'Produto'], ['status', 'Etapa'], ['createdAt', 'Criação'], ['nextActionAt', 'Próximo contato']],
    case: [['id', 'Protocolo'], ['status', 'Estado'], ['priority', 'Prioridade'], ['createdAt', 'Abertura'], ['nextActionAt', 'Próxima ação']],
    incident: [['id', 'Incidente'], ['status', 'Estado'], ['severity', 'Severidade'], ['createdAt', 'Abertura'], ['updatedAt', 'Atualização']]
  };
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function can(ctx, permission) { try { return !!ctx && typeof ctx.can === 'function' && ctx.can(permission) === true; } catch (_) { return false; } }
  function permitted(ctx, report) { return report.permissions.every(function (p) { return can(ctx, p); }); }
  function engine(ctx) { return ctx.metrics || root.HQOpsMetrics; }
  function label(key) { return METRICS[key] ? METRICS[key][0] : key; }
  function stateLabel(status) { return STATES[status] || STATES.unavailable; }
  function amount(value) { return Number.isSafeInteger(value) ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value / 100) : 'Não informado'; }
  function formatMetric(metric) {
    if (!metric || metric.status !== 'ready') return stateLabel(metric && metric.status);
    if (metric.value == null) return 'Sem denominador';
    return metric.unit === 'cents' ? amount(metric.value) : metric.unit === 'percent' ? new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(metric.value) + '%' : new Intl.NumberFormat('pt-BR').format(metric.value);
  }
  function sourceState(snapshot, domains) {
    var values = domains.map(function (d) { var s = snapshot.sources && snapshot.sources[d]; return !s ? 'unavailable' : s.status === 'ready' && !Array.isArray(snapshot[d]) ? 'error' : s.status; });
    return values.indexOf('error') >= 0 ? 'error' : values.some(function (s) { return !/^(ready|stale)$/.test(s); }) ? 'unavailable' : values.indexOf('stale') >= 0 ? 'stale' : 'ready';
  }
  function time(value, filters) {
    if (!value) return 'Não informada';
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split('-').reverse().join('/');
    var n = Date.parse(value);
    if (!Number.isFinite(n)) return 'Não informada';
    try { return new Intl.DateTimeFormat('pt-BR', { timeZone: filters.timeZone, dateStyle: 'short', timeStyle: 'short' }).format(n); } catch (_) { return 'Fuso não informado'; }
  }
  function dateFor(row, key, filters, metrics) {
    try { return metrics.dateKey(row[key], filters.timeZone); } catch (_) { return null; }
  }
  function selectFilters(ctx, overrides) {
    var f = Object.assign({}, ctx.filters || {}, overrides || {});
    // rowStatus is separate from accountStatus/status, which scope the population.
    f.rowStatus = f.rowStatus || '';
    if (typeof f.cohort === 'string' && /^\d{4}-\d{2}$/.test(f.cohort)) {
      var month = f.cohort;
      f.cohort = { from: month + '-01', to: new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10) };
    } else if (!f.cohort) delete f.cohort;
    f.page = Math.max(1, Number(f.page) || 1);
    return f;
  }
  function supportCoverage(model, snapshot) {
    if (model.report.area !== 'support') return;
    var sources = snapshot.sources || {}, source = sources.cases || {}, legacy = sources.legacySupport;
    if (source.scope === 'opsOnly') {
      model.coverageNotice = 'Cobertura parcial: estes números e registros incluem somente os chamados da nova operação. O histórico anterior de atendimento ainda não está integrado; os totais não representam todo o suporte.';
    } else if (legacy && legacy.status !== 'ready') {
      model.coverageNotice = 'Cobertura parcial: o histórico anterior de atendimento está indisponível nesta consulta. Os totais exibidos cobrem somente a fonte de chamados disponível e não representam todo o suporte.';
    } else if (snapshot.meta && snapshot.meta.synthetic === true) {
      model.coverageNotice = 'Simulação de atendimento: os números e registros incluem somente os chamados fictícios desta sessão.';
    } else if (!source.scope) {
      model.coverageNotice = 'Cobertura do atendimento ainda não confirmada: os números e registros cobrem somente a fonte de chamados indicada abaixo. A integração do histórico anterior não foi confirmada; não trate estes totais como todo o suporte.';
    }
    if (model.coverageNotice && model.report.definition.indexOf(model.coverageNotice) < 0) model.report = Object.assign({}, model.report, { definition: model.report.definition + ' ' + model.coverageNotice });
    model.sources.forEach(function (s) { if (s.domain === 'cases') s.scope = source.scope || 'unconfirmed'; });
    if (legacy && !model.sources.some(function (s) { return s.domain === 'legacySupport'; })) model.sources.push(Object.assign({ domain: 'legacySupport' }, legacy));
    else if (source.scope === 'opsOnly' && !legacy && !model.sources.some(function (s) { return s.domain === 'legacySupport'; })) model.sources.push({ domain: 'legacySupport', status: 'unavailable', reason: 'migration_pending', migrationPending: true, scope: 'legacyOnly', updatedAt: null });
  }
  function buildReport(snapshot, ctx, id, overrides) {
    ctx = ctx || {}; snapshot = snapshot || {};
    var report = CATALOG.find(function (r) { return r.id === id; });
    if (!report || !permitted(ctx, report)) return { status: 'denied', rows: [], summaries: [], columns: [], filters: selectFilters(ctx, overrides), report: null };
    var filters = selectFilters(ctx, overrides), result = { report: report, filters: filters, status: 'unavailable', rows: [], summaries: [], series: [], columns: [], kind: 'account', sources: report.domains.map(function (d) { return Object.assign({ domain: d, status: 'unavailable' }, snapshot.sources && snapshot.sources[d] || {}); }) };
    supportCoverage(result, snapshot);
    if (report.type === 'referrals') return result;
    var metrics = engine(ctx), computed;
    if (!metrics || typeof metrics.compute !== 'function') { result.message = 'Mecanismo de apuração indisponível.'; return result; }
    try { computed = metrics.compute(snapshot, filters); } catch (_) { result.status = 'error'; result.message = 'Não foi possível apurar esse período. Confira datas, fuso e atualização da fonte.'; return result; }
    result.asOf = computed.asOf;
    if (report.type === 'records') {
      result.status = sourceState(snapshot, report.domains); result.kind = report.kind; result.columns = COLUMNS[report.kind];
      if (result.status === 'ready') {
        var history = snapshot[report.domains[0]], scoped = filters.product || filters.accountId || filters.accountStatus || filters.status || filters.cohort;
        if (scoped) {
          result.sources.push(Object.assign({ domain: 'accounts', status: 'unavailable' }, snapshot.sources && snapshot.sources.accounts || {}));
          if (!can(ctx, 'customers.read') || sourceState(snapshot, ['accounts']) !== 'ready' || history.some(function (r) { return !r.accountId; })) {
            result.status = 'unavailable'; result.message = 'Este recorte exige vínculo explícito dos registros com a população de contas autorizada. Limpe os filtros de conta, produto ou coorte.';
          } else {
            var ids = new Set(snapshot.accounts.filter(function (a) {
              var created = dateFor(a, 'createdAt', filters, metrics), accountStatus = filters.accountStatus || filters.status;
              return (!filters.product || a.product === filters.product) && (!filters.accountId || a.id === filters.accountId) && (!accountStatus || a.status === accountStatus) && (!filters.cohort || created && created >= filters.cohort.from && created <= filters.cohort.to);
            }).map(function (a) { return a.id; }));
            history = history.filter(function (r) { return ids.has(r.accountId); });
          }
        }
        if (result.status === 'ready' && history.some(function (r) { return !dateFor(r, 'createdAt', filters, metrics); })) { result.status = 'unavailable'; result.message = 'O histórico por período exige a data de abertura dos registros.'; }
        if (result.status === 'ready') {
          result.rows = history.filter(function (r) { var day = dateFor(r, 'createdAt', filters, metrics); return day >= filters.from && day <= filters.to && Date.parse(r.createdAt) <= Date.parse(computed.asOf); });
          var groups = Object.create(null);
          result.rows.forEach(function (r) { var key = r.status || 'Não informado'; groups[key] = (groups[key] || 0) + 1; });
          result.summaries = Object.keys(groups).sort().map(function (stage) { return { key: stage, label: stage, status: 'ready', value: groups[stage], unit: 'count', filterStage: true }; });
        }
      }
    } else if (report.type === 'leads') {
      result.status = sourceState(snapshot, report.domains); result.kind = 'lead'; result.columns = COLUMNS.lead;
      if (result.status === 'ready') {
        var rows = snapshot.leads.map(function (r) { return Object.assign({}, r, { status: r.stage || r.status }); });
        if (filters.cohort || filters.accountId || filters.accountStatus || filters.status) { result.status = 'unavailable'; result.message = 'Filtros da população de contas não se aplicam a oportunidades ainda sem conta. Limpe os filtros de conta/coorte.'; }
        else if (filters.product && rows.some(function (r) { return !r.product; })) { result.status = 'unavailable'; result.message = 'O cadastro das oportunidades ainda não informa produto. Limpe o filtro de produto para consultar o pipeline.'; }
        else if (rows.some(function (r) { return !dateFor(r, 'createdAt', filters, metrics); })) { result.status = 'unavailable'; result.message = 'O filtro de período exige a data de criação de cada oportunidade.'; }
        else {
          result.rows = rows.filter(function (r) { var day = dateFor(r, 'createdAt', filters, metrics); return (!filters.product || r.product === filters.product) && day >= filters.from && day <= filters.to && Date.parse(r.createdAt) <= Date.parse(computed.asOf); });
          var stages = Object.create(null);
          result.rows.forEach(function (r) { var key = r.status || 'Não informado'; stages[key] = (stages[key] || 0) + 1; });
          result.summaries = Object.keys(stages).sort().map(function (stage) { return { key: stage, label: stage, status: 'ready', value: stages[stage], unit: 'count', filterStage: true }; });
        }
      }
    } else if (report.type === 'cohort') {
      var cohort = computed.cohort || {};
      result.report = Object.assign({}, report, { definition: report.definition.replace('é de 30 dias', 'é de ' + cohort.observationDays + ' dias') });
      result.status = cohort.status || 'unavailable'; result.columns = COLUMNS.account;
      result.observationDays = cohort.observationDays;
      var steps = [['created', 'Cadastros da coorte', 'size'], ['published', 'Publicação confirmada', 'published'], ['checkout', 'Checkout iniciado', 'checkout'], ['paid', 'Pagamento confirmado até o corte', 'paid'], ['mature', 'Contas maduras (' + cohort.observationDays + ' dias)', 'mature'], ['immature', 'Contas ainda imaturas', 'immature'], ['maturePaid', 'Maduras com pagamento na janela', 'maturePaid']];
      result.metric = steps.some(function (s) { return s[0] === filters.reportMetric; }) ? filters.reportMetric : 'created';
      result.summaries = steps.map(function (s) { return { key: s[0], label: s[1], status: result.status, value: cohort[s[2]] == null ? null : cohort[s[2]], unit: 'count' }; });
      result.summaries.push({ key: 'conversion', label: 'Conversão das maduras', status: result.status, value: cohort.conversionPercentage, unit: 'percent', base: cohort.mature });
      var details = cohort.drilldowns || {};
      if (result.status === 'ready' && Array.isArray(details[result.metric])) result.rows = details[result.metric];
      else if (result.status === 'ready') { result.status = 'unavailable'; result.message = 'O contrato de detalhamento da coorte ainda não está disponível.'; }
    } else {
      result.metric = report.metrics.indexOf(filters.reportMetric) >= 0 ? filters.reportMetric : report.metrics[0];
      result.summaries = report.metrics.map(function (k) { return Object.assign({ key: k, label: label(k), status: 'unavailable', value: null }, computed.metrics[k] || {}); });
      var selected = computed.metrics[result.metric] || { status: 'unavailable' };
      result.status = selected.status; result.kind = METRICS[result.metric][1]; result.columns = COLUMNS[result.kind];
      result.message = selected.message ? 'A apuração requer uma fonte completa e validada. Consulte as fontes abaixo.' : '';
      result.sources = selected.sources || result.sources;
      if (result.status === 'ready') {
        var detailsResult = computed.drilldowns[result.metric];
        if (!detailsResult || detailsResult.status !== 'ready' || !Array.isArray(detailsResult.rows)) result.status = 'error';
        else result.rows = detailsResult.rows;
      }
      if (computed.charts) {
        var points = computed.charts.daily || [], granularity = points.length > 45 ? 'monthly' : 'daily';
        result.series = (computed.charts[granularity] || []).filter(function (p) { return p.metrics && p.metrics[result.metric]; }).map(function (p) { return Object.assign({ key: p.key }, p.metrics[result.metric]); });
        result.granularity = granularity;
      }
    }
    supportCoverage(result, snapshot);
    result.allCount = result.rows.length;
    result.statuses = Array.from(new Set(result.rows.map(function (r) { return r.status || ''; }).filter(Boolean))).sort();
    if (filters.rowStatus) result.rows = result.rows.filter(function (r) { return r.status === filters.rowStatus; });
    result.count = result.rows.length;
    result.pageCount = Math.max(1, Math.ceil(result.count / PAGE_SIZE));
    result.filters.page = Math.min(result.pageCount, filters.page);
    result.pageRows = result.rows.slice((result.filters.page - 1) * PAGE_SIZE, result.filters.page * PAGE_SIZE);
    return result;
  }
  function sourceMarkup(model) {
    if (!model.sources.length) return '<p>Fonte: módulo oficial de indicações. Contrato analítico ainda pendente.</p>';
    return '<ul class="hq-source-list">' + model.sources.map(function (s) { return '<li><strong>' + esc(DOMAIN_LABELS[s.domain] || s.domain) + '</strong> · ' + esc(stateLabel(s.status)) + ' · Atualização: ' + esc(time(s.updatedAt, model.filters)) + (s.origin ? ' · Origem: ' + esc(s.origin) : '') + (s.scope === 'opsOnly' ? ' · Somente nova operação' : '') + (s.domain === 'legacySupport' && s.status !== 'ready' ? ' · Integração do histórico pendente' : '') + '</li>'; }).join('') + '</ul>';
  }
  function metricMarkup(model) {
    var max = Math.max.apply(null, [1].concat(model.summaries.filter(function (m) { return m.status === 'ready' && m.unit !== 'percent'; }).map(function (m) { return Math.abs(m.value || 0); })));
    return '<div class="hq-reports-summary">' + model.summaries.map(function (m) {
      var value = formatMetric(m), selected = m.key === model.metric, percent = m.unit === 'percent' ? Math.min(100, Math.abs(m.value || 0)) : Math.min(100, Math.abs(m.value || 0) / max * 100);
      var attrs = m.filterStage ? ' data-hqr-stage="' + esc(m.key) + '"' : ' data-hqr-metric="' + esc(m.key === 'conversion' ? 'maturePaid' : m.key) + '"';
      return '<button type="button" class="hq-card hq-report-stat"' + attrs + ' aria-pressed="' + selected + '"' + (m.status !== 'ready' ? ' disabled' : '') + '><span>' + esc(m.label) + '</span><strong>' + esc(value) + '</strong>' + (m.base != null ? '<small>Base: ' + esc(m.base) + (m.percentage != null && m.unit !== 'percent' ? ' · ' + esc(new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(m.percentage)) + '%' : '') + '</small>' : '') + (m.status === 'ready' && m.value != null ? '<span class="hq-report-bar" aria-hidden="true"><span style="display:block;width:' + percent.toFixed(2) + '%;height:5px;background:currentColor;opacity:.65"></span></span>' : '') + '</button>';
    }).join('') + '</div>';
  }
  function seriesMarkup(model) {
    if (!model.series.length) return '';
    var max = Math.max.apply(null, [1].concat(model.series.filter(function (p) { return p.status === 'ready'; }).map(function (p) { return Math.abs(p.value || 0); })));
    return '<section class="hq-card"><h3>Tendência ' + (model.granularity === 'monthly' ? 'mensal' : 'diária') + ' · ' + esc(label(model.metric)) + '</h3><p>Selecione uma data para abrir os registros desse intervalo. Valores futuros de caixa ficam indisponíveis.</p><div class="hq-report-series">' + model.series.map(function (p) { return '<button type="button" class="hq-btn" data-hqr-period="' + esc(p.key) + '"' + (p.status !== 'ready' ? ' disabled' : '') + '><span>' + esc(p.key) + '</span> <strong>' + esc(formatMetric(p)) + '</strong>' + (p.status === 'ready' ? '<span aria-hidden="true" style="display:block;width:' + Math.min(100, Math.abs(p.value || 0) / max * 100).toFixed(2) + '%;height:4px;background:currentColor"></span>' : '') + '</button>'; }).join('') + '</div></section>';
  }
  function display(row, column, filters) {
    var value = row[column];
    if (column === 'flow') return row.expenseId ? 'Saída' : row.kind === 'refund' ? 'Estorno / saída' : row.kind === 'payment' ? 'Entrada' : 'Não informado';
    if (/Cents$/.test(column)) return value == null ? 'Não informado' : amount(value);
    if (/At$|Date$/.test(column)) return time(value, filters);
    return value == null || value === '' ? 'Não informado' : String(value);
  }
  function detailTarget(row, kind) {
    if (kind === 'movement') return { kind: 'account', id: row.accountId };
    if (kind === 'transaction') return { kind: row.expenseId ? 'expense' : 'invoice', id: row.expenseId || row.invoiceId };
    if (kind === 'expensePayment') return { kind: 'expense', id: row.expenseId };
    if (kind === 'payment') return { kind: row.invoiceId ? 'invoice' : 'payment', id: row.invoiceId || row.id };
    return { kind: kind, id: row.id };
  }
  function tableMarkup(model) {
    if (model.status !== 'ready') return '<div class="hq-card" role="status"><h3>' + esc(stateLabel(model.status)) + '</h3><p>' + esc(model.message || 'Os registros só serão apresentados quando a fonte estiver disponível e atualizada. Nenhum resultado foi substituído por zero.') + '</p></div>';
    if (!model.count) return '<div class="hq-card" role="status"><h3>Nenhum registro neste recorte</h3><p>A fonte respondeu com sucesso. Confira os filtros selecionados.</p></div>';
    return '<div class="hq-table-wrap" tabindex="0" role="region" aria-label="Registros do relatório, com rolagem horizontal"><table class="hq-table"><caption>' + esc(model.report.title) + ' · ' + model.count + ' registros' + (model.filters.rowStatus ? ' com estado ' + esc(model.filters.rowStatus) : '') + '</caption><thead><tr>' + model.columns.map(function (c) { return '<th scope="col">' + esc(c[1]) + '</th>'; }).join('') + '<th scope="col">Detalhes</th></tr></thead><tbody>' + model.pageRows.map(function (row) { var t = detailTarget(row, model.kind); return '<tr>' + model.columns.map(function (c) { return '<td>' + esc(display(row, c[0], model.filters)) + '</td>'; }).join('') + '<td>' + (t.id ? '<button type="button" class="hq-btn" data-hqr-detail="' + esc(t.kind) + '" data-hqr-id="' + esc(t.id) + '">Abrir registro</button>' : 'Vínculo não informado') + '</td></tr>'; }).join('') + '</tbody></table></div><div class="hq-toolbar"><button type="button" class="hq-btn" data-hqr-page="' + (model.filters.page - 1) + '"' + (model.filters.page <= 1 ? ' disabled' : '') + '>Anterior</button><span role="status">Página ' + model.filters.page + ' de ' + model.pageCount + ' · ' + model.count + ' registros</span><button type="button" class="hq-btn" data-hqr-page="' + (model.filters.page + 1) + '"' + (model.filters.page >= model.pageCount ? ' disabled' : '') + '>Próxima</button></div>';
  }
  function filtersMarkup(model) {
    var f = model.filters, cohortMonth = f.cohort && typeof f.cohort === 'object' ? f.cohort.from.slice(0, 7) : f.cohort || '';
    return '<form class="hq-toolbar" data-hqr-filters><label class="hq-field">De<input type="date" name="from" required value="' + esc(f.from) + '"></label><label class="hq-field">Até<input type="date" name="to" required value="' + esc(f.to) + '"></label><label class="hq-field">Estado da tabela<select name="rowStatus"><option value="">Todos</option>' + (model.statuses || []).map(function (s) { return '<option value="' + esc(s) + '"' + (s === f.rowStatus ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select></label><label class="hq-field">Coorte de criação da conta<input type="month" name="cohort" value="' + esc(cohortMonth) + '"></label><button type="submit" class="hq-btn">Aplicar filtros</button></form><p class="hq-muted">O estado filtra a tabela; o resumo preserva a base e os denominadores. Coorte filtra o mês de criação das contas. Período inclusivo no fuso ' + esc(f.timeZone || 'não informado') + '.</p>';
  }
  function render(snapshot, ctx) {
    ctx = ctx || {}; snapshot = snapshot || {};
    var id = ctx.filters && ctx.filters.report, available = CATALOG.filter(function (r) { return permitted(ctx, r); });
    if (!id) return '<section class="hq-section" data-hqr-root><header><h2 tabindex="-1" data-hqr-heading>Relatórios</h2><p>Explore números e registros. Cada indicador explica sua base, sua fonte e quando foi atualizado.</p></header>' + (available.length ? '<div class="hq-reports-catalog">' + available.map(function (r) { return '<button type="button" class="hq-card" data-hqr-report="' + esc(r.id) + '"><small>' + esc(r.group) + '</small><h3>' + esc(r.title) + '</h3><p>' + esc(r.description) + '</p><span>Explorar relatório →</span></button>'; }).join('') + '</div>' : '<p role="status">Nenhum relatório disponível para suas permissões atuais.</p>') + '</section>';
    var model = buildReport(snapshot, ctx, id);
    if (!model.report) return '<section class="hq-section" data-hqr-root><h2>Relatório indisponível</h2><p role="status">Seu acesso a este relatório não foi autorizado.</p><button type="button" class="hq-btn" data-hqr-report="">Voltar ao catálogo</button></section>';
    return '<section class="hq-section" data-hqr-root><div class="hq-toolbar"><button type="button" class="hq-btn" data-hqr-report="">← Catálogo</button><button type="button" class="hq-btn" data-hqr-area="' + esc(model.report.area) + '">Abrir operação</button></div><header><small>' + esc(model.report.group) + '</small><h2 tabindex="-1" data-hqr-heading>' + esc(model.report.title) + '</h2><p>' + esc(model.report.description) + '</p></header>' + (model.coverageNotice ? '<aside class="hq-card" data-hqr-coverage role="note"><strong>Cobertura do atendimento</strong><p>' + esc(model.coverageNotice) + '</p></aside>' : '') + (model.report.type !== 'referrals' ? filtersMarkup(model) + metricMarkup(model) + seriesMarkup(model) + '<div class="hq-toolbar"><h3>' + esc(model.report.type === 'cohort' ? 'Contas no marco selecionado' : model.metric ? label(model.metric) : 'Registros') + '</h3>' + (can(ctx, 'reports.export') && model.status === 'ready' && model.count ? '<button type="button" class="hq-btn" data-hqr-export>Exportar CSV (' + model.count + ')</button>' : '<span class="hq-muted">' + (can(ctx, 'reports.export') ? 'Exportação disponível quando houver registros validados.' : 'Exportação requer permissão específica.') + '</span>') + '</div>' + tableMarkup(model) : '<div class="hq-card"><h3>Apuração no módulo oficial</h3><p>Parceiros, cupons, comissões e repasses registrados continuam reunidos em Indicações. O contrato de relatório e exportação ainda não está homologado.</p><button type="button" class="hq-btn" data-hqr-area="referrals">Abrir indicações e repasses</button></div>') + '<details class="hq-card" open><summary>Definição, fontes e atualização</summary><p>' + esc(model.report.definition) + '</p><p>Corte da consulta: ' + esc(time(model.asOf || snapshot.now, model.filters)) + '. A fonte vazia, a fonte ausente, a falha e a atualização pendente são estados diferentes.</p>' + sourceMarkup(model) + '</details><p role="status" aria-live="polite" data-hqr-notice></p></section>';
  }
  function csvCell(value) { var text = String(value == null ? '' : value); if (/^[\s\uFEFF]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text; return '"' + text.replace(/"/g, '""') + '"'; }
  function exportCsv(snapshot, ctx, id, overrides) {
    if (!can(ctx, 'reports.export')) throw new Error('reports_export_forbidden');
    var model = buildReport(snapshot, ctx, id, overrides);
    if (!model.report || model.status !== 'ready' || !model.count || model.report.type === 'referrals') throw new Error('report_not_exportable');
    var metadata = [['Relatório', model.report.title], ['Ambiente', snapshot.meta && snapshot.meta.synthetic === true ? 'SIMULAÇÃO LOCAL — DADOS FICTÍCIOS' : 'Dados da fonte autorizada'], ['Período', model.filters.from + ' a ' + model.filters.to], ['Fuso', model.filters.timeZone], ['Corte', model.asOf], ['Coorte', model.filters.cohort ? model.filters.cohort.from + ' a ' + model.filters.cohort.to : 'Todas'], ['Estado da tabela', model.filters.rowStatus || 'Todos'], ['Definição', model.report.definition], ['Indicador', model.metric ? label(model.metric) : model.report.title]];
    if (model.coverageNotice) metadata.push(['Cobertura do atendimento', model.coverageNotice]);
    model.sources.forEach(function (s) { metadata.push(['Fonte', DOMAIN_LABELS[s.domain] || s.domain, stateLabel(s.status), s.origin || '', s.updatedAt || '', s.scope || '', s.domain === 'legacySupport' && s.status !== 'ready' ? 'Integração do histórico pendente' : '']); });
    var lines = metadata.concat([[], model.columns.map(function (c) { return c[1]; })]);
    model.rows.forEach(function (row) { lines.push(model.columns.map(function (c) { return display(row, c[0], model.filters); })); });
    return '\uFEFF' + lines.map(function (line) { return line.map(csvCell).join(';'); }).join('\r\n') + '\r\n';
  }
  function bind(container, ctx) {
    if (!container || !container.addEventListener) return;
    ctx = ctx || {}; var local = Object.assign({}, ctx, { filters: Object.assign({}, ctx.filters || {}) });
    var previous = bindings && bindings.get(container);
    if (previous) { container.removeEventListener('click', previous.click); container.removeEventListener('submit', previous.submit); }
    function notice(message) { var target = container.querySelector('[data-hqr-notice]'); if (target) target.textContent = message; if (typeof local.notify === 'function') local.notify(message); }
    function redraw(patch) { local.filters = Object.assign({}, local.filters, patch); if (ctx.filters) Object.assign(ctx.filters, patch); container.innerHTML = render(local.snapshot || {}, local); var heading = container.querySelector('[data-hqr-heading]'); if (heading && heading.focus) heading.focus(); }
    function click(event) {
      var target = event.target && event.target.closest ? event.target.closest('button') : null;
      if (!target || !container.contains(target) || target.disabled) return;
      if (target.hasAttribute('data-hqr-report')) return redraw({ report: target.getAttribute('data-hqr-report'), reportMetric: '', rowStatus: '', page: 1 });
      if (target.hasAttribute('data-hqr-metric')) return redraw({ reportMetric: target.getAttribute('data-hqr-metric'), page: 1 });
      if (target.hasAttribute('data-hqr-stage')) return redraw({ rowStatus: target.getAttribute('data-hqr-stage'), page: 1 });
      if (target.hasAttribute('data-hqr-page')) return redraw({ page: Number(target.getAttribute('data-hqr-page')) });
      if (target.hasAttribute('data-hqr-period')) {
        var key = target.getAttribute('data-hqr-period'), from = key.length === 7 ? key + '-01' : key, to = key.length === 7 ? new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0)).toISOString().slice(0, 10) : key;
        return redraw({ from: from > local.filters.from ? from : local.filters.from, to: to < local.filters.to ? to : local.filters.to, page: 1 });
      }
      if (target.hasAttribute('data-hqr-area') && typeof local.navigate === 'function') return local.navigate(target.getAttribute('data-hqr-area'), local.filters);
      if (target.hasAttribute('data-hqr-detail')) {
        var model = buildReport(local.snapshot || {}, local, local.filters.report), kind = target.getAttribute('data-hqr-detail'), id = target.getAttribute('data-hqr-id');
        if (model.status !== 'ready' || !model.rows.some(function (r) { var t = detailTarget(r, model.kind); return t.kind === kind && String(t.id) === id; })) return notice('O registro não está disponível neste relatório.');
        if (typeof local.openDetail === 'function') return local.openDetail(kind, id);
        return notice('A abertura do registro ainda não está disponível.');
      }
      if (target.hasAttribute('data-hqr-export')) {
        try {
          var csv = exportCsv(local.snapshot || {}, local, local.filters.report), url = root.URL.createObjectURL(new root.Blob([csv], { type: 'text/csv;charset=utf-8' })), link = root.document.createElement('a');
          link.href = url; link.download = 'torque-relatorio-' + local.filters.report + '-' + local.filters.from + '-' + local.filters.to + '.csv'; link.hidden = true; root.document.body.appendChild(link); link.click(); link.remove(); root.setTimeout(function () { root.URL.revokeObjectURL(url); }, 1000); notice('CSV gerado com os registros filtrados e as definições do relatório.');
        } catch (_) { notice('Não foi possível exportar. Confira a permissão, os filtros e a atualização dos dados.'); }
      }
    }
    function submit(event) {
      if (!event.target || !event.target.matches('[data-hqr-filters]')) return;
      event.preventDefault(); var form = event.target, from = form.elements.from.value, to = form.elements.to.value;
      if (!from || !to || from > to) return notice('Escolha um período válido: o início deve ser anterior ou igual ao fim.');
      redraw({ from: from, to: to, cohort: form.elements.cohort.value, rowStatus: form.elements.rowStatus.value, page: 1 });
    }
    container.addEventListener('click', click); container.addEventListener('submit', submit);
    if (bindings) bindings.set(container, { click: click, submit: submit });
    return function () { container.removeEventListener('click', click); container.removeEventListener('submit', submit); if (bindings) bindings.delete(container); };
  }
  return Object.freeze({ render: render, bind: bind, buildReport: buildReport, exportCsv: exportCsv });
});
