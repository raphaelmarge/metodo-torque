/* Demo do PAINEL do professor (demo-personal.html + assets/demo-nuvem.js).
 *
 * O demo público roda 100% no navegador de quem abre o link, sem conta. Só que
 * TRÊS telas do painel vivem da nuvem — Chat, Questionários e Comunidade — e
 * sem ela elas só sabiam dizer "precisa da sua conta". Quem abria o demo pra
 * conhecer o produto via caixa vazia justo no que o professor mais usa.
 *
 * O simulador resolve isso resolvendo as consultas em memória. O que esta
 * suíte protege, além de as telas mostrarem conteúdo:
 *   - a TRAVA DUPLA (mtapp:ptDemo + mtapp:ptDemoNuvem): o painel de verdade,
 *     que não tem nenhuma das duas marcas, nunca pode ver nuvem de mentira;
 *   - NENHUMA chamada sai pra internet — nem REST, nem Edge Function. Um demo
 *     público não pode disparar WhatsApp, link de cobrança nem gastar IA.
 */
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

let ok = 0, falhas = 0;
function t(cond, nome) {
  if (cond) { ok++; console.log("  ✅ " + nome); }
  else { falhas++; console.log("  ❌ " + nome); }
}

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });

  /* Rede: o teste NUNCA pode encostar no Supabase de produção. Toda chamada
   * pro domínio da nuvem é anotada e abortada — se o simulador vazar, a lista
   * de `fora` deixa de ficar vazia e o teste acusa. */
  async function novaAba(ctx) {
    const p = await ctx.newPage();
    const fora = [];
    const erros = [];
    await p.route("**://*.supabase.co/**", (r) => { fora.push(r.request().url()); r.abort(); });
    p.on("pageerror", (e) => erros.push(String(e.message)));
    p.on("console", (m) => { if (m.type() === "error") erros.push("console: " + m.text()); });
    return { p, fora, erros };
  }

  async function abreDemo() {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: "pt-BR" });
    const { p, fora, erros } = await novaAba(ctx);
    await p.goto(BASE + "/demo-personal.html");
    await p.click("#btnDemo");
    await p.waitForURL(/personal\.html/);
    await p.waitForTimeout(2500);
    return { ctx, p, fora, erros };
  }
  async function vaiPra(p, aba) {
    await p.click(`#abas button[data-a="${aba}"]`);
    await p.waitForTimeout(1200);
  }

  // ---------------------------------------------------------------- trava
  console.log("A trava dupla (o painel de verdade não vê nuvem de mentira):");
  {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
    const { p } = await novaAba(ctx);
    await p.goto(BASE + "/personal.html");
    await p.evaluate(() => {
      localStorage.setItem("mtapp:ptSemConta", "1");
      // SÓ a marca do demo, sem a da nuvem: é o estado de quem abriu o demo
      // numa versão antiga do site, e de qualquer professor curioso
      localStorage.setItem("mtapp:ptDemo", "1");
    });
    await p.goto(BASE + "/personal.html");
    await p.waitForTimeout(1500);
    const r = await p.evaluate(() => ({
      simulador: !!window.__demoNuvem,
      nuvem: (function () { try { const c = window.MTStore.cloud(); return !!(c && c.client); } catch (e) { return "erro"; } })(),
    }));
    t(r.simulador === false, "só com mtapp:ptDemo o simulador NÃO liga");
    t(r.nuvem === false, "sem as duas marcas, MTStore.cloud() continua sem cliente");

    await p.evaluate(() => localStorage.setItem("mtapp:ptDemoNuvem", "1"));
    await p.goto(BASE + "/personal.html");
    await p.waitForTimeout(1500);
    const r2 = await p.evaluate(() => ({ simulador: !!window.__demoNuvem }));
    t(r2.simulador === true, "com as DUAS marcas, o simulador entra");
    await ctx.close();
  }

  // ------------------------------------------------------------- o demo
  console.log("O demo abre o painel inteiro:");
  const { ctx, p, fora, erros } = await abreDemo();
  {
    const base = await p.evaluate(() => ({
      demo: localStorage.getItem("mtapp:ptDemo"),
      nuvem: localStorage.getItem("mtapp:ptDemoNuvem"),
      aid: (window.MTStore.cloud() || {}).aid,
      comToken: (JSON.parse(localStorage.getItem("mtapp:ptStudio") || "{}").alunos || [])
        .filter((a) => a.appTokenP).length,
      feed: (JSON.parse(localStorage.getItem("mtapp:ptStudio") || "{}").config || {}).feedOn,
    }));
    t(base.demo === "1" && base.nuvem === "1", "o demo grava as duas marcas");
    t(base.aid === "demo-studio", "MTStore.cloud() devolve a academia de mentira");
    t(base.comToken === 24, "os 24 alunos do demo têm app criado (" + base.comToken + ")");
    t(base.feed === true, "a Comunidade vem ligada no demo");
  }

  console.log("Chat (tela 3c):");
  {
    await vaiPra(p, "chat");
    const lista = await p.evaluate(() => {
      const bts = Array.from(document.querySelectorAll("[data-chat]"));
      return {
        total: bts.length,
        comPrevia: bts.filter((x) => !/sem mensagem ainda/.test(x.textContent)).length,
        naoLidas: document.querySelectorAll("[data-chat] .chn").length,
      };
    });
    t(lista.total >= 20, "a lista traz todos os alunos com app (" + lista.total + ")");
    t(lista.comPrevia >= 4, "tem conversa de verdade com prévia da última mensagem (" + lista.comPrevia + ")");
    t(lista.naoLidas >= 2, "tem contador de mensagem nova (" + lista.naoLidas + ")");

    await p.locator("[data-chat]").first().click();
    await p.waitForTimeout(1200);
    const conv = await p.evaluate(() => ({
      titulo: (document.getElementById("chatTitulo") || {}).textContent || "",
      msgs: document.querySelectorAll("#chatMsgs .chb, #chatMsgs [class*=chb]").length,
      texto: (document.getElementById("chatMsgs") || {}).textContent || "",
      avatar: !(document.getElementById("chatAv") || {}).hidden,
      rapidas: document.querySelectorAll("#chatRapidas .chrb").length,
    }));
    t(/\w/.test(conv.titulo), "a conversa abre com o nome do aluno (" + conv.titulo + ")");
    t(conv.texto.length > 20, "as mensagens aparecem na conversa");
    t(conv.avatar, "o avatar do aluno aparece no topo da conversa");
    t(conv.rapidas === 3, "as três respostas rápidas ficam à mão");
  }

  console.log("Questionários — A semana (tela 3b):");
  {
    await vaiPra(p, "quest");
    await p.waitForTimeout(1400);
    const q = await p.evaluate(() => ({
      resumo: (document.getElementById("qsResumo") || {}).textContent || "",
      grupos: Array.from(document.querySelectorAll(".qsgrupo")).map((x) => x.textContent.trim().slice(0, 30)),
      itens: document.querySelectorAll("[data-qsit]").length,
      detalhe: (document.getElementById("qsDet") || {}).textContent || "",
    }));
    t(/de 24 responderam/.test(q.resumo), "o cabeçalho conta quem respondeu (" + q.resumo.trim() + ")");
    t(q.itens >= 20, "a lista traz os alunos da semana (" + q.itens + ")");
    t(/PEDE ATENÇÃO/i.test(q.grupos.join(" ")), "quem respondeu mal vem no grupo de atenção");
    t(q.detalhe.length > 40, "a resposta abre ao lado com os números por pergunta");
  }

  console.log("Comunidade (tela 4d):");
  {
    await vaiPra(p, "desafio");
    await p.click("[data-dsa='feed']");
    await p.waitForTimeout(1600);
    const f = await p.evaluate(() => {
      const alunos = (JSON.parse(localStorage.getItem("mtapp:ptStudio") || "{}").alunos || []).map((a) => a.nome);
      const cards = Array.from(document.querySelectorAll(".fdpost"));
      return {
        cards: cards.length,
        deAluno: cards.filter((c) => alunos.some((n) => c.textContent.indexOf(n) >= 0)).length,
        aviso: (document.getElementById("fdmAviso") || {}).textContent || "",
      };
    });
    t(f.cards >= 4, "o feed mostra os posts da turma (" + f.cards + ")");
    t(f.deAluno === f.cards, "todo post é de um aluno que está na lista do studio");
    t(!/DESLIGADA/.test(f.aviso), "o feed aparece LIGADO (o demo já liga)");
  }

  console.log("Ficha do aluno (tela 2b):");
  {
    await vaiPra(p, "alunos");
    // o NOME do aluno é o alvo mais óbvio da linha — tem que abrir a ficha
    await p.locator("[data-abreperfil]:visible").first().click();
    await p.waitForTimeout(1800);
    const pf = await p.evaluate(() => {
      const kpi = (id) => {
        const el = document.getElementById(id);
        return el ? el.querySelector(".v").textContent.trim() : "";
      };
      return {
        aberto: !document.getElementById("daPerfil").hidden,
        nome: (document.getElementById("pfTitulo") || {}).textContent || "",
        peso: kpi("pfKpiPeso"), fc: kpi("pfKpiFc"), ck: kpi("pfKpiCk"),
      };
    });
    t(pf.aberto && /\w/.test(pf.nome), "clicar no NOME abre a ficha (" + pf.nome.trim() + ")");
    t(/\d/.test(pf.peso), "o tile PESO traz o número do app (" + pf.peso + ")");
    t(/\d/.test(pf.fc), "o tile BATIMENTO traz o número do app (" + pf.fc + ")");
    t(/\d/.test(pf.ck), "o tile CHECK-IN é preenchido pela nuvem (" + pf.ck + ")");
  }

  console.log("Clube e loja já preenchidos (v705):");
  {
    const cl = await p.evaluate(() => {
      const cfg = (JSON.parse(localStorage.getItem("mtapp:ptStudio") || "{}").config || {});
      return {
        cupomComLink: (cfg.clube || []).some((x) => /^https:\/\//.test(x.u || "")),
        produtoComFoto: (cfg.lojaItens || []).some((x) => /^data:image\//.test(x.f || "")),
      };
    });
    t(cl.cupomComLink, "a seed do demo tem cupom COM link do parceiro");
    t(cl.produtoComFoto, "a seed do demo tem produto COM foto");
  }

  console.log("Nada sai deste navegador:");
  {
    const fn = await p.evaluate(() => window.MT_FUNCAO.chama(null, "whatsapp", {}, "Mandar o zap")
      .then((r) => ({ erro: String(r && r.erro || ""), ok: !!(r && r.ok) })));
    t(!fn.ok && /demo/i.test(fn.erro), "Edge Function não roda no demo — devolve recado honesto");
    t(fora.length === 0, "nenhuma chamada foi pro Supabase de verdade (" + fora.length + ")");
  }

  console.log("As 16 abas do painel abrem sem erro:");
  {
    const abas = ["dash", "alunos", "agenda", "pagamentos", "treinos", "chat", "avaliacoes", "quest",
      "desafio", "relatorios", "assessoria", "sitepro", "config", "pers", "imagens", "conta"];
    for (const a of abas) await vaiPra(p, a);
    const reais = erros.filter((e) => !/favicon|manifest|net::ERR_FAILED/.test(e));
    if (reais.length) console.log("     " + reais.slice(0, 5).join("\n     "));
    t(reais.length === 0, "nenhum erro de JavaScript nas 16 abas (" + reais.length + ")");
    t(fora.length === 0, "e continua sem tocar a internet depois de passar por todas");
  }
  await ctx.close();

  await b.close();
  console.log("\n" + ok + " ok, " + falhas + " falhas");
  process.exit(falhas ? 1 : 0);
})();
