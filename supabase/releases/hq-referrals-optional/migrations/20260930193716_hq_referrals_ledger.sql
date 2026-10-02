-- HQ indicacoes: persistencia local revisavel, sem gateway, checkout ou repasse.
-- Criada com supabase migration new. NAO aplicar remotamente nesta rodada.
-- O schema privado nao deve ser adicionado aos schemas expostos pelo PostgREST.
begin;
create schema if not exists hq_referrals_private;
revoke all on schema hq_referrals_private from public, anon, authenticated, service_role;
grant usage on schema hq_referrals_private to authenticated, service_role;

create table hq_referrals_private.campaign (
  id text primary key check (id = 'personal-referrals-v1'),
  approved boolean not null check (approved),
  enabled boolean not null default false check (not enabled),
  policy jsonb not null,
  created_at timestamptz not null default now()
);
insert into hq_referrals_private.campaign(id,approved,enabled,policy) values (
 'personal-referrals-v1',true,false,
 '{"version":"personal-40-40-10-10-v1","campaignId":"personal-referrals-v1","status":"approved","enabled":false,"basePriceCents":4990,"trialDays":14,"commissionBasis":"full_price","discountBps":4000,"commissionBps":4000,"operatingReserveBps":1000,"remainderBps":1000}'::jsonb
);
-- Confirmacao comercial e ativacao operacional sao distintas. Nenhuma RPC liga
-- enabled; a constraint exige uma futura migration deliberada para ativar.
create table hq_referrals_private.partners (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 120),
 contact text not null default '' check(length(contact)<=240),
 status text not null check(status in ('active','paused')), revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table hq_referrals_private.coupons (
 id uuid primary key default gen_random_uuid(), code text not null unique check(code ~ '^[A-Z0-9][A-Z0-9_-]{2,39}$'),
 partner_id uuid not null references hq_referrals_private.partners(id),
 status text not null check(status in ('draft','ready','paused')), revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table hq_referrals_private.customers (
 id uuid primary key, -- identidade canonica resolvida pelo servidor, nao id fornecido pelo navegador
 revision integer not null check(revision>0), context jsonb not null, core_state jsonb not null,
 partner_id uuid references hq_referrals_private.partners(id), coupon_id uuid references hq_referrals_private.coupons(id),
 status text not null check(status in ('trial','pending','needs_review','deferred','paid','reversed','suspended')),
 reason text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table hq_referrals_private.events (
 provider text not null, merchant_id text not null, event_id text not null,
 customer_id uuid not null references hq_referrals_private.customers(id),
 body jsonb not null, fingerprint jsonb not null,
 outcome text not null, reason text, first_observed_at timestamptz not null default now(),
 last_processed_at timestamptz not null default now(), attempts integer not null default 1,
 primary key(provider,merchant_id,event_id)
);
create index hq_referral_events_customer_idx on hq_referrals_private.events(customer_id);
create table hq_referrals_private.commissions (
 id uuid primary key default gen_random_uuid(), customer_id uuid not null unique references hq_referrals_private.customers(id),
 partner_id uuid not null references hq_referrals_private.partners(id), coupon_id uuid not null references hq_referrals_private.coupons(id),
 core_id text not null, core_entry jsonb not null,
 status text not null check(status in ('pending','eligible','paid','reversed','suspended')),
 amount_cents integer not null check(amount_cents=1996), claimable_cents integer not null check(claimable_cents between 0 and 1996),
 paid_cents integer not null default 0 check(paid_cents between 0 and 1996),
 recoverable_cents integer not null default 0 check(recoverable_cents between 0 and 1996),
 at_risk_cents integer not null default 0 check(at_risk_cents between 0 and 1996),
 eligible_at timestamptz not null, revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index hq_referral_commissions_partner_idx on hq_referrals_private.commissions(partner_id,status);
create table hq_referrals_private.payments (
 id uuid primary key default gen_random_uuid(), partner_id uuid not null references hq_referrals_private.partners(id),
 amount_cents integer not null check(amount_cents>0), reference text not null check(length(reference) between 1 and 160),
 operation_id uuid not null unique, actor_id uuid not null, created_at timestamptz not null default now()
);
create table hq_referrals_private.payment_items (
 payment_id uuid not null references hq_referrals_private.payments(id), commission_id uuid not null references hq_referrals_private.commissions(id),
 amount_cents integer not null check(amount_cents>0), primary key(payment_id,commission_id)
);
create table hq_referrals_private.audit (
 id uuid primary key default gen_random_uuid(), action text not null, actor_id uuid,
 entity_id uuid, details jsonb not null default '{}', created_at timestamptz not null default now()
);
create table hq_referrals_private.operations (
 id uuid primary key, action text not null, actor_id uuid not null, payload jsonb not null, response jsonb not null,
 created_at timestamptz not null default now()
);

-- Nenhum papel de API recebe SELECT/INSERT/UPDATE/DELETE direto, nem o admin HQ.
do $$ declare t text; begin
 foreach t in array array['campaign','partners','coupons','customers','events','commissions','payments','payment_items','audit','operations'] loop
  execute format('alter table hq_referrals_private.%I enable row level security',t);
  execute format('revoke all on hq_referrals_private.%I from public, anon, authenticated, service_role',t);
 end loop;
end $$;

create function hq_referrals_private.immutable_history() returns trigger
language plpgsql set search_path='' as $$ begin
 raise exception using errcode='HQ422',message='immutable_financial_history';
end $$;
create trigger hq_payment_immutable before update or delete on hq_referrals_private.payments for each row execute function hq_referrals_private.immutable_history();
create trigger hq_payment_items_immutable before update or delete on hq_referrals_private.payment_items for each row execute function hq_referrals_private.immutable_history();
create trigger hq_audit_immutable before update or delete on hq_referrals_private.audit for each row execute function hq_referrals_private.immutable_history();
create trigger hq_operations_immutable before update or delete on hq_referrals_private.operations for each row execute function hq_referrals_private.immutable_history();
create trigger hq_commission_no_delete before delete on hq_referrals_private.commissions for each row execute function hq_referrals_private.immutable_history();

create function hq_referrals_private.assert_admin() returns uuid
language plpgsql set search_path='' as $$ declare u uuid := auth.uid(); begin
 if u is null or public.hq_sou_admin() is distinct from true then
  raise exception using errcode='HQ403',message='hq_admin_required';
 end if;
 return u;
end $$;
create function hq_referrals_private.assert_service() returns void
language plpgsql set search_path='' as $$ begin
 if current_setting('role',true) is distinct from 'service_role' then
  raise exception using errcode='HQ403',message='service_role_required';
 end if;
end $$;
create function hq_referrals_private.input_keys(j jsonb, allowed text[]) returns void
language plpgsql set search_path='' as $$ begin
 if jsonb_typeof(j) is distinct from 'object' or exists(select 1 from jsonb_object_keys(j) k where not(k=any(allowed))) then
  raise exception using errcode='HQ400',message='invalid_input_fields';
 end if;
end $$;
create function hq_referrals_private.text_value(j jsonb,k text,lim integer,required boolean default true) returns text
language plpgsql set search_path='' as $$ declare v text; begin
 if (j->k is null or j->k='null'::jsonb) and not required then return ''; end if;
 if jsonb_typeof(j->k) is distinct from 'string' then raise exception using errcode='HQ400',message='invalid_'||k; end if;
 v := btrim(j->>k);
 if length(v)>lim or (required and length(v)=0) then raise exception using errcode='HQ400',message='invalid_'||k; end if;
 return v;
end $$;
create function hq_referrals_private.int_value(j jsonb,k text) returns integer
language plpgsql set search_path='' as $$ begin
 if jsonb_typeof(j->k) is distinct from 'number' or (j->>k)!~'^[0-9]{1,9}$' then
  raise exception using errcode='HQ400',message='invalid_'||k;
 end if;
 return (j->>k)::integer;
end $$;
create function hq_referrals_private.uuid_value(j jsonb,k text) returns uuid
language plpgsql set search_path='' as $$ declare v text; begin
 v := hq_referrals_private.text_value(j,k,36);
 if v !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
  raise exception using errcode='HQ400',message='invalid_'||k;
 end if;
 return v::uuid;
end $$;
create function hq_referrals_private.partner_json(r hq_referrals_private.partners) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('id',r.id,'name',r.name,'contact',r.contact,'status',r.status,'revision',r.revision);
$$;
create function hq_referrals_private.coupon_json(r hq_referrals_private.coupons) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('id',r.id,'code',r.code,'partnerId',r.partner_id,'status',r.status,'revision',r.revision);
$$;
create function hq_referrals_private.commission_json(r hq_referrals_private.commissions) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('id',r.id,'partnerId',r.partner_id,'referralId',r.customer_id,'status',r.status,
 'amountCents',r.amount_cents,'payableCents',case when r.status='eligible' then greatest(r.claimable_cents-r.paid_cents,0) else 0 end,
 'paidCents',r.paid_cents,'recoverableCents',r.recoverable_cents,'atRiskCents',r.at_risk_cents,'revision',r.revision,'eligibleAt',r.eligible_at);
$$;
create function hq_referrals_private.payment_json(r hq_referrals_private.payments) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',r.id,'partnerId',r.partner_id,'amountCents',r.amount_cents,'reference',r.reference,
 'createdAt',r.created_at,'operationId',r.operation_id,'commissionIds',coalesce((select jsonb_agg(i.commission_id order by i.commission_id) from hq_referrals_private.payment_items i where i.payment_id=r.id),'[]'::jsonb));
$$;
create function hq_referrals_private.snapshot() returns jsonb
language plpgsql security definer set search_path='' as $$ begin
 perform hq_referrals_private.assert_admin();
 return jsonb_build_object(
 'campaign',jsonb_build_object('id','personal-referrals-v1','version','personal-40-40-10-10-v1','approved',true,'enabled',false,
 'basePriceCents',4990,'discountBps',4000,'commissionBps',4000,'reserveBps',1000,'torqueBps',1000,'trialDays',14),
 'partners',coalesce((select jsonb_agg(hq_referrals_private.partner_json(p) order by p.created_at,p.id) from hq_referrals_private.partners p),'[]'::jsonb),
 'coupons',coalesce((select jsonb_agg(hq_referrals_private.coupon_json(c) order by c.created_at,c.id) from hq_referrals_private.coupons c),'[]'::jsonb),
 'referrals',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'partnerId',r.partner_id,'couponId',r.coupon_id,
 'customerLabel',coalesce(r.context->>'customerLabel','Cliente indicado'),'status',r.status,'reason',r.reason,'revision',r.revision,
 'createdAt',r.created_at,'firstPaymentAt',r.context#>>'{account,firstPaidAt}') order by r.created_at,r.id) from hq_referrals_private.customers r),'[]'::jsonb),
 'commissions',coalesce((select jsonb_agg(hq_referrals_private.commission_json(c) order by c.created_at,c.id) from hq_referrals_private.commissions c),'[]'::jsonb),
 'payments',coalesce((select jsonb_agg(hq_referrals_private.payment_json(p) order by p.created_at,p.id) from hq_referrals_private.payments p),'[]'::jsonb),
 'audit',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'action',a.action,'at',a.created_at,'actorLabel',coalesce(a.actor_id::text,'service'),
 'entityId',a.entity_id,'details',a.details) order by a.created_at,a.id) from hq_referrals_private.audit a),'[]'::jsonb));
end $$;

create function hq_referrals_private.save_partner(p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid; r hq_referrals_private.partners; v_name text; v_contact text; v_status text; begin
 u:=hq_referrals_private.assert_admin();
 perform hq_referrals_private.input_keys(p_input,array['id','name','contact','status','expectedRevision']);
 v_name:=hq_referrals_private.text_value(p_input,'name',120); v_contact:=hq_referrals_private.text_value(p_input,'contact',240,false);
 v_status:=hq_referrals_private.text_value(p_input,'status',12);
 if v_status not in ('active','paused') then raise exception using errcode='HQ400',message='invalid_status'; end if;
 if p_input ? 'id' then
  select * into r from hq_referrals_private.partners where id=hq_referrals_private.uuid_value(p_input,'id') for update;
  if not found then raise exception using errcode='HQ404',message='partner_not_found'; end if;
  if r.revision<>hq_referrals_private.int_value(p_input,'expectedRevision') then raise exception using errcode='HQ409',message='revision_conflict'; end if;
  update hq_referrals_private.partners set name=v_name,contact=v_contact,status=v_status,revision=revision+1,updated_at=now() where id=r.id returning * into r;
 else
  insert into hq_referrals_private.partners(name,contact,status) values(v_name,v_contact,v_status) returning * into r;
 end if;
 insert into hq_referrals_private.audit(action,actor_id,entity_id,details) values('partner_saved',u,r.id,jsonb_build_object('revision',r.revision,'status',r.status));
 return hq_referrals_private.partner_json(r);
end $$;
create function hq_referrals_private.save_coupon(p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid; r hq_referrals_private.coupons; v_code text; v_status text; v_partner uuid; begin
 u:=hq_referrals_private.assert_admin(); perform hq_referrals_private.input_keys(p_input,array['id','code','partnerId','status','expectedRevision']);
 v_code:=upper(hq_referrals_private.text_value(p_input,'code',48)); v_partner:=hq_referrals_private.uuid_value(p_input,'partnerId');
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

create function hq_referrals_private.review(p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid; op uuid; oldop hq_referrals_private.operations; r hq_referrals_private.commissions; decision text; reason text; result jsonb; begin
 u:=hq_referrals_private.assert_admin(); perform hq_referrals_private.input_keys(p_input,array['commissionId','decision','reason','expectedRevision','operationId']);
 op:=hq_referrals_private.uuid_value(p_input,'operationId'); decision:=hq_referrals_private.text_value(p_input,'decision',20); reason:=hq_referrals_private.text_value(p_input,'reason',500);
 if decision not in ('eligible','suspended') then raise exception using errcode='HQ400',message='invalid_decision'; end if;
 perform pg_advisory_xact_lock(hashtextextended(op::text,0));
 select * into oldop from hq_referrals_private.operations where id=op;
 if found then
  if oldop.action<>'review' or oldop.actor_id<>u or oldop.payload<>p_input then raise exception using errcode='HQ409',message='operation_payload_conflict'; end if;
  return oldop.response;
 end if;
 select * into r from hq_referrals_private.commissions where id=hq_referrals_private.uuid_value(p_input,'commissionId') for update;
 if not found then raise exception using errcode='HQ404',message='commission_not_found'; end if;
 if r.revision<>hq_referrals_private.int_value(p_input,'expectedRevision') then raise exception using errcode='HQ409',message='revision_conflict'; end if;
 if r.status not in ('pending','eligible','suspended') or r.paid_cents>0 then raise exception using errcode='HQ422',message='commission_not_reviewable'; end if;
 if decision='eligible' and (
  not (select enabled from hq_referrals_private.campaign where id='personal-referrals-v1') or
  r.eligible_at>now() or r.claimable_cents<=0 or r.core_entry->>'status'<>'pending_review' or r.core_entry->>'dispute' in ('open','lost') or
  exists(select 1 from hq_referrals_private.customers c where c.id=r.customer_id and jsonb_array_length(c.core_state->'holds')>0) or
  exists(select 1 from hq_referrals_private.events e where e.customer_id=r.customer_id and e.outcome in ('needs_review','deferred'))
 ) then raise exception using errcode='HQ422',message='commission_not_eligible'; end if;
 update hq_referrals_private.commissions set status=decision,revision=revision+1,updated_at=now() where id=r.id returning * into r;
 result:=hq_referrals_private.commission_json(r);
 insert into hq_referrals_private.audit(action,actor_id,entity_id,details) values('commission_reviewed',u,r.id,jsonb_build_object('decision',decision,'reason',reason,'revision',r.revision,'operationId',op));
 insert into hq_referrals_private.operations(id,action,actor_id,payload,response) values(op,'review',u,p_input,result);
 return result;
end $$;

create function hq_referrals_private.record_payment(p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid; op uuid; oldop hq_referrals_private.operations; partner uuid; ids uuid[]; r hq_referrals_private.commissions;
 p hq_referrals_private.payments; reference text; total bigint:=0; n integer:=0; result jsonb; item jsonb; begin
 u:=hq_referrals_private.assert_admin(); perform hq_referrals_private.input_keys(p_input,array['partnerId','commissionIds','expectedRevisions','amountCents','reference','confirmation','operationId']);
 if p_input->'confirmation' is distinct from 'true'::jsonb then raise exception using errcode='HQ400',message='explicit_confirmation_required'; end if;
 op:=hq_referrals_private.uuid_value(p_input,'operationId'); partner:=hq_referrals_private.uuid_value(p_input,'partnerId');
 reference:=hq_referrals_private.text_value(p_input,'reference',160);
 if jsonb_typeof(p_input->'commissionIds') is distinct from 'array' or jsonb_array_length(p_input->'commissionIds') not between 1 and 100 or jsonb_typeof(p_input->'expectedRevisions') is distinct from 'object' then
  raise exception using errcode='HQ400',message='invalid_commission_batch';
 end if;
 ids:='{}';
 for item in select value from jsonb_array_elements(p_input->'commissionIds') loop
  ids:=array_append(ids,hq_referrals_private.uuid_value(jsonb_build_object('id',item),'id'));
 end loop;
 -- O lote e o snapshot de revisoes devem nomear exatamente as mesmas comissoes.
 if cardinality(ids)<>(select count(distinct x) from unnest(ids) x) or (select count(*) from jsonb_object_keys(p_input->'expectedRevisions'))<>cardinality(ids) then
  raise exception using errcode='HQ400',message='duplicate_or_mismatched_commission_ids';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(op::text,0));
 select * into oldop from hq_referrals_private.operations where id=op;
 if found then
  if oldop.action<>'record_payment' or oldop.actor_id<>u or oldop.payload<>p_input then raise exception using errcode='HQ409',message='operation_payload_conflict'; end if;
  return oldop.response;
 end if;
 -- Mesmas linhas bloqueadas pelo commit de eventos; ordem fixa evita deadlock de lotes.
 perform pg_advisory_xact_lock(hashtextextended('partner:'||partner::text,0));
 -- Nenhuma compensacao automatica de divida/risco de outro item do parceiro.
 if exists(select 1 from hq_referrals_private.commissions where partner_id=partner and (recoverable_cents>0 or at_risk_cents>0)) then
  raise exception using errcode='HQ422',message='partner_balance_requires_reconciliation';
 end if;
 for r in select * from hq_referrals_private.commissions where id=any(ids) order by id for update loop
  n:=n+1;
  if r.revision<>hq_referrals_private.int_value(p_input->'expectedRevisions',r.id::text) then raise exception using errcode='HQ409',message='revision_conflict'; end if;
  if r.partner_id<>partner or r.status<>'eligible' or r.eligible_at>now() or r.claimable_cents<=r.paid_cents or r.recoverable_cents>0 or r.at_risk_cents>0 or r.core_entry->>'status'<>'pending_review' or
   exists(select 1 from hq_referrals_private.events e where e.customer_id=r.customer_id and e.outcome in ('needs_review','deferred')) then
   raise exception using errcode='HQ422',message='commission_not_payable';
  end if;
  total:=total+r.claimable_cents-r.paid_cents;
 end loop;
 if n<>cardinality(ids) then raise exception using errcode='HQ404',message='commission_not_found'; end if;
 if total<>hq_referrals_private.int_value(p_input,'amountCents') or total<=0 then raise exception using errcode='HQ409',message='payment_amount_conflict'; end if;
 -- Registro de um pagamento externo JA REALIZADO: nenhuma transferencia/API.
 insert into hq_referrals_private.payments(partner_id,amount_cents,reference,operation_id,actor_id) values(partner,total::integer,reference,op,u) returning * into p;
 insert into hq_referrals_private.payment_items(payment_id,commission_id,amount_cents)
  select p.id,id,claimable_cents-paid_cents from hq_referrals_private.commissions where id=any(ids);
 update hq_referrals_private.commissions set paid_cents=claimable_cents,status='paid',revision=revision+1,updated_at=now() where id=any(ids);
 result:=hq_referrals_private.payment_json(p);
 insert into hq_referrals_private.audit(action,actor_id,entity_id,details) values('external_payment_recorded',u,p.id,jsonb_build_object('amountCents',total,'operationId',op,'commissionIds',to_jsonb(ids)));
 insert into hq_referrals_private.operations(id,action,actor_id,payload,response) values(op,'record_payment',u,p_input,result);
 return result;
end $$;

create unique index hq_referral_provider_customer_unique on hq_referrals_private.customers
 ((context#>>'{account,provider}'),(context#>>'{account,merchantAccountId}'),(context#>>'{account,customerId}'));
create unique index hq_referral_invoice_unique on hq_referrals_private.commissions
 ((core_entry->>'provider'),(core_entry->>'merchantAccountId'),(core_entry->>'subscriptionId'),(core_entry->>'invoiceId'));

create function hq_referrals_private.load_customer(p_customer_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$ declare r hq_referrals_private.customers; begin
 perform hq_referrals_private.assert_service();
 if p_customer_key is null then raise exception using errcode='HQ400',message='customer_key_required'; end if;
 select * into r from hq_referrals_private.customers where id=p_customer_key;
 return jsonb_build_object('revision',coalesce(r.revision,0),'context',r.context,
 'coreState',coalesce(r.core_state,'{"schemaVersion":1,"events":[],"commissions":[],"holds":[],"audit":[]}'::jsonb),
 'campaign',(select jsonb_build_object('approved',approved,'enabled',enabled,'policy',policy) from hq_referrals_private.campaign where id='personal-referrals-v1'));
end $$;

create function hq_referrals_private.commit_customer(p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 key uuid; expected integer; ctx jsonb; st jsonb; ev jsonb; fp jsonb; account jsonb; attr jsonb; policy jsonb;
 old hq_referrals_private.customers; receipt hq_referrals_private.events; coupon hq_referrals_private.coupons;
 ledger hq_referrals_private.commissions; entry jsonb; previous jsonb; outcome text; reason text; observed timestamptz;
 partner uuid; coupon_id uuid; existed boolean; entry_changed boolean; financial_changed boolean; next_status text;
 claim integer; refund integer; remaining integer; recovery integer; risk integer; result jsonb;
 prior_claim integer:=0; prior_recovery integer:=0; prior_risk integer:=0;
begin
 perform hq_referrals_private.assert_service();
 perform hq_referrals_private.input_keys(p_input,array['customerKey','expectedRevision','context','event','coreState','outcome','reason','observedAt']);
 key:=hq_referrals_private.uuid_value(p_input,'customerKey'); expected:=hq_referrals_private.int_value(p_input,'expectedRevision');
 ctx:=p_input->'context'; st:=p_input->'coreState'; ev:=nullif(p_input->'event','null'::jsonb);
 outcome:=hq_referrals_private.text_value(p_input,'outcome',80); reason:=hq_referrals_private.text_value(p_input,'reason',500,false);
 observed:=hq_referrals_private.text_value(p_input,'observedAt',40)::timestamptz;
 if observed>clock_timestamp() then raise exception using errcode='HQ400',message='future_observation'; end if;
 perform hq_referrals_private.input_keys(ctx,array['account','attribution','policy','customerLabel']);
 account:=ctx->'account'; attr:=nullif(ctx->'attribution','null'::jsonb); policy:=ctx->'policy';
 perform hq_referrals_private.input_keys(account,array['trusted','customerId','provider','merchantAccountId','subscriptionId','trialStartedAt','trialEndsAt','paymentHistoryVerified','firstPaidInvoiceId','firstPaidAt']);
 if account->'trusted' is distinct from 'true'::jsonb or account->>'customerId' is distinct from key::text or
  (account->>'trialEndsAt')::timestamptz is null or (account->>'trialStartedAt')::timestamptz is null or
  (account->>'trialEndsAt')::timestamptz<>(account->>'trialStartedAt')::timestamptz+interval '14 days' or
  (account->>'trialStartedAt')::timestamptz>observed then raise exception using errcode='HQ400',message='invalid_canonical_account'; end if;
 -- customerId e a identidade Torque estavel, igual a customerKey. Nenhum ID de
 -- provedor e necessario para iniciar o trial; primeiro evento vincula os tres.
 if account->>'provider' is null then
  if account->>'merchantAccountId' is not null or account->>'subscriptionId' is not null or ev is not null then
   raise exception using errcode='HQ400',message='incomplete_provider_binding';
  end if;
 elsif account->>'provider' not in ('pagarme','asaas') or coalesce(length(account->>'merchantAccountId'),0) not between 1 and 160 or coalesce(length(account->>'subscriptionId'),0) not between 1 and 160 then
  raise exception using errcode='HQ400',message='incomplete_provider_binding';
 end if;
 if ctx ? 'customerLabel' then perform hq_referrals_private.text_value(ctx,'customerLabel',120); end if;
 perform hq_referrals_private.input_keys(policy,array['version','campaignId','status','enabled','approval','basePriceCents','trialDays','commissionBasis','discountBps','commissionBps','operatingReserveBps','remainderBps']);
 if not policy @> '{"version":"personal-40-40-10-10-v1","campaignId":"personal-referrals-v1","status":"approved","basePriceCents":4990,"trialDays":14,"commissionBasis":"full_price","discountBps":4000,"commissionBps":4000,"operatingReserveBps":1000,"remainderBps":1000}'::jsonb then
  raise exception using errcode='HQ400',message='unsupported_policy';
 end if;
 perform hq_referrals_private.input_keys(st,array['schemaVersion','events','commissions','holds','audit']);
 if st->'schemaVersion' is distinct from '1'::jsonb or jsonb_typeof(st->'events') is distinct from 'array' or jsonb_typeof(st->'commissions') is distinct from 'array' or
  jsonb_typeof(st->'holds') is distinct from 'array' or jsonb_typeof(st->'audit') is distinct from 'array' or jsonb_array_length(st->'commissions')>1 then
  raise exception using errcode='HQ400',message='invalid_core_state';
 end if;
 if ev is not null then
  perform hq_referrals_private.input_keys(ev,array['id','provider','kind','verified','verification','merchantAccountId','customerId','subscriptionId','invoiceId','cycleIndex','chargeId','currency','amountCents','paidAt','occurredAt','refundedCents']);
  perform hq_referrals_private.text_value(ev,'kind',40); perform hq_referrals_private.text_value(ev,'invoiceId',160); perform hq_referrals_private.text_value(ev,'chargeId',160);
  perform hq_referrals_private.int_value(ev,'amountCents');
  if hq_referrals_private.int_value(ev,'cycleIndex')<1 then raise exception using errcode='HQ400',message='invalid_cycle'; end if;
  perform hq_referrals_private.text_value(ev,'occurredAt',40); perform hq_referrals_private.text_value(ev->'verification','checkedAt',40);
  if ev->'verified' is distinct from 'true'::jsonb or ev#>>'{verification,source}' is distinct from 'provider_api' or
   ev->>'provider' is distinct from account->>'provider' or ev->>'merchantAccountId' is distinct from account->>'merchantAccountId' or
   ev->>'customerId' is distinct from account->>'customerId' or ev->>'subscriptionId' is distinct from account->>'subscriptionId' or
   ev->>'currency' is distinct from 'BRL' or coalesce(length(ev->>'id'),0) not between 1 and 160 or
   ev->>'kind' not in ('payment_confirmed','payment_failed','subscription_canceled','refund_confirmed','dispute_opened','dispute_won','dispute_lost') or
   (ev->>'occurredAt')::timestamptz>observed or (ev#>>'{verification,checkedAt}')::timestamptz>observed then
   raise exception using errcode='HQ400',message='invalid_normalized_event';
  end if;
  -- Apenas o futuro adapter verificado pode fornecer estes dados. O marcador
  -- verified nao autentica evento recebido do navegador ou webhook externo.
  fp:=ev-'verified'-'verification';
  perform pg_advisory_xact_lock(hashtextextended('event:'||(ev->>'provider')||':'||(ev->>'merchantAccountId')||':'||(ev->>'id'),0));
  select * into receipt from hq_referrals_private.events where provider=ev->>'provider' and merchant_id=ev->>'merchantAccountId' and event_id=ev->>'id';
  if found and (receipt.customer_id<>key or receipt.fingerprint<>fp) then raise exception using errcode='HQ409',message='event_payload_conflict'; end if;
 end if;
 -- Serializa inclusive o primeiro INSERT, quando ainda nao existe linha para FOR UPDATE.
 perform pg_advisory_xact_lock(hashtextextended('customer:'||key::text,0));
 select * into old from hq_referrals_private.customers where id=key for update; existed:=found;
 if ev is not null and receipt.event_id is not null and receipt.outcome not in ('needs_review','deferred') then
  return jsonb_build_object('revision',old.revision,'outcome','duplicate_event','duplicate',true);
 end if;
 if receipt.event_id is not null and receipt.outcome in ('needs_review','deferred') and outcome='duplicate_event' then
  return jsonb_build_object('revision',old.revision,'outcome',receipt.outcome,'duplicate',true);
 end if;
 if coalesce(old.revision,0)<>expected then raise exception using errcode='HQ409',message='revision_conflict'; end if;
 if existed then
  if (old.context-'account')<>(ctx-'account') or
   (case when old.context#>>'{account,provider}' is null and ev is not null then
    ((old.context->'account')-array['paymentHistoryVerified','firstPaidInvoiceId','firstPaidAt','provider','merchantAccountId','subscriptionId'])<>(account-array['paymentHistoryVerified','firstPaidInvoiceId','firstPaidAt','provider','merchantAccountId','subscriptionId'])
    else ((old.context->'account')-array['paymentHistoryVerified','firstPaidInvoiceId','firstPaidAt'])<>(account-array['paymentHistoryVerified','firstPaidInvoiceId','firstPaidAt']) end) or
   (jsonb_array_length(old.core_state->'commissions')>0 and old.context->'account'<>account) then
   raise exception using errcode='HQ409',message='canonical_context_is_immutable';
  end if;
  if not ((st->'events') @> (old.core_state->'events')) or not ((st->'holds') @> (old.core_state->'holds')) or not ((st->'audit') @> (old.core_state->'audit')) or
   jsonb_array_length(st->'commissions')<jsonb_array_length(old.core_state->'commissions') then
   raise exception using errcode='HQ409',message='core_history_cannot_be_removed';
  end if;
 else
  if policy->'enabled' is distinct from 'false'::jsonb then raise exception using errcode='HQ422',message='campaign_inactive'; end if;
  if ev is null and account->>'provider' is not null then raise exception using errcode='HQ400',message='provider_binding_requires_event'; end if;
 end if;
 if attr is not null then
  perform hq_referrals_private.input_keys(attr,array['trusted','source','code','couponId','partnerId','campaignId','policyVersion','assignedAt']);
  perform hq_referrals_private.text_value(attr,'source',8); perform hq_referrals_private.text_value(attr,'assignedAt',40);
  partner:=hq_referrals_private.uuid_value(attr,'partnerId'); coupon_id:=hq_referrals_private.uuid_value(attr,'couponId');
  select * into coupon from hq_referrals_private.coupons where id=coupon_id for share;
  if not found or coupon.partner_id<>partner or coupon.code is distinct from attr->>'code' or attr->'trusted' is distinct from 'true'::jsonb or
   attr->>'source' not in ('code','link') or attr->>'campaignId' is distinct from policy->>'campaignId' or attr->>'policyVersion' is distinct from policy->>'version' or
   (attr->>'assignedAt')::timestamptz>observed then raise exception using errcode='HQ400',message='invalid_canonical_attribution'; end if;
  if not existed and (coupon.status<>'ready' or not exists(select 1 from hq_referrals_private.partners where id=partner and status='active')) then
   raise exception using errcode='HQ422',message='coupon_not_ready';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('partner:'||partner::text,0));
 end if;
 entry:=st#>'{commissions,0}'; previous:=old.core_state#>'{commissions,0}';
 if entry is not null then
  if previous is null and not(select enabled from hq_referrals_private.campaign where id='personal-referrals-v1') then raise exception using errcode='HQ422',message='campaign_inactive'; end if;
  if partner is null or attr->>'source'<>'code' or entry->'attribution' is distinct from attr or entry->'policySnapshot' is distinct from policy or
   entry->>'customerId' is distinct from account->>'customerId' or entry->>'provider' is distinct from account->>'provider' or
   entry->>'merchantAccountId' is distinct from account->>'merchantAccountId' or entry->>'subscriptionId' is distinct from account->>'subscriptionId' or
   entry->>'invoiceId' is distinct from account->>'firstPaidInvoiceId' or entry->>'paidAt' is distinct from account->>'firstPaidAt' or
   account->'paymentHistoryVerified' is distinct from 'true'::jsonb or entry->'cycleIndex' is distinct from '1'::jsonb or
   entry->'originalCommissionCents' is distinct from '1996'::jsonb or entry->'paidCents' is distinct from '2994'::jsonb or
   entry->>'trialEndsAt' is distinct from account->>'trialEndsAt' or (entry->>'paidAt')::timestamptz<(account->>'trialEndsAt')::timestamptz or
   (entry->>'paidAt')::timestamptz>observed or jsonb_typeof(entry->'chargeIds') is distinct from 'array' or jsonb_array_length(entry->'chargeIds')=0 then
   raise exception using errcode='HQ400',message='invalid_commission_projection';
  end if;
  if previous is not null and ((entry-array['claimableCents','refundedCents','status','dispute','disputeAt','chargeIds'])<>(previous-array['claimableCents','refundedCents','status','dispute','disputeAt','chargeIds']) or not((entry->'chargeIds') @> (previous->'chargeIds'))) then
   raise exception using errcode='HQ409',message='commission_identity_is_immutable';
  end if;
  claim:=hq_referrals_private.int_value(entry,'claimableCents'); refund:=hq_referrals_private.int_value(entry,'refundedCents');
  if claim>1996 or refund>2994 or (previous is not null and refund<(previous->>'refundedCents')::integer) or entry->>'status' not in ('pending_review','suspended','reverted') or
   (entry->>'status' in ('suspended','reverted') and claim<>0) or entry->>'dispute' not in ('none','open','won','lost') then
   raise exception using errcode='HQ400',message='invalid_commission_amount_or_status';
  end if;
 end if;
 if ev is null and (outcome<>'trial' or (existed and st<>old.core_state) or (not existed and st<>'{"schemaVersion":1,"events":[],"commissions":[],"holds":[],"audit":[]}'::jsonb)) then
  raise exception using errcode='HQ400',message='registration_cannot_create_commission';
 end if;
 if not existed then
  insert into hq_referrals_private.customers(id,revision,context,core_state,partner_id,coupon_id,status,reason)
   values(key,1,ctx,st,partner,coupon_id,case when outcome in ('needs_review','deferred') then outcome else 'trial' end,reason);
 else
  update hq_referrals_private.customers set revision=revision+1,context=ctx,core_state=st,updated_at=now(),
   status=case when ev is null then old.status when outcome in ('needs_review','deferred') then outcome else status end,
   reason=case when ev is null then old.reason else p_input->>'reason' end where id=key;
 end if;
 if entry is not null then
  select * into ledger from hq_referrals_private.commissions where customer_id=key for update;
  prior_claim:=coalesce(ledger.claimable_cents,0); prior_recovery:=coalesce(ledger.recoverable_cents,0); prior_risk:=coalesce(ledger.at_risk_cents,0);
  if not found then
   insert into hq_referrals_private.commissions(customer_id,partner_id,coupon_id,core_id,core_entry,status,amount_cents,claimable_cents,eligible_at)
    values(key,partner,coupon_id,entry->>'id',entry,'pending',1996,claim,greatest((entry->>'paidAt')::timestamptz,(entry->>'trialEndsAt')::timestamptz)) returning * into ledger;
  elsif ledger.core_entry<>entry then
   financial_changed:=(ledger.core_entry-array['chargeIds'])<>(entry-array['chargeIds']);
   -- Recuperavel definitivo: estorno/perda. Disputa aberta e risco separado.
   remaining:=case when entry->>'dispute'='lost' then 0 else floor((1996::numeric*(2994-refund)+1497)/2994)::integer end;
   recovery:=greatest(ledger.paid_cents-remaining,0);
   risk:=case when entry->>'dispute'='open' then least(ledger.paid_cents,remaining) else 0 end;
   next_status:=case when not financial_changed then ledger.status when entry->>'status'='reverted' then 'reversed'
    when entry->>'status'='suspended' then 'suspended' when ledger.paid_cents>=claim and ledger.paid_cents>0 then 'paid' else 'pending' end;
   update hq_referrals_private.commissions set core_entry=entry,claimable_cents=claim,status=next_status,recoverable_cents=recovery,at_risk_cents=risk,
    revision=revision+1,updated_at=now() where id=ledger.id returning * into ledger;
  end if;
  if outcome not in ('needs_review','deferred') then
   update hq_referrals_private.customers set status=case when ledger.status in ('paid','reversed','suspended') then ledger.status else 'pending' end where id=key;
  end if;
 end if;
 if ev is not null then
  insert into hq_referrals_private.events(provider,merchant_id,event_id,customer_id,body,fingerprint,outcome,reason)
   values(ev->>'provider',ev->>'merchantAccountId',ev->>'id',key,ev,fp,outcome,reason)
   on conflict(provider,merchant_id,event_id) do update set outcome=excluded.outcome,reason=excluded.reason,last_processed_at=now(),attempts=hq_referrals_private.events.attempts+1;
 end if;
 insert into hq_referrals_private.audit(action,actor_id,entity_id,details) values('customer_event_stored',null,key,
  jsonb_build_object('outcome',outcome,'reason',reason,'revision',expected+1) ||
  case when ledger.id is null then '{}'::jsonb else jsonb_build_object('commissionId',ledger.id,'claimableCents',ledger.claimable_cents,
   'paidOutCents',ledger.paid_cents,'recoverableCents',ledger.recoverable_cents,'atRiskCents',ledger.at_risk_cents,
   'claimableDeltaCents',ledger.claimable_cents-prior_claim,'recoverableDeltaCents',ledger.recoverable_cents-prior_recovery,'atRiskDeltaCents',ledger.at_risk_cents-prior_risk) end);
 return jsonb_build_object('revision',expected+1,'outcome',outcome,'duplicate',false);
end $$;

-- Wrappers publicos sao invoker; privilegio fica no schema privado, com guarda
-- dentro de cada operacao. Grants de EXECUTE explicitamente limitados abaixo.
create function public.hq_referrals_snapshot() returns jsonb language sql security invoker set search_path='' as $$ select hq_referrals_private.snapshot() $$;
create function public.hq_referrals_save_partner(p_input jsonb) returns jsonb language sql security invoker set search_path='' as $$ select hq_referrals_private.save_partner(p_input) $$;
create function public.hq_referrals_save_coupon(p_input jsonb) returns jsonb language sql security invoker set search_path='' as $$ select hq_referrals_private.save_coupon(p_input) $$;
create function public.hq_referrals_review(p_input jsonb) returns jsonb language sql security invoker set search_path='' as $$ select hq_referrals_private.review(p_input) $$;
create function public.hq_referrals_record_payment(p_input jsonb) returns jsonb language sql security invoker set search_path='' as $$ select hq_referrals_private.record_payment(p_input) $$;
create function public.hq_referrals_load_customer(p_customer_key uuid) returns jsonb language sql security invoker set search_path='' as $$ select hq_referrals_private.load_customer(p_customer_key) $$;
create function public.hq_referrals_commit_customer(p_input jsonb) returns jsonb language sql security invoker set search_path='' as $$ select hq_referrals_private.commit_customer(p_input) $$;
revoke all on all functions in schema hq_referrals_private from public,anon,authenticated,service_role;
revoke all on function public.hq_referrals_snapshot(),public.hq_referrals_save_partner(jsonb),public.hq_referrals_save_coupon(jsonb),public.hq_referrals_review(jsonb),public.hq_referrals_record_payment(jsonb),public.hq_referrals_load_customer(uuid),public.hq_referrals_commit_customer(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.hq_referrals_snapshot(),public.hq_referrals_save_partner(jsonb),public.hq_referrals_save_coupon(jsonb),public.hq_referrals_review(jsonb),public.hq_referrals_record_payment(jsonb) to authenticated;
grant execute on function hq_referrals_private.snapshot(),hq_referrals_private.save_partner(jsonb),hq_referrals_private.save_coupon(jsonb),hq_referrals_private.review(jsonb),hq_referrals_private.record_payment(jsonb) to authenticated;
grant execute on function public.hq_referrals_load_customer(uuid),public.hq_referrals_commit_customer(jsonb),hq_referrals_private.load_customer(uuid),hq_referrals_private.commit_customer(jsonb) to service_role;
commit;
