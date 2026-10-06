# Assinatura web: Pagar.me e 14 dias completos

Decisões do responsável em 06/10/2026: usar Pagar.me e cobrar somente depois dos 14 dias grátis. O responsável ainda não possui uma conta de pagamentos configurada. Isso impede homologação real e lançamento comercial, mas não impede as correções de uso do aplicativo.

## Contrato aprovado

- R$49,90 mensais, cartão recorrente, sem exigir cartão para iniciar o teste.
- A criação canônica da conta inicia o teste. Contratar durante o teste não antecipa a primeira cobrança nem reinicia os 14 dias.
- A assinatura do profissional é independente das cobranças que ele faz de seus alunos. `pagarme` é a função legada dessas cobranças; não deve liberar o acesso SaaS.
- A campanha aprovada permanece operacionalmente desligada: 40% de desconto apenas na primeira mensalidade e comissão única de 40% do preço cheio. Não há transferência automática nem comissão sobre renovação.
- Redirecionamento, `active`, token de cartão, intenção de compra ou pedido de cancelamento não comprovam pagamento/cancelamento.

## Implementação da mt-v855, sem ativação financeira

`supabase/functions/_shared/personal-pagarme.mjs` prepara a requisição a partir de conta, plano e cupom protegidos e inspeciona snapshots consultados no provedor. Valida produto, academia, cliente, assinatura, fatura, charge, moeda, valor e período pago; estados desconhecidos, múltiplas charges, estorno e disputa exigem reconciliação. O período positivo é finito. A suíte `tests/test-personal-pagarme.js` usa apenas fixtures fictícias.

O módulo puro continua separado dos endpoints. Na mt-v855, `personal-billing`, `personal-billing-webhook` e `personal-billing-reconcile` acrescentam checkout autenticado, ledger privado, confirmação canônica, cancelamento, validade finita, recuperação de timeout e tratamento da exclusão de conta. O cadastro tipado identifica Personal no servidor antes do primeiro aluno, sem reclassificar academia/Nutri. A página mantém novas contratações desligadas até configuração e homologação. Testes de fixtures não equivalem à homologação na conta do gateway.

Detalhes e ordem de publicação: [pacote opcional](../../supabase/releases/personal-billing-optional/README.md), [checkout web](PAGARME-CHECKOUT-WEB-20261006.md) e [cobertura de acesso](PAGARME-COBERTURA-ACESSO-20261006.md). O cadastro SQL deve preceder a publicação do novo módulo de conta. Reversão anterior à ativação exige ledger vazio; não apaga registros financeiros após começar a contratar.

## Dependências para ativar

1. Responsável abre/aprova a conta Pagar.me, confirma recorrência por cartão e condições comerciais reais. Chaves de teste/produção devem entrar no cofre do servidor, nunca em chat, frontend, GitHub ou registros.
2. Homologar plano de 4990 centavos/mês e desconto de 1996 centavos por um ciclo, tokenização, dados obrigatórios, criação, renovação, recusa, cancelamento e estorno. Validar datas: a documentação informa que ciclos começam às 00h; a preparação arredonda o início futuro para cima em UTC e **exige homologação dessa data**. Não concede tempo extra de acesso nem presume fuso do merchant.
3. Homologar os endpoints implementados com a conta do lojista: criação, confirmação, cancelamento, duas academias, retomada de tentativa e exclusão durante POST. Contas antigas sem classificação Personal precisam de conferência no HQ antes de contratar.
4. Homologar autenticação do webhook realmente suportada no painel/API v5 e consulta canônica ao provedor. O suporte configurável a Basic não comprova compatibilidade sem teste. Agendar e monitorar o reconciliador antes de habilitar vendas; nenhum agendamento financeiro foi criado por este pacote.
5. Comprovar no provedor que renovação, cancelamento, estorno e expiração respeitam a política implementada. Não usar apenas estado `active` como prova de pagamento. Definir operação para tentativas ambíguas e retenção mínima dos registros financeiros. Nova contratação após assinatura já cancelada ainda exige fluxo explícito de substituição, sem criar outro contrato por retry; operações comerciais fora do núcleo seguem o inventário de cobertura.
6. Para indicações: registrar atribuição no servidor, fechar janela de atribuição, autoindicação/identidade, primeiro pagamento ocorrido em ciclo posterior e calendário/responsável de repasse. Reconciliar estorno/chargeback e auditar repasses. Nenhum parceiro/cupom real foi criado nesta rodada.

## Evidência exigida para remover o bloqueio

Conta sandbox identificada, respostas reais saneadas, data/valor das duas primeiras faturas, recusa sem acesso indevido, timeout sem assinatura duplicada, cancelamento confirmado, estorno/chargeback reconciliado, webhook repetido e invertido, duas academias isoladas e expiração sem depender da entrega do webhook. Sem cobrança real ou mensagens a clientes. Publicação com gates desligados e testes automatizados não removem esse bloqueio de ativação financeira.

## Fontes oficiais consultadas em 06/10/2026

- [Assinaturas e início dos ciclos](https://docs.pagar.me/reference/assinaturas-1)
- [Criação de assinatura de plano](https://docs.pagar.me/reference/criar-assinatura-de-plano-1)
- [Desconto limitado por ciclos](https://docs.pagar.me/reference/desconto-1)
- [Faturas e período](https://docs.pagar.me/reference/faturas-1)
- [Webhooks](https://docs.pagar.me/docs/webhooks)
- [Checkout hospedado: sandbox e limitações de recorrência](https://docs.pagar.me/reference/criar-link)

Checkout recorrente hospedado não oferece split nessa modalidade; o programa de indicações não pode prometer repasse automático por esse recurso. As tarifas reais ainda não foram contratadas.
