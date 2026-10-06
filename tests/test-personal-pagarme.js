// Contratos financeiros com fixtures fictícias. Nenhuma chamada de rede.
const assert = require('node:assert/strict');
const { test } = require('node:test');
(async () => {
  const { billingSchedule, preparePagarmeSubscription, inspectPagarmeInvoice } =
    await import('../supabase/functions/_shared/personal-pagarme.mjs');
  const createdAt = '2026-10-01T12:00:00.000Z';
  const account = { provider: 'pagarme', academiaId: '10000000-0000-4000-8000-000000000001',
    createdAt, customerId: 'cus_Fixture', subscriptionId: 'sub_Fixture', expectedInvoiceCents: 4990 };
  const plan = { id: 'plan_Fixture', currency: 'BRL', interval: 'month', interval_count: 1,
    billing_type: 'prepaid', payment_methods: ['credit_card'], trial_period_days: 0,
    items: [{ quantity: 1, pricing_scheme: { scheme_type: 'unit', price: 4990 } }] };
  const request = () => ({ account: structuredClone(account), plan: structuredClone(plan), cardToken: 'token_Fixture',
    attemptId: '10000000-0000-4000-8000-000000000002', serverNow: '2026-10-06T12:00:00.000Z' });
  const snapshot = () => ({ account: structuredClone(account), serverNow: '2026-10-16T12:00:00.000Z',
    subscription: { id: 'sub_Fixture', status: 'active', customer: { id: 'cus_Fixture' },
      metadata: { product: 'torque_personal_saas', academia_id: account.academiaId } },
    invoice: { id: 'in_Fixture', status: 'paid', amount: 4990, payment_method: 'credit_card',
      subscription: { id: 'sub_Fixture' }, customer: { id: 'cus_Fixture' },
      period: { start_at: '2026-10-16T00:00:00.000Z', end_at: '2026-11-16T00:00:00.000Z' } },
    charges: [{ id: 'ch_Fixture', invoice: { id: 'in_Fixture' }, customer: { id: 'cus_Fixture' },
      status: 'paid', currency: 'BRL', payment_method: 'credit_card', amount: 4990,
      paid_amount: 4990, paid_at: '2026-10-16T00:01:00.000Z', last_transaction: { status: 'captured' } }] });

  test('primeira cobrança respeita 14 dias completos e não reinicia o teste ao contratar', () => {
    for (const now of [createdAt, '2026-10-06T15:00:00-03:00', '2026-10-15T11:59:59.999Z']) {
      const s = billingSchedule(createdAt, now);
      assert.equal(s.trialEndsAt, '2026-10-15T12:00:00.000Z');
      assert.equal(s.providerStartDate, '2026-10-16');
      assert(Date.parse(s.providerStartDate + 'T00:00:00Z') >= Date.parse(s.firstChargeNotBefore));
      assert(s.requiresDateHomologation);
    }
    const ended = billingSchedule(createdAt, '2026-10-15T12:00:00.000Z');
    assert.equal(ended.trialActive, false); assert.equal(ended.providerStartDate, null);
    assert.equal(billingSchedule('2026-10-01T00:00:00Z', '2026-10-06T00:00:00Z').providerStartDate, '2026-10-15');
  });
  test('hora do navegador/sem fuso/início futuro não substituem relógio e criação do servidor', () => {
    assert.throws(() => billingSchedule('2026-10-01T12:00:00', '2026-10-06T00:00:00Z'));
    assert.throws(() => billingSchedule(createdAt, '2026-09-01T00:00:00Z'));
    assert.throws(() => billingSchedule(null, 'invalid'));
  });
  test('plano mensal verificado, token e tentativa estável; sem preço nem conta escolhidos no browser', () => {
    const r = request(), result = preparePagarmeSubscription(r);
    assert.equal(result.quote.payableCents, 4990); assert.equal(result.body.start_at, '2026-10-16');
    assert.equal(result.body.metadata.academia_id, account.academiaId);
    assert.equal(result.body.metadata.product, 'torque_personal_saas');
    assert.equal(result.body.discounts, undefined);
    assert.deepEqual(result, preparePagarmeSubscription(r));
    assert.equal(result.body.card, undefined); assert.equal(result.body.items, undefined);
    for (const mutate of [r => r.plan.items[0].pricing_scheme.price = 1, r => r.plan.interval = 'year',
      r => r.plan.currency = 'USD', r => r.plan.trial_period_days = 14,
      r => r.plan.items.push(r.plan.items[0]), r => r.cardToken = '4111111111111111',
      r => r.account.academiaId = 'other', r => r.account.customerId = 'browser@invalid',
      r => r.attemptId = 'retry-' + Date.now()]) {
      const input = request(); mutate(input); assert.throws(() => preparePagarmeSubscription(input));
    }
  });
  test('cupom validado tem desconto de1996centavos em somente1ciclo; campanha desligada não desconta', () => {
    const r = request();
    r.policy = { version: 'fixture-v1', campaignId: 'fixture', status: 'approved', enabled: true,
      approval: { id: 'fixture-only', approvedAt: createdAt }, basePriceCents: 4990, trialDays: 14,
      commissionBasis: 'full_price', discountBps: 4000, commissionBps: 4000, operatingReserveBps: 1000, remainderBps: 1000 };
    r.attribution = { trusted: true, source: 'code', code: 'FIXTURE', couponId: 'fixture-coupon',
      partnerId: 'fixture-partner', campaignId: 'fixture', policyVersion: 'fixture-v1', assignedAt: createdAt };
    assert.deepEqual(preparePagarmeSubscription(r).body.discounts, [{ discount_type: 'flat', value: 1996, cycles: 1 }]);
    r.policy.enabled = false; assert.throws(() => preparePagarmeSubscription(r));
  });
  test('somente pagamento íntegro confirmado concede classificação positiva com prazo finito', () => {
    const s = snapshot(), result = inspectPagarmeInvoice(s);
    assert.equal(result.status, 'paid'); assert.equal(result.paidThrough, '2026-11-16T00:00:00.000Z');
    s.serverNow = result.paidThrough; assert.equal(inspectPagarmeInvoice(s).status, 'expired');
    s.serverNow = '2026-10-16T12:00:00Z'; s.subscription.status = 'canceled';
    assert.equal(inspectPagarmeInvoice(s).renewalCanceled, true);
    s.invoice.status = 'pending'; s.charges[0].status = 'pending';
    assert.equal(inspectPagarmeInvoice(s).status, 'unpaid');
  });
  test('outro profissional, cliente, produto ou assinatura não recebem o pagamento', () => {
    for (const mutate of [s => s.subscription.customer.id = 'cus_Other', s => s.subscription.metadata.academia_id = 'other',
      s => s.subscription.metadata.product = 'student_charge', s => s.invoice.subscription.id = 'sub_Other',
      s => s.invoice.customer.id = 'cus_Other']) {
      const s = snapshot(); mutate(s); assert.throws(() => inspectPagarmeInvoice(s));
    }
  });
  test('duplicidade de charges, valor adulterado, moeda, estorno e chargeback exigem revisão', () => {
    for (const mutate of [s => s.charges.push(structuredClone(s.charges[0])), s => s.charges[0].paid_amount = 1,
      s => s.charges[0].currency = 'USD', s => s.charges[0].invoice.id = 'in_Other',
      s => s.charges[0].status = 'chargedback', s => s.charges[0].refunded_amount = 100,
      s => s.charges[0].last_transaction.status = 'partial_refunded', s => s.subscription.status = 'unknown',
      s => s.charges[0].paid_at = '2026-10-14T12:00:00Z',
      s => s.invoice.period.end_at = '2099-01-01T00:00:00Z',
      s => s.invoice.period.start_at = '2026-10-14T00:00:00Z']) {
      const s = snapshot(); mutate(s); assert.equal(inspectPagarmeInvoice(s).status, 'needs_review');
    }
  });
})();
