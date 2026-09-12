-- Central Pro v830 — completa os gatilhos exibidos pela interface e corrige
-- a ação de exclusão do substituto sem tocar no academia_id.

alter table public.personal_aluno_equipe
  drop constraint if exists personal_aluno_equipe_substituto_fkey;

alter table public.personal_aluno_equipe
  add constraint personal_aluno_equipe_substituto_fkey
  foreign key (academia_id, substituto_id)
  references public.membros(academia_id, user_id)
  on delete set null (substituto_id);

create or replace function torque_private.personal_automacao_enfileira_aluno_novo()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, torque_private
as $$
begin
  insert into public.personal_automacao_fila(academia_id, automacao_id, aluno_id, gatilho, acao, origem)
  select new.academia_id, a.id, new.token, a.gatilho, a.acao,
         jsonb_build_object('token',new.token,'evento','aluno.novo')
    from public.personal_automacoes a
   where a.academia_id = new.academia_id
     and a.ativa
     and a.gatilho = 'aluno.novo';
  return new;
end;
$$;
revoke all on function torque_private.personal_automacao_enfileira_aluno_novo() from public, anon, authenticated;

drop trigger if exists personal_automacao_aluno_novo_ai on public.app_aluno;
create trigger personal_automacao_aluno_novo_ai
after insert on public.app_aluno
for each row execute function torque_private.personal_automacao_enfileira_aluno_novo();

create or replace function torque_private.personal_automacao_enfileira_agenda_cancelada()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, torque_private
as $$
begin
  -- O contrato atual de app_agenda usa "recusado" como estado terminal negativo.
  -- A Central Pro chama esse evento de agenda.cancelada para manter a linguagem
  -- operacional da interface, sem alterar o contrato legado de app_agenda.
  if old.status is distinct from new.status and new.status = 'recusado' then
    insert into public.personal_automacao_fila(academia_id, automacao_id, aluno_id, gatilho, acao, origem)
    select new.academia_id, a.id, new.token, a.gatilho, a.acao,
           jsonb_build_object('app_agenda_id',new.id,'token',new.token,'dia',new.dia,'hora',new.hora,'status',new.status)
      from public.personal_automacoes a
     where a.academia_id = new.academia_id
       and a.ativa
       and a.gatilho = 'agenda.cancelada';
  end if;
  return new;
end;
$$;
revoke all on function torque_private.personal_automacao_enfileira_agenda_cancelada() from public, anon, authenticated;

drop trigger if exists personal_automacao_agenda_cancelada_au on public.app_agenda;
create trigger personal_automacao_agenda_cancelada_au
after update of status on public.app_agenda
for each row execute function torque_private.personal_automacao_enfileira_agenda_cancelada();
