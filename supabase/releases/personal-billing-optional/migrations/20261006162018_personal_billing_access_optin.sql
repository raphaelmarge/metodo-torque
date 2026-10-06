-- OPTIONAL, after personal_billing_saas_optin and the existing reliability release.
-- SaaS entitlements apply only to bound academias. The existing 14+3 trial
-- restriction is also enforced for professional core writes without a checkout.
-- Student token reads/writes, backups, DELETE and administrative benefits remain intact.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$ begin
  if to_regprocedure('public.minha_assinatura()') is null
    or to_regprocedure('torque_private.studio_diff(jsonb,jsonb,text[])') is null
    or to_regclass('public.app_aluno') is null or to_regclass('public.dados') is null then
    raise exception 'personal_billing_access_requires_existing_application_contracts';
  end if;
end $$;
-- Remember product scope independently of the editable/deletable document.
-- This is not a payment binding and does not create a subscription or reset trial.
create table personal_billing.professional_accounts (
  academia_id uuid primary key references public.academias(id) on delete cascade
);
alter table personal_billing.professional_accounts enable row level security;
revoke all on personal_billing.professional_accounts from public,anon,authenticated,service_role;
insert into personal_billing.professional_accounts(academia_id)
  select distinct academia_id from public.dados where chave='mtapp:ptStudio' on conflict do nothing;
alter function public.minha_assinatura() set schema personal_billing;
alter function personal_billing.minha_assinatura() rename to legacy_minha_assinatura;
revoke all on function personal_billing.legacy_minha_assinatura() from public,anon,authenticated,service_role;

create function public.minha_assinatura()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare legacy jsonb; billing jsonb; aid uuid;
begin
  legacy:=personal_billing.legacy_minha_assinatura();
  aid:=(legacy->>'academia_id')::uuid;
  if aid is null or legacy->>'status' in ('vitalicia','cortesia')
    or not exists(select 1 from personal_billing.accounts where academia_id=aid) then return legacy; end if;
  billing:=personal_billing.status(aid);
  return legacy || jsonb_build_object('via','pagarme_saas','vence',billing->'accessUntil',
    'travado',not (billing->>'accessActive')::boolean,'billing_state',billing->>'state',
    'status',case when not (billing->>'accessActive')::boolean then 'bloqueada'
      when (billing->>'paidThrough')::timestamptz>now() then 'ativa'
      when (billing->>'accessActive')::boolean then 'trial' else 'bloqueada' end,
    'dias_ate_travar',greatest(0,ceil(extract(epoch from (billing->>'accessUntil')::timestamptz-now())/86400)::integer));
end $$;
revoke all on function public.minha_assinatura() from public,anon;
grant execute on function public.minha_assinatura() to authenticated,service_role;

create function personal_billing.professional_expired(p_academia uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null
    and case when exists(select 1 from personal_billing.accounts where academia_id=p_academia)
      then not coalesce((personal_billing.status(p_academia)->>'accessActive')::boolean,false)
      else exists(select 1 from public.academias acc cross join public.assinatura_regras rules
        where acc.id=p_academia and rules.id=1 and case
          when acc.assinatura_status in ('ativa','atrasada','vitalicia') then false
          when acc.assinatura_status='cortesia' then not coalesce(isfinite(acc.assinatura_vence) and acc.assinatura_vence>now(),false)
          when acc.assinatura_status='trial' then acc.criada+make_interval(days=>rules.dias_teste+rules.dias_carencia)<=now()
          else true end) end
$$;

create function personal_billing.revocation_only(p_academia uuid,p_before jsonb,p_after jsonb)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare op jsonb; previous jsonb; changed jsonb; expected jsonb; changes integer:=0;
begin
  if p_before is not distinct from p_after then return true; end if;
  if jsonb_typeof(p_before) is distinct from 'object' or jsonb_typeof(p_after) is distinct from 'object' then return false; end if;
  for op in select * from torque_private.studio_diff(p_before,p_after) loop
    changes:=changes+1;
    if jsonb_array_length(op->'caminho')<>2 or op->'caminho'->>0<>'alunos'
      or op->'antes'->>'existe' is distinct from 'true' or op->'depois'->>'existe' is distinct from 'true' then return false; end if;
    previous:=op->'antes'->'valor'; changed:=op->'depois'->'valor';
    if coalesce(changed->>'appRevogadoEm','') !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
    expected:=(previous-'appPubEm'-'appVer')||jsonb_build_object('appRevogadoEm',changed->'appRevogadoEm');
    if changed is distinct from expected or not exists(select 1 from public.app_aluno
      where token=previous->>'appTokenP' and academia_id=p_academia and revogado_em is not null) then return false; end if;
  end loop;
  return changes>0;
end $$;

create function personal_billing.guard_professional_write()
returns trigger language plpgsql security definer set search_path='' as $$
declare denied boolean;
begin
  -- Security-definer student RPCs retain their token authorization and access;
  -- there is no authenticated professional actor to whom SaaS billing applies.
  if tg_table_name='dados' then
    if new.chave='mtapp:ptStudio' then
      insert into personal_billing.professional_accounts(academia_id) values(new.academia_id) on conflict do nothing;
    end if;
  end if;
  if auth.uid() is null then return new; end if;
  if tg_table_name='app_aluno' and not exists(select 1 from personal_billing.accounts where academia_id=new.academia_id)
    and not exists(select 1 from personal_billing.professional_accounts where academia_id=new.academia_id) then return new; end if;
  denied:=personal_billing.professional_expired(new.academia_id);
  if tg_op='UPDATE' then denied:=denied or personal_billing.professional_expired(old.academia_id); end if;
  if not denied then return new; end if;
  if tg_table_name='dados' then
    if new.chave<>'mtapp:ptStudio' and (tg_op<>'UPDATE' or old.chave<>'mtapp:ptStudio') then return new; end if;
    if tg_op='UPDATE' and new.academia_id=old.academia_id and new.chave=old.chave
      and personal_billing.revocation_only(new.academia_id,old.valor,new.valor) then return new; end if;
  elsif tg_table_name='app_aluno' then
    if tg_op='UPDATE' and new.academia_id=old.academia_id and new.token=old.token
      and (new.dados is not distinct from old.dados or new.dados is null) and new.revogado_em is not null
      and (coalesce(to_jsonb(new)->>'login','')='' or to_jsonb(new)->'login' is not distinct from to_jsonb(old)->'login')
      and (coalesce(to_jsonb(new)->>'senha','')='' or to_jsonb(new)->'senha' is not distinct from to_jsonb(old)->'senha')
      and (to_jsonb(new)-array['revogado_em','atualizado','dados','login','senha'])=
          (to_jsonb(old)-array['revogado_em','atualizado','dados','login','senha']) then return new; end if;
  end if;
  raise exception 'A assinatura terminou. Seus dados continuam disponíveis para consulta e exportação.' using errcode='PT402';
end $$;
revoke all on function personal_billing.professional_expired(uuid),
  personal_billing.revocation_only(uuid,jsonb,jsonb),personal_billing.guard_professional_write()
  from public,anon,authenticated,service_role;
create trigger personal_billing_dados_guard before insert or update on public.dados
  for each row execute function personal_billing.guard_professional_write();
create trigger personal_billing_publicacao_guard before insert or update on public.app_aluno
  for each row execute function personal_billing.guard_professional_write();
notify pgrst,'reload schema';
commit;
