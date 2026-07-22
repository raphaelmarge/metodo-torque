// Relatórios 2: vazamento de preço, retenção por atividade, no-show, pico×escala, resultados, agregadores, tendência de risco, painel do dono
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

  const hoje = new Date().toISOString().slice(0, 10);
  await ctx.addInitScript(([hoje]) => {
    if (window !== window.top) return;
    if (localStorage.getItem("mtapp:seeded")) return;
    localStorage.setItem("mtapp:seeded", "1");
    localStorage.setItem("mtapp:perfil", JSON.stringify({ nome: "Raphael" }));
    function d(off) { const x = new Date(); x.setDate(x.getDate() + off); return x.toISOString().slice(0, 10); }
    localStorage.setItem("mtapp:alunos", JSON.stringify({
      alunos: [
        // paga tabela, faz coletiva, evolui nas avaliações
        { id: "a1", nome: "Rafa Silva", status: "ativo", checkins: [d(-1) + "T18:00", d(-3) + "T18:00"],
          contratos: [{ id: "c1", planoId: "pl1", status: "ativo", inicio: d(-200), valor: 150 }] },
        // desconto de R$ 30, só treino solto
        { id: "a2", nome: "Bianca Costa", status: "ativo", checkins: [d(-2) + "T09:00"],
          contratos: [{ id: "c2", planoId: "pl1", status: "ativo", inicio: d(-100), valor: 120 }] },
        // cancelado, só treino solto (churn do grupo solto)
        { id: "a3", nome: "Carlos Saiu", status: "ativo", checkins: [],
          contratos: [{ id: "c3", planoId: "pl1", status: "cancelado", inicio: d(-300), canceladoEm: d(-30), valor: 150 }] },
        // ativo, faz coletiva
        { id: "a4", nome: "Mariana Alves", status: "ativo", checkins: [d(-5) + "T07:00"],
          contratos: [{ id: "c4", planoId: "pl1", status: "ativo", inicio: d(-150), valor: 150 }] },
      ],
      planos: [{ id: "pl1", nome: "Livre", valor: 150, meses: 12 }],
      recebiveis: [
        { id: "r1", alunoId: "a1", valor: 150, status: "pago", pagoEm: hoje, vencimento: hoje, competencia: hoje.slice(0, 7) },
        { id: "r2", alunoId: "a2", valor: 120, status: "aberto", vencimento: d(-10) },
      ],
    }));
    localStorage.setItem("mtapp:grade", JSON.stringify({
      aulas: [{ id: "g1", nome: "CROSS", prof: "Bia", vagas: 10, inicio: "18:00", dur: 60, dias: [1, 3, 5], fixos: ["Mariana Alves"] }],
      avulsas: [],
      presencas: (function () { const p = {}; p["g1|" + d(-3)] = ["Rafa Silva"]; p["g1|" + d(-10)] = ["Rafa Silva"]; return p; })(),
      faltas: (function () { const f = {}; f["Bianca Costa"] = [d(-4), d(-11), d(-18)]; f["Rafa Silva"] = [d(-6)]; return f; })(),
      config: {},
    }));
    localStorage.setItem("mtapp:equipe", JSON.stringify({
      cargos: [], colaboradores: [
        { id: "co1", nome: "Bia", cargo: "Recepção", ativo: true },
        { id: "co2", nome: "Léo", cargo: "Professor(a)", ativo: true },
      ],
      escala: { co1: { 0: "", 1: "06-14", 2: "06-14", 3: "06-14", 4: "06-14", 5: "06-14", 6: "08-12" },
                co2: { 1: "14-22", 3: "14-22", 5: "14-22" } },
      ponto: [],
    }));
    localStorage.setItem("mtapp:saude", JSON.stringify({
      avaliacoes: [
        { id: "v1", alunoId: "a1", data: d(-120), peso: 90, gordura: 25 },
        { id: "v2", alunoId: "a1", data: d(-10), peso: 84, gordura: 19.5 },
        { id: "v3", alunoId: "a2", data: d(-90), peso: 60, gordura: 30 },
        { id: "v4", alunoId: "a2", data: d(-5), peso: 62, gordura: 31 },
      ], evolucoes: [],
    }));
    localStorage.setItem("mtapp:wellhub", JSON.stringify({
      checkins: [
        { id: "w1", alunoId: "x1", nome: "Visitante GP", agregador: "Wellhub", quando: d(-3) + "T10:00" },
        { id: "w2", alunoId: "x1", nome: "Visitante GP", agregador: "Wellhub", quando: d(-8) + "T10:00" },
        { id: "w3", alunoId: "x2", nome: "Visitante TP", agregador: "TotalPass", quando: d(-4) + "T11:00" },
      ], config: {},
    }));
    localStorage.setItem("mtapp:metasNegocio", JSON.stringify({ faturamento: 20000, novos: 10, churnMax: 3 }));
  }, [hoje]);

  const erros = [];

  // ---------- 1) vazamento de preço ----------
  console.log("Vazamento de preço:");
  let p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  await p.goto(BASE + "/apps/relatorio-anual.html");
  await p.waitForFunction(() => window.__relAnual);
  const vaza = await p.evaluate(() => document.getElementById("tabVaza").textContent);
  ok(/Bianca Costa/.test(vaza), "Bianca (paga 120 de 150) aparece");
  ok(!/Rafa Silva/.test(vaza), "Rafa (paga tabela) não aparece");
  ok(/30/.test(vaza) && /360/.test(vaza), "desconto R$ 30/mês = R$ 360/ano no total");
  await p.close();

  // ---------- 2) retenção por atividade ----------
  console.log("Retenção por atividade:");
  p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  await p.goto(BASE + "/apps/crescimento.html");
  await p.waitForFunction(() => window.__retAtividade);
  const ret = await p.evaluate(() => document.getElementById("retAtividade").textContent);
  ok(/coletivas/.test(ret) && /treino solto/.test(ret), "dois grupos renderizam");
  ok(/churn 0,0%/.test(ret), "grupo coletiva com churn 0% (Rafa e Mariana ativos)");
  ok(/50,0%/.test(ret), "grupo solto com churn 50% (Carlos cancelou)");
  await p.close();

  // ---------- 3) no-show + pico×escala ----------
  console.log("No-show e pico × escala:");
  p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  await p.goto(BASE + "/apps/ocupacao.html");
  await p.waitForFunction(() => window.__ocupacao);
  const ns = await p.evaluate(() => document.getElementById("noshow").textContent);
  ok(/Taxa de no-show/.test(ns) && /Bianca Costa/.test(ns), "taxa + faltona Bianca listada");
  ok(/recorrente/.test(ns), "3+ faltas marca recorrente");
  const pe = await p.evaluate(() => document.getElementById("picoEscala").textContent);
  ok(/Seg/.test(pe) && /pessoa\(s\)/.test(pe), "tabela pico × escala renderiza");
  await p.close();

  // ---------- 4) resultados dos alunos ----------
  console.log("Resultados dos alunos:");
  p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  await p.goto(BASE + "/apps/saude.html");
  await p.waitForFunction(() => window.__resultados);
  const res = await p.evaluate(() => document.getElementById("resultados").textContent);
  ok(/1 de 2/.test(res) && /50%/.test(res), "1 de 2 alunos evoluiu (50%)");
  ok(/Rafa/.test(res) && /-5,5/.test(res.replace("−", "-")), "Rafa com -5,5 pt de gordura no topo");
  await p.close();

  // ---------- 5) agregadores ----------
  console.log("Agregadores × próprios:");
  p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  await p.goto(BASE + "/apps/wellhub.html");
  await p.waitForFunction(() => window.__aggComparativo);
  const agg = await p.evaluate(() => document.getElementById("aggComparativo").textContent);
  ok(/Alunos próprios/.test(agg) && /Wellhub/.test(agg) && /TotalPass/.test(agg), "três origens listadas");
  ok(/PESSOAS ÚNICAS/.test(agg), "coluna de pessoas únicas");
  await p.close();

  // ---------- 6) tendência de risco ----------
  console.log("Tendência de risco (Copiloto):");
  p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  await p.goto(BASE + "/apps/copiloto.html");
  await p.waitForFunction(() => window.__copiloto && window.__copiloto.renderTendencia);
  const snap = await p.evaluate(() => JSON.parse(localStorage.getItem("mtapp:riscoHist")));
  ok(snap && snap.snapshots.length === 1, "snapshot da semana salvo sozinho");
  // injeta uma semana anterior e re-renderiza para ver a curva
  const tend = await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:riscoHist"));
    const antes = new Date(); antes.setDate(antes.getDate() - 7);
    const seg = new Date(antes); seg.setDate(seg.getDate() - ((seg.getDay() + 6) % 7));
    st.snapshots.unshift({ semana: seg.toISOString().slice(0, 10), alto: 0, medio: 1, total: 1 });
    localStorage.setItem("mtapp:riscoHist", JSON.stringify(st));
    window.__copiloto.renderTendencia();
    return document.getElementById("tendencia").textContent;
  });
  ok(/Risco alto/.test(tend), "curva com leitura de tendência renderiza");
  await p.close();

  // ---------- 7) painel do dono ----------
  console.log("Painel do Dono (TV):");
  p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  await p.goto(BASE + "/apps/tv.html?painel=dono");
  await p.waitForTimeout(600);
  const tv = await p.evaluate(() => document.body.textContent);
  ok(/Painel do Dono/.test(tv) && /MRR/.test(tv), "painel do dono com MRR");
  ok(/RECEITA DO MÊS/.test(tv) && /meta/.test(tv), "receita com meta e projeção");
  ok(/NOVOS × CANCELADOS/.test(tv), "novos × cancelados presente");
  // não entra na rotação padrão
  const p2 = await ctx.newPage();
  await p2.goto(BASE + "/apps/tv.html");
  await p2.waitForTimeout(500);
  const titulo = await p2.evaluate(() => document.getElementById("titulo").textContent);
  ok(!/Painel do Dono/.test(titulo), "sem ?painel=dono o painel não abre por padrão");
  await p2.close();
  await p.close();

  ok(erros.length === 0, "nenhuma página com erro de JS" + (erros.length ? " — " + erros[0] : ""));

  await b.close();
  console.log(falhas ? "\n💥 " + falhas + " FALHA(S)" : "\n🏁 TUDO PASSOU");
  process.exit(falhas ? 1 : 0);
})();
