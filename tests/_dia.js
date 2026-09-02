/* Dia de HOJE em hora LOCAL — um lugar só, pro node e pro navegador.
 *
 * v756: as sementes calculavam o dia com `toISOString().slice(0,10)`, que é
 * UTC, enquanto o painel decide "hoje" com S.todayISO(), que é LOCAL
 * (apps/store.js). Numa máquina em America/Sao_Paulo rodando das 21h à
 * meia-noite a semente dizia "amanhã" e a tela não mostrava o item em "hoje":
 * suíte vermelha "do nada", só no fluxo local documentado no CLAUDE.md, nunca
 * no CI (que roda em UTC) — o pior tipo de teste intermitente, porque corrói a
 * confiança no único alarme automático do projeto.
 *
 * Aqui o fuso é CRAVADO (o node e o chromium herdam do TZ) e diaISO() faz a
 * mesma conta do store. Não começa com "test-", então o run.sh não roda este
 * arquivo como suíte.
 *
 *   const { diaISO, comDiaISO } = require("./_dia.js");
 *   const b = comDiaISO(await chromium.launch(...));   // todo contexto ganha window.diaISO
 */
process.env.TZ = process.env.TZ || "America/Sao_Paulo";

function diaISO(d) {
  const x = d instanceof Date ? d : new Date(d === undefined ? Date.now() : d);
  const p2 = (n) => String(n).padStart(2, "0");
  return x.getFullYear() + "-" + p2(x.getMonth() + 1) + "-" + p2(x.getDate());
}

// a mesma conta, pro código que roda DENTRO da página
const DIA_ISO_PAGINA = `
window.diaISO = function (d) {
  var x = d instanceof Date ? d : new Date(d === undefined ? Date.now() : d);
  function p2(n) { return String(n).padStart(2, "0"); }
  return x.getFullYear() + "-" + p2(x.getMonth() + 1) + "-" + p2(x.getDate());
};
`;

/* Embrulha o browser pra TODO contexto nascer com o window.diaISO. Vale também
 * pro browser.newPage(), que por dentro chama este mesmo newContext. */
function comDiaISO(b) {
  const orig = b.newContext.bind(b);
  b.newContext = async function (o) {
    const c = await orig(o);
    await c.addInitScript(DIA_ISO_PAGINA);
    return c;
  };
  return b;
}

module.exports = { diaISO, DIA_ISO_PAGINA, comDiaISO };
