/* O painel do professor NUM CELULAR — tela por tela, medindo o que ele VÊ.
 *
 * Por que esta suíte existe: o painel foi redesenhado da v614 à v622 e a
 * revisão visual foi feita numa tela de 1280 px. No celular do Raphael o
 * cabeçalho da ficha do aluno chegou destruído — o nome do aluno com LARGURA
 * ZERO (some, porque tem nowrap + overflow hidden) e a linha do objetivo com
 * uma palavra por linha, os botões vazando por cima. Nenhum teste pegou:
 * todos olhavam classe e conteúdo, não geometria, e todos rodavam em 1280.
 *
 * A regra é a lição da v612: contar o que o professor VÊ (a geometria
 * calculada), nunca a classe — a classe entrava certinha o tempo todo.
 *
 * O que reprova aqui:
 *   texto-sumido      — elemento com texto e largura ~0
 *   palavra-por-linha — caixa estreita demais: menos de 1,6 palavra por linha
 *   sobrepoe          — dois irmãos ocupando o mesmo lugar
 *   rola-de-lado      — a página inteira rolando na horizontal
 * O resto (toque pequeno, letra miúda) sai como aviso, sem reprovar.
 */
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const LARGURA = 390;   // iPhone 12/13/14 em pé — o mais comum

let ok = 0, falhas = 0;
function t(cond, nome) {
  if (cond) { ok++; console.log("  ✅ " + nome); }
  else { falhas++; console.log("  ❌ " + nome); }
}

/* Casos PROPOSITAIS, que a régua acusa mas são o desenho certo. Cada linha
 * precisa dizer POR QUE — perdão sem motivo escrito vira tapete pra sujeira. */
const PERDOADOS = [
  // a fita do mapa de calor e as barras de gráfico rolam por dentro do card
  { tipo: "vazou-do-pai", alvo: /canvas|svg/i, porque: "gráfico rola dentro da própria caixa" },
];
function perdoado(p) {
  return PERDOADOS.some(function (x) {
    return x.tipo === p.tipo && x.alvo.test(p.alvo || "");
  });
}

/* A régua. Mede geometria calculada; não olha classe nenhuma. */
const REGUA = function () {
  window.__mede = function (rotulo) {
    const out = [];
    const vis = (e) => {
      const s = getComputedStyle(e);
      if (s.display === "none" || s.visibility === "hidden" || +s.opacity === 0) return false;
      const b = e.getBoundingClientRect();
      return b.width > 0 || b.height > 0;
    };
    const nome = (e) => {
      let n = e.tagName.toLowerCase();
      if (e.id) n += "#" + e.id;
      else if (typeof e.className === "string" && e.className.trim()) n += "." + e.className.trim().split(/\s+/).slice(0, 2).join(".");
      return n;
    };
    const texto = (e) => (e.textContent || "").replace(/\s+/g, " ").trim();
    const poe = (tipo, e, detalhe) => out.push({ tela: rotulo, tipo: tipo, alvo: nome(e), texto: texto(e).slice(0, 50), detalhe: detalhe });
    /* Quantas linhas o TEXTO ocupa de verdade. Contar altura-da-caixa dividida
     * pela entrelinha e chute: o padding de um botao de 44px vira "3 linhas".
     * O Range devolve um retangulo por LINHA de texto — isso e o que o
     * professor enxerga. */
    const linhasDeTexto = (e) => {
      try {
        const r = document.createRange();
        r.selectNodeContents(e);
        const tops = new Set();
        Array.from(r.getClientRects()).forEach((x) => {
          if (x.width > 1 && x.height > 1) tops.add(Math.round(x.top));
        });
        return tops.size;
      } catch (err) { return 1; }
    };
    const todos = Array.from(document.body.querySelectorAll("*")).filter(vis);

    // 1) texto que sumiu: tem letra, não tem largura
    todos.forEach((e) => {
      if (e.children.length) return;
      const t = texto(e);
      if (t.length < 2) return;
      if (e.getBoundingClientRect().width < 3) poe("texto-sumido", e, t.length + " caracteres em largura 0");
    });

    // 2) uma palavra por linha: a caixa ficou estreita demais pro texto
    todos.forEach((e) => {
      const t = texto(e);
      if (t.length < 12 || t.indexOf(" ") < 0) return;
      if (Array.from(e.children).some((c) => vis(c) && texto(c).length > 6)) return;
      // caixa que carrega controle/desenho tem a altura DELE somada: um rotulo
      // de duas linhas com um input embaixo viraria "5 linhas pra 5 palavras"
      if (e.querySelector("input,select,textarea,button,svg,canvas,img,video,iframe,details")) return;
      // <rect>/<path> de grafico tem <title> dentro (o balaozinho do mouse):
      // o texto conta, mas a "caixa" e a barra de 13px — nao e texto quebrado
      if (e.closest("svg")) return;
      if (Array.from(e.children).some((c) => vis(c) && getComputedStyle(c).display !== "inline")) return;
      const b = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      const linhas = linhasDeTexto(e), palavras = t.split(/\s+/).length;
      if (linhas < 4) return;
      if (palavras / linhas < 1.6) {
        poe("palavra-por-linha", e, linhas + " linhas pra " + palavras + " palavras (caixa de " + b.width.toFixed(0) + "px)");
      }
    });

    /* 2b) NOME PARTIDO AO MEIO: rótulo curto (até 3 palavras) que mesmo assim
     *     quebra em 2+ linhas. É a assinatura da linha flex sem `flex-wrap` e
     *     sem `min-width: 0`: o vizinho de largura fixa espreme a coluna do
     *     texto até ela caber só uma palavra. Foi o que destruiu o cabeçalho
     *     da ficha, a lista de alunos e a linha do dia no Início. */
    todos.forEach((e) => {
      const t = texto(e);
      if (!t || t.length > 26 || t.split(/\s+/).length > 3) return;
      if (e.children.length || e.closest("svg")) return;
      const b = e.getBoundingClientRect();
      if (getComputedStyle(e).display === "inline" || b.width < 2) return;
      const linhas = linhasDeTexto(e);
      if (linhas >= 2) poe("nome-partido", e, '"' + t + '" em ' + linhas + " linhas numa caixa de " + b.width.toFixed(0) + "px");
    });

    // 3) irmãos ocupando o mesmo lugar
    const jaVi = new Set();
    todos.forEach((e) => {
      const s = getComputedStyle(e);
      if (s.position !== "static" && s.position !== "relative") return;
      // inline que quebra em varias linhas tem rect de UNIAO — dois <b> na mesma
      // frase apareceriam "cobrindo" um ao outro sem cobrir nada
      if (s.display === "inline") return;
      if (e.closest("svg")) return;                 // dentro do desenho, sobrepor e o desenho
      const a = e.getBoundingClientRect();
      if (a.width < 24 || a.height < 14) return;
      const p = e.parentElement;
      if (!p) return;
      Array.from(p.children).forEach((o) => {
        if (o === e || !vis(o)) return;
        const so = getComputedStyle(o);
        if (so.position !== "static" && so.position !== "relative") return;
        if (so.display === "inline") return;
        const b = o.getBoundingClientRect();
        const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ix > 6 && iy > 6) {
          const ch = [nome(e), nome(o)].sort().join("|");
          if (jaVi.has(ch)) return;
          jaVi.add(ch);
          poe("sobrepoe", e, "cobre " + nome(o) + " em " + ix.toFixed(0) + "×" + iy.toFixed(0) + "px");
        }
      });
    });

    // 4) a página rolando de lado
    const de = document.documentElement;
    if (de.scrollWidth > de.clientWidth + 1) {
      const culpados = todos.filter((e) => {
        if (e.getBoundingClientRect().right <= de.clientWidth + 2) return false;
        const p = e.parentElement;
        if (!p) return true;
        const sp = getComputedStyle(p);
        return sp.overflowX !== "auto" && sp.overflowX !== "scroll";
      }).slice(0, 4).map(nome);
      out.push({ tela: rotulo, tipo: "rola-de-lado", alvo: "documento", texto: "",
        detalhe: de.scrollWidth + "px em " + de.clientWidth + "px · suspeitos: " + (culpados.join(", ") || "—") });
    }
    return out;
  };
};

const ABAS = [
  ["dash", "Início"],
  ["alunos", "Alunos"],
  ["agenda", "Agenda"],
  ["pagamentos", "Financeiro", "pga", ["receb", "planos", "contratos", "serv", "desp"]],
  ["treinos", "Treinos", "tra", ["fichas", "wod", "cardio", "plano", "auto", "ex", "videos", "grupo"]],
  ["chat", "Chat"],
  ["avaliacoes", "Avaliações", "ava", ["historico", "avaliar"]],
  ["quest", "Questionários", "qta", ["semana", "enviar", "montar", "resp"]],
  ["desafio", "Desafio", "dsa", ["config", "placar", "feed"]],
  ["relatorios", "Relatórios", "rela", ["geral", "alunos", "fin", "agenda", "vendas"]],
  ["assessoria", "Assessoria"],
  ["sitepro", "Minha página"],
  ["config", "Configurações", "cfga", ["resumo", "zap", "app", "conta"]],
  ["pers", "Personalização"],
  ["imagens", "Imagens"],
  ["conta", "Sua ilha"],
  ["ajuda", "Ajuda", "ajtopico", ["agenda"]], // v706: a Central de ajuda também tem que ser legível no celular
];
const ABAS_PERFIL = ["resumo", "app", "cadastro", "fin", "freq", "quest", "aval", "treino"];

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const ctx = await b.newContext({ viewport: { width: LARGURA, height: 880 }, locale: "pt-BR",
    isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const erros = [];
  p.on("pageerror", (e) => erros.push(String(e.message)));

  await p.goto(BASE + "/demo-personal.html");
  await p.click("#btnDemo");
  await p.waitForURL(/personal\.html/);
  await p.waitForTimeout(2500);

  const achados = [];
  async function medir(rotulo) {
    await p.evaluate(REGUA);
    const r = await p.evaluate((x) => window.__mede(x), rotulo);
    r.filter((x) => !perdoado(x)).forEach((x) => achados.push(x));
  }
  async function aba(a) {
    await p.evaluate((x) => {
      const bt = document.querySelector('#abas button[data-a="' + x + '"]');
      if (bt) bt.click();
    }, a);
    await p.waitForTimeout(1100);
  }
  async function sub(attr, v) {
    const achou = await p.evaluate((o) => {
      const el = Array.from(document.querySelectorAll("[data-" + o.a + '="' + o.v + '"]'))
        .filter((e) => e.offsetParent !== null)[0];
      if (el) { el.click(); return true; }
      return false;
    }, { a: attr, v: v });
    if (achou) await p.waitForTimeout(950);
    return achou;
  }

  console.log("Varrendo o painel num celular de " + LARGURA + "px:");
  for (const linha of ABAS) {
    const [a, rot, attr, subs] = linha;
    await aba(a);
    await medir(rot);
    if (attr) {
      for (const s of subs) {
        if (await sub(attr, s)) await medir(rot + " › " + s);
      }
    }
  }

  // a ficha do aluno: o cabeçalho roxo mais as 8 abas de dentro
  await aba("alunos");
  await p.locator("[data-abreperfil]:visible").first().click();
  await p.waitForTimeout(1600);
  await medir("Ficha do aluno");
  for (const s of ABAS_PERFIL) {
    if (await sub("pfa", s)) await medir("Ficha › " + s);
  }

  // --------------------------------------------------------------- veredito
  const porTipo = {};
  achados.forEach((x) => { (porTipo[x.tipo] = porTipo[x.tipo] || []).push(x); });
  const conta = (k) => (porTipo[k] || []).length;
  const mostra = (k, quantos) => (porTipo[k] || []).slice(0, quantos).forEach(function (x) {
    console.log("     · " + x.tela + " → " + x.alvo + " — " + x.detalhe + (x.texto ? ' ["' + x.texto + '"]' : ""));
  });

  console.log("\nO que o professor vê:");
  if (conta("texto-sumido")) mostra("texto-sumido", 12);
  t(conta("texto-sumido") === 0, "nenhum texto com largura zero (" + conta("texto-sumido") + ")");
  if (conta("palavra-por-linha")) mostra("palavra-por-linha", 12);
  t(conta("palavra-por-linha") === 0, "nenhuma caixa com uma palavra por linha (" + conta("palavra-por-linha") + ")");
  if (conta("nome-partido")) mostra("nome-partido", 16);
  t(conta("nome-partido") === 0, "nenhum rótulo curto partido em duas linhas (" + conta("nome-partido") + ")");
  if (conta("sobrepoe")) mostra("sobrepoe", 12);
  t(conta("sobrepoe") === 0, "nada escrito por cima de outra coisa (" + conta("sobrepoe") + ")");
  if (conta("rola-de-lado")) mostra("rola-de-lado", 12);
  t(conta("rola-de-lado") === 0, "a página não rola de lado em tela nenhuma (" + conta("rola-de-lado") + ")");
  t(erros.length === 0, "nenhum erro de JavaScript na varredura (" + erros.length + ")");

  /* O cabeçalho da ficha é o que quebrou de verdade — vale uma medida direta,
   * pra a suíte falhar dizendo o nome do defeito e não só um contador. */
  const cab = await p.evaluate(() => {
    const el = (i) => document.getElementById(i).getBoundingClientRect();
    return { titulo: Math.round(el("pfTitulo").width), desde: Math.round(el("pfDesde").height),
      topo: Math.round(document.getElementById("pfTopo").getBoundingClientRect().height) };
  });
  console.log("\nCabeçalho da ficha (o que chegou quebrado no celular do Raphael):");
  t(cab.titulo > 120, "o nome do aluno tem largura de verdade (" + cab.titulo + "px)");
  t(cab.desde <= 60, "a linha do objetivo cabe em 1–2 linhas (" + cab.desde + "px de altura)");
  t(cab.topo < 220, "o cabeçalho inteiro é compacto (" + cab.topo + "px)");

  /* MONTAR FICHA no celular: UMA COISA POR VEZ (v634).
   *
   * A ficha aberta mostra so os exercicios DELA e o botao "+ Adicionar
   * exercicio". O botao abre uma TELA CHEIA com um trabalho so — buscar,
   * escolher, series/reps/descanso, Adicionar — e voltar cai na ficha.
   * Antes tudo convivia na mesma pagina: 1594px de altura, quatro telas de
   * controles na cara ao mesmo tempo. */
  await aba("treinos");
  // a varredura la de cima ja passeou pelas sub-abas de Treinos e parou noutra:
  // sem voltar pra "Fichas do aluno" o bloco fica escondido e mede zero
  await sub("tra", "fichas");
  const abriu = await p.evaluate(() => {
    const sel = document.getElementById("tAluno");
    if (!sel || sel.options.length < 2) return false;
    sel.value = sel.options[1].value;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  });
  if (abriu) {
    await p.waitForTimeout(1400);
    await p.evaluate(() => { const d = document.querySelector("#fichasBox details"); if (d) d.open = true; });
    await p.waitForTimeout(900);
    const ve = (s2) => p.evaluate((q) => {
      const e = document.querySelector(q);
      return !!e && getComputedStyle(e).display !== "none" && e.getBoundingClientRect().height > 0;
    }, s2);
    const fechada = await p.evaluate(() => ({
      altura: Math.round(document.querySelector("#fichasBox details").getBoundingClientRect().height),
      p2NaFicha: !!document.querySelector(".tddir .tdp2"),
      handleFalso: document.querySelectorAll(".tdex .tdh").length,
    }));
    console.log("\nMontar ficha no celular (uma coisa por vez):");
    t(!(await ve(".tdesq")) && (await ve(".tdaddbt")),
      "a ficha aberta mostra os exercícios e o botão + Adicionar — o escolher fica fora da tela");
    t(fechada.altura < 1200, "a ficha aberta cabe em duas telas de celular (" + fechada.altura + "px, era 1594)");
    t(fechada.p2NaFicha, "a parte 2 do dia (A2) é conteúdo da FICHA, não passo de escolher exercício");
    t(fechada.handleFalso === 0, "o puxador falso ≡ saiu da linha (ele parecia arrastar e não arrastava)");
    // abre a tela cheia
    await p.evaluate(() => { const b2 = document.querySelector("[data-exadd]"); if (b2) b2.click(); });
    await p.waitForTimeout(500);
    const cheia = await p.evaluate(() => {
      const e = document.querySelector(".tdesq");
      const b2 = e.getBoundingClientRect();
      return { larg: Math.round(b2.width), alt: Math.round(b2.height), pos: getComputedStyle(e).position,
        tela: document.documentElement.clientWidth, telaH: window.innerHeight,
        voltar: !!e.querySelector("[data-exfechar]"),
        nav: !document.getElementById("navPt") || getComputedStyle(document.getElementById("navPt")).display === "none",
        campos: e.querySelectorAll(".tdadd input").length };
    });
    /* ⚠️ o .card do apps.css tem `animation … both`, que deixa um transform
     * IDENTIDADE computado — e transform, mesmo identidade, cria bloco de
     * contenção e faz o position:fixed colar no CARD em vez da tela. A medida
     * abaixo é justamente essa: a tela cheia tem a largura da TELA. */
    t(cheia.pos === "fixed" && cheia.larg === cheia.tela,
      "o + Adicionar abre uma tela CHEIA de verdade (" + cheia.larg + "px de " + cheia.tela + "px, position: " + cheia.pos + ")");
    t(cheia.voltar && cheia.nav, "a tela cheia tem o ‹ Voltar e esconde a barra de baixo");
    t(cheia.campos === 4, "e traz os campos do exercício num lugar só (séries, repetições, descanso, obs)");
    // voltar fecha
    await p.evaluate(() => { const b2 = document.querySelector("[data-exfechar]"); if (b2) b2.click(); });
    await p.waitForTimeout(400);
    t(!(await ve(".tdesq")), "o ‹ Voltar fecha a tela cheia e devolve a ficha");
  }

  await b.close();
  console.log("\n" + ok + " ok, " + falhas + " falhas");
  process.exit(falhas ? 1 : 0);
})();
