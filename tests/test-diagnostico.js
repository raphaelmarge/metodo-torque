// Página de diagnóstico da nuvem: ela existe pra dizer POR QUE a IA não
// respondeu, então precisa acertar o recado em cada cenário. Aqui a nuvem é
// simulada — interceptamos as chamadas e devolvemos cada resposta possível.
const path = require("path");
const fs = require("fs");
let chromium;
try { chromium = require("playwright").chromium; } catch (e) { chromium = require("/opt/node22/lib/node_modules/playwright").chromium; }

const RAIZ = path.join(__dirname, "..");
const EXEC = fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined;
const BASE = process.env.MT_BASE || "http://127.0.0.1:8765";

let falhas = 0;
function ok(cond, msg) {
  console.log((cond ? "  ✅ " : "  ❌ ") + msg);
  if (!cond) falhas++;
}

/* cada cenário: o que a chat-envia responde ao ping, e o que a tela TEM que dizer */
const CENARIOS = [
  {
    // aconteceu de verdade: o Supabase trocou o projeto para as chaves novas e
    // desativou a legada. TUDO de nuvem parou, e a tela mandava procurar
    // defeito na função — que estava publicada e correta.
    nome: "chave pública do site revogada (401 no próprio banco)",
    rest: { status: 401, body: { message: "Invalid API key", code: "INVALID_CREDENTIALS" } },
    resposta: { status: 401, body: { message: "Invalid credentials", code: "INVALID_CREDENTIALS" } },
    espera: [/chave pública do site não vale mais/, /Legacy API keys|Publishable/, /pelo mesmo motivo/],
    naoEspera: [/Verify JWT/, /projeto não está pausado/],
  },
  {
    nome: "tudo certo",
    resposta: { status: 200, body: { ok: true, ia: true, whatsapp: false, instagram: false,
      acoes: ["ping", "testar", "ajuda", "analisar", "ia_treino", "ia_dieta", "sugerir", "enviar"] } },
    espera: [/Função chat-envia publicada/, /Chave da IA configurada/],
    naoEspera: [/não existe neste projeto/, /desatualizada/],
  },
  {
    // aconteceu de verdade: o ping respondia ia:true, mas a função publicada
    // era ANTERIOR às ações ia_treino/ia_dieta — e a IA "não funcionava"
    nome: "função no ar, mas de versão antiga (ping sem a lista de ações)",
    resposta: { status: 200, body: { ok: true, ia: true, whatsapp: false, instagram: false } },
    espera: [/desatualizada/, /copie a chat-envia e publique de novo/i],
    naoEspera: [/não existe neste projeto/],
  },
  {
    nome: "função no ar, sem a chave da IA",
    resposta: { status: 200, body: { ok: true, ia: false, whatsapp: false, instagram: false,
      acoes: ["ping", "testar", "ajuda", "analisar", "ia_treino", "ia_dieta", "sugerir", "enviar"] } },
    espera: [/Falta a chave da IA/, /ANTHROPIC_API_KEY/, /publique a chat-envia DE NOVO/i],
    naoEspera: [/Chave da IA configurada/, /desatualizada/],
  },
  {
    nome: "função não existe (nome errado ou outro projeto)",
    resposta: { status: 404, body: { code: 404, message: "Requested function was not found" } },
    espera: [/não existe neste projeto/, /exatamente chat-envia/],
    naoEspera: [/Falta a chave da IA/],
  },
  {
    /* O 401 aqui vem do PORTÃO do Supabase: a função nem roda. Sem login e sem
     * outra função respondendo, não dá pra concluir nada sobre ela — e foi
     * mandando "republique" nesta linha que o Raphael publicou 3 vezes à toa. */
    nome: "portão recusa a chamada e não há login (não dá pra culpar a função)",
    resposta: { status: 401, body: { message: "Invalid credentials", code: "INVALID_CREDENTIALS" } },
    espera: [/Não deu pra testar a chat-envia sem login/, /não republique/i, /Entre na sua conta/],
    naoEspera: [/chat-envia publicada/, /Verify JWT/, /publique de novo/],
  },
  {
    /* Aconteceu de verdade: a MESMA credencial passou na envia-email (200) e
     * foi barrada na chat-envia (401). Isso prova que a conta e a chave estão
     * boas e que o problema é o Verify JWT daquela função. */
    nome: "só a chat-envia recusa; outra função aceita a mesma credencial",
    resposta: { status: 401, body: { message: "Invalid credentials", code: "INVALID_CREDENTIALS" } },
    email: { status: 200, body: { ok: true, chaveConfigurada: true } },
    espera: [/recusando no portão, com a credencial CERTA/, /Verify JWT.{0,4} DESLIGADO/, /envia-email/],
    naoEspera: [/Não deu pra testar a chat-envia sem login/, /Legacy API keys/],
  },
];

/* ---------- tradutor de erro + crachá do login (helpers de assets/) ---------- */
async function testaAjudantes() {
  console.log("Tradutor de erro de Edge Function:");
  const raiz = {};
  const src = fs.readFileSync(path.join(RAIZ, "assets/erro-funcao.js"), "utf8");
  new Function("self", src)(raiz);
  const T = raiz.MT_ERRO_FUNCAO;

  const gateway = T("chat-envia", 401, '{"message":"Invalid credentials","code":"INVALID_CREDENTIALS"}',
    { message: "Invalid credentials", code: "INVALID_CREDENTIALS" });
  ok(/credencial/i.test(gateway) && /sess/i.test(gateway), "401 do portão fala de credencial e sessão");
  ok(!/ANTHROPIC_API_KEY/.test(gateway) && !/publique|republique/i.test(gateway.replace(/NÃO resolve/, "")),
    "401 do portão NÃO manda publicar a função nem procurar a chave da IA");
  ok(/nem chegou a rodar/.test(gateway), "e explica que a função nem chegou a rodar");

  const semFuncao = T("chat-envia", 404, "", { code: 404, message: "Requested function was not found" });
  ok(/não está publicada/.test(semFuncao) && /funcoes\.html/.test(semFuncao), "404 manda publicar a função");

  const daFuncao = T("chat-envia", 502, "", { erro: "Secret ANTHROPIC_API_KEY não configurado." });
  ok(daFuncao === "Secret ANTHROPIC_API_KEY não configurado.", "quando a própria função explica, o recado dela é mantido");

  const boot = T("chat-envia", 546, "", { code: "BOOT_ERROR" });
  ok(/BOOT_ERROR/.test(boot) && /Logs/.test(boot), "erro de boot manda olhar os Logs");

  const semSessao = T.semSessao("A IA de treino");
  ok(/sess/i.test(semSessao) && /entre de novo/i.test(semSessao) && /IA de treino/.test(semSessao),
    "recado de sessão caída diz o que fazer e o que parou de funcionar");

  /* ---------- crachá que vence (assets/funcao-nuvem.js) ----------
   * "Funciona por um tempo e depois dá erro" é o token do login vencendo: ele
   * vale ~1 hora e o painel fica aberto o dia todo. O chamador tem que renovar
   * antes de chamar e tentar de novo quando o Supabase recusar. */
  console.log("Crachá do login que vence:");
  raiz.MT_CLOUD = { url: "https://projeto.supabase.co", anonKey: "anon-key" };
  new Function("self", fs.readFileSync(path.join(RAIZ, "assets/funcao-nuvem.js"), "utf8"))(raiz);
  const F = raiz.MT_FUNCAO;
  const jwt = (segundos) => "a." + Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + segundos })).toString("base64url") + ".b";

  const clienteFake = (tok, novoTok) => {
    const c = { renovou: 0 };
    c.auth = {
      getSession: () => Promise.resolve({ data: { session: tok ? { access_token: tok } : null } }),
      refreshSession: () => { c.renovou++; return Promise.resolve({ data: { session: novoTok ? { access_token: novoTok } : null } }); },
    };
    return c;
  };

  const fetchOrig = global.fetch;
  const respostas = [];
  const pedidos = [];
  global.fetch = (url, opts) => {
    pedidos.push({ url: String(url), auth: opts.headers.Authorization });
    const r = respostas.shift() || { status: 200, body: '{"ok":true}' };
    return Promise.resolve({ status: r.status, text: () => Promise.resolve(r.body) });
  };

  const cVale = clienteFake(jwt(3600), "novo");
  ok((await F.token(cVale)) === (await cVale.auth.getSession()).data.session.access_token && cVale.renovou === 0,
    "crachá longe de vencer é usado como está, sem renovar à toa");

  const cVence = clienteFake(jwt(30), "cracha-novo");
  ok((await F.token(cVence)) === "cracha-novo" && cVence.renovou === 1,
    "crachá perto de vencer (menos de 2 min) é renovado antes de chamar");

  const cSem = clienteFake("", "");
  ok((await F.token(cSem)) === "", "sem sessão e sem renovação possível, devolve vazio");

  pedidos.length = 0;
  respostas.push({ status: 401, body: '{"message":"Invalid credentials","code":"INVALID_CREDENTIALS"}' });
  respostas.push({ status: 200, body: '{"ok":true,"texto":"pronto"}' });
  const c401 = clienteFake(jwt(3600), "cracha-renovado");
  const recuperou = await F.chama(c401, "chat-envia", { acao: "ping" }, "A IA de treino");
  ok(recuperou.ok && recuperou.texto === "pronto" && c401.renovou === 1 && pedidos.length === 2,
    "401 no meio do caminho: renova o crachá e refaz a chamada sozinho (o humano não vê erro)");
  ok(pedidos[1].auth === "Bearer cracha-renovado", "a segunda tentativa vai com o crachá novo");

  respostas.length = 0;
  respostas.push({ status: 401, body: '{"message":"Invalid credentials"}' });
  respostas.push({ status: 401, body: '{"message":"Invalid credentials"}' });
  const cMorto = clienteFake(jwt(3600), "outro");
  const desistiu = await F.chama(cMorto, "chat-envia", { acao: "ping" }, "A IA de treino");
  ok(/sess/i.test(desistiu.erro) && !/ANTHROPIC_API_KEY/.test(desistiu.erro),
    "quando nem renovando resolve, o recado é sessão caída — não 'publique a função'");

  respostas.length = 0;
  respostas.push({ status: 404, body: '{"code":404,"message":"Requested function was not found"}' });
  const semFn = await F.chama(clienteFake(jwt(3600), "x"), "chat-envia", { acao: "ping" }, "A IA de treino");
  ok(/não está publicada/.test(semFn.erro), "404 continua sendo função ausente, e não sessão");

  global.fetch = fetchOrig;
}

(async () => {
  await testaAjudantes();
  const b = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  console.log("Diagnóstico da nuvem:");

  for (const c of CENARIOS) {
    const ctx = await b.newContext();
    const erros = [];
    // nuvem simulada: nada sai para a internet de verdade
    await ctx.route("**/functions/v1/chat-envia", (r) =>
      r.fulfill({ status: c.resposta.status, contentType: "application/json", body: JSON.stringify(c.resposta.body) }));
    await ctx.route("**/rest/v1/rpc/app_aluno_busca", (r) => r.fulfill({
      status: (c.rest && c.rest.status) || 200,
      contentType: "application/json",
      body: JSON.stringify((c.rest && c.rest.body) === undefined ? null : (c.rest && c.rest.body) || null),
    }));
    // funções que o diagnóstico também pinga: fora do foco de cada cenário
    await ctx.route("**/functions/v1/envia-email", (r) => r.fulfill(c.email
      ? { status: c.email.status, contentType: "application/json", body: JSON.stringify(c.email.body) }
      : { status: 404, body: "nao publicada" }));
    await ctx.route("**/functions/v1/push-envia", (r) => r.fulfill({ status: 404, body: "nao publicada" }));
    const p = await ctx.newPage();
    p.on("pageerror", (e) => erros.push(e.message));
    await p.goto(BASE + "/diagnostico.html");
    await p.click("#btnRodar");
    await p.waitForFunction(() => window.__diagPronto, null, { timeout: 15000 });
    const txt = await p.evaluate(() => document.getElementById("resultado").innerText);

    console.log("— " + c.nome);
    for (const re of c.espera) ok(re.test(txt), "diz o que interessa: " + re.source.slice(0, 42));
    for (const re of c.naoEspera) ok(!re.test(txt), "e não confunde com: " + re.source.slice(0, 42));
    ok(erros.length === 0, "sem erro de JS na página" + (erros.length ? " — " + erros[0] : ""));
    await ctx.close();
  }

  {
    /* O teste do banco tem que mandar apikey E Authorization. Sem o segundo, o
     * Supabase responde 401 com a chave CERTA — foi assim que este diagnóstico
     * acusou injustamente a chave do projeto e mandou trocar o que funcionava. */
    const ctx = await b.newContext();
    let cabecalhos = null;
    await ctx.route("**/rest/v1/rpc/app_aluno_busca", (r) => {
      cabecalhos = r.request().headers();
      r.fulfill({ status: 200, contentType: "application/json", body: "null" });
    });
    await ctx.route("**/functions/v1/envia-email", (r) => r.fulfill({ status: 404, body: "x" }));
    await ctx.route("**/functions/v1/push-envia", (r) => r.fulfill({ status: 404, body: "x" }));
    await ctx.route("**/functions/v1/chat-envia", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true,"ia":true}' }));
    const p = await ctx.newPage();
    await p.goto(BASE + "/diagnostico.html");
    await p.click("#btnRodar");
    await p.waitForFunction(() => window.__diagPronto, null, { timeout: 15000 });
    ok(!!cabecalhos && !!cabecalhos.apikey && /^Bearer /.test(cabecalhos.authorization || ""),
      "o teste do banco manda apikey E Authorization (sem os dois, chave boa vira 401)");
    await ctx.close();
  }

  {
    // testador de chave: descobrir qual chave o projeto aceita sem publicar o
    // site a cada palpite. E ele NUNCA pode encorajar o uso de chave secreta.
    const ctx = await b.newContext();
    await ctx.route("**/rest/v1/rpc/app_aluno_busca", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "null" }));
    await ctx.route("**/functions/v1/chat-envia", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true,"ia":true}' }));
    await ctx.route("**/functions/v1/envia-email", (r) => r.fulfill({ status: 404, body: "x" }));
    await ctx.route("**/functions/v1/push-envia", (r) => r.fulfill({ status: 404, body: "x" }));
    const p = await ctx.newPage();
    const errs = [];
    p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(BASE + "/diagnostico.html");

    await p.fill("#chaveTeste", "sb_secret_XVT5Dabcdefg");
    await p.click("#btnChave");
    await p.waitForTimeout(300);
    const secreta = await p.evaluate(() => ({
      recado: document.getElementById("resChave").innerText,
      campo: document.getElementById("chaveTeste").value,
    }));
    ok(/SECRETA/.test(secreta.recado) && secreta.campo === "",
      "chave secreta é recusada na hora e apagada do campo, sem sair do navegador");

    await p.fill("#chaveTeste", "sb_publishable_teste123");
    await p.click("#btnChave");
    await p.waitForFunction(() => /funciona|não foi aceita/.test(document.getElementById("resChave").innerText), null, { timeout: 10000 });
    const boa = await p.evaluate(() => document.getElementById("resChave").innerText);
    ok(/Esta chave funciona/.test(boa) && /banco: HTTP 200/.test(boa) && /com a chave da IA/.test(boa),
      "chave aceita: diz que funciona e mostra o resultado dos dois testes");
    ok(errs.length === 0, "sem erro de JS no testador de chave" + (errs.length ? " — " + errs[0] : ""));
    await ctx.close();
  }

  {
    // o detalhe técnico é o que o Raphael copia e manda; tem que ter o status
    const ctx = await b.newContext();
    await ctx.route("**/functions/v1/chat-envia", (r) =>
      r.fulfill({ status: 500, contentType: "application/json", body: '{"code":"BOOT_ERROR"}' }));
    await ctx.route("**/rest/v1/", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    const p = await ctx.newPage();
    await p.goto(BASE + "/diagnostico.html");
    await p.click("#btnRodar");
    await p.waitForFunction(() => window.__diagPronto, null, { timeout: 15000 });
    const tec = await p.evaluate(() => document.getElementById("tecnica").textContent);
    const visivel = await p.evaluate(() => !document.getElementById("cxTecnica").hidden);
    ok(visivel && /chat-envia ping \[chave pública\]: HTTP 500/.test(tec) && /BOOT_ERROR/.test(tec),
      "erro de deploy aparece no detalhe técnico, com status e corpo da resposta");
    const tela = await p.evaluate(() => document.getElementById("resultado").innerText);
    ok(/respondeu algo inesperado/.test(tela) && /Logs/.test(tela),
      "e a tela manda olhar os Logs da função em vez de dar mensagem seca");
    await ctx.close();
  }

  await b.close();
  console.log(falhas ? "\n💥 " + falhas + " FALHA(S)" : "\n🏁 TUDO PASSOU");
  process.exit(falhas ? 1 : 0);
})();
