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
