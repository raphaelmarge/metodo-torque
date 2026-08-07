// TORQUE ON — Webhook do Pagar.me (baixa automática de pagamentos)
//
// O Pagar.me chama esta função quando uma cobrança é paga (ou recusada) —
// inclusive as mensalidades automáticas no cartão. A função guarda o evento
// na tabela pagarme_eventos e o sistema dá baixa sozinho no financeiro.
//
// Como instalar (uma vez):
//   1. Rode o bloco PAGAMENTOS AUTOMÁTICOS do supabase-setup.sql.
//   2. Deploy desta função com o nome: pagarme-webhook e DESLIGUE o
//      "Verify JWT" (Details da função) — o Pagar.me chama sem login.
//   3. Secret: PAGARME_WEBHOOK_TOKEN = uma senha longa que você inventa.
//   4. No painel do Pagar.me → Configurações → Webhooks → criar webhook com a URL:
//        https://SEU-PROJETO.supabase.co/functions/v1/pagarme-webhook?t=SUA-SENHA
//      e marque os eventos: charge.paid, charge.payment_failed, order.paid.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function env(k: string): string {
  return Deno.env.get(k) || "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);

  if (req.method === "GET") {
    return json({ ok: true, servico: "pagarme-webhook TORQUE ON" });
  }
  if (req.method !== "POST") return json({ erro: "use POST" }, 405);

  // trava: só aceita chamadas com a senha combinada na URL (?t=...)
  const segredo = env("PAGARME_WEBHOOK_TOKEN");
  if (!segredo || url.searchParams.get("t") !== segredo) {
    return json({ erro: "não autorizado" }, 401);
  }

  let ev: any = {};
  try { ev = await req.json(); } catch { return json({ erro: "JSON inválido" }, 400); }

  const tipo = String(ev.type || "");
  const d: any = ev.data || {};
  // o formato varia por evento — caça os campos onde estiverem
  const valor = Number(d.amount || (d.charges && d.charges[0] && d.charges[0].amount) || 0) || 0;
  const assinaturaId = String(
    (d.subscription && d.subscription.id) ||
    (d.invoice && d.invoice.subscription_id) ||
    (d.invoice && d.invoice.subscription && d.invoice.subscription.id) || ""
  );
  const pedidoId = String((d.order && d.order.id) || (tipo.indexOf("order.") === 0 ? d.id : "") || "");
  const cliente = String((d.customer && d.customer.name) || "").slice(0, 120);
  const email = String((d.customer && d.customer.email) || "").slice(0, 120);
  const meta: any = d.metadata ||
    (d.order && d.order.metadata) ||
    (d.subscription && d.subscription.metadata) ||
    (d.invoice && d.invoice.subscription && d.invoice.subscription.metadata) || {};
  const academiaId = String(meta.academia_id || "");

  // guarda o evento (idempotente pelo id do evento no Pagar.me)
  const srv = env("SUPABASE_SERVICE_ROLE_KEY");
  const base = env("SUPABASE_URL");
  if (!srv || !base) return json({ erro: "função sem acesso ao banco" }, 500);

  const linha: any = {
    id: String(ev.id || (tipo + "_" + (d.id || Date.now()))),
    tipo: tipo,
    status: String(d.status || ""),
    valor_centavos: valor,
    assinatura_id: assinaturaId,
    pedido_id: pedidoId,
    cliente: cliente,
    email: email,
  };
  if (academiaId) linha.academia_id = academiaId;

  const r = await fetch(base + "/rest/v1/pagarme_eventos?on_conflict=id", {
    method: "POST",
    headers: {
      apikey: srv, Authorization: "Bearer " + srv,
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates",
    },
    body: JSON.stringify([linha]),
  });
  if (!r.ok && r.status !== 409) {
    const det = await r.text().catch(() => "");
    console.error("pagarme_eventos insert", r.status, det.slice(0, 200));
    return json({ erro: "não deu pra guardar (rode o SQL novo?)" }, 500);
  }
  return json({ ok: true });
});
