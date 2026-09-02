// SaaS TORQUE ON: site comercial, painel HQ (trava, clientes, plano, pagamento, Pix, funil) e SQL
let chromium;
try { chromium = require("playwright").chromium; } catch (e) { chromium = require("/opt/node22/lib/node_modules/playwright").chromium; }
const fs = require("fs");
const EXEC = process.env.CHROMIUM_PATH || (fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

let falhas = 0;
function ok(cond, nome) {
  console.log((cond ? "  ✅ " : "  ❌ ") + nome);
  if (!cond) falhas++;
}
function crcNode(s) {
  let crc = 0xFFFF;
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
  }
  return ("0000" + crc.toString(16).toUpperCase()).slice(-4);
}

(async () => {
  const b = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } });
  await ctx.addInitScript(() => {
    if (window !== window.top) return;
    if (localStorage.getItem("mtapp:seeded")) return;
    localStorage.setItem("mtapp:seeded", "1");
    localStorage.setItem("mtapp:perfil", JSON.stringify({ nome: "Raphael" }));
  });
  const erros = [];

  // ---------- 0) o SQL tem o bloco do HQ ----------
  console.log("SQL do TORQUE ON HQ:");
  const sql = fs.readFileSync(__dirname + "/../supabase-setup.sql", "utf8");
  ok(/saas_admins/.test(sql) && /saas_clientes/.test(sql) && /saas_pagamentos/.test(sql), "tabelas saas_admins/clientes/pagamentos no setup");
  ok(/hq_sou_admin/.test(sql) && /hq_clientes/.test(sql) && /hq_cliente_set/.test(sql) && /hq_pagamento_reg/.test(sql) && /hq_kpis/.test(sql), "as 5 funções hq_* existem");
  // guarda por FUNÇÃO, não por contagem: antes bastava a frase aparecer 4x no
  // arquivo, então dava pra tirar a guarda de uma função (ou de uma das duplicadas)
  // sem o teste perceber — e função hq_* security definer sem guarda expõe todas
  // as academias. Agora cada bloco hq_* (menos o próprio sou_admin) tem que ter.
  const semGuardaHq = sql.split(/create or replace function public\.hq_/).slice(1)
    .filter(function (bloco) {
      const nome = (bloco.match(/^\w+/) || [""])[0];
      if (/^sou_admin/.test(nome)) return false; // é o próprio verificador de admin
      return !/acesso restrito ao administrador/.test(bloco.slice(0, bloco.indexOf("$$;") + 3));
    })
    .map(function (bloco) { return "hq_" + (bloco.match(/^\w+/) || [""])[0]; });
  ok(semGuardaHq.length === 0, "toda função hq_* de dados exige admin (guarda por função)" + (semGuardaHq.length ? " — falta em: " + semGuardaHq.join(", ") : ""));
  ok(!/create policy[^;]*saas_/.test(sql), "tabelas saas_* sem policy (bloqueadas pra API — só as funções acessam)");
  // WhatsApp por profissional: o token do número de cada academia não pode ter
  // caminho de leitura pela API — só as funções (e a service key) enxergam
  ok(/create table if not exists public\.zap_config/.test(sql) && /alter table public\.zap_config enable row level security/.test(sql),
    "zap_config existe e nasce com RLS ligada");
  ok(!/create policy[^;]*zap_config/.test(sql), "zap_config sem policy: o token do WhatsApp não volta pra ninguém pela API");
  ok(/zap_config_salva/.test(sql) && /zap_config_ve/.test(sql) && /zap_config_apaga/.test(sql),
    "as 3 funções zap_config_* existem (salvar, ver o estado e desligar)");
  // gateway por profissional: mesma regra do zap_config — a chave do Mercado
  // Pago/Asaas/Pagar.me de cada professor fica selada, sem caminho de leitura
  ok(/create table if not exists public\.pag_config/.test(sql) && /alter table public\.pag_config enable row level security/.test(sql),
    "pag_config existe e nasce com RLS ligada");
  ok(!/create policy[^;]*pag_config/.test(sql), "pag_config sem policy: a chave do gateway não volta pra ninguém pela API");
  ok(/pag_config_salva/.test(sql) && /pag_config_ve/.test(sql) && /pag_config_apaga/.test(sql),
    "as 3 funções pag_config_* existem (salvar, ver o estado e desligar)");
  ok(!/json_build_object\([^)]*'chave'/.test(sql.slice(sql.indexOf("pag_config_ve"))),
    "pag_config_ve devolve provedor + tem_chave, nunca a chave em si");

  // BAIXA AUTOMÁTICA MULTI-GATEWAY: senha por academia + tabela de eventos selada
  ok(/add column if not exists webhook_token/.test(sql) && /pag_token_novo/.test(sql) &&
     /create unique index if not exists pag_config_webhook[\s\S]*?where webhook_token\s*<> ''/.test(sql),
    "pag_config ganhou a senha do webhook (gerada no servidor, índice único = um dono por senha)");
  ok(/update public\.pag_config set webhook_token = public\.pag_token_novo\(\) where coalesce\(webhook_token, ''\) = ''/.test(sql),
    "quem já tinha gateway ligado ganha a senha ao rodar o SQL de novo");
  ok(/create table if not exists public\.pag_eventos[\s\S]*?academia_id uuid not null/.test(sql),
    "pag_eventos existe e academia_id é NOT NULL — sem dono, não se grava nada");
  ok(/alter table public\.pag_eventos enable row level security/.test(sql) &&
     /create policy "pag_eventos_membros" on public\.pag_eventos\s*\n\s*for select using/.test(sql),
    "pag_eventos: membro só LÊ os eventos da própria academia (escrever é só a função, com a service key)");
  ok(!/create policy[^;]*pag_eventos[^;]*(insert|update|delete)/i.test(sql),
    "nenhuma política deixa o navegador escrever em pag_eventos");
  ok(/asaas_webhook_id = case when pag_config\.chave is distinct from excluded\.chave/.test(sql),
    "trocar a chave zera o webhook Asaas guardado — a função recria na conta nova (baixa não morre em silêncio)");

  // modelo marketplace: split do dono pronto, com a comissão NASCENDO em zero
  const fnPag = fs.readFileSync(__dirname + "/../supabase/functions/pagamentos/index.ts", "utf8");
  ok(/ASAAS_WALLET_DONO/.test(fnPag) && /percentualValue/.test(fnPag) &&
     /corpo\.split = sp/.test(fnPag) && /corpoAs\.split = spAs/.test(fnPag),
    "split do dono entra no LINK e na ASSINATURA Asaas (subir a comissão no futuro é só trocar o número)");
  ok(/if \(!wallet \|\| !\(pct > 0\) \|\| pct >= 100\) return null/.test(fnPag),
    "comissão 0 (ou carteira não configurada) = NENHUM split enviado — o professor recebe 100%");
  ok(/comissao_pct numeric not null default 0/.test(sql),
    "comissao_pct nasce em 0 no banco — o modelo existe desligado, sem mudar nada pra ninguém");
  ok(!/jsonb_build_object\([^)]*'token'/.test(sql.slice(sql.indexOf("zap_config_ve"))),
    "zap_config_ve devolve se TEM token, nunca o token");

  // modelo de cobrança: cada profissional paga o próprio WhatsApp. A função não
  // pode emprestar o número do dono do sistema por descuido — só de propósito
  const fnWa = fs.readFileSync(__dirname + "/../supabase/functions/whatsapp/index.ts", "utf8");
  ok(/WHATSAPP_COMPARTILHADO/.test(fnWa),
    "a função tem o interruptor WHATSAPP_COMPARTILHADO pro número emprestado");
  ok(/compartilhado \? Deno\.env\.get\("WHATSAPP_TOKEN"\)/.test(fnWa) &&
     /compartilhado \? Deno\.env\.get\("WHATSAPP_PHONE_ID"\)/.test(fnWa),
    "sem credencial própria e sem o interruptor, ninguém manda pelo número do dono (ele não paga a conta de todo mundo)");
  ok(/credencialDe/.test(fnWa) && /zap_config\?select=phone_id,token,template/.test(fnWa),
    "a função busca a credencial da academia de quem chamou");

  // a tela da academia liga o número dela, sem pedir URL de servidor
  const integ = fs.readFileSync(__dirname + "/../apps/integracoes.html", "utf8");
  ok(/id="waFone"/.test(integ) && /id="waToken"/.test(integ) && !/id="waUrl"/.test(integ),
    "Integrações pede ID do número e token — nenhuma URL de função pra colar");
  ok(/zap_config_salva/.test(integ) && /zap_config_ve/.test(integ) && /zap_config_apaga/.test(integ),
    "Integrações usa as RPCs (a credencial vai pra nuvem, não pro aparelho)");
  // os guias não podem mandar o cliente criar Secret pra ENVIAR: isso é do dono
  ok(!/Secrets<\/strong>: <code>WHATSAPP_TOKEN/.test(integ) && /Ligar meu número/.test(integ),
    "o passo a passo da academia manda ligar o número no painel, não criar Secret no Supabase");
  const guiaFn = fs.readFileSync(__dirname + "/../funcoes.html", "utf8");
  ok(/Não precisa criar Secret nenhum/.test(guiaFn) && /WHATSAPP_COMPARTILHADO/.test(guiaFn),
    "a página das funções explica que a whatsapp não precisa de Secret (e onde fica o interruptor do número emprestado)");

  /* ======================================================================
   * A TRAVA: tela de cliente não fala de servidor (v757)
   *
   * Um personal pagante desistiu de ligar o WhatsApp porque o guia mandava ele
   * criar conta na nuvem, criar chave de servidor e publicar função. Isso é
   * trabalho do DONO do sistema: o backend é UM projeto só, multi-tenant, com o
   * endereço cravado no assets/cloud-config.js — o cliente não tem acesso e
   * nunca vai ter. Sem uma trava, daqui a 40 versões alguém escreve de novo:
   * foi exatamente assim que a página do dono vazou pra tela do cliente.
   *
   * Só vale pro que o CLIENTE lê: HTML visível + texto dentro de aspas no JS
   * (que vira recado na tela). Comentário do código e console.error ficam de
   * fora de propósito — o detalhe técnico TEM que continuar existindo, só que
   * no console, pra gente diagnosticar quando ele manda o print.
   *
   * Varre também os ARQUIVOS .js que essas telas carregam: o recado de erro
   * mora lá dentro, não no HTML, e uma trava que só olha página deixaria a
   * porta aberta justamente onde o cliente mais topa com erro.
   * ====================================================================== */
  const TELAS_DO_CLIENTE = ["meta.html", "nutricao.html"]  // <- personal.html entra aqui
    .concat(fs.readdirSync(__dirname + "/../apps").filter(function (f) {
      // páginas do DONO ficam de fora: elas existem justamente pra ele mexer no
      // servidor. sql.html/funcoes.html/diagnostico.html moram na raiz (nem
      // entram nesta lista); apps/hq.html é o painel SaaS, trancado por hq_sou_admin
      return /\.html$/.test(f) && f !== "hq.html";
    }).map(function (f) { return "apps/" + f; }));
  /* Os .js que o cliente carrega junto com as telas. É onde mora o recado de
   * erro — o lugar em que ele MAIS lê texto nosso quando algo dá errado. */
  const ASSETS_DO_CLIENTE = ["assets/erro-funcao.js", "assets/funcao-nuvem.js", "assets/access.js"];
  // "App Secret" é campo da META, o professor precisa achar esse nome na tela dela
  const PALAVRAS_DE_DONO = /supabase-setup\.sql|sql\.html|funcoes\.html|diagnostico\.html|Supabase|\bSecrets?\b/i;
  /* O que sobra de um pedaço de JS depois de tirar o que o cliente NUNCA lê:
   * comentário (de bloco e de linha) e console.* — ali o texto técnico pode
   * (e deve) continuar dizendo "publique a função" e o nome do erro. */
  function frasesDoJS(js) {
    const limpo = String(js).replace(/\/\*[\s\S]*?\*\//g, " ")       // comentário de bloco
      .replace(/(^|[^:"'\\])\/\/[^\n]*/g, "$1 ")                      // comentário de linha (o : poupa https://)
      .replace(/console\.\w+\([\s\S]*?\);/g, " ");                   // recado técnico pro console
    const aspas = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`([^`\\]*)`/g;
    let frases = "";
    let m;
    while ((m = aspas.exec(limpo))) frases += " " + (m[1] || m[2] || m[3] || "");
    return frases;
  }
  function textoQueOClienteVE(html) {
    const scripts = [];
    const semScript = String(html).replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, function (_, js) { scripts.push(js); return " "; });
    const visivel = semScript.replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]*>/g, " ");
    return (visivel + " " + scripts.map(frasesDoJS).join(" ")).replace(/App Secret/g, "(campo da Meta)");
  }
  function varre(lista, comoLer) {
    const achados = [];
    lista.forEach(function (rel) {
      const t = comoLer(fs.readFileSync(__dirname + "/../" + rel, "utf8"));
      const achou = t.match(PALAVRAS_DE_DONO);
      if (achou) achados.push(rel + " (\"" + achou[0] + "\")");
    });
    return achados;
  }
  const vazados = varre(TELAS_DO_CLIENTE, textoQueOClienteVE);
  ok(vazados.length === 0,
    "nenhuma tela do cliente manda ele mexer em servidor (" + TELAS_DO_CLIENTE.length + " telas varridas)" +
    (vazados.length ? " — vazou em: " + vazados.slice(0, 6).join(", ") : ""));
  /* v757: a trava não alcançava arquivo .js, e era justamente lá que o erro
   * falava com o cliente — 401 mandava ele abrir o diagnostico.html e 405
   * mandava publicar a versão nova. Nenhum dos dois está ao alcance dele. */
  const vazadosJs = varre(ASSETS_DO_CLIENTE, frasesDoJS);
  ok(vazadosJs.length === 0,
    "nem os recados de erro dos .js do cliente (" + ASSETS_DO_CLIENTE.length + " arquivos varridos)" +
    (vazadosJs.length ? " — vazou em: " + vazadosJs.join(", ") : ""));

  // as telas do portal também pararam de pedir trabalho de servidor
  const chatPortal = fs.readFileSync(__dirname + "/../apps/chat.html", "utf8");
  ok((chatPortal.match(/<span class="num">/g) || []).length === 3 &&
     /Ligue o seu número/.test(chatPortal) && !/Publique as funções/.test(chatPortal),
    "a aba Instalação do Chat e IA virou 3 passos do CLIENTE (ligar o número, o webhook e testar)");
  ok(!/id="btnCodigo"/.test(integ) && !/Copiar código da função/.test(integ),
    "Integrações não oferece mais copiar o código de uma função (ferramenta de dono numa tela de cliente)");

  // o guia da Meta: sem passo impossível, e as duas trilhas separadas
  const guiaMeta = fs.readFileSync(__dirname + "/../meta.html", "utf8");
  ok(!/META_VERIFY_TOKEN|WHATSAPP_PHONE_ID|Verify JWT/.test(guiaMeta) && /Pule o "Token de acesso"/.test(guiaMeta),
    "o meta.html não cria mais chave de servidor e manda pular o token que vence em 24h");
  ok(/Parte 2 de 2/.test(guiaMeta) && /só no portal da academia/i.test(guiaMeta) &&
     /NÃO vale pro TORQUE PERSONAL/i.test(guiaMeta),
    "o meta.html separa mandar (todo mundo) de receber (só o portal, onde a tela de Conversas existe)");
  /* A tela de Conversas só existe no portal — é isso que justifica a parte 2 do
   * guia existir separada. Procura pelo USO da tabela (consulta), não pela
   * palavra solta: o personal.html cita as duas num comentário explicando
   * justamente por que não lê nenhuma delas. */
  const usaConversas = /chat_(conversas|mensagens)\?|from\(\s*["']chat_(conversas|mensagens)["']/;
  ok(usaConversas.test(fs.readFileSync(__dirname + "/../apps/chat.html", "utf8")) &&
     !usaConversas.test(fs.readFileSync(__dirname + "/../personal.html", "utf8")),
    "quem lê as conversas do WhatsApp é o portal (apps/chat.html); o TORQUE PERSONAL não consulta essas tabelas");

  // RECEBER por profissional: colunas, índices únicos e a RPC nova
  ok(/add column if not exists app_secret/.test(sql) && /add column if not exists verify_token/.test(sql) &&
     /add column if not exists ig_id/.test(sql) && /add column if not exists ig_token/.test(sql),
    "zap_config ganhou as colunas do receber (app_secret, verify_token, ig_id, ig_token)");
  ok(/create unique index if not exists zap_config_phone[\s\S]*?where phone_id\s*<> ''/.test(sql) &&
     /create unique index if not exists zap_config_ig[\s\S]*?where ig_id\s*<> ''/.test(sql) &&
     /create unique index if not exists zap_config_verify[\s\S]*?where verify_token\s*<> ''/.test(sql),
    "um número (e uma senha de aperto de mão) pertence a UMA academia só — índice único parcial");
  ok(/zap_config_salva2/.test(sql) && /grant execute on function public\.zap_config_salva2/.test(sql),
    "a RPC zap_config_salva2 existe e tem grant (grant é por assinatura)");
  ok(/zap_verify_novo/.test(sql) && /ABCDEFGHJKMNPQRSTUVWXYZ23456789/.test(sql),
    "a senha do aperto de mão é gerada pelo servidor, num alfabeto sem 0/O/1/I/L");
  ok(!/zap_config_salva2[\s\S]*?returns jsonb[\s\S]{0,900}?jsonb_build_object\([^)]*'token'/.test(sql),
    "nem a RPC nova devolve o token cru");

  // as telas do receber
  /* v757: "Receber as respostas aqui dentro" SAIU do TORQUE PERSONAL. A mensagem
   * do aluno cai em chat_conversas/chat_mensagens e só o portal da academia lê
   * essas tabelas — no Personal ela não apareceria em tela nenhuma, e o
   * professor ficaria achando que está atendendo. O painel continua usando a
   * zap_config_salva2 (é a RPC de guardar o número), só que sem esses campos. */
  const painelPT = fs.readFileSync(__dirname + "/../personal.html", "utf8");
  ok(/zap_config_salva2/.test(painelPT) && !/id="cfgZapSeg"/.test(painelPT) && !/id="cfgZapVerify"/.test(painelPT),
    "o TORQUE PERSONAL guarda o número pela RPC, mas não oferece mais o 'receber as respostas'");
  ok(/id="waSeg"/.test(integ) && /zap_config_salva2/.test(integ) && /waWhVerify/.test(integ),
    "a tela da academia idem");
  /* O arquivo é rodado de novo a cada mudança. Uma única "create policy" sem o
   * "drop policy if exists" antes derruba o script inteiro em 42710 (already
   * exists) — e TUDO daquele ponto pra baixo (inclusive o bloco do HQ) não roda. */
  {
    const linhas = sql.split("\n");
    const semDrop = [];
    linhas.forEach((l, i) => {
      const m = /^\s*create policy "([^"]+)"/.exec(l);
      if (!m) return;
      const antes = linhas.slice(Math.max(0, i - 3), i).join("\n");
      if (antes.indexOf('drop policy if exists "' + m[1] + '"') < 0) semDrop.push(m[1] + " (linha " + (i + 1) + ")");
    });
    ok(semDrop.length === 0, "toda policy tem 'drop policy if exists' antes (rodar o SQL de novo não pode quebrar)" +
      (semDrop.length ? " — falta em: " + semDrop.join(", ") : ""));
  }
  ok(/hq_receita_mensal/.test(sql) && /add column if not exists zap/.test(sql) && /ultima_atividade/.test(sql), "v2: receita mensal, WhatsApp e última atividade no SQL");
  ok(/saas_tickets/.test(sql) && /suporte_envia/.test(sql) && /suporte_lista/.test(sql), "assistência: tabela e RPCs do cliente");
  ok(/aluno_define_login/.test(sql) && /aluno_login/.test(sql) && /gen_salt\('bf'\)/.test(sql) && /pgcrypto/.test(sql), "login do aluno: RPCs com bcrypt no SQL");
  /* No Supabase o pgcrypto mora no schema "extensions". Uma função com
   * "set search_path = public" e um crypt/gen_salt SEM prefixo morre em
   * "function gen_salt(unknown) does not exist" — foi o que travou a criação
   * do login de todo aluno. Ou o search_path enxerga extensions, ou a chamada
   * vem qualificada como extensions.crypt(...). */
  {
    const semPg = [];
    // cada bloco "create ... function ... as $$ ... $$;"
    const re = /create or replace function ([\s\S]*?)\n\$\$;/g;
    let m;
    while ((m = re.exec(sql))) {
      const bloco = m[1];
      const nome = (bloco.match(/^\s*public\.(\w+)/) || [])[1] || "?";
      const usaCru = /(?<!extensions\.)\b(crypt|gen_salt)\s*\(/.test(bloco);
      if (!usaCru) continue;
      const cab = bloco.split("as $$")[0] || "";
      if (!/search_path\s*=[^\n]*\bextensions\b/.test(cab)) semPg.push(nome);
    }
    ok(semPg.length === 0, "toda função que usa crypt/gen_salt enxerga o pgcrypto (extensions no search_path)" +
      (semPg.length ? " — falta em: " + semPg.join(", ") : ""));
  }
  ok(/create extension if not exists pgcrypto with schema extensions/.test(sql),
    "o pgcrypto é criado no schema extensions (é onde o Supabase o mantém)");
  ok(/hq_cliente_provisiona/.test(sql) && /equipe_cria_login/.test(sql) && /hq_cliente_reseta_senha/.test(sql), "provisionamento: RPCs do HQ e do dono no SQL");
  ok(/_torque_cria_usuario/.test(sql) && /revoke all on function public\._torque_cria_usuario/.test(sql), "criação de usuário é interna (revogada pra anon/authenticated)");
  ok(/'nutri'/.test(sql.split("saas_clientes_tipo_check")[2] || ""), "tipo de cliente aceita nutri");
  ok(/create table if not exists public\.app_agenda/.test(sql) && /app_agenda_pede/.test(sql) && /app_agenda_lista/.test(sql), "agenda do app: tabela e RPCs no SQL");
  ok(/grant execute on function public\.app_agenda_pede/.test(sql) && /app_agenda_membros/.test(sql), "agenda do app: grants pro app e RLS pro módulo");
  ok(/hq_suporte_threads/.test(sql) && /hq_suporte_lista/.test(sql) && /hq_suporte_envia/.test(sql) && /hq_erros/.test(sql), "assistência: RPCs do HQ (tickets + erros)");
  ok(/pagarme_eventos/.test(sql) && /pagarme_eventos_membros/.test(sql), "webhook Pagar.me: tabela de eventos com RLS por academia no SQL");
  ok(/PAGARME_WEBHOOK_TOKEN/.test(fs.readFileSync(__dirname + "/../supabase/functions/pagarme-webhook/index.ts", "utf8")), "função pagarme-webhook existe com a trava de senha na URL");
  ok(/ia_treino/.test(fs.readFileSync(__dirname + "/../supabase/functions/chat-envia/index.ts", "utf8")), "função chat-envia tem a ação ia_treino (IA prescritiva de treino)");

  // ---------- 1) site comercial ----------
  console.log("Site comercial (torqueon.html):");
  let p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  await p.goto(BASE + "/torqueon.html?zap=5531988887777");
  await p.waitForFunction(() => window.__torqueon);
  const corpo = await p.evaluate(() => document.body.textContent);
  ok(/Academia/.test(corpo) && /Box de CrossFit/.test(corpo) && /Personal Trainer/.test(corpo), "os 3 segmentos apresentados");
  ok(/ilha/.test(corpo) && /isolados/.test(corpo), "seção de isolamento (ilha) presente");
  ok(/R\$ 49/.test(corpo) && /R\$ 147/.test(corpo) && /R\$ 197/.test(corpo), "tabela de planos com os 3 preços");
  ok(/sistemas tradicionais/i.test(corpo) && /Funciona sem internet/.test(corpo) && /sem fidelidade/.test(corpo), "tabela comparativa TORQUE ON × tradicionais");
  const links = await p.evaluate(() => ({
    empresa: document.getElementById("entrarEmpresa").getAttribute("href"),
    personal: document.getElementById("entrarPersonal").getAttribute("href"),
    segPersonal: document.querySelector("#segPersonal .btn").getAttribute("href"),
    zap: document.getElementById("ctaZap").href,
  }));
  ok(/index\.html/.test(links.empresa), "'Entrar na minha empresa' vai pro portal");
  ok(/personal\.html/.test(links.personal) && /personal\.html/.test(links.segPersonal), "caminho do personal vai pro módulo Personal");
  ok(/wa\.me\/5531988887777/.test(links.zap), "CTA de WhatsApp usa o ?zap= do link");
  ok(/Sou ALUNO/.test(corpo) && /link do app do aluno/.test(corpo), "FAQ explica que aluno entra pelo link do app (sem senha)");
  await p.close();

  // ---------- 1b) gate do portal: título, nota do aluno e saída do vínculo ----------
  console.log("Portal (gate de entrada):");
  p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  await p.goto(BASE + "/index.html");
  await p.waitForSelector("#gate", { state: "attached" });
  const gate = await p.evaluate(() => ({
    titulo: document.querySelector("#gate h1").textContent,
    aluno: document.getElementById("gateAluno").textContent,
    temSair: !!document.getElementById("gateSair"),
  }));
  ok(/Portal TORQUE ON/.test(gate.titulo), "gate com o título Portal TORQUE ON");
  ok(/aluno da academia ou de um personal/i.test(gate.aluno) && /LINK do app/.test(gate.aluno), "nota fixa explica o acesso do aluno (link, sem senha)");
  ok(gate.temSair, "botão 'Sair e entrar com outra conta' existe pro estado de vínculo");
  const abasVisiveis = await p.evaluate(() => Array.from(document.querySelectorAll("#gateAbas button")).map((b) => b.textContent));
  ok(abasVisiveis.length === 2 && /Entrar/.test(abasVisiveis[0]) && /Criar conta grátis/.test(abasVisiveis[1]), "gate com Entrar + Criar conta grátis (autoatendimento do teste)");
  const notaContrate = await p.evaluate(() => document.getElementById("gateContrate").textContent);
  ok(/Criar conta grátis/.test(notaContrate) && /7 dias/.test(notaContrate) && /planos/.test(notaContrate), "nota aponta pro teste grátis de 7 dias e pros planos");
  // aba do teste grátis: campos certos e promessa de 7 dias sem cartão
  await p.waitForFunction(() => !document.getElementById("gate").hidden, null, { timeout: 8000 });
  await p.click('#gateAbas [data-aba="teste"]');
  const abaTeste = await p.evaluate(() => ({
    acad: !document.getElementById("cAcademia").hidden,
    codigo: document.getElementById("cCodigo").hidden,
    btn: document.getElementById("gateBtn").textContent,
    intro: document.getElementById("gateIntro").textContent,
  }));
  ok(abaTeste.acad && abaTeste.codigo, "aba do teste pede o nome da academia e dispensa o código do curso");
  ok(/teste grátis/.test(abaTeste.btn) && /7 dias/.test(abaTeste.intro) && /sem cartão/.test(abaTeste.intro), "aba do teste promete 7 dias grátis, sem cartão");
  ok(await p.evaluate(async () => {
    const t = await (await fetch("assets/access.js")).text();
    return /aba === "teste"/.test(t) && /tipo: "criar"/.test(t);
  }), "cadastro do teste usa o signUp + criar_academia (nasce como trial no HQ)");
  const temSaida = await p.evaluate(() => fetch("assets/access.js").then((r) => r.text()).then((t) => t.includes("vinculando && aba === \"entrar\"") && t.includes("sairEEntrar")));
  ok(temSaida, "tocar em Entrar no estado preso desconecta e abre o login normal");
  ok(/login e senha de aluno/.test(gate.aluno), "nota do gate aponta pra página de login do aluno");
  // o gate sem sessão apaga o perfil local (comportamento real) — recoloca pros próximos testes
  await p.evaluate(() => localStorage.setItem("mtapp:perfil", JSON.stringify({ nome: "Raphael" })));
  await p.close();

  // ---------- 1c) página de login do aluno ----------
  console.log("Login do aluno (aluno-login.html):");
  p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  await p.route("**/rest/v1/rpc/aluno_login", (r) => {
    const corpo = JSON.parse(r.request().postData() || "{}");
    const ok2 = corpo.p_login === "rafa@email.com" && corpo.p_senha === "senha123";
    r.fulfill({ contentType: "application/json", body: JSON.stringify(ok2 ? { ok: true, token: "tok-aluno-teste" } : { erro: "Login ou senha incorretos. Esqueceu? Peça um link novo à sua academia ou personal." }) });
  });
  // app/index.html explícito: dentro do app da loja (Capacitor), "app/?t=" sem
  // extensão caía no index.html da raiz e o login morria — o site usa o mesmo caminho
  await p.route("**/app/index.html?t=tok-aluno-teste*", (r) => r.fulfill({ contentType: "text/html", body: "<title>app</title>APP DO ALUNO OK" }));
  await p.goto(BASE + "/aluno-login.html");
  await p.waitForFunction(() => window.__alunoLogin);
  // senha errada → mensagem
  await p.fill("#lg", "rafa@email.com");
  await p.fill("#sn", "errada99");
  await p.click("#btn");
  await p.waitForTimeout(400);
  const msgErro = await p.evaluate(() => document.getElementById("erro").textContent);
  ok(/incorretos/.test(msgErro), "senha errada mostra o aviso (sem vazar quem existe)");
  // senha certa → redireciona pro app com o token
  await p.fill("#sn", "senha123");
  await p.click("#btn");
  await p.waitForFunction(() => document.body.textContent.indexOf("APP DO ALUNO OK") !== -1, null, { timeout: 8000 });
  ok(true, "login certo redireciona para app/index.html?t=TOKEN (caminho que funciona também no app da loja)");
  const tokenGuardado = await p.evaluate(() => localStorage.getItem("mt_aluno_token"));
  ok(tokenGuardado === "tok-aluno-teste", "token fica lembrado no aparelho");
  await p.close();

  // ---------- 2) HQ travado sem admin (com login direto na tela) ----------
  console.log("HQ (trava de acesso + login direto):");
  const ctxHq = await b.newContext({ viewport: { width: 1360, height: 900 } }); // SEM mtapp:perfil
  p = await ctxHq.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  await p.addInitScript(() => {
    window.MT_supabase = {
      auth: {
        getSession: async () => ({ data: { session: null } }),
        signInWithPassword: async (c) => { window.__cred = c; return { error: { message: "Invalid login" } }; },
      },
      rpc: async () => ({ data: null }),
    };
  });
  await p.goto(BASE + "/apps/hq.html");
  await p.waitForTimeout(900);
  ok(/hq\.html/.test(await p.evaluate(() => location.pathname)), "HQ abre direto SEM cadastro no portal (não redireciona mais)");
  const trava = await p.evaluate(() => ({
    lockVisivel: !document.getElementById("hqLock").hidden,
    painelEscondido: document.getElementById("hqPainel").hidden,
    formVisivel: !document.getElementById("hqLoginForm").hidden,
  }));
  ok(trava.lockVisivel && trava.painelEscondido, "sem login o painel fica travado");
  ok(trava.formVisivel, "formulário de login aparece na própria tela do HQ");
  await p.fill("#hqEmail", "dono@torqueon.com.br");
  await p.fill("#hqSenha", "senha-errada");
  await p.click("#hqEntrar");
  await p.waitForTimeout(400);
  const loginTeste = await p.evaluate(() => ({
    erro: document.getElementById("hqLoginErro").textContent,
    cred: window.__cred,
  }));
  ok(/incorretos/.test(loginTeste.erro), "senha errada mostra erro na tela");
  ok(loginTeste.cred && loginTeste.cred.email === "dono@torqueon.com.br", "login usa o e-mail digitado");
  const comoAdmin = await p.evaluate(() => document.body.textContent);
  ok(/saas_admins/.test(comoAdmin), "instrução de como virar admin na tela");
  await p.close();
  await ctxHq.close();

  // ---------- 3) HQ com admin (cliente supabase mockado) ----------
  console.log("HQ (painel do dono):");
  p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  p.on("dialog", (d) => d.accept("197"));
  await p.addInitScript(() => {
    window.__rpcLog = [];
    const dISO = (off) => { const x = new Date(); x.setDate(x.getDate() + off); return x.toISOString(); };
    const CLIENTES = [
      { id: "acad-1", nome: "Academia Ferro Pesado", criada: dISO(-80), tipo: "academia", plano: "Academia", valor: 197, status: "ativo", obs: "", zap: "31988881111", membros: 4, total_pago: 591, ultimo_pgto: dISO(-5).slice(0, 10), pago_mes: 197, ultima_atividade: dISO(-1) },
      { id: "stud-2", nome: "Studio Pilates Vida", criada: dISO(-20), tipo: "studio", plano: "trial", valor: 0, status: "trial", obs: "", zap: "", membros: 1, total_pago: 0, ultimo_pgto: null, pago_mes: 0, ultima_atividade: dISO(-2) },
      { id: "pers-3", nome: "Studio Léo Personal", criada: dISO(-25), tipo: "personal", plano: "Personal", valor: 49, status: "ativo", obs: "", zap: "31977772222", membros: 1, total_pago: 49, ultimo_pgto: dISO(-20).slice(0, 10), pago_mes: 49, ultima_atividade: dISO(-3) },
      { id: "sumi-4", nome: "Academia Sumida", criada: dISO(-90), tipo: "academia", plano: "Academia", valor: 197, status: "ativo", obs: "", zap: "31966663333", membros: 1, total_pago: 394, ultimo_pgto: dISO(-40).slice(0, 10), pago_mes: 0, ultima_atividade: dISO(-20) },
    ];
    window.MT_supabase = {
      auth: {
        getSession: () => Promise.resolve({ data: { session: { user: { email: "raphael@torquefit.com.br" } } } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
      from: () => ({ select: () => Promise.resolve({ data: [] }), upsert: () => Promise.resolve({ data: [] }) }),
      rpc: (nome, args) => {
        window.__rpcLog.push({ nome, args });
        if (nome === "hq_sou_admin") return Promise.resolve({ data: true });
        if (nome === "hq_kpis") return Promise.resolve({ data: { clientes: 4, ativos: 3, trial: 1, mrr: 443, recebido_mes: 246, novos_30d: 2 } });
        if (nome === "hq_clientes") return Promise.resolve({ data: CLIENTES });
        if (nome === "hq_receita_mensal") return Promise.resolve({ data: [{ mes: "2026-01", total: 100 }, { mes: "2026-02", total: 350 }] });
        if (nome === "hq_suporte_threads") return Promise.resolve({ data: [{ academia_id: "acad-1", nome: "Academia Ferro Pesado", ultima: dISO(0), ultima_msg: "O totem travou aqui", nao_lidas: 2 }] });
        if (nome === "hq_suporte_lista") return Promise.resolve({ data: [{ de: "cliente", quem: "dono@ferro.com", texto: "O totem travou aqui", criado: dISO(0) }] });
        if (nome === "hq_erros") return Promise.resolve({ data: [
          { academia_id: "sumi-4", nome: "Academia Sumida", erros: 3, ultimo: dISO(0), ultima_msg: "x is not defined", ultima_pagina: "apps/totem.html" },
          { academia_id: "acad-1", nome: "Academia Ferro Pesado", erros: 1, ultimo: dISO(0), ultima_msg: "TypeError no leitor de QR", ultima_pagina: "apps/entrada.html" },
        ] });
        return Promise.resolve({ data: { ok: true } });
      },
    };
  });
  await p.goto(BASE + "/apps/hq.html");
  await p.waitForFunction(() => !document.getElementById("hqPainel").hidden, null, { timeout: 8000 });
  const kpis = await p.evaluate(() => document.getElementById("hqKpis").textContent);
  ok(/MRR/.test(kpis) && /443/.test(kpis), "KPIs mostram o MRR do TORQUE ON (R$ 443)");
  ok(/ARPU/.test(kpis) && /148/.test(kpis), "ARPU calculado (443/3 ≈ R$ 148) — métrica ChartMogul");
  ok(/Empresas clientes/.test(kpis) && /4/.test(kpis), "KPI de total de empresas");
  // provisionamento de cliente novo direto do HQ
  await p.fill("#pvEmpresa", "Academia Nova Era");
  await p.fill("#pvEmail", "dono@novaera.com");
  await p.selectOption("#pvTipo", "academia");
  await p.fill("#pvZap", "31977776666");
  await p.click("#pvCriar");
  await p.waitForTimeout(300);
  const prov = await p.evaluate(() => ({
    chamada: window.__rpcLog.find((r) => r.nome === "hq_cliente_provisiona"),
    msg: window.__pvMsg || "",
    visivel: !document.getElementById("pvResultado").hidden,
  }));
  ok(!!prov.chamada && prov.chamada.args.p_email === "dono@novaera.com" && prov.chamada.args.p_empresa === "Academia Nova Era", "HQ chama hq_cliente_provisiona com e-mail e empresa");
  ok(prov.chamada.args.p_senha && prov.chamada.args.p_senha.length >= 10, "senha aleatória gerada (10+ caracteres)");
  ok(prov.visivel && /torqueon\.com\.br/.test(prov.msg) && /Senha: /.test(prov.msg) && /dono@novaera\.com/.test(prov.msg), "mensagem pronta pro WhatsApp com site, login e senha");

  let lista = await p.evaluate(() => document.getElementById("hqClientes").textContent);
  ok(/Academia Ferro Pesado/.test(lista) && /Studio Pilates Vida/.test(lista) && /Academia Sumida/.test(lista), "as empresas listadas");
  ok(/ATIVO/i.test(lista) && /TRIAL/i.test(lista), "etiquetas de status");
  ok(/pagou R\$ 591/.test(lista), "total pago por cliente aparece");
  // health score (estilo Customer Success)
  ok(/🟢/.test(lista) && /🔴/.test(lista), "farol de saúde nas empresas (🟢 e 🔴)");
  ok(/sem usar o sistema há/.test(lista), "motivo 👻 de inatividade aparece (última atividade real)");
  ok(/trial vencido/.test(lista), "motivo ⏳ de trial vencido aparece");
  ok(/equipe ainda não entrou/.test(lista), "motivo 👥 de ativação (equipe não entrou)");
  // filtro só em risco
  await p.check("#fRisco");
  lista = await p.evaluate(() => document.getElementById("hqClientes").textContent);
  ok(/Sumida/.test(lista) && !/Ferro Pesado/.test(lista), "filtro 'só em risco' esconde os saudáveis");
  await p.uncheck("#fRisco");
  // resgate via WhatsApp com mensagem contextual
  const zapResgate = await p.evaluate(() => decodeURIComponent(document.querySelector('.cli a[href*="wa.me/5531966663333"]').href));
  ok(/não usam o sistema|mensalidade deste mês/.test(zapResgate), "💬 de resgate tem mensagem contextual pronta");
  // cobranças do mês (rotina Stripe Billing)
  let cob = await p.evaluate(() => document.getElementById("hqCobrancas").textContent);
  ok(/1 cliente\(s\)/.test(cob) && /197/.test(cob) && /Sumida/.test(cob), "cobranças do mês: só quem não pagou (Sumida, R$ 197)");
  ok(!/Ferro Pesado/.test(cob), "quem pagou não entra na cobrança");
  // receita 12 meses
  const rec12 = await p.evaluate(() => ({ hidden: document.getElementById("cardReceita12").hidden, txt: document.getElementById("hqReceita12").textContent }));
  ok(!rec12.hidden && /350/.test(rec12.txt), "card de receita 12 meses com as barras");
  // tickets de suporte
  let tks = await p.evaluate(() => document.getElementById("hqTickets").textContent);
  ok(/Ferro Pesado/.test(tks) && /2 nova\(s\)/.test(tks) && /totem travou/.test(tks), "ticket do cliente com etiqueta de não lidas");
  const badge = await p.evaluate(() => ({ hidden: document.getElementById("tkBadge").hidden, txt: document.getElementById("tkBadge").textContent }));
  ok(!badge.hidden && /2 nova/.test(badge.txt), "badge de não lidas no título do card");
  await p.evaluate(() => document.querySelector("[data-ticket]").click());
  await p.waitForFunction(() => document.getElementById("dlgTicket").open);
  const thread = await p.evaluate(() => document.getElementById("tkMsgs").textContent);
  ok(/O totem travou aqui/.test(thread) && /dono@ferro\.com/.test(thread), "thread abre com a mensagem do cliente");
  const tkCtx = await p.evaluate(() => document.getElementById("tkErros").textContent);
  ok(/1 erro\(s\)/.test(tkCtx) && /TypeError no leitor de QR/.test(tkCtx), "erros recentes do cliente aparecem no próprio ticket (contexto)");
  await p.selectOption("#tkMacros", { index: 1 });
  const macro = await p.evaluate(() => document.getElementById("tkTxt").value);
  ok(/correção já está no ar/.test(macro), "⚡ macro preenche a resposta com 1 clique");
  await p.fill("#tkTxt", "Reinicia o tablet que resolve — e já subi uma correção 😉");
  await p.click("#tkEnviar");
  await p.waitForTimeout(300);
  const respCall = await p.evaluate(() => window.__rpcLog.find((c) => c.nome === "hq_suporte_envia"));
  ok(!!respCall && respCall.args.p_academia === "acad-1" && /correção/.test(respCall.args.p_texto), "resposta sai via hq_suporte_envia");
  await p.evaluate(() => document.getElementById("dlgTicket").close());
  // saúde técnica (Sentry)
  const errosCard = await p.evaluate(() => document.getElementById("hqErros").textContent);
  ok(/Academia Sumida/.test(errosCard) && /3 erro\(s\)/.test(errosCard) && /apps\/totem\.html/.test(errosCard), "monitor de erros mostra cliente, contagem e tela");
  // filtro por tipo
  await p.selectOption("#fTipo", "personal");
  lista = await p.evaluate(() => document.getElementById("hqClientes").textContent);
  ok(/Léo/.test(lista) && !/Ferro Pesado/.test(lista), "filtro por tipo personal funciona");
  await p.selectOption("#fTipo", "");
  // editar plano → rpc hq_cliente_set (agora com WhatsApp)
  await p.evaluate(() => document.querySelector('[data-edit="stud-2"]').click());
  await p.waitForFunction(() => document.getElementById("dlgCli").open);
  await p.selectOption("#dcStatus", "ativo");
  await p.fill("#dcPlano", "Studio & Box");
  await p.fill("#dcValor", "147");
  await p.fill("#dcZap", "31955554444");
  await p.evaluate(() => { document.getElementById("dlgCli").returnValue = "ok"; document.getElementById("dlgCli").close("ok"); });
  await p.waitForTimeout(300);
  const setCall = await p.evaluate(() => window.__rpcLog.find((c) => c.nome === "hq_cliente_set"));
  ok(!!setCall && setCall.args.p_academia === "stud-2" && setCall.args.p_valor === 147 && setCall.args.p_status === "ativo", "salvar plano chama hq_cliente_set (147/ativo)");
  ok(setCall.args.p_zap === "31955554444", "WhatsApp do responsável vai junto (p_zap)");
  // CSV de clientes
  const dlCli = p.waitForEvent("download", { timeout: 5000 }).catch(() => null);
  await p.click("#hqCSV");
  const arqCli = await dlCli;
  ok(!!arqCli && /clientes-torqueon/.test(arqCli.suggestedFilename()), "CSV de clientes baixa");
  // registrar pagamento → rpc hq_pagamento_reg (prompt devolve 197)
  await p.evaluate(() => document.querySelector('[data-pgto="acad-1"]').click());
  await p.waitForTimeout(300);
  const pgtoCall = await p.evaluate(() => window.__rpcLog.find((c) => c.nome === "hq_pagamento_reg"));
  ok(!!pgtoCall && pgtoCall.args.p_academia === "acad-1" && pgtoCall.args.p_valor === 197, "💰 registra mensalidade via hq_pagamento_reg");
  // Pix da mensalidade
  await p.fill("#hqPixChave", "raphael@torquefit.com.br");
  await p.fill("#hqPixNome", "Raphael Margé");
  await p.fill("#hqPixCidade", "Belo Horizonte");
  await p.evaluate(() => document.getElementById("hqPixCidade").blur());
  await p.waitForTimeout(250);
  const temPix = await p.evaluate(() => !!document.querySelector('[data-pix="acad-1"]'));
  ok(temPix, "com a chave configurada aparece o 💠 Pix do cliente");
  await p.evaluate(() => document.querySelector('[data-pix="acad-1"]').click());
  await p.waitForFunction(() => document.getElementById("dlgPixHQ").open);
  const pix = await p.evaluate(() => ({
    code: document.getElementById("pixHQCode").value,
    temQr: !!document.querySelector("#pixHQQr img"),
    titulo: document.getElementById("pixHQTitulo").textContent,
  }));
  ok(/197/.test(pix.titulo) && /Ferro Pesado/.test(pix.titulo), "dialog do Pix com valor e cliente");
  ok(/^000201/.test(pix.code) && /6304[0-9A-F]{4}$/.test(pix.code) && pix.code.includes("br.gov.bcb.pix"), "BR Code EMV válido");
  ok(pix.code.includes("5406197.00"), "campo 54 com a mensalidade 197.00");
  ok(crcNode(pix.code.slice(0, -4)) === pix.code.slice(-4), "CRC do payload confere na reimplementação independente");
  ok(pix.temQr, "QR Code renderizado");
  await p.evaluate(() => document.getElementById("dlgPixHQ").close());
  // funil de vendas local
  await p.fill("#ldNome", "Box Cross Norte");
  await p.fill("#ldContato", "31 98888-0000");
  await p.selectOption("#ldTipo", "box");
  await p.click("#ldAdd");
  let funil = await p.evaluate(() => document.getElementById("ldLista").textContent);
  ok(/Box Cross Norte/.test(funil) && /novo/.test(funil), "lead entra no funil como novo");
  await p.evaluate(() => document.querySelector("[data-avanca]").click());
  funil = await p.evaluate(() => document.getElementById("ldLista").textContent);
  ok(/contato/.test(funil), "lead avança de etapa (novo → contato)");
  const guardou = await p.evaluate(() => JSON.parse(localStorage.getItem("mtapp:hqLeads")).itens.length);
  ok(guardou === 1, "funil guardado no store (sincroniza pela conta)");
  await p.close();

  // ---------- 4) widget 🆘 do cliente (Central de Ajuda) ----------
  console.log("Suporte no Central de Ajuda (lado do cliente):");
  p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  await p.addInitScript(() => {
    window.__rpcLogSup = [];
    const chatDB = [{ de: "suporte", texto: "Olá! Vi seu chamado — como posso ajudar?", criado: new Date().toISOString() }];
    window.MT_supabase = {
      auth: {
        getSession: () => Promise.resolve({ data: { session: { user: { email: "dono@ferro.com" } } } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
      from: () => ({ select: () => Promise.resolve({ data: [] }), upsert: () => Promise.resolve({ data: [] }) }),
      rpc: (nome, args) => {
        window.__rpcLogSup.push({ nome, args });
        if (nome === "suporte_lista") return Promise.resolve({ data: chatDB.slice() });
        if (nome === "suporte_envia") { chatDB.push({ de: "cliente", texto: args.p_texto, criado: new Date().toISOString() }); return Promise.resolve({ data: { ok: true } }); }
        return Promise.resolve({ data: { ok: true } });
      },
    };
  });
  await p.goto(BASE + "/apps/suporte.html");
  await p.waitForFunction(() => window.__suporteSaaS);
  await p.waitForTimeout(500);
  let supMsgs = await p.evaluate(() => document.getElementById("supMsgs").textContent);
  ok(/como posso ajudar/.test(supMsgs), "resposta do suporte aparece no card do cliente");
  // triagem automática (deflection): o robô sugere o tutorial ANTES de abrir chamado
  await p.fill("#supTxt", "O totem não lê o QR do check-in!");
  await p.click("#supEnviar");
  await p.waitForTimeout(300);
  supMsgs = await p.evaluate(() => document.getElementById("supMsgs").textContent);
  ok(/Isso pode resolver agora/.test(supMsgs), "robô sugere o tutorial que resolve antes de abrir chamado");
  const semRpc = await p.evaluate(() => window.__rpcLogSup.filter((c) => c.nome === "suporte_envia").length);
  ok(semRpc === 0, "nada é enviado enquanto a sugestão está na tela");
  await p.click("#supInsiste");
  await p.waitForTimeout(400);
  const enviaCall = await p.evaluate(() => window.__rpcLogSup.find((c) => c.nome === "suporte_envia"));
  ok(!!enviaCall && /QR/.test(enviaCall.args.p_texto), "cliente insistiu → chamado sai via suporte_envia");
  ok(/🔧 diag automático/.test(enviaCall.args.p_texto), "1ª mensagem leva o diagnóstico anexado sozinho");
  supMsgs = await p.evaluate(() => document.getElementById("supMsgs").textContent);
  ok(/totem não lê o QR/.test(supMsgs), "mensagem enviada aparece na conversa");
  // mensagem sem tutorial correspondente vai direto (sem diag — já não é a 1ª)
  await p.fill("#supTxt", "zzzzz wwwww qqqqq");
  await p.click("#supEnviar");
  await p.waitForTimeout(400);
  const chamadas = await p.evaluate(() => window.__rpcLogSup.filter((c) => c.nome === "suporte_envia"));
  ok(chamadas.length === 2 && !/🔧/.test(chamadas[1].args.p_texto), "sem tutorial que ajude, envia direto (e sem repetir o diagnóstico)");
  const zapEscondido = await p.evaluate(() => document.getElementById("supZap").hidden);
  ok(zapEscondido, "botão de WhatsApp fica escondido sem suporteZap configurado");
  await p.click("#supDiag");
  const diagTxt = await p.evaluate(() => document.getElementById("supDiag").textContent);
  ok(/Copiado/.test(diagTxt), "relatório de diagnóstico é copiado com um clique");
  await p.close();

  // ---------- várias automações no Chat e IA (estilo ManyChat) ----------
  console.log("Automações do chatbot (Chat e IA):");
  ok(/add column if not exists bots/.test(sql), "SQL: coluna bots (lista de automações) no chat_config");
  p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  const respostas = ["Cobrança"];
  p.on("dialog", (d) => d.accept(respostas.length ? respostas.shift() : ""));
  await p.goto(BASE + "/apps/chat.html");
  await p.waitForSelector("#botSel", { state: "attached" });
  await p.click('[data-aba="bot"]');
  let autos = await p.evaluate(() => window.__automacoes());
  ok(autos.nomes.length === 1 && /principal/i.test(autos.nomes[0]), "começa com 1 automação (principal)");
  const blocosAntes = await p.evaluate(() => document.querySelectorAll("#botBlocos .no").length || document.querySelectorAll("#botBlocos > div").length);
  ok(blocosAntes >= 5, "quadro da principal vem com o fluxo modelo (" + blocosAntes + " balões)");
  await p.click("#botNovo");
  await p.waitForTimeout(200);
  autos = await p.evaluate(() => window.__automacoes());
  ok(autos.nomes.length === 2 && autos.nomes.includes("Cobrança") && autos.selecionada !== "a1", "+ Nova cria a automação Cobrança com quadro próprio");
  const blocosNovo = await p.evaluate(() => document.querySelectorAll("#botBlocos > div").length);
  ok(blocosNovo <= 2, "quadro novo começa quase vazio (" + blocosNovo + " balão)");
  await p.click('[data-add="mensagem"]');
  await p.click('[data-add="link"]');
  await p.waitForTimeout(200);
  const comLink = await p.evaluate(() => document.getElementById("botBlocos").textContent);
  ok(/torqueon\.com\.br/.test(comLink), "ação + Link cria o balão de enviar link");
  await p.click("#botPrincipal");
  autos = await p.evaluate(() => window.__automacoes());
  ok(autos.principal === autos.selecionada, "📶 marca a automação selecionada como a do WhatsApp");
  await p.click("#botDuplicar");
  await p.waitForTimeout(200);
  autos = await p.evaluate(() => window.__automacoes());
  ok(autos.nomes.length === 3 && autos.nomes.some((n) => /cópia/.test(n)), "Duplicar cria uma cópia editável");
  await p.selectOption("#botSel", "a1");
  await p.waitForTimeout(200);
  const voltou = await p.evaluate(() => Array.from(document.querySelectorAll("#botBlocos textarea, #botBlocos input")).map((e) => e.value).join(" "));
  ok(/Boas-vindas/.test(voltou) && /TORQUE FIT/.test(voltou), "trocar no seletor volta pro quadro da principal intacto");

  // ---------- conversa do chat vira lead no Funil Comercial ----------
  console.log("Chat → lead no Funil:");
  ok(await p.evaluate(() => !!document.getElementById("btnLeadFunil")), "botão ➕ Lead no Funil no topo da conversa");
  const lead = await p.evaluate(() => {
    localStorage.removeItem("mtapp:funil");
    const S = window.MTStore;
    const criou = window.__chat.criaLead({ id: "cv1", nome: "Maria Interessada", contato_id: "5531988887777", canal: "whatsapp", ultima_msg: "quero saber os planos" }, false);
    const l = S.read("funil", { leads: [] }).leads[0] || {};
    return {
      criou, nome: l.nome, zap: l.zap, status: l.status, origem: l.origem, interesse: l.interesse,
      dedupe: window.__chat.criaLead({ id: "cv1", nome: "Maria Interessada", contato_id: "5531988887777", canal: "whatsapp" }, false),
      total: S.read("funil", { leads: [] }).leads.length,
    };
  });
  ok(lead.criou && lead.status === "novo" && /Chat WhatsApp/.test(lead.origem), "conversa vira lead na coluna NOVO do funil");
  ok(lead.zap === "31988887777" && /planos/.test(lead.interesse), "lead nasce com o WhatsApp (sem o 55) e o assunto da conversa");
  ok(lead.dedupe === false && lead.total === 1, "mesma conversa não duplica o lead");
  const naoLead = await p.evaluate(() => {
    const S = window.MTStore;
    S.write("alunos", { alunos: [{ id: "a9", nome: "Já Aluno", zap: "31977776666" }] });
    return {
      aluno: window.__chat.criaLead({ id: "cv2", nome: "Já Aluno", contato_id: "5531977776666", canal: "whatsapp" }, false),
      insta: window.__chat.criaLead({ id: "cv3", nome: "seguidor.ig", contato_id: "178451234567890", canal: "instagram", ultima_msg: "aula experimental?" }, false),
      instaLead: S.read("funil", { leads: [] }).leads[0] || {},
    };
  });
  ok(naoLead.aluno === false, "quem já é aluno não vira lead");
  ok(naoLead.insta === true && /Instagram/.test(naoLead.instaLead.origem) && naoLead.instaLead.zap === "", "conversa do Instagram vira lead com origem própria (sem WhatsApp)");
  ok(await p.evaluate(async () => {
    const t = await (await fetch("chat.html")).text();
    return /leadsAutomaticos\(\)/.test(t);
  }), "toda conversa nova de não-aluno vira lead sozinha (últimos 7 dias)");
  ok(await p.evaluate(async () => {
    const t = await (await fetch("funil.html")).text();
    return !/proximoContato/.test(t) && /status: "novo", temperatura: "quente"/.test(t);
  }), "matrículas online importadas entram com status certo (aparecem no kanban)");
  await p.close();

  // ---------- comissões de vendedor (balcão) e professor (aula dada) ----------
  console.log("Comissões (vendedor e professor):");
  p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  p.on("dialog", (d) => d.accept());
  await p.goto(BASE + "/apps/produtos.html");
  ok(await p.evaluate(() => !!document.getElementById("vVendedor")), "venda de balcão tem o campo Vendedor(a) — pra comissão");
  await p.evaluate(() => {
    const S = window.MTStore;
    const hoje = S.todayISO();
    S.write("produtos", { itens: [], vendas: [{ id: "v1", data: hoje, hora: "10:00", itens: [], total: 200, forma: "Pix", cliente: "", vendedor: "Carla Vendedora" }] });
    S.write("comissoes", { pctPadrao: 10, pct: {}, lancadas: {}, regime: "competencia", valorAula: 30 });
    const chamadas = {};
    chamadas["t1|" + hoje] = ["Aluno X"];
    S.write("turmas", { turmas: [{ id: "t1", nome: "Cross", prof: "Pedro Prof", alunos: [] }], chamadas: chamadas });
  });
  await p.goto(BASE + "/apps/comissoes.html");
  await p.waitForTimeout(400);
  const kCom = await p.evaluate(() => document.getElementById("kpisCom").textContent);
  ok(/Comissões vendedor\s*R\$\s?20\b/.test(kCom), "comissão do vendedor calculada (10% de R$ 200 = R$ 20)");
  ok(/Comissões professor\s*R\$\s?30\b/.test(kCom), "comissão do professor por aula dada (1 × R$ 30)");
  const quadroExtras = await p.evaluate(() => document.getElementById("listaExtras").textContent);
  ok(/Carla Vendedora/.test(quadroExtras) && /Pedro Prof/.test(quadroExtras), "quadro lista vendedores e professores do mês");
  await p.close();

  ok(erros.length === 0, "nenhuma página com erro de JS" + (erros.length ? " — " + erros[0] : ""));

  await b.close();
  console.log(falhas ? "\n💥 " + falhas + " FALHA(S)" : "\n🏁 TUDO PASSOU");
  process.exit(falhas ? 1 : 0);
})();
