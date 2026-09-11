# Liberação da avaliação postural — 11/09/2026

O usuário autorizou a publicação no GitHub e Supabase nesta etapa. O documento de revisão anterior registra o estado histórico antes dessa autorização; não é comprovante de deploy.

## Alteração adicional

A migração complementar `20260911033500_personal_postural_account_cleanup.sql` impede que a nova tabela bloqueie a exclusão já existente da conta ou academia. As chaves estrangeiras passam a excluir somente os snapshots relacionados. O teste isolado `test-postural-lifecycle.js` verifica que outro autor e outra academia são preservados.

O workflow `postural.yml` executa separadamente geometria, RLS em PGlite, ciclo de vida e o editor no Chromium/IndexedDB. As suítes completas existentes continuam sem redução ou desativação.

## Retenção operacional desta versão

Registros permanecem até exclusão explícita da avaliação ou exclusão da conta/academia. Inativar o aluno preserva seu histórico. Remoção administrativa definitiva de um aluno requer também a remoção de seu arquivo postural pelos responsáveis pela operação; não há promessa de cascata ao editar o JSON ptStudio. A cópia de outros aparelhos offline e arquivos PNG exportados não podem ser apagados remotamente pelo navegador atual. Backups administrativos seguem a retenção da operação.

A exclusão com envio pendente continua conservadora: sem confirmação do servidor, a cópia local é preservada e a interface não declara sucesso. O usuário pode tentar novamente a sincronização e depois excluir, ou solicitar reconciliação administrativa. Não há exclusão silenciosa de fotos nem limpeza automática de registros órfãos.

## Critérios e evidências

Conferir o head exato e os resultados de CI antes do merge. Aplicar as duas migrações e verificar RLS, privilégios, validação e inserção/leitura/exclusão com registros sintéticos em transação revertida. Nenhuma foto ou credencial real deve entrar em logs, commits ou exemplos. Conferir a publicação de mt-v821 nos três arquivos de versão e no workflow Pages.

Testes em Chromium não equivalem a câmera/Safari de iPhone ou Android físicos. A liberação não deve ser descrita como teste em aparelhos reais. Confirmar versões/recursos publicados sem prometer homologação de hardware não executada.
