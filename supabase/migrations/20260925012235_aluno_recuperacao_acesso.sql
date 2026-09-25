-- Acesso exclusivo da Edge Function; nenhuma tabela de recuperação é exposta.
create schema if not exists torque_private;
create table if not exists torque_private.aluno_recuperacao (
  segredo_hash text primary key check (segredo_hash ~ '^[a-f0-9]{64}$'),
  app_token text not null references public.app_aluno(token) on delete cascade,
  login text not null,
  senha_anterior text not null,
  expira timestamptz not null
);
create index if not exists aluno_recuperacao_expira on torque_private.aluno_recuperacao(expira);
create table if not exists torque_private.aluno_recuperacao_limite (
  chave text primary key,
  inicio timestamptz not null,
  ultimo timestamptz not null,
  tentativas integer not null
);
alter table torque_private.aluno_recuperacao enable row level security;
alter table torque_private.aluno_recuperacao_limite enable row level security;
revoke all on torque_private.aluno_recuperacao, torque_private.aluno_recuperacao_limite from public, anon, authenticated;
grant usage on schema torque_private to service_role;
grant select, insert, update, delete on torque_private.aluno_recuperacao, torque_private.aluno_recuperacao_limite to service_role;

-- SECURITY INVOKER: apenas service_role pode chamar, com privilégios próprios.
create or replace function public.aluno_recuperacao_inicia(p_email text, p_hash text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_email text := lower(trim(coalesce(p_email,'')));
  v_agora timestamptz := clock_timestamp();
  v_chave text;
  v_n integer;
  v record;
begin
  if length(v_email)>254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or coalesce(p_hash,'') !~ '^[a-f0-9]{64}$' then return '{}'::jsonb; end if;
  delete from torque_private.aluno_recuperacao where expira < v_agora;
  delete from torque_private.aluno_recuperacao_limite where inicio < v_agora - interval '1 day';
  -- Teto global protege a cota mesmo com muitos endereços diferentes.
  insert into torque_private.aluno_recuperacao_limite as l values ('global',v_agora,v_agora,1)
    on conflict(chave) do update set tentativas=least(l.tentativas+1,101),ultimo=v_agora
    returning tentativas into v_n;
  if v_n>100 then return '{}'::jsonb; end if;
  v_chave := encode(extensions.digest(v_email,'sha256'),'hex');
  insert into torque_private.aluno_recuperacao_limite as l values(v_chave,v_agora,v_agora,1)
    on conflict(chave) do update set
      inicio=case when l.inicio < v_agora-interval '1 hour' then v_agora else l.inicio end,
      ultimo=v_agora,
      tentativas=case when l.inicio < v_agora-interval '1 hour' then 1 else l.tentativas+1 end
    where l.ultimo < v_agora-interval '60 seconds' and (l.inicio < v_agora-interval '1 hour' or l.tentativas<3)
    returning tentativas into v_n;
  if not found then return '{}'::jsonb; end if;
  select token,login,senha into v from public.app_aluno
    where lower(login)=v_email and revogado_em is null;
  if not found then return '{}'::jsonb; end if;
  insert into torque_private.aluno_recuperacao values(p_hash,v.token,v.login,v.senha,v_agora+interval '20 minutes');
  -- Somente o servidor recebe o destino; nunca retorna token do app ao visitante.
  return jsonb_build_object('email',v_email);
end;
$$;

create or replace function public.aluno_recuperacao_conclui(p_hash text, p_senha text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v record; v_token text;
begin
  if coalesce(p_hash,'') !~ '^[a-f0-9]{64}$' or length(coalesce(p_senha,''))<8
     or octet_length(coalesce(p_senha,''))>72 then return jsonb_build_object('ok',false); end if;
  select * into v from torque_private.aluno_recuperacao where segredo_hash=p_hash and expira>clock_timestamp();
  if not found then return jsonb_build_object('ok',false); end if;
  -- CAS da senha: consumo único inclusive com duas chamadas concorrentes.
  -- Alterar login/senha ou revogar o aluno invalida links emitidos antes.
  update public.app_aluno set senha=extensions.crypt(p_senha,extensions.gen_salt('bf',10))
    where token=v.app_token and login=v.login and senha=v.senha_anterior and revogado_em is null and v.expira>clock_timestamp()
    returning token into v_token;
  if not found then return jsonb_build_object('ok',false); end if;
  delete from torque_private.aluno_recuperacao where app_token=v_token;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.aluno_recuperacao_inicia(text,text), public.aluno_recuperacao_conclui(text,text) from public,anon,authenticated;
grant execute on function public.aluno_recuperacao_inicia(text,text), public.aluno_recuperacao_conclui(text,text) to service_role;
