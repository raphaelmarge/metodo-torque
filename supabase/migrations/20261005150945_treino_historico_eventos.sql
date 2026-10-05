-- Histórico por sessão: migração aditiva, sem backfill nem alteração do retorno legado.
-- Autorização do aluno segue a credencial por token já usada por app_aluno.
-- Não há JWT do aluno; auth.uid() não autentica esse fluxo.
begin;
create table if not exists public.app_treino_eventos (
  token text not null references public.app_aluno(token) on delete cascade,
  evento_id text not null,
  sequencia bigint generated always as identity,
  evento jsonb not null,
  recebido_em timestamptz not null default clock_timestamp(),
  primary key (token, evento_id)
);
create unique index if not exists app_treino_eventos_pagina on public.app_treino_eventos(token, sequencia);
alter table public.app_treino_eventos enable row level security;
revoke all on public.app_treino_eventos from public, anon, authenticated;
revoke all on sequence public.app_treino_eventos_sequencia_seq from public, anon, authenticated;

create or replace function public.app_treino_evento_valido(e jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare k text; d date; ts timestamptz;
begin
  if e is null or jsonb_typeof(e) <> 'object' or e->'v' is distinct from '1'::jsonb
     or jsonb_typeof(e->'id') is distinct from 'string'
     or jsonb_typeof(e->'session') is distinct from 'string'
     or jsonb_typeof(e->'actor') is distinct from 'string'
     or coalesce(e->>'id','') !~ '^[a-zA-Z0-9:_-]{1,180}$'
     or coalesce(e->>'session','') !~ '^[a-zA-Z0-9:_-]{1,180}$'
     or coalesce(e->>'actor','') !~ '^[a-zA-Z0-9:_-]{1,180}$'
     or coalesce(e->>'at','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
     or octet_length(e::text)>2000000 then return false; end if;
  ts := (e->>'at')::timestamptz;
  if to_char(ts at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') <> e->>'at' then return false; end if;
  if e->>'type' = 'start' then
    if e->>'id' <> 'start:' || (e->>'session')
       or coalesce(e->>'kind','') not in ('musculacao','corrida','circuito')
       or jsonb_typeof(e->'prescribed') is distinct from 'object'
       or jsonb_typeof(e->'legacy') is distinct from 'boolean'
       or coalesce(e->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
    d := (e->>'date')::date;
    return to_char(d,'YYYY-MM-DD') = e->>'date' and
      (e->>'legacy' <> 'true' or e->'prescribed' = '{}'::jsonb);
  elsif e->>'type' = 'finish' then
    return jsonb_typeof(e->'value') = 'object';
  elsif e->>'type' in ('result','correction') then
    if jsonb_typeof(e->'target') is distinct from 'string' or coalesce(e->>'target','') !~ '^[a-zA-Z0-9:_-]{1,180}$'
       or jsonb_typeof(e->'value') is distinct from 'object'
       or jsonb_typeof(e->'parents') is distinct from 'array'
       or jsonb_array_length(e->'parents') > 100 then return false; end if;
    if exists(select 1 from jsonb_array_elements(e->'parents') p
      where jsonb_typeof(p) <> 'string' or p#>>'{}' !~ '^[a-zA-Z0-9:_-]{1,180}$' or p#>>'{}' = e->>'id') then return false; end if;
    if (select count(*) <> count(distinct p) from jsonb_array_elements(e->'parents') p) then return false; end if;
    return e->>'type' <> 'correction' or (jsonb_typeof(e->'reason') = 'string' and length(btrim(e->>'reason')) between 1 and 500);
  end if;
  return false;
exception when invalid_datetime_format or datetime_field_overflow then return false;
end $$;
revoke all on function public.app_treino_evento_valido(jsonb) from public, anon, authenticated;

-- SECURITY DEFINER é necessário para a credencial por token do app existente.
-- Tabela sem acesso direto; search_path vazio; token ativo checado em cada RPC.
-- Lock por aluno serializa commit/cursor e revogação sem bloquear outros alunos.
create or replace function public.app_treino_eventos_grava(t text, p_eventos jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e jsonb; old jsonb; n integer; ids jsonb := '[]'::jsonb;
begin
  perform 1 from public.app_aluno where token=t and revogado_em is null for update;
  if not found then return jsonb_build_object('ok',false,'erro','sem_acesso'); end if;
  if p_eventos is null or jsonb_typeof(p_eventos)<>'array' then raise exception 'INVALID_BATCH' using errcode='22023'; end if;
  n := jsonb_array_length(p_eventos);
  if n>50 or octet_length(p_eventos::text)>4000000 then raise exception 'BATCH_TOO_LARGE' using errcode='22023'; end if;
  for e in select value from jsonb_array_elements(p_eventos) loop
    if public.app_treino_evento_valido(e) is distinct from true then raise exception 'INVALID_EVENT' using errcode='22023'; end if;
    select evento into old from public.app_treino_eventos where token=t and evento_id=e->>'id';
    if found and old <> e then raise exception 'EVENT_ID_COLLISION' using errcode='22023'; end if;
    insert into public.app_treino_eventos(token,evento_id,evento) values(t,e->>'id',e) on conflict(token,evento_id) do nothing;
    ids := ids || jsonb_build_array(e->>'id');
  end loop;
  -- Pai/start podem estar no mesmo lote em qualquer ordem, mas não em outro aluno.
  for e in select value from jsonb_array_elements(p_eventos) loop
    if e->>'type'<>'start' and not exists(select 1 from public.app_treino_eventos x
      where x.token=t and x.evento_id='start:'||(e->>'session') and x.evento->>'type'='start') then
      raise exception 'SESSION_NOT_FOUND' using errcode='22023';
    end if;
    if e->>'type' in ('result','correction') and exists(
      select 1 from jsonb_array_elements_text(e->'parents') p
      where not exists(select 1 from public.app_treino_eventos x where x.token=t and x.evento_id=p
        and x.evento->>'session'=e->>'session' and x.evento->>'target'=e->>'target'
        and x.evento->>'type' in ('result','correction'))
    ) then raise exception 'INVALID_PARENT' using errcode='22023'; end if;
  end loop;
  if exists (
    with recursive ancestry as (
      select item->>'id' as id, array[item->>'id']::text[] as path, false as cycle
        from jsonb_array_elements(p_eventos) item where item->>'type' in ('result','correction')
      union all
      select p.id, a.path || p.id, p.id=any(a.path)
        from ancestry a join public.app_treino_eventos x on x.token=t and x.evento_id=a.id
        cross join lateral jsonb_array_elements_text(coalesce(x.evento->'parents','[]'::jsonb)) p(id)
        where not a.cycle and cardinality(a.path)<=1000
    ) select 1 from ancestry where cycle or cardinality(path)>1000
  ) then raise exception 'REVISION_CYCLE_OR_DEPTH' using errcode='22023'; end if;
  return jsonb_build_object('ok',true,'ids',ids);
end $$;
revoke all on function public.app_treino_eventos_grava(text,jsonb) from public, anon, authenticated;
grant execute on function public.app_treino_eventos_grava(text,jsonb) to anon, authenticated;

create or replace function public.app_treino_eventos_lista(t text, p_apos bigint default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare entries jsonb; cursor_final bigint;
begin
  perform 1 from public.app_aluno where token=t and revogado_em is null for share;
  if not found then return jsonb_build_object('ok',false,'erro','sem_acesso'); end if;
  if p_apos is null or p_apos<0 then raise exception 'INVALID_CURSOR' using errcode='22023'; end if;
  select coalesce(jsonb_agg(x.evento order by x.sequencia),'[]'::jsonb),coalesce(max(x.sequencia),p_apos)
    into entries,cursor_final from (select evento,sequencia,sum(octet_length(evento::text)) over(order by sequencia) as bytes
      from (select evento,sequencia from public.app_treino_eventos where token=t and sequencia>p_apos order by sequencia limit 50) page) x where x.bytes<=4000000;
  return jsonb_build_object('ok',true,'eventos',entries,'cursor',cursor_final::text,
    'mais',exists(select 1 from public.app_treino_eventos where token=t and sequencia>cursor_final));
end $$;
revoke all on function public.app_treino_eventos_lista(text,bigint) from public, anon, authenticated;
grant execute on function public.app_treino_eventos_lista(text,bigint) to anon, authenticated;
commit;
