-- O app do aluno envia sempre a chave publica e usa o papel anon.
-- Contas autenticadas do painel nao chamam estas RPCs diretamente.
revoke execute on function public.app_nutricao_estado(text) from authenticated;
revoke execute on function public.app_nutricao_salva(text, jsonb) from authenticated;
