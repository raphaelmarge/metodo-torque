-- ADMINISTRATIVE ACTIVATION ONLY. Not part of the default migration.
-- Prerequisites: authorized activation, Edge deployed, pg_cron + pg_net + Vault,
-- and Vault secret nutri_push_cron_secret matching the Edge secret.
do $$begin
 if not exists(select 1 from private.nutri_push_config where enabled and public_key<>'') then
  raise exception 'Ative a configuração somente após homologar os lembretes';
 end if;
 if not exists(select 1 from vault.decrypted_secrets where name='nutri_push_cron_secret' and length(decrypted_secret)>=32) then
  raise exception 'Segredo de cron não configurado';
 end if;
end $$;
select cron.schedule('nutri-reminders-dispatch','* * * * *',$job$
 select net.http_post(
  url:='https://mmdsmpetwhcfiyubhaah.supabase.co/functions/v1/nutri-reminders-dispatch',
  headers:=jsonb_build_object('Content-Type','application/json','x-nutri-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='nutri_push_cron_secret')),
  body:='{}'::jsonb,timeout_milliseconds:=110000
 ) where exists(select 1 from private.nutri_push_config where enabled);
$job$);
