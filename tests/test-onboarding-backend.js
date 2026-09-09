/* Contrato de persistência do onboarding. O teste SQL executável roda à parte;
 * esta guarda impede que permissões, imutabilidade e evidências saiam da migration. */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const sqlBase=fs.readFileSync(path.join(__dirname,"../supabase/migrations/20260909182500_consultoria_onboarding_contrato.sql"),"utf8");
const sqlHard=fs.readFileSync(path.join(__dirname,"../supabase/migrations/20260909190000_onboarding_integridade_e_retorno_reservado.sql"),"utf8");
const sql=sqlBase+"\n"+sqlHard;
const setup=fs.readFileSync(path.join(__dirname,"../supabase-setup.sql"),"utf8");
let n=0;function ok(v,s){assert.ok(v,s);n++;console.log("OK "+s);}
ok(/unique \(token, versao\)/i.test(sql),"uma versão aceita é imutável por aluno");
ok(/on conflict \(token,\s*versao\) do nothing/i.test(sql)&&/aceite_conflitante/i.test(sql),"reenvio idêntico é idempotente e conteúdo diferente conflita");
ok(/v_cfg->>'v' <> p_versao/i.test(sql),"servidor aceita somente a versão publicada no app");
ok(/for share/i.test(sql),"publicação é travada durante a conferência do aceite");
ok(/config_snapshot/i.test(sql)&&/documento_hash/i.test(sql)&&/digest\(/i.test(sql),"snapshot, SHA-256 e data do servidor preservam evidência");
ok(/rede_hash/i.test(sql)&&!/jsonb_build_object\([\s\S]{0,300}'ip'/i.test(sql),"rede vira hash e o endereço bruto não é guardado");
ok(/enable row level security/i.test(sql)&&/minhas_academias\(\)/i.test(sql),"respostas só podem ser lidas por membro da academia");
ok(/revoke all on table[^;]+public, anon, authenticated/i.test(sql),"tabela não permite escrita direta pelo cliente");
ok(/grant execute[^;]+app_consultoria_conclui[^;]+to anon/i.test(sql)&&/revoke all[^;]+app_consultoria_conclui[^;]+from public, authenticated/i.test(sql),"aluno escreve apenas pela RPC validada");
ok(/consentimentoSaude/i.test(sql)&&/consentimento_necessario/i.test(sql),"respostas de saúde exigem consentimento destacado");
ok(/nacionalidade/i.test(sql)&&/estadoCivil/i.test(sql)&&/profissao/i.test(sql)&&/'rg'/i.test(sql)&&/'cpf'/i.test(sql)&&/'logradouro'/i.test(sql),"servidor exige qualificação e endereço do contratante");
ok(/responsavel_legal_necessario/i.test(sql)&&/interval '18 years'/i.test(sql),"menor exige responsável legal");
ok(/cpf_invalido/i.test(sql)&&/generate_series\(1, 9\)/i.test(sql),"CPF recebe validação de dígitos também no servidor");
ok(/assinatura_necessaria/i.test(sql)&&/aceite_necessario/i.test(sql),"modo configurado exige aceite ou assinatura");
ok(/documento_texto/i.test(sqlHard)&&/documento_divergente/i.test(sqlHard)&&/snapshot_hash/i.test(sqlHard)&&/conteudo_hash/i.test(sqlHard),"texto exibido e hashes canônicos ficam preservados");
ok(/89504e470d0a1a0a/i.test(sqlHard)&&/49484452/i.test(sqlHard)&&/49454e44/i.test(sqlHard),"assinatura desenhada exige PNG estruturalmente íntegro");
ok(/lower\(regexp_replace\(v_assinatura->>'nome'/i.test(sqlHard)&&/'tipo',case when v_menor/i.test(sqlHard),"signatário é vinculado ao aluno ou responsável legal");
ok(/v_generico\s*:=\s*p_dados\s*-\s*'nutricaoV1'/i.test(sqlHard)&&/where token\s*=\s*t and revogado_em is null/i.test(sqlHard),"retorno genérico não contorna a validação da nutrição");
ok(/revoke all on function public\.app_nutricao_estado\(text\) from public, anon, authenticated/i.test(sqlHard),"ACL das RPCs de nutrição remove concessões antigas");
ok(setup.includes(sqlBase.trim())&&setup.includes(sqlHard.trim()),"instalação integral contém as duas migrations exatas");
console.log(n+" garantias de backend verificadas.");
