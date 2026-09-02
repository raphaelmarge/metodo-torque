// Página de diagnóstico da nuvem: ela existe pra dizer POR QUE a IA não
// respondeu, então precisa acertar o recado em cada cenário. Aqui a nuvem é
// simulada — interceptamos as chamadas e devolvemos cada resposta possível.
const path = require("path");
const fs = require("fs");
let chromium;
try { chromium = require("playwright").chromium; } catch (e) { chromium = require("/opt/node22/lib/node_modules/playwright").chromium; }

const RAIZ = path.join(__dirname, "..");
const EXEC = fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined;
const BASE = process.env.BASE_URL || process.env.MT_BASE || "http://127.0.0.1:8765";

let falhas = 0;
// v756: o navegador vive FORA do IIFE pra o finally fechar mesmo quando a
// suíte para no meio (senão sobra Chromium órfão e o resumo nunca sai)
let navegadorV756 = null;
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
    /* Aconteceu de verdade: a MESMA credencial passou na envia-email (200) e foi
     * barrada na chat-envia (401). O GET sem credencial fecha o diagnóstico: se
     * nem assim a função roda, quem barra é o porteiro (Verify JWT). */
    nome: "só a chat-envia recusa e nem sem credencial ela roda (porteiro ligado)",
    resposta: { status: 401, body: { message: "Invalid credentials", code: "INVALID_CREDENTIALS" } },
    email: { status: 200, body: { ok: true, chaveConfigurada: true } },
    espera: [/Verify JWT da chat-envia ainda está LIGADO/, /Edge Functions.{0,4}→.{0,4}chat-envia/, /desmarcando/i],
    naoEspera: [/Não deu pra testar a chat-envia sem login/, /Legacy API keys/],
  },
  {
    /* Porteiro desligado (o GET chega na função e ela responde "use POST"), mas
     * a chamada COM credencial ainda leva 401: aí o culpado é outro, e a tela
     * tem que dizer isso em vez de mandar mexer no Verify JWT de novo. */
    nome: "porteiro desligado, função no ar, mas a chamada com credencial ainda leva 401",
    resposta: { status: 401, body: { message: "Invalid credentials", code: "INVALID_CREDENTIALS" } },
    get: { status: 405, body: { erro: "use POST" } },
    email: { status: 200, body: { ok: true, chaveConfigurada: true } },
    espera: [/está no ar, mas recusa a chamada com credencial/, /Verify JWT já está desligado/, /me mande este print/i],
    naoEspera: [/ainda está LIGADO/, /Não deu pra testar a chat-envia sem login/],
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
  /* v759: o 401 passou a falar SÓ do que o cliente pode fazer. O motivo técnico
   * ("o portão recusou a credencial, a função nem rodou") continua existindo,
   * mas foi pro console.error — quem precisa dele somos nós, não o professor. */
  ok(/sess/i.test(gateway) && /entre de novo/i.test(gateway),
    "401 do portão oferece a ÚNICA coisa ao alcance do cliente: entrar de novo");
  ok(!/ANTHROPIC_API_KEY/.test(gateway) && !/publique|republique/i.test(gateway) &&
     !/diagnostico\.html|funcoes\.html|Supabase/i.test(gateway),
    "401 do portão NÃO manda publicar função, procurar chave da IA nem abrir a página do dono");
  ok(/não é coisa sua/i.test(gateway),
    "e diz que não é culpa dele quando entrar de novo não resolver");

  /* v757: função ausente é problema do DONO do sistema — o cliente não publica
   * nada, não tem acesso ao servidor e não pode fazer nada com essa informação.
   * A tela dele diz a verdade curta; o detalhe fica no console.error. */
  const semFuncao = T("chat-envia", 404, "", { code: 404, message: "Requested function was not found" });
  ok(/fora do ar/.test(semFuncao) && /não é coisa sua/.test(semFuncao) &&
     !/publica|funcoes\.html|Supabase/i.test(semFuncao),
    "404 diz 'está fora do ar, não é coisa sua' — sem mandar o cliente publicar nada");

  const daFuncao = T("chat-envia", 502, "", { erro: "Secret ANTHROPIC_API_KEY não configurado." });
  ok(daFuncao === "Secret ANTHROPIC_API_KEY não configurado.", "quando a própria função explica, o recado dela é mantido");

  const boot = T("chat-envia", 546, "", { code: "BOOT_ERROR" });
  ok(/fora do ar/.test(boot) && !/BOOT_ERROR|Logs|Supabase/i.test(boot),
    "erro de boot também vira recado honesto (BOOT_ERROR e Logs vão pro console)");

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

  /* 401 mesmo com crachá NOVO em folha: o portão está barrando aquela função.
   * Dizer "sua sessão caiu" aqui manda o professor fazer um login que não
   * resolve nada — foi o que o Raphael viu na tela com a sessão perfeita. */
  respostas.length = 0;
  respostas.push({ status: 401, body: '{"message":"Invalid credentials"}' });
  respostas.push({ status: 401, body: '{"message":"Invalid credentials"}' });
  const cPortao = clienteFake(jwt(3600), "cracha-novinho");
  const barrado = await F.chama(cPortao, "chat-envia", { acao: "ping" }, "A IA de treino");
  ok(/fora do ar/.test(barrado.erro) && /não é coisa sua nem do seu login/i.test(barrado.erro),
    "401 com crachá renovado NÃO vira 'sua sessão caiu' — o login dele está bom e a tela diz isso");
  ok(!/diagnostico\.html|Supabase|ANTHROPIC_API_KEY/i.test(barrado.erro),
    "e não manda o cliente abrir a página de diagnóstico (ela é do dono do sistema)");

  // sem conseguir renovar, aí sim é sessão caída
  respostas.length = 0;
  respostas.push({ status: 401, body: '{"message":"Invalid credentials"}' });
  const cMorto = clienteFake(jwt(3600), "");
  const desistiu = await F.chama(cMorto, "chat-envia", { acao: "ping" }, "A IA de treino");
  ok(/sess/i.test(desistiu.erro) && !/ANTHROPIC_API_KEY/.test(desistiu.erro),
    "quando nem renovando resolve, o recado é sessão caída — não 'publique a função'");

  /* Plano B: função de reserva. Se o portão barra a de sempre e o dono
   * configurou um apelido, o site usa a reserva sozinho — e continua usando. */
  raiz.MT_FN_APELIDO = { "chat-envia": "chat-envia2" };
  respostas.length = 0;
  pedidos.length = 0;
  respostas.push({ status: 401, body: '{"message":"Invalid credentials"}' }); // nome de sempre
  respostas.push({ status: 401, body: '{"message":"Invalid credentials"}' }); // de novo, com crachá novo
  respostas.push({ status: 200, body: '{"ok":true,"texto":"pela reserva"}' }); // apelido
  const viaApelido = await F.chama(clienteFake(jwt(3600), "cracha-novinho"), "chat-envia", { acao: "ping" }, "A IA de treino");
  ok(viaApelido.ok && viaApelido.texto === "pela reserva", "função de reserva salva a chamada quando o portão barra a principal");
  ok(/chat-envia2/.test(pedidos[pedidos.length - 1].url), "a última tentativa foi mesmo no nome de reserva");
  respostas.length = 0;
  pedidos.length = 0;
  respostas.push({ status: 200, body: '{"ok":true,"texto":"direto"}' });
  const jaSabe = await F.chama(clienteFake(jwt(3600), "x"), "chat-envia", { acao: "ping" }, "A IA de treino");
  ok(jaSabe.ok && pedidos.length === 1 && /chat-envia2/.test(pedidos[0].url),
    "depois que a reserva funciona, as próximas chamadas já vão direto nela");
  raiz.MT_FN_APELIDO = {};

  respostas.length = 0;
  respostas.push({ status: 404, body: '{"code":404,"message":"Requested function was not found"}' });
  const semFn = await F.chama(clienteFake(jwt(3600), "x"), "chat-envia", { acao: "ping" }, "A IA de treino");
  ok(/fora do ar/.test(semFn.erro) && !/sess/i.test(semFn.erro),
    "404 continua sendo 'recurso fora do ar', e não sessão caída");

  global.fetch = fetchOrig;
}

(async () => {
  await testaAjudantes();
  const b = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  navegadorV756 = b;
  console.log("Diagnóstico da nuvem:");

  for (const c of CENARIOS) {
    const ctx = await b.newContext();
    const erros = [];
    // nuvem simulada: nada sai para a internet de verdade
    await ctx.route("**/functions/v1/chat-envia", (r) => {
      // o GET (teste do porteiro) pode responder diferente do POST
      const q = c.get && r.request().method() === "GET" ? c.get : c.resposta;
      r.fulfill({ status: q.status, contentType: "application/json", body: JSON.stringify(q.body) });
    });
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
})()
  .catch((e) => { falhas++; console.log("  ❌ a suíte parou no meio — " + (e && e.stack ? e.stack : e)); })
  .finally(async () => {
    try { if (navegadorV756) await navegadorV756.close(); } catch (e) { /* ja fechado */ }
    console.log(falhas ? "\n💥 " + falhas + " FALHA(S)" : "\n🏁 TUDO PASSOU");
    process.exit(falhas ? 1 : 0);
  });
