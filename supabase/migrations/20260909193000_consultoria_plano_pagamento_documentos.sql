-- Plano contratado, recorrência opcional e conferência de documentos. Pacotes legados preservam texto e hashes.

create or replace function public.app_consultoria_documento(
  p_modelo text,
  p_cfg jsonb,
  p_dados jsonb
)
returns text
language plpgsql immutable
set search_path = public
as $$
declare
  v_doc text := coalesce(p_modelo, '');
  v_endereco text;
  v_cidade_uf text;
  v_inicio text;
  v_nascimento text;
  v_valor text := 'conforme combinado';
  v_rep text := '';
  v_tinha_rep boolean := position('{{representante_legal}}' in coalesce(p_modelo, '')) > 0;
  v_num numeric;
  v_valores jsonb := '{}'::jsonb;
  v_match text[];
  v_resto text;
  v_pos integer;
  v_plano jsonb := p_cfg #> '{contrato,plano}';
  v_mensal boolean;
  v_linhas text[];
  v_ciclo numeric;
begin
  v_cidade_uf := case
    when coalesce(p_dados->>'cidade','') <> '' and coalesce(p_dados->>'uf','') <> '' then (p_dados->>'cidade') || '/' || (p_dados->>'uf')
    else coalesce(p_dados->>'cidade', p_dados->>'uf', '')
  end;
  v_endereco := concat_ws(', ',
    nullif(p_dados->>'logradouro',''), nullif(p_dados->>'numero',''),
    nullif(p_dados->>'complemento',''), nullif(p_dados->>'bairro',''),
    nullif(v_cidade_uf,''), case when coalesce(p_dados->>'cep','') <> '' then 'CEP ' || (p_dados->>'cep') end
  );
  v_nascimento := case when coalesce(p_dados->>'nascimento','') ~ '^\d{4}-\d{2}-\d{2}$'
    then substring(p_dados->>'nascimento' from 9 for 2) || '/' || substring(p_dados->>'nascimento' from 6 for 2) || '/' || substring(p_dados->>'nascimento' from 1 for 4)
    else coalesce(p_dados->>'nascimento','') end;
  v_inicio := case when coalesce(p_cfg #>> '{contrato,plano,inicio}','') ~ '^\d{4}-\d{2}-\d{2}$'
    then substring(p_cfg #>> '{contrato,plano,inicio}' from 9 for 2) || '/' || substring(p_cfg #>> '{contrato,plano,inicio}' from 6 for 2) || '/' || substring(p_cfg #>> '{contrato,plano,inicio}' from 1 for 4)
    else 'a data do aceite' end;
  if jsonb_typeof(p_cfg #> '{contrato,plano,valor}') = 'number' then
    v_num := (p_cfg #>> '{contrato,plano,valor}')::numeric;
    if v_num <> 0 then v_valor := 'R$ ' || replace(to_char(v_num, 'FM999999999999990.00'), '.', ','); end if;
  end if;
  if coalesce(p_dados->>'responsavelNome','') <> '' then
    v_rep := 'REPRESENTANTE LEGAL DO CONTRATANTE: ' || (p_dados->>'responsavelNome') ||
      ', CPF ' || coalesce(nullif(p_dados->>'responsavelCpf',''),'—') ||
      ', que aceita e assina este instrumento em nome do menor.';
  end if;

  v_valores := v_valores || jsonb_build_object('aluno_nome', coalesce(nullif(p_dados->>'nome',''),'—'));
  v_valores := v_valores || jsonb_build_object('aluno_nacionalidade', coalesce(nullif(p_dados->>'nacionalidade',''),'—'));
  v_valores := v_valores || jsonb_build_object('aluno_estado_civil', coalesce(nullif(p_dados->>'estadoCivil',''),'—'));
  v_valores := v_valores || jsonb_build_object('aluno_profissao', coalesce(nullif(p_dados->>'profissao',''),'—'));
  v_valores := v_valores || jsonb_build_object('aluno_rg', coalesce(nullif(p_dados->>'rg',''),'—'));
  v_valores := v_valores || jsonb_build_object('aluno_rg_orgao', coalesce(nullif(p_dados->>'rgOrgao',''),'—'));
  v_valores := v_valores || jsonb_build_object('aluno_cpf', coalesce(nullif(p_dados->>'cpf',''),'—'));
  v_valores := v_valores || jsonb_build_object('aluno_nascimento', coalesce(nullif(v_nascimento,''),'—'));
  v_valores := v_valores || jsonb_build_object('aluno_endereco', coalesce(nullif(v_endereco,''),'—'));
  v_valores := v_valores || jsonb_build_object('aluno_email', coalesce(nullif(p_dados->>'email',''),'—'));
  v_valores := v_valores || jsonb_build_object('aluno_telefone', coalesce(nullif(p_dados->>'telefone',''),'—'));
  v_valores := v_valores || jsonb_build_object('prestador_nome', coalesce(nullif(p_cfg #>> '{contrato,prestador,nome}',''),'—'));
  v_valores := v_valores || jsonb_build_object('prestador_documento', coalesce(nullif(p_cfg #>> '{contrato,prestador,documento}',''),'—'));
  v_valores := v_valores || jsonb_build_object('prestador_endereco', coalesce(nullif(p_cfg #>> '{contrato,prestador,endereco}',''),'—'));
  v_valores := v_valores || jsonb_build_object('prestador_email', coalesce(nullif(p_cfg #>> '{contrato,prestador,email}',''),'—'));
  v_valores := v_valores || jsonb_build_object('prestador_telefone', coalesce(nullif(p_cfg #>> '{contrato,prestador,telefone}',''),'—'));
  v_valores := v_valores || jsonb_build_object('plano_nome', coalesce(nullif(p_cfg #>> '{contrato,plano,nome}',''),'consultoria'));
  v_valores := v_valores || jsonb_build_object('plano_valor', v_valor);
  v_valores := v_valores || jsonb_build_object('contrato_inicio', v_inicio);
  v_valores := v_valores || jsonb_build_object('foro_cidade', case
    when coalesce(p_cfg #>> '{contrato,prestador,cidade}','') <> '' and coalesce(p_cfg #>> '{contrato,prestador,uf}','') <> ''
      then (p_cfg #>> '{contrato,prestador,cidade}') || '/' || (p_cfg #>> '{contrato,prestador,uf}')
    else coalesce(nullif(p_cfg #>> '{contrato,prestador,cidade}',''),'cidade do contratante') end);
  v_valores := v_valores || jsonb_build_object('responsavel_nome', coalesce(nullif(p_dados->>'responsavelNome',''),'—'));
  v_valores := v_valores || jsonb_build_object('responsavel_cpf', coalesce(nullif(p_dados->>'responsavelCpf',''),'—'));
  v_valores := v_valores || jsonb_build_object('representante_legal', v_rep);
  -- O mapa anterior permanece igual para preservar textos já assinados.
  if p_cfg->'fluxo' = '2'::jsonb then
    v_valores := v_valores || jsonb_build_object('aluno_documento_tipo',
      case when p_dados->>'documentoTipo' = 'cin' then 'CIN' else 'RG' end);
  end if;
  -- Uma passagem: valores digitados não são interpretados como novos campos.
  v_resto := coalesce(p_modelo, '');
  v_doc := '';
  loop
    v_match := regexp_match(v_resto, '(\{\{([a-z_]+)\}\})');
    exit when v_match is null;
    v_pos := position(v_match[1] in v_resto);
    v_doc := v_doc || substring(v_resto from 1 for v_pos - 1) || coalesce(v_valores->>v_match[2], '—');
    v_resto := substring(v_resto from v_pos + length(v_match[1]));
  end loop;
  v_doc := v_doc || v_resto;
  if not v_tinha_rep and v_rep <> '' then v_doc := v_doc || E'\n\n' || v_rep; end if;
  -- Mesmo resumo de planoTexto: integra o documento e seu hash.
  if p_cfg->'fluxo' = '2'::jsonb and p_cfg #>> '{contrato,ativo}' = 'true' then
    v_mensal := coalesce(v_plano->>'cobranca','') <> 'sessao';
    v_ciclo := coalesce(nullif((v_plano->>'ciclo')::numeric,0),1);
    v_linhas := array[
      'PLANO CONTRATADO',
      'Plano: ' || coalesce(nullif(v_plano->>'nome',''),'—') || '.',
      'Modalidade: ' || coalesce(nullif(v_plano->>'modalidade',''),'consultoria') || '.',
      'Valor: R$ ' || replace(to_char(coalesce((v_plano->>'valor')::numeric,0),'FM999999999999990.00'),'.',',') ||
        case when v_mensal then ' por mês.'
          when coalesce((v_plano->>'pacoteQtd')::numeric,0) > 0 then ' pelo pacote de ' || trim_scale((v_plano->>'pacoteQtd')::numeric)::text || ' aulas.'
          else ' por sessão.' end
    ];
    if v_mensal then
      v_linhas := array_append(v_linhas,'Ciclo contratual: ' || trim_scale(v_ciclo)::text || case when v_ciclo=1 then ' mês.' else ' meses.' end);
    end if;
    if coalesce((v_plano->>'treinosSem')::numeric,0)>0 then
      v_linhas := array_append(v_linhas,'Frequência: ' || trim_scale((v_plano->>'treinosSem')::numeric)::text || ' treino(s) por semana.');
    end if;
    v_linhas := array_append(v_linhas,'Início: ' || v_inicio || '.');
    if v_mensal then
      v_linhas := array_append(v_linhas,'Vencimento mensal: dia ' || trim_scale((v_plano->>'diaVenc')::numeric)::text || '.');
    end if;
    if not v_mensal and coalesce((v_plano->>'pacoteQtd')::numeric,0)>0 then
      v_linhas := array_append(v_linhas,'Renovação do pacote: ' ||
        case when v_plano->>'pacoteRenova'='true' then 'automática ao concluir as aulas.' else 'mediante nova contratação.' end);
    end if;
    v_linhas := array_append(v_linhas,case when p_cfg #>> '{pagamento,ativo}'='true'
      then 'Pagamento: assinatura recorrente pelo link ' || (p_cfg #>> '{pagamento,link}') || '.'
      else 'Pagamento: conforme combinado entre as partes.' end);
    v_doc := v_doc || E'\n\n' || array_to_string(v_linhas,E'\n');
  end if;
  return v_doc;
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
  v_documento text;
  v_documento_recebido text := coalesce(p_assinatura->>'documento','');
  v_documento_hash text;
  v_snapshot_hash text;
  v_conteudo_hash text;
  v_assinatura_hash text;
  v_imagem text := coalesce(p_assinatura->>'imagem','');
  v_png bytea;
  v_largura bigint;
  v_altura bigint;
  v_ip text;
  v_headers jsonb := '{}'::jsonb;
  v_contrato boolean;
  v_modo text;
  v_nascimento date;
  v_cpf_aluno text;
  v_cpf_responsavel text;
  v_nome_esperado text;
  v_menor boolean := false;
  v_inseriu boolean := false;
  v_row public.app_consultoria_aceites%rowtype;
  v_fluxo_novo boolean := false;
  v_plano jsonb;
  v_plano_inicio date;
  v_plano_valor numeric;
  v_plano_ciclo numeric;
  v_plano_venc numeric;
  v_link text;
  v_autoridade text;
  v_porta text;
  v_tipo_documento text;
  v_rg_normalizado text;
begin
  if t is null or length(t) < 10 then return jsonb_build_object('erro','sem_acesso'); end if;
  select academia_id, dados into v_acad, v_pacote from public.app_aluno
    where token=t and revogado_em is null for share;
  if v_acad is null then return jsonb_build_object('erro','sem_acesso'); end if;
  if p_versao is null or p_versao !~ '^oc-[a-f0-9]{16}$' then return jsonb_build_object('erro','versao_invalida'); end if;

  v_cfg := v_pacote #> '{dados,onboardingApp}';
  if v_cfg is null or jsonb_typeof(v_cfg) <> 'object' or v_cfg->>'ativo' <> 'true' or v_cfg->>'v' <> p_versao then
    return jsonb_build_object('erro','onboarding_desatualizado');
  end if;
  v_fluxo_novo := coalesce(v_cfg->'fluxo' = '2'::jsonb,false);
  v_perguntas := coalesce(v_cfg->'perguntas','[]'::jsonb);
  if jsonb_typeof(v_perguntas) <> 'array' or jsonb_array_length(v_perguntas) > 30
     or p_respostas is null or jsonb_typeof(p_respostas) <> 'array'
     or jsonb_array_length(p_respostas) <> jsonb_array_length(v_perguntas)
     or octet_length(p_respostas::text) > 60000 then
    return jsonb_build_object('erro','respostas_invalidas');
  end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' or octet_length(p_dados::text) > 16000
     or p_assinatura is null or jsonb_typeof(p_assinatura) <> 'object' or octet_length(p_assinatura::text) > 180000
     or p_cliente is null or jsonb_typeof(p_cliente) <> 'object' or octet_length(p_cliente::text) > 2000 then
    return jsonb_build_object('erro','conteudo_invalido');
  end if;

  for v_q in select value from jsonb_array_elements(v_perguntas) loop
    select value into v_r from jsonb_array_elements(p_respostas) where value->>'id'=v_q->>'id' limit 1;
    if v_r is null or length(trim(coalesce(v_r->>'resposta',''))) = 0
       or length(coalesce(v_r->>'resposta','')) > 1000 or length(coalesce(v_r->>'pergunta','')) > 500 then
      return jsonb_build_object('erro','resposta_obrigatoria','pergunta',v_q->>'id');
    end if;
    v_respostas := v_respostas || jsonb_build_array(jsonb_build_object(
      'id',left(v_q->>'id',100),'pergunta',left(v_q->>'texto',500),
      'resposta',left(v_r->>'resposta',1000),
      'pontos',case when jsonb_typeof(v_r->'pontos')='number' then v_r->'pontos' else 'null'::jsonb end
    ));
    v_r := null;
  end loop;

  v_cpf_aluno := regexp_replace(coalesce(p_dados->>'cpf',''),'\D','','g');
  v_cpf_responsavel := regexp_replace(coalesce(p_dados->>'responsavelCpf',''),'\D','','g');
  v_dados := jsonb_build_object(
    'nome',left(trim(coalesce(p_dados->>'nome','')),160),
    'nacionalidade',left(trim(coalesce(p_dados->>'nacionalidade','')),80),
    'estadoCivil',left(trim(coalesce(p_dados->>'estadoCivil','')),80),
    'profissao',left(trim(coalesce(p_dados->>'profissao','')),120),
    'rg',left(trim(coalesce(p_dados->>'rg','')),40),
    'rgOrgao',left(trim(coalesce(p_dados->>'rgOrgao','')),40),
    'cpf',v_cpf_aluno,
    'nascimento',left(trim(coalesce(p_dados->>'nascimento','')),10),
    'email',left(trim(coalesce(p_dados->>'email','')),160),
    'telefone',regexp_replace(coalesce(p_dados->>'telefone',''),'\D','','g'),
    'cep',regexp_replace(coalesce(p_dados->>'cep',''),'\D','','g'),
    'logradouro',left(trim(coalesce(p_dados->>'logradouro','')),300),
    'numero',left(trim(coalesce(p_dados->>'numero','')),30),
    'complemento',left(trim(coalesce(p_dados->>'complemento','')),120),
    'bairro',left(trim(coalesce(p_dados->>'bairro','')),120),
    'cidade',left(trim(coalesce(p_dados->>'cidade','')),120),
    'uf',upper(left(trim(coalesce(p_dados->>'uf','')),2)),
    'responsavelNome',left(trim(coalesce(p_dados->>'responsavelNome','')),160),
    'responsavelCpf',v_cpf_responsavel
  );
  if v_fluxo_novo then
    v_tipo_documento := coalesce(p_dados->>'documentoTipo','rg');
    v_dados := v_dados || jsonb_build_object('documentoTipo',v_tipo_documento,
      'rg',upper(left(trim(coalesce(p_dados->>'rg','')),40)));
  end if;
  v_assinatura := jsonb_build_object(
    'aceitou',coalesce(p_assinatura->>'aceitou','false')='true',
    'consentimentoSaude',coalesce(p_assinatura->>'consentimentoSaude','false')='true',
    'nome',left(trim(coalesce(p_assinatura->>'nome','')),160),
    'imagem',''
  );

  if jsonb_array_length(v_perguntas)>0 and v_assinatura->>'consentimentoSaude'<>'true' then
    return jsonb_build_object('erro','consentimento_necessario');
  end if;
  v_contrato := coalesce(v_cfg #>> '{contrato,ativo}','false')='true';
  v_modo := coalesce(v_cfg #>> '{contrato,modo}','aceite');
  if v_contrato then
    if v_fluxo_novo then
      -- Novas validações só para fluxo 2: retries antigos não mudam seu hash.
      if coalesce(p_dados->>'cpf','') !~ '^[0-9.\s-]+$'
         or not public.app_consultoria_cpf_valido(v_cpf_aluno) then
        return jsonb_build_object('erro','cpf_invalido','campo','cpf');
      end if;
      if v_tipo_documento not in ('rg','cin') then
        return jsonb_build_object('erro','identidade_invalida');
      end if;
      v_rg_normalizado := upper(regexp_replace(trim(coalesce(p_dados->>'rg','')),'[.\s/-]','','g'));
      if v_tipo_documento = 'cin' then
        if coalesce(p_dados->>'rg','') !~ '^[0-9.\s-]+$'
           or v_rg_normalizado <> v_cpf_aluno
           or not public.app_consultoria_cpf_valido(v_rg_normalizado) then
          return jsonb_build_object('erro','cin_divergente');
        end if;
      elsif coalesce(p_dados->>'rg','') !~ '^[A-Za-z0-9.\s/-]+$'
         or length(v_rg_normalizado)<5 or length(v_rg_normalizado)>20
         or length(regexp_replace(v_rg_normalizado,'[^0-9]','','g'))<3
         or v_rg_normalizado ~ '^(.)\1+$' then
        return jsonb_build_object('erro','identidade_invalida');
      end if;
      -- O preço vem do pacote publicado pelo profissional. O link encaminha
      -- ao provedor e nunca confirma pagamento ou cria cobrança nesta RPC.
      v_plano := v_cfg #> '{contrato,plano}';
      if v_plano is null or jsonb_typeof(v_plano)<>'object'
         or coalesce(trim(v_plano->>'id'),'')=''
         or coalesce(trim(v_plano->>'contratoId'),'')=''
         or coalesce(trim(v_plano->>'nome'),'')=''
         or jsonb_typeof(v_plano->'valor') is distinct from 'number'
         or jsonb_typeof(v_plano->'ciclo') is distinct from 'number'
         or jsonb_typeof(v_plano->'diaVenc') is distinct from 'number'
         or coalesce(v_plano->>'cobranca','') not in ('mes','sessao')
         or coalesce(v_plano->>'inicio','') !~ '^\d{4}-\d{2}-\d{2}$' then
        return jsonb_build_object('erro','plano_invalido');
      end if;
      begin
        v_plano_valor := (v_plano->>'valor')::numeric;
        v_plano_ciclo := (v_plano->>'ciclo')::numeric;
        v_plano_venc := (v_plano->>'diaVenc')::numeric;
        v_plano_inicio := (v_plano->>'inicio')::date;
        if v_plano_valor<=0 or v_plano_valor>1000000
           or v_plano_ciclo<>trunc(v_plano_ciclo) or v_plano_ciclo<1 or v_plano_ciclo>60
           or v_plano_venc<>trunc(v_plano_venc) or v_plano_venc<1 or v_plano_venc>28
           or to_char(v_plano_inicio,'YYYY-MM-DD')<>(v_plano->>'inicio') then
          return jsonb_build_object('erro','plano_invalido');
        end if;
        if (v_plano ? 'treinosSem' and jsonb_typeof(v_plano->'treinosSem') is distinct from 'number')
           or (v_plano ? 'pacoteQtd' and jsonb_typeof(v_plano->'pacoteQtd') is distinct from 'number')
           or (v_plano->>'treinosSem')::numeric<0 or (v_plano->>'treinosSem')::numeric>7
           or (v_plano->>'treinosSem')::numeric<>trunc((v_plano->>'treinosSem')::numeric)
           or (v_plano->>'pacoteQtd')::numeric<0
           or (v_plano->>'pacoteQtd')::numeric<>trunc((v_plano->>'pacoteQtd')::numeric) then
          return jsonb_build_object('erro','plano_invalido');
        end if;
      exception when others then return jsonb_build_object('erro','plano_invalido'); end;
      if v_cfg #>> '{pagamento,ativo}' = 'true' then
        v_link := coalesce(v_cfg #>> '{pagamento,link}','');
        v_autoridade := substring(v_link from '^https://([^/?#]+)');
        if v_plano->>'cobranca'<>'mes' or (v_plano->>'pacoteQtd')::numeric>0
           or length(v_link)>2048 or v_link ~ '[\s\x01-\x1f\\]'
           or v_autoridade is null or position('@' in v_autoridade)>0
           or v_autoridade !~ '^(\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?\.?)(:[0-9]{1,5})?$'
           or v_autoridade ~ '\.\.' then
          return jsonb_build_object('erro','link_pagamento_invalido');
        end if;
        v_porta := substring(v_autoridade from ':([0-9]+)$');
        if v_porta is not null and v_porta::integer>65535 then
          return jsonb_build_object('erro','link_pagamento_invalido');
        end if;
        if left(v_autoridade,1)='[' then
          begin
            if family(substring(v_autoridade from '^\[([^\]]+)\]')::inet)<>6 then
              return jsonb_build_object('erro','link_pagamento_invalido');
            end if;
          exception when others then return jsonb_build_object('erro','link_pagamento_invalido'); end;
        end if;
      end if;
    end if;
    if length(v_dados->>'nome')<3 or length(v_dados->>'nacionalidade')<3
       or length(v_dados->>'estadoCivil')<3 or length(v_dados->>'profissao')<2
       or length(v_dados->>'rg')<3 or length(v_dados->>'rgOrgao')<2
       or not public.app_consultoria_cpf_valido(v_cpf_aluno)
       or (v_dados->>'nascimento') !~ '^\d{4}-\d{2}-\d{2}$'
       or (v_dados->>'email') !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
       or length(v_dados->>'telefone')<10 or length(v_dados->>'telefone')>15
       or length(v_dados->>'cep')<>8 or length(v_dados->>'logradouro')<3
       or length(v_dados->>'numero')<1 or length(v_dados->>'bairro')<2
       or length(v_dados->>'cidade')<2 or (v_dados->>'uf') !~ '^[A-Z]{2}$' then
      return jsonb_build_object('erro','dados_contratuais_incompletos');
    end if;
    begin v_nascimento := (v_dados->>'nascimento')::date;
    exception when others then return jsonb_build_object('erro','nascimento_invalido'); end;
    if v_nascimento>current_date or v_nascimento<date '1900-01-01' then return jsonb_build_object('erro','nascimento_invalido'); end if;
    if v_nascimento>current_date-interval '18 years' then
      v_menor := true;
      if v_fluxo_novo and coalesce(p_dados->>'responsavelCpf','') !~ '^[0-9.\s-]+$' then
        return jsonb_build_object('erro','cpf_invalido','campo','responsavelCpf');
      end if;
      if length(v_dados->>'responsavelNome')<3 or not public.app_consultoria_cpf_valido(v_cpf_responsavel)
         or v_cpf_responsavel=v_cpf_aluno then return jsonb_build_object('erro','responsavel_legal_necessario'); end if;
      v_nome_esperado := v_dados->>'responsavelNome';
    else
      v_nome_esperado := v_dados->>'nome';
      v_dados := jsonb_set(jsonb_set(v_dados,'{responsavelNome}','""'::jsonb),'{responsavelCpf}','""'::jsonb);
    end if;
    if v_assinatura->>'aceitou'<>'true' or length(v_assinatura->>'nome')<3
       or lower(regexp_replace(v_assinatura->>'nome','\s+',' ','g')) <> lower(regexp_replace(v_nome_esperado,'\s+',' ','g')) then
      return jsonb_build_object('erro','aceite_necessario');
    end if;
    v_assinatura := v_assinatura || jsonb_build_object(
      'tipo',case when v_menor then 'responsavel' else 'aluno' end,
      'cpf',case when v_menor then v_dados->>'responsavelCpf' else v_dados->>'cpf' end
    );
    if length(coalesce(v_cfg #>> '{contrato,prestador,nome}',''))<3
       or length(coalesce(v_cfg #>> '{contrato,prestador,documento}',''))<11
       or length(coalesce(v_cfg #>> '{contrato,prestador,endereco}',''))<5
       or length(coalesce(v_cfg #>> '{contrato,prestador,email}',''))<5
       or length(regexp_replace(coalesce(v_cfg #>> '{contrato,prestador,telefone}',''),'\D','','g'))<10
       or length(coalesce(v_cfg #>> '{contrato,texto}',''))<300 then
      return jsonb_build_object('erro','contrato_incompleto');
    end if;

    v_documento := public.app_consultoria_documento(v_cfg #>> '{contrato,texto}',v_cfg,v_dados);
    if octet_length(v_documento)>30000 or v_documento_recebido is distinct from v_documento then
      return jsonb_build_object('erro','documento_divergente');
    end if;
    if v_modo='assinatura' then
      if v_imagem !~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$' or length(v_imagem)>140000 then
        return jsonb_build_object('erro','assinatura_invalida');
      end if;
      begin v_png := decode(substring(v_imagem from 23),'base64');
      exception when others then return jsonb_build_object('erro','assinatura_invalida'); end;
      if octet_length(v_png)<45 or octet_length(v_png)>105000
         or substring(v_png from 1 for 8)<>decode('89504e470d0a1a0a','hex')
         or substring(v_png from 13 for 4)<>decode('49484452','hex')
         or substring(v_png from octet_length(v_png)-11 for 12)<>decode('0000000049454e44ae426082','hex') then
        return jsonb_build_object('erro','assinatura_invalida');
      end if;
      v_largura := get_byte(v_png,16)::bigint*16777216+get_byte(v_png,17)::bigint*65536+get_byte(v_png,18)::bigint*256+get_byte(v_png,19);
      v_altura := get_byte(v_png,20)::bigint*16777216+get_byte(v_png,21)::bigint*65536+get_byte(v_png,22)::bigint*256+get_byte(v_png,23);
      if v_largura<250 or v_largura>2048 or v_altura<100 or v_altura>1024 or v_largura*v_altura>2000000 then
        return jsonb_build_object('erro','assinatura_invalida');
      end if;
      v_assinatura := jsonb_set(v_assinatura,'{imagem}',to_jsonb(v_imagem));
      v_assinatura_hash := encode(extensions.digest(v_png,'sha256'),'hex');
    end if;
  else
    v_documento := '';
  end if;

  begin v_headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
  exception when others then v_headers:='{}'::jsonb; end;
  v_ip:=left(coalesce(v_headers->>'cf-connecting-ip',split_part(v_headers->>'x-forwarded-for',',',1),''),80);
  v_evidencia:=jsonb_build_object(
    'agente',left(coalesce(p_cliente->>'agente',''),300),
    'idioma',left(coalesce(p_cliente->>'idioma',''),20),
    'rede_hash',encode(extensions.digest(convert_to(coalesce(v_ip,'')||':'||t,'UTF8'),'sha256'),'hex'),
    'registrado_pelo_servidor',true
  );
  v_snapshot_hash:=encode(extensions.digest(convert_to(v_cfg::text,'UTF8'),'sha256'),'hex');
  v_documento_hash:=encode(extensions.digest(convert_to(v_documento,'UTF8'),'sha256'),'hex');
  v_conteudo_hash:=encode(extensions.digest(convert_to(jsonb_build_object(
    'versao',p_versao,'academia',v_acad,'token',t,'snapshot_hash',v_snapshot_hash,
    'documento_hash',v_documento_hash,'respostas',v_respostas,'dados',v_dados,
    'assinatura',v_assinatura,'assinatura_hash',v_assinatura_hash
  )::text,'UTF8'),'sha256'),'hex');

  insert into public.app_consultoria_aceites
    (academia_id,token,versao,respostas,dados,assinatura,config_snapshot,evidencia,
     documento_texto,documento_hash,snapshot_hash,assinatura_hash,conteudo_hash)
  values
    (v_acad,t,p_versao,v_respostas,v_dados,v_assinatura,v_cfg,v_evidencia,
     v_documento,v_documento_hash,v_snapshot_hash,v_assinatura_hash,v_conteudo_hash)
  on conflict (token,versao) do nothing returning * into v_row;
  v_inseriu := found;
  if not v_inseriu then
    select * into v_row from public.app_consultoria_aceites
      where token=t and versao=p_versao and academia_id=v_acad limit 1;
  end if;
  if v_row.conteudo_hash is distinct from v_conteudo_hash then
    return jsonb_build_object('erro','aceite_conflitante');
  end if;
  return jsonb_build_object('ok',true,'id',v_row.id,'aceito_em',v_row.aceito_em,
    'documento_hash',v_row.documento_hash,'ja_existia',not v_inseriu);
end;
$$;

revoke all on function public.app_consultoria_documento(text,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.app_consultoria_conclui(text,text,jsonb,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.app_consultoria_conclui(text,text,jsonb,jsonb,jsonb,jsonb) to anon;
