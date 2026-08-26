/* Os tokens do painel — a regra nº 1 do handoff: NENHUMA COR NOVA.
 *
 * Por que esta suíte existe: nas tentativas anteriores o painel saiu diferente
 * do desenho principalmente por cor inventada na hora, porque o valor certo não
 * estava à mão. Agora os valores estão colados no `:root` com os nomes do
 * próprio handoff (`--pt-*`), e este teste reprova qualquer hex que apareça no
 * CSS do painel sem estar na paleta.
 *
 * Destaque e estado são TINTA TRANSPARENTE sobre um token
 * (`rgba(124,58,237,.18)`), nunca um hex novo — por isso o teste só olha hex.
 *
 * Os nomes `--tk-*`, que o painel já usava em centenas de lugares, são
 * APELIDOS dos `--pt-*`. Apelido de variável CSS se resolve na hora do USO,
 * então o modo claro mora num lugar só: redefinir `--pt-txt-3` muda o
 * `--tk-tx3` junto.
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const ARQ = path.join(__dirname, "..", "personal.html");

let ok = 0, falhas = 0;
function t(cond, nome) {
  if (cond) { ok++; console.log("  ✅ " + nome); }
  else { falhas++; console.log("  ❌ " + nome); }
}

/* A paleta do handoff (design_handoff_painel_personal/tokens-painel.css).
 * Escura + clara + o branco/preto puros que todo tema usa. */
const PALETA = `
  0d0c10 141218 121016 14121a 1d1a24 221f2b 24202e
  26222f 322e3d 2a2536 3a3546
  f2f0f6 cfcbdb a9a4b5 8a8695 6e6a78
  7c3aed 6d28d9 a78bfa c4b5fd 241a3d 4c1d95 2b1259
  4ade80 f87171 fb923c fcd34d
  fff ffffff 000 000000
  f4f3f7 e4e1eb d9d5e3 e3e0ec 191622 443f52 4a4657 6c6678 77718a
  15803d b91c1c c2410c
`.trim().split(/\s+/);
/* Tons que o painel usa e o handoff não nomeia — cada um precisa de motivo.
 * Não é lugar pra esconder cor inventada: são degraus da MESMA escada. */
const EXTRAS = {
  "1b1822": "superfície entre card e elevado (--tk-sup3)",
  "17151d": "superfície de card discreto (--tk-sup4)",
  "e6e2f2": "texto quase branco do topo (--tk-tx1)",
  "4b4855": "texto apagado, um degrau abaixo do --pt-txt-5 (--tk-tx6)",
  "fca5a5": "vermelho claro de texto sobre fundo escuro (--tk-erro2)",
  "fbbf24": "âmbar de atenção secundária (--tk-aten2)",
  "991b1b": "vermelho do modo claro, um degrau (--tk-erro2 claro)",
  "b45309": "âmbar do modo claro (--tk-aten2 claro)",
  "faf9fc": "branco quebrado do modo claro (--tk-sup4 claro)",
  "b5b0c0": "cinza claro do modo claro (--tk-tx6 claro)",
};
const PERMITIDO = new Set(PALETA.map((x) => x.toLowerCase()).concat(Object.keys(EXTRAS)));

/* Os valores que o handoff crava. Se um destes mudar sem o handoff mudar,
 * o painel deixou de ser o desenho. */
const ESPERADO = {
  "--pt-fundo": "#0d0c10", "--pt-card": "#141218", "--pt-caixa": "#121016",
  "--pt-gaveta": "#14121a", "--pt-elev": "#1d1a24", "--pt-trilha": "#221f2b",
  "--pt-toggle-off": "#24202e", "--pt-borda": "#26222f", "--pt-hairline": "#1d1a24",
  "--pt-borda-forte": "#322e3d", "--pt-borda-gaveta": "#2a2536", "--pt-borda-toggle": "#3a3546",
  "--pt-txt": "#f2f0f6", "--pt-txt-2": "#cfcbdb", "--pt-txt-3": "#a9a4b5",
  "--pt-txt-4": "#8a8695", "--pt-txt-5": "#6e6a78",
  "--pt-roxo": "#7c3aed", "--pt-roxo-esc": "#6d28d9", "--pt-roxo-claro": "#a78bfa",
  "--pt-roxo-clar2": "#c4b5fd", "--pt-roxo-avatar": "#241a3d", "--pt-roxo-fundo": "#4c1d95",
  "--pt-roxo-prof": "#2b1259",
  "--pt-ok": "#4ade80", "--pt-erro": "#f87171", "--pt-atencao": "#fb923c", "--pt-recorde": "#fcd34d",
  "--pt-h-bt": "44px", "--pt-h-bt-2": "38px", "--pt-h-bt-3": "36px", "--pt-h-chip": "32px",
};

(async () => {
  const src = fs.readFileSync(ARQ, "utf8");

  console.log("Nenhuma cor nova (a regra nº 1 do handoff):");
  {
    // 1) o <style> do painel
    const ini = src.indexOf("<style>");
    const css = src.slice(ini, src.indexOf("</style>", ini));
    const fora = {};
    (css.match(/#[0-9a-fA-F]{3,8}\b/g) || []).forEach((h) => {
      const v = h.slice(1).toLowerCase();
      // hex de 8 dígitos é cor + transparência: escreva rgba(), que se lê
      if (!PERMITIDO.has(v)) fora[h] = (fora[h] || 0) + 1;
    });
    const lista = Object.keys(fora);
    if (lista.length) console.log("     fora da paleta: " + lista.join(", "));
    t(lista.length === 0, "o <style> do painel só usa cor da paleta (" + lista.length + " fora)");

    // 2) os style="" do HTML estático (fora de <script>, que é código)
    const semJs = src.replace(/<script[\s\S]*?<\/script>/g, "");
    const foraIn = {};
    (semJs.match(/style="[^"]*"/g) || []).forEach((at) => {
      (at.match(/#[0-9a-fA-F]{3,8}\b/g) || []).forEach((h) => {
        const v = h.slice(1).toLowerCase();
        if (!PERMITIDO.has(v)) foraIn[h] = (foraIn[h] || 0) + 1;
      });
    });
    const listaIn = Object.keys(foraIn);
    if (listaIn.length) console.log("     fora da paleta (inline): " + listaIn.join(", "));
    t(listaIn.length === 0, "os style= do HTML também (" + listaIn.length + " fora)");
  }

  console.log("\nOs valores são os do handoff:");
  {
    const erradas = [];
    Object.keys(ESPERADO).forEach((k) => {
      const m = src.match(new RegExp(k.replace(/-/g, "\\-") + ":\\s*([^;]+);"));
      if (!m) { erradas.push(k + " — não existe"); return; }
      if (m[1].trim().toLowerCase() !== ESPERADO[k].toLowerCase()) {
        erradas.push(k + " = " + m[1].trim() + " (o handoff diz " + ESPERADO[k] + ")");
      }
    });
    if (erradas.length) erradas.slice(0, 8).forEach((e) => console.log("     " + e));
    t(erradas.length === 0, "os " + Object.keys(ESPERADO).length + " tokens do handoff batem valor a valor");
    t(/--pt-sel:\s*rgba\(124,\s*58,\s*237,\s*\.18\)/.test(src),
      "estado em foco é tinta transparente sobre o roxo, não cor nova");
    t(/--pt-erro-selo:\s*rgba\(248,\s*113,\s*113,\s*\.18\)/.test(src),
      "selo colorido é fundo .18 + texto na cor cheia (regra nº 2)");
  }

  console.log("\nOs apelidos --tk-* apontam pros tokens (um lugar só pro tema):");
  {
    const alias = (src.match(/--tk-[a-zA-Z0-9]+:\s*var\(--pt-[a-z0-9-]+\)/g) || []).length;
    t(alias >= 18, "a maioria dos nomes antigos virou apelido de var(--pt-…) (" + alias + ")");
    // o bloco do tema claro não pode redefinir apelido que já segue o --pt-*
    const claro = src.slice(src.indexOf('html[data-tema="claro"] {'));
    const fim = claro.indexOf("\n  }");
    const dentro = claro.slice(0, fim);
    const repetidos = (dentro.match(/--tk-(sup|sup2|bd|bd2|bd3|bd4|trilha|tx|tx2|tx3|tx4|tx5|ok|erro|aten|swBg|swBd|roxoFraco|roxoTx|roxoTx2):/g) || []);
    if (repetidos.length) console.log("     redefinidos à toa: " + repetidos.join(" "));
    t(repetidos.length === 0, "o tema claro não repete apelido que já acompanha sozinho");
  }

  // ------------------------------------------------- o navegador confirma
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => {
    localStorage.setItem("mtapp:perfil", JSON.stringify({ nome: "Raphael" }));
    localStorage.setItem("mtapp:ptSemConta", "1");
  });
  const p = await ctx.newPage();
  await p.goto(BASE + "/personal.html");
  await p.waitForTimeout(700);

  const le = () => p.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    return {
      card: v("--pt-card"), cardApelido: v("--tk-sup"),
      txt3: v("--pt-txt-3"), txt3Apelido: v("--tk-tx3"),
      roxo: v("--pt-roxo"), fundo: v("--pt-fundo"),
    };
  });

  console.log("\nNo navegador, escuro e claro:");
  const esc = await le();
  t(esc.card === esc.cardApelido && esc.txt3 === esc.txt3Apelido,
    "no escuro o apelido entrega o mesmo valor do token");
  await p.evaluate(() => document.getElementById("btnTemaPt").click());
  await p.waitForTimeout(300);
  const cla = await le();
  t(cla.card !== esc.card && cla.card === cla.cardApelido,
    "no claro o token muda e o apelido acompanha SOZINHO (" + esc.card + " → " + cla.card + ")");
  t(cla.txt3 === cla.txt3Apelido && cla.txt3 !== esc.txt3,
    "o texto também (" + esc.txt3 + " → " + cla.txt3 + ")");
  t(cla.roxo === esc.roxo && /7c3aed/i.test(cla.roxo),
    "o roxo da marca NÃO muda entre temas (" + cla.roxo + ")");
  t(cla.fundo !== esc.fundo, "o fundo do painel troca de tema (" + esc.fundo + " → " + cla.fundo + ")");

  /* ---------------------------------------------------------------
   * A CAMADA DE BAIXO — o apps.css e compartilhado com o portal e o Nutri,
   * e o que ele impoe (card com sombra e sem borda, h2 minusculo em CAIXA
   * ALTA, botao em pilula de 46px) reaparecia nas 16 telas de uma vez. Foi
   * o motivo de o redesenho continuar "diferente" mesmo com cada tela feita.
   * Medimos o que o professor VE — a geometria calculada —, nunca a classe.
   * ------------------------------------------------------------- */
  await p.evaluate(() => document.getElementById("btnTemaPt").click()); // volta pro escuro
  await p.waitForTimeout(250);
  console.log("\nA base que o handoff refaz (card, titulo, botao):");
  const base = await p.evaluate(() => {
    const som = (s) => { const d = document.createElement("div"); d.className = s; d.style.position = "absolute";
      d.style.left = "-9999px"; document.body.appendChild(d); const c = getComputedStyle(d);
      const r = { bd: c.borderTopWidth, sombra: c.boxShadow, pad: c.paddingTop, raio: c.borderTopLeftRadius,
                  alt: c.minHeight, fs: c.fontSize, cx: c.textTransform, bg: c.backgroundColor, cor: c.color };
      d.remove(); return r; };
    const h2 = (() => { const d = document.createElement("div"); d.className = "card";
      d.style.position = "absolute"; d.style.left = "-9999px"; d.innerHTML = "<h2>x</h2>";
      document.body.appendChild(d); const c = getComputedStyle(d.firstChild);
      const r = { fs: c.fontSize, peso: c.fontWeight, cx: c.textTransform, cor: c.color }; d.remove(); return r; })();
    return { card: som("card"), btn: som("btn"), sec: som("btn sec"), zap: som("btn whats"), h2: h2,
             corpo: getComputedStyle(document.querySelector(".corpo")).paddingLeft };
  });
  t(parseFloat(base.card.bd) >= 1 && base.card.sombra === "none",
    "o card tem BORDA e nao tem sombra (o apps.css faz o contrario) — " + base.card.bd + " / " + base.card.sombra);
  t(Math.round(parseFloat(base.card.pad)) === 17, "padding do card e o do desenho (" + base.card.pad + ")");
  t(parseFloat(base.h2.fs) >= 15 && base.h2.cx === "none" && base.h2.peso === "800",
    "titulo de card e 15,5px em caixa mista, nao rotulo cinza em CAIXA ALTA (" +
    base.h2.fs + " / " + base.h2.cx + " / " + base.h2.peso + ")");
  t(Math.round(parseFloat(base.btn.raio)) === 11 && Math.round(parseFloat(base.btn.alt)) === 44,
    "botao e retangulo de 44px com raio 11, nao pilula de 46 (" + base.btn.raio + " / " + base.btn.alt + ")");
  t(parseFloat(base.sec.bd) >= 1, "o botao secundario tem borda (" + base.sec.bd + ")");
  t(base.zap.bg === base.sec.bg, "o botao de WhatsApp e secundario com tinta verde, nao verde chapado");
  t(Math.round(parseFloat(base.corpo)) === 26, "a area de conteudo respira 26px dos lados (" + base.corpo + ")");

  await b.close();
  console.log("\n" + ok + " ok, " + falhas + " falhas");
  process.exit(falhas ? 1 : 0);
})();
