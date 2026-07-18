// Suíte do TORQUESYS — pacote de funcionalidades (roda local e no CI).
let chromium;
try { chromium = require("playwright").chromium; }
catch (e) { chromium = require("/opt/node22/lib/node_modules/playwright").chromium; }
const fs = require("fs");
const EXEC = process.env.CHROMIUM_PATH || (fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  const hoje = new Date().toISOString().slice(0, 10);
  const amanha = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })();

  async function pagina(url) {
    const p = await browser.newPage({ viewport: { width: 1400, height: 950 } });
    p.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
    await p.addInitScript(({ hoje, amanha }) => {
      if (window !== window.top) return;
      if (localStorage.getItem("mtapp:seeded")) return;
      localStorage.setItem("mtapp:seeded", "1");
      localStorage.setItem("mtapp:perfil", JSON.stringify({ nome: "T" }));
      localStorage.setItem("mtapp:alunos", JSON.stringify({
        alunos: [{ id: "a1", nome: "Rafa Silva", status: "ativo", zap: "31999990000", checkins: [hoje + "T08:00"],
          contratos: [{ status: "ativo", inicio: "2026-01-05", meses: 12, valor: 149 }], appToken: "tok1" }],
        planos: [], recebiveis: [
          { id: "r1", alunoId: "a1", status: "aberto", vencimento: amanha, valor: 149 },
          { id: "r2", alunoId: "a1", status: "pago", vencimento: hoje.slice(0, 8) + "05", valor: 149 },
        ],
      }));
      localStorage.setItem("mtapp:produtos", JSON.stringify({
        itens: [{ id: "p1", nome: "Whey 900g", preco: 120, estoque: 5 }, { id: "p2", nome: "Camiseta", preco: 60, estoque: 0 }],
        vendas: [],
      }));
      localStorage.setItem("mtapp:grade", JSON.stringify({
        aulas: [{ id: "g1", nome: "CROSS", prof: "Bia", dias: [0, 1, 2, 3, 4, 5, 6], inicio: "18:00", dur: 60, vagas: 3, cor: "#7c3aed", fixos: ["Carlos Fixo"] }],
        presencas: {}, faltas: {}, config: {},
      }));
      localStorage.setItem("mtapp:equipe", JSON.stringify({ pessoas: [{ id: "f1", nome: "Bia Prof" }] }));
      localStorage.setItem("mtapp:matriculaOnline", JSON.stringify({ pix: "chave-pix-torque" }));
      localStorage.setItem("mtapp:config", JSON.stringify({ dados: { nome: "TORQUE FIT" }, integracoes: { demo: true } }));
      localStorage.setItem("mtapp:permissoes", JSON.stringify({
        perfis: [{ id: "pf1", nome: "Recepção", ativa: true, telas: { recepcao: 1, clientes: 1, financeiro: 1 } }],
        vinculos: { "bia@torque.com": "pf1" },
      }));
    }, { hoje, amanha });
    await p.goto(url);
    return p;
  }

  // ===== 1) APP: loja, push, fixos na lotação =====
  let p = await pagina(BASE + "/apps/app-aluno.html");
  await p.waitForFunction(() => window.__appAluno);
  const html = await p.evaluate(() => window.__appAluno.monta(JSON.parse(localStorage.getItem("mtapp:alunos")).alunos[0], "s1"));
  const chk = (n, c) => { console.log("app:", n, c ? "OK" : "FALHOU"); if (!c) throw new Error(n); };
  chk("lojinha só com estoque", html.includes("Whey 900g") && !html.includes("Camiseta"));
  chk("pedido via RPC + pix", html.includes("app_aluno_pedido") && html.includes("chave-pix-torque"));
  chk("push (SW + VAPID)", html.includes("app-sw.js") && html.includes("pushManager.subscribe"));
  chk("fixos contam na lotação do app", /LOT=\{[^}]*"g1\|/.test(html));
  await p.close();

  // ===== 2) PERMISSÕES: menu filtrado pelo perfil vinculado =====
  p = await pagina(BASE + "/apps/sistema.html");
  await p.waitForSelector(".grupo[data-telas]");
  const antes = await p.evaluate(() => [...document.querySelectorAll(".grupo[data-telas]")].filter((g) => g.style.display !== "none").length);
  await p.evaluate(() => {
    window.MTStore.usuario = () => ({ email: "bia@torque.com", papel: "funcionario", nome: "Bia", logado: true });
    window.__permissoes();
  });
  const depois = await p.evaluate(() => [...document.querySelectorAll(".grupo[data-telas]")].filter((g) => g.style.display !== "none").length);
  const aviso = await p.evaluate(() => document.body.textContent.includes("Menu filtrado pelo perfil Recepção"));
  console.log("permissões: grupos", antes, "→", depois, "| aviso:", aviso);
  if (depois >= antes || !aviso) throw new Error("filtro de permissões");
  await p.close();

  // ===== 3) JORNADA: etapa do dia certo entra nos disparos =====
  p = await pagina(BASE + "/apps/automacao.html");
  await p.waitForTimeout(600);
  await p.evaluate(({ hoje }) => {
    const d3 = new Date(hoje + "T12:00"); d3.setDate(d3.getDate() - 3);
    const stA = JSON.parse(localStorage.getItem("mtapp:alunos"));
    stA.alunos[0].contratos[0].inicio = d3.toISOString().slice(0, 10);
    localStorage.setItem("mtapp:alunos", JSON.stringify(stA));
    const st = JSON.parse(localStorage.getItem("mtapp:automacao"));
    st.jornada.ativa = true;
    localStorage.setItem("mtapp:automacao", JSON.stringify(st));
    location.reload();
  }, { hoje });
  await p.waitForTimeout(700);
  const corpo = await p.evaluate(() => document.body.textContent);
  const temJornada = corpo.includes("Jornada do aluno novo") && corpo.includes("primeiro treino");
  console.log("jornada: disparo do dia 3:", temJornada ? "OK" : "FALHOU");
  if (!temJornada) throw new Error("jornada");
  await p.close();

  // ===== 4) GRADE: fixo conta na ocupação (1 fixo + 0 do dia = 1/3) =====
  p = await pagina(BASE + "/apps/grade.html");
  await p.waitForSelector(".aula-card");
  const badge = await p.evaluate(() => document.querySelector(".aula-card .vagas").textContent);
  console.log("grade: ocupação com fixo =", badge);
  if (badge !== "1/3") throw new Error("fixo na ocupação");
  await p.close();

  // ===== 5) COHORT: tabela de safras renderiza =====
  p = await pagina(BASE + "/apps/crescimento.html");
  await p.waitForFunction(() => window.calculaSafras);
  const safras = await p.evaluate(() => window.calculaSafras());
  const temTabela = await p.evaluate(() => document.body.textContent.includes("Retenção por safra"));
  console.log("cohort: linhas =", safras.length, "| tabela:", temTabela);
  if (safras.length !== 6 || !temTabela) throw new Error("cohort");
  await p.close();

  // ===== 6) AUDITORIA: write registra autoria e a página lista =====
  p = await pagina(BASE + "/apps/auditoria.html");
  await p.waitForTimeout(400);
  await p.evaluate(() => {
    const st = window.MTStore.read("metas", { metas: [] });
    window.MTStore.write("metas", st); // dispara a trilha
    window.__auditoria.renderTrilha();
  });
  const trilha = await p.evaluate(() => document.getElementById("listaTrilha").textContent);
  console.log("auditoria: registrou =", trilha.includes("metas") && trilha.includes("alterado por"));
  if (!trilha.includes("alterado por")) throw new Error("auditoria");
  await p.close();

  // ===== 7) TOTEM básico segue OK (regressão) =====
  p = await pagina(BASE + "/apps/totem.html");
  await p.waitForTimeout(400);
  await p.fill("#busca", "Rafa");
  await p.waitForSelector("#sug button");
  await p.click("#sug button");
  const okRafa = await p.evaluate(() => document.getElementById("painel").className === "ok");
  console.log("totem: Rafa liberado =", okRafa);
  if (!okRafa) throw new Error("totem");
  await p.close();

  console.log("\nTUDO OK");
  await browser.close();
})().catch((e) => { console.error("FALHOU:", e.message); process.exit(1); });
