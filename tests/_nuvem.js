/* Cliente de nuvem de mentira COMPARTILHADO — tests/_nuvem.js (v756).
 *
 * Por que ele existe: cada suíte escrevia o próprio mock de
 * `window.MTStore.cloud`, e sempre ESTREITO — só a tabela e os métodos que
 * AQUELE bloco usava. Enquanto o mock estreito estava instalado, um TIMER do
 * painel (autoPublicaApps, régua de push, badges) ou o próprio render() chamava
 * outro método e estourava "nuvem.client.from(...).upsert is not a function"
 * dentro do verificador "nenhuma página com erro de JS" — falha intermitente,
 * dependente do relógio, num bloco que não tinha nada a ver com o erro. E cada
 * suíte repetia (com pequenas diferenças) o mesmo esqueleto de encadeamento.
 *
 * Não começa com "test-", então o run.sh não roda este arquivo como suíte.
 *
 *   const { comMockNuvem } = require("./_nuvem.js");
 *   const b = comMockNuvem(await chromium.launch(...));  // todo contexto ganha window.mockNuvem
 *   ...
 *   S.cloud = () => window.mockNuvem({ aid: "a1", tabelas: { app_chat: [ … ] } });
 *
 * ⚠️ quem troca o `MTStore.cloud` continua tendo de GUARDAR o original e
 * devolver no fim do bloco — senão vaza pros blocos (e suítes) seguintes.
 */
// Uso: S.cloud = () => window.mockNuvem({ aid: "a1", tabelas: { app_chat: [ … ] } })
//   tabelas — objeto tabela → linhas (array), ou função (q, tabela) devolvendo
//             linhas / {data, error}; também pode ser UMA função pra todas.
//   rpc, auth, storage, client — sobrescrevem o padrão quando o bloco precisa.
//   onEscreve({tabela, acao, corpo, q}) — espia insert/update/upsert/delete.
//   onFrom(tabela) — espia QUEM foi consultado, na hora do from() (serve pra
//     provar que uma tabela NÃO foi tocada: esperar o resolve daria falso ok).
// A consulta devolvida é encadeável (todo método devolve ela mesma) e é um
// "thenable": await/then resolvem {data, error}. Ela guarda o que foi pedido em
// q.filtros (eq/in/gte…), q.colunas, q.ops e q.corpo, então o bloco confere o
// que a tela consultou sem precisar de mock próprio.
const MOCK_NUVEM = `
(function () {
  var FILTROS = ["eq","neq","gt","gte","lt","lte","like","ilike","is","in","contains","containedBy","overlaps","match","filter"];
  var ESCRITAS = ["insert","update","upsert","delete"];
  var OUTROS = ["select","order","limit","range","or","not","abortSignal","returns","throwOnError","csv","explain","geojson","rollback","setHeader"];
  window.mockNuvem = function (opts) {
    opts = opts || {};
    var tabelas = opts.tabelas || {};
    function resolve(q) {
      var fonte = typeof tabelas === "function" ? tabelas : tabelas[q.tabela];
      var v = typeof fonte === "function" ? fonte(q, q.tabela) : fonte;
      if (v === undefined || v === null) v = [];
      var r = (v && typeof v === "object" && !Array.isArray(v) && ("data" in v || "error" in v))
        ? { data: "data" in v ? v.data : null, error: v.error || null }
        : { data: v, error: null };
      // single()/maybeSingle() devolvem UMA linha, como o supabase de verdade
      if (q.um) r = { data: Array.isArray(r.data) ? (r.data.length ? r.data[0] : null) : r.data, error: r.error };
      return r;
    }
    function consulta(tabela) {
      var q = { tabela: tabela, filtros: {}, ops: [], corpo: null, colunas: "", acao: "select", um: false };
      function poe(m, tipo) {
        q[m] = function () {
          var args = [].slice.call(arguments);
          q.ops.push({ m: m, args: args });
          if (tipo === "escrita") {
            q.acao = m; q.corpo = args[0];
            if (opts.onEscreve) opts.onEscreve({ tabela: tabela, acao: m, corpo: args[0], q: q });
          } else if (tipo === "filtro" && typeof args[0] === "string") {
            q.filtros[args[0]] = args.length > 1 ? args[1] : true;
          } else if (m === "select") { q.colunas = args[0] || ""; }
          return q;
        };
      }
      FILTROS.forEach(function (m) { poe(m, "filtro"); });
      ESCRITAS.forEach(function (m) { poe(m, "escrita"); });
      OUTROS.forEach(function (m) { poe(m, "outro"); });
      q.single = function () { q.um = true; q.ops.push({ m: "single", args: [] }); return q; };
      q.maybeSingle = function () { q.um = true; q.ops.push({ m: "maybeSingle", args: [] }); return q; };
      q.then = function (fn, fr) { return Promise.resolve(resolve(q)).then(fn, fr); };
      q.catch = function (fn) { return Promise.resolve(resolve(q)).catch(fn); };
      q.finally = function (fn) { return Promise.resolve(resolve(q)).finally(fn); };
      return q;
    }
    var cli = {
      from: function (tb) { if (opts.onFrom) opts.onFrom(tb); return consulta(tb); },
      rpc: opts.rpc || function () { return Promise.resolve({ data: null, error: null }); },
      auth: opts.auth || { getSession: function () { return Promise.resolve({ data: { session: null } }); } },
      storage: opts.storage || { from: function () { return {
        upload: function () { return Promise.resolve({ data: null, error: null }); },
        remove: function () { return Promise.resolve({ data: null, error: null }); },
        list: function () { return Promise.resolve({ data: [], error: null }); },
        getPublicUrl: function () { return { data: { publicUrl: "" } }; },
        createSignedUrl: function () { return Promise.resolve({ data: { signedUrl: "" }, error: null }); },
      }; } },
      channel: opts.channel || function () {
        var c = { on: function () { return c; }, subscribe: function () { return c; }, unsubscribe: function () { return Promise.resolve("ok"); } };
        return c;
      },
      removeChannel: function () {},
      functions: { invoke: function () { return Promise.resolve({ data: null, error: null }); } },
    };
    if (opts.client) Object.keys(opts.client).forEach(function (k) { cli[k] = opts.client[k]; });
    var nv = { aid: "aid" in opts ? opts.aid : "acad-mock", client: cli };
    if (opts.extra) Object.keys(opts.extra).forEach(function (k) { nv[k] = opts.extra[k]; });
    return nv;
  };
})();
`;
/* Embrulha o browser pra TODO contexto nascer com o window.mockNuvem — a suíte
 * cria dezenas de contextos e um helper que só existisse no primeiro seria
 * armadilha pro próximo bloco. Vale também pro browser.newPage(), que por
 * dentro chama este mesmo newContext. */
function comMockNuvem(b, timeoutMs) {
  const orig = b.newContext.bind(b);
  b.newContext = async function (o) {
    const c = await orig(o);
    await c.addInitScript(MOCK_NUVEM);
    // teto por ação: sem ele, uma seleção que nunca aparece segura a suíte nos
    // 30 s do padrão em CADA passo — e o lote atrasa sem diagnóstico
    c.setDefaultTimeout(timeoutMs || 20000);
    return c;
  };
  return b;
}

module.exports = { MOCK_NUVEM, comMockNuvem };
