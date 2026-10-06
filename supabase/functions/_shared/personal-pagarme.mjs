/** Preparação da assinatura SaaS, separada das cobranças dos alunos.
 * Não é endpoint: não inicia pagamentos, não grava acesso e não habilita campanha.
 * account/policy/attribution vêm de registros protegidos; nunca do corpo HTTP.
 * Homologar os contratos na conta Pagar.me antes de ligar checkout/persistência.
 */
import { BASE_PRICE_CENTS, TRIAL_DAYS, quoteFirstMonth } from './personal-sales.mjs';

const DAY = 86400000;
const ID = /^[A-Za-z0-9_-]{3,100}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const requireThat = (condition, error) => { if (!condition) throw new TypeError(error); };
function time(value, label) {
  const ms = typeof value === 'string' ? Date.parse(value) : NaN;
  requireThat(Number.isFinite(ms) && /(?:Z|[+-]\d\d:\d\d)$/.test(value), label);
  return ms;
}
const iso = ms => new Date(ms).toISOString();

/** O cadastro canônico, e não a visita/checkout, inicia os 14 dias.
 * Pagar.me documenta início de ciclo às 00h. A proposta arredonda PARA CIMA
 * (UTC) para nunca cobrar antes do prazo; a data efetiva exige homologação.
 * Não prolonga o trial nem concede acesso durante eventual intervalo.
 */
export function billingSchedule(createdAt, serverNow) {
  const created = time(createdAt, 'invalid_account_creation');
  const now = time(serverNow, 'invalid_server_clock');
  requireThat(created <= now, 'account_creation_in_future');
  const end = created + TRIAL_DAYS * DAY;
  const trialActive = now < end;
  return Object.freeze({ trialStartedAt: iso(created), trialEndsAt: iso(end), trialActive,
    firstChargeNotBefore: iso(Math.max(now, end)),
    providerStartDate: trialActive ? iso(Math.ceil(end / DAY) * DAY).slice(0, 10) : null,
    requiresDateHomologation: trialActive });
}

/** Requisição de assinatura de plano. O plano é lido do Pagar.me pelo servidor,
 * o token de cartão vem da tokenização direta no provedor, nunca PAN/CVV.
 * O caller deve reservar attemptId com exclusão mútua no banco ANTES do POST.
 * Em timeout, reconciliar a tentativa; não criar uma nova por conta própria.
 */
export function preparePagarmeSubscription({ account, plan, cardToken, attemptId,
  serverNow, policy = null, attribution = null }) {
  requireThat(account?.provider === 'pagarme' && UUID.test(account.academiaId), 'invalid_server_account');
  requireThat(/^cus_[A-Za-z0-9]+$/.test(account.customerId), 'invalid_bound_customer');
  requireThat(UUID.test(attemptId), 'invalid_reserved_attempt');
  requireThat(/^token_[A-Za-z0-9]+$/.test(cardToken), 'invalid_card_token');
  requireThat(/^plan_[A-Za-z0-9]+$/.test(plan?.id) && plan.currency === 'BRL' &&
    plan.interval === 'month' && plan.interval_count === 1 && plan.billing_type === 'prepaid' &&
    (plan.trial_period_days == null || plan.trial_period_days === 0) &&
    Array.isArray(plan.payment_methods) && plan.payment_methods.includes('credit_card') &&
    Array.isArray(plan.items) && plan.items.length === 1 && plan.items[0].quantity === 1 &&
    plan.items[0].pricing_scheme?.price === BASE_PRICE_CENTS &&
    (plan.items[0].pricing_scheme.scheme_type == null || plan.items[0].pricing_scheme.scheme_type === 'unit'),
    'provider_plan_differs_from_offer');
  const schedule = billingSchedule(account.createdAt, serverNow);
  const quote = quoteFirstMonth(policy, attribution);
  const body = { code: 'tp_' + attemptId, plan_id: plan.id, customer_id: account.customerId,
    payment_method: 'credit_card', card_token: cardToken, installments: 1,
    metadata: { product: 'torque_personal_saas', academia_id: account.academiaId,
      attempt_id: attemptId, trial_ends_at: schedule.trialEndsAt } };
  if (schedule.providerStartDate) body.start_at = schedule.providerStartDate;
  if (quote.discountCents) body.discounts = [{ discount_type: 'flat', value: quote.discountCents, cycles: 1 }];
  return { body, schedule, quote, attemptId };
}

/** Aceita somente resultado consultado na API, vinculado ao registro protegido.
 * Não aceitar payload de webhook/URL aqui. `active` não comprova pagamento.
 * Reembolso, disputa, status desconhecido ou dados incompletos pedem revisão.
 * Não substitui ledger transacional: classifica um snapshot de fatura.
 */
export function inspectPagarmeInvoice({ account, subscription, invoice, charges, serverNow }) {
  const now = time(serverNow, 'invalid_server_clock');
  const schedule = billingSchedule(account.createdAt, serverNow);
  requireThat(account.provider === 'pagarme' && UUID.test(account.academiaId) &&
    ID.test(account.subscriptionId) && ID.test(account.customerId), 'invalid_server_binding');
  requireThat(subscription?.id === account.subscriptionId && subscription.customer?.id === account.customerId &&
    subscription.metadata?.product === 'torque_personal_saas' &&
    subscription.metadata?.academia_id === account.academiaId &&
    invoice?.subscription?.id === account.subscriptionId && invoice.customer?.id === account.customerId &&
    /^in_[A-Za-z0-9]+$/.test(invoice.id), 'provider_binding_mismatch');
  requireThat(invoice.payment_method === 'credit_card' && Number.isSafeInteger(invoice.amount) && invoice.amount > 0,
    'invalid_invoice');
  const review = reason => ({ status: 'needs_review', reason, paidThrough: null });
  if (!['active', 'canceled', 'future'].includes(subscription.status)) return review('unknown_subscription_status');
  if (!['pending', 'paid', 'canceled', 'scheduled', 'failed'].includes(invoice.status)) return review('unknown_invoice_status');
  if (!Array.isArray(charges) || charges.length !== 1) return review('charge_reconciliation_required');
  const charge = charges[0];
  if (!/^ch_[A-Za-z0-9]+$/.test(charge.id) || charge.invoice?.id !== invoice.id || charge.customer?.id !== account.customerId ||
      charge.currency !== 'BRL' || charge.payment_method !== 'credit_card') return review('charge_binding_mismatch');
  if (charge.status === 'chargedback' || charge.status === 'refunded' ||
      (charge.refunded_amount != null && charge.refunded_amount !== 0) ||
      ['refunded', 'partial_refunded', 'partial_void', 'voided', 'waiting_cancellation', 'error_on_refunding'].includes(charge.last_transaction?.status))
    return review('refund_or_dispute');
  if (invoice.status !== 'paid' || charge.status !== 'paid') return { status: 'unpaid', paidThrough: null };
  if (charge.amount !== invoice.amount || charge.paid_amount !== invoice.amount || invoice.amount !== account.expectedInvoiceCents)
    return review('payment_amount_mismatch');
  const paid = time(charge.paid_at, 'invalid_paid_at');
  if (paid < time(schedule.trialEndsAt, 'invalid_trial') || paid > now) return review('payment_outside_allowed_time');
  const from = time(invoice.period?.start_at, 'invalid_period_start');
  const until = time(invoice.period?.end_at, 'invalid_period_end');
  if (until <= from || until - from > 32 * DAY || from > now || paid < from || from < time(schedule.trialEndsAt, 'invalid_trial'))
    return review('invalid_paid_period');
  return { status: until > now ? 'paid' : 'expired', invoiceId: invoice.id, chargeId: charge.id,
    paidAt: iso(paid), paidThrough: iso(until), renewalCanceled: subscription.status === 'canceled' };
}
