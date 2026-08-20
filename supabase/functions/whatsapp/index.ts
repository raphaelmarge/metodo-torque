// TORQUE ON — Fase 2 · WhatsApp oficial (API Cloud da Meta)
//
// Esta função roda no SUPABASE e guarda o token do WhatsApp — o token NUNCA
// vai para o site. Com ela o sistema ENVIA as mensagens sozinho (cobrança,
// lembretes), sem precisar abrir o WhatsApp no celular.
//
// Cada profissional liga o PRÓPRIO número: ele cola o ID do número e o token
// na tela de Configurações do TORQUE PERSONAL, o painel guarda na tabela
// zap_config (separada por academia) e esta função lê a credencial de QUEM está
// chamando. Ninguém precisa criar projeto no Supabase nem mexer no GitHub —
// esta função é uma só, publicada por você, e serve todo mundo.
// Quem não ligar número nenhum simplesmente não envia — e é assim de propósito:
// cada um paga a própria conta na Meta, e emprestar o número do dono faria as
// mensagens saírem com o número errado e a conta cair no bolso errado.
// Pra instalação de dono único (ou plano de entrada), ligue o Secret
// WHATSAPP_COMPARTILHADO=sim: aí quem não tem credencial usa
// WHATSAPP_TOKEN / WHATSAPP_PHONE_ID.
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
//   4. No TORQUE ON: Administrativo → Integrações → cole a URL da função e
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


// só usuário LOGADO (personal/academia) pode usar — devolve o id dele, que é
// por onde achamos a credencial da academia.
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


// credencial da academia de quem chamou (lida com a service key, no servidor)
async function credencialDe(userId: string): Promise<{ token: string; phoneId: string; template: string } | null> {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key || !userId) return null;
  const heads = { apikey: key, Authorization: "Bearer " + key };
  try {
    const rm = await fetch(url + "/rest/v1/membros?select=academia_id&limit=1&user_id=eq." + userId, { headers: heads });
    const membros = rm.ok ? await rm.json() : [];
    const aid = membros?.[0]?.academia_id;
    if (!aid) return null;
    const rc = await fetch(url + "/rest/v1/zap_config?select=phone_id,token,template&academia_id=eq." + aid, { headers: heads });
    const linhas = rc.ok ? await rc.json() : [];
    const c = linhas?.[0];
    if (!c || !c.token || !c.phone_id) return null;
    return { token: String(c.token), phoneId: String(c.phone_id), template: String(c.template || "") };
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "use POST" }, 405);

  const userId = await usuarioValidado(req);
  if (!userId) {
    return json({ erro: "Entre na sua conta do TORQUE ON para usar esta função (a chave pública não basta)." }, 401);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ erro: "JSON inválido" }, 400);
  }

  /* Cada profissional paga o PRÓPRIO WhatsApp: a Meta cobra a conta dele, não a
   * do dono do sistema. Por isso, sem credencial própria a função NÃO empresta o
   * número global — se emprestasse, o dono pagaria a conta de todo mundo e as
   * mensagens sairiam com o número dele (o aluno responderia pra pessoa errada).
   * WHATSAPP_COMPARTILHADO=sim libera o número global de propósito, pra quem
   * quiser oferecer um plano de entrada ou uma demonstração. */
  const compartilhado = (Deno.env.get("WHATSAPP_COMPARTILHADO") || "").trim().toLowerCase() === "sim";
  const propria = await credencialDe(userId);
  const token = propria ? propria.token : (compartilhado ? Deno.env.get("WHATSAPP_TOKEN") || "" : "");
  const phoneId = propria ? propria.phoneId : (compartilhado ? Deno.env.get("WHATSAPP_PHONE_ID") || "" : "");

  if (body.acao === "ping") {
    return json({ ok: true, tokenConfigurado: !!token, foneConfigurado: !!phoneId, numeroProprio: !!propria, compartilhado: compartilhado });
  }
  if (!token || !phoneId) {
    return json({ erro: "Nenhum número do WhatsApp ligado nesta conta — cole o ID do número e o token da Meta em Configurações → WhatsApp." }, 400);
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
