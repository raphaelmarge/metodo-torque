-- Torque Personal — Central Pro v830
-- Estruturas aditivas; nenhuma tabela/registro existente é alterado.

create table if not exists public.personal_importacoes (
  id uuid primary key default gen_random_uuid(),
  academia_id uuid not null references public.academias(id) on delete cascade,
  autor_id uuid not null,
  aluno_id text,
  origem text not null check (origem in ('csv','json','txt','xlsx','xls','pdf','arquivo')),
  nome_arquivo text not null default '',
  status text not null default 'revisar' check (status in ('revisar','aprovada','descartada')),
  dados jsonb not null default '{}'::jsonb check (jsonb_typeof(dados)='object'),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint personal_importacoes_autor_membro_fkey foreign key (academia_id, autor_id)
    references public.membros(academia_id, user_id) on delete cascade
);

create table if not exists public.personal_sessoes (
  id uuid primary key default gen_random_uuid(),
  academia_id uuid not null references public.academias(id) on delete cascade,
  aluno_id text not null check (length(aluno_id) between 1 and 160),
  profissional_id uuid not null,
  status text not null default 'em_andamento' check (status in ('em_andamento','concluida','cancelada')),
  iniciado_em timestamptz not null default now(),
  encerrado_em timestamptz,
  dados jsonb not null default '{}'::jsonb check (jsonb_typeof(dados)='object' and octet_length(dados::text)<=250000),
  constraint personal_sessoes_profissional_membro_fkey foreign key (academia_id, profissional_id)
    references public.membros(academia_id, user_id) on delete restrict
);

create table if not exists public.personal_automacoes (
  id uuid primary key default gen_random_uuid(),
  academia_id uuid not null references public.academias(id) on delete cascade,
  autor_id uuid not null,
  nome text not null check (length(nome) between 1 and 160),
  gatilho text not null check (gatilho in ('questionario.respondido','aluno.novo','agenda.cancelada')),
  condicao jsonb not null default '{}'::jsonb check (jsonb_typeof(condicao)='object'),
  acao jsonb not null default '{}'::jsonb check (jsonb_typeof(acao)='object'),
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint personal_automacoes_autor_membro_fkey foreign key (academia_id, autor_id)
    references public.membros(academia_id, user_id) on delete cascade
);

create table if not exists public.personal_automacao_fila (
  id uuid primary key default gen_random_uuid(),
  academia_id uuid not null references public.academias(id) on delete cascade,
  automacao_id uuid not null references public.personal_automacoes(id) on delete cascade,
  aluno_id text,
  gatilho text not null,
  acao jsonb not null default '{}'::jsonb check (jsonb_typeof(acao)='object'),
  origem jsonb not null default '{}'::jsonb check (jsonb_typeof(origem)='object'),
  status text not null default 'pendente' check (status in ('pendente','concluida','ignorada')),
  criado_em timestamptz not null default now(),
  concluido_em timestamptz
);

create table if not exists public.personal_lista_espera (
  id uuid primary key default gen_random_uuid(),
  academia_id uuid not null references public.academias(id) on delete cascade,
  aluno_id text not null check (length(aluno_id) between 1 and 160),
  dia date not null,
  hora time not null,
  status text not null default 'aguardando' check (status in ('aguardando','ofertada','confirmada','cancelada')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (academia_id, aluno_id, dia, hora)
);

create table if not exists public.personal_creditos (
  academia_id uuid not null references public.academias(id) on delete cascade,
  aluno_id text not null check (length(aluno_id) between 1 and 160),
  saldo integer not null default 0 check (saldo >= 0),
  atualizado_em timestamptz not null default now(),
  primary key (academia_id, aluno_id)
);

create table if not exists public.personal_aluno_equipe (
  academia_id uuid not null references public.academias(id) on delete cascade,
  aluno_id text not null check (length(aluno_id) between 1 and 160),
  responsavel_id uuid not null,
  substituto_id uuid,
  atualizado_em timestamptz not null default now(),
  primary key (academia_id, aluno_id),
  constraint personal_aluno_equipe_responsavel_fkey foreign key (academia_id, responsavel_id)
    references public.membros(academia_id, user_id) on delete restrict,
  constraint personal_aluno_equipe_substituto_fkey foreign key (academia_id, substituto_id)
    references public.membros(academia_id, user_id) on delete set null,
  constraint personal_aluno_equipe_pessoas_diferentes check (substituto_id is null or substituto_id <> responsavel_id)
);

create index if not exists personal_importacoes_academia_criado_idx on public.personal_importacoes(academia_id, criado_em desc);
create index if not exists personal_sessoes_academia_aluno_idx on public.personal_sessoes(academia_id, aluno_id, iniciado_em desc);
create index if not exists personal_automacoes_academia_ativa_idx on public.personal_automacoes(academia_id, ativa) where ativa;
create index if not exists personal_automacao_fila_pendentes_idx on public.personal_automacao_fila(academia_id, status, criado_em desc);
create index if not exists personal_lista_espera_fila_idx on public.personal_lista_espera(academia_id, status, dia, hora);
create index if not exists personal_aluno_equipe_responsavel_idx on public.personal_aluno_equipe(academia_id, responsavel_id);

alter table public.personal_importacoes enable row level security;
alter table public.personal_sessoes enable row level security;
alter table public.personal_automacoes enable row level security;
alter table public.personal_automacao_fila enable row level security;
alter table public.personal_lista_espera enable row level security;
alter table public.personal_creditos enable row level security;
alter table public.personal_aluno_equipe enable row level security;

-- Supabase passou a poder criar tabelas public sem exposição automática ao Data API.
-- Expomos somente para usuários autenticados; anon não recebe privilégios.
grant select, insert, update, delete on public.personal_importacoes to authenticated;
grant select, insert, update, delete on public.personal_sessoes to authenticated;
grant select, insert, update, delete on public.personal_automacoes to authenticated;
grant select, insert, update, delete on public.personal_automacao_fila to authenticated;
grant select, insert, update, delete on public.personal_lista_espera to authenticated;
grant select, insert, update, delete on public.personal_creditos to authenticated;
grant select, insert, update, delete on public.personal_aluno_equipe to authenticated;

revoke all on public.personal_importacoes from anon;
revoke all on public.personal_sessoes from anon;
revoke all on public.personal_automacoes from anon;
revoke all on public.personal_automacao_fila from anon;
revoke all on public.personal_lista_espera from anon;
revoke all on public.personal_creditos from anon;
revoke all on public.personal_aluno_equipe from anon;

create policy personal_importacoes_membros on public.personal_importacoes for all to authenticated
  using (academia_id in (select public.minhas_academias()))
  with check (academia_id in (select public.minhas_academias()));
create policy personal_sessoes_membros on public.personal_sessoes for all to authenticated
  using (academia_id in (select public.minhas_academias()))
  with check (academia_id in (select public.minhas_academias()));
create policy personal_automacoes_membros on public.personal_automacoes for all to authenticated
  using (academia_id in (select public.minhas_academias()))
  with check (academia_id in (select public.minhas_academias()));
create policy personal_automacao_fila_membros on public.personal_automacao_fila for all to authenticated
  using (academia_id in (select public.minhas_academias()))
  with check (academia_id in (select public.minhas_academias()));
create policy personal_lista_espera_membros on public.personal_lista_espera for all to authenticated
  using (academia_id in (select public.minhas_academias()))
  with check (academia_id in (select public.minhas_academias()));
create policy personal_creditos_membros on public.personal_creditos for all to authenticated
  using (academia_id in (select public.minhas_academias()))
  with check (academia_id in (select public.minhas_academias()));
create policy personal_aluno_equipe_membros on public.personal_aluno_equipe for all to authenticated
  using (academia_id in (select public.minhas_academias()))
  with check (academia_id in (select public.minhas_academias()));

-- Questionário respondido -> providência. A função não é API pública e não prescreve nada.
create or replace function torque_private.personal_automacao_enfileira_questionario()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, torque_private
as $$
begin
  insert into public.personal_automacao_fila(academia_id, automacao_id, aluno_id, gatilho, acao, origem)
  select new.academia_id, a.id, new.token, a.gatilho, a.acao,
         jsonb_build_object('app_quest_id',new.id,'questionario',new.questionario,'token',new.token)
    from public.personal_automacoes a
   where a.academia_id = new.academia_id
     and a.ativa
     and a.gatilho = 'questionario.respondido';
  return new;
end;
$$;
revoke all on function torque_private.personal_automacao_enfileira_questionario() from public, anon, authenticated;

drop trigger if exists personal_automacao_questionario_ai on public.app_quest;
create trigger personal_automacao_questionario_ai
after insert on public.app_quest
for each row execute function torque_private.personal_automacao_enfileira_questionario();
