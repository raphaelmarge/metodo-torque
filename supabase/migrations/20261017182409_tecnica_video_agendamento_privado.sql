-- Executar depois de tecnica_video_privada. O job nasce desativado e só é
-- habilitado após conferir o worker no projeto de destino.
begin;
-- pg_net guarda cabeçalhos enquanto o pedido aguarda envio. A fila não é uma
-- API do navegador: impedir leitura do segredo mesmo fora do schema exposto.
revoke select on table net.http_request_queue from public,anon,authenticated;
create table public.tecnica_limpeza_config (
  singleton boolean primary key default true check(singleton),
  endpoint text check(endpoint ~ '^https://[a-z0-9]+[.]supabase[.]co/functions/v1/tecnica-limpeza$'),
  ativo boolean not null default false
);
alter table public.tecnica_limpeza_config enable row level security;
revoke all on public.tecnica_limpeza_config from public,anon,authenticated;
grant select,update on public.tecnica_limpeza_config to service_role;
insert into public.tecnica_limpeza_config(singleton) values(true);
do $block$
begin
 if not exists(select 1 from vault.secrets where name='tecnica_video_cleanup') then
  perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'tecnica_video_cleanup','Autenticação exclusiva do expurgo de vídeos técnicos');
 end if;
end $block$;
create function public.tecnica_limpeza_autoriza(p_segredo text)
returns boolean language sql stable security definer set search_path='' as $function$
 select coalesce(length(p_segredo)=64 and
  (select extensions.digest(p_segredo,'sha256')=extensions.digest(decrypted_secret,'sha256')
   from vault.decrypted_secrets where name='tecnica_video_cleanup' limit 1),false)
$function$;
revoke all on function public.tecnica_limpeza_autoriza(text) from public,anon,authenticated;
grant execute on function public.tecnica_limpeza_autoriza(text) to service_role;
create function public.tecnica_limpeza_dispara()
returns bigint language plpgsql security definer set search_path='' as $function$
declare target text; segredo text; request_id bigint;
begin
 select endpoint into target from public.tecnica_limpeza_config where singleton and ativo;
 if target is null then return null; end if;
 select decrypted_secret into segredo from vault.decrypted_secrets where name='tecnica_video_cleanup' limit 1;
 if segredo is null then raise exception 'Credencial de limpeza ausente.'; end if;
 select net.http_post(url:=target,headers:=jsonb_build_object('Content-Type','application/json','x-tecnica-secret',segredo),body:='{}'::jsonb,timeout_milliseconds:=55000) into request_id;
 return request_id;
end $function$;
revoke all on function public.tecnica_limpeza_dispara() from public,anon,authenticated,service_role;
select cron.schedule('tecnica-video-limpeza','*/10 * * * *','select public.tecnica_limpeza_dispara();');
commit;
