-- PROPOSTA LOCAL, NAO APLICADA. Nao incluir automaticamente no deploy/migrations.
-- Requer public.academias, public.saas_admins, public.saas_clientes e Supabase Auth.
-- Nenhum usuario/equipe e inserido. Nenhuma API de pagamento/mensagem e chamada.
begin;
create schema if not exists torque_hq;
revoke all on schema torque_hq from public, anon, authenticated;

create table torque_hq.staff (
  user_id uuid primary key references auth.users(id),
  role text not null check (role in ('finance','support','sales','engineering','viewer')),
  enabled boolean not null default false,
  created_at timestamptz not null default now()
);
create table torque_hq.leads (
  id uuid primary key default gen_random_uuid(), name text not null,
  stage text not null check (stage in ('novo','contato','demo','proposta','fechado','perdido')),
  source text not null default '', notes text not null default '',
  owner uuid references auth.users(id), next_action_at timestamptz, loss_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (stage <> 'perdido' or length(trim(loss_reason)) > 0)
);
create table torque_hq.invoices (
  id uuid primary key default gen_random_uuid(), account_id uuid not null references public.academias(id),
  label text not null default '', due_date date not null, competence_date date,
  total_cents bigint not null check (total_cents between 1 and 100000000000),
  status text not null default 'open' check (status in ('open','partial','paid')),
  origin text not null default 'manual' check (origin='manual'),
  created_at timestamptz not null default now()
);
create table torque_hq.payments (
  id uuid primary key default gen_random_uuid(), invoice_id uuid not null references torque_hq.invoices(id),
  account_id uuid not null references public.academias(id), paid_at timestamptz not null,
  amount_cents bigint not null check (amount_cents between 1 and 100000000000),
  kind text not null default 'payment' check (kind='payment'),
  confirmed boolean not null default true check(confirmed), origin text not null default 'manual' check(origin='manual'),
  reference text not null default '', actor_id uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create unique index hq_payment_reference on torque_hq.payments(invoice_id,reference) where reference <> '';
create table torque_hq.expenses (
  id uuid primary key default gen_random_uuid(), payee text not null, label text not null,
  due_date date not null, competence_date date,
  total_cents bigint not null check (total_cents between 1 and 100000000000),
  status text not null default 'open' check(status in ('open','partial','paid')),
  created_at timestamptz not null default now()
);
create table torque_hq.expense_payments (
  id uuid primary key default gen_random_uuid(), expense_id uuid not null references torque_hq.expenses(id),
  paid_at timestamptz not null, amount_cents bigint not null check(amount_cents between 1 and 100000000000),
  reference text not null default '', actor_id uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create unique index hq_expense_payment_reference on torque_hq.expense_payments(expense_id,reference) where reference <> '';
create table torque_hq.incidents (
  id uuid primary key default gen_random_uuid(), title text not null,
  severity text not null check(severity in ('baixa','media','alta','critica')),
  status text not null check(status in ('aberto','investigando','monitorando','resolvido')),
  owner uuid references auth.users(id), release text not null default '', account_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table torque_hq.cases (
  id uuid primary key default gen_random_uuid(), account_id uuid references public.academias(id),
  subject text not null, channel text not null check(channel in ('manual','app','email','whatsapp')),
  priority text not null check(priority in ('baixa','media','alta','critica')),
  status text not null check(status in ('aberto','em_andamento','aguardando','resolvido')),
  owner uuid references auth.users(id), next_action_at timestamptz,
  incident_id uuid references torque_hq.incidents(id), created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), first_response_at timestamptz, resolved_at timestamptz
);
create table torque_hq.case_messages (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references torque_hq.cases(id),
  actor_id uuid not null references auth.users(id), body text not null,
  visibility text not null check(visibility in ('internal','customer')),
  delivery text not null check(delivery in ('internal','not_sent')),
  created_at timestamptz not null default now(),
  check ((visibility='internal' and delivery='internal') or (visibility='customer' and delivery='not_sent'))
);
create table torque_hq.subscription_requests (
  id uuid primary key default gen_random_uuid(), account_id uuid not null references public.academias(id),
  external_id text, effective_at date, note text not null default '', status text not null default 'requested' check(status='requested'),
  actor_id uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table torque_hq.commands (
  actor_id uuid not null references auth.users(id), idempotency_key text not null,
  payload_hash text not null, result jsonb, created_at timestamptz not null default now(),
  primary key(actor_id,idempotency_key)
);
create table torque_hq.audit (
  id uuid primary key default gen_random_uuid(), actor_id uuid not null references auth.users(id),
  actor_role text not null, action text not null, object_id uuid not null,
  reason text not null, idempotency_key text not null, payload_hash text not null,
  before_value jsonb, after_value jsonb, created_at timestamptz not null default now()
);
create index hq_lead_owner on torque_hq.leads(owner,created_at);
create index hq_case_owner on torque_hq.cases(owner,created_at);
create index hq_case_message_parent on torque_hq.case_messages(case_id,created_at);
create index hq_invoice_account on torque_hq.invoices(account_id,due_date);
create index hq_payment_invoice on torque_hq.payments(invoice_id);
create index hq_expense_payment_parent on torque_hq.expense_payments(expense_id);

-- As tabelas nao sao APIs. Somente as duas RPCs publicas abaixo sao endpoints.
do $block$
declare t text;
begin
  foreach t in array array['staff','leads','invoices','payments','expenses','expense_payments','incidents','cases','case_messages','subscription_requests','commands','audit'] loop
    execute format('alter table torque_hq.%I enable row level security',t);
  end loop;
end $block$;
revoke all on all tables in schema torque_hq from public,anon,authenticated;
revoke all on all sequences in schema torque_hq from public,anon,authenticated;
alter default privileges in schema torque_hq revoke all on tables from public,anon,authenticated;
alter default privileges in schema torque_hq revoke execute on functions from public,anon,authenticated;

create function torque_hq.actor_role() returns text
language plpgsql stable security invoker set search_path='' as $$
declare r text;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='Autenticacao obrigatoria'; end if;
  if exists(select 1 from public.saas_admins where user_id=auth.uid()) then return 'admin'; end if;
  select role into r from torque_hq.staff where user_id=auth.uid() and enabled;
  if r is null then raise exception using errcode='42501',message='Acesso restrito ao HQ'; end if;
  return r;
end $$;
create function torque_hq.permissions(r text) returns text[]
language sql immutable security invoker set search_path='' as $$
  select case r
    when 'admin' then array['sales.read','sales.write','customers.read','customers.write','finance.read','finance.write','support.read','support.write','health.read','health.write','audit.read','reports.export']
    when 'finance' then array['customers.read','finance.read','finance.write','customers.write','reports.export']
    when 'sales' then array['sales.read','sales.write','customers.read']
    when 'support' then array['customers.read','support.read','support.write']
    when 'engineering' then array['health.read','health.write']
    when 'viewer' then array['customers.read'] else '{}'::text[] end
$$;
create function torque_hq.txt(v jsonb,k text,required boolean default false,maxlen integer default 500) returns text
language plpgsql immutable security invoker set search_path='' as $$
declare s text;
begin
  if not(v ? k) or v->k='null'::jsonb then
    if required then raise exception 'Campo obrigatorio: %',k; end if; return null;
  end if;
  if jsonb_typeof(v->k)<>'string' then raise exception 'Texto invalido: %',k; end if;
  s:=trim(v->>k);
  if length(s)>maxlen or (required and s='') then raise exception 'Texto invalido: %',k; end if;
  return s;
end $$;
create function torque_hq.cents(v jsonb,k text) returns bigint
language plpgsql immutable security invoker set search_path='' as $$
declare n numeric;
begin
  if jsonb_typeof(v->k) is distinct from 'number' or (v->>k)!~'^[0-9]+$' then raise exception 'Centavos inteiros obrigatorios: %',k; end if;
  n:=(v->>k)::numeric;
  if n<1 or n>100000000000 then raise exception 'Valor fora do limite: %',k; end if;
  return n::bigint;
end $$;
create function torque_hq.day(v jsonb,k text,required boolean default true) returns date
language plpgsql immutable security invoker set search_path='' as $$
declare s text; d date;
begin
  s:=torque_hq.txt(v,k,required,10); if s is null or s='' then return null; end if;
  if s!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Data ISO invalida: %',k; end if;
  d:=s::date;
  if d<date '2000-01-01' or d>date '2100-12-31' then raise exception 'Data fora do limite: %',k; end if;
  return d;
end $$;
create function torque_hq.instant(v jsonb,k text,required boolean default false) returns timestamptz
language plpgsql immutable security invoker set search_path='' as $$
declare s text;
begin
  s:=torque_hq.txt(v,k,required,40); if s is null or s='' then return null; end if;
  if s~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return torque_hq.day(v,k,true)::timestamp at time zone 'UTC'; end if;
  if s!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' or left(s,4)::int not between 2000 and 2100 then raise exception 'Instante ISO invalido: %',k; end if;
  return s::timestamptz;
end $$;
create function torque_hq.owner(v jsonb,k text,domain text) returns uuid
language plpgsql stable security invoker set search_path='' as $$
declare u uuid; s text;
begin
  s:=torque_hq.txt(v,k,false,36); if s is null or s='' then return null; end if;
  u:=s::uuid;
  if not exists(select 1 from public.saas_admins where user_id=u)
     and not exists(select 1 from torque_hq.staff where user_id=u and enabled and role=domain) then
    raise exception 'Responsavel nao autorizado para este dominio';
  end if;
  return u;
end $$;

create function public.hq_ops_command(p_command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  who uuid:=auth.uid(); role_name text:=torque_hq.actor_role(); perms text[]:=torque_hq.permissions(role_name);
  typ text; key text; reason text; body jsonb; hashed text; old_hash text; reply jsonb;
  needed text; allowed text[]; obj uuid; account uuid; owner_id uuid; old_row jsonb; new_row jsonb;
  total bigint; amount bigint; received bigint; paid timestamptz; new_stage text; state text; loss text;
  ids uuid[]; ref text; visibility text;
begin
  if jsonb_typeof(p_command) is distinct from 'object' or octet_length(p_command::text)>20000 then raise exception 'Comando invalido'; end if;
  if exists(select 1 from jsonb_object_keys(p_command) k where k not in ('type','idempotencyKey','reason','payload')) then raise exception 'Campo de comando desconhecido'; end if;
  typ:=torque_hq.txt(p_command,'type',true,60); key:=torque_hq.txt(p_command,'idempotencyKey',true,128);
  reason:=torque_hq.txt(p_command,'reason',true,500); body:=p_command->'payload';
  if length(key)<8 or length(reason)<3 or jsonb_typeof(body) is distinct from 'object' then raise exception 'Motivo, chave ou payload invalido'; end if;
  needed:=case
    when typ in ('lead.create','lead.update') then 'sales.write'
    when typ in ('invoice.create','invoice.recordPayment','expense.create','expense.recordPayment') then 'finance.write'
    when typ in ('case.create','case.update','case.message') then 'support.write'
    when typ in ('incident.create','incident.update') then 'health.write'
    when typ='subscription.requestCancel' then 'customers.write' else null end;
  if needed is null then raise exception 'Operacao nao permitida'; end if;
  if not needed=any(perms) then raise exception using errcode='42501',message='Permissao insuficiente'; end if;
  allowed:=case
    when typ='lead.create' then array['name','stage','source','notes','owner','nextActionAt','lossReason']
    when typ='lead.update' then array['id','name','stage','source','notes','owner','nextActionAt','lossReason']
    when typ='invoice.create' then array['accountId','label','dueDate','competenceDate','totalCents']
    when typ='expense.create' then array['payee','label','dueDate','competenceDate','totalCents']
    when typ in ('invoice.recordPayment','expense.recordPayment') then array['id','amountCents','paidAt','reference']
    when typ='case.create' then array['accountId','subject','channel','priority','status','owner','nextActionAt','incidentId']
    when typ='case.update' then array['id','accountId','subject','priority','status','owner','nextActionAt','incidentId']
    when typ='case.message' then array['id','text','visibility']
    when typ='incident.create' then array['title','severity','status','owner','release','accountIds']
    when typ='incident.update' then array['id','title','severity','status','owner','release','accountIds']
    when typ='subscription.requestCancel' then array['accountId','id','effectiveAt','note'] end;
  if exists(select 1 from jsonb_object_keys(body) field where not field=any(allowed)) then raise exception 'Campo de payload desconhecido'; end if;
  hashed:=encode(sha256(convert_to(p_command::text,'UTF8')),'hex');
  insert into torque_hq.commands(actor_id,idempotency_key,payload_hash) values(who,key,hashed) on conflict do nothing;
  if not found then
    select payload_hash,c.result into old_hash,reply from torque_hq.commands c where actor_id=who and idempotency_key=key for update;
    if old_hash<>hashed then raise exception using errcode='22023',message='Chave de idempotencia reutilizada com outro conteudo'; end if;
    if reply is null then raise exception 'Comando anterior ainda nao confirmado'; end if;
    return reply||jsonb_build_object('replayed',true);
  end if;

  if typ='lead.create' then
    owner_id:=coalesce(torque_hq.owner(body,'owner','sales'),who);
    if role_name='sales' and owner_id<>who then raise exception using errcode='42501',message='Comercial so pode atribuir a si'; end if;
    new_stage:=coalesce(torque_hq.txt(body,'stage',false,20),'novo'); loss:=torque_hq.txt(body,'lossReason',false,500);
    if new_stage='perdido' and coalesce(loss,'')='' then raise exception 'Informe motivo da perda'; end if;
    insert into torque_hq.leads(name,stage,source,notes,owner,next_action_at,loss_reason)
      values(torque_hq.txt(body,'name',true,200),new_stage,coalesce(torque_hq.txt(body,'source',false,120),''),coalesce(torque_hq.txt(body,'notes',false,2000),''),owner_id,torque_hq.instant(body,'nextActionAt'),loss)
      returning id,to_jsonb(leads.*) into obj,new_row;
  elsif typ='lead.update' then
    obj:=torque_hq.txt(body,'id',true,36)::uuid;
    select to_jsonb(l.*) into old_row from torque_hq.leads l where id=obj and (role_name='admin' or owner=who) for update;
    if old_row is null then raise exception using errcode='42501',message='Lead nao encontrado ou nao autorizado'; end if;
    owner_id:=case when body ? 'owner' then torque_hq.owner(body,'owner','sales') else (old_row->>'owner')::uuid end;
    if role_name='sales' and owner_id is distinct from who then raise exception using errcode='42501',message='Comercial so pode atribuir a si'; end if;
    new_stage:=coalesce(torque_hq.txt(body,'stage',false,20),old_row->>'stage');
    loss:=case when body ? 'lossReason' then torque_hq.txt(body,'lossReason',false,500) else old_row->>'loss_reason' end;
    if new_stage='perdido' and coalesce(loss,'')='' then raise exception 'Informe motivo da perda'; end if;
    update torque_hq.leads set name=case when body ? 'name' then torque_hq.txt(body,'name',true,200) else name end,stage=new_stage,
      source=coalesce(torque_hq.txt(body,'source',false,120),source),notes=coalesce(torque_hq.txt(body,'notes',false,2000),notes),owner=owner_id,
      next_action_at=case when body ? 'nextActionAt' then torque_hq.instant(body,'nextActionAt') else next_action_at end,
      loss_reason=loss,updated_at=now() where id=obj returning to_jsonb(leads.*) into new_row;
  elsif typ='invoice.create' then
    account:=torque_hq.txt(body,'accountId',true,36)::uuid;
    if not exists(select 1 from public.academias where id=account) then raise exception 'Conta inexistente'; end if;
    insert into torque_hq.invoices(account_id,label,due_date,competence_date,total_cents)
      values(account,coalesce(torque_hq.txt(body,'label',false,200),''),torque_hq.day(body,'dueDate'),torque_hq.day(body,'competenceDate',false),torque_hq.cents(body,'totalCents'))
      returning id,to_jsonb(invoices.*) into obj,new_row;
  elsif typ='expense.create' then
    insert into torque_hq.expenses(payee,label,due_date,competence_date,total_cents)
      values(torque_hq.txt(body,'payee',true,200),torque_hq.txt(body,'label',true,200),torque_hq.day(body,'dueDate'),torque_hq.day(body,'competenceDate',false),torque_hq.cents(body,'totalCents'))
      returning id,to_jsonb(expenses.*) into obj,new_row;
  elsif typ in ('invoice.recordPayment','expense.recordPayment') then
    obj:=torque_hq.txt(body,'id',true,36)::uuid; amount:=torque_hq.cents(body,'amountCents');
    paid:=torque_hq.instant(body,'paidAt',true); ref:=coalesce(torque_hq.txt(body,'reference',false,120),'');
    if paid>now()+interval '1 minute' then raise exception 'Pagamento futuro nao pode ser confirmado'; end if;
    if typ='invoice.recordPayment' then
      select to_jsonb(i.*),total_cents,account_id into old_row,total,account from torque_hq.invoices i where id=obj for update;
      if old_row is null then raise exception 'Fatura inexistente'; end if;
      select coalesce(sum(amount_cents),0) into received from torque_hq.payments where invoice_id=obj;
      if received+amount>total then raise exception 'Pagamento excede saldo da fatura'; end if;
      insert into torque_hq.payments(invoice_id,account_id,paid_at,amount_cents,reference,actor_id) values(obj,account,paid,amount,ref,who);
      update torque_hq.invoices set status=case when received+amount=total then 'paid' else 'partial' end where id=obj returning to_jsonb(invoices.*) into new_row;
    else
      select to_jsonb(e.*),total_cents into old_row,total from torque_hq.expenses e where id=obj for update;
      if old_row is null then raise exception 'Despesa inexistente'; end if;
      select coalesce(sum(amount_cents),0) into received from torque_hq.expense_payments where expense_id=obj;
      if received+amount>total then raise exception 'Pagamento excede saldo da despesa'; end if;
      insert into torque_hq.expense_payments(expense_id,paid_at,amount_cents,reference,actor_id) values(obj,paid,amount,ref,who);
      update torque_hq.expenses set status=case when received+amount=total then 'paid' else 'partial' end where id=obj returning to_jsonb(expenses.*) into new_row;
    end if;
    new_row:=new_row||jsonb_build_object('recordedPayment',jsonb_build_object('amountCents',amount,'paidAt',paid,'reference',ref,'origin','manual'));
  elsif typ in ('incident.create','incident.update') then
    if typ='incident.update' then
      obj:=torque_hq.txt(body,'id',true,36)::uuid;
      select to_jsonb(i.*) into old_row from torque_hq.incidents i where id=obj for update;
      if old_row is null then raise exception 'Incidente inexistente'; end if;
    end if;
    owner_id:=case when body ? 'owner' then torque_hq.owner(body,'owner','engineering') else (old_row->>'owner')::uuid end;
    if body ? 'accountIds' then
      if jsonb_typeof(body->'accountIds')<>'array' or jsonb_array_length(body->'accountIds')>100 then raise exception 'Contas afetadas invalidas'; end if;
      select coalesce(array_agg(v::uuid),'{}') into ids from jsonb_array_elements_text(body->'accountIds') v;
      if exists(select 1 from unnest(ids) affected(account_ref) where not exists(select 1 from public.academias a where a.id=affected.account_ref)) then raise exception 'Conta afetada inexistente'; end if;
    else select coalesce(array_agg(v::uuid),'{}') into ids from jsonb_array_elements_text(coalesce(old_row->'account_ids','[]')) v;
    end if;
    if typ='incident.create' then
      insert into torque_hq.incidents(title,severity,status,owner,release,account_ids)
        values(torque_hq.txt(body,'title',true,200),coalesce(torque_hq.txt(body,'severity',false,20),'media'),coalesce(torque_hq.txt(body,'status',false,20),'aberto'),owner_id,coalesce(torque_hq.txt(body,'release',false,120),''),ids)
        returning id,to_jsonb(incidents.*) into obj,new_row;
    else
      update torque_hq.incidents set title=case when body ? 'title' then torque_hq.txt(body,'title',true,200) else title end,severity=coalesce(torque_hq.txt(body,'severity',false,20),severity),status=coalesce(torque_hq.txt(body,'status',false,20),status),owner=owner_id,release=coalesce(torque_hq.txt(body,'release',false,120),release),account_ids=ids,updated_at=now()
        where id=obj returning to_jsonb(incidents.*) into new_row;
    end if;
  elsif typ in ('case.create','case.update') then
    if typ='case.update' then
      obj:=torque_hq.txt(body,'id',true,36)::uuid;
      select to_jsonb(c.*) into old_row from torque_hq.cases c where id=obj and (role_name='admin' or owner=who or owner is null) for update;
      if old_row is null then raise exception using errcode='42501',message='Chamado nao encontrado ou nao autorizado'; end if;
    end if;
    account:=case when body ? 'accountId' then nullif(torque_hq.txt(body,'accountId',false,36),'')::uuid else (old_row->>'account_id')::uuid end;
    if account is not null and not exists(select 1 from public.academias where id=account) then raise exception 'Conta inexistente'; end if;
    owner_id:=case when body ? 'owner' then torque_hq.owner(body,'owner','support') else (old_row->>'owner')::uuid end;
    if role_name='support' and owner_id is not null and owner_id<>who then raise exception using errcode='42501',message='Atendente so pode atribuir a si'; end if;
    state:=coalesce(torque_hq.txt(body,'status',false,30),old_row->>'status','aberto');
    if typ='case.create' then
      insert into torque_hq.cases(account_id,subject,channel,priority,status,owner,next_action_at,incident_id,resolved_at)
        values(account,torque_hq.txt(body,'subject',true,200),coalesce(torque_hq.txt(body,'channel',false,20),'manual'),coalesce(torque_hq.txt(body,'priority',false,20),'media'),state,owner_id,torque_hq.instant(body,'nextActionAt'),nullif(torque_hq.txt(body,'incidentId',false,36),'')::uuid,case when state='resolvido' then now() end)
        returning id,to_jsonb(cases.*) into obj,new_row;
    else
      update torque_hq.cases set account_id=account,subject=case when body ? 'subject' then torque_hq.txt(body,'subject',true,200) else subject end,priority=coalesce(torque_hq.txt(body,'priority',false,20),priority),status=state,owner=owner_id,
        next_action_at=case when body ? 'nextActionAt' then torque_hq.instant(body,'nextActionAt') else next_action_at end,
        incident_id=case when body ? 'incidentId' then nullif(torque_hq.txt(body,'incidentId',false,36),'')::uuid else incident_id end,
        resolved_at=case when state='resolvido' then coalesce(resolved_at,now()) else null end,updated_at=now()
        where id=obj returning to_jsonb(cases.*) into new_row;
    end if;
  elsif typ='case.message' then
    obj:=torque_hq.txt(body,'id',true,36)::uuid;
    select to_jsonb(c.*) into old_row from torque_hq.cases c where id=obj and (role_name='admin' or owner=who or owner is null) for update;
    if old_row is null then raise exception using errcode='42501',message='Chamado nao encontrado ou nao autorizado'; end if;
    visibility:=coalesce(torque_hq.txt(body,'visibility',false,20),'internal');
    insert into torque_hq.case_messages(case_id,actor_id,body,visibility,delivery)
      values(obj,who,torque_hq.txt(body,'text',true,4000),visibility,case when visibility='internal' then 'internal' else 'not_sent' end)
      returning to_jsonb(case_messages.*) into new_row;
    update torque_hq.cases set updated_at=now() where id=obj;
    -- Um rascunho nao marca first_response_at: nao houve entrega ao cliente.
  elsif typ='subscription.requestCancel' then
    account:=torque_hq.txt(body,'accountId',true,36)::uuid;
    if not exists(select 1 from public.academias where id=account) then raise exception 'Conta inexistente'; end if;
    insert into torque_hq.subscription_requests(account_id,external_id,effective_at,note,actor_id)
      values(account,torque_hq.txt(body,'id',false,120),torque_hq.day(body,'effectiveAt',false),coalesce(torque_hq.txt(body,'note',false,2000),''),who)
      returning id,to_jsonb(subscription_requests.*) into obj,new_row;
  end if;
  insert into torque_hq.audit(actor_id,actor_role,action,object_id,reason,idempotency_key,payload_hash,before_value,after_value)
    values(who,role_name,typ,obj,reason,key,hashed,old_row,new_row);
  reply:=jsonb_build_object('ok',true,'id',obj,'type',typ,'replayed',false,'externalEffect',false);
  update torque_hq.commands set result=reply where actor_id=who and idempotency_key=key;
  return reply;
end $$;

create function public.hq_ops_snapshot() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  r text:=torque_hq.actor_role(); perms text[]:=torque_hq.permissions(r); who uuid:=auth.uid();
  outdoc jsonb:='{}'; sources jsonb:='{}'; domain text; granted boolean;
begin
  outdoc:=jsonb_build_object('version',1,'meta',jsonb_build_object('mode','server','generatedAt',now(),'commandsAvailable',true),'now',now(),'role',r,'permissions',perms,'currentUserId',who,
    'operators',coalesce((select jsonb_agg(jsonb_build_object('id',u.user_id,'name',u.label)) from (
      select user_id,'Administrador '||left(user_id::text,8) label from public.saas_admins where r='admin' or user_id=who or r='engineering'
      union all select user_id,role||' '||left(user_id::text,8) from torque_hq.staff where enabled and (r='admin' or user_id=who or (r='engineering' and role='engineering'))
        and not exists(select 1 from public.saas_admins a where a.user_id=staff.user_id)
    ) u),'[]'));
  foreach domain in array array['accounts','subscriptions','invoices','payments','expenses','expensePayments','leads','events','cases','incidents','audit','integrations'] loop
    granted:=case
      when domain='accounts' then 'customers.read'=any(perms)
      when domain in ('subscriptions','invoices','payments','expenses','expensePayments') then 'finance.read'=any(perms)
      when domain='leads' then 'sales.read'=any(perms)
      when domain='cases' then 'support.read'=any(perms)
      when domain='incidents' then 'health.read'=any(perms)
      when domain='audit' then 'audit.read'=any(perms)
      when domain='integrations' then r in ('admin','finance','engineering') else false end;
    outdoc:=outdoc||jsonb_build_object(domain,'[]'::jsonb);
    sources:=sources||jsonb_build_object(domain,jsonb_build_object('status',case when granted and domain not in ('subscriptions','integrations') then 'ready' else 'unavailable' end,'updatedAt',case when granted then now() end,'origin',case when domain='accounts' then 'public.academias+saas_clientes' else 'torque_hq' end,'scope',case when domain in ('invoices','payments','expenses','expensePayments') then 'manualOnly' else 'authorizedOnly' end,'reason',case when not granted then 'forbidden' when domain in ('subscriptions','integrations') then 'integration_not_connected' else null end));
  end loop;
  if 'customers.read'=any(perms) then
    outdoc:=outdoc||jsonb_build_object('accounts',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',case when r='viewer' then 'Conta' else a.nome end,'product',coalesce(c.tipo,'unknown'),'createdAt',a.criada,'status',coalesce(c.status,'unknown'),'trialEndsAt',null,'accessStatus',a.assinatura_status) order by a.criada desc)
      from public.academias a left join public.saas_clientes c on c.academia_id=a.id
      where r in ('admin','finance','viewer') or (r='support' and exists(select 1 from torque_hq.cases k where k.account_id=a.id and (k.owner=who or k.owner is null)))), '[]'));
    -- sales nao recebe lista global de clientes; leads ainda nao possuem vinculo de conversao.
  end if;
  if 'finance.read'=any(perms) then
    outdoc:=outdoc||jsonb_build_object(
      'invoices',coalesce((select jsonb_agg(jsonb_build_object('id',id,'accountId',account_id,'label',label,'dueDate',due_date,'competenceDate',competence_date,'totalCents',total_cents,'status',status,'origin',origin,'createdAt',created_at) order by due_date,id) from torque_hq.invoices),'[]'),
      'payments',coalesce((select jsonb_agg(jsonb_build_object('id',id,'accountId',account_id,'invoiceId',invoice_id,'paidAt',paid_at,'amountCents',amount_cents,'kind',kind,'confirmed',confirmed,'origin',origin,'reference',reference) order by paid_at,id) from torque_hq.payments),'[]'),
      'expenses',coalesce((select jsonb_agg(jsonb_build_object('id',id,'payee',payee,'label',label,'dueDate',due_date,'totalCents',total_cents,'competenceDate',competence_date,'status',status,'origin','manual') order by due_date,id) from torque_hq.expenses),'[]'),
      'expensePayments',coalesce((select jsonb_agg(jsonb_build_object('id',id,'expenseId',expense_id,'paidAt',paid_at,'amountCents',amount_cents,'kind','payment','confirmed',true,'origin','manual','reference',reference) order by paid_at,id) from torque_hq.expense_payments),'[]'),
      'subscriptionRequests',coalesce((select jsonb_agg(jsonb_build_object('id',id,'accountId',account_id,'externalId',external_id,'effectiveAt',effective_at,'status',status,'note',note,'createdAt',created_at)) from torque_hq.subscription_requests),'[]'));
  else outdoc:=outdoc||jsonb_build_object('subscriptionRequests','[]'::jsonb); end if;
  if 'sales.read'=any(perms) then
    outdoc:=outdoc||jsonb_build_object('leads',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'stage',stage,'source',source,'notes',notes,'createdAt',created_at,'updatedAt',updated_at,'owner',owner,'nextActionAt',next_action_at,'lossReason',loss_reason) order by created_at,id) from torque_hq.leads where r='admin' or owner=who),'[]'));
  end if;
  if 'support.read'=any(perms) then
    outdoc:=outdoc||jsonb_build_object('cases',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'accountId',c.account_id,'subject',c.subject,'channel',c.channel,'priority',c.priority,'status',c.status,'owner',c.owner,'nextActionAt',c.next_action_at,'createdAt',c.created_at,'updatedAt',c.updated_at,'firstResponseAt',c.first_response_at,'resolvedAt',c.resolved_at,'incidentId',c.incident_id,
      'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'text',m.body,'visibility',m.visibility,'delivery',m.delivery,'createdAt',m.created_at,'actorId',m.actor_id) order by m.created_at,m.id) from torque_hq.case_messages m where m.case_id=c.id),'[]')) order by c.created_at,c.id) from torque_hq.cases c where r='admin' or owner=who or owner is null),'[]'));
  end if;
  if 'health.read'=any(perms) then
    outdoc:=outdoc||jsonb_build_object('incidents',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'severity',severity,'status',status,'owner',owner,'release',release,'accountIds',account_ids,'createdAt',created_at,'updatedAt',updated_at) order by created_at,id) from torque_hq.incidents),'[]'));
  end if;
  if 'audit.read'=any(perms) then
    outdoc:=outdoc||jsonb_build_object('audit',coalesce((select jsonb_agg(jsonb_build_object('id',id,'actorId',actor_id,'actorRole',actor_role,'action',action,'objectId',object_id,'reason',reason,'idempotencyKey',idempotency_key,'payloadHash',payload_hash,'createdAt',created_at) order by created_at,id) from torque_hq.audit),'[]'));
  end if;
  sources:=sources||jsonb_build_object('finance',jsonb_build_object('status',case when 'finance.read'=any(perms) then 'ready' else 'unavailable' end,'updatedAt',case when 'finance.read'=any(perms) then now() end,'origin','manual','scope','manualOnly','reason',case when not 'finance.read'=any(perms) then 'forbidden' end));
  sources:=sources||jsonb_build_object('subscriptionRequests',jsonb_build_object('status',case when 'finance.read'=any(perms) then 'ready' else 'unavailable' end,'updatedAt',case when 'finance.read'=any(perms) then now() end,'origin','torque_hq','scope','requestsOnly','reason',case when not 'finance.read'=any(perms) then 'forbidden' end));
  if r='admin' or 'sales.read'=any(perms) or 'health.read'=any(perms) then
    sources:=jsonb_set(sources,'{events}',jsonb_build_object('status','unavailable','updatedAt',null,'origin','not_instrumented','reason','instrumentation_not_available'));
  end if;
  if 'support.read'=any(perms) then
    sources:=jsonb_set(sources,'{cases}',sources->'cases'||jsonb_build_object('scope','opsOnly','message','Somente casos criados na nova central. O historico de saas_tickets e suporte_chamados ainda nao foi incorporado; esta fila nao representa todo o atendimento anterior.'));
  end if;
  sources:=sources||jsonb_build_object('legacySupport',jsonb_build_object('status','unavailable','origin','public.saas_tickets+public.suporte_chamados','updatedAt',null,'scope','legacyOnly',
    'reason',case when 'support.read'=any(perms) then 'migration_pending' else 'forbidden' end,
    'migrationPending','support.read'=any(perms),
    'message',case when 'support.read'=any(perms) then 'Historico anterior indisponivel neste contrato. Nenhuma conversa antiga foi lida, marcada como lida ou importada.' else 'Acesso nao autorizado a este dominio.' end));
  outdoc:=outdoc||jsonb_build_object('sources',sources);
  return outdoc;
end $$;

revoke all on all functions in schema torque_hq from public,anon,authenticated;
revoke all on function public.hq_ops_snapshot() from public,anon;
revoke all on function public.hq_ops_command(jsonb) from public,anon;
grant execute on function public.hq_ops_snapshot(),public.hq_ops_command(jsonb) to authenticated;
comment on function public.hq_ops_command(jsonb) is 'Proposta HQ: operacoes manuais auditadas; nao executa gateways, envios, acesso nem cancelamento externo.';
commit;
