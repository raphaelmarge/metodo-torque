// TORQUE ON — Push de verdade (Web Push) · envia notificações aos apps
//
// Envia notificações push para os alunos que ativaram os lembretes no app
// HOSPEDADO (site/app/?t=TOKEN). O app baixado (arquivo .html) não recebe
// push — limitação dos navegadores, não do sistema.
//
// Como instalar (uma vez):
//   1. Rode o bloco PUSH DE VERDADE do supabase-setup.sql.
//   2. Deploy desta função com o nome: push-envia (Verify JWT LIGADO).
//   3. Secrets (as duas chaves são um PAR — trocar uma sem a outra quebra o push):
//        VAPID_PUBLIC_KEY  = BLesSk80OGEOnbJj9iqH2_KHPIhdN0GsGhVpuVWx4O7YqvtV_P961-hqBtqOHw3SWp3GnwDbpauRyEcRVFmdb-I
//        VAPID_PRIVATE_KEY = (a metade secreta desta pública — o Raphael recebeu na conversa;
//                             ela NUNCA entra no repositório, só nos Secrets do Supabase)
//      Perdeu a privada? Gere um par novo (npx web-push generate-vapid-keys) e troque a
//      pública nos TRÊS lugares que o app usa — app/aluno-builder.js, apps/app-aluno.html
//      e nutricao.html — senão o navegador recusa a inscrição.
//   4. Agendar o lembrete diário: Supabase → Integrations → Cron (pg_cron):
//        select cron.schedule('lembrete-aulas', '0 9 * * *', $$
//          select net.http_post(
//            url := 'https://SEU-PROJETO.supabase.co/functions/v1/push-envia',
//            headers := jsonb_build_object('Content-Type','application/json',
//              'Authorization','Bearer SUA_SERVICE_ROLE_KEY'),
//            body := '{"acao":"aulas_hoje"}'::jsonb);
//        $$);
//
// Ações (POST JSON):
//   { acao: "aulas_hoje" }                       → lembrete das aulas agendadas de hoje
//   { acao: "aviso", titulo: "...", corpo: "..." } → aviso geral para todos os inscritos
//   { acao: "para", token: "...", titulo, corpo }  → notificação para UM aluno (pelo token do app)
//   { acao: "ping" }                             → confere secrets

import webpush from "npm:web-push@3.6.7";

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

// só usuário logado (equipe/personal) ou o cron com a service key podem disparar push —
// a anonKey pública sozinha não passa (evita spam nas notificações dos alunos)
function chamadorConfiavel(req: Request): boolean {
  try {
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const corpo = JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return (corpo.role === "authenticated" && !!corpo.sub) || corpo.role === "service_role";
  } catch {
    return false;
  }
}

async function envia(subRow: any, titulo: string, corpo: string): Promise<boolean> {
  try {
    await webpush.sendNotification(subRow.sub, JSON.stringify({ t: titulo, b: corpo }));
    return true;
  } catch (e: any) {
    // inscrição morta (app desinstalado): limpa
    if (e && (e.statusCode === 404 || e.statusCode === 410)) {
      await sb(`push_subs?token=eq.${encodeURIComponent(subRow.token)}`, { method: "DELETE" });
    } else {
      console.error("push", e && e.statusCode, e && e.body);
    }
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "use POST" }, 405);

  const pub = env("VAPID_PUBLIC_KEY"), priv = env("VAPID_PRIVATE_KEY");
  let corpo: any = {};
  try { corpo = await req.json(); } catch { /* vazio */ }

  if (corpo.acao === "ping") {
    return json({ ok: true, vapid: !!(pub && priv) });
  }
  if (!chamadorConfiavel(req)) return json({ erro: "Entre na sua conta para enviar notificações." }, 401);
  if (!pub || !priv) return json({ erro: "Configure VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY nos Secrets." }, 502);
  webpush.setVapidDetails("mailto:contato@torquefit.com.br", pub, priv);

  let r = await sb("push_subs?select=token,sub");
  const subs = r.ok ? await r.json() : [];
  if (!subs.length) return json({ ok: true, enviados: 0, motivo: "nenhum aluno com push ativado ainda" });

  let enviados = 0;

  if (corpo.acao === "para") {
    const token = String(corpo.token || "");
    const titulo = String(corpo.titulo || "TORQUE ON").slice(0, 80);
    const texto = String(corpo.corpo || "").slice(0, 200);
    if (!token || !texto) return json({ erro: "token/corpo vazio" }, 400);
    for (const s of subs) {
      if (s.token === token && await envia(s, titulo, texto)) enviados++;
    }
    return json({ ok: true, enviados });
  }

  if (corpo.acao === "aviso") {
    const titulo = String(corpo.titulo || "TORQUE FIT").slice(0, 80);
    const texto = String(corpo.corpo || "").slice(0, 200);
    if (!texto) return json({ erro: "corpo vazio" }, 400);
    for (const s of subs) if (await envia(s, titulo, texto)) enviados++;
    return json({ ok: true, enviados });
  }

  if (corpo.acao === "aulas_hoje") {
    const hoje = new Date().toISOString().slice(0, 10);
    r = await sb(`app_agendamentos?select=token,aluno,aula_nome&data=eq.${hoje}&status=in.(pendente,confirmado)`);
    const ags = r.ok ? await r.json() : [];
    const porToken: Record<string, any[]> = {};
    for (const g of ags) (porToken[g.token] = porToken[g.token] || []).push(g);
    for (const s of subs) {
      const meus = porToken[s.token];
      if (!meus || !meus.length) continue;
      const nomes = meus.map(function (g: any) { return g.aula_nome; }).join(", ");
      if (await envia(s, "💪 Treino hoje!", "Você tem " + nomes + " agendada(s) hoje — te esperamos!")) enviados++;
    }
    return json({ ok: true, enviados, agendamentos: ags.length });
  }

  return json({ erro: "ação desconhecida" }, 400);
});
