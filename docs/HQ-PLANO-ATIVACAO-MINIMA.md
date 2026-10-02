# HQ — plano de ativação mínima

**Preparação local, sem aplicação de SQL, publicação ou alteração de acesso.** Base desta preparação: `b05222a2852bd1e96d9a91804d3cd5bdd4f59d22`, branch `local/hq-backend-preparation`. Projeto indicado para uma eventual aprovação futura: `hdcufkaalxfhwmfwoiqp`. Esse identificador no manifesto não configura conexão nem seleciona automaticamente um banco.

A referência publicada permanece **mt-v851**. A publicação do frontend não instalou o backend OPS proposto. Esta etapa não consultou dados de produção, não aplicou migrations e não verificou novamente o ambiente remoto. Os arquivos locais de indicações e portal receberam correções de contrato que **ainda não foram publicadas**; a versão v851 não comprova que essas correções estejam no site.

## Escopo dos pacotes

| Pacote isolado | Conteúdo permitido | Estado de ativação |
| --- | --- | --- |
| `supabase/releases/hq-admin-minimal` | Uma migration OPS, manifesto e dois scripts de suspensão/retomada | Preparado para revisão; somente administradores já existentes; `staff_enabled=false` |
| `supabase/releases/hq-referrals-optional` | Migration histórica do ledger, patch aditivo de pagamento, manifesto e seus dois scripts de suspensão/retomada | Opcional, aprovação separada, campanha desligada; ativação bloqueada enquanto faltarem frontend corrigido e homologação |
| `supabase/releases/hq-influencer-optional` | Uma migration do portal, manifesto e seus dois scripts de suspensão/retomada | Opcional e bloqueado; depende do ledger e de seu patch, sem copiá-los ou aplicá-los automaticamente |

O mínimo não contém ledger, portal, campanha, convites ou cadastro de equipe. As tabelas futuras de equipe/escopo existem no contrato OPS, mas a instalação não insere pessoas nem habilita esse acesso. O contrato de dados OPS mínimo permanece compatível com a central publicada v851; essa compatibilidade não substitui o teste HTTP após uma eventual aplicação autorizada.

As operações OPS são registros administrativos: baixa manual não movimenta dinheiro; resposta ao cliente permanece rascunho sem entrega; cancelamento de assinatura é pedido rastreável, sem cancelar cobrança ou acesso externo. Atendimento cobre a fila nova; o histórico legado continua pendente de integração. Fontes indisponíveis não são saldo zero.

## Alcance exato de uma futura autorização mínima

Projeto pretendido: **metodo-torque**, ref **hdcufkaalxfhwmfwoiqp**, região **sa-east-1**. Confirmar a identidade e o histórico por leitura autorizada antes da aplicação. Não há conexão configurada por estes artefatos.

A parte estrutural cria o schema privado `torque_hq` e 14 tabelas: `settings`, `staff`, `staff_account_scope`, `leads`, `invoices`, `payments`, `expenses`, `expense_payments`, `incidents`, `cases`, `case_messages`, `subscription_requests`, `commands` e `audit`. Há RLS nas tabelas e revogação do acesso direto pelos papéis API. Não copia históricos nem cria usuários.

A parte de acesso persistente publica **`public.hq_ops_snapshot()`** e **`public.hq_ops_command(jsonb)`**, com EXECUTE concedido a `authenticated`, mas com autorização interna em cada chamada: somente usuários já registrados em `public.saas_admins` entram no modo mínimo. `PUBLIC`, `anon` e `service_role` são revogados explicitamente. As funções usam SECURITY DEFINER e search_path vazio, com referências qualificadas; o proprietário instalador deve permanecer confiável. Portanto, esta é também uma ampliação persistente das operações disponíveis ao admin existente, e não apenas criação de tabelas.

Após aprovação, aplicação e smoke HTTP satisfatórios, o admin poderá registrar leads, cobranças/despesas e baixas **manuais**, novos chamados/notas/rascunhos, incidentes e pedidos de cancelamento, com comandos idempotentes e auditoria. Poderá consultar os fatos limitados de contas existentes e os registros novos nos gráficos, tabelas e relatórios. Não receberá dados de saúde por esta API. Nenhum gateway movimentará dinheiro e nenhuma mensagem será enviada. Churn, assinaturas ativas, MRR, aquisição/conversão, uso ativo e históricos externos continuarão indisponíveis quando faltar sua fonte.

O gate `staff_enabled=false` e a ausência de novos cadastros mantêm equipe, parceiros e usuários comuns sem acesso. Comandos administrativos de concessão de escopo de suporte existem no contrato, mas não são executados pela instalação e não habilitam pessoas ou o gate. A eventual habilitação de equipe/escopos exige decisão separada.

A suspensão é **não destrutiva**: remove as duas RPCs do schema público e revoga execução, conservando dados, auditoria e vínculos. O reload precisa ser confirmado no PostgREST. A retomada restaura as mesmas funções e força equipe desativada. Nenhum script apaga ou restaura por cópia os dados; backup e restauração de desastre continuam um pré-requisito operacional separado. Não interrompe efeitos externos ou uma operação já autorizada em andamento.

É possível preparar/aplicar esse mínimo sem alterar MFA, sessões ou configuração Auth remota. Isso preserva a política atual; não adiciona garantia de AAL2 nem revogação imediata de JWT após logout. Essas limitações devem constar da decisão futura, sem descrever os testes SQL como prova de autenticação real.

## Fontes e nomes reais

Os nomes abaixo foram gerados pela **Supabase CLI 2.118.0**, em diretórios isolados, e copiados como templates vazios para os respectivos pacotes. O gerador local não inventa versões nem executa a CLI.

| Destino no pacote | Fonte canônica |
| --- | --- |
| `hq-admin-minimal/migrations/20260930225233_hq_ops_admin_minimal.sql` | `supabase/hq-ops-proposal.sql` |
| `hq-referrals-optional/migrations/20260930193716_hq_referrals_ledger.sql` | Migration histórica de mesmo nome em `supabase/migrations` |
| `hq-referrals-optional/migrations/20260930225240_hq_referrals_payment_contract.sql` | `supabase/hq-referrals-payment-contract-proposal.sql` |
| `hq-influencer-optional/migrations/20260930225318_hq_influencer_portal_contract.sql` | `supabase/hq-influencer-portal-proposal.sql` |

As evidências de geração da CLI ficam fora do repositório, no diretório de trabalho `hq-cli-isolated`, nos arquivos `hq-ops-generation-evidence.json`, `hq-referrals-generation-evidence.json` e `hq-influencer-generation-evidence.json`. Esses registros são evidência de criação dos nomes, não de aplicação no banco.

A migration histórica não deve ser editada. Seu SHA-256 canônico UTF-8/LF, correspondente aos bytes do Git na base b052, é:

```text
b98a9a3933b6a8fab8c0ed0d938e5ea0d6dd48cc34fcaf95d1f9164acc7957d7
```

O gerador compara esse hash antes de qualquer escrita e não regrava a fonte histórica. CRLF do checkout é normalizado somente nas cópias do pacote; os hashes medem os bytes LF efetivamente distribuídos. A presença da migration histórica no Git ou no pacote não comprova que ela esteja aplicada no projeto. Se já estiver instalada, não reaplicá-la.

## Preparar e conferir localmente

O helper usa apenas arquivos e módulos internos do Node. Não lê credenciais, não acessa rede, não executa SQL, não altera Git e não cria configuração Supabase. Sem `--write`, apresenta ajuda e não grava nada:

```text
node tools/hq-ops/build-activation-package.cjs
node --check tools/hq-ops/build-activation-package.cjs
```

Para preencher o template OPS já criado pela CLI e produzir seu manifesto/rollback:

```text
node tools/hq-ops/build-activation-package.cjs --write --ops-file 20260930225233_hq_ops_admin_minimal.sql
```

Somente depois de estabilizar e testar também as fontes e rollbacks opcionais, a preparação dos três pacotes pode usar:

```text
node tools/hq-ops/build-activation-package.cjs --write --ops-file 20260930225233_hq_ops_admin_minimal.sql --ledger-file 20260930225240_hq_referrals_payment_contract.sql --portal-file 20260930225318_hq_influencer_portal_contract.sql
```

Esse comando continua sendo exclusivamente local. Passar uma opção não autoriza ativação. O portal registra `activationBlocked=true`, `externalPrereqsAuth=true`, `frontendReleaseRequired=true` e `uiEnabled=false`. O ledger opcional também registra bloqueio, publicação futura necessária e `campaignEnabled=false`.

O helper valida o lote inteiro antes da primeira escrita. Aceita somente basenames SQL estritos e arquivos CLI existentes; recusa versões repetidas, caminhos externos, symlinks/junctions, hard links, arquivos extras e conteúdo divergente. O mínimo admite exatamente um SQL em `migrations`. As cópias já idênticas permitem repetição sem regravação. Um arquivo não vazio diferente não é substituído: resolver a divergência por revisão explícita, sem limpar automaticamente o diretório. Erro ou interrupção na gravação não equivalem a pacote validado; conferir novamente todas as allowlists e hashes antes de utilizá-lo.

A regra restrita em `.gitattributes` mantém `supabase/releases/**` em LF inclusive em checkout Windows com `core.autocrlf=true`. Uma extração do índice em diretório temporário confirmou os hashes dos dez SQL distribuídos (quatro migrations e seis rollbacks). As fontes históricas fora dos pacotes permanecem intactas.

Cada manifesto informa base, projeto indicado, modo, fontes, nomes, SHA-256, efeitos, dependências e bloqueios. A leitura para validação deve seguir o manifesto; não localizar uma migration por ordem alfabética nem aplicar todo o diretório geral `supabase/migrations`.

### Evidência local desta preparação

- Sintaxe e ajuda do helper aprovadas, sem escrita no modo padrão. Onze verificações em fixture temporária aprovaram cópia LF, repetição idêntica, allowlist mínima e recusas de caminho externo, SQL extra, conteúdo divergente, hard link, junction e template CLI ausente/removido. As fixtures foram descartadas.
- `node tests/test-hq-backend-activation.js --require-package`: **17 grupos aprovados em PGlite**, consumindo a migration OPS versionada `20260930225233_hq_ops_admin_minimal.sql`, o manifesto e seus rollbacks. Isso inclui preservação dos dados e os estados de suspensão/retomada; não comprova execução remota ou reload HTTP.
- `node tests/test-hq-optional-suspension.js`: **20 grupos aprovados executando os dois pacotes opcionais versionados e seus quatro rollbacks**. O runner exige manifests, flags, allowlists, árvore exata, fontes LF e SHA-256, sem fallback silencioso para fontes canônicas. A conferência dos três pacotes confirmou allowlists `[1, 2, 1]` e dois rollbacks em cada um. A prova permanece em PGlite, sem Auth HTTP ou concorrência real.
- Homologação HTTP/Auth, MFA, entrega de convites, gateways, publicação dos consumidores corrigidos e aplicação remota permanecem gates separados.

## Gates antes de decidir pela ativação mínima

1. **Congelar os artefatos revisados.** Registrar commit final, hashes, resultado do CI e a allowlist de um SQL OPS. Confirmar que a migration histórica permaneceu intacta e que não houve publicação ou bump de cache nesta preparação.
2. **Testar instalação e autorização em banco descartável.** Usar as fontes canônicas e, depois, o SQL realmente listado no manifesto. Administrador existente deve operar; anon, usuário comum, metadata forjada e equipe desabilitada devem ser negados. Conferir idempotência, saldo AR/AP, escopo de suporte, locks e auditoria com fixtures sintéticas.
3. **Testar o rollback do pacote.** `node tests/test-hq-backend-activation.js --require-package` exige o manifesto e verifica o pacote OPS. Executar também `node tests/test-hq-ops-sql.js`, `node tests/test-hq-unified-sql.js` e o teste de concorrência PostgreSQL conforme os pré-requisitos de `HQ-HOMOLOGACAO-LOCAL.md`. PGlite não substitui PostgreSQL concorrente nem Auth/PostgREST.
4. **Resolver a homologação HTTP/Auth.** Validar JWT real, assinatura, expiração, revogação de papel/sessão, troca de usuário, resposta atrasada, schemas privados e reload do PostgREST. OPS não promete revogação imediata de sessão nem MFA enquanto a regra correspondente e seus testes não existirem. Não transformar identidade simulada por `set_config` em evidência de login real.
5. **Conferir as dependências do projeto pretendido por leitura autorizada.** Confirmar identificador, histórico de migrations, `public.saas_admins`, `public.academias`, `public.saas_clientes`, Auth e papéis técnicos esperados; não criar usuários, ampliar permissões ou extrair registros pessoais para essa conferência. Verificar ausência de instalação OPS parcial/conflitante e disponibilidade de backup/restauração.
6. **Submeter a ação concreta para autorização.** Apresentar somente o SQL OPS versionado, hashes, efeitos, dependências, plano de suspensão/retomada e evidências. A decisão mínima não inclui equipe, ledger, portal, gateway ou convite. A aplicação remota é uma etapa futura separada; este documento não fornece nem executa um comando de aplicação em lote.

O SQL de instalação OPS não é uma rotina de reinstalação: reaplicação pode falhar com `42P07`. Respeitar o histórico de versão e interromper a ferramenta no primeiro erro, com rollback da transação. Nunca continuar executando comandos depois de erro para tentar obter uma instalação parcial.

## Suspensão e retomada

Os scripts estão em `supabase/rollback` e são copiados com hash para `rollback/` de cada pacote. Não são migrations adicionais para execução automática.

| Ação OPS | Efeito e verificação necessária |
| --- | --- |
| `hq-ops-suspend.sql` | Retira somente as duas RPCs OPS do schema público, preserva dados/auditoria/equipe/escopos e solicita reload do PostgREST. Depois, conferir por HTTP que as RPCs não estão disponíveis e que apenas admin autorizado tem o fallback legado esperado. |
| `hq-ops-resume.sql` | Restaura as duas RPCs e seus grants restritos, com `staff_enabled=false`, inclusive se antes estivesse true. Conferir admin autorizado, negação de usuário comum/anon/staff e ausência de duplicação. |

Os scripts recusam estados ausentes, ambíguos ou mistos; não descartam funções para corrigir colisões. Repetição em estado válido é testada. `NOTIFY pgrst` solicita reload, mas seu processamento HTTP precisa de confirmação externa ao teste SQL. Se a ferramenta falhar, parar e verificar o rollback integral.

Nos opcionais, a ordem é obrigatória: **suspender portal antes do ledger; retomar ledger antes do portal**. O ledger recusa suspensão com wrappers do portal ativos; o portal recusa retomada quando o ledger está suspenso. A retomada exige campanha desligada e preserva dados, auditoria e vínculos. Rodar e registrar os testes canônicos desses scripts antes de considerar qualquer pacote opcional revisado. Suspender acesso não resolve isoladamente transações externas já iniciadas.

## Dependências que permanecem abertas

- **Equipe:** ativação de `staff_enabled`, cadastros e escopos de contas exigem decisão separada; a preparação não os concede.
- **Ledger/portal:** o contrato local corrigido exige revisão e publicação futura dos consumidores frontend, reconciliação de versão/precache e gates completos. Nenhuma correção local de limite, status ou contagem deve ser descrita como disponível em v851.
- **Portal:** Auth real, e-mail confirmado, sessões, aceite/revogação e isolamento entre parceiros; criação de conta, entrega de convite e conexão explícita da UI continuam pendentes.
- **Comercial:** Pagar.me primeiro/Asaas alternativa, atribuição confiável e compra antes do fim do trial seguem decisões/integrações próprias. Campanha permanece desligada. Teste de comissão não confirma pagamento real.
- **Operação:** suporte legado, observabilidade de produção e fontes financeiras externas continuam distintas dos registros manuais da central.

Registrar resultados executados no relatório de validação com commit e ambiente. Ajuda do helper, geração de arquivo ou um manifesto válido não comprovam instalação, autenticação HTTP ou funcionamento em produção. A entrega desta etapa é um pacote local revisável e um plano de ativação; qualquer publicação ou aplicação posterior requer a autorização correspondente.
