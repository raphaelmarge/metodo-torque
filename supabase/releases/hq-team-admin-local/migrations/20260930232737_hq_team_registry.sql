-- PROPOSTA LOCAL ADITIVA. Nao aplicada nem incluida em migrations/pacotes existentes.
-- Requer OPS instalado. Cadastro administrativo nao cria Auth users, staff,
-- escopos, convites, permissoes efetivas ou alteracoes em staff_enabled.
begin;
select pg_advisory_xact_lock(714882,1);
select pg_advisory_xact_lock(714882,3);

do $$ begin
  -- Fail closed on every endpoint in the reserved namespace, including legacy
  -- aliases and overloads. Never drop/revoke an unknown function as a repair.
  if exists(
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where ((n.nspname='public' and left(p.proname,8)='hq_team_')
       or (n.nspname='torque_hq' and (left(p.proname,15)='suspended_team_' or left(p.proname,8)='hq_team_')))
      and not (
        p.prokind='f' and p.prosecdef and not p.proretset
        and p.prorettype='jsonb'::regtype and p.proargmodes is null
        and p.provariadic=0 and p.pronargdefaults=0
        and (
          (n.nspname='public' and
            ((p.proname='hq_team_snapshot' and p.pronargs=0)
             or (p.proname='hq_team_command' and p.pronargs=1 and p.proargtypes[0]='jsonb'::regtype)))
          or (n.nspname='torque_hq' and
            ((p.proname='suspended_team_snapshot' and p.pronargs=0)
             or (p.proname='suspended_team_command' and p.pronargs=1 and p.proargtypes[0]='jsonb'::regtype)))
        )
      )
  ) then
    raise exception using errcode='55000',message='Contrato RPC de equipe divergente; sobrecarga ou alias exige revisao';
  end if;
  if to_regclass('torque_hq.settings') is null
    or to_regprocedure('torque_hq.permissions(text)') is null
    or to_regclass('public.saas_admins') is null then
    raise exception using errcode='55000',message='Instalacao OPS existente obrigatoria';
  end if;
  if not exists(select 1 from torque_hq.settings where id and not staff_enabled) then
    raise exception using errcode='55000',message='Preparacao exige modo admin existente com equipe desativada';
  end if;
  if to_regprocedure('public.hq_ops_snapshot()') is null
    or to_regprocedure('public.hq_ops_command(jsonb)') is null
    or to_regprocedure('torque_hq.suspended_ops_snapshot()') is not null
    or to_regprocedure('torque_hq.suspended_ops_command(jsonb)') is not null then
    raise exception using errcode='55000',message='Instalacao exige as duas RPCs OPS publicas integras';
  end if;
end $$;

create table torque_hq.team_registry (
  id uuid primary key default gen_random_uuid(),
  name text not null check(length(name) between 2 and 160 and name=btrim(name)),
  contact text not null default '' check(length(contact)<=254 and contact=btrim(contact)),
  proposed_role text not null check(proposed_role in ('admin','finance','sales','support','engineering','viewer')),
  status text not null default 'active' check(status in ('active','inactive')),
  review_status text not null default 'pending' check(review_status in ('pending','approved','rejected')),
  version integer not null default 1 check(version>0),
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  check((review_status='pending' and reviewed_by is null and reviewed_at is null)
     or (review_status<>'pending' and reviewed_by is not null and reviewed_at is not null))
);
create table torque_hq.team_registry_commands (
  actor_id uuid not null references auth.users(id),
  idempotency_key text not null,
  payload_hash text not null,
  result jsonb,
  created_at timestamptz not null default now(),
  primary key(actor_id,idempotency_key)
);
create table torque_hq.team_registry_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id),
  action text not null check(action in ('team.create','team.update','team.setStatus','team.review')),
  object_id uuid not null references torque_hq.team_registry(id),
  reason text not null check(length(reason) between 3 and 500),
  idempotency_key text not null,
  payload_hash text not null,
  changed_fields text[] not null,
  before_value jsonb,
  after_value jsonb not null,
  created_at timestamptz not null default now(),
  unique(actor_id,idempotency_key)
);
create index hq_team_registry_audit_object on torque_hq.team_registry_audit(object_id,created_at);
alter table torque_hq.team_registry enable row level security;
alter table torque_hq.team_registry_commands enable row level security;
alter table torque_hq.team_registry_audit enable row level security;
revoke all on torque_hq.team_registry,torque_hq.team_registry_commands,torque_hq.team_registry_audit from public,anon,authenticated,service_role;

create function torque_hq.team_require_admin() returns uuid
language plpgsql stable security invoker set search_path='' as $$
declare who uuid:=auth.uid();
begin
  -- Do not accept role claims, proposed profiles or torque_hq.staff as authority.
  if who is null or not exists(select 1 from public.saas_admins where user_id=who) then
    raise exception using errcode='42501',message='Cadastro de equipe restrito a administradores existentes';
  end if;
  return who;
end $$;

create function torque_hq.team_text(v jsonb,k text,minlen integer,maxlen integer) returns text
language plpgsql immutable security invoker set search_path='' as $$
declare s text;
begin
  if jsonb_typeof(v->k) is distinct from 'string' then
    raise exception using errcode='22023',message='Campo de texto invalido: '||k;
  end if;
  s:=btrim(v->>k);
  if length(s)<minlen or length(s)>maxlen or s ~ '[[:cntrl:]]' then
    raise exception using errcode='22023',message='Tamanho ou formato invalido: '||k;
  end if;
  return s;
end $$;

create function torque_hq.team_member_json(r torque_hq.team_registry) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('id',r.id,'name',r.name,'contact',r.contact,'proposedRole',r.proposed_role,
    'status',r.status,'reviewStatus',r.review_status,'accessState',case when r.status='inactive' then 'disabled' else 'accessPending' end,
    'effectiveAccess',false,'version',r.version,'createdBy',r.created_by,'updatedBy',r.updated_by,
    'createdAt',r.created_at,'updatedAt',r.updated_at,'reviewedAt',r.reviewed_at,'reviewedBy',r.reviewed_by)
$$;

create function torque_hq.team_audit_value(r torque_hq.team_registry) returns jsonb
language sql stable security invoker set search_path='' as $$
  select case when r.id is null then null else jsonb_build_object('proposedRole',r.proposed_role,
    'status',r.status,'reviewStatus',r.review_status,'version',r.version) end
$$;

create function public.hq_team_snapshot() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare who uuid:=torque_hq.team_require_admin();
begin
  return jsonb_build_object('schemaVersion',1,'currentUserId',who,
    'permissions',jsonb_build_array('team.read','team.write','team.review'),
    'team',coalesce((select jsonb_agg(torque_hq.team_member_json(t) order by lower(t.name),t.id) from torque_hq.team_registry t),'[]'::jsonb),
    'audit',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'actorId',a.actor_id,'action',a.action,'objectId',a.object_id,
       'reason',a.reason,'changedFields',a.changed_fields,'before',a.before_value,'after',a.after_value,'createdAt',a.created_at)
       order by a.created_at desc,a.id desc) from (select * from torque_hq.team_registry_audit order by created_at desc,id desc limit 100) a),'[]'::jsonb),
    'sources',jsonb_build_object('team',jsonb_build_object('status','ready','scope','administrativeRegistryOnly',
      'origin','torque_hq.team_registry','updatedAt',now())),
    'meta',jsonb_build_object('accessProvisioningAvailable',false,'externalEffect',false,'scope','administrativeRegistryOnly',
      'staffGateEnabled',(select staff_enabled from torque_hq.settings where id),
      'auditLimit',100,'auditHasMore',(select count(*)>100 from torque_hq.team_registry_audit),
      'roleMatrixKind','referenceOnly','roleMatrixSource','torque_hq.permissions + team administrator policy',
      'roleMatrix',(select jsonb_agg(jsonb_build_object('role',p.role,'effectiveAccess',false,
        'permissions',to_jsonb(torque_hq.permissions(p.role)||case when p.role='admin' then array['team.read','team.write','team.review'] else '{}'::text[] end)) order by p.ordinal)
        from unnest(array['admin','finance','sales','support','engineering','viewer']) with ordinality p(role,ordinal))));
end $$;

create function public.hq_team_command(p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  who uuid:=torque_hq.team_require_admin();
  typ text; cmd_key text; reason_text text; body jsonb; allowed text[];
  hashed text; old_hash text; reply jsonb; target uuid; expected integer;
  old_row torque_hq.team_registry; new_row torque_hq.team_registry;
  member_name text; member_contact text; proposed text; state text; review text; fields text[];
begin
  if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>12000 then
    raise exception using errcode='22023',message='Comando de equipe invalido';
  end if;
  if exists(select 1 from jsonb_object_keys(p_input) k where k not in ('type','payload','reason','idempotencyKey')) then
    raise exception using errcode='22023',message='Campo de comando desconhecido';
  end if;
  typ:=torque_hq.team_text(p_input,'type',1,40);
  cmd_key:=torque_hq.team_text(p_input,'idempotencyKey',8,128);
  reason_text:=torque_hq.team_text(p_input,'reason',3,500);
  body:=p_input->'payload';
  if jsonb_typeof(body) is distinct from 'object' then
    raise exception using errcode='22023',message='Payload obrigatorio';
  end if;
  allowed:=case typ
    when 'team.create' then array['name','contact','proposedRole','status']
    when 'team.update' then array['id','expectedVersion','name','contact','proposedRole']
    when 'team.setStatus' then array['id','expectedVersion','status']
    when 'team.review' then array['id','expectedVersion','reviewStatus'] else null end;
  if allowed is null then raise exception using errcode='22023',message='Operacao de equipe nao permitida'; end if;
  if exists(select 1 from jsonb_object_keys(body) k where not(k=any(allowed))) then
    raise exception using errcode='22023',message='Campo de cadastro desconhecido';
  end if;
  if typ<>'team.create' then
    begin target:=torque_hq.team_text(body,'id',36,36)::uuid;
    exception when invalid_text_representation then raise exception using errcode='22023',message='ID de cadastro invalido'; end;
    if jsonb_typeof(body->'expectedVersion') is distinct from 'number' or (body->>'expectedVersion')!~'^[1-9][0-9]{0,9}$'
      or (body->>'expectedVersion')::numeric>2147483646 then
      raise exception using errcode='22023',message='Versao esperada obrigatoria';
    end if;
    expected:=(body->>'expectedVersion')::integer;
  end if;
  if typ='team.create' or body?'name' then member_name:=torque_hq.team_text(body,'name',2,160); end if;
  if body?'contact' then member_contact:=torque_hq.team_text(body,'contact',0,254); end if;
  if typ='team.create' or body?'proposedRole' then
    proposed:=torque_hq.team_text(body,'proposedRole',1,30);
    if proposed not in ('admin','finance','sales','support','engineering','viewer') then
      raise exception using errcode='22023',message='Perfil proposto invalido';
    end if;
  end if;
  if typ='team.setStatus' or body?'status' then
    state:=torque_hq.team_text(body,'status',1,10);
    if state not in ('active','inactive') then raise exception using errcode='22023',message='Estado de cadastro invalido'; end if;
  end if;
  if typ='team.review' then
    review:=torque_hq.team_text(body,'reviewStatus',1,10);
    if review not in ('approved','rejected') then raise exception using errcode='22023',message='Revisao proposta invalida'; end if;
  end if;
  if typ='team.update' and not(body ?| array['name','contact','proposedRole']) then
    raise exception using errcode='22023',message='Informe os campos a editar';
  end if;
  hashed:=encode(sha256(convert_to(p_input::text,'UTF8')),'hex');
  insert into torque_hq.team_registry_commands(actor_id,idempotency_key,payload_hash) values(who,cmd_key,hashed) on conflict do nothing;
  if not found then
    select c.payload_hash,c.result into old_hash,reply from torque_hq.team_registry_commands c
      where c.actor_id=who and c.idempotency_key=cmd_key for update;
    if old_hash<>hashed then raise exception using errcode='22023',message='Chave de idempotencia reutilizada com outro conteudo'; end if;
    if reply is null then raise exception using errcode='55000',message='Comando anterior sem resultado confirmado'; end if;
    return reply||jsonb_build_object('replayed',true);
  end if;
  if typ='team.create' then
    insert into torque_hq.team_registry(name,contact,proposed_role,status,created_by,updated_by)
      values(member_name,coalesce(member_contact,''),proposed,coalesce(state,'active'),who,who) returning * into new_row;
    fields:=array['name','contact','proposedRole','status','reviewStatus'];
  else
    select * into old_row from torque_hq.team_registry where id=target for update;
    if not found then raise exception using errcode='P0002',message='Cadastro inexistente'; end if;
    if old_row.version<>expected then raise exception using errcode='40001',message='Cadastro alterado; atualize antes de reenviar'; end if;
    if typ='team.update' then
      member_name:=coalesce(member_name,old_row.name);
      member_contact:=coalesce(member_contact,old_row.contact);
      proposed:=coalesce(proposed,old_row.proposed_role);
      fields:=array_remove(array[case when member_name<>old_row.name then 'name' end,
        case when member_contact<>old_row.contact then 'contact' end,
        case when proposed<>old_row.proposed_role then 'proposedRole' end],null);
      if cardinality(fields)=0 then raise exception using errcode='22023',message='Nenhuma alteracao de cadastro'; end if;
      update torque_hq.team_registry set name=member_name,contact=member_contact,proposed_role=proposed,
        review_status='pending',reviewed_by=null,reviewed_at=null,version=version+1,updated_by=who,updated_at=now()
        where id=target returning * into new_row;
      if old_row.review_status<>'pending' then fields:=fields||array['reviewStatus']; end if;
    elsif typ='team.setStatus' then
      if state=old_row.status then raise exception using errcode='22023',message='Cadastro ja esta nesse estado'; end if;
      update torque_hq.team_registry set status=state,
        review_status=case when state='active' then 'pending' else review_status end,
        reviewed_by=case when state='active' then null else reviewed_by end,
        reviewed_at=case when state='active' then null else reviewed_at end,
        version=version+1,updated_by=who,updated_at=now() where id=target returning * into new_row;
      fields:=array['status'];
      if new_row.review_status<>old_row.review_status then fields:=fields||array['reviewStatus']; end if;
    else
      if old_row.status<>'active' or old_row.review_status<>'pending' then
        raise exception using errcode='22023',message='Revisao requer cadastro ativo com proposta pendente';
      end if;
      update torque_hq.team_registry set review_status=review,reviewed_by=who,reviewed_at=now(),
        version=version+1,updated_by=who,updated_at=now() where id=target returning * into new_row;
      fields:=array['reviewStatus'];
    end if;
  end if;
  insert into torque_hq.team_registry_audit(actor_id,action,object_id,reason,idempotency_key,payload_hash,changed_fields,before_value,after_value)
    values(who,typ,new_row.id,reason_text,cmd_key,hashed,fields,torque_hq.team_audit_value(old_row),torque_hq.team_audit_value(new_row));
  reply:=jsonb_build_object('ok',true,'id',new_row.id,'type',typ,'member',torque_hq.team_member_json(new_row),
    'replayed',false,'externalEffect',false,'accessGranted',false);
  update torque_hq.team_registry_commands set result=reply where actor_id=who and idempotency_key=cmd_key;
  return reply;
end $$;

revoke all on function torque_hq.team_require_admin(),torque_hq.team_text(jsonb,text,integer,integer),
  torque_hq.team_member_json(torque_hq.team_registry),torque_hq.team_audit_value(torque_hq.team_registry),
  public.hq_team_snapshot(),public.hq_team_command(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.hq_team_snapshot(),public.hq_team_command(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
