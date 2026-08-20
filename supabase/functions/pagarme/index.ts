// TORQUE ON — Fase 2 · Cobrança automática via Pagar.me (grupo Stone)
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
//   3. No TORQUE ON: menu Administrativo → Integrações → cole a URL da função
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
//
// MENSALIDADE AUTOMÁTICA no cartão (assinatura recorrente):
//   { acao: "chave_publica" }                         → devolve a PAGARME_PUBLIC_KEY
//     (o site usa pra tokenizar o cartão DIRETO no Pagar.me — o número do
//      cartão nunca passa por aqui; precisa do secret PAGARME_PUBLIC_KEY = pk_...)
//   { acao: "assinar", card_token, valorCentavos, descricao, nome,
//     email?, documento? }                            → cria a assinatura mensal
//   { acao: "assinatura_status", assinaturaId }       → situação da assinatura
//   { acao: "assinatura_cancela", assinaturaId }      → cancela a assinatura

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

// transforma a resposta de erro do Pagar.me em texto legível
// (pega d.message e, quando houver, o primeiro item de d.errors)
function erroPagarme(dados: any, statusHttp: number): string {
  let detalhe = "";
  try {
    if (dados && dados.errors && typeof dados.errors === "object") {
      const chave1 = Object.keys(dados.errors)[0];
      const v = chave1 ? (dados.errors as any)[chave1] : null;
      if (Array.isArray(v) && v.length) detalhe = typeof v[0] === "object" ? JSON.stringify(v[0]) : String(v[0]);
      else if (v) detalhe = typeof v === "object" ? JSON.stringify(v) : String(v);
    }
  } catch { /* segue sem detalhe */ }
  const msg = dados && dados.message ? String(dados.message) : "";
  if (msg && detalhe && detalhe !== msg) return msg + " — " + detalhe;
  return msg || detalhe || "erro " + statusHttp;
}


// só usuário LOGADO (personal/academia) pode usar — a chave pública não passa
/* Valida o token DE VERDADE, perguntando pro próprio Supabase quem é o dono
 * dele. Antes a função só lia o miolo do JWT: com o "Verify JWT" desligado,
 * qualquer um forjava um token e passava; e com ele ligado, projeto que trocou
 * as chaves de assinatura passou a recusar até token BOM, e a função nem
 * rodava. Assim funciona nos dois casos, sem abrir a porta. */
async function usuarioValidado(req: Request): Promise<string> {
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!jwt || (anon && jwt === anon)) return ""; // chave pública não é usuário
  try {
    const r = await fetch((Deno.env.get("SUPABASE_URL") || "") + "/auth/v1/user", {
      headers: { Authorization: "Bearer " + jwt, apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "" },
    });
    if (!r.ok) return "";
    const u = await r.json();
    return (u && u.id) || "";
  } catch { return ""; }
}


// descobre a academia do usuário logado (pra etiquetar cobranças no Pagar.me —
// o webhook usa essa etiqueta pra dar baixa automática no lugar certo)
async function academiaDoUsuario(req: Request): Promise<string> {
  try {
    const sub = await usuarioValidado(req);
    if (!sub) return "";
    const srv = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const url = Deno.env.get("SUPABASE_URL") || "";
    if (!srv || !url) return "";
    const r = await fetch(url + "/rest/v1/membros?select=academia_id&user_id=eq." + encodeURIComponent(sub) + "&limit=1", {
      headers: { apikey: srv, Authorization: "Bearer " + srv },
    });
    const rows = await r.json().catch(() => []);
    return (Array.isArray(rows) && rows[0] && rows[0].academia_id) || "";
  } catch {
    return "";
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "use POST" }, 405);

  if (!(await usuarioValidado(req))) {
    return json({ erro: "Entre na sua conta do TORQUE ON para usar esta função (a chave pública não basta)." }, 401);
  }

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

  // ---------- chave pública (pra tokenizar o cartão no navegador) ----------
  // Só devolve a chave PÚBLICA (pk_...) — a secreta nunca sai daqui.
  if (body.acao === "chave_publica") {
    const pk = Deno.env.get("PAGARME_PUBLIC_KEY") || "";
    if (!pk) return json({ erro: "Configure a PAGARME_PUBLIC_KEY nos Secrets." }, 500);
    return json({ ok: true, publicKey: pk });
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
        metadata: { academia_id: await academiaDoUsuario(req) },
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
  // chave PÚBLICA (acao chave_publica) e envia só o token (card_token), que
  // vira assinatura. Número de cartão NUNCA é aceito nesta função.
  if (body.acao === "assinar") {
    const valor = Math.round(Number(body.valorCentavos));
    if (!valor || valor < 100) return json({ erro: "valorCentavos inválido (mínimo 100 = R$ 1,00)." }, 400);
    const token = String(body.card_token || body.tokenCartao || "").trim();
    if (!token) return json({ erro: "card_token é obrigatório (o cartão é tokenizado no navegador, direto no Pagar.me)." }, 400);
    const nome = String(body.nome || "").trim();
    if (!nome) return json({ erro: "nome é obrigatório." }, 400);
    const cpf = String(body.documento || body.cpf || "").replace(/\D/g, "");

    const customer: any = { name: nome, type: "individual" };
    if (cpf.length === 11) customer.document = cpf;
    if (body.email) customer.email = String(body.email).trim();

    const assinatura: any = {
      code: "tq_" + Date.now(),
      payment_method: "credit_card",
      card_token: token,
      billing_type: "prepaid",
      interval: "month",
      interval_count: 1,
      items: [{
        description: String(body.descricao || "Mensalidade").slice(0, 64),
        quantity: 1,
        pricing_scheme: { scheme_type: "unit", price: valor },
      }],
      customer,
      metadata: { academia_id: await academiaDoUsuario(req) },
    };
    // caller antigo (perfil do aluno) escolhe o dia do vencimento
    const dia = Number(body.diaVencimento) || 0;
    if (dia >= 1) {
      assinatura.billing_type = "exact_day";
      assinatura.billing_day = Math.min(dia, 28);
      assinatura.installments = 1;
    }

    const resp = await fetch(API + "/subscriptions", {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify(assinatura),
    });
    const dados: any = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return json({ erro: "Pagar.me recusou a assinatura: " + erroPagarme(dados, resp.status), detalhe: dados }, 502);
    }
    return json({
      ok: true,
      assinaturaId: dados.id,
      status: dados.status,
      proximaCobranca: dados.next_billing_at || null,
      cartao: dados.card ? (dados.card.brand || "") + " •••• " + (dados.card.last_four_digits || "") : null,
    });
  }
  if (body.acao === "assinatura_status") {
    const id = String(body.assinaturaId || "").trim();
    if (!id) return json({ erro: "assinaturaId é obrigatório." }, 400);
    const resp = await fetch(API + "/subscriptions/" + encodeURIComponent(id), { headers: { Authorization: auth } });
    const dados: any = await resp.json().catch(() => ({}));
    if (!resp.ok) return json({ erro: "Pagar.me recusou: " + erroPagarme(dados, resp.status) }, 502);
    return json({
      ok: true,
      status: dados.status,
      proximaCobranca: dados.next_billing_at || "",
      valor: (dados.items && dados.items[0] && dados.items[0].pricing_scheme && dados.items[0].pricing_scheme.price) || 0,
    });
  }
  if (body.acao === "assinatura_cancela") {
    const id = String(body.assinaturaId || "").trim();
    if (!id) return json({ erro: "assinaturaId é obrigatório." }, 400);
    const resp = await fetch(API + "/subscriptions/" + encodeURIComponent(id), {
      method: "DELETE",
      headers: { Authorization: auth },
    });
    const dados: any = await resp.json().catch(() => ({}));
    if (!resp.ok) return json({ erro: "Pagar.me recusou o cancelamento: " + erroPagarme(dados, resp.status) }, 502);
    return json({ ok: true, status: (dados && dados.status) || "canceled" });
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

  return json({ erro: "acao desconhecida (use ping, chave_publica, criar, status, assinar, assinatura_status ou assinatura_cancela)." }, 400);
});
