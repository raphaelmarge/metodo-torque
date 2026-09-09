/* Plano comercial da entrada da consultoria. Dados e checkout fictícios;
 * rede externa bloqueada. Não cria cobrança nem usa credenciais reais. */
process.env.TZ = "America/Sao_Paulo";
const assert = require("node:assert/strict");
global.self = global;
require("../assets/onboarding-consultoria.js");
const Core = global.MT_ONBOARDING_CONSULTORIA;
let chromium;
try { chromium = require("playwright").chromium; }
catch (_) { chromium = require("/opt/node22/lib/node_modules/playwright").chromium; }
const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
let checks = 0, browser;
function ok(value, label) { assert.ok(value, label); checks++; console.log("OK " + label); }
function eq(actual, expected, label) { assert.deepEqual(actual, expected, label); checks++; console.log("OK " + label); }
const clone = value => JSON.parse(JSON.stringify(value));

function testCore() {
  const st = { config: { nome: "Studio Teste", onboardingConsultoria: { ativo: true, contratoAtivo: true, contratoTexto: Core.CONTRATO_PADRAO } } };
  const aluno = { id: "aluno-teste", nome: "Alex Silva", plano: "Cadastro antigo", valor: 15, onboardingConsultoria: { requerido: true, revisao: "1", pagamentoRecorrente: true } };
  const comercio = {
    contrato: { id: "ct-teste", planoId: "pl-teste", inicio: "2026-09-12", diaVenc: 12 },
    plano: { id: "pl-teste", nome: "Consultoria 3 meses", valor: 400, ciclo: 3, cobranca: "mes", treinosSem: 3, modalidade: "online", linkRec: "https://checkout.example/plano-mensal" }
  };
  const p = Core.pacote(st, aluno, comercio);
  eq(Core.validaPacote(p), "", "contrato com plano real e recorrência válida é publicável");
  eq(p.contrato.plano.nome, comercio.plano.nome, "nome vem do plano vendido, sem fallback cadastral antigo");
  eq(p.contrato.plano.valor, 400, "valor vem do plano vendido, sem fallback cadastral antigo");
  const doc = Core.resolveContrato("Contrato customizado para {{aluno_nome}}.", { nome: "Alex Silva" }, p);
  ok(doc.includes("PLANO CONTRATADO") && doc.includes("R$ 400,00 por mês") && doc.includes("Ciclo contratual: 3 meses"), "texto customizado também inclui preço mensal e ciclo contratual");
  ok(doc.includes("Início: 12/09/2026") && doc.includes("Vencimento mensal: dia 12") && doc.includes("3 treino(s) por semana"), "condições comerciais completas integram o documento");
  eq(p.pagamento.link, comercio.plano.linkRec, "link do plano é o padrão");
  const individual = Core.pacote(st, { ...aluno, onboardingConsultoria: { ...aluno.onboardingConsultoria, linkRec: "https://checkout.example/oferta-alex" } }, comercio);
  eq(individual.pagamento.link, "https://checkout.example/oferta-alex", "link individual substitui o padrão do plano");
  ok(individual.v !== p.v, "alterar link de pagamento exige versão nova do contrato");
  const condicao = Core.pacote(st, aluno, { ...comercio, contrato: { ...comercio.contrato, diaVenc: 20 } });
  ok(condicao.v !== p.v, "alterar vencimento exige versão nova do contrato");
  ok(!!Core.validaPacote(Core.pacote(st, aluno, {})), "contrato sem plano real não pode ser publicado");
  for (const [campo, valor] of [["id", ""], ["contratoId", ""], ["valor", 0], ["valor", -1], ["inicio", "2026-02-30"], ["diaVenc", 31], ["ciclo", 0]]) {
    const ruim = clone(p); ruim.contrato.plano[campo] = valor;
    ok(!!Core.validaPacote(ruim), "plano inválido bloqueado: " + campo + "=" + valor);
  }
  for (const url of ["javascript:alert(1)", "http://checkout.example/plano", "https://usuario:senha@checkout.example/plano", "https://checkout.example/a b", "sem-link"]) {
    const ruim = clone(p); ruim.pagamento.link = url;
    ok(!Core.linkHttps(url) && !!Core.validaPacote(ruim), "link inseguro recusado: " + url);
  }
  for (const pacoteQtd of [0, 10]) {
    const x = Core.pacote(st, aluno, { ...comercio, plano: { ...comercio.plano, cobranca: "sessao", pacoteQtd } });
    eq(x.pagamento.ativo, false, (pacoteQtd ? "pacote de aulas" : "hora-aula") + " não oferece recorrência");
    eq(x.pagamento.link, "", "plano sem recorrência não entrega checkout");
    eq(Core.validaPacote(x), "", "plano por sessão continua publicável");
    const forjado = clone(x); forjado.pagamento = { ativo: true, link: "https://checkout.example/indevido" };
    ok(!!Core.validaPacote(forjado), "payload forjado de sessão com checkout é recusado");
  }
  for (const campo of ["assinaturaRec", "assinaturaAs"]) {
    const x = Core.pacote(st, { ...aluno, [campo]: { id: "assinatura-existente" } }, comercio);
    eq(x.pagamento, p.pagamento, campo + " mantém as condições comerciais assinadas");
    eq(x.v, p.v, "ativar " + campo + " não exige nova assinatura do contrato");
    eq(Core.resolveContrato("Contrato customizado para {{aluno_nome}}.", { nome: "Alex Silva" }, x), doc, "ativar cobrança preserva texto e integridade do contrato aceito");
  }
  const desligado = Core.pacote(st, { ...aluno, onboardingConsultoria: { ...aluno.onboardingConsultoria, pagamentoRecorrente: false } }, comercio);
  eq(desligado.pagamento, { ativo: false, link: "" }, "personal pode concluir contrato sem etapa de pagamento");
  eq(Core.validaPacote(null), "", "aluno dispensado preserva publicação normal");
  eq(Core.validaPacote({ contrato: { ativo: true } }), "", "pacote legado permanece compatível");
}

async function testPersonal() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "pt-BR", serviceWorkers: "block" });
  const page = await context.newPage(), errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await context.route("**/*", route => new URL(route.request().url()).origin === new URL(BASE).origin ? route.continue() : route.abort());
  await page.goto(BASE + "/demo-personal.html"); await page.locator("#btnDemo").click(); await page.waitForURL(/personal\.html/);
  await page.waitForFunction(() => !!window.MT_PERSONAL_ONBOARDING);
  const id = await page.evaluate(() => {
    const st = MTStore.read("ptStudio"), a = st.alunos.find(x => x.onboardingConsultoria && x.onboardingConsultoria.requerido) || st.alunos[0];
    delete a.assinaturaRec; delete a.assinaturaAs;
    a.onboardingConsultoria = { requerido: true, revisao: "teste" };
    st.planosPT.push({ id: "oc-pl-mensal", nome: "Consultoria comercial de teste", valor: 430, ciclo: 3, cobranca: "mes", treinosSem: 4, modalidade: "online", linkRec: "https://checkout.example/plano-base" });
    st.planosPT.push({ id: "oc-pl-pacote", nome: "Pacote comercial de teste", valor: 800, ciclo: 1, cobranca: "sessao", pacoteQtd: 10, treinosSem: 2 });
    st.contratosPT = st.contratosPT.filter(x => x.alunoId !== a.id);
    st.contratosPT.push({ id: "oc-ct-inicial", alunoId: a.id, planoId: "oc-pl-mensal", status: "ativo", inicio: "2026-09-09", diaVenc: 5 });
    MTStore.write("ptStudio", st); window.__perfilPT(a.id); window.__pfAba("app"); return a.id;
  });
  await page.locator("#pfOcPlano").waitFor();
  ok((await page.locator("#pfOcPlanoResumo").textContent()).includes("por mês") && (await page.locator("#pfOcPlanoResumo").textContent()).includes("3 meses"), "personal vê valor mensal e ciclo de três meses");
  const before = await page.evaluate(id => { const s = MTStore.read("ptStudio"); return { payments: s.pagamentos.length, revision: s.alunos.find(x => x.id === id).onboardingConsultoria.revisao }; }, id);
  await page.locator("#pfOcInicio").fill("2026-09-12"); await page.locator("#pfOcDia").selectOption("12"); await page.locator("#pfOcRecorrente").check();
  await page.locator("#pfOcLink").fill("https://checkout.example/oferta-individual");
  eq(await page.locator("#pfOcPublicar").isEnabled(), false, "condições não salvas impedem publicação pelo botão da seção");
  await page.locator("#pfOcSalvarPlano").click();
  const saved = await page.evaluate(id => { const s = MTStore.read("ptStudio"); return { payments: s.pagamentos.length, a: s.alunos.find(x => x.id === id), ct: s.contratosPT.find(x => x.alunoId === id && x.status === "ativo") }; }, id);
  eq(saved.ct.id, "oc-ct-inicial", "editar condições preserva contrato ativo sem abrir outro ciclo");
  eq(saved.ct.inicio, "2026-09-12", "início comercial é salvo no contrato canônico"); eq(saved.ct.diaVenc, 12, "vencimento é salvo no contrato canônico");
  eq(saved.payments, before.payments, "salvar contrato não cria recebimento");
  ok(saved.a.onboardingConsultoria.requerido && saved.a.onboardingConsultoria.revisao !== before.revision && saved.a.appEditEm, "salvar conserva exigência, revisa os termos e marca publicação pendente");
  eq(saved.a.onboardingConsultoria.linkRec, "https://checkout.example/oferta-individual", "link individual fica no vínculo deste aluno");
  await page.locator("#pfOcLink").fill("javascript:alert(1)"); await page.locator("#pfOcSalvarPlano").click();
  ok((await page.locator("#pfOcComercioStatus").textContent()).includes("https://"), "personal recebe erro para link inseguro");
  await page.locator("#pfOcDescartarPlano").click();
  await page.evaluate(() => { document.querySelector('[data-a="quest"]').click(); window.__qtAba("montar"); });
  await page.locator("#ocpPreviaAluno").selectOption(id); await page.locator("#ocpPrevia").click();
  const preview = await page.locator("#ocpPreview").textContent();
  ok(preview.includes(saved.a.nome) && preview.includes("Consultoria comercial de teste") && preview.includes("R$ 430,00 por mês") && preview.includes("dia 12"), "prévia global mostra aluno e plano reais com condições salvas");
  await page.evaluate(id => { window.__perfilPT(id); window.__pfAba("app"); }, id);
  await page.locator("#pfOcPlano").selectOption("oc-pl-pacote");
  eq(await page.locator("#pfOcRecorrente").isEnabled(), false, "pacote desabilita oferta recorrente no personal");
  eq(await page.locator("#pfOcLink").inputValue(), "", "trocar plano limpa link da oferta anterior");
  await page.locator("#pfOcSalvarPlano").click();
  const changed = await page.evaluate(id => { const s = MTStore.read("ptStudio"); return { payments: s.pagamentos.length, a: s.alunos.find(x => x.id === id), all: s.contratosPT.filter(x => x.alunoId === id) }; }, id);
  eq(changed.all.filter(x => x.status === "ativo").length, 1, "troca conserva apenas um contrato ativo por aluno");
  ok(changed.all.some(x => x.id === "oc-ct-inicial" && x.status === "encerrado" && x.motivo === "troca"), "contrato anterior mantém histórico de troca");
  eq(changed.a.onboardingConsultoria.pagamentoRecorrente, false, "troca para pacote desliga checkout");
  eq(changed.payments, before.payments, "troca de plano também não cria recebimento");
  const blocked = await page.evaluate(async id => {
    const s = MTStore.read("ptStudio"); s.contratosPT = s.contratosPT.filter(x => x.alunoId !== id); MTStore.write("ptStudio", s);
    let writes = 0; const oldPrepare = MTStore.preparaAppsSeguros, oldPublish = MTStore.publicaAppsSeguros;
    MTStore.preparaAppsSeguros = async () => ({}); MTStore.publicaAppsSeguros = async () => { writes++; return {}; };
    try { const r = await window.__publicaPacotes({ aid: "academia-ficticia", client: {} }, [s.alunos.find(x => x.id === id)]); return { r, writes }; }
    finally { MTStore.preparaAppsSeguros = oldPrepare; MTStore.publicaAppsSeguros = oldPublish; }
  }, id);
  ok(blocked.r.erro && /plano/i.test(blocked.r.erro), "publicação central recusa contrato sem plano real");
  eq(blocked.writes, 0, "nenhum pacote inválido é enviado à nuvem");
  for (const width of [320, 390, 430]) { await page.setViewportSize({ width, height: 844 }); ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "personal sem rolagem horizontal em " + width + "px"); }
  eq(errors, [], "fluxo comercial não gera erros JavaScript");
  await context.close();
}

(async () => {
  testCore();
  if (!process.env.CORE_ONLY) {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
    await testPersonal();
  }
  console.log(checks + " verificações comerciais do onboarding passaram.");
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
