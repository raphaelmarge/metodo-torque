// Fábrica de artes do Instagram TORQUE ON.
// Uso: node marketing/gera-posts.js <posts.json> <pasta-saida>
// Cada post: { arquivo, tipo: "capa"|"lista"|"produtos", kicker?, titulo, destaque?, sub?, itens?, rodape? }
// Saída: PNG 1080×1350 (feed retrato) no padrão da marca (violeta/preto, fonte Archivo).
let chromium;
try { chromium = require("playwright").chromium; } catch (e) { chromium = require("/opt/node22/lib/node_modules/playwright").chromium; }
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const EXEC = fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined;
const LOGO = fs.readFileSync(path.join(RAIZ, "assets/icons/icon.svg"), "utf8");

function esc(t) { return String(t == null ? "" : t).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
// **texto** vira destaque violeta
function rico(t) { return esc(t).replace(/\*\*(.+?)\*\*/g, '<span class="vio">$1</span>'); }

const BASE_CSS = `
  * { margin: 0; box-sizing: border-box; }
  body { width: 1080px; height: 1350px; font-family: "Archivo", system-ui, sans-serif;
    background: radial-gradient(130% 80% at 50% -20%, rgba(124,58,237,.38), transparent 60%), #121016;
    color: #f5f4f7; display: flex; flex-direction: column; padding: 84px; }
  .topo { display: flex; align-items: center; gap: 22px; }
  .topo svg { width: 84px; height: 84px; border-radius: 20px; }
  .topo .marca { font-size: 40px; font-weight: 800; letter-spacing: .06em; }
  .topo .marca span { color: #a78bfa; }
  .kicker { font-size: 26px; letter-spacing: .24em; color: #a78bfa; font-weight: 700; text-transform: uppercase; margin-top: 96px; }
  h1 { font-size: 96px; font-weight: 800; letter-spacing: -.02em; line-height: 1.06; margin-top: 22px; }
  .vio { color: #a78bfa; }
  .sub { font-size: 40px; color: #b9b3c6; line-height: 1.45; margin-top: 34px; max-width: 860px; }
  .lista { margin-top: 44px; display: flex; flex-direction: column; gap: 26px; }
  .item { display: flex; gap: 26px; align-items: flex-start; background: rgba(28,24,38,.85);
    border: 1px solid #2c2739; border-radius: 24px; padding: 30px 34px; }
  .item .n { flex: none; width: 64px; height: 64px; border-radius: 50%; background: #7c3aed; color: #fff;
    font-weight: 800; font-size: 34px; display: flex; align-items: center; justify-content: center; }
  .item p { font-size: 37px; line-height: 1.35; padding-top: 8px; }
  .prods { margin-top: 54px; display: flex; flex-direction: column; gap: 28px; }
  .prod { background: rgba(28,24,38,.85); border: 1px solid #2c2739; border-left: 10px solid #7c3aed;
    border-radius: 24px; padding: 36px 40px; }
  .prod.verde { border-left-color: #22c55e; }
  .prod b { font-size: 44px; display: block; }
  .prod b span { color: #a78bfa; } .prod.verde b span { color: #4ade80; }
  .prod p { font-size: 32px; color: #b9b3c6; margin-top: 8px; line-height: 1.4; }
  .rodape { margin-top: auto; display: flex; align-items: flex-end; justify-content: space-between; gap: 48px; }
  .rodape .site { font-size: 38px; font-weight: 800; color: #a78bfa; }
  .rodape .tag { font-size: 28px; color: #8a8695; text-align: right; max-width: 400px; line-height: 1.4; }
`;

function html(post) {
  const topo = `<div class="topo">${LOGO}<div class="marca">TORQUE<span>&nbsp;ON</span></div></div>`;
  const rodape = `<div class="rodape"><div class="site">www.torqueon.com.br</div><div class="tag">${esc(post.rodape || "o sistema que roda seu negócio fitness")}</div></div>`;
  let meio = "";
  if (post.tipo === "lista") {
    meio = `<div class="kicker">${esc(post.kicker || "")}</div><h1 style="font-size:76px;">${rico(post.titulo)}</h1>
      <div class="lista">${(post.itens || []).map((t, i) => `<div class="item"><div class="n">${i + 1}</div><p>${rico(t)}</p></div>`).join("")}</div>`;
  } else if (post.tipo === "produtos") {
    meio = `<div class="kicker">${esc(post.kicker || "")}</div><h1 style="font-size:72px;">${rico(post.titulo)}</h1>
      <div class="prods">${(post.itens || []).map((p) => `<div class="prod ${p.verde ? "verde" : ""}"><b>${rico(p.nome)}</b><p>${rico(p.desc)}</p></div>`).join("")}</div>`;
  } else {
    meio = `<div class="kicker">${esc(post.kicker || "")}</div><h1>${rico(post.titulo)}</h1>
      ${post.sub ? `<p class="sub">${rico(post.sub)}</p>` : ""}`;
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
    <link href="file://${RAIZ}/assets/fonts/archivo.css" rel="stylesheet">
    <style>${BASE_CSS}</style></head><body>${topo}${meio}${rodape}</body></html>`;
}

(async () => {
  const posts = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const saida = process.argv[3] || ".";
  fs.mkdirSync(saida, { recursive: true });
  const b = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  for (const post of posts) {
    const p = await b.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
    await p.setContent(html(post), { waitUntil: "networkidle" });
    await p.waitForTimeout(150);
    const destino = path.join(saida, post.arquivo);
    await p.screenshot({ path: destino });
    await p.close();
    console.log("ok", destino);
  }
  await b.close();
})();
