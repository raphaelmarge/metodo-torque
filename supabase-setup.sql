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

-- ==================== LISTA DE ESPERA NAS AULAS ====================
-- Aula lotada: o aluno entra na fila pelo app; quando alguém cancela, a
-- Grade promove o primeiro da fila. Bloco idempotente.

create or replace function public.app_aluno_espera(t text, p_aula_id text, p_aula_nome text, p_data date, p_nome text)
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
               and status in ('pendente', 'confirmado', 'espera')) then
    return json_build_object('erro', 'ja_agendado');
  end if;
  insert into app_agendamentos (academia_id, token, aluno, aula_id, aula_nome, data, status)
    values (v_acad, t, coalesce(p_nome, ''), p_aula_id, coalesce(p_aula_nome, ''), p_data, 'espera')
    returning id into v_id;
  return json_build_object('ok', true, 'id', v_id, 'espera', true);
end;
$$;

-- agendar também não pode duplicar quem já está na fila de espera
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
               and status in ('pendente', 'confirmado', 'espera')) then
    return json_build_object('erro', 'ja_agendado');
  end if;
  insert into app_agendamentos (academia_id, token, aluno, aula_id, aula_nome, data)
    values (v_acad, t, coalesce(p_nome, ''), p_aula_id, coalesce(p_aula_nome, ''), p_data)
    returning id into v_id;
  return json_build_object('ok', true, 'id', v_id);
end;
$$;

-- o aluno também pode sair da lista de espera
create or replace function public.app_aluno_cancela(t text, p_id uuid)
returns json
language plpgsql security definer
set search_path = public
as $$
begin
  update app_agendamentos set status = 'cancelado'
    where id = p_id and token = t and status in ('pendente', 'confirmado', 'espera');
  if not found then
    return json_build_object('erro', 'nao_encontrado');
  end if;
  return json_build_object('ok', true);
end;
$$;

grant execute on function public.app_aluno_espera(text, text, text, date, text) to anon, authenticated;

-- ==================== TIMELINE SOCIAL (curtidas e comentários) ====================
-- O aluno curte e comenta os posts do mural pelo app (validado pelo token).
-- Bloco idempotente.

create table if not exists public.app_reacoes (
  id uuid primary key default gen_random_uuid(),
  academia_id uuid not null references public.academias (id) on delete cascade,
  token text not null,
  post_id text not null,
  tipo text not null default 'like',            -- like | coment
  nome text not null default '',
  texto text not null default '',
  criado timestamptz not null default now()
);
create index if not exists app_reacoes_post on public.app_reacoes (academia_id, post_id);

alter table public.app_reacoes enable row level security;

drop policy if exists "app_reacoes_membros" on public.app_reacoes;
create policy "app_reacoes_membros" on public.app_reacoes
  for all using (academia_id in (select public.minhas_academias()))
  with check (academia_id in (select public.minhas_academias()));

-- curtir (de novo = descurtir) ou comentar
create or replace function public.app_aluno_reage(t text, p_post text, p_tipo text, p_nome text, p_texto text)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_acad uuid;
begin
  select academia_id into v_acad from app_aluno where token = t;
  if v_acad is null then
    return json_build_object('erro', 'token_invalido');
  end if;
  if p_tipo = 'like' then
    if exists (select 1 from app_reacoes where token = t and post_id = p_post and tipo = 'like') then
      delete from app_reacoes where token = t and post_id = p_post and tipo = 'like';
      return json_build_object('ok', true, 'curtiu', false);
    end if;
    insert into app_reacoes (academia_id, token, post_id, tipo, nome)
      values (v_acad, t, p_post, 'like', coalesce(p_nome, ''));
    return json_build_object('ok', true, 'curtiu', true);
  end if;
  if length(trim(coalesce(p_texto, ''))) = 0 then
    return json_build_object('erro', 'texto_vazio');
  end if;
  insert into app_reacoes (academia_id, token, post_id, tipo, nome, texto)
    values (v_acad, t, p_post, 'coment', coalesce(p_nome, ''), left(trim(p_texto), 400));
  return json_build_object('ok', true);
end;
$$;

-- curtidas e comentários de todos os posts (para pintar a Timeline)
create or replace function public.app_aluno_reacoes(t text)
returns json
language sql security definer stable
set search_path = public
as $$
  select coalesce(json_agg(json_build_object(
      'post', post_id, 'tipo', tipo, 'nome', nome, 'texto', texto,
      'meu', (token = t), 'criado', criado) order by criado), '[]'::json)
  from app_reacoes
  where academia_id = (select academia_id from app_aluno where token = t)
$$;

grant execute on function public.app_aluno_reage(text, text, text, text, text) to anon, authenticated;
grant execute on function public.app_aluno_reacoes(text) to anon, authenticated;

-- ==================== LIMITE DE AGENDAMENTOS SIMULTÂNEOS ====================
-- Regras de reserva: máximo de agendamentos futuros ativos por aluno
-- (configurável na Grade → Regras de agendamento; padrão 3).

create or replace function public.app_aluno_agenda(t text, p_aula_id text, p_aula_nome text, p_data date, p_nome text)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_acad uuid;
  v_id uuid;
  v_max int;
begin
  select academia_id into v_acad from app_aluno where token = t;
  if v_acad is null then
    return json_build_object('erro', 'token_invalido');
  end if;
  if exists (select 1 from app_agendamentos
             where token = t and aula_id = p_aula_id and data = p_data
               and status in ('pendente', 'confirmado', 'espera')) then
    return json_build_object('erro', 'ja_agendado');
  end if;
  select coalesce((valor->'config'->>'maxAtivos')::int, 3) into v_max
    from dados where academia_id = v_acad and chave = 'grade';
  if v_max is null then v_max := 3; end if;
  if v_max > 0 and (select count(*) from app_agendamentos
      where token = t and status in ('pendente', 'confirmado')
        and data >= current_date) >= v_max then
    return json_build_object('erro', 'limite', 'max', v_max);
  end if;
  insert into app_agendamentos (academia_id, token, aluno, aula_id, aula_nome, data)
    values (v_acad, t, coalesce(p_nome, ''), p_aula_id, coalesce(p_aula_nome, ''), p_data)
    returning id into v_id;
  return json_build_object('ok', true, 'id', v_id);
end;
$$;

-- ==================== MATRÍCULA ONLINE ====================
-- Página pública (matricula.html na raiz do site): o interessado escolhe o
-- plano e deixa os dados; cai no Funil Comercial como lead quente.
-- Bloco idempotente.

create table if not exists public.matricula_config (
  academia_id uuid primary key references public.academias (id) on delete cascade,
  dados jsonb,
  atualizado timestamptz not null default now()
);

create table if not exists public.matriculas_online (
  id uuid primary key default gen_random_uuid(),
  academia_id uuid not null references public.academias (id) on delete cascade,
  nome text not null,
  zap text not null default '',
  email text not null default '',
  plano text not null default '',
  status text not null default 'novo',          -- novo | importado
  criado timestamptz not null default now()
);

alter table public.matricula_config enable row level security;
alter table public.matriculas_online enable row level security;

drop policy if exists "matricula_config_membros" on public.matricula_config;
create policy "matricula_config_membros" on public.matricula_config
  for all using (academia_id in (select public.minhas_academias()))
  with check (academia_id in (select public.minhas_academias()));

drop policy if exists "matriculas_online_membros" on public.matriculas_online;
create policy "matriculas_online_membros" on public.matriculas_online
  for all using (academia_id in (select public.minhas_academias()))
  with check (academia_id in (select public.minhas_academias()));

-- página pública lê os planos publicados (sem login)
create or replace function public.matricula_info()
returns jsonb
language sql security definer stable
set search_path = public
as $$
  select dados from matricula_config order by atualizado desc limit 1
$$;

-- página pública registra o interessado (mínimo necessário; limitado a 400 chars)
create or replace function public.matricula_nova(p_nome text, p_zap text, p_email text, p_plano text)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_acad uuid;
begin
  select academia_id into v_acad from matricula_config order by atualizado desc limit 1;
  if v_acad is null then
    return json_build_object('erro', 'sem_config');
  end if;
  if length(trim(coalesce(p_nome, ''))) < 2 then
    return json_build_object('erro', 'nome');
  end if;
  insert into matriculas_online (academia_id, nome, zap, email, plano)
    values (v_acad, left(trim(p_nome), 120), left(coalesce(p_zap, ''), 20),
            left(coalesce(p_email, ''), 120), left(coalesce(p_plano, ''), 120));
  return json_build_object('ok', true);
end;
$$;

grant execute on function public.matricula_info() to anon, authenticated;
grant execute on function public.matricula_nova(text, text, text, text) to anon, authenticated;

-- ==================== TREINO SINCRONIZADO ====================
-- O app do aluno envia as séries feitas e as cargas; o professor vê a
-- execução real na tela de Treinos. Bloco idempotente.

create table if not exists public.app_treino_log (
  id uuid primary key default gen_random_uuid(),
  academia_id uuid not null references public.academias (id) on delete cascade,
  token text not null,
  dia date not null,
  exercicio text not null,
  feitas integer not null default 0,
  carga text not null default '',
  criado timestamptz not null default now()
);
create index if not exists app_treino_log_dia on public.app_treino_log (academia_id, dia);
create unique index if not exists app_treino_log_unico on public.app_treino_log (token, dia, exercicio);

alter table public.app_treino_log enable row level security;

drop policy if exists "app_treino_log_membros" on public.app_treino_log;
create policy "app_treino_log_membros" on public.app_treino_log
  for all using (academia_id in (select public.minhas_academias()))
  with check (academia_id in (select public.minhas_academias()));

-- o app envia o dia inteiro de uma vez (upsert por exercício)
create or replace function public.app_aluno_treino_reg(t text, p_dia date, p_itens jsonb)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_acad uuid;
  it jsonb;
begin
  select academia_id into v_acad from app_aluno where token = t;
  if v_acad is null then
    return json_build_object('erro', 'token_invalido');
  end if;
  for it in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    insert into app_treino_log (academia_id, token, dia, exercicio, feitas, carga)
      values (v_acad, t, p_dia, left(coalesce(it->>'ex', ''), 120),
              coalesce((it->>'f')::int, 0), left(coalesce(it->>'c', ''), 30))
    on conflict (token, dia, exercicio) do update
      set feitas = excluded.feitas, carga = excluded.carga, criado = now();
  end loop;
  return json_build_object('ok', true);
end;
$$;

grant execute on function public.app_aluno_treino_reg(text, date, jsonb) to anon, authenticated;

-- ==================== PUSH DE VERDADE (Web Push) ====================
-- O app hospedado (site/app/?t=TOKEN) registra a inscrição de push aqui;
-- a função push-envia manda as notificações. Bloco idempotente.

create table if not exists public.push_subs (
  token text primary key,
  academia_id uuid not null references public.academias (id) on delete cascade,
  sub jsonb not null,
  criado timestamptz not null default now()
);

alter table public.push_subs enable row level security;

drop policy if exists "push_subs_membros" on public.push_subs;
create policy "push_subs_membros" on public.push_subs
  for all using (academia_id in (select public.minhas_academias()))
  with check (academia_id in (select public.minhas_academias()));

create or replace function public.app_aluno_push(t text, p_sub jsonb)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_acad uuid;
begin
  select academia_id into v_acad from app_aluno where token = t;
  if v_acad is null then
    return json_build_object('erro', 'token_invalido');
  end if;
  insert into push_subs (token, academia_id, sub) values (t, v_acad, p_sub)
    on conflict (token) do update set sub = excluded.sub, criado = now();
  return json_build_object('ok', true);
end;
$$;

grant execute on function public.app_aluno_push(text, jsonb) to anon, authenticated;

-- ==================== LOJA NO APP ====================
-- O aluno pede produtos pelo app; a tela de Produtos recebe, entrega e
-- baixa o estoque. Bloco idempotente.

create table if not exists public.app_pedidos (
  id uuid primary key default gen_random_uuid(),
  academia_id uuid not null references public.academias (id) on delete cascade,
  token text not null,
  aluno text not null default '',
  itens jsonb not null default '[]'::jsonb,      -- [{n: nome, q: qtd, v: valor unit}]
  total numeric not null default 0,
  status text not null default 'novo',           -- novo | entregue | cancelado
  criado timestamptz not null default now()
);

alter table public.app_pedidos enable row level security;

drop policy if exists "app_pedidos_membros" on public.app_pedidos;
create policy "app_pedidos_membros" on public.app_pedidos
  for all using (academia_id in (select public.minhas_academias()))
  with check (academia_id in (select public.minhas_academias()));

create or replace function public.app_aluno_pedido(t text, p_itens jsonb, p_total numeric, p_nome text)
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
  if jsonb_array_length(coalesce(p_itens, '[]'::jsonb)) = 0 then
    return json_build_object('erro', 'vazio');
  end if;
  insert into app_pedidos (academia_id, token, aluno, itens, total)
    values (v_acad, t, coalesce(p_nome, ''), p_itens, coalesce(p_total, 0))
    returning id into v_id;
  return json_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function public.app_aluno_pedidos(t text)
returns json
language sql security definer stable
set search_path = public
as $$
  select coalesce(json_agg(json_build_object(
      'id', id, 'itens', itens, 'total', total, 'status', status,
      'criado', to_char(criado, 'DD/MM')) order by criado desc), '[]'::json)
  from (select * from app_pedidos where token = t order by criado desc limit 20) s
$$;

grant execute on function public.app_aluno_pedido(text, jsonb, numeric, text) to anon, authenticated;
grant execute on function public.app_aluno_pedidos(text) to anon, authenticated;

-- ==================== TELEMETRIA DE ERROS ====================
-- As páginas do sistema reportam erros de JavaScript aqui; a página
-- Auditoria e Saúde mostra o que quebrou. Bloco idempotente.

create table if not exists public.erros_js (
  id uuid primary key default gen_random_uuid(),
  academia_id uuid not null references public.academias (id) on delete cascade,
  pagina text not null default '',
  msg text not null default '',
  pilha text not null default '',
  navegador text not null default '',
  quem text not null default '',
  criado timestamptz not null default now()
);
create index if not exists erros_js_criado on public.erros_js (academia_id, criado desc);

alter table public.erros_js enable row level security;

drop policy if exists "erros_js_membros" on public.erros_js;
create policy "erros_js_membros" on public.erros_js
  for all using (academia_id in (select public.minhas_academias()))
  with check (academia_id in (select public.minhas_academias()));

-- ==================== INDIQUE UM AMIGO ====================
-- A matrícula online pode chegar com o código de indicação de um aluno
-- (o mesmo código da carteirinha). Bloco idempotente.

alter table public.matriculas_online add column if not exists indicacao text not null default '';

drop function if exists public.matricula_nova(text, text, text, text);
create or replace function public.matricula_nova(p_nome text, p_zap text, p_email text, p_plano text, p_indicacao text default '')
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_acad uuid;
begin
  select academia_id into v_acad from matricula_config order by atualizado desc limit 1;
  if v_acad is null then
    return json_build_object('erro', 'sem_config');
  end if;
  if length(trim(coalesce(p_nome, ''))) < 2 then
    return json_build_object('erro', 'nome');
  end if;
  insert into matriculas_online (academia_id, nome, zap, email, plano, indicacao)
    values (v_acad, left(trim(p_nome), 120), left(coalesce(p_zap, ''), 20),
            left(coalesce(p_email, ''), 120), left(coalesce(p_plano, ''), 120),
            left(upper(coalesce(p_indicacao, '')), 12));
  return json_build_object('ok', true);
end;
$$;

grant execute on function public.matricula_nova(text, text, text, text, text) to anon, authenticated;
