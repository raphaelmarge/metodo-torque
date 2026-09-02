/* Tokens do painel NUTRI (redesenho v662, o irmão verde do test-tokens-painel).
 *
 * Duas vigias:
 * 1) PALETA — nenhuma cor nova entra no nutricao.html: todo hex fora da lista
 *    reprova, exceto dentro dos documentos autônomos (recibo, plano em PDF,
 *    laudo, e-mail de acesso, config do módulo de conta) e do pacote do app
 *    (dadosAppPaciente) — lá var() não existe e hex é obrigatório.
 * 2) GEOMETRIA — o que o nutricionista VÊ, medido no navegador: card com borda
 *    e sem sombra, título de card em caixa mista, botão de 44px com raio 11,
 *    e o modo claro trocando os tokens com o verde da marca parado no lugar.
 */
process.env.TZ = "America/Sao_Paulo";
const fs = require("fs");
const path = require("path");
let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? "  ✅ " : "  ❌ ") + msg); if (!cond) falhas++; };

const ARQ = path.join(__dirname, "..", "nutricao.html");
let src = fs.readFileSync(ARQ, "utf8");

// ---- 1) recorta os documentos autônomos (hex é obrigatório lá) ----
// cada região vai do marcador de início até o marcador de fim, exclusivo
const REGIOES = [
  ["function abreLaudoN(", "function pintaLaudoN("],
  ["function abreReciboN(", '$("pnFin")'],
  ["function montaPlanoPDF(", '$("dPdf")'],
  ["function dadosAppPaciente(", "window.__dadosAppPaciente"],
  ["function emailAcessoHtmlN(", "function criaAcessoPaciente("],
  ["self.MT_moduloConta({", "nomeCampo:"],
];
let limpo = src;
for (const [ini, fim] of REGIOES) {
  const a = limpo.indexOf(ini);
  const b = a < 0 ? -1 : limpo.indexOf(fim, a);
  ok(a > -1 && b > a, "achou a região autônoma que começa em “" + ini.slice(0, 30) + "…”");
  if (a > -1 && b > a) limpo = limpo.slice(0, a) + limpo.slice(b);
}
// o gradiente do topo e o theme-color são contrato do test-nutricao — ficam
limpo = limpo.replace(/linear-gradient\(135deg, #14532d, #166534\)/g, "")
  .replace(/<meta name="theme-color"[^>]*>/g, "");

// ---- paleta: os valores dos tokens + os cravados com motivo dito ----
const PALETA = new Set([
  // marca e tokens escuros
  "#16a34a", "#15803d", "#0f1a12", "#16241a", "#121a14", "#202b1d",
  "#29402f", "#24312a", "#3a4636", "#eef7f0", "#dbe7d8", "#9fb8a6",
  "#8a9585", "#54604f", "#4ade80", "#86efac", "#14532d", "#bbf7d0",
  "#f87171", "#fbbf24", "#0e2417", "#22c55e",
  // tokens do modo claro
  "#f2f7f2", "#ffffff", "#fff", "#f0fdf4", "#dbe5db", "#a9b5a4",
  "#16211a", "#2a3a2e", "#45564b", "#667a6d", "#8a948a", "#b91c1c", "#b45309",
  // cravados com motivo: gradiente do topo (contrato), estrela de favorito,
  // selo vermelho do menu (fundo escuro atrás de texto branco) e o chip roxo
  // (família do roxo da marca TORQUE)
  "#166534", "#f5b301", "#dc2626", "#a78bfa", "#ede9fe", "#6d28d9",
]);
const fora = {};
for (const m of limpo.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
  const h = m[0].toLowerCase();
  if (!PALETA.has(h)) fora[h] = (fora[h] || 0) + 1;
}
const foraLista = Object.entries(fora).map(([k, n]) => k + " x" + n);
ok(foraLista.length === 0, "nenhuma cor fora da paleta no painel (estado/destaque é tinta sobre token)" +
  (foraLista.length ? " — achei: " + foraLista.join(", ") : ""));

// os apelidos do apps.css apontam pros tokens do Nutri
ok(/--card:\s*var\(--nt-card\)/.test(src) && /--linha:\s*var\(--nt-borda\)/.test(src) &&
  /--cinza:\s*var\(--nt-txt-3\)/.test(src),
  "os nomes do apps.css (--card/--linha/--cinza) viram apelidos dos tokens --nt-*");
// o modo claro só redefine tokens --nt-* (o resto acompanha sozinho)
const blocoClaro = (src.match(/html\[data-tema="claro"\]\s*\{([^}]+)\}/) || [])[1] || "";
ok(/--nt-fundo:/.test(blocoClaro) && !/--fundo:/.test(blocoClaro.replace(/--nt-fundo:/g, "")),
  "o primeiro bloco do modo claro redefine só os tokens --nt-*");

// ---- 2) geometria e temas, no navegador ----
(async () => {
  const { chromium } = require("/opt/node22/lib/node_modules/playwright");
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const erros = [];
  p.on("pageerror", (e) => erros.push(e.message));
  await p.goto((process.env.BASE_URL || "http://127.0.0.1:8765") + "/nutricao.html");
  await p.evaluate(() => {
    localStorage.setItem("mtapp:ntSemConta", "1");
    localStorage.setItem("mtapp:ntStudio", JSON.stringify({
      config: { nome: "Consultório Tokens" }, pacientes: [], dietas: {}, alimentos: [], catalogoOff: {},
    }));
  });
  await p.reload();
  await p.waitForTimeout(600);

  const geo = await p.evaluate(() => {
    const card = document.querySelector("#vDashN .card");
    const h2 = card.querySelector("h2");
    const btn = document.querySelector(".btn.verde") || document.querySelector(".btn");
    const sec = document.querySelector(".btn.sec");
    const corpo = document.querySelector(".corpo");
    const gc = (el) => getComputedStyle(el);
    return {
      cardBorda: gc(card).borderTopWidth, cardSombra: gc(card).boxShadow,
      cardPad: gc(card).paddingTop,
      h2Tam: gc(h2).fontSize, h2Caixa: gc(h2).textTransform, h2Peso: gc(h2).fontWeight,
      btnAlt: gc(btn).minHeight, btnRaio: gc(btn).borderRadius,
      secBorda: sec ? gc(sec).borderTopWidth : "1px",
      corpoPad: gc(corpo).paddingLeft,
    };
  });
  ok(geo.cardBorda === "1px" && geo.cardSombra === "none", "card tem BORDA e não tem sombra (" + geo.cardBorda + " / " + geo.cardSombra + ")");
  ok(geo.cardPad === "17px", "padding do card é o do desenho (17px)");
  ok(geo.h2Tam === "15.5px" && geo.h2Caixa === "none" && +geo.h2Peso >= 800,
    "título de card é 15,5px em caixa mista e peso 800 — não rótulo cinza em CAIXA ALTA");
  ok(geo.btnAlt === "44px" && geo.btnRaio === "11px", "botão é retângulo de 44px com raio 11, não pílula de 46");
  ok(geo.secBorda === "1px", "o botão secundário tem borda");
  ok(geo.corpoPad === "26px", "a área de conteúdo respira 26px dos lados");

  const temas = await p.evaluate(() => {
    const raiz = document.documentElement;
    const le = (n) => getComputedStyle(raiz).getPropertyValue(n).trim();
    const fundoDe = () => getComputedStyle(document.body).backgroundColor;
    const escuro = { verde: le("--verde"), card: le("--nt-card"), apelido: le("--card"), fundo: fundoDe() };
    raiz.setAttribute("data-tema", "claro");
    const claro = { verde: le("--verde"), card: le("--nt-card"), apelido: le("--card"), fundo: fundoDe() };
    raiz.removeAttribute("data-tema");
    return { escuro, claro };
  });
  ok(temas.escuro.verde === "#16a34a" && temas.claro.verde === "#16a34a",
    "o verde da marca NÃO muda entre temas (#16a34a)");
  ok(temas.escuro.card === "#16241a" && temas.claro.card === "#ffffff",
    "o token de card troca de tema (" + temas.escuro.card + " → " + temas.claro.card + ")");
  ok(temas.escuro.apelido === temas.escuro.card && temas.claro.apelido === temas.claro.card,
    "o apelido --card do apps.css acompanha o token SOZINHO nos dois temas");
  ok(temas.escuro.fundo !== temas.claro.fundo, "o fundo do painel troca de tema (" + temas.escuro.fundo + " → " + temas.claro.fundo + ")");
  ok(erros.length === 0, "nenhum erro de página" + (erros.length ? " — " + erros[0] : ""));

  await b.close();
  console.log(falhas ? "\n💥 " + falhas + " falha(s)" : "\n🏁 TUDO PASSOU");
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
