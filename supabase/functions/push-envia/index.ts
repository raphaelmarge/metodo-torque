// TORQUE ON — Push de verdade (Web Push) · envia notificações aos apps
//
// Envia notificações push para os alunos que ativaram os lembretes no app
// HOSPEDADO (site/app/?t=TOKEN). O app baixado (arquivo .html) não recebe
// push — limitação dos navegadores, não do sistema.
//
// Como instalar (uma vez):
//   1. Rode o bloco PUSH DE VERDADE do supabase-setup.sql.
//   2. Deploy desta função com o nome: push-envia. Pode DESLIGAR o "Verify
//      JWT": ela confere sozinha quem está chamando.
//   3. Secrets (as duas chaves são um PAR — trocar uma sem a outra quebra o push):
//        VAPID_PUBLIC_KEY  = BCF653mK3mhwGp4W3c4Wq9MlprvFVwcfBGKDBmxVRdaI_S3y-umX1w6z1MyJuR_-WiO3IthaYSaDF9XMtK1O66I
//        VAPID_PRIVATE_KEY = (a metade secreta desta pública — o Raphael recebeu na conversa;
//                             ela NUNCA entra no repositório, só nos Secrets do Supabase)
//      Perdeu a privada? Gere um par novo (npx web-push generate-vapid-keys) e troque a
//      pública nos CINCO arquivos do repo que a carregam — app/aluno-builder.js,
//      apps/app-aluno.html, nutricao.html, demo-aluno.html e demo-paciente.html —
//      senão o navegador recusa a inscrição. (nativo/www é cópia gerada por
//      `node nativo/copia-www.js`, não está no git; não conte ela.) Trocar o par
//      derruba o push de quem JÁ ativou: confira antes quantas linhas tem a
//      push_subs — vazia, a troca não custa nada.
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
//   { acao: "prof", academia_id, titulo, corpo, senha } → aviso pro PROFESSOR (gatilhos do banco)
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
// a chave pública sozinha não passa (evita spam nas notificações dos alunos)
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

async function chamadorConfiavel(req: Request): Promise<boolean> {
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const srv = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (srv && jwt === srv) return true;         // o cron chama com a service key
  return !!(await usuarioValidado(req));
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
    return json({ ok: true, vapid: !!(pub && priv), acoes: ["ping", "para", "aviso", "aulas_hoje", "prof"] });
  }
  /* Aviso pro PROFESSOR vindo dos GATILHOS do banco (aluno mandou mensagem,
   * pediu horário): o gatilho não tem crachá de usuário, então ele se
   * autentica com a senha da push_config — tabela SELADA, mesma ideia da
   * regua_config. Senha errada cai no portão normal e leva 401. */
  let senhaProfOk = false;
  if (corpo.acao === "prof" && corpo.senha) {
    const rs = await sb("push_config?select=token&id=eq.1");
    const cfgP = ((rs.ok ? await rs.json() : [])[0] || {});
    senhaProfOk = !!cfgP.token && String(corpo.senha) === String(cfgP.token);
  }
  if (!senhaProfOk && !(await chamadorConfiavel(req))) return json({ erro: "Entre na sua conta para enviar notificações." }, 401);
  if (!pub || !priv) return json({ erro: "Configure VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY nos Secrets." }, 502);
  webpush.setVapidDetails("mailto:contato@torquefit.com.br", pub, priv);

  if (corpo.acao === "prof") {
    // só as inscrições do PROFESSOR daquela academia (token 'prof:…') — o
    // texto é gerado pelos gatilhos/funções, nunca vem de aluno cru sem corte
    const aid = String(corpo.academia_id || "").replace(/[^0-9a-f-]/gi, "");
    const tituloP = String(corpo.titulo || "TORQUE PERSONAL").slice(0, 80);
    const textoP = String(corpo.corpo || "").slice(0, 200);
    if (!aid || !textoP) return json({ erro: "academia/corpo vazio" }, 400);
    const rp = await sb(`push_subs?select=token,sub&academia_id=eq.${aid}&token=like.prof:*`);
    const profs = rp.ok ? await rp.json() : [];
    let envP = 0;
    for (const s of profs) if (await envia(s, tituloP, textoP)) envP++;
    return json({ ok: true, enviados: envP });
  }

  /* Isolamento por academia: o cron (service key) alcança todos os inscritos; um
   * usuário logado só alcança os alunos da PRÓPRIA academia. Antes a função lia
   * push_subs de todo mundo, então um funcionário da Academia A disparava push
   * (com texto livre) pros alunos das Academias B, C, D — spam/phishing na tela
   * de bloqueio do aluno. push_subs tem academia_id justamente pra isolar. */
  const jwtCh = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const ehCron = !!env("SUPABASE_SERVICE_ROLE_KEY") && jwtCh === env("SUPABASE_SERVICE_ROLE_KEY");
  let filtroAcad = "";
  if (!ehCron) {
    const uid = await usuarioValidado(req);
    const rm = await sb(`membros?select=academia_id&user_id=eq.${uid}`);
    const membros = rm.ok ? await rm.json() : [];
    const aids = membros.map((m: any) => m.academia_id).filter(Boolean);
    if (!aids.length) return json({ ok: true, enviados: 0, motivo: "conta sem academia" });
    filtroAcad = `&academia_id=in.(${aids.join(",")})`;
  }

  // as inscrições do PROFESSOR (prof:…) ficam FORA dos avisos de aluno — o
  // professor que dispara um "aviso" não deve receber a própria notificação
  let r = await sb(`push_subs?select=token,sub&token=not.like.prof:*${filtroAcad}`);
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
