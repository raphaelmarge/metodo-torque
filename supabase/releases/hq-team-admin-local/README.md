# Equipe: pacote incremental local

Preparação não aplicada, base `fe49263d36afc88dbcf853e327c43ab3a936a3de`. O `manifest.json` é a allowlist deste pacote; seus hashes usam UTF-8 com LF. A migração única `20260930232737_hq_team_registry.sql` copia a proposta canônica usando o nome do template real gerado pela CLI. O template original permanece intacto.

Este pacote depende de OPS já instalado, das duas RPCs OPS públicas íntegras e de `staff_enabled=false`. Não instala automaticamente nenhuma dependência, ledger, portal ou pacote anterior. A instalação e as RPCs de cadastro não criam Auth users, funcionários efetivos, escopos, convites ou grants pessoais. Perfil aprovado continua sendo proposta administrativa.

Antes de qualquer aplicação futura, revisar o [contrato completo](../../../docs/HQ-EQUIPE-CONTRATO.md), os arquivos e hashes do manifesto, o ambiente de destino e as evidências disponíveis. A autorização desta entrega cobre preparação e testes locais. Não aplicar usando o diretório global de migrations; não executar `db push` global nem misturar os pacotes opcionais.

Fluxo de recuperação:

1. Suspender Equipe com `rollback/hq-team-suspend.sql` antes de suspender OPS. As RPCs saem do schema público; tabelas, auditoria e OIDs permanecem preservados. Também é possível suspender Equipe se OPS já estiver suspenso.
2. Retomar OPS antes de Equipe. `rollback/hq-team-resume.sql` exige ambas as RPCs OPS ativas, restaura os mesmos OIDs e mantém `staff_enabled=false`.
3. Confirmar via HTTP no ambiente autorizado: administrador existente permitido; anon, usuário comum, staff e service_role negados; fonte indisponível durante suspensão. A entrega local de `NOTIFY` não comprova recarga do PostgREST.

Instalação, suspensão e retomada verificam a allowlist completa dos nomes reservados públicos/privados no catálogo PostgreSQL. Sobrecargas, aliases legados, nomes intermediários, dependências ausentes, colisões ou estado parcial são recusados atomicamente, preservando gate, dados, OIDs e ACLs, sem `NOTIFY`. Os scripts não alteram permissões de funções desconhecidas nem apagam tabelas. Uma suspensão recusada não encerrou os acessos; revisar a divergência antes de tentar novamente. Repetição completa dos procedimentos, com o contrato íntegro, não duplica dados. Instalação canônica repetida é recusada atomicamente; recuperação usa os scripts próprios.

Validação local reproduzível:

```text
node tests/test-hq-team-registry-sql.js
node tests/test-hq-team-activation.js
```

Executar na raiz do checkout com o runtime de testes disponível. PGlite usa somente fixtures sintéticas e não valida Auth HTTP nem concorrência entre conexões reais. Consulte o contrato para resultados e limites da revisão atual.
