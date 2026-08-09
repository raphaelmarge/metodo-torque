// Migração pós-cancelamento (wellhub) + TORQUE ON Personal (produto para personal trainers)
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
async function abaPt(p, a) {
  await p.click("#btnMenuPt");
  await p.click('#abas [data-a="' + a + '"]');
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

  // ---------- 2) TORQUE ON Personal ----------
  console.log("TORQUE ON Personal:");
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

  // faixa do teste grátis (modo sem conta)
  const faixa = await p.evaluate(() => {
    const f = document.getElementById("faixaTeste");
    return { visivel: !f.hidden, txt: f.textContent, zap: document.getElementById("faixaTesteZap").href, desde: localStorage.getItem("mtapp:ptTesteDesde") };
  });
  ok(faixa.visivel && /dia 1 de 14/.test(faixa.txt), "faixa do teste grátis aparece no modo sem conta (dia 1 de 14)");
  ok(/wa\.me\/5521994429198/.test(faixa.zap) && /R\$ 49/.test(faixa.txt), "faixa tem o botão de assinar por R$ 49 no WhatsApp");
  ok(!!faixa.desde, "início do teste fica registrado no aparelho");

  // a aba inicial agora é o Dashboard — vai pra lista de alunos primeiro
  await abaPt(p, "alunos");
  // aluno novo: assistente em 2 passos (cadastro completo → contrato e venda)
  await p.route("**/viacep.com.br/ws/30130010/json/", (r) => r.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ logradouro: "Avenida Afonso Pena", bairro: "Centro", localidade: "Belo Horizonte", uf: "MG" }),
  }));
  await p.click("#btnNovoAluno");
  await p.fill("#aNome", "João Cliente");
  await p.fill("#aZap", "31999990000");
  await p.fill("#aCpf", "111.222.333-44");
  await p.fill("#aCep", "30130010");
  await p.waitForTimeout(400);
  const endAuto = await p.evaluate(() => document.getElementById("aEnd").value);
  ok(/Avenida Afonso Pena/.test(endAuto) && /Belo Horizonte\/MG/.test(endAuto), "CEP preenche o endereço sozinho no cadastro");
  await p.click("#aAdd");
  const passo2 = await p.evaluate(() => ({
    p1: document.getElementById("naPasso1").hidden,
    p2: !document.getElementById("naPasso2").hidden,
  }));
  ok(passo2.p1 && passo2.p2, "passo 2 (contrato e venda) abre na sequência");
  // sem plano ainda: cria um plano rápido com treinos/sem e modalidade
  await p.evaluate(() => { document.getElementById("naNovoPlano").open = true; });
  await p.fill("#naPlNome", "Mensal 3x/sem");
  await p.fill("#naPlValor", "400");
  await p.selectOption("#naPlModal", "presencial");
  await p.click("#naPlCriar");
  await p.waitForTimeout(150);
  const planoCriado = await p.evaluate(() => ({
    sel: document.getElementById("naPlano").selectedOptions[0].textContent,
    valor: document.getElementById("naValor").value,
    plano: JSON.parse(localStorage.getItem("mtapp:ptStudio")).planosPT[0],
  }));
  ok(/Mensal 3x\/sem/.test(planoCriado.sel) && /3x\/sem/.test(planoCriado.sel) && /presencial/.test(planoCriado.sel) && planoCriado.valor === "400",
    "plano criado na hora com treinos/semana e modalidade, já selecionado com o valor");
  ok(planoCriado.plano.treinosSem === 3 && planoCriado.plano.modalidade === "presencial", "plano guarda quantidade de treinos e modalidade");
  await p.evaluate(() => { document.getElementById("naPagar").checked = false; });
  await p.click("#naConcluir");
  await p.waitForTimeout(150);
  const posWizard = await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    const a = st.alunos[0];
    return { valor: a.valor, meta: a.metaSemana, cpf: a.cpf, end: a.endereco, contrato: (st.contratosPT || []).length };
  });
  ok(posWizard.valor === 400 && posWizard.meta === 3 && posWizard.contrato === 1, "concluir fecha o contrato e o aluno herda valor e meta do plano");
  ok(posWizard.cpf === "111.222.333-44" && /Avenida Afonso Pena/.test(posWizard.end), "CPF e endereço salvos no aluno");
  // limpa plano/contrato do assistente pra não interferir nos testes de contrato adiante
  await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    st.contratosPT = [];
    st.planosPT = [];
    localStorage.setItem("mtapp:ptStudio", JSON.stringify(st));
  });
  let lista = await p.evaluate(() => document.getElementById("listaAlunos").textContent);
  ok(/João Cliente/.test(lista) && /400/.test(lista), "aluno cadastrado com valor mensal");
  ok(/SEM PAGAMENTO NO MÊS/.test(lista), "etiqueta de pendência antes do pagamento");
  ok(await p.evaluate(() => !!document.querySelector('#listaAlunos [data-acesso]')), "aluno sem acesso do app tem o botão 📧 Enviar acesso direto na lista");

  // agenda: sessão hoje + marcar feita (agora com sub-abas Sessões/Agendar)
  await abaPt(p, "agenda");
  ok(await p.evaluate(() => ["agAbas", "avAbas", "qtAbas", "dsAbas", "relAbas", "chAbas"].every((id) => !!document.getElementById(id))),
    "todas as seções grandes têm barra de sub-abas");
  ok(await p.evaluate(() => document.querySelector('#agAbas button.ativa').textContent.includes("Sessões")), "Agenda abre na sub-aba Sessões");
  await p.evaluate(() => window.__agAba("agendar"));
  await p.selectOption("#sAluno", { index: 1 });
  await p.fill("#sHora", "07:00");
  await p.click("#sAdd");
  let ses = await p.evaluate(() => document.getElementById("listaSessoes").textContent);
  ok(/João Cliente/.test(ses) && /07:00/.test(ses), "sessão agendada aparece no detalhe do dia");
  ok(await p.evaluate(() => !!document.querySelector("#calAgenda .cal-dia.hoje .cal-n")), "calendário do mês marca hoje com a contagem de sessões");

  // sincronizar com o calendário: exporta .ics das sessões futuras
  await p.evaluate(() => window.__agAba("sessoes"));
  {
    const dl = p.waitForEvent("download", { timeout: 5000 }).catch(() => null);
    await p.click("#btnIcsP");
    const arq = await dl;
    ok(!!arq && /agenda-torque-personal\.ics/.test(arq.suggestedFilename()), "botão 📅 baixa o arquivo .ics da agenda");
    if (arq) {
      const txt = fs.readFileSync(await arq.path(), "utf8");
      ok(/BEGIN:VCALENDAR/.test(txt) && /Sessão — João Cliente/.test(txt) && /DTSTART/.test(txt), "arquivo .ics tem o evento da sessão (Google/iPhone entendem)");
    }
  }
  await p.click("#listaSessoes [data-feita]");
  ses = await p.evaluate(() => document.getElementById("listaSessoes").textContent);
  ok(/FEITA/.test(ses), "sessão marcada como feita");
  ok(/Hoje/.test(ses), "lista agrupada por dia (cabeçalho Hoje)");

  // 🔁 recorrência semanal: 4 sessões de uma vez a partir de amanhã
  await p.evaluate(() => {
    document.getElementById("sData").value = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    document.getElementById("sRepAte").value = new Date(Date.now() + 22 * 864e5).toISOString().slice(0, 10);
    document.getElementById("sRep").checked = true;
  });
  await p.evaluate(() => window.__agAba("agendar"));
  await p.selectOption("#sAluno", { index: 1 });
  await p.fill("#sHora", "08:00");
  await p.click("#sAdd");
  const rec = await p.evaluate(() => JSON.parse(localStorage.getItem("mtapp:ptStudio")).sessoes.filter((x) => x.hora === "08:00").length);
  ok(rec === 4, "🔁 repetir toda semana gera as 4 sessões de uma vez");
  await p.evaluate(() => window.__agDia(new Date(Date.now() + 864e5).toISOString().slice(0, 10)));
  ok(await p.evaluate(() => document.getElementById("listaSessoes").textContent.includes("Amanhã")), "clicar no dia de amanhã no calendário mostra o cabeçalho Amanhã");
  ok(await p.evaluate(() => /08:00/.test(document.getElementById("listaSessoes").textContent)), "detalhe do dia lista horário e aluno da sessão");

  // choque de horário: agendar amanhã às 08:00 de novo pede confirmação
  await p.evaluate(() => {
    document.getElementById("sRep").checked = false;
    window.confirm = (m) => { window.__choqueMsg = m; return false; };
  });
  await p.click("#sAdd");
  const choque = await p.evaluate(() => window.__choqueMsg || "");
  ok(/mesmo horário/.test(choque) && /08:00/.test(choque) && /João Cliente/.test(choque), "choque de horário avisa antes de agendar");
  const aposChoque = await p.evaluate(() => JSON.parse(localStorage.getItem("mtapp:ptStudio")).sessoes.filter((x) => x.hora === "08:00").length);
  ok(aposChoque === 4, "cancelar no aviso de choque não duplica a sessão");
  await p.evaluate(() => { window.confirm = () => true; });

  // Faltou: falta explícita com etiqueta (no dia de amanhã do calendário)
  await p.evaluate(() => window.__agAba("sessoes"));
  await p.evaluate(() => window.__agDia(new Date(Date.now() + 864e5).toISOString().slice(0, 10)));
  await p.click("[data-faltou]");
  const faltouSt = await p.evaluate(() => ({
    faltas: JSON.parse(localStorage.getItem("mtapp:ptStudio")).sessoes.filter((x) => x.faltou).length,
    tela: document.getElementById("listaSessoes").textContent,
  }));
  ok(faltouSt.faltas === 1 && /FALTOU/.test(faltouSt.tela), "botão Faltou marca a falta explícita do aluno");

  // vários dias da semana de uma vez (seg/qua/sex): 3 dias × 2 semanas = 6 sessões
  await p.evaluate(() => {
    document.getElementById("sData").value = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    document.getElementById("sRepAte").value = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
    document.getElementById("sRep").checked = true;
    document.querySelectorAll("#sRepDias .srd").forEach((c) => { c.checked = ["1", "3", "5"].includes(c.value); });
  });
  await p.evaluate(() => window.__agAba("agendar"));
  await p.selectOption("#sAluno", { index: 1 });
  await p.fill("#sHora", "09:15");
  await p.click("#sAdd");
  const multi = await p.evaluate(() => {
    const ses = JSON.parse(localStorage.getItem("mtapp:ptStudio")).sessoes.filter((x) => x.hora === "09:15");
    return { n: ses.length, dows: [...new Set(ses.map((x) => new Date(x.data + "T12:00").getDay()))].sort().join(",") };
  });
  ok(multi.n === 6 && multi.dows === "1,3,5", "marcar S-Q-S agenda seg/qua/sex de uma vez (6 sessões em 2 semanas)");
  await p.evaluate(() => {
    document.getElementById("sRep").checked = false;
    document.querySelectorAll("#sRepDias .srd").forEach((c) => { c.checked = false; });
  });

  // pagamento: registra e some da pendência
  await abaPt(p, "pagamentos");
  let pend = await p.evaluate(() => document.getElementById("pendentes").textContent);
  ok(/João Cliente/.test(pend) && /Cobrar/.test(pend), "pendente com botão de cobrança WhatsApp");

  // ---------- pagamentos: sub-abas, plano, contrato (no perfil) e Pix BR Code ----------
  ok(await p.evaluate(() =>
    document.querySelector('[data-pgsec="planos"]').hidden &&
    document.querySelector('[data-pgsec="contratos"]').hidden &&
    !document.querySelector('[data-pgsec="receb"]').hidden), "Pagamentos abre na sub-aba Recebimentos (planos e contratos escondidos)");
  await p.evaluate(() => window.__pgAba("planos"));
  ok(await p.evaluate(() =>
    !document.querySelector('[data-pgsec="planos"]').hidden &&
    document.querySelector('[data-pgsec="receb"]').hidden), "sub-aba Planos mostra só os planos");
  await p.fill("#plNome", "Mensal 3x");
  await p.fill("#plValor", "450");
  await p.selectOption("#plCiclo", "1");
  await p.fill("#plLink", "https://mpago.la/assinatura-teste");
  await p.click("#plAdd");
  const planos = await p.evaluate(() => document.getElementById("plLista").textContent);
  ok(/Mensal 3x/.test(planos) && /450/.test(planos), "plano do studio criado (R$ 450/mês)");
  ok(/recorrente/.test(planos), "plano com link de gateway ganha a etiqueta 🔁 recorrente");

  // contrato agora é fechado no PERFIL do aluno (aba Financeiro); vencimento determinístico pro teste de atraso
  const diaHoje = new Date().getDate();
  const diaVenc = diaHoje > 1 ? 1 : 28;
  const joaoId = await p.evaluate(() => JSON.parse(localStorage.getItem("mtapp:ptStudio")).alunos.find((a) => a.nome === "João Cliente").id);
  await p.evaluate((id) => { window.__perfilPT(id); window.__pfAba("fin"); }, joaoId);
  ok(await p.evaluate(() => !!document.getElementById("pfCtPlano") && !!document.getElementById("pfCtAdd")), "perfil sem contrato mostra o form de fechar contrato");
  await p.selectOption("#pfCtPlano", { index: 1 });
  await p.fill("#pfCtDia", String(diaVenc));
  await p.click("#pfCtAdd");
  await p.waitForFunction(() => /Contrato:/.test(document.getElementById("pfFin").textContent));
  const finTxt = await p.evaluate(() => document.getElementById("pfFin").textContent);
  ok(/Mensal 3x/.test(finTxt) && new RegExp("vence dia " + diaVenc).test(finTxt) && /Encerrar contrato/.test(finTxt),
    "contrato fechado direto no perfil (plano + vencimento + botão de encerrar)");
  await p.click("#pfFechar");
  await abaPt(p, "pagamentos");
  await p.evaluate(() => window.__pgAba("contratos"));
  const cts = await p.evaluate(() => document.getElementById("ctLista").textContent);
  ok(/João Cliente/.test(cts) && /Mensal 3x/.test(cts) && new RegExp("vence dia " + diaVenc).test(cts), "sub-aba Contratos lista a visão geral (aluno + plano + vencimento)");
  await p.evaluate(() => window.__pgAba("receb"));

  // pendência agora usa o valor do CONTRATO, não o do cadastro
  pend = await p.evaluate(() => document.getElementById("pendentes").textContent);
  ok(/450/.test(pend) && new RegExp("vence dia " + diaVenc).test(pend), "pendência mostra o valor do plano e o dia de vencimento");
  if (diaHoje > 1) ok(/ATRASADO/.test(pend), "passou do vencimento → etiqueta ATRASADO");
  else ok(!/ATRASADO/.test(pend), "dia 1 do mês: ainda sem atraso");
  ok(/Assinatura/.test(pend), "botão 🔁 Assinatura (link recorrente do gateway do personal)");
  let temPix = await p.evaluate(() => !!document.querySelector("#pendentes [data-pix]"));
  ok(!temPix, "sem chave Pix configurada não há botão 💠");

  // chave Pix no card da ilha (que agora tem aba própria no menu — Sua ilha)
  await abaPt(p, "conta");
  ok(await p.evaluate(() => !document.getElementById("cardConta").hidden), "card da ilha aparece na aba Sua ilha");
  ok(await p.evaluate(() => document.getElementById("vAlunos").hidden), "a aba Sua ilha não mistura com a lista de alunos");
  await p.fill("#cfgPixChave", "raphael@torquefit.com.br");
  await p.fill("#cfgPixNome", "Raphael Margé");
  await p.fill("#cfgPixCidade", "Belo Horizonte");
  await p.evaluate(() => document.getElementById("cfgPixCidade").blur());
  await p.waitForTimeout(250);
  await abaPt(p, "pagamentos");
  ok(await p.evaluate(() => document.getElementById("cardConta").hidden), "card da ilha some nas outras abas (sem repetir em toda página)");
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

  // ---------- financeiro turbinado: dívida acumulada, sessões a cobrar, Recebi, baixa do link ----------
  console.log("Financeiro turbinado:");
  {
    // guarda o estado pra devolver no fim (os alunos injetados não podem vazar pros testes seguintes)
    const stAntes = await p.evaluate(() => localStorage.getItem("mtapp:ptStudio"));
    const hoje = new Date().toISOString().slice(0, 10);
    const diaHoje = +hoje.slice(8, 10);
    const dIni = new Date(); dIni.setDate(1); dIni.setMonth(dIni.getMonth() - 3);
    const ini = dIni.toISOString().slice(0, 10); // dia 1, três meses atrás
    const expMeses = 3 + (diaHoje > 1 ? 1 : 0); // 3 meses cheios + o atual se já venceu (diaVenc 1)
    const fin = await p.evaluate(([ini, hoje]) => {
      const st = window.MTStore.read("ptStudio", {});
      st.planosPT = st.planosPT || []; st.contratosPT = st.contratosPT || [];
      st.planosPT.push({ id: "plx", nome: "Plano Cem", valor: 100 });
      st.alunos.push(
        { id: "axDev", nome: "Devedor Antigo", ativo: true, zap: "31988887777", desde: ini },
        { id: "axSes", nome: "Paga Sessao", ativo: true, modo: "sessao", valor: 80 },
        { id: "axPac", nome: "Pacote Estourado", ativo: true, pacote: { total: 5, usadas: 7 } });
      st.contratosPT.push({ id: "ctx", alunoId: "axDev", planoId: "plx", status: "ativo", inicio: ini, diaVenc: 1 });
      st.sessoes.push(
        { id: "sx1", alunoId: "axSes", data: hoje, hora: "07:00", feita: true },
        { id: "sx2", alunoId: "axSes", data: hoje, hora: "08:00", feita: true });
      window.MTStore.write("ptStudio", st);
      const F = window.__financeiroPT;
      return {
        div: F.divida(st, st.alunos.find((a) => a.id === "axDev")),
        ses: F.sessoes(st, st.alunos.find((a) => a.id === "axSes")),
        pac: F.sessoes(st, st.alunos.find((a) => a.id === "axPac")),
      };
    }, [ini, hoje]);
    ok(fin.div.meses === expMeses && fin.div.total === expMeses * 100,
      "dívida acumulada: contrato de 3 meses atrás sem pagar → deve " + expMeses + " meses (R$ " + expMeses * 100 + ")");
    ok(fin.ses && fin.ses.n === 2 && fin.ses.total === 160 && !fin.ses.pacote, "quem paga por sessão: 2 feitas sem acerto → R$ 160 a cobrar");
    ok(fin.pac && fin.pac.n === 2 && fin.pac.pacote, "pacote de 5 com 7 usadas → 2 sessões além do pacote");

    await p.reload();
    await p.waitForTimeout(600);
    await abaPt(p, "pagamentos");
    const pendHtml = await p.evaluate(() => document.getElementById("pendentes").innerHTML);
    ok(new RegExp("deve " + expMeses + " meses").test(pendHtml) && /Devedor Antigo/.test(pendHtml), "pendência mostra a etiqueta 'deve N meses' no lugar do ATRASADO simples");
    ok(/sessão\(ões\) a cobrar/.test(pendHtml) && /Paga Sessao/.test(pendHtml) && /data-receb="axSes"/.test(pendHtml), "linha própria de quem paga por sessão, com botão Recebi");
    ok(/além do pacote/.test(pendHtml) && /data-abreperfil="axPac"/.test(pendHtml) && /Renovar pacote/.test(pendHtml), "pacote estourado aparece com botão Renovar pacote");
    ok(new RegExp('data-receb="axDev" data-v="' + expMeses * 100 + '"').test(pendHtml), "botões de cobrança do devedor usam o TOTAL acumulado, não só o mês");

    // botão Recebi registra com 1 toque (o confirm é auto-aceito pelo teste)
    await p.evaluate(() => document.querySelector('#pendentes [data-receb="axSes"]').click());
    await p.waitForTimeout(250);
    const receb = await p.evaluate(() => {
      const st = window.MTStore.read("ptStudio", {});
      return {
        pg: st.pagamentos.find((x) => x.alunoId === "axSes"),
        pend: document.getElementById("pendentes").textContent,
      };
    });
    ok(receb.pg && receb.pg.forma === "recebido" && +receb.pg.valor === 160, "Recebi registra o pagamento (forma 'recebido', R$ 160)");
    ok(!/Paga Sessao/.test(receb.pend), "após o Recebi a linha some das pendências");

    // dialog do Pix ganhou o botão 'Já recebi' — registra e fecha
    await p.evaluate(() => document.querySelector('#pendentes [data-pix="axDev"]').click());
    await p.waitForFunction(() => document.getElementById("dlgPix").open);
    ok(await p.evaluate((exp) => window.__pixCtx && window.__pixCtx.alunoId === "axDev" && +window.__pixCtx.valor === exp, expMeses * 100), "abrir o Pix guarda aluno e valor pro botão de baixa");
    await p.click("#pixRecebi");
    await p.waitForTimeout(250);
    const pix2 = await p.evaluate(() => ({
      aberto: document.getElementById("dlgPix").open,
      pg: window.MTStore.read("ptStudio", {}).pagamentos.find((x) => x.alunoId === "axDev"),
    }));
    ok(!pix2.aberto && pix2.pg && pix2.pg.forma === "pix" && +pix2.pg.valor === expMeses * 100, "'Já recebi' no dialog do Pix registra o total e fecha");

    // Renovar pacote leva direto pro financeiro do perfil
    await p.evaluate(() => document.querySelector('#pendentes [data-abreperfil="axPac"]').click());
    await p.waitForTimeout(250);
    ok(await p.evaluate(() => !document.getElementById("vPerfil").hidden &&
      document.getElementById("pfNome").value === "Pacote Estourado" &&
      !document.querySelector('[data-pfsec="fin"]').hidden), "Renovar pacote abre o perfil já na aba Financeiro");
    await p.click("#pfFechar");

    // sessão Feita de quem paga por sessão oferece registrar o valor na hora
    await p.evaluate((hoje) => {
      const st = window.MTStore.read("ptStudio", {});
      st.sessoes.push({ id: "sx3", alunoId: "axSes", data: hoje, hora: "10:00" });
      window.MTStore.write("ptStudio", st);
    }, hoje);
    await abaPt(p, "agenda");
    await p.evaluate((hoje) => { window.__agAba("sessoes"); window.__agDia(hoje); }, hoje);
    await p.evaluate(() => {
      const r = Array.from(document.querySelectorAll("#listaSessoes .sessao-pt")).find((x) => /Paga Sessao/.test(x.textContent) && x.querySelector("[data-feita]"));
      r.querySelector("[data-feita]").click();
    });
    await p.waitForTimeout(250);
    ok(await p.evaluate(() => window.MTStore.read("ptStudio", {}).pagamentos.some((x) => x.alunoId === "axSes" && x.forma === "sessão" && +x.valor === 80)),
      "Feita + confirmar registra a sessão de R$ 80 direto no financeiro");

    // dashboard soma o que há pra receber (meses passados continuam devidos mesmo com o mês atual pago)
    await abaPt(p, "dash");
    ok(await p.evaluate(() => /A receber acumulado/.test(document.getElementById("bRecebP").textContent) && /R\$\s?300/.test(document.getElementById("bRecebP").textContent)),
      "dashboard mostra 'A receber acumulado' com os 3 meses antigos do devedor (R$ 300)");

    // baixa automática do link Pagar.me: casa o pedido guardado com o evento pago do webhook
    const link = await p.evaluate((hoje) => {
      const st = window.MTStore.read("ptStudio", {});
      st.alunos.find((a) => a.id === "axDev").pedidosPg = [{ id: "or_teste_1", v: 123.45, em: hoje }];
      window.MTStore.write("ptStudio", st);
      window.__cloudOrig = window.MTStore.cloud;
      window.MTStore.cloud = () => ({ client: { from: () => ({ select: () => ({ in: (col, ids) => {
        window.__pagIds = ids.slice();
        return { order: () => ({ limit: () => ({ then: (cb) => cb({ data: [
          { id: "evt_falha", tipo: "order.payment_failed", valor_centavos: 12345, pedido_id: "or_teste_1", criado: hoje + "T11:00:00" },
          { id: "evt_pago", tipo: "order.paid", valor_centavos: 12345, pedido_id: "or_teste_1", criado: hoje + "T12:00:00" },
        ] }) }) }) };
      } }) }) } });
      window.__pagLink();
      window.MTStore.cloud = window.__cloudOrig;
      const st2 = window.MTStore.read("ptStudio", {});
      return {
        ids: window.__pagIds,
        pg: st2.pagamentos.find((x) => x.eventoId === "evt_pago"),
        falhou: st2.pagamentos.some((x) => x.eventoId === "evt_falha"),
        pedidos: (st2.alunos.find((a) => a.id === "axDev").pedidosPg || []).length,
      };
    }, hoje);
    ok(link.ids && link.ids.includes("or_teste_1"), "baixa do link consulta só os pedidos guardados nos alunos");
    ok(link.pg && link.pg.forma === "link cartão" && +link.pg.valor === 123.45 && link.pg.alunoId === "axDev", "evento order.paid vira pagamento 'link cartão' de R$ 123,45");
    ok(!link.falhou && link.pedidos === 0, "payment_failed é ignorado e o pedido pago sai da fila do aluno");

    // devolve o estado como estava
    await p.evaluate((s) => localStorage.setItem("mtapp:ptStudio", s), stAntes);
    await p.reload();
    await p.waitForTimeout(600);
  }

  // exercícios: catálogo TORQUE + os seus numa lista só, por zona e movimento
  await abaPt(p, "treinos");
  await p.evaluate(() => window.__trAba("ex"));
  const bib = await p.evaluate(() => document.getElementById("exLista").textContent);
  ok(/SEU/.test(bib) && /Mostrando 40 de/.test(bib), "lista única mostra os seus (etiqueta SEU) junto com o catálogo");
  const cat = await p.evaluate(() => ({
    n: document.getElementById("catN").textContent,
    zonas: document.getElementById("catGrupo").options.length,
    movs: Array.from(document.getElementById("catMov").options).map((o) => o.value),
  }));
  ok(+(cat.n.match(/\d+/) || [0])[0] >= 200, "catálogo TORQUE anunciado com 200+ exercícios (" + cat.n.trim() + ")");
  ok(cat.zonas >= 10 && cat.movs.includes("Empurrar") && cat.movs.includes("Dobradiça e quadril"), "filtros de zona do corpo e tipo de movimento presentes");
  // filtro por movimento: Puxar mostra remada e esconde supino
  const porMov = await p.evaluate(() => {
    document.getElementById("catMov").value = "Puxar";
    window.__catalogoPT();
    const t = document.getElementById("exLista").textContent;
    document.getElementById("catMov").value = "";
    return t;
  });
  ok(/Rosca|Remada|Puxada/.test(porMov) && !/Supino reto com barra/.test(porMov), "filtro por movimento funciona (Puxar mostra puxadas, esconde supino)");
  // classificador de movimento acerta os padrões principais
  const movs = await p.evaluate(() => [
    window.__movimentoDe("Supino reto com barra", "Peito"),
    window.__movimentoDe("Remada curvada com barra", "Costas"),
    window.__movimentoDe("Levantamento terra romeno", "Posterior e glúteo"),
    window.__movimentoDe("Agachamento búlgaro", "Quadríceps"),
    window.__movimentoDe("Prancha com elevação", "Core"),
  ]);
  ok(movs[0] === "Empurrar" && movs[1] === "Puxar" && movs[2] === "Dobradiça e quadril" && movs[3] === "Agachar e pernas" && movs[4] === "Core e estabilidade",
    "classificador: supino=Empurrar, remada=Puxar, terra=Dobradiça, búlgaro=Agachar, prancha=Core");
  // Abrir num item do catálogo cria a cópia personalizada (SEU) e abre o editor
  await p.fill("#catBusca", "kettlebell");
  await p.waitForTimeout(150);
  const antesUsa = await p.evaluate(() => JSON.parse(localStorage.getItem("mtapp:ptStudio")).exercicios.length);
  await p.click('#exLista [data-exabrir]');
  await p.waitForTimeout(200);
  const depoisUsa = await p.evaluate(() => ({
    n: JSON.parse(localStorage.getItem("mtapp:ptStudio")).exercicios.length,
    dlg: document.getElementById("dlgEx").open,
  }));
  ok(depoisUsa.n === antesUsa + 1 && depoisUsa.dlg, "Abrir no catálogo vira exercício SEU (com dica) e abre o editor");
  await p.evaluate(() => document.getElementById("dlgEx").close());
  ok(await p.evaluate(() => /SEU/.test(document.getElementById("exLista").textContent)), "item personalizado ganha etiqueta SEU na lista");
  await p.fill("#catBusca", "");
  await p.waitForTimeout(150);

  // abre a sub-página do Supino e coloca vídeo
  await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    const supino = st.exercicios.find((e) => e.nome === "Supino reto");
    window.__supinoId = supino.id;
  });
  const supinoId = await p.evaluate(() => window.__supinoId);
  // a lista unificada corta em 40 — busca primeiro pro Supino aparecer
  await p.fill("#catBusca", "Supino reto");
  await p.waitForTimeout(200);
  await p.click('[data-exedit="' + supinoId + '"]');
  await p.fill("#dxVideo", "https://youtube.com/watch?v=abc123");
  await p.click('#dlgEx button[value="ok"]');
  await p.waitForFunction(() => !document.getElementById("dlgEx").open);
  // espera o salvamento chegar no storage (150ms fixos flakavam sob carga)
  await p.waitForFunction(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    const e = (st.exercicios || []).find((x) => x.nome === "Supino reto");
    return e && /abc123/.test(e.video || "");
  }, null, { timeout: 5000 }).catch(() => {});
  const comVideo = await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    return st.exercicios.find((e) => e.nome === "Supino reto").video;
  });
  ok(/abc123/.test(comVideo), "sub-página do exercício salva o vídeo");

  // monta ficha A com o Supino selecionado (sub-link Fichas)
  await p.evaluate(() => window.__trAba("fichas"));
  await p.selectOption("#tAluno", { index: 1 });
  await p.evaluate(() => { window.prompt = () => "A — Peito/Tríceps"; });
  await p.click("#tFicha");
  await p.waitForTimeout(200);
  const fichaId = await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    return st.treinosV2[st.alunos[0].id].fichas[0].id;
  });
  await p.selectOption('[data-exsel="' + fichaId + '"]', "Supino reto");
  await p.fill('[data-exser="' + fichaId + '"]', "4");
  await p.fill('[data-exrep="' + fichaId + '"]', "10");
  await p.click('[data-additem="' + fichaId + '"]');
  const fichas = await p.evaluate(() => document.getElementById("fichasBox").textContent);
  ok(/Supino reto/.test(fichas) && /4×10/.test(fichas), "ficha montada por seleção (Supino 4×10)");

  // descanso entre séries: default 60s no item novo, editável pelo botão ⏱
  ok(/⏱ 60s/.test(fichas), "item novo nasce com descanso padrão de 60s visível");
  await p.evaluate(() => { window.prompt = () => "100"; });
  await p.click('[data-tdesc="' + fichaId + ':0"]');
  await p.waitForTimeout(150);
  const aposDesc = await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    return {
      guardado: st.treinosV2[st.alunos[0].id].fichas[0].itens[0].descanso,
      tela: document.getElementById("fichasBox").textContent,
    };
  });
  ok(aposDesc.guardado === 100 && /⏱ 100s/.test(aposDesc.tela), "⏱ edita o descanso do exercício (60 → 100s)");

  // séries×reps e obs editáveis por prompt (sem apagar e recriar)
  await p.evaluate(() => { const seq = ["5", "8"]; window.prompt = () => seq.shift(); });
  await p.click('[data-tsr="' + fichaId + ':0"]');
  await p.waitForTimeout(150);
  const aposSR = await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    const it = st.treinosV2[st.alunos[0].id].fichas[0].itens[0];
    return { series: it.series, reps: it.reps, tela: document.getElementById("fichasBox").textContent };
  });
  ok(aposSR.series === 5 && aposSR.reps === "8" && /5×8/.test(aposSR.tela), "séries×reps editável por prompt (4×10 → 5×8)");
  await p.evaluate(() => { window.prompt = () => "pegada fechada"; });
  await p.click('[data-tobs="' + fichaId + ':0"]');
  await p.waitForTimeout(150);
  const aposObs = await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    return { obs: st.treinosV2[st.alunos[0].id].fichas[0].itens[0].obs, tela: document.getElementById("fichasBox").textContent };
  });
  ok(aposObs.obs === "pegada fechada" && /pegada fechada/.test(aposObs.tela), "obs do exercício editável por prompt (📝)");
  // volta pro 4×10 sem obs — o resto da suíte depende desse estado
  await p.evaluate(() => { const seq = ["4", "10"]; window.prompt = () => seq.shift(); });
  await p.click('[data-tsr="' + fichaId + ':0"]');
  await p.evaluate(() => { window.prompt = () => ""; });
  await p.click('[data-tobs="' + fichaId + ':0"]');
  await p.waitForTimeout(150);

  // a edição marca o app do aluno como pendente de publicar
  const pendApp = await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    const a = st.alunos[0];
    return {
      editEm: a.appEditEm,
      semToken: window.__appsPendentes.pendente(st, a),
      comToken: window.__appsPendentes.pendente(st, Object.assign({}, a, { appTokenP: "tok123" })),
      publicado: window.__appsPendentes.pendente(st, Object.assign({}, a, { appTokenP: "tok123", appPubEm: new Date(Date.now() + 60000).toISOString() })),
      temBotao: !!document.getElementById("btnPubPendentes"),
    };
  });
  ok(!!pendApp.editEm && pendApp.comToken === true, "editar a ficha marca o app do aluno como pendente de publicar");
  ok(pendApp.semToken === false && pendApp.publicado === false, "pendente só com link de app e some depois de publicar");
  ok(pendApp.temBotao, "botão 📤 Publicar apps atualizados existe (lotes de 5 com progresso)");

  // push nos eventos: módulo chama a função push-envia e ela tem envio direcionado com trava
  ok(await p.evaluate(async () => {
    const t = await (await fetch("personal.html")).text();
    return /push-envia/.test(t) && /acao: "para"/.test(t) && /Mensagem do seu personal/.test(t) && /Horário confirmado/.test(t) && /Treino novo no app/.test(t);
  }), "eventos disparam push pro aluno (app atualizado, chat do personal, horário confirmado)");
  ok(await p.evaluate(async () => {
    const t = await (await fetch("supabase/functions/push-envia/index.ts")).text();
    return /acao === "para"/.test(t) && /chamadorConfiavel/.test(t);
  }), "função push-envia com envio direcionado por token + trava de login");

  // cascata da ficha: tipo de treino → grupamento → exercício (catálogo inteiro filtrado)
  const casc = await p.evaluate((fid) => {
    const total = document.querySelector('[data-exsel="' + fid + '"]').options.length;
    const mov = document.querySelector('[data-exmov="' + fid + '"]');
    mov.value = "Dobradiça e quadril";
    mov.dispatchEvent(new Event("change", { bubbles: true }));
    const zona = document.querySelector('[data-exzona="' + fid + '"]');
    const zonas = Array.from(zona.options).map((o) => o.value);
    zona.value = "Posterior e glúteo";
    zona.dispatchEvent(new Event("change", { bubbles: true }));
    const ex = document.querySelector('[data-exsel="' + fid + '"]');
    const alvo = Array.from(ex.options).find((o) => /terra/i.test(o.value));
    return { total, depois: ex.options.length, zonas: zonas.join("|"), valor: alvo && alvo.value };
  }, fichaId);
  ok(casc.total > 500 && casc.depois > 1 && casc.depois < 200, "cascata filtra: de " + (casc.total - 1) + " exercícios pra " + (casc.depois - 1) + " (tipo + grupamento)");
  ok(/Posterior e glúteo/.test(casc.zonas) && !/^Peito$/m.test(casc.zonas.split("|").join("\n")), "grupamentos oferecidos seguem o tipo de treino escolhido");
  ok(!!casc.valor, "lista filtrada traz os levantamentos terra");
  await p.selectOption('[data-exsel="' + fichaId + '"]', casc.valor);
  await p.click('[data-additem="' + fichaId + '"]');
  await p.waitForTimeout(150);
  const aposCat = await p.evaluate((nome) => {
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    const ex = st.exercicios.find((e) => e.nome.toLowerCase() === nome.toLowerCase());
    return { entrou: !!ex, comDica: !!(ex && ex.descricao), naFicha: document.getElementById("fichasBox").textContent.includes(nome) };
  }, casc.valor);
  ok(aposCat.entrou && aposCat.comDica && aposCat.naFicha, "exercício do catálogo entra na ficha e vira item da biblioteca com dica");

  // botão ↓ desce o exercício na ficha (e ↑ volta)
  await p.click('[data-desce="' + fichaId + ':0"]');
  await p.waitForTimeout(150);
  const ordemDesce = await p.evaluate((sup) => {
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    return st.treinosV2[st.alunos[0].id].fichas[0].itens[1].exId === sup;
  }, supinoId);
  ok(ordemDesce, "botão ↓ desce o exercício na ficha");
  await p.click('[data-sobe="' + fichaId + ':1"]');
  await p.waitForTimeout(150);

  // videoteca do studio
  await p.evaluate(() => window.__trAba("videos"));
  await p.fill("#vtpTitulo", "Mobilidade de quadril");
  await p.fill("#vtpCat", "Mobilidade");
  await p.fill("#vtpUrl", "https://youtube.com/watch?v=mob1");
  await p.click("#vtpAdd");
  const vtp = await p.evaluate(() => document.getElementById("vtpLista").textContent);
  ok(/Mobilidade de quadril/.test(vtp), "videoteca do studio cadastra conteúdo");

  // envio de treino em grupo: cria grupo, copia a ficha do João pra Bia
  await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    st.alunos.push({ id: "al-bia-grupo", nome: "Bia Grupo", zap: "", ativo: true });
    localStorage.setItem("mtapp:ptStudio", JSON.stringify(st));
    window.__gruposPT.render();
  });
  const pick = await p.evaluate(() => document.getElementById("grAlunosPick").textContent);
  ok(/João Cliente/.test(pick) && /Bia Grupo/.test(pick), "criador de grupo lista os alunos ativos");
  await p.evaluate(() => window.__trAba("grupo"));
  // o seletor agora abre num quadrado com busca: filtra "bia" e marca
  await p.click("#grQuemCab");
  await p.fill("#grQuemBusca", "bia");
  ok(await p.evaluate(() => {
    const vis = Array.from(document.querySelectorAll("#grAlunosPick .msel-lista label")).filter((l) => l.style.display !== "none");
    return vis.length === 1 && /Bia Grupo/.test(vis[0].textContent);
  }), "buscar no quadrado filtra pra só a Bia");
  await p.check('.grCheck[value="al-bia-grupo"]');
  ok(await p.evaluate(() => /1 selecionado/.test(document.getElementById("grQuemN").textContent)), "contador mostra 1 selecionado");
  await p.fill("#grNome", "Turma 6h");
  await p.click("#grAdd");
  const grLista = await p.evaluate(() => document.getElementById("grLista").textContent);
  ok(/Turma 6h/.test(grLista) && /Bia/.test(grLista), "grupo criado aparece na lista com os membros");
  const seletores = await p.evaluate(() => ({
    origem: document.getElementById("geOrigem").textContent,
    grupo: document.getElementById("geGrupo").textContent,
  }));
  ok(/João Cliente/.test(seletores.origem) && /ficha/.test(seletores.origem), "origem só oferece aluno com ficha montada");
  ok(/Turma 6h/.test(seletores.grupo) && /Todos os alunos ativos/.test(seletores.grupo), "destino oferece o grupo e a opção Todos");
  await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    document.getElementById("geOrigem").value = st.alunos[0].id;
    document.getElementById("geGrupo").value = st.gruposPT[0].id;
  });
  await p.click("#geEnviar");
  await p.waitForTimeout(200);
  const posEnvio = await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    const t = (st.treinosV2 || {})["al-bia-grupo"];
    return {
      status: document.getElementById("geStatus").textContent,
      copiou: !!(t && t.fichas && t.fichas.length),
      exercicio: t && t.fichas && t.fichas[0] ? JSON.stringify(t.fichas[0]) : "",
    };
  });
  ok(/Treino copiado pra 1 aluno/.test(posEnvio.status), "envio em grupo confirma quantos alunos receberam");
  ok(posEnvio.copiou && /Peito/.test(posEnvio.exercicio), "ficha do João foi copiada pra Bia (mesmo treino)");
  // origem não se sobrescreve e a cópia é independente (deep copy)
  const independente = await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    st.treinosV2["al-bia-grupo"].fichas[0].nome = "MUDOU SÓ NA BIA";
    localStorage.setItem("mtapp:ptStudio", JSON.stringify(st));
    const st2 = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    return st2.treinosV2[st2.alunos[0].id].fichas[0].nome;
  });
  ok(!/MUDOU SÓ NA BIA/.test(independente), "cópia é independente — mexer na ficha da Bia não muda a do João");

  // treino de DISPARO (pré-montado, sem aluno): monta com template e dispara pro grupo
  await p.evaluate(() => { window.prompt = () => "Hipertrofia Agosto"; });
  await p.click("#gtNovo");
  await p.waitForTimeout(200);
  const gtSel = await p.evaluate(() => ({
    valor: document.getElementById("tAluno").value,
    rotulo: document.getElementById("tAluno").selectedOptions[0].textContent,
    lista: document.getElementById("gtLista").textContent,
  }));
  ok(/^gt/.test(gtSel.valor) && /Hipertrofia Agosto/.test(gtSel.rotulo), "criar treino de disparo já abre ele no montador de fichas");
  ok(/Hipertrofia Agosto/.test(gtSel.lista) && /0 ficha/.test(gtSel.lista), "treino de disparo aparece na lista do card");
  await p.selectOption("#tplSel", "abc");
  await p.click("#tplAplicar");
  await p.waitForTimeout(300);
  const gtFichas = await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    return st.treinosV2[st.treinosGrupo[0].id].fichas.length;
  });
  ok(gtFichas === 3, "template ABC montou as 3 fichas no treino de disparo (sem aluno)");
  // fichas recolhíveis: nascem fechadas, toque abre/fecha, várias abertas juntas
  const fechadas = await p.evaluate(() => Array.from(document.querySelectorAll("#fichasBox details")).map((d) => d.open));
  ok(fechadas.length === 3 && fechadas.every((o) => !o), "fichas nascem recolhidas (sem abrir tudo de uma vez)");
  await p.click("#fichasBox details:nth-of-type(1) summary");
  await p.click("#fichasBox details:nth-of-type(2) summary");
  await p.click("#fichasBox details:nth-of-type(3) summary");
  const abertas = await p.evaluate(() => Array.from(document.querySelectorAll("#fichasBox details")).map((d) => d.open));
  ok(abertas.length === 3 && abertas.every((o) => o), "toque abre — dá pra deixar as três abertas juntas");
  await p.click("#fichasBox details:nth-of-type(2) summary");
  const mista = await p.evaluate(() => Array.from(document.querySelectorAll("#fichasBox details")).map((d) => d.open));
  ok(mista[0] && !mista[1] && mista[2], "toque de novo fecha só aquela ficha");
  await p.evaluate(() => document.getElementById("tAluno").dispatchEvent(new Event("change", { bubbles: true })));
  await p.waitForTimeout(150);
  const preservado = await p.evaluate(() => Array.from(document.querySelectorAll("#fichasBox details")).map((d) => d.open));
  ok(preservado[0] && !preservado[1] && preservado[2], "re-render preserva quais fichas estavam abertas");
  // busca de aluno com digitação (combobox por cima do select)
  await p.evaluate(() => window.__trAba("fichas"));
  await p.fill("#tAlunoBusca", "joão");
  await p.waitForTimeout(200);
  const buscaAl = await p.evaluate(() => ({
    itens: Array.from(document.querySelectorAll("#tAlunoBuscaLista [data-bval]")).map((d) => d.textContent),
  }));
  ok(buscaAl.itens.length >= 1 && /João Cliente/.test(buscaAl.itens.join("|")) && !/Bia Grupo/.test(buscaAl.itens.join("|")), "digitar filtra os alunos conforme escreve");
  await p.click("#tAlunoBuscaLista [data-bval]");
  await p.waitForTimeout(200);
  const escolhido = await p.evaluate(() => ({
    valor: document.getElementById("tAluno").value,
    rotulo: document.getElementById("tAlunoBusca").value,
    fichas: document.getElementById("fichasBox").textContent,
  }));
  ok(!!escolhido.valor && /João Cliente/.test(escolhido.rotulo) && /Supino reto/.test(escolhido.fichas), "tocar na sugestão escolhe o aluno e carrega as fichas dele");
  await p.evaluate(() => {
    window.__gruposPT.render();
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    document.getElementById("geOrigem").value = st.treinosGrupo[0].id;
    document.getElementById("geGrupo").value = st.gruposPT[0].id;
  });
  const geOrigemTxt = await p.evaluate(() => document.getElementById("geOrigem").innerHTML);
  ok(/Treinos de disparo/.test(geOrigemTxt) && /Hipertrofia Agosto \(3 ficha/.test(geOrigemTxt), "seletor de envio oferece os treinos de disparo pré-montados");
  await p.evaluate(() => window.__trAba("grupo"));
  await p.click("#geEnviar");
  await p.waitForTimeout(200);
  const posDisparo = await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    return {
      status: document.getElementById("geStatus").textContent,
      fichasBia: (st.treinosV2["al-bia-grupo"] || { fichas: [] }).fichas.length,
    };
  });
  ok(/Treino copiado pra 1 aluno/.test(posDisparo.status) && posDisparo.fichasBia === 3, "disparo entrega o treino pré-montado pro grupo inteiro (Bia com as 3 fichas)");

  // limpa a aluna extra pra não afetar os testes seguintes
  await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    st.alunos = st.alunos.filter((a) => a.id !== "al-bia-grupo");
    delete st.treinosV2["al-bia-grupo"];
    (st.treinosGrupo || []).forEach((g) => delete st.treinosV2[g.id]);
    st.treinosGrupo = [];
    st.gruposPT = [];
    localStorage.setItem("mtapp:ptStudio", JSON.stringify(st));
    document.getElementById("tAluno").value = st.alunos[0].id;
    window.__gruposPT.render();
  });

  // agenda uma sessão futura pro app mostrar
  await abaPt(p, "agenda");
  await p.evaluate(() => window.__agAba("agendar"));
  await p.selectOption("#sAluno", { index: 1 });
  await p.evaluate(() => {
    const d = new Date(); d.setDate(d.getDate() + 2);
    document.getElementById("sData").value = d.toISOString().slice(0, 10);
  });
  await p.fill("#sHora", "07:30");
  await p.click("#sAdd");
  await abaPt(p, "treinos");

  // dobras cutâneas: Pollock 3 (M, 30 anos, 10+20+15mm → ~13,6%) e Guedes (→ ~16,8%)
  await abaPt(p, "avaliacoes");
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

  // circunferências: % gordura Marinha + RCQ (homem 175cm, pescoço 38, cintura 85, quadril 95)
  await p.selectOption("#ccSexo", "M");
  await p.fill("#ccAltura", "175");
  await p.fill("#ccPescoco", "38");
  await p.fill("#ccCintura", "85");
  await p.fill("#ccQuadril", "95");
  await p.fill("#ccCoxa", "58");
  await p.click("#ccCalc");
  const resCc = await p.evaluate(() => document.getElementById("ccResultado").textContent);
  ok(/16,9% de gordura/.test(resCc), "Marinha (US Navy) = 16,9% (conferido à mão)");
  ok(/RCQ 0,89/.test(resCc) && /risco baixo/.test(resCc), "RCQ 0,89 com classificação de risco baixo");
  await p.evaluate(() => { document.getElementById("avGord").value = ""; document.getElementById("avCintura").value = ""; });
  await p.click("#ccCalc");
  const preencheu = await p.evaluate(() => ({ g: document.getElementById("avGord").value, c: document.getElementById("avCintura").value }));
  ok(preencheu.g === "16.9" && preencheu.c === "85", "resultado das circunferências preenche a avaliação");
  await p.selectOption("#avAluno", { index: 1 });
  await p.click("#avAdd");
  const comCirc = await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    return st.avaliacoes[st.avaliacoes.length - 1];
  });
  ok(comCirc.rcq === 0.89 && comCirc.quadril === 95 && comCirc.circ && comCirc.circ.coxa === 58, "avaliação salva com circunferências, quadril e RCQ");
  // limpa pra não interferir nos testes de evolução seguintes
  await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    st.avaliacoes = [];
    localStorage.setItem("mtapp:ptStudio", JSON.stringify(st));
  });

  // avaliações: registra 2 e vê evolução
  await abaPt(p, "avaliacoes");
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

  // histórico recolhível por aluno: fechado por padrão, clicar no nome abre e fecha
  await p.evaluate(() => window.__avAba("historico"));
  ok(await p.evaluate(() => {
    const d = document.querySelector('#listaAvaliacoes details[data-avdet]');
    return !!d && !d.open;
  }), "histórico agrupado por aluno começa fechado");
  await p.click("#listaAvaliacoes details[data-avdet] summary");
  ok(await p.evaluate(() => document.querySelector('#listaAvaliacoes details[data-avdet]').open), "clicar no nome do aluno abre o histórico dele");
  // re-render (remove nada, só re-renderiza) preserva aberto — depois fecha de novo
  await p.click("#listaAvaliacoes details[data-avdet] summary");
  ok(await p.evaluate(() => !document.querySelector('#listaAvaliacoes details[data-avdet]').open), "clicar de novo fecha");
  await p.evaluate(() => window.__avAba("avaliar"));

  // relatórios
  await abaPt(p, "relatorios");
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

  // ---------- dashboard gerencial (estilo Resumo Gerencial da academia) ----------
  console.log("Dashboard gerencial:");
  await abaPt(p, "dash");
  ok(await p.evaluate(() => !document.getElementById("vDash").hidden && !document.getElementById("kpis").hidden), "voltar pro Dashboard mantém os KPIs visíveis");
  const dash = await p.evaluate(() => ({
    receb: document.getElementById("bRecebP").textContent,
    base: document.getElementById("bBaseP").textContent,
    mov: document.getElementById("bMovP").textContent,
    ind: document.getElementById("bIndP").textContent,
    ag: document.getElementById("bAgP").textContent,
    app: document.getElementById("bAppP").textContent,
  }));
  ok(/Recebido no mês/.test(dash.receb) && /R\$\s?400/.test(dash.receb), "bloco Recebimentos com a receita do mês (R$ 400)");
  ok(/Com contrato de plano/.test(dash.base) && /Alunos ativos/.test(dash.base), "bloco Status da base renderiza");
  ok(/Novos alunos no mês/.test(dash.mov) && /Churn do mês/.test(dash.mov), "bloco Movimentação com churn");
  ok(/MRR/.test(dash.ind) && /Ticket médio/.test(dash.ind) && /LTV/.test(dash.ind) && /R\$/.test(dash.ind), "bloco Indicadores com MRR, ticket médio e LTV");
  ok(/Taxa de presença/.test(dash.ag) && /Horário mais cheio/.test(dash.ag), "bloco Agenda e presença renderiza");
  ok(/Com ficha de treino montada/.test(dash.app), "bloco App e treinos renderiza");
  // metas com projeção run-rate
  await p.fill("#mtFatP", "1000");
  await p.click("#mtSalvarP");
  ok(await p.evaluate(() => /meta R\$\s?1\.000/.test(document.getElementById("mtPainelP").textContent) && /projeção/.test(document.getElementById("mtPainelP").textContent)),
    "meta salva aparece no painel com projeção run-rate");
  // fechamento do mês pronto pra mandar
  const fch = await p.evaluate(() => window.__dashPT.resumo(new Date().toISOString().slice(0, 7)));
  ok(/Receita: R\$/.test(fch) && /Novos alunos:/.test(fch) && /Sessões dadas:/.test(fch), "resumo de fechamento com receita, novos e sessões");
  await p.click("#fchCopiaP");
  ok(await p.evaluate(() => /copiado/.test(document.getElementById("fchStatusP").textContent)), "copiar resumo confirma");

  // ---------- dia a dia e retenção: Seu dia hoje, radar, alertas com ação, badges, pushes ----------
  console.log("Dia a dia e retenção:");
  {
    const stAntesC = await p.evaluate(() => localStorage.getItem("mtapp:ptStudio"));
    const hoje = new Date().toISOString().slice(0, 10);
    await p.evaluate((hoje) => {
      const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
      const j = st.alunos.find((a) => a.nome === "João Cliente");
      j.zap = j.zap || "31999990000";
      st.sessoes.push({ id: "sc1", alunoId: j.id, data: hoje, hora: "07:30", feita: false });
      const d6 = new Date(); d6.setDate(d6.getDate() - 6);
      st.alunos.push({ id: "axPar", nome: "Parado Silva", ativo: true, zap: "31988887777" });
      st.sessoes.push({ id: "sc2", alunoId: "axPar", data: d6.toISOString().slice(0, 10), feita: true });
      localStorage.setItem("mtapp:ptStudio", JSON.stringify(st));
    }, hoje);
    await p.reload();
    await p.waitForTimeout(700);

    // card Seu dia hoje no Início
    const hojeCard = await p.evaluate(() => document.getElementById("bHojeP").innerHTML);
    ok(/07:30/.test(hojeCard) && /João Cliente/.test(hojeCard) && /data-feita="sc1"/.test(hojeCard), "card Seu dia hoje lista a sessão com botão Feita");

    // toque no nome → treino do dia + atalhos
    await p.evaluate(() => document.querySelector("#bHojeP [data-vernome]").click());
    await p.waitForFunction(() => document.getElementById("dlgDiaAluno").open);
    const sheet = await p.evaluate(() => ({
      nome: document.getElementById("daNome").textContent,
      treino: document.getElementById("daTreino").textContent,
      zapEscondido: document.getElementById("daZap").hidden,
    }));
    ok(/João/.test(sheet.nome) && /Supino reto/.test(sheet.treino) && !sheet.zapEscondido, "toque no nome abre o treino do dia com atalho de Zap");
    await p.click("#daFechar");

    // Feita direto do Início
    await p.evaluate(() => document.querySelector('#bHojeP [data-feita="sc1"]').click());
    await p.waitForTimeout(250);
    ok(await p.evaluate(() => JSON.parse(localStorage.getItem("mtapp:ptStudio")).sessoes.find((x) => x.id === "sc1").feita === true),
      "marcar Feita direto do card do Início funciona");

    // radar de retenção
    const radar = await p.evaluate(() => document.getElementById("bRadarP").innerHTML);
    ok(/Parado Silva/.test(radar) && /6 dias sem treinar/.test(radar) && /Resgatar no Zap/.test(radar), "radar de retenção lista quem parou, com botão de resgate");

    // alertas com botão de ação: sem ficha → Montar treino leva pra aba certa com o aluno escolhido
    const alHtml = await p.evaluate(() => document.getElementById("relAlertas").innerHTML);
    ok(/data-altreino="axPar"/.test(alHtml) && /Montar treino/.test(alHtml), "alerta de aluno sem ficha ganhou o botão Montar treino");
    await p.evaluate(() => document.querySelector('#relAlertas [data-altreino="axPar"]').click());
    await p.waitForTimeout(250);
    ok(await p.evaluate(() => !document.getElementById("vTreinos").hidden && document.getElementById("tAluno").value === "axPar"),
      "botão do alerta abre Treinos já com o aluno escolhido");

    // badges no menu inferior (chat não lido + pedidos de horário, nuvem mockada)
    const badges = await p.evaluate(async () => {
      const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
      st.alunos.find((a) => a.nome === "João Cliente").appTokenP = "tok-b";
      localStorage.setItem("mtapp:ptStudio", JSON.stringify(st));
      const consulta = (resp) => { const o = { then: (fn) => Promise.resolve(resp).then(fn) }; ["eq", "gte", "in", "order", "limit"].forEach((k) => { o[k] = () => o; }); return o; };
      window.__cloudOrigB = window.MTStore.cloud;
      window.MTStore.cloud = () => ({ aid: "a1", client: { from: (t) => ({ select: () => consulta(t === "app_chat"
        ? { data: [{ token: "tok-b", de: "aluno", lida: false }, { token: "tok-b", de: "aluno", lida: false }] }
        : { data: [{ id: "p1", token: "tok-b" }] }) }) } });
      window.__badgesRun();
      await new Promise((r) => setTimeout(r, 200));
      window.MTStore.cloud = window.__cloudOrigB;
      return {
        info: window.__badgesPT,
        menu: (document.querySelector("#btnMenuPt .nav-bad") || {}).textContent || "",
        ag: (document.querySelector('#navPt [data-nav="agenda"] .nav-bad') || {}).textContent || "",
      };
    });
    ok(badges.info && badges.info.chat === 2 && badges.menu === "2", "badge de mensagens não lidas aparece no botão Menu");
    ok(badges.info.pedidos === 1 && badges.ag === "1", "badge de pedidos de horário aparece na Agenda");

    // pushes de retenção: aniversário, resgate do sumido e fim do desafio
    const pushesR = await p.evaluate(async () => {
      const hoje = new Date().toISOString().slice(0, 10);
      const ontem = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
      const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
      const par = st.alunos.find((a) => a.id === "axPar");
      par.appTokenP = "tok-par";
      par.nasc = "1990" + hoje.slice(4);
      st.desafio = { nome: "Desafio Agosto", ini: "2020-01-01", fim: ontem, premio: "1 mês grátis" };
      localStorage.setItem("mtapp:ptStudio", JSON.stringify(st));
      window.__cloudOrigRg2 = window.MTStore.cloud;
      window.__mtCloudOrig2 = window.MT_CLOUD;
      window.__fetchOrig2 = window.fetch;
      window.__pushesC = [];
      window.MT_CLOUD = { url: "https://mock.local", anonKey: "k" };
      window.MTStore.cloud = () => ({ aid: "a1", client: { auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) } } });
      window.fetch = async (u, o) => { window.__pushesC.push(JSON.parse(o.body)); return { ok: true }; };
      window.__reguaPT();
      await new Promise((r) => setTimeout(r, 200));
      window.fetch = window.__fetchOrig2;
      window.MTStore.cloud = window.__cloudOrigRg2;
      window.MT_CLOUD = window.__mtCloudOrig2;
      return window.__pushesC.map((x) => x.titulo);
    });
    ok(pushesR.some((t) => /Parabéns/.test(t)), "push de aniversário sai no dia");
    ok(pushesR.some((t) => /Sentimos sua falta/.test(t)), "push de resgate pro aluno que sumiu 5+ dias");
    ok(pushesR.some((t) => /Desafio Agosto terminou/.test(t)), "aviso do fim do desafio sai no dia seguinte");

    // agendar sessão marca o app pra republicar (agenda entra no app)
    await abaPt(p, "agenda");
    await p.evaluate((hoje) => {
      const j = JSON.parse(localStorage.getItem("mtapp:ptStudio")).alunos.find((a) => a.nome === "João Cliente");
      document.getElementById("sAluno").value = j.id;
      document.getElementById("sData").value = hoje;
      document.getElementById("sHora").value = "09:15";
      document.getElementById("sAdd").click();
    }, hoje);
    await p.waitForTimeout(250);
    ok(await p.evaluate(() => !!JSON.parse(localStorage.getItem("mtapp:ptStudio")).alunos.find((a) => a.nome === "João Cliente").appEditEm),
      "agendar sessão marca o app do aluno pra republicar");

    // devolve o estado como estava
    await p.evaluate((s) => localStorage.setItem("mtapp:ptStudio", s), stAntesC);
    await p.reload();
    await p.waitForTimeout(700);
  }

  // ---------- gestão pro dia a dia: bloqueio, pacote, renovação, recibo, régua, aniversário ----------
  console.log("Gestão pro dia a dia:");
  // bloqueio de agenda: cria, risca o calendário e avisa; depois remove
  await abaPt(p, "agenda");
  await p.evaluate(() => window.__agAba("agendar"));
  const hojeISO = await p.evaluate(() => new Date(Date.now() + 12 * 3600e3).toISOString().slice(0, 10));
  await p.evaluate(() => {
    document.querySelector("#vAgenda details").open = true;
    document.getElementById("blDe").value = document.getElementById("sData").value || new Date().toISOString().slice(0, 10);
    document.getElementById("blMotivo").value = "féria-teste";
    document.getElementById("blDe").value = new Date().toISOString().slice(0, 10);
  });
  await p.click("#blAdd");
  ok(await p.evaluate(() => /féria-teste/.test(document.getElementById("blLista").textContent)), "bloqueio criado aparece na lista");
  ok(await p.evaluate(() => {
    const iso = new Date().toISOString().slice(0, 10);
    const cel = document.querySelector('#calAgenda .cal-dia[data-caldia="' + iso + '"]');
    return !!cel && cel.classList.contains("bloq");
  }), "dia bloqueado fica riscado no calendário");
  await p.evaluate(() => document.querySelector("#blLista [data-blrm]").click());
  ok(await p.evaluate(() => /Nenhum bloqueio/.test(document.getElementById("blLista").textContent)), "remover bloqueio limpa a lista");

  // pacote de sessões: vende no perfil, registra pagamento e desconta na sessão feita
  const joaoId2 = await p.evaluate(() => JSON.parse(localStorage.getItem("mtapp:ptStudio")).alunos.find((a) => a.nome === "João Cliente").id);
  await p.evaluate((id) => { window.__perfilPT(id); window.__pfAba("fin"); }, joaoId2);
  await p.evaluate(() => {
    let n = 0;
    window.__promptOrig = window.prompt;
    window.prompt = () => { n++; return n === 1 ? "10" : "1200"; };
  });
  await p.click("[data-pfpacote]");
  await p.waitForTimeout(250);
  await p.evaluate(() => { window.prompt = window.__promptOrig; });
  ok(await p.evaluate(() => /0 de 10 usadas/.test(document.getElementById("pfFin").textContent)), "pacote de 10 sessões vendido aparece no perfil");
  ok(await p.evaluate(() => JSON.parse(localStorage.getItem("mtapp:ptStudio")).pagamentos.some((x) => /pacote/.test(x.forma || "") && +x.valor === 1200)), "venda do pacote registra o pagamento de R$ 1.200");
  ok(await p.evaluate(() => /data-recibo/.test(document.getElementById("pfFin").innerHTML)), "pagamentos do perfil ganham o link de recibo");
  // sessão feita desconta do pacote
  await p.evaluate(() => document.getElementById("pfFechar").click());
  await abaPt(p, "agenda");
  await p.evaluate(() => window.__agAba("agendar"));
  await p.evaluate(() => { document.getElementById("sData").value = new Date().toISOString().slice(0, 10); });
  await p.selectOption("#sAluno", { index: 1 });
  await p.fill("#sHora", "20:00");
  await p.click("#sAdd");
  await p.evaluate(() => { window.__agAba("sessoes"); window.__agDia(new Date().toISOString().slice(0, 10)); });
  await p.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("#listaSessoes [data-feita]"));
    btns[btns.length - 1].click();
  });
  ok(await p.evaluate(() => {
    const a = JSON.parse(localStorage.getItem("mtapp:ptStudio")).alunos.find((x) => x.nome === "João Cliente");
    return a.pacote && a.pacote.usadas === 1;
  }), "sessão marcada como Feita desconta 1 do pacote");

  // renovação de contrato com 1 toque
  await p.evaluate((id) => { window.__perfilPT(id); window.__pfAba("fin"); }, joaoId2);
  await p.click("[data-pfctrenova]");
  await p.waitForTimeout(250);
  ok(await p.evaluate(() => {
    const ct = JSON.parse(localStorage.getItem("mtapp:ptStudio")).contratosPT.find((c) => c.status === "ativo");
    return ct.inicio === new Date().toISOString().slice(0, 10);
  }), "Renovar ciclo zera o início do contrato pra hoje");
  await p.evaluate(() => document.getElementById("pfFechar").click());

  // recibo também no histórico de pagamentos
  await abaPt(p, "pagamentos");
  ok(await p.evaluate(() => !!document.querySelector("#listaPagamentos [data-recibo]")), "histórico de pagamentos tem botão de recibo");
  ok(await p.evaluate(() => document.getElementById("reguaOn").checked), "régua de cobrança vem ligada por padrão");

  // régua/lembrete: com nuvem mockada, manda o push do treino do dia e não repete
  const regua1 = await p.evaluate(async () => {
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    st.alunos.find((a) => a.nome === "João Cliente").appTokenP = "tok-joao";
    st.sessoes.push({ id: "ses-regua", alunoId: st.alunos.find((a) => a.nome === "João Cliente").id, data: new Date().toISOString().slice(0, 10), hora: "21:30", feita: false });
    localStorage.setItem("mtapp:ptStudio", JSON.stringify(st));
    window.__cloudOrigRg = window.MTStore.cloud;
    window.__mtCloudOrig = window.MT_CLOUD;
    window.__fetchOrig = window.fetch;
    window.__pushes = [];
    window.MT_CLOUD = { url: "https://mock.local", anonKey: "k" };
    window.MTStore.cloud = () => ({ aid: "acad-1", client: { auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) } } });
    window.fetch = async (url, opts) => { window.__pushes.push(JSON.parse(opts.body)); return { ok: true }; };
    const r = window.__reguaPT();
    await new Promise((res) => setTimeout(res, 120));
    return { enviados: r.enviados, pushes: window.__pushes.length, titulo: (window.__pushes[0] || {}).titulo || "" };
  });
  ok(regua1.enviados >= 1 && /Hoje tem treino/.test(regua1.titulo), "lembrete de treino do dia sai pelo push do app");
  const regua2 = await p.evaluate(async () => {
    const r = window.__reguaPT();
    await new Promise((res) => setTimeout(res, 60));
    window.fetch = window.__fetchOrig;
    window.MTStore.cloud = window.__cloudOrigRg;
    window.MT_CLOUD = window.__mtCloudOrig;
    return r.enviados;
  });
  ok(regua2 === 0, "rodar a régua de novo no mesmo dia não repete o aviso");

  // push que FALHA não marca o log — a régua tenta de novo na rodada seguinte
  const reguaF = await p.evaluate(async () => {
    const hoje = new Date().toISOString().slice(0, 10);
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    const j = st.alunos.find((a) => a.nome === "João Cliente");
    j.appTokenP = "tok-joao";
    st.sessoes.push({ id: "ses-regua2", alunoId: j.id, data: hoje, hora: "22:00", feita: false });
    delete (st.pushLog || {})["treino|" + j.id + "|" + hoje];
    localStorage.setItem("mtapp:ptStudio", JSON.stringify(st));
    const chave = "treino|" + j.id + "|" + hoje;
    window.__cloudOrigRg = window.MTStore.cloud;
    window.__mtCloudOrig = window.MT_CLOUD;
    window.__fetchOrig = window.fetch;
    window.MT_CLOUD = { url: "https://mock.local", anonKey: "k" };
    window.MTStore.cloud = () => ({ aid: "acad-1", client: { auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) } } });
    window.fetch = async () => ({ ok: false });
    const r1 = window.__reguaPT();
    await new Promise((res) => setTimeout(res, 120));
    const marcouNaFalha = !!(JSON.parse(localStorage.getItem("mtapp:ptStudio")).pushLog || {})[chave];
    window.fetch = async () => ({ ok: true });
    const r2 = window.__reguaPT();
    await new Promise((res) => setTimeout(res, 120));
    const marcouNoOk = !!(JSON.parse(localStorage.getItem("mtapp:ptStudio")).pushLog || {})[chave];
    const r3 = window.__reguaPT();
    window.fetch = window.__fetchOrig;
    window.MTStore.cloud = window.__cloudOrigRg;
    window.MT_CLOUD = window.__mtCloudOrig;
    const st9 = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    const rodou = (st9.config || {}).reguaRodouEm || "";
    st9.sessoes = st9.sessoes.filter((x) => x.id !== "ses-regua2");
    delete st9.alunos.find((a) => a.nome === "João Cliente").appTokenP;
    localStorage.setItem("mtapp:ptStudio", JSON.stringify(st9));
    return { r1: r1.enviados, marcouNaFalha, r2: r2.enviados, marcouNoOk, r3: r3.enviados, rodou,
      status: document.getElementById("reguaStatus") ? document.getElementById("reguaStatus").textContent : "" };
  });
  ok(reguaF.r1 >= 1 && !reguaF.marcouNaFalha, "push que falhou NÃO marca o log (vai tentar de novo)");
  ok(reguaF.r2 >= 1 && reguaF.marcouNoOk && reguaF.r3 === 0, "na rodada seguinte o push sai, marca o log e não repete mais");
  ok(reguaF.rodou.startsWith(new Date().toISOString().slice(0, 10)) && /Última rodada/.test(reguaF.status),
    "reguaRodouEm registra a última rodada e o card mostra");
  await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    st.sessoes = st.sessoes.filter((x) => x.id !== "ses-regua");
    delete st.alunos.find((a) => a.nome === "João Cliente").appTokenP;
    localStorage.setItem("mtapp:ptStudio", JSON.stringify(st));
  });

  // aniversários dos próximos 7 dias no Dashboard
  await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    const d = new Date(); d.setDate(d.getDate() + 2);
    st.alunos.find((a) => a.nome === "João Cliente").nasc = "1990" + d.toISOString().slice(4, 10);
    localStorage.setItem("mtapp:ptStudio", JSON.stringify(st));
    window.__dashPT.render(st);
  });
  ok(await p.evaluate(() => /João Cliente/.test(document.getElementById("bNiverP").textContent) && /faz \d+ anos/.test(document.getElementById("bNiverP").textContent)),
    "card de aniversários lista quem faz aniversário na semana");

  // app do aluno gerado
  const appHtml = await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    return window.__montaAppAluno(st.alunos[0], new Date().toISOString());
  });
  ok(/A — Peito\/Tríceps/.test(appHtml) && /Supino reto/.test(appHtml) && /4×10/.test(appHtml), "app leva a ficha estruturada (Supino 4×10)");
  ok(/<details/.test(appHtml) && /Pegada na largura dos ombros/.test(appHtml), "cada exercício é uma sub-página com a descrição");
  ok(/Sem esse aparelho hoje\?/.test(appHtml) && /Troca por: /.test(appHtml), "exercícios trazem substitutos do mesmo padrão de movimento");
  ok(/sconfBox/.test(appHtml) && /Confirmo presença/.test(appHtml) && /app_chat_envia/.test(appHtml), "próxima sessão tem os botões Vou/Não vou que avisam pelo chat");
  ok(/onbCard/.test(appHtml) && /rpeBox/.test(appHtml) && /dcReps/.test(appHtml) && /streakSem/.test(appHtml) && /cfQueda/.test(appHtml),
    "app traz onboarding, RPE, campo de reps, streak de semanas e confete");
  // painel do personal entende RPE e onboarding devolvidos pelo app
  const painelNovo = await p.evaluate(() => {
    const hoje = new Date().toISOString().slice(0, 10);
    const rpe = {}; rpe[hoje] = 3;
    return window.__painelApp({ feitos: {}, rpe, onb: { obj: "emagrecer", dias: "4", dor: "joelho estala" } });
  });
  ok(/Esforço percebido/.test(painelNovo) && /Pesado/.test(painelNovo) && /considere aliviar/.test(painelNovo),
    "painel mostra o esforço percebido (RPE) com alerta de treino pesado");
  ok(/Como o aluno se apresentou/.test(painelNovo) && /emagrecer/.test(painelNovo) && /joelho estala/.test(painelNovo),
    "painel mostra objetivo, dias e a dor relatada no onboarding");
  ok(/>Ver vídeo</.test(appHtml) && /youtube\.com\/watch\?v=abc123/.test(appHtml), "exercício com vídeo ganha o botão Ver vídeo");
  ok(/youtube\.com\/results\?search_query=/.test(appHtml), "exercício sem vídeo próprio ganha demonstração automática do YouTube");
  ok(/gVideo/.test(appHtml) && />Como fazer</.test(appHtml), "modo guiado tem o link Como fazer");
  ok(/dcExs/.test(appHtml), "diário de cargas sugere os exercícios da ficha");
  ok(appHtml.includes("if(!Object.keys(L('ptpeso',{})).length&&!Object.keys(L('ptdc',{})).length"),
    "app num celular novo (sem registro local) NÃO devolve dados vazios pra nuvem");
  ok(/setbtn/.test(appHtml) && /tmrbtn/.test(appHtml), "exercícios têm botões de séries e cronômetro");
  ok(/>Descanso 100s</.test(appHtml) && /100s ›/.test(appHtml), "descanso programado (100s) vira o cronômetro principal do exercício no app");
  ok(/"d":100/.test(appHtml), "treino guiado usa o descanso programado do exercício");
  ok(/Minhas sessões/.test(appHtml) && /07:30/.test(appHtml), "próximas sessões embutidas no app");
  ok(/Agenda<\/h2>/.test(appHtml) && /agCal/.test(appHtml) && /app_agenda_pede/.test(appHtml) && /app_agenda_lista/.test(appHtml), "app tem agenda estilo calendário com pedido de horário pela nuvem");
  ok(/data-agics/.test(appHtml) && /AGTIT/.test(appHtml) && /VCALENDAR/.test(appHtml), "horário confirmado no app tem o botão 📅 salvar no calendário");
  ok(/cardNotif/.test(appHtml) && /app_aluno_push/.test(appHtml) && /app-sw\.js/.test(appHtml), "app registra push pelo link hospedado (lembretes)");
  ok(/navApp/.test(appHtml) && /trocaSec/.test(appHtml) && !/hambApp/.test(appHtml), "app tem barra de abas fixa embaixo (estilo app nativo, sem gaveta)");
  ok(/manifest\.webmanifest/.test(appHtml) && /theme-color/.test(appHtml) && /apple-touch-icon/.test(appHtml), "app instala como PWA de verdade (manifest + theme-color + ícone iOS)");
  ok(await p.evaluate(async () => {
    const t = await (await fetch("app/index.html")).text();
    return /tq_app_html/.test(t) && /localStorage\.getItem\("tq_app_token"\)/.test(t) && /copiaLocal/.test(t);
  }), "abridor do app guarda cópia offline e reusa o token do aparelho");
  ok(/app_aluno_devolve/.test(appHtml) && /devolveApp/.test(appHtml), "app devolve peso/cargas/treinos/fotos pro personal (sincronização)");
  ok(/com o seu personal/.test(appHtml), "texto das fotos avisa que o personal também vê");
  ok(/btnCardStories/.test(appHtml) && /Gerar card pro Stories/.test(appHtml), "conquistas têm o botão de card pro Stories");
  ok(/Indique um amigo/.test(appHtml) && /quem%20indicou%20foi/.test(appHtml) && /Convidar no WhatsApp/.test(appHtml), "app tem o card 🎁 Indique um amigo com convite pronto");

  // acesso do aluno por e-mail (site com login e senha)
  ok(await p.evaluate(() => !!document.getElementById("aEmail") && !!document.getElementById("aAcessoStatus")), "cadastro rápido tem o campo de e-mail que cria o acesso do app");
  ok(await p.evaluate(() => !!document.getElementById("pfAcesso")), "perfil do aluno tem o botão 📧 Enviar acesso do app");
  {
    const acesso = await p.evaluate(async () => {
      const senha = window.__acessoAluno.senha();
      window.__cloudOrig = window.MTStore.cloud;
      window.__fetchOrig = window.fetch;
      const chamadas = { upsert: 0, rpc: null, email: null };
      window.MTStore.cloud = () => ({
        aid: "acad-teste",
        client: {
          from: () => ({ upsert: () => { chamadas.upsert++; return Promise.resolve({ data: [] }); } }),
          rpc: (fn, args) => { chamadas.rpc = { fn, login: args.p_login, temSenha: (args.p_senha || "").length >= 8 }; return Promise.resolve({ data: { ok: true, login: args.p_login } }); },
          auth: { getSession: () => Promise.resolve({ data: { session: { access_token: "tok-teste" } } }) },
        },
      });
      window.fetch = (url, opts) => {
        if (String(url).includes("functions/v1/envia-email")) {
          chamadas.email = JSON.parse(opts.body);
          return Promise.resolve({ status: 200, json: () => Promise.resolve({ ok: true }) });
        }
        return window.__fetchOrig(url, opts);
      };
      const st = window.MTStore.read("ptStudio", {});
      st.alunos[0].email = "joao.teste@email.com";
      window.MTStore.write("ptStudio", st);
      const r = await new Promise((res) => window.__acessoAluno.cria(st.alunos[0].id, res));
      // segunda chamada com a função de e-mail fora do ar → fallback com senha visível
      window.fetch = (url, opts) => {
        if (String(url).includes("functions/v1/envia-email")) return Promise.reject(new Error("offline"));
        return window.__fetchOrig(url, opts);
      };
      const r2 = await new Promise((res) => window.__acessoAluno.cria(st.alunos[0].id, res));
      window.fetch = window.__fetchOrig;
      window.MTStore.cloud = window.__cloudOrig;
      return { senha, chamadas, r, r2 };
    });
    ok(acesso.senha.length === 10 && !/[0OIl1]/.test(acesso.senha), "senha aleatória de 10 caracteres sem letras confusas (0/O/1/l)");
    ok(acesso.chamadas.upsert >= 2 && acesso.chamadas.rpc.fn === "aluno_define_login" && acesso.chamadas.rpc.login === "joao.teste@email.com" && acesso.chamadas.rpc.temSenha, "acesso publica o app e cria o login com o e-mail + senha aleatória");
    ok(acesso.r.ok && !acesso.r.semEmail && acesso.chamadas.email && acesso.chamadas.email.para === "joao.teste@email.com" && /Seu acesso ao app/.test(acesso.chamadas.email.assunto) && /Senha temporária/.test(acesso.chamadas.email.html) && /aluno-login\.html/.test(acesso.chamadas.email.html), "e-mail de acesso sai com login, senha temporária e o link de entrada");
    ok(acesso.r2.ok && acesso.r2.semEmail && acesso.r2.senha && acesso.r2.email === "joao.teste@email.com", "sem a função de e-mail, o acesso é criado e a senha aparece pro personal mandar no WhatsApp");
    ok(await p.evaluate(() => !!window.MTStore.read("ptStudio", {}).alunos[0].acessoEm), "acesso criado fica marcado no aluno (vira o selo 📱 APP ✓ na lista)");
    const msgFb = await p.evaluate(() => window.__acessoAluno.msg({ ok: true, semEmail: true, email: "a@b.com", senha: "Xy2Xy2Xy2X", motivo: "teste" }, { nome: "João Cliente", zap: "31988887777" }));
    ok(/Xy2Xy2Xy2X/.test(msgFb) && /wa\.me\/5531988887777/.test(msgFb), "mensagem de fallback traz a senha e o botão de WhatsApp");
  }
  {
    const comMural = await p.evaluate(() => {
      const st = window.MTStore.read("ptStudio", {});
      st.config = st.config || {};
      st.config.mural = ["Treinão de sábado 7h no parque! 🌳"];
      window.MTStore.write("ptStudio", st);
      return window.__montaAppAluno(window.MTStore.read("ptStudio", {}).alunos[0], new Date().toISOString());
    });
    ok(/Mural do studio/.test(comMural) && /Treinão de sábado/.test(comMural), "aviso do mural entra no app do aluno");
    ok(await p.evaluate(() => !!document.getElementById("cfgMural")), "módulo tem o campo 📌 Mural na ilha");
  }
  ok(/Conquistas<\/h2>/.test(appHtml) && /cqGrid/.test(appHtml) && /Treinos por semana/.test(appHtml), "app tem painel de conquistas com gráfico de semanas");
  ok(/7 dias seguidos/.test(appHtml) && /100 treinos/.test(appHtml) && /CONQUISTADA/.test(appHtml), "medalhas de sequência e volume no app");
  ok(/botChips/.test(appHtml) && />assistente</.test(appHtml) && /botEscolhe/.test(appHtml), "app tem o robô de atendimento (chatbot de menu) no chat");
  ok(/Pode escrever aqui embaixo/.test(appHtml), "opção 'humano' vira encaminhamento pro personal");
  {
    const botEd = await p.evaluate(() => ({
      temCard: !!document.getElementById("botAtivoP"),
      ativo: document.getElementById("botAtivoP").checked,
      ops: document.getElementById("botOpsP").value,
    }));
    ok(botEd.temCard && botEd.ativo, "módulo tem o editor do robô, ligado por padrão");
    ok(/\|/.test(botEd.ops) && /humano/.test(botEd.ops), "opções padrão no formato Rótulo | Resposta com encaminhamento humano");
    const fluxo = await p.evaluate(() => {
      const desenho = {
        paths: document.querySelectorAll("#botFluxoP svg path").length,
        baloes: document.querySelectorAll("#botFluxoP .bb-bloco").length,
        temZap: !!document.getElementById("botZapP"),
        temBar: !!document.querySelector("#botFluxoP #bbSel") && !!document.querySelector("#botFluxoP #bbNova") && !!document.querySelector("#botFluxoP #bbPrincipal"),
      };
      const f = window.__botFluxoP({ ativo: true, oi: "Oi!", ops: [{ r: "Horários", t: "Na Agenda." }, { r: "Falar comigo", t: "humano" }] }, "Léo");
      return { desenho, inicio: f.inicio, tipos: f.blocos.map((b) => b.tipo), menuOps: f.blocos[1].opcoes.length, voltaMenu: f.blocos[2].destino, opDestino: f.blocos[1].opcoes[0].destino, temPos: !!f.blocos[0].pos };
    });
    ok(fluxo.desenho.paths >= 5 && fluxo.desenho.baloes >= 6, "construtor desenhado com linhas e balões arrastáveis");
    ok(fluxo.desenho.temZap && fluxo.desenho.temBar, "barra de automações (+ Nova, seletor, 📶) e Publicar no WhatsApp");
    ok(fluxo.inicio === "b_oi" && fluxo.tipos.join() === "mensagem,menu,mensagem,equipe", "fluxo no formato do chatbot da academia (mensagem → menu → respostas/equipe)");
    ok(fluxo.menuOps === 2 && fluxo.voltaMenu === "b_menu" && fluxo.opDestino === "b_r0" && fluxo.temPos, "destino/pos no formato que o webhook anda de verdade");
  }
  {
    const perModulo = await p.evaluate(() => document.body.innerHTML);
    if (!/cardPedidosApp/.test(perModulo)) ok(false, "módulo tem o card de pedidos do app na Agenda");
    else ok(true, "módulo tem o card de pedidos do app na Agenda");
  }

  // ---------- perfil completo do aluno ----------
  console.log("Perfil do aluno:");
  await abaPt(p, "alunos");
  ok(await p.evaluate(() => !!document.querySelector('[data-perfil]')), "lista tem o botão 👤 Perfil");
  await p.evaluate(() => document.querySelector("[data-perfil]").click());
  let perfil = await p.evaluate(() => ({
    aberto: !document.getElementById("vPerfil").hidden && document.getElementById("vAlunos").hidden,
    titulo: document.getElementById("pfTitulo").textContent,
    fin: document.getElementById("pfFin").textContent,
    freq: document.getElementById("pfFreq").textContent,
    peso: document.getElementById("pfPeso").textContent,
    ficha: document.getElementById("pfFicha").textContent,
  }));
  ok(perfil.aberto && /João Cliente/.test(perfil.titulo), "perfil abre como PÁGINA própria (lista some) com o nome do aluno");
  // cadastro completo: campos novos salvam
  await p.evaluate(() => {
    document.getElementById("pfEmail").value = "joao@email.com";
    document.getElementById("pfAltura").value = "178";
    document.getElementById("pfProfissao").value = "Engenheiro";
    document.getElementById("pfEmergencia").value = "Maria 31 98888-0000";
  });
  ok(/Contrato/.test(perfil.fin) && /Mensal 3x/.test(perfil.fin) && /pago/.test(perfil.fin), "financeiro mostra contrato e status do mês");
  ok(/sessão\(ões\) feitas/.test(perfil.freq), "frequência de treino com gráfico de sessões");
  ok(/Data/.test(perfil.peso) && /90 kg|84 kg/.test(perfil.peso), "relatório de avaliações em tabela (peso registrado)");
  ok(/% gordura/.test(perfil.peso) && /25%|19,5%/.test(perfil.peso), "tabela traz % de gordura das avaliações");
  ok(/Peso.*de 90 pra 84 kg/.test(perfil.peso.replace(/\s+/g, " ")) || (/de 90/.test(perfil.peso) && /84 kg/.test(perfil.peso)), "gráfico de evolução do peso (90 → 84 kg)");
  ok(/% de gordura/.test(perfil.peso) && /-5,5|19,5/.test(perfil.peso), "gráfico de evolução da % de gordura");
  ok(/exercício/.test(perfil.ficha) || /Sem ficha/.test(perfil.ficha), "resumo da ficha atual presente");
  // edita dados e salva
  await p.evaluate(() => {
    document.getElementById("pfObjetivo").value = "Hipertrofia";
    document.getElementById("pfPagto").value = "pix";
    document.getElementById("pfSalvar").click();
  });
  await p.waitForTimeout(200);
  const salvo = await p.evaluate(() => {
    const st = window.MTStore.read("ptStudio", {});
    const a = st.alunos.find((x) => x.ativo !== false);
    return { obj: a.objetivo, pagto: a.pagto, email: a.email, altura: a.altura, prof: a.profissao, emerg: a.emergencia };
  });
  ok(salvo.obj === "Hipertrofia" && salvo.pagto === "pix", "objetivo e método de pagamento salvos no cadastro");
  ok(salvo.email === "joao@email.com" && salvo.altura === 178 && salvo.prof === "Engenheiro" && /Maria/.test(salvo.emerg), "cadastro completo salva e-mail, altura, profissão e emergência");
  // anamnese completa: PAR-Q + histórico + hábitos
  ok(await p.evaluate(() => /não respondido/.test(document.getElementById("pfParqBadge").textContent)), "badge avisa que o PAR-Q não foi respondido");
  await p.evaluate(() => {
    document.getElementById("parq5").checked = true;
    document.getElementById("anLesoes").value = "LCA em 2020";
    document.getElementById("anNivel").value = "intermediário";
    document.getElementById("anDias").value = "4";
    document.getElementById("anSono").value = "7–8h";
    document.getElementById("pfAnSalvar").click();
  });
  await p.waitForTimeout(200);
  const anam = await p.evaluate(() => {
    const st = window.MTStore.read("ptStudio", {});
    const a = st.alunos.find((x) => x.ativo !== false);
    return { an: a.anamnese, badge: document.getElementById("pfParqBadge").textContent };
  });
  ok(anam.an.parq5 === true && anam.an.lesoes === "LCA em 2020" && anam.an.nivel === "intermediário" && anam.an.dias === "4", "anamnese salva PAR-Q, lesões, nível e disponibilidade");
  ok(/liberação médica/.test(anam.badge), "PAR-Q com SIM mostra alerta de liberação médica");
  await p.evaluate(() => { document.getElementById("parq5").checked = false; document.getElementById("pfAnSalvar").click(); });
  await p.waitForTimeout(200);
  ok(await p.evaluate(() => /liberado/.test(document.getElementById("pfParqBadge").textContent)), "sem nenhum SIM, badge vira PAR-Q liberado");
  // dados do app do aluno sincronizados (nuvem simulada com retorno)
  {
    await p.evaluate(() => {
      const st = window.MTStore.read("ptStudio", {});
      const a = st.alunos.find((x) => x.ativo !== false);
      a.appTokenP = "tok-sync-teste";
      window.MTStore.write("ptStudio", st);
      const px = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
      window.__cloudOrig = window.MTStore.cloud;
      // respostas de questionário (tabela app_quest) que viram métricas no painel
      const qRows = [
        { questionario: "Check-in semanal", criado: "2026-08-03T10:00:00Z", dados: { pontuacao: 9, respostas: [{ sigla: "MOTEX", resposta: "Altíssimo", pontos: 2 }] } },
        { questionario: "Check-in semanal", criado: "2026-07-27T10:00:00Z", dados: { pontuacao: 6, respostas: [] } },
        { questionario: "Check-in semanal", criado: "2026-07-20T10:00:00Z", dados: { pontuacao: 2, respostas: [] } },
      ];
      const qMock = { select: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: qRows }) }) }) }) };
      window.MTStore.cloud = () => ({
        aid: "x",
        client: { from: (tb) => tb === "app_quest" ? qMock : ({ select: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: [{ retorno: {
          peso: { "2026-07-01": 86, "2026-07-20": 84.2, "2026-08-01": 83.1 },
          cargas: { "Supino reto": [{ d: "2026-07-01", kg: 60 }, { d: "2026-08-01", kg: 72.5 }] },
          feitos: { "2026-07-02": 1, "2026-07-03": 1, "2026-07-04": 1, "2026-08-01": 1 },
          habitos: (() => {
            const h = {};
            for (let i = 0; i < 10; i++) {
              const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
              h[d] = { 0: true, 1: i % 2 === 0, 2: true, 3: false };
            }
            return h;
          })(),
          fotoAntes: px, fotoAntesD: "2026-05-01", fotoDepois: px, fotoDepoisD: "2026-08-01",
        } }] }) }) }) }) },
      });
      window.__perfilPT(a.id);
    });
    await p.waitForTimeout(400);
    const appDados = await p.evaluate(() => document.getElementById("pfAppDados").innerHTML);
    ok(/Peso na balança/.test(appDados) && /83,1/.test(appDados), "peso da balança do app aparece no perfil (83,1 kg)");
    ok(/<svg/.test(appDados) && /polyline/.test(appDados) && /mín 83,1/.test(appDados) && /máx 86/.test(appDados), "⚖️ peso vira gráfico de linha com mín/máx");
    ok(/Peso atual/.test(appDados) && /-2,9 kg/.test(appDados), "KPI de peso atual com a diferença desde o início (-2,9 kg)");
    ok(/Evolução de carga/.test(appDados) && /72,5 kg/.test(appDados) && /\+12,5/.test(appDados), "cargas do diário do aluno com delta (+12,5)");
    ok(/stroke=["']#4ade80["']/.test(appDados), "cada exercício ganha um mini gráfico (sparkline) da carga");
    ok(/Treinos marcados no app/.test(appDados) && /4 no total/.test(appDados), "treinos feitos no app contados");
    ok(/Maior sequência/.test(appDados) && /3 dias/.test(appDados), "KPI de maior sequência de treinos (3 dias seguidos)");
    ok(/Hábitos diários/.test(appDados) && /Água/.test(appDados) && /100%/.test(appDados), "hábitos do aluno viram barras de % (água 100%)");
    ok(/Hábitos em dia/.test(appDados) && /50%/.test(appDados), "KPI de dias com 3+ hábitos nos últimos 30 dias (50%)");
    ok(/ANTES/.test(appDados) && /AGORA/.test(appDados) && /<img/.test(appDados), "fotos antes × depois do aluno aparecem pro personal");
    ok(/Check-ins respondidos no app/.test(appDados) && /3 no total/.test(appDados), "respostas de questionário (app_quest) viram seção de check-ins");
    ok(/stroke=["']#fbbf24["']/.test(appDados) && /mín 2/.test(appDados) && /máx 9/.test(appDados), "pontuação dos check-ins vira gráfico de linha (mín 2 / máx 9)");
    ok(/\+9 pts/.test(appDados) && /MOTEX/.test(appDados), "última resposta listada com pontuação e siglas");
    ok(/Check-ins/.test(appDados) && /último em 03\/08/.test(appDados), "KPI de check-ins com a data do último");
    // aluno malicioso tentando injetar código pela foto/data do retorno
    const xss = await p.evaluate(async () => {
      window.MTStore.cloud = () => ({ aid: "x", client: { from: () => ({ select: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: [{ retorno: {
        fotoAntes: "x' onerror='window.__xssHit=1", fotoAntesD: "1234567'><b>9",
      } }] }) }) }) }) } });
      window.__perfilPT(window.MTStore.read("ptStudio", {}).alunos[0].id);
      await new Promise((r) => setTimeout(r, 350));
      return { html: document.getElementById("pfAppDados").innerHTML, hit: !!window.__xssHit };
    });
    ok(!xss.hit && !/onerror/.test(xss.html) && !/Fotos de progresso/.test(xss.html), "foto maliciosa vinda do app é descartada (anti-XSS)");
    await p.evaluate(() => { window.MTStore.cloud = window.__cloudOrig; });
  }
  // abas do perfil (pra tela não ficar tumultuada)
  {
    const abas = await p.evaluate(() => {
      window.__perfilPT(window.MTStore.read("ptStudio", {}).alunos[0].id);
      const vis = (id) => !document.getElementById(id).closest("[data-pfsec]").hidden;
      const antes = { app: vis("pfAppDados"), cadastro: vis("pfNome"), fin: vis("pfFin") };
      document.querySelector('#pfAbas [data-pfa="cadastro"]').click();
      const depois = { app: vis("pfAppDados"), cadastro: vis("pfNome"), ativa: document.querySelector("#pfAbas .ativa").getAttribute("data-pfa") };
      return { antes, depois, nBotoes: document.querySelectorAll("#pfAbas button").length };
    });
    ok(abas.nBotoes === 6 && abas.antes.app && !abas.antes.cadastro && !abas.antes.fin, "perfil abre na aba 📲 App do aluno com as outras seções escondidas");
    ok(abas.depois.cadastro && !abas.depois.app && abas.depois.ativa === "cadastro", "clicar em 👤 Cadastro troca a seção e marca a aba ativa");
  }
  await p.evaluate(() => document.getElementById("pfFechar").click());
  ok(await p.evaluate(() => document.getElementById("vPerfil").hidden && !document.getElementById("vAlunos").hidden), "← Voltar retorna pra lista de alunos");

  // ---------- desafio em grupo (estilo GymRats) ----------
  console.log("Desafio em grupo:");
  await abaPt(p, "desafio");
  {
    const d = (off) => { const x = new Date(); x.setDate(x.getDate() + off); return x.toISOString().slice(0, 10); };
    await p.fill("#dsNome", "30 dias TORQUE");
    await p.fill("#dsIni", d(-10));
    await p.fill("#dsFim", d(20));
    await p.fill("#dsPremio", "1 mês grátis");
    await p.click("#dsSalvar");
    await p.waitForTimeout(200);
    const ds = await p.evaluate(() => window.MTStore.read("ptStudio", {}).desafio);
    ok(ds && ds.nome === "30 dias TORQUE" && ds.premio === "1 mês grátis", "desafio salvo com período e prêmio");
    ok(/rolando até/.test(await p.evaluate(() => document.getElementById("dsStatus").textContent)), "status mostra desafio rolando");
    // placar com ranking simulado
    await p.evaluate(() => {
      window.__desafioPT.pinta(document.getElementById("dsRanking"),
        [{ nome: "João", dias: 12, ultimo: "2026-08-01" }, { nome: "Bia", dias: 9, ultimo: "2026-07-30" }, { nome: "Rafa", dias: 5, ultimo: null }], "1 mês grátis");
    });
    const placar = await p.evaluate(() => document.getElementById("dsRanking").textContent);
    ok(/1º João/.test(placar) && /2º Bia/.test(placar) && /3º Rafa/.test(placar) && /12/.test(placar), "placar com medalhas e contagem de treinos");
    ok(/1 mês grátis/.test(placar), "prêmio aparece no placar");
    // o app gerado com desafio ativo ganha o card + placar via rpc
    const appDesafio = await p.evaluate(() => {
      const st = window.MTStore.read("ptStudio", {});
      return window.__montaAppAluno(st.alunos.find((x) => x.ativo !== false), new Date().toISOString());
    });
    ok(/Desafio: 30 dias TORQUE/.test(appDesafio) && /app_desafio_ranking/.test(appDesafio) && /dsMeus/.test(appDesafio), "app do aluno leva o card do desafio com placar via nuvem");
    ok(/nome:PRIMEIRO/.test(appDesafio.replace(/\s/g, "")) || /nome:PRIMEIRO/.test(appDesafio), "app envia o nome do aluno pro ranking (devolve)");
  }

  // ---------- questionários personalizados (estilo LiveClin) ----------
  console.log("Questionários personalizados:");
  await abaPt(p, "quest");
  ok(await p.evaluate(() => document.querySelector('#qtAbas button.ativa').textContent.includes("Enviar")), "Questionários abre na sub-aba Enviar");
  await p.evaluate(() => window.__qtAba("montar"));
  await p.fill("#qpSigla", "motex");
  await p.fill("#qpTitulo", "Motivação");
  await p.fill("#qpTexto", "Qual foi sua motivação pra treinar nos últimos 7 dias?");
  await p.click("#qpAdd");
  await p.fill("#qpSigla", "AEROB");
  await p.fill("#qpTitulo", "Aeróbico");
  await p.selectOption("#qpTipo", "linear");
  await p.fill("#qpTexto", "De 0 a 10, quanto cardio você fez essa semana?");
  await p.click("#qpAdd");
  const qpTxt = await p.evaluate(() => document.getElementById("qpLista").textContent);
  ok(/MOTEX/.test(qpTxt) && /AEROB/.test(qpTxt), "perguntas salvas com sigla em maiúsculas (MOTEX, AEROB)");
  await p.fill("#qqNome", "Check-in semanal");
  await p.evaluate(() => document.querySelectorAll(".qqCheck").forEach((c) => { c.checked = true; }));
  await p.click("#qqAdd");
  ok(/Check-in semanal/.test(await p.evaluate(() => document.getElementById("qqLista").textContent)), "questionário criado com as 2 perguntas");
  await p.evaluate(() => window.__qtAba("enviar"));
  await p.selectOption("#qeAluno", { index: 1 });
  await p.selectOption("#qeQuest", { index: 1 });
  await p.click("#qeGerar");
  const linkQ = await p.evaluate(() => document.getElementById("qeLink").value);
  ok(/quest\.html\?t=.+&q=/.test(linkQ), "link do questionário gerado com token e payload");
  // sem conta: aviso honesto de que as respostas não chegam
  ok(await p.evaluate(() => !document.getElementById("qeAviso").hidden && /Entre na sua conta/.test(document.getElementById("qeAviso").textContent)),
    "sem nuvem, o gerador avisa que as respostas não vão chegar");
  // com nuvem: gerar o link publica o app do aluno (senão o envio dá 'app não encontrado')
  {
    const pub = await p.evaluate(async () => {
      window.__cloudOrigQ = window.MTStore.cloud;
      let upsertRow = null;
      window.MTStore.cloud = () => ({
        aid: "acad-1",
        client: { from: (tb) => ({ upsert: (rows) => { upsertRow = { tb, row: rows[0] }; return Promise.resolve({ error: null }); } }) },
      });
      document.getElementById("qeGerar").click();
      await new Promise((res) => setTimeout(res, 300));
      window.MTStore.cloud = window.__cloudOrigQ;
      return {
        tb: upsertRow && upsertRow.tb,
        temHtml: !!(upsertRow && upsertRow.row.dados && upsertRow.row.dados.html && upsertRow.row.dados.html.length > 10000),
        token: upsertRow && upsertRow.row.token,
        aviso: document.getElementById("qeAviso").textContent,
      };
    });
    ok(pub.tb === "app_aluno" && pub.temHtml && pub.token, "gerar o link com a nuvem publica o app do aluno (token passa a existir)");
    ok(/Tudo pronto/.test(pub.aviso), "aviso confirma que as respostas vão chegar");
  }
  // o aluno abre o link e responde
  {
    const pq = await ctx.newPage();
    let postado = null;
    await pq.route("**/rest/v1/rpc/app_quest_responde", (r) => {
      postado = JSON.parse(r.request().postData() || "{}");
      r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });
    await pq.goto(linkQ);
    const tela = await pq.evaluate(() => document.body.textContent);
    ok(/Check-in semanal/.test(tela) && /motivação pra treinar/.test(tela), "página do aluno mostra o questionário");
    await pq.evaluate(() => { if (!self.MT_CLOUD || !self.MT_CLOUD.url) self.MT_CLOUD = { url: "https://x.supabase.co", anonKey: "k" }; });
    await pq.evaluate(() => document.querySelector(".op").click());               // 😍 Altíssimo (+2)
    await pq.evaluate(() => document.querySelector(".linear button[data-v='8']").click()); // 8 pontos
    await pq.click("#btnEnviar");
    await pq.waitForSelector("#fim", { state: "visible" });
    ok(postado && postado.p_dados && postado.p_dados.pontuacao === 10 && postado.p_dados.respostas.length === 2, "respostas enviadas com pontuação somada (2 + 8 = 10)");
    await pq.close();
  }
  // token não publicado: o aluno recebe recado acionável (não o erro técnico)
  {
    const pq2 = await ctx.newPage();
    await pq2.route("**/rest/v1/rpc/app_quest_responde", (r) => {
      r.fulfill({ contentType: "application/json", body: JSON.stringify({ erro: "app não encontrado" }) });
    });
    await pq2.goto(linkQ);
    await pq2.evaluate(() => { if (!self.MT_CLOUD || !self.MT_CLOUD.url) self.MT_CLOUD = { url: "https://x.supabase.co", anonKey: "k" }; });
    await pq2.evaluate(() => document.querySelector(".op").click());
    await pq2.evaluate(() => document.querySelector(".linear button[data-v='5']").click());
    await pq2.click("#btnEnviar");
    await pq2.waitForTimeout(300);
    const erroTela = await pq2.evaluate(() => document.getElementById("erro").textContent);
    ok(/gerado de novo pelo seu treinador/.test(erroTela) && !/app não encontrado/.test(erroTela), "erro 'app não encontrado' vira recado amigável pro aluno");
    await pq2.close();
  }
  // respostas aparecem no módulo (nuvem simulada)
  {
    await p.evaluate(() => {
      const st = window.MTStore.read("ptStudio", {});
      const a = st.alunos.find((x) => x.ativo !== false);
      window.__cloudOrig2 = window.MTStore.cloud;
      window.MTStore.cloud = () => ({
        aid: "x",
        client: { from: () => ({ select: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [{
          token: a.appTokenP, questionario: "Check-in semanal", criado: new Date().toISOString(),
          dados: { pontuacao: 10, respostas: [{ sigla: "MOTEX", resposta: "Altíssimo", pontos: 2 }, { sigla: "AEROB", resposta: "8", pontos: 8 }] },
        }] }) }) }) }) },
      });
      window.__questPT.respostas();
    });
    await p.waitForTimeout(300);
    const resp = await p.evaluate(() => document.getElementById("qRespostas").textContent);
    ok(/João Cliente/.test(resp) && /\+10 pts/.test(resp) && /MOTEX/.test(resp), "resposta salva aparece com aluno, pontuação e siglas");
    await p.evaluate(() => { window.MTStore.cloud = window.__cloudOrig2; });
  }
  // questionário enviado DIRETO pro app do aluno: trava por data e vira métrica
  {
    const envio = await p.evaluate(async () => {
      const sel = document.getElementById("qeAluno");
      const selQ = document.getElementById("qeQuest");
      sel.value = sel.options[1].value;
      selQ.value = selQ.options[1].value;
      const fut = new Date(Date.now() + 5 * 864e5);
      const futIso = fut.getFullYear() + "-" + String(fut.getMonth() + 1).padStart(2, "0") + "-" + String(fut.getDate()).padStart(2, "0");
      document.getElementById("qeData").value = futIso;
      document.getElementById("qeSemanal").checked = true;
      let upsert = null;
      window.__cloudOrigQA = window.MTStore.cloud;
      window.MTStore.cloud = () => ({
        aid: "acad-1",
        client: { from: (tb) => ({ upsert: (rows) => { upsert = { tb, row: rows[0] }; return Promise.resolve({ error: null }); } }) },
      });
      document.getElementById("qeApp").click();
      await new Promise((res) => setTimeout(res, 300));
      window.MTStore.cloud = window.__cloudOrigQA;
      const st = window.MTStore.read("ptStudio", {});
      const a = st.alunos.find((x) => x.id === sel.value);
      return {
        qa: a.questApp, futIso,
        tb: upsert && upsert.tb,
        html: (upsert && upsert.row.dados && upsert.row.dados.html) || "",
        aviso: document.getElementById("qeAppAviso").textContent,
      };
    });
    ok(envio.qa && envio.qa.desde === envio.futIso && envio.qa.repete === true && envio.qa.ps.length === 2, "📲 mandar pro app salva o questionário no aluno com data e repetição semanal");
    ok(envio.tb === "app_aluno" && /QUESTAPP/.test(envio.html) && /qaCard/.test(envio.html), "app do aluno é republicado já com o questionário embutido");
    ok(/libera dia/.test(envio.aviso) && /toda semana/.test(envio.aviso), "aviso confirma data de liberação e repetição");
    // no app, antes da data: card TRANCADO 🔒
    const pTrava = await ctx.newPage();
    pTrava.on("pageerror", (e) => erros.push("app-quest: " + e));
    await pTrava.route("**/rest/v1/rpc/**", (r) => r.fulfill({ contentType: "application/json", body: "null" }));
    await pTrava.route("**/app-quest-travado.html", (r) => r.fulfill({ contentType: "text/html", body: envio.html }));
    await pTrava.goto(BASE + "/app-quest-travado.html", { waitUntil: "domcontentloaded" });
    await pTrava.waitForTimeout(200);
    const travado = await pTrava.evaluate(() => document.getElementById("qaBox").textContent);
    ok(/Seu personal mandou/.test(travado) && /libera dia/.test(travado), "antes da data, o card no app aparece trancado com a data de liberação");
    await pTrava.close();
    // na data certa: perguntas liberam, aluno responde e a resposta vai pra nuvem
    const htmlLivre = await p.evaluate(() => {
      const st = window.MTStore.read("ptStudio", {});
      const a = st.alunos.find((x) => x.questApp);
      a.questApp.desde = new Date().getFullYear() + "-" + String(new Date().getMonth() + 1).padStart(2, "0") + "-" + String(new Date().getDate()).padStart(2, "0");
      window.MTStore.write("ptStudio", st);
      return window.__montaAppAluno(a, new Date().toISOString());
    });
    const pLivre = await ctx.newPage();
    pLivre.on("pageerror", (e) => erros.push("app-quest2: " + e));
    let postadoApp = null;
    await pLivre.route("**/rest/v1/rpc/**", (r) => r.fulfill({ contentType: "application/json", body: "null" }));
    await pLivre.route("**/rest/v1/rpc/app_quest_responde", (r) => {
      postadoApp = JSON.parse(r.request().postData() || "{}");
      r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });
    await pLivre.route("**/app-quest-livre.html", (r) => r.fulfill({ contentType: "text/html", body: htmlLivre }));
    await pLivre.goto(BASE + "/app-quest-livre.html", { waitUntil: "domcontentloaded" });
    await pLivre.waitForTimeout(200);
    ok(await pLivre.evaluate(() => document.querySelectorAll("#qaBox button[data-qa]").length >= 12), "na data certa as perguntas aparecem (emoji + escala 0-10)");
    await pLivre.evaluate(() => document.querySelector("#qaBox button[data-qa='0']").click());
    await pLivre.evaluate(() => document.querySelector("#qaBox button[data-qa='1'][data-v='8']").click());
    await pLivre.evaluate(() => document.getElementById("qaEnvia").click());
    await pLivre.waitForTimeout(400);
    ok(postadoApp && postadoApp.p_dados && postadoApp.p_dados.pontuacao === 10 && postadoApp.p_dados.respostas.length === 2, "resposta do app vai pra RPC app_quest_responde com pontuação somada (2 + 8 = 10)");
    const depois = await pLivre.evaluate(() => ({
      box: document.getElementById("qaBox").textContent,
      ptqa: JSON.parse(localStorage.getItem("ptqa") || "{}"),
    }));
    ok(/Respondido/.test(depois.box) && /próximo libera dia/.test(depois.box), "depois de responder o card confirma e mostra quando libera o próximo");
    ok(Object.keys(depois.ptqa).length === 1, "período respondido fica marcado no aparelho (não responde duas vezes)");
    await pLivre.close();
  }
  // busca de aluno no topo abre o perfil
  await p.fill("#buscaAluno", "joão");
  await p.waitForTimeout(150);
  const busca = await p.evaluate(() => ({
    aberta: !document.getElementById("buscaAlunoLista").hidden,
    texto: document.getElementById("buscaAlunoLista").textContent,
  }));
  ok(busca.aberta && /João Cliente/.test(busca.texto) && /pago/.test(busca.texto), "busca no topo acha o aluno com status");
  await p.press("#buscaAluno", "Enter");
  ok(await p.evaluate(() => !document.getElementById("vPerfil").hidden), "Enter na busca abre a página de perfil do aluno");
  await p.evaluate(() => document.getElementById("pfFechar").click());
  await p.fill("#buscaAluno", "zzz");
  await p.waitForTimeout(150);
  ok(/Nenhum aluno/.test(await p.evaluate(() => document.getElementById("buscaAlunoLista").textContent)), "busca sem resultado avisa educadamente");
  await p.fill("#buscaAluno", "");
  ok(/Conteúdos de/.test(appHtml) && /Mobilidade de quadril/.test(appHtml), "videoteca do studio no app");
  ok(/Meu peso/.test(appHtml) && /Hábitos de hoje/.test(appHtml) && /Fotos de progresso/.test(appHtml), "cards de peso, hábitos e fotos presentes");
  ok(/Fale com/.test(appHtml) && /chEnvia/.test(appHtml), "app tem o card de chat com o personal");
  ok(/Diário de cargas/.test(appHtml) && /NOVO RECORDE/.test(appHtml), "app tem diário de cargas com recorde");
  ok(/Minha evolução/.test(appHtml) && /84/.test(appHtml), "app leva as avaliações (peso 84)");
  ok(/Meu plano/.test(appHtml) && /Mensal 3x/.test(appHtml) && new RegExp("todo dia " + diaVenc).test(appHtml), "app tem o card Meu plano (plano + vencimento)");
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
  ok(/Meu login/.test(appHtml2) && /aluno_define_login/.test(appHtml2), "app com token ganha o card pra criar login e senha");
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
  // barra de abas embaixo: itens montados, Início ativo, e clicar troca a seção
  const navAbas = await pApp.evaluate(() => {
    const itens = Array.from(document.querySelectorAll("#navApp .nitem")).map((b) => b.getAttribute("data-msec"));
    const secVisivel = (s) => !!document.querySelector("[data-sec='" + s + "']:not([data-sec-off])");
    const antes = { inicio: secVisivel("inicio"), treino: secVisivel("treino") };
    document.querySelector("#navApp .nitem[data-msec='treino']").click();
    return { itens, antes, depois: { inicio: secVisivel("inicio"), treino: secVisivel("treino") }, tit: document.getElementById("secTit").textContent };
  });
  ok(navAbas.itens.length >= 5 && navAbas.itens[0] === "inicio", "barra de abas montada com as seções do app (" + navAbas.itens.length + " abas)");
  ok(await pApp.evaluate(() => document.querySelectorAll("#navApp .nitem svg").length >= 5 && !/[🏠🏋📈📅💬💳]/.test(document.getElementById("navApp").textContent)), "abas com ícones de traço (SVG), sem emoji");
  ok(navAbas.antes.inicio && !navAbas.antes.treino && !navAbas.depois.inicio && navAbas.depois.treino && /Treino/.test(navAbas.tit), "tocar na aba troca a seção e o título do topo");
  // recado do personal ainda não visto acende a bolinha 🔴 no Chat
  const dotChat = await pApp.evaluate(() => {
    window.__chatDot(new Date().toISOString());
    const dot = document.querySelector(".nitem[data-msec='chat'] .ndot");
    const acesa = dot && dot.style.display === "block";
    window.__trocaSec("chat");
    return { acesa, apagada: dot && dot.style.display === "none" };
  });
  ok(dotChat.acesa && dotChat.apagada, "recado novo acende a bolinha no Chat e abrir o chat apaga");
  // substituto de exercício: o toque abre a dica com as trocas
  const altEx = await pApp.evaluate(() => {
    window.__trocaSec("treino");
    const b = document.querySelector(".altbtn");
    if (!b) return null;
    b.click();
    const bx = b.nextElementSibling;
    return { visivel: bx && bx.style.display === "block", txt: (bx && bx.textContent) || "" };
  });
  ok(!!altEx && altEx.visivel && /Troca por: /.test(altEx.txt), "'Sem esse aparelho hoje?' abre os substitutos do mesmo movimento");
  // confirmação de presença: Confirmo manda pelo chat (mock) e marca como avisado
  const confPres = await pApp.evaluate(async () => {
    window.__trocaSec("inicio");
    const bx = document.getElementById("sconfBox");
    if (!bx) return null;
    bx.querySelector("[data-pconf='1']").click();
    await new Promise((r) => setTimeout(r, 300));
    return bx.textContent;
  });
  ok(!!confPres && /Avisei que vou/.test(confPres), "Confirmo presença marca como avisado no app");
  ok(await pApp.evaluate(() => true) && chatDB.some((m) => /Confirmo presença na sessão/.test(m.texto)), "o recado de confirmação chega no chat do personal");
  // home estilo app nativo: hero "treino de hoje", tiles de progresso e XP
  const home = await pApp.evaluate(() => {
    window.__trocaSec("inicio");
    return {
      rot: document.getElementById("htRot").textContent,
      tit: document.getElementById("htTitulo").textContent,
      sub: document.getElementById("htSub").textContent,
      tiles: document.getElementById("pgTiles").textContent,
      xp: document.getElementById("xpChip").textContent,
    };
  });
  ok(/TREINO|FICHA/.test(home.rot) && home.tit.length > 2 && /exercício/.test(home.sub), "card 'HOJE · " + home.rot + "' mostra a ficha da vez (" + home.tit + ")");
  ok(/Peso/.test(home.tiles) && /Treinos no mês/.test(home.tiles), "tiles de progresso (peso + treinos do mês) na home");
  ok(/\d+ XP/.test(home.xp), "chip de XP no topo da home (" + home.xp.trim() + ")");
  const xp0 = parseInt((home.xp.match(/\d+/) || ["0"])[0], 10);
  ok(await pApp.evaluate(() => {
    document.getElementById("htVer").click();
    return !document.querySelector("[data-sec='treino']").hasAttribute("data-sec-off");
  }), "botão 'Ver treino ➜' do hero pula pra aba Treino");
  // com o menu de abas, cada grupo de cards vive numa seção — troca antes de interagir
  await pApp.evaluate(() => window.__trocaSec("treino"));
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
  {
    const xp1 = parseInt(((await pApp.evaluate(() => document.getElementById("xpChip").textContent)).match(/\d+/) || ["0"])[0], 10);
    ok(xp1 === xp0 + 10, "treino registrado rende +10 XP (" + xp0 + " → " + xp1 + ")");
  }
  // cronômetro (o botão vive dentro do <details> fechado — clica via JS)
  await pApp.evaluate(() => document.querySelector(".tmrbtn").click());
  await pApp.waitForTimeout(300);
  const tmr = await pApp.evaluate(() => document.getElementById("tmrBar").textContent);
  ok(/Descanso/.test(tmr), "cronômetro de descanso liga");
  // treino guiado: abre, conduz série → descanso automático → pular → concluir
  await pApp.evaluate(() => document.querySelector(".guiabtn").click());
  let guiP = await pApp.evaluate(() => ({
    aberto: document.getElementById("guiaBox").style.display,
    ex: document.getElementById("gEx").textContent,
    prog: document.getElementById("gProg").textContent,
  }));
  ok(guiP.aberto === "flex" && guiP.ex.length > 1 && /exercício 1/.test(guiP.prog), "▶ Treino guiado abre no 1º exercício (" + guiP.ex + ")");
  await pApp.click("#gSerie");
  guiP = await pApp.evaluate(() => ({ desc: document.getElementById("gDesc").style.display, num: +document.getElementById("gDesc").textContent }));
  ok(guiP.desc === "block" && guiP.num > 0, "série feita liga o descanso automático (" + guiP.num + "s)");
  await pApp.click("#gPular");
  guiP = await pApp.evaluate(() => document.getElementById("gSerie").textContent);
  ok(/1\//.test(guiP), "pular descanso volta pro botão de série (1/N)");
  await pApp.evaluate(() => { for (let i = 0; i < 12; i++) document.getElementById("gPularEx").click(); });
  guiP = await pApp.evaluate(() => document.getElementById("gEx").textContent);
  ok(/concluído/.test(guiP), "pular os exercícios chega no 🎉 treino concluído");
  await pApp.evaluate(() => document.getElementById("gFechar").click());
  // card de conquista pro Stories baixa a imagem
  {
    const dlCard = pApp.waitForEvent("download", { timeout: 5000 }).catch(() => null);
    await pApp.evaluate(() => document.getElementById("btnCardStories").click());
    const cardArq = await dlCard;
    ok(!!cardArq && /conquista\.png/.test(cardArq.suggestedFilename()), "Gerar card pro Stories baixa a imagem da conquista");
  }
  // gráfico de carga: clica na linha do diário
  await pApp.fill("#dcEx", "Supino reto");
  await pApp.fill("#dcKg", "72");
  await pApp.click("#dcAdd");
  await pApp.evaluate(() => document.querySelector('[data-dcx="Supino reto"]').click());
  const graf = await pApp.evaluate(() => document.getElementById("dcGraf").textContent);
  ok(/Supino reto/.test(graf) && /★/.test(graf), "gráfico de carga abre com PR ★");
  // peso diário
  await pApp.evaluate(() => window.__trocaSec("evolucao"));
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
  await pApp.evaluate(() => window.__trocaSec("inicio"));
  await pApp.click("#btnFeito");
  const feitos = await pApp.evaluate(() => JSON.parse(localStorage.getItem("ptfeitos")));
  ok(Object.keys(feitos).length === 1, "mesmo dia não duplica o registro");

  // --- nível mundial: onboarding 30s, streak de semanas, RPE, 1RM estimado e confete ---
  const onbApp = await pApp.evaluate(async () => {
    const card = document.getElementById("onbCard");
    if (!card || card.style.display !== "block") return null;
    document.querySelector("#onbObj [data-v='emagrecer']").click();
    document.querySelector("#onbDias [data-v='3']").click();
    document.getElementById("onbDor").value = "ombro esquerdo";
    document.getElementById("onbOk").click();
    await new Promise((r) => setTimeout(r, 200));
    return { salvo: JSON.parse(localStorage.getItem("ptonb")), sumiu: card.style.display === "none" };
  });
  ok(!!onbApp && onbApp.salvo && onbApp.salvo.obj === "emagrecer" && onbApp.salvo.dor === "ombro esquerdo" && onbApp.sumiu,
    "onboarding de 30s salva objetivo/dias/dor e some depois de responder");
  const stkRpe = await pApp.evaluate(async () => {
    // duas semanas passadas com a meta batida (3 treinos cada) + re-registra hoje → repinta
    const f = {};
    const seg = new Date(); seg.setDate(seg.getDate() - ((seg.getDay() + 6) % 7));
    for (let w = 1; w <= 2; w++) for (let i = 0; i < 3; i++) {
      const d = new Date(seg); d.setDate(d.getDate() - 7 * w + i);
      f[d.toISOString().slice(0, 10)] = 1;
    }
    localStorage.setItem("ptfeitos", JSON.stringify(f));
    document.getElementById("btnFeito").click();
    await new Promise((r) => setTimeout(r, 250));
    return {
      stk: (document.getElementById("stkBox") || {}).textContent || "",
      rpeVisivel: document.getElementById("rpeBox").style.display === "block",
    };
  });
  ok(/sequência de 2 semanas/.test(stkRpe.stk), "chama do streak acende com 2 semanas seguidas de meta");
  ok(stkRpe.rpeVisivel, "depois do 'Treinei hoje' o app pergunta como foi o treino");
  const rpeSalvo = await pApp.evaluate(async () => {
    document.querySelector("[data-rpe='2']").click();
    await new Promise((r) => setTimeout(r, 150));
    return JSON.parse(localStorage.getItem("ptrpe") || "{}");
  });
  ok(Object.keys(rpeSalvo).some((k) => rpeSalvo[k] === 2), "resposta 'Na medida' fica guardada pro personal (ptrpe)");
  await pApp.evaluate(() => window.__trocaSec("treino"));
  await pApp.fill("#dcEx", "Agachamento");
  await pApp.fill("#dcKg", "90");
  await pApp.fill("#dcReps", "6");
  await pApp.click("#dcAdd");
  await pApp.waitForTimeout(200);
  const rm = await pApp.evaluate(() => {
    document.querySelector('[data-dcx="Agachamento"]').click();
    return {
      graf: document.getElementById("dcGraf").textContent,
      confete: !!document.querySelector("[style*='cfQueda']"),
    };
  });
  ok(/recorde 90 kg/.test(rm.graf) && /1RM est\. 108 kg/.test(rm.graf), "gráfico mostra recorde e 1RM estimado (Epley: 90×(1+6÷30)=108)");
  ok(rm.confete, "novo recorde solta a chuva de confete");
  // vídeo do exercício toca DENTRO do app (player embutido, sem sair pro YouTube)
  const vid = await pApp.evaluate(async () => {
    window.__trocaSec("treino");
    const b = Array.from(document.querySelectorAll(".vidbtn")).find((x) => /watch\?v=abc123/.test(x.dataset.v || ""));
    if (!b) return null;
    b.click();
    await new Promise((r) => setTimeout(r, 150));
    let bx = b.nextElementSibling;
    while (bx && !bx.classList.contains("vidbox")) bx = bx.nextElementSibling;
    const iframe = bx && bx.querySelector("iframe");
    const aberto = { src: iframe ? iframe.src : "", rot: b.textContent };
    b.click();
    await new Promise((r) => setTimeout(r, 100));
    return { aberto, fechou: !bx.querySelector("iframe"), rotVoltou: b.textContent };
  });
  ok(!!vid && /youtube-nocookie\.com\/embed\/abc123/.test(vid.aberto.src) && /Fechar vídeo/.test(vid.aberto.rot),
    "'Ver vídeo' abre o player embutido dentro do app (youtube-nocookie)");
  ok(!!vid && vid.fechou && /Ver vídeo/.test(vid.rotVoltou), "tocar de novo fecha o player e o botão volta ao normal");
  // botão Iniciar exercício abre o guiado já naquele exercício
  const iniEx = await pApp.evaluate(() => {
    const bs = document.querySelectorAll(".inibtn");
    if (bs.length < 2) return null;
    bs[1].click(); // 2º exercício da ficha
    return {
      aberto: document.getElementById("guiaBox").style.display,
      prog: document.getElementById("gProg").textContent,
      ex: document.getElementById("gEx").textContent,
    };
  });
  ok(!!iniEx && iniEx.aberto === "flex" && /exercício 2/.test(iniEx.prog),
    "'Iniciar exercício' abre o modo guiado direto no exercício escolhido (" + (iniEx ? iniEx.ex : "?") + ")");
  await pApp.evaluate(() => document.getElementById("gFechar").click());

  // --- leva 2: aquecimento, raio-X, mapa do ano, meta de peso, Já paguei, wake lock ---
  ok(/Aquecimento do dia/.test(appHtml2) && /Raio-X do treino/.test(appHtml2) && /wakeLock/.test(appHtml2) && /mapaAno/.test(appHtml2),
    "app traz aquecimento automático, raio-X por grupo, wake lock e mapa do ano");
  const leva2 = await pApp.evaluate(async () => {
    window.__trocaSec("evolucao");
    const pz = {};
    pz[new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)] = 90;
    pz[new Date().toISOString().slice(0, 10)] = 85;
    localStorage.setItem("ptpeso", JSON.stringify(pz));
    document.getElementById("mpAlvo").value = "80";
    document.getElementById("mpSalva").click();
    await new Promise((r) => setTimeout(r, 200));
    const mapa = document.getElementById("mapaAno");
    return {
      meta: document.getElementById("mpBarra").textContent,
      mapaTxt: mapa ? mapa.textContent : "",
      mapaCells: mapa ? mapa.querySelectorAll("div div div").length : 0,
    };
  });
  ok(/Meta: 80 kg/.test(leva2.meta) && /5 kg pra chegar/.test(leva2.meta), "meta de peso vira barra de progresso (90→85, alvo 80: faltam 5)");
  ok(/Seu ano de treinos/.test(leva2.mapaTxt) && leva2.mapaCells >= 360, "mapa de constância pinta as 52 semanas do ano");
  const jaPag = await pApp.evaluate(async () => {
    window.__trocaSec("inicio");
    const b = document.getElementById("btnJaPaguei");
    if (!b) return null;
    b.click();
    await new Promise((r) => setTimeout(r, 300));
    return { sumiu: b.style.display === "none", ok: document.getElementById("jaPagueiOk").style.display };
  });
  ok(!!jaPag && jaPag.sumiu && jaPag.ok === "block" && chatDB.some((m) => /Acabei de pagar a mensalidade/.test(m.texto)),
    "'Já paguei' avisa o personal pelo chat e confirma no app (1x por mês)");

  // --- modo circuito (WOD): For Time, AMRAP, EMOM e Tabata ---
  ok(/Modo circuito \(WOD\)/.test(appHtml2) && /data-wodt='fortime'/.test(appHtml2.replace(/"/g, "'")) || /Modo circuito/.test(appHtml2),
    "app tem o card Modo circuito (WOD)");
  const wodR = await pApp.evaluate(async () => {
    window.__trocaSec("treino");
    const out = {};
    out.chips = document.getElementById("wodTipos").textContent;
    // For Time conta pra cima com voltas
    document.getElementById("wodGo").click();
    await new Promise((r) => setTimeout(r, 1200));
    document.getElementById("wodVolta").click();
    out.fortime = document.getElementById("wodFase").textContent + "|" + document.getElementById("wodTempo").textContent + "|" + document.getElementById("wodInfo").textContent;
    document.getElementById("wodZera").click();
    // Tabata relâmpago (1 round de 1s+1s) termina sozinho com confete e botão de registrar
    document.querySelector("[data-wodt='tabata']").click();
    document.getElementById("wodRounds").value = "1";
    document.getElementById("wodWork").value = "1";
    document.getElementById("wodRest").value = "1";
    document.getElementById("wodGo").click();
    await new Promise((r) => setTimeout(r, 600));
    out.tabataFase = document.getElementById("wodFase").textContent;
    await new Promise((r) => setTimeout(r, 2300));
    out.fim = document.getElementById("wodFase").textContent + "|" + document.getElementById("wodFimBox").textContent;
    // EMOM mostra o minuto e a contagem regressiva
    document.querySelector("[data-wodt='emom']").click();
    document.getElementById("wodMin").value = "2";
    document.getElementById("wodGo").click();
    await new Promise((r) => setTimeout(r, 400));
    out.emom = document.getElementById("wodFase").textContent;
    document.getElementById("wodZera").click();
    return out;
  });
  ok(/For Time/.test(wodR.chips) && /AMRAP/.test(wodR.chips) && /EMOM/.test(wodR.chips) && /Tabata/.test(wodR.chips), "os 4 cronômetros de cross estão no card");
  ok(/FOR TIME\|0:0/.test(wodR.fortime) && /1 volta/.test(wodR.fortime), "For Time conta pra cima e marca voltas");
  ok(/TRABALHA · ROUND 1 DE 1/.test(wodR.tabataFase), "Tabata alterna trabalho/descanso com o round na tela");
  ok(/FIM!/.test(wodR.fim) && /Tabata completo/.test(wodR.fim), "Tabata termina sozinho com a festa de FIM (o botão de registrar só aparece se o dia ainda não foi marcado)");
  ok(/MINUTO 1 DE 2/.test(wodR.emom), "EMOM mostra o minuto atual com contagem regressiva");
  // check-in: escolhe carinha e envia (sem nuvem → wa.me; só valida o estado)
  await pApp.evaluate(() => { window.open = () => null; }); // não abre janela no teste
  await pApp.evaluate(() => window.__trocaSec("chat"));
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

  // ---------- 🎨 tema do studio: cor principal + logo ----------
  console.log("Tema do studio (cor + logo):");
  {
    const PNG_MIN = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    // muda a cor pelo próprio campo (o handler real precisa marcar appEditGeralEm)
    const aposCor = await p.evaluate(() => {
      const st = window.MTStore.read("ptStudio", {});
      st.config = st.config || {};
      delete st.config.appEditGeralEm;
      window.MTStore.write("ptStudio", st);
      const inp = document.getElementById("cfgCor");
      inp.value = "#0ea5e9";
      inp.dispatchEvent(new Event("change"));
      const st2 = window.MTStore.read("ptStudio", {});
      return {
        cor: (st2.config || {}).cor,
        marcou: !!(st2.config || {}).appEditGeralEm,
        roxoVar: document.documentElement.style.getPropertyValue("--roxo"),
        roxo2Var: document.documentElement.style.getPropertyValue("--roxo-2"),
        roxo2Esperado: window.__tema.escurece("#0ea5e9", .18),
      };
    });
    ok(aposCor.cor === "#0ea5e9" && aposCor.marcou, "mudar a cor salva em config.cor e marca os apps como pendentes (appEditGeralEm)");
    ok(aposCor.roxoVar === "#0ea5e9" && aposCor.roxo2Var === aposCor.roxo2Esperado, "painel pinta na hora (--roxo = #0ea5e9 e --roxo-2 escurecida)");
    // logo válida entra no painel e no app gerado
    const tema = await p.evaluate((png) => {
      const st = window.MTStore.read("ptStudio", {});
      st.config = st.config || {};
      st.config.logo = png;
      window.MTStore.write("ptStudio", st);
      const st2 = window.MTStore.read("ptStudio", {});
      return {
        html: window.__montaAppAluno(st2.alunos[0], new Date().toISOString()),
        prevVisivel: !document.getElementById("cfgLogoPrev").hidden,
        delVisivel: !document.getElementById("cfgLogoDel").hidden,
        topoVisivel: !document.getElementById("logoStudio").hidden && (document.getElementById("logoStudio").src || "").indexOf("data:image/png") === 0,
      };
    }, PNG_MIN);
    ok(/<meta name='theme-color' content='#0ea5e9'>/.test(tema.html), "app gerado leva a cor nova no theme-color");
    ok(/linear-gradient\(135deg,#0ea5e9,/.test(tema.html) && !/linear-gradient\(135deg,#7c3aed,/.test(tema.html), "botões do app usam o gradiente da cor nova (sem sobra do roxo)");
    ok(tema.html.indexOf(PNG_MIN) !== -1, "logo (dataURL) entra no cabeçalho do app do aluno");
    ok(tema.prevVisivel && tema.delVisivel && tema.topoVisivel, "painel mostra a logo no topo + preview com ✕ tirar logo");
    // cor inválida e logo maliciosa não entram
    const invalido = await p.evaluate(() => {
      const st = window.MTStore.read("ptStudio", {});
      st.config = st.config || {};
      st.config.cor = "red;x";
      st.config.logo = "data:image/png;base64,x' onerror='hack";
      window.MTStore.write("ptStudio", st);
      return {
        html: window.__montaAppAluno(window.MTStore.read("ptStudio", {}).alunos[0], new Date().toISOString()),
        roxoVar: document.documentElement.style.getPropertyValue("--roxo"),
      };
    });
    ok(/<meta name='theme-color' content='#7c3aed'>/.test(invalido.html), "cor inválida (red;x) cai no roxo padrão no app");
    ok(invalido.roxoVar === "", "cor inválida não pinta o painel (volta pro padrão)");
    ok(invalido.html.indexOf("onerror='hack") === -1 && invalido.html.indexOf("hack") === -1, "logo maliciosa (com aspas) fica de fora do app (anti-XSS)");
    // restaura o padrão pra não afetar o resto da suíte
    const limpo = await p.evaluate(() => {
      const st = window.MTStore.read("ptStudio", {});
      st.config = st.config || {};
      st.config.cor = "";
      delete st.config.logo;
      delete st.config.appEditGeralEm; // o teste da cor marcou apps pendentes — limpa o estado
      window.MTStore.write("ptStudio", st);
      return {
        roxoVar: document.documentElement.style.getPropertyValue("--roxo"),
        topoSumiu: document.getElementById("logoStudio").hidden,
        prevSumiu: document.getElementById("cfgLogoPrev").hidden,
        inputCor: document.getElementById("cfgCor").value,
      };
    });
    ok(limpo.roxoVar === "" && limpo.topoSumiu && limpo.prevSumiu && limpo.inputCor === "#7c3aed", "voltar ao padrão limpa painel, logo e o campo de cor");
  }

  // conta / ilha
  const conta = await p.evaluate(() => document.getElementById("contaStatus").textContent);
  ok(/Crie sua conta|Conectado/.test(conta), "card da ilha mostra o status da conta");

  // aba chat do módulo (sem nuvem → aviso educado)
  await abaPt(p, "chat");
  await p.waitForTimeout(300);
  const chatMod = await p.evaluate(() => document.getElementById("chatMsgs").textContent);
  ok(/precisa da sua conta/.test(chatMod), "chat do módulo sem nuvem explica o que falta");

  // aba assessoria (sem nuvem → aviso educado)
  await abaPt(p, "assessoria");
  await p.waitForTimeout(300);
  const asse = await p.evaluate(() => document.getElementById("assessoriaLista").textContent);
  ok(/precisa da sua conta/.test(asse), "assessoria sem nuvem explica o que falta");

  // 🤖 treino automático + 📈 progressão (motor de regras sobre a anamnese)
  console.log("Treino automático:");
  {
    const auto = await p.evaluate(() => {
      const st = window.MTStore.read("ptStudio", {});
      st.alunos[0].anamnese = Object.assign({}, st.alunos[0].anamnese, { nivel: "intermediário", dias: "3", lesoes: "condropatia no joelho", naogosta: "burpee" });
      window.MTStore.write("ptStudio", st);
      const r = window.__treinoAuto.gera(st.alunos[0].id, "hipertrofia", "academia");
      const st2 = window.MTStore.read("ptStudio", {});
      const t = st2.treinosV2[st2.alunos[0].id];
      const nomes = [];
      t.fichas.forEach((f) => f.itens.forEach((it) => { const e = st2.exercicios.find((x) => x.id === it.exId); nomes.push(e ? e.nome : "?"); }));
      return { r, fichas: t.fichas.length, titulos: t.fichas.map((f) => f.titulo).join("|"), nomes, semana: t.semana, item0: t.fichas[0].itens[0] };
    });
    ok(auto.r.ok && auto.fichas === 3 && /Peito e Tríceps/.test(auto.titulos) && /Pernas e Core/.test(auto.titulos), "gera divisão ABC pra 3 dias/semana lendo a anamnese");
    ok(auto.item0.series === 4 && auto.item0.reps === "10" && auto.item0.descanso === 90, "hipertrofia sai com 4×10 e 90s de descanso");
    ok(auto.nomes.length >= 12 && !auto.nomes.some((n) => /agachamento|afundo|leg |salto|extensora|búlgaro/i.test(n)), "lesão de joelho na anamnese tira agachamentos/afundos/saltos (" + auto.nomes.length + " exercícios)");
    ok(!auto.nomes.some((n) => /burpee/i.test(n)), "'não gosta' da anamnese é respeitado");
    const corpo = await p.evaluate(() => {
      const st = window.MTStore.read("ptStudio", {});
      const r = window.__treinoAuto.gera(st.alunos[0].id, "emagrecimento", "corpo");
      const st2 = window.MTStore.read("ptStudio", {});
      const t = st2.treinosV2[st2.alunos[0].id];
      const eqs = new Set();
      t.fichas.forEach((f) => f.itens.forEach((it) => { const e = st2.exercicios.find((x) => x.id === it.exId); if (e) eqs.add(e.nome); }));
      return { r, primeiroReps: t.fichas[0].itens.find((i) => i.reps !== "30s")?.reps };
    });
    ok(corpo.r.ok && corpo.primeiroReps === "15", "emagrecimento com peso do corpo sai 15 reps e gera mesmo sem academia");
    const evo = await p.evaluate(() => {
      const st = window.MTStore.read("ptStudio", {});
      window.__treinoAuto.gera(st.alunos[0].id, "hipertrofia", "academia");
      const r1 = window.__treinoAuto.evolui(st.alunos[0].id);
      const st2 = window.MTStore.read("ptStudio", {});
      const reps1 = st2.treinosV2[st2.alunos[0].id].fichas[0].itens[0].reps;
      // evolui até estourar o teto (10→11→12→piso com +1 série)
      window.__treinoAuto.evolui(st.alunos[0].id);
      const r3 = window.__treinoAuto.evolui(st.alunos[0].id);
      const st3 = window.MTStore.read("ptStudio", {});
      const it3 = st3.treinosV2[st3.alunos[0].id].fichas[0].itens[0];
      return { r1, reps1, r3, it3 };
    });
    ok(evo.r1.ok && evo.r1.semana === 2 && evo.reps1 === "11", "📈 evoluir semana sobe as reps (10 → 11)");
    ok(evo.r3.semana === 4 && evo.it3.reps === "8" && evo.it3.series === 5, "no teto (12) as reps voltam pro piso (8) e ganha 1 série — progressão dupla");
  }

  // 💳 link de pagamento Pagar.me (função mockada)
  {
    const pgm = await p.evaluate(async () => {
      const st = window.MTStore.read("ptStudio", {});
      const id = st.alunos[0].id;
      const semNuvem = await new Promise((res) => window.__pagarmePT(id, 400, res));
      window.__cloudOrig = window.MTStore.cloud;
      window.__fetchOrig = window.fetch;
      window.MTStore.cloud = () => ({ aid: "x", client: { auth: { getSession: () => Promise.resolve({ data: { session: { access_token: "tok" } } }) } } });
      let corpo = null;
      window.fetch = (url, opts) => {
        if (String(url).includes("functions/v1/pagarme")) {
          corpo = JSON.parse(opts.body);
          return Promise.resolve({ json: () => Promise.resolve({ ok: true, linkPagamento: "https://pagar.me/checkout/abc123" }) });
        }
        return window.__fetchOrig(url, opts);
      };
      const comNuvem = await new Promise((res) => window.__pagarmePT(id, 400, res));
      window.fetch = window.__fetchOrig;
      window.MTStore.cloud = window.__cloudOrig;
      return { semNuvem, comNuvem, corpo };
    });
    ok(/Entre na sua conta/.test(pgm.semNuvem.erro), "💳 sem nuvem o link de pagamento explica o que falta");
    ok(pgm.comNuvem.ok && /pagar\.me\/checkout/.test(pgm.comNuvem.link), "💳 com a função no ar o link de checkout volta pro personal");
    ok(pgm.corpo.acao === "criar" && pgm.corpo.metodo === "cartao" && pgm.corpo.valorCentavos === 40000 && /Mensalidade/.test(pgm.corpo.descricao), "cobrança vai pro Pagar.me com valor em centavos e descrição");
    ok(await p.evaluate(async () => /data-pgm=/.test(await (await fetch("personal.html")).text())), "pendências ganham o botão 💳 Link de pagamento");
  }

  // ✨ IA prescritiva de treino (função chat-envia mockada)
  {
    const ia = await p.evaluate(async () => {
      const st = window.MTStore.read("ptStudio", {});
      const id = st.alunos[0].id;
      const semNuvem = await new Promise((res) => window.__iaTreino(id, "hipertrofia", "academia", res));
      window.__cloudOrig = window.MTStore.cloud;
      window.__fetchOrig = window.fetch;
      window.MTStore.cloud = () => ({ aid: "x", client: { auth: { getSession: () => Promise.resolve({ data: { session: { access_token: "tok" } } }) } } });
      const peito = self.MT_EXERCICIOS.find((c) => c.g === "Peito").n;
      const costas = self.MT_EXERCICIOS.find((c) => c.g === "Costas").n;
      let corpo = null;
      window.fetch = (url, opts) => {
        if (String(url).includes("functions/v1/chat-envia")) {
          corpo = JSON.parse(opts.body);
          const plano = { fichas: [{ titulo: "A — Peito e Costas", itens: [
            { nome: peito, series: 4, reps: "10", descanso: 90, obs: "cotovelos a 45°" },
            { nome: costas, series: 3, reps: "12", descanso: 60 },
            { nome: "Exercício Inventado Xyz", series: 3, reps: "10", descanso: 60 },
          ] }], resumo: "Foco em hipertrofia com volume moderado." };
          return Promise.resolve({ json: () => Promise.resolve({ ok: true, texto: "```json\n" + JSON.stringify(plano) + "\n```" }) });
        }
        return window.__fetchOrig(url, opts);
      };
      const comNuvem = await new Promise((res) => window.__iaTreino(id, "hipertrofia", "academia", res));
      window.fetch = window.__fetchOrig;
      window.MTStore.cloud = window.__cloudOrig;
      const st2 = window.MTStore.read("ptStudio", {});
      const t = st2.treinosV2[id];
      const a2 = st2.alunos.find((a) => a.id === id) || {};
      return { semNuvem, comNuvem, corpo,
        t: { fichas: t.fichas.length, item0: t.fichas[0].itens[0], nItens: t.fichas[0].itens.length, geradaIA: t.geradaIA, titulo: t.fichas[0].titulo },
        pendente: !!a2.appEditEm };
    });
    ok(/Entre na sua conta/.test(ia.semNuvem.erro), "✨ sem nuvem a IA de treino explica o que falta");
    ok(ia.corpo.acao === "ia_treino" && /PAR-Q/.test(ia.corpo.dados) && /CATÁLOGO DISPONÍVEL/.test(ia.corpo.dados), "anamnese e catálogo viajam pra função chat-envia (ação ia_treino)");
    ok(ia.comNuvem.ok && ia.comNuvem.fichas === 1 && ia.comNuvem.exercicios === 2 && ia.comNuvem.ignorados === 1, "✨ IA prescreve a ficha e o exercício inventado é descartado");
    ok(ia.t.geradaIA && ia.t.titulo === "A — Peito e Costas" && ia.t.nItens === 2 && ia.t.item0.series === 4 && ia.t.item0.reps === "10" && ia.t.item0.obs === "cotovelos a 45°", "ficha da IA entra no treinosV2 com séries, reps e observação técnica");
    ok(ia.pendente, "app do aluno fica pendente de republicação depois do treino da IA");
  }

  // 🔁 mensalidade no cartão (assinatura Pagar.me com tokenização no navegador)
  console.log("Mensalidade no cartão:");
  {
    // nuvem + Pagar.me mockados: token no api.pagar.me, assinatura na função pagarme
    await p.evaluate(() => {
      window.__cloudOrig = window.MTStore.cloud;
      window.__fetchOrig = window.fetch;
      window.__cartaoChamadas = { token: null, funcao: [] };
      // cadeia flexível: qualquer .select().eq().eq().limit()… resolve { data: [] }
      const cadeia = () => {
        const o = { then: (res, rej) => Promise.resolve({ data: [] }).then(res, rej) };
        ["select", "eq", "neq", "gte", "lte", "in", "is", "not", "order", "limit", "single"].forEach((m) => { o[m] = () => o; });
        return o;
      };
      window.MTStore.cloud = () => ({
        aid: "x",
        client: {
          auth: { getSession: () => Promise.resolve({ data: { session: { access_token: "tok-cartao" } } }) },
          from: () => cadeia(),
        },
      });
      window.fetch = (url, opts) => {
        const u = String(url);
        if (u.includes("api.pagar.me/core/v5/tokens")) {
          window.__cartaoChamadas.token = { url: u, body: JSON.parse(opts.body) };
          return Promise.resolve({ json: () => Promise.resolve({ id: "token_teste_1" }) });
        }
        if (u.includes("functions/v1/pagarme")) {
          const corpo = JSON.parse(opts.body);
          window.__cartaoChamadas.funcao.push(corpo);
          if (corpo.acao === "chave_publica") return Promise.resolve({ json: () => Promise.resolve({ ok: true, publicKey: "pk_teste" }) });
          if (corpo.acao === "assinar") return Promise.resolve({ json: () => Promise.resolve({ ok: true, assinaturaId: "sub_teste_1", status: "active" }) });
          if (corpo.acao === "assinatura_status") return Promise.resolve({ json: () => Promise.resolve({ ok: true, status: "active", proximaCobranca: "2026-09-07T12:00:00Z", valor: 45000 }) });
          return Promise.resolve({ json: () => Promise.resolve({ ok: true, status: "canceled" }) });
        }
        return window.__fetchOrig(url, opts);
      };
      window.__perfilPT(window.MTStore.read("ptStudio", {}).alunos[0].id);
    });
    await p.waitForTimeout(250);
    ok(await p.evaluate(() => {
      const b = document.getElementById("pfAssinar");
      return !!b && /Ativar mensalidade no cartão/.test(b.textContent);
    }), "perfil sem assinatura tem o botão 🔁 Ativar mensalidade no cartão");
    await p.click("#pfAssinar");
    await p.waitForFunction(() => document.getElementById("dlgCartaoRec") && document.getElementById("dlgCartaoRec").open);
    const dlgInfo = await p.evaluate(() => ({
      txt: document.getElementById("dlgCartaoRec").textContent,
      nome: document.getElementById("crNome").value,
      email: document.getElementById("crEmail").value,
    }));
    ok(/direto pro Pagar\.me/.test(dlgInfo.txt) && /nunca vê nem guarda/.test(dlgInfo.txt), "dialog avisa que o cartão vai direto pro Pagar.me (PCI)");
    ok(/João/.test(dlgInfo.nome) && /joao@email\.com/.test(dlgInfo.email), "nome e e-mail do aluno já vêm preenchidos");
    await p.fill("#crNumero", "4111111111111111");
    ok(await p.evaluate(() => document.getElementById("crNumero").value === "4111 1111 1111 1111"), "número do cartão formata em blocos de 4");
    await p.fill("#crVal", "12/30");
    await p.fill("#crCvv", "123");
    await p.fill("#crCpf", "52998224725");
    await p.fill("#crEmail", "joao@email.com");
    await p.click("#crEnviar");
    await p.waitForFunction(() => !document.getElementById("dlgCartaoRec").open, null, { timeout: 5000 });
    const assinou = await p.evaluate(() => {
      const ch = window.__cartaoChamadas;
      const st = window.MTStore.read("ptStudio", {});
      return {
        tokenUrl: ch.token && ch.token.url,
        tokenTipo: ch.token && ch.token.body.type,
        tokenCard: ch.token && ch.token.body.card,
        corposFuncao: JSON.stringify(ch.funcao),
        assinar: ch.funcao.find((c) => c.acao === "assinar"),
        rec: st.alunos[0].assinaturaRec,
        box: document.getElementById("pfAssinaturaBox").textContent,
      };
    });
    ok(/appId=pk_teste/.test(assinou.tokenUrl) && assinou.tokenTipo === "card" && assinou.tokenCard.number === "4111111111111111" && assinou.tokenCard.exp_month === 12 && assinou.tokenCard.exp_year === 2030 && assinou.tokenCard.cvv === "123", "número/validade/CVV vão DIRETO pro api.pagar.me com a chave pública");
    ok(!assinou.corposFuncao.includes("4111111111111111") && !assinou.corposFuncao.includes("4111 1111"), "o número do cartão NUNCA vai pra nossa nuvem (só o card_token)");
    ok(assinou.assinar && assinou.assinar.card_token === "token_teste_1" && assinou.assinar.valorCentavos === 45000 && assinou.assinar.documento === "52998224725" && /Mensalidade — Léo/.test(assinou.assinar.descricao), "assinar leva card_token, R$ 450 do contrato em centavos, CPF e a descrição do studio");
    ok(assinou.rec && assinou.rec.id === "sub_teste_1" && assinou.rec.valor === 450 && !!assinou.rec.desde, "assinaturaRec gravada no aluno (id, valor e data)");
    ok(/Mensalidade no cartão ativa desde/.test(assinou.box) && /450/.test(assinou.box), "perfil mostra 🔁 mensalidade ativa com data e valor");
    // pendências: aluno com assinatura ganha o chip 🔁 no cartão
    await p.evaluate(() => {
      const st = window.MTStore.read("ptStudio", {});
      window.__pgtosGuardados = st.pagamentos;
      st.pagamentos = []; // sem pagamento no mês → João vira pendente
      window.MTStore.write("ptStudio", st);
      document.getElementById("pfSalvar").click(); // re-renderiza tudo (inclui pendências)
    });
    await p.waitForTimeout(250);
    const pendCartao = await p.evaluate(() => document.getElementById("pendentes").innerHTML);
    ok(/João Cliente/.test(pendCartao) && /no cartão/.test(pendCartao) && /tag ok/.test(pendCartao), "pendência de quem tem assinatura ganha o chip 🔁 no cartão");
    await p.evaluate(() => {
      const st = window.MTStore.read("ptStudio", {});
      st.pagamentos = window.__pgtosGuardados;
      window.MTStore.write("ptStudio", st);
    });
    // ver status → resposta traduzida pra pt-BR
    await p.evaluate(() => { window.__alertOrig = window.alert; window.alert = (m) => { window.__stMsg = m; }; });
    await p.click("#pfAssinaturaStatus");
    await p.waitForFunction(() => !!window.__stMsg, null, { timeout: 5000 });
    const stMsg = await p.evaluate(() => { const m = window.__stMsg; window.alert = window.__alertOrig; return m; });
    ok(/ativa/.test(stMsg) && /07\/09\/2026/.test(stMsg) && /450/.test(stMsg), "ver status traduz pra pt-BR com a próxima cobrança e o valor");
    // cancelar (confirm) remove a assinaturaRec
    await p.evaluate(() => { window.__confirmOrig = window.confirm; window.confirm = () => true; });
    await p.click("#pfAssinaturaCancela");
    await p.waitForFunction(() => !window.MTStore.read("ptStudio", {}).alunos[0].assinaturaRec, null, { timeout: 5000 });
    const cancelou = await p.evaluate(() => ({
      rec: window.MTStore.read("ptStudio", {}).alunos[0].assinaturaRec,
      box: document.getElementById("pfAssinaturaBox").textContent,
      corpo: window.__cartaoChamadas.funcao.find((c) => c.acao === "assinatura_cancela"),
    }));
    ok(!cancelou.rec && /Ativar mensalidade no cartão/.test(cancelou.box), "cancelar (com confirmação) remove a assinaturaRec e volta o botão de ativar");
    ok(cancelou.corpo && cancelou.corpo.assinaturaId === "sub_teste_1", "cancelamento chama a nuvem com o id da assinatura");
    // restaura os originais pro resto da suíte
    await p.evaluate(() => {
      window.confirm = window.__confirmOrig;
      window.fetch = window.__fetchOrig;
      window.MTStore.cloud = window.__cloudOrig;
      document.getElementById("pfFechar").click();
    });

    // 🔁 baixa automática: eventos do webhook viram pagamento registrado + alerta de recusa
    const baixa = await p.evaluate(async () => {
      const st = window.MTStore.read("ptStudio", {});
      st.alunos[0].assinaturaRec = { id: "sub_hook_1", desde: window.MTStore.todayISO(), valor: 450 };
      window.MTStore.write("ptStudio", st);
      window.__cloudOrigB = window.MTStore.cloud;
      const eventos = [
        { id: "ev1", tipo: "charge.paid", valor_centavos: 45000, assinatura_id: "sub_hook_1", criado: "2026-08-01T10:00:00Z" },
        { id: "ev2", tipo: "charge.payment_failed", valor_centavos: 45000, assinatura_id: "sub_hook_1", criado: "2026-08-06T10:00:00Z" },
      ];
      window.MTStore.cloud = () => ({
        aid: "x",
        client: { from: () => ({ select: () => ({ in: () => ({ order: () => ({ limit: () => Promise.resolve({ data: eventos }) }) }) }) }) },
      });
      window.__pagAuto();
      await new Promise((res) => setTimeout(res, 300));
      window.__pagAuto(); // segunda chamada não pode duplicar
      await new Promise((res) => setTimeout(res, 300));
      window.MTStore.cloud = window.__cloudOrigB;
      const st2 = window.MTStore.read("ptStudio", {});
      const pgs = st2.pagamentos.filter((x) => x.eventoId === "ev1");
      return { n: pgs.length, valor: pgs[0] && pgs[0].valor, forma: pgs[0] && pgs[0].forma, falhou: st2.alunos[0].cartaoFalhouEm };
    });
    ok(baixa.n === 1 && baixa.valor === 450 && /cartão/.test(baixa.forma), "webhook pago vira pagamento registrado sozinho (sem duplicar)");
    ok(!!baixa.falhou, "cartão recusado marca o alerta no aluno");
    await p.evaluate(() => {
      const st = window.MTStore.read("ptStudio", {});
      delete st.alunos[0].assinaturaRec;
      st.alunos[0].cartaoFalhouEm = "";
      st.pagamentos = st.pagamentos.filter((x) => !x.eventoId);
      window.MTStore.write("ptStudio", st);
    });
  }

  // ⏰ validade da ficha + 📔 diário de sessões + 📄 relatório PDF
  console.log("Validade, diário e relatório PDF:");
  {
    await abaPt(p, "treinos");
    await p.evaluate(() => {
      const st = window.MTStore.read("ptStudio", {});
      document.getElementById("tAluno").value = st.alunos[0].id;
      const v = document.getElementById("tValidade");
      v.value = "2020-01-01";
      v.dispatchEvent(new Event("change"));
    });
    const validade = await p.evaluate(() => {
      const st = window.MTStore.read("ptStudio", {});
      return st.treinosV2[st.alunos[0].id].validade;
    });
    ok(validade === "2020-01-01", "campo ⏰ vale até grava a validade da ficha");
    // um save qualquer re-renderiza tudo (lista + alertas)
    await p.evaluate(() => { window.__perfilPT(window.MTStore.read("ptStudio", {}).alunos[0].id); window.__pfAba("cadastro"); });
    await p.click("#pfSalvar");
    await p.waitForTimeout(250);
    ok(await p.evaluate(() => /TREINO VENCIDO/.test(document.getElementById("listaAlunos").textContent)), "ficha vencida ganha a etiqueta ⏰ TREINO VENCIDO na lista");
    await abaPt(p, "relatorios");
    ok(await p.evaluate(() => /venceu em/.test(document.getElementById("relAlertas").textContent)), "alerta de renovação entra nos Alertas do studio");
    await p.evaluate(() => { window.__perfilPT(window.MTStore.read("ptStudio", {}).alunos[0].id); });
    const appVencida = await p.evaluate(() => {
      const st = window.MTStore.read("ptStudio", {});
      return window.__montaAppAluno(st.alunos[0], new Date().toISOString());
    });
    ok(/Sua ficha venceu em/.test(appVencida) && /cobra o treino novo/.test(appVencida), "app do aluno avisa que a ficha venceu");
    // diário de sessões (perfil ainda aberto — muda pra aba Frequência)
    await p.evaluate(() => window.__pfAba("freq"));
    await p.fill("#pfDiarioTxt", "Evoluiu no supino, dor leve no ombro D");
    await p.click("#pfDiarioAdd");
    await p.waitForTimeout(150);
    const diario = await p.evaluate(() => document.getElementById("pfDiarioLista").textContent);
    ok(/Evoluiu no supino/.test(diario), "diário de sessões registra a anotação com data");
    // relatório PDF (usa as avaliações já lançadas nos testes de dobras)
    const rel = await p.evaluate(() => {
      const st = window.MTStore.read("ptStudio", {});
      return window.__relPdf(st.alunos[0].id);
    });
    ok(/RELATÓRIO DE AVALIAÇÃO/.test(rel) && /João Cliente/.test(rel) && /Avaliações<\/h3>/.test(rel), "relatório PDF sai com a marca do studio e a tabela de avaliações");
    ok(/Evoluiu no supino/.test(rel) && /Imprimir \/ salvar em PDF/.test(rel), "relatório inclui o diário recente e o botão de imprimir");
    await p.evaluate(() => document.getElementById("pfFechar").click());
  }

  // ---------- confiança: backup no card da ilha + indicador da nuvem ----------
  console.log("Backup e indicador da nuvem:");
  await abaPt(p, "conta");
  ok(await p.evaluate(() => !!document.getElementById("btnBackup") && !!document.getElementById("btnBackupRestaura") &&
    /backup/i.test(document.getElementById("bkAviso").textContent)), "card da ilha tem o bloco de backup com aviso");
  await p.evaluate(() => {
    const orig = URL.createObjectURL;
    URL.createObjectURL = () => "blob:mock";
    try { document.getElementById("btnBackup").click(); } finally { URL.createObjectURL = orig; }
  });
  await p.waitForTimeout(250);
  ok(await p.evaluate(() => (JSON.parse(localStorage.getItem("mtapp:ptStudio")).config || {}).backupEm === new Date().toISOString().slice(0, 10) &&
    /Último backup/.test(document.getElementById("bkAviso").textContent)), "baixar backup grava a data e o aviso passa a mostrar");
  ok(await p.evaluate(() => {
    window.MT_syncInfo({ ativa: true, ultima: new Date(), pendentes: 0 });
    const emDia = !document.getElementById("syncInfoPt").hidden && /Nuvem em dia/.test(document.getElementById("syncInfoPt").textContent);
    window.MT_syncInfo({ ativa: true, ultima: new Date(), pendentes: 3 });
    const pendente = /3 alteração/.test(document.getElementById("syncInfoPt").textContent) && /não fecha a página/.test(document.getElementById("syncInfoPt").textContent);
    window.MT_syncInfo({ ativa: false });
    const escondido = document.getElementById("syncInfoPt").hidden;
    return emDia && pendente && escondido;
  }), "indicador da nuvem: em dia / alterações pendentes / some sem conta");

  // aluno "Encerrar" some da lista
  await abaPt(p, "alunos");
  // as ações agora vivem no menu retrátil ⋮ — lista limpa, sem fileira de botões
  ok(await p.evaluate(() => {
    const acoes = document.querySelector("#listaAlunos [data-acoes]");
    return !!document.querySelector("#listaAlunos [data-mais]") && acoes && acoes.hidden;
  }), "lista de alunos limpa: ações escondidas atrás do botão ⋮");
  await p.evaluate(() => document.querySelector("#listaAlunos [data-mais]").click());
  ok(await p.evaluate(() => !document.querySelector("#listaAlunos [data-acoes]").hidden), "toque no ⋮ abre as ações do aluno");
  await p.click("#listaAlunos [data-rm]");
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
  ok(/personal trainer/.test(corpo) && /Treino guiado/.test(corpo) && /R\$ 49/.test(corpo), "landing com pitch, features atuais e preço");
  ok(/14 dias grátis/.test(corpo) && /sem cartão/.test(corpo), "trial de 14 dias visível na landing (selo + preço)");
  ok(await p.evaluate(() => [...document.querySelectorAll("a.cta")].some((a) => /Testar grátis/.test(a.textContent) && /personal\.html/.test(a.href))), "CTA 'Testar grátis' leva direto pro módulo");
  {
    // o número de exercícios anunciado nunca pode ficar acima do banco real
    const anunciado = +((corpo.match(/(\d{3,4})\+? exercícios/) || [])[1] || 0);
    const real = await p.evaluate(async () => {
      const t = await (await fetch("assets/exercicios-db.js")).text();
      return (t.match(/"n":/g) || []).length;
    });
    ok(anunciado >= 900 && anunciado <= real, "landing anuncia " + anunciado + " exercícios e o banco tem " + real + " (anúncio nunca acima do real)");
  }
  await p.close();

  // ---------- 4) login próprio do TORQUE PERSONAL (gate do módulo) ----------
  console.log("Login próprio do módulo:");
  const ctxG = await b.newContext({ viewport: { width: 1360, height: 900 } });
  await ctxG.addInitScript(() => localStorage.setItem("mtapp:perfil", JSON.stringify({ nome: "R" })));
  const pG = await ctxG.newPage();
  pG.on("pageerror", (e) => erros.push(String(e)));
  await pG.goto(BASE + "/personal.html");
  await pG.waitForFunction(() => document.getElementById("gateModulo") && !document.getElementById("gateModulo").hidden, null, { timeout: 8000 });
  const gateTxt = await pG.evaluate(() => document.getElementById("gateModulo").textContent);
  ok(/TORQUE/.test(gateTxt) && /PERSONAL/.test(gateTxt), "tela de entrada com a marca TORQUE PERSONAL (não manda pro portal)");
  ok(/Entrar/.test(gateTxt) && /Experimentar sem conta/.test(gateTxt), "gate com Entrar + modo local");
  ok(!/Criar conta/.test(gateTxt) && /equipe TORQUE ON/.test(gateTxt), "sem autoatendimento: conta é criada pela equipe TORQUE ON (fim do código)");
  await pG.click("#mgLocal");
  const fechou = await pG.evaluate(() => document.getElementById("gateModulo").hidden && !document.getElementById("boasVindas").hidden);
  ok(fechou, "'experimentar sem conta' fecha o gate e abre o onboarding");
  const temBotoes = await pG.evaluate(() => !!document.getElementById("btnContaEntrar") && !!document.getElementById("btnContaSair") && !!document.getElementById("btnContaEquipe"));
  ok(temBotoes, "card da ilha com botões Entrar/Sair/Colaborador próprios do módulo");
  await pG.close();
  await ctxG.close();

  // demo do studio preenchido (demo-personal.html)
  console.log("Demo do studio preenchido:");
  {
    // contexto limpo: o demo semeia 8 alunos e abre o personal
    const ctxD = await b.newContext({ viewport: { width: 1360, height: 900 } });
    const pD = await ctxD.newPage();
    pD.on("pageerror", (e) => erros.push("demo: " + e));
    pD.on("dialog", (d) => d.accept());
    await pD.goto(BASE + "/demo-personal.html");
    await pD.click("#btnDemo");
    await pD.waitForFunction(() => window.__ptStudio);
    await pD.waitForTimeout(600);
    const demo = await pD.evaluate(() => {
      const st = window.MTStore.read("ptStudio", {});
      window.__perfilPT(st.alunos[0].id);
      return new Promise((res) => setTimeout(() => res({
        alunos: st.alunos.length,
        fichas: Object.keys(st.treinosV2 || {}).length,
        pagamentos: (st.pagamentos || []).length,
        avaliacoes: (st.avaliacoes || []).length,
        kpis: document.getElementById("kpisPt") ? document.getElementById("kpisPt").textContent : document.body.textContent.slice(0, 50),
        app: document.getElementById("pfAppDados").innerHTML,
      }), 400));
    });
    ok(demo.alunos === 8 && demo.fichas === 8 && demo.pagamentos > 20 && demo.avaliacoes > 15, "demo semeia 8 alunos com fichas, pagamentos e avaliações");
    ok(/<svg/.test(demo.app) && /Hábitos diários/.test(demo.app) && /ANTES/.test(demo.app), "perfil do demo mostra os gráficos do app (peso, hábitos, fotos)");
    ok(/Check-ins respondidos no app/.test(demo.app) && /stroke=["']#fbbf24["']/.test(demo.app), "demo também mostra os check-ins de questionário com gráfico de pontuação");
    // com dados existentes o demo NÃO sobrescreve
    const pD2 = await ctxD.newPage();
    await pD2.goto(BASE + "/demo-personal.html");
    const aviso = await pD2.evaluate(() => !document.getElementById("alerta").hidden);
    await pD2.click("#btnDemo");
    await pD2.waitForTimeout(300);
    const preservado = await pD2.evaluate(() => /personal\.html/.test(location.pathname) && JSON.parse(localStorage.getItem("mtapp:ptStudio")).alunos.length === 8);
    ok(aviso && preservado, "com dados já existentes o demo avisa e não sobrescreve nada");
    await pD2.close();
    await pD.close();
    await ctxD.close();
  }

  // ---------- sync: aparelho novo com estado vazio NÃO sobrescreve a nuvem ----------
  console.log("Proteção do primeiro sync:");
  {
    const ctxS = await b.newContext({ viewport: { width: 1360, height: 900 } });
    await ctxS.addInitScript(() => {
      localStorage.setItem("mtapp:perfil", JSON.stringify({ nome: "R" }));
      localStorage.setItem("mtapp:academia", JSON.stringify({ id: "acad-1", papel: "dono" }));
      // aparelho recém-instalado: onboarding semeou o estado VAZIO com carimbo de agora
      localStorage.setItem("mtapp:ptStudio", JSON.stringify({ alunos: [], sessoes: [], pagamentos: [], config: {} }));
      localStorage.setItem("mtsync:ts", JSON.stringify({ "mtapp:ptStudio": "2099-12-31T00:00:00.000Z" }));
      localStorage.setItem("mtapp:ptSemConta", "1");
    });
    const pS = await ctxS.newPage();
    pS.on("pageerror", (e) => erros.push("sync: " + e));
    await pS.goto(BASE + "/personal.html");
    await pS.waitForTimeout(500);
    const guarda = await pS.evaluate(async () => {
      // cliente fake: a nuvem tem 3 alunos com carimbo MAIS VELHO que o local vazio
      const nuvemVal = { alunos: [{ id: "n1", nome: "Aluno Nuvem 1", ativo: true }, { id: "n2", nome: "Aluno Nuvem 2", ativo: true }, { id: "n3", nome: "Aluno Nuvem 3", ativo: true }], sessoes: [], pagamentos: [], config: {} };
      const upserts = [];
      // consulta encadeável (eq/in/gt/order/limit…) que resolve com a resposta dada
      const consulta = (resp) => {
        const o = { then: (fn, rej) => Promise.resolve(resp).then(fn, rej) };
        ["eq", "in", "gt", "gte", "lt", "lte", "order", "limit", "select", "neq", "is"].forEach((k) => { o[k] = () => o; });
        return o;
      };
      window.MT_supabase = {
        auth: { getSession: async () => ({ data: { session: { user: { email: "r@t.br" } } } }) },
        rpc: () => Promise.resolve({ data: null }),
        from: (tabela) => ({
          select: () => consulta(tabela === "dados"
            ? { data: [{ chave: "mtapp:ptStudio", valor: nuvemVal, atualizado: "2099-01-01T00:00:00.000Z" }] }
            : { data: [] }),
          upsert: (linhas) => { upserts.push(...(Array.isArray(linhas) ? linhas : [linhas])); return Promise.resolve({}); },
          insert: () => Promise.resolve({}),
        }),
      };
      window.MTStore.iniciaSync();
      await new Promise((res) => setTimeout(res, 2000));
      return {
        alunos: (JSON.parse(localStorage.getItem("mtapp:ptStudio")).alunos || []).length,
        subiuVazio: upserts.some((l) => l.chave === "mtapp:ptStudio" && (!l.valor || !(l.valor.alunos || []).length)),
      };
    });
    ok(guarda.alunos === 3, "1º sync num aparelho vazio: a base da nuvem vence (3 alunos aplicados)");
    ok(!guarda.subiuVazio, "o estado vazio do aparelho novo NUNCA sobe por cima da nuvem");
    await pS.close();
    await ctxS.close();
  }

  ok(erros.length === 0, "nenhuma página com erro de JS" + (erros.length ? " — " + erros[0] : ""));

  await b.close();
  console.log(falhas ? "\n💥 " + falhas + " FALHA(S)" : "\n🏁 TUDO PASSOU");
  process.exit(falhas ? 1 : 0);
})();
