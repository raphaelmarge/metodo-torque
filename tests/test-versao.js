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
const appSw = fs.readFileSync(path.join(raiz, "app/app-sw.js"), "utf8");

const doVersaoJs = (versaoJs.match(/MT_VERSAO\s*=\s*"(mt-v\d+)"/) || [])[1] || "";
const doSw = (sw.match(/^var VERSION = "(mt-v\d+)";$/m) || [])[1] || "";

ok_(/^mt-v\d+$/.test(doVersaoJs), "assets/versao.js declara a versão (" + doVersaoJs + ")");
ok_(/^mt-v\d+$/.test(doSw), "sw.js tem a versão cravada no próprio arquivo (" + doSw + ")");
ok_(doSw === doVersaoJs, "as duas são a mesma — senão o celular não troca o service worker");
ok_(!/importScripts\((["']).*versao\.js\1\)/.test(sw),
  "o sw.js não volta a tirar a versão de um arquivo importado (é isso que congelava o iPhone)");

// v747: o app/app-sw.js repetia a armadilha (versão só pelo importScripts, bytes
// iguais desde o mt-v665) — agora é o TERCEIRO lugar com o número cravado
const doAppSw = (appSw.match(/^var VERSION = "(mt-v\d+)";$/m) || [])[1] || "";
ok_(/^mt-v\d+$/.test(doAppSw), "app/app-sw.js tem a versão cravada no próprio arquivo (" + doAppSw + ")");
ok_(doAppSw === doVersaoJs, "a do app-sw.js é a mesma — senão o iPhone não troca o service worker do app");
ok_(!/importScripts\((["']).*versao\.js\1\)/.test(appSw),
  "o app-sw.js não volta a tirar a versão de um arquivo importado");
ok_(/mt-mapa-v1/.test(appSw) && /mt-mapa-v1/.test(sw) && /mt-visao-v1/.test(sw),
  "as caches próprias do mapa (nos dois SWs) e do leitor de imagem continuam existindo");
ok_(/indexOf\("mt-app-"\) === 0\) return null/.test(sw),
  "o sw.js da raiz preserva a cache offline do app do aluno (mt-app-*)");
ok_(/req\.mode === "navigate"\) return caches\.match\("index\.html"\)/.test(appSw) && /Response\.error\(\)/.test(appSw),
  "offline, o app-sw só devolve index.html pra navegação — sub-recurso que falta falha de verdade");
ok_(/cache: "no-cache"/.test(sw.split("addEventListener(\"install\"")[1].split("addEventListener(\"activate\"")[0]),
  "o precache revalida com no-cache (304 pelo ETag) em vez de rebaixar tudo com reload");

// o construtor do app do aluno nunca pode ser servido do cache
ok_(/aluno-builder\.js/.test(sw.split("req.mode === \"navigate\"")[0].split("// demais arquivos")[0]),
  "o app/aluno-builder.js está na regra de rede primeiro");

console.log("\nResultado: " + ok + " ok, " + falhas + " falhas");
process.exit(falhas ? 1 : 0);
