const fs=require('node:fs'),path=require('node:path');
const ids={a:'10000000-0000-4000-8000-000000000001',b:'10000000-0000-4000-8000-000000000002',
 u:'20000000-0000-4000-8000-000000000001',v:'20000000-0000-4000-8000-000000000002',w:'20000000-0000-4000-8000-000000000003',
 s:'30000000-0000-4000-8000-000000000001',t:'30000000-0000-4000-8000-000000000002',z:'30000000-0000-4000-8000-000000000003'};
const bootstrap=`do $$begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
 end$$;
 create schema auth;grant usage on schema auth to authenticated;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create table auth.sessions(id uuid primary key,user_id uuid,created_at timestamptz default now(),updated_at timestamptz default now(),not_after timestamptz,user_agent text);
 create table public.academias(id uuid primary key);
 create table public.membros(academia_id uuid,user_id uuid,nome text);
 create function public.minhas_academias() returns setof uuid language sql stable security definer set search_path='' as $$select academia_id from public.membros where user_id=auth.uid()$$;
 create table public.dados(academia_id uuid,chave text,valor jsonb,atualizado timestamptz default clock_timestamp(),primary key(academia_id,chave));
 create function public.test_stamp() returns trigger language plpgsql as $$begin new.atualizado:=clock_timestamp();return new;end$$;
 create trigger test_stamp before update on public.dados for each row execute function public.test_stamp();
 alter table public.dados enable row level security;
 create policy dados_academia on public.dados for all to authenticated using(academia_id in(select public.minhas_academias())) with check(academia_id in(select public.minhas_academias()));
 grant select,insert,update,delete on public.dados to authenticated;
 create table public.app_aluno(token text primary key,academia_id uuid,revogado_em timestamptz,dados jsonb,retorno jsonb);
 grant select on public.app_aluno to authenticated;
 create function public.aluno_revoga_acesso(p_token text,p_apagar boolean) returns jsonb language plpgsql security definer set search_path='' as $$begin
 update public.app_aluno set revogado_em=now(),dados=null where token=p_token and academia_id in(select public.minhas_academias());
 if not found then return '{"erro":"Não autorizado"}';end if;return '{"ok":true}';end$$;
 insert into public.academias values('${ids.a}'),('${ids.b}');
 insert into public.membros values('${ids.a}','${ids.u}','Pessoa A'),('${ids.a}','${ids.v}','Pessoa B'),('${ids.b}','${ids.w}','Pessoa C');
 insert into auth.sessions(id,user_id,user_agent) values('${ids.s}','${ids.u}','Safari fictício'),('${ids.t}','${ids.v}','Chromium fictício'),('${ids.z}','${ids.w}','Outro fictício');`;
const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20260926232430_confiabilidade_interna.sql'),'utf8');
const login=(u=ids.u,s=ids.s)=>`set role authenticated;select set_config('request.jwt.claim.sub','${u}',false);select set_config('request.jwt.claims','{"session_id":"${s}"}',false);`;
const initial=()=>({alunos:[{id:'a',nome:'Ana fictícia',appTokenP:'token-ficticio'},{id:'b',nome:'Bia fictícia'}],treinosV2:{a:{fichas:[{id:'f1',nome:'A'},{id:'f2',nome:'B'}]}},config:{cor:'azul'}});
module.exports={ids,bootstrap,migration,login,initial};
