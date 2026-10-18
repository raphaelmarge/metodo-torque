-- Correção técnica: somente a Edge autenticada acessa metadados e mídia privada.
-- O token do aluno mantém o contrato existente; nunca aparece no caminho do objeto.
begin;
create table public.app_tecnica_revisoes (
  id uuid primary key,
  academia_id uuid not null references public.academias(id),
  token text not null references public.app_aluno(token) on delete cascade,
  contexto jsonb not null check (jsonb_typeof(contexto)='object' and octet_length(contexto::text)<12000),
  estado text not null default 'rascunho' check (estado in ('rascunho','pendente','respondida','vista')),
  comentarios jsonb not null default '[]'::jsonb check (jsonb_typeof(comentarios)='array' and octet_length(comentarios::text)<200000),
  versao integer not null default 1 check (versao>0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  apagado_em timestamptz,
  limpeza_apos timestamptz,
  limpo_em timestamptz
);
create index app_tecnica_por_aluno on public.app_tecnica_revisoes(token,criado_em desc);
create index app_tecnica_fila on public.app_tecnica_revisoes(academia_id,estado,criado_em);
create table public.app_tecnica_arquivos (
  id uuid primary key,
  revisao_id uuid not null references public.app_tecnica_revisoes(id) on delete cascade,
  caminho text not null unique,
  tipo text not null check (tipo in ('video','audio')),
  mime text not null,
  bytes integer not null check (bytes>0 and bytes<=26214400),
  pronto boolean not null default false,
  criado_em timestamptz not null default now(),
  upload_assinado_em timestamptz
);
create index app_tecnica_arquivos_revisao on public.app_tecnica_arquivos(revisao_id);
create unique index app_tecnica_um_video on public.app_tecnica_arquivos(revisao_id) where tipo='video';
create index app_tecnica_limpeza on public.app_tecnica_revisoes(academia_id,limpeza_apos) where apagado_em is not null and limpo_em is null;
-- Recibo de exclusão independente da árvore aluno/revisão. Sem FKs: apagar
-- definitivamente o aluno ou a academia não pode perder o caminho a expurgar.
create table public.app_tecnica_orfaos (
  caminho text primary key check (caminho ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(mp4|webm|mov|m4a|mp3|ogg|wav)$'),
  academia_id uuid not null,
  limpeza_apos timestamptz not null,
  enfileirado_em timestamptz not null default now()
);
create index app_tecnica_orfaos_pendentes on public.app_tecnica_orfaos(limpeza_apos);
alter table public.app_tecnica_orfaos enable row level security;
revoke all on public.app_tecnica_orfaos from public,anon,authenticated;
grant select,insert,update,delete on public.app_tecnica_orfaos to service_role;

create schema if not exists torque_private;
-- Trigger privado, sem argumentos/caminhos fornecidos pelo chamador. DEFINER
-- só permite que o DELETE já autorizado registre o expurgo quando o autor da
-- cascata não tem INSERT na fila privada. Não pode ser chamado como RPC.
create function torque_private.tecnica_guarda_arquivos()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.app_tecnica_orfaos(caminho,academia_id,limpeza_apos)
    select f.caminho,old.academia_id,clock_timestamp()+interval '2 hours 5 minutes'
    from public.app_tecnica_arquivos f where f.revisao_id=old.id
    on conflict(caminho) do update set limpeza_apos=greatest(public.app_tecnica_orfaos.limpeza_apos,excluded.limpeza_apos);
  return old;
end $$;
revoke all on function torque_private.tecnica_guarda_arquivos() from public,anon,authenticated,service_role;
create trigger tecnica_guarda_arquivos before delete on public.app_tecnica_revisoes
  for each row execute function torque_private.tecnica_guarda_arquivos();
alter table public.app_tecnica_revisoes enable row level security;
alter table public.app_tecnica_arquivos enable row level security;
revoke all on public.app_tecnica_revisoes,public.app_tecnica_arquivos from public,anon,authenticated;
grant select,insert,update,delete on public.app_tecnica_revisoes,public.app_tecnica_arquivos to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('tecnica-privada','tecnica-privada',false,26214400,array['video/mp4','video/webm','video/quicktime','audio/mp4','audio/mpeg','audio/webm','audio/ogg','audio/wav'])
on conflict(id) do nothing;

-- INVOKER: chamadas somente com service_role pela Edge, depois de validar a
-- identidade. O aluno e o navegador não recebem EXECUTE ou acesso às tabelas.
create function public.tecnica_cria(p_id uuid,p_token text,p_academia uuid,p_contexto jsonb)
returns public.app_tecnica_revisoes language plpgsql security invoker set search_path='' as $$
declare a public.app_aluno%rowtype; r public.app_tecnica_revisoes%rowtype;
begin
 select * into a from public.app_aluno where token=p_token for update;
 if not found or a.academia_id<>p_academia or a.revogado_em is not null then raise sqlstate 'PT404' using message='Registro indisponível.'; end if;
 select * into r from public.app_tecnica_revisoes where id=p_id;
 if found then
  if r.token<>p_token or r.academia_id<>p_academia or r.apagado_em is not null then raise sqlstate 'PT404' using message='Registro indisponível.'; end if;
  if r.contexto is distinct from p_contexto then raise sqlstate 'PT409' using message='Este envio já existe com outro exercício ou série. Abra uma nova análise.'; end if;
  return r;
 end if;
 -- Tombstones contam na quota para que apagar não permita contornar o limite.
 if (select count(*) from public.app_tecnica_revisoes where token=p_token and criado_em>=now()-interval '24 hours')>=10 then raise sqlstate 'PT429' using message='Limite diário de vídeos atingido. Tente amanhã.'; end if;
 insert into public.app_tecnica_revisoes(id,academia_id,token,contexto) values(p_id,p_academia,p_token,p_contexto) returning * into r;
 return r;
end $$;

create function public.tecnica_prepara_arquivo(p_id uuid,p_revisao uuid,p_academia uuid,p_tipo text,p_mime text,p_bytes integer)
returns public.app_tecnica_arquivos language plpgsql security invoker set search_path='' as $$
declare r public.app_tecnica_revisoes%rowtype; f public.app_tecnica_arquivos%rowtype; ext text;
begin
 select * into r from public.app_tecnica_revisoes where id=p_revisao for update;
 if not found or r.academia_id<>p_academia or r.apagado_em is not null or public.app_aluno_ativo(r.token) is distinct from p_academia then raise sqlstate 'PT404' using message='Registro indisponível.'; end if;
 if p_tipo not in ('video','audio') or p_bytes<1 or p_bytes>(case when p_tipo='audio' then 8388608 else 26214400 end) then raise sqlstate 'PT400' using message='Arquivo inválido.'; end if;
 ext:=case p_mime when 'video/mp4' then 'mp4' when 'video/webm' then 'webm' when 'video/quicktime' then 'mov' when 'audio/mp4' then 'm4a' when 'audio/mpeg' then 'mp3' when 'audio/webm' then 'webm' when 'audio/ogg' then 'ogg' when 'audio/wav' then 'wav' else null end;
 if ext is null or split_part(p_mime,'/',1)<>p_tipo then raise sqlstate 'PT400' using message='Formato inválido.'; end if;
 if p_tipo='video' and r.estado<>'rascunho' then raise sqlstate 'PT409' using message='Este vídeo já foi enviado.'; end if;
 select * into f from public.app_tecnica_arquivos where id=p_id;
 if found then
  if f.revisao_id<>p_revisao or f.tipo<>p_tipo or f.mime<>p_mime or f.bytes<>p_bytes then raise sqlstate 'PT409' using message='O arquivo mudou. Selecione novamente.'; end if;
 else
  if (select count(*) from public.app_tecnica_arquivos where revisao_id=p_revisao and tipo=p_tipo)>=(case when p_tipo='video' then 1 else 20 end) then raise sqlstate 'PT409' using message='Limite de arquivos atingido.'; end if;
  insert into public.app_tecnica_arquivos(id,revisao_id,caminho,tipo,mime,bytes) values(p_id,p_revisao,p_academia::text||'/'||p_revisao::text||'/'||p_id::text||'.'||ext,p_tipo,p_mime,p_bytes) returning * into f;
 end if;
 if not f.pronto then update public.app_tecnica_arquivos set upload_assinado_em=now() where id=f.id returning * into f; end if;
 return f;
end $$;

create function public.tecnica_arquivo_pronto(p_id uuid,p_revisao uuid,p_academia uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare r public.app_tecnica_revisoes%rowtype;
begin
 select * into r from public.app_tecnica_revisoes where id=p_revisao for update;
 if not found or r.academia_id<>p_academia or r.apagado_em is not null or public.app_aluno_ativo(r.token) is distinct from p_academia then raise sqlstate 'PT404' using message='Registro indisponível.'; end if;
 update public.app_tecnica_arquivos set pronto=true where id=p_id and revisao_id=p_revisao;
 if not found then raise sqlstate 'PT404' using message='Arquivo indisponível.'; end if;
 return true;
end $$;

create function public.tecnica_apaga(p_id uuid,p_academia uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare r public.app_tecnica_revisoes%rowtype;
begin
 select * into r from public.app_tecnica_revisoes where id=p_id for update;
 if not found or r.academia_id<>p_academia then raise sqlstate 'PT404' using message='Registro indisponível.'; end if;
 if r.apagado_em is null then
  -- Upload assinado dura duas horas. Reserva cinco minutos adicionais para
  -- a requisição de assinatura já em voo. IDs e caminhos não são reutilizados.
  update public.app_tecnica_revisoes set apagado_em=now(),limpeza_apos=now()+interval '2 hours 5 minutes',contexto='{}',comentarios='[]',versao=versao+1,atualizado_em=now() where id=p_id;
 end if;
 return true;
end $$;

create function public.tecnica_tokens_ativos(p_academia uuid,p_tokens text[])
returns setof text language sql security invoker set search_path='' as $$
 select token from public.app_aluno where academia_id=p_academia and revogado_em is null and token=any(p_tokens[1:100])
$$;
revoke all on function public.tecnica_cria(uuid,text,uuid,jsonb),public.tecnica_prepara_arquivo(uuid,uuid,uuid,text,text,integer),public.tecnica_arquivo_pronto(uuid,uuid,uuid),public.tecnica_apaga(uuid,uuid),public.tecnica_tokens_ativos(uuid,text[]) from public,anon,authenticated;
grant execute on function public.tecnica_cria(uuid,text,uuid,jsonb),public.tecnica_prepara_arquivo(uuid,uuid,uuid,text,text,integer),public.tecnica_arquivo_pronto(uuid,uuid,uuid),public.tecnica_apaga(uuid,uuid),public.tecnica_tokens_ativos(uuid,text[]) to service_role;
commit;
