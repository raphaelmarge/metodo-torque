-- Método Torque — estrutura multi-academia (login, equipe e sincronização).
-- Cole este arquivo inteiro no SQL Editor do Supabase e clique em Run.
-- Pode rodar mais de uma vez sem problema.

-- IMPORTANTE: este arquivo NUNCA apaga tabela nem dado. Tudo aqui é
-- "if not exists" / "or replace" — rodar de novo só cria o que falta.
-- (Antes havia um bloco de "drop table ... cascade" no topo, que destruía
-- as contas e os dados sincronizados a cada execução. Foi removido.)

-- ==================== TABELAS ====================

create table if not exists public.academias (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  codigo_equipe text not null unique,
  criada timestamptz not null default now()
);

create table if not exists public.membros (
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
create table if not exists public.dados (
  academia_id uuid not null references public.academias (id) on delete cascade,
  chave text not null,
  valor jsonb,
  atualizado timestamptz not null default now(),
  primary key (academia_id, chave)
);

-- ==================== HELPERS ====================
-- v747: o DIA no fuso do produto. O servidor vive em UTC e vira o dia às 21h
-- de Brasília: check-in de domingo à noite caía na segunda (semana seguinte,
-- e o painel cobrava de quem já tinha respondido), pedir horário pra HOJE
-- depois das 21h dava dia_invalido. A base é toda no Brasil — fuso fixo aqui é
-- o caminho mais simples e não exige republicar app nenhum.
create or replace function public.hoje_br()
returns date
language sql stable
set search_path = public
as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;


-- academias das quais o usuário logado faz parte (security definer para
-- não recursionar nas políticas)
create or replace function public.minhas_academias()
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

-- toda política leva um "drop if exists" na frente: sem isso, rodar o arquivo
-- de novo morria em "policy already exists" e TUDO daqui pra baixo não rodava
drop policy if exists "academia_ver_minha" on public.academias;
create policy "academia_ver_minha" on public.academias
  for select using (id in (select public.minhas_academias()));

drop policy if exists "membros_ver_equipe" on public.membros;
create policy "membros_ver_equipe" on public.membros
  for select using (academia_id in (select public.minhas_academias()));

-- só o dono remove funcionários (e ninguém remove o dono)
-- (select auth.uid()) em vez de auth.uid(): o Postgres calcula UMA vez por
-- consulta em vez de uma vez POR LINHA — apontado pelo linter do Supabase
drop policy if exists "membros_dono_remove" on public.membros;
create policy "membros_dono_remove" on public.membros
  for delete using (
    papel <> 'dono'
    and exists (
      select 1 from public.membros m
      where m.academia_id = membros.academia_id
        and m.user_id = (select auth.uid()) and m.papel = 'dono'
    )
  );

drop policy if exists "dados_select" on public.dados;
create policy "dados_select" on public.dados
  for select using (academia_id in (select public.minhas_academias()));
drop policy if exists "dados_insert" on public.dados;
create policy "dados_insert" on public.dados
  for insert with check (academia_id in (select public.minhas_academias()));
drop policy if exists "dados_update" on public.dados;
create policy "dados_update" on public.dados
  for update using (academia_id in (select public.minhas_academias()))
  with check (academia_id in (select public.minhas_academias()));
drop policy if exists "dados_delete" on public.dados;
create policy "dados_delete" on public.dados
  for delete using (academia_id in (select public.minhas_academias()));

-- ==================== FUNÇÕES DE CADASTRO ====================

-- Dono cria a academia e vira o primeiro membro. Retorna o código da equipe.
create or replace function public.criar_academia(p_nome_academia text, p_nome_membro text)
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
create or replace function public.entrar_na_equipe(p_codigo text, p_nome text)
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

-- Acesso revogado (2026-08): o profissional corta o acesso de UM aluno sem
-- apagar o histórico. Antes disso não existia revogação nenhuma — "encerrar o
-- aluno" só marcava no painel e o app dele continuava sendo alimentado.
alter table public.app_aluno add column if not exists revogado_em timestamptz;
create index if not exists app_aluno_vivos on public.app_aluno (academia_id) where revogado_em is null;

alter table public.app_aluno enable row level security;

-- só membros da academia escrevem/leem pela API normal (o aluno usa a RPC)
drop policy if exists "app_aluno_membros" on public.app_aluno;
create policy "app_aluno_membros" on public.app_aluno
  for all using (academia_id in (select public.minhas_academias()))
  with check (academia_id in (select public.minhas_academias()));

-- porta única do aluno: devolve a academia do token só enquanto o acesso vale.
-- Todas as RPCs do aluno passam por aqui — foi assim que aluno cortado parou de
-- postar no feed, agendar aula e devolver dados.
create or replace function public.app_aluno_ativo(t text)
returns uuid
language sql security definer stable
set search_path = public
as $$
  select academia_id from public.app_aluno where token = t and revogado_em is null
$$;

grant execute on function public.app_aluno_ativo(text) to anon, authenticated;

-- o app do aluno chama esta função com o token (chave secreta e única);
-- security definer: devolve só a linha daquele token, nunca a tabela
create or replace function public.app_aluno_busca(t text)
returns jsonb
language sql security definer stable
set search_path = public
as $$
  select dados from public.app_aluno where token = t and revogado_em is null
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
  v_acad := public.app_aluno_ativo(t);
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
        where token = t and public.app_aluno_ativo(t) is not null
          and status <> 'cancelado_ok'
        order by data desc, criado desc limit 30) s
$$;

-- aluno cancela um agendamento próprio
create or replace function public.app_aluno_cancela(t text, p_id uuid)
returns json
language plpgsql security definer
set search_path = public
as $$
begin
  if public.app_aluno_ativo(t) is null then
    return json_build_object('erro', 'sem_acesso');
  end if;
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
  v_acad := public.app_aluno_ativo(t);
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
  v_acad := public.app_aluno_ativo(t);
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
  if public.app_aluno_ativo(t) is null then
    return json_build_object('erro', 'sem_acesso');
  end if;
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
  v_acad := public.app_aluno_ativo(t);
  if v_acad is null then
    return json_build_object('erro', 'token_invalido');
  end if;
  -- v747: post do feed tem de ser da MESMA academia do aluno — com o uuid de um
  -- post de outra academia dava pra comentar nele, e a moderação de lá não
  -- enxergava a linha (RLS pela academia de quem escreveu)
  if p_post like 'feed:%' and not exists (
       select 1 from app_feed f
        where f.id::text = substr(p_post, 6) and f.academia_id = v_acad) then
    return json_build_object('erro', 'post_invalido');
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
  where academia_id = public.app_aluno_ativo(t)
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
  v_acad := public.app_aluno_ativo(t);
  if v_acad is null then
    return json_build_object('erro', 'token_invalido');
  end if;
  if exists (select 1 from app_agendamentos
             where token = t and aula_id = p_aula_id and data = p_data
               and status in ('pendente', 'confirmado', 'espera')) then
    return json_build_object('erro', 'ja_agendado');
  end if;
  -- v747: a nuvem guarda a chave COMPLETA do localStorage ('mtapp:grade') —
  -- com 'grade' a consulta nunca achava nada e o limite configurado na Grade
  -- (inclusive 0 = sem limite) era ignorado: todo aluno travava em 3
  select coalesce((valor->'config'->>'maxAtivos')::int, 3) into v_max
    from dados where academia_id = v_acad and chave = 'mtapp:grade';
  if v_max is null then v_max := 3; end if;
  if v_max > 0 and (select count(*) from app_agendamentos
      where token = t and status in ('pendente', 'confirmado')
        and data >= public.hoje_br()) >= v_max then
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
  v_acad := public.app_aluno_ativo(t);
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
  v_acad := public.app_aluno_ativo(t);
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
  v_total numeric;
  v_faltam int;
  v_tem_catalogo boolean;
begin
  v_acad := public.app_aluno_ativo(t);
  if v_acad is null then
    return json_build_object('erro', 'token_invalido');
  end if;
  if jsonb_array_length(coalesce(p_itens, '[]'::jsonb)) = 0 then
    return json_build_object('erro', 'vazio');
  end if;
  -- v747: o TOTAL sai do catálogo da academia (mtapp:produtos), nunca do app —
  -- o token mora no aparelho do aluno e um pedido de R$ 0 virava venda de R$ 0
  -- quando a recepção marcava "Entregue". Item que não existe mais no catálogo
  -- (ou sem preço) recusa com item_invalido. p_total só é lido se NÃO houver
  -- catálogo na nuvem (academia sem o programa Produtos sincronizado).
  select coalesce(sum(
           coalesce(nullif(i->>'q', '')::numeric, 1) *
           (select p->>'preco' from jsonb_array_elements(coalesce(d.valor->'itens', '[]'::jsonb)) p
             where lower(trim(p->>'nome')) = lower(trim(i->>'n'))
             order by (p->>'preco')::numeric desc limit 1)::numeric), 0),
         count(*) filter (where not exists (
           select 1 from jsonb_array_elements(coalesce(d.valor->'itens', '[]'::jsonb)) p
            where lower(trim(p->>'nome')) = lower(trim(i->>'n')))),
         count(d.academia_id) > 0
    into v_total, v_faltam, v_tem_catalogo
    from jsonb_array_elements(p_itens) i
    left join dados d on d.academia_id = v_acad and d.chave = 'mtapp:produtos';
  if not v_tem_catalogo then
    v_total := coalesce(p_total, 0);
  elsif v_faltam > 0 or v_total <= 0 then
    return json_build_object('erro', 'item_invalido');
  end if;
  insert into app_pedidos (academia_id, token, aluno, itens, total)
    values (v_acad, t, coalesce(p_nome, ''), p_itens, v_total)
    returning id into v_id;
  return json_build_object('ok', true, 'id', v_id, 'total', v_total);
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
  from (select * from app_pedidos
        where token = t and public.app_aluno_ativo(t) is not null
        order by criado desc limit 20) s
$$;

grant execute on function public.app_aluno_pedido(text, jsonb, numeric, text) to anon, authenticated;
grant execute on function public.app_aluno_pedidos(text) to anon, authenticated;

-- ==================== REDUNDÂNCIA: HISTÓRICO DO DADOS ====================
-- Um celular com a lista curta sobrescreveu a base de alunos de um professor na
-- nuvem, e o valor anterior não existia mais em lugar nenhum. Esta tabela guarda
-- as últimas 10 versões de cada registro do `dados`: toda sobrescrita e toda
-- exclusão deixam o valor ANTERIOR aqui antes de acontecer. RLS sem política de
-- propósito — ninguém lê pelo site; restauração é operação de dono, via SQL:
--   update dados d set valor = (select h.valor from dados_hist h
--     where h.academia_id = d.academia_id and h.chave = d.chave
--     order by h.id desc limit 1)
--   where d.academia_id = '...' and d.chave = 'mtapp:ptStudio';
-- Bloco idempotente.

create table if not exists public.dados_hist (
  id bigint generated always as identity primary key,
  academia_id uuid not null,
  chave text not null,
  valor jsonb,
  atualizado timestamptz,
  guardado_em timestamptz not null default now()
);
alter table public.dados_hist enable row level security;
create index if not exists dados_hist_busca
  on public.dados_hist (academia_id, chave, id desc);

create or replace function public.dados_guarda_hist()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' or old.valor is distinct from new.valor then
    insert into dados_hist (academia_id, chave, valor, atualizado)
      values (old.academia_id, old.chave, old.valor, old.atualizado);
    -- faxina: ficam as 10 versões mais recentes E as 2 MAIORES dos últimos 90
    -- dias. O "e as maiores" existe por cicatriz: num apagão, o painel salva o
    -- vazio por cima várias vezes seguidas, e as versões pequenas iam empurrando
    -- a cópia boa (grande) pra fora das 10 vagas — quase perdemos o resgate.
    delete from dados_hist h
      where h.academia_id = old.academia_id and h.chave = old.chave
        and h.id not in (select id from dados_hist
                         where academia_id = old.academia_id and chave = old.chave
                         order by id desc limit 10)
        and h.id not in (select id from dados_hist
                         where academia_id = old.academia_id and chave = old.chave
                           and guardado_em > now() - interval '90 days'
                         order by octet_length(valor::text) desc, id desc limit 2);
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists dados_hist_tg on public.dados;
create trigger dados_hist_tg
  before update or delete on public.dados
  for each row execute function public.dados_guarda_hist();

-- ==================== CARIMBO DO SERVIDOR NO `dados` ====================
-- A marca d'água do puxa incremental compara `atualizado`. Se cada aparelho
-- carimbasse com o PRÓPRIO relógio, um upsert que sai atrasado (o Wi-Fi caiu e
-- ele reenviou minutos depois) chegaria com a hora ANTIGA da escrita, abaixo da
-- marca d'água dos outros aparelhos, e nunca seria puxado — o lançamento (ex.:
-- um pagamento) sumiria. Aqui o servidor carimba a hora de CHEGADA, então
-- nenhuma linha entra "atrás" da marca de ninguém, e relógio desregulado no
-- celular deixa de abrir janela de perda. (Roda antes do dados_hist_tg — 'c'
-- vem antes de 'h' na ordem alfabética dos gatilhos BEFORE.)
create or replace function public.dados_carimba()
returns trigger language plpgsql set search_path = public as $$
begin
  new.atualizado := now();
  return new;
end $$;

drop trigger if exists dados_carimba_tg on public.dados;
create trigger dados_carimba_tg
  before insert or update on public.dados
  for each row execute function public.dados_carimba();

-- ==================== CONCORRÊNCIA OTIMISTA (v806) ====================
-- O cliente envia o carimbo da cópia que realmente leu. Comparar e gravar
-- acontece nesta única instrução/ transação; dois aparelhos com a mesma base
-- não conseguem confirmar duas versões diferentes.
create or replace function public.dados_exige_rpc()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated')
     and coalesce(current_setting('mt.sync_rpc', true), '') <> '1' then
    raise exception using
      errcode = 'PT426',
      message = 'Atualize o app para sincronizar com segurança. A versão antiga não gravou.';
  end if;
  return new;
end;
$$;

drop trigger if exists dados_exige_rpc_tg on public.dados;
create trigger dados_exige_rpc_tg
  before insert or update on public.dados
  for each row execute function public.dados_exige_rpc();

create or replace function public.dados_cas(
  p_academia uuid,
  p_chave text,
  p_valor jsonb,
  p_base_atualizado timestamptz default null
)
returns table (chave text, atualizado timestamptz)
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform set_config('mt.sync_rpc', '1', true);
  if p_base_atualizado is null then
    return query
      insert into public.dados as d (academia_id, chave, valor)
      values (p_academia, p_chave, p_valor)
      on conflict on constraint dados_pkey do nothing
      returning d.chave, d.atualizado;
  else
    return query
      update public.dados as d
         set valor = p_valor
       where d.academia_id = p_academia
         and d.chave = p_chave
         and d.atualizado = p_base_atualizado
      returning d.chave, d.atualizado;
  end if;

  if not found then
    raise exception using
      errcode = 'PT409',
      message = 'Outra sessão salvou uma versão mais nova. A sua cópia não foi sobrescrita.';
  end if;
end;
$$;

revoke all on function public.dados_cas(uuid, text, jsonb, timestamptz) from public, anon;
grant execute on function public.dados_cas(uuid, text, jsonb, timestamptz) to authenticated;

-- As demais chaves continuam com a política histórica de última escrita, mas
-- também passam por uma porta única. Isso impede que versões anteriores à v806
-- contornem o CAS fazendo upsert direto na tabela.
create or replace function public.dados_grava(p_linhas jsonb)
returns table (chave text, atualizado timestamptz)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_total integer;
begin
  if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' then
    raise exception using errcode = 'PT400', message = 'Lote de sincronização inválido.';
  end if;
  v_total := jsonb_array_length(p_linhas);
  if v_total < 1 or v_total > 200 then
    raise exception using errcode = 'PT400', message = 'O lote deve ter entre 1 e 200 registros.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_linhas) item
     where nullif(btrim(item->>'academia_id'), '') is null
        or nullif(btrim(item->>'chave'), '') is null
        or item->>'chave' = 'mtapp:ptStudio'
  ) then
    raise exception using errcode = 'PT400', message = 'Há uma chave inválida no lote comum.';
  end if;

  perform set_config('mt.sync_rpc', '1', true);
  return query
    insert into public.dados as d (academia_id, chave, valor)
    select (item->>'academia_id')::uuid, item->>'chave', item->'valor'
      from jsonb_array_elements(p_linhas) item
    on conflict on constraint dados_pkey do update set valor = excluded.valor
    returning d.chave, d.atualizado;
end;
$$;

revoke all on function public.dados_grava(jsonb) from public, anon;
grant execute on function public.dados_grava(jsonb) to authenticated;

-- Publica os pacotes dos alunos somente se a revisão do painel ainda for a
-- mesma. A checagem e todos os upserts compartilham uma transação: ou o lote
-- inteiro corresponde à fonte canônica, ou nenhum app é alterado.
create or replace function public.app_aluno_publica_cas(
  p_academia uuid,
  p_source_atualizado timestamptz,
  p_linhas jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_atual timestamptz;
  v_total integer;
begin
  if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' then
    raise exception using errcode = 'PT400', message = 'Lote de publicação inválido.';
  end if;

  v_total := jsonb_array_length(p_linhas);
  if v_total < 1 or v_total > 100 then
    raise exception using errcode = 'PT400', message = 'O lote deve ter entre 1 e 100 apps.';
  end if;

  select d.atualizado into v_atual
    from public.dados d
   where d.academia_id = p_academia
     and d.chave = 'mtapp:ptStudio'
   for share;

  if not found or v_atual is distinct from p_source_atualizado then
    raise exception using
      errcode = 'PT409',
      message = 'O painel mudou em outra sessão. Nenhum app de aluno foi alterado.';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_linhas) as item
     where nullif(btrim(item->>'token'), '') is null
        or (item->'dados'->>'sourceUpdatedAt')::timestamptz is distinct from p_source_atualizado
  ) then
    raise exception using errcode = 'PT400', message = 'Há um app sem token ou sem a revisão da fonte no lote.';
  end if;

  perform set_config('mt.app_publica_rpc', '1', true);
  insert into public.app_aluno as a (token, academia_id, dados, atualizado)
  select item->>'token', p_academia, item->'dados', now()
    from jsonb_array_elements(p_linhas) as item
  on conflict (token) do update
    set academia_id = excluded.academia_id,
        dados = excluded.dados,
        atualizado = excluded.atualizado;

  return jsonb_build_object('ok', true, 'publicados', v_total,
                            'source_atualizado', v_atual);
end;
$$;

revoke all on function public.app_aluno_publica_cas(uuid, timestamptz, jsonb) from public, anon;
grant execute on function public.app_aluno_publica_cas(uuid, timestamptz, jsonb) to authenticated;

-- Porta compatível para módulos cujo pacote não nasce de ptStudio (Nutri e o
-- portal legado). Mantém RLS e bloqueia o caminho direto usado por clientes
-- antigos, sem fingir um CAS com uma fonte que esses módulos não possuem.
create or replace function public.app_aluno_publica(p_academia uuid, p_linhas jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_total integer;
begin
  if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' then
    raise exception using errcode = 'PT400', message = 'Lote de publicação inválido.';
  end if;
  v_total := jsonb_array_length(p_linhas);
  if v_total < 1 or v_total > 100 then
    raise exception using errcode = 'PT400', message = 'O lote deve ter entre 1 e 100 apps.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_linhas) item
     where nullif(btrim(item->>'token'), '') is null
        or coalesce(item->'dados'->'dados' ? 'a', false)
  ) then
    raise exception using errcode = 'PT400', message = 'Lote inválido ou app do Personal fora da publicação CAS.';
  end if;

  perform set_config('mt.app_publica_rpc', '1', true);
  insert into public.app_aluno as a (token, academia_id, dados, atualizado)
  select item->>'token', p_academia, item->'dados', now()
    from jsonb_array_elements(p_linhas) item
  on conflict (token) do update
    set academia_id = excluded.academia_id,
        dados = excluded.dados,
        atualizado = excluded.atualizado;
  return jsonb_build_object('ok', true, 'publicados', v_total);
end;
$$;

revoke all on function public.app_aluno_publica(uuid, jsonb) from public, anon;
grant execute on function public.app_aluno_publica(uuid, jsonb) to authenticated;

create or replace function public.app_aluno_exige_rpc()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_mudou boolean;
begin
  v_mudou := tg_op = 'INSERT';
  if tg_op = 'UPDATE' then
    v_mudou := old.dados is distinct from new.dados;
  end if;
  if current_user in ('anon', 'authenticated')
     and v_mudou
     and coalesce(current_setting('mt.app_publica_rpc', true), '') <> '1' then
    raise exception using
      errcode = 'PT426',
      message = 'Atualize o app para publicar com segurança. A versão antiga não gravou.';
  end if;
  return new;
end;
$$;

drop trigger if exists app_aluno_exige_rpc_tg on public.app_aluno;
create trigger app_aluno_exige_rpc_tg
  before insert or update on public.app_aluno
  for each row execute function public.app_aluno_exige_rpc();

revoke execute on function public.dados_exige_rpc() from public, anon, authenticated;
revoke execute on function public.app_aluno_exige_rpc() from public, anon, authenticated;

-- ==================== REDUNDÂNCIA: HISTÓRICO DO APP DO ALUNO ====================
-- O `retorno` é o que o aluno registrou no app (peso, cargas, treinos, fotos) —
-- insubstituível. O pacote (`dados`) fica de fora de propósito: ele se regenera
-- republicando o app. E o retorno cresce o dia inteiro no uso normal, então a
-- foto só é tirada quando ele ENCOLHE (algo apagou registro) ou quando a linha
-- é EXCLUÍDA. 5 versões por token, RLS selada sem política. Restaurar:
--   update app_aluno a set retorno = (select h.retorno from app_aluno_hist h
--     where h.token = a.token order by h.id desc limit 1)
--   where a.token = '...';
-- Bloco idempotente.

create table if not exists public.app_aluno_hist (
  id bigint generated always as identity primary key,
  academia_id uuid,
  token text not null,
  retorno jsonb,
  atualizado timestamptz,
  guardado_em timestamptz not null default now()
);
alter table public.app_aluno_hist enable row level security;
create index if not exists app_aluno_hist_busca
  on public.app_aluno_hist (token, id desc);

create or replace function public.app_aluno_guarda_hist()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.retorno is not null then
      insert into app_aluno_hist (academia_id, token, retorno, atualizado)
        values (old.academia_id, old.token, old.retorno, old.atualizado);
    end if;
    return old;
  end if;
  if old.retorno is not null and new.retorno is distinct from old.retorno
     and coalesce(octet_length(new.retorno::text), 0) < octet_length(old.retorno::text) then
    insert into app_aluno_hist (academia_id, token, retorno, atualizado)
      values (old.academia_id, old.token, old.retorno, old.atualizado);
    delete from app_aluno_hist h
      where h.token = old.token
        and h.id not in (select id from app_aluno_hist
                         where token = old.token order by id desc limit 5);
  end if;
  return new;
end $$;

drop trigger if exists app_aluno_hist_tg on public.app_aluno;
create trigger app_aluno_hist_tg
  before update or delete on public.app_aluno
  for each row execute function public.app_aluno_guarda_hist();

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
  v_acad := public.app_aluno_ativo(t);
  if v_acad is null then
    return json_build_object('erro', 'token_invalido');
  end if;
  insert into app_checkin (academia_id, token, dia, nota, texto, peso)
    values (v_acad, t, public.hoje_br(), greatest(1, least(5, coalesce(p_nota, 3))),
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
  v_acad := public.app_aluno_ativo(t);
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
    where token = t and public.app_aluno_ativo(t) is not null
    order by criado desc limit 60
  ) x
$$;

grant execute on function public.app_chat_envia(text, text) to anon, authenticated;
grant execute on function public.app_chat_lista(text) to anon, authenticated;

-- ============================================================
-- TORQUE ON HQ (SaaS) — painel de comando do dono do TORQUE ON
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

-- sou o administrador do TORQUE ON?
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
    raise exception 'acesso restrito ao administrador do TORQUE ON';
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
    raise exception 'acesso restrito ao administrador do TORQUE ON';
  end if;
  insert into saas_clientes (academia_id, tipo, plano, valor, status, obs, atualizado)
    values (p_academia, coalesce(p_tipo, 'academia'), coalesce(p_plano, 'trial'),
            coalesce(p_valor, 0), coalesce(p_status, 'trial'), coalesce(p_obs, ''), now())
    on conflict (academia_id) do update
      set tipo = excluded.tipo, plano = excluded.plano, valor = excluded.valor,
          status = excluded.status, obs = excluded.obs, atualizado = now();
  -- v747: UMA verdade pra "está pagando". A régua do teste (regua_pendentes)
  -- e o painel (minha_assinatura) leem academias.assinatura_status, que só o
  -- RevenueCat escrevia — cliente marcado "ativo" aqui (pagou por Pix) seguia
  -- 'trial' lá e recebia os e-mails "seu teste" nos dias 1, 3, 7 e 12.
  -- 'trial' NÃO mexe (não derruba um status que a loja já gravou).
  if coalesce(p_status, '') in ('ativo', 'pausado', 'cancelado') then
    update academias
       set assinatura_status = case p_status when 'ativo' then 'ativa'
                                             when 'pausado' then 'atrasada'
                                             else 'bloqueada' end,
           assinatura_via = 'hq'
     where id = p_academia;
  end if;
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
    raise exception 'acesso restrito ao administrador do TORQUE ON';
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
    raise exception 'acesso restrito ao administrador do TORQUE ON';
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
-- TORQUE ON HQ v2 — melhorias de classe mundial no SaaS
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
    raise exception 'acesso restrito ao administrador do TORQUE ON';
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
    raise exception 'acesso restrito ao administrador do TORQUE ON';
  end if;
  insert into saas_clientes (academia_id, tipo, plano, valor, status, obs, zap, atualizado)
    values (p_academia, coalesce(p_tipo, 'academia'), coalesce(p_plano, 'trial'),
            coalesce(p_valor, 0), coalesce(p_status, 'trial'), coalesce(p_obs, ''),
            coalesce(p_zap, ''), now())
    on conflict (academia_id) do update
      set tipo = excluded.tipo, plano = excluded.plano, valor = excluded.valor,
          status = excluded.status, obs = excluded.obs, zap = excluded.zap, atualizado = now();
  -- v747: UMA verdade pra "está pagando". A régua do teste (regua_pendentes)
  -- e o painel (minha_assinatura) leem academias.assinatura_status, que só o
  -- RevenueCat escrevia — cliente marcado "ativo" aqui (pagou por Pix) seguia
  -- 'trial' lá e recebia os e-mails "seu teste" nos dias 1, 3, 7 e 12.
  -- 'trial' NÃO mexe (não derruba um status que a loja já gravou).
  if coalesce(p_status, '') in ('ativo', 'pausado', 'cancelado') then
    update academias
       set assinatura_status = case p_status when 'ativo' then 'ativa'
                                             when 'pausado' then 'atrasada'
                                             else 'bloqueada' end,
           assinatura_via = 'hq'
     where id = p_academia;
  end if;
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
    raise exception 'acesso restrito ao administrador do TORQUE ON';
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
-- Bloco idempotente; requer os blocos TORQUE ON HQ anteriores.
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
  select academia_id into v_acad from public.membros where user_id = auth.uid() order by criado limit 1;
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
  select academia_id into v_acad from public.membros where user_id = auth.uid() order by criado limit 1;
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
    raise exception 'acesso restrito ao administrador do TORQUE ON';
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
    raise exception 'acesso restrito ao administrador do TORQUE ON';
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
    raise exception 'acesso restrito ao administrador do TORQUE ON';
  end if;
  if length(trim(coalesce(p_texto, ''))) = 0 then
    raise exception 'mensagem vazia';
  end if;
  insert into saas_tickets (academia_id, de, quem, texto)
    values (p_academia, 'suporte', 'Suporte TORQUE ON', left(trim(p_texto), 2000));
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
    raise exception 'acesso restrito ao administrador do TORQUE ON';
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

-- ============================================================
-- LOGIN E SENHA DO ALUNO
-- O link do app continua funcionando (é como o app chega ao
-- aluno), e além dele o aluno pode CRIAR uma senha dentro do
-- próprio app e depois entrar de qualquer aparelho em
-- aluno-login.html. Senha guardada com bcrypt (pgcrypto).
-- Bloco idempotente.
-- ============================================================

-- No Supabase o pgcrypto vive no schema "extensions", não no public. Sem
-- "extensions" no search_path das funções abaixo, crypt/gen_salt somem e o
-- login do aluno morre com "function gen_salt(unknown) does not exist".
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

alter table public.app_aluno add column if not exists login text not null default '';
alter table public.app_aluno add column if not exists senha text not null default '';
create unique index if not exists app_aluno_login_unico
  on public.app_aluno (lower(login)) where login <> '';

-- o aluno (já dentro do app, identificado pelo token) cria/troca o login e a senha
create or replace function public.aluno_define_login(t text, p_login text, p_senha text)
returns json
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_tem uuid;
begin
  v_tem := public.app_aluno_ativo(t);
  if v_tem is null then
    return json_build_object('erro', 'token_invalido');
  end if;
  p_login := lower(trim(coalesce(p_login, '')));
  if length(p_login) < 5 then
    return json_build_object('erro', 'Use seu e-mail ou celular com DDD como login.');
  end if;
  if length(coalesce(p_senha, '')) < 6 then
    return json_build_object('erro', 'A senha precisa de pelo menos 6 caracteres.');
  end if;
  if exists (select 1 from app_aluno where lower(login) = p_login and token <> t) then
    return json_build_object('erro', 'Esse e-mail/celular já está em uso — use outro ou fale com sua academia.');
  end if;
  update app_aluno set login = p_login, senha = crypt(p_senha, gen_salt('bf'))
    where token = t;
  return json_build_object('ok', true, 'login', p_login);
end;
$$;

-- entra com login + senha de qualquer aparelho; devolve o token do app
create or replace function public.aluno_login(p_login text, p_senha text)
returns json
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v record;
begin
  select token, senha into v from app_aluno
    where lower(login) = lower(trim(coalesce(p_login, ''))) and login <> '' and revogado_em is null;
  if v.token is null or v.senha = '' or v.senha <> crypt(coalesce(p_senha, ''), v.senha) then
    -- mesma resposta para login inexistente e senha errada (não vaza quem existe)
    return json_build_object('erro', 'Login ou senha incorretos. Esqueceu? Peça um link novo à sua academia ou personal.');
  end if;
  return json_build_object('ok', true, 'token', v.token);
end;
$$;

grant execute on function public.aluno_define_login(text, text, text) to anon, authenticated;
grant execute on function public.aluno_login(text, text) to anon, authenticated;

-- ============================================================
-- AVALIAÇÃO DAS AULAS (⭐ pelo app do aluno)
-- Depois da aula agendada, o app pede nota 1–5 + comentário.
-- O relatório de satisfação por aula/professor fica em
-- Ocupação e Horários. Bloco idempotente.
-- ============================================================

create table if not exists public.app_aval_aula (
  id uuid primary key default gen_random_uuid(),
  academia_id uuid not null references public.academias (id) on delete cascade,
  token text not null,
  aluno text not null default '',
  aula text not null,
  data date not null,
  nota int not null check (nota between 1 and 5),
  texto text not null default '',
  criado timestamptz not null default now(),
  unique (token, aula, data)
);
alter table public.app_aval_aula enable row level security;

drop policy if exists "aval_aula_membros" on public.app_aval_aula;
create policy "aval_aula_membros" on public.app_aval_aula
  for select using (academia_id in (select public.minhas_academias()));

-- aluno avalia a aula (identificado pelo token do app)
create or replace function public.app_aluno_avalia(t text, p_aula text, p_data date, p_nota int, p_texto text, p_nome text)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_acad uuid;
begin
  v_acad := public.app_aluno_ativo(t);
  if v_acad is null then
    return json_build_object('erro', 'token_invalido');
  end if;
  if coalesce(p_nota, 0) not between 1 and 5 then
    return json_build_object('erro', 'nota_invalida');
  end if;
  insert into app_aval_aula (academia_id, token, aluno, aula, data, nota, texto)
    values (v_acad, t, coalesce(p_nome, ''), coalesce(p_aula, 'Aula'), coalesce(p_data, public.hoje_br()), p_nota, left(coalesce(p_texto, ''), 400))
    on conflict (token, aula, data) do update set nota = excluded.nota, texto = excluded.texto;
  return json_build_object('ok', true);
end;
$$;

grant execute on function public.app_aluno_avalia(text, text, date, int, text, text) to anon, authenticated;

-- ==================== PROVISIONAMENTO PELO HQ (fim do código de equipe) ====================
-- O fluxo comercial agora é: o admin do TORQUE ON cadastra o cliente na central
-- de comando (HQ) com e-mail + senha aleatória; a conta já nasce com a ilha e o
-- dono prontos. O dono cria os logins dos colaboradores dentro do sistema.
-- Autoatendimento no site fica só para o ALUNO. Este bloco pode rodar de novo sem problema.

-- o tipo do cliente agora inclui 'nutri'
alter table public.saas_clientes drop constraint if exists saas_clientes_tipo_check;
alter table public.saas_clientes
  add constraint saas_clientes_tipo_check check (tipo in ('academia', 'studio', 'box', 'personal', 'nutri', 'outro'));

-- cria um usuário de login (interno — sem grant pra ninguém de fora)
create or replace function public._torque_cria_usuario(p_email text, p_senha text, p_nome text)
returns uuid
language plpgsql security definer
set search_path = public, auth, extensions
as $$
declare
  v_uid uuid := gen_random_uuid();
begin
  p_email := lower(trim(p_email));
  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'e-mail inválido';
  end if;
  if length(coalesce(p_senha, '')) < 8 then
    raise exception 'senha muito curta';
  end if;
  if exists (select 1 from auth.users where lower(email) = p_email) then
    raise exception 'já existe uma conta com o e-mail %', p_email;
  end if;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', p_email,
    extensions.crypt(p_senha, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('nome', coalesce(p_nome, '')),
    now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_uid, p_email, 'email',
    jsonb_build_object('sub', v_uid::text, 'email', p_email, 'email_verified', true),
    now(), now(), now());
  return v_uid;
end;
$$;
revoke all on function public._torque_cria_usuario(text, text, text) from public, anon, authenticated;

-- HQ: cadastra um cliente novo — conta + ilha + dono + ficha no SaaS, tudo de uma vez
create or replace function public.hq_cliente_provisiona(p_email text, p_senha text, p_empresa text, p_tipo text, p_zap text)
returns json
language plpgsql security definer
set search_path = public, auth, extensions
as $$
declare
  v_uid uuid;
  v_acad uuid;
begin
  if not exists (select 1 from saas_admins where user_id = auth.uid()) then
    raise exception 'acesso restrito ao administrador do TORQUE ON';
  end if;
  if coalesce(trim(p_empresa), '') = '' then
    raise exception 'informe o nome da empresa';
  end if;
  v_uid := public._torque_cria_usuario(p_email, p_senha, p_empresa);
  insert into academias (nome, codigo_equipe)
    values (trim(p_empresa), upper(substr(md5(gen_random_uuid()::text), 1, 6)))
    returning id into v_acad;
  insert into membros (academia_id, user_id, papel, nome, email)
    values (v_acad, v_uid, 'dono', '', lower(trim(p_email)));
  insert into saas_clientes (academia_id, tipo, plano, valor, status, obs, zap, atualizado)
    values (v_acad, coalesce(nullif(p_tipo, ''), 'academia'), 'trial', 0, 'trial', 'provisionado pelo HQ', coalesce(p_zap, ''), now())
    on conflict (academia_id) do nothing;
  return json_build_object('ok', true, 'academia_id', v_acad, 'email', lower(trim(p_email)));
end;
$$;
grant execute on function public.hq_cliente_provisiona(text, text, text, text, text) to authenticated;

-- HQ: troca a senha de um cliente (esqueceu / reonboarding)
create or replace function public.hq_cliente_reseta_senha(p_email text, p_senha text)
returns json
language plpgsql security definer
set search_path = public, auth, extensions
as $$
begin
  if not exists (select 1 from saas_admins where user_id = auth.uid()) then
    raise exception 'acesso restrito ao administrador do TORQUE ON';
  end if;
  if length(coalesce(p_senha, '')) < 8 then
    raise exception 'senha muito curta';
  end if;
  update auth.users set encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf')), updated_at = now()
    where lower(email) = lower(trim(p_email));
  if not found then
    raise exception 'não achei conta com esse e-mail';
  end if;
  return json_build_object('ok', true);
end;
$$;
grant execute on function public.hq_cliente_reseta_senha(text, text) to authenticated;

-- DONO: cria o login de um colaborador na própria ilha (fim do código de equipe)
create or replace function public.equipe_cria_login(p_email text, p_senha text, p_nome text, p_papel text)
returns json
language plpgsql security definer
set search_path = public, auth, extensions
as $$
declare
  v_acad uuid;
  v_uid uuid;
begin
  select academia_id into v_acad from membros
    where user_id = auth.uid() and papel = 'dono' order by criado limit 1;
  if v_acad is null then
    raise exception 'apenas o dono da conta cria logins de colaboradores';
  end if;
  v_uid := public._torque_cria_usuario(p_email, p_senha, p_nome);
  insert into membros (academia_id, user_id, papel, nome, email)
    values (v_acad, v_uid, coalesce(nullif(p_papel, ''), 'funcionario'), coalesce(p_nome, ''), lower(trim(p_email)));
  return json_build_object('ok', true, 'email', lower(trim(p_email)));
end;
$$;
grant execute on function public.equipe_cria_login(text, text, text, text) to authenticated;

-- ==================== AGENDA DO APP ====================
-- Aluno/paciente pede horário pelo app; o profissional confirma no módulo.
-- Bloco idempotente — pode rodar de novo sem medo.

create table if not exists public.app_agenda (
  id uuid primary key default gen_random_uuid(),
  academia_id uuid not null references public.academias (id) on delete cascade,
  token text not null,
  dia date not null,
  hora text not null default '',
  status text not null default 'pedido' check (status in ('pedido', 'confirmado', 'recusado')),
  obs text not null default '',
  origem text not null default 'aluno' check (origem in ('aluno', 'profissional')),
  criado timestamptz not null default now()
);
create index if not exists app_agenda_token on public.app_agenda (token, dia);
create index if not exists app_agenda_acad on public.app_agenda (academia_id, status, dia);

alter table public.app_agenda enable row level security;

drop policy if exists "app_agenda_membros" on public.app_agenda;
create policy "app_agenda_membros" on public.app_agenda
  for all using (academia_id in (select public.minhas_academias()))
  with check (academia_id in (select public.minhas_academias()));

-- aluno/paciente pede um horário pelo token do app dele
create or replace function public.app_agenda_pede(t text,p_dia date,p_hora text,p_obs text)
returns json language plpgsql security definer set search_path=public
as $$
declare v_acad uuid;
begin
 v_acad:=public.app_aluno_ativo(t);
 if v_acad is null then return json_build_object('erro','token_invalido');end if;
 if exists (
  select 1 from public.dados d
  cross join lateral jsonb_array_elements(
   case when jsonb_typeof(d.valor->'alunos')='array' then d.valor->'alunos' else '[]'::jsonb end) a
  where d.academia_id=v_acad and d.chave='mtapp:ptStudio'
   and a->>'appTokenP'=t
   and lower(btrim(coalesce(nullif(btrim(a->>'atendimento'),''),a->>'modalidade','')))
      in ('online','on-line','consultoria online','consultoria on-line')
 )then return json_build_object('erro','atendimento_online','mensagem','Este atendimento é exclusivamente online e não permite pedido de aula presencial.');end if;
 if p_dia is null or p_dia<public.hoje_br() then return json_build_object('erro','dia_invalido');end if;
 if(select count(*) from public.app_agenda where token=t and status='pedido')>=10 then return json_build_object('erro','muitos_pedidos');end if;
 insert into public.app_agenda(academia_id,token,dia,hora,obs)
 values(v_acad,t,p_dia,left(coalesce(p_hora,''),5),left(trim(coalesce(p_obs,'')),200));
 return json_build_object('ok',true);
end;$$;

-- aluno/paciente lista os horários dele (últimos 30 dias + futuro)
create or replace function public.app_agenda_lista(t text)
returns json
language sql security definer
set search_path = public
as $$
  select coalesce(json_agg(x order by x.dia, x.hora), '[]'::json) from (
    select id, dia, hora, status, obs from app_agenda
    where token = t and public.app_aluno_ativo(t) is not null and dia >= current_date - 30
    order by dia, hora limit 120
  ) x
$$;

grant execute on function public.app_agenda_pede(text, date, text, text) to anon, authenticated;
grant execute on function public.app_agenda_lista(text) to anon, authenticated;

-- ==================== VÁRIAS AUTOMAÇÕES DE CHATBOT ====================
-- O Chat e IA agora guarda uma lista de automações (estilo ManyChat);
-- a marcada como principal continua na coluna bot (o webhook não muda).
-- Bloco idempotente.

alter table public.chat_config add column if not exists bots jsonb;

-- ==================== NOME DE QUEM RESPONDE NO CHAT ====================
-- Cada mensagem da equipe no Chat e IA guarda o nome de quem escreveu
-- (vem da tabela membros, pelo login). Bloco idempotente.

alter table public.chat_mensagens add column if not exists autor text not null default '';

-- ==================== RETORNO DO APP DO ALUNO ====================
-- O app do aluno (TORQUE PERSONAL) devolve pro personal o que o aluno
-- registra: peso na balança, diário de cargas, treinos feitos e as fotos
-- antes/depois. Fica na coluna retorno do app_aluno e o perfil do aluno
-- no módulo lê. Bloco idempotente.

alter table public.app_aluno add column if not exists retorno jsonb;

-- v743: união de LISTAS do retorno do app. Antes a mescla só unia objetos um
-- nível abaixo da raiz e trocava qualquer array inteiro: um celular novo (ou
-- um segundo aparelho) mandava cargas: {Supino: [1 registro]} e apagava os
-- meses anteriores daquele exercício na nuvem; cardio, notas e indicas (arrays
-- na raiz) iam do mesmo jeito. Regra: o app é dono dos DIAS que ele conhece
-- (edição e mais de um registro no mesmo dia continuam valendo); os dias que
-- só a nuvem tem ficam. Item sem data entra por igualdade, sem repetir.
create or replace function public.app_lista_mescla(velho jsonb, novo jsonb)
returns jsonb language plpgsql immutable set search_path = public as $$
declare el jsonb; saida jsonb := '[]'::jsonb; dias_novos jsonb := '{}'::jsonb; dk text;
begin
  if velho is null or jsonb_typeof(velho) <> 'array' then return novo; end if;
  if novo  is null or jsonb_typeof(novo)  <> 'array' then return velho; end if;
  for el in select * from jsonb_array_elements(novo) loop
    if jsonb_typeof(el) = 'object' and (el->>'d') is not null then
      dias_novos := dias_novos || jsonb_build_object(el->>'d', true);
    end if;
  end loop;
  for el in select * from jsonb_array_elements(velho) loop
    dk := case when jsonb_typeof(el) = 'object' then el->>'d' else null end;
    if dk is null then
      if not (novo @> jsonb_build_array(el)) then saida := saida || jsonb_build_array(el); end if;
    elsif not (dias_novos ? dk) then
      saida := saida || jsonb_build_array(el);
    end if;
  end loop;
  saida := saida || novo;
  -- em ordem de data (o que não tem data vai pro fim), como o app guarda
  select coalesce(jsonb_agg(e order by (e->>'d') nulls last), '[]'::jsonb) into saida
    from jsonb_array_elements(saida) e;
  return saida;
end $$;

-- Mescla o retorno do app pra NUNCA apagar histórico. O app manda o estado LOCAL
-- inteiro; num celular recém-instalado esse estado vem quase vazio, e o antigo
-- "retorno = p_dados" (substituição) zerava meses de treinos, pesos e fotos na
-- nuvem com um único toque. Regra por chave: objeto vira UNIÃO em qualquer
-- profundidade (v743 — antes só um nível), lista vira app_lista_mescla, e valor
-- vazio (null/{}/[]/"") não sobrescreve o que já existe. Chave nova ou com valor
-- de verdade entra normalmente.
create or replace function public.app_retorno_mescla(velho jsonb, novo jsonb)
returns jsonb language plpgsql immutable set search_path = public as $$
declare k text; vv jsonb; nv jsonb; saida jsonb;
begin
  if velho is null or jsonb_typeof(velho) <> 'object' then return novo; end if;
  if novo  is null or jsonb_typeof(novo)  <> 'object' then return velho; end if;
  saida := velho;
  for k in select jsonb_object_keys(novo) loop
    nv := novo->k; vv := velho->k;
    -- valor novo "vazio" não apaga o que já existe na nuvem
    if nv is null or nv = 'null'::jsonb
       or (jsonb_typeof(nv) = 'object' and nv = '{}'::jsonb)
       or (jsonb_typeof(nv) = 'array'  and jsonb_array_length(nv) = 0)
       or (jsonb_typeof(nv) = 'string' and nv = '""'::jsonb) then
      continue; -- mantém saida->k (= velho->k)
    end if;
    if jsonb_typeof(nv) = 'object' and vv is not null and jsonb_typeof(vv) = 'object' then
      -- dois objetos: união recursiva (cargas → exercício → lista de registros)
      saida := jsonb_set(saida, array[k], public.app_retorno_mescla(vv, nv));
    elsif jsonb_typeof(nv) = 'array' and vv is not null and jsonb_typeof(vv) = 'array' then
      saida := jsonb_set(saida, array[k], public.app_lista_mescla(vv, nv));
    else
      saida := jsonb_set(saida, array[k], nv);
    end if;
  end loop;
  return saida;
end $$;

-- v747: as duas mesclas são helpers puros chamados só pelo app_aluno_devolve
-- (security definer) — fora do /rest/v1/rpc do anônimo
revoke execute on function public.app_lista_mescla(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.app_retorno_mescla(jsonb, jsonb) from public, anon, authenticated;

create or replace function public.app_aluno_devolve(t text, p_dados jsonb)
returns json language plpgsql security definer set search_path = public as $$
begin
  if t is null or length(t) < 10 then
    return json_build_object('erro', 'token inválido');
  end if;
  if public.app_aluno_ativo(t) is null then
    return json_build_object('erro', 'sem_acesso');
  end if;
  -- mescla (não substitui): celular novo com 1 registro não apaga o histórico
  update public.app_aluno
    set retorno = public.app_retorno_mescla(retorno, p_dados), atualizado = now()
    where token = t;
  if not found then
    return json_build_object('erro', 'app não encontrado');
  end if;
  return json_build_object('ok', true);
end $$;
grant execute on function public.app_aluno_devolve(text, jsonb) to anon, authenticated;

-- ==================== QUESTIONÁRIOS PERSONALIZADOS ====================
-- O personal monta perguntas e questionários (estilo check-in do LiveClin),
-- manda o link pro aluno e as respostas ficam salvas aqui, com pontuação.
-- Bloco idempotente.

create table if not exists public.app_quest (
  id uuid primary key default gen_random_uuid(),
  academia_id uuid not null references public.academias(id) on delete cascade,
  token text not null,                          -- appTokenP do aluno
  questionario text not null default '',        -- nome do questionário
  dados jsonb not null default '{}'::jsonb,     -- respostas + pontuação
  criado timestamptz not null default now()
);
create index if not exists app_quest_acad on public.app_quest (academia_id, criado desc);
create index if not exists app_quest_token on public.app_quest (token, criado desc);

alter table public.app_quest enable row level security;
drop policy if exists "app_quest_membros" on public.app_quest;
create policy "app_quest_membros" on public.app_quest
  for select using (academia_id in (select public.minhas_academias()));

create or replace function public.app_quest_responde(t text, p_nome text, p_dados jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare v_acad uuid;
begin
  if t is null or length(t) < 10 then
    return json_build_object('erro', 'token inválido');
  end if;
  -- v747: pela porta única (app_aluno_ativo) — era a ÚNICA RPC do aluno que lia
  -- o token cru: aluno cortado seguia respondendo e a resposta aparecia na
  -- aba A semana, no perfil e no push de pendências como se fosse aluno ativo
  v_acad := public.app_aluno_ativo(t);
  if v_acad is null then
    return json_build_object('erro', 'app não encontrado');
  end if;
  -- trava de spam: no máximo 20 respostas por token por dia
  if (select count(*) from public.app_quest where token = t and criado > now() - interval '1 day') >= 20 then
    return json_build_object('erro', 'muitas respostas hoje — tente amanhã');
  end if;
  insert into public.app_quest (academia_id, token, questionario, dados)
  values (v_acad, t, coalesce(p_nome, ''), coalesce(p_dados, '{}'::jsonb));
  return json_build_object('ok', true);
end $$;
grant execute on function public.app_quest_responde(text, text, jsonb) to anon, authenticated;

-- ==================== DESAFIO EM GRUPO (GYMRATS) ====================
-- Ranking do desafio: conta os dias de treino que cada aluno marcou no
-- app (retorno.feitos, enviado pelo app_aluno_devolve) dentro do período.
-- Qualquer aluno da academia consulta pelo próprio token. Bloco idempotente.

create or replace function public.app_desafio_ranking(t text, p_ini date, p_fim date)
returns json language plpgsql security definer set search_path = public as $$
declare v_acad uuid; v_out json;
begin
  if t is null or length(t) < 10 then
    return json_build_object('erro', 'token inválido');
  end if;
  -- porteiro: token revogado não lê o ranking dos colegas (era where token=t limit 1,
  -- sem checar revogado_em — ex-aluno seguia vendo os dados de todos)
  v_acad := public.app_aluno_ativo(t);
  if v_acad is null then
    return json_build_object('erro', 'app não encontrado');
  end if;
  select coalesce(json_agg(linha order by (linha->>'dias')::int desc), '[]'::json) into v_out
  from (
    select json_build_object(
      'nome', coalesce(a.retorno->>'nome', 'Aluno'),
      'dias', (
        select count(*) from jsonb_object_keys(coalesce(a.retorno->'feitos', '{}'::jsonb)) k
        where k::date between p_ini and p_fim
      ),
      'ultimo', (
        select max(k) from jsonb_object_keys(coalesce(a.retorno->'feitos', '{}'::jsonb)) k
        where k::date between p_ini and p_fim
      )
    ) as linha
    from public.app_aluno a
    where a.academia_id = v_acad and a.retorno is not null
  ) sub
  where (linha->>'dias')::int > 0;
  return json_build_object('ok', true, 'ranking', v_out);
end $$;
grant execute on function public.app_desafio_ranking(text, date, date) to anon, authenticated;


-- ============================================================
-- MATRÍCULA MULTI-ACADEMIA (2026-08)
-- A página pública agora passa ?a=<academia_id> e as funções filtram
-- por ele; sem o parâmetro (links antigos), cai no comportamento antigo.
drop function if exists public.matricula_info();
-- v747: sem ?a= (link antigo, QR impresso) só atende quando existe UMA
-- matricula_config no banco — com duas ou mais, "a mais recente" era a de OUTRA
-- academia: planos errados na tela e o lead caindo no funil errado
create or replace function public.matricula_info(p_academia uuid default null)
returns jsonb
language sql security definer stable
set search_path = public
as $$
  select dados from matricula_config
   where (p_academia is null and (select count(*) from matricula_config) = 1)
      or academia_id = p_academia
   order by atualizado desc limit 1
$$;
drop function if exists public.matricula_nova(text, text, text, text);
drop function if exists public.matricula_nova(text, text, text, text, text);
create or replace function public.matricula_nova(p_nome text, p_zap text, p_email text, p_plano text, p_indicacao text default '', p_academia uuid default null)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_acad uuid;
begin
  select academia_id into v_acad from matricula_config
   where (p_academia is null and (select count(*) from matricula_config) = 1)
      or academia_id = p_academia
   order by atualizado desc limit 1;
  if v_acad is null then
    -- v747: link antigo (sem ?a=) com mais de uma academia no banco → a
    -- página pede o link novo em vez de cadastrar na academia errada
    return json_build_object('erro', case when p_academia is null then 'sem_academia' else 'sem_config' end);
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
grant execute on function public.matricula_info(uuid) to anon, authenticated;
grant execute on function public.matricula_nova(text, text, text, text, text, uuid) to anon, authenticated;

-- ==================== PAGAMENTOS AUTOMÁTICOS (WEBHOOK PAGAR.ME) (2026-08) ====================
-- O webhook pagarme-webhook grava aqui cada cobrança paga/recusada; o sistema
-- lê e dá baixa sozinho no financeiro. Bloco idempotente.

create table if not exists public.pagarme_eventos (
  id text primary key,                          -- id do evento no Pagar.me (idempotência)
  academia_id uuid references public.academias (id) on delete cascade,
  tipo text not null default '',                -- charge.paid, charge.payment_failed, order.paid…
  status text not null default '',
  valor_centavos integer not null default 0,
  assinatura_id text not null default '',
  pedido_id text not null default '',
  cliente text not null default '',
  email text not null default '',
  criado timestamptz not null default now()
);

create index if not exists pagarme_eventos_acad on public.pagarme_eventos (academia_id, criado desc);

alter table public.pagarme_eventos enable row level security;

drop policy if exists "pagarme_eventos_membros" on public.pagarme_eventos;
create policy "pagarme_eventos_membros" on public.pagarme_eventos
  for select using (academia_id in (select public.minhas_academias()));

-- ==================== FEED DA COMUNIDADE (rede social do studio) ====================
-- Os alunos publicam resultado, foto e recado; a turma curte e comenta.
-- As curtidas e os comentários reusam a tabela app_reacoes (post_id = 'feed:<id>').
-- O professor modera pelo módulo (RLS de membro). Bloco idempotente.

create table if not exists public.app_feed (
  id uuid primary key default gen_random_uuid(),
  academia_id uuid not null references public.academias (id) on delete cascade,
  token text not null,                          -- autor (token do app do aluno)
  nome text not null default '',
  texto text not null default '',
  foto text not null default '',                -- data URI JPEG já comprimido pelo app
  treino text not null default '',              -- "Treino B — Costas/Perna" (opcional)
  oculto boolean not null default false,        -- moderação do professor
  criado timestamptz not null default now()
);

create index if not exists app_feed_recentes on public.app_feed (academia_id, criado desc);
create index if not exists app_feed_autor on public.app_feed (token, criado desc);

alter table public.app_feed enable row level security;

drop policy if exists "app_feed_membros" on public.app_feed;
create policy "app_feed_membros" on public.app_feed
  for all using (academia_id in (select public.minhas_academias()))
  with check (academia_id in (select public.minhas_academias()));

-- o aluno publica (texto e/ou foto). Limites: 600 caracteres, foto de até
-- ~400 KB em base64 e 10 posts por dia — segura spam e o tamanho da tabela.
create or replace function public.app_aluno_posta(t text, p_nome text, p_texto text, p_foto text, p_treino text)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_acad uuid;
  v_nome text;
  v_hoje integer;
  v_id uuid;
begin
  -- o nome vem do que o próprio app já devolveu ao professor; o p_nome só
  -- entra como reserva pra quem ainda não sincronizou nada
  select academia_id, coalesce(nullif(retorno->>'nome', ''), nullif(trim(coalesce(p_nome, '')), ''), 'Aluno')
    into v_acad, v_nome
    from app_aluno where token = t and revogado_em is null;
  if v_acad is null then
    return json_build_object('erro', 'token_invalido');
  end if;
  if length(trim(coalesce(p_texto, ''))) = 0 and length(coalesce(p_foto, '')) = 0 then
    return json_build_object('erro', 'vazio');
  end if;
  if length(coalesce(p_foto, '')) > 0 then
    if p_foto !~ '^data:image/(png|jpe?g|webp);base64,' then
      return json_build_object('erro', 'foto_invalida');
    end if;
    if length(p_foto) > 400000 then
      return json_build_object('erro', 'foto_grande');
    end if;
  end if;
  select count(*) into v_hoje from app_feed
    where token = t and criado > now() - interval '24 hours';
  if v_hoje >= 10 then
    return json_build_object('erro', 'limite_diario');
  end if;
  insert into app_feed (academia_id, token, nome, texto, foto, treino)
    values (v_acad, t, left(coalesce(v_nome, 'Aluno'), 60),
            left(trim(coalesce(p_texto, '')), 600), coalesce(p_foto, ''),
            left(coalesce(p_treino, ''), 80))
    returning id into v_id;
  return json_build_object('ok', true, 'id', v_id);
end;
$$;

-- o feed da turma, já com curtidas e comentários de cada post
create or replace function public.app_aluno_feed(t text, p_limite integer default 30)
returns json
language plpgsql security definer stable
set search_path = public
as $$
declare
  v_acad uuid;
  v_out json;
begin
  v_acad := public.app_aluno_ativo(t);
  if v_acad is null then
    return json_build_object('erro', 'token_invalido');
  end if;
  select coalesce(json_agg(linha order by (linha->>'criado') desc), '[]'::json) into v_out
  from (
    select json_build_object(
      'id', f.id,
      'nome', f.nome,
      'texto', f.texto,
      'foto', f.foto,
      'treino', f.treino,
      'criado', f.criado,
      -- nível ATUAL do autor, do que o app dele sincronizou por último
      -- (retorno.nivel entra pelo app_aluno_devolve; app antigo = sem selo)
      'nivel', coalesce(nullif(a.retorno->>'nivel', '')::int, 0),
      'meu', (f.token = t),
      -- v747: só reações da MESMA academia do post
      'curtidas', (select count(*) from app_reacoes r
                     where r.post_id = 'feed:' || f.id and r.tipo = 'like' and r.academia_id = f.academia_id),
      'curti', exists (select 1 from app_reacoes r
                         where r.post_id = 'feed:' || f.id and r.tipo = 'like' and r.token = t and r.academia_id = f.academia_id),
      'comentarios', (select coalesce(json_agg(json_build_object(
                          'nome', c.nome, 'texto', c.texto, 'criado', c.criado) order by c.criado), '[]'::json)
                        from app_reacoes c
                        where c.post_id = 'feed:' || f.id and c.tipo = 'coment' and c.academia_id = f.academia_id)
    ) as linha
    from app_feed f
    left join app_aluno a on a.token = f.token
    where f.academia_id = v_acad and f.oculto = false
    order by f.criado desc
    limit greatest(1, least(60, coalesce(p_limite, 30)))
  ) sub;
  return json_build_object('ok', true, 'posts', v_out);
end;
$$;

-- o autor apaga o próprio post (leva junto curtidas e comentários dele)
create or replace function public.app_aluno_feed_apaga(t text, p_id uuid)
returns json
language plpgsql security definer
set search_path = public
as $$
begin
  if public.app_aluno_ativo(t) is null then
    return json_build_object('erro', 'sem_acesso');
  end if;
  delete from app_feed where id = p_id and token = t;
  if not found then
    return json_build_object('erro', 'nao_encontrado');
  end if;
  delete from app_reacoes where post_id = 'feed:' || p_id;
  return json_build_object('ok', true);
end;
$$;

grant execute on function public.app_aluno_posta(text, text, text, text, text) to anon, authenticated;
grant execute on function public.app_aluno_feed(text, integer) to anon, authenticated;
grant execute on function public.app_aluno_feed_apaga(text, uuid) to anon, authenticated;

-- =====================================================================
-- EXCLUSÃO DE CONTA (exigência da Google Play e da App Store)
-- Desde 2023 a Play exige que todo app com login ofereça exclusão da
-- conta DENTRO do app e por um endereço na web. Aqui a exclusão é de
-- verdade: apaga o usuário no auth e, se ele for o único dono da ilha,
-- apaga a academia inteira — as chaves estrangeiras são "on delete
-- cascade", então alunos, pagamentos, treinos, dietas e chat vão junto.
-- =====================================================================
create or replace function public.excluir_minha_conta()
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_acad uuid;
  v_donos int;
  v_ilhas int := 0;
begin
  if v_user is null then
    raise exception 'faça login antes';
  end if;

  -- ilha em que ele é o ÚNICO dono morre junto; onde há outro dono, só ele sai
  for v_acad in select academia_id from membros where user_id = v_user and papel = 'dono' loop
    select count(*) into v_donos from membros where academia_id = v_acad and papel = 'dono';
    if v_donos <= 1 then
      delete from academias where id = v_acad;
      perform public.app_hist_apaga_academia(v_acad); -- v744: o histórico morre junto
      v_ilhas := v_ilhas + 1;
    end if;
  end loop;

  delete from membros where user_id = v_user;
  delete from auth.users where id = v_user;

  return json_build_object('ok', true, 'ilhas_apagadas', v_ilhas);
end;
$$;

grant execute on function public.excluir_minha_conta() to authenticated;

-- ==================== PÁGINA DE VENDAS DO PERSONAL ====================
-- O personal monta a página em "Minha página" e publica aqui; o visitante
-- abre por www.torqueon.com.br/pagina.html?s=<endereco>. Mesmo padrão do
-- app_aluno: membros escrevem pela API normal, visitante lê pela RPC.
-- Este bloco pode rodar mais de uma vez sem problema.

create table if not exists public.site_pro (
  slug text primary key,
  academia_id uuid not null references public.academias (id) on delete cascade,
  dados jsonb,
  atualizado timestamptz not null default now()
);

alter table public.site_pro enable row level security;

drop policy if exists "site_pro_membros" on public.site_pro;
create policy "site_pro_membros" on public.site_pro
  for all using (academia_id in (select public.minhas_academias()))
  with check (academia_id in (select public.minhas_academias()));

-- o visitante busca só a página daquele endereço — nunca a tabela
create or replace function public.site_pro_busca(s text)
returns jsonb
language sql security definer stable
set search_path = public
as $$
  select dados from public.site_pro where slug = s
$$;

grant execute on function public.site_pro_busca(text) to anon, authenticated;

-- ==================== ASSINATURA DO PROFISSIONAL (lojas) ====================
-- O personal pode assinar o TORQUE PERSONAL de dentro do app, pela App Store
-- ou pela Play Store. O RevenueCat confere o recibo com a Apple/Google e
-- chama a Edge Function assinatura-loja, que grava o status aqui. O painel
-- consulta pelo RPC minha_assinatura().
-- Este bloco pode rodar mais de uma vez sem problema.

alter table public.academias add column if not exists assinatura_status text not null default 'trial';
alter table public.academias add column if not exists assinatura_via text not null default '';
alter table public.academias add column if not exists assinatura_vence timestamptz;
alter table public.academias add column if not exists assinatura_ref text not null default '';
-- v747: o instante do ÚLTIMO evento do RevenueCat aplicado — a função
-- assinatura-loja só grava evento mais novo que este (retry de uma EXPIRATION
-- antiga não bloqueia quem acabou de renovar)
alter table public.academias add column if not exists assinatura_evento_em timestamptz;

-- o profissional logado vê a situação da própria assinatura (nunca a dos outros)
create or replace function public.minha_assinatura()
returns jsonb
language sql security definer stable
set search_path = public
as $$
  select jsonb_build_object(
    'status', a.assinatura_status,
    'via', a.assinatura_via,
    'vence', a.assinatura_vence,
    'academia_id', a.id
  )
  from public.academias a
  where a.id in (select public.minhas_academias())
  order by a.criada
  limit 1
$$;

grant execute on function public.minha_assinatura() to authenticated;

-- ==================== WHATSAPP OFICIAL POR PROFISSIONAL (2026-08) ====================
-- Cada personal/academia liga o PRÓPRIO número do WhatsApp sem tocar em GitHub
-- nem em Supabase: ele cola o ID do número e o token na tela de Configurações e
-- o sistema guarda AQUI, separado por academia. A função "whatsapp" (uma só,
-- compartilhada por todo mundo) lê a credencial de quem está chamando.
--
-- O token nunca volta pro navegador: a tabela fica sem política de leitura e o
-- painel só enxerga o que a RPC zap_config_ve devolve (se tem token, sim ou não).
-- Bloco idempotente — pode rodar de novo.

create table if not exists public.zap_config (
  academia_id uuid primary key references public.academias (id) on delete cascade,
  phone_id text not null default '',
  token text not null default '',
  template text not null default '',
  atualizado timestamptz not null default now()
);

-- colunas do RECEBER (2026-08). Ficam aqui, junto do create table, porque o
-- zap_config_ve logo abaixo lê elas: na PRIMEIRA rodada do arquivo a função
-- seria criada antes das colunas existirem e o script inteiro morria.
alter table public.zap_config add column if not exists app_secret   text not null default '';
alter table public.zap_config add column if not exists verify_token text not null default '';
alter table public.zap_config add column if not exists ig_id        text not null default '';
alter table public.zap_config add column if not exists ig_token     text not null default '';

alter table public.zap_config enable row level security;
-- de propósito SEM políticas: ninguém lê nem escreve direto pela API.
-- Todo acesso passa pelas funções abaixo (ou pela service key, no servidor).

-- salva a credencial da academia de quem está logado.
-- token vazio = "não mexi nesse campo": mantém o que já estava guardado.
create or replace function public.zap_config_salva(p_phone_id text, p_token text, p_template text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare aid uuid;
begin
  select academia_id into aid from public.membros where user_id = auth.uid() order by criado limit 1;
  if aid is null then
    return jsonb_build_object('erro', 'Entre na sua conta primeiro.');
  end if;
  insert into public.zap_config (academia_id, phone_id, token, template, atualizado)
  values (aid, coalesce(p_phone_id, ''), coalesce(p_token, ''), coalesce(p_template, ''), now())
  on conflict (academia_id) do update
    set phone_id = excluded.phone_id,
        token = case when coalesce(excluded.token, '') = '' then zap_config.token else excluded.token end,
        template = excluded.template,
        atualizado = now();
  return jsonb_build_object('ok', true);
end
$$;

-- o painel só precisa saber se está configurado — o token NÃO volta nunca
create or replace function public.zap_config_ve()
returns jsonb
language sql security definer stable
set search_path = public
as $$
  select coalesce(
    (select jsonb_build_object(
              'phone_id', z.phone_id,
              'template', z.template,
              'tem_token', length(coalesce(z.token, '')) > 0,
              -- pro RECEBER: o que a tela precisa mostrar sem nunca ver segredo
              'verify_token', coalesce(z.verify_token, ''),
              'ig_id', coalesce(z.ig_id, ''),
              'tem_app_secret', length(coalesce(z.app_secret, '')) > 0,
              'tem_ig_token', length(coalesce(z.ig_token, '')) > 0,
              'atualizado', z.atualizado)
       from public.zap_config z
      where z.academia_id in (select public.minhas_academias())
      limit 1),
    jsonb_build_object('phone_id', '', 'template', '', 'tem_token', false,
                       'verify_token', '', 'ig_id', '', 'tem_app_secret', false, 'tem_ig_token', false));
$$;

-- desligar: apaga a credencial desta academia (o número volta a ser manual)
create or replace function public.zap_config_apaga()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
  delete from public.zap_config where academia_id in (select public.minhas_academias());
  return jsonb_build_object('ok', true);
end
$$;

grant execute on function public.zap_config_salva(text, text, text) to authenticated;
grant execute on function public.zap_config_ve() to authenticated;
grant execute on function public.zap_config_apaga() to authenticated;

-- ==================== RECEBER POR PROFISSIONAL (webhook da Meta) ====================
-- O caminho de ENVIAR já é por academia (bloco zap_config acima). Este bloco faz o
-- mesmo com o caminho de RECEBER: a mensagem que chega traz o ID do número que a
-- recebeu, e é por ele que a função meta-webhook descobre a academia dona.
--
-- Antes disso, o webhook escolhia a academia com um "limit 1" — ou seja, SORTEAVA.
-- Com dois profissionais no mesmo banco, a conversa de um caía dentro da academia
-- do outro. Os índices únicos abaixo garantem que um número pertence a um dono só.
-- Bloco idempotente — pode rodar de novo.

-- parciais (where <> ''): sem isso o default vazio faria todo mundo colidir
create unique index if not exists zap_config_phone  on public.zap_config (phone_id)     where phone_id     <> '';
create unique index if not exists zap_config_ig     on public.zap_config (ig_id)        where ig_id        <> '';
create unique index if not exists zap_config_verify on public.zap_config (verify_token) where verify_token <> '';

-- senha do aperto de mão com a Meta, gerada pelo servidor (o profissional não
-- escolhe: dois escolhendo "torque123" quebrariam a busca por valor).
-- Alfabeto sem 0/O/1/I/L, que ninguém confunde ao digitar.
create or replace function public.zap_verify_novo()
returns text
language sql volatile
set search_path = public
as $$
  select 'torque-' || string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', (floor(random() * 31)::int) + 1, 1), '')
    from generate_series(1, 10)
$$;
-- v747: helper interno — só as RPCs (security definer) chamam; sem isso ele
-- herdava EXECUTE de PUBLIC e virava endpoint /rest/v1/rpc pra anônimo
revoke execute on function public.zap_verify_novo() from public, anon, authenticated;

-- salva a credencial completa (enviar + receber) da academia de quem está logado.
-- Campo secreto vazio = "não mexi nesse": mantém o que já estava guardado.
create or replace function public.zap_config_salva2(
  p_phone_id text, p_token text, p_template text,
  p_app_secret text, p_ig_id text, p_ig_token text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare aid uuid; vt text;
begin
  select academia_id into aid from public.membros where user_id = auth.uid() order by criado limit 1;
  if aid is null then
    return jsonb_build_object('erro', 'Entre na sua conta primeiro.');
  end if;
  insert into public.zap_config (academia_id, phone_id, token, template, app_secret, ig_id, ig_token, verify_token, atualizado)
  values (aid, coalesce(p_phone_id, ''), coalesce(p_token, ''), coalesce(p_template, ''),
          coalesce(p_app_secret, ''), coalesce(p_ig_id, ''), coalesce(p_ig_token, ''),
          public.zap_verify_novo(), now())
  on conflict (academia_id) do update
    set phone_id   = excluded.phone_id,
        token      = case when coalesce(excluded.token, '')      = '' then zap_config.token      else excluded.token      end,
        app_secret = case when coalesce(excluded.app_secret, '') = '' then zap_config.app_secret else excluded.app_secret end,
        ig_token   = case when coalesce(excluded.ig_token, '')   = '' then zap_config.ig_token   else excluded.ig_token   end,
        ig_id      = case when coalesce(excluded.ig_id, '')     = '' then zap_config.ig_id     else excluded.ig_id     end,
        template   = excluded.template,
        -- a senha do aperto de mão nasce uma vez e não muda mais (ela já está
        -- colada no painel da Meta do profissional)
        verify_token = case when coalesce(zap_config.verify_token, '') = ''
                            then public.zap_verify_novo() else zap_config.verify_token end,
        atualizado = now();
  select z.verify_token into vt from public.zap_config z where z.academia_id = aid;
  return jsonb_build_object('ok', true, 'verify_token', vt);
end
$$;

grant execute on function public.zap_config_salva2(text, text, text, text, text, text) to authenticated;

-- ==================== PAGAMENTOS POR PROFISSIONAL ====================
-- Cada personal/academia recebe os pagamentos dos alunos DIRETO na própria
-- conta do gateway que escolher (Mercado Pago, Asaas ou Pagar.me) — o dinheiro
-- nunca passa pelo dono do sistema, então não existe repasse nem intermediação.
-- Mesmo desenho do zap_config ("cada um paga o seu"): a chave fica AQUI,
-- selada — RLS ligada SEM política nenhuma, só a função pagamentos lê, com a
-- service key. pag_config_ve devolve provedor + tem_chave (booleano), NUNCA a
-- chave. comissao_pct nasce em 0 e fica pronta pro modelo marketplace/split.
-- Bloco idempotente.
create table if not exists public.pag_config (
  academia_id uuid primary key references public.academias (id) on delete cascade,
  provedor text not null check (provedor in ('mercadopago', 'asaas', 'pagarme')),
  chave text not null,
  comissao_pct numeric not null default 0,
  atualizado timestamptz not null default now()
);
alter table public.pag_config enable row level security;

-- Baixa automática: cada academia ganha uma senha de webhook própria. É por ela
-- (na URL ?aid=…&k=…) que a função pagamentos-webhook descobre DE QUEM é o aviso
-- de pagamento — mesmo desenho do verify_token da Meta: um dono por senha.
alter table public.pag_config add column if not exists webhook_token text not null default '';
-- id do webhook criado na conta Asaas do profissional (pra não criar dois)
alter table public.pag_config add column if not exists asaas_webhook_id text not null default '';
create unique index if not exists pag_config_webhook on public.pag_config (webhook_token) where webhook_token <> '';

-- senha longa e aleatória (64 caracteres); gerada pelo servidor, nunca escolhida
create or replace function public.pag_token_novo()
returns text
language sql volatile
set search_path = public
as $$
  select 'tq' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
$$;
revoke execute on function public.pag_token_novo() from public, anon, authenticated; -- v747: helper interno

-- quem já tinha gateway ligado antes desta versão ganha a senha agora
update public.pag_config set webhook_token = public.pag_token_novo() where coalesce(webhook_token, '') = '';

-- Modelo marketplace (split do dono, Asaas): comissao_pct nasce em 0 — todo
-- professor recebe 100%. Pra passar a ganhar uma fatia de UMA academia:
--   1. crie o Secret ASAAS_WALLET_DONO nas Edge Functions (sua carteira Asaas);
--   2. suba a comissão dela, ex.:
--        update public.pag_config set comissao_pct = 5 where academia_id = '<id da academia>';
-- A cobrança seguinte já sai dividida sozinha; voltar a 0 desliga o split.

create or replace function public.pag_config_salva(p_provedor text, p_chave text)
returns json language plpgsql security definer set search_path = public as $$
declare v_acad uuid;
begin
  select academia_id into v_acad from membros where user_id = auth.uid() order by criado limit 1;
  if v_acad is null then return json_build_object('erro', 'entre na sua conta'); end if;
  if p_provedor not in ('mercadopago', 'asaas', 'pagarme') then
    return json_build_object('erro', 'provedor desconhecido');
  end if;
  if coalesce(trim(p_chave), '') = '' then
    -- chave vazia = só troca o provedor, mantendo a chave que já está guardada
    update pag_config set provedor = p_provedor, atualizado = now() where academia_id = v_acad;
    if not found then return json_build_object('erro', 'cole a chave do gateway'); end if;
    return json_build_object('ok', true);
  end if;
  insert into pag_config (academia_id, provedor, chave, webhook_token)
    values (v_acad, p_provedor, trim(p_chave), public.pag_token_novo())
    on conflict (academia_id) do update
      set provedor = excluded.provedor, chave = excluded.chave, atualizado = now(),
          -- a senha do webhook nasce uma vez e não muda mais (ela já pode estar
          -- registrada no gateway do profissional)
          webhook_token = case when coalesce(pag_config.webhook_token, '') = ''
                               then public.pag_token_novo() else pag_config.webhook_token end,
          -- chave nova = pode ser OUTRA conta Asaas: zera o id do webhook pra
          -- função pagamentos criar de novo na conta certa (senão a baixa
          -- automática morre em silêncio apontando pra conta velha)
          asaas_webhook_id = case when pag_config.chave is distinct from excluded.chave
                                  then '' else pag_config.asaas_webhook_id end;
  return json_build_object('ok', true);
end $$;
grant execute on function public.pag_config_salva(text, text) to authenticated;

-- estado pro painel pintar: provedor e SE tem chave — a chave em si nunca sai.
-- O webhook_token pode sair: ele é a senha que o PRÓPRIO profissional cola no
-- painel do gateway dele (mesmo papel do verify_token da Meta) e não deixa
-- ninguém cobrar nem ler nada — só avisar "chegou pagamento", e o aviso ainda
-- é conferido de volta no gateway antes de valer.
create or replace function public.pag_config_ve()
returns json language sql security definer stable set search_path = public as $$
  select coalesce(
    (select json_build_object('ok', true, 'provedor', p.provedor, 'tem_chave', true, 'comissao', p.comissao_pct,
                              'webhook_token', coalesce(p.webhook_token, ''), 'academia_id', p.academia_id)
       from pag_config p
      where p.academia_id in (select academia_id from membros where user_id = auth.uid())
      limit 1),
    json_build_object('ok', true, 'tem_chave', false))
$$;
grant execute on function public.pag_config_ve() to authenticated;

create or replace function public.pag_config_apaga()
returns json language plpgsql security definer set search_path = public as $$
declare v_acad uuid;
begin
  select academia_id into v_acad from membros where user_id = auth.uid() order by criado limit 1;
  if v_acad is null then return json_build_object('erro', 'entre na sua conta'); end if;
  delete from pag_config where academia_id = v_acad;
  return json_build_object('ok', true);
end $$;
grant execute on function public.pag_config_apaga() to authenticated;

-- ==================== BAIXA AUTOMÁTICA MULTI-GATEWAY (2026-08) ====================
-- A função pagamentos-webhook recebe o aviso "pagamento caiu" do gateway do
-- PRÓPRIO profissional (Mercado Pago, Asaas ou Pagar.me) e grava aqui — o
-- painel lê e dá baixa sozinho no financeiro. Segurança em duas voltas:
--   1. a URL do webhook carrega ?aid=<academia>&k=<webhook_token> (a senha da
--      tabela pag_config acima) — sem a dupla certa, a função nem olha o corpo;
--   2. a função NUNCA confia no corpo do aviso: ela pega só o id do pagamento e
--      busca os dados DE VOLTA no gateway, usando a chave guardada daquela
--      academia. Aviso falso com a senha vazada não vira baixa: o pagamento tem
--      que existir de verdade na conta do professor.
-- academia_id é NOT NULL de propósito: sem dono resolvido, não se grava nada
-- (mesma regra do meta-webhook). Bloco idempotente.

create table if not exists public.pag_eventos (
  id text primary key,                          -- provedor + ':' + id do pagamento (idempotência)
  academia_id uuid not null references public.academias (id) on delete cascade,
  provedor text not null default '',            -- mercadopago / asaas / pagarme
  tipo text not null default '',                -- pago / falhou / estorno
  valor_centavos integer not null default 0,
  ref text not null default '',                 -- "mt|<alunoId>|<origem>" carimbado na criação do link
  link_id text not null default '',             -- id do link/pedido que originou (casa com a.pedidosPg)
  assinatura_id text not null default '',       -- id da assinatura (cobrança automática)
  cliente text not null default '',
  email text not null default '',
  criado timestamptz not null default now()
);

create index if not exists pag_eventos_acad on public.pag_eventos (academia_id, criado desc);

alter table public.pag_eventos enable row level security;

-- o professor só LÊ os eventos da academia dele; escrever, só a função (service key)
drop policy if exists "pag_eventos_membros" on public.pag_eventos;
create policy "pag_eventos_membros" on public.pag_eventos
  for select using (academia_id in (select public.minhas_academias()));

-- ==================== CORTAR O ACESSO DO ALUNO (2026-08) ====================
-- Faltava a coisa mais básica: um jeito de tirar o acesso de UM aluno. "Encerrar
-- este aluno" só marcava no painel; o app dele continuava sendo alimentado pela
-- nuvem, o login por e-mail continuava valendo e ele seguia postando no feed.
-- E, do outro lado, o app do aluno não sabia diferenciar "fui apagado" de "estou
-- sem internet", então abria a cópia guardada pra sempre.
-- Bloco idempotente.

-- Estado do acesso, pro app saber o que houve. Três respostas possíveis, todas
-- com HTTP 200 — é isso que deixa o app distinguir "acabou" de "sem sinal":
--   {ok:true, dados:{...}} · {ok:false, motivo:'revogado'} · {ok:false, motivo:'sem_registro'}
create or replace function public.app_aluno_estado(t text)
returns jsonb
language sql security definer stable
set search_path = public
as $$
  select case
    when not exists (select 1 from public.app_aluno a where a.token = t)
      then jsonb_build_object('ok', false, 'motivo', 'sem_registro')
    when exists (select 1 from public.app_aluno a where a.token = t and a.revogado_em is not null)
      then jsonb_build_object('ok', false, 'motivo', 'revogado')
    else jsonb_build_object('ok', true, 'dados',
           (select a.dados from public.app_aluno a where a.token = t))
  end
$$;

grant execute on function public.app_aluno_estado(text) to anon, authenticated;

-- corta (ou apaga de vez) o acesso de um aluno da MINHA academia
create or replace function public.aluno_revoga_acesso(p_token text, p_apagar boolean default false)
returns json
language plpgsql security definer
set search_path = public
as $$
declare v_acad uuid;
begin
  select academia_id into v_acad from public.app_aluno where token = p_token;
  -- mesma resposta pra "não existe" e "não é seu": não revela nada de ninguém
  if v_acad is null or v_acad not in (select public.minhas_academias()) then
    return json_build_object('erro', 'Esse acesso não é desta conta.');
  end if;
  if p_apagar then
    delete from public.app_agendamentos where token = p_token;
    delete from public.app_reacoes      where token = p_token;
    delete from public.app_treino_log   where token = p_token;
    delete from public.push_subs        where token = p_token;
    delete from public.app_pedidos      where token = p_token;
    delete from public.app_checkin      where token = p_token;
    delete from public.app_chat         where token = p_token;
    delete from public.app_aval_aula    where token = p_token;
    delete from public.app_agenda       where token = p_token;
    delete from public.app_quest        where token = p_token;
    delete from public.app_feed         where token = p_token;
    delete from public.app_aluno        where token = p_token;
    delete from public.app_aluno_hist   where token = p_token; -- v744: apagar de vez apaga o histórico também
    return json_build_object('ok', true, 'apagado', true);
  end if;
  -- revogar: some o pacote e o login, mas o retorno (histórico que o painel lê)
  -- fica guardado — o professor não perde o que o aluno já registrou
  update public.app_aluno
     set revogado_em = now(), dados = null, login = '', senha = ''
   where token = p_token;
  -- v747: a inscrição de push sai junto — ex-aluno seguia recebendo os
  -- "avisos pra todos" meses depois, sem ter como se descadastrar (o app dele
  -- já tinha sido apagado)
  delete from public.push_subs where token = p_token;
  return json_build_object('ok', true, 'revogado', true);
end;
$$;

create or replace function public.aluno_religa_acesso(p_token text)
returns json
language plpgsql security definer
set search_path = public
as $$
declare v_acad uuid;
begin
  select academia_id into v_acad from public.app_aluno where token = p_token;
  if v_acad is null or v_acad not in (select public.minhas_academias()) then
    return json_build_object('erro', 'Esse acesso não é desta conta.');
  end if;
  update public.app_aluno set revogado_em = null where token = p_token;
  -- o pacote foi zerado na revogação: o painel precisa publicar o app de novo
  return json_build_object('ok', true, 'religado', true, 'republicar', true);
end;
$$;

-- v744: a faxina só alcança os acessos do MÓDULO e da ACADEMIA que chamou.
-- Antes ela revogava toda linha de app_aluno de TODAS as academias do
-- usuário que não estivesse na lista — e a lista vinha só com os alunos do
-- Personal: os pacientes do Nutri (mesma tabela, mesma academia) e os alunos
-- de outra academia em que ele fosse membro ficavam sem app.
create or replace function public.app_aluno_faxina(p_tokens text[], p_academia uuid default null, p_modulo text default 'personal')
returns json
language plpgsql security definer
set search_path = public
as $$
declare v_n int;
begin
  if p_academia is not null and p_academia not in (select public.minhas_academias()) then
    return json_build_object('erro', 'Essa academia não é desta conta.');
  end if;
  -- v747: quem é revogado aqui também perde a inscrição de push (returning →
  -- push_subs), senão o "aviso pra todos" continuava chegando no ex-aluno
  with rev as (
    update public.app_aluno
       set revogado_em = now(), dados = null, login = '', senha = ''
     where academia_id in (select public.minhas_academias())
       and (p_academia is null or academia_id = p_academia)
       and revogado_em is null
       and dados is not null
       and (case when p_modulo = 'nutri'
                 then coalesce(dados->'dados'->>'tipo', '') = 'nutri'
                 else coalesce(dados->'dados'->>'tipo', '') <> 'nutri' end)
       and not (token = any (coalesce(p_tokens, array[]::text[])))
     returning token
  ), lixo as (
    delete from public.push_subs where token in (select token from rev) returning token
  )
  select count(*) into v_n from rev;
  return json_build_object('ok', true, 'revogados', v_n);
end;
$$;
grant execute on function public.app_aluno_faxina(text[], uuid, text) to authenticated;

-- v744: "apagar de vez" e "excluir minha conta" limpam também as cópias de
-- histórico (dados_hist / app_aluno_hist), que não têm chave estrangeira e
-- ficavam pra sempre — o oposto do que a exclusão promete.
create or replace function public.app_hist_apaga_academia(p_acad uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.dados_hist     where academia_id = p_acad;
  delete from public.app_aluno_hist where academia_id = p_acad;
end $$;
revoke all on function public.app_hist_apaga_academia(uuid) from public, anon, authenticated;

grant execute on function public.aluno_revoga_acesso(text, boolean) to authenticated;
grant execute on function public.aluno_religa_acesso(text) to authenticated;

-- ==================== QUEM AINDA NÃO ABRIU PELO LINK ====================
-- (2026-08) O app deixou de existir como arquivo .html baixado. Quem ficou com
-- um desses no celular tem uma FOTO CONGELADA: não recebe conserto, não recebe
-- treino novo, não toca notificação e não obedece à revogação de acesso. Só que
-- não dá pra apagar de longe — o arquivo não fala com a nuvem.
--
-- O que dá pra fazer é DESCOBRIR quem é: quem nunca abriu o app pelo link
-- hospedado é exatamente quem ainda pode estar no formato velho. O carimbo
-- abaixo marca cada abertura; o painel monta a lista com o que faltou.
-- Bloco idempotente.

alter table public.app_aluno add column if not exists visto_em timestamptz;

-- o carimbo entra na MESMA chamada que o app já fazia pra abrir (nada de ida
-- extra na rede). Por isso a função deixou de ser 'stable' e virou plpgsql.
create or replace function public.app_aluno_estado(t text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare v_reg public.app_aluno%rowtype;
begin
  select * into v_reg from public.app_aluno a where a.token = t;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'sem_registro');
  end if;
  if v_reg.revogado_em is not null then
    return jsonb_build_object('ok', false, 'motivo', 'revogado');
  end if;
  -- uma escrita por aluno por dia: abrir o app 20 vezes não vira 20 updates
  if v_reg.visto_em is null or v_reg.visto_em < now() - interval '20 hours' then
    update public.app_aluno set visto_em = now() where token = t;
  end if;
  return jsonb_build_object('ok', true, 'dados', v_reg.dados);
end;
$$;

grant execute on function public.app_aluno_estado(text) to anon, authenticated;

-- o caminho antigo (app_aluno_busca) também carimba, senão quem está com a
-- página /app/ velha guardada aparecia pro professor como "nunca abriu"
create or replace function public.app_aluno_busca(t text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare v_dados jsonb; v_visto timestamptz;
begin
  select dados, visto_em into v_dados, v_visto
    from public.app_aluno where token = t and revogado_em is null;
  if not found then return null; end if;
  if v_visto is null or v_visto < now() - interval '20 hours' then
    update public.app_aluno set visto_em = now() where token = t;
  end if;
  return v_dados;
end;
$$;

grant execute on function public.app_aluno_busca(text) to anon, authenticated;

-- O painel manda os tokens que ele já conhece e recebe de volta SÓ a data da
-- última abertura de cada um. Nenhum token novo volta pro navegador: a resposta
-- é limitada ao que foi perguntado e ao que é desta conta.
create or replace function public.app_alunos_vistos(p_tokens text[])
returns json
language sql security definer stable
set search_path = public
as $$
  select coalesce(json_agg(json_build_object(
           'token', a.token,
           'visto_em', a.visto_em,
           'publicado_em', a.atualizado)), '[]'::json)
    from public.app_aluno a
   where a.academia_id in (select public.minhas_academias())
     and a.revogado_em is null
     and a.token = any (coalesce(p_tokens, array[]::text[]))
$$;

grant execute on function public.app_alunos_vistos(text[]) to authenticated;

-- ==================== RÉGUA DO TESTE GRÁTIS (2026-08) ====================
-- Quem cria conta e fica no teste (academias.assinatura_status = 'trial')
-- recebe 4 e-mails: dia 1, 3, 7 e 12 desde a criação da academia. O relógio
-- é o pg_cron (todo dia às 13:00 UTC = 10:00 em Brasília), que chama a Edge
-- Function regua-teste via pg_net com a senha da tabela SELADA regua_config
-- (RLS sem política nenhuma: só o banco e a service key alcançam — a senha
-- nunca toca o navegador). O envio é registrado em regua_log por marco, então
-- rodar duas vezes no mesmo dia não manda e-mail em dobro.
-- Este bloco pode rodar mais de uma vez sem problema.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.regua_config (
  id int primary key default 1 check (id = 1),
  token uuid not null default gen_random_uuid()
);
alter table public.regua_config enable row level security;
insert into public.regua_config (id) values (1) on conflict (id) do nothing;

create table if not exists public.regua_log (
  academia_id uuid not null references public.academias (id) on delete cascade,
  marco text not null,
  enviado timestamptz not null default now(),
  primary key (academia_id, marco)
);
alter table public.regua_log enable row level security;

-- A coorte do dia: academias em trial batendo um marco que ainda não receberam
-- aquele e-mail. O e-mail do dono sai de membros.email e, vazio, do login dele
-- (auth.users) — por isso security definer. Só a service key executa.
create or replace function public.regua_pendentes()
returns jsonb
language sql security definer stable
set search_path = public
as $$
  select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select a.id as academia_id, a.nome,
      coalesce(nullif(m.email, ''), m.email_login) as email,
      (floor(extract(epoch from now() - a.criada) / 86400)::int + 1) as dia
    from public.academias a
    join lateral (
      select mm.email, u.email as email_login
      from public.membros mm
      join auth.users u on u.id = mm.user_id
      where mm.academia_id = a.id and mm.papel = 'dono'
      order by mm.criado limit 1
    ) m on true
    where a.assinatura_status = 'trial'
      and (floor(extract(epoch from now() - a.criada) / 86400)::int + 1) in (1, 3, 7, 12)
      and coalesce(nullif(m.email, ''), m.email_login) is not null
      and not exists (
        select 1 from public.regua_log l
        where l.academia_id = a.id
          and l.marco = 'd' || (floor(extract(epoch from now() - a.criada) / 86400)::int + 1)
      )
  ) x
$$;
revoke execute on function public.regua_pendentes() from public, anon, authenticated;

-- o relógio: recria o job do zero pra este bloco poder rodar de novo
do $do$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'regua-teste-diaria';
exception when others then null;
end
$do$;
select cron.schedule('regua-teste-diaria', '0 13 * * *', $cron$
  select net.http_post(
    url := 'https://hdcufkaalxfhwmfwoiqp.supabase.co/functions/v1/regua-teste',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object('senha', (select token::text from public.regua_config where id = 1))
  )
$cron$);

-- ============================================================
-- HIGIENE DO LINTER (2026-08-30) — ganhos apontados pelo
-- verificador do próprio Supabase (Advisors). Tudo idempotente.
-- ============================================================

-- FKs sem índice: as consultas por membro e por página do professor
-- varriam a tabela inteira quando a base crescer
create index if not exists membros_user_idx on public.membros (user_id);
create index if not exists site_pro_academia_idx on public.site_pro (academia_id);

-- funções de GATILHO não são RPC: elas só existem pra rodar dentro do
-- trigger (o Postgres nem deixa chamar direto), então ninguém precisa do
-- EXECUTE — e sem ele o endpoint /rest/v1/rpc/... delas some do mapa.
-- O gatilho continua disparando normal: a permissão de EXECUTE só é
-- conferida na CRIAÇÃO do trigger, não a cada disparo.
revoke execute on function public.dados_guarda_hist() from anon, authenticated;
revoke execute on function public.app_aluno_guarda_hist() from anon, authenticated;

-- Sobre os OUTROS avisos do linter, pra ninguém "consertar" errado depois:
-- as ~60 RPCs SECURITY DEFINER executáveis por anon são DE PROPÓSITO — o
-- app do aluno não tem login do Supabase; cada RPC recebe o token do aluno
-- e valida por dentro (app_aluno_ativo). Revogar o EXECUTE delas quebraria
-- o app de todo mundo. E as tabelas com RLS sem política (zap_config,
-- pag_config, *_hist…) são SELADAS de propósito: só a service key entra.

-- ============================================================
-- PUSH PRO PROFESSOR (mt-v682) — aluno mandou mensagem no chat ou
-- pediu horário → o professor recebe push no celular dele.
-- Desenho: o painel grava a própria inscrição na push_subs com token
-- 'prof:<user_id>' (pela RLS de membro que já existe — sem RPC nova);
-- os GATILHOS abaixo avisam a função push-envia usando a senha da
-- push_config (tabela SELADA — gatilho não tem crachá de usuário; é a
-- mesma ideia da regua_config). Pagamento confirmado avisa pela própria
-- pagamentos-webhook, que já roda com a service key. Tudo idempotente.
-- ============================================================

create table if not exists public.push_config (
  id int primary key default 1 check (id = 1),
  token uuid not null default gen_random_uuid()
);
alter table public.push_config enable row level security; -- selada: sem política
insert into public.push_config (id) values (1) on conflict (id) do nothing;

-- push que falha NUNCA derruba a operação do aluno (por isso o exception)
create or replace function public.push_avisa_prof(p_academia uuid, p_titulo text, p_corpo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_senha text;
begin
  select token::text into v_senha from public.push_config where id = 1;
  if v_senha is null then return; end if;
  perform net.http_post(
    url := 'https://hdcufkaalxfhwmfwoiqp.supabase.co/functions/v1/push-envia',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object('acao', 'prof', 'senha', v_senha,
      'academia_id', p_academia::text, 'titulo', p_titulo, 'corpo', p_corpo));
exception when others then null;
end $$;
revoke execute on function public.push_avisa_prof(uuid, text, text) from anon, authenticated;

create or replace function public.push_prof_chat() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.de = 'aluno' then
    perform public.push_avisa_prof(new.academia_id, '💬 Mensagem de aluno',
      left(coalesce(new.texto, ''), 120));
  end if;
  return new;
end $$;
revoke execute on function public.push_prof_chat() from anon, authenticated;
drop trigger if exists push_prof_chat_tg on public.app_chat;
create trigger push_prof_chat_tg after insert on public.app_chat
  for each row execute function public.push_prof_chat();

create or replace function public.push_prof_agenda() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.origem = 'aluno' and new.status = 'pedido' then
    perform public.push_avisa_prof(new.academia_id, '📅 Pedido de horário',
      to_char(new.dia, 'DD/MM') || coalesce(' às ' || nullif(new.hora, ''), '') ||
      coalesce(' — ' || nullif(left(new.obs, 80), ''), ''));
  end if;
  return new;
end $$;
revoke execute on function public.push_prof_agenda() from anon, authenticated;
drop trigger if exists push_prof_agenda_tg on public.app_agenda;
create trigger push_prof_agenda_tg after insert on public.app_agenda
  for each row execute function public.push_prof_agenda();

-- ============================================================
-- AULA EXPERIMENTAL PELA MINHA PÁGINA (mt-v684) — o interessado
-- escolhe um dos horários que o PROFESSOR oferece e deixa nome +
-- WhatsApp; o pedido cai em matriculas_online (plano 'aula
-- experimental') e o professor recebe push na hora (v682). O
-- professor confirma pelo WhatsApp — a página nunca promete vaga.
-- ============================================================
alter table public.matriculas_online add column if not exists horario text not null default '';

create or replace function public.aula_exp_pede(p_academia uuid, p_nome text, p_zap text, p_horario text)
returns json language plpgsql security definer set search_path = public as $$
begin
  if p_academia is null or length(trim(coalesce(p_nome, ''))) < 2
     or length(regexp_replace(coalesce(p_zap, ''), '\D', '', 'g')) < 10 then
    return json_build_object('erro', 'Preencha seu nome e um WhatsApp válido.');
  end if;
  if not exists (select 1 from public.academias where id = p_academia) then
    return json_build_object('erro', 'Página não encontrada — avise o professor.');
  end if;
  -- freio de spam: a página é pública; mais de 10 pedidos NOVOS na última
  -- hora pra mesma academia é robô, não gente
  if (select count(*) from public.matriculas_online
      where academia_id = p_academia and plano = 'aula experimental'
        and criado > now() - interval '1 hour') >= 10 then
    return json_build_object('erro', 'Muitos pedidos agora — tente de novo mais tarde.');
  end if;
  insert into public.matriculas_online (academia_id, nome, zap, email, plano, horario)
  values (p_academia, left(trim(p_nome), 80), left(trim(p_zap), 20), '', 'aula experimental',
          left(coalesce(p_horario, ''), 60));
  perform public.push_avisa_prof(p_academia, '🎯 Aula experimental',
    left(trim(p_nome), 40) || coalesce(' — ' || nullif(left(p_horario, 40), ''), '') || '. Confirme no WhatsApp!');
  return json_build_object('ok', true);
end $$;
grant execute on function public.aula_exp_pede(uuid, text, text, text) to anon, authenticated;

-- ==================== SUPORTE — CHAMADOS (v708) ====================
-- O professor abre chamado pelo painel (Ajuda → Falar com o suporte) e a
-- Edge Function `suporte` grava aqui com protocolo único gerado no servidor
-- (TQ-AAAAMMDD-XXXX) — o registro é o rastreio, mesmo que o e-mail falhe.
-- RLS: membro só LÊ os chamados da própria academia; escrita SÓ pela função
-- (service key) — sem política de insert/update de propósito, igual às
-- tabelas seladas (zap_config, pag_config).

create table if not exists public.suporte_chamados (
  id uuid primary key default gen_random_uuid(),
  protocolo text not null unique,
  academia_id uuid not null references public.academias (id) on delete cascade,
  user_id uuid not null,
  email text not null default '',
  tipo text not null default 'bug',
  mensagem text not null,
  status text not null default 'aberto',
  resposta text not null default '',
  criado_em timestamptz not null default now()
);
alter table public.suporte_chamados enable row level security;
drop policy if exists "suporte_chamados_le" on public.suporte_chamados;
create policy "suporte_chamados_le" on public.suporte_chamados for select
  using (academia_id in (select public.minhas_academias()));
create index if not exists suporte_chamados_acad_idx
  on public.suporte_chamados (academia_id, criado_em desc);
-- responder um chamado (feito pelo suporte, direto no SQL):
--   update public.suporte_chamados
--     set status = 'respondido', resposta = 'texto da resposta'
--     where protocolo = 'TQ-20260831-ABCD';

-- ============================================================
-- RÉGUA DIÁRIA NO SERVIDOR (v721) — os pushes de "hoje tem
-- treino", "amanhã tem treino" e "feliz aniversário" saem do
-- relógio do banco (pg_cron → função regua-diaria), sem o
-- painel precisar estar aberto. A tabela guarda o que o
-- SERVIDOR já mandou; o painel importa essas chaves pro
-- pushLog local, então nenhum aluno recebe aviso em dobro.
-- ============================================================

create table if not exists public.push_log_srv (
  academia_id uuid not null references public.academias (id) on delete cascade,
  chave text not null,
  em timestamptz not null default now(),
  primary key (academia_id, chave)
);
alter table public.push_log_srv enable row level security;
-- membro só LÊ (pra importar as marcas); quem escreve é a função, com a
-- service key — aluno e anônimo não alcançam nada aqui
drop policy if exists "push_log_srv_membro_le" on public.push_log_srv;
create policy "push_log_srv_membro_le" on public.push_log_srv
  for select using (academia_id in (select public.minhas_academias()));

-- o relógio: 10:00 UTC = 07:00 no Brasil; recria o job do zero pra este
-- bloco poder rodar de novo (mesma senha selada da regua_config)
do $do$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'regua-diaria-push';
exception when others then null;
end
$do$;
select cron.schedule('regua-diaria-push', '0 10 * * *', $cron$
  select net.http_post(
    url := 'https://hdcufkaalxfhwmfwoiqp.supabase.co/functions/v1/regua-diaria',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object('senha', (select token::text from public.regua_config where id = 1))
  )
$cron$);

-- ============================================================
-- GALERIA NO STORAGE (v725) — fotos NOVAS do banco de imagens
-- do professor sobem pro balde 'galeria' e a lista local guarda
-- só a URL: a foto deixa de pesar no aparelho e no sync. Leitura
-- é pública (o caminho leva o uuid da academia — sem o link exato
-- ninguém acha nada, mesmo modelo dos tokens do app); escrever e
-- apagar é só membro da academia dona do prefixo. Foto antiga em
-- base64 continua valendo — nada é migrado à força.
-- ============================================================

insert into storage.buckets (id, name, public) values ('galeria', 'galeria', true)
on conflict (id) do update set public = true;

drop policy if exists "galeria_membro_escreve" on storage.objects;
create policy "galeria_membro_escreve" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'galeria'
    and ((storage.foldername(name))[1])::uuid in (select public.minhas_academias()));

drop policy if exists "galeria_membro_apaga" on storage.objects;
create policy "galeria_membro_apaga" on storage.objects
  for delete to authenticated
  using (bucket_id = 'galeria'
    and ((storage.foldername(name))[1])::uuid in (select public.minhas_academias()));


-- ============================================================
-- TETO DE USO DA IA POR ACADEMIA (v753)
--
-- A chave da Anthropic é do dono do sistema: qualquer conta logada
-- (inclusive um teste grátis de 14 dias) podia chamar a IA em laço e a
-- fatura era do dono. Agora cada chamada de IA conta uma unidade no dia,
-- por academia, e a chat-envia recusa com recado honesto quando passa do
-- teto. Tabela SELADA (RLS sem política: só a service key alcança) e a RPC
-- não é executável por anon/authenticated — quem conta é a função.
--
-- Teto padrão: 80 por dia (o Secret IA_TETO_DIA da chat-envia muda o número
-- sem republicar nada). Pra soltar uma academia num dia específico:
--   delete from public.ia_uso where academia_id = '...' and dia = current_date;
-- ============================================================

create table if not exists public.ia_uso (
  academia_id uuid not null references public.academias(id) on delete cascade,
  dia date not null default public.hoje_br(),
  n int not null default 0,
  atualizado timestamptz not null default now(),
  primary key (academia_id, dia)
);
alter table public.ia_uso enable row level security;  -- selada de propósito

create or replace function public.ia_uso_conta(p_academia uuid, p_teto int default 80)
returns json
language plpgsql security definer
set search_path = public
as $$
declare v_n int; v_teto int := greatest(1, coalesce(p_teto, 80));
begin
  if p_academia is null then
    return json_build_object('ok', true, 'n', 0, 'teto', v_teto);
  end if;
  insert into ia_uso (academia_id, dia, n)
    values (p_academia, public.hoje_br(), 1)
    on conflict (academia_id, dia) do update
      set n = ia_uso.n + 1, atualizado = now()
    returning n into v_n;
  -- faxina barata: contagem de mais de 45 dias não serve pra nada
  delete from ia_uso where dia < public.hoje_br() - 45;
  return json_build_object('ok', v_n <= v_teto, 'n', v_n, 'teto', v_teto);
end;
$$;
revoke execute on function public.ia_uso_conta(uuid, int) from public, anon, authenticated;

-- ============================================================
-- SAÚDE DA BASE E USO DOS RECURSOS (v760)
-- ============================================================
-- Por que existe: até aqui o dono só descobria que um cliente estava indo
-- embora quando o cliente mandava áudio no WhatsApp. Não havia UM lugar que
-- dissesse quem entrou, quem travou e de quem o teste vence. Estas duas RPCs
-- são esse lugar — e são SÓ LEITURA do que já está no banco: nenhuma tabela
-- nova, nenhuma coleta nova, nenhum dado de aluno exposto.
--
-- hq_saude()  → uma linha por academia, com os sinais do que travou.
-- hq_uso()    → quantas academias usam CADA recurso do produto. É o número
--               que segura a mão de quem quer construir a vigésima tela antes
--               de a quinta ser usada por alguém.

-- conta itens de um pedaço do blob, seja ele lista (alunos) ou objeto
-- (treinosV2 é objeto, com uma chave por aluno)
create or replace function public.blob_qtd(v jsonb)
returns int
language sql immutable
as $$
  select case
    when v is null then 0
    when jsonb_typeof(v) = 'array' then jsonb_array_length(v)
    when jsonb_typeof(v) = 'object' then (select count(*)::int from jsonb_object_keys(v))
    else 0 end
$$;
revoke execute on function public.blob_qtd(jsonb) from public, anon, authenticated;

-- SAÚDE: uma linha por academia. O campo `sinais` é o "Resolver hoje" do dono —
-- frases prontas, na ordem em que doem, montadas a partir do que já existe.
create or replace function public.hq_saude()
returns json
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (select 1 from saas_admins where user_id = auth.uid()) then
    raise exception 'acesso restrito ao administrador do TORQUE ON';
  end if;

  return coalesce((select json_agg(x order by x.urgencia desc, x.dia_do_teste desc) from (
    select
      a.id, a.nome, a.criada::date as criada, a.assinatura_status as status,
      -- o mesmo dia que a régua de e-mail usa (dia 1 é o dia do cadastro)
      (floor(extract(epoch from now() - a.criada) / 86400)::int + 1) as dia_do_teste,
      greatest(0, 14 - (floor(extract(epoch from now() - a.criada) / 86400)::int + 1)) as dias_de_teste_restantes,
      s.alunos, s.com_treino, s.sessoes, s.pagamentos,
      s.apps_publicados, s.apps_abertos,
      s.ultima_atividade::date as ultimo_uso,
      s.dias_parado,
      s.emails_do_teste,
      s.sinais,
      -- urgência: quem está a um passo de virar cliente ou de ir embora sobe
      (case when a.assinatura_status = 'trial'
                 and (floor(extract(epoch from now() - a.criada) / 86400)::int + 1) > 14
                 and s.alunos > 0 then 100 else 0 end
       + least(s.dias_parado, 30)
       + (case when s.alunos > 0 and s.apps_abertos = 0 then 20 else 0 end)
       + (case when s.alunos = 0 then 15 else 0 end)) as urgencia
    from academias a
    join lateral (
      select
        blob_qtd(d.valor->'alunos')     as alunos,
        blob_qtd(d.valor->'treinosV2')  as com_treino,
        blob_qtd(d.valor->'sessoes')    as sessoes,
        blob_qtd(d.valor->'pagamentos') as pagamentos,
        (select count(*) from app_aluno p where p.academia_id = a.id and p.revogado_em is null) as apps_publicados,
        -- "abriu" = o app já devolveu alguma coisa (peso, treino marcado, foto)
        (select count(*) from app_aluno p where p.academia_id = a.id and p.revogado_em is null
           and p.retorno is not null and p.retorno <> '{}'::jsonb) as apps_abertos,
        (select max(dd.atualizado) from dados dd where dd.academia_id = a.id) as ultima_atividade,
        coalesce((select floor(extract(epoch from now() - max(dd.atualizado)) / 86400)::int
                  from dados dd where dd.academia_id = a.id), 999) as dias_parado,
        (select count(*) from regua_log l where l.academia_id = a.id) as emails_do_teste,
        (select coalesce(json_agg(t), '[]'::json) from (
           select unnest(array_remove(array[
             case when blob_qtd(d.valor->'alunos') = 0
                  then 'Criou a conta e não cadastrou nenhum aluno' end,
             case when blob_qtd(d.valor->'alunos') > 0
                   and (select count(*) from app_aluno p where p.academia_id = a.id and p.revogado_em is null) = 0
                  then 'Tem aluno mas nunca publicou o app de ninguém' end,
             case when (select count(*) from app_aluno p where p.academia_id = a.id and p.revogado_em is null) > 0
                   and (select count(*) from app_aluno p where p.academia_id = a.id and p.revogado_em is null
                          and p.retorno is not null and p.retorno <> '{}'::jsonb) = 0
                  then 'Publicou o app e nenhum aluno abriu ainda' end,
             case when blob_qtd(d.valor->'alunos') > 0 and blob_qtd(d.valor->'treinosV2') = 0
                  then 'Tem aluno e nenhum treino montado' end,
             case when a.assinatura_status = 'trial'
                   and (floor(extract(epoch from now() - a.criada) / 86400)::int + 1) > 14
                  then 'TESTE VENCIDO há ' || ((floor(extract(epoch from now() - a.criada) / 86400)::int + 1) - 14) || ' dias — ninguém pediu pra assinar' end,
             case when a.assinatura_status = 'trial'
                   and (floor(extract(epoch from now() - a.criada) / 86400)::int + 1) between 12 and 14
                  then 'Teste acaba em ' || (14 - (floor(extract(epoch from now() - a.criada) / 86400)::int + 1)) || ' dias' end,
             case when coalesce((select floor(extract(epoch from now() - max(dd.atualizado)) / 86400)::int
                                 from dados dd where dd.academia_id = a.id), 999) >= 7
                  then 'Sem abrir o painel há ' || coalesce((select floor(extract(epoch from now() - max(dd.atualizado)) / 86400)::int
                                 from dados dd where dd.academia_id = a.id), 999) || ' dias' end
           ], null)) as t
         ) t) as sinais
      from dados d
      where d.academia_id = a.id and d.chave = 'mtapp:ptStudio'
      union all
      -- academia que nem chegou a gravar o estúdio ainda
      select 0, 0, 0, 0, 0, 0, null::timestamptz, 999, 0,
             '["Entrou e não gravou nada — parou na primeira tela"]'::json
      where not exists (select 1 from dados d2 where d2.academia_id = a.id and d2.chave = 'mtapp:ptStudio')
      limit 1
    ) s on true
  ) x), '[]'::json);
end;
$$;
grant execute on function public.hq_saude() to authenticated;

-- USO DOS RECURSOS: quantas academias têm CONTEÚDO em cada recurso do produto.
-- Serve pra uma pergunta só: vale a pena mexer nisto de novo? Recurso com zero
-- é superfície que só custa manutenção. Nada aqui olha dado de aluno — só
-- conta se a lista está vazia ou não.
create or replace function public.hq_uso()
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_total int;
begin
  if not exists (select 1 from saas_admins where user_id = auth.uid()) then
    raise exception 'acesso restrito ao administrador do TORQUE ON';
  end if;
  select count(*) into v_total from academias;

  return json_build_object(
    'academias', v_total,
    'recursos', coalesce((select json_agg(r order by r.usam desc, r.recurso) from (
      select 'Alunos'::text as recurso, count(*) filter (where blob_qtd(d.valor->'alunos') > 0)::int as usam from dados d where d.chave = 'mtapp:ptStudio'
      union all select 'Treinos montados', count(*) filter (where blob_qtd(d.valor->'treinosV2') > 0)::int from dados d where d.chave = 'mtapp:ptStudio'
      union all select 'Agenda (sessões)', count(*) filter (where blob_qtd(d.valor->'sessoes') > 0)::int from dados d where d.chave = 'mtapp:ptStudio'
      union all select 'Financeiro (pagamentos)', count(*) filter (where blob_qtd(d.valor->'pagamentos') > 0)::int from dados d where d.chave = 'mtapp:ptStudio'
      union all select 'Planos e contratos', count(*) filter (where blob_qtd(d.valor->'planosPT') > 0)::int from dados d where d.chave = 'mtapp:ptStudio'
      union all select 'Avaliação física', count(*) filter (where blob_qtd(d.valor->'avaliacoes') > 0)::int from dados d where d.chave = 'mtapp:ptStudio'
      union all select 'Diário da sessão', count(*) filter (where blob_qtd(d.valor->'diarioPT') > 0)::int from dados d where d.chave = 'mtapp:ptStudio'
      union all select 'Despesas', count(*) filter (where blob_qtd(d.valor->'despesas') > 0)::int from dados d where d.chave = 'mtapp:ptStudio'
      union all select 'Videoteca', count(*) filter (where blob_qtd(d.valor->'videoteca') > 0)::int from dados d where d.chave = 'mtapp:ptStudio'
      union all select 'Loja do personal', count(*) filter (where blob_qtd(d.valor->'produtos') > 0)::int from dados d where d.chave = 'mtapp:ptStudio'
      union all select 'Clube de vantagens', count(*) filter (where blob_qtd(d.valor->'parcerias') > 0)::int from dados d where d.chave = 'mtapp:ptStudio'
      union all select 'Desafio da turma', count(*) filter (where blob_qtd(d.valor->'desafios') > 0)::int from dados d where d.chave = 'mtapp:ptStudio'
      union all select 'Questionários', count(*) filter (where blob_qtd(d.valor->'questPerguntas') > 0)::int from dados d where d.chave = 'mtapp:ptStudio'
      union all select 'Pacotes de serviço', count(*) filter (where blob_qtd(d.valor->'servicosPT') > 0)::int from dados d where d.chave = 'mtapp:ptStudio'
      union all select 'Comunidade (feed)', count(*) filter (where d.valor->'config'->>'feedOn' = 'true')::int from dados d where d.chave = 'mtapp:ptStudio'
      union all select 'App do aluno publicado', (select count(distinct academia_id) from app_aluno where revogado_em is null)::int
      union all select 'Aluno abriu o app', (select count(distinct academia_id) from app_aluno where revogado_em is null and retorno is not null and retorno <> '{}'::jsonb)::int
      union all select 'Chat com o aluno', (select count(distinct academia_id) from app_chat)::int
      union all select 'Check-in da semana', (select count(distinct academia_id) from app_checkin)::int
      union all select 'Push no celular do aluno', (select count(distinct academia_id) from push_subs where token not like 'prof:%')::int
      union all select 'WhatsApp oficial ligado', (select count(*) from zap_config where token is not null and token <> '')::int
      union all select 'Gateway próprio de pagamento', (select count(*) from pag_config where chave is not null and chave <> '')::int
      union all select 'Matrícula pela Minha página', (select count(distinct academia_id) from matriculas_online)::int
      union all select 'Chamado de suporte aberto', (select count(distinct academia_id) from suporte_chamados)::int
    ) r), '[]'::json)
  );
end;
$$;
grant execute on function public.hq_uso() to authenticated;

-- ============================================================
-- TRAVA DO TESTE VENCIDO E ACESSO VITALÍCIO (v761)
-- ============================================================
-- O teste dura 14 dias e, até aqui, vencer não fazia NADA: a tela mostrava uma
-- faixa e o professor seguia usando pra sempre. Agora o SERVIDOR decide se está
-- travado (campo `travado` da minha_assinatura) e o painel só obedece. Decidir
-- no servidor importa porque o relógio do aparelho é do usuário: mudar a data
-- do celular não destrava nada.
--
-- Carência de 3 DIAS depois do fim do teste (dias 15, 16 e 17 ainda passam).
-- Trava a partir do dia 18. Os dois números ficam em assinatura_regras, pra
-- mudar a política sem republicar nada.
--
-- 'vitalicia' é o acesso permanente de cortesia: nunca trava, nunca recebe
-- e-mail de teste (a regua_pendentes filtra por 'trial') e o painel diz isso
-- com todas as letras em vez de fingir que é assinatura paga.
--
-- ⚠️ O painel FALHA ABERTO: só trava quando esta função DISSE que está travado.
-- Sem internet, com SQL antigo ou com a RPC fora do ar, ninguém trava.

create table if not exists public.assinatura_regras (
  id int primary key default 1,
  dias_teste int not null default 14,
  dias_carencia int not null default 3,
  constraint assinatura_regras_uma_linha check (id = 1)
);
insert into public.assinatura_regras (id) values (1) on conflict (id) do nothing;
alter table public.assinatura_regras enable row level security;
revoke all on public.assinatura_regras from anon, authenticated;

create or replace function public.minha_assinatura()
returns jsonb
language sql security definer stable
set search_path = public
as $$
  select jsonb_build_object(
    'status', a.assinatura_status,
    'via', a.assinatura_via,
    'vence', a.assinatura_vence,
    'academia_id', a.id,
    'dia_do_teste', (floor(extract(epoch from now() - a.criada) / 86400)::int + 1),
    'dias_de_teste', r.dias_teste,
    'dias_carencia', r.dias_carencia,
    'dias_ate_travar', case
      when a.assinatura_status in ('ativa', 'vitalicia') then null
      else greatest(0, (r.dias_teste + r.dias_carencia)
                       - (floor(extract(epoch from now() - a.criada) / 86400)::int + 1)) end,
    'travado', case
      when a.assinatura_status in ('ativa', 'vitalicia') then false
      when a.assinatura_status = 'trial'
        then (floor(extract(epoch from now() - a.criada) / 86400)::int + 1)
             > (r.dias_teste + r.dias_carencia)
      when a.assinatura_status = 'atrasada' then false
      else true end
  )
  from public.academias a
  cross join (select dias_teste, dias_carencia from public.assinatura_regras where id = 1) r
  where a.id in (select public.minhas_academias())
  order by a.criada
  limit 1
$$;
grant execute on function public.minha_assinatura() to authenticated;

-- O VITALÍCIO É GRUDADO (v762). A promessa "nunca trava" era falsa: DOIS
-- caminhos escreviam assinatura_status por cima sem saber do vitalício —
-- (1) hq_cliente_set, ao classificar o cliente como pausado/cancelado na lista
-- do HQ, e (2) assinatura-loja, o webhook do RevenueCat, que grava o status que
-- vier da loja (bastava o professor instalar o app e chegar um evento de
-- expiração). Em vez de consertar os dois — e o terceiro que alguém escrever
-- ano que vem —, a trava mora no BANCO: um gatilho devolve 'vitalicia' pro
-- lugar, venha a escrita de onde vier.
--
-- Ele NÃO levanta exceção de propósito: o webhook da loja precisa responder
-- 200, senão o RevenueCat reenvia o evento por horas. O resto da linha (via,
-- referência) grava normalmente; só o status e o vencimento voltam.
create or replace function public.academias_protege_vitalicio()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.assinatura_status = 'vitalicia'
     and new.assinatura_status is distinct from 'vitalicia'
     and coalesce(current_setting('app.vitalicio_ok', true), '') <> '1' then
    new.assinatura_status := 'vitalicia';
    new.assinatura_vence := null;
  end if;
  return new;
end;
$$;
revoke execute on function public.academias_protege_vitalicio() from public, anon, authenticated;

drop trigger if exists academias_vitalicio_grudado on public.academias;
create trigger academias_vitalicio_grudado
  before update on public.academias
  for each row execute function public.academias_protege_vitalicio();

-- o ÚNICO caminho que TIRA o vitalício: avisa o gatilho antes de escrever
create or replace function public.hq_vitalicio(p_academia uuid, p_ligar boolean)
returns json
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (select 1 from saas_admins where user_id = auth.uid()) then
    raise exception 'acesso restrito ao administrador do TORQUE ON';
  end if;
  if not p_ligar then perform set_config('app.vitalicio_ok', '1', true); end if;
  update academias
     set assinatura_status = case when p_ligar then 'vitalicia' else 'trial' end,
         assinatura_vence  = case when p_ligar then null else assinatura_vence end
   where id = p_academia;
  return json_build_object('ok', true, 'vitalicia', p_ligar);
end;
$$;
grant execute on function public.hq_vitalicio(uuid, boolean) to authenticated;

-- Revisão web: integrações exclusivas do dono e funções internas sem acesso público.
CREATE OR REPLACE FUNCTION public.zap_config_apaga()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  delete from public.zap_config where academia_id in (select academia_id from public.membros where user_id = auth.uid() and papel = 'dono');
  return jsonb_build_object('ok', true);
end
$function$;
revoke execute on function public.zap_config_apaga() from public, anon;
grant execute on function public.zap_config_apaga() to authenticated;

CREATE OR REPLACE FUNCTION public.zap_config_salva(p_phone_id text, p_token text, p_template text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare aid uuid;
begin
  select academia_id into aid from public.membros where user_id = auth.uid() and papel = 'dono' order by criado limit 1;
  if aid is null then
    return jsonb_build_object('erro', 'Somente o dono pode configurar esta integração.');
  end if;
  insert into public.zap_config (academia_id, phone_id, token, template, atualizado)
  values (aid, coalesce(p_phone_id, ''), coalesce(p_token, ''), coalesce(p_template, ''), now())
  on conflict (academia_id) do update
    set phone_id = excluded.phone_id,
        token = case when coalesce(excluded.token, '') = '' then zap_config.token else excluded.token end,
        template = excluded.template,
        atualizado = now();
  return jsonb_build_object('ok', true);
end
$function$;
revoke execute on function public.zap_config_salva(text,text,text) from public, anon;
grant execute on function public.zap_config_salva(text,text,text) to authenticated;

CREATE OR REPLACE FUNCTION public.pag_config_ve()
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select json_build_object('ok', true, 'provedor', p.provedor, 'tem_chave', true, 'comissao', p.comissao_pct,
                              'webhook_token', coalesce(p.webhook_token, ''), 'academia_id', p.academia_id)
       from pag_config p
      where p.academia_id in (select academia_id from membros where user_id = auth.uid() and papel = 'dono')
      limit 1),
    json_build_object('ok', true, 'tem_chave', false))
$function$;
revoke execute on function public.pag_config_ve() from public, anon;
grant execute on function public.pag_config_ve() to authenticated;

CREATE OR REPLACE FUNCTION public.pag_config_apaga()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_acad uuid;
begin
  select academia_id into v_acad from membros where user_id = auth.uid() and papel = 'dono' order by criado limit 1;
  if v_acad is null then return json_build_object('erro', 'somente o dono pode configurar esta integração'); end if;
  delete from pag_config where academia_id = v_acad;
  return json_build_object('ok', true);
end $function$;
revoke execute on function public.pag_config_apaga() from public, anon;
grant execute on function public.pag_config_apaga() to authenticated;

CREATE OR REPLACE FUNCTION public.pag_config_salva(p_provedor text, p_chave text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_acad uuid;
begin
  select academia_id into v_acad from membros where user_id = auth.uid() and papel = 'dono' order by criado limit 1;
  if v_acad is null then return json_build_object('erro', 'somente o dono pode configurar esta integração'); end if;
  if p_provedor not in ('mercadopago', 'asaas', 'pagarme') then
    return json_build_object('erro', 'provedor desconhecido');
  end if;
  if coalesce(trim(p_chave), '') = '' then
    update pag_config set provedor = p_provedor, atualizado = now() where academia_id = v_acad;
    if not found then return json_build_object('erro', 'cole a chave do gateway'); end if;
    return json_build_object('ok', true);
  end if;
  insert into pag_config (academia_id, provedor, chave, webhook_token)
    values (v_acad, p_provedor, trim(p_chave), public.pag_token_novo())
    on conflict (academia_id) do update
      set provedor = excluded.provedor, chave = excluded.chave, atualizado = now(),
          webhook_token = case when coalesce(pag_config.webhook_token, '') = ''
                               then public.pag_token_novo() else pag_config.webhook_token end,
          asaas_webhook_id = case when pag_config.chave is distinct from excluded.chave
                                  then '' else pag_config.asaas_webhook_id end;
  return json_build_object('ok', true);
end $function$;
revoke execute on function public.pag_config_salva(text,text) from public, anon;
grant execute on function public.pag_config_salva(text,text) to authenticated;

CREATE OR REPLACE FUNCTION public.zap_config_ve()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select jsonb_build_object(
              'phone_id', z.phone_id,
              'template', z.template,
              'tem_token', length(coalesce(z.token, '')) > 0,
              'verify_token', coalesce(z.verify_token, ''),
              'ig_id', coalesce(z.ig_id, ''),
              'tem_app_secret', length(coalesce(z.app_secret, '')) > 0,
              'tem_ig_token', length(coalesce(z.ig_token, '')) > 0,
              'atualizado', z.atualizado)
       from public.zap_config z
      where z.academia_id in (select academia_id from public.membros where user_id = auth.uid() and papel = 'dono')
      limit 1),
    jsonb_build_object('phone_id', '', 'template', '', 'tem_token', false,
                       'verify_token', '', 'ig_id', '', 'tem_app_secret', false, 'tem_ig_token', false));
$function$;
revoke execute on function public.zap_config_ve() from public, anon;
grant execute on function public.zap_config_ve() to authenticated;

CREATE OR REPLACE FUNCTION public.zap_config_salva2(p_phone_id text, p_token text, p_template text, p_app_secret text, p_ig_id text, p_ig_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare aid uuid; vt text;
begin
  select academia_id into aid from public.membros where user_id = auth.uid() and papel = 'dono' order by criado limit 1;
  if aid is null then
    return jsonb_build_object('erro', 'Somente o dono pode configurar esta integração.');
  end if;
  insert into public.zap_config (academia_id, phone_id, token, template, app_secret, ig_id, ig_token, verify_token, atualizado)
  values (aid, coalesce(p_phone_id, ''), coalesce(p_token, ''), coalesce(p_template, ''),
          coalesce(p_app_secret, ''), coalesce(p_ig_id, ''), coalesce(p_ig_token, ''),
          public.zap_verify_novo(), now())
  on conflict (academia_id) do update
    set phone_id   = excluded.phone_id,
        token      = case when coalesce(excluded.token, '')      = '' then zap_config.token      else excluded.token      end,
        app_secret = case when coalesce(excluded.app_secret, '') = '' then zap_config.app_secret else excluded.app_secret end,
        ig_token   = case when coalesce(excluded.ig_token, '')   = '' then zap_config.ig_token   else excluded.ig_token   end,
        ig_id      = case when coalesce(excluded.ig_id, '')     = '' then zap_config.ig_id     else excluded.ig_id     end,
        template   = excluded.template,
        verify_token = case when coalesce(zap_config.verify_token, '') = ''
                            then public.zap_verify_novo() else zap_config.verify_token end,
        atualizado = now();
  select z.verify_token into vt from public.zap_config z where z.academia_id = aid;
  return jsonb_build_object('ok', true, 'verify_token', vt);
end
$function$;
revoke execute on function public.zap_config_salva2(text,text,text,text,text,text) from public, anon;
grant execute on function public.zap_config_salva2(text,text,text,text,text,text) to authenticated;

revoke execute on function public.dados_guarda_hist() from public, anon, authenticated;
revoke execute on function public.app_aluno_guarda_hist() from public, anon, authenticated;
revoke execute on function public.dados_carimba() from public, anon, authenticated;
revoke execute on function public.push_avisa_prof(uuid,text,text) from public, anon, authenticated;
revoke execute on function public.push_prof_chat() from public, anon, authenticated;
revoke execute on function public.push_prof_agenda() from public, anon, authenticated;
revoke execute on function public.academias_protege_vitalicio() from public, anon, authenticated;
grant execute on function public.push_avisa_prof(uuid,text,text) to service_role;
alter function public.blob_qtd(jsonb) set search_path = public;
revoke execute on function public.blob_qtd(jsonb) from public, anon, authenticated;

-- Limite de tentativas de login do aluno. Não guarda e-mail nem senha.
create schema if not exists torque_private;
revoke all on schema torque_private from public, anon, authenticated;
create table if not exists torque_private.aluno_login_limite (
  chave text primary key,
  inicio timestamptz not null,
  tentativas integer not null check (tentativas > 0)
);
alter table torque_private.aluno_login_limite enable row level security;
revoke all on torque_private.aluno_login_limite from public, anon, authenticated;
create index if not exists aluno_login_limite_inicio on torque_private.aluno_login_limite(inicio);

create or replace function public.aluno_login(p_login text, p_senha text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v record;
  v_login text := lower(trim(coalesce(p_login, '')));
  v_chave text;
  v_tentativas integer;
  v_agora timestamptz := clock_timestamp();
  v_hash text;
  v_ok boolean;
begin
  if length(v_login) = 0 or length(v_login) > 320 or octet_length(coalesce(p_senha,'')) > 1024 then
    return json_build_object('erro', 'Login ou senha incorretos. Esqueceu? Peça um link novo à sua academia ou personal.');
  end if;
  v_chave := encode(digest(v_login, 'sha256'), 'hex');
  delete from torque_private.aluno_login_limite where inicio < v_agora - interval '15 minutes';
  -- O conflito trava a linha: chamadas simultâneas também respeitam o limite.
  insert into torque_private.aluno_login_limite as l(chave,inicio,tentativas)
    values(v_chave,v_agora,1)
    on conflict(chave) do update set tentativas=least(l.tentativas+1,11)
    returning tentativas into v_tentativas;
  if v_tentativas > 10 then
    return json_build_object('erro','Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.','aguarde_segundos',900);
  end if;
  select token,senha into v from public.app_aluno
    where lower(login)=v_login and login<>'' and revogado_em is null;
  -- Uma comparação bcrypt também para login inexistente; mesma resposta de erro.
  v_hash := coalesce(nullif(v.senha,''),'$2a$06$YWfGhHHVrrPgPdAzjyZrEOeZTFRH0FqAkT.ExTx/4D/zZGceZBtEC');
  v_ok := crypt(coalesce(p_senha,''),v_hash)=v_hash;
  if v.token is null or coalesce(v.senha,'')='' or not v_ok then
    return json_build_object('erro', 'Login ou senha incorretos. Esqueceu? Peça um link novo à sua academia ou personal.');
  end if;
  delete from torque_private.aluno_login_limite where chave=v_chave;
  return json_build_object('ok',true,'token',v.token);
end;
$$;
revoke execute on function public.aluno_login(text,text) from public;
grant execute on function public.aluno_login(text,text) to anon,authenticated;

-- A política não pode consultar membros diretamente dentro da própria RLS.
create schema if not exists torque_private;
revoke all on schema torque_private from public, anon;
grant usage on schema torque_private to authenticated;
create or replace function torque_private.academias_do_dono()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select m.academia_id from public.membros m
  where m.user_id = (select auth.uid()) and m.papel = 'dono'
$$;
revoke all on function torque_private.academias_do_dono() from public, anon;
grant execute on function torque_private.academias_do_dono() to authenticated;
drop policy if exists membros_dono_remove on public.membros;
create policy membros_dono_remove on public.membros
for delete to authenticated using (
  papel <> 'dono' and academia_id in (select torque_private.academias_do_dono())
);

-- mt-v806: diário alimentar integrado, privado por token e independente dos retornos de treino.
-- O token continua sendo a credencial do app. Nenhuma tabela é aberta ao aluno.
-- Dados antigos e outros módulos não são regravados pela mescla de nutrição.

create or replace function public.app_nutricao_registro_valido(r jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare it jsonb; k text; n numeric; stamp timestamptz; dia date;
begin
  if r is null or jsonb_typeof(r) <> 'object' or octet_length(r::text) > 140000 then return false; end if;
  if coalesce(r->>'id','') !~ '^[A-Za-z0-9:_-]+$' or length(r->>'id') > 300
     or r->>'id' in ('__proto__','prototype','constructor') then return false; end if;
  if coalesce(r->>'d','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     or coalesce(r->>'atualizadoEm','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' then return false; end if;
  dia := (r->>'d')::date; stamp := (r->>'atualizadoEm')::timestamptz;
  if not isfinite(dia) or not isfinite(stamp) or length(r->>'atualizadoEm') > 40 then return false; end if;
  if jsonb_typeof(r->'apagado') is distinct from 'boolean'
     or length(coalesce(r->>'titulo','')) > 120
     or length(coalesce(r->>'refeicaoId','')) > 100
     or length(coalesce(r->>'observacao','')) > 2000 then return false; end if;
  if coalesce(r->>'hora','') <> '' and (r->>'hora') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return false; end if;
  if coalesce(r->>'origem','') not in ('plano','manual','foto') then return false; end if;
  if jsonb_typeof(r->'itens') is distinct from 'array' then return false; end if;
  if jsonb_array_length(r->'itens') > 100
     or (r->>'apagado' = 'false' and jsonb_array_length(r->'itens') = 0
         and btrim(coalesce(r->>'titulo','')) = '' and coalesce(r->>'foto','') = '') then return false; end if;
  if length(coalesce(r->>'foto','')) > 60000 then return false; end if;
  if coalesce(r->>'foto','') <> '' and (r->>'foto') !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$' then return false; end if;
  for it in select value from jsonb_array_elements(r->'itens') loop
    if jsonb_typeof(it) <> 'object' or nullif(trim(it->>'nome'),'') is null
       or length(it->>'nome') > 200 or length(coalesce(it->>'porcao','')) > 100 then return false; end if;
    foreach k in array array['qtd','k','pt','cb','g'] loop
      if jsonb_typeof(it->k) is distinct from 'number' then return false; end if;
      n := (it->>k)::numeric;
      if n < 0 or n > 100000 or (k='qtd' and (n<=0 or n>1000)) then return false; end if;
    end loop;
  end loop;
  return true;
exception when invalid_datetime_format or datetime_field_overflow or invalid_text_representation or numeric_value_out_of_range then
  return false;
end $$;
revoke all on function public.app_nutricao_registro_valido(jsonb) from public, anon, authenticated;

create or replace function public.app_nutricao_mescla(velho jsonb, novos jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare registros jsonb; r jsonb; anterior jsonb;
begin
  registros := case when jsonb_typeof(velho->'registros')='object' then velho->'registros' else '{}'::jsonb end;
  for r in select value from jsonb_array_elements(novos) loop
    anterior := registros->(r->>'id');
    -- Cada registro é um snapshot indivisível. Array de alimentos nunca vira união.
    -- Empate conserva o já confirmado no servidor; nova edição deve avançar o stamp.
    if anterior is null or nullif(anterior->>'atualizadoEm','') is null
       or (r->>'atualizadoEm')::timestamptz > (anterior->>'atualizadoEm')::timestamptz then
      registros := jsonb_set(registros, array[r->>'id'], r, true);
    end if;
  end loop;
  return jsonb_build_object('v',1,'registros',registros);
end $$;
revoke all on function public.app_nutricao_mescla(jsonb,jsonb) from public, anon, authenticated;

create or replace function public.app_nutricao_estado(t text)
returns jsonb language plpgsql security definer stable set search_path = '' as $$
declare v_retorno jsonb;
begin
  if t is null or length(t)<10 or length(t)>300 then return jsonb_build_object('erro','sem_acesso'); end if;
  select retorno into v_retorno from public.app_aluno
    where token=t and revogado_em is null;
  if not found then return jsonb_build_object('erro','sem_acesso'); end if;
  return jsonb_build_object('ok',true,'nutricao',coalesce(v_retorno->'nutricaoV1',jsonb_build_object('v',1,'registros','{}'::jsonb)));
end $$;
revoke all on function public.app_nutricao_estado(text) from public;
grant execute on function public.app_nutricao_estado(text) to anon;

create or replace function public.app_nutricao_salva(t text, p_registros jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_retorno jsonb; v_dados jsonb; v_nutri jsonb; r jsonb;
begin
  if t is null or length(t)<10 or length(t)>300 then return jsonb_build_object('erro','sem_acesso'); end if;
  if p_registros is null or jsonb_typeof(p_registros)<>'array' then
    return jsonb_build_object('erro','Registros inválidos.'); end if;
  if jsonb_array_length(p_registros)<1 or jsonb_array_length(p_registros)>20 or octet_length(p_registros::text)>500000 then
    return jsonb_build_object('erro','Envie menos registros por vez.'); end if;
  for r in select value from jsonb_array_elements(p_registros) loop
    if not public.app_nutricao_registro_valido(r) then
      return jsonb_build_object('erro','Confira os alimentos, a data e o tamanho da foto antes de salvar.'); end if;
    if (r->>'atualizadoEm')::timestamptz > now()+interval '5 minutes' then
      return jsonb_build_object('erro','Ajuste a data e a hora do aparelho e tente novamente.'); end if;
  end loop;
  -- Trava apenas a linha do token: envios concorrentes conservam registros distintos.
  select retorno,dados into v_retorno,v_dados from public.app_aluno
    where token=t and revogado_em is null for update;
  if not found then return jsonb_build_object('erro','sem_acesso'); end if;
  if coalesce(v_dados#>>'{dados,nutricaoApp,ativo}','false')<>'true' then
    return jsonb_build_object('erro','O acompanhamento alimentar ainda não está disponível neste app.'); end if;
  v_nutri := public.app_nutricao_mescla(v_retorno->'nutricaoV1',p_registros);
  if octet_length(v_nutri::text)>3000000 then
    return jsonb_build_object('erro','O diário está cheio. Remova fotos antigas para liberar espaço; os registros atuais continuam guardados.'); end if;
  if jsonb_typeof(v_retorno) is distinct from 'object' then v_retorno := '{}'::jsonb; end if;
  update public.app_aluno set retorno=jsonb_set(v_retorno,'{nutricaoV1}',v_nutri,true),atualizado=now()
    where token=t and revogado_em is null;
  return jsonb_build_object('ok',true,'nutricao',v_nutri);
end $$;
revoke all on function public.app_nutricao_salva(text,jsonb) from public;
grant execute on function public.app_nutricao_salva(text,jsonb) to anon;

-- ==================== ONBOARDING DA CONSULTORIA ====================
-- Entrada opcional da consultoria: questionário + contrato versionado e imutável.
-- O aluno escreve somente pela RPC validada com o token do próprio app.

create table if not exists public.app_consultoria_aceites (
  id uuid primary key default gen_random_uuid(),
  academia_id uuid not null references public.academias(id) on delete cascade,
  token text not null references public.app_aluno(token) on delete cascade,
  versao text not null,
  respostas jsonb not null default '[]'::jsonb,
  dados jsonb not null default '{}'::jsonb,
  assinatura jsonb not null default '{}'::jsonb,
  config_snapshot jsonb not null,
  evidencia jsonb not null default '{}'::jsonb,
  documento_hash text not null,
  aceito_em timestamptz not null default clock_timestamp(),
  unique (token, versao),
  check (versao ~ '^oc-[a-f0-9]{16}$'),
  check (jsonb_typeof(respostas) = 'array' and jsonb_array_length(respostas) <= 30),
  check (jsonb_typeof(dados) = 'object'),
  check (jsonb_typeof(assinatura) = 'object'),
  check (octet_length(respostas::text) <= 60000),
  check (octet_length(dados::text) <= 16000),
  check (octet_length(assinatura::text) <= 150000),
  check (octet_length(config_snapshot::text) <= 100000),
  check (documento_hash ~ '^[a-f0-9]{64}$')
);

create index if not exists app_consultoria_aceites_academia_data
  on public.app_consultoria_aceites (academia_id, aceito_em desc);
create index if not exists app_consultoria_aceites_token_data
  on public.app_consultoria_aceites (token, aceito_em desc);

alter table public.app_consultoria_aceites enable row level security;
revoke all on table public.app_consultoria_aceites from public, anon, authenticated;
grant select on table public.app_consultoria_aceites to authenticated;

drop policy if exists "app_consultoria_aceites_membros_leem" on public.app_consultoria_aceites;
create policy "app_consultoria_aceites_membros_leem" on public.app_consultoria_aceites
  for select to authenticated
  using (academia_id in (select public.minhas_academias()));

create or replace function public.app_consultoria_estado(t text, p_versao text)
returns jsonb
language plpgsql security definer stable
set search_path = public
as $$
declare
  v_acad uuid;
  v_row public.app_consultoria_aceites%rowtype;
begin
  v_acad := public.app_aluno_ativo(t);
  if v_acad is null then
    return jsonb_build_object('erro', 'sem_acesso');
  end if;
  if p_versao is null or p_versao !~ '^oc-[a-f0-9]{16}$' then
    return jsonb_build_object('erro', 'versao_invalida');
  end if;
  select * into v_row from public.app_consultoria_aceites
    where token = t and academia_id = v_acad and versao = p_versao
    limit 1;
  return jsonb_build_object(
    'ok', true,
    'concluido', v_row.id is not null,
    'id', v_row.id,
    'aceito_em', v_row.aceito_em,
    'documento_hash', v_row.documento_hash
  );
end;
$$;

create or replace function public.app_consultoria_conclui(
  t text,
  p_versao text,
  p_respostas jsonb,
  p_dados jsonb,
  p_assinatura jsonb,
  p_cliente jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_acad uuid;
  v_pacote jsonb;
  v_cfg jsonb;
  v_perguntas jsonb;
  v_q jsonb;
  v_r jsonb;
  v_respostas jsonb := '[]'::jsonb;
  v_dados jsonb;
  v_assinatura jsonb;
  v_evidencia jsonb;
  v_hash text;
  v_ip text;
  v_headers jsonb := '{}'::jsonb;
  v_contrato boolean;
  v_modo text;
  v_nascimento date;
  v_cpf text;
  v_soma integer;
  v_d1 integer;
  v_d2 integer;
  v_row public.app_consultoria_aceites%rowtype;
begin
  if t is null or length(t) < 10 then
    return jsonb_build_object('erro', 'sem_acesso');
  end if;
  select academia_id, dados into v_acad, v_pacote
    from public.app_aluno where token = t and revogado_em is null
    for share;
  if v_acad is null then
    return jsonb_build_object('erro', 'sem_acesso');
  end if;
  if p_versao is null or p_versao !~ '^oc-[a-f0-9]{16}$' then
    return jsonb_build_object('erro', 'versao_invalida');
  end if;

  v_cfg := v_pacote #> '{dados,onboardingApp}';
  if v_cfg is null or jsonb_typeof(v_cfg) <> 'object'
     or v_cfg->>'ativo' <> 'true' or v_cfg->>'v' <> p_versao then
    return jsonb_build_object('erro', 'onboarding_desatualizado');
  end if;
  v_perguntas := coalesce(v_cfg->'perguntas', '[]'::jsonb);
  if jsonb_typeof(v_perguntas) <> 'array' or jsonb_array_length(v_perguntas) > 30
     or p_respostas is null or jsonb_typeof(p_respostas) <> 'array'
     or jsonb_array_length(p_respostas) <> jsonb_array_length(v_perguntas)
     or octet_length(p_respostas::text) > 60000 then
    return jsonb_build_object('erro', 'respostas_invalidas');
  end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' or octet_length(p_dados::text) > 16000
     or p_assinatura is null or jsonb_typeof(p_assinatura) <> 'object' or octet_length(p_assinatura::text) > 150000
     or p_cliente is null or jsonb_typeof(p_cliente) <> 'object' or octet_length(p_cliente::text) > 2000 then
    return jsonb_build_object('erro', 'conteudo_invalido');
  end if;

  for v_q in select value from jsonb_array_elements(v_perguntas) loop
    select value into v_r from jsonb_array_elements(p_respostas)
      where value->>'id' = v_q->>'id' limit 1;
    if v_r is null or length(trim(coalesce(v_r->>'resposta', ''))) = 0
       or length(coalesce(v_r->>'resposta', '')) > 1000
       or length(coalesce(v_r->>'pergunta', '')) > 500 then
      return jsonb_build_object('erro', 'resposta_obrigatoria', 'pergunta', v_q->>'id');
    end if;
    v_respostas := v_respostas || jsonb_build_array(jsonb_build_object(
      'id', left(v_q->>'id', 100),
      'pergunta', left(v_q->>'texto', 500),
      'resposta', left(v_r->>'resposta', 1000),
      'pontos', case when jsonb_typeof(v_r->'pontos') = 'number' then v_r->'pontos' else 'null'::jsonb end
    ));
    v_r := null;
  end loop;

  v_contrato := coalesce(v_cfg #>> '{contrato,ativo}', 'false') = 'true';
  v_modo := coalesce(v_cfg #>> '{contrato,modo}', 'aceite');
  v_dados := jsonb_build_object(
    'nome', left(trim(coalesce(p_dados->>'nome', '')), 160),
    'nacionalidade', left(trim(coalesce(p_dados->>'nacionalidade', '')), 80),
    'estadoCivil', left(trim(coalesce(p_dados->>'estadoCivil', '')), 80),
    'profissao', left(trim(coalesce(p_dados->>'profissao', '')), 120),
    'rg', left(trim(coalesce(p_dados->>'rg', '')), 40),
    'rgOrgao', left(trim(coalesce(p_dados->>'rgOrgao', '')), 40),
    'cpf', left(trim(coalesce(p_dados->>'cpf', '')), 30),
    'nascimento', left(trim(coalesce(p_dados->>'nascimento', '')), 10),
    'email', left(trim(coalesce(p_dados->>'email', '')), 160),
    'telefone', left(trim(coalesce(p_dados->>'telefone', '')), 30),
    'cep', left(trim(coalesce(p_dados->>'cep', '')), 12),
    'logradouro', left(trim(coalesce(p_dados->>'logradouro', '')), 300),
    'numero', left(trim(coalesce(p_dados->>'numero', '')), 30),
    'complemento', left(trim(coalesce(p_dados->>'complemento', '')), 120),
    'bairro', left(trim(coalesce(p_dados->>'bairro', '')), 120),
    'cidade', left(trim(coalesce(p_dados->>'cidade', '')), 120),
    'uf', upper(left(trim(coalesce(p_dados->>'uf', '')), 2)),
    'responsavelNome', left(trim(coalesce(p_dados->>'responsavelNome', '')), 160),
    'responsavelCpf', left(trim(coalesce(p_dados->>'responsavelCpf', '')), 30)
  );
  v_assinatura := jsonb_build_object(
    'aceitou', coalesce(p_assinatura->>'aceitou', 'false') = 'true',
    'consentimentoSaude', coalesce(p_assinatura->>'consentimentoSaude', 'false') = 'true',
    'nome', left(trim(coalesce(p_assinatura->>'nome', '')), 160),
    'imagem', case when coalesce(p_assinatura->>'imagem', '') ~ '^data:image/png;base64,[A-Za-z0-9+/=]+$'
                    and length(p_assinatura->>'imagem') <= 140000 then p_assinatura->>'imagem' else '' end
  );

  if jsonb_array_length(v_perguntas) > 0 and v_assinatura->>'consentimentoSaude' <> 'true' then
    return jsonb_build_object('erro', 'consentimento_necessario');
  end if;
  if v_contrato then
    v_cpf := regexp_replace(v_dados->>'cpf', '\D', '', 'g');
    if length(v_dados->>'nome') < 3 or length(v_dados->>'nacionalidade') < 3
       or length(v_dados->>'estadoCivil') < 3 or length(v_dados->>'profissao') < 2
       or length(v_dados->>'rg') < 3 or length(v_dados->>'rgOrgao') < 2
       or length(v_cpf) <> 11 or v_cpf ~ '^(\d)\1{10}$'
       or (v_dados->>'nascimento') !~ '^\d{4}-\d{2}-\d{2}$'
       or (v_dados->>'email') !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
       or length(regexp_replace(v_dados->>'telefone', '\D', '', 'g')) < 10
       or length(regexp_replace(v_dados->>'cep', '\D', '', 'g')) <> 8
       or length(v_dados->>'logradouro') < 3 or length(v_dados->>'numero') < 1
       or length(v_dados->>'bairro') < 2 or length(v_dados->>'cidade') < 2
       or (v_dados->>'uf') !~ '^[A-Z]{2}$' then
      return jsonb_build_object('erro', 'dados_contratuais_incompletos');
    end if;
    select sum(substring(v_cpf from i for 1)::integer * (11 - i))
      into v_soma from generate_series(1, 9) as i;
    v_d1 := case when 11 - (v_soma % 11) >= 10 then 0 else 11 - (v_soma % 11) end;
    select sum(substring(v_cpf from i for 1)::integer * (12 - i))
      into v_soma from generate_series(1, 10) as i;
    v_d2 := case when 11 - (v_soma % 11) >= 10 then 0 else 11 - (v_soma % 11) end;
    if v_d1 <> substring(v_cpf from 10 for 1)::integer
       or v_d2 <> substring(v_cpf from 11 for 1)::integer then
      return jsonb_build_object('erro', 'cpf_invalido');
    end if;
    begin
      v_nascimento := (v_dados->>'nascimento')::date;
    exception when others then
      return jsonb_build_object('erro', 'nascimento_invalido');
    end;
    if v_nascimento > current_date or v_nascimento < date '1900-01-01' then
      return jsonb_build_object('erro', 'nascimento_invalido');
    end if;
    if v_nascimento > current_date - interval '18 years' then
      v_cpf := regexp_replace(v_dados->>'responsavelCpf', '\D', '', 'g');
      if length(v_dados->>'responsavelNome') < 3 or length(v_cpf) <> 11 or v_cpf ~ '^(\d)\1{10}$' then
        return jsonb_build_object('erro', 'responsavel_legal_necessario');
      end if;
      select sum(substring(v_cpf from i for 1)::integer * (11 - i)) into v_soma from generate_series(1, 9) as i;
      v_d1 := case when 11 - (v_soma % 11) >= 10 then 0 else 11 - (v_soma % 11) end;
      select sum(substring(v_cpf from i for 1)::integer * (12 - i)) into v_soma from generate_series(1, 10) as i;
      v_d2 := case when 11 - (v_soma % 11) >= 10 then 0 else 11 - (v_soma % 11) end;
      if v_d1 <> substring(v_cpf from 10 for 1)::integer or v_d2 <> substring(v_cpf from 11 for 1)::integer then
        return jsonb_build_object('erro', 'responsavel_legal_necessario');
      end if;
    end if;
    if v_assinatura->>'aceitou' <> 'true' or length(v_assinatura->>'nome') < 3 then
      return jsonb_build_object('erro', 'aceite_necessario');
    end if;
    if v_modo = 'assinatura' and length(v_assinatura->>'imagem') < 100 then
      return jsonb_build_object('erro', 'assinatura_necessaria');
    end if;
    if length(coalesce(v_cfg #>> '{contrato,prestador,nome}', '')) < 3
       or length(coalesce(v_cfg #>> '{contrato,prestador,documento}', '')) < 11
       or length(coalesce(v_cfg #>> '{contrato,prestador,endereco}', '')) < 5
       or length(coalesce(v_cfg #>> '{contrato,prestador,email}', '')) < 5
       or length(regexp_replace(coalesce(v_cfg #>> '{contrato,prestador,telefone}', ''), '\D', '', 'g')) < 10
       or length(coalesce(v_cfg #>> '{contrato,texto}', '')) < 300 then
      return jsonb_build_object('erro', 'contrato_incompleto');
    end if;
  end if;

  begin
    v_headers := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  exception when others then
    v_headers := '{}'::jsonb;
  end;
  v_ip := left(coalesce(v_headers->>'cf-connecting-ip', split_part(v_headers->>'x-forwarded-for', ',', 1), ''), 80);
  v_evidencia := jsonb_build_object(
    'agente', left(coalesce(p_cliente->>'agente', ''), 300),
    'idioma', left(coalesce(p_cliente->>'idioma', ''), 20),
    'rede_hash', encode(digest(convert_to(coalesce(v_ip, '') || ':' || t, 'UTF8'), 'sha256'), 'hex'),
    'registrado_pelo_servidor', true
  );
  v_hash := encode(digest(convert_to(jsonb_build_object(
    'versao', p_versao, 'config', v_cfg, 'respostas', v_respostas,
    'dados', v_dados, 'assinatura', v_assinatura
  )::text, 'UTF8'), 'sha256'), 'hex');

  insert into public.app_consultoria_aceites
    (academia_id, token, versao, respostas, dados, assinatura, config_snapshot, evidencia, documento_hash)
  values
    (v_acad, t, p_versao, v_respostas, v_dados, v_assinatura, v_cfg, v_evidencia, v_hash)
  on conflict (token, versao) do nothing;

  select * into v_row from public.app_consultoria_aceites
    where token = t and versao = p_versao and academia_id = v_acad limit 1;
  return jsonb_build_object(
    'ok', true, 'id', v_row.id, 'aceito_em', v_row.aceito_em,
    'documento_hash', v_row.documento_hash, 'ja_existia', v_row.documento_hash <> v_hash
  );
end;
$$;

revoke all on function public.app_consultoria_estado(text, text) from public, authenticated;
revoke all on function public.app_consultoria_conclui(text, text, jsonb, jsonb, jsonb, jsonb) from public, authenticated;
grant execute on function public.app_consultoria_estado(text, text) to anon;
grant execute on function public.app_consultoria_conclui(text, text, jsonb, jsonb, jsonb, jsonb) to anon;


-- ==================== MIGRATION 20260909190000 ====================
-- Integridade do contrato e isolamento dos retornos especializados.
-- O texto que o aluno leu passa a ser canônico, imutável e verificável.

alter table public.app_consultoria_aceites
  add column if not exists documento_texto text,
  add column if not exists snapshot_hash text,
  add column if not exists assinatura_hash text,
  add column if not exists conteudo_hash text;

-- O aceite precisa sobreviver à remoção do link/app do aluno. A academia ainda
-- é a responsável pelo ciclo de retenção e continua protegida por RLS.
alter table public.app_consultoria_aceites
  drop constraint if exists app_consultoria_aceites_token_fkey;

create or replace function public.app_consultoria_cpf_valido(p_cpf text)
returns boolean
language plpgsql immutable
set search_path = public
as $$
declare
  c text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  s integer;
  d1 integer;
  d2 integer;
begin
  if length(c) <> 11 or c ~ '^(\d)\1{10}$' then return false; end if;
  select sum(substring(c from i for 1)::integer * (11 - i)) into s from generate_series(1, 9) as i;
  d1 := case when 11 - (s % 11) >= 10 then 0 else 11 - (s % 11) end;
  select sum(substring(c from i for 1)::integer * (12 - i)) into s from generate_series(1, 10) as i;
  d2 := case when 11 - (s % 11) >= 10 then 0 else 11 - (s % 11) end;
  return d1 = substring(c from 10 for 1)::integer and d2 = substring(c from 11 for 1)::integer;
end;
$$;

create or replace function public.app_consultoria_documento(
  p_modelo text,
  p_cfg jsonb,
  p_dados jsonb
)
returns text
language plpgsql immutable
set search_path = public
as $$
declare
  v_doc text := coalesce(p_modelo, '');
  v_endereco text;
  v_cidade_uf text;
  v_inicio text;
  v_nascimento text;
  v_valor text := 'conforme combinado';
  v_rep text := '';
  v_tinha_rep boolean := position('{{representante_legal}}' in coalesce(p_modelo, '')) > 0;
  v_num numeric;
  v_valores jsonb := '{}'::jsonb;
  v_match text[];
  v_resto text;
  v_pos integer;
begin
  v_cidade_uf := case
    when coalesce(p_dados->>'cidade','') <> '' and coalesce(p_dados->>'uf','') <> '' then (p_dados->>'cidade') || '/' || (p_dados->>'uf')
    else coalesce(p_dados->>'cidade', p_dados->>'uf', '')
  end;
  v_endereco := concat_ws(', ',
    nullif(p_dados->>'logradouro',''), nullif(p_dados->>'numero',''),
    nullif(p_dados->>'complemento',''), nullif(p_dados->>'bairro',''),
    nullif(v_cidade_uf,''), case when coalesce(p_dados->>'cep','') <> '' then 'CEP ' || (p_dados->>'cep') end
  );
  v_nascimento := case when coalesce(p_dados->>'nascimento','') ~ '^\d{4}-\d{2}-\d{2}$'
    then substring(p_dados->>'nascimento' from 9 for 2) || '/' || substring(p_dados->>'nascimento' from 6 for 2) || '/' || substring(p_dados->>'nascimento' from 1 for 4)
    else coalesce(p_dados->>'nascimento','') end;
  v_inicio := case when coalesce(p_cfg #>> '{contrato,plano,inicio}','') ~ '^\d{4}-\d{2}-\d{2}$'
    then substring(p_cfg #>> '{contrato,plano,inicio}' from 9 for 2) || '/' || substring(p_cfg #>> '{contrato,plano,inicio}' from 6 for 2) || '/' || substring(p_cfg #>> '{contrato,plano,inicio}' from 1 for 4)
    else 'a data do aceite' end;
  if jsonb_typeof(p_cfg #> '{contrato,plano,valor}') = 'number' then
    v_num := (p_cfg #>> '{contrato,plano,valor}')::numeric;
    if v_num <> 0 then v_valor := 'R$ ' || replace(to_char(v_num, 'FM999999999999990.00'), '.', ','); end if;
  end if;
  if coalesce(p_dados->>'responsavelNome','') <> '' then
    v_rep := 'REPRESENTANTE LEGAL DO CONTRATANTE: ' || (p_dados->>'responsavelNome') ||
      ', CPF ' || coalesce(nullif(p_dados->>'responsavelCpf',''),'—') ||
      ', que aceita e assina este instrumento em nome do menor.';
  end if;

  v_valores := v_valores || jsonb_build_object('aluno_nome', coalesce(nullif(p_dados->>'nome',''),'—'));
  v_valores := v_valores || jsonb_build_object('aluno_nacionalidade', coalesce(nullif(p_dados->>'nacionalidade',''),'—'));
  v_valores := v_valores || jsonb_build_object('aluno_estado_civil', coalesce(nullif(p_dados->>'estadoCivil',''),'—'));
  v_valores := v_valores || jsonb_build_object('aluno_profissao', coalesce(nullif(p_dados->>'profissao',''),'—'));
  v_valores := v_valores || jsonb_build_object('aluno_rg', coalesce(nullif(p_dados->>'rg',''),'—'));
  v_valores := v_valores || jsonb_build_object('aluno_rg_orgao', coalesce(nullif(p_dados->>'rgOrgao',''),'—'));
  v_valores := v_valores || jsonb_build_object('aluno_cpf', coalesce(nullif(p_dados->>'cpf',''),'—'));
  v_valores := v_valores || jsonb_build_object('aluno_nascimento', coalesce(nullif(v_nascimento,''),'—'));
  v_valores := v_valores || jsonb_build_object('aluno_endereco', coalesce(nullif(v_endereco,''),'—'));
  v_valores := v_valores || jsonb_build_object('aluno_email', coalesce(nullif(p_dados->>'email',''),'—'));
  v_valores := v_valores || jsonb_build_object('aluno_telefone', coalesce(nullif(p_dados->>'telefone',''),'—'));
  v_valores := v_valores || jsonb_build_object('prestador_nome', coalesce(nullif(p_cfg #>> '{contrato,prestador,nome}',''),'—'));
  v_valores := v_valores || jsonb_build_object('prestador_documento', coalesce(nullif(p_cfg #>> '{contrato,prestador,documento}',''),'—'));
  v_valores := v_valores || jsonb_build_object('prestador_endereco', coalesce(nullif(p_cfg #>> '{contrato,prestador,endereco}',''),'—'));
  v_valores := v_valores || jsonb_build_object('prestador_email', coalesce(nullif(p_cfg #>> '{contrato,prestador,email}',''),'—'));
  v_valores := v_valores || jsonb_build_object('prestador_telefone', coalesce(nullif(p_cfg #>> '{contrato,prestador,telefone}',''),'—'));
  v_valores := v_valores || jsonb_build_object('plano_nome', coalesce(nullif(p_cfg #>> '{contrato,plano,nome}',''),'consultoria'));
  v_valores := v_valores || jsonb_build_object('plano_valor', v_valor);
  v_valores := v_valores || jsonb_build_object('contrato_inicio', v_inicio);
  v_valores := v_valores || jsonb_build_object('foro_cidade', case
    when coalesce(p_cfg #>> '{contrato,prestador,cidade}','') <> '' and coalesce(p_cfg #>> '{contrato,prestador,uf}','') <> ''
      then (p_cfg #>> '{contrato,prestador,cidade}') || '/' || (p_cfg #>> '{contrato,prestador,uf}')
    else coalesce(nullif(p_cfg #>> '{contrato,prestador,cidade}',''),'cidade do contratante') end);
  v_valores := v_valores || jsonb_build_object('responsavel_nome', coalesce(nullif(p_dados->>'responsavelNome',''),'—'));
  v_valores := v_valores || jsonb_build_object('responsavel_cpf', coalesce(nullif(p_dados->>'responsavelCpf',''),'—'));
  v_valores := v_valores || jsonb_build_object('representante_legal', v_rep);
  -- Uma passagem: valores digitados não são interpretados como novos campos.
  v_resto := coalesce(p_modelo, '');
  v_doc := '';
  loop
    v_match := regexp_match(v_resto, '(\{\{([a-z_]+)\}\})');
    exit when v_match is null;
    v_pos := position(v_match[1] in v_resto);
    v_doc := v_doc || substring(v_resto from 1 for v_pos - 1) || coalesce(v_valores->>v_match[2], '—');
    v_resto := substring(v_resto from v_pos + length(v_match[1]));
  end loop;
  v_doc := v_doc || v_resto;
  if not v_tinha_rep and v_rep <> '' then v_doc := v_doc || E'\n\n' || v_rep; end if;
  return v_doc;
end;
$$;

revoke all on function public.app_consultoria_cpf_valido(text) from public, anon, authenticated;
revoke all on function public.app_consultoria_documento(text,jsonb,jsonb) from public, anon, authenticated;

-- Registros antigos não tinham o texto final. Eles recebem uma reconstrução
-- explicitamente marcada; todos os novos aceites guardam o texto visto exato.
update public.app_consultoria_aceites
set documento_texto = case when coalesce(config_snapshot #>> '{contrato,ativo}','false') = 'true'
  then public.app_consultoria_documento(config_snapshot #>> '{contrato,texto}', config_snapshot, dados) else '' end
where documento_texto is null;

update public.app_consultoria_aceites
set snapshot_hash = encode(extensions.digest(convert_to(config_snapshot::text,'UTF8'),'sha256'),'hex'),
    documento_hash = encode(extensions.digest(convert_to(coalesce(documento_texto,''),'UTF8'),'sha256'),'hex'),
    conteudo_hash = encode(extensions.digest(convert_to(jsonb_build_object(
      'legacy',true,'versao',versao,'academia',academia_id,'token',token,
      'config',config_snapshot,'documento',coalesce(documento_texto,''),
      'respostas',respostas,'dados',dados,'assinatura',assinatura
    )::text,'UTF8'),'sha256'),'hex'),
    evidencia = evidencia || jsonb_build_object('documento_legacy_reconstruido',true)
where snapshot_hash is null or conteudo_hash is null;

alter table public.app_consultoria_aceites
  alter column documento_texto set not null,
  alter column snapshot_hash set not null,
  alter column conteudo_hash set not null;

alter table public.app_consultoria_aceites drop constraint if exists app_consultoria_documento_texto_tamanho;
alter table public.app_consultoria_aceites add constraint app_consultoria_documento_texto_tamanho check (octet_length(documento_texto) <= 30000);
alter table public.app_consultoria_aceites drop constraint if exists app_consultoria_snapshot_hash_formato;
alter table public.app_consultoria_aceites add constraint app_consultoria_snapshot_hash_formato check (snapshot_hash ~ '^[a-f0-9]{64}$');
alter table public.app_consultoria_aceites drop constraint if exists app_consultoria_assinatura_hash_formato;
alter table public.app_consultoria_aceites add constraint app_consultoria_assinatura_hash_formato check (assinatura_hash is null or assinatura_hash ~ '^[a-f0-9]{64}$');
alter table public.app_consultoria_aceites drop constraint if exists app_consultoria_conteudo_hash_formato;
alter table public.app_consultoria_aceites add constraint app_consultoria_conteudo_hash_formato check (conteudo_hash ~ '^[a-f0-9]{64}$');

-- O retorno genérico não pode gravar módulos que possuem RPC própria.
create or replace function public.app_aluno_devolve(t text, p_dados jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_generico jsonb;
begin
  if t is null or length(t) < 10 then return json_build_object('erro','token inválido'); end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' or octet_length(p_dados::text) > 4000000 then
    return json_build_object('erro','dados inválidos');
  end if;
  v_generico := p_dados - 'nutricaoV1' - 'nutricao' - 'onboardingConsultoria' - 'consultoriaAceite';
  update public.app_aluno
    set retorno = public.app_retorno_mescla(retorno, v_generico), atualizado = now()
    where token = t and revogado_em is null;
  if not found then return json_build_object('erro','sem_acesso'); end if;
  return json_build_object('ok',true);
end $$;
revoke all on function public.app_aluno_devolve(text,jsonb) from public, anon, authenticated;
grant execute on function public.app_aluno_devolve(text,jsonb) to anon, authenticated;

-- ACL convergente mesmo quando uma instalação antiga já concedeu authenticated.
revoke all on function public.app_nutricao_estado(text) from public, anon, authenticated;
revoke all on function public.app_nutricao_salva(text,jsonb) from public, anon, authenticated;
grant execute on function public.app_nutricao_estado(text) to anon;
grant execute on function public.app_nutricao_salva(text,jsonb) to anon;

create or replace function public.app_consultoria_estado(t text, p_versao text)
returns jsonb
language plpgsql security definer stable
set search_path = public, extensions
as $$
declare
  v_acad uuid;
  v_pacote jsonb;
  v_cfg jsonb;
  v_snapshot_hash text;
  v_row public.app_consultoria_aceites%rowtype;
begin
  select academia_id, dados into v_acad, v_pacote from public.app_aluno
    where token=t and revogado_em is null limit 1;
  if v_acad is null then return jsonb_build_object('erro','sem_acesso'); end if;
  if p_versao is null or p_versao !~ '^oc-[a-f0-9]{16}$' then return jsonb_build_object('erro','versao_invalida'); end if;
  v_cfg := v_pacote #> '{dados,onboardingApp}';
  if v_cfg is null or jsonb_typeof(v_cfg) <> 'object' or v_cfg->>'ativo' <> 'true' or v_cfg->>'v' <> p_versao then
    return jsonb_build_object('erro','onboarding_desatualizado');
  end if;
  v_snapshot_hash := encode(extensions.digest(convert_to(v_cfg::text,'UTF8'),'sha256'),'hex');
  select * into v_row from public.app_consultoria_aceites
    where token=t and academia_id=v_acad and versao=p_versao and snapshot_hash=v_snapshot_hash limit 1;
  return jsonb_build_object('ok',true,'concluido',v_row.id is not null,'id',v_row.id,
    'aceito_em',v_row.aceito_em,'documento_hash',v_row.documento_hash);
end;
$$;

create or replace function public.app_consultoria_conclui(
  t text,
  p_versao text,
  p_respostas jsonb,
  p_dados jsonb,
  p_assinatura jsonb,
  p_cliente jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_acad uuid;
  v_pacote jsonb;
  v_cfg jsonb;
  v_perguntas jsonb;
  v_q jsonb;
  v_r jsonb;
  v_respostas jsonb := '[]'::jsonb;
  v_dados jsonb;
  v_assinatura jsonb;
  v_evidencia jsonb;
  v_documento text;
  v_documento_recebido text := coalesce(p_assinatura->>'documento','');
  v_documento_hash text;
  v_snapshot_hash text;
  v_conteudo_hash text;
  v_assinatura_hash text;
  v_imagem text := coalesce(p_assinatura->>'imagem','');
  v_png bytea;
  v_largura bigint;
  v_altura bigint;
  v_ip text;
  v_headers jsonb := '{}'::jsonb;
  v_contrato boolean;
  v_modo text;
  v_nascimento date;
  v_cpf_aluno text;
  v_cpf_responsavel text;
  v_nome_esperado text;
  v_menor boolean := false;
  v_inseriu boolean := false;
  v_row public.app_consultoria_aceites%rowtype;
begin
  if t is null or length(t) < 10 then return jsonb_build_object('erro','sem_acesso'); end if;
  select academia_id, dados into v_acad, v_pacote from public.app_aluno
    where token=t and revogado_em is null for share;
  if v_acad is null then return jsonb_build_object('erro','sem_acesso'); end if;
  if p_versao is null or p_versao !~ '^oc-[a-f0-9]{16}$' then return jsonb_build_object('erro','versao_invalida'); end if;

  v_cfg := v_pacote #> '{dados,onboardingApp}';
  if v_cfg is null or jsonb_typeof(v_cfg) <> 'object' or v_cfg->>'ativo' <> 'true' or v_cfg->>'v' <> p_versao then
    return jsonb_build_object('erro','onboarding_desatualizado');
  end if;
  v_perguntas := coalesce(v_cfg->'perguntas','[]'::jsonb);
  if jsonb_typeof(v_perguntas) <> 'array' or jsonb_array_length(v_perguntas) > 30
     or p_respostas is null or jsonb_typeof(p_respostas) <> 'array'
     or jsonb_array_length(p_respostas) <> jsonb_array_length(v_perguntas)
     or octet_length(p_respostas::text) > 60000 then
    return jsonb_build_object('erro','respostas_invalidas');
  end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' or octet_length(p_dados::text) > 16000
     or p_assinatura is null or jsonb_typeof(p_assinatura) <> 'object' or octet_length(p_assinatura::text) > 180000
     or p_cliente is null or jsonb_typeof(p_cliente) <> 'object' or octet_length(p_cliente::text) > 2000 then
    return jsonb_build_object('erro','conteudo_invalido');
  end if;

  for v_q in select value from jsonb_array_elements(v_perguntas) loop
    select value into v_r from jsonb_array_elements(p_respostas) where value->>'id'=v_q->>'id' limit 1;
    if v_r is null or length(trim(coalesce(v_r->>'resposta',''))) = 0
       or length(coalesce(v_r->>'resposta','')) > 1000 or length(coalesce(v_r->>'pergunta','')) > 500 then
      return jsonb_build_object('erro','resposta_obrigatoria','pergunta',v_q->>'id');
    end if;
    v_respostas := v_respostas || jsonb_build_array(jsonb_build_object(
      'id',left(v_q->>'id',100),'pergunta',left(v_q->>'texto',500),
      'resposta',left(v_r->>'resposta',1000),
      'pontos',case when jsonb_typeof(v_r->'pontos')='number' then v_r->'pontos' else 'null'::jsonb end
    ));
    v_r := null;
  end loop;

  v_cpf_aluno := regexp_replace(coalesce(p_dados->>'cpf',''),'\D','','g');
  v_cpf_responsavel := regexp_replace(coalesce(p_dados->>'responsavelCpf',''),'\D','','g');
  v_dados := jsonb_build_object(
    'nome',left(trim(coalesce(p_dados->>'nome','')),160),
    'nacionalidade',left(trim(coalesce(p_dados->>'nacionalidade','')),80),
    'estadoCivil',left(trim(coalesce(p_dados->>'estadoCivil','')),80),
    'profissao',left(trim(coalesce(p_dados->>'profissao','')),120),
    'rg',left(trim(coalesce(p_dados->>'rg','')),40),
    'rgOrgao',left(trim(coalesce(p_dados->>'rgOrgao','')),40),
    'cpf',v_cpf_aluno,
    'nascimento',left(trim(coalesce(p_dados->>'nascimento','')),10),
    'email',left(trim(coalesce(p_dados->>'email','')),160),
    'telefone',regexp_replace(coalesce(p_dados->>'telefone',''),'\D','','g'),
    'cep',regexp_replace(coalesce(p_dados->>'cep',''),'\D','','g'),
    'logradouro',left(trim(coalesce(p_dados->>'logradouro','')),300),
    'numero',left(trim(coalesce(p_dados->>'numero','')),30),
    'complemento',left(trim(coalesce(p_dados->>'complemento','')),120),
    'bairro',left(trim(coalesce(p_dados->>'bairro','')),120),
    'cidade',left(trim(coalesce(p_dados->>'cidade','')),120),
    'uf',upper(left(trim(coalesce(p_dados->>'uf','')),2)),
    'responsavelNome',left(trim(coalesce(p_dados->>'responsavelNome','')),160),
    'responsavelCpf',v_cpf_responsavel
  );
  v_assinatura := jsonb_build_object(
    'aceitou',coalesce(p_assinatura->>'aceitou','false')='true',
    'consentimentoSaude',coalesce(p_assinatura->>'consentimentoSaude','false')='true',
    'nome',left(trim(coalesce(p_assinatura->>'nome','')),160),
    'imagem',''
  );

  if jsonb_array_length(v_perguntas)>0 and v_assinatura->>'consentimentoSaude'<>'true' then
    return jsonb_build_object('erro','consentimento_necessario');
  end if;
  v_contrato := coalesce(v_cfg #>> '{contrato,ativo}','false')='true';
  v_modo := coalesce(v_cfg #>> '{contrato,modo}','aceite');
  if v_contrato then
    if length(v_dados->>'nome')<3 or length(v_dados->>'nacionalidade')<3
       or length(v_dados->>'estadoCivil')<3 or length(v_dados->>'profissao')<2
       or length(v_dados->>'rg')<3 or length(v_dados->>'rgOrgao')<2
       or not public.app_consultoria_cpf_valido(v_cpf_aluno)
       or (v_dados->>'nascimento') !~ '^\d{4}-\d{2}-\d{2}$'
       or (v_dados->>'email') !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
       or length(v_dados->>'telefone')<10 or length(v_dados->>'telefone')>15
       or length(v_dados->>'cep')<>8 or length(v_dados->>'logradouro')<3
       or length(v_dados->>'numero')<1 or length(v_dados->>'bairro')<2
       or length(v_dados->>'cidade')<2 or (v_dados->>'uf') !~ '^[A-Z]{2}$' then
      return jsonb_build_object('erro','dados_contratuais_incompletos');
    end if;
    begin v_nascimento := (v_dados->>'nascimento')::date;
    exception when others then return jsonb_build_object('erro','nascimento_invalido'); end;
    if v_nascimento>current_date or v_nascimento<date '1900-01-01' then return jsonb_build_object('erro','nascimento_invalido'); end if;
    if v_nascimento>current_date-interval '18 years' then
      v_menor := true;
      if length(v_dados->>'responsavelNome')<3 or not public.app_consultoria_cpf_valido(v_cpf_responsavel)
         or v_cpf_responsavel=v_cpf_aluno then return jsonb_build_object('erro','responsavel_legal_necessario'); end if;
      v_nome_esperado := v_dados->>'responsavelNome';
    else
      v_nome_esperado := v_dados->>'nome';
      v_dados := jsonb_set(jsonb_set(v_dados,'{responsavelNome}','""'::jsonb),'{responsavelCpf}','""'::jsonb);
    end if;
    if v_assinatura->>'aceitou'<>'true' or length(v_assinatura->>'nome')<3
       or lower(regexp_replace(v_assinatura->>'nome','\s+',' ','g')) <> lower(regexp_replace(v_nome_esperado,'\s+',' ','g')) then
      return jsonb_build_object('erro','aceite_necessario');
    end if;
    v_assinatura := v_assinatura || jsonb_build_object(
      'tipo',case when v_menor then 'responsavel' else 'aluno' end,
      'cpf',case when v_menor then v_dados->>'responsavelCpf' else v_dados->>'cpf' end
    );
    if length(coalesce(v_cfg #>> '{contrato,prestador,nome}',''))<3
       or length(coalesce(v_cfg #>> '{contrato,prestador,documento}',''))<11
       or length(coalesce(v_cfg #>> '{contrato,prestador,endereco}',''))<5
       or length(coalesce(v_cfg #>> '{contrato,prestador,email}',''))<5
       or length(regexp_replace(coalesce(v_cfg #>> '{contrato,prestador,telefone}',''),'\D','','g'))<10
       or length(coalesce(v_cfg #>> '{contrato,texto}',''))<300 then
      return jsonb_build_object('erro','contrato_incompleto');
    end if;

    v_documento := public.app_consultoria_documento(v_cfg #>> '{contrato,texto}',v_cfg,v_dados);
    if octet_length(v_documento)>30000 or v_documento_recebido is distinct from v_documento then
      return jsonb_build_object('erro','documento_divergente');
    end if;
    if v_modo='assinatura' then
      if v_imagem !~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$' or length(v_imagem)>140000 then
        return jsonb_build_object('erro','assinatura_invalida');
      end if;
      begin v_png := decode(substring(v_imagem from 23),'base64');
      exception when others then return jsonb_build_object('erro','assinatura_invalida'); end;
      if octet_length(v_png)<45 or octet_length(v_png)>105000
         or substring(v_png from 1 for 8)<>decode('89504e470d0a1a0a','hex')
         or substring(v_png from 13 for 4)<>decode('49484452','hex')
         or substring(v_png from octet_length(v_png)-11 for 12)<>decode('0000000049454e44ae426082','hex') then
        return jsonb_build_object('erro','assinatura_invalida');
      end if;
      v_largura := get_byte(v_png,16)::bigint*16777216+get_byte(v_png,17)::bigint*65536+get_byte(v_png,18)::bigint*256+get_byte(v_png,19);
      v_altura := get_byte(v_png,20)::bigint*16777216+get_byte(v_png,21)::bigint*65536+get_byte(v_png,22)::bigint*256+get_byte(v_png,23);
      if v_largura<250 or v_largura>2048 or v_altura<100 or v_altura>1024 or v_largura*v_altura>2000000 then
        return jsonb_build_object('erro','assinatura_invalida');
      end if;
      v_assinatura := jsonb_set(v_assinatura,'{imagem}',to_jsonb(v_imagem));
      v_assinatura_hash := encode(extensions.digest(v_png,'sha256'),'hex');
    end if;
  else
    v_documento := '';
  end if;

  begin v_headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
  exception when others then v_headers:='{}'::jsonb; end;
  v_ip:=left(coalesce(v_headers->>'cf-connecting-ip',split_part(v_headers->>'x-forwarded-for',',',1),''),80);
  v_evidencia:=jsonb_build_object(
    'agente',left(coalesce(p_cliente->>'agente',''),300),
    'idioma',left(coalesce(p_cliente->>'idioma',''),20),
    'rede_hash',encode(extensions.digest(convert_to(coalesce(v_ip,'')||':'||t,'UTF8'),'sha256'),'hex'),
    'registrado_pelo_servidor',true
  );
  v_snapshot_hash:=encode(extensions.digest(convert_to(v_cfg::text,'UTF8'),'sha256'),'hex');
  v_documento_hash:=encode(extensions.digest(convert_to(v_documento,'UTF8'),'sha256'),'hex');
  v_conteudo_hash:=encode(extensions.digest(convert_to(jsonb_build_object(
    'versao',p_versao,'academia',v_acad,'token',t,'snapshot_hash',v_snapshot_hash,
    'documento_hash',v_documento_hash,'respostas',v_respostas,'dados',v_dados,
    'assinatura',v_assinatura,'assinatura_hash',v_assinatura_hash
  )::text,'UTF8'),'sha256'),'hex');

  insert into public.app_consultoria_aceites
    (academia_id,token,versao,respostas,dados,assinatura,config_snapshot,evidencia,
     documento_texto,documento_hash,snapshot_hash,assinatura_hash,conteudo_hash)
  values
    (v_acad,t,p_versao,v_respostas,v_dados,v_assinatura,v_cfg,v_evidencia,
     v_documento,v_documento_hash,v_snapshot_hash,v_assinatura_hash,v_conteudo_hash)
  on conflict (token,versao) do nothing returning * into v_row;
  v_inseriu := found;
  if not v_inseriu then
    select * into v_row from public.app_consultoria_aceites
      where token=t and versao=p_versao and academia_id=v_acad limit 1;
  end if;
  if v_row.conteudo_hash is distinct from v_conteudo_hash then
    return jsonb_build_object('erro','aceite_conflitante');
  end if;
  return jsonb_build_object('ok',true,'id',v_row.id,'aceito_em',v_row.aceito_em,
    'documento_hash',v_row.documento_hash,'ja_existia',not v_inseriu);
end;
$$;

revoke all on function public.app_consultoria_estado(text,text) from public, anon, authenticated;
revoke all on function public.app_consultoria_conclui(text,text,jsonb,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.app_consultoria_estado(text,text) to anon;
grant execute on function public.app_consultoria_conclui(text,text,jsonb,jsonb,jsonb,jsonb) to anon;

-- ==================== MIGRATION 20260909193000 ====================
-- Plano contratado, recorrência opcional e conferência de documentos. Pacotes legados preservam texto e hashes.

create or replace function public.app_consultoria_documento(
  p_modelo text,
  p_cfg jsonb,
  p_dados jsonb
)
returns text
language plpgsql immutable
set search_path = public
as $$
declare
  v_doc text := coalesce(p_modelo, '');
  v_endereco text;
  v_cidade_uf text;
  v_inicio text;
  v_nascimento text;
  v_valor text := 'conforme combinado';
  v_rep text := '';
  v_tinha_rep boolean := position('{{representante_legal}}' in coalesce(p_modelo, '')) > 0;
  v_num numeric;
  v_valores jsonb := '{}'::jsonb;
  v_match text[];
  v_resto text;
  v_pos integer;
  v_plano jsonb := p_cfg #> '{contrato,plano}';
  v_mensal boolean;
  v_linhas text[];
  v_ciclo numeric;
begin
  v_cidade_uf := case
    when coalesce(p_dados->>'cidade','') <> '' and coalesce(p_dados->>'uf','') <> '' then (p_dados->>'cidade') || '/' || (p_dados->>'uf')
    else coalesce(p_dados->>'cidade', p_dados->>'uf', '')
  end;
  v_endereco := concat_ws(', ',
    nullif(p_dados->>'logradouro',''), nullif(p_dados->>'numero',''),
    nullif(p_dados->>'complemento',''), nullif(p_dados->>'bairro',''),
    nullif(v_cidade_uf,''), case when coalesce(p_dados->>'cep','') <> '' then 'CEP ' || (p_dados->>'cep') end
  );
  v_nascimento := case when coalesce(p_dados->>'nascimento','') ~ '^\d{4}-\d{2}-\d{2}$'
    then substring(p_dados->>'nascimento' from 9 for 2) || '/' || substring(p_dados->>'nascimento' from 6 for 2) || '/' || substring(p_dados->>'nascimento' from 1 for 4)
    else coalesce(p_dados->>'nascimento','') end;
  v_inicio := case when coalesce(p_cfg #>> '{contrato,plano,inicio}','') ~ '^\d{4}-\d{2}-\d{2}$'
    then substring(p_cfg #>> '{contrato,plano,inicio}' from 9 for 2) || '/' || substring(p_cfg #>> '{contrato,plano,inicio}' from 6 for 2) || '/' || substring(p_cfg #>> '{contrato,plano,inicio}' from 1 for 4)
    else 'a data do aceite' end;
  if jsonb_typeof(p_cfg #> '{contrato,plano,valor}') = 'number' then
    v_num := (p_cfg #>> '{contrato,plano,valor}')::numeric;
    if v_num <> 0 then v_valor := 'R$ ' || replace(to_char(v_num, 'FM999999999999990.00'), '.', ','); end if;
  end if;
  if coalesce(p_dados->>'responsavelNome','') <> '' then
    v_rep := 'REPRESENTANTE LEGAL DO CONTRATANTE: ' || (p_dados->>'responsavelNome') ||
      ', CPF ' || coalesce(nullif(p_dados->>'responsavelCpf',''),'—') ||
      ', que aceita e assina este instrumento em nome do menor.';
  end if;

  v_valores := v_valores || jsonb_build_object('aluno_nome', coalesce(nullif(p_dados->>'nome',''),'—'));
  v_valores := v_valores || jsonb_build_object('aluno_nacionalidade', coalesce(nullif(p_dados->>'nacionalidade',''),'—'));
  v_valores := v_valores || jsonb_build_object('aluno_estado_civil', coalesce(nullif(p_dados->>'estadoCivil',''),'—'));
  v_valores := v_valores || jsonb_build_object('aluno_profissao', coalesce(nullif(p_dados->>'profissao',''),'—'));
  v_valores := v_valores || jsonb_build_object('aluno_rg', coalesce(nullif(p_dados->>'rg',''),'—'));
  v_valores := v_valores || jsonb_build_object('aluno_rg_orgao', coalesce(nullif(p_dados->>'rgOrgao',''),'—'));
  v_valores := v_valores || jsonb_build_object('aluno_cpf', coalesce(nullif(p_dados->>'cpf',''),'—'));
  v_valores := v_valores || jsonb_build_object('aluno_nascimento', coalesce(nullif(v_nascimento,''),'—'));
  v_valores := v_valores || jsonb_build_object('aluno_endereco', coalesce(nullif(v_endereco,''),'—'));
  v_valores := v_valores || jsonb_build_object('aluno_email', coalesce(nullif(p_dados->>'email',''),'—'));
  v_valores := v_valores || jsonb_build_object('aluno_telefone', coalesce(nullif(p_dados->>'telefone',''),'—'));
  v_valores := v_valores || jsonb_build_object('prestador_nome', coalesce(nullif(p_cfg #>> '{contrato,prestador,nome}',''),'—'));
  v_valores := v_valores || jsonb_build_object('prestador_documento', coalesce(nullif(p_cfg #>> '{contrato,prestador,documento}',''),'—'));
  v_valores := v_valores || jsonb_build_object('prestador_endereco', coalesce(nullif(p_cfg #>> '{contrato,prestador,endereco}',''),'—'));
  v_valores := v_valores || jsonb_build_object('prestador_email', coalesce(nullif(p_cfg #>> '{contrato,prestador,email}',''),'—'));
  v_valores := v_valores || jsonb_build_object('prestador_telefone', coalesce(nullif(p_cfg #>> '{contrato,prestador,telefone}',''),'—'));
  v_valores := v_valores || jsonb_build_object('plano_nome', coalesce(nullif(p_cfg #>> '{contrato,plano,nome}',''),'consultoria'));
  v_valores := v_valores || jsonb_build_object('plano_valor', v_valor);
  v_valores := v_valores || jsonb_build_object('contrato_inicio', v_inicio);
  v_valores := v_valores || jsonb_build_object('foro_cidade', case
    when coalesce(p_cfg #>> '{contrato,prestador,cidade}','') <> '' and coalesce(p_cfg #>> '{contrato,prestador,uf}','') <> ''
      then (p_cfg #>> '{contrato,prestador,cidade}') || '/' || (p_cfg #>> '{contrato,prestador,uf}')
    else coalesce(nullif(p_cfg #>> '{contrato,prestador,cidade}',''),'cidade do contratante') end);
  v_valores := v_valores || jsonb_build_object('responsavel_nome', coalesce(nullif(p_dados->>'responsavelNome',''),'—'));
  v_valores := v_valores || jsonb_build_object('responsavel_cpf', coalesce(nullif(p_dados->>'responsavelCpf',''),'—'));
  v_valores := v_valores || jsonb_build_object('representante_legal', v_rep);
  -- O mapa anterior permanece igual para preservar textos já assinados.
  if p_cfg->'fluxo' = '2'::jsonb then
    v_valores := v_valores || jsonb_build_object('aluno_documento_tipo',
      case when p_dados->>'documentoTipo' = 'cin' then 'CIN' else 'RG' end);
  end if;
  -- Uma passagem: valores digitados não são interpretados como novos campos.
  v_resto := coalesce(p_modelo, '');
  v_doc := '';
  loop
    v_match := regexp_match(v_resto, '(\{\{([a-z_]+)\}\})');
    exit when v_match is null;
    v_pos := position(v_match[1] in v_resto);
    v_doc := v_doc || substring(v_resto from 1 for v_pos - 1) || coalesce(v_valores->>v_match[2], '—');
    v_resto := substring(v_resto from v_pos + length(v_match[1]));
  end loop;
  v_doc := v_doc || v_resto;
  if not v_tinha_rep and v_rep <> '' then v_doc := v_doc || E'\n\n' || v_rep; end if;
  -- Mesmo resumo de planoTexto: integra o documento e seu hash.
  if p_cfg->'fluxo' = '2'::jsonb and p_cfg #>> '{contrato,ativo}' = 'true' then
    v_mensal := coalesce(v_plano->>'cobranca','') <> 'sessao';
    v_ciclo := coalesce(nullif((v_plano->>'ciclo')::numeric,0),1);
    v_linhas := array[
      'PLANO CONTRATADO',
      'Plano: ' || coalesce(nullif(v_plano->>'nome',''),'—') || '.',
      'Modalidade: ' || coalesce(nullif(v_plano->>'modalidade',''),'consultoria') || '.',
      'Valor: R$ ' || replace(to_char(coalesce((v_plano->>'valor')::numeric,0),'FM999999999999990.00'),'.',',') ||
        case when v_mensal then ' por mês.'
          when coalesce((v_plano->>'pacoteQtd')::numeric,0) > 0 then ' pelo pacote de ' || trim_scale((v_plano->>'pacoteQtd')::numeric)::text || ' aulas.'
          else ' por sessão.' end
    ];
    if v_mensal then
      v_linhas := array_append(v_linhas,'Ciclo contratual: ' || trim_scale(v_ciclo)::text || case when v_ciclo=1 then ' mês.' else ' meses.' end);
    end if;
    if coalesce((v_plano->>'treinosSem')::numeric,0)>0 then
      v_linhas := array_append(v_linhas,'Frequência: ' || trim_scale((v_plano->>'treinosSem')::numeric)::text || ' treino(s) por semana.');
    end if;
    v_linhas := array_append(v_linhas,'Início: ' || v_inicio || '.');
    if v_mensal then
      v_linhas := array_append(v_linhas,'Vencimento mensal: dia ' || trim_scale((v_plano->>'diaVenc')::numeric)::text || '.');
    end if;
    if not v_mensal and coalesce((v_plano->>'pacoteQtd')::numeric,0)>0 then
      v_linhas := array_append(v_linhas,'Renovação do pacote: ' ||
        case when v_plano->>'pacoteRenova'='true' then 'automática ao concluir as aulas.' else 'mediante nova contratação.' end);
    end if;
    v_linhas := array_append(v_linhas,case when p_cfg #>> '{pagamento,ativo}'='true'
      then 'Pagamento: assinatura recorrente pelo link ' || (p_cfg #>> '{pagamento,link}') || '.'
      else 'Pagamento: conforme combinado entre as partes.' end);
    v_doc := v_doc || E'\n\n' || array_to_string(v_linhas,E'\n');
  end if;
  return v_doc;
end;
$$;

create or replace function public.app_consultoria_conclui(
  t text,
  p_versao text,
  p_respostas jsonb,
  p_dados jsonb,
  p_assinatura jsonb,
  p_cliente jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_acad uuid;
  v_pacote jsonb;
  v_cfg jsonb;
  v_perguntas jsonb;
  v_q jsonb;
  v_r jsonb;
  v_respostas jsonb := '[]'::jsonb;
  v_dados jsonb;
  v_assinatura jsonb;
  v_evidencia jsonb;
  v_documento text;
  v_documento_recebido text := coalesce(p_assinatura->>'documento','');
  v_documento_hash text;
  v_snapshot_hash text;
  v_conteudo_hash text;
  v_assinatura_hash text;
  v_imagem text := coalesce(p_assinatura->>'imagem','');
  v_png bytea;
  v_largura bigint;
  v_altura bigint;
  v_ip text;
  v_headers jsonb := '{}'::jsonb;
  v_contrato boolean;
  v_modo text;
  v_nascimento date;
  v_cpf_aluno text;
  v_cpf_responsavel text;
  v_nome_esperado text;
  v_menor boolean := false;
  v_inseriu boolean := false;
  v_row public.app_consultoria_aceites%rowtype;
  v_fluxo_novo boolean := false;
  v_plano jsonb;
  v_plano_inicio date;
  v_plano_valor numeric;
  v_plano_ciclo numeric;
  v_plano_venc numeric;
  v_link text;
  v_autoridade text;
  v_porta text;
  v_tipo_documento text;
  v_rg_normalizado text;
begin
  if t is null or length(t) < 10 then return jsonb_build_object('erro','sem_acesso'); end if;
  select academia_id, dados into v_acad, v_pacote from public.app_aluno
    where token=t and revogado_em is null for share;
  if v_acad is null then return jsonb_build_object('erro','sem_acesso'); end if;
  if p_versao is null or p_versao !~ '^oc-[a-f0-9]{16}$' then return jsonb_build_object('erro','versao_invalida'); end if;

  v_cfg := v_pacote #> '{dados,onboardingApp}';
  if v_cfg is null or jsonb_typeof(v_cfg) <> 'object' or v_cfg->>'ativo' <> 'true' or v_cfg->>'v' <> p_versao then
    return jsonb_build_object('erro','onboarding_desatualizado');
  end if;
  v_fluxo_novo := coalesce(v_cfg->'fluxo' = '2'::jsonb,false);
  v_perguntas := coalesce(v_cfg->'perguntas','[]'::jsonb);
  if jsonb_typeof(v_perguntas) <> 'array' or jsonb_array_length(v_perguntas) > 30
     or p_respostas is null or jsonb_typeof(p_respostas) <> 'array'
     or jsonb_array_length(p_respostas) <> jsonb_array_length(v_perguntas)
     or octet_length(p_respostas::text) > 60000 then
    return jsonb_build_object('erro','respostas_invalidas');
  end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' or octet_length(p_dados::text) > 16000
     or p_assinatura is null or jsonb_typeof(p_assinatura) <> 'object' or octet_length(p_assinatura::text) > 180000
     or p_cliente is null or jsonb_typeof(p_cliente) <> 'object' or octet_length(p_cliente::text) > 2000 then
    return jsonb_build_object('erro','conteudo_invalido');
  end if;

  for v_q in select value from jsonb_array_elements(v_perguntas) loop
    select value into v_r from jsonb_array_elements(p_respostas) where value->>'id'=v_q->>'id' limit 1;
    if v_r is null or length(trim(coalesce(v_r->>'resposta',''))) = 0
       or length(coalesce(v_r->>'resposta','')) > 1000 or length(coalesce(v_r->>'pergunta','')) > 500 then
      return jsonb_build_object('erro','resposta_obrigatoria','pergunta',v_q->>'id');
    end if;
    v_respostas := v_respostas || jsonb_build_array(jsonb_build_object(
      'id',left(v_q->>'id',100),'pergunta',left(v_q->>'texto',500),
      'resposta',left(v_r->>'resposta',1000),
      'pontos',case when jsonb_typeof(v_r->'pontos')='number' then v_r->'pontos' else 'null'::jsonb end
    ));
    v_r := null;
  end loop;

  v_cpf_aluno := regexp_replace(coalesce(p_dados->>'cpf',''),'\D','','g');
  v_cpf_responsavel := regexp_replace(coalesce(p_dados->>'responsavelCpf',''),'\D','','g');
  v_dados := jsonb_build_object(
    'nome',left(trim(coalesce(p_dados->>'nome','')),160),
    'nacionalidade',left(trim(coalesce(p_dados->>'nacionalidade','')),80),
    'estadoCivil',left(trim(coalesce(p_dados->>'estadoCivil','')),80),
    'profissao',left(trim(coalesce(p_dados->>'profissao','')),120),
    'rg',left(trim(coalesce(p_dados->>'rg','')),40),
    'rgOrgao',left(trim(coalesce(p_dados->>'rgOrgao','')),40),
    'cpf',v_cpf_aluno,
    'nascimento',left(trim(coalesce(p_dados->>'nascimento','')),10),
    'email',left(trim(coalesce(p_dados->>'email','')),160),
    'telefone',regexp_replace(coalesce(p_dados->>'telefone',''),'\D','','g'),
    'cep',regexp_replace(coalesce(p_dados->>'cep',''),'\D','','g'),
    'logradouro',left(trim(coalesce(p_dados->>'logradouro','')),300),
    'numero',left(trim(coalesce(p_dados->>'numero','')),30),
    'complemento',left(trim(coalesce(p_dados->>'complemento','')),120),
    'bairro',left(trim(coalesce(p_dados->>'bairro','')),120),
    'cidade',left(trim(coalesce(p_dados->>'cidade','')),120),
    'uf',upper(left(trim(coalesce(p_dados->>'uf','')),2)),
    'responsavelNome',left(trim(coalesce(p_dados->>'responsavelNome','')),160),
    'responsavelCpf',v_cpf_responsavel
  );
  if v_fluxo_novo then
    v_tipo_documento := coalesce(p_dados->>'documentoTipo','rg');
    v_dados := v_dados || jsonb_build_object('documentoTipo',v_tipo_documento,
      'rg',upper(left(trim(coalesce(p_dados->>'rg','')),40)));
  end if;
  v_assinatura := jsonb_build_object(
    'aceitou',coalesce(p_assinatura->>'aceitou','false')='true',
    'consentimentoSaude',coalesce(p_assinatura->>'consentimentoSaude','false')='true',
    'nome',left(trim(coalesce(p_assinatura->>'nome','')),160),
    'imagem',''
  );

  if jsonb_array_length(v_perguntas)>0 and v_assinatura->>'consentimentoSaude'<>'true' then
    return jsonb_build_object('erro','consentimento_necessario');
  end if;
  v_contrato := coalesce(v_cfg #>> '{contrato,ativo}','false')='true';
  v_modo := coalesce(v_cfg #>> '{contrato,modo}','aceite');
  if v_contrato then
    if v_fluxo_novo then
      -- Novas validações só para fluxo 2: retries antigos não mudam seu hash.
      if coalesce(p_dados->>'cpf','') !~ '^[0-9.\s-]+$'
         or not public.app_consultoria_cpf_valido(v_cpf_aluno) then
        return jsonb_build_object('erro','cpf_invalido','campo','cpf');
      end if;
      if v_tipo_documento not in ('rg','cin') then
        return jsonb_build_object('erro','identidade_invalida');
      end if;
      v_rg_normalizado := upper(regexp_replace(trim(coalesce(p_dados->>'rg','')),'[.\s/-]','','g'));
      if v_tipo_documento = 'cin' then
        if coalesce(p_dados->>'rg','') !~ '^[0-9.\s-]+$'
           or v_rg_normalizado <> v_cpf_aluno
           or not public.app_consultoria_cpf_valido(v_rg_normalizado) then
          return jsonb_build_object('erro','cin_divergente');
        end if;
      elsif coalesce(p_dados->>'rg','') !~ '^[A-Za-z0-9.\s/-]+$'
         or length(v_rg_normalizado)<5 or length(v_rg_normalizado)>20
         or length(regexp_replace(v_rg_normalizado,'[^0-9]','','g'))<3
         or v_rg_normalizado ~ '^(.)\1+$' then
        return jsonb_build_object('erro','identidade_invalida');
      end if;
      -- O preço vem do pacote publicado pelo profissional. O link encaminha
      -- ao provedor e nunca confirma pagamento ou cria cobrança nesta RPC.
      v_plano := v_cfg #> '{contrato,plano}';
      if v_plano is null or jsonb_typeof(v_plano)<>'object'
         or coalesce(trim(v_plano->>'id'),'')=''
         or coalesce(trim(v_plano->>'contratoId'),'')=''
         or coalesce(trim(v_plano->>'nome'),'')=''
         or jsonb_typeof(v_plano->'valor') is distinct from 'number'
         or jsonb_typeof(v_plano->'ciclo') is distinct from 'number'
         or jsonb_typeof(v_plano->'diaVenc') is distinct from 'number'
         or coalesce(v_plano->>'cobranca','') not in ('mes','sessao')
         or coalesce(v_plano->>'inicio','') !~ '^\d{4}-\d{2}-\d{2}$' then
        return jsonb_build_object('erro','plano_invalido');
      end if;
      begin
        v_plano_valor := (v_plano->>'valor')::numeric;
        v_plano_ciclo := (v_plano->>'ciclo')::numeric;
        v_plano_venc := (v_plano->>'diaVenc')::numeric;
        v_plano_inicio := (v_plano->>'inicio')::date;
        if v_plano_valor<=0 or v_plano_valor>1000000
           or v_plano_ciclo<>trunc(v_plano_ciclo) or v_plano_ciclo<1 or v_plano_ciclo>60
           or v_plano_venc<>trunc(v_plano_venc) or v_plano_venc<1 or v_plano_venc>28
           or to_char(v_plano_inicio,'YYYY-MM-DD')<>(v_plano->>'inicio') then
          return jsonb_build_object('erro','plano_invalido');
        end if;
        if (v_plano ? 'treinosSem' and jsonb_typeof(v_plano->'treinosSem') is distinct from 'number')
           or (v_plano ? 'pacoteQtd' and jsonb_typeof(v_plano->'pacoteQtd') is distinct from 'number')
           or (v_plano->>'treinosSem')::numeric<0 or (v_plano->>'treinosSem')::numeric>7
           or (v_plano->>'treinosSem')::numeric<>trunc((v_plano->>'treinosSem')::numeric)
           or (v_plano->>'pacoteQtd')::numeric<0
           or (v_plano->>'pacoteQtd')::numeric<>trunc((v_plano->>'pacoteQtd')::numeric) then
          return jsonb_build_object('erro','plano_invalido');
        end if;
      exception when others then return jsonb_build_object('erro','plano_invalido'); end;
      if v_cfg #>> '{pagamento,ativo}' = 'true' then
        v_link := coalesce(v_cfg #>> '{pagamento,link}','');
        v_autoridade := substring(v_link from '^https://([^/?#]+)');
        if v_plano->>'cobranca'<>'mes' or (v_plano->>'pacoteQtd')::numeric>0
           or length(v_link)>2048 or v_link ~ '[\s\x01-\x1f\\]'
           or v_autoridade is null or position('@' in v_autoridade)>0
           or v_autoridade !~ '^(\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?\.?)(:[0-9]{1,5})?$'
           or v_autoridade ~ '\.\.' then
          return jsonb_build_object('erro','link_pagamento_invalido');
        end if;
        v_porta := substring(v_autoridade from ':([0-9]+)$');
        if v_porta is not null and v_porta::integer>65535 then
          return jsonb_build_object('erro','link_pagamento_invalido');
        end if;
        if left(v_autoridade,1)='[' then
          begin
            if family(substring(v_autoridade from '^\[([^\]]+)\]')::inet)<>6 then
              return jsonb_build_object('erro','link_pagamento_invalido');
            end if;
          exception when others then return jsonb_build_object('erro','link_pagamento_invalido'); end;
        end if;
      end if;
    end if;
    if length(v_dados->>'nome')<3 or length(v_dados->>'nacionalidade')<3
       or length(v_dados->>'estadoCivil')<3 or length(v_dados->>'profissao')<2
       or length(v_dados->>'rg')<3 or length(v_dados->>'rgOrgao')<2
       or not public.app_consultoria_cpf_valido(v_cpf_aluno)
       or (v_dados->>'nascimento') !~ '^\d{4}-\d{2}-\d{2}$'
       or (v_dados->>'email') !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
       or length(v_dados->>'telefone')<10 or length(v_dados->>'telefone')>15
       or length(v_dados->>'cep')<>8 or length(v_dados->>'logradouro')<3
       or length(v_dados->>'numero')<1 or length(v_dados->>'bairro')<2
       or length(v_dados->>'cidade')<2 or (v_dados->>'uf') !~ '^[A-Z]{2}$' then
      return jsonb_build_object('erro','dados_contratuais_incompletos');
    end if;
    begin v_nascimento := (v_dados->>'nascimento')::date;
    exception when others then return jsonb_build_object('erro','nascimento_invalido'); end;
    if v_nascimento>current_date or v_nascimento<date '1900-01-01' then return jsonb_build_object('erro','nascimento_invalido'); end if;
    if v_nascimento>current_date-interval '18 years' then
      v_menor := true;
      if v_fluxo_novo and coalesce(p_dados->>'responsavelCpf','') !~ '^[0-9.\s-]+$' then
        return jsonb_build_object('erro','cpf_invalido','campo','responsavelCpf');
      end if;
      if length(v_dados->>'responsavelNome')<3 or not public.app_consultoria_cpf_valido(v_cpf_responsavel)
         or v_cpf_responsavel=v_cpf_aluno then return jsonb_build_object('erro','responsavel_legal_necessario'); end if;
      v_nome_esperado := v_dados->>'responsavelNome';
    else
      v_nome_esperado := v_dados->>'nome';
      v_dados := jsonb_set(jsonb_set(v_dados,'{responsavelNome}','""'::jsonb),'{responsavelCpf}','""'::jsonb);
    end if;
    if v_assinatura->>'aceitou'<>'true' or length(v_assinatura->>'nome')<3
       or lower(regexp_replace(v_assinatura->>'nome','\s+',' ','g')) <> lower(regexp_replace(v_nome_esperado,'\s+',' ','g')) then
      return jsonb_build_object('erro','aceite_necessario');
    end if;
    v_assinatura := v_assinatura || jsonb_build_object(
      'tipo',case when v_menor then 'responsavel' else 'aluno' end,
      'cpf',case when v_menor then v_dados->>'responsavelCpf' else v_dados->>'cpf' end
    );
    if length(coalesce(v_cfg #>> '{contrato,prestador,nome}',''))<3
       or length(coalesce(v_cfg #>> '{contrato,prestador,documento}',''))<11
       or length(coalesce(v_cfg #>> '{contrato,prestador,endereco}',''))<5
       or length(coalesce(v_cfg #>> '{contrato,prestador,email}',''))<5
       or length(regexp_replace(coalesce(v_cfg #>> '{contrato,prestador,telefone}',''),'\D','','g'))<10
       or length(coalesce(v_cfg #>> '{contrato,texto}',''))<300 then
      return jsonb_build_object('erro','contrato_incompleto');
    end if;

    v_documento := public.app_consultoria_documento(v_cfg #>> '{contrato,texto}',v_cfg,v_dados);
    if octet_length(v_documento)>30000 or v_documento_recebido is distinct from v_documento then
      return jsonb_build_object('erro','documento_divergente');
    end if;
    if v_modo='assinatura' then
      if v_imagem !~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$' or length(v_imagem)>140000 then
        return jsonb_build_object('erro','assinatura_invalida');
      end if;
      begin v_png := decode(substring(v_imagem from 23),'base64');
      exception when others then return jsonb_build_object('erro','assinatura_invalida'); end;
      if octet_length(v_png)<45 or octet_length(v_png)>105000
         or substring(v_png from 1 for 8)<>decode('89504e470d0a1a0a','hex')
         or substring(v_png from 13 for 4)<>decode('49484452','hex')
         or substring(v_png from octet_length(v_png)-11 for 12)<>decode('0000000049454e44ae426082','hex') then
        return jsonb_build_object('erro','assinatura_invalida');
      end if;
      v_largura := get_byte(v_png,16)::bigint*16777216+get_byte(v_png,17)::bigint*65536+get_byte(v_png,18)::bigint*256+get_byte(v_png,19);
      v_altura := get_byte(v_png,20)::bigint*16777216+get_byte(v_png,21)::bigint*65536+get_byte(v_png,22)::bigint*256+get_byte(v_png,23);
      if v_largura<250 or v_largura>2048 or v_altura<100 or v_altura>1024 or v_largura*v_altura>2000000 then
        return jsonb_build_object('erro','assinatura_invalida');
      end if;
      v_assinatura := jsonb_set(v_assinatura,'{imagem}',to_jsonb(v_imagem));
      v_assinatura_hash := encode(extensions.digest(v_png,'sha256'),'hex');
    end if;
  else
    v_documento := '';
  end if;

  begin v_headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
  exception when others then v_headers:='{}'::jsonb; end;
  v_ip:=left(coalesce(v_headers->>'cf-connecting-ip',split_part(v_headers->>'x-forwarded-for',',',1),''),80);
  v_evidencia:=jsonb_build_object(
    'agente',left(coalesce(p_cliente->>'agente',''),300),
    'idioma',left(coalesce(p_cliente->>'idioma',''),20),
    'rede_hash',encode(extensions.digest(convert_to(coalesce(v_ip,'')||':'||t,'UTF8'),'sha256'),'hex'),
    'registrado_pelo_servidor',true
  );
  v_snapshot_hash:=encode(extensions.digest(convert_to(v_cfg::text,'UTF8'),'sha256'),'hex');
  v_documento_hash:=encode(extensions.digest(convert_to(v_documento,'UTF8'),'sha256'),'hex');
  v_conteudo_hash:=encode(extensions.digest(convert_to(jsonb_build_object(
    'versao',p_versao,'academia',v_acad,'token',t,'snapshot_hash',v_snapshot_hash,
    'documento_hash',v_documento_hash,'respostas',v_respostas,'dados',v_dados,
    'assinatura',v_assinatura,'assinatura_hash',v_assinatura_hash
  )::text,'UTF8'),'sha256'),'hex');

  insert into public.app_consultoria_aceites
    (academia_id,token,versao,respostas,dados,assinatura,config_snapshot,evidencia,
     documento_texto,documento_hash,snapshot_hash,assinatura_hash,conteudo_hash)
  values
    (v_acad,t,p_versao,v_respostas,v_dados,v_assinatura,v_cfg,v_evidencia,
     v_documento,v_documento_hash,v_snapshot_hash,v_assinatura_hash,v_conteudo_hash)
  on conflict (token,versao) do nothing returning * into v_row;
  v_inseriu := found;
  if not v_inseriu then
    select * into v_row from public.app_consultoria_aceites
      where token=t and versao=p_versao and academia_id=v_acad limit 1;
  end if;
  if v_row.conteudo_hash is distinct from v_conteudo_hash then
    return jsonb_build_object('erro','aceite_conflitante');
  end if;
  return jsonb_build_object('ok',true,'id',v_row.id,'aceito_em',v_row.aceito_em,
    'documento_hash',v_row.documento_hash,'ja_existia',not v_inseriu);
end;
$$;

revoke all on function public.app_consultoria_documento(text,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.app_consultoria_conclui(text,text,jsonb,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.app_consultoria_conclui(text,text,jsonb,jsonb,jsonb,jsonb) to anon;

-- mt-v814: conversa privada e revisão de cada snapshot do diário alimentar.
-- A autoria nunca entra em retorno.nutricaoV1, que é preenchido pelo aluno.
-- O token é a credencial do aluno. JWT exige vínculo atual com a academia.
create table if not exists public.app_nutricao_feedback (
  token text not null references public.app_aluno(token) on delete cascade,
  academia_id uuid not null references public.academias(id) on delete cascade,
  id text not null check (length(id) between 1 and 100 and id ~ '^[A-Za-z0-9:_-]+$' and id not in ('__proto__','prototype','constructor')),
  registro_id text not null check (length(registro_id) between 1 and 300 and registro_id ~ '^[A-Za-z0-9:_-]+$' and registro_id not in ('__proto__','prototype','constructor')),
  autor text not null check (autor in ('aluno','profissional')),
  autor_id uuid,
  nome text not null check (length(nome) between 1 and 120),
  texto text not null check (length(texto) <= 2000 and octet_length(texto) <= 8000),
  revisado boolean not null default false,
  registro_stamp text not null,
  registro_hash text not null check (length(registro_hash) = 64),
  criado_em timestamptz not null default now(),
  primary key (token,id),
  check ((autor='aluno' and autor_id is null and not revisado) or (autor='profissional' and autor_id is not null)),
  check (btrim(texto) <> '' or revisado)
);
create index if not exists app_nutricao_feedback_conversa_idx
  on public.app_nutricao_feedback(token,academia_id,registro_id,criado_em,id);
create index if not exists app_nutricao_feedback_frequencia_idx
  on public.app_nutricao_feedback(token,autor,autor_id,criado_em);
create index if not exists app_nutricao_feedback_academia_idx
  on public.app_nutricao_feedback(academia_id);
alter table public.app_nutricao_feedback enable row level security;
-- Sem políticas: ninguém lê/grava pela Data API. Somente as duas RPCs abaixo.
revoke all on table public.app_nutricao_feedback from public,anon,authenticated;

create or replace function public.app_nutricao_feedback_lista(t text,p_registro text)
returns jsonb language plpgsql security definer stable set search_path='' as $$
declare v_app public.app_aluno%rowtype; v_uid uuid; v_reg jsonb; v_hash text; v_feedback jsonb;
begin
  if t is null or length(t)<10 or length(t)>300 then return jsonb_build_object('erro','sem_acesso'); end if;
  if p_registro is null or length(p_registro)>300 or p_registro !~ '^[A-Za-z0-9:_-]+$'
    or p_registro in ('__proto__','prototype','constructor') then return jsonb_build_object('erro','Registro inválido.'); end if;
  select * into v_app from public.app_aluno where token=t and revogado_em is null;
  if not found then return jsonb_build_object('erro','sem_acesso'); end if;
  v_uid := auth.uid();
  if v_uid is not null and not exists(select 1 from public.membros where academia_id=v_app.academia_id and user_id=v_uid) then
    return jsonb_build_object('erro','sem_acesso'); end if;
  v_reg := v_app.retorno#>array['nutricaoV1','registros',p_registro];
  if jsonb_typeof(v_reg) is distinct from 'object' or v_reg->>'id' is distinct from p_registro
    or v_reg->>'apagado' is distinct from 'false' then return jsonb_build_object('erro','Refeição não encontrada.'); end if;
  v_hash := encode(sha256(convert_to(v_reg::text,'UTF8')),'hex');
  select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'registroId',f.registro_id,
    'autor',f.autor,'nome',f.nome,'texto',f.texto,'registroVersao',f.registro_stamp,
    'revisado',f.revisado and f.registro_stamp=v_reg->>'atualizadoEm' and f.registro_hash=v_hash,
    'criadoEm',to_char(f.criado_em at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) order by f.criado_em,f.id),'[]'::jsonb)
    into v_feedback from public.app_nutricao_feedback f
    where f.token=t and f.academia_id=v_app.academia_id and f.registro_id=p_registro;
  return jsonb_build_object('ok',true,'feedback',v_feedback);
end $$;
revoke all on function public.app_nutricao_feedback_lista(text,text) from public,anon,authenticated;
grant execute on function public.app_nutricao_feedback_lista(text,text) to anon,authenticated;

create or replace function public.app_nutricao_feedback_envia(
  t text,p_registro text,p_texto text,p_id text,p_origem text default 'aluno',p_revisado boolean default false,
  p_registro_versao text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_app public.app_aluno%rowtype; v_uid uuid; v_reg jsonb; v_hash text; v_nome text;
  v_autor text; v_texto text; v_anterior public.app_nutricao_feedback%rowtype;
begin
  if t is null or length(t)<10 or length(t)>300 then return jsonb_build_object('erro','sem_acesso'); end if;
  if p_registro is null or length(p_registro)>300 or p_registro !~ '^[A-Za-z0-9:_-]+$'
    or p_registro in ('__proto__','prototype','constructor') then return jsonb_build_object('erro','Registro inválido.'); end if;
  if p_id is null or length(p_id)>100 or p_id !~ '^[A-Za-z0-9:_-]+$'
    or p_id in ('__proto__','prototype','constructor') then return jsonb_build_object('erro','Identificador inválido.'); end if;
  if p_origem is null or p_origem not in ('aluno','profissional') or p_revisado is null then
    return jsonb_build_object('erro','Confira a mensagem.'); end if;
  if p_registro_versao is not null and length(p_registro_versao)>40 then
    return jsonb_build_object('erro','Versão da refeição inválida.'); end if;
  if p_texto is null or length(p_texto)>2000 or octet_length(p_texto)>8000
    or translate(p_texto,E'\n\r\t','') ~ '[[:cntrl:]]' then return jsonb_build_object('erro','Escreva uma mensagem de até 2000 caracteres.'); end if;
  v_texto := btrim(p_texto);
  if v_texto='' and not p_revisado then return jsonb_build_object('erro','Escreva uma mensagem.'); end if;
  -- Mesma trava usada por app_nutricao_salva: revisão nunca se prende à metade de uma edição.
  select * into v_app from public.app_aluno where token=t and revogado_em is null for update;
  if not found then return jsonb_build_object('erro','sem_acesso'); end if;
  v_uid := auth.uid();
  if v_uid is not null then
    select coalesce(nullif(btrim(nome),''),'Profissional') into v_nome from public.membros
      where academia_id=v_app.academia_id and user_id=v_uid;
    if not found then return jsonb_build_object('erro','sem_acesso'); end if;
    v_autor := 'profissional';
  else
    if p_origem<>'aluno' or p_revisado then return jsonb_build_object('erro','sem_acesso'); end if;
    v_autor := 'aluno';
    v_nome := coalesce(nullif(btrim(v_app.dados#>>'{dados,a,nome}'),''),'Aluno');
  end if;
  v_nome := left(v_nome,120);
  v_reg := v_app.retorno#>array['nutricaoV1','registros',p_registro];
  if jsonb_typeof(v_reg) is distinct from 'object' or v_reg->>'id' is distinct from p_registro
    or v_reg->>'apagado' is distinct from 'false'
    or not public.app_nutricao_registro_valido(v_reg) then return jsonb_build_object('erro','Refeição não encontrada.'); end if;
  v_hash := encode(sha256(convert_to(v_reg::text,'UTF8')),'hex');
  select * into v_anterior from public.app_nutricao_feedback where token=t and id=p_id;
  if found then
    -- Replay confirma o mesmo evento, nunca cria uma nova revisão da versão atual.
    if v_anterior.academia_id<>v_app.academia_id or v_anterior.registro_id<>p_registro
      or v_anterior.autor<>v_autor or v_anterior.autor_id is distinct from v_uid
      or v_anterior.texto<>v_texto or v_anterior.revisado<>p_revisado
      or (p_revisado and v_anterior.registro_stamp is distinct from p_registro_versao) then
      return jsonb_build_object('erro','Esta mensagem já foi enviada com outro conteúdo.'); end if;
    return public.app_nutricao_feedback_lista(t,p_registro);
  end if;
  -- A confirmação precisa mencionar a versão que o profissional de fato viu.
  if p_revisado and (p_registro_versao is null or p_registro_versao is distinct from v_reg->>'atualizadoEm') then
    return jsonb_build_object('erro','A refeição mudou. Atualize a conversa e confira novamente antes de revisar.'); end if;
  -- Histórico pode ser consultado com plano pausado; novos comentários exigem acompanhamento ativo.
  if coalesce(v_app.dados#>>'{dados,nutricaoApp,ativo}','false')<>'true' then
    return jsonb_build_object('erro','O acompanhamento alimentar está pausado.'); end if;
  if (select count(*) from public.app_nutricao_feedback where token=t and autor=v_autor
      and autor_id is not distinct from v_uid and criado_em>now()-interval '1 minute')>=20
    or (select count(*) from public.app_nutricao_feedback where token=t and autor=v_autor
      and autor_id is not distinct from v_uid and criado_em>now()-interval '1 day')>=100 then
    return jsonb_build_object('erro','Aguarde um pouco antes de enviar novas mensagens.'); end if;
  if (select count(*) from public.app_nutricao_feedback where token=t and registro_id=p_registro)>=200
    or (select count(*) from public.app_nutricao_feedback where token=t)>=5000 then
    return jsonb_build_object('erro','Esta conversa atingiu o limite de mensagens. O histórico continua disponível.'); end if;
  insert into public.app_nutricao_feedback(token,academia_id,id,registro_id,autor,autor_id,nome,texto,revisado,registro_stamp,registro_hash)
    values(t,v_app.academia_id,p_id,p_registro,v_autor,v_uid,v_nome,v_texto,p_revisado,v_reg->>'atualizadoEm',v_hash);
  return public.app_nutricao_feedback_lista(t,p_registro);
end $$;
revoke all on function public.app_nutricao_feedback_envia(text,text,text,text,text,boolean,text) from public,anon,authenticated;
grant execute on function public.app_nutricao_feedback_envia(text,text,text,text,text,boolean,text) to anon,authenticated;

-- mt-v815: indicadores do dashboard sem transportar fotos ou o diário inteiro.
-- Só profissionais autenticados da academia solicitada. Nenhuma escrita.
create or replace function public.personal_nutricao_resumo(
  p_academia uuid,p_tokens text[],p_hoje date)
returns jsonb language plpgsql security definer stable set search_path='' as $$
declare v_uid uuid; v_inicio date; v_limite date; v_alunos jsonb;
begin
  v_uid := auth.uid();
  if v_uid is null or p_academia is null or not exists(
    select 1 from public.membros where academia_id=p_academia and user_id=v_uid
  ) then return jsonb_build_object('erro','sem_acesso'); end if;
  if p_hoje is null or not isfinite(p_hoje) or p_hoje<date '0001-01-07' or p_hoje>date '9999-12-31' then
    return jsonb_build_object('erro','Data inválida.'); end if;
  if p_tokens is null or coalesce(array_ndims(p_tokens),0)<>1 or cardinality(p_tokens)<1 or cardinality(p_tokens)>100
    or exists(select 1 from unnest(p_tokens) x where x is null or length(x)<10 or length(x)>300) then
    return jsonb_build_object('erro','Informe de 1 a 100 acessos válidos por consulta.'); end if;
  v_inicio := p_hoje-6;
  -- O cliente informa seu dia local. Mesmo com relógio adiantado, não contar registros futuros.
  v_limite := least(p_hoje,(now() at time zone 'America/Sao_Paulo')::date);
  select coalesce(jsonb_agg(jsonb_build_object('token',a.token,'registros7dias',(
    select count(*) from jsonb_each(case when jsonb_typeof(a.retorno#>'{nutricaoV1,registros}')='object'
      then a.retorno#>'{nutricaoV1,registros}' else '{}'::jsonb end) r
    where r.key=r.value->>'id' and public.app_nutricao_registro_valido(r.value)
      and r.value->>'apagado'='false'
      and r.value->>'d'>=to_char(v_inicio,'YYYY-MM-DD')
      and r.value->>'d'<=to_char(v_limite,'YYYY-MM-DD')
  )) order by a.token),'[]'::jsonb) into v_alunos
  from public.app_aluno a
  where a.academia_id=p_academia and a.revogado_em is null and a.token=any(p_tokens);
  -- Tokens ausentes/revogados/de outra academia são omitidos, nunca representados como zero.
  return jsonb_build_object('ok',true,'inicio',to_char(v_inicio,'YYYY-MM-DD'),
    'hoje',to_char(p_hoje,'YYYY-MM-DD'),
    'consultadoEm',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'alunos',v_alunos);
end $$;
revoke all on function public.personal_nutricao_resumo(uuid,text[],date) from public,anon,authenticated;
grant execute on function public.personal_nutricao_resumo(uuid,text[],date) to authenticated;
