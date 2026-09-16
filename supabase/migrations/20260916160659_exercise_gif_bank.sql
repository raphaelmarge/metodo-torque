-- Banco de demonstrações animadas dos exercícios.
--
-- Os GIFs curados pelo TORQUE ficam na raiz do bucket e são somente leitura.
-- Cada academia pode enviar arquivos apenas para a própria pasta UUID. O bucket
-- é público porque o app do aluno não usa sessão; ser público libera download,
-- não upload/listagem/remoção, que continuam protegidos pelas políticas abaixo.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exercicios', 'exercicios', true, 8388608, array['image/gif']::text[])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "exercicios_listar_banco_e_proprios" on storage.objects;
create policy "exercicios_listar_banco_e_proprios"
on storage.objects for select
to authenticated
using (
  bucket_id = 'exercicios'
  and (
    position('/' in name) = 0
    or (storage.foldername(name))[1] in (
      select public.minhas_academias()::text
    )
  )
);

drop policy if exists "exercicios_enviar_na_propria_academia" on storage.objects;
create policy "exercicios_enviar_na_propria_academia"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'exercicios'
  and array_length(storage.foldername(name), 1) = 1
  and (storage.foldername(name))[1] in (
    select public.minhas_academias()::text
  )
  and lower(storage.extension(name)) = 'gif'
);

drop policy if exists "exercicios_remover_da_propria_academia" on storage.objects;
create policy "exercicios_remover_da_propria_academia"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'exercicios'
  and array_length(storage.foldername(name), 1) = 1
  and (storage.foldername(name))[1] in (
    select public.minhas_academias()::text
  )
);
