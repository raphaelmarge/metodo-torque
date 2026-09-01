// supabase/functions/regua-diaria/index.ts
//
// A RÉGUA DIÁRIA NO SERVIDOR (v721). Antes, os pushes de "hoje tem treino",
// "amanhã tem treino" e "feliz aniversário" saíam da régua que roda DENTRO do
// painel — se o professor não abrisse o painel naquele dia, nenhum aluno
// recebia nada. Agora o relógio do banco (pg_cron) chama esta função toda
// manhã: ela lê o estúdio de cada academia (a MESMA linha mtapp:ptStudio da
// tabela dados que o painel sincroniza), calcula os lembretes do dia e envia
// pelos mesmos push_subs/VAPID da push-envia.
//
// DEDUPE NOS DOIS SENTIDOS (senão o aluno recebe o aviso duas vezes):
//   servidor não repete o cliente → pula chave que já está no pushLog do blob;
//   cliente não repete o servidor → cada envio entra em push_log_srv, e o
//   painel importa essas chaves pro pushLog local antes de rodar a régua dele.
// As chaves são as MESMAS do painel: treino|<aluno>|<data>, vespera|...,
// niver|<aluno>|<ano>.
//
// A cobrança (venc-2, vencido) NÃO mora aqui de propósito: a regra dela usa
// contrato/plano/dívida, que são contas do painel — duplicar essas contas em
// dois lugares é como os números passam a divergir. O painel continua sendo o
// dono da régua de cobrança.
//
// Ações (POST JSON):
//   { acao: "ping" }             → { ok, vapid, regras } (diagnóstico, aberto)
//   { senha, acao: "previa" }    → o que SERIA enviado hoje, sem enviar
//   { senha }                    → envia e registra em push_log_srv
//
// Publique com Verify JWT DESLIGADO (a senha da regua_config é o portão —
// a MESMA senha selada da regua-teste; o SQL agenda o cron).
// Secrets usados: VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY (os da push-envia).

import webpush from "npm:web-push@3.6.7";

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

// o dia "de verdade" é o do Brasil — o servidor vive em UTC e viraria o dia
// 3 horas mais cedo, mandando "hoje tem treino" na noite da véspera
function diaBR(mais = 0): string {
  const d = new Date(Date.now() + mais * 864e5);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

type Aviso = { academia_id: string; token: string; chave: string; titulo: string; corpo: string };

// os lembretes de UMA academia, a partir do blob do estúdio (mtapp:ptStudio).
// As regras são as mesmas da rotinaDiariaPush do painel — de propósito.
function avisosDe(aid: string, st: any, hoje: string, amanha: string): Aviso[] {
  const out: Aviso[] = [];
  const alunos: any[] = Array.isArray(st && st.alunos) ? st.alunos : [];
  const sessoes: any[] = Array.isArray(st && st.sessoes) ? st.sessoes : [];
  for (const a of alunos) {
    if (!a || a.ativo === false || !a.appTokenP) continue;
    const ses = sessoes.find((x) => x && x.alunoId === a.id && x.data === hoje && !x.feita && !x.faltou);
    if (ses) {
      out.push({ academia_id: aid, token: String(a.appTokenP), chave: "treino|" + a.id + "|" + hoje,
        titulo: "Hoje tem treino" + (ses.hora ? " às " + ses.hora : "") + "!",
        corpo: "Te espero lá — se não puder vir, me avisa pelo chat do app." });
    }
    const sesAm = sessoes.find((x) => x && x.alunoId === a.id && x.data === amanha && !x.feita && !x.faltou);
    if (sesAm) {
      out.push({ academia_id: aid, token: String(a.appTokenP), chave: "vespera|" + a.id + "|" + amanha,
        titulo: "Amanhã tem treino" + (sesAm.hora ? " às " + sesAm.hora : "") + "!",
        corpo: "Já deixa separado — se precisar remarcar, me avisa pelo chat do app." });
    }
    if (a.nasc && String(a.nasc).slice(5, 10) === hoje.slice(5)) {
      out.push({ academia_id: aid, token: String(a.appTokenP), chave: "niver|" + a.id + "|" + hoje.slice(0, 4),
        titulo: "Parabéns, " + String(a.nome || "").split(" ")[0] + "!",
        corpo: "Feliz aniversário! Que tal comemorar com um treino especial? Conta comigo sempre." });
    }
  }
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ erro: "use POST" }, 405);
  let body: any = {};
  try { body = await req.json(); } catch { /* segue vazio */ }

  if (body.acao === "ping") {
    return json({
      ok: true,
      vapid: !!(env("VAPID_PUBLIC_KEY") && env("VAPID_PRIVATE_KEY")),
      regras: ["treino", "vespera", "niver", "log-srv", "fuso-br"],
    });
  }

  // o portão: a MESMA senha selada da regua-teste (tabela regua_config,
  // RLS sem política — só a service key alcança; o pg_cron manda ela)
  const rCfg = await sb("regua_config?id=eq.1&select=token");
  const cfg = await rCfg.json().catch(() => []);
  const token = Array.isArray(cfg) && cfg[0] ? String(cfg[0].token) : "";
  if (!token || String(body.senha || "") !== token) {
    return json({ erro: "senha errada ou régua não instalada (rode o SQL)." }, 401);
  }

  const pub = env("VAPID_PUBLIC_KEY"), priv = env("VAPID_PRIVATE_KEY");
  if (!pub || !priv) return json({ erro: "Configure VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY nos Secrets." }, 502);
  webpush.setVapidDetails("mailto:contato@torquefit.com.br", pub, priv);

  // 1) só academias que TÊM aluno inscrito no push — o resto nem é lido
  const rSubs = await sb("push_subs?select=token,sub,academia_id&token=not.like.prof:*");
  const subs: any[] = rSubs.ok ? await rSubs.json() : [];
  if (!subs.length) return json({ ok: true, enviados: 0, motivo: "nenhum aluno com push ativado" });
  const porAcad: Record<string, any[]> = {};
  for (const s of subs) if (s.academia_id) (porAcad[s.academia_id] = porAcad[s.academia_id] || []).push(s);
  const aids = Object.keys(porAcad);

  // 2) o estúdio de cada uma (a mesma linha que o painel sincroniza)
  const rDados = await sb("dados?select=academia_id,valor&chave=eq." +
    encodeURIComponent("mtapp:ptStudio") + "&academia_id=in.(" + aids.join(",") + ")");
  const blobs: any[] = rDados.ok ? await rDados.json() : [];

  const hoje = diaBR(0), amanha = diaBR(1);
  let candidatos: Aviso[] = [];
  for (const b of blobs) {
    const st = b && b.valor;
    if (!st) continue;
    const av = avisosDe(String(b.academia_id), st, hoje, amanha);
    // o CLIENTE já mandou? a marca dele mora no pushLog do próprio blob
    const logCli = (st.pushLog && typeof st.pushLog === "object") ? st.pushLog : {};
    for (const x of av) if (!logCli[x.chave]) candidatos.push(x);
  }
  // teto de segurança por rodada (a fila continua amanhã se estourar)
  candidatos = candidatos.slice(0, 400);

  // 3) o SERVIDOR já mandou? push_log_srv é a memória dele
  const jaSrv: Record<string, 1> = {};
  for (const aid of aids) {
    const meus = candidatos.filter((c) => c.academia_id === aid);
    if (!meus.length) continue;
    const lista = meus.map((c) => '"' + c.chave.replace(/"/g, "") + '"').join(",");
    const rl = await sb("push_log_srv?select=chave&academia_id=eq." + aid + "&chave=in.(" + lista + ")");
    const rows: any[] = rl.ok ? await rl.json() : [];
    for (const row of rows) jaSrv[aid + "|" + row.chave] = 1;
  }
  const fila = candidatos.filter((c) => !jaSrv[c.academia_id + "|" + c.chave]);

  if (body.acao === "previa") {
    return json({ ok: true, previa: fila.map((c) => ({ academia: c.academia_id, chave: c.chave, titulo: c.titulo })) });
  }

  let enviados = 0, falhas = 0;
  for (const c of fila) {
    const minhas = (porAcad[c.academia_id] || []).filter((s) => s.token === c.token);
    if (!minhas.length) continue;
    let algum = false;
    for (const s of minhas) {
      try {
        await webpush.sendNotification(s.sub, JSON.stringify({ t: c.titulo, b: c.corpo }));
        algum = true;
      } catch (e: any) {
        if (e && (e.statusCode === 404 || e.statusCode === 410)) {
          await sb("push_subs?token=eq." + encodeURIComponent(s.token), { method: "DELETE" });
        } else {
          falhas++;
          console.error("regua-diaria push", e && e.statusCode);
        }
      }
    }
    if (algum) {
      enviados++;
      // marca SÓ quando algum aparelho recebeu — falhou, tenta de novo na próxima
      await sb("push_log_srv", {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates" },
        body: JSON.stringify({ academia_id: c.academia_id, chave: c.chave }),
      });
    }
  }

  // faxina: marca com mais de 45 dias nunca mais casa com chave nova
  const corte = new Date(Date.now() - 45 * 864e5).toISOString();
  await sb("push_log_srv?em=lt." + corte, { method: "DELETE" });

  return json({ ok: true, academias: aids.length, candidatos: candidatos.length, enviados, falhas });
});
