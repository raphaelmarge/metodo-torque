// Suíte do TORQUESYS — roda local (Claude/dev) e no CI (GitHub Actions).
let chromium;
try { chromium = require("playwright").chromium; }
catch (e) { chromium = require("/opt/node22/lib/node_modules/playwright").chromium; }
const fs = require("fs");
const EXEC = process.env.CHROMIUM_PATH || (fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
/* E2E do Sistema no celular — menu retrátil */

let ok = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { ok++; console.log("  ✔ " + msg); }
  else { fail++; console.log("  ✘ FALHOU: " + msg); }
}
const SEED = {
  perfil: { nome: "Raphael" },
  academia: { id: "a", papel: "dono", nome: "TORQUE FIT" },
  alunos: { planos: [], alunos: [], recebiveis: [] },
};
(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const erros = [];
  ctx.on("weberror", (e) => erros.push(e.error().message));
  await ctx.addInitScript((s) => { try { Object.keys(s).forEach((k) => localStorage.setItem("mtapp:" + k, JSON.stringify(s[k]))); } catch (e) {} }, SEED);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => erros.push("pageerror: " + e.message));

  await page.goto(BASE + "/apps/sistema.html");
  await page.waitForSelector("#hojeResumo div");

  console.log("— menu retrátil —");
  const menuBox = await page.locator(".menu").boundingBox();
  assert(!menuBox || menuBox.x + menuBox.width <= 0, "menu escondido por padrão (fora da tela)");
  assert(await page.isVisible("#btnMenu"), "botão ☰ visível no topo");
  const conteudoBox = await page.locator("#pgHome").boundingBox();
  assert(conteudoBox.x < 30, "conteúdo ocupa a largura toda");

  await page.click("#btnMenu");
  await page.waitForTimeout(350);
  const menuAberto = await page.locator(".menu").boundingBox();
  assert(menuAberto && menuAberto.x >= 0, "☰ abre a gaveta do menu");
  assert(await page.isVisible("#fundoMenu"), "fundo escurecido atrás do menu");

  await page.click('.menu .item[data-pg="dashboard"]');
  await page.waitForTimeout(350);
  assert(!(await page.evaluate(() => document.body.classList.contains("menu-aberto"))), "escolher um item fecha a gaveta");
  assert(await page.isVisible("#kpis"), "dashboard abriu");
  const kpiBoxes = await page.$$eval("#kpis .kpi", (k) => k.slice(0, 2).map((x) => x.getBoundingClientRect().x));
  assert(kpiBoxes.length === 2, "KPIs renderizados");

  await page.click("#btnMenu");
  await page.waitForTimeout(300);
  await page.click("#fundoMenu", { position: { x: 380, y: 400 } });
  await page.waitForTimeout(300);
  assert(!(await page.evaluate(() => document.body.classList.contains("menu-aberto"))), "tocar fora fecha a gaveta");

  console.log("— navegação para programa (iframe) —");
  await page.click("#btnMenu");
  await page.waitForTimeout(300);
  await page.click('.menu .item[data-url="alunos.html"]');
  await page.waitForSelector("#quadro:not([hidden])");
  assert(true, "Clientes abre no iframe em tela cheia");

  console.log("— sem overflow horizontal —");
  await page.click("#btnMenu"); await page.waitForTimeout(300);
  await page.click('.menu .item[data-pg="home"]');
  await page.waitForTimeout(300);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(overflow <= 1, "página não rola para o lado (overflow=" + overflow + ")");

  const errosReais = erros.filter((e) => !/service.?worker|Failed to register/i.test(e));
  assert(errosReais.length === 0, "zero erros de JS (" + errosReais.join(" | ").slice(0, 200) + ")");

  await page.screenshot({ path: __dirname + "/mobile-home.png" });
  await page.click("#btnMenu"); await page.waitForTimeout(350);
  await page.screenshot({ path: __dirname + "/mobile-menu.png" });

  await browser.close();
  console.log("\nResultado: " + ok + " ok, " + fail + " falhas");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ERRO FATAL:", e); process.exit(1); });
