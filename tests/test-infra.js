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
  /* v756: a envia-email é a função que manda a SENHA do aluno e os e-mails da
   * régua, e não tinha uma linha de teste sobre o que ela aceita — só o
   * roteamento no test-diagnostico. Ela sai em nome do domínio da marca: um
   * destino torto ou um corpo gigante queimam a reputação do remetente no
   * Resend e o e-mail de senha de TODO MUNDO passa a cair no spam. */
  t(/\^\[\^@\\s\]\+@\[\^@\\s\]\+\\\.\[\^@\\s\]\+\$/.test(email),
    "envia-email: confere o e-mail de destino antes de gastar a cota do Resend");
  t(/html\.length > 100_000/.test(email) && /!assunto \|\| !html/.test(email),
    "envia-email: recusa corpo vazio e corpo gigante (o remetente é o domínio da marca)");
  t(/const de = [^\n]*EMAIL_DE/.test(email) && !/body\.de\b/.test(email),
    "envia-email: o remetente sai do Secret EMAIL_DE — quem chama não escolhe de quem o e-mail parece vir");
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

  /* ============================================== higiene da PRÓPRIA suíte
   * v756: três armadilhas que já custaram caro apareceram nas revisões. Elas
   * não são regra de produto — são regra de TESTE —, e sem uma vigia voltam
   * na próxima suíte que alguém escrever copiando a de cima. */
  console.log("\nHigiene das suítes (tests/):");
  {
    const arqs = fs.readdirSync(__dirname).filter((f) => /^test-.*\.js$/.test(f));
    t(arqs.length >= 20, "achou as suítes pra conferir (" + arqs.length + ")");

    /* 1) data de semente em UTC. `toISOString().slice(0,10)` é UTC; o painel
     * decide "hoje" com S.todayISO(), que é LOCAL. Rodando às 22h no Brasil a
     * semente dizia "amanhã" e a suíte ficava vermelha sem motivo. */
    // (tira comentário antes de medir — o próprio aviso desta regra cita o padrão)
    const semComentario = (f) => fs.readFileSync(path.join(__dirname, f), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const comUtc = arqs.filter((f) => /toISOString\(\)\s*\.slice\(0,\s*10\)/.test(semComentario(f)));
    if (comUtc.length) console.log("     " + comUtc.join(", "));
    t(comUtc.length === 0, "nenhuma suíte calcula dia de semente em UTC (use diaISO(), que é local)");

    /* 2) `|| true` num campo que um ok() vai ler: o valor vira constante e o
     * assert deixa de medir qualquer coisa (achado real no contrato digital). */
    const comOuTrue = arqs.filter((f) => /\|\|\s*true,\s*$/m.test(fs.readFileSync(path.join(__dirname, f), "utf8")));
    if (comOuTrue.length) console.log("     " + comOuTrue.join(", "));
    t(comOuTrue.length === 0, "nenhum campo de resultado termina em `|| true` (constante disfarçada de medida)");

    /* 3) suíte de navegador sem .catch: uma seleção que falha vira rejeição
     * não tratada, o resumo não é impresso e sobra Chromium órfão. */
    const semCatch = arqs.filter((f) => {
      const src = fs.readFileSync(path.join(__dirname, f), "utf8");
      if (!/chromium\.launch/.test(src)) return false;   // suíte de node puro não precisa
      return !/\.catch\(/.test(src) && !/unhandledRejection/.test(src);
    });
    if (semCatch.length) console.log("     " + semCatch.join(", "));
    t(semCatch.length === 0, "toda suíte de navegador trata a exceção que a derruba (.catch ou unhandledRejection)");

    /* 4) o cliente de nuvem de mentira é UM só (tests/_nuvem.js). Cada suíte
     * com o seu, ESTREITO, é como nascia o "nuvem.client.from(...).upsert is
     * not a function": bastava um timer do painel tocar outra tabela enquanto
     * o mock daquele bloco estava instalado. */
    const comCloud = arqs.filter((f) => /(MTStore|S)\.cloud\s*=/.test(fs.readFileSync(path.join(__dirname, f), "utf8")));
    const semHelper = comCloud.filter((f) => !/require\(["']\.\/_nuvem\.js["']\)/.test(fs.readFileSync(path.join(__dirname, f), "utf8")));
    if (semHelper.length) console.log("     " + semHelper.join(", "));
    t(fs.existsSync(path.join(__dirname, "_nuvem.js")) && comCloud.length >= 4 && semHelper.length === 0,
      "toda suíte que troca o MTStore.cloud usa o cliente compartilhado (tests/_nuvem.js) — " + comCloud.length + " suítes");

    // 5) e todas leem o servidor do ambiente (rodar noutra porta não pode calar suíte)
    const semBase = arqs.filter((f) => {
      const src = fs.readFileSync(path.join(__dirname, f), "utf8");
      return /goto\(/.test(src) && !/process\.env\.(BASE_URL|MT_BASE)/.test(src);
    });
    if (semBase.length) console.log("     " + semBase.join(", "));
    t(semBase.length === 0, "toda suíte que abre página lê o endereço do ambiente (BASE_URL)");
  }

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

  /* v756 — O APAGÃO DO ESTÚDIO. Um professor de verdade perdeu 11 alunos, 77
   * sessões e 15 pagamentos: a marca do demo tinha sido sincronizada pra conta
   * dele semanas antes, e ao entrar na conta a limpeza do demo apagou o
   * ptStudio do aparelho. O carimbo local era IGUAL ao da nuvem (o estado
   * normal logo depois de um envio), então a puxada não caía em nenhum dos
   * dois braços — a nuvem nunca era reaplicada, o painel abria vazio e o vazio
   * subia por cima. Estas três travas fecham o caminho inteiro. */
  const r4b = await p.evaluate(async () => {
    const S = window.MTStore, sync = window.__MTSync._estado;
    const stamp = "2099-05-01T00:00:00.000000+00:00";
    const cheio = { alunos: [{ id: "a1" }, { id: "a2" }, { id: "a3" }] };
    function cliente(rows) {
      const q = { select: () => q, eq: () => q, gt: () => q, then: (res) => Promise.resolve({ data: rows, error: null }).then(res) };
      return { from: () => q };
    }
    S.write("estudioX", cheio);
    const m = JSON.parse(localStorage.getItem("mtsync:ts") || "{}");
    m["mtapp:estudioX"] = stamp; localStorage.setItem("mtsync:ts", JSON.stringify(m));
    localStorage.removeItem("mtapp:estudioX");           // foi isso que a limpeza do demo fez
    sync.client = cliente([{ chave: "mtapp:estudioX", valor: cheio, atualizado: stamp }]);
    sync.aid = "acad-t"; sync.marca = "2000-01-01T00:00:00.000000+00:00"; sync.marcaAid = "acad-t"; sync.reconciliou = true;
    await window.__MTSync.puxa();
    const voltou = ((S.read("estudioX", { alunos: [] }) || {}).alunos || []).length;
    sync.client = null;
    return { voltou };
  });
  t(r4b.voltou === 3, "chave apagada do aparelho volta da nuvem mesmo com o carimbo IGUAL — o caminho que levou o estúdio de um professor");

  // a trava do apagão: nenhuma gravação leva uma lista de gente de 3+ pra zero
  const r4c = await p.evaluate(() => {
    const S = window.MTStore;
    const puro = window.__zerouTudo;
    const avisos = []; const alertaOrig = window.alert; window.alert = (msg) => avisos.push(String(msg));
    S.write("estudioY", { alunos: [{ id: "a" }, { id: "b" }, { id: "c" }], pagamentos: [{ v: 1 }] });
    const gravou = S.write("estudioY", { alunos: [], pagamentos: [{ v: 1 }] });
    const restou = ((S.read("estudioY", { alunos: [] }) || {}).alunos || []).length;
    const bak = !!localStorage.getItem("mtsync:bak:mtapp:estudioY");
    // apagar um por um continua valendo, e uma lista curta não trava
    const tirouUm = S.write("estudioY", { alunos: [{ id: "a" }, { id: "b" }], pagamentos: [{ v: 1 }] });
    S.write("curta", { alunos: [{ id: "a" }, { id: "b" }] });
    const curtaZera = S.write("curta", { alunos: [] });
    // quem limpa de propósito avisa
    window.__MT_LIMPANDO = true;
    S.write("estudioZ", { alunos: [{ id: "a" }, { id: "b" }, { id: "c" }] });
    const dePropósito = S.write("estudioZ", { alunos: [] });
    window.__MT_LIMPANDO = false;
    window.alert = alertaOrig;
    return { gravou, restou, bak, avisos: avisos.length, tirouUm, curtaZera, dePropósito,
      puroPega: puro({ alunos: 11 }, { alunos: 0 }) === "alunos",
      puroDeixa: puro({ alunos: 11 }, { alunos: 10 }) === "" };
  });
  t(r4c.gravou === false && r4c.restou === 3 && r4c.bak && r4c.avisos === 1,
    "gravação que zera 3+ alunos de uma vez é RECUSADA, guarda o que tentou gravar e avisa em português");
  t(r4c.tirouUm === true && r4c.curtaZera === true && r4c.dePropósito === true && r4c.puroPega && r4c.puroDeixa,
    "apagar um por um, lista curta e limpeza de propósito (__MT_LIMPANDO) continuam passando");

  // v756: quem apaga a conta DE PROPÓSITO avisa a trava — senão a última
  // gravação antes de sair da página seria recusada com um alerta assustador
  await p.addScriptTag({ url: BASE + "/assets/excluir-conta.js" });
  const r4d = await p.evaluate(() => {
    const fonte = String(window.MT_EXCLUIR && window.MT_EXCLUIR.limpaAparelho || "");
    return { temFlag: /__MT_LIMPANDO\s*=\s*true/.test(fonte),
             esquece: /esqueceChave/.test(fonte),
             temEsqueceNoStore: typeof window.MTStore.esqueceChave === "function" };
  });
  t(r4d.temFlag && r4d.esquece && r4d.temEsqueceNoStore,
    "excluir minha conta declara a limpeza (__MT_LIMPANDO) e limpa a memória de contagem do store");

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
