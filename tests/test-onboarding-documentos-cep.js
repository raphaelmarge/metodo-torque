/* Documentos e CEP no onboarding do app real gerado pelo builder.
 * Toda chamada externa e toda resposta do ViaCEP são interceptadas. */
process.env.TZ = "America/Sao_Paulo";
const assert = require("node:assert/strict");
let chromium;
try { chromium = require("playwright").chromium; }
catch (_) { chromium = require("/opt/node22/lib/node_modules/playwright").chromium; }

const BASE = process.env.BASE_URL || "http://127.0.0.1:8816";
const FAKE = "https://onboarding-documentos.invalid";
global.self = global;
require("../assets/onboarding-consultoria.js");
const Core = global.MT_ONBOARDING_CONSULTORIA;

let browser;
let checks = 0;
function ok(value, label) {
  assert.ok(value, label);
  checks++;
  console.log("OK " + label);
}
function eq(value, expected, label) {
  assert.deepEqual(value, expected, label);
  checks++;
  console.log("OK " + label);
}
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function fixture() {
  const state = {
    config: {
      nome: "Studio Documento",
      onboardingConsultoria: {
        ativo: true,
        titulo: "Antes de começar",
        introducao: "Confira seus documentos e endereço.",
        questionarioId: "",
        contratoAtivo: true,
        modoAssinatura: "aceite",
        contratoTitulo: "Contrato de consultoria",
        contratoTexto: Core.CONTRATO_PADRAO,
        prestador: {
          nome: "Studio Documento",
          documento: "12.345.678/0001-95",
          endereco: "Rua do Prestador, 10, Belo Horizonte/MG",
          email: "contato@studio.invalid",
          telefone: "31999990000",
          cidade: "Belo Horizonte",
          uf: "MG",
        },
      },
    },
    questPerguntas: [],
    questionarios: [],
  };
  const aluno = {
    id: "aluno-documentos",
    nome: "Alex Silva",
    cpf: "529.982.247-25",
    nasc: "1990-05-20",
    email: "alex@teste.invalid",
    zap: "31999990000",
    cep: "30110-000",
    appTokenP: "token-onboarding-documentos",
    onboardingConsultoria: { requerido: true, revisao: "documentos-cep" },
  };
  const comercio = {
    plano: {
      id: "plano-documentos",
      nome: "Consultoria mensal",
      valor: 400,
      ciclo: 3,
      cobranca: "mes",
      treinosSem: 3,
      modalidade: "consultoria",
    },
    contrato: {
      id: "contrato-documentos",
      planoId: "plano-documentos",
      inicio: "2026-09-09",
      diaVenc: 12,
    },
  };
  const pacote = Core.pacote(state, aluno, comercio);
  assert.equal(Core.validaPacote(pacote), "");
  assert.deepEqual(pacote.perguntas, []);
  return { aluno, pacote };
}

async function fill(page, values) {
  for (const [id, value] of Object.entries(values)) {
    await page.locator("#" + id).fill(value);
  }
}

async function run() {
  const f = fixture();
  global.MT_CLOUD = { url: FAKE, anonKey: "public-test-key" };
  require("../app/aluno-skin.js");
  require("../app/aluno-builder.js");
  const html = global.MT_APP_ALUNO.monta({
    a: f.aluno,
    studio: "Studio Documento",
    cfg: {},
    fichasApp: [],
    guiaFichasP: [],
    fexs: [],
    sessApp: [],
    wodsApp: [],
    cardiosApp: [],
    onboardingApp: f.pacote,
    atualizador: "",
  });

  const oldStarted = deferred();
  const oldRelease = deferred();
  const manualStarted = deferred();
  const manualRelease = deferred();
  const viaCalls = [];
  const pageErrors = [];

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await context.addInitScript(() => {
    localStorage.setItem("pttour", JSON.stringify({ feito: true }));
    localStorage.setItem("ptonb", JSON.stringify({ feito: true }));
  });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === new URL(BASE).origin) {
      if (url.pathname === "/onboarding-documentos-cep-test.html") {
        return route.fulfill({ contentType: "text/html", body: html });
      }
      return route.continue();
    }
    if (url.origin === "https://viacep.com.br") {
      const match = /^\/ws\/(\d{8})\/json\/$/.exec(url.pathname);
      const code = match && match[1];
      viaCalls.push(code || url.pathname);
      if (code === "30110000") {
        return route.fulfill({ contentType: "application/json", body: JSON.stringify({
          cep: "30110-000", logradouro: "Rua da Bahia", bairro: "Centro",
          localidade: "Belo Horizonte", uf: "MG",
        }) });
      }
      if (code === "00000000") {
        return route.fulfill({ contentType: "application/json", body: JSON.stringify({ erro: true }) });
      }
      if (code === "11111111") {
        oldStarted.resolve();
        await oldRelease.promise;
        try {
          return await route.fulfill({ contentType: "application/json", body: JSON.stringify({
            cep: "11111-111", logradouro: "Rua Resposta Antiga", bairro: "Bairro Antigo",
            localidade: "Cidade Antiga", uf: "SP",
          }) });
        } catch (_) { return; }
      }
      if (code === "22222222") {
        return route.fulfill({ contentType: "application/json", body: JSON.stringify({
          cep: "22222-222", logradouro: "Rua Resposta Nova", bairro: "Bairro Novo",
          localidade: "Cidade Nova", uf: "RJ",
        }) });
      }
      if (code === "33333333") {
        manualStarted.resolve();
        await manualRelease.promise;
        return route.fulfill({ contentType: "application/json", body: JSON.stringify({
          cep: "33333-333", logradouro: "Rua Automática", bairro: "Bairro Automático",
          localidade: "Cidade Automática", uf: "PR",
        }) });
      }
      if (code === "44444444") return route.abort("failed");
      return route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
    }
    if (url.origin === FAKE) {
      const fn = url.pathname.split("/").pop();
      if (fn === "app_consultoria_estado") {
        return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, concluido: false }) });
      }
      return route.fulfill({ contentType: "application/json", body: "null" });
    }
    return route.abort();
  });

  await page.goto(BASE + "/onboarding-documentos-cep-test.html");
  await page.locator("#ocOverlay").waitFor();
  await page.locator("#ocProx").click();
  await page.getByText("Confira seus dados", { exact: true }).waitFor();
  ok(await page.locator("#ocCpf").isVisible(), "builder real abre os dados após a introdução sem perguntas");
  await page.getByText("Endereço localizado. Complete o número e confira os dados.", { exact: true }).waitFor();
  eq(await page.locator("#ocCep").inputValue(), "30110-000", "CEP publicado no pacote já aparece no formulário");
  eq(await page.locator("#ocRua").inputValue(), "Rua da Bahia", "CEP preexistente consulta e preenche o logradouro ao abrir os dados");
  eq(await page.locator("#ocCidade").inputValue(), "Belo Horizonte", "CEP preexistente preenche cidade sem exigir foco no campo");
  eq(await page.locator("#ocUf").inputValue(), "MG", "CEP preexistente preenche UF sem exigir foco no campo");

  const cpf = page.locator("#ocCpf");
  await cpf.fill("5299822472A");
  await cpf.blur();
  eq(await cpf.getAttribute("aria-invalid"), "true", "CPF com letra fica inválido no blur");
  ok((await page.locator("#ocCpfErro").textContent()).includes("CPF inválido"), "CPF inválido recebe mensagem ligada por aria-describedby");
  await cpf.fill("111.111.111-11");
  await cpf.blur();
  eq(await cpf.getAttribute("aria-invalid"), "true", "CPF com sequência repetida continua inválido");
  await cpf.fill("529.982.247-25");
  await cpf.blur();
  eq(await cpf.getAttribute("aria-invalid"), null, "CPF válido limpa o estado de erro");

  const rg = page.locator("#ocRg");
  await rg.fill("AB");
  await rg.blur();
  eq(await rg.getAttribute("aria-invalid"), "true", "RG curto e sem números é recusado");
  await rg.fill("MG-12.345.67X");
  await rg.blur();
  eq(await rg.getAttribute("aria-invalid"), null, "RG antigo pode conter letras e dígito alfanumérico");

  const tipo = page.locator("#ocDocTipo");
  await tipo.selectOption("cin");
  eq(await rg.inputValue(), "52998224725", "CIN copia automaticamente os números do CPF");
  ok(await rg.isEditable() === false, "CIN fica somente leitura para não divergir do CPF");
  await cpf.fill("111.444.777-35");
  eq(await rg.inputValue(), "11144477735", "alterar o CPF atualiza a CIN imediatamente");
  await tipo.selectOption("rg");
  eq(await rg.inputValue(), "MG-12.345.67X", "voltar para RG restaura o documento anterior");
  await cpf.fill("529.982.247-25");

  await fill(page, {
    ocNome: "Alex Silva",
    ocNacionalidade: "Brasileiro",
    ocEstadoCivil: "solteiro",
    ocProfissao: "designer",
    ocRgOrgao: "SSP/MG",
    ocNasc: "1990-05-20",
    ocEmail: "alex@teste.invalid",
    ocTelefone: "(31) 99999-0000",
    ocNumero: "45",
    ocComplemento: "apto 9",
  });

  const cep = page.locator("#ocCep");
  await cep.fill("30110-000");
  await page.getByText("Endereço localizado. Complete o número e confira os dados.", { exact: true }).waitFor();
  eq(await page.locator("#ocRua").inputValue(), "Rua da Bahia", "ViaCEP preenche o logradouro");
  eq(await page.locator("#ocBairro").inputValue(), "Centro", "ViaCEP preenche o bairro");
  eq(await page.locator("#ocCidade").inputValue(), "Belo Horizonte", "ViaCEP preenche a cidade");
  eq(await page.locator("#ocUf").inputValue(), "MG", "ViaCEP preenche a UF");
  eq(await page.locator("#ocNumero").inputValue(), "45", "ViaCEP preserva o número digitado");
  eq(await page.locator("#ocComplemento").inputValue(), "apto 9", "ViaCEP preserva o complemento digitado");

  await cep.fill("00000000");
  await page.locator("#ocCepErro").waitFor();
  eq(await cep.getAttribute("aria-invalid"), "true", "CEP inexistente recebe erro no campo");
  await page.locator("#ocProx").click();
  ok((await page.locator("#ocErro").textContent()).includes("CEP não encontrado"), "CEP inexistente impede avançar ao contrato");
  ok(await page.locator("#ocCpf").isVisible(), "formulário de dados permanece aberto após CEP inexistente");

  await cep.fill("11111111");
  await oldStarted.promise;
  await cep.fill("22222222");
  await page.getByText("Endereço localizado. Complete o número e confira os dados.", { exact: true }).waitFor();
  eq(await page.locator("#ocRua").inputValue(), "Rua Resposta Nova", "novo CEP aplica a resposta mais recente");
  oldRelease.resolve();
  await page.waitForTimeout(150);
  eq(await page.locator("#ocRua").inputValue(), "Rua Resposta Nova", "resposta atrasada do CEP anterior não sobrescreve o endereço");
  eq(await page.locator("#ocCidade").inputValue(), "Cidade Nova", "resposta atrasada não sobrescreve cidade e UF novas");

  await cep.fill("33333333");
  await manualStarted.promise;
  await page.locator("#ocRua").fill("Rua digitada durante a busca");
  manualRelease.resolve();
  await page.getByText("Endereço localizado. Complete o número e confira os dados.", { exact: true }).waitFor();
  eq(await page.locator("#ocRua").inputValue(), "Rua digitada durante a busca", "edição manual durante a busca é preservada");
  eq(await page.locator("#ocBairro").inputValue(), "Bairro Automático", "campos não editados ainda recebem o ViaCEP");

  await cep.fill("44444444");
  await page.getByText("Consulta indisponível agora. Você pode preencher o endereço manualmente.", { exact: true }).waitFor();
  await fill(page, {
    ocRua: "Rua Manual",
    ocBairro: "Bairro Manual",
    ocCidade: "Cidade Manual",
    ocUf: "SC",
  });
  await page.locator("#ocProx").click();
  await page.getByText("Leia o contrato", { exact: true }).waitFor();
  const documentText = await page.locator("#ocDocumento").innerText();
  ok(documentText.includes("Rua Manual, 45, apto 9, Bairro Manual, Cidade Manual/SC, CEP 44444444"), "falha de rede permite endereço manual completo no contrato");

  eq([...new Set(viaCalls.filter(Boolean))], ["30110000", "00000000", "11111111", "22222222", "33333333", "44444444"], "cada cenário usa somente a rota ViaCEP simulada esperada");
  eq(pageErrors, [], "fluxo não gera erro JavaScript");
  await context.close();
}

(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
  await run();
  console.log(checks + " verificações de documentos e CEP passaram.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
});
