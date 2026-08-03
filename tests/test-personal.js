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

  // aluno novo
  await p.fill("#aNome", "João Cliente");
  await p.fill("#aZap", "31999990000");
  await p.fill("#aValor", "400");
  await p.click("#aAdd");
  let lista = await p.evaluate(() => document.getElementById("listaAlunos").textContent);
  ok(/João Cliente/.test(lista) && /400/.test(lista), "aluno cadastrado com valor mensal");
  ok(/SEM PAGAMENTO NO MÊS/.test(lista), "etiqueta de pendência antes do pagamento");

  // agenda: sessão hoje + marcar feita
  await abaPt(p, "agenda");
  await p.selectOption("#sAluno", { index: 1 });
  await p.fill("#sHora", "07:00");
  await p.click("#sAdd");
  let ses = await p.evaluate(() => document.getElementById("listaSessoes").textContent);
  ok(/João Cliente/.test(ses) && /07:00/.test(ses), "sessão agendada aparece");

  // sincronizar com o calendário: exporta .ics das sessões futuras
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
  await p.click("[data-feita]");
  ses = await p.evaluate(() => document.getElementById("listaSessoes").textContent);
  ok(/FEITA/.test(ses), "sessão marcada como feita");

  // pagamento: registra e some da pendência
  await abaPt(p, "pagamentos");
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
  await abaPt(p, "treinos");
  const bib = await p.evaluate(() => document.getElementById("exLista").textContent);
  ok(/Supino reto/.test(bib) && /Agachamento livre/.test(bib), "biblioteca vem semeada com básicos");

  // catálogo TORQUE alimenta o módulo: navegador na Biblioteca + seletor da ficha
  const cat = await p.evaluate(() => ({
    n: document.getElementById("catN").textContent,
    lista: document.getElementById("catLista").textContent,
    grupos: document.getElementById("catGrupo").options.length,
  }));
  ok(+(cat.n.match(/\d+/) || [0])[0] >= 200, "catálogo TORQUE anunciado com 200+ exercícios (" + cat.n.trim() + ")");
  ok(/usar/.test(cat.lista) && cat.grupos >= 10, "navegador do catálogo com botão + usar e filtro de grupos");
  await p.fill("#catBusca", "kettlebell");
  await p.waitForTimeout(150);
  const antesUsa = await p.evaluate(() => JSON.parse(localStorage.getItem("mtapp:ptStudio")).exercicios.length);
  await p.click('#catLista [data-catusa]');
  await p.waitForTimeout(150);
  const depoisUsa = await p.evaluate(() => JSON.parse(localStorage.getItem("mtapp:ptStudio")).exercicios.length);
  ok(depoisUsa === antesUsa + 1, "+ usar puxa o exercício do catálogo pra biblioteca (com grupo e dica)");
  ok(await p.evaluate(() => /NA BIBLIOTECA/.test(document.getElementById("catLista").textContent)), "item usado ganha etiqueta NA BIBLIOTECA");
  await p.fill("#catBusca", "");
  await p.waitForTimeout(150);

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

  // o seletor da ficha oferece o catálogo TORQUE inteiro (optgroup) e materializa ao usar
  const selCat = await p.evaluate((fid) => {
    const sel = document.querySelector('[data-exsel="' + fid + '"]');
    const grupos = Array.from(sel.querySelectorAll("optgroup")).map((g) => g.label);
    const opCat = Array.from(sel.options).find((o) => o.value.indexOf("cat:") === 0);
    return { grupos: grupos.join("|"), temCat: !!opCat, valor: opCat && opCat.value };
  }, fichaId);
  ok(/Meus exercícios/.test(selCat.grupos) && /Catálogo TORQUE/.test(selCat.grupos) && selCat.temCat, "seletor da ficha tem Meus exercícios + Catálogo TORQUE");
  await p.selectOption('[data-exsel="' + fichaId + '"]', selCat.valor);
  await p.click('[data-additem="' + fichaId + '"]');
  await p.waitForTimeout(150);
  const aposCat = await p.evaluate((nome) => {
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    const ex = st.exercicios.find((e) => e.nome.toLowerCase() === nome.toLowerCase());
    return { entrou: !!ex, comDica: !!(ex && ex.descricao), naFicha: document.getElementById("fichasBox").textContent.includes(nome) };
  }, selCat.valor.slice(4));
  ok(aposCat.entrou && aposCat.comDica && aposCat.naFicha, "exercício do catálogo entra na ficha e vira item da biblioteca com dica");

  // videoteca do studio
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
  await p.check('.grCheck[value="al-bia-grupo"]');
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
  await p.evaluate(() => {
    window.__gruposPT.render();
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    document.getElementById("geOrigem").value = st.treinosGrupo[0].id;
    document.getElementById("geGrupo").value = st.gruposPT[0].id;
  });
  const geOrigemTxt = await p.evaluate(() => document.getElementById("geOrigem").innerHTML);
  ok(/Treinos de disparo/.test(geOrigemTxt) && /Hipertrofia Agosto \(3 ficha/.test(geOrigemTxt), "seletor de envio oferece os treinos de disparo pré-montados");
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

  // app do aluno gerado
  const appHtml = await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("mtapp:ptStudio"));
    return window.__montaAppAluno(st.alunos[0], new Date().toISOString());
  });
  ok(/A — Peito\/Tríceps/.test(appHtml) && /Supino reto/.test(appHtml) && /4×10/.test(appHtml), "app leva a ficha estruturada (Supino 4×10)");
  ok(/<details/.test(appHtml) && /Pegada na largura dos ombros/.test(appHtml), "cada exercício é uma sub-página com a descrição");
  ok(/▶ ver vídeo/.test(appHtml) && /youtube\.com\/watch\?v=abc123/.test(appHtml), "exercício com vídeo ganha o botão ▶ ver vídeo");
  ok(/youtube\.com\/results\?search_query=/.test(appHtml), "exercício sem vídeo próprio ganha demonstração automática do YouTube");
  ok(/gVideo/.test(appHtml) && /▶ como fazer/.test(appHtml), "modo guiado tem o link ▶ como fazer");
  ok(/dcExs/.test(appHtml), "diário de cargas sugere os exercícios da ficha");
  ok(/setbtn/.test(appHtml) && /tmrbtn/.test(appHtml), "exercícios têm botões de séries e cronômetro");
  ok(/Minhas sessões/.test(appHtml) && /07:30/.test(appHtml), "próximas sessões embutidas no app");
  ok(/Agenda<\/h2>/.test(appHtml) && /agCal/.test(appHtml) && /app_agenda_pede/.test(appHtml) && /app_agenda_lista/.test(appHtml), "app tem agenda estilo calendário com pedido de horário pela nuvem");
  ok(/data-agics/.test(appHtml) && /AGTIT/.test(appHtml) && /VCALENDAR/.test(appHtml), "horário confirmado no app tem o botão 📅 salvar no calendário");
  ok(/cardNotif/.test(appHtml) && /app_aluno_push/.test(appHtml) && /app-sw\.js/.test(appHtml), "app registra push pelo link hospedado (lembretes)");
  ok(/menuApp/.test(appHtml) && /hambApp/.test(appHtml) && /trocaSec/.test(appHtml), "app tem menu lateral (gaveta) organizando as seções");
  ok(/app_aluno_devolve/.test(appHtml) && /devolveApp/.test(appHtml), "app devolve peso/cargas/treinos/fotos pro personal (sincronização)");
  ok(/com o seu personal/.test(appHtml), "texto das fotos avisa que o personal também vê");
  ok(/btnCardStories/.test(appHtml) && /Gerar card pro Stories/.test(appHtml), "conquistas têm o botão de card pro Stories");
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
  ok(/botChips/.test(appHtml) && /🤖 assistente/.test(appHtml) && /botEscolhe/.test(appHtml), "app tem o robô de atendimento (chatbot de menu) no chat");
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
      window.MTStore.cloud = () => ({
        aid: "x",
        client: { from: () => ({ select: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: [{ retorno: {
          peso: { "2026-07-01": 86, "2026-07-20": 84.2, "2026-08-01": 83.1 },
          cargas: { "Supino reto": [{ d: "2026-07-01", kg: 60 }, { d: "2026-08-01", kg: 72.5 }] },
          feitos: { "2026-07-02": 1, "2026-07-04": 1, "2026-08-01": 1 },
          fotoAntes: px, fotoAntesD: "2026-05-01", fotoDepois: px, fotoDepoisD: "2026-08-01",
        } }] }) }) }) }) },
      });
      window.__perfilPT(a.id);
    });
    await p.waitForTimeout(400);
    const appDados = await p.evaluate(() => document.getElementById("pfAppDados").innerHTML);
    ok(/Peso na balança/.test(appDados) && /83,1/.test(appDados), "peso da balança do app aparece no perfil (83,1 kg)");
    ok(/Evolução de carga/.test(appDados) && /72,5 kg/.test(appDados) && /\+12,5/.test(appDados), "cargas do diário do aluno com delta (+12,5)");
    ok(/Treinos marcados no app/.test(appDados) && /3 no total/.test(appDados), "treinos feitos no app contados");
    ok(/ANTES/.test(appDados) && /AGORA/.test(appDados) && /<img/.test(appDados), "fotos antes × depois do aluno aparecem pro personal");
    await p.evaluate(() => { window.MTStore.cloud = window.__cloudOrig; });
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
    ok(/🥇 João/.test(placar) && /🥈 Bia/.test(placar) && /🥉 Rafa/.test(placar) && /12/.test(placar), "placar com medalhas e contagem de treinos");
    ok(/1 mês grátis/.test(placar), "prêmio aparece no placar");
    // o app gerado com desafio ativo ganha o card + placar via rpc
    const appDesafio = await p.evaluate(() => {
      const st = window.MTStore.read("ptStudio", {});
      return window.__montaAppAluno(st.alunos.find((x) => x.ativo !== false), new Date().toISOString());
    });
    ok(/🏆 Desafio: 30 dias TORQUE/.test(appDesafio) && /app_desafio_ranking/.test(appDesafio) && /dsMeus/.test(appDesafio), "app do aluno leva o card do desafio com placar via nuvem");
    ok(/nome:PRIMEIRO/.test(appDesafio.replace(/\s/g, "")) || /nome:PRIMEIRO/.test(appDesafio), "app envia o nome do aluno pro ranking (devolve)");
  }

  // ---------- questionários personalizados (estilo LiveClin) ----------
  console.log("Questionários personalizados:");
  await abaPt(p, "quest");
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
  await p.selectOption("#qeAluno", { index: 1 });
  await p.selectOption("#qeQuest", { index: 1 });
  await p.click("#qeGerar");
  const linkQ = await p.evaluate(() => document.getElementById("qeLink").value);
  ok(/quest\.html\?t=.+&q=/.test(linkQ), "link do questionário gerado com token e payload");
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
  // com o menu lateral, cada grupo de cards vive numa seção — troca antes de interagir
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

  // aluno "Encerrar" some da lista
  await abaPt(p, "alunos");
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
  ok(/personal trainer/.test(corpo) && /Treino guiado/.test(corpo) && /R\$ 49/.test(corpo) && /820 exercícios/.test(corpo), "landing com pitch, features atuais e preço");
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

  ok(erros.length === 0, "nenhuma página com erro de JS" + (erros.length ? " — " + erros[0] : ""));

  await b.close();
  console.log(falhas ? "\n💥 " + falhas + " FALHA(S)" : "\n🏁 TUDO PASSOU");
  process.exit(falhas ? 1 : 0);
})();
