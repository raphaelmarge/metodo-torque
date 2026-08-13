// Fábrica das artes OBRIGATÓRIAS das lojas (Google Play e App Store).
// Uso: node marketing/gera-lojas.js <pasta-saida>
//
// O que sai daqui:
//   icone-<app>-512.png     ícone da Play (512×512)
//   icone-<app>-1024.png    ícone da App Store (1024×1024, sem transparência)
//   destaque-<app>.png      gráfico de destaque da Play (1024×500)
//   print-<app>-<n>.png     capturas de tela REAIS do sistema, com os dados
//                           dos demos, nos tamanhos que cada loja aceita
//
// As capturas são do sistema rodando de verdade — não é mockup. É por isso que
// este script sobe um servidor local e navega igual a um usuário.
let chromium;
try { chromium = require("playwright").chromium; } catch (e) { chromium = require("/opt/node22/lib/node_modules/playwright").chromium; }
const fs = require("fs");
const path = require("path");
const http = require("http");

const RAIZ = path.join(__dirname, "..");
const EXEC = fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined;
const PORTA = 8791;
const BASE = "http://127.0.0.1:" + PORTA;

/* Tamanhos exigidos (conferidos nas duas lojas):
 * - Play: telefone 16:9 ou 9:16, mínimo 320 px, máximo 3840 px. 1080×1920 passa.
 * - App Store: o iPhone 6.9"/6.7" (1290×2796) é o único obrigatório desde 2024;
 *   os outros tamanhos a Apple deriva sozinha. */
const TELAS = {
  play: { largura: 1080, altura: 1920, dsf: 2, rotulo: "play" },
  ios: { largura: 1290, altura: 2796, dsf: 3, rotulo: "ios" },
};

const APPS = [
  {
    id: "academia", nome: "TORQUE ON", cor: "#7c3aed", corClara: "#a78bfa",
    icone: "assets/icons/icon.svg", frase: "A academia inteira no seu bolso",
    demo: null, pagina: "index.html",
    cenas: [
      { rota: "index.html", espera: 1800, legenda: "Todos os módulos em um lugar só" },
      { rota: "apps/sistema.html", espera: 1600, legenda: "O resumo gerencial da academia" },
      { rota: "apps/grade.html", espera: 1400, legenda: "Grade de aulas e ocupação" },
      { rota: "apps/caixa.html", espera: 1400, legenda: "Caixa do dia e recebimentos" },
    ],
  },
  {
    id: "personal", nome: "TORQUE PERSONAL", cor: "#7c3aed", corClara: "#a78bfa",
    icone: "assets/icons/icon-personal.svg", frase: "Seu studio inteiro no celular",
    demo: "demo-personal.html", pagina: "personal.html",
    cenas: [
      { aba: "dash", espera: 1200, legenda: "O dia de hoje já montado" },
      { aba: "alunos", espera: 900, legenda: "Seus alunos e o que cada um deve" },
      { aba: "treinos", espera: 900, legenda: "Fichas e biblioteca de exercícios" },
      { aba: "avaliacoes", espera: 900, legenda: "Avaliação física com laudo completo" },
      { aba: "pagamentos", espera: 900, legenda: "Quem pagou, quem não pagou" },
    ],
  },
  {
    id: "nutri", nome: "TORQUE NUTRI", cor: "#16a34a", corClara: "#4ade80",
    icone: "assets/icons/icon-nutri.svg", frase: "Seu consultório inteiro no celular",
    demo: "demo-nutri.html", pagina: "nutricao.html",
    cenas: [
      { aba: "dash", espera: 1200, legenda: "O dia de hoje já montado" },
      { aba: "pacientes", espera: 900, legenda: "Pacientes e o alvo calórico de cada um" },
      { aba: "dietas", espera: 900, legenda: "Dieta montada em um clique" },
      { aba: "alimentos", espera: 900, legenda: "Mais de mil alimentos brasileiros" },
    ],
  },
];

// ---------- servidor estático (o mesmo truque das suítes) ----------
const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };
function servidor() {
  return http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const arq = path.join(RAIZ, rel);
    if (!arq.startsWith(RAIZ) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": TIPOS[path.extname(arq)] || "application/octet-stream" });
    fs.createReadStream(arq).pipe(res);
  }).listen(PORTA);
}

// ---------- ícones e gráfico de destaque ----------
function htmlIcone(app, lado) {
  const svg = fs.readFileSync(path.join(RAIZ, app.icone), "utf8");
  // fundo sólido: a App Store REJEITA ícone com transparência
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    *{margin:0;box-sizing:border-box} html,body{width:${lado}px;height:${lado}px}
    body{background:#121016;display:flex;align-items:center;justify-content:center}
    svg{width:${Math.round(lado * 0.66)}px;height:${Math.round(lado * 0.66)}px}
  </style></head><body>${svg}</body></html>`;
}

function htmlDestaque(app) {
  const svg = fs.readFileSync(path.join(RAIZ, app.icone), "utf8");
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
    <link href="file://${RAIZ}/assets/fonts/archivo.css" rel="stylesheet"><style>
    *{margin:0;box-sizing:border-box} body{width:1024px;height:500px;font-family:"Archivo",system-ui,sans-serif;
      background:radial-gradient(120% 140% at 12% 0%, ${app.cor}55, transparent 60%), #121016;
      color:#f5f4f7;display:flex;align-items:center;gap:38px;padding:0 62px}
    svg{width:132px;height:132px;flex:none}
    h1{font-size:54px;font-weight:800;letter-spacing:-.02em;line-height:1.1}
    h1 span{color:${app.corClara}}
    p{font-size:27px;color:#b9b3c6;margin-top:12px}
  </style></head><body>${svg}<div><h1>${app.nome.replace(/^TORQUE /, "TORQUE <span>")}${app.nome.startsWith("TORQUE ") ? "</span>" : ""}</h1>
    <p>${app.frase}</p></div></body></html>`;
}

// ---------- captura de tela do sistema rodando ----------
async function prints(b, app, tela, saida) {
  const feitos = [];
  const ctx = await b.newContext({
    viewport: { width: Math.round(tela.largura / tela.dsf), height: Math.round(tela.altura / tela.dsf) },
    deviceScaleFactor: tela.dsf, isMobile: true, hasTouch: true,
  });
  const p = await ctx.newPage();
  if (app.demo) {
    await p.goto(BASE + "/" + app.demo, { waitUntil: "load" });
    // cada demo tem o botão com o id do seu produto
    await p.locator("#btnDemo, #btnDemoN").first().click();
    await p.waitForTimeout(2500);
  } else {
    /* A academia não tem página de demo como o Personal e o Nutri, e uma
     * captura com tudo zerado não vende nada. Então semeamos aqui mesmo uma
     * academia fictícia em pleno funcionamento — só pra foto. */
    await p.addInitScript(() => {
      const hoje = new Date().toISOString().slice(0, 10);
      const dia = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
      const nomes = ["Ana Beatriz Souza", "Bruno Ferraz", "Carla Menezes", "Diego Prado", "Elisa Martins",
        "Felipe Nunes", "Gabriela Rocha", "Henrique Dias", "Isabela Cruz", "João Pedro Alves",
        "Karina Lopes", "Lucas Ribeiro", "Marina Teixeira", "Nuno Barros", "Olívia Faria",
        "Paulo Andrade", "Queila Mendes", "Rafael Duarte", "Sofia Campos", "Tiago Moreira"];
      const alunos = nomes.map((n, i) => ({
        id: "al" + i, nome: n, status: "ativo", email: "", telefone: "",
        contratos: [{ id: "ct" + i, planoId: i % 3 === 0 ? "pl2" : "pl1", status: "ativo", inicio: dia(-90 - i * 5), valor: i % 3 === 0 ? 189 : 129 }],
        checkins: i < 11 ? [hoje + "T0" + (6 + (i % 4)) + ":15"] : [],
      }));
      const recebiveis = alunos.slice(0, 14).map((a, i) => ({
        id: "rc" + i, alunoId: a.id, nome: a.nome, valor: i % 3 === 0 ? 189 : 129,
        vencimento: i < 5 ? hoje : dia(i - 2), status: i < 5 ? "aberto" : "pago", pagoEm: i < 5 ? "" : dia(-i),
      }));
      localStorage.setItem("mtapp:perfil", JSON.stringify({ nome: "Raphael" }));
      localStorage.setItem("mtapp:seeded", "1");
      localStorage.setItem("mtapp:alunos", JSON.stringify({
        alunos: alunos, recebiveis: recebiveis,
        planos: [{ id: "pl1", nome: "Mensal Livre", valor: 129, meses: 1 }, { id: "pl2", nome: "Trimestral", valor: 189, meses: 3 }],
      }));
      localStorage.setItem("mtapp:contas", JSON.stringify({
        contas: [{ id: "co1", nome: "Energia", valor: 840, vencimento: hoje, status: "aberto" },
          { id: "co2", nome: "Internet", valor: 190, vencimento: hoje, status: "aberto" }],
      }));
      localStorage.setItem("mtapp:agenda", JSON.stringify({
        compromissos: [
          { id: "cp1", titulo: "Avaliação — Marina Teixeira", data: hoje, hora: "09:00", status: "agendado" },
          { id: "cp2", titulo: "Renovação — Bruno Ferraz", data: hoje, hora: "14:30", status: "agendado" },
          { id: "cp3", titulo: "Visita — lead do Instagram", data: hoje, hora: "18:00", status: "agendado" },
        ],
      }));
      localStorage.setItem("mtapp:exper", JSON.stringify({
        aulas: [{ id: "ex1", nome: "Camila (lead)", data: hoje, hora: "19:00", status: "agendada" }],
      }));
      localStorage.setItem("mtapp:atividades", JSON.stringify({
        itens: [{ id: "at1", nome: "Musculação", ativa: true }, { id: "at2", nome: "Funcional", ativa: true },
          { id: "at3", nome: "Ritmos", ativa: true }, { id: "at4", nome: "Pilates", ativa: true }],
      }));
      localStorage.setItem("mtapp:grade", JSON.stringify({
        aulas: [
          { id: "g1", atividade: "Funcional", prof: "Raphael", dia: 1, hora: "06:00", vagas: 20 },
          { id: "g2", atividade: "Ritmos", prof: "Carla", dia: 1, hora: "19:00", vagas: 30 },
          { id: "g3", atividade: "Pilates", prof: "Julia", dia: 2, hora: "07:00", vagas: 12 },
          { id: "g4", atividade: "Funcional", prof: "Raphael", dia: 3, hora: "06:00", vagas: 20 },
          { id: "g5", atividade: "Ritmos", prof: "Carla", dia: 4, hora: "19:00", vagas: 30 },
        ], avulsas: [], presencas: {}, faltas: {}, config: {},
      }));
      localStorage.setItem("mtapp:produtos", JSON.stringify({
        itens: [{ id: "p1", nome: "Água 500 ml", preco: 5, estoque: 40 }, { id: "p2", nome: "Barra proteica", preco: 12, estoque: 25 }],
        vendas: [{ id: "v1", produtoId: "p1", nome: "Água 500 ml", valor: 5, quando: hoje + "T08:10", forma: "pix" },
          { id: "v2", produtoId: "p2", nome: "Barra proteica", valor: 12, quando: hoje + "T10:40", forma: "dinheiro" }],
      }));
      localStorage.setItem("mtapp:config", JSON.stringify({ dados: { nome: "Academia TORQUE Demo" }, horarios: {} }));
    });
    await p.goto(BASE + "/" + app.pagina, { waitUntil: "load" });
    await p.waitForTimeout(2000);
  }
  /* A faixa do teste grátis traz "Assinar — R$ 49/mês". Numa captura da App
   * Store isso é pedir rejeição pela diretriz 3.1.1 (venda de assinatura
   * digital fora da compra no app) — e além disso polui a vitrine. */
  await p.addStyleTag({ content: "#faixaTeste, #faixaTesteN, #boasVindas { display: none !important; }" });

  let n = 0;
  for (const cena of app.cenas) {
    if (cena.rota) {
      await p.goto(BASE + "/" + cena.rota, { waitUntil: "load" });
      await p.addStyleTag({ content: "#faixaTeste, #faixaTesteN, #boasVindas { display: none !important; }" });
    }
    if (cena.aba) {
      // no celular as abas vivem na gaveta do ☰
      const hamb = p.locator("#btnMenuPt, #btnMenuNt").first();
      if (await hamb.isVisible().catch(() => false)) await hamb.click();
      await p.waitForTimeout(250);
      const alvo = p.locator(`#abas [data-a="${cena.aba}"], #abasNt [data-a="${cena.aba}"]`).first();
      if (!(await alvo.count())) continue;
      await alvo.click();
    }
    await p.waitForTimeout(cena.espera || 800);
    const arq = path.join(saida, `print-${app.id}-${tela.rotulo}-${++n}.png`);
    await p.screenshot({ path: arq });
    feitos.push({ arq, legenda: cena.legenda });
  }
  await ctx.close();
  return feitos;
}

(async () => {
  const saida = process.argv[2] || path.join(RAIZ, "loja-artes");
  fs.mkdirSync(saida, { recursive: true });
  const srv = servidor();
  const b = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });

  for (const app of APPS) {
    for (const lado of [512, 1024]) {
      const p = await b.newPage({ viewport: { width: lado, height: lado }, deviceScaleFactor: 1 });
      await p.setContent(htmlIcone(app, lado), { waitUntil: "networkidle" });
      await p.screenshot({ path: path.join(saida, `icone-${app.id}-${lado}.png`), omitBackground: false });
      await p.close();
    }
    const pd = await b.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
    await pd.setContent(htmlDestaque(app), { waitUntil: "networkidle" });
    await pd.waitForTimeout(150);
    await pd.screenshot({ path: path.join(saida, `destaque-${app.id}.png`) });
    await pd.close();

    for (const tela of [TELAS.play, TELAS.ios]) {
      const feitos = await prints(b, app, tela, saida);
      console.log(app.id + " / " + tela.rotulo + ": " + feitos.length + " prints");
    }
    console.log("ok " + app.id);
  }

  await b.close();
  srv.close();
  console.log("\nartes em " + saida);
})();
