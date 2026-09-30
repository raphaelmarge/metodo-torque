-- Disposable test database bootstrap, NOT a product migration.
-- Credentials are deliberately public synthetic fixtures; never reuse them.
\set ON_ERROR_STOP on
do $$ begin
  if current_database() <> 'hq_auth_ci' then
    raise exception 'HQ CI bootstrap requires the disposable hq_auth_ci database';
  end if;
end $$;

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role authenticator login noinherit password 'hq_auth_ci_rest_test_only';
grant anon, authenticated, service_role to authenticator;
create role supabase_auth_admin login noinherit createrole noreplication
  password 'hq_auth_ci_auth_test_only';

revoke create on schema public from public;
grant usage on schema public to anon, authenticated, service_role;
create schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
grant usage on schema extensions to supabase_auth_admin, anon, authenticated, service_role;

create schema auth authorization supabase_auth_admin;
alter role supabase_auth_admin set search_path = auth, extensions;
grant usage on schema auth to anon, authenticated, service_role;

-- GoTrue itself installs auth.users, auth.sessions and the official auth.uid /
-- auth.jwt helpers from its versioned migrations. No Auth stubs belong here.
