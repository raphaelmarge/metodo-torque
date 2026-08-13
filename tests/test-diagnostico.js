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
    nome: "tudo certo",
    resposta: { status: 200, body: { ok: true, ia: true, whatsapp: false, instagram: false } },
    espera: [/Função chat-envia publicada/, /Chave da IA configurada/],
    naoEspera: [/não existe neste projeto/],
  },
  {
    nome: "função no ar, sem a chave da IA",
    resposta: { status: 200, body: { ok: true, ia: false, whatsapp: false, instagram: false } },
    espera: [/Falta a chave da IA/, /ANTHROPIC_API_KEY/, /publique a chat-envia DE NOVO/i],
    naoEspera: [/Chave da IA configurada/],
  },
  {
    nome: "função não existe (nome errado ou outro projeto)",
    resposta: { status: 404, body: { code: 404, message: "Requested function was not found" } },
    espera: [/não existe neste projeto/, /exatamente chat-envia/],
    naoEspera: [/Falta a chave da IA/],
  },
  {
    nome: "função recusa a chamada (Verify JWT)",
    resposta: { status: 401, body: { message: "Invalid JWT" } },
    espera: [/recusou a chamada/, /Verify JWT/],
    naoEspera: [/publicada/],
  },
];

(async () => {
  const b = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  console.log("Diagnóstico da nuvem:");

  for (const c of CENARIOS) {
    const ctx = await b.newContext();
    const erros = [];
    // nuvem simulada: nada sai para a internet de verdade
    await ctx.route("**/functions/v1/chat-envia", (r) =>
      r.fulfill({ status: c.resposta.status, contentType: "application/json", body: JSON.stringify(c.resposta.body) }));
    await ctx.route("**/rest/v1/", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: '{"paths":{}}' }));
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
    ok(visivel && /chat-envia ping: HTTP 500/.test(tec) && /BOOT_ERROR/.test(tec),
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
