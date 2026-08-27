/* O app do aluno é uma string gigante de HTML+JS montada por concatenação —
 * uma aspa errada quebra o app INTEIRO e nenhum teste estático via isso
 * (foi assim que um placar novo derrubou o app em desenvolvimento). Este
 * teste monta o app em node puro e faz o parse de cada <script> embutido. */
process.env.TZ = "America/Sao_Paulo";
let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? "  ✅ " : "  ❌ ") + msg); if (!cond) falhas++; };

global.self = global;
require("../app/aluno-skin.js");
require("../app/aluno-builder.js");

const D = {
  a: { id: "a1", nome: "Marina Souza", appTokenP: "tok-x", foto: "", altura: 165 },
  st: { config: { mural: ["Aviso do studio"] }, alunos: [], desafio: null },
  studio: "Studio Teste",
  stamp: new Date().toISOString(),
  S: { fmtData: (x) => String(x || ""), todayISO: () => new Date().toISOString().slice(0, 10), uid: () => "u1" },
  fichasApp: [{ titulo: "A — Peito e tríceps", capa: "", itens: [
    { nome: "Supino reto", series: "4", reps: "12", descanso: 60, video: "", desc: "d", obs: "o", grupo: "Peito", alts: ["Supino com halteres"] },
    { nome: "Tríceps na corda", series: "3", reps: "15", descanso: 45, video: "", desc: "", obs: "", grupo: "Tríceps", alts: [] },
  ] }],
  wodsApp: [{ id: "w1", nome: "Chipper", tipo: "amrap", min: 20, resumo: "AMRAP 20 min", aq: "aq", obs: "obs", movs: [{ q: "10", n: "burpees" }] }],
  cardiosApp: [{ id: "c1", nome: "Rodagem", mod: "corrida", tipo: "continuo", dist: 5, tempo: 30, pace: "6:00" }],
  planoApp: { "1": { tp: "ficha", i: 0, n: "A — Peito e tríceps" } },
  sessApp: [{ d: "2026-01-05", h: "08:00" }], vidsApp: [], qa: { nome: "Semanal", ps: [
    { s: "S", texto: "Como dormiu?", tipo: "emoji", ops: [{ e: "🙂", r: "Bem", p: 2 }], mm: false },
    { s: "D", texto: "Dor?", tipo: "linear", ops: [], mm: true },
    { s: "", texto: "Algo mais?", tipo: "texto", ops: [], mm: false },
  ], desde: "2020-01-01", repete: true, enviadoEm: "e1" },
  ctApp: { diaVenc: 5 }, plApp: { nome: "Mensal", valor: 120, diaVenc: 5, linkRec: "" }, pixApp: null, svApp: [],
  treino: "", t2: {}, fichaVenceApp: "2026-12-01",
  fexs: [{ n: "Supino reto", s: 4 }],
  guiaFichasP: [{ n: "A — Peito e tríceps", it: [{ e: "Supino reto", s: 4, r: "12", d: 60, v: "" }] }],
  aqPorFicha: [[["Marcha no lugar", "60s"], ["Flexão na parede", "40s"]]],
  raioX: [{ g: "Peito", s: 4 }, { g: "Tríceps", s: 3 }],
  ve: () => true, menuOculta: [], feedLigado: true, avs: [], botApp: null, atualizador: "",
};

console.log("Sintaxe do app do aluno (montado em node):");
let html = "";
try { html = self.MT_APP_ALUNO.monta(D); } catch (e) { ok(false, "monta(D) não pode explodir — " + e.message); }
ok(html.length > 50000, "app montado com tamanho de gente grande (" + html.length + " bytes)");

const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

/* ⚠️ NOME DE FUNÇÃO REPETIDO NO BLOCO DA CORRIDA.
 * Da v602 até a v642 o mapa ficou preto porque nasceu uma segunda crTile(v,r)
 * (o tile do resumo, que devolve HTML) no mesmo escopo da crTile(z,x,y) do
 * mapa. Declaração de função sobe pro topo e a última vence: desenhaCv passou
 * a receber texto no lugar do ladrilho e nunca mais desenhou rua. Não deu erro
 * de sintaxe, não deu erro no console — o mapa só ficou preto, por 40 versões.
 *
 * A varredura é limitada aos nomes começados em cr ou hr de propósito: são as
 * ~60 funções do bloco de corrida e batimento, todas no MESMO escopo, que é
 * onde a colisão dói. Nomes genéricos (pinta, envia, avanca) se repetem
 * legitimamente dentro de IIFEs separadas e virariam falso positivo. */
const nomesCr = {};
for (const m of require("fs").readFileSync(__dirname + "/../app/aluno-builder.js", "utf8")
  .matchAll(/function ((?:cr|hr)[A-Za-z_$][\w$]*)\s*\(/g)) nomesCr[m[1]] = (nomesCr[m[1]] || 0) + 1;
const crRepetidos = Object.entries(nomesCr).filter(([, n]) => n > 1).map(([k, n]) => k + " x" + n);
ok(crRepetidos.length === 0,
  "nenhuma função cr… ou hr… declarada duas vezes (a segunda apaga a primeira e o mapa morre calado)" +
  (crRepetidos.length ? " — " + crRepetidos.join(", ") : ""));
ok(scripts.length >= 2, "achou os <script> embutidos (" + scripts.length + ")");
scripts.forEach((s, i) => {
  let erro = "";
  try { new Function(s); } catch (e) { erro = e.message; }
  ok(!erro, "script " + (i + 1) + " tem sintaxe válida" + (erro ? " — " + erro : ""));
});

// sem plano e sem wods/cardio o app também tem que montar (aluno novinho)
const D2 = Object.assign({}, D, { fichasApp: null, wodsApp: [], cardiosApp: [], planoApp: null, qa: null, treino: "", plApp: null, sessApp: [], feedLigado: false });
let html2 = "";
try { html2 = self.MT_APP_ALUNO.monta(D2); } catch (e) { ok(false, "monta(D vazio) não pode explodir — " + e.message); }
[...html2.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach((m, i) => {
  let erro = "";
  try { new Function(m[1]); } catch (e) { erro = e.message; }
  ok(!erro, "aluno sem treino: script " + (i + 1) + " válido" + (erro ? " — " + erro : ""));
});

// Cor em SVG: atributo NAO entende var(), so a propriedade CSS entende.
// fill='var(--corc)' vira valor invalido e o navegador cai no inicial:
// stroke none (a linha do grafico some) e fill preto (o ponto some no fundo
// escuro). Foi assim que a curva do peso e o anel de XP sumiram. O jeito
// certo e style='stroke:var(--corc)'.
const svgVar = [];
[...html.matchAll(/(fill|stroke)=['"]/g)].forEach((m) => {
  const jan = html.slice(m.index + m[0].length, m.index + m[0].length + 70);
  const iv = jan.indexOf("var(--");
  if (iv < 0) return;
  const antes = jan.slice(0, iv);
  // ja passou pro proximo atributo/tag, ou a cor entra por style= (o certo)
  if (/[>]/.test(antes) || /style\s*=/.test(antes)) return;
  svgVar.push(m[1] + "=" + jan.slice(0, iv + 22).replace(/\s+/g, " "));
});
ok(svgVar.length === 0, "nenhuma cor de SVG entra por atributo com var() — atributo nao le variavel CSS" +
  (svgVar.length ? " — achei " + svgVar.length + ": " + svgVar.slice(0, 3).join(" | ") : " (0)"));

console.log(falhas ? "\n💥 " + falhas + " falha(s)" : "\n🏁 TUDO PASSOU");
process.exit(falhas ? 1 : 0);
