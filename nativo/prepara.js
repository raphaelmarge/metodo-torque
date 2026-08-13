// Prepara o app nativo de UM dos três produtos.
// Uso: node nativo/prepara.js <academia|personal|nutri>
//
// Faz três coisas antes do Capacitor entrar em cena:
//   1. copia o site inteiro para nativo/www (copia-www.js);
//   2. se o produto não é a academia, troca o www/index.html por um redirecionamento
//      pra página do produto — o app do personal tem que abrir no Personal, não
//      no portal da academia;
//   3. escreve o capacitor.config.json e o ícone daquele produto.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const AQUI = __dirname;
const RAIZ = path.join(AQUI, "..");
const PRODUTOS = JSON.parse(fs.readFileSync(path.join(AQUI, "produtos.json"), "utf8"));

const id = (process.argv[2] || "academia").trim();
const p = PRODUTOS[id];
if (!p) {
  console.error("produto desconhecido: " + id + " — use " + Object.keys(PRODUTOS).join(", "));
  process.exit(1);
}

execFileSync(process.execPath, [path.join(AQUI, "copia-www.js")], { stdio: "inherit" });

const www = path.join(AQUI, "www");
if (p.abre !== "index.html") {
  /* Redirecionamento em vez de renomear a página: assim todos os links
   * internos (que apontam pra personal.html, nutricao.html…) continuam
   * valendo dentro do app. */
  fs.writeFileSync(path.join(www, "index.html"),
    '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">' +
    '<meta http-equiv="refresh" content="0; url=' + p.abre + '">' +
    '<title>' + p.appName + '</title>' +
    '<style>body{background:' + p.fundo + ';color:#f5f4f7;font-family:system-ui,sans-serif;' +
    'display:flex;align-items:center;justify-content:center;height:100vh;margin:0}</style></head>' +
    '<body><p>Abrindo o ' + p.appName + '…</p>' +
    '<script>location.replace("' + p.abre + '");</script></body></html>');
}

fs.writeFileSync(path.join(AQUI, "capacitor.config.json"), JSON.stringify({
  appId: p.appId,
  appName: p.appName,
  webDir: "www",
  backgroundColor: p.fundo,
  android: { allowMixedContent: false },
  ios: { contentInset: "always" },
  server: { androidScheme: "https" },
}, null, 2) + "\n");

// o gerador de ícones nativos lê sempre nativo/assets/icon.png
fs.mkdirSync(path.join(AQUI, "assets"), { recursive: true });
fs.copyFileSync(path.join(RAIZ, p.icone), path.join(AQUI, "assets", "icon.png"));

console.log("pronto: " + p.appName + " (" + p.appId + ") abrindo em " + p.abre);
