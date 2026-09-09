-- mt-v806: diário alimentar integrado, privado por token e independente dos retornos de treino.
-- O token continua sendo a credencial do app. Nenhuma tabela é aberta ao aluno.
-- Dados antigos e outros módulos não são regravados pela mescla de nutrição.

create or replace function public.app_nutricao_registro_valido(r jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare it jsonb; k text; n numeric; stamp timestamptz; dia date;
begin
  if r is null or jsonb_typeof(r) <> 'object' or octet_length(r::text) > 140000 then return false; end if;
  if coalesce(r->>'id','') !~ '^[A-Za-z0-9:_-]+$' or length(r->>'id') > 300
     or r->>'id' in ('__proto__','prototype','constructor') then return false; end if;
  if coalesce(r->>'d','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     or coalesce(r->>'atualizadoEm','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' then return false; end if;
  dia := (r->>'d')::date; stamp := (r->>'atualizadoEm')::timestamptz;
  if not isfinite(dia) or not isfinite(stamp) or length(r->>'atualizadoEm') > 40 then return false; end if;
  if jsonb_typeof(r->'apagado') is distinct from 'boolean'
     or length(coalesce(r->>'titulo','')) > 120
     or length(coalesce(r->>'refeicaoId','')) > 100
     or length(coalesce(r->>'observacao','')) > 2000 then return false; end if;
  if coalesce(r->>'hora','') <> '' and (r->>'hora') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return false; end if;
  if coalesce(r->>'origem','') not in ('plano','manual','foto') then return false; end if;
  if jsonb_typeof(r->'itens') is distinct from 'array' then return false; end if;
  if jsonb_array_length(r->'itens') > 100
     or (r->>'apagado' = 'false' and jsonb_array_length(r->'itens') = 0
         and btrim(coalesce(r->>'titulo','')) = '' and coalesce(r->>'foto','') = '') then return false; end if;
  if length(coalesce(r->>'foto','')) > 60000 then return false; end if;
  if coalesce(r->>'foto','') <> '' and (r->>'foto') !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$' then return false; end if;
  for it in select value from jsonb_array_elements(r->'itens') loop
    if jsonb_typeof(it) <> 'object' or nullif(trim(it->>'nome'),'') is null
       or length(it->>'nome') > 200 or length(coalesce(it->>'porcao','')) > 100 then return false; end if;
    foreach k in array array['qtd','k','pt','cb','g'] loop
      if jsonb_typeof(it->k) is distinct from 'number' then return false; end if;
      n := (it->>k)::numeric;
      if n < 0 or n > 100000 or (k='qtd' and (n<=0 or n>1000)) then return false; end if;
    end loop;
  end loop;
  return true;
exception when invalid_datetime_format or datetime_field_overflow or invalid_text_representation or numeric_value_out_of_range then
  return false;
end $$;
revoke all on function public.app_nutricao_registro_valido(jsonb) from public, anon, authenticated;

create or replace function public.app_nutricao_mescla(velho jsonb, novos jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare registros jsonb; r jsonb; anterior jsonb;
begin
  registros := case when jsonb_typeof(velho->'registros')='object' then velho->'registros' else '{}'::jsonb end;
  for r in select value from jsonb_array_elements(novos) loop
    anterior := registros->(r->>'id');
    -- Cada registro é um snapshot indivisível. Array de alimentos nunca vira união.
    -- Empate conserva o já confirmado no servidor; nova edição deve avançar o stamp.
    if anterior is null or nullif(anterior->>'atualizadoEm','') is null
       or (r->>'atualizadoEm')::timestamptz > (anterior->>'atualizadoEm')::timestamptz then
      registros := jsonb_set(registros, array[r->>'id'], r, true);
    end if;
  end loop;
  return jsonb_build_object('v',1,'registros',registros);
end $$;
revoke all on function public.app_nutricao_mescla(jsonb,jsonb) from public, anon, authenticated;

create or replace function public.app_nutricao_estado(t text)
returns jsonb language plpgsql security definer stable set search_path = '' as $$
declare v_retorno jsonb;
begin
  if t is null or length(t)<10 or length(t)>300 then return jsonb_build_object('erro','sem_acesso'); end if;
  select retorno into v_retorno from public.app_aluno
    where token=t and revogado_em is null;
  if not found then return jsonb_build_object('erro','sem_acesso'); end if;
  return jsonb_build_object('ok',true,'nutricao',coalesce(v_retorno->'nutricaoV1',jsonb_build_object('v',1,'registros','{}'::jsonb)));
end $$;
revoke all on function public.app_nutricao_estado(text) from public;
grant execute on function public.app_nutricao_estado(text) to anon, authenticated;

create or replace function public.app_nutricao_salva(t text, p_registros jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_retorno jsonb; v_dados jsonb; v_nutri jsonb; r jsonb;
begin
  if t is null or length(t)<10 or length(t)>300 then return jsonb_build_object('erro','sem_acesso'); end if;
  if p_registros is null or jsonb_typeof(p_registros)<>'array' then
    return jsonb_build_object('erro','Registros inválidos.'); end if;
  if jsonb_array_length(p_registros)<1 or jsonb_array_length(p_registros)>20 or octet_length(p_registros::text)>500000 then
    return jsonb_build_object('erro','Envie menos registros por vez.'); end if;
  for r in select value from jsonb_array_elements(p_registros) loop
    if not public.app_nutricao_registro_valido(r) then
      return jsonb_build_object('erro','Confira os alimentos, a data e o tamanho da foto antes de salvar.'); end if;
    if (r->>'atualizadoEm')::timestamptz > now()+interval '5 minutes' then
      return jsonb_build_object('erro','Ajuste a data e a hora do aparelho e tente novamente.'); end if;
  end loop;
  -- Trava apenas a linha do token: envios concorrentes conservam registros distintos.
  select retorno,dados into v_retorno,v_dados from public.app_aluno
    where token=t and revogado_em is null for update;
  if not found then return jsonb_build_object('erro','sem_acesso'); end if;
  if coalesce(v_dados#>>'{dados,nutricaoApp,ativo}','false')<>'true' then
    return jsonb_build_object('erro','O acompanhamento alimentar ainda não está disponível neste app.'); end if;
  v_nutri := public.app_nutricao_mescla(v_retorno->'nutricaoV1',p_registros);
  if octet_length(v_nutri::text)>3000000 then
    return jsonb_build_object('erro','O diário está cheio. Remova fotos antigas para liberar espaço; os registros atuais continuam guardados.'); end if;
  if jsonb_typeof(v_retorno) is distinct from 'object' then v_retorno := '{}'::jsonb; end if;
  update public.app_aluno set retorno=jsonb_set(v_retorno,'{nutricaoV1}',v_nutri,true),atualizado=now()
    where token=t and revogado_em is null;
  return jsonb_build_object('ok',true,'nutricao',v_nutri);
end $$;
revoke all on function public.app_nutricao_salva(text,jsonb) from public;
grant execute on function public.app_nutricao_salva(text,jsonb) to anon, authenticated;
