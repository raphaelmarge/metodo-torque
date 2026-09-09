-- Entrada opcional da consultoria: questionário + contrato versionado e imutável.
-- O aluno escreve somente pela RPC validada com o token do próprio app.

create table if not exists public.app_consultoria_aceites (
  id uuid primary key default gen_random_uuid(),
  academia_id uuid not null references public.academias(id) on delete cascade,
  token text not null references public.app_aluno(token) on delete cascade,
  versao text not null,
  respostas jsonb not null default '[]'::jsonb,
  dados jsonb not null default '{}'::jsonb,
  assinatura jsonb not null default '{}'::jsonb,
  config_snapshot jsonb not null,
  evidencia jsonb not null default '{}'::jsonb,
  documento_hash text not null,
  aceito_em timestamptz not null default clock_timestamp(),
  unique (token, versao),
  check (versao ~ '^oc-[a-f0-9]{16}$'),
  check (jsonb_typeof(respostas) = 'array' and jsonb_array_length(respostas) <= 30),
  check (jsonb_typeof(dados) = 'object'),
  check (jsonb_typeof(assinatura) = 'object'),
  check (octet_length(respostas::text) <= 60000),
  check (octet_length(dados::text) <= 16000),
  check (octet_length(assinatura::text) <= 150000),
  check (octet_length(config_snapshot::text) <= 100000),
  check (documento_hash ~ '^[a-f0-9]{64}$')
);

create index if not exists app_consultoria_aceites_academia_data
  on public.app_consultoria_aceites (academia_id, aceito_em desc);
create index if not exists app_consultoria_aceites_token_data
  on public.app_consultoria_aceites (token, aceito_em desc);

alter table public.app_consultoria_aceites enable row level security;
revoke all on table public.app_consultoria_aceites from public, anon, authenticated;
grant select on table public.app_consultoria_aceites to authenticated;

drop policy if exists "app_consultoria_aceites_membros_leem" on public.app_consultoria_aceites;
create policy "app_consultoria_aceites_membros_leem" on public.app_consultoria_aceites
  for select to authenticated
  using (academia_id in (select public.minhas_academias()));

create or replace function public.app_consultoria_estado(t text, p_versao text)
returns jsonb
language plpgsql security definer stable
set search_path = public
as $$
declare
  v_acad uuid;
  v_row public.app_consultoria_aceites%rowtype;
begin
  v_acad := public.app_aluno_ativo(t);
  if v_acad is null then
    return jsonb_build_object('erro', 'sem_acesso');
  end if;
  if p_versao is null or p_versao !~ '^oc-[a-f0-9]{16}$' then
    return jsonb_build_object('erro', 'versao_invalida');
  end if;
  select * into v_row from public.app_consultoria_aceites
    where token = t and academia_id = v_acad and versao = p_versao
    limit 1;
  return jsonb_build_object(
    'ok', true,
    'concluido', v_row.id is not null,
    'id', v_row.id,
    'aceito_em', v_row.aceito_em,
    'documento_hash', v_row.documento_hash
  );
end;
$$;

create or replace function public.app_consultoria_conclui(
  t text,
  p_versao text,
  p_respostas jsonb,
  p_dados jsonb,
  p_assinatura jsonb,
  p_cliente jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_acad uuid;
  v_pacote jsonb;
  v_cfg jsonb;
  v_perguntas jsonb;
  v_q jsonb;
  v_r jsonb;
  v_respostas jsonb := '[]'::jsonb;
  v_dados jsonb;
  v_assinatura jsonb;
  v_evidencia jsonb;
  v_hash text;
  v_ip text;
  v_headers jsonb := '{}'::jsonb;
  v_contrato boolean;
  v_modo text;
  v_nascimento date;
  v_cpf text;
  v_soma integer;
  v_d1 integer;
  v_d2 integer;
  v_row public.app_consultoria_aceites%rowtype;
begin
  if t is null or length(t) < 10 then
    return jsonb_build_object('erro', 'sem_acesso');
  end if;
  select academia_id, dados into v_acad, v_pacote
    from public.app_aluno where token = t and revogado_em is null
    for share;
  if v_acad is null then
    return jsonb_build_object('erro', 'sem_acesso');
  end if;
  if p_versao is null or p_versao !~ '^oc-[a-f0-9]{16}$' then
    return jsonb_build_object('erro', 'versao_invalida');
  end if;

  v_cfg := v_pacote #> '{dados,onboardingApp}';
  if v_cfg is null or jsonb_typeof(v_cfg) <> 'object'
     or v_cfg->>'ativo' <> 'true' or v_cfg->>'v' <> p_versao then
    return jsonb_build_object('erro', 'onboarding_desatualizado');
  end if;
  v_perguntas := coalesce(v_cfg->'perguntas', '[]'::jsonb);
  if jsonb_typeof(v_perguntas) <> 'array' or jsonb_array_length(v_perguntas) > 30
     or p_respostas is null or jsonb_typeof(p_respostas) <> 'array'
     or jsonb_array_length(p_respostas) <> jsonb_array_length(v_perguntas)
     or octet_length(p_respostas::text) > 60000 then
    return jsonb_build_object('erro', 'respostas_invalidas');
  end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' or octet_length(p_dados::text) > 16000
     or p_assinatura is null or jsonb_typeof(p_assinatura) <> 'object' or octet_length(p_assinatura::text) > 150000
     or p_cliente is null or jsonb_typeof(p_cliente) <> 'object' or octet_length(p_cliente::text) > 2000 then
    return jsonb_build_object('erro', 'conteudo_invalido');
  end if;

  for v_q in select value from jsonb_array_elements(v_perguntas) loop
    select value into v_r from jsonb_array_elements(p_respostas)
      where value->>'id' = v_q->>'id' limit 1;
    if v_r is null or length(trim(coalesce(v_r->>'resposta', ''))) = 0
       or length(coalesce(v_r->>'resposta', '')) > 1000
       or length(coalesce(v_r->>'pergunta', '')) > 500 then
      return jsonb_build_object('erro', 'resposta_obrigatoria', 'pergunta', v_q->>'id');
    end if;
    v_respostas := v_respostas || jsonb_build_array(jsonb_build_object(
      'id', left(v_q->>'id', 100),
      'pergunta', left(v_q->>'texto', 500),
      'resposta', left(v_r->>'resposta', 1000),
      'pontos', case when jsonb_typeof(v_r->'pontos') = 'number' then v_r->'pontos' else 'null'::jsonb end
    ));
    v_r := null;
  end loop;

  v_contrato := coalesce(v_cfg #>> '{contrato,ativo}', 'false') = 'true';
  v_modo := coalesce(v_cfg #>> '{contrato,modo}', 'aceite');
  v_dados := jsonb_build_object(
    'nome', left(trim(coalesce(p_dados->>'nome', '')), 160),
    'nacionalidade', left(trim(coalesce(p_dados->>'nacionalidade', '')), 80),
    'estadoCivil', left(trim(coalesce(p_dados->>'estadoCivil', '')), 80),
    'profissao', left(trim(coalesce(p_dados->>'profissao', '')), 120),
    'rg', left(trim(coalesce(p_dados->>'rg', '')), 40),
    'rgOrgao', left(trim(coalesce(p_dados->>'rgOrgao', '')), 40),
    'cpf', left(trim(coalesce(p_dados->>'cpf', '')), 30),
    'nascimento', left(trim(coalesce(p_dados->>'nascimento', '')), 10),
    'email', left(trim(coalesce(p_dados->>'email', '')), 160),
    'telefone', left(trim(coalesce(p_dados->>'telefone', '')), 30),
    'cep', left(trim(coalesce(p_dados->>'cep', '')), 12),
    'logradouro', left(trim(coalesce(p_dados->>'logradouro', '')), 300),
    'numero', left(trim(coalesce(p_dados->>'numero', '')), 30),
    'complemento', left(trim(coalesce(p_dados->>'complemento', '')), 120),
    'bairro', left(trim(coalesce(p_dados->>'bairro', '')), 120),
    'cidade', left(trim(coalesce(p_dados->>'cidade', '')), 120),
    'uf', upper(left(trim(coalesce(p_dados->>'uf', '')), 2)),
    'responsavelNome', left(trim(coalesce(p_dados->>'responsavelNome', '')), 160),
    'responsavelCpf', left(trim(coalesce(p_dados->>'responsavelCpf', '')), 30)
  );
  v_assinatura := jsonb_build_object(
    'aceitou', coalesce(p_assinatura->>'aceitou', 'false') = 'true',
    'consentimentoSaude', coalesce(p_assinatura->>'consentimentoSaude', 'false') = 'true',
    'nome', left(trim(coalesce(p_assinatura->>'nome', '')), 160),
    'imagem', case when coalesce(p_assinatura->>'imagem', '') ~ '^data:image/png;base64,[A-Za-z0-9+/=]+$'
                    and length(p_assinatura->>'imagem') <= 140000 then p_assinatura->>'imagem' else '' end
  );

  if jsonb_array_length(v_perguntas) > 0 and v_assinatura->>'consentimentoSaude' <> 'true' then
    return jsonb_build_object('erro', 'consentimento_necessario');
  end if;
  if v_contrato then
    v_cpf := regexp_replace(v_dados->>'cpf', '\D', '', 'g');
    if length(v_dados->>'nome') < 3 or length(v_dados->>'nacionalidade') < 3
       or length(v_dados->>'estadoCivil') < 3 or length(v_dados->>'profissao') < 2
       or length(v_dados->>'rg') < 3 or length(v_dados->>'rgOrgao') < 2
       or length(v_cpf) <> 11 or v_cpf ~ '^(\d)\1{10}$'
       or (v_dados->>'nascimento') !~ '^\d{4}-\d{2}-\d{2}$'
       or (v_dados->>'email') !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
       or length(regexp_replace(v_dados->>'telefone', '\D', '', 'g')) < 10
       or length(regexp_replace(v_dados->>'cep', '\D', '', 'g')) <> 8
       or length(v_dados->>'logradouro') < 3 or length(v_dados->>'numero') < 1
       or length(v_dados->>'bairro') < 2 or length(v_dados->>'cidade') < 2
       or (v_dados->>'uf') !~ '^[A-Z]{2}$' then
      return jsonb_build_object('erro', 'dados_contratuais_incompletos');
    end if;
    select sum(substring(v_cpf from i for 1)::integer * (11 - i))
      into v_soma from generate_series(1, 9) as i;
    v_d1 := case when 11 - (v_soma % 11) >= 10 then 0 else 11 - (v_soma % 11) end;
    select sum(substring(v_cpf from i for 1)::integer * (12 - i))
      into v_soma from generate_series(1, 10) as i;
    v_d2 := case when 11 - (v_soma % 11) >= 10 then 0 else 11 - (v_soma % 11) end;
    if v_d1 <> substring(v_cpf from 10 for 1)::integer
       or v_d2 <> substring(v_cpf from 11 for 1)::integer then
      return jsonb_build_object('erro', 'cpf_invalido');
    end if;
    begin
      v_nascimento := (v_dados->>'nascimento')::date;
    exception when others then
      return jsonb_build_object('erro', 'nascimento_invalido');
    end;
    if v_nascimento > current_date or v_nascimento < date '1900-01-01' then
      return jsonb_build_object('erro', 'nascimento_invalido');
    end if;
    if v_nascimento > current_date - interval '18 years' then
      v_cpf := regexp_replace(v_dados->>'responsavelCpf', '\D', '', 'g');
      if length(v_dados->>'responsavelNome') < 3 or length(v_cpf) <> 11 or v_cpf ~ '^(\d)\1{10}$' then
        return jsonb_build_object('erro', 'responsavel_legal_necessario');
      end if;
      select sum(substring(v_cpf from i for 1)::integer * (11 - i)) into v_soma from generate_series(1, 9) as i;
      v_d1 := case when 11 - (v_soma % 11) >= 10 then 0 else 11 - (v_soma % 11) end;
      select sum(substring(v_cpf from i for 1)::integer * (12 - i)) into v_soma from generate_series(1, 10) as i;
      v_d2 := case when 11 - (v_soma % 11) >= 10 then 0 else 11 - (v_soma % 11) end;
      if v_d1 <> substring(v_cpf from 10 for 1)::integer or v_d2 <> substring(v_cpf from 11 for 1)::integer then
        return jsonb_build_object('erro', 'responsavel_legal_necessario');
      end if;
    end if;
    if v_assinatura->>'aceitou' <> 'true' or length(v_assinatura->>'nome') < 3 then
      return jsonb_build_object('erro', 'aceite_necessario');
    end if;
    if v_modo = 'assinatura' and length(v_assinatura->>'imagem') < 100 then
      return jsonb_build_object('erro', 'assinatura_necessaria');
    end if;
    if length(coalesce(v_cfg #>> '{contrato,prestador,nome}', '')) < 3
       or length(coalesce(v_cfg #>> '{contrato,prestador,documento}', '')) < 11
       or length(coalesce(v_cfg #>> '{contrato,prestador,endereco}', '')) < 5
       or length(coalesce(v_cfg #>> '{contrato,prestador,email}', '')) < 5
       or length(regexp_replace(coalesce(v_cfg #>> '{contrato,prestador,telefone}', ''), '\D', '', 'g')) < 10
       or length(coalesce(v_cfg #>> '{contrato,texto}', '')) < 300 then
      return jsonb_build_object('erro', 'contrato_incompleto');
    end if;
  end if;

  begin
    v_headers := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  exception when others then
    v_headers := '{}'::jsonb;
  end;
  v_ip := left(coalesce(v_headers->>'cf-connecting-ip', split_part(v_headers->>'x-forwarded-for', ',', 1), ''), 80);
  v_evidencia := jsonb_build_object(
    'agente', left(coalesce(p_cliente->>'agente', ''), 300),
    'idioma', left(coalesce(p_cliente->>'idioma', ''), 20),
    'rede_hash', encode(digest(convert_to(coalesce(v_ip, '') || ':' || t, 'UTF8'), 'sha256'), 'hex'),
    'registrado_pelo_servidor', true
  );
  v_hash := encode(digest(convert_to(jsonb_build_object(
    'versao', p_versao, 'config', v_cfg, 'respostas', v_respostas,
    'dados', v_dados, 'assinatura', v_assinatura
  )::text, 'UTF8'), 'sha256'), 'hex');

  insert into public.app_consultoria_aceites
    (academia_id, token, versao, respostas, dados, assinatura, config_snapshot, evidencia, documento_hash)
  values
    (v_acad, t, p_versao, v_respostas, v_dados, v_assinatura, v_cfg, v_evidencia, v_hash)
  on conflict (token, versao) do nothing;

  select * into v_row from public.app_consultoria_aceites
    where token = t and versao = p_versao and academia_id = v_acad limit 1;
  return jsonb_build_object(
    'ok', true, 'id', v_row.id, 'aceito_em', v_row.aceito_em,
    'documento_hash', v_row.documento_hash, 'ja_existia', v_row.documento_hash <> v_hash
  );
end;
$$;

revoke all on function public.app_consultoria_estado(text, text) from public, authenticated;
revoke all on function public.app_consultoria_conclui(text, text, jsonb, jsonb, jsonb, jsonb) from public, authenticated;
grant execute on function public.app_consultoria_estado(text, text) to anon;
grant execute on function public.app_consultoria_conclui(text, text, jsonb, jsonb, jsonb, jsonb) to anon;
