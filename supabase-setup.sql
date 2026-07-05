-- Método Torque — estrutura da sincronização online.
-- Cole este arquivo inteiro no SQL Editor do Supabase e clique em Run.

-- Uma linha por (usuário, chave de dados). O valor é o JSON do programa
-- (metas, manutenção, checklist, funil, etc.).
create table if not exists public.dados (
  user_id uuid not null references auth.users (id) on delete cascade,
  chave text not null,
  valor jsonb,
  atualizado timestamptz not null default now(),
  primary key (user_id, chave)
);

alter table public.dados enable row level security;

-- cada conta enxerga e altera apenas os próprios dados
create policy "dados_select_proprio" on public.dados
  for select using (auth.uid() = user_id);
create policy "dados_insert_proprio" on public.dados
  for insert with check (auth.uid() = user_id);
create policy "dados_update_proprio" on public.dados
  for update using (auth.uid() = user_id);
create policy "dados_delete_proprio" on public.dados
  for delete using (auth.uid() = user_id);
