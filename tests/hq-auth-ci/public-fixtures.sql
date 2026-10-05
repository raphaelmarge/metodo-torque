-- Only the application's minimal dependencies; Auth objects must already be real.
\set ON_ERROR_STOP on
do $$ begin
  if current_database() <> 'hq_auth_ci'
    or to_regclass('auth.users') is null
    or to_regclass('auth.sessions') is null
    or to_regprocedure('auth.uid()') is null
    or to_regprocedure('auth.jwt()') is null then
    raise exception 'HQ CI requires the real GoTrue migrations before fixtures';
  end if;
end $$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;

create table public.saas_admins (
  user_id uuid primary key references auth.users(id)
);
create table public.academias (
  id uuid primary key,
  nome text,
  criada timestamptz default now(),
  assinatura_status text,
  assinatura_via text,
  assinatura_vence timestamptz
);
create table public.saas_clientes (
  academia_id uuid primary key references public.academias(id),
  tipo text,
  status text
);
create table public.membros (
  academia_id uuid references public.academias(id),
  user_id uuid references auth.users(id),
  primary key(academia_id,user_id)
);
create table public.assinatura_regras (
  id int primary key, dias_teste int, dias_carencia int
);
insert into public.assinatura_regras values(1,14,3);
alter table public.membros enable row level security;
alter table public.assinatura_regras enable row level security;
revoke all on public.membros,public.assinatura_regras from public,anon,authenticated,service_role;
create function public.minhas_academias() returns setof uuid
language sql stable security definer set search_path='' as $$
  select academia_id from public.membros where user_id=auth.uid()
$$;
revoke all on function public.minhas_academias() from public,anon;
grant execute on function public.minhas_academias() to authenticated,service_role;
alter table public.saas_admins enable row level security;
alter table public.academias enable row level security;
alter table public.saas_clientes enable row level security;
revoke all on public.saas_admins, public.academias, public.saas_clientes
  from public, anon, authenticated, service_role;

create function public.hq_sou_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.saas_admins where user_id = auth.uid()
  )
$$;
revoke all on function public.hq_sou_admin() from public, anon, service_role;
grant execute on function public.hq_sou_admin() to authenticated;
notify pgrst, 'reload schema';
