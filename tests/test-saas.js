// SaaS TORQUESYS: site comercial, painel HQ (trava, clientes, plano, pagamento, Pix, funil) e SQL
let chromium;
try { chromium = require("playwright").chromium; } catch (e) { chromium = require("/opt/node22/lib/node_modules/playwright").chromium; }
const fs = require("fs");
const EXEC = process.env.CHROMIUM_PATH || (fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

let falhas = 0;
function ok(cond, nome) {
  console.log((cond ? "  ✅ " : "  ❌ ") + nome);
  if (!cond) falhas++;
}
function crcNode(s) {
  let crc = 0xFFFF;
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
  }
  return ("0000" + crc.toString(16).toUpperCase()).slice(-4);
}

(async () => {
  const b = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } });
  await ctx.addInitScript(() => {
    if (window !== window.top) return;
    if (localStorage.getItem("mtapp:seeded")) return;
    localStorage.setItem("mtapp:seeded", "1");
    localStorage.setItem("mtapp:perfil", JSON.stringify({ nome: "Raphael" }));
  });
  const erros = [];

  // ---------- 0) o SQL tem o bloco do HQ ----------
  console.log("SQL do TORQUESYS HQ:");
  const sql = fs.readFileSync(__dirname + "/../supabase-setup.sql", "utf8");
  ok(/saas_admins/.test(sql) && /saas_clientes/.test(sql) && /saas_pagamentos/.test(sql), "tabelas saas_admins/clientes/pagamentos no setup");
  ok(/hq_sou_admin/.test(sql) && /hq_clientes/.test(sql) && /hq_cliente_set/.test(sql) && /hq_pagamento_reg/.test(sql) && /hq_kpis/.test(sql), "as 5 funções hq_* existem");
  ok((sql.match(/acesso restrito ao administrador/g) || []).length >= 4, "toda função hq_* de dados exige admin");
  ok(!/create policy[^;]*saas_/.test(sql), "tabelas saas_* sem policy (bloqueadas pra API — só as funções acessam)");
  ok(/hq_receita_mensal/.test(sql) && /add column if not exists zap/.test(sql) && /ultima_atividade/.test(sql), "v2: receita mensal, WhatsApp e última atividade no SQL");
  ok(/saas_tickets/.test(sql) && /suporte_envia/.test(sql) && /suporte_lista/.test(sql), "assistência: tabela e RPCs do cliente");
  ok(/hq_suporte_threads/.test(sql) && /hq_suporte_lista/.test(sql) && /hq_suporte_envia/.test(sql) && /hq_erros/.test(sql), "assistência: RPCs do HQ (tickets + erros)");

  // ---------- 1) site comercial ----------
  console.log("Site comercial (torquesys.html):");
  let p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  await p.goto(BASE + "/torquesys.html?zap=5531988887777");
  await p.waitForFunction(() => window.__torquesys);
  const corpo = await p.evaluate(() => document.body.textContent);
  ok(/Academia/.test(corpo) && /Box de CrossFit/.test(corpo) && /Personal Trainer/.test(corpo), "os 3 segmentos apresentados");
  ok(/ilha/.test(corpo) && /isolados/.test(corpo), "seção de isolamento (ilha) presente");
  ok(/R\$ 49/.test(corpo) && /R\$ 147/.test(corpo) && /R\$ 197/.test(corpo), "tabela de planos com os 3 preços");
  ok(/sistemas tradicionais/i.test(corpo) && /Funciona sem internet/.test(corpo) && /sem fidelidade/.test(corpo), "tabela comparativa TORQUESYS × tradicionais");
  const links = await p.evaluate(() => ({
    empresa: document.getElementById("entrarEmpresa").getAttribute("href"),
    personal: document.getElementById("entrarPersonal").getAttribute("href"),
    segPersonal: document.querySelector("#segPersonal .btn").getAttribute("href"),
    zap: document.getElementById("ctaZap").href,
  }));
  ok(/index\.html/.test(links.empresa), "'Entrar na minha empresa' vai pro portal");
  ok(/personal\.html/.test(links.personal) && /personal\.html/.test(links.segPersonal), "caminho do personal vai pro módulo Personal");
  ok(/wa\.me\/5531988887777/.test(links.zap), "CTA de WhatsApp usa o ?zap= do link");
  await p.close();

  // ---------- 2) HQ travado sem admin ----------
  console.log("HQ (trava de acesso):");
  p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  await p.goto(BASE + "/apps/hq.html");
  await p.waitForTimeout(900);
  const trava = await p.evaluate(() => ({
    lockVisivel: !document.getElementById("hqLock").hidden,
    painelEscondido: document.getElementById("hqPainel").hidden,
    msg: document.getElementById("hqLockMsg").textContent,
  }));
  ok(trava.lockVisivel && trava.painelEscondido, "sem login o painel fica travado");
  ok(/não está logado|nuvem não está configurada/.test(trava.msg), "mensagem explica o que falta");
  const comoAdmin = await p.evaluate(() => document.body.textContent);
  ok(/saas_admins/.test(comoAdmin), "instrução de como virar admin na tela");
  await p.close();

  // ---------- 3) HQ com admin (cliente supabase mockado) ----------
  console.log("HQ (painel do dono):");
  p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  p.on("dialog", (d) => d.accept("197"));
  await p.addInitScript(() => {
    window.__rpcLog = [];
    const dISO = (off) => { const x = new Date(); x.setDate(x.getDate() + off); return x.toISOString(); };
    const CLIENTES = [
      { id: "acad-1", nome: "Academia Ferro Pesado", criada: dISO(-80), tipo: "academia", plano: "Academia", valor: 197, status: "ativo", obs: "", zap: "31988881111", membros: 4, total_pago: 591, ultimo_pgto: dISO(-5).slice(0, 10), pago_mes: 197, ultima_atividade: dISO(-1) },
      { id: "stud-2", nome: "Studio Pilates Vida", criada: dISO(-20), tipo: "studio", plano: "trial", valor: 0, status: "trial", obs: "", zap: "", membros: 1, total_pago: 0, ultimo_pgto: null, pago_mes: 0, ultima_atividade: dISO(-2) },
      { id: "pers-3", nome: "Studio Léo Personal", criada: dISO(-25), tipo: "personal", plano: "Personal", valor: 49, status: "ativo", obs: "", zap: "31977772222", membros: 1, total_pago: 49, ultimo_pgto: dISO(-20).slice(0, 10), pago_mes: 49, ultima_atividade: dISO(-3) },
      { id: "sumi-4", nome: "Academia Sumida", criada: dISO(-90), tipo: "academia", plano: "Academia", valor: 197, status: "ativo", obs: "", zap: "31966663333", membros: 1, total_pago: 394, ultimo_pgto: dISO(-40).slice(0, 10), pago_mes: 0, ultima_atividade: dISO(-20) },
    ];
    window.MT_supabase = {
      auth: {
        getSession: () => Promise.resolve({ data: { session: { user: { email: "raphael@torquefit.com.br" } } } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
      from: () => ({ select: () => Promise.resolve({ data: [] }), upsert: () => Promise.resolve({ data: [] }) }),
      rpc: (nome, args) => {
        window.__rpcLog.push({ nome, args });
        if (nome === "hq_sou_admin") return Promise.resolve({ data: true });
        if (nome === "hq_kpis") return Promise.resolve({ data: { clientes: 4, ativos: 3, trial: 1, mrr: 443, recebido_mes: 246, novos_30d: 2 } });
        if (nome === "hq_clientes") return Promise.resolve({ data: CLIENTES });
        if (nome === "hq_receita_mensal") return Promise.resolve({ data: [{ mes: "2026-01", total: 100 }, { mes: "2026-02", total: 350 }] });
        if (nome === "hq_suporte_threads") return Promise.resolve({ data: [{ academia_id: "acad-1", nome: "Academia Ferro Pesado", ultima: dISO(0), ultima_msg: "O totem travou aqui", nao_lidas: 2 }] });
        if (nome === "hq_suporte_lista") return Promise.resolve({ data: [{ de: "cliente", quem: "dono@ferro.com", texto: "O totem travou aqui", criado: dISO(0) }] });
        if (nome === "hq_erros") return Promise.resolve({ data: [
          { academia_id: "sumi-4", nome: "Academia Sumida", erros: 3, ultimo: dISO(0), ultima_msg: "x is not defined", ultima_pagina: "apps/totem.html" },
          { academia_id: "acad-1", nome: "Academia Ferro Pesado", erros: 1, ultimo: dISO(0), ultima_msg: "TypeError no leitor de QR", ultima_pagina: "apps/entrada.html" },
        ] });
        return Promise.resolve({ data: { ok: true } });
      },
    };
  });
  await p.goto(BASE + "/apps/hq.html");
  await p.waitForFunction(() => !document.getElementById("hqPainel").hidden, null, { timeout: 8000 });
  const kpis = await p.evaluate(() => document.getElementById("hqKpis").textContent);
  ok(/MRR/.test(kpis) && /443/.test(kpis), "KPIs mostram o MRR do TORQUESYS (R$ 443)");
  ok(/ARPU/.test(kpis) && /148/.test(kpis), "ARPU calculado (443/3 ≈ R$ 148) — métrica ChartMogul");
  ok(/Empresas clientes/.test(kpis) && /4/.test(kpis), "KPI de total de empresas");
  let lista = await p.evaluate(() => document.getElementById("hqClientes").textContent);
  ok(/Academia Ferro Pesado/.test(lista) && /Studio Pilates Vida/.test(lista) && /Academia Sumida/.test(lista), "as empresas listadas");
  ok(/ATIVO/i.test(lista) && /TRIAL/i.test(lista), "etiquetas de status");
  ok(/pagou R\$ 591/.test(lista), "total pago por cliente aparece");
  // health score (estilo Customer Success)
  ok(/🟢/.test(lista) && /🔴/.test(lista), "farol de saúde nas empresas (🟢 e 🔴)");
  ok(/sem usar o sistema há/.test(lista), "motivo 👻 de inatividade aparece (última atividade real)");
  ok(/trial vencido/.test(lista), "motivo ⏳ de trial vencido aparece");
  ok(/equipe ainda não entrou/.test(lista), "motivo 👥 de ativação (equipe não entrou)");
  // filtro só em risco
  await p.check("#fRisco");
  lista = await p.evaluate(() => document.getElementById("hqClientes").textContent);
  ok(/Sumida/.test(lista) && !/Ferro Pesado/.test(lista), "filtro 'só em risco' esconde os saudáveis");
  await p.uncheck("#fRisco");
  // resgate via WhatsApp com mensagem contextual
  const zapResgate = await p.evaluate(() => decodeURIComponent(document.querySelector('.cli a[href*="wa.me/5531966663333"]').href));
  ok(/não usam o sistema|mensalidade deste mês/.test(zapResgate), "💬 de resgate tem mensagem contextual pronta");
  // cobranças do mês (rotina Stripe Billing)
  let cob = await p.evaluate(() => document.getElementById("hqCobrancas").textContent);
  ok(/1 cliente\(s\)/.test(cob) && /197/.test(cob) && /Sumida/.test(cob), "cobranças do mês: só quem não pagou (Sumida, R$ 197)");
  ok(!/Ferro Pesado/.test(cob), "quem pagou não entra na cobrança");
  // receita 12 meses
  const rec12 = await p.evaluate(() => ({ hidden: document.getElementById("cardReceita12").hidden, txt: document.getElementById("hqReceita12").textContent }));
  ok(!rec12.hidden && /350/.test(rec12.txt), "card de receita 12 meses com as barras");
  // tickets de suporte
  let tks = await p.evaluate(() => document.getElementById("hqTickets").textContent);
  ok(/Ferro Pesado/.test(tks) && /2 nova\(s\)/.test(tks) && /totem travou/.test(tks), "ticket do cliente com etiqueta de não lidas");
  const badge = await p.evaluate(() => ({ hidden: document.getElementById("tkBadge").hidden, txt: document.getElementById("tkBadge").textContent }));
  ok(!badge.hidden && /2 nova/.test(badge.txt), "badge de não lidas no título do card");
  await p.evaluate(() => document.querySelector("[data-ticket]").click());
  await p.waitForFunction(() => document.getElementById("dlgTicket").open);
  const thread = await p.evaluate(() => document.getElementById("tkMsgs").textContent);
  ok(/O totem travou aqui/.test(thread) && /dono@ferro\.com/.test(thread), "thread abre com a mensagem do cliente");
  const tkCtx = await p.evaluate(() => document.getElementById("tkErros").textContent);
  ok(/1 erro\(s\)/.test(tkCtx) && /TypeError no leitor de QR/.test(tkCtx), "erros recentes do cliente aparecem no próprio ticket (contexto)");
  await p.selectOption("#tkMacros", { index: 1 });
  const macro = await p.evaluate(() => document.getElementById("tkTxt").value);
  ok(/correção já está no ar/.test(macro), "⚡ macro preenche a resposta com 1 clique");
  await p.fill("#tkTxt", "Reinicia o tablet que resolve — e já subi uma correção 😉");
  await p.click("#tkEnviar");
  await p.waitForTimeout(300);
  const respCall = await p.evaluate(() => window.__rpcLog.find((c) => c.nome === "hq_suporte_envia"));
  ok(!!respCall && respCall.args.p_academia === "acad-1" && /correção/.test(respCall.args.p_texto), "resposta sai via hq_suporte_envia");
  await p.evaluate(() => document.getElementById("dlgTicket").close());
  // saúde técnica (Sentry)
  const errosCard = await p.evaluate(() => document.getElementById("hqErros").textContent);
  ok(/Academia Sumida/.test(errosCard) && /3 erro\(s\)/.test(errosCard) && /apps\/totem\.html/.test(errosCard), "monitor de erros mostra cliente, contagem e tela");
  // filtro por tipo
  await p.selectOption("#fTipo", "personal");
  lista = await p.evaluate(() => document.getElementById("hqClientes").textContent);
  ok(/Léo/.test(lista) && !/Ferro Pesado/.test(lista), "filtro por tipo personal funciona");
  await p.selectOption("#fTipo", "");
  // editar plano → rpc hq_cliente_set (agora com WhatsApp)
  await p.evaluate(() => document.querySelector('[data-edit="stud-2"]').click());
  await p.waitForFunction(() => document.getElementById("dlgCli").open);
  await p.selectOption("#dcStatus", "ativo");
  await p.fill("#dcPlano", "Studio & Box");
  await p.fill("#dcValor", "147");
  await p.fill("#dcZap", "31955554444");
  await p.evaluate(() => { document.getElementById("dlgCli").returnValue = "ok"; document.getElementById("dlgCli").close("ok"); });
  await p.waitForTimeout(300);
  const setCall = await p.evaluate(() => window.__rpcLog.find((c) => c.nome === "hq_cliente_set"));
  ok(!!setCall && setCall.args.p_academia === "stud-2" && setCall.args.p_valor === 147 && setCall.args.p_status === "ativo", "salvar plano chama hq_cliente_set (147/ativo)");
  ok(setCall.args.p_zap === "31955554444", "WhatsApp do responsável vai junto (p_zap)");
  // CSV de clientes
  const dlCli = p.waitForEvent("download", { timeout: 5000 }).catch(() => null);
  await p.click("#hqCSV");
  const arqCli = await dlCli;
  ok(!!arqCli && /clientes-torquesys/.test(arqCli.suggestedFilename()), "CSV de clientes baixa");
  // registrar pagamento → rpc hq_pagamento_reg (prompt devolve 197)
  await p.evaluate(() => document.querySelector('[data-pgto="acad-1"]').click());
  await p.waitForTimeout(300);
  const pgtoCall = await p.evaluate(() => window.__rpcLog.find((c) => c.nome === "hq_pagamento_reg"));
  ok(!!pgtoCall && pgtoCall.args.p_academia === "acad-1" && pgtoCall.args.p_valor === 197, "💰 registra mensalidade via hq_pagamento_reg");
  // Pix da mensalidade
  await p.fill("#hqPixChave", "raphael@torquefit.com.br");
  await p.fill("#hqPixNome", "Raphael Margé");
  await p.fill("#hqPixCidade", "Belo Horizonte");
  await p.evaluate(() => document.getElementById("hqPixCidade").blur());
  await p.waitForTimeout(250);
  const temPix = await p.evaluate(() => !!document.querySelector('[data-pix="acad-1"]'));
  ok(temPix, "com a chave configurada aparece o 💠 Pix do cliente");
  await p.evaluate(() => document.querySelector('[data-pix="acad-1"]').click());
  await p.waitForFunction(() => document.getElementById("dlgPixHQ").open);
  const pix = await p.evaluate(() => ({
    code: document.getElementById("pixHQCode").value,
    temQr: !!document.querySelector("#pixHQQr img"),
    titulo: document.getElementById("pixHQTitulo").textContent,
  }));
  ok(/197/.test(pix.titulo) && /Ferro Pesado/.test(pix.titulo), "dialog do Pix com valor e cliente");
  ok(/^000201/.test(pix.code) && /6304[0-9A-F]{4}$/.test(pix.code) && pix.code.includes("br.gov.bcb.pix"), "BR Code EMV válido");
  ok(pix.code.includes("5406197.00"), "campo 54 com a mensalidade 197.00");
  ok(crcNode(pix.code.slice(0, -4)) === pix.code.slice(-4), "CRC do payload confere na reimplementação independente");
  ok(pix.temQr, "QR Code renderizado");
  await p.evaluate(() => document.getElementById("dlgPixHQ").close());
  // funil de vendas local
  await p.fill("#ldNome", "Box Cross Norte");
  await p.fill("#ldContato", "31 98888-0000");
  await p.selectOption("#ldTipo", "box");
  await p.click("#ldAdd");
  let funil = await p.evaluate(() => document.getElementById("ldLista").textContent);
  ok(/Box Cross Norte/.test(funil) && /novo/.test(funil), "lead entra no funil como novo");
  await p.evaluate(() => document.querySelector("[data-avanca]").click());
  funil = await p.evaluate(() => document.getElementById("ldLista").textContent);
  ok(/contato/.test(funil), "lead avança de etapa (novo → contato)");
  const guardou = await p.evaluate(() => JSON.parse(localStorage.getItem("mtapp:hqLeads")).itens.length);
  ok(guardou === 1, "funil guardado no store (sincroniza pela conta)");
  await p.close();

  // ---------- 4) widget 🆘 do cliente (Central de Ajuda) ----------
  console.log("Suporte no Central de Ajuda (lado do cliente):");
  p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  await p.addInitScript(() => {
    window.__rpcLogSup = [];
    const chatDB = [{ de: "suporte", texto: "Olá! Vi seu chamado — como posso ajudar?", criado: new Date().toISOString() }];
    window.MT_supabase = {
      auth: {
        getSession: () => Promise.resolve({ data: { session: { user: { email: "dono@ferro.com" } } } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
      from: () => ({ select: () => Promise.resolve({ data: [] }), upsert: () => Promise.resolve({ data: [] }) }),
      rpc: (nome, args) => {
        window.__rpcLogSup.push({ nome, args });
        if (nome === "suporte_lista") return Promise.resolve({ data: chatDB.slice() });
        if (nome === "suporte_envia") { chatDB.push({ de: "cliente", texto: args.p_texto, criado: new Date().toISOString() }); return Promise.resolve({ data: { ok: true } }); }
        return Promise.resolve({ data: { ok: true } });
      },
    };
  });
  await p.goto(BASE + "/apps/suporte.html");
  await p.waitForFunction(() => window.__suporteSaaS);
  await p.waitForTimeout(500);
  let supMsgs = await p.evaluate(() => document.getElementById("supMsgs").textContent);
  ok(/como posso ajudar/.test(supMsgs), "resposta do suporte aparece no card do cliente");
  // triagem automática (deflection): o robô sugere o tutorial ANTES de abrir chamado
  await p.fill("#supTxt", "O totem não lê o QR do check-in!");
  await p.click("#supEnviar");
  await p.waitForTimeout(300);
  supMsgs = await p.evaluate(() => document.getElementById("supMsgs").textContent);
  ok(/Isso pode resolver agora/.test(supMsgs) && /📖/.test(supMsgs), "robô sugere o tutorial que resolve antes de abrir chamado");
  const semRpc = await p.evaluate(() => window.__rpcLogSup.filter((c) => c.nome === "suporte_envia").length);
  ok(semRpc === 0, "nada é enviado enquanto a sugestão está na tela");
  await p.click("#supInsiste");
  await p.waitForTimeout(400);
  const enviaCall = await p.evaluate(() => window.__rpcLogSup.find((c) => c.nome === "suporte_envia"));
  ok(!!enviaCall && /QR/.test(enviaCall.args.p_texto), "cliente insistiu → chamado sai via suporte_envia");
  ok(/🔧 diag automático/.test(enviaCall.args.p_texto), "1ª mensagem leva o diagnóstico anexado sozinho");
  supMsgs = await p.evaluate(() => document.getElementById("supMsgs").textContent);
  ok(/totem não lê o QR/.test(supMsgs), "mensagem enviada aparece na conversa");
  // mensagem sem tutorial correspondente vai direto (sem diag — já não é a 1ª)
  await p.fill("#supTxt", "zzzzz wwwww qqqqq");
  await p.click("#supEnviar");
  await p.waitForTimeout(400);
  const chamadas = await p.evaluate(() => window.__rpcLogSup.filter((c) => c.nome === "suporte_envia"));
  ok(chamadas.length === 2 && !/🔧/.test(chamadas[1].args.p_texto), "sem tutorial que ajude, envia direto (e sem repetir o diagnóstico)");
  const zapEscondido = await p.evaluate(() => document.getElementById("supZap").hidden);
  ok(zapEscondido, "botão de WhatsApp fica escondido sem suporteZap configurado");
  await p.click("#supDiag");
  const diagTxt = await p.evaluate(() => document.getElementById("supDiag").textContent);
  ok(/Copiado/.test(diagTxt), "relatório de diagnóstico é copiado com um clique");
  await p.close();

  ok(erros.length === 0, "nenhuma página com erro de JS" + (erros.length ? " — " + erros[0] : ""));

  await b.close();
  console.log(falhas ? "\n💥 " + falhas + " FALHA(S)" : "\n🏁 TUDO PASSOU");
  process.exit(falhas ? 1 : 0);
})();
