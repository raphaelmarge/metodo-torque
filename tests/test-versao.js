/* A versão precisa estar CRAVADA no sw.js, e igual à do assets/versao.js.
 *
 * O navegador só troca o service worker quando os BYTES do sw.js mudam. Enquanto
 * a versão morou só no arquivo importado, o sw.js ficou idêntico do mt-v491 ao
 * mt-v509 e o iPhone nunca trocou o service worker — o app do aluno congelou no
 * código guardado no aparelho. Este teste é o que impede a volta disso: se
 * alguém subir a versão só num dos dois arquivos, a suíte falha.
 *
 * Roda em node puro, sem navegador. */
const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..");
let ok = 0, falhas = 0;
function ok_(cond, msg) {
  if (cond) { ok++; console.log("  ✅ " + msg); }
  else { falhas++; console.log("  ❌ " + msg); }
}

console.log("Versão do site (sw.js × versao.js):");

const versaoJs = fs.readFileSync(path.join(raiz, "assets/versao.js"), "utf8");
const sw = fs.readFileSync(path.join(raiz, "sw.js"), "utf8");

const doVersaoJs = (versaoJs.match(/MT_VERSAO\s*=\s*"(mt-v\d+)"/) || [])[1] || "";
const doSw = (sw.match(/^var VERSION = "(mt-v\d+)";$/m) || [])[1] || "";

ok_(/^mt-v\d+$/.test(doVersaoJs), "assets/versao.js declara a versão (" + doVersaoJs + ")");
ok_(/^mt-v\d+$/.test(doSw), "sw.js tem a versão cravada no próprio arquivo (" + doSw + ")");
ok_(doSw === doVersaoJs, "as duas são a mesma — senão o celular não troca o service worker");
ok_(!/importScripts\((["']).*versao\.js\1\)/.test(sw),
  "o sw.js não volta a tirar a versão de um arquivo importado (é isso que congelava o iPhone)");

// o construtor do app do aluno nunca pode ser servido do cache
ok_(/aluno-builder\.js/.test(sw.split("req.mode === \"navigate\"")[0].split("// demais arquivos")[0]),
  "o app/aluno-builder.js está na regra de rede primeiro");

console.log("\nResultado: " + ok + " ok, " + falhas + " falhas");
process.exit(falhas ? 1 : 0);
