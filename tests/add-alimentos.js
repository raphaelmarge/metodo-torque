/* Anexa alimentos novos ao banco, com dedupe por nome (ignora maiúscula,
 * acento e espaço duplo) e aviso quando o nome é quase o mesmo de um que já
 * existe — com 1300+ itens, o problema deixou de ser nome igual e passou a ser
 * o MESMO alimento escrito de outro jeito, que suja a busca do nutricionista.
 * Uso: node tests/add-alimentos.js candidatos.json */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const ARQ = path.join(RAIZ, "assets/alimentos-db.js");

const chave = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// palavras que não distinguem um alimento do outro
const VAZIAS = new Set(["de", "da", "do", "com", "sem", "e", "em", "a", "o", "no", "na", "ao", "para", "pra", "tipo", "g", "ml"]);
const tokens = (s) => chave(s).split(" ").filter((w) => w.length > 2 && !VAZIAS.has(w));

global.self = {};
require(ARQ);
const banco = self.MT_ALIMENTOS;
const vistos = new Map();
const porToken = banco.map((a) => [a.n, new Set(tokens(a.n))]);
banco.forEach((a) => vistos.set(chave(a.n), a.n));

const CATS = new Set(banco.map((a) => a.c));

const entrada = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const novos = [];
const recusados = [];

function parecido(nome) {
  const t = new Set(tokens(nome));
  if (!t.size) return null;
  for (const [n, tb] of porToken) {
    let iguais = 0;
    for (const w of t) if (tb.has(w)) iguais++;
    const prop = iguais / Math.max(t.size, tb.size);
    if (prop >= 0.75) return [n, Math.round(prop * 100)];
  }
  return null;
}

for (const c of entrada) {
  const n = String(c.n || "").trim();
  const cat = String(c.c || "").trim();
  const p = String(c.p || "").trim();
  const num = (v) => (typeof v === "number" && isFinite(v) && v >= 0 ? v : null);
  const k = num(c.k), pt = num(c.pt), cb = num(c.cb), g = num(c.g);
  if (!n || !cat || !p) { recusados.push([n, "campo de texto faltando"]); continue; }
  if (k === null || pt === null || cb === null || g === null) { recusados.push([n, "macro faltando ou inválido"]); continue; }
  if (!CATS.has(cat)) { recusados.push([n, "categoria nova: " + cat + " (confira se é proposital)"]); continue; }
  /* Coerência: kcal tem que bater com os macros (4/4/9) com folga de 25%.
   * Bebida alcoólica é a exceção honesta: o álcool tem 7 kcal por grama e não
   * aparece em proteína, carboidrato nem gordura, então a conta fecha mais
   * alta de propósito — é assim que a cerveja e a caipirinha já estão no banco. */
  const alcool = /cerveja|chopp?e?|vinho|espumante|cacha[çc]a|whisky|vodka|gin|licor|caipir|drink|destilado|sidra|saqu[êe]|rum|aperol|negroni/i.test(n);
  const calc = pt * 4 + cb * 4 + g * 9;
  if (!alcool && k > 0 && Math.abs(calc - k) > Math.max(30, k * 0.25)) {
    recusados.push([n, "kcal não bate com os macros (" + k + " informado x " + Math.round(calc) + " calculado)"]);
    continue;
  }
  const kk = chave(n);
  if (vistos.has(kk)) { recusados.push([n, "duplicata de: " + vistos.get(kk)]); continue; }
  const par = parecido(n);
  if (par) { recusados.push([n, "parecido demais (" + par[1] + "%) com: " + par[0]]); continue; }
  vistos.set(kk, n);
  porToken.push([n, new Set(tokens(n))]);
  novos.push({ n, c: cat, p, k, pt, cb, g });
}

const cabecalho = fs.readFileSync(ARQ, "utf8").split("self.MT_ALIMENTOS = [")[0];
const lista = banco.concat(novos);
const corpo = lista.map((a) => "  " + JSON.stringify(a)).join(",\n");
fs.writeFileSync(ARQ, cabecalho + "self.MT_ALIMENTOS = [\n" + corpo + "\n];\n");

console.log("aceitos: " + novos.length + " · recusados: " + recusados.length + " · total agora: " + lista.length);
recusados.forEach((r) => console.log("  ✗ " + r[0] + " — " + r[1]));
