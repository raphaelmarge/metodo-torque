// TORQUE ON — suporte · abre CHAMADO com protocolo rastreável (v708)
//
// O professor abre um chamado pelo painel (bug, alteração, crítica ou
// sugestão). Esta função:
//   1. valida o login de verdade (pergunta ao Supabase de quem é o token);
//   2. confere que o usuário é MEMBRO da academia informada;
//   3. gera o protocolo no SERVIDOR (TQ-AAAAMMDD-XXXX) e grava o chamado na
//      tabela suporte_chamados — o registro é o rastreio: existe mesmo que o
//      e-mail falhe, e o professor lê os próprios chamados pela RLS;
//   4. avisa o suporte por e-mail (Resend), com reply-to no e-mail do
//      professor pra resposta ir direto pra ele.
//
// Secrets usados: RESEND_API_KEY e EMAIL_DE (os mesmos da envia-email) e
// EMAIL_SUPORTE (opcional — sem ele, vale suporte@torqueon.com.br).
//
// Ações (POST JSON):
//   { acao: "ping" }
//   { acao: "abrir", aid, tipo: "bug"|"alteracao"|"critica"|"sugestao",
//     msg: "...", email: "quem responde pra mim" }

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

function env(k: string): string {
  return (Deno.env.get(k) || "").trim();
}

/* Valida o token DE VERDADE, perguntando pro próprio Supabase quem é o dono
 * dele — o mesmo desenho da envia-email (ler só o miolo do JWT deixava passar
 * token forjado com o Verify JWT desligado). */
async function usuarioValidado(req: Request): Promise<string> {
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const anon = env("SUPABASE_ANON_KEY");
  if (!jwt || (anon && jwt === anon)) return "";
  try {
    const r = await fetch(env("SUPABASE_URL") + "/auth/v1/user", {
      headers: { Authorization: "Bearer " + jwt, apikey: env("SUPABASE_SERVICE_ROLE_KEY") },
    });
    if (!r.ok) return "";
    const u = await r.json();
    return (u && u.id) || "";
  } catch { return ""; }
}

// REST com a service key (a função escreve; o site nunca vê esta chave)
function rest(caminho: string, init: RequestInit = {}): Promise<Response> {
  const svc = env("SUPABASE_SERVICE_ROLE_KEY");
  return fetch(env("SUPABASE_URL") + "/rest/v1/" + caminho, {
    ...init,
    headers: {
      apikey: svc, Authorization: "Bearer " + svc,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

// TQ-AAAAMMDD-XXXX — sem 0/O/1/I pra ninguém soletrar errado no telefone
function novoProtocolo(): string {
  // v747: a data é a do BRASIL — o servidor vive em UTC e um chamado aberto às
  // 22h em BH nascia com a data de amanhã, diferente da que o professor via
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()).replace(/-/g, "");
  const alf = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suf = "";
  const rnd = crypto.getRandomValues(new Uint8Array(4));
  for (const b of rnd) suf += alf[b % alf.length];
  return "TQ-" + dia + "-" + suf;
}

const TIPOS: Record<string, string> = {
  bug: "Problema (bug)", alteracao: "Pedido de alteração",
  critica: "Crítica", sugestao: "Sugestão",
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "use POST" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ erro: "JSON inválido" }, 400); }

  if (body.acao === "ping") {
    return json({ ok: true, regras: ["chamado", "tipo-validado", "protocolo-br", "email-validado"], emailConfigurado: !!env("RESEND_API_KEY") });
  }

  const uid = await usuarioValidado(req);
  if (!uid) return json({ erro: "Entre na sua conta do TORQUE ON para abrir um chamado." }, 401);

  if (body.acao === "abrir") {
    const aid = String(body.aid || "").trim();
    const tipo = TIPOS[String(body.tipo || "")] ? String(body.tipo) : "bug";
    const msg = String(body.msg || "").trim().slice(0, 4000);
    // e-mail inválido vira vazio (ele só serve de reply_to — o Resend recusaria o envio inteiro)
    const emailCru = String(body.email || "").trim().toLowerCase().slice(0, 200);
    const email = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailCru) ? emailCru : "";
    if (!/^[0-9a-f-]{36}$/.test(aid)) return json({ erro: "academia inválida." }, 400);
    if (msg.length < 10) return json({ erro: "Escreva o chamado com pelo menos 10 caracteres." }, 400);

    // só membro da academia abre chamado NELA — o aid do corpo não é confiável
    const rm = await rest("membros?academia_id=eq." + aid + "&user_id=eq." + uid + "&select=user_id&limit=1");
    const membros = rm.ok ? await rm.json().catch(() => []) : [];
    if (!Array.isArray(membros) || !membros.length) {
      return json({ erro: "Você não faz parte desta conta." }, 403);
    }

    // grava com protocolo único (colisão é raríssima; 3 tentativas cobrem)
    let protocolo = "", gravado = false;
    for (let i = 0; i < 3 && !gravado; i++) {
      protocolo = novoProtocolo();
      const ri = await rest("suporte_chamados", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        // v747: grava o tipo VALIDADO (o cru deixava entrar valor fora da lista, diferente do e-mail)
        body: JSON.stringify({ protocolo, academia_id: aid, user_id: uid, email, tipo, mensagem: msg }),
      });
      if (ri.ok) gravado = true;
      else if (ri.status !== 409) {
        const t = await ri.text().catch(() => "");
        console.error("suporte insert", ri.status, t);
        return json({ erro: "Não deu pra registrar o chamado agora (a tabela suporte_chamados existe no banco?)." }, 500);
      }
    }
    if (!gravado) return json({ erro: "Não deu pra gerar um protocolo único — tente de novo." }, 500);

    // e-mail pro suporte: aviso, não rastreio — o chamado JÁ está registrado
    let emailEnviado = false;
    const chave = env("RESEND_API_KEY");
    if (chave) {
      const para = env("EMAIL_SUPORTE") || "suporte@torqueon.com.br";
      const de = env("EMAIL_DE") || "TORQUE ON <onboarding@resend.dev>";
      const html =
        "<h2>Chamado " + protocolo + "</h2>" +
        "<p><b>Tipo:</b> " + TIPOS[tipo] + "<br><b>Academia:</b> " + aid +
        "<br><b>Usuário:</b> " + uid + (email ? "<br><b>Responder pra:</b> " + esc(email) : "") + "</p>" +
        "<p style='white-space:pre-wrap;border-left:3px solid #7c3aed;padding-left:12px;'>" + esc(msg) + "</p>";
      try {
        const re = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: "Bearer " + chave, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: de, to: [para],
            subject: "[" + protocolo + "] " + TIPOS[tipo] + " — TORQUE ON",
            html,
            ...(email ? { reply_to: email } : {}),
          }),
        });
        emailEnviado = re.ok;
        if (!re.ok) console.error("suporte resend", re.status, await re.text().catch(() => ""));
      } catch (e) { console.error("suporte resend", e); }
    }

    return json({ ok: true, protocolo, emailEnviado });
  }

  return json({ erro: "acao desconhecida (use ping ou abrir)." }, 400);
});
