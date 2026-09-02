/* Infra — store.js, service workers, pwa-update e as regras das funções/SQL.
 *
 * Por que esta suíte existe (v747): a revisão de infra achou defeitos que
 * nenhuma outra suíte olhava — a trilha de auditoria que nunca subia pra
 * nuvem, o eco do próprio salvamento repintando o painel inteiro 30 s depois,
 * a aba vizinha subindo de volta o que veio da nuvem, o backup que esquecia
 * chaves, o reload do service worker no meio de um formulário. A parte de
 * navegador roda em Playwright contra apps/auditoria.html (uma página leve
 * que carrega o store.js); a parte de arquivo é node puro e confere que as
 * regras novas das Edge Functions e do SQL continuam no repositório.
 *
 * Roda com BASE_URL apontando pro servidor local (tests/run.sh cuida disso). */
const fs = require("fs");
const path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const raiz = path.join(__dirname, "..");

let ok = 0, falhas = 0;
function t(cond, nome) {
  if (cond) { ok++; console.log("  ✅ " + nome); }
  else { falhas++; console.log("  ❌ " + nome); }
}
const le = (p) => fs.readFileSync(path.join(raiz, p), "utf8");

(async () => {
  // ================================================================ arquivos
  console.log("Regras novas nas Edge Functions (o ping de cada uma diz qual versão está no ar):");
  const fn = (n) => le("supabase/functions/" + n + "/index.ts");
  const regua = fn("regua-diaria");
  t(/st\.config\.reguaOff\) return out/.test(regua) && /"regua-off"/.test(regua),
    "regua-diaria: obedece o interruptor config.reguaOff do painel (regra regua-off)");
  const email = fn("envia-email");
  t(/rest\/v1\/membros\?select=academia_id/.test(email) && /"membro"/.test(email),
    "envia-email: só membro de academia envia (regra membro)");
  const chat = fn("chat-envia");
  t(/async function respostaIA\([^)]*\): Promise<\{ ok: boolean/.test(chat) && /erroAnthropic\(r\.status\) \}/.test(chat) &&
    !/IA indisponível — confira o secret ANTHROPIC_API_KEY/.test(chat),
    "chat-envia: testar/sugerir repassam o erro real da Anthropic (429 ≠ chave errada) — regra erro-ia");
  t(/async function nomeAcademia/.test(chat) && !/academia \(TORQUE FIT\)/.test(chat) && !/da academia TORQUE FIT/.test(chat),
    "chat-envia: o robô não se apresenta mais como TORQUE FIT pra todo mundo (regra nome-academia)");
  t((chat.match(/order=criado\.asc&limit=1/g) || []).length >= 6, "chat-envia: membros?…limit=1 sempre ordenado (regra membro-ordenado)");
  const meta = fn("meta-webhook");
  t(/function diaBR\(/.test(meta) && !/new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/.test(meta),
    "meta-webhook: 'hoje' das ferramentas e do prompt é o dia do Brasil (regra fuso-br)");
  t(meta.indexOf('r = await sb("chat_mensagens"') < meta.indexOf("nao_lidas: (conversa.nao_lidas || 0) + 1"),
    "meta-webhook: a mensagem entra ANTES de mexer na conversa — reentrega da Meta não conta +1 (regra msg-antes-conversa)");
  t(/on_conflict=academia_id,canal,contato_id/.test(meta) && /merge-duplicates/.test(meta),
    "meta-webhook: criar conversa não perde a mensagem numa corrida (on_conflict + merge-duplicates)");
  t(/cred\.semAssinatura\) \{/.test(meta) && /cred\.origem === "propria"\) cred\.semAssinatura = true/.test(meta),
    "meta-webhook: número próprio sem App Secret grava, mas o robô não age (regra sem-assinatura-so-grava)");
  t(/bot_estado: "humano" \}\),\s*\}\);\s*\} catch \{ \/\* segue com o texto \*\/ \}/.test(meta) && !/A equipe confirma com você em instantes/.test(meta),
    "meta-webhook: esgotar as voltas de ferramenta passa a conversa pra equipe de verdade (regra equipe-de-verdade)");
  t(/acao"\) === "ping"/.test(meta) && /"dono-unico", "fuso-br"/.test(meta), "meta-webhook: GET ?acao=ping devolve as regras");
  const pag = fn("pagamentos");
  t(/customers\?cpfCnpj=/.test(pag) && /customer: clienteId/.test(pag), "pagamentos: assinar reusa o cliente Asaas pelo CPF (regra asaas-cliente-unico)");
  t(/interrupted: false, enabled: true/.test(pag) && /v3\/webhooks\/" \+ encodeURIComponent\(cfg\.asaasWebhookId\)/.test(pag),
    "pagamentos: webhook Asaas interrompido é religado a cada link (regra asaas-webhook-religa)");
  t(/if \(!aluno \|\| !aluno\.id\) return json\(\{ erro: "a loja ainda não sincronizou/.test(pag),
    "pagamentos: loja sem aluno no blob devolve 409 em vez de link sem referência (regra loja-ref)");
  const pgm = fn("pagarme");
  t(!/body\.acao === "assinatura-status"\) \{/.test(pgm) && !/body\.acao === "assinatura-cancelar"\) \{/.test(pgm) &&
    /body\.acao === "assinatura-status"\) body\.acao = "assinatura_status"/.test(pgm),
    "pagarme: as ações com hífen viram as com sublinhado — um handler só (regra acao-normalizada)");
  const loja = fn("assinatura-loja");
  t(/assinatura_evento_em\.lt\./.test(loja) && /event_timestamp_ms/.test(loja), "assinatura-loja: só aplica evento mais novo que o último (regra ordem-eventos)");
  const sup = fn("suporte");
  t(/timeZone: "America\/Sao_Paulo"/.test(sup) && /email, tipo, mensagem: msg/.test(sup) && !/tipo: body\.tipo \|\| "bug"/.test(sup),
    "suporte: protocolo com a data do Brasil, tipo validado e e-mail conferido (regras tipo-validado/protocolo-br/email-validado)");
  const push = fn("push-envia");
  t(/timeZone: "America\/Sao_Paulo"/.test(push) && /corpo\.titulo \|\| "TORQUE ON"/.test(push) && !/torquefit\.com\.br/.test(push) && !/torquefit\.com\.br/.test(regua),
    "push-envia/regua-diaria: aulas_hoje no fuso do Brasil, marca TORQUE ON, VAPID com o e-mail do produto");

  console.log("\nSQL (supabase-setup.sql):");
  const sql = le("supabase-setup.sql");
  t(/chave = 'mtapp:grade'/.test(sql) && !/chave = 'grade'/.test(sql), "app_aluno_agenda lê 'mtapp:grade' — o limite de agendamentos configurado passa a valer");
  t(/create or replace function public\.hoje_br\(\)/.test(sql) && /values \(v_acad, t, public\.hoje_br\(\), greatest/.test(sql) &&
    /p_dia < public\.hoje_br\(\)/.test(sql) && /coalesce\(p_data, public\.hoje_br\(\)\)/.test(sql),
    "check-in, pedido de horário e avaliação usam o dia do Brasil (hoje_br)");
  const quest = sql.slice(sql.indexOf("create or replace function public.app_quest_responde"));
  t(/v_acad := public\.app_aluno_ativo\(t\);/.test(quest.slice(0, 1200)) && !/from public\.app_aluno where token = t limit 1/.test(quest.slice(0, 1200)),
    "app_quest_responde passa pela porta única (aluno cortado não responde mais)");
  t(!/where user_id = auth\.uid\(\) limit 1;/.test(sql) && !/papel = 'dono' limit 1;/.test(sql),
    "nenhum 'membros … limit 1' sem ordem — quem está em duas academias sempre cai na mesma");
  const revoga = sql.slice(sql.indexOf("create or replace function public.aluno_revoga_acesso"));
  t((revoga.slice(0, 3000).match(/delete from public\.push_subs\s+where token = p_token/g) || []).length === 2,
    "revogar (sem apagar) também tira a inscrição de push");
  t(/delete from public\.push_subs where token in \(select token from rev\)/.test(sql), "a faxina tira o push de quem revogou");
  t((sql.match(/assinatura_via = 'hq'/g) || []).length === 2, "hq_cliente_set grava academias.assinatura_status (uma verdade só pra 'está pagando')");
  t(/d\.chave = 'mtapp:produtos'/.test(sql) && /'item_invalido'/.test(sql), "app_aluno_pedido recalcula o total pelo catálogo");
  t((sql.match(/\(select count\(\*\) from matricula_config\) = 1/g) || []).length === 2, "matrícula sem ?a= só atende com UMA config no banco");
  t(/'post_invalido'/.test(sql) && (sql.match(/academia_id = f\.academia_id/g) || []).length >= 3, "reações amarradas à academia do post");
  t(/revoke execute on function public\.zap_verify_novo\(\)/.test(sql) && /revoke execute on function public\.pag_token_novo\(\)/.test(sql) &&
    /revoke execute on function public\.app_retorno_mescla\(jsonb, jsonb\)/.test(sql),
    "helpers internos sem EXECUTE público");
  t(/add column if not exists assinatura_evento_em timestamptz/.test(sql), "academias.assinatura_evento_em existe pro assinatura-loja");

  // ================================================================ navegador
  console.log("\nstore.js no navegador:");
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const ctx = await b.newContext({ viewport: { width: 1200, height: 800 } });
  const p = await ctx.newPage();
  const erros = [];
  p.on("pageerror", (e) => erros.push(String(e.message)));
  await p.goto(BASE + "/apps/auditoria.html");
  await p.waitForFunction(() => !!window.MTStore && !!window.__MTSync);

  const r1 = await p.evaluate(() => {
    localStorage.clear();
    const S = window.MTStore;
    const deu = S.write("x", { lista: [1, 2] });
    const ts = JSON.parse(localStorage.getItem("mtsync:ts") || "{}");
    const aud = S.read("auditoria", { registros: [] });
    return { deu, comPrefixo: !!ts["mtapp:auditoria"], semPrefixo: "auditoria" in ts, registros: aud.registros.length };
  });
  t(r1.deu === true, "write() devolve true quando gravou");
  t(r1.comPrefixo && !r1.semPrefixo && r1.registros === 1, "a trilha de auditoria é marcada COM o prefixo (mtapp:auditoria) — agora ela sobe pra nuvem");

  const r2 = await p.evaluate(() => {
    const S = window.__sincronizavel;
    return ["mtapp:intento", "mtapp:quem", "mtapp:fechVisto", "mtapp:logGeral", "mtapp:ptAssinatura", "mtapp:academia"].every((k) => !S(k)) && S("mtapp:ptStudio") && S("mtpf:contrato");
  });
  t(r2, "chaves de aparelho (intento, quem, fechVisto, logGeral, ptAssinatura…) nunca sincronizam; ptStudio e mtpf: sim");

  const r3 = await p.evaluate(() => {
    const c = window.__MTSync.carimboDaNuvem;
    return c("2026-09-01T10:00:00.123456+00:00") && c("2026-09-01T10:00:00-03:00") && !c("2026-09-01T10:00:00.123Z") && !c("");
  });
  t(r3, "carimboDaNuvem distingue o carimbo do Postgres (+00:00) do local (Z)");

  // puxa(): eco idêntico não acorda ninguém; conteúdo diferente acorda — e o ts vira o da nuvem
  const r4 = await p.evaluate(async () => {
    const S = window.MTStore, sync = window.__MTSync._estado;
    let acordou = 0;
    S.onChange((k) => { if (k === "eco") acordou++; });
    S.write("eco", { a: 1 });
    acordou = 0; // o próprio write acorda os ouvintes — o que interessa é a puxada
    const stampNuvem = "2099-01-01T00:00:00.000000+00:00";
    function cliente(rows) {
      const q = { select: () => q, eq: () => q, gt: () => q, then: (res) => Promise.resolve({ data: rows, error: null }).then(res) };
      return { from: () => q };
    }
    sync.client = cliente([{ chave: "mtapp:eco", valor: { a: 1 }, atualizado: stampNuvem }]);
    sync.aid = "acad-t"; sync.marca = "2000-01-01T00:00:00.000000+00:00"; sync.marcaAid = "acad-t"; sync.reconciliou = true;
    await window.__MTSync.puxa();
    const ts1 = JSON.parse(localStorage.getItem("mtsync:ts"))["mtapp:eco"];
    const igual = acordou;
    sync.client = cliente([{ chave: "mtapp:eco", valor: { a: 2 }, atualizado: "2099-01-02T00:00:00.000000+00:00" }]);
    await window.__MTSync.puxa();
    const dif = acordou;
    const val = S.read("eco", null);
    sync.client = null;
    return { igual, dif, ts1, val };
  });
  t(r4.igual === 0 && r4.ts1 === "2099-01-01T00:00:00.000000+00:00", "eco da nuvem com o MESMO conteúdo não dispara os ouvintes (o painel não repinta) — só o carimbo é atualizado");
  t(r4.dif === 1 && r4.val && r4.val.a === 2, "conteúdo diferente vindo da nuvem é aplicado e avisa os ouvintes");

  // enviaSujas(): guarda o carimbo que o servidor devolveu
  const r5 = await p.evaluate(async () => {
    const S = window.MTStore, sync = window.__MTSync._estado;
    S.write("env", { b: 1 });
    const stamp = "2099-03-01T00:00:00.000000+00:00";
    let pediuSelect = false;
    sync.client = { from: () => ({ upsert: () => ({ select: () => { pediuSelect = true; return Promise.resolve({ data: [{ chave: "mtapp:env", atualizado: stamp }], error: null }); } }) }) };
    sync.aid = "acad-t"; sync.reconciliou = true;
    sync.sujas = { "mtapp:env": true };
    window.__MTSync.enviaSujas();
    await new Promise((r) => setTimeout(r, 50));
    const ts = JSON.parse(localStorage.getItem("mtsync:ts"))["mtapp:env"];
    // mock antigo, sem .select: continua funcionando (só a promessa)
    let semSelectOk = false;
    sync.client = { from: () => ({ upsert: () => Promise.resolve({ error: null }) }) };
    sync.sujas = { "mtapp:env": true };
    try { window.__MTSync.enviaSujas(); semSelectOk = true; } catch (e) {}
    await new Promise((r) => setTimeout(r, 30));
    sync.client = null;
    return { pediuSelect, ts, semSelectOk, stamp };
  });
  t(r5.pediuSelect && r5.ts === r5.stamp, "enviaSujas guarda o carimbo do SERVIDOR — o eco do próprio envio compara igual na puxada seguinte");
  t(r5.semSelectOk, "cliente sem .select (mocks antigos) continua aceito");

  // contagem em memória: o logGeral continua contando certo sem re-parsear
  const r6 = await p.evaluate(() => {
    const S = window.MTStore;
    S.write("cont", { itens: [1, 2, 3] });
    S.write("cont", { itens: [1, 2, 3, 4] });
    const log = JSON.parse(localStorage.getItem("mtapp:logGeral") || "[]").filter((l) => l.k === "cont");
    return { ultimo: log[log.length - 1] && log[log.length - 1].resumo, cache: window.__MTSync.contagemDe("mtapp:cont") };
  });
  t(r6.ultimo === "incluído (3 → 4)" && r6.cache === 4, "logGeral diz 'incluído (3 → 4)' usando a contagem em memória");

  // backup: chaves que faltavam + documentos preenchíveis + auditoria única
  const r7 = await p.evaluate(async () => {
    const S = window.MTStore;
    const keys = S.backupKeys();
    localStorage.setItem("mtpf:contrato", JSON.stringify({ campo: "x" }));
    const antes = S.read("auditoria", { registros: [] }).registros.length;
    const arq = new File([JSON.stringify({ formato: "metodo-torque-backup", exportado: "2026-08-01T00:00:00Z",
      alunos: { alunos: [{ id: 1 }] }, contas: { lista: [] }, copiloto: { hist: [1] }, matriculaOnline: { pix: "abc" },
      _preenchiveis: { anamnese: { q1: "sim" } } })], "b.json", { type: "application/json" });
    await S.importBackup(arq);
    const aud = S.read("auditoria", { registros: [] }).registros;
    return { keys, doc: localStorage.getItem("mtpf:anamnese"), pix: S.read("matriculaOnline", {}).pix,
      novos: aud.length - antes, ultimo: aud[aud.length - 1] && aud[aud.length - 1].k };
  });
  t(r7.keys.indexOf("matriculaOnline") > -1 && r7.keys.indexOf("copiloto") > -1, "backup leva matriculaOnline e copiloto");
  t(r7.doc === JSON.stringify({ q1: "sim" }) && r7.pix === "abc", "restaurar traz os documentos preenchidos (mtpf:) e as chaves novas");
  t(r7.novos === 1 && /^backup restaurado/.test(r7.ultimo || ""), "a restauração deixa UM registro na auditoria, não um por chave");

  // cota estourada: write devolve false
  const r8 = await p.evaluate(() => {
    const orig = Storage.prototype.setItem;
    window.alert = () => {};
    Storage.prototype.setItem = function (k, v) { if (k === "mtapp:cheio") { const e = new Error("QuotaExceededError"); e.name = "QuotaExceededError"; throw e; } return orig.call(this, k, v); };
    const r = window.MTStore.write("cheio", { a: 1 });
    Storage.prototype.setItem = orig;
    return r;
  });
  t(r8 === false, "write() devolve false quando a cota do navegador estoura");

  // pwa-update: só recarrega ociosa
  await p.addScriptTag({ url: BASE + "/assets/pwa-update.js" });
  const r9 = await p.evaluate(() => {
    const oc = window.MT_PWA_OCIOSO;
    const a = oc();
    const inp = document.createElement("input"); inp.type = "text"; document.body.appendChild(inp); inp.focus();
    const b = oc();
    inp.blur(); inp.remove();
    window.__MTSync._estado.sujas = { "mtapp:x": true };
    const c = oc();
    window.__MTSync._estado.sujas = {};
    return { a, b, c, d: oc() };
  });
  t(r9.a === true && r9.b === false && r9.c === false && r9.d === true, "pwa-update só recarrega com a página ociosa (sem campo focado e sem envio pendente)");

  const semSw = le("apps/store.js");
  t(!/addEventListener\("controllerchange"/.test(semSw) && (le("assets/pwa-update.js").match(/addEventListener\("controllerchange"/g) || []).length === 1,
    "o bloco de atualização do service worker saiu do store.js (o painel registrava dois reloads)");

  t(erros.length === 0, "nenhum erro de JS na página (" + erros.join(" | ").slice(0, 200) + ")");

  await b.close();
  console.log("\nResultado: " + ok + " ok, " + falhas + " falhas");
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error("💥", e); process.exit(1); });
