// Horista × mensalista: etiquetas, folha separada, ficha e lançamento em Contas a Pagar
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
  // datas determinísticas do mês corrente: uma segunda-feira comum, o 1º domingo e um feriado municipal
  const FIXOS = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"];
  function isoOf(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  const base = new Date(); base.setDate(1); base.setHours(12, 0, 0, 0);
  let segunda = null, domingo = null;
  for (let i = 0; i < 14 && (!segunda || !domingo); i++) {
    const d = new Date(base); d.setDate(1 + i);
    const iso = isoOf(d);
    if (!domingo && d.getDay() === 0) domingo = iso;
    if (!segunda && d.getDay() === 1 && FIXOS.indexOf(iso.slice(5)) === -1) segunda = iso;
  }
  // feriado municipal: um dia útil ≥ 20 que não seja domingo (marcado como extra, vale mesmo se coincidir com nacional)
  let feriadoExtra = null;
  for (let i = 20; i <= 27; i++) {
    const d = new Date(base); d.setDate(i);
    if (d.getDay() !== 0 && isoOf(d) !== segunda) { feriadoExtra = isoOf(d); break; }
  }
  await ctx.addInitScript(([hoje, segunda, domingo, feriadoExtra]) => {
    if (window !== window.top) return;
    if (localStorage.getItem("mtapp:seeded")) return;
    localStorage.setItem("mtapp:seeded", "1");
    localStorage.setItem("mtapp:perfil", JSON.stringify({ nome: "Raphael" }));
    localStorage.setItem("mtapp:equipe", JSON.stringify({
      cargos: ["Recepção", "Professor(a)"],
      colaboradores: [
        { id: "co1", nome: "Bia Mensal", cargo: "Recepção", ativo: true, tipoContrato: "CLT", salario: 2400 },
        { id: "co2", nome: "Carlos Hora", cargo: "Professor(a)", ativo: true, tipoContrato: "Horista", valorHora: 50, valorHoraDF: 80 },
      ],
      escala: {},
      // Carlos: 4h na segunda comum (×50 = 200) + 3h no domingo + 2h no feriado municipal (5h ×80 = 400) → total 600
      ponto: [
        { nome: "Carlos Hora", tipo: "entrada", quando: segunda + "T08:00" },
        { nome: "Carlos Hora", tipo: "saida", quando: segunda + "T12:00" },
        { nome: "Carlos Hora", tipo: "entrada", quando: domingo + "T08:00" },
        { nome: "Carlos Hora", tipo: "saida", quando: domingo + "T11:00" },
        { nome: "Carlos Hora", tipo: "entrada", quando: feriadoExtra + "T08:00" },
        { nome: "Carlos Hora", tipo: "saida", quando: feriadoExtra + "T10:00" },
      ],
    }));
    localStorage.setItem("mtapp:feriados", JSON.stringify({ datas: [feriadoExtra] }));
  }, [hoje, segunda, domingo, feriadoExtra]);

  const erros = [];

  // ---------- 1) lista com etiquetas ----------
  console.log("Colaboradores (lista):");
  let p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  await p.goto(BASE + "/apps/equipe.html");
  await p.waitForSelector(".colab");
  const lista = await p.evaluate(() => document.getElementById("lista").textContent);
  ok(/HORISTA/.test(lista), "Carlos aparece com etiqueta ⏱ HORISTA");
  ok(/SALÁRIO FIXO/.test(lista), "Bia aparece com etiqueta 💼 SALÁRIO FIXO");

  // ---------- 2) folha separada ----------
  console.log("Relatório 💰 Salários:");
  await p.click("#cardSalarios summary");
  const folha = await p.evaluate(() => document.getElementById("salarios").textContent);
  ok(/Salário fixo \(mensalistas\)/.test(folha) && /Horistas e diaristas/.test(folha), "duas seções separadas");
  ok(/Bia Mensal/.test(folha) && folha.indexOf("Bia Mensal") < folha.indexOf("Horistas"), "Bia na seção de mensalistas");
  ok(/4h/.test(folha), "horas normais do Carlos = 4h");
  ok(/5h/.test(folha), "horas dom/feriado do Carlos = 5h (domingo 3h + feriado municipal 2h)");
  ok(/R\$\s?80/.test(folha), "valor hora dom/feriado (R$ 80) aparece");
  ok(/R\$\s?600/.test(folha), "a pagar do Carlos = R$ 600 (4h×50 + 5h×80)");
  ok(/2\.400/.test(folha), "folha fixa soma o salário da Bia");
  ok(/FOLHA TOTAL DO MÊS/.test(folha) && /3\.000/.test(folha), "total geral = fixa + horistas (R$ 3.000)");
  ok(/Feriados extras/.test(folha), "editor de feriados extras presente");

  // ---------- 3) cadastro rápido tem vínculo ----------
  await p.click("#btnNovo");
  await p.selectOption("#fTipo", "Horista");
  const nota = await p.evaluate(() => document.getElementById("fTipoNota").textContent);
  ok(/Sem salário fixo/.test(nota), "nota do vínculo avisa que horista não tem salário fixo");
  await p.close();

  // ---------- 4) ficha: campo de salário trava para horista ----------
  console.log("Ficha (aba Contratação):");
  p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  await p.goto(BASE + "/apps/colaborador.html?id=co2");
  await p.waitForSelector('[data-ab="contratacao"]');
  await p.click('[data-ab="contratacao"]');
  await p.waitForSelector("#cTipo");
  const salDisabled = await p.evaluate(() => document.getElementById("cSalario").disabled);
  ok(salDisabled, "campo Salário mensal desabilitado para horista");
  const hint = await p.evaluate(() => document.getElementById("hintVinculo").textContent);
  ok(/HORISTA/.test(hint) && /valor hora/i.test(hint), "aviso explica o pagamento por hora");
  const btnTxt = await p.evaluate(() => document.getElementById("btnFolha").textContent);
  ok(/horas do mês/i.test(btnTxt), "botão vira 'Lançar horas do mês'");

  // lançamento em contas: 8h × 50 = 400
  p.on("dialog", (d) => d.accept());
  await p.click("#btnFolha");
  await p.waitForTimeout(300);
  const conta = await p.evaluate(() => {
    const c = JSON.parse(localStorage.getItem("mtapp:contas") || "{}");
    return (c.contas || [])[0] || null;
  });
  ok(conta && conta.valor === 600 && /Horas/.test(conta.desc) && /dom\/fer/.test(conta.desc), "lançou R$ 600 (com dom/fer na descrição) em Contas a Pagar");

  // mensalista continua com salário habilitado
  await p.goto(BASE + "/apps/colaborador.html?id=co1");
  await p.click('[data-ab="contratacao"]');
  await p.waitForSelector("#cTipo");
  const salLivre = await p.evaluate(() => !document.getElementById("cSalario").disabled);
  ok(salLivre, "campo Salário mensal segue habilitado para CLT");
  await p.close();

  ok(erros.length === 0, "nenhuma página com erro de JS" + (erros.length ? " — " + erros[0] : ""));

  await b.close();
  console.log(falhas ? "\n💥 " + falhas + " FALHA(S)" : "\n🏁 TUDO PASSOU");
  process.exit(falhas ? 1 : 0);
})();
