# Cobrança SaaS opcional — Pagar.me

Implementação técnica com contratação **desligada por padrão**. Este diretório não pertence à fila automática de migrações. O estado de implantação deve ser conferido no registro da release; código e publicação não comprovam homologação do lojista.

## Ordem e fronteira

1. `20261006161032_personal_billing_saas_optin.sql`: ledger privado, reserva de tentativa, vínculos, faturas, recibos, reconciliação e fila de cancelamento após exclusão da conta.
2. `20261006162018_personal_billing_access_optin.sql`: exige a RPC `minha_assinatura`, o diff de confiabilidade de 26/09, `dados` e `app_aluno`. Preserva a implementação anterior em schema privado; o wrapper só substitui a vigência de contas vinculadas ao novo SaaS. Benefícios administrativos prevalecem.
3. `20261006163141_personal_signup_product.sql`: cadastro atômico de uma nova conta Personal e de sua classificação protegida, sem primeiro aluno e sem reclassificar contas existentes. Deve preceder a publicação do novo `assets/modulo-conta.js`.

`rollback-before-activation.sql` só funciona com ledger financeiro completamente vazio. Restaura o corpo original de `minha_assinatura` e suas permissões, remove os três guards e o schema novo, preservando o cadastro independente. Recusa até um recibo de evento sem conta. Não é um procedimento de cancelamento nem deve ser usado depois de começar a contratar.

O segundo arquivo protege INSERT/UPDATE do documento `mtapp:ptStudio` e das publicações de contas Personal conhecidas, inclusive os caminhos RPC/fallback que escrevem nessas tabelas. Reproduz os estados bloqueados da política existente também para quem nunca iniciou checkout. A coorte Personal é registrada pela presença/criação do documento; apagá-lo não remove essa classificação. Não identifica produto por um campo editável do pacote.

Nova contratação exige `saas_clientes.tipo='personal'`, classificação protegida no servidor. Academia, Nutri e cadastro sem tipo não compram o plano Personal; uma assinatura já vinculada continua consultável/cancelável mesmo se a classificação mudar. Somente conta em trial, sem outro provedor/benefício/bloqueio administrativo, pode iniciar contratação. O novo cadastro Personal atômico fica em sua migração própria.

Leituras, exportação, DELETE, aluno autenticado por token e revogação estritamente validada continuam disponíveis. Não é um bloqueio universal de todos os módulos: ver o inventário de cobertura em `docs/personal/`. A função não altera preço, assinatura legada, benefícios, alunos ou campanha de indicação.

## Configuração exclusiva do SaaS

As funções não reutilizam `PAGARME_SECRET_KEY` do gateway legado de alunos.

| Variável do servidor | Finalidade |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Auth e ponte RPC interna; nunca expostas ao navegador |
| `PERSONAL_BILLING_ENVIRONMENT` | `test` ou `live`; não aceita chave de teste em produção |
| `PERSONAL_BILLING_MERCHANT_ID` | Identificador `acc_...` do lojista; vincula eventos e registros ao ambiente |
| `PERSONAL_BILLING_PLAN_ID` | Plano consultado e validado: BRL, mensal, pré-pago, 4990 centavos, sem trial adicional |
| `PERSONAL_BILLING_SECRET_KEY` | Chave exclusiva; teste `sk_test_...`, produção `sk_...`/`sk_live_...` |
| `PERSONAL_BILLING_PUBLIC_KEY` | Tokenização direta; teste `pk_test_...`, produção `pk_...`/`pk_live_...` |
| `PERSONAL_BILLING_NEW_SUBSCRIPTIONS_ENABLED` | Somente o literal `true` habilita novas contratações |
| `PERSONAL_BILLING_HOMOLOGATED` | Deve permanecer ausente/false até a homologação real; também necessário para contratar |
| `PERSONAL_BILLING_WEBHOOK_AUTH` | `basic` para Basic HTTP; caso contrário, header dedicado `x-personal-billing-secret` |
| `PERSONAL_BILLING_WEBHOOK_USER` | Usuário obrigatório no modo Basic |
| `PERSONAL_BILLING_WEBHOOK_SECRET` | Segredo com pelo menos 32 caracteres; formato de entrega deve ser homologado no painel |
| `PERSONAL_BILLING_RECONCILE_SECRET` | Bearer separado, pelo menos 32 caracteres, para o reconciliador interno |

O endpoint API v5 usado é `https://api.pagar.me/core/v5` nos dois ambientes, com separação pelas chaves. Não é o host específico de links de pagamento. Depois de ativado, desligar novas vendas não desliga consulta/cancelamento de assinaturas existentes.

## Endpoints

`personal-billing`: POST JSON e sessão Supabase real no header Authorization. Auth valida o JWT; a RPC confere a sessão ainda presente/não expirada e o dono atual. As ações são:

- `config`: retorna disponibilidade, preço, prazo e chave **pública** somente quando contratação estiver habilitada.
- `accounts`: academias do dono atual, com `id`, `nome`, `createdAt`.
- `status`: requer `academiaId`; a consulta pode reconciliar uma tentativa pendente. `attemptId` opcional não muda o vínculo: o ID retornado é sempre o persistido.
- `checkout`: `academiaId`, `attemptId` UUID, `cardToken` tokenizado diretamente e `customer` com nome, e-mail e endereço de cobrança; documento e telefone opcionais. IDs do provedor, plano, preço, política e validade enviados pelo cliente são rejeitados.
- `cancel`: requer `academiaId`, consulta e confirma o vínculo antes da solicitação e revalida a autorização antes do DELETE. Repetição explícita continua na mesma assinatura. Falha ambígua permanece `cancel_pending`.

O status contém `managed`, `state`, `accessKind`, `trialEndsAt`, `graceEndsAt`, `paidThrough`, `accessUntil`, `accessActive`, `canCancel`, `renewalCanceled`, `attemptId`, `retryAllowed`, `paymentIssue` e `checkedAt`. `pending`/`cancel_pending` usam HTTP202. Erros usam `{ok:false,error,message}` sem devolver resposta bruta do provedor.

Falha comprovada antes da reserva retorna `error:'checkout_not_started',attemptNotStarted:true,retryable:true`; somente essa certificação permite descartar o marcador local. Timeout da RPC de reserva já é ambíguo e nunca recebe essa certificação. Ausência de tentativa numa consulta isolada também não autoriza reenviar.

`personal-billing-webhook`: POST autenticado por segredo configurado. Nenhuma assinatura SHA1 de API antiga é presumida. O evento é um sinal: a função consulta assinatura/fatura/cobrança na API v5 antes de atualizar o ledger. Evento repetido é deduplicado; hash diferente para o mesmo ID é conflito. Nenhum payload de evento ou URL de retorno concede acesso.

`personal-billing-reconcile`: POST com Bearer de serviço específico. Processa até 20 contas por chamada, ordenadas pela última tentativa, incluindo exclusões pendentes. Tentativas e conferências bem-sucedidas têm instantes distintos; uma falha recorrente não fica eternamente na frente da fila nem fabrica uma conferência concluída. Deve ser agendado e monitorado **antes** da ativação comercial, em intervalo de até cinco minutos, repetindo lotes quando necessário. Nenhum agendamento está criado neste pacote. A validade de acesso é calculada pelo relógio do banco e expira mesmo se esse processo ou o webhook parar.

As três funções fazem sua própria autorização. A configuração de verificação JWT da plataforma precisa permitir os endpoints webhook/reconcile com as credenciais próprias; isso deve ser explícito no deploy, nunca presumido. Publicar com os gates desligados não habilita contratação.

## Garantias e recuperação

- Reserva atômica antes do primeiro POST financeiro, exclusão mútua e ID estável; não depende do TTL de idempotência do gateway.
- Token/PAN/CVV e perfil do cliente não são gravados no ledger. O cartão é associado ao cliente por token + endereço, depois a assinatura usa `card_id`.
- Timeout de criação de assinatura não autoriza outro POST: reconciliar por `code=tp_<attemptId>` e cliente vinculado. Se a pesquisa continuar vazia, a tentativa fica pendente e precisa investigação; ausência em uma consulta não prova que a requisição anterior não chegará.
- Reconciliação usa lease vencível. Um leitor atrasado não pode sobrescrever o leitor posterior. A lista de faturas é paginada com limite explícito; truncamento ou desaparecimento de fatura conhecida impede commit.
- Fatura paga precisa de cobrança capturada, IDs vinculados, valor exato e período finito. A falta de webhook não transforma `active` em pagamento.
- Renovação recusada não remove o período anteriormente pago. Cancelamento confirmado interrompe renovação e mantém o período válido. O DELETE envia `cancel_pending_invoices:true` explicitamente.
- Estorno, disputa e estados financeiros que exigem revisão retiram a validade da fatura afetada e não podem ser revertidos por um snapshot `paid` antigo. Outros períodos válidos continuam considerados. Revisão administrativa não executa reembolso nem novo débito automaticamente.
- Exclusão da academia não é bloqueada por FK financeira. Um tombstone com UUID e identificadores do provedor mantém a tarefa de cancelamento. Se o POST estava em voo, a tarefa primeiro recupera a assinatura pelo código reservado; somente depois confirma seu cancelamento. O histórico técnico de cobrança permanece privado, sem dados de aluno, cartão ou perfil pessoal. O prazo de retenção e o processo administrativo de eliminação/anônimização precisam ser definidos na operação; este pacote não inventa prazo jurídico.

O ledger implementado mantém uma assinatura por academia. Nova contratação após cancelamento de uma assinatura já vinculada exige um fluxo de substituição/reentrada explícito; não se cria outra assinatura por retry. A indicação permanece desligada: o core existente calcula desconto de um ciclo, mas este endpoint não aceita campanha/cupom do navegador e só registra 4990 centavos enquanto a campanha estiver inativa.

## Verificação e ativação

`tests/test-personal-billing-integration.js` usa PostgreSQL descartável real e transportes de Auth/provedor simulados: reserva/timeout, repetição, pagamento/renovação/cancelamento/estorno, ACL operacional, leases, revogação, vigência, preservação do legado e exclusão durante POST. A suíte independente e `tests/hq-auth-ci` acrescentam isolamento e Auth/PostgREST reais no CI. Nenhum teste deste pacote fez cobrança ou enviou mensagem a cliente.

Antes da ativação financeira: concluir cadastro do lojista, configurar chaves no cofre, confirmar os campos reais da API e os domínios da tokenização, testar 14 dias completos/virada de data, primeira fatura e renovação, recusa, timeout, cancelamento, estorno e exclusão em voo; homologar a autenticação do webhook; instalar e monitorar o reconciliador e definir a operação de revisão/retencão. Só depois habilitar os dois gates. A abertura de conta não substitui essas evidências.

Fontes primárias consultadas em 06/10/2026: [Auth v5](https://docs.pagar.me/reference/autentica%C3%A7%C3%A3o-2), [cartão por token e endereço](https://docs.pagar.me/reference/criar-cart%C3%A3o), [assinaturas](https://docs.pagar.me/reference/criar-assinatura-de-plano-1), [SDK oficial com card_id/card_token na raiz](https://github.com/pagarme/pagarme-java-sdk/blob/main/doc/models/create-subscription-request.md), [cancelamento](https://docs.pagar.me/reference/cancelar-assinatura-1), [webhooks](https://docs.pagar.me/docs/webhooks). A descrição/OAS de criação de assinatura é incompleta sobre os identificadores alternativos do cartão; a compatibilidade efetiva ainda deve ser confirmada no ambiente do lojista.
