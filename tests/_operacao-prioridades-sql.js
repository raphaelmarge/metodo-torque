'use strict';
// Shared disposable fixture; never imported by application code or migrations.
const fs = require('node:fs'), path = require('node:path');
exports.read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
exports.agenda = 'supabase/migrations/20261006144200_agenda_aluno_idempotente.sql';
exports.hq = 'supabase/migrations/20261006144202_hq_operacao_estados_exportacao.sql';
exports.uid = n => '64000000-0000-4000-8000-' + String(n).padStart(12, '0');
exports.fixture = `
do $$begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon;end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated;end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role;end if;
end $$;
create schema auth;create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema public,auth to anon,authenticated;
create table saas_admins(user_id uuid primary key references auth.users(id));
create table academias(id uuid primary key,nome text,criada timestamptz default now(),assinatura_status text,assinatura_vence timestamptz);
create table saas_clientes(academia_id uuid primary key references academias(id),tipo text,status text);
create table dados(academia_id uuid,chave text,valor jsonb);
create table app_aluno(token text primary key,academia_id uuid references academias(id),revogado_em timestamptz);
create table app_agenda(id bigserial primary key,academia_id uuid,token text,dia date,hora text,obs text,status text default 'pedido');
alter table app_aluno enable row level security;alter table app_agenda enable row level security;alter table dados enable row level security;
create function app_aluno_ativo(t text) returns uuid language sql stable security definer set search_path='' as $$select academia_id from public.app_aluno where token=t and revogado_em is null$$;
create function hoje_br() returns date language sql stable as $$select '2026-10-06'::date$$;
insert into auth.users values('64000000-0000-4000-8000-000000000001'),('64000000-0000-4000-8000-000000000002'),('64000000-0000-4000-8000-000000000003');
insert into saas_admins values('64000000-0000-4000-8000-000000000001');
insert into academias values('64000000-0000-4000-8000-000000000101','Teste A',now(),'trial',now()+interval '2 days'),('64000000-0000-4000-8000-000000000102','Teste B',now(),'trial',null);
insert into saas_clientes values('64000000-0000-4000-8000-000000000101','personal','ativo');
insert into app_aluno(token,academia_id) select t,'64000000-0000-4000-8000-000000000101'::uuid from unnest(array['aluno-a','aluno-b','aluno-online','aluno-limite','aluno-revogado']) t;
insert into dados values('64000000-0000-4000-8000-000000000101','mtapp:ptStudio','{"alunos":[{"appTokenP":"aluno-online","atendimento":"online"}]}');
`;
