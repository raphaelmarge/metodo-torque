-- PREPARACAO LOCAL OPCIONAL: influencer resume. NAO executar automaticamente.
-- Fora da ativacao minima OPS. Nao instala modulo, cria usuario ou envia convite.
-- Preserva tabelas, dados, auditoria e memberships. Campanha deve estar OFF na retomada.
-- Ordem: suspender portal antes do ledger; retomar ledger antes do portal.
begin;
select pg_advisory_xact_lock(714882,2);
do $optional_resume$
declare entry record; dependency record; live oid; parked oid; live_count integer:=0;
  live_oids oid[]:='{}'; total integer:=6;
begin
  if to_regnamespace('hq_influencer_private') is null then
    raise exception using errcode='55000',message='Modulo influencer nao instalado';
  end if;
  if to_regclass('hq_referrals_private.campaign') is null then
    raise exception using errcode='55000',message='Campanha ausente; retomada nao instala configuracao';
  end if;
  if (select count(*) from hq_referrals_private.campaign where id='personal-referrals-v1' and enabled=false)<>1
    or exists(select 1 from hq_referrals_private.campaign where enabled is distinct from false) then
    raise exception using errcode='55000',message='Retomada exige campanha OFF e configuracao existente';
  end if;
  -- Resume the ledger before the portal. No credentials or missing RPCs are invented.
  for dependency in select * from (values
    ('hq_referrals_snapshot','suspended_referrals_snapshot','snapshot','','authenticated'),
    ('hq_referrals_save_partner','suspended_referrals_save_partner','save_partner','jsonb','authenticated'),
    ('hq_referrals_save_coupon','suspended_referrals_save_coupon','save_coupon','jsonb','authenticated'),
    ('hq_referrals_review','suspended_referrals_review','review','jsonb','authenticated'),
    ('hq_referrals_record_payment','suspended_referrals_record_payment','record_payment','jsonb','authenticated'),
    ('hq_referrals_load_customer','suspended_referrals_load_customer','load_customer','uuid','service_role'),
    ('hq_referrals_commit_customer','suspended_referrals_commit_customer','commit_customer','jsonb','service_role')
  ) f(public_name,parked_name,private_name,arguments,grantee) loop
    if to_regprocedure(format('public.%I(%s)',dependency.public_name,dependency.arguments)) is null
      or to_regprocedure(format('hq_referrals_private.%I(%s)',dependency.parked_name,dependency.arguments)) is not null then
      raise exception using errcode='55000',message='Retome o ledger antes do portal influencer';
    end if;
  end loop;
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
    parked:=to_regprocedure(format('hq_influencer_private.%I(%s)',entry.parked_name,entry.arguments));
    if parked is not null then
      execute format('alter function hq_influencer_private.%I(%s) rename to %I',entry.parked_name,entry.arguments,entry.public_name);
      execute format('alter function hq_influencer_private.%I(%s) set schema public',entry.public_name,entry.arguments);
    end if;
    execute format('revoke all on function public.%I(%s) from public,anon,authenticated,service_role',entry.public_name,entry.arguments);
  end loop;
  -- Revoke every private helper too, including future/private historical helpers.
  revoke all on schema hq_influencer_private from public,anon,authenticated,service_role;
  revoke all on all functions in schema hq_influencer_private from public,anon,authenticated,service_role;
  revoke all on all tables in schema hq_influencer_private from public,anon,authenticated,service_role;
  revoke all on all sequences in schema hq_influencer_private from public,anon,authenticated,service_role;
  grant usage on schema hq_influencer_private to authenticated;
  for entry in select * from (values
    ('hq_influencer_prepare_invite','suspended_influencer_prepare_invite','prepare_invite','jsonb','authenticated'),
    ('hq_influencer_list_invites','suspended_influencer_list_invites','list_invites','','authenticated'),
    ('hq_influencer_admin_snapshot','suspended_influencer_admin_snapshot','admin_snapshot','','authenticated'),
    ('hq_influencer_revoke_access','suspended_influencer_revoke_access','revoke_access','jsonb','authenticated'),
    ('influencer_accept_invite','suspended_influencer_accept_invite','accept_invite','','authenticated'),
    ('influencer_portal_snapshot','suspended_influencer_snapshot','snapshot','','authenticated')
  ) f(public_name,parked_name,private_name,arguments,grantee) loop
    execute format('grant execute on function public.%I(%s) to %I',entry.public_name,entry.arguments,entry.grantee);
    execute format('grant execute on function hq_influencer_private.%I(%s) to %I',entry.private_name,entry.arguments,entry.grantee);
  end loop;
end $optional_resume$;
notify pgrst,'reload schema';
commit;
-- NOTIFY solicita reload; nao comprova Auth HTTP/JWT, consumo do cache ou MFA.
