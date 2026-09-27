-- v845. Mudanças por aluno/ficha, histórico transacional e sessões próprias.
-- Migração aditiva. Não regrava dados existentes nem muda tokens de alunos.
create schema if not exists torque_private;
grant usage on schema torque_private to authenticated;

create or replace function torque_private.personal_session_valid()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from auth.sessions s where s.user_id = (select auth.uid())
    and s.id::text = (select auth.jwt()->>'session_id')
    and (s.not_after is null or s.not_after > now()));
$$;
revoke all on function torque_private.personal_session_valid() from public,anon;
grant execute on function torque_private.personal_session_valid() to authenticated;

-- Restritiva: o vínculo existente continua obrigatório. Uma sessão encerrada
-- deixa de ler/gravar o painel mesmo antes do vencimento do JWT em cache.
drop policy if exists dados_sessao_ativa on public.dados;
create policy dados_sessao_ativa on public.dados as restrictive for all to authenticated
using ((select torque_private.personal_session_valid()))
with check ((select torque_private.personal_session_valid()));

create or replace function torque_private.studio_at(doc jsonb, path text[])
returns jsonb language plpgsql immutable security invoker set search_path = '' as $$
declare node jsonb:=doc; key text; matches jsonb;
begin
  foreach key in array path loop
    if jsonb_typeof(node)='array' then
      select jsonb_agg(v) into matches from jsonb_array_elements(node) v where v->>'id'=key;
      if jsonb_array_length(coalesce(matches,'[]'))<>1 then return '{"existe":false}'; end if;
      node:=matches->0;
    elsif jsonb_typeof(node)='object' and node ? key then node:=node->key;
    else return '{"existe":false}'; end if;
  end loop;
  return jsonb_build_object('existe',true,'valor',node);
end $$;

create or replace function torque_private.studio_set(doc jsonb,path text[],next_value jsonb)
returns jsonb language plpgsql immutable security invoker set search_path = '' as $$
declare key text:=path[1]; idx integer; child jsonb; outdoc jsonb:=doc;
begin
  if array_length(path,1) not between 1 and 6 or exists(select 1 from unnest(path) p where p in ('__proto__','constructor','prototype') or length(p) not between 1 and 199) then
    raise exception 'Caminho inválido';
  end if;
  if jsonb_typeof(doc)='array' then
    select (ord-1)::integer into idx from jsonb_array_elements(doc) with ordinality as a(v,ord) where v->>'id'=key;
    if array_length(path,1)>1 then
      if idx is null then raise exception using errcode='PT409',message='O item pai foi alterado.'; end if;
      return jsonb_set(doc,array[idx::text],torque_private.studio_set(doc->idx,path[2:],next_value));
    end if;
    if (next_value->>'existe')::boolean then
      if coalesce(next_value->'valor'->>'id','')<>key then raise exception 'Identificador incompatível'; end if;
      if idx is null then return doc||jsonb_build_array(next_value->'valor'); end if;
      return jsonb_set(doc,array[idx::text],next_value->'valor');
    end if;
    if idx is null then return doc; end if;
    return doc-idx;
  elsif jsonb_typeof(doc)='object' then
    if array_length(path,1)>1 then
      child:=doc->key;
      if jsonb_typeof(child) not in ('array','object') or child is null then raise exception using errcode='PT409',message='O item pai foi alterado.'; end if;
      return jsonb_set(doc,array[key],torque_private.studio_set(child,path[2:],next_value));
    end if;
    if (next_value->>'existe')::boolean then return jsonb_set(doc,array[key],next_value->'valor',true); end if;
    return doc-key;
  end if;
  raise exception using errcode='PT409',message='O formato deste item mudou.';
end $$;

-- As divisões são explícitas: listas desconhecidas continuam atômicas.
create or replace function torque_private.studio_diff(old_doc jsonb,new_doc jsonb,path text[] default '{}')
returns setof jsonb language plpgsql immutable security invoker set search_path = '' as $$
declare a jsonb:=torque_private.studio_at(old_doc,path); b jsonb:=torque_private.studio_at(new_doc,path);
  av jsonb:=a->'valor'; bv jsonb:=b->'valor'; k text; split_object boolean; split_array boolean;
begin
  if a=b then return; end if;
  split_object:=jsonb_typeof(av)='object' and jsonb_typeof(bv)='object' and
    (cardinality(path)=0 or path=array['treinosV2'] or (cardinality(path)=2 and path[1]='treinosV2'));
  split_array:=jsonb_typeof(av)='array' and jsonb_typeof(bv)='array' and
    (path=array['alunos'] or (cardinality(path)=3 and path[1]='treinosV2' and path[3]='fichas'));
  if split_array then
    -- IDs únicos e mesma ordem relativa; caso contrário preserva a lista inteira.
    split_array:=not exists(select 1 from jsonb_array_elements(av||bv) v where jsonb_typeof(v->'id') is distinct from 'string')
      and (select count(*)=count(distinct v->>'id') from jsonb_array_elements(av) v)
      and (select count(*)=count(distinct v->>'id') from jsonb_array_elements(bv) v)
      and jsonb_array_length(bv)>=jsonb_array_length(av)
      and (select coalesce(jsonb_agg(v->>'id' order by ord),'[]') from jsonb_array_elements(bv) with ordinality a(v,ord) where ord<=jsonb_array_length(av))
        = (select coalesce(jsonb_agg(v->>'id' order by ord),'[]') from jsonb_array_elements(av) with ordinality a(v,ord))
      and (select coalesce(jsonb_agg(v->>'id' order by ord),'[]') from jsonb_array_elements(av) with ordinality a(v,ord) where exists(select 1 from jsonb_array_elements(bv) w where w->>'id'=v->>'id'))
        = (select coalesce(jsonb_agg(v->>'id' order by ord),'[]') from jsonb_array_elements(bv) with ordinality a(v,ord) where exists(select 1 from jsonb_array_elements(av) w where w->>'id'=v->>'id'));
  end if;
  if split_object then
    for k in select jsonb_object_keys(av||bv) loop return query select * from torque_private.studio_diff(old_doc,new_doc,path||k); end loop;
  elsif split_array then
    for k in select distinct v->>'id' from jsonb_array_elements(av||bv) v loop return query select * from torque_private.studio_diff(old_doc,new_doc,path||k); end loop;
  else
    if cardinality(path)=0 then return; end if;
    return next jsonb_build_object('caminho',to_jsonb(path),'antes',a,'depois',b);
  end if;
end $$;
revoke all on function torque_private.studio_at(jsonb,text[]),torque_private.studio_set(jsonb,text[],jsonb),torque_private.studio_diff(jsonb,jsonb,text[]) from public,anon;
grant execute on function torque_private.studio_at(jsonb,text[]),torque_private.studio_set(jsonb,text[],jsonb),torque_private.studio_diff(jsonb,jsonb,text[]) to authenticated;

create table if not exists public.personal_alteracoes (
  id uuid primary key default gen_random_uuid(),
  academia_id uuid not null references public.academias(id) on delete cascade,
  autor_id uuid, autor_nome text not null default '', criado_em timestamptz not null default clock_timestamp(),
  caminho text[] not null, antes jsonb not null, depois jsonb not null,
  revisao timestamptz not null, origem text not null default 'edicao'
);
create index if not exists personal_alteracoes_academia_data on public.personal_alteracoes(academia_id,criado_em desc,id desc);
alter table public.personal_alteracoes enable row level security;
revoke all on public.personal_alteracoes from anon,authenticated;
grant select on public.personal_alteracoes to authenticated;
drop policy if exists personal_alteracoes_leitura on public.personal_alteracoes;
create policy personal_alteracoes_leitura on public.personal_alteracoes for select to authenticated
using (academia_id in (select public.minhas_academias()) and (select torque_private.personal_session_valid()));

create or replace function torque_private.personal_history()
returns trigger language plpgsql security definer set search_path = '' as $$
declare previous jsonb:='{}'; op jsonb; who text;
begin
  if new.chave<>'mtapp:ptStudio' or jsonb_typeof(new.valor)<>'object' then return new; end if;
  if tg_op='UPDATE' then previous:=old.valor; end if;
  select coalesce(m.nome,'') into who from public.membros m where m.academia_id=new.academia_id and m.user_id=auth.uid();
  for op in select * from torque_private.studio_diff(coalesce(previous,'{}'),new.valor) loop
    insert into public.personal_alteracoes(academia_id,autor_id,autor_nome,caminho,antes,depois,revisao,origem)
    values(new.academia_id,auth.uid(),coalesce(who,''),array(select jsonb_array_elements_text(op->'caminho')),op->'antes',op->'depois',new.atualizado,
      case when current_setting('mt.history_restore',true)='1' then 'restauracao' else 'edicao' end);
  end loop;
  return new;
end $$;
revoke all on function torque_private.personal_history() from public,anon,authenticated;
drop trigger if exists personal_history_tg on public.dados;
create trigger personal_history_tg after insert or update on public.dados for each row execute function torque_private.personal_history();

create or replace function public.dados_personal_patch(p_academia uuid,p_operacoes jsonb)
returns table(chave text,valor jsonb,atualizado timestamptz)
language plpgsql security invoker set search_path = '' as $$
declare current_doc jsonb; next_doc jsonb; op jsonb; path text[]; existing jsonb;
begin
  if jsonb_typeof(p_operacoes) is distinct from 'array' or jsonb_array_length(p_operacoes)>500 or octet_length(p_operacoes::text)>8388608 then raise exception 'Lote inválido'; end if;
  select d.valor into current_doc from public.dados d where d.academia_id=p_academia and d.chave='mtapp:ptStudio' for update;
  if not found then raise exception using errcode='PT409',message='Reabra o painel para confirmar a conta e a versão atual.'; end if;
  next_doc:=current_doc;
  for op in select * from jsonb_array_elements(p_operacoes) loop
    if jsonb_typeof(op->'caminho') is distinct from 'array' or jsonb_array_length(op->'caminho') not between 1 and 6
      or jsonb_typeof(op->'antes'->'existe') is distinct from 'boolean' or jsonb_typeof(op->'depois'->'existe') is distinct from 'boolean'
      or ((op->'depois'->>'existe')::boolean and not (op->'depois' ? 'valor')) then raise exception 'Operação inválida'; end if;
    path:=array(select jsonb_array_elements_text(op->'caminho'));
    existing:=torque_private.studio_at(next_doc,path);
    if existing=op->'depois' then continue; end if;
    if existing<>op->'antes' then raise exception using errcode='PT409',message='O mesmo item foi alterado em outro aparelho. Seu rascunho foi preservado.'; end if;
    next_doc:=torque_private.studio_set(next_doc,path,op->'depois');
  end loop;
  if next_doc is distinct from current_doc then
    perform set_config('mt.sync_rpc','1',true);
    update public.dados d set valor=next_doc where d.academia_id=p_academia and d.chave='mtapp:ptStudio';
  end if;
  return query select d.chave,d.valor,d.atualizado from public.dados d where d.academia_id=p_academia and d.chave='mtapp:ptStudio';
end $$;
revoke all on function public.dados_personal_patch(uuid,jsonb) from public,anon;
grant execute on function public.dados_personal_patch(uuid,jsonb) to authenticated;

create or replace function public.personal_alteracao_restaura(p_academia uuid,p_id uuid)
returns table(chave text,valor jsonb,atualizado timestamptz)
language plpgsql security invoker set search_path = '' as $$
declare item public.personal_alteracoes; field text;
begin
  select * into item from public.personal_alteracoes h where h.id=p_id and h.academia_id=p_academia;
  if not found then raise exception using errcode='42501',message='Histórico indisponível para esta conta.'; end if;
  -- Restaurar ficha/cadastro não recria/exclui alunos nem muda acessos publicados.
  if item.caminho=array['alunos'] or (item.caminho[1]='alunos' and (not (item.antes->>'existe')::boolean or not (item.depois->>'existe')::boolean)) then
    raise exception 'Inclusão ou exclusão de aluno exige revisão do cadastro e dos acessos.';
  end if;
  if item.caminho[1]='alunos' then
    foreach field in array array['appTokenP','appRevogadoEm','appLogin','appPubEm','appVer'] loop
      if (item.antes->'valor'->field) is distinct from (item.depois->'valor'->field) then raise exception 'Alterações de acesso devem ser feitas no cadastro do aluno.'; end if;
    end loop;
  end if;
  perform set_config('mt.history_restore','1',true);
  return query select * from public.dados_personal_patch(p_academia,jsonb_build_array(jsonb_build_object('caminho',item.caminho,'antes',item.depois,'depois',item.antes)));
end $$;
revoke all on function public.personal_alteracao_restaura(uuid,uuid) from public,anon;
grant execute on function public.personal_alteracao_restaura(uuid,uuid) to authenticated;

create or replace function torque_private.personal_sessions()
returns table(id uuid,criada_em timestamptz,atualizada_em timestamptz,navegador text,atual boolean)
language sql stable security definer set search_path = '' as $$
  select s.id,s.created_at,s.updated_at,left(coalesce(s.user_agent,''),240),s.id::text=(select auth.jwt()->>'session_id')
  from auth.sessions s where s.user_id=(select auth.uid()) and (s.not_after is null or s.not_after>now())
    and (select torque_private.personal_session_valid()) order by s.updated_at desc nulls last limit 50;
$$;
revoke all on function torque_private.personal_sessions() from public,anon;
grant execute on function torque_private.personal_sessions() to authenticated;
create or replace function public.personal_sessoes()
returns table(id uuid,criada_em timestamptz,atualizada_em timestamptz,navegador text,atual boolean)
language sql stable security invoker set search_path = '' as $$ select * from torque_private.personal_sessions(); $$;
revoke all on function public.personal_sessoes() from public,anon;
grant execute on function public.personal_sessoes() to authenticated;

create or replace function public.personal_sessao_ativa()
returns boolean language sql stable security invoker set search_path = '' as $$ select torque_private.personal_session_valid(); $$;
revoke all on function public.personal_sessao_ativa() from public,anon;
grant execute on function public.personal_sessao_ativa() to authenticated;

-- Revogação não destrutiva e registro local confirmados na mesma transação.
create or replace function public.personal_acesso_revoga(p_academia uuid,p_aluno text,p_revisao timestamptz)
returns table(chave text,valor jsonb,atualizado timestamptz)
language plpgsql security invoker set search_path = '' as $$
declare doc jsonb; student jsonb; revised jsonb; result jsonb;
begin
  select d.valor into doc from public.dados d where d.academia_id=p_academia and d.chave='mtapp:ptStudio' and d.atualizado=p_revisao for update;
  if not found then raise exception using errcode='PT409',message='O painel mudou. Atualize antes de revogar o acesso.'; end if;
  student:=torque_private.studio_at(doc,array['alunos',p_aluno])->'valor';
  if coalesce(student->>'appTokenP','')='' then raise exception 'Este aluno não tem app publicado.'; end if;
  -- Confere o vínculo no servidor; nunca confia apenas no token salvo no painel.
  if not exists(select 1 from public.app_aluno a where a.token=student->>'appTokenP' and a.academia_id=p_academia) then raise exception using errcode='42501',message='Acesso indisponível para esta conta.'; end if;
  result:=public.aluno_revoga_acesso(student->>'appTokenP',false)::jsonb;
  if result ? 'erro' then raise exception '%',result->>'erro'; end if;
  revised:=(student-'appPubEm'-'appVer')||jsonb_build_object('appRevogadoEm',to_char(now() at time zone 'America/Sao_Paulo','YYYY-MM-DD'));
  return query select * from public.dados_personal_patch(p_academia,jsonb_build_array(jsonb_build_object('caminho',array['alunos',p_aluno],
    'antes',jsonb_build_object('existe',true,'valor',student),'depois',jsonb_build_object('existe',true,'valor',revised))));
end $$;
revoke all on function public.personal_acesso_revoga(uuid,text,timestamptz) from public,anon;
grant execute on function public.personal_acesso_revoga(uuid,text,timestamptz) to authenticated;

notify pgrst,'reload schema';
