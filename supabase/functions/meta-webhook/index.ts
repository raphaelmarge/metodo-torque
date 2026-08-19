// TORQUE ON — Chat unificado · webhook da Meta (WhatsApp + Instagram)
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
//   3. Em Edge Functions → Secrets, o único OBRIGATÓRIO é:
//        ANTHROPIC_API_KEY  = chave da API da Anthropic (console.anthropic.com)
//
//      Cada profissional liga o número DELE no painel (Configurações → WhatsApp):
//      ID do número, token, chave secreta do app e a senha do aperto de mão saem
//      de lá e ficam em zap_config, uma linha por academia. A mensagem que chega
//      traz o ID do número que a recebeu (metadata.phone_number_id), e é assim que
//      esta função sabe de quem ela é — e responde PELO MESMO número.
//
//      Opcionais, só pra instalação de dono único (um número só, o seu):
//        META_VERIFY_TOKEN  = senha do aperto de mão do SEU app
//        META_APP_SECRET    = chave secreta do SEU app (confere a assinatura)
//        WHATSAPP_TOKEN / WHATSAPP_PHONE_ID  = o seu número
//        INSTAGRAM_TOKEN / INSTAGRAM_IG_ID   = a sua conta do Instagram
//        ACADEMIA_DONO_ID   = id da SUA academia (sem ele, a função descobre sozinha)
//   4. No painel da Meta (developers.facebook.com → seu app → Webhooks):
//      - URL do callback:  https://SEU-PROJETO.supabase.co/functions/v1/meta-webhook
//      - Verify token:     o mesmo META_VERIFY_TOKEN
//      - Assine os campos: WhatsApp → "messages" · Instagram → "messages"
//   5. No TORQUE ON: Sistema → CRM → Chat e IA. Pronto.
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
// SEMPRE filtrada pela academia dona da mensagem. Sem linha, o robô fica quieto
// (auto_global false) em vez de herdar a configuração de outra pessoa.
async function pegaConfig(aid: string): Promise<{ aid: string; auto_global: boolean; prompt: string; bot: any }> {
  const r = await sb(`chat_config?select=auto_global,prompt,bot&academia_id=eq.${aid}`);
  const rows = r.ok ? await r.json() : [];
  const c = rows[0] || {};
  return { aid, auto_global: !!c.auto_global, prompt: c.prompt || "", bot: c.bot || null };
}

// credenciais globais (modo dono único): só valem quando o número que recebeu a
// mensagem é justamente o do dono do sistema
function globaisDo(): any {
  return {
    aid: env("ACADEMIA_DONO_ID"),
    phoneId: env("WHATSAPP_PHONE_ID"), token: env("WHATSAPP_TOKEN"),
    igId: env("INSTAGRAM_IG_ID"), igToken: env("INSTAGRAM_TOKEN"),
    appSecret: env("META_APP_SECRET"),
  };
}

// descobre de quem é a mensagem: busca a linha do zap_config pelo id que veio no
// payload e aplica escolheCredencial. Se a consulta falhar (SQL ainda não rodado,
// por exemplo), cai no modo dono único em vez de derrubar quem já usava.
async function resolveDono(canal: string, donoId: string): Promise<any> {
  const campo = canal === "instagram" ? "ig_id" : "phone_id";
  let linhas: any[] = [];
  try {
    const r = await sb(`zap_config?select=academia_id,phone_id,token,ig_id,ig_token,app_secret&${campo}=eq.${encodeURIComponent(donoId)}`);
    if (r.ok) linhas = await r.json();
    else console.warn("zap_config indisponível — modo dono único", r.status);
  } catch (e) {
    console.warn("zap_config falhou — modo dono único", String(e));
  }
  const globais = globaisDo();
  if (canal === "instagram" && !globais.igId) {
    // ninguém cadastrou Instagram ainda? então o token global ainda manda
    try {
      const rIg = await sb("zap_config?select=academia_id&ig_id=neq.&limit=1");
      globais.igSozinho = rIg.ok ? (await rIg.json()).length === 0 : false;
    } catch { globais.igSozinho = false; }
  }
  const cred = escolheCredencial(linhas, canal, donoId, globais);
  if (cred && cred.origem === "dono" && !cred.aid) {
    // instalação antiga sem ACADEMIA_DONO_ID: usa a única academia que existe
    // só serve quando existe UMA academia no banco. Com mais de uma, escolher
    // seria sortear — que é justamente o defeito que este lote conserta.
    const r2 = await sb("academias?select=id&limit=2");
    const rows2 = r2.ok ? await r2.json() : [];
    if (rows2.length !== 1) {
      console.error("modo dono único com " + rows2.length + " academias — crie o Secret ACADEMIA_DONO_ID");
      return null;
    }
    cred.aid = rows2[0].id;
    console.warn("modo dono único — defina o Secret ACADEMIA_DONO_ID");
  }
  return cred;
}

// todas as credenciais cadastradas (só o que o aperto de mão precisa ver)
async function verifyTokensCadastrados(): Promise<any[]> {
  try {
    const r = await sb("zap_config?select=verify_token&verify_token=neq.");
    return r.ok ? await r.json() : [];
  } catch {
    return [];
  }
}

// ---------- dados da academia (para as ferramentas da IA) ----------
async function leDados(aid: string, chave: string): Promise<any> {
  const r = await sb(`dados?select=valor&academia_id=eq.${aid}&chave=eq.${encodeURIComponent(chave)}`);
  const rows = r.ok ? await r.json() : [];
  return rows.length ? rows[0].valor : null;
}

function achaAlunoPorFone(alunosVal: any, fone: string): any {
  const sufixo = String(fone).replace(/\D/g, "").slice(-8);
  if (!sufixo) return null;
  return ((alunosVal && alunosVal.alunos) || []).find(function (a: any) {
    const z = String(a.zap || "").replace(/\D/g, "");
    return z && z.slice(-8) === sufixo && a.status !== "inativo";
  });
}

const DIAS_PT = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

// as ferramentas que o Claude pode usar durante a conversa
const FERRAMENTAS = [
  { name: "consultar_grade",
    description: "Lista as aulas da grade de uma data (AAAA-MM-DD): nome, horário, professor e vagas restantes. Use antes de agendar.",
    input_schema: { type: "object", properties: { data: { type: "string", description: "Data no formato AAAA-MM-DD" } }, required: ["data"] } },
  { name: "agendar_aula",
    description: "Agenda o cliente (identificado pelo telefone da conversa) numa aula da grade em uma data. Se estiver lotada, entra na lista de espera automaticamente.",
    input_schema: { type: "object", properties: { aula: { type: "string", description: "Nome (ou parte do nome) da aula" }, data: { type: "string", description: "Data AAAA-MM-DD" } }, required: ["aula", "data"] } },
  { name: "minhas_pendencias",
    description: "Consulta o plano ativo e as mensalidades em aberto do cliente desta conversa.",
    input_schema: { type: "object", properties: {} } },
  { name: "horario_funcionamento",
    description: "Horários de funcionamento da academia por dia da semana.",
    input_schema: { type: "object", properties: {} } },
];

async function executaFerramenta(nome: string, entrada: any, ctx: { aid: string; contato: string }): Promise<string> {
  try {
    if (nome === "horario_funcionamento") {
      const f = await leDados(ctx.aid, "funcionamento");
      const dias = (f && f.dias) || {};
      const linhas: string[] = [];
      const faixa = (d: any) => {
        if (!d) return "";
        const de = d.de || d.abre || d.inicio, ate = d.ate || d.fecha || d.fim;
        if (!de) return "";
        let r = de + " às " + (ate || "?");
        if (d.de2 && d.ate2) r += " e " + d.de2 + " às " + d.ate2;
        return r;
      };
      for (let i = 0; i < 7; i++) {
        const r = faixa(dias[i] || dias[String(i)]);
        if (r) linhas.push(DIAS_PT[i] + ": " + r);
      }
      // hoje (fuso de Brasília), considerando feriado cadastrado com horário especial
      const hojeISO = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
      const fer = ((f && f.feriados) || []).find((x: any) => x.data === hojeISO);
      if (fer) {
        linhas.push("HOJE (" + (fer.nome || "feriado") + "): " + (faixa(fer) || "FECHADO"));
      }
      const proximos = ((f && f.feriados) || [])
        .filter((x: any) => x.data > hojeISO)
        .sort((a: any, b: any) => (a.data < b.data ? -1 : 1))
        .slice(0, 3)
        .map((x: any) => x.data.split("-").reverse().slice(0, 2).join("/") + " (" + (x.nome || "feriado") + "): " + (faixa(x) || "fechado"));
      if (proximos.length) linhas.push("Horários especiais próximos: " + proximos.join("; "));
      if (linhas.length && !fer) linhas.push("Obs.: em feriados nacionais vale o horário de domingo, salvo aviso.");
      return linhas.length ? linhas.join("\n") : "Horários não cadastrados no sistema — oriente a falar com a recepção.";
    }

    if (nome === "consultar_grade") {
      const data = String(entrada.data || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return "Data inválida — use AAAA-MM-DD.";
      const grade = await leDados(ctx.aid, "grade");
      if (!grade || !(grade.aulas || []).length) return "A grade de aulas não está cadastrada.";
      const dow = new Date(data + "T12:00:00").getDay();
      const doDia = (grade.aulas || []).filter(function (a: any) { return (a.dias || []).indexOf(dow) !== -1; });
      if (!doDia.length) return "Nenhuma aula na grade em " + data + " (" + DIAS_PT[dow] + ").";
      return doDia.map(function (a: any) {
        const ocup = ((grade.presencas || {})[a.id + "|" + data] || []).length;
        const vagas = +a.vagas || 0;
        return a.nome + " às " + a.inicio + (a.prof ? " com " + a.prof : "") +
          (vagas ? " — " + Math.max(0, vagas - ocup) + " vaga(s) livre(s)" + (ocup >= vagas ? " (LOTADA)" : "") : "");
      }).join("\n");
    }

    if (nome === "minhas_pendencias") {
      const alunosVal = await leDados(ctx.aid, "alunos");
      const aluno = achaAlunoPorFone(alunosVal, ctx.contato);
      if (!aluno) return "Não encontrei cadastro com este número de WhatsApp — oriente a confirmar o número com a recepção.";
      const contrato = (aluno.contratos || []).find(function (c: any) { return c.status === "ativo"; });
      const abertos = ((alunosVal && alunosVal.recebiveis) || []).filter(function (r: any) {
        return r.alunoId === aluno.id && r.status === "aberto";
      });
      const hoje = new Date().toISOString().slice(0, 10);
      const linhas = ["Cliente: " + aluno.nome, contrato ? "Plano ativo: sim" : "SEM plano ativo"];
      if (!abertos.length) linhas.push("Nenhuma mensalidade em aberto. Tudo em dia! ✅");
      else abertos.forEach(function (r: any) {
        linhas.push("Mensalidade de R$ " + (+r.valor || 0).toFixed(2) + " — vence " + r.vencimento + (r.vencimento < hoje ? " (EM ATRASO)" : ""));
      });
      return linhas.join("\n");
    }

    if (nome === "agendar_aula") {
      const data = String(entrada.data || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return "Data inválida — use AAAA-MM-DD.";
      if (data < new Date().toISOString().slice(0, 10)) return "Essa data já passou — peça uma data futura.";
      const alunosVal = await leDados(ctx.aid, "alunos");
      const aluno = achaAlunoPorFone(alunosVal, ctx.contato);
      if (!aluno) return "Não encontrei cadastro com este número — o agendamento pela conversa só funciona com o WhatsApp cadastrado. Oriente a falar com a recepção.";
      if (!aluno.appToken) return "O cadastro existe mas o app do cliente ainda não foi publicado — a recepção resolve em 1 minuto.";
      const grade = await leDados(ctx.aid, "grade");
      const busca = String(entrada.aula || "").toLowerCase();
      const dow = new Date(data + "T12:00:00").getDay();
      const aula = (grade && grade.aulas || []).find(function (a: any) {
        return a.nome.toLowerCase().indexOf(busca) !== -1 && (a.dias || []).indexOf(dow) !== -1;
      });
      if (!aula) return "Não achei a aula '" + entrada.aula + "' na grade de " + data + " (" + DIAS_PT[dow] + "). Use consultar_grade para ver as opções.";
      // já agendado?
      let r = await sb(`app_agendamentos?select=id,status&token=eq.${encodeURIComponent(aluno.appToken)}&aula_id=eq.${encodeURIComponent(aula.id)}&data=eq.${data}`);
      const jaTem = (r.ok ? await r.json() : []).find(function (g: any) { return ["pendente", "confirmado", "espera"].indexOf(g.status) !== -1; });
      if (jaTem) return "Este cliente já está " + (jaTem.status === "espera" ? "na lista de espera" : "agendado") + " nessa aula.";
      // lotação (presenças da grade + agendamentos pendentes)
      const ocupGrade = ((grade.presencas || {})[aula.id + "|" + data] || []).length;
      r = await sb(`app_agendamentos?select=id&aula_id=eq.${encodeURIComponent(aula.id)}&data=eq.${data}&status=eq.pendente`);
      const ocupPend = (r.ok ? await r.json() : []).length;
      const vagas = +aula.vagas || 0;
      const lotada = vagas > 0 && (ocupGrade + ocupPend) >= vagas;
      await sb("app_agendamentos", {
        method: "POST",
        body: JSON.stringify({
          academia_id: ctx.aid, token: aluno.appToken, aluno: aluno.nome,
          aula_id: aula.id, aula_nome: aula.nome, data: data, status: lotada ? "espera" : "pendente",
        }),
      });
      return lotada
        ? "A aula " + aula.nome + " de " + data + " está LOTADA — coloquei o cliente na LISTA DE ESPERA (se alguém cancelar, entra automaticamente)."
        : "AGENDADO: " + aula.nome + " às " + aula.inicio + " em " + data + " para " + aluno.nome + ". A recepção confirma na grade.";
    }
  } catch (e) {
    console.error("ferramenta", nome, e);
  }
  return "Não consegui executar agora — oriente a falar com a recepção.";
}

// ---------- IA (Claude / Anthropic) ----------
async function respostaIA(
  historico: { de: string; texto: string }[],
  promptExtra: string,
  ctx?: { aid: string; contato: string },
): Promise<string> {
  const chave = env("ANTHROPIC_API_KEY");
  if (!chave) return "";

  const msgs: any[] = [];
  for (const m of historico) {
    const role = m.de === "cliente" ? "user" : "assistant";
    const ultimo = msgs[msgs.length - 1];
    if (ultimo && ultimo.role === role && typeof ultimo.content === "string") ultimo.content += "\n" + m.texto;
    else msgs.push({ role, content: m.texto });
  }
  if (!msgs.length) return "";
  if (msgs[0].role === "assistant") msgs.unshift({ role: "user", content: "(início da conversa)" });

  const hoje = new Date().toISOString().slice(0, 10);
  const sistema =
    "Você é o atendente virtual de uma academia (TORQUE FIT) respondendo clientes " +
    "pelo WhatsApp e pelo Instagram. Responda em português do Brasil, de forma curta, " +
    "simpática e objetiva, como uma mensagem de chat (sem markdown, sem listas longas). " +
    "Hoje é " + hoje + ". Você tem FERRAMENTAS reais: consultar a grade, AGENDAR aulas " +
    "(inclusive lista de espera), ver as pendências do cliente e os horários — USE-AS em vez " +
    "de inventar. Antes de agendar, confirme a aula e a data com o cliente. " +
    "Nunca invente preços, horários ou promoções que não estejam nas instruções abaixo — " +
    "se não souber, diga que a equipe já vai responder. Não peça dados sensíveis." +
    (promptExtra ? "\n\nInstruções da academia:\n" + promptExtra : "");

  let mensagens = msgs.slice(-20);
  for (let volta = 0; volta < 4; volta++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": chave,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(Object.assign({
        model: "claude-opus-4-8",
        max_tokens: 900,
        thinking: { type: "adaptive" },
        system: sistema,
        messages: mensagens,
      }, ctx ? { tools: FERRAMENTAS } : {})),
    });
    if (!r.ok) {
      console.error("anthropic", r.status, await r.text());
      return "";
    }
    const d = await r.json();
    const usos = (d.content || []).filter(function (b: any) { return b.type === "tool_use"; });
    if (!usos.length || d.stop_reason !== "tool_use" || !ctx) {
      let texto = "";
      for (const b of d.content || []) if (b.type === "text") texto += b.text;
      return texto.trim();
    }
    // executa as ferramentas pedidas e devolve os resultados ao modelo
    mensagens = mensagens.concat([{ role: "assistant", content: d.content }]);
    const resultados: any[] = [];
    for (const u of usos) {
      const saida = await executaFerramenta(u.name, u.input || {}, ctx);
      resultados.push({ type: "tool_result", tool_use_id: u.id, content: saida });
    }
    mensagens = mensagens.concat([{ role: "user", content: resultados }]);
  }
  return "Já anotei tudo aqui! A equipe confirma com você em instantes. 💜";
}

// ---------- envio pela Meta ----------
async function enviaMeta(cred: any, canal: string, contato: string, texto: string): Promise<boolean> {
  let r: Response;
  if (canal === "instagram") {
    const token = cred?.token || "";
    const igId = cred?.igId || "";
    if (!token || !igId) return false;
    // pela conta do próprio profissional (/me resolveria pro dono do token global)
    r = await fetch(GRAPH + "/" + igId + "/messages?access_token=" + encodeURIComponent(token), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: contato }, message: { text: texto } }),
    });
  } else {
    // responde pelo MESMO número que recebeu — é o que mantém a janela de 24h
    const token = cred?.token || "", fone = cred?.phoneId || "";
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

// ---------- chatbot: fluxo de blocos (fluxograma) ----------
// bot = { ativo, inicio, blocos: [{ id, nome, tipo, texto, destino, opcoes: [{rotulo, destino}] }] }
// tipos: mensagem | menu | pergunta | nota | ia | equipe

function achaBloco(bot: any, id: string) {
  return (bot.blocos || []).find(function (b: any) { return b.id === id; });
}

function textoMenuBloco(b: any): string {
  const linhas = (b.opcoes || []).map(function (o: any, i: number) {
    return (i + 1) + " — " + (o.rotulo || "");
  });
  return (b.texto || "Escolha uma opção:") +
    "\n\n" + linhas.join("\n") + "\n\nResponda com o número da opção. 😉";
}

// compatibilidade: formato antigo (menu único) → fluxo de blocos
function botCompat(bot: any): any {
  if (!bot) return null;
  if (bot.blocos) return bot;
  const blocos: any[] = [{ id: "menu", nome: "Boas-vindas", tipo: "menu", texto: bot.boasvindas || "Olá! 👋", opcoes: [] }];
  (bot.opcoes || []).forEach(function (o: any, i: number) {
    const id = "op" + (i + 1);
    const tipo = o.acao === "ia" ? "ia" : (o.acao === "humano" ? "equipe" : "mensagem");
    const b: any = { id, nome: o.rotulo || ("Opção " + (i + 1)), tipo, texto: o.resposta || "" };
    if (tipo === "mensagem") b.destino = "menu";
    blocos.push(b);
    blocos[0].opcoes.push({ rotulo: o.rotulo, destino: id });
  });
  return { ativo: !!bot.ativo, inicio: "menu", blocos };
}

// anda pelos blocos a partir de um id; devolve "ia" quando o Claude deve
// responder a mensagem atual (bloco IA sem texto fixo)
async function executaFluxo(
  bot: any, id: string, conversa: any, cred: any, canal: string, contato: string,
): Promise<string | void> {
  let hops = 0;
  while (id && hops++ < 12) {
    const b = achaBloco(bot, id);
    if (!b) break;
    if (b.tipo === "mensagem") {
      if (b.texto) await respondeAuto(conversa, cred, canal, contato, b.texto);
      id = b.destino; continue;
    }
    if (b.tipo === "nota") {
      await sb("chat_mensagens", {
        method: "POST",
        body: JSON.stringify({ conversa_id: conversa.id, academia_id: cred.aid, de: "nota", texto: b.texto || "" }),
      });
      id = b.destino; continue;
    }
    if (b.tipo === "menu") {
      await respondeAuto(conversa, cred, canal, contato, textoMenuBloco(b));
      await sb(`chat_conversas?id=eq.${conversa.id}`, {
        method: "PATCH", body: JSON.stringify({ bot_estado: "menu:" + b.id }),
      });
      return;
    }
    if (b.tipo === "pergunta") {
      await respondeAuto(conversa, cred, canal, contato, b.texto || "?");
      await sb(`chat_conversas?id=eq.${conversa.id}`, {
        method: "PATCH", body: JSON.stringify({ bot_estado: "perg:" + b.id }),
      });
      return;
    }
    if (b.tipo === "ia") {
      await sb(`chat_conversas?id=eq.${conversa.id}`, {
        method: "PATCH", body: JSON.stringify({ modo_auto: true, bot_estado: "ia" }),
      });
      if (b.texto) { await respondeAuto(conversa, cred, canal, contato, b.texto); return; }
      conversa.modo_auto = true;
      return "ia";
    }
    if (b.tipo === "equipe") {
      await sb(`chat_conversas?id=eq.${conversa.id}`, {
        method: "PATCH", body: JSON.stringify({ modo_auto: false, bot_estado: "humano" }),
      });
      await respondeAuto(conversa, cred, canal, contato,
        b.texto || "Perfeito! Já chamei alguém da equipe — te respondemos em instantes. 🙌");
      return;
    }
    break;
  }
  // fluxo terminou (destino vazio): a conversa fica com a equipe, em silêncio
  await sb(`chat_conversas?id=eq.${conversa.id}`, {
    method: "PATCH", body: JSON.stringify({ bot_estado: "fim" }),
  });
}

// responde pelo canal e registra como mensagem do robô/IA
async function respondeAuto(conversa: any, cred: any, canal: string, contato: string, texto: string) {
  const enviou = await enviaMeta(cred, canal, contato, texto);
  if (!enviou) return false;
  await sb("chat_mensagens", {
    method: "POST",
    body: JSON.stringify({ conversa_id: conversa.id, academia_id: cred.aid, de: "ia", texto }),
  });
  await sb(`chat_conversas?id=eq.${conversa.id}`, {
    method: "PATCH",
    body: JSON.stringify({ ultima_msg: "🤖 " + texto.slice(0, 120), atualizado: new Date().toISOString() }),
  });
  return true;
}

// ---------- processa uma mensagem recebida ----------
// cred vem pronta de quem conferiu a assinatura — a mensagem só é processada
// depois de ter dono. Antes, mensagem sem dono caía na academia sorteada pelo
// "limit 1", misturando conversa de gente diferente.
async function processa(msg: any, cred: any) {
  const canal = msg.canal, contato = msg.contato, nome = msg.nome, texto = msg.texto, mid = msg.mid;
  if (!cred) { console.error("mensagem sem dono — ignorada", canal, msg.donoId); return; }
  const cfg = await pegaConfig(cred.aid);

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

  // ---- chatbot (fluxo de blocos): roda antes da IA ----
  const bot = botCompat(cfg.bot);
  if (bot && bot.ativo && (bot.blocos || []).length) {
    let estado = conversa.bot_estado || "";
    if (estado === "menu") estado = "menu:" + bot.inicio; // estado da versão antiga

    if (estado.startsWith("menu:")) {
      const b = achaBloco(bot, estado.slice(5));
      if (b) {
        const n = parseInt((texto || "").trim(), 10);
        const op = (!isNaN(n) && (b.opcoes || [])[n - 1]) ||
          (b.opcoes || []).find(function (o: any) {
            return o.rotulo && texto.trim().toLowerCase() === String(o.rotulo).toLowerCase();
          });
        if (op) {
          const r2 = await executaFluxo(bot, op.destino, conversa, cred, canal, contato);
          if (r2 !== "ia") return;
        } else {
          await respondeAuto(conversa, cred, canal, contato, "Não entendi 🤔\n\n" + textoMenuBloco(b));
          return;
        }
      } else {
        const r2 = await executaFluxo(bot, bot.inicio, conversa, cred, canal, contato);
        if (r2 !== "ia") return;
      }
    } else if (estado.startsWith("perg:")) {
      // a resposta do cliente já foi guardada acima; segue o fluxo
      const b = achaBloco(bot, estado.slice(5));
      const r2 = await executaFluxo(bot, b ? b.destino : "", conversa, cred, canal, contato);
      if (r2 !== "ia") return;
    } else if (estado === "humano" || estado === "fim") {
      return; // a equipe assume — o robô fica em silêncio
    } else if (estado === "ia" || conversa.modo_auto) {
      // cai na IA abaixo
    } else if (nova) {
      // primeira mensagem: entra pelo bloco marcado com ▶
      const r2 = await executaFluxo(
        bot, bot.inicio || (bot.blocos[0] && bot.blocos[0].id), conversa, cred, canal, contato,
      );
      if (r2 !== "ia") return;
    }
  }

  if (!conversa.modo_auto) return;

  // modo automático: monta o histórico e pede a resposta ao Claude
  r = await sb(`chat_mensagens?select=de,texto&conversa_id=eq.${conversa.id}&order=criado.desc&limit=20`);
  const hist = (r.ok ? await r.json() : []).reverse();
  const resposta = await respostaIA(hist, cfg.prompt, { aid: cfg.aid, contato: contato });
  if (!resposta) return;
  await respondeAuto(conversa, cred, canal, contato, resposta);
}

// ==== ROTEAMENTO (JS puro de propósito: os testes avaliam este trecho em node) ====
// Três funções sem rede e sem Deno, pra dar pra provar o roteamento multi-inquilino
// sem chamar a Meta de verdade. NÃO coloque tipo do TypeScript aqui dentro.

// extrai as mensagens do payload da Meta — e, principalmente, QUEM recebeu cada uma
// @ts-ignore — região escrita em JS puro de propósito (os testes avaliam ela em node)
function extrai(payload) {
  const saida = [];
  for (const entry of payload.entry || []) {
    // WhatsApp Cloud API: o dono é o ID do número que recebeu
    for (const ch of entry.changes || []) {
      const v = ch.value || {};
      const nome = v.contacts?.[0]?.profile?.name || "";
      const donoId = String(v.metadata?.phone_number_id || "");
      for (const m of v.messages || []) {
        const texto = m.text?.body ||
          m.button?.text || m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || "";
        if (texto && m.from) saida.push({ canal: "whatsapp", contato: m.from, nome, texto, mid: m.id || "", donoId: donoId });
      }
    }
    // Instagram: o dono é a conta que recebeu (entry.id, ou o recipient da mensagem)
    if (payload.object !== "instagram") continue; // Messenger (object "page") não é produto nosso
    for (const m of entry.messaging || []) {
      const texto = m.message?.text || "";
      const eco = m.message?.is_echo; // mensagens que a própria página enviou
      if (texto && !eco && m.sender?.id) {
        saida.push({
          canal: "instagram", contato: m.sender.id, nome: "", texto, mid: m.message?.mid || "",
          donoId: String(m.recipient?.id || entry.id || ""),
        });
      }
    }
  }
  return saida;
}

/* Escolhe a credencial dona da mensagem a partir das linhas já buscadas.
 * Pura de propósito: quem faz o fetch é resolveDono().
 * Regras, nesta ordem:
 *   1. casou exatamente UMA linha do zap_config → é dela;
 *   2. casou mais de uma → recusa (não sorteia; o índice único evita, mas não confiamos);
 *   3. não casou nenhuma, mas o dono é o número global do sistema → modo dono único;
 *   4. nada disso → null, e a mensagem não é processada.
 * O passo 4 é o conserto do vazamento antigo: antes, mensagem sem dono caía dentro
 * da academia de outra pessoa. */
// @ts-ignore — região JS puro
function escolheCredencial(linhas, canal, donoId, globais) {
  const g = globais || {};
  const id = String(donoId || "");
  // @ts-ignore — região JS puro
  const casadas = (linhas || []).filter(function (l) {
    return canal === "instagram" ? String(l.ig_id || "") === id && id : String(l.phone_id || "") === id && id;
  });
  if (casadas.length > 1) return null;
  if (casadas.length === 1) {
    const l = casadas[0];
    const tok = canal === "instagram" ? l.ig_token : l.token;
    if (!tok) return null;
    return {
      aid: l.academia_id, token: tok, phoneId: l.phone_id || "", igId: l.ig_id || "",
      appSecret: l.app_secret || "", origem: "propria",
    };
  }
  const globalId = canal === "instagram" ? g.igId : g.phoneId;
  const globalTok = canal === "instagram" ? g.igToken : g.token;
  const dono = { aid: g.aid || "", token: globalTok, phoneId: g.phoneId || "", igId: g.igId || "", appSecret: g.appSecret || "", origem: "dono" };
  if (id && globalId && id === globalId && globalTok) return dono;
  /* Instagram da instalação antiga: ela nunca teve um Secret com o ID da conta,
   * só o token. Enquanto NINGUÉM tiver cadastrado um ig_id, o token global segue
   * valendo — e esse atalho se desliga sozinho no dia em que o primeiro
   * profissional ligar o Instagram dele. */
  if (canal === "instagram" && id && !globalId && globalTok && g.igSozinho) {
    dono.igId = id;
    return dono;
  }
  return null;
}

// aperto de mão do webhook: vale o segredo global do dono OU o de qualquer
// profissional cadastrado (cada um tem o app dele na Meta)
// @ts-ignore — região JS puro
function verificaHandshake(tokenRecebido, globalVerify, linhas) {
  const t = String(tokenRecebido || "");
  if (!t) return false;
  if (globalVerify && t === globalVerify) return true;
  // @ts-ignore — região JS puro
  return (linhas || []).some(function (l) { return String(l.verify_token || "") === t; });
}
// ==== FIM ROTEAMENTO ====

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // verificação do webhook (a Meta faz um GET com o verify token)
  if (req.method === "GET") {
    const modo = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const desafio = url.searchParams.get("hub.challenge") || "";
    // vale a senha global do dono OU a de qualquer profissional cadastrado —
    // cada um aponta o app DELE pra esta mesma URL
    if (modo === "subscribe" && verificaHandshake(token, env("META_VERIFY_TOKEN"), await verifyTokensCadastrados())) {
      return new Response(desafio, { status: 200 });
    }
    return new Response("token de verificação inválido", { status: 403 });
  }

  if (req.method !== "POST") return new Response("ok", { status: 200 });

  const bruto = await req.text();
  let payload: any = {};
  try { payload = JSON.parse(bruto); } catch { /* corpo vazio */ }

  const msgs = extrai(payload);

  /* Assinatura da Meta (X-Hub-Signature-256). Cada app da Meta assina com o
   * segredo DELE, então precisamos saber de quem é a mensagem ANTES de conferir
   * — por isso o corpo é lido e interpretado primeiro (ler JSON não muda nada).
   * Sem segredo nenhum guardado, segue como sempre foi: passa com aviso. */
  let cred: any = null;
  if (msgs.length) {
    /* O POST inteiro é assinado UMA vez, com o segredo de UM app da Meta. Então
     * ele só pode falar de um dono: se vierem donos diferentes no mesmo corpo,
     * é gente tentando pendurar a mensagem de um na assinatura do outro. */
    const donos = Array.from(new Set(msgs.map((m: any) => m.canal + "|" + (m.donoId || ""))));
    if (donos.length > 1) {
      console.error("POST com donos diferentes no mesmo corpo — descartado", donos.join(", "));
      return new Response("donos misturados", { status: 400 });
    }
    cred = await resolveDono(msgs[0].canal, msgs[0].donoId || "");
    // dono conhecido manda: o segredo global é do app do dono do sistema e nunca
    // vai bater com a assinatura do app de outro profissional
    const segredo = cred ? cred.appSecret : env("META_APP_SECRET");
    if (segredo) {
      const assinatura = req.headers.get("X-Hub-Signature-256") || "";
      const chave = await crypto.subtle.importKey(
        "raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
      );
      const mac = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(bruto));
      const esperado = "sha256=" + Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
      if (assinatura !== esperado) {
        console.error("assinatura da Meta não confere — payload descartado");
        return new Response("assinatura inválida", { status: 401 });
      }
    } else {
      console.warn("sem conferência de assinatura — cole a Chave Secreta do App no painel");
    }
  }

  if (msgs.length && cred) {
    const trabalho = (async () => {
      for (const m of msgs) {
        try { await processa(m, cred); }
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
