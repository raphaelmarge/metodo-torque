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

  // onboarding do módulo
  const obVisivel = await p.evaluate(() => !document.getElementById("boasVindas").hidden);
  ok(obVisivel, "onboarding aparece na primeira abertura");
  await p.fill("#obNome", "Léo Personal");
  await p.click("#obOk");
  const titulo = await p.evaluate(() => document.getElementById("tituloStudio").textContent);
  ok(/Studio Léo/.test(titulo), "título vira 'Studio Léo' após onboarding");

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

  // ---------- pagamentos: plano, contrato e Pix BR Code ----------
  await p.fill("#plNome", "Mensal 3x");
  await p.fill("#plValor", "450");
  await p.selectOption("#plCiclo", "1");
  await p.fill("#plLink", "https://mpago.la/assinatura-teste");
  await p.click("#plAdd");
  const planos = await p.evaluate(() => document.getElementById("plLista").textContent);
  ok(/Mensal 3x/.test(planos) && /450/.test(planos), "plano do studio criado (R$ 450/mês)");
  ok(/recorrente/.test(planos), "plano com link de gateway ganha a etiqueta 🔁 recorrente");

  // contrato: vencimento escolhido pra testar o atraso de forma determinística
  const diaHoje = new Date().getDate();
  const diaVenc = diaHoje > 1 ? 1 : 28;
  await p.selectOption("#ctAluno", { index: 1 });
  await p.selectOption("#ctPlano", { index: 1 });
  await p.fill("#ctDia", String(diaVenc));
  await p.click("#ctAdd");
  const cts = await p.evaluate(() => document.getElementById("ctLista").textContent);
  ok(/João Cliente/.test(cts) && /Mensal 3x/.test(cts) && new RegExp("vence dia " + diaVenc).test(cts), "contrato fechado (aluno + plano + vencimento)");

  // pendência agora usa o valor do CONTRATO, não o do cadastro
  pend = await p.evaluate(() => document.getElementById("pendentes").textContent);
  ok(/450/.test(pend) && new RegExp("vence dia " + diaVenc).test(pend), "pendência mostra o valor do plano e o dia de vencimento");
  if (diaHoje > 1) ok(/ATRASADO/.test(pend), "passou do vencimento → etiqueta ATRASADO");
  else ok(!/ATRASADO/.test(pend), "dia 1 do mês: ainda sem atraso");
  ok(/Assinatura/.test(pend), "botão 🔁 Assinatura (link recorrente do gateway do personal)");
  let temPix = await p.evaluate(() => !!document.querySelector("#pendentes [data-pix]"));
  ok(!temPix, "sem chave Pix configurada não há botão 💠");

  // chave Pix no card da ilha
  await p.fill("#cfgPixChave", "raphael@torquefit.com.br");
  await p.fill("#cfgPixNome", "Raphael Margé");
  await p.fill("#cfgPixCidade", "Belo Horizonte");
  await p.evaluate(() => document.getElementById("cfgPixCidade").blur());
  await p.waitForTimeout(250);
  temPix = await p.evaluate(() => !!document.querySelector("#pendentes [data-pix]"));
  ok(temPix, "com a chave configurada o botão 💠 Pix aparece");

  // abre o Pix e valida o BR Code oficial (EMV do BC + CRC16)
  await p.evaluate(() => document.querySelector("#pendentes [data-pix]").click());
  await p.waitForFunction(() => document.getElementById("dlgPix").open);
  const pix = await p.evaluate(() => ({
    titulo: document.getElementById("pixTitulo").textContent,
    code: document.getElementById("pixCode").value,
    temQr: !!document.querySelector("#pixQr img"),
    zap: document.getElementById("pixZap").href,
  }));
  ok(/450/.test(pix.titulo) && /João/.test(pix.titulo), "dialog do Pix com valor e nome do aluno");
  ok(/^000201/.test(pix.code) && /6304[0-9A-F]{4}$/.test(pix.code), "BR Code começa 000201 e termina 6304+CRC");
  ok(pix.code.includes("br.gov.bcb.pix") && pix.code.includes("raphael@torquefit.com.br"), "payload leva a chave Pix do personal");
  ok(pix.code.includes("5406450.00"), "campo 54 (valor) = 450.00");
  ok(pix.code.includes("RAPHAEL MARGE") && pix.code.includes("BELO HORIZONTE"), "nome e cidade sem acento e maiúsculos");
  // CRC16-CCITT reimplementado aqui no Node, validado contra o vetor padrão
  function crcNode(s) {
    let crc = 0xFFFF;
    for (let i = 0; i < s.length; i++) {
      crc ^= s.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
    return ("0000" + crc.toString(16).toUpperCase()).slice(-4);
  }
  ok(crcNode("123456789") === "29B1", "CRC16-CCITT bate com o vetor de teste padrão (0x29B1)");
  ok(crcNode(pix.code.slice(0, -4)) === pix.code.slice(-4), "CRC do payload confere na reimplementação independente");
  ok(pix.temQr, "QR Code renderizado no dialog");
  ok(/wa\.me/.test(pix.zap) && /000201/.test(decodeURIComponent(pix.zap)), "mensagem do WhatsApp leva o copia-e-cola");
  await p.evaluate(() => document.getElementById("dlgPix").close());

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

  // treinos por seleção: biblioteca semeada + editar exercício (sub-página) + montar ficha
  await p.click('[data-a="treinos"]');
  const bib = await p.evaluate(() => document.getElementById("exLista").textContent);
  ok(/Supino reto/.test(bib) && /Agachamento livre/.test(bib), "biblioteca vem semeada com básicos");

  // abre a sub-página do Supino e coloca vídeo
  await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    const supino = st.exercicios.find((e) => e.nome === "Supino reto");
    window.__supinoId = supino.id;
  });
  const supinoId = await p.evaluate(() => window.__supinoId);
  await p.click('[data-exedit="' + supinoId + '"]');
  await p.fill("#dxVideo", "https://youtube.com/watch?v=abc123");
  await p.click('#dlgEx button[value="ok"]');
  await p.waitForFunction(() => !document.getElementById("dlgEx").open);
  await p.waitForTimeout(150);
  const comVideo = await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    return st.exercicios.find((e) => e.nome === "Supino reto").video;
  });
  ok(/abc123/.test(comVideo), "sub-página do exercício salva o vídeo");

  // monta ficha A com o Supino selecionado
  await p.selectOption("#tAluno", { index: 1 });
  await p.evaluate(() => { window.prompt = () => "A — Peito/Tríceps"; });
  await p.click("#tFicha");
  await p.waitForTimeout(200);
  const fichaId = await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    return st.treinosV2[st.alunos[0].id].fichas[0].id;
  });
  await p.selectOption('[data-exsel="' + fichaId + '"]', supinoId);
  await p.fill('[data-exser="' + fichaId + '"]', "4");
  await p.fill('[data-exrep="' + fichaId + '"]', "10");
  await p.click('[data-additem="' + fichaId + '"]');
  const fichas = await p.evaluate(() => document.getElementById("fichasBox").textContent);
  ok(/Supino reto/.test(fichas) && /4×10/.test(fichas), "ficha montada por seleção (Supino 4×10)");

  // videoteca do studio
  await p.fill("#vtpTitulo", "Mobilidade de quadril");
  await p.fill("#vtpCat", "Mobilidade");
  await p.fill("#vtpUrl", "https://youtube.com/watch?v=mob1");
  await p.click("#vtpAdd");
  const vtp = await p.evaluate(() => document.getElementById("vtpLista").textContent);
  ok(/Mobilidade de quadril/.test(vtp), "videoteca do studio cadastra conteúdo");

  // agenda uma sessão futura pro app mostrar
  await p.click('[data-a="agenda"]');
  await p.selectOption("#sAluno", { index: 1 });
  await p.evaluate(() => {
    const d = new Date(); d.setDate(d.getDate() + 2);
    document.getElementById("sData").value = d.toISOString().slice(0, 10);
  });
  await p.fill("#sHora", "07:30");
  await p.click("#sAdd");
  await p.click('[data-a="treinos"]');

  // dobras cutâneas: Pollock 3 (M, 30 anos, 10+20+15mm → ~13,6%) e Guedes (→ ~16,8%)
  await p.click('[data-a="avaliacoes"]');
  await p.selectOption("#dbMetodo", "p3");
  await p.selectOption("#dbSexo", "M");
  await p.fill("#dbIdade", "30");
  const campos = await p.evaluate(() => Array.from(document.querySelectorAll("#dbCampos label")).map((l) => l.textContent));
  ok(/Peitoral/.test(campos[0]) && /Abdominal/.test(campos[1]) && /Coxa/.test(campos[2]), "Pollock 3 masculino pede peitoral/abdominal/coxa");
  await p.evaluate(() => {
    const ins = document.querySelectorAll(".dbIn");
    ins[0].value = "10"; ins[1].value = "20"; ins[2].value = "15";
  });
  await p.click("#dbCalc");
  let resDb = await p.evaluate(() => document.getElementById("dbResultado").textContent);
  ok(/13,6%/.test(resDb), "Pollock 3 + Siri = 13,6% (conferido à mão)");
  const gordPreenchida = await p.evaluate(() => document.getElementById("avGord").value);
  ok(gordPreenchida === "13.6", "resultado preenche o campo % gordura da avaliação");
  // Guedes com as mesmas somas
  await p.selectOption("#dbMetodo", "guedes");
  await p.evaluate(() => {
    const ins = document.querySelectorAll(".dbIn");
    ins[0].value = "10"; ins[1].value = "20"; ins[2].value = "15";
  });
  await p.click("#dbCalc");
  resDb = await p.evaluate(() => document.getElementById("dbResultado").textContent);
  ok(/16,8%/.test(resDb), "Guedes + Siri = 16,8% (conferido à mão)");
  // registra a avaliação com as dobras anexadas
  await p.selectOption("#avAluno", { index: 1 });
  await p.click("#avAdd");
  const comDobras = await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    return st.avaliacoes[st.avaliacoes.length - 1];
  });
  ok(comDobras.metodoDobras === "guedes" && comDobras.dobras && comDobras.gordura === 16.8, "avaliação salva com as dobras e o método");
  const histDb = await p.evaluate(() => document.getElementById("listaAvaliacoes").textContent);
  ok(/Guedes/.test(histDb), "histórico mostra a etiqueta 📐 do protocolo");
  // limpa pra não interferir nos testes de evolução seguintes
  await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    st.avaliacoes = [];
    localStorage.setItem("mtapp:ptStudio", JSON.stringify(st));
  });

  // avaliações: registra 2 e vê evolução
  await p.click('[data-a="avaliacoes"]');
  await p.selectOption("#avAluno", { index: 1 });
  await p.fill("#avPeso", "90");
  await p.fill("#avGord", "25");
  await p.click("#avAdd");
  await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    const antes = new Date(); antes.setDate(antes.getDate() - 60);
    st.avaliacoes[0].data = antes.toISOString().slice(0, 10);
    localStorage.setItem("mtapp:ptStudio", JSON.stringify(st));
  });
  await p.selectOption("#avAluno", { index: 1 });
  await p.fill("#avPeso", "84");
  await p.fill("#avGord", "19.5");
  await p.click("#avAdd");
  const avs = await p.evaluate(() => document.getElementById("listaAvaliacoes").textContent);
  ok(/João Cliente/.test(avs) && /-6/.test(avs.replace("−", "-")), "avaliações com delta de peso (-6 kg)");

  // relatórios
  await p.click('[data-a="relatorios"]');
  const relR = await p.evaluate(() => document.getElementById("relReceita").textContent);
  ok(/R\$\s?400/.test(relR), "relatório de receita mostra os R$ 400 do mês");
  const relA = await p.evaluate(() => document.getElementById("relAssiduidade").textContent);
  ok(/João Cliente/.test(relA) && /1 sessão/.test(relA), "assiduidade conta a sessão feita");
  ok(/presença 100%/.test(relA), "taxa de presença 100% (1 feita, 0 faltas)");

  // pacote novo de relatórios
  const resumo = await p.evaluate(() => document.getElementById("relResumo").textContent);
  ok(/Alunos ativos/.test(resumo) && /Recebido no mês/.test(resumo) && /400/.test(resumo), "resumo do mês: recebido R$ 400");
  ok(/Falta receber/.test(resumo) && /50/.test(resumo), "resumo: falta receber R$ 50 (contrato 450 − pago 400)");
  ok(/Ticket médio/.test(resumo) && /1 pagante/.test(resumo), "resumo: ticket médio com nº de pagantes");
  const relPrev = await p.evaluate(() => document.getElementById("relPrevisto").textContent);
  ok(/Previsto: R\$\s?450/.test(relPrev) && /Recebido: R\$\s?400/.test(relPrev), "previsto×recebido usa o valor do CONTRATO (450)");
  ok(/89%/.test(relPrev), "barra de progresso da receita (400/450 = 89%)");
  ok(/Todo mundo pagou/.test(relPrev), "quem pagou some da lista de falta");
  const relCart = await p.evaluate(() => document.getElementById("relCarteira").textContent);
  ok(/\+1 novo/.test(relCart) && /saldo \+1/.test(relCart), "carteira: João conta como novo no mês");
  const relOc = await p.evaluate(() => document.getElementById("relOcupacao").textContent);
  ok(/Horários mais usados/.test(relOc) && /07h/.test(relOc), "ocupação: horário mais usado (07h)");
  ok(/espaço pra vender/.test(relOc), "ocupação sugere o dia com mais espaço");
  const relRes = await p.evaluate(() => document.getElementById("relResultados").textContent);
  ok(/1 de 1/.test(relRes) && /-6/.test(relRes.replace(/−/g, "-")), "resultados: João evoluiu −6 kg (1ª × última avaliação)");
  const relL = await p.evaluate(() => document.getElementById("relLTV").textContent);
  ok(/João Cliente/.test(relL) && /400/.test(relL) && /1 pagamento/.test(relL), "LTV: João com R$ 400 no histórico");
  const relAl0 = await p.evaluate(() => document.getElementById("relAlertas").textContent);
  ok(/Tudo em ordem/.test(relAl0), "studio saudável → nenhum alerta");
  // injeta uma aluna problemática (sumida, sem ficha, sem pagar) e re-renderiza
  await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    const d = new Date(); d.setDate(d.getDate() - 40);
    st.alunos.push({ id: "maria-t", nome: "Maria Sumida", valor: 300, ativo: true, desde: d.toISOString().slice(0, 10) });
    localStorage.setItem("mtapp:ptStudio", JSON.stringify(st));
    window.__relPT();
  });
  const relAl = await p.evaluate(() => document.getElementById("relAlertas").textContent);
  ok(/Maria Sumida/.test(relAl) && /14 dias/.test(relAl), "alerta 👻 de aluna sumida (14+ dias)");
  ok(/ficha de treino/.test(relAl), "alerta 📋 de aluna sem ficha montada");
  const resumo2 = await p.evaluate(() => document.getElementById("relResumo").textContent);
  ok(/350/.test(resumo2), "falta receber recalcula com a aluna nova (R$ 350)");
  // CSV de receita por aluno
  const dlRel = p.waitForEvent("download", { timeout: 5000 }).catch(() => null);
  await p.click("#relCSV");
  const arqRel = await dlRel;
  ok(!!arqRel && /receita-por-aluno/.test(arqRel.suggestedFilename()), "CSV de receita por aluno baixa");
  // limpa a aluna de teste pra não interferir no resto
  await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    st.alunos = st.alunos.filter((a) => a.id !== "maria-t");
    localStorage.setItem("mtapp:ptStudio", JSON.stringify(st));
    window.__relPT();
  });

  // app do aluno gerado
  const appHtml = await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    return window.__montaAppAluno(st.alunos[0], new Date().toISOString());
  });
  ok(/A — Peito\/Tríceps/.test(appHtml) && /Supino reto/.test(appHtml) && /4×10/.test(appHtml), "app leva a ficha estruturada (Supino 4×10)");
  ok(/<details/.test(appHtml) && /Pegada na largura dos ombros/.test(appHtml), "cada exercício é uma sub-página com a descrição");
  ok(/▶ ver vídeo/.test(appHtml) && /youtube\.com\/watch\?v=abc123/.test(appHtml), "exercício com vídeo ganha o botão ▶ ver vídeo");
  ok(/dcExs/.test(appHtml), "diário de cargas sugere os exercícios da ficha");
  ok(/setbtn/.test(appHtml) && /tmrbtn/.test(appHtml), "exercícios têm botões de séries e cronômetro");
  ok(/Minhas sessões/.test(appHtml) && /07:30/.test(appHtml), "próximas sessões embutidas no app");
  ok(/Conteúdos de/.test(appHtml) && /Mobilidade de quadril/.test(appHtml), "videoteca do studio no app");
  ok(/Meu peso/.test(appHtml) && /Hábitos de hoje/.test(appHtml) && /Fotos de progresso/.test(appHtml), "cards de peso, hábitos e fotos presentes");
  ok(/Fale com/.test(appHtml) && /chEnvia/.test(appHtml), "app tem o card de chat com o personal");
  ok(/Diário de cargas/.test(appHtml) && /NOVO RECORDE/.test(appHtml), "app tem diário de cargas com recorde");
  ok(/Minha evolução/.test(appHtml) && /84/.test(appHtml), "app leva as avaliações (peso 84)");
  ok(/💳 Meu plano/.test(appHtml) && /Mensal 3x/.test(appHtml) && new RegExp("todo dia " + diaVenc).test(appHtml), "app tem o card 💳 Meu plano (plano + vencimento)");
  ok(/pixAluno/.test(appHtml) && /pixCopiaAluno/.test(appHtml), "app com Pix copia-e-cola e botão de copiar");
  ok(/data:image\/gif/.test(appHtml), "QR Code do Pix embutido no app");
  const pixAppCode = (appHtml.match(/id='pixAluno'[^>]*>([^<]+)<\/textarea>/) || [])[1] || "";
  ok(/^000201/.test(pixAppCode) && crcNode(pixAppCode.slice(0, -4)) === pixAppCode.slice(-4), "BR Code do app é válido (CRC confere)");
  ok(/Assinar no cartão/.test(appHtml) && /mpago\.la\/assinatura-teste/.test(appHtml), "link 🔁 de assinatura recorrente chega no app");
  // dá um token pro aluno pra ligar o modo nuvem do app (RPCs serão mockadas)
  await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    st.alunos[0].appTokenP = "tok-teste-chat";
    localStorage.setItem("mtapp:ptStudio", JSON.stringify(st));
  });
  const appHtml2 = await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    return window.__montaAppAluno(st.alunos[0], new Date().toISOString());
  });
  ok(/🔑 Meu login/.test(appHtml2) && /aluno_define_login/.test(appHtml2), "app com token ganha o card 🔑 pra criar login e senha");
  const pApp = await ctx.newPage();
  const errosApp = [];
  pApp.on("pageerror", (e) => errosApp.push(String(e)));
  const chatDB = [];
  await pApp.route("**/rest/v1/rpc/app_chat_lista", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(chatDB) }));
  await pApp.route("**/rest/v1/rpc/app_chat_envia", (r) => {
    const corpo = JSON.parse(r.request().postData() || "{}");
    chatDB.push({ de: "aluno", texto: corpo.p_texto, criado: new Date().toISOString() });
    r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  await pApp.route("**/rest/v1/rpc/app_aluno_treino_reg", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) }));
  await pApp.route("**/rest/v1/rpc/app_aluno_checkin", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) }));
  await pApp.route("**/rest/v1/rpc/app_aluno_busca", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(null) }));
  // serve via http (setContent teria origem opaca, sem localStorage)
  await pApp.route("**/app-teste-personal.html", (r) => r.fulfill({ contentType: "text/html", body: appHtml2 }));
  await pApp.goto(BASE + "/app-teste-personal.html", { waitUntil: "domcontentloaded" });
  await pApp.fill("#dcEx", "Agachamento");
  await pApp.fill("#dcKg", "80");
  await pApp.click("#dcAdd");
  const dc = await pApp.evaluate(() => document.getElementById("dcLista").textContent);
  ok(/Agachamento/.test(dc) && /80/.test(dc), "aluno registra carga no diário");
  // séries: 4 cliques no Supino (4 séries) e completa os demais → dia marca sozinho
  const nBtns = await pApp.evaluate(() => document.querySelectorAll(".setbtn").length);
  ok(nBtns >= 1, "botões de séries renderizados (" + nBtns + ")");
  await pApp.evaluate(() => {
    document.querySelectorAll(".setbtn").forEach((b) => {
      const max = +b.dataset.n;
      for (let i = 0; i < max; i++) b.click();
    });
  });
  await pApp.waitForTimeout(400);
  const feitoAuto = await pApp.evaluate(() => JSON.parse(localStorage.getItem("ptfeitos") || "{}"));
  ok(Object.keys(feitoAuto).length === 1, "completar todas as séries marca 'treinei hoje' sozinho");
  // cronômetro (o botão vive dentro do <details> fechado — clica via JS)
  await pApp.evaluate(() => document.querySelector(".tmrbtn").click());
  await pApp.waitForTimeout(300);
  const tmr = await pApp.evaluate(() => document.getElementById("tmrBar").textContent);
  ok(/Descanso/.test(tmr), "cronômetro de descanso liga");
  // gráfico de carga: clica na linha do diário
  await pApp.fill("#dcEx", "Supino reto");
  await pApp.fill("#dcKg", "72");
  await pApp.click("#dcAdd");
  await pApp.evaluate(() => document.querySelector('[data-dcx="Supino reto"]').click());
  const graf = await pApp.evaluate(() => document.getElementById("dcGraf").textContent);
  ok(/Supino reto/.test(graf) && /★/.test(graf), "gráfico de carga abre com PR ★");
  // peso diário
  await pApp.fill("#pzKg", "83,4");
  await pApp.click("#pzAdd");
  const pz = await pApp.evaluate(() => document.getElementById("pzGraf").textContent);
  ok(/83,4/.test(pz), "peso registrado com curva");
  // hábitos: marca 3 e confere streak
  await pApp.evaluate(() => {
    document.querySelectorAll("[data-hab]")[0].click();
    document.querySelectorAll("[data-hab]")[1].click();
    document.querySelectorAll("[data-hab]")[2].click();
  });
  const hab = await pApp.evaluate(() => document.getElementById("habStreak").textContent);
  ok(/1 dia/.test(hab), "streak de hábitos conta o dia com 3+");

  // motivação: treinei hoje → bolinha, meta e toast
  pApp.on("dialog", (d) => d.accept());
  const semana = await pApp.evaluate(() => document.getElementById("diasSem").textContent);
  ok(/✓/.test(semana), "bolinha do dia marcada (auto pelo treino completo)");
  const metaTxt = await pApp.evaluate(() => document.getElementById("metaBox").textContent);
  ok(/1 de 3/.test(metaTxt), "meta da semana mostra 1 de 3");
  const medal = await pApp.evaluate(() => document.getElementById("medalhas").textContent);
  ok(/1 treino/.test(medal) && /faltam 4/.test(medal), "contador de medalhas (faltam 4 pra 🥉)");
  // clicar manualmente no mesmo dia não duplica
  await pApp.click("#btnFeito");
  const feitos = await pApp.evaluate(() => JSON.parse(localStorage.getItem("ptfeitos")));
  ok(Object.keys(feitos).length === 1, "mesmo dia não duplica o registro");
  // check-in: escolhe carinha e envia (sem nuvem → wa.me; só valida o estado)
  await pApp.evaluate(() => { window.open = () => null; }); // não abre janela no teste
  await pApp.click("#ckNotas button:nth-child(4)");
  await pApp.fill("#ckPeso", "84,5");
  await pApp.fill("#ckTexto", "Semana boa!");
  await pApp.click("#ckEnvia");
  await pApp.waitForTimeout(200);
  const ckOk = await pApp.evaluate(() => document.getElementById("ckOk").style.display !== "none");
  ok(ckOk, "check-in enviado marca a semana como feita");

  const evo = await pApp.evaluate(() => document.getElementById("evoBox").textContent);
  ok(/84/.test(evo) && /-6/.test(evo.replace("−", "-")), "evolução mostra peso atual e delta");
  // chat: aluno manda mensagem → aparece no thread (RPC mockada)
  await pApp.fill("#chTexto", "Professor, dúvida no supino!");
  await pApp.click("#chEnvia");
  await pApp.waitForTimeout(400);
  const thread = await pApp.evaluate(() => document.getElementById("chMsgs").textContent);
  ok(/dúvida no supino/.test(thread), "mensagem do aluno aparece no chat do app");

  ok(errosApp.length === 0, "app do aluno abre sem erros de JS" + (errosApp.length ? " — " + errosApp[0] : ""));
  await pApp.close();

  // conta / ilha
  const conta = await p.evaluate(() => document.getElementById("contaStatus").textContent);
  ok(/Crie sua conta|Conectado/.test(conta), "card da ilha mostra o status da conta");

  // aba chat do módulo (sem nuvem → aviso educado)
  await p.click('[data-a="chat"]');
  await p.waitForTimeout(300);
  const chatMod = await p.evaluate(() => document.getElementById("chatMsgs").textContent);
  ok(/precisa da sua conta/.test(chatMod), "chat do módulo sem nuvem explica o que falta");

  // aba assessoria (sem nuvem → aviso educado)
  await p.click('[data-a="assessoria"]');
  await p.waitForTimeout(300);
  const asse = await p.evaluate(() => document.getElementById("assessoriaLista").textContent);
  ok(/precisa da sua conta/.test(asse), "assessoria sem nuvem explica o que falta");

  // aluno "Encerrar" some da lista
  await p.click('[data-a="alunos"]');
  await p.click("[data-rm]");
  lista = await p.evaluate(() => document.getElementById("listaAlunos").textContent);
  ok(/primeiro aluno/.test(lista), "encerrar aluno esvazia a lista (histórico preservado)");
  const guardado = await p.evaluate(() => JSON.parse(localStorage.getItem("mtapp:ptStudio")).alunos.length);
  ok(guardado === 1, "aluno encerrado continua guardado (ativo=false)");
  await p.close();

  // ---------- 3) página de vendas do módulo ----------
  console.log("Página de vendas:");
  p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  await p.goto(BASE + "/personal-vendas.html?zap=5531999990000");
  const cta = await p.evaluate(() => document.getElementById("ctaZap").href);
  ok(/wa\.me\/5531999990000/.test(cta), "CTA aponta pro WhatsApp do vendedor (?zap=)");
  const corpo = await p.evaluate(() => document.body.textContent);
  ok(/personal trainer/.test(corpo) && /Pagamentos/.test(corpo), "landing com pitch e features");
  await p.close();

  ok(erros.length === 0, "nenhuma página com erro de JS" + (erros.length ? " — " + erros[0] : ""));

  await b.close();
  console.log(falhas ? "\n💥 " + falhas + " FALHA(S)" : "\n🏁 TUDO PASSOU");
  process.exit(falhas ? 1 : 0);
})();
