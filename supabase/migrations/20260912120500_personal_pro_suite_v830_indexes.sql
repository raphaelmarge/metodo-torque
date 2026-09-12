-- Índices de cobertura recomendados pelo Database Advisor após a instalação v830.
create index if not exists personal_importacoes_autor_idx
  on public.personal_importacoes(academia_id, autor_id);
create index if not exists personal_sessoes_profissional_idx
  on public.personal_sessoes(academia_id, profissional_id);
create index if not exists personal_automacoes_autor_idx
  on public.personal_automacoes(academia_id, autor_id);
create index if not exists personal_automacao_fila_automacao_idx
  on public.personal_automacao_fila(automacao_id);
create index if not exists personal_aluno_equipe_substituto_idx
  on public.personal_aluno_equipe(academia_id, substituto_id)
  where substituto_id is not null;
