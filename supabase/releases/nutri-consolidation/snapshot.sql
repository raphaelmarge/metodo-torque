SET search_path = public, extensions, pg_catalog;
SET check_function_bodies = false;
CREATE TABLE "private"."care_import_batches" (
"owner_id" uuid NOT NULL,
"operation_id" uuid NOT NULL,
"source_hash" text NOT NULL,
"payload_hash" text NOT NULL,
"result" jsonb NOT NULL,
"created_at" timestamp with time zone NOT NULL
);
CREATE TABLE "private"."client_operations" (
"user_id" uuid NOT NULL,
"operation_id" uuid NOT NULL,
"request_hash" text NOT NULL,
"response" jsonb,
"created_at" timestamp with time zone NOT NULL
);
CREATE TABLE "private"."platform_history" (
"id" uuid NOT NULL,
"entity_kind" text NOT NULL,
"entity_id" uuid NOT NULL,
"patient_id" uuid,
"owner_id" uuid NOT NULL,
"visibility" text NOT NULL,
"version" integer NOT NULL,
"snapshot" jsonb NOT NULL,
"created_at" timestamp with time zone NOT NULL
);
CREATE TABLE "public"."appointments" (
"id" uuid NOT NULL,
"patient_id" uuid NOT NULL,
"clinician_id" uuid NOT NULL,
"start_at" timestamp with time zone NOT NULL,
"note" text NOT NULL,
"created_at" timestamp with time zone NOT NULL,
"updated_at" timestamp with time zone NOT NULL,
"duration_minutes" integer NOT NULL,
"status" text NOT NULL
);
CREATE TABLE "public"."challenges" (
"id" uuid NOT NULL,
"clinic_id" uuid NOT NULL,
"owner_id" uuid NOT NULL,
"title" text NOT NULL,
"target" numeric(12,2) NOT NULL,
"metric" text NOT NULL,
"created_at" timestamp with time zone NOT NULL,
"updated_at" timestamp with time zone NOT NULL
);
CREATE TABLE "public"."clinic_resources" (
"id" uuid NOT NULL,
"clinic_id" uuid NOT NULL,
"owner_id" uuid NOT NULL,
"kind" text NOT NULL,
"title" text NOT NULL,
"data" jsonb NOT NULL,
"shared" boolean NOT NULL,
"version" integer NOT NULL,
"created_at" timestamp with time zone NOT NULL,
"updated_at" timestamp with time zone NOT NULL
);
CREATE TABLE "public"."clinics" (
"id" uuid NOT NULL,
"owner_id" uuid NOT NULL,
"name" text NOT NULL,
"professional_name" text NOT NULL,
"crn" text NOT NULL,
"color" text NOT NULL,
"logo" text NOT NULL,
"weekly_goal" integer NOT NULL,
"created_at" timestamp with time zone NOT NULL,
"updated_at" timestamp with time zone NOT NULL
);
CREATE TABLE "public"."community_interactions" (
"id" uuid NOT NULL,
"post_id" uuid NOT NULL,
"author_id" uuid NOT NULL,
"display_name" text NOT NULL,
"kind" text NOT NULL,
"body" text NOT NULL,
"created_at" timestamp with time zone NOT NULL,
"updated_at" timestamp with time zone NOT NULL
);
CREATE TABLE "public"."community_posts" (
"id" uuid NOT NULL,
"clinic_id" uuid NOT NULL,
"author_id" uuid NOT NULL,
"display_name" text NOT NULL,
"body" text NOT NULL,
"image" text,
"status" text NOT NULL,
"created_at" timestamp with time zone NOT NULL,
"updated_at" timestamp with time zone NOT NULL
);
CREATE TABLE "public"."daily_logs" (
"id" uuid NOT NULL,
"patient_id" uuid NOT NULL,
"day" date NOT NULL,
"water_ml" integer NOT NULL,
"meals" jsonb NOT NULL,
"followed" boolean NOT NULL,
"weight" numeric(6,2),
"sleep" numeric(4,1),
"mood" text,
"note" text NOT NULL,
"created_at" timestamp with time zone NOT NULL,
"updated_at" timestamp with time zone NOT NULL
);
CREATE TABLE "public"."financial_entries" (
"id" uuid NOT NULL,
"clinic_id" uuid NOT NULL,
"owner_id" uuid NOT NULL,
"patient_id" uuid,
"kind" text NOT NULL,
"title" text NOT NULL,
"amount_cents" bigint NOT NULL,
"due_on" date NOT NULL,
"status" text NOT NULL,
"paid_on" date,
"method" text NOT NULL,
"note" text NOT NULL,
"version" integer NOT NULL,
"created_at" timestamp with time zone NOT NULL,
"updated_at" timestamp with time zone NOT NULL
);
CREATE TABLE "public"."messages" (
"id" uuid NOT NULL,
"patient_id" uuid NOT NULL,
"sender_id" uuid NOT NULL,
"body" text NOT NULL,
"created_at" timestamp with time zone NOT NULL
);
CREATE TABLE "public"."patient_records" (
"id" uuid NOT NULL,
"patient_id" uuid NOT NULL,
"clinician_id" uuid NOT NULL,
"created_by" uuid NOT NULL,
"kind" text NOT NULL,
"title" text NOT NULL,
"data" jsonb NOT NULL,
"visibility" text NOT NULL,
"version" integer NOT NULL,
"created_at" timestamp with time zone NOT NULL,
"updated_at" timestamp with time zone NOT NULL
);
CREATE TABLE "public"."patients" (
"id" uuid NOT NULL,
"clinic_id" uuid NOT NULL,
"clinician_id" uuid NOT NULL,
"user_id" uuid,
"name" text NOT NULL,
"email" text NOT NULL,
"goal" text NOT NULL,
"restrictions" text NOT NULL,
"notes" text NOT NULL,
"invite_code" text,
"invite_expires_at" timestamp with time zone,
"created_at" timestamp with time zone NOT NULL,
"updated_at" timestamp with time zone NOT NULL
);
CREATE TABLE "public"."plans" (
"id" uuid NOT NULL,
"patient_id" uuid NOT NULL,
"clinician_id" uuid NOT NULL,
"status" text NOT NULL,
"version" integer NOT NULL,
"data" jsonb NOT NULL,
"created_at" timestamp with time zone NOT NULL,
"updated_at" timestamp with time zone NOT NULL
);
CREATE OR REPLACE FUNCTION private.acknowledge_document(p_record_id uuid, p_expected_version integer)
 RETURNS patient_records
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid := auth.uid(); v_document public.patient_records; v_ack public.patient_records;
begin
  if v_uid is null then raise exception 'Autenticação necessária' using errcode = '42501'; end if;
  select r.* into v_document from public.patient_records r join public.patients p on p.id = r.patient_id
    where r.id = p_record_id and r.kind = 'document' and r.visibility = 'patient' and p.user_id = v_uid
    for update of r;
  if not found then raise exception 'Documento não disponível' using errcode = '42501'; end if;
  if p_expected_version is null or v_document.version <> p_expected_version then
    raise exception 'Documento atualizado; recarregue antes de confirmar' using errcode = '40001';
  end if;
  if pg_catalog.jsonb_typeof(v_document.data->'text') is distinct from 'string'
    or pg_catalog.length(pg_catalog.btrim(v_document.data->>'text')) not between 1 and 200000 then
    raise exception 'Texto do documento inválido' using errcode = '22023';
  end if;
  select r.* into v_ack from public.patient_records r where r.patient_id = v_document.patient_id and r.kind = 'document_ack'
    and r.data->>'documentId' = p_record_id::text and r.data->>'documentVersion' = p_expected_version::text;
  if found then return v_ack; end if;
  insert into public.patient_records(patient_id,clinician_id,created_by,kind,title,data,visibility)
  values(v_document.patient_id,v_document.clinician_id,v_uid,'document_ack',v_document.title,
    pg_catalog.jsonb_build_object('documentId',p_record_id,'documentVersion',p_expected_version,
      'textSnapshot',v_document.data->>'text','acknowledgedAt',pg_catalog.clock_timestamp()),'patient')
  returning * into v_ack;
  return v_ack;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.acknowledge_document(p_record_id uuid, p_expected_version integer)
 RETURNS patient_records
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.acknowledge_document(p_record_id,p_expected_version); $function$
;
CREATE OR REPLACE FUNCTION private.archive_platform_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_kind text; v_patient_id uuid; v_owner_id uuid; v_visibility text;
begin
  if tg_op <> 'UPDATE' or tg_table_schema <> 'public' then
    raise exception 'Origem inválida para histórico' using errcode = '42501';
  end if;
  if tg_table_name = 'patient_records' then
    if old.kind in ('form_response','document_ack','plan_version') then
      raise exception 'Snapshot é imutável' using errcode = '42501';
    end if;
    if row(new.title,new.data,new.visibility) is not distinct from row(old.title,old.data,old.visibility) then
      return new;
    end if;
    v_kind := 'patient_record'; v_patient_id := old.patient_id;
    v_owner_id := old.clinician_id; v_visibility := old.visibility;
  elsif tg_table_name = 'clinic_resources' then
    if row(new.title,new.data,new.shared) is not distinct from row(old.title,old.data,old.shared) then
      return new;
    end if;
    v_kind := 'clinic_resource'; v_patient_id := null; v_owner_id := old.owner_id;
    v_visibility := case when old.shared then 'patient' else 'private' end;
  elsif tg_table_name = 'financial_entries' then
    if row(new.title,new.amount_cents,new.due_on,new.status,new.paid_on,new.method,new.note)
      is not distinct from row(old.title,old.amount_cents,old.due_on,old.status,old.paid_on,old.method,old.note) then
      return new;
    end if;
    v_kind := 'financial_entry'; v_patient_id := old.patient_id; v_owner_id := old.owner_id;
    v_visibility := case when old.kind = 'income' and old.patient_id is not null then 'patient' else 'private' end;
  else
    raise exception 'Origem inválida para histórico' using errcode = '42501';
  end if;
  insert into private.platform_history(entity_kind,entity_id,patient_id,owner_id,visibility,version,snapshot)
    values(v_kind,old.id,v_patient_id,v_owner_id,v_visibility,old.version,pg_catalog.to_jsonb(old));
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.archive_published_plan()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if old.status = 'published' and old.data is distinct from new.data then
    if auth.uid() is null or auth.uid() is distinct from old.clinician_id then
      raise exception 'Publicação exige o profissional responsável' using errcode = '42501';
    end if;
    insert into public.patient_records(patient_id,clinician_id,created_by,kind,title,data,visibility)
    values(old.patient_id,old.clinician_id,auth.uid(),'plan_version',
      pg_catalog.left(coalesce(nullif(old.data->>'titulo',''),'Plano alimentar anterior'),200),
      pg_catalog.jsonb_build_object('planId',old.id,'planVersion',old.version,'plan',old.data),'patient');
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.care_plan_ready(p_data jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare v_meal jsonb; v_food jsonb; v_alt jsonb; v_key text;
begin
 if not private.nutrition_plan_complete(p_data) then return false; end if;
 for v_meal in select value from jsonb_array_elements(p_data->'refeicoes') loop
  for v_food in select value from jsonb_array_elements(v_meal->'itens') loop
   if v_food?'substituicoes' and jsonb_typeof(v_food->'substituicoes') is distinct from 'array' then return false; end if;
   for v_alt in select value from jsonb_array_elements(jsonb_build_array(v_food)||coalesce(v_food->'substituicoes','[]'::jsonb)) loop
    if length(btrim(coalesce(v_alt->>'nome',''))) not between 1 and 200 or length(btrim(coalesce(v_alt->>'porcao',''))) not between 1 and 100 then return false; end if;
    if jsonb_typeof(v_alt->'qtd') is distinct from 'number' or (v_alt->>'qtd')::numeric not between 0.0001 and 1000 then return false; end if;
    foreach v_key in array array['k','pt','cb','g'] loop
     if jsonb_typeof(v_alt->v_key) is distinct from 'number' or (v_alt->>v_key)::numeric not between 0 and 100000 then return false; end if;
    end loop;
   end loop;
  end loop;
 end loop;
 return true;
exception when others then return false;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.clinician_patient_details(p_patient_id uuid)
 RETURNS SETOF patients
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select * from private.clinician_patient_details(p_patient_id); $function$
;
CREATE OR REPLACE FUNCTION private.clinician_patient_details(p_patient_id uuid)
 RETURNS SETOF patients
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then raise exception 'Autenticação necessária' using errcode = '42501'; end if;
  return query select p.* from public.patients p
    where p.id = p_patient_id and p.clinician_id = auth.uid();
end;
$function$
;
CREATE OR REPLACE FUNCTION private.community_display_name(p_clinic_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare v_name text; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Autenticação necessária' using errcode = '42501'; end if;
  select c.professional_name into v_name from public.clinics c
    where c.id = p_clinic_id and c.owner_id = v_uid;
  if not found then
    select p.name into v_name from public.patients p where p.clinic_id = p_clinic_id and p.user_id = v_uid;
    if not found then raise exception 'Clínica não disponível para esta conta' using errcode = '42501'; end if;
  end if;
  return pg_catalog.left(pg_catalog.split_part(pg_catalog.btrim(coalesce(nullif(v_name,''),'Participante')),' ',1),100);
end;
$function$
;
CREATE OR REPLACE FUNCTION private.guard_appointment_overlap()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  -- Identidade imutável inclusive em sessão administrativa, além dos grants por coluna.
  if tg_op='UPDATE' and row(new.id,new.patient_id,new.clinician_id,new.created_at)
    is distinct from row(old.id,old.patient_id,old.clinician_id,old.created_at) then
    raise exception 'Identidade da consulta é imutável' using errcode='42501';
  end if;
  if not pg_catalog.isfinite(new.start_at) then
    raise exception 'Data de consulta inválida' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('torque_nutri_appointments:'||new.clinician_id::text,0));
  if new.status='scheduled' and exists (
    select 1 from public.appointments a where a.clinician_id=new.clinician_id and a.status='scheduled'
      and a.id<>new.id
      and a.start_at < new.start_at + pg_catalog.make_interval(mins=>new.duration_minutes)
      and a.start_at + pg_catalog.make_interval(mins=>a.duration_minutes) > new.start_at
  ) then raise exception 'Horário sobreposto a outra consulta agendada' using errcode='22023'; end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.guard_appointment_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid(); v_patient_uid uuid;
begin
  if new.kind<>'appointment_request' then return new; end if;
  select p.user_id into v_patient_uid from public.patients p where p.id=new.patient_id;
  if v_uid is not null and v_uid=v_patient_uid and v_uid is distinct from new.clinician_id then
    if tg_op='UPDATE' and old.data->>'status' is distinct from 'requested' then
      raise exception 'Pedido respondido não pode ser alterado pelo paciente' using errcode='42501';
    end if;
    if new.data->>'status' is distinct from 'requested'
      or new.data ?| array['appointmentId','respondedAt','respondedBy'] then
      raise exception 'Paciente não pode responder o próprio pedido' using errcode='42501';
    end if;
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.guard_community_interaction()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_clinic uuid;
begin
  if tg_op = 'INSERT' then
    if new.author_id is distinct from auth.uid() then raise exception 'Autoria inválida' using errcode = '42501'; end if;
    select p.clinic_id into v_clinic from public.community_posts p where p.id = new.post_id and p.status = 'active';
    if not found then raise exception 'Post não disponível' using errcode = '42501'; end if;
    new.display_name := private.community_display_name(v_clinic);
  else
    if row(new.id,new.post_id,new.author_id,new.kind,new.display_name,new.created_at)
      is distinct from row(old.id,old.post_id,old.author_id,old.kind,old.display_name,old.created_at) then
      raise exception 'Identidade da interação é imutável' using errcode = '42501';
    end if;
    new.updated_at := pg_catalog.clock_timestamp();
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.guard_community_post()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.author_id is distinct from auth.uid() then
      raise exception 'Autoria inválida' using errcode = '42501';
    end if;
    new.display_name := private.community_display_name(new.clinic_id);
  else
    if row(new.id,new.clinic_id,new.author_id,new.display_name,new.created_at)
      is distinct from row(old.id,old.clinic_id,old.author_id,old.display_name,old.created_at) then
      raise exception 'Identidade e autoria do post são imutáveis' using errcode = '42501';
    end if;
    if old.author_id is distinct from auth.uid()
      and row(new.body,new.image) is distinct from row(old.body,old.image) then
      raise exception 'Moderação pode alterar somente status' using errcode = '42501';
    end if;
    new.updated_at := pg_catalog.clock_timestamp();
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.guard_daily_log_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.patient_id is distinct from old.patient_id or new.day is distinct from old.day then
    raise exception 'Paciente e data do diário são imutáveis' using errcode = '42501';
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.guard_platform_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  raise exception 'Histórico é imutável' using errcode = '42501';
end;
$function$
;
CREATE OR REPLACE FUNCTION private.guard_platform_record()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if tg_table_name = 'clinic_resources' then
    if row(new.id,new.clinic_id,new.owner_id,new.kind,new.created_at)
      is distinct from row(old.id,old.clinic_id,old.owner_id,old.kind,old.created_at) then
      raise exception 'Identidade do recurso é imutável' using errcode = '42501';
    end if;
  elsif tg_table_name = 'patient_records' then
    if old.kind in ('form_response','document_ack','plan_version') then
      raise exception 'Snapshot é imutável' using errcode = '42501';
    end if;
    if row(new.id,new.patient_id,new.clinician_id,new.created_by,new.kind,new.created_at)
      is distinct from row(old.id,old.patient_id,old.clinician_id,old.created_by,old.kind,old.created_at) then
      raise exception 'Identidade e autoria do registro são imutáveis' using errcode = '42501';
    end if;
  elsif tg_table_name = 'financial_entries' then
    if row(new.id,new.clinic_id,new.owner_id,new.patient_id,new.kind,new.created_at)
      is distinct from row(old.id,old.clinic_id,old.owner_id,old.patient_id,old.kind,old.created_at) then
      raise exception 'Identidade do lançamento é imutável' using errcode = '42501';
    end if;
  end if;
  new.version := old.version + 1;
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.import_care_bundle(p_operation_id uuid, p_source_hash text, p_bundle jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.import_care_bundle(p_operation_id,p_source_hash,p_bundle); $function$
;
CREATE OR REPLACE FUNCTION private.import_care_bundle(p_operation_id uuid, p_source_hash text, p_bundle jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid();v_hash text;v_prior private.care_import_batches;v_item jsonb;v_patient public.patients;v_draft public.plans;v_count integer:=0;v_plans integer:=0;v_result jsonb;
begin
 if v_uid is null or not exists(select 1 from public.clinics where owner_id=v_uid) then raise exception 'Área do profissional' using errcode='42501'; end if;
 if p_operation_id is null or p_source_hash !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_bundle) is distinct from 'object'
  or octet_length(p_bundle::text)>2000000 or jsonb_typeof(p_bundle->'records') is distinct from 'array' or jsonb_typeof(p_bundle->'plans') is distinct from 'array'
  or jsonb_array_length(p_bundle->'records')>500 or jsonb_array_length(p_bundle->'plans')>100 then raise exception 'Lote inválido' using errcode='22023'; end if;
 v_hash:=encode(extensions.digest(p_bundle::text,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended(v_uid::text,90721));
 select * into v_prior from private.care_import_batches where owner_id=v_uid and operation_id=p_operation_id;
 if found then
  if v_prior.payload_hash<>v_hash or v_prior.source_hash<>p_source_hash then raise exception 'A operação já foi usada com outro conteúdo' using errcode='22023'; end if;
  return v_prior.result||'{"replayed":true}'::jsonb;
 end if;
 select * into v_prior from private.care_import_batches where owner_id=v_uid and source_hash=p_source_hash;
 if found then return v_prior.result||'{"duplicate":true}'::jsonb; end if;
 for v_item in select value from jsonb_array_elements(p_bundle->'records') loop
  select * into v_patient from public.patients where id=(v_item->>'patient_id')::uuid and clinician_id=v_uid;
  if not found then raise exception 'Paciente de outro consultório' using errcode='42501'; end if;
  if length(btrim(coalesce(v_item->'data'->>'text',''))) not between 1 and 40000 then raise exception 'Histórico vazio ou extenso demais' using errcode='22023'; end if;
  if v_item->'data'->>'sourcePath' is not null and (v_item->'data'->>'sourcePath') not like v_uid::text||'/'||v_patient.id::text||'/%' then raise exception 'Arquivo não pertence ao paciente' using errcode='42501'; end if;
  insert into public.patient_records(patient_id,clinician_id,created_by,kind,title,data,visibility) values(v_patient.id,v_uid,v_uid,'import_archive',v_item->>'title',(v_item->'data')||jsonb_build_object('importOperation',p_operation_id),'private');
  v_count:=v_count+1;
 end loop;
 for v_item in select value from jsonb_array_elements(p_bundle->'plans') loop
  select * into v_patient from public.patients where id=(v_item->>'patient_id')::uuid and clinician_id=v_uid;
  if not found then raise exception 'Paciente de outro consultório' using errcode='42501'; end if;
  if not private.care_plan_ready(v_item->'data') then raise exception 'Plano importado inválido' using errcode='22023'; end if;
  select * into v_draft from public.plans where patient_id=v_patient.id and status='draft' for update;
  if coalesce(v_draft.version,0) is distinct from (v_item->>'expected_version')::integer then raise exception 'O rascunho mudou. Prepare a prévia novamente' using errcode='40001'; end if;
  if v_draft.id is null then
   insert into public.plans(patient_id,clinician_id,status,data) values(v_patient.id,v_uid,'draft',v_item->'data');
  else
   insert into public.patient_records(patient_id,clinician_id,created_by,kind,title,data,visibility) values(v_patient.id,v_uid,v_uid,'import_archive','Cópia do rascunho antes da importação',jsonb_build_object('date',current_date,'text','Rascunho preservado antes da importação.','planSnapshot',v_draft.data,'source','Torque Nutri','importOperation',p_operation_id),'private');
   update public.plans set data=v_item->'data' where id=v_draft.id;
  end if;
  v_plans:=v_plans+1;
 end loop;
 v_result:=jsonb_build_object('records',v_count,'plans',v_plans);
 insert into private.care_import_batches(owner_id,operation_id,source_hash,payload_hash,result) values(v_uid,p_operation_id,p_source_hash,v_hash,v_result);
 return v_result;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.meal_ids_valid(p_meals jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare v_item jsonb; v_ids text[] := array[]::text[]; v_id text;
begin
  if p_meals is null or pg_catalog.jsonb_typeof(p_meals) <> 'array' then return false; end if;
  if pg_catalog.jsonb_array_length(p_meals) > 12 then return false; end if;
  for v_item in select value from pg_catalog.jsonb_array_elements(p_meals) loop
    if pg_catalog.jsonb_typeof(v_item) <> 'string' then return false; end if;
    v_id := v_item #>> '{}';
    if v_id !~ '^[A-Za-z0-9_-]{1,80}$' or v_id = any(v_ids) then return false; end if;
    v_ids := pg_catalog.array_append(v_ids, v_id);
  end loop;
  return true;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.nutrition_plan_complete(p_data jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare v_meal jsonb;
begin
  if not private.nutrition_plan_valid(p_data) then return false; end if;
  if pg_catalog.length(pg_catalog.btrim(p_data->>'titulo')) = 0
    or pg_catalog.jsonb_array_length(p_data->'refeicoes') = 0 then return false; end if;
  for v_meal in select value from pg_catalog.jsonb_array_elements(p_data->'refeicoes') loop
    if pg_catalog.jsonb_array_length(v_meal->'itens') = 0 then return false; end if;
  end loop;
  return true;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.nutrition_plan_valid(p_data jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_meal jsonb;
  v_item jsonb;
  v_meal_ids text[] := array[]::text[];
  v_item_ids text[];
  v_id text;
begin
  if p_data is null or pg_catalog.jsonb_typeof(p_data) <> 'object'
    or pg_catalog.octet_length(p_data::text) > 204800
    or p_data->'v' is distinct from '1'::jsonb
    or pg_catalog.jsonb_typeof(p_data->'refeicoes') is distinct from 'array'
  then return false; end if;
  if pg_catalog.jsonb_array_length(p_data->'refeicoes') not between 0 and 12 then
    return false;
  end if;
  if pg_catalog.jsonb_typeof(p_data->'titulo') is distinct from 'string'
    or pg_catalog.length(p_data->>'titulo') > 200
  then return false; end if;
  if p_data ? 'aguaMl' then
    if pg_catalog.jsonb_typeof(p_data->'aguaMl') is distinct from 'number' then return false; end if;
    if (p_data->>'aguaMl')::numeric not between 0 and 20000 then return false; end if;
  end if;
  for v_meal in select value from pg_catalog.jsonb_array_elements(p_data->'refeicoes') loop
    if pg_catalog.jsonb_typeof(v_meal) <> 'object'
      or pg_catalog.jsonb_typeof(v_meal->'id') is distinct from 'string'
      or pg_catalog.jsonb_typeof(v_meal->'itens') is distinct from 'array'
    then return false; end if;
    v_id := v_meal->>'id';
    if v_id !~ '^[A-Za-z0-9_-]{1,80}$' or v_id = any(v_meal_ids) then return false; end if;
    v_meal_ids := pg_catalog.array_append(v_meal_ids, v_id);
    if pg_catalog.jsonb_array_length(v_meal->'itens') not between 0 and 50 then return false; end if;
    v_item_ids := array[]::text[];
    for v_item in select value from pg_catalog.jsonb_array_elements(v_meal->'itens') loop
      if pg_catalog.jsonb_typeof(v_item) <> 'object'
        or pg_catalog.jsonb_typeof(v_item->'id') is distinct from 'string'
        or pg_catalog.jsonb_typeof(v_item->'nome') is distinct from 'string'
        or pg_catalog.jsonb_typeof(v_item->'qtd') is distinct from 'number'
      then return false; end if;
      v_id := v_item->>'id';
      if v_id !~ '^[A-Za-z0-9_-]{1,80}$' or v_id = any(v_item_ids) then return false; end if;
      if (v_item->>'qtd')::numeric <= 0 or (v_item->>'qtd')::numeric > 10000 then return false; end if;
      v_item_ids := pg_catalog.array_append(v_item_ids, v_id);
      if v_item ? 'substituicoes'
        and pg_catalog.jsonb_typeof(v_item->'substituicoes') is distinct from 'array'
      then return false; end if;
    end loop;
  end loop;
  return true;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.publish_patient_plan(p_patient_id uuid, p_expected_version integer)
 RETURNS plans
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid := auth.uid(); v_draft public.plans; v_published public.plans;
begin
  if v_uid is null then raise exception 'Autenticação necessária' using errcode = '42501'; end if;
  perform 1 from public.patients p where p.id = p_patient_id and p.clinician_id = v_uid for update;
  if not found then raise exception 'Paciente não disponível' using errcode = '42501'; end if;
  select p.* into v_draft from public.plans p
    where p.patient_id = p_patient_id and p.clinician_id = v_uid and p.status = 'draft' for update;
  if not found then raise exception 'Nenhum rascunho disponível' using errcode = '22023'; end if;
  if p_expected_version is null or v_draft.version <> p_expected_version then
    raise exception 'O plano mudou; recarregue antes de publicar' using errcode = '40001';
  end if;
  if not private.nutrition_plan_complete(v_draft.data) then
    raise exception 'Complete o título e adicione alimentos às refeições antes de publicar' using errcode = '22023';
  end if;
  insert into public.plans (patient_id,clinician_id,status,data)
    values (p_patient_id,v_uid,'published',v_draft.data)
    on conflict (patient_id,status) do update set data = excluded.data
    returning * into v_published;
  update public.plans p set data = v_draft.data where p.id = v_draft.id;
  return v_published;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.publish_patient_plan(p_patient_id uuid, p_expected_version integer)
 RETURNS plans
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.publish_patient_plan(p_patient_id,p_expected_version); $function$
;
CREATE OR REPLACE FUNCTION public.read_record_history(p_record_id uuid)
 RETURNS TABLE(id uuid, version integer, snapshot jsonb, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select h.id,h.version,h.snapshot,h.created_at from private.read_record_history(p_record_id) h
  order by h.version desc,h.id desc; $function$
;
CREATE OR REPLACE FUNCTION private.read_record_history(p_record_id uuid)
 RETURNS TABLE(id uuid, version integer, snapshot jsonb, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid := auth.uid(); v_patient_id uuid; v_owner_id uuid;
begin
  if v_uid is null then
    raise exception 'Registro não disponível para esta conta' using errcode = '42501';
  end if;
  select r.patient_id,r.clinician_id into v_patient_id,v_owner_id
    from public.patient_records r
    join public.patients p on p.id = r.patient_id and p.clinician_id = r.clinician_id
    where r.id = p_record_id
      and (r.clinician_id = v_uid or (r.visibility = 'patient' and p.user_id = v_uid));
  if not found then
    -- Mesmo erro para inexistente, outra clínica, outro paciente ou registro privado.
    raise exception 'Registro não disponível para esta conta' using errcode = '42501';
  end if;
  return query
    select h.id,h.version,h.snapshot,h.created_at
      from private.platform_history h
      where h.entity_kind = 'patient_record' and h.entity_id = p_record_id
        and h.patient_id = v_patient_id and h.owner_id = v_owner_id
        and (v_owner_id = v_uid or h.visibility = 'patient')
      order by h.version desc,h.id desc;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.record_log_once(p_operation_id uuid, p_patient_id uuid, p_day date, p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid := auth.uid(); v_hash text; v_operation private.client_operations; v_response jsonb;
begin
  if v_uid is null then raise exception 'Autenticação necessária' using errcode = '42501'; end if;
  if p_operation_id is null or p_patient_id is null or p_day is null
    or pg_catalog.jsonb_typeof(p_patch) is distinct from 'object' or pg_catalog.octet_length(p_patch::text) > 32768 then
    raise exception 'Operação de diário inválida' using errcode = '22023';
  end if;
  -- Verifica vínculo antes de replay; o definer não pode usar seu privilégio para atender terceiros.
  perform p.id from public.patients p where p.id = p_patient_id and p.user_id = v_uid;
  if not found then raise exception 'Paciente não disponível para esta conta' using errcode = '42501'; end if;
  v_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('patientId',p_patient_id,'day',p_day,'patch',p_patch)::text,'UTF8'),'sha256'),'hex');
  insert into private.client_operations(user_id,operation_id,request_hash)
    values(v_uid,p_operation_id,v_hash) on conflict(user_id,operation_id) do nothing;
  select o.* into v_operation from private.client_operations o
    where o.user_id = v_uid and o.operation_id = p_operation_id for update;
  if v_operation.request_hash is distinct from v_hash then
    raise exception 'operation_id já usado com outros argumentos' using errcode = '22023';
  end if;
  if v_operation.response is not null then return v_operation.response; end if;
  select pg_catalog.to_jsonb(l) into v_response from public.record_patient_log(p_patient_id,p_day,p_patch) l;
  update private.client_operations set response = v_response where user_id = v_uid and operation_id = p_operation_id;
  return v_response;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.record_log_once(p_operation_id uuid, p_patient_id uuid, p_day date, p_patch jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.record_log_once(p_operation_id,p_patient_id,p_day,p_patch); $function$
;
CREATE OR REPLACE FUNCTION public.record_patient_log(p_patient_id uuid, p_day date, p_patch jsonb)
 RETURNS daily_logs
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_key text;
  v_log public.daily_logs;
  v_delta numeric;
  v_number numeric;
  v_meal_id text;
  v_completed boolean;
  v_mood text;
begin
  if v_uid is null then
    raise exception 'Autenticação necessária' using errcode = '42501';
  end if;
  if p_patient_id is null or p_day is null then
    raise exception 'Paciente e data são obrigatórios' using errcode = '22023';
  end if;
  if p_patch is null or pg_catalog.jsonb_typeof(p_patch) <> 'object'
    or pg_catalog.octet_length(p_patch::text) > 32768 then
    raise exception 'Patch de diário inválido' using errcode = '22023';
  end if;
  for v_key in select pg_catalog.jsonb_object_keys(p_patch) loop
    if not (v_key = any(array['waterDelta','mealId','completed','followed','weight','sleep','mood','note'])) then
      raise exception 'Campo de diário não permitido: %', v_key using errcode = '22023';
    end if;
  end loop;
  if (p_patch ? 'mealId') <> (p_patch ? 'completed') then
    raise exception 'Informe mealId e completed juntos' using errcode = '22023';
  end if;

  -- Restrição explícita, além da RLS: clínico não altera autorrelato de terceiros.
  perform p.id from public.patients p
    where p.id = p_patient_id and p.user_id = v_uid;
  if not found then
    raise exception 'Paciente não disponível para esta conta' using errcode = '42501';
  end if;

  -- Valida primeiro, antes de criar ou bloquear o diário.
  if p_patch ? 'waterDelta' then
    if pg_catalog.jsonb_typeof(p_patch->'waterDelta') is distinct from 'number' then
      raise exception 'waterDelta deve ser um inteiro' using errcode = '22023';
    end if;
    v_delta := (p_patch->>'waterDelta')::numeric;
    if v_delta <> pg_catalog.trunc(v_delta) or v_delta not between -20000 and 20000 then
      raise exception 'waterDelta deve ser inteiro entre -20000 e 20000' using errcode = '22023';
    end if;
  end if;
  if p_patch ? 'mealId' then
    if pg_catalog.jsonb_typeof(p_patch->'mealId') is distinct from 'string'
      or pg_catalog.jsonb_typeof(p_patch->'completed') is distinct from 'boolean' then
      raise exception 'mealId e completed inválidos' using errcode = '22023';
    end if;
    v_meal_id := p_patch->>'mealId';
    v_completed := (p_patch->>'completed')::boolean;
    if v_meal_id !~ '^[A-Za-z0-9_-]{1,80}$' then
      raise exception 'ID de refeição inválido' using errcode = '22023';
    end if;
  end if;
  if p_patch ? 'followed'
    and pg_catalog.jsonb_typeof(p_patch->'followed') is distinct from 'boolean' then
    raise exception 'followed deve ser booleano' using errcode = '22023';
  end if;
  if p_patch ? 'weight' and p_patch->'weight' <> 'null'::jsonb then
    if pg_catalog.jsonb_typeof(p_patch->'weight') is distinct from 'number' then
      raise exception 'weight deve ser numérico ou null' using errcode = '22023';
    end if;
    v_number := pg_catalog.round((p_patch->>'weight')::numeric,2);
    if v_number <= 0 or v_number > 1000 then
      raise exception 'Peso fora do intervalo permitido' using errcode = '22023';
    end if;
  end if;
  if p_patch ? 'sleep' and p_patch->'sleep' <> 'null'::jsonb then
    if pg_catalog.jsonb_typeof(p_patch->'sleep') is distinct from 'number' then
      raise exception 'sleep deve ser numérico ou null' using errcode = '22023';
    end if;
    if (p_patch->>'sleep')::numeric not between 0 and 24 then
      raise exception 'Sono deve estar entre 0 e 24 horas' using errcode = '22023';
    end if;
  end if;
  if p_patch ? 'mood' and p_patch->'mood' <> 'null'::jsonb then
    if pg_catalog.jsonb_typeof(p_patch->'mood') is distinct from 'string' then
      raise exception 'mood deve ser texto ou null' using errcode = '22023';
    end if;
    v_mood := p_patch->>'mood';
    if not (v_mood = any(array['great','good','neutral','low','bad'])) then
      raise exception 'Humor não permitido' using errcode = '22023';
    end if;
  end if;
  if p_patch ? 'note' then
    if pg_catalog.jsonb_typeof(p_patch->'note') is distinct from 'string'
      or pg_catalog.length(p_patch->>'note') > 4000 then
      raise exception 'note deve ser texto de até 4000 caracteres' using errcode = '22023';
    end if;
  end if;

  -- UNIQUE(patient_id,day) resolve criação concorrente. FOR UPDATE serializa os patches.
  insert into public.daily_logs(patient_id,day) values (p_patient_id,p_day)
    on conflict(patient_id,day) do nothing;
  select l.* into v_log from public.daily_logs l
    where l.patient_id = p_patient_id and l.day = p_day for update;
  if not found then
    raise exception 'Diário não disponível para esta conta' using errcode = '42501';
  end if;

  if p_patch = '{}'::jsonb then return v_log; end if;
  if p_patch ? 'waterDelta' then
    v_log.water_ml := greatest(0,least(20000,v_log.water_ml + v_delta::integer));
  end if;
  if p_patch ? 'mealId' then
    if v_completed then
      if not (v_log.meals ? v_meal_id) then
        if pg_catalog.jsonb_array_length(v_log.meals) >= 12 then
          raise exception 'Limite de refeições do diário atingido' using errcode = '22023';
        end if;
        v_log.meals := v_log.meals || pg_catalog.jsonb_build_array(v_meal_id);
      end if;
    else
      v_log.meals := v_log.meals - v_meal_id;
    end if;
  end if;
  if p_patch ? 'followed' then v_log.followed := (p_patch->>'followed')::boolean; end if;
  if p_patch ? 'weight' then v_log.weight := (p_patch->>'weight')::numeric; end if;
  if p_patch ? 'sleep' then v_log.sleep := (p_patch->>'sleep')::numeric; end if;
  if p_patch ? 'mood' then v_log.mood := p_patch->>'mood'; end if;
  if p_patch ? 'note' then v_log.note := p_patch->>'note'; end if;

  -- Valores não enviados vêm da linha bloqueada; paciente/data/autoria permanecem intactos.
  update public.daily_logs l set
    water_ml = v_log.water_ml,
    meals = v_log.meals,
    followed = v_log.followed,
    weight = v_log.weight,
    sleep = v_log.sleep,
    mood = v_log.mood,
    note = v_log.note
  where l.id = v_log.id
  returning l.* into v_log;
  if not found then
    raise exception 'Diário não disponível para esta conta' using errcode = '42501';
  end if;
  return v_log;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.redeem_patient_invite(p_code text)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.redeem_patient_invite(p_code); $function$
;
CREATE OR REPLACE FUNCTION private.redeem_patient_invite(p_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid := auth.uid(); v_email text; v_verified boolean; v_patient public.patients;
begin
  if v_uid is null then raise exception 'Autenticação necessária' using errcode = '42501'; end if;
  select u.email, (u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false))
    into v_email, v_verified from auth.users u where u.id = v_uid;
  if not found or not coalesce(v_verified,false) then
    raise exception 'Confirme o email da sua conta antes de resgatar o convite' using errcode = '42501';
  end if;
  if p_code is null or p_code !~ '^[0-9a-f]{64}$' then
    raise exception 'Convite inválido ou expirado' using errcode = '22023';
  end if;
  -- Mesmo usuário resgatando dois convites em paralelo não cria dois vínculos.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text,17));
  if exists (select 1 from public.patients p where p.user_id = v_uid) then
    raise exception 'Sua conta já está vinculada a um paciente' using errcode = '22023';
  end if;
  select p.* into v_patient from public.patients p where p.invite_code = p_code for update;
  if not found then raise exception 'Convite inválido ou expirado' using errcode = '22023'; end if;
  if v_patient.user_id is not null or v_patient.invite_expires_at <= pg_catalog.clock_timestamp()
    or lower(v_patient.email) <> lower(v_email) or v_patient.clinician_id = v_uid
  then raise exception 'Convite inválido ou expirado' using errcode = '22023'; end if;
  update public.patients p set user_id = v_uid, invite_code = null, invite_expires_at = null
    where p.id = v_patient.id and p.user_id is null;
  if not found then raise exception 'Convite inválido ou expirado' using errcode = '22023'; end if;
  return v_patient.id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.respond_appointment_request(p_record_id uuid, p_expected_version integer, p_decision text, p_start_at timestamp with time zone, p_duration_minutes integer DEFAULT 60)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.respond_appointment_request(p_record_id,p_expected_version,p_decision,p_start_at,p_duration_minutes); $function$
;
CREATE OR REPLACE FUNCTION private.respond_appointment_request(p_record_id uuid, p_expected_version integer, p_decision text, p_start_at timestamp with time zone, p_duration_minutes integer DEFAULT 60)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid(); v_request public.patient_records; v_appointment public.appointments;
  v_data jsonb; v_result public.patient_records;
begin
  if v_uid is null then raise exception 'Autenticação necessária' using errcode='42501'; end if;
  if p_decision is null or p_decision not in ('confirm','refuse') then
    raise exception 'Decisão inválida' using errcode='22023'; end if;
  select r.* into v_request from public.patient_records r where r.id=p_record_id
    and r.kind='appointment_request' and r.clinician_id=v_uid for update;
  if not found then raise exception 'Pedido não disponível' using errcode='42501'; end if;
  perform p.id from public.patients p where p.id=v_request.patient_id and p.clinician_id=v_uid for update;
  if not found then raise exception 'Paciente não disponível' using errcode='42501'; end if;
  if p_expected_version is null or p_expected_version<>v_request.version then
    raise exception 'Pedido atualizado; recarregue antes de responder' using errcode='40001'; end if;
  if v_request.data->>'status' is distinct from 'requested' then
    raise exception 'Pedido já foi respondido' using errcode='22023'; end if;
  v_data:=v_request.data - 'appointmentId';
  if p_decision='confirm' then
    if p_start_at is null or not pg_catalog.isfinite(p_start_at)
      or p_duration_minutes is null or p_duration_minutes not between 1 and 480 then
      raise exception 'Data ou duração inválidas' using errcode='22023'; end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('torque_nutri_appointments:'||v_uid::text,0));
    if exists(select 1 from public.appointments a where a.clinician_id=v_uid and a.status='scheduled'
      and a.start_at < p_start_at + pg_catalog.make_interval(mins=>p_duration_minutes)
      and a.start_at + pg_catalog.make_interval(mins=>a.duration_minutes) > p_start_at) then
      raise exception 'Horário sobreposto a outra consulta agendada' using errcode='22023'; end if;
    insert into public.appointments(patient_id,clinician_id,start_at,note,duration_minutes,status)
      values(v_request.patient_id,v_uid,p_start_at,pg_catalog.left(coalesce(v_request.data->>'note',''),2000),p_duration_minutes,'scheduled')
      returning * into v_appointment;
    v_data:=v_data||pg_catalog.jsonb_build_object('status','confirmed','appointmentId',v_appointment.id,
      'startAt',p_start_at,'durationMinutes',p_duration_minutes);
  else v_data:=v_data||pg_catalog.jsonb_build_object('status','refused'); end if;
  v_data:=v_data||pg_catalog.jsonb_build_object('respondedAt',pg_catalog.clock_timestamp(),'respondedBy',v_uid);
  update public.patient_records r set data=v_data where r.id=v_request.id and r.version=p_expected_version returning * into v_result;
  if not found then raise exception 'Pedido mudou durante a resposta' using errcode='40001'; end if;
  return pg_catalog.jsonb_build_object('record',pg_catalog.to_jsonb(v_result),
    'appointment',case when p_decision='confirm' then pg_catalog.to_jsonb(v_appointment) else 'null'::jsonb end);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.revoke_patient_access(p_patient_id uuid, p_expected_user_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.revoke_patient_access(p_patient_id,p_expected_user_id); $function$
;
CREATE OR REPLACE FUNCTION private.revoke_patient_access(p_patient_id uuid, p_expected_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid(); v_patient public.patients;
begin
  if v_uid is null then raise exception 'Autenticação necessária' using errcode='42501'; end if;
  select p.* into v_patient from public.patients p
    where p.id=p_patient_id and p.clinician_id=v_uid for update;
  if not found then raise exception 'Paciente não disponível' using errcode='42501'; end if;
  if v_patient.user_id is distinct from p_expected_user_id then
    raise exception 'Vínculo atualizado; recarregue antes de desvincular' using errcode='40001';
  end if;
  update public.patients p set user_id=null,invite_code=null,invite_expires_at=null
    where p.id=v_patient.id and p.clinician_id=v_uid
      and p.user_id is not distinct from p_expected_user_id;
  if not found then
    raise exception 'Vínculo atualizado; recarregue antes de desvincular' using errcode='40001';
  end if;
  return pg_catalog.jsonb_build_object('patientId',v_patient.id,'userId',null,'revoked',true);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.rotate_patient_invite(p_patient_id uuid)
 RETURNS TABLE(invite_code text, invite_expires_at timestamp with time zone)
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select * from private.rotate_patient_invite(p_patient_id); $function$
;
CREATE OR REPLACE FUNCTION private.rotate_patient_invite(p_patient_id uuid)
 RETURNS TABLE(invite_code text, invite_expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_patient public.patients; v_code text; v_exp timestamptz;
begin
  if auth.uid() is null then raise exception 'Autenticação necessária' using errcode = '42501'; end if;
  select p.* into v_patient from public.patients p
    where p.id = p_patient_id and p.clinician_id = auth.uid() for update;
  if not found then raise exception 'Paciente não disponível' using errcode = '42501'; end if;
  if v_patient.user_id is not null then raise exception 'Paciente já vinculado' using errcode = '22023'; end if;
  v_code := pg_catalog.encode(extensions.gen_random_bytes(32),'hex');
  v_exp := pg_catalog.clock_timestamp() + interval '7 days';
  update public.patients p set invite_code = v_code, invite_expires_at = v_exp where p.id = p_patient_id;
  return query select v_code, v_exp;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.save_food_journal(p_operation_id uuid, p_patient_id uuid, p_record_id uuid, p_expected_version integer, p_title text, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid(); v_patient public.patients; v_record public.patient_records;
  v_operation private.client_operations; v_hash text; v_response jsonb;
  v_item jsonb; v_key text; v_n numeric; v_day date;
  v_today date := pg_catalog.timezone('America/Sao_Paulo',pg_catalog.clock_timestamp())::date;
begin
  if v_uid is null then raise exception 'Autenticação necessária' using errcode='42501'; end if;
  -- O vínculo é conferido ANTES do ledger/replay; desligar o paciente revoga novos replays.
  select p.* into v_patient from public.patients p
    where p.id=p_patient_id and p.user_id=v_uid for share;
  if not found then raise exception 'Paciente não disponível para esta conta' using errcode='42501'; end if;
  if p_operation_id is null or p_title is null or pg_catalog.length(pg_catalog.btrim(p_title)) not between 1 and 200
    or pg_catalog.jsonb_typeof(p_data) is distinct from 'object'
    or pg_catalog.octet_length(p_data::text)>350000
    or ((p_record_id is null) <> (p_expected_version is null))
    or (p_expected_version is not null and p_expected_version<1) then
    raise exception 'Registro alimentar inválido' using errcode='22023';
  end if;
  for v_key in select pg_catalog.jsonb_object_keys(p_data) loop
    if v_key not in ('day','mealId','items','note','image','planVersion') then
      raise exception 'Campo desconhecido no registro alimentar: %',v_key using errcode='22023';
    end if;
  end loop;
  if pg_catalog.jsonb_typeof(p_data->'day') is distinct from 'string'
    or p_data->>'day' !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Data do consumo inválida' using errcode='22023';
  end if;
  begin v_day := (p_data->>'day')::date;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'Data do consumo inválida' using errcode='22023'; end;
  if v_day>v_today then raise exception 'Registre apenas refeições já consumidas' using errcode='22023'; end if;
  if p_data ? 'mealId' and p_data->'mealId'<>'null'::jsonb and (
    pg_catalog.jsonb_typeof(p_data->'mealId') is distinct from 'string'
    or p_data->>'mealId' !~ '^[A-Za-z0-9_-]{1,100}$') then
    raise exception 'Identificador da refeição inválido' using errcode='22023';
  end if;
  if p_data ? 'planVersion' and p_data->'planVersion'<>'null'::jsonb then
    if pg_catalog.jsonb_typeof(p_data->'planVersion') is distinct from 'number' then
      raise exception 'Versão do plano inválida' using errcode='22023'; end if;
    v_n := (p_data->>'planVersion')::numeric;
    if v_n<>pg_catalog.trunc(v_n) or v_n not between 1 and 1000000 then
      raise exception 'Versão do plano inválida' using errcode='22023'; end if;
  end if;
  if p_data ? 'note' and (pg_catalog.jsonb_typeof(p_data->'note') is distinct from 'string'
    or pg_catalog.length(p_data->>'note')>4000) then
    raise exception 'Observação inválida' using errcode='22023'; end if;
  if p_data ? 'image' and p_data->'image'<>'null'::jsonb and (pg_catalog.jsonb_typeof(p_data->'image') is distinct from 'string'
    or pg_catalog.length(p_data->>'image')>250000
    or (p_data->>'image'<>'' and p_data->>'image' !~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$')) then
    raise exception 'Foto do registro inválida' using errcode='22023'; end if;
  if pg_catalog.jsonb_typeof(p_data->'items') is distinct from 'array'
    or pg_catalog.jsonb_array_length(p_data->'items') not between 1 and 100 then
    raise exception 'Informe entre 1 e 100 alimentos consumidos' using errcode='22023'; end if;
  for v_item in select value from pg_catalog.jsonb_array_elements(p_data->'items') loop
    if pg_catalog.jsonb_typeof(v_item) is distinct from 'object'
      or pg_catalog.jsonb_typeof(v_item->'nome') is distinct from 'string'
      or pg_catalog.length(pg_catalog.btrim(v_item->>'nome')) not between 1 and 200
      or pg_catalog.jsonb_typeof(v_item->'porcao') is distinct from 'string'
      or pg_catalog.length(pg_catalog.btrim(v_item->>'porcao')) not between 1 and 100
      or pg_catalog.jsonb_typeof(v_item->'qtd') is distinct from 'number' then
      raise exception 'Nome, porção ou quantidade do alimento inválidos' using errcode='22023'; end if;
    for v_key in select pg_catalog.jsonb_object_keys(v_item) loop
      if v_key not in ('id','nome','qtd','porcao','k','pt','cb','g') then
        raise exception 'Campo desconhecido no alimento: %',v_key using errcode='22023'; end if;
    end loop;
    if v_item ? 'id' and (pg_catalog.jsonb_typeof(v_item->'id') is distinct from 'string'
      or pg_catalog.length(v_item->>'id') not between 1 and 160) then
      raise exception 'Identificador do alimento inválido' using errcode='22023'; end if;
    v_n := (v_item->>'qtd')::numeric;
    if v_n<=0 or v_n>1000 then raise exception 'Quantidade deve ser positiva e até 1000 porções' using errcode='22023'; end if;
    foreach v_key in array array['k','pt','cb','g'] loop
      if v_item ? v_key then
        if pg_catalog.jsonb_typeof(v_item->v_key) is distinct from 'number' then
          raise exception 'Valor nutricional inválido: %',v_key using errcode='22023'; end if;
        v_n := (v_item->>v_key)::numeric;
        if v_n<0 or v_n>100000 then raise exception 'Valor nutricional fora do limite: %',v_key using errcode='22023'; end if;
      end if;
    end loop;
  end loop;
  -- Esses valores são um snapshot declarado pelo paciente, nunca uma revisão da nutri.
  -- A ausência de macros permanece ausência; a função não preenche nutrientes com zero.
  v_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(pg_catalog.jsonb_build_object(
    'action','save_food_journal','patientId',p_patient_id,'recordId',p_record_id,
    'expectedVersion',p_expected_version,'title',p_title,'data',p_data)::text,'UTF8'),'sha256'),'hex');
  insert into private.client_operations(user_id,operation_id,request_hash)
    values(v_uid,p_operation_id,v_hash) on conflict(user_id,operation_id) do nothing;
  select o.* into v_operation from private.client_operations o
    where o.user_id=v_uid and o.operation_id=p_operation_id for update;
  if v_operation.request_hash is distinct from v_hash then
    raise exception 'operation_id já usado com outros argumentos' using errcode='22023'; end if;
  if v_operation.response is not null then return v_operation.response; end if;
  if p_record_id is null then
    insert into public.patient_records(patient_id,clinician_id,created_by,kind,title,data,visibility)
      values(p_patient_id,v_patient.clinician_id,v_uid,'food_journal',pg_catalog.btrim(p_title),p_data,'patient')
      returning * into v_record;
  else
    select r.* into v_record from public.patient_records r where r.id=p_record_id
      and r.patient_id=p_patient_id and r.created_by=v_uid and r.kind='food_journal'
      and r.visibility='patient' for update;
    if not found then raise exception 'Registro alimentar indisponível' using errcode='42501'; end if;
    if v_record.version<>p_expected_version then
      raise exception 'O registro mudou em outra sessão. Atualize antes de editar.' using errcode='40001'; end if;
    update public.patient_records set title=pg_catalog.btrim(p_title),data=p_data
      where id=v_record.id returning * into v_record;
  end if;
  v_response := pg_catalog.to_jsonb(v_record);
  update private.client_operations set response=v_response
    where user_id=v_uid and operation_id=p_operation_id;
  return v_response;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.save_food_journal(p_operation_id uuid, p_patient_id uuid, p_record_id uuid, p_expected_version integer, p_title text, p_data jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.save_food_journal(p_operation_id,p_patient_id,p_record_id,p_expected_version,p_title,p_data); $function$
;
CREATE OR REPLACE FUNCTION private.submit_questionnaire(p_record_id uuid, p_expected_version integer, p_answers jsonb)
 RETURNS patient_records
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid := auth.uid(); v_assignment public.patient_records; v_response public.patient_records;
  v_today date := pg_catalog.timezone('America/Sao_Paulo',pg_catalog.clock_timestamp())::date;
  v_start date; v_interval integer; v_period text; v_number numeric; v_existing boolean;
begin
  if v_uid is null then raise exception 'Autenticação necessária' using errcode = '42501'; end if;
  select r.* into v_assignment from public.patient_records r
    join public.patients p on p.id = r.patient_id
    where r.id = p_record_id and r.kind = 'questionnaire_assignment' and r.visibility = 'patient' and p.user_id = v_uid
    for update of r;
  if not found then raise exception 'Questionário não disponível' using errcode = '42501'; end if;
  if p_expected_version is null or v_assignment.version <> p_expected_version then
    raise exception 'Questionário atualizado; recarregue antes de responder' using errcode = '40001';
  end if;
  perform private.validate_questionnaire(v_assignment.data,p_answers);
  v_start := pg_catalog.timezone('America/Sao_Paulo',v_assignment.created_at)::date;
  if v_assignment.data ? 'availableOn' and v_assignment.data->'availableOn' <> 'null'::jsonb
    and v_assignment.data->>'availableOn' <> '' then
    if pg_catalog.jsonb_typeof(v_assignment.data->'availableOn') is distinct from 'string'
      or v_assignment.data->>'availableOn' !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Data de disponibilidade inválida' using errcode = '22023';
    end if;
    begin v_start := (v_assignment.data->>'availableOn')::date;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception 'Data de disponibilidade inválida' using errcode = '22023'; end;
  end if;
  if v_assignment.data ? 'intervalDays' then
    if pg_catalog.jsonb_typeof(v_assignment.data->'intervalDays') is distinct from 'number' then
      raise exception 'Intervalo inválido' using errcode = '22023';
    end if;
    v_number := (v_assignment.data->>'intervalDays')::numeric;
    if v_number <> pg_catalog.trunc(v_number) or v_number not between 0 and 365 then
      raise exception 'Intervalo deve ser inteiro de 0 a 365' using errcode = '22023';
    end if;
    v_interval := v_number::integer;
  else v_interval := 0; end if;
  if v_today < v_start then raise exception 'Questionário ainda indisponível' using errcode = '22023'; end if;
  v_period := case when v_interval = 0 then 'once'
    else (v_start + ((v_today - v_start) / v_interval) * v_interval)::text end;
  select r.* into v_response from public.patient_records r where r.patient_id = v_assignment.patient_id
    and r.kind = 'form_response' and r.data->>'assignmentId' = p_record_id::text
    and r.data->>'assignmentVersion' = p_expected_version::text and r.data->>'period' = v_period;
  v_existing := found;
  if v_existing then
    if v_response.data->'answers' is distinct from p_answers then
      raise exception 'Este período já foi respondido' using errcode = '22023';
    end if;
    return v_response;
  end if;
  insert into public.patient_records(patient_id,clinician_id,created_by,kind,title,data,visibility)
  values (v_assignment.patient_id,v_assignment.clinician_id,v_uid,'form_response',v_assignment.title,
    pg_catalog.jsonb_build_object('assignmentId',p_record_id,'assignmentVersion',p_expected_version,
      'questions',v_assignment.data->'questions','answers',p_answers,'period',v_period),'patient')
  returning * into v_response;
  return v_response;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.submit_questionnaire(p_record_id uuid, p_expected_version integer, p_answers jsonb)
 RETURNS patient_records
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.submit_questionnaire(p_record_id,p_expected_version,p_answers); $function$
;
CREATE OR REPLACE FUNCTION private.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ begin new.updated_at := pg_catalog.clock_timestamp(); return new; end; $function$
;
CREATE OR REPLACE FUNCTION private.validate_care_record()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_patient public.patients; v_item jsonb; v_day date; v_key text;
begin
 if new.kind not in ('quick_checkin','care_action','care_preferences','consultation_brief','training_context','import_archive') then return new; end if;
 select id,clinician_id,user_id into v_patient.id,v_patient.clinician_id,v_patient.user_id from public.patients where id=new.patient_id;
 if auth.uid() is null or v_patient.id is null then raise exception 'Paciente indisponível' using errcode='42501'; end if;
 if new.kind in ('quick_checkin','care_preferences','training_context') then
  if auth.uid() is distinct from v_patient.user_id or new.created_by is distinct from v_patient.user_id or new.visibility<>'patient' then
   raise exception 'Este relato é controlado pelo paciente' using errcode='42501'; end if;
 else
  if auth.uid() is distinct from v_patient.clinician_id or new.visibility<>'private' then
   raise exception 'Registro restrito à nutri responsável' using errcode='42501'; end if;
 end if;
 if new.kind='quick_checkin' then
  if jsonb_typeof(new.data->'day') is distinct from 'string' or coalesce(new.data->>'day','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Data de check-in inválida' using errcode='22023'; end if;
  v_day:=(new.data->>'day')::date;
  if v_day>current_date+1 or v_day<current_date-90 or to_char(v_day,'YYYY-MM-DD')<>new.data->>'day' then raise exception 'Data de check-in fora do período permitido' using errcode='22023'; end if;
  if coalesce(new.data->>'mood','') not in ('great','good','neutral','low','bad')
    or coalesce(new.data->>'barrier','') not in ('none','time','cost','hunger','routine','taste','other')
    or jsonb_typeof(new.data->'support') is distinct from 'boolean'
    or jsonb_typeof(new.data->'note') is distinct from 'string' or length(new.data->>'note')>2000 then raise exception 'Confira os campos do check-in' using errcode='22023'; end if;
  if tg_op='UPDATE' and new.data->>'day' is distinct from old.data->>'day' then raise exception 'A data do check-in é imutável' using errcode='22023'; end if;
 elsif new.kind='training_context' then
  if jsonb_typeof(new.data->'consent') is distinct from 'boolean' or jsonb_typeof(new.data->'revoked') is distinct from 'boolean'
    or jsonb_typeof(new.data->'sessions') is distinct from 'array' or jsonb_array_length(new.data->'sessions')>42
    or coalesce(new.data->>'source','') not in ('Torque Personal','Informada pelo paciente','Paciente')
    or length(coalesce(new.data->>'note',''))>2000 then raise exception 'Rotina de treino inválida' using errcode='22023'; end if;
  if not (new.data->>'revoked')::boolean and not (new.data->>'consent')::boolean then raise exception 'Confirme o compartilhamento' using errcode='22023'; end if;
  for v_item in select value from jsonb_array_elements(new.data->'sessions') loop
   if coalesce(v_item->>'day','') not in ('Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado')
     or length(coalesce(v_item->>'title','')) not between 1 and 120
     or coalesce(v_item->>'time','') !~ '^$|^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Horário de treino inválido' using errcode='22023'; end if;
  end loop;
 elsif new.kind='care_preferences' then
  if jsonb_typeof(new.data->'days') is distinct from 'number' or (new.data->>'days')::numeric not between 1 and 31
   or (new.data->>'days')::numeric<>trunc((new.data->>'days')::numeric)
   or jsonb_typeof(new.data->'selections') is distinct from 'object' or jsonb_typeof(new.data->'prices') is distinct from 'object'
   or length(coalesce(new.data->>'note',''))>2000 then raise exception 'Preferências inválidas' using errcode='22023'; end if;
  for v_key in select jsonb_object_keys(new.data->'prices') loop
   if jsonb_typeof(new.data->'prices'->v_key) is distinct from 'number' or (new.data->'prices'->>v_key)::numeric not between 0 and 100000 then raise exception 'Preço inválido' using errcode='22023'; end if;
  end loop;
 elsif new.kind='care_action' then
  if length(coalesce(new.data->>'reasonKey','')) not between 1 and 240 or coalesce(new.data->>'status','') not in ('done','snoozed') or length(btrim(coalesce(new.data->>'note',''))) not between 1 and 2000 then raise exception 'Providência inválida' using errcode='22023'; end if;
 elsif new.kind='consultation_brief' then
  if length(btrim(coalesce(new.data->>'text',''))) not between 1 and 16000 or not(new.data?'reviewedAt') then raise exception 'Revise o resumo antes de salvar' using errcode='22023'; end if;
 end if;
 return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.validate_published_nutrients()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if new.status='published' and not private.care_plan_ready(new.data) then raise exception 'Confira quantidades, porções e nutrientes antes de publicar' using errcode='22023'; end if;
 return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.validate_questionnaire(p_data jsonb, p_answers jsonb)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare v_q jsonb; v_answer jsonb; v_id text; v_key text; v_ids text[] := array[]::text[];
  v_option jsonb; v_type text; v_number numeric;
begin
  if pg_catalog.jsonb_typeof(p_data) is distinct from 'object'
    or pg_catalog.jsonb_typeof(p_data->'questions') is distinct from 'array'
    or pg_catalog.jsonb_array_length(p_data->'questions') not between 1 and 60
    or pg_catalog.jsonb_typeof(p_answers) is distinct from 'object'
    or pg_catalog.octet_length(p_answers::text) > 65536 then
    raise exception 'Questionário ou respostas inválidos' using errcode = '22023';
  end if;
  for v_q in select value from pg_catalog.jsonb_array_elements(p_data->'questions') loop
    v_id := v_q->>'id'; v_type := v_q->>'type';
    if pg_catalog.jsonb_typeof(v_q) is distinct from 'object'
      or pg_catalog.jsonb_typeof(v_q->'id') is distinct from 'string'
      or v_id !~ '^[A-Za-z0-9_-]{1,80}$' or v_id in ('__proto__','constructor','prototype') or v_id = any(v_ids)
      or pg_catalog.jsonb_typeof(v_q->'title') is distinct from 'string'
      or pg_catalog.length(pg_catalog.btrim(v_q->>'title')) not between 1 and 300
      or v_type is null or v_type not in ('text','scale','choice')
      or (v_q ? 'required' and pg_catalog.jsonb_typeof(v_q->'required') is distinct from 'boolean') then
      raise exception 'Definição de pergunta inválida' using errcode = '22023';
    end if;
    v_ids := pg_catalog.array_append(v_ids,v_id);
    if v_type = 'choice' then
      if pg_catalog.jsonb_typeof(v_q->'options') is distinct from 'array'
        or pg_catalog.jsonb_array_length(v_q->'options') not between 1 and 30 then
        raise exception 'Opções inválidas' using errcode = '22023';
      end if;
      for v_option in select value from pg_catalog.jsonb_array_elements(v_q->'options') loop
        if pg_catalog.jsonb_typeof(v_option) is distinct from 'string'
          or pg_catalog.length(pg_catalog.btrim(v_option #>> '{}')) not between 1 and 300 then
          raise exception 'Opção inválida' using errcode = '22023';
        end if;
      end loop;
    end if;
    v_answer := p_answers->v_id;
    if v_answer is null or v_answer = 'null'::jsonb
      or (pg_catalog.jsonb_typeof(v_answer) = 'string' and pg_catalog.length(pg_catalog.btrim(v_answer #>> '{}')) = 0) then
      if coalesce((v_q->>'required')::boolean,false) then
        raise exception 'Resposta obrigatória ausente: %',v_id using errcode = '22023';
      end if;
      continue;
    end if;
    if v_type in ('text','choice') then
      if pg_catalog.jsonb_typeof(v_answer) is distinct from 'string'
        or pg_catalog.length(v_answer #>> '{}') > 4000 then
        raise exception 'Resposta textual inválida: %',v_id using errcode = '22023';
      end if;
      if v_type = 'choice' and not (v_q->'options' @> pg_catalog.jsonb_build_array(v_answer)) then
        raise exception 'Resposta fora das opções: %',v_id using errcode = '22023';
      end if;
    else
      if pg_catalog.jsonb_typeof(v_answer) is distinct from 'number' then
        raise exception 'Escala deve ser numérica: %',v_id using errcode = '22023';
      end if;
      v_number := (v_answer #>> '{}')::numeric;
      if v_number <> pg_catalog.trunc(v_number) or v_number not between 0 and 10 then
        raise exception 'Escala deve ser inteiro de 0 a 10: %',v_id using errcode = '22023';
      end if;
    end if;
  end loop;
  for v_key in select pg_catalog.jsonb_object_keys(p_answers) loop
    if not (v_key = any(v_ids)) then raise exception 'Pergunta desconhecida: %',v_key using errcode = '22023'; end if;
  end loop;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.version_plan()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ begin new.version := old.version + 1; new.updated_at := pg_catalog.clock_timestamp(); return new; end; $function$
;
ALTER TABLE "public"."appointments" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "public"."appointments" ALTER COLUMN "note" SET DEFAULT ''::text;
ALTER TABLE "public"."appointments" ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE "public"."appointments" ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE "public"."appointments" ALTER COLUMN "duration_minutes" SET DEFAULT 60;
ALTER TABLE "public"."appointments" ALTER COLUMN "status" SET DEFAULT 'scheduled'::text;
ALTER TABLE "private"."care_import_batches" ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE "public"."challenges" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "public"."challenges" ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE "public"."challenges" ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE "private"."client_operations" ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE "public"."clinic_resources" ALTER COLUMN "id" SET DEFAULT extensions.gen_random_uuid();
ALTER TABLE "public"."clinic_resources" ALTER COLUMN "owner_id" SET DEFAULT auth.uid();
ALTER TABLE "public"."clinic_resources" ALTER COLUMN "data" SET DEFAULT '{}'::jsonb;
ALTER TABLE "public"."clinic_resources" ALTER COLUMN "shared" SET DEFAULT false;
ALTER TABLE "public"."clinic_resources" ALTER COLUMN "version" SET DEFAULT 1;
ALTER TABLE "public"."clinic_resources" ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE "public"."clinic_resources" ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE "public"."clinics" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "public"."clinics" ALTER COLUMN "crn" SET DEFAULT ''::text;
ALTER TABLE "public"."clinics" ALTER COLUMN "color" SET DEFAULT '#5de0b4'::text;
ALTER TABLE "public"."clinics" ALTER COLUMN "logo" SET DEFAULT ''::text;
ALTER TABLE "public"."clinics" ALTER COLUMN "weekly_goal" SET DEFAULT 5;
ALTER TABLE "public"."clinics" ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE "public"."clinics" ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE "public"."community_interactions" ALTER COLUMN "id" SET DEFAULT extensions.gen_random_uuid();
ALTER TABLE "public"."community_interactions" ALTER COLUMN "author_id" SET DEFAULT auth.uid();
ALTER TABLE "public"."community_interactions" ALTER COLUMN "display_name" SET DEFAULT ''::text;
ALTER TABLE "public"."community_interactions" ALTER COLUMN "body" SET DEFAULT ''::text;
ALTER TABLE "public"."community_interactions" ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE "public"."community_interactions" ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE "public"."community_posts" ALTER COLUMN "id" SET DEFAULT extensions.gen_random_uuid();
ALTER TABLE "public"."community_posts" ALTER COLUMN "author_id" SET DEFAULT auth.uid();
ALTER TABLE "public"."community_posts" ALTER COLUMN "display_name" SET DEFAULT ''::text;
ALTER TABLE "public"."community_posts" ALTER COLUMN "body" SET DEFAULT ''::text;
ALTER TABLE "public"."community_posts" ALTER COLUMN "status" SET DEFAULT 'active'::text;
ALTER TABLE "public"."community_posts" ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE "public"."community_posts" ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE "public"."daily_logs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "public"."daily_logs" ALTER COLUMN "water_ml" SET DEFAULT 0;
ALTER TABLE "public"."daily_logs" ALTER COLUMN "meals" SET DEFAULT '[]'::jsonb;
ALTER TABLE "public"."daily_logs" ALTER COLUMN "followed" SET DEFAULT false;
ALTER TABLE "public"."daily_logs" ALTER COLUMN "note" SET DEFAULT ''::text;
ALTER TABLE "public"."daily_logs" ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE "public"."daily_logs" ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE "public"."financial_entries" ALTER COLUMN "id" SET DEFAULT extensions.gen_random_uuid();
ALTER TABLE "public"."financial_entries" ALTER COLUMN "owner_id" SET DEFAULT auth.uid();
ALTER TABLE "public"."financial_entries" ALTER COLUMN "status" SET DEFAULT 'pending'::text;
ALTER TABLE "public"."financial_entries" ALTER COLUMN "method" SET DEFAULT ''::text;
ALTER TABLE "public"."financial_entries" ALTER COLUMN "note" SET DEFAULT ''::text;
ALTER TABLE "public"."financial_entries" ALTER COLUMN "version" SET DEFAULT 1;
ALTER TABLE "public"."financial_entries" ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE "public"."financial_entries" ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE "public"."messages" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "public"."messages" ALTER COLUMN "sender_id" SET DEFAULT auth.uid();
ALTER TABLE "public"."messages" ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE "public"."patient_records" ALTER COLUMN "id" SET DEFAULT extensions.gen_random_uuid();
ALTER TABLE "public"."patient_records" ALTER COLUMN "created_by" SET DEFAULT auth.uid();
ALTER TABLE "public"."patient_records" ALTER COLUMN "data" SET DEFAULT '{}'::jsonb;
ALTER TABLE "public"."patient_records" ALTER COLUMN "visibility" SET DEFAULT 'private'::text;
ALTER TABLE "public"."patient_records" ALTER COLUMN "version" SET DEFAULT 1;
ALTER TABLE "public"."patient_records" ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE "public"."patient_records" ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE "public"."patients" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "public"."patients" ALTER COLUMN "goal" SET DEFAULT ''::text;
ALTER TABLE "public"."patients" ALTER COLUMN "restrictions" SET DEFAULT ''::text;
ALTER TABLE "public"."patients" ALTER COLUMN "notes" SET DEFAULT ''::text;
ALTER TABLE "public"."patients" ALTER COLUMN "invite_code" SET DEFAULT encode(gen_random_bytes(32), 'hex'::text);
ALTER TABLE "public"."patients" ALTER COLUMN "invite_expires_at" SET DEFAULT (now() + '7 days'::interval);
ALTER TABLE "public"."patients" ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE "public"."patients" ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE "public"."plans" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "public"."plans" ALTER COLUMN "status" SET DEFAULT 'draft'::text;
ALTER TABLE "public"."plans" ALTER COLUMN "version" SET DEFAULT 1;
ALTER TABLE "public"."plans" ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE "public"."plans" ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE "private"."platform_history" ALTER COLUMN "id" SET DEFAULT extensions.gen_random_uuid();
ALTER TABLE "private"."platform_history" ALTER COLUMN "created_at" SET DEFAULT clock_timestamp();
ALTER TABLE "public"."appointments" ADD CONSTRAINT "appointments_pkey" PRIMARY KEY (id);
ALTER TABLE "private"."care_import_batches" ADD CONSTRAINT "care_import_batches_pkey" PRIMARY KEY (owner_id, operation_id);
ALTER TABLE "public"."challenges" ADD CONSTRAINT "challenges_pkey" PRIMARY KEY (id);
ALTER TABLE "private"."client_operations" ADD CONSTRAINT "client_operations_pkey" PRIMARY KEY (user_id, operation_id);
ALTER TABLE "public"."clinic_resources" ADD CONSTRAINT "clinic_resources_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."clinics" ADD CONSTRAINT "clinics_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."community_interactions" ADD CONSTRAINT "community_interactions_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."community_posts" ADD CONSTRAINT "community_posts_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."daily_logs" ADD CONSTRAINT "daily_logs_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."financial_entries" ADD CONSTRAINT "financial_entries_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."patient_records" ADD CONSTRAINT "patient_records_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."patients" ADD CONSTRAINT "patients_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."plans" ADD CONSTRAINT "plans_pkey" PRIMARY KEY (id);
ALTER TABLE "private"."platform_history" ADD CONSTRAINT "platform_history_pkey" PRIMARY KEY (id);
ALTER TABLE "private"."care_import_batches" ADD CONSTRAINT "care_import_batches_owner_id_source_hash_key" UNIQUE (owner_id, source_hash);
ALTER TABLE "public"."clinics" ADD CONSTRAINT "clinics_id_owner_id_key" UNIQUE (id, owner_id);
ALTER TABLE "public"."clinics" ADD CONSTRAINT "clinics_owner_id_key" UNIQUE (owner_id);
ALTER TABLE "public"."daily_logs" ADD CONSTRAINT "daily_logs_patient_id_day_key" UNIQUE (patient_id, day);
ALTER TABLE "public"."patients" ADD CONSTRAINT "patients_id_clinician_id_key" UNIQUE (id, clinician_id);
ALTER TABLE "public"."patients" ADD CONSTRAINT "patients_invite_code_key" UNIQUE (invite_code);
ALTER TABLE "public"."patients" ADD CONSTRAINT "patients_user_id_key" UNIQUE (user_id);
ALTER TABLE "public"."plans" ADD CONSTRAINT "plans_patient_id_status_key" UNIQUE (patient_id, status);
ALTER TABLE "private"."platform_history" ADD CONSTRAINT "platform_history_entity_version_key" UNIQUE (entity_kind, entity_id, version);
ALTER TABLE "public"."appointments" ADD CONSTRAINT "appointments_duration_minutes_check" CHECK (duration_minutes >= 1 AND duration_minutes <= 480);
ALTER TABLE "public"."appointments" ADD CONSTRAINT "appointments_note_check" CHECK (length(note) <= 2000);
ALTER TABLE "public"."appointments" ADD CONSTRAINT "appointments_status_check" CHECK (status = ANY (ARRAY['scheduled'::text, 'completed'::text, 'cancelled'::text]));
ALTER TABLE "public"."challenges" ADD CONSTRAINT "challenges_metric_check" CHECK (metric = ANY (ARRAY['nutriDias'::text, 'nutriRegistros'::text, 'habitosAgua'::text, 'habitosSono'::text, 'checkins'::text]));
ALTER TABLE "public"."challenges" ADD CONSTRAINT "challenges_target_check" CHECK (target > 0::numeric AND target <= 1000000::numeric);
ALTER TABLE "public"."challenges" ADD CONSTRAINT "challenges_title_check" CHECK (length(btrim(title)) >= 1 AND length(btrim(title)) <= 200);
ALTER TABLE "private"."client_operations" ADD CONSTRAINT "client_operations_request_hash_check" CHECK (request_hash ~ '^[0-9a-f]{64}$'::text);
ALTER TABLE "private"."client_operations" ADD CONSTRAINT "client_operations_response_check" CHECK (response IS NULL OR jsonb_typeof(response) = 'object'::text);
ALTER TABLE "public"."clinic_resources" ADD CONSTRAINT "clinic_resources_check" CHECK (NOT shared OR (kind = ANY (ARRAY['food'::text, 'recipe'::text, 'plan_template'::text, 'service'::text, 'product'::text, 'coupon'::text, 'professional_page'::text, 'notice'::text])));
ALTER TABLE "public"."clinic_resources" ADD CONSTRAINT "clinic_resources_data_check" CHECK (jsonb_typeof(data) = 'object'::text AND octet_length(data::text) <= 350000);
ALTER TABLE "public"."clinic_resources" ADD CONSTRAINT "clinic_resources_kind_check" CHECK (kind = ANY (ARRAY['food'::text, 'recipe'::text, 'plan_template'::text, 'questionnaire'::text, 'service'::text, 'automation'::text, 'task'::text, 'product'::text, 'coupon'::text, 'settings'::text, 'professional_page'::text, 'team'::text, 'notice'::text, 'referral'::text]));
ALTER TABLE "public"."clinic_resources" ADD CONSTRAINT "clinic_resources_title_check" CHECK (length(btrim(title)) >= 1 AND length(btrim(title)) <= 200);
ALTER TABLE "public"."clinic_resources" ADD CONSTRAINT "clinic_resources_version_check" CHECK (version > 0);
ALTER TABLE "public"."clinics" ADD CONSTRAINT "clinics_color_check" CHECK (color ~ '^#[A-Fa-f0-9]{6}$'::text);
ALTER TABLE "public"."clinics" ADD CONSTRAINT "clinics_crn_check" CHECK (length(crn) <= 80);
ALTER TABLE "public"."clinics" ADD CONSTRAINT "clinics_logo_check" CHECK (length(logo) <= 280000 AND (logo = ''::text OR logo ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$'::text));
ALTER TABLE "public"."clinics" ADD CONSTRAINT "clinics_name_check" CHECK (length(btrim(name)) >= 1 AND length(btrim(name)) <= 120);
ALTER TABLE "public"."clinics" ADD CONSTRAINT "clinics_professional_name_check" CHECK (length(btrim(professional_name)) >= 1 AND length(btrim(professional_name)) <= 120);
ALTER TABLE "public"."clinics" ADD CONSTRAINT "clinics_weekly_goal_check" CHECK (weekly_goal >= 1 AND weekly_goal <= 7);
ALTER TABLE "public"."community_interactions" ADD CONSTRAINT "community_interactions_body_check" CHECK (length(body) <= 2000);
ALTER TABLE "public"."community_interactions" ADD CONSTRAINT "community_interactions_check" CHECK (kind = 'like'::text AND body = ''::text OR kind = 'comment'::text AND length(btrim(body)) > 0);
ALTER TABLE "public"."community_interactions" ADD CONSTRAINT "community_interactions_display_name_check" CHECK (length(display_name) >= 1 AND length(display_name) <= 100);
ALTER TABLE "public"."community_interactions" ADD CONSTRAINT "community_interactions_kind_check" CHECK (kind = ANY (ARRAY['like'::text, 'comment'::text]));
ALTER TABLE "public"."community_posts" ADD CONSTRAINT "community_posts_body_check" CHECK (length(body) <= 4000);
ALTER TABLE "public"."community_posts" ADD CONSTRAINT "community_posts_check" CHECK (length(btrim(body)) > 0 OR image IS NOT NULL);
ALTER TABLE "public"."community_posts" ADD CONSTRAINT "community_posts_display_name_check" CHECK (length(display_name) >= 1 AND length(display_name) <= 100);
ALTER TABLE "public"."community_posts" ADD CONSTRAINT "community_posts_image_check" CHECK (image IS NULL OR length(image) <= 250000 AND image ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$'::text);
ALTER TABLE "public"."community_posts" ADD CONSTRAINT "community_posts_status_check" CHECK (status = ANY (ARRAY['active'::text, 'archived'::text]));
ALTER TABLE "public"."daily_logs" ADD CONSTRAINT "daily_logs_meals_check" CHECK (private.meal_ids_valid(meals));
ALTER TABLE "public"."daily_logs" ADD CONSTRAINT "daily_logs_mood_check" CHECK (mood = ANY (ARRAY['great'::text, 'good'::text, 'neutral'::text, 'low'::text, 'bad'::text]));
ALTER TABLE "public"."daily_logs" ADD CONSTRAINT "daily_logs_note_check" CHECK (length(note) <= 4000);
ALTER TABLE "public"."daily_logs" ADD CONSTRAINT "daily_logs_sleep_check" CHECK (sleep >= 0::numeric AND sleep <= 24::numeric);
ALTER TABLE "public"."daily_logs" ADD CONSTRAINT "daily_logs_water_ml_check" CHECK (water_ml >= 0 AND water_ml <= 20000);
ALTER TABLE "public"."daily_logs" ADD CONSTRAINT "daily_logs_weight_check" CHECK (weight > 0::numeric AND weight <= 1000::numeric);
ALTER TABLE "public"."financial_entries" ADD CONSTRAINT "financial_entries_amount_cents_check" CHECK (amount_cents > 0 AND amount_cents <= 1000000000);
ALTER TABLE "public"."financial_entries" ADD CONSTRAINT "financial_entries_check" CHECK (status = 'paid'::text AND paid_on IS NOT NULL OR status <> 'paid'::text AND paid_on IS NULL);
ALTER TABLE "public"."financial_entries" ADD CONSTRAINT "financial_entries_kind_check" CHECK (kind = ANY (ARRAY['income'::text, 'expense'::text]));
ALTER TABLE "public"."financial_entries" ADD CONSTRAINT "financial_entries_method_check" CHECK (length(method) <= 80);
ALTER TABLE "public"."financial_entries" ADD CONSTRAINT "financial_entries_note_check" CHECK (length(note) <= 4000);
ALTER TABLE "public"."financial_entries" ADD CONSTRAINT "financial_entries_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'paid'::text, 'void'::text]));
ALTER TABLE "public"."financial_entries" ADD CONSTRAINT "financial_entries_title_check" CHECK (length(btrim(title)) >= 1 AND length(btrim(title)) <= 200);
ALTER TABLE "public"."financial_entries" ADD CONSTRAINT "financial_entries_version_check" CHECK (version > 0);
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_body_check" CHECK (length(btrim(body)) >= 1 AND length(btrim(body)) <= 4000);
ALTER TABLE "public"."patient_records" ADD CONSTRAINT "patient_records_check" CHECK ((kind <> ALL (ARRAY['form_response'::text, 'document_ack'::text, 'plan_version'::text])) OR visibility = 'patient'::text);
ALTER TABLE "public"."patient_records" ADD CONSTRAINT "patient_records_data_check" CHECK (jsonb_typeof(data) = 'object'::text AND octet_length(data::text) <= 350000);
ALTER TABLE "public"."patient_records" ADD CONSTRAINT "patient_records_kind_check" CHECK (kind = ANY (ARRAY['anamnesis'::text, 'clinical_note'::text, 'assessment'::text, 'form_response'::text, 'document'::text, 'document_ack'::text, 'measurement'::text, 'progress_photo'::text, 'profile_photo'::text, 'food_journal'::text, 'appointment_request'::text, 'goal_update'::text, 'session'::text, 'subscription'::text, 'nutrition_feedback'::text, 'questionnaire_assignment'::text, 'plan_version'::text, 'quick_checkin'::text, 'care_action'::text, 'care_preferences'::text, 'consultation_brief'::text, 'training_context'::text, 'import_archive'::text]));
ALTER TABLE "public"."patient_records" ADD CONSTRAINT "patient_records_title_check" CHECK (length(btrim(title)) >= 1 AND length(btrim(title)) <= 200);
ALTER TABLE "public"."patient_records" ADD CONSTRAINT "patient_records_version_check" CHECK (version > 0);
ALTER TABLE "public"."patient_records" ADD CONSTRAINT "patient_records_visibility_check" CHECK (visibility = ANY (ARRAY['private'::text, 'patient'::text]));
ALTER TABLE "public"."patients" ADD CONSTRAINT "patients_check" CHECK ((invite_code IS NULL) = (invite_expires_at IS NULL));
ALTER TABLE "public"."patients" ADD CONSTRAINT "patients_check1" CHECK (user_id IS NULL OR invite_code IS NULL);
ALTER TABLE "public"."patients" ADD CONSTRAINT "patients_email_check" CHECK (length(email) <= 320 AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'::text);
ALTER TABLE "public"."patients" ADD CONSTRAINT "patients_goal_check" CHECK (length(goal) <= 2000);
ALTER TABLE "public"."patients" ADD CONSTRAINT "patients_invite_code_check" CHECK (invite_code IS NULL OR invite_code ~ '^[0-9a-f]{64}$'::text);
ALTER TABLE "public"."patients" ADD CONSTRAINT "patients_name_check" CHECK (length(btrim(name)) >= 1 AND length(btrim(name)) <= 120);
ALTER TABLE "public"."patients" ADD CONSTRAINT "patients_notes_check" CHECK (length(notes) <= 20000);
ALTER TABLE "public"."patients" ADD CONSTRAINT "patients_restrictions_check" CHECK (length(restrictions) <= 4000);
ALTER TABLE "public"."plans" ADD CONSTRAINT "plans_check" CHECK (status <> 'published'::text OR private.nutrition_plan_complete(data));
ALTER TABLE "public"."plans" ADD CONSTRAINT "plans_data_check" CHECK (private.nutrition_plan_valid(data));
ALTER TABLE "public"."plans" ADD CONSTRAINT "plans_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'published'::text]));
ALTER TABLE "public"."plans" ADD CONSTRAINT "plans_version_check" CHECK (version > 0);
ALTER TABLE "private"."platform_history" ADD CONSTRAINT "platform_history_check" CHECK (entity_kind <> 'patient_record'::text OR patient_id IS NOT NULL);
ALTER TABLE "private"."platform_history" ADD CONSTRAINT "platform_history_entity_kind_check" CHECK (entity_kind = ANY (ARRAY['patient_record'::text, 'clinic_resource'::text, 'financial_entry'::text]));
ALTER TABLE "private"."platform_history" ADD CONSTRAINT "platform_history_snapshot_check" CHECK (jsonb_typeof(snapshot) = 'object'::text);
ALTER TABLE "private"."platform_history" ADD CONSTRAINT "platform_history_version_check" CHECK (version > 0);
ALTER TABLE "private"."platform_history" ADD CONSTRAINT "platform_history_visibility_check" CHECK (visibility = ANY (ARRAY['private'::text, 'patient'::text]));
ALTER TABLE "public"."appointments" ADD CONSTRAINT "appointments_patient_id_clinician_id_fkey" FOREIGN KEY (patient_id, clinician_id) REFERENCES patients(id, clinician_id) ON DELETE RESTRICT;
ALTER TABLE "private"."care_import_batches" ADD CONSTRAINT "care_import_batches_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id);
ALTER TABLE "public"."challenges" ADD CONSTRAINT "challenges_clinic_id_owner_id_fkey" FOREIGN KEY (clinic_id, owner_id) REFERENCES clinics(id, owner_id) ON DELETE RESTRICT;
ALTER TABLE "private"."client_operations" ADD CONSTRAINT "client_operations_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE "public"."clinic_resources" ADD CONSTRAINT "clinic_resources_clinic_id_owner_id_fkey" FOREIGN KEY (clinic_id, owner_id) REFERENCES clinics(id, owner_id) ON DELETE RESTRICT;
ALTER TABLE "public"."clinics" ADD CONSTRAINT "clinics_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE "public"."community_interactions" ADD CONSTRAINT "community_interactions_author_id_fkey" FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE "public"."community_interactions" ADD CONSTRAINT "community_interactions_post_id_fkey" FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE RESTRICT;
ALTER TABLE "public"."community_posts" ADD CONSTRAINT "community_posts_author_id_fkey" FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE "public"."community_posts" ADD CONSTRAINT "community_posts_clinic_id_fkey" FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE RESTRICT;
ALTER TABLE "public"."daily_logs" ADD CONSTRAINT "daily_logs_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE RESTRICT;
ALTER TABLE "public"."financial_entries" ADD CONSTRAINT "financial_entries_clinic_id_owner_id_fkey" FOREIGN KEY (clinic_id, owner_id) REFERENCES clinics(id, owner_id) ON DELETE RESTRICT;
ALTER TABLE "public"."financial_entries" ADD CONSTRAINT "financial_entries_patient_id_owner_id_fkey" FOREIGN KEY (patient_id, owner_id) REFERENCES patients(id, clinician_id) ON DELETE RESTRICT;
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE RESTRICT;
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE "public"."patient_records" ADD CONSTRAINT "patient_records_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE "public"."patient_records" ADD CONSTRAINT "patient_records_patient_id_clinician_id_fkey" FOREIGN KEY (patient_id, clinician_id) REFERENCES patients(id, clinician_id) ON DELETE RESTRICT;
ALTER TABLE "public"."patients" ADD CONSTRAINT "patients_clinic_id_clinician_id_fkey" FOREIGN KEY (clinic_id, clinician_id) REFERENCES clinics(id, owner_id) ON DELETE RESTRICT;
ALTER TABLE "public"."patients" ADD CONSTRAINT "patients_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."plans" ADD CONSTRAINT "plans_patient_id_clinician_id_fkey" FOREIGN KEY (patient_id, clinician_id) REFERENCES patients(id, clinician_id) ON DELETE RESTRICT;
CREATE INDEX appointments_clinician_start_idx ON public.appointments USING btree (clinician_id, start_at);
CREATE INDEX appointments_clinician_start_status_idx ON public.appointments USING btree (clinician_id, start_at) WHERE (status = 'scheduled'::text);
CREATE INDEX appointments_patient_clinician_idx ON public.appointments USING btree (patient_id, clinician_id);
CREATE INDEX appointments_patient_idx ON public.appointments USING btree (patient_id);
CREATE INDEX challenges_clinic_idx ON public.challenges USING btree (clinic_id);
CREATE INDEX challenges_clinic_owner_idx ON public.challenges USING btree (clinic_id, owner_id);
CREATE INDEX challenges_owner_idx ON public.challenges USING btree (owner_id);
CREATE INDEX clinic_resources_clinic_kind_idx ON public.clinic_resources USING btree (clinic_id, kind);
CREATE INDEX clinic_resources_owner_idx ON public.clinic_resources USING btree (owner_id);
CREATE INDEX community_interactions_author_idx ON public.community_interactions USING btree (author_id);
CREATE UNIQUE INDEX community_interactions_like_unique ON public.community_interactions USING btree (post_id, author_id) WHERE (kind = 'like'::text);
CREATE INDEX community_interactions_post_idx ON public.community_interactions USING btree (post_id, created_at);
CREATE INDEX community_posts_author_idx ON public.community_posts USING btree (author_id);
CREATE INDEX community_posts_clinic_created_idx ON public.community_posts USING btree (clinic_id, created_at DESC);
CREATE INDEX financial_entries_clinic_due_idx ON public.financial_entries USING btree (clinic_id, due_on);
CREATE INDEX financial_entries_owner_idx ON public.financial_entries USING btree (owner_id);
CREATE INDEX financial_entries_patient_idx ON public.financial_entries USING btree (patient_id);
CREATE INDEX messages_patient_created_idx ON public.messages USING btree (patient_id, created_at);
CREATE INDEX messages_sender_idx ON public.messages USING btree (sender_id);
CREATE UNIQUE INDEX patient_care_preferences_one ON public.patient_records USING btree (patient_id) WHERE (kind = 'care_preferences'::text);
CREATE UNIQUE INDEX patient_quick_checkin_day ON public.patient_records USING btree (patient_id, ((data ->> 'day'::text))) WHERE (kind = 'quick_checkin'::text);
CREATE INDEX patient_records_author_idx ON public.patient_records USING btree (created_by);
CREATE INDEX patient_records_clinician_idx ON public.patient_records USING btree (clinician_id);
CREATE UNIQUE INDEX patient_records_document_version_unique ON public.patient_records USING btree (patient_id, ((data ->> 'documentId'::text)), ((data ->> 'documentVersion'::text))) WHERE (kind = 'document_ack'::text);
CREATE UNIQUE INDEX patient_records_form_period_unique ON public.patient_records USING btree (patient_id, ((data ->> 'assignmentId'::text)), ((data ->> 'assignmentVersion'::text)), ((data ->> 'period'::text))) WHERE (kind = 'form_response'::text);
CREATE INDEX patient_records_patient_kind_idx ON public.patient_records USING btree (patient_id, kind, created_at DESC);
CREATE UNIQUE INDEX patient_records_plan_version_unique ON public.patient_records USING btree (patient_id, ((data ->> 'planId'::text)), ((data ->> 'planVersion'::text))) WHERE (kind = 'plan_version'::text);
CREATE UNIQUE INDEX patient_training_context_one ON public.patient_records USING btree (patient_id) WHERE (kind = 'training_context'::text);
CREATE INDEX patients_clinic_clinician_idx ON public.patients USING btree (clinic_id, clinician_id);
CREATE UNIQUE INDEX patients_clinic_email_unique ON public.patients USING btree (clinic_id, lower(email));
CREATE INDEX patients_clinic_idx ON public.patients USING btree (clinic_id);
CREATE INDEX patients_clinician_idx ON public.patients USING btree (clinician_id);
CREATE INDEX plans_clinician_idx ON public.plans USING btree (clinician_id);
CREATE INDEX plans_patient_clinician_idx ON public.plans USING btree (patient_id, clinician_id);
CREATE TRIGGER appointments_overlap BEFORE INSERT OR UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION private.guard_appointment_overlap();
CREATE TRIGGER appointments_touch BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();
CREATE TRIGGER challenges_touch BEFORE UPDATE ON challenges FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();
CREATE TRIGGER clinic_resources_guard BEFORE UPDATE ON clinic_resources FOR EACH ROW EXECUTE FUNCTION private.guard_platform_record();
CREATE TRIGGER clinic_resources_history AFTER UPDATE ON clinic_resources FOR EACH ROW EXECUTE FUNCTION private.archive_platform_history();
CREATE TRIGGER clinics_touch BEFORE UPDATE ON clinics FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();
CREATE TRIGGER community_interactions_guard BEFORE INSERT OR UPDATE ON community_interactions FOR EACH ROW EXECUTE FUNCTION private.guard_community_interaction();
CREATE TRIGGER community_posts_guard BEFORE INSERT OR UPDATE ON community_posts FOR EACH ROW EXECUTE FUNCTION private.guard_community_post();
CREATE TRIGGER daily_logs_identity BEFORE UPDATE ON daily_logs FOR EACH ROW EXECUTE FUNCTION private.guard_daily_log_identity();
CREATE TRIGGER daily_logs_touch BEFORE UPDATE ON daily_logs FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();
CREATE TRIGGER financial_entries_guard BEFORE UPDATE ON financial_entries FOR EACH ROW EXECUTE FUNCTION private.guard_platform_record();
CREATE TRIGGER financial_entries_history AFTER UPDATE ON financial_entries FOR EACH ROW EXECUTE FUNCTION private.archive_platform_history();
CREATE TRIGGER patient_care_validation BEFORE INSERT OR UPDATE ON patient_records FOR EACH ROW EXECUTE FUNCTION private.validate_care_record();
CREATE TRIGGER patient_records_appointment_guard BEFORE INSERT OR UPDATE ON patient_records FOR EACH ROW EXECUTE FUNCTION private.guard_appointment_request();
CREATE TRIGGER patient_records_guard BEFORE UPDATE ON patient_records FOR EACH ROW EXECUTE FUNCTION private.guard_platform_record();
CREATE TRIGGER patient_records_history AFTER UPDATE ON patient_records FOR EACH ROW EXECUTE FUNCTION private.archive_platform_history();
CREATE TRIGGER patients_touch BEFORE UPDATE ON patients FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();
CREATE TRIGGER plans_history BEFORE UPDATE ON plans FOR EACH ROW EXECUTE FUNCTION private.archive_published_plan();
CREATE TRIGGER plans_nutrient_validation BEFORE INSERT OR UPDATE OF data ON plans FOR EACH ROW EXECUTE FUNCTION private.validate_published_nutrients();
CREATE TRIGGER plans_version BEFORE UPDATE ON plans FOR EACH ROW EXECUTE FUNCTION private.version_plan();
CREATE TRIGGER platform_history_immutable BEFORE DELETE OR UPDATE ON private.platform_history FOR EACH ROW EXECUTE FUNCTION private.guard_platform_history();
CREATE POLICY "appointments_delete" ON "public"."appointments" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((clinician_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "appointments_insert" ON "public"."appointments" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((clinician_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "appointments_read" ON "public"."appointments" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((clinician_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM patients p
  WHERE ((p.id = appointments.patient_id) AND (p.user_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "appointments_update" ON "public"."appointments" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((clinician_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((clinician_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "care_import_batches_deny" ON "private"."care_import_batches" AS RESTRICTIVE FOR ALL TO "public" USING (false) WITH CHECK (false);
CREATE POLICY "challenges_delete" ON "public"."challenges" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((owner_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "challenges_insert" ON "public"."challenges" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((owner_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "challenges_read" ON "public"."challenges" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((owner_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM patients p
  WHERE ((p.clinic_id = challenges.clinic_id) AND (p.user_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "challenges_update" ON "public"."challenges" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((owner_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((owner_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "client_operations_deny_direct" ON "private"."client_operations" AS PERMISSIVE FOR ALL TO "authenticated" USING (false) WITH CHECK (false);
CREATE POLICY "clinic_resources_insert" ON "public"."clinic_resources" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((owner_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "clinic_resources_read" ON "public"."clinic_resources" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((owner_id = ( SELECT auth.uid() AS uid)) OR (shared AND (EXISTS ( SELECT 1
   FROM patients p
  WHERE ((p.clinic_id = clinic_resources.clinic_id) AND (p.user_id = ( SELECT auth.uid() AS uid))))))));
CREATE POLICY "clinic_resources_update" ON "public"."clinic_resources" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((owner_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((owner_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "clinics_insert" ON "public"."clinics" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((owner_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "clinics_read" ON "public"."clinics" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((owner_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM patients p
  WHERE ((p.clinic_id = clinics.id) AND (p.user_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "clinics_update" ON "public"."clinics" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((owner_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((owner_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "community_interactions_delete" ON "public"."community_interactions" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((author_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM (community_posts cp
     JOIN clinics c ON ((c.id = cp.clinic_id)))
  WHERE ((cp.id = community_interactions.post_id) AND (c.owner_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "community_interactions_insert" ON "public"."community_interactions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((author_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM community_posts cp
  WHERE ((cp.id = community_interactions.post_id) AND (cp.status = 'active'::text) AND ((EXISTS ( SELECT 1
           FROM clinics c
          WHERE ((c.id = cp.clinic_id) AND (c.owner_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
           FROM patients p
          WHERE ((p.clinic_id = cp.clinic_id) AND (p.user_id = ( SELECT auth.uid() AS uid)))))))))));
CREATE POLICY "community_interactions_read" ON "public"."community_interactions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM community_posts cp
  WHERE ((cp.id = community_interactions.post_id) AND ((cp.status = 'active'::text) OR (cp.author_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
           FROM clinics c
          WHERE ((c.id = cp.clinic_id) AND (c.owner_id = ( SELECT auth.uid() AS uid))))))))));
CREATE POLICY "community_interactions_update" ON "public"."community_interactions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((author_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM community_posts cp
  WHERE ((cp.id = community_interactions.post_id) AND (cp.status = 'active'::text)))))) WITH CHECK (((author_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM community_posts cp
  WHERE ((cp.id = community_interactions.post_id) AND (cp.status = 'active'::text))))));
CREATE POLICY "community_posts_insert" ON "public"."community_posts" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((author_id = ( SELECT auth.uid() AS uid)) AND (status = 'active'::text) AND ((EXISTS ( SELECT 1
   FROM clinics c
  WHERE ((c.id = community_posts.clinic_id) AND (c.owner_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM patients p
  WHERE ((p.clinic_id = community_posts.clinic_id) AND (p.user_id = ( SELECT auth.uid() AS uid))))))));
CREATE POLICY "community_posts_read" ON "public"."community_posts" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM clinics c
  WHERE ((c.id = community_posts.clinic_id) AND (c.owner_id = ( SELECT auth.uid() AS uid))))) OR (((status = 'active'::text) OR (author_id = ( SELECT auth.uid() AS uid))) AND (EXISTS ( SELECT 1
   FROM patients p
  WHERE ((p.clinic_id = community_posts.clinic_id) AND (p.user_id = ( SELECT auth.uid() AS uid))))))));
CREATE POLICY "community_posts_update" ON "public"."community_posts" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((author_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM clinics c
  WHERE ((c.id = community_posts.clinic_id) AND (c.owner_id = ( SELECT auth.uid() AS uid))))))) WITH CHECK (((author_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM clinics c
  WHERE ((c.id = community_posts.clinic_id) AND (c.owner_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "daily_logs_insert" ON "public"."daily_logs" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM patients p
  WHERE ((p.id = daily_logs.patient_id) AND (p.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "daily_logs_read" ON "public"."daily_logs" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM patients p
  WHERE ((p.id = daily_logs.patient_id) AND ((p.clinician_id = ( SELECT auth.uid() AS uid)) OR (p.user_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "daily_logs_update" ON "public"."daily_logs" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM patients p
  WHERE ((p.id = daily_logs.patient_id) AND (p.user_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM patients p
  WHERE ((p.id = daily_logs.patient_id) AND (p.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "financial_entries_insert" ON "public"."financial_entries" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((owner_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "financial_entries_read" ON "public"."financial_entries" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((owner_id = ( SELECT auth.uid() AS uid)) OR ((kind = 'income'::text) AND (EXISTS ( SELECT 1
   FROM patients p
  WHERE ((p.id = financial_entries.patient_id) AND (p.user_id = ( SELECT auth.uid() AS uid))))))));
CREATE POLICY "financial_entries_update" ON "public"."financial_entries" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((owner_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((owner_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "messages_insert" ON "public"."messages" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((sender_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM patients p
  WHERE ((p.id = messages.patient_id) AND ((p.clinician_id = ( SELECT auth.uid() AS uid)) OR (p.user_id = ( SELECT auth.uid() AS uid))))))));
CREATE POLICY "messages_read" ON "public"."messages" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM patients p
  WHERE ((p.id = messages.patient_id) AND ((p.clinician_id = ( SELECT auth.uid() AS uid)) OR (p.user_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "patient_care_insert" ON "public"."patient_records" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((kind = ANY (ARRAY['quick_checkin'::text, 'care_preferences'::text, 'training_context'::text])) AND (visibility = 'patient'::text) AND (created_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM patients p
  WHERE ((p.id = patient_records.patient_id) AND (p.user_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "patient_care_update" ON "public"."patient_records" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((kind = ANY (ARRAY['quick_checkin'::text, 'care_preferences'::text, 'training_context'::text])) AND (visibility = 'patient'::text) AND (created_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM patients p
  WHERE ((p.id = patient_records.patient_id) AND (p.user_id = ( SELECT auth.uid() AS uid))))))) WITH CHECK (((kind = ANY (ARRAY['quick_checkin'::text, 'care_preferences'::text, 'training_context'::text])) AND (visibility = 'patient'::text) AND (created_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM patients p
  WHERE ((p.id = patient_records.patient_id) AND (p.user_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "patient_records_insert" ON "public"."patient_records" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((created_by = ( SELECT auth.uid() AS uid)) AND (kind <> ALL (ARRAY['form_response'::text, 'document_ack'::text, 'plan_version'::text, 'food_journal'::text])) AND ((clinician_id = ( SELECT auth.uid() AS uid)) OR ((visibility = 'patient'::text) AND (kind = ANY (ARRAY['profile_photo'::text, 'progress_photo'::text, 'appointment_request'::text, 'goal_update'::text])) AND (EXISTS ( SELECT 1
   FROM patients p
  WHERE ((p.id = patient_records.patient_id) AND (p.user_id = ( SELECT auth.uid() AS uid)))))))));
CREATE POLICY "patient_records_read" ON "public"."patient_records" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((clinician_id = ( SELECT auth.uid() AS uid)) OR ((visibility = 'patient'::text) AND (EXISTS ( SELECT 1
   FROM patients p
  WHERE ((p.id = patient_records.patient_id) AND (p.user_id = ( SELECT auth.uid() AS uid))))))));
CREATE POLICY "patient_records_update" ON "public"."patient_records" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((kind <> ALL (ARRAY['form_response'::text, 'document_ack'::text, 'plan_version'::text, 'food_journal'::text])) AND ((clinician_id = ( SELECT auth.uid() AS uid)) OR ((created_by = ( SELECT auth.uid() AS uid)) AND (visibility = 'patient'::text) AND (kind = ANY (ARRAY['profile_photo'::text, 'progress_photo'::text, 'appointment_request'::text, 'goal_update'::text])) AND (EXISTS ( SELECT 1
   FROM patients p
  WHERE ((p.id = patient_records.patient_id) AND (p.user_id = ( SELECT auth.uid() AS uid))))))))) WITH CHECK (((kind <> ALL (ARRAY['form_response'::text, 'document_ack'::text, 'plan_version'::text, 'food_journal'::text])) AND ((clinician_id = ( SELECT auth.uid() AS uid)) OR ((created_by = ( SELECT auth.uid() AS uid)) AND (visibility = 'patient'::text) AND (kind = ANY (ARRAY['profile_photo'::text, 'progress_photo'::text, 'appointment_request'::text, 'goal_update'::text])) AND (EXISTS ( SELECT 1
   FROM patients p
  WHERE ((p.id = patient_records.patient_id) AND (p.user_id = ( SELECT auth.uid() AS uid)))))))));
CREATE POLICY "patients_insert" ON "public"."patients" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((clinician_id = ( SELECT auth.uid() AS uid)) AND (user_id IS NULL) AND (EXISTS ( SELECT 1
   FROM clinics c
  WHERE ((c.id = patients.clinic_id) AND (c.owner_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "patients_read" ON "public"."patients" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((clinician_id = ( SELECT auth.uid() AS uid)) OR (user_id = ( SELECT auth.uid() AS uid))));
CREATE POLICY "patients_update" ON "public"."patients" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((clinician_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((clinician_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "plans_insert_draft" ON "public"."plans" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((clinician_id = ( SELECT auth.uid() AS uid)) AND (status = 'draft'::text)));
CREATE POLICY "plans_read" ON "public"."plans" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((clinician_id = ( SELECT auth.uid() AS uid)) OR ((status = 'published'::text) AND (EXISTS ( SELECT 1
   FROM patients p
  WHERE ((p.id = plans.patient_id) AND (p.user_id = ( SELECT auth.uid() AS uid))))))));
CREATE POLICY "plans_update_draft" ON "public"."plans" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((clinician_id = ( SELECT auth.uid() AS uid)) AND (status = 'draft'::text))) WITH CHECK (((clinician_id = ( SELECT auth.uid() AS uid)) AND (status = 'draft'::text)));
CREATE POLICY "platform_history_deny" ON "private"."platform_history" AS RESTRICTIVE FOR ALL TO "public" USING (false) WITH CHECK (false);
ALTER TABLE "private"."care_import_batches" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "private"."care_import_batches" FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE "private"."client_operations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "private"."client_operations" FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE "private"."platform_history" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "private"."platform_history" FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE "public"."appointments" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."appointments" FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE "public"."challenges" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."challenges" FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE "public"."clinic_resources" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."clinic_resources" FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE "public"."clinics" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."clinics" FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE "public"."community_interactions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."community_interactions" FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE "public"."community_posts" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."community_posts" FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE "public"."daily_logs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."daily_logs" FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE "public"."financial_entries" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."financial_entries" FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."messages" FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE "public"."patient_records" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."patient_records" FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE "public"."patients" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."patients" FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE "public"."plans" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."plans" FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE ON "public"."appointments" TO "authenticated";
GRANT SELECT ON "public"."appointments" TO "authenticated";
GRANT DELETE ON "public"."appointments" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON "public"."appointments" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON "public"."appointments" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON "public"."appointments" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON "public"."appointments" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON "public"."appointments" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON "public"."appointments" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON "public"."appointments" TO "service_role";
GRANT INSERT ON "public"."appointments" TO "service_role";
GRANT REFERENCES ON "public"."appointments" TO "service_role";
GRANT SELECT ON "public"."appointments" TO "service_role";
GRANT TRIGGER ON "public"."appointments" TO "service_role";
GRANT TRUNCATE ON "public"."appointments" TO "service_role";
GRANT UPDATE ON "public"."appointments" TO "service_role";
GRANT DELETE ON "private"."care_import_batches" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON "private"."care_import_batches" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON "private"."care_import_batches" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON "private"."care_import_batches" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON "private"."care_import_batches" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON "private"."care_import_batches" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON "private"."care_import_batches" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON "public"."challenges" TO "authenticated";
GRANT SELECT ON "public"."challenges" TO "authenticated";
GRANT DELETE ON "public"."challenges" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON "public"."challenges" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON "public"."challenges" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON "public"."challenges" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON "public"."challenges" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON "public"."challenges" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON "public"."challenges" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON "public"."challenges" TO "service_role";
GRANT INSERT ON "public"."challenges" TO "service_role";
GRANT REFERENCES ON "public"."challenges" TO "service_role";
GRANT SELECT ON "public"."challenges" TO "service_role";
GRANT TRIGGER ON "public"."challenges" TO "service_role";
GRANT TRUNCATE ON "public"."challenges" TO "service_role";
GRANT UPDATE ON "public"."challenges" TO "service_role";
GRANT DELETE ON "private"."client_operations" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON "private"."client_operations" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON "private"."client_operations" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON "private"."client_operations" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON "private"."client_operations" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON "private"."client_operations" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON "private"."client_operations" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON "public"."clinic_resources" TO "authenticated";
GRANT DELETE ON "public"."clinic_resources" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON "public"."clinic_resources" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON "public"."clinic_resources" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON "public"."clinic_resources" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON "public"."clinic_resources" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON "public"."clinic_resources" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON "public"."clinic_resources" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON "public"."clinic_resources" TO "service_role";
GRANT INSERT ON "public"."clinic_resources" TO "service_role";
GRANT REFERENCES ON "public"."clinic_resources" TO "service_role";
GRANT SELECT ON "public"."clinic_resources" TO "service_role";
GRANT TRIGGER ON "public"."clinic_resources" TO "service_role";
GRANT TRUNCATE ON "public"."clinic_resources" TO "service_role";
GRANT UPDATE ON "public"."clinic_resources" TO "service_role";
GRANT SELECT ON "public"."clinics" TO "authenticated";
GRANT DELETE ON "public"."clinics" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON "public"."clinics" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON "public"."clinics" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON "public"."clinics" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON "public"."clinics" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON "public"."clinics" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON "public"."clinics" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON "public"."clinics" TO "service_role";
GRANT INSERT ON "public"."clinics" TO "service_role";
GRANT REFERENCES ON "public"."clinics" TO "service_role";
GRANT SELECT ON "public"."clinics" TO "service_role";
GRANT TRIGGER ON "public"."clinics" TO "service_role";
GRANT TRUNCATE ON "public"."clinics" TO "service_role";
GRANT UPDATE ON "public"."clinics" TO "service_role";
GRANT DELETE ON "public"."community_interactions" TO "authenticated";
GRANT SELECT ON "public"."community_interactions" TO "authenticated";
GRANT DELETE ON "public"."community_interactions" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON "public"."community_interactions" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON "public"."community_interactions" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON "public"."community_interactions" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON "public"."community_interactions" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON "public"."community_interactions" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON "public"."community_interactions" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON "public"."community_interactions" TO "service_role";
GRANT INSERT ON "public"."community_interactions" TO "service_role";
GRANT REFERENCES ON "public"."community_interactions" TO "service_role";
GRANT SELECT ON "public"."community_interactions" TO "service_role";
GRANT TRIGGER ON "public"."community_interactions" TO "service_role";
GRANT TRUNCATE ON "public"."community_interactions" TO "service_role";
GRANT UPDATE ON "public"."community_interactions" TO "service_role";
GRANT SELECT ON "public"."community_posts" TO "authenticated";
GRANT DELETE ON "public"."community_posts" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON "public"."community_posts" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON "public"."community_posts" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON "public"."community_posts" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON "public"."community_posts" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON "public"."community_posts" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON "public"."community_posts" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON "public"."community_posts" TO "service_role";
GRANT INSERT ON "public"."community_posts" TO "service_role";
GRANT REFERENCES ON "public"."community_posts" TO "service_role";
GRANT SELECT ON "public"."community_posts" TO "service_role";
GRANT TRIGGER ON "public"."community_posts" TO "service_role";
GRANT TRUNCATE ON "public"."community_posts" TO "service_role";
GRANT UPDATE ON "public"."community_posts" TO "service_role";
GRANT SELECT ON "public"."daily_logs" TO "authenticated";
GRANT DELETE ON "public"."daily_logs" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON "public"."daily_logs" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON "public"."daily_logs" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON "public"."daily_logs" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON "public"."daily_logs" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON "public"."daily_logs" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON "public"."daily_logs" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON "public"."daily_logs" TO "service_role";
GRANT INSERT ON "public"."daily_logs" TO "service_role";
GRANT REFERENCES ON "public"."daily_logs" TO "service_role";
GRANT SELECT ON "public"."daily_logs" TO "service_role";
GRANT TRIGGER ON "public"."daily_logs" TO "service_role";
GRANT TRUNCATE ON "public"."daily_logs" TO "service_role";
GRANT UPDATE ON "public"."daily_logs" TO "service_role";
GRANT SELECT ON "public"."financial_entries" TO "authenticated";
GRANT DELETE ON "public"."financial_entries" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON "public"."financial_entries" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON "public"."financial_entries" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON "public"."financial_entries" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON "public"."financial_entries" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON "public"."financial_entries" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON "public"."financial_entries" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON "public"."financial_entries" TO "service_role";
GRANT INSERT ON "public"."financial_entries" TO "service_role";
GRANT REFERENCES ON "public"."financial_entries" TO "service_role";
GRANT SELECT ON "public"."financial_entries" TO "service_role";
GRANT TRIGGER ON "public"."financial_entries" TO "service_role";
GRANT TRUNCATE ON "public"."financial_entries" TO "service_role";
GRANT UPDATE ON "public"."financial_entries" TO "service_role";
GRANT SELECT ON "public"."messages" TO "authenticated";
GRANT DELETE ON "public"."messages" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON "public"."messages" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON "public"."messages" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON "public"."messages" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON "public"."messages" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON "public"."messages" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON "public"."messages" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON "public"."messages" TO "service_role";
GRANT INSERT ON "public"."messages" TO "service_role";
GRANT REFERENCES ON "public"."messages" TO "service_role";
GRANT SELECT ON "public"."messages" TO "service_role";
GRANT TRIGGER ON "public"."messages" TO "service_role";
GRANT TRUNCATE ON "public"."messages" TO "service_role";
GRANT UPDATE ON "public"."messages" TO "service_role";
GRANT SELECT ON "public"."patient_records" TO "authenticated";
GRANT DELETE ON "public"."patient_records" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON "public"."patient_records" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON "public"."patient_records" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON "public"."patient_records" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON "public"."patient_records" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON "public"."patient_records" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON "public"."patient_records" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON "public"."patient_records" TO "service_role";
GRANT INSERT ON "public"."patient_records" TO "service_role";
GRANT REFERENCES ON "public"."patient_records" TO "service_role";
GRANT SELECT ON "public"."patient_records" TO "service_role";
GRANT TRIGGER ON "public"."patient_records" TO "service_role";
GRANT TRUNCATE ON "public"."patient_records" TO "service_role";
GRANT UPDATE ON "public"."patient_records" TO "service_role";
GRANT DELETE ON "public"."patients" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON "public"."patients" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON "public"."patients" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON "public"."patients" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON "public"."patients" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON "public"."patients" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON "public"."patients" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON "public"."patients" TO "service_role";
GRANT INSERT ON "public"."patients" TO "service_role";
GRANT REFERENCES ON "public"."patients" TO "service_role";
GRANT SELECT ON "public"."patients" TO "service_role";
GRANT TRIGGER ON "public"."patients" TO "service_role";
GRANT TRUNCATE ON "public"."patients" TO "service_role";
GRANT UPDATE ON "public"."patients" TO "service_role";
GRANT SELECT ON "public"."plans" TO "authenticated";
GRANT DELETE ON "public"."plans" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON "public"."plans" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON "public"."plans" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON "public"."plans" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON "public"."plans" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON "public"."plans" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON "public"."plans" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON "public"."plans" TO "service_role";
GRANT INSERT ON "public"."plans" TO "service_role";
GRANT REFERENCES ON "public"."plans" TO "service_role";
GRANT SELECT ON "public"."plans" TO "service_role";
GRANT TRIGGER ON "public"."plans" TO "service_role";
GRANT TRUNCATE ON "public"."plans" TO "service_role";
GRANT UPDATE ON "public"."plans" TO "service_role";
GRANT DELETE ON "private"."platform_history" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON "private"."platform_history" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON "private"."platform_history" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON "private"."platform_history" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON "private"."platform_history" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON "private"."platform_history" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON "private"."platform_history" TO "postgres" WITH GRANT OPTION;
GRANT INSERT("clinician_id") ON "public"."appointments" TO "authenticated";
GRANT INSERT("duration_minutes") ON "public"."appointments" TO "authenticated";
GRANT UPDATE("duration_minutes") ON "public"."appointments" TO "authenticated";
GRANT INSERT("note") ON "public"."appointments" TO "authenticated";
GRANT UPDATE("note") ON "public"."appointments" TO "authenticated";
GRANT INSERT("patient_id") ON "public"."appointments" TO "authenticated";
GRANT INSERT("start_at") ON "public"."appointments" TO "authenticated";
GRANT UPDATE("start_at") ON "public"."appointments" TO "authenticated";
GRANT INSERT("status") ON "public"."appointments" TO "authenticated";
GRANT UPDATE("status") ON "public"."appointments" TO "authenticated";
GRANT INSERT("clinic_id") ON "public"."challenges" TO "authenticated";
GRANT INSERT("metric") ON "public"."challenges" TO "authenticated";
GRANT UPDATE("metric") ON "public"."challenges" TO "authenticated";
GRANT INSERT("owner_id") ON "public"."challenges" TO "authenticated";
GRANT INSERT("target") ON "public"."challenges" TO "authenticated";
GRANT UPDATE("target") ON "public"."challenges" TO "authenticated";
GRANT INSERT("title") ON "public"."challenges" TO "authenticated";
GRANT UPDATE("title") ON "public"."challenges" TO "authenticated";
GRANT INSERT("clinic_id") ON "public"."clinic_resources" TO "authenticated";
GRANT INSERT("data") ON "public"."clinic_resources" TO "authenticated";
GRANT UPDATE("data") ON "public"."clinic_resources" TO "authenticated";
GRANT INSERT("kind") ON "public"."clinic_resources" TO "authenticated";
GRANT INSERT("owner_id") ON "public"."clinic_resources" TO "authenticated";
GRANT INSERT("shared") ON "public"."clinic_resources" TO "authenticated";
GRANT UPDATE("shared") ON "public"."clinic_resources" TO "authenticated";
GRANT INSERT("title") ON "public"."clinic_resources" TO "authenticated";
GRANT UPDATE("title") ON "public"."clinic_resources" TO "authenticated";
GRANT INSERT("color") ON "public"."clinics" TO "authenticated";
GRANT UPDATE("color") ON "public"."clinics" TO "authenticated";
GRANT INSERT("crn") ON "public"."clinics" TO "authenticated";
GRANT UPDATE("crn") ON "public"."clinics" TO "authenticated";
GRANT INSERT("logo") ON "public"."clinics" TO "authenticated";
GRANT UPDATE("logo") ON "public"."clinics" TO "authenticated";
GRANT INSERT("name") ON "public"."clinics" TO "authenticated";
GRANT UPDATE("name") ON "public"."clinics" TO "authenticated";
GRANT INSERT("owner_id") ON "public"."clinics" TO "authenticated";
GRANT INSERT("professional_name") ON "public"."clinics" TO "authenticated";
GRANT UPDATE("professional_name") ON "public"."clinics" TO "authenticated";
GRANT INSERT("weekly_goal") ON "public"."clinics" TO "authenticated";
GRANT UPDATE("weekly_goal") ON "public"."clinics" TO "authenticated";
GRANT INSERT("author_id") ON "public"."community_interactions" TO "authenticated";
GRANT INSERT("body") ON "public"."community_interactions" TO "authenticated";
GRANT UPDATE("body") ON "public"."community_interactions" TO "authenticated";
GRANT INSERT("kind") ON "public"."community_interactions" TO "authenticated";
GRANT INSERT("post_id") ON "public"."community_interactions" TO "authenticated";
GRANT INSERT("author_id") ON "public"."community_posts" TO "authenticated";
GRANT INSERT("body") ON "public"."community_posts" TO "authenticated";
GRANT UPDATE("body") ON "public"."community_posts" TO "authenticated";
GRANT INSERT("clinic_id") ON "public"."community_posts" TO "authenticated";
GRANT INSERT("image") ON "public"."community_posts" TO "authenticated";
GRANT UPDATE("image") ON "public"."community_posts" TO "authenticated";
GRANT UPDATE("status") ON "public"."community_posts" TO "authenticated";
GRANT INSERT("day") ON "public"."daily_logs" TO "authenticated";
GRANT UPDATE("day") ON "public"."daily_logs" TO "authenticated";
GRANT INSERT("followed") ON "public"."daily_logs" TO "authenticated";
GRANT UPDATE("followed") ON "public"."daily_logs" TO "authenticated";
GRANT INSERT("meals") ON "public"."daily_logs" TO "authenticated";
GRANT UPDATE("meals") ON "public"."daily_logs" TO "authenticated";
GRANT INSERT("mood") ON "public"."daily_logs" TO "authenticated";
GRANT UPDATE("mood") ON "public"."daily_logs" TO "authenticated";
GRANT INSERT("note") ON "public"."daily_logs" TO "authenticated";
GRANT UPDATE("note") ON "public"."daily_logs" TO "authenticated";
GRANT INSERT("patient_id") ON "public"."daily_logs" TO "authenticated";
GRANT UPDATE("patient_id") ON "public"."daily_logs" TO "authenticated";
GRANT INSERT("sleep") ON "public"."daily_logs" TO "authenticated";
GRANT UPDATE("sleep") ON "public"."daily_logs" TO "authenticated";
GRANT INSERT("water_ml") ON "public"."daily_logs" TO "authenticated";
GRANT UPDATE("water_ml") ON "public"."daily_logs" TO "authenticated";
GRANT INSERT("weight") ON "public"."daily_logs" TO "authenticated";
GRANT UPDATE("weight") ON "public"."daily_logs" TO "authenticated";
GRANT INSERT("amount_cents") ON "public"."financial_entries" TO "authenticated";
GRANT UPDATE("amount_cents") ON "public"."financial_entries" TO "authenticated";
GRANT INSERT("clinic_id") ON "public"."financial_entries" TO "authenticated";
GRANT INSERT("due_on") ON "public"."financial_entries" TO "authenticated";
GRANT UPDATE("due_on") ON "public"."financial_entries" TO "authenticated";
GRANT INSERT("kind") ON "public"."financial_entries" TO "authenticated";
GRANT INSERT("method") ON "public"."financial_entries" TO "authenticated";
GRANT UPDATE("method") ON "public"."financial_entries" TO "authenticated";
GRANT INSERT("note") ON "public"."financial_entries" TO "authenticated";
GRANT UPDATE("note") ON "public"."financial_entries" TO "authenticated";
GRANT INSERT("owner_id") ON "public"."financial_entries" TO "authenticated";
GRANT INSERT("paid_on") ON "public"."financial_entries" TO "authenticated";
GRANT UPDATE("paid_on") ON "public"."financial_entries" TO "authenticated";
GRANT INSERT("patient_id") ON "public"."financial_entries" TO "authenticated";
GRANT INSERT("status") ON "public"."financial_entries" TO "authenticated";
GRANT UPDATE("status") ON "public"."financial_entries" TO "authenticated";
GRANT INSERT("title") ON "public"."financial_entries" TO "authenticated";
GRANT UPDATE("title") ON "public"."financial_entries" TO "authenticated";
GRANT INSERT("body") ON "public"."messages" TO "authenticated";
GRANT INSERT("patient_id") ON "public"."messages" TO "authenticated";
GRANT INSERT("sender_id") ON "public"."messages" TO "authenticated";
GRANT INSERT("clinician_id") ON "public"."patient_records" TO "authenticated";
GRANT INSERT("created_by") ON "public"."patient_records" TO "authenticated";
GRANT INSERT("data") ON "public"."patient_records" TO "authenticated";
GRANT UPDATE("data") ON "public"."patient_records" TO "authenticated";
GRANT INSERT("kind") ON "public"."patient_records" TO "authenticated";
GRANT INSERT("patient_id") ON "public"."patient_records" TO "authenticated";
GRANT INSERT("title") ON "public"."patient_records" TO "authenticated";
GRANT UPDATE("title") ON "public"."patient_records" TO "authenticated";
GRANT INSERT("visibility") ON "public"."patient_records" TO "authenticated";
GRANT UPDATE("visibility") ON "public"."patient_records" TO "authenticated";
GRANT INSERT("clinic_id") ON "public"."patients" TO "authenticated";
GRANT SELECT("clinic_id") ON "public"."patients" TO "authenticated";
GRANT INSERT("clinician_id") ON "public"."patients" TO "authenticated";
GRANT SELECT("clinician_id") ON "public"."patients" TO "authenticated";
GRANT SELECT("created_at") ON "public"."patients" TO "authenticated";
GRANT INSERT("email") ON "public"."patients" TO "authenticated";
GRANT SELECT("email") ON "public"."patients" TO "authenticated";
GRANT UPDATE("email") ON "public"."patients" TO "authenticated";
GRANT INSERT("goal") ON "public"."patients" TO "authenticated";
GRANT SELECT("goal") ON "public"."patients" TO "authenticated";
GRANT UPDATE("goal") ON "public"."patients" TO "authenticated";
GRANT SELECT("id") ON "public"."patients" TO "authenticated";
GRANT INSERT("name") ON "public"."patients" TO "authenticated";
GRANT SELECT("name") ON "public"."patients" TO "authenticated";
GRANT UPDATE("name") ON "public"."patients" TO "authenticated";
GRANT INSERT("notes") ON "public"."patients" TO "authenticated";
GRANT UPDATE("notes") ON "public"."patients" TO "authenticated";
GRANT INSERT("restrictions") ON "public"."patients" TO "authenticated";
GRANT SELECT("restrictions") ON "public"."patients" TO "authenticated";
GRANT UPDATE("restrictions") ON "public"."patients" TO "authenticated";
GRANT SELECT("updated_at") ON "public"."patients" TO "authenticated";
GRANT SELECT("user_id") ON "public"."patients" TO "authenticated";
GRANT INSERT("clinician_id") ON "public"."plans" TO "authenticated";
GRANT INSERT("data") ON "public"."plans" TO "authenticated";
GRANT UPDATE("data") ON "public"."plans" TO "authenticated";
GRANT INSERT("patient_id") ON "public"."plans" TO "authenticated";
GRANT INSERT("status") ON "public"."plans" TO "authenticated";
REVOKE ALL ON FUNCTION "private"."acknowledge_document"(p_record_id uuid, p_expected_version integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."acknowledge_document"(p_record_id uuid, p_expected_version integer) TO "postgres";
GRANT EXECUTE ON FUNCTION "private"."acknowledge_document"(p_record_id uuid, p_expected_version integer) TO "authenticated";
REVOKE ALL ON FUNCTION "public"."acknowledge_document"(p_record_id uuid, p_expected_version integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."acknowledge_document"(p_record_id uuid, p_expected_version integer) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."acknowledge_document"(p_record_id uuid, p_expected_version integer) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."acknowledge_document"(p_record_id uuid, p_expected_version integer) TO "authenticated";
REVOKE ALL ON FUNCTION "private"."archive_platform_history"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."archive_platform_history"() TO "postgres";
REVOKE ALL ON FUNCTION "private"."archive_published_plan"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."archive_published_plan"() TO "postgres";
REVOKE ALL ON FUNCTION "private"."care_plan_ready"(p_data jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."care_plan_ready"(p_data jsonb) TO "postgres";
GRANT EXECUTE ON FUNCTION "private"."care_plan_ready"(p_data jsonb) TO "authenticated";
REVOKE ALL ON FUNCTION "public"."clinician_patient_details"(p_patient_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."clinician_patient_details"(p_patient_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."clinician_patient_details"(p_patient_id uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."clinician_patient_details"(p_patient_id uuid) TO "authenticated";
REVOKE ALL ON FUNCTION "private"."clinician_patient_details"(p_patient_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."clinician_patient_details"(p_patient_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION "private"."clinician_patient_details"(p_patient_id uuid) TO "authenticated";
REVOKE ALL ON FUNCTION "private"."community_display_name"(p_clinic_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."community_display_name"(p_clinic_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION "private"."community_display_name"(p_clinic_id uuid) TO "authenticated";
REVOKE ALL ON FUNCTION "private"."guard_appointment_overlap"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."guard_appointment_overlap"() TO "postgres";
REVOKE ALL ON FUNCTION "private"."guard_appointment_request"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."guard_appointment_request"() TO "postgres";
REVOKE ALL ON FUNCTION "private"."guard_community_interaction"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."guard_community_interaction"() TO "postgres";
REVOKE ALL ON FUNCTION "private"."guard_community_post"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."guard_community_post"() TO "postgres";
REVOKE ALL ON FUNCTION "private"."guard_daily_log_identity"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."guard_daily_log_identity"() TO "postgres";
REVOKE ALL ON FUNCTION "private"."guard_platform_history"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."guard_platform_history"() TO "postgres";
REVOKE ALL ON FUNCTION "private"."guard_platform_record"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."guard_platform_record"() TO "postgres";
REVOKE ALL ON FUNCTION "public"."import_care_bundle"(p_operation_id uuid, p_source_hash text, p_bundle jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."import_care_bundle"(p_operation_id uuid, p_source_hash text, p_bundle jsonb) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."import_care_bundle"(p_operation_id uuid, p_source_hash text, p_bundle jsonb) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."import_care_bundle"(p_operation_id uuid, p_source_hash text, p_bundle jsonb) TO "service_role";
REVOKE ALL ON FUNCTION "private"."import_care_bundle"(p_operation_id uuid, p_source_hash text, p_bundle jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."import_care_bundle"(p_operation_id uuid, p_source_hash text, p_bundle jsonb) TO "postgres";
GRANT EXECUTE ON FUNCTION "private"."import_care_bundle"(p_operation_id uuid, p_source_hash text, p_bundle jsonb) TO "authenticated";
REVOKE ALL ON FUNCTION "private"."meal_ids_valid"(p_meals jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."meal_ids_valid"(p_meals jsonb) TO "postgres";
GRANT EXECUTE ON FUNCTION "private"."meal_ids_valid"(p_meals jsonb) TO "authenticated";
REVOKE ALL ON FUNCTION "private"."nutrition_plan_complete"(p_data jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."nutrition_plan_complete"(p_data jsonb) TO "postgres";
GRANT EXECUTE ON FUNCTION "private"."nutrition_plan_complete"(p_data jsonb) TO "authenticated";
REVOKE ALL ON FUNCTION "private"."nutrition_plan_valid"(p_data jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."nutrition_plan_valid"(p_data jsonb) TO "postgres";
GRANT EXECUTE ON FUNCTION "private"."nutrition_plan_valid"(p_data jsonb) TO "authenticated";
REVOKE ALL ON FUNCTION "private"."publish_patient_plan"(p_patient_id uuid, p_expected_version integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."publish_patient_plan"(p_patient_id uuid, p_expected_version integer) TO "postgres";
GRANT EXECUTE ON FUNCTION "private"."publish_patient_plan"(p_patient_id uuid, p_expected_version integer) TO "authenticated";
REVOKE ALL ON FUNCTION "public"."publish_patient_plan"(p_patient_id uuid, p_expected_version integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."publish_patient_plan"(p_patient_id uuid, p_expected_version integer) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."publish_patient_plan"(p_patient_id uuid, p_expected_version integer) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."publish_patient_plan"(p_patient_id uuid, p_expected_version integer) TO "authenticated";
REVOKE ALL ON FUNCTION "public"."read_record_history"(p_record_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."read_record_history"(p_record_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."read_record_history"(p_record_id uuid) TO "authenticated";
REVOKE ALL ON FUNCTION "private"."read_record_history"(p_record_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."read_record_history"(p_record_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION "private"."read_record_history"(p_record_id uuid) TO "authenticated";
REVOKE ALL ON FUNCTION "private"."record_log_once"(p_operation_id uuid, p_patient_id uuid, p_day date, p_patch jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."record_log_once"(p_operation_id uuid, p_patient_id uuid, p_day date, p_patch jsonb) TO "postgres";
GRANT EXECUTE ON FUNCTION "private"."record_log_once"(p_operation_id uuid, p_patient_id uuid, p_day date, p_patch jsonb) TO "authenticated";
REVOKE ALL ON FUNCTION "public"."record_log_once"(p_operation_id uuid, p_patient_id uuid, p_day date, p_patch jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."record_log_once"(p_operation_id uuid, p_patient_id uuid, p_day date, p_patch jsonb) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."record_log_once"(p_operation_id uuid, p_patient_id uuid, p_day date, p_patch jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."record_log_once"(p_operation_id uuid, p_patient_id uuid, p_day date, p_patch jsonb) TO "authenticated";
REVOKE ALL ON FUNCTION "public"."record_patient_log"(p_patient_id uuid, p_day date, p_patch jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."record_patient_log"(p_patient_id uuid, p_day date, p_patch jsonb) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."record_patient_log"(p_patient_id uuid, p_day date, p_patch jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."record_patient_log"(p_patient_id uuid, p_day date, p_patch jsonb) TO "authenticated";
REVOKE ALL ON FUNCTION "public"."redeem_patient_invite"(p_code text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."redeem_patient_invite"(p_code text) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."redeem_patient_invite"(p_code text) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."redeem_patient_invite"(p_code text) TO "authenticated";
REVOKE ALL ON FUNCTION "private"."redeem_patient_invite"(p_code text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."redeem_patient_invite"(p_code text) TO "postgres";
GRANT EXECUTE ON FUNCTION "private"."redeem_patient_invite"(p_code text) TO "authenticated";
REVOKE ALL ON FUNCTION "public"."respond_appointment_request"(p_record_id uuid, p_expected_version integer, p_decision text, p_start_at timestamp with time zone, p_duration_minutes integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."respond_appointment_request"(p_record_id uuid, p_expected_version integer, p_decision text, p_start_at timestamp with time zone, p_duration_minutes integer) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."respond_appointment_request"(p_record_id uuid, p_expected_version integer, p_decision text, p_start_at timestamp with time zone, p_duration_minutes integer) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."respond_appointment_request"(p_record_id uuid, p_expected_version integer, p_decision text, p_start_at timestamp with time zone, p_duration_minutes integer) TO "authenticated";
REVOKE ALL ON FUNCTION "private"."respond_appointment_request"(p_record_id uuid, p_expected_version integer, p_decision text, p_start_at timestamp with time zone, p_duration_minutes integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."respond_appointment_request"(p_record_id uuid, p_expected_version integer, p_decision text, p_start_at timestamp with time zone, p_duration_minutes integer) TO "postgres";
GRANT EXECUTE ON FUNCTION "private"."respond_appointment_request"(p_record_id uuid, p_expected_version integer, p_decision text, p_start_at timestamp with time zone, p_duration_minutes integer) TO "authenticated";
REVOKE ALL ON FUNCTION "public"."revoke_patient_access"(p_patient_id uuid, p_expected_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."revoke_patient_access"(p_patient_id uuid, p_expected_user_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."revoke_patient_access"(p_patient_id uuid, p_expected_user_id uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."revoke_patient_access"(p_patient_id uuid, p_expected_user_id uuid) TO "authenticated";
REVOKE ALL ON FUNCTION "private"."revoke_patient_access"(p_patient_id uuid, p_expected_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."revoke_patient_access"(p_patient_id uuid, p_expected_user_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION "private"."revoke_patient_access"(p_patient_id uuid, p_expected_user_id uuid) TO "authenticated";
REVOKE ALL ON FUNCTION "public"."rotate_patient_invite"(p_patient_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."rotate_patient_invite"(p_patient_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."rotate_patient_invite"(p_patient_id uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."rotate_patient_invite"(p_patient_id uuid) TO "authenticated";
REVOKE ALL ON FUNCTION "private"."rotate_patient_invite"(p_patient_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."rotate_patient_invite"(p_patient_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION "private"."rotate_patient_invite"(p_patient_id uuid) TO "authenticated";
REVOKE ALL ON FUNCTION "private"."save_food_journal"(p_operation_id uuid, p_patient_id uuid, p_record_id uuid, p_expected_version integer, p_title text, p_data jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."save_food_journal"(p_operation_id uuid, p_patient_id uuid, p_record_id uuid, p_expected_version integer, p_title text, p_data jsonb) TO "postgres";
GRANT EXECUTE ON FUNCTION "private"."save_food_journal"(p_operation_id uuid, p_patient_id uuid, p_record_id uuid, p_expected_version integer, p_title text, p_data jsonb) TO "authenticated";
REVOKE ALL ON FUNCTION "public"."save_food_journal"(p_operation_id uuid, p_patient_id uuid, p_record_id uuid, p_expected_version integer, p_title text, p_data jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."save_food_journal"(p_operation_id uuid, p_patient_id uuid, p_record_id uuid, p_expected_version integer, p_title text, p_data jsonb) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."save_food_journal"(p_operation_id uuid, p_patient_id uuid, p_record_id uuid, p_expected_version integer, p_title text, p_data jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."save_food_journal"(p_operation_id uuid, p_patient_id uuid, p_record_id uuid, p_expected_version integer, p_title text, p_data jsonb) TO "authenticated";
REVOKE ALL ON FUNCTION "private"."submit_questionnaire"(p_record_id uuid, p_expected_version integer, p_answers jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."submit_questionnaire"(p_record_id uuid, p_expected_version integer, p_answers jsonb) TO "postgres";
GRANT EXECUTE ON FUNCTION "private"."submit_questionnaire"(p_record_id uuid, p_expected_version integer, p_answers jsonb) TO "authenticated";
REVOKE ALL ON FUNCTION "public"."submit_questionnaire"(p_record_id uuid, p_expected_version integer, p_answers jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."submit_questionnaire"(p_record_id uuid, p_expected_version integer, p_answers jsonb) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."submit_questionnaire"(p_record_id uuid, p_expected_version integer, p_answers jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."submit_questionnaire"(p_record_id uuid, p_expected_version integer, p_answers jsonb) TO "authenticated";
REVOKE ALL ON FUNCTION "private"."touch_updated_at"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."touch_updated_at"() TO "postgres";
REVOKE ALL ON FUNCTION "private"."validate_care_record"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."validate_care_record"() TO "postgres";
REVOKE ALL ON FUNCTION "private"."validate_published_nutrients"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."validate_published_nutrients"() TO "postgres";
REVOKE ALL ON FUNCTION "private"."validate_questionnaire"(p_data jsonb, p_answers jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."validate_questionnaire"(p_data jsonb, p_answers jsonb) TO "postgres";
REVOKE ALL ON FUNCTION "private"."version_plan"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."version_plan"() TO "postgres";
SET check_function_bodies = true;
