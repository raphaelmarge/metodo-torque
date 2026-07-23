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

-- ==================== ASSESSORIA ONLINE (Personal) ====================
-- Check-in semanal do aluno de assessoria: nota da semana, peso e comentário.
-- O "treinei hoje" reaproveita app_treino_log (exercicio __feito). Bloco idempotente.

create table if not exists public.app_checkin (
  id uuid primary key default gen_random_uuid(),
  academia_id uuid not null references public.academias (id) on delete cascade,
  token text not null,
  dia date not null,
  nota integer not null default 0,
  texto text not null default '',
  peso numeric,
  criado timestamptz not null default now()
);
create index if not exists app_checkin_dia on public.app_checkin (academia_id, dia desc);
create unique index if not exists app_checkin_unico on public.app_checkin (token, dia);

alter table public.app_checkin enable row level security;

drop policy if exists "app_checkin_membros" on public.app_checkin;
create policy "app_checkin_membros" on public.app_checkin
  for all using (academia_id in (select public.minhas_academias()))
  with check (academia_id in (select public.minhas_academias()));

create or replace function public.app_aluno_checkin(t text, p_nota integer, p_texto text, p_peso numeric default null)
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
  insert into app_checkin (academia_id, token, dia, nota, texto, peso)
    values (v_acad, t, current_date, greatest(1, least(5, coalesce(p_nota, 3))),
            left(coalesce(p_texto, ''), 500), p_peso)
  on conflict (token, dia) do update
    set nota = excluded.nota, texto = excluded.texto, peso = excluded.peso, criado = now();
  return json_build_object('ok', true);
end;
$$;

grant execute on function public.app_aluno_checkin(text, integer, text, numeric) to anon, authenticated;

-- ==================== CHAT DO PERSONAL ====================
-- Conversa direta aluno ↔ personal dentro do app e do módulo. Bloco idempotente.

create table if not exists public.app_chat (
  id uuid primary key default gen_random_uuid(),
  academia_id uuid not null references public.academias (id) on delete cascade,
  token text not null,
  de text not null check (de in ('aluno', 'personal')),
  texto text not null,
  lida boolean not null default false,
  criado timestamptz not null default now()
);
create index if not exists app_chat_token on public.app_chat (token, criado desc);
create index if not exists app_chat_acad on public.app_chat (academia_id, criado desc);

alter table public.app_chat enable row level security;

drop policy if exists "app_chat_membros" on public.app_chat;
create policy "app_chat_membros" on public.app_chat
  for all using (academia_id in (select public.minhas_academias()))
  with check (academia_id in (select public.minhas_academias()));

-- aluno envia pelo token do app
create or replace function public.app_chat_envia(t text, p_texto text)
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
  if length(trim(coalesce(p_texto, ''))) = 0 then
    return json_build_object('erro', 'vazio');
  end if;
  insert into app_chat (academia_id, token, de, texto)
    values (v_acad, t, 'aluno', left(trim(p_texto), 1000));
  return json_build_object('ok', true);
end;
$$;

-- aluno lista a conversa dele (últimas 60)
create or replace function public.app_chat_lista(t text)
returns json
language sql security definer
set search_path = public
as $$
  select coalesce(json_agg(x order by x.criado), '[]'::json) from (
    select de, texto, criado from app_chat
    where token = t
    order by criado desc limit 60
  ) x
$$;

grant execute on function public.app_chat_envia(text, text) to anon, authenticated;
grant execute on function public.app_chat_lista(text) to anon, authenticated;

-- ============================================================
-- TORQUESYS HQ (SaaS) — painel de comando do dono do TORQUESYS
-- Permite acompanhar TODAS as empresas clientes (academias,
-- studios, box e personals), classificar plano/status e registrar
-- as mensalidades do SaaS. Nenhum cliente enxerga nada disso:
-- as tabelas ficam sem policy (bloqueadas) e só as funções hq_*
-- (security definer) acessam — e elas exigem que o usuário logado
-- esteja em saas_admins.
--
-- DEPOIS DE RODAR, cadastre você como administrador:
--   insert into public.saas_admins (user_id)
--     select id from auth.users where email = 'SEU_EMAIL_DO_PORTAL'
--     on conflict do nothing;
-- ============================================================

create table if not exists public.saas_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  criado timestamptz not null default now()
);
alter table public.saas_admins enable row level security;

create table if not exists public.saas_clientes (
  academia_id uuid primary key references public.academias (id) on delete cascade,
  tipo text not null default 'academia' check (tipo in ('academia', 'studio', 'box', 'personal', 'outro')),
  plano text not null default 'trial',
  valor numeric not null default 0,
  status text not null default 'trial' check (status in ('trial', 'ativo', 'pausado', 'cancelado')),
  obs text not null default '',
  atualizado timestamptz not null default now()
);
alter table public.saas_clientes enable row level security;

create table if not exists public.saas_pagamentos (
  id uuid primary key default gen_random_uuid(),
  academia_id uuid not null references public.academias (id) on delete cascade,
  valor numeric not null,
  forma text not null default 'pix',
  data date not null default current_date,
  criado timestamptz not null default now()
);
alter table public.saas_pagamentos enable row level security;

-- sou o administrador do TORQUESYS?
create or replace function public.hq_sou_admin()
returns boolean
language sql security definer
set search_path = public
as $$
  select exists (select 1 from saas_admins where user_id = auth.uid());
$$;

-- lista todas as empresas clientes com plano, status e pagamentos
create or replace function public.hq_clientes()
returns json
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (select 1 from saas_admins where user_id = auth.uid()) then
    raise exception 'acesso restrito ao administrador do TORQUESYS';
  end if;
  return coalesce((select json_agg(x order by x.criada desc) from (
    select a.id, a.nome, a.criada,
      coalesce(c.tipo, 'academia') as tipo,
      coalesce(c.plano, 'trial') as plano,
      coalesce(c.valor, 0) as valor,
      coalesce(c.status, 'trial') as status,
      coalesce(c.obs, '') as obs,
      (select count(*) from membros m where m.academia_id = a.id) as membros,
      (select coalesce(sum(p.valor), 0) from saas_pagamentos p where p.academia_id = a.id) as total_pago,
      (select max(p.data) from saas_pagamentos p where p.academia_id = a.id) as ultimo_pgto,
      (select coalesce(sum(p.valor), 0) from saas_pagamentos p
        where p.academia_id = a.id and to_char(p.data, 'YYYY-MM') = to_char(current_date, 'YYYY-MM')) as pago_mes
    from academias a
    left join saas_clientes c on c.academia_id = a.id
  ) x), '[]'::json);
end;
$$;

-- classifica uma empresa (tipo, plano, valor, status, observação)
create or replace function public.hq_cliente_set(p_academia uuid, p_tipo text, p_plano text, p_valor numeric, p_status text, p_obs text)
returns json
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (select 1 from saas_admins where user_id = auth.uid()) then
    raise exception 'acesso restrito ao administrador do TORQUESYS';
  end if;
  insert into saas_clientes (academia_id, tipo, plano, valor, status, obs, atualizado)
    values (p_academia, coalesce(p_tipo, 'academia'), coalesce(p_plano, 'trial'),
            coalesce(p_valor, 0), coalesce(p_status, 'trial'), coalesce(p_obs, ''), now())
    on conflict (academia_id) do update
      set tipo = excluded.tipo, plano = excluded.plano, valor = excluded.valor,
          status = excluded.status, obs = excluded.obs, atualizado = now();
  return json_build_object('ok', true);
end;
$$;

-- registra uma mensalidade recebida do cliente
create or replace function public.hq_pagamento_reg(p_academia uuid, p_valor numeric, p_forma text, p_data date)
returns json
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (select 1 from saas_admins where user_id = auth.uid()) then
    raise exception 'acesso restrito ao administrador do TORQUESYS';
  end if;
  if coalesce(p_valor, 0) <= 0 then
    raise exception 'valor inválido';
  end if;
  insert into saas_pagamentos (academia_id, valor, forma, data)
    values (p_academia, p_valor, coalesce(p_forma, 'pix'), coalesce(p_data, current_date));
  return json_build_object('ok', true);
end;
$$;

-- números do negócio: clientes, MRR, recebido no mês, novos 30d
create or replace function public.hq_kpis()
returns json
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (select 1 from saas_admins where user_id = auth.uid()) then
    raise exception 'acesso restrito ao administrador do TORQUESYS';
  end if;
  return json_build_object(
    'clientes', (select count(*) from academias),
    'ativos', (select count(*) from saas_clientes where status = 'ativo'),
    'trial', (select count(*) from academias a
      where not exists (select 1 from saas_clientes c where c.academia_id = a.id and c.status <> 'trial')),
    'mrr', (select coalesce(sum(valor), 0) from saas_clientes where status = 'ativo'),
    'recebido_mes', (select coalesce(sum(valor), 0) from saas_pagamentos
      where to_char(data, 'YYYY-MM') = to_char(current_date, 'YYYY-MM')),
    'novos_30d', (select count(*) from academias where criada >= now() - interval '30 days')
  );
end;
$$;

grant execute on function public.hq_sou_admin() to authenticated;
grant execute on function public.hq_clientes() to authenticated;
grant execute on function public.hq_cliente_set(uuid, text, text, numeric, text, text) to authenticated;
grant execute on function public.hq_pagamento_reg(uuid, numeric, text, date) to authenticated;
grant execute on function public.hq_kpis() to authenticated;

-- ============================================================
-- TORQUESYS HQ v2 — melhorias de classe mundial no SaaS
-- (rode por cima do bloco anterior; tudo idempotente)
-- • WhatsApp do cliente para cobrança/resgate
-- • Última atividade real de cada empresa (sinal de churn)
-- • Receita do SaaS mês a mês (12 meses)
-- ============================================================

alter table public.saas_clientes add column if not exists zap text not null default '';

-- v2: lista de clientes agora traz o WhatsApp e a última atividade
-- (max(atualizado) dos dados da empresa — sem nunca ler o conteúdo)
create or replace function public.hq_clientes()
returns json
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (select 1 from saas_admins where user_id = auth.uid()) then
    raise exception 'acesso restrito ao administrador do TORQUESYS';
  end if;
  return coalesce((select json_agg(x order by x.criada desc) from (
    select a.id, a.nome, a.criada,
      coalesce(c.tipo, 'academia') as tipo,
      coalesce(c.plano, 'trial') as plano,
      coalesce(c.valor, 0) as valor,
      coalesce(c.status, 'trial') as status,
      coalesce(c.obs, '') as obs,
      coalesce(c.zap, '') as zap,
      (select count(*) from membros m where m.academia_id = a.id) as membros,
      (select coalesce(sum(p.valor), 0) from saas_pagamentos p where p.academia_id = a.id) as total_pago,
      (select max(p.data) from saas_pagamentos p where p.academia_id = a.id) as ultimo_pgto,
      (select coalesce(sum(p.valor), 0) from saas_pagamentos p
        where p.academia_id = a.id and to_char(p.data, 'YYYY-MM') = to_char(current_date, 'YYYY-MM')) as pago_mes,
      (select max(d.atualizado) from dados d where d.academia_id = a.id) as ultima_atividade
    from academias a
    left join saas_clientes c on c.academia_id = a.id
  ) x), '[]'::json);
end;
$$;

-- v2: classificar cliente agora inclui o WhatsApp
drop function if exists public.hq_cliente_set(uuid, text, text, numeric, text, text);
create or replace function public.hq_cliente_set(p_academia uuid, p_tipo text, p_plano text, p_valor numeric, p_status text, p_obs text, p_zap text)
returns json
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (select 1 from saas_admins where user_id = auth.uid()) then
    raise exception 'acesso restrito ao administrador do TORQUESYS';
  end if;
  insert into saas_clientes (academia_id, tipo, plano, valor, status, obs, zap, atualizado)
    values (p_academia, coalesce(p_tipo, 'academia'), coalesce(p_plano, 'trial'),
            coalesce(p_valor, 0), coalesce(p_status, 'trial'), coalesce(p_obs, ''),
            coalesce(p_zap, ''), now())
    on conflict (academia_id) do update
      set tipo = excluded.tipo, plano = excluded.plano, valor = excluded.valor,
          status = excluded.status, obs = excluded.obs, zap = excluded.zap, atualizado = now();
  return json_build_object('ok', true);
end;
$$;

-- receita do SaaS mês a mês (últimos 12 meses)
create or replace function public.hq_receita_mensal()
returns json
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (select 1 from saas_admins where user_id = auth.uid()) then
    raise exception 'acesso restrito ao administrador do TORQUESYS';
  end if;
  return coalesce((select json_agg(x order by x.mes) from (
    select to_char(data, 'YYYY-MM') as mes, sum(valor) as total
    from saas_pagamentos
    where data >= (date_trunc('month', current_date) - interval '11 months')
    group by 1
  ) x), '[]'::json);
end;
$$;

grant execute on function public.hq_cliente_set(uuid, text, text, numeric, text, text, text) to authenticated;
grant execute on function public.hq_receita_mensal() to authenticated;

-- ============================================================
-- ASSISTÊNCIA TÉCNICA (SaaS) — suporte dentro do sistema
-- • O cliente fala com o suporte pelo card 🆘 do Central de Ajuda
--   (as mensagens ficam na ilha dele; o suporte responde pelo HQ)
-- • O HQ ganha a central de tickets e o monitor de erros de TODOS
--   os clientes (estilo Zendesk + Sentry)
-- Bloco idempotente; requer os blocos TORQUESYS HQ anteriores.
-- ============================================================

create table if not exists public.saas_tickets (
  id uuid primary key default gen_random_uuid(),
  academia_id uuid not null references public.academias (id) on delete cascade,
  de text not null check (de in ('cliente', 'suporte')),
  quem text not null default '',
  texto text not null,
  lida boolean not null default false,
  criado timestamptz not null default now()
);
create index if not exists saas_tickets_acad on public.saas_tickets (academia_id, criado desc);
alter table public.saas_tickets enable row level security;
-- sem policies: só as funções abaixo acessam.

-- cliente envia mensagem pro suporte (academia resolvida pelo login)
create or replace function public.suporte_envia(p_texto text)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_acad uuid;
  v_email text;
begin
  select academia_id into v_acad from public.membros where user_id = auth.uid() limit 1;
  if v_acad is null then
    raise exception 'faça login e crie sua conta antes';
  end if;
  if length(trim(coalesce(p_texto, ''))) = 0 then
    raise exception 'mensagem vazia';
  end if;
  select email into v_email from auth.users where id = auth.uid();
  insert into saas_tickets (academia_id, de, quem, texto)
    values (v_acad, 'cliente', coalesce(v_email, ''), left(trim(p_texto), 2000));
  return json_build_object('ok', true);
end;
$$;

-- cliente lista a conversa dele (e marca respostas do suporte como lidas)
create or replace function public.suporte_lista()
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_acad uuid;
begin
  select academia_id into v_acad from public.membros where user_id = auth.uid() limit 1;
  if v_acad is null then
    return '[]'::json;
  end if;
  update saas_tickets set lida = true where academia_id = v_acad and de = 'suporte' and not lida;
  return coalesce((select json_agg(x order by x.criado) from (
    select de, texto, criado from saas_tickets
    where academia_id = v_acad
    order by criado desc limit 100
  ) x), '[]'::json);
end;
$$;

-- HQ: threads de suporte (uma por empresa, com contagem de não lidas)
create or replace function public.hq_suporte_threads()
returns json
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (select 1 from saas_admins where user_id = auth.uid()) then
    raise exception 'acesso restrito ao administrador do TORQUESYS';
  end if;
  return coalesce((select json_agg(x order by x.ultima desc) from (
    select t.academia_id, a.nome,
      max(t.criado) as ultima,
      (select texto from saas_tickets u where u.academia_id = t.academia_id order by criado desc limit 1) as ultima_msg,
      count(*) filter (where t.de = 'cliente' and not t.lida) as nao_lidas
    from saas_tickets t
    join academias a on a.id = t.academia_id
    group by t.academia_id, a.nome
  ) x), '[]'::json);
end;
$$;

-- HQ: conversa de uma empresa (marca as do cliente como lidas)
create or replace function public.hq_suporte_lista(p_academia uuid)
returns json
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (select 1 from saas_admins where user_id = auth.uid()) then
    raise exception 'acesso restrito ao administrador do TORQUESYS';
  end if;
  update saas_tickets set lida = true where academia_id = p_academia and de = 'cliente' and not lida;
  return coalesce((select json_agg(x order by x.criado) from (
    select de, quem, texto, criado from saas_tickets
    where academia_id = p_academia
    order by criado desc limit 200
  ) x), '[]'::json);
end;
$$;

-- HQ: responde um ticket
create or replace function public.hq_suporte_envia(p_academia uuid, p_texto text)
returns json
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (select 1 from saas_admins where user_id = auth.uid()) then
    raise exception 'acesso restrito ao administrador do TORQUESYS';
  end if;
  if length(trim(coalesce(p_texto, ''))) = 0 then
    raise exception 'mensagem vazia';
  end if;
  insert into saas_tickets (academia_id, de, quem, texto)
    values (p_academia, 'suporte', 'Suporte TORQUESYS', left(trim(p_texto), 2000));
  return json_build_object('ok', true);
end;
$$;

-- HQ: monitor de erros de TODOS os clientes (estilo Sentry) — últimos 7 dias
create or replace function public.hq_erros()
returns json
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (select 1 from saas_admins where user_id = auth.uid()) then
    raise exception 'acesso restrito ao administrador do TORQUESYS';
  end if;
  return coalesce((select json_agg(x order by x.erros desc) from (
    select e.academia_id, a.nome,
      count(*) as erros,
      max(e.criado) as ultimo,
      (select msg from erros_js u where u.academia_id = e.academia_id order by criado desc limit 1) as ultima_msg,
      (select pagina from erros_js u where u.academia_id = e.academia_id order by criado desc limit 1) as ultima_pagina
    from erros_js e
    join academias a on a.id = e.academia_id
    where e.criado >= now() - interval '7 days'
    group by e.academia_id, a.nome
  ) x), '[]'::json);
end;
$$;

grant execute on function public.suporte_envia(text) to authenticated;
grant execute on function public.suporte_lista() to authenticated;
grant execute on function public.hq_suporte_threads() to authenticated;
grant execute on function public.hq_suporte_lista(uuid) to authenticated;
grant execute on function public.hq_suporte_envia(uuid, text) to authenticated;
grant execute on function public.hq_erros() to authenticated;
