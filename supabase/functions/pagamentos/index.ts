// TORQUE ON — Pagamentos por profissional · link de cobrança no gateway DELE
//
// Esta função roda no SUPABASE e gera o link de cobrança (cartão/Pix/boleto)
// usando a conta do PRÓPRIO personal/academia — Mercado Pago, Asaas ou
// Pagar.me, o que ele escolher em Configurações → Pagamentos. O dinheiro do
// aluno cai DIRETO na conta do professor: o dono do sistema nunca recebe nem
// repassa nada (mesmo modelo do WhatsApp: cada um com a própria conta).
//
// A chave do gateway mora na tabela pag_config (selada, RLS sem política) e só
// é lida aqui, com a service key — ela NUNCA volta pro navegador.
//
// Como instalar (uma vez):
//   1. Rode o bloco PAGAMENTOS POR PROFISSIONAL do supabase-setup.sql.
//   2. Deploy desta função com o nome: pagamentos (Verify JWT DESLIGADO — ela
//      valida o login sozinha).
//
// Ações (POST JSON, sempre com o login do profissional no Authorization):
//   { acao: "ping" }                                → { ok, provedor, temChave }
//   { acao: "link", valorCentavos, descricao, nome, email? }
//     → { ok, link } — página de pagamento do gateway do profissional

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

/* Valida o token DE VERDADE, perguntando pro próprio Supabase quem é o dono
 * dele (mesmo desenho das outras funções — Verify JWT fica desligado e a porta
 * continua fechada pra token forjado e pra chave pública). */
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

// a configuração de pagamento da academia de quem chamou (lida com a service key)
async function configDe(userId: string): Promise<{ provedor: string; chave: string } | null> {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key || !userId) return null;
  const heads = { apikey: key, Authorization: "Bearer " + key };
  try {
    const rm = await fetch(url + "/rest/v1/membros?select=academia_id&limit=1&user_id=eq." + encodeURIComponent(userId), { headers: heads });
    const membros = rm.ok ? await rm.json() : [];
    const aid = membros?.[0]?.academia_id;
    if (!aid) return null;
    const rc = await fetch(url + "/rest/v1/pag_config?select=provedor,chave&academia_id=eq." + aid, { headers: heads });
    const linhas = rc.ok ? await rc.json() : [];
    const c = linhas?.[0];
    if (!c || !c.provedor || !c.chave) return null;
    return { provedor: String(c.provedor), chave: String(c.chave) };
  } catch { return null; }
}

// ---------- um adaptador por gateway: entra {valor, descricao, nome, email}, sai a URL ----------

async function linkMercadoPago(chave: string, valorReais: number, descricao: string, nome: string, email: string) {
  const resp = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: { Authorization: "Bearer " + chave, "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [{ title: descricao, quantity: 1, currency_id: "BRL", unit_price: valorReais }],
      payer: email ? { name: nome, email } : { name: nome },
      statement_descriptor: descricao.slice(0, 22),
    }),
  });
  const d: any = await resp.json().catch(() => ({}));
  if (!resp.ok || !d.init_point) throw new Error("Mercado Pago recusou: " + (d?.message || resp.status));
  return String(d.init_point);
}

async function linkAsaas(chave: string, valorReais: number, descricao: string, nome: string) {
  const resp = await fetch("https://api.asaas.com/v3/paymentLinks", {
    method: "POST",
    headers: { access_token: chave, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: (descricao + " — " + nome).slice(0, 200),
      value: valorReais,
      billingType: "UNDEFINED", // o aluno escolhe: Pix, cartão ou boleto
      chargeType: "DETACHED",
    }),
  });
  const d: any = await resp.json().catch(() => ({}));
  if (!resp.ok || !d.url) {
    const det = d?.errors?.[0]?.description || d?.message || resp.status;
    throw new Error("Asaas recusou: " + det);
  }
  return String(d.url);
}

async function linkPagarme(chave: string, valorCentavos: number, descricao: string, nome: string, email: string) {
  // checkout hospedado do Pagar.me: o aluno escolhe cartão, Pix ou boleto no link
  const customer: any = { name: nome, type: "individual" };
  if (email) customer.email = email;
  const resp = await fetch("https://api.pagar.me/core/v5/orders", {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(chave + ":"), "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [{ amount: valorCentavos, description: descricao, quantity: 1, code: "mensalidade" }],
      customer,
      payments: [{
        payment_method: "checkout",
        checkout: {
          expires_in: 259200,
          customer_editable: true,
          skip_checkout_success_page: false,
          accepted_payment_methods: ["credit_card", "pix", "boleto"],
          credit_card: { operation_type: "auth_and_capture", installments: [{ number: 1, total: valorCentavos }] },
          pix: { expires_in: 259200 },
        },
      }],
    }),
  });
  const d: any = await resp.json().catch(() => ({}));
  const urlCk = d?.checkouts?.[0]?.payment_url;
  if (!resp.ok || !urlCk) throw new Error("Pagar.me recusou: " + (d?.message || resp.status));
  return String(urlCk);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "use POST" }, 405);

  const userId = await usuarioValidado(req);
  if (!userId) {
    return json({ erro: "Entre na sua conta do TORQUE ON para usar esta função (a chave pública não basta)." }, 401);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ erro: "JSON inválido" }, 400); }

  const cfg = await configDe(userId);

  if (body.acao === "ping") {
    return json({ ok: true, provedor: cfg ? cfg.provedor : null, temChave: !!cfg });
  }

  if (!cfg) {
    return json({ erro: "Nenhum gateway ligado nesta conta — escolha o seu em Configurações → Pagamentos e cole a chave." }, 400);
  }

  if (body.acao === "link") {
    const valorCentavos = Math.round(Number(body.valorCentavos));
    if (!valorCentavos || valorCentavos < 100) return json({ erro: "valorCentavos inválido (mínimo 100 = R$ 1,00)." }, 400);
    const valorReais = Math.round(valorCentavos) / 100;
    const descricao = String(body.descricao || "Mensalidade").slice(0, 120);
    const nome = String(body.nome || "").trim() || "Aluno";
    const email = String(body.email || "").trim();
    try {
      let link = "";
      if (cfg.provedor === "mercadopago") link = await linkMercadoPago(cfg.chave, valorReais, descricao, nome, email);
      else if (cfg.provedor === "asaas") link = await linkAsaas(cfg.chave, valorReais, descricao, nome);
      else if (cfg.provedor === "pagarme") link = await linkPagarme(cfg.chave, valorCentavos, descricao, nome, email);
      else return json({ erro: "provedor desconhecido: " + cfg.provedor }, 400);
      return json({ ok: true, link, provedor: cfg.provedor });
    } catch (e) {
      return json({ erro: String((e as Error).message || e) }, 502);
    }
  }

  return json({ erro: "acao desconhecida (use ping ou link)." }, 400);
});
