/**
 * Ponte INATIVA entre o nucleo puro e um store injetado. Nao e um endpoint e
 * nao implementa cliente SQL, gateway, autenticacao, acesso ou pagamento.
 *
 * Somente o futuro adaptador confiavel do servidor pode fornecer customerKey,
 * contexto, evento normalizado/verificado e relogio. `verified`/`trusted` sao
 * contratos internos; nao autenticam JSON do navegador nem payload de webhook.
 * loadCustomer deve ler campanha/contexto protegidos. commitCustomer deve, em
 * UMA transacao, comparar revisao, preservar contexto e gravar estado + recibo
 * normalizado, com unicidade semantica de evento/cliente/ciclo. A fila duravel
 * deve guardar needs_review/deferred mesmo quando coreState nao consome evento.
 * Um recibo pendente identico precisa permitir reconciliacao posterior, sem
 * perder o historico. Se o core retorna duplicate_event de um recibo pendente,
 * o store conserva a pendencia: repeticao nao resolve hold. Payload conflitante
 * nunca e um conflito de revisao.
 */
import { applySalesEvent, emptySalesState, TRIAL_DAYS } from './personal-sales.mjs';

const HISTORY_FIELDS = ['paymentHistoryVerified', 'firstPaidInvoiceId', 'firstPaidAt'];
const ACCOUNT_FIELDS = ['trusted', 'trialStartedAt', 'trialEndsAt'];
const GATEWAY_FIELDS = ['provider', 'merchantAccountId', 'subscriptionId'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ID = /^[A-Za-z0-9_.:-]{1,160}$/;

function requireCondition(value, code) {
  if (!value) throw new TypeError(code);
}
function copy(value) { return JSON.parse(JSON.stringify(value)); }
function instant(value, code) {
  const ms = typeof value === 'string' ? Date.parse(value) : NaN;
  requireCondition(Number.isFinite(ms) && new Date(ms).toISOString() === value, code);
  return ms;
}
function validateInput(store, customerKey, serverNow, maxAttempts) {
  requireCondition(store && typeof store.loadCustomer === 'function' &&
    typeof store.commitCustomer === 'function', 'invalid_referral_store');
  requireCondition(typeof customerKey === 'string' && UUID.test(customerKey), 'invalid_customer_key');
  instant(serverNow, 'server_now');
  requireCondition(Number.isInteger(maxAttempts) && maxAttempts >= 1 && maxAttempts <= 3, 'invalid_max_attempts');
}
function validateSnapshot(snapshot) {
  requireCondition(snapshot && Number.isSafeInteger(snapshot.revision) && snapshot.revision >= 0,
    'invalid_store_revision');
  requireCondition(snapshot.coreState != null || snapshot.revision === 0, 'missing_persisted_state');
  const state = snapshot.coreState ?? emptySalesState();
  requireCondition(state.schemaVersion === 1 && ['events', 'commissions', 'holds', 'audit']
    .every(key => Array.isArray(state[key])), 'invalid_store_state');
  return copy(state);
}
function hasGateway(account) {
  const count = GATEWAY_FIELDS.filter(key => account?.[key] != null).length;
  requireCondition(count === 0 || count === GATEWAY_FIELDS.length, 'partial_gateway_binding');
  return count !== 0;
}
function resolveContext(saved, incoming, state, serverNow, customerKey, event, campaign) {
  requireCondition((saved ?? incoming) && typeof (saved ?? incoming) === 'object', 'missing_server_context');
  // O snapshot salvo prevalece inclusive se a politica atual ja foi desligada.
  const context = copy(saved ?? incoming);
  // Somente no primeiro registro: snapshot protegido, sem habilitar a campanha.
  if (!saved && context.policy == null && campaign?.policy != null) context.policy = copy(campaign.policy);
  requireCondition(context.policy && typeof context.policy === 'object' && !Array.isArray(context.policy),
    'missing_policy_snapshot');
  requireCondition(context.account?.trusted === true, 'untrusted_account_context');
  // customerId e a identidade Torque; nao e o identificador do gateway.
  for (const source of [saved, incoming]) {
    requireCondition(source?.account?.customerId == null || source.account.customerId === customerKey,
      'context_identity_conflict');
  }
  if (event) requireCondition(event.customerId === customerKey, 'event_customer_key_mismatch');
  context.account.customerId = customerKey;
  const savedGateway = hasGateway(saved?.account);
  const incomingGateway = hasGateway(incoming?.account);
  if (saved && incoming?.account) {
    for (const key of ACCOUNT_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(incoming.account, key)) {
        requireCondition(incoming.account[key] === saved.account?.[key], 'context_identity_conflict');
      }
    }
  }
  if (savedGateway) {
    for (const key of GATEWAY_FIELDS) {
      if (incomingGateway) {
        requireCondition(incoming.account[key] === saved.account[key], 'context_identity_conflict');
      }
    }
  } else if (event) {
    requireCondition(state.commissions.length === 0, 'gateway_binding_after_commission');
    requireCondition(hasGateway(event), 'missing_gateway_binding');
    for (const key of GATEWAY_FIELDS) {
      if (incomingGateway) requireCondition(incoming.account[key] === event[key], 'context_identity_conflict');
      context.account[key] = event[key];
    }
  } else {
    requireCondition(!incomingGateway, 'gateway_binding_requires_event');
  }
  if (saved && state.commissions.length === 0 && incoming?.account) {
    for (const key of HISTORY_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(incoming.account, key)) {
        context.account[key] = copy(incoming.account[key] ?? null);
      }
    }
  }
  const account = context.account;
  if (hasGateway(account)) {
    requireCondition(['pagarme', 'asaas'].includes(account.provider), 'unsupported_provider');
    for (const key of ['subscriptionId', 'merchantAccountId']) {
      requireCondition(typeof account[key] === 'string' && ID.test(account[key]), 'account_' + key);
    }
  }
  const trialStart = instant(account.trialStartedAt, 'server_trial_start');
  const trialEnd = instant(account.trialEndsAt, 'server_trial_end');
  requireCondition(trialEnd === trialStart + TRIAL_DAYS * 86400000 &&
    trialStart <= instant(serverNow, 'server_now'), 'invalid_server_trial');
  requireCondition(context.customerLabel === undefined ||
    (typeof context.customerLabel === 'string' && context.customerLabel.length <= 120), 'customer_label');
  return context;
}
function revisionConflict(error) {
  return error?.code === 'HQ409' &&
    (error.message === 'revision_conflict' || error.reason === 'revision_conflict');
}

async function updateCustomer(store, input, maxAttempts, reduce) {
  validateInput(store, input.customerKey, input.serverNow, maxAttempts);
  // Copia antes do primeiro await: o chamador nao muda esta operacao em voo.
  const stableInput = copy(input);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const snapshot = await store.loadCustomer(stableInput.customerKey);
    const state = validateSnapshot(snapshot);
    const context = resolveContext(snapshot.context, stableInput.context, state, stableInput.serverNow,
      stableInput.customerKey, stableInput.event, snapshot.campaign);
    const result = reduce(state, context, snapshot.campaign, stableInput);
    try {
      // O recibo devolvido pelo store e canonico, inclusive em deduplicacao.
      return await store.commitCustomer({ customerKey: stableInput.customerKey,
        expectedRevision: snapshot.revision, context, event: stableInput.event ?? null,
        coreState: result.state, outcome: result.outcome, reason: result.reason ?? null,
        observedAt: stableInput.serverNow });
    } catch (error) {
      if (!revisionConflict(error) || attempt === maxAttempts) throw error;
      // Somente CAS: reler campanha, contexto e estado antes de recalcular.
    }
  }
}

export async function processReferralEvent(store,
  { customerKey, context, event, serverNow }, { maxAttempts = 3 } = {}) {
  return updateCustomer(store, { customerKey, context, event, serverNow }, maxAttempts,
    (state, currentContext, campaign, input) => {
      const existing = state.commissions.some(entry => entry.customerId === input.event?.customerId);
      const blocked = input.event?.kind === 'payment_confirmed' && !existing && campaign?.enabled !== true;
      const result = applySalesEvent(state, { event: input.event, account: currentContext.account,
        policy: currentContext.policy ?? null, attribution: blocked ? null : currentContext.attribution ?? null,
        serverNow: input.serverNow });
      if (blocked) return { state, outcome: 'needs_review', reason: 'campaign_inactive' };
      return result;
    });
}

/** Registra intencao/trial canonicos; nunca habilita campanha ou cria comissao.
 * Antes do checkout, account pode conter somente trusted e as datas do trial:
 * customerId recebe customerKey e os tres campos de gateway ficam ausentes/null.
 * Somente um primeiro evento verificado pode vincular o gateway; o vinculo e
 * imutavel depois. O evento ainda passa por todas as validacoes do nucleo antes
 * de qualquer commit. Registrar trial nao inventa identificadores do provedor.
 * Repeticao de event:null nao pode rebaixar no store um status financeiro ja
 * existente. Nao e cadastro publico e nao concede acesso a service_role.
 */
export async function registerReferral(store,
  { customerKey, context, serverNow }, { maxAttempts = 3 } = {}) {
  return updateCustomer(store, { customerKey, context, event: null, serverNow }, maxAttempts,
    state => ({ state, outcome: 'trial', reason: null }));
}
