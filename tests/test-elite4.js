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

  // ---------- 6a) treino guiado: com ficha prescrita, o app conduz série a série ----------
  console.log("Treino guiado no app:");
  const htmlGuia = await p.evaluate(() => {
    const a = JSON.parse(localStorage.getItem("mtapp:alunos")).alunos[0];
    a.appToken = "tok-rafa";
    window.MTStore.write("treinos", { exercicios: [], prescricoes: [{
      alunoId: a.id, freq: 3, fichas: [{ nome: "Ficha A", itens: [
        { ex: "Supino reto", series: "2", reps: "10", descanso: "30s", carga: "20kg" },
        { ex: "Agachamento livre", series: "2", reps: "12", descanso: "45s" },
      ] }],
    }] });
    return window.__appAluno.monta(a, new Date().toISOString());
  });
  ok(/guiabtn/.test(htmlGuia) && /▶ Treino guiado/.test(htmlGuia), "ficha ganha o botão ▶ Treino guiado");
  ok(/youtube\.com\/results\?search_query=/.test(htmlGuia) && /▶ como fazer/.test(htmlGuia), "exercícios sem vídeo próprio ganham demonstração automática (ficha e modo guiado)");
  const p3 = await ctx.newPage();
  const errosGuia = [];
  p3.on("pageerror", (e) => errosGuia.push(String(e)));
  await p3.setContent(htmlGuia, { waitUntil: "domcontentloaded" });
  await p3.waitForTimeout(500);
  await p3.evaluate(() => document.querySelector(".guiabtn").click());
  let gui = await p3.evaluate(() => ({
    on: document.getElementById("guiaBox").classList.contains("on"),
    ex: document.getElementById("gEx").textContent,
    prog: document.getElementById("gProg").textContent,
    serie: document.getElementById("gSerie").textContent,
  }));
  ok(gui.on && gui.ex === "Supino reto" && /exercício 1 de 2/.test(gui.prog), "modo guiado abre no Supino (exercício 1 de 2)");
  ok(/0\/2/.test(gui.serie), "botão mostra série 0/2");
  await p3.click("#gSerie");
  gui = await p3.evaluate(() => ({ desc: document.getElementById("gDesc").style.display, num: +document.getElementById("gDesc").textContent }));
  ok(gui.desc === "block" && gui.num > 0 && gui.num <= 30, "série feita liga o descanso automático de 30s (" + gui.num + ")");
  await p3.click("#gPular");
  gui = await p3.evaluate(() => document.getElementById("gSerie").textContent);
  ok(/1\/2/.test(gui), "pular descanso volta pro botão (série 1/2)");
  await p3.click("#gSerie"); // 2/2 — fim do exercício → descanso com troca
  await p3.click("#gPular");
  gui = await p3.evaluate(() => document.getElementById("gEx").textContent);
  ok(gui === "Agachamento livre", "fim das séries avança pro próximo exercício sozinho");
  await p3.click("#gSerie");
  await p3.click("#gPular");
  await p3.click("#gSerie"); // última série do último exercício
  gui = await p3.evaluate(() => ({ ex: document.getElementById("gEx").textContent, feitas: document.querySelector(".sfeita").textContent }));
  ok(/concluído/.test(gui.ex), "última série fecha com 🎉 treino concluído");
  ok(/2\/2/.test(gui.feitas), "séries do modo guiado marcam o contador da ficha (2/2)");
  ok(errosGuia.length === 0, "modo guiado sem erros de JS" + (errosGuia.length ? " — " + errosGuia[0] : ""));
  await p3.close();
  await p.close();

  // ---------- 6b) Publicação na nuvem: só oferece o link quando salvou ----------
  console.log("Publicação do app (nuvem):");
  p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  await p.goto(BASE + "/apps/app-aluno.html");
  await p.waitForFunction(() => window.__appPub);
  // sem login → publicar avisa e o link do aluno NÃO é oferecido
  let pubOk = await p.evaluate(() => {
    window.__nuvemTickMs = 5; // acelera a espera pela nuvem nos testes
    window.MTStore.cloud = () => null;
    window.MTStore.iniciaSync = () => {};
    return window.__appPub(false);
  });
  ok(pubOk === false, "sem login na nuvem, publicar devolve falso");
  let stPub = await p.evaluate(() => document.getElementById("pubStatus").textContent);
  ok(/Entre com seu login/.test(stPub), "status explica que precisa entrar na nuvem");
  await p.evaluate(() => { document.getElementById("fAluno").value = "Rafa Silva"; window.__appAluno.gera(); });
  await p.waitForFunction(() => /ainda não salvo/.test(document.getElementById("linkHospedado").textContent));
  ok(true, "gerar sem nuvem mostra aviso no lugar do link (antes mandava link morto)");
  let copiaEsc = await p.evaluate(() => document.getElementById("btnCopiaLink").hidden);
  ok(copiaEsc === true, "botão copiar fica escondido enquanto não salvou");
  // com a nuvem (simulada) → upsert em app_aluno e o link aparece
  pubOk = await p.evaluate(() => {
    window.__upserts = [];
    window.MTStore.cloud = () => ({
      aid: "acad-teste",
      client: { from: (t) => ({ upsert: (linhas) => { window.__upserts.push({ t, linhas }); return Promise.resolve({ data: linhas, error: null }); } }) },
    });
    return window.__appPub(false);
  });
  ok(pubOk === true, "com nuvem, publicar devolve verdadeiro");
  const ups = await p.evaluate(() => window.__upserts);
  const linhasPub = ups.flatMap((u) => u.linhas);
  ok(ups.length >= 1 && ups.every((u) => u.t === "app_aluno") && linhasPub.length >= 2, "upsert na tabela app_aluno cobre os 2 alunos ativos");
  ok(linhasPub.every((l) => l.token && l.academia_id === "acad-teste" && l.dados && /<html/i.test(l.dados.html || "") && l.dados.stamp), "cada linha tem token, academia e o HTML do app");
  stPub = await p.evaluate(() => document.getElementById("pubStatus").textContent);
  ok(/✅ 2 app/.test(stPub), "status confirma 2 apps publicados");
  await p.evaluate(() => { document.getElementById("fAluno").value = "Rafa Silva"; window.__appAluno.gera(); });
  await p.waitForFunction(() => /app\/\?t=tok-rafa/.test(document.getElementById("linkHospedado").textContent));
  ok(true, "com a publicação salva, o link hospedado do aluno aparece");
  copiaEsc = await p.evaluate(() => document.getElementById("btnCopiaLink").hidden);
  ok(copiaEsc === false, "botão copiar aparece junto com o link");
  // erro da nuvem → status honesto de falha
  pubOk = await p.evaluate(() => {
    window.MTStore.cloud = () => ({
      aid: "acad-teste",
      client: { from: () => ({ upsert: () => Promise.resolve({ error: { message: "permission denied" } }) }) },
    });
    return window.__appPub(false);
  });
  ok(pubOk === false, "erro da nuvem devolve falso");
  stPub = await p.evaluate(() => document.getElementById("pubStatus").textContent);
  ok(/Não consegui publicar/.test(stPub), "status mostra o erro da publicação");
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

  // ---------- 8b) Modo TV: quadro de horários, avisos e alerta de aula ----------
  p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  await p.goto(BASE + "/apps/tv.html");
  await p.evaluate(() => {
    // grade de hoje: uma aula daqui a 10 min (alerta urgente) e uma bem mais tarde
    const agora = new Date();
    const hhmm = (d) => ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
    const em10 = new Date(Math.min(agora.getTime() + 10 * 60000, new Date(agora).setHours(23, 58))); // não passa da meia-noite
    const em5h = new Date(agora.getTime() + 5 * 3600000);
    localStorage.setItem("mtapp:grade", JSON.stringify({
      aulas: [
        { id: "g1", nome: "CROSSFIT", prof: "Pedro Coach", sala: "Sala 2", vagas: 14, inicio: hhmm(em10), dur: 60, dias: [0, 1, 2, 3, 4, 5, 6], fixos: ["João Fixo"] },
        { id: "g2", nome: "SPINNING", prof: "Carla", sala: "Sala 1", vagas: 20, inicio: hhmm(new Date(Math.min(em5h.getTime(), new Date(agora).setHours(23, 50)))), dur: 45, dias: [0, 1, 2, 3, 4, 5, 6] },
      ],
      avulsas: [], presencas: (() => { const o = {}; o["g1|" + new Date(agora.getTime() - agora.getTimezoneOffset() * 60000).toISOString().slice(0, 10)] = ["Maria do App 📲"]; return o; })(), faltas: {}, config: {},
    }));
    localStorage.setItem("mtapp:tvAvisos", JSON.stringify({ itens: ["Sábado tem aulão de funcional às 9h 💪"] }));
    localStorage.setItem("mtapp:wod", JSON.stringify({ dias: (() => { const o = {}; o[new Date(agora.getTime() - agora.getTimezoneOffset() * 60000).toISOString().slice(0, 10)] = { nome: "Filthy Fifty", tipo: "FOR TIME", treino: "50 box jumps\n50 wall balls\n50 burpees", resultados: [{ aluno: "Rafa", resultado: "22:10" }] }; return o; })() }));
  });
  await p.goto(BASE + "/apps/tv.html?painel=aulas");
  await p.waitForTimeout(600);
  const tvAulas = await p.evaluate(() => ({
    corpo: document.body.textContent,
    alerta: document.getElementById("alertaAula").className,
    alertaTxt: document.getElementById("alertaTxt").textContent,
  }));
  ok(/Horários de hoje/.test(tvAulas.corpo) && /CROSSFIT/.test(tvAulas.corpo) && /Pedro Coach/.test(tvAulas.corpo) && /Sala 2/.test(tvAulas.corpo), "quadro de horários lista a aula de hoje com professor e sala");
  ok(/EM \d+ MIN/.test(tvAulas.corpo), "aula chegando ganha a etiqueta EM X MIN no quadro");
  ok(/urgente/.test(tvAulas.alerta) && /COMEÇA/.test(tvAulas.alertaTxt) && /CROSSFIT/.test(tvAulas.alertaTxt), "alerta 🔔 pulsante avisa a aula que está pra começar");
  await p.goto(BASE + "/apps/tv.html?painel=avisos");
  await p.waitForTimeout(600);
  const tvAvisos = await p.evaluate(() => document.body.textContent);
  ok(/Avisos da academia/.test(tvAvisos) && /aulão de funcional/.test(tvAvisos), "painel 📌 mostra os avisos escritos na Grade");
  ok(await p.evaluate(async () => {
    const t = await (await fetch("grade.html")).text();
    return /tvAvisosTxt/.test(t) && /Avisos do telão/.test(t);
  }), "Grade de Aulas tem o card 📺 pra escrever os avisos do telão");

  // telão por modalidade: ?atividade= filtra tudo e ganha treino do dia + quem vem
  await p.goto(BASE + "/apps/tv.html?atividade=crossfit&painel=agendados");
  await p.waitForTimeout(600);
  const tvBox = await p.evaluate(() => ({
    corpo: document.body.textContent,
    alertaTxt: document.getElementById("alertaTxt").textContent,
  }));
  ok(/CROSSFIT — QUEM VEM HOJE/i.test(tvBox.corpo) && /João Fixo/.test(tvBox.corpo) && /Maria do App 📲/.test(tvBox.corpo), "telão da modalidade lista os alunos agendados por horário (fixos + app)");
  ok(/2 \/ 14 aluno/.test(tvBox.corpo) && !/SPINNING/.test(tvBox.corpo), "contagem de vagas certa e outras modalidades ficam de fora");
  ok(/CROSSFIT/.test(tvBox.alertaTxt) && !/SPINNING/.test(tvBox.alertaTxt), "alerta 🔔 do telão da sala só fala da modalidade dele");
  await p.goto(BASE + "/apps/tv.html?atividade=crossfit&painel=woddia");
  await p.waitForTimeout(600);
  const tvWod = await p.evaluate(() => document.body.textContent);
  ok(/CROSSFIT — TREINO DO DIA/i.test(tvWod) && /Filthy Fifty/.test(tvWod) && /50 wall balls/.test(tvWod), "telão da modalidade mostra o WOD do dia");
  ok(/PLACAR DE HOJE/.test(tvWod) && /22:10/.test(tvWod), "placar do WOD entra no telão");
  await p.goto(BASE + "/apps/tv.html?atividade=crossfit");
  await p.waitForTimeout(600);
  const pontosBox = await p.evaluate(() => document.querySelectorAll("#pontos span").length);
  ok(pontosBox === 3, "rotação da modalidade: treino do dia + quem vem + avisos (" + pontosBox + " painéis)");
  await p.close();

  ok(erros.length === 0, "nenhuma página com erro de JS" + (erros.length ? " — " + erros[0] : ""));

  await b.close();
  console.log(falhas ? "\n💥 " + falhas + " FALHA(S)" : "\n🏁 TUDO PASSOU");
  process.exit(falhas ? 1 : 0);
})();
