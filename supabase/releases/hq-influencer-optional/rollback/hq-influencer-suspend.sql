-- PREPARACAO LOCAL OPCIONAL: influencer suspend. NAO executar automaticamente.
-- Fora da ativacao minima OPS. Nao instala modulo, cria usuario ou envia convite.
-- Preserva tabelas, dados, auditoria e memberships. Campanha deve estar OFF na retomada.
-- Ordem: suspender portal antes do ledger; retomar ledger antes do portal.
begin;
select pg_advisory_xact_lock(714882,2);
do $optional_suspend$
declare entry record; dependency record; live oid; parked oid; live_count integer:=0;
  live_oids oid[]:='{}'; total integer:=6;
begin
  if to_regnamespace('hq_influencer_private') is null then
    raise exception using errcode='55000',message='Modulo influencer nao instalado';
  end if;
  -- All live or all parked; mixed, missing, colliding or extra APIs fail atomically.
  for entry in select * from (values
    ('hq_influencer_prepare_invite','suspended_influencer_prepare_invite','prepare_invite','jsonb','authenticated'),
    ('hq_influencer_list_invites','suspended_influencer_list_invites','list_invites','','authenticated'),
    ('hq_influencer_admin_snapshot','suspended_influencer_admin_snapshot','admin_snapshot','','authenticated'),
    ('hq_influencer_revoke_access','suspended_influencer_revoke_access','revoke_access','jsonb','authenticated'),
    ('influencer_accept_invite','suspended_influencer_accept_invite','accept_invite','','authenticated'),
    ('influencer_portal_snapshot','suspended_influencer_snapshot','snapshot','','authenticated')
  ) f(public_name,parked_name,private_name,arguments,grantee) loop
    live:=to_regprocedure(format('public.%I(%s)',entry.public_name,entry.arguments));
    parked:=to_regprocedure(format('hq_influencer_private.%I(%s)',entry.parked_name,entry.arguments));
    if (live is null and parked is null) or (live is not null and parked is not null) then
      raise exception using errcode='55000',message='Endpoint ausente ou colisao; revisar contrato sem descartar funcoes';
    end if;
    if to_regprocedure(format('hq_influencer_private.%I(%s)',entry.private_name,entry.arguments)) is null then
      raise exception using errcode='55000',message='Implementacao privada ausente; retomada nao reinstala modulo';
    end if;
    if live is not null then live_count:=live_count+1; live_oids:=array_append(live_oids,live); end if;
  end loop;
  if live_count not in (0,total) then
    raise exception using errcode='55000',message='Estado misto de endpoints; nenhuma alteracao aplicada';
  end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and (p.proname like 'hq_influencer_%' or p.proname like 'influencer_%') and not(p.oid=any(live_oids))) then
    raise exception using errcode='55000',message='Alias ou overload publico fora da whitelist; revisar antes de continuar';
  end if;
  for entry in select * from (values
    ('hq_influencer_prepare_invite','suspended_influencer_prepare_invite','prepare_invite','jsonb','authenticated'),
    ('hq_influencer_list_invites','suspended_influencer_list_invites','list_invites','','authenticated'),
    ('hq_influencer_admin_snapshot','suspended_influencer_admin_snapshot','admin_snapshot','','authenticated'),
    ('hq_influencer_revoke_access','suspended_influencer_revoke_access','revoke_access','jsonb','authenticated'),
    ('influencer_accept_invite','suspended_influencer_accept_invite','accept_invite','','authenticated'),
    ('influencer_portal_snapshot','suspended_influencer_snapshot','snapshot','','authenticated')
  ) f(public_name,parked_name,private_name,arguments,grantee) loop
    live:=to_regprocedure(format('public.%I(%s)',entry.public_name,entry.arguments));
    if live is not null then
      execute format('revoke all on function public.%I(%s) from public,anon,authenticated,service_role',entry.public_name,entry.arguments);
      execute format('alter function public.%I(%s) set schema hq_influencer_private',entry.public_name,entry.arguments);
      execute format('alter function hq_influencer_private.%I(%s) rename to %I',entry.public_name,entry.arguments,entry.parked_name);
    end if;
  end loop;
  -- Revoke every private helper too, including future/private historical helpers.
  revoke all on schema hq_influencer_private from public,anon,authenticated,service_role;
  revoke all on all functions in schema hq_influencer_private from public,anon,authenticated,service_role;
  revoke all on all tables in schema hq_influencer_private from public,anon,authenticated,service_role;
  revoke all on all sequences in schema hq_influencer_private from public,anon,authenticated,service_role;
end $optional_suspend$;
notify pgrst,'reload schema';
commit;
-- NOTIFY solicita reload; nao comprova Auth HTTP/JWT, consumo do cache ou MFA.
