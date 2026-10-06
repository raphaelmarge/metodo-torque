/* TORQUE HQ operations data contract v1. No credentials, persistence or network client creation.
 * The demo is session-only. Live authorization always comes from guarded server RPCs.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HQOpsData = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var READ = ['sales.read', 'customers.read', 'finance.read', 'support.read', 'health.read', 'audit.read'];
  var ALL = READ.concat(['sales.write', 'customers.write', 'finance.write', 'support.write', 'health.write', 'reports.export']);
  var permissions = {
    owner: ALL, admin: ALL, operations: ALL,
    sales: ['sales.read', 'sales.write', 'customers.read'],
    finance: ['finance.read', 'finance.write', 'customers.read', 'customers.write', 'reports.export'],
    support: ['support.read', 'support.write', 'customers.read'],
    engineering: ['health.read', 'health.write'],
    readonly: ['customers.read'], viewer: ['customers.read']
  };
  Object.keys(permissions).forEach(function (role) { Object.freeze(permissions[role]); });
  Object.freeze(permissions);
  var DOMAIN = {
    accounts: 'customers.read', subscriptions: 'finance.read', subscriptionRequests: 'finance.read', events: 'customers.read',
    invoices: 'finance.read', payments: 'finance.read', expenses: 'finance.read', expensePayments: 'finance.read',
    leads: 'sales.read', cases: 'support.read', incidents: 'health.read', audit: 'audit.read', integrations: 'health.read'
  };
  var COMMANDS = {
    'lead.create': 'sales.write', 'lead.update': 'sales.write',
    'invoice.create': 'finance.write', 'invoice.recordPayment': 'finance.write',
    'expense.create': 'finance.write', 'expense.recordPayment': 'finance.write',
    'case.create': 'support.write', 'case.update': 'support.write', 'case.message': 'support.write',
    'incident.create': 'health.write', 'incident.update': 'health.write',
    'subscription.requestCancel': 'customers.write'
  };
  var STATES = {
    lead: ['novo', 'contato', 'demo', 'proposta', 'fechado', 'perdido'],
    case: ['aberto', 'em_andamento', 'aguardando', 'resolvido'],
    incident: ['aberto', 'investigando', 'monitorando', 'resolvido'],
    priority: ['baixa', 'media', 'alta', 'critica']
  };
  Object.keys(STATES).forEach(function (key) { Object.freeze(STATES[key]); }); Object.freeze(STATES);
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function fail(code, message) { var e = new Error(message); e.code = code; throw e; }
  function uuid(n) { return '00000000-0000-4000-8000-' + String(n).padStart(12, '0'); }
  function clock(now) { var value = typeof now === 'function' ? now() : now; var d = value === undefined ? new Date() : new Date(value); if (!Number.isFinite(d.getTime())) fail('INVALID_DATE', 'Data de referência inválida.'); return d.toISOString(); }
  function source(status, origin, updatedAt, message, extra) { return Object.assign({ status: status, origin: origin, updatedAt: updatedAt || null, message: message || '' }, extra || {}); }
  function blank(now, mode) {
    var s = { version: 1, meta: { mode: mode, generatedAt: now, commandsAvailable: false }, now: now, role: null, currentUserId: null, operators: [], permissions: [], sources: {} };
    Object.keys(DOMAIN).forEach(function (k) { s[k] = []; s.sources[k] = source('unavailable', 'not_connected', null, 'Fonte operacional ainda não disponível.'); });
    return s;
  }
  function filterPermissions(snapshot) {
    var s = clone(snapshot);
    s.permissions = s.permissions.filter(function (p) { return ALL.indexOf(p) !== -1; });
    Object.keys(DOMAIN).forEach(function (k) {
      if (s.permissions.indexOf(DOMAIN[k]) === -1 && !(k === 'integrations' && s.permissions.indexOf('finance.read') !== -1)) { s[k] = []; s.sources[k] = source('unavailable', 'authorization', null, 'Seu perfil não permite consultar esta área.', { reason: 'forbidden' }); }
    });
    return s;
  }
  function sampleSnapshot(input) {
    var now = clock(input && typeof input === 'object' && !(input instanceof Date) ? input.now : input);
    var s = blank(now, 'demo');
    var start = new Date(now);
    function at(days) { return new Date(start.getTime() + days * 86400000).toISOString(); }
    function day(days) { return at(days).slice(0, 10); }
    s.role = 'admin'; s.permissions = ALL.slice(); s.currentUserId = uuid(9000); s.operators = [{ id: uuid(9000), name: 'Operador de exemplo' }];
    s.meta = { mode: 'demo', generatedAt: now, commandsAvailable: true, persistence: 'session-only', synthetic: true, label: 'Simulação local · dados fictícios · reinicia ao recarregar' };
    Object.keys(DOMAIN).forEach(function (k) { s.sources[k] = source('ready', 'synthetic_demo', now, 'Dados fictícios apenas nesta sessão.', { complete: true }); });
    s.sources.finance = source('ready', 'synthetic_demo', now, 'Livro manual fictício; não representa pagamentos reais.', { scope: 'manualOnly' });
    var created = [-120, -100, -90, -80, -70, -64, -57, -46, -34, -25, -18, -11, -8, -5, -2];
    s.accounts = created.map(function (d, i) { return { id: uuid(i + 1), name: 'Conta Exemplo ' + String.fromCharCode(65 + i), product: 'personal', createdAt: at(d), status: [3, 6].indexOf(i) !== -1 ? 'cancelled' : i < 11 ? 'paid' : 'trial', trialEndsAt: at(d + 14), accessStatus: [3, 6].indexOf(i) !== -1 ? 'blocked' : 'active', source: 'synthetic_demo' }; });
    var paidStarts = [-100, -80, -70, -60, -50, -44, -37, -26, -14, -5, -1];
    s.subscriptions = paidStarts.map(function (d, i) {
      var end = i === 3 ? -12 : (i === 6 ? -4 : null);
      return { id: uuid(100 + i), accountId: uuid(i + 1), status: end === null ? 'active' : 'cancelled', plan: 'Personal mensal', monthlyCents: 4990, priceCents: 4990, interval: 'month', startsAt: at(d), paidStartedAt: at(d), endsAt: end === null ? null : at(end), trialStartedAt: at(d - 14), trialEndsAt: at(d), source: 'synthetic_demo' };
    });
    [11, 12, 13, 14].forEach(function (i) { s.subscriptions.push({ id: uuid(100 + i), accountId: uuid(i + 1), status: 'trial', plan: 'Personal mensal', monthlyCents: 4990, priceCents: 4990, interval: 'month', startsAt: at(created[i]), paidStartedAt: null, trialStartedAt: at(created[i]), trialEndsAt: at(created[i] + 14), endsAt: null }); });
    s.subscriptions.forEach(function (sub, i) {
      s.events.push({ id: uuid(200 + i * 3), accountId: sub.accountId, subscriptionId: sub.id, type: 'account_created', occurredAt: sub.trialStartedAt });
      if (sub.paidStartedAt) s.events.push({ id: uuid(201 + i * 3), accountId: sub.accountId, subscriptionId: sub.id, type: 'subscription_started', occurredAt: sub.paidStartedAt, at: sub.paidStartedAt, mrrDeltaCents: 4990 });
      if (sub.endsAt) s.events.push({ id: uuid(202 + i * 3), accountId: sub.accountId, subscriptionId: sub.id, type: 'account_closed', occurredAt: sub.endsAt, mrrDeltaCents: -4990, reason: 'Cancelamento fictício' });
    });
    s.accounts.forEach(function (a, i) {
      if (i < 12) s.events.push({ id: uuid(2000 + i), accountId: a.id, type: 'checkout_started', occurredAt: at(created[i] + 1) });
      if (i < 9) s.events.push({ id: uuid(2100 + i), accountId: a.id, type: 'publication_confirmed', occurredAt: at(created[i] + 2) });
      if (i < 7) s.events.push({ id: uuid(2200 + i), accountId: a.id, type: 'human_activity_confirmed', occurredAt: at(-1) });
    });
    [-65, -55, -45, -35, -25, -20, -15, -10, -5, -1, 0, 0, 0, 2, 4].forEach(function (d, i) {
      var invoice = { id: uuid(300 + i), accountId: uuid(i % 11 + 1), subscriptionId: uuid(100 + i % 11), label: 'Mensalidade de exemplo ' + (i + 1), totalCents: i === 8 ? 2994 : 4990, dueDate: day(d), competenceDate: day(d), status: i < 10 ? 'paid' : i === 10 ? 'partial' : 'open', origin: 'manual' };
      s.invoices.push(invoice);
      if (i <= 10) s.payments.push({ id: uuid(400 + i), invoiceId: invoice.id, accountId: invoice.accountId, amountCents: i === 10 ? 1990 : invoice.totalCents, paidAt: at(d), status: 'confirmed', confirmed: true, kind: 'payment', origin: 'manual', reference: 'DEMO-REC-' + (i + 1), accessExpected: false });
    });
    s.payments.push({ id: uuid(450), invoiceId: null, accountId: uuid(4), amountCents: 4990, paidAt: at(-1), status: 'confirmed', confirmed: true, kind: 'payment', origin: 'synthetic_demo', reference: 'DEMO-ACESSO', accessExpected: true, accessExpectedUntil: at(29) });
    [-20, -10, -3, 0, 0, 1, 5].forEach(function (d, i) {
      var e = { id: uuid(500 + i), payee: 'Fornecedor Exemplo ' + (i + 1), label: ['Hospedagem', 'Serviços', 'Revisão', 'Infraestrutura', 'Operação', 'Ferramentas', 'Suporte'][i], totalCents: [9500, 7000, 4600, 8000, 3000, 6500, 4800][i], dueDate: day(d), competenceDate: day(d), status: i < 2 ? 'paid' : i === 3 ? 'partial' : 'open', origin: 'manual' };
      s.expenses.push(e);
      if (i < 2 || i === 3) s.expensePayments.push({ id: uuid(600 + i), expenseId: e.id, amountCents: i === 3 ? 2000 : e.totalCents, paidAt: at(d), status: 'confirmed', confirmed: true, kind: 'payment', reference: 'DEMO-DESP-' + i, origin: 'manual' });
    });
    STATES.lead.forEach(function (stage, i) { for (var n = 0; n < 6 - i; n += 1) s.leads.push({ id: uuid(700 + i * 10 + n), name: 'Oportunidade Exemplo ' + (i + 1) + '.' + (n + 1), stage: stage, source: i % 2 ? 'site' : 'indicação', createdAt: at(-20 + i * 2 + n), updatedAt: at(-3 + i % 3), nextActionAt: at(n - 1), owner: n % 2 ? null : uuid(9000), lossReason: stage === 'perdido' ? 'Sem interesse neste momento (exemplo)' : null, notes: 'Contato fictício para revisão do fluxo.' }); });
    s.cases = [
      { id: uuid(800), accountId: uuid(4), subject: 'Pagamento registrado, acesso pendente', status: 'aberto', priority: 'alta', owner: null, channel: 'manual', createdAt: at(-2), updatedAt: at(-1), nextActionAt: at(-1), messages: [] },
      { id: uuid(801), accountId: uuid(8), subject: 'Dúvida de configuração', status: 'em_andamento', priority: 'media', owner: uuid(9000), channel: 'app', createdAt: at(-1), updatedAt: at(0), nextActionAt: at(1), messages: [] },
      { id: uuid(802), accountId: uuid(10), subject: 'Aguardando reprodução do erro', status: 'aguardando', priority: 'baixa', owner: uuid(9000), channel: 'manual', createdAt: at(-5), updatedAt: at(-2), nextActionAt: at(2), messages: [] },
      { id: uuid(803), accountId: uuid(2), subject: 'Orientação concluída', status: 'resolvido', priority: 'baixa', owner: uuid(9000), createdAt: at(-10), updatedAt: at(-9), resolvedAt: at(-9), messages: [] }
    ];
    s.incidents = [{ id: uuid(850), title: 'Falha fictícia de sincronização em investigação', status: 'investigando', severity: 'alta', owner: null, release: 'demo-local', accountIds: [uuid(8)], createdAt: at(-1), updatedAt: at(0) }, { id: uuid(851), title: 'Erro fictício de abertura resolvido', status: 'resolvido', severity: 'media', owner: uuid(9000), release: 'demo-local', accountIds: [uuid(2)], createdAt: at(-12), updatedAt: at(-11) }];
    s.integrations = [{ id: 'pagarme', name: 'Pagar.me', status: 'unavailable', message: 'Integração real pendente; nenhum pagamento é processado nesta simulação.' }, { id: 'asaas', name: 'Asaas', status: 'unavailable', message: 'Alternativa pendente de decisão e integração.' }];
    return s;
  }

  function textValue(value, field, max, required) {
    if (value == null && !required) return null;
    if (typeof value !== 'string' || (required && !value.trim()) || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail('INVALID_PAYLOAD', 'Campo inválido: ' + field + '.');
    return value.trim();
  }
  function dateValue(value, field, timestamp) {
    if (typeof value !== 'string' || !(timestamp ? /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/ : /^\d{4}-\d{2}-\d{2}$/).test(value)) fail('INVALID_DATE', 'Data inválida: ' + field + '.');
    var d = new Date(value.length === 10 ? value + 'T00:00:00.000Z' : value);
    var day = new Date(value.slice(0, 10) + 'T00:00:00.000Z');
    if (!Number.isFinite(d.getTime()) || !Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== value.slice(0, 10) || (value.length > 10 && (+value.slice(11, 13) > 23 || +value.slice(14, 16) > 59 || +value.slice(17, 19) > 59))) fail('INVALID_DATE', 'Data inválida: ' + field + '.');
    return value;
  }
  function idValue(value, field) { if (typeof value !== 'string' || !UUID.test(value)) fail('INVALID_REFERENCE', 'Referência inválida: ' + field + '.'); return value; }
  function money(value) { if (!Number.isSafeInteger(value) || value <= 0 || value > 100000000000) fail('INVALID_MONEY', 'Informe valor positivo em centavos inteiros.'); return value; }
  function enumValue(value, values, field) { if (values.indexOf(value) === -1) fail('INVALID_PAYLOAD', 'Estado inválido: ' + field + '.'); return value; }
  function allowed(payload, fields) { Object.keys(payload).forEach(function (k) { if (fields.indexOf(k) === -1) fail('INVALID_PAYLOAD', 'Campo não permitido: ' + k + '.'); }); }
  function find(snapshot, key, id) { var record = snapshot[key].find(function (x) { return x.id === id; }); if (!record) fail('INVALID_REFERENCE', 'Registro não encontrado na área autorizada.'); return record; }
  function validateCommand(raw, s, serverOwnsBalance) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('INVALID_COMMAND', 'Comando inválido.');
    allowed(raw, ['type', 'idempotencyKey', 'reason', 'payload']);
    if (!Object.prototype.hasOwnProperty.call(COMMANDS, raw.type)) fail('INVALID_COMMAND', 'Ação não permitida.');
    if (s.permissions.indexOf(COMMANDS[raw.type]) === -1) fail('FORBIDDEN', 'Seu perfil não permite esta ação.');
    var domain = { lead: 'leads', invoice: 'invoices', expense: 'expenses', case: 'cases', incident: 'incidents', subscription: 'accounts' }[raw.type.split('.')[0]];
    var needed = [domain];
    if (raw.type === 'invoice.recordPayment') needed.push('payments');
    if (raw.type === 'expense.recordPayment') needed.push('expensePayments');
    needed.forEach(function (key) { if (!s.sources[key] || s.sources[key].status !== 'ready') fail('SOURCE_NOT_READY', 'Atualize a fonte desta ação antes de gravar.'); });
    var c = { type: raw.type, idempotencyKey: textValue(raw.idempotencyKey, 'idempotencyKey', 120, true), reason: textValue(raw.reason, 'reason', 500, true), payload: clone(raw.payload || {}) };
    if (!/^[a-zA-Z0-9_.:-]{8,120}$/.test(c.idempotencyKey) || c.reason.length < 3 || !c.payload || typeof c.payload !== 'object' || Array.isArray(c.payload)) fail('INVALID_COMMAND', 'Informe motivo e chave idempotente válidos.');
    var p = c.payload, type = c.type;
    if (type === 'lead.create' || type === 'lead.update') {
      allowed(p, ['id', 'name', 'stage', 'source', 'nextActionAt', 'owner', 'notes', 'lossReason']);
      if (type === 'lead.update') find(s, 'leads', idValue(p.id, 'id')); else if (p.id !== undefined) fail('INVALID_PAYLOAD', 'ID de criação é gerado pelo serviço.');
      if (type === 'lead.create' || p.name !== undefined) p.name = textValue(p.name, 'name', 200, true);
      if (p.stage !== undefined) enumValue(p.stage, STATES.lead, 'stage');
      if (p.source !== undefined) p.source = textValue(p.source, 'source', 120, false);
      if (p.notes !== undefined) p.notes = textValue(p.notes, 'notes', 2000, false);
      if (p.lossReason !== undefined) p.lossReason = textValue(p.lossReason, 'lossReason', 500, false);
      var previousLead = type === 'lead.update' ? find(s, 'leads', p.id) : {};
      if ((p.stage || previousLead.stage) === 'perdido' && !(p.lossReason || previousLead.lossReason)) fail('INVALID_PAYLOAD', 'Informe o motivo da perda.');
      if (s.role === 'sales' && p.owner !== undefined && (type === 'lead.update' || p.owner !== null) && p.owner !== s.currentUserId) fail('FORBIDDEN', 'Comercial só pode atribuir a si.');
      if (p.nextActionAt != null) dateValue(p.nextActionAt, 'nextActionAt', true);
    } else if (type === 'invoice.create' || type === 'expense.create') {
      allowed(p, type === 'invoice.create' ? ['accountId', 'label', 'totalCents', 'dueDate', 'competenceDate'] : ['payee', 'label', 'totalCents', 'dueDate', 'competenceDate']);
      money(p.totalCents); dateValue(p.dueDate, 'dueDate', false);
      if (p.competenceDate != null) dateValue(p.competenceDate, 'competenceDate', false);
      p.label = textValue(p.label, 'label', 200, true);
      if (type === 'invoice.create') find(s, 'accounts', idValue(p.accountId, 'accountId'));
      else p.payee = textValue(p.payee, 'payee', 200, true);
    } else if (type === 'invoice.recordPayment' || type === 'expense.recordPayment') {
      allowed(p, ['id', 'amountCents', 'paidAt', 'reference']);
      money(p.amountCents); dateValue(p.paidAt, 'paidAt', true); p.reference = textValue(p.reference, 'reference', 120, true);
      if (new Date(p.paidAt).getTime() > new Date(s.now).getTime()) fail('INVALID_DATE', 'Pagamento não pode ter data futura.');
      var invoice = type === 'invoice.recordPayment', item = find(s, invoice ? 'invoices' : 'expenses', idValue(p.id, 'id'));
      if (!serverOwnsBalance && ['void', 'cancelled', 'cancelado'].indexOf(item.status) !== -1) fail('INVALID_STATE', 'Registro cancelado não recebe baixa.');
      var paid = s[invoice ? 'payments' : 'expensePayments'].filter(function (x) { return x[invoice ? 'invoiceId' : 'expenseId'] === p.id && x.status === 'confirmed'; }).reduce(function (sum, x) { return sum + x.amountCents; }, 0);
      if (!serverOwnsBalance && p.amountCents > item.totalCents - paid) fail('OVERPAYMENT', 'Valor superior ao saldo em aberto.');
    } else if (type === 'case.create' || type === 'case.update') {
      allowed(p, ['id', 'accountId', 'subject', 'status', 'priority', 'owner', 'nextActionAt', 'incidentId'].concat(type === 'case.create' ? ['channel'] : []));
      if (type === 'case.update') find(s, 'cases', idValue(p.id, 'id')); else if (p.id !== undefined) fail('INVALID_PAYLOAD', 'ID de criação é gerado pelo serviço.');
      if (type === 'case.create' || p.subject !== undefined) p.subject = textValue(p.subject, 'subject', 200, true);
      if (p.accountId != null) find(s, 'accounts', idValue(p.accountId, 'accountId'));
      if (p.status !== undefined) enumValue(p.status, STATES.case, 'status');
      if (p.priority !== undefined) enumValue(p.priority, STATES.priority, 'priority');
      if (p.nextActionAt != null) dateValue(p.nextActionAt, 'nextActionAt', true);
      if (p.incidentId != null) { idValue(p.incidentId, 'incidentId'); if (!serverOwnsBalance) find(s, 'incidents', p.incidentId); }
      if (p.channel != null) enumValue(p.channel, ['manual', 'app', 'email', 'whatsapp'], 'channel');
    } else if (type === 'case.message') {
      allowed(p, ['id', 'text', 'visibility']); find(s, 'cases', idValue(p.id, 'id'));
      p.text = textValue(p.text, 'text', 4000, true); enumValue(p.visibility, ['internal', 'customer'], 'visibility');
    } else if (type === 'incident.create' || type === 'incident.update') {
      allowed(p, ['id', 'title', 'status', 'severity', 'owner', 'release', 'accountIds']);
      if (type === 'incident.update') find(s, 'incidents', idValue(p.id, 'id')); else if (p.id !== undefined) fail('INVALID_PAYLOAD', 'ID de criação é gerado pelo serviço.');
      if (type === 'incident.create' || p.title !== undefined) p.title = textValue(p.title, 'title', 200, true);
      if (p.status !== undefined) enumValue(p.status, STATES.incident, 'status');
      if (p.severity !== undefined) enumValue(p.severity, STATES.priority, 'severity');
      if (p.release !== undefined) p.release = textValue(p.release, 'release', 120, false);
      if (p.accountIds !== undefined) {
        if (!Array.isArray(p.accountIds) || p.accountIds.length > 100) fail('INVALID_REFERENCE', 'Contas inválidas.');
        p.accountIds.forEach(function (id) {
          idValue(id, 'accountIds');
          if (s.permissions.indexOf('customers.read') !== -1) find(s, 'accounts', id);
          else if (!serverOwnsBalance && !(type === 'incident.update' && (find(s, 'incidents', p.id).accountIds || []).indexOf(id) !== -1)) fail('INVALID_REFERENCE', 'Conta não disponível neste perfil de simulação.');
        });
      }
    } else if (type === 'subscription.requestCancel') {
      allowed(p, ['accountId', 'id', 'effectiveAt', 'note']); find(s, 'accounts', idValue(p.accountId, 'accountId'));
      if (p.id != null) { p.id = textValue(p.id, 'id', 120, true); if (!serverOwnsBalance) { var sub = find(s, 'subscriptions', idValue(p.id, 'id')); if (sub.accountId !== p.accountId) fail('INVALID_REFERENCE', 'Assinatura não pertence à conta.'); } }
      if (p.effectiveAt != null) dateValue(p.effectiveAt, 'effectiveAt', false);
      if (p.note != null) p.note = textValue(p.note, 'note', 2000, false);
    }
    if (p.owner != null) { idValue(p.owner, 'owner'); if (!s.operators.some(function (x) { return x.id === p.owner; })) fail('INVALID_REFERENCE', 'Responsável não está no diretório autorizado.'); }
    return c;
  }
  function canonical(value) { if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'; if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(function (k) { return JSON.stringify(k) + ':' + canonical(value[k]); }).join(',') + '}'; return JSON.stringify(value); }
  function notifier() {
    var listeners = new Set(), disposed = false;
    return {
      assert: function () { if (disposed) fail('DISPOSED', 'Sessão do painel encerrada.'); },
      emit: function (s) { if (!disposed) listeners.forEach(function (fn) { try { fn(clone(s)); } catch (_) { /* A view cannot roll back an accepted command. */ } }); },
      subscribe: function (fn) { this.assert(); if (typeof fn !== 'function') fail('INVALID_LISTENER', 'Observador inválido.'); listeners.add(fn); return function () { listeners.delete(fn); }; },
      dispose: function () { disposed = true; listeners.clear(); }
    };
  }
  function createDemoStore(options) {
    options = options || {};
    var data = sampleSnapshot(options.now), n = notifier(), serial = 10000, seen = new Map();
    var role = options.role || 'admin';
    if (!permissions[role]) fail('INVALID_ROLE', 'Perfil de simulação inválido.');
    function view() {
      data.role = role; data.permissions = permissions[role].slice(); data.now = clock(options.now);
      var s = filterPermissions(data);
      if (role === 'sales') { s.accounts = []; s.leads = s.leads.filter(function (x) { return x.owner === s.currentUserId; }); }
      if (role === 'support') { s.cases = s.cases.filter(function (x) { return !x.owner || x.owner === s.currentUserId; }); s.accounts = s.accounts.filter(function (a) { return s.cases.some(function (c) { return c.accountId === a.id; }); }); }
      if (role === 'viewer' || role === 'readonly') s.accounts.forEach(function (a) { a.name = 'Conta'; });
      if (role !== 'admin' && role !== 'owner' && role !== 'operations') Object.keys(s.sources).forEach(function (k) { s.sources[k].scope = 'authorizedOnly'; });
      return s;
    }
    function load() { n.assert(); return Promise.resolve(view()); }
    function command(raw) { return Promise.resolve().then(function () {
      n.assert();
      // Resolve replay before state-dependent validation (a paid invoice now has no open balance).
      if (raw && seen.has(raw.idempotencyKey)) {
        var previous = seen.get(raw.idempotencyKey);
        if (previous.actor !== role || canonical(raw) !== previous.raw) fail('IDEMPOTENCY_CONFLICT', 'Chave já utilizada com outro conteúdo ou ator.');
        if (view().permissions.indexOf(COMMANDS[raw.type]) === -1) fail('FORBIDDEN', 'Seu perfil não permite esta ação.');
        return Object.assign({}, clone(previous.result), { replayed: true });
      }
      var c = validateCommand(raw, view()), p = c.payload, next = clone(data), id, record, domain;
      var now = clock(options.now);
      function add(key, item) { domain = key; id = uuid(serial++); item.id = id; next[key].push(item); return item; }
      function update(key) { domain = key; id = p.id; record = find(next, key, id); Object.keys(p).forEach(function (k) { if (k !== 'id') record[k] = p[k]; }); record.updatedAt = now; return record; }
      if (c.type === 'lead.create') { record = add('leads', Object.assign({ stage: 'novo', source: 'manual', owner: uuid(9000), createdAt: now, updatedAt: now }, p)); if (!record.owner) record.owner = uuid(9000); }
      if (c.type === 'lead.update') update('leads');
      if (c.type === 'invoice.create' || c.type === 'expense.create') add(c.type === 'invoice.create' ? 'invoices' : 'expenses', Object.assign({ status: 'open', origin: 'manual', createdAt: now }, p));
      if (c.type === 'invoice.recordPayment' || c.type === 'expense.recordPayment') {
        var invoice = c.type === 'invoice.recordPayment', list = invoice ? 'payments' : 'expensePayments', key = invoice ? 'invoiceId' : 'expenseId';
        record = find(next, invoice ? 'invoices' : 'expenses', p.id);
        var payment = { amountCents: p.amountCents, paidAt: p.paidAt, reference: p.reference, status: 'confirmed', confirmed: true, kind: 'payment', origin: 'manual', createdAt: now }; payment[key] = p.id;
        if (invoice) { payment.accountId = record.accountId; payment.accessExpected = false; }
        add(list, payment);
        var paid = next[list].filter(function (x) { return x[key] === p.id && x.status === 'confirmed'; }).reduce(function (sum, x) { return sum + x.amountCents; }, 0);
        record.status = paid === record.totalCents ? 'paid' : 'partial'; record.updatedAt = now;
      }
      if (c.type === 'case.create') add('cases', Object.assign({ status: 'aberto', priority: 'media', owner: null, messages: [], createdAt: now, updatedAt: now }, p));
      if (c.type === 'case.update') { record = update('cases'); if (record.status === 'resolvido') record.resolvedAt = now; else delete record.resolvedAt; }
      if (c.type === 'case.message') { record = find(next, 'cases', p.id); domain = 'cases'; id = p.id; record.messages = record.messages || []; record.messages.push({ id: uuid(serial++), text: p.text, visibility: p.visibility, delivery: p.visibility === 'customer' ? 'not_sent' : 'internal', createdAt: now, actor: uuid(9000) }); record.updatedAt = now; }
      if (c.type === 'incident.create') add('incidents', Object.assign({ status: 'aberto', severity: 'media', owner: null, accountIds: [], createdAt: now, updatedAt: now }, p));
      if (c.type === 'incident.update') update('incidents');
      if (c.type === 'subscription.requestCancel') add('subscriptionRequests', { accountId: p.accountId, externalId: p.id || null, effectiveAt: p.effectiveAt || null, note: p.note || '', status: 'pending', createdAt: now, affectsAccess: false });
      var result = { ok: true, id: id, type: c.type, replayed: false, mode: 'demo' };
      next.audit.push({ id: uuid(serial++), action: c.type, actorId: uuid(9000), actorRole: role, objectId: id, type: c.type, command: c.type, targetId: id, actor: uuid(9000), actorLabel: 'Operador de exemplo', role: role, reason: c.reason, idempotencyKey: c.idempotencyKey, occurredAt: now, createdAt: now, payload: clone(p), mode: 'demo' });
      next.meta.generatedAt = now; next.sources[domain].updatedAt = now; next.sources.audit.updatedAt = now;
      data = next; seen.set(c.idempotencyKey, { actor: role, raw: canonical(raw), result: result }); n.emit(view()); return clone(result);
    }); }
    return { load: load, command: command, subscribe: n.subscribe.bind(n), dispose: function () { n.dispose(); data = null; seen.clear(); }, setRole: function (nextRole) { n.assert(); if (!permissions[nextRole]) fail('INVALID_ROLE', 'Perfil de simulação inválido.'); role = nextRole; var s = view(); n.emit(s); return Promise.resolve(s); } };
  }

  function isMissing(error) { return !!error && (error.code === 'PGRST202' || error.code === '42883'); }
  function isDenied(error) { return !!error && (error.code === '42501' || error.code === 'PGRST301' || error.code === 'AUTH_REQUIRED' || error.code === 'FORBIDDEN' || error.status === 401 || error.status === 403); }
  function safeMessage(error) { return isMissing(error) ? 'Contrato operacional ainda não instalado no servidor.' : isDenied(error) ? 'Acesso não autorizado pelo servidor.' : 'Não foi possível atualizar esta fonte. Tente novamente.'; }
  function createLiveStore(options) {
    options = options || {};
    var client = options.client;
    if (!client || !client.auth || typeof client.auth.getSession !== 'function' || typeof client.rpc !== 'function') fail('INVALID_CLIENT', 'Cliente autenticado não disponível.');
    var n = notifier(), current = null, currentUser = null, inflight = null, commandTail = Promise.resolve(), writeDisabled = false, legacyAdmin = false, authGeneration = 0, authSubscription = null, disposed = false;
    if (typeof client.auth.onAuthStateChange === 'function') {
      var authHandle = client.auth.onAuthStateChange(function (event, session) {
        if (disposed) return;
        var userId = session && session.user && session.user.id;
        if (event === 'SIGNED_OUT' || (currentUser && userId && currentUser !== userId)) {
          authGeneration += 1; currentUser = null; writeDisabled = false; legacyAdmin = false;
          current = blank(clock(), 'live'); current.meta.authenticated = false;
          Object.keys(current.sources).forEach(function (key) { current.sources[key] = source('unavailable', 'authorization', null, 'Sessão alterada. Entre novamente para consultar os dados.'); });
          n.emit(current);
        }
      });
      authSubscription = authHandle && authHandle.data && authHandle.data.subscription;
    }
    async function rpc(name, args) { var result = await client.rpc(name, args); if (!result || result.error) throw result && result.error || { code: 'INVALID_RESPONSE' }; return result.data; }
    async function authorize() {
      var result = await client.auth.getSession();
      if (!result || result.error) throw result && result.error || { code: 'AUTH_REQUIRED' };
      var session = result.data && result.data.session;
      if (!session || !session.user || !session.user.id) fail('AUTH_REQUIRED', 'Entre com uma conta autorizada.');
      if (currentUser && currentUser !== session.user.id) { current = null; writeDisabled = false; }
      currentUser = session.user.id;
      legacyAdmin = await rpc('hq_sou_admin') === true;
    }
    function unavailable(error, clear) {
      var now = clock(), s = !clear && current ? clone(current) : blank(now, 'live');
      s.meta.commandsAvailable = false; s.meta.lastAttemptAt = now; s.meta.error = safeMessage(error);
      if (clear) { s.role = null; s.permissions = []; s.meta.authenticated = false; currentUser = null; }
      s.permissions = s.permissions.filter(function (p) { return p.endsWith('.read'); });
      Object.keys(s.sources).forEach(function (k) { var old = s.sources[k]; s.sources[k] = source(!clear && old.updatedAt && ['ready', 'stale'].indexOf(old.status) !== -1 ? 'stale' : 'error', old.origin, old.updatedAt, safeMessage(error), { lastAttemptAt: now }); });
      return s;
    }
    function normalized(raw) {
      if (!raw || raw.version !== 1 || !raw.meta || ['server', 'live'].indexOf(raw.meta.mode) === -1 || ['admin', 'finance', 'support', 'sales', 'engineering', 'viewer'].indexOf(raw.role) === -1 || !Array.isArray(raw.permissions) || !raw.sources || !raw.now || !Number.isFinite(Date.parse(raw.now))) fail('INVALID_SNAPSHOT', 'Contrato operacional incompatível.');
      if (raw.permissions.some(function (p) { return permissions[raw.role].indexOf(p) === -1; })) fail('INVALID_SNAPSHOT', 'Permissões incompatíveis com o contrato operacional.');
      var s = blank(raw.now, 'live'); s.role = raw.role; s.permissions = raw.permissions.slice();
      s.currentUserId = typeof raw.currentUserId === 'string' ? raw.currentUserId : null;
      s.operators = Array.isArray(raw.operators) ? raw.operators.map(function (x) { return { id: x.id, name: x.name }; }) : [];
      s.meta = Object.assign({}, raw.meta, { mode: 'live', serverMode: raw.meta.mode, authenticated: true, commandsAvailable: raw.meta.commandsAvailable === true && !writeDisabled });
      if (!s.meta.commandsAvailable) s.permissions = s.permissions.filter(function (p) { return p.endsWith('.read'); });
      Object.keys(DOMAIN).forEach(function (k) {
        var src = raw.sources[k];
        if (src && ['ready', 'unavailable', 'error', 'stale'].indexOf(src.status) !== -1) s.sources[k] = clone(src);
        if (src && ['ready', 'stale'].indexOf(src.status) !== -1) {
          if (!Array.isArray(raw[k])) fail('INVALID_SNAPSHOT', 'Lista operacional incompatível: ' + k + '.');
          s[k] = clone(raw[k]);
        }
        // Preserve only a source previously authorized to this same current role.
        if (src && src.status === 'error' && current && current.role === s.role && current.permissions.indexOf(DOMAIN[k]) !== -1 && s.permissions.indexOf(DOMAIN[k]) !== -1 && current.sources[k].updatedAt) {
          s[k] = clone(current[k]); s.sources[k] = Object.assign({}, current.sources[k], { status: 'stale', message: src.message || safeMessage(), lastAttemptAt: raw.now });
        }
      });
      if (raw.sources.finance) s.sources.finance = clone(raw.sources.finance);
      if (raw.sources.legacySupport && s.permissions.indexOf('support.read') !== -1) s.sources.legacySupport = clone(raw.sources.legacySupport);
      return filterPermissions(s);
    }
    var LEGACY = ['hq_kpis', 'hq_clientes', 'hq_receita_mensal', 'hq_suporte_threads', 'hq_erros', 'hq_saude', 'hq_uso'];
    function legacyValue(name, value) {
      if (name === 'hq_kpis') { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid legacy'); return pick(value, ['clientes', 'ativos', 'trial', 'cancelados', 'mrr', 'recebido_mes']); }
      if (name === 'hq_uso') { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid legacy'); return { academias: value.academias, recursos: Array.isArray(value.recursos) ? value.recursos.map(function (x) { return pick(x, ['chave', 'nome', 'usam']); }) : [] }; }
      if (!Array.isArray(value)) throw new Error('Invalid legacy');
      var fields = { hq_clientes: ['id', 'nome', 'criada', 'tipo', 'plano', 'status'], hq_receita_mensal: ['mes', 'total'], hq_suporte_threads: ['academia_id', 'nome', 'ultima', 'nao_lidas'], hq_erros: ['academia_id', 'nome', 'erros', 'ultimo'], hq_saude: ['id', 'academia_id', 'nome', 'sinais', 'assinatura_status', 'tipo'] };
      return value.map(function (x) { return pick(x, fields[name]); });
    }
    function pick(value, fields) { var out = {}; fields.forEach(function (k) { if (value[k] !== undefined) out[k] = value[k]; }); return out; }
    async function legacy() {
      var now = clock(), s = blank(now, 'live'); s.role = 'legacy_admin'; s.permissions = READ.slice(); s.currentUserId = currentUser;
      s.meta = { mode: 'live', generatedAt: now, authenticated: true, commandsAvailable: false, compatibility: 'legacy-readonly', authOrigin: 'hq_sou_admin', label: 'Leitura do HQ legado · integração operacional pendente' };
      s.legacy = {};
      var results = await Promise.allSettled(LEGACY.map(function (name) { return rpc(name).then(function (data) { return legacyValue(name, data); }); }));
      if (results.some(function (r) { return r.status === 'rejected' && isDenied(r.reason); })) fail('FORBIDDEN', 'Permissão revogada durante a leitura.');
      results.forEach(function (r, i) {
        var name = LEGACY[i], key = 'legacy.' + name;
        if (r.status === 'fulfilled') { s.legacy[name] = r.value; s.sources[key] = source('ready', name, now, 'Consulta legada; não representa o histórico operacional completo.'); }
        else if (current && current.role === 'legacy_admin' && current.legacy && current.legacy[name] !== undefined) { s.legacy[name] = clone(current.legacy[name]); s.sources[key] = Object.assign({}, current.sources[key], { status: 'stale', lastAttemptAt: now, message: safeMessage(r.reason) }); }
        else s.sources[key] = source(isMissing(r.reason) ? 'unavailable' : 'error', name, null, safeMessage(r.reason));
      });
      if (s.legacy.hq_clientes) {
        s.accounts = s.legacy.hq_clientes.map(function (x) { return { id: x.id, name: x.nome, createdAt: x.criada, product: x.tipo, sourceStatus: x.status, sourcePlan: x.plano, source: 'hq_clientes', accessStatus: 'unknown' }; });
        s.sources.accounts = Object.assign({}, s.sources['legacy.hq_clientes'], { message: 'Cadastro legado; status comercial não comprova acesso ou vigência de assinatura.' });
      } else s.sources.accounts = Object.assign({}, s.sources['legacy.hq_clientes']);
      s.sources.finance = source('unavailable', 'legacy_manual_aggregates', null, 'Há agregados manuais em legacy; faltam faturas e conciliação para calcular caixa, competência, AR e AP com este contrato.');
      ['subscriptions', 'events'].forEach(function (k) { s.sources[k].message = 'Falta histórico verificável de vigência e movimentos. Churn e MRR temporal indisponíveis.'; });
      s.sources.cases.message = 'Conversas antigas estão em legacy; ainda não são casos com protocolo e prazo.';
      s.sources.legacySupport = source('unavailable', 'public.saas_tickets+public.suporte_chamados', null, 'O histórico de suporte ainda não foi unificado aos casos operacionais.', { reason: 'migration_pending', migrationPending: true, scope: 'legacyOnly' });
      s.sources.incidents.message = 'Erros técnicos agregados estão em legacy; ainda não são incidentes acompanhados.';
      return s;
    }
    async function performLoad() {
      n.assert(); var generation = authGeneration;
      try { await authorize(); } catch (error) { n.assert(); current = unavailable(error, true); n.emit(current); return clone(current); }
      n.assert(); if (generation !== authGeneration) return clone(current || blank(clock(), 'live'));
      try {
        var data, missing = false;
        try { data = await rpc('hq_ops_snapshot'); } catch (error) { if (!isMissing(error)) throw error; missing = true; }
        if (missing && !legacyAdmin) fail('FORBIDDEN', 'Perfil operacional não autorizado no servidor.');
        var next = missing ? await legacy() : normalized(data);
        n.assert(); if (generation !== authGeneration) return clone(current || blank(clock(), 'live'));
        current = next;
      } catch (error) {
        n.assert(); if (generation !== authGeneration) return clone(current || blank(clock(), 'live'));
        // A failed staff snapshot gives no fresh proof of that staff member's scope.
        // An admin guard confirmed on this request can safely retain prior read data.
        current = unavailable(error, isDenied(error) || (error && error.code === 'INVALID_SNAPSHOT') || !legacyAdmin);
      }
      n.assert(); n.emit(current); return clone(current);
    }
    function load() { n.assert(); if (!inflight) inflight = performLoad().finally(function () { inflight = null; }); return inflight; }
    async function auditExport(input) {
      n.assert(); var generation = authGeneration;
      await authorize();
      if (!current || current.currentUserId !== currentUser || current.permissions.indexOf('reports.export') < 0 || current.meta.exportAuditAvailable !== true) fail('EXPORT_AUDIT_UNAVAILABLE', 'Auditoria da exportação indisponível. Atualize a central.');
      var result = await rpc('hq_ops_export_audit', {p_report:input.report,p_filters:input.filters,p_snapshot_at:input.snapshotAt,p_rows:input.rows,p_content_sha256:input.contentSha256,p_idempotency_key:input.idempotencyKey});
      n.assert(); if (generation !== authGeneration || !result || result.ok !== true) fail('EXPORT_AUDIT_FAILED', 'A exportação não foi autorizada nesta sessão.');
      return result;
    }
    function command(raw) {
      var action = commandTail.then(async function () {
        n.assert(); var s = await load();
        if (!s.meta.commandsAvailable) fail('READ_ONLY', 'Gravação operacional indisponível. Nenhuma alteração foi enviada.');
        // Balance, concurrency and replay checks belong to the server transaction.
        var c = validateCommand(raw, s, true), result;
        try { result = await rpc('hq_ops_command', { p_command: c }); }
        catch (error) {
          if (isMissing(error)) { writeDisabled = true; current.meta.commandsAvailable = false; current.permissions = current.permissions.filter(function (p) { return p.endsWith('.read'); }); n.emit(current); fail('READ_ONLY', 'Comandos operacionais não instalados. Nenhuma alteração foi aplicada.'); }
          if (isDenied(error)) { current = unavailable(error, true); n.emit(current); }
          var e = new Error(safeMessage(error)); e.code = error && error.code || 'COMMAND_FAILED'; throw e;
        }
        if (!result || result.ok !== true) fail('COMMAND_FAILED', 'O servidor não confirmou a alteração. Atualize antes de tentar novamente.');
        await load(); return clone(result);
      });
      commandTail = action.catch(function () {}); return action;
    }
    return { load: load, command: command, auditExport: auditExport, subscribe: n.subscribe.bind(n), dispose: function () { disposed = true; authGeneration += 1; n.dispose(); if (authSubscription && typeof authSubscription.unsubscribe === 'function') authSubscription.unsubscribe(); current = null; currentUser = null; } };
  }
  return Object.freeze({ version: 1, permissions: permissions, commandPermissions: Object.freeze(COMMANDS), states: STATES, sampleSnapshot: sampleSnapshot, createDemoStore: createDemoStore, createLiveStore: createLiveStore });
}));
