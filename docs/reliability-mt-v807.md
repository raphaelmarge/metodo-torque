# mt-v807 — validação de confiabilidade

## Correções da revisão de 09/09/2026

A primeira migração foi reprovada em PostgreSQL real: BEFORE INSERT apagava
base_atualizado antes de ON CONFLICT DO UPDATE. Nenhuma alteração dessa versão
foi aplicada ao banco de produção. A revisão preserva EXCLUDED até o UPDATE,
valida inclusões reais separadamente e usa revisões monotônicas do servidor.

A publicação de Personal também compara sourceUpdatedAt com ptStudio no banco,
com lock da fonte. Clientes antigos sem revisão são recusados. Retorno do aluno,
revogação e formatos de Nutri/Academia são preservados. A interceptação JavaScript
foi restrita ao Personal; antes ela bloqueava outros produtos sem ptStudio.

Conflitos guardam cópia local; logout remove apenas o aviso da sessão e mantém
os backups separados por academia. Sucesso de gravação exige persistência real.

Questionários: ação Usar como base cabe no celular. Os testes abrem o formulário
somente quando fechado e aguardam o término do salvamento antes de criar outra
pergunta. A geração opcional de screenshots não altera o estado do teste.

## Evidências exigidas antes de publicar

- Testes gerais de navegador sobre o SHA final do PR.
- tests/test-sync-cas.js e tests/test-sync-identidade.js: cenários simulados.
- tests/test-sync-cas-sql.js: contratos estáticos, não execução do banco.
- tests/sql/test-reliability.py: PostgreSQL real descartável, duas conexões,
  upsert, publicação, RLS, histórico e RPC canônica de retorno do aluno.
- Migração idêntica à definição de instalação nova em supabase-setup.sql.

## Publicação

Aplicar migrations/20260909_ptstudio_cas_v807.sql somente depois dos testes
verdes e imediatamente antes do deploy do cliente mt-v807. Ler novamente as
funções/triggers no Supabase e confirmar a versão servida pelo Pages.
Não testar gravações em dados de alunos reais.

## Compatibilidade e recuperação

Cliente antigo pode consultar, mas não atualizar o Personal nem publicar pacote
Personal sem a revisão-base. Precisa carregar a versão nova. Não apagar dados
locais nem reinstalar antes de preservar rascunhos pendentes.
Reverter só o frontend não restaura a escrita de clientes antigos: o CAS deve
permanecer ativo para não reabrir perda de dados. Preferir correção adiante.

A proteção cobre o agregado ptStudio e a publicação Personal, não substitui uma
auditoria de todos os caminhos da plataforma nem testes físicos em iPhone/Android.
A main ainda precisa de proteção administrativa com checks obrigatórios.
