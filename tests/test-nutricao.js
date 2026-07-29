// Módulo TORQUESYS Nutrição: onboarding, pacientes, dieta automática, dietas manuais e app do paciente
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
    localStorage.setItem("mtapp:ptSemConta", "1");
    localStorage.setItem("mtapp:ntSemConta", "1");
  });
  const erros = [];

  console.log("TORQUESYS Nutrição (módulo):");
  let p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  p.on("dialog", (d) => d.accept());
  await p.goto(BASE + "/nutricao.html");
  await p.waitForFunction(() => window.__ntStudio);

  // onboarding
  const obVisivel = await p.evaluate(() => !document.getElementById("boasVindas").hidden);
  ok(obVisivel, "onboarding aparece na primeira abertura");
  await p.fill("#obNome", "Nutri Ana Costa");
  await p.click("#obOk");
  const titulo = await p.evaluate(() => document.getElementById("tituloStudio").textContent);
  ok(/Nutri Ana Costa/.test(titulo), "título vira o nome do consultório");

  // banco de alimentos gigante (catálogo)
  const catalogo = await p.evaluate(() => (window.MT_ALIMENTOS || []).length);
  ok(catalogo >= 300, "catálogo gigante de alimentos carregado (" + catalogo + " itens)");
  const temCategorias = await p.evaluate(() => {
    const cats = new Set((window.MT_ALIMENTOS || []).map((a) => a.c));
    return cats.has("Fast food") && cats.has("Snacks e industrializados") && cats.has("Suplementos") && cats.size >= 12;
  });
  ok(temCategorias, "catálogo cobre processados, fast food e suplementos (12+ categorias)");

  // paciente novo (M, 30 anos, 80 kg, 180 cm, sedentário, manter → TMB 1780, alvo 2140)
  await p.fill("#pNome", "Bruno Paciente");
  await p.fill("#pZap", "31988887777");
  await p.selectOption("#pSexo", "M");
  await p.fill("#pIdade", "30");
  await p.fill("#pPeso", "80");
  await p.fill("#pAltura", "180");
  await p.selectOption("#pAtiv", "sed");
  await p.selectOption("#pObjetivo", "manter");
  await p.click("#pAdd");
  let lista = await p.evaluate(() => document.getElementById("listaPacientes").textContent);
  ok(/Bruno Paciente/.test(lista) && /sem dieta/.test(lista), "paciente cadastrado com etiqueta 'sem dieta'");
  ok(/alvo 2140 kcal/.test(lista), "alvo calórico Mifflin-St Jeor = 2140 kcal (conferido à mão)");

  // matemática da TMB validada direto
  const calc = await p.evaluate(() => window.__nutri.kcalAlvo({ sexo: "M", idade: 30, peso: 80, altura: 180, atividade: "sed", objetivo: "manter" }));
  ok(calc.tmb === 1780 && calc.alvo === 2140, "TMB 1780 × 1,2 = 2136 → alvo arredondado 2140");
  const calcF = await p.evaluate(() => window.__nutri.kcalAlvo({ sexo: "F", idade: 25, peso: 60, altura: 165, atividade: "mod", objetivo: "emagrecer" }));
  // F: 10*60 + 6.25*165 - 5*25 - 161 = 600+1031.25-125-161 = 1345.25; ×1.55 = 2085.1; ×0.8 = 1668.1 → 1670
  ok(calcF.alvo === 1670, "mulher 25a/60kg/165cm moderada emagrecendo → 1670 kcal");

  // dieta automática
  await p.click('[data-a="dietas"]');
  await p.selectOption("#dAluno", { index: 1 });
  await p.click("#dGerar");
  await p.waitForTimeout(300);
  const dieta = await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ntStudio"));
    return st.dietas[st.pacientes[0].id];
  });
  ok(dieta && dieta.refeicoes.length === 5 && dieta.geradaAuto, "dieta automática com 5 refeições");
  ok(dieta.aguaMl === 2800, "meta de água = peso × 35 ml (2800)");
  const resumo = await p.evaluate(() => document.getElementById("dResumo").textContent);
  ok(/TMB.*1780/.test(resumo) && /2140 kcal/.test(resumo), "resumo mostra TMB e alvo");
  ok(/gerada automática/.test(resumo) && /revise/.test(resumo), "etiqueta honesta: gerada automática — revise");
  const totais = await p.evaluate(() => document.getElementById("dTotais").textContent);
  ok(/Total da dieta/.test(totais) && /kcal alvo/.test(totais), "total da dieta × alvo com %");
  const pctM = totais.match(/\((\d+)%\)/);
  ok(pctM && +pctM[1] >= 70 && +pctM[1] <= 130, "dieta gerada fica perto do alvo (" + (pctM ? pctM[1] : "?") + "%)");

  // restrição respeitada (lactose)
  const semLact = await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ntStudio"));
    const d = window.__nutri.gerarDieta(st, { sexo: "F", idade: 30, peso: 60, altura: 165, atividade: "sed", objetivo: "manter", restricoes: "lactose" });
    const nomes = [];
    d.refeicoes.forEach((r) => r.itens.forEach((it) => {
      const al = st.alimentos.find((a) => a.id === it.alimId);
      if (al) nomes.push(al.nome.toLowerCase());
    }));
    return nomes;
  });
  ok(!semLact.some((n) => /leite|iogurte|queijo|requeijão/.test(n)), "restrição de lactose tira os laticínios");

  // refeição manual + item
  await p.fill("#dRefHora", "21:30");
  await p.fill("#dRefTitulo", "Ceia");
  await p.click("#dRefAdd");
  await p.waitForTimeout(200);
  const refBox = await p.evaluate(() => document.getElementById("refeicoesBox").textContent);
  ok(/Ceia/.test(refBox), "refeição manual adicionada");
  const ceiaId = await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ntStudio"));
    return st.dietas[st.pacientes[0].id].refeicoes.find((r) => r.titulo === "Ceia").id;
  });
  await p.fill('[data-alsel="' + ceiaId + '"]', "Ovo cozido");
  await p.fill('[data-alqtd="' + ceiaId + '"]', "2");
  await p.click('[data-additem="' + ceiaId + '"]');
  await p.waitForTimeout(200);
  const comOvo = await p.evaluate(() => document.getElementById("refeicoesBox").textContent);
  ok(/Ovo cozido/.test(comOvo) && /140 kcal/.test(comOvo), "busca no catálogo adiciona item com kcal (2 ovos = 140)");

  // curadoria: desativa "Big Mac (tipo)" e a categoria Fast food
  const antesCur = await p.evaluate(() => document.getElementById("dlAlimentos").innerHTML.includes("Big Mac"));
  ok(antesCur, "catálogo entra na busca das dietas (Big Mac disponível)");
  await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ntStudio"));
    (window.MT_ALIMENTOS || []).forEach((a) => { if (a.c === "Fast food") st.catalogoOff[a.n] = 1; });
    localStorage.setItem("mtapp:ntStudio", JSON.stringify(st));
  });
  await p.selectOption("#dAluno", { index: 1 });
  await p.waitForTimeout(200);
  const depoisCur = await p.evaluate(() => document.getElementById("dlAlimentos").innerHTML.includes("Big Mac"));
  ok(!depoisCur, "curadoria: categoria Fast food desativada some da busca");

  // código de barras (Open Food Facts mockado)
  await p.route("**/world.openfoodfacts.org/**", (r) => r.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ status: 1, product: { product_name_pt: "Biscoito Recheado Sabor Chocolate", brands: "MarcaX", nutriments: { "energy-kcal_100g": 480, proteins_100g: 5.2 } } }),
  }));
  await p.evaluate(() => window.__buscaOFF("7891000100103"));
  await p.waitForTimeout(400);
  const doCodigo = await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ntStudio"));
    return st.alimentos.find((a) => a.codigo === "7891000100103");
  });
  ok(!!doCodigo && doCodigo.kcal === 480 && /MarcaX/.test(doCodigo.nome), "código de barras traz o produto do Open Food Facts (480 kcal/100g)");

  // app do paciente
  const appHtml = await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ntStudio"));
    return window.__montaAppNutri(st.pacientes[0], new Date().toISOString());
  });
  ok(/Água de hoje/.test(appHtml) && /agAdd/.test(appHtml), "app tem card de água com botão de copo");
  ok(/Me lembrar de beber água/.test(appHtml), "app tem lembrete de água (notificações)");
  ok(/Minhas refeições/.test(appHtml) && /Almoço/.test(appHtml) && /Ceia/.test(appHtml), "app leva as refeições da dieta");
  ok(/Marcar como feita/.test(appHtml) && /kcalDia/.test(appHtml), "refeições marcáveis + kcal do dia");
  ok(/2140 kcal/.test(appHtml) && /2800 ml/.test(appHtml), "metas de kcal e água embutidas");
  ok(/Meu peso/.test(appHtml) && /pzAdd/.test(appHtml), "card de peso presente");
  ok(/aluno_define_login/.test(appHtml) && /🔑 Meu login/.test(appHtml), "app do paciente tem login e senha");
  ok(/Nutri Ana Costa/.test(appHtml), "marca do consultório no app");

  // abre o app e usa: água, refeição feita, peso
  const pApp = await ctx.newPage();
  const errosApp = [];
  pApp.on("pageerror", (e) => errosApp.push(String(e)));
  await pApp.route("**/app-teste-nutri.html", (r) => r.fulfill({ contentType: "text/html", body: appHtml }));
  await pApp.route("**/rest/v1/rpc/**", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, login: "bruno@email.com" }) }));
  await pApp.goto(BASE + "/app-teste-nutri.html", { waitUntil: "domcontentloaded" });
  await pApp.waitForFunction(() => window.__appNutri);
  await pApp.click("#agAdd");
  await pApp.click("#agAdd");
  const agua = await pApp.evaluate(() => document.getElementById("agTxt").textContent);
  ok(/500 ml/.test(agua), "2 copos = 500 ml na barra de água");
  await pApp.evaluate(() => document.querySelector("[data-refok]").click());
  const prog = await pApp.evaluate(() => document.getElementById("refProg").textContent);
  ok(/1 de 6/.test(prog), "refeição marcada conta no progresso (1 de 6)");
  const kcalDia = await pApp.evaluate(() => document.getElementById("kcalDia").textContent);
  ok(/^[1-9]\d* kcal/.test(kcalDia), "kcal do dia soma a refeição feita (" + kcalDia + ")");
  // 🍎 diário alimentar: registra uma banana e o total cresce
  const dbApp = await pApp.evaluate(() => window.ALDB.length);
  ok(dbApp >= 250, "banco embutido no app pra busca offline (" + dbApp + " alimentos)");
  await pApp.fill("#diBusca", "Banana prata");
  await pApp.fill("#diQtd", "2");
  await pApp.click("#diAdd");
  await pApp.waitForTimeout(200);
  const diario = await pApp.evaluate(() => ({
    lista: document.getElementById("diLista").textContent,
    kcalDiario: document.getElementById("kcalDiario").textContent,
    total: document.getElementById("kcalDia").textContent,
    ref: document.getElementById("kcalRef").textContent,
  }));
  ok(/Banana prata/.test(diario.lista) && /128 kcal/.test(diario.kcalDiario), "diário registra 2 bananas (128 kcal)");
  ok(parseInt(diario.total) === parseInt(diario.ref) + 128, "total do dia = refeições feitas + diário");
  // remove do diário
  await pApp.evaluate(() => document.querySelector("[data-dirm]").click());
  const dep = await pApp.evaluate(() => document.getElementById("kcalDiario").textContent);
  ok(/^0 kcal/.test(dep), "item removido do diário zera a soma");
  ok(/código de barras/i.test(await pApp.evaluate(() => document.body.textContent)), "app tem o botão de código de barras");
  const prox = await pApp.evaluate(() => document.getElementById("proxRef").textContent);
  ok(prox.length > 3, "próxima refeição calculada (" + prox.slice(0, 40) + ")");
  await pApp.fill("#pzKg", "79,5");
  await pApp.click("#pzAdd");
  const pz = await pApp.evaluate(() => document.getElementById("pzGraf").textContent);
  ok(/79,5/.test(pz), "peso registrado no app");
  // login do aluno no app
  await pApp.fill("#lgLogin", "bruno@email.com");
  await pApp.fill("#lgSenha", "senha123");
  await pApp.click("#lgSalva");
  await pApp.waitForTimeout(400);
  const lgOk = await pApp.evaluate(() => document.getElementById("lgOk").textContent);
  ok(/bruno@email\.com/.test(lgOk), "login criado direto do app do paciente");
  ok(errosApp.length === 0, "app do paciente sem erros de JS" + (errosApp.length ? " — " + errosApp[0] : ""));
  await pApp.close();

  // resumo por WhatsApp
  await p.evaluate(() => { window.open = (u) => { window.__zapUrl = u; return null; }; });
  await p.click("#dZap");
  const zapUrl = await p.evaluate(() => decodeURIComponent(window.__zapUrl || ""));
  ok(/wa\.me\/5531988887777/.test(zapUrl) && /Sua dieta/.test(zapUrl) && /Água: 2800/.test(zapUrl), "resumo da dieta vai pro WhatsApp do paciente");

  // site comercial tem o segmento
  const pSite = await ctx.newPage();
  await pSite.goto(BASE + "/torquesys.html");
  const corpo = await pSite.evaluate(() => document.body.textContent);
  ok(/Nutricionista/.test(corpo) && /Dieta automática/.test(corpo), "segmento Nutricionista no site comercial");
  await pSite.close();

  // login próprio do TORQUE NUTRI (gate verde do módulo)
  const ctxG = await b.newContext({ viewport: { width: 1360, height: 900 } });
  await ctxG.addInitScript(() => localStorage.setItem("mtapp:perfil", JSON.stringify({ nome: "R" })));
  const pG = await ctxG.newPage();
  pG.on("pageerror", (e) => erros.push(String(e)));
  await pG.goto(BASE + "/nutricao.html");
  await pG.waitForFunction(() => document.getElementById("gateModulo") && !document.getElementById("gateModulo").hidden, null, { timeout: 8000 });
  const gateTxt = await pG.evaluate(() => document.getElementById("gateModulo").textContent);
  ok(/TORQUE/.test(gateTxt) && /NUTRI/.test(gateTxt) && /Entrar/.test(gateTxt), "tela de entrada com a marca TORQUE NUTRI (não manda pro portal)");
  await pG.click("#mgLocal");
  const fechou = await pG.evaluate(() => document.getElementById("gateModulo").hidden);
  ok(fechou, "'experimentar sem conta' libera o módulo");
  await pG.close();
  await ctxG.close();

  ok(erros.length === 0, "nenhuma página com erro de JS" + (erros.length ? " — " + erros[0] : ""));

  await b.close();
  console.log(falhas ? "\n💥 " + falhas + " FALHA(S)" : "\n🏁 TUDO PASSOU");
  process.exit(falhas ? 1 : 0);
})();
