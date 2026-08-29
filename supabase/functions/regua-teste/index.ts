// supabase/functions/regua-teste/index.ts
//
// A RÉGUA DO TESTE GRÁTIS. Quem cria conta e fica no teste (assinatura_status
// = 'trial') recebe 4 e-mails: dia 1, 3, 7 e 12 desde a criação da academia.
// Quem chama esta função é o pg_cron do próprio banco, uma vez por dia, com a
// senha que mora na tabela selada regua_config — ninguém de fora consegue
// disparar e-mail (sem a senha certa a função devolve 401 e não faz nada).
//
// Ações:
//   { acao: "ping" }                    → { ok, regras } (diagnóstico, aberto)
//   { senha, acao: "previa" }           → a coorte de hoje SEM enviar nada
//   { senha }                           → envia os e-mails do dia e registra
//
// Publique com Verify JWT DESLIGADO (a senha da tabela é o portão).
// Secrets usados: RESEND_API_KEY e EMAIL_DE (os mesmos da envia-email).

function env(k: string): string {
  return (Deno.env.get(k) || "").trim();
}

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function sb(path: string, init: RequestInit = {}): Promise<Response> {
  const url = env("SUPABASE_URL") + "/rest/v1/" + path;
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const headers = new Headers(init.headers || {});
  headers.set("apikey", key);
  headers.set("Authorization", "Bearer " + key);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(url, { ...init, headers });
}

const SITE = "https://www.torqueon.com.br";
const ZAP = "https://wa.me/5521994429198?text=" +
  encodeURIComponent("Oi! Estou testando o TORQUE PERSONAL e quero assinar 💪");

function molde(titulo: string, corpo: string, botao: string, url: string): string {
  // e-mail é documento autônomo: hex cravado, nada de var()
  return "<div style='font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:8px;'>" +
    "<h2 style='color:#7c3aed;margin:0 0 4px;'>TORQUE PERSONAL</h2>" +
    "<h3 style='color:#1a1723;margin:0 0 12px;font-size:19px;'>" + titulo + "</h3>" +
    "<div style='color:#3d3849;font-size:14.5px;line-height:1.7;'>" + corpo + "</div>" +
    "<a href='" + url + "' style='display:block;text-align:center;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#ffffff;text-decoration:none;font-weight:800;border-radius:12px;padding:14px;font-size:15px;margin-top:18px;'>" + botao + "</a>" +
    "<p style='color:#8a8695;font-size:12px;margin-top:16px;'>Você recebe estes lembretes durante os 14 dias de teste do TORQUE PERSONAL. Assinou, eles param sozinhos.</p></div>";
}

function emailDoDia(dia: number, nome: string): { assunto: string; html: string } | null {
  const n = (nome || "").split(" ")[0] || "professor";
  if (dia === 1) {
    return {
      assunto: "Seu primeiro aluno no app leva 2 minutos",
      html: molde("Bem-vindo ao teste, " + n + "!",
        "O caminho mais curto pro <b>uau</b>: no Início do painel tem o guia <b>Seu primeiro dia, em 3 passos</b> — cadastre um aluno, monte a ficha (ou deixe a IA montar) e abra o app dele. É quando você vê <b>a sua marca</b> no celular do aluno que a ficha cai.",
        "Abrir meu painel", SITE + "/personal.html"),
    };
  }
  if (dia === 3) {
    return {
      assunto: "Deixa a IA montar o mês de um aluno",
      html: molde("Dia 3 — o rascunho pronto",
        "Em <b>Treinos → Gerar com IA</b>, a inteligência artificial monta o <b>mês inteiro</b> de um aluno (4 semanas de progressão, a 4ª mais leve) — e obedece o que <b>você</b> escrever sobre ele. Você revisa e publica. A noite de domingo agradece.",
        "Testar a IA de treino", SITE + "/personal.html"),
    };
  }
  if (dia === 7) {
    return {
      assunto: "Metade do teste: a cobrança já pode se cobrar sozinha",
      html: molde("Dia 7 de 14",
        "Liga o seu <b>Mercado Pago, Asaas ou Pagar.me</b> em Configurações → Receber dos alunos: o link de cobrança sai do painel, o aluno paga e a <b>baixa entra sozinha</b> — direto na SUA conta, sem passar pela gente. A planilha do fim do mês aposenta.",
        "Configurar a cobrança", SITE + "/personal.html"),
    };
  }
  if (dia === 12) {
    return {
      assunto: "Faltam 2 dias de teste — e seus alunos nem percebem a troca",
      html: molde("Faltam 2 dias, " + n,
        "Seu teste termina em 2 dias. Assinando, tudo que você montou continua exatamente onde está — alunos, fichas, financeiro — por <b>R$ 49/mês</b>, alunos ilimitados, sem fidelidade. Qualquer dúvida, chama no WhatsApp que a gente resolve junto.",
        "Quero assinar 💪", ZAP),
    };
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ erro: "use POST" }, 405);
  let body: any = {};
  try { body = await req.json(); } catch { /* segue vazio */ }

  if (body.acao === "ping") {
    return json({
      ok: true,
      email: !!env("RESEND_API_KEY"),
      regras: ["trial", "d1", "d3", "d7", "d12", "log-por-marco"],
    });
  }

  // o portão: a senha vive na tabela selada regua_config (RLS sem política —
  // só a service key alcança). pg_cron manda a mesma senha lida do banco.
  const rCfg = await sb("regua_config?id=eq.1&select=token");
  const cfg = await rCfg.json().catch(() => []);
  const token = Array.isArray(cfg) && cfg[0] ? String(cfg[0].token) : "";
  if (!token || String(body.senha || "") !== token) {
    return json({ erro: "senha errada ou régua não instalada (rode o SQL)." }, 401);
  }

  const rPend = await sb("rpc/regua_pendentes", { method: "POST", body: "{}" });
  const pend: any[] = (await rPend.json().catch(() => [])) || [];
  if (!Array.isArray(pend)) return json({ erro: "regua_pendentes não respondeu lista." }, 500);

  if (body.acao === "previa") {
    return json({ ok: true, previa: pend.map((p) => ({ dia: p.dia, nome: p.nome, email: p.email })) });
  }

  const chave = env("RESEND_API_KEY");
  const de = env("EMAIL_DE") || "TORQUE ON <onboarding@resend.dev>";
  if (!chave) return json({ erro: "Configure RESEND_API_KEY nos Secrets." }, 500);

  let enviados = 0, falhas = 0;
  for (const p of pend) {
    const m = emailDoDia(+p.dia, String(p.nome || ""));
    if (!m || !p.email) continue;
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + chave, "Content-Type": "application/json" },
      body: JSON.stringify({ from: de, to: [p.email], subject: m.assunto, html: m.html }),
    });
    if (resp.ok) {
      enviados++;
      // marca SÓ quando o Resend aceitou — falhou, tenta de novo amanhã
      await sb("regua_log", {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates" },
        body: JSON.stringify({ academia_id: p.academia_id, marco: "d" + p.dia }),
      });
    } else {
      falhas++;
      console.error("regua resend", resp.status, await resp.text().catch(() => ""));
    }
  }
  return json({ ok: true, pendentes: pend.length, enviados, falhas });
});
