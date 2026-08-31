/* TORQUE ON — gera as imagens REAIS da Central de ajuda (v708).
 *
 * Abre as DEMOS (painel e app do aluno) no Playwright, desenha por cima do
 * elemento citado um ANEL roxo + SETA (com contorno branco, pra aparecer em
 * qualquer fundo) e recorta um screenshot em volta. As imagens vão pra
 * assets/ajuda/*.jpg e a Ajuda carrega do site com loading=lazy — elas NÃO
 * entram no precache do sw.js (offline a figura some via onerror, o texto
 * fica).
 *
 * Uso (servidor 8765 no ar): node tools/ajuda/gera-shots.js
 * ⚠️ Regere quando o visual mudar de verdade — imagem velha ensina errado.
 */
const fs = require("fs");
const path = require("path");
const PW = "/opt/node22/lib/node_modules/playwright";
const { chromium } = require(fs.existsSync(PW) ? PW : "playwright");
const EXEC = "/opt/pw-browsers/chromium";
const RAIZ = path.join(__dirname, "..", "..");
const DEST = path.join(RAIZ, "assets", "ajuda");
const BASE = "http://127.0.0.1:8765";

// desenhado DENTRO da página, em coordenadas de CSS
const MARCA = (sel) => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) return null;
  el.scrollIntoView({ block: "center" });
  const r = el.getBoundingClientRect();
  const w = document.createElement("div");
  w.id = "__ajmarca";
  w.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:99999;";
  const anel = document.createElement("div");
  anel.style.cssText = "position:fixed;left:" + (r.left - 7) + "px;top:" + (r.top - 7) +
    "px;width:" + (r.width + 14) + "px;height:" + (r.height + 14) +
    "px;border:3.5px solid #7c3aed;border-radius:14px;box-shadow:0 0 0 3px rgba(255,255,255,.85),0 0 26px rgba(124,58,237,.65);";
  w.appendChild(anel);
  // a seta entra por cima-direita apontando pro canto do anel
  const sx = r.right + 4, sy = r.top - 8;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "86"); svg.setAttribute("height", "86");
  svg.setAttribute("viewBox", "0 0 86 86");
  svg.style.cssText = "position:fixed;left:" + (sx - 12) + "px;top:" + (sy - 62) + "px;overflow:visible;";
  svg.innerHTML = "<g fill='none' stroke-linecap='round' stroke-linejoin='round'>" +
    "<path d='M62 8 C 40 14, 22 34, 14 58' stroke='#fff' stroke-width='11'/>" +
    "<path d='M62 8 C 40 14, 22 34, 14 58' stroke='#7c3aed' stroke-width='6'/>" +
    "<path d='M8 42 L14 60 L30 50' stroke='#fff' stroke-width='11' fill='none'/>" +
    "<path d='M8 42 L14 60 L30 50' stroke='#7c3aed' stroke-width='6' fill='none'/></g>";
  w.appendChild(svg);
  document.body.appendChild(w);
  return { x: r.left, y: r.top, w: r.width, h: r.height };
})()`;

async function shot(p, arq, sel, opts = {}) {
  const pos = await p.evaluate(MARCA(sel));
  if (!pos) { console.log("  ✗ " + arq + ": seletor não achado (" + sel + ")"); return false; }
  await p.waitForTimeout(150);
  const vw = p.viewportSize();
  const pad = opts.pad || 130;
  const clip = {
    x: Math.max(0, pos.x - pad),
    y: Math.max(0, pos.y - pad),
  };
  clip.width = Math.min(vw.width - clip.x, pos.w + pad * 2);
  clip.height = Math.min(vw.height - clip.y, pos.h + pad * 2);
  await p.screenshot({ path: path.join(DEST, arq), clip, type: "jpeg", quality: 82 });
  await p.evaluate(() => { const m = document.getElementById("__ajmarca"); if (m) m.remove(); });
  const kb = Math.round(fs.statSync(path.join(DEST, arq)).size / 1024);
  console.log("  ✓ " + arq + " (" + kb + " KB)");
  return true;
}

(async () => {
  fs.mkdirSync(DEST, { recursive: true });
  const b = await chromium.launch({ executablePath: fs.existsSync(EXEC) ? EXEC : undefined, args: ["--no-sandbox"] });
  let feitos = 0, esperados = 0;
  const conta = (ok) => { esperados++; if (ok) feitos++; };

  // ---------- PAINEL (via demo, computador 1280) ----------
  {
    const p = await (await b.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 })).newPage();
    await p.goto(BASE + "/demo-personal.html");
    await p.click("#btnDemo");
    await p.waitForURL(/personal\.html/);
    await p.waitForTimeout(2500);
    const aba = async (a) => { await p.evaluate((x) => document.querySelector('#abas [data-a="' + x + '"]').click(), a); await p.waitForTimeout(900); };

    conta(await shot(p, "p-novo-aluno.jpg", "#dNovoAluno"));
    conta(await shot(p, "p-resolver.jpg", "#dashResolver .btn", { pad: 170 }));
    await aba("agenda");
    conta(await shot(p, "p-marcar.jpg", "#agMarcar"));
    conta(await shot(p, "p-semana-mes.jpg", "#agVisTopo", { pad: 150 }));
    // as ações da sessão abertas na grade (v704)
    await p.evaluate(() => { const c = document.querySelector("#agGrade [data-smais]"); if (c) c.click(); });
    await p.waitForTimeout(250);
    conta(await shot(p, "p-sessao-acoes.jpg", "#agGrade .ses-acoes:not([hidden])", { pad: 150 }));
    await aba("alunos");
    conta(await shot(p, "p-abrir-ficha.jpg", "#vAlunos [data-abreperfil]", { pad: 150 }));
    await p.context().close();
  }

  // ---------- APP DO ALUNO (demo, celular 390) ----------
  {
    const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
    await p.goto(BASE + "/demo-aluno.html");
    await p.waitForTimeout(1600);
    conta(await shot(p, "a-treinei.jpg", "#btnFeito", { pad: 110 }));
    conta(await shot(p, "a-menu.jpg", "#navMenuApp", { pad: 120 }));
    // o menu aberto, apontando o Questionários (o sininho que o aluno mais perde)
    await p.evaluate(() => document.getElementById("navMenuApp").click());
    await p.waitForTimeout(450);
    conta(await shot(p, "a-quest.jpg", "#mgQaBt", { pad: 120 }));
    await p.evaluate(() => { const v = document.querySelector("#menuApp [data-msec='inicio']"); if (v) v.click(); });
    await p.waitForTimeout(400);
    // a gaveta da ficha do dia na área Treinos
    await p.evaluate(() => { const b9 = document.querySelector("#navApp [data-msec='treino']"); if (b9) b9.click(); });
    await p.waitForTimeout(500);
    conta(await shot(p, "a-ficha.jpg", "#trFichasWrap .fichabox[open] summary, #trFichasWrap .fichabox summary", { pad: 110 }));
    // o convite do check-in na área Questionários
    await p.evaluate(() => { if (window.__qaPend || true) { const el = document.querySelectorAll("#navApp .nitem"); } });
    await p.evaluate(() => document.getElementById("navMenuApp").click());
    await p.waitForTimeout(350);
    await p.evaluate(() => { const q = document.querySelector("#menuApp [data-msec='quest']"); if (q) q.click(); });
    await p.waitForTimeout(500);
    conta(await shot(p, "a-checkin.jpg", "#ckAbrir, #qsTopo", { pad: 110 }));
    await p.context().close();
  }

  await b.close();
  console.log(feitos + " de " + esperados + " imagens geradas em assets/ajuda/");
  process.exit(feitos === esperados ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
