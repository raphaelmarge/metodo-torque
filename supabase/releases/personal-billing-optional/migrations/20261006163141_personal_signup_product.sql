-- New Personal accounts receive their canonical product before their first pupil.
-- No existing customer is classified or reclassified by this migration.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

do $$ begin
  if to_regprocedure('public.criar_academia(text,text)') is null
    or to_regclass('public.saas_clientes') is null
    or to_regclass('auth.sessions') is null then
    raise exception 'personal_signup_requires_canonical_account_contracts';
  end if;
end $$;

create or replace function public.criar_personal(p_nome_academia text,p_nome_membro text)
returns json language plpgsql security definer set search_path='' as $$
declare
  uid uuid := auth.uid();
  sid uuid := nullif(auth.jwt()->>'session_id','')::uuid;
  created json;
  aid uuid;
begin
  if uid is null or sid is null then raise exception 'auth_required' using errcode='42501'; end if;
  perform 1 from auth.sessions s where s.id=sid and s.user_id=uid
    and (s.not_after is null or s.not_after>now()) for key share;
  if not found then raise exception 'auth_required' using errcode='42501'; end if;
  if p_nome_academia is null or length(btrim(p_nome_academia)) not between 1 and 160
    or length(coalesce(p_nome_membro,''))>160 then
    raise exception 'invalid_input' using errcode='22023';
  end if;

  -- Serialize retries/double clicks of this account creation, not unrelated users.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('torque:personal-signup:'||uid::text,0));
  if exists(select 1 from public.membros m where m.user_id=uid) then
    raise exception 'account_already_exists' using errcode='23505';
  end if;
  created := public.criar_academia(btrim(p_nome_academia),coalesce(p_nome_membro,''));
  aid := nullif(created->>'academia_id','')::uuid;
  if aid is null or not exists (
    select 1 from public.academias a join public.membros m on m.academia_id=a.id
    where a.id=aid and m.user_id=uid and m.papel='dono'
  ) then raise exception 'personal_signup_account_creation_failed'; end if;

  -- Plain INSERT is deliberate: conflicts roll back creation, never rewrite a product.
  insert into public.saas_clientes(academia_id,tipo,plano,valor,status,obs,atualizado)
  values(aid,'personal','trial',0,'trial','Autocadastro do Personal',now());
  return created;
end $$;
revoke all on function public.criar_personal(text,text) from public,anon,service_role;
grant execute on function public.criar_personal(text,text) to authenticated;
comment on function public.criar_personal(text,text) is
  'Creates a new Personal account, owner and canonical product atomically. Never reclassifies an existing account; requires a live Auth session.';
notify pgrst,'reload schema';
commit;
