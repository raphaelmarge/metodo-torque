/* Demos do NUTRI: demo-nutri.html (o consultório) e demo-paciente.html (o app).
 *
 * Por que esta suíte existe (v756): eram as duas ÚNICAS páginas de produto sem
 * nenhum teste. O demo-personal e o demo-aluno têm suíte própria; o do Nutri
 * é justamente o link que o Raphael manda pro cliente NUTRI — se a regeneração
 * (`node tools/demo-paciente/regen-demo.js`) sair quebrada, ou o painel do
 * nutricionista estourar um erro de JS ao abrir o demo, ninguém fica sabendo
 * até o cliente abrir e ver tela branca.
 *
 * Duas regras, as mesmas do test-demo-painel:
 *   1) NENHUMA chamada sai pra internet — demo público não escreve em banco,
 *      não dispara WhatsApp nem gasta IA. Toda chamada pro Supabase é anotada
 *      e abortada; a lista tem de terminar vazia.
 *   2) as telas principais PINTAM de verdade (nada de caixa vazia).
 */
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
process.env.TZ = process.env.TZ || "America/Sao_Paulo";

let ok = 0, falhas = 0;
function t(cond, nome) {
  if (cond) { ok++; console.log("  ✅ " + nome); }
  else { falhas++; console.log("  ❌ " + nome); }
}

let navegador = null;
process.on("unhandledRejection", (e) => { falhas++; console.log("  ❌ promessa solta rejeitada — " + e); });

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  navegador = b;

  // toda página nasce vigiada: rede pro Supabase abortada e erro de JS anotado
  async function novaAba(ctx) {
    const p = await ctx.newPage();
    const fora = [], erros = [];
    await p.route("**://*.supabase.co/**", (r) => { fora.push(r.request().url()); r.abort(); });
    p.on("pageerror", (e) => erros.push(String(e.message)));
    p.on("console", (m) => { if (m.type() === "error") erros.push("console: " + m.text()); });
    return { p, fora, erros };
  }
  const limpos = (erros) => erros.filter((e) => !/favicon|manifest|net::ERR_FAILED|ERR_ABORTED/.test(e));

  // ------------------------------------------------ demo-nutri (consultório)
  console.log("Demo do consultório (demo-nutri.html):");
  {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: "pt-BR" });
    const { p, fora, erros } = await novaAba(ctx);
    await p.goto(BASE + "/demo-nutri.html");
    t(await p.locator("#btnDemoN").isVisible(), "a página de entrada tem o botão de abrir o consultório de exemplo");
    await p.click("#btnDemoN");
    await p.waitForURL(/nutricao\.html/, { timeout: 20000 });
    await p.waitForTimeout(2500);

    const base = await p.evaluate(() => {
      const st = JSON.parse(localStorage.getItem("mtapp:ntStudio") || "{}");
      return {
        semConta: localStorage.getItem("mtapp:ntSemConta"),
        pacientes: (st.pacientes || []).length,
        nome: (st.config || {}).nome || "",
      };
    });
    t(base.semConta === "1", "o demo roda em modo sem conta (nada é gravado em banco nenhum)");
    t(base.pacientes >= 5, "a semente traz os pacientes de exemplo (" + base.pacientes + ")");
    t(/\w/.test(base.nome), "o consultório de exemplo tem nome (" + base.nome + ")");

    // as abas do painel do nutricionista abrem sem erro
    const abas = await p.evaluate(() =>
      Array.from(document.querySelectorAll("#abasNt [data-a]")).map((x) => x.dataset.a));
    t(abas.length >= 8, "o menu do Nutri tem as abas do produto (" + abas.length + ")");
    for (const a of abas) {
      await p.click('#abasNt [data-a="' + a + '"]');
      await p.waitForTimeout(450);
    }
    const reais = limpos(erros);
    if (reais.length) console.log("     " + reais.slice(0, 5).join("\n     "));
    t(reais.length === 0, "nenhum erro de JavaScript ao passar por todas as abas (" + reais.length + ")");
    t(fora.length === 0, "nenhuma chamada foi pro Supabase de verdade (" + fora.length + ")");

    // a lista de pacientes mostra gente de verdade, não caixa vazia
    await p.click('#abasNt [data-a="pacientes"]');
    await p.waitForTimeout(800);
    const lista = await p.evaluate(() => {
      const box = document.getElementById("listaPacientes") || document.body;
      return { texto: (box.textContent || "").trim().length, vazio: /nenhum paciente/i.test(box.textContent || "") };
    });
    t(lista.texto > 60 && !lista.vazio, "a lista de pacientes vem preenchida (o demo é pra mostrar, não pra explicar vazio)");
    await ctx.close();
  }

  // ------------------------------------------------- demo-paciente (o app)
  console.log("Demo do app do paciente (demo-paciente.html):");
  {
    const ctx = await b.newContext({ viewport: { width: 430, height: 900 }, locale: "pt-BR" });
    /* ⏱ a lição da v613: timer do app que estoura só aparece 45 s depois de
     * abrir, então ninguém vê. Aqui o setInterval é embrulhado ANTES da página
     * carregar e cada callback fica guardado — depois a suíte chama todos na
     * mão e um vazamento de escopo aparece na hora. */
    await ctx.addInitScript(`
      window.__mtTimers = [];
      var siOrig = window.setInterval;
      window.setInterval = function (fn, ms) {
        if (typeof fn === "function") window.__mtTimers.push(fn);
        return siOrig.apply(window, arguments);
      };
    `);
    const { p, fora, erros } = await novaAba(ctx);
    await p.goto(BASE + "/demo-paciente.html");
    await p.waitForTimeout(2000);

    const app = await p.evaluate(() => ({
      montou: !!document.querySelector("[data-secn], [data-sec]"),
      menu: document.querySelectorAll("nav button, .nitem, [data-msecn], [data-msec]").length,
      texto: (document.body.textContent || "").length,
      titulo: document.title,
    }));
    t(/Nutri/i.test(app.titulo), "a demo abre com o título do app do paciente (" + app.titulo + ")");
    t(app.montou, "o app do paciente monta (as seções existem no documento)");
    t(app.menu >= 3, "o menu de baixo tem as áreas do app (" + app.menu + ")");
    t(app.texto > 800, "a tela tem conteúdo de verdade, não casca vazia (" + app.texto + " chars)");

    // passeia pelas áreas: é onde um builder quebrado aparece
    const areas = await p.evaluate(() =>
      Array.from(document.querySelectorAll("[data-msecn],[data-msec]")).map((x) => x.dataset.msecn || x.dataset.msec));
    for (const a of areas.slice(0, 8)) {
      await p.evaluate((s) => {
        const btn = document.querySelector('[data-msecn="' + s + '"],[data-msec="' + s + '"]');
        if (btn) btn.click();
      }, a);
      await p.waitForTimeout(350);
    }
    const reais = limpos(erros);
    if (reais.length) console.log("     " + reais.slice(0, 5).join("\n     "));
    t(reais.length === 0, "nenhum erro de JavaScript passeando pelas áreas (" + reais.length + ")");
    t(fora.length === 0, "o app da demo não encosta no Supabase (" + fora.length + ")");

    const timers = await p.evaluate(() => {
      const erros2 = [];
      const fns = window.__mtTimers || [];
      fns.forEach((fn) => { try { fn(); } catch (e) { erros2.push(String(e.message)); } });
      return { erros: erros2, n: fns.length };
    });
    t(timers.n > 0, "o embrulho pegou os timers do app (" + timers.n + ") — sem isso o assert abaixo passaria de graça");
    t(timers.erros.length === 0, "nenhum timer do app do paciente estoura ao rodar (" + timers.erros.join(" | ").slice(0, 120) + ")");
    await ctx.close();
  }
})()
  .catch((e) => { falhas++; console.log("  ❌ a suíte parou no meio — " + (e && e.stack ? e.stack : e)); })
  .finally(async () => {
    try { if (navegador) await navegador.close(); } catch (e) { /* já fechado */ }
    console.log("\n" + ok + " ok, " + falhas + " falhas");
    process.exit(falhas ? 1 : 0);
  });
