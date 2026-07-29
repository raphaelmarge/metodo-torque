// Copia o site (a raiz do repositório) para nativo/www — o "miolo" do app nativo.
// O app é offline-first: os arquivos vão DENTRO do aplicativo, e os dados
// continuam sincronizando com o Supabase normalmente.
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const DEST = path.join(__dirname, "www");

// o que NÃO entra no app
const IGNORA = new Set([
  ".git", ".github", ".well-known", "nativo", "tests", "supabase",
  "node_modules", "README.md", "PUBLICAR-NAS-LOJAS.md", "APP-NATIVO.md",
  "gerador-codigo.html", "supabase-setup.sql", "print-canvas-final.png", "design",
]);

fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });

let total = 0;
for (const item of fs.readdirSync(RAIZ)) {
  if (IGNORA.has(item)) continue;
  fs.cpSync(path.join(RAIZ, item), path.join(DEST, item), { recursive: true });
  total++;
}

// sanidade: as portas de entrada precisam existir
for (const arq of ["index.html", "personal.html", "nutricao.html", "assets/cloud-config.js", "apps/store.js"]) {
  if (!fs.existsSync(path.join(DEST, arq))) {
    console.error("FALTOU no www: " + arq);
    process.exit(1);
  }
}
console.log("www pronto: " + total + " itens copiados para " + DEST);
