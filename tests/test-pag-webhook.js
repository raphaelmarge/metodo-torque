/* Baixa automática multi-gateway: prova que o webhook entende os avisos dos 3
 * gateways e que a segurança do desenho está no lugar.
 *
 * Roda em node puro (modelo do test-meta-webhook): recorta a região NORMALIZA
 * do pagamentos-webhook/index.ts — que é JS puro de propósito — e avalia.
 * Nenhum gateway é chamado.
 *
 * Por que esta suíte existe: webhook de DINHEIRO errado dá baixa em mensalidade
 * que ninguém pagou (ou perde pagamento real). Aqui se prova que só o desfecho
 * certo vira registro — e, por regex na fonte, que a função nunca confia no
 * corpo do aviso (busca o pagamento de volta no gateway) e que a URL exige a
 * dupla academia + senha.
 */
const fs = require("fs");
const path = require("path");

const ARQ = path.join(__dirname, "..", "supabase", "functions", "pagamentos-webhook", "index.ts");
const fonte = fs.readFileSync(ARQ, "utf8");

let ok = 0, falhas = 0;
function t(cond, nome) {
  if (cond) { ok++; console.log("  ✅ " + nome); }
  else { falhas++; console.log("  ❌ " + nome); }
}

// ---------- recorta e avalia a região testável ----------
const ini = fonte.indexOf("/* ==== NORMALIZA ====");
const fim = fonte.indexOf("/* ==== FIM NORMALIZA ==== */");
if (ini < 0 || fim < 0) {
  console.log("  ❌ a região NORMALIZA sumiu do index.ts — os marcadores são o contrato desta suíte");
  process.exit(1);
}
const regiao = fonte.slice(ini, fim);
const { qualPagamento, avalia } =
  new Function(regiao + "\nreturn { qualPagamento, avalia };")();

console.log("Qual aviso interessa (qualPagamento):");

// Mercado Pago: só type payment com id; o resto (merchant_order, teste) é ignorado
t((qualPagamento("mercadopago", { type: "payment", data: { id: 123 } }) || {}).id === "123",
  "MP: aviso de payment devolve o id pra conferir (123)");
t(qualPagamento("mercadopago", { topic: "payment", data: { id: "77" } }).id === "77",
  "MP: formato antigo (topic) também funciona");
t(qualPagamento("mercadopago", { type: "merchant_order", data: { id: "9" } }) === null &&
  qualPagamento("mercadopago", { type: "payment", data: {} }) === null,
  "MP: merchant_order e aviso sem id são ignorados sem drama");

// Asaas: só os 3 eventos que importam
t(qualPagamento("asaas", { event: "PAYMENT_RECEIVED", payment: { id: "pay_1" } }).id === "pay_1" &&
  qualPagamento("asaas", { event: "PAYMENT_CONFIRMED", payment: { id: "pay_2" } }).id === "pay_2" &&
  qualPagamento("asaas", { event: "PAYMENT_OVERDUE", payment: { id: "pay_3" } }).id === "pay_3",
  "Asaas: RECEIVED, CONFIRMED e OVERDUE passam");
t(qualPagamento("asaas", { event: "PAYMENT_CREATED", payment: { id: "pay_4" } }) === null,
  "Asaas: cobrança só CRIADA (ninguém pagou) é ignorada");

// Pagar.me: tudo se resolve pelo pedido
t(qualPagamento("pagarme", { type: "order.paid", data: { id: "or_1" } }).id === "or_1",
  "Pagar.me: order.paid devolve o id do pedido");
t(qualPagamento("pagarme", { type: "charge.paid", data: { id: "ch_1", order: { id: "or_2" } } }).id === "or_2",
  "Pagar.me: charge.paid aponta o PEDIDO da cobrança");
t(qualPagamento("pagarme", { type: "order.created", data: { id: "or_3" } }) === null,
  "Pagar.me: pedido só criado é ignorado");

// provedor desconhecido nunca passa
t(qualPagamento("stripe", { type: "payment", data: { id: "x" } }) === null,
  "provedor fora da lista (stripe) é ignorado — só os 3 combinados");

console.log("O que o pagamento conferido vira (avalia):");

// MP: só approved vira "pago", com a referência carimbada no link
const mpPago = avalia("mercadopago", { status: "approved", transaction_amount: 149.9, external_reference: "mt|a1|mensal", payer: { email: "x@y.z" } });
t(mpPago && mpPago.tipo === "pago" && mpPago.valor_centavos === 14990 && mpPago.ref === "mt|a1|mensal",
  "MP approved → pago de R$ 149,90 com a referência mt|a1|mensal");
t(avalia("mercadopago", { status: "pending", transaction_amount: 100 }) === null &&
  avalia("mercadopago", { status: "rejected", transaction_amount: 100 }) === null,
  "MP pending/rejected não vira nada (o MP re-avisa se mudar)");

// Asaas: RECEIVED/CONFIRMED = pago; OVERDUE = falhou (alerta); com link e assinatura
const asPago = avalia("asaas", { status: "RECEIVED", value: 200, externalReference: "mt|a2|pacote", paymentLink: "pl_9", subscription: "" });
t(asPago && asPago.tipo === "pago" && asPago.valor_centavos === 20000 && asPago.link_id === "pl_9" && asPago.ref === "mt|a2|pacote",
  "Asaas RECEIVED → pago com link_id e referência (baixa acha o aluno de 2 jeitos)");
t((avalia("asaas", { status: "CONFIRMED", value: 99.9 }) || {}).tipo === "pago",
  "Asaas CONFIRMED (cartão aprovado) também é pago");
const asVenceu = avalia("asaas", { status: "OVERDUE", value: 150, subscription: "sub_7" });
t(asVenceu && asVenceu.tipo === "falhou" && asVenceu.assinatura_id === "sub_7",
  "Asaas OVERDUE → falhou com o id da assinatura (acende o alerta do aluno certo)");
t(avalia("asaas", { status: "PENDING", value: 80 }) === null,
  "Asaas PENDING (gerou mas ninguém pagou) não vira nada");

// o caso da re-busca: o aviso dizia OVERDUE, mas o pagamento JÁ está pago no
// gateway — vale o que o gateway diz AGORA, não o aviso atrasado
t((avalia("asaas", { status: "RECEIVED", value: 150 }) || {}).tipo === "pago",
  "aviso atrasado: vale a situação REAL re-buscada no gateway, não o corpo do aviso");

// Pagar.me: paid → pago com metadata.mt_ref; failed → falhou
const pgPago = avalia("pagarme", { id: "or_1", status: "paid", amount: 30000, charges: [{ amount: 30000, paid_amount: 30000 }], metadata: { mt_ref: "mt|a3|mensal" }, customer: { name: "João", email: "j@x.z" } });
t(pgPago && pgPago.tipo === "pago" && pgPago.valor_centavos === 30000 && pgPago.ref === "mt|a3|mensal" && pgPago.link_id === "or_1",
  "Pagar.me paid → pago com mt_ref e o id do pedido");
t((avalia("pagarme", { id: "or_2", status: "failed", charges: [{ amount: 100, status: "failed" }] }) || {}).tipo === "falhou",
  "Pagar.me failed → falhou");
t(avalia("pagarme", { id: "or_3", status: "pending", charges: [] }) === null,
  "Pagar.me pending não vira nada");

console.log("Segurança do desenho (na fonte da função):");

// nunca confia no corpo: o pagamento é re-buscado no gateway com a chave da academia
t(/buscaNoGateway/.test(fonte) && /api\.mercadopago\.com\/v1\/payments\//.test(fonte) &&
  /api\.asaas\.com\/v3\/payments\//.test(fonte) && /api\.pagar\.me\/core\/v5\/orders\//.test(fonte),
  "o pagamento é conferido DE VOLTA nos 3 gateways — aviso forjado não vira baixa");
// a porta: dupla academia + senha, e a senha vem da pag_config (gerada no servidor)
t(/searchParams\.get\("aid"\)/.test(fonte) && /searchParams\.get\("k"\)/.test(fonte) &&
  /cfg\.webhook_token !== k/.test(fonte),
  "a URL exige ?aid= + ?k= e a senha é conferida contra a pag_config");
// idempotência por pagamento+desfecho (re-aviso não duplica; atraso pago ainda baixa)
t(/on_conflict=id/.test(fonte) && /ignore-duplicates/.test(fonte) &&
  /aviso\.id \+ ":" \+ linha\.tipo/.test(fonte),
  "id = provedor:pagamento:desfecho — re-aviso não duplica e a cobrança atrasada paga depois ainda baixa");
// id que não existe na conta do professor morre em silêncio (200), sem gravar
t(/__sumiu/.test(fonte), "pagamento inventado (404 no gateway) é descartado sem gravar nada");
// academia_id da linha vem da URL AUTENTICADA, nunca do corpo do aviso
t(!/corpo\.academia_id|corpo\.aid/.test(fonte), "a academia dona vem da URL autenticada, nunca do corpo do aviso");

console.log("\npag-webhook: " + ok + " ok, " + falhas + " falhas");
if (falhas > 0) process.exit(1);
