/* Regenera demo-paciente.html: app novo (nutri-builder, v661+) + dados fake da Marina.
 *
 * Uso (precisa do servidor de teste rodando na 8765 — ver CLAUDE.md):
 *   node tools/demo-paciente/regen-demo.js
 *
 * A Marina da demo é uma paciente de 5 meses: dieta completa de 5 refeições,
 * peso caindo, avaliações físicas, mural, Pix e Comunidade — é o material que
 * o Raphael manda pro cliente ver o app "vivido". Os ids das refeições
 * (r0700, r1000…) casam com as chaves ntref_ semeadas no demo-bloco.html.
 * Rode de novo sempre que o nutri-builder mudar — demo congelada mente.
 */
const fs = require("fs");
const path = require("path");
const PW = "/opt/node22/lib/node_modules/playwright";
const { chromium } = require(fs.existsSync(PW) ? PW : "playwright");
const EXEC = "/opt/pw-browsers/chromium";
const RAIZ = path.join(__dirname, "..", "..");

(async () => {
  const br = await chromium.launch({ executablePath: fs.existsSync(EXEC) ? EXEC : undefined, args: ["--no-sandbox"] });
  const p = await (await br.newContext()).newPage();
  p.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  await p.goto("http://127.0.0.1:8765/nutricao.html");
  await p.waitForTimeout(800);
  const r = await p.evaluate(() => {
    const S = window.MTStore;
    const snap = JSON.stringify(S.read("ntStudio", {}));
    const st = S.read("ntStudio", { config: {}, pacientes: [], dietas: {}, alimentos: [], catalogoOff: {} });
    st.config = st.config || {};
    st.config.nome = "Nutri TORQUE Demo";
    st.config.feedOn = true;
    st.config.zap = "31999990000";
    st.config.mural = ["Semana que vem estarei em congresso de quinta a sábado — as consultas dessas datas serão remarcadas pelo chat."];
    st.config.pixChave = "demo@torquenutri.com.br";
    st.config.pixNome = "Nutri TORQUE Demo";
    st.config.pixCidade = "Belo Horizonte";
    st.config.pixValor = 180;
    // dieta de verdade, com alimentos do banco curado (falha alto se um nome sumir do banco)
    const faltando = [];
    const item = (nome, qtd) => {
      const al = window.__alimPorNome(nome);
      if (!al) { faltando.push(nome); return null; }
      return { alimId: al.id, qtd: qtd };
    };
    const ref = (id, hora, titulo, itens) => ({ id: id, hora: hora, titulo: titulo, itens: itens.filter(Boolean) });
    const marina = { id: "demoMar", nome: "Marina Souza", sexo: "F", idade: 34, altura: 165, peso: 68.4,
      atividade: "mod", objetivo: "emagrecer", ativo: true, metaSemana: 5, appTokenN: "demo-token-nutri" };
    st.pacientes = (st.pacientes || []).filter((x) => x.id !== "demoMar").concat([marina]);
    st.dietas = st.dietas || {};
    st.dietas.demoMar = { aguaMl: 2200, refeicoes: [
      ref("r0700", "07:00", "Café da manhã", [item("Ovo cozido", 2), item("Pão de forma integral", 2), item("Mamão papaia", 0.5)]),
      ref("r1000", "10:00", "Lanche da manhã", [item("Banana prata", 1), item("Aveia em flocos", 0.5)]),
      ref("r1230", "12:30", "Almoço", [item("Arroz branco cozido", 1), item("Feijão preto cozido", 1), item("Peito de frango grelhado", 1.5), item("Brócolis cozido", 1)]),
      ref("r1600", "16:00", "Lanche da tarde", [item("Iogurte natural desnatado", 1), item("Maçã", 1)]),
      ref("r1930", "19:30", "Jantar", [item("Tilápia grelhada", 1.5), item("Batata-doce cozida", 1), item("Salada de folhas (alface/rúcula)", 1)]),
    ] };
    // avaliações físicas: 5 meses de acompanhamento (o card "Minha avaliação" usa)
    st.avaliacoesN = (st.avaliacoesN || []).filter((v) => v.pacienteId !== "demoMar").concat(
      [["2026-03-29", 74.6, 32.0, 84, 104, 27.0, 58.0], ["2026-05-05", 72.8, 30.8, 82, 103, 27.1, 57.2],
       ["2026-06-09", 71.2, 29.6, 80.5, 102, 27.2, 56.4], ["2026-07-14", 69.7, 28.4, 78.5, 101, 27.4, 55.7],
       ["2026-08-18", 68.4, 27.3, 77, 100, 27.5, 55.0]]
        .map(([data, peso, gordura, cintura, quadril, braco, coxa], i) =>
          ({ id: "dmavn" + i, pacienteId: "demoMar", data, peso, gordura, cintura, quadril, braco, coxa })));
    S.write("ntStudio", st);
    const out = window.__montaAppNutri(marina, new Date().toISOString());
    S.write("ntStudio", JSON.parse(snap));
    return { html: out, faltando: faltando };
  });
  await br.close();
  if (r.faltando.length) { console.log("ERRO: alimentos que não existem no banco:", r.faltando.join(", ")); process.exit(1); }
  const html = r.html;
  if (!html || html.length < 50000) { console.log("ERRO: html curto", html && html.length); process.exit(1); }

  // pós-processo: localStorage → __demoLS, título, bloco demo depois do <body>
  const bloco = fs.readFileSync(path.join(__dirname, "demo-bloco.html"), "utf8");
  let out = html.replace(/localStorage/g, "__demoLS");
  out = out.replace(/<title>[^<]*<\/title>/, "<title>Marina · Nutri TORQUE Demo</title>");
  const ib = out.indexOf("<body");
  const ib2 = out.indexOf(">", ib);
  out = out.slice(0, ib2 + 1) + bloco + out.slice(ib2 + 1);
  fs.writeFileSync(path.join(RAIZ, "demo-paciente.html"), out);
  console.log("demo regenerada:", out.length, "bytes; __demoLS:", (out.match(/__demoLS/g) || []).length,
    "; feed:", /fdListaN/.test(out), "; pix:", /pixAppN|Pix/.test(out));
})();
