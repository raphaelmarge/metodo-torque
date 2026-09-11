-- Relatório 08/09: só acrescenta a regra de atendimento à RPC existente.
-- Sem UPDATE/DELETE de alunos, sessões, recebimentos ou contratos.
create or replace function public.app_agenda_pede(t text,p_dia date,p_hora text,p_obs text)
returns json language plpgsql security definer set search_path=public
as $$
declare v_acad uuid;
begin
 v_acad:=public.app_aluno_ativo(t);
 if v_acad is null then return json_build_object('erro','token_invalido');end if;
 if exists (
  select 1 from public.dados d
  cross join lateral jsonb_array_elements(
   case when jsonb_typeof(d.valor->'alunos')='array' then d.valor->'alunos' else '[]'::jsonb end) a
  where d.academia_id=v_acad and d.chave='mtapp:ptStudio'
   and a->>'appTokenP'=t
   and lower(btrim(coalesce(nullif(btrim(a->>'atendimento'),''),a->>'modalidade','')))
      in ('online','on-line','consultoria online','consultoria on-line')
 )then return json_build_object('erro','atendimento_online','mensagem','Este atendimento é exclusivamente online e não permite pedido de aula presencial.');end if;
 if p_dia is null or p_dia<public.hoje_br() then return json_build_object('erro','dia_invalido');end if;
 if(select count(*) from public.app_agenda where token=t and status='pedido')>=10 then return json_build_object('erro','muitos_pedidos');end if;
 insert into public.app_agenda(academia_id,token,dia,hora,obs)
 values(v_acad,t,p_dia,left(coalesce(p_hora,''),5),left(trim(coalesce(p_obs,'')),200));
 return json_build_object('ok',true);
end;$$;
-- CREATE OR REPLACE preserva os privilégios existentes; não ampliar concessões.
