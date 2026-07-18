// Suíte do TORQUESYS — roda local (Claude/dev) e no CI (GitHub Actions).
let chromium;
try { chromium = require("playwright").chromium; }
catch (e) { chromium = require("/opt/node22/lib/node_modules/playwright").chromium; }
const fs = require("fs");
const EXEC = process.env.CHROMIUM_PATH || (fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
/* E2E da Grade de Aulas (apps/grade.html) */


let ok = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { ok++; console.log("  ✔ " + msg); }
  else { fail++; console.log("  ✘ FALHOU: " + msg); }
}
const hoje = new Date();
const hojeISO = hoje.toISOString().slice(0, 10);
const dow = new Date(hojeISO + "T12:00").getDay();

const SEED = {
  perfil: { nome: "Raphael" },
  academia: { id: "a", papel: "dono", nome: "TORQUE FIT" },
  alunos: { planos: [], alunos: [
    { id: "a1", nome: "Ana Silva", status: "ativo" },
    { id: "a2", nome: "Bruno Costa", status: "ativo" },
  ], recebiveis: [] },
  grade: {
    aulas: [
      { id: "g1", nome: "CROSSFIT", prof: "Jose Darlon", sala: "BOX", vagas: 14, inicio: "06:00", dur: 60, dias: [0,1,2,3,4,5,6], cor: "#7c3aed" },
      { id: "g2", nome: "SPINNING", prof: "Luana Silva", sala: "SALA DE BIKE", vagas: 12, inicio: "19:00", dur: 50, dias: [dow], cor: "#0ea5a5" },
    ],
    avulsas: [],
    presencas: {},
  },
};
SEED.grade.presencas["g1|" + hojeISO] = ["Ana Silva"];

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const erros = [];
  ctx.on("weberror", (e) => erros.push(e.error().message));
  await ctx.addInitScript((s) => { try { Object.keys(s).forEach((k) => localStorage.setItem("mtapp:" + k, JSON.stringify(s[k]))); } catch (e) {} }, SEED);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => erros.push("pageerror: " + e.message));

  console.log("— vista Semana —");
  await page.goto(BASE + "/apps/grade.html");
  await page.waitForSelector(".semana .col");
  const cols = await page.$$eval(".semana .col", (c) => c.length);
  assert(cols === 7, "7 colunas na semana");
  assert(!!(await page.$(".semana .col.hoje")), "coluna de hoje destacada");
  const cross = await page.$$eval(".aula-card", (c) => c.filter((x) => x.textContent.includes("CROSSFIT")).length);
  assert(cross === 7, "CROSSFIT aparece nos 7 dias (tem " + cross + ")");
  const spin = await page.$$eval(".aula-card", (c) => c.filter((x) => x.textContent.includes("SPINNING")).length);
  assert(spin === 1, "SPINNING só no dia de hoje");
  const badge = await page.$$eval(".aula-card", (c) => c.filter((x) => x.textContent.includes("1/14")).length);
  assert(badge === 1, "ocupação 1/14 na ocorrência de hoje do CROSSFIT");

  console.log("— filtros —");
  await page.click('#turnos button[data-t="noite"]');
  let vis = await page.$$eval(".aula-card", (c) => c.map((x) => x.textContent));
  assert(vis.every((t) => t.includes("SPINNING")) && vis.length === 1, "filtro Noite deixa só o SPINNING");
  await page.click('#turnos button[data-t=""]');
  await page.fill("#busca", "luana");
  vis = await page.$$eval(".aula-card", (c) => c.map((x) => x.textContent));
  assert(vis.length === 1 && vis[0].includes("SPINNING"), "busca por professora filtra");
  await page.fill("#busca", "");

  console.log("— vista Dia + navegação —");
  await page.click('#vistas button[data-v="dia"]');
  await page.waitForSelector(".dia-lista");
  const rotulo1 = await page.textContent("#navRotulo");
  assert((await page.$$eval(".aula-card", (c) => c.length)) === 2, "dia de hoje tem 2 aulas");
  await page.click("#navProx");
  const rotulo2 = await page.textContent("#navRotulo");
  assert(rotulo1 !== rotulo2, "navegar › muda o dia");
  await page.click("#navHoje");
  assert((await page.textContent("#navRotulo")) === rotulo1, "Hoje volta para o dia atual");

  console.log("— participantes —");
  await page.click(".aula-card"); // primeira aula (06:00 CROSSFIT)
  await page.waitForSelector("#dlgPart[open]");
  assert((await page.textContent("#partTitulo")).includes("CROSSFIT"), "dialog mostra a aula");
  assert((await page.textContent("#partLista")).includes("Ana Silva"), "participante seed listado");
  await page.fill("#partNome", "Bruno Costa");
  await page.click("#partAdd");
  assert((await page.textContent("#partLista")).includes("Bruno Costa"), "adicionar participante");
  const opts = await page.$$eval("#alunosLista option", (o) => o.length);
  assert(opts === 2, "sugestões vêm do cadastro de alunos");
  await page.click('#partLista [data-rm="1"]');
  assert(!(await page.textContent("#partLista")).includes("Bruno Costa"), "remover participante");
  await page.click("#partFechar");

  console.log("— nova aula da grade —");
  await page.click("#btnNova");
  await page.waitForSelector("#dlgAula[open]");
  await page.fill("#gNome", "GAP");
  await page.fill("#gProf", "Luana Silva");
  await page.fill("#gSala", "SALA DE GINÁSTICA");
  await page.check('#gDias input[value="' + dow + '"]');
  await page.fill("#gInicio", "08:00");
  await page.click('#dlgAula button[value="ok"]');
  await page.waitForFunction(() => !document.getElementById("dlgAula").open);
  vis = await page.$$eval(".aula-card", (c) => c.map((x) => x.textContent));
  assert(vis.some((t) => t.includes("GAP")), "GAP aparece na vista Dia de hoje");

  console.log("— sob demanda —");
  await page.click("#btnDemanda");
  await page.waitForSelector("#dlgDemanda[open]");
  await page.fill("#dNome", "AULÃO FUNCIONAL");
  await page.fill("#dProf", "Hugo Cesar");
  await page.fill("#dSala", "QUADRA");
  await page.fill("#dInicio", "10:00");
  await page.click('#dlgDemanda button[value="ok"]');
  await page.waitForFunction(() => !document.getElementById("dlgDemanda").open);
  vis = await page.$$eval(".aula-card", (c) => c.map((x) => x.textContent));
  assert(vis.some((t) => t.includes("AULÃO FUNCIONAL")), "aula sob demanda aparece no dia");
  await page.click("#navProx");
  vis = await page.$$eval(".aula-card", (c) => c.map((x) => x.textContent));
  assert(!vis.some((t) => t.includes("AULÃO FUNCIONAL")), "sob demanda NÃO repete no dia seguinte");

  console.log("— integração com o Sistema —");
  await page.goto(BASE + "/apps/sistema.html");
  await page.waitForSelector("#hojeResumo div");
  await page.click('.menu .item[data-url="grade.html"]');
  await page.waitForSelector("#quadro:not([hidden])");
  const frame = await (await page.$("#quadro")).contentFrame();
  await frame.waitForSelector(".semana .col");
  assert(true, "menu Grade abre o programa dentro do sistema");

  console.log("— portal —");
  await page.goto(BASE + "/index.html");
  await page.waitForSelector("#appGrid .app-card");
  assert(!!(await page.$('#appGrid a[href="#/d/app-grade"]')), "card Grade de Aulas no portal");

  const errosReais = erros.filter((e) => !/service.?worker|Failed to register/i.test(e));
  assert(errosReais.length === 0, "zero erros de JS (" + errosReais.join(" | ").slice(0, 300) + ")");

  await browser.close();
  console.log("\nResultado: " + ok + " ok, " + fail + " falhas");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ERRO FATAL:", e); process.exit(1); });
