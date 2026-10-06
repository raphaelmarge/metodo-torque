/* TORQUE ON HQ: operational sections. No direct network or provider writes. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HQOpsSections = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  var AREA_PERMISSION = { sales: 'sales.read', customers: 'customers.read', finance: 'finance.read', support: 'support.read', health: 'health.read', admin: 'audit.read' };
  var COMMAND_PERMISSION = {
    'lead.create': 'sales.write', 'lead.update': 'sales.write',
    'invoice.create': 'finance.write', 'invoice.recordPayment': 'finance.write',
    'expense.create': 'finance.write', 'expense.recordPayment': 'finance.write',
    'case.create': 'support.write', 'case.update': 'support.write', 'case.message': 'support.write',
    'incident.create': 'health.write', 'incident.update': 'health.write',
    'subscription.requestCancel': 'customers.write'
  };
  var LABEL = {
    new: 'Novo', novo: 'Novo', contact: 'Em contato', contato: 'Em contato', demo: 'Demonstração', proposal: 'Proposta', proposta: 'Proposta', won: 'Fechado', fechado: 'Fechado', lost: 'Perdido', perdido: 'Perdido',
    trial: 'Em teste', active: 'Ativa', ativo: 'Ativa', paused: 'Pausada', pausado: 'Pausada', cancelled: 'Cancelada', canceled: 'Cancelada', cancelado: 'Cancelada', expired: 'Encerrada', vitalicia: 'Vitalícia',
    open: 'Em aberto', aberto: 'Aberto', paid: 'Pago', pago: 'Pago', partial: 'Parcial', overdue: 'Em atraso', pending: 'Pendente', requested: 'Solicitado', pendente: 'Pendente', atrasada: 'Em atraso', blocked: 'Bloqueado', bloqueada: 'Bloqueado', granted: 'Liberado', permitido: 'Liberado',
    triage: 'Em triagem', in_progress: 'Em andamento', em_andamento: 'Em andamento', waiting_customer: 'Aguardando cliente', waiting_external: 'Aguardando terceiro', aguardando: 'Aguardando', resolved: 'Resolvido', resolvido: 'Resolvido', reopened: 'Reaberto',
    p0: 'Crítica', p1: 'Alta', p2: 'Média', critica: 'Crítica', alta: 'Alta', media: 'Média', baixa: 'Baixa', investigating: 'Investigando', investigando: 'Investigando', monitoring: 'Monitorando', monitorando: 'Monitorando',
    connected: 'Conectada', configured: 'Configurada', available: 'Disponível', ok: 'Disponível', error: 'Falha', unavailable: 'Indisponível', disconnected: 'Desconectada', not_configured: 'Não configurada', unknown: 'Sem medição', stale: 'Desatualizada',
    chat: 'Chat do sistema', protocol: 'Protocolo', manual: 'Registro manual', legacy: 'Legado', internal: 'Nota interna', customer: 'Rascunho de resposta', not_sent: 'Não enviado', refund: 'Estorno', payment: 'Recebimento', success: 'Concluído', denied: 'Negado'
  };
  var STAGES = [['novo', 'Novo'], ['contato', 'Em contato'], ['demo', 'Demonstração'], ['proposta', 'Proposta'], ['fechado', 'Fechado'], ['perdido', 'Perdido']];
  var CASE_STATUS = [['aberto', 'Aberto'], ['em_andamento', 'Em andamento'], ['aguardando', 'Aguardando'], ['resolvido', 'Resolvido']];
  var PRIORITIES = [['baixa', 'Baixa'], ['media', 'Média'], ['alta', 'Alta'], ['critica', 'Crítica']];
  var INCIDENT_STATUS = [['aberto', 'Aberto'], ['investigando', 'Investigando'], ['monitorando', 'Monitorando'], ['resolvido', 'Resolvido']];
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function num(v) { var n = Number(v); return Number.isFinite(n) ? n : 0; }
  function label(v) { return LABEL[v] || String(v || 'Não informado'); }
  function canonical(v) { return ({ new: 'novo', contact: 'contato', proposal: 'proposta', won: 'fechado', lost: 'perdido', triage: 'aberto', in_progress: 'em_andamento', waiting_customer: 'aguardando', waiting_external: 'aguardando', resolved: 'resolvido', reopened: 'aberto', p0: 'critica', p1: 'alta', p2: 'media', investigating: 'investigando', monitoring: 'monitorando', open: 'aberto' })[v] || v; }
  function caseState(v) { return v === 'new' ? 'aberto' : canonical(v); }
  function money(v, ctx) { return ctx && typeof ctx.money === 'function' ? String(ctx.money(num(v))) : (num(v) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function date(v) { if (!v) return '—'; var m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '/' + m[2] + '/' + m[1] : 'Data não informada'; }
  function zone(ctx) { var z = ctx && ctx.filters && ctx.filters.timeZone || 'America/Sao_Paulo'; try { new Intl.DateTimeFormat('en', { timeZone: z }); return z; } catch (_) { return 'America/Sao_Paulo'; } }
  function timestamp(v, ctx) { if (!v) return '—'; var d = new Date(v); return Number.isFinite(d.getTime()) ? d.toLocaleString('pt-BR', { timeZone: zone(ctx), dateStyle: 'short', timeStyle: 'short' }) : 'Data não informada'; }
  function day(ctx, s) { var d = new Date(ctx.now || s.now || s.asOf || Date.now()); if (isNaN(d)) d = new Date(); return new Intl.DateTimeFormat('en-CA', { timeZone: zone(ctx), year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); }
  function can(ctx, p) { try { return typeof ctx.can === 'function' && ctx.can(p) === true; } catch (_) { return false; } }
  function account(s, id) { return arr(s.accounts).find(function (x) { return String(x.id) === String(id); }); }
  function accountName(s, id) { var a = account(s, id); return a ? a.name || 'Conta sem nome' : id ? 'Conta vinculada' : 'Sem conta vinculada'; }
  function ownerName(s, id) { var op = arr(s.operators).find(function (x) { return String(x.id) === String(id); }); return op ? op.name || 'Operador' : id ? 'Responsável atribuído' : 'Sem responsável'; }
  function badge(v) { return '<span class="hq-badge" data-state="' + esc(v || 'unknown') + '">' + esc(label(v)) + '</span>'; }
  function button(text, action, id, permission, ctx, extra) { var allowed = !permission || can(ctx, permission); return '<button type="button" class="hq-btn" data-hq-action="' + esc(action) + '" data-id="' + esc(id || '') + '"' + (extra || '') + (allowed ? '' : ' disabled title="Seu perfil não permite esta ação"') + '>' + esc(text) + '</button>'; }
  function detail(text, kind, id) { return '<button type="button" class="hq-btn hq-link" data-hq-detail="' + esc(kind) + '" data-id="' + esc(id) + '">' + esc(text) + '</button>'; }
  function empty(text) { return '<p class="hq-empty">' + esc(text || 'Nenhum registro corresponde a estes filtros.') + '</p>'; }
  function table(headers, rows, caption) { return rows.length ? '<div class="hq-table-wrap"><table class="hq-table"><caption class="hq-sr-only">' + esc(caption) + '</caption><thead><tr>' + headers.map(function (h) { return '<th scope="col">' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.map(function (row) { return '<tr>' + row.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>' : empty(); }
  function optionList(options, value) { return options.map(function (x) { return '<option value="' + esc(x[0]) + '"' + (String(x[0]) === String(value || '') ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join(''); }
  function selectFilter(key, title, options, f) { return '<label class="hq-field">' + esc(title) + '<select data-hq-filter="' + esc(key) + '">' + optionList(options, f[key]) + '</select></label>'; }
  function search(f) { return '<label class="hq-field hq-search">Buscar<input type="search" data-hq-filter="q" value="' + esc(f.q || '') + '" placeholder="Nome ou assunto"></label>'; }
  function shell(area, title, description, controls, content) { return '<section class="hq-section" data-hq-area="' + esc(area) + '"><header class="hq-toolbar"><div><h2>' + esc(title) + '</h2><p>' + esc(description) + '</p></div><div class="hq-actions">' + controls + '</div></header>' + content + '</section>'; }
  function notice(text) { return '<p class="hq-notice">' + esc(text) + '</p>'; }
  function supportCoverage(s) {
    var source = s.sources && s.sources.cases, legacy = s.sources && s.sources.legacySupport;
    if (!(source && source.scope === 'opsOnly') && !(legacy && legacy.migrationPending)) return '';
    return notice(source && source.message || 'Esta fila mostra somente casos criados na nova central. O histórico anterior ainda não foi incorporado; uma fila vazia não significa ausência de chamados no sistema.') + (s.role === 'admin' || s.role === 'legacy_admin' ? '<p><a class="hq-btn" href="hq.html?legacy=1">Abrir atendimento do HQ legado</a></p>' : '');
  }
  function contains(values, q) { if (!q) return true; return values.join(' ').toLocaleLowerCase('pt-BR').includes(String(q).toLocaleLowerCase('pt-BR')); }
  function matchesProduct(s, id, f) { var a = account(s, id); return !f.product || !!a && a.product === f.product; }
  function sum(values, prop) { return values.reduce(function (n, x) { return n + num(x[prop]); }, 0); }
  function cancelled(x) { return ['canceled', 'cancelled', 'cancelado'].indexOf(x.status) >= 0; }
  function total(x) { return num(x.totalCents != null ? x.totalCents : x.amountCents); }
  function balance(x, s, payable) {
    if (cancelled(x)) return 0;
    var paid = payable ? arr(s.expensePayments).filter(function (p) { return String(p.expenseId) === String(x.id) && p.confirmed !== false && (!p.status || p.status === 'confirmed'); }) : arr(s.payments).filter(function (p) { return String(p.invoiceId) === String(x.id) && (p.confirmed === true || p.confirmed !== false && p.status === 'confirmed'); });
    return Math.max(0, total(x) - paid.reduce(function (n, p) { return n + num(p.amountCents) * (p.kind === 'refund' ? -1 : 1); }, 0));
  }
  function dueMatch(x, filter, today) { var d = String(x.dueDate || '').slice(0, 10); if (!filter) return true; if (!d) return false; if (filter === 'today') return d === today; if (filter === 'overdue') return d < today; if (filter === 'week') { var end = new Date(today + 'T12:00:00Z'); end.setUTCDate(end.getUTCDate() + 7); return d >= today && d <= end.toISOString().slice(0, 10); } return true; }
  function miniStats(items) { return '<div class="hq-section-stats">' + items.map(function (x) { return '<div class="hq-stat"><span>' + esc(x[0]) + '</span><strong>' + esc(x[1]) + '</strong></div>'; }).join('') + '</div>'; }
  function sales(s, ctx, f) {
    var today = day(ctx, s), leads = arr(s.leads).filter(function (x) { return contains([x.name, x.source], f.q) && (!f.stage || canonical(x.stage) === canonical(f.stage)) && (!f.owner || String(x.owner || '') === f.owner) && (!f.followup || !!x.nextActionAt && String(x.nextActionAt).slice(0, 10) <= today && ['fechado', 'perdido'].indexOf(canonical(x.stage)) < 0); });
    var stages = STAGES.map(function (st) { return '<button type="button" class="hq-stage" data-hq-set-filter="stage" data-value="' + st[0] + '"' + (canonical(f.stage) === st[0] ? ' aria-pressed="true"' : ' aria-pressed="false"') + '><span>' + st[1] + '</span><strong>' + arr(s.leads).filter(function (x) { return canonical(x.stage) === st[0]; }).length + '</strong></button>'; }).join('');
    var rows = leads.map(function (x) { var late = x.nextActionAt && String(x.nextActionAt).slice(0, 10) < today; return ['<strong>' + esc(x.name || 'Contato sem nome') + '</strong><small>' + esc(x.source || 'Origem não informada') + '</small>', badge(x.stage), esc(ownerName(s, x.owner)), '<span' + (late ? ' class="hq-overdue"' : '') + '>' + esc(date(x.nextActionAt)) + '</span>', esc(x.lossReason || '—'), button('Organizar', 'lead.update', x.id, 'sales.write', ctx)]; });
    return shell('sales', 'Funil comercial', 'Cada oportunidade precisa de uma próxima ação. Fechamento comercial não comprova pagamento.', button('Nova oportunidade', 'lead.create', '', 'sales.write', ctx), '<div class="hq-stage-grid">' + stages + '</div><div class="hq-toolbar hq-filters">' + search(f) + selectFilter('stage', 'Etapa', [['', 'Todas']].concat(STAGES), f) + selectFilter('followup', 'Próxima ação', [['', 'Todas'], ['due', 'Até hoje']], f) + '</div>' + table(['Oportunidade', 'Etapa', 'Responsável', 'Próxima ação', 'Motivo da perda', 'Ações'], rows, 'Oportunidades comerciais'));
  }
  function customers(s, ctx, f) {
    var list = arr(s.accounts).filter(function (x) { return contains([x.name, x.product], f.q) && (!f.product || x.product === f.product) && (!f.status || x.status === f.status); });
    var products = Array.from(new Set(arr(s.accounts).map(function (x) { return x.product; }).filter(Boolean))).map(function (p) { return [p, p]; });
    var subsSource = s.sources && s.sources.subscriptions; var subscriptionsAvailable = !subsSource || ['ready', 'stale'].indexOf(subsSource.status) >= 0;
    var requests = arr(s.subscriptionRequests).filter(function (r) { return contains([accountName(s, r.accountId)], f.q) && matchesProduct(s, r.accountId, f); });
    var rows = list.map(function (x) { var subs = arr(s.subscriptions).filter(function (su) { return String(su.accountId) === String(x.id); }).sort(function (a, b) { return String(b.startsAt || b.startedAt || '').localeCompare(String(a.startsAt || a.startedAt || '')); }); var su = subs[0]; return [detail(x.name || 'Conta sem nome', 'account', x.id) + '<small>' + esc(x.product || 'Produto não informado') + '</small>', badge(x.status), su ? badge(su.status) + '<small>' + esc(su.monthlyCents == null ? 'Valor não informado' : money(su.monthlyCents, ctx)) + '</small>' : '<span class="hq-muted">' + (subscriptionsAvailable ? 'Sem assinatura vinculada' : 'Assinatura indisponível para este perfil ou fonte') + '</span>', badge(x.accessStatus || 'unknown'), esc(date(x.trialEndsAt || su && su.trialEndsAt)), su && ['active', 'ativo', 'trial', 'paused', 'pausado', 'atrasada'].indexOf(su.status) >= 0 ? button('Solicitar cancelamento', 'subscription.requestCancel', su.id || x.id, 'customers.write', ctx, ' data-account-id="' + esc(x.id) + '"') : '—']; });
    var queue = '<h3>Pedidos de cancelamento</h3>' + (s.sources && s.sources.subscriptionRequests && ['unavailable', 'error', 'loading'].indexOf(s.sources.subscriptionRequests.status) >= 0 ? notice('Não foi possível consultar os pedidos. A assinatura não foi considerada cancelada.') : table(['Conta', 'Solicitado em', 'Data desejada', 'Estado', 'Observação'], requests.map(function (r) { return [esc(accountName(s, r.accountId)), esc(timestamp(r.createdAt, ctx)), esc(date(r.effectiveAt)), badge(r.status || 'pending'), esc(r.note || 'Aguarda análise e confirmação')]; }), 'Pedidos de cancelamento registrados'));
    return shell('customers', 'Clientes e assinaturas', 'Cadastro, assinatura e acesso têm estados separados. Pedidos de cancelamento aguardam execução e confirmação.', '', '<div class="hq-toolbar hq-filters">' + search(f) + selectFilter('product', 'Produto', [['', 'Todos']].concat(products), f) + selectFilter('status', 'Cadastro', [['', 'Todos'], ['trial', 'Em teste'], ['ativo', 'Ativo'], ['pausado', 'Pausado'], ['cancelado', 'Cancelado']], f) + '</div>' + table(['Conta', 'Cadastro', 'Assinatura', 'Acesso', 'Fim do teste', 'Ações'], rows, 'Clientes e assinaturas') + queue);
  }
  function finance(s, ctx, f) {
    var payable = f.tab === 'payable', movements = f.tab === 'movements', today = day(ctx, s), name = payable ? 'expense' : 'invoice';
    var tabs = [['receivable', 'A receber'], ['payable', 'A pagar'], ['movements', 'Recebimentos e estornos']].map(function (t) { return '<button type="button" class="hq-btn" data-hq-set-filter="tab" data-value="' + t[0] + '" aria-pressed="' + ((f.tab || 'receivable') === t[0]) + '">' + t[1] + '</button>'; }).join('');
    var controls = button('Nova cobrança manual', 'invoice.create', '', 'finance.write', ctx) + button('Nova despesa', 'expense.create', '', 'finance.write', ctx);
    var body = notice('Registros manuais não cobram cartão, transferem dinheiro ou confirmam liquidação bancária. A conciliação com o provedor permanece uma etapa separada.') + '<div class="hq-actions hq-tabs" role="group" aria-label="Visões financeiras">' + tabs + '</div>';
    if (movements) {
      var payments = arr(s.payments).filter(function (p) { return contains([accountName(s, p.accountId), p.reference, p.origin], f.q) && matchesProduct(s, p.accountId, f); });
      body += '<div class="hq-toolbar hq-filters">' + search(f) + '</div>' + table(['Data', 'Conta', 'Tipo', 'Valor', 'Confirmação', 'Origem'], payments.map(function (p) { return [esc(date(p.paidAt)), esc(accountName(s, p.accountId)), badge(p.kind || 'payment'), esc(money(p.amountCents, ctx)), esc(p.confirmed === true || p.confirmed !== false && p.status === 'confirmed' ? 'Confirmado na fonte' : 'Sem confirmação'), esc(p.origin || 'Não informada')]; }), 'Recebimentos e estornos registrados');
    } else {
      var all = arr(payable ? s.expenses : s.invoices).filter(function (x) { return contains([payable ? x.payee : accountName(s, x.accountId), x.label, x.description], f.q) && (payable || matchesProduct(s, x.accountId, f)); });
      var list = all.filter(function (x) { return dueMatch(x, f.due, today) && (!f.status || (f.status === 'outstanding' ? balance(x, s, payable) > 0 : f.status === 'settled' ? !cancelled(x) && balance(x, s, payable) === 0 : cancelled(x))); }).sort(function (a, b) { return String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')); });
      body += miniStats([['Saldo da lista', money(list.reduce(function (n, x) { return n + balance(x, s, payable); }, 0), ctx)], ['Vence hoje', money(list.filter(function (x) { return String(x.dueDate || '').slice(0, 10) === today; }).reduce(function (n, x) { return n + balance(x, s, payable); }, 0), ctx)], ['Em atraso', money(list.filter(function (x) { return x.dueDate && String(x.dueDate).slice(0, 10) < today; }).reduce(function (n, x) { return n + balance(x, s, payable); }, 0), ctx)]]);
      body += '<div class="hq-toolbar hq-filters">' + search(f) + selectFilter('due', 'Vencimento', [['', 'Todos'], ['today', 'Hoje'], ['overdue', 'Em atraso'], ['week', 'Próximos 7 dias']], f) + selectFilter('status', 'Saldo', [['', 'Todos'], ['outstanding', 'Em aberto'], ['settled', 'Quitado'], ['cancelled', 'Cancelado']], f) + '</div>';
      body += table(['Descrição', payable ? 'Favorecido' : 'Conta', 'Vencimento', 'Total', 'Saldo', 'Situação', 'Ações'], list.map(function (x) { var b = balance(x, s, payable); return ['<strong>' + esc(x.label || x.description || (payable ? 'Despesa' : 'Cobrança')) + '</strong><small>' + esc(x.origin || 'Registro manual') + '</small>', esc(payable ? x.payee || 'Não informado' : accountName(s, x.accountId)), '<span' + (b > 0 && x.dueDate && String(x.dueDate).slice(0, 10) < today ? ' class="hq-overdue"' : '') + '>' + esc(date(x.dueDate)) + '</span>', esc(money(total(x), ctx)), esc(money(b, ctx)), badge(cancelled(x) ? 'cancelado' : b === 0 ? 'paid' : b < total(x) ? 'partial' : 'open'), b > 0 ? button(payable ? 'Registrar pagamento' : 'Registrar recebimento', name + '.recordPayment', x.id, 'finance.write', ctx) : '<span class="hq-muted">Sem saldo em aberto</span>']; }), payable ? 'Contas a pagar' : 'Contas a receber');
    }
    return shell('finance', 'Financeiro', 'Acompanhe vencimentos e saldos com a origem de cada registro.', controls, body);
  }
  function support(s, ctx, f) {
    var today = day(ctx, s), list = arr(s.cases).filter(function (x) { return contains([x.subject, x.protocol, accountName(s, x.accountId)], f.q) && (!f.status || caseState(x.status) === caseState(f.status)) && (!f.priority || canonical(x.priority) === canonical(f.priority)) && matchesProduct(s, x.accountId, f) && (!f.owner || String(x.owner || '') === f.owner); });
    return shell('support', 'Atendimento', 'Casos da central, com responsáveis, prazos e histórico. Ler uma mensagem não encerra o atendimento.', button('Novo caso', 'case.create', '', 'support.write', ctx), supportCoverage(s) + notice('Respostas ao cliente ficam como rascunho não enviado. Notas internas não são respostas. O envio externo ainda não está conectado.') + '<div class="hq-toolbar hq-filters">' + search(f) + selectFilter('status', 'Estado', [['', 'Todos']].concat(CASE_STATUS), f) + selectFilter('priority', 'Prioridade', [['', 'Todas']].concat(PRIORITIES), f) + '</div>' + table(['Caso', 'Conta / canal', 'Prioridade', 'Estado', 'Responsável / próxima ação', 'Ações'], list.map(function (x) { return ['<strong>' + esc(x.subject || 'Caso sem assunto') + '</strong><small>' + esc(x.protocol || '') + '</small>', esc(accountName(s, x.accountId)) + '<small>' + esc(label(x.channel)) + '</small>', badge(x.priority), badge(x.status), esc(ownerName(s, x.owner)) + '<small' + (x.nextActionAt && String(x.nextActionAt).slice(0, 10) < today && canonical(x.status) !== 'resolvido' ? ' class="hq-overdue"' : '') + '>' + esc(date(x.nextActionAt)) + '</small>', '<div class="hq-actions">' + button('Histórico', 'case.history', x.id, 'support.read', ctx) + button('Organizar', 'case.update', x.id, 'support.write', ctx) + button('Mensagem', 'case.message', x.id, 'support.write', ctx) + '</div>']; }), 'Casos de atendimento'));
  }
  function health(s, ctx, f) {
    var list = arr(s.incidents).filter(function (x) { return contains([x.title, x.release, x.version], f.q) && (!f.status || caseState(x.status) === caseState(f.status)) && (!f.priority || canonical(x.severity) === canonical(f.priority)); });
    var integrations = arr(s.integrations).map(function (x) { return '<article class="hq-integration"><h3>' + esc(x.name || x.label || 'Integração') + '</h3>' + badge(x.status || 'unknown') + '<p>' + esc(x.message || x.description || 'Sem evidência de execução disponível.') + '</p><small>Última verificação: ' + esc(timestamp(x.lastCheckedAt || x.checkedAt, ctx)) + '</small></article>'; }).join('');
    return shell('health', 'Problemas do app', 'Priorize pelo impacto nas contas e acompanhe a recuperação de cada incidente.', button('Novo incidente', 'incident.create', '', 'health.write', ctx), notice('Ausência de erros recebidos não comprova saúde. Cobertura, conexão e versão da aplicação influenciam a coleta.') + '<div class="hq-toolbar hq-filters">' + search(f) + selectFilter('status', 'Estado', [['', 'Todos']].concat(INCIDENT_STATUS), f) + selectFilter('priority', 'Severidade', [['', 'Todas']].concat(PRIORITIES), f) + '</div>' + table(['Incidente', 'Severidade', 'Estado', 'Impacto', 'Responsável', 'Versão', 'Ações'], list.map(function (x) { return ['<strong>' + esc(x.title || 'Incidente sem título') + '</strong>', badge(x.severity), badge(x.status), esc(arr(x.accountIds).length + ' conta(s) vinculada(s)'), esc(ownerName(s, x.owner)), esc(x.release || x.version || 'Não informada'), button('Organizar', 'incident.update', x.id, 'health.write', ctx)]; }), 'Incidentes operacionais') + '<h3>Integrações e cobertura</h3><div class="hq-integration-grid">' + (integrations || empty('Nenhuma verificação de integração disponível.')) + '</div>');
  }
  function admin(s, ctx, f) {
    var events = arr(s.audit).filter(function (x) { return contains([x.type, x.action, x.reason, x.actorName, x.result], f.q); }).slice().sort(function (a, b) { return String(b.createdAt || b.occurredAt || b.at || '').localeCompare(String(a.createdAt || a.occurredAt || a.at || '')); });
    return shell('admin', 'Auditoria', 'Histórico de ações disponível para consulta. Alterações são registradas pelo executor autorizado.', '', notice('Esta tela não altera nem apaga eventos de auditoria. Registros do modo local ficam no navegador e não substituem a trilha servidora de produção.') + '<div class="hq-toolbar hq-filters">' + search(f) + '</div>' + table(['Quando', 'Responsável', 'Ação', 'Objeto', 'Motivo', 'Resultado'], events.map(function (x) { return [esc(timestamp(x.createdAt || x.occurredAt || x.at, ctx)), esc(x.actorName || x.actorLabel || (x.actorId || x.actor ? ownerName(s, x.actorId || x.actor) : 'Não informado')), esc(x.type || x.action || 'Ação'), esc(x.targetType || x.entityType || '—'), esc(x.reason || 'Não informado'), badge(x.result || x.status || 'success')]; }), 'Trilha de auditoria'));
  }
  function render(area, snapshot, ctx) {
    var s = snapshot || {}, c = ctx || {}, f = c.filters || {}, routes = { sales: sales, customers: customers, finance: finance, support: support, health: health, admin: admin };
    if (!routes[area]) return empty('Seção não disponível.');
    if (!can(c, AREA_PERMISSION[area])) return notice('Seu perfil não possui acesso a esta seção.');
    var required = { sales: ['leads'], customers: ['accounts'], finance: f.tab === 'payable' ? ['expenses', 'expensePayments'] : f.tab === 'movements' ? ['payments'] : ['invoices', 'payments'], support: ['cases'], health: ['incidents'], admin: ['audit'] }[area];
    var missing = required.map(function (k) { var src = s.sources && s.sources[k]; return !src || src.complete === false || !Array.isArray(s[k]) ? {status:'unavailable',message:'Fonte ausente ou incompleta. Nenhum resultado foi interpretado como zero.'} : src; }).filter(function (src) { return ['ready', 'stale'].indexOf(src.status) < 0; });
    if (missing.length) return shell(area, ({ sales: 'Funil comercial', customers: 'Clientes e assinaturas', finance: 'Financeiro', support: 'Atendimento', health: 'Problemas do app', admin: 'Auditoria' })[area], 'Não há dados suficientes para apresentar esta visão.', '', notice(missing[0].message || 'Fonte indisponível. Nenhum resultado foi interpretado como zero.') + (area === 'support' ? supportCoverage(s) : ''));
    if (area === 'finance' && required.some(function(k){return s[k].some(function(row){var amount=(k==='invoices'||k==='expenses')&&row.totalCents!=null?row.totalCents:row.amountCents;return !Number.isSafeInteger(amount)||amount<0;});})) return shell(area,'Financeiro','Valores da fonte ainda não confirmados.','',notice('Há valores ausentes ou inválidos. Nenhum saldo foi considerado zero ou quitado. Atualize a consulta.'));
    var stale = required.some(function (k) { return s.sources && s.sources[k] && s.sources[k].status === 'stale'; });
    return (stale ? notice('Dados da última consulta bem-sucedida. A atualização falhou; confira a origem antes de agir.') : '') + routes[area](s, c, f);
  }
  function create(tag, text, attrs) { var el = document.createElement(tag); if (text != null) el.textContent = String(text); Object.keys(attrs || {}).forEach(function (key) { el.setAttribute(key, String(attrs[key])); }); return el; }
  function field(name, title, type, value, options, required) { return { name: name, title: title, type: type || 'text', value: value == null ? '' : value, options: options, required: required !== false }; }
  function operators(s, ctx, current) { var list = [['', 'Sem responsável']], seen = {}; arr(s.operators).forEach(function (op) { if (op.id && !seen[op.id]) { list.push([op.id, op.name || 'Operador']); seen[op.id] = true; } }); var me = ctx.currentUserId || ctx.userId || s.currentUserId; if (me && !seen[me]) { list.push([me, 'Eu']); seen[me] = true; } if (current && !seen[current]) list.push([current, 'Responsável atual']); return list; }
  function accountOptions(s, optional) { return (optional ? [['', 'Sem conta vinculada']] : [['', 'Escolha uma conta']]).concat(arr(s.accounts).map(function (a) { return [a.id, a.name || 'Conta sem nome']; })); }
  function find(s, collection, id) { return arr(s[collection]).find(function (x) { return String(x.id) === String(id); }) || {}; }
  function key() { return 'hq-' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)); }
  function parseMoney(value) {
    var v = String(value || '').trim().replace(/\s/g, '');
    if (!/^\d+(?:[.,]\d{1,2})?$/.test(v)) throw Error('Informe um valor positivo com até duas casas decimais, sem separador de milhar.');
    var cents = Math.round(Number(v.replace(',', '.')) * 100);
    if (!Number.isSafeInteger(cents) || cents <= 0) throw Error('O valor precisa ser maior que zero.');
    return cents;
  }
  function modal(container, title, description, fields, onSubmit, submitText) {
    var dialog = create('dialog', null, { class: 'hq-dialog', 'aria-label': title });
    var form = create('form'), heading = create('h2', title), intro = create('p', description), error = create('p', '', { class: 'hq-form-error', role: 'alert' });
    form.append(heading, intro); var elements = {};
    fields.forEach(function (f) { var wrap = create('label', null, { class: 'hq-field' }), text = create('span', f.title); wrap.append(text); var input = create(f.type === 'select' ? 'select' : f.type === 'textarea' ? 'textarea' : 'input'); input.name = f.name;
      if (f.type !== 'select' && f.type !== 'textarea') input.type = f.type;
      if (f.options) f.options.forEach(function (op) { input.append(create('option', op[1], { value: op[0] })); });
      input.value = String(f.value); input.required = f.required; if (f.type === 'textarea') { input.rows = 3; input.maxLength = f.name === 'reason' || f.name === 'lossReason' ? 500 : 4000; } else if (f.type === 'text') input.maxLength = f.name === 'reference' || f.name === 'release' ? 120 : 200;
      if (f.name === 'total' || f.name === 'amount') { input.inputMode = 'decimal'; input.placeholder = '49,90'; }
      wrap.append(input); form.append(wrap); elements[f.name] = input;
    });
    var actions = create('div', null, { class: 'hq-actions' }), cancel = create('button', 'Voltar', { type: 'button', class: 'hq-btn' }), submit = create('button', submitText || 'Salvar registro', { type: 'submit', class: 'hq-btn hq-btn-primary' });
    actions.append(cancel, submit); form.append(error, actions); dialog.append(form); container.append(dialog);
    function close() { if (typeof dialog.close === 'function' && dialog.open) dialog.close(); else dialog.remove(); }
    dialog.addEventListener('close', function () { dialog.remove(); }); cancel.addEventListener('click', close);
    form.addEventListener('submit', async function (e) { e.preventDefault(); if (submit.disabled || !form.reportValidity()) return; var values = {}; Object.keys(elements).forEach(function (n) { values[n] = elements[n].value.trim(); }); error.textContent = ''; submit.disabled = true; cancel.disabled = true;
      try { await onSubmit(values); close(); } catch (err) { error.textContent = err && err.message || 'Não foi possível concluir. Seus dados continuam neste formulário.'; } finally { submit.disabled = false; cancel.disabled = false; }
    });
    dialog.addEventListener('cancel', function (e) { if (submit.disabled) e.preventDefault(); });
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
    return dialog;
  }
  function notify(ctx, text) { if (typeof ctx.notify === 'function') ctx.notify(text); }
  async function command(ctx, type, payload, reason, operationKey) {
    if (!can(ctx, COMMAND_PERMISSION[type])) throw Error('Seu perfil não permite esta ação.');
    if (typeof ctx.command !== 'function') throw Error('Executor indisponível. Nenhuma alteração foi realizada.');
    Object.keys(payload).forEach(function (p) { if (payload[p] === undefined) delete payload[p]; });
    var result = await ctx.command({ type: type, payload: payload, reason: reason, idempotencyKey: operationKey });
    if (result && (result.ok === false || result.error)) throw Error(typeof result.error === 'string' ? result.error : result.error && result.error.message || result.message || 'A operação não foi confirmada.');
    return result;
  }
  function history(container, s, id, ctx) {
    var c = find(s, 'cases', id), d = create('dialog', null, { class: 'hq-dialog', 'aria-label': 'Histórico do caso' }); d.append(create('h2', c.subject || 'Histórico do caso'));
    arr(c.messages).forEach(function (m) { var article = create('article', null, { class: 'hq-message' }); article.append(create('strong', m.visibility === 'internal' ? 'Nota interna' : m.delivery === 'not_sent' ? 'Rascunho de resposta · não enviado' : m.authorType === 'customer' || m.de === 'cliente' ? 'Mensagem do cliente' : 'Mensagem registrada'), create('p', m.text || m.body || m.texto || ''), create('small', timestamp(m.createdAt || m.criado, ctx))); d.append(article); });
    if (!arr(c.messages).length) d.append(create('p', 'Nenhuma mensagem disponível neste caso.'));
    var close = create('button', 'Fechar', { type: 'button', class: 'hq-btn' }); close.addEventListener('click', function () { if (d.close) d.close(); else d.remove(); }); d.addEventListener('close', function () { d.remove(); }); d.append(close); container.append(d); if (d.showModal) d.showModal(); else d.setAttribute('open', '');
  }
  function openAction(container, ctx, type, id, accountId) {
    var s = ctx.snapshot || {}, today = day(ctx, s), operationKey = key(), fields = [], payload = {}, title = '', description = '', submitText = 'Salvar registro', convert = function (v) { return v; };
    if (type === 'case.history') { if (can(ctx, 'support.read')) history(container, s, id, ctx); return; }
    if (!COMMAND_PERMISSION[type] || !can(ctx, COMMAND_PERMISSION[type])) { notify(ctx, 'Seu perfil não permite esta ação.'); return; }
    if (type === 'lead.create' || type === 'lead.update') {
      var lead = find(s, 'leads', id); title = id ? 'Organizar oportunidade' : 'Nova oportunidade'; description = 'Registre a etapa e a próxima ação. Marcar como fechado não ativa assinatura nem registra receita.';
      fields = [field('name', 'Nome da oportunidade', 'text', lead.name), field('stage', 'Etapa', 'select', canonical(lead.stage) || 'novo', STAGES), field('owner', 'Responsável', 'select', lead.owner, operators(s, ctx, lead.owner), false), field('nextActionAt', 'Próxima ação', 'date', String(lead.nextActionAt || '').slice(0, 10), null, false), field('lossReason', 'Motivo da perda, quando aplicável', 'textarea', lead.lossReason, null, false)];
      convert = function (v) { if (['fechado', 'perdido'].indexOf(v.stage) < 0 && !v.nextActionAt) throw Error('Defina a próxima ação para uma oportunidade em andamento.'); if (v.stage === 'perdido' && !v.lossReason) throw Error('Informe o motivo da perda.'); return { id: id || undefined, name: v.name, stage: v.stage, owner: v.owner || null, nextActionAt: v.nextActionAt || null, lossReason: v.lossReason }; };
    } else if (type === 'invoice.create' || type === 'expense.create') {
      var expense = type === 'expense.create'; title = expense ? 'Nova despesa' : 'Nova cobrança manual'; description = 'Apenas registra um compromisso no controle financeiro. Não envia cobrança nem movimenta dinheiro.';
      fields = [expense ? field('payee', 'Favorecido', 'text', '') : field('accountId', 'Conta', 'select', '', accountOptions(s, false)), field('label', 'Descrição', 'text', ''), field('total', 'Valor em reais', 'text', ''), field('dueDate', 'Vencimento', 'date', today), field('competenceDate', 'Competência, se conhecida', 'date', '', null, false)];
      convert = function (v) { var p = { label: v.label, totalCents: parseMoney(v.total), dueDate: v.dueDate, competenceDate: v.competenceDate || null }; if (expense) p.payee = v.payee; else p.accountId = v.accountId; return p; };
    } else if (type === 'invoice.recordPayment' || type === 'expense.recordPayment') {
      var outgoing = type === 'expense.recordPayment', bill = find(s, outgoing ? 'expenses' : 'invoices', id), outstanding = balance(bill, s, outgoing); title = outgoing ? 'Registrar pagamento manual' : 'Registrar recebimento manual'; description = 'Informe somente um movimento já ocorrido e sua referência. Este registro não executa transferência ou cobrança e não comprova conciliação bancária.';
      fields = [field('amount', 'Valor em reais', 'text', (outstanding / 100).toFixed(2).replace('.', ',')), field('paidAt', 'Data do movimento', 'date', today), field('reference', 'Referência ou comprovante', 'text', '')];
      convert = function (v) { var amount = parseMoney(v.amount); if (amount > outstanding) throw Error('O valor ultrapassa o saldo em aberto. Revise o registro antes de continuar.'); if (v.paidAt > today) throw Error('Um movimento realizado não pode ter data futura.'); return { id: id, amountCents: amount, paidAt: v.paidAt, reference: v.reference }; };
    } else if (type === 'case.create' || type === 'case.update') {
      var c = find(s, 'cases', id); var incidentSource = s.sources && s.sources.incidents; var editIncident = can(ctx, 'health.read') && (!incidentSource || ['ready', 'stale'].indexOf(incidentSource.status) >= 0); title = id ? 'Organizar atendimento' : 'Novo caso'; description = 'Defina responsável, prioridade e próxima ação. Resolva somente depois de verificar o resultado com evidência.' + (editIncident ? '' : ' O vínculo com incidente será preservado; esta fonte não está disponível para edição neste perfil.');
      fields = [field('subject', 'Assunto', 'text', c.subject), field('accountId', 'Conta', 'select', c.accountId, accountOptions(s, true), false), field('priority', 'Prioridade', 'select', canonical(c.priority) || 'media', PRIORITIES), field('status', 'Estado', 'select', caseState(c.status) || 'aberto', CASE_STATUS), field('owner', 'Responsável', 'select', c.owner, operators(s, ctx, c.owner), false), field('nextActionAt', 'Próxima ação', 'date', String(c.nextActionAt || '').slice(0, 10), null, false), field('incidentId', 'Incidente relacionado', 'select', c.incidentId, [['', 'Sem incidente']].concat(arr(s.incidents).map(function (i) { return [i.id, i.title || 'Incidente']; })), false)];
      if (!editIncident) fields = fields.filter(function (f) { return f.name !== 'incidentId'; });
      convert = function (v) { if (v.status !== 'resolvido' && !v.nextActionAt) throw Error('Defina a próxima ação para acompanhar este caso.'); return { id: id || undefined, accountId: v.accountId || null, subject: v.subject, priority: v.priority, status: v.status, owner: v.owner || null, nextActionAt: v.nextActionAt || null, incidentId: editIncident ? v.incidentId || null : undefined, channel: id ? undefined : 'manual' }; };
    } else if (type === 'case.message') {
      title = 'Registrar mensagem'; description = 'Notas internas ficam na operação. Respostas ao cliente são rascunhos não enviados; a entrega externa está indisponível.'; submitText = 'Salvar sem enviar'; fields = [field('visibility', 'Tipo', 'select', 'internal', [['internal', 'Nota interna'], ['customer', 'Rascunho de resposta ao cliente']]), field('text', 'Mensagem', 'textarea', '')]; convert = function (v) { return { id: id, text: v.text, visibility: v.visibility }; };
    } else if (type === 'incident.create' || type === 'incident.update') {
      var incident = find(s, 'incidents', id); title = id ? 'Organizar incidente' : 'Novo incidente'; description = 'Vincule contas afetadas, responsável e versão. Monitoramento e resolução precisam de evidência registrada no motivo.';
      fields = [field('title', 'Título', 'text', incident.title), field('severity', 'Severidade', 'select', canonical(incident.severity) || 'media', PRIORITIES), field('status', 'Estado', 'select', canonical(incident.status) || 'aberto', INCIDENT_STATUS), field('owner', 'Responsável', 'select', incident.owner, operators(s, ctx, incident.owner), false), field('release', 'Versão ou release', 'text', incident.release || incident.version, null, false), field('affectedAccount', 'Vincular uma conta afetada', 'select', '', accountOptions(s, true), false)];
      convert = function (v) { var ids = arr(incident.accountIds).slice(); if (v.affectedAccount && ids.indexOf(v.affectedAccount) < 0) ids.push(v.affectedAccount); return { id: id || undefined, title: v.title, severity: v.severity, status: v.status, owner: v.owner || null, release: v.release, accountIds: ids }; };
    } else if (type === 'subscription.requestCancel') {
      title = 'Solicitar cancelamento'; description = 'Registra um pedido para a equipe responsável. Não cancela cobrança no provedor, não revoga acesso nem altera a assinatura automaticamente.'; submitText = 'Registrar pedido'; fields = []; var sub = find(s, 'subscriptions', id); payload = { accountId: accountId || sub.accountId || id }; if (sub.id) payload.id = sub.id; convert = function (v) { return Object.assign({}, payload, { note: v.reason }); };
    }
    fields.push(field('reason', 'Motivo ou evidência da ação', 'textarea', ''));
    modal(container, title, description, fields, async function (v) { if (!v.reason) throw Error('Informe o motivo da ação.'); var p = convert(v); await command(ctx, type, p, v.reason, operationKey); notify(ctx, type === 'case.message' ? 'Mensagem registrada. Nenhum envio externo foi realizado.' : type === 'subscription.requestCancel' ? 'Pedido registrado. A assinatura aguarda confirmação do cancelamento.' : 'Registro confirmado.'); }, submitText);
  }
  function bind(container, ctx) {
    if (!container || typeof container.addEventListener !== 'function') return function () {};
    if (container.__hqSectionsUnbind) container.__hqSectionsUnbind();
    function areaOf(el) { var a = el.closest('[data-hq-area]'); return a && a.getAttribute('data-hq-area'); }
    function navigate(el, name, value) { var area = areaOf(el); if (!area || typeof ctx.navigate !== 'function') return; var filters = Object.assign({}, ctx.filters || {}); filters[name] = value; if (name === 'tab') { delete filters.status; delete filters.due; } ctx.navigate(area, filters); }
    function click(e) { var el = e.target && e.target.closest && e.target.closest('[data-hq-action],[data-hq-detail],[data-hq-set-filter]'); if (!el || !container.contains(el) || el.disabled) return;
      if (el.hasAttribute('data-hq-set-filter')) { navigate(el, el.getAttribute('data-hq-set-filter'), el.getAttribute('data-value') || ''); return; }
      if (el.hasAttribute('data-hq-detail')) { if (typeof ctx.openDetail === 'function') ctx.openDetail(el.getAttribute('data-hq-detail'), el.getAttribute('data-id')); else notify(ctx, 'Detalhes indisponíveis nesta conexão.'); return; }
      try { openAction(container, ctx, el.getAttribute('data-hq-action'), el.getAttribute('data-id'), el.getAttribute('data-account-id')); } catch (err) { notify(ctx, err && err.message || 'Não foi possível abrir esta ação.'); }
    }
    function change(e) { var el = e.target; if (el && el.hasAttribute && el.hasAttribute('data-hq-filter')) navigate(el, el.getAttribute('data-hq-filter'), el.value); }
    container.addEventListener('click', click); container.addEventListener('change', change);
    var off = function () { container.removeEventListener('click', click); container.removeEventListener('change', change); delete container.__hqSectionsUnbind; }; container.__hqSectionsUnbind = off; return off;
  }
  return { render: render, bind: bind };
});
