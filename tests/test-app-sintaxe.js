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

// cronômetros de descanso contam pelo RELÓGIO (v666): decremento resta-- trava
// quando o navegador estrangula a aba em segundo plano — o deadline não
const tmrSrc = html.slice(html.indexOf("function iniciaTmr"), html.indexOf("function iniciaTmr") + 900);
const gdSrc = html.slice(html.indexOf("function gDescanso"), html.indexOf("function gRegua"));
ok(/fim=Date\.now\(\)\+sg\*1000/.test(tmrSrc) && !/resta--/.test(tmrSrc),
  "⏱ o cronômetro avulso é ancorado em Date.now (deadline), sem resta--");
ok(/fim=Date\.now\(\)\+sg\*1000/.test(gdSrc) && !/resta--/.test(gdSrc),
  "⏱ o descanso do treino guiado idem — e recalcula ao voltar do 2º plano");
ok(html.indexOf("function avisaFim") > -1 && /avisaFim\(/.test(gdSrc),
  "🔔 fim de descanso com o app escondido dispara a notificação local (avisaFim)");

// sem plano e sem wods/cardio o app também tem que montar (aluno novinho)
const D2 = Object.assign({}, D, { fichasApp: null, wodsApp: [], cardiosApp: [], planoApp: null, qa: null, treino: "", plApp: null, sessApp: [], feedLigado: false });
let html2 = "";
try { html2 = self.MT_APP_ALUNO.monta(D2); } catch (e) { ok(false, "monta(D vazio) não pode explodir — " + e.message); }
[...html2.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach((m, i) => {
  let erro = "";
  try { new Function(m[1]); } catch (e) { erro = e.message; }
  ok(!erro, "aluno sem treino: script " + (i + 1) + " válido" + (erro ? " — " + erro : ""));
});

// guiado (v670): aquecimento e alternativas entram no player — o GUIA ganha
// as chaves al/aq (por ÚLTIMO, por causa da janela de 500 chars do teste de
// escape) e o markup usa .gaq/.galt com o .altbtn delegado de sempre
ok(/class='gaq'/.test(html) && /class='galt'/.test(html) && /"al":\["Supino com halteres"\]/.test(html),
  "🏋️ o treino guiado leva o aquecimento (.gaq) e as alternativas (.galt) no GUIA");

// esforço e batimento (v668): o card devolve ptrpe/ptfc pro aluno, com as
// regras honestas — batimento só com dado, zona só com idade
ok(html.indexOf("id='esfBox'") > -1 && html.indexOf("function pintaEsforco") > -1 &&
  html.indexOf("window.__pintaEsforco=pintaEsforco") > -1,
  "📈 a Evolução ganha o card Esforço e batimento (esfBox + gancho de teste)");
ok(/COMO OS TREINOS PESARAM/.test(html) && /Diga sua idade no card da cinta/.test(html),
  "as regras honestas viajam no app: RPE com convite e zona só com idade");

// primeiro dia (v667): o card só nasce pro aluno SEM treino; e a videoteca
// vira card endereçável + linha no menu ☰ — sem vídeo publicado, nada nasce
ok(/id='primeiroDia'/.test(html2) && !/id='primeiroDia'/.test(html),
  "🌱 o card do primeiro dia só existe no app do aluno sem treino");
const D3 = Object.assign({}, D, { vidsApp: [{ t: "Mobilidade de quadril", c: "Geral", u: "" }] });
let html3 = "";
try { html3 = self.MT_APP_ALUNO.monta(D3); } catch (e) { ok(false, "monta(D com videoteca) não pode explodir — " + e.message); }
ok(/id='vidCard'/.test(html3) && /Conteúdos e vídeos/.test(html3) && !/Conteúdos e vídeos/.test(html),
  "🎬 com videoteca: card #vidCard + linha no ☰; sem videoteca, nem a linha nasce");

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

/* ---- app do PACIENTE (NUTRI): a partir da v661 o código mora em
 * app/nutri-builder.js, e vale a MESMA regra — checar a sintaxe do builder
 * não basta, o que vale é montar o app e fazer parse de cada <script>. */
console.log("\nSintaxe do app do paciente (nutri-builder montado em node):");
require("../app/nutri-skin.js");
require("../app/nutri-builder.js");
const DN = {
  tipo: "nutri",
  p: { id: "p1", nome: "Marina Souza", appTokenN: "tok-n", metaSemana: 5 },
  stamp: new Date().toISOString(), ver: "mt-vteste",
  studio: "Nutri Teste", zapN: "31999990000",
  botApp: { oi: "Oi!", ops: [{ r: "Remarcar", t: "Pode escrever aqui" }] },
  COR: "#16a34a", COR2: "#15803d", CORC: "#86efac", CORTHEME: "#14532d", CORL: "#4ade80",
  CORG2: "#22c55e", CORB: "#bbf7d0", CORD: "#0e2417", CORA: "rgba(22,163,74,.22)", LOGO: "",
  refs: [{ id: "r1", h: "08:00", t: "Café da manhã", k: 320, pt: 12, cb: 40, gd: 9,
    itens: [{ n: "Pão integral", q: "2 × fatia", k: 140 }] }],
  alvo: { alvo: 1800 }, macros: { prot: 120, carb: 180, gord: 50 }, aguaMl: 2500,
  nuvem: { u: "https://x.supabase.co", k: "anon" }, feedLigado: true,
  avs: [{ data: "2026-08-01", peso: 70, gordura: 28, cintura: 80, quadril: 100, braco: 30, coxa: 55 }],
  aldb: [{ n: "Arroz", k: 130, p: "100 g", pt: 2, cb: 28, gd: 0 }],
  pixApp: { code: "000201x", qr: "", v: 150 }, mural: ["Aviso do consultório"],
};
let htmlN = "";
try { htmlN = self.MT_APP_NUTRI.monta(DN); } catch (e) { ok(false, "monta(D) do nutri não pode explodir — " + e.message); }
ok(htmlN.length > 50000, "app do paciente montado com tamanho de gente grande (" + htmlN.length + " bytes)");
const scriptsN = [...htmlN.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
ok(scriptsN.length >= 1, "achou os <script> embutidos (" + scriptsN.length + ")");
scriptsN.forEach((s, i) => {
  let erro = "";
  try { new Function(s); } catch (e) { erro = e.message; }
  ok(!erro, "nutri: script " + (i + 1) + " tem sintaxe válida" + (erro ? " — " + erro : ""));
});
ok(htmlN.indexOf("__appNutri") > -1 && htmlN.indexOf("Marina") > -1 && htmlN.indexOf("fdListaN") > -1,
  "o app leva o gancho __appNutri, o nome do paciente e a Comunidade ligada");
ok(htmlN.indexOf("font-variant-numeric:tabular-nums") > -1 && htmlN.indexOf(".nitemn span{font-size:9.5px") > -1,
  "a skin do redesenho (nutri-skin) vai embutida no app publicado");

// paciente novinho: sem dieta, sem nuvem, sem nada — também tem que montar
const DN2 = { tipo: "nutri", p: { nome: "Novo" }, studio: "Nutri", refs: [], aldb: [], avs: [], mural: [] };
let htmlN2 = "";
try { htmlN2 = self.MT_APP_NUTRI.monta(DN2); } catch (e) { ok(false, "monta(D vazio) do nutri não pode explodir — " + e.message); }
[...htmlN2.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach((m, i) => {
  let erro = "";
  try { new Function(m[1]); } catch (e) { erro = e.message; }
  ok(!erro, "paciente sem dieta: script " + (i + 1) + " válido" + (erro ? " — " + erro : ""));
});
ok(htmlN2.indexOf("fdListaN") < 0 && htmlN2.indexOf("Meu login") < 0,
  "sem nuvem o app sai sem Comunidade e sem o card Meu login — nada de fingir recurso");

console.log(falhas ? "\n💥 " + falhas + " falha(s)" : "\n🏁 TUDO PASSOU");
process.exit(falhas ? 1 : 0);
