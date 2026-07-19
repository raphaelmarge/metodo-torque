// Horários de funcionamento: padrão TORQUE FIT, dom/feriado, totem, app e entrada
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

  // ---------- 1) primeira abertura semeia o padrão ----------
  console.log("Horários de Funcionamento:");
  let p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  await p.goto(BASE + "/apps/horarios-funcionamento.html");
  await p.waitForFunction(() => window.__funcionamento);
  const seed = await p.evaluate(() => JSON.parse(localStorage.getItem("mtapp:funcionamento")));
  ok(seed && seed.dias && seed.dias["1"] && seed.dias["1"].de === "06:00" && seed.dias["1"].ate === "23:00", "padrão seg–sex 06:00–23:00");
  ok(seed.dias["6"] && seed.dias["6"].de === "08:00" && seed.dias["6"].ate === "16:00", "padrão sábado 08:00–16:00");
  ok(seed.dias["0"] && seed.dias["0"].de === "08:00" && seed.dias["0"].ate === "14:00", "padrão domingo 08:00–14:00");
  ok(seed.config && seed.config.feriadoComoDomingo === true, "feriados nacionais seguem domingo (ligado)");
  const toggle = await p.evaluate(() => document.getElementById("ferDom").checked);
  ok(toggle, "toggle visível e marcado");
  const prev = await p.evaluate(() => document.getElementById("previewHoje").textContent);
  ok(/Hoje/.test(prev) && /totem/.test(prev), "preview de hoje aparece");

  // ---------- 2) resolução de horário por tipo de dia ----------
  const res = await p.evaluate(() => {
    const S = window.MTStore;
    // uma segunda, um sábado, um domingo e o Natal do ano que vem (nacional)
    function acha(dow) {
      const d = new Date();
      for (let i = 0; i < 7; i++) { d.setDate(d.getDate() + 1); if (d.getDay() === dow) break; }
      return d.toISOString().slice(0, 10);
    }
    const natal = (new Date().getFullYear() + 1) + "-12-25";
    // feriado cadastrado com horário especial
    const st = S.read("funcionamento", { dias: {}, feriados: [], config: {} });
    st.feriados.push({ id: "f1", data: natal.slice(0, 4) + "-06-30", nome: "Aniversário da cidade", de: "09:00", ate: "12:00" });
    S.write("funcionamento", st);
    return {
      seg: S.horarioDoDia(acha(1)),
      sab: S.horarioDoDia(acha(6)),
      dom: S.horarioDoDia(acha(0)),
      natal: S.horarioDoDia(natal),
      especial: S.horarioDoDia(natal.slice(0, 4) + "-06-30"),
      pontoFer: S.ehDomingoOuFeriado(natal.slice(0, 4) + "-06-30"),
    };
  });
  ok(res.seg.faixas.length && res.seg.faixas[0].de === "06:00" && res.seg.faixas[0].ate === "23:00", "segunda resolve 06–23");
  ok(res.sab.faixas[0] && res.sab.faixas[0].de === "08:00" && res.sab.faixas[0].ate === "16:00", "sábado resolve 08–16");
  ok(res.dom.faixas[0] && res.dom.faixas[0].de === "08:00" && res.dom.faixas[0].ate === "14:00", "domingo resolve 08–14");
  ok(res.natal.feriado === "feriado" && res.natal.faixas[0] && res.natal.faixas[0].de === "08:00" && res.natal.faixas[0].ate === "14:00", "Natal (nacional) segue o horário de domingo");
  ok(res.especial.feriado === "Aniversário da cidade" && res.especial.faixas[0] && res.especial.faixas[0].de === "09:00", "feriado cadastrado usa o horário especial 09–12");
  ok(res.pontoFer === true, "feriado cadastrado também conta como dom/feriado na folha do horista");
  await p.close();

  // ---------- 3) totem mostra o horário de hoje ----------
  console.log("Totem:");
  p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  await p.goto(BASE + "/apps/totem.html");
  await p.waitForFunction(() => window.__totem);
  await p.waitForTimeout(400);
  const funcTotem = await p.evaluate(() => document.getElementById("funcHoje").textContent);
  ok(/Hoje/.test(funcTotem) && /–/.test(funcTotem), "totem mostra '🕐 Hoje: …' com a faixa do dia");
  await p.close();

  // ---------- 4) app do aluno leva o funcionamento embutido ----------
  console.log("App do aluno:");
  p = await ctx.newPage();
  await p.goto(BASE + "/apps/app-aluno.html");
  await p.waitForFunction(() => window.__appAluno);
  const html = await p.evaluate(() => {
    localStorage.setItem("mtapp:alunos", JSON.stringify({ alunos: [{ id: "a1", nome: "Rafa Silva", status: "ativo" }], planos: [], recebiveis: [] }));
    return window.__appAluno.monta({ id: "a1", nome: "Rafa Silva", status: "ativo" }, new Date().toISOString());
  });
  ok(html.includes("funcHoje") && html.includes("var FUNC="), "app gerado tem o bloco de funcionamento");
  const p2 = await ctx.newPage();
  const errosApp = [];
  p2.on("pageerror", (e) => errosApp.push(String(e)));
  await p2.setContent(html, { waitUntil: "domcontentloaded" });
  await p2.waitForTimeout(500);
  const funcApp = await p2.evaluate(() => document.getElementById("funcHoje").textContent);
  ok(/Hoje/.test(funcApp) && /–|fechado/.test(funcApp), "app mostra o horário de hoje no Início");
  ok(errosApp.length === 0, "app gerado sem erros de JS" + (errosApp.length ? " — " + errosApp[0] : ""));
  await p2.close();
  await p.close();

  ok(erros.length === 0, "nenhuma página com erro de JS" + (erros.length ? " — " + erros[0] : ""));

  await b.close();
  console.log(falhas ? "\n💥 " + falhas + " FALHA(S)" : "\n🏁 TUDO PASSOU");
  process.exit(falhas ? 1 : 0);
})();
