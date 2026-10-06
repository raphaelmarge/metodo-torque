/** SaaS billing boundary. No provider or database call occurs at import time.
 * Financial configuration is isolated from the legacy student gateway.
 * fetch injection is for contract tests; deployment always uses native fetch.
 */
import { preparePagarmeSubscription, inspectPagarmeInvoice } from './personal-pagarme.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const API = 'https://api.pagar.me/core/v5';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info',
  'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const messages = { auth_required: 'Entre novamente na sua conta.', owner_required: 'Somente o dono atual pode gerenciar esta assinatura.',
  personal_account_required: 'Esta contratação exige uma conta TORQUE PERSONAL confirmada. Procure o suporte.',
  invalid_input: 'Confira os dados informados.', billing_disabled: 'A contratação ainda não está disponível.',
  checkout_not_started: 'Não foi possível iniciar a contratação. Nenhuma nova tentativa foi enviada. Tente novamente.',
  billing_unconfigured: 'A cobrança ainda não está configurada.', attempt_conflict: 'Existe outra tentativa em andamento.',
  subscription_exists: 'Esta conta já tem uma assinatura vinculada.', benefit_or_subscription_exists: 'Esta conta já possui acesso administrado. Procure o suporte.',
  provider_unavailable: 'Não foi possível confirmar a operação. Consulte novamente antes de tentar outra contratação.',
  service_unavailable: 'Não foi possível consultar a cobrança agora.', billing_not_started: 'Não há assinatura vinculada para cancelar.' };
class BillingError extends Error {
  constructor(code, status = 503) { super(code); this.code = code; this.status = status; }
}
const fail = (code, status) => { throw new BillingError(code, status); };
const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: CORS });
const errorResponse = e => response({ ok: false, error: e.code || 'service_unavailable',
  message: messages[e.code] || messages.service_unavailable,
  ...(e.attemptNotStarted ? { attemptNotStarted: true, retryable: true } : {}) }, e.status || 503);
function notStarted(error) {
  const e = new BillingError('checkout_not_started', error?.status || 503); e.attemptNotStarted = true; return e;
}
const ownKeys = (v, allowed) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).every(k => allowed.includes(k));
const hash = async text => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))))
  .map(x => x.toString(16).padStart(2, '0')).join('');
async function equalSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || b.length < 32) return false;
  const x = await hash(a), y = await hash(b); let v = 0;
  for (let i = 0; i < x.length; i++) v |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return v === 0;
}
async function readBody(req) {
  if (Number(req.headers.get('content-length')) > 20000) fail('invalid_input', 413);
  const raw = await req.text(); if (raw.length > 20000) fail('invalid_input', 413);
  let body; try { body = JSON.parse(raw); } catch { fail('invalid_input', 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('invalid_input', 400);
  return { body, raw };
}
function customerInput(c) {
  if (!ownKeys(c, ['name','email','document','phone','address']) || typeof c.name !== 'string' ||
    !c.name.trim() || c.name.length > 64 || typeof c.email !== 'string' || c.email.length > 64 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) fail('invalid_input', 422);
  const a = c.address;
  if (!ownKeys(a, ['line_1','line_2','zip_code','city','state','country']) || a.country !== 'BR' ||
    !/^[A-Z]{2}$/.test(a.state) || !/^\d{8}$/.test(a.zip_code) ||
    ![a.line_1,a.city].every(x => typeof x === 'string' && x.trim() && x.length <= 200) ||
    (a.line_2 != null && (typeof a.line_2 !== 'string' || a.line_2.length > 200))) fail('invalid_input', 422);
  const result = { name: c.name.trim(), email: c.email.trim(), address: { ...a } };
  if (c.document) {
    if (!/^\d{11}$|^\d{14}$/.test(c.document)) fail('invalid_input', 422);
    result.document = c.document; result.type = c.document.length === 11 ? 'individual' : 'company';
    result.document_type = c.document.length === 11 ? 'CPF' : 'CNPJ';
  }
  if (c.phone) {
    if (!ownKeys(c.phone, ['country_code','area_code','number']) || c.phone.country_code !== '55' ||
      !/^\d{2}$/.test(c.phone.area_code) || !/^\d{8,9}$/.test(c.phone.number)) fail('invalid_input', 422);
    result.phones = { mobile_phone: { ...c.phone } };
  }
  return result;
}

export function createPersonalBillingRuntime({ env = {}, fetch: fetcher = globalThis.fetch,
  now = () => new Date().toISOString(), uuid = () => crypto.randomUUID() } = {}) {
  const get = key => typeof env.get === 'function' ? env.get(key) || '' : env[key] || '';
  const environment = get('PERSONAL_BILLING_ENVIRONMENT');
  const merchantId = get('PERSONAL_BILLING_MERCHANT_ID');
  const secret = get('PERSONAL_BILLING_SECRET_KEY'), publicKey = get('PERSONAL_BILLING_PUBLIC_KEY');
  const planId = get('PERSONAL_BILLING_PLAN_ID');
  const keyMatches = (value, prefix) => environment === 'test' ? new RegExp('^' + prefix + '_test_[A-Za-z0-9]+$').test(value) :
    new RegExp('^' + prefix + '_(?!test_)[A-Za-z0-9_]+$').test(value);
  const configured = ['test','live'].includes(environment) && /^acc_[A-Za-z0-9]+$/.test(merchantId) &&
    keyMatches(secret, 'sk') && /^plan_[A-Za-z0-9]+$/.test(planId);
  const enabled = configured && get('PERSONAL_BILLING_NEW_SUBSCRIPTIONS_ENABLED') === 'true' &&
    get('PERSONAL_BILLING_HOMOLOGATED') === 'true' && keyMatches(publicKey, 'pk');
  const scope = { environment, merchantId };
  const config = () => ({ enabled, configured, managementEnabled: configured, environment: environment || 'test',
    priceCents: 4990, trialDays: 14, graceDays: 3, publicKey: enabled ? publicKey : null,
    tokenizeUrl: enabled ? API + '/tokens' : null });
  async function request(url, init = {}) {
    try { return await fetcher(url, { ...init, signal: AbortSignal.timeout(10000) }); }
    catch { fail('provider_unavailable', 503); }
  }
  async function rpc(action, data = {}) {
    const url = get('SUPABASE_URL'), key = get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) fail('service_unavailable', 503);
    const r = await request(url + '/rest/v1/rpc/personal_billing_service', { method: 'POST',
      headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_action: action, p_data: { ...scope, ...data } }) });
    let d; try { d = await r.json(); } catch { fail('service_unavailable', 503); }
    if (!r.ok) {
      const code = d?.message;
      if (['auth_required','owner_required','personal_account_required'].includes(code)) fail(code, code === 'auth_required' ? 401 : 403);
      if (['attempt_conflict','subscription_exists','benefit_or_subscription_exists','billing_not_started'].includes(code)) fail(code, 409);
      fail('service_unavailable', 503);
    }
    return d;
  }
  async function actor(req) {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token || token === get('SUPABASE_ANON_KEY') || token === get('SUPABASE_SERVICE_ROLE_KEY')) fail('auth_required', 401);
    const r = await request(get('SUPABASE_URL') + '/auth/v1/user', {
      headers: { apikey: get('SUPABASE_SERVICE_ROLE_KEY'), Authorization: 'Bearer ' + token } });
    if (!r.ok) fail('auth_required', 401);
    const user = await r.json(); let claims;
    // Claims are read ONLY after Auth has validated this exact JWT.
    try { claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); }
    catch { fail('auth_required', 401); }
    if (!UUID.test(user?.id) || user.is_anonymous || claims.sub !== user.id || claims.role !== 'authenticated' ||
      !UUID.test(claims.session_id) || !(claims.exp * 1000 > Date.parse(now()))) fail('auth_required', 401);
    return { userId: user.id, sessionId: claims.session_id };
  }
  async function provider(path, method = 'GET', body) {
    if (!configured) fail('billing_unconfigured', 503);
    const r = await request(API + path, { method, headers: { Authorization: 'Basic ' + btoa(secret + ':'),
      'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    let d; try { d = await r.json(); } catch { fail('provider_unavailable', 503); }
    if (!r.ok) { const e = new BillingError('provider_unavailable', 503); e.providerStatus = r.status; throw e; }
    return d;
  }
  async function list(path) {
    const rows = [];
    for (let page = 1; page <= 12; page++) {
      const d = await provider(path + (path.includes('?') ? '&' : '?') + 'size=100&page=' + page);
      if (!Array.isArray(d?.data)) fail('provider_unavailable', 503);
      rows.push(...d.data);
      if (d.data.length < 100) return rows;
    }
    fail('provider_unavailable', 503); // A truncated scan cannot grant access.
  }
  function assertSubscription(s, account, attempt) {
    if (!/^sub_[A-Za-z0-9]+$/.test(s?.id) || s.customer?.id !== account.customer_id ||
      s.metadata?.product !== 'torque_personal_saas' || s.metadata?.academia_id !== account.academia_id ||
      s.metadata?.attempt_id !== attempt.id || s.code !== 'tp_' + attempt.id ||
      (account.subscription_id && s.id !== account.subscription_id)) fail('provider_unavailable', 503);
  }
  async function sync(academiaId, { actor: owner, eventId, force = false } = {}) {
    if (!configured) return false;
    const leaseId = uuid(), args = { academiaId, leaseId };
    const c = await rpc('lease', args); if (c.busy) return false;
    let account = c.account, attempt = c.attempt;
    try {
      if (account.deleted_at) {
        let deletedSubscription;
        if (account.subscription_id) deletedSubscription = await provider('/subscriptions/' + account.subscription_id);
        else if (attempt && (['submitting','confirmed'].includes(attempt.phase) ||
          (attempt.phase === 'unknown' && attempt.failure_code !== 'customer_uncertain'))) {
          const matches = (await list('/subscriptions?code=' + encodeURIComponent('tp_' + attempt.id) + '&customer_id=' + account.customer_id))
            .filter(s => s.code === 'tp_' + attempt.id);
          if (matches.length !== 1) { await rpc('release', args); return false; }
          deletedSubscription = await provider('/subscriptions/' + matches[0].id);
        }
        if (deletedSubscription) {
          assertSubscription(deletedSubscription, account, attempt);
          if (deletedSubscription.status !== 'canceled') {
            const canceled = await provider('/subscriptions/' + deletedSubscription.id, 'DELETE', { cancel_pending_invoices: true });
            if (canceled?.id !== deletedSubscription.id || canceled.status !== 'canceled') fail('provider_unavailable', 503);
          }
        }
        await rpc('deleted_complete', { ...args, subscriptionId: deletedSubscription?.id || null,
          subscriptionStatus: deletedSubscription ? 'canceled' : null, ...(eventId ? { eventId } : {}) });
        return true;
      }
      if (!attempt) { await rpc('release', args); return false; }
      if (!account.customer_id) {
        const customers = (await list('/customers?code=' + encodeURIComponent('tpc_' + academiaId)))
          .filter(x => x.code === 'tpc_' + academiaId && x.metadata?.product === 'torque_personal_saas' && x.metadata?.academia_id === academiaId);
        if (customers.length > 1) { await rpc('review', args); return false; }
        if (!customers.length) { await rpc('release', args); return false; }
        await rpc('recover_customer', { ...args, customerId: customers[0].id });
        account.customer_id = customers[0].id;
      }
      if (!account.subscription_id && (['customer_pending','customer_bound'].includes(attempt.phase) || attempt.failure_code === 'customer_uncertain')) {
        // No subscription POST was reserved. The lost card token cannot be reused.
        await rpc('attempt_failed', { ...args, definitive: true, reason: 'card_required' }); return false;
      }
      let subscription;
      if (account.subscription_id) subscription = await provider('/subscriptions/' + account.subscription_id);
      else {
        const subscriptions = await list('/subscriptions?code=' + encodeURIComponent('tp_' + attempt.id) + '&customer_id=' + account.customer_id);
        const matches = subscriptions.filter(s => s.code === 'tp_' + attempt.id);
        if (matches.length > 1) { await rpc('review', args); return false; }
        if (!matches.length) { await rpc('release', args); return false; } // Never repeat an ambiguous POST.
        subscription = await provider('/subscriptions/' + matches[0].id);
        assertSubscription(subscription, account, attempt);
        await rpc('bind_subscription', { ...args, subscriptionId: subscription.id });
        account.subscription_id = subscription.id;
      }
      assertSubscription(subscription, account, attempt);
      const invoices = await list('/invoices?subscription_id=' + account.subscription_id + '&customer_id=' + account.customer_id);
      const normalized = [];
      for (const invoice of invoices) {
        // Read each resource, not the potentially stale listing or event payload.
        if (!/^in_[A-Za-z0-9]+$/.test(invoice?.id)) fail('provider_unavailable', 503);
        const full = await provider('/invoices/' + invoice.id);
        const embedded = full.charges || (full.charge ? [full.charge] : []), charges = [];
        for (const ch of embedded) {
          if (!/^ch_[A-Za-z0-9]+$/.test(ch?.id)) fail('provider_unavailable', 503);
          charges.push(await provider('/charges/' + ch.id));
        }
        const inspected = inspectPagarmeInvoice({ account: { provider: 'pagarme', academiaId,
          customerId: account.customer_id, subscriptionId: account.subscription_id, createdAt: c.createdAt,
          expectedInvoiceCents: 4990 }, subscription, invoice: full, charges, serverNow: now() });
        normalized.push({ id: full.id, chargeId: charges.length === 1 ? charges[0].id : null, amount: full.amount,
          status: inspected.reason === 'refund_or_dispute' ? 'revoked' :
            full.status !== 'paid' && charges.length === 0 ? 'unpaid' : inspected.status === 'needs_review' ? 'needs_review' :
            ['paid','expired'].includes(inspected.status) ? 'paid' : 'unpaid', reason: full.status === 'failed' ? 'payment_failed' : inspected.reason || null,
          periodStart: full.period?.start_at || null, periodEnd: full.period?.end_at || null, paidAt: inspected.paidAt || null });
      }
      await rpc('commit', { ...args, subscriptionId: subscription.id, subscriptionStatus: subscription.status,
        invoices: normalized, ...(eventId ? { eventId } : {}) });
      return true;
    } catch (e) {
      await rpc('release', args).catch(() => {}); throw e;
    }
  }
  async function checkout(body, owner) {
    if (!enabled) fail('billing_disabled', 503);
    if (!UUID.test(body.attemptId) || !/^token_[A-Za-z0-9]+$/.test(body.cardToken)) fail('invalid_input', 422);
    const customer = customerInput(body.customer);
    const leaseId = uuid(), args = { academiaId: body.academiaId, actor: owner, leaseId };
    // Validate provider offer before reserving or writing customer/card/charge.
    let plan;
    try {
      plan = await provider('/plans/' + planId);
      const context = await rpc('authorize', args);
      preparePagarmeSubscription({ account: { provider: 'pagarme', academiaId: body.academiaId,
        customerId: 'cus_validation', createdAt: context.createdAt }, plan, cardToken: body.cardToken,
        attemptId: body.attemptId, serverNow: now() });
    } catch (e) { throw notStarted(e); }
    // From this call onward, a lost RPC response may conceal a committed
    // reservation. Never label it checkout_not_started.
    const reservation = await rpc('reserve', { ...args, attemptId: body.attemptId });
    if (!reservation.dispatch) return reservation.status;
    let stage = 'customer', customerId = reservation.customerId;
    try {
      if (!customerId) {
        await rpc('authorize', args);
        const created = await provider('/customers', 'POST', { ...customer, code: 'tpc_' + body.academiaId,
          metadata: { product: 'torque_personal_saas', academia_id: body.academiaId } });
        if (!/^cus_[A-Za-z0-9]+$/.test(created?.id) || created.code !== 'tpc_' + body.academiaId ||
          created.metadata?.academia_id !== body.academiaId || created.metadata?.product !== 'torque_personal_saas') fail('provider_unavailable', 503);
        customerId = created.id;
        await rpc('bind_customer', { ...args, customerId });
      }
      stage = 'card'; await rpc('authorize', args);
      const card = await provider('/customers/' + customerId + '/cards', 'POST', { token: body.cardToken, billing_address: customer.address });
      if (!/^card_[A-Za-z0-9]+$/.test(card?.id)) fail('provider_unavailable', 503);
      const prepared = preparePagarmeSubscription({ account: { provider: 'pagarme', academiaId: body.academiaId,
        customerId, createdAt: reservation.createdAt }, plan, cardToken: body.cardToken, attemptId: body.attemptId, serverNow: now() });
      delete prepared.body.card_token; prepared.body.card_id = card.id;
      await rpc('mark_submitting', args); stage = 'subscription';
      const sub = await provider('/subscriptions', 'POST', prepared.body);
      assertSubscription(sub, { academia_id: body.academiaId, customer_id: customerId }, { id: body.attemptId });
      await rpc('bind_subscription', { ...args, subscriptionId: sub.id });
      await rpc('release', args);
      await sync(body.academiaId, { actor: owner });
    } catch (e) {
      // Before the subscription POST, retry can never double-charge. An ambiguous
      // customer POST must first recover its binding. 5xx/timeout after POST stay unknown.
      const definitive = stage === 'card' || [400,402,422].includes(e.providerStatus);
      await rpc('attempt_failed', { ...args, definitive,
        reason: stage === 'customer' ? 'customer_uncertain' : stage === 'card' ? 'card_failed' : 'subscription_uncertain' }).catch(() => {});
      if (definitive) fail('provider_unavailable', 422);
    }
    return (await rpc('status', { ...args })).status;
  }
  async function cancel(academiaId, owner) {
    if (!configured) fail('billing_unconfigured', 503);
    const args = { academiaId, actor: owner, leaseId: uuid() };
    const c = await rpc('cancel_request', args), a = c.account;
    try {
      const current = await provider('/subscriptions/' + a.subscription_id);
      assertSubscription(current, a, c.attempt);
      await rpc('authorize', args); // Membership/session can change while provider GET runs.
      if (current.status !== 'canceled') {
        const result = await provider('/subscriptions/' + a.subscription_id, 'DELETE', { cancel_pending_invoices: true });
        if (result?.id !== a.subscription_id || result.status !== 'canceled') fail('provider_unavailable', 503);
      }
      await rpc('release', args);
      await sync(academiaId, { actor: owner });
    } catch { await rpc('release', args).catch(() => {}); }
    return (await rpc('status', { academiaId, actor: owner })).status;
  }
  return { get, scope, config, rpc, actor, provider, sync, checkout, cancel, assertSubscription, uuid };
}

export function createPersonalBillingHandler(deps) {
  const rt = createPersonalBillingRuntime(deps);
  return async req => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return response({ ok: false, error: 'method_not_allowed' }, 405);
    try {
      const owner = await rt.actor(req), { body } = await readBody(req);
      if (!ownKeys(body, ['action','academiaId','attemptId','cardToken','customer']) ||
        !['config','accounts','status','checkout','cancel'].includes(body.action)) fail('invalid_input', 422);
      if (body.action === 'config' || body.action === 'accounts') {
        const accounts = await rt.rpc('accounts', { actor: owner });
        return response({ ok: true, ...(body.action === 'config' ? rt.config() : accounts) });
      }
      if (!UUID.test(body.academiaId)) fail('invalid_input', 422);
      let context;
      try { context = await rt.rpc('authorize', { academiaId: body.academiaId, actor: owner }); }
      catch(e) { if (body.action === 'checkout') throw notStarted(e); throw e; }
      let status;
      if (body.action === 'checkout') status = await rt.checkout(body, owner);
      else if (body.action === 'cancel') status = await rt.cancel(body.academiaId, owner);
      else {
        if (context.account?.academia_id && rt.config().configured &&
          (!context.account.attempted_at || Date.parse(context.account.attempted_at) < Date.parse(deps?.now?.() || new Date().toISOString()) - 30000)) {
          await rt.sync(body.academiaId, { actor: owner }).catch(() => {});
        }
        status = (await rt.rpc('status', { academiaId: body.academiaId, actor: owner })).status;
      }
      return response({ ok: true, enabled: rt.config().enabled, ...status }, ['pending','cancel_pending'].includes(status.state) ? 202 : 200);
    } catch (e) { return errorResponse(e); }
  };
}

export function createPersonalBillingWebhookHandler(deps) {
  const rt = createPersonalBillingRuntime(deps);
  return async req => {
    if (req.method !== 'POST') return response({ ok: false, error: 'method_not_allowed' }, 405);
    try {
      // Explicit shared-secret transport, never an invented API-v3 signature.
      // Dashboard authentication/header configuration must be homologated before enabling delivery.
      let supplied = req.headers.get('x-personal-billing-secret') || '';
      if (rt.get('PERSONAL_BILLING_WEBHOOK_AUTH') === 'basic') {
        if (!rt.get('PERSONAL_BILLING_WEBHOOK_USER')) fail('auth_required', 401);
        const authorization = req.headers.get('authorization') || ''; supplied = '';
        try { const pair = atob(authorization.replace(/^Basic\s+/i,''));
          if (/^Basic\s/i.test(authorization) && pair.slice(0,pair.indexOf(':')) === rt.get('PERSONAL_BILLING_WEBHOOK_USER')) supplied = pair.slice(pair.indexOf(':')+1);
        } catch { /* fail closed */ }
      }
      if (!await equalSecret(supplied, rt.get('PERSONAL_BILLING_WEBHOOK_SECRET'))) fail('auth_required', 401);
      if (!rt.config().configured) fail('billing_unconfigured', 503);
      const { body, raw } = await readBody(req);
      if (!/^hook_[A-Za-z0-9]+$/.test(body.id) || body.account?.id !== rt.scope.merchantId ||
        !/^(subscription|invoice|charge)\.[a-z_]+$/.test(body.type)) fail('invalid_input', 422);
      const kind = body.type.split('.')[0], id = body.data?.id;
      if (!new RegExp('^' + ({ subscription: 'sub', invoice: 'in', charge: 'ch' }[kind]) + '_[A-Za-z0-9]+$').test(id)) fail('invalid_input', 422);
      const receipt = await rt.rpc('event', { eventId: body.id, fingerprint: await hash(raw), resourceKind: kind, resourceId: id });
      if (receipt.state === 'done') return response({ ok: true, duplicate: true });
      let resource = await rt.provider('/' + ({ subscription: 'subscriptions', invoice: 'invoices', charge: 'charges' }[kind]) + '/' + id);
      if (resource.id !== id) fail('invalid_input', 422);
      if (kind === 'charge') {
        if (!/^in_[A-Za-z0-9]+$/.test(resource.invoice?.id)) fail('invalid_input', 422);
        resource = await rt.provider('/invoices/' + resource.invoice.id);
      }
      if (kind !== 'subscription') {
        if (!/^sub_[A-Za-z0-9]+$/.test(resource.subscription?.id)) fail('invalid_input', 422);
        resource = await rt.provider('/subscriptions/' + resource.subscription.id);
      }
      const academiaId = resource.metadata?.academia_id;
      if (!UUID.test(academiaId) || resource.metadata?.product !== 'torque_personal_saas') fail('invalid_input', 422);
      // Binding may still be pending after a lost create response; sync can
      // recover it by the reserved code. A bound event is completed by the next
      // full snapshot even if this delivery loses the reconciliation lease.
      await rt.rpc('event_link', { academiaId, subscriptionId: resource.id, eventId: body.id }).catch(() => {});
      await rt.sync(academiaId, { eventId: body.id, force: true });
      return response({ ok: true, received: true });
    } catch (e) { return errorResponse(e); }
  };
}

export function createPersonalBillingReconcileHandler(deps) {
  const rt = createPersonalBillingRuntime(deps);
  return async req => {
    if (req.method !== 'POST') return response({ ok: false, error: 'method_not_allowed' }, 405);
    try {
      if (!await equalSecret((req.headers.get('authorization') || '').replace(/^Bearer\s+/i,''), rt.get('PERSONAL_BILLING_RECONCILE_SECRET'))) fail('auth_required', 401);
      if (!rt.config().configured) fail('billing_unconfigured', 503);
      const due = await rt.rpc('due'); let checked = 0, pending = 0;
      for (const row of due.accounts) { try { if(await rt.sync(row.academiaId))checked++;else pending++; } catch { pending++; } }
      return response({ ok: true, checked, pending });
    } catch (e) { return errorResponse(e); }
  };
}
