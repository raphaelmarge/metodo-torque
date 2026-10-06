-- Somente antes da ativação financeira: recusa qualquer conta ou recibo.
-- Não usar para cancelar assinaturas, apagar pagamentos ou trocar credenciais.
-- O cadastro criar_personal, se instalado, é independente e permanece disponível.
begin;
lock table personal_billing.accounts, personal_billing.attempts,
  personal_billing.invoices, personal_billing.events in access exclusive mode;
do $$ begin
  if exists(select 1 from personal_billing.accounts)
    or exists(select 1 from personal_billing.attempts)
    or exists(select 1 from personal_billing.invoices)
    or exists(select 1 from personal_billing.events) then
    raise exception 'billing_rollback_requires_empty_financial_ledger';
  end if;
  if to_regprocedure('personal_billing.legacy_minha_assinatura()') is null then
    raise exception 'billing_rollback_requires_original_subscription_function';
  end if;
end $$;
drop trigger personal_billing_account_deleted on public.academias;
drop trigger personal_billing_dados_guard on public.dados;
drop trigger personal_billing_publicacao_guard on public.app_aluno;
drop function public.personal_billing_service(text,jsonb);
drop function public.minha_assinatura();
alter function personal_billing.legacy_minha_assinatura() rename to minha_assinatura;
alter function personal_billing.minha_assinatura() set schema public;
revoke all on function public.minha_assinatura() from public,anon;
grant execute on function public.minha_assinatura() to authenticated,service_role;
drop schema personal_billing cascade;
notify pgrst,'reload schema';
commit;
