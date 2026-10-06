# Assinatura web: Pagar.me e 14 dias completos

Decisões do responsável em 06/10/2026: usar Pagar.me e cobrar somente depois dos 14 dias grátis. O responsável ainda não possui uma conta de pagamentos configurada. Isso impede homologação real e lançamento comercial, mas não impede as correções de uso do aplicativo.

## Contrato aprovado

- R$49,90 mensais, cartão recorrente, sem exigir cartão para iniciar o teste.
- A criação canônica da conta inicia o teste. Contratar durante o teste não antecipa a primeira cobrança nem reinicia os 14 dias.
- A assinatura do profissional é independente das cobranças que ele faz de seus alunos. `pagarme` é a função legada dessas cobranças; não deve liberar o acesso SaaS.
- A campanha aprovada permanece operacionalmente desligada: 40% de desconto apenas na primeira mensalidade e comissão única de 40% do preço cheio. Não há transferência automática nem comissão sobre renovação.
- Redirecionamento, `active`, token de cartão, intenção de compra ou pedido de cancelamento não comprovam pagamento/cancelamento.

## Preparação implementada, sem ativação

`supabase/functions/_shared/personal-pagarme.mjs` prepara a requisição a partir de conta, plano e cupom protegidos e inspeciona snapshots consultados no provedor. Valida produto, academia, cliente, assinatura, fatura, charge, moeda, valor e período pago; estados desconhecidos, múltiplas charges, estorno e disputa exigem reconciliação. O período positivo é finito. A suíte `tests/test-personal-pagarme.js` usa apenas fixtures fictícias.

Este módulo **não é endpoint de checkout/webhook, não mantém ledger transacional, não grava acesso e não faz chamadas financeiras**. O núcleo de indicação e seu ledger opcional continuam separados. A página publica a regra de primeira cobrança e mantém pagamento indisponível. Testes de fixtures não equivalem à homologação na conta do gateway.

## Dependências para ativar

1. Responsável abre/aprova a conta Pagar.me, confirma recorrência por cartão e condições comerciais reais. Chaves de teste/produção devem entrar no cofre do servidor, nunca em chat, frontend, GitHub ou registros.
2. Homologar plano de 4990 centavos/mês e desconto de 1996 centavos por um ciclo, tokenização, dados obrigatórios, criação, renovação, recusa, cancelamento e estorno. Validar datas: a documentação informa que ciclos começam às 00h; a preparação arredonda o início futuro para cima em UTC e **exige homologação dessa data**. Não concede tempo extra de acesso nem presume fuso do merchant.
3. Completar endpoints autenticados de checkout/status/cancelamento e persistência isolada SaaS: dono comprovado da academia, vínculo ao cliente do provedor, tentativa reservada atomicamente e reconciliação de resultado desconhecido antes de repetir criação. Não aceitar preço, academia, status ou prazo definidos pelo navegador.
4. Completar webhook com autenticação compatível com a conta/API v5 e consulta canônica ao provedor. Não reutilizar algoritmo de postback v3 nem confiar em `verified:true` recebido no corpo. Guardar recibos e revisões em transação; eventos repetidos/fora de ordem não podem ampliar acesso nem comissão.
5. Vincular pagamento confirmado a acesso com vencimento efetivo no servidor; falha de renovação, cancelamento e estorno precisam de testes de política e de recuperação. Integrações externas não podem marcar `ativa` sem prazo. Preservar contratos já existentes de vitalícia/cortesia.
6. Para indicações: registrar atribuição no servidor, fechar janela de atribuição, autoindicação/identidade, primeiro pagamento ocorrido em ciclo posterior e calendário/responsável de repasse. Reconciliar estorno/chargeback e auditar repasses. Nenhum parceiro/cupom real foi criado nesta rodada.

## Evidência exigida para remover o bloqueio

Conta sandbox identificada, respostas reais saneadas, data/valor das duas primeiras faturas, recusa sem acesso indevido, timeout sem assinatura duplicada, cancelamento confirmado, estorno/chargeback reconciliado, webhook repetido e invertido, duas academias isoladas e expiração sem depender da entrega do webhook. Sem cobrança real ou mensagens a clientes. Os endpoints e o ledger SaaS só devem ser publicados após essa integração e os testes correspondentes.

## Fontes oficiais consultadas em 06/10/2026

- [Assinaturas e início dos ciclos](https://docs.pagar.me/reference/assinaturas-1)
- [Criação de assinatura de plano](https://docs.pagar.me/reference/criar-assinatura-de-plano-1)
- [Desconto limitado por ciclos](https://docs.pagar.me/reference/desconto-1)
- [Faturas e período](https://docs.pagar.me/reference/faturas-1)
- [Webhooks](https://docs.pagar.me/docs/webhooks)
- [Checkout hospedado: sandbox e limitações de recorrência](https://docs.pagar.me/reference/criar-link)

Checkout recorrente hospedado não oferece split nessa modalidade; o programa de indicações não pode prometer repasse automático por esse recurso. As tarifas reais ainda não foram contratadas.
