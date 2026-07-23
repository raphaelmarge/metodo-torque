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
    const CLIENTES = [
      { id: "acad-1", nome: "Academia Ferro Pesado", criada: "2026-05-01T10:00:00Z", tipo: "academia", plano: "Academia", valor: 197, status: "ativo", obs: "", membros: 4, total_pago: 591, ultimo_pgto: "2026-07-05", pago_mes: 197 },
      { id: "stud-2", nome: "Studio Pilates Vida", criada: "2026-06-20T10:00:00Z", tipo: "studio", plano: "trial", valor: 0, status: "trial", obs: "", membros: 1, total_pago: 0, ultimo_pgto: null, pago_mes: 0 },
      { id: "pers-3", nome: "Studio Léo Personal", criada: "2026-07-01T10:00:00Z", tipo: "personal", plano: "Personal", valor: 49, status: "ativo", obs: "", membros: 1, total_pago: 49, ultimo_pgto: "2026-07-02", pago_mes: 49 },
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
        if (nome === "hq_kpis") return Promise.resolve({ data: { clientes: 3, ativos: 2, trial: 1, mrr: 246, recebido_mes: 246, novos_30d: 2 } });
        if (nome === "hq_clientes") return Promise.resolve({ data: CLIENTES });
        return Promise.resolve({ data: { ok: true } });
      },
    };
  });
  await p.goto(BASE + "/apps/hq.html");
  await p.waitForFunction(() => !document.getElementById("hqPainel").hidden, null, { timeout: 8000 });
  const kpis = await p.evaluate(() => document.getElementById("hqKpis").textContent);
  ok(/MRR/.test(kpis) && /246/.test(kpis), "KPIs mostram o MRR do TORQUESYS (R$ 246)");
  ok(/Empresas clientes/.test(kpis) && /3/.test(kpis), "KPI de total de empresas");
  let lista = await p.evaluate(() => document.getElementById("hqClientes").textContent);
  ok(/Academia Ferro Pesado/.test(lista) && /Studio Pilates Vida/.test(lista) && /Studio Léo Personal/.test(lista), "as 3 empresas listadas");
  ok(/ATIVO/i.test(lista) && /TRIAL/i.test(lista), "etiquetas de status");
  ok(/pagou R\$ 591/.test(lista), "total pago por cliente aparece");
  // filtro por tipo
  await p.selectOption("#fTipo", "personal");
  lista = await p.evaluate(() => document.getElementById("hqClientes").textContent);
  ok(/Léo/.test(lista) && !/Ferro Pesado/.test(lista), "filtro por tipo personal funciona");
  await p.selectOption("#fTipo", "");
  // editar plano → rpc hq_cliente_set
  await p.evaluate(() => document.querySelector('[data-edit="stud-2"]').click());
  await p.waitForFunction(() => document.getElementById("dlgCli").open);
  await p.selectOption("#dcStatus", "ativo");
  await p.fill("#dcPlano", "Studio & Box");
  await p.fill("#dcValor", "147");
  await p.evaluate(() => { document.getElementById("dlgCli").returnValue = "ok"; document.getElementById("dlgCli").close("ok"); });
  await p.waitForTimeout(300);
  const setCall = await p.evaluate(() => window.__rpcLog.find((c) => c.nome === "hq_cliente_set"));
  ok(!!setCall && setCall.args.p_academia === "stud-2" && setCall.args.p_valor === 147 && setCall.args.p_status === "ativo", "salvar plano chama hq_cliente_set (147/ativo)");
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

  ok(erros.length === 0, "nenhuma página com erro de JS" + (erros.length ? " — " + erros[0] : ""));

  await b.close();
  console.log(falhas ? "\n💥 " + falhas + " FALHA(S)" : "\n🏁 TUDO PASSOU");
  process.exit(falhas ? 1 : 0);
})();
