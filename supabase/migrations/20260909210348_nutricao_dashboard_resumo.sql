-- mt-v815: indicadores do dashboard sem transportar fotos ou o diário inteiro.
-- Só profissionais autenticados da academia solicitada. Nenhuma escrita.
create or replace function public.personal_nutricao_resumo(
  p_academia uuid,p_tokens text[],p_hoje date)
returns jsonb language plpgsql security definer stable set search_path='' as $$
declare v_uid uuid; v_inicio date; v_limite date; v_alunos jsonb;
begin
  v_uid := auth.uid();
  if v_uid is null or p_academia is null or not exists(
    select 1 from public.membros where academia_id=p_academia and user_id=v_uid
  ) then return jsonb_build_object('erro','sem_acesso'); end if;
  if p_hoje is null or not isfinite(p_hoje) or p_hoje<date '0001-01-07' or p_hoje>date '9999-12-31' then
    return jsonb_build_object('erro','Data inválida.'); end if;
  if p_tokens is null or coalesce(array_ndims(p_tokens),0)<>1 or cardinality(p_tokens)<1 or cardinality(p_tokens)>100
    or exists(select 1 from unnest(p_tokens) x where x is null or length(x)<10 or length(x)>300) then
    return jsonb_build_object('erro','Informe de 1 a 100 acessos válidos por consulta.'); end if;
  v_inicio := p_hoje-6;
  -- O cliente informa seu dia local. Mesmo com relógio adiantado, não contar registros futuros.
  v_limite := least(p_hoje,(now() at time zone 'America/Sao_Paulo')::date);
  select coalesce(jsonb_agg(jsonb_build_object('token',a.token,'registros7dias',(
    select count(*) from jsonb_each(case when jsonb_typeof(a.retorno#>'{nutricaoV1,registros}')='object'
      then a.retorno#>'{nutricaoV1,registros}' else '{}'::jsonb end) r
    where r.key=r.value->>'id' and public.app_nutricao_registro_valido(r.value)
      and r.value->>'apagado'='false'
      and r.value->>'d'>=to_char(v_inicio,'YYYY-MM-DD')
      and r.value->>'d'<=to_char(v_limite,'YYYY-MM-DD')
  )) order by a.token),'[]'::jsonb) into v_alunos
  from public.app_aluno a
  where a.academia_id=p_academia and a.revogado_em is null and a.token=any(p_tokens);
  -- Tokens ausentes/revogados/de outra academia são omitidos, nunca representados como zero.
  return jsonb_build_object('ok',true,'inicio',to_char(v_inicio,'YYYY-MM-DD'),
    'hoje',to_char(p_hoje,'YYYY-MM-DD'),
    'consultadoEm',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'alunos',v_alunos);
end $$;
revoke all on function public.personal_nutricao_resumo(uuid,text[],date) from public,anon,authenticated;
grant execute on function public.personal_nutricao_resumo(uuid,text[],date) to authenticated;
