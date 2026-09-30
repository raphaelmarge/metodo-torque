-- RETOMADA LOCAL REVISAVEL DA EQUIPE. Exige OPS retomado previamente.
-- Restaura somente as duas RPCs com mesmos OIDs; preserva dados/auditoria.
-- Forca staff_enabled=false; nao cria Auth, staff, escopos ou grants de pessoas.
begin;
select pg_advisory_xact_lock(714882,1);
select pg_advisory_xact_lock(714882,3);

do $team_resume$
declare entry record; live oid; parked oid; live_count integer:=0; parked_count integer:=0;
begin
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
  if to_regnamespace('torque_hq') is null or to_regclass('torque_hq.settings') is null
    or to_regclass('torque_hq.team_registry') is null
    or to_regclass('torque_hq.team_registry_commands') is null
    or to_regclass('torque_hq.team_registry_audit') is null
    or to_regprocedure('torque_hq.permissions(text)') is null
    or to_regprocedure('torque_hq.team_require_admin()') is null
    or to_regprocedure('torque_hq.team_text(jsonb,text,integer,integer)') is null
    or to_regprocedure('torque_hq.team_member_json(torque_hq.team_registry)') is null
    or to_regprocedure('torque_hq.team_audit_value(torque_hq.team_registry)') is null then
    raise exception using errcode='55000',message='Contrato de equipe incompleto; retomada exige revisao';
  end if;
  if not exists(select 1 from torque_hq.settings where id=true) then
    raise exception using errcode='55000',message='Configuracao OPS ausente; retomada nao inventa configuracao';
  end if;
  if to_regprocedure('public.hq_ops_snapshot()') is null
    or to_regprocedure('public.hq_ops_command(jsonb)') is null
    or to_regprocedure('torque_hq.suspended_ops_snapshot()') is not null
    or to_regprocedure('torque_hq.suspended_ops_command(jsonb)') is not null then
    raise exception using errcode='55000',message='Retome o OPS integro antes da equipe';
  end if;
  for entry in select * from (values
    ('hq_team_snapshot','suspended_team_snapshot',''),
    ('hq_team_command','suspended_team_command','jsonb')
  ) f(public_name,parked_name,arguments) loop
    live:=to_regprocedure(format('public.%I(%s)',entry.public_name,entry.arguments));
    parked:=to_regprocedure(format('torque_hq.%I(%s)',entry.parked_name,entry.arguments));
    if (live is null and parked is null) or (live is not null and parked is not null)
      or to_regprocedure(format('torque_hq.%I(%s)',entry.public_name,entry.arguments)) is not null then
      raise exception using errcode='55000',message='RPC de equipe ausente ou em colisao; nenhuma funcao sera descartada';
    end if;
    if live is not null then live_count:=live_count+1; end if;
    if parked is not null then parked_count:=parked_count+1; end if;
  end loop;
  if live_count>0 and parked_count>0 then
    raise exception using errcode='55000',message='Estado parcial de equipe; retomada nao repara automaticamente';
  end if;
  update torque_hq.settings set staff_enabled=false where id=true;
  for entry in select * from (values
    ('hq_team_snapshot','suspended_team_snapshot',''),
    ('hq_team_command','suspended_team_command','jsonb')
  ) f(public_name,parked_name,arguments) loop
    parked:=to_regprocedure(format('torque_hq.%I(%s)',entry.parked_name,entry.arguments));
    if parked is not null then
      execute format('alter function torque_hq.%I(%s) rename to %I',entry.parked_name,entry.arguments,entry.public_name);
      execute format('alter function torque_hq.%I(%s) set schema public',entry.public_name,entry.arguments);
    end if;
    execute format('revoke all on function public.%I(%s) from public,anon,authenticated,service_role',entry.public_name,entry.arguments);
    execute format('grant execute on function public.%I(%s) to authenticated',entry.public_name,entry.arguments);
  end loop;
end $team_resume$;

revoke all on schema torque_hq from public,anon,authenticated,service_role;
revoke all on torque_hq.team_registry,torque_hq.team_registry_commands,torque_hq.team_registry_audit from public,anon,authenticated,service_role;
revoke all on function torque_hq.team_require_admin(),torque_hq.team_text(jsonb,text,integer,integer),
  torque_hq.team_member_json(torque_hq.team_registry),torque_hq.team_audit_value(torque_hq.team_registry) from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;

-- Validar HTTP: admin existente autorizado; outsider/staff/anon/service_role negados.
-- Aprovar perfil continua sendo revisao cadastral, sem concessao de acesso.
