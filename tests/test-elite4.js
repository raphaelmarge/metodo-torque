// Rodada elite 4: ocupação, metas do negócio, indicação, videoteca, PRs, faixa horária no totem, TV destaques
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
  await ctx.addInitScript(([hoje, mesAtual]) => {
    if (window !== window.top) return;
    if (localStorage.getItem("mtapp:seeded")) return;
    localStorage.setItem("mtapp:seeded", "1");
    localStorage.setItem("mtapp:perfil", JSON.stringify({ nome: "Raphael" }));
    // alunos: checkins recentes p/ heatmap, contratos p/ metas, plano com faixa de horário
    const checks = [];
    for (let i = 0; i < 10; i++) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(18, 30, 0, 0);
      checks.push(d.toISOString().slice(0, 16));
    }
    localStorage.setItem("mtapp:alunos", JSON.stringify({
      alunos: [
        { id: "al-um", nome: "Rafa Silva", status: "ativo", appToken: "tok-rafa", checkins: checks,
          contratos: [{ id: "c1", planoId: "pl1", status: "ativo", inicio: mesAtual + "-01" }] },
        { id: "al-dois", nome: "Bianca Costa", status: "ativo", checkins: checks.slice(0, 4),
          contratos: [{ id: "c2", planoId: "pl2", status: "ativo", inicio: "2026-01-10" }] },
      ],
      planos: [
        { id: "pl1", nome: "Livre", valor: 150, meses: 12 },
        { id: "pl2", nome: "Manhã", valor: 99, meses: 12, regras: { horaDe: "06:00", horaAte: "06:05" } },
      ],
      recebiveis: [
        { id: "r1", alunoId: "al-um", valor: 150, status: "pago", pagoEm: hoje, vencimento: hoje, competencia: mesAtual },
      ],
    }));
    localStorage.setItem("mtapp:grade", JSON.stringify({
      aulas: [
        { id: "g1", nome: "CROSS TORQUE", prof: "Bia", vagas: 10, inicio: "18:00", dur: 60, dias: [0, 1, 2, 3, 4, 5, 6], fixos: ["Carlos Lima"] },
      ],
      avulsas: [],
      presencas: (function () { const p = {}; p["g1|" + hoje] = ["Rafa Silva", "Bianca Costa"]; return p; })(),
      faltas: {}, config: {},
    }));
    localStorage.setItem("mtapp:metasNegocio", JSON.stringify({ faturamento: 10000, novos: 20, churnMax: 3 }));
    localStorage.setItem("mtapp:indicacoes", JSON.stringify({ itens: [
      { id: "i1", quando: hoje, leadNome: "Novo Amigo", codigo: "ALUM", alunoId: "al-um", alunoNome: "Rafa Silva", recompensado: false },
    ] }));
    localStorage.setItem("mtapp:videoteca", JSON.stringify({ videos: [
      { id: "v1", titulo: "Mobilidade de quadril", categoria: "Mobilidade", url: "https://youtube.com/watch?v=x" },
    ] }));
    localStorage.setItem("mtapp:treinoDestaques", JSON.stringify({ itens: [
      { nome: "Rafa Silva", exercicio: "Agachamento", kg: 120, dia: hoje },
    ] }));
  }, [hoje, mesAtual]);

  // ---------- 1) Ocupação e Horários ----------
  console.log("Ocupação e Horários:");
  let p = await ctx.newPage();
  const erros = [];
  p.on("pageerror", (e) => erros.push(String(e)));
  await p.goto(BASE + "/apps/ocupacao.html");
  await p.waitForFunction(() => window.__ocupacao);
  const mapa = await p.evaluate(() => document.getElementById("mapa").querySelectorAll("td").length);
  ok(mapa > 0, "mapa de calor renderiza células");
  const ocupTxt = await p.evaluate(() => document.getElementById("ocupacao").textContent);
  ok(/CROSS TORQUE/.test(ocupTxt) && /%/.test(ocupTxt), "taxa de ocupação por aula com %");
  const profTxt = await p.evaluate(() => document.getElementById("profs").textContent);
  ok(/Bia/.test(profTxt), "desempenho por professor lista a Bia");
  await p.close();

  // ---------- 2) Metas do negócio no Gerencial ----------
  console.log("Metas do negócio (Gerencial):");
  p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  await p.goto(BASE + "/apps/gerencial.html");
  await p.waitForFunction(() => window.__metasNegocio);
  await p.evaluate(() => window.__metasNegocio());
  const mt = await p.evaluate(() => document.getElementById("mtPainel").textContent);
  ok(/projeção/.test(mt), "painel mostra projeção run-rate");
  ok(/MRR/.test(mt), "painel mostra MRR");
  ok(/LTV/.test(mt), "painel mostra LTV");
  ok(/Ticket médio/.test(mt), "painel mostra ticket médio");
  const metaFat = await p.evaluate(() => document.getElementById("mtFat").value);
  ok(metaFat === "10000", "metas salvas aparecem nos campos");
  await p.close();

  // ---------- 3) Indicações no Funil ----------
  console.log("Indicações (Funil):");
  p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  await p.goto(BASE + "/apps/funil.html");
  await p.waitForFunction(() => window.__indicacoes);
  const indTxt = await p.evaluate(() => document.getElementById("indicacoes").textContent);
  ok(/Novo Amigo/.test(indTxt) && /Rafa Silva/.test(indTxt), "card lista indicação com aluno indicador");
  ok(/Quem mais indica/.test(indTxt), "ranking de quem mais indica");
  await p.click("[data-recompensa]");
  const indTxt2 = await p.evaluate(() => document.getElementById("indicacoes").textContent);
  ok(/recompensado/.test(indTxt2), "marcar recompensa funciona");
  await p.close();

  // ---------- 4) Matrícula online com ?ind= ----------
  console.log("Matrícula online com indicação:");
  p = await ctx.newPage();
  let corpoEnviado = null;
  await p.route("**/rest/v1/rpc/matricula_info", (r) => r.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ planos: [{ nome: "Livre", valor: 150 }], nome: "TORQUE FIT", pix: "", zap: "" }),
  }));
  await p.route("**/rest/v1/rpc/matricula_nova", (r) => {
    corpoEnviado = JSON.parse(r.request().postData() || "{}");
    r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  await p.goto(BASE + "/matricula.html?ind=ABCD1234");
  await p.waitForSelector("#form:not([hidden])");
  const nota = await p.evaluate(() => document.body.textContent.includes("indicação de um amigo"));
  ok(nota, "página mostra aviso de indicação");
  await p.click(".plano");
  await p.fill("#fNome", "Amigo Indicado");
  await p.fill("#fZap", "31999990000");
  await p.click("#btnEnviar");
  await p.waitForSelector("#sucesso:not([hidden])");
  ok(corpoEnviado && corpoEnviado.p_indicacao === "ABCD1234", "rpc recebe p_indicacao com o código");
  await p.close();

  // ---------- 5) Videoteca no Treinos ----------
  console.log("Videoteca (Treinos):");
  p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  await p.goto(BASE + "/apps/treinos.html");
  await p.waitForFunction(() => window.renderVideoteca);
  await p.click('[data-a="videoteca"]');
  let vt = await p.evaluate(() => document.getElementById("vtLista").textContent);
  ok(/Mobilidade de quadril/.test(vt), "vídeo semeado aparece na lista");
  await p.fill("#vtTitulo", "Alongamento pós-treino");
  await p.fill("#vtCategoria", "Alongamento");
  await p.fill("#vtUrl", "https://youtube.com/watch?v=y");
  await p.click("#vtAdd");
  vt = await p.evaluate(() => document.getElementById("vtLista").textContent);
  ok(/Alongamento pós-treino/.test(vt), "adicionar vídeo funciona");
  const nVids = await p.evaluate(() => JSON.parse(localStorage.getItem("mtapp:videoteca")).videos.length);
  ok(nVids === 2, "store videoteca tem 2 vídeos");
  await p.close();

  // ---------- 6) App do aluno: recordes, indicação, videoteca ----------
  console.log("App do aluno (gerador):");
  p = await ctx.newPage();
  await p.goto(BASE + "/apps/app-aluno.html");
  await p.waitForFunction(() => window.__appAluno);
  const html = await p.evaluate(() => {
    const a = JSON.parse(localStorage.getItem("mtapp:alunos")).alunos[0];
    a.appToken = "tok-rafa";
    return window.__appAluno.monta(a, new Date().toISOString());
  });
  ok(html.includes("dRecordes"), "app tem card 🏅 Meus recordes");
  ok(html.includes("celebraPR"), "app tem detecção de PR (celebraPR)");
  ok(html.includes("dIndique") && html.includes("matricula.html?ind="), "app tem card Indique um amigo com link");
  ok(html.includes("dVideos") && html.includes("Mobilidade de quadril"), "app tem Aulas gravadas com o vídeo");
  // o app gerado abre sem erro de JS
  const p2 = await ctx.newPage();
  const errosApp = [];
  p2.on("pageerror", (e) => errosApp.push(String(e)));
  await p2.setContent(html, { waitUntil: "domcontentloaded" });
  await p2.waitForTimeout(700);
  ok(errosApp.length === 0, "app gerado abre sem erros de JS" + (errosApp.length ? " — " + errosApp[0] : ""));
  await p2.close();
  await p.close();

  // ---------- 7) Totem respeita faixa de horário do plano ----------
  console.log("Totem × faixa de horário:");
  p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  await p.goto(BASE + "/apps/totem.html");
  await p.waitForFunction(() => window.__totem);
  const sit = await p.evaluate(() => {
    const a = JSON.parse(localStorage.getItem("mtapp:alunos")).alunos[1]; // plano Manhã 06:00–06:05
    return window.__totem.situacaoTotem(a);
  });
  ok(sit && sit.ok === false && /plano vale das|não dá acesso/.test(sit.motivo || ""), "aluno fora da janela do plano é barrado no totem");
  const sitOk = await p.evaluate(() => {
    const a = JSON.parse(localStorage.getItem("mtapp:alunos")).alunos[0]; // plano Livre
    return window.__totem.situacaoTotem(a);
  });
  ok(sitOk && sitOk.ok === true, "aluno de plano livre passa normal");
  await p.close();

  // ---------- 8) Modo TV: painel de destaques ----------
  console.log("Modo TV:");
  p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  await p.goto(BASE + "/apps/tv.html?painel=destaques");
  await p.waitForTimeout(600);
  const tvTxt = await p.evaluate(() => document.body.textContent);
  ok(/Destaques da semana/.test(tvTxt) && /Agachamento/.test(tvTxt) && /120 kg/.test(tvTxt), "painel 🏅 mostra o recorde do Rafa");
  await p.close();

  ok(erros.length === 0, "nenhuma página com erro de JS" + (erros.length ? " — " + erros[0] : ""));

  await b.close();
  console.log(falhas ? "\n💥 " + falhas + " FALHA(S)" : "\n🏁 TUDO PASSOU");
  process.exit(falhas ? 1 : 0);
})();
