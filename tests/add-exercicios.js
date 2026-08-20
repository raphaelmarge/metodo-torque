/* Anexa exercícios novos ao banco, com dedupe por nome (sem diferenciar
 * maiúscula, acento ou espaço duplo). Uso:
 *   node tests/add-exercicios.js candidatos.json
 * Rejeita duplicata contra o banco E entre os próprios candidatos, valida os
 * quatro campos e reescreve o arquivo no mesmo formato. */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const ARQ = path.join(RAIZ, "assets/exercicios-db.js");

const chave = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

global.self = {};
require(ARQ);
const banco = self.MT_EXERCICIOS;
const vistos = new Map();
banco.forEach((e) => vistos.set(chave(e.n), e.n));

const GRUPOS = new Set(banco.map((e) => e.g));

/* Duplicata disfarçada: o MESMO movimento com outro nome ("elevação pélvica" x
 * "ponte de glúteo"). Com 1600 exercícios no banco, isso acontece o tempo todo
 * e é o que mais suja a busca do professor. Compara as palavras que importam;
 * a partir de 60% de coincidência, recusa. */
const SEMPESO = new Set("com de do da na em os as um uma para pra por ao aos sem".split(" "));
const palavras = (s) => new Set(chave(s).split(" ").filter((w) => w.length > 2 && !SEMPESO.has(w)));
const bancoPal = banco.map((e) => ({ n: e.n, p: palavras(e.n) }));
function parecidoCom(nome) {
  const p = palavras(nome);
  let pior = null, maior = 0;
  for (const b of bancoPal) {
    let iguais = 0;
    p.forEach((w) => { if (b.p.has(w)) iguais++; });
    const j = iguais / new Set([...p, ...b.p]).size;
    if (j > maior) { maior = j; pior = b.n; }
  }
  return { j: maior, n: pior };
}

const entrada = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const novos = [];
const recusados = [];

for (const c of entrada) {
  const n = String(c.n || "").trim();
  const g = String(c.g || "").trim();
  const eq = String(c.eq || "").trim();
  const d = String(c.d || "").trim();
  if (!n || !g || !eq || !d) { recusados.push([n, "campo faltando"]); continue; }
  if (!GRUPOS.has(g)) { recusados.push([n, "grupo desconhecido: " + g]); continue; }
  if (d.length < 40) { recusados.push([n, "dica curta demais"]); continue; }
  const k = chave(n);
  if (vistos.has(k)) { recusados.push([n, "duplicata de: " + vistos.get(k)]); continue; }
  const perto = parecidoCom(n);
  if (perto.j >= 0.6) { recusados.push([n, "parecido demais (" + Math.round(perto.j * 100) + "%) com: " + perto.n]); continue; }
  if (perto.j >= 0.45) console.log("  ⚠ " + n + " — parecido (" + Math.round(perto.j * 100) + "%) com: " + perto.n);
  vistos.set(k, n);
  bancoPal.push({ n, p: palavras(n) }); // o novo também entra na comparação
  novos.push({ n, g, eq, d });
}

const cabecalho = fs.readFileSync(ARQ, "utf8").split("self.MT_EXERCICIOS = [")[0];
const lista = banco.concat(novos);
const corpo = lista.map((e) => " " + JSON.stringify(e, null, 1).replace(/\n/g, "\n ")).join(",\n");
fs.writeFileSync(ARQ, cabecalho + "self.MT_EXERCICIOS = [\n" + corpo + "\n];\n");

console.log("aceitos: " + novos.length + " · recusados: " + recusados.length + " · total agora: " + lista.length);
recusados.forEach((r) => console.log("  ✗ " + r[0] + " — " + r[1]));
