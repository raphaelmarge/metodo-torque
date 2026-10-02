-- SUSPENSAO LOCAL REVISAVEL DO OPS. Nao executa automaticamente em deploy.
-- Aplicacao remota exige autorizacao propria e backup verificado.
-- Preserva tabelas, dados, auditoria, idempotencia, equipe e configuracoes.
-- Remove apenas as duas RPCs OPS do schema publico; legado/ledger/portal intactos.
begin;
select pg_advisory_xact_lock(714882, 1);

do $hq_suspend$
declare
  entry record;
  live oid;
  parked oid;
  live_count integer := 0;
  parked_count integer := 0;
begin
  if to_regnamespace('torque_hq') is null then
    raise exception using errcode='55000', message='OPS nao instalado; suspensao nao altera o legado';
  end if;
  -- Valide todos os pares antes de mover qualquer endpoint. Estado ambiguo
  -- requer revisao; nunca apague uma funcao para resolver uma colisao.
  for entry in select * from (values
    ('hq_ops_snapshot', 'suspended_ops_snapshot', ''),
    ('hq_ops_command', 'suspended_ops_command', 'jsonb')
  ) as f(public_name, parked_name, arguments) loop
    live := to_regprocedure(format('public.%I(%s)',entry.public_name,entry.arguments));
    parked := to_regprocedure(format('torque_hq.%I(%s)',entry.parked_name,entry.arguments));
    if (live is null and parked is null) or (live is not null and parked is not null) then
      raise exception using errcode='55000', message='Estado OPS ausente ou ambiguo; nenhuma funcao foi descartada';
    end if;
    if live is not null then live_count := live_count + 1; end if;
    if parked is not null then parked_count := parked_count + 1; end if;
  end loop;
  if live_count > 0 and parked_count > 0 then
    raise exception using errcode='55000', message='Estado OPS parcial; suspensao exige revisao sem reparo automatico';
  end if;
  for entry in select * from (values
    ('hq_ops_snapshot', 'suspended_ops_snapshot', ''),
    ('hq_ops_command', 'suspended_ops_command', 'jsonb')
  ) as f(public_name, parked_name, arguments) loop
    live := to_regprocedure(format('public.%I(%s)',entry.public_name,entry.arguments));
    if live is not null then
      execute format('revoke all on function public.%I(%s) from public,anon,authenticated',entry.public_name,entry.arguments);
      if exists(select 1 from pg_roles where rolname='service_role') then
        execute format('revoke all on function public.%I(%s) from service_role',entry.public_name,entry.arguments);
      end if;
      execute format('alter function public.%I(%s) set schema torque_hq',entry.public_name,entry.arguments);
      execute format('alter function torque_hq.%I(%s) rename to %I',entry.public_name,entry.arguments,entry.parked_name);
    end if;
    execute format('revoke all on function torque_hq.%I(%s) from public,anon,authenticated',entry.parked_name,entry.arguments);
    if exists(select 1 from pg_roles where rolname='service_role') then
      execute format('revoke all on function torque_hq.%I(%s) from service_role',entry.parked_name,entry.arguments);
    end if;
  end loop;
  if exists(select 1 from pg_roles where rolname='service_role') then
    execute 'revoke all on schema torque_hq from service_role';
  end if;
end $hq_suspend$;

revoke all on schema torque_hq from public,anon,authenticated;
notify pgrst, 'reload schema';
commit;

-- Apos o COMMIT, confirme via HTTP que hq_ops_snapshot e hq_ops_command
-- nao constam do schema publico. NOTIFY solicita reload; nao comprova o consumo.
-- O adapter permite fallback legado somente para hq_sou_admin() = true.
-- Falha/revogacao nao autorizam fallback para staff nem comandos legados.
