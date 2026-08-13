// Guia da Meta: é a página que o Raphael vai seguir sozinho, num painel que
// muda de nome sem avisar. O que ela NÃO pode fazer é mandar copiar um valor
// errado — a URL do webhook e o verify token precisam sair certos.
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

(async () => {
  const b = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  const ctx = await b.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  const p = await ctx.newPage();
  const erros = [];
  p.on("pageerror", (e) => erros.push(e.message));
  await p.goto(BASE + "/meta.html");
  await p.waitForFunction(() => window.__metaGuia, null, { timeout: 10000 });

  console.log("Guia da Meta (WhatsApp):");

  // a URL tem que sair do cloud-config, não escrita na mão na página
  const cfg = fs.readFileSync(path.join(RAIZ, "assets/cloud-config.js"), "utf8");
  const projeto = (cfg.match(/url: "https:\/\/([a-z0-9]+)\./) || [])[1];
  const g = await p.evaluate(() => window.__metaGuia);
  ok(!!projeto && g.url === "https://" + projeto + ".supabase.co/functions/v1/meta-webhook",
    "a URL do webhook aponta pro projeto real do site (" + g.url + ")");
  ok(await p.evaluate(() => document.getElementById("url").textContent === window.__metaGuia.url),
    "e é a mesma que aparece na tela pra copiar");

  await p.click("#btnUrl");
  await p.waitForTimeout(250);
  ok((await p.evaluate(() => navigator.clipboard.readText())) === g.url,
    "o botão copia a URL de verdade");

  // o verify token é digitado em dois painéis diferentes: nada de 0/O, 1/l
  ok(/^torque-[A-HJ-NP-Z2-9]{10}$/.test(g.verify),
    "o verify token gerado não tem caractere que se confunde ao digitar (" + g.verify + ")");
  await p.click("#btnVerify");
  await p.waitForTimeout(250);
  ok((await p.evaluate(() => navigator.clipboard.readText())) === g.verify, "o botão copia o verify token");

  const texto = await p.evaluate(() => document.body.innerText);
  // os três tropeços que fazem a instalação falhar em silêncio
  ok(/DESLIGADO/.test(texto) && /meta-webhook/.test(texto),
    "avisa que o Verify JWT dessa função tem que ficar desligado");
  ok(/messages/.test(texto) && /Sem isso a Meta não manda nada/.test(texto),
    "avisa que sem marcar o campo messages a Meta fica calada");
  ok(/24 horas/.test(texto) && /Nunca expira/.test(texto),
    "avisa que o token temporário morre em 24h e ensina o permanente");
  ok(/não esteja em nenhum WhatsApp|não serve/.test(texto),
    "avisa que o número não pode estar em uso no WhatsApp comum");
  // a tela onde ele travou de verdade: app criado antes do portfólio existir
  ok(/portfólio empresarial/i.test(texto) && /Nenhuma empresa disponível/.test(texto),
    "usa o nome atual (portfólio empresarial) e explica a tela de 'Nenhuma empresa disponível'");

  // os dois caminhos por onde ele chega aqui
  const fun = fs.readFileSync(path.join(RAIZ, "funcoes.html"), "utf8");
  const chat = fs.readFileSync(path.join(RAIZ, "apps/chat.html"), "utf8");
  ok(/meta\.html/.test(fun) && /meta\.html/.test(chat),
    "o guia é achável pela página das funções e pela tela do Chat e IA");

  ok(erros.length === 0, "sem erro de JS na página" + (erros.length ? " — " + erros[0] : ""));

  await b.close();
  console.log(falhas ? "\n💥 " + falhas + " FALHA(S)" : "\n🏁 TUDO PASSOU");
  process.exit(falhas ? 1 : 0);
})();
