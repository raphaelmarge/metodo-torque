/* Executar: node tests/test-personal-sales-core.js. Sem rede, banco ou credenciais.
 * Fixtures comerciais ficticias, aprovadas SOMENTE para testar o contrato puro.
 * Nao sao configuracao, cupom real ou aprovacao para producao.
 */
const assert = require('node:assert/strict');
const { test } = require('node:test');

(async () => {
  const { BASE_PRICE_CENTS, TRIAL_DAYS, createPolicySnapshot, quoteFirstMonth,
    resolveAttribution, emptySalesState, applySalesEvent } = await import('../supabase/functions/_shared/personal-sales.mjs');
  const start = '2026-10-01T12:00:00.000Z';
  const end = '2026-10-15T12:00:00.000Z';
  const paidAt = '2026-10-15T12:01:00.000Z';
  const now = '2026-10-16T12:00:00.000Z';
  const clone = value => JSON.parse(JSON.stringify(value));
  const policyConfig = (patch = {}) => ({
    version: 'fixture-v1', campaignId: 'fixture-campaign', status: 'approved', enabled: true,
    approval: { id: 'test-only-approval', approvedAt: start }, basePriceCents: 4990, trialDays: 14,
    commissionBasis: 'full_price', discountBps: 4000, commissionBps: 4000,
    operatingReserveBps: 1000, remainderBps: 1000, ...patch
  });
  const catalog = [{ code: 'TEST_ONLY', id: 'fixture-coupon', partnerId: 'fixture-partner',
    campaignId: 'fixture-campaign', policyVersion: 'fixture-v1', enabled: true, status: 'approved' },
  { code: 'OTHER_TEST', id: 'fixture-coupon-2', partnerId: 'fixture-partner-2',
    campaignId: 'fixture-campaign', policyVersion: 'fixture-v1', enabled: true, status: 'approved' }];
  const attribution = () => resolveAttribution({ code: 'TEST_ONLY' }, catalog, start).attribution;
  const account = () => ({ trusted: true, customerId: 'fixture-customer', provider: 'pagarme',
    merchantAccountId: 'fixture-merchant', subscriptionId: 'fixture-sub', trialStartedAt: start,
    trialEndsAt: end, paymentHistoryVerified: true, firstPaidInvoiceId: 'fixture-invoice', firstPaidAt: paidAt });
  const event = (patch = {}) => ({ id: 'fixture-event', provider: 'pagarme', kind: 'payment_confirmed',
    verified: true, verification: { source: 'provider_api', checkedAt: now },
    merchantAccountId: 'fixture-merchant', customerId: 'fixture-customer', subscriptionId: 'fixture-sub',
    invoiceId: 'fixture-invoice', cycleIndex: 1, chargeId: 'fixture-charge', currency: 'BRL',
    amountCents: 2994, paidAt, occurredAt: paidAt, ...patch });
  const apply = (state = emptySalesState(), overrides = {}) => applySalesEvent(state, {
    policy: policyConfig(), attribution: attribution(), account: account(), event: event(), serverNow: now, ...overrides
  });
  const adjustment = (kind, patch = {}) => event({ id: 'fixture-' + kind, kind,
    occurredAt: '2026-10-16T10:00:00.000Z', ...patch });

  test('sem politica ou cupom, a cotacao base e 4990 e trial de 14 dias', () => {
    assert.equal(BASE_PRICE_CENTS, 4990);
    assert.equal(TRIAL_DAYS, 14);
    assert.equal(quoteFirstMonth().payableCents, 4990);
    assert.equal(quoteFirstMonth().commissionCents, 0);
    assert.equal(quoteFirstMonth({ status: 'proposed' }).policySnapshot, null);
  });
  test('politica nao nasce habilitada e exige aprovacao, versao e percentuais explicitos', () => {
    for (const patch of [{ status: 'proposed' }, { enabled: false }, { approval: null }, { version: '' },
      { commissionBps: undefined }, { commissionBasis: 'paid_price' }]) {
      assert.throws(() => createPolicySnapshot(policyConfig(patch)));
    }
    assert.throws(() => quoteFirstMonth(null, attribution()));
  });
  test('rejeita valores alterados, NaN, infinitos, fracionarios, strings e totais incoerentes', () => {
    for (const value of [-1, 4000.5, '4000', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 10001]) {
      assert.throws(() => createPolicySnapshot(policyConfig({ commissionBps: value })));
    }
    for (const patch of [{ basePriceCents: 1 }, { trialDays: 0 }, { remainderBps: 999 }]) {
      assert.throws(() => createPolicySnapshot(policyConfig(patch)));
    }
  });
  test('fixture 40/40 calcula comissao sobre preco cheio e fecha 40/40/10/10', () => {
    const quote = quoteFirstMonth(policyConfig(), attribution());
    assert.deepEqual([quote.payableCents, quote.discountCents, quote.commissionCents,
      quote.operatingReserveCents, quote.remainderCents], [2994, 1996, 1996, 499, 499]);
    assert.notEqual(quote.commissionCents, Math.round(quote.payableCents * 0.4));
    assert.equal(quote.discountCents + quote.commissionCents + quote.operatingReserveCents + quote.remainderCents, 4990);
  });
  test('fixture historica 50/50 e configuravel sem virar padrao', () => {
    const quote = quoteFirstMonth(policyConfig({ discountBps: 5000, commissionBps: 5000,
      operatingReserveBps: 0, remainderBps: 0 }), attribution());
    assert.equal(quote.payableCents, 2495);
    assert.equal(quote.commissionCents, 2495);
    assert.equal(quote.remainderCents, 0);
    assert.equal(quoteFirstMonth().commissionCents, 0);
  });
  test('centavos arredondados mantem a soma sem flutuantes financeiros', () => {
    const quote = quoteFirstMonth(policyConfig({ discountBps: 3333, commissionBps: 3333,
      operatingReserveBps: 1667, remainderBps: 1667 }), attribution());
    assert.equal(quote.discountCents, 1663);
    assert.equal(quote.commissionCents, 1663);
    assert.equal(quote.operatingReserveCents, 832);
    assert.equal(quote.remainderCents, 832);
  });
  test('snapshot e independente de edicoes posteriores e imutavel', () => {
    const config = policyConfig();
    const snapshot = createPolicySnapshot(config);
    config.commissionBps = 0;
    config.approval.id = 'changed';
    assert.equal(snapshot.commissionBps, 4000);
    assert.equal(snapshot.approval.id, 'test-only-approval');
    assert.ok(Object.isFrozen(snapshot) && Object.isFrozen(snapshot.approval));
  });
  test('reserva absorve centavo de arredondamento sem reduzir desconto ou comissao', () => {
    for (const [config, amounts] of [
      [{ discountBps: 5000, commissionBps: 2500, operatingReserveBps: 2500, remainderBps: 0 }, [2495, 1248, 1247, 0]],
      [{ discountBps: 999, commissionBps: 1999, operatingReserveBps: 7002, remainderBps: 0 }, [499, 998, 3493, 0]]
    ]) {
      const quote = quoteFirstMonth(createPolicySnapshot(policyConfig(config)), attribution());
      assert.deepEqual([quote.discountCents, quote.commissionCents, quote.operatingReserveCents, quote.remainderCents], amounts);
      assert.equal(amounts.reduce((sum, amount) => sum + amount, 0), 4990);
    }
    assert.throws(() => createPolicySnapshot(policyConfig({ discountBps: 500, commissionBps: 9500,
      operatingReserveBps: 0, remainderBps: 0 })), /priority_rounding_exceeds_price/);
  });
  test('cupom valido prevalece sobre link, com parceiro obtido apenas do catalogo', () => {
    const result = resolveAttribution({ code: 'test_only', link: 'OTHER_TEST', partnerId: 'attacker' }, catalog, start);
    assert.equal(result.status, 'attributed');
    assert.equal(result.attribution.partnerId, 'fixture-partner');
    assert.equal(result.attribution.source, 'code');
    assert.equal(result.attribution.assignedAt, start);
  });
  test('link sozinho e provisório: nao aplica desconto nem comissao', () => {
    const result = resolveAttribution({ link: 'TEST_ONLY' }, catalog, start);
    assert.equal(result.status, 'provisional');
    assert.equal(quoteFirstMonth(null, result.attribution).payableCents, 4990);
    const payment = apply(undefined, { attribution: result.attribution, event: event({ amountCents: 4990 }) });
    assert.equal(payment.outcome, 'ignored_no_coupon');
    assert.equal(payment.state.commissions.length, 0);
  });
  test('codigo desconhecido, desativado, expirado ou ambiguo nao usa link como fallback', () => {
    assert.equal(resolveAttribution({ code: 'BAD', link: 'TEST_ONLY' }, catalog, start).status, 'rejected');
    assert.equal(resolveAttribution({ code: '<script>' }, catalog, start).status, 'rejected');
    for (const records of [[{ ...catalog[0], enabled: false }], [{ ...catalog[0], status: 'proposed' }],
      [{ ...catalog[0], expiresAt: start }], [catalog[0], catalog[0]]]) {
      assert.equal(resolveAttribution({ code: 'TEST_ONLY' }, records, start).status, 'rejected');
    }
  });
  test('atribuicao nao confiavel ou pertencente a outra politica nao concede promocao', () => {
    for (const patch of [{ trusted: false }, { campaignId: 'different' }, { policyVersion: 'old' }, { code: '<bad>' }]) {
      assert.throws(() => quoteFirstMonth(policyConfig(), { ...attribution(), ...patch }));
    }
  });
  test('pagamento verificado apos trial produz UMA entrada pendente e preserva entradas', () => {
    const state = emptySalesState();
    const before = clone(state);
    const result = apply(state);
    assert.equal(result.outcome, 'commission_recorded');
    assert.equal(result.commission.claimableCents, 1996);
    assert.equal(result.commission.status, 'pending_review');
    assert.equal(result.commission.policySnapshot.version, 'fixture-v1');
    assert.equal(result.commission.trialEndsAt, end);
    assert.deepEqual(state, before);
    assert.equal(result.state.commissions.length, 1);
  });
  test('sem cobranca paga (falha/cancelamento), nao existe comissao', () => {
    for (const kind of ['payment_failed', 'subscription_canceled']) {
      const result = apply(undefined, { event: event({ kind }) });
      assert.equal(result.outcome, 'ignored_non_payment');
      assert.equal(result.state.commissions.length, 0);
    }
  });
  test('nega evento nao verificado, retorno do navegador e identidade de outra conta', () => {
    for (const patch of [{ verified: false }, { verification: { source: 'browser', checkedAt: now } },
      { merchantAccountId: 'attacker' }, { customerId: 'attacker' }, { subscriptionId: 'other' }, { currency: 'USD' }]) {
      assert.throws(() => apply(undefined, { event: event(patch) }));
    }
    assert.throws(() => apply(undefined, { account: { ...account(), trusted: false } }));
  });
  test('nega manipulacao de preco e quantidade efetivamente capturada', () => {
    for (const amountCents of [0, 1, 2495, 4990, -1, 2994.5, '2994', Infinity]) {
      assert.throws(() => apply(undefined, { event: event({ amountCents }) }));
    }
  });
  test('pagamento antes do fim do trial nunca amadurece por esperar o relogio', () => {
    const early = '2026-10-15T11:59:59.999Z';
    const result = apply(undefined, { event: event({ paidAt: early, occurredAt: early }) });
    assert.equal(result.outcome, 'needs_review');
    assert.equal(result.reason, 'payment_before_trial_end');
    assert.deepEqual(result.state, emptySalesState());
  });
  test('limite exato de 14 dias e aceito quando historico confirma o primeiro pagamento', () => {
    const result = apply(undefined, { event: event({ paidAt: end, occurredAt: end }),
      account: { ...account(), firstPaidAt: end } });
    assert.equal(result.outcome, 'commission_recorded');
  });
  test('rejeita datas do cliente, invalidas, relogio adiantado e trial encurtado', () => {
    assert.throws(() => apply(undefined, { serverNow: '2026-10-16' }));
    assert.throws(() => apply(undefined, { serverNow: start }));
    assert.throws(() => apply(undefined, { account: { ...account(), trialEndsAt: start } }));
    assert.throws(() => apply(undefined, { account: { ...account(), trialStartedAt: '2026-02-31T12:00:00.000Z' } }));
    assert.throws(() => apply(undefined, { event: event({ verification: { source: 'provider_api', checkedAt: start } }) }));
    assert.throws(() => apply(undefined, { event: event({ paidAt: now }) }));
    assert.throws(() => apply(undefined, { attribution: { ...attribution(), assignedAt: now } }));
    assert.throws(() => apply(undefined, { policy: policyConfig({ approval: { id: 'future', approvedAt: '2027-01-01T00:00:00.000Z' } }) }));
  });
  test('sem historico de primeira paga confirmado, adia sem lancar ou consumir evento', () => {
    const result = apply(undefined, { account: { ...account(), paymentHistoryVerified: false } });
    assert.equal(result.outcome, 'deferred');
    assert.deepEqual(result.state, emptySalesState());
    assert.equal(apply(result.state).outcome, 'commission_recorded');
    assert.equal(apply(undefined, { account: { ...account(), firstPaidInvoiceId: 'earlier' } }).outcome, 'needs_review');
  });
  test('segunda mensalidade nunca gera comissao, mesmo com cupom valido', () => {
    const result = apply(undefined, { event: event({ cycleIndex: 2, invoiceId: 'second' }) });
    assert.equal(result.outcome, 'ignored_non_first_cycle');
    assert.equal(result.state.commissions.length, 0);
  });
  test('primeira paga comprovada em ciclo posterior vai a revisao sem negar elegibilidade definitiva', () => {
    const result = apply(undefined, { event: event({ cycleIndex: 2 }) });
    assert.equal(result.outcome, 'needs_review');
    assert.equal(result.reason, 'first_payment_on_later_cycle_requires_policy');
    assert.deepEqual(result.state, emptySalesState());
    const renewal = apply(apply().state, { event: event({ id: 'renewal-event', cycleIndex: 2 }) });
    assert.equal(renewal.outcome, 'ignored_non_first_cycle');
    assert.equal(renewal.state.commissions.length, 1);
  });
  test('evento repetido nao altera estado; mesmo ID com outro valor e conflito', () => {
    const first = apply();
    const duplicate = apply(first.state);
    assert.equal(duplicate.outcome, 'duplicate_event');
    assert.deepEqual(duplicate.state, first.state);
    assert.throws(() => apply(first.state, { event: event({ amountCents: 1 }) }), /event_id_payload_conflict/);
  });
  test('outro evento e outro chargeId do mesmo ciclo nao duplicam a recompensa', () => {
    const first = apply();
    const result = apply(first.state, { event: event({ id: 'second-event', chargeId: 'second-charge' }) });
    assert.equal(result.outcome, 'duplicate_cycle');
    assert.equal(result.state.commissions.length, 1);
    assert.equal(result.commission.claimableCents, 1996);
    assert.deepEqual(result.commission.chargeIds, ['fixture-charge', 'second-charge']);
  });
  test('mesmo cliente em outra assinatura/campanha nao e nova aquisicao', () => {
    const result = apply(apply().state, { event: event({ id: 'new-sub-event', subscriptionId: 'second-sub', invoiceId: 'new-invoice' }),
      account: { ...account(), subscriptionId: 'second-sub', firstPaidInvoiceId: 'new-invoice' } });
    assert.equal(result.outcome, 'ignored_customer_already_rewarded');
    assert.equal(result.state.commissions.length, 1);
  });
  test('estorno parcial reduz comissao proporcionalmente; integral reverte sem pagamento', () => {
    const first = apply();
    const partial = apply(first.state, { event: adjustment('refund_confirmed', { refundedCents: 1497 }) });
    assert.equal(partial.commission.claimableCents, 998);
    assert.equal(partial.adjustmentCents, -998);
    assert.equal(partial.state.audit.at(-1).adjustmentCents, -998);
    const full = apply(partial.state, { event: adjustment('refund_confirmed', { id: 'full-refund', refundedCents: 2994 }) });
    assert.equal(full.commission.status, 'reverted');
    assert.equal(full.commission.claimableCents, 0);
    assert.equal(full.state.commissions.length, 1);
    assert.equal(full.commission.policySnapshot.commissionBps, 4000);
  });
  test('estorno cumulativo atrasado ou repetido nao recupera comissao', () => {
    const refunded = apply(apply().state, { event: adjustment('refund_confirmed', { refundedCents: 2994 }) });
    const stale = apply(refunded.state, { event: adjustment('refund_confirmed', { id: 'late-partial', refundedCents: 500 }) });
    assert.equal(stale.outcome, 'ignored_stale_adjustment');
    assert.equal(stale.commission.claimableCents, 0);
    const latePaid = apply(stale.state, { event: event({ id: 'late-paid', chargeId: 'new-charge' }) });
    assert.equal(latePaid.outcome, 'duplicate_cycle');
    assert.equal(latePaid.commission.status, 'reverted');
    assert.equal(latePaid.commission.claimableCents, 0);
  });
  test('estorno antes do pagamento persiste bloqueio, evento e auditoria e impede comissao tardia', () => {
    const negative = adjustment('refund_confirmed', { refundedCents: 2994 });
    const result = apply(undefined, { event: negative });
    assert.equal(result.reason, 'adjustment_before_commission');
    assert.equal(result.state.commissions.length, 0);
    assert.equal(result.state.holds.length, 1);
    assert.equal(result.state.holds[0].refundedCents, 2994);
    assert.equal(result.state.events.length, 1);
    assert.equal(result.state.audit[0].reason, 'adjustment_before_commission');
    const latePayment = apply(result.state);
    assert.equal(latePayment.reason, 'prior_adjustment_requires_reconciliation');
    assert.deepEqual(latePayment.state, result.state);
    const replayRefund = apply(latePayment.state, { event: negative });
    assert.equal(replayRefund.outcome, 'duplicate_event');
    assert.deepEqual(replayRefund.state, result.state);
  });
  test('qualquer ordem entre pagamento e estorno/disputa mantem total reclamavel zero', () => {
    for (const negative of [adjustment('refund_confirmed', { refundedCents: 2994 }),
      adjustment('dispute_opened'), adjustment('dispute_lost')]) {
      for (const events of [[event(), negative], [negative, event()]]) {
        let state = emptySalesState();
        for (const nextEvent of events) state = apply(state, { event: nextEvent }).state;
        assert.equal(state.commissions.reduce((sum, item) => sum + item.claimableCents, 0), 0);
        assert.ok(state.holds.length === 1 || state.commissions[0].claimableCents === 0);
      }
    }
  });
  test('ajuste de charge desconhecida exige reconciliacao e nao altera recompensa', () => {
    const first = apply();
    for (const kind of ['refund_confirmed', 'dispute_opened', 'dispute_lost']) {
      const result = apply(first.state, { event: adjustment(kind, { chargeId: 'unknown-charge', refundedCents: 2994 }) });
      assert.equal(result.outcome, 'needs_review');
      assert.equal(result.reason, 'unreconciled_charge');
      assert.deepEqual(result.state, first.state);
    }
    const reconciled = apply(first.state, { event: event({ id: 'reconciled-payment', chargeId: 'next-charge' }) });
    const refund = apply(reconciled.state, { event: adjustment('refund_confirmed', { chargeId: 'next-charge', refundedCents: 2994 }) });
    assert.equal(refund.commission.status, 'reverted');
    assert.equal(refund.commission.claimableCents, 0);
  });
  test('rejeita estorno excessivo, float e valores de outra cobranca', () => {
    for (const refundedCents of [-1, 2995, 0.5, '100']) {
      assert.throws(() => apply(apply().state, { event: adjustment('refund_confirmed', { refundedCents }) }));
    }
    assert.throws(() => apply(apply().state, { event: adjustment('refund_confirmed', { amountCents: 1, refundedCents: 1 }) }));
    const other = apply(apply().state, { event: adjustment('refund_confirmed', { invoiceId: 'renewal', refundedCents: 1 }) });
    assert.equal(other.outcome, 'ignored_other_cycle');
  });
  test('disputa suspende, estorno continua registrado e ganho restaura so saldo remanescente', () => {
    const opened = apply(apply().state, { event: adjustment('dispute_opened', { occurredAt: '2026-10-16T08:00:00.000Z' }) });
    assert.equal(opened.commission.status, 'suspended');
    assert.equal(opened.commission.claimableCents, 0);
    const refund = apply(opened.state, { event: adjustment('refund_confirmed', { refundedCents: 1497 }) });
    assert.equal(refund.commission.refundedCents, 1497);
    assert.equal(refund.commission.claimableCents, 0);
    const won = apply(refund.state, { event: adjustment('dispute_won', { occurredAt: '2026-10-16T11:00:00.000Z' }) });
    assert.equal(won.commission.claimableCents, 998);
    assert.equal(won.commission.status, 'pending_review');
    assert.equal(won.adjustmentCents, 998);
  });
  test('disputa perdida reverte e pagamento/abertura atrasados nao ressuscitam comissao', () => {
    const lost = apply(apply().state, { event: adjustment('dispute_lost') });
    assert.equal(lost.commission.status, 'reverted');
    const stale = apply(lost.state, { event: adjustment('dispute_opened', { occurredAt: '2026-10-16T08:00:00.000Z' }) });
    assert.equal(stale.outcome, 'ignored_stale_adjustment');
    assert.equal(stale.commission.claimableCents, 0);
    const reversed = apply(lost.state, { event: adjustment('dispute_won', { occurredAt: '2026-10-16T11:00:00.000Z' }) });
    assert.equal(reversed.outcome, 'needs_review');
    assert.deepEqual(reversed.state, lost.state);
  });
  test('disputa encerrada nao reabre com evento fora de ordem no mesmo timestamp', () => {
    const opened = apply(apply().state, { event: adjustment('dispute_opened') });
    const won = apply(opened.state, { event: adjustment('dispute_won') });
    const reopened = apply(won.state, { event: adjustment('dispute_opened', { id: 'delayed-open' }) });
    assert.equal(reopened.outcome, 'needs_review');
    assert.deepEqual(reopened.state, won.state);
  });
  test('campanha desligada nao impede ajustes da venda historica; usa snapshot original', () => {
    const result = apply(apply().state, { policy: policyConfig({ enabled: false, commissionBps: 1 }), attribution: null,
      event: adjustment('refund_confirmed', { refundedCents: 1497 }) });
    assert.equal(result.commission.claimableCents, 998);
    assert.equal(result.commission.policySnapshot.commissionBps, 4000);
  });
  test('cancelar renovacao nao estorna nem paga a comissao existente', () => {
    const first = apply();
    const result = apply(first.state, { event: adjustment('subscription_canceled') });
    assert.equal(result.outcome, 'ignored_non_payment');
    assert.deepEqual(result.state.commissions, first.state.commissions);
    assert.equal(result.state.commissions[0].status, 'pending_review');
  });
})().catch(error => { console.error(error); process.exitCode = 1; });
