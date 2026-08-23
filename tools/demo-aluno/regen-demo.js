/* Regenera demo-aluno.html: app novo (redesenho) + bloco de dados fake antigo.
 *
 * Uso (precisa do servidor de teste rodando na 8765 — ver CLAUDE.md):
 *   node tools/demo-aluno/regen-demo.js
 *
 * O Alex da demo é um aluno VETERANO: fichas A–E, circuitos e corridas
 * prescritos, 14 meses de peso/treinos e cargas anotadas em tudo — é o
 * material que o Raphael manda pro cliente ver o app "vivido".
 */
const fs = require("fs");
const path = require("path");
const PW = "/opt/node22/lib/node_modules/playwright";
const { chromium } = require(fs.existsSync(PW) ? PW : "playwright");
const EXEC = "/opt/pw-browsers/chromium";
const RAIZ = path.join(__dirname, "..", "..");

// fotos de capa da demo (já passadas pelo mesmo corte 16:9 / 720 px do painel)
const capa = (arq) => "data:image/jpeg;base64," + fs.readFileSync(path.join(__dirname, arq)).toString("base64");
const CAPAS = { treino: capa("capa-treino.jpg"), circuito: capa("capa-circuito.jpg"), corrida: capa("capa-corrida.jpg") };

(async () => {
  const br = await chromium.launch({ executablePath: fs.existsSync(EXEC) ? EXEC : undefined, args: ["--no-sandbox"] });
  const p = await (await br.newContext()).newPage();
  p.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  await p.goto("http://127.0.0.1:8765/personal.html");
  await p.waitForTimeout(800);
  const html = await p.evaluate((CAPAS) => {
    const S = window.MTStore;
    const snap = JSON.stringify(S.read("ptStudio", {}));
    const st = S.read("ptStudio", {});
    st.config = st.config || {};
    st.config.nome = "Studio TORQUE Demo";
    st.config.feedOn = true;
    st.config.conquistas = [{ e: "rato", n: "Rato de academia", meta: 30 }, { e: "medalha", n: "Lenda do Studio", meta: 100 }];
    st.config.mural = ["Sábado o studio abre 8h em vez de 7h. Quem treina cedo, me chama que a gente remarca."];
    st.config.capaTreino = CAPAS.treino; // leg press: capa de qualquer ficha sem foto própria
    st.exercicios = st.exercicios || [];
    const mk = (nome, grupo, desc) => {
      let e = st.exercicios.find((x) => x.nome === nome);
      if (!e) { e = { id: "dmx" + nome.replace(/\W/g, ""), nome, grupo, descricao: desc || "" }; st.exercicios.push(e); }
      return e.id;
    };
    const alex = { id: "demoAlx", nome: "Alex Silva", appTokenP: "demo-token-comunidade", metaSemana: 4, altura: 178, objetivo: "Ganhar músculo" };
    st.avaliacoes = (st.avaliacoes || []).filter((v) => v.alunoId !== "demoAlx").concat(
      [["2025-06-27", 86.4, 24.5, 96, 33], ["2025-08-26", 85.6, 23.9, 95, 33.2], ["2025-10-25", 84.9, 23.2, 93.5, 33.5],
       ["2025-12-24", 84.1, 22.6, 92, 33.9], ["2026-02-22", 83.0, 21.8, 90.5, 34.2], ["2026-04-23", 81.9, 21.1, 89, 34.6],
       ["2026-06-22", 80.7, 20.4, 87.5, 35.0], ["2026-08-11", 79.8, 19.8, 86, 35.3]]
        .map(([data, peso, gordura, cintura, braco], i) => ({ id: "dmav" + i, alunoId: "demoAlx", data, peso, gordura, cintura, braco })));
    st.treinosV2 = st.treinosV2 || {};
    st.treinosV2.demoAlx = {
      metaSemana: 4,
      fichas: [
        { id: "dmf0", titulo: "A — Peito e tríceps", itens: [
          { exId: mk("Supino reto", "Peito", "Pegada na largura dos ombros, desça controlando até o peito."), series: "4", reps: "12", descanso: 60 },
          { exId: mk("Supino inclinado com halteres", "Peito"), series: "3", reps: "12", descanso: 60 },
          { exId: mk("Crucifixo na máquina", "Peito"), series: "3", reps: "15", descanso: 45 },
          { exId: mk("Tríceps na corda", "Tríceps"), series: "4", reps: "12", descanso: 45 },
          { exId: mk("Francês com halter", "Tríceps"), series: "3", reps: "12", descanso: 45 },
        ] },
        { id: "dmf1", titulo: "B — Costas e bíceps", itens: [
          { exId: mk("Remada curvada", "Costas", "Tronco firme, puxe a barra até a linha do umbigo."), series: "4", reps: "12", descanso: 60 },
          { exId: mk("Puxada aberta", "Costas"), series: "4", reps: "12", descanso: 60 },
          { exId: mk("Remada baixa", "Costas"), series: "3", reps: "12", descanso: 60 },
          { exId: mk("Rosca direta", "Bíceps"), series: "3", reps: "12", descanso: 45 },
          { exId: mk("Rosca martelo", "Bíceps"), series: "3", reps: "12", descanso: 45 },
        ] },
        { id: "dmf2", titulo: "C — Pernas e core", itens: [
          { exId: mk("Agachamento livre", "Quadríceps", "Desça até a coxa passar da linha do joelho, peito aberto."), series: "4", reps: "10", descanso: 90 },
          { exId: mk("Leg press 45", "Quadríceps"), series: "4", reps: "12", descanso: 60 },
          { exId: mk("Stiff com halteres", "Posterior e glúteo"), series: "3", reps: "12", descanso: 60 },
          { exId: mk("Panturrilha em pé", "Quadríceps"), series: "4", reps: "15", descanso: 30 },
          { exId: mk("Prancha", "Core"), series: "4", reps: "40s", descanso: 30 },
        ] },
        { id: "dmf3", titulo: "D — Ombros e core", itens: [
          { exId: mk("Desenvolvimento com halteres", "Ombros", "Cotovelos um pouco à frente, sobe sem bater os halteres."), series: "4", reps: "10", descanso: 60 },
          { exId: mk("Elevação lateral", "Ombros"), series: "4", reps: "15", descanso: 45 },
          { exId: mk("Face pull", "Ombros"), series: "3", reps: "15", descanso: 45 },
          { exId: mk("Elevação frontal", "Ombros"), series: "3", reps: "12", descanso: 45 },
          { exId: mk("Abdominal na polia (crunch)", "Core"), series: "4", reps: "15", descanso: 30 },
          { exId: mk("Elevação de pernas na barra", "Core"), series: "3", reps: "12", descanso: 45 },
        ] },
        { id: "dmf4", titulo: "E — Posterior e glúteos", itens: [
          { exId: mk("Levantamento terra", "Posterior e glúteo", "Barra rente à canela, costas retas do começo ao fim."), series: "4", reps: "8", descanso: 90 },
          { exId: mk("Hip thrust", "Posterior e glúteo"), series: "4", reps: "12", descanso: 60 },
          { exId: mk("Mesa flexora", "Posterior e glúteo"), series: "3", reps: "12", descanso: 60 },
          { exId: mk("Cadeira abdutora", "Posterior e glúteo"), series: "3", reps: "15", descanso: 45 },
          { exId: mk("Panturrilha sentado", "Quadríceps"), series: "4", reps: "15", descanso: 30 },
        ] },
      ],
      wods: [
        { id: "dmw1", nome: "Chipper do sábado", tipo: "amrap", min: 20, capa: CAPAS.circuito,
          aq: "5 min de corrida leve + 2 rodadas de mobilidade de ombro",
          obs: "Wall ball 6 kg · barra fixa com elástico · clean and jerk 30 kg",
          movs: [{ q: "400 m", n: "corrida" }, { q: "30", n: "wall ball" }, { q: "20", n: "burpees" }, { q: "15", n: "barra fixa" }, { q: "10", n: "clean and jerk" }] },
        { id: "dmw2", nome: "Fran", tipo: "fortime", cap: 12, movs: [{ q: "21-15-9", n: "thruster e barra fixa" }] },
        { id: "dmw3", nome: "Motor de segunda", tipo: "emom", min: 16, obs: "Escala: rema no seu ritmo, burpee vira agachamento se precisar",
          movs: [{ q: "ímpar", n: "12 cal no remo" }, { q: "par", n: "10 burpees" }] },
      ],
      cardio: [
        { id: "dmc1", nome: "Rodagem leve", mod: "corrida", tipo: "continuo", dist: 5, tempo: 30, pace: "6:00", capa: CAPAS.corrida },
        { id: "dmc2", nome: "Tiros na praça", mod: "corrida", tipo: "intervalado", reps: 8, tiro: 60, desc: 90 },
        { id: "dmc3", nome: "Pedal regenerativo", mod: "bike", tipo: "continuo", dist: 15, tempo: 40 },
      ],
      // o painel casa o dia com o ID do treino (não com a posição): ficha sem id
      // sumia do plano — e a Semana do aluno da demo ficava só com sábado e domingo
      plano: { dias: { "1": { tp: "ficha", id: "dmf0" }, "3": { tp: "ficha", id: "dmf1" }, "5": { tp: "ficha", id: "dmf2" }, "6": { tp: "wod", id: "dmw1" }, "0": { tp: "cardio", id: "dmc1" } } },
    };
    window.MTStore.write("ptStudio", st);
    const out = window.__montaAppAluno(alex, new Date().toISOString());
    window.MTStore.write("ptStudio", JSON.parse(snap));
    return out;
  }, CAPAS);
  await br.close();
  if (!html || html.length < 50000) { console.log("ERRO: html curto", html && html.length); process.exit(1); }

  // pós-processo: localStorage → __demoLS, título, bloco demo depois do <body>
  const bloco = fs.readFileSync(path.join(__dirname, "demo-bloco.html"), "utf8");
  let out = html.replace(/localStorage/g, "__demoLS");
  out = out.replace(/<title>[^<]*<\/title>/, "<title>Alex · Studio TORQUE Demo</title>");
  const ib = out.indexOf("<body");
  const ib2 = out.indexOf(">", ib);
  out = out.slice(0, ib2 + 1) + bloco + out.slice(ib2 + 1);
  fs.writeFileSync(path.join(RAIZ, "demo-aluno.html"), out);
  console.log("demo regenerada:", out.length, "bytes; skin:", /MT_APP_SKIN|heroCarr/.test(out), "; __demoLS:", (out.match(/__demoLS/g) || []).length);
})();
