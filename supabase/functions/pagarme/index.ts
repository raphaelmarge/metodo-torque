// TORQUESYS — Fase 2 · Cobrança automática via Pagar.me (grupo Stone)
//
// Esta função roda no SUPABASE (Edge Function) e é quem guarda a chave secreta
// do Pagar.me — a chave NUNCA vai para o site, que é público.
//
// Como instalar (uma vez, ~5 minutos):
//   1. No painel do Supabase: Edge Functions → Deploy new function → nome: pagarme
//      e cole este arquivo inteiro no editor. Deploy.
//   2. Ainda no painel: Edge Functions → pagarme → Secrets → adicione
//      PAGARME_SECRET_KEY = sk_... (a chave SECRETA da sua conta Pagar.me,
//      em Configurações → Chaves no painel do Pagar.me).
//   3. No TORQUESYS: menu Administrativo → Integrações → cole a URL da função
//      (https://SEU-PROJETO.supabase.co/functions/v1/pagarme) e clique Testar.
//
// Ações aceitas (POST JSON):
//   { acao: "ping" }                                  → confirma que está no ar
//   { acao: "criar", metodo: "pix"|"boleto"|"cartao",
//     valorCentavos, descricao, nome, cpf?, email?, vencimento? (AAAA-MM-DD),
//     parcelas? (1..12, só para cartao) }
//   → "cartao" gera um LINK DE CHECKOUT do Pagar.me: o aluno digita o cartão
//     na página segura do Pagar.me (nunca no nosso site) e pode escolher
//     também PIX ou boleto no mesmo link.
//   { acao: "status", orderId }                       → situação da cobrança

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "use POST" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ erro: "JSON inválido" }, 400);
  }

  const chave = Deno.env.get("PAGARME_SECRET_KEY") || "";

  if (body.acao === "ping") {
    return json({ ok: true, chaveConfigurada: !!chave });
  }
  if (!chave) {
    return json({ erro: "PAGARME_SECRET_KEY não configurada nos Secrets da função." }, 500);
  }

  const auth = "Basic " + btoa(chave + ":");
  const API = "https://api.pagar.me/core/v5";

  // ---------- criar cobrança (PIX ou boleto) ----------
  if (body.acao === "criar") {
    const valor = Math.round(Number(body.valorCentavos));
    if (!valor || valor < 100) return json({ erro: "valorCentavos inválido (mínimo 100 = R$ 1,00)." }, 400);
    const nome = String(body.nome || "").trim();
    if (!nome) return json({ erro: "nome do aluno é obrigatório." }, 400);
    const metodo = body.metodo === "boleto" ? "boleto" : body.metodo === "cartao" ? "cartao" : "pix";
    const cpf = String(body.cpf || "").replace(/\D/g, "");

    const customer: any = { name: nome, type: "individual" };
    if (cpf.length === 11) customer.document = cpf;
    if (body.email) customer.email = String(body.email).trim();
    // boleto exige documento; sem CPF, caímos para PIX
    const metodoFinal = metodo === "boleto" && cpf.length !== 11 ? "pix" : metodo;

    // cartão = checkout hospedado no Pagar.me (aceita cartão/PIX/boleto no link)
    const maxParcelas = Math.min(Math.max(Number(body.parcelas) || 1, 1), 12);
    const installments = [];
    for (let n = 1; n <= maxParcelas; n++) installments.push({ number: n, total: valor });

    const payments =
      metodoFinal === "cartao"
        ? [{
            payment_method: "checkout",
            checkout: {
              expires_in: 259200,
              customer_editable: true,
              skip_checkout_success_page: false,
              accepted_payment_methods: ["credit_card", "pix", "boleto"],
              credit_card: { operation_type: "auth_and_capture", installments },
              pix: { expires_in: 259200 },
              boleto: { due_at: body.vencimento ? body.vencimento + "T23:59:59Z" : undefined },
            },
          }]
        : metodoFinal === "boleto"
        ? [{
            payment_method: "boleto",
            boleto: {
              instructions: "Mensalidade da academia. Após o vencimento, falar na recepção.",
              due_at: body.vencimento ? body.vencimento + "T23:59:59Z" : undefined,
            },
          }]
        : [{ payment_method: "pix", pix: { expires_in: 259200 } }]; // 3 dias

    const resp = await fetch(API + "/orders", {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ amount: valor, description: String(body.descricao || "Mensalidade"), quantity: 1, code: "mensalidade" }],
        customer,
        payments,
      }),
    });
    const dados: any = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return json({ erro: "Pagar.me recusou: " + (dados?.message || resp.status), detalhe: dados }, 502);
    }
    const ch = dados.charges?.[0] || {};
    const tx = ch.last_transaction || {};
    const checkout = dados.checkouts?.[0] || {};
    return json({
      ok: true,
      orderId: dados.id,
      chargeId: ch.id,
      status: ch.status || dados.status,
      metodo: metodoFinal,
      pixCopiaECola: tx.qr_code || null,
      pixQrUrl: tx.qr_code_url || null,
      boletoUrl: tx.url || null,
      boletoPdf: tx.pdf || null,
      linhaDigitavel: tx.line || null,
      linkPagamento: checkout.payment_url || null,
    });
  }

  // ---------- assinatura recorrente (cartão cadastrado, cobra todo mês) ----------
  // O cartão NUNCA passa por aqui: o site tokeniza direto no Pagar.me com a
  // chave PÚBLICA e envia só o token (token_...), que vira assinatura.
  if (body.acao === "assinar") {
    const valor = Math.round(Number(body.valorCentavos));
    if (!valor || valor < 100) return json({ erro: "valorCentavos inválido." }, 400);
    const nome = String(body.nome || "").trim();
    const token = String(body.tokenCartao || "").trim();
    if (!nome || !token) return json({ erro: "nome e tokenCartao são obrigatórios." }, 400);
    const cpf = String(body.cpf || "").replace(/\D/g, "");
    const dia = Math.min(Math.max(Number(body.diaVencimento) || 5, 1), 28);

    const customer: any = { name: nome, type: "individual" };
    if (cpf.length === 11) customer.document = cpf;
    if (body.email) customer.email = String(body.email).trim();

    const resp = await fetch(API + "/subscriptions", {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        customer,
        payment_method: "credit_card",
        card_token: token,
        interval: "month",
        interval_count: 1,
        billing_type: "exact_day",
        billing_day: dia,
        installments: 1,
        items: [{
          description: String(body.descricao || "Mensalidade"),
          quantity: 1,
          pricing_scheme: { scheme_type: "unit", price: valor },
        }],
      }),
    });
    const dados: any = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return json({ erro: "Pagar.me recusou a assinatura: " + (dados?.message || resp.status), detalhe: dados }, 502);
    }
    return json({
      ok: true,
      assinaturaId: dados.id,
      status: dados.status,
      proximaCobranca: dados.next_billing_at || null,
      cartao: dados.card ? (dados.card.brand || "") + " •••• " + (dados.card.last_four_digits || "") : null,
    });
  }
  if (body.acao === "assinatura-status") {
    const id = String(body.assinaturaId || "").trim();
    if (!id) return json({ erro: "assinaturaId é obrigatório." }, 400);
    const resp = await fetch(API + "/subscriptions/" + encodeURIComponent(id), { headers: { Authorization: auth } });
    const dados: any = await resp.json().catch(() => ({}));
    if (!resp.ok) return json({ erro: "Pagar.me recusou: " + (dados?.message || resp.status) }, 502);
    return json({ ok: true, status: dados.status, proximaCobranca: dados.next_billing_at || null });
  }
  if (body.acao === "assinatura-cancelar") {
    const id = String(body.assinaturaId || "").trim();
    if (!id) return json({ erro: "assinaturaId é obrigatório." }, 400);
    const resp = await fetch(API + "/subscriptions/" + encodeURIComponent(id), {
      method: "DELETE",
      headers: { Authorization: auth },
    });
    const dados: any = await resp.json().catch(() => ({}));
    if (!resp.ok) return json({ erro: "Pagar.me recusou o cancelamento: " + (dados?.message || resp.status) }, 502);
    return json({ ok: true, status: dados.status || "canceled" });
  }

  // ---------- consultar situação ----------
  if (body.acao === "status") {
    const id = String(body.orderId || "").trim();
    if (!id) return json({ erro: "orderId é obrigatório." }, 400);
    const resp = await fetch(API + "/orders/" + encodeURIComponent(id), {
      headers: { Authorization: auth },
    });
    const dados: any = await resp.json().catch(() => ({}));
    if (!resp.ok) return json({ erro: "Pagar.me recusou: " + (dados?.message || resp.status) }, 502);
    const ch = dados.charges?.[0] || {};
    return json({ ok: true, status: ch.status || dados.status, pagoEm: ch.paid_at || null });
  }

  return json({ erro: "acao desconhecida (use ping, criar ou status)." }, 400);
});
