// TORQUESYS — Fase 2 · WhatsApp oficial (API Cloud da Meta)
//
// Esta função roda no SUPABASE e guarda o token do WhatsApp — o token NUNCA
// vai para o site. Com ela o sistema ENVIA as mensagens sozinho (cobrança,
// lembretes), sem precisar abrir o WhatsApp no celular.
//
// Como instalar (uma vez):
//   1. developers.facebook.com → Criar app (tipo Business) → adicionar o
//      produto WhatsApp. Na tela "API Setup" você já ganha um número de teste
//      e pode cadastrar até 5 números para receber.
//   2. Copie o "Phone number ID" e um token (para produção, crie um token
//      permanente via System User no Business Manager).
//   3. No Supabase: Edge Functions → Deploy new function → nome: whatsapp →
//      cole este arquivo → Deploy. Em Secrets, adicione:
//        WHATSAPP_TOKEN     = o token
//        WHATSAPP_PHONE_ID  = o Phone number ID
//   4. No TORQUESYS: Administrativo → Integrações → cole a URL da função e
//      clique Testar. Envie a mensagem de teste para o seu número.
//
// IMPORTANTE (regra da Meta): mensagem LIVRE (texto) só chega se o aluno
// falou com o número nas últimas 24h. Fora dessa janela é preciso usar um
// TEMPLATE aprovado. Crie no WhatsApp Manager um template, por exemplo
// "cobranca_mensalidade" (idioma pt_BR) com o corpo:
//   "Oi {{1}}! Sua mensalidade de {{2}} está em aberto. Qualquer dúvida é só
//    responder por aqui. 💜"
// e informe o nome dele na tela de Integrações.
//
// Ações (POST JSON):
//   { acao: "ping" }
//   { acao: "enviar", para: "5531999999999", texto: "..." }                → texto livre (janela 24h)
//   { acao: "enviar", para: "...", template: "cobranca_mensalidade",
//     idioma?: "pt_BR", variaveis?: ["Ana", "R$ 129"] }                    → template aprovado

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

  const token = Deno.env.get("WHATSAPP_TOKEN") || "";
  const phoneId = Deno.env.get("WHATSAPP_PHONE_ID") || "";

  if (body.acao === "ping") {
    return json({ ok: true, tokenConfigurado: !!token, foneConfigurado: !!phoneId });
  }
  if (!token || !phoneId) {
    return json({ erro: "Configure WHATSAPP_TOKEN e WHATSAPP_PHONE_ID nos Secrets da função." }, 500);
  }

  if (body.acao === "enviar") {
    const para = String(body.para || "").replace(/\D/g, "");
    if (para.length < 12) return json({ erro: "número inválido — use DDI+DDD+número (ex.: 5531999990000)." }, 400);

    let payload: any;
    if (body.template) {
      const variaveis = Array.isArray(body.variaveis) ? body.variaveis : [];
      payload = {
        messaging_product: "whatsapp",
        to: para,
        type: "template",
        template: {
          name: String(body.template).trim(),
          language: { code: String(body.idioma || "pt_BR") },
          components: variaveis.length
            ? [{ type: "body", parameters: variaveis.map((v: unknown) => ({ type: "text", text: String(v) })) }]
            : [],
        },
      };
    } else {
      const texto = String(body.texto || "").trim();
      if (!texto) return json({ erro: "informe texto ou template." }, 400);
      payload = { messaging_product: "whatsapp", to: para, type: "text", text: { body: texto } };
    }

    const resp = await fetch("https://graph.facebook.com/v21.0/" + phoneId + "/messages", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const dados: any = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const cod = dados?.error?.code;
      const msg = dados?.error?.message || String(resp.status);
      // 131047 = fora da janela de 24h → precisa de template
      return json({ erro: "Meta recusou: " + msg, codigo: cod, precisaTemplate: cod === 131047 }, 502);
    }
    return json({ ok: true, messageId: dados.messages?.[0]?.id || null });
  }

  return json({ erro: "acao desconhecida (use ping ou enviar)." }, 400);
});
