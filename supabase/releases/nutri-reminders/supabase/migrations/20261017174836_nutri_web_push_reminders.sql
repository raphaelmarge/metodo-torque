-- Optional release for the separate Torque Nutri project. DISABLED by default.
-- No cron schedule or external HTTP request is created by this migration.
begin;
create schema if not exists private;
create table private.nutri_push_config (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 public_key text not null default '' check(public_key='' or public_key ~ '^[A-Za-z0-9_-]{87}$')
);
insert into private.nutri_push_config default values;
create table private.nutri_push_preferences (
 user_id uuid not null references auth.users(id) on delete cascade,
 patient_id uuid not null references public.patients(id) on delete cascade,
 appointments boolean not null default true, questionnaires boolean not null default true,
 appointment_minutes integer not null default 60 check(appointment_minutes in(15,30,60,120,1440)),
 questionnaire_time time not null default '09:00', timezone text not null default 'America/Sao_Paulo',
 primary key(user_id,patient_id)
);
create table private.nutri_push_subscriptions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 patient_id uuid not null references public.patients(id) on delete cascade,
 endpoint text not null unique check(length(endpoint)<=2048), p256dh text not null, auth text not null,
 active boolean not null default true, consent_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table private.nutri_push_deliveries (
 id uuid primary key default gen_random_uuid(), subscription_id uuid not null references private.nutri_push_subscriptions(id) on delete cascade,
 event_key text not null, kind text not null check(kind in('appointment','questionnaire')),
 due_at timestamptz not null, expires_at timestamptz not null,
 status text not null default 'queued' check(status in('queued','sending','sent','cancelled','expired','failed','uncertain')),
 attempts integer not null default 0, next_attempt timestamptz not null default now(),
 lease uuid, lease_until timestamptz, updated_at timestamptz not null default now(),
 unique(subscription_id,event_key)
);
create index nutri_push_pending on private.nutri_push_deliveries(next_attempt) where status='queued';
alter table private.nutri_push_config enable row level security;
alter table private.nutri_push_preferences enable row level security;
alter table private.nutri_push_subscriptions enable row level security;
alter table private.nutri_push_deliveries enable row level security;
revoke all on private.nutri_push_config,private.nutri_push_preferences,private.nutri_push_subscriptions,private.nutri_push_deliveries from public,anon,authenticated,service_role;

-- The allow-list is deliberately narrow. Hosts outside supported vendors are
-- rejected, including IP literals, credentials, ports and redirect targets.
create function private.nutri_push_endpoint_ok(p_endpoint text) returns boolean
language sql immutable set search_path='' as $$
 select length(p_endpoint) between 20 and 2048 and p_endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/[A-Za-z0-9_/?=&%.~+:-]+$'
$$;

create function private.nutri_reminders_impl(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); p uuid; pref jsonb; sub jsonb; v_endpoint text; cfg private.nutri_push_config; result jsonb;
begin
 if u is null or not exists(select 1 from auth.users where id=u and not coalesce(is_anonymous,false)) then raise exception 'Autenticação necessária' using errcode='42501'; end if;
 if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Dados inválidos' using errcode='22023'; end if;
 -- Revocation is permitted even if a patient relationship was removed.
 if p_action='unsubscribe' then
  update private.nutri_push_subscriptions set active=false,updated_at=now() where user_id=u
    and ((coalesce((p_data->>'all')::boolean,false) and patient_id=(p_data->>'patient_id')::uuid) or endpoint=p_data->>'endpoint');
  return jsonb_build_object('revoked',true);
 end if;
 p:=(p_data->>'patient_id')::uuid;
 if p is null or not exists(select 1 from public.patients where id=p and user_id=u) then raise exception 'Paciente não disponível' using errcode='42501'; end if;
 select * into cfg from private.nutri_push_config;
 if p_action in('subscribe','preferences') then
  if not cfg.enabled or cfg.public_key='' then raise exception 'Serviço ainda não ativado' using errcode='55000'; end if;
  pref:=p_data->'preferences';
  if jsonb_typeof(pref) is distinct from 'object' or jsonb_typeof(pref->'appointments') is distinct from 'boolean' or jsonb_typeof(pref->'questionnaires') is distinct from 'boolean'
   or coalesce(pref->>'appointment_minutes','') not in('15','30','60','120','1440')
   or coalesce(pref->>'questionnaire_time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
   or not exists(select 1 from pg_catalog.pg_timezone_names where name=pref->>'timezone') then raise exception 'Preferências inválidas' using errcode='22023'; end if;
  insert into private.nutri_push_preferences(user_id,patient_id,appointments,questionnaires,appointment_minutes,questionnaire_time,timezone)
   values(u,p,(pref->>'appointments')::boolean,(pref->>'questionnaires')::boolean,(pref->>'appointment_minutes')::integer,(pref->>'questionnaire_time')::time,pref->>'timezone')
   on conflict(user_id,patient_id) do update set appointments=excluded.appointments,questionnaires=excluded.questionnaires,appointment_minutes=excluded.appointment_minutes,questionnaire_time=excluded.questionnaire_time,timezone=excluded.timezone;
  if p_action='subscribe' then
   sub:=p_data->'subscription';v_endpoint:=sub->>'endpoint';
   if private.nutri_push_endpoint_ok(v_endpoint) is distinct from true or coalesce(sub#>>'{keys,p256dh}','') !~ '^[A-Za-z0-9_-]{87}$' or coalesce(sub#>>'{keys,auth}','') !~ '^[A-Za-z0-9_-]{22}$' then raise exception 'Inscrição inválida' using errcode='22023'; end if;
   if exists(select 1 from private.nutri_push_subscriptions s where s.endpoint=v_endpoint and s.user_id<>u) then raise exception 'Desative as notificações anteriores deste navegador' using errcode='42501'; end if;
   if (select count(*) from private.nutri_push_subscriptions where user_id=u and active)>=10 and not exists(select 1 from private.nutri_push_subscriptions s where s.endpoint=v_endpoint and s.user_id=u) then raise exception 'Limite de aparelhos alcançado' using errcode='22023'; end if;
   insert into private.nutri_push_subscriptions(user_id,patient_id,endpoint,p256dh,auth) values(u,p,v_endpoint,sub#>>'{keys,p256dh}',sub#>>'{keys,auth}')
    on conflict(endpoint) do update set consent_at=case when not nutri_push_subscriptions.active or nutri_push_subscriptions.patient_id<>excluded.patient_id then now() else nutri_push_subscriptions.consent_at end,
    patient_id=excluded.patient_id,p256dh=excluded.p256dh,auth=excluded.auth,active=true,updated_at=now()
    where nutri_push_subscriptions.user_id=u;
   if not found then raise exception 'Inscrição pertence a outra conta' using errcode='42501'; end if;
  end if;
 elsif p_action<>'snapshot' then raise exception 'Ação inválida' using errcode='22023'; end if;
 select jsonb_build_object('appointments',appointments,'questionnaires',questionnaires,'appointment_minutes',appointment_minutes,'questionnaire_time',to_char(questionnaire_time,'HH24:MI'),'timezone',timezone) into result
  from private.nutri_push_preferences where user_id=u and patient_id=p;
 return jsonb_build_object('enabled',cfg.enabled and cfg.public_key<>'','public_key',cfg.public_key,'preferences',coalesce(result,'{}'::jsonb),'devices',(select count(*) from private.nutri_push_subscriptions where user_id=u and patient_id=p and active));
end $$;

create function public.nutri_reminders(p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language sql security invoker set search_path='' as $$select private.nutri_reminders_impl(p_action,p_data)$$;

-- The current questionnaire period uses Sao Paulo, matching submit_questionnaire.
-- The selected zone only determines delivery time. PostgreSQL resolves DST gaps
-- forward and overlaps to standard time. One stable key prevents duplicate sends.
create function private.nutri_push_candidates(p_now timestamptz)
returns table(subscription_id uuid,event_key text,kind text,due_at timestamptz,expires_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare s record; r record; day date; start_day date; period_day date; interval_days integer; period_key text; due timestamptz;
begin
 if not exists(select 1 from private.nutri_push_config where enabled and public_key<>'') then return; end if;
 for s in select ps.*,pp.appointments,pp.questionnaires,pp.appointment_minutes,pp.questionnaire_time,pp.timezone
  from private.nutri_push_subscriptions ps join private.nutri_push_preferences pp using(user_id,patient_id)
  join public.patients pat on pat.id=ps.patient_id and pat.user_id=ps.user_id
  join auth.users account on account.id=ps.user_id and not coalesce(account.is_anonymous,false)
  where ps.active loop
  if s.appointments then
   return query select s.id,'appointment:'||a.id::text||':'||extract(epoch from a.start_at)::text,'appointment',a.start_at-make_interval(mins=>s.appointment_minutes),a.start_at
    from public.appointments a join public.patients p on p.id=a.patient_id and p.clinician_id=a.clinician_id
    where a.patient_id=s.patient_id and a.status='scheduled' and a.start_at>p_now and a.start_at-make_interval(mins=>s.appointment_minutes)<=p_now+interval '1 day';
  end if;
  if not s.questionnaires then continue; end if;
  day:=(p_now at time zone 'America/Sao_Paulo')::date;
  for r in select pr.* from public.patient_records pr join public.patients p on p.id=pr.patient_id and p.clinician_id=pr.clinician_id
   where pr.patient_id=s.patient_id and pr.kind='questionnaire_assignment' and pr.visibility='patient' and pr.data->>'archived' is distinct from 'true' loop
   begin
    start_day:=coalesce(nullif(r.data->>'availableOn','')::date,(r.created_at at time zone 'America/Sao_Paulo')::date);
    interval_days:=coalesce((r.data->>'intervalDays')::integer,0);
   exception when others then continue; end;
   if start_day>day or interval_days not between 0 and 365 then continue; end if;
   period_day:=case when interval_days=0 then start_day else start_day+((day-start_day)/interval_days)*interval_days end;
   period_key:=case when interval_days=0 then 'once' else period_day::text end;
   if exists(select 1 from public.patient_records response where response.patient_id=s.patient_id and response.kind='form_response' and response.data->>'assignmentId'=r.id::text and response.data->>'assignmentVersion'=r.version::text and response.data->>'period'=period_key) then continue; end if;
   due:=(greatest(period_day,(s.consent_at at time zone s.timezone)::date)+s.questionnaire_time) at time zone s.timezone;
   -- Consent after today's chosen hour schedules tomorrow's wall-clock hour,
   -- rather than sending a catch-up immediately. Recompute through the zone
   -- instead of adding 24h so DST transitions keep the selected local time.
   if due<s.consent_at then due:=(((s.consent_at at time zone s.timezone)::date+1)+s.questionnaire_time) at time zone s.timezone;end if;
   subscription_id:=s.id;event_key:='questionnaire:'||r.id::text||':'||r.version::text||':'||period_key;kind:='questionnaire';due_at:=due;
   expires_at:=least(due+interval '24 hours',case when interval_days=0 then 'infinity'::timestamptz else ((period_day+interval_days)::timestamp at time zone 'America/Sao_Paulo') end);
   return next;
  end loop;
 end loop;
end $$;

-- Worker-only RPC; exact service_role grants are the authority boundary.
create function private.nutri_push_worker_impl(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare now_at timestamptz:=clock_timestamp(); result jsonb; job private.nutri_push_deliveries; outcome text;
begin
 if p_action='claim' then
  -- Unknown outcomes are never blindly retried after a process died.
  update private.nutri_push_deliveries set status='uncertain',updated_at=now_at where status='sending' and lease_until<now_at;
  update private.nutri_push_deliveries set status='expired',updated_at=now_at where status='queued' and expires_at<=now_at;
  insert into private.nutri_push_deliveries(subscription_id,event_key,kind,due_at,expires_at,next_attempt)
   select c.subscription_id,c.event_key,c.kind,c.due_at,c.expires_at,now_at from private.nutri_push_candidates(now_at) c where c.due_at<=now_at and c.expires_at>now_at and c.due_at>=now_at-interval '24 hours'
   on conflict(subscription_id,event_key) do update set due_at=excluded.due_at,expires_at=excluded.expires_at,status='queued',
    next_attempt=case when nutri_push_deliveries.status='queued' then nutri_push_deliveries.next_attempt else now_at end,
    attempts=case when nutri_push_deliveries.status='queued' then nutri_push_deliveries.attempts else 0 end
    where nutri_push_deliveries.status in('queued','cancelled','expired');
  update private.nutri_push_deliveries j set status='cancelled',updated_at=now_at where status='queued' and not exists(select 1 from private.nutri_push_candidates(now_at) c where c.subscription_id=j.subscription_id and c.event_key=j.event_key and c.due_at<=now_at and c.expires_at>now_at);
  with picked as(select id from private.nutri_push_deliveries where status='queued' and next_attempt<=now_at and expires_at>now_at order by due_at,id limit 3 for update skip locked), claimed as(
   update private.nutri_push_deliveries j set status='sending',attempts=attempts+1,lease=gen_random_uuid(),lease_until=now_at+interval '3 minutes',updated_at=now_at from picked where j.id=picked.id returning j.*)
  select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'lease',j.lease,'kind',j.kind,'expires_at',j.expires_at,'userId',s.user_id,'subscription',jsonb_build_object('endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth)))),'[]'::jsonb) into result from claimed j join private.nutri_push_subscriptions s on s.id=j.subscription_id;
  return result;
 end if;
 select * into job from private.nutri_push_deliveries where id=(p_data->>'id')::uuid and lease=(p_data->>'lease')::uuid and status='sending' and lease_until>now_at for update;
 if not found then return jsonb_build_object('valid',false); end if;
 if p_action='validate' then
  return jsonb_build_object('valid',exists(select 1 from private.nutri_push_candidates(now_at) c where c.subscription_id=job.subscription_id and c.event_key=job.event_key and c.due_at<=now_at and c.expires_at>now_at));
 elsif p_action='finish' then
  outcome:=p_data->>'outcome';
  if outcome not in('sent','cancelled','expired','failed','uncertain','gone','retry') then raise exception 'Resultado inválido' using errcode='22023'; end if;
  if outcome='gone' then update private.nutri_push_subscriptions set active=false,updated_at=now_at where id=job.subscription_id;end if;
  update private.nutri_push_deliveries set status=case when outcome='retry' and attempts<4 and expires_at>now_at+interval '5 minutes' then 'queued' when outcome in('gone','retry') then 'failed' else outcome end,
    next_attempt=now_at+make_interval(secs=>least(3600,300*job.attempts)),lease=null,lease_until=null,updated_at=now_at where id=job.id;
  return jsonb_build_object('recorded',true);
 end if;
 raise exception 'Ação inválida' using errcode='22023';
end $$;
create function public.nutri_push_worker(p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language sql security invoker set search_path='' as $$select private.nutri_push_worker_impl(p_action,p_data)$$;

revoke all on function private.nutri_push_endpoint_ok(text),private.nutri_push_candidates(timestamptz),private.nutri_reminders_impl(text,jsonb),public.nutri_reminders(text,jsonb),private.nutri_push_worker_impl(text,jsonb),public.nutri_push_worker(text,jsonb) from public,anon,authenticated,service_role;
grant usage on schema private to authenticated,service_role;
grant execute on function private.nutri_reminders_impl(text,jsonb),public.nutri_reminders(text,jsonb) to authenticated;
grant execute on function private.nutri_push_worker_impl(text,jsonb),public.nutri_push_worker(text,jsonb) to service_role;
comment on function public.nutri_reminders(text,jsonb) is 'Patient opt-in preferences; authority derives only from auth.uid and patients.user_id.';
comment on function public.nutri_push_worker(text,jsonb) is 'Machine-only reminder claim, canonical revalidation and outcome ledger. No HTTP performed in SQL.';
commit;
