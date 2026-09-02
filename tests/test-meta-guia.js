// Guia da Meta: é a página que o PROFESSOR vai seguir sozinho, num painel que
// muda de nome sem avisar. Depois que um cliente pagante desistiu no meio, ela
// tem duas obrigações: (1) avisar na PRIMEIRA dobra o que derruba a maioria
// (número exclusivo, CNPJ, cartão internacional, cobrança por mensagem), pra
// quem vai desistir desistir ANTES de perder a tarde; e (2) não mandar ninguém
// mexer em servidor — criar conta, Secret ou publicar função é trabalho do dono
// do sistema, e o cliente não tem (nem vai ter) acesso a isso.
const path = require("path");
const fs = require("fs");
let chromium;
try { chromium = require("playwright").chromium; } catch (e) { chromium = require("/opt/node22/lib/node_modules/playwright").chromium; }

const RAIZ = path.join(__dirname, "..");
const EXEC = fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined;
const BASE = process.env.BASE_URL || process.env.MT_BASE || "http://127.0.0.1:8765";

let falhas = 0;
// v756: o navegador vive FORA do IIFE pra o finally fechar mesmo quando a
// suíte para no meio (senão sobra Chromium órfão e o resumo nunca sai)
let navegadorV756 = null;
function ok(cond, msg) {
  console.log((cond ? "  ✅ " : "  ❌ ") + msg);
  if (!cond) falhas++;
}

(async () => {
  const b = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  navegadorV756 = b;
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  const erros = [];
  p.on("pageerror", (e) => erros.push(e.message));
  await p.goto(BASE + "/meta.html");
  await p.waitForFunction(() => window.__metaGuia, null, { timeout: 10000 });

  console.log("Guia da Meta (WhatsApp):");

  const texto = await p.evaluate(() => document.body.innerText);
  const g = await p.evaluate(() => window.__metaGuia);

  // ---- as duas trilhas declaradas: 7 passos pra mandar, 3 pra receber ----
  ok(g.parte1 === 7 && g.parte2 === 3 && g.passos === 10,
    "10 passos numerados: 7 na parte 1 (mandar) e 3 na parte 2 (receber) — deu " +
    g.parte1 + " + " + g.parte2);

  /* O aviso que faz o professor desistir CEDO. Ele já estava na página, mas
   * enterrado e sem falar de dinheiro: quem lia só descobria o cartão e o CNPJ
   * depois de 40 minutos de cadastro. */
  const antesDoPasso1 = texto.slice(0, texto.indexOf("Conta pessoal no Facebook"));
  ok(/não esteja em nenhum WhatsApp/i.test(antesDoPasso1) && /CNPJ/.test(antesDoPasso1) &&
     /cart[ãa]o internacional/i.test(antesDoPasso1) && /cobra por mensagem/i.test(antesDoPasso1),
    "as 4 exigências da Meta (número exclusivo, CNPJ, cartão, cobrança) vêm ANTES do passo 1");
  ok(/da Meta direto pra você/i.test(antesDoPasso1) && /TORQUE ON não cobra nada por isso/i.test(antesDoPasso1),
    "diz de quem é a conta das mensagens: da Meta pro professor, não do TORQUE ON");
  ok(/Pare por aqui/i.test(antesDoPasso1),
    "dá permissão de desistir antes de começar (o manual continua funcionando)");

  /* Nada de servidor: os passos de criar conta na nuvem, Secret e publicar
   * função eram trabalho do dono do sistema e estavam OBSOLETOS desde a v471 —
   * o painel já gera o token de verificação e mostra a URL do webhook. */
  // \b em "secrets?" de propósito: "chave secreta" é português e pode ficar
  const proibidas = /supabase|\bsecrets?\b|sql\.html|funcoes\.html|Edge Function|Verify JWT|WHATSAPP_TOKEN|WHATSAPP_PHONE_ID|META_VERIFY_TOKEN/i;
  const semAppSecret = texto.replace(/App Secret/g, "campo da Meta"); // esse é da Meta, o professor precisa achar
  ok(!proibidas.test(semAppSecret),
    "não manda o cliente mexer em servidor (sem nuvem, Secret ou publicar função)" +
    (proibidas.test(semAppSecret) ? " — achei: " + (semAppSecret.match(proibidas) || [""])[0] : ""));
  ok(!/reserve\s*40\s*minutos/i.test(texto) && !/manutenção/i.test(texto),
    "sem promessa de 40 minutos e sem o rótulo de manutenção (isso não é tela de dono)");

  // o token de teste morre em 24h: agora ele é PULADO, não consertado depois
  ok(/Pule o .{0,4}Token de acesso/i.test(texto) && /morre em 24 horas/i.test(texto) &&
     /Nunca expira/.test(texto),
    "manda pular a chave temporária e ir direto na permanente (Nunca expira)");

  // parte 2: no TORQUE PERSONAL a tela de conversas não existe — não pode ligar
  // procura sem ligar pra caixa: o rótulo da faixa é maiúsculo pelo CSS, e o
  // innerText devolve o texto JÁ transformado
  const parte2 = texto.slice(texto.toUpperCase().indexOf("PARTE 2 DE 2"));
  ok(/só no portal da academia/i.test(parte2) && /NÃO vale pro TORQUE PERSONAL/i.test(parte2) &&
     /não aparece em lugar nenhum/i.test(parte2),
    "a parte 2 avisa que receber respostas não aparece em tela nenhuma do TORQUE PERSONAL");
  ok(/quem gera é o próprio painel/i.test(parte2) && /URL de retorno/.test(parte2) &&
     /Token de verificação/.test(parte2),
    "a URL e a senha do webhook saem do PAINEL (a página não sorteia mais senha nenhuma)");
  ok(!/window\.__metaGuia\.verify/.test(await p.content()) && g.verify === undefined,
    "a página não gera mais um token de verificação próprio (ele não batia com o do servidor)");

  // o que ele ganha, dito sem enfeite
  ok(/Enviar todas agora/.test(texto) && /um toque no lugar de seis/i.test(texto) &&
     /Não existe robô mandando sozinho/i.test(texto) && /template/i.test(texto),
    "diz a verdade sobre o ganho: um toque no lugar de seis, sem agendador e com template obrigatório");

  // os três tropeços que fazem a instalação falhar em silêncio
  ok(/messages/.test(texto) && /Sem isso a Meta não manda nada/.test(texto),
    "avisa que sem marcar o campo messages a Meta fica calada");
  ok(/não esteja em nenhum WhatsApp|não serve/.test(texto),
    "avisa que o número não pode estar em uso no WhatsApp comum");
  // a tela onde ele travou de verdade: app criado antes do portfólio existir
  ok(/portfólio empresarial/i.test(texto) && /Nenhuma empresa disponível/.test(texto),
    "usa o nome atual (portfólio empresarial) e explica a tela de 'Nenhuma empresa disponível'");

  // os dois caminhos por onde ele chega aqui
  const fun = fs.readFileSync(path.join(RAIZ, "funcoes.html"), "utf8");
  const chat = fs.readFileSync(path.join(RAIZ, "apps/chat.html"), "utf8");
  ok(/meta\.html/.test(fun) && /meta\.html/.test(chat),
    "o guia é achável pela página das funções e pela tela do Chat e IA");

  ok(erros.length === 0, "sem erro de JS na página" + (erros.length ? " — " + erros[0] : ""));

  await b.close();
  console.log(falhas ? "\n💥 " + falhas + " FALHA(S)" : "\n🏁 TUDO PASSOU");
  process.exit(falhas ? 1 : 0);
})()
  .catch((e) => { falhas++; console.log("  ❌ a suíte parou no meio — " + (e && e.stack ? e.stack : e)); })
  .finally(async () => {
    try { if (navegadorV756) await navegadorV756.close(); } catch (e) { /* ja fechado */ }
    console.log(falhas ? "\n💥 " + falhas + " FALHA(S)" : "\n🏁 TUDO PASSOU");
    process.exit(falhas ? 1 : 0);
  });
