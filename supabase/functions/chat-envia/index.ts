// TORQUE ON — Chat unificado · envio manual e sugestão de resposta (IA)
//
// Chamada pela tela Sistema → CRM → Chat e IA quando a EQUIPE responde
// uma conversa ou pede uma sugestão ao Claude. O token do WhatsApp, do
// Instagram e a chave da IA ficam guardados aqui no Supabase — nunca no site.
//
// Como instalar (uma vez):
//   1. Supabase → Edge Functions → Deploy new function → nome: chat-envia
//      → cole este arquivo → Deploy. Pode DESLIGAR o "Verify JWT" (Details da
//      função): esta função confere sozinha quem está chamando, perguntando ao
//      Supabase de quem é o token, e recusa quem não for da equipe. Em projeto
//      que trocou as chaves de assinatura, o portão recusa até token bom — com
//      o Verify JWT desligado a função volta a funcionar sem perder segurança.
//      Pela CLI: supabase functions deploy chat-envia --no-verify-jwt
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

/* Quem é o usuário da chamada — perguntando pro PRÓPRIO Supabase.
 *
 * Antes esta função só lia o miolo do JWT e confiava que o portão do Supabase
 * ("Verify JWT") tinha conferido a assinatura. Dois problemas apareceram:
 *   1. com o Verify JWT DESLIGADO, qualquer um podia forjar um token e passar;
 *   2. em projeto que trocou as chaves de assinatura, o portão passou a
 *      recusar até token BOM — e a função nem rodava (401 no diagnóstico).
 * Perguntando pro /auth/v1/user, o token é validado de verdade e a função
 * funciona com o Verify JWT ligado OU desligado. */
async function usuarioDoToken(req: Request): Promise<string> {
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt || jwt === env("SUPABASE_ANON_KEY")) return ""; // chave pública não é usuário
  try {
    const r = await fetch(env("SUPABASE_URL") + "/auth/v1/user", {
      headers: { Authorization: "Bearer " + jwt, apikey: env("SUPABASE_SERVICE_ROLE_KEY") },
    });
    if (!r.ok) return "";
    const u = await r.json();
    return (u && u.id) || "";
  } catch { return ""; }
}

/* Credencial da academia DONA da conversa. Sem isso, o robô responderia pelo
 * número do profissional e o botão Enviar da equipe pelo número do dono do
 * sistema — a mesma conversa saindo por dois números diferentes. */
async function credencialDa(aid: string): Promise<any> {
  try {
    const r = await sb(`zap_config?select=phone_id,token,ig_id,ig_token&academia_id=eq.${aid}`);
    const linhas = r.ok ? await r.json() : [];
    const c = linhas[0];
    if (c && (c.token || c.ig_token)) return c;
    // ninguém no sistema inteiro cadastrou número? então é instalação de dono
    // único: os Secrets globais continuam valendo, como sempre valeram
    const r2 = await sb("zap_config?select=academia_id&token=neq.&limit=1");
    const outros = r2.ok ? await r2.json() : [];
    if (!outros.length) return { donoUnico: true };
  } catch { /* sem banco: cai no modo dono único abaixo */ }
  return { donoUnico: true };
}

/* Quando a academia da conversa pode usar o número global:
 *  - é a academia do próprio dono do sistema (ACADEMIA_DONO_ID), ou
 *  - o dono liberou o número de propósito (WHATSAPP_COMPARTILHADO=sim), ou
 *  - a instalação é de dono único e ninguém cadastrou número nenhum ainda.
 * Sem isso, cada um responde pelo número dele — que é o modelo de cobrança. */
function podeUsarGlobal(aid: string): boolean {
  const dono = (env("ACADEMIA_DONO_ID") || "").trim();
  if (dono && aid && dono === aid) return true;
  return (env("WHATSAPP_COMPARTILHADO") || "").trim().toLowerCase() === "sim";
}

async function enviaMeta(cred: any, canal: string, contato: string, texto: string, aid?: string): Promise<{ ok: boolean; erro?: string }> {
  let r: Response;
  const emprestado = podeUsarGlobal(aid || "") || !!(cred && cred.donoUnico);
  if (canal === "instagram") {
    const token = (cred && cred.ig_token) || (emprestado ? env("INSTAGRAM_TOKEN") : "");
    const igId = (cred && cred.ig_id) || env("INSTAGRAM_IG_ID");
    if (!token) return { ok: false, erro: "Nenhuma conta do Instagram ligada nesta academia — cole o ID e o token em Configurações → WhatsApp." };
    r = await fetch(GRAPH + (igId ? "/" + igId : "/me") + "/messages?access_token=" + encodeURIComponent(token), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: contato }, message: { text: texto } }),
    });
  } else {
    const token = (cred && cred.token) || (emprestado ? env("WHATSAPP_TOKEN") : "");
    const fone = (cred && cred.phone_id) || (emprestado ? env("WHATSAPP_PHONE_ID") : "");
    if (!token || !fone) return { ok: false, erro: "Nenhum número do WhatsApp ligado nesta academia — cole o ID do número e o token em Configurações → WhatsApp." };
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
    // o número ligado nesta academia manda na resposta: antes o ping pintava
    // tudo verde com o número do dono, mentindo justo no diagnóstico
    const uidP = await usuarioDoToken(req);
    let credP: any = null;
    if (uidP) {
      const rm = await sb(`membros?select=academia_id&user_id=eq.${uidP}&limit=1`);
      const ms = rm.ok ? await rm.json() : [];
      if (ms[0]) credP = await credencialDa(ms[0].academia_id);
    }
    return json({
      ok: true,
      numeroProprio: !!(credP && credP.token && credP.phone_id),
      whatsapp: !!((credP && credP.token && credP.phone_id) ||
        ((credP && credP.donoUnico) && env("WHATSAPP_TOKEN") && env("WHATSAPP_PHONE_ID"))),
      instagram: !!((credP && credP.ig_token) || ((credP && credP.donoUnico) && env("INSTAGRAM_TOKEN"))),
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
    const uid = await usuarioDoToken(req);
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
    const uid = await usuarioDoToken(req);
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
    const uid = await usuarioDoToken(req);
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

  // ✨ IA prescritiva de treino: recebe a anamnese (+ catálogo, quando é o caso)
  // e devolve o treino em JSON. O "tipo" decide o FORMATO da resposta — é ele
  // que faz o treino cair na aba certa do painel (fichas × circuito × corrida).
  if (corpo.acao === "ia_treino") {
    const uid = await usuarioDoToken(req);
    const r1 = await sb(`membros?select=academia_id&user_id=eq.${uid}&limit=1`);
    if (!(r1.ok ? await r1.json() : []).length) return json({ erro: "sem permissão" }, 403);
    const chave = env("ANTHROPIC_API_KEY");
    if (!chave) return json({ erro: "Secret ANTHROPIC_API_KEY não configurado." }, 502);
    // 60000: a anamnese + catálogo passam folgado; 30000 cortava o rabo do catálogo
    const dados = String(corpo.dados || "").slice(0, 60000);
    if (!dados) return json({ erro: "dados vazios" }, 400);
    const SISTEMAS: Record<string, string> = {
      musculacao: "Você é um personal trainer sênior que prescreve treinos de musculação individualizados. " +
        "Recebe a anamnese completa do aluno e o catálogo de exercícios disponíveis e responde APENAS com um " +
        "JSON válido, sem markdown e sem comentários, neste formato exato: " +
        '{"fichas":[{"titulo":"A — Nome da ficha","itens":[{"nome":"Exercício","series":3,"reps":"10","descanso":90,"obs":"dica curta"}]}],"resumo":"2 a 3 frases explicando as escolhas"} ' +
        "Regras: use SOMENTE exercícios do catálogo recebido, com o nome EXATAMENTE igual; monte 1 ficha por dia " +
        "disponível (máximo 6); 5 a 8 exercícios por ficha; respeite lesões, PAR-Q, nível, equipamento e " +
        'preferências da anamnese; reps pode ser número ("10") ou tempo ("30s"); descanso em segundos; ' +
        "obs é opcional e curta (técnica ou cuidado com a lesão). Se o PAR-Q tiver resposta SIM, seja conservador " +
        "e avise no resumo que o aluno precisa de liberação médica antes de intensificar.",
      wod: "Você é um coach sênior de treino em circuito (estilo cross/HIIT) que prescreve WODs individualizados. " +
        "Recebe a anamnese completa do aluno e o catálogo de exercícios disponíveis e responde APENAS com um " +
        "JSON válido, sem markdown e sem comentários, neste formato exato: " +
        '{"wods":[{"nome":"Nome do circuito","tipo":"fortime","cap":12,"min":10,"rounds":8,"work":20,"rest":10,"movs":[{"q":"10","n":"Movimento"}],"aq":"aquecimento curto","obs":"dica curta"}],"resumo":"2 a 3 frases explicando as escolhas"} ' +
        'Regras: tipo é um de "fortime" (use cap = limite em minutos, 0 = livre), "amrap" ou "emom" (use min = ' +
        'duração em minutos) ou "tabata" (use rounds, work e rest em segundos); monte 1 circuito por dia disponível ' +
        "(máximo 6); 3 a 8 movimentos por circuito, cada um com q (quantidade, ex.: \"10\", \"200m\", \"30s\") e n " +
        "(nome do movimento — prefira nomes do catálogo recebido); aq é um aquecimento de 1 linha; respeite lesões, " +
        "PAR-Q, nível e equipamento da anamnese, escalando os movimentos quando precisar. Se o PAR-Q tiver resposta " +
        "SIM, seja conservador e avise no resumo que o aluno precisa de liberação médica antes de intensificar.",
      corrida: "Você é um treinador de corrida sênior que monta planilhas individualizadas. " +
        "Recebe a anamnese do aluno e o objetivo e responde APENAS com um JSON válido, sem markdown e sem " +
        "comentários, neste formato exato: " +
        '{"cardio":[{"nome":"Rodagem leve","mod":"corrida","tipo":"continuo","dist":5,"tempo":0,"pace":"6:30","reps":8,"tiro":60,"desc":90,"obs":"dica curta"}],"resumo":"2 a 3 frases explicando a semana"} ' +
        'Regras: monte a SEMANA de treinos (1 por dia disponível, máximo 6), variando rodagem leve, intervalado ' +
        '(tiros) e um treino mais longo; mod é "corrida", "caminhada" ou "bike"; tipo é "continuo" (use dist em km ' +
        'e/ou tempo em minutos; 0 = livre; pace alvo opcional no formato "6:30") ou "intervalado" (use reps = número ' +
        "de tiros, tiro = segundos forte, desc = segundos leve); iniciante começa com caminhada ou corrida+caminhada " +
        "e pace conservador; progressão prudente (nada de saltos de volume); respeite lesões e PAR-Q. Se o PAR-Q " +
        "tiver resposta SIM, seja conservador e avise no resumo que o aluno precisa de liberação médica.",
    };
    const tipoIa = String(corpo.tipo || "musculacao");
    const r2 = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-opus-4-8",
        // max_tokens cobre o raciocínio E o JSON juntos — 6000 truncava ficha longa
        max_tokens: 12000,
        thinking: { type: "adaptive" },
        system: SISTEMAS[tipoIa] || SISTEMAS.musculacao,
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
    const uid = await usuarioDoToken(req);
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

  const uid = await usuarioDoToken(req);
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
    const envio = await enviaMeta(await credencialDa(conversa.academia_id), conversa.canal, conversa.contato_id, texto, conversa.academia_id);
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
