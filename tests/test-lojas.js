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
ok(/play\.google\.com\/console/.test(guia) && /App Store/.test(guia) && /developer\.apple|Xcode/.test(guia),
  "PUBLICAR-NAS-LOJAS.md cobre a Play e a Apple");
// as duas lojas recusam app com login sem exclusão de conta; o guia tem que
// mandar o Raphael preencher esse campo, senão a recusa vem só na revisão
ok(/excluir-conta\.html/.test(guia) && /ANDROID_KEYSTORE_BASE64/.test(guia),
  "e explica a exclusão de conta e a chave de assinatura, que são o que trava a aprovação");
ok(/3\.1\.1|3\.1\.3/.test(guia), "e avisa da regra de compra dentro do app da Apple, que é o risco real de recusa");

console.log("Textos e artes das lojas:");
const textos = fs.readFileSync(path.join(RAIZ, "LOJAS-TEXTOS.md"), "utf8");
ok(/TORQUE ON/.test(textos) && /TORQUE PERSONAL/.test(textos) && /TORQUE NUTRI/.test(textos),
  "LOJAS-TEXTOS.md traz a ficha dos três apps");
ok(/Segurança dos dados/.test(textos) && /App Privacy/.test(textos) && /excluir-conta\.html/.test(textos),
  "com as respostas dos questionários de privacidade das duas lojas");
for (const arte of ["assets/icons/loja/icone-academia-1024.png", "assets/icons/loja/icone-personal-1024.png",
  "assets/icons/loja/icone-nutri-1024.png", "assets/icons/loja/destaque-personal.png"]) {
  ok(fs.existsSync(path.join(RAIZ, arte)), "arte da loja existe: " + arte);
}
const prods = lerJson("nativo/produtos.json");
ok(!!prods && Object.keys(prods).length === 4 &&
  prods.personal.appId === "com.torqueon.personal" && prods.nutri.abre === "nutricao.html" &&
  prods.aluno.abre === "aluno-login.html",
  "nativo/produtos.json define os quatro apps com o pacote e a página de cada um");
// cada produto precisa do ícone que o gerador de assets nativos consome
for (const id of Object.keys(prods || {})) {
  ok(fs.existsSync(path.join(RAIZ, prods[id].icone)), "ícone do app existe: " + id);
}
const fluxo = fs.readFileSync(path.join(RAIZ, ".github/workflows/app-nativo.yml"), "utf8");
ok(Object.keys(prods || {}).every((id) => fluxo.includes(id)),
  "e o robô do GitHub oferece todos eles na hora de compilar");

console.log("App nativo (Capacitor):");
const pkgNativo = lerJson("nativo/package.json");
ok(!!pkgNativo && !!(pkgNativo.dependencies || {})["@capacitor/core"] && !!(pkgNativo.dependencies || {})["@capacitor/android"] && !!(pkgNativo.dependencies || {})["@capacitor/ios"], "nativo/package.json com Capacitor core + android + ios (sem o ios, 'cap add ios' falha no Mac)");
// o app do ALUNO: login precisa apontar pro arquivo com extensão (no Capacitor,
// caminho sem extensão cai no index da raiz e o aluno nunca chegava no treino)
{
  const loginHtml = fs.readFileSync(path.join(RAIZ, "aluno-login.html"), "utf8");
  ok(/app\/index\.html\?t=/.test(loginHtml) && !/["']app\/\?t=/.test(loginHtml),
    "aluno-login.html manda pro app/index.html?t= (funciona no site E dentro do app da loja)");
  ok(/location\.replace\("app\/index\.html\?t="/.test(loginHtml),
    "quem já entrou uma vez cai DIRETO no treino ao reabrir o app (auto-redirect com escape ?sair=1)");
  const prodsNativo = lerJson("nativo/produtos.json");
  ok(!!prodsNativo && !!prodsNativo.aluno && Array.isArray(prodsNativo.aluno.ignora) && prodsNativo.aluno.ignora.indexOf("assets/vendor/mediapipe") >= 0,
    "produto aluno existe no nativo e deixa os 28 MB do mediapipe fora do pacote");
  const preparaJs = fs.readFileSync(path.join(RAIZ, "nativo/prepara.js"), "utf8");
  ok(/p\.ignora/.test(preparaJs) && /rmSync/.test(preparaJs),
    "prepara.js aplica a lista ignora do produto (tira do www o que ele não usa)");
}
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

/* Botão só com símbolo (✕ ‹ › + ➤) também é botão sem nome: o leitor de tela
 * anuncia o caractere cru. O teste antigo só pegava os COMPLETAMENTE vazios. */
const semNome = [];
for (const pg of paginas) {
  const t = fs.readFileSync(path.join(RAIZ, pg), "utf8");
  const re = /<button\b([^>]*)>([\s\S]{0,400}?)<\/button>/g;
  let m2, n = 0;
  while ((m2 = re.exec(t))) {
    if (/aria-label|title=/.test(m2[1])) continue;
    const visivel = m2[2].replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]*>/g, "");
    if (/[a-zA-Zà-úÀ-Ú0-9]/.test(visivel)) continue;
    n++;
  }
  if (n) semNome.push(pg + " (" + n + ")");
}
ok(semNome.length === 0, "nenhum botão só de símbolo sem aria-label" + (semNome.length ? " — " + semNome.join(", ") : ""));

/* Página sem <link rel="icon"> faz o navegador pedir /favicon.ico e tomar 404
 * — some da aba e polui o console de quem abre. */
const semIcone = [];
for (const pg of fs.readdirSync(RAIZ).filter((f) => f.endsWith(".html")).concat(glob2)) {
  const t = fs.readFileSync(path.join(RAIZ, pg), "utf8");
  if (!/rel=["']icon["']/i.test(t)) semIcone.push(pg);
}
ok(semIcone.length === 0, "toda página tem ícone de aba (sem 404 de favicon)" + (semIcone.length ? " — " + semIcone.join(", ") : ""));

/* As Edge Functions que agem em nome do usuário (whatsapp, pagarme) exigem
 * role "authenticated". A anonKey tem role "anon": mandada como Authorization,
 * leva 401 SEMPRE — a função nem chega a rodar. Já aconteceu em 5 lugares. */
console.log("Chamada de Edge Function com o login certo:");
{
  const culpados = [];
  const varre = (dir) => {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) { if (!/node_modules|nativo|\.git/.test(f)) varre(p); continue; }
      if (!/\.(html|js)$/.test(f)) continue;
      const s = fs.readFileSync(p, "utf8");
      if (/Authorization["'\s]*[:=]\s*["']Bearer\s*["']\s*\+\s*(window\.)?MT_CLOUD\.anonKey/.test(s)) {
        culpados.push(path.relative(RAIZ, p));
      }
    }
  };
  varre(RAIZ);
  ok(culpados.length === 0,
    "nenhuma tela manda a chave pública no lugar do token de login" + (culpados.length ? " — " + culpados.join(", ") : ""));
  const st = fs.readFileSync(path.join(RAIZ, "apps/store.js"), "utf8");
  ok(/tokenNuvem:\s*function/.test(st), "e o store expõe o tokenNuvem() que essas telas usam");
}

console.log(falhas ? "\n💥 " + falhas + " FALHA(S)" : "\n🏁 TUDO PASSOU");
process.exit(falhas ? 1 : 0);
