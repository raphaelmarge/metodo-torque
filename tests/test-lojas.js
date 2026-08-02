// Prontidão para as lojas (Google Play / App Store): manifests, ícones e privacidade
const fs = require("fs");
const path = require("path");
const RAIZ = path.join(__dirname, "..");

let falhas = 0;
function ok(cond, nome) {
  console.log((cond ? "  ✅ " : "  ❌ ") + nome);
  if (!cond) falhas++;
}
function lerJson(rel) {
  try { return JSON.parse(fs.readFileSync(path.join(RAIZ, rel), "utf8")); } catch (e) { return null; }
}

console.log("Manifests prontos pra loja:");
const MANIFESTS = [
  ["manifest.webmanifest", "torqueon-academia", "icon-512.png"],
  ["manifest-personal.webmanifest", "torque-personal", "icon-personal-512.png"],
  ["manifest-nutricao.webmanifest", "torque-nutri", "icon-nutri-512.png"],
];
for (const [arq, id, icone512] of MANIFESTS) {
  const m = lerJson(arq);
  ok(!!m, arq + " é JSON válido");
  if (!m) continue;
  ok(m.id === id, arq + " tem id '" + id + "'");
  ok(!!(m.name && m.short_name && m.description && m.start_url && m.display === "standalone"), arq + " tem nome/descrição/start_url/standalone");
  ok(m.lang === "pt-BR" && Array.isArray(m.categories) && m.categories.length >= 2, arq + " tem idioma e categorias");
  const icones = m.icons || [];
  ok(icones.some((i) => i.sizes === "512x512" && i.purpose !== "maskable"), arq + " tem ícone 512 normal");
  ok(icones.some((i) => i.sizes === "512x512" && i.purpose === "maskable"), arq + " tem ícone 512 maskable");
  for (const i of icones) ok(fs.existsSync(path.join(RAIZ, i.src)), arq + ": arquivo existe — " + i.src);
  ok(icones.some((i) => i.src.indexOf(icone512) >= 0), arq + " usa o ícone próprio do produto (" + icone512 + ")");
}

console.log("Assetlinks (Android tela cheia):");
const al = lerJson(".well-known/assetlinks.json");
ok(Array.isArray(al) && al.length === 3, "assetlinks.json é JSON válido com 3 apps");
if (Array.isArray(al)) {
  const pacotes = al.map((x) => x.target && x.target.package_name);
  ok(pacotes.includes("com.torqueon.academia") && pacotes.includes("com.torqueon.personal") && pacotes.includes("com.torqueon.nutri"), "pacotes com.torqueon.{academia,personal,nutri}");
}

console.log("Política de privacidade:");
const priv = fs.readFileSync(path.join(RAIZ, "privacidade.html"), "utf8");
ok(/Política de Privacidade/.test(priv) && /LGPD/.test(priv) && /Supabase/.test(priv), "privacidade.html cobre coleta, nuvem e LGPD");

console.log("Cara de app nativo:");
const manAcad = lerJson("manifest.webmanifest");
ok(Array.isArray(manAcad.shortcuts) && manAcad.shortcuts.length >= 3, "academia tem atalhos de ícone (segurar o ícone → Sistema/Grade/Alunos)");
for (const [arq, titulo] of [["index.html", "TORQUE ON"], ["personal.html", "TQ Personal"], ["nutricao.html", "TQ Nutri"]]) {
  const htm = fs.readFileSync(path.join(RAIZ, arq), "utf8");
  ok(htm.includes('apple-mobile-web-app-capable" content="yes"') && htm.includes('apple-mobile-web-app-title" content="' + titulo + '"'), arq + " abre em tela cheia no iPhone com título " + titulo);
}

console.log("Ícones por produto nas páginas:");
const per = fs.readFileSync(path.join(RAIZ, "personal.html"), "utf8");
const nut = fs.readFileSync(path.join(RAIZ, "nutricao.html"), "utf8");
ok(per.includes("icon-personal.svg") && per.includes('apple-touch-icon" href="assets/icons/icon-personal-192.png'), "personal.html usa o ícone roxo próprio (favicon + apple-touch)");
ok(nut.includes("icon-nutri.svg") && nut.includes('apple-touch-icon" href="assets/icons/icon-nutri-192.png'), "nutricao.html usa o ícone verde próprio (favicon + apple-touch)");

console.log("Guia de publicação:");
const guia = fs.readFileSync(path.join(RAIZ, "PUBLICAR-NAS-LOJAS.md"), "utf8");
ok(/pwabuilder/i.test(guia) && /play\.google\.com\/console/.test(guia) && /assetlinks/.test(guia) && /App Store/.test(guia), "PUBLICAR-NAS-LOJAS.md cobre Play, Apple e assetlinks");

console.log("App nativo (Capacitor):");
const pkgNativo = lerJson("nativo/package.json");
ok(!!pkgNativo && !!(pkgNativo.dependencies || {})["@capacitor/core"] && !!(pkgNativo.dependencies || {})["@capacitor/android"], "nativo/package.json com Capacitor core + android");
const capCfg = lerJson("nativo/capacitor.config.json");
ok(!!capCfg && capCfg.appId === "com.torqueon.academia" && capCfg.webDir === "www", "capacitor.config.json com appId com.torqueon.academia e webDir www");
for (const a of ["nativo/assets/icon.png", "nativo/assets/splash.png", "nativo/assets/splash-dark.png"]) {
  ok(fs.existsSync(path.join(RAIZ, a)) && fs.statSync(path.join(RAIZ, a)).size > 10000, "asset nativo existe — " + a);
}
const wf = fs.readFileSync(path.join(RAIZ, ".github/workflows/app-nativo.yml"), "utf8");
ok(/cap add android/.test(wf) && /assembleDebug/.test(wf) && /upload-artifact/.test(wf) && /workflow_dispatch/.test(wf), "workflow compila o APK e publica como artefato");
// o copia-www monta o miolo do app sem faltar as portas de entrada
const { execFileSync } = require("child_process");
try {
  execFileSync(process.execPath, [path.join(RAIZ, "nativo/copia-www.js")], { stdio: "pipe" });
  ok(fs.existsSync(path.join(RAIZ, "nativo/www/index.html")) && fs.existsSync(path.join(RAIZ, "nativo/www/apps/store.js")), "copia-www monta o www com o sistema completo");
  ok(!fs.existsSync(path.join(RAIZ, "nativo/www/supabase-setup.sql")) && !fs.existsSync(path.join(RAIZ, "nativo/www/tests")), "www não leva arquivos de servidor/testes");
} catch (e) {
  ok(false, "copia-www roda sem erro — " + String(e).slice(0, 120));
}

console.log("Domínio próprio (www.torqueon.com.br):");
const idxHtml = fs.readFileSync(path.join(RAIZ, "index.html"), "utf8");
ok(/torqueon\\?\.com\\?\.br/.test(idxHtml) && /location\.replace\("torqueon\.html"\)/.test(idxHtml), "index.html manda visitante do domínio pro site de vendas");
ok(/portal/.test(idxHtml.split("torqueon.com.br")[1] || ""), "dá pra forçar o portal com ?portal=1");
ok(/location\.replace\("apps\/sistema\.html"\)/.test(idxHtml) && /materiais/.test(idxHtml), "cliente com cadastro entra DIRETO no sistema (materiais viram ?materiais=1)");
const sisHtml = fs.readFileSync(path.join(RAIZ, "apps/sistema.html"), "utf8");
ok(sisHtml.includes("index.html?materiais=1") && /Ajuda e materiais/.test(sisHtml), "menu do sistema tem 'Ajuda e materiais do Método' apontando pra biblioteca");
const tqs = fs.readFileSync(path.join(RAIZ, "torqueon.html"), "utf8");
ok(/og:title/.test(tqs) && /og:description/.test(tqs) && /og:image/.test(tqs), "torqueon.html tem Open Graph (preview bonito no WhatsApp)");
const dom = fs.readFileSync(path.join(RAIZ, "DOMINIO.md"), "utf8");
ok(/registro\.br/.test(dom) && /185\.199\.108\.153/.test(dom) && /CNAME/.test(dom) && /Enforce HTTPS/.test(dom), "DOMINIO.md cobre registro, DNS e ativação no Pages");

console.log("Banco de exercícios compartilhado:");
const exSrc = fs.readFileSync(path.join(RAIZ, "assets/exercicios-db.js"), "utf8");
const exLista = JSON.parse(exSrc.slice(exSrc.indexOf("["), exSrc.lastIndexOf("]") + 1));
ok(exLista.length >= 100, "catálogo tem 100+ exercícios (" + exLista.length + ")");
ok(new Set(exLista.map((e) => e.n.toLowerCase())).size === exLista.length, "nomes de exercícios são únicos");
ok(exLista.every((e) => e.n && e.g && e.eq && e.d && e.d.length > 15), "todo exercício tem nome, grupo, equipamento e dica de execução");
ok(new Set(exLista.map((e) => e.g)).size >= 9, "9+ grupos musculares/modalidades");
const perEx = fs.readFileSync(path.join(RAIZ, "personal.html"), "utf8");
ok(perEx.includes("assets/exercicios-db.js") && perEx.includes("dlExCat"), "TORQUE PERSONAL usa o catálogo (autocompletar da biblioteca)");
const trEx = fs.readFileSync(path.join(RAIZ, "apps/treinos.html"), "utf8");
ok(trEx.includes("../assets/exercicios-db.js") && trEx.includes("catalogo"), "TORQUE ON academia usa o catálogo na busca das fichas");

console.log("Nenhum botão sem rótulo (regressão da limpeza de emojis):");
const glob2 = fs.readdirSync(path.join(RAIZ, "apps")).filter((f) => f.endsWith(".html")).map((f) => "apps/" + f);
const paginas = ["index.html", "nutricao.html", "personal.html", "personal-vendas.html", "aluno-login.html", "matricula.html", "torqueon.html"].concat(glob2);
let vazios = [];
for (const pg of paginas) {
  const t = fs.readFileSync(path.join(RAIZ, pg), "utf8");
  const m = t.match(/<(button|a)\b[^>]*>\s*<\/\1>/g);
  if (m) vazios.push(pg + " (" + m.length + ")");
}
ok(vazios.length === 0, "nenhum botão/link vazio nas " + paginas.length + " páginas" + (vazios.length ? " — " + vazios.join(", ") : ""));

console.log(falhas ? "\n💥 " + falhas + " FALHA(S)" : "\n🏁 TUDO PASSOU");
process.exit(falhas ? 1 : 0);
