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

/* v756: declarar o NOME da cache não bastava. O que protege o aluno é o
 * `activate` NÃO apagar essas duas caches na troca de versão — um
 * `caches.delete` mais genérico devolveria 1 MB de MapLibre e 17 MB de
 * MediaPipe pra baixar a cada mt-vNNN, e nada na suíte acusava. */
function corpoActivate(src) {
  var i = src.indexOf('addEventListener("activate"');
  if (i < 0) return "";
  var j = src.indexOf('addEventListener("fetch"', i);
  return src.slice(i, j > -1 ? j : src.length);
}
var actSw = corpoActivate(sw), actApp = corpoActivate(appSw);
ok_(/caches\.delete/.test(actSw) && /VISAO/.test(actSw) && /MAPA/.test(actSw),
  "o activate do sw.js preserva a cache do mapa e a do leitor de imagem na faxina");
ok_(/caches\.delete/.test(actApp) && /MAPA/.test(actApp),
  "o activate do app/app-sw.js preserva a cache do mapa (o sw da raiz não alcança /app/)");
/* E os arquivos pesados não podem entrar no precache: o addAll é atômico e o
 * RUNTIME é apagado a cada versão — os dois motivos de existir cache própria. */
var precacheSw = sw.split('addEventListener("install"')[0];
ok_(!/assets\/vendor\/(maplibre|mediapipe)/.test(precacheSw),
  "nenhum arquivo do MapLibre/MediaPipe entrou na lista de precache do sw.js");
ok_(/indexOf\("mt-app-"\) === 0\) return null/.test(sw),
  "o sw.js da raiz preserva a cache offline do app do aluno (mt-app-*)");
ok_(/req\.mode === "navigate"\) return caches\.match\("index\.html"\)/.test(appSw) && /Response\.error\(\)/.test(appSw),
  "offline, o app-sw só devolve index.html pra navegação — sub-recurso que falta falha de verdade");
ok_(/cache: "no-cache"/.test(sw.split("addEventListener(\"install\"")[1].split("addEventListener(\"activate\"")[0]),
  "o precache revalida com no-cache (304 pelo ETag) em vez de rebaixar tudo com reload");

/* o construtor do app do aluno nunca pode ser servido do cache.
 * v756: a âncora antiga recortava o sw.js "até o req.mode === navigate" e
 * procurava aluno-builder.js dentro — só que a LISTA DE PRECACHE também está
 * antes dessa marca, então a regex casava mesmo sem a regra existir (provado:
 * apagando a linha da regra o teste continuava verde). Agora o recorte é o
 * PRÓPRIO if de rede-primeiro, achado pelo `/supabase/functions/`. */
var iRede = sw.indexOf('url.pathname.indexOf("/supabase/functions/")');
ok_(iRede > -1, "a âncora da regra de rede primeiro existe no sw.js (recorte vazio reprovaria, não passaria)");
var regraRede = iRede > -1 ? sw.slice(iRede, sw.indexOf("{", iRede)) : "";
ok_(/\/app\/aluno-builder\.js/.test(regraRede),
  "o app/aluno-builder.js está na regra de rede primeiro (o recorte é o if, não o precache)");
ok_(/\/app\/nutri-builder\.js/.test(regraRede) && /\/app\/aluno-skin\.js/.test(regraRede) && /\/app\/nutri-skin\.js/.test(regraRede),
  "o nutri-builder e os dois skins também são rede primeiro (a mesma fonte única)");

console.log("\nResultado: " + ok + " ok, " + falhas + " falhas");
process.exit(falhas ? 1 : 0);
