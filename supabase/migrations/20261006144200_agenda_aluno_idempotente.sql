-- One active request per student/day/time, serialized with revocation.
-- Keeps legacy RPC parameters and existing rows; a refused request can be retried.
begin;
create or replace function public.app_agenda_pede(t text,p_dia date,p_hora text,p_obs text)
returns json language plpgsql security definer set search_path=''
as $$
declare v_acad uuid; v_hora text; v_id bigint; v_status text;
begin
 -- Different devices and retries serialize on the same student, including the
 -- pending-count limit. The lock also conflicts with access revocation.
 perform 1 from public.app_aluno a where a.token=t for update;
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
 v_hora:=btrim(coalesce(p_hora,''));
 if v_hora<>'' and v_hora !~ '^([0-9]|[01][0-9]|2[0-3]):[0-5][0-9]$' then
  return json_build_object('erro','hora_invalida','mensagem','Informe um horário válido.');
 end if;
 if v_hora<>'' then v_hora:=lpad(v_hora,5,'0');end if;
 select g.id,g.status into v_id,v_status from public.app_agenda g
 where g.academia_id=v_acad and g.token=t and g.dia=p_dia
   and lpad(btrim(g.hora),case when btrim(g.hora)='' then 0 else 5 end,'0')=v_hora
   and g.status in ('pedido','confirmado')
 order by case when g.status='confirmado' then 0 else 1 end,g.id limit 1;
 if found then return json_build_object('ok',true,'id',v_id::text,'status',v_status,'duplicado',true);end if;
 if(select count(*) from public.app_agenda where token=t and status='pedido')>=10 then return json_build_object('erro','muitos_pedidos');end if;
 insert into public.app_agenda(academia_id,token,dia,hora,obs)
 values(v_acad,t,p_dia,v_hora,left(btrim(coalesce(p_obs,'')),200)) returning id into v_id;
 return json_build_object('ok',true,'id',v_id::text,'status','pedido','duplicado',false);
end;$$;
revoke all on function public.app_agenda_pede(text,date,text,text) from public;
grant execute on function public.app_agenda_pede(text,date,text,text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
