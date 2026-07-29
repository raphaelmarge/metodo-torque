// Rodada elite 5: desafios, share card, retrospectiva, avaliação de aula, contrato, campanhas, templates, progressão
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
    localStorage.setItem("mtapp:ptSemConta", "1");
    localStorage.setItem("mtapp:ntSemConta", "1");
    localStorage.setItem("mtapp:config", JSON.stringify({ dados: { nome: "TORQUE FIT" } }));
    const d = (off) => { const x = new Date(); x.setDate(x.getDate() + off); return x.toISOString(); };
    // 8 check-ins no mês (desafio meta 12 → 67%) e 30+ no ano (retrospectiva)
    const cks = [];
    for (let i = 0; i < 8; i++) cks.push(mesAtual + "-" + String(1 + i).padStart(2, "0") + "T18:30:00");
    for (let i = 0; i < 25; i++) cks.push(hoje.slice(0, 4) + "-02-" + String(1 + (i % 25)).padStart(2, "0") + "T07:15:00");
    localStorage.setItem("mtapp:alunos", JSON.stringify({
      alunos: [
        { id: "a1", nome: "Rafa Silva", status: "ativo", zap: "31999990001", nasc: "1995-" + mesAtual.slice(5) + "-20", checkins: cks,
          contratos: [{ id: "c1", planoId: "pl1", status: "ativo", inicio: d(-350).slice(0, 10), meses: 12, valor: 150, diaVenc: 10 }] },
        { id: "a2", nome: "Bianca Sumida", status: "ativo", zap: "31999990002", nasc: "1990-01-15", checkins: [d(-45)],
          contratos: [{ id: "c2", planoId: "pl1", status: "ativo", inicio: d(-60).slice(0, 10), meses: 12, valor: 150, diaVenc: 5 }] },
        { id: "a3", nome: "Caio Gympass", status: "ativo", checkins: [d(-2)],
          contratos: [{ id: "c3", planoId: "pl2", status: "ativo", inicio: d(-30).slice(0, 10), meses: 12, valor: 0, diaVenc: 5 }] },
      ],
      planos: [{ id: "pl1", nome: "Livre", valor: 150, meses: 12 }, { id: "pl2", nome: "Gympass", valor: 0, tipo: "agregador" }],
      recebiveis: [{ id: "r1", alunoId: "a2", valor: 150, status: "aberto", vencimento: d(-10).slice(0, 10) }],
    }));
    localStorage.setItem("mtapp:desafios", JSON.stringify({ itens: [
      { id: "d1", titulo: "Desafio do Mês Insano", meta: 12, medalha: "🥇", mes: mesAtual },
    ] }));
  }, [hoje, mesAtual]);
  const erros = [];

  // ---------- 1) gestão do desafio ----------
  console.log("Desafio do mês (Crescimento):");
  let p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  await p.goto(BASE + "/apps/crescimento.html");
  await p.waitForFunction(() => window.__desafios);
  const dsf = await p.evaluate(() => document.getElementById("dsfLista").textContent);
  ok(/Desafio do Mês Insano/.test(dsf) && /NO AR/.test(dsf), "desafio lançado aparece como NO AR");
  await p.close();

  // ---------- 2) app do aluno: desafio pessoal, retrospectiva, card, avaliação ----------
  console.log("App do aluno (desafio + retro + card + avaliação):");
  p = await ctx.newPage();
  await p.goto(BASE + "/apps/app-aluno.html");
  await p.waitForFunction(() => window.__appAluno);
  const appHtml = await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:alunos"));
    st.alunos[0].appToken = "tok-elite5-teste";
    localStorage.setItem("mtapp:alunos", JSON.stringify(st));
    return window.__appAluno.monta(st.alunos[0], new Date().toISOString());
  });
  ok(/Meu desafio 🥇/.test(appHtml) && /Desafio do Mês Insano/.test(appHtml), "app tem o card do desafio pessoal");
  ok(/8<\/b> de 12 treinos SEUS/.test(appHtml) && /67%/.test(appHtml), "progresso individual 8/12 (67%)");
  ok(/btnCardDesafio/.test(appHtml) && /Gerar card pro Stories/.test(appHtml), "botão de card pro Stories no desafio");
  ok(/Minha retrospectiva/.test(appHtml) && /Treinos no ano/.test(appHtml), "retrospectiva do ano no Perfil");
  ok(/mês mais forte/.test(appHtml) || /Mês mais forte/.test(appHtml), "retrospectiva traz o mês mais forte");
  ok(/CARDD=/.test(appHtml) && /CARDR=/.test(appHtml) && /cardImg/.test(appHtml), "dados dos cards embutidos + gerador canvas");
  ok(/app_aluno_avalia/.test(appHtml) && /Como foi\?/.test(appHtml), "avaliação de aula (⭐) embutida no app");

  // abre o app e gera o card do desafio (canvas real)
  const pApp = await ctx.newPage();
  const errosApp = [];
  pApp.on("pageerror", (e) => errosApp.push(String(e)));
  await pApp.route("**/app-teste-elite5.html", (r) => r.fulfill({ contentType: "text/html", body: appHtml }));
  await pApp.route("**/rest/v1/rpc/**", (r) => r.fulfill({ contentType: "application/json", body: "[]" }));
  await pApp.goto(BASE + "/app-teste-elite5.html", { waitUntil: "domcontentloaded" });
  await pApp.waitForTimeout(400);
  const cardOk = await pApp.evaluate(() => new Promise((res) => {
    // intercepta o download do canvas
    const a = document.createElement; // noop
    window.__cardImg({ t: "Teste de card", l: ["10 treinos", "topo!"] });
    setTimeout(() => res(true), 600); // sem exception = canvas gerou
  }));
  ok(cardOk && errosApp.length === 0, "canvas do card gera sem erros");
  await pApp.close();
  await p.close();

  // ---------- 3) satisfação das aulas (relatório) ----------
  console.log("Satisfação das aulas (Ocupação):");
  p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  await p.goto(BASE + "/apps/ocupacao.html");
  await p.waitForFunction(() => window.__satisfacao);
  await p.waitForTimeout(1500);
  const sat = await p.evaluate(() => document.getElementById("satisfacao").textContent);
  ok(/Conecte sua conta|Rode o bloco/.test(sat), "sem nuvem o card explica o que falta (fallback honesto)");
  const sql = fs.readFileSync(__dirname + "/../supabase-setup.sql", "utf8");
  ok(/app_aval_aula/.test(sql) && /app_aluno_avalia/.test(sql), "SQL da avaliação de aulas presente");
  await p.close();

  // ---------- 4) contrato digital ----------
  console.log("Contrato digital (Gestão de Alunos):");
  p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  await p.goto(BASE + "/apps/alunos.html");
  await p.waitForFunction(() => window.__contrato);
  await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:alunos"));
    window.__contrato.abre(st.alunos[0], st.alunos[0].contratos[0]);
  });
  await p.waitForFunction(() => document.getElementById("dlgContrato").open);
  const ctr = await p.evaluate(() => document.getElementById("ctrTexto").textContent);
  ok(/Rafa Silva/.test(ctr) && /Livre/.test(ctr) && /150/.test(ctr), "contrato preenchido com nome, plano e valor");
  ok(/TORQUE FIT/.test(ctr), "nome da academia entra no contrato");
  await p.fill("#ctrNome", "Rafael da Silva Santos");
  await p.click("#ctrOk");
  await p.waitForTimeout(300);
  const aceite = await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:alunos"));
    return st.alunos[0].aceite;
  });
  ok(!!aceite && aceite.nome === "Rafael da Silva Santos" && aceite.em.length > 10, "aceite registrado com nome, data e hora");
  const aceiteBox = await p.evaluate(() => document.getElementById("ctrAceito").textContent);
  ok(/Aceito por Rafael da Silva Santos/.test(aceiteBox), "dialog mostra o registro do aceite");
  await p.close();

  // ---------- 5) campanhas segmentadas ----------
  console.log("Campanha relâmpago (Automação):");
  p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  await p.goto(BASE + "/apps/automacao.html");
  await p.waitForFunction(() => window.__campanha);
  const pubs = await p.evaluate(() => ({
    sumidos: window.__campanha.publico("sumidos").map((a) => a.nome),
    aniver: window.__campanha.publico("aniversariantes").map((a) => a.nome),
    agreg: window.__campanha.publico("agregadores").map((a) => a.nome),
    inad: window.__campanha.publico("inadimplentes").map((a) => a.nome),
    venc: window.__campanha.publico("vencendo").map((a) => a.nome),
  }));
  ok(pubs.sumidos.includes("Bianca Sumida") && !pubs.sumidos.includes("Rafa Silva"), "segmento sumidos 30+ certo");
  ok(pubs.aniver.includes("Rafa Silva"), "segmento aniversariantes do mês certo");
  ok(pubs.agreg.includes("Caio Gympass") && pubs.agreg.length === 1, "segmento agregadores certo");
  ok(pubs.inad.includes("Bianca Sumida") && pubs.inad.length === 1, "segmento inadimplentes certo");
  ok(pubs.venc.includes("Rafa Silva"), "segmento vencendo em 30 dias certo (contrato de 12m no fim)");
  await p.selectOption("#cpSegmento", "sumidos");
  await p.fill("#cpMsg", "Oi {nome}! Sentimos sua falta — bora voltar? 💜");
  await p.click("#cpGerar");
  const disparos = await p.evaluate(() => document.getElementById("cpLista").innerHTML);
  ok(/Bianca Sumida/.test(disparos) && /wa\.me\/5531999990002/.test(disparos), "disparo com link do WhatsApp gerado");
  ok(/Oi%20Bianca!/.test(disparos), "mensagem personalizada com o primeiro nome ({nome})");
  await p.close();

  // ---------- 6) templates de ficha + progressão (Personal) ----------
  console.log("Fichas prontas + progressão (Personal):");
  p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  p.on("dialog", (d) => d.accept());
  await p.goto(BASE + "/personal.html");
  await p.waitForFunction(() => window.__ptStudio);
  await p.fill("#obNome", "Léo Personal");
  await p.click("#obOk");
  await p.fill("#aNome", "João Cliente");
  await p.fill("#aValor", "400");
  await p.click("#aAdd");
  await p.click('[data-a="treinos"]');
  await p.selectOption("#tAluno", { index: 1 });
  await p.selectOption("#tplSel", "abc");
  await p.click("#tplAplicar");
  await p.waitForTimeout(300);
  const fichas = await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    return st.treinosV2[st.alunos[0].id].fichas;
  });
  ok(fichas.length === 3, "template ABC criou as 3 fichas em 1 clique");
  ok(/A — Peito\/Tríceps/.test(fichas[0].titulo) && fichas[0].itens.length === 3, "ficha A com 3 exercícios ligados à biblioteca");
  const fichasBox = await p.evaluate(() => document.getElementById("fichasBox").textContent);
  ok(/Supino reto/.test(fichasBox) && /4×10/.test(fichasBox), "fichas renderizam com séries×reps do template");

  // progressão: app do aluno com 2 registros iguais no diário → 3º dispara a sugestão
  const appP = await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    return window.__montaAppAluno(st.alunos[0], new Date().toISOString());
  });
  ok(/__sugestaoProg/.test(appP) && /Bora tentar/.test(appP), "lógica de progressão embutida no app");
  const pApp2 = await ctx.newPage();
  const errosApp2 = [];
  pApp2.on("pageerror", (e) => errosApp2.push(String(e)));
  await pApp2.route("**/app-teste-prog.html", (r) => r.fulfill({ contentType: "text/html", body: appP }));
  await pApp2.route("**/rest/v1/rpc/**", (r) => r.fulfill({ contentType: "application/json", body: "[]" }));
  await pApp2.goto(BASE + "/app-teste-prog.html", { waitUntil: "domcontentloaded" });
  await pApp2.evaluate(() => {
    const d = (off) => { const x = new Date(); x.setDate(x.getDate() + off); return x.toISOString().slice(0, 10); };
    localStorage.setItem("ptdc", JSON.stringify({ "Supino reto": [{ d: d(-7), kg: 60 }, { d: d(-4), kg: 60 }] }));
  });
  await pApp2.reload({ waitUntil: "domcontentloaded" });
  await pApp2.fill("#dcEx", "Supino reto");
  await pApp2.fill("#dcKg", "60");
  await pApp2.click("#dcAdd");
  await pApp2.waitForTimeout(400);
  const sugestao = await pApp2.evaluate(() => window.__sugestaoProg);
  ok(sugestao === 62.5, "3ª carga igual sugere subir pra 62,5 kg (60 + 2,5)");
  ok(errosApp2.length === 0, "app do personal sem erros de JS");
  await pApp2.close();
  await p.close();

  ok(erros.length === 0, "nenhuma página com erro de JS" + (erros.length ? " — " + erros[0] : ""));

  await b.close();
  console.log(falhas ? "\n💥 " + falhas + " FALHA(S)" : "\n🏁 TUDO PASSOU");
  process.exit(falhas ? 1 : 0);
})();
