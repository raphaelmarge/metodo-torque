-- Método Torque — estrutura multi-academia (login, equipe e sincronização).
-- Cole este arquivo inteiro no SQL Editor do Supabase e clique em Run.
-- Pode rodar mais de uma vez sem problema.

-- limpa a versão antiga (dados por usuário), se existir
drop table if exists public.dados cascade;
drop table if exists public.membros cascade;
drop table if exists public.academias cascade;
drop function if exists public.minhas_academias() cascade;
drop function if exists public.criar_academia(text, text) cascade;
drop function if exists public.entrar_na_equipe(text, text) cascade;

-- ==================== TABELAS ====================

create table public.academias (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  codigo_equipe text not null unique,
  criada timestamptz not null default now()
);

create table public.membros (
  academia_id uuid not null references public.academias (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  papel text not null check (papel in ('dono', 'funcionario')),
  nome text not null default '',
  email text not null default '',
  criado timestamptz not null default now(),
  primary key (academia_id, user_id)
);

-- os dados dos programas: uma linha por (academia, chave). Toda a equipe
-- da academia compartilha as mesmas linhas — academias nunca se misturam.
create table public.dados (
  academia_id uuid not null references public.academias (id) on delete cascade,
  chave text not null,
  valor jsonb,
  atualizado timestamptz not null default now(),
  primary key (academia_id, chave)
);

-- ==================== HELPERS ====================

-- academias das quais o usuário logado faz parte (security definer para
-- não recursionar nas políticas)
create function public.minhas_academias()
returns setof uuid
language sql security definer stable
set search_path = public
as $$
  select academia_id from public.membros where user_id = auth.uid()
$$;

-- ==================== POLÍTICAS (RLS) ====================

alter table public.academias enable row level security;
alter table public.membros enable row level security;
alter table public.dados enable row level security;

create policy "academia_ver_minha" on public.academias
  for select using (id in (select public.minhas_academias()));

create policy "membros_ver_equipe" on public.membros
  for select using (academia_id in (select public.minhas_academias()));

-- só o dono remove funcionários (e ninguém remove o dono)
create policy "membros_dono_remove" on public.membros
  for delete using (
    papel <> 'dono'
    and exists (
      select 1 from public.membros m
      where m.academia_id = membros.academia_id
        and m.user_id = auth.uid() and m.papel = 'dono'
    )
  );

create policy "dados_select" on public.dados
  for select using (academia_id in (select public.minhas_academias()));
create policy "dados_insert" on public.dados
  for insert with check (academia_id in (select public.minhas_academias()));
create policy "dados_update" on public.dados
  for update using (academia_id in (select public.minhas_academias()));
create policy "dados_delete" on public.dados
  for delete using (academia_id in (select public.minhas_academias()));

-- ==================== FUNÇÕES DE CADASTRO ====================

-- Dono cria a academia e vira o primeiro membro. Retorna o código da equipe.
create function public.criar_academia(p_nome_academia text, p_nome_membro text)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_codigo text;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'faça login antes';
  end if;
  -- código da equipe: 6 caracteres fáceis de ditar
  v_codigo := upper(substr(md5(gen_random_uuid()::text), 1, 6));
  select email into v_email from auth.users where id = auth.uid();

  insert into academias (nome, codigo_equipe) values (p_nome_academia, v_codigo)
    returning id into v_id;
  insert into membros (academia_id, user_id, papel, nome, email)
    values (v_id, auth.uid(), 'dono', coalesce(p_nome_membro, ''), coalesce(v_email, ''));

  return json_build_object('academia_id', v_id, 'nome', p_nome_academia, 'codigo_equipe', v_codigo);
end;
$$;

-- Funcionário entra na equipe usando o código da academia.
create function public.entrar_na_equipe(p_codigo text, p_nome text)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_acad record;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'faça login antes';
  end if;
  select id, nome into v_acad from academias
    where codigo_equipe = upper(trim(p_codigo));
  if v_acad.id is null then
    raise exception 'código da equipe inválido';
  end if;
  select email into v_email from auth.users where id = auth.uid();

  insert into membros (academia_id, user_id, papel, nome, email)
    values (v_acad.id, auth.uid(), 'funcionario', coalesce(p_nome, ''), coalesce(v_email, ''))
    on conflict (academia_id, user_id) do nothing;

  return json_build_object('academia_id', v_acad.id, 'nome', v_acad.nome);
end;
$$;

grant execute on function public.criar_academia(text, text) to authenticated;
grant execute on function public.entrar_na_equipe(text, text) to authenticated;

-- ==================== APP DO ALUNO (conectado) ====================
-- A academia publica o app de cada aluno aqui; o app no celular do aluno
-- busca a versão nova pelo token secreto (função RPC — sem listar a tabela).
-- Este bloco pode rodar mais de uma vez sem problema.

create table if not exists public.app_aluno (
  token text primary key,
  academia_id uuid not null references public.academias (id) on delete cascade,
  dados jsonb,
  atualizado timestamptz not null default now()
);

alter table public.app_aluno enable row level security;

-- só membros da academia escrevem/leem pela API normal (o aluno usa a RPC)
drop policy if exists "app_aluno_membros" on public.app_aluno;
create policy "app_aluno_membros" on public.app_aluno
  for all using (academia_id in (select public.minhas_academias()))
  with check (academia_id in (select public.minhas_academias()));

-- o app do aluno chama esta função com o token (chave secreta e única);
-- security definer: devolve só a linha daquele token, nunca a tabela
create or replace function public.app_aluno_busca(t text)
returns jsonb
language sql security definer stable
set search_path = public
as $$
  select dados from public.app_aluno where token = t
$$;

grant execute on function public.app_aluno_busca(text) to anon, authenticated;

-- ==================== AGENDAMENTO PELO APP DO ALUNO ====================
-- O aluno agenda a aula pelo app (validado pelo token); a Grade da academia
-- puxa os pendentes e coloca o nome na lista de participantes.
-- Bloco idempotente — pode rodar mais de uma vez.

create table if not exists public.app_agendamentos (
  id uuid primary key default gen_random_uuid(),
  academia_id uuid not null references public.academias (id) on delete cascade,
  token text not null,
  aluno text not null default '',
  aula_id text not null,
  aula_nome text not null default '',
  data date not null,
  status text not null default 'pendente',
  criado timestamptz not null default now()
);

alter table public.app_agendamentos enable row level security;

drop policy if exists "app_agend_membros" on public.app_agendamentos;
create policy "app_agend_membros" on public.app_agendamentos
  for all using (academia_id in (select public.minhas_academias()))
  with check (academia_id in (select public.minhas_academias()));

-- aluno agenda (token válido = existe em app_aluno); evita duplicar
create or replace function public.app_aluno_agenda(t text, p_aula_id text, p_aula_nome text, p_data date, p_nome text)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_acad uuid;
  v_id uuid;
begin
  select academia_id into v_acad from app_aluno where token = t;
  if v_acad is null then
    return json_build_object('erro', 'token_invalido');
  end if;
  if exists (select 1 from app_agendamentos
             where token = t and aula_id = p_aula_id and data = p_data
               and status in ('pendente', 'confirmado')) then
    return json_build_object('erro', 'ja_agendado');
  end if;
  insert into app_agendamentos (academia_id, token, aluno, aula_id, aula_nome, data)
    values (v_acad, t, coalesce(p_nome, ''), p_aula_id, coalesce(p_aula_nome, ''), p_data)
    returning id into v_id;
  return json_build_object('ok', true, 'id', v_id);
end;
$$;

-- aluno vê os próprios agendamentos
create or replace function public.app_aluno_agendamentos(t text)
returns json
language sql security definer stable
set search_path = public
as $$
  select coalesce(json_agg(json_build_object(
      'id', id, 'aula', aula_nome, 'data', data, 'status', status)
      order by data desc, criado desc), '[]'::json)
  from (select * from app_agendamentos
        where token = t and status <> 'cancelado_ok'
        order by data desc, criado desc limit 30) s
$$;

-- aluno cancela um agendamento próprio
create or replace function public.app_aluno_cancela(t text, p_id uuid)
returns json
language plpgsql security definer
set search_path = public
as $$
begin
  update app_agendamentos set status = 'cancelado'
    where id = p_id and token = t and status in ('pendente', 'confirmado');
  if not found then
    return json_build_object('erro', 'nao_encontrado');
  end if;
  return json_build_object('ok', true);
end;
$$;

grant execute on function public.app_aluno_agenda(text, text, text, date, text) to anon, authenticated;
grant execute on function public.app_aluno_agendamentos(text) to anon, authenticated;
grant execute on function public.app_aluno_cancela(text, uuid) to anon, authenticated;

-- ============================================================
-- CHAT UNIFICADO (WhatsApp + Instagram + IA)  — rode uma vez
-- As mensagens entram pelas Edge Functions (pasta supabase/functions):
--   meta-webhook  → recebe da Meta e, no modo automático, responde com IA
--   chat-envia    → envio manual pela equipe + sugestão de resposta
-- ============================================================

create table if not exists public.chat_conversas (
  id uuid primary key default gen_random_uuid(),
  academia_id uuid not null references public.academias(id) on delete cascade,
  canal text not null default 'whatsapp',        -- whatsapp | instagram
  contato_id text not null,                      -- telefone (WhatsApp) ou ID do Instagram
  nome text not null default '',
  modo_auto boolean not null default false,      -- IA responde sozinha NESTA conversa
  nao_lidas integer not null default 0,
  ultima_msg text not null default '',
  atualizado timestamptz not null default now(),
  unique (academia_id, canal, contato_id)
);

create table if not exists public.chat_mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.chat_conversas(id) on delete cascade,
  academia_id uuid not null references public.academias(id) on delete cascade,
  de text not null default 'cliente',            -- cliente | equipe | ia
  texto text not null default '',
  mid text not null default '',                  -- id da mensagem na Meta (evita duplicar)
  criado timestamptz not null default now()
);
create index if not exists chat_mensagens_conversa
  on public.chat_mensagens (conversa_id, criado);
create unique index if not exists chat_mensagens_mid
  on public.chat_mensagens (mid) where mid <> '';

create table if not exists public.chat_config (
  academia_id uuid primary key references public.academias(id) on delete cascade,
  auto_global boolean not null default false,    -- IA responde toda conversa (salvo desligadas)
  prompt text not null default '',               -- instruções extras para a IA
  atualizado timestamptz not null default now()
);

alter table public.chat_conversas enable row level security;
alter table public.chat_mensagens enable row level security;
alter table public.chat_config    enable row level security;

drop policy if exists "chat_conversas_membros" on public.chat_conversas;
create policy "chat_conversas_membros" on public.chat_conversas
  for all using (academia_id in (select public.minhas_academias()))
  with check (academia_id in (select public.minhas_academias()));

drop policy if exists "chat_mensagens_membros" on public.chat_mensagens;
create policy "chat_mensagens_membros" on public.chat_mensagens
  for all using (academia_id in (select public.minhas_academias()))
  with check (academia_id in (select public.minhas_academias()));

drop policy if exists "chat_config_membros" on public.chat_config;
create policy "chat_config_membros" on public.chat_config
  for all using (academia_id in (select public.minhas_academias()))
  with check (academia_id in (select public.minhas_academias()));

-- Chatbot de menu (boas-vindas + opções numeradas) — colunas extras.
-- Idempotente: pode rodar de novo mesmo se o bloco acima já foi rodado antes.
alter table public.chat_config    add column if not exists bot jsonb;
alter table public.chat_conversas add column if not exists bot_estado text not null default '';
