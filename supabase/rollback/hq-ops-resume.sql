-- RETOMADA LOCAL REVISAVEL DO OPS. Nao cria/grava equipe nem habilita staff.
-- Exige decisao de retomada; preserva escopos, dados e auditoria.
-- A retomada MINIMA desliga staff_enabled; acesso extra exige decisao separada.
-- Nao reinstala ledger, portal ou migracoes; restaura somente as duas RPCs OPS.
begin;
select pg_advisory_xact_lock(714882, 1);

do $hq_resume$
declare
  entry record;
  live oid;
  parked oid;
  live_count integer := 0;
  parked_count integer := 0;
begin
  if to_regnamespace('torque_hq') is null then
    raise exception using errcode='55000', message='OPS nao instalado; retomada nao instala backend';
  end if;
  if to_regclass('torque_hq.settings') is null then
    raise exception using errcode='55000', message='Contrato settings ausente; retomada exige revisao';
  end if;
  if not exists(select 1 from torque_hq.settings where id=true) then
    raise exception using errcode='55000', message='Configuracao OPS ausente; retomada nao inventa configuracao';
  end if;
  for entry in select * from (values
    ('hq_ops_snapshot', 'suspended_ops_snapshot', ''),
    ('hq_ops_command', 'suspended_ops_command', 'jsonb')
  ) as f(public_name, parked_name, arguments) loop
    live := to_regprocedure(format('public.%I(%s)',entry.public_name,entry.arguments));
    parked := to_regprocedure(format('torque_hq.%I(%s)',entry.parked_name,entry.arguments));
    if (live is null and parked is null) or (live is not null and parked is not null) then
      raise exception using errcode='55000', message='Estado OPS ausente ou ambiguo; retomada exige revisao';
    end if;
    if live is not null then live_count := live_count + 1; end if;
    if parked is not null then parked_count := parked_count + 1; end if;
  end loop;
  if live_count > 0 and parked_count > 0 then
    raise exception using errcode='55000', message='Estado OPS parcial; retomada exige revisao sem reparo automatico';
  end if;
  -- Nunca retome os acessos futuros de staff por efeito colateral. Nao apaga
  -- usuarios, linhas de equipe, atribuicoes, comandos ou registros de auditoria.
  update torque_hq.settings set staff_enabled=false where id=true;
  for entry in select * from (values
    ('hq_ops_snapshot', 'suspended_ops_snapshot', ''),
    ('hq_ops_command', 'suspended_ops_command', 'jsonb')
  ) as f(public_name, parked_name, arguments) loop
    parked := to_regprocedure(format('torque_hq.%I(%s)',entry.parked_name,entry.arguments));
    if parked is not null then
      execute format('alter function torque_hq.%I(%s) rename to %I',entry.parked_name,entry.arguments,entry.public_name);
      execute format('alter function torque_hq.%I(%s) set schema public',entry.public_name,entry.arguments);
    end if;
    execute format('revoke all on function public.%I(%s) from public,anon,authenticated',entry.public_name,entry.arguments);
    if exists(select 1 from pg_roles where rolname='service_role') then
      execute format('revoke all on function public.%I(%s) from service_role',entry.public_name,entry.arguments);
    end if;
    execute format('grant execute on function public.%I(%s) to authenticated',entry.public_name,entry.arguments);
  end loop;
  if exists(select 1 from pg_roles where rolname='service_role') then
    execute 'revoke all on schema torque_hq from service_role';
  end if;
end $hq_resume$;

revoke all on schema torque_hq from public,anon,authenticated;
notify pgrst, 'reload schema';
commit;

-- Verifique admin existente, negacao de usuario comum/anon/staff bloqueado e
-- ausencia de duplicacao antes de liberar a operacao. staff_enabled fica false,
-- inclusive quando havia sido habilitado antes da suspensao.
