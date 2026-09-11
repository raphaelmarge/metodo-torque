-- O novo arquivo de fotos não pode bloquear a exclusão já existente da conta.
-- Só as avaliações do autor/academia efetivamente excluídos são removidas.
alter table public.personal_postural
  drop constraint personal_postural_academia_id_fkey,
  add constraint personal_postural_academia_id_fkey foreign key (academia_id)
    references public.academias(id) on delete cascade,
  drop constraint personal_postural_autor_id_fkey,
  add constraint personal_postural_autor_id_fkey foreign key (autor_id)
    references auth.users(id) on delete cascade;
create index personal_postural_autor on public.personal_postural (autor_id);
comment on table public.personal_postural is 'Snapshots privados por academia e autor. Sem UPDATE para authenticated. Mantidos até exclusão explícita da versão ou exclusão da conta/academia. Inativar aluno não elimina histórico. Backups administrativos seguem a retenção da operação.';
