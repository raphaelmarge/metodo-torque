-- mt-v807 — CAS atômico do ptStudio.
-- Aplicar antes de publicar o cliente v807.
alter table public.dados add column if not exists base_atualizado timestamptz;

create or replace function public.dados_carimba()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.chave = 'mtapp:ptStudio' and tg_op = 'UPDATE' then
    if new.base_atualizado is null or old.atualizado is distinct from new.base_atualizado then
      raise exception using
        errcode = 'PT409',
        message = 'Conflito de revisão: outra sessão alterou o painel. Atualize antes de salvar.';
    end if;
  end if;
  new.atualizado := now();
  new.base_atualizado := null;
  return new;
end $$;

revoke execute on function public.dados_carimba() from public, anon, authenticated;
