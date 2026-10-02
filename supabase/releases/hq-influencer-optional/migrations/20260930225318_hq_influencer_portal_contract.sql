-- LOCAL REVIEW PROPOSAL. Not a migration and not applied to any remote database.
-- Requires the reviewed hq_referrals_private ledger. No second commission ledger.
-- Preparing an invitation does NOT create an Auth user or send an email.
begin;
create schema if not exists hq_influencer_private;
revoke all on schema hq_influencer_private from public, anon, authenticated, service_role;
grant usage on schema hq_influencer_private to authenticated;

create table hq_influencer_private.invites (
 id uuid primary key default gen_random_uuid(),
 partner_id uuid not null references hq_referrals_private.partners(id),
 email text not null check(email=lower(btrim(email)) and length(email) between 3 and 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 status text not null default 'pending' check(status in ('pending','accepted','revoked')),
 expires_at timestamptz not null,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 accepted_by uuid references auth.users(id), accepted_at timestamptz,
 revoked_by uuid references auth.users(id), revoked_at timestamptz,
 reason text not null check(length(reason) between 1 and 500)
);
create unique index hq_influencer_pending_email on hq_influencer_private.invites(email) where status='pending';
create unique index hq_influencer_pending_partner on hq_influencer_private.invites(partner_id) where status='pending';
create table hq_influencer_private.memberships (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id),
 partner_id uuid not null references hq_referrals_private.partners(id),
 invite_id uuid not null unique references hq_influencer_private.invites(id),
 status text not null check(status in ('active','revoked')), created_at timestamptz not null default now(), revoked_at timestamptz
);
create unique index hq_influencer_active_user on hq_influencer_private.memberships(user_id) where status='active';
create unique index hq_influencer_active_partner on hq_influencer_private.memberships(partner_id) where status='active';
create table hq_influencer_private.audit (
 id uuid primary key default gen_random_uuid(), actor_id uuid not null,
 action text not null, invite_id uuid references hq_influencer_private.invites(id),
 created_at timestamptz not null default now(), details jsonb not null default '{}'
);
alter table hq_influencer_private.invites enable row level security;
alter table hq_influencer_private.memberships enable row level security;
alter table hq_influencer_private.audit enable row level security;
revoke all on all tables in schema hq_influencer_private from public,anon,authenticated,service_role;

create function hq_influencer_private.immutable_audit() returns trigger
language plpgsql set search_path='' as $$ begin
 raise exception using errcode='IP403',message='audit_is_immutable';
end $$;
create trigger influencer_audit_immutable before update or delete on hq_influencer_private.audit
for each row execute function hq_influencer_private.immutable_audit();

-- Identity comes from verified Auth storage, not from browser parameters or
-- user_metadata. A revoked/expired Auth session is refused on every RPC.
create function hq_influencer_private.identity() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); result jsonb; begin
 if u is null or not exists(select 1 from auth.sessions s where s.user_id=u
    and s.id::text=(auth.jwt()->>'session_id') and (s.not_after is null or s.not_after>now())) then
  raise exception using errcode='IP401',message='active_auth_session_required';
 end if;
 select jsonb_build_object('id',a.id,'email',lower(btrim(a.email))) into result
 from auth.users a where a.id=u and a.email_confirmed_at is not null and a.deleted_at is null
   and (a.banned_until is null or a.banned_until<=now()) and length(btrim(coalesce(a.email,'')))>0;
 if result is null then raise exception using errcode='IP403',message='verified_auth_identity_required'; end if;
 return result;
end $$;
create function hq_influencer_private.admin_identity() returns uuid
language plpgsql stable security definer set search_path='' as $$ declare ident jsonb; begin
 ident:=hq_influencer_private.identity();
 if public.hq_sou_admin() is distinct from true then raise exception using errcode='IP403',message='hq_admin_required'; end if;
 return (ident->>'id')::uuid;
end $$;
create function hq_influencer_private.keys(j jsonb,allowed text[]) returns void
language plpgsql set search_path='' as $$ begin
 if jsonb_typeof(j) is distinct from 'object' or exists(select 1 from jsonb_object_keys(j) k where not(k=any(allowed))) then
  raise exception using errcode='IP400',message='unexpected_fields';
 end if;
end $$;
create function hq_influencer_private.prepare_invite(p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid; partner uuid; email text; reason text; expiry timestamptz; r hq_influencer_private.invites; begin
 u:=hq_influencer_private.admin_identity();
 perform hq_influencer_private.keys(p_input,array['partnerId','email','expiresAt','reason']);
 if jsonb_typeof(p_input->'partnerId') is distinct from 'string' or (p_input->>'partnerId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 or jsonb_typeof(p_input->'email') is distinct from 'string' or jsonb_typeof(p_input->'reason') is distinct from 'string'
 or jsonb_typeof(p_input->'expiresAt') is distinct from 'string' then
  raise exception using errcode='IP400',message='invalid_invitation';
 end if;
 partner:=(p_input->>'partnerId')::uuid; email:=lower(btrim(p_input->>'email')); reason:=btrim(p_input->>'reason');
 if length(email)>254 or email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(reason) not between 1 and 500
 or (p_input->>'expiresAt') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception using errcode='IP400',message='invalid_invitation'; end if;
 begin expiry:=(p_input->>'expiresAt')::timestamptz;
 exception when others then raise exception using errcode='IP400',message='invalid_expiry'; end;
 if expiry<=now() or expiry>now()+interval '30 days' then raise exception using errcode='IP400',message='invalid_expiry'; end if;
 perform pg_advisory_xact_lock(hashtextextended('influencer:'||partner::text,0));
 perform 1 from hq_referrals_private.partners p where p.id=partner and p.status='active' for share;
 if not found then raise exception using errcode='IP404',message='active_partner_required'; end if;
 if exists(select 1 from hq_influencer_private.memberships where partner_id=partner and status='active') then
  raise exception using errcode='IP409',message='partner_already_has_access';
 end if;
 insert into hq_influencer_private.invites(partner_id,email,expires_at,created_by,reason)
 values(partner,email,expiry,u,reason) returning * into r;
 insert into hq_influencer_private.audit(actor_id,action,invite_id,details) values(u,'invitation_prepared',r.id,jsonb_build_object('partnerId',partner));
 return jsonb_build_object('id',r.id,'partnerId',r.partner_id,'email',r.email,'status',r.status,'expiresAt',r.expires_at,'delivery','unavailable','authUserCreated',false);
exception when unique_violation then raise exception using errcode='IP409',message='pending_invitation_or_membership_exists';
end $$;
create function hq_influencer_private.list_invites() returns jsonb
language plpgsql stable security definer set search_path='' as $$ begin
 perform hq_influencer_private.admin_identity();
 return coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'partnerId',i.partner_id,'email',i.email,
  'status',i.status,'expiresAt',i.expires_at,'createdAt',i.created_at,'delivery','unavailable') order by i.created_at desc)
  from (select * from hq_influencer_private.invites order by created_at desc limit 200) i),'[]'::jsonb);
end $$;
create function hq_influencer_private.admin_snapshot() returns jsonb
language plpgsql stable security definer set search_path='' as $$ begin
 perform hq_influencer_private.admin_identity();
 return jsonb_build_object('partners',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.name,p.id)
  from hq_referrals_private.partners p where p.status='active'),'[]'::jsonb),
  'invites',hq_influencer_private.list_invites(),'deliveryAvailable',false);
end $$;
create function hq_influencer_private.revoke_access(p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid; target uuid; reason text; r hq_influencer_private.invites; begin
 u:=hq_influencer_private.admin_identity(); perform hq_influencer_private.keys(p_input,array['inviteId','reason']);
 if jsonb_typeof(p_input->'inviteId') is distinct from 'string' or (p_input->>'inviteId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 or jsonb_typeof(p_input->'reason') is distinct from 'string' then raise exception using errcode='IP400',message='invalid_revocation'; end if;
 target:=(p_input->>'inviteId')::uuid; reason:=btrim(p_input->>'reason');
 if length(reason) not between 1 and 500 then raise exception using errcode='IP400',message='reason_required'; end if;
 select * into r from hq_influencer_private.invites where id=target for update;
 if not found then raise exception using errcode='IP404',message='invitation_not_found'; end if;
 if r.status='revoked' then return jsonb_build_object('revoked',true); end if;
 update hq_influencer_private.invites set status='revoked',revoked_at=now(),revoked_by=u where id=target;
 update hq_influencer_private.memberships set status='revoked',revoked_at=now() where invite_id=target and status='active';
 insert into hq_influencer_private.audit(actor_id,action,invite_id,details) values(u,'access_revoked',target,jsonb_build_object('reason',reason));
 return jsonb_build_object('revoked',true);
end $$;
create function hq_influencer_private.accept_invite() returns jsonb
language plpgsql security definer set search_path='' as $$
declare ident jsonb; u uuid; v_email text; r hq_influencer_private.invites; begin
 ident:=hq_influencer_private.identity(); u:=(ident->>'id')::uuid; v_email:=ident->>'email';
 perform pg_advisory_xact_lock(hashtextextended('influencer-user:'||u::text,0));
 if exists(select 1 from hq_influencer_private.memberships m join hq_influencer_private.invites i on i.id=m.invite_id
   where m.user_id=u and m.status='active' and i.status='accepted' and i.email=v_email) then return jsonb_build_object('accepted',true); end if;
 select * into r from hq_influencer_private.invites i where i.email=v_email and i.status='pending' and i.expires_at>now() for update;
 if not found then raise exception using errcode='IP403',message='invitation_unavailable'; end if;
 perform 1 from hq_referrals_private.partners where id=r.partner_id and status='active' for share;
 if not found then raise exception using errcode='IP403',message='partner_access_unavailable'; end if;
 insert into hq_influencer_private.memberships(user_id,partner_id,invite_id,status) values(u,r.partner_id,r.id,'active');
 update hq_influencer_private.invites set status='accepted',accepted_by=u,accepted_at=now() where id=r.id;
 insert into hq_influencer_private.audit(actor_id,action,invite_id) values(u,'invitation_accepted',r.id);
 return jsonb_build_object('accepted',true);
exception when unique_violation then raise exception using errcode='IP409',message='active_membership_exists';
end $$;
create function hq_influencer_private.snapshot() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare ident jsonb; partner uuid; partner_name text; partner_status text; output jsonb;
 attributed_count bigint; verified_count bigint:=0; after_trial_count bigint:=0; unknown_count bigint;
 payment_status text:='unavailable'; payment_source text:='unavailable'; begin
 ident:=hq_influencer_private.identity();
 select m.partner_id,p.name,p.status into partner,partner_name,partner_status
 from hq_influencer_private.memberships m
 join hq_influencer_private.invites i on i.id=m.invite_id
 join hq_referrals_private.partners p on p.id=m.partner_id
 where m.user_id=(ident->>'id')::uuid and m.status='active' and i.status='accepted'
   and i.email=ident->>'email' and i.accepted_by=m.user_id and p.status='active';
 if partner is null then raise exception using errcode='IP403',message='partner_access_unavailable'; end if;
 select count(*) into attributed_count from hq_referrals_private.customers c where c.partner_id=partner;
 unknown_count:=attributed_count;
 -- Optional corrected ledger contract: never substitute commissions/payouts for
 -- a customer's verified first receipt. Missing helper leaves the metric unknown.
 if to_regprocedure('hq_referrals_private.first_payment_json(hq_referrals_private.customers)') is not null then
  with facts as materialized (
   select hq_referrals_private.first_payment_json(c) fact
   from hq_referrals_private.customers c where c.partner_id=partner
  )
  select count(*) filter(where fact->>'status'='verified' and fact->>'scope'='historical_first_payment'
      and jsonb_typeof(fact->'afterTrial')='boolean'),
   count(*) filter(where fact->>'status'='verified' and fact->>'scope'='historical_first_payment' and fact->'afterTrial'='true'::jsonb)
  into verified_count,after_trial_count from facts;
  unknown_count:=attributed_count-verified_count; payment_source:='verified_ledger_events';
  payment_status:=case when unknown_count=0 then 'ready' when verified_count>0 then 'partial' else 'unavailable' end;
 end if;
 -- Whitelist every returned field. Never expose customer identifiers/context,
 -- contacts, free-form payment reference, bank data, event bodies or raw ledger.
 select jsonb_build_object(
  'version',2,'asOf',now(),'partner',jsonb_build_object('displayName',partner_name,'status',partner_status),
  'campaign',jsonb_build_object('enabled',(select enabled from hq_referrals_private.campaign where id='personal-referrals-v1'),
     'monthlyCents',4990,'firstPaymentCents',2994,'commissionCents',1996,'trialDays',14),
  'counts',jsonb_build_object('attributed',attributed_count,
     'firstPaymentsAfterTrial',case when payment_status='ready' then after_trial_count else null end,
     'commissions',(select count(*) from hq_referrals_private.commissions c where c.partner_id=partner),
     'payments',(select count(*) from hq_referrals_private.payments p where p.partner_id=partner)),
  'firstPayments',jsonb_build_object('status',payment_status,'scope','historical_first_payment','source',payment_source,
     'verifiedAfterTrialCount',case when payment_status<>'unavailable' then after_trial_count else null end,'unknownCount',unknown_count),
  'balances',jsonb_build_object(
     'pendingCents',coalesce((select sum(greatest(c.claimable_cents-c.paid_cents,0)) from hq_referrals_private.commissions c where c.partner_id=partner and c.status='pending'),0),
     'eligibleCents',coalesce((select sum(greatest(c.claimable_cents-c.paid_cents,0)) from hq_referrals_private.commissions c where c.partner_id=partner and c.status='eligible'),0),
     'suspendedCents',coalesce((select sum(greatest(c.claimable_cents-c.paid_cents,0)) from hq_referrals_private.commissions c where c.partner_id=partner and c.status='suspended'),0),
     'paidCents',coalesce((select sum(p.amount_cents) from hq_referrals_private.payments p where p.partner_id=partner),0),
     'atRiskCents',coalesce((select sum(c.at_risk_cents) from hq_referrals_private.commissions c where c.partner_id=partner),0),
     'recoverableCents',coalesce((select sum(c.recoverable_cents) from hq_referrals_private.commissions c where c.partner_id=partner),0)),
  'coupons',coalesce((select jsonb_agg(jsonb_build_object('code',c.code,'status',c.status) order by c.created_at,c.id)
     from hq_referrals_private.coupons c where c.partner_id=partner),'[]'::jsonb),
  'commissions',coalesce((select jsonb_agg(jsonb_build_object('reference',c.id,'createdAt',c.created_at,'status',c.status,
     'amountCents',c.amount_cents,'payableCents',case when c.status='eligible' then greatest(c.claimable_cents-c.paid_cents,0) else 0 end,
     'paidCents',c.paid_cents,'atRiskCents',c.at_risk_cents,'recoverableCents',c.recoverable_cents) order by c.created_at desc,c.id)
     from (select * from hq_referrals_private.commissions c where c.partner_id=partner order by c.created_at desc,c.id limit 100) c),'[]'::jsonb),
  'payments',coalesce((select jsonb_agg(jsonb_build_object('reference',p.id,'createdAt',p.created_at,'amountCents',p.amount_cents) order by p.created_at desc,p.id)
     from (select * from hq_referrals_private.payments p where p.partner_id=partner order by p.created_at desc,p.id limit 100) p),'[]'::jsonb),
  'limits',jsonb_build_object('commissions',100,'payments',100),
  'availability',jsonb_build_object('invitationDelivery',false,'payoutDetails',false,'automaticTransfer',false)
 ) into output;
 return output;
end $$;

create function public.hq_influencer_prepare_invite(p_input jsonb) returns jsonb language sql security invoker set search_path='' as $$ select hq_influencer_private.prepare_invite(p_input) $$;
create function public.hq_influencer_list_invites() returns jsonb language sql security invoker set search_path='' as $$ select hq_influencer_private.list_invites() $$;
create function public.hq_influencer_admin_snapshot() returns jsonb language sql security invoker set search_path='' as $$ select hq_influencer_private.admin_snapshot() $$;
create function public.hq_influencer_revoke_access(p_input jsonb) returns jsonb language sql security invoker set search_path='' as $$ select hq_influencer_private.revoke_access(p_input) $$;
create function public.influencer_accept_invite() returns jsonb language sql security invoker set search_path='' as $$ select hq_influencer_private.accept_invite() $$;
create function public.influencer_portal_snapshot() returns jsonb language sql security invoker set search_path='' as $$ select hq_influencer_private.snapshot() $$;
revoke all on all functions in schema hq_influencer_private from public,anon,authenticated,service_role;
grant execute on function hq_influencer_private.prepare_invite(jsonb),hq_influencer_private.list_invites(),hq_influencer_private.admin_snapshot(),hq_influencer_private.revoke_access(jsonb),hq_influencer_private.accept_invite(),hq_influencer_private.snapshot() to authenticated;
revoke all on function public.hq_influencer_prepare_invite(jsonb),public.hq_influencer_list_invites(),public.hq_influencer_admin_snapshot(),public.hq_influencer_revoke_access(jsonb),public.influencer_accept_invite(),public.influencer_portal_snapshot() from public,anon,service_role;
grant execute on function public.hq_influencer_prepare_invite(jsonb),public.hq_influencer_list_invites(),public.hq_influencer_admin_snapshot(),public.hq_influencer_revoke_access(jsonb),public.influencer_accept_invite(),public.influencer_portal_snapshot() to authenticated;
commit;
