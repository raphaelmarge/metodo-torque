// TORQUE ON — envia-email · e-mails do sistema (acesso do aluno, avisos)
//
// Esta função roda no SUPABASE e envia e-mails pelo Resend (resend.com) —
// a chave fica só aqui, nunca no site. O TORQUE ON usa esta função para
// mandar o ACESSO DO APP pro aluno/paciente na hora do cadastro:
// login (o e-mail dele) + senha temporária que ele troca depois.
//
// Como instalar (uma vez):
//   1. Crie uma conta grátis em resend.com (3.000 e-mails/mês no plano free).
//   2. Em resend.com → Domains, adicione o domínio torqueon.com.br e crie os
//      registros DNS que eles mostrarem (SPF/DKIM). Sem domínio verificado,
//      dá pra testar com o remetente onboarding@resend.dev, mas os e-mails
//      só chegam NA SUA PRÓPRIA caixa (limitação do Resend).
//   3. Em resend.com → API Keys, crie uma chave (começa com re_).
//   4. No Supabase: Edge Functions → Deploy new function → nome: envia-email →
//      cole este arquivo → Deploy. Pode DESLIGAR o "Verify JWT": a função
//      confere sozinha quem está chamando (pergunta ao Supabase de quem é o
//      token), então continua fechada pra quem não está logado.
//      Em Secrets, adicione:
//        RESEND_API_KEY = a chave re_...
//        EMAIL_DE       = TORQUE ON <acesso@torqueon.com.br>
//        (enquanto o domínio não verifica, use: TORQUE ON <onboarding@resend.dev>)
//
// Ações (POST JSON):
//   { acao: "ping" }
//   { acao: "enviar", para: "aluno@email.com", assunto: "...", html: "<p>...</p>" }

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


// só usuário LOGADO (personal/academia) pode usar — a chave pública não passa
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


Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "use POST" }, 405);

  if (!(await usuarioValidado(req))) {
    return json({ erro: "Entre na sua conta do TORQUE ON para usar esta função (a chave pública não basta)." }, 401);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ erro: "JSON inválido" }, 400);
  }

  const chave = Deno.env.get("RESEND_API_KEY") || "";
  const de = Deno.env.get("EMAIL_DE") || "TORQUE ON <onboarding@resend.dev>";

  if (body.acao === "ping") {
    return json({ ok: true, chaveConfigurada: !!chave, remetente: de });
  }
  if (!chave) {
    return json({ erro: "Configure RESEND_API_KEY nos Secrets da função (resend.com → API Keys)." }, 500);
  }

  if (body.acao === "enviar") {
    const para = String(body.para || "").trim().toLowerCase();
    const assunto = String(body.assunto || "").trim();
    const html = String(body.html || "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(para)) return json({ erro: "e-mail de destino inválido." }, 400);
    if (!assunto || !html) return json({ erro: "informe assunto e html." }, 400);
    if (html.length > 100_000) return json({ erro: "html grande demais." }, 400);

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + chave, "Content-Type": "application/json" },
      body: JSON.stringify({ from: de, to: [para], subject: assunto, html: html }),
    });
    const dados: any = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const msg = dados?.message || dados?.error?.message || String(resp.status);
      return json({ erro: "Resend recusou: " + msg }, 502);
    }
    return json({ ok: true, id: dados.id || null });
  }

  return json({ erro: "acao desconhecida (use ping ou enviar)." }, 400);
});
