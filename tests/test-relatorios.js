// Rodada de relatórios: anual/forecast/planos, canais, engajamento, aging, ABC, CSV e resumo semanal
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
  const mesAtual = hoje.slice(0, 7);
  const ano = hoje.slice(0, 4);
  await ctx.addInitScript(([hoje, mesAtual]) => {
    if (window !== window.top) return;
    if (localStorage.getItem("mtapp:seeded")) return;
    localStorage.setItem("mtapp:seeded", "1");
    localStorage.setItem("mtapp:perfil", JSON.stringify({ nome: "Raphael" }));
    const d = (off) => { const x = new Date(); x.setDate(x.getDate() + off); return x.toISOString().slice(0, 10); };
    localStorage.setItem("mtapp:alunos", JSON.stringify({
      alunos: [
        { id: "a1", nome: "Rafa Silva", status: "ativo", checkins: [d(-1) + "T18:00", d(-3) + "T18:00", d(-5) + "T18:00", d(-8) + "T18:00", d(-10) + "T18:00", d(-12) + "T18:00", d(-15) + "T18:00", d(-17) + "T18:00", d(-19) + "T18:00", d(-22) + "T18:00", d(-24) + "T18:00", d(-26) + "T18:00"],
          contratos: [{ id: "c1", planoId: "pl1", status: "ativo", inicio: d(-90), valor: 150 }] },
        { id: "a2", nome: "Bianca Costa", status: "ativo", checkins: [d(-2) + "T09:00", d(-9) + "T09:00", d(-16) + "T09:00", d(-23) + "T09:00"],
          contratos: [{ id: "c2", planoId: "pl1", status: "ativo", inicio: d(-30), valor: 150 }] },
        { id: "a3", nome: "Carlos Parado", status: "ativo", checkins: [],
          contratos: [{ id: "c3", planoId: "pl2", status: "ativo", inicio: d(-60), valor: 99 }] },
        { id: "a4", nome: "Ex Aluno", status: "ativo", checkins: [],
          contratos: [{ id: "c4", planoId: "pl2", status: "cancelado", inicio: d(-200), canceladoEm: d(-20), valor: 99 }] },
      ],
      planos: [
        { id: "pl1", nome: "Livre", valor: 150, meses: 12 },
        { id: "pl2", nome: "Manhã", valor: 99, meses: 1 },
      ],
      recebiveis: [
        { id: "r1", alunoId: "a1", valor: 150, status: "pago", pagoEm: d(-2), vencimento: d(-2), competencia: mesAtual },
        { id: "r2", alunoId: "a2", valor: 150, status: "pago", pagoEm: d(-10), vencimento: d(-10), competencia: mesAtual },
        { id: "r3", alunoId: "a3", valor: 99, status: "aberto", vencimento: d(-10) },
        { id: "r4", alunoId: "a3", valor: 99, status: "aberto", vencimento: d(-45) },
        { id: "r5", alunoId: "a4", valor: 99, status: "aberto", vencimento: d(-100) },
      ],
    }));
    localStorage.setItem("mtapp:funil", JSON.stringify({ leads: [
      { id: "l1", nome: "Lead IG 1", etapa: "novo", origem: "Instagram", criado: d(-10) },
      { id: "l2", nome: "Lead IG 2", etapa: "contato", origem: "Instagram", criado: d(-12), status: "matriculado", matriculouEm: d(-5) },
      { id: "l3", nome: "Lead Ind", etapa: "novo", origem: "🤝 Indicação de Rafa Silva", criado: d(-8), status: "matriculado", matriculouEm: d(-2) },
    ] }));
    localStorage.setItem("mtapp:produtos", JSON.stringify({
      itens: [], vendas: [
        { id: "v1", data: d(-5), hora: "10:00", itens: [{ produtoId: "p1", nome: "Whey", qtd: 3, preco: 120 }], total: 360, forma: "pix" },
        { id: "v2", data: d(-15), hora: "10:00", itens: [{ produtoId: "p2", nome: "Água", qtd: 10, preco: 4 }], total: 40, forma: "dinheiro" },
      ],
    }));
    localStorage.setItem("mtapp:automacao", JSON.stringify({
      templates: [], regras: [], historico: {},
      resumoDono: { zap: "31999990000", ativo: false, semanal: true },
      integracoes: { demo: true },
    }));
  }, [hoje, mesAtual]);

  const erros = [];

  // ---------- 1) Relatório anual ----------
  console.log("Relatório Anual e Futuro:");
  let p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  await p.goto(BASE + "/apps/relatorio-anual.html");
  await p.waitForFunction(() => window.__relAnual);
  const tabAno = await p.evaluate(() => document.getElementById("tabAno").textContent);
  ok(/TOTAL/.test(tabAno) && /🏆/.test(tabAno), "tabela anual com total e melhor mês");
  const dados = await p.evaluate((mes) => window.__relAnual.dadosDoAno(+mes.slice(0, 4)).find((l) => l.mes === mes), mesAtual);
  ok(dados && dados.receita === 700, "receita do mês = R$ 700 (300 mensalidades + 400 produtos)");
  const tabFut = await p.evaluate(() => document.getElementById("tabFuturo").textContent);
  ok(/Garantida/.test(tabFut) && /Vencendo/.test(tabFut), "forecast com garantida × vencendo");
  ok(/R\$\s?300/.test(tabFut.replace(/ /g, " ")) || /300/.test(tabFut), "receita garantida inclui os 2 contratos Livre (R$ 300)");
  const tabPl = await p.evaluate(() => document.getElementById("tabPlanos").textContent);
  ok(/Livre/.test(tabPl) && /Manhã/.test(tabPl), "desempenho por plano lista os 2 planos");
  // CSV dispara download
  const dl = p.waitForEvent("download", { timeout: 5000 }).catch(() => null);
  await p.click("#btnCSV");
  const arquivo = await dl;
  ok(!!arquivo && /relatorio-anual/.test(arquivo.suggestedFilename()), "exportar CSV baixa o arquivo");
  await p.close();

  // ---------- 2) Canais no funil ----------
  console.log("Canais de aquisição (Funil):");
  p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  await p.goto(BASE + "/apps/funil.html");
  await p.waitForFunction(() => window.__canais);
  const canais = await p.evaluate(() => document.getElementById("canais").textContent);
  ok(/Instagram/.test(canais) && /Indicação de Rafa/.test(canais), "canais listam Instagram e indicação");
  ok(/50%/.test(canais) && /100%/.test(canais), "conversão calculada (IG 1/2=50%, indicação 1/1=100%)");
  await p.close();

  // ---------- 3) Engajamento ----------
  console.log("Engajamento (Ocupação):");
  p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  await p.goto(BASE + "/apps/ocupacao.html");
  await p.waitForFunction(() => window.__ocupacao);
  const eng = await p.evaluate(() => document.getElementById("engajamento").textContent);
  ok(/3\+ treinos/.test(eng) && /Parados/.test(eng), "faixas de engajamento renderizam");
  ok(/Carlos Parado/.test(eng), "aluno parado aparece nominalmente");
  await p.close();

  // ---------- 4) Aging ----------
  console.log("Aging (Inadimplência):");
  p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  await p.goto(BASE + "/apps/inadimplencia.html");
  await p.waitForFunction(() => window.__aging);
  const aging = await p.evaluate(() => document.getElementById("aging").textContent);
  ok(/1–29/.test(aging) && /30–59/.test(aging) && /90\+/.test(aging), "faixas 1–29/30–59/90+ presentes");
  ok(/TOTAL EM ABERTO/.test(aging) && /297/.test(aging), "total em aberto soma R$ 297 (99×3)");
  await p.close();

  // ---------- 5) Curva ABC ----------
  console.log("Curva ABC (Produtos):");
  p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  await p.goto(BASE + "/apps/produtos.html");
  await p.waitForFunction(() => window.__abc);
  const abc = await p.evaluate(() => document.getElementById("abcBox").textContent);
  ok(/Whey/.test(abc) && /Água/.test(abc), "produtos listados");
  ok(abc.indexOf("Whey") < abc.indexOf("Água"), "Whey (R$360) vem antes — classe A");
  ok(/RECEITA TOTAL/.test(abc) && /400/.test(abc), "receita total 90d = R$ 400");
  await p.close();

  // ---------- 6) Resumo semanal ----------
  console.log("Fechamento semanal do dono:");
  p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  await p.goto(BASE + "/apps/automacao.html");
  await p.waitForFunction(() => window.__resumoSemanal);
  const chk = await p.evaluate(() => document.getElementById("resumoSemAtivo").checked);
  ok(chk, "toggle semanal carrega marcado da config");
  const texto = await p.evaluate(() => window.__resumoSemanal.monta());
  ok(/fechamento da semana/.test(texto) && /Receita/.test(texto) && /vs semana anterior/.test(texto), "texto semanal com comparativo");
  ok(/Check-ins/.test(texto) && /Cancelamentos/.test(texto), "texto traz check-ins e cancelamentos");
  await p.close();

  ok(erros.length === 0, "nenhuma página com erro de JS" + (erros.length ? " — " + erros[0] : ""));

  await b.close();
  console.log(falhas ? "\n💥 " + falhas + " FALHA(S)" : "\n🏁 TUDO PASSOU");
  process.exit(falhas ? 1 : 0);
})();
