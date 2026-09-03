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
  for update using (academia_id in (select public.minhas_academias()));
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
create or replace function public.app_agenda_pede(t text, p_dia date, p_hora text, p_obs text)
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
  if p_dia is null or p_dia < public.hoje_br() then
    return json_build_object('erro', 'dia_invalido');
  end if;
  if (select count(*) from app_agenda where token = t and status = 'pedido') >= 10 then
    return json_build_object('erro', 'muitos_pedidos');
  end if;
  insert into app_agenda (academia_id, token, dia, hora, obs)
    values (v_acad, t, p_dia, left(coalesce(p_hora, ''), 5), left(trim(coalesce(p_obs, '')), 200));
  return json_build_object('ok', true);
end;
$$;

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
