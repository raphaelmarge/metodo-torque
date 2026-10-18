-- Stops future scheduling without deleting consent/history. Also set the Edge
-- secret NUTRI_PUSH_ENABLED=false. Already accepted push messages cannot be recalled.
begin;
update private.nutri_push_config set enabled=false;
do $$begin
 if exists(select 1 from pg_namespace where nspname='cron') then
  perform cron.unschedule(jobid) from cron.job where jobname='nutri-reminders-dispatch';
 end if;
end $$;
commit;
