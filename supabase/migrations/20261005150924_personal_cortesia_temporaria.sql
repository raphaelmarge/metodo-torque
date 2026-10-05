-- Reconhece somente cortesias ja atribuidas pelo administrador no servidor.
-- Nao concede beneficios, altera contas, reinicia trial ou cria cobrancas.
-- O prazo e exclusivo: em assinatura_vence a cortesia ja terminou.
begin;

create or replace function public.minha_assinatura()
returns jsonb
language sql security definer stable
set search_path = ''
as $$
  select jsonb_build_object(
    'status', a.assinatura_status,
    'via', a.assinatura_via,
    'vence', a.assinatura_vence,
    'academia_id', a.id,
    'dia_do_teste', (floor(extract(epoch from now() - a.criada) / 86400)::int + 1),
    'dias_de_teste', r.dias_teste,
    'dias_carencia', r.dias_carencia,
    'dias_ate_travar', case
      when a.assinatura_status in ('ativa', 'vitalicia') then null
      when a.assinatura_status = 'cortesia' then
        case when a.assinatura_vence is not null and isfinite(a.assinatura_vence)
          then greatest(0, ceil(extract(epoch from a.assinatura_vence - now()) / 86400)::int)
          else 0 end
      else greatest(0, (r.dias_teste + r.dias_carencia)
                       - (floor(extract(epoch from now() - a.criada) / 86400)::int + 1)) end,
    'travado', case
      when a.assinatura_status in ('ativa', 'vitalicia') then false
      when a.assinatura_status = 'cortesia' then
        not coalesce(isfinite(a.assinatura_vence) and a.assinatura_vence > now(), false)
      when a.assinatura_status = 'trial'
        then (floor(extract(epoch from now() - a.criada) / 86400)::int + 1)
             > (r.dias_teste + r.dias_carencia)
      when a.assinatura_status = 'atrasada' then false
      else true end
  ) || case when a.assinatura_status = 'cortesia'
       then jsonb_build_object('cortesia', true) else '{}'::jsonb end
  from public.academias a
  cross join (select dias_teste, dias_carencia from public.assinatura_regras where id = 1) r
  where auth.uid() is not null and a.id in (select public.minhas_academias())
  order by a.criada
  limit 1
$$;

-- A RPC e pessoal. O papel de API nao substitui o vinculo por auth.uid().
revoke all on function public.minha_assinatura() from public, anon;
grant execute on function public.minha_assinatura() to authenticated, service_role;
notify pgrst, 'reload schema';
commit;
