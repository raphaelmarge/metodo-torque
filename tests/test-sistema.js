// Suíte do TORQUESYS — roda local (Claude/dev) e no CI (GitHub Actions).
let chromium;
try { chromium = require("playwright").chromium; }
catch (e) { chromium = require("/opt/node22/lib/node_modules/playwright").chromium; }
const fs = require("fs");
const EXEC = process.env.CHROMIUM_PATH || (fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
/* E2E do Sistema da Academia (apps/sistema.html) */


let ok = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { ok++; console.log("  ✔ " + msg); }
  else { fail++; console.log("  ✘ FALHOU: " + msg); }
}
const hojeISO = new Date().toISOString().slice(0, 10);
const mes = hojeISO.slice(0, 7);

const SEED = {
  perfil: { nome: "Raphael", email: "r@t.com" },
  academia: { id: "acad1", papel: "dono", nome: "TORQUE FIT", codigo_equipe: "ABC123" },
  alunos: {
    planos: [
      { id: "p1", nome: "Mensal", valor: 120, tipo: "recorrente" },
      { id: "p2", nome: "Gympass", valor: 0, tipo: "agregador" },
    ],
    alunos: [
      { id: "a1", nome: "Ana Silva", status: "ativo", zap: "31999990001",
        contratos: [{ id: "c1", planoId: "p1", status: "ativo", inicio: hojeISO.slice(0,8) + "01", meses: 12 }],
        checkins: [new Date().toISOString()] },
      { id: "a2", nome: "Bruno Costa", status: "ativo",
        contratos: [{ id: "c2", planoId: "p1", status: "ativo", inicio: "2026-01-10", meses: 6 }] },
      { id: "a3", nome: "Carla Gympass", status: "ativo",
        contratos: [{ id: "c3", planoId: "p2", status: "ativo", inicio: "2026-05-01", meses: 12 }] },
      { id: "a4", nome: "Diego Congelado", status: "ativo",
        contratos: [{ id: "c4", planoId: "p1", status: "congelado", inicio: "2026-03-01", meses: 12 }] },
    ],
    recebiveis: [
      { id: "r1", alunoId: "a1", valor: 120, vencimento: hojeISO, status: "aberto", competencia: mes },
      { id: "r2", alunoId: "a2", valor: 120, vencimento: "2026-06-15", status: "aberto", competencia: "2026-06" },
      { id: "r3", alunoId: "a1", valor: 120, vencimento: "2026-06-05", status: "pago", pagoEm: "2026-06-05", competencia: "2026-06" },
    ],
  },
  exper: { aulas: [
    { id: "e1", nome: "Lead Compareceu", data: hojeISO, hora: "10:00", status: "compareceu", origem: "Instagram" },
    { id: "e2", nome: "Lead Matriculado", data: hojeISO.slice(0, 8) + "01", hora: "18:00", status: "matriculado", origem: "Indicação" },
  ] },
};

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const erros = [];
  ctx.on("weberror", (e) => erros.push((e.page() ? e.page().url() : "?") + " :: " + e.error().message + " :: " + (e.error().stack || "").split("\n").slice(0,3).join(" / ")));

  await ctx.addInitScript((seed) => {
    try {
      localStorage.setItem("mtapp:perfil", JSON.stringify(seed.perfil));
      localStorage.setItem("mtapp:academia", JSON.stringify(seed.academia));
      localStorage.setItem("mtapp:alunos", JSON.stringify(seed.alunos));
      localStorage.setItem("mtapp:exper", JSON.stringify(seed.exper));
    } catch (e) { /* about:blank sem storage */ }
  }, SEED);

  const page = await ctx.newPage();
  page.on("pageerror", (e) => erros.push("pageerror: " + e.message));

  console.log("— shell + Home —");
  await page.goto(BASE + "/apps/sistema.html");
  await page.waitForSelector("#hojeResumo div");
  assert((await page.textContent("#topNome")).includes("RAPHAEL"), "topo mostra o nome do usuário");
  assert((await page.textContent("#topAcad")).includes("TORQUE FIT"), "topo mostra a academia");
  assert((await page.textContent("#hOla")).includes("RAPHAEL"), "saudação personalizada na Home");
  const grupos = await page.$$eval(".menu .grupo", (g) => g.length);
  assert(grupos >= 7, "menu tem 7+ grupos colapsáveis (tem " + grupos + ")");
  const itens = await page.$$eval(".menu .item", (i) => i.length);
  assert(itens >= 28, "menu tem 28+ itens (tem " + itens + ")");
  const resumo = await page.textContent("#hojeResumo");
  assert(resumo.includes("Check-ins"), "Home resume o dia (check-ins)");
  assert(resumo.includes("1"), "Home conta 1 check-in de hoje");

  console.log("— Dashboard —");
  await page.click('.menu .item[data-pg="dashboard"]');
  await page.waitForSelector("#kpis .kpi");
  const kpis = await page.$$eval("#kpis .kpi", (k) => k.map((x) => x.textContent));
  assert(kpis.length === 9, "9 KPIs no dashboard (tem " + kpis.length + ")");
  const kAtivos = kpis.find((t) => t.includes("Ativos"));
  assert(kAtivos && kAtivos.includes("4"), "KPI Ativos = 4");
  const kAgreg = kpis.find((t) => t.includes("Agregadores"));
  assert(kAgreg && kAgreg.includes("1"), "KPI Agregadores = 1 (Gympass)");
  const kSusp = kpis.find((t) => t.includes("Suspensos"));
  assert(kSusp && kSusp.includes("1"), "KPI Suspensos = 1 (congelado)");
  const kInad = kpis.find((t) => t.includes("Inadimplentes"));
  assert(kInad && kInad.includes("1"), "KPI Inadimplentes = 1 (Bruno)");
  const paineis = await page.textContent("#paineisDash");
  assert(paineis.includes("Renovações"), "painel de renovações presente");
  assert(paineis.includes("Financeiro do mês"), "painel financeiro do mês presente");
  assert(paineis.includes("120"), "financeiro soma o recebível do mês");

  console.log("— Dashboard · aba Vendas —");
  await page.click('#dashAbas button[data-dv="vendas"]');
  await page.waitForSelector("#kpisVendas .kpi");
  const kv = await page.$$eval("#kpisVendas .kpi", (k) => k.map((x) => x.textContent));
  assert(kv.length === 6, "6 KPIs de vendas (tem " + kv.length + ")");
  const kVend = kv.find((t) => t.includes("Contratos vendidos"));
  assert(kVend && /1/.test(kVend), "1 contrato vendido no mês");
  assert(kv.some((t) => t.includes("período anterior")), "comparação com período anterior nos KPIs");
  assert(!!(await page.$("#grafVendas svg")), "gráfico de total de vendas (SVG)");
  const vd = await page.textContent("#visitDestaque");
  assert(vd.includes("2 x 1"), "visitantes x conversões do mês = 2 x 1");
  assert(!!(await page.$("#grafVisit svg")), "gráfico visitantes x conversões (SVG)");

  console.log("— controles estilo EVO —");
  assert((await page.inputValue("#dashDia")) === hojeISO, "seletor de data preenchido com hoje");
  assert(!!(await page.$(".dash-controles .btn-roxo")), "botão NOVO CADASTRO no dashboard");
  assert(!!(await page.$('.acoes-topo button[data-abrir="alunos.html?acao=novo"]')), "atalho de novo cadastro no topo");
  assert(!!(await page.$("#grafMensalMedia svg")), "gráfico de mensalidade média (SVG)");
  await page.click('#vendasVistaBt button[data-v="dia"]');
  assert(!!(await page.$("#grafVendas svg")), "alternar para Dia mantém o gráfico de vendas");
  await page.click('#vendasVistaBt button[data-v="mes"]');
  const origens = await page.$$eval("#visitOrigem option", (o) => o.map((x) => x.textContent));
  assert(origens.length >= 3 && origens.some((t) => t.includes("Instagram")), "filtro de origem populado (" + origens.join(", ") + ")");
  await page.selectOption("#visitOrigem", "Instagram");
  const vdInsta = await page.textContent("#visitDestaque");
  assert(vdInsta.includes("1 x 0"), "filtro Instagram muda o destaque para 1 x 0");
  await page.selectOption("#visitOrigem", "");
  await page.click('#visitCtrl button[data-v="7d"]');
  assert(!!(await page.$("#grafVisit svg")), "vista Últimos 7 dias renderiza (SVG)");
  await page.click('#visitCtrl button[data-v="mes"]');

  console.log("— Dashboard · aba Financeiro —");
  await page.click('#dashAbas button[data-dv="financeiro"]');
  await page.waitForSelector("#kpisFin .kpi");
  const kf = await page.$$eval("#kpisFin .kpi", (k) => k.map((x) => x.textContent));
  assert(kf.length >= 5, "5+ KPIs financeiros (tem " + kf.length + ")");
  const kInadF = kf.find((t) => t.includes("Inadimplência"));
  assert(kInadF && kInadF.includes("120"), "Inadimplência = R$120 (parcela vencida do Bruno)");
  assert(kf.some((t) => t.includes("Recebido no mês")), "KPI de recebido no mês presente");
  assert(kf.some((t) => t.includes("Ticket médio")), "KPI de ticket médio presente");
  assert(!!(await page.$("#grafReceb svg")), "gráfico de recebimentos (SVG)");
  assert(!!(await page.$("#grafTicket svg")), "gráfico de ticket médio (SVG)");
  await page.click('#dashAbas button[data-dv="clientes"]');
  await page.waitForSelector("#kpis .kpi");

  console.log("— deep-link Detalhes (filtro) —");
  await page.click('#kpis a[data-abrir="alunos.html?filtro=atrasado"]');
  await page.waitForSelector("#quadro:not([hidden])");
  let frame = await (await page.$("#quadro")).contentFrame();
  await frame.waitForSelector("#listaAlunos");
  assert((await frame.inputValue("#filtro")) === "atrasado", "iframe Clientes abre com filtro=atrasado aplicado");
  let linhas = await frame.$$eval("#listaAlunos [data-id]", (l) => l.map((x) => x.textContent));
  assert(linhas.length === 1 && linhas[0].includes("Bruno"), "lista filtrada mostra só o atrasado (Bruno)");

  console.log("— menu: Clientes / A Receber —");
  await page.$$eval(".menu .grupo", (gs) => gs.forEach((g) => { g.open = true; }));
  await page.click('.menu .item[data-url="receber.html"]');
  await page.waitForFunction(() => document.querySelector("#quadro") && document.querySelector("#quadro").src.includes("receber.html"));
  assert(true, "menu abre a página dedicada Contas a Receber");
  await page.click('.menu .item[data-url="alunos.html?aba=planos"]');
  frame = await (await page.$("#quadro")).contentFrame();
  await frame.waitForSelector("#vPlanos:not([hidden])");
  assert(true, "aba Planos ativa via ?aba=planos");

  console.log("— atalhos da Home (ações) —");
  await page.click('.menu .item[data-pg="home"]');
  await page.click('[data-abrir="alunos.html?acao=novo"]');
  frame = await (await page.$("#quadro")).contentFrame();
  await frame.waitForSelector("#dlgAluno[open]");
  assert(true, "atalho Novo cadastro abre o dialog no iframe");
  await Promise.resolve().then(() => frame.evaluate(() => document.getElementById("dlgAluno").close()));

  await page.click('.menu .item[data-pg="home"]');
  await page.click('[data-abrir="alunos.html?acao=venda"]');
  frame = await (await page.$("#quadro")).contentFrame();
  await frame.waitForSelector("#dlgVenda[open]");
  assert(true, "atalho Nova venda abre o dialog de venda no iframe");

  console.log("— busca global —");
  await page.fill("#buscaGlobal", "Ana");
  await page.press("#buscaGlobal", "Enter");
  frame = await (await page.$("#quadro")).contentFrame();
  await frame.waitForSelector("#listaAlunos");
  assert((await frame.inputValue("#busca")) === "Ana", "busca global preenche a busca do iframe");
  linhas = await frame.$$eval("#listaAlunos [data-id]", (l) => l.map((x) => x.textContent));
  assert(linhas.length === 1 && linhas[0].includes("Ana"), "resultado da busca global = Ana Silva");

  console.log("— pesquisa no menu —");
  await page.fill("#pesquisaMenu", "manuten");
  const visiveis = await page.$$eval(".menu nav .item", (is) => is.filter((i) => i.style.display !== "none").map((i) => i.textContent.trim()));
  assert(visiveis.length === 1 && visiveis[0].includes("Manutenção"), "pesquisa do menu filtra (só Manutenção)");
  await page.fill("#pesquisaMenu", "");

  console.log("— Configurações —");
  await page.click('.menu .item[data-pg="config"]');
  assert(await page.isVisible("#cfgLogo"), "botão de logo presente");
  assert(await page.isVisible("#cfgBkExp"), "botão de backup presente");

  console.log("— portal registra o Sistema —");
  await page.goto(BASE + "/index.html");
  await page.waitForSelector("#appGrid .app-card");
  const card = await page.$('#appGrid a[href="apps/sistema.html"]');
  assert(!!card, "card do Sistema aparece no portal (nova aba)");
  assert(card && (await card.getAttribute("target")) === "_blank", "card abre em nova aba (standalone)");

  console.log("— erros de página —");
  const errosReais = erros.filter((e) => !/service.?worker|Failed to register/i.test(e));
  assert(errosReais.length === 0, "zero erros de JS (" + errosReais.join(" | ").slice(0, 300) + ")");

  await browser.close();
  console.log("\nResultado: " + ok + " ok, " + fail + " falhas");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ERRO FATAL:", e); process.exit(1); });
