-- Somente catálogo/metadados. Não lê linhas de alunos nem chama RPCs de escrita.
begin transaction read only;
with wanted(signature) as (values
 ('public.dados_cas(uuid,text,jsonb,timestamp with time zone)'),
 ('public.dados_grava(jsonb)'),
 ('public.app_aluno_publica_cas(uuid,timestamp with time zone,jsonb)')
)
select w.signature, p.oid is not null as installed,
       not p.prosecdef as security_invoker,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
       p.proconfig as configuration
from wanted w left join pg_proc p on p.oid=to_regprocedure(w.signature);
select c.relname as table_name,c.relrowsecurity as rls_enabled,
       t.tgname as trigger_name,t.tgenabled as trigger_enabled,pg_get_triggerdef(t.oid) as definition
from pg_class c join pg_namespace n on n.oid=c.relnamespace
left join pg_trigger t on t.tgrelid=c.oid and not t.tgisinternal
where n.nspname='public' and c.relname in ('dados','dados_hist','app_aluno','app_aluno_hist','membros')
order by c.relname,t.tgname;
select p.proname,pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('hoje_br','app_agenda_pede','minhas_academias');
commit;
