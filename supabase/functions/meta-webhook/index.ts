// TORQUESYS — Chat unificado · webhook da Meta (WhatsApp + Instagram)
//
// Esta função RECEBE as mensagens que os clientes mandam no WhatsApp e no
// Instagram da academia, guarda tudo na caixa de entrada unificada
// (tabelas chat_conversas / chat_mensagens) e, quando o modo automático
// está ligado, pede uma resposta ao Claude (IA da Anthropic) e responde
// sozinha pelo mesmo canal.
//
// Como instalar (uma vez):
//   1. Rode o bloco "CHAT UNIFICADO" do supabase-setup.sql no SQL Editor.
//   2. Supabase → Edge Functions → Deploy new function → nome: meta-webhook
//      → cole este arquivo → Deploy. IMPORTANTE: desligue "Verify JWT"
//      (a Meta chama esta URL sem login). Pela CLI:
//        supabase functions deploy meta-webhook --no-verify-jwt
//   3. Em Edge Functions → Secrets, adicione:
//        META_VERIFY_TOKEN  = uma senha qualquer que você inventa (ex.: torque123)
//        WHATSAPP_TOKEN     = token do WhatsApp Cloud API (mesmo da função "whatsapp")
//        WHATSAPP_PHONE_ID  = Phone number ID do WhatsApp
//        INSTAGRAM_TOKEN    = token de acesso da Página (com instagram_manage_messages)
//        ANTHROPIC_API_KEY  = chave da API da Anthropic (console.anthropic.com)
//   4. No painel da Meta (developers.facebook.com → seu app → Webhooks):
//      - URL do callback:  https://SEU-PROJETO.supabase.co/functions/v1/meta-webhook
//      - Verify token:     o mesmo META_VERIFY_TOKEN
//      - Assine os campos: WhatsApp → "messages" · Instagram → "messages"
//   5. No TORQUESYS: Sistema → CRM → Chat e IA. Pronto.
//
// A resposta 200 é devolvida NA HORA (a Meta reenvia se demorar) e o
// processamento continua em segundo plano com EdgeRuntime.waitUntil.

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const GRAPH = "https://graph.facebook.com/v21.0";

function env(k: string): string {
  return Deno.env.get(k) || "";
}

function sb(path: string, init: RequestInit = {}): Promise<Response> {
  const url = env("SUPABASE_URL") + "/rest/v1/" + path;
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  return fetch(url, {
    ...init,
    headers: {
      apikey: key,
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

// ---------- academia + configuração ----------
async function pegaConfig(): Promise<{ aid: string; auto_global: boolean; prompt: string; bot: any } | null> {
  let r = await sb("chat_config?select=academia_id,auto_global,prompt,bot&limit=1");
  let rows = r.ok ? await r.json() : [];
  if (rows.length) {
    return {
      aid: rows[0].academia_id, auto_global: !!rows[0].auto_global,
      prompt: rows[0].prompt || "", bot: rows[0].bot || null,
    };
  }
  r = await sb("academias?select=id&limit=1");
  rows = r.ok ? await r.json() : [];
  if (rows.length) return { aid: rows[0].id, auto_global: false, prompt: "", bot: null };
  return null;
}

// ---------- IA (Claude / Anthropic) ----------
async function respostaIA(
  historico: { de: string; texto: string }[],
  promptExtra: string,
): Promise<string> {
  const chave = env("ANTHROPIC_API_KEY");
  if (!chave) return "";

  // A API exige papéis alternados user/assistant: junta mensagens seguidas
  // do mesmo lado e garante que a conversa começa com o cliente.
  const msgs: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of historico) {
    const role = m.de === "cliente" ? "user" : "assistant";
    const ultimo = msgs[msgs.length - 1];
    if (ultimo && ultimo.role === role) ultimo.content += "\n" + m.texto;
    else msgs.push({ role, content: m.texto });
  }
  if (!msgs.length) return "";
  if (msgs[0].role === "assistant") msgs.unshift({ role: "user", content: "(início da conversa)" });

  const sistema =
    "Você é o atendente virtual de uma academia (TORQUE FIT) respondendo clientes " +
    "pelo WhatsApp e pelo Instagram. Responda em português do Brasil, de forma curta, " +
    "simpática e objetiva, como uma mensagem de chat (sem markdown, sem listas longas). " +
    "Nunca invente preços, horários ou promoções que não estejam nas instruções abaixo — " +
    "se não souber, diga que a equipe já vai responder. Não peça dados sensíveis." +
    (promptExtra ? "\n\nInstruções da academia:\n" + promptExtra : "");

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": chave,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-opus-4-8",
      max_tokens: 700,
      thinking: { type: "adaptive" },
      system: sistema,
      messages: msgs.slice(-20),
    }),
  });
  if (!r.ok) {
    console.error("anthropic", r.status, await r.text());
    return "";
  }
  const d = await r.json();
  let texto = "";
  for (const b of d.content || []) if (b.type === "text") texto += b.text;
  return texto.trim();
}

// ---------- envio pela Meta ----------
async function enviaMeta(canal: string, contato: string, texto: string): Promise<boolean> {
  let r: Response;
  if (canal === "instagram") {
    const token = env("INSTAGRAM_TOKEN");
    if (!token) return false;
    r = await fetch(GRAPH + "/me/messages?access_token=" + encodeURIComponent(token), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: contato }, message: { text: texto } }),
    });
  } else {
    const token = env("WHATSAPP_TOKEN"), fone = env("WHATSAPP_PHONE_ID");
    if (!token || !fone) return false;
    r = await fetch(GRAPH + "/" + fone + "/messages", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: contato, type: "text", text: { body: texto } }),
    });
  }
  if (!r.ok) console.error("meta envio", canal, r.status, await r.text());
  return r.ok;
}

// ---------- chatbot de menu (boas-vindas + opções numeradas) ----------
function textoMenu(bot: any): string {
  const linhas = (bot.opcoes || []).map(function (o: any, i: number) {
    return (i + 1) + " — " + (o.rotulo || "");
  });
  return (bot.boasvindas || "Olá! 👋 Sou o assistente automático.") +
    "\n\n" + linhas.join("\n") + "\n\nResponda com o número da opção. 😉";
}

// responde pelo canal e registra como mensagem do robô/IA
async function respondeAuto(conversa: any, aid: string, canal: string, contato: string, texto: string) {
  const enviou = await enviaMeta(canal, contato, texto);
  if (!enviou) return false;
  await sb("chat_mensagens", {
    method: "POST",
    body: JSON.stringify({ conversa_id: conversa.id, academia_id: aid, de: "ia", texto }),
  });
  await sb(`chat_conversas?id=eq.${conversa.id}`, {
    method: "PATCH",
    body: JSON.stringify({ ultima_msg: "🤖 " + texto.slice(0, 120), atualizado: new Date().toISOString() }),
  });
  return true;
}

// ---------- processa uma mensagem recebida ----------
async function processa(canal: string, contato: string, nome: string, texto: string, mid: string) {
  const cfg = await pegaConfig();
  if (!cfg) { console.error("sem academia cadastrada"); return; }

  // conversa: cria (herdando o modo automático global) ou atualiza
  let r = await sb(
    `chat_conversas?select=id,modo_auto,nao_lidas,bot_estado&academia_id=eq.${cfg.aid}&canal=eq.${canal}&contato_id=eq.${encodeURIComponent(contato)}`,
  );
  let rows = r.ok ? await r.json() : [];
  let conversa = rows[0];
  const nova = !conversa;
  if (!conversa) {
    r = await sb("chat_conversas", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        academia_id: cfg.aid, canal, contato_id: contato, nome,
        modo_auto: cfg.auto_global, ultima_msg: texto, nao_lidas: 1,
      }),
    });
    rows = r.ok ? await r.json() : [];
    conversa = rows[0];
    if (!conversa) { console.error("falha ao criar conversa", await r.text()); return; }
  } else {
    await sb(`chat_conversas?id=eq.${conversa.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        ultima_msg: texto, atualizado: new Date().toISOString(),
        nao_lidas: (conversa.nao_lidas || 0) + 1, ...(nome ? { nome } : {}),
      }),
    });
  }

  // guarda a mensagem do cliente (mid único evita reentrega duplicada da Meta)
  r = await sb("chat_mensagens", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ conversa_id: conversa.id, academia_id: cfg.aid, de: "cliente", texto, mid }),
  });
  if (!r.ok) { console.error("mensagem duplicada ou erro", r.status); return; }

  // ---- chatbot de menu: roda antes da IA ----
  const bot = cfg.bot && cfg.bot.ativo ? cfg.bot : null;
  if (bot) {
    const opcoes = bot.opcoes || [];
    const n = parseInt((texto || "").trim(), 10);
    const escolhida = (!isNaN(n) && opcoes[n - 1]) ? opcoes[n - 1]
      : opcoes.find(function (o: any) {
          return o.rotulo && texto.trim().toLowerCase() === String(o.rotulo).toLowerCase();
        });

    if (escolhida) {
      if (escolhida.acao === "humano") {
        await sb(`chat_conversas?id=eq.${conversa.id}`, {
          method: "PATCH", body: JSON.stringify({ modo_auto: false, bot_estado: "humano" }),
        });
        await respondeAuto(conversa, cfg.aid, canal, contato,
          escolhida.resposta || "Perfeito! Já chamei alguém da equipe — te respondemos em instantes. 🙌");
        return;
      }
      if (escolhida.acao === "ia") {
        await sb(`chat_conversas?id=eq.${conversa.id}`, {
          method: "PATCH", body: JSON.stringify({ modo_auto: true, bot_estado: "ia" }),
        });
        if (escolhida.resposta) { await respondeAuto(conversa, cfg.aid, canal, contato, escolhida.resposta); return; }
        conversa.modo_auto = true; // sem resposta fixa: a IA assume já nesta mensagem
      } else {
        await respondeAuto(conversa, cfg.aid, canal, contato, escolhida.resposta || "");
        return;
      }
    } else if (nova) {
      // primeira mensagem: manda as boas-vindas + menu
      await sb(`chat_conversas?id=eq.${conversa.id}`, {
        method: "PATCH", body: JSON.stringify({ bot_estado: "menu" }),
      });
      await respondeAuto(conversa, cfg.aid, canal, contato, textoMenu(bot));
      return;
    } else if (conversa.bot_estado === "menu" && !conversa.modo_auto) {
      // ainda no menu e não escolheu nada válido: repete as opções
      await respondeAuto(conversa, cfg.aid, canal, contato, "Não entendi 🤔\n\n" + textoMenu(bot));
      return;
    }
    // bot_estado "humano": silêncio (a equipe responde) · "ia": cai na IA abaixo
  }

  if (!conversa.modo_auto) return;

  // modo automático: monta o histórico e pede a resposta ao Claude
  r = await sb(`chat_mensagens?select=de,texto&conversa_id=eq.${conversa.id}&order=criado.desc&limit=20`);
  const hist = (r.ok ? await r.json() : []).reverse();
  const resposta = await respostaIA(hist, cfg.prompt);
  if (!resposta) return;
  await respondeAuto(conversa, cfg.aid, canal, contato, resposta);
}

// ---------- extrai as mensagens do payload da Meta ----------
function extrai(payload: any): { canal: string; contato: string; nome: string; texto: string; mid: string }[] {
  const saida: { canal: string; contato: string; nome: string; texto: string; mid: string }[] = [];
  for (const entry of payload.entry || []) {
    // WhatsApp Cloud API
    for (const ch of entry.changes || []) {
      const v = ch.value || {};
      const nome = v.contacts?.[0]?.profile?.name || "";
      for (const m of v.messages || []) {
        const texto = m.text?.body ||
          m.button?.text || m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || "";
        if (texto && m.from) saida.push({ canal: "whatsapp", contato: m.from, nome, texto, mid: m.id || "" });
      }
    }
    // Instagram (e Messenger) — formato messaging
    for (const m of entry.messaging || []) {
      const texto = m.message?.text || "";
      const eco = m.message?.is_echo; // mensagens que a própria página enviou
      if (texto && !eco && m.sender?.id) {
        saida.push({
          canal: payload.object === "instagram" ? "instagram" : "whatsapp",
          contato: m.sender.id, nome: "", texto, mid: m.message?.mid || "",
        });
      }
    }
  }
  return saida;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // verificação do webhook (a Meta faz um GET com o verify token)
  if (req.method === "GET") {
    const modo = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const desafio = url.searchParams.get("hub.challenge") || "";
    if (modo === "subscribe" && token && token === env("META_VERIFY_TOKEN")) {
      return new Response(desafio, { status: 200 });
    }
    return new Response("token de verificação inválido", { status: 403 });
  }

  if (req.method !== "POST") return new Response("ok", { status: 200 });

  let payload: any = {};
  try { payload = await req.json(); } catch { /* corpo vazio */ }

  const msgs = extrai(payload);
  if (msgs.length) {
    const trabalho = (async () => {
      for (const m of msgs) {
        try { await processa(m.canal, m.contato, m.nome, m.texto, m.mid); }
        catch (e) { console.error("processa", e); }
      }
    })();
    // responde 200 já (senão a Meta reenvia) e termina em segundo plano
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(trabalho);
    else await trabalho;
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
});
