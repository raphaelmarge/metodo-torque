// TORQUE ON — Chat unificado · envio manual e sugestão de resposta (IA)
//
// Chamada pela tela Sistema → CRM → Chat e IA quando a EQUIPE responde
// uma conversa ou pede uma sugestão ao Claude. O token do WhatsApp, do
// Instagram e a chave da IA ficam guardados aqui no Supabase — nunca no site.
//
// Como instalar (uma vez):
//   1. Supabase → Edge Functions → Deploy new function → nome: chat-envia
//      → cole este arquivo → Deploy (deixe "Verify JWT" LIGADO: só a equipe
//      logada consegue chamar). Pela CLI: supabase functions deploy chat-envia
//   2. Usa os mesmos secrets da função meta-webhook:
//        WHATSAPP_TOKEN / WHATSAPP_PHONE_ID / INSTAGRAM_TOKEN / ANTHROPIC_API_KEY
//
// Ações (POST JSON):
//   { acao: "ping" }                                → confere quais secrets existem
//   { acao: "enviar",  conversa_id: "...", texto }  → envia pelo canal da conversa
//   { acao: "sugerir", conversa_id: "..." }         → devolve sugestão da IA (não envia)
//   { acao: "ia_treino", dados: "anamnese+catálogo" } → IA monta as fichas de treino (JSON)
//   { acao: "ia_dieta",  dados: "paciente+alvos+alimentos" } → IA monta o plano alimentar (JSON)

const GRAPH = "https://graph.facebook.com/v21.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function env(k: string): string {
  return Deno.env.get(k) || "";
}

function sb(path: string, init: RequestInit = {}): Promise<Response> {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  return fetch(env("SUPABASE_URL") + "/rest/v1/" + path, {
    ...init,
    headers: {
      apikey: key, Authorization: "Bearer " + key,
      "Content-Type": "application/json", ...(init.headers || {}),
    },
  });
}

// usuário do token JWT (a plataforma já validou a assinatura)
function usuarioDoToken(req: Request): string {
  try {
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const corpo = JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return corpo.sub || "";
  } catch { return ""; }
}

async function enviaMeta(canal: string, contato: string, texto: string): Promise<{ ok: boolean; erro?: string }> {
  let r: Response;
  if (canal === "instagram") {
    const token = env("INSTAGRAM_TOKEN");
    if (!token) return { ok: false, erro: "Secret INSTAGRAM_TOKEN não configurado no Supabase." };
    r = await fetch(GRAPH + "/me/messages?access_token=" + encodeURIComponent(token), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: contato }, message: { text: texto } }),
    });
  } else {
    const token = env("WHATSAPP_TOKEN"), fone = env("WHATSAPP_PHONE_ID");
    if (!token || !fone) return { ok: false, erro: "Secrets WHATSAPP_TOKEN / WHATSAPP_PHONE_ID não configurados." };
    r = await fetch(GRAPH + "/" + fone + "/messages", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: contato, type: "text", text: { body: texto } }),
    });
  }
  if (r.ok) return { ok: true };
  const detalhe = await r.text();
  console.error("meta envio", canal, r.status, detalhe);
  return { ok: false, erro: "A Meta recusou o envio (" + r.status + "). Confira o token e a janela de 24h." };
}

// Erro da API da Anthropic traduzido pro que fazer — "IA indisponível agora."
// escondia chave revogada, falta de crédito e limite de uso, e o motivo ficava
// só no log da função, que ninguém abre.
function erroAnthropic(status: number): string {
  if (status === 401 || status === 403) {
    return "A Anthropic recusou a chave (" + status + ") — confira o secret ANTHROPIC_API_KEY no Supabase e gere uma chave nova em console.anthropic.com se precisar.";
  }
  if (status === 429) return "A IA está no limite de uso agora (429) — espere 1 minuto e tente de novo. Se seguir assim, confira o crédito em console.anthropic.com.";
  if (status === 400) return "A Anthropic recusou a chamada (400) — tente de novo; se seguir assim, republique a chat-envia (funcoes.html).";
  if (status >= 500) return "A IA está fora do ar neste momento (" + status + ") — tente de novo em alguns minutos.";
  return "IA indisponível agora (" + status + ").";
}

// junta os blocos de texto e recusa resposta cortada/vazia com recado honesto
function textoDaResposta(d: any): { ok: boolean; texto?: string; erro?: string } {
  let texto = "";
  for (const b of d.content || []) if (b.type === "text") texto += b.text;
  texto = texto.trim();
  if (d.stop_reason === "max_tokens") {
    return { ok: false, erro: "A resposta da IA veio cortada no meio — tente de novo (costuma resolver)." };
  }
  if (!texto) return { ok: false, erro: "A IA não devolveu texto — tente de novo." };
  return { ok: true, texto };
}

async function respostaIA(historico: { de: string; texto: string }[], promptExtra: string): Promise<string> {
  const chave = env("ANTHROPIC_API_KEY");
  if (!chave) return "";
  const msgs: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of historico) {
    const role = m.de === "cliente" ? "user" : "assistant";
    const ultimo = msgs[msgs.length - 1];
    if (ultimo && ultimo.role === role) ultimo.content += "\n" + m.texto;
    else msgs.push({ role, content: m.texto });
  }
  if (!msgs.length) return "";
  if (msgs[0].role === "assistant") msgs.unshift({ role: "user", content: "(início da conversa)" });
  if (msgs[msgs.length - 1].role === "assistant") {
    msgs.push({ role: "user", content: "(o cliente ainda não respondeu — sugira uma continuação curta)" });
  }

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
  if (!r.ok) { console.error("anthropic", r.status, await r.text()); return ""; }
  const d = await r.json();
  let texto = "";
  for (const b of d.content || []) if (b.type === "text") texto += b.text;
  return texto.trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "use POST" }, 405);

  let corpo: any = {};
  try { corpo = await req.json(); } catch { return json({ erro: "JSON inválido" }, 400); }

  if (corpo.acao === "ping") {
    return json({
      ok: true,
      whatsapp: !!(env("WHATSAPP_TOKEN") && env("WHATSAPP_PHONE_ID")),
      instagram: !!env("INSTAGRAM_TOKEN"),
      ia: !!env("ANTHROPIC_API_KEY"),
      verify: !!env("META_VERIFY_TOKEN"),
      // o diagnóstico usa esta lista pra saber se a função publicada está
      // atualizada — uma versão velha responde o ping sem ela
      acoes: ["ping", "testar", "ajuda", "analisar", "ia_treino", "ia_dieta", "sugerir", "enviar"],
    });
  }

  // simulador do chatbot: responde com a IA usando um histórico de teste
  // (não envia nada para a Meta, não grava nada)
  if (corpo.acao === "testar") {
    const uid = usuarioDoToken(req);
    let r = await sb(`membros?select=academia_id&user_id=eq.${uid}&limit=1`);
    const m = (r.ok ? await r.json() : [])[0];
    if (!m) return json({ erro: "sem permissão" }, 403);
    r = await sb(`chat_config?select=prompt&academia_id=eq.${m.academia_id}`);
    const prompt = ((r.ok ? await r.json() : [])[0] || {}).prompt || "";
    const hist = Array.isArray(corpo.historico) ? corpo.historico.slice(-20) : [];
    const texto = await respostaIA(hist, prompt);
    if (!texto) return json({ erro: "IA indisponível — confira o secret ANTHROPIC_API_KEY." }, 502);
    return json({ ok: true, texto });
  }

  // central de ajuda: o Claude responde dúvidas de uso com base no manual
  if (corpo.acao === "ajuda") {
    const uid = usuarioDoToken(req);
    let r = await sb(`membros?select=academia_id&user_id=eq.${uid}&limit=1`);
    if (!(r.ok ? await r.json() : []).length) return json({ erro: "sem permissão" }, 403);
    const chave = env("ANTHROPIC_API_KEY");
    if (!chave) return json({ erro: "Secret ANTHROPIC_API_KEY não configurado." }, 502);
    const manual = String(corpo.contexto || "").slice(0, 24000);
    const hist = Array.isArray(corpo.historico) ? corpo.historico.slice(-8) : [];
    const msgs: { role: "user" | "assistant"; content: string }[] = [];
    for (const m of hist) {
      const role = m.de === "eu" ? "user" : "assistant";
      const ultimo = msgs[msgs.length - 1];
      if (ultimo && ultimo.role === role) ultimo.content += "\n" + m.texto;
      else msgs.push({ role, content: String(m.texto || "").slice(0, 2000) });
    }
    if (!msgs.length || msgs[msgs.length - 1].role !== "user") return json({ erro: "pergunta vazia" }, 400);
    const r2 = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-opus-4-8",
        max_tokens: 900,
        thinking: { type: "adaptive" },
        system: "Você é o assistente de suporte do TORQUE ON, o sistema de gestão da academia TORQUE FIT. " +
          "Responda em português do Brasil, curto e direto, SEMPRE com base no manual abaixo. " +
          "Cite o caminho do menu exatamente como está no manual (ex.: Sistema → Operação → Entrada). " +
          "Se a resposta não estiver no manual, diga honestamente que esse recurso não existe (ou ainda não) " +
          "e aponte o tutorial mais próximo. Nunca invente telas, botões ou passos.\n\n=== MANUAL ===\n" + manual,
        messages: msgs,
      }),
    });
    if (!r2.ok) { console.error("anthropic", r2.status, await r2.text()); return json({ erro: erroAnthropic(r2.status) }, 502); }
    const t = textoDaResposta(await r2.json());
    if (!t.ok) return json({ erro: t.erro }, 502);
    return json({ ok: true, texto: t.texto });
  }

  // copiloto do dono: análise de gestão com o Claude (não envia nada a ninguém)
  if (corpo.acao === "analisar") {
    const uid = usuarioDoToken(req);
    let r = await sb(`membros?select=academia_id&user_id=eq.${uid}&limit=1`);
    const m = (r.ok ? await r.json() : [])[0];
    if (!m) return json({ erro: "sem permissão" }, 403);
    const chave = env("ANTHROPIC_API_KEY");
    if (!chave) return json({ erro: "Secret ANTHROPIC_API_KEY não configurado." }, 502);
    const dados = String(corpo.dados || "").slice(0, 12000);
    const r2 = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-opus-4-8",
        max_tokens: 1500,
        thinking: { type: "adaptive" },
        system: "Você é um consultor sênior de gestão de academias no Brasil. Recebe os números e a lista " +
          "de alunos em risco de uma academia e devolve um diagnóstico curto e ACIONÁVEL em português: " +
          "1) leitura geral em 2-3 frases; 2) os 3 movimentos mais importantes desta semana, em ordem de impacto, " +
          "cada um com o passo concreto; 3) para os alunos de maior risco, a abordagem certa (tom e argumento). " +
          "Seja direto, use os números recebidos, não invente dados. Sem markdown pesado — texto corrido com quebras.",
        messages: [{ role: "user", content: dados }],
      }),
    });
    if (!r2.ok) { console.error("anthropic", r2.status, await r2.text()); return json({ erro: erroAnthropic(r2.status) }, 502); }
    const t = textoDaResposta(await r2.json());
    if (!t.ok) return json({ erro: t.erro }, 502);
    return json({ ok: true, texto: t.texto });
  }

  // ✨ IA prescritiva de treino: recebe a anamnese + catálogo e devolve as fichas em JSON
  if (corpo.acao === "ia_treino") {
    const uid = usuarioDoToken(req);
    const r1 = await sb(`membros?select=academia_id&user_id=eq.${uid}&limit=1`);
    if (!(r1.ok ? await r1.json() : []).length) return json({ erro: "sem permissão" }, 403);
    const chave = env("ANTHROPIC_API_KEY");
    if (!chave) return json({ erro: "Secret ANTHROPIC_API_KEY não configurado." }, 502);
    // 60000: a anamnese + catálogo passam folgado; 30000 cortava o rabo do catálogo
    const dados = String(corpo.dados || "").slice(0, 60000);
    if (!dados) return json({ erro: "dados vazios" }, 400);
    const r2 = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-opus-4-8",
        // max_tokens cobre o raciocínio E o JSON juntos — 6000 truncava ficha longa
        max_tokens: 12000,
        thinking: { type: "adaptive" },
        system: "Você é um personal trainer sênior que prescreve treinos de musculação individualizados. " +
          "Recebe a anamnese completa do aluno e o catálogo de exercícios disponíveis e responde APENAS com um " +
          "JSON válido, sem markdown e sem comentários, neste formato exato: " +
          '{"fichas":[{"titulo":"A — Nome da ficha","itens":[{"nome":"Exercício","series":3,"reps":"10","descanso":90,"obs":"dica curta"}]}],"resumo":"2 a 3 frases explicando as escolhas"} ' +
          "Regras: use SOMENTE exercícios do catálogo recebido, com o nome EXATAMENTE igual; monte 1 ficha por dia " +
          "disponível (máximo 6); 5 a 8 exercícios por ficha; respeite lesões, PAR-Q, nível, equipamento e " +
          'preferências da anamnese; reps pode ser número ("10") ou tempo ("30s"); descanso em segundos; ' +
          "obs é opcional e curta (técnica ou cuidado com a lesão). Se o PAR-Q tiver resposta SIM, seja conservador " +
          "e avise no resumo que o aluno precisa de liberação médica antes de intensificar.",
        messages: [{ role: "user", content: dados }],
      }),
    });
    if (!r2.ok) { console.error("anthropic", r2.status, await r2.text()); return json({ erro: erroAnthropic(r2.status) }, 502); }
    const t = textoDaResposta(await r2.json());
    if (!t.ok) return json({ erro: t.erro }, 502);
    return json({ ok: true, texto: t.texto });
  }

  // 🥦 IA de dieta: recebe o perfil do paciente + alvos + catálogo de alimentos e devolve o plano em JSON
  if (corpo.acao === "ia_dieta") {
    const uid = usuarioDoToken(req);
    const r1 = await sb(`membros?select=academia_id&user_id=eq.${uid}&limit=1`);
    if (!(r1.ok ? await r1.json() : []).length) return json({ erro: "sem permissão" }, 403);
    const chave = env("ANTHROPIC_API_KEY");
    if (!chave) return json({ erro: "Secret ANTHROPIC_API_KEY não configurado." }, 502);
    // 60000: perfil + catálogo de alimentos passam folgado; 30000 cortava os
    // "Meus alimentos", que vêm no fim
    const dados = String(corpo.dados || "").slice(0, 60000);
    if (!dados) return json({ erro: "dados vazios" }, 400);
    const r2 = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-opus-4-8",
        // max_tokens cobre o raciocínio E o JSON juntos — 6000 truncava plano longo
        max_tokens: 12000,
        thinking: { type: "adaptive" },
        system: "Você é um nutricionista clínico sênior que monta planos alimentares individualizados no padrão brasileiro. " +
          "Recebe o perfil do paciente (dados, objetivo, alvos calóricos e de macros, restrições) e o catálogo de alimentos " +
          "disponíveis, e responde APENAS com um JSON válido, sem markdown e sem comentários, neste formato exato: " +
          '{"refeicoes":[{"hora":"07:00","titulo":"Café da manhã","itens":[{"nome":"Alimento do catálogo","qtd":1.5}]}],"resumo":"2 a 3 frases explicando as escolhas"} ' +
          "Regras: use SOMENTE alimentos do catálogo recebido, com o nome EXATAMENTE igual; monte de 4 a 6 refeições " +
          "distribuídas ao longo do dia (hora no formato HH:MM); qtd é o multiplicador da porção usual informada no " +
          "catálogo (aceita meio, ex.: 1.5); some perto do alvo de kcal e de proteína recebidos; RESPEITE as restrições " +
          "e alergias do paciente sem exceção; varie fontes de proteína, carboidrato e fibras entre as refeições; " +
          "o resumo explica a lógica e cita qualquer cuidado clínico relevante.",
        messages: [{ role: "user", content: dados }],
      }),
    });
    if (!r2.ok) { console.error("anthropic", r2.status, await r2.text()); return json({ erro: erroAnthropic(r2.status) }, 502); }
    const t = textoDaResposta(await r2.json());
    if (!t.ok) return json({ erro: t.erro }, 502);
    return json({ ok: true, texto: t.texto });
  }

  // ação que este arquivo não conhece = provavelmente o SITE está mais novo
  // que a função publicada (ou vice-versa) — melhor do que cair no erro
  // enigmático de "conversa_id obrigatório"
  if (corpo.acao !== "enviar" && corpo.acao !== "sugerir") {
    return json({ erro: "Ação desconhecida (" + String(corpo.acao || "?") + ") — a chat-envia publicada está desatualizada. Copie e publique de novo em www.torqueon.com.br/funcoes.html." }, 400);
  }

  if (!corpo.conversa_id) return json({ erro: "conversa_id obrigatório" }, 400);

  // conversa + confirmação de que quem chama é membro da academia dela
  let r = await sb(`chat_conversas?select=id,academia_id,canal,contato_id&id=eq.${corpo.conversa_id}`);
  const conversa = (r.ok ? await r.json() : [])[0];
  if (!conversa) return json({ erro: "conversa não encontrada" }, 404);

  const uid = usuarioDoToken(req);
  r = await sb(`membros?select=user_id,nome,email&academia_id=eq.${conversa.academia_id}&user_id=eq.${uid}`);
  const membro = (r.ok ? await r.json() : [])[0];
  if (!membro) return json({ erro: "sem permissão nesta academia" }, 403);

  if (corpo.acao === "sugerir") {
    r = await sb(`chat_mensagens?select=de,texto&conversa_id=eq.${conversa.id}&order=criado.desc&limit=20`);
    const hist = (r.ok ? await r.json() : []).reverse();
    r = await sb(`chat_config?select=prompt&academia_id=eq.${conversa.academia_id}`);
    const prompt = ((r.ok ? await r.json() : [])[0] || {}).prompt || "";
    const texto = await respostaIA(hist, prompt);
    if (!texto) return json({ erro: "IA indisponível — confira o secret ANTHROPIC_API_KEY." }, 502);
    return json({ ok: true, texto });
  }

  if (corpo.acao === "enviar") {
    const texto = String(corpo.texto || "").trim();
    if (!texto) return json({ erro: "texto vazio" }, 400);
    const envio = await enviaMeta(conversa.canal, conversa.contato_id, texto);
    if (!envio.ok) return json({ erro: envio.erro }, 502);
    // nome de quem respondeu (aparece no balão pra equipe toda saber quem falou)
    const autor = String(membro.nome || membro.email || "").split("@")[0].slice(0, 60);
    const linha: any = { conversa_id: conversa.id, academia_id: conversa.academia_id, de: "equipe", texto, autor };
    let grava = await sb("chat_mensagens", { method: "POST", body: JSON.stringify(linha) });
    if (!grava.ok) {
      // banco ainda sem a coluna autor (SQL novo não rodou) — grava sem o nome
      delete linha.autor;
      await sb("chat_mensagens", { method: "POST", body: JSON.stringify(linha) });
    }
    await sb(`chat_conversas?id=eq.${conversa.id}`, {
      method: "PATCH",
      body: JSON.stringify({ ultima_msg: texto.slice(0, 120), nao_lidas: 0, atualizado: new Date().toISOString() }),
    });
    return json({ ok: true });
  }

  return json({ erro: "ação desconhecida" }, 400);
});
