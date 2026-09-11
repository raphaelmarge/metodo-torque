-- Revisão/homologação: não aplicar automaticamente em produção.
-- Fotos não entram em ptStudio, app_aluno nem em buckets públicos.
create or replace function public.personal_postural_documento_valido(d jsonb)
returns boolean language plpgsql immutable security invoker
set search_path = '' as $$
declare m jsonb; p jsonb; ids text[] := '{}'; n integer;
begin
  if jsonb_typeof(d) is distinct from 'object' or octet_length(d::text) > 900000 then return false; end if;
  if not coalesce(
    d->'version' = '1'::jsonb and jsonb_typeof(d->'image') = 'object'
    and jsonb_typeof(d#>'{image,width}') = 'number' and jsonb_typeof(d#>'{image,height}') = 'number'
    and (d#>>'{image,width}')::numeric between 1 and 1600
    and (d#>>'{image,height}')::numeric between 1 and 1600
    and trunc((d#>>'{image,width}')::numeric) = (d#>>'{image,width}')::numeric
    and trunc((d#>>'{image,height}')::numeric) = (d#>>'{image,height}')::numeric
    and jsonb_typeof(d#>'{image,data}') = 'string'
    and length(d#>>'{image,data}') <= 750000
    and (d#>>'{image,data}') ~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$'
    and jsonb_typeof(d->'rotation') = 'number' and (d->>'rotation')::numeric between -180 and 180
    and jsonb_typeof(d->'mirrored') = 'boolean'
    and jsonb_typeof(d#>'{grid,visible}') = 'boolean'
    and jsonb_typeof(d#>'{grid,columns}') = 'number' and (d#>>'{grid,columns}')::numeric between 4 and 30
    and jsonb_typeof(d#>'{grid,opacity}') = 'number' and (d#>>'{grid,opacity}')::numeric between 0.1 and 0.8
    and jsonb_typeof(d#>'{plumb,visible}') = 'boolean'
    and jsonb_typeof(d#>'{plumb,x}') = 'number' and (d#>>'{plumb,x}')::numeric between 0 and 1
    and jsonb_typeof(d->'marks') = 'array', false) then return false; end if;
  if jsonb_array_length(d->'marks') > 60 then return false; end if;
  for m in select value from jsonb_array_elements(d->'marks') loop
    n := case m->>'type' when 'horizontal' then 2 when 'vertical' then 2 when 'angle' then 3 when 'note' then 1 else 0 end;
    if not coalesce(n > 0 and jsonb_typeof(m->'id') = 'string' and (m->>'id') ~ '^[a-zA-Z0-9-]{1,64}$'
      and not (m->>'id' = any(ids)) and jsonb_typeof(m->'text') = 'string' and length(m->>'text') <= 2000
      and jsonb_typeof(m->'points') = 'array', false) then return false; end if;
    if jsonb_array_length(m->'points') <> n then return false; end if;
    ids := array_append(ids, m->>'id');
    for p in select value from jsonb_array_elements(m->'points') loop
      if not coalesce(jsonb_typeof(p->'x') = 'number' and jsonb_typeof(p->'y') = 'number'
        and (p->>'x')::numeric between 0 and 1 and (p->>'y')::numeric between 0 and 1, false) then return false; end if;
    end loop;
  end loop;
  return true;
exception when others then return false;
end;
$$;
revoke all on function public.personal_postural_documento_valido(jsonb) from public, anon;
grant execute on function public.personal_postural_documento_valido(jsonb) to authenticated, service_role;

create table public.personal_postural (
  id uuid primary key,
  academia_id uuid not null references public.academias(id),
  autor_id uuid not null references auth.users(id),
  aluno_id text not null check (length(aluno_id) between 1 and 128),
  data date not null,
  vista text not null check (vista in ('frente','costas','esquerda','direita')),
  criado_em timestamptz not null default now(),
  parent_id uuid,
  consentimento boolean not null check (consentimento),
  documento jsonb not null check (public.personal_postural_documento_valido(documento))
);
create index personal_postural_historico on public.personal_postural (academia_id, autor_id, aluno_id, criado_em desc, id desc);
alter table public.personal_postural enable row level security;
revoke all on public.personal_postural from public, anon, authenticated;
grant select, insert, delete on public.personal_postural to authenticated;
grant all on public.personal_postural to service_role;

create policy personal_postural_autor_le on public.personal_postural for select to authenticated
using (autor_id = (select auth.uid()) and academia_id in (select public.minhas_academias()));
create policy personal_postural_autor_exclui on public.personal_postural for delete to authenticated
using (autor_id = (select auth.uid()) and academia_id in (select public.minhas_academias()));
create policy personal_postural_autor_insere on public.personal_postural for insert to authenticated
with check (
  autor_id = (select auth.uid()) and academia_id in (select public.minhas_academias())
  and exists (
    select 1 from public.dados d
    cross join lateral jsonb_array_elements(case when jsonb_typeof(d.valor->'alunos') = 'array' then d.valor->'alunos' else '[]'::jsonb end) a
    where d.academia_id = personal_postural.academia_id and d.chave = 'mtapp:ptStudio'
      and a->>'id' = personal_postural.aluno_id
  )
);
comment on table public.personal_postural is 'Snapshots fotográficos privados por academia e autor. Sem UPDATE para authenticated. Retenção e exclusão por aluno devem ser homologadas antes da liberação.';
