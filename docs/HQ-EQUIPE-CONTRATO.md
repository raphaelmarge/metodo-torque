# Equipe do HQ: cadastro administrativo e contrato local

Preparação local de 30/09/2026, branch `local/hq-staff-admin`, base `fe49263d36afc88dbcf853e327c43ab3a936a3de`. A proposta `supabase/hq-team-registry-proposal.sql` é aditiva e depende do OPS existente. Não foi aplicada remotamente nem incluída nos pacotes de ativação anteriores. Os testes de Auth/CI da outra branch não validam esta nova proposta.

O cadastro permite registrar nome, contato, perfil proposto, estado ativo/inativo e revisão administrativa. Somente usuários já presentes em `public.saas_admins` podem consultar ou alterar esses registros. Instalar a proposta não insere funcionários ou usuários Auth, não envia convites e não concede acesso. A instalação recusa um ambiente sem as duas RPCs OPS públicas, com OPS suspenso/parcial ou com `staff_enabled=true`. As RPCs de cadastro não alteram esse gate; os procedimentos explícitos de suspensão/retomada descritos abaixo o forçam para `false`.

## Cadastro, revisão e acesso são estados separados

| Campo | Valores | Significado |
| --- | --- | --- |
| `proposedRole` | `admin`, `finance`, `sales`, `support`, `engineering`, `viewer` | Perfil sugerido para revisão administrativa. Não é uma permissão concedida. |
| `status` | `active`, `inactive` | Situação do cadastro. Não descreve uma sessão Auth. |
| `reviewStatus` | `pending`, `approved`, `rejected` | Resultado da revisão da proposta. `approved` não provisiona acesso. |
| `accessState` | `accessPending`, `disabled` | `active` retorna `accessPending`; `inactive` retorna `disabled`, sempre dentro do escopo deste cadastro. |
| `effectiveAccess` | sempre `false` | Este cadastro nunca concede acesso efetivo. Não é uma auditoria dos acessos que a pessoa possa possuir em outro sistema. |

O identificador do funcionário é um UUID de `torque_hq.team_registry`, sem vínculo com `auth.users`. Um nome ou contato igual ao de um administrador existente não cria ligação automática. Inativar o cadastro também não revoga eventual acesso independente: não há vínculo Auth que permita inferir essa identidade. O administrador efetivo continua sendo exclusivamente o usuário de `saas_admins`; funcionários reais e seu gate não são alterados.

## Leitura: `public.hq_team_snapshot()`

Sem parâmetros. Retorna somente para administrador existente:

```js
{
  schemaVersion: 1,
  currentUserId: "UUID do administrador autenticado",
  permissions: ["team.read", "team.write", "team.review"],
  team: [],
  audit: [],
  sources: {
    team: {
      status: "ready", scope: "administrativeRegistryOnly",
      origin: "torque_hq.team_registry", updatedAt: "instante da leitura"
    }
  },
  meta: {
    accessProvisioningAvailable: false, externalEffect: false,
    scope: "administrativeRegistryOnly", staffGateEnabled: false,
    auditLimit: 100, auditHasMore: false,
    roleMatrixKind: "referenceOnly",
    roleMatrixSource: "torque_hq.permissions + team administrator policy",
    roleMatrix: []
  }
}
```

Os arrays vazios acima descrevem uma instalação sem cadastros. `staffGateEnabled` é lido da configuração real; o módulo não fixa nem modifica o valor. `updatedAt` da fonte indica quando a leitura foi produzida; cada registro tem seu próprio `updatedAt`. Ausência de RPC, falha de rede e negação de acesso devem aparecer como estados indisponível/erro/proibido na interface, sem substituição por lista vazia ou dados de demonstração.

Cada item de `team` contém `id`, `name`, `contact`, `proposedRole`, `status`, `reviewStatus`, `accessState`, `effectiveAccess`, `version`, `createdBy`, `updatedBy`, `createdAt`, `updatedAt`, `reviewedBy`, `reviewedAt`. O array é ordenado por nome e UUID, sem limitar silenciosamente a quantidade de cadastros.

A matriz tem seis itens `{role, permissions: string[], effectiveAccess:false}`. As permissões de referência vêm de `torque_hq.permissions(role)`, acrescentando `team.read/write/review` somente ao administrador. Essa matriz descreve as regras existentes do servidor, não o acesso de uma pessoa cadastrada. O cliente não pode enviar ou editar a matriz.

`audit` contém os últimos 100 eventos, do mais recente ao mais antigo, com `{id,actorId,action,objectId,reason,changedFields,before,after,createdAt}`. Os valores `before`/`after` guardam apenas perfil, estado, revisão e versão; alterações de nome/contato aparecem em `changedFields` sem duplicar esses dados no histórico. `meta.auditHasMore` informa quando o histórico completo excede essa janela; não apresentar essa lista como toda a auditoria.

## Escrita: `public.hq_team_command(p_input jsonb)`

```js
{
  type: "team.create",
  payload: {name: "Nome informado pelo administrador", contact: "", proposedRole: "viewer"},
  reason: "Motivo informado pelo administrador",
  idempotencyKey: "chave-unica-do-envio"
}
```

| Operação | Payload permitido | Regra |
| --- | --- | --- |
| `team.create` | `name`, `contact?`, `proposedRole`, `status?` | Começa com revisão `pending`; estado padrão `active`. |
| `team.update` | `id`, `expectedVersion`, ao menos um de `name`, `contact`, `proposedRole` | Uma alteração real é obrigatória. Volta a revisão para `pending` e limpa seu revisor/data. |
| `team.setStatus` | `id`, `expectedVersion`, `status` | Inativa ou reativa cadastro. Reativar exige nova revisão; não provisiona nem revoga Auth. |
| `team.review` | `id`, `expectedVersion`, `reviewStatus` | Aceita `approved`/`rejected` somente em cadastro ativo com proposta pendente. Revisor é o administrador autenticado. |

`name` exige 2–160 caracteres; `contact` é texto opcional de até 254 caracteres, vazio quando não informado. Não se exige email: pode ser telefone ou outro contato administrativo, sem envio ou verificação externa. `reason` exige 3–500 caracteres e `idempotencyKey` exige 8–128; UUID é aceito como chave, mas não é obrigatório. Textos são aparados e caracteres de controle são recusados. Identificadores são UUIDs; `expectedVersion` é inteiro de 1 a 2147483646. Campos extras, perfil desconhecido, tipo incorreto e tentativas de `userId`, `permissions`, `effectiveAccess`, `accountId`, convites ou mudança do gate são rejeitados no servidor.

Resultado de sucesso:

```js
{
  ok: true, id: "UUID do cadastro", type: "team.create",
  member: { /* registro completo no instante desta operação */ },
  replayed: false, externalEffect: false, accessGranted: false
}
```

Toda escrita exige motivo e chave de idempotência. A chave pertence ao par `(administrador autenticado, chave)`; repetição exata retorna o resultado original com `replayed:true`. Reutilizar a chave com outro conteúdo ou motivo é erro. O resultado original pode preceder edições posteriores; a interface deve recarregar o snapshot após qualquer sucesso ou replay.

Edições usam bloqueio da linha e comparam `expectedVersion` antes de alterar, incrementando a versão a cada comando confirmado. Uma versão obsoleta exige atualização e nova revisão pelo operador; não reenviar automaticamente sobre a versão atual. Reserva de comando, alteração e auditoria pertencem à mesma transação; qualquer erro desfaz o conjunto.

| SQLSTATE | Uso no contrato |
| --- | --- |
| `42501` | Identidade ausente, não administrador ou chamada sem privilégio. A autorização ocorre antes de buscar registros ou replay. |
| `22023` | Entrada, transição ou chave reutilizada inválida; alteração sem efeito. |
| `PT409` (HTTP 409) | Registro alterado desde a versão apresentada. Atualizar a interface e solicitar nova ação do operador. |
| `P0002` | UUID de cadastro inexistente, verificado após autorização. |
| `55000` | Dependência/estado de instalação incompatível ou comando reservado sem resultado confirmado. |

O conflito de versão é uma decisão de negócio, não uma falha transitória de serialização. Não usar SQLSTATE `40001`: o PostgREST 14 pode repetir essa transação indefinidamente; `PT409` encerra a chamada com HTTP 409, preservando o rollback e exigindo nova ação do operador ([referência Supabase](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b)).

## Isolamento e auditoria

As três tabelas novas (`team_registry`, `team_registry_commands`, `team_registry_audit`) possuem RLS, sem acesso direto para `PUBLIC`, `anon`, `authenticated` ou `service_role`. Só as duas RPCs são concedidas a `authenticated`; ambas verificam `auth.uid()` contra `saas_admins`, ignorando claims de perfil, cadastro proposto, equipe real e escopo de academia. Auxiliares não são endpoints públicos e todas as funções fixam `search_path=''`.

O cadastro é administrativo global do HQ. Não existe modo por academia ou acesso a cadastro próprio para funcionários; conhecer UUID, contato ou uma chave usada por outro administrador não concede leitura nem escrita. A auditoria registra ator real, motivo, ação, campos alterados e versões. Nome/contato ficam no cadastro e no resultado privado usado para replay; não são copiados para `before`/`after`. A interface deve orientar a não incluir dados sensíveis desnecessários no motivo livre.

A proposta não altera funções, tabelas de dados, grants ou pacotes OPS existentes. A instalação é deliberadamente não idempotente: reaplicação falha dentro da transação e preserva os registros originais. Suspender o OPS sozinho não é um procedimento de suspensão destas RPCs adicionais. Não usar `DROP TABLE` para desfazer ou perder auditoria.

## Pacote incremental e recuperação preservando dados

O pacote separado `supabase/releases/hq-team-admin-local/` contém apenas a migração `migrations/20260930232737_hq_team_registry.sql`, criada a partir do nome real gerado pela CLI, e cópias dos dois procedimentos de recuperação. O template original da CLI foi somente lido, sem alteração. O manifesto fixa base, estado local não aplicado, allowlist de uma migração, fontes canônicas, UTF-8/LF e SHA256 de cada SQL. O pacote não instala OPS, ledger, contrato de pagamento ou portal. Nenhum pacote anterior nem seu helper foi alterado.

| Procedimento | Comportamento |
| --- | --- |
| `supabase/rollback/hq-team-suspend.sql` | Retira as duas RPCs do schema público, move-as para `torque_hq.suspended_team_snapshot/command`, revoga execução e acesso privado. Preserva os mesmos OIDs, tabelas, dados, auditoria e comprovantes de idempotência. Força `staff_enabled=false`. |
| `supabase/rollback/hq-team-resume.sql` | Exige OPS público ativo e íntegro. Restaura as duas RPCs com os mesmos OIDs, concede entrada apenas a `authenticated`, mantendo a verificação interna de administrador. Força `staff_enabled=false` e preserva os dados. |

Instalação, suspensão e retomada obtêm os locks transacionais `(714882,1)` e `(714882,3)`, nessa ordem, compartilhando o primeiro com a recuperação OPS. Antes das mudanças, os três scripts consultam `pg_proc`/`pg_namespace` e validam todos os nomes reservados `public.hq_team_*`, `torque_hq.suspended_team_*` e `torque_hq.hq_team_*`. Somente os dois pares previstos, com suas assinaturas e atributos esperados, são aceitos. Sobrecarga ou alias legado adicional resulta em `55000`, sem retirar permissões nem alterar a função desconhecida. Uma suspensão recusada não significa que o acesso foi encerrado: o operador deve revisar a divergência antes de tentar novamente.

Dependência ausente, colisão entre funções públicas/privadas, nome intermediário ocupado e estado misto parcialmente suspenso também interrompem a transação. Nas recusas, gate, dados, OIDs e ACLs permanecem intactos e nenhum `NOTIFY` é emitido. Esses casos não são reparados automaticamente. Repetir uma suspensão já completa ou uma retomada já completa, com o contrato íntegro, é seguro e não duplica dados.

A ordem planejada é: instalar OPS antes da Equipe; suspender Equipe antes de OPS; retomar OPS antes da Equipe. A suspensão da Equipe também aceita OPS já suspenso, para permitir encerrar seus endpoints com segurança. A retomada recusa esse cenário. Ambos os procedimentos enviam `NOTIFY` na transação; o operador precisa confirmar a ausência/presença das RPCs e as negativas de acesso via HTTP no ambiente autorizado.

Esse pacote permanece uma preparação revisável. Sua existência não executa SQL nem autoriza aplicação remota. Não usar o diretório global de migrations para aplicar pacotes opcionais por efeito colateral.

## Evidência local e pendências

Executados os verificadores de sintaxe e as duas suítes locais em PGlite descartável, com fixtures sintéticas e dependência do checkout vizinho usada somente para leitura do runtime:

- `node tests/test-hq-team-registry-sql.js`: **105 verificações passaram**, incluindo recusa de instalação com gate habilitado ou OPS suspenso.
- `node tests/test-hq-team-activation.js`: **66 verificações passaram**, incluindo bytes/hashes do pacote versionado, recuperação com mesmos OIDs, preservação de dados/ACLs/idempotência, gate desligado, repetição segura, estados ambíguos e dependências incompletas recusados. A regressão inclui sobrecargas públicas, aliases legados, sobrecargas/aliases privados e nomes intermediários na instalação, suspensão e retomada; todas as recusas preservam dados/gate/OIDs/ACLs/corpos das funções e não emitem notificações.

A cobertura inclui permissões explícitas/RLS, claims forjadas, diferentes perfis e escopos, negação a `anon`/`service_role`, revogação de administrador antes de replay, perfil proposto de administrador sem escalada, edição concorrente por versão obsoleta, idempotência, rollback transacional, reaplicação recusada, ausência de dependência OPS e preservação de Auth/admins/staff/escopos/gate/auditoria OPS.

PGlite não comprova corridas entre conexões independentes, assinatura/expiração JWT, MFA, Auth HTTP ou consumo do `NOTIFY` pelo PostgREST. A entrega local da notificação foi observada; a recarga real continua a validar no ambiente descartável autorizado. A identidade HTTP e a revogação de sessão seguem o contrato atual do backend OPS e não foram ampliadas por esta proposta. A única migração versionada nova está no pacote incremental isolado. Sem execução remota, publicação ou concessão de acesso nesta tarefa.
