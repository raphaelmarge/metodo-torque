-- READ ONLY: no application rows or auth.users contents.
select n.nspname as schema, c.relname as name, c.relkind as kind,
  c.relrowsecurity as rls, c.relforcerowsecurity as force_rls,
  pg_get_userbyid(c.relowner) as owner, c.reloptions,
  obj_description(c.oid) as comment
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('public','private') and c.relkind in ('r','p','v','m','S')
order by 1,2;

-- Migration identifiers only. Bodies are not reconstructed as historic migrations.
select version,name from supabase_migrations.schema_migrations order by version;
