-- mt-v821 — relatório Torque Personal 08/09
-- Aluno exclusivamente de consultoria online não pode gerar pedido de aula presencial.
-- A modalidade continua pertencendo ao estado canônico ptStudio; o token liga o app ao aluno.
create or replace function public.app_agenda_pede(t text, p_dia date, p_hora text, p_obs text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_acad uuid;
  v_online boolean := false;
begin
  v_acad := public.app_aluno_ativo(t);
  if v_acad is null then
    return json_build_object('erro', 'token_invalido');
  end if;

  select exists (
    select 1
      from public.dados d
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(d.valor -> 'alunos') = 'array'
          then d.valor -> 'alunos' else '[]'::jsonb end
      ) a
     where d.academia_id = v_acad
       and d.chave = 'mtapp:ptStudio'
       and a ->> 'appTokenP' = t
       and lower(trim(coalesce(a ->> 'modalidade', a ->> 'modo', ''))) in
           ('online', 'consultoria online', 'consultoria on-line')
  ) into v_online;

  if v_online then
    return json_build_object('erro', 'atendimento_online', 'mensagem', 'Este aluno é de consultoria online e não possui agenda presencial.');
  end if;

  if p_dia is null or p_dia < public.hoje_br() then
    return json_build_object('erro', 'dia_invalido');
  end if;
  if (select count(*) from public.app_agenda where token = t and status = 'pedido') >= 10 then
    return json_build_object('erro', 'muitos_pedidos');
  end if;
  insert into public.app_agenda (academia_id, token, dia, hora, obs)
    values (v_acad, t, p_dia, left(coalesce(p_hora, ''), 5), left(trim(coalesce(p_obs, '')), 200));
  return json_build_object('ok', true);
end;
$function$;

comment on function public.app_agenda_pede(text,date,text,text) is
  'Pedido de agenda do app; mt-v821 bloqueia consultoria exclusivamente online antes de criar sessão presencial.';
