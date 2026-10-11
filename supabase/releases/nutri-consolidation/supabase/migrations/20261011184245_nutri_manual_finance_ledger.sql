-- LOCAL PROPOSAL ONLY. Target: Torque Nutri (mmdsmpetwhcfiyubhaah).
-- Never run in the Personal project. Requires the captured Nutri schema.
-- This records confirmed MANUAL movements; it does not initiate payments.
begin;

alter table public.financial_entries
  add column competency_on date,
  add column installment_group_id uuid,
  add column installment_index integer,
  add column installment_count integer,
  add constraint financial_entries_installments_check check (
    (installment_group_id is null and installment_index is null and installment_count is null)
    or (installment_group_id is not null and installment_index is not null and installment_count is not null
      and installment_count between 1 and 60 and installment_index between 1 and installment_count)
  );
create unique index financial_entries_installment_slot
  on public.financial_entries(owner_id, installment_group_id, installment_index)
  where installment_group_id is not null;
create index financial_entries_owner_due on public.financial_entries(owner_id, due_on, id);
comment on column public.financial_entries.competency_on is
  'Competência informada pelo profissional. NULL significa desconhecida; nunca inferir pelo vencimento.';

create table private.nutri_finance_operations (
  owner_id uuid not null references auth.users(id) on delete restrict,
  operation_id uuid not null,
  command jsonb not null check (jsonb_typeof(command) = 'object'),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  primary key(owner_id, operation_id)
);
create table private.nutri_finance_events (
  id uuid primary key default extensions.gen_random_uuid(),
  entry_id uuid not null references public.financial_entries(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete restrict,
  operation_id uuid,
  kind text not null check (kind in ('opening','create','correction','payment','refund','void')),
  source text not null check (source in ('manual','legacy')),
  amount_cents bigint not null check (amount_cents between 0 and 1000000000),
  occurred_on date not null,
  method text not null default '' check (length(method) <= 80),
  reason text not null default '' check (length(reason) <= 4000),
  entry_version integer not null check (entry_version > 0),
  entry_snapshot jsonb not null check (jsonb_typeof(entry_snapshot) = 'object'),
  previous_snapshot jsonb,
  created_at timestamptz not null default clock_timestamp(),
  constraint nutri_finance_event_source_check check (
    (kind = 'opening' and source = 'legacy' and operation_id is null)
    or (kind <> 'opening' and source = 'manual' and operation_id is not null)
  ),
  constraint nutri_finance_event_amount_check check (
    kind = 'opening' or (kind in ('payment','refund') and amount_cents > 0)
    or (kind in ('create','correction','void') and amount_cents = 0)
  ),
  unique(owner_id, operation_id, entry_id, kind)
);
create index nutri_finance_events_entry on private.nutri_finance_events(entry_id, created_at, id);
create index nutri_finance_events_owner on private.nutri_finance_events(owner_id, created_at, id);
alter table private.nutri_finance_operations enable row level security;
alter table private.nutri_finance_events enable row level security;
revoke all on private.nutri_finance_operations, private.nutri_finance_events from public, anon, authenticated, service_role;

create function private.nutri_finance_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'O histórico financeiro é imutável.' using errcode = '42501';
end;
$$;
revoke all on function private.nutri_finance_immutable() from public, anon, authenticated, service_role;
create trigger nutri_finance_events_immutable before update or delete on private.nutri_finance_events
  for each row execute function private.nutri_finance_immutable();
create trigger nutri_finance_events_no_truncate before truncate on private.nutri_finance_events
  for each statement execute function private.nutri_finance_immutable();
create trigger nutri_finance_operations_immutable before update or delete on private.nutri_finance_operations
  for each row execute function private.nutri_finance_immutable();
create trigger nutri_finance_operations_no_truncate before truncate on private.nutri_finance_operations
  for each statement execute function private.nutri_finance_immutable();

-- Preserve the original receipt facts at each event; future title/name changes
-- cannot silently change a historical receipt. No auth/session secrets are copied.
create function private.nutri_finance_entry_snapshot(p_entry public.financial_entries)
returns jsonb language sql stable set search_path = '' as $$
  select pg_catalog.to_jsonb(p_entry) || pg_catalog.jsonb_build_object(
    'clinic_name',c.name,'professional_name',c.professional_name,'crn',c.crn,'patient_name',p.name)
  from public.clinics c left join public.patients p on p.id = p_entry.patient_id
  where c.id = p_entry.clinic_id;
$$;
revoke all on function private.nutri_finance_entry_snapshot(public.financial_entries) from public, anon, authenticated, service_role;

-- Explicit legacy opening, not a new payment or a guessed cash date.
-- Unknown competency remains NULL. Existing entries and their history survive.
insert into private.nutri_finance_events(entry_id,owner_id,kind,source,amount_cents,
  occurred_on,method,reason,entry_version,entry_snapshot)
select e.id,e.owner_id,'opening','legacy',case when e.status = 'paid' then e.amount_cents else 0 end,
  coalesce(e.paid_on,e.created_at::date),e.method,'Saldo de abertura importado do registro anterior.',
  e.version,private.nutri_finance_entry_snapshot(e)
from public.financial_entries e;

-- Close both table-level and column-level direct write paths. New clients only
-- write through the audited RPC; old clients receive a permission error.
revoke insert, update, delete, truncate on public.financial_entries from public, anon, authenticated;
do $$
declare col record;
begin
  for col in select attname from pg_catalog.pg_attribute
    where attrelid = 'public.financial_entries'::regclass and attnum > 0 and not attisdropped
  loop
    execute pg_catalog.format('revoke insert (%I), update (%I) on public.financial_entries from public, anon, authenticated',col.attname,col.attname);
  end loop;
end;
$$;

create function private.nutri_finance_snapshot_impl()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_entries jsonb; v_events jsonb;
begin
  if v_user is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  select coalesce(pg_catalog.jsonb_agg(
    (case when e.owner_id = v_user then pg_catalog.to_jsonb(e) else pg_catalog.to_jsonb(e) - 'note' end)
    || pg_catalog.jsonb_build_object(
      'ledger_managed',true,'received_cents',m.received,'refunded_cents',m.refunded,
      'net_paid_cents',m.received-m.refunded,
      'balance_cents',case when e.status = 'void' then 0 else e.amount_cents-m.received end)
    order by e.due_on,e.created_at,e.id),'[]'::jsonb)
  into v_entries
  from public.financial_entries e
  cross join lateral (
    select coalesce(sum(v.amount_cents) filter(where v.kind in ('payment','opening')),0)::bigint as received,
      coalesce(sum(v.amount_cents) filter(where v.kind = 'refund'),0)::bigint as refunded
    from private.nutri_finance_events v where v.entry_id = e.id
  ) m
  where e.owner_id = v_user or (e.kind = 'income' and exists(
    select 1 from public.patients p where p.id = e.patient_id and p.user_id = v_user));
  select coalesce(pg_catalog.jsonb_agg(
    case when e.owner_id = v_user then pg_catalog.to_jsonb(v)
    else (pg_catalog.to_jsonb(v) - 'reason' - 'previous_snapshot' - 'owner_id' - 'operation_id')
      || pg_catalog.jsonb_build_object('entry_snapshot',v.entry_snapshot - 'note' - 'owner_id') end
    order by v.created_at,v.id),'[]'::jsonb)
  into v_events
  from private.nutri_finance_events v join public.financial_entries e on e.id = v.entry_id
  where e.owner_id = v_user or (e.kind = 'income' and v.kind in ('opening','payment','refund') and exists(
    select 1 from public.patients p where p.id = e.patient_id and p.user_id = v_user));
  return pg_catalog.jsonb_build_object('version',1,'entries',v_entries,'events',v_events);
end;
$$;
revoke all on function private.nutri_finance_snapshot_impl() from public, anon, service_role;
grant execute on function private.nutri_finance_snapshot_impl() to authenticated;

create function private.nutri_finance_command_impl(p_operation_id uuid,p_command jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid(); v_action text; v_old_command jsonb; v_result jsonb;
  v_entry public.financial_entries; v_before jsonb; v_snapshot jsonb; v_event_kind text;
  v_clinic uuid; v_patient uuid; v_entry_id uuid; v_expected integer; v_reason text;
  v_amount bigint; v_received bigint; v_refunded bigint; v_on date; v_method text;
  v_parts jsonb; v_part jsonb; v_count integer; v_index integer := 0; v_group uuid;
  v_total bigint; v_ids uuid[] := array[]::uuid[]; v_title text; v_note text;
begin
  if v_user is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  if p_operation_id is null or p_command is null or pg_catalog.jsonb_typeof(p_command) <> 'object'
    or pg_catalog.octet_length(p_command::text) > 65536 then
    raise exception 'Operação financeira inválida.' using errcode = '22023';
  end if;
  if not exists(select 1 from public.clinics c where c.owner_id = v_user) then
    raise exception 'Somente o responsável pelo consultório pode registrar movimentos.' using errcode = '42501';
  end if;
  -- Same owner/operation serializes retries before checking CAS/version.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text || ':' || p_operation_id::text,0));
  select o.command,o.result into v_old_command,v_result from private.nutri_finance_operations o
    where o.owner_id = v_user and o.operation_id = p_operation_id;
  if found then
    if v_old_command is distinct from p_command then
      raise exception 'A operação já foi usada com outros dados.' using errcode = '22023';
    end if;
    return v_result;
  end if;
  v_action := p_command->>'action';
  v_reason := coalesce(pg_catalog.btrim(p_command->>'reason'),'');
  if length(v_reason) > 4000 or (v_action in ('correct','refund','void') and v_reason = '') then
    raise exception 'Informe o motivo do registro (até 4000 caracteres).' using errcode = '22023';
  end if;
  if v_action = 'create' then
    v_clinic := (p_command->>'clinic_id')::uuid;
    v_patient := nullif(p_command->>'patient_id','')::uuid;
    if not exists(select 1 from public.clinics c where c.id = v_clinic and c.owner_id = v_user) then
      raise exception 'Consultório não encontrado.' using errcode = '42501';
    end if;
    if v_patient is not null and not exists(select 1 from public.patients p
      where p.id = v_patient and p.clinic_id = v_clinic and p.clinician_id = v_user) then
      raise exception 'Paciente não encontrado neste consultório.' using errcode = '42501';
    end if;
    v_title := pg_catalog.btrim(p_command->>'title');
    v_method := coalesce(p_command->>'method',''); v_note := coalesce(p_command->>'note','');
    if v_title is null or length(v_title) not between 1 and 200 or length(v_method) > 80 or length(v_note) > 4000
      or coalesce(p_command->>'kind','') not in ('income','expense') then
      raise exception 'Confira descrição, tipo e observações.' using errcode = '22023';
    end if;
    v_parts := case when p_command ? 'installments' then p_command->'installments'
      else pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'amount_cents',p_command->'amount_cents','due_on',p_command->'due_on','competency_on',p_command->'competency_on')) end;
    if pg_catalog.jsonb_typeof(v_parts) is distinct from 'array' then
      raise exception 'Parcelas inválidas.' using errcode = '22023';
    end if;
    v_count := pg_catalog.jsonb_array_length(v_parts);
    if v_count not between 1 and 60 then raise exception 'Informe entre 1 e 60 parcelas.' using errcode = '22023'; end if;
    v_total := 0;
    for v_part in select value from pg_catalog.jsonb_array_elements(v_parts) loop
      if coalesce(v_part->>'amount_cents','') !~ '^[0-9]{1,10}$'
        or (v_part->>'amount_cents')::bigint not between 1 and 1000000000
        or coalesce(v_part->>'due_on','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        or (nullif(v_part->>'competency_on','') is not null and v_part->>'competency_on' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then
        raise exception 'Confira valor e datas das parcelas.' using errcode = '22023';
      end if;
      v_total := v_total + (v_part->>'amount_cents')::bigint;
    end loop;
    if v_total > 1000000000 or (p_command ? 'installments' and p_command ? 'amount_cents'
      and (p_command->>'amount_cents')::bigint is distinct from v_total) then
      raise exception 'A soma das parcelas deve corresponder ao valor total (máximo R$ 10 milhões).' using errcode = '22023';
    end if;
    if v_count > 1 then v_group := extensions.gen_random_uuid(); end if;
    for v_part in select value from pg_catalog.jsonb_array_elements(v_parts) loop
      v_index := v_index + 1;
      insert into public.financial_entries(clinic_id,owner_id,patient_id,kind,title,amount_cents,due_on,
        competency_on,method,note,installment_group_id,installment_index,installment_count)
      values(v_clinic,v_user,v_patient,p_command->>'kind',v_title,(v_part->>'amount_cents')::bigint,
        (v_part->>'due_on')::date,nullif(v_part->>'competency_on','')::date,v_method,v_note,
        v_group,case when v_group is not null then v_index end,case when v_group is not null then v_count end)
      returning * into v_entry;
      v_ids := pg_catalog.array_append(v_ids,v_entry.id);
      insert into private.nutri_finance_events(entry_id,owner_id,operation_id,kind,source,amount_cents,
        occurred_on,method,reason,entry_version,entry_snapshot)
      values(v_entry.id,v_user,p_operation_id,'create','manual',0,current_date,v_method,v_reason,
        v_entry.version,private.nutri_finance_entry_snapshot(v_entry));
    end loop;
  elsif v_action in ('correct','pay','refund','void') then
    v_entry_id := (p_command->>'entry_id')::uuid;
    v_expected := (p_command->>'expected_version')::integer;
    if v_entry_id is null or v_expected is null or v_expected < 1 then
      raise exception 'Atualize os dados antes de registrar.' using errcode = '22023';
    end if;
    select * into v_entry from public.financial_entries e
      where e.id = v_entry_id and e.owner_id = v_user for update;
    if not found then raise exception 'Lançamento não encontrado.' using errcode = '42501'; end if;
    if v_entry.version <> v_expected then
      raise exception 'O lançamento mudou. Atualize antes de registrar.' using errcode = '40001';
    end if;
    if v_entry.status = 'void' then raise exception 'Lançamento cancelado não aceita movimentos.' using errcode = '22023'; end if;
    v_before := private.nutri_finance_entry_snapshot(v_entry);
    select coalesce(sum(e.amount_cents) filter(where e.kind in ('payment','opening')),0),
      coalesce(sum(e.amount_cents) filter(where e.kind = 'refund'),0)
      into v_received,v_refunded from private.nutri_finance_events e where e.entry_id = v_entry.id;
    v_amount := 0; v_on := current_date; v_method := coalesce(p_command->>'method',v_entry.method);
    if length(v_method) > 80 then raise exception 'Forma de pagamento inválida.' using errcode = '22023'; end if;
    if v_action in ('pay','refund') then
      if coalesce(p_command->>'amount_cents','') !~ '^[0-9]{1,10}$'
        or (p_command->>'amount_cents')::bigint not between 1 and 1000000000
        or coalesce(p_command->>'occurred_on','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        raise exception 'Confira valor e data do movimento.' using errcode = '22023';
      end if;
      v_amount := (p_command->>'amount_cents')::bigint; v_on := (p_command->>'occurred_on')::date;
      if v_on > current_date then raise exception 'Um movimento confirmado não pode ter data futura.' using errcode = '22023'; end if;
      if v_action = 'pay' then
        if v_amount > v_entry.amount_cents-v_received then
          raise exception 'O valor excede o saldo pendente.' using errcode = '22023';
        end if;
        v_received := v_received+v_amount; v_event_kind := 'payment';
        update public.financial_entries set status = case when amount_cents = v_received then 'paid' else 'pending' end,
          paid_on = case when amount_cents = v_received then greatest(v_on,
            (select max(x.occurred_on) from private.nutri_finance_events x
              where x.entry_id = v_entry.id and x.kind in ('payment','opening') and x.amount_cents > 0)) end,method = v_method
          where id = v_entry.id returning * into v_entry;
      else
        if v_amount > v_received-v_refunded then
          raise exception 'A devolução excede o valor líquido confirmado.' using errcode = '22023';
        end if;
        if exists(select 1 from private.nutri_finance_events e where e.entry_id = v_entry.id
          and e.kind in ('payment','opening') and e.amount_cents > 0 and e.occurred_on > v_on) then
          raise exception 'A devolução não pode anteceder recebimentos registrados.' using errcode = '22023';
        end if;
        v_event_kind := 'refund';
        -- Preserve settlement: refunds do not recreate a debt.
        update public.financial_entries set method = method where id = v_entry.id returning * into v_entry;
      end if;
    elsif v_action = 'void' then
      if v_received > 0 then
        raise exception 'Lançamento com pagamento não pode ser cancelado; registre a devolução.' using errcode = '22023';
      end if;
      v_event_kind := 'void';
      update public.financial_entries set status = 'void',paid_on = null where id = v_entry.id returning * into v_entry;
    else
      v_event_kind := 'correction';
      if p_command ? 'amount_cents' and (coalesce(p_command->>'amount_cents','') !~ '^[0-9]{1,10}$'
        or (p_command->>'amount_cents')::bigint not between 1 and 1000000000) then
        raise exception 'Valor inválido.' using errcode = '22023';
      end if;
      if coalesce((p_command->>'amount_cents')::bigint,v_entry.amount_cents) < v_received then
        raise exception 'O valor não pode ser menor que os pagamentos já registrados.' using errcode = '22023';
      end if;
      if (p_command ? 'due_on' and coalesce(p_command->>'due_on','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
        or (nullif(p_command->>'competency_on','') is not null and p_command->>'competency_on' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then
        raise exception 'Data inválida.' using errcode = '22023';
      end if;
      update public.financial_entries e set
        title = case when p_command ? 'title' then pg_catalog.btrim(p_command->>'title') else e.title end,
        amount_cents = coalesce((p_command->>'amount_cents')::bigint,e.amount_cents),
        due_on = case when p_command ? 'due_on' then (p_command->>'due_on')::date else e.due_on end,
        competency_on = case when p_command ? 'competency_on' then nullif(p_command->>'competency_on','')::date else e.competency_on end,
        method = v_method,note = case when p_command ? 'note' then coalesce(p_command->>'note','') else e.note end,
        status = case when coalesce((p_command->>'amount_cents')::bigint,e.amount_cents) = v_received then 'paid' else 'pending' end,
        paid_on = case when coalesce((p_command->>'amount_cents')::bigint,e.amount_cents) = v_received then
          (select max(x.occurred_on) from private.nutri_finance_events x where x.entry_id = e.id and x.kind in ('payment','opening') and x.amount_cents > 0) end
      where e.id = v_entry.id returning * into v_entry;
    end if;
    v_ids := pg_catalog.array_append(v_ids,v_entry.id);
    insert into private.nutri_finance_events(entry_id,owner_id,operation_id,kind,source,amount_cents,
      occurred_on,method,reason,entry_version,entry_snapshot,previous_snapshot)
    values(v_entry.id,v_user,p_operation_id,v_event_kind,'manual',v_amount,v_on,v_method,v_reason,
      v_entry.version,private.nutri_finance_entry_snapshot(v_entry),v_before);
  else
    raise exception 'Ação financeira inválida.' using errcode = '22023';
  end if;
  v_snapshot := private.nutri_finance_snapshot_impl();
  v_result := pg_catalog.jsonb_build_object('version',1,'operation_id',p_operation_id,'entry_ids',pg_catalog.to_jsonb(v_ids),
    'entries',(select coalesce(pg_catalog.jsonb_agg(x),'[]'::jsonb) from pg_catalog.jsonb_array_elements(v_snapshot->'entries') x where (x->>'id')::uuid = any(v_ids)),
    'events',(select coalesce(pg_catalog.jsonb_agg(x),'[]'::jsonb) from pg_catalog.jsonb_array_elements(v_snapshot->'events') x where x->>'operation_id' = p_operation_id::text));
  insert into private.nutri_finance_operations(owner_id,operation_id,command,result)
    values(v_user,p_operation_id,p_command,v_result);
  return v_result;
end;
$$;
revoke all on function private.nutri_finance_command_impl(uuid,jsonb) from public, anon, service_role;
grant execute on function private.nutri_finance_command_impl(uuid,jsonb) to authenticated;

create function public.nutri_finance_capabilities()
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  return '{"version":1,"manual":true,"installments":true,"partial_payments":true,"refunds":true,"competency":true,"idempotent":true}'::jsonb;
end;
$$;
create function public.nutri_finance_snapshot()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.nutri_finance_snapshot_impl();
$$;
create function public.nutri_finance_command(p_operation_id uuid,p_command jsonb)
returns jsonb language sql volatile security invoker set search_path = '' as $$
  select private.nutri_finance_command_impl(p_operation_id,p_command);
$$;
revoke all on function public.nutri_finance_capabilities(), public.nutri_finance_snapshot(),
  public.nutri_finance_command(uuid,jsonb) from public, anon, service_role;
grant execute on function public.nutri_finance_capabilities(), public.nutri_finance_snapshot(),
  public.nutri_finance_command(uuid,jsonb) to authenticated;
grant usage on schema private to authenticated;
commit;
