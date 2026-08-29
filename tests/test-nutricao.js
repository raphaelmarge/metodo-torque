// Módulo TORQUE ON Nutrição: onboarding, pacientes, dieta automática, dietas manuais e app do paciente
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

// abre o menu lateral e clica na aba (menu vira gaveta com hambúrguer)
async function abaNt(p, a) {
  // no computador o menu já fica à vista; no celular é preciso abrir a gaveta
  const menu = p.locator("#btnMenuNt");
  if (await menu.isVisible()) await menu.click();
  await p.click('#abasNt [data-a="' + a + '"]');
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

  console.log("TORQUE ON Nutrição (módulo):");
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

  // aba Início (dashboard gerencial) é a padrão agora — igual ao Personal
  ok(await p.evaluate(() => !document.getElementById("vDashN").hidden && document.getElementById("vPacientes").hidden),
    "módulo abre na aba Início (dashboard)");
  const dashN = await p.evaluate(() => ({
    receb: document.getElementById("bRecebN").textContent,
    base: document.getElementById("bBaseN").textContent,
    ag: document.getElementById("bAgN").textContent,
  }));
  ok(/Recebido no mês/.test(dashN.receb) && /Projeção/.test(dashN.receb), "bloco Recebimentos renderiza");
  ok(/Pacientes ativos/.test(dashN.base) && /Com dieta entregue/.test(dashN.base), "bloco Status da base renderiza");
  ok(/Consultas no mês/.test(dashN.ag), "bloco Agenda de consultas renderiza");
  await p.fill("#mtFatN", "5000");
  await p.click("#mtSalvarN");
  ok(await p.evaluate(() => /meta R\$\s?5\.000/.test(document.getElementById("mtPainelN").textContent) && /projeção/.test(document.getElementById("mtPainelN").textContent)),
    "meta salva aparece com projeção run-rate");
  const fchN = await p.evaluate(() => window.__dashN.resumo(new Date().toISOString().slice(0, 7)));
  ok(/Receita: R\$/.test(fchN) && /Consultas no mês:/.test(fchN), "resumo de fechamento pronto pro WhatsApp");
  ok(await p.evaluate(() => document.querySelectorAll("#navNt [data-nav]").length === 4 && !!document.getElementById("btnMenuNt").closest("#navNt")),
    "menu inferior com 4 abas + botão Menu (☰) à direita");
  ok(await p.evaluate(() => !/[🏠🥦📅💬📋]/.test(document.getElementById("abasNt").textContent) && document.querySelectorAll("#abasNt button svg").length >= 8),
    "gaveta com ícones desenhados, sem emoji");

  // paciente novo (M, 30 anos, 80 kg, 180 cm, sedentário, manter → TMB 1780, alvo 2140)
  await abaNt(p, "pacientes");
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
  ok(await p.evaluate(() => !!document.querySelector('#listaPacientes [data-acesso]')), "paciente sem acesso do app tem o botão 📧 Enviar acesso na lista");
  ok(/alvo 2140 kcal/.test(lista), "alvo calórico Mifflin-St Jeor = 2140 kcal (conferido à mão)");

  // matemática da TMB validada direto
  const calc = await p.evaluate(() => window.__nutri.kcalAlvo({ sexo: "M", idade: 30, peso: 80, altura: 180, atividade: "sed", objetivo: "manter" }));
  ok(calc.tmb === 1780 && calc.alvo === 2140, "TMB 1780 × 1,2 = 2136 → alvo arredondado 2140");
  const calcF = await p.evaluate(() => window.__nutri.kcalAlvo({ sexo: "F", idade: 25, peso: 60, altura: 165, atividade: "mod", objetivo: "emagrecer" }));
  // F: 10*60 + 6.25*165 - 5*25 - 161 = 600+1031.25-125-161 = 1345.25; ×1.55 = 2085.1; ×0.8 = 1668.1 → 1670
  ok(calcF.alvo === 1670, "mulher 25a/60kg/165cm moderada emagrecendo → 1670 kcal");

  // dieta automática
  await abaNt(p, "dietas");
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
  ok(/gerada automaticamente/.test(resumo) && /revise/.test(resumo), "etiqueta honesta: gerada automaticamente — revise");
  const totais = await p.evaluate(() => document.getElementById("dTotais").textContent);
  ok(/Total da dieta/.test(totais) && /kcal alvo/.test(totais), "total da dieta × alvo com %");
  const pctM = totais.match(/\((\d+)%\)/);
  ok(pctM && +pctM[1] >= 70 && +pctM[1] <= 130, "dieta gerada fica perto do alvo (" + (pctM ? pctM[1] : "?") + "%)");

  // macros P/C/G (novo): alvo por g/kg + totais na tela
  ok(/Proteína/.test(totais) && /Carbo/.test(totais) && /Gordura/.test(totais), "totais da dieta mostram P/C/G contra o alvo de macros");
  const mAlvo = await p.evaluate(() => window.__nutri.macrosAlvo({ sexo: "M", idade: 30, peso: 80, altura: 180, atividade: "sed", objetivo: "manter" }));
  ok(mAlvo.prot === 128 && mAlvo.gord === 59 && mAlvo.carb === 274, "alvo de macros: 1,6 g/kg proteína, 25% gordura, resto carbo (128/274/59)");
  const mDieta = await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ntStudio"));
    return window.__nutri.macrosDaDieta(st, st.dietas[st.pacientes[0].id]);
  });
  ok(mDieta.prot > 0 && mDieta.carb > 0 && mDieta.gord > 0, "dieta gerada soma proteína, carbo e gordura do banco TACO");

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
    body: JSON.stringify({ status: 1, product: { product_name_pt: "Biscoito Recheado Sabor Chocolate", brands: "MarcaX", nutriments: { "energy-kcal_100g": 480, proteins_100g: 5.2, carbohydrates_100g: 65, fat_100g: 20 } } }),
  }));
  await p.evaluate(() => window.__buscaOFF("7891000100103"));
  await p.waitForTimeout(400);
  const doCodigo = await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ntStudio"));
    return st.alimentos.find((a) => a.codigo === "7891000100103");
  });
  ok(!!doCodigo && doCodigo.kcal === 480 && /MarcaX/.test(doCodigo.nome), "código de barras traz o produto do Open Food Facts (480 kcal/100g)");
  ok(doCodigo && doCodigo.carb === 65 && doCodigo.gord === 20, "código de barras captura carbo e gordura do rótulo");

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
  ok(appHtml.includes("if(!L('ntpeso',[]).length&&!L('ntdi_'+isoHj(),[]).length"),
    "app num celular novo (sem registro local) NÃO devolve dados vazios pra nuvem");
  ok(/aluno_define_login/.test(appHtml) && /Meu login/.test(appHtml), "app do paciente tem login e senha");
  ok(/Nutri Ana Costa/.test(appHtml), "marca do consultório no app");
  ok(/macroDia/.test(appHtml) && /Alvo de macros/.test(appHtml), "card Meu dia mostra P/C/G do dia contra o alvo");
  ok(/app_aluno_devolve/.test(appHtml) && /devolveApp/.test(appHtml), "app devolve peso/diário/refeições/água/fotos pro nutricionista");

  // plano alimentar em PDF (imprimível)
  const planoPdf = await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ntStudio"));
    return window.__planoPdf(st.pacientes[0].id);
  });
  ok(/PLANO ALIMENTAR/.test(planoPdf) && /Metas diárias/.test(planoPdf) && /Proteína/.test(planoPdf), "plano imprimível com metas de kcal e macros");
  ok(/Almoço/.test(planoPdf) && /window\.print/.test(planoPdf) && /Nutricionista/.test(planoPdf), "plano lista as refeições, tem botão de imprimir e assinatura");
  ok(await p.evaluate(() => !!document.getElementById("dPdf") && !!document.getElementById("pnAppDados")), "botão 🖨 Plano em PDF e card 'O que o paciente registrou' existem");

  // 💳 link de pagamento da consulta (Pagar.me — mesma função da nuvem dos outros módulos)
  {
    const pgmN = await p.evaluate(async () => {
      const st = JSON.parse(localStorage.getItem("mtapp:ntStudio"));
      const id = st.pacientes[0].id;
      const semNuvem = await new Promise((res) => window.__pagarmeNT(id, 150, res));
      window.__cloudOrigPg = window.MTStore.cloud;
      window.__fetchOrigPg = window.fetch;
      window.MTStore.cloud = () => ({ aid: "x", client: { auth: { getSession: () => Promise.resolve({ data: { session: { access_token: "tok" } } }) } } });
      let corpo = null;
      window.fetch = (url, opts) => {
        if (String(url).includes("functions/v1/pagarme")) {
          corpo = JSON.parse(opts.body);
          return Promise.resolve({ status: 200, text: () => Promise.resolve(JSON.stringify({ ok: true, linkPagamento: "https://pagar.me/checkout/n1" })) });
        }
        return window.__fetchOrigPg(url, opts);
      };
      const comNuvem = await new Promise((res) => window.__pagarmeNT(id, 150, res));
      window.fetch = window.__fetchOrigPg;
      window.MTStore.cloud = window.__cloudOrigPg;
      return { semNuvem, comNuvem, corpo, temBotao: !!document.getElementById("pnPgLink") };
    });
    ok(/Entre na sua conta/.test(pgmN.semNuvem.erro), "💳 sem nuvem, o link de pagamento da consulta explica o que falta");
    ok(pgmN.comNuvem.ok && /pagar\.me/.test(pgmN.comNuvem.link) && pgmN.temBotao, "💳 link de checkout da consulta volta pro nutricionista (botão no perfil)");
    ok(pgmN.corpo.valorCentavos === 15000 && /Consulta/.test(pgmN.corpo.descricao) && pgmN.corpo.metodo === "cartao", "cobrança da consulta vai pro Pagar.me em centavos com a descrição certa");
  }
  ok(/chMsgs/.test(appHtml) && /chEnvia/.test(appHtml) && /app_chat_lista/.test(appHtml) && /app_chat_envia/.test(appHtml), "app do paciente tem o chat interno (mesma nuvem do personal)");
  ok(/Agenda<\/h2>/.test(appHtml) && /agCal/.test(appHtml) && /app_agenda_pede/.test(appHtml) && /app_agenda_lista/.test(appHtml), "app do paciente tem agenda estilo calendário com pedido de horário");
  ok(/data-agics/.test(appHtml) && /AGTIT/.test(appHtml), "horário confirmado no app tem o botão 📅 salvar no calendário");
  ok(/Conquistas<\/h2>/.test(appHtml) && /cqGrid/.test(appHtml) && /Adesão à dieta/.test(appHtml), "app do paciente tem conquistas com gráfico de adesão");
  ok(/Dia perfeito/.test(appHtml) && /7 dias de água/.test(appHtml) && /10 pesagens/.test(appHtml), "medalhas de adesão, água e pesagens no app");
  ok(/botChips/.test(appHtml) && />assistente</.test(appHtml) && /botEscolhe/.test(appHtml), "app do paciente tem o robô de atendimento (chatbot de menu)");
  // menu fixo embaixo (paridade com o app do aluno do Personal)
  ok(/navAppN/.test(appHtml) && /trocaSecN/.test(appHtml) && /'dieta'/.test(appHtml) && /'evolucao'/.test(appHtml) && /nitemn/.test(appHtml),
    "app do paciente tem a barra de navegação fixa embaixo (Início/Dieta/Evolução/Agenda/Chat)");
  ok(/Pode escrever aqui embaixo/.test(appHtml), "opção 'humano' vira encaminhamento pro nutricionista");
  // fotos de progresso, Pix e push (lote de melhorias dos apps)
  ok(/Fotos de progresso/.test(appHtml) && /ntfotos/.test(appHtml) && /ANTES · /.test(appHtml), "app do paciente tem fotos de progresso ANTES × AGORA");
  ok(/cardNotif/.test(appHtml) && /app_aluno_push/.test(appHtml) && /app-sw\.js/.test(appHtml), "app do paciente registra push pelo link hospedado");
  ok(!/Pagamento da consulta/.test(appHtml), "sem chave Pix configurada, o card de pagamento não aparece");
  {
    ok(await p.evaluate(() => !!document.getElementById("cfgPixChave") && !!document.getElementById("cfgPixValor")), "módulo tem os campos de Pix na ilha da nuvem");
    const appPix = await p.evaluate(() => {
      const st = window.MTStore.read("ntStudio", {});
      st.config.pixChave = "ana@nutri.com";
      st.config.pixNome = "Ana Costa";
      st.config.pixCidade = "Belo Horizonte";
      st.config.pixValor = 150;
      window.MTStore.write("ntStudio", st);
      return window.__montaAppNutri(window.MTStore.read("ntStudio", {}).pacientes[0], new Date().toISOString());
    });
    ok(/Pagamento da consulta/.test(appPix) && /R\$ 150,00/.test(appPix) && /pixCopiaPac/.test(appPix), "com a chave configurada, o app ganha o card Pix com valor");
    const payload = await p.evaluate(() => window.__pixN.payload("ana@nutri.com", "Ana Costa", "Belo Horizonte", 150, "TQNBRUNO"));
    ok(/br\.gov\.bcb\.pix/.test(payload) && /ana@nutri\.com/.test(payload) && /150\.00/.test(payload), "payload Pix EMV válido com chave e valor");
    // o app do paciente abre sem erro de JS (com as novidades)
    const pApp2 = await ctx.newPage();
    const errosApp2 = [];
    pApp2.on("pageerror", (e) => errosApp2.push(String(e)));
    await pApp2.route("**/app-teste-nutri.html", (r) => r.fulfill({ contentType: "text/html", body: appPix }));
    await pApp2.goto(BASE + "/app-teste-nutri.html", { waitUntil: "domcontentloaded" });
    await pApp2.waitForTimeout(600);
    const fotoUi = await pApp2.evaluate(() => ({
      temFoto: !!document.getElementById("fotoInput"),
      pix: document.getElementById("pixPac") ? document.getElementById("pixPac").value : "",
    }));
    ok(fotoUi.temFoto && /br\.gov\.bcb\.pix/.test(fotoUi.pix), "no app aberto: input de foto e código Pix prontos");
    // card de conquista pro Stories baixa a imagem
    const dlN = pApp2.waitForEvent("download", { timeout: 5000 }).catch(() => null);
    await pApp2.evaluate(() => document.getElementById("btnCardStories").click());
    const cardN = await dlN;
    ok(!!cardN && /conquista\.png/.test(cardN.suggestedFilename()), "Gerar card pro Stories baixa a imagem no app do paciente");
    ok(errosApp2.length === 0, "app do paciente abre sem erros de JS" + (errosApp2.length ? " — " + errosApp2[0] : ""));
    await pApp2.close();
  }
  // mural do consultório: aviso entra no app do paciente
  {
    const comMural = await p.evaluate(() => {
      const st = window.MTStore.read("ntStudio", {});
      st.config.mural = ["Agenda de dezembro aberta! 🗓️"];
      window.MTStore.write("ntStudio", st);
      return window.__montaAppNutri(window.MTStore.read("ntStudio", {}).pacientes[0], new Date().toISOString());
    });
    ok(/Mural do consultório/.test(comMural) && /Agenda de dezembro/.test(comMural), "aviso do mural entra no app do paciente");
    ok(await p.evaluate(() => !!document.getElementById("cfgMural")), "módulo tem o campo 📌 Mural na ilha");
    ok(/btnCardStories/.test(comMural), "app do paciente tem o botão de card pro Stories");
  }
  // 🎨 tema do consultório: cor principal + logo no painel e no app do paciente
  {
    const LOGO_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    ok(await p.evaluate(() => !!document.getElementById("cfgCorN") && !!document.getElementById("cfgLogoBtnN") && !!document.getElementById("cfgLogoFileN") && !!document.getElementById("cfgCorResetN") && !!window.__temaN), "card da conta tem o bloco 🎨 A cara do seu consultório");
    const tema = await p.evaluate((logo) => {
      const st = window.MTStore.read("ntStudio", {});
      st.config.cor = "#db2777";
      st.config.logo = logo;
      window.MTStore.write("ntStudio", st);
      return {
        app: window.__montaAppNutri(window.MTStore.read("ntStudio", {}).pacientes[0], new Date().toISOString()),
        cor2: window.__temaN.escurece("#db2777", .18),
        theme: window.__temaN.escurece("#db2777", .55),
        acento: window.__temaN.clareia("#db2777", .5),
        varVerde: document.documentElement.style.getPropertyValue("--verde"),
        varVerde2: document.documentElement.style.getPropertyValue("--verde-2"),
        prevOk: !document.getElementById("cfgLogoPrevN").hidden && !document.getElementById("cfgLogoDelN").hidden,
        logoTopo: !!document.getElementById("logoTopoN"),
      };
    }, LOGO_PNG);
    ok(tema.app.includes("linear-gradient(135deg,#db2777," + tema.cor2 + ")"), "cor escolhida entra no gradiente dos botões do app (" + tema.cor2 + ")");
    ok(tema.app.includes("theme-color' content='" + tema.theme + "'"), "theme-color do app é a cor escolhida escurecida (" + tema.theme + ")");
    ok(tema.app.includes("color:" + tema.acento) && !/#86efac/.test(tema.app), "acentos do app usam a cor clareada no lugar do verde-claro");
    ok(tema.app.includes("<img src='" + LOGO_PNG + "'"), "logo do consultório entra no cabeçalho do app");
    ok(tema.varVerde === "#db2777" && tema.varVerde2 === tema.cor2, "painel muda as variáveis CSS do verde pra cor escolhida");
    ok(tema.prevOk && tema.logoTopo, "preview da logo, botão ✕ tirar logo e logo no topo do painel");
    const invalido = await p.evaluate(() => {
      const st = window.MTStore.read("ntStudio", {});
      st.config.cor = "javascript:alert(1)";
      st.config.logo = "data:image/png;base64,abc'onerror='alert(1)";
      window.MTStore.write("ntStudio", st);
      return window.__montaAppNutri(window.MTStore.read("ntStudio", {}).pacientes[0], new Date().toISOString());
    });
    ok(invalido.includes("linear-gradient(135deg,#16a34a,#15803d)") && invalido.includes("theme-color' content='#14532d'"), "cor inválida cai no verde padrão");
    ok(!invalido.includes("onerror='alert(1)"), "logo maliciosa (com aspas) fica de fora do app");
    // restaura o padrão pra não afetar o resto da suíte
    const padrao = await p.evaluate(() => {
      const st = window.MTStore.read("ntStudio", {});
      st.config.cor = "";
      delete st.config.logo;
      window.MTStore.write("ntStudio", st);
      return {
        varVerde: document.documentElement.style.getPropertyValue("--verde"),
        logoTopo: !!document.getElementById("logoTopoN"),
        app: window.__montaAppNutri(window.MTStore.read("ntStudio", {}).pacientes[0], new Date().toISOString()),
      };
    });
    ok(padrao.varVerde === "" && !padrao.logoTopo && padrao.app.includes("linear-gradient(135deg,#16a34a,#15803d)") && !padrao.app.includes(LOGO_PNG), "voltar ao padrão limpa o painel e o app volta ao verde");
  }
  {
    const botEd = await p.evaluate(() => ({
      temCard: !!document.getElementById("botAtivoN"),
      ativo: document.getElementById("botAtivoN").checked,
      ops: document.getElementById("botOpsN").value,
    }));
    ok(botEd.temCard && botEd.ativo, "módulo tem o editor do robô, ligado por padrão");
    ok(/\|/.test(botEd.ops) && /humano/.test(botEd.ops), "opções padrão no formato Rótulo | Resposta com encaminhamento humano");
    const fluxo = await p.evaluate(() => {
      const desenho = {
        paths: document.querySelectorAll("#botFluxoN svg path").length,
        baloes: document.querySelectorAll("#botFluxoN .bb-bloco").length,
        temZap: !!document.getElementById("botZapN"),
        temBar: !!document.querySelector("#botFluxoN #bbSel") && !!document.querySelector("#botFluxoN #bbNova"),
      };
      const f = window.__botFluxoN({ ativo: true, oi: "Oi!", ops: [{ r: "Dieta", t: "No card refeições." }, { r: "Falar comigo", t: "humano" }] }, "Ana");
      return { desenho, inicio: f.inicio, tipos: f.blocos.map((b) => b.tipo), voltaMenu: f.blocos[2].destino };
    });
    ok(fluxo.desenho.paths >= 5 && fluxo.desenho.baloes >= 6, "construtor desenhado com linhas e balões arrastáveis");
    ok(fluxo.desenho.temZap && fluxo.desenho.temBar, "barra de automações e Publicar no WhatsApp");
    ok(fluxo.inicio === "b_oi" && fluxo.tipos.join() === "mensagem,menu,mensagem,equipe" && fluxo.voltaMenu === "b_menu", "fluxo no formato do chatbot da academia");
  }

  // ---------- perfil completo do paciente ----------
  console.log("Perfil do paciente:");
  await abaNt(p, "pacientes");
  ok(await p.evaluate(() => !!document.querySelector('[data-perfil]')), "lista tem o botão 👤 Perfil");
  await p.evaluate(() => document.querySelector("[data-perfil]").click());
  let perfilN = await p.evaluate(() => ({
    aberto: document.getElementById("dlgPerfilN").open,
    titulo: document.getElementById("pnTitulo").textContent,
    alvo: document.getElementById("pnAlvo").textContent,
    fin: document.getElementById("pnFin").textContent,
  }));
  ok(perfilN.aberto && /Bruno Paciente/.test(perfilN.titulo), "perfil abre com o nome do paciente");
  ok(/TMB 1780/.test(perfilN.alvo) && /2140/.test(perfilN.alvo), "alvo calórico calculado no perfil");
  // acesso do paciente por e-mail (site com login e senha)
  ok(await p.evaluate(() => !!document.getElementById("pEmail") && !!document.getElementById("pAcessoStatus")), "cadastro rápido tem o campo de e-mail que cria o acesso do app");
  ok(await p.evaluate(() => !!document.getElementById("pnAcesso") && !!document.getElementById("pnEmail") && !!window.__acessoNutri), "perfil tem e-mail + botão 📧 Enviar acesso do app");
  ok(await p.evaluate(() => { const s = window.__acessoNutri.senha(); return s.length === 10 && !/[0OIl1]/.test(s); }), "senha aleatória do acesso sem letras confusas");
  ok(/Nenhum pagamento/.test(perfilN.fin), "financeiro começa sem pagamentos");
  // registra pagamento e pesagem
  await p.evaluate(() => {
    document.getElementById("pnPgValor").value = "150";
    document.getElementById("pnPgAdd").click();
  });
  await p.waitForTimeout(200);
  await p.evaluate(() => {
    document.getElementById("pnKg").value = "78,5";
    document.getElementById("pnKgAdd").click();
  });
  await p.waitForTimeout(200);
  perfilN = await p.evaluate(() => ({
    fin: document.getElementById("pnFin").textContent,
    peso: document.getElementById("pnPesoGraf").textContent,
    st: window.MTStore.read("ntStudio", {}),
  }));
  ok(/R\$ 150,00/.test(perfilN.fin), "pagamento de consulta registrado (R$ 150)");
  ok(/78,5 kg/.test(perfilN.peso), "pesagem registrada aparece na evolução");
  ok(perfilN.st.pacientes[0].peso === 78.5, "cadastro acompanha a pesagem mais recente");

  // 🔁 assinatura mensal no cartão (módulo compartilhado mockado)
  ok(await p.evaluate(() => !!document.getElementById("pnAssinar") && !!document.getElementById("pnAssinaturaBox")), "perfil tem o botão 🔁 Assinatura mensal ao lado do link de pagamento");
  await p.evaluate(() => {
    window.MT_cartaoRec = {
      abre: (o) => { window.__abriuCartao = o; o.onOk({ ok: true, assinaturaId: "sub_n1", status: "active" }); },
      cancela: () => Promise.resolve({ ok: true }),
      status: () => Promise.resolve({ ok: true, status: "active" }),
    };
    document.getElementById("pnPgValor").value = "150";
    document.getElementById("pnAssinar").click();
  });
  await p.waitForTimeout(250);
  const assN = await p.evaluate(() => ({
    valor: window.__abriuCartao.valor,
    descricao: window.__abriuCartao.descricao,
    nome: window.__abriuCartao.nome,
    cor: window.__abriuCartao.cor,
    rec: window.MTStore.read("ntStudio", {}).pacientes[0].assinaturaRec,
    box: document.getElementById("pnAssinaturaBox").textContent,
    botaoSumiu: document.getElementById("pnAssinar").style.display === "none",
  }));
  ok(assN.valor === 150 && assN.descricao === "Acompanhamento — Nutri Ana Costa" && /Bruno Paciente/.test(assN.nome) && assN.cor === "#16a34a", "🔁 abre o cartão com valor, descrição do consultório, nome e cor verde");
  ok(assN.rec && assN.rec.id === "sub_n1" && assN.rec.valor === 150 && !!assN.rec.desde, "assinaturaRec gravada no paciente (id, valor e data)");
  ok(/Assinatura ativa desde/.test(assN.box) && /150,00/.test(assN.box) && assN.botaoSumiu, "perfil mostra 🔁 Assinatura ativa com data e valor (e esconde o botão)");
  await p.evaluate(() => document.getElementById("pnAssinaturaStatus").click());
  await p.waitForTimeout(250);
  ok(await p.evaluate(() => /ativa/.test(document.getElementById("pnAssinaturaInfo").textContent)), "ver status consulta a nuvem (mock) e mostra 'ativa'");
  await p.evaluate(() => document.getElementById("pnAssinaturaCancela").click()); // confirm aceito pelo handler global
  await p.waitForFunction(() => !window.MTStore.read("ntStudio", {}).pacientes[0].assinaturaRec, null, { timeout: 5000 });
  const assN2 = await p.evaluate(() => ({
    box: document.getElementById("pnAssinaturaBox").textContent,
    botaoVoltou: document.getElementById("pnAssinar").style.display !== "none",
  }));
  ok(!/Assinatura ativa/.test(assN2.box) && assN2.botaoVoltou, "cancelar limpa a assinatura e o botão de ativar volta");

  // 🔁 baixa automática: evento pago do webhook vira pagamento da consulta (sem duplicar)
  const baixaN = await p.evaluate(async () => {
    const st = window.MTStore.read("ntStudio", {});
    st.pacientes[0].assinaturaRec = { id: "sub_hook_n", desde: window.MTStore.todayISO(), valor: 150 };
    window.MTStore.write("ntStudio", st);
    window.__cloudOrigBN = window.MTStore.cloud;
    const eventos = [
      { id: "evn1", tipo: "charge.paid", valor_centavos: 15000, assinatura_id: "sub_hook_n", criado: "2026-08-01T10:00:00Z" },
      { id: "evn2", tipo: "charge.payment_failed", valor_centavos: 15000, assinatura_id: "sub_hook_n", criado: "2026-08-06T10:00:00Z" },
    ];
    window.MTStore.cloud = () => ({
      aid: "x",
      client: { from: () => ({ select: () => ({ in: () => ({ order: () => ({ limit: () => Promise.resolve({ data: eventos }) }) }) }) }) },
    });
    window.__pagAutoN();
    await new Promise((res) => setTimeout(res, 300));
    window.__pagAutoN();
    await new Promise((res) => setTimeout(res, 300));
    window.MTStore.cloud = window.__cloudOrigBN;
    const st2 = window.MTStore.read("ntStudio", {});
    const pgs = (st2.pagamentosN || []).filter((x) => x.eventoId === "evn1");
    const out = { n: pgs.length, valor: pgs[0] && pgs[0].valor, falhou: st2.pacientes[0].cartaoFalhouEm };
    delete st2.pacientes[0].assinaturaRec;
    st2.pacientes[0].cartaoFalhouEm = "";
    st2.pagamentosN = (st2.pagamentosN || []).filter((x) => !x.eventoId);
    window.MTStore.write("ntStudio", st2);
    return out;
  });
  ok(baixaN.n === 1 && baixaN.valor === 150 && !!baixaN.falhou, "webhook: consulta paga entra sozinha e recusa marca alerta no paciente");

  await p.evaluate(() => document.getElementById("pnFechar").click());
  // busca de paciente no topo abre o perfil
  await p.fill("#buscaPac", "bruno");
  await p.waitForTimeout(150);
  ok(await p.evaluate(() => !document.getElementById("buscaPacLista").hidden && /Bruno Paciente/.test(document.getElementById("buscaPacLista").textContent)), "busca no topo acha o paciente");
  await p.press("#buscaPac", "Enter");
  ok(await p.evaluate(() => document.getElementById("dlgPerfilN").open), "Enter na busca abre o perfil do paciente");
  await p.evaluate(() => document.getElementById("pnFechar").click());
  await p.fill("#buscaPac", "");

  // agenda no módulo: marcar consulta local (sub-abas Consultas/Marcar)
  await abaNt(p, "agenda");
  ok(await p.evaluate(() => document.querySelector('#agAbasN button.ativa').textContent.includes("Consultas")), "Agenda do Nutri abre na sub-aba Consultas");
  await p.evaluate(() => window.__agAbaN("marcar"));
  await p.selectOption("#cnPaciente", { index: 1 });
  await p.fill("#cnData", "2099-01-15");
  await p.fill("#cnHora", "10:30");
  await p.click("#cnAdd");
  await p.waitForTimeout(200);
  ok(await p.evaluate(() => !!document.querySelector("#calAgendaN .cal-dia")), "agenda do Nutri mostra o calendário do mês");
  await p.evaluate(() => window.__agDiaN("2099-01-15"));
  const consultasTxt = await p.evaluate(() => document.getElementById("listaConsultas").textContent);
  ok(/Bruno Paciente/.test(consultasTxt) && /10:30/.test(consultasTxt), "consulta marcada aparece na lista do módulo");

  // sincronizar com o calendário: exporta .ics das consultas futuras
  await p.evaluate(() => window.__agAbaN("consultas"));
  {
    const dl = p.waitForEvent("download", { timeout: 5000 }).catch(() => null);
    await p.click("#btnIcsN");
    const arq = await dl;
    ok(!!arq && /agenda-torque-nutri\.ics/.test(arq.suggestedFilename()), "botão 📅 baixa o arquivo .ics da agenda");
    if (arq) {
      const txt = fs.readFileSync(await arq.path(), "utf8");
      ok(/BEGIN:VCALENDAR/.test(txt) && /Consulta — Bruno Paciente/.test(txt), "arquivo .ics tem o evento da consulta");
    }
  }
  ok(await p.evaluate(() => { const st = JSON.parse(localStorage.getItem("mtapp:ntStudio")); return (st.consultas || []).length === 1; }), "consulta salva no ntStudio");

  // check-ins do paciente (questionários estilo LiveClin)
  console.log("Check-ins do paciente:");
  await abaNt(p, "quest");
  ok(await p.evaluate(() => !document.getElementById("vQuestN").hidden), "aba Check-ins abre");
  const qSeed = await p.evaluate(() => ({
    perguntas: document.getElementById("qpListaN").textContent,
    lista: document.getElementById("qqListaN").textContent,
  }));
  ok(/ADES/.test(qSeed.perguntas) && /FOME/.test(qSeed.perguntas) && /AGUA/.test(qSeed.perguntas) && /INTES/.test(qSeed.perguntas), "perguntas padrão de nutrição já vêm prontas (adesão, fome, intestino, água…)");
  ok(/Check-in semanal/.test(qSeed.lista), "check-in semanal montado sozinho na primeira visita");
  await p.evaluate(() => window.__qtAbaN("montar"));
  await p.fill("#qpSiglaN", "trein");
  await p.fill("#qpTituloN", "Treino");
  await p.selectOption("#qpTipoN", "linear");
  await p.fill("#qpTextoN", "De 0 a 10, quanto você treinou essa semana?");
  await p.click("#qpAddN");
  ok(/TREIN/.test(await p.evaluate(() => document.getElementById("qpListaN").textContent)), "pergunta nova salva com sigla em maiúsculas (TREIN)");
  await p.evaluate(() => window.__qtAbaN("enviar"));
  await p.selectOption("#qePacienteN", { index: 1 });
  await p.selectOption("#qeQuestN", { index: 1 });
  await p.click("#qeGerarN");
  const linkQN = await p.evaluate(() => document.getElementById("qeLinkN").value);
  ok(/quest\.html\?t=.+&q=/.test(linkQN), "link do check-in gerado com token e payload");
  ok(await p.evaluate(() => /Entre na sua conta/.test(document.getElementById("qeAvisoN").textContent)), "sem nuvem o gerador avisa que as respostas não chegam");
  const payloadQN = await p.evaluate(() => {
    const q = new URL(document.getElementById("qeLinkN").value).searchParams.get("q");
    return JSON.parse(decodeURIComponent(escape(atob(q.replace(/-/g, "+").replace(/_/g, "/")))));
  });
  ok(payloadQN.quem === "nutricionista" && payloadQN.tema === "verde" && payloadQN.ps.length >= 6, "payload leva tema verde e fala 'nutricionista' (não treinador)");
  // com nuvem: gerar o link publica o app do paciente junto
  {
    const pubN = await p.evaluate(async () => {
      window.__cloudOrig = window.MTStore.cloud;
      let upsertRow = null;
      window.MTStore.cloud = () => ({ aid: "acad-n", client: { from: (tb) => ({ upsert: (rows) => { upsertRow = { tb, row: rows[0] }; return Promise.resolve({ error: null }); } }) } });
      document.getElementById("qeGerarN").click();
      await new Promise((res) => setTimeout(res, 300));
      window.MTStore.cloud = window.__cloudOrig;
      const dd = upsertRow && upsertRow.row.dados;
      return { tb: upsertRow && upsertRow.tb, temHtml: !!(dd && dd.html && dd.html.length > 10000),
        tipo: dd && dd.dados && dd.dados.tipo, ver: dd && dd.ver, aviso: document.getElementById("qeAvisoN").textContent };
    });
    ok(pubN.tb === "app_aluno" && pubN.temHtml && /Tudo pronto/.test(pubN.aviso), "gerar com a nuvem publica o app do paciente junto");
    // fonte única (v661): o pacote leva {html, dados, ver} e dados.tipo = "nutri" —
    // é por esse tipo que o /app/ manda pro nutri-builder em vez do builder do aluno
    ok(pubN.tipo === "nutri" && !!pubN.ver, "o pacote publicado leva os DADOS (tipo nutri) e a versão do site — app deixa de congelar");
  }
  // o /app/ junta DADOS + código do site: um pacote nutri guardado no aparelho
  // abre pelo nutri-builder (e nunca cai no builder do aluno)
  {
    const pacoteJ = await p.evaluate(() => {
      const st = window.MTStore.read("ntStudio", {});
      return window.__pacoteAppN(st.pacientes[0], new Date().toISOString());
    });
    const pJ = await ctx.newPage();
    const errosJ = [];
    pJ.on("pageerror", (e) => errosJ.push(String(e)));
    await pJ.route("**/rest/v1/rpc/**", (r) => r.abort()); // sem nuvem: o caminho é a cópia local
    await pJ.goto(BASE + "/app/index.html");
    await pJ.evaluate((pac) => {
      localStorage.setItem("tq_app_token", pac.dados.p.appTokenN || "tok-join");
      localStorage.setItem("tq_app_pacote", JSON.stringify({ dados: pac.dados, html: "" }));
    }, pacoteJ);
    await pJ.reload({ waitUntil: "domcontentloaded" });
    await pJ.waitForFunction(() => window.__appNutri, null, { timeout: 8000 });
    const joinN = await pJ.evaluate(() => ({
      titulo: document.title,
      hero: !!document.getElementById("heroN"),
      xp: !!document.getElementById("xpNumN"),
    }));
    ok(joinN.hero && joinN.xp && errosJ.length === 0,
      "o /app/ montou o app do paciente a partir dos DADOS + nutri-builder.js do site, sem erro");
    await pJ.close();
  }
  // paciente abre o link: tema verde e texto falando do nutricionista
  {
    const pqn = await ctx.newPage();
    await pqn.goto(linkQN);
    const telaN = await pqn.evaluate(() => document.body.textContent);
    ok(/Check-in semanal/.test(telaN) && /nutricionista/.test(telaN) && /fome/i.test(telaN), "página do paciente mostra o check-in falando do nutricionista");
    ok(await pqn.evaluate(() => getComputedStyle(document.querySelector(".btnx")).backgroundImage.includes("22, 163, 74")), "botão de enviar fica verde (tema do Nutri)");
    await pqn.close();
  }
  // respostas aparecem no módulo (nuvem simulada)
  {
    await p.evaluate(() => {
      const st = window.MTStore.read("ntStudio", {});
      const pc = st.pacientes[0];
      window.__cloudOrig = window.MTStore.cloud;
      window.MTStore.cloud = () => ({ aid: "x", client: { from: () => ({ select: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [{
        token: pc.appTokenN, questionario: "Check-in semanal", criado: new Date().toISOString(),
        dados: { pontuacao: 3, respostas: [{ sigla: "FOME", resposta: "Bom", pontos: 1 }, { sigla: "AGUA", resposta: "2", pontos: 2 }] },
      }] }) }) }) }) } });
      window.__questNT.respostas();
    });
    await p.waitForTimeout(300);
    const respN = await p.evaluate(() => document.getElementById("qRespostasN").textContent);
    ok(/Bruno Paciente/.test(respN) && /\+3 pts/.test(respN) && /FOME/.test(respN), "resposta aparece com paciente, pontuação e siglas");
    await p.evaluate(() => { window.MTStore.cloud = window.__cloudOrig; });
  }

  // chat no módulo (sem conta: orienta; estrutura pronta)
  await abaNt(p, "chat");
  ok(await p.evaluate(() => !document.getElementById("vChatN").hidden), "aba Chat abre a tela de conversas");
  const chatTxt = await p.evaluate(() => document.getElementById("chatMsgsN").textContent);
  ok(/conta/.test(chatTxt) && /supabase-setup/.test(chatTxt), "sem conta, o chat orienta a ativar a nuvem");
  ok(await p.evaluate(() => !!window.__chatNT && typeof window.__chatNT.render === "function"), "chat do nutricionista exposto pra nuvem (render/abre)");
  await abaNt(p, "dietas");

  // abre o app e usa: água, refeição feita, peso
  const pApp = await ctx.newPage();
  const errosApp = [];
  pApp.on("pageerror", (e) => errosApp.push(String(e)));
  await pApp.route("**/app-teste-nutri.html", (r) => r.fulfill({ contentType: "text/html", body: appHtml }));
  await pApp.route("**/rest/v1/rpc/**", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, login: "bruno@email.com" }) }));
  await pApp.goto(BASE + "/app-teste-nutri.html", { waitUntil: "domcontentloaded" });
  await pApp.waitForFunction(() => window.__appNutri);
  // barra fixa nova: água/refeições/diário vivem na aba Dieta
  await pApp.evaluate(() => window.__trocaSecN("dieta"));
  // 🆙 água agora pontua no XP: o 1º copo do dia cria o dia de água (+2 XP) —
  // antes lia a chave morta 'ntagua' e água nunca contava
  const xpAntesAgua = await pApp.evaluate(() => +document.getElementById("xpNumN").textContent);
  await pApp.click("#agAdd");
  await pApp.waitForTimeout(150);
  const xpDepoisAgua = await pApp.evaluate(() => +document.getElementById("xpNumN").textContent);
  ok(xpDepoisAgua === xpAntesAgua + 2, "o primeiro copo do dia rende +2 XP (" + xpAntesAgua + " → " + xpDepoisAgua + ")");
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
  await pApp.evaluate(() => window.__trocaSecN("evolucao"));
  await pApp.fill("#pzKg", "79,5");
  await pApp.click("#pzAdd");
  const pz = await pApp.evaluate(() => document.getElementById("pzGraf").textContent);
  ok(/79,5/.test(pz), "peso registrado no app");
  // 🆙 nível: selo no topo bate com a curva 50·(n−1)·n e o card das Conquistas explica
  const nvN = await pApp.evaluate(() => ({
    xp: +document.getElementById("xpNumN").textContent,
    nv: +document.getElementById("nvNumN").textContent,
    card: (document.getElementById("nvCardN") || {}).textContent.replace(/\s+/g, " "),
  }));
  const nvEsperado = (function (xp) { let n = 1; while (50 * n * (n + 1) <= xp) n++; return n; })(nvN.xp);
  ok(nvN.nv === nvEsperado, "o selo Nv bate com o XP pela curva (" + nvN.xp + " XP → Nv " + nvEsperado + ")");
  ok(/Nível \d+ — /.test(nvN.card) && /faltam \d+ pro nível/.test(nvN.card) && /dia no plano \+10 XP/.test(nvN.card),
    "o card Seu nível mostra título, progresso e como se ganha XP");
  // login do aluno no app (card do Início)
  await pApp.evaluate(() => window.__trocaSecN("inicio"));
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

  // blog de receitas fitness
  console.log("Receitas fitness (blog):");
  await abaNt(p, "receitas");
  const totalRc = await p.evaluate(() => window.__receitas.total());
  ok(totalRc >= 20, "banco de receitas tem 20+ receitas (" + totalRc + ")");
  let rcTxt = await p.evaluate(() => document.getElementById("rcLista").textContent);
  ok(/Panqueca de banana com aveia/.test(rcTxt) && /kcal/.test(rcTxt), "receitas listadas com macros por porção");
  await p.fill("#rcBusca", "atum");
  rcTxt = await p.evaluate(() => document.getElementById("rcLista").textContent);
  ok(/atum/i.test(rcTxt) && !/Panqueca de banana/.test(rcTxt), "busca por ingrediente filtra as receitas");
  await p.fill("#rcBusca", "");
  await p.selectOption("#rcCat", "Doces fit");
  rcTxt = await p.evaluate(() => document.getElementById("rcLista").textContent);
  ok(/Mousse de chocolate com abacate/.test(rcTxt), "filtro por categoria funciona (Doces fit)");
  await p.evaluate(() => { window.alert = () => {}; });
  await p.click("#rcLista details summary"); // abre a primeira receita do filtro
  await p.click('[data-rcusa]');
  const rcAlim = await p.evaluate(() => JSON.parse(localStorage.getItem("mtapp:ntStudio")).alimentos.find((a) => /^Receita: /.test(a.nome)));
  ok(!!rcAlim && rcAlim.kcal > 0 && rcAlim.porcao === "1 porção", "'+ Usar na dieta' vira alimento com kcal por porção");
  rcTxt = await p.evaluate(() => document.getElementById("rcLista").textContent);
  ok(/Já está no seu banco de alimentos/.test(rcTxt), "receita usada mostra que já está no banco");
  const rcIds = await p.evaluate(() => (self.MT_RECEITAS || []).map((r) => r.id));
  const rcNomes = await p.evaluate(() => (self.MT_RECEITAS || []).map((r) => r.n));
  ok(new Set(rcIds).size === rcIds.length && new Set(rcNomes).size === rcNomes.length, "ids e nomes de receitas são únicos");
  const rcCampos = await p.evaluate(() => (self.MT_RECEITAS || []).every((r) => r.n && r.cat && r.k > 0 && r.pt >= 0 && r.ing.length >= 2 && r.modo.length >= 2 && r.dica));
  ok(rcCampos, "toda receita tem ingredientes, preparo, macros e dica");

  // site comercial tem o segmento
  const pSite = await ctx.newPage();
  await pSite.goto(BASE + "/torqueon.html");
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

  // ---------- 🥦 IA de dieta (função chat-envia mockada) ----------
  console.log("IA de dieta:");
  {
    const ia = await p.evaluate(async () => {
      const st = window.MTStore.read("ntStudio", {});
      const pid = st.pacientes[0].id;
      const semNuvem = await new Promise((res) => window.__iaDieta(pid, res));
      window.__cloudOrigIA = window.MTStore.cloud;
      window.__fetchOrigIA = window.fetch;
      window.MTStore.cloud = () => ({ aid: "x", client: { auth: { getSession: () => Promise.resolve({ data: { session: { access_token: "tok" } } }) } } });
      const arroz = self.MT_ALIMENTOS.find((a) => /Arroz branco cozido/i.test(a.n)).n;
      const frango = self.MT_ALIMENTOS.find((a) => /Peito de frango grelhado/i.test(a.n)).n;
      let corpo = null;
      window.fetch = (url, opts) => {
        if (String(url).includes("functions/v1/chat-envia")) {
          corpo = JSON.parse(opts.body);
          const plano = { refeicoes: [
            { hora: "12:30", titulo: "Almoço", itens: [{ nome: arroz, qtd: 1.5 }, { nome: frango, qtd: 2 }, { nome: "Comida Inventada Xyz", qtd: 1 }] },
            { hora: "07:00", titulo: "Café da manhã", itens: [{ nome: arroz, qtd: 1 }] },
          ], resumo: "Plano com proteína distribuída ao longo do dia." };
          return Promise.resolve({ status: 200, text: () => Promise.resolve(JSON.stringify({ ok: true, texto: "```json\n" + JSON.stringify(plano) + "\n```" })) });
        }
        return window.__fetchOrigIA(url, opts);
      };
      const comNuvem = await new Promise((res) => window.__iaDieta(pid, res));
      window.fetch = window.__fetchOrigIA;
      window.MTStore.cloud = window.__cloudOrigIA;
      const d = window.MTStore.read("ntStudio", {}).dietas[pid];
      return { semNuvem, comNuvem, corpo,
        d: { refs: d.refeicoes.length, primeira: d.refeicoes[0].titulo, itens0: d.refeicoes[0].itens.length,
          qtd: d.refeicoes[1].itens[0].qtd, geradaIA: d.geradaIA } };
    });
    ok(/Entre na sua conta/.test(ia.semNuvem.erro), "🥦 sem nuvem a IA de dieta explica o que falta");
    ok(ia.corpo.acao === "ia_dieta" && /ALVO DIÁRIO/.test(ia.corpo.dados) && /RESTRIÇÕES/.test(ia.corpo.dados) && /CATÁLOGO DISPONÍVEL/.test(ia.corpo.dados),
      "perfil, alvos e catálogo viajam pra função chat-envia (ação ia_dieta)");
    ok(ia.comNuvem.ok && ia.comNuvem.refeicoes === 2 && ia.comNuvem.itens === 3 && ia.comNuvem.ignorados === 1,
      "🥦 IA monta o plano e o alimento inventado é descartado");
    ok(ia.d.geradaIA && ia.d.primeira === "Café da manhã" && ia.d.qtd === 1.5,
      "plano entra na dieta ordenado por horário e com a quantidade da IA");
    ok(typeof ia.comNuvem.kcal === "number" && ia.comNuvem.kcal > 0 && /proteína distribuída/.test(ia.comNuvem.resumo),
      "o nutricionista recebe as kcal somadas e o resumo da IA pra revisar");

    // parse robusto + a ordem do catálogo protege o que o nutricionista cadastrou
    const extras = await p.evaluate(() => {
      const st = window.MTStore.read("ntStudio", {});
      const alimentosAntes = st.alimentos || [];
      st.alimentos = [{ id: "meu1", nome: "Bolo fit da casa", porcao: "1 fatia", kcal: 180 }];
      window.MTStore.write("ntStudio", st);
      const dados = window.__iaDietaDados(st.pacientes[0]);
      st.alimentos = alimentosAntes;               // não vaza pros testes seguintes
      window.MTStore.write("ntStudio", st);
      return {
        prosa: window.__iaParse('Plano: {"refeicoes":[{"titulo":"Almoço"}]}\nDica: ajuste a {porção} se precisar.'),
        posMeus: dados.indexOf("Meus alimentos"),
        posCatalogo: dados.indexOf("Frutas"),
      };
    });
    ok(extras.prosa && extras.prosa.refeicoes.length === 1,
      "a resposta da IA com comentário depois do JSON continua sendo lida");
    ok(extras.posMeus >= 0 && extras.posCatalogo > extras.posMeus,
      "os 'Meus alimentos' entram ANTES do catálogo gigante — corte por tamanho nunca come o que é do nutricionista");
  }

  {
    // 🎮 app do paciente com a cara do app do aluno: XP, semana, meta e Comunidade
    console.log("App do paciente (paridade com o app do aluno):");
    const pG = await b.newPage();
    pG.on("pageerror", (e) => erros.push("app nutri: " + e.message));
    await pG.goto(BASE + "/nutricao.html");
    await pG.evaluate(() => {
      localStorage.setItem("mtapp:ntSemConta", "1");
      localStorage.setItem("mtapp:ntStudio", JSON.stringify({
        config: { nome: "Consultório Teste" }, pacientes: [], dietas: {}, alimentos: [], catalogoOff: {},
      }));
    });
    await pG.reload();
    await pG.waitForTimeout(600);

    const gera = (feedOn) => pG.evaluate((liga) => {
      const S = window.MTStore;
      const st = S.read("ntStudio", {});
      st.config.feedOn = liga;
      const pac = { id: "pg1", nome: "Fernanda Lima", sexo: "F", idade: 34, peso: 72, altura: 165,
        atividade: "mod", objetivo: "emagrecer", ativo: true, appTokenN: "tok-teste-nutri-1", metaSemana: 5 };
      st.pacientes = [pac];
      S.write("ntStudio", st);
      return window.__montaAppNutri(pac, "s1");
    }, feedOn);

    // 1) gamificação entra mesmo com a Comunidade desligada
    const semFeed = await gera(false);
    ok(/xpNumN/.test(semFeed) && /diasSemN/.test(semFeed) && /btnPlanoN/.test(semFeed),
      "🎮 o app do paciente ganha XP, semana e o botão 'Segui o plano hoje!'");
    ok(/nvChipN/.test(semFeed) && /nvCardN/.test(semFeed) && /nivelDeN/.test(semFeed),
      "🆙 e o sistema de níveis vai junto (selo, card e curva)");
    ok(/heroN/.test(semFeed) && /Ver minhas refeições/.test(semFeed),
      "o card da meta do dia abre o app, como o card do treino no app do aluno");
    ok(!/fdListaN/.test(semFeed), "com a Comunidade desligada o app sai sem o feed");
    // XP do diário tem que ser CUMULATIVO como as outras parcelas: contando só o dia
    // de hoje, o paciente perdia XP e o nível VOLTAVA à meia-noite
    ok(/diasCom\('ntdi_'\)/.test(semFeed) && !/di=\(L\('ntdi_'\+isoHj\(\),\[\]\)\|\|\[\]\)\.length/.test(semFeed),
      "🆙 o XP do diário soma todos os dias (não zera na virada da meia-noite)");

    // 2) com a Comunidade ligada, entra o feed e a aba Turma
    const comFeed = await gera(true);
    ok(/fdListaN/.test(comFeed) && /'Turma'/.test(comFeed), "ligar a Comunidade põe o feed e a aba Turma no app do paciente");
    ok(/app_aluno_posta/.test(comFeed) && /app_aluno_feed/.test(comFeed) && /'feed:'\+/.test(comFeed),
      "o paciente usa as mesmas RPCs do aluno (app_aluno_posta/feed + reage com 'feed:<id>')");
    ok(/nivel:nivelDeN\(xpDadosN\(\)\)/.test(comFeed) && comFeed.indexOf("+(+p2.nivel)") > -1,
      "🆙 o app devolve o nível pra nuvem e mostra o selo Nv do autor nos posts da Turma");
    ok(/app_desafio_ranking/.test(comFeed), "o ranking da semana conta os dias de 'Segui o plano hoje!'");

    // 3) a chave nas Configurações do nutricionista
    const chave = await pG.evaluate(() => {
      const el = document.getElementById("cfgFeedN");
      return { existe: !!el, marcado: el ? el.checked : null };
    });
    ok(chave.existe && chave.marcado === true, "a chave Comunidade aparece nas Configurações do nutricionista");
    await pG.evaluate(() => localStorage.removeItem("mtapp:ntStudio"));
    await pG.close();
  }
  {
    // 🩺 painel do nutricionista com as ferramentas do Personal
    console.log("Painel do nutricionista (paridade com o Personal):");
    const pN = await b.newPage();
    pN.on("pageerror", (e) => erros.push("painel nutri: " + e.message));
    pN.on("dialog", (d) => d.accept());
    await pN.goto(BASE + "/nutricao.html");
    await pN.evaluate(() => {
      localStorage.setItem("mtapp:ntSemConta", "1");
      const iso = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
      const st = { config: { nome: "Consultório Q" }, pacientes: [], dietas: {}, alimentos: [], catalogoOff: {},
        consultas: [], pagamentosN: [], pesagens: {} };
      for (let i = 0; i < 5; i++) {
        const id = "q" + i;
        st.pacientes.push({ id, nome: "Paciente Q" + i, sexo: "F", idade: 30, peso: 70, altura: 165,
          atividade: "mod", objetivo: "manter", ativo: true, zap: "31999990000", desde: iso(120) });
        if (i < 3) st.dietas[id] = { refeicoes: [{ id: "r", hora: "08:00", titulo: "Café", itens: [] }] };
        if (i < 2) st.pagamentosN.push({ id: "pgq" + i, pacienteId: id, valor: 200, data: iso(1) });
      }
      // q0 tem consulta hoje; q4 sumiu há 90 dias
      st.consultas.push({ id: "cq0", pacienteId: "q0", data: iso(0), hora: "09:00" });
      st.consultas.push({ id: "cq4", pacienteId: "q4", data: iso(90), hora: "09:00" });
      localStorage.setItem("mtapp:ntStudio", JSON.stringify(st));
    });
    await pN.reload();
    await pN.waitForTimeout(800);

    // 1) filtro + paginação + etiqueta de pagamento na lista
    const lista = await pN.evaluate(() => {
      const rot = [...document.querySelectorAll("#pacFiltro button")].map((b) => b.textContent);
      window.__pacFiltro("devendo");
      const devendo = document.querySelectorAll("#listaPacientes .pac").length;
      window.__pacFiltro("semdieta");
      const semDieta = document.querySelectorAll("#listaPacientes .pac").length;
      window.__pacFiltro("todos");
      return { rot, devendo, semDieta, pago: /pago no mês/.test(document.getElementById("listaPacientes").textContent) };
    });
    ok(/Todos \(5\)/.test(lista.rot[0]) && lista.devendo === 3 && lista.semDieta === 2,
      "🩺 a lista de pacientes filtra por sem dieta e sem pagamento, com o contador no botão");
    ok(lista.pago, "cada paciente mostra se já pagou o mês");

    // 2) consulta feita × faltou e o card do dia
    const dia = await pN.evaluate(() => {
      const antes = document.getElementById("bHojeN").textContent.replace(/\s+/g, " ");
      const bt = document.querySelector("#bHojeN [data-cfeita]");
      if (bt) bt.click();
      const st = JSON.parse(localStorage.getItem("mtapp:ntStudio"));
      return { antes, feita: (st.consultas.find((c) => c.id === "cq0") || {}).feita,
        depois: document.getElementById("bHojeN").textContent.replace(/\s+/g, " ") };
    });
    ok(/09:00/.test(dia.antes) && dia.feita === true && /feita/.test(dia.depois),
      "'Seu dia hoje' lista a agenda do dia e marca a consulta como feita");

    // 3) radar de retenção com o zap na mão
    const radar = await pN.evaluate(() => ({
      texto: document.getElementById("bRadarN").textContent.replace(/\s+/g, " "),
      linhas: document.querySelectorAll("#bRadarN [data-pacperfil]").length,
      zap: !!document.querySelector("#bRadarN a.whats"),
    }));
    ok(/Paciente Q4/.test(radar.texto) && /há 90 dias/.test(radar.texto) && radar.zap && radar.linhas >= 1,
      "o radar mostra quem sumiu (Q4, há 90 dias) com o botão de chamar no zap");

    // 4) alimento desativado não volta pela IA nem pelo gerador
    const cur = await pN.evaluate(() => {
      const S2 = window.MTStore;
      const st = S2.read("ntStudio", {});
      st.catalogoOff = { "Arroz branco cozido": true };
      S2.write("ntStudio", st);
      const dados = window.__iaDietaDados ? window.__iaDietaDados(st.pacientes[0]) : "";
      return { noPrompt: /Arroz branco cozido/.test(dados), achou: !!window.__alimPorNome("Arroz branco cozido") };
    });
    ok(!cur.noPrompt && !cur.achou, "alimento desativado na curadoria não volta pela IA nem pelo gerador");

    // 5) favoritos de alimentos
    const fav = await pN.evaluate(() => {
      window.__favN.alterna("Banana prata");
      return { lista: window.__favN.lista(), eh: window.__favN.eh("banana PRATA") };
    });
    ok(fav.lista.length === 1 && fav.eh, "★ favoritos de alimentos ligam e desligam (e não olham maiúscula)");

    // 6) prontuário e anamnese no perfil
    const perfil = await pN.evaluate(() => {
      window.__perfilNT("q0");
      document.getElementById("pnDiarioTxt").value = "Relatou fome à noite";
      document.getElementById("pnDiarioAdd").click();
      document.getElementById("anDoencas").value = "hipertensão";
      document.getElementById("pnAnSalvar").click();
      const st = JSON.parse(localStorage.getItem("mtapp:ntStudio"));
      const p0 = st.pacientes.find((x) => x.id === "q0");
      return {
        anotacoes: (st.diarioN.q0 || []).length,
        naTela: /fome à noite/.test(document.getElementById("pnDiarioLista").textContent),
        anamnese: (p0.anamnese || {}).doencas,
        badge: document.getElementById("pnAnBadge").textContent,
        temSexo: !!document.getElementById("pnSexo"),
        macros: /P \d+ g/.test(document.getElementById("pnAlvo").textContent),
      };
    });
    ok(perfil.anotacoes === 1 && perfil.naTela, "o prontuário guarda a conduta da consulta e mostra na hora");
    ok(perfil.anamnese === "hipertensão" && /atenção/.test(perfil.badge), "a anamnese salva e acende o alerta de doença/medicamento");
    ok(perfil.temSexo && perfil.macros, "o perfil deixa corrigir sexo/peso/atividade e mostra os macros do alvo");

    // 7) backup na aba Sua ilha
    const bk = await pN.evaluate(() => ({ botao: !!document.getElementById("btnBackupN"), aviso: (document.getElementById("bkAvisoN") || {}).textContent || "" }));
    ok(bk.botao && /backup/i.test(bk.aviso), "a aba Sua ilha ganha o backup .json com aviso de quando foi o último");

    // 8) gráfico de evolução de peso (id próprio, sem brigar com o campo Peso do cadastro)
    const evo = await pN.evaluate(() => {
      const S2 = window.MTStore;
      const st = S2.read("ntStudio", {});
      st.pesagens = st.pesagens || {};
      st.pesagens.q0 = [{ d: "2026-06-01", kg: 71 }, { d: "2026-07-01", kg: 69.5 }, { d: "2026-08-01", kg: 68 }];
      S2.write("ntStudio", st);
      window.__perfilNT("q0");
      const graf = document.getElementById("pnPesoGraf");
      const campo = document.getElementById("pnPeso");
      return {
        temGrafico: !!graf && graf.innerHTML.length > 100,
        texto: graf ? graf.textContent : "",
        campoEhInput: campo ? campo.tagName : "",
        campoValor: campo ? campo.value : "",
      };
    });
    ok(evo.temGrafico && /Variação/.test(evo.texto), "a evolução de peso do paciente desenha o gráfico das pesagens");
    ok(evo.campoEhInput === "INPUT" && evo.campoValor !== "", "o campo Peso do cadastro continua sendo o input (sem id repetido)");

    // 9) Financeiro consolidado (espelho da tela 2e do Personal)
    const fin = await pN.evaluate(() => {
      document.getElementById("dlgPerfilN").close();
      const S2 = window.MTStore;
      const st = S2.read("ntStudio", {});
      st.config.diaCobraN = 1; // ancora no dia 1: o mês "venceu" em qualquer dia do teste
      st.config.pixValor = 180;
      st.config.pixChave = "consultorio@pix.com";
      st.pagamentosN.push({ id: "pgHoje", pacienteId: "q0", valor: 250, data: S2.todayISO() });
      S2.write("ntStudio", st);
      document.querySelector('#abasNt button[data-a="financeiro"]').click();
      const at = window.__finN.atrasados(S2.read("ntStudio", {}), S2.todayISO());
      return {
        visivel: !document.getElementById("vFinanceiroN").hidden,
        atrasados: at.length,
        valor: at[0] && at[0].valor,
        linhas: document.querySelectorAll("#fnAtrasados .fnatrlin").length,
        cobrarTodos: !!document.getElementById("fnCobrarTodos"),
        temPix: !!document.querySelector("#fnAtrasados [data-fnpix]"),
        temLink: !!document.querySelector("#fnAtrasados [data-fnpgm]"),
        barras: document.querySelectorAll("#fn6meses .fnbar").length,
        hachura: /repeating-linear-gradient/.test(document.getElementById("fn6meses").innerHTML),
        como: document.getElementById("fnComo").textContent.replace(/\s+/g, " "),
        hoje: document.getElementById("fnHoje").textContent.replace(/\s+/g, " "),
        recibos: document.querySelectorAll("#fnHistorico [data-recibo]").length,
        clamp: window.__finN.diaCobra({ config: { diaCobraN: 99 } }),
      };
    });
    ok(fin.visivel && fin.atrasados === 3 && fin.valor === 180 && fin.linhas === 3,
      "💰 o Financeiro abre com os 3 atrasados (mesma régua do Resolver hoje) e a consulta padrão como valor");
    ok(fin.cobrarTodos && fin.temPix && fin.temLink,
      "cada atrasado tem Link/Pix/Recebi na linha, e o Cobrar todos aparece quando é mais de um");
    ok(fin.barras === 6 && fin.hachura, "os últimos 6 meses viram barras, com o mês corrente hachurado (projeção)");
    ok(/Pix/.test(fin.como) && /\+\s*R\$\s*250/.test(fin.hoje) && fin.recibos === 3 && fin.clamp === 10,
      "'Como você recebe' lista o Pix, 'Entrou hoje' soma o dia e o histórico dá o recibo de cada pagamento");

    // 10) Recebi na linha registra o pagamento e a linha some na hora
    await pN.evaluate(() => { document.querySelector("#fnAtrasados [data-fnreceb]").click(); });
    await pN.waitForTimeout(150);
    const receb = await pN.evaluate(() => ({
      pagos: (window.MTStore.read("ntStudio", {}).pagamentosN || []).length,
      linhas: document.querySelectorAll("#fnAtrasados .fnatrlin").length,
    }));
    ok(receb.pagos === 4 && receb.linhas === 2, "o Recebi da linha grava o pagamento e o atrasado sai do bloco na hora");

    // 11) Pix na mão: QR + copia-e-cola com a chave do consultório
    const pix = await pN.evaluate(() => {
      document.querySelector("#fnAtrasados [data-fnpix]").click();
      const code = document.getElementById("pixNCode").value;
      const aberto = document.getElementById("dlgPixN").open;
      document.getElementById("pixNFechar").click();
      return { aberto, payload: /br\.gov\.bcb\.pix/.test(code) && /180\.00/.test(code) && /consultorio@pix\.com/.test(code) };
    });
    ok(pix.aberto && pix.payload, "o botão Pix abre o copia-e-cola com a chave e o valor certos");

    // 12) régua de cobrança: a chave desliga de verdade
    const regua = await pN.evaluate(() => {
      const S2 = window.MTStore;
      document.getElementById("fnReguaOn").click(); // desliga
      const off = S2.read("ntStudio", {}).config.reguaOffN;
      document.getElementById("fnReguaOn").click(); // religa
      const on = S2.read("ntStudio", {}).config.reguaOffN;
      return { off, on, aviso: document.getElementById("fnReguaStatus").textContent };
    });
    ok(regua.off === true && !regua.on && regua.aviso.length > 5,
      "a régua de cobrança liga e desliga pela chave, com o status dito em português");

    await pN.evaluate(() => localStorage.removeItem("mtapp:ntStudio"));
    await pN.close();
  }
  {
    // 📏 avaliação física: painel registra, app do paciente mostra a evolução
    console.log("Avaliação física (paridade com o Personal):");
    const pA2 = await b.newPage();
    pA2.on("pageerror", (e) => erros.push("aval nutri: " + e.message));
    pA2.on("dialog", (d) => d.accept());
    await pA2.goto(BASE + "/nutricao.html");
    await pA2.evaluate(() => {
      localStorage.setItem("mtapp:ntSemConta", "1");
      localStorage.setItem("mtapp:ntStudio", JSON.stringify({
        config: { nome: "C aval" },
        pacientes: [{ id: "av1", nome: "Marina Teste", sexo: "F", idade: 31, peso: 74.6, altura: 166,
          atividade: "mod", objetivo: "emagrecer", ativo: true, appTokenN: "tok-aval" }],
        dietas: {}, alimentos: [], catalogoOff: {}, pesagens: {}, consultas: [], pagamentosN: [],
      }));
    });
    await pA2.reload();
    await pA2.waitForTimeout(700);

    const av = await pA2.evaluate(() => {
      window.__perfilNT("av1");
      const set = (id, v) => { document.getElementById(id).value = v; };
      const iso = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
      set("avnData", iso(90)); set("avnPeso", "74,6"); set("avnGord", "32"); set("avnCintura", "88"); set("avnQuadril", "104"); set("avnBraco", "28");
      document.getElementById("avnAdd").click();
      set("avnData", iso(0)); set("avnPeso", "68,4"); set("avnGord", "27"); set("avnCintura", "79"); set("avnQuadril", "99"); set("avnBraco", "29");
      document.getElementById("avnAdd").click();
      const st = JSON.parse(localStorage.getItem("mtapp:ntStudio"));
      return {
        n: st.avaliacoesN.length,
        pesoCadastro: st.pacientes[0].peso,
        pesagens: (st.pesagens.av1 || []).length,
        calc: document.getElementById("avnCalc").textContent.replace(/\s+/g, " "),
        resumo: document.getElementById("avnLista").textContent.replace(/\s+/g, " "),
      };
    });
    ok(av.n === 2 && av.pesoCadastro === 68.4 && av.pesagens === 2,
      "📏 a avaliação guarda as medidas, vira pesagem e atualiza o peso do cadastro");
    ok(/IMC 24,8/.test(av.calc) && /peso normal/.test(av.calc) && /RCQ 0,8/.test(av.calc),
      "IMC e relação cintura-quadril saem calculados, com a classificação");
    // a aba tem que usar a MESMA escala do laudo impresso pelo botão ao lado
    const rcqIgual = await pA2.evaluate(() => {
      const casos = [["F", 70, 85], ["F", 76, 85], ["F", 74, 85], ["M", 88, 100], ["M", 95, 100], ["M", 105, 100]];
      return casos.map((c) => {
        const meu = window.__avalN.rcq(c[1], c[2], c[0]);
        const motor = window.MT_CORPO.calcula({ sexo: c[0], peso: 70, altura: 170, idade: 30,
          circ: { cintura: c[1], quadril: c[2] } });
        return meu.risco === "risco " + motor.riscoRcq;
      });
    });
    ok(rcqIgual.every(Boolean),
      "o risco cintura-quadril da aba bate com o do laudo impresso (escala única de 3 níveis)");
    ok(/peso \(kg\) -6,2/.test(av.resumo) && /cintura \(cm\) -9/.test(av.resumo) && /bra\u00e7o \(cm\) \+1/.test(av.resumo),
      "o resumo mostra o que mudou da primeira à última avaliação");

    // o app do paciente recebe as avaliações
    const appAv = await pA2.evaluate(() => {
      const st = JSON.parse(localStorage.getItem("mtapp:ntStudio"));
      const h = window.__montaAppNutri(st.pacientes[0], "s1");
      return { card: /avnBoxApp/.test(h), avsn: /var AVSN=/.test(h), temMedidas: /Quadril \(cm\)/.test(h) };
    });
    ok(appAv.card && appAv.avsn && appAv.temMedidas, "o app do paciente ganha o card 'Minha avaliação física' com as medidas");

    // sem avaliação nenhuma, o app explica em vez de mostrar tabela vazia
    const vazio = await pA2.evaluate(() => {
      const S2 = window.MTStore;
      const st = S2.read("ntStudio", {});
      st.avaliacoesN = [];
      S2.write("ntStudio", st);
      const h = window.__montaAppNutri(st.pacientes[0], "s2");
      return /Suas medidas aparecem aqui/.test(h);
    });
    ok(vazio, "sem avaliação, o app avisa que as medidas entram na consulta");

    // 🧪 laudo completo de composição corporal
    const laudo = await pA2.evaluate(() => {
      const S2 = window.MTStore;
      const st = S2.read("ntStudio", {});
      st.avaliacoesN = [{ id: "L1", pacienteId: "av1", data: "2026-08-12", peso: 68.4, gordura: 27, cintura: 79, quadril: 99 }];
      S2.write("ntStudio", st);
      const p0 = st.pacientes[0];
      const l = window.__laudoN.calcula(st, p0, st.avaliacoesN[0]);
      const html = window.MT_CORPO.laudoHtml(l, { nome: p0.nome, quando: "2026-08-12", marca: "TORQUE NUTRI" });
      window.__perfilNT("av1");
      return {
        massaGordura: l.massaGordura, massaMagra: l.massaMagra, agua: l.agua,
        proteina: l.proteina, mineral: l.mineral, mme: l.mme, smi: l.smi,
        tmb: l.tmb, imc: l.imc, pontuacao: l.pontuacao, estimado: l.estimado,
        htmlTemBlocos: /Composição corporal/.test(html) && /Controle de peso/.test(html) &&
          /Gasto calórico em 30 minutos/.test(html) && /Metabolismo basal/.test(html),
        naTela: (document.getElementById("avnLaudo") || {}).textContent.replace(/\s+/g, " "),
      };
    });
    // 68,4 kg com 27% de gordura: 18,5 kg de gordura e 49,9 kg de massa magra
    ok(laudo.massaGordura === 18.5 && laudo.massaMagra === 49.9 && laudo.agua === 36.5 && laudo.proteina === 10,
      "🧪 o laudo separa gordura, massa magra, água e proteína a partir do % de gordura");
    ok(laudo.mme > 20 && laudo.smi > 5 && laudo.tmb > 1000 && laudo.imc === 24.8 && laudo.pontuacao > 0,
      "músculo, índice muscular, metabolismo basal, IMC e pontuação saem calculados");
    ok(laudo.htmlTemBlocos, "o laudo imprimível traz composição, controle de peso, gasto calórico e metabolismo");
    ok(/Laudo completo/.test(laudo.naTela) && /Pontuação/.test(laudo.naTela) && laudo.estimado,
      "o perfil mostra o resumo do laudo com o botão de imprimir, marcado como estimativa");

    // com a bioimpedância digitada, os valores medidos vencem os estimados
    const bia = await pA2.evaluate(() => {
      const S2 = window.MTStore;
      const st = S2.read("ntStudio", {});
      st.avaliacoesN = [{ id: "L2", pacienteId: "av1", data: "2026-08-12", peso: 68.4,
        bia: { agua: 40.2, proteina: 11.1, mineral: 3.6, massaGordura: 13.5, mme: 29.4, visceral: 6, anguloFase: 5.9 } }];
      S2.write("ntStudio", st);
      const l = window.__laudoN.calcula(st, st.pacientes[0], st.avaliacoesN[0]);
      const html = window.MT_CORPO.laudoHtml(l, { nome: "x", marca: "TORQUE NUTRI" });
      return { agua: l.agua, mme: l.mme, gordura: l.gordura, visceral: l.visceral,
        estimado: l.estimado, temVisceral: /Gordura visceral/.test(html), temAngulo: /Ângulo de fase/.test(html) };
    });
    ok(bia.agua === 40.2 && bia.mme === 29.4 && bia.gordura === 19.7 && !bia.estimado,
      "⚖️ os números da bioimpedância entram no lugar das estimativas e o laudo deixa de ser estimado");
    ok(bia.visceral === 6 && bia.temVisceral && bia.temAngulo,
      "gordura visceral e ângulo de fase entram no laudo quando o aparelho mede");

    await pA2.evaluate(() => localStorage.removeItem("mtapp:ntStudio"));
    await pA2.close();
  }

  {
    // versão à vista + saída de emergência: quem instala o Nutri na tela
    // inicial abre esta página direto, e sem isso fica preso na versão velha
    const pV = await b.newPage();
    pV.on("pageerror", (e) => erros.push("versao: " + e.message));
    await pV.goto(BASE + "/nutricao.html");
    await pV.waitForTimeout(900);
    const v = await pV.evaluate(() => ({
      mostrada: (document.getElementById("cfgVersaoN") || {}).textContent,
      global: window.MT_VERSAO,
      botao: !!document.getElementById("cfgAtualizaN"),
      atualiza: typeof window.MT_ATUALIZA === "function",
    }));
    ok(/^mt-v\d+$/.test(v.mostrada) && v.mostrada === v.global,
      "as Configurações do Nutri mostram a versão que está rodando (" + v.mostrada + ")");
    ok(v.botao && v.atualiza, "e o botão de baixar a versão nova está ligado");
    await pV.close();
  }
  ok(erros.length === 0, "nenhuma página com erro de JS" + (erros.length ? " — " + erros[0] : ""));

  await b.close();
  console.log(falhas ? "\n💥 " + falhas + " FALHA(S)" : "\n🏁 TUDO PASSOU");
  process.exit(falhas ? 1 : 0);
})();
