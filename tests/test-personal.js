// Migração pós-cancelamento (wellhub) + TORQUESYS Personal (produto para personal trainers)
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
    function d(off) { const x = new Date(); x.setDate(x.getDate() + off); return x.toISOString().slice(0, 10); }
    localStorage.setItem("mtapp:alunos", JSON.stringify({
      alunos: [
        // cancelou há 60 dias e virou Wellhub (3 visitas depois)
        { id: "a1", nome: "Carlos Migrado", status: "ativo", checkins: [],
          contratos: [{ id: "c1", planoId: "pl1", status: "cancelado", inicio: d(-300), canceladoEm: d(-60), valor: 150 }] },
        // cancelou mas NÃO voltou por agregador
        { id: "a2", nome: "Julia Sumiu", status: "ativo", checkins: [],
          contratos: [{ id: "c2", planoId: "pl1", status: "cancelado", inicio: d(-200), canceladoEm: d(-40), valor: 150 }] },
        // ativo com check-in de agregador (NÃO deve aparecer — ainda é aluno)
        { id: "a3", nome: "Rafa Ativo", status: "ativo", checkins: [],
          contratos: [{ id: "c3", planoId: "pl1", status: "ativo", inicio: d(-100), valor: 150 }] },
      ],
      planos: [{ id: "pl1", nome: "Livre", valor: 150, meses: 12 }],
      recebiveis: [],
    }));
    localStorage.setItem("mtapp:wellhub", JSON.stringify({
      checkins: [
        { id: "w1", alunoId: "a1", nome: "Carlos Migrado", agregador: "Wellhub", quando: d(-30) + "T10:00" },
        { id: "w2", alunoId: "a1", nome: "Carlos Migrado", agregador: "Wellhub", quando: d(-15) + "T10:00" },
        { id: "w3", alunoId: "a1", nome: "Carlos Migrado", agregador: "Wellhub", quando: d(-5) + "T10:00" },
        { id: "w4", alunoId: "a3", nome: "Rafa Ativo", agregador: "TotalPass", quando: d(-3) + "T11:00" },
        // check-in ANTES do cancelamento não conta como migração
        { id: "w5", alunoId: "a2", nome: "Julia Sumiu", agregador: "Wellhub", quando: d(-90) + "T09:00" },
      ], config: {},
    }));
  });

  const erros = [];

  // ---------- 1) migração pós-cancelamento ----------
  console.log("Migração para agregador:");
  let p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  await p.goto(BASE + "/apps/wellhub.html");
  await p.waitForFunction(() => window.__migracao);
  const mig = await p.evaluate(() => document.getElementById("migracao").textContent);
  ok(/Carlos Migrado/.test(mig), "Carlos (cancelou → Wellhub) aparece");
  ok(!/Julia Sumiu/.test(mig), "Julia (check-in só ANTES de cancelar) não aparece");
  ok(!/Rafa Ativo/.test(mig), "Rafa (ainda ativo) não aparece");
  ok(/1 ex-aluno/.test(mig), "contagem = 1 ex-aluno migrado");
  ok(/3/.test(mig) && /Wellhub/.test(mig), "3 visitas depois, agregador Wellhub");
  await p.close();

  // ---------- 2) TORQUESYS Personal ----------
  console.log("TORQUESYS Personal:");
  p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  p.on("dialog", (d) => d.accept());
  await p.goto(BASE + "/personal.html");
  await p.waitForFunction(() => window.__ptStudio);

  // aluno novo
  await p.fill("#aNome", "João Cliente");
  await p.fill("#aZap", "31999990000");
  await p.fill("#aValor", "400");
  await p.click("#aAdd");
  let lista = await p.evaluate(() => document.getElementById("listaAlunos").textContent);
  ok(/João Cliente/.test(lista) && /400/.test(lista), "aluno cadastrado com valor mensal");
  ok(/SEM PAGAMENTO NO MÊS/.test(lista), "etiqueta de pendência antes do pagamento");

  // agenda: sessão hoje + marcar feita
  await p.click('[data-a="agenda"]');
  await p.selectOption("#sAluno", { index: 1 });
  await p.fill("#sHora", "07:00");
  await p.click("#sAdd");
  let ses = await p.evaluate(() => document.getElementById("listaSessoes").textContent);
  ok(/João Cliente/.test(ses) && /07:00/.test(ses), "sessão agendada aparece");
  await p.click("[data-feita]");
  ses = await p.evaluate(() => document.getElementById("listaSessoes").textContent);
  ok(/FEITA/.test(ses), "sessão marcada como feita");

  // pagamento: registra e some da pendência
  await p.click('[data-a="pagamentos"]');
  let pend = await p.evaluate(() => document.getElementById("pendentes").textContent);
  ok(/João Cliente/.test(pend) && /Cobrar/.test(pend), "pendente com botão de cobrança WhatsApp");
  await p.selectOption("#pAluno", { index: 1 });
  await p.fill("#pValor", "400");
  await p.click("#pAdd");
  pend = await p.evaluate(() => document.getElementById("pendentes").textContent);
  ok(/em dia/.test(pend), "após pagar, pendências zeram");
  const hist = await p.evaluate(() => document.getElementById("listaPagamentos").textContent);
  ok(/João Cliente/.test(hist) && /400/.test(hist) && /Pix/.test(hist), "histórico registra o pagamento");

  // kpis refletem
  const kpis = await p.evaluate(() => document.getElementById("kpis").textContent);
  ok(/1/.test(kpis) && /400/.test(kpis), "KPIs: 1 aluno ativo e R$ 400 no mês");

  // treinos: salva e monta link de WhatsApp
  await p.click('[data-a="treinos"]');
  await p.selectOption("#tAluno", { index: 1 });
  await p.fill("#tTexto", "A — Peito\nSupino 4x10");
  await p.waitForTimeout(900);
  const salvo = await p.evaluate(() => JSON.parse(localStorage.getItem("mtapp:ptStudio")));
  const idAluno = salvo.alunos[0].id;
  ok(salvo.treinos[idAluno] && /Supino 4x10/.test(salvo.treinos[idAluno]), "treino salvo sozinho na loja ptStudio");

  // aluno "Encerrar" some da lista
  await p.click('[data-a="alunos"]');
  await p.click("[data-rm]");
  lista = await p.evaluate(() => document.getElementById("listaAlunos").textContent);
  ok(/primeiro aluno/.test(lista), "encerrar aluno esvazia a lista (histórico preservado)");
  const guardado = await p.evaluate(() => JSON.parse(localStorage.getItem("mtapp:ptStudio")).alunos.length);
  ok(guardado === 1, "aluno encerrado continua guardado (ativo=false)");
  await p.close();

  ok(erros.length === 0, "nenhuma página com erro de JS" + (erros.length ? " — " + erros[0] : ""));

  await b.close();
  console.log(falhas ? "\n💥 " + falhas + " FALHA(S)" : "\n🏁 TUDO PASSOU");
  process.exit(falhas ? 1 : 0);
})();
