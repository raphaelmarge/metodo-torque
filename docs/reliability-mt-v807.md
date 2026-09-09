# mt-v807 — validação de confiabilidade

## Correções da revisão de 09/09/2026

A primeira migração foi reprovada em PostgreSQL real: BEFORE INSERT apagava
base_atualizado antes de ON CONFLICT DO UPDATE. Nenhuma alteração dessa versão
foi aplicada ao banco de produção. A revisão preserva EXCLUDED até o UPDATE,
valida inclusões reais separadamente e usa revisões monotônicas do servidor.

A publicação de Personal também compara sourceUpdatedAt com ptStudio no banco,
com lock da fonte. Clientes antigos sem revisão são recusados. A interceptação
JavaScript foi restrita ao Personal; antes bloqueava Nutri/Academia sem ptStudio.

A revogação real também apaga dados, login e senha. A barreira permite essa
limpeza somente com acesso cortado, pacote NULL e aluno/academia inalterados.
Pacote ativo não pode ser apagado sem revisão, nem pacote sem revisão pode ser
escrito usando revogado_em como atalho. A reativação continua exigindo republicar.

Conflitos guardam cópia local; logout remove apenas o aviso da sessão e mantém
os backups separados por academia. Sucesso de gravação exige persistência real.

Questionários: ação Usar como base cabe no celular. Os testes abrem o formulário
somente quando fechado e aguardam o término do salvamento antes de criar outra
pergunta. A geração opcional de screenshots não altera o estado do teste.

## Evidências exigidas antes de publicar

- Testes gerais de navegador sobre o SHA final do PR, sem reduzir as suítes.
- tests/test-sync-cas.js: 17 cenários simulados de concorrência e publicação.
- tests/test-sync-identidade.js: 13 cenários de identidade e reconexão.
- tests/test-sync-cas-sql.js: 15 contratos estáticos, não execução do banco.
- tests/sql/test-reliability.py: PostgreSQL real descartável, duas conexões,
  upsert, publicação, RLS, histórico e funções canônicas do aluno; testa corte
  e devolução de acesso, faxina e retorno sequencial com mescla de listas.
- Migração idêntica à definição de instalação nova em supabase-setup.sql.
- Testes de versão para frontend e os dois service workers.

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
