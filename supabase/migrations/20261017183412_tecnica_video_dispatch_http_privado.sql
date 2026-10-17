-- Substitui somente o transporte da limpeza. A migration anterior já foi
-- aplicada; sua tentativa de REVOKE da fila pg_net não é uma garantia de ACL.
-- Esta migration não altera net, não enfileira headers e não ativa o worker.
begin;

do $http_extension$
declare installed_schema text;
begin
 select n.nspname into installed_schema from pg_catalog.pg_extension e
 join pg_catalog.pg_namespace n on n.oid=e.extnamespace where e.extname='http';
 if installed_schema is not null and installed_schema<>'torque_http' then
  raise exception 'HTTP já instalado em outro schema. Revisar a instalação sem mover ou alterar a extensão existente.';
 end if;
 create schema if not exists torque_http authorization postgres;
 if (select nspowner from pg_catalog.pg_namespace where nspname='torque_http')<>'postgres'::regrole then
  raise exception 'O schema privado HTTP deve pertencer ao operador postgres.';
 end if;
 revoke all on schema torque_http from public,anon,authenticated,service_role;
 if pg_catalog.has_schema_privilege('anon','torque_http','USAGE,CREATE') or
    pg_catalog.has_schema_privilege('authenticated','torque_http','USAGE,CREATE') or
    pg_catalog.has_schema_privilege('service_role','torque_http','USAGE,CREATE') then
  raise exception 'Não foi possível restringir o schema privado HTTP.';
 end if;
 if installed_schema is null then
  execute 'create extension http with schema torque_http';
 end if;
 select n.nspname into installed_schema from pg_catalog.pg_extension e
 join pg_catalog.pg_namespace n on n.oid=e.extnamespace where e.extname='http';
 if installed_schema is distinct from 'torque_http' then
  raise exception 'A extensão HTTP não foi instalada no schema privado esperado.';
 end if;
 -- A plataforma pode criar funções com owner/grants supabase_admin. A barreira
 -- é USAGE no schema privado que controlamos, não um REVOKE ineficaz nas funções.
 revoke all on schema torque_http from public,anon,authenticated,service_role;
 if pg_catalog.has_schema_privilege('anon','torque_http','USAGE,CREATE') or
    pg_catalog.has_schema_privilege('authenticated','torque_http','USAGE,CREATE') or
    pg_catalog.has_schema_privilege('service_role','torque_http','USAGE,CREATE') then
  raise exception 'Não foi possível restringir o schema privado HTTP.';
 end if;
end $http_extension$;

create table torque_private.tecnica_limpeza_execucoes (
 id bigint generated always as identity primary key,
 iniciado_em timestamptz not null default clock_timestamp(),
 terminado_em timestamptz,
 resultado text not null check(resultado in ('processing','ok','http_error','invalid_response','transport_error','configuration_error')),
 http_status integer check(http_status between 100 and 599),
 processed integer check(processed between 0 and 50),
 failed integer check(failed between 0 and 50),
 deferred integer check(deferred between 0 and 50)
);
alter table torque_private.tecnica_limpeza_execucoes enable row level security;
revoke all on torque_private.tecnica_limpeza_execucoes from public,anon,authenticated,service_role;
revoke all on sequence torque_private.tecnica_limpeza_execucoes_id_seq from public,anon,authenticated,service_role;
grant usage on schema torque_private to service_role;
grant select on torque_private.tecnica_limpeza_execucoes to service_role;

create or replace function public.tecnica_limpeza_dispara()
returns bigint language plpgsql security definer
set search_path=''
-- Alias oficial compatível com http 1.6 e 1.7; curlopt_* como GUC é só 1.7.
set http.timeout_msec='55000'
set client_min_messages='warning'
as $function$
declare target text; segredo text; rid bigint; res record; payload jsonb;
 outcome text; status_code integer; done_count integer; fail_count integer; deferred_count integer;
 previous_curl jsonb; opt record; configured_curl boolean:=false;
begin
 select endpoint into target from public.tecnica_limpeza_config where singleton and ativo;
 if target is null then return null; end if;
 -- Uma execução manual não se sobrepõe ao cron no mesmo banco.
 if not pg_catalog.pg_try_advisory_xact_lock(866,17183412) then return null; end if;
 delete from torque_private.tecnica_limpeza_execucoes where iniciado_em<clock_timestamp()-interval '30 days';
 insert into torque_private.tecnica_limpeza_execucoes(resultado) values('processing') returning id into rid;
 begin
  -- A extensão escreve headers em DEBUG2. Não carregar a credencial quando
  -- a configuração do servidor permitir esse nível de log.
  if current_setting('log_min_messages') in ('debug5','debug4','debug3','debug2') or
     target !~ '^https://[a-z0-9]+[.]supabase[.]co/functions/v1/tecnica-limpeza$' or
     pg_catalog.to_regtype('torque_http.http_request') is null then
   outcome:='configuration_error';
  else
   select coalesce(jsonb_object_agg(curlopt,value),'{}'::jsonb) into previous_curl from torque_http.http_list_curlopt();
   configured_curl:=true;
   if torque_http.http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS','5000') is distinct from true then
    raise exception 'Configuração HTTP indisponível.';
   end if;
   select decrypted_secret into segredo from vault.decrypted_secrets where name='tecnica_video_cleanup' limit 1;
   if segredo is null or segredo !~ '^[0-9a-f]{64}$' then
    outcome:='configuration_error';
   else
    -- pgsql-http segue redirects de POST. Authorization é o cabeçalho padrão
    -- protegido pelo libcurl em redirects a outra origem; não usar cabeçalhos
    -- personalizados com o segredo. O worker fixo não emite redirects.
    select r.status,r.content into res from torque_http.http((
      'POST',target,array[('Authorization','Bearer '||segredo)::torque_http.http_header],
      'application/json','{}')::torque_http.http_request) r;
    segredo:=null;
    status_code:=case when res.status between 100 and 599 then res.status else null end;
    outcome:=case when status_code=200 then 'invalid_response' else 'http_error' end;
    -- Nunca persistir headers, corpo HTTP ou texto de erros. Só três contagens
    -- inteiras do contrato fechado do worker podem chegar ao recibo operacional.
    if status_code in (200,503) and octet_length(res.content)<=4096 then
     begin
      payload:=res.content::jsonb;
      if jsonb_typeof(payload)='object' and
         jsonb_typeof(payload->'processed')='number' and (payload->>'processed') ~ '^[0-9]{1,2}$' and
         jsonb_typeof(payload->'failed')='number' and (payload->>'failed') ~ '^[0-9]{1,2}$' and
         jsonb_typeof(payload->'deferred')='number' and (payload->>'deferred') ~ '^[0-9]{1,2}$' and
         (payload->>'processed')::integer+(payload->>'failed')::integer+(payload->>'deferred')::integer<=50 then
       done_count:=(payload->>'processed')::integer;
       fail_count:=(payload->>'failed')::integer;
       deferred_count:=(payload->>'deferred')::integer;
       if status_code=200 and payload->'ok'='true'::jsonb and fail_count=0 then outcome:='ok'; end if;
      end if;
     exception when others then
      done_count:=null;fail_count:=null;deferred_count:=null;
     end;
    end if;
   end if;
  end if;
 exception when others then
  -- SQLERRM/DETAIL/contexto do transporte podem conter dados da requisição.
  -- Não repassar nem gravar o erro original.
  outcome:='transport_error';status_code:=null;
  done_count:=null;fail_count:=null;deferred_count:=null;
 end;
 segredo:=null;payload:=null;
 if configured_curl then
  begin
   -- http_set_curlopt usa estado da conexão em 1.6 e não aceita NULL para
   -- desfazer uma opção. Restaurar o conjunto inteiro mantém inclusive opções
   -- em segundos e a ausência de um override em milissegundos.
   if torque_http.http_reset_curlopt() is distinct from true then raise exception 'Restauração HTTP indisponível.';end if;
   for opt in select key,value from jsonb_each_text(previous_curl) loop
    if torque_http.http_set_curlopt(opt.key,opt.value) is distinct from true then raise exception 'Restauração HTTP indisponível.';end if;
   end loop;
  exception when others then outcome:='transport_error';end;
 end if;
 previous_curl:=null;
 update torque_private.tecnica_limpeza_execucoes set terminado_em=clock_timestamp(),
  resultado=outcome,http_status=status_code,processed=done_count,failed=fail_count,deferred=deferred_count where id=rid;
 return rid;
end $function$;
revoke all on function public.tecnica_limpeza_dispara() from public,anon,authenticated,service_role;
-- O job existente continua chamando a mesma função. Endpoint e ativo não mudam.
commit;
