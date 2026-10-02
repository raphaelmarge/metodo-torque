/* PGlite real e efemero: nenhuma URL, credencial, migration remota ou transferencia.
 * Fixtures historicas sao inseridas SOMENTE pelo owner de teste. A campanha
 * persistida permanece disabled inclusive nos testes de ledger e pagamento.
 * PGlite nao prova concorrencia de multiplas conexoes nem autenticacao HTTP.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('./runtime/node_modules/@electric-sql/pglite');
const migration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20260930193716_hq_referrals_ledger.sql'), 'utf8');
const paymentContract = fs.readFileSync(path.join(__dirname, '../supabase/hq-referrals-payment-contract-proposal.sql'), 'utf8');
const ADMIN = '10000000-0000-4000-8000-000000000001', OTHER = '10000000-0000-4000-8000-000000000002';
const start = '2026-01-01T12:00:00.000Z', end = '2026-01-15T12:00:00.000Z';
const paidAt = '2026-01-15T12:01:00.000Z', now = '2026-01-16T12:00:00.000Z';
let count = 0;
async function check(name, fn) { await fn(); console.log('OK ' + name); count++; }
async function fails(fn, code, message) { await assert.rejects(fn, error => error.code === code && (!message || error.message.includes(message))); }

(async () => {
 const db = new PGlite();
 const { applySalesEvent, emptySalesState } = await import('../supabase/functions/_shared/personal-sales.mjs');
 const { registerReferral, processReferralEvent } = await import('../supabase/functions/_shared/hq-referrals-store.mjs');
 const who = async (role = 'authenticated', uid = ADMIN) => {
  await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  if (role !== 'owner') await db.exec('set role ' + role);
 };
 const rpc = async (name, input, noArgs = false) => (await db.query('select public.' + name + '(' + (noArgs ? '' : '$1') + ') r', noArgs ? [] : [input])).rows[0].r;
 const store = {
  loadCustomer: key => rpc('hq_referrals_load_customer', key),
  commitCustomer: input => rpc('hq_referrals_commit_customer', input)
 };
 const snapshot = () => rpc('hq_referrals_snapshot', null, true);
 const scalar = async sql => Object.values((await db.query(sql)).rows[0])[0];
 let partner, coupon, policy;
 const context = key => ({ customerLabel: 'Personal de teste', account: { trusted: true, customerId: key, trialStartedAt: start, trialEndsAt: end },
  attribution: { trusted: true, source: 'code', code: coupon.code, couponId: coupon.id, partnerId: partner.id,
   campaignId: policy.campaignId, policyVersion: policy.version, assignedAt: start }, policy: structuredClone(policy) });
 const bound = key => ({ ...context(key), account: { ...context(key).account, provider: 'pagarme', merchantAccountId: 'merchant-test',
  subscriptionId: 'sub-' + key, paymentHistoryVerified: true, firstPaidInvoiceId: 'invoice-' + key, firstPaidAt: paidAt } });
 const event = (key, patch = {}) => ({ id: 'event-' + key, provider: 'pagarme', kind: 'payment_confirmed', verified: true,
  verification: { source: 'provider_api', checkedAt: now }, merchantAccountId: 'merchant-test', customerId: key,
  subscriptionId: 'sub-' + key, invoiceId: 'invoice-' + key, cycleIndex: 1, chargeId: 'charge-' + key,
  currency: 'BRL', amountCents: 2994, paidAt, occurredAt: paidAt, ...patch });
 async function fixture(status = 'eligible', existingPartner = partner) {
  const key = randomUUID(), id = randomUUID(), ctx = bound(key);
  assert.equal(existingPartner.id, partner.id); // fixture deste lote usa parceiro do catalogo acima
  ctx.policy.enabled = true; ctx.policy.approval = { id: 'test-only-approval', approvedAt: start };
  const result = applySalesEvent(emptySalesState(), { policy: ctx.policy, attribution: ctx.attribution, account: ctx.account, event: event(key), serverNow: now });
  const entry = result.state.commissions[0]; assert.ok(entry);
  await who('owner');
  await db.query("insert into hq_referrals_private.customers(id,revision,context,core_state,partner_id,coupon_id,status) values($1,1,$2,$3,$4,$5,'pending')", [key, ctx, result.state, partner.id, coupon.id]);
  await db.query("insert into hq_referrals_private.commissions(id,customer_id,partner_id,coupon_id,core_id,core_entry,status,amount_cents,claimable_cents,eligible_at) values($1,$2,$3,$4,$5,$6,$7,1996,1996,$8)", [id, key, partner.id, coupon.id, entry.id, entry, status, paidAt]);
  return { key, id, ctx, state: result.state, entry };
 }
 try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
   create schema auth; grant usage on schema auth to anon, authenticated, service_role;
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   create table public.saas_admins(user_id uuid primary key); alter table public.saas_admins enable row level security;
   create function public.hq_sou_admin() returns boolean language sql security definer set search_path='' as $$ select exists(select 1 from public.saas_admins where user_id=auth.uid()) $$;`);
  await db.exec(migration); await db.exec(paymentContract); await db.query('insert into public.saas_admins values($1)', [ADMIN]);
  await check('migration cria politica comercial aprovada e campanha operacional inativa', async () => {
   await who(); const s = await snapshot(); assert.equal(s.campaign.approved, true); assert.equal(s.campaign.enabled, false);
   assert.deepEqual([s.campaign.basePriceCents,s.campaign.discountBps,s.campaign.commissionBps,s.campaign.reserveBps,s.campaign.torqueBps], [4990,4000,4000,1000,1000]);
   for (const key of ['partners','coupons','referrals','commissions','payments','audit']) assert.deepEqual(s[key], []);
  });
  await check('anon e usuario autenticado comum nao acessam nenhuma RPC HQ', async () => {
   const calls = [['hq_referrals_snapshot',null,true],['hq_referrals_save_partner',{}],['hq_referrals_save_coupon',{}],['hq_referrals_review',{}],['hq_referrals_record_payment',{}]];
   await who('anon',''); for (const args of calls) await fails(() => rpc(...args), '42501');
   await who('authenticated',OTHER); for (const args of calls) await fails(() => rpc(...args), 'HQ403');
  });
  await check('admin nao grava tabelas diretamente nem chama ingestao service-only', async () => {
   await who(); await fails(() => db.query("insert into hq_referrals_private.partners(name,status) values('Ataque','active')"), '42501');
   await fails(() => db.query('select * from hq_referrals_private.customers'), '42501');
   await fails(() => store.loadCustomer(randomUUID()), '42501'); await fails(() => store.commitCustomer({}), '42501');
  });
  await check('catalogo salva dados reais, normaliza cupom e rejeita ativacao/preco do cliente', async () => {
   partner = await rpc('hq_referrals_save_partner', {name:'Parceiro de teste',contact:'contato de teste',status:'active'});
   coupon = await rpc('hq_referrals_save_coupon', {code:' teste_40 ',partnerId:partner.id,status:'ready'}); assert.equal(coupon.code, 'TESTE_40');
   await fails(() => rpc('hq_referrals_save_partner', {name:'A',status:'active',enabled:true}), 'HQ400');
   await fails(() => rpc('hq_referrals_save_coupon', {code:'INVALIDO',partnerId:partner.id,status:'ready',discountBps:10000}), 'HQ400');
   await fails(() => rpc('hq_referrals_save_coupon', {code:'TESTE_40',partnerId:partner.id,status:'ready'}), 'HQ409');
   await fails(() => rpc('hq_referrals_save_coupon', {code:'_INVALIDO',partnerId:partner.id,status:'ready'}), 'HQ400');
   assert.equal((await rpc('hq_referrals_save_coupon', {code:'X'.repeat(40),partnerId:partner.id,status:'draft'})).code.length,40);
   assert.equal((await rpc('hq_referrals_save_coupon', {code:'XYZ',partnerId:partner.id,status:'draft'})).code.length,3);
   for(const code of ['XX','X'.repeat(41),'X'.repeat(48)]) await fails(() => rpc('hq_referrals_save_coupon',{code,partnerId:partner.id,status:'draft'}),'HQ400');
  });
  await check('revisao otimista impede sobrescrita de catalogo e valida limites', async () => {
   partner = await rpc('hq_referrals_save_partner', {id:partner.id,name:'Parceiro revisto',contact:'',status:'active',expectedRevision:partner.revision});
   await fails(() => rpc('hq_referrals_save_partner', {id:partner.id,name:'Antigo',status:'active',expectedRevision:1}), 'HQ409');
   await fails(() => rpc('hq_referrals_save_partner', {name:'x'.repeat(121),status:'active'}), 'HQ400');
  });
  let key = randomUUID(), ctx;
  await check('trial canonico persiste antes do gateway sem inventar identificadores', async () => {
   await who('service_role',''); policy = (await store.loadCustomer(key)).campaign.policy; ctx = context(key);
   const result = await registerReferral(store, {customerKey:key,context:ctx,serverNow:now}); assert.equal(result.revision,1);
   const loaded = await store.loadCustomer(key); assert.equal(loaded.context.account.customerId,key); assert.equal(loaded.context.account.provider,undefined);
   assert.equal(loaded.coreState.commissions.length,0);
  });
  await check('primeiro evento vincula gateway, mas campanha OFF conserva evento pendente sem comissao', async () => {
   const result = await processReferralEvent(store, {customerKey:key,context:bound(key),event:event(key),serverNow:now}); assert.equal(result.outcome,'needs_review');
   const loaded = await store.loadCustomer(key); assert.equal(loaded.context.account.provider,'pagarme'); assert.equal(loaded.coreState.commissions.length,0);
   await who('owner'); assert.equal(await scalar('select count(*)::int from hq_referrals_private.events'),1);
   const row = (await db.query('select outcome,body from hq_referrals_private.events')).rows[0]; assert.equal(row.outcome,'needs_review'); assert.equal(row.body.id,event(key).id);
  });
  await check('mesmo evento com payload diferente falha sem retry/segunda escrita', async () => {
   await who('service_role',''); await fails(() => processReferralEvent(store, {customerKey:key,context:bound(key),event:event(key,{amountCents:1}),serverNow:now}), 'HQ409','event_payload_conflict');
  });
  await check('primeiro recebimento verificado independe da campanha e do status de repasse', async () => {
   await who(); const s=await snapshot(),r=s.referrals.find(x=>x.id===key);
   assert.equal(s.contractVersion,2); assert.equal(r.status,'needs_review'); assert.equal(r.referralStatus,r.status);
   assert.deepEqual(r.firstPayment,{status:'verified',scope:'historical_first_payment',paidAt,amountCents:2994,afterTrial:true,
    adjustments:{status:'unknown',refundedCents:null,disputeStatus:null},reason:null});
   assert.equal(s.commissions.filter(x=>x.referralId===key).length,0);
   await who('service_role','');
  });
  await check('CAS de primeira gravacao e revisao concorrente nao sobrescrevem estado', async () => {
   const loaded = await store.loadCustomer(key);
   const request = {customerKey:key,expectedRevision:loaded.revision,context:loaded.context,event:null,coreState:loaded.coreState,outcome:'trial',reason:null,observedAt:now};
   await store.commitCustomer(request); await fails(() => store.commitCustomer(request),'HQ409','revision_conflict');
   const fresh = randomUUID(), newRequest={...request,customerKey:fresh,expectedRevision:0,context:context(fresh),coreState:emptySalesState()};
   await store.commitCustomer(newRequest); await fails(() => store.commitCustomer(newRequest),'HQ409','revision_conflict');
  });
  await check('SQL congela identidade canonica, trial, vinculo de provedor e cupom utilizado', async () => {
   const loaded = await store.loadCustomer(key);
   for (const mutate of [c => c.account.subscriptionId='outro',c => c.account.customerId=randomUUID(),c => c.policy.commissionBps=1,c => c.attribution.partnerId=randomUUID()]) {
    const changed=structuredClone(loaded.context); mutate(changed);
    await assert.rejects(store.commitCustomer({customerKey:key,expectedRevision:loaded.revision,context:changed,event:null,coreState:loaded.coreState,outcome:'trial',reason:null,observedAt:now}));
   }
   await who(); await fails(() => rpc('hq_referrals_save_coupon',{id:coupon.id,code:'OUTRO_40',partnerId:partner.id,status:'ready',expectedRevision:coupon.revision}),'HQ422');
  });
  await check('atribuicao incompleta nao congela cadastro invalido nem cria registros parciais', async () => {
   await who('service_role','');
   for (const missing of ['source','assignedAt']) {
    const k=randomUUID(),c=context(k); delete c.attribution[missing];
    await fails(() => store.commitCustomer({customerKey:k,expectedRevision:0,context:c,event:null,coreState:emptySalesState(),outcome:'trial',reason:null,observedAt:now}),'HQ400','invalid_'+missing);
    assert.equal((await store.loadCustomer(k)).revision,0);
   }
  });
  await check('duas escritas com snapshot inicial comum produzem um vencedor CAS', async () => {
   const k=randomUUID(),request={customerKey:k,expectedRevision:0,context:context(k),event:null,coreState:emptySalesState(),outcome:'trial',reason:null,observedAt:now};
   const results=await Promise.allSettled([store.commitCustomer(request),store.commitCustomer(request)]);
   assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
   assert.equal(results.find(r=>r.status==='rejected').reason.message,'revision_conflict');
   assert.equal((await store.loadCustomer(k)).revision,1);
   // PGlite serializa a conexao; prova CAS, nao escalonamento de locks reais.
  });
  await check('service_role nao vira HQ admin e nao recebe gravacao direta de campanha', async () => {
   await fails(snapshot,'42501');
   await fails(() => db.query('update hq_referrals_private.campaign set enabled=true'),'42501');
   await fails(() => db.query('delete from hq_referrals_private.payments'),'42501');
  });
  await check('estorno antes do pagamento e repeticao preservam hold e fila pendente', async () => {
   const k=randomUUID(); await who('service_role',''); await registerReferral(store,{customerKey:k,context:context(k),serverNow:now});
   const ev=event(k,{id:'early-refund-'+k,kind:'refund_confirmed',refundedCents:2994,occurredAt:'2026-01-16T10:00:00.000Z'});
   const first=await processReferralEvent(store,{customerKey:k,context:bound(k),event:ev,serverNow:now}); assert.equal(first.outcome,'needs_review');
   const again=await processReferralEvent(store,{customerKey:k,context:bound(k),event:ev,serverNow:now}); assert.equal(again.outcome,'needs_review'); assert.equal(again.duplicate,true);
   const loaded=await store.loadCustomer(k); assert.equal(loaded.coreState.holds.length,1);
   const changed=structuredClone(loaded.coreState); changed.holds=[];
   await fails(() => store.commitCustomer({customerKey:k,expectedRevision:loaded.revision,context:loaded.context,event:null,coreState:changed,outcome:'trial',observedAt:now}),'HQ409');
   await who('owner'); assert.equal((await db.query('select outcome from hq_referrals_private.events where customer_id=$1',[k])).rows[0].outcome,'needs_review');
  });
  let paid, paymentRequest, payment;
  await check('campanha OFF impede aprovar nova elegibilidade inclusive em fixture existente', async () => {
   const f=await fixture('pending'); await who();
   await fails(() => rpc('hq_referrals_review',{commissionId:f.id,decision:'eligible',reason:'Conferencia',expectedRevision:1,operationId:randomUUID()}),'HQ422');
   const op=randomUUID(),req={commissionId:f.id,decision:'suspended',reason:'Revisao humana',expectedRevision:1,operationId:op};
   const suspended=await rpc('hq_referrals_review',req); assert.equal(suspended.status,'suspended'); assert.deepEqual(await rpc('hq_referrals_review',req),suspended);
   await fails(() => rpc('hq_referrals_review',{...req,reason:'Texto diferente'}),'HQ409');
  });
  await check('registro manual exige confirmacao, referencia, valor e snapshot atual exatos', async () => {
   paid=await fixture(); await who(); paymentRequest={partnerId:partner.id,commissionIds:[paid.id],expectedRevisions:{[paid.id]:1},amountCents:1996,reference:'COMPROVANTE-TESTE-001',confirmation:true,operationId:randomUUID()};
   for(const patch of [{confirmation:false},{reference:''},{operationId:'x'}]) await fails(() => rpc('hq_referrals_record_payment',{...paymentRequest,...patch}),'HQ400');
   await fails(() => rpc('hq_referrals_record_payment',{...paymentRequest,amountCents:1}),'HQ409');
   await fails(() => rpc('hq_referrals_record_payment',{...paymentRequest,expectedRevisions:{[paid.id]:2}}),'HQ409');
   payment=await rpc('hq_referrals_record_payment',paymentRequest); assert.equal(payment.amountCents,1996); assert.deepEqual(payment.commissionIds,[paid.id]);
  });
  await check('retry de registro manual e idempotente e payload diferente conflita', async () => {
   assert.deepEqual(await rpc('hq_referrals_record_payment',paymentRequest),payment);
   await fails(() => rpc('hq_referrals_record_payment',{...paymentRequest,reference:'OUTRO'}),'HQ409');
   const s=await snapshot(); assert.equal(s.payments.length,1); assert.equal(s.commissions.find(c=>c.id===paid.id).paidCents,1996);
   const first=s.referrals.find(r=>r.id===paid.key).firstPayment;
   assert.equal(first.status,'unknown'); assert.equal(first.paidAt,null); assert.equal(first.amountCents,null);
  });
  await check('tabelas financeiras e auditoria nao podem ter registro reescrito ou apagado', async () => {
   await who('owner'); for(const sql of ["update hq_referrals_private.payments set reference='ALTERADO'",'delete from hq_referrals_private.payment_items','delete from hq_referrals_private.audit','delete from hq_referrals_private.commissions']) await fails(() => db.query(sql),'HQ422');
  });
  await check('nova charge do mesmo ciclo atualiza reconciliacao sem segunda comissao ou repasse', async () => {
   await who('service_role',''); const result=await processReferralEvent(store,{customerKey:paid.key,context:paid.ctx,event:event(paid.key,{id:'retry-charge',chargeId:'replacement-charge'}),serverNow:now});
   assert.equal(result.outcome,'duplicate_cycle'); await who(); const s=await snapshot(); assert.equal(s.commissions.filter(c=>c.referralId===paid.key).length,1); assert.equal(s.payments.length,1);
   assert.equal(s.commissions.find(c=>c.id===paid.id).status,'paid');
   const first=s.referrals.find(r=>r.id===paid.key).firstPayment;
   assert.equal(first.status,'verified'); assert.equal(first.amountCents,2994);
   assert.deepEqual(first.adjustments,{status:'recorded',refundedCents:0,disputeStatus:'none'});
  });
  await check('disputa aberta depois do repasse gera risco, sem divida definitiva nem novo payable', async () => {
   await who('service_role',''); await processReferralEvent(store,{customerKey:paid.key,context:paid.ctx,event:event(paid.key,{id:'open-dispute',kind:'dispute_opened',occurredAt:'2026-01-16T10:00:00.000Z'}),serverNow:now});
   await who(); const c=(await snapshot()).commissions.find(c=>c.id===paid.id); assert.deepEqual([c.status,c.paidCents,c.payableCents,c.recoverableCents,c.atRiskCents],['suspended',1996,0,0,1996]);
   const first=(await snapshot()).referrals.find(r=>r.id===paid.key).firstPayment;
   assert.equal(first.status,'verified'); assert.equal(first.adjustments.disputeStatus,'open');
  });
  await check('saldo em risco de outro item bloqueia novo registro do mesmo parceiro sem compensar', async () => {
   const f=await fixture(); await who(); await fails(() => rpc('hq_referrals_record_payment',{...paymentRequest,operationId:randomUUID(),commissionIds:[f.id],expectedRevisions:{[f.id]:1}}),'HQ422','partner_balance_requires_reconciliation');
  });
  await check('vitoria na disputa restaura situacao ja paga sem criar novo saldo', async () => {
   await who('service_role',''); await processReferralEvent(store,{customerKey:paid.key,context:paid.ctx,event:event(paid.key,{id:'won-dispute',kind:'dispute_won',occurredAt:'2026-01-16T11:00:00.000Z'}),serverNow:now});
   await who(); const c=(await snapshot()).commissions.find(c=>c.id===paid.id); assert.deepEqual([c.status,c.paidCents,c.payableCents,c.recoverableCents,c.atRiskCents],['paid',1996,0,0,0]);
   assert.equal((await snapshot()).referrals.find(r=>r.id===paid.key).firstPayment.adjustments.disputeStatus,'won');
  });
  await check('estorno parcial e integral apos pago preservam comprovante e geram recuperavel', async () => {
   await who('service_role',''); await processReferralEvent(store,{customerKey:paid.key,context:paid.ctx,event:event(paid.key,{id:'refund-partial',kind:'refund_confirmed',refundedCents:1497,occurredAt:'2026-01-16T11:20:00.000Z'}),serverNow:now});
   await who(); let s=await snapshot(),c=s.commissions.find(c=>c.id===paid.id); assert.deepEqual([c.paidCents,c.payableCents,c.recoverableCents,c.atRiskCents],[1996,0,998,0]); assert.equal(s.payments[0].reference,payment.reference);
   assert.equal(s.referrals.find(r=>r.id===paid.key).firstPayment.adjustments.refundedCents,1497);
   const financialAudit=s.audit.find(a=>a.details.commissionId===paid.id && a.details.recoverableDeltaCents===998);
   assert.ok(financialAudit); assert.deepEqual([financialAudit.details.claimableDeltaCents,financialAudit.details.paidOutCents,financialAudit.details.recoverableCents],[-998,1996,998]);
   await who('service_role',''); await processReferralEvent(store,{customerKey:paid.key,context:paid.ctx,event:event(paid.key,{id:'refund-full',kind:'refund_confirmed',refundedCents:2994,occurredAt:'2026-01-16T11:30:00.000Z'}),serverNow:now});
   await who(); s=await snapshot(); c=s.commissions.find(c=>c.id===paid.id); assert.deepEqual([c.status,c.paidCents,c.payableCents,c.recoverableCents],['reversed',1996,0,1996]); assert.deepEqual(s.payments,[payment]);
   const first=s.referrals.find(r=>r.id===paid.key).firstPayment;
   assert.equal(first.status,'verified'); assert.equal(first.amountCents,2994); assert.equal(first.adjustments.refundedCents,2994);
  });
  await check('ajuste fora de ordem preserva estorno cumulativo e primeira confirmacao', async () => {
   await who('service_role','');
   const lower=await processReferralEvent(store,{customerKey:paid.key,context:paid.ctx,event:event(paid.key,{id:'older-refund',kind:'refund_confirmed',refundedCents:100,occurredAt:'2026-01-16T11:10:00.000Z'}),serverNow:now});
   assert.equal(lower.outcome,'ignored_stale_adjustment');
   const older=await processReferralEvent(store,{customerKey:paid.key,context:paid.ctx,event:event(paid.key,{id:'older-dispute',kind:'dispute_opened',occurredAt:'2026-01-16T09:00:00.000Z'}),serverNow:now});
   assert.equal(older.outcome,'ignored_stale_adjustment');
   await who(); const first=(await snapshot()).referrals.find(r=>r.id===paid.key).firstPayment;
   assert.equal(first.status,'verified'); assert.deepEqual(first.adjustments,{status:'recorded',refundedCents:2994,disputeStatus:'won'});
  });
  await check('perda de disputa e comprovada sem transformar recebimento historico em assinatura ativa', async () => {
   const f=await fixture(); await who('service_role','');
   await processReferralEvent(store,{customerKey:f.key,context:f.ctx,event:event(f.key,{id:'verified-first-'+f.key}),serverNow:now});
   await processReferralEvent(store,{customerKey:f.key,context:f.ctx,event:event(f.key,{id:'lost-dispute-'+f.key,kind:'dispute_lost',occurredAt:'2026-01-16T11:00:00.000Z'}),serverNow:now});
   await who(); const s=await snapshot(),first=s.referrals.find(r=>r.id===f.key).firstPayment;
   assert.equal(first.status,'verified'); assert.deepEqual(first.adjustments,{status:'recorded',refundedCents:0,disputeStatus:'lost'});
   assert.equal(s.commissions.find(c=>c.id===f.id).status,'reversed');
  });
  await check('estado pago nao pode desaparecer do core ou trocar policy/partner em commit', async () => {
   await who('service_role',''); const loaded=await store.loadCustomer(paid.key),st=structuredClone(loaded.coreState); st.commissions=[];
   await fails(() => store.commitCustomer({customerKey:paid.key,expectedRevision:loaded.revision,context:loaded.context,event:null,coreState:st,outcome:'trial',observedAt:now}),'HQ409');
  });
  await check('estado antigo nao reduz estorno confirmado nem reabre comissao paga', async () => {
   const loaded=await store.loadCustomer(paid.key),st=structuredClone(loaded.coreState);
   st.commissions[0].refundedCents=0; st.commissions[0].claimableCents=1996; st.commissions[0].status='pending_review';
   await fails(() => store.commitCustomer({customerKey:paid.key,expectedRevision:loaded.revision,context:loaded.context,event:event(paid.key,{id:'stale-malicious',kind:'refund_confirmed',refundedCents:0,occurredAt:'2026-01-16T11:40:00.000Z'}),coreState:st,outcome:'commission_adjusted',observedAt:now}),'HQ400');
   assert.equal((await store.loadCustomer(paid.key)).coreState.commissions[0].refundedCents,2994);
  });
  await check('snapshot HQ omite payloads de provedor e dados de contexto e mantem campanha OFF', async () => {
   await who(); const s=await snapshot(); assert.equal(s.campaign.enabled,false); assert.ok(s.audit.length>0);
   const text=JSON.stringify(s); for(const forbidden of ['merchantAccountId','verification','coreState','trialStartedAt','chargeIds']) assert.ok(!text.includes(forbidden),forbidden);
  });
  await check('cancelamento e renovacao nao substituem primeiro recebimento nem criam comissao', async () => {
   await who(); const before=(await snapshot()).referrals.find(r=>r.id===key).firstPayment;
   await who('service_role','');
   await processReferralEvent(store,{customerKey:key,context:bound(key),event:event(key,{id:'cancel-first',kind:'subscription_canceled',occurredAt:now}),serverNow:now});
   await processReferralEvent(store,{customerKey:key,context:bound(key),event:event(key,{id:'renew-first',cycleIndex:2,invoiceId:'renewal-'+key,amountCents:4990,paidAt:now,occurredAt:now}),serverNow:now});
   await who(); const s=await snapshot(); assert.deepEqual(s.referrals.find(r=>r.id===key).firstPayment,before);
   assert.equal(s.commissions.filter(c=>c.referralId===key).length,0);
  });
  await check('primeiro recebimento em ciclo posterior ou antes do trial continua fato historico sem elegibilidade', async () => {
   for(const earlier of [false,true]) {
    const k=randomUUID(),c=bound(k),at=earlier?'2026-01-10T12:00:00.000Z':paidAt;
    c.account.firstPaidAt=at;
    await who('service_role','');
    await processReferralEvent(store,{customerKey:k,context:c,event:event(k,{cycleIndex:earlier?1:2,amountCents:earlier?2994:4990,paidAt:at,occurredAt:at}),serverNow:now});
    await who(); const s=await snapshot(),first=s.referrals.find(r=>r.id===k).firstPayment;
    assert.equal(first.status,'verified'); assert.equal(first.afterTrial,!earlier); assert.equal(first.amountCents,earlier?2994:4990);
    assert.equal(s.commissions.filter(x=>x.referralId===k).length,0); assert.equal(s.campaign.enabled,false);
   }
  });
  await check('contrato falha fechado para prova legada ausente, divergente ou nao verificada', async () => {
   // Owner insere dados artificiais incompletos para testar o leitor, nao a ingestao.
   async function legacy(patchEvent={},patchAccount={},withEvent=true) {
    const k=randomUUID(),c=bound(k); Object.assign(c.account,patchAccount);
    const ev=event(k,patchEvent); await who('owner');
    await db.query("insert into hq_referrals_private.customers(id,revision,context,core_state,partner_id,coupon_id,status) values($1,1,$2,$3,$4,$5,'paid')",[k,c,emptySalesState(),partner.id,coupon.id]);
    if(withEvent) await db.query("insert into hq_referrals_private.events(provider,merchant_id,event_id,customer_id,body,fingerprint,outcome) values($1,$2,$3,$4,$5,$5,'needs_review')",['pagarme','merchant-test',ev.id,k,ev]);
    await who(); return {k,ev,first:(await snapshot()).referrals.find(r=>r.id===k).firstPayment};
   }
   for(const [ev,account,exists] of [[{}, {},false],[{verified:false},{},true],[{}, {paymentHistoryVerified:false},true],
    [{invoiceId:'different'},{},true],[{subscriptionId:'different'},{},true],[{customerId:OTHER},{},true],
    [{currency:'USD'},{},true],[{amountCents:0},{},true],[{amountCents:'2994'},{},true],
    [{verification:{source:'untrusted',checkedAt:now}},{},true],
    [{verification:{source:'provider_api',checkedAt:'2999-01-01T00:00:00.000Z'}},{},true]]) {
    const result=await legacy(ev,account,exists); assert.equal(result.first.status,'unknown'); assert.equal(result.first.amountCents,null);
   }
   const {k,ev,first}=await legacy(); assert.equal(first.status,'verified');
   await who('owner'); await db.query("insert into hq_referrals_private.events(provider,merchant_id,event_id,customer_id,body,fingerprint,outcome) values('pagarme','merchant-test','conflicting-proof',$1,$2,$2,'needs_review')",[k,{...ev,id:'conflicting-proof',amountCents:4990}]);
   await who(); assert.equal((await snapshot()).referrals.find(r=>r.id===k).firstPayment.reason,'conflicting_first_payment_evidence');
  });
  await check('ajuste pendente nao inventa estorno zero e helper nao amplia acesso API', async () => {
   await who('service_role','');
   await processReferralEvent(store,{customerKey:paid.key,context:paid.ctx,event:event(paid.key,{id:'unknown-charge-adjustment',kind:'dispute_opened',chargeId:'unreconciled-charge',occurredAt:'2026-01-16T11:50:00.000Z'}),serverNow:now});
   await who(); const first=(await snapshot()).referrals.find(r=>r.id===paid.key).firstPayment;
   assert.equal(first.status,'verified'); assert.deepEqual(first.adjustments,{status:'unknown',refundedCents:null,disputeStatus:null});
   for(const role of ['anon','authenticated','service_role']) {
    await who(role,role==='authenticated'?ADMIN:'');
    await fails(() => db.query('select hq_referrals_private.first_payment_json(null::hq_referrals_private.customers)'),'42501');
   }
   await who('owner'); const before=await scalar('select count(*)::int from hq_referrals_private.audit');
   await who(); await snapshot(); await snapshot(); await who('owner');
   assert.equal(await scalar('select count(*)::int from hq_referrals_private.audit'),before);
  });
  await check('revogar saas_admins retira permissao na proxima RPC sem confiar em cache cliente', async () => {
   await who('owner'); await db.query('delete from public.saas_admins where user_id=$1',[ADMIN]); await who(); await fails(snapshot,'HQ403');
  });
  await check('RLS ativa em todas as tabelas e campanha nao ativavel mesmo por UPDATE owner acidental', async () => {
   await who('owner'); const rows=(await db.query("select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='hq_referrals_private' and c.relkind='r'")).rows;
   assert.equal(rows.length,10); assert.ok(rows.every(r=>r.relrowsecurity));
   await fails(() => db.query('update hq_referrals_private.campaign set enabled=true'),'23514');
  });
  console.log(count+' verificacoes SQL HQ referrals aprovadas.');
 } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
