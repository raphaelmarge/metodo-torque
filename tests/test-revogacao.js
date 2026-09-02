/* Cortar o acesso do aluno — e o app do aluno saber a diferença entre
 * "fui apagado" e "estou sem internet".
 *
 * O sintoma que gerou esta suíte: o profissional zerou o perfil dele e o aluno
 * continuou entrando normalmente. Eram DUAS falhas somadas — não existia
 * revogação nenhuma na nuvem, e o app abria a cópia guardada pra sempre.
 */
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const fs = require("fs");
const path = require("path");
const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const { comMockNuvem } = require("./_nuvem.js");   // v756: cliente de nuvem falso compartilhado

let ok = 0, falhas = 0;
// v756: o navegador vive FORA do IIFE pra o finally fechar mesmo quando a
// suite para no meio (senao sobra Chromium orfao e o resumo nunca sai)
let navegadorV756 = null;
function t(cond, nome) {
  if (cond) { ok++; console.log("  ✅ " + nome); }
  else { falhas++; console.log("  ❌ " + nome); }
}

/* Pacote de dados de verdade, gerado pelo próprio painel (window.__pacoteApp) e
 * guardado aqui: um objeto inventado à mão não monta o app e o teste mediria a
 * coisa errada. Regenere com o painel se o formato do pacote mudar. */
const PACOTE = JSON.parse(fs.readFileSync(path.join(__dirname, "pacote-exemplo.json"), "utf8"));
// v756: a versão desta build, pra provar que o pacote gerado na hora é o de HOJE
const MT_VERSAO_REPO = (fs.readFileSync(path.join(__dirname, "..", "assets/versao.js"), "utf8")
  .match(/MT_VERSAO\s*=\s*"(mt-v\d+)"/) || [])[1] || "";
/* O que o painel realmente GRAVA na nuvem é o embrulho — não o D solto. Testar
 * com o D solto escondeu por semanas o defeito que derrubava o app de quem
 * rodou o SQL novo: o carregador embrulhava o embrulho. */
const REGISTRO = { html: "", dados: PACOTE, ver: PACOTE.ver || "mt-v0", stamp: PACOTE.stamp || "" };

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  navegadorV756 = b;
  comMockNuvem(b);   // v756: todo contexto nasce com o window.mockNuvem

  async function abreApp(resposta, pacote) {
    const PAC = pacote || PACOTE;
    const ctx = await b.newContext({ viewport: { width: 430, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(BASE + "/app/");
    await p.evaluate((pac) => {
      localStorage.setItem("tq_app_pacote", JSON.stringify({ dados: pac, html: "" }));
      localStorage.setItem("tq_app_token", "tok-rev");
      localStorage.setItem("mt_aluno_token", "tok-rev");
      localStorage.setItem("ptpeso", JSON.stringify({ "2026-08-01": 80 }));
    }, PAC);
    await p.route("**/rest/v1/rpc/app_aluno_estado", resposta.estado);
    if (resposta.busca) await p.route("**/rest/v1/rpc/app_aluno_busca", resposta.busca);
    await p.goto(BASE + "/app/?t=tok-rev");
    await p.waitForTimeout(1200);
    const fim = await p.evaluate(() => ({
      montou: !!document.getElementById("navApp"),
      texto: (document.body.textContent || "").slice(0, 240),
      pacote: localStorage.getItem("tq_app_pacote") || "",
      token: localStorage.getItem("tq_app_token") || "",
      alunoTok: localStorage.getItem("mt_aluno_token") || "",
      peso: localStorage.getItem("ptpeso") || "",
      visto: localStorage.getItem("tq_app_visto") || "",
    }));
    await ctx.close();
    return fim;
  }

  const json = (corpo) => (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(corpo) });

  console.log("O servidor mandou apagar:");
  {
    const r = await abreApp({ estado: json({ ok: false, motivo: "revogado" }) });
    t(!r.montou && /acesso foi encerrado/i.test(r.texto), "acesso cortado: o app não abre e explica o motivo");
    t(!r.pacote && !r.token && !r.alunoTok, "acesso cortado: o aparelho esquece o pacote e os dois tokens");
    t(!r.peso, "acesso cortado: os registros do treino saem do aparelho junto");
  }
  {
    const r = await abreApp({ estado: json({ ok: false, motivo: "sem_registro" }) });
    t(!r.montou && /não existe mais/i.test(r.texto), "app apagado de vez: mesma limpeza, recado diferente");
  }

  console.log("Sem internet NÃO é apagar (o aluno do subsolo):");
  {
    const r = await abreApp({ estado: (rt) => rt.abort("failed"), busca: (rt) => rt.abort("failed") });
    t(r.montou, "rede caiu: o app abre normal com a cópia guardada");
    t(!!r.pacote, "rede caiu: o pacote continua no aparelho");
  }
  {
    const r = await abreApp({
      estado: (rt) => rt.fulfill({ status: 500, contentType: "application/json", body: '{"erro":"boom"}' }),
      busca: (rt) => rt.fulfill({ status: 500, contentType: "application/json", body: '{"erro":"boom"}' }),
    });
    t(r.montou && !!r.pacote, "erro 500 do servidor também não apaga nada");
  }
  {
    const r = await abreApp({
      estado: (rt) => rt.fulfill({ status: 200, contentType: "text/html", body: "<h1>portal do wifi</h1>" }),
      busca: (rt) => rt.abort("failed"),
    });
    t(r.montou && !!r.pacote, "resposta que não é o envelope (portal de wifi, proxy) não apaga nada");
  }

  console.log("Compatibilidade com quem ainda não rodou o SQL:");
  {
    const r = await abreApp({
      estado: (rt) => rt.fulfill({ status: 404, contentType: "application/json", body: '{"code":"PGRST202","message":"function not found"}' }),
      busca: json({ dados: PACOTE, stamp: "2026-08-01T00:00:00Z" }),
    });
    t(r.montou && !!r.pacote, "função nova ainda não publicada: cai no caminho antigo e o app abre igual");
  }
  {
    const r = await abreApp({ estado: json({ ok: true, dados: REGISTRO }) });
    t(r.montou && !!r.visto, "acesso valendo: monta o app e carimba o último contato com a nuvem");
    /* Regressão da v475: o envelope já entrega o pacote pronto e o carregador
     * embrulhava outra vez, montando o app com o embrulho no lugar dos dados
     * do aluno. Quem rodou o SQL novo ficou com o app morto. */
    t(/Alex|Teste|[A-Za-zÀ-ú]/.test(r.texto) && !/não respondeu/i.test(r.texto),
      "o pacote que a nuvem entrega monta o app de verdade (nada de embrulhar duas vezes)");
    const semEmbrulho = await abreApp({ estado: json({ ok: true, dados: PACOTE }) });
    t(semEmbrulho.montou, "registro antigo, gravado sem embrulho, também continua montando");
  }

  console.log("Painel: cortar e faxina:");
  {
    const ctx = await b.newContext();
    const p = await ctx.newPage();
    await p.goto(BASE + "/personal.html");
    await p.evaluate(() => localStorage.setItem("mtapp:ptSemConta", "1"));
    await p.reload({ waitUntil: "load" });
    await p.waitForFunction(() => window.__revogaAluno, null, { timeout: 20000 });
    const r = await p.evaluate(async () => {
      const S = window.MTStore, snap = JSON.stringify(S.read("ptStudio", {}));
      const chamadas = [];
      const cloudOrig = S.cloud;
      // v756: o cliente encadeável mora em tests/_nuvem.js — aqui só a rpc importa
      S.cloud = () => window.mockNuvem({ aid: "acad-1",
        rpc: (fn, args) => { chamadas.push({ fn, args }); return Promise.resolve({ data: fn === "app_aluno_faxina" ? { ok: true, revogados: 3 } : { ok: true, revogado: true } }); } });
      const st = S.read("ptStudio", {});
      st.alunos = [{ id: "r1", nome: "Ana Revoga", ativo: true, desde: S.todayISO(), appTokenP: "tok-da-ana", appPubEm: "2026-08-01T00:00:00Z" }];
      S.write("ptStudio", st);
      const espera = (f) => new Promise((res) => f(res));
      const rev = await espera((res) => window.__revogaAluno("r1", false, res));
      const depois = S.read("ptStudio", {}).alunos[0];
      const fax = await espera((res) => window.__faxinaAcessos(res));
      const argFax = (chamadas.find((c) => c.fn === "app_aluno_faxina") || { args: {} }).args;
      S.cloud = cloudOrig;
      S.write("ptStudio", JSON.parse(snap));
      return { rev, chamadas, marcado: depois.appRevogadoEm, semPub: !depois.appPubEm, fax, argFax };
    });
    const cortou = r.chamadas.find((c) => c.fn === "aluno_revoga_acesso") || { args: {} };
    t(r.rev.ok && cortou.args.p_token === "tok-da-ana" && cortou.args.p_apagar === false,
      "cortar o acesso chama aluno_revoga_acesso com o token daquele aluno");
    t(!!r.marcado && r.semPub, "o painel marca a data do corte e esquece que o app estava publicado");
    t(r.fax.ok && r.fax.revogados === 3 && Array.isArray(r.argFax.p_tokens),
      "a faxina manda a lista de tokens conhecidos e recebe só a contagem (" + r.fax.revogados + ")");
    await ctx.close();
  }

  console.log("Exclusão de conta não mente mais:");
  {
    const fonte = fs.readFileSync(path.join(__dirname, "..", "assets", "excluir-conta.js"), "utf8");
    t(/Seus alunos continuam com o app funcionando/.test(fonte),
      "sem estar logado, o aviso diz na cara que os alunos continuam com acesso");
    t(/app_aluno_faxina/.test(fonte),
      "com a conta na nuvem, a exclusão corta o acesso de todos os alunos antes de apagar");
  }

  console.log("Guardas do SQL:");
  {
    const sql = fs.readFileSync(path.join(__dirname, "..", "supabase-setup.sql"), "utf8");
    t(/alter table public\.app_aluno add column if not exists revogado_em/.test(sql),
      "existe a coluna revogado_em");
    /* Antes isto era só a ausência de UMA string, e por isso não pegava nada:
     * cinco RPCs (agendamentos, cancela, feed_apaga, pedidos e devolve) mexiam
     * no banco sem nunca perguntar se o acesso ainda valia — aluno cortado
     * seguia cancelando aula, apagando post e mandando dados. Agora o teste
     * ENUMERA as funções do aluno e cobra o porteiro em cada uma. */
    {
      // lista FECHADA de dispensas: o porteiro em pessoa, a função que PRECISA
      // responder pra aluno cortado ("seu acesso acabou"), o gatilho de histórico
      // (não tem token) e a faxina de revogação (recebe token[]). Qualquer outra
      // RPC do aluno tem que ter o porteiro — e escape silencioso não vale.
      const dispensadas = ["app_aluno_ativo", "app_aluno_estado", "app_aluno_guarda_hist", "app_aluno_faxina"];
      const corpos = sql.split(/create or replace function public\./).slice(1);
      const semGuarda = [];
      let varridas = 0;
      const puladas = [];
      corpos.forEach((bloco) => {
        const nome = (bloco.match(/^(\w+)\s*\(/) || ["", ""])[1];
        if (!/^app_aluno_/.test(nome)) return;
        if (dispensadas.indexOf(nome) >= 0) { puladas.push(nome); return; }
        varridas++;
        const corpo = bloco.split("$$;")[0];
        if (!/app_aluno_ativo\(t\)/.test(corpo) && !/revogado_em/.test(corpo)) semGuarda.push(nome);
      });
      t(semGuarda.length === 0,
        "toda RPC do aluno confere se o acesso ainda vale" +
        (semGuarda.length ? " — sem guarda: " + semGuarda.join(", ") : ""));
      // piso: se o formato do SQL mudar e o split não achar nada, o teste FALHA
      // em vez de passar no vácuo (antes não havia contagem mínima)
      t(varridas >= 18, "o teste realmente varreu as RPCs do aluno (" + varridas + " encontradas)");
      // só as exceções conhecidas podem ficar de fora — nada de escape silencioso
      t(puladas.every((n) => dispensadas.indexOf(n) >= 0),
        "só as RPCs dispensadas conhecidas ficam de fora do porteiro");
    }
    t(/language sql volatile\nset search_path = public/.test(sql),
      "a geradora do verify token fixa o search_path, como todas as outras");
    // redundância: sobrescrever ou apagar um registro do `dados` guarda o valor
    // anterior — foi a falta disso que tornou irrecuperável a base de um professor
    t(/create table if not exists public\.dados_hist/.test(sql) &&
      /before update or delete on public\.dados/.test(sql),
      "todo update/delete no `dados` guarda a versão anterior no dados_hist");
    t(/old\.valor is distinct from new\.valor/.test(sql) && /limit 10/.test(sql),
      "o histórico só grava quando o valor muda de verdade, e guarda as 10 últimas versões");
    // cicatriz do 2º apagão: versões vazias em série quase empurraram a cópia
    // boa pra fora das 10 vagas — a faxina agora poupa também as 2 MAIORES
    t(/octet_length\(valor::text\) desc/.test(sql.slice(sql.indexOf("dados_guarda_hist"))) &&
      /interval '90 days'/.test(sql.slice(sql.indexOf("dados_guarda_hist"))),
      "a faxina do cofre nunca solta as 2 maiores versões dos últimos 90 dias (a cópia boa sobrevive a spam de vazio)");
    // o retorno do aluno (peso, cargas, fotos) é insubstituível: foto quando
    // ENCOLHE ou quando a linha morre — crescer é o dia a dia e não fotografa
    t(/create table if not exists public\.app_aluno_hist/.test(sql) &&
      /before update or delete on public\.app_aluno/.test(sql),
      "o retorno do app do aluno também tem histórico (encolheu ou excluiu = fotografa)");
    t(/octet_length\(new\.retorno::text\), 0\) < octet_length\(old\.retorno::text\)/.test(sql) &&
      /order by id desc limit 5/.test(sql),
      "a foto só sai quando o retorno encolhe, e ficam as 5 últimas por token");
    t(/app_aluno_ativo\(t\)/.test(sql) && /revogado_em is null/.test(sql),
      "o app_aluno_ativo só devolve academia enquanto o acesso vale");
    t(/and login <> '' and revogado_em is null/.test(sql),
      "o login por e-mail para de valer quando o acesso é cortado");
    t(/aluno_revoga_acesso/.test(sql) && /aluno_religa_acesso/.test(sql) && /app_aluno_faxina/.test(sql),
      "as três RPCs novas existem");
    t(!/app_aluno_faxina[\s\S]{0,600}?json_build_object\([^)]*'token'/.test(sql),
      "a faxina devolve contagem, nunca token");
  }

  /* O carregador tem que dizer a VERDADE quando não abre. Antes qualquer
   * tropeço virava "Sem internet agora" — inclusive com o celular no 5G, e aí
   * o professor procurava o problema no lugar errado. */
  console.log("O recado de erro fala a verdade:");
  {
    async function semCopia(resposta) {
      const ctx = await b.newContext({ viewport: { width: 430, height: 900 } });
      const p = await ctx.newPage();
      await p.route("**/rest/v1/rpc/app_aluno_estado", resposta.estado);
      await p.route("**/rest/v1/rpc/app_aluno_busca", resposta.busca);
      await p.goto(BASE + "/app/?t=tok-sem-copia");
      await p.waitForTimeout(900);
      const fim = await p.evaluate(() => {
        const d = document.getElementById("verdet");
        if (d) d.click();
        // só o recado visível: body.textContent traria o código do <script> junto
        return { texto: (document.querySelector(".box").innerText || "").replace(/\s+/g, " ").trim(),
          temTentar: !!document.getElementById("tentar"),
          detalhe: (document.getElementById("det") || {}).textContent || "" };
      });
      await ctx.close();
      return fim;
    }
    const vazio = await semCopia({ estado: json({ code: "PGRST202" }), busca: json(null) });
    t(/ainda não tem app publicado/i.test(vazio.texto) && !/sem internet/i.test(vazio.texto),
      "token sem app publicado: diz que falta PUBLICAR, não que falta internet");
    t(/Publicar app/.test(vazio.texto), "e ensina o caminho: pedir pro personal publicar");
    const fora = await semCopia({ estado: (r) => r.abort(), busca: (r) => r.abort() });
    t(/sem internet/i.test(fora.texto), "rede caída de verdade continua dizendo que é a internet");
    const quebrado = await semCopia({ estado: json({ code: "PGRST202" }), busca: (r) => r.fulfill({ status: 500, contentType: "application/json", body: "{}" }) });
    t(/não respondeu/i.test(quebrado.texto) && /Não é o seu celular/i.test(quebrado.texto),
      "servidor fora do ar: avisa que o problema NÃO é o celular do aluno");
    t(quebrado.temTentar && /HTTP 500/.test(quebrado.detalhe),
      "tem botão de tentar de novo e os detalhes técnicos pro professor (" + quebrado.detalhe.replace(/\n/g, " ").slice(0, 60) + ")");
  }

  /* v756: o pacote-exemplo.json está congelado no mt-v474 — 279 versões atrás,
   * sem `tipo`, sem planoApp/mesApp/p2/TERMO. Ele continua valioso (prova que o
   * carregador aguenta um pacote ANTIGO), mas sozinho ele testava um envelope
   * que nenhum aluno recebe mais: uma mudança no carregador que quebrasse só
   * pacote NOVO passava batido. Agora o painel gera um pacote de verdade na
   * hora e os mesmos caminhos rodam com ele. */
  {
    console.log("");
    console.log("O mesmo carregador com um pacote gerado AGORA pelo painel:");
    const ctxP = await b.newContext({ viewport: { width: 1280, height: 900 } });
    await ctxP.addInitScript(() => {
      localStorage.setItem("mtapp:perfil", JSON.stringify({ nome: "Raphael" }));
      localStorage.setItem("mtapp:ptSemConta", "1");
    });
    const pp = await ctxP.newPage();
    await pp.goto(BASE + "/personal.html");
    await pp.waitForFunction(() => window.__ptStudio && window.__dadosApp);
    const fresco = await pp.evaluate(() => {
      const S = window.MTStore, st = S.read("ptStudio", {});
      st.alunos = [{ id: "rev1", nome: "Aluno Fresco", ativo: true, desde: "2026-01-10",
        appTokenP: "tok-rev", metaSemana: 3 }];
      S.write("ptStudio", st);
      return window.__dadosApp(st.alunos[0], new Date().toISOString());
    });
    await ctxP.close();
    t(!!fresco && fresco.ver === MT_VERSAO_REPO,
      "o painel gerou o pacote do aluno na hora, na versão desta build (" + ((fresco && fresco.ver) || "?") + " × " + MT_VERSAO_REPO + ")");
    const regFresco = { html: "", dados: fresco, ver: (fresco && fresco.ver) || "", stamp: (fresco && fresco.stamp) || "" };
    const vivoF = await abreApp({ estado: json({ ok: true, dados: regFresco }) }, fresco);
    t(vivoF.montou && !!vivoF.pacote, "pacote de HOJE monta o app pelo mesmo caminho do pacote velho");
    const cortadoF = await abreApp({ estado: json({ ok: false, motivo: "revogado" }) }, fresco);
    t(!cortadoF.montou && !cortadoF.pacote && !cortadoF.token,
      "e a revogação apaga o aparelho igual, com o pacote no formato novo");
  }

  console.log("");
  console.log(falhas ? "💥 " + falhas + " FALHA(S)" : "🏁 TUDO PASSOU");
  console.log("Resultado: " + ok + " ok, " + falhas + " falhas");
  await b.close();
  process.exit(falhas ? 1 : 0);
})()
  .catch((e) => { falhas++; console.log("  ❌ a suíte parou no meio — " + (e && e.stack ? e.stack : e)); })
  .finally(async () => {
    try { if (navegadorV756) await navegadorV756.close(); } catch (e) { /* ja fechado */ }
    console.log(falhas ? "\n💥 " + falhas + " FALHA(S)" : "\n🏁 TUDO PASSOU");
    process.exit(falhas ? 1 : 0);
  });
