// TORQUE ON — Webhook multi-gateway (baixa automática por profissional)
//
// O gateway do PRÓPRIO professor (Mercado Pago, Asaas ou Pagar.me) chama esta
// função quando um pagamento cai. Ela grava o evento na tabela pag_eventos e o
// painel dá baixa sozinho no financeiro — mensalidade, pacote de aulas ou
// crédito de hora-aula.
//
// Segurança (as duas voltas):
//   1. A URL carrega ?aid=<academia>&k=<senha> — a senha mora na pag_config
//      (webhook_token, gerada pelo servidor). Dupla errada = 401, sem olhar o corpo.
//   2. O corpo do aviso NUNCA é confiado: daqui sai só o ID do pagamento, e os
//      dados de verdade (valor, situação, referência) são buscados DE VOLTA no
//      gateway com a chave guardada daquela academia. Aviso forjado não vira
//      baixa: o pagamento tem que existir na conta do professor.
//
// Como instalar (uma vez):
//   1. Rode o bloco BAIXA AUTOMÁTICA MULTI-GATEWAY do supabase-setup.sql.
//   2. Deploy desta função com o nome: pagamentos-webhook (Verify JWT
//      DESLIGADO — o gateway chama sem login). Nenhum Secret novo.
//   3. Mercado Pago e Asaas: nada a fazer — a função pagamentos já aponta o
//      webhook sozinha a cada link. Pagar.me (chave própria): o professor cola a
//      URL mostrada em Configurações → Receber dos alunos no painel do Pagar.me.

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

/* ==== NORMALIZA ====
 * JS puro de propósito — tests/test-pag-webhook.js recorta esta região e roda
 * em node, sem chamar gateway nenhum. Não coloque tipo do TypeScript aqui.
 *
 * qualPagamento(provedor, corpo): do aviso cru sai SÓ o id do pagamento a
 * conferir (ou null = aviso que não interessa; responder 200 e seguir a vida).
 * avalia(provedor, pg): do pagamento JÁ BUSCADO no gateway sai a linha
 * normalizada { tipo, valor_centavos, ref, link_id, assinatura_id, cliente,
 * email } — ou null quando a situação não pede registro. */
function qualPagamento(provedor, corpo) {
  corpo = corpo || {};
  if (provedor === "mercadopago") {
    // MP manda só { action, type, data: { id } } — o resto se busca lá
    var tipoMp = String(corpo.type || corpo.topic || "");
    var idMp = corpo.data && corpo.data.id != null ? String(corpo.data.id) : "";
    if (tipoMp !== "payment" || !idMp) return null;
    return { id: idMp };
  }
  if (provedor === "asaas") {
    var evAs = String(corpo.event || "");
    var idAs = corpo.payment && corpo.payment.id ? String(corpo.payment.id) : "";
    // RECEIVED = dinheiro na conta; CONFIRMED = cartão aprovado (liquida depois);
    // OVERDUE = venceu sem pagar (alerta de assinatura); REFUNDED = estorno
    // (fica registrado — o painel decide o que fazer). O resto não interessa.
    if (!idAs || ["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED", "PAYMENT_OVERDUE", "PAYMENT_REFUNDED"].indexOf(evAs) < 0) return null;
    return { id: idAs };
  }
  if (provedor === "pagarme") {
    var tipoPg = String(corpo.type || "");
    var d = corpo.data || {};
    // tudo se resolve pelo PEDIDO: charge.* aponta o pedido dela
    var idPg = String((d.order && d.order.id) || (tipoPg.indexOf("order.") === 0 ? d.id : "") || "");
    if (!idPg || !/\.(paid|payment_failed|refunded|canceled)$/.test(tipoPg)) return null;
    return { id: idPg };
  }
  return null;
}

function avalia(provedor, pg) {
  pg = pg || {};
  if (provedor === "mercadopago") {
    var stMp = String(pg.status || "");
    var linhaMp = {
      tipo: "",
      valor_centavos: Math.round(Number(pg.transaction_amount || 0) * 100) || 0,
      ref: String(pg.external_reference || ""),
      link_id: "",
      assinatura_id: "",
      cliente: String((pg.payer && (pg.payer.first_name || "")) || "").slice(0, 120),
      email: String((pg.payer && pg.payer.email) || "").slice(0, 120),
    };
    if (stMp === "approved") linhaMp.tipo = "pago";
    else if (stMp === "refunded" || stMp === "charged_back") linhaMp.tipo = "estorno";
    else return null; // pendente/recusado: o MP re-avisa se mudar
    return linhaMp;
  }
  if (provedor === "asaas") {
    var stAs = String(pg.status || "");
    var linha = {
      tipo: "",
      valor_centavos: Math.round(Number(pg.value || 0) * 100) || 0,
      ref: String(pg.externalReference || ""),
      link_id: String(pg.paymentLink || ""),
      assinatura_id: String(pg.subscription || ""),
      cliente: "",
      email: "",
    };
    if (stAs === "RECEIVED" || stAs === "CONFIRMED" || stAs === "RECEIVED_IN_CASH") linha.tipo = "pago";
    else if (stAs === "OVERDUE") linha.tipo = "falhou";
    else if (stAs === "REFUNDED") linha.tipo = "estorno";
    else return null;
    return linha;
  }
  if (provedor === "pagarme") {
    var stPg = String(pg.status || "");
    var ch = (pg.charges && pg.charges[0]) || {};
    var meta = pg.metadata || {};
    var linha2 = {
      tipo: "",
      valor_centavos: Number(ch.paid_amount || ch.amount || pg.amount || 0) || 0,
      ref: String(meta.mt_ref || ""),
      link_id: String(pg.id || ""),
      assinatura_id: "",
      cliente: String((pg.customer && pg.customer.name) || "").slice(0, 120),
      email: String((pg.customer && pg.customer.email) || "").slice(0, 120),
    };
    if (stPg === "paid") linha2.tipo = "pago";
    else if (stPg === "failed" || String(ch.status || "") === "failed") linha2.tipo = "falhou";
    else if (stPg === "canceled" || String(ch.status || "") === "refunded") linha2.tipo = "estorno";
    else return null;
    return linha2;
  }
  return null;
}
/* ==== FIM NORMALIZA ==== */

// busca o pagamento DE VERDADE no gateway, com a chave da academia dona
async function buscaNoGateway(provedor: string, chave: string, id: string): Promise<any> {
  let r: Response;
  if (provedor === "mercadopago") {
    r = await fetch("https://api.mercadopago.com/v1/payments/" + encodeURIComponent(id), {
      headers: { Authorization: "Bearer " + chave },
    });
  } else if (provedor === "asaas") {
    r = await fetch("https://api.asaas.com/v3/payments/" + encodeURIComponent(id), {
      headers: { access_token: chave },
    });
  } else if (provedor === "pagarme") {
    r = await fetch("https://api.pagar.me/core/v5/orders/" + encodeURIComponent(id), {
      headers: { Authorization: "Basic " + btoa(chave + ":") },
    });
  } else return null;
  if (r.status === 404) return { __sumiu: true }; // id inventado: não existe na conta
  if (!r.ok) throw new Error(provedor + " HTTP " + r.status);
  return await r.json();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);

  if (req.method === "GET") {
    return json({ ok: true, servico: "pagamentos-webhook TORQUE ON" });
  }
  if (req.method !== "POST") return json({ erro: "use POST" }, 405);

  const srv = env("SUPABASE_SERVICE_ROLE_KEY");
  const base = env("SUPABASE_URL");
  if (!srv || !base) return json({ erro: "função sem acesso ao banco" }, 500);
  const heads = { apikey: srv, Authorization: "Bearer " + srv };

  // volta 1: a dupla academia + senha da URL tem que bater com a pag_config
  const aid = String(url.searchParams.get("aid") || "");
  const k = String(url.searchParams.get("k") || "");
  if (!aid || !k) return json({ erro: "não autorizado" }, 401);
  let cfg: any = null;
  try {
    const rc = await fetch(base + "/rest/v1/pag_config?select=provedor,chave,webhook_token&academia_id=eq." + encodeURIComponent(aid), { headers: heads });
    cfg = rc.ok ? (await rc.json())?.[0] : null;
  } catch { return json({ erro: "banco fora do ar" }, 500); }
  if (!cfg || !cfg.webhook_token || cfg.webhook_token !== k) {
    return json({ erro: "não autorizado" }, 401);
  }

  let corpo: any = {};
  try { corpo = await req.json(); } catch { corpo = {}; }
  // Mercado Pago tem um formato antigo (IPN) que manda tudo na URL e quase nada
  // no corpo — aceita os dois, senão o aviso antigo vira 400 e o MP re-tenta à toa
  if (cfg.provedor === "mercadopago" && !corpo.type && !corpo.topic) {
    corpo = {
      topic: url.searchParams.get("type") || url.searchParams.get("topic") || "",
      data: { id: url.searchParams.get("data.id") || url.searchParams.get("id") || "" },
    };
  }

  const aviso = qualPagamento(cfg.provedor, corpo);
  if (!aviso) return json({ ok: true, ignorado: true }); // evento que não interessa

  // volta 2: busca o pagamento no gateway — o corpo do aviso não vale nada sozinho
  let pg: any = null;
  try {
    pg = await buscaNoGateway(cfg.provedor, cfg.chave, aviso.id);
  } catch {
    // gateway fora do ar agora: devolve erro pro gateway RE-TENTAR depois.
    // ⚠️ No Asaas, respostas não-2xx repetidas INTERROMPEM a fila de webhooks
    // da conta (interrupted=true) e ela só volta religando — por isso a função
    // pagamentos confere e religa o webhook a cada link (v747).
    return json({ erro: "gateway indisponível, tente de novo" }, 500);
  }
  if (!pg || pg.__sumiu) return json({ ok: true, ignorado: true }); // id que não existe na conta

  const linha = avalia(cfg.provedor, pg);
  if (!linha) return json({ ok: true, ignorado: true }); // situação que não pede registro

  const r = await fetch(base + "/rest/v1/pag_eventos?on_conflict=id", {
    method: "POST",
    headers: {
      ...heads,
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates",
    },
    body: JSON.stringify([{
      // idempotência por PAGAMENTO + DESFECHO (não pelo id do aviso): o gateway
      // pode re-avisar o mesmo pagamento várias vezes e a baixa sai UMA só —
      // mas a cobrança que venceu ("falhou") e foi paga depois ganha a linha
      // "pago" normalmente, senão a baixa atrasada nunca sairia
      id: cfg.provedor + ":" + aviso.id + ":" + linha.tipo,
      academia_id: aid,
      provedor: cfg.provedor,
      ...linha,
    }]),
  });
  if (!r.ok && r.status !== 409) {
    const det = await r.text().catch(() => "");
    console.error("pag_eventos insert", r.status, det.slice(0, 200));
    return json({ erro: "não deu pra guardar (rode o SQL novo?)" }, 500);
  }
  // 🔔 push pro PROFESSOR: pagamento confirmado avisa o celular dele na hora.
  // Esta função já roda com a service key, então chama a push-envia direto —
  // sem inscrição 'prof:*' na push_subs, a push-envia só devolve enviados: 0.
  // Push que falha nunca derruba a baixa (por isso o catch mudo).
  if (linha.tipo === "pago") {
    try {
      const vlr = Number(linha.valor_centavos || 0) / 100;
      await fetch(base + "/functions/v1/push-envia", {
        method: "POST",
        headers: { ...heads, "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "prof", academia_id: aid, titulo: "💰 Pagamento confirmado",
          corpo: (vlr ? "Caiu R$ " + vlr.toFixed(2).replace(".", ",") : "Caiu um pagamento") +
            " (" + cfg.provedor + ") — a baixa já entrou sozinha.",
        }),
      });
    } catch { /* sem push não é sem baixa */ }
  }
  return json({ ok: true });
});
