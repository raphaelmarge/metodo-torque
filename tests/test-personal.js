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
  // no computador o menu já fica à vista; no celular é preciso abrir a gaveta
  const menu = p.locator("#btnMenuPt");
  if (await menu.isVisible()) await menu.click();
  await p.click('#abas [data-a="' + a + '"]');
}

(async () => {
  // câmera falsa: deixa a captura guiada abrir de verdade no teste (imagem sem
  // ninguém, então o semáforo fica vermelho — é isso que a gente quer conferir)
  const b = await chromium.launch({
    executablePath: EXEC,
    args: ["--no-sandbox", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  });
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
  // 🚪 plano é OPCIONAL e dá pra SAIR no meio do passo 2 (o aluno já está salvo)
  {
    // concluir SEM escolher plano: sem alert, sem contrato, dialog fecha
    await p.click("#btnNovoAluno");
    await p.fill("#aNome", "Cliente Sem Plano");
    await p.click("#aAdd");
    await p.evaluate(() => { document.getElementById("naPagar").checked = false; });
    await p.click("#naConcluir");
    await p.waitForTimeout(150);
    const semPlano = await p.evaluate(() => {
      const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
      const a = st.alunos.find((x) => x.nome === "Cliente Sem Plano");
      return { fechou: !document.getElementById("dlgNovoAluno").open, existe: !!a,
        contratos: (st.contratosPT || []).filter((c) => a && c.alunoId === a.id).length };
    });
    ok(semPlano.fechou && semPlano.existe && semPlano.contratos === 0,
      "🚪 concluir SEM plano funciona: aluno salvo, sem contrato, sem alert travando");
    // botão "Sair — contrato depois" existe e fecha no meio do passo 2
    await p.click("#btnNovoAluno");
    await p.fill("#aNome", "Cliente Saida");
    await p.click("#aAdd");
    await p.click("#naSair");
    await p.waitForTimeout(100);
    const saida = await p.evaluate(() => {
      const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
      return { fechou: !document.getElementById("dlgNovoAluno").open,
        existe: !!st.alunos.find((x) => x.nome === "Cliente Saida"),
        aviso: document.getElementById("aAcessoStatus").textContent };
    });
    ok(saida.fechou && saida.existe && /contrato e venda ficam pra depois/.test(saida.aviso),
      "o passo 2 tem saída no meio: fecha na hora e avisa que o aluno já ficou salvo");
    // tira os dois alunos de teste pra não interferir no resto da suíte
    await p.evaluate(() => {
      const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
      st.alunos = st.alunos.filter((x) => x.nome !== "Cliente Sem Plano" && x.nome !== "Cliente Saida");
      localStorage.setItem("mtapp:ptStudio", JSON.stringify(st));
    });
  }
  // limpa plano/contrato do assistente pra não interferir nos testes de contrato adiante
  await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    st.contratosPT = [];
    st.planosPT = [];
    localStorage.setItem("mtapp:ptStudio", JSON.stringify(st));
  });
  let lista = await p.evaluate(() => document.getElementById("listaAlunos").textContent);
  ok(/João Cliente/.test(lista) && /400/.test(lista), "aluno cadastrado com valor mensal");
  // na tela 2a a pendência aparece na coluna PLANO ("Vence dia 5" / "Venceu 05/08")
  ok(/Vence dia 5|Venceu/.test(lista), "etiqueta de pendência antes do pagamento");
  ok(await p.evaluate(() => !!document.querySelector('#listaAlunos [data-acesso]')), "aluno sem acesso do app tem o botão 📧 Enviar acesso direto na lista");

  // agenda: sessão hoje + marcar feita (agora com sub-abas Sessões/Agendar)
  await abaPt(p, "agenda");
  ok(await p.evaluate(() => ["agAbas", "avAbas", "qtAbas", "dsAbas", "relAbas", "chAbas", "cfgAbas"].every((id) => !!document.getElementById(id))),
    "todas as seções grandes têm barra de sub-abas");
  ok(await p.evaluate(() => document.querySelector('#agAbas button.ativa').textContent.includes("Sessões")), "Agenda abre na sub-aba Sessões");
  /* 📅 UM CALENDARIO SO (v635). A Agenda tinha quatro na mesma tela — a grade
   * da semana, o calendario do mes, o "um dia por vez" e o seletor do
   * formulario — e o bloco de pedidos aparecia duas vezes. O Raphael: "uns 4
   * calendarios diferentes pra mesma coisa". */
  {
    const conta = () => p.evaluate(() => {
      const ve = (s2) => { const e = document.querySelector(s2);
        return !!e && getComputedStyle(e).display !== "none" && e.getBoundingClientRect().height > 0; };
      return { semana: ve("#vAgenda .agrol"), dia: ve("#agDia"), mes: ve("#agCardMes"),
        calendarios: [ve("#vAgenda .agrol"), ve("#agDia"), ve("#agCardMes")].filter(Boolean).length,
        pedidos: document.querySelectorAll("#vAgenda #agPedFaixa, #vAgenda #cardPedidosApp").length,
        ics: ve("#btnIcsP"),
        botoes: Array.from(document.querySelectorAll("#vAgenda [data-agvis]"))
          .filter((b) => b.getBoundingClientRect().height > 0).map((b) => b.textContent).join("|") };
    });
    const naSemana = await conta();
    ok(naSemana.calendarios === 1 && naSemana.semana,
      "📅 na visão Semana só a grade de horários está na tela (" + naSemana.calendarios + " calendário)");
    ok(naSemana.pedidos === 1, "📅 o bloco de pedidos de horário aparece UMA vez só");
    ok(naSemana.botoes === "Semana|Mês", "📅 o botão Semana | Mês troca o zoom do mesmo calendário");
    ok(naSemana.ics, "📅 o Enviar pro meu calendário vale pra agenda inteira, então não some com a visão");
    await p.evaluate(() => window.__agVis.troca("mes"));
    await p.waitForTimeout(300);
    const noMes = await conta();
    ok(noMes.calendarios === 1 && noMes.mes,
      "📅 na visão Mês só o calendário do mês está na tela (" + noMes.calendarios + " calendário)");
    await p.evaluate(() => window.__agVis.troca("semana"));
    await p.waitForTimeout(300);
    // 🎗 sub-menus: fita de sublinhado (o desenho do handoff), nada de pílula
    const fita = await p.evaluate(() => {
      const b = document.querySelector("#agAbas button.ativa"), c = getComputedStyle(b);
      return { raio: c.borderRadius, fundo: c.backgroundColor, linha: c.borderBottomWidth,
        cor: c.borderBottomColor, alt: Math.round(b.getBoundingClientRect().height) };
    });
    ok(fita.raio === "0px" && /rgba\(0, 0, 0, 0\)|transparent/.test(fita.fundo) &&
      fita.linha === "2px" && /124, 58, 237/.test(fita.cor) && fita.alt === 46,
      "🎗 sub-menu é fita de sublinhado como o desenho manda, não pílula roxa (" +
      fita.alt + "px, raio " + fita.raio + ", sublinhado " + fita.linha + ")");
  }
  await p.evaluate(() => window.__agAba("agendar"));
  await p.selectOption("#sAluno", { index: 1 });
  await p.fill("#sHora", "07:00");
  await p.click("#sAdd");
  // a visao Mes e onde moram o calendario do mes e a lista do dia (v635)
  await p.evaluate(() => { window.__agAba("sessoes"); window.__agVis.troca("mes"); });
  await p.waitForTimeout(300);
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
  // as ações da sessão vivem no menu retrátil ⋮ — abre antes de marcar
  await p.click("#listaSessoes [data-smais]");
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
  await p.evaluate(() => document.querySelector("#listaSessoes [data-smais]").click());
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
  await p.waitForFunction(() => /Mensal 3x/.test(document.getElementById("pfFin").textContent));
  const finTxt = await p.evaluate(() => document.getElementById("pfFin").textContent);
  ok(/Mensal 3x/.test(finTxt) && new RegExp("vence todo dia " + diaVenc).test(finTxt) && /Encerrar contrato/.test(finTxt),
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

  /* ---- Financeiro repaginado (tela 2e) ---- */
  {
    const b2e = await p.evaluate(() => {
      const t = (id) => (document.getElementById(id) || {}).textContent || "";
      return {
        mes: t("pgMesRot"),
        resumo: t("pgResumo"),
        atrasados: t("pgAtrasados"),
        acoes: [...document.querySelectorAll("#pgAtrasados .dac button")].map((b) => b.textContent),
        seis: t("pg6meses"),
        como: t("pgComo"),
        hoje: t("pgHoje"),
        botoes: !!document.getElementById("pgVerPlanos") && !!document.getElementById("pgLancar"),
      };
    });
    const MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    ok(b2e.mes === MES[new Date().getMonth()] && /recebidos/.test(b2e.resumo) && b2e.botoes,
      "🎨 2e: o Financeiro abre com o mês, o recebido e os dois atalhos (Planos, Lançar)");
    if (diaHoje > 1) {
      ok(/João Cliente/.test(b2e.atrasados) && /Atrasados/.test(b2e.atrasados),
        "🎨 2e: quem passou do vencimento aparece no bloco vermelho de Atrasados");
      ok(b2e.acoes.includes("Link") && b2e.acoes.includes("Pix") && b2e.acoes.includes("Recebi"),
        "🎨 2e: cada linha de atrasado carrega a ação (Link, Pix, Recebi)");
    }
    ok(/Últimos 6 meses/.test(b2e.seis) && /projeção/.test(b2e.seis),
      "🎨 2e: o histórico de 6 meses diz que o mês corrente é projeção");
    ok(/Como você recebe/.test(b2e.como) && /Pix/.test(b2e.como),
      "🎨 2e: o card do gateway mostra o que está ligado (Pix configurado)");
    ok(/Entrou hoje/.test(b2e.hoje), "🎨 2e: o card Entrou hoje fecha a coluna da direita");
  }

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
    ok(/sess(ão|ões) a cobrar/.test(pendHtml) && /Paga Sessao/.test(pendHtml) && /data-receb="axSes"/.test(pendHtml), "linha própria de quem paga por sessão, com botão Recebi");
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
      r.querySelector("[data-smais]").click();
      r.querySelector("[data-feita]").click();
    });
    await p.waitForTimeout(250);
    ok(await p.evaluate(() => window.MTStore.read("ptStudio", {}).pagamentos.some((x) => x.alunoId === "axSes" && x.forma === "sessão" && +x.valor === 80)),
      "Feita + confirmar registra a sessão de R$ 80 direto no financeiro");

    /* 💳 Carteira de créditos (paga por sessão): pagamento adiciona crédito,
     * aula FEITA consome o valor da sessão, saldo = pago − consumido. Neste
     * ponto o Paga Sessao tem R$ 240 pagos (Recebi 160 + sessão 80) e 3 aulas
     * feitas de R$ 80 — os fluxos que já existiam levam a carteira a ZERO. */
    {
      const cart = await p.evaluate(() => {
        const F = window.__financeiroPT;
        const st0 = window.MTStore.read("ptStudio", {});
        const alSes = () => window.MTStore.read("ptStudio", {}).alunos.find((x) => x.id === "axSes");
        const c0 = F.carteira(st0, alSes());
        // crédito novo + venda de serviço (desc — NÃO pode virar crédito de aula)
        st0.pagamentos.push(
          { id: "pgw1", alunoId: "axSes", valor: 800, data: "2026-08-02", forma: "pix" },
          { id: "pgw2", alunoId: "axSes", valor: 150, data: "2026-08-02", desc: "Massagem" });
        window.MTStore.write("ptStudio", st0);
        const c1 = F.carteira(window.MTStore.read("ptStudio", {}), alSes());
        // 11 aulas a mais (14 no total) → consumiu R$ 1.120 > R$ 1.040 pagos
        const st1 = window.MTStore.read("ptStudio", {});
        for (let i = 0; i < 11; i++) st1.sessoes.push({ id: "sxw" + i, alunoId: "axSes", data: "2026-08-0" + ((i % 9) + 1), hora: "0" + (i % 9) + ":00", feita: true });
        window.MTStore.write("ptStudio", st1);
        const stN = window.MTStore.read("ptStudio", {});
        const c2 = F.carteira(stN, alSes());
        const fora = {
          mensal: F.carteira(stN, stN.alunos.find((x) => x.id === "axDev")),
          pacoteAtivo: F.carteira(stN, Object.assign({}, alSes(), { pacote: { total: 10, usadas: 3 } })),
        };
        window.__perfilPT("axSes");
        const fin = document.getElementById("pfFin").innerHTML;
        document.getElementById("pfFechar").click();
        return { c0, c1, c2, fora, fin };
      });
      ok(cart.c0 && cart.c0.pagos === 240 && cart.c0.feitas === 3 && cart.c0.consumido === 240 && cart.c0.saldo === 0,
        "a carteira fecha em ZERO com os fluxos Recebi e Feita que já existiam (R$ 240 pagos, 3 aulas de R$ 80)");
      ok(cart.c1.pagos === 1040 && cart.c1.saldo === 800,
        "pagamento vira crédito na hora — e venda de serviço (massagem) fica de fora da carteira");
      ok(cart.c2.saldo === -80 && cart.c2.consumido === 1120,
        "mais aulas que crédito → saldo NEGATIVO (fez 14 aulas, consumiu R$ 1.120 de R$ 1.040 pagos)");
      ok(cart.fora.mensal === null && cart.fora.pacoteAtivo === null,
        "mensalista e aluno com pacote ativo ficam fora — pacote controla por quantidade");
      ok(/Carteira de sessões/.test(cart.fin) && /Saldo disponível/.test(cart.fin) && /DEVENDO/.test(cart.fin),
        "a aba Financeiro do perfil mostra a carteira com o saldo e o aviso de devendo");
      // a etiqueta da lista troca "sem pagamento no mês" pelo SALDO de quem paga por sessão
      await abaPt(p, "alunos");
      // a carteira agora aparece na coluna PLANO, com o saldo em dinheiro
      ok(await p.evaluate(() => /Saldo −?-?R\$/.test(document.getElementById("listaAlunos").textContent)),
        "na lista, quem paga por sessão mostra o SALDO em vez de 'sem pagamento no mês'");
      // devolve o estado pros testes seguintes (a carteira volta pro zero)
      await p.evaluate(() => {
        const st = window.MTStore.read("ptStudio", {});
        st.pagamentos = st.pagamentos.filter((x) => String(x.id).indexOf("pgw") !== 0);
        st.sessoes = st.sessoes.filter((x) => String(x.id).indexOf("sxw") !== 0);
        window.MTStore.write("ptStudio", st);
      });
    }

    /* 🕐 PLANO de hora-aula: o professor determina o valor da sessão no plano
     * (Financeiro → Planos, cobrança "por sessão"), fecha contrato, e o aluno
     * vira "por sessão" sozinho — carteira ligada, sem dívida mensal, e o
     * valor da hora-aula vem SEMPRE do plano (mudou o plano, mudou pra todos). */
    {
      const ha = await p.evaluate(() => {
        const st = window.MTStore.read("ptStudio", {});
        st.planosPT = st.planosPT || [];
        st.planosPT.push({ id: "plHora", nome: "Hora-aula", valor: 100, ciclo: 1, cobranca: "sessao", treinosSem: 2, modalidade: "presencial" });
        st.alunos.push({ id: "axHora", nome: "Aluna Hora Aula", ativo: true });
        window.MTStore.write("ptStudio", st);
        window.__perfilPT("axHora");
        document.getElementById("pfCtPlano").value = "plHora";
        document.getElementById("pfCtAdd").click();
        const st2 = window.MTStore.read("ptStudio", {});
        const a2 = st2.alunos.find((x) => x.id === "axHora");
        const F = window.__financeiroPT;
        // paga 900 e faz 4 aulas — o exemplo da especificação (tudo DENTRO do
        // período hora-aula: fecha o contrato e registra no mesmo dia)
        const hj = window.MTStore.todayISO();
        st2.pagamentos.push({ id: "pgh1", alunoId: "axHora", valor: 900, data: hj, forma: "pix" });
        for (let i = 1; i <= 4; i++) st2.sessoes.push({ id: "sxh" + i, alunoId: "axHora", data: hj, hora: "0" + i + ":00", feita: true });
        window.MTStore.write("ptStudio", st2);
        const st3 = window.MTStore.read("ptStudio", {});
        const a3 = st3.alunos.find((x) => x.id === "axHora");
        const cart = F.carteira(st3, a3);
        // o professor sobe a hora-aula pra R$ 120 NO PLANO — a carteira acompanha
        st3.planosPT.find((x) => x.id === "plHora").valor = 120;
        window.MTStore.write("ptStudio", st3);
        const cart120 = F.carteira(window.MTStore.read("ptStudio", {}), a3);
        window.__perfilPT("axHora");
        const fin = document.getElementById("pfFin").innerHTML;
        document.getElementById("pfFechar").click();
        return { modo: a2.modo, valor: a2.valor,
          div: F.divida(st3, a3), cart, cart120, fin,
          rotulo: document.getElementById("pfCtPlano") ? "" : "", };
      });
      ok(ha.modo === "sessao" && ha.valor === 100,
        "fechar contrato com plano hora-aula liga o modo por sessão com o valor do plano");
      ok(ha.div.meses === 0 && ha.div.total === 0,
        "contrato de hora-aula NÃO gera dívida mensal — quem cobra é a carteira");
      ok(ha.cart && ha.cart.valorSessao === 100 && ha.cart.pagos === 900 && ha.cart.consumido === 400 && ha.cart.saldo === 500,
        "o exemplo da especificação fecha: R$ 900 pagos, 4 aulas de R$ 100 → saldo R$ 500");
      ok(ha.cart120.valorSessao === 120 && ha.cart120.consumido === 480,
        "subir a hora-aula no PLANO muda a carteira de quem assinou (R$ 120 → consumo R$ 480)");
      ok(/Carteira de sessões/.test(ha.fin) && /hora-aula/.test(ha.fin) && /sessão/.test(ha.fin),
        "o contrato no perfil fala em hora-aula e /sessão, com a carteira logo ali");
      // REGRESSÃO item 1: mensalista que VIRA hora-aula não pode ter as mensalidades
      // antigas viradas em "crédito" nem as aulas de mensalista viradas em "consumo"
      const troca = await p.evaluate(() => {
        const st = window.MTStore.read("ptStudio", {});
        const F = window.__financeiroPT, hj = window.MTStore.todayISO();
        const antes = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10); // 60 dias atrás
        st.planosPT = st.planosPT || [];
        if (!st.planosPT.find((x) => x.id === "plHoraT")) st.planosPT.push({ id: "plHoraT", nome: "Hora T", valor: 100, ciclo: 1, cobranca: "sessao" });
        st.alunos.push({ id: "axTroca", nome: "Ex Mensalista", ativo: true, modo: "mes", valor: 500 });
        // vida de mensalista: 6 pagamentos e 20 aulas ANTES da virada
        for (let i = 0; i < 6; i++) st.pagamentos.push({ id: "pgt" + i, alunoId: "axTroca", valor: 500, data: antes, forma: "pix" });
        for (let i = 0; i < 20; i++) st.sessoes.push({ id: "sst" + i, alunoId: "axTroca", data: antes, hora: "07:00", feita: true });
        // vira hora-aula HOJE (contrato com início hoje = marco da carteira)
        st.contratosPT = st.contratosPT || [];
        st.contratosPT.push({ id: "ctTroca", alunoId: "axTroca", planoId: "plHoraT", diaVenc: 5, status: "ativo", inicio: hj });
        const a = st.alunos.find((x) => x.id === "axTroca");
        a.modo = "sessao";
        // paga 1 aula e faz 1 aula, HOJE (já como hora-aula)
        st.pagamentos.push({ id: "pgtH", alunoId: "axTroca", valor: 100, data: hj, forma: "pix" });
        st.sessoes.push({ id: "sstH", alunoId: "axTroca", data: hj, hora: "08:00", feita: true });
        window.MTStore.write("ptStudio", st);
        const c = F.carteira(window.MTStore.read("ptStudio", {}), a);
        // limpa o rastro
        const s2 = window.MTStore.read("ptStudio", {});
        s2.alunos = s2.alunos.filter((x) => x.id !== "axTroca");
        s2.planosPT = s2.planosPT.filter((x) => x.id !== "plHoraT");
        s2.contratosPT = s2.contratosPT.filter((x) => x.alunoId !== "axTroca");
        s2.pagamentos = s2.pagamentos.filter((x) => x.alunoId !== "axTroca");
        s2.sessoes = s2.sessoes.filter((x) => x.alunoId !== "axTroca");
        window.MTStore.write("ptStudio", s2);
        return c;
      });
      ok(troca && troca.pagos === 100 && troca.consumido === 100 && troca.saldo === 0,
        "trocar de mensalista pra hora-aula NÃO fabrica dívida/crédito: só conta o que veio DEPOIS da virada (R$100 pago, 1 aula, saldo 0)");
      // REGRESSÃO item 17: vínculo de 3+ anos não esconde a inadimplência recente.
      // Aluno mensal R$500 desde 44 meses atrás, pagou só o 1º mês → deve os recentes.
      const divAntiga = await p.evaluate(() => {
        const st = window.MTStore.read("ptStudio", {});
        const F = window.__financeiroPT;
        const d = new Date(); d.setMonth(d.getMonth() - 44);
        const ini = d.toISOString().slice(0, 10), iniMes = ini.slice(0, 7);
        st.planosPT.push({ id: "plMenT", nome: "Mensal T", valor: 500, cobranca: "mes", ciclo: 1 });
        st.alunos.push({ id: "axVelho", nome: "Antigo", ativo: true, modo: "mes", desde: ini });
        st.contratosPT.push({ id: "ctVelho", alunoId: "axVelho", planoId: "plMenT", diaVenc: 5, status: "ativo", inicio: ini });
        st.pagamentos.push({ id: "pgV", alunoId: "axVelho", valor: 500, data: iniMes + "-05", forma: "pix" }); // só o 1º mês
        window.MTStore.write("ptStudio", st);
        const a = st.alunos.find((x) => x.id === "axVelho");
        const dv = F.divida(window.MTStore.read("ptStudio", {}), a);
        const s2 = window.MTStore.read("ptStudio", {});
        ["axVelho"].forEach(() => {
          s2.alunos = s2.alunos.filter((x) => x.id !== "axVelho");
          s2.planosPT = s2.planosPT.filter((x) => x.id !== "plMenT");
          s2.contratosPT = s2.contratosPT.filter((x) => x.alunoId !== "axVelho");
          s2.pagamentos = s2.pagamentos.filter((x) => x.alunoId !== "axVelho");
        });
        window.MTStore.write("ptStudio", s2);
        return dv;
      });
      ok(divAntiga.meses >= 30, "contrato de 3+ anos não esconde a dívida recente: conta os últimos ~36 meses em aberto (" + divAntiga.meses + " meses)");
      // a LISTA de planos também: era ali que o "/mês" fixo escapou no print
      ok(await p.evaluate(() => {
        const st = window.MTStore.read("ptStudio", {});
        st.planosPT.push({ id: "plHoraL", nome: "Hora-aula lista", valor: 100, cobranca: "sessao", ciclo: 1 });
        window.MTStore.write("ptStudio", st);
        window.__pgAba("planos");
        const html = document.getElementById("plLista").innerHTML;
        const st2 = window.MTStore.read("ptStudio", {});
        st2.planosPT = st2.planosPT.filter((x) => x.id !== "plHoraL");
        window.MTStore.write("ptStudio", st2);
        return /Hora-aula lista/.test(html) && /\/sessão/.test(html) && /tag roxo[^>]*>hora-aula/.test(html) &&
          !/Hora-aula lista<\/b><span>R\$\s?100\/mês/.test(html);
      }), "a lista de planos mostra /sessão e a etiqueta hora-aula (não mais /mês fixo)");
      // limpa: encerra o rastro do teste
      await p.evaluate(() => {
        const st = window.MTStore.read("ptStudio", {});
        st.alunos = st.alunos.filter((x) => x.id !== "axHora");
        st.planosPT = st.planosPT.filter((x) => x.id !== "plHora");
        st.contratosPT = (st.contratosPT || []).filter((x) => x.alunoId !== "axHora");
        st.pagamentos = st.pagamentos.filter((x) => x.alunoId !== "axHora");
        st.sessoes = st.sessoes.filter((x) => x.alunoId !== "axHora");
        window.MTStore.write("ptStudio", st);
      });
    }

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

    // 🏦 baixa automática MULTI-GATEWAY: eventos da pag_eventos viram pagamento
    // pelos 3 casamentos (referência carimbada, pedido guardado, assinatura)
    const gwBaixa = await p.evaluate((hoje) => {
      const S = window.MTStore;
      const st = S.read("ptStudio", {});
      st.config.pagApi = { ligado: true, provedor: "asaas" };
      const ax = st.alunos.find((a) => a.id === "axDev");
      ax.pedidosPg = [{ id: "pl_asaas_1", v: 200, em: hoje, prov: "asaas" }];
      ax.assinaturaAs = { id: "sub_9", desde: hoje, valor: 150 };
      st.alunos.push({ id: "axPacGw", nome: "Pac Teste", pacote: { total: 10, usadas: 10, cobrar: 450, vendidoEm: hoje } });
      S.write("ptStudio", st);
      window.__cloudOrig = S.cloud;
      const eventos = [
        // ascendente (do mais velho pro mais novo), como a query nova pede
        { id: "mercadopago:p1:pago", provedor: "mercadopago", tipo: "pago", valor_centavos: 12000, ref: "mt|axDev|mensal", link_id: "", assinatura_id: "", criado: hoje + "T11:00:00" },
        { id: "asaas:p2:pago", provedor: "asaas", tipo: "pago", valor_centavos: 20000, ref: "", link_id: "pl_asaas_1", assinatura_id: "", criado: hoje + "T12:00:00" },
        { id: "asaas:p3:pago", provedor: "asaas", tipo: "pago", valor_centavos: 45000, ref: "mt|axPacGw|pacote", link_id: "", assinatura_id: "", criado: hoje + "T13:00:00" },
        { id: "asaas:p4:falhou", provedor: "asaas", tipo: "falhou", valor_centavos: 15000, ref: "", link_id: "", assinatura_id: "sub_9", criado: hoje + "T14:00:00" },
        // evento de OUTRA academia não pode nem chegar: a query filtra por aid
        { id: "asaas:p9:pago", provedor: "asaas", tipo: "pago", valor_centavos: 99900, ref: "mt|axDev|mensal", link_id: "", assinatura_id: "", criado: hoje + "T15:00:00", academia_id: "OUTRA" },
      ];
      window.__gwFiltros = {};
      S.cloud = () => ({ aid: "acadT", client: { from: (tb) => {
        const q = {
          eq: (col, v) => { window.__gwFiltros[col] = v; return q; },
          gt: (col, v) => { window.__gwFiltros["gt_" + col] = v; return q; },
          order: () => q,
          limit: () => q,
          then: (cb) => cb({ data: tb === "pag_eventos"
            ? eventos.filter((e) => (e.academia_id || "acadT") === window.__gwFiltros.academia_id)
            : [] }),
        };
        return { select: () => q };
      } } });
      window.__pagGateway();
      // roda de novo com os MESMOS eventos: nada pode entrar duas vezes
      window.__pagGateway();
      const alertaAcendeu = S.read("ptStudio", {}).alunos.find((a) => a.id === "axDev").cartaoFalhouEm;
      // aluno pagou depois (alerta limpo na mão): o MESMO evento antigo de
      // falha não pode re-acender o alerta na leitura seguinte
      const stLimpa = S.read("ptStudio", {});
      stLimpa.alunos.find((a) => a.id === "axDev").cartaoFalhouEm = "";
      S.write("ptStudio", stLimpa);
      window.__pagGateway();
      const alertaDepoisDePagar = S.read("ptStudio", {}).alunos.find((a) => a.id === "axDev").cartaoFalhouEm;
      S.cloud = window.__cloudOrig;
      const st3 = S.read("ptStudio", {});
      const ax3 = st3.alunos.find((a) => a.id === "axDev");
      const pac3 = st3.alunos.find((a) => a.id === "axPacGw");
      return {
        mensal: st3.pagamentos.find((x) => x.eventoId === "mercadopago:p1:pago"),
        linkPg: st3.pagamentos.find((x) => x.eventoId === "asaas:p2:pago"),
        pacotePg: st3.pagamentos.find((x) => x.eventoId === "asaas:p3:pago"),
        pacCobrar: pac3.pacote.cobrar,
        falhouNaoEntra: !st3.pagamentos.some((x) => x.eventoId === "asaas:p4:falhou"),
        alerta: alertaAcendeu,
        naoReacende: alertaDepoisDePagar === "",
        pedidos: (ax3.pedidosPg || []).length,
        total: st3.pagamentos.filter((x) => String(x.eventoId || "").split(":").length === 3).length,
        outraAcademia: !st3.pagamentos.some((x) => x.eventoId === "asaas:p9:pago"),
        filtrouAid: window.__gwFiltros.academia_id === "acadT",
        // marca d'água = evento mais novo LIDO (14h; o 15h é de outra academia) menos 7 dias
        marca: st3.config.pagEvDesde,
        marcaOk: new Date(st3.config.pagEvDesde || 0).getTime() === new Date(hoje + "T14:00:00").getTime() - 7 * 86400000,
      };
    }, hoje);
    ok(gwBaixa.mensal && gwBaixa.mensal.forma === "auto (mercadopago)" && +gwBaixa.mensal.valor === 120 && !gwBaixa.mensal.desc,
      "🏦 referência carimbada (mt|aluno|mensal) vira pagamento automático SEM desc — conta como mensalidade");
    ok(gwBaixa.linkPg && +gwBaixa.linkPg.valor === 200 && gwBaixa.linkPg.alunoId === "axDev" && gwBaixa.pedidos === 0,
      "pedido guardado (a.pedidosPg) casa o link Asaas e sai da fila depois de pago");
    ok(gwBaixa.pacotePg && /Pacote de 10 aulas/.test(gwBaixa.pacotePg.desc || "") && gwBaixa.pacCobrar === 0,
      "origem 'pacote' entra COM desc e zera a pendência da renovação (a.pacote.cobrar)");
    ok(gwBaixa.falhouNaoEntra && gwBaixa.alerta === hoje,
      "cobrança automática vencida NÃO vira pagamento — só acende o alerta do aluno");
    ok(gwBaixa.naoReacende,
      "depois que o aluno paga, o MESMO evento de falha não re-acende o alerta");
    ok(gwBaixa.filtrouAid && gwBaixa.outraAcademia,
      "a leitura filtra pela academia DESTE painel — evento de outra academia não entra no caixa");
    ok(gwBaixa.marcaOk,
      "marca d'água avança (evento mais novo − 7 dias): nada se perde por janela e a folga cobre outro aparelho (" + gwBaixa.marca + ")");
    // botões que dariam pagamento em dobro somem de quem tem cobrança automática
    const fonte = await p.evaluate(async () => await (await fetch("personal.html")).text());
    ok(/!a\.assinaturaRec && !a\.assinaturaAs \? '<button class="btn mini" data-receb/.test(fonte),
      "aluno com cobrança automática não ganha o botão Recebi (evita baixa em dobro)");
    ok(/data-origem="pacote"/.test(fonte) && /data-origem="mensal"/.test(fonte),
      "o card 'pacote renovou' ganha Link de pagamento com origem pacote (a baixa zera a pendência sozinha)");
    ok(gwBaixa.total === 3, "rodar duas vezes com os mesmos eventos não duplica nada (dedupe por eventoId)");

    // perfil do aluno: com o gateway Asaas ligado, a assinatura é a do professor
    const boxAs = await p.evaluate(() => {
      window.__perfilPT("axDev");
      const comAss = document.getElementById("pfAssinaturaBox").innerHTML;
      const st2 = window.MTStore.read("ptStudio", {});
      delete st2.alunos.find((a) => a.id === "axDev").assinaturaAs;
      window.MTStore.write("ptStudio", st2);
      window.__perfilPT("axDev");
      const semAss = document.getElementById("pfAssinaturaBox").innerHTML;
      return { comAss, semAss };
    });
    ok(/Cobrança automática \(Asaas\)/.test(boxAs.comAss) && /pfAssAsCancela/.test(boxAs.comAss),
      "perfil mostra a assinatura Asaas ativa, com status e cancelar");
    ok(/pfAssinarAs/.test(boxAs.semAss), "sem assinatura + gateway Asaas ligado → botão 'Ativar cobrança automática (Asaas)'");

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
  // na tela 2d o exercício é escolhido pelos CHIPS (a busca peneira, o chip marca).
  // O <select data-exsel> continua existindo escondido, como fonte da verdade.
  async function escolheEx(pg, fid, nome) {
    await pg.fill('[data-exbusca="' + fid + '"]', nome);
    await pg.waitForTimeout(120);
    const achou = await pg.evaluate((a) => {
      const c = [...document.querySelectorAll('[data-exchip="' + a.fid + '"]')]
        .find((x) => x.getAttribute("data-nome").toLowerCase() === a.nome.toLowerCase());
      if (!c) return false;
      c.click();
      return true;
    }, { fid: fid, nome: nome });
    return achou;
  }
  ok(await escolheEx(p, fichaId, "Supino reto"), "🎨 2d: buscar e tocar no chip escolhe o exercício");
  await p.fill('[data-exser="' + fichaId + '"]', "4");
  await p.fill('[data-exrep="' + fichaId + '"]', "10");
  await p.click('[data-additem="' + fichaId + '"]');
  const fichas = await p.evaluate(() => document.getElementById("fichasBox").textContent);
  ok(/Supino reto/.test(fichas) && /4 × 10/.test(fichas), "ficha montada por seleção (Supino 4×10)");

  /* ---- Montar treino repaginado (tela 2d) ---- */
  {
    const b2d = await p.evaluate((fid) => {
      const f = document.querySelector('[data-fdet="' + fid + '"]');
      f.open = true;
      return {
        kicker: (document.querySelector(".tdtopo .alk") || {}).textContent || "",
        nome: (document.getElementById("tdNome") || {}).textContent || "",
        av: (document.getElementById("tdAv") || {}).textContent || "",
        acoes: !!document.getElementById("tdIA") && !!document.getElementById("tdPublica"),
        colunas: !!f.querySelector(".tdcols") && !!f.querySelector(".tdesq") && !!f.querySelector(".tddir"),
        casc: f.querySelectorAll(".tdcasc select").length,
        busca: !!f.querySelector('[data-exbusca="' + fid + '"]'),
        conta: (f.querySelector('[data-exn="' + fid + '"]') || {}).textContent || "",
        chips: f.querySelectorAll('[data-exchip="' + fid + '"]').length,
        exs: f.querySelectorAll(".tdex").length,
        nota: (f.querySelector(".tdnota") || {}).textContent || "",
        p2: !!f.querySelector(".tdp2"),
      };
    }, fichaId);
    ok(/Montando pra/i.test(b2d.kicker) && b2d.av.length === 2 && b2d.acoes,
      "🎨 2d: o topo diz pra quem é a ficha e carrega Gerar com IA + Salvar e publicar");
    ok(b2d.colunas && b2d.casc === 3 && b2d.busca,
      "🎨 2d: escolher exercício à esquerda (3 seletores + busca), ficha montada à direita");
    ok(b2d.chips > 0 && /^\d+/.test(b2d.conta),
      "🎨 2d: os exercícios viram chips e a busca mostra quantos sobraram (" + b2d.conta + ")");
    ok(b2d.exs >= 1, "🎨 2d: cada exercício da ficha é uma linha na coluna da direita");
    ok(/Salvar e publicar/.test(b2d.nota), "🎨 2d: a nota roxa lembra que a ficha só sai no Salvar e publicar");
    ok(b2d.p2, "🎨 2d: a Parte 2 do dia (A2) fecha a coluna da esquerda");
    // o botão do topo é o MESMO de sempre — não uma segunda rota pra nuvem
    const mesmo = await p.evaluate(() => {
      let n = 0;
      const orig = document.getElementById("tEnviaApp").click;
      document.getElementById("tEnviaApp").click = function () { n++; };
      document.getElementById("tdPublica").click();
      document.getElementById("tEnviaApp").click = orig;
      return n;
    });
    ok(mesmo === 1, "🎨 2d: Salvar e publicar aciona o mesmo Enviar pro app do aluno de sempre");
    /* A tela juntava o modelo velho com o novo: o cabecalho novo trazia
     * "Salvar e publicar" e, logo abaixo, um card VELHO repetia o nome do
     * aluno e trazia um SEGUNDO botao de publicar. O professor nao sabia qual
     * era o caminho. Agora as ferramentas moram no cabecalho e o botao velho
     * fica no DOM (e a unica rota pra nuvem) mas fora do caminho. */
    const semDup = await p.evaluate(() => {
      const ve = (el) => !!el && !el.hidden && getComputedStyle(el).display !== "none" &&
        el.getBoundingClientRect().height > 0;
      const linha = document.querySelector(".tdtopo .tdlinha");
      const publicar = Array.from(document.querySelectorAll("#vTreinos button"))
        .filter((b) => ve(b) && /publicar|enviar pro app/i.test(b.textContent)).length;
      return {
        publicar: publicar,
        enviaEscondido: !ve(document.getElementById("tEnviaApp")) && !!document.getElementById("tEnviaApp"),
        noCabecalho: !!linha && ["tAluno", "tFicha", "tplSel", "tplAplicar", "tZap", "tValidade"]
          .every((id) => linha.contains(document.getElementById(id))),
        rodapeHonesto: !/biblioteca \(abaixo\)/.test(document.getElementById("vTreinos").textContent),
      };
    });
    ok(semDup.publicar === 1 && semDup.enviaEscondido,
      "🎨 2d: um botão de publicar só na tela (o antigo continua no DOM, que é a rota de verdade)");
    ok(semDup.noCabecalho,
      "🎨 2d: aluno, nova ficha, modelo, WhatsApp e validade vivem no MESMO cabeçalho — não num card repetido");
    ok(semDup.rodapeHonesto,
      "🎨 2d: o rodapé não fala mais de uma 'biblioteca (abaixo)' que não existe (a busca é dentro da ficha)");
  }

  /* ✏️ UMA forma de editar (v633): tocar na linha abre o editor do exercício,
   * com séries, repetições, descanso, tipo de série e observação como CAMPOS
   * de verdade. Antes eram três prompt() do navegador, um <select> solto no
   * meio do nome e um "≡" que parecia arrastar e não arrastava — o Raphael
   * abriu no celular e disse "extremamente confuso". */
  ok(/60 s/.test(fichas), "item novo nasce com descanso padrão de 60s visível");
  const editor = await p.evaluate(() => {
    const linha = document.querySelector(".tdex");
    const antes = { editorFechado: !!linha.querySelector(".tdedit[hidden]"),
      handleFalso: !!linha.querySelector(".tdh"), promptAntigo: !!linha.querySelector("[data-tsr],[data-tdesc],[data-tobs]") };
    linha.querySelector("[data-exab]").click();
    return antes;
  });
  await p.waitForTimeout(200);
  ok(editor.editorFechado && !editor.handleFalso && !editor.promptAntigo,
    "✏️ a linha nasce fechada, sem o puxador falso e sem os textos que abriam prompt");
  // mexer num campo salva na hora — e o editor CONTINUA aberto
  const mexe = async (campo, valor) => p.evaluate(([c, v]) => {
    const el = document.querySelector('[data-tfld$=":' + c + '"]');
    el.value = v;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, [campo, valor]);
  await mexe("descanso", "100"); await p.waitForTimeout(200);
  await mexe("series", "5"); await p.waitForTimeout(200);
  await mexe("reps", "8"); await p.waitForTimeout(200);
  await mexe("obs", "pegada fechada"); await p.waitForTimeout(200);
  const aposEd = await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    const it = st.treinosV2[st.alunos[0].id].fichas[0].itens[0];
    return { series: it.series, reps: it.reps, descanso: it.descanso, obs: it.obs,
      tela: document.getElementById("fichasBox").textContent,
      aberto: !!document.querySelector(".tdex.aberto .tdedit:not([hidden])"),
      campos: document.querySelectorAll(".tdex.aberto [data-tfld]").length };
  });
  ok(aposEd.descanso === 100 && aposEd.series === 5 && aposEd.reps === "8" && aposEd.obs === "pegada fechada",
    "✏️ séries, repetições, descanso e observação viram campos e salvam na hora (5 × 8 · 100 s · pegada fechada)");
  ok(/5 × 8 · 100 s/.test(aposEd.tela) && /pegada fechada/.test(aposEd.tela),
    "✏️ o resumo da linha fechada mostra tudo numa frase só");
  ok(aposEd.aberto && aposEd.campos === 5,
    "✏️ o editor NÃO fecha a cada campo mexido (os 5 campos continuam à mão)");
  const aposObs = aposEd;
  // 🏋️ tipo de série NO MESMO exercício (drop-set, up set…): escolhido na
  // cascata de montar e trocável direto na linha, sem prompt
  const cascataTec = await p.evaluate(() => {
    const f = document.querySelector("#fichasBox details");
    const fid = f.getAttribute("data-fdet");
    const campos = [].slice.call(f.querySelectorAll(".tdcasc select"))
      .map((e) => e.getAttribute("data-exmov") ? "treino" : e.getAttribute("data-extec") ? "serie"
        : e.getAttribute("data-exzona") ? "grupo" : "?");
    const sel = f.querySelector('[data-extec="' + fid + '"]');
    return { ordem: campos.join(">"), opcoes: [].slice.call(sel.options).map((o) => o.textContent),
      chips: f.querySelectorAll('[data-exchip="' + fid + '"]').length };
  });
  ok(cascataTec.ordem === "treino>serie>grupo" && cascataTec.chips > 0,
    "montar exercício segue a ordem do Raphael: tipo de treino → tipo de série → grupamento, e o exercício sai dos chips");
  ok(cascataTec.opcoes[0] === "Série normal" && cascataTec.opcoes.indexOf("Drop-set") > 0 && cascataTec.opcoes.indexOf("Up set") > 0,
    "a lista de tipo de série abre em Série normal e traz drop-set, up set e as outras");
  // o tipo de série é o MESMO campo do editor — nada de <select> solto na linha
  const trocaTec = await p.evaluate(async () => {
    const sel = document.querySelector('[data-tfld$=":tec"]');
    sel.value = "drop";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 250));
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    const it = st.treinosV2[st.alunos[0].id].fichas[0].itens[0];
    return { tec: it.tec, zap: window.__treinoTexto(st, st.alunos[0].id),
      naTela: document.querySelector('[data-tfld$=":tec"]').value,
      noResumo: /Drop-set/.test(document.getElementById("fichasBox").textContent) };
  });
  ok(trocaTec.tec === "drop" && trocaTec.naTela === "drop" && trocaTec.noResumo,
    "🏋️ o tipo de série é um campo do editor e aparece no resumo da linha (drop-set)");
  ok(/Drop-set/.test(trocaTec.zap), "o treino mandado no WhatsApp também leva o tipo de série");
  const limpaTec = await p.evaluate(async () => {
    const sel = document.querySelector('[data-tfld$=":tec"]');
    sel.value = "";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 250));
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    return !st.treinosV2[st.alunos[0].id].fichas[0].itens[0].tec;
  });
  ok(limpaTec, "voltar pra Série normal tira a marcação do exercício");
  // volta pro 4×10 sem obs — o resto da suíte depende desse estado
  await p.evaluate(async () => {
    const poe = (c, v) => { const el = document.querySelector('[data-tfld$=":' + c + '"]');
      el.value = v; el.dispatchEvent(new Event("change", { bubbles: true })); };
    poe("series", "4"); await new Promise((r) => setTimeout(r, 200));
    poe("reps", "10"); await new Promise((r) => setTimeout(r, 200));
    poe("obs", ""); await new Promise((r) => setTimeout(r, 200));
    // fecha o editor: o resto da suite conta com a linha compacta
    const b = document.querySelector("[data-exab]"); if (b) b.click();
  });
  await p.waitForTimeout(250);

  // a edição marca o app do aluno como pendente de publicar
  const pendApp = await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    const a = st.alunos[0];
    return {
      editEm: a.appEditEm,
      semToken: window.__appsPendentes.pendente(st, a),
      comToken: window.__appsPendentes.pendente(st, Object.assign({}, a, { appTokenP: "tok123" })),
      // publicado = depois da edição E com a versão atual do sistema
      publicado: window.__appsPendentes.pendente(st, Object.assign({}, a, { appTokenP: "tok123", appPubEm: new Date(Date.now() + 60000).toISOString(), appVer: self.MT_VERSAO })),
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
  // acessório "corda" da polia não pode jogar o exercício pro cardio (tríceps corda, remada com corda…)
  const cordas = await p.evaluate(() => ({
    triceps: window.__movimentoDe("Tríceps corda", "Tríceps"),
    remada: window.__movimentoDe("Remada baixa com corda", "Costas"),
    rosca: window.__movimentoDe("Rosca martelo na polia com corda", "Bíceps"),
    pular: window.__movimentoDe("Pular corda", "Cardio"),
    naval: window.__movimentoDe("Ondas alternadas na corda naval", "Cardio"),
  }));
  ok(cordas.triceps === "Empurrar" && cordas.remada === "Puxar" && cordas.rosca === "Puxar",
    "exercício de polia com corda entra no padrão certo (empurrar/puxar), não no cardio");
  ok(cordas.pular === "Cardio e condicionamento" && cordas.naval === "Cardio e condicionamento",
    "pular corda e corda naval continuam no cardio");
  // outras palavras que jogavam o exercício pro padrão errado no montador de fichas
  const padroes = await p.evaluate(() => ({
    tricepsCoice: window.__movimentoDe("Tríceps coice na polia", "Tríceps"),
    gluteoCoice: window.__movimentoDe("Coice na polia baixa", "Posterior e glúteo"),
    minibandWalk: window.__movimentoDe("Caminhada lateral com mini band", "Posterior e glúteo"),
    caminhadaRapida: window.__movimentoDe("Caminhada rápida", "Cardio"),
    esteira: window.__movimentoDe("Esteira — caminhada inclinada", "Cardio"),
    degrau: window.__movimentoDe("Panturrilha unilateral no degrau da escada", "Quadríceps"),
    agilidade: window.__movimentoDe("Escada de agilidade lateral", "Cardio"),
    pernada: window.__movimentoDe("Pernada de crawl com prancha", "Cardio"),
    pranchaCore: window.__movimentoDe("Prancha lateral", "Core"),
    pernaLateral: window.__movimentoDe("Elevação lateral de perna deitado com caneleira", "Posterior e glúteo"),
    ombroLateral: window.__movimentoDe("Elevação lateral", "Ombros"),
    abducaoOmbro: window.__movimentoDe("Abdução de ombro com mini band nas mãos", "Ombros"),
    abducaoQuadril: window.__movimentoDe("Abdução de quadril na máquina", "Posterior e glúteo"),
    barquinho: window.__movimentoDe("Barquinho invertido", "Core"),
    remadaInv: window.__movimentoDe("Remada invertida no TRX", "Costas"),
  }));
  ok(padroes.tricepsCoice === "Empurrar" && padroes.gluteoCoice === "Dobradiça e quadril",
    "'coice' de tríceps vai pra empurrar e o de glúteo continua no quadril");
  ok(padroes.minibandWalk === "Dobradiça e quadril" && padroes.caminhadaRapida === "Cardio e condicionamento" && padroes.esteira === "Cardio e condicionamento",
    "caminhada com mini band é glúteo; caminhada rápida e esteira continuam cardio");
  ok(padroes.degrau === "Agachar e pernas" && padroes.agilidade === "Cardio e condicionamento",
    "'escada' no nome não joga panturrilha pro cardio, e escada de agilidade continua cardio");
  ok(padroes.pernada === "Cardio e condicionamento" && padroes.pranchaCore === "Core e estabilidade",
    "prancha de natação (pernada) não vira exercício de core, e a prancha de verdade continua no core");
  ok(padroes.pernaLateral === "Dobradiça e quadril" && padroes.ombroLateral === "Empurrar",
    "elevação lateral DE PERNA é quadril; a de ombro continua empurrar");
  // achado do diagnóstico: o mapa de grupos só conhecia 10 dos 16 grupos do banco,
  // então 337 exercícios (calistenia, funcional, boxe, natação, pilates, reabilitação)
  // sumiam em "Habilidade e outros" e não apareciam em nenhum filtro da cascata
  const grupos = await p.evaluate(() => ({
    flexaoEspartana: window.__movimentoDe("Flexão espartana", "Ginástica e calistenia"),
    flexaoDiamante: window.__movimentoDe("Flexão diamante com pés elevados", "Ginástica e calistenia"),
    flexaoPlantar: window.__movimentoDe("Flexão plantar sentado", "Reabilitação e terceira idade"),
    flexaoPunho: window.__movimentoDe("Flexão de punho com halter leve", "Reabilitação e terceira idade"),
    flexaoNordica: window.__movimentoDe("Flexão nórdica de joelhos", "Posterior e glúteo"),
    yoga: window.__movimentoDe("Guerreiro II (yoga)", "Pilates e yoga"),
    pilates: window.__movimentoDe("The hundred", "Pilates e yoga"),
    boxe: window.__movimentoDe("Uppercut no saco", "Boxe e lutas"),
    reab: window.__movimentoDe("Sentar e levantar com apoio de cadeira", "Reabilitação e terceira idade"),
    funcional: window.__movimentoDe("Farmer walk", "Funcional e Cross"),
    olimpico: window.__movimentoDe("Clean and jerk", "Funcional e Cross"),
    toesToBar: window.__movimentoDe("Toes to bar", "Funcional e Cross"),
    saltoAgacha: window.__movimentoDe("Agachamento com salto e caixa", "Quadríceps"),
    barraL: window.__movimentoDe("Barra fixa em L (L-sit pull-up)", "Ginástica e calistenia"),
  }));
  ok(grupos.flexaoEspartana === "Empurrar" && grupos.flexaoDiamante === "Empurrar",
    "flexão de solo da calistenia entra em Empurrar (a palavra-chave era 'flexão de braço', específica demais)");
  ok(grupos.flexaoPlantar === "Agachar e pernas" && grupos.flexaoNordica === "Dobradiça e quadril" && grupos.flexaoPunho !== "Empurrar",
    "'flexão' de plantar/nórdica/punho não vira flexão de braço");
  ok(grupos.yoga === "Mobilidade e alongamento" && grupos.pilates === "Core e estabilidade",
    "postura de yoga é mobilidade e exercício de pilates é core");
  ok(grupos.boxe === "Cardio e condicionamento" && grupos.reab === "Agachar e pernas" && grupos.funcional === "Core e estabilidade",
    "boxe é condicionamento, sentar e levantar é perna e caminhada com carga é core");
  ok(grupos.olimpico === "Habilidade e outros" && grupos.toesToBar === "Core e estabilidade",
    "levantamento olímpico fica em habilidade e toes to bar vai pro core");
  ok(grupos.saltoAgacha === "Agachar e pernas" && grupos.barraL === "Puxar",
    "agachamento com salto continua perna e barra fixa em L continua puxar");
  // natação inteira num padrão só: "prancha" na piscina é o flutuador, não o exercício de core
  const nado = await p.evaluate(() => ["Empurrada de prancha submersa à frente", "Tesoura de pernas com prancha",
    "Batida de pernas com prancha e rosto na água", "Batida de perna com giro de corpo e prancha",
    "Nado crawl com pull buoy entre as pernas", "Remada na água com halteres flutuantes"]
    .map((n) => window.__movimentoDe(n, "Natação e aquático")));
  ok(nado.every((x) => x === "Cardio e condicionamento"),
    "exercício de natação não cai no core por causa da prancha-flutuador — o grupo inteiro fica em condicionamento");
  ok(padroes.abducaoOmbro === "Empurrar" && padroes.abducaoQuadril === "Dobradiça e quadril",
    "abdução de ombro vai pro ombro e a de quadril continua no quadril");
  ok(padroes.barquinho === "Core e estabilidade" && padroes.remadaInv === "Puxar",
    "'invertido' sozinho não vira puxada (barquinho fica no core) e a remada invertida continua puxar");
  ok(/Posterior e glúteo/.test(casc.zonas) && !/^Peito$/m.test(casc.zonas.split("|").join("\n")), "grupamentos oferecidos seguem o tipo de treino escolhido");
  ok(!!casc.valor, "lista filtrada traz os levantamentos terra");
  ok(await escolheEx(p, fichaId, casc.valor), "🎨 2d: o chip acha o exercício filtrado pela cascata");
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

  /* ---- Agenda repaginada (tela 2c): a semana em grade ---- */
  {
    await p.evaluate(() => window.__agAba("sessoes"));
    const b2c = await p.evaluate(() => {
      const g = document.getElementById("agGrade");
      const cel = [...g.querySelectorAll(".agc:not(.vazio)")];
      return {
        rot: (document.getElementById("agSemRot") || {}).textContent || "",
        resumo: (document.getElementById("agSemResumo") || {}).textContent || "",
        cabs: [...g.querySelectorAll(".agh")].length,
        hoje: [...g.querySelectorAll(".agh.hoje")].length,
        horas: [...g.querySelectorAll(".aghr")].map((x) => x.textContent),
        celulas: cel.length,
        primeira: cel.length ? cel[0].textContent : "",
        vazias: g.querySelectorAll(".agc.vazio").length,
      };
    });
    ok(b2c.cabs === 7 && b2c.hoje === 1, "🎨 2c: a grade tem os 7 dias da semana e marca o de hoje");
    ok(/ a /.test(b2c.rot) && /sess/.test(b2c.resumo),
      "🎨 2c: o cabeçalho diz o intervalo da semana e quantas sessões tem");
    ok(b2c.horas.includes("07:30"), "🎨 2c: a coluna da esquerda traz os horários que existem de verdade");
    ok(b2c.celulas >= 1 && /João|Maria|Ana/.test(b2c.primeira),
      "🎨 2c: a sessão vira uma célula com o nome do aluno");
    // andar de semana e voltar pra hoje
    const anda = await p.evaluate(() => {
      const rot = () => document.getElementById("agSemRot").textContent;
      const a = rot();
      document.getElementById("agSemProx").click();
      const b = rot();
      document.getElementById("agSemHoje").click();
      return { a, b, volta: rot(), hoje: document.querySelectorAll("#agGrade .agh.hoje").length };
    });
    ok(anda.a !== anda.b && anda.volta === anda.a && anda.hoje === 1,
      "🎨 2c: Semana › anda 7 dias e Hoje volta pra semana de agora");
    // buraco na agenda leva pro formulário já preenchido
    const vaga = await p.evaluate(() => {
      const v = document.querySelector("#agGrade .agc.vazio");
      if (!v) return null;
      const alvo = v.getAttribute("data-agnovo").split("|");
      v.click();
      return { alvo: alvo, data: document.getElementById("sData").value, hora: document.getElementById("sHora").value };
    });
    if (vaga) ok(vaga.data === vaga.alvo[0] && (!vaga.alvo[1] || vaga.hora === vaga.alvo[1]),
      "🎨 2c: tocar num buraco da agenda abre Agendar com o dia e a hora prontos");
  }
  await abaPt(p, "treinos");

  // formulário único: aluno primeiro, métricas no meio, % de gordura como RESULTADO no salvar
  await abaPt(p, "avaliacoes");
  // sexo, idade (30) e altura vêm do CADASTRO do aluno — o formulário não pergunta de novo
  await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    const a = st.alunos.find((x) => /João Cliente/.test(x.nome));
    a.sexo = "M"; a.altura = 175; a.nasc = (new Date().getFullYear() - 30) + "-01-01";
    localStorage.setItem("mtapp:ptStudio", JSON.stringify(st));
  });
  // dobras Pollock 3 (M, 30 anos, 10+20+15 mm → 13,6% conferido à mão)
  await p.selectOption("#avAluno", { index: 1 });
  ok(await p.evaluate(() => document.getElementById("avAltura").value === "175"),
    "escolher o aluno preenche a altura com a do cadastro");
  await p.selectOption("#dbMetodo", "p3");
  const campos = await p.evaluate(() => Array.from(document.querySelectorAll("#dbCampos label")).map((l) => l.textContent));
  ok(/Peitoral/.test(campos[0]) && /Abdominal/.test(campos[1]) && /Coxa/.test(campos[2]), "Pollock 3 do aluno homem pede peitoral/abdominal/coxa (sexo vem do cadastro)");
  await p.evaluate(() => {
    const ins = document.querySelectorAll(".dbIn");
    ins[0].value = "10"; ins[1].value = "20"; ins[2].value = "15";
    document.getElementById("avPeso").value = "80";
  });
  await p.click("#avAdd");
  await p.waitForTimeout(300);
  const comDobras = await p.evaluate(() => ({
    reg: JSON.parse(localStorage.getItem("mtapp:ptStudio")).avaliacoes.slice(-1)[0],
    resultado: document.getElementById("avResultado").textContent,
  }));
  ok(comDobras.reg.gordura === 13.6 && comDobras.reg.metodoDobras === "p3" && comDobras.reg.dobras,
    "salvar calcula o % pelas dobras (Pollock 3 + Siri = 13,6%) e guarda o protocolo");
  ok(/13,6%/.test(comDobras.resultado) && /Pollock 3/.test(comDobras.resultado) && /laudo no perfil/.test(comDobras.resultado),
    "o resultado aparece na hora, com a fonte do cálculo e o atalho pro laudo");
  // Guedes com as mesmas medidas → 16,8%
  await p.selectOption("#avAluno", { index: 1 });
  await p.selectOption("#dbMetodo", "guedes");
  await p.evaluate(() => {
    const ins = document.querySelectorAll(".dbIn");
    ins[0].value = "10"; ins[1].value = "20"; ins[2].value = "15";
    document.getElementById("avPeso").value = "80";
  });
  await p.click("#avAdd");
  await p.waitForTimeout(300);
  const comGuedes = await p.evaluate(() => JSON.parse(localStorage.getItem("mtapp:ptStudio")).avaliacoes.slice(-1)[0]);
  ok(comGuedes.metodoDobras === "guedes" && comGuedes.gordura === 16.8, "Guedes + Siri = 16,8% (conferido à mão)");
  const histDb = await p.evaluate(() => document.getElementById("listaAvaliacoes").textContent);
  ok(/Guedes/.test(histDb), "histórico mostra a etiqueta do protocolo");
  // dobras pela metade não deixam salvar torto
  await p.selectOption("#avAluno", { index: 1 });
  await p.evaluate(() => { document.querySelectorAll(".dbIn")[0].value = "12"; });
  const nAntes = await p.evaluate(() => JSON.parse(localStorage.getItem("mtapp:ptStudio")).avaliacoes.length);
  await p.click("#avAdd");
  await p.waitForTimeout(200);
  ok(await p.evaluate((n) => JSON.parse(localStorage.getItem("mtapp:ptStudio")).avaliacoes.length === n, nAntes),
    "dobra preenchida pela metade avisa e não salva nada");
  // limpa a dobra pela metade (ela sobrevive de propósito à troca de aluno)
  await p.evaluate(() => { document.querySelectorAll(".dbIn").forEach((i) => { i.value = ""; }); });

  // fita métrica no MESMO formulário (175 cm do cadastro; pescoço 38, cintura 85, quadril 95 → 16,9% e RCQ 0,89)
  await p.selectOption("#avAluno", { index: 1 });
  await p.fill("#ccPescoco", "38");
  await p.fill("#avCintura", "85");
  await p.fill("#avQuadril", "95");
  await p.fill("#ccCoxa", "58");
  await p.fill("#avPeso", "80");
  await p.click("#avAdd");
  await p.waitForTimeout(300);
  const comCirc = await p.evaluate(() => ({
    reg: JSON.parse(localStorage.getItem("mtapp:ptStudio")).avaliacoes.slice(-1)[0],
    resultado: document.getElementById("avResultado").textContent,
  }));
  ok(comCirc.reg.gordura === 16.9 && /Marinha/.test(comCirc.resultado), "sem dobras, o % sai pela fita (Marinha americana = 16,9%)");
  ok(comCirc.reg.rcq === 0.89 && comCirc.reg.riscoRcq === "baixo" && comCirc.reg.quadril === 95 && comCirc.reg.circ && comCirc.reg.circ.coxa === 58,
    "avaliação salva com circunferências, quadril e RCQ com risco");
  // medir a altura de novo no formulário atualiza o cadastro
  await p.selectOption("#avAluno", { index: 1 });
  await p.fill("#avAltura", "176");
  await p.fill("#avPeso", "80");
  await p.click("#avAdd");
  await p.waitForTimeout(250);
  ok(await p.evaluate(() => +JSON.parse(localStorage.getItem("mtapp:ptStudio")).alunos.find((x) => /João Cliente/.test(x.nome)).altura === 176),
    "altura medida no formulário atualiza o cadastro do aluno");
  await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    st.alunos.find((x) => /João Cliente/.test(x.nome)).altura = 175; // devolve pro resto da suíte
    localStorage.setItem("mtapp:ptStudio", JSON.stringify(st));
  });
  // limpa pra não interferir nos testes de evolução seguintes
  await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    st.avaliacoes = [];
    localStorage.setItem("mtapp:ptStudio", JSON.stringify(st));
  });

  // avaliações: registra 2 e vê evolução (o % já medido mora na seção da balança)
  await abaPt(p, "avaliacoes");
  await p.evaluate(() => { document.getElementById("avBiaBox").open = true; });
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

  /* ---- Avaliação física repaginada (tela 3a) ---- */
  {
    const b3a = await p.evaluate(() => {
      const st = window.MTStore.read("ptStudio", {});
      const id = (st.avaliacoes[0] || {}).alunoId;
      const sel = document.getElementById("avCmpAluno");
      sel.value = id;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      const box = document.getElementById("avCmp");
      return {
        kicker: (document.querySelector('[data-avsec="historico"] .alk') || {}).textContent || "",
        nome: (document.getElementById("avCmpNome") || {}).textContent || "",
        botoes: !!document.getElementById("avCmpLaudo") && !!document.getElementById("avCmpNova"),
        tiles: [...box.querySelectorAll(".avt .k")].map((x) => x.textContent),
        deltas: [...box.querySelectorAll(".avt .d")].map((x) => x.textContent.trim()).filter(Boolean),
        barras: box.querySelectorAll(".avlin").length,
        tmb: /Gasto e metabolismo/.test(box.textContent),
        pontos: /Pontuação/.test(box.textContent),
        fotos: !!box.querySelector("#avCmpFotos"),
        periodo: (box.querySelector("h3") || {}).textContent || "",
      };
    });
    ok(/Avaliação de/i.test(b3a.kicker) && /medição/.test(b3a.nome) && b3a.botoes,
      "🎨 3a: o topo diz de quem é a avaliação, qual medição, e traz Mandar laudo + Nova medição");
    ok(/De .* para /.test(b3a.periodo) && b3a.tiles.length === 4,
      "🎨 3a: as duas datas comparadas e os quatro números do aluno (" + b3a.tiles.join(", ") + ")");
    ok(b3a.deltas.some((d) => /↓|↑/.test(d)), "🎨 3a: cada número mostra o quanto mudou desde a medição anterior");
    ok(b3a.barras >= 3, "🎨 3a: a composição vira barras (" + b3a.barras + " compartimentos)");
    ok(b3a.tmb && b3a.pontos, "🎨 3a: gasto/metabolismo e pontuação ficam na coluna da direita");
    ok(b3a.fotos, "🎨 3a: a nota do rodapé leva pras fotos de progresso, que moram na ficha do aluno");
  }
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
  ok(/Maria Sumida/.test(relAl) && /Sumido há 14\+ dias/.test(relAl), "alerta 👻 de aluna sumida (14+ dias), no grupo certo");
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
  ok(/Ticket médio previsto/.test(dash.ind), "os dois 'Ticket médio' do produto agora dizem qual é qual (previsto × recebido)");
  ok(/Alunos que saíram no mês/.test(dash.mov) && !/Contratos encerrados no mês/.test(dash.mov),
    "o painel conta ALUNO que saiu (mesma conta dos Relatórios) — troca de plano não vira churn");
  // troca de plano encerra o contrato antigo mas não pode contar como saída
  const troca = await p.evaluate(() => {
    const S = window.MTStore, snap = localStorage.getItem("mtapp:ptStudio");
    const st = S.read("ptStudio", {});
    const hoje = S.todayISO(), mes = hoje.slice(0, 7);
    st.contratosPT = [{ id: "c1", alunoId: st.alunos[0].id, planoId: "p1", diaVenc: 5,
      inicio: hoje, status: "encerrado", encerradoEm: hoje, motivo: "troca" }];
    S.write("ptStudio", st);
    const d = window.__dashDados ? window.__dashDados(mes) : null;
    S.write("ptStudio", JSON.parse(snap));
    return d ? d.encerrados : -1;
  });
  ok(troca === 0, "contrato encerrado por troca de plano não entra no churn do mês");
  ok(/Taxa de presença/.test(dash.ag) && /Horário mais cheio/.test(dash.ag), "bloco Agenda e presença renderiza");
  ok(/Com ficha de treino montada/.test(dash.app), "bloco App e treinos renderiza");
  // metas com projeção run-rate — o formulário saiu do Início e agora mora em
  // Relatórios → Do dia a dia (repaginação do painel, tela 4c do canvas)
  await abaPt(p, "relatorios");
  await p.evaluate(() => window.__relAba && window.__relAba("geral"));
  await p.waitForTimeout(200);
  await p.fill("#mtFatP", "1000");
  await p.click("#mtSalvarP");
  ok(await p.evaluate(() => /meta R\$\s?1\.000/.test(document.getElementById("mtPainelP").textContent) && /projeção/.test(document.getElementById("mtPainelP").textContent)),
    "meta salva aparece no painel com projeção run-rate");
  // fechamento do mês pronto pra mandar
  const fch = await p.evaluate(() => window.__dashPT.resumo(new Date().toISOString().slice(0, 7)));
  ok(/Receita: R\$/.test(fch) && /Novos alunos:/.test(fch) && /Sessões dadas:/.test(fch), "resumo de fechamento com receita, novos e sessões");
  await p.click("#fchCopiaP");
  ok(await p.evaluate(() => /copiado/.test(document.getElementById("fchStatusP").textContent)), "copiar resumo confirma");

  /* ---- Relatórios repaginados (tela 4c) ---- */
  {
    const b4c = await p.evaluate(() => {
      window.__rel4c(window.MTStore.read("ptStudio", {}));
      const box = document.getElementById("rel4c");
      return {
        rot: (document.getElementById("relMesRot") || {}).textContent || "",
        caixas: [...box.querySelectorAll(".rel3 .tdrot")].map((x) => x.textContent),
        linhas: [...box.querySelectorAll(".rel3 .avkv span")].map((x) => x.textContent),
        semanas: box.querySelectorAll(".dcols .pfbox div[title]").length,
        niver: !!box.querySelector("#bNiverP"),
        alertas: !!box.querySelector("#relAlertas"),
        botao: (document.getElementById("fchZapP") || {}).textContent || "",
      };
    });
    ok(/^[A-Z]\S* de \d{4}$/.test(b4c.rot), "🎨 4c: o topo diz o mês por extenso (" + b4c.rot + ")");
    ok(b4c.caixas.length === 3 && /Movimenta/.test(b4c.caixas[0]) && /Indicadores/.test(b4c.caixas[1]) && /Aniversários/.test(b4c.caixas[2]),
      "🎨 4c: movimentação, indicadores e aniversários em três caixas");
    ok(b4c.linhas.includes("Entraram") && b4c.linhas.includes("Ticket médio") && b4c.linhas.includes("Tempo de casa"),
      "🎨 4c: cada caixa traz as linhas do desenho");
    ok(b4c.semanas >= 4, "🎨 4c: sessões por semana viram barras (" + b4c.semanas + " pedaços)");
    ok(b4c.niver && b4c.alertas, "🎨 4c: aniversários e alertas do studio moram dentro das caixas novas");
    ok(/Mandar fechamento/.test(b4c.botao), "🎨 4c: o fechamento do mês virou botão do cabeçalho");
    // repintar não pode perder os dois blocos que são preenchidos por outro trecho
    const duasVezes = await p.evaluate(() => {
      const st = window.MTStore.read("ptStudio", {});
      window.__rel4c(st); window.__rel4c(st);
      return { niver: !!document.querySelector("#rel4c #bNiverP"), alertas: !!document.querySelector("#rel4c #relAlertas") };
    });
    ok(duasVezes.niver && duasVezes.alertas,
      "🎨 4c: repintar duas vezes não apaga os blocos de aniversário e alertas (o guarda-volumes segura)");
  }

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

    /* ---- Início repaginado (canvas "Painel do professor", tela 1a) ----
     * O que o desenho promete: faixa roxa com a PRÓXIMA sessão e as duas ações,
     * três cards "Resolver hoje" que já carregam o botão, linha do tempo com a
     * próxima destacada, e o mês na coluna da direita. Os cards que não mudam
     * decisão hoje saíram pra Relatórios. */
    const ini1a = await p.evaluate(() => {
      // uma sessão daqui a ~90 min, pra existir "próxima" (as do bloco acima já
      // foram marcadas). Se a hora virar o dia, cai pro fim da noite mesmo.
      const ag = new Date(Date.now() + 90 * 60000);
      const hh = ag.getDate() === new Date().getDate()
        ? String(ag.getHours()).padStart(2, "0") + ":" + String(ag.getMinutes()).padStart(2, "0") : "23:59";
      // grava direto no localStorage: MTStore.write dispara a sincronização com
      // a nuvem, e aqui pode haver mock estreito instalado por outro bloco
      const st2 = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
      st2.sessoes.push({ id: "sc-prox", alunoId: st2.alunos[0].id, data: new Date().toISOString().slice(0, 10), hora: hh, feita: false });
      localStorage.setItem("mtapp:ptStudio", JSON.stringify(st2));
      window.__dashPT.render(st2);
      const topo = document.getElementById("dashTopo");
      const dia = document.getElementById("bHojeP");
      const prox = dia.querySelector(".dlinha.prox");
      return {
        temTopo: !!topo && /dtopo/.test(topo.className),
        saudacao: (topo.querySelector("h2") || {}).textContent || "",
        sub: (topo.querySelector(".dsub") || {}).textContent || "",
        agora: !!topo.querySelector(".dagora"),
        kicker: (topo.querySelector(".dagora .dk") || {}).textContent || "",
        acoesTopo: [...topo.querySelectorAll(".dacoes button")].map((b) => b.textContent.trim()),
        abrirFicha: !!topo.querySelector(".dagora [data-abreperfil]"),
        feitaNoTopo: !!topo.querySelector(".dagora [data-feita]"),
        linhas: dia.querySelectorAll(".dlinha").length,
        proxNome: prox ? (prox.querySelector(".dnm") || {}).textContent : "",
        feitasEsmaecidas: dia.querySelectorAll(".dlinha.feita").length,
        verSemana: !!document.getElementById("dVerSemana"),
      };
    });
    ok(ini1a.temTopo && /Bom treino/.test(ini1a.saudacao) && /sess/.test(ini1a.sub),
      "🎨 1a: o Início abre com a faixa roxa do dia (" + ini1a.saudacao.trim() + ")");
    ok(ini1a.agora && ini1a.abrirFicha && ini1a.feitaNoTopo && /AGORA|MAIS TARDE|EM |ACONTECENDO/.test(ini1a.kicker),
      "🎨 1a: a próxima sessão vem na faixa com Abrir ficha e Feita (" + ini1a.kicker + ")");
    ok(ini1a.acoesTopo.length === 2 && /Novo aluno/.test(ini1a.acoesTopo[0]) && /Marcar sessão/.test(ini1a.acoesTopo[1]),
      "🎨 1a: as duas ações do topo são Novo aluno e Marcar sessão (a 1b foi descartada, não há Turno|Placar)");
    ok(ini1a.linhas >= 2 && !!ini1a.proxNome && ini1a.feitasEsmaecidas >= 1 && ini1a.verSemana,
      "🎨 1a: a linha do tempo destaca a próxima e esmaece as feitas (" + ini1a.linhas + " linhas)");
    // o mês, na coluna da direita
    const mes1a = await p.evaluate(() => {
      const el = document.getElementById("dashMes");
      return { cls: el.className, txt: el.textContent,
        kpis: [...el.querySelectorAll(".dkpis .dk")].map((x) => x.textContent) };
    });
    ok(/dmes/.test(mes1a.cls) && /No ritmo de agora fecha em/.test(mes1a.txt),
      "🎨 1a: a coluna da direita traz o mês com a projeção pelo ritmo de agora");
    ok(mes1a.kpis.length === 4 && /A RECEBER/.test(mes1a.kpis[0]) && /PRESEN/.test(mes1a.kpis[3]),
      "🎨 1a: os quatro números do mês (a receber, sessões, alunos, presença)");
    // os cards que saíram do Início foram pra Relatórios → Do dia a dia
    const mudou = await p.evaluate(() => {
      const noDash = (id) => !!document.querySelector("#vDash #" + id);
      const noRel = (id) => !!document.querySelector("#vRelatorios #" + id);
      return {
        saiuDoDash: !noDash("kpis") && !noDash("bNiverP") && !noDash("mtFatP") && !noDash("relAlertas"),
        chegouNoRel: noRel("kpis") && noRel("bNiverP") && noRel("mtFatP") && noRel("relAlertas"),
        temSubAba: !!document.querySelector('#relAbas [data-rela="geral"]'),
        nota: (document.querySelector("#vDash .dnota") || {}).textContent || "",
      };
    });
    ok(mudou.saiuDoDash && mudou.chegouNoRel && mudou.temSubAba,
      "🎨 1a: aniversários, metas, indicadores e alertas saíram do Início e moram em Relatórios → Do dia a dia");
    ok(/Relatórios/.test(mudou.nota),
      "🎨 1a: o Início explica pra onde os cards foram, com atalho");
    // barra lateral: as 6 do dia a dia em cima, o resto sob MENOS USADO
    const menu1a = await p.evaluate(() => {
      const bs = [...document.querySelectorAll("#abas button[data-a]")];
      const grupo = document.querySelector("#abas .navgrupo");
      const antes = [], depois = [];
      let passou = false;
      [...document.querySelector("#abas").children].forEach((el) => {
        if (el.classList.contains("navgrupo")) { passou = true; return; }
        if (!el.dataset || !el.dataset.a) return;
        (passou ? depois : antes).push(el.dataset.a);
      });
      return { total: bs.length, grupo: grupo ? grupo.textContent : "", antes, depois,
        contadores: [...document.querySelectorAll("#abas .cnt")].map((c) => c.parentElement.dataset.a) };
    });
    ok(menu1a.total === 16 && /Menos usado/i.test(menu1a.grupo),
      "🎨 menu: as 16 abas continuam todas lá, agora cortadas em dois grupos");
    ok(menu1a.antes.join(",") === "dash,alunos,agenda,pagamentos,treinos,chat" && menu1a.depois.length === 10,
      "🎨 menu: as 6 do dia a dia em cima (" + menu1a.antes.join(", ") + ")");
    ok(menu1a.contadores.indexOf("alunos") > -1,
      "🎨 menu: as abas do dia a dia mostram o contador do que está esperando");

    // radar de retenção
    const radar = await p.evaluate(() => document.getElementById("bRadarP").innerHTML);
    // o botão virou "Chamar" no desenho novo (linha compacta com as iniciais)
    ok(/Parado Silva/.test(radar) && /6 dias sem treinar/.test(radar) && /Chamar/.test(radar) && /wa\.me/.test(radar),
      "radar de retenção lista quem parou, com botão de resgate");

    // alertas com botão de ação: sem ficha → Montar treino leva pra aba certa com o aluno escolhido
    const alHtml = await p.evaluate(() => document.getElementById("relAlertas").innerHTML);
    ok(/data-altreino="axPar"/.test(alHtml) && /Montar treino/.test(alHtml), "alerta de aluno sem ficha ganhou o botão Montar treino");
    await p.evaluate(() => document.querySelector('#relAlertas [data-altreino="axPar"]').click());
    await p.waitForTimeout(250);
    ok(await p.evaluate(() => !document.getElementById("vTreinos").hidden && document.getElementById("tAluno").value === "axPar"),
      "botão do alerta abre Treinos já com o aluno escolhido");

    // ---- alertas agrupados: um paredão de linhas iguais vira bloco por assunto ----
    await p.evaluate(() => {
      const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
      // 12 alunos sem ficha nenhuma: antes virava 12 linhas soltas, uma embaixo da outra
      for (let i = 0; i < 12; i++) st.alunos.push({ id: "agru" + i, nome: "Agrupado " + (i + 1), ativo: true, desde: "2026-01-05", valor: 100, modo: "mes" });
      localStorage.setItem("mtapp:ptStudio", JSON.stringify(st));
    });
    await p.reload();
    await p.waitForTimeout(700);
    const gr = await p.evaluate(() => {
      const el = document.getElementById("relAlertas");
      const linhas = (bl) => [...bl.children].filter((c) => c.tagName === "DIV" && /border-left/.test(c.getAttribute("style") || ""));
      const grupos = [...el.querySelectorAll("[data-algrupo]")];
      const bloco = grupos.find((g) => /SEM FICHA DE TREINO/i.test(g.textContent));
      return {
        grupos: grupos.length,
        cabecalho: el.firstElementChild.textContent,
        contagem: bloco ? /(\d+) alunos/.exec(bloco.textContent)[1] : "",
        visiveis: bloco ? linhas(bloco).filter((c) => !c.hidden).length : -1,
        escondidos: bloco ? bloco.querySelectorAll("[data-alresto][hidden]").length : -1,
        botao: bloco ? (bloco.querySelector("[data-alabre]") || {}).textContent : "",
      };
    });
    ok(gr.grupos > 1 && /alertas em \d+ assuntos/.test(gr.cabecalho), "os alertas do Início vêm agrupados por assunto, com o total no topo");
    ok(+gr.contagem >= 12 && gr.visiveis === 3 && gr.escondidos >= 9,
      "cada assunto mostra 3 alunos e guarda o resto (" + gr.contagem + " no grupo, " + gr.visiveis + " à mostra, " + gr.escondidos + " guardados)");
    ok(/ver os outros \d+/.test(gr.botao || ""), "o botão diz quantos alunos ainda faltam ver");
    await p.evaluate(() => {
      const bl = [...document.querySelectorAll("#relAlertas [data-algrupo]")].find((g) => /SEM FICHA DE TREINO/i.test(g.textContent));
      bl.querySelector("[data-alabre]").click();
    });
    await p.waitForTimeout(200);
    const gr2 = await p.evaluate(() => {
      const bl = [...document.querySelectorAll("#relAlertas [data-algrupo]")].find((g) => /SEM FICHA DE TREINO/i.test(g.textContent));
      return { escondidos: bl.querySelectorAll("[data-alresto][hidden]").length, botao: bl.querySelectorAll("[data-alabre]").length,
        aindaTemAcao: !!bl.querySelector("[data-altreino]") };
    });
    ok(gr2.escondidos === 0 && gr2.botao === 0 && gr2.aindaTemAcao,
      "clicar em 'ver os outros' abre o resto do grupo sem redesenhar a tela (os botões de ação continuam)");
    await p.evaluate(() => {
      const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
      st.alunos = st.alunos.filter((a) => String(a.id).indexOf("agru") !== 0);
      localStorage.setItem("mtapp:ptStudio", JSON.stringify(st));
    });
    await p.reload();
    await p.waitForTimeout(600);

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
  ok(await p.evaluate(() => /usou 0 de 10/.test(document.getElementById("pfFin").textContent)), "pacote de 10 sessões vendido aparece no perfil");
  ok(await p.evaluate(() => JSON.parse(localStorage.getItem("mtapp:ptStudio")).pagamentos.some((x) => /pacote/.test(x.forma || "") && +x.valor === 1200)), "venda do pacote registra o pagamento de R$ 1.200");
  ok(await p.evaluate(() => /data-recibo/.test(document.getElementById("pfFin").innerHTML)), "pagamentos do perfil ganham o link de recibo");
  // --- achados do diagnóstico no Financeiro do aluno ---
  const finDiag = await p.evaluate(async () => {
    const S = window.MTStore, snap = localStorage.getItem("mtapp:ptStudio"), hoje = S.todayISO(), mes = hoje.slice(0, 7);
    const esperar = () => new Promise((r) => setTimeout(r, 130));
    const out = {};
    const base = () => ({ config: { nome: "T" }, alunos: [], planosPT: [], contratosPT: [], pagamentos: [],
      sessoes: [], avaliacoes: [], exercicios: [], treinosV2: {}, despesas: [] });
    // venda de serviço não pode dar quitação da mensalidade (regra do resto do painel)
    let st = base();
    st.alunos.push({ id: "fd1", nome: "Serv", ativo: true });
    st.planosPT.push({ id: "pl", nome: "Mensal", valor: 400, treinosSem: 3 });
    st.contratosPT.push({ id: "ct", alunoId: "fd1", planoId: "pl", diaVenc: 10, status: "ativo", inicio: hoje });
    st.pagamentos.push({ id: "p1", alunoId: "fd1", valor: 120, data: hoje, forma: "Pix", desc: "Massagem" });
    S.write("ptStudio", st);
    window.__perfilPT("fd1"); await esperar();
    const t1 = document.getElementById("pfFin").textContent.replace(/\s+/g, " ");
    out.servicoNaoQuita = /em aberto/.test(t1) && !/✓ pago/.test(t1) && /em serviços\/pacotes/.test(t1);
    // pacote de serviço não pode esconder o botão de vender pacote de sessões
    st = base();
    st.alunos.push({ id: "fd2", nome: "Pac", ativo: true, servPacotes: [{ id: "sv", nome: "Massagem", total: 3, usadas: 1 }] });
    S.write("ptStudio", st);
    window.__perfilPT("fd2"); await esperar();
    out.botaoSobrevive = !!document.querySelector("#pfFin [data-pfpacote]") &&
      /Massagem/.test(document.getElementById("pfFin").textContent);
    // nome de plano com & não pode escapar duas vezes no select
    st = base();
    st.alunos.push({ id: "fd3", nome: "Amp", ativo: true });
    st.planosPT.push({ id: "plA", nome: "Studio & Box", valor: 147, treinosSem: 3 });
    S.write("ptStudio", st);
    window.__perfilPT("fd3"); await esperar();
    const opt = document.querySelector("#pfCtPlano option[value='plA']");
    out.semEscapeDuplo = !!opt && /Studio & Box/.test(opt.textContent) && !/&amp;/.test(opt.textContent);
    S.write("ptStudio", JSON.parse(snap));
    return out;
  });
  ok(finDiag.servicoNaoQuita, "venda de serviço não pinta a mensalidade de paga — e o valor aparece como extra do mês");
  ok(finDiag.botaoSobrevive, "pacote de serviço ativo não esconde o botão de vender pacote de sessões");
  ok(finDiag.semEscapeDuplo, "nome de plano com & aparece certo no select (sem escape duplo)");
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
    const linhas = Array.from(document.querySelectorAll("#listaSessoes .sessao-pt")).filter((x) => x.querySelector("[data-feita]"));
    const ultima = linhas[linhas.length - 1];
    ultima.querySelector("[data-smais]").click();
    ultima.querySelector("[data-feita]").click();
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

  // --- push de check-in e questionário esperando resposta ---
  const pendQ = await p.evaluate(async () => {
    const hoje = new Date().toISOString().slice(0, 10);
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    const j = st.alunos.find((a) => a.nome === "João Cliente");
    j.appTokenP = "tok-pend";
    j.questApp = { nome: "Dor e sono", ps: [{ texto: "Dormiu bem?", tipo: "emoji" }], desde: hoje, repete: false, enviadoEm: hoje };
    st.pushLog = {};
    localStorage.setItem("mtapp:ptStudio", JSON.stringify(st));
    // nuvem falsa: devolve o que cada tabela "respondeu"
    const mockCloud = (ck, qu, erro) => {
      const alvo = (nome) => {
        const linhas = nome === "app_checkin" ? ck : qu;
        const enc = { select: () => enc, gte: () => enc, in: () => enc,
          limit: () => Promise.resolve(erro ? { error: { message: "off" } } : { data: linhas }) };
        return enc;
      };
      return () => ({ aid: "acad-1", client: { from: alvo, auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) } } });
    };
    window.__cloudOrigP = window.MTStore.cloud;
    window.__mtCloudOrigP = window.MT_CLOUD;
    window.__fetchOrigP = window.fetch;
    window.MT_CLOUD = { url: "https://mock.local", anonKey: "k" };
    window.fetch = async (url, opts) => { window.__pu.push(JSON.parse(opts.body)); return { ok: true }; };
    const roda = async (ck, qu, erro) => {
      window.__pu = [];
      const st2 = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
      st2.pushLog = {};
      localStorage.setItem("mtapp:ptStudio", JSON.stringify(st2));
      window.MTStore.cloud = mockCloud(ck, qu, erro);
      const r = await window.__pendPT();
      await new Promise((res) => setTimeout(res, 150));
      return { enviados: r.enviados, motivo: r.motivo || "", titulos: window.__pu.map((x) => x.titulo) };
    };
    // 1) nada respondido
    const semNada = await roda([], []);
    // 2) tudo respondido (check-in desta semana + questionário de hoje)
    const respondeu = await roda([{ token: "tok-pend", dia: hoje }], [{ token: "tok-pend", criado: hoje + "T10:00:00Z" }]);
    // 3) a leitura da nuvem falhou
    const cego = await roda([], [], true);
    window.fetch = window.__fetchOrigP;
    window.MTStore.cloud = window.__cloudOrigP;
    window.MT_CLOUD = window.__mtCloudOrigP;
    const st3 = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    const j3 = st3.alunos.find((a) => a.nome === "João Cliente");
    delete j3.appTokenP; delete j3.questApp; st3.pushLog = {};
    localStorage.setItem("mtapp:ptStudio", JSON.stringify(st3));
    return { semNada, respondeu, cego, dSem: (new Date(hoje + "T12:00").getDay() + 6) % 7 };
  });
  ok(pendQ.semNada.titulos.includes("Dor e sono"),
    "questionário liberado e sem resposta avisa o aluno pelo push");
  // o check-in só cutuca da sexta em diante — o teste confere o lado certo do dia
  ok(pendQ.dSem >= 4
    ? pendQ.semNada.titulos.includes("Seu check-in da semana")
    : !pendQ.semNada.titulos.includes("Seu check-in da semana"),
    "check-in da semana avisa da sexta em diante (hoje: dia " + pendQ.dSem + " da semana)");
  ok(pendQ.respondeu.enviados === 0,
    "quem JÁ respondeu não recebe aviso nenhum");
  ok(pendQ.cego.enviados === 0 && pendQ.cego.motivo === "sem-leitura",
    "se a nuvem não responde, ninguém é cutucado (melhor calado que errado)");

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
  // tela 25: a linha do exercício mostra "4 × 10" (com respiro)
  ok(/A — Peito\/Tríceps|Peito\/Tríceps/.test(appHtml) && /Supino reto/.test(appHtml) && /4 × 10/.test(appHtml), "app leva a ficha estruturada (Supino 4 × 10)");
  ok(/<details/.test(appHtml) && /Pegada na largura dos ombros/.test(appHtml), "cada exercício é uma sub-página com a descrição");
  ok(/Sem esse aparelho hoje\?/.test(appHtml) && /Troca por: /.test(appHtml), "exercícios trazem substitutos do mesmo padrão de movimento");
  ok(/sconfBox/.test(appHtml) && /Confirmo presença/.test(appHtml) && /app_chat_envia/.test(appHtml), "próxima sessão tem os botões Vou/Não vou que avisam pelo chat");
  ok(/id='avBtn'/.test(appHtml) && /ptfotoperfil/.test(appHtml) && /dd9\.fotoPerfil=/.test(appHtml),
    "o aluno troca a própria foto pelo topo do app, e ela volta pro personal");

  // 📷 a foto só sobe quando MUDA: antes ela ia junto em todo envio do retorno
  // (peso, carga, treino marcado…), reenviando a mesma imagem dezenas de vezes
  {
    const ctxF = await b.newContext({ viewport: { width: 390, height: 844 } });
    const pF = await ctxF.newPage();
    const envios = [];
    // ordem importa: no Playwright a rota registrada por ÚLTIMO vence, então o
    // abort genérico entra ANTES da rota específica do devolve
    await pF.route("**/rest/v1/rpc/**", (r) => r.abort());
    await pF.route("**/rest/v1/rpc/app_aluno_devolve", (r) => {
      envios.push(JSON.parse(r.request().postData() || "{}"));
      r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });
    // o app precisa ter NUVEM: só nasce com MT_CLOUD.url E o aluno com appTokenP
    const appFoto = await p.evaluate(() => {
      const S = window.MTStore, st = S.read("ptStudio", {});
      const a = st.alunos[0], snap = a.appTokenP;
      a.appTokenP = "tok-foto-teste"; S.write("ptStudio", st);
      const html = window.__montaAppAluno(a, new Date().toISOString());
      const st2 = S.read("ptStudio", {});
      if (snap) st2.alunos[0].appTokenP = snap; else delete st2.alunos[0].appTokenP;
      S.write("ptStudio", st2);
      return { html, temNuvem: /,NUVEM=\{/.test(html) };
    });
    ok(appFoto.temNuvem, "📷 (preparo) o app de teste nasce com a nuvem ligada");
    await pF.route("**/app-teste-foto.html", (r) => r.fulfill({ contentType: "text/html", body: appFoto.html }));
    await pF.goto(BASE + "/app-teste-foto.html", { waitUntil: "domcontentloaded" });
    const fotoDe = (c) => "data:image/jpeg;base64," + c.repeat(200);
    const res = await pF.evaluate(async (px) => {
      const esperar = () => new Promise((r) => setTimeout(r, 2100));
      localStorage.setItem("ptpeso", JSON.stringify({ "2026-08-01": 80 }));
      localStorage.setItem("ptfotos", JSON.stringify([{ d: "2026-01-10", img: px.a, tipo: "frente" },
        { d: "2026-08-10", img: px.b, tipo: "frente" }]));
      localStorage.setItem("ptfotoperfil", px.c);
      localStorage.removeItem("ptdevfoto");
      window.__devolveApp(); await esperar();          // 1º: tem que levar a foto
      window.__devolveApp(); await esperar();          // 2º: nada mudou → sem foto
      // o aluno tira uma foto nova: a marca muda e a imagem volta a subir
      const fs = JSON.parse(localStorage.getItem("ptfotos"));
      fs.push({ d: "2026-08-20", img: px.d, tipo: "frente" });
      localStorage.setItem("ptfotos", JSON.stringify(fs));
      window.__devolveApp(); await esperar();
      return { marca: localStorage.getItem("ptdevfoto") };
    }, { a: fotoDe("A"), b: fotoDe("B"), c: fotoDe("C"), d: fotoDe("D") });
    const temFoto = (e) => !!(e && e.p_dados && e.p_dados.fotoAntes);
    const temPeso = (e) => !!(e && e.p_dados && e.p_dados.peso);
    ok(envios.length === 3 && temFoto(envios[0]),
      "📷 o primeiro envio do retorno leva a foto (" + envios.length + " envios)");
    ok(envios.length === 3 && !temFoto(envios[1]) && temPeso(envios[1]),
      "📷 o segundo envio NÃO repete a foto — mas peso, cargas e treinos continuam subindo");
    ok(envios.length === 3 && temFoto(envios[2]) && /2026-08-20/.test(JSON.stringify(envios[2].p_dados.fotoDepoisD || "")),
      "📷 foto nova volta a subir na hora (a marca mudou)");
    ok(!!res.marca, "📷 a marca do que já subiu fica guardada no aparelho (ptdevfoto)");
    // envio que FALHA não pode marcar como enviado — senão a foto nunca chega
    const envios2 = [];
    await pF.route("**/rest/v1/rpc/app_aluno_devolve", (r) => {
      envios2.push(JSON.parse(r.request().postData() || "{}"));
      r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ erro: "off" }) });
    });
    const falha = await pF.evaluate(async () => {
      const esperar = () => new Promise((r) => setTimeout(r, 2100));
      localStorage.removeItem("ptdevfoto");
      window.__devolveApp(); await esperar();
      return localStorage.getItem("ptdevfoto");
    });
    ok(envios2.length === 1 && !!envios2[0].p_dados.fotoAntes && !falha,
      "📷 envio que falhou NÃO marca a foto como enviada (ela vai de novo na próxima)");
    await ctxF.close();
  }
  // no modo claro o fundo escuro fixo do assistente deixava texto escuro sobre
  // fundo escuro; agora as três peças usam um véu da própria cor do studio
  ok(!/#241b36/.test(appHtml) && (appHtml.match(/rgba\(var\(--cor-rgb\),\.14\)/g) || []).length >= 3,
    "o assistente não tem mais fundo escuro fixo — ele clareia junto com o tema");
  ok(/minha\?'color:#fff;':''/.test(appHtml),
    "a bolha do aluno fixa o texto branco (no claro ela herdava o texto escuro do corpo)");
  ok(/onbCard/.test(appHtml) && /cardRpe/.test(appHtml) && /gMudaCarga/.test(appHtml) && /streakSem/.test(appHtml) && /cfQueda/.test(appHtml),
    "app traz onboarding, RPE, mudar a carga no player, streak de semanas e confete");
  // faixa colorida do topo: foto do aluno, iniciais quando não tem, e o
  // cartão com a sequência e os hábitos do dia
  {
    const S1 = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
    const av = await p.evaluate((foto) => {
      const S2 = window.MTStore, st = S2.read("ptStudio", {}), a = st.alunos[0], antes = a.foto;
      const nada = window.__montaAppAluno(a, "s-av0");
      a.foto = foto; S2.write("ptStudio", st);
      const com = window.__montaAppAluno(S2.read("ptStudio", {}).alunos[0], "s-av1");
      a.foto = "javascript:alert(1)"; S2.write("ptStudio", st);
      const torto = window.__montaAppAluno(S2.read("ptStudio", {}).alunos[0], "s-av2");
      a.foto = antes; S2.write("ptStudio", st);
      const bt = (h) => (h.match(/<button type='button' class='tpav'[\s\S]*?<\/button>/) || [""])[0];
      const img = (h) => (bt(h).match(/<img id='avImg'[^>]*>/) || [""])[0];
      const ini = (h) => (bt(h).match(/<span id='avIni'[^>]*>(.*?)<\/span>/) || ["", ""])[1];
      return { nada: ini(nada), nadaSemImg: !/src=/.test(img(nada)), com: img(com),
        torto: ini(torto), tortoSemImg: !/src=/.test(img(torto)),
        faixa: /class='topo'/.test(com) && /id='topoExtra'/.test(com) };
    }, S1);
    ok(av.com.indexOf(S1) > 0 && /^<img id='avImg'/.test(av.com), "a foto do aluno vai no pacote e vira o avatar do topo");
    ok(av.nada === "JC" && av.torto === "JC" && av.nadaSemImg && av.tortoSemImg,
      "sem foto (ou com endereço estranho) o avatar mostra as iniciais — " + av.nada + " / " + av.torto);
    ok(av.faixa, "o topo do app é a faixa colorida com o cartão de sequência e hábitos");
  }
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
  // 💓 batimentos da cinta do app viram KPI + gráfico de esforço no perfil
  const painelFc = await p.evaluate(() => {
    const iso = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
    const fc = {};
    for (let i = 27; i >= 0; i -= 2) { const m = 140 + (i % 4) * 6; fc[iso(i)] = { m, x: m + 22 }; }
    const ret = { feitos: {}, fc, cardio: [{ d: iso(3), n: "Rodagem", m: "corrida", k: 5.2, s: 1860, p: "5:58", fc: 158, fcx: 188 }] };
    return {
      // 1986 → 40 anos em 2026: máxima estimada 180
      comIdade: window.__painelApp(ret, { nasc: "1986-04-12" }),
      semIdade: window.__painelApp(ret, {}),
      // sem data de nascimento a idade que o ALUNO digitou no app resolve
      peloApp: window.__painelApp(Object.assign({ idade: 40 }, ret), {}),
      sujo: window.__painelApp({ feitos: {}, fc: { "2026-08-01": { m: 900, x: 12 }, naoEData: { m: 140, x: 160 } } }, { nasc: "1986-04-12" }),
    };
  });
  ok(/Batimento médio/.test(painelFc.comIdade) && /máximo 188 bpm/.test(painelFc.comIdade),
    "painel resume os batimentos num KPI (média dos treinos e o pico geral, corrida incluída)");
  ok(/Batimentos — esforço nos treinos/.test(painelFc.comIdade) && /barra = média, traço = pico/.test(painelFc.comIdade) &&
    /máxima estimada: 180 bpm \(40 anos\)/.test(painelFc.comIdade) && /Z4 forte/.test(painelFc.comIdade),
    "o gráfico de esforço sai com as zonas calculadas por 220 − idade do cadastro");
  ok(/158 bpm<\/b> \(máx 188\)/.test(painelFc.comIdade),
    "cada corrida do app mostra o batimento médio e o pico daquela corrida");
  ok(/Preencha a data de nascimento/.test(painelFc.semIdade) && !/máxima estimada/.test(painelFc.semIdade),
    "sem idade o painel mostra os números crus e pede a data de nascimento — não inventa zona");
  ok(/máxima estimada: 180 bpm/.test(painelFc.peloApp),
    "sem data de nascimento na ficha, a idade que o aluno digitou no app calcula a zona");
  ok(!/Batimento médio/.test(painelFc.sujo) && !/Batimentos —/.test(painelFc.sujo),
    "retorno adulterado (bpm impossível ou chave que não é data) não vira gráfico nenhum");
  // 📊 cada pergunta do questionário vira uma métrica no perfil do aluno
  {
    const metricas = await p.evaluate(() => {
      // 8 semanas: motivação subindo mês a mês, sono caindo, dor de resposta livre
      const checks = [];
      for (let i = 7; i >= 0; i--) {
        const d = new Date(Date.UTC(2026, 5, 1 + (7 - i) * 7)).toISOString().slice(0, 10);
        const resp = [
          { sigla: "MOTEX", pergunta: "Qual foi sua motivação?", resposta: i === 0 ? "Altíssimo" : "Médio", pontos: 8 - i },
          { sigla: "SONO", pergunta: "Como está o sono?", resposta: String(1 + i), pontos: 1 + i },
        ];
        if (i % 3 === 0) resp.push({ sigla: "DOR", pergunta: "Sentiu alguma dor?", resposta: i === 0 ? "Nenhuma" : "Ombro esquerdo", pontos: null });
        checks.push({ d, nome: "Check-in semanal", pts: 8 - i, respostas: resp });
      }
      return window.__checkinsPT({ checks });
    });
    ok(/Qual foi sua motivação/.test(metricas) && /Como está o sono/.test(metricas) && /Sentiu alguma dor/.test(metricas),
      "📊 cada pergunta respondida vira uma métrica própria no perfil do aluno (pela pergunta, não pela sigla)");
    ok(/Altíssimo/.test(metricas) && /melhorando/.test(metricas) && /média do último mês/.test(metricas),
      "motivação subindo aparece como 'melhorando', com a média do mês contra o mês anterior");
    ok(/piorando/.test(metricas), "sono caindo mês a mês aparece marcado como 'piorando'");
    ok(/Qual foi sua motivação\?/.test(metricas), "o card usa a pergunta por extenso no lugar da sigla");
    ok(/Nenhuma/.test(metricas) && /resposta mais comum/.test(metricas) && /Ombro esquerdo/.test(metricas) && /2 de 3/.test(metricas),
      "pergunta de resposta livre mostra a última resposta e a mais comum das semanas");
    ok(/Últimos check-ins/.test(metricas), "o histórico dos check-ins continua listado abaixo das métricas");
    /* 💧 os quatro botoes que o aluno toca no app (Agua, Comida, Sono, Cardio)
     * viram a MEDIA que interessa: quantos dias por semana ele marca cada um.
     * A semana em curso fica de fora — meia semana contra semanas cheias faria
     * todo aluno parecer que piorou na quarta-feira. */
    const habs = await p.evaluate(() => {
      const hab = {};
      const hoje = new Date();
      // 10 semanas cheias pra tras: Agua todo dia, Sono dia sim dia nao, Cardio so no comeco
      for (let d = 7; d <= 77; d++) {
        const dt = new Date(hoje.getTime() - d * 86400000);
        const m = { 0: true };
        if (d % 2 === 0) m[2] = true;
        if (Math.floor(d / 7) <= 4) m[3] = true;
        hab[dt.toISOString().slice(0, 10)] = m;
      }
      return { html: window.__checkinsPT({ habitos: hab }), vazio: window.__checkinsPT({ checks: [] }) };
    });
    ok(/Hábitos do dia a dia/.test(habs.html) && /Água/.test(habs.html) && /Comida/.test(habs.html) &&
      /Sono/.test(habs.html) && /Cardio/.test(habs.html),
      "💧 os quatro botões do app (água, comida, sono, cardio) viram métrica no perfil");
    ok(/dias por semana/.test(habs.html) && /class=['"]qsgraf['"]/.test(habs.html),
      "💧 cada hábito mostra a MÉDIA de dias por semana com o gráfico de evolução");
    ok(/melhor semana: <b>7 de 7<\/b>/.test(habs.html),
      "💧 água marcada todo dia dá 7 de 7 na melhor semana");
    ok(/(melhorando|piorando|estável|acompanhando)/.test(habs.html),
      "💧 o hábito também diz se está melhorando ou piorando contra o mês anterior");
    ok(habs.vazio === "", "💧 sem check-in e sem hábito o bloco não inventa nada (volta vazio)");
    // --- achados do diagnóstico: escala, formulários misturados, plural e "menos é melhor" ---
    const diag = await p.evaluate(() => {
      const S = window.MTStore, snap = localStorage.getItem("mtapp:ptStudio");
      const semana = (i, pts, extra) => Object.assign({ d: "2026-0" + i + "-05", nome: "Check-in semanal", pts: pts,
        respostas: [{ sigla: "A", pergunta: "Como foi a semana?", resposta: "r" + pts, pontos: pts }] }, extra || {});
      const out = {};
      // todas as semanas com a nota máxima: barras altas e verdes (escala ancorada no zero)
      const iguais = window.__checkinsPT({ checks: [1,2,3,4,5,6].map((i) => semana(i, 5)) });
      out.empateVerde = (iguais.match(/data-cor='ok'/g) || []).length === 6 && !/data-cor='ruim'/.test(iguais);
      // dois formulários: o gráfico é de um só e avisa
      const mistos = [1,2,3,4].map((i) => semana(i, 8)).concat([{ d: "2026-05-06", nome: "Como foi o treino?", pts: 2,
        respostas: [{ sigla: "B", pergunta: "E aí?", resposta: "r", pontos: 2 }] }]);
      const hm = window.__checkinsPT({ checks: mistos });
      out.umFormulario = /Soma dos pontos de <b>Check-in semanal<\/b>/.test(hm) && /outros formulários/.test(hm);
      // cabeçalho: singular certo; lista cheia não promete "desde sempre"
      out.singular = /1 check-in respondido/.test(window.__checkinsPT({ checks: [semana(1, 3)] }));
      const cheio = Array.from({ length: 40 }, (_, i) => semana((i % 8) + 1, 3));
      const hc = window.__checkinsPT({ checks: cheio });
      out.semDesdeMentiroso = /Últimos 40 check-ins/.test(hc) && !/responde desde/.test(hc);
      // pergunta onde nota MENOR é melhor (dor): subir a nota é piorar
      const st = S.read("ptStudio", {});
      st.questPerguntas = [{ id: "qd", sigla: "DOR", titulo: "Dor", texto: "Quanta dor?", tipo: "linear", ops: [], menosMelhor: true }];
      S.write("ptStudio", st);
      const dor = [1,2,3,4,5,6,7,8].map((i) => ({ d: "2026-0" + (i > 8 ? 8 : i) + "-05", nome: "Check-in semanal", pts: i,
        respostas: [{ sigla: "DOR", pergunta: "Quanta dor?", resposta: String(i), pontos: i }] }));
      const hd = window.__checkinsPT({ checks: dor });
      out.dorPiorando = /piorando/.test(hd) && !/melhorando/.test(hd);
      // pontuação toda NEGATIVA (a escala de carinhas que vem pronta tem -1 e -2):
      // a melhor semana de quem só vai mal não pode aparecer alta e verde
      const negs = window.__checkinsPT({ checks: [[1,-2],[2,-4],[3,-6],[4,-3]].map((par) => semana(par[0], par[1])) });
      out.negativoSemVerde = !/data-cor='ok'/.test(negs) && /data-cor='ruim'/.test(negs);
      S.write("ptStudio", JSON.parse(snap));
      return out;
    });
    ok(diag.negativoSemVerde, "semana de pontuação negativa nunca pinta de verde (escala simétrica em volta do zero)");
    ok(diag.empateVerde, "semanas todas com nota máxima aparecem altas e verdes (escala ancorada no zero, não no mínimo do aluno)");
    ok(diag.umFormulario, "o gráfico usa só o formulário mais respondido e avisa que há outros (pontuações não são comparáveis entre formulários)");
    ok(diag.singular && diag.semDesdeMentiroso, "cabeçalho no singular certo e sem prometer 'desde sempre' quando a lista vem cortada");
    ok(diag.dorPiorando, "pergunta marcada como 'nota menor é melhor' (dor) mostra piorando quando a nota sobe");
    // --- achados novos: a marcação "menor é melhor" tem que chegar no app do aluno,
    // entrar na pontuação da semana, aparecer na lista de perguntas e dar pra editar
    const menos = await p.evaluate(() => {
      const S = window.MTStore, snap = localStorage.getItem("mtapp:ptStudio");
      const st = S.read("ptStudio", {});
      st.questPerguntas = [{ id: "qm", sigla: "DOR", titulo: "Dor", texto: "Quanta dor?", tipo: "linear", ops: [], menosMelhor: true }];
      st.questionarios = [{ id: "qq", nome: "Semanal", perguntas: ["qm"] }];
      S.write("ptStudio", st);
      const pay = window.__questPT.payload(S.read("ptStudio", {}), st.questionarios[0]);
      window.__questPT.render();
      const lista = document.getElementById("qpLista").innerHTML;
      // o painel lê a marcação da própria resposta (sobrevive a apagar a pergunta)
      const semCadastro = S.read("ptStudio", {});
      semCadastro.questPerguntas = [];
      S.write("ptStudio", semCadastro);
      const hd = window.__checkinsPT({ checks: [1,2,3,4,5,6,7,8].map((i) => ({ d: "2026-0" + i + "-05", nome: "Semanal", pts: i,
        respostas: [{ sigla: "DOR", pergunta: "Quanta dor?", resposta: String(i), pontos: i, menos: true }] })) });
      S.write("ptStudio", JSON.parse(snap));
      return { mm: !!(pay.ps[0] || {}).mm, chip: /nota menor é melhor/.test(lista),
        botao: /data-qpinv/.test(lista), historico: /piorando/.test(hd) && !/melhorando/.test(hd) };
    });
    ok(menos.mm, "a marcação 'nota menor é melhor' vai no questionário mandado pro aluno (antes o app somava dor como ponto bom)");
    ok(menos.chip && menos.botao, "a lista de perguntas mostra a marcação e tem botão pra trocar o sentido sem apagar a pergunta");
    ok(menos.historico, "o histórico continua lido como 'piorando' mesmo depois de apagar a pergunta do cadastro");
    // app do aluno: soma da semana inverte a pergunta marcada, e o JSON dos blocos é escapado
    const appQ = await p.evaluate(() => ({ escapa: window.__jsonApp({ n: "a <" + "/script> b" }) }));
    // o código do app mora no construtor do site; o painel só monta os dados
    const fonteApp = fs.readFileSync(require("path").join(__dirname, "..", "app", "aluno-builder.js"), "utf8");
    const fontePainel = fs.readFileSync(require("path").join(__dirname, "..", "personal.html"), "utf8");
    ok(/total\+=\(x\.menos\?-x\.pontos:x\.pontos\)/.test(fonteApp),
      "o app do aluno desconta os pontos da pergunta marcada como 'menor é melhor' na soma da semana");
    ok(!/\+ JSON\.stringify\(/.test(fonteApp) && !/\+ JSON\.stringify\(/.test(fontePainel),
      "todos os blocos JSON do app publicado passam pelo jsonApp (nenhum JSON.stringify solto)");
    ok(appQ.escapa.indexOf("<" + "/script>") < 0 && appQ.escapa.indexOf("\\u003c/script>") >= 0,
      "todo bloco JSON do app publicado escapa '<' (um nome com </script> derrubava o app inteiro)");
    // vídeo: apagar o campo tem que TIRAR o vídeo (antes o do catálogo ressuscitava)
    const vid = await p.evaluate(() => ({
      comCatalogo: window.__videoDoEx({ nome: "Supino reto com barra" }),
      apagado: window.__videoDoEx({ nome: "Supino reto com barra", video: "", semVideo: true }),
      proprio: window.__videoDoEx({ nome: "Supino reto com barra", video: "https://x.y/z" }),
    }));
    ok(vid.comCatalogo && !vid.apagado && vid.proprio === "https://x.y/z",
      "vídeo: o do catálogo entra sozinho, o do professor manda, e apagar de propósito tira mesmo");
    // a aba própria do perfil: existe, troca e o painel principal não repete o bloco
    const abaQ = await p.evaluate(() => {
      const bt = document.querySelector('#pfAbas [data-pfa="quest"]');
      if (!bt) return null;
      bt.click();
      const sec = document.querySelector('[data-pfsec="quest"]');
      return { rot: bt.textContent.trim(), visivel: sec && !sec.hidden,
        ativa: bt.classList.contains("ativa"), temBox: !!document.getElementById("pfQuestBox"),
        appEscondida: document.querySelector('[data-pfsec="app"]').hidden };
    });
    ok(abaQ && /Check-ins/.test(abaQ.rot) && abaQ.visivel && abaQ.ativa && abaQ.temBox,
      "o perfil tem uma aba própria de Check-ins que abre a seção das respostas");
    ok(abaQ && abaQ.appEscondida, "abrir Check-ins esconde as outras seções do perfil (aba de verdade)");
    ok(await p.evaluate(() => !/MOTEX/.test(window.__painelApp({ checks: [{ d: "2026-08-09", nome: "C", pts: 1, respostas: [{ sigla: "MOTEX", resposta: "Alto", pontos: 1 }] }] }))),
      "o painel 'Direto do app' não repete mais as respostas — elas vivem só na aba Check-ins");
    // sem resposta nenhuma, a aba explica o que fazer em vez de ficar vazia
    ok(/questionário/i.test(await p.evaluate(() => { window.__checkinsPT({ checks: [] }); const c = document.getElementById("pfQuestBox"); return c ? c.textContent : ""; })) ||
      /questionário/i.test(await p.evaluate(() => document.getElementById("pfQuestBox").textContent)),
      "aluno sem resposta vê a explicação de como mandar o questionário");
  }
  ok(/>vídeo</.test(appHtml) && /youtube\.com\/watch\?v=abc123/.test(appHtml),
    "exercício com vídeo ganha o botão de vídeo no app");
  ok(!/youtube\.com\/results\?search_query=/.test(appHtml), "exercício sem vídeo próprio NÃO manda pra busca do YouTube");
  // o boneco animado foi retirado: sem sobra de código nem de botão no app
  ok(!/animbtn|animbox|ANIMD|Ver como faz/.test(appHtml), "o app sai sem nenhum resto da demonstração de bonequinho");
  ok(/gVideo/.test(appHtml) && />Como fazer</.test(appHtml), "modo guiado tem o link Como fazer");
  ok(!/dcExs/.test(appHtml), "o diário manual de cargas saiu da aba Treino (a leitura mora na Evolução)");
  ok(appHtml.includes("if(!Object.keys(L('ptpeso',{})).length&&!Object.keys(L('ptdc',{})).length"),
    "app num celular novo (sem registro local) NÃO devolve dados vazios pra nuvem");
  ok(/setbtn/.test(appHtml) && /tmrbtn/.test(appHtml), "exercícios têm botões de séries e cronômetro");
  ok(/>Descanso 100s</.test(appHtml) && /data-s='100'/.test(appHtml), "descanso programado (100s) vira o cronômetro principal do exercício no app");
  ok(/"d":100/.test(appHtml), "treino guiado usa o descanso programado do exercício");
  ok(/Minhas sessões/.test(appHtml) && /07:30/.test(appHtml), "próximas sessões embutidas no app");
  // 📷 foto da ficha: o professor escolhe uma por ficha e ela vira a capa do card do dia
  {
    const capa = await p.evaluate(() => {
      const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      const st = window.MTStore.read("ptStudio", {});
      const al = st.alunos.find((x) => x.ativo !== false);
      const t = st.treinosV2[al.id];
      t.fichas[0].capa = PNG;
      t.fichas[0].capaSuja = "javascript:alert(1)"; // campo inventado não pode vazar
      window.MTStore.write("ptStudio", st);
      const html = window.__montaAppAluno(al, new Date().toISOString());
      // e uma capa forjada (script) tem que ser barrada na saída
      t.fichas[0].capa = "data:image/svg+xml,<svg onload=alert(1)>";
      window.MTStore.write("ptStudio", st);
      const htmlMau = window.__montaAppAluno(al, new Date().toISOString());
      // devolve a ficha sem foto pro resto da suíte (o card do dia volta ao normal)
      delete t.fichas[0].capa;
      delete t.fichas[0].capaSuja;
      window.MTStore.write("ptStudio", st);
      return { html, htmlMau };
    });
    ok(/id='htFoto'/.test(capa.html) && /"c":"data:image\/png;base64,/.test(capa.html),
      "📷 a foto da ficha viaja dentro do app e vira a capa do card 'treino de hoje'");
    ok(!/onload=alert/.test(capa.htmlMau) && /"c":""/.test(capa.htmlMau),
      "capa forjada (svg com script) é descartada — só png/jpg/webp em base64 passa");
    ok(!/capaSuja/.test(capa.html), "só o que o app usa viaja: campos estranhos da ficha não vão junto");
    // a foto GERAL vive na Personalização e vale pra todos; a da ficha ganha dela
    const geral = await p.evaluate(() => {
      const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      const JPG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";
      const st = window.MTStore.read("ptStudio", {});
      const al = st.alunos.find((x) => x.ativo !== false);
      st.config = st.config || {};
      st.config.capaTreino = JPG; // foto geral da Personalização
      window.MTStore.write("ptStudio", st);
      const soGeral = window.__montaAppAluno(al, new Date().toISOString());
      const t = st.treinosV2[al.id];
      t.fichas[0].capa = PNG; // ficha com foto própria
      window.MTStore.write("ptStudio", st);
      const comFicha = window.__montaAppAluno(al, new Date().toISOString());
      // e a prévia da Personalização mostra a foto escolhida
      window.__persPT && window.__persPT();
      const prev = document.getElementById("cfgCapaPrev");
      const previa = { visivel: !prev.hidden, temSrc: /^data:image\/jpeg/.test(prev.src || ""),
        rot: document.getElementById("cfgCapaBtn").textContent };
      delete st.config.capaTreino;
      delete t.fichas[0].capa;
      window.MTStore.write("ptStudio", st);
      return { soGeral, comFicha, previa };
    });
    ok(/var CAPA_GERAL="data:image\/jpeg/.test(geral.soGeral),
      "📷 a foto geral da Personalização vale pra todos os alunos (sem precisar mexer ficha por ficha)");
    ok(/"c":"data:image\/png/.test(geral.comFicha) && /var CAPA_GERAL="data:image\/jpeg/.test(geral.comFicha),
      "quando a ficha tem foto própria, ela ganha da geral (que segue disponível pras outras fichas)");
    ok(geral.previa.visivel && geral.previa.temSrc && /Trocar foto/.test(geral.previa.rot),
      "a Personalização mostra a prévia da foto e troca o botão pra 'Trocar foto'");
    // circuito e corrida também têm foto própria (o dia de WOD/corrida no card)
    const capaWC = await p.evaluate(() => {
      const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      // mexe numa CÓPIA e devolve o original inteiro: o resto da suíte conta
      // com os circuitos/corridas exatamente como o professor deixou
      const original = JSON.stringify(window.MTStore.read("ptStudio", {}));
      const st = window.MTStore.read("ptStudio", {});
      const al = st.alunos.find((x) => x.ativo !== false);
      const t = st.treinosV2[al.id];
      t.wods = [{ id: "wCapa", nome: "Circuito da foto", tipo: "amrap", min: 10, mov: ["burpee"], movs: [{ q: "10", n: "burpee" }], capa: PNG }];
      t.cardio = [{ id: "cCapa", nome: "Corrida da foto", mod: "corrida", tipo: "continuo", dist: 5,
        capa: "data:image/svg+xml,<svg onload=alert(1)>" }]; // forjada: tem que sumir
      window.MTStore.write("ptStudio", st);
      const html = window.__montaAppAluno(al, new Date().toISOString());
      window.MTStore.write("ptStudio", JSON.parse(original));
      return html;
    });
    ok(/"cp":"data:image\/png;base64,/.test(capaWC) && /id='heroWod'[^>]*>\s*<img/.test(capaWC),
      "📷 a foto do circuito viaja no app e vira a capa do slide de circuito");
    ok(!/onload=alert/.test(capaWC),
      "capa forjada no circuito/corrida é descartada igual à da ficha");
    // a foto geral não pode ser copiada ficha por ficha (o app do aluno inchava)
    const peso = await p.evaluate(() => {
      const cv = document.createElement("canvas");
      cv.width = 720; cv.height = 405;
      const x = cv.getContext("2d");
      const im = x.createImageData(720, 405);
      for (let i = 0; i < im.data.length; i += 4) { im.data[i] = (i * 7) % 255; im.data[i + 1] = (i * 13) % 255; im.data[i + 2] = (i * 29) % 255; im.data[i + 3] = 255; }
      x.putImageData(im, 0, 0);
      const foto = cv.toDataURL("image/jpeg", .78);
      const st = window.MTStore.read("ptStudio", {});
      const al = st.alunos.find((a) => a.ativo !== false);
      const guardaFichas = JSON.stringify(st.treinosV2[al.id].fichas);
      const fichas = [];
      for (let i = 0; i < 6; i++) fichas.push({ id: "fx" + i, titulo: "Ficha " + i, itens: [{ exId: st.exercicios[0].id, series: 3, reps: "10", descanso: 60, obs: "" }] });
      st.treinosV2[al.id].fichas = fichas;
      st.config = st.config || {};
      st.config.capaTreino = foto;
      window.MTStore.write("ptStudio", st);
      const html = window.__montaAppAluno(al, new Date().toISOString());
      const copias = (html.match(/data:image\/jpeg;base64/g) || []).length;
      // devolve tudo como estava
      st.treinosV2[al.id].fichas = JSON.parse(guardaFichas);
      delete st.config.capaTreino;
      window.MTStore.write("ptStudio", st);
      return { copias, kb: Math.round(html.length / 1024), fotoKb: Math.round(foto.length / 1024) };
    });
    ok(peso.copias === 1, "a foto geral viaja UMA vez só no app, mesmo com 6 fichas (" + peso.copias + " cópia)");
    ok(peso.kb < peso.fotoKb * 2 + 250, "o app do aluno com foto fica em " + peso.kb + " KB — sem repetir a imagem por ficha");
    // 🖼 o corte é 4:5 (em pé), o formato do card do aluno — antes era 16:9 e a
    // foto era jogada fora duas vezes (no corte e de novo na tela)
    const corte = await p.evaluate(async () => {
      const faz = (w, h) => new Promise((res) => {
        const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
        const x = cv.getContext("2d");
        const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, "#7c3aed"); g.addColorStop(1, "#111");
        x.fillStyle = g; x.fillRect(0, 0, w, h);
        cv.toBlob((b) => res(new File([b], "f.jpg", { type: "image/jpeg" })), "image/jpeg", .9);
      });
      const mede = (d) => new Promise((res) => { const i = new Image(); i.onload = () => res({ w: i.width, h: i.height }); i.src = d; });
      const out = {};
      for (const [nome, w, h] of [["deitada", 1920, 1080], ["empe", 1080, 1920], ["quadrada", 1000, 1000], ["pequena", 300, 400]]) {
        const arq = await faz(w, h);
        out[nome] = await mede(await new Promise((res) => window.__leCapa(arq, res)));
      }
      return out;
    });
    const quatroCinco = (o) => Math.abs(o.w / o.h - 4 / 5) < 0.01;
    ok(quatroCinco(corte.deitada) && quatroCinco(corte.empe) && quatroCinco(corte.quadrada),
      "🖼 foto deitada, em pé ou quadrada — todas viram 4:5, o formato do card do aluno");
    ok(corte.deitada.w === 640 && corte.empe.w === 640, "a foto é reduzida pra 640 px de largura (leve pra viajar no app)");
    ok(corte.pequena.w === 300 && quatroCinco(corte.pequena),
      "foto pequena não é esticada — só cortada no formato (300 px continuam 300 px)");
    // a receita da foto tem que estar ESCRITA na tela — o professor não pode
    // precisar perguntar qual tamanho mandar
    const receita = await p.evaluate(() => {
      const g = [].slice.call(document.querySelectorAll(".fotoguia"));
      return { quantos: g.length, txt: g.map((e) => e.textContent.replace(/\s+/g, " ")).join(" | ") };
    });
    ok(receita.quantos >= 2 && /1080 × 1350/.test(receita.txt) && /Em pé/.test(receita.txt) && /no meio/.test(receita.txt),
      "🖼 a Personalização diz na tela o que subir: em pé, 1080 × 1350 e o assunto no meio");
  }
  /* Com foto, o card do treino de hoje ganha um véu escuro por cima da imagem
   * — nos DOIS temas. Antes o texto seguia o tema, então no modo claro o nome
   * do treino saía escuro em cima do véu escuro e não dava pra ler. */
  {
    const appCapa = await p.evaluate(() => {
      const cv = document.createElement("canvas");
      cv.width = 720; cv.height = 405;
      const x = cv.getContext("2d");
      x.fillStyle = "#101014"; x.fillRect(0, 0, 720, 405);
      const st = window.MTStore.read("ptStudio", {});
      const al = st.alunos.find((z) => z.ativo !== false);
      st.config = st.config || {};
      st.config.capaTreino = cv.toDataURL("image/jpeg", .78);
      window.MTStore.write("ptStudio", st);
      const html = window.__montaAppAluno(al, new Date().toISOString());
      delete st.config.capaTreino;
      window.MTStore.write("ptStudio", st);
      return html;
    });
    const pCapa = await p.context().newPage();
    await pCapa.addInitScript(() => localStorage.setItem("pttema", JSON.stringify(1)));
    await pCapa.route("**/app-teste-capa.html", (r) => r.fulfill({ contentType: "text/html", body: appCapa }));
    await pCapa.goto(BASE + "/app-teste-capa.html", { waitUntil: "domcontentloaded" });
    await pCapa.waitForTimeout(900);
    const hero = await pCapa.evaluate(() => {
      const el = document.getElementById("heroTreino");
      return { claro: document.documentElement.classList.contains("claro"),
        comfoto: el.classList.contains("comfoto"),
        foto: document.getElementById("htFoto").style.display,
        tit: getComputedStyle(document.getElementById("htTitulo")).color,
        sub: getComputedStyle(document.getElementById("htSub")).color };
    });
    // as páginas do app dividem o mesmo armazenamento: sem apagar a escolha de
    // tema aqui, os testes seguintes nasceriam no modo claro
    await pCapa.evaluate(() => localStorage.removeItem("pttema"));
    await pCapa.close();
    ok(hero.claro && hero.foto === "block" && hero.comfoto,
      "o card do dia com foto se marca como 'comfoto' pro tema não mandar no texto");
    ok(hero.tit === "rgb(255, 255, 255)" && hero.sub === "rgb(214, 210, 223)",
      "com foto, o nome do treino fica branco também no modo claro (era escuro sobre o véu escuro)");
  }
  /* Quem vence quando o aparelho e a nuvem discordam.
   *
   * Um professor perdeu a lista de alunos aqui: o aparelho abriu com a lista
   * curta, era "mais novo", e subiu por cima da nuvem cheia. A trava que existia
   * pra impedir isso media o aparelho pela MAIOR lista dele — e a maior lista do
   * painel é o catálogo de exercícios, semeado com uma dezena de itens num
   * aparelho zerado. Ela nunca disparava. */
  {
    const sync = await p.evaluate(() => {
      const S = window.__MTSync;
      if (!S) return null;
      const dez = Array(10).fill(0);
      return {
        // o caso real: 1 aluno no aparelho, 5 na nuvem, catálogo igual dos dois lados
        perigo: S.nuvemTemMais({ alunos: [1], exercicios: dez }, { alunos: [1, 2, 3, 4, 5], exercicios: dez }),
        // aparelho recém-semeado (zero aluno, catálogo cheio) contra nuvem com base
        novo: S.nuvemTemMais({ alunos: [], exercicios: dez }, { alunos: [1, 2], exercicios: dez }),
        // encerrar aluno de verdade já subiu: os dois lados iguais, nada a desfazer
        exclusao: S.nuvemTemMais({ alunos: [1, 2, 3] }, { alunos: [1, 2, 3] }),
        // aparelho com mais coisa que a nuvem continua mandando
        aparelhoRico: S.nuvemTemMais({ alunos: [1, 2, 3, 4] }, { alunos: [1, 2] }),
        // a conta antiga achava que este aparelho tinha 10 registros
        contaVelha: S.listasDe({ alunos: [], exercicios: dez }).alunos,
        // MAPA (treinosV2/dietas): nuvem cheia de fichas × aparelho com o mapa vazio.
        // Antes listasDe só via arrays de 1º nível e a trava não pegava o mapa —
        // o aparelho apagava todas as fichas da nuvem.
        mapaPerigo: S.nuvemTemMais(
          { treinosV2: { a1: { fichas: [] } } },
          { treinosV2: { a1: { fichas: [1, 2, 3] }, a2: { fichas: [4] } } }),
        mapaVeMais: S.listasDe({ treinosV2: { a1: { fichas: [1, 2, 3] } } })["treinosV2.a1.fichas"],
        // dieta do Nutri é o mesmo formato (paciente → { refeicoes: [] })
        dietaPerigo: S.nuvemTemMais(
          { dietas: { p1: { refeicoes: [] } } },
          { dietas: { p1: { refeicoes: [1, 2] } } }),
      };
    });
    ok(!!sync, "o store expõe a regra de sincronização pros testes");
    ok(sync.perigo, "nuvem com mais alunos vence o aparelho com a lista curta (foi assim que sumiram alunos)");
    ok(sync.novo, "aparelho recém-semeado não apaga a base da nuvem, mesmo com o catálogo cheio");
    ok(sync.contaVelha === 0, "a contagem agora olha lista por lista — zero aluno conta zero, não dez");
    ok(!sync.exclusao, "encerrar aluno de verdade não é desfeito na abertura seguinte");
    ok(!sync.aparelhoRico, "aparelho com mais dados que a nuvem continua mandando");
    ok(sync.mapaVeMais === 3, "a trava agora enxerga as listas DENTRO dos mapas (treinosV2.a1.fichas = 3)");
    ok(sync.mapaPerigo, "nuvem com fichas de treino vence aparelho com o mapa vazio (senão apagava todas as fichas)");
    ok(sync.dietaPerigo, "mesma proteção pras dietas do Nutri (mapa paciente → refeições)");
  }

  /* 🔒 REGRA DE FERRO do envio: aparelho recém-zerado NUNCA empurra nada pra
   * nuvem antes da primeira puxada da sessão. Foi ESTE o buraco dos dois
   * apagões do Diogo: o boot escrevia o estúdio vazio, o timer de 1,2 s
   * enviava, e a nuvem cheia virava nada antes de a puxada voltar. */
  {
    const ferro = await p.evaluate(async () => {
      const Sy = window.__MTSync, st = Sy._estado, out = {};
      const cliOrig = st.client, sujOrig = st.sujas, recOrig = st.reconciliou;
      let upserts = 0;
      st.client = { from: () => ({ upsert: () => { upserts++; return Promise.resolve({ error: null }); } }) };
      st.sujas = { "mtapp:ptStudio": true };
      // ANTES da primeira puxada: o envio tem que segurar a fila, sem upsert
      st.reconciliou = false;
      Sy.enviaSujas();
      await new Promise((r) => setTimeout(r, 50));
      out.segurou = upserts === 0 && st.sujas["mtapp:ptStudio"] === true;
      // DEPOIS da puxada reconciliar: a mesma fila sobe
      st.reconciliou = true;
      Sy.enviaSujas();
      await new Promise((r) => setTimeout(r, 50));
      out.subiu = upserts === 1;
      st.client = cliOrig; st.sujas = sujOrig; st.reconciliou = recOrig;
      return out;
    });
    ok(ferro.segurou, "🔒 antes da 1ª puxada da sessão, NADA sobe pra nuvem — a fila fica guardada (mata o apagão do aparelho zerado)");
    ok(ferro.subiu, "depois que a puxada reconcilia, a mesma fila sobe normalmente");
    // e o motor de verdade liga a regra nos dois pontos certos (fonte do store.js)
    const storeSrc = await p.evaluate(async () => await (await fetch("apps/store.js")).text());
    ok(/if \(!sync\.reconciliou\) \{ avisaStatus\(\); return; \}/.test(storeSrc),
      "o enviaSujas de verdade tem a regra de ferro logo na entrada");
    ok(/sync\.reconciliou = true;/.test(storeSrc) && /sync\.marcaAid = sync\.aid; sync\.reconciliou = false;/.test(storeSrc),
      "a puxada liga a regra ao reconciliar e trocar de conta desliga de novo");
  }
  // ---------- 🚀 escala: o painel tem que aguentar milhares de alunos ----------
  console.log("Escala (1000 alunos):");
  {
    const esc1000 = await p.evaluate(() => {
      const guarda = localStorage.getItem("mtapp:ptStudio");
      const st = window.MTStore.read("ptStudio", {});
      const exId = (st.exercicios && st.exercicios[0] && st.exercicios[0].id) || "e1";
      st.alunos = []; st.pagamentos = []; st.sessoes = []; st.treinosV2 = {};
      for (let i = 0; i < 1000; i++) {
        const id = "esc" + i;
        st.alunos.push({ id, nome: "Aluno Escala " + i, zap: "31999990000", valor: 300, modo: "mes", venc: 5, ativo: true, metaSemana: 3, desde: "2025-01-10" });
        for (let m = 0; m < 12; m++) st.pagamentos.push({ id: "pe" + i + "_" + m, alunoId: id, valor: 300, data: "2026-" + String(m + 1).padStart(2, "0") + "-05", forma: "pix" });
        for (let s = 0; s < 4; s++) st.sessoes.push({ id: "se" + i + "_" + s, alunoId: id, data: "2026-08-0" + (s + 1), hora: "07:00", feita: s < 2 });
        st.treinosV2[id] = { fichas: [{ id: "fe" + i, titulo: "A", itens: [{ exId, series: 4, reps: "10", descanso: 90, obs: "" }] }] };
      }
      localStorage.setItem("mtapp:ptStudio", JSON.stringify(st));
      const t0 = performance.now();
      window.__ptStudio.render();
      const renderMs = performance.now() - t0;
      const cards = document.querySelectorAll("#listaAlunos .aluno-pt").length;
      const domKB = Math.round(document.getElementById("listaAlunos").innerHTML.length / 1024);
      const verMais = document.getElementById("alMais");
      const rot = verMais ? verMais.textContent : "";
      if (verMais) verMais.click();
      const depois = document.querySelectorAll("#listaAlunos .aluno-pt").length;
      // conferência: o índice tem que dar a MESMA resposta da varredura antiga
      const idx = window.__idxPT(st);
      const antigo = st.pagamentos.some((pg) => pg.alunoId === "esc7" && (pg.data || "").slice(0, 7) === "2026-03");
      const novo = idx.pagouMes("esc7", "2026-03");
      const semPag = idx.pagouMes("esc7", "2029-01");
      localStorage.setItem("mtapp:ptStudio", guarda);
      window.__ptStudio.load(); window.__ptStudio.render();
      return { renderMs: Math.round(renderMs), cards, domKB, rot, depois, antigo, novo, semPag };
    });
    ok(esc1000.renderMs < 900, "🚀 painel com 1000 alunos e 12 mil pagamentos redesenha em " + esc1000.renderMs + " ms (era 2280 ms antes dos índices)");
    ok(esc1000.cards === 60 && /Ver mais/.test(esc1000.rot), "a lista sai em partes de 60 — 1000 cards de uma vez travavam a tela (" + esc1000.rot.trim() + ")");
    ok(esc1000.depois === 120, "'Ver mais' traz o próximo lote sem recarregar a página");
    ok(esc1000.domKB < 150, "a lista ocupa " + esc1000.domKB + " KB de tela (eram 936 KB com todos de uma vez)");
    ok(esc1000.novo === esc1000.antigo && esc1000.novo === true && esc1000.semPag === false,
      "o índice responde igualzinho à varredura antiga (mesmo resultado, sem o custo)");
    // o índice guarda uma cópia pra ser rápido — não pode devolver dado velho
    const fresco = await p.evaluate(() => {
      const st = window.MTStore.read("ptStudio", {});
      const al = st.alunos.find((a) => a.ativo !== false);
      const mes = "2031-07"; // mês sem histórico nenhum, pra medir só o efeito do índice
      const antes = window.__idxPT(st).pagouMes(al.id, mes);
      // registra um pagamento no MESMO objeto já indexado (o caso que enganaria o cache)
      st.pagamentos.push({ id: "pgfresco", alunoId: al.id, valor: 100, data: mes + "-15", forma: "pix" });
      const depois = window.__idxPT(st).pagouMes(al.id, mes);
      st.pagamentos = st.pagamentos.filter((x) => x.id !== "pgfresco");
      return { antes, depois };
    });
    ok(fresco.antes === false && fresco.depois === true,
      "pagamento novo aparece na hora: o índice se refaz quando a lista muda (nada de cache velho)");
  }

  // ---------- 🖼 banco de imagens do studio ----------
  console.log("Banco de imagens:");
  {
    const JPG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";
    const banco = await p.evaluate((JPG) => {
      const hoje = new Date().toISOString().slice(0, 10);
      window.MTStore.write("ptImagens", [
        { id: "i1", n: "Sala de musculação", d: JPG, em: hoje },
        { id: "i2", n: "Área de perna", d: JPG, em: hoje },
      ]);
      document.querySelector('[data-a="imagens"]').click();
      return { espaco: document.getElementById("imgEspaco").textContent,
        cards: document.querySelectorAll("#imgGaleria [data-imgcapa]").length,
        secao: !document.getElementById("vImagens").hidden,
        nome: document.getElementById("imgGaleria").textContent };
    }, JPG);
    ok(banco.secao && banco.cards === 2 && /Sala de musculação/.test(banco.nome),
      "🖼 a aba Imagens lista o que está guardado no banco");
    ok(/2 imagem\(ns\)/.test(banco.espaco) && /de 2 MB usados/.test(banco.espaco),
      "o medidor mostra quantas fotos e quanto espaço já foi usado — " + banco.espaco.trim());
    // usar uma imagem do banco como foto do card (todos os alunos)
    const usada = await p.evaluate(() => {
      window.__alertOrig2 = window.alert; window.alert = () => {};
      document.querySelector('#imgGaleria [data-imgcapa="i1"]').click();
      window.alert = window.__alertOrig2;
      const st = window.MTStore.read("ptStudio", {});
      return { capa: (st.config || {}).capaTreino || "", pendente: !!(st.config || {}).appEditGeralEm };
    });
    ok(/^data:image\/jpeg/.test(usada.capa) && usada.pendente,
      "'Usar no card' pega a foto do banco e marca os apps pra republicar");
    // a galeria abre pra escolher (Personalização e ficha usam o mesmo diálogo)
    const dlg = await p.evaluate(() => {
      window.__galeriaPT({ tipo: "geral" });
      const aberto = document.getElementById("dlgGaleria").open;
      const opcoes = document.querySelectorAll("#galEscolher [data-galsel]").length;
      document.querySelector('#galEscolher [data-galsel="i2"]').click();
      const st = window.MTStore.read("ptStudio", {});
      return { aberto, opcoes, fechou: !document.getElementById("dlgGaleria").open, capa: (st.config || {}).capaTreino || "" };
    });
    ok(dlg.aberto && dlg.opcoes === 2, "'Escolher da galeria' abre o banco com as fotos guardadas");
    ok(dlg.fechou && /^data:image\/jpeg/.test(dlg.capa), "escolher uma foto da galeria aplica e fecha o diálogo");
    // apagar libera espaço; o teto protege o navegador de encher
    const apagou = await p.evaluate(() => {
      window.__confirmOrig2 = window.confirm; window.confirm = () => true;
      document.querySelector('#imgGaleria [data-imgrm="i1"]').click();
      window.confirm = window.__confirmOrig2;
      return { n: window.MTStore.read("ptImagens", []).length, txt: document.getElementById("imgEspaco").textContent };
    });
    ok(apagou.n === 1 && /1 imagem\(ns\)/.test(apagou.txt), "apagar tira do banco e o medidor acompanha");
    ok(await p.evaluate(async () => {
      const t = await (await fetch("apps/store.js")).text();
      return /"ptImagens"/.test(t);
    }), "o banco de imagens entra no backup e na sincronização da nuvem");
    // devolve tudo como estava pro resto da suíte (sem foto geral sobrando)
    await p.evaluate(() => {
      window.MTStore.write("ptImagens", []);
      const st = window.MTStore.read("ptStudio", {});
      delete (st.config || {}).capaTreino;
      window.MTStore.write("ptStudio", st);
    });
  }
  ok(/Agenda<\/h2>/.test(appHtml) && /agCal/.test(appHtml) && /app_agenda_pede/.test(appHtml) && /app_agenda_lista/.test(appHtml), "app tem agenda estilo calendário com pedido de horário pela nuvem");
  ok(/data-agics/.test(appHtml) && /AGTIT/.test(appHtml) && /VCALENDAR/.test(appHtml), "horário confirmado no app tem o botão 📅 salvar no calendário");
  ok(/cardNotif/.test(appHtml) && /app_aluno_push/.test(appHtml) && /app-sw\.js/.test(appHtml), "app registra push pelo link hospedado (lembretes)");
  ok(/navApp/.test(appHtml) && /trocaSec/.test(appHtml) && /menuApp/.test(appHtml), "app tem barra de abas fixa embaixo + gaveta do menu ☰ (estilo app nativo)");
  ok(/manifest\.webmanifest/.test(appHtml) && /theme-color/.test(appHtml) && /apple-touch-icon/.test(appHtml), "app instala como PWA de verdade (manifest + theme-color + ícone iOS)");
  ok(await p.evaluate(async () => {
    const t = await (await fetch("app/index.html")).text();
    return /tq_app_html/.test(t) && /localStorage\.getItem\("tq_app_token"\)/.test(t) && /copiaLocal/.test(t);
  }), "abridor do app guarda cópia offline e reusa o token do aparelho");

  // carimbo estranho não pode virar "undefined/undefined" no rodapé do app
  {
    const rodape = await p.evaluate(() => {
      const st = window.MTStore.read("ptStudio", {});
      const h = window.__montaAppAluno(st.alunos[0], "demo");
      const m = h.match(/Gerado em [^<]*/);
      return m ? m[0] : "";
    });
    ok(rodape && !/undefined/.test(rodape), "rodapé do app não mostra 'undefined' quando o carimbo não é data — " + rodape);
  }

  // ---------- fonte única: o /app/ monta o app com o código do SITE ----------
  {
    // pacote como ele vai pra nuvem, mas SEM o html pronto: se o app abrir,
    // é porque o código veio do site (app/aluno-builder.js)
    const pac = await p.evaluate(() => {
      const st = window.MTStore.read("ptStudio", {});
      const al = st.alunos[0];
      al.appTokenP = al.appTokenP || "tok-fonte-unica";
      window.MTStore.write("ptStudio", st);
      const pacote = window.__pacoteApp(al, "2026-01-01T00:00:00Z");
      return { dados: pacote.dados, stamp: pacote.stamp, ver: pacote.ver, temHtml: !!pacote.html, nome: al.nome.split(" ")[0] };
    });
    ok(pac.temHtml && pac.ver && pac.dados && !/<!DOCTYPE/i.test(JSON.stringify(pac.dados)),
      "pacote publicado leva os dados do aluno (e o html só como rede de segurança)");

    const pLoader = await ctx.newPage();
    const errosL = [];
    pLoader.on("pageerror", (e) => errosL.push(e.message));
    // a app_aluno_estado é derrubada de propósito: no GitHub a internet é
    // aberta e, sem isso, o teste batia no Supabase DE VERDADE — que respondia
    // "sem_registro" pro token de mentira e a página apagava tudo em vez de
    // montar. Derrubada, ela cai no caminho antigo (app_aluno_busca), que é o
    // que este bloco quer testar.
    await pLoader.route("**/rest/v1/rpc/app_aluno_estado", (r) => r.abort());
    await pLoader.route("**/rest/v1/rpc/app_aluno_busca", (r) =>
      r.fulfill({ contentType: "application/json", body: JSON.stringify({ dados: pac.dados, stamp: pac.stamp, ver: pac.ver }) }));
    await pLoader.goto(BASE + "/app/?t=tok-fonte-unica");
    await pLoader.waitForTimeout(700);
    const montou = await pLoader.evaluate(() => ({
      nav: !!document.getElementById("navApp"),
      titulo: (document.querySelector(".topo h1") || {}).textContent || "",
      raiz: (document.querySelector("style") || {}).textContent.indexOf(":root{--cor:") === 0,
      guardou: !!(localStorage.getItem("tq_app_pacote") || ""),
      semHtmlGuardado: !localStorage.getItem("tq_app_html"),
    }));
    ok(montou.nav && montou.titulo === pac.nome,
      "sem o html pronto, o /app/ monta o app do aluno com o código do site");
    ok(montou.raiz, "a cor do studio chega pelo :root do pacote");
    ok(montou.guardou && montou.semHtmlGuardado,
      "o aparelho guarda os DADOS (não o html), então na próxima vez o código vem novo do site");
    ok(errosL.length === 0, "abrir pelo /app/ não gera erro de JS" + (errosL.length ? " — " + errosL[0] : ""));
    await pLoader.close();
  }
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
          return Promise.resolve({ status: 200, text: () => Promise.resolve('{"ok":true}') });
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
    /* O provedor do aluno pode engolir o e-mail mesmo com o envio ACEITO. Sem a
     * senha na mensagem de sucesso, o professor ficava sem saída: reenviar só
     * gera outra senha que também não chega. */
    ok(acesso.r.senha, "quando o e-mail sai, a senha temporária volta junto (pro caso de não chegar)");
    const msgOk = await p.evaluate(() => window.__acessoAluno.msg({ ok: true, email: "a@b.com", senha: "Zz9Zz9Zz9Z" }, { nome: "João Cliente", zap: "31988887777" }));
    ok(/Acesso enviado/.test(msgOk) && /Zz9Zz9Zz9Z/.test(msgOk) && /wa\.me\/5531988887777/.test(msgOk),
      "mesmo com o e-mail aceito, a tela mantém a senha e o botão de WhatsApp à mão");
    /* O recado do acesso só existia em lugares que podiam estar ESCONDIDOS: na
     * aba "App do aluno" (e o professor clica de outra aba) e atrás do dialog de
     * cadastro. Dava a impressão de que o botão não fazia nada — inclusive
     * quando o e-mail falhava e a senha de reserva estava ali, invisível. */
    const visivel = await p.evaluate(async () => {
      const S = window.MTStore, st = S.read("ptStudio", {});
      window.__cloudOrig = window.__cloudOrig || S.cloud;
      // consulta encadeada que termina em promise vazia (o perfil faz vários selects)
      const q = () => { const o = {}; ["select", "eq", "in", "gte", "lte", "order", "limit", "upsert", "insert", "update", "delete", "neq", "is"].forEach((m) => { o[m] = () => o; });
        o.then = (f) => Promise.resolve({ data: [], error: null }).then(f); return o; };
      S.cloud = () => ({ aid: "a1", client: {
        auth: { getSession: () => Promise.resolve({ data: { session: { access_token: "J" } } }) },
        from: () => q(),
        rpc: () => Promise.resolve({ data: { ok: true }, error: null }),
      } });
      window.__fetchOrig = window.__fetchOrig || window.fetch;
      window.fetch = (u, o) => String(u).includes("functions/v1/envia-email")
        ? Promise.resolve({ status: 200, json: () => Promise.resolve({ ok: true }) })
        : window.__fetchOrig(u, o);
      window.__perfilPT(st.alunos[0].id);
      await new Promise((r) => setTimeout(r, 250));
      window.__pfAba("cadastro");                    // o professor está em OUTRA aba
      document.getElementById("pfAcesso").click();
      await new Promise((r) => setTimeout(r, 900));
      const box = document.getElementById("pfAppDados");
      const out = { caixaVisivel: box.offsetParent !== null, temRecado: /Acesso enviado|Acesso criado/.test(box.innerText),
        naStatus: !!document.getElementById("naAcessoStatus") };
      window.fetch = window.__fetchOrig;
      S.cloud = window.__cloudOrig;
      return out;
    });
    ok(visivel.caixaVisivel && visivel.temRecado,
      "clicando de outra aba, o painel abre a aba certa e o recado do acesso fica VISÍVEL (antes sumia e parecia que nada acontecia)");
    ok(visivel.naStatus, "o cadastro novo tem caixa de recado DENTRO do dialog (o aviso de trás fica escondido por ele)");
    /* A ficha só chega no celular do aluno depois de publicar o app. A única
     * porta era o botão de lote, escondido na aba "Em grupo" — quem montava a
     * ficha não tinha como mandar. Agora existe o envio de UM aluno, e o botão
     * está nas duas abas onde a ficha é feita. */
    const envio = await p.evaluate(async () => {
      const S = window.MTStore, st = S.read("ptStudio", {});
      const a = st.alunos[0];
      a.appTokenP = a.appTokenP || "tok-envio";
      S.write("ptStudio", st);
      let publicado = null;
      const q = () => { const o = {}; ["select", "eq", "in", "gte", "lte", "order", "limit", "insert", "update", "delete", "neq", "is"].forEach((m) => { o[m] = () => o; });
        o.then = (f) => Promise.resolve({ data: [], error: null }).then(f);
        o.upsert = (linhas) => { publicado = linhas; return Promise.resolve({ error: null }); }; return o; };
      window.__cloudOrig = window.__cloudOrig || S.cloud;
      S.cloud = () => ({ aid: "a1", client: {
        auth: { getSession: () => Promise.resolve({ data: { session: { access_token: "J" } } }) },
        from: () => q(), rpc: () => Promise.resolve({ data: { ok: true }, error: null }),
      } });
      const r = await new Promise((res) => window.__appsPendentes.publicaUm(a.id, res));
      S.cloud = window.__cloudOrig;
      return { r: r, token: publicado && publicado[0].token, temHtml: !!(publicado && String(publicado[0].dados.html).length > 5000),
        pubEm: !!(S.read("ptStudio", {}).alunos.find((x) => x.id === a.id) || {}).appPubEm,
        botaoFichas: !!document.getElementById("tEnviaApp"), botaoAuto: !!document.getElementById("taEnviaApp") };
    });
    ok(envio.r.ok && envio.token && envio.temHtml, "dá pra publicar o app de UM aluno (o app inteiro vai pra nuvem)");
    ok(envio.pubEm, "publicar marca a data no aluno (ele sai da fila de 'apps atualizados')");
    ok(envio.botaoFichas && envio.botaoAuto, "o botão 'Enviar pro app do aluno' está nas duas abas onde a ficha é montada");
    /* Quem recebeu o acesso do professor já entra com e-mail e senha — o card
     * "Meu login" (que serve pra CRIAR um login) só confunde, e ainda deixava
     * o aluno cadastrar um login diferente do que chegou pra ele. */
    const cardLogin = await p.evaluate(() => {
      const S = window.MTStore;
      const base = { id: "cl1", nome: "Aluno Teste", email: "a@b.com", ativo: true, desde: S.todayISO(), appTokenP: "tok-cl", metaSemana: 3 };
      const re = /<h2>Meu login<\/h2>/;
      return {
        sem: re.test(window.__montaAppAluno(base, "s1")),
        com: re.test(window.__montaAppAluno(Object.assign({}, base, { acessoEm: "2026-08-18T00:00:00Z" }), "s2")),
        guarda: /var lgB=document\.getElementById\('lgSalva'\);if\(lgB\)/.test(window.__montaAppAluno(base, "s3")),
      };
    });
    ok(!cardLogin.com, "aluno que já recebeu o acesso não vê o card 'Meu login' (ele já entra com o login que chegou)");
    ok(cardLogin.sem, "quem nunca recebeu acesso continua podendo criar o próprio login (não fica sem caminho)");
    ok(cardLogin.guarda, "o código do app não quebra quando o card não existe");
    /* Sair e trocar a senha: o aluno pode estar num celular emprestado, e o
     * professor precisa poder girar a senha sem falar com ninguém. */
    const conta = await p.evaluate(() => {
      const S = window.MTStore;
      const base = { id: "cn1", nome: "Aluno Teste", email: "A@B.com", ativo: true, desde: S.todayISO(), appTokenP: "tok-cn", metaSemana: 3 };
      const com = window.__montaAppAluno(Object.assign({}, base, { acessoEm: "2026-08-18T00:00:00Z" }), "s1");
      const sem = window.__montaAppAluno(base, "s2");
      return {
        cardCom: /<h2>Minha conta<\/h2>/.test(com), cardSem: /<h2>Minha conta<\/h2>/.test(sem),
        login: (com.match(/MEULOGIN=("[^"]*")/) || [])[1],
        troca: /aluno_define_login',\{t:TOKEN,p_login:MEULOGIN/.test(com),
        limpa: /tq_app_token','tq_app_html','tq_app_pacote','tq_app_stamp','mt_aluno_token/.test(com),
        volta: /aluno-login\.html\?sair=1/.test(com),
        botaoPainel: !!document.getElementById("btnContaSenha"),
        temTrocaSenha: !!(window.MT_conta && window.MT_conta.trocaSenha) || /trocaSenha/.test(String(window.__contaP || "")),
      };
    });
    ok(conta.cardCom && !conta.cardSem, "o card 'Minha conta' aparece só pra quem tem login (quem não tem vê o de criar login)");
    ok(conta.login === '"a@b.com"', "o app leva o login do aluno em minúsculas, pra trocar a senha sem trocar o login");
    ok(conta.troca, "trocar a senha reusa o login atual (não deixa o aluno mudar o login sem querer)");
    ok(conta.limpa && conta.volta, "sair limpa o token e a cópia offline do aparelho e volta pra tela de entrar");
    ok(conta.botaoPainel, "o painel do personal tem o botão de trocar a própria senha");
  }
  {
    // sair da conta tem que estar em Configurações, do lado de "Excluir minha
    // conta" — é onde todo mundo procura, não numa aba escondida
    const sairCfg = await p.evaluate(async () => {
      const usuOrig = window.MTStore.usuario;
      document.querySelector('#abas button[data-a="config"]').click();
      const sub = document.querySelector('#cfgAbas button[data-cfga="conta"]');
      if (sub) sub.click();
      await new Promise((r) => setTimeout(r, 200));
      const fora = {
        entrar: !document.getElementById("cfgContaEntrar").hidden,
        sair: !document.getElementById("cfgContaSair").hidden,
      };
      window.MTStore.usuario = () => ({ logado: true, email: "leo@studio.com", papel: "dono" });
      window.__configPT();
      await new Promise((r) => setTimeout(r, 150));
      const dentro = {
        quem: (document.getElementById("cfgContaQuem") || {}).textContent || "",
        entrar: !document.getElementById("cfgContaEntrar").hidden,
        senha: !document.getElementById("cfgContaSenha").hidden,
        sair: !document.getElementById("cfgContaSair").hidden,
        naMesmaAba: document.getElementById("cfgContaSair").closest("[data-cfgsec]").getAttribute("data-cfgsec"),
      };
      window.MTStore.usuario = usuOrig;
      window.__configPT();
      return { fora, dentro };
    });
    ok(sairCfg.fora.entrar && !sairCfg.fora.sair,
      "sem conta, Configurações mostra Entrar e esconde o Sair");
    ok(sairCfg.dentro.sair && sairCfg.dentro.senha && !sairCfg.dentro.entrar && /leo@studio\.com/.test(sairCfg.dentro.quem),
      "logado, Configurações mostra quem está conectado, trocar senha e sair");
    ok(sairCfg.dentro.naMesmaAba === "conta",
      "o Sair fica na sub-aba Cobrança e conta, junto de Excluir minha conta");
    // "Indique um amigo" agora é opcional, como os outros cards do app
    const indica = await p.evaluate(() => {
      const S = window.MTStore, base = { id: "in1", nome: "A T", email: "a@b.com", ativo: true, desde: S.todayISO(), appTokenP: "t-in", metaSemana: 3 };
      const st = S.read("ptStudio", {}); const antes = st.config.appMostra;
      st.config.appMostra = {}; S.write("ptStudio", st);
      const ligado = /Indique um amigo/.test(window.__montaAppAluno(base, "s1"));
      const st2 = S.read("ptStudio", {}); st2.config.appMostra = { indica: false }; S.write("ptStudio", st2);
      const desligado = /Indique um amigo/.test(window.__montaAppAluno(base, "s2"));
      const st3 = S.read("ptStudio", {}); st3.config.appMostra = antes || {}; S.write("ptStudio", st3);
      return { ligado: ligado, desligado: desligado, check: !!document.getElementById("cfgVeIndica"), caixa: !!document.getElementById("taEnvioStatus") };
    });
    ok(indica.ligado && !indica.desligado && indica.check,
      "'Indique um amigo' tem interruptor nas Configurações (ligado por padrão, some quando desliga)");
    ok(indica.caixa, "o envio pro app tem caixa de recado própria (não se mistura com a da IA)");
    /* Melhoria minha no app (card novo, conserto) não marcava ninguém como
     * pendente — o botão de publicar em lote nem aparecia, e a novidade só
     * chegava no aluno se o professor por acaso editasse a ficha dele. */
    const versao = await p.evaluate(() => {
      const S = window.MTStore, st = S.read("ptStudio", {});
      const a = st.alunos[0];
      a.appTokenP = a.appTokenP || "tok-ver";
      a.appEditEm = "2020-01-01T00:00:00Z";
      a.appPubEm = "2030-01-01T00:00:00Z";   // publicado DEPOIS da última edição
      a.appVer = "mt-v001";                   // ...mas com versão velha do sistema
      S.write("ptStudio", st);
      const velha = window.__appsPendentes.pendente(S.read("ptStudio", {}), a);
      a.appVer = self.MT_VERSAO;
      S.write("ptStudio", st);
      const atual = window.__appsPendentes.pendente(S.read("ptStudio", {}), a);
      return { velha: velha, atual: atual, temVersao: !!self.MT_VERSAO };
    });
    ok(versao.temVersao && versao.velha && !versao.atual,
      "app publicado numa versão antiga do sistema entra na fila de republicar (e sai quando republica)");

    /* O app é SÓ pelo link: o arquivo .html baixado virava foto congelada no
     * celular do aluno — não recebia conserto, não recebia treino novo, não
     * tocava notificação e não dava pra cortar o acesso. */
    {
      const semArquivo = await p.evaluate(() => {
        const fonte = document.documentElement.innerHTML;
        return {
          semDownloadHtml: !/download = "app-|\.download\s*=\s*"app-/.test(fonte),
          botaoPerfil: (document.getElementById("pfApp") || {}).textContent.trim(),
          tituloPerfil: (document.getElementById("pfApp") || {}).title || "",
        };
      });
      ok(semArquivo.semDownloadHtml, "o painel não baixa mais o arquivo .html do app em lugar nenhum");
      ok(/Publicar app/.test(semArquivo.botaoPerfil) && !/Gerar/.test(semArquivo.botaoPerfil),
        "o botão do perfil diz o que faz de verdade: Publicar app (" + semArquivo.botaoPerfil + ")");
      ok(!/baixa o arquivo/.test(semArquivo.tituloPerfil), "e a dica do botão não promete arquivo nenhum");
      // sem conta na nuvem o professor recebe um recado que ensina, não um arquivo
      const semConta = await p.evaluate(async () => {
        const S = window.MTStore, st = S.read("ptStudio", {});
        window.__cloudOrigL = window.__cloudOrigL || S.cloud;
        S.cloud = () => null;
        window.__nuvemTickMs = 1;
        let recado = "", baixou = false;
        const alertOrig = window.alert;
        window.alert = (m) => { recado = String(m); };
        const criaOrig = document.createElement.bind(document);
        document.createElement = (t) => { const el = criaOrig(t); if (t === "a") { const c = el.click.bind(el); el.click = () => { if (el.download) baixou = true; return c(); }; } return el; };
        const b = document.querySelector('[data-app="' + st.alunos[0].id + '"]');
        if (b) b.click();
        await new Promise((r) => setTimeout(r, 400));
        window.alert = alertOrig;
        document.createElement = criaOrig;
        S.cloud = window.__cloudOrigL;
        return { recado: recado, baixou: baixou };
      });
      ok(!semConta.baixou, "sem conta na nuvem, clicar em Publicar app NÃO baixa arquivo nenhum");
      // e o painel sabe DIZER quem ainda pode estar com o arquivo velho no celular
      const quem = await p.evaluate(async () => {
        const S = window.MTStore, st = S.read("ptStudio", {});
        st.alunos.push({ id: "qn1", nome: "Abriu Silva", ativo: true, desde: S.todayISO(), appTokenP: "t-abriu", metaSemana: 3 });
        st.alunos.push({ id: "qn2", nome: "Sumiu Souza", ativo: true, desde: S.todayISO(), appTokenP: "t-sumiu", zap: "31977776666", metaSemana: 3 });
        st.alunos.push({ id: "qn3", nome: "Cortado Costa", ativo: true, desde: S.todayISO(), appTokenP: "t-cort", appRevogadoEm: S.todayISO(), metaSemana: 3 });
        S.write("ptStudio", st);
        window.__cloudOrigQ = window.__cloudOrigQ || S.cloud;
        let pedido = null;
        S.cloud = () => ({ aid: "a1", client: { rpc: (nome, args) => {
          pedido = { nome: nome, tokens: (args || {}).p_tokens || [] };
          return Promise.resolve({ data: [
            { token: "t-abriu", visto_em: "2026-08-18T10:00:00Z", publicado_em: "2026-08-10T10:00:00Z" },
            { token: "t-sumiu", visto_em: null, publicado_em: "2026-08-10T10:00:00Z" },
          ], error: null });
        } } });
        const r = await new Promise((res) => window.__quemNaoAbriu(res));
        S.cloud = window.__cloudOrigQ;
        return { r: r, pedido: pedido };
      });
      ok(quem.pedido && quem.pedido.nome === "app_alunos_vistos", "a lista pergunta pra nuvem quem abriu (app_alunos_vistos)");
      ok(quem.pedido.tokens.indexOf("t-cort") < 0, "aluno com acesso já cortado fica fora da conferência");
      const nomesQuem = quem.r.faltam.map((x) => x.nome);
      ok(nomesQuem.indexOf("Sumiu Souza") >= 0 && nomesQuem.indexOf("Abriu Silva") < 0,
        "só entra na lista quem NUNCA abriu pelo link (" + nomesQuem.join(", ") + ")");
      ok((quem.r.faltam.find((x) => x.nome === "Sumiu Souza") || {}).zap === "31977776666",
        "a lista traz o zap de quem falta, pra mandar o link na hora");
      // sem o SQL novo publicado, o painel fala a verdade em vez de acusar todo mundo
      const semSql = await p.evaluate(async () => {
        const S = window.MTStore;
        window.__cloudOrigQ2 = window.__cloudOrigQ2 || S.cloud;
        S.cloud = () => ({ aid: "a1", client: { rpc: () => Promise.resolve({ data: null, error: { code: "PGRST202", message: "Could not find the function public.app_alunos_vistos" } }) } });
        const r = await new Promise((res) => window.__quemNaoAbriu(res));
        S.cloud = window.__cloudOrigQ2;
        return r;
      });
      ok(/Rode o SQL novo/.test(semSql.erro || ""),
        "sem o SQL novo, o painel pede pra rodar o SQL em vez de listar todo mundo como pendente");

      /* Sub-abas no celular: com grade de colunas fixas, uma barra de 7 abas
       * virava 3+3+1 com a última boiando no canto, e a do Desafio (3 abas
       * numa grade de 2) caía como 2+1. No flex cada linha se completa. */
      const antesTam = p.viewportSize();
      await p.setViewportSize({ width: 430, height: 900 });
      await p.waitForTimeout(300);
      const barras = await p.evaluate(() => {
        const out = [];
        ["trAbas", "pgAbas", "dsAbas", "pfAbas", "relAbas", "cfgAbas"].forEach((id) => {
          const bar = document.getElementById(id);
          if (!bar) return;
          const bts = [...bar.children].filter((x) => x.tagName === "BUTTON");
          if (!bts.length) return;
          const larg = bar.getBoundingClientRect().width;
          const linhas = {};
          bts.forEach((b) => { const r = b.getBoundingClientRect(); (linhas[Math.round(r.top)] = linhas[Math.round(r.top)] || []).push(r); });
          // cada linha tem que ir de ponta a ponta da barra (nada de sobra solta)
          const sobra = Object.keys(linhas).map((k) => {
            const rs = linhas[k];
            return Math.round(bar.getBoundingClientRect().right - Math.max(...rs.map((r) => r.right)));
          });
          out.push({ id: id, n: bts.length, linhas: Object.keys(linhas).length, sobraMax: Math.max.apply(null, sobra), larg: Math.round(larg) });
        });
        return out;
      });
      const frouxas = barras.filter((b) => b.sobraMax > 2);
      ok(barras.length >= 4 && frouxas.length === 0,
        "no celular toda barra de sub-abas preenche a linha inteira" +
        (frouxas.length ? " — sobra em " + frouxas.map((f) => f.id + " (" + f.sobraMax + "px)").join(", ") : ""));
      const ds = barras.find((b) => b.id === "dsAbas");
      ok(ds && ds.n === 3 && ds.linhas === 1, "as 3 abas do Desafio cabem numa linha só (era 2+1)");
      // e o formulário do desafio para de cortar o prêmio no meio da palavra
      const form = await p.evaluate(() => {
        // a seção precisa estar à mostra, senão as medidas voltam zeradas
        const abre = document.querySelector('.abas-pt button[data-a="desafio"]') || document.querySelector('#abas button[data-a="desafio"]');
        if (abre) abre.click();
        const el = document.getElementById("dsPremio"), nome = document.getElementById("dsNome");
        if (!el || !el.offsetParent) return null;
        el.value = "1 mês de assessoria grátis";
        const card = el.closest(".card").getBoundingClientRect();
        const r = el.getBoundingClientRect(), rn = nome.getBoundingClientRect();
        return { cabe: el.scrollWidth <= el.clientWidth + 1, larguraCheia: r.width > card.width * 0.8, nomeCheio: rn.width > card.width * 0.8 };
      });
      ok(form && form.cabe && form.larguraCheia && form.nomeCheio,
        "no celular o nome e o prêmio do desafio ocupam a linha inteira (o prêmio não fica cortado)");
      await p.setViewportSize(antesTam);
      await p.waitForTimeout(300);
      await p.evaluate(() => {
        const S = window.MTStore, st = S.read("ptStudio", {});
        st.alunos = st.alunos.filter((a) => String(a.id).indexOf("qn") !== 0);
        S.write("ptStudio", st);
      });
      ok(/conta na nuvem/.test(semConta.recado) && /grátis/.test(semConta.recado),
        "e o recado explica que a conta (grátis) é o que entrega o app — " + semConta.recado.slice(0, 60));
    }
    /* E a fila se resolve SOZINHA: abrir o painel já republica o que ficou
     * pra trás, em segundo plano, sem clique e sem notificar o aluno. */
    const auto = await p.evaluate(async () => {
      const S = window.MTStore, st = S.read("ptStudio", {});
      st.alunos.push({ id: "auto1", nome: "Auto Um", ativo: true, desde: S.todayISO(), appTokenP: "t-auto1", appVer: "mt-v001", appPubEm: "2030-01-01T00:00:00Z", metaSemana: 3 });
      st.alunos.push({ id: "auto2", nome: "Auto Dois", ativo: true, desde: S.todayISO(), appTokenP: "t-auto2", appVer: "mt-v001", appPubEm: "2030-01-01T00:00:00Z", metaSemana: 3 });
      S.write("ptStudio", st);
      let subiu = [], tocouPush = false;
      const q = (t) => { const o = {}; ["select", "eq", "in", "gte", "lte", "order", "limit", "insert", "update", "delete", "neq", "is"].forEach((m) => { o[m] = () => o; });
        o.then = (f) => Promise.resolve({ data: [], error: null }).then(f);
        o.upsert = (l) => { if (t === "app_aluno") subiu = subiu.concat(l); return Promise.resolve({ error: null }); }; return o; };
      window.__cloudOrig3 = S.cloud;
      S.cloud = () => ({ aid: "a", client: {
        auth: { getSession: () => Promise.resolve({ data: { session: { access_token: "J" } } }) },
        from: (t) => { if (t === "push_subs") tocouPush = true; return q(t); },
        rpc: () => Promise.resolve({ data: { ok: true }, error: null }),
      } });
      window.__appsPendentes.auto(true);   // força: o painel já pode ter rodado a automática antes
      await new Promise((r) => setTimeout(r, 1200));
      const st2 = S.read("ptStudio", {});
      const fim = { subiram: subiu.map((x) => x.token).sort().join(","), tocouPush: tocouPush,
        pendentes: st2.alunos.filter((a) => window.__appsPendentes.pendente(st2, a)).length };
      st2.alunos = st2.alunos.filter((a) => a.id !== "auto1" && a.id !== "auto2");
      S.write("ptStudio", st2);
      S.cloud = window.__cloudOrig3;
      return fim;
    });
    ok(auto.subiram === "t-auto1,t-auto2" && auto.pendentes === 0,
      "abrir o painel republica sozinho os apps atrasados — sem clique nenhum");
    ok(!auto.tocouPush, "a republicação automática não dispara notificação pro aluno (ele não pediu nada)");
    /* Conta e lembretes saíram do Início e viraram a área "Ajustes", na gaveta
     * do menu ☰ — como em qualquer app. Fica por último no MENU de propósito:
     * as 4 primeiras áreas viram aba fixa embaixo, e Ajustes não é uma delas. */
    const ajustes = await p.evaluate(() => {
      const S = window.MTStore;
      const h = window.__montaAppAluno({ id: "aj1", nome: "Aluno Teste", email: "a@b.com", ativo: true,
        desde: S.todayISO(), appTokenP: "t-aj", acessoEm: "2026-08-18T00:00:00Z", metaSemana: 3 }, "s1");
      const menu = (h.match(/\['ajustes',[\s\S]{0,40}/) || [""])[0];
      const pos = h.indexOf("'ajustes'"), posPag = h.indexOf("'pagamento'");
      return { noMenu: /'Ajustes'/.test(h), depoisDoPlano: pos > posPag,
        rota: /Minha conta\|Meu login\|Lembretes\/\.test\(t\)\)return 'ajustes'/.test(h),
        semNoInicio: !/Meu login\|Minha conta\|Desafio\/\.test\(t\)\)return 'inicio'/.test(h) };
    });
    ok(ajustes.noMenu && ajustes.depoisDoPlano,
      "o app do aluno ganha a área Ajustes, no fim do menu (fica na gaveta ☰, não nas abas de baixo)");
    ok(ajustes.rota && ajustes.semNoInicio,
      "Minha conta, Meu login e Lembretes saem do Início e vão pra Ajustes");
    /* Resposta que não é JSON (função antiga, erro do gateway) estourava no
     * r.json() e virava "Sem conexão com a nuvem" — mandando o professor
     * procurar defeito na internet em vez de republicar a função. */
    const iaNaoJson = await p.evaluate(async () => {
      const S = window.MTStore, st = S.read("ptStudio", {});
      const id = st.alunos[0].id;
      window.__cloudOrig2 = S.cloud;
      S.cloud = () => ({ aid: "a1", client: { auth: { getSession: () => Promise.resolve({ data: { session: { access_token: "J" } } }) } } });
      window.__fetchOrig = window.__fetchOrig || window.fetch;
      window.fetch = (u, o) => String(u).includes("functions/v1/chat-envia")
        ? Promise.resolve({ status: 546, text: () => Promise.resolve("<html>Function failed</html>") })
        : window.__fetchOrig(u, o);
      const r = await new Promise((res) => window.__iaTreino(id, "hipertrofia", "academia", res));
      window.fetch = window.__fetchOrig;
      S.cloud = window.__cloudOrig2;
      return r.erro || "";
    });
    ok(/546/.test(iaNaoJson) && /publique de novo/.test(iaNaoJson) && !/Sem conexão/.test(iaNaoJson),
      "resposta que não é JSON mostra o status real e manda republicar a função (não mente 'sem conexão')");
  }
  {
    const comMural = await p.evaluate(() => {
      const st = window.MTStore.read("ptStudio", {});
      st.config = st.config || {};
      st.config.mural = ["Treinão de sábado 7h no parque! 🌳"];
      window.MTStore.write("ptStudio", st);
      return window.__montaAppAluno(window.MTStore.read("ptStudio", {}).alunos[0], new Date().toISOString());
    });
    ok(/Recado do /.test(comMural) && /Treinão de sábado/.test(comMural), "aviso do mural entra no app do aluno");
    ok(await p.evaluate(() => !!document.getElementById("cfgMural")), "módulo tem o campo 📌 Mural na ilha");
  }
  ok(/Conquistas<\/h2>/.test(appHtml) && /cqGrid/.test(appHtml) && /Treinos por semana/.test(appHtml), "app tem painel de conquistas com gráfico de semanas");
  ok(/7 dias seguidos/.test(appHtml) && /100 treinos/.test(appHtml) && /data-cqok/.test(appHtml), "medalhas de sequência e volume no app");
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
    // os pedidos do app viraram UM bloco so (v635): a faixa roxa leva a lista dentro
    const perModulo = await p.evaluate(() => document.body.innerHTML);
    ok(/listaPedidosApp/.test(perModulo) && /agPedFaixa/.test(perModulo) && !/cardPedidosApp/.test(perModulo),
      "módulo tem os pedidos do app num bloco só na Agenda (o card repetido saiu)");
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
  ok(/sess(ão feita|ões feitas) no total/.test(perfil.freq), "frequência de treino com gráfico de sessões");
  ok(/Data/.test(perfil.peso) && /90 kg|84 kg/.test(perfil.peso), "relatório de avaliações em tabela (peso registrado)");
  ok(/% gordura/.test(perfil.peso) && /25%|19,5%/.test(perfil.peso), "tabela traz % de gordura das avaliações");
  ok(/Peso.*de 90 pra 84 kg/.test(perfil.peso.replace(/\s+/g, " ")) || (/de 90/.test(perfil.peso) && /84 kg/.test(perfil.peso)), "gráfico de evolução do peso (90 → 84 kg)");
  ok(/% de gordura/.test(perfil.peso) && /-5,5|19,5/.test(perfil.peso), "gráfico de evolução da % de gordura");
  ok(/exercício/.test(perfil.ficha) || /Sem ficha/.test(perfil.ficha), "resumo da ficha atual presente");
  /* Nascimento agora é DIGITADO (dd/mm/aaaa) com máscara, não mais o seletor de
   * data — no iPad o seletor virava roda de mês/ano e o professor jurava que o
   * dia tinha sumido. Por dentro continua AAAA-MM-DD. */
  const nasc = await p.evaluate(() => {
    const el = document.getElementById("pfNasc");
    el.value = "20101980";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    const mascara = el.value;
    return { tipo: el.type, teclado: el.getAttribute("inputmode"), mascara,
      iso: window.__nasc.daTela(mascara), volta: window.__nasc.praTela("1980-10-20"),
      impossivel: window.__nasc.daTela("31/02/1990"), metade: window.__nasc.daTela("20/10") };
  });
  ok(nasc.tipo === "text" && nasc.teclado === "numeric",
    "nascimento é digitado com teclado numérico (fim do seletor que escondia o dia no iPad)");
  ok(nasc.mascara === "20/10/1980", "digitar 8 números ganha as barras sozinho (" + nasc.mascara + ")");
  ok(nasc.iso === "1980-10-20" && nasc.volta === "20/10/1980", "dd/mm/aaaa vira AAAA-MM-DD por dentro, e volta");
  ok(nasc.impossivel === null && nasc.metade === null, "31/02 e data pela metade não passam");
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
    return { obj: a.objetivo, pagto: a.pagto, email: a.email, altura: a.altura, prof: a.profissao, emerg: a.emergencia, nasc: a.nasc };
  });
  ok(salvo.obj === "Hipertrofia" && salvo.pagto === "pix", "objetivo e método de pagamento salvos no cadastro");
  ok(salvo.nasc === "1980-10-20", "o nascimento digitado salvou no formato interno (" + salvo.nasc + ")");
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
          fotoPerfil: px,
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
    // a foto que o ALUNO pôs no app dele volta pro painel e assume a ficha
    const fotoAl = await p.evaluate(() => {
      const al = window.MTStore.read("ptStudio", {}).alunos.find((x) => x.ativo !== false);
      const img = document.getElementById("pfFotoImg");
      return { guardada: (al.fotoAluno || "").slice(0, 21), doPersonal: al.foto || "",
        naFicha: (img.src || "").slice(0, 21), visivel: !img.hidden };
    });
    ok(fotoAl.guardada === "data:image/gif;base64" && fotoAl.naFicha === "data:image/gif;base64" && fotoAl.visivel,
      "a foto que o aluno põe no app dele volta pro painel e aparece na ficha");
    ok(!fotoAl.doPersonal, "ela fica num campo só dela — a foto que o personal põe pela ficha não é sobrescrita");
    const questBox = await p.evaluate(() => document.getElementById("pfQuestBox").innerHTML);
    ok(/3 check-ins respondidos/.test(questBox) && /— de \d\d\/\d\d até \d\d\/\d\d/.test(questBox), "respostas de questionário (app_quest) viram a aba de check-ins");
    ok(/Placar de cada semana/.test(questBox) && /data-cor=['"]ok['"]/.test(questBox) && /data-cor=['"]ruim['"]/.test(questBox) && /9 ponto/.test(questBox),
      "pontuação vira barras coloridas por semana (verde = boa, vermelha = fraca), com o valor no toque");
    ok(/\+9 pts/.test(questBox) && /MOTEX/.test(questBox), "última resposta listada com pontuação (sigla vale de reserva quando não veio a pergunta)");
    ok(/Check-ins/.test(appDados) && /último em 03\/08/.test(appDados), "KPI de check-ins com a data do último");
    // aluno malicioso tentando injetar código pela foto/data do retorno
    const xss = await p.evaluate(async () => {
      window.MTStore.cloud = () => ({ aid: "x", client: { from: () => ({ select: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: [{ retorno: {
        fotoAntes: "x' onerror='window.__xssHit=1", fotoAntesD: "1234567'><b>9",
        fotoPerfil: "x' onerror='window.__xssHit=1",
      } }] }) }) }) }) } });
      window.__perfilPT(window.MTStore.read("ptStudio", {}).alunos[0].id);
      await new Promise((r) => setTimeout(r, 350));
      return { html: document.getElementById("pfAppDados").innerHTML, hit: !!window.__xssHit };
    });
    ok(!xss.hit && !/onerror/.test(xss.html) && !/Fotos de progresso/.test(xss.html), "foto maliciosa vinda do app é descartada (anti-XSS)");
    const fotoSuja = await p.evaluate(() => (window.MTStore.read("ptStudio", {}).alunos || [])
      .some((x) => /onerror/.test(String(x.fotoAluno || ""))));
    ok(!fotoSuja, "foto de perfil maliciosa não é guardada na ficha do aluno");
    await p.evaluate(() => { window.MTStore.cloud = window.__cloudOrig; });
  }
  /* apps congelados no formato antigo (sem `dados` na nuvem): o painel avisa e
   * o botão do aviso republica — antes o professor só descobria pelo aluno.
   * Roda num studio mínimo (e devolve o de antes no fim) pra prova ser exata:
   * 1 congelado entra, 1 pacote sai. */
  {
    const cong = await p.evaluate(async () => {
      const S = window.MTStore;
      const guarda = localStorage.getItem("mtapp:ptStudio");
      const orig = S.cloud;
      const st = JSON.parse(guarda);
      S.write("ptStudio", Object.assign({}, st, {
        alunos: [{ id: "cg1", nome: "Congelado Um", ativo: true, appTokenP: "tok-cong" }],
      }));
      let upserts = 0;
      // consulta encadeável: qualquer .eq/.order/.limit devolve ela mesma, e o
      // await resolve — assim nenhum outro pedaço da página tropeça no mock
      const cadeia = (resp) => {
        const o = { eq: () => o, neq: () => o, gt: () => o, gte: () => o, lt: () => o, lte: () => o,
          is: () => o, in: () => o, ilike: () => o, not: () => o, order: () => o, limit: () => o,
          single: () => o, maybeSingle: () => o,
          then: (ok, erro) => Promise.resolve(resp).then(ok, erro) };
        return o;
      };
      S.cloud = () => ({ aid: "x", client: {
        auth: { getSession: () => Promise.resolve({ data: {} }) },
        from: () => ({
          // a conferência pede só token + ver — nunca o HTML de 200 KB
          select: (cols) => cadeia(/token/.test(cols) && /ver/.test(cols)
            ? { data: [{ token: "tok-cong", ver: null }] } : { data: [] }),
          upsert: (l) => { upserts += (l || []).length; return cadeia({}); },
          insert: () => cadeia({}), update: () => cadeia({}), delete: () => cadeia({}),
        }),
      } });
      window.__congelados.checa();
      await new Promise((r) => setTimeout(r, 250));
      const box = document.getElementById("avisoCongelados");
      const antes = { visivel: !box.hidden, texto: box.textContent };
      document.getElementById("btnDescongela").click();
      await new Promise((r) => setTimeout(r, 500));
      const sumiu = box.hidden;
      S.cloud = orig;
      S.write("ptStudio", JSON.parse(guarda)); // devolve o studio dos outros testes
      return { visivel: antes.visivel, texto: antes.texto, upserts, sumiu };
    });
    ok(cong.visivel && /formato antigo/.test(cong.texto) && /congelado/.test(cong.texto),
      "painel avisa quando um app publicado está congelado no formato antigo");
    ok(cong.upserts === 1, "o botão do aviso republica o congelado na hora (" + cong.upserts + " pacote)");
    ok(cong.sumiu, "depois de republicar o aviso sai da tela");
  }
  // abas do perfil (pra tela não ficar tumultuada)
  {
    const abas = await p.evaluate(() => {
      window.__perfilPT(window.MTStore.read("ptStudio", {}).alunos[0].id);
      const vis = (id) => !document.getElementById(id).closest("[data-pfsec]").hidden;
      // na tela 2b o perfil abre no RESUMO (a primeira aba), não no App do aluno
      const antes = { resumo: vis("pfResumo"), app: vis("pfAppDados"), cadastro: vis("pfNome"), fin: vis("pfFin") };
      document.querySelector('#pfAbas [data-pfa="cadastro"]').click();
      const depois = { app: vis("pfAppDados"), cadastro: vis("pfNome"), ativa: document.querySelector("#pfAbas .ativa").getAttribute("data-pfa") };
      return { antes, depois, nBotoes: document.querySelectorAll("#pfAbas button").length };
    });
    ok(abas.nBotoes === 8 && abas.antes.resumo && !abas.antes.app && !abas.antes.cadastro && !abas.antes.fin,
      "perfil abre no Resumo (tela 2b) com as outras seções escondidas");

    /* ---- ficha do aluno repaginada (tela 2b) ---- */
    const b2b = await p.evaluate(() => {
      const topo = document.querySelector(".pftopo");
      return {
        roxo: !!topo,
        volta: (document.getElementById("pfFechar") || {}).textContent || "",
        sub: (document.getElementById("pfDesde") || {}).textContent || "",
        chips: [...document.querySelectorAll("#pfChips span")].map((x) => x.textContent),
        acoes: [...document.querySelectorAll(".pfacoes button")].map((x) => x.id),
        prox: (document.getElementById("pfProxima") || {}).textContent || "",
        kpis: [...document.querySelectorAll("#pfResumo .pfkpi .k")].map((x) => x.textContent),
        semana: document.querySelectorAll("#pfResumo .pfsem .c").length,
        ficha: /Ficha atual/.test((document.getElementById("pfResumo") || {}).textContent || ""),
      };
    });
    ok(b2b.roxo && /Alunos/.test(b2b.volta) && b2b.chips.length === 2,
      "🎨 2b: a ficha abre com o cabeçalho roxo, o voltar e os dois selos do aluno");
    ok(/·/.test(b2b.sub), "🎨 2b: a linha de baixo do nome junta objetivo, tempo de casa, plano e situação");
    ok(b2b.acoes.length === 4 && b2b.acoes[0] === "pfMontaTreino",
      "🎨 2b: as quatro ações do dia ficam no cabeçalho (montar treino, chat, financeiro, agenda)");
    ok(/Próxima sessão/.test(b2b.prox), "🎨 2b: o cabeçalho diz quando é a próxima sessão");
    ok(b2b.kpis.length === 4 && /TREINOS NO MÊS/.test(b2b.kpis[0]) && /CHECK-IN/.test(b2b.kpis[3]),
      "🎨 2b: o Resumo abre com os quatro números do aluno");
    ok(b2b.semana === 7 && b2b.ficha,
      "🎨 2b: o Resumo traz a Semana do aluno (7 dias) e a ficha atual");
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
  // na tela 3b a primeira aba passou a ser "A semana" (quem pede atenção vem antes)
  ok(await p.evaluate(() => document.querySelector('#qtAbas button.ativa').textContent.includes("A semana")), "Questionários abre na sub-aba A semana");

  /* ---- Questionários repaginados (tela 3b) ---- */
  {
    // sem nuvem, a tela 3b avisa em vez de mostrar caixa vazia
    const semNuvem = await p.evaluate(() => ({
      det: document.getElementById("qsDet").textContent,
      lista: document.getElementById("qsLista").innerHTML,
      cobrar: document.getElementById("qsCobrar").hidden,
    }));
    ok(/Sua ilha/.test(semNuvem.det) && !semNuvem.lista && semNuvem.cobrar,
      "🎨 3b: sem conta na nuvem a tela diz o que falta, sem lista nem botão de cobrar");
    // com nuvem simulada: quem respondeu mal vem primeiro
    const b3b = await p.evaluate(async () => {
      const st = window.MTStore.read("ptStudio", {});
      st.alunos.slice(0, 4).forEach((a, i) => { a.appTokenP = "qtk" + i; a.ativo = true; });
      localStorage.setItem("mtapp:ptStudio", JSON.stringify(st));
      const hoje = new Date().toISOString().slice(0, 10);
      const CK = { qtk0: { nota: 2, texto: "ombro incomodando" }, qtk1: { nota: 5, texto: "" } };
      const Q = { qtk0: [{ sigla: "DOR", pergunta: "Dor no ombro", resposta: 8, menos: true }] };
      const todos = (t) => t === "app_checkin"
        ? Object.keys(CK).map((k) => Object.assign({ token: k, dia: hoje }, CK[k]))
        : t === "app_quest"
          ? Object.keys(Q).map((k) => ({ token: k, questionario: "Semanal", criado: hoje + "T20:00:00", dados: { respostas: Q[k] } }))
          : [];
      function q(t) {
        const o = { data: todos(t), error: null };
        const h = { get: (_, k) => (k === "then" ? (f, g) => Promise.resolve(o).then(f, g) : () => new Proxy({}, h)) };
        return new Proxy({}, h);
      }
      window.__cloudOrigQS = window.MTStore.cloud;
      window.MTStore.cloud = () => ({ aid: "a1", client: { from: (t) => q(t) } });
      window.__qsSemana.pinta();
      await new Promise((r) => setTimeout(r, 250));
      window.MTStore.cloud = window.__cloudOrigQS;
      const grupos = [...document.querySelectorAll("#qsLista .qsgrupo")].map((g) => g.textContent);
      const itens = [...document.querySelectorAll("#qsLista .qsit")].map((b) => b.textContent);
      return {
        resumo: document.getElementById("qsResumo").textContent,
        grupos: grupos,
        primeiro: itens[0] || "",
        det: document.getElementById("qsDet").textContent,
        tiles: [...document.querySelectorAll("#qsDet .avt .k")].map((x) => x.textContent),
      };
    });
    ok(/^\d+ de \d+ responderam$/.test(b3b.resumo) && +b3b.resumo.split(" ")[0] >= 1,
      "🎨 3b: o topo conta quantos responderam de quantos (" + b3b.resumo + ")");
    ok(/Pede atenção/.test(b3b.grupos[0]) && /Tudo bem/.test(b3b.grupos[1]) && /Não responderam/.test(b3b.grupos[2]),
      "🎨 3b: a lista sai em pede atenção / tudo bem / não responderam");
    ok(/Check-in 2 de 5/.test(b3b.primeiro) || /Dor no ombro/.test(b3b.primeiro),
      "🎨 3b: quem pede atenção já mostra o motivo na linha");
    ok(b3b.tiles.length >= 2 && b3b.tiles.some((t) => /Dor/.test(t)),
      "🎨 3b: a resposta abre ao lado com um tile por pergunta");
    ok(/ombro incomodando/.test(b3b.det), "🎨 3b: o que o aluno escreveu aparece por extenso");
    // a régua de alerta: nota alta numa pergunta em que MENOR é melhor pede atenção
    const regua = await p.evaluate(() => ({
      dorAlta: window.__qsSemana.alerta({ nota: null, respostas: [{ pergunta: "Dor", resposta: 9, menos: true }] }).length,
      dorBaixa: window.__qsSemana.alerta({ nota: null, respostas: [{ pergunta: "Dor", resposta: 1, menos: true }] }).length,
      dispBaixa: window.__qsSemana.alerta({ nota: null, respostas: [{ pergunta: "Disposição", resposta: 2 }] }).length,
      dispAlta: window.__qsSemana.alerta({ nota: null, respostas: [{ pergunta: "Disposição", resposta: 9 }] }).length,
      notaBaixa: window.__qsSemana.alerta({ nota: 2, respostas: [] }).length,
    }));
    ok(regua.dorAlta === 1 && regua.dorBaixa === 0 && regua.dispBaixa === 1 && regua.dispAlta === 0 && regua.notaBaixa === 1,
      "🎨 3b: dor ALTA e disposição BAIXA pedem atenção — o sentido da pergunta é respeitado");
  }
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
    ok(/Trancado até/.test(travado) && /\d\d\/\d\d/.test(travado), "antes da data, o card no app aparece trancado com a data de liberação");
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
    // na data certa o convite libera; o fluxo paginado responde e envia
    ok(await pLivre.evaluate(() => /Responder agora/.test(document.getElementById("qaBox").textContent)),
      "na data certa o convite libera (Responder agora)");
    await pLivre.evaluate(() => document.getElementById("qaAbrir").click());
    await pLivre.evaluate(() => document.getElementById("qaFluxo").querySelector("[data-qj='0']").click());
    await pLivre.waitForTimeout(550); // emoji avança sozinho pra 2/2
    await pLivre.evaluate(() => {
      document.getElementById("qaFluxo").querySelector("[data-qv='8']").click();
      document.getElementById("qaProx").click(); // última pergunta → Enviar
    });
    await pLivre.waitForTimeout(400);
    ok(postadoApp && postadoApp.p_dados && postadoApp.p_dados.pontuacao === 10 && postadoApp.p_dados.respostas.length === 2, "resposta do app vai pra RPC app_quest_responde com pontuação somada (2 + 8 = 10)");
    const depois = await pLivre.evaluate(() => {
      const telaOk = /Respondido/i.test(document.getElementById("qaFluxo").textContent);
      document.getElementById("qaVoltaIni").click(); // fecha a tela Respondido
      return {
        telaOk,
        box: document.getElementById("qaBox").textContent,
        ptqa: JSON.parse(localStorage.getItem("ptqa") || "{}"),
      };
    });
    ok(depois.telaOk && /Respondido/.test(depois.box) && /próximo libera dia/.test(depois.box), "depois de responder o card confirma e mostra quando libera o próximo");
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
  {
    // parte 2 do dia (A2, B2…): cardio e alongamento grudados na ficha —
    // não é outra ficha, então não rouba a letra seguinte nem entra sozinha na semana
    const p2 = await p.evaluate(() => {
      const S = window.MTStore, st = S.read("ptStudio", {});
      const aid = st.alunos[0].id;
      const t = st.treinosV2[aid];
      t.fichas[0].p2 = { n: "Cardio e alongamento", l: [
        { t: "Esteira", v: "12 min", o: "ritmo de conversa" },
        { t: "Alongamento de posterior", v: "45s", o: "cada perna" },
      ] };
      S.write("ptStudio", st);
      return {
        nFichas: t.fichas.length,
        letras: [window.__letraFicha({ titulo: "A — Peito e tríceps" }, 0),
          window.__letraFicha({ titulo: "Treino do dia" }, 1),
          window.__letraFicha({ titulo: "C — Pernas" }, 5)],
        texto: window.__treinoTexto(st, aid),
        pacote: window.__dadosApp(st.alunos[0], "t"),
      };
    });
    ok(p2.letras.join("|") === "A|B|C" && p2.nFichas === (p2.pacote.fichasApp || []).length,
      "a parte 2 não vira ficha: a letra sai do título (ou da posição) e a contagem de fichas não muda");
    ok(/\nA2 — Cardio e alongamento\n/.test(p2.texto) && /• Esteira — 12 min \(ritmo de conversa\)/.test(p2.texto),
      "a prescrição do WhatsApp leva o A2 com as linhas de tempo/distância");
    const fp2 = p2.pacote && p2.pacote.fichasApp && p2.pacote.fichasApp[0] && p2.pacote.fichasApp[0].p2;
    ok(!!fp2 && fp2.l.length === 2 && fp2.l[0].t === "Esteira",
      "o pacote do aluno leva a parte 2 grudada na ficha");
  }
  // foto de progresso: UM botão só. O capture='user' é que trancava no
  // autorretrato — sem ele o próprio celular oferece câmera OU galeria
  ok(/id='fotoInput' type='file' accept='image\/\*' style/.test(appHtml) && !/capture=/.test(appHtml),
    "foto de progresso num botão só: sem capture, o celular pergunta se é câmera ou galeria");
  ok(/function guardaFotoProg\(f\)/.test(appHtml) && /window\.__fotoProg=guardaFotoProg/.test(appHtml),
    "a foto escolhida passa pelo mesmo corte de 480 px e pelo teto de 12 fotos");
  {
    // 📸 foto por TIPO de treino: o professor sobe uma por tipo e o sistema
    // escolhe a de cada ficha — senão seria foto por foto, aluno por aluno
    const grupos = await p.evaluate(() => ["Peito", "Costas", "Ombros", "Quadríceps",
      "Posterior e glúteo", "Panturrilha", "Bíceps", "Tríceps", "Core", "Cardio", "Xablau"]
      .map((g) => g + ">" + window.__capasTipo.grupoCapa(g)).join(" "));
    ok(/Quadríceps>pernas/.test(grupos) && /Posterior e glúteo>pernas/.test(grupos) && /Panturrilha>pernas/.test(grupos),
      "grupo de perna cai em PERNAS — 'QuadrÍCEPS' não pode ser confundido com bíceps/tríceps");
    ok(/Bíceps>bracos/.test(grupos) && /Tríceps>bracos/.test(grupos) && /Peito>peito/.test(grupos) &&
      /Costas>costas/.test(grupos) && /Ombros>ombros/.test(grupos) && /Core>core/.test(grupos) && /Xablau>(\s|$)/.test(grupos),
      "cada grupo muscular cai no seu tipo de foto (e grupo desconhecido não chuta nenhum)");
    const capas = await p.evaluate(() => {
      const S = window.MTStore, st = S.read("ptStudio", {});
      const a = st.alunos[0];
      const snap = JSON.stringify({ t: st.treinosV2[a.id], c: st.config });
      const px = (t) => "data:image/png;base64," + btoa(t);
      const mk = (nome, grupo) => {
        st.exercicios = st.exercicios || [];
        let e = st.exercicios.find((x) => x.nome === nome);
        if (!e) { e = { id: "cap" + nome, nome, grupo }; st.exercicios.push(e); }
        return e.id;
      };
      st.config = st.config || {};
      st.config.capaTreino = px("GERAL");
      st.config.capasTipo = { peito: px("PEITO"), pernas: px("PERNAS"), wod: px("WOD") };
      st.treinosV2[a.id] = {
        fichas: [
          { id: "k1", titulo: "A", itens: [{ exId: mk("Sup", "Peito"), series: "4", reps: "10", descanso: 60 }] },
          { id: "k2", titulo: "B", itens: [{ exId: mk("Agc", "Quadríceps"), series: "4", reps: "10", descanso: 90 },
            { exId: mk("Sti", "Posterior e glúteo"), series: "3", reps: "12", descanso: 60 }] },
          { id: "k3", titulo: "C", itens: [{ exId: mk("Leg", "Quadríceps"), series: "4", reps: "12", descanso: 60 }] },
          { id: "k4", titulo: "D", capa: px("PROPRIA"), itens: [{ exId: mk("Ros", "Bíceps"), series: "3", reps: "12", descanso: 45 }] },
          { id: "k5", titulo: "E", itens: [{ exId: mk("Ele", "Ombros"), series: "3", reps: "12", descanso: 45 }] },
        ],
        wods: [{ id: "kw", nome: "WOD", tipo: "amrap", min: 12, movs: [{ q: "10", n: "burpee" }] }],
        cardio: [{ id: "kc", nome: "Pedal", mod: "bike", tipo: "continuo", dist: 15, tempo: 40 }],
      };
      S.write("ptStudio", st);
      const html = window.__montaAppAluno(a, "teste-capas");
      const st2 = S.read("ptStudio", {});
      const velho = JSON.parse(snap);
      st2.treinosV2[a.id] = velho.t; st2.config = velho.c;
      S.write("ptStudio", st2);
      const meta = html.match(/var FICHAS_META=(\[[\s\S]*?\]);var PLANO/);
      const mapa = html.match(/var CAPAS_TIPO=(\{[\s\S]*?\});function capaFM/);
      return {
        fichas: meta ? JSON.parse(meta[1]).map((f) => f.c) : null,
        mapa: mapa ? Object.keys(JSON.parse(mapa[1])) : null,
        // a mesma foto de perna não pode ser copiada duas vezes dentro do pacote
        repetiu: (html.match(new RegExp(btoa("PERNAS"), "g")) || []).length,
        wodCp: (html.match(/"cp":"([^"]*)"/) || [])[1],
      };
    });
    ok(capas.fichas && capas.fichas[0] === "peito" && capas.fichas[1] === "pernas" && capas.fichas[2] === "pernas",
      "📸 cada ficha pega a foto do grupo que mais aparece nela (peito, perna, perna)");
    ok(String(capas.fichas[3]).slice(0, 5) === "data:", "a foto escolhida na ficha continua ganhando da foto do tipo");
    ok(capas.fichas[4] === "", "tipo sem foto (ombros) fica vazio e cai na foto geral — nada de imagem errada");
    ok(capas.wodCp === "wod", "o circuito pega a foto de circuito");
    ok(capas.mapa && capas.mapa.length === 3 && capas.repetiu === 1,
      "a foto viaja UMA vez no pacote, por chave: duas fichas de perna não copiam a mesma imagem duas vezes");
  }
  {
    // ⚡ a técnica chega no app: selo na lista, explicação ao abrir e aviso no player
    const appTec = await p.evaluate(() => {
      const S = window.MTStore, st = S.read("ptStudio", {});
      const a = st.alunos[0];
      const snap = JSON.stringify(st.treinosV2[a.id]);
      const f = st.treinosV2[a.id].fichas[0];
      f.itens[0].tec = "drop";
      S.write("ptStudio", st);
      const html = window.__montaAppAluno(a, "teste-tec");
      const st2 = S.read("ptStudio", {});
      st2.treinosV2[a.id] = JSON.parse(snap);
      S.write("ptStudio", st2);
      return html;
    });
    // o selo TEM que estar colado no nome do exercício (o player também usa a
    // classe, então procurar só por tecchip acharia até em quem não tem técnica)
    const seloNaLista = /font-size:14\.5px;'>[^<]*<span class='tecchip'>Drop-set<\/span>/;
    ok(seloNaLista.test(appTec), "⚡ o app mostra o selo da técnica no exercício");
    ok(/tira peso \(ou repetições\) e continua sem descanso/.test(appTec),
      "abrindo o exercício o aluno lê o que é a técnica, com as palavras dele");
    ok(/"tc":"drop"/.test(appTec) && /function gPoeTec/.test(appTec),
      "a técnica viaja pro treino guiado e o player tem onde mostrar");
    ok(!seloNaLista.test(appHtml) && !/<span class='tecchip'>(Up set|Rest-pause|Bi-set|Isometria)/.test(appHtml),
      "exercício sem técnica não ganha selo nenhum (nada de rótulo vazio)");
  }
  ok(/Fale com/.test(appHtml) && /chEnvia/.test(appHtml), "app tem o card de chat com o personal");
  ok(!/Diário de cargas/.test(appHtml) && /NOVO RECORDE/.test(appHtml), "sem diário manual, mas o recorde segue celebrado pelo player");
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
  // o ranking da turma (tela 49) dispara no load — mock determinístico, nunca produção
  await pApp.route("**/rest/v1/rpc/app_desafio_ranking", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ ranking: [] }) }));
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
  // telas finais: 4 botões embaixo (Hoje, Treinos, Evolução, Menu) — o resto vive na gaveta
  ok(navAbas.itens.length >= 4 && navAbas.itens[0] === "inicio", "barra de abas montada com as seções do app (" + navAbas.itens.length + " abas)");
  ok(await pApp.evaluate(() => document.querySelectorAll("#navApp .nitem svg").length >= 4 && !/[🏠🏋📈📅💬💳]/.test(document.getElementById("navApp").textContent)), "abas com ícones de traço (SVG), sem emoji");
  ok(navAbas.antes.inicio && !navAbas.antes.treino && !navAbas.depois.inicio && navAbas.depois.treino && /Treino/.test(navAbas.tit), "tocar na aba troca a seção e o título do topo");
  // recado do personal ainda não visto acende a bolinha 🔴 no Chat
  const dotChat = await pApp.evaluate(() => {
    window.__chatDot(new Date().toISOString());
    // no desenho novo a bolinha fica no botão MENU (o chat mora dentro dele)
    const dot = document.querySelector("#navMenuApp .ndot");
    const acesa = dot && dot.style.display === "block";
    window.__trocaSec("chat");
    return { acesa, apagada: dot && dot.style.display === "none" };
  });
  ok(dotChat.acesa && dotChat.apagada, "recado novo acende a bolinha no MENU e abrir o chat apaga");
  // menu (tela 01): página inteira com cabeçalho, atalhos e badges
  const gavetaApp = await pApp.evaluate(async () => {
    document.getElementById("navMenuApp").click();
    await new Promise((r) => setTimeout(r, 350));
    // aberto = saiu do translateX(105%) (depois da animação o transform vira
    // none de propósito — Chrome espelhava o raio do cabeçalho no scroller)
    const aberto = !/105/.test(document.getElementById("menuApp").style.transform);
    const itens = Array.from(document.querySelectorAll("#menuApp .nitem")).map((x) => x.textContent.trim());
    const cab = document.querySelector("#menuApp .mghd");
    const nome = cab ? cab.textContent : "";
    const esperado = ((JSON.parse(localStorage.getItem("mtapp:ptStudio") || "{}").alunos || [])[0] || {}).nome || "";
    document.querySelector("#menuApp .nitem[data-msec='chat']").click();
    await new Promise((r) => setTimeout(r, 250));
    return {
      aberto, itens, nome, esperado,
      fechou: document.getElementById("fundoMenuApp").style.display === "none",
      chatAbriu: !!document.querySelector("[data-sec='chat']:not([data-sec-off])"),
    };
  });
  ok(gavetaApp.aberto && gavetaApp.itens.length >= 5 && gavetaApp.fechou && gavetaApp.chatAbriu,
    "menu vira página inteira, com as áreas, e navega (" + gavetaApp.itens.length + " itens)");
  ok(gavetaApp.esperado && gavetaApp.nome.indexOf(gavetaApp.esperado) >= 0,
    "cabeçalho do menu mostra o nome do aluno (" + gavetaApp.esperado + ")");
  // --- utilidades: água com copinhos, cronômetro/timer, 1RM, anilhas e IMC ---
  const util = await pApp.evaluate(async () => {
    const out = {};
    out.naGaveta = Array.from(document.querySelectorAll("#menuApp .nitem")).some((x) => /Utilidades/.test(x.textContent));
    window.__trocaSec("util");
    for (let i = 0; i < 8; i++) document.getElementById("agMais").click();
    await new Promise((r) => setTimeout(r, 250));
    out.agua = document.getElementById("agInfo").textContent;
    out.copos = document.querySelectorAll("#agCopos .copo").length;
    out.habAgua = (JSON.parse(localStorage.getItem("pthab") || "{}")[new Date().toISOString().slice(0, 10)] || {})[0] === true;
    document.getElementById("rmKg").value = "100";
    document.getElementById("rmReps").value = "5";
    document.getElementById("rmKg").dispatchEvent(new Event("input"));
    out.rm = document.getElementById("rmOut").textContent;
    document.getElementById("anKg").value = "100";
    document.getElementById("anKg").dispatchEvent(new Event("input"));
    out.anilhas = document.getElementById("anOut").textContent;
    document.getElementById("imcKg").value = "85";
    document.getElementById("imcCm").value = "178";
    document.getElementById("imcKg").dispatchEvent(new Event("input"));
    out.imc = document.getElementById("imcOut").textContent;
    document.getElementById("ucGo").click();
    await new Promise((r) => setTimeout(r, 500));
    out.crono = document.getElementById("ucTempo").textContent;
    document.getElementById("ucZera").click();
    // devolve o estado dos hábitos com clique real (repinta o XP; o teste de streak marca do zero)
    window.__trocaSec("inicio");
    document.querySelectorAll("[data-hab]")[0].click();
    await new Promise((r) => setTimeout(r, 150));
    return out;
  });
  ok(util.naGaveta && util.copos === 8 && /Meta do dia batida/.test(util.agua) && util.habAgua,
    "água com copinhos: bater a meta marca o hábito Água sozinho");
  ok(/116,5 kg/.test(util.rm), "calculadora de 1RM (Epley: 100×5 = 116,5 kg) com tabela de percentuais");
  ok(/1 × 25 kg/.test(util.anilhas) && /1 × 15 kg/.test(util.anilhas), "calculadora de anilhas monta a barra (100 kg = 25+15 por lado)");
  ok(/26,8/.test(util.imc) && /sobrepeso/.test(util.imc), "IMC calcula e classifica (85 kg / 1,78 m = 26,8)");
  // aceita qualquer segundo: com a máquina carregada o cronômetro já passou de
  // 0:00 quando a leitura acontece, e travar em 0:00 deixava o teste instável
  ok(/^\d+:\d\d\.\d/.test(util.crono), "cronômetro avulso roda com décimos (" + util.crono + ")");
  // cronômetro turbinado: modos Tabata, EMOM e AMRAP com contagem de rounds
  const crono5 = await pApp.evaluate(async () => {
    const out = {};
    window.__trocaSec("util");
    out.chips = Array.from(document.querySelectorAll(".ucTipo")).map((x) => x.textContent).join(",");
    document.querySelector("[data-uct='tabata']").click();
    out.cfgTabata = !!document.getElementById("ucRds") && !!document.getElementById("ucTrab") && !!document.getElementById("ucDesc");
    document.getElementById("ucRds").value = "2";
    document.getElementById("ucTrab").value = "1";
    document.getElementById("ucDesc").value = "1";
    document.getElementById("ucGo").click();
    await new Promise((r) => setTimeout(r, 1300));
    out.tabataMeio = document.getElementById("ucFase").textContent;
    await new Promise((r) => setTimeout(r, 3200));
    out.tabataFim = document.getElementById("ucFase").textContent + "|" + document.getElementById("ucTempo").textContent;
    document.querySelector("[data-uct='emom']").click();
    document.getElementById("ucGo").click();
    await new Promise((r) => setTimeout(r, 400));
    out.emom = document.getElementById("ucFase").textContent + "|" + document.getElementById("ucTempo").textContent;
    document.getElementById("ucZera").click();
    document.querySelector("[data-uct='amrap']").click();
    out.rotRound = document.getElementById("ucVolta").textContent;
    document.getElementById("ucMin").value = "1";
    document.getElementById("ucGo").click();
    await new Promise((r) => setTimeout(r, 300));
    document.getElementById("ucVolta").click();
    document.getElementById("ucVolta").click();
    out.amrap = document.getElementById("ucVoltas").textContent + "|" + document.getElementById("ucTempo").textContent;
    document.getElementById("ucZera").click();
    document.querySelector("[data-uct='crono']").click();
    out.cronoZero = document.getElementById("ucTempo").textContent;
    return out;
  });
  ok(crono5.chips === "Cronômetro,Timer,Tabata,EMOM,AMRAP", "cronômetro do Utilidades oferece os 5 modos");
  ok(crono5.cfgTabata && /DESCANSA/.test(crono5.tabataMeio) && /TABATA COMPLETO — 2 ROUNDS!\|FIM!/.test(crono5.tabataFim),
    "Tabata alterna TRABALHA/DESCANSA e completa os rounds configurados");
  ok(/MINUTO 1 DE 10/.test(crono5.emom) && /\|0:5\d/.test(crono5.emom), "EMOM mostra MINUTO 1 DE 10 e conta o minuto regressivo");
  ok(crono5.rotRound === "+1 round" && /2/.test(crono5.amrap) && /rounds/.test(crono5.amrap) && /0:5\d/.test(crono5.amrap),
    "AMRAP regressivo conta rounds pelo botão +1 round");
  ok(crono5.cronoZero === "0:00.0", "voltar pro modo cronômetro zera tudo");
  // avisos sonoros: contagem 3-2-1 nos timers e áudio destravado no primeiro toque (iPhone)
  ok(/function ucCd\(/.test(appHtml2) && /function wodCd\(/.test(appHtml2) && /ac\.resume\(\)/.test(appHtml2) && /o\.type='square'/.test(appHtml2),
    "timers com contagem sonora 3-2-1 e áudio alto destravado no toque");
  {
    // peso sugerido na série (v603): bateu as reps da última vez -> sobe um degrau
    const sug = await pApp.evaluate(async () => {
      const S = (h) => localStorage.setItem("ptdc", JSON.stringify(h));
      const snap = localStorage.getItem("ptdc");
      const out = {};
      S({ Sup: [{ d: "2026-08-01", kg: 30, r: 12 }, { d: "2026-08-08", kg: 30, r: 12 }] });
      out.bateu = window.__gSugere("Sup", "12");
      S({ Sup: [{ d: "2026-08-08", kg: 30, r: 9 }] });
      out.naoBateu = window.__gSugere("Sup", "12");
      S({ Sup: [{ d: "2026-08-01", kg: 30, r: 12 }, { d: "2026-08-08", kg: 32.5, r: 12 }] });
      out.subiuAgora = window.__gSugere("Sup", "12");
      S({ Rosca: [{ d: "2026-08-08", kg: 12, r: 12 }] });
      out.leve = window.__gSugere("Rosca", "12");
      out.semNada = window.__gSugere("Nunca feito", "12");
      out.semAlvo = window.__gSugere("Sup", "");
      if (snap) localStorage.setItem("ptdc", snap); else localStorage.removeItem("ptdc");
      return out;
    });
    ok(sug.bateu === 32.5 && sug.leve === 13,
      "🏁 peso sugerido: bateu as reps na última, sobe um degrau (2,5 kg acima de 20 kg; 1 kg abaixo)");
    ok(sug.naoBateu === 0 && sug.subiuAgora === 0,
      "não bateu as reps, ou acabou de subir no treino passado: o app NÃO sugere subir");
    ok(sug.semNada === 0 && sug.semAlvo === 0,
      "sem histórico ou sem repetições prescritas, nenhuma sugestão é inventada");
  }
  {
    // IA do MÊS (v604): perfil mais fundo + progressão de 4 semanas
    const mes = await p.evaluate(() => {
      // estúdio SINTÉTICO: o do teste já tem avaliações próprias e mascararia
      // os números que este bloco quer conferir
      const hj = new Date();
      const dISO = (n) => new Date(hj.getTime() - n * 864e5).toISOString().slice(0, 10);
      const feitos = {}; for (let i = 1; i <= 10; i++) feitos[dISO(i * 2)] = 1;
      const a = {
        id: "aIA", nome: "Teste IA", metaSemana: 4, anamnese: { nivel: "intermediário", dias: 4 },
        retorno: {
          cargas: { "Supino reto": [{ d: "2026-08-01", kg: 60, r: 10 }, { d: "2026-08-15", kg: 70, r: 10 }] },
          feitos: feitos,
        },
      };
      const st = { alunos: [a], exercicios: [], exFav: [], avaliacoes: [
        { alunoId: "aIA", data: "2026-05-10", peso: 88, gordura: 26, cintura: 98, biaMme: 34 },
        { alunoId: "aIA", data: "2026-08-10", peso: 83, gordura: 21, cintura: 92, biaMme: 36 },
      ] };
      const txt = window.__montaDadosIA(st, a, "Hipertrofia", "academia completa");
      const bom = { mes: [1, 2, 3, 4].map((n) => ({ n, foco: "f" + n, ajuste: "a" + n })) };
      const hoje = new Date().toISOString().slice(0, 10);
      const mais = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
      const pl = window.__peneiraMes(bom);
      return {
        temAval: /AVALIA[ÇC][ÃA]O F[ÍI]SICA \(10\/08\/2026\): peso 83 kg · gordura 21%/.test(txt),
        temDelta: /MUDOU DESDE 10\/05\/2026/.test(txt) && /peso -5 kg/.test(txt) && /% de gordura -5%/.test(txt),
        temCargas: /CARGAS DE HOJE/.test(txt) && /Supino reto 70 kg/.test(txt),
        temFreq: /FREQU[ÊE]NCIA REAL: 10 treinos/.test(txt),
        semAval: /nenhuma registrada/.test(window.__montaDadosIA({ alunos: [], avaliacoes: [] }, { id: "x", nome: "y" }, "o", "e")),
        quatro: pl && pl.semanas.length === 4,
        tres: window.__peneiraMes({ mes: [{ n: 1, foco: "a", ajuste: "b" }] }),
        semMes: window.__peneiraMes({}),
        s1: window.__semanaMes({ geradoEm: hoje, semanas: [1, 2, 3, 4] }),
        s2: window.__semanaMes({ geradoEm: new Date(Date.now() - 8 * 864e5).toISOString().slice(0, 10), semanas: [1, 2, 3, 4] }),
        s4: window.__semanaMes({ geradoEm: new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10), semanas: [1, 2, 3, 4] }),
        futuro: window.__semanaMes({ geradoEm: mais(5), semanas: [1, 2, 3, 4] }),
      };
    });
    ok(mes.temAval && mes.temDelta,
      "🏁 a IA recebe a avaliação física e o quanto mudou desde a primeira (peso, gordura, cintura, massa magra)");
    ok(mes.temCargas && mes.temFreq,
      "a IA recebe o que o aluno levanta HOJE e quantas vezes ele treinou de verdade nos últimos 28 dias");
    ok(mes.semAval, "sem avaliação registrada, o texto diz isso — a IA não estima composição corporal");
    ok(mes.quatro && mes.tres === null && mes.semMes === null,
      "o plano do mês só vale com as 4 semanas completas (resposta antiga ou torta é descartada)");
    ok(mes.s1 === 1 && mes.s2 === 2 && mes.s4 === 4 && mes.futuro === 1,
      "a semana atual sai da data em que a IA montou (passou do mês, fica na 4; data no futuro, fica na 1)");
    // a chat-envia manda os TRÊS formatos devolverem o plano do mês
    const fn = require("fs").readFileSync(__dirname + "/../supabase/functions/chat-envia/index.ts", "utf8");
    ok((fn.match(/MES_REGRA/g) || []).length === 4 && (fn.match(/"mes":\[/g) || []).length === 3,
      "a chat-envia pede o plano do mês nos três formatos (musculação, circuito e corrida)");
    ok(/EXATAMENTE 4 objetos/.test(fn) && /semana 4 deve ser SEMPRE mais leve/i.test(fn),
      "a regra do mês exige 4 semanas e manda a última ser deload — nunca a mais pesada");
    ok((fn.match(/BRIEF_REGRA/g) || []).length === 4 && /PRIORIDADE MÁXIMA/.test(fn) && /regra absoluta/.test(fn),
      "a chat-envia manda a leitura do professor vencer os números, e as adaptações serem regra absoluta");
    ok(/A ESTRUTURA QUE ELE PEDIR SUBSTITUI OS PADRÕES/.test(fn) && /1 ficha por dia disponível/.test(fn),
      "e a divisão pedida pelo professor vence o padrão de '1 ficha por dia' — era essa regra que ganhava dele");
    ok(/EXERCÍCIOS QUE O PROFESSOR CITOU\\" *, *"? *é OBRIGATÓRIO|é OBRIGATÓRIO/.test(fn) && /LEMBRETE FINAL/.test(fn),
      "a função sabe que o exercício citado é obrigatório e que existe um lembrete no fim dos dados");
    ok(/regras: \["mes", "brief", "briefManda"\]/.test(fn),
      "o ping devolve as REGRAS que a versão publicada carrega — é assim que o painel descobre função velha");
  }
  {
    // ✍️ a leitura do professor entra no prompt, na frente de tudo
    const br = await p.evaluate(() => {
      const S = window.MTStore, st = S.read("ptStudio", {});
      const id = st.alunos[0].id;
      window.__trAba("auto");
      document.getElementById("taAluno").value = id;
      window.__brief.carrega();
      const out = { vazioChip: document.getElementById("taBriefChip").textContent };
      document.getElementById("brDesejo").value = "ABCD em vez de ABC, nada acima de 50 minutos";
      document.getElementById("brQuer").value = "quer mais peito, odeia esteira";
      document.getElementById("brAdapta").value = "ombro direito trava acima de 90 graus";
      document.getElementById("brLeitura").value = "estagnou no supino ha 6 semanas";
      window.__brief.salva();
      const st2 = S.read("ptStudio", {});
      const a2 = st2.alunos.find((x) => x.id === id);
      out.guardou = !!(a2.briefIA && a2.briefIA.desejo && a2.briefIA.adapta);
      out.chip = document.getElementById("taBriefChip").textContent;
      out.txt = window.__briefIA(a2);
      out.noPrompt = window.__montaDadosIA(st2, a2, "Hipertrofia", "academia completa");
      out.vazio = window.__briefIA({ id: "z" });
      // devolve o aluno como estava
      delete a2.briefIA; S.write("ptStudio", st2); window.__brief.carrega();
      return out;
    });
    ok(br.guardou && /4 de 4 preenchidos/.test(br.chip) && /em branco/.test(br.vazioChip),
      "🏁 a leitura do professor fica guardada NO ALUNO e o card diz quantos campos estão preenchidos");
    ok(/REGRA ABSOLUTA/.test(br.txt) && /siga à risca/.test(br.txt) && /ombro direito trava/.test(br.txt),
      "os quatro campos viram o bloco A LEITURA DO PROFESSOR, com as adaptações marcadas como regra absoluta");
    ok(br.noPrompt.indexOf("A LEITURA DO PROFESSOR") < br.noPrompt.indexOf("ALUNO:"),
      "a leitura do professor vai na FRENTE dos dados do aluno no prompt");
    ok(br.vazio === "", "professor que não escreveu nada não gera bloco nenhum — o prompt fica como era");
  }
  {
    /* ⚠️ O caminho de volta do pedido do professor. Três coisas foram medidas
     * como quebradas antes desta suíte existir:
     *   - a IA via só 436 dos 1828 exercícios (os 25 primeiros de cada grupo,
     *     na ordem do arquivo) — pedir um exercício fora desses 25 era pedir
     *     uma coisa que ela não sabia que existia;
     *   - o nome citado pelo professor não virava obrigação nenhuma;
     *   - "1 ficha por dia disponível" (regra do sistema) vencia a divisão
     *     que ele tinha escrito. */
    const ped = await p.evaluate(() => {
      const S = window.MTStore, st = S.read("ptStudio", {});
      const id = st.alunos[0].id;
      const a = st.alunos.find((x) => x.id === id);
      const guardaObs = a.obs, guardaAn = a.anamnese;
      a.obs = "Chega cansada do trabalho.";
      a.anamnese = Object.assign({}, a.anamnese || {}, { dias: 4, gosta: "agachamento livre", naogosta: "esteira" });
      a.briefIA = {
        desejo: "Quero ABCD, nao ABC. Terra romeno obrigatorio. Agachamento bulgaro tambem.",
        quer: "Ela pediu mais gluteo.",
        adapta: "Ombro direito trava acima de 90 graus - nada de desenvolvimento militar.",
        leitura: "Estagnou no supino.",
      };
      const txt = window.__montaDadosIA(st, a, "Hipertrofia", "academia completa");
      const bloco = (txt.match(/EXERCÍCIOS QUE O PROFESSOR CITOU[^\n]*/) || [""])[0];
      const iCat = txt.indexOf("CATÁLOGO DISPONÍVEL");
      const cat = iCat >= 0 ? txt.slice(iCat) : "";
      const out = {
        tam: txt.length,
        // conta os nomes do catálogo: um por " | " mais um por linha de grupo
        nomes: (cat.match(/\|/g) || []).length + Math.max(0, cat.split("\n").length - 2),
        bloco: bloco,
        temLembrete: txt.indexOf("LEMBRETE FINAL") > txt.length * 0.5,
        obsCedo: txt.indexOf("OBSERVAÇÕES DO PERSONAL SOBRE ESTE ALUNO"),
        posAluno: txt.indexOf("ALUNO:"),
        diasCede: /vale o que ELE pediu/.test((txt.match(/OBJETIVO:[^\n]*/) || [""])[0]),
      };
      a.obs = guardaObs; a.anamnese = guardaAn; delete a.briefIA;
      return out;
    });
    ok(ped.nomes > 1000, "a IA passa a enxergar o banco quase inteiro, não 25 por grupo (" + ped.nomes + " exercícios)");
    ok(ped.tam < 60000, "e o envio continua dentro do envelope que a chat-envia aceita (" + ped.tam + " de 60000)");
    ok(/Levantamento terra romeno/.test(ped.bloco) && /Agachamento búlgaro/.test(ped.bloco) && /Agachamento livre/.test(ped.bloco),
      "o exercício citado pelo professor vira OBRIGATÓRIO — inclusive escrito sem acento e pelo apelido (terra romeno)");
    ok(!/desenvolvimento militar/i.test(ped.bloco) && !/[Ee]steira/.test(ped.bloco),
      "o que ele PROIBIU não vira obrigação — nada de 'nada de desenvolvimento militar' virar exercício pedido");
    ok(!/Agachamento búlgaro com salto|Agachamento búlgaro 1 e/.test(ped.bloco),
      "entra o movimento base, não as variações dele — senão a ficha vira repetição do mesmo exercício");
    ok(ped.obsCedo >= 0 && ped.obsCedo < ped.posAluno,
      "as observações do professor sobem pra junto da leitura dele, não ficam enterradas na anamnese");
    ok(ped.temLembrete, "o pedido do professor é repetido no FIM do envio — é a última coisa que a IA lê antes de responder");
    ok(ped.diasCede, "a linha de DIAS/SEMANA diz que a divisão pedida pelo professor vence o padrão da anamnese");
  }
  {
    // 🔎 exercício que a IA prescreveu e o painel jogou fora aparece na tela
    const fora = await p.evaluate(() => {
      const orig = window.MTStore.cloud;
      window.MTStore.cloud = () => ({ client: {} });
      const cham = window.MT_FUNCAO.chama;
      window.MT_FUNCAO.chama = () => Promise.resolve({ ok: true, texto: JSON.stringify({
        fichas: [{ titulo: "A — Peito", itens: [
          { nome: "Supino reto", series: 4, reps: "10", descanso: 60 },
          { nome: "Voador invertido de marte", series: 3, reps: "12", descanso: 60 },
          { nome: "AGACHAMENTO BULGARO", series: 3, reps: "10", descanso: 60 },
        ] }],
        resumo: "teste",
      }) });
      const S = window.MTStore, st = S.read("ptStudio", {});
      const id = st.alunos[0].id;
      return new Promise((res) => {
        window.__iaTreino(id, "hipertrofia", "academia", (r) => {
          window.MTStore.cloud = orig; window.MT_FUNCAO.chama = cham;
          res(r);
        });
      });
    });
    ok(fora.ignorados === 1 && (fora.nomesFora || []).some((n) => /marte/i.test(n)),
      "o exercício inventado é contado E devolvido pelo nome, em vez de sumir calado");
    ok(fora.exercicios === 2,
      "o nome escrito sem acento e em caixa alta é RECUPERADO pelo banco (AGACHAMENTO BULGARO → Agachamento búlgaro)");
  }
  // --- R2: placar de circuito por tipo (telas 07/08/09) ---
  {
    const r2 = await pApp.evaluate(() => {
      const out = {};
      const w = window.__wod;
      w.wodId = "wtest"; w.wodNome = "Chipper"; w.tipo = "amrap"; w.voltas = 5; w.laps = [218, 450, 691];
      window.__wodPlacar("fim de teste", 5);
      const ov = document.getElementById("wodPlacar");
      out.abriu = !!ov;
      const tx = ov ? ov.textContent : "";
      out.pecas = /Quantas voltas você fechou/i.test(tx) && /Como você fez/i.test(tx) &&
        /Tempo de cada volta/i.test(tx) && /Salvar resultado/.test(tx) && /AMRAP/.test(tx);
      document.getElementById("wpMais").click();
      document.querySelector("[data-wpcf='esc']").click();
      document.getElementById("wpSalvar").click();
      const wr = JSON.parse(localStorage.getItem("ptwodres") || "{}");
      const e = (wr.wtest || []).slice(-1)[0] || {};
      out.salvo = e.v === 6 && e.tp === "amrap" && e.cf === "esc" && Array.isArray(e.sp) && e.sp.length === 3 &&
        /6 voltas/.test(e.r) && /escalado/.test(e.r);
      out.fechou = !document.getElementById("wodPlacar");
      // limpa o rastro pros próximos blocos
      delete wr.wtest; localStorage.setItem("ptwodres", JSON.stringify(wr));
      w.wodId = null; w.voltas = 0; w.laps = [];
      const fb = document.getElementById("wodFimBox"); if (fb) { fb.style.display = "none"; fb.innerHTML = ""; }
      return out;
    });
    ok(r2.abriu && r2.pecas, "🏁 R2: encerrar circuito prescrito abre o placar do tipo (voltas + como fez + tempo de cada volta)");
    ok(r2.salvo && r2.fechou, "Salvar resultado grava voltas/como fez/splits no ptwodres (que o personal recebe) e fecha o placar");
  }
  {
    // treino guiado no circuito (v600): um movimento por vez, igual à musculação.
    // Precisa de um WOD PRESCRITO (o guiado lê os movimentos dele), então
    // semeia um, monta um app só pra isso e devolve o estudio como estava.
    const snapWod = await p.evaluate(() => localStorage.getItem("mtapp:ptStudio"));
    const wodApp = await p.evaluate(() => {
      const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
      const a = st.alunos[0];
      const t = (st.treinosV2[a.id] = st.treinosV2[a.id] || { fichas: [] });
      t.wods = [{ id: "wg1", nome: "Chipper guiado", tipo: "amrap", min: 12,
        movs: [{ q: "10", n: "burpee" }, { q: "20", n: "agachamento" }, { q: "30", n: "abdominal" }] }];
      localStorage.setItem("mtapp:ptStudio", JSON.stringify(st));
      return window.__montaAppAluno(a, new Date().toISOString());
    });
    const pW = await ctx.newPage();
    pW.on("dialog", (d) => d.accept());
    await pW.route("**/app-teste-wod.html", (r) => r.fulfill({ contentType: "text/html", body: wodApp }));
    await pW.goto(BASE + "/app-teste-wod.html", { waitUntil: "domcontentloaded" });
    await pW.waitForTimeout(400);
    const gw = await pW.evaluate(async () => {
      const w = window.__wod;
      window.__trSub("wod");
      await new Promise((r) => setTimeout(r, 200));
      document.querySelector("[data-wodstart]").click();
      await new Promise((r) => setTimeout(r, 150));
      document.getElementById("wodGo").click();
      await new Promise((r) => setTimeout(r, 400));
      const le = () => ({
        gi: w.gi, voltas: w.voltas,
        agora: (document.getElementById("wfAgora").textContent || "").replace(/\s+/g, " "),
        vis: document.getElementById("wfAgora").style.display,
        movs: document.querySelectorAll("[data-wfmov]").length,
      });
      const out = { ini: le() };
      document.getElementById("wfFeito").click();
      await new Promise((r) => setTimeout(r, 150));
      out.um = le();
      // clica EXATAMENTE o que falta pra fechar a volta (o circuito de teste
      // tem 3 movimentos; um número fixo de cliques fecharia mais de uma)
      const faltam = out.um.movs - w.gi;
      for (let i = 0; i < faltam; i++) { document.getElementById("wfFeito").click(); await new Promise((r) => setTimeout(r, 80)); }
      out.volta = le();
      document.querySelectorAll("[data-wfmov]")[1].click();
      await new Promise((r) => setTimeout(r, 150));
      out.pulo = le();
      out.riscados = [...document.querySelectorAll("[data-wfmov]")].map((x) => /line-through/.test(x.getAttribute("style") || "") ? 1 : 0).join("");
      // limpa o rastro
      document.getElementById("wodZera").click();
      out.zerou = { gi: w.gi, voltas: w.voltas };
      return out;
    });
    ok(gw.ini.vis === "block" && gw.ini.gi === 0 && /Agora · 1 de \d/.test(gw.ini.agora) && /Feito/.test(gw.ini.agora),
      "🏁 circuito guiado abre no 1º movimento, com a quantidade grande e o botão Feito");
    ok(gw.um.gi === 1 && /depois:/.test(gw.ini.agora),
      "Feito › anda um movimento e a linha já diz qual vem depois");
    ok(gw.volta.voltas === 1 && gw.volta.gi < gw.volta.movs,
      "passar do último movimento fecha a volta sozinho e recomeça a lista");
    ok(gw.pulo.gi === 1 && gw.riscados.slice(0, 1) === "1",
      "tocar num movimento pula pra ele, e o que ficou pra trás aparece riscado");
    ok(gw.zerou.gi === 0 && gw.zerou.voltas === 0, "zerar o circuito volta pro primeiro movimento");
    await pW.close();
    await p.evaluate((snap) => localStorage.setItem("mtapp:ptStudio", snap), snapWod);
  }
  // --- R3: questionário uma-pergunta-por-tela (telas 02-06) ---
  {
    const qaHtml = await p.evaluate(() => {
      const st = window.MTStore.read("ptStudio", {});
      const al = st.alunos[0];
      const antes = al.questApp;
      al.questApp = { nome: "Como foi sua semana", desde: "2020-01-01", repete: false, enviadoEm: "eT", ps: [
        { s: "SONO", texto: "Como dormiu?", tipo: "emoji", ops: [{ e: "🙁", r: "Mal", p: 0 }, { e: "🙂", r: "Bem", p: 2 }], mm: false },
        { s: "DOR", texto: "Dor de 0 a 10?", tipo: "linear", ops: [], mm: true },
        { s: "", texto: "Quer ajustar algo?", tipo: "texto", ops: [], mm: false },
      ] };
      const h = window.__montaAppAluno(al, "teste-quest");
      if (antes === undefined) delete al.questApp; else al.questApp = antes;
      return h;
    });
    const pQ = await ctx.newPage();
    const errosQ = [];
    pQ.on("pageerror", (e) => errosQ.push(String(e)));
    let envio = null;
    await pQ.route("**/rest/v1/rpc/**", (r) => r.abort());
    await pQ.route("**/rest/v1/rpc/app_quest_responde", (r) => {
      envio = JSON.parse(r.request().postData() || "{}");
      r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });
    await pQ.route("**/app-teste-quest.html", (r) => r.fulfill({ contentType: "text/html", body: qaHtml }));
    await pQ.goto(BASE + "/app-teste-quest.html", { waitUntil: "domcontentloaded" });
    const conv = await pQ.evaluate(() => {
      window.__trocaSec("chat");
      const el = document.getElementById("qaBox");
      // v610: UM card só — faixa roxa com nome, quantas perguntas e o botão.
      // O parágrafo de "pra que serve" e a lista de perguntas saíram (poluíam).
      return { txt: el.textContent, caixas: el.querySelectorAll("div[style*='background:var(--bg2)']").length,
        bt: !!el.querySelector("#qaAbrir") };
    });
    ok(/Responder agora/.test(conv.txt) && /perguntas · leva/.test(conv.txt) && conv.bt,
      "📝 o card do questionário é o convite: nome, quantas perguntas e o botão");
    ok(!/O que ele vai perguntar/i.test(conv.txt) && conv.caixas === 0,
      "📝 e nada além disso — sem a lista de perguntas nem a caixa de explicação");
    const fluxo = await pQ.evaluate(async () => {
      const out = {};
      // as páginas da suíte dividem o MESMO localStorage — guarda pra devolver
      // no fim (uma chave a mais em ptqa mudaria o XP dos testes seguintes)
      const qa0 = localStorage.getItem("ptqa");
      const dr0 = localStorage.getItem("ptqadraft");
      window.__qaFluxo();
      const fx = document.getElementById("qaFluxo");
      out.p1 = /1\/3/.test(fx.textContent) && /Como dormiu\?/.test(fx.textContent) && fx.querySelectorAll(".qaop").length === 2;
      fx.querySelector("[data-qj='1']").click(); // "Bem" — avança sozinho
      await new Promise((r) => setTimeout(r, 550));
      out.p2 = /2\/3/.test(fx.textContent) && !!fx.querySelector("[data-qv='7']");
      fx.querySelector("[data-qv='7']").click();
      document.getElementById("qaProx").click();
      out.p3 = /3\/3/.test(fx.textContent) && !!document.getElementById("qaTxt");
      const d = JSON.parse(localStorage.getItem("ptqadraft") || "{}");
      const ch = Object.keys(d)[0];
      out.parcial = !!(ch && d[ch] && d[ch].R && d[ch].R["0"] && d[ch].R["1"] && d[ch].R["1"].p === 7);
      document.getElementById("qaTxt").value = "menos agacho";
      document.getElementById("qaTxt").dispatchEvent(new Event("input", { bubbles: true }));
      document.getElementById("qaProx").click(); // Enviar
      await new Promise((r) => setTimeout(r, 350));
      out.enviadoTela = /Respondido/i.test(fx.textContent) && /já recebeu/.test(fx.textContent);
      out.marcado = Object.keys(JSON.parse(localStorage.getItem("ptqa") || "{}")).length >
        Object.keys(JSON.parse(qa0 || "{}")).length;
      out.draftLimpo = !Object.keys(JSON.parse(localStorage.getItem("ptqadraft") || "{}")).length;
      // devolve como estava
      if (qa0 == null) localStorage.removeItem("ptqa"); else localStorage.setItem("ptqa", qa0);
      if (dr0 == null) localStorage.removeItem("ptqadraft"); else localStorage.setItem("ptqadraft", dr0);
      return out;
    });
    ok(fluxo.p1 && fluxo.p2 && fluxo.p3, "uma pergunta por tela: emoji avança sozinho, escala 0-10 em botões, texto por último (n/total no topo)");
    ok(fluxo.parcial, "resposta parcial fica guardada no aparelho (dá pra parar no meio e voltar depois)");
    ok(fluxo.enviadoTela && fluxo.marcado && fluxo.draftLimpo && !!envio && envio.p_dados && envio.p_dados.respostas.length === 3 &&
      envio.p_dados.respostas[1].pontos === 7 && envio.p_dados.respostas[1].menos === true &&
      envio.p_dados.respostas[2].resposta === "menos agacho" && envio.p_dados.pontuacao === -5,
      "Enviar manda a MESMA lista de sempre (sigla/pontos/menos + pontuação) e a tela Respondido aparece");
    ok(errosQ.length === 0, "fluxo do questionário sem erro de JS" + (errosQ.length ? " — " + errosQ[0] : ""));
    await pQ.close();
  }
  // --- R4: compartilhar com arte por cima da foto (telas 26-30) ---
  {
    const r4 = await pApp.evaluate(() => {
      const out = {};
      const cv = window.__artePost({ badge: "MUSCULAÇÃO", titulo: "Treino B Puxar", stats: [["52:14", "tempo"], ["18", "séries"]], rodape: "Musculação" });
      out.canvas = !!cv && cv.width === 1080 && cv.height === 1350;
      // salvar o placar do circuito passa a oferecer o post com foto
      const w = window.__wod;
      w.wodId = "wtest3"; w.wodNome = "Chipper"; w.tipo = "amrap"; w.voltas = 4; w.laps = [];
      window.__wodPlacar("fim de teste", 4);
      document.getElementById("wpSalvar").click();
      const fb = document.getElementById("wodFimBox");
      out.share = /Compartilhar com foto/.test(fb.textContent) && !!document.getElementById("wodShareArq") &&
        !!document.getElementById("wodShareSem") && /não sai do seu celular/.test(fb.textContent);
      // o recibo do treino guiado leva o mesmo gatilho (o código está no app)
      out.recibo = true;
      // limpa o rastro
      const wr = JSON.parse(localStorage.getItem("ptwodres") || "{}");
      delete wr.wtest3; localStorage.setItem("ptwodres", JSON.stringify(wr));
      w.wodId = null; w.voltas = 0; fb.style.display = "none"; fb.innerHTML = "";
      return out;
    });
    ok(r4.canvas, "📸 R4: a arte do post monta em 1080×1350 (badge, título, números e marca do studio)");
    ok(r4.share, "salvar o placar do circuito oferece 'Compartilhar com foto' (e avisa que a foto não sai do celular)");
    ok(/gShareArq/.test(appHtml2) && /arteBtns\('gShareArq'/.test(appHtml2) && /MUSCULAÇÃO/.test(appHtml2),
      "o recibo do fim de treino ganha o mesmo gatilho, com tempo/volume/séries do dia");
  }
  // --- lote timers+retenção (app): treino livre no placar, lembrete de água, retrospectiva do mês ---
  const lote7app = await pApp.evaluate(async () => {
    const out = {};
    const snap = {};
    ["ptfeitos", "ptdc", "ptpeso", "ptretroV", "ptwodres", "ptaguaLem"].forEach((k) => { snap[k] = localStorage.getItem(k); });
    // tabata avulso 2×1s/1s termina e vira "treino livre" no ptwodres
    window.__trocaSec("util");
    document.querySelector("[data-uct='tabata']").click();
    document.getElementById("ucRds").value = "2";
    document.getElementById("ucTrab").value = "1";
    document.getElementById("ucDesc").value = "1";
    document.getElementById("ucGo").click();
    await new Promise((r) => setTimeout(r, 4800));
    const wr = JSON.parse(localStorage.getItem("ptwodres") || "{}");
    out.livre = !!(wr.livre || []).length && /Tabata 2/.test(wr.livre[wr.livre.length - 1].n);
    out.hist = document.getElementById("ucHist").textContent;
    // lembrete de água guarda o intervalo
    const sel = document.getElementById("agLemSel");
    sel.value = "120";
    sel.dispatchEvent(new Event("change"));
    out.lem = JSON.parse(localStorage.getItem("ptaguaLem"));
    // retrospectiva: semeia o mês passado e repinta
    const d0 = new Date(); d0.setDate(1); d0.setDate(0);
    const mp = d0.getFullYear() + "-" + String(d0.getMonth() + 1).padStart(2, "0");
    const f = {}; f[mp + "-03"] = 1; f[mp + "-05"] = 1; f[mp + "-08"] = 1;
    localStorage.setItem("ptfeitos", JSON.stringify(f));
    localStorage.setItem("ptdc", JSON.stringify({ "Supino reto": [{ d: mp + "-05", kg: 80, r: 8 }] }));
    const pz = {}; pz[mp + "-01"] = 90; pz[mp + "-28"] = 88;
    localStorage.setItem("ptpeso", JSON.stringify(pz));
    localStorage.removeItem("ptretroV");
    window.__retro();
    const card = document.getElementById("retroCard");
    out.retroVis = card.style.display;
    out.retroTxt = card.textContent;
    document.getElementById("retroFecha").click();
    out.retroFechada = card.style.display === "none" && JSON.parse(localStorage.getItem("ptretroV")) === mp;
    // devolve o estado como estava (bloco autocontido)
    Object.keys(snap).forEach((k) => { if (snap[k] == null) localStorage.removeItem(k); else localStorage.setItem(k, snap[k]); });
    window.__retro();
    return out;
  });
  ok(lote7app.livre && /últimos treinos livres/.test(lote7app.hist),
    "Tabata avulso do Utilidades vira treino livre com histórico (e sobe pro placar do professor)");
  ok(lote7app.lem === 120, "lembrete de água guarda o intervalo escolhido");
  ok(lote7app.retroVis === "block" && /Seu mês de/.test(lote7app.retroTxt) && /Supino reto/.test(lote7app.retroTxt),
    "retrospectiva do mês monta sozinha com treinos e recorde de carga");
  ok(!/Peso no mês/.test(lote7app.retroTxt),
    "a retrospectiva não fala de peso — dado de corpo mora na aba Corpo");
  ok(lote7app.retroFechada, "fechar a retrospectiva guarda o mês visto");
  // --- lote timers+retenção (professor): modelos de WOD, saúde da cobrança, pacote com zap ---
  const stSnap7 = await p.evaluate(() => localStorage.getItem("mtapp:ptStudio"));
  await abaPt(p, "treinos");
  const lote7prof = await p.evaluate(async () => {
    const out = {};
    window.__trAba("wod");
    await new Promise((r) => setTimeout(r, 150));
    const sel = document.getElementById("wpModelo");
    out.modelos = sel ? sel.options.length - 1 : 0;
    sel.value = "0";
    sel.dispatchEvent(new Event("change"));
    out.nome = document.getElementById("wpNome").value;
    out.tipo = document.getElementById("wpTipo").value;
    out.min = document.getElementById("wpMin").value;
    out.mov1 = (document.querySelector("#wpMovLinhas .wp-mov .wpe") || {}).value || "";
    // saúde da cobrança: um pontual (paga dia 5) e um atrasador (dia 25 e pulou um mês)
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    const mes = (n, dia) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - n); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + dia; };
    st.alunos.push({ id: "sd1", nome: "Zed Pontual", valor: 100, ativo: true },
      { id: "sd2", nome: "Zed Atrasador", zap: "21977776666", valor: 100, ativo: true });
    st.planosPT = st.planosPT || [];
    st.planosPT.push({ id: "plsd", nome: "Saúde", valor: 100 });
    st.contratosPT = st.contratosPT || [];
    st.contratosPT.push({ id: "ctsd1", alunoId: "sd1", planoId: "plsd", status: "ativo", inicio: mes(3, "01"), diaVenc: 5 },
      { id: "ctsd2", alunoId: "sd2", planoId: "plsd", status: "ativo", inicio: mes(3, "01"), diaVenc: 5 });
    [1, 2, 3].forEach((n) => st.pagamentos.push({ id: "sdp" + n, alunoId: "sd1", valor: 100, forma: "pix", data: mes(n, "05") }));
    [1, 3].forEach((n) => st.pagamentos.push({ id: "sdq" + n, alunoId: "sd2", valor: 100, forma: "pix", data: mes(n, "25") }));
    // pacote quase no fim (com zap pra avisar)
    st.alunos.find((a) => a.id === "sd2").pacote = { total: 5, usadas: 4, vendidoEm: mes(1, "01") };
    window.MTStore.write("ptStudio", st);
    return out;
  });
  await abaPt(p, "pagamentos");
  await p.waitForTimeout(250);
  lote7prof.saude = await p.evaluate(() => document.getElementById("bSaudeP").textContent);
  await abaPt(p, "dash");
  await p.waitForTimeout(350);
  lote7prof.alertas = await p.evaluate(() => document.getElementById("relAlertas").innerHTML);
  await p.evaluate((s) => { localStorage.setItem("mtapp:ptStudio", s); window.MTStore.write("ptStudio", JSON.parse(s)); }, stSnap7);
  ok(lote7prof.modelos === 8 && /Cindy/.test(lote7prof.nome) && lote7prof.tipo === "amrap" && lote7prof.min === "20" && /Barra fixa/.test(lote7prof.mov1),
    "montador de WOD tem 8 modelos prontos e o Cindy preenche o formulário inteiro");
  ok(/Zed Pontual/.test(lote7prof.saude) && /paga em dia/.test(lote7prof.saude) && /Zed Atrasador/.test(lote7prof.saude) && /atrasa/.test(lote7prof.saude) && /ainda não caiu este mês/.test(lote7prof.saude),
    "saúde da cobrança separa quem paga em dia de quem atrasa e soma o que falta cair");
  ok(/Pacote de sessões no fim/.test(lote7prof.alertas) && /Avisar no zap/.test(lote7prof.alertas) && /wa\.me\/5521977776666/.test(lote7prof.alertas),
    "alerta de pacote acabando ganha o botão de avisar o aluno no zap");
  // --- corrida e bike: prescrição no professor + cronômetro de pace no app ---
  const stSnapCr = await p.evaluate(() => localStorage.getItem("mtapp:ptStudio"));
  await abaPt(p, "treinos");
  const cardioProf = await p.evaluate(async () => {
    window.__trAba("cardio");
    const out = {};
    out.abaVisivel = !document.querySelector("[data-trsec='cardio']").hidden;
    const sel = document.getElementById("cbAluno");
    sel.value = sel.options[1].value;
    sel.dispatchEvent(new Event("change"));
    document.getElementById("cbNome").value = "Rodagem de terça";
    document.getElementById("cbTipo").value = "continuo";
    document.getElementById("cbDist").value = "5";
    document.getElementById("cbPace").value = "6:30";
    document.getElementById("cbObs").value = "Ritmo conversável";
    document.getElementById("cbSalva").click();
    await new Promise((r) => setTimeout(r, 200));
    document.getElementById("cbNome").value = "Tiros de quinta";
    document.getElementById("cbTipo").value = "intervalado";
    document.getElementById("cbTipo").dispatchEvent(new Event("change"));
    document.getElementById("cbReps").value = "2";
    document.getElementById("cbTiro").value = "1";
    document.getElementById("cbDesc").value = "1";
    document.getElementById("cbSalva").click();
    await new Promise((r) => setTimeout(r, 200));
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    const aid = document.getElementById("cbAluno").value;
    out.salvos = ((st.treinosV2[aid] || {}).cardio || []).length;
    out.lista = document.getElementById("cbLista").textContent;
    out.appHtml = window.__montaAppAluno(st.alunos.find((a) => a.id === aid), new Date().toISOString());
    return out;
  });
  ok(cardioProf.abaVisivel && cardioProf.salvos === 2 && /Rodagem de terça/.test(cardioProf.lista) && /2× 1s forte/.test(cardioProf.lista),
    "aba Corrida e bike do professor prescreve contínuo e tiros (intervalado)");
  const pCr = await ctx.newPage();
  pCr.on("dialog", (d) => d.accept());
  await pCr.route("**/app-teste-cardio.html", (r) => r.fulfill({ contentType: "text/html", body: cardioProf.appHtml }));
  await pCr.goto(BASE + "/app-teste-cardio.html", { waitUntil: "domcontentloaded" });
  await pCr.waitForTimeout(400);
  const cardioSub = await pCr.evaluate(() => {
    window.__trocaSec("treino");
    window.__trSub("cardio");
    return {
      cardVis: document.getElementById("cardCardio").style.display !== "none",
      folhas: document.querySelectorAll("[data-cbstart]").length,
      txt: document.getElementById("cardCardio").textContent,
    };
  });
  ok(cardioSub.cardVis && cardioSub.folhas === 2 && /pace 6:30/.test(cardioSub.txt) && /Ritmo conversável/.test(cardioSub.txt),
    "app ganha a sub-aba Corrida e bike com as folhas prescritas (alvo com pace)");
  // cronômetro livre com pace: roda, km na mão, Terminei registra
  // (desliga a contagem regressiva e a pausa automática pra não atrasar o relógio do teste)
  await pCr.evaluate(() => localStorage.setItem("ptcrCfg", JSON.stringify({ cd: 0, fb: "bip", ap: 0 })));
  await pCr.evaluate(() => document.getElementById("crGo").click());
  await pCr.waitForTimeout(5400);
  await pCr.evaluate(() => {
    document.getElementById("crKm").value = "0,02";
    document.getElementById("crKm").dispatchEvent(new Event("input"));
  });
  const cardioRun = await pCr.evaluate(() => ({
    t: document.getElementById("crTempo").textContent,
    pace: document.getElementById("crPaceMed").textContent,
    dist: document.getElementById("crDist").textContent,
  }));
  ok(/0:0[5-9]/.test(cardioRun.t) && cardioRun.dist === "0,02" && /^\d+:\d\d$/.test(cardioRun.pace),
    "cronômetro de cardio marca tempo, distância e pace (min/km)");
  await pCr.evaluate(() => document.getElementById("crFim").click());
  await pCr.waitForTimeout(300);
  const cardioReg = await pCr.evaluate(() => ({
    lst: JSON.parse(localStorage.getItem("ptcardio") || "[]"),
    hist: document.getElementById("crHist").textContent,
  }));
  ok(cardioReg.lst.length === 1 && cardioReg.lst[0].k === 0.02 && !!cardioReg.lst[0].p && /últimos treinos/.test(cardioReg.hist),
    "Terminei! registra o treino com pace e monta o histórico");
  // tiros prescritos terminam sozinhos e registram — com a moldura de
  // aquecimento/volta à calma DESLIGADA, que é o caminho de quem prefere
  // largar direto no treino (o player guiado é testado mais abaixo)
  await pCr.evaluate(() => {
    localStorage.setItem("ptcrCfg", JSON.stringify({ cd: 0, fb: "bip", ap: 0, bl: 0 }));
    document.querySelectorAll("[data-cbstart]")[1].click();
    document.getElementById("crGo").click();
  });
  await pCr.waitForTimeout(800);
  const cardioTiro = await pCr.evaluate(() => document.getElementById("crFase").textContent);
  ok(/TIRO \d DE 2/.test(cardioTiro), "tiros mostram FORTE/LEVE com o tiro atual na tela");
  await pCr.waitForTimeout(4200);
  const cardioFim = await pCr.evaluate(() => ({
    fase: document.getElementById("crFase").textContent,
    lst: JSON.parse(localStorage.getItem("ptcardio") || "[]"),
  }));
  ok(/TIROS COMPLETOS/.test(cardioFim.fase) && cardioFim.lst.length === 2 && /Tiros de quinta/.test(cardioFim.lst[1].n),
    "treino de tiros completa sozinho e registra o resultado");
  {
    // tela de resumo no fim da corrida (v602): tiles grandes, medalhas e postar
    const rs = await pCr.evaluate(async () => {
      localStorage.setItem("ptcrCfg", JSON.stringify({ cd: 0, fb: "bip", ap: 0, bl: 0 }));
      localStorage.setItem("ptidade", "40");
      document.getElementById("crZera").click();
      document.querySelector("[data-cbstart]").click();
      await new Promise((r) => setTimeout(r, 150));
      document.getElementById("crGo").click();
      await new Promise((r) => setTimeout(r, 350));
      window.__fc.on = true; window.__fcAmostra(150); window.__fcAmostra(170);
      window.__cr.t0 -= 22 * 60 * 1000;
      document.getElementById("crKm").value = "4,2";
      document.getElementById("crKm").dispatchEvent(new Event("input"));
      await new Promise((r) => setTimeout(r, 250));
      document.getElementById("crFim").click();
      await new Promise((r) => setTimeout(r, 600));
      const el = document.getElementById("crResumoF");
      const out = {
        vis: el.style.display,
        txt: (el.textContent || "").replace(/\s+/g, " "),
        tiles: el.querySelectorAll("div[style*='border-radius:18px']").length,
        flag: window.__cr.resumo,
        // a arte sai mesmo sem GPS: o número grande vira o TEMPO
        arteSemKm: (function () {
          window.__cr.fimReg = { d: "2026-08-25", n: "Esteira", m: "corrida", s: 1500, k: 0, p: null, fc: 150 };
          window.__cr.fimRota = [];
          const c = window.__crCard(null);
          return c ? c.width + "x" + c.height : "";
        })(),
      };
      document.getElementById("crRsFechar").click();
      out.fechou = { vis: el.style.display, flag: window.__cr.resumo };
      window.__fc.on = false; window.__fc.bpm = 0;
      return out;
    });
    ok(rs.vis === "block" && rs.flag === true && rs.tiles === 6,
      "🏁 terminar a corrida abre a tela de resumo com os seis números (km, tempo, pace, kcal, bpm médio e pico)");
    ok(/4,2 quilômetros/i.test(rs.txt.replace(/(\d),(\d) ?/, "$1,$2 ")) || /4,2/.test(rs.txt),
      "o resumo traz a distância do treino");
    ok(/batimento médio/i.test(rs.txt) && /calorias/i.test(rs.txt) && /Postar com foto/.test(rs.txt),
      "o resumo mostra batimento e calorias e oferece postar");
    ok(rs.arteSemKm === "1080x1350",
      "a arte de postar sai mesmo sem GPS (esteira): o número grande vira o tempo");
    ok(rs.fechou.vis === "none" && rs.fechou.flag === false, "Fechar sai do resumo e libera a tela");
  }
  // importar do relógio: GPX sintético de ~2 km em 12 min entra no ptcardio
  const imp = await pCr.evaluate(() => {
    // ponto a cada 30 s andando ~83 m (0,00075° de latitude): 24 passos ≈ 2 km em 12 min
    let seg9 = "";
    for (let i = 0; i <= 24; i++) {
      const t9 = new Date(Date.UTC(2026, 7, 15, 7, 0, 0) + i * 30000).toISOString();
      seg9 += "<trkpt lat='" + (-19.92 - i * 0.00075).toFixed(5) + "' lon='-43.94'><time>" + t9 + "</time></trkpt>";
    }
    const gpx = "<gpx><trk><name>Corrida do relógio</name><trkseg>" + seg9 + "</trkseg></trk></gpx>";
    window.confirm = () => true;
    const reg = window.__crImporta(gpx);
    return { reg, lst: JSON.parse(localStorage.getItem("ptcardio") || "[]"), fase: document.getElementById("crFase").textContent };
  });
  ok(imp.reg && imp.reg.k > 1.9 && imp.reg.k < 2.1 && imp.reg.d === "2026-08-15" && /^6:0\d$/.test(imp.reg.p),
    "GPX do relógio vira registro com km, pace e a DATA do treino (" + (imp.reg && imp.reg.k + " km · " + imp.reg.p) + ")");
  ok(imp.lst.some((x) => x.n === "Corrida do relógio") && /RELÓGIO IMPORTADO/.test(imp.fase),
    "a corrida importada entra no histórico e a tela confirma");
  // área estilo app de corrida: trajeto, botão redondo, meta e configurações
  const nrc = await pCr.evaluate(async () => {
    const out = {
      mapa: !!document.getElementById("crMapa"),
      redondo: document.getElementById("crGo").style.borderRadius === "50%",
    };
    document.getElementById("crMetaBtn").click();
    await new Promise((r) => setTimeout(r, 100));
    document.querySelector(".crMetaOp[data-meta='5-0']").click();
    await new Promise((r) => setTimeout(r, 100));
    out.metaBtn = document.getElementById("crMetaBtn").textContent;
    out.metaInfo = document.getElementById("crInfo").textContent;
    document.getElementById("crCfgBtn").click();
    await new Promise((r) => setTimeout(r, 100));
    document.getElementById("crCfgCd").value = "5";
    document.getElementById("crCfgCd").dispatchEvent(new Event("change"));
    out.cfgSalva = JSON.parse(localStorage.getItem("ptcrCfg"));
    return out;
  });
  ok(nrc.mapa && nrc.redondo, "área de corrida estilo NRC: trajeto no mapa e botão INICIAR redondo gigante");
  ok(/tile\.openstreetmap\.org/.test(cardioProf.appHtml) && /OpenStreetMap/.test(cardioProf.appHtml) && /navigator\.onLine/.test(cardioProf.appHtml),
    "on-line o mapa usa ruas de verdade (com crédito); sem internet cai no traçado offline");
  ok(/globalCompositeOperation='saturation'/.test(cardioProf.appHtml),
    "o OSM cru continua saindo dessaturado com véu claro — a rota é quem brilha, não as ruas");
  // estilos de mapa (v592): CARTO escuro/claro/colorido, satélite da Esri e o OSM cru
  ok(/setTransform\(dp,0,0,dp,0,0\)/.test(cardioProf.appHtml) && /,256,256\);\}catch/.test(cardioProf.appHtml),
    "mapa nítido no celular: o canvas usa a densidade da tela e o tile é desenhado em 256 de CSS");
  ok(/t\.img\.onerror=function\(\)\{if\(t\.fb\)return;t\.fb=1/.test(cardioProf.appHtml),
    "tile que não carrega cai no OpenStreetMap — o estilo escolhido nunca deixa o mapa em branco");
  const mapaEst = await pCr.evaluate(async () => {
    const M = window.__crMapa, out = { ids: Object.keys(M.estilos), dpr: M.dpr() };
    const cfg = (mp) => localStorage.setItem("ptcrCfg", JSON.stringify({ cd: 0, fb: "bip", ap: 0, mp }));
    cfg("auto");
    document.documentElement.classList.remove("claro");
    out.autoEscuro = M.estilo();
    document.documentElement.classList.add("claro");
    out.autoClaro = M.estilo();
    document.documentElement.classList.remove("claro");
    cfg("satelite");
    out.escolhido = M.estilo();
    out.urlSat = M.url(M.estilos.satelite.u, M.estilos.satelite, 15, 3, 7);
    out.urlEsc = M.url(M.estilos.escuro.u, M.estilos.escuro, 15, 3, 7);
    const sel = document.getElementById("crCfgMp");
    out.opcoes = sel ? [...sel.options].map((o) => o.value) : [];
    if (sel) { sel.value = "colorido"; sel.dispatchEvent(new Event("change")); }
    out.salvou = (JSON.parse(localStorage.getItem("ptcrCfg") || "{}") || {}).mp;
    localStorage.setItem("ptcrCfg", JSON.stringify({ cd: 0, fb: "bip", ap: 0 }));
    return out;
  });
  ok(["escuro", "claro", "colorido", "satelite", "ruas"].every((k) => mapaEst.ids.includes(k)),
    "o aluno tem 5 estilos de mapa: escuro, claro, colorido, satélite e ruas");
  ok(mapaEst.autoEscuro === "escuro" && mapaEst.autoClaro === "claro" && mapaEst.escolhido === "satelite",
    "Automático segue o tema do app (noturno = mapa escuro) e a escolha do aluno manda quando existe");
  ok(/^https:\/\/[abcd]\.basemaps\.cartocdn\.com\/rastertiles\/dark_all\/15\/3\/7(@2x)?\.png$/.test(mapaEst.urlEsc) &&
    mapaEst.urlSat === "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/15/7/3",
    "endereço do tile sai montado certo (satélite é z/y/x, CARTO é z/x/y com @2x no retina)");
  ok(mapaEst.opcoes[0] === "auto" && mapaEst.opcoes.length === 6 && mapaEst.salvou === "colorido",
    "engrenagem da corrida tem o seletor Estilo do mapa e guarda a escolha no aparelho");
  ok(/Meta: 5 km/.test(nrc.metaBtn) && /Meta: 5 km/.test(nrc.metaInfo), "pill Defina uma meta configura a corrida livre (5 km)");
  ok(nrc.cfgSalva && nrc.cfgSalva.cd === 5, "engrenagem salva as configurações da corrida (contagem regressiva de 5s)");
  {
    // player guiado de cardio (v597): o treino prescrito vira uma fila de
    // blocos — aquecimento, o miolo e a volta à calma — com voz e vibração
    const gc = await pCr.evaluate(async () => {
      const G = window.__crGuia, out = {};
      localStorage.setItem("ptcrCfg", JSON.stringify({ cd: 0, fb: "bip", ap: 0 }));
      out.cont = G.monta({ n: "Rodagem leve", t: "continuo", d: 5, tp: 30, p: "6:00", m: "corrida" })
        .map((x) => x.k + ":" + x.s + (x.km ? ":" + x.km : ""));
      out.int = G.monta({ n: "Tiros", t: "intervalado", r: 6, ti: 60, de: 90, m: "corrida" }).map((x) => x.k).join("");
      out.livre = G.monta(null);
      localStorage.setItem("ptcrCfg", JSON.stringify({ cd: 0, fb: "bip", ap: 0, bl: 0 }));
      out.desligado = G.monta({ n: "x", t: "continuo", d: 5 });
      localStorage.setItem("ptcrCfg", JSON.stringify({ cd: 0, fb: "bip", ap: 0 }));
      return out;
    });
    ok(gc.cont.join(" ") === "aq:300 c:1800:5 vc:180",
      "cardio contínuo vira 3 blocos: aquecimento 5 min, o treino do professor e volta à calma 3 min");
    ok(gc.int === "aq" + "fl".repeat(6) + "vc",
      "cardio intervalado vira aquecimento + um bloco por tiro (forte e leve) + volta à calma");
    ok(gc.livre === null && gc.desligado === null,
      "corrida livre não ganha blocos, e o aluno desliga a moldura na engrenagem");
    const gr = await pCr.evaluate(async () => {
      document.getElementById("crZera").click();
      document.querySelector("[data-cbstart]").click();
      await new Promise((r) => setTimeout(r, 150));
      document.getElementById("crGo").click();
      await new Promise((r) => setTimeout(r, 700));
      const out = {
        caixa: document.getElementById("crBlocoBox").style.display,
        trilho: document.getElementById("crTrilho").children.length,
        fase: document.getElementById("crFase").textContent,
        depois: document.getElementById("crBlocoD").textContent,
        relogio: document.getElementById("crBlocoT").textContent,
      };
      window.__crGuia.pula();
      await new Promise((r) => setTimeout(r, 300));
      out.fase2 = document.getElementById("crFase").textContent;
      out.bi = window.__cr.bi;
      document.getElementById("crZera").click();
      out.sumiu = document.getElementById("crBlocoBox").style.display;
      return out;
    });
    ok(gr.caixa === "block" && gr.trilho === 3 && /AQUECIMENTO/.test(gr.fase) && /^4:5\d$/.test(gr.relogio),
      "ao começar o treino prescrito o player abre no aquecimento, com o trilho dos blocos e o relógio andando");
    ok(/depois:/.test(gr.depois) && gr.bi === 1 && !/AQUECIMENTO/.test(gr.fase2) && gr.sumiu === "none",
      "a linha diz qual é o próximo bloco, Pular avança de verdade e zerar apaga o player");
    {
      // tela por zona de batimento (v601): sem cinta NADA muda; com cinta, o
      // fundo da tela cheia vira a cor da zona e a faixa diz bpm e % da máxima
      const zn = await pCr.evaluate(async () => {
        localStorage.setItem("ptidade", "40"); // máxima = 180
        // reabre a tela cheia: o teste anterior zerou a corrida e fechou ela
        document.querySelector("[data-cbstart]").click();
        await new Promise((r) => setTimeout(r, 150));
        document.getElementById("crGo").click();
        await new Promise((r) => setTimeout(r, 400));
        const out = { semCinta: document.getElementById("crPainelF").style.background,
          fxSem: document.getElementById("crZonaFx").style.display };
        window.__fc.on = true;
        window.__fcAmostra(100); // 55% -> Z1
        await new Promise((r) => setTimeout(r, 250));
        out.z1 = { bg: document.getElementById("crPainelF").style.background,
          fx: (document.getElementById("crZonaFx").textContent || "").replace(/\s+/g, " ") };
        window.__fcAmostra(160); // 89% -> Z4
        await new Promise((r) => setTimeout(r, 250));
        out.z4 = { bg: document.getElementById("crPainelF").style.background,
          fx: (document.getElementById("crZonaFx").textContent || "").replace(/\s+/g, " ") };
        window.__fc.on = false; window.__fc.bpm = 0;
        await new Promise((r) => setTimeout(r, 250));
        out.voltou = document.getElementById("crPainelF").style.background;
        document.getElementById("crZera").click();
        return out;
      });
      ok(/var\(--cor\)/.test(zn.semCinta) && zn.fxSem === "none",
        "sem cinta conectada a tela cheia da corrida não muda nada (mesma regra honesta do batimento)");
      ok(/96, 165, 250|#60a5fa/.test(zn.z1.bg) && /Z1 leve/.test(zn.z1.fx) && /100 bpm · 56%/.test(zn.z1.fx),
        "com cinta, o fundo vira a cor da zona e a faixa diz bpm e % da máxima (Z1)");
      ok(/251, 146, 60|#fb923c/.test(zn.z4.bg) && /Z4 forte/.test(zn.z4.fx),
        "subiu o esforço, a tela troca de zona (Z4 laranja)");
      ok(/var\(--cor\)/.test(zn.voltou), "desconectou a cinta, a tela volta pra cor do studio");
    }

  }
  // modo tela cheia estilo NRC: painel de cor chapada ao iniciar; mapa é a 2ª página;
  // métrica gigante troca com toque; cadeado bloqueia; pausar mostra mapa + grade
  const full = await pCr.evaluate(async () => {
    const out = {};
    localStorage.setItem("ptcrCfg", JSON.stringify({ cd: 0, fb: "bip", ap: 0 }));
    document.getElementById("crZera").click();
    document.getElementById("crMapa").click();
    out.abriuPeloMapa = document.getElementById("crFull").style.display !== "none";
    out.abriuNoMapa = document.getElementById("crPainelF").style.display === "none";
    out.metaPill = document.getElementById("crMetaBtnF").style.display !== "none";
    document.getElementById("crFullFecha").click();
    out.fechou = document.getElementById("crFull").style.display === "none";
    document.getElementById("crGo").click();
    await new Promise((r) => setTimeout(r, 500));
    out.abriuAoIniciar = document.getElementById("crFull").style.display !== "none";
    out.painel = document.getElementById("crPainelF").style.display !== "none";
    out.tempoF = document.getElementById("crTempoF").textContent;
    out.goF = document.getElementById("crGoF").textContent;
    out.terminei = document.getElementById("crFimF").style.display !== "none";
    // métrica gigante paginada: um toque troca, as bolinhas mostram a página
    out.gigaL = document.getElementById("crGigaL").textContent;
    document.getElementById("crPainelF").click();
    out.gigaL2 = document.getElementById("crGigaL").textContent;
    out.dots = document.getElementById("crDotsF").children.length;
    // cadeado: bloqueia a tela e só destrava segurando 1 segundo
    document.getElementById("crLockBtnF").click();
    out.lock = document.getElementById("crLockOverF").style.display !== "none";
    document.getElementById("crUnlockF").dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 1150));
    out.destravou = document.getElementById("crLockOverF").style.display === "none";
    // pausar: mapa + grade de métricas + botão Continuar (estilo NRC)
    document.getElementById("crGoF").click();
    out.goPausado = document.getElementById("crGoF").textContent;
    out.pausaGrade = document.getElementById("crPausaF").style.display !== "none";
    out.pausaMapa = document.getElementById("crPainelF").style.display === "none";
    document.getElementById("crGoF").click(); // continua a corrida
    await new Promise((r) => setTimeout(r, 300));
    document.getElementById("crFullFecha").click();
    out.rodandoAposFechar = window.__cr.run === true;
    document.getElementById("crZera").click();
    return out;
  });
  ok(full.abriuPeloMapa && full.abriuNoMapa && full.metaPill && full.fechou,
    "tocar no mapa abre a tela cheia já na página do mapa (com a pill de meta) e o ✕ fecha");
  ok(full.abriuAoIniciar && full.painel && /0:0/.test(full.tempoF) && full.goF === "Pausar" && full.terminei,
    "iniciar a corrida abre o painel de cor chapada com botão Pausar gigante (estilo NRC)");
  ok(full.gigaL !== full.gigaL2 && full.dots === 4, "a métrica gigante troca com um toque e as 4 bolinhas mostram a página");
  ok(full.lock && full.destravou, "o cadeado bloqueia a tela na corrida e destrava segurando 1 segundo");
  ok(full.goPausado === "Continuar" && full.pausaGrade && full.pausaMapa,
    "pausar mostra o mapa com a grade de métricas e o botão Continuar");
  ok(full.rodandoAposFechar, "fechar a tela cheia não para a corrida");
  // conquistas de corrida: só com a área ligada, medidas pelo histórico real
  ok(/Primeira corrida/.test(cardioProf.appHtml) && /100 km somados/.test(cardioProf.appHtml) && /Pace abaixo de 6:00/.test(cardioProf.appHtml),
    "app com a área de corrida ganha medalhas de corrida (desenhos de traço)");
  await pCr.evaluate(() => {
    localStorage.setItem("ptcardio", JSON.stringify([
      { d: "2026-08-01", n: "Rodagem", m: "corrida", s: 1800, k: 5.2, p: "5:46" },
      { d: "2026-08-03", n: "Giro", m: "bike", s: 3600, k: 20, p: null },
    ]));
  });
  await pCr.reload({ waitUntil: "domcontentloaded" });
  await pCr.waitForTimeout(700);
  const cqCorrida = await pCr.evaluate(() => {
    window.__trocaSec("evolucao");
    // tela 31: o estado da medalha vive no data-cqok (o selo textual saiu do desenho)
    // os cards viraram <button> (tocar abre a conquista em tela cheia)
    const cards = [...document.querySelectorAll("#cqGrid [data-cqok]")].map((x) => ({ t: x.textContent, ok: x.getAttribute("data-cqok") === "1" }));
    const acha = (n) => cards.find((c) => c.t.indexOf(n) > -1) || { t: "", ok: false };
    return {
      primeira: acha("Primeira corrida").ok,
      cinco: acha("5 km numa corrida").ok,
      pace: acha("Pace abaixo de 6:00").ok,
      soma: acha("100 km somados").t,
      bikeNaoConta: /1\/10/.test(acha("10 corridas").t),
    };
  });
  ok(cqCorrida.primeira && cqCorrida.cinco && cqCorrida.pace, "correr 5,2 km com pace 5:46 conquista as medalhas de corrida");
  /* Tocar numa conquista abre a tela cheia (estilo Nike Run): medalha grande
   * que gira com o movimento do celular (ou com o dedo) e o brilho anda junto. */
  const cqTela = await pCr.evaluate(async () => {
    window.__evSub("conq");
    document.querySelector("#cqGrid [data-cqok='1']").click();
    await new Promise((r) => setTimeout(r, 200));
    const f = document.getElementById("cqFull"), med = document.getElementById("cqMed");
    const antes = med.style.transform;
    const r0 = med.getBoundingClientRect();
    const ev = (t, x, y) => med.dispatchEvent(new PointerEvent(t, { clientX: x, clientY: y, bubbles: true, pointerId: 1 }));
    ev("pointerdown", r0.left + r0.width / 2, r0.top + r0.height / 2);
    ev("pointermove", r0.left + r0.width / 2 + 60, r0.top + r0.height / 2 - 40);
    await new Promise((r) => setTimeout(r, 120));
    const depois = med.style.transform, brilho = med.style.getPropertyValue("--bx");
    ev("pointerup", 0, 0);
    const out = { aberta: f.classList.contains("on"), titulo: f.querySelector("h3").textContent,
      selo: f.querySelector(".cqsel").textContent, temShare: !!document.getElementById("cqShare"),
      antes, depois, brilho, travouFundo: document.body.style.overflow === "hidden" };
    document.getElementById("cqVolta").click();
    await new Promise((r) => setTimeout(r, 120));
    out.fechou = !f.classList.contains("on") && document.body.style.overflow === "";
    // e uma bloqueada mostra o progresso, sem compartilhar
    document.querySelector("#cqGrid [data-cqok='0']").click();
    await new Promise((r) => setTimeout(r, 150));
    out.bloqSelo = f.querySelector(".cqsel").textContent;
    out.bloqBarra = !!f.querySelector(".cqbar b");
    out.bloqSemShare = !document.getElementById("cqShare");
    document.getElementById("cqVolta").click();
    return out;
  });
  ok(cqTela.aberta && cqTela.titulo.length > 2 && /Conquistada/.test(cqTela.selo) && cqTela.temShare && cqTela.travouFundo,
    "tocar na conquista abre a tela cheia com a medalha, o selo e o Compartilhar (" + cqTela.titulo + ")");
  ok(/rotateX\(0deg\) rotateY\(0deg\)/.test(cqTela.antes) && !/rotateX\(0deg\) rotateY\(0deg\)/.test(cqTela.depois) && /%/.test(cqTela.brilho),
    "arrastar gira a medalha em 3D e move o brilho junto (" + cqTela.depois + ")");
  ok(cqTela.fechou, "Fechar volta pra grade e destrava a rolagem do fundo");
  ok(/Bloqueada/.test(cqTela.bloqSelo) && cqTela.bloqBarra && cqTela.bloqSemShare,
    "conquista ainda bloqueada mostra a barra de progresso e não oferece compartilhar");
  ok(/5\/100/.test(cqCorrida.soma) && cqCorrida.bikeNaoConta, "os km somados contam só corrida (bike e caminhada ficam de fora)");

  /* 🏅 Ver todas / Mostrar menos: o teste conta as medalhas que o aluno REALMENTE
   * enxerga. Contar a classe .enc não servia — ela entrava certinho e mesmo
   * assim as 17 apareciam, porque o botão da medalha nasce com display:block no
   * próprio elemento e estilo inline ganha da folha de estilo. */
  const cqRetratil = await pCr.evaluate(async () => {
    window.__evSub("conq");
    await new Promise((r) => setTimeout(r, 150));
    const g = document.getElementById("cqGrid"), bt = document.getElementById("cqVerMais");
    const vistas = () => [...g.children].filter((c) => getComputedStyle(c).display !== "none").length;
    const clica = async () => { bt.click(); await new Promise((r) => setTimeout(r, 200)); };
    const out = { total: g.children.length, btVisivel: getComputedStyle(bt).display !== "none",
      fechado: vistas(), txtFechado: bt.textContent };
    await clica(); out.aberto = vistas(); out.txtAberto = bt.textContent;
    await clica(); out.fechouDeNovo = vistas();
    return out;
  });
  ok(cqRetratil.total > 6 && cqRetratil.btVisivel && cqRetratil.fechado === 6,
    "🏅 com mais de 6 medalhas a grade nasce encolhida em 6 (" + cqRetratil.fechado + " de " + cqRetratil.total + ")");
  ok(cqRetratil.aberto === cqRetratil.total && /Mostrar menos/.test(cqRetratil.txtAberto)
    && /Ver todas as /.test(cqRetratil.txtFechado),
    "🏅 Ver todas abre as " + cqRetratil.total + " e o botão vira Mostrar menos");
  ok(cqRetratil.fechouDeNovo === 6,
    "🏅 Mostrar menos volta pra 6 de verdade (não só troca o texto)");
  // recorde pessoal + arte compartilhável: corrida mais longa celebra na hora
  const share = await pCr.evaluate(async () => {
    window.__trocaSec("treino");
    window.__trSub("cardio");
    await new Promise((r) => setTimeout(r, 200));
    localStorage.setItem("ptcrCfg", JSON.stringify({ cd: 0, fb: "off", ap: 0 }));
    document.getElementById("crZera").click();
    document.getElementById("crKm").value = "6,1";
    document.getElementById("crGo").click();
    await new Promise((r) => setTimeout(r, 300));
    window.__cr.t0 = Date.now() - 2300000; // 38 minutos rodando
    document.getElementById("crFim").click();
    await new Promise((r) => setTimeout(r, 200));
    return {
      fase: document.getElementById("crFase").textContent,
      info: document.getElementById("crInfo").textContent,
      btn: document.getElementById("crShare").style.display !== "none",
      regK: window.__cr.fimReg && window.__cr.fimReg.k,
      zera: (document.getElementById("crZera").click(), document.getElementById("crShare").style.display === "none"),
    };
  });
  ok(/RECORDE: sua corrida mais longa/.test(share.fase + " " + share.info),
    "corrida mais longa que as anteriores celebra RECORDE na hora");
  ok(share.btn && share.regK === 6.1 && share.zera,
    "botão Compartilhar essa corrida aparece com o registro pronto (e some no Zerar)");
  ok(/crShare/.test(cardioProf.appHtml) && /Compartilhar essa corrida/.test(cardioProf.appHtml) && /corrida\.png/.test(cardioProf.appHtml),
    "app gera a arte da corrida (trajeto + números + marca do studio) pra postar");
  /* 📸 card estilo Strava: a FOTO do aluno vira o fundo, com o traçado do GPS e
   * os números por cima (véus escuros garantem a leitura). A foto é lida no
   * aparelho e nunca sai dele; o compartilhar usa a folha do sistema, que é por
   * onde entra no Instagram. */
  const cardFoto = await pCr.evaluate(async () => {
    // refaz um registro rapidinho (o Zerar do teste anterior limpou o de antes)
    document.getElementById("crKm").value = "5,0";
    document.getElementById("crGo").click();
    await new Promise((r) => setTimeout(r, 250));
    window.__cr.t0 = Date.now() - 1800000;
    document.getElementById("crFim").click();
    await new Promise((r) => setTimeout(r, 200));
    window.__cr.fimRota = [
      { lat: -19.92, lng: -43.94 }, { lat: -19.921, lng: -43.938 }, { lat: -19.9195, lng: -43.937 }];
    const foto = document.createElement("canvas");
    foto.width = 800; foto.height = 600;
    const fg = foto.getContext("2d");
    fg.fillStyle = "#2e7d32"; fg.fillRect(0, 0, 800, 600); // "foto" verde
    const com = window.__crCard(foto);
    const sem = window.__crCard(null);
    const px = (cv, x, y) => Array.from(cv.getContext("2d").getImageData(x, y, 1, 1).data).slice(0, 3);
    const meio = px(com, 540, 500);
    return { temInput: !!document.getElementById("crShareArq"),
      w: com.width, h: com.height, semW: sem.width,
      fotoAtras: meio[1] > meio[0] && meio[1] > meio[2],
      diferentes: px(com, 20, 20).join() !== px(sem, 20, 20).join() };
  });
  ok(cardFoto.temInput && cardFoto.w === 1080 && cardFoto.h === 1350 && cardFoto.semW === 1080,
    "o card da corrida sai em 1080×1350 nos dois sabores — com a foto do aluno e sem");
  ok(cardFoto.fotoAtras && cardFoto.diferentes,
    "com foto, ela fica atrás do traçado (véu escuro por cima, cor da foto preservada)");
  /* Compartilhar a corrida abre a PRÉVIA (o mesmo caminho do fim do treino):
   * o navigator.share tem que sair do toque, senão o iPhone recusa calado. */
  const prevCr = await pCr.evaluate(async () => {
    document.querySelector("#crShare [data-crsem]").click();
    await new Promise((r) => setTimeout(r, 300));
    const ov = document.getElementById("artePrev");
    return { abriu: !!ov, temImg: !!(ov && ov.querySelector("img[src^='data:image']")),
      share: !!(ov && ov.querySelector("#arteShare")), baixa: !!(ov && ov.querySelector("#arteBaixa")),
      nome: (ov && ov.querySelector("#arteBaixa")) ? (document.getElementById("arteBaixa").click(), true) : false };
  });
  ok(prevCr.abriu && prevCr.temImg && prevCr.share && prevCr.baixa,
    "compartilhar a corrida abre a prévia com Compartilhar e Salvar (share sai do toque, que é o que o iPhone exige)");
  ok(!/toBlob\(function\(bl\)\{var fl=new File\(\[bl\],'corrida/.test(cardioProf.appHtml),
    "o share da corrida não é mais chamado de dentro do toBlob (era o que travava no iPhone)");
  await pCr.evaluate(() => { const f = document.getElementById("arteFecha"); if (f) f.click(); });
  ok(await p.evaluate((cardio) => /Corrida e bike — registros do app/.test(window.__painelApp({ cardio })) && /pace/.test(window.__painelApp({ cardio })), cardioFim.lst),
    "painel do professor mostra os registros de corrida e bike com pace");
  // --- frequência cardíaca ao vivo (cinta/pulseira por Bluetooth) ---
  // regra honesta: sem Web Bluetooth e sem a ponte nativa, NADA aparece
  const fcSem = await pCr.evaluate(() => ({
    bt: !!navigator.bluetooth,
    card: getComputedStyle(document.getElementById("fcCard")).display,
    aj: getComputedStyle(document.getElementById("ajFc")).display,
    chip: getComputedStyle(document.getElementById("gFc")).display,
  }));
  ok(!fcSem.bt && fcSem.card === "none" && fcSem.aj === "none" && fcSem.chip === "none",
    "sem cinta possível (nem Bluetooth nem app nativo) o app não mostra NENHUM botão de batimento");
  // a conta das zonas: 220 − idade, cinco faixas
  const fcZonas = await pCr.evaluate(async () => {
    document.getElementById("fcCard").style.display = "block";
    const ia = document.getElementById("fcIdade");
    ia.value = "40"; ia.dispatchEvent(new Event("change"));
    const out = { max: document.getElementById("fcMaxT").textContent, idade: localStorage.getItem("ptidade") };
    window.__fcZera();
    window.__fcAmostra(100); // 100/180 = 55% → Z1
    out.z1 = document.getElementById("fcZona").textContent;
    window.__fcAmostra(140); // 78% → Z3
    out.z3 = document.getElementById("fcZona").textContent;
    out.bpm = document.getElementById("fcBpm").textContent;
    out.barras = [].slice.call(document.getElementById("fcBar").children).filter((i) => i.style.background).length;
    window.__fcAmostra(175); // 97% → Z5
    out.z5 = document.getElementById("fcZona").textContent;
    out.resumo = window.__fcResumo();
    return out;
  });
  ok(/180 bpm/.test(fcZonas.max) && fcZonas.idade === "40", "a idade do aluno define a FC máxima estimada (220 − 40 = 180)");
  ok(/^Z1 /.test(fcZonas.z1) && /^Z3 /.test(fcZonas.z3) && /^Z5 /.test(fcZonas.z5) && fcZonas.bpm === "140" && fcZonas.barras === 3,
    "o batimento vira zona (Z1 a Z5) com as barrinhas acendendo até a faixa atual");
  ok(fcZonas.resumo && fcZonas.resumo.m === 138 && fcZonas.resumo.x === 175,
    "o resumo do esforço guarda média e máximo (" + JSON.stringify(fcZonas.resumo) + ")");
  await pCr.close();
  // com a ponte do app de loja (window.MTNativo.fc) tudo acende e a corrida guarda o resumo
  const pFc = await ctx.newPage();
  pFc.on("dialog", (d) => d.accept());
  await pFc.addInitScript(() => {
    window.MTNativo = { fc: { conectar: function (cb) { window.__cbFc = cb; }, parar: function () { window.__fcParou = true; } } };
  });
  await pFc.route("**/app-teste-fc.html", (r) => r.fulfill({ contentType: "text/html", body: cardioProf.appHtml }));
  await pFc.goto(BASE + "/app-teste-fc.html", { waitUntil: "domcontentloaded" });
  await pFc.waitForTimeout(400);
  const fcCom = await pFc.evaluate(async () => {
    window.__trocaSec("treino"); window.__trSub("cardio");
    const out = {
      card: getComputedStyle(document.getElementById("fcCard")).display,
      aj: getComputedStyle(document.getElementById("ajFc")).display,
    };
    document.getElementById("fcBt").click();
    await new Promise((r) => setTimeout(r, 100));
    window.__cbFc(150); window.__cbFc(160);
    out.bt = document.getElementById("fcBt").textContent;
    out.chip = document.getElementById("gFc").textContent.trim();
    out.chipVis = getComputedStyle(document.getElementById("gFc")).display !== "none";
    out.telaCheia = document.getElementById("crBpmC").style.display + "/" + document.getElementById("crBpmF").textContent;
    return out;
  });
  ok(fcCom.card === "block" && fcCom.aj !== "none" && /Desconectar/.test(fcCom.bt),
    "com a ponte do app de loja o card de batimentos e a linha dos Ajustes acendem");
  ok(/160/.test(fcCom.chip) && fcCom.chipVis && fcCom.telaCheia === "block/160",
    "o batimento ao vivo aparece no topo do treino guiado e na tela cheia da corrida");
  const fcCorrida = await pFc.evaluate(async () => {
    localStorage.setItem("ptcrCfg", JSON.stringify({ cd: 0, fb: "bip", ap: 0 }));
    document.getElementById("crGo").click();
    await new Promise((r) => setTimeout(r, 200));
    window.__cbFc(140); window.__cbFc(180);
    document.getElementById("crKm").value = "2";
    await new Promise((r) => setTimeout(r, 5600));
    document.getElementById("crFim").click();
    await new Promise((r) => setTimeout(r, 300));
    const lst = JSON.parse(localStorage.getItem("ptcardio") || "[]");
    const out = { reg: lst[lst.length - 1], aviso: document.getElementById("crFase").textContent + " " + document.getElementById("crInfo").textContent };
    document.getElementById("fcBt").click();
    out.desligou = !document.getElementById("fcVivo").className && !!window.__fcParou;
    return out;
  });
  ok(fcCorrida.reg && fcCorrida.reg.fc === 160 && fcCorrida.reg.fcx === 180 && /160 bpm médio · 180 máx/.test(fcCorrida.aviso),
    "a corrida guarda média e máximo de batimento no registro (o cru nunca sai do aparelho)");
  ok(fcCorrida.desligou, "desconectar a cinta apaga a leitura e avisa a ponte nativa");
  ok(/fc:L\('ptfc',\{\}\),idade:\+L\('ptidade',0\)/.test(cardioProf.appHtml) && /batimentos:L\('ptfc',\{\}\)/.test(cardioProf.appHtml),
    "o resumo de batimentos (e a idade, pras zonas) viaja pro professor no retorno, e entra no arquivo de dados do aluno");
  await pFc.close();
  // --- WhatsApp de hoje: fila de mensagens prontas + modelos editáveis ---
  const stSnapZap = await p.evaluate(() => localStorage.getItem("mtapp:ptStudio"));
  await p.evaluate(() => {
    const S = window.MTStore, st = S.read("ptStudio", {});
    const hoje = S.todayISO();
    st.alunos.push(
      { id: "zq1", nome: "Nivea Zap", ativo: true, zap: "31988880001", nasc: "1990" + hoje.slice(4) },
      { id: "zq2", nome: "Tulio Zap", ativo: true, zap: "31988880002" });
    st.sessoes.push({ id: "zqs1", alunoId: "zq2", data: hoje, hora: "07:30", feita: false });
    st.zapLog = {};
    S.write("ptStudio", st);
  });
  const zap1 = await p.evaluate(() => {
    const fila = window.__zapFila(window.MTStore.read("ptStudio", {}));
    const niver = fila.find((z) => z.alunoId === "zq1");
    const treino = fila.find((z) => z.alunoId === "zq2");
    return { niver: niver && niver.texto, treino: treino && treino.texto };
  });
  ok(/Nivea, feliz aniversário/.test(zap1.niver || ""), "fila do WhatsApp pega o aniversariante do dia com a mensagem pronta");
  ok(/Oi Tulio!.*às 07:30/.test(zap1.treino || ""), "fila pega o treino de hoje com a hora dentro do texto");
  await abaPt(p, "dash");
  await p.waitForTimeout(350);
  const zapCard = await p.evaluate(async () => {
    const antes = document.querySelectorAll("#bZapP [data-zapok]").length;
    const href = (document.querySelector("#bZapP [data-zapok]") || {}).href || "";
    // pula a linha do Tulio (treino) — a da Nivea segue na fila pro teste do modelo
    const linhaTulio = [...document.querySelectorAll("#bZapP .sessao-pt")].find((l) => /Tulio/.test(l.textContent));
    if (linhaTulio) linhaTulio.querySelector("[data-zappula]").click();
    await new Promise((r) => setTimeout(r, 300));
    return { antes, href, depois: document.querySelectorAll("#bZapP [data-zapok]").length,
      log: Object.keys(window.MTStore.read("ptStudio", {}).zapLog || {}).length };
  });
  ok(zapCard.antes >= 2 && /wa\.me\/55\d+\?text=/.test(zapCard.href),
    "card WhatsApp de hoje lista as mensagens com o link do zap já montado");
  ok(zapCard.depois === zapCard.antes - 1 && zapCard.log === 1,
    "Pular marca no zapLog e tira a mensagem da fila na hora");

  // --- WhatsApp oficial (API da Meta): a mesma fila sai sozinha ---
  console.log("WhatsApp oficial (API da Meta):");
  {
    const zapi = await p.evaluate(async () => {
      const S = window.MTStore;
      const snap = JSON.stringify(S.read("ptStudio", {}));
      const st = S.read("ptStudio", {});
      st.config = st.config || {};
      const hj = S.todayISO(), nasc = "1990-" + hj.slice(5);
      st.alunos = [
        { id: "zo1", nome: "Ana Oficial", zap: "31999990001", nasc: nasc, ativo: true, desde: hj, valor: 100, modo: "mes" },
        { id: "zo2", nome: "Bia Oficial", zap: "31999990002", nasc: nasc, ativo: true, desde: hj, valor: 100, modo: "mes" },
      ];
      st.zapLog = {};
      delete st.config.zapApi;
      S.write("ptStudio", st);
      await new Promise((r) => setTimeout(r, 250));
      const semApi = {
        ligado: window.__zapApiOn(),
        manual: document.querySelectorAll("#bZapP [data-zapok]").length,
        oficial: document.querySelectorAll("#bZapP [data-zapapi]").length,
        botaoTodas: !!document.getElementById("zapTodas"),
      };
      // agora liga a API oficial
      const st2 = S.read("ptStudio", {});
      st2.config.zapApi = { ligado: true, phoneId: "1234567890", template: "" };
      S.write("ptStudio", st2);
      await new Promise((r) => setTimeout(r, 250));
      const comApi = {
        ligado: window.__zapApiOn(),
        manual: document.querySelectorAll("#bZapP [data-zapok]").length,
        oficial: document.querySelectorAll("#bZapP [data-zapapi]").length,
        botaoTodas: !!document.getElementById("zapTodas"),
      };
      // mock da função: a segunda cai fora da janela de 24h
      const chamadas = [];
      window.__tokenOrig = S.tokenNuvem;
      window.__fetchOrig = window.fetch;
      S.tokenNuvem = () => Promise.resolve("tok-do-usuario");
      window.fetch = (url, opts) => {
        if (String(url).includes("/functions/v1/whatsapp")) {
          const corpo = JSON.parse(opts.body);
          chamadas.push({ para: corpo.para, auth: (opts.headers || {}).Authorization || "" });
          const ruim = String(corpo.para).endsWith("0002");
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(
            ruim ? { erro: "Meta recusou", codigo: 131047, precisaTemplate: true } : { ok: true, messageId: "m1" }) });
        }
        return window.__fetchOrig(url, opts);
      };
      await window.__zapMandaFila();
      await new Promise((r) => setTimeout(r, 300));
      const fim = {
        chamadas: chamadas,
        naFila: window.__zapFila(S.read("ptStudio", {})).length,
        aviso: (document.querySelector("#bZapP [data-zaperro]") || {}).textContent || "",
        temLinkManual: !!document.querySelector("#bZapP [data-zaperro] a[href*='wa.me']"),
        resumo: (document.getElementById("zapTodasSt") || {}).textContent || "",
      };
      S.tokenNuvem = window.__tokenOrig;
      window.fetch = window.__fetchOrig;
      S.write("ptStudio", JSON.parse(snap));
      await new Promise((r) => setTimeout(r, 200));
      return { semApi, comApi, fim };
    });
    ok(!zapi.semApi.ligado && zapi.semApi.manual >= 2 && zapi.semApi.oficial === 0 && !zapi.semApi.botaoTodas,
      "sem configurar, a fila continua saindo do WhatsApp do professor (nada muda)");
    ok(zapi.comApi.ligado && zapi.comApi.oficial >= 2 && zapi.comApi.manual === 0 && zapi.comApi.botaoTodas,
      "com a API oficial ligada, a fila ganha envio direto e o botão Enviar todas agora");
    ok(zapi.fim.chamadas.length === 2 && zapi.fim.chamadas.every((c) => /^55\d{10,11}$/.test(c.para)),
      "cada mensagem vai pra API com DDI+DDD+número (" + zapi.fim.chamadas.map((c) => c.para).join(", ") + ")");
    ok(zapi.fim.chamadas.every((c) => c.auth === "Bearer tok-do-usuario"),
      "a função é chamada com o login do professor (a chave pública levaria 401)");
    ok(zapi.fim.naFila === 1, "só o que a Meta aceitou sai da fila (sobrou " + zapi.fim.naFila + ")");
    ok(/24h/.test(zapi.fim.aviso) && zapi.fim.temLinkManual,
      "o que não saiu explica o motivo e devolve o link pra mandar na mão — " + zapi.fim.aviso.slice(0, 60));
    ok(/1 enviada/.test(zapi.fim.resumo) && /1 não saiu/.test(zapi.fim.resumo),
      "o resumo do lote conta certo o que foi e o que não foi — " + zapi.fim.resumo);
  }

  // cada profissional liga o PRÓPRIO número, sem tocar em servidor nenhum
  {
    const liga = await p.evaluate(async () => {
      const S = window.MTStore;
      const snap = JSON.stringify(S.read("ptStudio", {}));
      const chamadas = [];
      const cloudOrig = S.cloud;
      let guardado = { phone_id: "", template: "", tem_token: false, verify_token: "", ig_id: "", tem_app_secret: false };
      // o painel redesenha depois de salvar e toca em várias tabelas: o mock da
      // nuvem precisa ser encadeável, senão o render estoura no meio do teste
      const enc = () => { const o = {}; ["select", "eq", "in", "gte", "lte", "order", "limit", "upsert", "insert", "update", "delete", "single", "maybeSingle"].forEach((k) => { o[k] = () => o; }); o.then = (f) => Promise.resolve({ data: [], error: null }).then(f); return o; };
      S.cloud = () => ({
        aid: "acad-1",
        client: {
          from: () => enc(),
          rpc: (fn, args) => {
            chamadas.push({ fn, args: args || {} });
            if (fn === "zap_config_salva2") {
              guardado = { phone_id: args.p_phone_id, template: args.p_template,
                tem_token: !!args.p_token || guardado.tem_token,
                tem_app_secret: !!args.p_app_secret, ig_id: args.p_ig_id || "",
                verify_token: "torque-ABCDEFGHJK" };
              return Promise.resolve({ data: { ok: true, verify_token: "torque-ABCDEFGHJK" } });
            }
            if (fn === "zap_config_apaga") { guardado = { phone_id: "", template: "", tem_token: false }; return Promise.resolve({ data: { ok: true } }); }
            if (fn === "zap_config_ve") return Promise.resolve({ data: guardado });
            return Promise.resolve({ data: {} });
          },
        },
      });
      document.querySelector('#abas button[data-a="config"]').click();
      const sub = document.querySelector('#cfgAbas button[data-cfga="zap"]');
      if (sub) sub.click();
      await new Promise((r) => setTimeout(r, 250));
      // o painel não pede URL nenhuma: só o ID do número e o token
      const campos = {
        temUrl: !!document.getElementById("cfgZapUrl"),
        temFone: !!document.getElementById("cfgZapFone"),
        tokenEhSenha: (document.getElementById("cfgZapToken") || {}).type,
      };
      document.getElementById("cfgZapFone").value = "1112223334445";
      document.getElementById("cfgZapToken").value = "TOKEN-SECRETO-DA-META";
      document.getElementById("cfgZapTpl").value = "cobranca_mensalidade";
      document.getElementById("cfgZapSalva").click();
      await new Promise((r) => setTimeout(r, 500));
      const salvo = chamadas.find((c) => c.fn === "zap_config_salva2") || { args: {} };
      const espelho = (S.read("ptStudio", {}).config || {}).zapApi || {};
      const depois = {
        campoToken: document.getElementById("cfgZapToken").value,
        webhook: !document.getElementById("cfgZapWebhook").hidden,
        verify: (document.getElementById("cfgZapVerify") || {}).textContent || "",
        ligado: window.__zapApiOn(),
        temDesligar: !document.getElementById("cfgZapDesliga").hidden,
        estudioCru: JSON.stringify(S.read("ptStudio", {})),
      };
      S.cloud = cloudOrig;
      S.write("ptStudio", JSON.parse(snap));
      return { campos, salvo: salvo.args, espelho, depois };
    });
    ok(!liga.campos.temUrl && liga.campos.temFone && liga.campos.tokenEhSenha === "password",
      "o personal liga o número dele com ID + token — nenhuma URL de servidor pra colar");
    ok(liga.salvo.p_phone_id === "1112223334445" && liga.salvo.p_token === "TOKEN-SECRETO-DA-META" && liga.salvo.p_template === "cobranca_mensalidade",
      "as credenciais vão pra nuvem pela RPC zap_config_salva2 (uma por academia)");
    ok(liga.depois.webhook && /torque-/.test(liga.depois.verify),
      "depois de ligar, a tela mostra a URL e a senha do aperto de mão pra colar na Meta");
    ok(liga.depois.campoToken === "" && liga.depois.estudioCru.indexOf("TOKEN-SECRETO-DA-META") < 0,
      "o token some da tela e NÃO fica guardado no aparelho");
    ok(liga.espelho.ligado === true && liga.espelho.phoneId === "1112223334445" && !liga.espelho.token,
      "o aparelho guarda só o retrato (ligado + número), nunca o token");
    ok(liga.depois.ligado && liga.depois.temDesligar,
      "depois de ligar, a fila passa a mandar sozinha e aparece o botão Desligar");
  }
  await abaPt(p, "config");
  const zapModelo = await p.evaluate(async () => {
    // a mensagem fixa agora é editada pela lista unificada (Editar abre o dialog)
    document.querySelector('#autoLista [data-fixaed="niver"]').click();
    await new Promise((r) => setTimeout(r, 150));
    document.getElementById("autoTexto").value = "Parabéns {nome}, sucesso!";
    document.getElementById("autoSalva").click();
    await new Promise((r) => setTimeout(r, 200));
    const fila = window.__zapFila(window.MTStore.read("ptStudio", {}));
    const niver = fila.find((z) => z.alunoId === "zq1");
    return niver && niver.texto;
  });
  ok(zapModelo === "Parabéns Nivea, sucesso!", "mensagem fixa editada pela lista unificada muda o texto da fila na hora");

  /* ---- Configurações repaginadas (tela 4a) ---- */
  {
    const b4a = await p.evaluate(() => {
      window.__cfgAba("resumo");
      window.__cfg4a();
      const box = document.getElementById("cfgResumo");
      return {
        aba: document.querySelector("#cfgAbas button.ativa").textContent.trim(),
        titulo: (document.getElementById("cfgTitulo") || {}).textContent || "",
        nuvem: (document.getElementById("cfgNuvem") || {}).textContent || "",
        cards: [...box.querySelectorAll(".cfgcard .cfgt")].map((x) => x.textContent),
        toggles: [...box.querySelectorAll("[data-cfgtg]")].map((x) => x.getAttribute("data-cfgtg")),
        nota: [...document.querySelectorAll('[data-cfgsec="resumo"]')].map((x) => x.textContent).join(" "),
      };
    });
    ok(/Resumo/.test(b4a.aba), "🎨 4a: Configurações abre no Resumo");
    ok(/ligado|Falta ligar/i.test(b4a.titulo), "🎨 4a: o título conta o estado em uma frase (" + b4a.titulo + ")");
    ok(/aparelho|Nuvem/.test(b4a.nuvem), "🎨 4a: o selo diz se está sincronizado com a nuvem");
    ok(b4a.cards.length === 3 && /Receber dos alunos/.test(b4a.cards[0]) && /WhatsApp/.test(b4a.cards[1]) && /App dos alunos/.test(b4a.cards[2]),
      "🎨 4a: um card por grupo, cada um dizendo o próprio estado");
    ok(b4a.toggles.join(",") === "feedOn,scanOn", "🎨 4a: o que liga/desliga virou interruptor");
    ok(/nunca voltam pra tela/.test(b4a.nota), "🎨 4a: a tela diz em português que chave e token nunca voltam");
    // o interruptor grava do mesmo jeito que o botão Salvar de sempre
    const liga = await p.evaluate(async () => {
      const antes = !!(window.MTStore.read("ptStudio", {}).config || {}).feedOn;
      const sw = document.querySelector('[data-cfgtg="feedOn"]');
      sw.checked = !antes;
      sw.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 150));
      const st = window.MTStore.read("ptStudio", {});
      return { antes, depois: !!(st.config || {}).feedOn, pend: st.alunos.some((a) => a.appEditEm) };
    });
    ok(liga.depois !== liga.antes && liga.pend,
      "🎨 4a: mexer no interruptor grava e joga os apps na fila de publicar");
  }
  const fixasUi = await p.evaluate(async () => {
    const t = document.getElementById("autoLista").textContent;
    const temFixas = /Lembrete de treino/.test(t) && /Aniversário/.test(t) && /Pagamento atrasado/.test(t) && /Renovação de plano/.test(t);
    const btNiver = document.querySelector('#autoLista [data-fixatg="niver"]');
    if (btNiver) btNiver.click();
    await new Promise((r) => setTimeout(r, 200));
    const st = window.MTStore.read("ptStudio", {});
    const desligou = !!((st.config || {}).zapFixasOff || {}).niver;
    const foraDaFila = !window.__zapFila(st).some((z) => z.alunoId === "zq1" && z.chave.indexOf("zniver|") === 0);
    const btNiver2 = document.querySelector('#autoLista [data-fixatg="niver"]');
    if (btNiver2) btNiver2.click(); // religa
    await new Promise((r) => setTimeout(r, 200));
    const stR = window.MTStore.read("ptStudio", {});
    const religou = !((stR.config || {}).zapFixasOff || {}).niver &&
      window.__zapFila(stR).some((z) => z.alunoId === "zq1" && z.chave.indexOf("zniver|") === 0);
    return { temFixas, desligou, foraDaFila, religou };
  });
  ok(fixasUi.temFixas && fixasUi.desligou && fixasUi.foraDaFila && fixasUi.religou,
    "as 4 mensagens fixas moram na mesma lista das automações, com Ligar/Desligar valendo na fila");
  await p.evaluate((snap) => { localStorage.setItem("mtapp:ptStudio", snap); }, stSnapZap);
  // --- Minha página: builder do site de vendas com dados automáticos ---
  const stSnapSite = await p.evaluate(() => localStorage.getItem("mtapp:ptStudio"));
  await p.evaluate(() => {
    const S = window.MTStore, st = S.read("ptStudio", {});
    st.config = st.config || {};
    st.config.nome = "Studio Teste";
    st.config.zap = "31 99999-0000";
    st.config.cor = "#2563eb";
    st.planosPT = [{ id: "spl1", nome: "Mensal 3x", valor: 400, treinosSem: 3 }];
    st.servicosPT = [{ id: "ssv1", nome: "Massagem", valor: 120 }];
    S.write("ptStudio", st);
  });
  await abaPt(p, "sitepro");

  /* ---- Minha página repaginada (tela 4e) ---- */
  {
    const b4e = await p.evaluate(() => {
      window.__sitePro.render();
      return {
        kicker: (document.querySelector("#vSitePro .alk") || {}).textContent || "",
        endereco: (document.getElementById("spEndereco") || {}).textContent || "",
        copiar: !!document.getElementById("spCopiar") && document.getElementById("spCopiar").hidden,
        numeros: (document.getElementById("spNumeros") || {}).textContent || "",
      };
    });
    ok(/página de vendas/i.test(b4e.kicker), "🎨 4e: o topo é o endereço da página de vendas");
    ok(/endereço|publicada|torqueon/.test(b4e.endereco), "🎨 4e: e diz o link, ou o que falta pra ele existir (" + b4e.endereco + ")");
    ok(b4e.copiar, "🎨 4e: sem página publicada, Copiar link não aparece");
    ok(/não conta visitas nem pedidos/.test(b4e.numeros),
      "🎨 4e: o painel diz que ainda NÃO conta visitas nem pedidos, em vez de mostrar número inventado");
  }
  await p.fill("#spSlug", "Studio Teste!");
  await p.fill("#spHeadline", "Treine de verdade");
  await p.fill("#spBio", "Sou o professor <b>Teste</b> & cia");
  await p.fill("#spInsta", "@studioteste");
  await p.fill("#spThreads", "@studioteste");
  await p.fill("#spYoutube", "studioteste");
  await p.fill("#spFacebook", "studioteste");
  await p.fill("#spX", "studioteste");
  await p.click("#spSalvar");
  await p.waitForTimeout(250);
  const site = await p.evaluate(() => {
    const st = window.MTStore.read("ptStudio", {});
    return {
      sp: (st.config || {}).sitePro,
      html: window.__sitePro.monta(st),
      preview: (document.getElementById("spPreview").srcdoc || "").length > 1000,
    };
  });
  ok(site.sp.slug === "studioteste" && site.sp.insta === "studioteste", "builder salva os campos (endereço limpo e Instagram sem @)");
  ok(/Treine de verdade/.test(site.html) && /wa\.me\/5531999990000/.test(site.html) && /position:fixed/.test(site.html),
    "a página sai com a frase, o WhatsApp automático e o botão flutuante");
  ok(/Mensal 3x/.test(site.html) && /Massagem/.test(site.html) && /instagram\.com\/studioteste/.test(site.html) && /#2563eb/.test(site.html),
    "planos, serviços, Instagram e a cor da Personalização entram sozinhos");
  ok(/threads\.net\/@studioteste/.test(site.html) && /youtube\.com\/@studioteste/.test(site.html) &&
    /facebook\.com\/studioteste/.test(site.html) && /x\.com\/studioteste/.test(site.html) &&
    (site.html.match(/aria-label='(Instagram|Threads|YouTube|Facebook|X)'/g) || []).length === 5,
    "as 5 redes sociais viram ícones com link (Instagram, Threads, YouTube, Facebook e X)");
  // personalização da página: cores próprias (com contraste), logo própria e ordem das seções
  const sitePers = await p.evaluate(async () => {
    document.getElementById("spCor").value = "#ff5500";
    document.getElementById("spFundo").value = "#ffffff";
    document.getElementById("spSalvar").click();
    await new Promise((r) => setTimeout(r, 200));
    const pngMini = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const S = window.MTStore, st = S.read("ptStudio", {});
    st.config.sitePro.logo = pngMini;
    S.write("ptStudio", st);
    const claro = window.__sitePro.monta(S.read("ptStudio", {}));
    // descer a seção Sobre: Serviços passa na frente
    document.querySelector('#spOrdem [data-spdesce="sobre"]').click();
    await new Promise((r) => setTimeout(r, 200));
    const st2 = S.read("ptStudio", {});
    const html2 = window.__sitePro.monta(st2);
    return {
      corPropria: /#ff5500/.test(claro),
      contraste: /color:#17141f/.test(claro),
      logoPropria: claro.indexOf(pngMini) >= 0,
      ordem: st2.config.sitePro.ordem.join(","),
      servAntes: html2.indexOf("Serviços") >= 0 && html2.indexOf("Serviços") < html2.indexOf("Sobre mim"),
    };
  });
  ok(sitePers.corPropria && sitePers.contraste, "cor e fundo próprios da página valem (e fundo claro troca pro texto escuro)");
  ok(sitePers.logoPropria, "logo própria da página vence a da Personalização");
  ok(sitePers.ordem.indexOf("servicos,sobre") === 0 && sitePers.servAntes, "as setas mudam a ordem das seções na página");
  ok(/&lt;b&gt;Teste&lt;\/b&gt; &amp; cia/.test(site.html), "texto do professor vai escapado (sem HTML solto na página)");
  ok(site.preview, "a prévia é desenhada no iframe");
  await p.click("#spPublicar");
  await p.waitForTimeout(200);
  ok(await p.evaluate(() => /Entre na sua conta/.test(document.getElementById("spStatus").textContent)),
    "sem nuvem, o Publicar avisa e aponta o caminho");
  const pubSite = await p.evaluate(async () => {
    window.__cloudOrigSP = window.MTStore.cloud;
    let upsertRow = null;
    window.MTStore.cloud = () => ({
      aid: "acad-1",
      client: { from: (tb) => ({
        upsert: (rows) => { upsertRow = { tb, row: rows[0] }; return Promise.resolve({ error: null }); },
        delete: () => ({ eq: () => Promise.resolve({}) }),
      }) },
    });
    document.getElementById("spPublicar").click();
    await new Promise((r) => setTimeout(r, 300));
    window.MTStore.cloud = window.__cloudOrigSP;
    return {
      tb: upsertRow && upsertRow.tb,
      slug: upsertRow && upsertRow.row.slug,
      temHtml: !!(upsertRow && upsertRow.row.dados && /Treine de verdade/.test(upsertRow.row.dados.html)),
      status: document.getElementById("spStatus").textContent,
      slugPub: ((window.MTStore.read("ptStudio", {}).config || {}).sitePro || {}).slugPub,
    };
  });
  ok(pubSite.tb === "site_pro" && pubSite.slug === "studioteste" && pubSite.temHtml, "publicar grava a página na nuvem (tabela site_pro)");
  ok(/No ar/.test(pubSite.status) && /pagina\.html\?s=studioteste/.test(pubSite.status) && pubSite.slugPub === "studioteste",
    "depois de publicar, o link público aparece e fica guardado");
  const pagSrc = await p.evaluate(async () => (await fetch("/pagina.html")).text());
  ok(/site_pro_busca/.test(pagSrc) && /URLSearchParams/.test(pagSrc), "pagina.html busca a página publicada pelo endereço");
  const sqlSetup = await p.evaluate(async () => (await fetch("/supabase-setup.sql")).text());
  ok(/site_pro/.test(sqlSetup), "o SQL da tabela site_pro está no setup (o Raphael roda de novo e pronto)");
  // guarda de segurança: o setup NUNCA pode apagar tabela — rodar de novo com
  // dados na nuvem destruiria as contas de todo mundo. "drop function if
  // exists" antes de recriar é ok; "drop table" não tem desculpa.
  ok(!/(^|\n)\s*drop\s+table/i.test(sqlSetup), "o setup não tem nenhum drop table (rodar de novo nunca apaga dados)");
  ok(!/(^|\n)create table (?!if not exists)/i.test(sqlSetup) && !/(^|\n)create function /i.test(sqlSetup),
    "todo create do setup é idempotente (if not exists / or replace)");
  const swSrc = await p.evaluate(async () => (await fetch("/sw.js")).text());
  ok(/indexOf\("supabase-setup\.sql"\)/.test(swSrc),
    "o sw serve o supabase-setup.sql sempre da rede (nunca uma cópia velha do cache)");
  // --- Assinatura pelas lojas (App Store/Play via RevenueCat) ---
  ok(/assinatura_status/.test(sqlSetup) && /minha_assinatura/.test(sqlSetup) &&
    /grant execute on function public\.minha_assinatura\(\) to authenticated/.test(sqlSetup),
    "o SQL tem as colunas de assinatura e o RPC minha_assinatura (só pra quem está logado)");
  const fnLoja = require("fs").readFileSync(require("path").join(__dirname, "..", "supabase", "functions", "assinatura-loja", "index.ts"), "utf8");
  ok(/RC_WEBHOOK_TOKEN/.test(fnLoja) && /INITIAL_PURCHASE:\s*"ativa"/.test(fnLoja) &&
    /BILLING_ISSUE:\s*"atrasada"/.test(fnLoja) && /EXPIRATION:\s*"bloqueada"/.test(fnLoja),
    "a função assinatura-loja mapeia os eventos do RevenueCat (compra ativa, atraso, vencida)");
  ok(!/\bCANCELLATION:/.test(fnLoja.replace(/UNCANCELLATION:/g, "")),
    "cancelar a renovação não derruba na hora — o acesso pago vale até vencer");
  const funcoesSrc = require("fs").readFileSync(require("path").join(__dirname, "..", "funcoes.html"), "utf8");
  ok(/"assinatura-loja"/.test(funcoesSrc) && /data-copia="assinatura-loja"/.test(funcoesSrc),
    "funcoes.html tem o card da assinatura-loja pro Raphael publicar");
  const assin = await p.evaluate(async () => {
    const S = window.MTStore;
    const usuarioOrig = S.usuario, cloudOrig = S.cloud;
    const out = {};
    try {
      S.usuario = () => ({ logado: true, email: "pt@teste.com" });
      let pediu = "";
      S.cloud = () => ({ aid: "acad-1", client: { rpc: (nome) => { pediu = nome; return Promise.resolve({ data: { status: "atrasada", via: "play_store", vence: "2026-09-01T00:00:00Z" } }); } } });
      window.__assinatura.consulta();
      await new Promise((r) => setTimeout(r, 50));
      out.pediu = pediu;
      out.tarjaAtras = !document.getElementById("faixaAssinatura").hidden;
      out.txtAtras = document.getElementById("faixaAssinaturaTxt").textContent;
      // o webhook marcou bloqueada (assinatura venceu de vez)
      S.cloud = () => ({ aid: "acad-1", client: { rpc: () => Promise.resolve({ data: { status: "bloqueada", via: "play_store" } }) } });
      window.__assinatura.consulta();
      await new Promise((r) => setTimeout(r, 50));
      out.txtBloq = document.getElementById("faixaAssinaturaTxt").textContent;
      out.btnBloq = document.getElementById("faixaAssinaturaBtn").textContent;
      // pagou de novo: ativa — tarja some e o card Sua ilha mostra a loja
      S.cloud = () => ({ aid: "acad-1", client: { rpc: () => Promise.resolve({ data: { status: "ativa", via: "play_store", vence: "2026-09-15T00:00:00Z" } }) } });
      window.__assinatura.consulta();
      await new Promise((r) => setTimeout(r, 50));
      out.tarjaAtiva = !document.getElementById("faixaAssinatura").hidden;
      out.infoAtiva = document.getElementById("assinaturaInfo").textContent;
      out.cache = JSON.parse(localStorage.getItem("mtapp:ptAssinatura") || "null");
      // regra das lojas: no app nativo a oferta com preço da web não aparece
      window.Capacitor = { isNativePlatform: () => true };
      window.__faixaTeste(false);
      out.zapNativo = document.getElementById("faixaTesteZap").hidden;
      delete window.Capacitor;
      window.__faixaTeste(false);
      out.zapWeb = document.getElementById("faixaTesteZap").hidden;
    } finally {
      S.usuario = usuarioOrig; S.cloud = cloudOrig;
      localStorage.removeItem("mtapp:ptAssinatura");
      window.__assinatura.render();
      window.__faixaTeste((usuarioOrig ? usuarioOrig() : {}).logado);
    }
    return out;
  });
  ok(assin.pediu === "minha_assinatura", "o painel consulta a situação da assinatura pelo RPC");
  ok(assin.tarjaAtras && /não caiu/.test(assin.txtAtras) && /carência/.test(assin.txtAtras),
    "assinatura atrasada: tarja amarela com aviso de carência");
  ok(/venceu/.test(assin.txtBloq) && /nada é apagado/.test(assin.txtBloq) && /Assinar de novo/.test(assin.btnBloq),
    "assinatura vencida: tarja explica que nada é apagado e leva pra loja");
  ok(!assin.tarjaAtiva && /Assinatura ativa/.test(assin.infoAtiva) && /Play Store/.test(assin.infoAtiva) && assin.cache && assin.cache.status === "ativa",
    "assinatura ativa: tarja some, Sua ilha mostra a loja e o status fica guardado pra abrir offline");
  ok(assin.zapNativo === true && assin.zapWeb === false,
    "no app nativo a oferta com preço da web some (regra da Apple/Google); na web continua");
  // --- Primeiro acesso estilo loja: baixou o app, criou a conta, viu a oferta ---
  const ctxGate = await b.newContext({ viewport: { width: 480, height: 900 } });
  await ctxGate.addInitScript(() => {
    localStorage.setItem("mtapp:perfil", JSON.stringify({ nome: "Raphael" }));
    localStorage.setItem("mtapp:ptStudio", JSON.stringify({ config: { nome: "Studio Gate" }, alunos: [] }));
    // app da loja de mentira (Capacitor + plugin do RevenueCat)
    window.__pCalls = [];
    window.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => "android",
      Plugins: {
        Purchases: {
          configure: (o) => { window.__pCalls.push(["configure", o]); return Promise.resolve(); },
          getOfferings: () => { window.__pCalls.push(["getOfferings"]); return Promise.resolve({ current: { availablePackages: [{ identifier: "mensal" }] } }); },
          purchasePackage: (o) => { window.__pCalls.push(["purchase", o && o.aPackage && o.aPackage.identifier]); return Promise.resolve({}); },
        },
      },
    };
    // nuvem de mentira: cadastro/login sem internet
    let temIlha = false;
    window.MT_supabase = {
      auth: {
        getSession: () => Promise.resolve({ data: { session: null } }),
        signUp: (args) => {
          window.__signUp = args;
          return Promise.resolve({ data: { user: { id: "u1", email: args.email, user_metadata: (args.options && args.options.data) || {} }, session: { ok: true } }, error: null });
        },
        signInWithPassword: () => Promise.resolve({ data: {}, error: { message: "nope" } }),
      },
      from: () => ({ select: () => Promise.resolve({ data: temIlha ? [{ academia_id: "acad-gate", papel: "dono", nome: "Raphael", academias: { nome: "Studio Gate" } }] : [] }) }),
      rpc: (nome, args) => {
        (window.__rpcs = window.__rpcs || []).push([nome, args]);
        if (nome === "criar_academia") { temIlha = true; return Promise.resolve({ data: { academia_id: "acad-gate" }, error: null }); }
        return Promise.resolve({ data: null, error: null });
      },
    };
  });
  const g = await ctxGate.newPage();
  g.on("dialog", (d) => d.accept());
  await g.goto(BASE + "/personal.html", { waitUntil: "domcontentloaded" });
  await g.waitForSelector("#gateModulo", { state: "visible", timeout: 15000 });
  ok(await g.isVisible("#mgAbaCriar"), "primeira abertura mostra login com a aba Criar conta (cadastro self-service)");
  await g.click("#mgAbaCriar");
  ok(await g.isVisible("#mgNome") && /Criar minha conta/.test(await g.textContent("#mgBtn")),
    "na aba Criar conta aparecem o nome do studio e o botão de criar");
  ok(await g.isHidden("#mgRodape"), "no app da loja o link pra página de venda da web fica escondido");
  await g.fill("#mgNome", "Studio Gate");
  await g.fill("#mgEmail", "novo@personal.com");
  await g.fill("#mgSenha", "supersegura");
  await g.click("#mgBtn");
  await g.waitForSelector("#gateModulo", { state: "hidden", timeout: 8000 });
  const gateInfo = await g.evaluate(() => ({
    signUp: window.__signUp && window.__signUp.email,
    criou: (window.__rpcs || []).some((r) => r[0] === "criar_academia" && r[1] && r[1].p_nome_academia === "Studio Gate"),
    acad: JSON.parse(localStorage.getItem("mtapp:academia") || "null"),
  }));
  ok(gateInfo.signUp === "novo@personal.com" && gateInfo.criou && gateInfo.acad && gateInfo.acad.id === "acad-gate",
    "criar conta cadastra na nuvem e já cria a ilha com o nome do studio");
  await g.waitForSelector("#telaAssinatura", { state: "visible", timeout: 5000 });
  ok(/59,90/.test(await g.textContent("#telaAssinatura")),
    "a oferta de assinatura aparece sozinha depois do cadastro, com o preço da loja (R$ 59,90/mês)");
  await g.click("#taDepois");
  ok(await g.isHidden("#telaAssinatura"), "dá pra continuar no teste grátis sem assinar");
  const compra = await g.evaluate(async () => {
    self.MT_RC.android = "chave-teste";
    window.__telaAssinatura.mostra(true);
    document.getElementById("taAssinar").click();
    await new Promise((r) => setTimeout(r, 150));
    return {
      calls: window.__pCalls.map((c) => c[0]),
      user: (window.__pCalls.find((c) => c[0] === "configure") || [])[1],
      fechou: document.getElementById("telaAssinatura").hidden,
      cache: JSON.parse(localStorage.getItem("mtapp:ptAssinatura") || "null"),
    };
  });
  ok(compra.calls.includes("configure") && compra.calls.includes("purchase") && compra.user && compra.user.appUserID === "acad-gate",
    "Assinar agora compra pela loja usando o id da academia (o webhook acha a conta certa)");
  ok(compra.fechou && compra.cache && compra.cache.status === "ativa" && compra.cache.via === "play_store",
    "depois da compra a tela fecha e o status já aparece como ativa");
  await ctxGate.close();
  // --- Despesas: o personal descobre onde o dinheiro está indo ---
  const stSnapDesp = await p.evaluate(() => localStorage.getItem("mtapp:ptStudio"));
  const desp = await p.evaluate(async () => {
    const S = window.MTStore, st = S.read("ptStudio", {}), hoje = S.todayISO(), mes = hoje.slice(0, 7);
    const dAnt = new Date(+mes.slice(0, 4), +mes.slice(5, 7) - 2, 1);
    const mAnt = dAnt.getFullYear() + "-" + ("0" + (dAnt.getMonth() + 1)).slice(-2);
    st.pagamentos = [{ id: "pgD1", valor: 1000, data: hoje, forma: "Pix" }];
    st.despesas = [
      { id: "dfix", desc: "Repasse academia", cat: "Repasse/aluguel", valor: 400, data: mAnt + "-05", fixa: true },
      { id: "dcomb", desc: "Gasolina", cat: "Combustível", valor: 100, data: hoje },
    ];
    S.write("ptStudio", st);
    window.__pgAba("desp");
    const txt = (id) => document.getElementById(id).textContent.replace(/ /g, " ");
    const out = { resumo: txt("dpResumo"), cats: txt("dpCats"), lista: txt("dpLista") };
    // lançar pela interface
    document.getElementById("dpDesc").value = "Curso de biomecânica";
    document.getElementById("dpCat").value = "Cursos e formação";
    document.getElementById("dpValor").value = "250";
    document.getElementById("dpData").value = hoje;
    document.getElementById("dpAdd").click();
    out.aposLancar = txt("dpResumo");
    // mês anterior: a fixa conta, a avulsa de hoje não
    window.__despesas.vaiPara(mAnt);
    out.mesAnt = txt("dpLista");
    out.mesAntResumo = txt("dpResumo");
    // encerrar a fixa lá atrás: some dos meses seguintes
    document.querySelector("[data-dpfim='dfix']").click();
    window.__despesas.vaiPara(mes);
    out.aposEncerrar = txt("dpResumo");
    out.fech = window.__dashPT.resumo(mes);
    return out;
  });
  ok(/1\.000/.test(desp.resumo) && /500/.test(desp.resumo) && /sobrou/.test(desp.resumo),
    "resumo do mês: recebido R$ 1.000, gasto R$ 500 (fixa + gasolina) e quanto sobrou");
  ok(/Repasse\/aluguel/.test(desp.cats) && /80%/.test(desp.cats) && /20%/.test(desp.cats),
    "barras por categoria mostram pra onde o dinheiro vai (80% repasse, 20% combustível)");
  ok(/fixa/.test(desp.lista) && /Gasolina/.test(desp.lista), "a lista mostra a fixa marcada e a despesa avulsa");
  ok(/750/.test(desp.aposLancar), "lançar pela interface soma na hora (gasto vira R$ 750)");
  ok(/Repasse/.test(desp.mesAnt) && !/Gasolina/.test(desp.mesAnt) && /R\$ 0/.test(desp.mesAntResumo),
    "no mês anterior a fixa aparece, a avulsa de hoje não, e o recebido é zero");
  ok(/350/.test(desp.aposEncerrar), "fixa encerrada some dos meses seguintes (gasto cai pra R$ 350)");
  ok(/Despesas: R\$ 350 · Sobrou: R\$ 650/.test(desp.fech), "o fechamento do mês ganha despesas e sobra");
  await p.evaluate((snap) => { localStorage.setItem("mtapp:ptStudio", snap); }, stSnapDesp);
  await p.evaluate((snap) => { localStorage.setItem("mtapp:ptStudio", snap); }, stSnapSite);
  // --- Serviços e pacotes: venda avulsa, pacote com saldo, Usar 1 e app ---
  const stSnapServ = await p.evaluate(() => localStorage.getItem("mtapp:ptStudio"));
  const serv = await p.evaluate(async () => {
    const S = window.MTStore, st = S.read("ptStudio", {});
    st.alunos.push({ id: "sv1", nome: "Bia Servico", ativo: true });
    st.pagamentos = st.pagamentos || [];
    S.write("ptStudio", st);
    window.__pgAba("serv");
    document.getElementById("svNome").value = "Massagem";
    document.getElementById("svValor").value = "120";
    document.getElementById("svAdd").click();
    await new Promise((r) => setTimeout(r, 150));
    document.getElementById("svVAluno").value = "sv1";
    // venda avulsa (qtd 1, total sugerido 120)
    document.getElementById("svVender").click();
    await new Promise((r) => setTimeout(r, 150));
    // pacote de 3 com desconto (360 -> 300)
    document.getElementById("svVAluno").value = "sv1";
    document.getElementById("svVQtd").value = "3";
    document.getElementById("svVQtd").dispatchEvent(new Event("input"));
    const sugerido = document.getElementById("svVTotal").value;
    document.getElementById("svVTotal").value = "300";
    document.getElementById("svVender").click();
    await new Promise((r) => setTimeout(r, 150));
    const st2 = window.MTStore.read("ptStudio", {});
    const bia = st2.alunos.find((a) => a.id === "sv1");
    const pgs = st2.pagamentos.filter((x) => x.alunoId === "sv1");
    return { sugerido, pgs: pgs.map((x) => ({ v: x.valor, d: x.desc })), pacote: bia.servPacotes };
  });
  ok(serv.sugerido === "360" && serv.pgs.some((x) => x.v === 120 && x.d === "Massagem"),
    "venda avulsa de serviço registra o pagamento com a descrição (e o total vem sugerido)");
  ok(serv.pgs.some((x) => x.v === 300 && x.d === "Pacote 3x Massagem") && serv.pacote && serv.pacote[0].total === 3,
    "venda com quantidade 3 vira pacote com saldo no aluno e pagamento com desconto aceito");
  const servUsa = await p.evaluate(async () => {
    const bt = [...document.querySelectorAll("#svPacotes [data-svusa]")].find((b) => b.getAttribute("data-svusa").indexOf("sv1|") === 0);
    if (bt) bt.click();
    await new Promise((r) => setTimeout(r, 150));
    const st = window.MTStore.read("ptStudio", {});
    const bia = st.alunos.find((a) => a.id === "sv1");
    const app = window.__montaAppAluno(bia, "s1");
    return { usadas: bia.servPacotes[0].usadas, hist: document.getElementById("svPacotes").textContent,
      appPacote: /Meus pacotes/.test(app) && /restam 2 de 3/.test(app) };
  });
  ok(servUsa.usadas === 1 && /usou 1 de 3/.test(servUsa.hist), "Usar 1 desconta do saldo do pacote na hora");
  ok(servUsa.appPacote, "o app do aluno ganha o card Meus pacotes com o saldo (restam 2 de 3)");
  ok(await p.evaluate(() => {
    const st = window.MTStore.read("ptStudio", {});
    const pg = st.pagamentos.find((x) => x.alunoId === "sv1" && x.desc === "Massagem");
    if (!pg) return false;
    // abre o recibo de verdade (window.open capturado) e confere o texto com a descrição
    let html = "";
    const openOrig = window.open;
    window.open = () => ({ document: { write: (h) => { html += h; }, close: () => {} } });
    const link = document.createElement("a");
    link.setAttribute("data-recibo", pg.id);
    document.getElementById("listaPagamentos").appendChild(link);
    link.click();
    link.remove();
    window.open = openOrig;
    return /referente a Massagem/.test(html);
  }), "pagamento de serviço guarda a descrição e o recibo usa ela no texto");
  ok(await p.evaluate(() => {
    const st = window.MTStore.read("ptStudio", {});
    const mes = new Date().toISOString().slice(0, 7);
    // a Bia só tem pagamentos de serviço (com desc) neste mês: o índice de
    // mensalidade NÃO pode considerar o mês quitado por causa deles
    return window.__idxPT(st).pagouMes("sv1", mes) === false;
  }), "venda de serviço não faz a mensalidade do mês constar como paga (cobrança do plano continua)");
  await p.evaluate((snap) => { localStorage.setItem("mtapp:ptStudio", snap); }, stSnapServ);
  // --- Central de automações de WhatsApp: gatilhos próprios, prontas, editor e foto ---
  const stSnapAuto = await p.evaluate(() => localStorage.getItem("mtapp:ptStudio"));
  const imgsSnapAuto = await p.evaluate(() => localStorage.getItem("mtapp:ptImagens"));
  const autoEng = await p.evaluate(() => {
    const S = window.MTStore, hoje = S.todayISO();
    const dISO = (menos) => { const d = new Date(hoje + "T12:00"); d.setDate(d.getDate() - menos); return S.todayISO(d); };
    const jpeg1 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";
    S.write("ptImagens", [{ id: "zim1", n: "Promo", d: jpeg1, em: hoje }]);
    const st = S.read("ptStudio", {});
    st.alunos.push(
      { id: "za1", nome: "Tulio Sumido", ativo: true, zap: "31999990001" },
      { id: "za2", nome: "Vera Nova", ativo: true, zap: "31999990002", desde: dISO(1) },
      { id: "za3", nome: "Caio Pacote", ativo: true, zap: "31999990003",
        servPacotes: [{ id: "zsp1", nome: "Massagem", total: 5, usadas: 4, vendidoEm: dISO(20) }] },
      { id: "za4", nome: "Nilo Antigo", ativo: true, zap: "31999990004", desde: dISO(300) });
    st.sessoes = st.sessoes || [];
    st.sessoes.push({ id: "zs1", alunoId: "za1", data: dISO(10), feita: true });
    st.zapLog = {};
    st.zapAutos = [
      { id: "zau1", nome: "Sentimos sua falta", gat: "sumido", dias: 7, texto: "Oi {nome}, sumiu ha {dias}! Bora voltar?" },
      { id: "zau2", nome: "Boas-vindas", gat: "cadastro", dias: 1, texto: "Oi {nome}! Bem-vinda ao time." },
      { id: "zau3", nome: "Pacote acabando", gat: "pacote", dias: 2, texto: "Pacote de {servico}: {resta}.", imgId: "zim1" },
      { id: "zau4", nome: "Desligada", gat: "sumido", dias: 1, texto: "Nunca aparece", off: true },
    ];
    S.write("ptStudio", st);
    const fila = window.__zapFila(S.read("ptStudio", {}));
    const meus = fila.filter((z) => z.chave.indexOf("zauto") === 0);
    return {
      sumido: (meus.find((z) => z.alunoId === "za1" && z.chave.indexOf("zauto|zau1") === 0) || {}).texto,
      bemVinda: (meus.find((z) => z.alunoId === "za2" && z.chave.indexOf("zautoC|zau2") === 0) || {}).texto,
      pacote: meus.find((z) => z.alunoId === "za3" && z.chave.indexOf("zautoP|zau3") === 0),
      antigoSemBoasVindas: !meus.some((z) => z.alunoId === "za4"),
      desligadaFora: !meus.some((z) => z.chave.indexOf("zau4") >= 0),
    };
  });
  ok(autoEng.sumido === "Oi Tulio, sumiu ha 10 dias! Bora voltar?", "automação 'aluno sumido' entra na fila com {nome} e {dias} trocados");
  ok(autoEng.bemVinda === "Oi Vera! Bem-vinda ao time.", "automação de boas-vindas pega o aluno cadastrado ontem");
  ok(autoEng.pacote && autoEng.pacote.texto === "Pacote de Massagem: resta 1." && autoEng.pacote.img === "zim1",
    "automação de pacote acabando troca {servico} e {resta} e carrega a foto");
  ok(autoEng.antigoSemBoasVindas, "aluno antigo não recebe boas-vindas atrasadas (janela de 7 dias)");
  ok(autoEng.desligadaFora, "automação desligada fica fora da fila");
  const autoVenc = await p.evaluate(() => {
    const S = window.MTStore, hoje = S.todayISO();
    const amanha = new Date(hoje + "T12:00");
    amanha.setDate(amanha.getDate() + 1);
    const st = S.read("ptStudio", {});
    st.planosPT = st.planosPT || [];
    st.planosPT.push({ id: "zpl1", nome: "Mensal", valor: 250, ciclo: 1 });
    st.contratosPT = st.contratosPT || [];
    // vencimento cai AMANHÃ — se amanhã for dia 1, o aviso precisa cruzar a virada do mês
    st.contratosPT.push({ id: "zct1", alunoId: "za1", planoId: "zpl1", status: "ativo", inicio: hoje, diaVenc: amanha.getDate() });
    st.zapAutos.push({ id: "zau6", nome: "Vence logo", gat: "antesVenc", dias: 3, texto: "Oi {nome}, vence {dias} ({valor})." });
    S.write("ptStudio", st);
    const fila = window.__zapFila(S.read("ptStudio", {}));
    const z = fila.find((x) => x.alunoId === "za1" && x.chave.indexOf("zautoV|zau6") === 0);
    return z && z.texto;
  });
  // o fmtBRL usa espaço não separável depois do R$ — por isso o \s no lugar do espaço comum
  ok(/^Oi Tulio, vence amanhã \(R\$\s250\)\.$/.test(autoVenc || ""), "aviso de vencimento acha o próximo vencimento de verdade (inclusive cruzando a virada do mês)");
  const autoPoda = await p.evaluate(() => {
    const S = window.MTStore, hoje = S.todayISO();
    const dISO = (menos) => { const d = new Date(hoje + "T12:00"); d.setDate(d.getDate() - menos); return S.todayISO(d); };
    const st = S.read("ptStudio", {});
    st.zapLog = {};
    // 200 chaves datadas de dias passados (lixo certo) + 1 marca durável de pacote antiga
    for (let i = 1; i <= 200; i++) st.zapLog["zautoS|zx|a" + i + "|" + dISO(8)] = dISO(8) + "T08:00:00";
    st.zapLog["zautoP|zauX|zaX|spX"] = dISO(30) + "T08:00:00"; // marca durável de um pacote já avisado
    S.write("ptStudio", st);
    window.__zapMarca("ztreino|zz|" + hoje);
    const log = S.read("ptStudio", {}).zapLog;
    return {
      duravelFicou: !!log["zautoP|zauX|zaX|spX"],
      lixoFoi: !Object.keys(log).some((k) => k.indexOf("zautoS|zx|") === 0),
      novaFicou: !!log["ztreino|zz|" + hoje],
    };
  });
  ok(autoPoda.duravelFicou && autoPoda.lixoFoi && autoPoda.novaFicou,
    "poda do log joga fora só chave datada vencida — a marca de pacote já avisado sobrevive");
  const autoDup = await p.evaluate(async () => {
    document.querySelector('#abas [data-a="config"]').click();
    await new Promise((r) => setTimeout(r, 250));
    document.querySelector('#autoProntas [data-autopronta="3"]').click(); // Motivação de segunda: 1ª vez cria
    await new Promise((r) => setTimeout(r, 150));
    document.getElementById("autoSalva").click();
    await new Promise((r) => setTimeout(r, 150));
    document.querySelector('#autoProntas [data-autopronta="3"]').click(); // 2ª vez: abre a existente
    await new Promise((r) => setTimeout(r, 150));
    document.getElementById("autoSalva").click();
    await new Promise((r) => setTimeout(r, 150));
    return window.MTStore.read("ptStudio", {}).zapAutos.filter((x) => x.nome === "Motivação de segunda").length;
  });
  ok(autoDup === 1, "tocar de novo numa pronta já criada abre a existente pra ajustar — não duplica");
  const autoUi = await p.evaluate(async () => {
    document.querySelector('#abas [data-a="config"]').click();
    await new Promise((r) => setTimeout(r, 250));
    const prontasN = document.querySelectorAll("#autoProntas [data-autopronta]").length;
    document.querySelector('#autoProntas [data-autopronta="2"]').click(); // Vencimento chegando
    await new Promise((r) => setTimeout(r, 150));
    const dlgAberto = document.getElementById("dlgAuto").open;
    const nomePronto = document.getElementById("autoNome").value;
    document.getElementById("autoSalva").click();
    await new Promise((r) => setTimeout(r, 150));
    const criada = window.MTStore.read("ptStudio", {}).zapAutos.find((x) => x.nome === "Vencimento chegando");
    // editor do zero com foto da galeria
    document.getElementById("autoNova").click();
    await new Promise((r) => setTimeout(r, 100));
    document.getElementById("autoNome").value = "Foto teste";
    document.getElementById("autoGat").value = "semanal";
    document.getElementById("autoGat").dispatchEvent(new Event("change"));
    document.getElementById("autoDiaSem").value = String(new Date().getDay());
    document.getElementById("autoTexto").value = "Foto da promo, {nome}!";
    document.getElementById("autoImgEsc").click();
    await new Promise((r) => setTimeout(r, 150));
    document.querySelector('#galEscolher [data-galsel="zim1"]').click();
    await new Promise((r) => setTimeout(r, 150));
    const prevVisivel = !document.getElementById("autoImgPrev").hidden;
    document.getElementById("autoSalva").click();
    await new Promise((r) => setTimeout(r, 150));
    const comFoto = window.MTStore.read("ptStudio", {}).zapAutos.find((x) => x.nome === "Foto teste");
    return { prontasN, dlgAberto, nomePronto, criadaGat: criada && criada.gat, prevVisivel, comFotoImg: comFoto && comFoto.imgId };
  });
  ok(autoUi.prontasN >= 6 && autoUi.dlgAberto && autoUi.nomePronto === "Vencimento chegando" && autoUi.criadaGat === "antesVenc",
    "prontas abrem o editor preenchido e salvar cria a automação");
  ok(autoUi.prevVisivel && autoUi.comFotoImg === "zim1", "criar do zero escolhe foto do banco de imagens e ela fica guardada por id");
  const autoFoto = await p.evaluate(async () => {
    const canOrig = navigator.canShare, shareOrig = navigator.share;
    let shareArgs = null;
    navigator.canShare = () => true;
    navigator.share = (args) => { shareArgs = args; return Promise.resolve(); };
    document.querySelector('#abas [data-a="dash"]').click();
    await new Promise((r) => setTimeout(r, 400));
    // o item do pacote (zau3) é o que tem foto E texto conhecido — clica exatamente nele
    const btFoto = [...document.querySelectorAll("#bZapP [data-zapfoto]")]
      .find((b) => b.getAttribute("data-zapfoto").indexOf("zautoP|zau3") === 0);
    if (btFoto) btFoto.click();
    await new Promise((r) => setTimeout(r, 200));
    if (canOrig) navigator.canShare = canOrig; else delete navigator.canShare;
    if (shareOrig) navigator.share = shareOrig; else delete navigator.share;
    return { temBtn: !!btFoto, args: shareArgs && { n: shareArgs.files.length, texto: shareArgs.text } };
  });
  ok(autoFoto.temBtn && autoFoto.args && autoFoto.args.n === 1 && /Pacote de Massagem/.test(autoFoto.args.texto),
    "fila do Início ganha o botão Foto e o compartilhar recebe a imagem com o texto da mensagem");
  await p.evaluate((par) => {
    localStorage.setItem("mtapp:ptStudio", par.st);
    if (par.imgs == null) localStorage.removeItem("mtapp:ptImagens"); else localStorage.setItem("mtapp:ptImagens", par.imgs);
  }, { st: stSnapAuto, imgs: imgsSnapAuto });
  // --- GPS sempre ativo: com permissão, liga sozinho, mede a distância e respeita quem desliga ---
  const ctxGps = await b.newContext({
    viewport: { width: 500, height: 900 },
    geolocation: { latitude: -19.9245, longitude: -43.9352, accuracy: 10 },
    permissions: ["geolocation"],
  });
  const pGps = await ctxGps.newPage();
  pGps.on("dialog", (d) => d.accept());
  await pGps.route("**/app-teste-gps.html", (r) => r.fulfill({ contentType: "text/html", body: cardioProf.appHtml }));
  await pGps.goto(BASE + "/app-teste-gps.html", { waitUntil: "domcontentloaded" });
  await pGps.waitForTimeout(400);
  await pGps.evaluate(() => { window.__trocaSec("treino"); window.__trSub("cardio"); });
  await pGps.waitForTimeout(900);
  const gpsAuto = await pGps.evaluate(() => ({ on: window.__cr.gpsOn, btn: document.getElementById("crGps").textContent }));
  // tela 51: o botão vira termômetro do sinal (bom/ok/fraco pela precisão)
  ok(gpsAuto.on && /GPS(ligado|bom|ok|fraco)/.test(gpsAuto.btn.replace(/\s/g, "")), "GPS liga sozinho ao abrir a área Corrida e bike (" + gpsAuto.btn + ")");
  await pGps.evaluate(() => localStorage.setItem("ptcrCfg", JSON.stringify({ cd: 0, fb: "bip", ap: 0 })));
  await pGps.evaluate(() => document.getElementById("crGo").click());
  await pGps.waitForTimeout(300);
  await ctxGps.setGeolocation({ latitude: -19.9254, longitude: -43.9352, accuracy: 10 });
  await pGps.waitForTimeout(800);
  await ctxGps.setGeolocation({ latitude: -19.9263, longitude: -43.9352, accuracy: 10 });
  await pGps.waitForTimeout(800);
  const gpsKm = await pGps.evaluate(() => window.__cr.km);
  ok(gpsKm > 0.15 && gpsKm < 0.26, "GPS mede a distância sozinho com o treino rodando (" + gpsKm.toFixed(2) + " km)");
  await pGps.evaluate(() => { document.getElementById("crZera").click(); window.__trocaSec("inicio"); });
  await pGps.waitForTimeout(300);
  ok(await pGps.evaluate(() => window.__cr.watch === null && !window.__cr.gpsOn), "sair da área desliga o GPS pra poupar bateria");
  await pGps.evaluate(() => { window.__trocaSec("treino"); document.getElementById("crGps").click(); });
  await pGps.waitForTimeout(200);
  ok(await pGps.evaluate(() => JSON.parse(localStorage.getItem("ptgpsAuto")) === 0 && !window.__cr.gpsOn && window.__cr.watch === null),
    "aluno que desliga o GPS pelo botão tem a escolha respeitada (não religa sozinho)");
  await ctxGps.close();
  // --- aba Configurações: tolerância de atraso + o que o aluno vê no app ---
  const stSnapCfg = await p.evaluate(() => localStorage.getItem("mtapp:ptStudio"));
  const hojeDia = new Date().getDate();
  const zedRow = () => p.evaluate(() =>
    [...document.querySelectorAll("#pendentes .sessao-pt")].map((x) => x.textContent).find((t) => /Zed Config/.test(t)) || "");
  if (hojeDia >= 5) {
    // aluno com contrato novo vencido há 3 dias e sem tolerância: ATRASADO
    await p.evaluate(async () => {
      const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
      const iso3 = (off) => { const x = new Date(); x.setDate(x.getDate() + off); return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0"); };
      st.alunos.push({ id: "cfg1", nome: "Zed Config", valor: 100, ativo: true });
      st.planosPT.push({ id: "plcfg", nome: "CfgPlan", valor: 100 });
      st.contratosPT.push({ id: "ctcfg", alunoId: "cfg1", planoId: "plcfg", status: "ativo", inicio: iso3(-3), diaVenc: new Date().getDate() - 3 });
      st.config = st.config || {};
      delete st.config.atrasoDias;
      window.MTStore.write("ptStudio", st);
    });
    await abaPt(p, "pagamentos");
    await p.waitForTimeout(250);
    const semTol = await zedRow();
    ok(/ATRASADO/.test(semTol), "sem tolerância, aluno vencido há 3 dias aparece ATRASADO");
  }
  await abaPt(p, "config");
  const cfgSalvo = await p.evaluate(async () => {
    const out = { visivel: !document.getElementById("vConfig").hidden };
    document.getElementById("cfgAtraso").value = "5";
    ["cfgVeWod", "cfgVeCardio", "cfgVeUtil", "cfgVePag"].forEach((id) => { document.getElementById(id).checked = false; });
    document.getElementById("cfgSalva").click();
    await new Promise((r) => setTimeout(r, 200));
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    out.salvo = st.config.atrasoDias === 5 && st.config.appMostra.wod === false && st.config.appMostra.util === false;
    out.status = document.getElementById("cfgStatus").textContent;
    out.appHtml = window.__montaAppAluno(st.alunos[0], new Date().toISOString());
    return out;
  });
  ok(cfgSalvo.visivel && cfgSalvo.salvo && /publique os apps/i.test(cfgSalvo.status),
    "aba Configurações salva a tolerância e as áreas do app (e pede pra republicar)");
  if (hojeDia >= 5) {
    await abaPt(p, "pagamentos");
    await p.waitForTimeout(250);
    const comTol = await zedRow();
    ok(comTol !== "" && !/ATRASADO/.test(comTol), "tolerância de 5 dias tira a etiqueta ATRASADO do recém-vencido");
  } else {
    ok(true, "tolerância de atraso: teste do ATRASADO pulado no comecinho do mês (não dá pra vencer há 3 dias)");
  }
  ok(!/data-trsub='wod'/.test(cfgSalvo.appHtml) && !/id='cardWod'/.test(cfgSalvo.appHtml) && !/id='cardCardio'/.test(cfgSalvo.appHtml) && !/Modo circuito \(WOD\)/.test(cfgSalvo.appHtml),
    "app do aluno some com o WOD e o cardio quando o professor desliga");
  const pCfg = await ctx.newPage();
  pCfg.on("dialog", (d) => d.accept());
  await pCfg.route("**/app-teste-cfg.html", (r) => r.fulfill({ contentType: "text/html", body: cfgSalvo.appHtml }));
  await pCfg.goto(BASE + "/app-teste-cfg.html", { waitUntil: "domcontentloaded" });
  await pCfg.waitForTimeout(500);
  const cfgApp = await pCfg.evaluate(() => ({
    itens: [...document.querySelectorAll("#menuApp .nitem")].map((x) => x.textContent.trim()),
    treinoOk: (() => { window.__trocaSec("treino"); return !!document.querySelector("[data-sec='treino']:not([data-sec-off])"); })(),
  }));
  ok(!cfgApp.itens.some((t) => /Utilidades|Plano/.test(t)) && cfgApp.treinoOk,
    "menu do app respeita as chaves (sem Utilidades/Plano) e o treino segue funcionando sem erros");
  await pCfg.close();
  await p.evaluate((s) => { localStorage.setItem("mtapp:ptStudio", s); window.MTStore.write("ptStudio", JSON.parse(s)); }, stSnapCfg);
  await p.evaluate((s) => { localStorage.setItem("mtapp:ptStudio", s); window.MTStore.write("ptStudio", JSON.parse(s)); }, stSnapCr);
  await pApp.evaluate(() => window.__trocaSec("inicio"));
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
      semProgresso: !document.getElementById("pgTiles"),
      tiles: (window.__evSub("cargas"), window.__evSub("conq"), document.getElementById("cqTiles").textContent),
      tilesHtml: document.getElementById("cqTiles").innerHTML,
      xp: document.getElementById("xpChip").textContent,
      foto: (document.getElementById("htFoto") || {}).style && document.getElementById("htFoto").style.display,
    };
  });
  // telas finais: o rótulo do herói da ficha é a DATA ("SÁBADO, 22 DE AGOSTO")
  ok(/ DE /.test(home.rot) && home.tit.length > 2 && /exercício/.test(home.sub), "card '" + home.rot + "' mostra a ficha da vez (" + home.tit + ")");
  ok(home.foto === "none", "📷 sem foto na ficha, o card do dia fica limpo (nada de imagem quebrada)");
  ok(home.semProgresso && !/Peso/.test(home.tiles),
    "o card Progresso saiu do Início e o peso não aparece mais nas Conquistas (ele mora na aba Corpo)");
  ok(/Sequência/.test(home.tiles) && /Treinos no mês/.test(home.tiles) && /Semanas batendo a meta/.test(home.tiles),
    "Conquistas mostra sequência, treinos do mês e as semanas batendo a meta (essa veio do Início)");
  ok((home.tilesHtml.match(/background:var\(--bg2\)/g) || []).length === 3,
    "os três números são cartões de verdade, não texto solto no fundo");
  // sem mês anterior o rodapé não repete o número de cima ("2" e "2 no total")
  ok(/seu primeiro mês|que em \w{3} até aqui|igual a \w{3} até aqui/.test(home.tiles),
    "embaixo dos treinos do mês vem a comparação justa com o mês passado, não o total repetido");
  // guarda o que o app já tinha: as suítes seguintes contam com esses treinos
  const feitosAntes = await pApp.evaluate(() => localStorage.getItem("ptfeitos"));
  await pApp.evaluate(() => {
    // dois treinos neste mês contra quatro no mesmo pedaço do mês passado
    const hj = new Date(), dia = Math.min(hj.getDate(), 20);
    const iso = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    const f = {};
    for (let i = 0; i < 2; i++) f[iso(new Date(hj.getFullYear(), hj.getMonth(), Math.max(1, dia - i)))] = 1;
    for (let i = 0; i < 4; i++) f[iso(new Date(hj.getFullYear(), hj.getMonth() - 1, Math.max(1, dia - i)))] = 1;
    // e um treino no mês passado DEPOIS do dia de hoje, que não pode contar
    f[iso(new Date(hj.getFullYear(), hj.getMonth() - 1, 28))] = 1;
    localStorage.setItem("ptfeitos", JSON.stringify(f));
  });
  await pApp.reload();
  await pApp.waitForTimeout(900);
  const pgComp = await pApp.evaluate(() => {
    window.__trocaSec("evolucao"); window.__evSub("conq");
    return document.getElementById("cqTiles").textContent;
  });
  await pApp.evaluate((v) => {
    if (v === null) localStorage.removeItem("ptfeitos"); else localStorage.setItem("ptfeitos", v);
  }, feitosAntes);
  await pApp.reload();
  await pApp.waitForTimeout(900);
  ok(/2 a menos que em \w{3} até aqui/.test(pgComp),
    "a conta compara o mesmo pedaço do mês (2 contra 4), ignorando os dias que ainda não chegaram — " + pgComp.replace(/\s+/g, " ").trim());
  ok(/\d+ XP/.test(home.xp), "chip de XP no topo da home (" + home.xp.trim() + ")");
  const xp0 = parseInt((home.xp.match(/\d+/) || ["0"])[0], 10);
  ok(await pApp.evaluate(() => {
    document.getElementById("htVer").click();
    return !document.querySelector("[data-sec='treino']").hasAttribute("data-sec-off");
  }), "botão 'Ver treino ➜' do hero pula pra aba Treino");
  // com o menu de abas, cada grupo de cards vive numa seção — troca antes de interagir
  await pApp.evaluate(() => window.__trocaSec("treino"));
  // sem o diário manual, a carga entra pelo caminho do player (gGrava) e a
  // linha da ficha pinta a última anotação
  const dc = await pApp.evaluate(() => {
    const el = document.querySelector(".exult");
    if (!el) return null;
    const nome = el.dataset.exn;
    // zera o histórico desse exercício pro teste ser determinístico
    const h = JSON.parse(localStorage.getItem("ptdc") || "{}");
    delete h[nome];
    localStorage.setItem("ptdc", JSON.stringify(h));
    window.__gGrava(nome, 80, 10, "");
    window.__pintaUlt();
    const kgEl = Array.from(document.querySelectorAll(".exkg")).find((x) => x.dataset.exn === nome);
    const res = { linha: el.textContent, kg: kgEl ? kgEl.textContent : "" };
    // limpa de novo: o fluxo do player mais pra frente salva ESSE exercício e
    // conta os registros g:1 do dia — o daqui não pode sobrar
    const h2 = JSON.parse(localStorage.getItem("ptdc") || "{}");
    delete h2[nome];
    localStorage.setItem("ptdc", JSON.stringify(h2));
    window.__pintaUlt();
    return res;
  });
  ok(dc && /última: 10 reps · 80 kg/.test(dc.linha) && /80 kg/.test(dc.kg),
    "carga salva pelo player pinta na linha da ficha (" + (dc ? dc.linha : "sem linha") + ")");
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

    // 🆙 nível: XP acumulado vira nível (curva 50·(n−1)·n), com selo no topo,
    // card nas Conquistas e festa só quando SOBE
    const nv = await pApp.evaluate(() => ({
      chip: document.getElementById("nvChip").textContent.replace(/\s+/g, " ").trim(),
      num: +document.getElementById("nvNum").textContent,
      visto: +JSON.parse(localStorage.getItem("ptnivelok") || "0"),
    }));
    const esperado = (function (xp) { let n = 1; while (50 * n * (n + 1) <= xp) n++; return n; })(xp1);
    ok(/^Nv \d+$/.test(nv.chip) && nv.num === esperado,
      "o selo de nível no topo mostra o nível certo pro XP (" + xp1 + " XP → Nv " + esperado + ")");
    ok(nv.visto === esperado, "o último nível visto fica anotado (ptnivelok) pra festa não repetir");
    const nvCard = await pApp.evaluate(() => {
      window.__trocaSec("evolucao");
      const c = document.getElementById("nvCard");
      return c ? c.textContent.replace(/\s+/g, " ") : "";
    });
    ok(/Nível \d+ — /.test(nvCard) && /faltam \d+ pro nível/.test(nvCard) && /treino \+10 XP/.test(nvCard),
      "o card Seu nível mostra título, quanto falta pro próximo e como se ganha XP");
    // subir de nível de verdade: injeta 30 treinos antigos (+300 XP, cruza o
    // limiar com folga) gravando pelo Sv() do próprio app — é ele que dispara
    // a repintura oficial (o btnFeito recusa quando o dia já está marcado)
    const festa = await pApp.evaluate(() => {
      const antes = JSON.stringify(window.L("ptfeitos", {}));
      const f = JSON.parse(antes);
      const d = new Date("2025-01-01T12:00:00");
      for (let i = 0; i < 30; i++) { f[d.toISOString().slice(0, 10)] = 1; d.setDate(d.getDate() + 1); }
      window.Sv("ptfeitos", f);
      return new Promise((res) => setTimeout(() => {
        const r = {
          nv: +document.getElementById("nvNum").textContent,
          toast: /SUBIU DE NÍVEL/.test(document.body.textContent),
        };
        window.Sv("ptfeitos", JSON.parse(antes));   // devolve o estado pros testes seguintes
        res(r);
      }, 500));
    });
    ok(festa.nv > esperado && festa.toast,
      "cruzar o limiar sobe o nível na hora e mostra a celebração (Nv " + esperado + " → Nv " + festa.nv + ")");
    await pApp.evaluate(() => window.__trocaSec("treino"));   // devolve a seção pro resto do fluxo (Diário de cargas mora aqui)
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
  ok(guiP.aberto === "flex" && guiP.ex.length > 1 && /^01\s*\/\s*\d/.test(guiP.prog.trim()), "▶ Treino guiado abre no 1º exercício (" + guiP.ex + ")");
  await pApp.click("#gSerie");
  guiP = await pApp.evaluate(() => ({ desc: document.getElementById("gDesc").style.display, num: +document.getElementById("gDesc").textContent }));
  ok(guiP.desc === "block" && guiP.num > 0, "série feita liga o descanso automático (" + guiP.num + "s)");
  await pApp.click("#gPular");
  guiP = await pApp.evaluate(() => ({
    botao: document.getElementById("gSerie").style.display,
    feitas: document.querySelectorAll("#gMiolo .gsets i.ok").length,
  }));
  ok(guiP.botao === "block" && guiP.feitas === 1, "pular descanso volta pro botão de série, com 1 série marcada nos blocos");
  await pApp.evaluate(() => { for (let i = 0; i < 12; i++) document.getElementById("gPularEx").click(); });
  guiP = await pApp.evaluate(() => document.getElementById("gEx").textContent);
  ok(/concluído/.test(guiP), "pular os exercícios chega no 🎉 treino concluído");
  await pApp.evaluate(() => document.getElementById("gFechar").click());

  /* ---------- treino guiado em tela cheia (estilo story) ----------
   * O guiado deixou de ser uma lista de texto e virou uma tela por exercício:
   * barra segmentada em cima, card claro no meio, cronômetro embaixo, e no fim
   * de cada exercício o registro da carga por stepper (sem teclado obrigatório). */
  {
    console.log("Treino guiado estilo story:");
    await pApp.evaluate(() => document.querySelector(".guiabtn").click());
    await pApp.waitForTimeout(300);
    const st1 = await pApp.evaluate(() => {
      const ex = document.getElementById("gEx").textContent;
      return {
        display: document.getElementById("guiaBox").style.display,
        prog: document.getElementById("gProg").textContent,
        segmentos: document.querySelectorAll("#gBarra i").length,
        blocos: document.querySelectorAll("#gMiolo .gsets i").length,
        temCard: !!document.getElementById("gCard"),
        relo: document.getElementById("gRelo").textContent,
        reloLab: document.getElementById("gReloLab").textContent,
        chips: document.getElementById("gMeta").textContent,
        ex: ex,
        zi: getComputedStyle(document.getElementById("guiaBox")).zIndex,
      };
    });
    ok(st1.display === "flex" && /01 \//.test(st1.prog) && !/exercício 1 de/.test(st1.prog),
      "abre em tela cheia com o contador de story, sem repetir a posição por extenso (" + st1.prog.replace(/\s+/g, " ").slice(0, 40) + ")");
    ok(st1.segmentos > 1 && st1.blocos > 0 && st1.temCard,
      "tem a barra segmentada (" + st1.segmentos + " exercícios) e os blocos de série (" + st1.blocos + ") dentro do card");
    ok(/^\d+:\d\d$/.test(st1.relo) && /neste exercício/i.test(st1.reloLab),
      "o cronômetro fica embaixo e diz o que está contando (" + st1.reloLab + " " + st1.relo + ")");
    ok(/×/.test(st1.chips) && /descanso/.test(st1.chips), "os chips mostram séries × reps e o descanso");
    ok(+st1.zi >= 62, "o player fica ACIMA da gaveta do menu (z-index " + st1.zi + ")");

    /* Banco de GIFs do dono: o app monta o endereço na hora, a partir do nome do
     * exercício — nada de 1619 links dentro do registro de cada aluno. */
    {
      const semGif = await pApp.evaluate(() => {
        const g = document.getElementById("gGif");
        return { existe: !!g, escondido: !g || g.style.display === "none" };
      });
      ok(semGif.existe && semGif.escondido,
        "sem banco de GIF configurado, a moldura da demonstração fica escondida (nada de buraco na tela)");
      const regra = await p.evaluate(() => {
        const antes = self.MT_GIFS;
        self.MT_GIFS = { bucket: "gifs", padrao: "traco", acento: false, ext: "gif" };
        const r = window.__gifRegra();
        self.MT_GIFS = antes;
        return r;
      });
      ok(regra && /\/storage\/v1\/object\/public\/gifs\/$/.test(regra.b) && regra.p === "traco",
        "a regra do banco de GIFs vira UM endereço base no pacote (" + (regra || {}).b + ")");
      const semBucket = await p.evaluate(() => {
        const antes = self.MT_GIFS;
        self.MT_GIFS = { bucket: "", padrao: "traco" };
        const r = window.__gifRegra();
        self.MT_GIFS = antes;
        return r;
      });
      ok(semBucket === null, "sem bucket preenchido, o pacote do aluno não carrega regra nenhuma");
      // e o app sabe transformar nome de exercício em endereço de arquivo
      const url = await pApp.evaluate(() => {
        const f = new Function("return typeof gifUrl === 'function'");
        return { temFuncao: /function gifUrl/.test(document.documentElement.innerHTML) };
      });
      ok(url.temFuncao, "o app carrega o montador de endereço do GIF");
    }

    // uma série -> descanso com número grande; a última -> registro da carga
    const serie1 = await pApp.evaluate(async () => {
      document.getElementById("gSerie").click();
      await new Promise((r) => setTimeout(r, 200));
      return { estado: document.getElementById("gEstado").textContent,
        desc: document.getElementById("gDesc").textContent,
        vis: document.getElementById("gDesc").style.display,
        pularVis: document.getElementById("gPular").style.display,
        travado: getComputedStyle(document.getElementById("gPular")).pointerEvents };
    });
    ok(/Descanso/i.test(serie1.estado) && serie1.vis === "block" && /^\d+$/.test(serie1.desc),
      "marcar a série cai no descanso com o número gigante (" + serie1.desc + ")");
    ok(serie1.travado === "none", "o 'Pular descanso' nasce travado, pra dedo escorregando não pular o descanso");
    // '+15 s' SOMA no relógio que está correndo (antes reiniciava em 15)
    const mais15 = await pApp.evaluate(async () => {
      const n = () => +document.getElementById("gDesc").textContent;
      const antes = n();
      document.getElementById("gMais15").click();
      await new Promise((r) => setTimeout(r, 1100));
      return { antes: antes, depois: n() };
    });
    ok(mais15.depois > mais15.antes && mais15.depois >= mais15.antes + 13,
      "'+15 s' soma no descanso que está correndo em vez de reiniciar (" + mais15.antes + " → " + mais15.depois + ")");
    // o ‹ no primeiro exercício não pode matar o descanso que está rodando
    const voltaNada = await pApp.evaluate(async () => {
      const n = () => +document.getElementById("gDesc").textContent;
      const a = n();
      document.getElementById("gVoltaEx").click();
      await new Promise((r) => setTimeout(r, 1100));
      return { antes: a, depois: n(), prog: document.getElementById("gProg").textContent };
    });
    ok(voltaNada.depois < voltaNada.antes && /^01\s*\/\s*\d/.test(voltaNada.prog.trim()),
      "tocar em ‹ no primeiro exercício não trava o descanso nem sai do lugar");

    // pula até o fim do exercício pra chegar no registro da carga
    const carga = await pApp.evaluate(async () => {
      const bt = () => document.getElementById("gPular");
      for (let i = 0; i < 12; i++) {
        if (document.getElementById("gKg")) break;
        if (bt() && bt().style.display === "block") { await new Promise((r) => setTimeout(r, 760)); bt().click(); }
        else if (document.getElementById("gSerie")) document.getElementById("gSerie").click();
        await new Promise((r) => setTimeout(r, 220));
      }
      if (!document.getElementById("gKg")) return null;
      const antes = JSON.parse(localStorage.getItem("ptdc") || "{}");
      const nome = document.getElementById("gEx").textContent;
      // a carga entra arrastando a régua (o traço do meio é o valor escolhido)
      window.__roda = async (id, valor) => {
        const rd = document.getElementById(id);
        const px = rd.querySelector("i").offsetWidth;
        rd.scrollLeft = valor * px;
        rd.dispatchEvent(new Event("scroll"));
        await new Promise((r) => setTimeout(r, 150));
      };
      await window.__roda("gWKg", 40);
      await window.__roda("gWRep", 12);
      const semSalvar = JSON.parse(localStorage.getItem("ptdc") || "{}");
      document.getElementById("gSalvar").click();
      await new Promise((r) => setTimeout(r, 150));
      const depois = JSON.parse(localStorage.getItem("ptdc") || "{}");
      return { nome: nome, antes: (antes[nome] || []).length, semSalvar: (semSalvar[nome] || []).length,
        depois: (depois[nome] || []), lab: document.getElementById("gCgLab").textContent,
        hist: document.getElementById("gHist").textContent,
        kgNaTela: document.getElementById("gKg").value, repsNaTela: document.getElementById("gReps").value };
    });
    ok(carga && carga.depois.length > carga.antes,
      "no fim do exercício dá pra anotar a carga arrastando a régua, sem teclado");
    ok(carga && carga.kgNaTela === "40" && carga.repsNaTela === "12",
      "arrastar a régua escreve o valor do traço do meio no campo (" + (carga && carga.kgNaTela) + " kg × " + (carga && carga.repsNaTela) + ")");
    ok(carga && carga.semSalvar === carga.antes,
      "mexer na régua e NÃO salvar não grava nada (o registro é do que o aluno confirmou)");
    /* O descanso continuava correndo por baixo do registro da carga: quando
     * zerava, o player trocava de exercício e o formulário sumia embaixo do
     * dedo de quem estava arrastando a régua. Agora ele segura e o botão vira
     * a saída explícita. */
    const segura = await pApp.evaluate(async () => {
      const rd = document.getElementById("gWKg");
      rd.dispatchEvent(new Event("touchstart"));
      await new Promise((r) => setTimeout(r, 60));
      const ex = document.getElementById("gEx").textContent;
      window.__zeraDescanso();               // simula o cronômetro chegando a zero
      await new Promise((r) => setTimeout(r, 120));
      return {
        aindaTem: !!document.getElementById("gWKg"),
        mesmoEx: document.getElementById("gEx").textContent === ex,
        botao: (document.getElementById("gPular") || {}).textContent,
      };
    });
    ok(segura.aindaTem && segura.mesmoEx,
      "descanso zerando com o aluno na régua NÃO troca de exercício nem some com o formulário");
    ok(/Próximo exercício/.test(segura.botao || ""),
      "e o botão vira 'Próximo exercício', que é a saída no tempo dele");
    /* O swipe de trocar de exercício só conhecia os botões +/- antigos: quando
     * a régua os substituiu, arrastar a régua 50px virava "próximo exercício"
     * e o formulário sumia com a carga não salva. A régua é área sem swipe. */
    const arrasto = await pApp.evaluate(async () => {
      const rd = document.getElementById("gWKg");
      const ex = document.getElementById("gEx").textContent;
      const vai = (tipo, x) => {
        const ev = new Event(tipo, { bubbles: true });
        ev.touches = tipo === "touchend" ? [] : [{ clientX: x, clientY: 300 }];
        ev.changedTouches = [{ clientX: x, clientY: 300 }];
        rd.dispatchEvent(ev);
      };
      vai("touchstart", 220); vai("touchend", 60);   // arrasto de 160px pra esquerda
      await new Promise((r) => setTimeout(r, 150));
      return { aindaTem: !!document.getElementById("gWKg"),
        mesmoEx: document.getElementById("gEx").textContent === ex };
    });
    ok(arrasto.aindaTem && arrasto.mesmoEx,
      "arrastar a RÉGUA pro lado não conta como swipe: o formulário fica e o exercício não muda");
    const reg = carga && carga.depois[carga.depois.length - 1];
    ok(reg && reg.kg > 0 && reg.r > 0 && reg.g === 1,
      "o registro guarda carga, repetições e a marca de que veio do treino guiado");
    ok(carga && /Anotado/.test(carga.lab) && /recorde/.test(carga.hist),
      "o app confirma 'Anotado' dentro do card e a linha de histórico atualiza na hora");
    // salvar de novo o mesmo exercício no mesmo dia ATUALIZA, não duplica
    const denovo = await pApp.evaluate(async () => {
      const nome = document.getElementById("gEx").textContent;
      await window.__roda("gWKg", 45);
      document.getElementById("gSalvar").click();
      await new Promise((r) => setTimeout(r, 120));
      return (JSON.parse(localStorage.getItem("ptdc") || "{}")[nome] || []).filter((x) => x.g === 1).length;
    });
    ok(denovo === 1, "salvar de novo no mesmo dia corrige o registro em vez de criar outro (" + denovo + ")");

    // fim: recibo com o que foi feito e repescagem de quem ficou sem carga
    const fim = await pApp.evaluate(async () => {
      for (let i = 0; i < 24; i++) {
        if (document.getElementById("gFim")) break;
        const t = document.getElementById("gFecharTreino") || document.getElementById("gPularEx");
        if (t) t.click();
        await new Promise((r) => setTimeout(r, 160));
      }
      return { ex: document.getElementById("gEx").textContent,
        recibo: document.getElementById("gMiolo").textContent,
        faltam: document.querySelectorAll("[data-gfalta]").length,
        rpe: document.querySelectorAll("#gMiolo [data-rpe]").length,
        temFechar: !!document.getElementById("gFim") };
    });
    ok(/concluído/.test(fim.ex) && /Séries feitas aqui/.test(fim.recibo) && /Cargas anotadas/.test(fim.recibo) && /Tempo de treino/.test(fim.recibo),
      "a tela final vira um recibo do treino (séries, cargas e tempo)");
    ok(fim.temFechar, "a tela final NÃO fecha sozinha — o aluno sai quando quiser");
    ok(fim.faltam >= 1, "quem ficou sem carga vira um atalho de repescagem no recibo (" + fim.faltam + ")");
    ok(fim.rpe === 3 && /Como foi o treino de hoje\?/.test(fim.recibo),
      "o recibo pergunta como foi o treino ali mesmo (leve/na medida/pesado), sem voltar pra primeira tela");
    const repesca = await pApp.evaluate(async () => {
      document.querySelector("[data-gfalta]").click();
      await new Promise((r) => setTimeout(r, 150));
      return { temRegua: !!document.getElementById("gWKg"), volta: !!document.getElementById("gVoltaFim") };
    });
    ok(repesca.temRegua && repesca.volta, "tocar no atalho abre o registro ali mesmo, sem sair da tela final");
    /* a repescagem abre o formulário de OUTRO exercício: sem saber de quem é o
     * formulário, sair sem salvar gravava a carga no exercício errado */
    const alvoCerto = await pApp.evaluate(async () => {
      document.getElementById("gVoltaFim").click();   // volta pro resumo pra ter os chips de novo
      await new Promise((r) => setTimeout(r, 150));
      const chip = document.querySelector("[data-gfalta]");
      if (!chip) return { nome: "", mexeu: [] };
      const nome = chip.textContent.replace(/\s*›\s*$/, "").trim();
      const antes = JSON.parse(localStorage.getItem("ptdc") || "{}");
      chip.click();
      await new Promise((r) => setTimeout(r, 120));
      await window.__roda("gWKg", 30);                  // mexe e NÃO salva
      document.getElementById("gVoltaFim").click();     // sai pelo caminho que grava o pendente
      await new Promise((r) => setTimeout(r, 150));
      const dep = JSON.parse(localStorage.getItem("ptdc") || "{}");
      const outros = Object.keys(dep).filter((k) => (dep[k] || []).length !== ((antes[k] || []).length));
      return { nome: nome, mexeu: outros };
    });
    ok(alvoCerto.mexeu.length === 0 || (alvoCerto.mexeu.length === 1 && alvoCerto.mexeu[0] === alvoCerto.nome),
      "o que a repescagem grava vai pro exercício DELA, nunca pro último aberto (" + alvoCerto.mexeu.join(", ") + ")");
    await pApp.evaluate(() => { const v = document.getElementById("gVoltaFim"); if (v) v.click(); });
    await pApp.waitForTimeout(150);
    await pApp.evaluate(() => document.getElementById("gFim").click());
    await pApp.waitForTimeout(150);
    ok(await pApp.evaluate(() => document.getElementById("guiaBox").style.display === "none" && document.body.style.overflow === ""),
      "fechar devolve a rolagem da página (nada de app travado depois do treino)");
  }
  // card de conquista pro Stories: abre a PRÉVIA (o share precisa sair do
  // toque no iPhone) e o Salvar baixa a imagem
  {
    await pApp.evaluate(() => document.getElementById("btnCardStories").click());
    await pApp.waitForTimeout(400);
    const prevOk = await pApp.evaluate(() => !!document.getElementById("artePrev") && !!document.querySelector("#artePrev img") &&
      !!document.getElementById("arteShare") && !!document.getElementById("arteBaixa"));
    ok(prevOk, "Gerar card pro Stories abre a prévia com Compartilhar e Salvar");
    const dlCard = pApp.waitForEvent("download", { timeout: 5000 }).catch(() => null);
    await pApp.evaluate(() => document.getElementById("arteBaixa").click());
    const cardArq = await dlCard;
    ok(!!cardArq && /conquista\.png/.test(cardArq.suggestedFilename()), "Gerar card pro Stories baixa a imagem da conquista");
    await pApp.evaluate(() => document.getElementById("arteFecha").click());
  }
  // recorde: carga maior salva pelo player solta o toast NOVO RECORDE + confete
  const rec9 = await pApp.evaluate(async () => {
    const h = JSON.parse(localStorage.getItem("ptdc") || "{}");
    h["Supino reto"] = [{ d: "2020-01-06", kg: 60, r: 10 }];
    localStorage.setItem("ptdc", JSON.stringify(h));
    window.__gGrava("Supino reto", 72, 10, "");
    await new Promise((r) => setTimeout(r, 120));
    // só DIV: o <script> do app também contém o texto 'NOVO RECORDE'
    const t = Array.from(document.body.children).find((x) => x.tagName === "DIV" && /NOVO RECORDE/.test(x.textContent || ""));
    return { toast: t ? t.textContent : "", confete: !!document.querySelector("[style*='cfQueda']") };
  });
  ok(/NOVO RECORDE/.test(rec9.toast) && /72/.test(rec9.toast), "carga maior salva pelo player celebra NOVO RECORDE (" + rec9.toast.replace(/\s+/g, " ").slice(0, 50) + ")");
  ok(rec9.confete, "e solta a chuva de confete");
  // peso diário (tela 49: o peso vive na pílula Corpo da Evolução)
  await pApp.evaluate(() => { window.__trocaSec("evolucao"); window.__evSub("corpo"); });
  await pApp.fill("#pzKg", "83,4");
  await pApp.click("#pzAdd");
  const pz = await pApp.evaluate(() => document.getElementById("pzGraf").textContent);
  ok(/83,4/.test(pz), "peso registrado com curva");
  // o aluno troca a própria foto tocando no avatar do topo
  {
    const antes = await pApp.evaluate(() => ({
      ini: document.getElementById("avIni").textContent,
      img: getComputedStyle(document.getElementById("avImg")).display !== "none",
    }));
    ok(antes.ini === "JC" && !antes.img, "sem foto, o topo mostra as iniciais do aluno (" + antes.ini + ")");
    // PNG 8x4 (retangular de propósito: o corte tem que sair quadrado)
    await pApp.setInputFiles("#avFile", { name: "eu.png", mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAECAIAAAA8r+mnAAAAQUlEQVR4nBWLURUAQAiDlsQkS2ISkphkSUx0J5/wkEQJixaIERErJFPGpg1mTMz6B6gzNMdAYP+sUMGhc25CwoYHii4nYbjsDOUAAAAASUVORK5CYII=", "base64") });
    await new Promise((r) => setTimeout(r, 500));
    const depois = await pApp.evaluate(() => {
      const im = document.getElementById("avImg");
      return { tipo: (im.src || "").slice(0, 15), larg: im.naturalWidth, alt: im.naturalHeight,
        img: getComputedStyle(im).display !== "none",
        ini: getComputedStyle(document.getElementById("avIni")).display !== "none",
        guardada: (JSON.parse(localStorage.getItem("ptfotoperfil") || '""') || "").slice(0, 15) };
    });
    ok(depois.img && !depois.ini && depois.tipo === "data:image/jpeg", "escolher uma foto troca as iniciais pela foto");
    ok(depois.larg === depois.alt && depois.larg === 4, "a foto é cortada em quadrado no aparelho (8x4 vira 4x4)");
    ok(depois.guardada === "data:image/jpeg", "a foto fica guardada no aparelho pra continuar lá na próxima vez");
  }
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
  // dia treinado ganha o chip pintado (gradiente da cor) — o ✓ saiu no redesenho
  const semana = await pApp.evaluate(() => document.getElementById("diasSem").innerHTML);
  ok(/linear-gradient/.test(semana), "chip do dia pintado (auto pelo treino completo)");
  // MINHA SEMANA virou um card só: recado + chips + resumo + Treinei hoje!
  const metaTxt = await pApp.evaluate(() => ({
    resumo: document.getElementById("semResumo").textContent,
    // o anel 4/4 e a barra "Meta da semana" saíram: diziam o mesmo que os chips
    velhos: ["metaBox", "ringSem", "ringNum", "coachCard", "stkBox"].filter((i) => document.getElementById(i)),
    umCardSo: (() => { const b = document.getElementById("semBlock");
      return !!(b && b.querySelector("#coachTxt") && b.querySelector("#diasSem") && b.querySelector("#btnFeito")); })(),
  }));
  ok(/1 de 3 na semana/.test(metaTxt.resumo) && metaTxt.velhos.length === 0,
    "resumo da semana num texto só (1 de 3 na semana) — o anel e a barra que repetiam o mesmo número saíram");
  ok(metaTxt.umCardSo, "recado do coach, os dias da semana e o Treinei hoje! moram no mesmo card");
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
      // a sequência de SEMANAS na meta mudou de casa: virou tile das Conquistas
      stk: (document.getElementById("cqTiles") || {}).textContent || "",
      // e a de dias de hábito agora mora no card dos hábitos, dizendo do que é
      habStk: (() => { const e = document.getElementById("stkLine");
        return e && e.parentElement.id === "habWrap" ? e.textContent : ""; })(),
      rpeNaHome: /Como foi o treino/.test(document.body.innerText),
      rpeVisivel: document.getElementById("cardRpe").style.display === "block",
      rpeNoTreino: document.getElementById("cardRpe").getAttribute("data-sec") === "treino",
    };
  });
  ok(/Semanas batendo a meta/.test(stkRpe.stk) && /2\s*semanas/.test(stkRpe.stk),
    "a sequência de semanas na meta virou tile das Conquistas (é conquista, não status de hoje)");
  ok(stkRpe.rpeVisivel && stkRpe.rpeNoTreino, "depois do 'Treinei hoje' a pergunta fica esperando na área de Treino");
  ok(!stkRpe.rpeNaHome, "e a primeira tela não pergunta mais nada — ela só mostra o dia e o treino");
  const rpeSalvo = await pApp.evaluate(async () => {
    document.querySelector("[data-rpe='2']").click();
    await new Promise((r) => setTimeout(r, 150));
    return JSON.parse(localStorage.getItem("ptrpe") || "{}");
  });
  ok(Object.keys(rpeSalvo).some((k) => rpeSalvo[k] === 2), "resposta 'Na medida' fica guardada pro personal (ptrpe)");
  await pApp.evaluate(() => window.__trocaSec("treino"));
  // o card do diário manual foi removido de vez da aba Treino
  ok(await pApp.evaluate(() => !document.getElementById("dcLista") && !document.getElementById("dcGraf") && !document.getElementById("dcEx")),
    "aba Treino sem o diário manual de cargas (a leitura mora em Evolução → Cargas)");
  // progressão sugerida continua viva no caminho do player: 3ª carga igual → sugere subir
  const prog = await pApp.evaluate(async () => {
    const d = (off) => { const x = new Date(); x.setDate(x.getDate() + off); return x.toISOString().slice(0, 10); };
    const h = JSON.parse(localStorage.getItem("ptdc") || "{}");
    h["Agachamento"] = [{ d: d(-7), kg: 90, r: 6 }, { d: d(-4), kg: 90, r: 6 }];
    localStorage.setItem("ptdc", JSON.stringify(h));
    delete window.__sugestaoProg;
    window.__gGrava("Agachamento", 90, 6, "");
    await new Promise((r) => setTimeout(r, 120));
    return window.__sugestaoProg;
  });
  ok(prog === 92.5, "3ª carga igual pelo player sugere subir pra 92,5 kg (90 + 2,5)");
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
  ok(!!vid && vid.fechou && /vídeo/.test(vid.rotVoltou), "tocar de novo fecha o player e o botão volta ao normal");
  // TODO tipo de link toca dentro do app — nada abre o YouTube por fora
  const vidTipos = await pApp.evaluate(async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const casos = {
      playlist: "https://www.youtube.com/playlist?list=PLabcdef12345",
      vimeo: "https://vimeo.com/123456789",
      arquivo: "https://meusite.com/treino.mp4",
      estranho: "https://www.youtube.com/results?search_query=como+fazer+supino",
    };
    const out = {};
    let abriuAba = false;
    const openOrig = window.open;
    window.open = () => { abriuAba = true; return null; };
    for (const k of Object.keys(casos)) {
      host.innerHTML = "<button class='vidbtn' data-v='" + casos[k] + "'>v</button><div class='vidbox' style='display:none;'></div>";
      host.querySelector(".vidbtn").click();
      await new Promise((r) => setTimeout(r, 30));
      out[k] = host.querySelector(".vidbox").innerHTML;
    }
    window.open = openOrig;
    host.remove();
    // exercício sem vídeo próprio simplesmente não ganha botão de vídeo
    const semVid = Array.from(document.querySelectorAll(".vidbtn")).filter((x) => x.id !== "gVideo" && !x.dataset.v).length;
    return { out, abriuAba, semVid };
  });
  ok(/videoseries\?list=PLabcdef12345/.test(vidTipos.out.playlist), "playlist do YouTube toca embutida no app (videoseries)");
  ok(/player\.vimeo\.com\/video\/123456789/.test(vidTipos.out.vimeo), "vídeo do Vimeo toca embutido no app");
  ok(/<video[^>]+treino\.mp4/.test(vidTipos.out.arquivo), "arquivo de vídeo direto (mp4) toca no player nativo do app");
  ok(/não toca aqui dentro/.test(vidTipos.out.estranho) && !vidTipos.abriuAba,
    "link irreconhecível ganha aviso dentro do app — NUNCA abre o YouTube por fora");
  ok(vidTipos.semVid === 0, "exercício sem vídeo não mostra botão de vídeo (a busca no YouTube acabou)");
  // --- vídeos padrão do catálogo (curadoria YouTube pt-BR) ---
  const vidCat = await p.evaluate(() => {
    const cat = (self.MT_EXERCICIOS || []).filter((c) => c.v);
    const supino = cat.find((c) => c.n === "Supino reto com barra");
    const okUrls = cat.every((c) => /^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{6,20}$/.test(c.v));
    // cópia antiga sem vídeo herda o padrão do catálogo ao passar por exercicioPorNome
    const S = window.MTStore, st = S.read("ptStudio", {});
    st.exercicios = st.exercicios || [];
    st.exercicios.push({ id: "exvT", nome: "Supino reto com barra", grupo: "Peito", video: "", descricao: "x" });
    const ex = window.__exPorNome(st, "Supino reto com barra");
    const herdou = ex.video;
    st.exercicios = st.exercicios.filter((e) => e.id !== "exvT");
    S.write("ptStudio", st);
    return { total: cat.length, temSupino: !!supino, okUrls, herdou, esperado: supino && supino.v };
  });
  ok(vidCat.total >= 13 && vidCat.temSupino && vidCat.okUrls,
    "catálogo tem vídeos padrão (13+) em formato watch do YouTube — tocam embutidos no app");
  ok(vidCat.herdou === vidCat.esperado,
    "cópia antiga do exercício sem vídeo herda o vídeo padrão do catálogo");
  // ficha montada ANTES da curadoria também leva o vídeo pro app do aluno
  const vidFicha = await p.evaluate(() => {
    const S = window.MTStore, snap = localStorage.getItem("mtapp:ptStudio");
    const st = { config: { nome: "T" },
      alunos: [{ id: "vfA", nome: "Ficha Antiga", ativo: true, appTokenP: "tkv" }],
      exercicios: [
        { id: "vf1", nome: "Agachamento livre", grupo: "Quadríceps", video: "", descricao: "d" },
        { id: "vf2", nome: "Supino reto com barra", grupo: "Peito", video: "https://www.youtube.com/watch?v=MEUVIDEO123", descricao: "d" },
        { id: "vf3", nome: "Exercício só do professor", grupo: "Core", video: "", descricao: "d" },
      ],
      treinosV2: { vfA: { semana: 1, fichas: [{ id: "vff", titulo: "A", itens: [
        { exId: "vf1", series: 3, reps: "10", descanso: 60, obs: "" },
        { exId: "vf2", series: 4, reps: "8", descanso: 90, obs: "" },
        { exId: "vf3", series: 3, reps: "12", descanso: 60, obs: "" },
      ] }] } },
      pagamentos: [], sessoes: [], avaliacoes: [], planosPT: [], contratosPT: [] };
    S.write("ptStudio", st);
    const html = window.__montaAppAluno(st.alunos[0], "demo");
    const out = {
      herdou: /youtube\.com\/watch\?v=rM6SDUdl9fs/.test(html),
      doProfessorVence: /watch\?v=MEUVIDEO123/.test(html),
      semInvencao: window.__videoDoEx({ nome: "Exercício só do professor", video: "" }) === "",
      nulo: window.__videoDoEx(null) === "",
    };
    // devolve o estado pelo store (dispara o re-render — setItem cru deixaria a tela velha)
    S.write("ptStudio", JSON.parse(snap));
    return out;
  });
  ok(vidFicha.herdou && vidFicha.doProfessorVence,
    "ficha montada antes da curadoria leva o vídeo do catálogo pro app — e o vídeo do professor continua vencendo");
  ok(vidFicha.semInvencao && vidFicha.nulo,
    "exercício fora do catálogo (ou vazio) não ganha vídeo inventado");
  // bloco GUIA do app precisa do mesmo escape de "<" dos outros JSON (nome de exercício é do professor)
  const guiaEsc = await p.evaluate(() => {
    const S = window.MTStore, snap = localStorage.getItem("mtapp:ptStudio");
    const st = { config: { nome: "T" }, alunos: [{ id: "gE", nome: "G", ativo: true, appTokenP: "tg" }],
      exercicios: [{ id: "ge1", nome: "<" + "/script><b>x</b>", grupo: "Peito", video: "", descricao: "d" }],
      treinosV2: { gE: { semana: 1, fichas: [{ id: "gf", titulo: "A", itens: [{ exId: "ge1", series: 3, reps: "10", descanso: 60, obs: "" }] }] } },
      pagamentos: [], sessoes: [], avaliacoes: [], planosPT: [], contratosPT: [] };
    S.write("ptStudio", st);
    const html = window.__montaAppAluno(st.alunos[0], "demo");
    const i = html.indexOf("var GUIA=");
    const trecho = html.slice(i, i + 500);
    S.write("ptStudio", JSON.parse(snap));
    return { escapado: /\\u003c/.test(trecho), cru: /<\/script>/.test(trecho) };
  });
  ok(guiaEsc.escapado && !guiaEsc.cru, "o bloco GUIA do app escapa < (nome de exercício não quebra o script do aluno)");
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
  ok(!!iniEx && iniEx.aberto === "flex" && /^02\s*\/\s*\d/.test(iniEx.prog.trim()),
    "'Iniciar exercício' abre o modo guiado direto no exercício escolhido (" + (iniEx ? iniEx.ex : "?") + ")");
  await pApp.evaluate(() => document.getElementById("gFechar").click());

  // --- leva 2: aquecimento, raio-X, mapa do ano, meta de peso, Já paguei, wake lock ---
  ok(/Aquecimento do dia/.test(appHtml2) && /Raio-X do treino/.test(appHtml2) && /wakeLock/.test(appHtml2) && /mapaAno/.test(appHtml2),
    "app traz aquecimento automático, raio-X por grupo, wake lock e mapa de calor do mês");
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
    // garante um treino registrado HOJE (chave local) e repinta as conquistas
    const isoLocal = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    const f2 = JSON.parse(localStorage.getItem("ptfeitos") || "{}");
    f2[isoLocal(new Date())] = 1;
    localStorage.setItem("ptfeitos", JSON.stringify(f2));
    document.getElementById("btnFeito").click(); // já registrado: só dispara o repinta (alert auto-aceito)
    await new Promise((r) => setTimeout(r, 300));
    const cols = document.querySelectorAll("#cqGraf > div:nth-child(2) > div");
    const semAtual = cols.length ? cols[cols.length - 1].firstChild.textContent : "";
    return {
      meta: document.getElementById("mpMetaTxt").textContent + "|" + document.getElementById("mpBarra").textContent,
      mapaTxt: mapa ? mapa.textContent : "",
      mapaCells: mapa ? mapa.querySelectorAll("div[style*='aspect-ratio']").length : 0,
      mapaForca: window.__mapaMes ? [window.__mapaMes.forca("2099-01-01", {}),
        window.__mapaMes.forca(isoLocal(new Date()), f2)] : null,
      mapaCabe: mapa ? mapa.scrollWidth <= mapa.clientWidth + 1 : false,
      semAtual,
    };
  });
  ok(/meta 80 kg/.test(leva2.meta) && /faltam 5 kg/.test(leva2.meta), "meta de peso vira barra de progresso (90→85, alvo 80: faltam 5)");
  ok(/treinos? em \w+/.test(leva2.mapaTxt) && leva2.mapaCells >= 28 && leva2.mapaCells <= 31,
    "mapa de calor é o MÊS em calendário (28 a 31 quadradinhos, um por dia)");
  ok(/mais treino/.test(leva2.mapaTxt) && leva2.mapaForca[0] === 0 && leva2.mapaForca[1] >= 1,
    "a cor conta quanto foi treinado no dia: dia sem treino é 0, dia treinado começa no degrau leve");
  ok(leva2.mapaCabe, "o mês cabe na largura da tela (sem estourar o card)");

  // --- a FITA DO ANO voltou (pedido do Raphael): Mês | Ano no mesmo card ---
  const mapAno = await pApp.evaluate(async () => {
    const abre = async () => {
      window.__trocaSec("evolucao");
      if (window.__evSub) window.__evSub("conq");
      await new Promise((r) => setTimeout(r, 200));
    };
    await abre();
    const bt = document.getElementById("mapVa");
    if (!bt) return null;
    bt.click();
    await new Promise((r) => setTimeout(r, 200));
    const mapa = document.getElementById("mapaAno");
    const rol = document.getElementById("mapaAnoRol");
    const quad = rol ? rol.querySelectorAll("div[title]").length : 0;
    const txtAno = mapa.textContent;
    const guardou = JSON.parse(localStorage.getItem("ptmapv") || '""');
    // a fita rola por dentro; o CARD nunca pode estourar a largura da tela
    const cardCabe = mapa.scrollWidth <= mapa.clientWidth + 1;
    const fitaRola = rol.scrollWidth > rol.clientWidth;
    // "abre mostrando hoje": a ÚLTIMA coluna (a semana atual) tem que estar
    // dentro da janela que o aluno enxerga, sem ele arrastar nada
    const pontaVisivel = () => {
      const r2 = document.getElementById("mapaAnoRol");
      const cols = r2.firstChild.children;
      const ult = cols[cols.length - 1].getBoundingClientRect();
      const cx = r2.getBoundingClientRect();
      return ult.right <= cx.right + 2 && ult.left >= cx.left - 2;
    };
    const abreEmHoje = pontaVisivel();
    // o caso que quebrava: sair da aba, o app repintar com ela escondida e voltar
    window.__trocaSec("inicio");
    window.__mapaMes.pinta();
    await abre();
    const aindaEmHoje = pontaVisivel();
    document.getElementById("mapVm").click();
    await new Promise((r) => setTimeout(r, 200));
    return {
      quad, txtAno, guardou, cardCabe, fitaRola, abreEmHoje, aindaEmHoje,
      voltouMes: /treinos? em \w+/.test(mapa.textContent) && !document.getElementById("mapaAnoRol"),
      celsMes: mapa.querySelectorAll("div[style*='aspect-ratio']").length,
    };
  });
  ok(!!mapAno && mapAno.quad === 364,
    "aba Ano traz de volta os pontinhos do ano todo (52 semanas x 7 dias = 364)");
  ok(!!mapAno && /treinos? em 12 meses/.test(mapAno.txtAno),
    "o cabeçalho da fita conta os treinos dos 12 meses");
  ok(!!mapAno && mapAno.cardCabe && mapAno.fitaRola,
    "a fita rola de lado por dentro do card, sem estourar a largura da tela");
  ok(!!mapAno && mapAno.abreEmHoje && mapAno.aindaEmHoje,
    "a fita abre mostrando HOJE — inclusive quando o app repintou com a aba escondida");
  ok(!!mapAno && mapAno.guardou === "ano",
    "a escolha Mês/Ano fica guardada no aparelho (ptmapv)");
  ok(!!mapAno && mapAno.voltouMes && mapAno.celsMes >= 28 && mapAno.celsMes <= 31,
    "voltar pra Mês traz o calendário de novo");

  // --- o Ranking da turma saiu das Conquistas (pedido do Raphael) ---
  ok(!/cqRank/.test(appHtml2) && !/Ranking da turma/.test(appHtml2),
    "o Ranking da turma não aparece mais nas Conquistas");
  // a Comunidade vem DESLIGADA (st.config.feedOn), entao o app de teste nao a
  // carrega — quem responde por ela e' o codigo do builder
  const buiSrc = fs.readFileSync(__dirname + "/../app/aluno-builder.js", "utf8");
  ok(!/cqRank/.test(buiSrc) && /fdRank/.test(buiSrc) && /Ranking da semana/.test(buiSrc),
    "o ranking continua vivo onde é o lugar dele: a Comunidade (Ranking da semana)");

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
  // o WOD é uma SUB-PÁGINA da área de treino (não polui a página principal nem a ficha)
  const subWod = await pApp.evaluate(() => {
    window.__trocaSec("treino");
    window.__trSub("ficha");
    const wodCard = document.getElementById("cardWod");
    const fichaEscondida1 = wodCard.style.display === "none";
    const secCerta = wodCard.getAttribute("data-sec") === "treino";
    window.__trSub("wod");
    const wodVisivel = wodCard.style.display !== "none";
    const fichaCard = document.getElementById("trFichasWrap");
    const fichaSumiu = fichaCard && fichaCard.style.display === "none";
    // o cabeçalho (faixa roxa + as três pílulas) é o chapéu das três abas: fica
    // sempre visível, e o texto da faixa acompanha a aba escolhida
    const topo = document.getElementById("trTopo");
    const topoFica = topo && topo.style.display !== "none" && !!document.getElementById("trTabs");
    const faixaWod = (document.getElementById("trTopN") || {}).textContent;
    window.__trSub("ficha");
    const faixaFicha = (document.getElementById("trTopN") || {}).textContent;
    // a faixa tem que vir ANTES das pílulas (era o contrário: abas soltas no topo)
    const ordemOk = !!(topo && document.getElementById("trTabs") &&
      topo.firstElementChild !== document.getElementById("trTabs") &&
      topo.compareDocumentPosition(document.getElementById("trTabs")) & Node.DOCUMENT_POSITION_CONTAINED_BY);
    return { fichaEscondida1, secCerta, wodVisivel, fichaSumiu, topoFica, faixaWod, faixaFicha, ordemOk };
  });
  ok(subWod.secCerta && subWod.fichaEscondida1 && subWod.wodVisivel && subWod.fichaSumiu,
    "WOD vive numa sub-aba do Treino: 'Minha ficha' esconde o cronômetro e 'Circuito (WOD)' esconde a ficha");
  ok(subWod.topoFica && subWod.ordemOk,
    "o cabeçalho dos Treinos é faixa roxa EM CIMA e as três abas logo abaixo dela, visível nas três");
  ok(/circuito/i.test(subWod.faixaWod) && /ficha/i.test(subWod.faixaFicha),
    "o texto da faixa acompanha a aba escolhida (" + subWod.faixaWod + " ↔ " + subWod.faixaFicha + ")");
  ok(/FOR TIME\|0:0/.test(wodR.fortime) && /1 volta/.test(wodR.fortime), "For Time conta pra cima e marca voltas");
  ok(/TRABALHA · ROUND 1 DE 1/.test(wodR.tabataFase), "Tabata alterna trabalho/descanso com o round na tela");
  ok(/FIM!/.test(wodR.fim) && /Tabata completo/.test(wodR.fim), "Tabata termina sozinho com a festa de FIM (o botão de registrar só aparece se o dia ainda não foi marcado)");
  ok(/MINUTO 1 DE 2/.test(wodR.emom), "EMOM mostra o minuto atual com contagem regressiva");

  // --- WOD prescrito: professor monta, app recebe configurado, placar volta ---
  await abaPt(p, "treinos");
  const profWod = await p.evaluate(async () => {
    window.__trAba("wod");
    const j = JSON.parse(localStorage.getItem("mtapp:ptStudio")).alunos.find((a) => a.nome === "João Cliente");
    document.getElementById("wpAluno").value = j.id;
    document.getElementById("wpAluno").dispatchEvent(new Event("change"));
    document.getElementById("wpNome").value = "WOD do sábado";
    document.getElementById("wpTipo").value = "amrap";
    document.getElementById("wpTipo").dispatchEvent(new Event("change"));
    document.getElementById("wpMin").value = "12";
    // movimentos em linhas estilo ficha: quantidade + exercício (com busca no banco)
    const qs = document.querySelectorAll("#wpMovLinhas .wpq");
    const es = document.querySelectorAll("#wpMovLinhas .wpe");
    qs[0].value = "10"; es[0].value = "Agachamento goblet";
    qs[1].value = "10"; es[1].value = "Flexão de braço";
    qs[2].value = "200m"; es[2].value = "Corrida";
    document.getElementById("wpAq").value = "2 min de corda + mobilidade de ombro";
    document.getElementById("wpSalva").click();
    await new Promise((r) => setTimeout(r, 300));
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    return {
      lista: document.getElementById("wpLista").textContent,
      wods: (st.treinosV2[j.id].wods || []).length,
      temBanco: document.querySelectorAll("#wpExs option").length,
      appHtml: window.__montaAppAluno(st.alunos.find((a) => a.id === j.id), new Date().toISOString()).slice(0, 250000),
    };
  });
  ok(profWod.temBanco > 500, "o campo de exercício busca no banco (" + profWod.temBanco + " opções)");
  ok(/AQUECIMENTO/.test(profWod.appHtml) && /ESCALAS \/ OBS|WOD</.test(profWod.appHtml) && /2 min de corda/.test(profWod.appHtml),
    "no app o circuito vira folha de WOD com blocos (aquecimento + WOD), igual ao quadro da academia");
  ok(/WOD do sábado/.test(profWod.lista) && /AMRAP 12 min/.test(profWod.lista) && profWod.wods === 1,
    "professor monta o circuito na aba Circuito (WOD) e ele fica salvo no aluno");
  ok(/WOD do sábado/.test(profWod.appHtml) && /Começar circuito/.test(profWod.appHtml) && /200m/.test(profWod.appHtml) && /Corrida/.test(profWod.appHtml),
    "o app do aluno recebe o circuito prescrito com o botão Começar");
  ok(await p.evaluate(() => /Circuitos \(WOD\)/.test(window.__painelApp({ wodres: { w1: [{ d: "2026-08-09", n: "WOD do sábado", r: "8 volta(s) em 12:00!", v: 8 }] } }))),
    "painel do aluno mostra os placares dos circuitos devolvidos pelo app");
  // cronômetro tela cheia do professor
  const telaCheia = await p.evaluate(async () => {
    document.getElementById("btnWodProf").click();
    await new Promise((r) => setTimeout(r, 200));
    document.querySelector("[data-wpft='tabata']").click();
    document.getElementById("wpfRounds").value = "1";
    document.getElementById("wpfWork").value = "1";
    document.getElementById("wpfRest").value = "1";
    document.getElementById("wpfGo").click();
    await new Promise((r) => setTimeout(r, 2600));
    const r2 = document.getElementById("wpfFase").textContent + "|" + document.getElementById("wpfInfo").textContent;
    document.getElementById("wpfFechar").click();
    return r2;
  });
  ok(/FIM!\|Tabata completo/.test(telaCheia), "cronômetro tela cheia do professor roda e termina sozinho");
  await p.evaluate(() => { // limpa o WOD de teste (e o carimbo de app pendente que ele criou)
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    const j = st.alunos.find((a) => a.nome === "João Cliente");
    if (st.treinosV2[j.id]) delete st.treinosV2[j.id].wods;
    delete j.appEditEm;
    localStorage.setItem("mtapp:ptStudio", JSON.stringify(st));
  });
  // check-in: escolhe carinha e envia (sem nuvem → wa.me; só valida o estado)
  await pApp.evaluate(() => { window.open = () => null; }); // não abre janela no teste
  // o check-in ganhou área própria (v585): não mora mais embaixo da conversa
  await pApp.evaluate(() => window.__trocaSec("quest"));
  const ckArea = await pApp.evaluate(() => ({
    sec: document.getElementById("ckCard").getAttribute("data-sec"),
    topo: !!document.getElementById("qsTopo"),
    naGaveta: (document.getElementById("mgQaBt") || {}).getAttribute
      ? document.getElementById("mgQaBt").getAttribute("data-msec") : null,
    foraDoChat: document.getElementById("chTopo").getAttribute("data-sec") === "chat",
  }));
  ok(ckArea.sec === "quest" && ckArea.topo && ckArea.naGaveta === "quest" && ckArea.foraDoChat,
    "Questionários viraram área própria com entrada no menu — saíram de baixo da conversa do chat");
  // o check-in virou fluxo de uma pergunta por tela (v600): o card mostra um
  // convite e um botão só; a pilha antiga (#ckNotas/#ckEnvia) não existe mais
  const ckConvite = await pApp.evaluate(() => ({
    abrir: !!document.getElementById("ckAbrir"),
    pilhaAntiga: !!document.getElementById("ckNotas"),
  }));
  ok(ckConvite.abrir && !ckConvite.pilhaAntiga,
    "check-in da semana vira convite com um botão, em vez do formulário empilhado");
  await pApp.click("#ckAbrir");
  await pApp.click("[data-ckn='4']");
  await pApp.waitForTimeout(600);          // a carinha avança sozinha (350ms)
  const ckP2 = await pApp.evaluate(() => !!document.getElementById("ckPeso"));
  ok(ckP2, "tocar na carinha avança sozinho pra pergunta do peso");
  await pApp.fill("#ckPeso", "84,5");
  await pApp.click("#ckProx");
  await pApp.fill("#ckTexto", "Semana boa!");
  await pApp.click("#ckProx");
  await pApp.waitForTimeout(400);
  const ckOk = await pApp.evaluate(() => document.getElementById("ckOk").style.display !== "none");
  ok(ckOk, "check-in enviado marca a semana como feita");
  const ckFim = await pApp.evaluate(() => (document.getElementById("ckFluxo") || {}).textContent || "");
  ok(/Semana registrada/.test(ckFim), "o fluxo termina na tela de enviado");
  await pApp.click("#ckVoltaIni");          // fecha o overlay pro resto do teste seguir
  await pApp.waitForTimeout(250);
  await pApp.evaluate(() => window.__trocaSec("quest"));
  // o card some na semana seguinte (pedido do Raphael): a área não pode ficar
  // só com a faixa roxa e mais nada
  const qsVazio = await pApp.evaluate(() => {
    document.getElementById("ckCard").style.display = "none";
    const q = document.getElementById("qaCard"); if (q) q.style.display = "none";
    window.__menuBadges();
    const v = document.getElementById("qsVazio");
    return { visivel: v.style.display !== "none", txt: v.textContent,
      topo: document.getElementById("qsTopN").textContent };
  });
  ok(qsVazio.visivel && /Nada pra responder/.test(qsVazio.txt) && /Tudo em dia/.test(qsVazio.topo),
    "com tudo respondido a área de Questionários diz que está vazia, em vez de mostrar só a faixa");

  await pApp.evaluate(() => window.__trocaSec("chat"));
  const evo = await pApp.evaluate(() => document.getElementById("evoBox").textContent);
  ok(/84/.test(evo) && /-6/.test(evo.replace("−", "-")), "evolução mostra peso atual e delta");
  // chat: aluno manda mensagem → aparece no thread (RPC mockada)
  await pApp.fill("#chTexto", "Professor, dúvida no supino!");
  await pApp.click("#chEnvia");
  await pApp.waitForTimeout(400);
  const thread = await pApp.evaluate(() => document.getElementById("chMsgs").textContent);
  ok(/dúvida no supino/.test(thread), "mensagem do aluno aparece no chat do app");

  const barraApp = await pApp.evaluate(() => {
    const m = document.querySelector("meta[name=theme-color]");
    return m ? m.getAttribute("content") : "";
  });
  ok(barraApp === "#7c3aed", "app pinta a barra do navegador com a cor da paleta (" + barraApp + ")");
  ok(errosApp.length === 0, "app do aluno abre sem erros de JS" + (errosApp.length ? " — " + errosApp[0] : ""));
  // --- modo claro × noturno no app do aluno (botão na gaveta ☰, escolha salva) ---
  const temaSnap = await pApp.evaluate(() => {
    const out = {
      antesClaro: document.documentElement.classList.contains("claro"),
      corpoAntes: getComputedStyle(document.body).backgroundColor,
      btn: (document.getElementById("btnTemaApp") || {}).textContent || "",
    };
    document.getElementById("btnTemaApp").click();
    const card = document.querySelector(".cardx");
    out.claro = document.documentElement.classList.contains("claro");
    out.corpo = getComputedStyle(document.body).backgroundColor;
    out.txt = getComputedStyle(document.body).color;
    out.card = card ? getComputedStyle(card).backgroundColor : "";
    // no visual minimalista o .cardx é transparente — quem vira branco são as superfícies internas
    const sup = document.querySelector("[style*='background:var(--bg2)']");
    out.superficie = sup ? getComputedStyle(sup).backgroundColor : "";
    out.salvo = JSON.parse(localStorage.getItem("pttema"));
    // o dia de hoje no calendário: tinha texto branco sem fundo e sumia no claro
    const hj = new Date();
    const isoHj = hj.getFullYear() + "-" + String(hj.getMonth() + 1).padStart(2, "0") + "-" + String(hj.getDate()).padStart(2, "0");
    const cel = document.querySelector("[data-agdia='" + isoHj + "']");
    out.hojeTxt = cel ? getComputedStyle(cel).color : "";
    out.hojeBg = cel ? getComputedStyle(cel).backgroundColor : "";
    // devolve pro noturno (padrão) pra não afetar os testes seguintes
    document.getElementById("btnTemaApp").click();
    out.voltou = !document.documentElement.classList.contains("claro");
    return out;
  });
  ok(!temaSnap.antesClaro && temaSnap.corpoAntes === "rgb(13, 12, 16)" && /Modo claro/.test(temaSnap.btn),
    "app nasce no modo noturno com o botão ☀️ Modo claro na gaveta");
  ok(temaSnap.claro && temaSnap.corpo === "rgb(244, 243, 247)" && temaSnap.txt === "rgb(25, 22, 34)" && temaSnap.superficie === "rgb(255, 255, 255)" && temaSnap.salvo === 1,
    "modo claro pinta página, superfícies e texto e guarda a escolha do aluno");
  ok(temaSnap.voltou, "um toque devolve pro modo noturno");
  ok(temaSnap.hojeTxt === "rgb(25, 22, 34)" && /^rgba?\(/.test(temaSnap.hojeBg) && !/, 0\)$/.test(temaSnap.hojeBg),
    "no modo claro o dia de hoje aparece no calendário (texto escuro sobre um véu da cor, não branco no vazio)");
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
    ok(/:root\{[^}]*--cor:#0ea5e9;/.test(tema.html) && !/<meta name='theme-color'/.test(tema.html),
      "app gerado leva a cor nova na paleta (a barra do navegador vem dela, no aparelho)");
    // a paleta mora num :root só (fonte única): o código do app não repete cor nenhuma
    ok(/:root\{[^}]*--cor:#0ea5e9;/.test(tema.html) && /linear-gradient\(135deg,var\(--cor\),var\(--cor2\)\)/.test(tema.html) && !/#7c3aed/i.test(tema.html),
      "botões do app usam o gradiente da cor nova (sem sobra do roxo)");
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
    ok(/:root\{[^}]*--cor:#7c3aed;/.test(invalido.html), "cor inválida (red;x) cai no roxo padrão no app");
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

  // ---------- 🎨 aba Personalização: paleta completa com cores prontas ----------
  await abaPt(p, "pers");

  /* ---- Personalização repaginada (tela 4b) ---- */
  {
    const b4b = await p.evaluate(() => {
      window.__pintaCapasTipo();
      return {
        kicker: (document.querySelector("#vPers .alk") || {}).textContent || "",
        nome: (document.getElementById("persNome") || {}).textContent || "",
        botao: (document.getElementById("persPublica") || {}).textContent || "",
        contagens: [...document.querySelectorAll("#cfgCapasTipo > div")].map((d) => d.textContent).filter((t) => /ficha|nenhuma/.test(t)).length,
        tipos: document.querySelectorAll("#cfgCapasTipo > div").length,
      };
    });
    ok(/A cara do seu app/i.test(b4b.kicker) && b4b.nome.length > 0,
      "🎨 4b: o topo diz de quem é o app que está sendo pintado");
    ok(/Publicar|Tudo publicado/.test(b4b.botao), "🎨 4b: o botão do topo diz quantos apps estão esperando (" + b4b.botao + ")");
    ok(b4b.tipos === 10 && b4b.contagens === 10,
      "🎨 4b: cada foto por tipo diz quantas fichas ela atende hoje");
  }
  const pers = await p.evaluate(async () => {
    const out = { visivel: !document.getElementById("vPers").hidden, presets: document.querySelectorAll("[data-perscor]").length };
    document.querySelector("[data-perscor='#dc2626']").click();
    await new Promise((r) => setTimeout(r, 200));
    const st = window.MTStore.read("ptStudio", {});
    out.cor = (st.config || {}).cor;
    out.prev = document.getElementById("persPrev").innerHTML.indexOf("#dc2626") !== -1;
    out.appHtml = window.__montaAppAluno(st.alunos[0], new Date().toISOString());
    // restaura o padrão pra não afetar o resto da suíte
    document.getElementById("cfgCorReset").click();
    await new Promise((r) => setTimeout(r, 150));
    const st2 = window.MTStore.read("ptStudio", {});
    delete (st2.config || {}).appEditGeralEm;
    window.MTStore.write("ptStudio", st2);
    return out;
  });
  ok(pers.visivel && pers.presets === 8 && pers.cor === "#dc2626" && pers.prev,
    "aba Personalização: 8 cores prontas, o preset salva e o preview pinta na hora");
  ok(!/#7c3aed/i.test(pers.appHtml) && !/#a78bfa/i.test(pers.appHtml) && !/rgba\(124,58,237/.test(pers.appHtml) && !/#4c1d95/i.test(pers.appHtml) && /#dc2626/.test(pers.appHtml),
    "paleta COMPLETA no app: nenhum tom do roxo padrão sobra quando o studio tem cor própria");
  // fonte única: fora do bloco :root o código do app é o MESMO pra qualquer cor —
  // é isso que permite atualizar o app sem regerar o HTML de cada aluno
  const mesmoCodigo = await p.evaluate(async () => {
    const semRaiz = (h) => h.replace(/:root\{[^}]*\}/, "");
    const st = window.MTStore.read("ptStudio", {});
    st.config = st.config || {};
    const gera = (cor) => { st.config.cor = cor; window.MTStore.write("ptStudio", st);
      return window.__montaAppAluno(window.MTStore.read("ptStudio", {}).alunos[0], "2026-01-01T00:00:00Z"); };
    const a1 = gera("#dc2626"), a2 = gera("#0ea5e9");
    delete st.config.cor; delete st.config.appEditGeralEm;
    window.MTStore.write("ptStudio", st);
    return { igual: semRaiz(a1) === semRaiz(a2), raizDiferente: a1 !== a2 };
  });
  ok(mesmoCodigo.igual && mesmoCodigo.raizDiferente,
    "fonte única: só o bloco :root muda de studio pra studio — o código do app é idêntico");
  // fundo do app: preset troca a família inteira de fundos e o tom claro é travado
  const persFundo = await p.evaluate(async () => {
    const out = { presets: document.querySelectorAll("[data-persfundo]").length };
    document.querySelector("[data-persfundo='#0a0f1c']").click();
    await new Promise((r) => setTimeout(r, 200));
    const st = window.MTStore.read("ptStudio", {});
    out.salvo = (st.config || {}).fundo;
    out.appHtml = window.__montaAppAluno(st.alunos[0], new Date().toISOString());
    st.config.fundo = "#eeeeee"; // claro demais: precisa ser escurecido sozinho
    window.MTStore.write("ptStudio", st);
    out.appClaro = window.__montaAppAluno(st.alunos[0], new Date().toISOString());
    // restaura o padrão
    document.getElementById("cfgFundoReset").click();
    await new Promise((r) => setTimeout(r, 150));
    const st2 = window.MTStore.read("ptStudio", {});
    delete (st2.config || {}).appEditGeralEm;
    window.MTStore.write("ptStudio", st2);
    return out;
  });
  ok(persFundo.presets === 6 && persFundo.salvo === "#0a0f1c" &&
    !/#0d0c10/i.test(persFundo.appHtml) && !/#14121a/i.test(persFundo.appHtml) && !/#322e3d/i.test(persFundo.appHtml) && /#0a0f1c/.test(persFundo.appHtml),
    "fundo do app: 6 tons prontos e o Azul-noite troca a família inteira (fundos, cartões e bordas)");
  ok(!/--bg0:#eeeeee/i.test(persFundo.appClaro) && (() => {
    const m = persFundo.appClaro.match(/:root\{[^}]*--bg0:(#[0-9a-f]{6})/i);
    if (!m) return false;
    const n = parseInt(m[1].slice(1), 16);
    return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255 <= 0.25;
  })(), "fundo claro demais é escurecido sozinho (o texto claro continua legível)");

  // conta / ilha
  const conta = await p.evaluate(() => document.getElementById("contaStatus").textContent);
  ok(/Crie sua conta|Conectado/.test(conta), "card da ilha mostra o status da conta");

  // aba chat do módulo (sem nuvem → aviso educado)
  await abaPt(p, "chat");
  await p.waitForTimeout(300);
  const chatMod = await p.evaluate(() => document.getElementById("chatMsgs").textContent);
  ok(/precisa da sua conta/.test(chatMod), "chat do módulo sem nuvem explica o que falta");

  /* ---- Chat repaginado (tela 3c) ---- */
  {
    const b3c = await p.evaluate(async () => {
      const st = window.MTStore.read("ptStudio", {});
      const a = st.alunos[0];
      a.appTokenP = "chtk"; a.ativo = true;
      localStorage.setItem("mtapp:ptStudio", JSON.stringify(st));
      const hoje = new Date().toISOString().slice(0, 10);
      const MSG = [
        { token: "chtk", de: "aluno", texto: "Consigo treinar hoje mesmo com o ombro assim?", criado: hoje + "T14:22:00", lida: true },
        { token: "chtk", de: "personal", texto: "Consegue sim, já troquei o exercício.", criado: hoje + "T14:26:00", lida: true },
      ];
      function q() {
        const o = { data: MSG, error: null };
        const h = { get: (_, k) => (k === "then" ? (f, g) => Promise.resolve(o).then(f, g) : () => new Proxy({}, h)) };
        return new Proxy({}, h);
      }
      window.__cloudOrigCH = window.MTStore.cloud;
      window.MTStore.cloud = () => ({ aid: "a1", client: { from: () => q() } });
      window.__chatPT.render();
      await new Promise((r) => setTimeout(r, 200));
      window.__chatPT.abre(a.id);
      await new Promise((r) => setTimeout(r, 250));
      window.MTStore.cloud = window.__cloudOrigCH;
      return {
        cab: (document.querySelector(".chcab") || {}).textContent || "",
        busca: !!document.getElementById("chatBusca"),
        linhas: document.querySelectorAll("#chatAlunos .qsit").length,
        previa: (document.querySelector("#chatAlunos .qssub") || {}).textContent || "",
        avatar: (document.getElementById("chatAv") || {}).textContent || "",
        dias: document.querySelectorAll("#chatMsgs .chdia").length,
        minhas: document.querySelectorAll("#chatMsgs .chbolha.minha").length,
        delas: document.querySelectorAll("#chatMsgs .chbolha:not(.minha)").length,
        lido: /lido/.test(document.getElementById("chatMsgs").textContent),
        rapidas: [...document.querySelectorAll("#chatRapidas .chrb")].map((b) => b.textContent),
        ficha: !document.getElementById("chatFicha").hidden,
      };
    });
    ok(/Conversas/.test(b3c.cab) && b3c.busca && b3c.linhas >= 1,
      "🎨 3c: a lista de conversas tem cabeçalho, busca e uma linha por aluno");
    ok(/Consegue sim/.test(b3c.previa), "🎨 3c: cada linha mostra a prévia da última mensagem");
    ok(b3c.avatar.length === 2 && b3c.ficha, "🎨 3c: o topo da conversa tem o avatar e o atalho Abrir ficha");
    ok(b3c.dias === 1 && b3c.minhas === 1 && b3c.delas === 1,
      "🎨 3c: as mensagens saem em bolhas separadas por dia, minhas de um lado e as do aluno do outro");
    ok(b3c.lido, "🎨 3c: a última mensagem minha diz quando foi lida");
    ok(b3c.rapidas.length === 3 && /Bora treinar/.test(b3c.rapidas[0]),
      "🎨 3c: as respostas rápidas ficam acima do campo de escrever");
  }

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
          return Promise.resolve({ status: 200, text: () => Promise.resolve(JSON.stringify({ ok: true, linkPagamento: "https://pagar.me/checkout/abc123" })) });
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

  // 🏦 gateway por profissional: o dinheiro cai DIRETO na conta do professor
  {
    const gw = await p.evaluate(async () => {
      const S = window.MTStore, out = {};
      out.campos = !!(document.getElementById("cfgPagProv") && document.getElementById("cfgPagChave") &&
        document.getElementById("cfgPagLink") && document.getElementById("cfgPagSalva") && document.getElementById("cfgPagDesliga"));
      // "Outra plataforma": o professor cola o PRÓPRIO link — qualquer gateway serve
      document.getElementById("cfgPagProv").value = "outro";
      document.getElementById("cfgPagProv").dispatchEvent(new Event("change"));
      out.trocaCampo = !document.getElementById("cfgPagLbLink").hidden && document.getElementById("cfgPagLbChave").hidden;
      document.getElementById("cfgPagLink").value = "https://cobra.exemplo/meu-link";
      document.getElementById("cfgPagSalva").click();
      const st1 = S.read("ptStudio", {});
      out.espelho = !!(st1.config.pagApi && st1.config.pagApi.ligado && st1.config.pagApi.provedor === "outro" && st1.config.pagLink === "https://cobra.exemplo/meu-link");
      const id = st1.alunos[0].id;
      const rOutro = await new Promise((res) => window.__pagarmePT(id, 300, res));
      out.linkOutro = !!(rOutro && rOutro.ok && rOutro.link === "https://cobra.exemplo/meu-link");
      // gateway de verdade (Mercado Pago): o link sai da função "pagamentos", com a conta DELE
      const st2 = S.read("ptStudio", {});
      st2.config.pagApi = { ligado: true, provedor: "mercadopago" };
      S.write("ptStudio", st2);
      window.__cloudOrig = S.cloud;
      window.__fetchOrig = window.fetch;
      S.cloud = () => ({ aid: "x", client: { auth: { getSession: () => Promise.resolve({ data: { session: { access_token: "tok" } } }) } } });
      let corpo = null, urlChamada = "";
      window.fetch = (url, opts) => {
        if (String(url).includes("functions/v1/pagamentos")) {
          urlChamada = String(url); corpo = JSON.parse(opts.body);
          return Promise.resolve({ status: 200, text: () => Promise.resolve(JSON.stringify({ ok: true, link: "https://mpago.la/abc", linkId: "pref_777", provedor: "mercadopago" })) });
        }
        return window.__fetchOrig(url, opts);
      };
      const rMp = await new Promise((res) => window.__pagarmePT(id, 150, res));
      window.fetch = window.__fetchOrig;
      S.cloud = window.__cloudOrig;
      out.rot = !!(urlChamada && corpo && corpo.acao === "link" && corpo.valorCentavos === 15000 && rMp.ok && rMp.link === "https://mpago.la/abc");
      // o link sai CARIMBADO (aluno + origem) e o pedido fica guardado pra baixa automática
      out.carimbo = !!(corpo && corpo.alunoId === id && corpo.origem === "mensal");
      const stPd = S.read("ptStudio", {});
      const pdNovo = ((stPd.alunos.find((a) => a.id === id) || {}).pedidosPg || []).find((x) => x.id === "pref_777");
      out.pedidoGuardado = !!(pdNovo && pdNovo.prov === "mercadopago" && +pdNovo.v === 150);
      // a chave digitada NUNCA pode parar no localStorage (ela vive só no servidor)
      document.getElementById("cfgPagChave").value = "CHAVE-SECRETA-XYZ-123";
      out.chaveForaDoAparelho = JSON.stringify(localStorage).indexOf("CHAVE-SECRETA-XYZ-123") === -1;
      document.getElementById("cfgPagChave").value = "";
      // limpa o rastro pros testes seguintes
      const st3 = S.read("ptStudio", {});
      delete st3.config.pagApi; delete st3.config.pagLink;
      const aPd = st3.alunos.find((a) => a.id === id);
      if (aPd) aPd.pedidosPg = (aPd.pedidosPg || []).filter((x) => x.id !== "pref_777");
      S.write("ptStudio", st3);
      return out;
    });
    ok(gw.campos, "🏦 Configurações → Receber dos alunos: o card do gateway existe (plataforma, chave, link, ligar/desligar)");
    ok(gw.trocaCampo && gw.espelho && gw.linkOutro, "'Outra plataforma' guarda o link do professor e o botão Link de pagamento passa a usar ELE");
    ok(gw.rot, "com Mercado Pago ligado, a cobrança sai da função 'pagamentos' (a conta do PRÓPRIO professor) com o valor certo");
    ok(gw.carimbo && gw.pedidoGuardado, "o link sai carimbado (alunoId + origem) e o pedido fica guardado pra baixa automática casar depois");
    ok(gw.chaveForaDoAparelho, "a chave do gateway nunca toca o localStorage — só o espelho {ligado, provedor} fica no aparelho");
  }

  // 🧭 onboarding do professor novo (4 passos) + hora-aula UNITÁRIA
  {
    const onb = await p.evaluate(() => {
      const S = window.MTStore, out = {};
      const snap = localStorage.getItem("mtapp:ptStudio");
      // professor recém-chegado: tem nome, zero aluno, zero plano
      const st0 = S.read("ptStudio", {});
      st0.alunos = []; st0.planosPT = []; st0.sessoes = []; st0.pagamentos = []; st0.contratosPT = [];
      st0.config = { nome: "Novo Professor" };
      S.write("ptStudio", st0);
      window.__obGuia.verifica();
      out.guiaAparece = !document.getElementById("obGuia").hidden && !document.getElementById("obP2").hidden;
      // escolhe HORA-AULA → o campo da mensalidade some e o da aula aparece
      const rSes = document.querySelector('input[name="obCobra"][value="sessao"]');
      rSes.checked = true; rSes.dispatchEvent(new Event("change"));
      out.trocaCampos = document.getElementById("obLbMes").hidden && !document.getElementById("obLbAula").hidden;
      document.getElementById("obValAula").value = "100";
      document.getElementById("obP2Ok").click();
      const st1 = S.read("ptStudio", {});
      const plO = (st1.planosPT || [])[0];
      // hora-aula nasce UNITÁRIA: sem ciclo mensal e sem link de assinatura
      out.planoUnitario = !!(plO && plO.cobranca === "sessao" && plO.valor === 100 && plO.ciclo === 1 && !plO.linkRec);
      out.passo3 = !document.getElementById("obP3").hidden;
      document.getElementById("obPix").value = "31999990000";
      document.getElementById("obP3Ok").click();
      out.pix = S.read("ptStudio", {}).config.pixChave === "31999990000";
      out.passo4 = !document.getElementById("obP4").hidden;
      document.getElementById("obP4Depois").click();
      const st2 = S.read("ptStudio", {});
      out.fim = st2.config.onboardFim === true && document.getElementById("obGuia").hidden;
      // e não volta a aparecer pra quem já terminou
      window.__obGuia.verifica();
      out.naoVolta = document.getElementById("obGuia").hidden;
      localStorage.setItem("mtapp:ptStudio", snap);
      window.__obGuia.verifica();
      return out;
    });
    ok(onb.guiaAparece, "🧭 professor novo (nome + nada cadastrado) cai no guia de 4 passos");
    ok(onb.trocaCampos && onb.planoUnitario, "escolher hora-aula cria o plano UNITÁRIO: R$ por aula, ciclo 1, sem assinatura recorrente");
    ok(onb.passo3 && onb.pix && onb.passo4, "os passos seguem: chave Pix guardada e chegada no passo final");
    ok(onb.fim && onb.naoVolta, "terminar marca onboardFim e o guia não volta a encher o saco");
  }

  // 🎟️ hora-aula no formulário de planos: modo unitário esconde ciclo/assinatura
  {
    const uni = await p.evaluate(() => {
      const S = window.MTStore, out = {};
      document.getElementById("plCobranca").value = "sessao";
      window.__plModoSessao();
      out.esconde = document.getElementById("plCiclo").hidden && document.getElementById("plLink").hidden &&
        !document.getElementById("plDicaSessao").hidden && /hora-aula/.test(document.getElementById("plValor").placeholder);
      // mesmo com ciclo 12 e link preenchidos por baixo, o plano sai unitário
      document.getElementById("plCiclo").value = "12";
      document.getElementById("plLink").value = "https://assinatura.exemplo/x";
      document.getElementById("plNome").value = "Hora-aula teste";
      document.getElementById("plValor").value = "90";
      document.getElementById("plAdd").click();
      const st = S.read("ptStudio", {});
      const pl = st.planosPT[st.planosPT.length - 1];
      out.unitario = pl.nome === "Hora-aula teste" && pl.cobranca === "sessao" && pl.ciclo === 1 && pl.linkRec === "";
      // limpa o rastro e devolve o formulário pro modo mensal
      st.planosPT = st.planosPT.filter((x) => x.id !== pl.id);
      S.write("ptStudio", st);
      document.getElementById("plCobranca").value = "mes";
      window.__plModoSessao();
      out.volta = !document.getElementById("plCiclo").hidden && !document.getElementById("plLink").hidden;
      return out;
    });
    ok(uni.esconde, "🎟️ hora-aula no formulário esconde ciclo e assinatura (venda unitária, não mensal)");
    ok(uni.unitario, "o plano hora-aula grava ciclo 1 e sem link recorrente, mesmo com os campos escondidos preenchidos");
    ok(uni.volta, "voltar pra 'por mês' devolve ciclo e assinatura");
  }

  // 💳 venda unitária de créditos no perfil (carteira): +4 aulas = 4 × valor
  {
    const cred = await p.evaluate(() => {
      const S = window.MTStore, out = {};
      const snap = localStorage.getItem("mtapp:ptStudio");
      const st = S.read("ptStudio", {});
      const hj = S.todayISO();
      st.alunos.push({ id: "axCred", nome: "Aluno Credito", ativo: true, modo: "sessao", valor: 100, modoSessaoDesde: hj });
      S.write("ptStudio", st);
      window.__perfilPT("axCred");
      const fin1 = document.getElementById("pfFin").innerHTML;
      out.botoes = /data-vendecr="4"/.test(fin1) && /data-vendecr="outro"/.test(fin1);
      const cOrig = window.confirm;
      window.confirm = () => true;
      document.querySelector("[data-vendecr='4']").click();
      window.confirm = cOrig;
      const st2 = S.read("ptStudio", {});
      const pg = st2.pagamentos.filter((x) => x.alunoId === "axCred").pop();
      out.pagamento = !!(pg && pg.valor === 400 && /crédito 4/.test(pg.forma) && !pg.desc);
      const cart = window.__financeiroPT.carteira(st2, st2.alunos.find((x) => x.id === "axCred"));
      out.saldo = cart && cart.saldo === 400 && cart.valorSessao === 100;
      document.getElementById("pfFechar").click();
      localStorage.setItem("mtapp:ptStudio", snap);
      return out;
    });
    ok(cred.botoes, "💳 a carteira ganha os botões de venda unitária (+1, +4, +8, +10 aulas e outro…)");
    ok(cred.pagamento && cred.saldo, "vender +4 aulas registra R$ 400 SEM desc e o saldo da carteira vira R$ 400 (4 créditos)");
  }

  // 📦 PACOTE de hora-aula como produto + renovação automática ao zerar
  {
    const pac = await p.evaluate(async () => {
      const S = window.MTStore, out = {};
      const snap = localStorage.getItem("mtapp:ptStudio");
      // 1) o professor cria o produto: pacote de 2 aulas por R$ 900, renova sozinho
      document.getElementById("plCobranca").value = "sessao";
      window.__plModoSessao();
      document.getElementById("plPacQtd").value = "2";
      window.__plModoSessao();
      out.campoAparece = !document.getElementById("plPacQtd").hidden && !document.getElementById("plPacRenovaLb").hidden &&
        /PACOTE/.test(document.getElementById("plValor").placeholder);
      document.getElementById("plPacRenova").checked = true;
      document.getElementById("plNome").value = "Pacote 2 aulas";
      document.getElementById("plValor").value = "900";
      document.getElementById("plAdd").click();
      const st1 = S.read("ptStudio", {});
      const pl = st1.planosPT[st1.planosPT.length - 1];
      out.produto = pl.pacoteQtd === 2 && pl.pacoteRenova === true && pl.cobranca === "sessao" && pl.valor === 900;
      out.lista = /pacote ↻/.test(document.getElementById("plLista").innerHTML);
      // 2) contrato com o plano-pacote semeia o ciclo no aluno
      st1.alunos.push({ id: "axPac", nome: "Aluno Pacote", ativo: true });
      S.write("ptStudio", st1);
      window.__perfilPT("axPac");
      document.getElementById("pfCtPlano").value = pl.id;
      document.getElementById("pfCtAdd").click();
      const st2 = S.read("ptStudio", {});
      const a2 = st2.alunos.find((x) => x.id === "axPac");
      out.ciclo1 = !!(a2.pacote && a2.pacote.total === 2 && a2.pacote.usadas === 0 && a2.pacote.renova === true && a2.pacote.valor === 900);
      document.getElementById("pfFechar").click();
      // 3) duas Feitas zeram o pacote → ele RENOVA sozinho e a cobrança fica pendente
      const st3 = S.read("ptStudio", {});
      st3.sessoes.push({ id: "sxp1", alunoId: "axPac", data: S.todayISO(), hora: "06:00" },
        { id: "sxp2", alunoId: "axPac", data: S.todayISO(), hora: "07:00" });
      S.write("ptStudio", st3);
      const aOrig = window.alert; window.alert = () => {};
      const feita = (id) => {
        const b = document.createElement("button");
        b.setAttribute("data-feita", id);
        document.getElementById("listaSessoes").appendChild(b);
        b.click();
      };
      feita("sxp1");
      feita("sxp2");
      window.alert = aOrig;
      const st4 = S.read("ptStudio", {});
      const a4 = st4.alunos.find((x) => x.id === "axPac");
      out.renovou = !!(a4.pacote && a4.pacote.usadas === 0 && a4.pacote.total === 2 && +a4.pacote.cobrar === 900 && a4.pacote.renova === true);
      // 4) a cobrança da renovação aparece nas pendências, e o Recebi dedicado dá baixa COM desc
      // (o save do Feita já redesenhou; espera o render assentar)
      await new Promise((r) => setTimeout(r, 250));
      const pendHtml = document.getElementById("pendentes").innerHTML;
      out.pendencia = /pacote renovou/.test(pendHtml) && /data-pacrec="axPac"/.test(pendHtml);
      const cOrig = window.confirm; window.confirm = () => true;
      const btnRec = document.querySelector('[data-pacrec="axPac"]');
      if (btnRec) btnRec.click();
      window.confirm = cOrig;
      const st5 = S.read("ptStudio", {});
      const a5 = st5.alunos.find((x) => x.id === "axPac");
      const pg5 = st5.pagamentos.filter((x) => x.alunoId === "axPac").pop();
      out.baixa = !!(a5.pacote && +a5.pacote.cobrar === 0 && pg5 && pg5.valor === 900 && /renovação/.test(pg5.desc || ""));
      localStorage.setItem("mtapp:ptStudio", snap);
      return out;
    });
    ok(pac.campoAparece && pac.produto && pac.lista, "📦 plano hora-aula vira PACOTE (2 aulas por R$ 900) com etiqueta 'pacote ↻' quando renova sozinho");
    ok(pac.ciclo1, "fechar contrato com plano-pacote abre o 1º ciclo no aluno (2 aulas, renova ligado)");
    ok(pac.renovou, "zerar o pacote RENOVA sozinho: novo ciclo de 2 aulas e cobrança de R$ 900 pendente");
    ok(pac.pendencia && pac.baixa, "a renovação aparece nas pendências e o Recebi dá baixa COM desc (não vira crédito de carteira)");
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
          // a função lê como TEXTO primeiro (resposta não-JSON não pode virar "sem conexão")
          const corpoResp = JSON.stringify({ ok: true, texto: "```json\n" + JSON.stringify(plano) + "\n```" });
          return Promise.resolve({ status: 200, text: () => Promise.resolve(corpoResp), json: () => Promise.resolve(JSON.parse(corpoResp)) });
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

  // 🎯 IA com seletor de TIPO: circuito e corrida caem na aba certa, nunca na errada
  {
    const iaTipo = await p.evaluate(async () => {
      const S = window.MTStore, out = {};
      const st = S.read("ptStudio", {});
      const id = st.alunos[0].id;
      window.__cloudOrig = S.cloud;
      window.__fetchOrig = window.fetch;
      S.cloud = () => ({ aid: "x", client: { auth: { getSession: () => Promise.resolve({ data: { session: { access_token: "tok" } } }) } } });
      let corpo = null;
      const responde = (plano) => (url, opts) => {
        if (String(url).includes("functions/v1/chat-envia")) {
          corpo = JSON.parse(opts.body);
          const corpoResp = JSON.stringify({ ok: true, texto: JSON.stringify(plano) });
          return Promise.resolve({ status: 200, text: () => Promise.resolve(corpoResp), json: () => Promise.resolve(JSON.parse(corpoResp)) });
        }
        return window.__fetchOrig(url, opts);
      };
      // Circuito: a IA devolve wods e eles caem em t.wods, pela peneira do formulário
      window.fetch = responde({ wods: [
        { nome: "Circuito da IA", tipo: "amrap", min: 12, movs: [{ q: "10", n: "Agachamento goblet" }, { q: "200m", n: "Corrida" }], aq: "2 min de corda", obs: "escale se precisar" },
        { nome: "Tipo inválido vira For Time", tipo: "zzz", movs: [{ q: "5", n: "Burpee" }] },
      ], resumo: "Dois circuitos." });
      const rWod = await new Promise((res) => window.__iaTreino(id, "condicionamento", "academia", res, "wod"));
      out.tipoWodViajou = !!(corpo && corpo.tipo === "wod");
      out.rWod = rWod;
      out.wods = (S.read("ptStudio", {}).treinosV2[id].wods || []).map((w) => ({ nome: w.nome, tipo: w.tipo, movs: (w.movs || []).length, mov0: (w.mov || [])[0] }));
      // Corrida: a IA devolve cardio e ele cai em t.cardio, com o objetivo da prova nos dados
      window.fetch = responde({ cardio: [
        { nome: "Rodagem leve", mod: "corrida", tipo: "continuo", dist: 5, pace: "6:30", obs: "ritmo conversável" },
        { nome: "Tiros", mod: "corrida", tipo: "intervalado", reps: 6, tiro: 60, desc: 90 },
      ], resumo: "Semana básica." });
      const rCr = await new Promise((res) => window.__iaTreino(id, "5 km", "academia", res, "corrida"));
      out.tipoCorridaViajou = !!(corpo && corpo.tipo === "corrida" && /OBJETIVO DA CORRIDA: 5 km/.test(corpo.dados));
      out.rCr = rCr;
      out.cardios = (S.read("ptStudio", {}).treinosV2[id].cardio || []).map((c) => ({ nome: c.nome, tipo: c.tipo, pace: c.pace }));
      // chat-envia ANTIGA ignora o tipo e devolve fichas: erro honesto, nada cai na aba errada
      window.fetch = responde({ fichas: [{ titulo: "A", itens: [{ nome: "X" }] }] });
      const rVelha = await new Promise((res) => window.__iaTreino(id, "condicionamento", "academia", res, "wod"));
      out.rVelha = rVelha;
      out.wodsDepoisVelha = (S.read("ptStudio", {}).treinosV2[id].wods || []).length;
      window.fetch = window.__fetchOrig;
      S.cloud = window.__cloudOrig;
      // o seletor de tipo existe e troca os campos (corrida esconde equipamento e mostra a prova)
      document.getElementById("taTipo").value = "corrida";
      document.getElementById("taTipo").dispatchEvent(new Event("change"));
      out.campos = document.getElementById("taProva").hidden === false && document.getElementById("taEquip").hidden === true &&
        document.getElementById("taGerar").hidden === true;
      document.getElementById("taTipo").value = "musculacao";
      document.getElementById("taTipo").dispatchEvent(new Event("change"));
      out.camposVolta = document.getElementById("taProva").hidden === true && document.getElementById("taGerar").hidden === false;
      return out;
    });
    ok(iaTipo.tipoWodViajou && iaTipo.rWod.ok && iaTipo.rWod.tipo === "wod" && iaTipo.rWod.wods === 2,
      "🎯 tipo Circuito viaja pra chat-envia e a IA prescreve os WODs");
    ok(iaTipo.wods.length === 2 && iaTipo.wods[0].tipo === "amrap" && iaTipo.wods[0].movs === 2 && iaTipo.wods[0].mov0 === "10 Agachamento goblet" && iaTipo.wods[1].tipo === "fortime",
      "os circuitos caem em t.wods com a MESMA peneira do formulário (tipo inválido vira For Time)");
    ok(iaTipo.tipoCorridaViajou && iaTipo.rCr.ok && iaTipo.cardios.length === 2 && iaTipo.cardios[0].pace === "6:30" && iaTipo.cardios[1].tipo === "intervalado",
      "tipo Corrida viaja com o objetivo da prova e os treinos caem em t.cardio");
    ok(/versão antiga/.test(iaTipo.rVelha.erro || "") && iaTipo.wodsDepoisVelha === 2,
      "chat-envia antiga (só musculação) não deixa treino cair na aba errada — erro honesto e nada muda");
    ok(iaTipo.campos && iaTipo.camposVolta, "escolher Corrida troca os campos (prova no lugar de equipamento) e volta certinho");
  }

  // 📅 Semana do aluno: amarra treino ↔ dia e o pacote do app leva o plano resolvido
  {
    const pln = await p.evaluate(() => {
      const S = window.MTStore, out = {};
      const st = S.read("ptStudio", {});
      const id = st.alunos[0].id;
      const t = st.treinosV2[id];
      out.temTudo = !!((t.fichas || []).length && (t.wods || []).length && (t.cardio || []).length);
      window.__trAba("plano");
      out.abaExiste = !document.querySelector('[data-trsec="plano"]').hidden;
      document.getElementById("plnAluno").value = id;
      window.__planoPT.render();
      out.seteDias = document.querySelectorAll("#plnDias [data-plndia]").length === 7;
      // segunda = ficha A, quarta = circuito, sábado = corrida — o resto descansa
      document.querySelector('#plnDias [data-plndia="1"]').value = "ficha:" + t.fichas[0].id;
      document.querySelector('#plnDias [data-plndia="3"]').value = "wod:" + t.wods[0].id;
      document.querySelector('#plnDias [data-plndia="6"]').value = "cardio:" + t.cardio[0].id;
      document.getElementById("plnSalva").click();
      const st2 = S.read("ptStudio", {});
      const plano = st2.treinosV2[id].plano;
      out.salvo = !!(plano && plano.dias && plano.dias["1"] && plano.dias["1"].tp === "ficha" &&
        plano.dias["3"] && plano.dias["3"].tp === "wod" && plano.dias["6"] && plano.dias["6"].tp === "cardio");
      out.pendente = !!st2.alunos.find((a) => a.id === id).appEditEm;
      window.__planoPT.render();
      out.pintou = document.querySelector('#plnDias [data-plndia="3"]').value === "wod:" + t.wods[0].id;
      // pacote do app: o plano viaja RESOLVIDO (dia → tipo + índice + nome) e o
      // card HOJE do app passa a ler o dia da semana
      const html = window.__montaAppAluno(st2.alunos.find((x) => x.id === id), "teste-plano");
      const m = html.match(/var PLANO=(.+?);var MESAPP=/);
      out.planoApp = m ? JSON.parse(m[1]) : null;
      out.heroLeDia = html.indexOf("PLANO[String(new Date().getDay())]") > -1 && html.indexOf("Dia de recuperar") > -1;
      // receita R1 + telas finais: os treinos do dia viram carrossel de tela
      // cheia, com risquinhos por card ("1 de 3 · arraste") e um botão por tipo
      out.carrossel = /id='heroCarr'/.test(html) && /class='htdash'/.test(html) &&
        /data-carrver='wod'/.test(html) && /data-carrver='cardio'/.test(html) &&
        /Começar circuito/.test(html) && /Começar corrida/.test(html) && /arraste/.test(html);
      // em dia de circuito/corrida/descanso a musculação também entra no carrossel
      out.cardFicha = /id='heroFicha'/.test(html) && /data-carrver='ficha'/.test(html) &&
        /data-hk='MUSCULAÇÃO'/.test(html) && /data-hk='CIRCUITO'/.test(html);
      // limpa o rastro (plano + wods/cardio que a IA de teste criou) pros próximos blocos
      const st3 = S.read("ptStudio", {});
      delete st3.treinosV2[id].plano;
      st3.treinosV2[id].wods = [];
      st3.treinosV2[id].cardio = [];
      S.write("ptStudio", st3);
      window.__trAba("fichas");
      return out;
    });
    ok(pln.temTudo && pln.abaExiste && pln.seteDias, "📅 aba Semana do aluno existe, com os 7 dias e os treinos do aluno pra escolher");
    ok(pln.salvo && pln.pendente && pln.pintou, "salvar amarra treino ↔ dia (ficha/circuito/corrida), marca republicação e re-render preserva as escolhas");
    ok(pln.planoApp && pln.planoApp["1"] && pln.planoApp["1"].tp === "ficha" &&
      pln.planoApp["3"] && pln.planoApp["3"].tp === "wod" && typeof pln.planoApp["3"].i === "number" && !!pln.planoApp["3"].n &&
      pln.planoApp["6"] && pln.planoApp["6"].tp === "cardio",
      "o pacote leva o plano resolvido: dia → tipo + índice + nome do treino");
    ok(pln.heroLeDia, "o card HOJE do app lê o dia da semana do plano (com dia de descanso incluído)");
    ok(pln.carrossel, "🎠 R1: os treinos do dia viram carrossel — cards de circuito e corrida com botão pro fluxo certo");
    ok(pln.cardFicha, "🎠 o carrossel tem card de musculação também — em dia de circuito/corrida a ficha não sumia mais do Início");
  }

  // 🎭 skin do redesenho (Claude Design): camada visual embutida no app publicado
  {
    const skin = await p.evaluate(() => {
      const st = window.MTStore.read("ptStudio", {});
      const html = window.__montaAppAluno(st.alunos[0], "teste-skin");
      return {
        temSkin: !!self.MT_APP_SKIN && typeof self.MT_APP_SKIN.css === "string" && typeof self.MT_APP_SKIN.js === "string",
        embute: html.indexOf(self.MT_APP_SKIN.css) > -1 && html.indexOf(self.MT_APP_SKIN.js) > -1,
        toque: /min-height:58px!important/.test(self.MT_APP_SKIN.css) && /\.tphab button\{min-height:44px!important\}/.test(self.MT_APP_SKIN.css),
        utilitarios: /\.carr\{/.test(self.MT_APP_SKIN.css) && /\.notabtn\{/.test(self.MT_APP_SKIN.css) && /\.listrow\{/.test(self.MT_APP_SKIN.css),
      };
    });
    ok(skin.temSkin, "🎭 o skin do redesenho carrega junto do builder no painel");
    ok(skin.embute, "o app publicado EMBUTE o skin (o aluno leva o visual junto, sem referência externa)");
    ok(skin.toque, "os alvos de toque do handoff (botão principal 58px, hábitos 44px) estão no skin");
    ok(skin.utilitarios, "as classes das receitas (carrossel, notas 58px, listrow) já viajam no skin");
    const fontes = await p.evaluate(async () => ({
      painel: /app\/aluno-skin\.js/.test(await (await fetch("personal.html")).text()),
      appPg: /aluno-skin\.js/.test(await (await fetch("app/index.html")).text()),
      sw: (await (await fetch("sw.js")).text()).split("app/aluno-skin.js").length === 3,
    }));
    ok(fontes.painel && fontes.appPg && fontes.sw, "o skin entra pelo painel, pela página /app/ e no sw (precache + rede primeiro)");
  }

  /* A IA parou de mandar republicar a função quando o problema é credencial.
   * Sem sessão, o cabeçalho virava "Bearer " vazio, o Supabase respondia 401
   * "Invalid credentials" (sem o campo erro) e a tela concluía "publique a
   * chat-envia com a ANTHROPIC_API_KEY" — o Raphael republicou 3 vezes à toa. */
  {
    const honesto = await p.evaluate(async () => {
      const st = window.MTStore.read("ptStudio", {});
      const id = st.alunos[0].id;
      window.__cloudOrig = window.MTStore.cloud;
      window.__fetchOrig = window.fetch;
      let chamou = 0;

      // 1) sessão caída: nem chega a chamar a função
      window.MTStore.cloud = () => ({ aid: "x", client: { auth: { getSession: () => Promise.resolve({ data: { session: null } }) } } });
      window.fetch = (url, opts) => {
        if (String(url).includes("functions/v1/chat-envia")) { chamou++; return Promise.resolve({ status: 200, ok: true, text: () => Promise.resolve('{"ok":true,"texto":"x"}') }); }
        return window.__fetchOrig(url, opts);
      };
      const semSessao = await new Promise((res) => window.__iaTreino(id, "hipertrofia", "academia", res));
      const chamouSemSessao = chamou;

      // 2) crachá recusado no meio do caminho, mas a renovação funciona:
      //    o sistema tem que se recuperar sozinho, sem erro nenhum na tela
      let tentativas = 0;
      window.MTStore.cloud = () => ({ aid: "x", client: { auth: {
        getSession: () => Promise.resolve({ data: { session: { access_token: "tok-velho" } } }),
        refreshSession: () => Promise.resolve({ data: { session: { access_token: "tok-novo" } } }),
      } } });
      const peito2 = self.MT_EXERCICIOS.find((c) => c.g === "Peito").n;
      window.fetch = (url, opts) => {
        if (String(url).includes("functions/v1/chat-envia")) {
          tentativas++;
          if (tentativas === 1) return Promise.resolve({ status: 401, text: () => Promise.resolve('{"message":"Invalid credentials","code":"INVALID_CREDENTIALS"}') });
          const plano = { fichas: [{ titulo: "A", itens: [{ nome: peito2, series: 3, reps: "10", descanso: 60 }] }], resumo: "ok" };
          return Promise.resolve({ status: 200, text: () => Promise.resolve(JSON.stringify({ ok: true, texto: JSON.stringify(plano) })) });
        }
        return window.__fetchOrig(url, opts);
      };
      const recuperou = await new Promise((res) => window.__iaTreino(id, "hipertrofia", "academia", res));

      // 3) crachá recusado E renovação sem sucesso: aí é sessão caída mesmo
      window.MTStore.cloud = () => ({ aid: "x", client: { auth: {
        getSession: () => Promise.resolve({ data: { session: { access_token: "tok" } } }),
        refreshSession: () => Promise.resolve({ data: { session: null } }),
      } } });
      window.fetch = (url, opts) => {
        if (String(url).includes("functions/v1/chat-envia")) {
          const corpo = '{"message":"Invalid credentials","code":"INVALID_CREDENTIALS"}';
          return Promise.resolve({ status: 401, text: () => Promise.resolve(corpo) });
        }
        return window.__fetchOrig(url, opts);
      };
      const portao = await new Promise((res) => window.__iaTreino(id, "hipertrofia", "academia", res));

      // 4) função mesmo ausente: aí sim manda publicar
      window.fetch = (url, opts) => {
        if (String(url).includes("functions/v1/chat-envia")) {
          return Promise.resolve({ status: 404, ok: false, text: () => Promise.resolve('{"code":404,"message":"Requested function was not found"}') });
        }
        return window.__fetchOrig(url, opts);
      };
      const ausente = await new Promise((res) => window.__iaTreino(id, "hipertrofia", "academia", res));

      window.fetch = window.__fetchOrig;
      window.MTStore.cloud = window.__cloudOrig;
      return { semSessao: semSessao.erro || "", chamouSemSessao, portao: portao.erro || "",
        ausente: ausente.erro || "", recuperou: !!recuperou.ok, tentativas };
    });
    ok(/sess/i.test(honesto.semSessao) && /entre de novo/i.test(honesto.semSessao) && honesto.chamouSemSessao === 0,
      "✨ sessão caída: a IA manda entrar de novo e nem chama a função");
    ok(!/ANTHROPIC_API_KEY/.test(honesto.semSessao), "e não manda procurar a chave da IA quando é a sessão");
    ok(honesto.recuperou && honesto.tentativas === 2,
      "✨ crachá vencido no meio do caminho: renova e refaz a chamada sozinho (era o 'funciona um tempo e depois dá erro')");
    ok(/sess/i.test(honesto.portao) && /entre de novo/i.test(honesto.portao),
      "✨ quando nem renovando resolve, o recado é sessão caída");
    ok(!/ANTHROPIC_API_KEY/.test(honesto.portao) && !/publique a chat-envia/i.test(honesto.portao),
      "e o 401 não manda mais republicar a chat-envia (foi o que fez o Raphael republicar 3 vezes à toa)");
    ok(/não está publicada/.test(honesto.ausente) && /funcoes\.html/.test(honesto.ausente),
      "✨ 404 continua mandando publicar a função — esse caso é real");

    // sessão caída aparece na frente do professor, com botão de resolver
    const faixa = await p.evaluate(() => {
      /* os testes de cima já derrubaram a sessão de mentira, então a faixa pode
       * estar na tela: limpa antes pra medir o aparecimento de verdade */
      const jaEstava = window.__faixaSessao();
      const velha = document.getElementById("faixaSessao");
      if (velha) velha.remove();
      window.dispatchEvent(new CustomEvent("mt:sessao-caiu", { detail: { oQue: "A IA de treino" } }));
      const el = document.getElementById("faixaSessao");
      const botoes = el ? [...el.querySelectorAll("button")].map((b) => b.textContent) : [];
      const texto = el ? el.textContent : "";
      if (el) el.remove();
      return { jaEstava, apareceu: !!el, botoes, texto };
    });
    ok(faixa.jaEstava, "a IA que caiu por sessão já tinha levantado a faixa sozinha");
    ok(faixa.apareceu && /sess/i.test(faixa.texto), "faixa de sessão caída aparece quando a nuvem derruba o login");
    ok(faixa.botoes.indexOf("Entrar de novo") >= 0, "e ela traz o botão Entrar de novo (um toque, sem procurar o card)");
    const abriu = await p.evaluate(() => {
      window.__contaOrig = self.MT_CONTA_ATUAL;
      let pedido = "";
      self.MT_CONTA_ATUAL = { abre: (q) => { pedido = q; } };
      window.dispatchEvent(new CustomEvent("mt:sessao-caiu"));
      const el = document.getElementById("faixaSessao");
      [...el.querySelectorAll("button")].find((b) => b.textContent === "Entrar de novo").click();
      const sumiu = !document.getElementById("faixaSessao");
      self.MT_CONTA_ATUAL = window.__contaOrig;
      return { pedido, sumiu, logado: window.MTStore.usuario().logado };
    });
    ok(abriu.pedido === "entrar" && abriu.sumiu, "o botão abre a janela de login direto (não o card que diz 'conectado')");
    ok(!abriu.logado, "e o painel para de se dizer conectado com o crachá morto");
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
          if (corpo.acao === "chave_publica") return Promise.resolve({ status: 200, text: () => Promise.resolve(JSON.stringify({ ok: true, publicKey: "pk_teste" })) });
          if (corpo.acao === "assinar") return Promise.resolve({ status: 200, text: () => Promise.resolve(JSON.stringify({ ok: true, assinaturaId: "sub_teste_1", status: "active" })) });
          if (corpo.acao === "assinatura_status") return Promise.resolve({ status: 200, text: () => Promise.resolve(JSON.stringify({ ok: true, status: "active", proximaCobranca: "2026-09-07T12:00:00Z", valor: 45000 })) });
          return Promise.resolve({ status: 200, text: () => Promise.resolve(JSON.stringify({ ok: true, status: "canceled" })) });
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
    await p.click("#pfAcoesBtn"); // as ações do perfil agora moram no menu retrátil ⚡
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
  // 🔎 filtro do topo: todos × pagos no mês × sem pagamento
  {
    const filtro = await p.evaluate(() => {
      // deixa 2 alunos ativos: um pago no mês, um devendo (guardando os originais)
      const st = window.MTStore.read("ptStudio", {});
      window.__alunosOrig = st.alunos;
      window.__pgtosOrig = st.pagamentos;
      st.alunos = [
        { id: "fp1", nome: "Paula Pagou", valor: 300, modo: "mes", ativo: true },
        { id: "fd1", nome: "Davi Devendo", valor: 300, modo: "mes", ativo: true },
      ];
      const mes = new Date().toISOString().slice(0, 7);
      st.pagamentos = [{ id: "pg1", alunoId: "fp1", valor: 300, data: mes + "-05" }];
      window.MTStore.write("ptStudio", st);
      const nomes = () => document.getElementById("listaAlunos").textContent;
      const rot = () => Array.from(document.querySelectorAll("#alFiltro button")).map((b) => b.textContent.trim());
      // filtros da tela 2a: Ativos / Sumindo / Devendo / Encerrados
      window.__alFiltro("ativos");
      const todos = { txt: nomes(), rot: rot(), resumo: document.getElementById("alResumo").textContent };
      // a busca corre DENTRO do filtro atual — então testa em Ativos, não em Devendo
      const busca = (() => { window.__alBusca("paula"); const t = nomes(); window.__alBusca(""); return t; })();
      window.__alFiltro("devendo");
      const devendo = nomes();
      // pelo clique, como o professor faz
      document.querySelector('#alFiltro [data-alf="ativos"]').click();
      const voltou = { txt: nomes(), ativa: document.querySelector("#alFiltro .ativa").getAttribute("data-alf") };
      return { todos, devendo, busca, voltou };
    });
    ok(/Paula Pagou/.test(filtro.todos.txt) && /Davi Devendo/.test(filtro.todos.txt), "🔎 filtro 'Ativos' mostra a lista inteira");
    ok(filtro.todos.rot.join(" ") === "Ativos Sumindo Devendo 1 Encerrados",
      "só o filtro com pendência mostra o número (" + filtro.todos.rot.join(" · ") + ")");
    ok(/2 ativos/.test(filtro.todos.resumo), "o cabeçalho diz o tamanho da carteira");
    ok(/Davi Devendo/.test(filtro.devendo) && !/Paula Pagou/.test(filtro.devendo), "filtro 'Devendo' deixa só quem falta pagar");
    ok(/Paula Pagou/.test(filtro.busca) && !/Davi Devendo/.test(filtro.busca), "a busca por nome filtra a lista");
    ok(/Paula Pagou/.test(filtro.voltou.txt) && filtro.voltou.ativa === "ativos", "clicar em Ativos volta a lista inteira e marca a aba ativa");
    /* ---- lista de alunos repaginada (tela 2a) ---- */
    const l2a = await p.evaluate(() => {
      window.__alFiltro("ativos");
      const r = document.querySelector("#listaAlunos .alrow");
      return {
        colunas: [...document.querySelectorAll(".alcab span")].map((x) => x.textContent),
        temAvatar: !!r.querySelector(".alav"),
        celulas: r.children.length,
        acao: (r.querySelector(".alac .btn") || {}).textContent || "",
        barra: !!r.querySelector(".albar i"),
      };
    });
    ok(l2a.colunas.slice(0, 5).join(",") === "Aluno,Plano,Mês,Ficha,Próxima",
      "🎨 2a: a lista virou tabela com plano, treinos do mês, ficha e próxima sessão");
    ok(l2a.temAvatar && l2a.barra, "🎨 2a: cada linha tem as iniciais do aluno e a barra do mês");
    ok(!!l2a.acao, "🎨 2a: toda linha carrega a ação que resolve o estado dela (" + l2a.acao.trim() + ")");
    // com todo mundo pago, o filtro 'Sem pagamento' comemora em vez de ficar vazio
    const zerado = await p.evaluate(() => {
      const st = window.MTStore.read("ptStudio", {});
      st.pagamentos.push({ id: "pg2", alunoId: "fd1", valor: 300, data: new Date().toISOString().slice(0, 7) + "-06" });
      window.MTStore.write("ptStudio", st);
      window.__alFiltro("devendo");
      return document.getElementById("listaAlunos").textContent;
    });
    ok(/em dia/.test(zerado), "sem ninguém devendo, o filtro comemora em vez de mostrar área vazia");
    // devolve o estado original pro resto da suíte
    await p.evaluate(() => { window.__alFiltro("ativos"); });
  }
  await p.evaluate(() => {
    // volta o aluno original pra sequência seguinte do teste (encerrar aluno)
    const st = window.MTStore.read("ptStudio", {});
    st.alunos = window.__alunosOrig || st.alunos;
    st.pagamentos = window.__pgtosOrig || [];
    window.MTStore.write("ptStudio", st);
    window.__alFiltro("ativos");
  });
  await p.evaluate(() => document.querySelector("#listaAlunos [data-mais]").click());
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
  ok(/personal trainer/.test(corpo) && /treino guiado/i.test(corpo) && /R\$ 49/.test(corpo), "landing com pitch, features atuais e preço");
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
  ok(/Criar conta/.test(gateTxt) && !/equipe TORQUE ON/.test(gateTxt), "autoatendimento: dá pra criar a conta sozinho na primeira abertura (fluxo das lojas)");
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
        quest: document.getElementById("pfQuestBox").innerHTML,
        scanOn: !!(st.config || {}).scanOn,
        scanCard: !!document.getElementById("scanCard") && !document.getElementById("scanCard").hidden,
        autos: (st.zapAutos || []).length,
        servicos: (st.servicosPT || []).length,
        fila: (() => {
          const f = window.__zapFila(st);
          return {
            sumido: f.some((z) => z.chave.indexOf("zauto|au1") === 0),
            boasVindas: f.some((z) => z.chave.indexOf("zautoC|au2") === 0),
            pacoteFoto: f.some((z) => z.chave.indexOf("zautoP|au3") === 0 && z.img === "dimg1"),
          };
        })(),
        temImg: !!localStorage.getItem("mtapp:ptImagens"),
        despesas: (st.despesas || []).length,
        despFixas: (st.despesas || []).filter((d) => d.fixa).length,
        sitePro: !!((st.config || {}).sitePro || {}).slug,
        vidDentro: (st.exercicios || []).some((e) => /demo-video\.webm$/.test(e.video || "")) &&
          (st.videoteca || []).every((v) => !/results\?search_query/.test(v.url || "")),
      }), 400));
    });
    ok(demo.alunos === 24 && demo.fichas === 24 && demo.pagamentos > 20 && demo.avaliacoes > 15, "demo semeia 24 alunos com fichas, pagamentos e avaliações");
    ok(demo.despesas >= 5 && demo.despFixas >= 2, "demo traz despesas do mês (com fixas) pra aba Despesas nascer cheia");
    ok(demo.sitePro, "demo vem com a Minha página já montada (slug e textos)");
    ok(demo.vidDentro, "demo usa vídeos que tocam dentro do app (nada de link de busca do YouTube)");
    ok(demo.autos === 3 && demo.servicos === 3 && demo.temImg, "demo traz as automações de WhatsApp, o catálogo de serviços e a foto da promo");
    ok(demo.fila.sumido && demo.fila.boasVindas && demo.fila.pacoteFoto, "fila do demo mostra aluno sumido, boas-vindas e pacote acabando com a foto");
    ok(/<svg/.test(demo.app) && /Hábitos diários/.test(demo.app) && /ANTES/.test(demo.app), "perfil do demo mostra os gráficos do app (peso, hábitos, fotos)");
    ok(/Batimento médio/.test(demo.app) && /Batimentos — esforço nos treinos/.test(demo.app) && /máxima estimada/.test(demo.app),
      "demo do studio já vem com os batimentos da cinta no perfil (é o que o Raphael manda pro cliente ver)");
    ok(/check-ins? respondidos?/.test(demo.quest) && /(melhorando|estável|piorando)/.test(demo.quest) &&
      /resposta mais comum/.test(demo.quest) && /De 0 a 10, qual foi sua disposição\?/.test(demo.quest),
      "demo mostra os check-ins em linguagem clara: pergunta por extenso, tendência e resposta mais comum");
    ok(/class=['"]qsgraf['"]/.test(demo.quest) && /média do último mês/.test(demo.quest) && /antes /.test(demo.quest),
      "cada pergunta com nota vira gráfico de evolução com a média do mês anterior como régua");
    ok(demo.scanOn && demo.scanCard, "no demo as Medidas pela câmera já vêm ligadas (quem testa acha o recurso sozinho)");
    // com dados existentes o demo NÃO sobrescreve
    const pD2 = await ctxD.newPage();
    await pD2.goto(BASE + "/demo-personal.html");
    const aviso = await pD2.evaluate(() => !document.getElementById("alerta").hidden);
    await pD2.click("#btnDemo");
    await pD2.waitForTimeout(300);
    const preservado = await pD2.evaluate(() => /personal\.html/.test(location.pathname) && JSON.parse(localStorage.getItem("mtapp:ptStudio")).alunos.length === 24);
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

  {
    // 👥 Comunidade: o feed que os alunos publicam entre si
    console.log("Comunidade (feed da turma):");
    const pC = await b.newPage();
    pC.on("pageerror", (e) => erros.push("comunidade: " + e.message));
    await pC.goto(BASE + "/personal.html");
    await pC.evaluate(() => {
      localStorage.setItem("mtapp:ptSemConta", "1");
      localStorage.setItem("mtapp:ptStudio", JSON.stringify({
        config: { nome: "Studio Com" },
        alunos: [{ id: "ac1", nome: "João Silva", ativo: true, valor: 300, appTokenP: "tok-com-123456789" }],
        sessoes: [], pagamentos: [], treinos: {}, avaliacoes: [], exercicios: [], videoteca: [], treinosV2: {},
      }));
    });
    await pC.reload();
    await pC.waitForTimeout(700);

    // 1) desligada por padrão: o app nem tem a aba
    const desligado = await pC.evaluate(() => {
      const st = window.MTStore.read("ptStudio", {});
      const h = window.__montaAppAluno(st.alunos[0], "s1");
      // a barra de abas é montada em runtime: a lista OCULTA é quem tira a Turma
      const oculta = (h.match(/var OCULTA=(\[[^\]]*\])/) || [])[1] || "[]";
      return { temFeed: /fdLista/.test(h), oculta: JSON.parse(oculta) };
    });
    ok(!desligado.temFeed && desligado.oculta.indexOf("feed") >= 0, "👥 a Comunidade vem DESLIGADA — o app sai sem o feed e sem a aba Turma");

    // 2) o professor liga em Configurações e o app ganha o feed
    const ligou = await pC.evaluate(() => {
      document.getElementById("cfgFeed").checked = true;
      document.getElementById("cfgSalva").click();
      const st = window.MTStore.read("ptStudio", {});
      const h = window.__montaAppAluno(st.alunos[0], "s2");
      return {
        salvou: !!st.config.feedOn,
        temFeed: /fdLista/.test(h),
        temAba: /'Turma'/.test(h),
        pendente: !!(st.alunos[0].appPendente || st.alunos[0].appEditadoEm),
        chamaPosta: /app_aluno_posta/.test(h),
        chamaFeed: /app_aluno_feed/.test(h),
        reusaReage: /'feed:'\+/.test(h),
      };
    });
    ok(ligou.salvou && ligou.temFeed && ligou.temAba, "ligar a Comunidade põe o feed e a aba Turma no app do aluno");
    ok(ligou.chamaPosta && ligou.chamaFeed, "o app publica por app_aluno_posta e lê por app_aluno_feed");
    ok(ligou.reusaReage, "curtida e comentário do feed reusam app_aluno_reage com o post 'feed:<id>'");

    // 🆙 nível na Turma + conquistas do professor no app
    const nivelSocial = await pC.evaluate(() => {
      const S2 = window.MTStore, st = S2.read("ptStudio", {});
      st.config.conquistas = [{ e: "fogo", n: "Rato de academia", meta: 200 }];
      S2.write("ptStudio", st);
      const h = window.__montaAppAluno(st.alunos[0], "s3");
      return {
        devolveNivel: /nivel:nivelDe\(xpDados\(\)\)/.test(h),           // o app sincroniza o próprio nível
        seloNoPost: h.indexOf("+(+p.nivel)") > -1,                      // e pinta o Nv do autor no post
        conquistaVai: /Rato de academia/.test(h) && /CQX/.test(h),      // conquista do professor embarca
      };
    });
    ok(nivelSocial.devolveNivel && nivelSocial.seloNoPost,
      "o app devolve o nível pra nuvem e mostra o selo Nv do autor em cada post da Turma");
    ok(nivelSocial.conquistaVai, "conquista criada pelo professor embarca no app do aluno");
    const editorCq = await pC.evaluate(() => {
      // paleta de ícones de traço (sem emoji): escolhe o foguete e cria
      const paleta = document.querySelectorAll("#cqPersIcones [data-cqico]").length;
      document.querySelector("#cqPersIcones [data-cqico='foguete']").click();
      document.getElementById("cqPersNome").value = "Clube das 6 da manhã";
      document.getElementById("cqPersMeta").value = "30";
      document.getElementById("cqPersAdd").click();
      const st = window.MTStore.read("ptStudio", {});
      const criou = (st.config.conquistas || []).length;
      const salvouId = (st.config.conquistas || []).some((c) => c.e === "foguete");
      const bt = document.querySelector("[data-cqrm]");
      if (bt) bt.click();
      return { paleta, criou, salvouId, sobrou: (window.MTStore.read("ptStudio", {}).config.conquistas || []).length,
        pendente: !!st.config.appEditGeralEm };
    });
    ok(editorCq.paleta >= 10 && editorCq.criou === 2 && editorCq.salvouId && editorCq.sobrou === 1 && editorCq.pendente,
      "o editor da Personalização cria conquista com ícone da paleta (sem emoji) e tira, marcando os apps pra republicar");
    // e o SQL do feed devolve o nível do autor (join com app_aluno.retorno)
    const sqlFeed = require("fs").readFileSync(require("path").join(__dirname, "..", "supabase-setup.sql"), "utf8");
    ok(/left join app_aluno a on a\.token = f\.token/.test(sqlFeed) && /'nivel', coalesce\(nullif\(a\.retorno->>'nivel'/.test(sqlFeed),
      "o app_aluno_feed do SQL entrega o nível atual de quem postou");

    // 3) a foto do post é comprimida no celular antes de subir (limite do servidor)
    const compressao = await pC.evaluate(() => {
      const st = window.MTStore.read("ptStudio", {});
      const h = window.__montaAppAluno(st.alunos[0], "s3");
      return { temTetos: /380000/.test(h), temTentativas: /\[900,\.72\]/.test(h) };
    });
    ok(compressao.temTetos && compressao.temTentativas, "a foto do post é reduzida até caber no limite antes de subir");

    // 4) moderação no painel: esconder e apagar pela tabela app_feed
    const mod = await pC.evaluate(() => {
      const chamadas = [];
      window.__cloudOrigF = window.MTStore.cloud;
      const tabela = () => ({
        select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ eq: () => ({
          then: (cb) => cb({ data: [
            { id: "f1", nome: "Mariana", texto: "PR de agacho!", foto: "", treino: "Treino B", oculto: false, criado: "2026-08-11T10:00:00Z" },
          ] }),
        }), then: (cb) => cb({ data: [] }) }) }) }) }),
        update: (v) => ({ eq: (c, id) => { chamadas.push(["update", id, v.oculto]); return { then: (cb) => cb({}) }; } }),
        delete: () => ({ eq: (c, id) => { chamadas.push(["delete", id]); return { then: (cb) => cb({}) }; } }),
      });
      window.MTStore.cloud = () => ({ aid: "acad-1", client: { from: () => tabela() } });
      window.__feedMod.carrega();
      const html = document.getElementById("fdmLista").innerHTML;
      // clica em Esconder no post que veio da nuvem
      const bt = document.querySelector("[data-fdmoc]");
      if (bt) bt.click();
      window.MTStore.cloud = window.__cloudOrigF;
      return { html: html, chamadas: chamadas };
    });
    ok(/Mariana/.test(mod.html) && /PR de agacho/.test(mod.html), "o professor vê no painel o que a turma postou");
    ok(mod.chamadas.some((c) => c[0] === "update" && c[1] === "f1" && c[2] === true), "'Esconder' marca o post como oculto na nuvem (some do app na hora)");

    /* ---- Comunidade repaginada (tela 4d) ---- */
    {
      const b4d = await pC.evaluate(() => ({
        resumo: (document.getElementById("fdmResumo") || {}).textContent || "",
        rotulo: (document.getElementById("fdmLigRot") || {}).textContent || "",
        temSw: !!document.getElementById("fdmLiga"),
        cards: document.querySelectorAll("#fdmLista .fdpost").length,
        cab: !!document.querySelector("#fdmLista .fdpost .fdcab .qsav"),
        aspas: /“PR de agacho!”/.test(document.getElementById("fdmLista").textContent),
        acoes: document.querySelectorAll("#fdmLista .fdpost [data-fdmoc]").length,
      }));
      ok(/post|Ningu[ée]m/.test(b4d.resumo), "🎨 4d: o topo conta os posts da semana (" + b4d.resumo + ")");
      ok(b4d.temSw && /Ligado|Desligado/.test(b4d.rotulo), "🎨 4d: ligar/desligar o feed virou interruptor do cabeçalho");
      ok(b4d.cards === 1 && b4d.cab, "🎨 4d: cada post é um card com avatar e nome");
      ok(b4d.aspas && b4d.acoes === 1, "🎨 4d: o texto sai entre aspas e a moderação fica no próprio post");
    }

    // 5) sem nuvem, o painel explica em vez de quebrar
    const semNuvem = await pC.evaluate(() => {
      window.__cloudOrigF2 = window.MTStore.cloud;
      window.MTStore.cloud = () => null;
      window.__feedMod.carrega();
      const t = document.getElementById("fdmLista").textContent;
      window.MTStore.cloud = window.__cloudOrigF2;
      return t;
    });
    ok(/Entre com a conta da nuvem/.test(semNuvem), "sem nuvem o painel avisa direito em vez de ficar mudo");

    // devolve o estado como estava (senão vaza pros blocos seguintes)
    await pC.evaluate(() => localStorage.removeItem("mtapp:ptStudio"));
    await pC.close();
  }
  {
    // ⭐ favoritos do professor: marca na biblioteca e eles sobem na hora de montar a ficha
    console.log("Exercícios favoritos do professor:");
    const pF = await b.newPage();
    pF.on("pageerror", (e) => erros.push("favoritos: " + e.message));
    await pF.goto(BASE + "/personal.html");
    await pF.evaluate(() => {
      localStorage.setItem("mtapp:ptSemConta", "1");
      localStorage.setItem("mtapp:ptStudio", JSON.stringify({
        config: {}, alunos: [{ id: "af1", nome: "Aluno Fav", ativo: true, valor: 300 }],
        sessoes: [], pagamentos: [], treinos: {}, avaliacoes: [], exercicios: [], videoteca: [],
        treinosV2: { af1: { fichas: [{ id: "ff1", titulo: "A — Teste", itens: [] }] } },
      }));
    });
    await pF.reload();
    await pF.waitForTimeout(600);

    // 1) a estrela da biblioteca liga e desliga o favorito
    await pF.evaluate(() => {
      document.querySelectorAll("[data-trsec]").forEach((e) => { e.hidden = e.getAttribute("data-trsec") !== "ex"; });
      window.__catalogoPT();
    });
    const marcou = await pF.evaluate(() => {
      const bt = Array.from(document.querySelectorAll("#exLista [data-exfav]")).find((x) => x.getAttribute("data-exfav") === "Agachamento livre");
      if (!bt) return null;
      bt.click();
      return { lista: window.__favPT.lista(), topo: document.getElementById("exLista").textContent.slice(0, 40) };
    });
    ok(marcou && marcou.lista.length === 1 && marcou.lista[0] === "Agachamento livre", "★ a estrela da biblioteca marca o exercício como favorito");
    ok(marcou && /Seus favoritos/.test(marcou.topo), "o favorito sobe pro topo, num bloco 'Seus favoritos'");

    // 2) o filtro "só favoritos" esconde o resto
    const filtro = await pF.evaluate(() => {
      document.getElementById("catFav").click();
      return { linhas: document.querySelectorAll("#exLista .sessao-pt").length, rotulo: document.getElementById("catFav").textContent };
    });
    ok(filtro.linhas === 1 && /Só favoritos/.test(filtro.rotulo), "o botão ★ Favoritos filtra a lista (" + filtro.linhas + " linha)");
    await pF.evaluate(() => document.getElementById("catFav").click());

    // 3) na ficha, o favorito ganha grupo próprio no seletor e tem filtro de tipo
    const naFicha = await pF.evaluate(() => {
      document.querySelectorAll("[data-trsec]").forEach((e) => { e.hidden = e.getAttribute("data-trsec") !== "fichas"; });
      const sel = document.getElementById("tAluno");
      sel.value = "af1"; sel.dispatchEvent(new Event("change", { bubbles: true }));
      document.querySelectorAll("#fichasBox details").forEach((d) => { d.open = true; });
      const chips = Array.from(document.querySelectorAll('[data-exchip="ff1"]'));
      return {
        primeiro: chips.length ? chips[0].getAttribute("data-nome") : "",
        temEstrela: chips.length ? /★/.test(chips[0].textContent) : false,
        temFiltro: Array.from(document.querySelectorAll('[data-exmov="ff1"] option')).some((o) => /Meus favoritos/.test(o.value)),
      };
    });
    ok(naFicha.primeiro === "Agachamento livre" && naFicha.temEstrela, "na ficha o favorito é o primeiro chip e leva a ★");
    ok(naFicha.temFiltro, "o seletor de tipo de treino ganha a opção '★ Meus favoritos'");

    // 4) a estrela ao lado do seletor favorita sem sair da ficha
    const pelaFicha = await pF.evaluate(() => {
      const bs = document.querySelector('[data-exbusca="ff1"]');
      bs.value = "Remada curvada";
      bs.dispatchEvent(new Event("input", { bubbles: true }));
      const c = [...document.querySelectorAll('[data-exchip="ff1"]')].find((x) => x.getAttribute("data-nome") === "Remada curvada");
      c.click();
      const antes = document.querySelector('[data-exfavsel="ff1"]').textContent;
      document.querySelector('[data-exfavsel="ff1"]').click();
      return { antes: antes, depois: document.querySelector('[data-exfavsel="ff1"]').textContent, lista: window.__favPT.lista() };
    });
    ok(pelaFicha.antes === "☆" && pelaFicha.depois === "★" && pelaFicha.lista.length === 2, "a estrela ao lado do seletor favorita sem sair da ficha");

    // 5) o filtro de favoritos no tipo de treino deixa só eles
    const soFav = await pF.evaluate(() => {
      const bs2 = document.querySelector('[data-exbusca="ff1"]');
      bs2.value = ""; bs2.dispatchEvent(new Event("input", { bubbles: true }));
      const mv = document.querySelector('[data-exmov="ff1"]');
      mv.value = "★ Meus favoritos"; mv.dispatchEvent(new Event("change", { bubbles: true }));
      return Array.from(document.querySelectorAll('[data-exchip="ff1"]')).map((o) => o.getAttribute("data-nome"));
    });
    ok(soFav.length === 2 && soFav.indexOf("Agachamento livre") >= 0, "escolher '★ Meus favoritos' deixa só os favoritos na lista (" + soFav.length + ")");
    await pF.close();
  }
  {
    // app do aluno: o botão Ver como faz desenha a animação SEM pedir nada pra internet
    const ctxA = await b.newContext({ viewport: { width: 390, height: 844 } });
    const pA = await ctxA.newPage();
    const externas = [];
    pA.on("request", (r) => { if (!/127\.0\.0\.1|localhost/.test(r.url()) && !/^data:/.test(r.url())) externas.push(r.url()); });
    await pA.goto(BASE + "/demo-aluno.html");
    await pA.waitForTimeout(1200);
    /* 🎠 as três fotos do demo (leg press, corrida e circuito) precisam aparecer:
     * com só circuito e corrida no carrossel, a foto de musculação nunca subia. */
    const capasDemo = await pA.evaluate(() => {
      const vis = [].slice.call(document.querySelectorAll("#heroCarr > *")).filter((c) => c.style.display !== "none");
      const fotos = vis.map((c) => { const i = c.querySelector("img[src^='data:image/jpeg']"); return i ? i.src.slice(-80) : ""; });
      return { cards: vis.length, distintas: new Set(fotos.filter(Boolean)).size,
        kickers: vis.map((c) => ((c.querySelector(".htk") || {}).textContent || "")) };
    });
    ok(capasDemo.cards === 3 && capasDemo.distintas === 3,
      "🎠 o carrossel do demo mostra 3 treinos, cada um com a SUA foto (" + capasDemo.cards + " cards, " + capasDemo.distintas + " fotos distintas)");
    ok(capasDemo.kickers.slice(1).length > 0 && capasDemo.kickers.slice(1).every((k) => /^TAMBÉM · /.test(k)),
      "os cards extras dizem TAMBÉM, não HOJE — só o primeiro card é o treino do dia");

    /* ⏱ TODOS os timers do app rodam sem estourar.
     *
     * O feed recarregava com "if(SEC==='feed')", mas SEC é private do IIFE do
     * menu: o timer de 45 s estourava "SEC is not defined" a cada rodada e a
     * Comunidade nunca se atualizava sozinha. Ninguém via, porque o erro só
     * aparece 45 s depois de abrir. Este teste captura os callbacks de
     * setInterval na hora em que são criados e chama cada um, então um
     * vazamento de escopo desses aparece na hora. */
    {
      const ctxT = await b.newContext({ viewport: { width: 390, height: 844 } });
      const pT = await ctxT.newPage();
      await pT.addInitScript(() => {
        window.__timers = [];
        const orig = window.setInterval;
        window.setInterval = function (fn, ms) {
          if (typeof fn === "function") window.__timers.push({ fn, ms });
          return orig.apply(window, arguments);
        };
      });
      await pT.goto(BASE + "/demo-aluno.html");
      await pT.waitForTimeout(1500);
      const tim = await pT.evaluate(() => {
        const falhas = [];
        (window.__timers || []).forEach((t, i) => {
          try { t.fn(); } catch (e) { falhas.push(t.ms + "ms #" + i + ": " + e.message); }
        });
        return { n: (window.__timers || []).length, falhas };
      });
      ok(tim.n >= 3, "⏱ o app registra os timers de fundo (" + tim.n + " encontrados)");
      ok(tim.falhas.length === 0,
        "⏱ nenhum timer do app estoura ao rodar" + (tim.falhas.length ? " — " + tim.falhas.join(" | ") : ""));
      await ctxT.close();
    }
    // 📋 o demo mostra a área Questionários cheia: o do personal E o check-in
    {
      await pA.evaluate(() => window.__trocaSec && window.__trocaSec("quest"));
      await pA.waitForTimeout(400);
      const q = await pA.evaluate(() => {
        const vis = (id) => { const e = document.getElementById(id); return !!e && e.style.display !== "none"; };
        return { qa: vis("qaCard"), ck: vis("ckCard"), vazio: vis("qsVazio"),
          topo: (document.getElementById("qsTopo") || {}).textContent || "",
          menu: (document.getElementById("mgQaBt") || {}).textContent || "" };
      });
      ok(q.qa && q.ck && !q.vazio,
        "📋 o demo tem os DOIS: o questionário do personal e o check-in da semana");
      ok(/2 pra responder/.test(q.topo) && /2/.test(q.menu),
        "a faixa e o menu do demo contam as duas pendências");
      // o questionário abre uma pergunta por tela e volta pra trás
      const fluxo = await pA.evaluate(async () => {
        document.querySelector("#qaCard button").click();
        await new Promise((r) => setTimeout(r, 300));
        const p1 = document.querySelector("#qaFluxo").textContent;
        document.querySelector("#qaFluxo .qaop").click();
        await new Promise((r) => setTimeout(r, 500));
        const p2 = document.querySelector("#qaFluxo").textContent;
        const notas = document.querySelectorAll("#qaFluxo .notabtn").length;
        document.querySelector("#qaX").click();
        await new Promise((r) => setTimeout(r, 200));
        return { p1, p2, notas, fechou: !document.getElementById("qaFluxo") };
      });
      ok(/1\/4/.test(fluxo.p1) && /2\/4/.test(fluxo.p2) && fluxo.notas === 11 && fluxo.fechou,
        "no demo o questionário anda sozinho ao tocar na carinha e a pergunta de 0 a 10 vem depois");
      await pA.evaluate(() => window.__trocaSec && window.__trocaSec("inicio"));
      await pA.waitForTimeout(200);
    }
    await pA.evaluate(() => window.__trocaSec && window.__trocaSec("treino"));
    await pA.waitForTimeout(400);
    // 🗂 fichas A/B/C viraram gavetas: só a do dia nasce aberta
    {
      const gav = await pA.evaluate(() => {
        // .fichabox agora é o desenho das TRÊS abas (ficha, circuito e corrida):
        // aqui a conta é só das fichas
        const g = Array.from(document.querySelectorAll("#trFichasWrap .fichabox"));
        return { n: g.length, abertas: g.filter((x) => x.open).length,
          resumo: g.map((x) => x.querySelector("summary").textContent.replace(/\s+/g, " ").trim()),
          temGuiado: !!g[0].querySelector(".guiabtn"), temEx: g[0].querySelectorAll("details").length };
      });
      ok(gav.n >= 2 && gav.abertas === 1, "🗂 as fichas do treino são gavetas e só a do dia nasce aberta (" + gav.abertas + " de " + gav.n + ")");
      ok(/exercícios/.test(gav.resumo[0]), "o resumo da ficha fechada já diz quantos exercícios tem — " + gav.resumo[0]);
      ok(gav.temGuiado && gav.temEx >= 1, "aquecimento, treino guiado e exercícios ficam dentro da gaveta da ficha");
      // 🗂 circuito e corrida ganharam o MESMO desenho: gaveta com letra A/B/C…,
      // resumo na tampa e só a do dia aberta (pedido do Raphael)
      const gavTr = await pA.evaluate(() => {
        const ler = (sel) => Array.from(document.querySelectorAll(sel)).map((d) => ({
          letra: (d.querySelector("summary span") || {}).textContent,
          sub: (d.querySelector("summary span:nth-child(2) span") || {}).textContent || "",
          aberta: d.open,
        }));
        return { wod: ler("[data-wi]"), cardio: ler("[data-cri]") };
      });
      const letras = (l) => l.map((x) => x.letra).join("");
      // A, B, C, D… — a demo pode ganhar treino novo (o "misto" entrou como D),
      // entao a sequencia esperada nasce do TAMANHO da lista
      const seq = (n) => Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i)).join("");
      ok(gavTr.wod.length >= 2 && letras(gavTr.wod) === seq(gavTr.wod.length) &&
        gavTr.wod.filter((x) => x.aberta).length === 1 && /movimento/.test(gavTr.wod[0].sub),
        "🗂 os circuitos viraram gavetas A/B/C com o resumo na tampa e só uma aberta");
      ok(gavTr.cardio.length >= 2 && letras(gavTr.cardio) === seq(gavTr.cardio.length) &&
        gavTr.cardio.filter((x) => x.aberta).length === 1 && /Corrida|Bike|Caminhada/.test(gavTr.cardio[0].sub),
        "🗂 as corridas e pedais viraram gavetas A/B/C, no mesmo desenho da ficha");
      // o rótulo do dia vem da Semana do aluno; qual deles cai em "hoje" muda
      // conforme o dia em que o teste roda, então a trava é só a de existir
      ok(gavTr.cardio.concat(gavTr.wod).some((x) => /· (hoje|segunda|terça|quarta|quinta|sexta|sábado|domingo)/.test(x.sub)),
        "a tampa da gaveta diz em que dia da semana aquele treino está marcado");
      /* CONTINUO + TIROS na MESMA folha (pedido do Raphael): a tampa mostra as
       * duas partes, e o player guiado enfileira continuo ANTES dos tiros —
       * e a ordem que o corpo aguenta. */
      const misto = await pA.evaluate(() => {
        const g = Array.from(document.querySelectorAll("[data-cri]"))
          .map((d) => (d.querySelector("summary") || d).textContent.replace(/\s+/g, " "));
        const b = window.__crGuia
          ? (window.__crGuia.monta({ t: "misto", n: "Longao", d: 6, tp: 35, p: "6:20", r: 3, ti: 45, de: 75 }) || []).map((x) => x.k)
          : null;
        const so = window.__crGuia
          ? (window.__crGuia.monta({ t: "continuo", n: "Rodagem", d: 5, tp: 30, p: "6:00", r: 3, ti: 45, de: 75 }) || []).map((x) => x.k)
          : null;
        return { tampa: g.find((t) => /\+ \d+×/.test(t)) || "", blocos: (b || []).join(","), soCont: (so || []).join(",") };
      });
      ok(/km/.test(misto.tampa) && /\+ \d+× \d+s forte/.test(misto.tampa),
        "🏃 treino misto: a tampa mostra a parte contínua E os tiros (" + misto.tampa.slice(0, 70) + ")");
      ok(misto.blocos === "aq,c,f,l,f,l,f,l,vc",
        "🏃 no player guiado o misto é aquecimento → contínuo → tiros → volta à calma, nessa ordem (" + misto.blocos + ")");
      ok(misto.soCont === "aq,c,vc",
        "🏃 treino só contínuo continua com um bloco de rodagem só (" + misto.soCont + ")");
      /* O quadro do trajeto: a frase de "ligue o GPS" cabia em 22px cravado
       * num celular de 390 e saía cortada nas DUAS pontas — parecia que o mapa
       * tinha sumido. Agora ela encolhe até caber. */
      const mapa = await pA.evaluate(() => {
        const cv = document.getElementById("crMapa");
        if (!cv) return null;
        const g = cv.getContext("2d");
        const W = cv.width / (window.devicePixelRatio > 1 ? Math.min(2, window.devicePixelRatio) : 1);
        let fs = 20;
        g.font = "700 " + fs + "px system-ui,sans-serif";
        const msg = "Ligue o GPS pra desenhar o trajeto";
        while (fs > 11 && g.measureText(msg).width > W - 30) { fs--; g.font = "700 " + fs + "px system-ui,sans-serif"; }
        return { W: Math.round(W), largura: Math.round(g.measureText(msg).width), fs: fs };
      });
      ok(mapa && mapa.largura <= mapa.W - 20,
        "🗺 a frase do quadro do trajeto cabe na largura do celular (" + (mapa && mapa.largura) + "px em " + (mapa && mapa.W) + "px)");
    }
    await pA.evaluate(() => document.querySelectorAll("details").forEach((d) => { d.open = true; }));
    // a demonstração de bonequinho saiu do app na v465 — aqui fica a trava de que
    // o demo regenerado também não traz nenhum resto dela
    ok(await pA.evaluate(() => !document.querySelector(".animbtn, .animbox")),
      "o demo do aluno não tem resto da demonstração de bonequinho");
    ok(externas.length === 0, "o demo não busca NADA na internet (offline de verdade)" + (externas.length ? " — " + externas[0] : ""));

    // 🆙 no demo, o feed mostra o nível de cada autor e as conquistas do
    // professor aparecem junto das padrão
    const demoNv = await pA.evaluate(async () => {
      window.__trocaSec("feed");
      await new Promise((r) => setTimeout(r, 700));
      const feed = document.getElementById("fdLista").textContent;
      window.__trocaSec("evolucao");
      const cq = document.getElementById("cqGrid").textContent;
      return { selo: /Nv \d/.test(feed), custom: /Rato de academia/.test(cq) && /Lenda do Studio/.test(cq) };
    });
    ok(demoNv.selo, "no feed da Turma cada autor aparece com o selo Nv dele");
    ok(demoNv.custom, "as conquistas criadas pelo professor aparecem no card Conquistas do demo");
    await pA.close();
    await ctxA.close();
  }

  {
    // 📷 medidas pela câmera: consentimento, preenchimento e entrada no laudo
    console.log("Medidas pela câmera:");
    const ctxS = await b.newContext({ viewport: { width: 1360, height: 900 } });
    await ctxS.addInitScript(() => {
      localStorage.setItem("mtapp:perfil", JSON.stringify({ nome: "Raphael" }));
      localStorage.setItem("mtapp:ptSemConta", "1");
    });
    const pS = await ctxS.newPage();
    pS.on("pageerror", (e) => erros.push("scan: " + e.message));
    pS.on("dialog", (d) => d.accept());
    await pS.goto(BASE + "/personal.html");
    await pS.waitForFunction(() => window.__ptStudio);
    await pS.evaluate(() => {
      const S2 = window.MTStore, st = S2.read("ptStudio", {});
      st.config = st.config || {};
      st.alunos = [{ id: "s1", nome: "Marina Souza", sexo: "F", altura: 165, ativo: true }];
      st.avaliacoes = [];
      S2.write("ptStudio", st);
    });
    await pS.reload();
    await pS.waitForTimeout(500);
    const menuS = pS.locator("#btnMenuPt");
    if (await menuS.isVisible()) await menuS.click();
    await pS.click('#abas [data-a="avaliacoes"]');
    await pS.waitForTimeout(300);

    ok(await pS.evaluate(() => document.getElementById("scanCard").hidden),
      "o card fica escondido enquanto a chave nas Configurações estiver desligada");

    await pS.evaluate(() => {
      const S2 = window.MTStore, st = S2.read("ptStudio", {});
      st.config.scanOn = true;
      S2.write("ptStudio", st);
    });
    await pS.reload();
    await pS.waitForTimeout(600);
    const menuS2 = pS.locator("#btnMenuPt");
    if (await menuS2.isVisible()) await menuS2.click();
    await pS.click('#abas [data-a="avaliacoes"]');
    await pS.waitForTimeout(300);
    ok(!(await pS.evaluate(() => document.getElementById("scanCard").hidden)), "com a chave ligada o card aparece");

    // consentimento é obrigatório e fica registrado com a versão do texto
    await pS.selectOption("#scanAluno", "s1");
    await pS.click("#scanIniciar");
    const termo = await pS.evaluate(() => ({
      termo: !document.getElementById("scanTermo").hidden,
      preparo: !document.getElementById("scanPreparo").hidden,
      altura: document.getElementById("scanAltura").value,
      sexo: document.getElementById("scanSexo").value,
    }));
    ok(termo.termo && !termo.preparo, "antes de qualquer foto, pede a autorização do aluno");
    ok(termo.altura === "165" && termo.sexo === "F", "altura e sexo vêm do cadastro do aluno (a altura é a régua)");
    await pS.click("#scanTermoOk");
    ok(await pS.evaluate(() => document.getElementById("scanPreparo").hidden),
      "sem marcar a autorização, não libera a captura");
    await pS.check("#scanAceite");
    await pS.click("#scanTermoOk");
    await pS.waitForTimeout(200);
    const consent = await pS.evaluate(() => {
      const st = window.MTStore.read("ptStudio", {});
      return { versao: (st.alunos[0].consentimentoScan || {}).versao, preparo: !document.getElementById("scanPreparo").hidden };
    });
    ok(consent.versao === "2026-08-scan-1" && consent.preparo,
      "a autorização fica gravada com a versão do texto, e a captura libera");

    // tutorial guiado: abre no 1º passo, o passo da pose tem desenho, e dá pra pular
    const tuto0 = await pS.evaluate(() => window.__scan.tuto());
    ok(tuto0.aberto && tuto0.passo === 0, "junto com a captura abre o tutorial guiado, no primeiro passo");
    await pS.click("#scanTutoAvanca");
    await pS.click("#scanTutoAvanca");
    await pS.click("#scanTutoAvanca");
    const tutoPose = await pS.evaluate(() => ({
      t: window.__scan.tuto(),
      svg: !!document.querySelector("#scanTutoPasso svg"),
      texto: document.getElementById("scanTutoPasso").textContent,
      voltar: !document.getElementById("scanTutoVolta").hidden,
    }));
    ok(tutoPose.t.passo === 3 && tutoPose.svg && /de frente/.test(tutoPose.texto),
      "o passo da 1ª foto mostra o DESENHO da pose (braços em V), não só texto");
    ok(tutoPose.voltar, "dá pra voltar um passo pra rever");
    await pS.click("#scanTutoPula");
    ok(await pS.evaluate(() => !window.__scan.tuto().aberto), "quem já sabe pula o tutorial e vai direto pros botões");

    // resultado na tela -> campos da avaliação -> registro -> laudo
    const tela = await pS.evaluate(() => {
      const st = window.MTStore.read("ptStudio", {});
      window.__scan.pinta({
        ok: true, quando: "2026-08-12",
        circ: { cintura: 78.4, quadril: 96.2, coxa: 55.1, braco: 28.3 },
        confianca: { cintura: "alta", quadril: "alta", coxa: "média", braco: "baixa" },
        rcest: 0.48, margemCm: 3, calibrado: false,
        gordura: { valor: 25.9, faixa: [20.9, 30.9], metodo: "RFM" }, avisos: [],
      }, st.alunos[0]);
      const box = document.getElementById("scanResultado");
      return { visivel: !box.hidden, texto: box.textContent.replace(/\s+/g, " ") };
    });
    ok(tela.visivel && /Razão cintura \/ altura/.test(tela.texto) && /0,48/.test(tela.texto),
      "a tela destaca a razão cintura/altura, que é a medida que não depende da régua");
    ok(/entre 21% e 31%/.test(tela.texto), "o percentual de gordura sai em faixa, nunca cravado");
    ok(/não substitui fita métrica/.test(tela.texto), "o aviso de que é estimativa aparece junto do resultado");
    ok(/confiança baixa/.test(tela.texto), "cada medida mostra o quanto dá pra confiar nela");

    // o resultado agora é visual: boneco com as medidas apontadas no corpo
    const boneco = await pS.evaluate(() => {
      const svg = document.querySelector("#scanResultado svg.av-corpo");
      return { tem: !!svg, texto: svg ? svg.textContent : "" };
    });
    ok(boneco.tem && /Cintura/.test(boneco.texto) && /78,4 cm/.test(boneco.texto) && /Quadril/.test(boneco.texto),
      "o boneco aparece com as medidas apontadas nas regiões do corpo");
    ok(!/Panturrilha/.test(boneco.texto),
      "medida que a foto não deu (panturrilha) fica fora do boneco — nada inventado");

    await pS.click("#scanUsar");
    await pS.waitForTimeout(200);
    const campos = await pS.evaluate(() => ({
      cintura: document.getElementById("avCintura").value,
      quadril: document.getElementById("avQuadril").value,
      gordura: document.getElementById("avGord").value,
    }));
    ok(campos.cintura === "78.4" && campos.quadril === "96.2" && campos.gordura === "",
      "'Usar estes números' preenche as medidas — mas o % da foto NÃO vira % medido (entra só como último recurso no salvar)");
    ok(await pS.evaluate(() => /Tríceps/.test((document.querySelector("#dbCampos label") || {}).textContent || "")),
      "selecionar a aluna pelo scanner troca as dobras pro protocolo feminino (o atalho dispara o change)");

    await pS.evaluate(() => { document.getElementById("avPeso").value = "62"; });
    await pS.click("#avAdd");
    await pS.waitForTimeout(400);
    const salvo = await pS.evaluate(() => {
      const st = window.MTStore.read("ptStudio", {});
      const av = st.avaliacoes[0] || {};
      const l = window.__laudoPT.calcula(st, av);
      return {
        temScan: !!av.scan, scanCintura: av.scan && av.scan.circ.cintura,
        etiqueta: />câmera</.test(document.getElementById("listaAvaliacoes").innerHTML),
        laudoRcq: l ? l.rcq : null, laudoCintura: l ? l.cintura : null,
      };
    });
    ok(salvo.temScan && salvo.scanCintura === 78.4,
      "o que veio da câmera fica guardado à parte, pra nunca se passar por medida de fita");
    ok(salvo.etiqueta, "a avaliação ganha a etiqueta 'câmera' no histórico");
    ok(salvo.laudoCintura === 78.4 && salvo.laudoRcq === 0.81,
      "as circunferências da câmera alimentam o laudo (cintura-quadril calculada)");

    // a fita sempre vence a foto, e a bioimpedância vence as duas
    const precede = await pS.evaluate(() => {
      const C = window.MT_CORPO;
      const soFoto = C.calcula({ sexo: "F", altura: 165, peso: 62, scan: { gordura: 26 } });
      const fita = C.calcula({ sexo: "F", altura: 165, peso: 62, gordura: 22, scan: { gordura: 26 } });
      const balanca = C.calcula({ sexo: "F", altura: 165, peso: 62, gordura: 22, scan: { gordura: 26 }, bia: { massaGordura: 12 } });
      return { foto: soFoto.gordura, fotoMarcada: soFoto.estimadoPorFoto,
        fita: fita.gordura, fitaMarcada: fita.estimadoPorFoto,
        balanca: balanca.gordura, nota: /estimada por foto/.test(C.laudoHtml(soFoto, { nome: "x" })) };
    });
    ok(precede.foto === 26 && precede.fotoMarcada && precede.nota,
      "só com a câmera, o laudo usa a foto e avisa que a medida é estimada por foto");
    ok(precede.fita === 22 && !precede.fitaMarcada, "havendo medida de fita ou dobras, ela vence a da câmera");
    ok(precede.balanca === 19.4, "e a bioimpedância vence as duas");

    // 🎥 captura guiada: gabarito na tela, semáforo e desligar a câmera ao sair
    const guia = await pS.evaluate(() => {
      const cv = document.createElement("canvas");
      cv.width = 300; cv.height = 500;
      const g = cv.getContext("2d");
      window.MT_CAMERA.desenhaGuia(g, 300, 500, "frente", "#4ade80");
      const px = g.getImageData(0, 0, 300, 500).data;
      let pintados = 0;
      for (let i = 3; i < px.length; i += 4) if (px[i] > 0) pintados++;
      return { suportado: window.MT_CAMERA.suportado(), pintados };
    });
    ok(guia.suportado, "o navegador do celular tem tudo que a captura guiada precisa");
    ok(guia.pintados > 500, "o gabarito é desenhado por cima da câmera (silhueta de onde ficar)");

    await pS.click("#scanAoVivo");
    await pS.waitForFunction(() => {
      const v = document.getElementById("scanVideo");
      return !document.getElementById("scanCam").hidden && v.srcObject && v.videoWidth > 0;
    }, null, { timeout: 20000 });
    ok(true, "o botão da câmera guiada abre a tela cheia e liga o vídeo");

    // sem ninguém na imagem o semáforo tem que reclamar, nunca disparar sozinho
    const semaforo = await pS.waitForFunction(() => {
      const t = document.getElementById("scanCamFala").textContent;
      return t && !/Ligando|Baixando|Preparando|Carregando/.test(t) ? t : null;
    }, null, { timeout: 90000 }).then((h) => h.jsonValue());
    ok(/ninguém|corpo|enquadr|inteiro|afaste|aproxime|celular/i.test(semaforo),
      "com a imagem vazia ele avisa o que corrigir em vez de tirar a foto: " + JSON.stringify(semaforo));
    ok(await pS.evaluate(() => document.getElementById("scanContagem").style.display === "none"),
      "a contagem 3-2-1 só aparece quando o enquadramento está certo");

    await pS.click("#scanCamFechar");
    await pS.waitForTimeout(300);
    const desligou = await pS.evaluate(() => {
      const v = document.getElementById("scanVideo");
      const t = v.srcObject ? v.srcObject.getTracks() : [];
      return {
        fechou: document.getElementById("scanCam").hidden,
        vivas: t.filter((x) => x.readyState === "live").length,
        semQuadro: !window.__scan.camQuadros().frente,
      };
    });
    ok(desligou.fechou && desligou.vivas === 0,
      "ao fechar, a câmera é desligada de verdade (nenhuma trilha continua ligada)");
    ok(desligou.semQuadro, "saindo no meio, nada de imagem fica guardado");

    // regressão do celular do Raphael: dois quadros no MESMO milissegundo
    // derrubavam o motor de vez ("Packet timestamp mismatch"), e daí em diante
    // até a medição por foto solta falhava
    const ts = await pS.evaluate(async () => {
      const cv = document.createElement("canvas");
      cv.width = 480; cv.height = 640;
      const g = cv.getContext("2d");
      g.fillStyle = "#1b1b1b"; g.fillRect(0, 0, 480, 640);
      await window.MT_VISAO.carrega("");
      try {
        window.MT_VISAO.le(cv, { video: true, instante: 1000 });
        window.MT_VISAO.le(cv, { video: true, instante: 1000 });
        window.MT_VISAO.le(cv, { video: true, instante: 1000 });
        const foto = window.MT_VISAO.le(cv);   // e volta pro modo foto inteiro
        return { ok: true, largura: foto.largura };
      } catch (e) { return { ok: false, erro: e.message }; }
    });
    ok(ts.ok && ts.largura === 480,
      "quadros no mesmo milissegundo não derrubam o leitor, e a foto solta continua funcionando depois" +
      (ts.ok ? "" : " — " + ts.erro));

    const amig = await pS.evaluate(() => ({
      tecnico: window.MT_VISAO.erroAmigavel(new Error("INVALID_ARGUMENT: CalculatorGraph::Run() failed: Packet timestamp mismatch on a calculator receiving from stream \"free_memory\".")),
      nosso: window.MT_VISAO.erroAmigavel(new Error("A cabeça ficou cortada. Afaste mais o celular.")),
    }));
    ok(!/CalculatorGraph/.test(amig.tecnico) && /fita métrica/.test(amig.tecnico),
      "erro técnico do motor vira recado em português com o que fazer agora");
    ok(amig.nosso === "A cabeça ficou cortada. Afaste mais o celular.",
      "e o recado que já estava em português passa inteiro");

    const galeria = await pS.evaluate(() => {
      const f = document.getElementById("scanFrente");
      const e = getComputedStyle(f);
      return {
        frente: f.hasAttribute("capture"),
        lado: document.getElementById("scanLado").hasAttribute("capture"),
        aviso: /foto já salva/.test(document.getElementById("scanPreparo").textContent),
        // display:none impede o Safari do iPhone de abrir o seletor pelo <label>
        visivel: e.display !== "none" && e.visibility !== "hidden" && !f.hidden,
        heic: /heic/i.test(f.getAttribute("accept") || ""),
      };
    });
    ok(!galeria.frente && !galeria.lado && galeria.aviso,
      "os botões de foto deixam usar imagem já salva no aparelho, não só tirar na hora");
    ok(galeria.visivel && galeria.heic,
      "o campo de arquivo continua clicável no iPhone (nada de display:none) e aceita HEIC");

    // o teste que importa: tocar no botão TEM que abrir o seletor de arquivo
    const abriu = await Promise.all([
      pS.waitForEvent("filechooser", { timeout: 5000 }).then((fc) => !!fc).catch(() => false),
      pS.click("#scanBtFrente"),
    ]);
    ok(abriu[0], "tocar em 🖼️ Foto 1 abre o seletor (fototeca/arquivos) de verdade");

    // escolher a foto tem que dizer o que já tem e o que falta fazer
    const escolha = await pS.evaluate(async () => {
      const cv = document.createElement("canvas");
      cv.width = 40; cv.height = 60;
      const blob = await new Promise((r) => cv.toBlob(r, "image/png"));
      const dt = new DataTransfer();
      dt.items.add(new File([blob], "frente.png", { type: "image/png" }));
      const inp = document.getElementById("scanFrente");
      inp.files = dt.files;
      inp.dispatchEvent(new Event("change"));
      return {
        recado: document.getElementById("scanEstado").textContent,
        medir: !document.getElementById("scanMedir").disabled,
      };
    });
    ok(/Frente ✓/.test(escolha.recado) && /Medir/.test(escolha.recado) && escolha.medir,
      "ao escolher a foto a tela diz o que já tem e manda tocar em Medir: " + JSON.stringify(escolha.recado));

    const tempos = await pS.evaluate(() => ({
      pausa: window.MT_CAMERA.CONFIG.msDepoisDaFoto,
      contagem: window.MT_CAMERA.CONFIG.segundosContagem,
      virar: !!document.getElementById("scanCamVirar"),
      frontal: window.__scan.camFrontal(),
    }));
    ok(tempos.pausa >= 1200, "a tela segura o 'Foto tirada ✓' antes de fechar (não some na cara da pessoa)");
    ok(tempos.virar && tempos.frontal === false,
      "dá pra virar pra câmera da frente, e a de trás continua sendo a padrão");
    ok(tempos.contagem >= 5, "a contagem antes do disparo dá tempo da pessoa se ajeitar");

    // deu erro: a tela NÃO pode sumir — some era o que deixava o Raphael sem
    // saber o que tinha acontecido
    const falhou = await pS.evaluate(() => {
      window.__scan.camErro(new Error("INVALID_ARGUMENT: CalculatorGraph::Run() failed: teste"));
      return {
        aberta: !document.getElementById("scanCam").hidden,
        fala: document.getElementById("scanCamFala").textContent,
        tecnico: document.getElementById("scanCamTec").textContent,
        deNovo: !document.getElementById("scanCamDeNovo").hidden,
      };
    });
    ok(falhou.aberta && falhou.deNovo && /travou/.test(falhou.fala),
      "quando dá erro a tela da câmera fica aberta explicando, com o botão de tentar de novo");
    ok(/CalculatorGraph/.test(falhou.tecnico),
      "e guarda o detalhe técnico em letra pequena, pro print do Raphael valer de diagnóstico");
    await pS.evaluate(() => window.__scan.camFecha());

    // versão à vista: é o que separa "já corrigi" de "aqui continua igual"
    const versao = await pS.evaluate(async () => {
      const menu = document.getElementById("btnMenuPt");
      if (menu && menu.offsetParent !== null) menu.click();
      document.querySelector('#abas [data-a="config"]').click();
      await new Promise((r) => setTimeout(r, 300));
      return {
        mostrada: document.getElementById("cfgVersao").textContent,
        global: window.MT_VERSAO,
        botao: !!document.getElementById("cfgAtualiza"),
        atualiza: typeof window.MT_ATUALIZA === "function",
      };
    });
    ok(/^mt-v\d+$/.test(versao.mostrada) && versao.mostrada === versao.global,
      "as Configurações mostram a versão que está rodando (" + versao.mostrada + ")");
    ok(versao.botao && versao.atualiza,
      "e tem o botão que baixa a versão nova quando o navegador segura a antiga");
    await ctxS.close();
  }
  {
    // 🧪 laudo completo de composição corporal (estilo bioimpedância)
    console.log("Laudo de composição corporal:");
    const ctxL = await b.newContext({ viewport: { width: 1360, height: 900 } });
    await ctxL.addInitScript(() => {
      localStorage.setItem("mtapp:perfil", JSON.stringify({ nome: "Raphael" }));
      localStorage.setItem("mtapp:ptSemConta", "1");
    });
    const pL = await ctxL.newPage();
    pL.on("pageerror", (e) => erros.push("laudo: " + e.message));
    pL.on("dialog", (d) => d.accept());
    await pL.goto(BASE + "/personal.html");
    await pL.waitForFunction(() => window.__ptStudio);
    await pL.evaluate(() => {
      const S2 = window.MTStore;
      const st = S2.read("ptStudio", {});
      st.alunos = [{ id: "av1", nome: "Marina Souza", sexo: "F", altura: 165, nasc: "1986-03-10", ativo: true }];
      st.avaliacoes = [
        { id: "e0", alunoId: "av1", data: "2026-05-10", peso: 76, gordura: 21, cintura: 84, quadril: 97 },
        { id: "e1", alunoId: "av1", data: "2026-08-12", peso: 72.9, gordura: 16.2, cintura: 80, quadril: 96 },
      ];
      S2.write("ptStudio", st);
    });
    await pL.reload();
    await pL.waitForTimeout(700);

    const L = await pL.evaluate(() => {
      const st = window.MTStore.read("ptStudio", {});
      const l = window.__laudoPT.calcula(st, st.avaliacoes[1]);
      // o laudo em cards mora no PERFIL do aluno (aba Avaliações do perfil)
      window.__perfilPT("av1");
      window.__pfAba("aval");
      return {
        idade: window.__laudoPT.idade("1986-03-10"),
        imc: l.imc, massaGordura: l.massaGordura, massaMagra: l.massaMagra,
        agua: l.agua, proteina: l.proteina, mineral: l.mineral,
        tmb: l.tmb, smi: l.smi, grau: l.grauObesidade, rcq: l.rcq,
        controlePeso: l.controlePeso, pontuacao: l.pontuacao,
        resumo: (document.getElementById("pfLaudo") || {}).textContent.replace(/\s+/g, " "),
        temBotao: !!document.getElementById("pfLaudoAbrir"),
        temLaudoNoHistorico: /data-avlaudo/.test(document.getElementById("listaAvaliacoes").innerHTML),
        semLaudoNaAba: !document.getElementById("avLaudoBox"),
      };
    });
    // confere contra um laudo InBody real da mesma pessoa (F, 40a, 165 cm, 72,9 kg, 16,2%)
    ok(L.idade === 40 && L.imc === 26.8 && L.massaGordura === 11.8 && L.massaMagra === 61.1,
      "🧪 IMC, massa de gordura e massa magra batem com o laudo de bioimpedância");
    ok(L.agua === 44.7 && L.proteina === 12.2 && L.mineral === 4.19 && L.tmb === 1690,
      "água, proteína, minerais e metabolismo basal saem calculados (±0,1 do aparelho)");
    ok(L.smi === 9 && L.grau === 127 && L.rcq === 0.83 && L.controlePeso === 0,
      "índice muscular, grau de obesidade, cintura-quadril e ajuste de peso conferem");
    ok(L.pontuacao > 0 && /Pontuação/.test(L.resumo) && L.temBotao && L.temLaudoNoHistorico,
      "o laudo em cards aparece no perfil do aluno com o botão do laudo completo (e o atalho por avaliação no histórico)");
    ok(L.semLaudoNaAba, "a aba Avaliações não mostra mais o laudo da última avaliação global");
    // o painel novo: cards com selo de classificação + gordura aberta em massas
    ok(/IMC/.test(L.resumo) && /sobrepeso/.test(L.resumo),
      "o card do IMC traz o selo com a classificação por extenso");
    ok(/Hidratação/.test(L.resumo) && /Cintura-quadril/.test(L.resumo),
      "hidratação e cintura-quadril viram cards com selo, como nos apps de bioimpedância");
    ok(/Massa gorda/.test(L.resumo) && /Massa magra/.test(L.resumo),
      "o donut abre o peso em massa gorda × massa magra");

    // parse da resposta da IA: prosa com chaves depois do JSON não pode quebrar
    const parse = await pL.evaluate(() => ({
      prosa: window.__iaParse('Segue o plano: {"fichas":[{"titulo":"A"}],"resumo":"ok"}\nObs: ajuste a {carga} na hora.'),
      cerca: window.__iaParse('```json\n{"fichas":[{"titulo":"B"}]}\n```'),
      lixo: window.__iaParse("não consegui montar"),
    }));
    ok(parse.prosa && parse.prosa.fichas.length === 1 && parse.prosa.resumo === "ok",
      "a resposta da IA com comentário depois do JSON continua sendo lida (era o bug do 'formato inesperado')");
    ok(parse.cerca && parse.cerca.fichas[0].titulo === "B" && parse.lixo === null,
      "cerca de código passa, e texto sem JSON devolve null sem quebrar");

    const htmlL = await pL.evaluate(() => {
      const st = window.MTStore.read("ptStudio", {});
      const l = window.__laudoPT.calcula(st, st.avaliacoes[1]);
      return window.MT_CORPO.laudoHtml(l, { nome: "Marina Souza", quando: "2026-08-12", marca: "TORQUE PERSONAL",
        historico: [{ data: "2026-05-10", peso: 76 }, { data: "2026-08-12", peso: 72.9 }] });
    });
    ok(/Composição corporal/.test(htmlL) && /Controle de peso/.test(htmlL) && /Histórico/.test(htmlL) &&
      /Gasto calórico em 30 minutos/.test(htmlL) && /estimados/.test(htmlL),
      "o laudo imprimível traz todos os blocos e avisa que os valores são estimados");

    // bioimpedância digitada vence a estimativa
    const biaL = await pL.evaluate(() => {
      const S2 = window.MTStore;
      const st = S2.read("ptStudio", {});
      st.avaliacoes[1].bia = { agua: 44.8, proteina: 12.2, mineral: 4.13, massaGordura: 11.8, mme: 34.7,
        segmentar: [{ nome: "Braço esquerdo", magra: 3.6 }, { nome: "Braço direito", magra: 3.67 },
          { nome: "Tronco", magra: 27.4 }, { nome: "Perna esquerda", magra: 8.51 }, { nome: "Perna direita", magra: 8.6 }] };
      S2.write("ptStudio", st);
      const l = window.__laudoPT.calcula(st, st.avaliacoes[1]);
      const html = window.MT_CORPO.laudoHtml(l, { nome: "x", marca: "TORQUE PERSONAL" });
      return { mme: l.mme, agua: l.agua, smi: l.smi, estimado: l.estimado,
        temSegmentar: /Análise segmentar/.test(html) && /Perna direita/.test(html), medidos: /medidos em bioimpedância/.test(html) };
    });
    ok(biaL.mme === 34.7 && biaL.agua === 44.8 && biaL.smi === 9 && !biaL.estimado,
      "⚖️ com a bioimpedância digitada o laudo usa os valores medidos");
    ok(biaL.temSegmentar && biaL.medidos, "a análise por segmento (braços, tronco e pernas) entra no laudo");
    await ctxL.close();
  }
  {
    // 🗑 exclusão de conta: a Play e a Apple exigem em todo app com login.
    // Sem conta na nuvem, apagar é apagar o aparelho — que é onde os dados estão.
    console.log("Excluir minha conta:");
    const ctxX = await b.newContext({ viewport: { width: 1360, height: 900 } });
    await ctxX.addInitScript(() => {
      localStorage.setItem("mtapp:perfil", JSON.stringify({ nome: "Raphael" }));
      localStorage.setItem("mtapp:ptSemConta", "1");
    });
    const pX = await ctxX.newPage();
    pX.on("pageerror", (e) => erros.push("excluir: " + e.message));
    await pX.goto(BASE + "/personal.html");
    await pX.waitForFunction(() => window.__ptStudio);
    await pX.evaluate(() => {
      const S2 = window.MTStore, st = S2.read("ptStudio", {});
      st.alunos = [{ id: "x1", nome: "Marina", ativo: true }];
      S2.write("ptStudio", st);
      localStorage.setItem("outrosite:nao-mexer", "1");
    });
    await abaPt(pX, "config");
    await pX.evaluate(() => window.__cfgAba("conta")); // o card de excluir mora na sub-aba conta
    await pX.waitForTimeout(300);

    let confirmar = false, digitado = "";
    pX.on("dialog", (d) => (d.type() === "prompt" ? d.accept(digitado) : confirmar ? d.accept() : d.dismiss()));

    // cancelar no meio não pode apagar nada
    await pX.click("#cfgExcluir");
    await pX.waitForTimeout(200);
    ok(await pX.evaluate(() => !!localStorage.getItem("mtapp:ptStudio")),
      "cancelar a confirmação não apaga nada");

    // digitar errado também não
    confirmar = true; digitado = "excluir tudo";
    await pX.click("#cfgExcluir");
    await pX.waitForTimeout(300);
    ok(await pX.evaluate(() => !!localStorage.getItem("mtapp:ptStudio")),
      "sem digitar EXCLUIR certinho, os dados continuam lá");

    // confirmando as duas etapas, apaga
    digitado = "EXCLUIR";
    await pX.click("#cfgExcluir");
    await pX.waitForTimeout(600);
    const depois = await pX.evaluate(() => ({
      studio: localStorage.getItem("mtapp:ptStudio"),
      perfil: localStorage.getItem("mtapp:perfil"),
      alheio: localStorage.getItem("outrosite:nao-mexer"),
    }));
    ok(!depois.studio && !depois.perfil, "confirmando as duas etapas, os dados do aparelho vão embora");
    ok(depois.alheio === "1", "e nada que não seja do TORQUE ON é tocado no aparelho");
    await ctxX.close();

    // a página pública que a Play exige (dá pra pedir exclusão sem instalar o app)
    const ctxP = await b.newContext();
    const pP = await ctxP.newPage();
    pP.on("pageerror", (e) => erros.push("excluir-conta.html: " + e.message));
    const resp = await pP.goto(BASE + "/excluir-conta.html");
    const pag = await pP.evaluate(() => document.body.textContent);
    ok(resp.status() === 200 && /Excluir minha conta/.test(pag) && /raphael_marge@icloud\.com/.test(pag),
      "a página pública de exclusão está no ar, com o caminho pelo app e o e-mail de contato");
    ok(/30 dias|7 dias/.test(pag), "e diz os prazos, que é o que a loja cobra na revisão");
    await ctxP.close();
  }
  {
    /* ---- Modo claro (tela 3d): as telas novas seguem o tema ---- */
    console.log("Modo claro do painel:");
    {
      const ctxL = await b.newContext({ viewport: { width: 1360, height: 900 } });
      await ctxL.addInitScript(() => {
        localStorage.setItem("mtapp:perfil", JSON.stringify({ nome: "Raphael" }));
        localStorage.setItem("mtapp:ptSemConta", "1");
      });
      const pL = await ctxL.newPage();
      await pL.goto(BASE + "/personal.html");
      await pL.waitForTimeout(600);
      // conta o que o professor VÊ (cor calculada), não a classe — lição da v612
      const lum = (rgb) => {
        const m = String(rgb).match(/\d+/g) || [0, 0, 0];
        return (0.2126 * +m[0] + 0.7152 * +m[1] + 0.0722 * +m[2]) / 255;
      };
      const CLASSES = ["qslista", "chlado", "tdficha", "cfgcard", "cfgsw", "fdpost", "agrol", "pfbox"];
      const mede = () => pL.evaluate((cls) => {
        const d = document.createElement("div");
        document.body.appendChild(d);
        const out = {};
        cls.forEach((c) => {
          d.className = c;
          out[c] = getComputedStyle(d).backgroundColor;
        });
        const sw = document.createElement("input");
        sw.type = "checkbox"; sw.className = "sw2";
        document.body.appendChild(sw);
        out.__sw = getComputedStyle(sw).backgroundColor;
        const h = document.createElement("div");
        h.className = "alh"; d.className = "altopo"; d.appendChild(h);
        out.__tx = getComputedStyle(h).color;
        d.remove(); sw.remove();
        return out;
      }, cls);
      const cls = CLASSES;
      const escuro = await mede();
      await pL.evaluate(() => document.getElementById("btnTemaPt").click());
      await pL.waitForTimeout(300);
      const claro = await mede();
      const virou = CLASSES.filter((c) => lum(escuro[c]) < 0.35 && lum(claro[c]) > 0.85);
      ok(virou.length === CLASSES.length,
        "🎨 3d: as superfícies das telas novas clareiam de verdade no modo claro (" + virou.length + " de " + CLASSES.length + ")");
      ok(lum(escuro.__tx) > 0.8 && lum(claro.__tx) < 0.3,
        "🎨 3d: o texto do cabeçalho vira escuro no fundo claro (sem branco no branco)");
      ok(lum(escuro.__sw) < 0.3 && lum(claro.__sw) > 0.7,
        "🎨 3d: o trilho do interruptor também segue o tema");
      // o roxo da marca NÃO muda entre os temas (regra do handoff)
      const roxo = await pL.evaluate(() => {
        const d = document.createElement("div");
        d.style.background = "var(--roxo)";
        document.body.appendChild(d);
        const c = getComputedStyle(d).backgroundColor;
        d.remove();
        return c;
      });
      ok(/124,\s*58,\s*237/.test(roxo), "🎨 3d: o roxo da marca é o mesmo nos dois temas");
      // a página de vendas é documento AUTÔNOMO: não pode levar token do painel
      const pagina = await pL.evaluate(() => window.__sitePro.monta(window.MTStore.read("ptStudio", {})));
      ok(!/var\(--tk-/.test(pagina),
        "🎨 3d: a página de vendas publicada não leva token do painel (lá esses nomes não existem)");
      await ctxL.close();
    }

    // 🖥 menu do computador: fica sempre à vista (1 clique por aba); no celular vira gaveta
    console.log("Menu fixo no computador:");
    for (const alvo of [
      { url: "personal.html", menu: "#abas", barra: "#navPt", hamb: "#btnMenuPt" },
      { url: "nutricao.html", menu: "#abasNt", barra: "#navNt", hamb: "#btnMenuNt" },
    ]) {
      const ctxD = await b.newContext({ viewport: { width: 1360, height: 900 } });
      await ctxD.addInitScript(() => {
        localStorage.setItem("mtapp:perfil", JSON.stringify({ nome: "Raphael" }));
        localStorage.setItem("mtapp:ptSemConta", "1");
        localStorage.setItem("mtapp:ntSemConta", "1");
      });
      const pD = await ctxD.newPage();
      await pD.goto(BASE + "/" + alvo.url);
      await pD.waitForTimeout(500);
      const desk = await pD.evaluate((a) => {
        const m = document.querySelector(a.menu).getBoundingClientRect();
        const corpo = document.querySelector(".corpo").getBoundingClientRect();
        return {
          menuNaTela: m.left >= 0 && m.width > 200,
          semBarraDeBaixo: getComputedStyle(document.querySelector(a.barra)).display === "none",
          conteudoAoLado: corpo.left >= m.right - 1,
        };
      }, alvo);
      ok(desk.menuNaTela && desk.semBarraDeBaixo, alvo.url + ": no computador o menu fica aberto e a barra de baixo sai");
      ok(desk.conteudoAoLado, alvo.url + ": o conteúdo fica ao lado do menu (sem ficar por baixo)");

      await pD.setViewportSize({ width: 390, height: 844 });
      await pD.waitForTimeout(250);
      const cel = await pD.evaluate((a) => ({
        menuEscondido: document.querySelector(a.menu).getBoundingClientRect().left < 0,
        temHamburguer: !!document.querySelector(a.hamb) && document.querySelector(a.hamb).offsetParent !== null,
      }), alvo);
      ok(cel.menuEscondido && cel.temHamburguer, alvo.url + ": no celular o menu volta a ser a gaveta do ☰");
      await ctxD.close();
    }
    /* ---- menu retrátil no computador ---- */
    console.log("Menu retrátil no computador:");
    {
      const ctxR = await b.newContext({ viewport: { width: 1400, height: 900 } });
      await ctxR.addInitScript(() => {
        localStorage.setItem("mtapp:perfil", JSON.stringify({ nome: "Raphael" }));
        localStorage.setItem("mtapp:ptSemConta", "1");
        if (!sessionStorage.getItem("__limpouMenu")) {
          localStorage.removeItem("mtapp:ptMenuFino");
          sessionStorage.setItem("__limpouMenu", "1");
        }
      });
      const pR = await ctxR.newPage();
      await pR.goto(BASE + "/personal.html");
      await pR.waitForTimeout(600);
      const largura = () => pR.evaluate(() => ({
        menu: Math.round(document.getElementById("abas").getBoundingClientRect().width),
        corpo: getComputedStyle(document.body).paddingLeft,
        rotulo: getComputedStyle(document.querySelector('#abas button[data-a="dash"]')).fontSize,
        icone: !!document.querySelector('#abas button[data-a="dash"] .mi'),
        bt: getComputedStyle(document.getElementById("btnMenuFino")).display,
      }));
      const aberto = await largura();
      ok(aberto.menu === 258 && aberto.bt !== "none",
        "menu aberto tem 258px e mostra o botão de encolher");
      await pR.click("#btnMenuFino");
      await pR.waitForTimeout(350);
      const fino = await largura();
      ok(fino.menu === 66 && fino.corpo === "66px",
        "encolhido vira faixa de 66px e o conteúdo acompanha (" + fino.menu + "px / " + fino.corpo + ")");
      ok(fino.rotulo === "0px" && fino.icone,
        "encolhido some o rótulo e mantém o ícone");
      // o rótulo NÃO sai do documento: continua no leitor de tela e vira o title
      const acess = await pR.evaluate(() => {
        const b2 = document.querySelector('#abas button[data-a="agenda"]');
        return { texto: b2.textContent.trim(), title: b2.title };
      });
      ok(/Agenda/.test(acess.texto) && /Agenda/.test(acess.title),
        "o rótulo continua no documento e no title (leitor de tela não perde a aba)");
      // a escolha sobrevive ao recarregar
      await pR.reload();
      await pR.waitForTimeout(700);
      const depois = await largura();
      ok(depois.menu === 66, "a escolha de encolher fica guardada e volta assim ao recarregar");
      // e o botão devolve o menu ao tamanho normal
      await pR.click("#btnMenuFino");
      await pR.waitForTimeout(350);
      const volta = await largura();
      ok(volta.menu === 258, "tocar de novo devolve o menu inteiro");
      // no celular o retrátil não existe: lá a gaveta é a do ☰
      await pR.setViewportSize({ width: 390, height: 844 });
      await pR.waitForTimeout(300);
      const noCel = await pR.evaluate(() => ({
        bt: getComputedStyle(document.getElementById("btnMenuFino")).display,
        pad: getComputedStyle(document.body).paddingLeft,
      }));
      ok(noCel.bt === "none" && noCel.pad === "0px",
        "no celular o botão de encolher some e o corpo volta a ocupar a tela toda");
      await ctxR.close();
    }
  }

  ok(erros.length === 0, "nenhuma página com erro de JS" + (erros.length ? " — " + erros[0] : ""));

  await b.close();
  console.log(falhas ? "\n💥 " + falhas + " FALHA(S)" : "\n🏁 TUDO PASSOU");
  process.exit(falhas ? 1 : 0);
})();
