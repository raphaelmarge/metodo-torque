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
  await p.click("#btnMenuNt");
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
  ok(/gerada automática/.test(resumo) && /revise/.test(resumo), "etiqueta honesta: gerada automática — revise");
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
  ok(/chMsgs/.test(appHtml) && /chEnvia/.test(appHtml) && /app_chat_lista/.test(appHtml) && /app_chat_envia/.test(appHtml), "app do paciente tem o chat interno (mesma nuvem do personal)");
  ok(/Agenda<\/h2>/.test(appHtml) && /agCal/.test(appHtml) && /app_agenda_pede/.test(appHtml) && /app_agenda_lista/.test(appHtml), "app do paciente tem agenda estilo calendário com pedido de horário");
  ok(/data-agics/.test(appHtml) && /AGTIT/.test(appHtml), "horário confirmado no app tem o botão 📅 salvar no calendário");
  ok(/Conquistas<\/h2>/.test(appHtml) && /cqGrid/.test(appHtml) && /Adesão à dieta/.test(appHtml), "app do paciente tem conquistas com gráfico de adesão");
  ok(/Dia perfeito/.test(appHtml) && /7 dias de água/.test(appHtml) && /10 pesagens/.test(appHtml), "medalhas de adesão, água e pesagens no app");
  ok(/botChips/.test(appHtml) && /🤖 assistente/.test(appHtml) && /botEscolhe/.test(appHtml), "app do paciente tem o robô de atendimento (chatbot de menu)");
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
    peso: document.getElementById("pnPeso").textContent,
    st: window.MTStore.read("ntStudio", {}),
  }));
  ok(/R\$ 150,00/.test(perfilN.fin), "pagamento de consulta registrado (R$ 150)");
  ok(/78,5 kg/.test(perfilN.peso), "pesagem registrada aparece na evolução");
  ok(perfilN.st.pacientes[0].peso === 78.5, "cadastro acompanha a pesagem mais recente");
  await p.evaluate(() => document.getElementById("pnFechar").click());
  // busca de paciente no topo abre o perfil
  await p.fill("#buscaPac", "bruno");
  await p.waitForTimeout(150);
  ok(await p.evaluate(() => !document.getElementById("buscaPacLista").hidden && /Bruno Paciente/.test(document.getElementById("buscaPacLista").textContent)), "busca no topo acha o paciente");
  await p.press("#buscaPac", "Enter");
  ok(await p.evaluate(() => document.getElementById("dlgPerfilN").open), "Enter na busca abre o perfil do paciente");
  await p.evaluate(() => document.getElementById("pnFechar").click());
  await p.fill("#buscaPac", "");

  // agenda no módulo: marcar consulta local
  await abaNt(p, "agenda");
  await p.selectOption("#cnPaciente", { index: 1 });
  await p.fill("#cnData", "2099-01-15");
  await p.fill("#cnHora", "10:30");
  await p.click("#cnAdd");
  await p.waitForTimeout(200);
  const consultasTxt = await p.evaluate(() => document.getElementById("listaConsultas").textContent);
  ok(/Bruno Paciente/.test(consultasTxt) && /10:30/.test(consultasTxt), "consulta marcada aparece na lista do módulo");

  // sincronizar com o calendário: exporta .ics das consultas futuras
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

  ok(erros.length === 0, "nenhuma página com erro de JS" + (erros.length ? " — " + erros[0] : ""));

  await b.close();
  console.log(falhas ? "\n💥 " + falhas + " FALHA(S)" : "\n🏁 TUDO PASSOU");
  process.exit(falhas ? 1 : 0);
})();
