-- OPTIONAL. Apply only to a disposable test database / explicitly enabled SaaS release.
-- No legacy account, entitlement, price, campaign or RLS policy is changed.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create schema if not exists personal_billing;
revoke all on schema personal_billing from public, anon, authenticated;

create table personal_billing.accounts (
  -- No FK to the live account: deletion keeps only this pseudonymous financial
  -- reference and queues cancellation, without retaining the user's product data.
  academia_id uuid primary key,
  environment text not null check (environment in ('test','live')),
  merchant_id text not null check (merchant_id ~ '^acc_[A-Za-z0-9]+$'),
  customer_id text,
  subscription_id text,
  attempt_id uuid,
  state text not null default 'pending',
  subscription_status text,
  lease_id uuid,
  lease_until timestamptz,
  revision bigint not null default 0,
  checked_at timestamptz,
  attempted_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  unique(environment, merchant_id, customer_id),
  unique(environment, merchant_id, subscription_id)
);
create table personal_billing.attempts (
  id uuid primary key,
  academia_id uuid not null references personal_billing.accounts(academia_id),
  phase text not null check (phase in ('customer_pending','customer_bound','submitting','unknown','confirmed','rejected')),
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index personal_billing_attempt_account on personal_billing.attempts(academia_id,created_at);
create table personal_billing.invoices (
  academia_id uuid not null references personal_billing.accounts(academia_id),
  id text not null check (id ~ '^in_[A-Za-z0-9]+$'),
  charge_id text,
  status text not null check (status in ('paid','unpaid','revoked','needs_review')),
  amount integer not null check(amount > 0),
  period_start timestamptz,
  period_end timestamptz,
  paid_at timestamptz,
  revoked boolean not null default false,
  reason text,
  updated_at timestamptz not null default now(),
  primary key (academia_id,id),
  check (status <> 'paid' or (charge_id is not null and charge_id ~ '^ch_[A-Za-z0-9]+$'
    and period_start is not null and period_end is not null and paid_at is not null
    and isfinite(period_start) and isfinite(period_end) and isfinite(paid_at)
    and period_end > period_start and paid_at >= period_start))
);
create table personal_billing.events (
  environment text not null,
  merchant_id text not null,
  id text not null,
  fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
  academia_id uuid references personal_billing.accounts(academia_id),
  resource_kind text not null check(resource_kind in ('subscription','invoice','charge')),
  resource_id text not null,
  state text not null default 'received' check(state in ('received','done','needs_review')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key(environment,merchant_id,id)
);
create index personal_billing_due on personal_billing.accounts(attempted_at nulls first);
alter table personal_billing.accounts enable row level security;
alter table personal_billing.attempts enable row level security;
alter table personal_billing.invoices enable row level security;
alter table personal_billing.events enable row level security;
revoke all on all tables in schema personal_billing from public,anon,authenticated,service_role;

create function personal_billing.account_deleted()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  update personal_billing.accounts set deleted_at=now(),state='cancel_pending',lease_id=null,lease_until=null,attempted_at=null
    where academia_id=old.id;
  return old;
end $$;
create trigger personal_billing_account_deleted before delete on public.academias
  for each row execute function personal_billing.account_deleted();

create function personal_billing.owner_check(p_actor jsonb,p_academia uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare u uuid := (p_actor->>'userId')::uuid; s uuid := (p_actor->>'sessionId')::uuid;
begin
  if u is null or s is null or not exists (
    select 1 from auth.sessions x where x.id=s and x.user_id=u
      and (x.not_after is null or x.not_after>now())
  ) then raise exception 'auth_required' using errcode='42501'; end if;
  if p_academia is not null and not exists (
    select 1 from public.membros m where m.user_id=u and m.academia_id=p_academia and m.papel='dono'
  ) then raise exception 'owner_required' using errcode='42501'; end if;
end $$;

create function personal_billing.status(p_academia uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a public.academias%rowtype; b personal_billing.accounts%rowtype;
  t personal_billing.attempts%rowtype; paid timestamptz; until_at timestamptz; st text;
  trial_end timestamptz; grace_end timestamptz; active boolean;
begin
  select * into a from public.academias where id=p_academia;
  if not found then raise exception 'owner_required' using errcode='42501'; end if;
  select * into b from personal_billing.accounts where academia_id=p_academia;
  select * into t from personal_billing.attempts where id=b.attempt_id;
  trial_end := a.criada + interval '14 days';
  grace_end := trial_end + interval '3 days';
  select max(period_end) into paid from personal_billing.invoices
    where academia_id=p_academia and status='paid' and not revoked
      and period_start<=now() and period_end>now();
  until_at := greatest(paid,grace_end);
  active := until_at>now();
  st := case when now()<trial_end then 'trial' when now()<grace_end then 'trial' else 'not_started' end;
  if b.academia_id is not null then
    st := case when b.state in ('pending','cancel_pending','needs_review','payment_failed') then b.state
      when b.subscription_status='canceled' then 'canceled'
      when paid>now() then 'paid'
      when b.subscription_status='future' then 'scheduled'
      when exists(select 1 from personal_billing.invoices where academia_id=p_academia and status='unpaid' and reason='payment_failed') then 'payment_failed'
      when now()<grace_end then 'trial' else 'expired' end;
  end if;
  -- This billing view never revokes administrative benefits. Existing application
  -- access remains owned by minha_assinatura until a separate opt-in integration.
  if a.assinatura_status='vitalicia' then active:=true; until_at:=null;
  elsif a.assinatura_status='cortesia' then
    active:=coalesce(isfinite(a.assinatura_vence) and a.assinatura_vence>now(),false); until_at:=a.assinatura_vence;
  elsif b.academia_id is null and a.assinatura_status in ('ativa','atrasada') then active:=true; until_at:=a.assinatura_vence;
  elsif a.assinatura_status not in ('trial','ativa','atrasada') then active:=false; until_at:=null; st:='expired';
  end if;
  return jsonb_build_object('academiaId',p_academia,'managed',b.academia_id is not null,
    'accessKind',case when a.assinatura_status='vitalicia' then 'lifetime' when a.assinatura_status='cortesia' then 'courtesy'
      when a.assinatura_status not in ('trial','ativa','atrasada') then 'blocked'
      when b.academia_id is not null then 'saas' when a.assinatura_status in ('ativa','atrasada') then 'legacy'
      when a.assinatura_status='trial' then 'trial' else 'blocked' end,
    'state',st,'trialEndsAt',trial_end,'graceEndsAt',grace_end,'paidThrough',paid,
    'accessUntil',until_at,'accessActive',coalesce(active,false),
    'renewalCanceled',coalesce(b.subscription_status='canceled',false),
    'canCancel',b.subscription_id is not null and b.subscription_status is distinct from 'canceled',
    'paymentIssue',case when exists(select 1 from personal_billing.invoices where academia_id=p_academia and status='unpaid' and reason='payment_failed') then 'payment_failed' else null end,
    'attemptId',b.attempt_id,'retryAllowed',b.academia_id is null or (t.phase='rejected' and b.subscription_id is null),
    'checkedAt',b.checked_at);
end $$;

-- Deliberate service-only bridge to an unexposed schema. Browser roles cannot
-- choose the actor, reserve attempts, bind provider IDs or commit entitlements.
create function public.personal_billing_service(p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare aid uuid := nullif(p_data->>'academiaId','')::uuid;
  actor jsonb := p_data->'actor'; b personal_billing.accounts%rowtype;
  t personal_billing.attempts%rowtype; a public.academias%rowtype;
  lid uuid := nullif(p_data->>'leaseId','')::uuid; x jsonb; result jsonb; prior text;
begin
  if p_action in ('accounts','authorize','status','reserve','cancel_request','mark_submitting','bind_customer') then
    perform personal_billing.owner_check(actor,case when p_action='accounts' then null else aid end);
  end if;
  if p_action='accounts' then
    return jsonb_build_object('accounts',coalesce((select jsonb_agg(jsonb_build_object(
      'id',acc.id,'nome',acc.nome,'createdAt',acc.criada) order by acc.criada,acc.id)
      from public.academias acc where exists(select 1 from public.membros m where
        m.academia_id=acc.id and m.user_id=(actor->>'userId')::uuid and m.papel='dono')
        and (exists(select 1 from public.saas_clientes sc where sc.academia_id=acc.id and sc.tipo='personal')
          or exists(select 1 from personal_billing.accounts billing where billing.academia_id=acc.id))),'[]'::jsonb));
  end if;
  if p_action='due' then
    return jsonb_build_object('accounts',coalesce((select jsonb_agg(to_jsonb(q)) from
      (select academia_id as "academiaId" from personal_billing.accounts
       where environment=p_data->>'environment' and merchant_id=p_data->>'merchantId'
       and state<>'deleted' and (lease_until is null or lease_until<now()) and (attempted_at is null or attempted_at<now()-interval '5 minutes')
       order by attempted_at nulls first,academia_id limit 20) q),'[]'::jsonb));
  end if;
  if p_action='event' then
    insert into personal_billing.events(environment,merchant_id,id,fingerprint,resource_kind,resource_id)
      values(p_data->>'environment',p_data->>'merchantId',p_data->>'eventId',p_data->>'fingerprint',p_data->>'resourceKind',p_data->>'resourceId')
      on conflict do nothing;
    select fingerprint into prior from personal_billing.events where environment=p_data->>'environment'
      and merchant_id=p_data->>'merchantId' and id=p_data->>'eventId' for update;
    if prior is distinct from p_data->>'fingerprint' then raise exception 'event_conflict'; end if;
    return (select jsonb_build_object('state',state) from personal_billing.events where environment=p_data->>'environment'
      and merchant_id=p_data->>'merchantId' and id=p_data->>'eventId');
  end if;
  select * into a from public.academias where id=aid;
  if not found and p_action not in ('lease','release','deleted_complete','event_link') then raise exception 'owner_required' using errcode='42501'; end if;
  if p_action='reserve' then
    if not exists(select 1 from public.saas_clientes where academia_id=aid and tipo='personal') then raise exception 'personal_account_required' using errcode='42501'; end if;
    if a.assinatura_status is distinct from 'trial' or coalesce(a.assinatura_via,'')<>'' then raise exception 'benefit_or_subscription_exists'; end if;
    insert into personal_billing.accounts(academia_id,environment,merchant_id)
      values(aid,p_data->>'environment',p_data->>'merchantId') on conflict do nothing;
  end if;
  select * into b from personal_billing.accounts where academia_id=aid for update;
  if b.academia_id is not null and (b.environment is distinct from p_data->>'environment'
     or b.merchant_id is distinct from p_data->>'merchantId') then raise exception 'billing_environment_mismatch'; end if;
  if p_action in ('authorize','status') then
    return jsonb_build_object('status',personal_billing.status(aid),'account',to_jsonb(b),
      'createdAt',a.criada,'attempt',(select to_jsonb(q) from personal_billing.attempts q where q.id=b.attempt_id));
  end if;
  if b.academia_id is null then raise exception 'billing_not_started'; end if;
  if p_action='event_link' then
    if b.subscription_id is distinct from p_data->>'subscriptionId' then raise exception 'provider_binding_mismatch'; end if;
    update personal_billing.events set academia_id=aid where environment=b.environment and merchant_id=b.merchant_id and id=p_data->>'eventId';
    return '{}'::jsonb;
  end if;
  if p_action='reserve' then
    select * into t from personal_billing.attempts where id=(p_data->>'attemptId')::uuid;
    if found then
      if t.academia_id<>aid then raise exception 'attempt_conflict'; end if;
      return jsonb_build_object('dispatch',false,'status',personal_billing.status(aid));
    end if;
    if b.subscription_id is not null then raise exception 'subscription_exists'; end if;
    if b.attempt_id is not null and exists(select 1 from personal_billing.attempts where id=b.attempt_id and phase<>'rejected')
      then return jsonb_build_object('dispatch',false,'status',personal_billing.status(aid)); end if;
    insert into personal_billing.attempts(id,academia_id,phase) values((p_data->>'attemptId')::uuid,aid,
      case when b.customer_id is null then 'customer_pending' else 'customer_bound' end);
    update personal_billing.accounts set attempt_id=(p_data->>'attemptId')::uuid,state='pending',
      lease_id=lid,lease_until=now()+interval '2 minutes',revision=revision+1 where academia_id=aid;
    return jsonb_build_object('dispatch',true,'customerId',b.customer_id,'createdAt',a.criada,'leaseId',lid);
  end if;
  if p_action in ('lease','cancel_request') then
    if p_action='lease' and b.lease_until>now() then return jsonb_build_object('busy',true); end if;
    if p_action='cancel_request' and b.subscription_id is null then raise exception 'billing_not_started'; end if;
    update personal_billing.accounts set lease_id=lid,lease_until=now()+interval '5 minutes',attempted_at=now(),
      state=case when p_action='cancel_request' and subscription_status is distinct from 'canceled' then 'cancel_pending' else state end
      where academia_id=aid;
    return jsonb_build_object('busy',false,'account',to_jsonb(b),'createdAt',a.criada,
      'attempt',(select to_jsonb(q) from personal_billing.attempts q where q.id=b.attempt_id));
  end if;
  if lid is null or b.lease_id is distinct from lid or b.lease_until<=now() then raise exception 'stale_lease'; end if;
  if p_action='deleted_complete' then
    if b.deleted_at is null then raise exception 'not_deleted'; end if;
    if b.subscription_id is not null and b.subscription_id is distinct from p_data->>'subscriptionId' then raise exception 'provider_binding_mismatch'; end if;
    if p_data->>'subscriptionId' is not null and (p_data->>'subscriptionId' !~ '^sub_[A-Za-z0-9]+$'
      or p_data->>'subscriptionStatus' is distinct from 'canceled') then raise exception 'cancellation_not_confirmed'; end if;
    if p_data->>'subscriptionId' is null and exists(select 1 from personal_billing.attempts where id=b.attempt_id
      and (phase in ('submitting','confirmed') or (phase='unknown' and failure_code is distinct from 'customer_uncertain'))) then raise exception 'subscription_still_unknown'; end if;
    update personal_billing.accounts set state='deleted',subscription_status='canceled',
      subscription_id=coalesce(subscription_id,p_data->>'subscriptionId'),checked_at=now(),lease_id=null,lease_until=null where academia_id=aid;
    update personal_billing.events set state='done',academia_id=aid,completed_at=now()
      where environment=b.environment and merchant_id=b.merchant_id and (academia_id=aid or id=p_data->>'eventId');
    return jsonb_build_object('deleted',true,'renewalCanceled',true);
  elsif p_action in ('bind_customer','recover_customer') then
    if p_data->>'customerId' !~ '^cus_[A-Za-z0-9]+$' or
      (b.customer_id is not null and b.customer_id is distinct from p_data->>'customerId') then raise exception 'provider_binding_mismatch'; end if;
    update personal_billing.accounts set customer_id=p_data->>'customerId' where academia_id=aid;
    update personal_billing.attempts set phase='customer_bound',updated_at=now() where id=b.attempt_id;
  elsif p_action='mark_submitting' then
    if b.customer_id is null then raise exception 'provider_binding_mismatch'; end if;
    update personal_billing.attempts set phase='submitting',updated_at=now() where id=b.attempt_id and phase='customer_bound';
    if not found then raise exception 'attempt_conflict'; end if;
  elsif p_action='bind_subscription' then
    if p_data->>'subscriptionId' !~ '^sub_[A-Za-z0-9]+$' or
      (b.subscription_id is not null and b.subscription_id is distinct from p_data->>'subscriptionId') then raise exception 'provider_binding_mismatch'; end if;
    update personal_billing.accounts set subscription_id=p_data->>'subscriptionId',state='pending' where academia_id=aid;
    update personal_billing.attempts set phase='confirmed',updated_at=now() where id=b.attempt_id;
  elsif p_action='attempt_failed' then
    update personal_billing.attempts set phase=case when p_data->>'definitive'='true' then 'rejected' else 'unknown' end,
      failure_code=left(p_data->>'reason',80),updated_at=now() where id=b.attempt_id and phase<>'confirmed';
    update personal_billing.accounts set state=case when p_data->>'definitive'='true' then 'payment_failed' else 'pending' end,
      lease_until=null,lease_id=null where academia_id=aid;
  elsif p_action='review' then
    update personal_billing.accounts set state='needs_review',lease_until=null,lease_id=null where academia_id=aid;
  elsif p_action='release' then
    update personal_billing.accounts set lease_until=null,lease_id=null where academia_id=aid;
    if b.deleted_at is not null then return jsonb_build_object('deleted',true,'pending',b.state<>'deleted'); end if;
  elsif p_action='commit' then
    if b.subscription_id is null or b.subscription_id is distinct from p_data->>'subscriptionId' then raise exception 'provider_binding_mismatch'; end if;
    if p_data->>'subscriptionStatus' not in ('active','future','canceled') then raise exception 'invalid_subscription_status'; end if;
    if jsonb_typeof(p_data->'invoices') is distinct from 'array' then raise exception 'invalid_invoices'; end if;
    for x in select value from jsonb_array_elements(p_data->'invoices') loop
      if x->>'status'='paid' and (x->>'periodStart' is null or x->>'periodEnd' is null or x->>'paidAt' is null
        or not isfinite((x->>'periodStart')::timestamptz) or not isfinite((x->>'periodEnd')::timestamptz)
        or not isfinite((x->>'paidAt')::timestamptz) or (x->>'periodStart')::timestamptz<a.criada+interval '14 days'
        or (x->>'paidAt')::timestamptz>now() or (x->>'periodStart')::timestamptz>now()
        or (x->>'periodEnd')::timestamptz-(x->>'periodStart')::timestamptz>interval '32 days'
        or (x->>'amount')::integer<>4990) then raise exception 'invalid_paid_period_or_amount'; end if;
      insert into personal_billing.invoices(academia_id,id,charge_id,status,amount,period_start,period_end,paid_at,revoked,reason)
        values(aid,x->>'id',x->>'chargeId',x->>'status',(x->>'amount')::integer,
          (x->>'periodStart')::timestamptz,(x->>'periodEnd')::timestamptz,(x->>'paidAt')::timestamptz,
          x->>'status' in ('revoked','needs_review'),x->>'reason')
        on conflict(academia_id,id) do update set
          status=case when personal_billing.invoices.revoked then personal_billing.invoices.status else excluded.status end,
          charge_id=excluded.charge_id,amount=excluded.amount,period_start=excluded.period_start,period_end=excluded.period_end,
          paid_at=excluded.paid_at,revoked=personal_billing.invoices.revoked or excluded.revoked,
          reason=case when personal_billing.invoices.revoked then personal_billing.invoices.reason else excluded.reason end,updated_at=now();
    end loop;
    -- A complete canonical scan cannot silently omit a previously paid invoice.
    if exists(select 1 from personal_billing.invoices i where i.academia_id=aid and not exists(
      select 1 from jsonb_array_elements(p_data->'invoices') j where j->>'id'=i.id)) then raise exception 'incomplete_invoice_snapshot'; end if;
    update personal_billing.accounts set subscription_status=case when subscription_status='canceled' then 'canceled' else p_data->>'subscriptionStatus' end,
      state=case when exists(select 1 from personal_billing.invoices where academia_id=aid and revoked) then 'needs_review'
        when state='cancel_pending' and p_data->>'subscriptionStatus'<>'canceled' then 'cancel_pending' else 'ready' end,
      checked_at=now(),revision=revision+1,lease_until=null,lease_id=null where academia_id=aid;
    update personal_billing.events set state='done',academia_id=aid,completed_at=now()
      where environment=b.environment and merchant_id=b.merchant_id
        and (id=p_data->>'eventId' or (academia_id=aid and state='received'));
  else raise exception 'invalid_action'; end if;
  return personal_billing.status(aid);
end $$;
revoke all on all functions in schema personal_billing from public,anon,authenticated,service_role;
revoke all on function public.personal_billing_service(text,jsonb) from public,anon,authenticated;
grant execute on function public.personal_billing_service(text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
