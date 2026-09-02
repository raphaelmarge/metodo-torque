// TORQUE ON — Assinatura pelas lojas (App Store / Play Store, via RevenueCat)
//
// O personal assina o TORQUE PERSONAL DENTRO do app — quem cobra é a Apple ou
// o Google. O RevenueCat confere o recibo com a loja e chama esta função a
// cada acontecimento (compra, renovação, problema no cartão, fim do acesso).
// Ela grava o status na tabela academias; o painel mostra a situação pelo
// RPC minha_assinatura().
//
// Como instalar (uma vez):
//   1. Rode o bloco ASSINATURA DO PROFISSIONAL do supabase-setup.sql.
//   2. Deploy desta função com o nome: assinatura-loja e DESLIGUE o
//      "Verify JWT" (Details da função) — o RevenueCat chama sem login.
//   3. Secret: RC_WEBHOOK_TOKEN = uma senha longa que você inventa.
//   4. No painel do RevenueCat → Projeto → Integrations → Webhooks, cadastre:
//        https://SEU-PROJETO.supabase.co/functions/v1/assinatura-loja?t=SUA-SENHA
//      (se preferir, dá pra usar o campo "Authorization header value" com a
//       mesma senha em vez do ?t= na URL — os dois funcionam)
//   5. No app nativo, o login do RevenueCat usa o ID DA ACADEMIA como
//      app_user_id — é assim que o evento encontra a conta certa aqui.

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

// como cada evento do RevenueCat vira status na tabela academias.
// CANCELLATION de propósito NÃO está aqui: o personal só desligou a
// renovação — o período que ele já pagou continua valendo, e quando o
// acesso acabar de verdade o RevenueCat manda EXPIRATION.
const MAPA: Record<string, string> = {
  INITIAL_PURCHASE: "ativa",
  RENEWAL: "ativa",
  UNCANCELLATION: "ativa",
  NON_RENEWING_PURCHASE: "ativa",
  PRODUCT_CHANGE: "ativa",
  BILLING_ISSUE: "atrasada",
  EXPIRATION: "bloqueada",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);

  if (req.method === "GET") {
    return json({ ok: true, servico: "assinatura-loja TORQUE ON", regras: ["ordem-eventos"] });
  }
  if (req.method !== "POST") return json({ erro: "use POST" }, 405);

  // trava: aceita a senha na URL (?t=...) ou no header Authorization
  const segredo = env("RC_WEBHOOK_TOKEN");
  const auth = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!segredo || (url.searchParams.get("t") !== segredo && auth !== segredo)) {
    return json({ erro: "não autorizado" }, 401);
  }

  let corpo: any = {};
  try { corpo = await req.json(); } catch { return json({ erro: "JSON inválido" }, 400); }
  const ev: any = corpo.event || {};
  const tipo = String(ev.type || "");

  // botão "Send test event" do RevenueCat — só confirma que está no ar
  if (tipo === "TEST") return json({ ok: true, teste: true });

  const status = MAPA[tipo];
  if (!status) return json({ ok: true, ignorado: tipo });

  const academiaId = String(ev.app_user_id || "");
  if (!UUID.test(academiaId)) {
    // app_user_id anônimo ($RCAnonymousID:...) ou fora do padrão: sem conta
    // pra atualizar — responde 200 pro RevenueCat não ficar reenviando
    return json({ ok: true, ignorado: "app_user_id não é o id de uma academia" });
  }

  const srv = env("SUPABASE_SERVICE_ROLE_KEY");
  const base = env("SUPABASE_URL");
  if (!srv || !base) return json({ erro: "função sem acesso ao banco" }, 500);

  const linha: any = {
    assinatura_status: status,
    assinatura_via: String(ev.store || "").toLowerCase(),   // app_store | play_store
    assinatura_ref: String(ev.product_id || "").slice(0, 120),
  };
  if (ev.expiration_at_ms) {
    linha.assinatura_vence = new Date(Number(ev.expiration_at_ms)).toISOString();
  }

  /* v747: guarda de ORDEM. O RevenueCat reenvia por horas o evento que falhou;
   * uma EXPIRATION antiga chegando DEPOIS de uma RENEWAL gravava "bloqueada"
   * por cima de quem acabou de renovar. Cada evento traz event_timestamp_ms:
   * o PATCH só aplica quando ele é mais novo que o último aplicado
   * (academias.assinatura_evento_em — coluna do SQL novo; banco sem ela cai
   * no PATCH antigo, com aviso no log). */
  const quando = Number(ev.event_timestamp_ms || 0);
  const heads = {
    apikey: srv, Authorization: "Bearer " + srv,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  const alvo = base + "/rest/v1/academias?id=eq." + encodeURIComponent(academiaId);
  let r: Response;
  let dados: any;
  if (quando > 0) {
    const iso = new Date(quando).toISOString();
    r = await fetch(alvo + "&or=(assinatura_evento_em.is.null,assinatura_evento_em.lt." + encodeURIComponent(iso) + ")", {
      method: "PATCH", headers: heads, body: JSON.stringify({ ...linha, assinatura_evento_em: iso }),
    });
    dados = await r.json().catch(() => []);
    if (r.status === 400 && /assinatura_evento_em/.test(JSON.stringify(dados))) {
      console.warn("academias sem a coluna assinatura_evento_em — rode o SQL novo; aplicando sem guarda de ordem");
      r = await fetch(alvo, { method: "PATCH", headers: heads, body: JSON.stringify(linha) });
      dados = await r.json().catch(() => []);
    }
  } else {
    r = await fetch(alvo, { method: "PATCH", headers: heads, body: JSON.stringify(linha) });
    dados = await r.json().catch(() => []);
  }
  if (!r.ok) {
    console.error("academias update", r.status, JSON.stringify(dados).slice(0, 200));
    return json({ erro: "não deu pra gravar (rode o SQL novo?)" }, 500);
  }
  if (!Array.isArray(dados) || !dados.length) {
    // id válido mas nenhuma academia com ele — evento de outra instalação —
    // OU evento mais velho que o último aplicado (guarda de ordem): 200 pro
    // RevenueCat parar de reenviar
    return json({ ok: true, ignorado: quando > 0 ? "academia não encontrada ou evento mais antigo que o último aplicado" : "academia não encontrada" });
  }
  return json({ ok: true, status: status });
});
