/* Roteamento do webhook da Meta: prova que a mensagem cai na academia DONA.
 *
 * Roda em node puro (modelo do test-scanner): recorta a região "ROTEAMENTO" do
 * index.ts — que é JS puro de propósito — e avalia. A Meta nunca é chamada.
 *
 * Por que esta suíte existe: até a v473 NENHUM teste lia meta-webhook/index.ts.
 * Dava pra reescrever a função inteira e as 18 suítes continuavam verdes — e foi
 * exatamente ali que morava o vazamento (a academia era escolhida por "limit 1",
 * ou seja, sorteada).
 */
const fs = require("fs");
const path = require("path");

const ARQ = path.join(__dirname, "..", "supabase", "functions", "meta-webhook", "index.ts");
const fonte = fs.readFileSync(ARQ, "utf8");

let ok = 0, falhas = 0;
function t(cond, nome) {
  if (cond) { ok++; console.log("  ✅ " + nome); }
  else { falhas++; console.log("  ❌ " + nome); }
}

// ---------- recorta e avalia a região testável ----------
const ini = fonte.indexOf("// ==== ROTEAMENTO");
const fim = fonte.indexOf("// ==== FIM ROTEAMENTO ====");
if (ini < 0 || fim < 0) {
  console.log("  ❌ a região ROTEAMENTO sumiu do index.ts — os marcadores são o contrato desta suíte");
  process.exit(1);
}
const regiao = fonte.slice(ini, fim);
const { extrai, escolheCredencial, verificaHandshake } =
  new Function(regiao + "\nreturn { extrai, escolheCredencial, verificaHandshake };")();

console.log("Quem é o dono da mensagem que chegou:");

// ---------- 1) WhatsApp: o dono é o ID do número que recebeu ----------
const payWa = {
  object: "whatsapp_business_account",
  entry: [{
    id: "WABA-1",
    changes: [{
      value: {
        messaging_product: "whatsapp",
        metadata: { display_phone_number: "5531999990000", phone_number_id: "FONE-DA-ANA" },
        contacts: [{ profile: { name: "Cliente Um" } }],
        messages: [{ from: "5531988887777", id: "wamid.1", text: { body: "oi, quanto custa?" } }],
      },
    }],
  }],
};
{
  const m = extrai(payWa);
  t(m.length === 1 && m[0].donoId === "FONE-DA-ANA",
    "WhatsApp: o ID do número que recebeu vira o dono da mensagem (" + (m[0] || {}).donoId + ")");
  t(m[0].canal === "whatsapp" && m[0].contato === "5531988887777" && m[0].mid === "wamid.1" && m[0].nome === "Cliente Um",
    "WhatsApp: canal, contato, id da mensagem e nome continuam certos");
}

// ---------- 2) Instagram: o dono é a conta que recebeu ----------
{
  const m = extrai({
    object: "instagram",
    entry: [{
      id: "IG-DO-BRUNO",
      messaging: [
        { sender: { id: "seguidor-1" }, recipient: { id: "IG-DO-BRUNO" }, message: { mid: "mid.1", text: "bom dia" } },
        { sender: { id: "IG-DO-BRUNO" }, recipient: { id: "seguidor-1" }, message: { mid: "mid.2", text: "eco", is_echo: true } },
      ],
    }],
  });
  t(m.length === 1 && m[0].canal === "instagram" && m[0].donoId === "IG-DO-BRUNO",
    "Instagram: a conta que recebeu vira o dono (" + (m[0] || {}).donoId + ")");
  t(m.length === 1, "Instagram: a mensagem que a própria conta mandou (eco) não vira conversa");
}

// ---------- 3) Messenger não é produto nosso ----------
{
  const m = extrai({
    object: "page",
    entry: [{ id: "PAGINA-1", messaging: [{ sender: { id: "x" }, recipient: { id: "PAGINA-1" }, message: { mid: "m", text: "oi" } }] }],
  });
  t(m.length === 0, "Messenger (object 'page') é descartado, em vez de virar 'whatsapp' por engano");
}

console.log("Escolha da credencial:");

const GLOBAIS = { aid: "acad-dono", phoneId: "FONE-DO-DONO", token: "tok-dono", igId: "", igToken: "", appSecret: "seg-dono" };
const LINHAS = [
  { academia_id: "acad-ana", phone_id: "FONE-DA-ANA", token: "tok-ana", ig_id: "IG-DA-ANA", ig_token: "tok-ig-ana", app_secret: "seg-ana" },
  { academia_id: "acad-bruno", phone_id: "FONE-DO-BRUNO", token: "tok-bruno", ig_id: "", ig_token: "", app_secret: "" },
];

// ---------- 4) casou uma linha: é dela ----------
{
  const c = escolheCredencial(LINHAS, "whatsapp", "FONE-DA-ANA", GLOBAIS);
  t(c && c.aid === "acad-ana" && c.token === "tok-ana" && c.phoneId === "FONE-DA-ANA" && c.origem === "propria",
    "número da Ana entrega a academia da Ana, com o token e o número dela");
  const c2 = escolheCredencial(LINHAS, "whatsapp", "FONE-DO-BRUNO", GLOBAIS);
  t(c2 && c2.aid === "acad-bruno" && c2.token === "tok-bruno",
    "número do Bruno entrega a academia do Bruno — os dois no mesmo banco não se misturam");
}

// ---------- 5) sem dono: NÃO processa (era o vazamento) ----------
{
  const c = escolheCredencial(LINHAS, "whatsapp", "FONE-DE-NINGUEM", GLOBAIS);
  t(c === null, "número desconhecido não vira mensagem de ninguém (antes caía na academia sorteada)");
  t(escolheCredencial(LINHAS, "whatsapp", "", GLOBAIS) === null, "payload sem o ID do número também é recusado");
  t(escolheCredencial([], "whatsapp", "FONE-DE-NINGUEM", GLOBAIS) === null, "banco vazio não libera geral");
}

// ---------- 6) modo dono único continua funcionando ----------
{
  const c = escolheCredencial(LINHAS, "whatsapp", "FONE-DO-DONO", GLOBAIS);
  t(c && c.origem === "dono" && c.token === "tok-dono" && c.aid === "acad-dono",
    "o número do dono do sistema continua respondendo com os Secrets globais (nada quebra pra quem já usa)");
  const semGlobal = escolheCredencial(LINHAS, "whatsapp", "FONE-DO-DONO", { phoneId: "", token: "" });
  t(semGlobal === null, "sem Secret global, nem o número do dono passa");
}

// ---------- 7) mesmo número em duas academias: recusa, não sorteia ----------
{
  const dupla = LINHAS.concat([{ academia_id: "acad-x", phone_id: "FONE-DA-ANA", token: "tok-x" }]);
  t(escolheCredencial(dupla, "whatsapp", "FONE-DA-ANA", GLOBAIS) === null,
    "o mesmo número em duas academias é recusado (o índice único evita, mas o código não confia)");
}

// ---------- 8) Instagram usa a coluna certa ----------
{
  const c = escolheCredencial(LINHAS, "instagram", "IG-DA-ANA", GLOBAIS);
  t(c && c.aid === "acad-ana" && c.token === "tok-ig-ana" && c.igId === "IG-DA-ANA",
    "Instagram casa por ig_id e responde com o token da Página daquele profissional");
  t(escolheCredencial(LINHAS, "instagram", "FONE-DA-ANA", GLOBAIS) === null,
    "o ID do WhatsApp não abre a porta do Instagram (cada canal tem a sua coluna)");
  t(escolheCredencial(LINHAS, "whatsapp", "IG-DA-ANA", GLOBAIS) === null,
    "e o ID do Instagram não abre a porta do WhatsApp");
}

// ---------- 9) aperto de mão com vários apps da Meta ----------
console.log("Aperto de mão e assinatura:");
{
  const cad = [{ verify_token: "torque-ABCDEFGHJK" }, { verify_token: "torque-MNPQRSTUVW" }];
  t(verificaHandshake("segredo-do-dono", "segredo-do-dono", cad), "a senha do dono continua valendo");
  t(verificaHandshake("torque-MNPQRSTUVW", "segredo-do-dono", cad), "a senha de cada profissional também vale");
  t(!verificaHandshake("chutando", "segredo-do-dono", cad), "senha errada não passa");
  t(!verificaHandshake("", "segredo-do-dono", cad), "sem senha não passa");
  t(!verificaHandshake("torque-MNPQRSTUVW", "", []), "sem nada cadastrado, nada passa");
}

// ---------- 10) regressões que a suíte tem que travar ----------
// ---------- 11) Instagram da instalação antiga (sem o Secret do ID) ----------
{
  const semIg = { aid: "acad-dono", phoneId: "FONE-DO-DONO", token: "tok-dono", igId: "", igToken: "tok-ig-global", igSozinho: true };
  const c = escolheCredencial([], "instagram", "IG-QUALQUER", semIg);
  t(c && c.origem === "dono" && c.igId === "IG-QUALQUER",
    "sem ninguém ter cadastrado Instagram, o token global continua respondendo (não quebra quem já usava)");
  const comOutro = Object.assign({}, semIg, { igSozinho: false });
  t(escolheCredencial([], "instagram", "IG-QUALQUER", comOutro) === null,
    "assim que alguém cadastra um Instagram, esse atalho se desliga sozinho");
}

console.log("Regressões travadas no código:");
// ---------- 12) um POST, um dono, uma assinatura ----------
t(/donos\.length > 1/.test(fonte) && /donos misturados/.test(fonte),
  "POST com donos diferentes no mesmo corpo é recusado (senão dava pra pendurar a mensagem de um na assinatura do outro)");
t(/const segredo = cred \? cred\.appSecret : env\("META_APP_SECRET"\)/.test(fonte),
  "dono conhecido usa o segredo DELE — cair no segredo global daria 401 em todas as mensagens dele");
t(/processa\(m, cred\)/.test(fonte) && !/await resolveDono\(canal, msg\.donoId/.test(fonte),
  "o dono é resolvido uma vez por POST e reaproveitado (não duas por mensagem)");
t(!/academias\?select=id&limit=1\b/.test(fonte),
  "sumiu o 'academias?select=id&limit=1' que sorteava uma academia qualquer");
t(/academias\?select=id&limit=2/.test(fonte) && /rows2\.length !== 1/.test(fonte),
  "o modo dono único só assume a academia quando existe UMA no banco (com duas, recusa)");
t(!/chat_config\?select=academia_id,auto_global/.test(fonte),
  "pegaConfig não busca mais 'a primeira linha de chat_config' sem filtro");
t(/chat_config\?select=auto_global,prompt,bot&academia_id=eq\./.test(fonte),
  "pegaConfig filtra pela academia dona da mensagem");
{
  const envia = fonte.slice(fonte.indexOf("async function enviaMeta"), fonte.indexOf("// ---------- chatbot"));
  t(!/Deno\.env\.get\("WHATSAPP_TOKEN"\)/.test(envia) && !/env\("WHATSAPP_TOKEN"\)/.test(envia),
    "a resposta não lê mais o token global — vem da credencial de quem recebeu");
  t(!/\/me\/messages/.test(envia), "o Instagram não responde mais por /me (que resolveria pro dono do token global)");
}
t(/metadata\?\.phone_number_id/.test(fonte), "o ID do número que recebeu é lido do payload");

console.log("");
console.log(falhas ? "💥 " + falhas + " FALHA(S)" : "🏁 TUDO PASSOU");
console.log("Resultado: " + ok + " ok, " + falhas + " falhas");
process.exit(falhas ? 1 : 0);
