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
  ["manifest.webmanifest", "torquesys-academia", "icon-512.png"],
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
  ok(pacotes.includes("com.torquesys.academia") && pacotes.includes("com.torquesys.personal") && pacotes.includes("com.torquesys.nutri"), "pacotes com.torquesys.{academia,personal,nutri}");
}

console.log("Política de privacidade:");
const priv = fs.readFileSync(path.join(RAIZ, "privacidade.html"), "utf8");
ok(/Política de Privacidade/.test(priv) && /LGPD/.test(priv) && /Supabase/.test(priv), "privacidade.html cobre coleta, nuvem e LGPD");

console.log("Ícones por produto nas páginas:");
const per = fs.readFileSync(path.join(RAIZ, "personal.html"), "utf8");
const nut = fs.readFileSync(path.join(RAIZ, "nutricao.html"), "utf8");
ok(per.includes("icon-personal.svg") && per.includes('apple-touch-icon" href="assets/icons/icon-personal-192.png'), "personal.html usa o ícone roxo próprio (favicon + apple-touch)");
ok(nut.includes("icon-nutri.svg") && nut.includes('apple-touch-icon" href="assets/icons/icon-nutri-192.png'), "nutricao.html usa o ícone verde próprio (favicon + apple-touch)");

console.log("Guia de publicação:");
const guia = fs.readFileSync(path.join(RAIZ, "PUBLICAR-NAS-LOJAS.md"), "utf8");
ok(/pwabuilder/i.test(guia) && /play\.google\.com\/console/.test(guia) && /assetlinks/.test(guia) && /App Store/.test(guia), "PUBLICAR-NAS-LOJAS.md cobre Play, Apple e assetlinks");

console.log(falhas ? "\n💥 " + falhas + " FALHA(S)" : "\n🏁 TUDO PASSOU");
process.exit(falhas ? 1 : 0);
