/* Store ficticio em memoria: sem SQL, gateway, rede, credenciais ou campanha
 * real. A implementacao SQL precisa de seus proprios testes de transacao/RLS.
 */
const assert = require('node:assert/strict');
const { test } = require('node:test');

(async () => {
  const { processReferralEvent, registerReferral } = await import('../supabase/functions/_shared/hq-referrals-store.mjs');
  const { emptySalesState } = await import('../supabase/functions/_shared/personal-sales.mjs');
  const customerKey = '20000000-0000-4000-8000-000000000001';
  const start = '2026-10-01T12:00:00.000Z', end = '2026-10-15T12:00:00.000Z';
  const paidAt = '2026-10-15T12:01:00.000Z', serverNow = '2026-10-16T12:00:00.000Z';
  const clone = value => JSON.parse(JSON.stringify(value));
  const context = () => ({ customerLabel: 'Personal ficticio',
    account: { trusted: true, provider: 'pagarme', merchantAccountId: 'test-merchant',
      customerId: customerKey, subscriptionId: 'test-sub', trialStartedAt: start,
      trialEndsAt: end, paymentHistoryVerified: true, firstPaidInvoiceId: 'test-invoice', firstPaidAt: paidAt },
    attribution: { trusted: true, source: 'code', code: 'TEST_ONLY', couponId: 'test-coupon', partnerId: 'test-partner',
      campaignId: 'test-campaign', policyVersion: 'test-v1', assignedAt: start },
    policy: { version: 'test-v1', campaignId: 'test-campaign', status: 'approved', enabled: true,
      approval: { id: 'fixture-only', approvedAt: start }, basePriceCents: 4990, trialDays: 14,
      commissionBasis: 'full_price', discountBps: 4000, commissionBps: 4000, operatingReserveBps: 1000, remainderBps: 1000 } });
  const trialContext = () => ({ ...context(), account: { trusted: true, trialStartedAt: start, trialEndsAt: end } });
  const event = (patch = {}) => ({ id: 'test-paid', provider: 'pagarme', kind: 'payment_confirmed',
    verified: true, verification: { source: 'provider_api', checkedAt: serverNow }, merchantAccountId: 'test-merchant',
    customerId: customerKey, subscriptionId: 'test-sub', invoiceId: 'test-invoice', chargeId: 'test-charge',
    currency: 'BRL', cycleIndex: 1, amountCents: 2994, paidAt, occurredAt: paidAt, ...patch });
  const input = (patch = {}) => ({ customerKey, context: context(), event: event(), serverNow, ...patch });
  const conflict = () => Object.assign(new Error('revision_conflict'), { code: 'HQ409' });
  const canonical = value => value === null || typeof value !== 'object' ? JSON.stringify(value) :
    Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' :
      '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  const fingerprint = evt => {
    const { verified, verification, ...content } = evt;
    return canonical(content);
  };
  function memoryStore({ enabled = true, coreState, savedContext = null, failures = [] } = {}) {
    const store = {
      row: { revision: 0, coreState: coreState ?? emptySalesState(), context: savedContext, campaign: { enabled } },
      receipts: new Map(), queue: new Map(), calls: [], loads: 0, failures: failures.slice(),
      async loadCustomer(key) {
        assert.equal(key, customerKey); this.loads++;
        return clone(this.row);
      },
      async commitCustomer(payload) {
        this.calls.push(clone(payload));
        const failure = this.failures.shift();
        if (failure) {
          if (typeof failure === 'function') await failure(this);
          else throw failure;
        }
        const key = payload.event && canonical([payload.event.provider, payload.event.merchantAccountId, payload.event.id]);
        const previous = key && this.receipts.get(key);
        if (previous && previous.fingerprint !== fingerprint(payload.event)) {
          throw Object.assign(new Error('event_id_payload_conflict'), { code: 'HQ409' });
        }
        if (payload.expectedRevision !== this.row.revision) throw conflict();
        // Uma pendencia identica pode ser reavaliada apos consulta do historico.
        if (previous && (payload.outcome === 'duplicate_event' ||
          !['needs_review', 'deferred'].includes(previous.outcome))) {
          return { revision: this.row.revision, outcome: previous.outcome, duplicate: true };
        }
        this.row = { ...this.row, revision: this.row.revision + 1,
          context: clone(payload.context), coreState: clone(payload.coreState) };
        if (key) {
          const receipt = { ...clone(payload), fingerprint: fingerprint(payload.event) };
          this.receipts.set(key, receipt);
          if (['needs_review', 'deferred'].includes(payload.outcome)) this.queue.set(key, receipt);
          else this.queue.delete(key);
        }
        return { revision: this.row.revision, outcome: payload.outcome };
      }
    };
    return store;
  }

  test('registra trial sem evento ou comissao, mesmo com campanha desligada', async () => {
    const store = memoryStore({ enabled: false });
    const original = clone(store.row.coreState);
    const result = await registerReferral(store, input({ context: trialContext() }));
    assert.deepEqual(result, { revision: 1, outcome: 'trial' });
    assert.deepEqual(store.row.coreState, original);
    assert.equal(store.calls[0].event, null);
    assert.equal(store.calls[0].observedAt, serverNow);
    assert.deepEqual(store.row.context, { ...trialContext(), account: { ...trialContext().account, customerId: customerKey } });
    assert.equal(store.row.context.account.provider, undefined);
    assert.equal(store.row.context.account.subscriptionId, undefined);
    assert.equal(store.row.context.account.merchantAccountId, undefined);
  });
  test('trial aceita trio gateway nulo e fixa identidade Torque sem inventar IDs', async () => {
    const store = memoryStore({ enabled: false });
    const minimal = trialContext();
    Object.assign(minimal.account, { customerId: null, provider: null, merchantAccountId: null, subscriptionId: null });
    await registerReferral(store, input({ context: minimal }));
    assert.deepEqual(store.row.context.account, { ...minimal.account, customerId: customerKey });
    assert.equal(store.calls[0].event, null);
  });
  test('politica omitida em novo trial usa somente snapshot protegido sem habilitar campanha', async () => {
    const store = memoryStore({ enabled: false });
    store.row.campaign.policy = { ...context().policy, enabled: false };
    const minimal = trialContext(); delete minimal.policy;
    await registerReferral(store, input({ context: minimal }));
    assert.deepEqual(store.row.context.policy, store.row.campaign.policy);
    assert.equal(store.row.context.policy.enabled, false);
    assert.equal(store.row.campaign.enabled, false);
    const missing = memoryStore({ enabled: false });
    await assert.rejects(registerReferral(missing, input({ context: minimal })), /missing_policy_snapshot/);
    assert.equal(missing.calls.length, 0);
  });
  test('primeiro evento vincula trio completo preservando trial e snapshots registrados', async () => {
    const store = memoryStore();
    await registerReferral(store, input({ context: trialContext() }));
    const current = context(); current.customerLabel = 'Mudou'; current.attribution.partnerId = 'outro';
    current.policy.commissionBps = 1;
    const result = await processReferralEvent(store, input({ context: current }));
    assert.equal(result.outcome, 'commission_recorded');
    assert.deepEqual(store.row.context, context());
    assert.equal(store.calls[1].customerKey, customerKey);
  });
  test('evento deriva trio do provedor com account base e contexto salvo ou inicialmente nulo', async () => {
    for (const savedContext of [null, trialContext()]) {
      const store = memoryStore({ savedContext });
      const result = await processReferralEvent(store, input({ context: trialContext() }));
      assert.equal(result.outcome, 'deferred');
      assert.deepEqual(store.row.context.account, { ...trialContext().account, customerId: customerKey,
        provider: 'pagarme', merchantAccountId: 'test-merchant', subscriptionId: 'test-sub' });
      assert.equal(store.row.coreState.commissions.length, 0);
      assert.equal(store.queue.size, 1);
    }
  });
  test('register nunca vincula gateway, inicialmente nem em registro repetido', async () => {
    for (const savedContext of [null, trialContext()]) {
      const store = memoryStore({ savedContext });
      await assert.rejects(registerReferral(store, input()), /gateway_binding_requires_event/);
      assert.equal(store.calls.length, 0);
    }
  });
  test('repetir contexto de trial com trio nulo preserva gateway ja vinculado', async () => {
    const store = memoryStore();
    const minimal = trialContext();
    Object.assign(minimal.account, { provider: null, merchantAccountId: null, subscriptionId: null });
    await registerReferral(store, input({ context: minimal }));
    await processReferralEvent(store, input());
    const linked = clone(store.row.context);
    await registerReferral(store, input({ context: minimal }));
    assert.deepEqual(store.row.context, linked);
    await processReferralEvent(store, input({ context: minimal }));
    assert.deepEqual(store.row.context, linked);
    assert.equal(store.row.coreState.commissions.length, 1);
  });
  test('vinculo parcial de gateway e rejeitado no trial e no processamento', async () => {
    for (const partial of [{ provider: 'pagarme' }, { merchantAccountId: 'test-merchant', subscriptionId: 'test-sub' }]) {
      const proposed = trialContext(); Object.assign(proposed.account, partial);
      for (const action of [registerReferral, processReferralEvent]) {
        const store = memoryStore();
        await assert.rejects(action(store, input({ context: proposed })), /partial_gateway_binding/);
        assert.equal(store.calls.length, 0);
      }
    }
    const store = memoryStore({ savedContext: trialContext() });
    await assert.rejects(processReferralEvent(store, input({ context: trialContext(),
      event: event({ subscriptionId: null }) })), /partial_gateway_binding/);
    assert.equal(store.calls.length, 0);
  });
  test('identidade Torque divergente nunca cria trial ou vinculo', async () => {
    const other = '20000000-0000-4000-8000-000000000002';
    const proposed = trialContext(); proposed.account.customerId = other;
    const store = memoryStore();
    await assert.rejects(registerReferral(store, input({ context: proposed })), /context_identity_conflict/);
    await assert.rejects(processReferralEvent(store, input({ context: trialContext(),
      event: event({ customerId: other }) })), /event_customer_key_mismatch/);
    assert.equal(store.calls.length, 0);
  });
  test('primeiro evento nao verificado nao persiste vinculo e vinculo existente nao troca', async () => {
    const store = memoryStore({ savedContext: trialContext() });
    await assert.rejects(processReferralEvent(store, input({ context: trialContext(),
      event: event({ verified: false }) })), /unverified_payment_event/);
    assert.equal(store.calls.length, 0);
    assert.equal(store.row.context.account.provider, undefined);
    await processReferralEvent(store, input({ context: trialContext() }));
    for (const patch of [{ provider: 'asaas' }, { merchantAccountId: 'other' }, { subscriptionId: 'other' }]) {
      await assert.rejects(processReferralEvent(store, input({ context: trialContext(),
        event: event({ id: 'change-link', ...patch }) })), /event_account_mismatch/);
    }
    assert.equal(store.calls.length, 1);
    assert.equal(store.row.context.account.provider, 'pagarme');
  });
  test('primeira mensalidade elegivel persiste uma comissao e recibo canonico', async () => {
    const store = memoryStore();
    const result = await processReferralEvent(store, input());
    assert.equal(result.outcome, 'commission_recorded');
    assert.equal(store.row.coreState.commissions.length, 1);
    assert.equal(store.row.coreState.commissions[0].claimableCents, 1996);
    assert.equal(store.receipts.size, 1);
    assert.deepEqual(store.calls[0].event, event());
  });
  test('repeticao semantica preserva resultado do recibo mesmo checkedAt diferente', async () => {
    const store = memoryStore();
    await processReferralEvent(store, input());
    const duplicate = await processReferralEvent(store, input({ event: event({ verification: {
      source: 'provider_api', checkedAt: '2026-10-16T11:00:00.000Z' } }) }));
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.outcome, 'commission_recorded');
    assert.equal(store.row.revision, 1);
    assert.equal(store.row.coreState.commissions.length, 1);
  });
  test('historico ainda nao verificado fica na fila apesar de core sem evento', async () => {
    const store = memoryStore();
    const pending = context(); pending.account.paymentHistoryVerified = false;
    const result = await processReferralEvent(store, input({ context: pending }));
    assert.equal(result.outcome, 'deferred');
    assert.deepEqual(store.row.coreState, emptySalesState());
    assert.equal(store.queue.size, 1);
    assert.equal(store.calls[0].reason, 'first_payment_history_required');
    assert.equal((await processReferralEvent(store, input())).outcome, 'commission_recorded');
    assert.equal(store.queue.size, 0);
  });
  test('pagamento anterior ao trial fica na fila duravel sem consumir evento', async () => {
    const store = memoryStore();
    const early = '2026-10-15T11:59:59.999Z';
    const result = await processReferralEvent(store, input({ event: event({ paidAt: early, occurredAt: early }) }));
    assert.equal(result.outcome, 'needs_review');
    assert.equal(store.calls[0].reason, 'payment_before_trial_end');
    assert.equal(store.queue.size, 1);
    assert.deepEqual(store.row.coreState, emptySalesState());
  });
  test('campanha desligada bloqueia nova comissao sem fabricar aprovacao nem consumir evento', async () => {
    const store = memoryStore({ enabled: false });
    const config = context(); config.policy = { enabled: false, status: 'proposed' };
    const result = await processReferralEvent(store, input({ context: config }));
    assert.equal(result.outcome, 'needs_review');
    assert.equal(store.calls[0].reason, 'campaign_inactive');
    assert.equal(store.row.context.policy.enabled, false);
    assert.deepEqual(store.row.coreState, emptySalesState());
    assert.equal(store.queue.size, 1);
  });
  test('campanha ausente ou flag nao booleana tambem bloqueia', async () => {
    for (const campaign of [undefined, null, {}, { enabled: 'true' }]) {
      const store = memoryStore(); store.row.campaign = campaign;
      await processReferralEvent(store, input());
      assert.equal(store.calls[0].reason, 'campaign_inactive');
      assert.equal(store.row.coreState.commissions.length, 0);
    }
  });
  test('campanha desligada ainda valida evento verificado e identidade no core', async () => {
    for (const patch of [{ verified: false }, { customerId: 'other' }, { currency: 'USD' }]) {
      const store = memoryStore({ enabled: false });
      await assert.rejects(processReferralEvent(store, input({ event: event(patch) })));
      assert.equal(store.calls.length, 0);
    }
  });
  test('estorno e disputa existentes funcionam desligados com snapshot historico', async () => {
    const store = memoryStore(); await processReferralEvent(store, input()); store.row.campaign.enabled = false;
    const current = context(); current.policy = { enabled: false }; current.attribution = null;
    await processReferralEvent(store, input({ context: current, event: event({ id: 'refund', kind: 'refund_confirmed',
      refundedCents: 1497, occurredAt: '2026-10-16T08:00:00.000Z' }) }));
    assert.equal(store.row.coreState.commissions[0].claimableCents, 998);
    await processReferralEvent(store, input({ context: current, event: event({ id: 'dispute', kind: 'dispute_opened',
      occurredAt: '2026-10-16T09:00:00.000Z' }) }));
    assert.equal(store.row.coreState.commissions[0].status, 'suspended');
    assert.equal(store.row.coreState.commissions[0].claimableCents, 0);
    await processReferralEvent(store, input({ context: current, event: event({ id: 'won', kind: 'dispute_won',
      occurredAt: '2026-10-16T10:00:00.000Z' }) }));
    assert.equal(store.row.coreState.commissions[0].claimableCents, 998);
    assert.deepEqual(store.row.context.policy, context().policy);
  });
  test('ajuste antes de pagamento conserva hold e impede comissao posterior', async () => {
    const store = memoryStore();
    await processReferralEvent(store, input({ event: event({ id: 'early-refund', kind: 'refund_confirmed',
      refundedCents: 2994, occurredAt: '2026-10-16T08:00:00.000Z' }) }));
    assert.equal(store.row.coreState.holds.length, 1);
    await processReferralEvent(store, input());
    assert.equal(store.calls.at(-1).reason, 'prior_adjustment_requires_reconciliation');
    assert.equal(store.row.coreState.commissions.length, 0);
    assert.equal(store.row.coreState.holds.length, 1);
    assert.equal(store.queue.size, 2);
  });
  test('repetir ajuste pendente consumido no core conserva recibo e fila duraveis', async () => {
    const store = memoryStore();
    const refund = event({ id: 'early-refund', kind: 'refund_confirmed', refundedCents: 2994,
      occurredAt: '2026-10-16T08:00:00.000Z' });
    await processReferralEvent(store, input({ event: refund }));
    const repeated = await processReferralEvent(store, input({ event: refund }));
    assert.equal(store.calls.at(-1).outcome, 'duplicate_event');
    assert.equal(repeated.outcome, 'needs_review');
    assert.equal(repeated.duplicate, true);
    assert.equal(store.row.revision, 1);
    assert.equal(store.row.coreState.holds.length, 1);
    assert.equal(store.queue.size, 1);
    assert.equal([...store.queue.values()][0].reason, 'adjustment_before_commission');
  });
  test('contexto salvo congela identidade trial atribuicao politica e rotulo', async () => {
    const saved = context(); saved.account.paymentHistoryVerified = false;
    const store = memoryStore({ savedContext: saved });
    const changed = context(); changed.customerLabel = 'Outro'; changed.attribution.partnerId = 'other';
    changed.policy.commissionBps = 1;
    await processReferralEvent(store, input({ context: changed }));
    assert.deepEqual(store.row.context, context());
    const after = context(); after.account.firstPaidInvoiceId = 'changed-after-commission';
    await registerReferral(store, input({ context: after }));
    assert.deepEqual(store.row.context, context());
    assert.equal(store.row.coreState.commissions.length, 1);
  });
  test('identidade ou trial divergente nao misturam novo historico com contexto salvo', async () => {
    for (const patch of [{ customerId: 'other' }, { provider: 'asaas' }, { subscriptionId: 'other' },
      { merchantAccountId: 'other' }, { trialStartedAt: end }, { trialEndsAt: start }, { trusted: false }]) {
      const store = memoryStore({ savedContext: context() });
      const changed = context(); Object.assign(changed.account, patch);
      await assert.rejects(processReferralEvent(store, input({ context: changed })), /context_identity_conflict/);
      assert.equal(store.calls.length, 0);
    }
  });
  test('CAS relê campanha e recalcula usando a revisao nova', async () => {
    const store = memoryStore({ failures: [s => { s.row.revision++; s.row.campaign.enabled = false; throw conflict(); }] });
    const result = await processReferralEvent(store, input());
    assert.equal(store.loads, 2);
    assert.deepEqual(store.calls.map(call => call.expectedRevision), [0, 1]);
    assert.deepEqual(store.calls.map(call => call.outcome), ['commission_recorded', 'needs_review']);
    assert.equal(result.outcome, 'needs_review');
    assert.equal(store.row.coreState.commissions.length, 0);
  });
  test('CAS relê comissao concorrente e nao produz segunda aquisicao', async () => {
    const store = memoryStore({ failures: [s => {
      s.row.revision++;
      s.row.context = clone(s.calls[0].context);
      s.row.coreState = clone(s.calls[0].coreState);
      throw conflict();
    }] });
    await processReferralEvent(store, input());
    assert.equal(store.loads, 2);
    assert.equal(store.calls[1].outcome, 'duplicate_event');
    assert.equal(store.row.coreState.commissions.length, 1);
    assert.equal(store.row.coreState.commissions[0].claimableCents, 1996);
  });
  test('CAS e limitado a tres tentativas e aceita reason explicito', async () => {
    const store = memoryStore({ failures: [conflict(), Object.assign(new Error('store conflict'),
      { code: 'HQ409', reason: 'revision_conflict' }), conflict()] });
    await assert.rejects(processReferralEvent(store, input()), /revision_conflict/);
    assert.equal(store.loads, 3); assert.equal(store.calls.length, 3);
    const one = memoryStore({ failures: [conflict()] });
    await assert.rejects(registerReferral(one, input({ context: trialContext() }), { maxAttempts: 1 }), /revision_conflict/);
    assert.equal(one.loads, 1);
  });
  test('conflito de payload duravel e erros nao CAS nunca repetem', async () => {
    const store = memoryStore();
    const pending = context(); pending.account.paymentHistoryVerified = false;
    await processReferralEvent(store, input({ context: pending }));
    const loads = store.loads;
    await assert.rejects(processReferralEvent(store, input({ context: pending,
      event: event({ chargeId: 'changed-charge' }) })), /event_id_payload_conflict/);
    assert.equal(store.loads - loads, 1);
    for (const failure of [new Error('revision_conflict'), Object.assign(new Error('network_failure'), { code: 'HQ409' }),
      Object.assign(new Error('revision_conflict'), { code: 'XX000' })]) {
      const failing = memoryStore({ failures: [failure] });
      await assert.rejects(processReferralEvent(failing, input()), err => err === failure);
      assert.equal(failing.loads, 1);
    }
  });
  test('entradas invalidas nao chegam ao store e registro nao inventa trial', async () => {
    for (const invalid of ['CUSTOMER', customerKey.toUpperCase().replace('2000', 'ABCD')]) {
      const store = memoryStore(); await assert.rejects(registerReferral(store, input({ customerKey: invalid })));
      assert.equal(store.loads, 0);
    }
    for (const maxAttempts of [0, 4, 1.5, '3', NaN]) {
      const store = memoryStore(); await assert.rejects(processReferralEvent(store, input(), { maxAttempts }));
      assert.equal(store.loads, 0);
    }
    const bad = trialContext(); bad.account.trialEndsAt = start;
    const store = memoryStore(); await assert.rejects(registerReferral(store, input({ context: bad })), /invalid_server_trial/);
    assert.equal(store.calls.length, 0);
    const longLabel = trialContext(); longLabel.customerLabel = 'a'.repeat(121);
    await assert.rejects(registerReferral(store, input({ context: longLabel })), /customer_label/);
    assert.equal(store.calls.length, 0);
  });
  test('estado ausente usa emptySalesState sem mutar inputs do chamador', async () => {
    const store = memoryStore(); delete store.row.coreState;
    const request = input(); const before = clone(request);
    await processReferralEvent(store, request);
    assert.deepEqual(request, before);
    assert.equal(store.row.coreState.commissions.length, 1);
  });
  test('registro persistido sem estado nao e substituido por ledger vazio', async () => {
    const store = memoryStore(); delete store.row.coreState; store.row.revision = 1;
    await assert.rejects(processReferralEvent(store, input()), /missing_persisted_state/);
    assert.equal(store.calls.length, 0);
  });
})().catch(error => { console.error(error); process.exitCode = 1; });
