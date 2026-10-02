-- Proposta incremental LOCAL; aplicar somente apos a migration base do ledger.
-- Nao altera a migration publicada, nao ativa campanha nem integra o gateway.
-- status/referralStatus: fluxo legado da indicacao/ledger, NAO assinatura paga.
-- firstPayment: fato historico, NAO assinante ativo, MRR ou saldo atual.
-- Compatibilidade v2: status e firstPaymentAt seguem presentes, deprecated.
-- Nao usar status='paid', comissao ou firstPaymentAt para contar conversoes.
-- firstPayment.status='verified' sustenta apenas a contagem HISTORICA observada;
-- para conversao pos-trial exigir tambem afterTrial=true e informar desconhecidos.
-- Estorno/disputa nao apagam esse fato: adjustments informa o estado registrado
-- quando ha core conciliado e evento correspondente; unknown nao significa zero.
begin;

-- Somente snapshot autorizado/owner chama este helper privado. Sem grant API.
-- Projeta evidencias existentes, sem recalcular comissao ou repetir seu motor.
create or replace function hq_referrals_private.first_payment_json(r hq_referrals_private.customers) returns jsonb
language plpgsql stable set search_path='' as $$
declare
 account jsonb := r.context->'account'; entry jsonb := r.core_state#>'{commissions,0}';
 payment jsonb; evidence jsonb; amounts integer; refund integer; dispute text;
 adjustments jsonb := jsonb_build_object('status','unknown','refundedCents',null,'disputeStatus',null);
 unknown_payment jsonb := jsonb_build_object('status','unknown','scope','historical_first_payment',
  'paidAt',null,'amountCents',null,'afterTrial',null,'adjustments',adjustments,'reason','verified_first_payment_evidence_required');
begin
 if account->'trusted' is distinct from 'true'::jsonb or account->>'customerId' is distinct from r.id::text or
  account->>'provider' not in ('pagarme','asaas') or
  account->'paymentHistoryVerified' is distinct from 'true'::jsonb or
  nullif(account->>'firstPaidInvoiceId','') is null or nullif(account->>'firstPaidAt','') is null then
  return unknown_payment;
 end if;
 -- Mesmo pagamento pode gerar varios eventos/charges. Nunca somar duplicatas.
 -- Ciclo 2 pode ser o primeiro recebimento real; elegibilidade comercial e outra decisao.
 select jsonb_agg(e.body order by e.event_id),count(distinct e.body->>'amountCents')
 into evidence,amounts from hq_referrals_private.events e
 where e.customer_id=r.id and e.body->>'kind'='payment_confirmed'
  and e.body->'verified'='true'::jsonb and e.body#>>'{verification,source}'='provider_api'
  and e.body->>'customerId'=r.id::text and e.provider=account->>'provider'
  and e.merchant_id=account->>'merchantAccountId'
  and e.body->>'provider'=e.provider and e.body->>'merchantAccountId'=e.merchant_id
  and e.body->>'subscriptionId'=account->>'subscriptionId'
  and e.body->>'invoiceId'=account->>'firstPaidInvoiceId'
  and e.body->>'paidAt'=account->>'firstPaidAt'
  and e.body->>'currency'='BRL' and jsonb_typeof(e.body->'amountCents')='number' and (e.body->>'amountCents')::integer>0
  and (e.body->>'paidAt')::timestamptz<=(e.body->>'occurredAt')::timestamptz
  and (e.body#>>'{verification,checkedAt}')::timestamptz>=(e.body->>'occurredAt')::timestamptz
  and (e.body#>>'{verification,checkedAt}')::timestamptz<=statement_timestamp();
 if evidence is null then return unknown_payment; end if;
 if amounts<>1 then return unknown_payment || jsonb_build_object('reason','conflicting_first_payment_evidence'); end if;
 payment:=evidence->0;

 -- Ajustes sao o estado aceito pelo core, corroborado pelos eventos persistidos.
 -- Sem comissao/core reconciliado (ex.: campanha OFF), ajuste fica desconhecido.
 if entry is not null and coalesce(jsonb_array_length(r.core_state->'holds'),0)=0 and entry->>'customerId'=r.id::text and
  entry->>'provider'=payment->>'provider' and entry->>'merchantAccountId'=payment->>'merchantAccountId' and
  entry->>'subscriptionId'=payment->>'subscriptionId' and entry->>'invoiceId'=payment->>'invoiceId' and
  entry->>'paidAt'=payment->>'paidAt' and entry->'paidCents'=payment->'amountCents' then
  select coalesce(jsonb_agg(jsonb_build_object('body',e.body,'outcome',e.outcome)),'[]'::jsonb) into evidence
  from hq_referrals_private.events e where e.customer_id=r.id
   and e.provider=payment->>'provider' and e.merchant_id=payment->>'merchantAccountId'
   and e.body->>'subscriptionId'=payment->>'subscriptionId' and e.body->>'invoiceId'=payment->>'invoiceId'
   and e.body->>'kind' in ('refund_confirmed','dispute_opened','dispute_won','dispute_lost');
  refund:=(entry->>'refundedCents')::integer; dispute:=entry->>'dispute';
  if refund between 0 and (payment->>'amountCents')::integer and dispute in ('none','open','won','lost')
   and not exists(select 1 from jsonb_array_elements(evidence) e where e->>'outcome' in ('needs_review','deferred')
    or e#>'{body,verified}' is distinct from 'true'::jsonb or e#>>'{body,verification,source}' is distinct from 'provider_api'
    or e#>>'{body,customerId}' is distinct from r.id::text or e#>>'{body,provider}' is distinct from payment->>'provider'
    or e#>>'{body,merchantAccountId}' is distinct from payment->>'merchantAccountId'
    or e#>'{body,amountCents}' is distinct from payment->'amountCents'
    or e#>>'{body,currency}' is distinct from 'BRL'
    or not coalesce(entry->'chargeIds' ? (e#>>'{body,chargeId}'),false)
    or (e#>>'{body,occurredAt}')::timestamptz<(payment->>'paidAt')::timestamptz
    or (e#>>'{body,verification,checkedAt}')::timestamptz<(e#>>'{body,occurredAt}')::timestamptz
    or (e#>>'{body,verification,checkedAt}')::timestamptz>statement_timestamp())
   and ((refund=0 and not exists(select 1 from jsonb_array_elements(evidence) e where e#>>'{body,kind}'='refund_confirmed' and e->>'outcome'='commission_adjusted'))
    or exists(select 1 from jsonb_array_elements(evidence) e where e->>'outcome'='commission_adjusted'
     and e#>>'{body,kind}'='refund_confirmed' and e#>'{body,refundedCents}'=entry->'refundedCents'))
   and ((dispute='none' and not exists(select 1 from jsonb_array_elements(evidence) e where e#>>'{body,kind}' like 'dispute_%' and e->>'outcome'='commission_adjusted'))
    or exists(select 1 from jsonb_array_elements(evidence) e where e->>'outcome'='commission_adjusted'
     and e#>>'{body,kind}'=case dispute when 'open' then 'dispute_opened' when 'won' then 'dispute_won' when 'lost' then 'dispute_lost' end
     and e#>>'{body,occurredAt}'=entry->>'disputeAt')) then
   adjustments:=jsonb_build_object('status','recorded','refundedCents',refund,'disputeStatus',dispute);
  end if;
 end if;
 return jsonb_build_object('status','verified','scope','historical_first_payment','paidAt',payment->>'paidAt',
  'amountCents',payment->'amountCents','afterTrial',(payment->>'paidAt')::timestamptz>=(account->>'trialEndsAt')::timestamptz,
  'adjustments',adjustments,'reason',null);
exception when data_exception then
 -- Registro legado incompleto/invalido nao vira zero nem derruba o snapshot.
 return unknown_payment;
end $$;
revoke all on function hq_referrals_private.first_payment_json(hq_referrals_private.customers) from public,anon,authenticated,service_role;

create or replace function hq_referrals_private.snapshot() returns jsonb
language plpgsql security definer set search_path='' as $$ begin
 perform hq_referrals_private.assert_admin();
 return jsonb_build_object(
 'contractVersion',2,
 'campaign',jsonb_build_object('id','personal-referrals-v1','version','personal-40-40-10-10-v1','approved',true,'enabled',false,
 'basePriceCents',4990,'discountBps',4000,'commissionBps',4000,'reserveBps',1000,'torqueBps',1000,'trialDays',14),
 'partners',coalesce((select jsonb_agg(hq_referrals_private.partner_json(p) order by p.created_at,p.id) from hq_referrals_private.partners p),'[]'::jsonb),
 'coupons',coalesce((select jsonb_agg(hq_referrals_private.coupon_json(c) order by c.created_at,c.id) from hq_referrals_private.coupons c),'[]'::jsonb),
 'referrals',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'partnerId',r.partner_id,'couponId',r.coupon_id,
 'customerLabel',coalesce(r.context->>'customerLabel','Cliente indicado'),'status',r.status,'referralStatus',r.status,'firstPayment',hq_referrals_private.first_payment_json(r),'reason',r.reason,'revision',r.revision,
 'createdAt',r.created_at,'firstPaymentAt',r.context#>>'{account,firstPaidAt}') order by r.created_at,r.id) from hq_referrals_private.customers r),'[]'::jsonb),
 'commissions',coalesce((select jsonb_agg(hq_referrals_private.commission_json(c) order by c.created_at,c.id) from hq_referrals_private.commissions c),'[]'::jsonb),
 'payments',coalesce((select jsonb_agg(hq_referrals_private.payment_json(p) order by p.created_at,p.id) from hq_referrals_private.payments p),'[]'::jsonb),
 'audit',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'action',a.action,'at',a.created_at,'actorLabel',coalesce(a.actor_id::text,'service'),
 'entityId',a.entity_id,'details',a.details) order by a.created_at,a.id) from hq_referrals_private.audit a),'[]'::jsonb));
end $$;

create or replace function hq_referrals_private.save_coupon(p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid; r hq_referrals_private.coupons; v_code text; v_status text; v_partner uuid; begin
 u:=hq_referrals_private.assert_admin(); perform hq_referrals_private.input_keys(p_input,array['id','code','partnerId','status','expectedRevision']);
 v_code:=upper(hq_referrals_private.text_value(p_input,'code',40)); v_partner:=hq_referrals_private.uuid_value(p_input,'partnerId');
 v_status:=hq_referrals_private.text_value(p_input,'status',12);
 if v_code !~ '^[A-Z0-9][A-Z0-9_-]{2,39}$' or v_status not in ('draft','ready','paused') then raise exception using errcode='HQ400',message='invalid_coupon'; end if;
 perform 1 from hq_referrals_private.partners where id=v_partner for share;
 if not found then raise exception using errcode='HQ404',message='partner_not_found'; end if;
 if p_input ? 'id' then
  select * into r from hq_referrals_private.coupons where id=hq_referrals_private.uuid_value(p_input,'id') for update;
  if not found then raise exception using errcode='HQ404',message='coupon_not_found'; end if;
  if r.revision<>hq_referrals_private.int_value(p_input,'expectedRevision') then raise exception using errcode='HQ409',message='revision_conflict'; end if;
  if (r.code<>v_code or r.partner_id<>v_partner) and exists(select 1 from hq_referrals_private.customers where coupon_id=r.id) then
   raise exception using errcode='HQ422',message='used_coupon_identity_is_immutable';
  end if;
  update hq_referrals_private.coupons set code=v_code,partner_id=v_partner,status=v_status,revision=revision+1,updated_at=now() where id=r.id returning * into r;
 else
  insert into hq_referrals_private.coupons(code,partner_id,status) values(v_code,v_partner,v_status) returning * into r;
 end if;
 insert into hq_referrals_private.audit(action,actor_id,entity_id,details) values('coupon_saved',u,r.id,jsonb_build_object('revision',r.revision,'status',r.status));
 return hq_referrals_private.coupon_json(r);
exception when unique_violation then raise exception using errcode='HQ409',message='coupon_code_exists';
end $$;

-- CREATE OR REPLACE preserva grants existentes; helper novo permanece privado.
commit;
