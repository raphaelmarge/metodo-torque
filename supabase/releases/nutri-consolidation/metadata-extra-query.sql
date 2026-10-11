select jsonb_build_object(
'schemas',(select jsonb_agg(jsonb_build_object('name',nspname,'acl',nspacl::text) order by nspname) from pg_namespace where nspname in ('public','private')),
'column_types',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'table_name',c.relname,'column_name',a.attname,'sql_type',format_type(a.atttypid,a.atttypmod)) order by n.nspname,c.relname,a.attnum) from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind in ('r','p') and a.attnum>0 and not a.attisdropped),
'defaults',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'owner',pg_get_userbyid(d.defaclrole),'object_type',d.defaclobjtype,'acl',d.defaclacl::text)) from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace where n.nspname in ('public','private') or d.defaclnamespace=0),
'server_version',current_setting('server_version')
) as metadata;
