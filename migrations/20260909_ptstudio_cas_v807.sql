-- mt-v807: comparação de revisão no servidor, compatível com INSERT ON CONFLICT.
-- Teste executável: tests/sql/test-reliability.py (PostgreSQL isolado, sem produção).
alter table public.dados add column if not exists base_atualizado timestamptz;

create or replace function public.dados_carimba()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if old.chave = 'mtapp:ptStudio' or new.chave = 'mtapp:ptStudio' then
      if new.chave is distinct from old.chave or new.academia_id is distinct from old.academia_id
         or new.base_atualizado is null or old.atualizado is distinct from new.base_atualizado then
        raise exception using errcode = 'PT409',
          message = 'Conflito de revisão: outra sessão alterou o painel. Atualize antes de salvar.';
      end if;
    end if;
    -- now() repete dentro da mesma transação; a revisão precisa sempre avançar.
    new.atualizado := greatest(clock_timestamp(), old.atualizado + interval '1 microsecond');
    new.base_atualizado := null;
  else
    new.atualizado := clock_timestamp();
    -- BEFORE INSERT roda também antes do ON CONFLICT DO UPDATE. Não apagar a
    -- precondição do Personal aqui: ela ainda precisa chegar a EXCLUDED.
    if new.chave <> 'mtapp:ptStudio' then new.base_atualizado := null; end if;
  end if;
  return new;
end $$;

create or replace function public.dados_base_insercao_valida()
returns trigger language plpgsql set search_path = public as $$
begin
  -- AFTER INSERT só roda para uma inclusão real, não para o ramo UPDATE do
  -- upsert. Uma revisão de registro removido não pode ressuscitá-lo em silêncio.
  if new.chave = 'mtapp:ptStudio' and new.base_atualizado is not null then
    raise exception using errcode = 'PT409',
      message = 'A revisão do painel não existe mais. Recarregue antes de salvar.';
  end if;
  return null;
end $$;

drop trigger if exists dados_carimba_tg on public.dados;
create trigger dados_carimba_tg before insert or update on public.dados
  for each row execute function public.dados_carimba();
drop trigger if exists dados_base_insercao_tg on public.dados;
create trigger dados_base_insercao_tg after insert on public.dados
  for each row execute function public.dados_base_insercao_valida();

-- A barreira também existe na publicação: cliente antigo ou resposta atrasada
-- não troca o pacote do aluno depois que outra sessão já alterou o Personal.
-- Não intercepta retorno, revogação ou uso normal do aluno; Nutri/Academia mantêm
-- seus formatos. RLS e histórico existentes continuam responsáveis pelo acesso.
create or replace function public.app_aluno_valida_fonte()
returns trigger language plpgsql set search_path = public as $$
declare
  v_studio jsonb;
  v_revisao timestamptz;
  v_base timestamptz;
  v_aluno jsonb;
  v_personal boolean;
begin
  if tg_op = 'UPDATE' then
    -- Revogação canônica remove pacote/login; não é publicação. A exceção
    -- exige acesso cortado e pacote NULL, sem trocar aluno ou academia.
    if new.revogado_em is not null and new.dados is null
       and new.token is not distinct from old.token
       and new.academia_id is not distinct from old.academia_id then return new; end if;
    if new.dados is not distinct from old.dados
       and new.token is not distinct from old.token
       and new.academia_id is not distinct from old.academia_id then return new; end if;
  end if;
  v_personal := coalesce(new.dados->>'sourceKey' = 'mtapp:ptStudio', false)
    or nullif(new.dados #>> '{dados,a,appTokenP}', '') is not null;
  if tg_op = 'UPDATE' then
    v_personal := v_personal or coalesce(old.dados->>'sourceKey' = 'mtapp:ptStudio', false)
      or nullif(old.dados #>> '{dados,a,appTokenP}', '') is not null;
  end if;

  -- FOR SHARE serializa publicação e escrita da fonte; só comparar sem esse
  -- lock deixaria uma janela entre validar a revisão e gravar o pacote.
  select d.valor, d.atualizado into v_studio, v_revisao
    from public.dados d where d.academia_id = new.academia_id and d.chave = 'mtapp:ptStudio'
    for share;
  select a into v_aluno from jsonb_array_elements(
    case when jsonb_typeof(v_studio->'alunos') = 'array' then v_studio->'alunos' else '[]'::jsonb end
  ) a where a->>'appTokenP' = new.token limit 1;
  v_personal := v_personal or v_aluno is not null;
  if not v_personal then return new; end if;

  begin
    v_base := nullif(new.dados->>'sourceUpdatedAt', '')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then
    v_base := null;
  end;
  if v_aluno is null or v_base is null or v_revisao is distinct from v_base
     or new.dados #>> '{dados,a,id}' is distinct from v_aluno->>'id'
     or new.dados #>> '{dados,a,appTokenP}' is distinct from new.token then
    raise exception using errcode = 'PT409',
      message = 'A prescrição mudou ou esta publicação está desatualizada. Sincronize o painel antes de publicar.';
  end if;
  return new;
end $$;

drop trigger if exists app_aluno_fonte_tg on public.app_aluno;
create trigger app_aluno_fonte_tg before insert or update of dados, academia_id, token on public.app_aluno
  for each row execute function public.app_aluno_valida_fonte();

revoke execute on function public.dados_carimba() from public, anon, authenticated;
revoke execute on function public.dados_base_insercao_valida() from public, anon, authenticated;
revoke execute on function public.app_aluno_valida_fonte() from public, anon, authenticated;
