/**
 * Nucleo puro e INATIVO de vendas do TORQUE PERSONAL. Nao e um endpoint.
 * Nao consulta gateways/banco, nao libera acesso e nao transfere dinheiro.
 *
 * FRONTEIRA DE CONFIANCA: policy, catalog, account, attribution e state devem
 * vir de registros protegidos do servidor. O adaptador ainda nao implementado
 * deve autenticar o provedor, consultar a cobranca, resolver o cliente e seu
 * primeiro ciclo pago e fornecer o relogio do servidor. `verified: true` neste
 * contrato NAO autentica JSON do navegador/webhook; nunca repassar esse JSON.
 *
 * ARMAZENAMENTO: os arrays abaixo nao protegem concorrencia entre processos.
 * A ponte local hq-referrals-store.mjs e a migration hq_referrals_ledger modelam
 * CAS, recibos de eventos e livro administrativo separado; ainda precisam da
 * integracao confiavel e de implantacao autorizada. Nunca gravar os arrays sem
 * transacao/unicidade por evento, cliente canonico e primeiro ciclo adquirido.
 * `holds` preserva fatos negativos recebidos antes da comissao. O adaptador nao
 * pode descarta-los; a resolucao exige reconciliacao explicita e auditada, ainda
 * nao implementada aqui. Nao existe aprovacao de comissao nem liberacao de hold.
 * Cupons e politicas reais nao sao cadastrados nem habilitados por este modulo.
 */
export const BASE_PRICE_CENTS = 4990;
export const TRIAL_DAYS = 14;
const DAY_MS = 86400000;
const BPS = 10000;
const KINDS = new Set(['payment_confirmed', 'payment_failed', 'subscription_canceled',
  'refund_confirmed', 'dispute_opened', 'dispute_won', 'dispute_lost']);

function requireCondition(value, code) {
  if (!value) throw new TypeError(code);
}
function identifier(value, name) {
  requireCondition(typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,160}$/.test(value), name);
  return value;
}
function integer(value, name, max = Number.MAX_SAFE_INTEGER) {
  requireCondition(Number.isSafeInteger(value) && value >= 0 && value <= max, name);
  return value;
}
function instant(value, name) {
  const ms = typeof value === 'string' ? Date.parse(value) : NaN;
  requireCondition(Number.isFinite(ms) && new Date(ms).toISOString() === value, name);
  return ms;
}
function copy(value) { return JSON.parse(JSON.stringify(value)); }
function freeze(value) {
  Object.values(value).forEach(v => { if (v && typeof v === 'object') freeze(v); });
  return Object.freeze(value);
}
function roundRatio(value, numerator, denominator) {
  const result = (BigInt(value) * BigInt(numerator) + BigInt(denominator) / 2n) / BigInt(denominator);
  requireCondition(result <= BigInt(Number.MAX_SAFE_INTEGER), 'unsafe_money');
  return Number(result);
}
function stable(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
}

/** Nao existe porcentagem padrao. Bps: 4000 = 40%; todos explicitos. */
export function createPolicySnapshot(config) {
  requireCondition(config && config.status === 'approved' && config.enabled === true, 'policy_not_approved_or_enabled');
  identifier(config.version, 'policy_version');
  identifier(config.campaignId, 'campaign_id');
  identifier(config.approval?.id, 'approval_id');
  instant(config.approval?.approvedAt, 'approval_timestamp');
  requireCondition(config.basePriceCents === BASE_PRICE_CENTS && config.trialDays === TRIAL_DAYS, 'unsupported_price_or_trial');
  requireCondition(config.commissionBasis === 'full_price', 'commission_basis');
  const names = ['discountBps', 'commissionBps', 'operatingReserveBps', 'remainderBps'];
  names.forEach(n => integer(config[n], n, BPS));
  requireCondition(names.reduce((sum, n) => sum + config[n], 0) === BPS, 'allocation_must_total_100_percent');
  // Desconto e comissao tem prioridade no arredondamento; nao podem consumir
  // mais que o preco. Reserva e restante absorvem a diferenca em centavos.
  requireCondition(roundRatio(BASE_PRICE_CENTS, config.discountBps, BPS) +
    roundRatio(BASE_PRICE_CENTS, config.commissionBps, BPS) <= BASE_PRICE_CENTS, 'priority_rounding_exceeds_price');
  return freeze({ version: config.version, campaignId: config.campaignId, status: 'approved', enabled: true,
    approval: { id: config.approval.id, approvedAt: config.approval.approvedAt },
    basePriceCents: BASE_PRICE_CENTS, trialDays: TRIAL_DAYS, commissionBasis: 'full_price',
    ...Object.fromEntries(names.map(n => [n, config[n]])) });
}

/** catalog deve ser do servidor. Um codigo invalido explicito nao cai no link. */
export function resolveAttribution({ code, link } = {}, catalog = [], serverNow) {
  const now = instant(serverNow, 'server_now');
  requireCondition(Array.isArray(catalog), 'catalog');
  const source = code !== undefined && code !== null && code !== '' ? 'code' : 'link';
  const input = source === 'code' ? code : link;
  if (input === undefined || input === null || input === '') return { status: 'unattributed', attribution: null };
  if (typeof input !== 'string' || !/^[A-Za-z0-9_-]{1,48}$/.test(input.trim())) return { status: 'rejected', reason: 'invalid_code', attribution: null };
  const normalized = input.trim().toUpperCase();
  const matches = catalog.filter(c => c.code === normalized);
  if (matches.length !== 1) return { status: 'rejected', reason: 'unknown_or_ambiguous_code', attribution: null };
  const record = matches[0];
  if (record.enabled !== true || record.status !== 'approved') return { status: 'rejected', reason: 'inactive_code', attribution: null };
  if (record.validFrom && now < instant(record.validFrom, 'code_valid_from')) return { status: 'rejected', reason: 'inactive_code', attribution: null };
  if (record.expiresAt && now >= instant(record.expiresAt, 'code_expiry')) return { status: 'rejected', reason: 'expired_code', attribution: null };
  for (const field of ['id', 'partnerId', 'campaignId', 'policyVersion']) identifier(record[field], 'catalog_' + field);
  return { status: source === 'code' ? 'attributed' : 'provisional', attribution: freeze({
    trusted: true, source, code: normalized, couponId: record.id, partnerId: record.partnerId,
    campaignId: record.campaignId, policyVersion: record.policyVersion, assignedAt: serverNow
  }) };
}

/** Sem cupom validado: cotacao base, mesmo sem politica de comissao definida. */
export function quoteFirstMonth(policy = null, attribution = null) {
  const base = { currency: 'BRL', basePriceCents: BASE_PRICE_CENTS, trialDays: TRIAL_DAYS,
    discountCents: 0, payableCents: BASE_PRICE_CENTS, commissionCents: 0,
    operatingReserveCents: 0, remainderCents: BASE_PRICE_CENTS, policySnapshot: null };
  if (!attribution) return freeze(base);
  requireCondition(attribution.trusted === true && ['code', 'link'].includes(attribution.source), 'untrusted_attribution');
  if (attribution.source === 'link') return freeze(base);
  const snapshot = createPolicySnapshot(policy);
  for (const field of ['couponId', 'partnerId', 'campaignId', 'policyVersion']) identifier(attribution[field], 'attribution_' + field);
  requireCondition(typeof attribution.code === 'string' && /^[A-Z0-9_-]{1,48}$/.test(attribution.code), 'attribution_code');
  instant(attribution.assignedAt, 'attribution_timestamp');
  requireCondition(attribution.campaignId === snapshot.campaignId && attribution.policyVersion === snapshot.version, 'attribution_policy_mismatch');
  const discountCents = roundRatio(BASE_PRICE_CENTS, snapshot.discountBps, BPS);
  const commissionCents = roundRatio(BASE_PRICE_CENTS, snapshot.commissionBps, BPS);
  const operatingReserveCents = Math.min(roundRatio(BASE_PRICE_CENTS, snapshot.operatingReserveBps, BPS),
    BASE_PRICE_CENTS - discountCents - commissionCents);
  // Desconto/comissao half-up sao prioritarios. A reserva absorve um eventual
  // centavo excedente; o resto recebe o residual para a soma fechar exatamente.
  const remainderCents = BASE_PRICE_CENTS - discountCents - commissionCents - operatingReserveCents;
  requireCondition(remainderCents >= 0, 'allocation_rounding_exceeds_price');
  return freeze({ ...base, discountCents, payableCents: BASE_PRICE_CENTS - discountCents,
    commissionCents, operatingReserveCents, remainderCents, policySnapshot: snapshot });
}

export function emptySalesState() { return { schemaVersion: 1, events: [], commissions: [], holds: [], audit: [] }; }

function validatedEvent(event, account, serverNow) {
  const now = instant(serverNow, 'server_now');
  requireCondition(event?.verified === true && event.verification?.source === 'provider_api', 'unverified_payment_event');
  requireCondition(account?.trusted === true, 'untrusted_account_context');
  requireCondition(['pagarme', 'asaas'].includes(event.provider) && KINDS.has(event.kind), 'unsupported_event');
  for (const field of ['id', 'merchantAccountId', 'customerId', 'subscriptionId', 'invoiceId', 'chargeId']) identifier(event[field], 'event_' + field);
  requireCondition(event.provider === account.provider && event.merchantAccountId === account.merchantAccountId &&
    event.customerId === account.customerId && event.subscriptionId === account.subscriptionId, 'event_account_mismatch');
  const happened = instant(event.occurredAt, 'event_timestamp');
  const checked = instant(event.verification.checkedAt, 'verification_timestamp');
  requireCondition(happened <= now && checked <= now && checked >= happened, 'future_or_unchecked_event');
  requireCondition(event.currency === 'BRL', 'unsupported_currency');
  integer(event.cycleIndex, 'cycle_index');
  requireCondition(event.cycleIndex >= 1, 'cycle_index');
  integer(event.amountCents, 'event_amount');
  return now;
}

/**
 * Eventos normalizados pelo adaptador: amountCents e o valor ORIGINAL capturado;
 * refund_confirmed.refundedCents e o estorno CUMULATIVO do ciclo consultado no
 * provedor, agregado pelo adaptador quando houver mais de uma charge/tentativa.
 * Antes de ajustar uma charge adicional, o adaptador deve reconciliar seu
 * payment_confirmed no ciclo para ela constar em commission.chargeIds.
 * observed serverNow e passado pelo servidor (nunca Date.now do navegador).
 * Resultado e uma proposta de lancamento/ajuste, jamais uma ordem de pagamento.
 */
export function applySalesEvent(state, { event, account, policy = null, attribution = null, serverNow }) {
  const now = validatedEvent(event, account, serverNow);
  requireCondition(state?.schemaVersion === 1 && Array.isArray(state.events) && Array.isArray(state.commissions) &&
    Array.isArray(state.holds) && Array.isArray(state.audit), 'invalid_state');
  const eventKey = JSON.stringify([event.provider, event.merchantAccountId, event.id]);
  // checkedAt pode mudar numa nova consulta legitima; nao faz parte do conteudo.
  const { verification, verified, ...content } = event;
  const fingerprint = stable(content);
  const priorEvent = state.events.find(e => e.key === eventKey);
  if (priorEvent) {
    requireCondition(priorEvent.fingerprint === fingerprint, 'event_id_payload_conflict');
    return { state: copy(state), outcome: 'duplicate_event', commission: null };
  }
  const next = copy(state);
  const finish = (outcome, reason, entry = null, persist = true) => {
    if (persist) {
      next.events.push({ key: eventKey, fingerprint, outcome });
      next.audit.push({ eventKey, kind: event.kind, outcome, reason, observedAt: serverNow,
        commissionId: entry?.id || null, claimableCents: entry?.claimableCents || 0 });
    }
    return { state: persist ? next : copy(state), outcome, reason, commission: entry ? copy(entry) : null };
  };
  const existing = next.commissions.find(c => c.customerId === event.customerId);
  if (event.kind === 'payment_failed' || event.kind === 'subscription_canceled') {
    return finish('ignored_non_payment', 'no_new_commission');
  }
  if (event.kind === 'payment_confirmed') {
    if (event.cycleIndex !== 1) {
      if (!existing && account.paymentHistoryVerified === true && account.firstPaidInvoiceId === event.invoiceId &&
        account.firstPaidAt === event.paidAt) {
        // Primeiro ciclo pode ter falhado. Primeira mensalidade paga x primeira
        // fatura ainda exige decisao comercial; nao atribuir nem rejeitar de vez.
        return finish('needs_review', 'first_payment_on_later_cycle_requires_policy', null, false);
      }
      return finish('ignored_non_first_cycle', 'first_month_only');
    }
    if (next.holds.some(hold => hold.customerId === event.customerId)) {
      return finish('needs_review', 'prior_adjustment_requires_reconciliation', null, false);
    }
    if (existing) {
      const sameCycle = existing.provider === event.provider && existing.merchantAccountId === event.merchantAccountId &&
        existing.subscriptionId === event.subscriptionId && existing.invoiceId === event.invoiceId;
      if (!sameCycle) return finish('ignored_customer_already_rewarded', 'one_acquisition_per_customer');
      if (event.amountCents !== existing.paidCents || event.paidAt !== existing.paidAt) return finish('needs_review', 'cycle_payment_conflict', null, false);
      if (!existing.chargeIds.includes(event.chargeId)) existing.chargeIds.push(event.chargeId);
      return finish('duplicate_cycle', 'same_cycle_new_event_or_charge', existing);
    }
    if (!attribution || attribution.source === 'link') return finish('ignored_no_coupon', 'link_is_provisional');
    const quote = quoteFirstMonth(policy, attribution);
    requireCondition(instant(quote.policySnapshot.approval.approvedAt, 'approval_timestamp') <= now, 'future_approval');
    const trialStart = instant(account.trialStartedAt, 'server_trial_start');
    const trialEnd = instant(account.trialEndsAt, 'server_trial_end');
    requireCondition(trialEnd === trialStart + TRIAL_DAYS * DAY_MS && trialStart <= now, 'invalid_server_trial');
    const paid = instant(event.paidAt, 'payment_timestamp');
    requireCondition(paid <= instant(event.occurredAt, 'event_timestamp'), 'future_payment');
    if (now < trialEnd || paid < trialEnd) return finish('needs_review', 'payment_before_trial_end', null, false);
    if (account.paymentHistoryVerified !== true || !account.firstPaidInvoiceId || !account.firstPaidAt) {
      return finish('deferred', 'first_payment_history_required', null, false);
    }
    if (account.firstPaidInvoiceId !== event.invoiceId || account.firstPaidAt !== event.paidAt) {
      return finish('needs_review', 'not_verified_first_payment', null, false);
    }
    requireCondition(instant(attribution.assignedAt, 'attribution_timestamp') <= paid, 'attribution_after_payment');
    requireCondition(instant(quote.policySnapshot.approval.approvedAt, 'approval_timestamp') <= paid, 'approval_after_payment');
    requireCondition(event.amountCents > 0 && event.amountCents === quote.payableCents, 'payment_price_mismatch');
    if (quote.commissionCents === 0) return finish('ignored_zero_commission', 'zero_reward_policy');
    const entry = {
      id: JSON.stringify([event.customerId, 'first_paid_month']), customerId: event.customerId,
      provider: event.provider, merchantAccountId: event.merchantAccountId, subscriptionId: event.subscriptionId,
      invoiceId: event.invoiceId, cycleIndex: 1, chargeIds: [event.chargeId], paidAt: event.paidAt,
      paidCents: event.amountCents, originalCommissionCents: quote.commissionCents,
      claimableCents: quote.commissionCents, refundedCents: 0, status: 'pending_review',
      dispute: 'none', disputeAt: null, attribution: copy(attribution), policySnapshot: copy(quote.policySnapshot),
      trialEndsAt: account.trialEndsAt, recordedAt: serverNow
    };
    next.commissions.push(entry);
    return finish('commission_recorded', 'verified_first_payment_after_trial', entry);
  }
  if (!existing) {
    if (event.cycleIndex !== 1) return finish('ignored_other_cycle', 'adjustment_not_for_rewarded_cycle');
    if (event.kind === 'refund_confirmed') integer(event.refundedCents, 'cumulative_refund', event.amountCents);
    next.holds.push({ eventKey, customerId: event.customerId, provider: event.provider,
      merchantAccountId: event.merchantAccountId, subscriptionId: event.subscriptionId,
      invoiceId: event.invoiceId, chargeId: event.chargeId, kind: event.kind,
      occurredAt: event.occurredAt, amountCents: event.amountCents,
      refundedCents: event.kind === 'refund_confirmed' ? event.refundedCents : null });
    return finish('needs_review', 'adjustment_before_commission');
  }
  if (existing.provider !== event.provider || existing.merchantAccountId !== event.merchantAccountId ||
      existing.subscriptionId !== event.subscriptionId || existing.invoiceId !== event.invoiceId || event.cycleIndex !== 1) {
    return finish('ignored_other_cycle', 'adjustment_not_for_rewarded_cycle');
  }
  requireCondition(event.amountCents === existing.paidCents, 'adjustment_payment_amount_mismatch');
  if (!existing.chargeIds.includes(event.chargeId)) return finish('needs_review', 'unreconciled_charge', null, false);
  if (instant(event.occurredAt, 'event_timestamp') < instant(existing.paidAt, 'payment_timestamp')) {
    return finish('needs_review', 'adjustment_predates_payment', null, false);
  }
  const previousClaimable = existing.claimableCents;
  if (event.kind === 'refund_confirmed') {
    integer(event.refundedCents, 'cumulative_refund', existing.paidCents);
    if (event.refundedCents <= existing.refundedCents) return finish('ignored_stale_adjustment', 'refund_cannot_decrease', existing);
    existing.refundedCents = event.refundedCents;
  } else {
    if (existing.disputeAt && instant(event.occurredAt, 'event_timestamp') < instant(existing.disputeAt, 'dispute_timestamp')) {
      return finish('ignored_stale_adjustment', 'older_dispute_event', existing);
    }
    if (existing.dispute === 'lost' && event.kind !== 'dispute_lost') return finish('needs_review', 'lost_dispute_requires_manual_review', null, false);
    if (existing.dispute === 'won' && event.kind === 'dispute_opened') return finish('needs_review', 'resolved_dispute_cannot_reopen_without_review', null, false);
    if (event.kind === 'dispute_won' && existing.dispute !== 'open') return finish('needs_review', 'no_open_dispute', null, false);
    existing.dispute = { dispute_opened: 'open', dispute_won: 'won', dispute_lost: 'lost' }[event.kind];
    existing.disputeAt = event.occurredAt;
  }
  const remaining = roundRatio(existing.originalCommissionCents, existing.paidCents - existing.refundedCents, existing.paidCents);
  existing.status = existing.refundedCents === existing.paidCents || existing.dispute === 'lost' ? 'reverted' :
    existing.dispute === 'open' ? 'suspended' : 'pending_review';
  existing.claimableCents = existing.status === 'pending_review' ? remaining : 0;
  const result = finish('commission_adjusted', event.kind, existing);
  result.adjustmentCents = existing.claimableCents - previousClaimable;
  result.state.audit.at(-1).adjustmentCents = result.adjustmentCents;
  // Mesmo um ajuste positivo continua pendente de revisao; nunca gera repasse.
  return result;
}
