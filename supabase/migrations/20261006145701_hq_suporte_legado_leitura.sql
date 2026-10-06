-- Administrative, read-only bridge. No UPDATE of unread flags or old tickets.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create or replace function public.hq_ops_legacy_support(p_cursor jsonb default null,p_limit integer default 25,p_academia uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare cutoff timestamptz:=now(); before_at timestamptz; before_source text; before_id uuid;
 records jsonb; next_cursor jsonb; count_rows integer;
begin
 if auth.uid() is null or not exists(select 1 from public.saas_admins where user_id=auth.uid()) then
  raise exception using errcode='42501',message='Historico restrito a administradores existentes';
 end if;
 if p_limit is null or p_limit<1 or p_limit>50 then raise exception using errcode='22023',message='Limite invalido';end if;
 if p_cursor is not null then
  if jsonb_typeof(p_cursor)<>'object' or pg_column_size(p_cursor)>1024 or not p_cursor ?& array['at','source','id','cutoff','accountId']
     or exists(select 1 from jsonb_object_keys(p_cursor) k where k<>all(array['at','source','id','cutoff','accountId'])) then raise exception using errcode='22023',message='Cursor invalido';end if;
  before_at:=(p_cursor->>'at')::timestamptz;before_source:=p_cursor->>'source';before_id:=(p_cursor->>'id')::uuid;cutoff:=(p_cursor->>'cutoff')::timestamptz;
  if before_at is null or not isfinite(before_at) or cutoff is null or not isfinite(cutoff) or before_at>cutoff or cutoff>now()
    or before_id is null or before_source not in ('saas_tickets','suporte_chamados') or before_source is null
    or (p_cursor->>'accountId') is distinct from p_academia::text then raise exception using errcode='22023',message='Cursor fora desta consulta';end if;
 end if;
 with messages as (
  select t.id,t.criado at,'saas_tickets'::text source,t.academia_id account_id,t.de direction,
   case when t.de='cliente' then case when t.lida then 'lida_no_legado' else 'nao_lida_no_legado' end else 'resposta_registrada' end status,
   ''::text protocol,left(t.texto,8000) message,''::text reply,length(t.texto)>8000 truncated
  from public.saas_tickets t where t.criado<=cutoff and (p_academia is null or t.academia_id=p_academia)
    and (before_at is null or (t.criado,'saas_tickets'::text,t.id)<(before_at,before_source,before_id))
  union all
  select t.id,t.criado_em,'suporte_chamados',t.academia_id,'cliente',t.status,t.protocolo,left(t.mensagem,8000),left(t.resposta,8000),length(t.mensagem)>8000 or length(t.resposta)>8000
  from public.suporte_chamados t where t.criado_em<=cutoff and (p_academia is null or t.academia_id=p_academia)
    and (before_at is null or (t.criado_em,'suporte_chamados'::text,t.id)<(before_at,before_source,before_id))
 ), page as (select * from messages order by at desc,source desc,id desc limit p_limit+1)
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'source',p.source,'accountId',p.account_id,'accountName',coalesce(a.nome,'Conta sem identificação'),
  'createdAt',p.at,'direction',p.direction,'status',p.status,'protocol',p.protocol,'message',p.message,'reply',p.reply,'truncated',p.truncated,'delivery','not_verified') order by p.at desc,p.source desc,p.id desc),'[]') into records
 from page p left join public.academias a on a.id=p.account_id;
 count_rows:=jsonb_array_length(records);
 if count_rows>p_limit then
  records:=records-(count_rows-1);
  next_cursor:=jsonb_build_object('at',records->(p_limit-1)->'createdAt','source',records->(p_limit-1)->'source','id',records->(p_limit-1)->'id','cutoff',cutoff,'accountId',p_academia);
 end if;
 return jsonb_build_object('version',1,'ok',true,'readOnly',true,'rows',records,'nextCursor',next_cursor,'asOf',cutoff,'scope','legacyOnly','delivery','not_verified');
end $$;
revoke all on function public.hq_ops_legacy_support(jsonb,integer,uuid) from public,anon,service_role;
grant execute on function public.hq_ops_legacy_support(jsonb,integer,uuid) to authenticated;
-- Keyset ordering and account-scoped reading; no new grants on original tables.
create index if not exists hq_saas_tickets_cursor on public.saas_tickets(criado desc,id desc);
create index if not exists hq_saas_tickets_account_cursor on public.saas_tickets(academia_id,criado desc,id desc);
create index if not exists hq_suporte_chamados_cursor on public.suporte_chamados(criado_em desc,id desc);
create index if not exists hq_suporte_chamados_account_cursor on public.suporte_chamados(academia_id,criado_em desc,id desc);
notify pgrst,'reload schema';
commit;
