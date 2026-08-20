/* Construtor do app do aluno — A FONTE ÚNICA do código do app.
 *
 * Por que este arquivo existe: até a v466 o app de cada aluno era um HTML
 * gigante montado no navegador do professor e guardado inteiro na nuvem. Uma
 * correção de código só chegava no aluno quando ALGUÉM republicava — se o
 * professor sumisse, o aluno ficava para sempre na versão velha.
 *
 * Agora o código mora aqui, no site, e é servido igual pra todo mundo. O que
 * fica guardado por aluno é só o pacote de DADOS (fichas, avaliações, plano,
 * agenda…), montado pelo painel do professor. Quem abre o app — /app/ — junta
 * os dois na hora, então uma correção publicada aqui chega em todos os alunos
 * na próxima vez que eles abrirem o app, sem ninguém precisar clicar em nada.
 *
 * Regra pra mexer: NADA de dado de aluno aqui dentro. Tudo o que muda de aluno
 * pra aluno (ou de studio pra studio) entra pelo objeto D — inclusive a cor,
 * que chega em variáveis CSS no bloco :root.
 */
(function (raiz) {
  function esc(t) { return String(t == null ? "" : t).replace(/[<>&"']/g, function (c) { return { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function jsonApp(v) { return JSON.stringify(v).replace(/</g, "\\u003c"); }
  // datas: as mesmas contas do MTStore, copiadas aqui pra este arquivo rodar
  // sozinho (o /app/ do aluno não carrega o store do painel)
  var S = {
    todayISO: function (d) {
      d = d || new Date();
      var p = function (n) { return String(n).padStart(2, "0"); };
      return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
    },
    // só formata data de verdade: um carimbo estranho virava "undefined/undefined/..."
    // na linha "Gerado em" do rodapé do app
    fmtData: function (iso) {
      var t = String(iso || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return t || "—";
      var p = t.split("-"); return p[2] + "/" + p[1] + "/" + p[0];
    },
  };
  // "#7c3aed" -> "124,58,237" — deixa rgba(var(--x),.18) funcionar
  function rgbDe(hex) { var n = parseInt(String(hex).slice(1), 16); return ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255); }
  var MT_CQICONS = {
    medalha: "<circle cx='12' cy='9' r='5'/><path d='M9 13.5 7 21l5-2.4L17 21l-2-7.5'/>",
    trofeu: "<path d='M8 21h8M12 17v4M6 3h12v5a6 6 0 0 1-12 0z'/><path d='M6 5H3c0 3 1.5 4.5 3 4.5M18 5h3c0 3-1.5 4.5-3 4.5'/>",
    estrela: "<path d='m12 3 2.7 5.7 6.3.8-4.6 4.3 1.2 6.2-5.6-3-5.6 3 1.2-6.2L3 9.5l6.3-.8z'/>",
    coroa: "<path d='M3 17 2 7l5.5 4L12 4l4.5 7L22 7l-1 10z'/><path d='M3 21h18'/>",
    diamante: "<path d='M6 4h12l3 5-9 11L3 9zM3 9h18'/>",
    fogo: "<path d='M12 3c1 3-3 4.5-3 8a3 3 0 0 0 6 .2c1.6 1.4 2 3 2 4.3A5.5 5.5 0 0 1 6 15c0-5 5-7 6-12z'/>",
    raio: "<path d='M13 3 5 13h6l-1 8 8-10h-6z'/>",
    alvo: "<circle cx='12' cy='12' r='9'/><circle cx='12' cy='12' r='5'/><circle cx='12' cy='12' r='1.2'/>",
    foguete: "<path d='M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2M12 15l-3-3c1-4 4-8.5 11-9-.5 7-5 10-9 11z'/>",
    montanha: "<path d='m8 3 4 8 5-5 5 15H2z'/>",
    halter: "<path d='M7 7v10M4 9v6M17 7v10M20 9v6M7 12h10'/>",
    coracao: "<path d='M12 21C7 16.5 3 13.3 3 9.2 3 6.4 5.2 4 8 4c1.6 0 3.1.8 4 2 .9-1.2 2.4-2 4-2 2.8 0 5 2.4 5 5.2 0 4.1-4 7.3-9 11.8z'/>"
  };
  var crIco = function (p, t) { return "<svg width='" + (t || 22) + "' height='" + (t || 22) + "' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'>" + p + "</svg>"; };
  var CRICO_LOCK_P = "<rect x='3' y='11' width='18' height='11' rx='2'/><path d='M7 11V7a5 5 0 0 1 10 0v4'/>";
  var CRICO_CFG = crIco("<line x1='4' y1='21' x2='4' y2='14'/><line x1='4' y1='10' x2='4' y2='3'/><line x1='12' y1='21' x2='12' y2='12'/><line x1='12' y1='8' x2='12' y2='3'/><line x1='20' y1='21' x2='20' y2='16'/><line x1='20' y1='12' x2='20' y2='3'/><line x1='1' y1='14' x2='7' y2='14'/><line x1='9' y1='8' x2='15' y2='8'/><line x1='17' y1='16' x2='23' y2='16'/>");
  var CRICO_LOCK = crIco(CRICO_LOCK_P);
  var CRICO_MAPA = crIco("<path d='M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z'/><line x1='8' y1='2' x2='8' y2='18'/><line x1='16' y1='6' x2='16' y2='22'/>");
  var CRICO_PAINEL = crIco("<line x1='18' y1='20' x2='18' y2='10'/><line x1='12' y1='20' x2='12' y2='4'/><line x1='6' y1='20' x2='6' y2='14'/>");
  var appIco = function (p, s) { return "<svg width='" + s + "' height='" + s + "' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true' style='vertical-align:-2px;margin-right:6px;'>" + p + "</svg>"; };
  var APPIC = {
    pin: "<path d='M12 17v5'/><path d='M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z'/>",
    trofeu: "<path d='M8 21h8M12 17v4M6 3h12v5a6 6 0 0 1-12 0z'/><path d='M6 5H3c0 3 1.5 4.5 3 4.5M18 5h3c0 3-1.5 4.5-3 4.5'/>",
    presente: "<rect x='3' y='8' width='18' height='4' rx='1'/><path d='M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7'/><path d='M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5'/>",
    sino: "<path d='M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9'/><path d='M10.3 21a1.94 1.94 0 0 0 3.4 0'/>",
    prancheta: "<path d='M9 3h6v3H9z'/><rect x='5' y='4' width='14' height='17' rx='2'/><path d='M9 11h6M9 15h4'/>",
    relogio: "<circle cx='12' cy='12' r='9'/><path d='M12 7v5l3 2'/>",
    pessoas: "<circle cx='9' cy='8' r='3.4'/><path d='M2.8 20c0-3.4 2.8-6.2 6.2-6.2s6.2 2.8 6.2 6.2'/><path d='M16 5.2a3.4 3.4 0 0 1 0 6.4M17.5 14.2c2 1.1 3.4 3.2 3.4 5.8'/>",
  };

  function monta(D) {
    D = D || {};
    /* Tudo o que muda de aluno pra aluno chega por aqui. Os nomes são os mesmos
     * de antes, quando este trecho morava dentro do montaAppAluno — assim o
     * corpo do construtor ficou igualzinho e dá pra conferir linha a linha. */
    var a = D.a || {}, stamp = D.stamp || "";
    var st = { config: D.cfg || {}, desafio: D.desafio || null };
    var studio = D.studio || "Meu Personal";
    var COR = D.COR, COR2 = D.COR2, CORC = D.CORC, CORE = D.CORE, CORCL1 = D.CORCL1, CORCL2 = D.CORCL2;
    var PAL = D.PAL || [], LOGOAPP = D.LOGOAPP || "";
    var zapPersonal = D.zapPersonal || "", metaSemana = D.metaSemana || 3;
    var sessApp = D.sessApp || [], vidsApp = D.vidsApp || [], qa = D.qa || null;
    var ctApp = D.ctApp || null, plApp = D.plApp || null, pixApp = D.pixApp || null, svApp = D.svApp || [];
    var treino = D.treino || "", t2 = D.t2 || null, fichaVenceApp = D.fichaVenceApp || "";
    var fichasApp = D.fichasApp || null, fexs = D.fexs || [], guiaFichasP = D.guiaFichasP || [];
    var GIF = D.gif || null;
    var aqPorFicha = D.aqPorFicha || {}, raioX = D.raioX || null;
    var wodsApp = D.wodsApp || [], cardiosApp = D.cardiosApp || [];
    var menuOculta = D.menuOculta || [], feedLigado = !!D.feedLigado;
    var avs = D.avs || [], botApp = D.botApp || null, atualizador = D.atualizador || "";
    var vem = D.ve || {};
    var ve = function (k) { return vem[k] !== false; };
    var htmlApp = "<!DOCTYPE html><html lang='pt-BR'><head><meta charset='utf-8'>" +
      "<meta name='viewport' content='width=device-width,initial-scale=1'>" +
      "<link rel='manifest' href='/app/manifest.webmanifest'>" +
      "<link rel='icon' href='/assets/icons/icon-personal.svg' type='image/svg+xml'>" +
      "<link rel='apple-touch-icon' href='/assets/icons/icon-personal-192.png'>" +
      "<title>" + esc(a.nome.split(" ")[0]) + " · " + esc(studio) + "</title>" +
      "<style>:root{" +
      "--cor:" + COR + ";--cor2:" + COR2 + ";--corc:" + CORC + ";" +
      "--cor-esc:" + CORE + ";--cor-cl1:" + CORCL1 + ";--cor-cl2:" + CORCL2 + ";" +
      "--cor-rgb:" + rgbDe(COR) + ";--corc-rgb:" + rgbDe(CORC) + ";--bg0-rgb:" + rgbDe(PAL[0]) + ";" +
      PAL.map(function (c, i) { return "--bg" + i + ":" + c + ";"; }).join("") +
      "}" +
      "*{box-sizing:border-box;margin:0}body{font-family:'Archivo',system-ui,sans-serif;background:var(--bg0);color:#fff;max-width:480px;margin:0 auto;padding:0 0 calc(104px + env(safe-area-inset-bottom,0px));-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}a{color:var(--corc)}a:hover{color:var(--cor-cl1)}" +
      ".topo{padding:36px 20px 8px;background:none}" +
      ".topo .k{font-size:10px;letter-spacing:.3em;color:#6e6a78;font-weight:700;text-transform:uppercase}" +
      ".topo h1{font-size:30px;font-weight:800;letter-spacing:-.02em;margin-top:8px}" +
      ".cardx{background:none;border:none;border-radius:0;margin:32px 20px 0;padding:0;box-shadow:none}" +
      ".cardx h2{font-size:10.5px;letter-spacing:.22em;color:#6e6a78;text-transform:uppercase;margin-bottom:14px;font-weight:700}" +
      "pre{white-space:pre-wrap;font-family:inherit;font-size:14.5px;line-height:1.7;color:#d6d2df}" +
      "input,select,textarea{background:var(--bg2);border:1.5px solid rgba(255,255,255,.07);border-radius:12px;color:#fff;padding:12px 14px;font-family:inherit;font-size:15px}" +
      "input:focus,select:focus,textarea:focus{outline:none;border-color:var(--cor)}" +
      ".btnx{background:var(--cor);color:#fff;border:none;border-radius:99px;padding:13px 24px;font-weight:800;letter-spacing:.02em;font-size:13.5px;font-family:inherit;cursor:pointer;box-shadow:0 10px 30px -14px rgba(var(--cor-rgb),.9)}" +
      ".kv{display:flex;justify-content:space-between;font-size:14px;padding:7px 0;border-bottom:none}" +
      ".vz{color:#6e6a78;font-size:13px;text-align:center;padding:14px 0}" +
      ".up{color:#4ade80}.down{color:#f87171}" +
      "button{transition:transform .16s ease}button:active{transform:scale(.96)}" +
      "@keyframes cfQueda{to{transform:translateY(105vh) rotate(720deg);opacity:.7}}" +
      "@keyframes copoPop{0%{transform:scale(.75)}60%{transform:scale(1.14)}100%{transform:scale(1)}}" +
      // gaveta de cada ficha: a seta gira ao abrir e some a setinha nativa do navegador
      ".fichabox>summary::-webkit-details-marker{display:none}.fichabox .fseta{transition:transform .15s}.fichabox[open]>summary .fseta{transform:rotate(180deg)}" +
      ".fichabox+.fichabox{border-top:1px solid rgba(255,255,255,.06)}" +
      "@keyframes secIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}.sec-anim{animation:secIn .5s cubic-bezier(.22,.61,.36,1) both;animation-delay:calc(var(--ci,0)*55ms)}" +
      "@keyframes barIn{from{transform:scaleX(0)}}[style*='height:4px;background:var(--bg5)']>div{transform-origin:left;animation:barIn .9s cubic-bezier(.22,.61,.36,1) both}" +
      "@media (prefers-reduced-motion:reduce){.sec-anim,[style*='height:4px;background:var(--bg5)']>div{animation:none!important}button{transition:none}}" +
      // modo claro (o aluno alterna na gaveta ☰; o noturno é o padrão) — camada de overrides
      "html.claro body{background:#f4f3f7;color:#191622}" +
      "html.claro .cardx h2{color:#77718a}" +
      "html.claro input,html.claro select,html.claro textarea{background:#fff;border-color:#d9d5e3;color:#191622}" +
      "html.claro .kv{border-bottom:none}" +
      "html.claro .vz{color:#645e73}" +
      "html.claro #navApp{background:rgba(255,255,255,.9)!important;border-top:1px solid rgba(25,22,34,.06)!important}" +
      "html.claro #menuApp{background:#fff!important;border-left:1px solid #e4e1eb!important}" +
      "html.claro #menuApp .nitem{color:#3a3547!important}" +
      "html.claro #xpChip{background:rgba(25,22,34,.05)!important;border-color:transparent!important}" +
      "html.claro [style*='background:var(--bg2)']{background:#fff!important;box-shadow:0 1px 3px rgba(23,21,28,.07)}" +
      "html.claro [style*='background:var(--bg5)']{background:#e9e7ef!important}" +
      "html.claro [style*='background:var(--bg4)']{background:#f3f1f7!important}" +
      "html.claro [style*='var(--bg5)']{background:#e9e7ef!important}" +
      "html.claro [style*='background:var(--bg7)']{background:#efedf4!important}" +
      "html.claro [style*='background:var(--bg1)']{background:#fff!important}" +
      "html.claro [style*='background:var(--bg8)']{background:#e6e3ed!important}" +
      "html.claro [style*='background:var(--bg12)']{background:#d9d5e2!important}" +
      "html.claro [style*='rgba(255,255,255,.05)']{border-color:#e4e1eb!important}html.claro [style*='rgba(255,255,255,.06)']{border-color:#e4e1eb!important}html.claro [style*='rgba(255,255,255,.07)']{border-color:#d9d5e3!important}" +
      "html.claro [style*='var(--bg11)']{border-color:#d9d5e3!important}" +
      "html.claro [style*='var(--bg10)'],html.claro [style*='var(--bg9)']{border-color:#e4e1eb!important}" +
      "html.claro [style*='color:#fff'][style*='var(--bg4)'],html.claro [style*='color:#fff'][style*='var(--bg7)'],html.claro [style*='color:#fff'][style*='var(--bg1)'],html.claro [style*='color:#fff'][style*='var(--bg2)']{color:#241f31!important}" +
      "html.claro [style*='color:#a9a4b5']{color:#645e73!important}" +
      "html.claro [style*='color:#d6d2df']{color:#3a3547!important}" +
      "html.claro [style*='color:#cfcbdb']{color:#443f52!important}" +
      "html.claro [style*='color:#8a8695']{color:#6c6678!important}" +
      "html.claro [style*='color:#6e6a78']{color:#77718a!important}" +
      "html.claro [style*='color:var(--corc)']{color:var(--cor2)!important}" +
      "html.claro [style*='color:var(--cor-cl1)']{color:var(--cor2)!important}" +
      "html.claro .btnx[style*='background:var(--bg4)']{color:#241f31!important}" +
      /* ---------- treino guiado em tela cheia (estilo story) ----------
       * Tudo por CLASSE, nunca por style inline: os seletores do modo claro
       * acima reescrevem cor lendo a string do atributo style, e o player é
       * escuro nos DOIS temas de propósito (o card claro é a única superfície
       * clara). Inline aqui voltaria a cair naqueles seletores. */
      ".gwrap{display:none;position:fixed;inset:0;z-index:72;flex-direction:column;max-width:480px;margin:0 auto;" +
      "padding:calc(10px + env(safe-area-inset-top,0px)) 18px calc(8px + env(safe-area-inset-bottom,0px));" +
      "background:radial-gradient(120% 62% at 50% 42%,rgba(var(--cor-rgb),.20),transparent 68%),var(--bg2);color:#fff}" +
      ".gtopo{display:flex;align-items:center;gap:6px;min-height:44px}" +
      ".gmarca{flex:1;min-width:0;font-size:10px;letter-spacing:.3em;font-weight:800;color:#6e6a78;text-transform:uppercase;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      ".gtopo button{background:none;border:none;color:#6e6a78;font-family:inherit;cursor:pointer;min-height:44px;padding:0 9px;font-weight:700;font-size:11px;border-radius:99px}" +
      ".gtopo button:active{background:rgba(255,255,255,.07)}" +
      ".gtopo .gx{font-size:21px;min-width:44px;padding:0;color:#a9a4b5}"+
      ".gtopo .gvolta{min-width:44px;font-size:20px;padding:0}" +
      ".gbarra{display:flex;gap:4px;margin-top:12px}" +
      ".gbarra i{flex:1;height:4px;border-radius:2px;background:rgba(255,255,255,.13);overflow:hidden}" +
      ".gbarra i.past{background:rgba(255,255,255,.28)}" +
      ".gbarra i b{display:block;height:100%;width:0;border-radius:2px;background:linear-gradient(90deg,var(--cor),var(--corc));transition:width .3s ease}" +
      ".gcont{margin-top:9px;display:flex;align-items:flex-start;justify-content:space-between;gap:10px;" +
      "font-size:14px;font-weight:800;font-variant-numeric:tabular-nums;color:#6e6a78}" +
      ".gcont b{color:#fff}" +
      ".gcont #gProg span{display:block;font-size:11.5px;font-weight:600;margin-top:2px}" +
      ".gcont > span{flex:none;font-size:11.5px;font-weight:700;padding-top:2px}" +
      ".gcard{position:relative;flex:0 1 auto;max-height:64vh;overflow-y:auto;-webkit-overflow-scrolling:touch;margin-top:16px;border-radius:26px;padding:18px;"+
      "display:flex;flex-direction:column;" +
      "background:linear-gradient(160deg,#f6f3fd,#e9ddfb);color:#1d1729;" +
      "box-shadow:0 26px 66px -30px rgba(var(--cor-rgb),1),inset 0 0 0 1px rgba(var(--cor-rgb),.14)}" +
      ".gcard.recibo{max-height:68vh}"+
      ".ggif{margin-top:14px;border-radius:16px;overflow:hidden;background:#fff;box-shadow:inset 0 0 0 1px rgba(var(--cor-rgb),.12)}"+
      ".ggif img{display:block;width:100%;max-height:40vh;object-fit:contain;background:#fff}"+
      ".gwrap.reg .ggif{display:none!important}"+
      ".gchip{display:inline-block;align-self:flex-start;font-size:9.5px;letter-spacing:.18em;font-weight:800;text-transform:uppercase;color:var(--cor2);background:rgba(var(--cor-rgb),.12);border-radius:99px;padding:5px 11px}" +
      ".gsets{display:flex;gap:6px;margin-top:16px;flex-wrap:wrap}" +
      ".gsets i{flex:1;min-width:38px;max-width:72px;height:52px;border-radius:13px;background:#e6e2ef;color:#8b83a2;display:flex;align-items:center;justify-content:center;" +
      "font-size:22px;font-weight:800;font-style:normal;font-variant-numeric:tabular-nums;transition:height .2s ease}" +
      ".gsets i.ok{background:linear-gradient(160deg,var(--cor),var(--cor2));color:#fff}" +
      ".gsets i.now{background:#fff;color:var(--cor2);box-shadow:inset 0 0 0 2px var(--cor)}" +
      ".gsets.mini i{height:28px;font-size:14px}" +
      ".gobs{margin-top:14px;border-left:3px solid var(--cor);padding-left:11px}" +
      ".gobs em{display:block;font-style:normal;font-size:9px;letter-spacing:.18em;font-weight:800;text-transform:uppercase;color:#6f6688}" +
      ".gobs p{font-size:13.5px;font-weight:700;color:var(--cor2);margin-top:3px;line-height:1.4}" +
      ".gdica{margin-top:12px;font-size:13.5px;line-height:1.5;color:#544c68}" +
      ".ghist{margin-top:14px;font-size:12px;color:#6f6688;font-variant-numeric:tabular-nums}" +
      ".gcard .vidbtn{margin-top:14px;align-self:flex-start;background:rgba(var(--cor-rgb),.14);border:1px solid rgba(var(--cor-rgb),.5);color:var(--cor2);" +
      "font-weight:800;font-size:13px;padding:11px 18px;border-radius:99px;font-family:inherit;cursor:pointer;min-height:44px}" +
      ".gbig{text-align:center;font-size:clamp(64px,26vw,116px);line-height:1;font-weight:800;color:var(--cor2);font-variant-numeric:tabular-nums;margin:10px 0 2px}"+
      /* fim do exercício: o número vira placar pequeno pra o registro da carga
         caber na MESMA tela — no celular pequeno ele empurrava o stepper pra fora */
      ".gcard.compacto .gbig{font-size:34px;margin:8px 0 0;text-align:left}"+
      ".gcard.compacto .gbiglab{text-align:left;margin-top:2px}"+
      ".gcard.compacto .gtrilho{margin:8px 0 0;max-width:none}"+
      /* enquanto ele anota a carga, o nome do exercício embaixo é redundante:
         sai da frente pra o botão Salvar caber na tela sem rolar (iPhone SE) */
      ".gwrap.reg .ggrupo,.gwrap.reg .gtit,.gwrap.reg .gmeta{display:none!important}"+
      ".gwrap.reg .gcard{max-height:80vh}"+
      ".gwrap.reg .gsets,.gwrap.reg .ghist{display:none}"+
      ".gcard.compacto .gstep input{font-size:34px}"+
      ".gcard.compacto .gstep.rep input{font-size:22px}" +
      ".gbiglab{text-align:center;font-size:10px;letter-spacing:.22em;font-weight:800;text-transform:uppercase;color:#6f6688}" +
      ".gtrilho{height:5px;border-radius:3px;background:#ded7ee;width:100%;margin:12px auto 0;max-width:220px;overflow:hidden}" +
      ".gtrilho b{display:block;height:100%;background:var(--cor);border-radius:3px}" +
      ".gcg{margin-top:16px}" +
      ".gcglab{font-size:9.5px;letter-spacing:.2em;font-weight:800;text-transform:uppercase;color:#6f6688}" +
      ".gstep{display:flex;align-items:center;gap:10px;margin-top:8px}" +
      ".gstep button{width:52px;height:52px;flex:none;border-radius:16px;border:1px solid rgba(var(--cor-rgb),.35);background:#fff;color:var(--cor2);" +
      "font-size:26px;font-weight:800;font-family:inherit;cursor:pointer;line-height:1}" +
      ".gstep button:active{background:rgba(var(--cor-rgb),.12)}" +
      ".gstep input{flex:1;min-width:0;background:none;border:none;text-align:center;color:#1d1729;font-family:inherit;"+
      "}.gstep input::placeholder{color:#b3aac6;font-size:17px;font-weight:700}.gstep input{" +
      "font-size:44px;font-weight:800;font-variant-numeric:tabular-nums;padding:0;min-height:52px}" +
      ".gstep input:focus{outline:2px solid var(--cor);outline-offset:4px;border-radius:10px}" +
      ".gstep u{font-style:normal;text-decoration:none;font-size:15px;font-weight:800;color:#6f6688;flex:none}" +
      ".gstep.rep input{font-size:26px}" +
      ".gstep.rep button{width:44px;height:44px;font-size:21px}" +
      ".gsalvar{width:100%;min-height:52px;margin-top:14px;border-radius:16px;border:none;background:linear-gradient(135deg,var(--cor),var(--cor2));" +
      "color:#fff;font-family:inherit;font-size:15px;font-weight:800;cursor:pointer}" +
      ".gsemcarga{width:100%;min-height:44px;margin-top:8px;border-radius:99px;border:1px solid #d6cfe6;background:none;color:#6f6688;" +
      "font-family:inherit;font-size:13px;font-weight:700;cursor:pointer}" +
      ".ggrupo{margin-top:11px;font-size:9px;letter-spacing:.2em;font-weight:800;text-transform:uppercase;color:var(--corc)}" +
      ".gtit{font-size:clamp(17px,4.8vw,21px);line-height:1.15;font-weight:800;letter-spacing:-.01em;margin-top:3px}" +
      ".gmeta{display:flex;gap:6px;flex-wrap:wrap;min-width:0}" +
      ".gmeta i{font-style:normal;font-size:11px;font-weight:800;border-radius:99px;padding:5px 11px;background:rgba(255,255,255,.07);color:#cfcbdb}" +
      ".gmeta i.forte{background:linear-gradient(135deg,var(--cor),var(--cor2));color:#fff}" +
      /* rodapé em UMA faixa: chips do treino à esquerda, relógio à direita.
         Antes o nome do exercício vinha em 28px e o cronômetro em 30px com
         rótulo em caixa alta — três blocos altos que empurravam o vídeo pra
         fora da tela e obrigavam a rolar o card pra ver o movimento. */
      ".gbase{margin-top:13px;display:flex;align-items:center;justify-content:space-between;gap:10px}" +
      ".grelo{flex:none;display:flex;align-items:baseline;gap:5px;font-variant-numeric:tabular-nums;color:#6e6a78}" +
      ".grelo b{font-size:19px;font-weight:800;color:#fff;line-height:1}" +
      ".grelo em{font-style:normal;font-size:10.5px;font-weight:700}" +
      ".gpe{margin-top:auto;padding-top:14px;display:flex;gap:8px}" +
      ".gpe button{min-height:58px;border-radius:20px;border:none;font-family:inherit;font-size:17px;font-weight:800;cursor:pointer;flex:1}" +
      ".gpe .prin{background:linear-gradient(135deg,var(--cor),var(--cor2));color:#fff;box-shadow:0 14px 34px -16px rgba(var(--cor-rgb),1)}" +
      ".gpe .sec{background:rgba(255,255,255,.07);color:#cfcbdb}" +
      ".gpe .mais{flex:none;width:74px;font-size:15px}" +
      ".gfalta{width:100%;min-height:44px;margin-top:8px;border-radius:14px;border:1px solid rgba(var(--cor-rgb),.4);background:rgba(var(--cor-rgb),.08);" +
      "color:var(--cor2);font-family:inherit;font-size:13.5px;font-weight:800;cursor:pointer;text-align:left;padding:0 14px}" +
      "@media (max-height:620px){.gsets i{height:44px;font-size:19px}.grelo b{font-size:17px}.gpe button{min-height:52px}.gtit{font-size:16px}}" +
      "</style></head><body>" +
      "<div class='topo' style='display:flex;align-items:center;gap:14px;'>" +
      "<div style='flex:1;min-width:0;'>" + (LOGOAPP ? "<img src='" + LOGOAPP + "' alt='' style='height:44px;border-radius:10px;margin-bottom:6px;display:block;'>" : "") + "<div class='k'>" + esc(studio).toUpperCase() + "</div><h1 style='padding:0;'>" + esc(a.nome.split(" ")[0]) + "</h1><div id='secTit' style='color:var(--corc);font-size:12.5px;font-weight:700;margin-top:2px;'></div></div>" +
      // selo de nível SEPARADO do chip de XP: o teste lê o primeiro número do
      // #xpChip como XP — um "Nv 3" lá dentro quebraria a conta
      "<span id='nvChip' style='flex:none;display:inline-flex;align-items:center;gap:4px;background:linear-gradient(135deg,var(--cor),var(--cor2));border-radius:99px;padding:7px 11px;font-weight:800;font-size:12.5px;color:#fff;box-shadow:0 6px 18px -8px var(--cor);'>" +
      "<svg width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='#fff' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M12 3l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.4 6.7 19.1l1-5.8-4.2-4.1 5.9-.9z'/></svg>" +
      "Nv <b id='nvNum'>1</b></span>" +
      "<span id='xpChip' style='flex:none;display:inline-flex;align-items:center;gap:5px;background:rgba(255,255,255,.06);border:1px solid transparent;border-radius:99px;padding:7px 13px;font-weight:800;font-size:12.5px;'>" +
      "<svg width='13' height='13' viewBox='0 0 24 24' fill='var(--corc)' aria-hidden='true'><path d='M13 2 3 14h7l-1 8 10-12h-7z'/></svg>" +
      "<span><b id='xpNum'>0</b> XP</span></span></div>" +
      // barra de abas fixa embaixo (estilo app nativo — itens preenchidos pelo script)
      // o menu já nasce montado no HTML (aparece até em visualizador sem JS); o script refina depois
      "<nav id='navApp' aria-label='Menu do app' style='position:fixed;bottom:0;left:0;right:0;max-width:480px;margin:0 auto;background:rgba(var(--bg0-rgb),.88);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-top:1px solid rgba(255,255,255,.04);display:flex;z-index:50;padding:6px 4px calc(6px + env(safe-area-inset-bottom,0px));'>" +
      [["<path d='M3 10 12 3l9 7'/><path d='M5 8.8V21h14V8.8'/><path d='M9.5 21v-6h5v6'/>", "Início"],
        ["<path d='M7 7v10M4 9v6M17 7v10M20 9v6M7 12h10'/>", "Treino"],
        ["<polyline points='3 17 9 11 13 15 21 7'/><polyline points='15 7 21 7 21 13'/>", "Evolução"],
        ["<rect x='3' y='5' width='18' height='16' rx='2'/><path d='M16 3v4M8 3v4M3 11h18'/>", "Agenda"],
        ["<path d='M4 6.5h16M4 12h16M4 17.5h16'/>", "Menu"]].map(function (mN) {
        return "<button class='nitem' style='flex:1;min-width:0;background:none;border:none;font-family:inherit;color:#8a8695;display:flex;flex-direction:column;align-items:center;gap:3px;padding:7px 2px 5px;border-radius:9px;'>" +
          "<span style='line-height:0;'><svg width='21' height='21' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'>" + mN[0] + "</svg></span>" +
          "<span style='font-size:8.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;white-space:nowrap;'>" + mN[1] + "</span></button>";
      }).join("") +
      "</nav>" +
      // gaveta do menu ☰ (igual ao módulo do personal): fundo escurecido + painel pela direita
      "<div id='fundoMenuApp' style='display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:60;'></div>" +
      "<div id='menuApp' aria-label='Todas as áreas do app' style='position:fixed;top:0;bottom:0;right:0;width:264px;background:var(--bg2);border-left:1px solid var(--bg9);z-index:61;transform:translateX(105%);transition:transform .22s ease;padding:20px 12px calc(18px + env(safe-area-inset-bottom,0px));overflow:auto;display:flex;flex-direction:column;gap:2px;'></div>" +
      // onboarding de 30 segundos (só aparece no primeiro uso — some depois de responder)
      "<div class='cardx' id='onbCard' style='display:none;border-color:var(--cor);'>" +
      "<h2>Bora começar!</h2><div class='vz' style='text-align:left;padding:2px 0 8px;'>3 perguntinhas rápidas pro " + esc(a.nome.split(" ")[0]) + " do futuro agradecer:</div>" +
      "<div style='font-size:12.5px;font-weight:700;margin-bottom:5px;'>Seu objetivo principal</div>" +
      "<div id='onbObj' style='display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;'></div>" +
      "<div style='font-size:12.5px;font-weight:700;margin-bottom:5px;'>Quantos dias por semana dá pra treinar?</div>" +
      "<div id='onbDias' style='display:flex;gap:6px;margin-bottom:10px;'></div>" +
      "<input id='onbDor' placeholder='Alguma dor ou limitação? (opcional)' style='width:100%;margin-bottom:10px;'>" +
      "<button class='btnx' id='onbOk' style='width:100%;'>Pronto, bora treinar!</button></div>" +
      // card herói "treino de hoje" (estilo Prime) — a ficha do dia gira sozinha
      (fichasApp ? "<div class='cardx' id='heroTreino' style='background:var(--bg2);border-radius:20px;padding:24px 22px;position:relative;overflow:hidden;'>" +
        // foto da ficha do dia (o professor escolhe uma por ficha) — some quando não tem
        "<img id='htFoto' alt='' style='display:none;position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.6;'>" +
        "<div id='htVeu' style='display:none;position:absolute;inset:0;background:linear-gradient(180deg,rgba(18,16,22,.2) 0%,rgba(18,16,22,.72) 55%,rgba(18,16,22,.94) 100%);'></div>" +
        "<div style='position:relative;'>" +
        "<div style='font-size:10px;font-weight:700;letter-spacing:.26em;color:var(--corc);text-transform:uppercase;'>HOJE · <span id='htRot'></span></div>" +
        "<div id='htTitulo' style='font-size:27px;font-weight:800;letter-spacing:-.02em;margin:10px 0 4px;text-transform:uppercase;'></div>" +
        "<div id='htSub' style='font-size:13px;color:#8a8695;'></div>" +
        "<button id='htVer' style='margin-top:18px;background:var(--cor);border:none;color:#fff;border-radius:99px;padding:11px 22px;font-weight:800;font-size:13px;font-family:inherit;cursor:pointer;letter-spacing:.02em;'>Ver treino ›</button></div></div>" : "") +
      // minha semana: vem logo depois do treino do dia — é o "Treinei hoje!" que
      // o aluno vem buscar quando abre o app
      "<div class='cardx'><h2>Minha semana</h2>" +
      "<div id='diasSem' style='display:flex;gap:6px;justify-content:space-between;margin-bottom:12px;'></div>" +
      "<div id='metaBox' style='margin-bottom:12px;'></div>" +
      "<button class='btnx' id='btnFeito' style='width:100%;padding:14px;font-size:15px;'>Treinei hoje!</button>" +
      "<div id='rpeBox' style='display:none;margin-top:10px;'></div>" +
      "<div id='medalhas' class='vz' style='margin-top:10px;'></div></div>" +
      // progresso rápido (peso + treinos do mês)
      "<div class='cardx'><h2>Progresso</h2><div id='pgTiles' style='display:grid;grid-template-columns:1fr 1fr;gap:10px;'></div></div>" +
      // retrospectiva do mês fechado (aparece no comecinho do mês seguinte, some ao fechar)
      "<div class='cardx' id='retroCard' style='display:none;border-color:var(--cor);'><h2>Retrospectiva</h2>" +
      "<div id='retroBox'></div>" +
      "<div style='display:flex;gap:8px;margin-top:10px;'>" +
      "<button class='btnx' id='retroShare' style='flex:2;'>Compartilhar meu mês</button>" +
      "<button class='btnx' id='retroFecha' style='flex:1;background:var(--bg4);border:1px solid rgba(255,255,255,.06);color:#a9a4b5;box-shadow:none;'>Fechar</button></div></div>" +
      (((st.config || {}).mural || []).length
        ? "<div class='cardx' style='border-color:var(--cor);'><h2>" + appIco(APPIC.pin, 14) + "Mural do studio</h2>" +
          ((st.config || {}).mural || []).map(function (av) {
            return "<div style='font-size:14px;padding:6px 0;border-bottom:1px dashed var(--bg11);'>• " + esc(av) + "</div>";
          }).join("") + "</div>"
        : "") +
      // ---------- Comunidade: o feed da turma (o professor liga nas Configurações) ----------
      (feedLigado
        ? "<div class='cardx'><h2>" + appIco(APPIC.pessoas, 14) + "Comunidade</h2>" +
          "<div class='vz' style='text-align:left;padding:0 0 10px;font-size:12.5px;'>O mural da turma: conte como foi o treino, poste a foto e puxe a galera. Só quem treina " +
          "com você vê — nada disso vai pra fora do studio.</div>" +
          "<div id='fdRank' style='margin-bottom:12px;'></div>" +
          "<div style='background:var(--bg4);border:1px solid var(--bg11);border-radius:14px;padding:10px;'>" +
          "<textarea id='fdTexto' rows='2' maxlength='600' placeholder='Ex.: fechei 100 kg no agacho hoje!' " +
          "style='width:100%;background:transparent;border:none;outline:none;color:inherit;font-family:inherit;font-size:14px;resize:vertical;'></textarea>" +
          "<div id='fdPrev' style='display:none;margin:6px 0;position:relative;'>" +
          "<img id='fdPrevImg' alt='foto que você vai publicar' style='width:100%;border-radius:10px;display:block;'>" +
          "<button id='fdTira' aria-label='Tirar a foto do post' style='position:absolute;top:6px;right:6px;background:rgba(0,0,0,.65);border:none;color:#fff;border-radius:99px;width:28px;height:28px;font-size:15px;cursor:pointer;font-family:inherit;'>✕</button></div>" +
          "<div style='display:flex;gap:8px;margin-top:6px;'>" +
          "<label class='btnx' id='fdFotoBt' style='flex:1;background:var(--bg0);border:1px solid var(--bg11);color:#a9a4b5;box-shadow:none;text-align:center;cursor:pointer;'>Foto" +
          "<input id='fdFoto' type='file' accept='image/*' style='display:none;'></label>" +
          "<button class='btnx' id='fdEnvia' style='flex:2;'>Publicar</button></div>" +
          "<div id='fdStatus' class='vz' style='font-size:12px;padding:6px 0 0;'></div></div>" +
          "<div id='fdLista' style='margin-top:14px;'></div></div>"
        : "") +
      ((st.desafio && st.desafio.nome && st.desafio.fim >= S.todayISO())
        ? "<div class='cardx' style='border-color:var(--corc);background:linear-gradient(160deg,#241d33,var(--bg7));'><h2>" + appIco(APPIC.trofeu, 14) + "Desafio: " + esc(st.desafio.nome) + "</h2>" +
          "<div class='vz' style='text-align:left;padding:2px 0 8px;'>De " + st.desafio.ini.split("-").reverse().join("/") + " a " + st.desafio.fim.split("-").reverse().join("/") +
          (st.desafio.premio ? " · Prêmio: <b style='color:#fff'>" + esc(st.desafio.premio) + "</b>" : "") +
          " — cada <b style='color:var(--corc)'>Treinei hoje!</b> conta ponto.</div>" +
          "<div class='kv'><span>Seus treinos no desafio</span><b id='dsMeus' style='color:var(--corc);'>0</b></div>" +
          "<div id='dsPlacar' class='vz' style='font-size:12.5px;'>Carregando placar…</div></div>"
        : "") +
      (sessApp.length ? "<div class='cardx'><h2>Minhas sessões com " + esc(studio.split(" ")[0]) + "</h2>" +
        sessApp.map(function (x, si) {
          var pd = x.d.split("-");
          return "<div class='kv'><span>" + pd[2] + "/" + pd[1] + (x.h ? " às " + x.h : "") + "</span><span>te espero!</span></div>" +
            (si === 0 ? "<div id='sconfBox' data-d='" + x.d + "' data-h='" + esc(x.h) + "' style='display:flex;gap:8px;margin:8px 0 4px;'>" +
              "<button data-pconf='1' style='flex:1;background:linear-gradient(135deg,var(--cor),var(--corc));border:none;color:#fff;border-radius:99px;padding:9px 0;font-weight:800;font-size:13px;font-family:inherit;cursor:pointer;'>Confirmo presença ✓</button>" +
              "<button data-pconf='0' style='flex:1;background:var(--bg4);border:1px solid rgba(255,255,255,.06);color:#a9a4b5;border-radius:99px;padding:9px 0;font-size:13px;font-family:inherit;cursor:pointer;'>Não vou conseguir</button></div>" : "");
        }).join("") + "</div>" : "") +
      "<div class='cardx'><h2>Agenda</h2>" +
      "<div id='agCal'></div><div id='agDia' style='margin-top:10px;'></div>" +
      "<div id='agForm' style='display:none;margin-top:10px;'>" +
      "<div style='display:flex;gap:8px;'><select id='agHora' style='flex:1'></select><button class='btnx' id='agPede'>Pedir horário</button></div>" +
      "<input id='agObs' placeholder='Observação (opcional)' style='width:100%;margin-top:8px;'></div>" +
      "<div class='vz' id='agNota' style='font-size:11.5px;'>Toque num dia pra ver os horários ou pedir um novo.</div></div>" +
      "<div class='cardx'><h2>Conquistas</h2>" +
      "<div id='nvCard' style='margin-bottom:12px;'></div>" +
      "<div id='cqGrid' style='display:grid;grid-template-columns:repeat(3,1fr);gap:8px;'></div>" +
      "<div id='cqGraf' style='margin-top:14px;'></div>" +
      "<div id='mapaAno' style='margin-top:14px;'></div>" +
      "<button class='btnx' id='btnCardStories' style='display:block;width:100%;text-align:center;margin-top:10px;'>Gerar card pro Stories</button></div>" +
      // sub-abas da área de treino: ficha tradicional × circuito (WOD) × corrida — conforme o professor liberou
      ((ve("wod") || ve("cardio")) ? "<div class='cardx' id='trTabs' style='padding:9px 11px;'><div style='display:flex;gap:6px;'>" +
      "<button data-trsub='ficha' style='flex:1;padding:9px 0;border-radius:16px;font-family:inherit;font-size:12.5px;font-weight:800;cursor:pointer;background:linear-gradient(135deg,var(--cor),var(--corc));border:none;color:#fff;'>Minha ficha</button>" +
      (ve("wod") ? "<button data-trsub='wod' style='flex:1;padding:9px 0;border-radius:16px;font-family:inherit;font-size:12.5px;font-weight:800;cursor:pointer;background:var(--bg4);border:1px solid rgba(255,255,255,.06);color:#a9a4b5;'>Circuito (WOD)</button>" : "") +
      (ve("cardio") ? "<button data-trsub='cardio' style='flex:1;padding:9px 0;border-radius:16px;font-family:inherit;font-size:12.5px;font-weight:800;cursor:pointer;background:var(--bg4);border:1px solid rgba(255,255,255,.06);color:#a9a4b5;'>Corrida e bike</button>" : "") +
      "</div></div>" : "") +
      "<div class='cardx'><h2>Meu treino</h2>" +
      (fichaVenceApp ? "<div style='background:rgba(217,119,6,.15);border:1px solid #d97706;border-radius:16px;padding:10px 13px;font-size:13px;color:#fbbf24;margin-bottom:8px;'>" + appIco(APPIC.relogio, 13) + "Sua ficha venceu em " + esc(S.fmtData(fichaVenceApp)) + " — cobra o treino novo de " + esc(studio.split(" ")[0]) + "!</div>" : "") +
      // cada ficha (A, B, C…) é uma gaveta: a do dia abre sozinha, o resto fica recolhido
      (fichasApp ? fichasApp.map(function (f, gi) {
        return "<details class='fichabox' data-fi='" + gi + "'" + (gi === 0 ? " open" : "") + " style='margin:8px 0;'>" +
          "<summary style='list-style:none;cursor:pointer;display:flex;align-items:center;gap:8px;padding:11px 2px;font-weight:800;font-size:13px;letter-spacing:.08em;color:var(--corc);text-transform:uppercase;'>" +
          "<span style='flex:1;min-width:0;'>" + esc(f.titulo) + "</span>" +
          "<span style='font-size:11px;font-weight:700;letter-spacing:.04em;color:#6e6a78;text-transform:none;white-space:nowrap;'>" + f.itens.length + " exercício" + (f.itens.length === 1 ? "" : "s") + "</span>" +
          "<span class='fseta' style='color:#6e6a78;font-size:12px;'>▾</span></summary>" +
          "<div style='padding-bottom:4px;'>" +
          (aqPorFicha[gi] && aqPorFicha[gi].length > 1
            ? "<details class='aqbox' style='background:rgba(251,146,60,.08);border:1px solid rgba(251,146,60,.45);border-radius:16px;margin:4px 0 8px;overflow:hidden;'>" +
              "<summary style='padding:10px 13px;cursor:pointer;list-style:none;font-size:13px;font-weight:800;color:#fdba74;'>Aquecimento do dia (~4 min) ›</summary>" +
              "<div style='padding:0 13px 10px;font-size:13px;color:#d6d2df;'>" +
              aqPorFicha[gi].map(function (aq) { return "<div class='kv' style='border-color:rgba(251,146,60,.2);'><span>" + esc(aq[0]) + "</span><b style='color:#fdba74;white-space:nowrap;'>" + esc(aq[1]) + "</b></div>"; }).join("") +
              "<div class='vz' style='font-size:11px;padding:6px 0 0;'>Aquecer evita lesão e melhora o treino — não pula!</div></div></details>"
            : "") +
          (f.itens.length ? "<button class='btnx guiabtn' data-g='" + gi + "' style='display:block;width:100%;text-align:center;margin:2px 0 8px;'>Treino guiado</button>" : "") +
          f.itens.map(function (it, ii) {
            var rst = +it.descanso || 60, rAlt = rst === 90 ? 60 : 90;
            return "<details style='background:var(--bg2);border-radius:16px;margin:8px 0;overflow:hidden;'>" +
              "<summary style='padding:11px 13px;cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:8px;font-size:14px;'>" +
              "<b>" + esc(it.nome) + "</b><span style='color:#a9a4b5;white-space:nowrap;'>" + it.series + "×" + esc(String(it.reps)) + " · " + rst + "s ›</span></summary>" +
              "<div style='padding:0 13px 12px;font-size:13.5px;color:#d6d2df;line-height:1.6;'>" +
              (it.desc ? "<div style='margin-bottom:8px;'>" + esc(it.desc) + "</div>" : "") +
              (it.obs ? "<div style='color:var(--corc);margin-bottom:8px;'>" + esc(it.obs) + "</div>" : "") +
              (it.video ? "<button class='vidbtn' data-v='" + esc(it.video) + "' style='background:none;border:none;color:#8a8695;font-weight:700;font-size:12px;padding:5px 4px;font-family:inherit;cursor:pointer;text-decoration:underline;'>vídeo</button>" : "") +
              ((!it.desc && !it.obs) ? "<span style='color:#6e6a78;font-size:12.5px;margin-left:8px;'>Dúvidas? Chama no chat!</span>" : "") +
              "<div class='vidbox' style='display:none;'></div>" +
              (it.alts && it.alts.length ? "<div style='margin-top:8px;'><button class='altbtn' style='background:none;border:none;color:#a9a4b5;font-size:12.5px;text-decoration:underline;cursor:pointer;font-family:inherit;padding:0;'>Sem esse aparelho hoje?</button>" +
                "<div class='altbox' style='display:none;color:var(--cor-cl1);font-size:12.5px;margin-top:5px;'>Troca por: <b>" + it.alts.map(function (nA) { return esc(nA); }).join("</b> ou <b>") + "</b> — mesmo padrão de movimento. Na dúvida, chama no chat!</div></div>" : "") +
              "<div style='display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap;'>" +
              "<button class='inibtn' data-g='" + gi + "' data-e='" + ii + "' style='background:var(--cor);border:none;color:#fff;border-radius:99px;padding:8px 18px;font-weight:700;font-size:13px;font-family:inherit;cursor:pointer;'>Iniciar exercício</button>" +
              "<button class='setbtn' data-ex='" + esc(it.nome) + "' data-n='" + (+it.series || 3) + "' style='background:var(--bg7);border:1px solid transparent;color:var(--cor-cl1);border-radius:99px;padding:8px 18px;font-weight:700;font-size:13px;font-family:inherit;cursor:pointer;'>0/" + (+it.series || 3) + " séries ✓</button>" +
              "<button class='tmrbtn' data-s='" + rst + "' style='background:rgba(var(--cor-rgb),.18);border:1px solid transparent;color:var(--cor-cl1);border-radius:99px;padding:8px 14px;font-size:12px;font-family:inherit;cursor:pointer;font-weight:700;'>Descanso " + rst + "s</button>" +
              "<button class='tmrbtn' data-s='" + rAlt + "' style='background:var(--bg5);border:1px solid transparent;color:#a9a4b5;border-radius:99px;padding:8px 14px;font-size:12px;font-family:inherit;cursor:pointer;'>" + rAlt + "s</button>" +
              "</div></div></details>";
          }).join("") + "</div></details>";
      }).join("")
      : treino ? "<div style='font-size:14.5px;line-height:1.7;'>" + treino.split("\n").map(function (ln) {
        var m = ln.match(/(https?:\/\/\S+)/);
        if (m) {
          var rot = esc(ln.replace(m[1], "").replace(/🎬/g, "").trim());
          return "<div style='margin:3px 0;'><div style='display:flex;align-items:center;gap:8px;flex-wrap:wrap;'>" + (rot ? "<span>" + rot + "</span>" : "") +
            "<button class='vidbtn' data-v='" + esc(m[1]) + "' style='background:rgba(var(--cor-rgb),.2);border:1px solid var(--cor);color:var(--cor-cl1);font-weight:700;font-size:12px;padding:3px 12px;border-radius:99px;font-family:inherit;cursor:pointer;'>Ver vídeo</button></div>" +
            "<div class='vidbox' style='display:none;'></div></div>";
        }
        return ln.trim() ? "<div>" + esc(ln) + "</div>" : "<div style='height:8px;'></div>";
      }).join("") + "</div>" : "<div class='vz'>Seu treino aparece aqui — peça ao seu personal.</div>") + "</div>" +
      (raioX.length ? "<div class='cardx'><h2>Raio-X do treino</h2>" +
        "<div class='vz' style='text-align:left;padding:0 0 8px;'>Séries por grupo muscular somando todas as fichas — treino equilibrado é treino que dura.</div>" +
        (function () {
          var maxS = raioX[0].s || 1;
          return raioX.map(function (r) {
            return "<div style='margin:7px 0;'><div style='display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:3px;'><span>" + esc(r.g) + "</span><b style='color:var(--corc);'>" + r.s + " séries</b></div>" +
              "<div style='height:4px;background:var(--bg5);border-radius:99px;overflow:hidden;'><div style='height:100%;width:" + Math.round(100 * r.s / maxS) + "%;background:linear-gradient(90deg,var(--cor),var(--corc));border-radius:99px;'></div></div></div>";
          }).join("");
        })() + "</div>" : "") +
      // modo circuito (WOD): cronômetros de cross — só se o professor liberou nas Configurações
      (ve("wod") ? "<div class='cardx' id='cardWod'><h2>Modo circuito (WOD)</h2>" +
      (wodsApp.length ? wodsApp.map(function (w) {
        // folha de WOD estilo quadro da academia: tipo em destaque, blocos com rótulos
        var bloco = function (rot, html) {
          return "<div style='margin-top:12px;'><div style='color:var(--corc);font-size:10.5px;font-weight:800;letter-spacing:.16em;'>" + rot + "</div>" + html + "</div>";
        };
        var movsH = (w.movs && w.movs.length ? w.movs : w.mov.map(function (l) { return { q: "", n: l }; })).map(function (m) {
          return "<div style='display:flex;gap:10px;align-items:baseline;font-size:15px;padding:5px 0;border-bottom:1px dashed var(--bg11);'>" +
            (m.q ? "<b style='color:var(--corc);flex:none;min-width:44px;'>" + esc(m.q) + "</b>" : "") +
            "<span>" + esc(m.n) + "</span></div>";
        }).join("");
        return "<div style='background:linear-gradient(165deg,var(--bg5),var(--bg4));border:1px solid var(--cor);border-radius:14px;padding:15px 16px;margin-bottom:10px;'>" +
          "<div style='font-size:11px;font-weight:800;letter-spacing:.18em;color:var(--corc);text-transform:uppercase;'>" + esc(w.resumo || "") + "</div>" +
          "<div style='font-size:22px;font-weight:900;text-transform:uppercase;margin:2px 0 2px;'>" + esc(w.nome) + "</div>" +
          (w.aq ? bloco("AQUECIMENTO", "<div style='font-size:13.5px;color:#d6d2df;white-space:pre-wrap;line-height:1.6;margin-top:3px;'>" + esc(w.aq) + "</div>") : "") +
          bloco("WOD", "<div style='margin-top:3px;'>" + movsH + "</div>") +
          (w.obs ? bloco("ESCALAS / OBS", "<div style='font-size:12.5px;color:#a9a4b5;white-space:pre-wrap;line-height:1.6;margin-top:3px;'>" + esc(w.obs) + "</div>") : "") +
          "<div class='wodres' data-wid='" + w.id + "' style='font-size:12px;color:#4ade80;margin-top:8px;'></div>" +
          "<button class='btnx' data-wodstart='" + w.id + "' style='display:block;width:100%;text-align:center;margin-top:12px;'>Começar circuito</button></div>";
      }).join("") + "<div style='font-size:11.5px;color:#6e6a78;margin:2px 0 10px;'>Ou monte o seu na mão aqui embaixo:</div>" : "") +
      "<div id='wodTipos' style='display:flex;gap:6px;margin-bottom:10px;'></div>" +
      "<div id='wodCfg' style='display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;'></div>" +
      "<div id='wodTela' style='text-align:center;padding:18px 10px;border-radius:14px;background:var(--bg4);border:1px solid rgba(255,255,255,.06);'>" +
      "<div id='wodFase' style='font-size:12px;font-weight:800;letter-spacing:.18em;color:#a9a4b5;text-transform:uppercase;'>Pronto?</div>" +
      "<div id='wodTempo' style='font-size:52px;font-weight:900;font-variant-numeric:tabular-nums;line-height:1.1;margin:4px 0;'>0:00</div>" +
      "<div id='wodInfo' style='font-size:12.5px;color:#a9a4b5;'></div></div>" +
      "<div style='display:flex;gap:8px;margin-top:10px;'>" +
      "<button class='btnx' id='wodGo' style='flex:2;'>Iniciar</button>" +
      "<button class='btnx' id='wodVolta' style='flex:1;display:none;background:var(--bg4);border:1px solid var(--cor);box-shadow:none;'>+1 volta</button>" +
      "<button class='btnx' id='wodTermina' style='flex:1;display:none;background:var(--bg4);border:1px solid #4ade80;color:#4ade80;box-shadow:none;'>Terminei!</button>" +
      "<button class='btnx' id='wodZera' style='flex:1;background:var(--bg4);border:1px solid rgba(255,255,255,.06);color:#a9a4b5;box-shadow:none;'>Zerar</button></div>" +
      "<div id='wodFimBox' style='display:none;margin-top:10px;'></div></div>" : "") +
      // corrida e bike: folhas prescritas + cronômetro próprio com pace (min/km), GPS e tiros
      (ve("cardio") ? "<div class='cardx' id='cardCardio'><h2>Corrida e bike</h2>" +
      (cardiosApp.length ? cardiosApp.map(function (c) {
        var rotMod = { corrida: "CORRIDA", caminhada: "CAMINHADA", bike: "BIKE" }[c.mod] || "CARDIO";
        var alvo = c.tipo === "intervalado"
          ? (c.reps || 8) + "× " + (c.tiro || 60) + "s forte / " + (c.desc || 90) + "s leve"
          : [(+c.dist ? String(c.dist).replace(".", ",") + " km" : ""), (+c.tempo ? c.tempo + " min" : ""), (c.pace ? "pace " + c.pace : "")].filter(Boolean).join(" · ") || "livre";
        return "<div style='background:linear-gradient(165deg,var(--bg5),var(--bg4));border:1px solid var(--cor);border-radius:14px;padding:15px 16px;margin-bottom:10px;'>" +
          "<div style='font-size:11px;font-weight:800;letter-spacing:.18em;color:var(--corc);text-transform:uppercase;'>" + rotMod + " · " + esc(alvo) + "</div>" +
          "<div style='font-size:20px;font-weight:900;text-transform:uppercase;margin:2px 0;'>" + esc(c.nome) + "</div>" +
          (c.obs ? "<div style='font-size:12.5px;color:#a9a4b5;margin-top:4px;'>" + esc(c.obs) + "</div>" : "") +
          "<button class='btnx' data-cbstart='" + c.id + "' style='display:block;width:100%;text-align:center;margin-top:10px;'>Começar</button></div>";
      }).join("") + "<div style='font-size:11.5px;color:#6e6a78;margin:2px 0 10px;'>Ou treine livre aqui embaixo:</div>" : "") +
      "<div id='crTipos' style='display:flex;gap:6px;margin-bottom:10px;'></div>" +
      // trajeto estilo app de corrida: o caminho do GPS vai sendo desenhado aqui
      "<div style='position:relative;margin-bottom:10px;'>" +
      "<canvas id='crMapa' width='640' height='300' style='width:100%;height:150px;display:block;border-radius:14px;background:var(--bg4);border:1px solid rgba(255,255,255,.06);'></canvas>" +
      "<div id='crContagem' style='display:none;position:absolute;inset:0;border-radius:14px;background:rgba(0,0,0,.72);z-index:2;align-items:center;justify-content:center;font-size:84px;font-weight:900;color:var(--corc);'>3</div></div>" +
      "<div id='crCfgBox' style='display:none;background:var(--bg5);border:1px solid rgba(255,255,255,.06);border-radius:14px;padding:12px;margin-bottom:10px;'></div>" +
      "<div id='crMetaBox' style='display:none;background:var(--bg5);border:1px solid rgba(255,255,255,.06);border-radius:14px;padding:12px;margin-bottom:10px;'></div>" +
      "<div id='crTela' style='text-align:center;padding:12px 10px;border-radius:14px;background:var(--bg4);border:1px solid rgba(255,255,255,.06);'>" +
      "<div id='crFase' style='font-size:11px;font-weight:800;letter-spacing:.16em;color:#a9a4b5;text-transform:uppercase;'>Pronto pra correr?</div>" +
      "<div id='crTempo' style='font-size:52px;font-weight:900;font-variant-numeric:tabular-nums;line-height:1.1;margin:2px 0;'>0:00</div>" +
      "<div style='display:flex;gap:8px;justify-content:center;margin-top:8px;'>" +
      "<div style='flex:1;background:var(--bg5);border-radius:16px;padding:8px 4px;'><div style='font-size:9.5px;font-weight:800;letter-spacing:.12em;color:#6e6a78;'>PACE</div><div id='crPace' style='font-size:19px;font-weight:900;color:var(--corc);'>--:--</div><div style='font-size:9px;color:#6e6a78;'>min/km</div></div>" +
      "<div style='flex:1;background:var(--bg5);border-radius:16px;padding:8px 4px;'><div style='font-size:9.5px;font-weight:800;letter-spacing:.12em;color:#6e6a78;'>DISTÂNCIA</div><div id='crDist' style='font-size:19px;font-weight:900;'>0,00</div><div style='font-size:9px;color:#6e6a78;'>km</div></div>" +
      "<div style='flex:1;background:var(--bg5);border-radius:16px;padding:8px 4px;'><div style='font-size:9.5px;font-weight:800;letter-spacing:.12em;color:#6e6a78;'>PACE MÉDIO</div><div id='crPaceMed' style='font-size:19px;font-weight:900;'>--:--</div><div style='font-size:9px;color:#6e6a78;'>min/km</div></div></div>" +
      "<div id='crInfo' style='font-size:12px;color:#a9a4b5;margin-top:8px;'></div></div>" +
      // botão redondo gigante estilo NRC, com engrenagem e GPS dos lados
      "<div style='display:flex;align-items:center;justify-content:center;gap:22px;margin-top:14px;'>" +
      "<button id='crCfgBtn' aria-label='Configurações da corrida' style='width:52px;height:52px;border-radius:50%;background:var(--bg4);border:1px solid rgba(255,255,255,.06);color:#a9a4b5;cursor:pointer;display:flex;align-items:center;justify-content:center;'>" + CRICO_CFG + "</button>" +
      "<button class='btnx' id='crGo' style='width:118px;height:118px;border-radius:50%;font-size:17px;padding:0;flex:none;'>Iniciar</button>" +
      "<button id='crGps' aria-label='GPS' style='width:52px;height:52px;border-radius:50%;background:var(--bg4);border:1px solid rgba(255,255,255,.06);color:#a9a4b5;cursor:pointer;font-size:11px;font-weight:800;font-family:inherit;line-height:1.2;'>Ligar<br>GPS</button></div>" +
      "<button id='crMetaBtn' style='display:block;margin:12px auto 0;background:var(--bg5);border:1px solid rgba(255,255,255,.06);border-radius:99px;padding:10px 22px;color:#d6d2df;font-family:inherit;font-size:13px;font-weight:800;cursor:pointer;'>Defina uma meta</button>" +
      "<div style='display:flex;gap:8px;margin-top:12px;'>" +
      "<button class='btnx' id='crFim' style='flex:1;display:none;background:var(--bg4);border:1px solid #4ade80;color:#4ade80;box-shadow:none;'>Terminei!</button>" +
      "<button class='btnx' id='crZera' style='flex:1;background:var(--bg4);border:1px solid rgba(255,255,255,.06);color:#a9a4b5;box-shadow:none;'>Zerar</button>" +
      "<input id='crKm' inputmode='decimal' placeholder='km na mão' style='flex:1;min-width:0;text-align:center;'></div>" +
      // arte da corrida pro aluno postar (aparece depois de finalizar): trajeto +
      // números + marca do studio — cada corrida compartilhada é propaganda
      "<button class='btnx' id='crShare' style='display:none;width:100%;margin-top:10px;'>Compartilhar essa corrida</button>" +
      "<div id='crHist' class='vz' style='font-size:12px;text-align:left;'></div>" +
      // modo tela cheia estilo NRC: painel de cor chapada com UMA métrica gigante (toque ou
      // deslize troca; bolinhas mostram a página), mapa como segunda página, pausa com o mapa
      // + grade de métricas, e cadeado que bloqueia a tela na corrida (segura 1s pra destravar)
      "<div id='crFull' style='display:none;position:fixed;inset:0;z-index:70;background:var(--bg0);'>" +
      "<canvas id='crMapaFull' width='480' height='900' style='position:absolute;inset:0;width:100%;height:100%;'></canvas>" +
      "<div id='crPainelF' style='position:absolute;inset:0;z-index:1;background:linear-gradient(165deg,var(--cor) 0%,var(--cor) 58%,var(--corc) 175%);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:130px 20px 240px;cursor:pointer;'>" +
      "<div id='crGigaV' style='font-size:96px;font-size:min(30vw,118px);font-weight:900;color:#fff;line-height:1;font-variant-numeric:tabular-nums;letter-spacing:-.02em;text-align:center;'>0,00</div>" +
      "<div id='crGigaL' style='font-size:13px;font-weight:800;letter-spacing:.2em;color:rgba(255,255,255,.85);margin-top:8px;'>QUILÔMETROS</div>" +
      "<div id='crDotsF' style='display:flex;gap:8px;margin-top:18px;'></div></div>" +
      "<div id='crTopoF' style='position:absolute;top:calc(10px + env(safe-area-inset-top,0px));left:12px;right:62px;z-index:2;border-radius:16px;padding:10px 12px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);'>" +
      "<div style='display:flex;text-align:center;'>" +
      "<div style='flex:1;'><b id='crTempoF' style='font-size:21px;font-weight:900;color:#fff;font-variant-numeric:tabular-nums;'>0:00</b><div style='font-size:9.5px;font-weight:800;letter-spacing:.14em;color:rgba(255,255,255,.75);'>TEMPO</div></div>" +
      "<div style='flex:1;'><b id='crPaceF' style='font-size:21px;font-weight:900;color:#fff;font-variant-numeric:tabular-nums;'>--:--</b><div style='font-size:9.5px;font-weight:800;letter-spacing:.14em;color:rgba(255,255,255,.75);'>RITMO</div></div>" +
      "<div style='flex:1;'><b id='crKcalF' style='font-size:21px;font-weight:900;color:#fff;font-variant-numeric:tabular-nums;'>0</b><div style='font-size:9.5px;font-weight:800;letter-spacing:.14em;color:rgba(255,255,255,.75);'>CALORIAS</div></div></div>" +
      "<div id='crFaseF' style='text-align:center;font-size:11px;font-weight:800;letter-spacing:.1em;color:rgba(255,255,255,.85);text-transform:uppercase;margin-top:4px;'>Pronto?</div>" +
      "<div id='crInfoF' style='text-align:center;font-size:11.5px;color:rgba(255,255,255,.8);'></div></div>" +
      "<div style='position:absolute;left:0;right:0;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:2;display:flex;flex-direction:column;align-items:center;gap:12px;padding:0 14px;'>" +
      "<div id='crPausaF' style='display:none;width:100%;max-width:440px;background:rgba(var(--bg0-rgb),.86);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border-radius:18px;padding:14px;'>" +
      "<div style='display:grid;grid-template-columns:1fr 1fr;gap:12px;text-align:center;'>" +
      "<div><b id='crPzKm' style='font-size:26px;font-weight:900;color:#fff;font-variant-numeric:tabular-nums;'>0,00</b><div style='font-size:9.5px;font-weight:800;letter-spacing:.14em;color:#a9a4b5;'>QUILÔMETROS</div></div>" +
      "<div><b id='crPzT' style='font-size:26px;font-weight:900;color:#fff;font-variant-numeric:tabular-nums;'>0:00</b><div style='font-size:9.5px;font-weight:800;letter-spacing:.14em;color:#a9a4b5;'>TEMPO</div></div>" +
      "<div><b id='crPzPc' style='font-size:26px;font-weight:900;color:#fff;font-variant-numeric:tabular-nums;'>--:--</b><div style='font-size:9.5px;font-weight:800;letter-spacing:.14em;color:#a9a4b5;'>PACE MÉDIO</div></div>" +
      "<div><b id='crPzKc' style='font-size:26px;font-weight:900;color:#fff;font-variant-numeric:tabular-nums;'>0</b><div style='font-size:9.5px;font-weight:800;letter-spacing:.14em;color:#a9a4b5;'>CALORIAS</div></div></div></div>" +
      "<div style='display:flex;align-items:center;gap:20px;'>" +
      "<button id='crCfgBtnF' aria-label='Configurações da corrida' style='width:54px;height:54px;border-radius:50%;background:rgba(var(--bg0-rgb),.55);border:1px solid rgba(255,255,255,.3);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;'>" + CRICO_CFG + "</button>" +
      "<button id='crLockBtnF' aria-label='Bloquear a tela' style='display:none;width:54px;height:54px;border-radius:50%;background:rgba(var(--bg0-rgb),.55);border:1px solid rgba(255,255,255,.3);color:#fff;cursor:pointer;align-items:center;justify-content:center;'>" + CRICO_LOCK + "</button>" +
      "<button id='crGoF' style='width:126px;height:126px;border-radius:50%;background:var(--bg0);border:none;color:#fff;font-family:inherit;font-size:19px;font-weight:900;cursor:pointer;box-shadow:0 12px 34px rgba(0,0,0,.4);flex:none;'>Iniciar</button>" +
      "<button id='crGpsF' aria-label='GPS' style='width:54px;height:54px;border-radius:50%;background:rgba(var(--bg0-rgb),.55);border:1px solid rgba(255,255,255,.3);color:#fff;cursor:pointer;font-size:10.5px;font-weight:800;font-family:inherit;line-height:1.2;'>GPS</button>" +
      "<button id='crMapBtnF' aria-label='Ver o mapa' style='display:none;width:54px;height:54px;border-radius:50%;background:rgba(var(--bg0-rgb),.55);border:1px solid rgba(255,255,255,.3);color:#fff;cursor:pointer;align-items:center;justify-content:center;'>" + CRICO_MAPA + "</button></div>" +
      "<button id='crMetaBtnF' style='background:rgba(var(--bg0-rgb),.82);border:1px solid rgba(255,255,255,.22);border-radius:99px;padding:11px 24px;color:#fff;font-family:inherit;font-size:13.5px;font-weight:800;cursor:pointer;'>Defina uma meta</button>" +
      "<button id='crFimF' style='display:none;background:rgba(var(--bg0-rgb),.82);border:1px solid #4ade80;border-radius:99px;padding:11px 24px;color:#4ade80;font-family:inherit;font-size:13.5px;font-weight:800;cursor:pointer;'>Terminei!</button>" +
      "</div>" +
      "<div id='crContagemF' style='display:none;position:absolute;inset:0;z-index:6;background:rgba(0,0,0,.62);align-items:center;justify-content:center;font-size:130px;font-weight:900;color:#fff;'>3</div>" +
      "<div id='crLockOverF' style='display:none;position:absolute;inset:0;z-index:5;background:rgba(var(--bg0-rgb),.55);flex-direction:column;align-items:center;justify-content:center;gap:10px;'>" +
      "<div style='color:#fff;line-height:0;'>" + crIco(CRICO_LOCK_P, 46) + "</div><div style='color:#fff;font-weight:800;font-size:14px;'>Tela bloqueada</div>" +
      "<button id='crUnlockF' style='background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.35);border-radius:99px;padding:12px 26px;color:#fff;font-family:inherit;font-size:13.5px;font-weight:800;cursor:pointer;'>Segure pra destravar</button></div>" +
      "<button id='crFullFecha' aria-label='Fechar tela cheia' style='position:absolute;top:calc(14px + env(safe-area-inset-top,0px));right:12px;z-index:4;width:42px;height:42px;border-radius:50%;background:rgba(var(--bg0-rgb),.74);border:1px solid rgba(255,255,255,.22);color:#fff;font-size:17px;cursor:pointer;'>✕</button>" +
      "</div></div>" : "") +
      "<div class='cardx'><h2>Diário de cargas</h2>" +
      "<div style='display:flex;gap:8px;margin-bottom:10px;'><input id='dcEx' list='dcExs' placeholder='Exercício' style='flex:2;min-width:0'>" +
      "<datalist id='dcExs'>" + (fichasApp ? fichasApp.map(function (f) { return f.itens.map(function (it) { return "<option>" + esc(it.nome) + "</option>"; }).join(""); }).join("") : "") + "</datalist>" +
      "<input id='dcKg' inputmode='decimal' placeholder='kg' style='width:74px'><input id='dcReps' inputmode='numeric' placeholder='reps' style='width:64px'><button class='btnx' id='dcAdd' aria-label='Adicionar'>+</button></div>" +
      "<div id='dcLista' class='vz'>Anote a carga de cada exercício — seus recordes ficam guardados aqui.</div>" +
      "<div id='dcGraf' style='display:none;margin-top:10px;'></div></div>" +
      "<div class='cardx'><h2>Minha evolução</h2><div id='evoBox'></div></div>" +
      "<div class='cardx'><h2>Meu peso</h2>" +
      "<div style='display:flex;gap:8px;margin-bottom:10px;'><input id='pzKg' inputmode='decimal' placeholder='Peso de hoje (kg)' style='flex:1;min-width:0'><button class='btnx' id='pzAdd'>Registrar</button></div>" +
      "<div id='pzGraf' class='vz'>Registre o peso de hoje — a curva aparece aqui.</div>" +
      "<div style='display:flex;gap:8px;margin-top:10px;'><input id='mpAlvo' inputmode='decimal' placeholder='Minha meta (kg)' style='flex:1;min-width:0'><button class='btnx' id='mpSalva' style='padding:11px 16px;'>Definir meta</button></div>" +
      "<div id='mpBarra' style='margin-top:8px;'></div></div>" +
      // ---- UTILIDADES (gaveta ☰): água, cronômetro, 1RM, anilhas, IMC ----
      "<div class='cardx' id='utilAgua'><h2>Água de hoje</h2>" +
      "<div id='agCopos' style='display:flex;flex-wrap:wrap;gap:9px;margin:4px 0 10px;'></div>" +
      "<div style='display:flex;gap:8px;align-items:center;'>" +
      "<button class='btnx' id='agMais' style='flex:1;'>Bebi um copo!</button>" +
      "<button class='btnx' id='agMenos' style='flex:none;background:var(--bg4);border:1px solid rgba(255,255,255,.06);color:#a9a4b5;box-shadow:none;padding:11px 16px;' title='tirar um copo'>−1</button></div>" +
      "<div id='agInfo' class='vz' style='font-size:12.5px;'></div>" +
      "<div style='display:flex;gap:8px;margin-top:6px;'>" +
      "<label style='flex:1;font-size:11px;color:#a9a4b5;'>Copos por dia<select id='agMetaSel' style='width:100%;margin-top:3px;'><option>6</option><option selected>8</option><option>10</option><option>12</option></select></label>" +
      "<label style='flex:1;font-size:11px;color:#a9a4b5;'>Tamanho do copo<select id='agMlSel' style='width:100%;margin-top:3px;'><option value='200'>200 ml</option><option value='250' selected>250 ml</option><option value='300'>300 ml</option><option value='500'>500 ml (garrafa)</option></select></label></div>" +
      "<label style='display:block;font-size:11px;color:#a9a4b5;margin-top:8px;'>Lembrete pra beber água (toca com o app aberto)" +
      "<select id='agLemSel' style='width:100%;margin-top:3px;'><option value='0'>Desligado</option><option value='60'>A cada 1 hora</option><option value='90'>A cada 1h30</option><option value='120'>A cada 2 horas</option></select></label></div>" +
      "<div class='cardx' id='utilCrono'><h2>Cronômetro e timers de treino</h2>" +
      "<div id='ucTipos' style='display:flex;gap:5px;margin-bottom:10px;flex-wrap:wrap;'></div>" +
      "<div id='ucCfg' style='display:none;gap:8px;margin-bottom:10px;'></div>" +
      "<div id='ucTela' style='text-align:center;padding:14px 10px;border-radius:14px;background:var(--bg4);border:1px solid rgba(255,255,255,.06);'>" +
      "<div id='ucFase' style='font-size:11px;font-weight:800;letter-spacing:.16em;color:#a9a4b5;text-transform:uppercase;'>Pronto?</div>" +
      "<div id='ucTempo' style='font-size:46px;font-weight:900;font-variant-numeric:tabular-nums;line-height:1.1;'>0:00.0</div>" +
      "<div id='ucInfo' style='font-size:12px;color:#a9a4b5;'></div></div>" +
      "<div style='display:flex;gap:8px;margin-top:10px;'>" +
      "<button class='btnx' id='ucGo' style='flex:2;'>Iniciar</button>" +
      "<button class='btnx' id='ucVolta' style='flex:1;background:var(--bg4);border:1px solid var(--cor);box-shadow:none;'>Volta</button>" +
      "<button class='btnx' id='ucZera' style='flex:1;background:var(--bg4);border:1px solid rgba(255,255,255,.06);color:#a9a4b5;box-shadow:none;'>Zerar</button></div>" +
      "<div id='ucVoltas' class='vz' style='font-size:12px;'></div>" +
      "<div id='ucHist' class='vz' style='font-size:12px;text-align:left;'></div></div>" +
      "<div class='cardx' id='utilRm'><h2>Calculadora de 1RM</h2>" +
      "<div class='vz' style='text-align:left;padding:0 0 8px;'>Quanto você levanta em 1 repetição? Preenche a carga e as reps que fez.</div>" +
      "<div style='display:flex;gap:8px;'>" +
      "<input id='rmKg' inputmode='decimal' placeholder='Carga (kg)' style='flex:1;min-width:0'>" +
      "<input id='rmReps' inputmode='numeric' placeholder='Reps' style='width:80px'></div>" +
      "<div id='rmOut' style='margin-top:10px;'></div></div>" +
      "<div class='cardx' id='utilAnilha'><h2>Calculadora de anilhas</h2>" +
      "<div class='vz' style='text-align:left;padding:0 0 8px;'>Quer levantar X kg? Ele fala quais anilhas colocar em cada lado da barra.</div>" +
      "<div style='display:flex;gap:8px;'>" +
      "<input id='anKg' inputmode='decimal' placeholder='Peso total (kg)' style='flex:1;min-width:0'>" +
      "<select id='anBarra' style='width:120px;'><option value='20'>Barra 20 kg</option><option value='15'>Barra 15 kg</option><option value='10'>Barra 10 kg</option></select></div>" +
      "<div id='anOut' style='margin-top:10px;'></div></div>" +
      "<div class='cardx' id='utilImc'><h2>IMC rápido</h2>" +
      "<div style='display:flex;gap:8px;'>" +
      "<input id='imcKg' inputmode='decimal' placeholder='Peso (kg)' style='flex:1;min-width:0'>" +
      "<input id='imcCm' inputmode='numeric' placeholder='Altura (cm)' style='width:110px'></div>" +
      "<div id='imcOut' style='margin-top:10px;'></div>" +
      "<div class='vz' style='font-size:11px;'>O IMC é só uma referência — quem manda na avaliação é " + esc(studio.split(" ")[0]) + ".</div></div>" +
      "<div class='cardx'><h2>Hábitos de hoje</h2>" +
      "<div id='habBox' style='display:flex;flex-direction:column;gap:8px;'></div>" +
      "<div id='habStreak' class='vz' style='margin-top:8px;'></div></div>" +
      "<div class='cardx'><h2>Fotos de progresso</h2>" +
      "<div id='fotosBox' class='vz'>Tire a primeira foto — daqui a uns meses você vai agradecer.</div>" +
      "<label class='btnx' id='fotoBtn' style='display:block;text-align:center;margin-top:10px;'>Adicionar foto de hoje" +
      "<input id='fotoInput' type='file' accept='image/*' capture='user' style='display:none;'></label>" +
      "<div class='vz' style='font-size:11px;'>Suas fotos ficam com você e com o seu personal — mais ninguém vê.</div></div>" +
      (vidsApp.length ? "<div class='cardx'><h2>Conteúdos de " + esc(studio.split(" ")[0]) + "</h2>" +
        (function () {
          var porCat = {};
          vidsApp.forEach(function (v) { (porCat[v.c] = porCat[v.c] || []).push(v); });
          return Object.keys(porCat).sort().map(function (c) {
            return "<div style='font-weight:800;font-size:11.5px;letter-spacing:.1em;color:#a9a4b5;margin:8px 0 4px;text-transform:uppercase;'>" + esc(c) + "</div>" +
              porCat[c].map(function (v) {
                return "<button class='vidbtn' data-v='" + esc(v.u) + "' style='display:block;width:100%;text-align:left;padding:9px 0;border:none;border-bottom:1px solid var(--bg11);background:none;color:#fff;font-weight:700;font-size:14px;font-family:inherit;cursor:pointer;'>" + esc(v.t) + "</button>" +
                  "<div class='vidbox' style='display:none;'></div>";
              }).join("");
          }).join("");
        })() + "</div>" : "") +
      "<div class='cardx'><h2>Check-in da semana</h2>" +
      "<div id='ckOk' class='vz' style='display:none;'>Check-in enviado — seu personal já viu. Até semana que vem!</div>" +
      "<div id='ckForm'><div class='vz' style='text-align:left;padding:0 0 8px;'>Como foi a semana de treino?</div>" +
      "<div id='ckNotas' style='display:flex;gap:8px;justify-content:space-between;margin-bottom:10px;'></div>" +
      "<div style='display:flex;gap:8px;margin-bottom:10px;'><input id='ckPeso' inputmode='decimal' placeholder='Peso hoje (opcional)' style='flex:1;min-width:0'></div>" +
      "<input id='ckTexto' placeholder='Algum recado pro seu personal?' style='width:100%;margin-bottom:10px;'>" +
      "<button class='btnx' id='ckEnvia' style='width:100%;'>Enviar check-in</button></div></div>" +
      (qa ? "<div class='cardx' id='qaCard'><h2>" + appIco(APPIC.prancheta, 14) + esc(qa.nome || "Questionário") + "</h2><div id='qaBox' class='vz'>Carregando…</div></div>" : "") +
      (plApp && ve("pag") ? "<div class='cardx'><h2>Meu plano</h2>" +
        "<div class='kv'><span>" + esc(plApp.nome) + "</span><b>R$ " + (+plApp.valor).toLocaleString("pt-BR") + "/mês</b></div>" +
        "<div class='kv'><span>Vencimento</span><span>todo dia " + ctApp.diaVenc + "</span></div>" +
        (pixApp ? "<div style='text-align:center;margin-top:10px;'>" +
          (pixApp.qr ? "<img src='" + pixApp.qr + "' style='width:170px;height:170px;image-rendering:pixelated;background:#fff;padding:7px;border-radius:12px;'>" : "") +
          "<textarea id='pixAluno' rows='3' readonly style='width:100%;margin-top:8px;background:var(--bg4);border:1px solid rgba(255,255,255,.06);border-radius:9px;color:#a9a4b5;font-family:monospace;font-size:10px;padding:8px;'>" + pixApp.code + "</textarea>" +
          "<button class='btnx' id='pixCopiaAluno' style='width:100%;margin-top:8px;'>Copiar Pix copia e cola</button></div>" : "") +
        (plApp.linkRec ? "<a href='" + esc(plApp.linkRec) + "' target='_blank' rel='noopener' class='btnx' style='display:block;text-align:center;margin-top:8px;background:var(--bg4);border:1px solid var(--cor);box-shadow:none;'>Assinar no cartão (débito automático)</a>" : "") +
        "<button class='btnx' id='btnJaPaguei' style='display:block;width:100%;text-align:center;margin-top:8px;background:var(--bg4);border:1px solid #4ade80;color:#4ade80;box-shadow:none;'>Já paguei — avisar " + esc(studio.split(" ")[0]) + "</button>" +
        "<div id='jaPagueiOk' class='vz' style='display:none;font-size:11.5px;'>Aviso enviado! " + esc(studio.split(" ")[0]) + " confirma e o pagamento entra no histórico.</div></div>" : "") +
      // pacotes de serviços comprados (massagem etc.): saldo da última publicação do app
      (svApp.length && ve("pag") ? "<div class='cardx'><h2>Meus pacotes</h2>" +
        svApp.map(function (p) {
          return "<div class='kv'><span>" + esc(p.n) + "</span><b>" + (p.t - p.u === 1 ? "resta 1" : "restam " + (p.t - p.u)) + " de " + p.t + "</b></div>";
        }).join("") +
        "<div class='vz' style='font-size:12px;'>Esse saldo é de quando o seu app foi atualizado pela última vez — pode estar um pouco atrasado. O número certinho tá com " + esc(studio.split(" ")[0]) + ".</div></div>" : "") +
      /* O card só existe pra quem AINDA não tem login: quem recebeu o acesso do
       * professor já entra com e-mail e senha, e pedir pra "criar um login"
       * ali só confunde (dava pra cadastrar um login diferente do que chegou). */
      (self.MT_CLOUD && self.MT_CLOUD.url && a.appTokenP && !a.acessoEm ? "<div class='cardx'><h2>Meu login</h2>" +
        "<div class='vz' style='text-align:left;padding:0 0 8px;'>Crie um login e senha para abrir seu app de QUALQUER aparelho (página Entrar do aluno).</div>" +
        "<input id='lgLogin' placeholder='Seu e-mail ou celular com DDD' style='width:100%;margin-bottom:8px;'>" +
        "<input id='lgSenha' type='password' placeholder='Senha (mínimo 6 caracteres)' style='width:100%;margin-bottom:8px;'>" +
        "<button class='btnx' id='lgSalva' style='width:100%;'>Salvar meu login</button>" +
        "<div id='lgOk' class='vz' style='display:none;'></div></div>" : "") +
      /* Quem já entra com login precisa poder trocar a senha e sair do app —
       * principalmente em celular emprestado ou compartilhado. */
      (self.MT_CLOUD && self.MT_CLOUD.url && a.appTokenP && a.acessoEm ? "<div class='cardx'><h2>Minha conta</h2>" +
        "<div class='kv'><span>Login</span><b>" + esc(String(a.email || "").trim().toLowerCase()) + "</b></div>" +
        "<div class='vz' style='text-align:left;padding:8px 0;'>Trocar a senha (mínimo 6 caracteres):</div>" +
        "<input id='cnSenha' type='password' placeholder='Senha nova' style='width:100%;margin-bottom:8px;'>" +
        "<input id='cnSenha2' type='password' placeholder='Repita a senha nova' style='width:100%;margin-bottom:8px;'>" +
        "<button class='btnx' id='cnSalva' style='width:100%;'>Salvar senha nova</button>" +
        "<div id='cnOk' class='vz' style='display:none;'></div>" +
        "<button class='btnx' id='cnSair' style='width:100%;margin-top:10px;background:none;border:1px solid #f87171;color:#f87171;'>Sair do app neste aparelho</button>" +
        "<div class='vz' style='font-size:11.5px;padding-top:6px;'>Saindo, este aparelho esquece o seu app. Pra voltar, entre com o seu login e senha.</div></div>" : "") +
      (ve("indica") ? "<div class='cardx'><h2>" + appIco(APPIC.presente, 14) + "Indique um amigo</h2>" +
      "<div class='vz' style='text-align:left;padding:0 0 10px;'>Treinar em dupla rende muito mais. Chama um amigo pro " + esc(studio.split(" ")[0]) + " — é só encaminhar o convite.</div>" +
      "<a class='btnx' style='display:block;text-align:center;text-decoration:none;' target='_blank' rel='noopener' href='https://wa.me/?text=" +
      encodeURIComponent("Treino com " + studio + " e tô curtindo demais! Chama no WhatsApp pra fechar um horário: https://wa.me/" + (zapPersonal ? "55" + zapPersonal : "") + " — fala que quem indicou foi " + a.nome.split(" ")[0]) +
      "'>Convidar no WhatsApp</a></div>" : "") +
      "<div class='cardx'><h2>Fale com " + esc(studio.split(" ")[0]) + "</h2>" +
      "<div id='chMsgs' style='max-height:300px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;margin-bottom:10px;'><div class='vz'>Carregando…</div></div>" +
      "<div id='botChips' style='display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;'></div>" +
      "<div style='display:flex;gap:8px;'><input id='chTexto' placeholder='Escreva aqui…' style='flex:1;min-width:0'>" +
      "<button class='btnx' id='chEnvia' aria-label='Enviar'><svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M4 12h14M12 6l6 6-6 6'/></svg></button></div></div>" +
      "<div id='tmrBar' style='display:none;position:fixed;bottom:calc(62px + env(safe-area-inset-bottom,0px));left:0;right:0;max-width:480px;margin:0 auto;background:linear-gradient(90deg,var(--cor),var(--corc));color:#fff;font-weight:800;text-align:center;padding:13px;font-size:15px;z-index:8;'></div>" +
      /* Treino guiado: uma tela por exercício, estilo story. O aluno olha de
       * longe (barra, número, cronômetro), toca em coisa grande, e no fim de
       * cada exercício anota a carga sem teclado. */
      "<div id='guiaBox' class='gwrap'>" +
      "<div class='gtopo'>" +
      "<span class='gmarca'>" + esc(studio) + "</span>" +
      "<button id='gVoltaEx' class='gvolta' aria-label='Exercício anterior'>‹</button>" +
      "<button id='gPularEx'>Pular exercício</button>" +
      "<button id='gFechar' class='gx' aria-label='Fechar o treino guiado'>✕</button></div>" +
      "<div class='gbarra' id='gBarra' aria-hidden='true'></div>" +
      "<div class='gcont'><div id='gProg'></div><span id='gReloTot'></span></div>" +
      "<div class='gcard' id='gCard'>" +
      "<span class='gchip' id='gEstado'></span>" +
      "<div class='ggif' id='gGif' style='display:none;'></div>" +
      "<div id='gMiolo'></div>" +
      // o número do descanso mora AQUI, fixo: se ele fosse redesenhado junto com
      // o miolo, o próximo pintaGuia o apagava e o player travava no meio
      "<div class='gbig' id='gDesc' style='display:none;'></div>" +
      "<div class='gbiglab' id='gDescLab' style='display:none;'>segundos</div>" +
      "<div class='gtrilho' id='gTrilhoCx' style='display:none;'><b id='gTrilho'></b></div>" +
      "<div id='gMiolo2'></div>" +
      "<button id='gVideo' class='vidbtn' style='display:none;'>Como fazer</button>" +
      "<div class='vidbox' style='display:none;'></div>" +
      "<div class='ghist' id='gHist'></div></div>" +
      "<div class='ggrupo' id='gGrupo'></div>" +
      "<div class='gtit' id='gEx'></div>" +
      "<div class='gbase'><div class='gmeta' id='gMeta'></div>" +
      "<div class='grelo'><b id='gRelo'>0:00</b><em id='gReloLab'>neste exercício</em></div></div>" +
      "<div class='gpe' id='gPe'>" +
      "<button class='prin' id='gSerie'>Série feita ✓</button>" +
      "<button class='sec' id='gPular' style='display:none;'>Pular descanso</button>" +
      "<button class='sec mais' id='gMais15' style='display:none;'>+15 s</button></div>" +
      "</div>" +
      "<div class='cardx' id='cardNotif' style='display:none;'><h2>" + appIco(APPIC.sino, 14) + "Lembretes</h2>" +
      "<div class='vz' style='text-align:left;padding:0 0 8px;'>Ative as notificações pra receber lembrete das sessões e recados por aqui.</div>" +
      "<button class='btnx' id='btnNotif' style='width:100%;'>Ativar notificações</button></div>" +
      "<div class='vz'>Gerado em " + esc(S.fmtData((stamp || "").slice(0, 10))) + " · " + esc(studio) + "</div>" +
      "<script>var AVS=" + jsonApp(avs) + ",META=" + metaSemana +
      ",NUVEM=" + jsonApp((self.MT_CLOUD && self.MT_CLOUD.url && a.appTokenP) ? { u: self.MT_CLOUD.url, k: self.MT_CLOUD.anonKey } : null) +
      ",TOKEN=" + jsonApp(a.appTokenP || "") + ",ZAPP=" + jsonApp(zapPersonal) + ",PRIMEIRO=" + jsonApp(a.nome.split(" ")[0]) + ",ALTURA=" + (+a.altura || 0) +
      ",MEULOGIN=" + jsonApp(a.acessoEm ? String(a.email || "").trim().toLowerCase() : "") + ";" +
      // canvas (Stories, mapa do cardio) não entende var(--x) — CV() lê o valor real
      "function CV(n){try{return getComputedStyle(document.documentElement).getPropertyValue('--'+n).trim()||'#fff';}catch(e){return '#fff';}}" +
      // barra do navegador na cor do studio — nasce da paleta, não do HTML
      "(function(){var tc=document.createElement('meta');tc.setAttribute('name','theme-color');tc.setAttribute('content',CV('cor'));document.head.appendChild(tc);})();" +
      "function L(k,f){try{return JSON.parse(localStorage.getItem(k))||f;}catch(e){return f;}}" +
      "function Sv(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}" +
      "if(k==='ptpeso'||k==='ptdc'||k==='ptfeitos'||k==='ptfotos'||k==='pthab'||k==='ptrpe'||k==='ptonb'||k==='ptwodres'||k==='ptcardio')devolveApp();" +
      "if(k==='ptfeitos'||k==='pthab'||k==='ptpeso'||k==='ptqa'){try{pintaHero();pintaProgresso();pintaXP();}catch(e){}}}" +
      // devolve pro personal o que o aluno registra (peso, cargas, treinos, fotos antes/depois)
      "var devT=null;function devolveApp(){if(!NUVEM||!TOKEN)return;clearTimeout(devT);devT=setTimeout(function(){" +
      "var fs=L('ptfotos',[]);var pri=fs[0]||null;var ult=fs.length>1?fs[fs.length-1]:null;" +
      // celular novo/limpo: sem nenhum registro local não devolve nada (senão apagaria o histórico que já está na nuvem)
      "if(!Object.keys(L('ptpeso',{})).length&&!Object.keys(L('ptdc',{})).length&&!Object.keys(L('ptfeitos',{})).length&&!Object.keys(L('pthab',{})).length&&!fs.length&&!L('ptonb',null)&&!Object.keys(L('ptrpe',{})).length)return;" +
      "rpcApp('app_aluno_devolve',{t:TOKEN,p_dados:{nome:PRIMEIRO,nivel:nivelDe(xpDados()),peso:L('ptpeso',{}),cargas:L('ptdc',{}),feitos:L('ptfeitos',{}),habitos:L('pthab',{}),rpe:L('ptrpe',{}),onb:L('ptonb',null),wodres:L('ptwodres',{}),cardio:L('ptcardio',[])," +
      "fotoAntes:pri?pri.img:null,fotoAntesD:pri?pri.d:null,fotoDepois:ult?ult.img:null,fotoDepoisD:ult?ult.d:null," +
      "atualizado:new Date().toISOString()}});},1800);}" +
      "setTimeout(devolveApp,2500);" +
      "function isoLoc(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}" +
      "function isoHj(){return isoLoc(new Date());}" +
      "function semDe(x){var d=typeof x==='string'?new Date(x+'T12:00:00'):new Date(x.getTime());d.setDate(d.getDate()-((d.getDay()+6)%7));return isoLoc(d);}" +
      // vídeo do exercício SEMPRE dentro do app — nunca abre o YouTube por fora.
      // Reconhece: vídeo do YouTube (watch/shorts/youtu.be), playlist, Vimeo e
      // arquivo de vídeo direto (mp4/webm...). Link estranho ganha aviso honesto.
      "function ytId(u){var m=String(u||'').match(/(?:youtube\\.com\\/(?:watch\\?(?:.*&)?v=|shorts\\/|embed\\/)|youtu\\.be\\/)([\\w-]{6,20})/);return m?m[1]:'';}" +
      "function vidMolde(src){return \"<iframe src='\"+src+\"' title='Vídeo do exercício' allow='accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture' allowfullscreen style='width:100%;aspect-ratio:16/9;border:0;border-radius:10px;margin-top:8px;display:block;background:#000;'></iframe>\";}" +
      // Banco de GIFs do dono: em vez de guardar 1619 links, o app monta o
      // endereço na hora a partir do nome do exercício. Se o arquivo não
      // existir, o <img> falha e a demonstração some sem barulho nenhum.
      "var GIF=" + jsonApp(GIF) + ";" +
      "function gifUrl(nome){if(!GIF||!GIF.b||!nome)return '';" +
      "var t=String(nome).trim().toLowerCase();" +
      "if(!GIF.a)t=t.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'');" +
      "t=t.replace(/[^a-z0-9\\u00c0-\\u024f ]+/g,' ').replace(/\\s+/g,' ').trim();" +
      "if(GIF.p==='sublinha')t=t.replace(/ /g,'_');" +
      "else if(GIF.p==='junto')t=t.replace(/ /g,'');" +
      "else if(GIF.p!=='espaco')t=t.replace(/ /g,'-');" +
      "return GIF.b+encodeURIComponent(t)+'.'+(GIF.e||'gif');}" +
      "function vidHtml(u){u=String(u||'');var id=ytId(u);" +
      // GIF/imagem animada não é <video>: é <img>, sem controles e em loop
      "if(/\\.(gif|webp|png|jpe?g)([?#][^'\"<>]*)?$/i.test(u))" +
      "return \"<img src='\"+u+\"' alt='' loading='lazy' style='width:100%;border-radius:10px;margin-top:8px;display:block;background:#fff;'>\";" +
      "if(id)return vidMolde('https://www.youtube-nocookie.com/embed/'+id+'?rel=0&playsinline=1');" +
      "var pl=u.match(/[?&]list=([\\w-]{10,60})/);" +
      "if(pl)return vidMolde('https://www.youtube-nocookie.com/embed/videoseries?list='+pl[1]);" +
      "var vm=u.match(/vimeo\\.com\\/(\\d{6,12})/);" +
      "if(vm)return vidMolde('https://player.vimeo.com/video/'+vm[1]+'?playsinline=1');" +
      "if(/^https?:\\/\\/[^'\\\"<>]+\\.(mp4|webm|ogg|m4v|mov)([?#][^'\\\"<>]*)?$/i.test(u))" +
      "return \"<video src='\"+u+\"' controls playsinline style='width:100%;aspect-ratio:16/9;border-radius:10px;margin-top:8px;display:block;background:#000;'></video>\";" +
      "return '';}" +
      "document.addEventListener('click',function(e){var vb=e.target.closest('.vidbtn');if(!vb)return;" +
      "var bx=vb.nextElementSibling;while(bx&&!bx.classList.contains('vidbox'))bx=bx.nextElementSibling;if(!bx)return;" +
      "if(bx.firstChild){bx.innerHTML='';bx.style.display='none';vb.textContent=vb.dataset.rot||'Ver vídeo';return;}" +
      "bx.style.display='block';" +
      "bx.innerHTML=vidHtml(vb.dataset.v)||\"<div style='background:var(--bg7);border-radius:10px;padding:10px 12px;margin-top:8px;font-size:12.5px;color:#a9a4b5;line-height:1.5;'>Esse link não toca aqui dentro. Pede pro seu professor colar o link do vídeo mesmo (no YouTube: Compartilhar → Copiar link).</div>\";" +
      "vb.dataset.rot=vb.textContent;vb.textContent='Fechar vídeo';});" +
      // tela sempre acesa durante o treino (wake lock — solta quando fecha o guiado)
      "var wlTela=null;" +
      "function ligaTela(){try{if(navigator.wakeLock&&!wlTela){navigator.wakeLock.request('screen').then(function(l){wlTela=l;l.addEventListener('release',function(){wlTela=null;});}).catch(function(){});}}catch(e){}}" +
      "function soltaTela(){try{if(wlTela){wlTela.release();wlTela=null;}}catch(e){}}" +
      "document.addEventListener('visibilitychange',function(){var gx=document.getElementById('guiaBox');if(!document.hidden&&gx&&gx.style.display==='flex')ligaTela();});" +
      // ícones de traço desenhados (sem emoji) usados nos cards dinâmicos
      "function icx(p,s){return \"<svg width='\"+(s||16)+\"' height='\"+(s||16)+\"' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true' style='vertical-align:-3px'>\"+p+'</svg>';}" +
      "var ICO={trofeu:\"<path d='M8 21h8M12 17v4M6 3h12v5a6 6 0 0 1-12 0z'/><path d='M6 5H3c0 3 1.5 4.5 3 4.5M18 5h3c0 3-1.5 4.5-3 4.5'/>\"," +
      "raio:\"<path d='M13 2 3 14h9l-1 8 10-12h-9z'/>\"," +
      "estrela:\"<path d='m12 3 2.7 5.7 6.3.8-4.6 4.3 1.2 6.2-5.6-3-5.6 3 1.2-6.2L3 9.5l6.3-.8z'/>\"," +
      "alta:\"<path d='m3 17 6-6 4 4 8-8M15 7h6v6'/>\"," +
      "chama:\"<path d='M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z'/>\"," +
      "peso:\"<circle cx='12' cy='5' r='3'/><path d='M6.5 8h11l2.4 10.6A2 2 0 0 1 18 21H6a2 2 0 0 1-1.9-2.4z'/>\"," +
      "cal:\"<rect x='3' y='5' width='18' height='16' rx='2'/><path d='M16 3v4M8 3v4M3 11h18'/>\"," +
      "pct:\"<path d='M19 5 5 19'/><circle cx='6.5' cy='6.5' r='2.5'/><circle cx='17.5' cy='17.5' r='2.5'/>\"," +
      "regua:\"<path d='M21.3 8.7 15.3 2.7a1 1 0 0 0-1.4 0L2.7 13.9a1 1 0 0 0 0 1.4l6 6a1 1 0 0 0 1.4 0L21.3 10.1a1 1 0 0 0 0-1.4z'/><path d='m7.5 10.5 2 2M10.5 7.5l2 2M13.5 4.5l2 2'/>\"," +
      "halter:\"<path d='M7 7v10M4 9v6M17 7v10M20 9v6M7 12h10'/>\"," +
      "gota:\"<path d='M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5-2 1.6-3 3.5-3 5.5a7 7 0 0 0 7 7z'/>\"," +
      "maca:\"<path d='M12 20.9c1.5 0 2.75 1.1 4 1.1 3 0 6-8 6-12.2A4.9 4.9 0 0 0 17 4.5c-1.8 0-3 .5-5 .5s-3.2-.5-5-.5A4.9 4.9 0 0 0 2 9.8C2 14 5 22 8 22c1.25 0 2.5-1.1 4-1.1z'/><path d='M10 2c1 .5 2 2 2 5'/>\"," +
      "lua:\"<path d='M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z'/>\"," +
      "ativ:\"<path d='M22 12h-4l-3 9L9 3l-3 9H2'/>\"};" +
      "function rpcApp(fn,corpo){if(!NUVEM)return Promise.resolve(null);" +
      "return fetch(NUVEM.u+'/rest/v1/rpc/'+fn,{method:'POST',headers:{apikey:NUVEM.k,Authorization:'Bearer '+NUVEM.k,'Content-Type':'application/json'},body:JSON.stringify(corpo)}).then(function(r){return r.json();}).catch(function(){return null;});}" +
      // notificações push (quando o app abre pelo link hospedado)
      "(function(){if(!NUVEM||!('Notification'in window))return;" +
      "var VP='BLesSk80OGEOnbJj9iqH2_KHPIhdN0GsGhVpuVWx4O7YqvtV_P961-hqBtqOHw3SWp3GnwDbpauRyEcRVFmdb-I';" +
      "function va(s){var pad=new Array((4-s.length%4)%4+1).join('=');var b=(s+pad).replace(/-/g,'+').replace(/_/g,'/');" +
      "var raw=atob(b);var arr=new Uint8Array(raw.length);for(var i=0;i<raw.length;i++)arr[i]=raw.charCodeAt(i);return arr;}" +
      "function tentaPushP(){if(!('serviceWorker'in navigator)||!('PushManager'in window)||location.protocol!=='https:')return;" +
      "navigator.serviceWorker.register('app-sw.js').then(function(reg){" +
      "return reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:va(VP)});" +
      "}).then(function(sub){rpcApp('app_aluno_push',{t:TOKEN,p_sub:sub.toJSON()});}).catch(function(e){});}" +
      "if(Notification.permission==='granted'){tentaPushP();return;}" +
      "if(Notification.permission!=='default')return;" +
      "var card=document.getElementById('cardNotif'),btn=document.getElementById('btnNotif');" +
      "if(card&&btn){card.style.display='block';btn.addEventListener('click',function(){" +
      "Notification.requestPermission().then(function(p2){card.style.display='none';if(p2==='granted')tentaPushP();});});}})();" +
      // sequência de semanas consecutivas batendo a meta (a atual conta se já bateu, sem quebrar enquanto corre)
      "function streakSem(f){var porSem={};Object.keys(f).forEach(function(k){var w=semDe(k);porSem[w]=(porSem[w]||0)+1;});" +
      "var n=0;var d2=new Date();" +
      "if((porSem[semDe(d2)]||0)>=META)n++;" +
      "for(;;){d2.setDate(d2.getDate()-7);if((porSem[semDe(d2)]||0)>=META)n++;else break;}return n;}" +
      // chuva de confete pras conquistas (meta batida, recorde)
      "function confete(){var box=document.createElement('div');box.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:99;overflow:hidden;';" +
      "var cores=['var(--cor)','var(--corc)','#fb923c','#4ade80','#fbbf24','#fff'];" +
      "for(var ci=0;ci<26;ci++){var p2=document.createElement('div');var tam=6+Math.random()*7;" +
      "p2.style.cssText='position:absolute;top:-20px;left:'+Math.random()*100+'%;width:'+tam+'px;height:'+(tam*0.6)+'px;background:'+cores[ci%cores.length]+';border-radius:2px;animation:cfQueda '+(1.6+Math.random()*1.4)+'s ease-in '+(Math.random()*0.5)+'s forwards;transform:rotate('+Math.random()*360+'deg);';" +
      "box.appendChild(p2);}document.body.appendChild(box);setTimeout(function(){box.remove();},3600);}" +
      // RPE de 1 toque: como foi o treino de hoje?
      "function mostraRpe(){var iso=isoHj();var r=L('ptrpe',{});var bx=document.getElementById('rpeBox');if(!bx)return;" +
      "if(!L('ptfeitos',{})[iso]||r[iso]){bx.style.display='none';return;}" +
      "bx.style.display='block';" +
      "bx.innerHTML=\"<div style='font-size:12.5px;font-weight:700;margin-bottom:6px;'>Como foi o treino de hoje?</div><div style='display:flex;gap:6px;'>\"+" +
      "[['1','Leve'],['2','Na medida'],['3','Pesado']].map(function(o){return \"<button data-rpe='\"+o[0]+\"' style='flex:1;background:var(--bg4);border:1px solid rgba(255,255,255,.06);border-radius:16px;padding:9px 0;color:#fff;font-family:inherit;font-size:12.5px;font-weight:700;cursor:pointer;'>\"+o[1]+\"</button>\";}).join('')+'</div>';}" +
      "document.addEventListener('click',function(e){var b=e.target.closest('[data-rpe]');if(!b)return;" +
      "var r=L('ptrpe',{});r[isoHj()]=+b.dataset.rpe;var ks=Object.keys(r).sort();if(ks.length>90)delete r[ks[0]];Sv('ptrpe',r);" +
      "var bx=document.getElementById('rpeBox');bx.innerHTML=\"<div class='vz' style='padding:4px 0;'>Anotado! Seu personal vê isso e ajusta o próximo treino.</div>\";setTimeout(function(){bx.style.display='none';},2600);});" +
      // semana: bolinhas seg-dom + meta + streak + medalhas
      "function pintaSemana(){var f=L('ptfeitos',{});var hj=new Date();var seg=new Date(hj);seg.setDate(seg.getDate()-((seg.getDay()+6)%7));" +
      "var rot=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];var html='';var naSem=0;" +
      "for(var i=0;i<7;i++){var d=new Date(seg);d.setDate(d.getDate()+i);var iso=isoLoc(d);var fez=!!f[iso];if(fez)naSem++;" +
      "var hoje=iso===isoHj();html+=\"<div style='flex:1;min-width:0;'><div style='border-radius:9px;padding:7px 0 5px;text-align:center;\"+(fez?'background:linear-gradient(135deg,var(--cor),var(--corc));':'background:var(--bg4);border:1px solid var(--bg10);')+(hoje?'outline:2px solid var(--corc);outline-offset:1px;':'')+\"'>\"+" +
      "\"<div style='font-size:8.5px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:\"+(fez?'rgba(255,255,255,.85)':'#6e6a78')+\";'>\"+rot[i]+\"</div>\"+" +
      "\"<div style='font-size:14px;font-weight:800;margin-top:1px;color:\"+(fez?'#fff':'#d6d2df')+\";'>\"+d.getDate()+\"</div>\"+" +
      "\"<div style='font-size:9px;line-height:1;margin-top:1px;color:\"+(fez?'#fff':'transparent')+\";'>✓</div></div></div>\";}" +
      "document.getElementById('diasSem').innerHTML=html;" +
      "var pct=Math.min(100,Math.round(100*naSem/META));" +
      "var stk=streakSem(f);" +
      "document.getElementById('metaBox').innerHTML=\"<div style='display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px;'><span>Meta da semana</span><b>\"+naSem+\" de \"+META+\"</b></div><div style='height:10px;background:var(--bg4);border-radius:99px;overflow:hidden;'><div style='height:100%;width:\"+pct+\"%;background:linear-gradient(90deg,var(--cor),var(--corc));border-radius:99px;transition:width .5s;'></div></div>\"+" +
      "(stk>0?\"<div id='stkBox' style='display:flex;align-items:center;gap:7px;margin-top:9px;font-weight:800;font-size:13.5px;color:#fb923c;'>\"+icx(ICO.chama,18)+\"sequência de \"+stk+\" semana\"+(stk>1?'s':'')+\" batendo a meta — não deixa apagar!</div>\":" +
      "\"<div id='stkBox' style='margin-top:9px;font-size:12px;color:#a9a4b5;'>Bata a meta desta semana pra acender a sequência \"+icx(ICO.chama,13)+\"</div>\");" +
      "var total=Object.keys(f).length;var marcos=[100,50,25,10,5];" +
      "var falta=null;for(var j=marcos.length-1;j>=0;j--){if(total<marcos[j]){falta=marcos[j];break;}}" +
      "document.getElementById('medalhas').innerHTML='<b>'+total+' treino(s) registrados</b>'+(falta?\"<br><small>faltam \"+(falta-total)+\" pra marca de \"+falta+\" treinos</small>\":'');}" +
      "document.getElementById('btnFeito').addEventListener('click',function(){var f=L('ptfeitos',{});var iso=isoHj();" +
      "if(f[iso]){alert('Treino de hoje já registrado! Descansa que amanhã tem mais.');return;}" +
      "f[iso]=1;Sv('ptfeitos',f);pintaSemana();" +
      "var naSem=0;var seg=new Date();seg.setDate(seg.getDate()-((seg.getDay()+6)%7));" +
      "for(var i=0;i<7;i++){var d=new Date(seg);d.setDate(d.getDate()+i);if(f[isoLoc(d)])naSem++;}" +
      "if(navigator.vibrate)navigator.vibrate(naSem>=META?[120,60,120,60,260]:[140]);" +
      "var t=document.createElement('div');t.style.cssText='position:fixed;top:16px;left:50%;transform:translateX(-50%);background:linear-gradient(90deg,var(--cor),var(--corc));color:#fff;padding:13px 22px;border-radius:13px;font-weight:800;z-index:9;text-align:center;';" +
      "t.innerHTML=(naSem>=META?icx(ICO.trofeu,20)+' META DA SEMANA BATIDA!<br><small>'+naSem+' treinos — orgulho define</small>':icx(ICO.raio,20)+' Treino registrado!<br><small>'+naSem+' de '+META+' na semana</small>');" +
      "document.body.appendChild(t);setTimeout(function(){t.remove();},3500);" +
      "if(naSem>=META)confete();" +
      "mostraRpe();" +
      "rpcApp('app_aluno_treino_reg',{t:TOKEN,p_dia:iso,p_itens:[{ex:'__feito',f:1,c:''}]});});" +
      // check-in semanal
      "var ckNota=0;var EMO=['Péssima','Ruim','Normal','Boa','Incrível'];" +
      "var FACES=[\"<circle cx='12' cy='12' r='9'/><path d='M9 9.5v.01M15 9.5v.01'/><path d='M8.5 16.2c1-1.5 2.3-2.2 3.5-2.2s2.5.7 3.5 2.2'/>\"," +
      "\"<circle cx='12' cy='12' r='9'/><path d='M9 9.5v.01M15 9.5v.01'/><path d='M9 15.6c1-.7 2-1 3-1s2 .3 3 1'/>\"," +
      "\"<circle cx='12' cy='12' r='9'/><path d='M9 9.5v.01M15 9.5v.01'/><path d='M9 15h6'/>\"," +
      "\"<circle cx='12' cy='12' r='9'/><path d='M9 9.5v.01M15 9.5v.01'/><path d='M8.5 14c1 1.5 2.3 2.2 3.5 2.2s2.5-.7 3.5-2.2'/>\"," +
      "\"<circle cx='12' cy='12' r='9'/><path d='M9 9.5v.01M15 9.5v.01'/><path d='M8 13.5a4.2 4.2 0 0 0 8 0z'/>\"];" +
      "document.getElementById('ckNotas').innerHTML=EMO.map(function(e,i){return \"<button data-n='\"+(i+1)+\"' style='flex:1;background:var(--bg4);border:1px solid rgba(255,255,255,.06);border-radius:16px;padding:8px 0 6px;cursor:pointer;color:#fff;font-family:inherit;'><div style='line-height:0;'>\"+icx(FACES[i],22)+\"</div><div style='font-size:8.5px;color:#a9a4b5;margin-top:3px;'>\"+e+\"</div></button>\";}).join('');" +
      "document.getElementById('ckNotas').addEventListener('click',function(ev){var b=ev.target.closest('button');if(!b)return;ckNota=+b.dataset.n;" +
      "this.querySelectorAll('button').forEach(function(x){x.style.background=x===b?'linear-gradient(135deg,var(--cor),var(--corc))':'var(--bg4)';x.style.borderColor=x===b?'var(--corc)':'var(--bg11)';});});" +
      "function semanaCK(){return semDe(new Date());}" +
      "if(L('ptck','')===semanaCK()){document.getElementById('ckOk').style.display='';document.getElementById('ckForm').style.display='none';}" +
      "document.getElementById('ckEnvia').addEventListener('click',function(){if(!ckNota){alert('Escolha uma nota pra semana.');return;}" +
      "var peso=parseFloat((document.getElementById('ckPeso').value||'').replace(',','.'))||null;var texto=document.getElementById('ckTexto').value.trim();" +
      "var fim=function(){Sv('ptck',semanaCK());document.getElementById('ckOk').style.display='';document.getElementById('ckForm').style.display='none';};" +
      "if(NUVEM){rpcApp('app_aluno_checkin',{t:TOKEN,p_nota:ckNota,p_texto:texto,p_peso:peso}).then(function(r){" +
      "if(r&&r.ok){fim();}else{alert('Não deu pra enviar agora — tenta de novo em instantes.');}});}" +
      "else{var msg='Check-in da semana — '+PRIMEIRO+'\\nSemana: '+EMO[ckNota-1]+(peso?'\\nPeso: '+peso+' kg':'')+(texto?'\\n'+texto:'');" +
      "window.open('https://wa.me/'+(ZAPP?'55'+ZAPP:'')+'?text='+encodeURIComponent(msg),'_blank');fim();}});" +
      "pintaSemana();mostraRpe();" +
      // onboarding de 30 segundos: 3 respostas que personalizam o acompanhamento
      "(function(){var card=document.getElementById('onbCard');if(!card||L('ptonb',null))return;card.style.display='block';" +
      "var sel={obj:'',dias:''};" +
      "function chip(box,val,rot){return \"<button data-onb='\"+box+\"' data-v='\"+val+\"' style='flex:1;min-width:0;background:var(--bg4);border:1px solid rgba(255,255,255,.06);border-radius:16px;padding:9px 6px;color:#fff;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;'>\"+rot+\"</button>\";}" +
      "document.getElementById('onbObj').innerHTML=[['emagrecer','Emagrecer'],['musculo','Ganhar músculo'],['saude','Saúde e disposição'],['performance','Performance']].map(function(o){return chip('obj',o[0],o[1]);}).join('');" +
      "document.getElementById('onbDias').innerHTML=[['2','2'],['3','3'],['4','4'],['5','5+']].map(function(o){return chip('dias',o[0],o[1]);}).join('');" +
      "card.addEventListener('click',function(e){var b=e.target.closest('[data-onb]');if(!b)return;sel[b.dataset.onb]=b.dataset.v;" +
      "card.querySelectorAll(\"[data-onb='\"+b.dataset.onb+\"']\").forEach(function(x){var on=x===b;x.style.background=on?'linear-gradient(135deg,var(--cor),var(--corc))':'var(--bg4)';x.style.borderColor=on?'var(--corc)':'var(--bg11)';});});" +
      "document.getElementById('onbOk').addEventListener('click',function(){if(!sel.obj||!sel.dias){alert('Escolhe o objetivo e os dias — é rapidinho!');return;}" +
      "Sv('ptonb',{obj:sel.obj,dias:sel.dias,dor:(document.getElementById('onbDor').value||'').trim().slice(0,120),em:isoHj()});" +
      "card.style.display='none';if(navigator.vibrate)navigator.vibrate(90);});})();" +
      // agenda estilo calendário (pede horário pela nuvem)
      "var SESS=" + jsonApp(sessApp) + ";" +
      "var AGSEL=null,AGMES=new Date();AGMES.setDate(1);" +
      "var MESES=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];" +
      "function agDados(){var l=L('ptagenda',[]);SESS.forEach(function(s){if(!l.some(function(x){return x.dia===s.d&&x.hora===(s.h||'')&&x.status==='confirmado';}))l.push({dia:s.d,hora:s.h||'',status:'confirmado',obs:'Sessão marcada'});});return l;}" +
      "function carregaAgenda(){if(!NUVEM){pintaCal();return;}rpcApp('app_agenda_lista',{t:TOKEN}).then(function(l){if(Array.isArray(l)){Sv('ptagenda',l);}pintaCal();});}" +
      "function pintaCal(){var el=document.getElementById('agCal');var l=agDados();var y=AGMES.getFullYear(),m=AGMES.getMonth();" +
      "var ini=(new Date(y,m,1).getDay()+6)%7;var nd=new Date(y,m+1,0).getDate();" +
      "var pontos={};l.forEach(function(x){pontos[x.dia]=x.status==='confirmado'?'confirmado':(pontos[x.dia]||x.status);});" +
      "var h=\"<div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;'><button id='agAnt' aria-label='Mês anterior' style='background:var(--bg4);border:1px solid rgba(255,255,255,.06);color:#fff;border-radius:14px;padding:4px 12px;cursor:pointer;font-size:15px;'>‹</button><b style='font-size:14px;'>\"+MESES[m]+' '+y+\"</b><button id='agProx' aria-label='Próximo mês' style='background:var(--bg4);border:1px solid rgba(255,255,255,.06);color:#fff;border-radius:14px;padding:4px 12px;cursor:pointer;font-size:15px;'>›</button></div>\";" +
      "h+=\"<div style='display:grid;grid-template-columns:repeat(7,1fr);gap:3px;text-align:center;font-size:10px;color:#6e6a78;margin-bottom:4px;'>\"+['S','T','Q','Q','S','S','D'].map(function(x){return '<div>'+x+'</div>';}).join('')+'</div>';" +
      "h+=\"<div style='display:grid;grid-template-columns:repeat(7,1fr);gap:3px;'>\";" +
      "for(var i=0;i<ini;i++)h+='<div></div>';" +
      "for(var d2=1;d2<=nd;d2++){var iso=y+'-'+('0'+(m+1)).slice(-2)+'-'+('0'+d2).slice(-2);var st2=pontos[iso];var hoje2=iso===isoHj();" +
      "h+=\"<div data-agdia='\"+iso+\"' style='aspect-ratio:1;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:9px;cursor:pointer;font-size:12.5px;font-weight:600;\"+(AGSEL===iso?'background:linear-gradient(135deg,var(--cor),var(--corc));color:#fff;':(hoje2?'border:1px solid var(--corc);color:#fff;':'background:var(--bg4);border:1px solid var(--bg10);color:#d6d2df;'))+\"'>\"+d2+" +
      "(st2?\"<span style='width:5px;height:5px;border-radius:50%;margin-top:2px;background:\"+(st2==='confirmado'?'#4ade80':st2==='pedido'?'#fbbf24':'#f87171')+\";'></span>\":\"<span style='height:7px;'></span>\")+'</div>';}" +
      "h+='</div>';el.innerHTML=h;" +
      "document.getElementById('agAnt').onclick=function(){AGMES.setMonth(AGMES.getMonth()-1);pintaCal();};" +
      "document.getElementById('agProx').onclick=function(){AGMES.setMonth(AGMES.getMonth()+1);pintaCal();};pintaDia();}" +
      "function pintaDia(){var box=document.getElementById('agDia');var form=document.getElementById('agForm');" +
      "if(!AGSEL){box.innerHTML='';form.style.display='none';return;}" +
      "var l=agDados().filter(function(x){return x.dia===AGSEL;});var pd=AGSEL.split('-');" +
      "box.innerHTML=\"<div style='font-size:13px;font-weight:800;margin-bottom:6px;'>\"+pd[2]+'/'+pd[1]+\"</div>\"+(l.length?l.map(function(x){" +
      "var cor=x.status==='confirmado'?'#4ade80':x.status==='pedido'?'#fbbf24':'#f87171';" +
      "var rot=x.status==='confirmado'?'confirmado':x.status==='pedido'?'aguardando':'não deu';" +
      "return \"<div class='kv'><span>\"+(x.hora||'horário a combinar')+(x.obs?\" · <small style='color:#a9a4b5'>\"+String(x.obs).replace(/</g,'&lt;')+'</small>':'')+\"</span><span><b style='color:\"+cor+\"'>\"+rot+'</b>'+(x.status==='confirmado'?\" <button data-agics='\"+x.dia+'|'+(x.hora||'')+\"' title='Salvar no calendário' style='background:#241b36;border:1px solid var(--cor);color:var(--cor-cl1);border-radius:14px;padding:3px 8px;cursor:pointer;font-size:0;line-height:0;' aria-label='Salvar no calendário'><svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' aria-hidden='true'><rect x='3' y='5' width='18' height='16' rx='2'/><path d='M16 3v4M8 3v4M3 11h18'/></svg></button>\":'')+'</span></div>';}).join(''):\"<div class='vz'>Nada marcado nesse dia.</div>\");" +
      "form.style.display=AGSEL>=isoHj()?'block':'none';}" +
      "(function(){var hs='';for(var hh=6;hh<=21;hh++){['00','30'].forEach(function(mm){hs+='<option>'+('0'+hh).slice(-2)+':'+mm+'</option>';});}document.getElementById('agHora').innerHTML=hs;})();" +
      "document.getElementById('agCal').addEventListener('click',function(e){var d3=e.target.closest('[data-agdia]');if(d3){AGSEL=d3.getAttribute('data-agdia');pintaCal();}});" +
      // salvar horário confirmado no calendário do celular (.ics)
      "var AGTIT=" + jsonApp("Sessão com " + studio.split(" ")[0] + " (TORQUE ON)") + ";" +
      "document.getElementById('agDia').addEventListener('click',function(e){var d9=e.target.getAttribute&&e.target.getAttribute('data-agics');if(!d9)return;" +
      "var p9=d9.split('|');var h9=p9[1]||'08:00';var i9=p9[0].replace(/-/g,'')+'T'+h9.replace(':','')+'00';" +
      "var f9=new Date(p9[0]+'T'+h9+':00');f9.setMinutes(f9.getMinutes()+60);var p2=function(n){return('0'+n).slice(-2);};" +
      "var s9=f9.getFullYear()+p2(f9.getMonth()+1)+p2(f9.getDate())+'T'+p2(f9.getHours())+p2(f9.getMinutes())+'00';" +
      "var ics='BEGIN:VCALENDAR\\r\\nVERSION:2.0\\r\\nPRODID:-//TORQUE ON//App//PT-BR\\r\\nBEGIN:VEVENT\\r\\nUID:'+Date.now()+'@torqueon.com.br\\r\\nDTSTART:'+i9+'\\r\\nDTEND:'+s9+'\\r\\nSUMMARY:'+AGTIT+'\\r\\nEND:VEVENT\\r\\nEND:VCALENDAR';" +
      "var b9=new Blob([ics],{type:'text/calendar'});var a9=document.createElement('a');a9.href=URL.createObjectURL(b9);a9.download='treino.ics';document.body.appendChild(a9);a9.click();setTimeout(function(){URL.revokeObjectURL(a9.href);a9.remove();},800);});" +
      "document.getElementById('agPede').addEventListener('click',function(){if(!AGSEL)return;var hr=document.getElementById('agHora').value;var ob=document.getElementById('agObs').value.trim();" +
      "if(NUVEM){var btn=this;btn.disabled=true;rpcApp('app_agenda_pede',{t:TOKEN,p_dia:AGSEL,p_hora:hr,p_obs:ob}).then(function(r){btn.disabled=false;" +
      "if(r&&r.ok){var l=L('ptagenda',[]);l.push({dia:AGSEL,hora:hr,status:'pedido',obs:ob});Sv('ptagenda',l);document.getElementById('agObs').value='';pintaCal();" +
      "alert('Pedido enviado! '+PRIMEIRO+', seu personal confirma em breve.');}else{alert((r&&r.erro==='muitos_pedidos')?'Você já tem muitos pedidos aguardando — espere a confirmação.':'Não deu pra enviar agora — tenta de novo.');}});}" +
      "else{var pd=AGSEL.split('-');window.open('https://wa.me/'+(ZAPP?'55'+ZAPP:'')+'?text='+encodeURIComponent('Oi! Queria marcar horário dia '+pd[2]+'/'+pd[1]+' às '+hr+(ob?' — '+ob:'')),'_blank');}});" +
      "carregaAgenda();" +
      // conquistas: medalhas + gráfico de treinos por semana
      "function seqMax(f){var ks=Object.keys(f).sort();var max2=0,seq=0,ant=null;ks.forEach(function(k){" +
      "if(ant){var dif=(new Date(k)-new Date(ant))/864e5;seq=dif===1?seq+1:1;}else seq=1;if(seq>max2)max2=seq;ant=k;});return max2;}" +
      "function pintaConquistas(){var f=L('ptfeitos',{});var total=Object.keys(f).length;var seq=seqMax(f);" +
      "var pz=Object.keys(L('ptpeso',{})).length;var dc=L('ptdc',{});var recs=Object.keys(dc).length;" +
      "var semMeta=0;var porSem={};Object.keys(f).forEach(function(k){var w=semDe(k);porSem[w]=(porSem[w]||0)+1;});" +
      "Object.keys(porSem).forEach(function(w){if(porSem[w]>=META)semMeta++;});" +
      "function icq(p){return \"<svg width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'>\"+p+'</svg>';}" +
      "var BADGES=[[\"<path d='M5 21V4M5 4h12l-2.5 4L17 12H5'/>\",'Primeiro treino',total,1],[\"<path d='M13 3 5 13h6l-1 8 8-10h-6z'/>\",'3 dias seguidos',seq,3],[\"<rect x='3' y='5' width='18' height='16' rx='2'/><path d='M16 3v4M8 3v4M3 11h18'/><path d='m9 16 2 2 4-4'/>\",'7 dias seguidos',seq,7],[\"<path d='M8 21h8M12 17v4M6 3h12v5a6 6 0 0 1-12 0z'/><path d='M6 5H3c0 3 1.5 4.5 3 4.5M18 5h3c0 3-1.5 4.5-3 4.5'/>\",'Semana com meta',semMeta,1],[\"<path d='M7 7v10M4 9v6M17 7v10M20 9v6M7 12h10'/>\",'25 treinos',total,25],[\"<path d='M6 4h12l3 5-9 11L3 9zM3 9h18'/>\",'100 treinos',total,100],[\"<polyline points='3 7 9 13 13 9 21 17'/><polyline points='15 17 21 17 21 11'/>\",'10 pesagens',pz,10],[\"<path d='M9 3h6v3H9z'/><rect x='5' y='4' width='14' height='17' rx='2'/><path d='M9 11h6M9 15h4'/>\",'Carga anotada',recs,1],[\"<path d='m12 3 2.7 5.7 6.3.8-4.6 4.3 1.2 6.2-5.6-3-5.6 3 1.2-6.2L3 9.5l6.3-.8z'/>\",'10 semanas de meta',semMeta,10]];" +
      // conquistas de CORRIDA: medidas pelo histórico real do cronômetro
      // (ptcardio, só modalidade corrida — bike e caminhada não valem aqui).
      // Só entram se a área Corrida e bike está ligada nas Configurações.
      (ve("cardio") ? "var crQ=L('ptcardio',[]).filter(function(x){return x.m==='corrida';});" +
      "var crQn=crQ.length,crQmax=0,crQsoma=0,crQrap=0;" +
      "crQ.forEach(function(x){var k9=+x.k||0;if(k9>crQmax)crQmax=k9;crQsoma+=k9;" +
      "if(k9>=3&&+x.s>0&&((+x.s/60)/k9)<=6.05)crQrap=1;});" +
      "BADGES.push([\"<circle cx='12' cy='13' r='8'/><path d='M12 9v4l2.5 2.5M9 2h6'/>\",'Primeira corrida',crQn,1]," +
      "[\"<circle cx='5' cy='19' r='2'/><circle cx='19' cy='5' r='2'/><path d='M7 19h6a4 4 0 0 0 0-8H9a4 4 0 0 1 0-8h8'/>\",'10 corridas',crQn,10]," +
      "[\"<path d='M12 4v2.5M12 11v2.5M12 18v2.5M4.5 20 9 4M19.5 20 15 4'/>\",'5 km numa corrida',Math.floor(crQmax),5]," +
      "[\"<path d='m8 3 4 8 5-5 5 15H2z'/>\",'10 km numa corrida',Math.floor(crQmax),10]," +
      "[\"<circle cx='12' cy='12' r='9'/><path d='M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18'/>\",'100 km somados',Math.floor(crQsoma),100]," +
      "[\"<path d='M13 3 5 13h6l-1 8 8-10h-6z'/>\",'Pace abaixo de 6:00',crQrap,1]);" : "") +
      // conquistas criadas pelo PRÓPRIO professor (Personalização): ícone de
      // traço (id da paleta; dado legado com emoji vira medalha) + nome + meta
      // em treinos registrados. Entram depois das padrão.
      "var CQX=" + jsonApp(((st.config || {}).conquistas || []).slice(0, 12).map(function (c) {
        return { p: MT_CQICONS[c.e] || MT_CQICONS.medalha,
          n: String(c.n || "").replace(/[<>&"']/g, "").slice(0, 28), m: Math.max(1, Math.min(5000, +c.meta || 1)) };
      }).filter(function (c) { return c.n; })) + ";" +
      "CQX.forEach(function(c){BADGES.push([c.p,c.n,total,c.m]);});" +
      "document.getElementById('cqGrid').innerHTML=BADGES.map(function(b){var tem=b[2]>=b[3];" +
      "return \"<div style='text-align:center;padding:10px 4px;border-radius:16px;\"+(tem?'background:rgba(var(--cor-rgb),.22);border:1px solid var(--cor);':'background:var(--bg4);border:1px solid var(--bg10);opacity:.55;')+\"'>\"+" +
      "(b[4]?\"<div style='font-size:23px;line-height:1.3;\"+(tem?'':'filter:grayscale(1);')+\"'>\"+b[0]+\"</div>\":\"<div style='line-height:0;padding:3px 0;color:\"+(tem?'var(--corc)':'#6e6a78')+\";'>\"+icq(b[0])+'</div>')+\"<div style='font-size:10.5px;font-weight:700;margin-top:3px;line-height:1.25;'>\"+b[1]+'</div>'+" +
      "(tem?\"<div style='font-size:9.5px;color:var(--corc);font-weight:800;margin-top:2px;'>CONQUISTADA</div>\":\"<div style='font-size:9.5px;color:#6e6a78;margin-top:2px;'>\"+Math.min(b[2],b[3])+'/'+b[3]+'</div>')+'</div>';}).join('');" +
      "var bars='';var hj5=new Date();var seg5=new Date(hj5);seg5.setDate(seg5.getDate()-((seg5.getDay()+6)%7));var max5=1;var sems=[];" +
      "for(var w2=7;w2>=0;w2--){var d5=new Date(seg5);d5.setDate(d5.getDate()-7*w2);var n5=porSem[isoLoc(d5)]||0;if(n5>max5)max5=n5;sems.push({d:d5,n:n5});}" +
      "bars=\"<div style='font-size:11px;color:#a9a4b5;margin-bottom:6px;'>Treinos por semana (últimas 8)</div><div style='display:flex;gap:6px;align-items:flex-end;height:80px;'>\"+sems.map(function(s5){" +
      "var hh5=Math.round(56*s5.n/max5);var bateu=s5.n>=META;" +
      "return \"<div style='flex:1;text-align:center;'><div style='font-size:10px;font-weight:800;color:\"+(bateu?'var(--corc)':'#6e6a78')+\";'>\"+(s5.n||'')+\"</div><div style='height:\"+(56-hh5)+\"px;'></div><div style='height:\"+hh5+\"px;background:\"+(bateu?'linear-gradient(180deg,var(--corc),var(--cor))':'var(--bg12)')+\";border-radius:4px 4px 0 0;min-height:2px;'></div><div style='font-size:8.5px;color:#6e6a78;margin-top:3px;'>\"+('0'+s5.d.getDate()).slice(-2)+'/'+('0'+(s5.d.getMonth()+1)).slice(-2)+'</div></div>';}).join('')+'</div>';" +
      "document.getElementById('cqGraf').innerHTML=bars;pintaMapaAno();}" +
      // mapa de constância: 52 semanas, cada quadradinho é um dia (estilo GitHub/Strava)
      "function pintaMapaAno(){var el=document.getElementById('mapaAno');if(!el)return;var f=L('ptfeitos',{});" +
      "var hoje=new Date();var fim=new Date(hoje);fim.setDate(fim.getDate()+(6-((fim.getDay()+6)%7)));" +
      "var html='';var tot=0;" +
      "for(var w=51;w>=0;w--){html+=\"<div style='flex:1;min-width:0;display:flex;flex-direction:column;gap:1.5px;'>\";" +
      "for(var d=0;d<7;d++){var dt=new Date(fim);dt.setDate(dt.getDate()-w*7-(6-d));var iso=isoLoc(dt);var fez=!!f[iso];if(fez)tot++;var fut=dt>hoje;" +
      "html+=\"<div style='width:100%;aspect-ratio:1;border-radius:1.5px;background:\"+(fut?'transparent':fez?'var(--cor)':'var(--bg8)')+\";'></div>\";}html+='</div>';}" +
      "el.innerHTML=\"<div style='font-size:11px;color:#a9a4b5;margin-bottom:6px;'>Seu ano de treinos — \"+tot+\" dia(s) pintados (cada quadrado é 1 dia)</div><div style='display:flex;gap:1.5px;max-width:100%;overflow:hidden;'>\"+html+'</div>';}" +
      "pintaConquistas();document.getElementById('btnFeito').addEventListener('click',function(){setTimeout(pintaConquistas,150);});" +
      // card de conquista pro Stories (canvas 1080×1080 com a marca do studio)
      "var STUDIO=" + jsonApp(studio) + ";" +
      "document.getElementById('btnCardStories').addEventListener('click',function(){" +
      "var f=L('ptfeitos',{});var total=Object.keys(f).length;var seq=seqMax(f);var stk2=streakSem(f);" +
      "var naSem2=0;var seg2=new Date();seg2.setDate(seg2.getDate()-((seg2.getDay()+6)%7));" +
      "for(var i2=0;i2<7;i2++){var d9=new Date(seg2);d9.setDate(d9.getDate()+i2);if(f[isoLoc(d9)])naSem2++;}" +
      "var c=document.createElement('canvas');c.width=1080;c.height=1080;var g=c.getContext('2d');" +
      "var gr=g.createLinearGradient(0,0,1080,1080);gr.addColorStop(0,CV('bg6'));gr.addColorStop(1,CV('cor-esc'));g.fillStyle=gr;g.fillRect(0,0,1080,1080);" +
      "g.fillStyle=CV('corc');g.font='700 42px system-ui,sans-serif';g.textAlign='center';g.fillText(STUDIO.toUpperCase().slice(0,30),540,150);" +
      "g.fillStyle='#fff';g.font='800 84px system-ui,sans-serif';" +
      "g.fillText(naSem2>0?'Minha semana: '+naSem2+' treino'+(naSem2>1?'s':'')+'!':(total>0?total+(total===1?' treino!':' treinos!'):'Bora treinar!'),540,360);" +
      "g.font='600 52px system-ui,sans-serif';g.fillStyle=CV('cor-cl2');" +
      "g.fillText('meta da semana: '+naSem2+' de '+META+(naSem2>=META?' — batida!':''),540,520);" +
      "if(stk2>0){g.fillStyle='#fdba74';g.fillText(stk2+' semana'+(stk2>1?'s':'')+' seguidas batendo a meta',540,615);g.fillStyle=CV('cor-cl2');}" +
      "g.fillText(total+' treinos no total · sequência de '+seq+(seq===1?' dia':' dias'),540,stk2>0?710:615);" +
      "g.fillStyle=CV('corc');g.font='700 34px system-ui,sans-serif';g.fillText(PRIMEIRO+' · TORQUE PERSONAL',540,990);" +
      "c.toBlob(function(bl){var fl=new File([bl],'conquista.png',{type:'image/png'});" +
      "if(navigator.canShare&&navigator.canShare({files:[fl]})){navigator.share({files:[fl]}).catch(function(){});}" +
      "else{var a2=document.createElement('a');a2.href=c.toDataURL('image/png');a2.download='conquista.png';a2.click();}});});" +
      // retrospectiva do mês fechado: monta sozinha no comecinho do mês seguinte
      "var MESN=['janeiro','fevereiro','mar\\u00e7o','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];" +
      "function retroMes(){var d=new Date();d.setDate(1);d.setDate(0);return isoLoc(d).slice(0,7);}" +
      "function retroDados(){var m=retroMes();var f=L('ptfeitos',{});var tr=Object.keys(f).filter(function(k){return k.slice(0,7)===m;}).length;" +
      "var hb=L('pthab',{});var nh=0;Object.keys(hb).forEach(function(k){if(k.slice(0,7)===m){var dd=hb[k]||{};Object.keys(dd).forEach(function(j){if(dd[j])nh++;});}});" +
      "var dc=L('ptdc',{});var rec=null;Object.keys(dc).forEach(function(ex){(dc[ex]||[]).forEach(function(x){" +
      "if(String(x.d).slice(0,7)===m&&(!rec||+x.kg>rec.kg))rec={ex:ex,kg:+x.kg};});});" +
      "var pz=L('ptpeso',{});var ks=Object.keys(pz).filter(function(k){return k.slice(0,7)===m;}).sort();" +
      "var dp=ks.length>1?Math.round((pz[ks[ks.length-1]]-pz[ks[0]])*10)/10:null;" +
      "return {m:m,nome:MESN[+m.slice(5,7)-1],tr:tr,nh:nh,rec:rec,dp:dp};}" +
      "function pintaRetro(){var card=document.getElementById('retroCard');if(!card)return;var d=retroDados();" +
      "if(!d.tr||L('ptretroV','')===d.m){card.style.display='none';return;}" +
      "card.style.display='block';card.querySelector('h2').textContent='Seu m\\u00eas de '+d.nome;" +
      "var linhas=[['Treinos registrados','<b>'+d.tr+'</b>']];" +
      "if(d.rec)linhas.push(['Maior carga do m\\u00eas','<b>'+String(d.rec.ex).replace(/[<>&]/g,'').slice(0,26)+' \\u2014 '+String(d.rec.kg).replace('.',',')+' kg</b>']);" +
      "if(d.dp!=null)linhas.push(['Peso no m\\u00eas','<b>'+(d.dp>0?'+':'')+String(d.dp).replace('.',',')+' kg</b>']);" +
      "if(d.nh)linhas.push(['H\\u00e1bitos marcados','<b>'+d.nh+'</b>']);" +
      "document.getElementById('retroBox').innerHTML=linhas.map(function(l){return \"<div class='kv'><span>\"+l[0]+'</span>'+l[1]+'</div>';}).join('');}" +
      "document.getElementById('retroFecha').addEventListener('click',function(){Sv('ptretroV',retroDados().m);pintaRetro();});" +
      "document.getElementById('retroShare').addEventListener('click',function(){var d=retroDados();" +
      "var c=document.createElement('canvas');c.width=1080;c.height=1080;var g=c.getContext('2d');" +
      "var gr=g.createLinearGradient(0,0,1080,1080);gr.addColorStop(0,CV('bg6'));gr.addColorStop(1,CV('cor-esc'));g.fillStyle=gr;g.fillRect(0,0,1080,1080);" +
      "g.fillStyle=CV('corc');g.font='700 42px system-ui,sans-serif';g.textAlign='center';g.fillText(STUDIO.toUpperCase().slice(0,30),540,150);" +
      "g.fillStyle='#fff';g.font='800 76px system-ui,sans-serif';g.fillText('MEU M\\u00caS DE '+d.nome.toUpperCase(),540,330);" +
      "g.font='800 88px system-ui,sans-serif';g.fillText(d.tr+(d.tr===1?' TREINO':' TREINOS'),540,470);" +
      "g.font='600 48px system-ui,sans-serif';g.fillStyle=CV('cor-cl2');var y=580;" +
      "if(d.rec){g.fillText('recorde: '+String(d.rec.ex).slice(0,22)+' \\u2014 '+String(d.rec.kg).replace('.',',')+' kg',540,y);y+=80;}" +
      "if(d.dp!=null){g.fillText('peso: '+(d.dp>0?'+':'')+String(d.dp).replace('.',',')+' kg no m\\u00eas',540,y);y+=80;}" +
      "if(d.nh){g.fillText(d.nh+' h\\u00e1bitos marcados',540,y);}" +
      "g.fillStyle=CV('corc');g.font='700 34px system-ui,sans-serif';g.fillText(PRIMEIRO+' \\u00b7 TORQUE PERSONAL',540,990);" +
      "c.toBlob(function(bl){var fl=new File([bl],'retro.png',{type:'image/png'});" +
      "if(navigator.canShare&&navigator.canShare({files:[fl]})){navigator.share({files:[fl]}).catch(function(){});}" +
      "else{var a3=document.createElement('a');a3.href=c.toDataURL('image/png');a3.download='retro.png';a3.click();}});});" +
      "pintaRetro();window.__retro=pintaRetro;" +
      "var FEXS=" + jsonApp(fexs) + ";" +
      // séries por exercício + cronômetro + auto-completar o dia
      "function pintaSets(){var st=L('ptsets_'+isoHj(),{});document.querySelectorAll('.setbtn').forEach(function(b){" +
      "var n=st[b.dataset.ex]||0,max=+b.dataset.n;b.textContent=n+'/'+max+' séries ✓';" +
      "b.style.background=n>=max?'linear-gradient(135deg,var(--cor),var(--corc))':'var(--bg7)';});}" +
      "document.addEventListener('click',function(e){var b=e.target.closest('.setbtn');" +
      "if(b){var st=L('ptsets_'+isoHj(),{});var max=+b.dataset.n;var n=(st[b.dataset.ex]||0)+1;if(n>max)n=0;st[b.dataset.ex]=n;Sv('ptsets_'+isoHj(),st);pintaSets();" +
      "if(n===max&&navigator.vibrate)navigator.vibrate(90);" +
      "if(FEXS.length&&FEXS.every(function(x){return (st[x.n]||0)>=x.s;})){var f=L('ptfeitos',{});if(!f[isoHj()]){document.getElementById('btnFeito').click();}}return;}" +
      "var ab=e.target.closest('.altbtn');if(ab){var bx2=ab.nextElementSibling;if(bx2)bx2.style.display=bx2.style.display==='none'?'block':'none';return;}" +
      "var t=e.target.closest('.tmrbtn');if(t){iniciaTmr(+t.dataset.s);return;}});" +
      // confirmação de presença da próxima sessão (avisa o personal pelo chat do app)
      "(function(){var bx=document.getElementById('sconfBox');if(!bx)return;var kcf=bx.dataset.d+'|'+bx.dataset.h;" +
      "function pintaCf(){var v=L('ptconf',{})[kcf];if(!v)return;bx.innerHTML=v===1?\"<span style='color:#4ade80;font-size:13px;font-weight:700;'>✓ Avisei que vou</span>\":\"<span style='color:#fbbf24;font-size:13px;font-weight:700;'>Avisei que não consigo — combina outro horário no chat</span>\";}" +
      "pintaCf();bx.addEventListener('click',function(e){var c=e.target.getAttribute&&e.target.getAttribute('data-pconf');if(c==null)return;var vou=c==='1';" +
      "var pd=bx.dataset.d.split('-');var hh=bx.dataset.h;" +
      "var msg=vou?('Confirmo presença na sessão de '+pd[2]+'/'+pd[1]+(hh?' às '+hh:'')+' ✓'):('Não vou conseguir ir na sessão de '+pd[2]+'/'+pd[1]+(hh?' às '+hh:'')+' — podemos remarcar?');" +
      "function marcaCf(){var f=L('ptconf',{});f[kcf]=vou?1:-1;Sv('ptconf',f);pintaCf();}" +
      "if(NUVEM){rpcApp('app_chat_envia',{t:TOKEN,p_texto:msg}).then(function(){marcaCf();}).catch(function(){marcaCf();});}" +
      "else{marcaCf();alert('Sem internet agora — avisa também pelo WhatsApp, combinado?');}});})();" +
      // ---- modo circuito (WOD): For Time, AMRAP, EMOM e Tabata ----
      "function bip(fq,dur){try{var ac=window.__ac||(window.__ac=new (window.AudioContext||window.webkitAudioContext)());" +
      "if(ac.state==='suspended')ac.resume();var o=ac.createOscillator(),ga=ac.createGain();o.type='square';o.connect(ga);ga.connect(ac.destination);" +
      "o.frequency.value=fq||880;ga.gain.value=.3;o.start();setTimeout(function(){try{o.stop();}catch(e2){}},dur||130);}catch(e){}}" +
      "['click','touchstart'].forEach(function(ev){document.addEventListener(ev,function(){try{if(window.__ac&&window.__ac.state==='suspended')window.__ac.resume();}catch(e){}},{passive:true});});" +
      "function wodFmt(s){s=Math.max(0,Math.round(s));return Math.floor(s/60)+':'+('0'+(s%60)).slice(-2);}" +
      // o motor do WOD só roda se o card existe (o professor pode desligar nas Configurações)
      "if(document.getElementById('cardWod')){" +
      "var WODT=[['fortime','For Time'],['amrap','AMRAP'],['emom','EMOM'],['tabata','Tabata']];" +
      "var WODS=" + jsonApp(wodsApp.map(function (w) { return { id: w.id, n: w.nome, t: w.tipo, cap: +w.cap || 0, min: +w.min || 10, rd: +w.rounds || 8, wk: +w.work || 20, rs: +w.rest || 10 }; })) + ";" +
      "var wod={tipo:'fortime',run:false,iv:null,t0:0,acum:0,voltas:0,ultMin:-1,ultFase:'',wodId:null,wodNome:'',ultCd:0};" +
      "function wodCd(resta){if(!wod.run)return;var cd=(resta<=3.05&&resta>0.05)?Math.ceil(resta):0;" +
      "if(cd&&cd!==wod.ultCd){bip(600,110);if(navigator.vibrate)navigator.vibrate(60);}wod.ultCd=cd;}" +
      // último resultado de cada circuito prescrito aparece no card
      "function pintaWodRes(){var wr=L('ptwodres',{});document.querySelectorAll('.wodres').forEach(function(el){" +
      "var lst=wr[el.dataset.wid]||[];if(!lst.length){el.textContent='';return;}var u=lst[lst.length-1];" +
      "el.textContent='Último resultado: '+u.r+' ('+u.d.slice(8,10)+'/'+u.d.slice(5,7)+')';});}" +
      "document.addEventListener('click',function(e){var b=e.target.closest('[data-wodstart]');if(!b)return;" +
      "var w=WODS.find(function(x){return x.id===b.dataset.wodstart;});if(!w||wod.run)return;" +
      "wod.tipo=w.t;wod.voltas=0;wod.acum=0;wod.ultMin=-1;wod.ultFase='';wod.wodId=w.id;wod.wodNome=w.n;wodChips();wodCfg();" +
      "if(w.t==='fortime')document.getElementById('wodCap').value=w.cap;" +
      "else if(w.t==='tabata'){document.getElementById('wodRounds').value=w.rd;document.getElementById('wodWork').value=w.wk;document.getElementById('wodRest').value=w.rs;}" +
      "else document.getElementById('wodMin').value=w.min;" +
      "document.getElementById('wodTempo').textContent='0:00';document.getElementById('wodFase').textContent=w.n.toUpperCase().slice(0,24)+' — PRONTO?';document.getElementById('wodFimBox').style.display='none';" +
      "var tela=document.getElementById('wodTela');tela.style.borderColor='var(--corc)';setTimeout(function(){tela.style.borderColor='var(--bg11)';},1500);" +
      "document.getElementById('wodGo').scrollIntoView({behavior:'smooth',block:'center'});if(navigator.vibrate)navigator.vibrate(60);});" +
      "function wodChips(){document.getElementById('wodTipos').innerHTML=WODT.map(function(t){var on=wod.tipo===t[0];" +
      "return \"<button data-wodt='\"+t[0]+\"' style='flex:1;padding:8px 0;border-radius:16px;font-family:inherit;font-size:12px;font-weight:800;cursor:pointer;\"+(on?'background:linear-gradient(135deg,var(--cor),var(--corc));border:none;color:#fff;':'background:var(--bg4);border:1px solid rgba(255,255,255,.06);color:#a9a4b5;')+\"'>\"+t[1]+\"</button>\";}).join('');}" +
      "function wodCfg(){var el=document.getElementById('wodCfg');var inp=function(id,rot,val,w){return \"<label style='flex:1;min-width:0;font-size:11px;color:#a9a4b5;'>\"+rot+\"<input id='\"+id+\"' inputmode='numeric' value='\"+val+\"' style='width:100%;margin-top:3px;padding:8px 10px;'></label>\";};" +
      "if(wod.tipo==='fortime')el.innerHTML=inp('wodCap','Tempo limite (min, 0 = livre)',12);" +
      "else if(wod.tipo==='amrap')el.innerHTML=inp('wodMin','Minutos',10);" +
      "else if(wod.tipo==='emom')el.innerHTML=inp('wodMin','Minutos',10);" +
      "else el.innerHTML=inp('wodRounds','Rounds',8)+inp('wodWork','Trabalho (s)',20)+inp('wodRest','Descanso (s)',10);" +
      "document.getElementById('wodVolta').style.display=wod.tipo==='amrap'||wod.tipo==='fortime'?'block':'none';" +
      "document.getElementById('wodTermina').style.display=wod.tipo==='fortime'?'block':'none';}" +
      "function wodPinta(el2){var tela=document.getElementById('wodTela'),fase=document.getElementById('wodFase'),tmp=document.getElementById('wodTempo'),info=document.getElementById('wodInfo');" +
      "if(wod.tipo==='fortime'){var cap=60*(parseInt(document.getElementById('wodCap').value,10)||0);" +
      "fase.textContent='FOR TIME';tmp.textContent=wodFmt(el2);info.textContent=(wod.voltas?wod.voltas+' volta(s) · ':'')+(cap?'limite '+wodFmt(cap):'sem limite');" +
      "if(cap)wodCd(cap-el2);if(cap&&el2>=cap)wodFim('TEMPO! '+wodFmt(cap)+(wod.voltas?' · '+wod.voltas+' volta(s)':''));return;}" +
      "if(wod.tipo==='amrap'){var tot=60*(parseInt(document.getElementById('wodMin').value,10)||10);var resta=tot-el2;" +
      "fase.textContent='AMRAP '+Math.round(tot/60)+' MIN';tmp.textContent=wodFmt(resta);info.textContent=wod.voltas+' volta(s) completadas';" +
      "wodCd(resta);if(resta<=0)wodFim(wod.voltas+' volta(s) em '+wodFmt(tot)+'!',wod.voltas);return;}" +
      "if(wod.tipo==='emom'){var totE=60*(parseInt(document.getElementById('wodMin').value,10)||10);" +
      "if(el2>=totE){wodFim('EMOM completo — '+Math.round(totE/60)+' minutos!');return;}" +
      "var mn=Math.floor(el2/60);var segRes=60-Math.floor(el2%60);" +
      "if(mn!==wod.ultMin){wod.ultMin=mn;if(el2>1){if(navigator.vibrate)navigator.vibrate([180,80,180]);bip(980,180);}}" +
      "wodCd(60-(el2%60));fase.textContent='MINUTO '+(mn+1)+' DE '+Math.round(totE/60);tmp.textContent=wodFmt(segRes);info.textContent='novo movimento a cada minuto cheio';return;}" +
      "var rd=parseInt(document.getElementById('wodRounds').value,10)||8;var wk=parseInt(document.getElementById('wodWork').value,10)||20;var rs=parseInt(document.getElementById('wodRest').value,10)||10;" +
      "var ciclo=wk+rs;var totT=rd*ciclo;" +
      "if(el2>=totT){wodFim('Tabata completo — '+rd+(rd>1?' rounds!':' round!'));return;}" +
      "var pos=el2%ciclo;var trabalhando=pos<wk;var faseAtual=trabalhando?'TRABALHA':'DESCANSA';" +
      "if(faseAtual!==wod.ultFase){wod.ultFase=faseAtual;if(el2>0.5){if(navigator.vibrate)navigator.vibrate(trabalhando?[200,80,200]:120);bip(trabalhando?1100:600,150);}}" +
      "tela.style.borderColor=trabalhando?'var(--corc)':'#0891b2';fase.textContent=faseAtual+' · ROUND '+(Math.floor(el2/ciclo)+1)+' DE '+rd;fase.style.color=trabalhando?'var(--corc)':'#22d3ee';" +
      "tmp.textContent=wodFmt(trabalhando?wk-pos:ciclo-pos);info.textContent=wk+'s trabalho · '+rs+'s descanso';wodCd(trabalhando?wk-pos:ciclo-pos);}" +
      "function wodTick(){var el2=(Date.now()-wod.t0)/1000;wodPinta(el2);}" +
      "function wodFim(msg,val){clearInterval(wod.iv);wod.run=false;wod.iv=null;soltaTela();" +
      "document.getElementById('wodGo').textContent='Iniciar';" +
      "document.getElementById('wodFase').textContent='FIM!';" +
      // circuito prescrito: guarda o placar, compara com o anterior e devolve pro personal
      "if(wod.wodId){var wr=L('ptwodres',{});var lst=wr[wod.wodId]||[];var ant=lst.length?lst[lst.length-1]:null;" +
      "if(ant&&val!=null&&ant.v!=null){if(wod.tipo==='fortime'?val<ant.v:val>ant.v)msg+=' — BATEU o resultado anterior!';}" +
      "lst.push({d:isoHj(),n:wod.wodNome,r:msg,v:val==null?null:Math.round(val)});if(lst.length>20)lst.shift();wr[wod.wodId]=lst;Sv('ptwodres',wr);pintaWodRes();}" +
      "if(navigator.vibrate)navigator.vibrate([250,100,250,100,400]);bip(1300,350);confete();" +
      "var fb=document.getElementById('wodFimBox');fb.style.display='block';" +
      "fb.innerHTML=\"<div style='text-align:center;font-weight:800;color:#4ade80;font-size:14.5px;margin-bottom:8px;'>\"+msg+\"</div>\"+" +
      "(!L('ptfeitos',{})[isoHj()]?\"<button class='btnx' id='wodFeito' style='display:block;width:100%;text-align:center;'>Registrar treino de hoje</button>\":'');" +
      "var wf=document.getElementById('wodFeito');if(wf)wf.addEventListener('click',function(){document.getElementById('btnFeito').click();fb.style.display='none';});}" +
      "document.getElementById('wodTermina').addEventListener('click',function(){if(!wod.run)return;var el2=(Date.now()-wod.t0)/1000;" +
      "wodFim('Seu tempo: '+wodFmt(el2)+(wod.voltas?' · '+wod.voltas+' volta(s)':''),el2);});" +
      "document.getElementById('wodTipos').addEventListener('click',function(e){var b=e.target.closest('[data-wodt]');if(!b||wod.run)return;" +
      "wod.tipo=b.dataset.wodt;wod.voltas=0;wod.acum=0;wod.ultMin=-1;wod.ultFase='';wod.wodId=null;wod.wodNome='';wodChips();wodCfg();" +
      "document.getElementById('wodTempo').textContent='0:00';document.getElementById('wodFase').textContent='Pronto?';document.getElementById('wodInfo').textContent='';document.getElementById('wodFimBox').style.display='none';});" +
      "document.getElementById('wodGo').addEventListener('click',function(){" +
      "if(wod.run){clearInterval(wod.iv);wod.iv=null;wod.run=false;wod.acum=(Date.now()-wod.t0)/1000;this.textContent='Continuar';soltaTela();return;}" +
      "wod.run=true;wod.t0=Date.now()-wod.acum*1000;this.textContent='Pausar';document.getElementById('wodFimBox').style.display='none';ligaTela();" +
      "bip(880,120);wod.iv=setInterval(wodTick,200);wodTick();});" +
      "document.getElementById('wodZera').addEventListener('click',function(){clearInterval(wod.iv);wod.iv=null;wod.run=false;wod.acum=0;wod.voltas=0;wod.ultMin=-1;wod.ultFase='';soltaTela();" +
      "document.getElementById('wodGo').textContent='Iniciar';document.getElementById('wodTempo').textContent='0:00';document.getElementById('wodFase').textContent='Pronto?';document.getElementById('wodInfo').textContent='';document.getElementById('wodFimBox').style.display='none';});" +
      "document.getElementById('wodVolta').addEventListener('click',function(){if(!wod.run)return;wod.voltas++;if(navigator.vibrate)navigator.vibrate(70);wodTick();});" +
      "wodChips();wodCfg();pintaWodRes();" +
      "window.__wod=wod;" +
      "}" +
      // ---- corrida e bike: cronômetro com pace — só roda se o card existe (Configurações) ----
      "if(document.getElementById('cardCardio')){" +
      "var CARDIOS=" + jsonApp(cardiosApp.map(function (c) { return { id: c.id, n: c.nome, m: c.mod, t: c.tipo, d: +c.dist || 0, tp: +c.tempo || 0, p: c.pace || "", r: +c.reps || 8, ti: +c.tiro || 60, de: +c.desc || 90 }; })) + ";" +
      "var CRMODS={corrida:'Corrida',caminhada:'Caminhada',bike:'Bike'};" +
      "var CRICOS={mapa:\"" + CRICO_MAPA + "\",painel:\"" + CRICO_PAINEL + "\"};" +
      "var cr={run:false,iv:null,t0:0,acum:0,km:0,gpsOn:false,watch:null,lastPos:null,plano:null,mod:'corrida',ultFase:'',ultCd:0,ultKm:0,jan:[],alvoBipou:false,rota:[],autoP:false,lastMove:0,metaD:0,metaT:0,cdIv:null,pagF:0,gigaF:0,lockF:false,swF:0};" +
      "function crEl(id){return document.getElementById(id);}" +
      "function crCfg(){var c=L('ptcrCfg',null)||{};return {cd:(c.cd==null?3:+c.cd),fb:c.fb||'voz',ap:c.ap==null?1:+c.ap};}" +
      "function crFala(txt){try{if(!window.speechSynthesis)return false;var u=new SpeechSynthesisUtterance(txt);u.lang='pt-BR';speechSynthesis.speak(u);return true;}catch(e){return false;}}" +
      // mapa de ruas (OpenStreetMap) quando on-line; sem internet cai no traçado offline
      "var crTiles={};" +
      "function merc(lat,lng,z){var n=Math.pow(2,z);var x=(lng+180)/360*n;var la=lat*Math.PI/180;" +
      "var y=(1-Math.log(Math.tan(la)+1/Math.cos(la))/Math.PI)/2*n;return {x:x,y:y};}" +
      "function crTile(z,x,y){var n=Math.pow(2,z);if(y<0||y>=n)return null;x=((x%n)+n)%n;" +
      "var k=z+'/'+x+'/'+y;var t=crTiles[k];if(t)return t;" +
      "if(Object.keys(crTiles).length>140)crTiles={};" +
      "t={img:new Image(),ok:false};crTiles[k]=t;t.img.crossOrigin='anonymous';" +
      "t.img.onload=function(){t.ok=true;try{desenhaRota();}catch(e){}};" +
      "t.img.src='https://tile.openstreetmap.org/'+z+'/'+x+'/'+y+'.png';return t;}" +
      "function crFullAberto(){var f=crEl('crFull');return !!f&&f.style.display!=='none';}" +
      "function crFullDim(){var cv=crEl('crMapaFull');if(!cv)return;var r=cv.getBoundingClientRect();" +
      "if(r.width>0&&Math.abs(cv.width-r.width)>4){cv.width=Math.round(r.width);cv.height=Math.round(r.height);}}" +
      "function desenhaRota(){desenhaCv(crEl('crMapa'));if(crFullAberto()){crFullDim();desenhaCv(crEl('crMapaFull'));}}" +
      "function desenhaCv(cv){if(!cv)return;var g=cv.getContext('2d');var W=cv.width,H=cv.height;g.clearRect(0,0,W,H);" +
      "var CLR=document.documentElement.classList.contains('claro');" +
      "var centro=cr.rota.length?cr.rota[cr.rota.length-1]:cr.lastPos;" +
      "if(navigator.onLine&&centro){" +
      // zoom: 16 parado; com rota, afasta até o percurso caber
      "var z=16;var b=null;" +
      "if(cr.rota.length>1){b={la1:1/0,la2:-1/0,lo1:1/0,lo2:-1/0};" +
      "cr.rota.forEach(function(pp){if(pp.lat<b.la1)b.la1=pp.lat;if(pp.lat>b.la2)b.la2=pp.lat;if(pp.lng<b.lo1)b.lo1=pp.lng;if(pp.lng>b.lo2)b.lo2=pp.lng;});" +
      "centro={lat:(b.la1+b.la2)/2,lng:(b.lo1+b.lo2)/2};" +
      "for(z=17;z>12;z--){var q1=merc(b.la2,b.lo1,z),q2=merc(b.la1,b.lo2,z);" +
      "if((q2.x-q1.x)*256<W-60&&(q2.y-q1.y)*256<H-60)break;}}" +
      "var c0=merc(centro.lat,centro.lng,z);var px0=c0.x*256-W/2,py0=c0.y*256-H/2;" +
      "g.fillStyle='#eceae5';g.fillRect(0,0,W,H);" +
      "for(var tx=Math.floor(px0/256);tx<=Math.floor((px0+W)/256);tx++){for(var ty=Math.floor(py0/256);ty<=Math.floor((py0+H)/256);ty++){" +
      "var tl=crTile(z,tx,ty);if(tl&&tl.ok)try{g.drawImage(tl.img,Math.round(tx*256-px0),Math.round(ty*256-py0));}catch(e){}}}" +
      /* visual clean, estilo app de corrida: tira a cor berrante dos tiles
       * (composição 'saturation' — o filtro de canvas não roda em iPhone
       * antigo, composição roda em tudo) e passa um véu claro por cima.
       * A rota e a posição são pintadas DEPOIS, então continuam vivas. */
      "g.globalCompositeOperation='saturation';g.fillStyle='hsl(0, 14%, 50%)';g.fillRect(0,0,W,H);" +
      "g.globalCompositeOperation='source-over';g.fillStyle='rgba(244,242,237,.42)';g.fillRect(0,0,W,H);" +
      "var pj=function(pp){var m2=merc(pp.lat,pp.lng,z);return {x:m2.x*256-px0,y:m2.y*256-py0};};" +
      "if(cr.rota.length>1){g.lineJoin='round';g.lineCap='round';" +
      "g.strokeStyle='rgba(255,255,255,.9)';g.lineWidth=8;g.beginPath();" +
      "cr.rota.forEach(function(pp,i){var q=pj(pp);if(i)g.lineTo(q.x,q.y);else g.moveTo(q.x,q.y);});g.stroke();" +
      "g.strokeStyle=CV('cor');g.lineWidth=5;g.beginPath();" +
      "cr.rota.forEach(function(pp,i){var q=pj(pp);if(i)g.lineTo(q.x,q.y);else g.moveTo(q.x,q.y);});g.stroke();" +
      "var i0=pj(cr.rota[0]);g.fillStyle='#4ade80';g.beginPath();g.arc(i0.x,i0.y,7,0,7);g.fill();}" +
      // bolinha azul da posição atual, estilo mapa de celular
      "var posAt=cr.rota.length?cr.rota[cr.rota.length-1]:centro;" +
      "var pAt=pj(posAt);g.fillStyle='#fff';g.beginPath();g.arc(pAt.x,pAt.y,10,0,7);g.fill();" +
      "g.fillStyle='#2563eb';g.beginPath();g.arc(pAt.x,pAt.y,6.5,0,7);g.fill();" +
      // atribuição obrigatória do OpenStreetMap
      "g.fillStyle='rgba(255,255,255,.85)';g.fillRect(W-150,H-22,150,22);" +
      "g.fillStyle='#444';g.font='11px system-ui,sans-serif';g.textAlign='right';g.fillText('\\u00a9 OpenStreetMap',W-8,H-7);" +
      "return;}" +
      // offline (ou ainda sem posição): grade + traçado do percurso
      "g.strokeStyle=CLR?'rgba(0,0,0,.07)':'rgba(255,255,255,.05)';g.lineWidth=1;" +
      "for(var gx=40;gx<W;gx+=40){g.beginPath();g.moveTo(gx,0);g.lineTo(gx,H);g.stroke();}" +
      "for(var gy=40;gy<H;gy+=40){g.beginPath();g.moveTo(0,gy);g.lineTo(W,gy);g.stroke();}" +
      "if(cr.rota.length<2){g.fillStyle=CLR?'rgba(0,0,0,.35)':'rgba(255,255,255,.3)';g.font='700 22px system-ui,sans-serif';g.textAlign='center';" +
      "g.fillText(cr.gpsOn?'Seu trajeto vai aparecer aqui':'Ligue o GPS pra desenhar o trajeto',W/2,H/2+7);return;}" +
      "var la1=1/0,la2=-1/0,lo1=1/0,lo2=-1/0;cr.rota.forEach(function(pp){if(pp.lat<la1)la1=pp.lat;if(pp.lat>la2)la2=pp.lat;if(pp.lng<lo1)lo1=pp.lng;if(pp.lng>lo2)lo2=pp.lng;});" +
      "var dLa=Math.max(la2-la1,1e-5),dLo=Math.max(lo2-lo1,1e-5);var zz=Math.min((W-60)/dLo,(H-60)/dLa);" +
      "function px(pp){return {x:30+(pp.lng-lo1)*zz+(W-60-dLo*zz)/2,y:H-30-(pp.lat-la1)*zz-(H-60-dLa*zz)/2};}" +
      "g.strokeStyle=CV('cor');g.lineWidth=5;g.lineJoin='round';g.lineCap='round';g.beginPath();" +
      "cr.rota.forEach(function(pp,i){var q=px(pp);if(i)g.lineTo(q.x,q.y);else g.moveTo(q.x,q.y);});g.stroke();" +
      "var a0=px(cr.rota[0]),aN=px(cr.rota[cr.rota.length-1]);" +
      "g.fillStyle='#4ade80';g.beginPath();g.arc(a0.x,a0.y,7,0,7);g.fill();" +
      "g.fillStyle='#fff';g.beginPath();g.arc(aN.x,aN.y,8,0,7);g.fill();" +
      "g.fillStyle=CV('cor');g.beginPath();g.arc(aN.x,aN.y,5,0,7);g.fill();}" +
      "function paceFmt(mpk){if(!isFinite(mpk)||mpk<=0||mpk>60)return '--:--';var m=Math.floor(mpk),s=Math.round((mpk-m)*60);if(s===60){m++;s=0;}return m+':'+('0'+s).slice(-2);}" +
      // calorias estimadas: último peso registrado (ou 70 kg) × km × fator da modalidade
      "function crKcal(km){var pz=L('ptpeso',{});var ks=Object.keys(pz).sort();var kg=(ks.length?+pz[ks[ks.length-1]]:0)||70;" +
      "var f=cr.mod==='bike'?0.42:(cr.mod==='caminhada'?0.55:1.03);return Math.round(kg*km*f);}" +
      "function havKm(a,b){var R=6371,rd=Math.PI/180;var x=Math.sin((b.lat-a.lat)*rd/2),y=Math.sin((b.lng-a.lng)*rd/2);" +
      "var h=x*x+Math.cos(a.lat*rd)*Math.cos(b.lat*rd)*y*y;return 2*R*Math.asin(Math.sqrt(h));}" +
      "function crCd(resta){if(!cr.run)return;var cd=(resta<=3.05&&resta>0.05)?Math.ceil(resta):0;" +
      "if(cd&&cd!==cr.ultCd){bip(600,110);if(navigator.vibrate)navigator.vibrate(60);}cr.ultCd=cd;}" +
      "function crKmAtual(){if(cr.gpsOn)return cr.km;var v=parseFloat(String(crEl('crKm').value||'').replace(',','.'));return isFinite(v)&&v>0?v:cr.km;}" +
      "function pintaCr(){" +
      // pausa automática (estilo app de corrida): parou de andar com GPS ligado → o relógio pausa sozinho
      "if(cr.run&&cr.gpsOn&&crCfg().ap&&cr.lastMove&&Date.now()-cr.lastMove>8000&&!(cr.plano&&cr.plano.t==='intervalado')){" +
      "cr.autoP=true;cr.run=false;cr.acum=(Date.now()-cr.t0)/1000;crEl('crGo').textContent='Continuar';if(navigator.vibrate)navigator.vibrate(120);}" +
      "var el2=cr.run?(Date.now()-cr.t0)/1000:cr.acum;var km=crKmAtual();" +
      "crEl('crTempo').textContent=wodFmt(el2);" +
      "crEl('crDist').textContent=km.toFixed(2).replace('.',',');" +
      "var med=km>0.015?(el2/60)/km:null;crEl('crPaceMed').textContent=med?paceFmt(med):'--:--';" +
      "var atual=med;if(cr.gpsOn&&cr.jan.length>1){var a0=cr.jan[0],a1=cr.jan[cr.jan.length-1];" +
      "if(a1.km-a0.km>0.02)atual=((a1.t-a0.t)/60000)/(a1.km-a0.km);}" +
      "crEl('crPace').textContent=atual?paceFmt(atual):'--:--';" +
      "crEl('crFim').style.display=(cr.run||cr.acum>0)?'block':'none';" +
      "var p2=cr.plano;var fase=crEl('crFase'),info=crEl('crInfo');" +
      "if(p2&&p2.t==='intervalado'){var ciclo=p2.ti+p2.de;var tot=p2.r*ciclo;" +
      "if(cr.run&&el2>=tot){crFinaliza('TIROS COMPLETOS \\u2014 '+p2.r+'\\u00d7!');return;}" +
      "var rdA=Math.min(p2.r,Math.floor(el2/ciclo)+1);var pos=el2%ciclo;var forte=pos<p2.ti;" +
      "fase.textContent=(forte?'FORTE':'LEVE')+' \\u00b7 TIRO '+rdA+' DE '+p2.r;fase.style.color=forte?'var(--corc)':'#22d3ee';" +
      "info.textContent=p2.n+' \\u2014 '+p2.ti+'s forte / '+p2.de+'s leve';" +
      "var f3=(forte?'F':'L')+rdA;if(cr.run&&f3!==cr.ultFase){cr.ultFase=f3;if(el2>0.3){if(navigator.vibrate)navigator.vibrate(forte?[90,50,90]:200);bip(forte?1100:600,200);}}" +
      "crCd(forte?p2.ti-pos:ciclo-pos);return;}" +
      "fase.style.color='#a9a4b5';" +
      "fase.textContent=cr.run?(CRMODS[cr.mod]||'Cardio').toUpperCase()+(p2?' \\u00b7 '+p2.n.toUpperCase():''):(cr.acum>0?(cr.autoP?'PAUSA AUTOM\\u00c1TICA \\u2014 anda que volta':'Pausado'):'Pronto pra correr?');" +
      "if(p2){var alvos=[];if(p2.d)alvos.push(p2.d+' km');if(p2.tp)alvos.push(p2.tp+' min');if(p2.p)alvos.push('pace '+p2.p);" +
      "info.textContent='Alvo: '+(alvos.join(' \\u00b7 ')||'livre')+(p2.d&&km>=p2.d?' \\u2014 ALVO BATIDO!':'');" +
      "if(cr.run&&!cr.alvoBipou&&((p2.d&&km>=p2.d)||(p2.tp&&el2>=p2.tp*60))){cr.alvoBipou=true;bip(1300,300);if(navigator.vibrate)navigator.vibrate([150,80,150]);}}" +
      "else if(cr.metaD||cr.metaT){info.textContent='Meta: '+(cr.metaD?cr.metaD+' km':cr.metaT+' min')+((cr.metaD&&km>=cr.metaD)||(cr.metaT&&el2>=cr.metaT*60)?' \\u2014 META BATIDA!':'');" +
      "if(cr.run&&!cr.alvoBipou&&((cr.metaD&&km>=cr.metaD)||(cr.metaT&&el2>=cr.metaT*60))){cr.alvoBipou=true;bip(1300,300);if(navigator.vibrate)navigator.vibrate([150,80,150]);confete();}}" +
      "else info.textContent=cr.gpsOn?'GPS ligado \\u2014 distância e pace sozinhos':'O GPS liga sozinho \\u2014 ou digite os km na mão';" +
      "if(Math.floor(km)>cr.ultKm&&km>0){cr.ultKm=Math.floor(km);if(cr.run){var fb2=crCfg().fb;var med3=km>0.015?(el2/60)/km:null;" +
      "var falou=fb2==='voz'&&crFala(cr.ultKm+(cr.ultKm===1?' quil\\u00f4metro':' quil\\u00f4metros')+(med3?'. Pace m\\u00e9dio '+paceFmt(med3).replace(':',' e ')+'.':'.'));" +
      "if(!falou&&fb2!=='off')bip(1000,220);if(navigator.vibrate)navigator.vibrate([120,60,120]);}}" +
      "try{espelhaCr();}catch(e){}}" +
      "function pintaCrHist(){var el=crEl('crHist');if(!el)return;var lst=L('ptcardio',[]);" +
      "el.innerHTML=lst.length?'<b>Seus \\u00faltimos treinos:</b><br>'+lst.slice(-5).reverse().map(function(x){" +
      "return String(x.d).slice(8,10)+'/'+String(x.d).slice(5,7)+' \\u2014 '+String(x.n).replace(/[<>&]/g,'')+': '+" +
      "(x.k?x.k.toFixed(2).replace('.',',')+' km \\u00b7 ':'')+wodFmt(x.s)+(x.p?' \\u00b7 pace '+x.p:'');}).join('<br>'):'';}" +
      // medalhas de corrida (mesmos critérios do card Conquistas): usado pra
      // avisar NA HORA quando a corrida recém-terminada conquista uma
      "var CRMEDN=['Primeira corrida','10 corridas','5 km numa corrida','10 km numa corrida','100 km somados','Pace abaixo de 6:00'];" +
      "function crMedQ(lst2){var q=lst2.filter(function(x){return x.m==='corrida';});" +
      "var n=q.length,mx=0,so=0,rp=0;q.forEach(function(x){var k9=+x.k||0;if(k9>mx)mx=k9;so+=k9;" +
      "if(k9>=3&&+x.s>0&&((+x.s/60)/k9)<=6.05)rp=1;});" +
      "return [n>=1,n>=10,mx>=5,mx>=10,so>=100,rp>=1];}" +
      "function crFinaliza(msg){var el2=cr.run?(Date.now()-cr.t0)/1000:cr.acum;if(el2<5)return;" +
      "clearInterval(cr.iv);cr.iv=null;cr.run=false;cr.acum=0;soltaTela();crGpsPara();" +
      "var km=crKmAtual();var med=km>0.015?(el2/60)/km:null;" +
      "var reg={d:isoHj(),n:cr.plano?cr.plano.n:'Livre \\u2014 '+(CRMODS[cr.mod]||'Cardio'),m:cr.plano?cr.plano.m:cr.mod,s:Math.round(el2),k:Math.round(km*100)/100,p:med?paceFmt(med):null};" +
      "var lst=L('ptcardio',[]);" +
      // recordes pessoais e medalhas: compara o histórico antes e depois do registro
      "var antes=crMedQ(lst);var corr=lst.filter(function(x){return x.m==='corrida';});" +
      "var mxAnt=0,pcAnt=1/0;corr.forEach(function(x){var k9=+x.k||0;if(k9>mxAnt)mxAnt=k9;" +
      "if(k9>=3&&+x.s>0){var p9=(+x.s/60)/k9;if(p9<pcAnt)pcAnt=p9;}});" +
      "lst.push(reg);if(lst.length>30)lst.shift();Sv('ptcardio',lst);" +
      "var extras=[];" +
      "if(reg.m==='corrida'){var depois=crMedQ(lst);" +
      "depois.forEach(function(t9,i9){if(t9&&!antes[i9])extras.push('Medalha nova: '+CRMEDN[i9]);});" +
      "if(corr.length&&reg.k>mxAnt)extras.push('RECORDE: sua corrida mais longa ('+String(reg.k).replace('.',',')+' km)');" +
      "if(reg.k>=3&&med&&isFinite(pcAnt)&&med<pcAnt)extras.push('RECORDE: seu melhor pace ('+paceFmt(med)+')');}" +
      "cr.fimReg=reg;cr.fimRota=cr.rota.slice();" +
      "crEl('crGo').textContent='Iniciar';crEl('crFase').textContent=msg||(extras.length?extras[0]:'BOA! Treino registrado');crEl('crFase').style.color='#4ade80';" +
      "crEl('crInfo').textContent=extras.slice(msg?0:1).join(' \\u00b7 ');" +
      "var bSh=crEl('crShare');if(bSh)bSh.style.display=reg.k>0?'block':'none';" +
      "if(navigator.vibrate)navigator.vibrate([250,100,250,100,400]);bip(1300,350);confete();pintaCrHist();" +
      "cr.km=0;cr.ultKm=0;cr.jan=[];cr.alvoBipou=false;cr.rota=[];cr.autoP=false;cr.lastMove=0;crEl('crKm').value='';try{desenhaRota();}catch(e){}}" +
      "function crGpsPara(){if(cr.watch!=null&&navigator.geolocation){navigator.geolocation.clearWatch(cr.watch);}cr.watch=null;cr.gpsOn=false;cr.lastPos=null;" +
      "var b=crEl('crGps');b.innerHTML='Ligar<br>GPS';b.style.borderColor='var(--bg11)';b.style.color='#a9a4b5';try{desenhaRota();}catch(e){}}" +
      // GPS sempre ativo: liga sozinho ao entrar na área de cardio (preferência ptgpsAuto, padrão ligado)
      "var crGpsNeg=false;" +
      "function crGpsLiga(auto){if(cr.watch!=null)return;if(auto&&crGpsNeg)return;" +
      "if(!navigator.geolocation){if(!auto)crEl('crInfo').textContent='Esse aparelho n\\u00e3o tem GPS dispon\\u00edvel \\u2014 digite os km na m\\u00e3o.';return;}" +
      "var b=crEl('crGps');b.innerHTML='GPS\\u2026';" +
      "cr.watch=navigator.geolocation.watchPosition(function(pos){" +
      "cr.gpsOn=true;crGpsNeg=false;b.innerHTML='GPS ligado';b.style.borderColor='#4ade80';b.style.color='#4ade80';" +
      "if(pos.coords.accuracy>40)return;var pt={lat:pos.coords.latitude,lng:pos.coords.longitude};" +
      "var dK=cr.lastPos?havKm(cr.lastPos,pt):0;" +
      "if(cr.lastPos&&cr.run&&dK<0.15)cr.km+=dK;" +
      "if(dK>0.004){cr.lastMove=Date.now();" +
      "if(cr.autoP){cr.autoP=false;cr.run=true;cr.t0=Date.now()-cr.acum*1000;crEl('crGo').textContent='Pausar';bip(880,110);}}" +
      "cr.lastPos=pt;if(cr.run){cr.rota.push({lat:pt.lat,lng:pt.lng});if(cr.rota.length>600)cr.rota.shift();" +
      "cr.jan.push({t:Date.now(),km:cr.km});while(cr.jan.length&&Date.now()-cr.jan[0].t>60000)cr.jan.shift();}" +
      "try{desenhaRota();}catch(e){}pintaCr();" +
      "},function(err){if(err&&err.code===1){crGpsNeg=true;crGpsPara();}else{crEl('crGps').textContent='Ligar GPS';}" +
      "crEl('crInfo').textContent='Sem GPS agora \\u2014 digite os km na m\\u00e3o que o pace sai igual.';" +
      "},{enableHighAccuracy:true,maximumAge:2000,timeout:15000});}" +
      "function crAutoGps(){var v=localStorage.getItem('ptgpsAuto');if(v==null||+v)crGpsLiga(true);}" +
      "crEl('crGps').addEventListener('click',function(){" +
      "if(cr.watch!=null){Sv('ptgpsAuto',0);crGpsPara();pintaCr();return;}" +
      "Sv('ptgpsAuto',1);crGpsNeg=false;crGpsLiga(false);});" +
      "window.__crGpsLiga=crGpsLiga;" +
      "function crChips(){var box=crEl('crTipos');if(!box)return;box.innerHTML=Object.keys(CRMODS).map(function(m){var on=!cr.plano&&cr.mod===m;" +
      "return \"<button type='button' class='crModBt' data-crmod='\"+m+\"' style='flex:1;padding:8px 2px;border-radius:10px;font-size:12px;font-weight:800;cursor:pointer;font-family:inherit;background:\"+(on?'linear-gradient(135deg,var(--cor),var(--corc))':'var(--bg4)')+\";border:\"+(on?'none':'1px solid var(--bg11)')+\";color:\"+(on?'#fff':'#a9a4b5')+\";'>\"+CRMODS[m]+\"</button>\";}).join('');}" +
      "document.addEventListener('click',function(e){var b=e.target.closest('.crModBt');if(!b||cr.run)return;" +
      "cr.plano=null;cr.mod=b.dataset.crmod;cr.alvoBipou=false;crChips();pintaCr();});" +
      "document.addEventListener('click',function(e){var b=e.target.closest('[data-cbstart]');if(!b)return;" +
      "var p3=null;CARDIOS.forEach(function(x){if(x.id===b.dataset.cbstart)p3=x;});if(!p3)return;" +
      "clearInterval(cr.iv);cr.iv=null;cr.run=false;cr.acum=0;cr.km=0;cr.ultKm=0;cr.jan=[];cr.alvoBipou=false;cr.plano=p3;cr.mod=p3.m;" +
      "crEl('crGo').textContent='Iniciar';crChips();crAutoGps();pintaCr();crEl('crTela').scrollIntoView({behavior:'smooth',block:'center'});});" +
      "function crLarga(){cr.run=true;cr.autoP=false;cr.t0=Date.now()-cr.acum*1000;crEl('crGo').textContent='Pausar';ligaTela();bip(880,110);" +
      "var bS8=crEl('crShare');if(bS8)bS8.style.display='none';" +
      "crEl('crFase').style.color='#a9a4b5';cr.iv=setInterval(pintaCr,200);pintaCr();}" +
      "crEl('crGo').addEventListener('click',function(){" +
      "if(cr.cdIv){clearInterval(cr.cdIv);cr.cdIv=null;crEl('crContagem').style.display='none';var fC=crEl('crContagemF');if(fC)fC.style.display='none';this.textContent='Iniciar';return;}" +
      "if(cr.run){clearInterval(cr.iv);cr.iv=null;cr.run=false;cr.autoP=false;cr.acum=(Date.now()-cr.t0)/1000;this.textContent='Continuar';soltaTela();pintaCr();return;}" +
      "crAutoGps();abreCrFull(0);var cd=cr.acum>0?0:crCfg().cd;" +
      "if(!cd){crLarga();return;}" +
      // contagem regressiva estilo app de corrida (configurável: 3, 5 ou 10 segundos)
      "var elC=crEl('crContagem'),elF=crEl('crContagemF');elC.style.display='flex';elC.textContent=cd;" +
      "if(elF){elF.style.display='flex';elF.textContent=cd;}bip(600,140);this.textContent='Cancelar';" +
      "cr.cdIv=setInterval(function(){cd--;if(cd<=0){clearInterval(cr.cdIv);cr.cdIv=null;elC.style.display='none';if(elF)elF.style.display='none';crLarga();return;}" +
      "elC.textContent=cd;if(elF)elF.textContent=cd;bip(600,140);if(navigator.vibrate)navigator.vibrate(50);},1000);});" +
      // configurações da corrida (engrenagem): contagem, aviso por km e pausa automática
      "function pintaCrCfg(){var c=crCfg();crEl('crCfgBox').innerHTML=" +
      "\"<div style='font-size:11px;font-weight:800;letter-spacing:.14em;color:#6e6a78;margin-bottom:6px;'>CONFIGURA\\u00c7\\u00d5ES DA CORRIDA</div>\"+" +
      "\"<label style='display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:13px;padding:7px 0;border-bottom:1px dashed var(--bg11);'>Contagem regressiva<select id='crCfgCd' style='width:120px;'>\"+" +
      "[0,3,5,10].map(function(v){return \"<option value='\"+v+\"'\"+(c.cd===v?' selected':'')+'>'+(v?v+' segundos':'Desligada')+'</option>';}).join('')+'</select></label>'+" +
      "\"<label style='display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:13px;padding:7px 0;border-bottom:1px dashed var(--bg11);'>Aviso a cada km<select id='crCfgFb' style='width:120px;'>\"+" +
      "[['voz','Voz'],['bip','Bipe'],['off','Desligado']].map(function(o){return \"<option value='\"+o[0]+\"'\"+(c.fb===o[0]?' selected':'')+'>'+o[1]+'</option>';}).join('')+'</select></label>'+" +
      "\"<label style='display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:13px;padding:7px 0;'>Pausa autom\\u00e1tica (com GPS)<input type='checkbox' id='crCfgAp' style='width:18px;height:18px;'\"+(c.ap?' checked':'')+'>'+'</label>';" +
      "['crCfgCd','crCfgFb','crCfgAp'].forEach(function(id2){crEl(id2).addEventListener('change',function(){" +
      "Sv('ptcrCfg',{cd:+crEl('crCfgCd').value,fb:crEl('crCfgFb').value,ap:crEl('crCfgAp').checked?1:0});});});}" +
      "crEl('crCfgBtn').addEventListener('click',function(){var bx=crEl('crCfgBox');" +
      "if(bx.style.display==='none'){pintaCrCfg();bx.style.display='block';crEl('crMetaBox').style.display='none';}else bx.style.display='none';});" +
      // meta da corrida livre (pill "Defina uma meta")
      "function pintaCrMeta(){crEl('crMetaBox').innerHTML=" +
      "\"<div style='font-size:11px;font-weight:800;letter-spacing:.14em;color:#6e6a78;margin-bottom:8px;'>META DA CORRIDA LIVRE</div>\"+" +
      "\"<div style='display:flex;gap:6px;flex-wrap:wrap;'>\"+" +
      "[['0-0','Livre'],['3-0','3 km'],['5-0','5 km'],['10-0','10 km'],['0-30','30 min'],['0-60','1 hora']].map(function(m2){" +
      "var on=(+m2[0].split('-')[0]===cr.metaD&&+m2[0].split('-')[1]===cr.metaT);" +
      "return \"<button type='button' class='crMetaOp' data-meta='\"+m2[0]+\"' style='flex:1;min-width:62px;padding:9px 2px;border-radius:10px;font-family:inherit;font-size:12px;font-weight:800;cursor:pointer;background:\"+(on?'linear-gradient(135deg,var(--cor),var(--corc))':'var(--bg4)')+\";border:\"+(on?'none':'1px solid var(--bg11)')+\";color:\"+(on?'#fff':'#a9a4b5')+\";'>\"+m2[1]+'</button>';}).join('')+'</div>';}" +
      "crEl('crMetaBtn').addEventListener('click',function(){var bx=crEl('crMetaBox');" +
      "if(bx.style.display==='none'){pintaCrMeta();bx.style.display='block';crEl('crCfgBox').style.display='none';}else bx.style.display='none';});" +
      "document.addEventListener('click',function(e){var b3=e.target.closest('.crMetaOp');if(!b3)return;" +
      "var par=b3.dataset.meta.split('-');cr.metaD=+par[0];cr.metaT=+par[1];cr.alvoBipou=false;" +
      "if(!cr.run)cr.plano=null;crChips();" + // meta é da corrida livre — sai do treino prescrito
      "crEl('crMetaBtn').textContent=cr.metaD?('Meta: '+cr.metaD+' km'):(cr.metaT?('Meta: '+cr.metaT+' min'):'Defina uma meta');" +
      "crEl('crMetaBox').style.display='none';pintaCr();});" +
      "crEl('crFim').addEventListener('click',function(){crFinaliza(null);});" +
      "crEl('crZera').addEventListener('click',function(){clearInterval(cr.iv);cr.iv=null;cr.run=false;cr.acum=0;cr.km=0;cr.ultKm=0;cr.jan=[];cr.alvoBipou=false;" +
      "cr.rota=[];cr.autoP=false;cr.lastMove=0;if(cr.cdIv){clearInterval(cr.cdIv);cr.cdIv=null;crEl('crContagem').style.display='none';var fZ=crEl('crContagemF');if(fZ)fZ.style.display='none';}soltaTela();crGpsPara();" +
      "crEl('crGo').textContent='Iniciar';crEl('crKm').value='';crEl('crFase').style.color='#a9a4b5';" +
      "var bS7=crEl('crShare');if(bS7)bS7.style.display='none';desenhaRota();pintaCr();});" +
      "crEl('crKm').addEventListener('input',function(){if(!cr.gpsOn)pintaCr();});" +
      // arte da corrida (1080x1350): trajeto em branco sobre a cor da marca,
      // km gigante, tempo/pace e o nome do studio — share nativo ou download
      "crEl('crShare').addEventListener('click',function(){var rg=cr.fimReg;if(!rg)return;" +
      "var c=document.createElement('canvas');c.width=1080;c.height=1350;var g=c.getContext('2d');" +
      "var gr=g.createLinearGradient(0,0,1080,1350);gr.addColorStop(0,CV('bg4'));gr.addColorStop(1,CV('cor'));g.fillStyle=gr;g.fillRect(0,0,1080,1350);" +
      "var rt=cr.fimRota||[];var temRota=rt.length>1;" +
      "if(temRota){var la1=1/0,la2=-1/0,lo1=1/0,lo2=-1/0;rt.forEach(function(pp){if(pp.lat<la1)la1=pp.lat;if(pp.lat>la2)la2=pp.lat;if(pp.lng<lo1)lo1=pp.lng;if(pp.lng>lo2)lo2=pp.lng;});" +
      "var dLa=Math.max(la2-la1,1e-5),dLo=Math.max(lo2-lo1,1e-5);var zz=Math.min(700/dLo,520/dLa);" +
      "g.strokeStyle='rgba(255,255,255,.96)';g.lineWidth=16;g.lineJoin='round';g.lineCap='round';g.beginPath();" +
      "rt.forEach(function(pp,i9){var x9=190+(pp.lng-lo1)*zz+(700-dLo*zz)/2;var y9=830-(pp.lat-la1)*zz-(520-dLa*zz)/2;if(i9)g.lineTo(x9,y9);else g.moveTo(x9,y9);});g.stroke();}" +
      "g.textAlign='center';g.fillStyle='rgba(255,255,255,.85)';g.font='700 40px system-ui,sans-serif';g.fillText(STUDIO.toUpperCase().slice(0,30),540,120);" +
      "var yK=temRota?1010:660;" +
      "g.fillStyle='#fff';g.font='900 170px system-ui,sans-serif';g.fillText(String(rg.k).replace('.',',')+' km',540,yK);" +
      "g.font='600 52px system-ui,sans-serif';g.fillStyle='rgba(255,255,255,.9)';" +
      "g.fillText(wodFmt(rg.s)+(rg.p?' \\u00b7 pace '+rg.p:'')+' \\u00b7 '+(CRMODS[rg.m]||'Cardio'),540,yK+95);" +
      "g.font='700 36px system-ui,sans-serif';g.fillStyle='rgba(255,255,255,.75)';" +
      "g.fillText(PRIMEIRO+' \\u00b7 '+String(rg.d).slice(8,10)+'/'+String(rg.d).slice(5,7),540,1250);" +
      "c.toBlob(function(bl){var fl=new File([bl],'corrida.png',{type:'image/png'});" +
      "if(navigator.canShare&&navigator.canShare({files:[fl]})){navigator.share({files:[fl]}).catch(function(){});}" +
      "else{var a2=document.createElement('a');a2.href=c.toDataURL('image/png');a2.download='corrida.png';a2.click();}});});" +
      // tela cheia estilo NRC: página 0 = painel de cor chapada com a métrica gigante,
      // página 1 = mapa; pausado força o mapa + grade de métricas; ✕ volta sem parar
      // o crFull vai pro <body> na primeira abertura: dentro do card, a animação de entrada
      // da seção (transform) prende o position:fixed e a tela cheia sai clipada
      "function abreCrFull(pg){var f=crEl('crFull');if(!f)return;if(f.parentElement!==document.body)document.body.appendChild(f);" +
      "if(pg===0||pg===1)cr.pagF=pg;f.style.display='block';crFullDim();espelhaCr();try{desenhaRota();}catch(e){}}" +
      "function fechaCrFull(){var f=crEl('crFull');if(!f)return;f.style.display='none';cr.lockF=false;crEl('crLockOverF').style.display='none';}" +
      "var GIGAS=[['km','QUIL\\u00d4METROS'],['tempo','TEMPO'],['pace','PACE M\\u00c9DIO'],['kcal','CALORIAS']];" +
      "function espelhaCr(){if(!crFullAberto())return;" +
      "var rodou=cr.run||cr.acum>0;var pausado=!cr.run&&cr.acum>0;var km=crKmAtual();" +
      "var tTxt=crEl('crTempo').textContent,medTxt=crEl('crPaceMed').textContent,kmTxt=km.toFixed(2).replace('.',','),kcTxt=String(crKcal(km));" +
      "crEl('crTempoF').textContent=tTxt;crEl('crPaceF').textContent=crEl('crPace').textContent;crEl('crKcalF').textContent=kcTxt;" +
      "crEl('crFaseF').textContent=crEl('crFase').textContent;" +
      "var fc=crEl('crFase').style.color;crEl('crFaseF').style.color=(fc==='#a9a4b5'||fc==='rgb(169, 164, 181)')?'rgba(255,255,255,.85)':fc;" +
      "crEl('crInfoF').textContent=crEl('crInfo').textContent;crEl('crGoF').textContent=crEl('crGo').textContent;" +
      "var vals={km:kmTxt,tempo:tTxt,pace:medTxt,kcal:kcTxt};var gi=cr.gigaF||0;" +
      "crEl('crGigaV').textContent=vals[GIGAS[gi][0]];crEl('crGigaL').textContent=GIGAS[gi][1];" +
      "crEl('crDotsF').innerHTML=GIGAS.map(function(_,i){return \"<span style='width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,\"+(i===gi?'1':'.35')+\");'></span>\";}).join('');" +
      "var mapa=pausado||cr.pagF===1;crEl('crPainelF').style.display=mapa?'none':'flex';" +
      "crEl('crTopoF').style.background=mapa?'rgba(var(--bg0-rgb),.78)':'none';" +
      "crEl('crPausaF').style.display=pausado?'block':'none';" +
      "if(pausado){crEl('crPzKm').textContent=kmTxt;crEl('crPzT').textContent=tTxt;crEl('crPzPc').textContent=medTxt;crEl('crPzKc').textContent=kcTxt;}" +
      "crEl('crCfgBtnF').style.display=rodou?'none':'flex';crEl('crGpsF').style.display=rodou?'none':'block';" +
      "crEl('crLockBtnF').style.display=cr.run?'flex':'none';crEl('crMapBtnF').style.display=cr.run?'flex':'none';" +
      "crEl('crMapBtnF').innerHTML=cr.pagF===1?CRICOS.painel:CRICOS.mapa;crEl('crMapBtnF').setAttribute('aria-label',cr.pagF===1?'Ver o painel':'Ver o mapa');" +
      "crEl('crFimF').style.display=rodou?'block':'none';" +
      "crEl('crGoF').style.background=pausado?'linear-gradient(135deg,var(--cor),var(--corc))':'var(--bg0)';" +
      "crEl('crMetaBtnF').style.display=rodou?'none':'block';crEl('crMetaBtnF').textContent=crEl('crMetaBtn').textContent;" +
      "crEl('crGpsF').style.borderColor=cr.gpsOn?'#4ade80':'rgba(255,255,255,.3)';crEl('crGpsF').style.color=cr.gpsOn?'#4ade80':'#fff';}" +
      "crEl('crFullFecha').addEventListener('click',fechaCrFull);" +
      "crEl('crMapa').addEventListener('click',function(){abreCrFull(1);});" +
      "crEl('crGoF').addEventListener('click',function(){crEl('crGo').click();espelhaCr();});" +
      "crEl('crFimF').addEventListener('click',function(){crEl('crFim').click();fechaCrFull();});" +
      "crEl('crGpsF').addEventListener('click',function(){crEl('crGps').click();espelhaCr();});" +
      "crEl('crCfgBtnF').addEventListener('click',function(){fechaCrFull();crEl('crCfgBtn').click();crEl('crCfgBox').scrollIntoView({block:'center'});});" +
      "crEl('crMetaBtnF').addEventListener('click',function(){fechaCrFull();crEl('crMetaBtn').click();crEl('crMetaBox').scrollIntoView({block:'center'});});" +
      "crEl('crMapBtnF').addEventListener('click',function(){cr.pagF=cr.pagF===1?0:1;espelhaCr();try{desenhaRota();}catch(e){}});" +
      // toque troca a métrica gigante; deslizar pro lado também (bolinhas mostram onde está)
      "crEl('crPainelF').addEventListener('click',function(){if(Date.now()-(cr.swF||0)<600)return;cr.gigaF=((cr.gigaF||0)+1)%GIGAS.length;espelhaCr();});" +
      "var crSwX=null;crEl('crPainelF').addEventListener('touchstart',function(e){crSwX=e.touches[0].clientX;},{passive:true});" +
      "crEl('crPainelF').addEventListener('touchend',function(e){if(crSwX==null)return;var dx=e.changedTouches[0].clientX-crSwX;crSwX=null;" +
      "if(dx<-40)cr.gigaF=((cr.gigaF||0)+1)%GIGAS.length;else if(dx>40)cr.gigaF=((cr.gigaF||0)+GIGAS.length-1)%GIGAS.length;else return;cr.swF=Date.now();espelhaCr();},{passive:true});" +
      // cadeado: bloqueia a tela durante a corrida (suor e bolso não pausam nada);
      // destrava segurando o botão por 1 segundo
      "crEl('crLockBtnF').addEventListener('click',function(){cr.lockF=true;crEl('crLockOverF').style.display='flex';if(navigator.vibrate)navigator.vibrate(60);});" +
      "var crUnT=null,crUnB=crEl('crUnlockF');" +
      "function crSeg(){crUnB.textContent='Segurando\\u2026';crUnT=setTimeout(function(){cr.lockF=false;cr.swF=Date.now();crEl('crLockOverF').style.display='none';crUnB.textContent='Segure pra destravar';if(navigator.vibrate)navigator.vibrate(80);},1000);}" +
      "function crSolta(){if(crUnT){clearTimeout(crUnT);crUnT=null;}if(cr.lockF)crUnB.textContent='Segure pra destravar';}" +
      "crUnB.addEventListener('touchstart',function(e){e.preventDefault();crSeg();});crUnB.addEventListener('touchend',crSolta);crUnB.addEventListener('touchcancel',crSolta);" +
      "crUnB.addEventListener('mousedown',crSeg);crUnB.addEventListener('mouseup',crSolta);crUnB.addEventListener('mouseleave',crSolta);" +
      "crChips();pintaCr();pintaCrHist();desenhaRota();window.__cr=cr;window.__pintaCr=pintaCr;window.__crRota=desenhaRota;" +
      "}" +
      "var tmrI=null;function iniciaTmr(sg){var bar=document.getElementById('tmrBar');clearInterval(tmrI);var resta=sg;ligaTela();" +
      "bar.style.display='block';bar.textContent='Descanso: '+resta+'s';" +
      "tmrI=setInterval(function(){resta--;if(resta<=0){clearInterval(tmrI);bar.textContent='Bora! Próxima série!';" +
      "if(navigator.vibrate)navigator.vibrate([200,100,200]);bip(1300,300);setTimeout(function(){bar.style.display='none';},2200);}" +
      "else{bar.textContent='Descanso: '+resta+'s';if(resta<=3)bip(600,100);}},1000);}" +
      "pintaSets();" +
      // modo treino guiado: conduz série a série; a série 'feita' clica no setbtn
      // real do exercício, reaproveitando toda a lógica existente (dia completo etc.)
      // GUIA enriquecido DENTRO do builder: grupo, dica e recado do professor já
      // vêm em fichasApp, então o pacote do aluno não engorda nem um byte e
      // ninguém precisa republicar pra ganhar o player novo.
      "var GUIA=" + jsonApp((function () {
        var extra = (fichasApp || []).map(function (f) {
          return (f.itens || []).map(function (it) {
            return { g: it.grupo || "", dc: it.desc || "", ob: it.obs || "" };
          });
        });
        return (guiaFichasP || []).map(function (f, fi) {
          return { n: f.n, it: (f.it || []).map(function (it, ii) {
            var x = (extra[fi] || [])[ii] || {};
            return { e: it.e, s: it.s, r: it.r, d: it.d, v: it.v, g: x.g || "", dc: x.dc || "", ob: x.ob || "" };
          }) };
        });
      })()) + ";" +
      "function beepG(){try{var ac=new (window.AudioContext||window.webkitAudioContext)();var o=ac.createOscillator(),ga=ac.createGain();" +
      "o.connect(ga);ga.connect(ac.destination);o.frequency.value=880;ga.gain.value=.25;o.start();" +
      "setTimeout(function(){o.frequency.value=1320;},180);setTimeout(function(){o.stop();ac.close();},380);}catch(e){}}" +
      // gv.feitas guarda quantas séries de cada exercício já foram marcadas nesta
      // sessão do player (pra barra e pros blocos sobreviverem ao voltar exercício)
      "var gv={f:0,e:0,s:0,timer:null,pend:false,feitas:{},cargas:{},t0:0,tex:0,relo:null,sujo:false,fim:false};" +
      "function gEl(i){return document.getElementById(i);}" +
      "function g2(n){return (n<10?'0':'')+n;}" +
      "function gmmss(sg){sg=Math.max(0,Math.round(sg));return Math.floor(sg/60)+':'+g2(sg%60);}" +
      // o MESMO exercício pode estar em duas fichas com número de séries diferente
      // (abdômen na A e na B). Como ptsets_<hoje> é por NOME, pegar o botão errado
      // fazia o handler zerar o dia no "if(n>max)n=0" — casa o data-n com as séries
      // deste exercício e, no empate, fica com o primeiro.
      "function setbtnDe(ex,ns){var r=null;document.querySelectorAll('.setbtn').forEach(function(b){"+
      "if(b.dataset.ex.replace(/'/g,'')!==ex)return;"+
      "if(!r||(ns&&+b.dataset.n===+ns&&+r.dataset.n!==+ns))r=b;});return r;}" +
      // passo do stepper: quem levanta 5 kg não sobe de 5 em 5, quem levanta 80 não sobe de 1 em 1
      "function gpasso(v){return v<10?1:(v<40?2.5:5);}" +
      "function gnum(v){return String(Math.round(v*100)/100).replace('.',',');}" +
      "function gultimo(ex){var l=(L('ptdc',{})[ex]||[]);return l.length?l[l.length-1]:null;}" +
      "function grecorde(ex){var l=(L('ptdc',{})[ex]||[]);var m=0;l.forEach(function(x){if(+x.kg>m)m=+x.kg;});return m;}" +
      // ---------- gravação da carga: só grava o que o aluno CONFIRMOU ----------
      // O 'change' antigo perdia o registro quando o aluno saía sem tirar o foco,
      // e a guarda de valor igual fazia o aluno achar que salvou sem salvar.
      "function gGrava(ex,kg,reps,slot){if(!ex)return false;kg=+kg;if(!isFinite(kg)||kg<=0)return false;" +
      "var h=L('ptdc',{}),l=h[ex]||[],hj=isoHj();slot=slot||'';" +
      "var reg={d:hj,kg:kg,g:1};if(slot)reg.i=slot;if(+reps>0)reg.r=+reps;" +
      // um registro por dia por exercício NO CAMINHO DO PLAYER (g:1). O Diário
      // continua sendo append puro — lá o aluno anota quantas linhas quiser.
      "var i=-1;for(var k=l.length-1;k>=0;k--){if(l[k].d===hj&&l[k].g===1&&(l[k].i||'')===slot){i=k;break;}}" +
      "if(i>=0)l[i]=reg;else l.push(reg);" +
      "if(l.length>60)l.shift();h[ex]=l;Sv('ptdc',h);" +
      "if(typeof pintaDC==='function')try{pintaDC();}catch(e2){}" +
      "gv.cargas[ex]=kg;return true;}" +
      // gv.reg diz de QUEM é o formulário aberto: na repescagem o exercício não é
      // o gv.e, e sem isso a carga ia parar no exercício errado
      "function gSalvaSeSujo(){if(!gv.sujo)return;gv.sujo=false;" +
      "var c=gEl('gKg'),r=gEl('gReps');if(!c||!gv.reg)return;" +
      "gGrava(gv.reg,parseFloat(String(c.value).replace(',','.')),r?parseFloat(r.value):0,gv.regi);}" +
      // ---------- abrir / fechar ----------
      "function abreGuia(fi,ei){var f=GUIA[fi];if(!f||!f.it.length)return;clearInterval(gv.timer);clearInterval(gv.relo);" +
      "gv={f:fi,e:Math.min(+ei||0,f.it.length-1),s:0,timer:null,pend:false,feitas:{},cargas:{},t0:Date.now(),tex:Date.now(),relo:null,sujo:false,fim:false};" +
      "ligaTela();gEl('guiaBox').style.display='flex';document.body.style.overflow='hidden';" +
      "gEl('gCard').classList.remove('recibo');" +
      "gEl('gVoltaEx').style.display='';gEl('gPularEx').style.display='';" +
      "gEl('gPe').innerHTML=\"<button class='prin' id='gSerie'>Série feita ✓</button>\"+" +
      "\"<button class='sec' id='gPular' style='display:none;'>Pular descanso</button>\"+" +
      "\"<button class='sec mais' id='gMais15' style='display:none;'>+15 s</button>\";" +
      "gv.relo=setInterval(gTicRelo,1000);gTicRelo();pintaGuia();}" +
      "function fechaGuia(){gSalvaSeSujo();clearInterval(gv.timer);clearInterval(gv.relo);" +
      "var vb=gEl('gVideo');if(vb){var bx=vb.nextElementSibling;if(bx&&bx.classList.contains('vidbox')){bx.innerHTML='';bx.style.display='none';}}" +
      "gEl('guiaBox').style.display='none';document.body.style.overflow='';soltaTela();}" +
      "function gTicRelo(){var r=gEl('gRelo'),t=gEl('gReloTot');if(!r)return;" +
      "r.textContent=gmmss((Date.now()-gv.tex)/1000);" +
      "if(t)t.textContent='treino '+gmmss((Date.now()-gv.t0)/1000);}" +
      // ---------- barra segmentada (indicador de POSIÇÃO, não de 'feito') ----------
      "function pintaBarra(){var f=GUIA[gv.f],bx=gEl('gBarra');if(!bx)return;var n=f.it.length;" +
      "if(n>12){bx.innerHTML=\"<i class='past'><b style='width:\"+Math.round(100*(gv.e+1)/n)+\"%'></b></i>\";return;}" +
      "var h='';for(var i=0;i<n;i++){var cls=i<gv.e?' class=\"past\"':'';" +
      "var pc=i===gv.e?Math.round(100*Math.min(gv.s,f.it[i].s)/(f.it[i].s||1)):0;" +
      "h+='<i'+cls+'><b style=\"width:'+pc+'%\"></b></i>;'.replace(';','');}bx.innerHTML=h;}" +
      // ---------- pintura ----------
      "function gCabeca(){var f=GUIA[gv.f],n=f.it.length;" +
      /* Só a posição em números e o nome da ficha. O "exercício 3 de 7" dizia a
         MESMA coisa que o 03/07 logo acima e que a barra segmentada, e a marca
         d'água gigante dizia pela terceira vez. */
      "gEl('gProg').innerHTML='<b>'+g2(gv.e+1)+'</b> / '+g2(n)+\"<span>\"+esc2(f.n)+'</span>';" +
      "pintaBarra();}" +
      "function esc2(t){return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}" +
      "function gBlocos(mini){var f=GUIA[gv.f],it=f.it[gv.e],h='';" +
      "for(var i=1;i<=it.s;i++){var c=i<=gv.s?'ok':(i===gv.s+1?'now':'');" +
      "h+=\"<i class='\"+c+\"'>\"+(i<=gv.s?'✓':i)+'</i>';}" +
      "return \"<div class='gsets\"+(mini?' mini':'')+\"'>\"+h+'</div>';}" +
      "function gHistTxt(ex){var u=gultimo(ex),rc=grecorde(ex);" +
      "if(!u)return 'Primeira vez nesse exercício.';" +
      "return 'última vez '+gnum(u.kg)+' kg'+(+u.r>0?' × '+u.r:'')+(rc?' · recorde '+gnum(rc)+' kg':'');}" +
      "function pintaGuia(){var f=GUIA[gv.f],it=f.it[gv.e];if(!it)return;" +
      "gv.tex=gv.tex||Date.now();gCabeca();" +
      "gEl('gEstado').style.display='none';" +
      "var m='';" +
      "m+=gBlocos(false);" +
      "if(it.ob)m+=\"<div class='gobs'><em>Recado do professor</em><p>\"+esc2(it.ob)+'</p></div>';" +
      "if(it.dc)m+=\"<div class='gdica'>\"+esc2(it.dc)+'</div>';" +
      "gEl('gMiolo').innerHTML=m;gEl('gMiolo2').innerHTML='';gEl('gCard').classList.remove('compacto');gEl('guiaBox').classList.remove('reg');" +
      "gEl('gDescLab').style.display='none';gEl('gTrilhoCx').style.display='none';" +
      "gEl('gHist').textContent=gHistTxt(it.e);" +
      // demonstração: o GIF do banco aparece sozinho (é leve e mudo); o vídeo do
      // professor continua atrás do botão, porque tem som e pesa
      "var gg=gEl('gGif');if(gg){var gu=gifUrl(it.e);" +
      "gg.innerHTML=gu?\"<img src='\"+gu+\"' alt='' loading='lazy' onerror='this.parentNode.style.display=\\\"none\\\"'>\":'';" +
      "gg.style.display=gu?'block':'none';}" +
      "var gvd=gEl('gVideo');if(gvd){gvd.dataset.v=it.v||'';gvd.style.display=it.v?'inline-block':'none';gvd.textContent='Como fazer';" +
      "var gbx=gvd.nextElementSibling;if(gbx&&gbx.classList.contains('vidbox')){gbx.innerHTML='';gbx.style.display='none';}}" +
      "gEl('gGrupo').textContent=it.g||'';gEl('gGrupo').style.display=it.g?'block':'none';" +
      "gEl('gEx').textContent=it.e;" +
      "gEl('gMeta').innerHTML=\"<i class='forte'>\"+it.s+' × '+esc2(it.r||'?')+\"</i><i>\"+(it.d||60)+' s descanso</i>';" +
      "gEl('gReloLab').textContent='neste exercício';" +
      "gEl('gDesc').style.display='none';" +
      "gEl('gSerie').style.display='block';gEl('gSerie').textContent='Série feita ✓';" +
      "gEl('gPular').style.display='none';gEl('gMais15').style.display='none';" +
      "gEl('gCard').scrollTop=0;}" +
      // ---------- descanso ----------
      "function gFimDesc(){clearInterval(gv.timer);gSalvaSeSujo();" +
      "if(gv.pend){gv.feitas[gv.e]=gv.s;gv.e++;gv.s=0;gv.pend=false;gv.tex=Date.now();" +
      "if(gv.e>=GUIA[gv.f].it.length){gConclui();return;}}" +
      "pintaGuia();}" +
      "function gDescanso(sg,trocaEx){gv.pend=trocaEx;var resta=sg,tot=sg||1;" +
      "var f=GUIA[gv.f],it=f.it[gv.e];" +
      "var ge=gEl('gEstado');ge.style.display='inline-block';ge.textContent=trocaEx?'Exercício feito':'Descanso';pintaBarra();" +
      "var gg2=gEl('gGif');if(gg2&&trocaEx)gg2.style.display='none';" +
      "gEl('gSerie').style.display='none';" +
      "var pu=gEl('gPular');pu.style.display='block';pu.style.pointerEvents='none';pu.style.opacity='.55';" +
      "setTimeout(function(){pu.style.pointerEvents='';pu.style.opacity='';},700);" +
      "gEl('gMais15').style.display='block';" +
      // o #gDesc continua sendo SÓ o número (é o que o teste lê); rótulo, trilho
      // e prévia são irmãos dele dentro do card
      "gEl('gMiolo').innerHTML=gBlocos(true);" +
      "var d=gEl('gDesc');d.style.display='block';d.textContent=resta;" +
      "gEl('gDescLab').style.display='block';gEl('gTrilhoCx').style.display='block';gEl('gTrilho').style.width='100%';" +
      "gEl('gCard').classList.toggle('compacto',!!trocaEx);" +
      "gEl('guiaBox').classList.toggle('reg',!!trocaEx);" +
      "gEl('gMiolo2').innerHTML=trocaEx?gCargaHtml(it):'';" +
      "if(trocaEx)ligaStepper(it,gv.f+':'+gv.e);" +
      "clearInterval(gv.timer);" +
      "gv.mais=0;" +
      "gv.timer=setInterval(function(){resta--;" +
      "if(gv.mais){resta+=gv.mais;tot+=gv.mais;gv.mais=0;}" +
      "var tr=gEl('gTrilho');if(tr)tr.style.width=Math.max(0,Math.round(100*resta/tot))+'%';" +
      "if(resta<=0){beepG();if(navigator.vibrate)navigator.vibrate([200,100,200]);gFimDesc();return;}" +
      "d.textContent=resta;if(resta<=3)bip(600,100);},1000);}" +
      // ---------- registro da carga (steppers, sem teclado obrigatório) ----------
      "function gCargaHtml(it){var u=gultimo(it.e);var v=u?+u.kg:0;var r=u&&+u.r>0?+u.r:'';" +
      "return \"<div class='gcg'><div class='gcglab' id='gCgLab'>Carga de hoje</div>\"+" +
      "\"<div class='gstep'><button type='button' id='gMenos' aria-label='Diminuir a carga'>−</button>\"+" +
      "\"<input id='gKg' inputmode='decimal' value='\"+(v?gnum(v):'')+\"' placeholder='0' aria-label='Carga em quilos'><u>kg</u>\"+" +
      "\"<button type='button' id='gMaisKg' aria-label='Aumentar a carga'>+</button></div>\"+" +
      "\"<div class='gstep rep'><button type='button' id='gRepMenos' aria-label='Diminuir as repetições'>−</button>\"+" +
      "\"<input id='gReps' inputmode='numeric' value='\"+r+\"' placeholder='—' aria-label='Repetições'><u>reps</u>\"+" +
      "\"<button type='button' id='gRepMais' aria-label='Aumentar as repetições'>+</button></div>\"+" +
      "\"<button type='button' class='gsalvar' id='gSalvar'>Salvar carga</button>\"+" +
      "\"<button type='button' class='gsemcarga' id='gSemCarga'>Foi sem carga (peso do corpo)</button></div>\";}" +
      "function ligaStepper(it,slot){var kg=gEl('gKg'),rp=gEl('gReps');if(!kg)return;gv.reg=it.e;gv.regi=slot||'';" +
      "function passo(dir){var v=parseFloat(String(kg.value).replace(',','.'))||0;var p=gpasso(v||10);" +
      "v=Math.max(0,Math.round((v+dir*p)*100)/100);kg.value=v?gnum(v):'';gv.sujo=true;}" +
      "gEl('gMenos').onclick=function(){passo(-1);};gEl('gMaisKg').onclick=function(){passo(1);};" +
      "gEl('gRepMenos').onclick=function(){rp.value=Math.max(0,(parseInt(rp.value,10)||0)-1)||'';gv.sujo=true;};" +
      "gEl('gRepMais').onclick=function(){rp.value=(parseInt(rp.value,10)||0)+1;gv.sujo=true;};" +
      "kg.oninput=function(){gv.sujo=true;};rp.oninput=function(){gv.sujo=true;};" +
      "gEl('gSalvar').onclick=function(){gv.sujo=false;" +
      "var ok=gGrava(it.e,parseFloat(String(kg.value).replace(',','.')),parseInt(rp.value,10)||0,gv.regi);" +
      "var lab=gEl('gCgLab');if(!lab)return;" +
      "if(!ok){lab.textContent='Digite a carga primeiro';return;}" +
      "lab.textContent='Anotado ✓';lab.style.color='#16a34a';" +
      "var h2=gEl('gHist');if(h2)h2.textContent=gHistTxt(it.e);" +
      "if(navigator.vibrate)navigator.vibrate(60);" +
      "setTimeout(function(){if(gEl('gCgLab')===lab){lab.textContent='Carga de hoje';lab.style.color='';}},1600);};" +
      "gEl('gSemCarga').onclick=function(){gv.sujo=false;gv.cargas[it.e]='corpo';" +
      "var lab=gEl('gCgLab');if(lab){lab.textContent='Sem carga ✓';lab.style.color='#16a34a';}};}" +
      // ---------- fim do treino: recibo, repescagem e RPE ----------
      "function gConclui(){clearInterval(gv.timer);clearInterval(gv.relo);gSalvaSeSujo();gv.fim=true;gv.reg='';gv.regi='';soltaTela();" +
      "var f=GUIA[gv.f];gv.feitas[gv.e]=Math.max(gv.feitas[gv.e]||0,gv.s);" +
      // o recibo conta o DIA, nao so o que passou pelo player: quem marcou series
      // pela ficha (ptsets_<hoje>, a fonte de verdade do dia) ou entrou pelo
      // Iniciar exercicio no meio via 3 de 10 num treino que o app ja deu por feito
      "var hjR=isoHj(),stR=L('ptsets_'+hjR,{}),dcR=L('ptdc',{});" +
      "var marc=0,pres=0,anot=0,faltam=[];" +
      "f.it.forEach(function(it,i){pres+=it.s;" +
      "marc+=Math.min(Math.max(gv.feitas[i]||0,stR[it.e]||0),it.s);" +
      "var temC=gv.cargas[it.e]||(dcR[it.e]||[]).some(function(x){return x.d===hjR;});" +
      "if(temC)anot++;else faltam.push({i:i,e:it.e});});" +
      "var gec=gEl('gEstado');gec.style.display='inline-block';gec.textContent='Treino de hoje';" +
      "var gg3=gEl('gGif');if(gg3)gg3.style.display='none';" +
      "gEl('gBarra').innerHTML=f.it.map(function(){return \"<i class='past'></i>\";}).join('');" +
      "gEl('gProg').innerHTML='<b>'+g2(f.it.length)+'</b> / '+g2(f.it.length)+\"<span>\"+esc2(f.n)+'</span>';" +
      "gEl('gCard').classList.add('recibo');" +
      "gEl('gVoltaEx').style.display='none';gEl('gPularEx').style.display='none';" +
      "var vb=gEl('gVideo');if(vb){vb.style.display='none';var bx=vb.nextElementSibling;" +
      "if(bx&&bx.classList.contains('vidbox')){bx.innerHTML='';bx.style.display='none';}}" +
      "var m=\"<div class='gdica' style='margin-top:14px;font-size:15px;color:#1d1729;font-weight:700;'>\"+" +
      "'Séries feitas aqui · '+marc+' de '+pres+\"<br>Cargas anotadas · \"+anot+' de '+f.it.length+" +
      "'<br>Tempo de treino · '+gmmss((Date.now()-gv.t0)/1000)+'</div>';" +
      "if(faltam.length)m+=\"<div class='gcglab' style='margin-top:16px;'>Faltou anotar \"+faltam.length+(faltam.length>1?' cargas':' carga')+'</div>'+" +
      "faltam.map(function(x){return \"<button type='button' class='gfalta' data-gfalta='\"+x.i+\"'>\"+esc2(x.e)+' ›</button>';}).join('');" +
      "gEl('gMiolo').innerHTML=m;gEl('gMiolo2').innerHTML='';gEl('gHist').textContent='';gEl('gCard').classList.remove('compacto');gEl('guiaBox').classList.remove('reg');" +
      "gEl('gDescLab').style.display='none';gEl('gTrilhoCx').style.display='none';" +
      "gEl('gGrupo').style.display='none';" +
      "gEl('gEx').textContent='Treino concluído!';" +
      "gEl('gMeta').innerHTML=\"<i>Mandou bem demais. Alonga, hidrata e até a próxima.</i>\";" +
      "gEl('gReloLab').textContent='de treino';gEl('gRelo').textContent=gmmss((Date.now()-gv.t0)/1000);" +
      "gEl('gReloTot').textContent='';" +
      "gEl('gDesc').style.display='none';" +
      // os botões do rodapé podem já ter sido trocados (caminho 'Terminar treino'):
      // ler .style de um id que não existe mais derrubava o fim do treino
      "gEl('gPe').innerHTML=\"<button class='prin' id='gFim'>Fechar</button>\";" +
      "gEl('gCard').scrollTop=0;" +
      "if(navigator.vibrate)navigator.vibrate([100,60,100,60,300]);beepG();" +
      "if(typeof confete==='function')try{confete();}catch(e3){}}" +
      // repescagem: abre o registro daquele exercício sem sair da tela final
      "function gRepesca(i){var it=GUIA[gv.f].it[i];if(!it)return;" +
      "var gea=gEl('gEstado');gea.style.display='inline-block';gea.textContent='Anotar carga';gEl('gEx').textContent=it.e;" +
      "gEl('gGrupo').textContent=it.g||'';gEl('gGrupo').style.display=it.g?'block':'none';" +
      "gEl('gMiolo').innerHTML='';gEl('gMiolo2').innerHTML=gCargaHtml(it);gEl('gHist').textContent=gHistTxt(it.e);" +
      "ligaStepper(it,gv.f+':'+i);" +
      "gEl('gPe').innerHTML=\"<button class='sec' id='gVoltaFim'>Voltar pro resumo</button>\";" +
      "gEl('gCard').scrollTop=0;}" +
      // ---------- cliques ----------
      "document.addEventListener('click',function(e){" +
      "var gb=e.target.closest('.guiabtn');if(gb){abreGuia(+gb.dataset.g,0);return;}" +
      "var gi2=e.target.closest('.inibtn');if(gi2){abreGuia(+gi2.dataset.g,+gi2.dataset.e);return;}" +
      "var gf=e.target.closest('[data-gfalta]');if(gf){gRepesca(+gf.dataset.gfalta);return;}" +
      "if(e.target.id==='gVoltaFim'){gConclui();return;}" +
      "if(e.target.id==='gFim'||e.target.id==='gFechar'){fechaGuia();return;}" +
      "if(e.target.id==='gPular'){gFimDesc();return;}" +
      "if(e.target.id==='gMais15'){gv.mais=(gv.mais||0)+15;return;}" +
      "if(e.target.id==='gVoltaEx'){if(gv.fim||gv.e<=0)return;" +
      "gSalvaSeSujo();clearInterval(gv.timer);" +
      // no 'Terminar treino' o rodapé virou um botão só e o gSerie sumiu: sem
      // remontar, o pintaGuia estoura no gSerie e o ‹ fica morto na tela
      "if(!gEl('gSerie'))gEl('gPe').innerHTML=\"<button class='prin' id='gSerie'>Série feita ✓</button>\"+" +
      "\"<button class='sec' id='gPular' style='display:none;'>Pular descanso</button>\"+" +
      "\"<button class='sec mais' id='gMais15' style='display:none;'>+15 s</button>\";" +
      "gv.feitas[gv.e]=gv.s;gv.e--;gv.s=gv.feitas[gv.e]||0;gv.pend=false;gv.tex=Date.now();pintaGuia();return;}" +
      "if(e.target.id==='gPularEx'){if(gv.fim)return;gSalvaSeSujo();clearInterval(gv.timer);gv.mais=0;" +
      "gv.feitas[gv.e]=gv.s;gv.e++;gv.s=0;gv.pend=false;gv.tex=Date.now();" +
      "if(gv.e>=GUIA[gv.f].it.length){gConclui();}else{pintaGuia();}return;}" +
      "if(e.target.id==='gSerie'){var it=GUIA[gv.f].it[gv.e];gv.s++;gv.feitas[gv.e]=gv.s;" +
      "var sb=setbtnDe(it.e,it.s);var st2=L('ptsets_'+isoHj(),{});" +
      "if(sb&&(st2[sb.dataset.ex]||0)<it.s)sb.click();" +
      "var fimEx=gv.s>=it.s;" +
      // último exercício da ficha: não faz sentido descansar pro nada, mas a carga
      // não pode escapar — mostra o registro SEM contagem e com o botão de encerrar
      "if(fimEx&&gv.e>=GUIA[gv.f].it.length-1){clearInterval(gv.timer);gv.pend=false;" +
      "pintaBarra();var gef=gEl('gEstado');gef.style.display='inline-block';gef.textContent='Exercício feito';" +
      "gEl('gCard').classList.add('compacto');gEl('guiaBox').classList.add('reg');" +
      "gEl('gMiolo').innerHTML='';gEl('gDesc').style.display='none';" +
      "gEl('gDescLab').style.display='none';gEl('gTrilhoCx').style.display='none';" +
      "gEl('gMiolo2').innerHTML=gCargaHtml(it);ligaStepper(it,gv.f+':'+gv.e);gEl('gCard').scrollTop=0;" +
      "gEl('gVoltaEx').style.display='none';gEl('gPularEx').style.display='none';" +
      "gEl('gPe').innerHTML=\"<button class='prin' id='gFecharTreino'>Terminar treino</button>\";return;}" +
      "gDescanso(it.d,fimEx);return;}" +
      "if(e.target.id==='gFecharTreino'){clearInterval(gv.timer);gSalvaSeSujo();gConclui();return;}});" +
      // deslizar pro lado troca de exercício (o card rolando não conta)
      "(function(){var x0=0,y0=0,rol=false;var w=gEl('guiaBox');if(!w)return;" +
      "w.addEventListener('touchstart',function(ev){var t=ev.touches[0];x0=t.clientX;y0=t.clientY;" +
      "rol=!!(e2Alvo(ev.target));},{passive:true});" +
      "function e2Alvo(el){while(el&&el!==w){" +
      "if(el.id==='gKg'||el.id==='gReps'||el.className==='gstep'||el.className==='gstep rep')return true;" +
      "if(el.id==='gCard'&&el.scrollHeight>el.clientHeight+2)return true;el=el.parentElement;}return false;}" +
      "w.addEventListener('touchend',function(ev){if(gv.fim||rol)return;var t=ev.changedTouches[0];" +
      "var dx=t.clientX-x0,dy=t.clientY-y0;if(Math.abs(dx)<50||Math.abs(dx)<Math.abs(dy)*1.5)return;" +
      "var b=document.getElementById(dx<0?'gPularEx':'gVoltaEx');if(b)b.click();},{passive:true});})();" +
      // gráfico de carga por exercício (clique na linha do diário)
      "function grafCarga(ex){var h=L('ptdc',{});var l=(h[ex]||[]).slice(-12);var g=document.getElementById('dcGraf');" +
      "if(!l.length){g.style.display='none';return;}var max=0;l.forEach(function(x){if(+x.kg>max)max=+x.kg;});" +
      // recorde + evolução desde o 1º registro + 1RM estimado (fórmula de Epley, quando anota as reps)
      "var evo=l.length>1?Math.round(100*((+l[l.length-1].kg)-(+l[0].kg))/(+l[0].kg)):0;" +
      "var comReps=l.slice().reverse().find(function(x){return +x.r>0;});" +
      "var rm=comReps?Math.round((+comReps.kg)*(1+(+comReps.r)/30)):0;" +
      "g.style.display='block';g.innerHTML=\"<div style='display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px;font-size:12px;margin-bottom:6px;'><span style='color:#a9a4b5;'>\"+ex+\"</span><span><b style='color:var(--corc);'>recorde \"+String(max).replace('.',',')+\" kg</b>\"+(evo>0?\" · <b class='up'>+\"+evo+\"%</b> desde o 1º\":'')+(rm?\" · 1RM est. <b>\"+rm+\" kg</b>\":'')+\"</span></div>\"+" +
      "\"<div style='display:flex;gap:6px;align-items:flex-end;height:90px;'>\"+l.map(function(x){var hh=Math.round(60*(+x.kg)/max);var pr=+x.kg===max;" +
      "return \"<div style='flex:1;text-align:center;'><div style='font-size:10px;font-weight:800;color:\"+(pr?'var(--corc)':'#6e6a78')+\";'>\"+String(x.kg).replace('.',',')+(pr?'★':'')+\"</div><div style='height:\"+(60-hh)+\"px;'></div><div style='height:\"+hh+\"px;background:\"+(pr?'linear-gradient(180deg,var(--corc),var(--cor))':'var(--bg12)')+\";border-radius:4px 4px 0 0;min-height:3px;'></div><div style='font-size:9px;color:#6e6a78;margin-top:3px;'>\"+x.d.slice(8,10)+'/'+x.d.slice(5,7)+\"</div></div>\";}).join('')+\"</div>\";}" +
      "document.getElementById('dcLista').addEventListener('click',function(e){var r=e.target.closest('[data-dcx]');if(r)grafCarga(r.dataset.dcx);});" +
      // peso diário
      "function pintaPeso(){var pz=L('ptpeso',{});var ks=Object.keys(pz).sort();var g=document.getElementById('pzGraf');" +
      "if(!ks.length){return;}var l=ks.slice(-14);var vals=l.map(function(k){return +pz[k];});var max=Math.max.apply(null,vals),min=Math.min.apply(null,vals);var faixa=(max-min)||1;" +
      "var dif=Math.round((vals[vals.length-1]-(+pz[ks[0]]))*10)/10;" +
      "g.className='';g.innerHTML=\"<div style='display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;'><span>Hoje: <b>\"+String(vals[vals.length-1]).replace('.',',')+\" kg</b></span><span style='color:\"+(dif<0?'#4ade80':dif>0?'#f87171':'#a9a4b5')+\";font-weight:800;'>\"+(dif>0?'+':'')+String(dif).replace('.',',')+\" kg desde o início</span></div>\"+" +
      "\"<div style='display:flex;gap:4px;align-items:flex-end;height:70px;'>\"+l.map(function(k){var v=+pz[k];var hh=Math.round(14+46*(v-min)/faixa);" +
      "return \"<div style='flex:1;text-align:center;' title='\"+k+': '+v+\" kg'><div style='height:\"+(60-hh)+\"px;'></div><div style='height:\"+hh+\"px;background:var(--bg12);border-radius:4px 4px 0 0;'></div><div style='font-size:8.5px;color:#6e6a78;margin-top:2px;'>\"+k.slice(8,10)+\"</div></div>\";}).join('')+\"</div>\";}" +
      "document.getElementById('pzAdd').addEventListener('click',function(){var v=parseFloat((document.getElementById('pzKg').value||'').replace(',','.'));" +
      "if(!v||v<20||v>400){alert('Confere o peso.');return;}var pz=L('ptpeso',{});pz[isoHj()]=v;Sv('ptpeso',pz);document.getElementById('pzKg').value='';pintaPeso();" +
      "var ck=document.getElementById('ckPeso');if(ck&&!ck.value)ck.value=String(v).replace('.',',');pintaMetaPeso();});" +
      "pintaPeso();" +
      // meta de peso: alvo definido pelo aluno vira barra de progresso
      "function pintaMetaPeso(){var box=document.getElementById('mpBarra');if(!box)return;var alvo=parseFloat(L('ptmetapeso',''));" +
      "var pz=L('ptpeso',{});var ks=Object.keys(pz).sort();" +
      "if(!alvo||!ks.length){box.innerHTML=alvo?\"<div class='vz' style='font-size:12px;'>Meta: \"+String(alvo).replace('.',',')+\" kg — registre o peso pra ver o progresso.</div>\":'';return;}" +
      "var ini=+pz[ks[0]],atual=+pz[ks[ks.length-1]];" +
      "var total=ini-alvo;var feito=ini-atual;var falta=Math.round((atual-alvo)*10)/10;" +
      "var pct=total!==0?Math.max(0,Math.min(100,Math.round(100*feito/total))):100;" +
      "var bateu=(total>=0&&atual<=alvo)||(total<0&&atual>=alvo);" +
      "box.innerHTML=\"<div style='display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px;'><span>Meta: <b>\"+String(alvo).replace('.',',')+\" kg</b></span><b style='color:\"+(bateu?'#4ade80':'var(--corc)')+\";'>\"+(bateu?'META BATIDA!':Math.abs(falta).toString().replace('.',',')+' kg pra chegar')+\"</b></div>\"+" +
      "\"<div style='height:10px;background:var(--bg4);border-radius:99px;overflow:hidden;'><div style='height:100%;width:\"+(bateu?100:pct)+\"%;background:linear-gradient(90deg,\"+(bateu?'#16a34a,#4ade80':'var(--cor),var(--corc)')+\");border-radius:99px;transition:width .5s;'></div></div>\";" +
      "if(bateu&&!L('ptmetaok','')){Sv('ptmetaok','1');confete();}}" +
      "document.getElementById('mpSalva').addEventListener('click',function(){var v=parseFloat((document.getElementById('mpAlvo').value||'').replace(',','.'));" +
      "if(!v||v<20||v>400){alert('Confere a meta.');return;}Sv('ptmetapeso',String(v));Sv('ptmetaok','');document.getElementById('mpAlvo').value='';pintaMetaPeso();});" +
      "(function(){var alvo=L('ptmetapeso','');if(alvo)document.getElementById('mpAlvo').placeholder='Meta atual: '+String(alvo).replace('.',',')+' kg';})();" +
      "pintaMetaPeso();" +
      // ---- utilidades: água com copinhos animados ----
      "function agCfg(){var c=L('ptaguaCfg',null)||{copos:8,ml:250};return c;}" +
      "function agN(){return +L('ptaguaN_'+isoHj(),0)||0;}" +
      "function pintaAgua(anima){var cfg=agCfg(),n=agN();var box=document.getElementById('agCopos');if(!box)return;" +
      "document.getElementById('agMetaSel').value=String(cfg.copos);document.getElementById('agMlSel').value=String(cfg.ml);" +
      "var html='';for(var i=0;i<cfg.copos;i++){var cheio=i<n;" +
      "html+=\"<div class='copo' data-ci='\"+i+\"' style='width:33px;height:44px;border:2px solid \"+(cheio?'#38bdf8':'var(--bg11)')+\";border-radius:5px 5px 11px 11px;position:relative;overflow:hidden;cursor:pointer;background:var(--bg4);\"+(anima&&i===n-1?'animation:copoPop .4s;':'')+\"'>\"+" +
      "\"<div style='position:absolute;left:0;right:0;bottom:0;height:\"+(cheio?'82%':'0')+\";background:linear-gradient(180deg,#7dd3fc,#0284c7);transition:height .35s;'></div></div>\";}" +
      "box.innerHTML=html;" +
      "var ml=n*cfg.ml;var falta=cfg.copos-n;" +
      "document.getElementById('agInfo').textContent=n>=cfg.copos?'Meta do dia batida — '+(ml/1000).toFixed(2).replace('.',',')+' L! Hábito Água marcado sozinho.':" +
      "n+' de '+cfg.copos+' copos ('+(ml>=1000?(ml/1000).toFixed(2).replace('.',',')+' L':ml+' ml')+') — faltam '+falta+'.';}" +
      "function agSalva(n){var cfg=agCfg();n=Math.max(0,Math.min(cfg.copos,n));Sv('ptaguaN_'+isoHj(),n);" +
      "if(n>=cfg.copos){var h=L('pthab',{});var dia=h[isoHj()]||{};if(!dia[0]){dia[0]=true;h[isoHj()]=dia;Sv('pthab',h);try{pintaHab();}catch(e){}confete();if(navigator.vibrate)navigator.vibrate([120,60,220]);}}" +
      "pintaAgua(true);}" +
      "document.getElementById('agMais').addEventListener('click',function(){agSalva(agN()+1);});" +
      "document.getElementById('agMenos').addEventListener('click',function(){agSalva(agN()-1);});" +
      "document.getElementById('agCopos').addEventListener('click',function(e){var c=e.target.closest('.copo');if(!c)return;var i=+c.dataset.ci;agSalva(agN()===i+1?i:i+1);});" +
      "[['agMetaSel','copos'],['agMlSel','ml']].forEach(function(par){document.getElementById(par[0]).addEventListener('change',function(){" +
      "var cfg=agCfg();cfg[par[1]]=+this.value;Sv('ptaguaCfg',cfg);pintaAgua(false);});});" +
      "pintaAgua(false);" +
      // lembrete de água: checa a cada minuto enquanto o app está aberto (8h-22h, para ao bater a meta)
      "document.getElementById('agLemSel').value=String(+L('ptaguaLem',0)||0);" +
      "document.getElementById('agLemSel').addEventListener('change',function(){Sv('ptaguaLem',+this.value);" +
      "if(+this.value&&'Notification'in window&&Notification.permission==='default')Notification.requestPermission();});" +
      "setInterval(function(){var iv=+L('ptaguaLem',0);if(!iv)return;var h=new Date().getHours();if(h<8||h>=22)return;" +
      "var cfg=agCfg();if(agN()>=cfg.copos)return;var ult=+L('ptaguaLemTs',0);if(Date.now()-ult<iv*60000)return;Sv('ptaguaLemTs',Date.now());" +
      "var txt='Hora da \\u00e1gua! '+agN()+' de '+cfg.copos+' copos at\\u00e9 agora.';" +
      "try{if('Notification'in window&&Notification.permission==='granted'&&navigator.serviceWorker)navigator.serviceWorker.ready.then(function(reg){reg.showNotification('TORQUE \\u2014 \\u00e1gua',{body:txt});}).catch(function(){});}catch(e){}" +
      "if(navigator.vibrate)navigator.vibrate([80,40,80]);" +
      "var t=document.createElement('div');t.style.cssText='position:fixed;top:16px;left:50%;transform:translateX(-50%);background:linear-gradient(90deg,#0284c7,#38bdf8);color:#fff;padding:12px 20px;border-radius:13px;font-weight:800;z-index:9;text-align:center;';" +
      "t.textContent=txt;document.body.appendChild(t);setTimeout(function(){t.remove();},4000);},60000);" +
      // ---- utilidades: cronômetro e timer avulsos ----
      "var UCT=[['crono','Cronômetro'],['timer','Timer'],['tabata','Tabata'],['emom','EMOM'],['amrap','AMRAP']];" +
      "var uc={tipo:'crono',run:false,iv:null,t0:0,acum:0,voltas:[],ultMin:-1,ultFase:'',ultCd:0};" +
      "function ucCd(resta){if(!uc.run)return;var cd=(resta<=3.05&&resta>0.05)?Math.ceil(resta):0;" +
      "if(cd&&cd!==uc.ultCd){bip(600,110);if(navigator.vibrate)navigator.vibrate(60);}uc.ultCd=cd;}" +
      "function ucEl(id){return document.getElementById(id);}" +
      "function ucFmt(s,dec){s=Math.max(0,s);var m=Math.floor(s/60),ss=Math.floor(s%60);" +
      "return m+':'+('0'+ss).slice(-2)+(dec?'.'+Math.floor((s%1)*10):'');}" +
      "function ucV(id,pd){var el=ucEl(id);var v=el?parseInt(el.value,10):NaN;return isNaN(v)||v<0?pd:v;}" +
      "function ucMontaCfg(){var c=ucEl('ucCfg');" +
      "function inp(id,rot,val){return \"<label style='flex:1;font-size:11px;color:#a9a4b5;'>\"+rot+\"<input id='\"+id+\"' type='number' inputmode='numeric' value='\"+val+\"' min='0' style='width:100%;margin-top:3px;text-align:center;'></label>\";}" +
      "var h='';if(uc.tipo==='timer')h=inp('ucMin','Minutos',5)+inp('ucSeg','Segundos',0);" +
      "else if(uc.tipo==='tabata')h=inp('ucRds','Rounds',8)+inp('ucTrab','Trabalho (s)',20)+inp('ucDesc','Descanso (s)',10);" +
      "else if(uc.tipo==='emom')h=inp('ucMin','Minutos',10);" +
      "else if(uc.tipo==='amrap')h=inp('ucMin','Minutos',12);" +
      "c.innerHTML=h;c.style.display=h?'flex':'none';" +
      "c.querySelectorAll('input').forEach(function(i2){i2.addEventListener('input',function(){if(!uc.run)ucPinta();});});}" +
      "function ucNomeTreino(){if(uc.tipo==='tabata')return 'Tabata '+ucV('ucRds',8)+'\\u00d7'+ucV('ucTrab',20)+'/'+ucV('ucDesc',10)+'s';" +
      "if(uc.tipo==='emom')return 'EMOM '+ucV('ucMin',10)+' min';if(uc.tipo==='amrap')return 'AMRAP '+ucV('ucMin',12)+' min';return '';}" +
      "function pintaUcHist(){var el=ucEl('ucHist');if(!el)return;var lst=(L('ptwodres',{}).livre)||[];" +
      "el.innerHTML=lst.length?'<b>Seus \\u00faltimos treinos livres:</b><br>'+lst.slice(-5).reverse().map(function(x){" +
      "return String(x.d).slice(8,10)+'/'+String(x.d).slice(5,7)+' \\u2014 '+String(x.n).replace(/[<>&]/g,'')+': '+String(x.r).replace(/[<>&]/g,'');}).join('<br>'):'';}" +
      "function ucFim(msg,festa){clearInterval(uc.iv);uc.iv=null;uc.run=false;uc.acum=0;uc.ultMin=-1;uc.ultFase='';soltaTela();" +
      "ucEl('ucGo').textContent='Iniciar';ucEl('ucTempo').textContent='FIM!';ucEl('ucFase').textContent=msg;" +
      "if(navigator.vibrate)navigator.vibrate([250,100,250,100,400]);bip(1300,350);if(festa)confete();" +
      "if(festa){var wr=L('ptwodres',{});var lst=wr.livre||[];" +
      "lst.push({d:isoHj(),n:ucNomeTreino(),r:msg,v:uc.tipo==='amrap'?uc.voltas.length:null});" +
      "if(lst.length>20)lst.shift();wr.livre=lst;Sv('ptwodres',wr);pintaUcHist();}}" +
      "function ucPinta(){var el2=uc.run?(Date.now()-uc.t0)/1000:uc.acum;" +
      "var tmp=ucEl('ucTempo'),fs=ucEl('ucFase'),inf=ucEl('ucInfo');" +
      "if(uc.tipo==='crono'){fs.textContent=uc.run?'Correndo':'Pronto?';fs.style.color='#a9a4b5';tmp.style.color='';tmp.textContent=ucFmt(el2,true);" +
      "inf.textContent=uc.voltas.length?uc.voltas.length+' volta(s) marcada(s)':'';return;}" +
      "if(uc.tipo==='timer'){var tot=60*ucV('ucMin',0)+ucV('ucSeg',0);var resta=tot-el2;" +
      "fs.textContent=uc.run?'Contando':'Pronto?';fs.style.color='#a9a4b5';tmp.style.color='';tmp.textContent=ucFmt(resta,false);inf.textContent='';" +
      "ucCd(resta);if(uc.run&&resta<=0)ucFim('FIM DO TIMER!',false);return;}" +
      "if(uc.tipo==='amrap'){var tot2=60*ucV('ucMin',12);var resta2=tot2-el2;" +
      "fs.textContent='AMRAP '+ucV('ucMin',12)+' MIN';fs.style.color='var(--corc)';tmp.style.color='';tmp.textContent=ucFmt(resta2,false);" +
      "inf.textContent=uc.voltas.length+' round'+(uc.voltas.length===1?'':'s')+' — toque em +1 round a cada volta completa';" +
      "ucCd(resta2);if(uc.run&&resta2<=0){var rd=uc.voltas.length;ucFim(rd+(rd===1?' ROUND!':' ROUNDS!'),true);}return;}" +
      "if(uc.tipo==='emom'){var mtot=Math.max(1,ucV('ucMin',10));if(uc.run&&el2>=mtot*60){ucFim('EMOM COMPLETO — '+mtot+' MIN!',true);return;}" +
      "var mAt=Math.floor(el2/60);fs.textContent='MINUTO '+Math.min(mAt+1,mtot)+' DE '+mtot;fs.style.color='var(--corc)';tmp.style.color='';" +
      "tmp.textContent=ucFmt(60-(el2%60),false);inf.textContent='Comece o exercício a cada virada de minuto';" +
      "ucCd(60-(el2%60));if(uc.run&&mAt!==uc.ultMin){uc.ultMin=mAt;if(mAt>0){if(navigator.vibrate)navigator.vibrate(180);bip(980,220);}}return;}" +
      "if(uc.tipo==='tabata'){var rds=Math.max(1,ucV('ucRds',8)),tr=Math.max(1,ucV('ucTrab',20)),de=Math.max(1,ucV('ucDesc',10));var cic=tr+de;" +
      "if(uc.run&&el2>=rds*cic){ucFim('TABATA COMPLETO — '+rds+' ROUNDS!',true);return;}" +
      "var rd2=Math.min(rds,Math.floor(el2/cic)+1);var pos=el2%cic;var trab=pos<tr;" +
      "fs.textContent=(trab?'TRABALHA':'DESCANSA')+' — ROUND '+rd2+' DE '+rds;fs.style.color=trab?'var(--corc)':'#22d3ee';" +
      "tmp.style.color=trab?'var(--corc)':'#22d3ee';tmp.textContent=ucFmt(trab?tr-pos:cic-pos,false);inf.textContent=tr+'s forte / '+de+'s de descanso';" +
      "ucCd(trab?tr-pos:cic-pos);" +
      "var f2=(trab?'T':'D')+rd2;if(uc.run&&f2!==uc.ultFase){uc.ultFase=f2;if(el2>0.3){if(navigator.vibrate)navigator.vibrate(trab?[90,50,90]:200);bip(trab?1100:600,200);}}return;}}" +
      "ucEl('ucTipos').innerHTML=UCT.map(function(u2){return \"<button type='button' class='ucTipo' data-uct='\"+u2[0]+\"' style='flex:1;min-width:58px;padding:8px 2px;border-radius:10px;font-size:11.5px;font-weight:800;cursor:pointer;'>\"+u2[1]+\"</button>\";}).join('');" +
      "function ucSel(t){uc.tipo=t;clearInterval(uc.iv);uc.iv=null;uc.run=false;uc.acum=0;uc.voltas=[];uc.ultMin=-1;uc.ultFase='';soltaTela();" +
      "ucEl('ucGo').textContent='Iniciar';ucEl('ucVoltas').textContent='';" +
      "document.querySelectorAll('.ucTipo').forEach(function(x){var on=x.dataset.uct===t;" +
      "x.style.background=on?'linear-gradient(135deg,var(--cor),var(--corc))':'var(--bg4)';x.style.border=on?'none':'1px solid var(--bg11)';x.style.color=on?'#fff':'#a9a4b5';});" +
      "var vb=ucEl('ucVolta');vb.style.display=(t==='crono'||t==='amrap')?'block':'none';vb.textContent=t==='amrap'?'+1 round':'Volta';" +
      "ucMontaCfg();ucPinta();}" +
      "document.querySelectorAll('.ucTipo').forEach(function(b2){b2.addEventListener('click',function(){if(uc.run)return;ucSel(this.dataset.uct);});});" +
      "ucEl('ucGo').addEventListener('click',function(){" +
      "if(uc.run){clearInterval(uc.iv);uc.iv=null;uc.run=false;uc.acum=(Date.now()-uc.t0)/1000;this.textContent='Continuar';soltaTela();return;}" +
      "if(ucEl('ucTempo').textContent==='FIM!'){uc.acum=0;uc.voltas=[];uc.ultMin=-1;uc.ultFase='';ucEl('ucVoltas').textContent='';}" +
      "uc.run=true;uc.t0=Date.now()-uc.acum*1000;this.textContent='Pausar';ligaTela();bip(880,110);" +
      "uc.iv=setInterval(ucPinta,100);ucPinta();});" +
      "ucEl('ucZera').addEventListener('click',function(){clearInterval(uc.iv);uc.iv=null;uc.run=false;uc.acum=0;uc.voltas=[];uc.ultMin=-1;uc.ultFase='';soltaTela();" +
      "ucEl('ucGo').textContent='Iniciar';ucEl('ucVoltas').textContent='';ucPinta();});" +
      "ucEl('ucVolta').addEventListener('click',function(){if(!uc.run)return;var el2=(Date.now()-uc.t0)/1000;" +
      "if(uc.tipo==='crono'){uc.voltas.push(el2);if(navigator.vibrate)navigator.vibrate(50);" +
      "ucEl('ucVoltas').innerHTML=uc.voltas.slice(-8).map(function(v2,i2){return 'Volta '+(i2+1)+': <b>'+ucFmt(v2,true)+'</b>';}).join(' · ');return;}" +
      "if(uc.tipo==='amrap'){uc.voltas.push(el2);if(navigator.vibrate)navigator.vibrate(80);bip(760,90);" +
      "var n2=uc.voltas.length;var ant=n2>1?uc.voltas[n2-2]:0;" +
      "ucEl('ucVoltas').innerHTML='<b>'+n2+'</b> round'+(n2===1?'':'s')+' — último em '+ucFmt(el2-ant,false);ucPinta();}});" +
      "ucSel('crono');pintaUcHist();" +
      // ---- utilidades: calculadora de 1RM (fórmula de Epley) ----
      "function pintaRm(){var kg=parseFloat((document.getElementById('rmKg').value||'').replace(',','.'));" +
      "var reps=parseInt(document.getElementById('rmReps').value,10);var out=document.getElementById('rmOut');" +
      "if(!kg||!reps||reps<1||reps>20){out.innerHTML='';return;}" +
      "var rm=reps===1?kg:kg*(1+reps/30);" +
      "out.innerHTML=\"<div style='text-align:center;font-size:15px;margin-bottom:8px;'>Seu 1RM estimado: <b style='color:var(--corc);font-size:22px;'>\"+(Math.round(rm*2)/2).toString().replace('.',',')+\" kg</b></div>\"+" +
      "[95,90,85,80,75,70,60].map(function(p){return \"<div class='kv'><span>\"+p+\"% (\"+(p>=90?'força':p>=75?'hipertrofia':'resistência')+\")</span><b>\"+(Math.round(rm*p/100*2)/2).toString().replace('.',',')+\" kg</b></div>\";}).join('');}" +
      "document.getElementById('rmKg').addEventListener('input',pintaRm);document.getElementById('rmReps').addEventListener('input',pintaRm);" +
      // ---- utilidades: calculadora de anilhas ----
      "function pintaAnilha(){var alvo=parseFloat((document.getElementById('anKg').value||'').replace(',','.'));" +
      "var barra=+document.getElementById('anBarra').value;var out=document.getElementById('anOut');" +
      "if(!alvo||alvo<=barra){out.innerHTML=alvo?\"<div class='vz'>O alvo precisa ser maior que a barra (\"+barra+\" kg).</div>\":'';return;}" +
      "var lado=(alvo-barra)/2;var resto=lado;var PL=[25,20,15,10,5,2.5,1.25];var usa=[];" +
      "PL.forEach(function(pl){var q=Math.floor(resto/pl+1e-9);if(q>0){usa.push([pl,q]);resto=Math.round((resto-q*pl)*100)/100;}});" +
      "var montado=barra+2*(lado-resto);" +
      "out.innerHTML=\"<div style='font-size:13px;margin-bottom:6px;'>Em CADA lado da barra:</div>\"+" +
      "\"<div style='display:flex;gap:6px;flex-wrap:wrap;'>\"+(usa.length?usa.map(function(u){return \"<span style='background:rgba(var(--cor-rgb),.18);border:1px solid var(--cor);border-radius:99px;padding:6px 13px;font-weight:800;font-size:13px;'>\"+u[1]+\"× \"+String(u[0]).replace('.',',')+\" kg</span>\";}).join(''):\"<span class='vz'>só a barra</span>\")+'</div>'+" +
      "(resto>0.01?\"<div class='vz' style='font-size:12px;'>Não fecha exato com anilhas padrão — mais próximo: <b>\"+montado.toString().replace('.',',')+\" kg</b> no total.</div>\":'');}" +
      "document.getElementById('anKg').addEventListener('input',pintaAnilha);document.getElementById('anBarra').addEventListener('change',pintaAnilha);" +
      // ---- utilidades: IMC ----
      "function pintaImc(){var kg=parseFloat((document.getElementById('imcKg').value||'').replace(',','.'));" +
      "var cm=parseInt(document.getElementById('imcCm').value,10);var out=document.getElementById('imcOut');" +
      "if(!kg||!cm||cm<100||cm>250){out.innerHTML='';return;}" +
      "var imc=kg/Math.pow(cm/100,2);var faixa=imc<18.5?['abaixo do peso','#fbbf24']:imc<25?['na faixa saudável','#4ade80']:imc<30?['sobrepeso','#fbbf24']:['acima do recomendado','#f87171'];" +
      "out.innerHTML=\"<div style='text-align:center;font-size:15px;'>IMC: <b style='font-size:24px;color:\"+faixa[1]+\";'>\"+imc.toFixed(1).replace('.',',')+\"</b><div style='font-size:13px;color:\"+faixa[1]+\";font-weight:700;'>\"+faixa[0]+\"</div></div>\";}" +
      "(function(){var pz=L('ptpeso',{});var ks=Object.keys(pz).sort();" +
      "if(ks.length)document.getElementById('imcKg').value=String(pz[ks[ks.length-1]]).replace('.',',');" +
      "if(ALTURA)document.getElementById('imcCm').value=ALTURA;pintaImc();})();" +
      "document.getElementById('imcKg').addEventListener('input',pintaImc);document.getElementById('imcCm').addEventListener('input',pintaImc);" +
      // hábitos diários com streak
      "var HABS=[[ICO.gota,'Água em dia'],[ICO.maca,'Alimentação no plano'],[ICO.lua,'Dormi 7h+'],[ICO.ativ,'Cardio / passos']];" +
      "function pintaHab(){var h=L('pthab',{});var hoje=h[isoHj()]||{};" +
      "document.getElementById('habBox').innerHTML=HABS.map(function(x,i){var on=!!hoje[i];" +
      "return \"<button data-hab='\"+i+\"' style='display:flex;align-items:center;gap:10px;background:\"+(on?'rgba(var(--cor-rgb),.22)':'var(--bg4)')+\";border:1px solid \"+(on?'var(--cor)':'var(--bg11)')+\";border-radius:16px;padding:11px 14px;color:#fff;font-family:inherit;font-size:14px;cursor:pointer;text-align:left;'><span style='line-height:0;flex:none;color:#a9a4b5;'>\"+icx(x[0],18)+\"</span>\"+x[1]+\"<span style='margin-left:auto;width:22px;height:22px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;flex:none;\"+(on?'background:rgba(var(--cor-rgb),.9);color:#fff;':'border:1.5px solid var(--bg12);color:transparent;')+\"'>✓</span></button>\";}).join('');" +
      "var streak=0;var d=new Date();" +
      "for(var i=0;i<90;i++){var iso=isoLoc(d);var dia=h[iso]||{};var n=0;HABS.forEach(function(_,j){if(dia[j])n++;});" +
      "if(n>=3)streak++;else if(iso!==isoHj())break;d.setDate(d.getDate()-1);}" +
      "document.getElementById('habStreak').innerHTML=streak?icx(ICO.chama,15)+' <b>'+streak+' dia(s) seguidos</b> com 3+ hábitos — constância é o segredo!':'Marque pelo menos 3 pra contar o dia.';}" +
      "document.getElementById('habBox').addEventListener('click',function(e){var b=e.target.closest('[data-hab]');if(!b)return;" +
      "var h=L('pthab',{});var hoje=h[isoHj()]||{};hoje[b.dataset.hab]=!hoje[b.dataset.hab];h[isoHj()]=hoje;Sv('pthab',h);pintaHab();});" +
      "pintaHab();" +
      // fotos de progresso (só no aparelho)
      "function pintaFotos(){var fs=L('ptfotos',[]);var box=document.getElementById('fotosBox');if(!fs.length)return;" +
      "var pri=fs[0],ult=fs[fs.length-1];box.className='';" +
      "if(fs.length>1){" +
      // comparador com slider: AGORA por baixo, ANTES recortada por cima — arrasta e vê a evolução
      "box.innerHTML=\"<div id='ftWrap' style='position:relative;border-radius:12px;overflow:hidden;'>\"+" +
      "\"<img src='\"+ult.img+\"' style='width:100%;display:block;'>\"+" +
      "\"<div id='ftCorte' style='position:absolute;top:0;left:0;bottom:0;overflow:hidden;width:50%;'><img id='ftImgAntes' src='\"+pri.img+\"' style='display:block;max-width:none;'></div>\"+" +
      "\"<div id='ftLinha' style='position:absolute;top:0;bottom:0;left:50%;width:2px;background:rgba(255,255,255,.85);box-shadow:0 0 8px rgba(0,0,0,.6);'></div>\"+" +
      "\"<span style='position:absolute;top:8px;left:8px;background:rgba(0,0,0,.55);color:#fff;font-size:10px;font-weight:800;letter-spacing:.08em;padding:3px 8px;border-radius:99px;'>ANTES · \"+pri.d.slice(8,10)+'/'+pri.d.slice(5,7)+\"</span>\"+" +
      "\"<span style='position:absolute;top:8px;right:8px;background:rgba(0,0,0,.55);color:#fff;font-size:10px;font-weight:800;letter-spacing:.08em;padding:3px 8px;border-radius:99px;'>AGORA · \"+ult.d.slice(8,10)+'/'+ult.d.slice(5,7)+\"</span></div>\"+" +
      "\"<input type='range' id='ftRange' min='0' max='100' value='50' style='width:100%;margin-top:8px;padding:0;border:none;background:transparent;' aria-label='Comparar antes e agora'>\"+" +
      "\"<div class='vz' style='font-size:11.5px;'>Arrasta pra comparar — \"+fs.length+\" foto(s) guardadas</div>\";" +
      "var wrap=document.getElementById('ftWrap');" +
      "var ajusta=function(){var ia=document.getElementById('ftImgAntes');if(ia&&wrap.clientWidth)ia.style.width=wrap.clientWidth+'px';};" +
      "setTimeout(ajusta,60);window.addEventListener('resize',ajusta);" +
      "document.getElementById('ftRange').addEventListener('input',function(){document.getElementById('ftCorte').style.width=this.value+'%';document.getElementById('ftLinha').style.left=this.value+'%';});" +
      "}else{" +
      "box.innerHTML=\"<div style='text-align:center;'><div style='font-size:10.5px;color:#a9a4b5;letter-spacing:.1em;margin-bottom:4px;'>ANTES · \"+pri.d.slice(8,10)+'/'+pri.d.slice(5,7)+\"</div><img src='\"+pri.img+\"' style='width:100%;border-radius:12px;'></div>\"+" +
      "\"<div class='vz' style='font-size:11.5px;'>Tire a próxima foto pra liberar o comparador antes × agora</div>\";}" +
      "var dias=Math.round((new Date()-new Date(ult.d))/864e5);" +
      "if(dias>=30)document.getElementById('fotoBtn').firstChild.textContent='Faz '+dias+' dias — hora da foto do mês! ';}" +
      "document.getElementById('fotoInput').addEventListener('change',function(){var f=this.files&&this.files[0];if(!f)return;" +
      "var img=new Image();var rd=new FileReader();rd.onload=function(){img.onload=function(){" +
      "var c=document.createElement('canvas');var esc2=480/Math.max(img.width,img.height);if(esc2>1)esc2=1;" +
      "c.width=Math.round(img.width*esc2);c.height=Math.round(img.height*esc2);" +
      "c.getContext('2d').drawImage(img,0,0,c.width,c.height);" +
      "var fs=L('ptfotos',[]);fs.push({d:isoHj(),img:c.toDataURL('image/jpeg',.68)});if(fs.length>12)fs.shift();" +
      "try{Sv('ptfotos',fs);}catch(e){alert('Memória de fotos cheia — apague fotos antigas do app.');return;}pintaFotos();};" +
      "img.src=rd.result;};rd.readAsDataURL(f);this.value='';});" +
      "pintaFotos();" +
      // chat aluno ↔ personal (+ robô de atendimento)
      "var BOT=" + jsonApp(botApp) + ";" +
      "function botHist(){return L('ptbotmsgs',[]);}" +
      "function botFala(tx){var h=botHist();h.push({de:'bot',texto:tx,criado:new Date().toISOString()});if(h.length>60)h.shift();Sv('ptbotmsgs',h);}" +
      "function pintaChat(msgs){var el=document.getElementById('chMsgs');var all=(msgs||[]).concat(botHist());" +
      "all.sort(function(a,b){return String(a.criado)<String(b.criado)?-1:1;});" +
      "if(!all.length){el.innerHTML=\"<div class='vz'>Manda a primeira mensagem!</div>\";return;}" +
      "el.innerHTML=all.map(function(m){var minha=m.de==='aluno'||m.de==='aluno-local';var bot=m.de==='bot';" +
      "return \"<div style='align-self:\"+(minha?'flex-end':'flex-start')+\";background:\"+(minha?'linear-gradient(135deg,var(--cor),var(--cor2))':(bot?'#241b36':'var(--bg4)'))+\";border:1px solid \"+(bot?'var(--cor)':'var(--bg11)')+\";border-radius:12px;padding:8px 12px;max-width:82%;font-size:13.5px;'>\"+(bot?\"<div style='font-size:10px;color:var(--corc);font-weight:800;margin-bottom:2px;'>assistente</div>\":'')+String(m.texto).replace(/</g,'&lt;')+\"<div style='font-size:10px;opacity:.6;margin-top:2px;'>\"+String(m.criado).slice(11,16)+\"</div></div>\";}).join('');" +
      "el.scrollTop=el.scrollHeight;" +
      "var ultP=null;all.forEach(function(m){if(m&&m.de&&m.de!=='aluno'&&m.de!=='aluno-local'&&m.de!=='bot')ultP=m.criado;});" +
      "if(window.__chatDot)window.__chatDot(ultP);}" +
      "function carregaChat(){if(!NUVEM){pintaChat(L('ptchat',[]));return;}" +
      "rpcApp('app_chat_lista',{t:TOKEN}).then(function(l){if(Array.isArray(l)){Sv('ptchat',l);pintaChat(l);}else{pintaChat(L('ptchat',[]));}});}" +
      "function pintaChips(){var el=document.getElementById('botChips');if(!BOT){el.style.display='none';return;}" +
      "el.innerHTML=BOT.ops.map(function(o,i){return \"<button data-bop='\"+i+\"' style='background:#241b36;border:1px solid var(--cor);color:var(--cor-cl1);border-radius:99px;padding:6px 13px;font-size:12px;font-family:inherit;cursor:pointer;'>\"+String(o.r).replace(/</g,'&lt;')+\"</button>\";}).join('');}" +
      "function botEscolhe(i){var o=BOT&&BOT.ops[i];if(!o)return;var h=botHist();h.push({de:'aluno-local',texto:o.r,criado:new Date().toISOString()});Sv('ptbotmsgs',h);" +
      "pintaChat(L('ptchat',[]));setTimeout(function(){botFala(o.t);pintaChat(L('ptchat',[]));},250);}" +
      "document.getElementById('botChips').addEventListener('click',function(e){var b=e.target.closest('[data-bop]');if(b)botEscolhe(+b.dataset.bop);});" +
      "if(BOT&&!botHist().length)botFala(BOT.oi);pintaChips();pintaChat(L('ptchat',[]));" +
      "document.getElementById('chEnvia').addEventListener('click',function(){" +
      "var inp=document.getElementById('chTexto');var tx=inp.value.trim();if(!tx)return;" +
      "if(BOT&&/^[0-9]{1,2}$/.test(tx)&&+tx>=1&&+tx<=BOT.ops.length){inp.value='';botEscolhe(+tx-1);return;}" +
      "if(NUVEM){var btn=this;btn.disabled=true;rpcApp('app_chat_envia',{t:TOKEN,p_texto:tx}).then(function(r){btn.disabled=false;" +
      "if(r&&r.ok){inp.value='';carregaChat();}else{alert('Não deu pra enviar agora — tenta de novo.');}});}" +
      "else{window.open('https://wa.me/'+(ZAPP?'55'+ZAPP:'')+'?text='+encodeURIComponent(tx),'_blank');inp.value='';}});" +
      "document.getElementById('chTexto').addEventListener('keydown',function(e){if(e.key==='Enter')document.getElementById('chEnvia').click();});" +
      "carregaChat();setInterval(function(){if(NUVEM)carregaChat();},30000);" +
      "var pca=document.getElementById('pixCopiaAluno');if(pca)pca.addEventListener('click',function(){" +
      "var ta=document.getElementById('pixAluno');ta.select();try{document.execCommand('copy');pca.textContent='Copiado! Cola no app do banco';}catch(e){}" +
      "setTimeout(function(){pca.textContent='Copiar Pix copia e cola';},2500);});" +
      // "Já paguei": avisa o personal pelo chat com 1 toque (1x por mês)
      "var jpB=document.getElementById('btnJaPaguei');if(jpB){" +
      "var jpMes=new Date().toISOString().slice(0,7);" +
      "if(L('ptpaguei','')===jpMes){jpB.style.display='none';document.getElementById('jaPagueiOk').style.display='block';}" +
      "jpB.addEventListener('click',function(){var nomes=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];" +
      "var msg='Acabei de pagar a mensalidade de '+nomes[new Date().getMonth()]+'! Pode confirmar quando der.';" +
      "var fim2=function(){Sv('ptpaguei',jpMes);jpB.style.display='none';document.getElementById('jaPagueiOk').style.display='block';if(navigator.vibrate)navigator.vibrate(90);};" +
      "if(NUVEM&&TOKEN){jpB.disabled=true;rpcApp('app_chat_envia',{t:TOKEN,p_texto:msg}).then(function(r){jpB.disabled=false;" +
      "if(r&&r.ok!==false){fim2();}else{alert('Não deu pra enviar agora — tenta de novo em instantes.');}}).catch(function(){jpB.disabled=false;alert('Sem conexão agora — tenta de novo em instantes.');});}" +
      "else{window.open('https://wa.me/'+(ZAPP?'55'+ZAPP:'')+'?text='+encodeURIComponent(msg),'_blank');fim2();}});}" +
      "var lgB=document.getElementById('lgSalva');if(lgB)lgB.addEventListener('click',function(){" +
      "var lg=document.getElementById('lgLogin').value.trim(),sn=document.getElementById('lgSenha').value;" +
      "if(lg.length<5||sn.length<6){alert('Preencha o login (e-mail ou celular) e uma senha de 6+ caracteres.');return;}" +
      "var b=this;b.disabled=true;rpcApp('aluno_define_login',{t:TOKEN,p_login:lg,p_senha:sn}).then(function(r){b.disabled=false;" +
      "if(r&&r.ok){var ok2=document.getElementById('lgOk');ok2.style.display='block';ok2.textContent='Pronto! Agora você entra de qualquer aparelho com '+r.login+' + sua senha, na página Entrar do aluno.';document.getElementById('lgSenha').value='';}" +
      "else{alert((r&&r.erro)||'Não deu agora — confere a internet e tenta de novo.');}});});" +
      "var cnB=document.getElementById('cnSalva');if(cnB)cnB.addEventListener('click',function(){" +
      "var s1=document.getElementById('cnSenha').value,s2=document.getElementById('cnSenha2').value;" +
      "if(s1.length<6){alert('A senha precisa de pelo menos 6 caracteres.');return;}" +
      "if(s1!==s2){alert('As duas senhas estão diferentes — digite de novo.');return;}" +
      "var b=this;b.disabled=true;rpcApp('aluno_define_login',{t:TOKEN,p_login:MEULOGIN,p_senha:s1}).then(function(r){b.disabled=false;" +
      "if(r&&r.ok){var k=document.getElementById('cnOk');k.style.display='block';k.textContent='Senha trocada! Da próxima vez, entre com a senha nova.';" +
      "document.getElementById('cnSenha').value='';document.getElementById('cnSenha2').value='';}" +
      "else{alert((r&&r.erro)||'Não deu agora — confere a internet e tenta de novo.');}});});" +
      "var cnS=document.getElementById('cnSair');if(cnS)cnS.addEventListener('click',function(){" +
      "if(!confirm('Sair do app neste aparelho? Seus treinos e registros continuam guardados — é só entrar de novo.'))return;" +
      "try{['tq_app_token','tq_app_html','tq_app_pacote','tq_app_stamp','mt_aluno_token'].forEach(function(k){localStorage.removeItem(k);});}catch(e){}" +
      "location.href='/aluno-login.html?sair=1';});" +
      "function pintaDC(){var h=L('ptdc',{});var ks=Object.keys(h);var el=document.getElementById('dcLista');if(!ks.length)return;" +
      "el.className='';el.innerHTML=ks.map(function(k){var l=h[k];var max=0;l.forEach(function(x){if(+x.kg>max)max=+x.kg;});" +
      "return \"<div class='kv' data-dcx='\"+k+\"' style='cursor:pointer;'><span>\"+k+\"</span><span><b>\"+String(max).replace('.',',')+\" kg</b> <small style='color:#a9a4b5'>(\"+l.length+\")</small></span></div>\";}).join('');}" +
      "document.getElementById('dcAdd').addEventListener('click',function(){" +
      "var ex=document.getElementById('dcEx').value.trim(),kg=parseFloat(document.getElementById('dcKg').value.replace(',','.'));" +
      "var reps=parseInt(document.getElementById('dcReps').value,10)||0;" +
      "if(!ex||!kg){alert('Preencha exercício e carga.');return;}" +
      "var h=L('ptdc',{});var l=h[ex]||[];var max=0;l.forEach(function(x){if(+x.kg>max)max=+x.kg;});" +
      "l.push({d:isoHj(),kg:kg,r:reps>0&&reps<100?reps:0});if(l.length>60)l.shift();h[ex]=l;Sv('ptdc',h);" +
      "document.getElementById('dcReps').value='';" +
      "if(max>0&&kg>max){if(navigator.vibrate)navigator.vibrate([120,60,220]);confete();" +
      "var t=document.createElement('div');t.style.cssText='position:fixed;top:16px;left:50%;transform:translateX(-50%);background:linear-gradient(90deg,var(--cor),var(--corc));color:#fff;padding:13px 20px;border-radius:13px;font-weight:800;z-index:9;text-align:center;';" +
      "t.innerHTML=icx(ICO.estrela,20)+' NOVO RECORDE!<br><small>'+ex+': '+kg+' kg</small>';document.body.appendChild(t);setTimeout(function(){t.remove();},3500);}" +
      // progress\u00e3o sugerida (estilo Hevy): 3 registros seguidos na MESMA carga \u2192 hora de subir
      "else{var ult3=l.slice(-3);if(ult3.length===3&&ult3.every(function(x){return +x.kg===kg;})){" +
      "var sug=kg<20?1:2.5;var t2=document.createElement('div');" +
      "t2.style.cssText='position:fixed;top:16px;left:50%;transform:translateX(-50%);background:linear-gradient(90deg,#0891b2,#22d3ee);color:#fff;padding:13px 20px;border-radius:13px;font-weight:800;z-index:9;text-align:center;';" +
      "t2.innerHTML=icx(ICO.alta,20)+' 3 treinos em '+kg+' kg!<br><small>Bora tentar '+String(kg+sug).replace('.',',')+' kg no pr\u00f3ximo?</small>';" +
      "document.body.appendChild(t2);setTimeout(function(){t2.remove();},4500);window.__sugestaoProg=kg+sug;}}" +
      "document.getElementById('dcKg').value='';pintaDC();});pintaDC();" +
      "(function(){var el=document.getElementById('evoBox');if(!AVS.length){el.innerHTML=\"<div class='vz'>Suas avaliações físicas aparecem aqui quando o personal registrar.</div>\";return;}" +
      "function linha(rot,campo,inv){var com=AVS.filter(function(v){return v[campo]!=null;});if(com.length<1)return '';" +
      "var pri=com[0][campo],ult=com[com.length-1][campo];var d=Math.round((ult-pri)*10)/10;" +
      "var bom=inv?d>0:d<0;var seta=d?(\" <b class='\"+(bom?'up':'down')+\"'>\"+(d>0?'+':'')+String(d).replace('.',',')+\"</b>\"):'';" +
      "return \"<div class='kv'><span>\"+rot+\"</span><span><b>\"+String(ult).replace('.',',')+\"</b>\"+seta+\"</span></div>\";}" +
      "el.innerHTML=linha(icx(ICO.peso,13)+' Peso (kg)','peso')+linha(icx(ICO.pct,13)+' Gordura (%)','gordura')+linha(icx(ICO.regua,13)+' Cintura (cm)','cintura')+linha(icx(ICO.halter,13)+' Braço (cm)','braco',true)+" +
      "\"<div class='vz'>\"+AVS.length+\" avaliação(ões) · última em \"+AVS[AVS.length-1].data.split('-').reverse().join('/')+\"</div>\";})();" +
      // desafio em grupo: meus pontos + placar da turma
      ((st.desafio && st.desafio.nome && st.desafio.fim >= S.todayISO())
        ? "var DESAFIO=" + jsonApp({ ini: st.desafio.ini, fim: st.desafio.fim }) + ";" +
          "(function(){var f=L('ptfeitos',{});var meus=Object.keys(f).filter(function(k){return k>=DESAFIO.ini&&k<=DESAFIO.fim;}).length;" +
          "var el=document.getElementById('dsMeus');if(el)el.textContent=meus;" +
          "document.addEventListener('click',function(e){if(e.target&&e.target.id==='btnFeito')setTimeout(function(){" +
          "var f2=L('ptfeitos',{});var m2=Object.keys(f2).filter(function(k){return k>=DESAFIO.ini&&k<=DESAFIO.fim;}).length;" +
          "if(el)el.textContent=m2;},200);});" +
          "rpcApp('app_desafio_ranking',{t:TOKEN,p_ini:DESAFIO.ini,p_fim:DESAFIO.fim}).then(function(d){" +
          "var pl=document.getElementById('dsPlacar');if(!pl)return;" +
          "var rk=d&&d.ranking;if(!rk||!rk.length){pl.textContent='Placar aparece quando a turma começar a treinar.';return;}" +
          "var med=['1º','2º','3º'];pl.style.textAlign='left';" +
          "pl.innerHTML=rk.slice(0,5).map(function(r,i){return \"<div style='display:flex;justify-content:space-between;padding:4px 0;border-top:1px dashed var(--bg11);'>\"+" +
          "\"<span>\"+(med[i]||(i+1)+'º')+' '+(r.nome||'Aluno')+\"</span><b>\"+r.dias+\" treino(s)</b></div>\";}).join('');});})();"
        : "") +
      // ---------- Comunidade: feed da turma (posts, curtidas, comentários e ranking da semana) ----------
      (feedLigado
        ? "(function(){var lista=document.getElementById('fdLista');if(!lista)return;" +
          "var fotoNova='';var carregando=false;" +
          "function eh(s){return String(s==null?'':s).replace(/[&<>\"']/g,function(c){return '&#'+c.charCodeAt(0)+';';});}" +
          "function quando(iso){var d=new Date(iso);var m=Math.floor((Date.now()-d.getTime())/60000);" +
          "if(m<1)return'agora';if(m<60)return m+' min';var h=Math.floor(m/60);if(h<24)return h+' h';" +
          "var dd=Math.floor(h/24);if(dd<7)return dd+' d';return d.toLocaleDateString('pt-BR').slice(0,5);}" +
          "function iniciais(n){return String(n||'A').trim().split(/\\s+/).slice(0,2).map(function(p){return p.charAt(0).toUpperCase();}).join('');}" +
          "function stat(t){document.getElementById('fdStatus').textContent=t||'';}" +
          // sem nuvem o feed não tem como existir — avisa em vez de fingir que funciona
          "if(!NUVEM||!TOKEN){lista.innerHTML=\"<div class='vz'>A Comunidade precisa de internet e do app publicado pelo seu professor.</div>\";" +
          "document.getElementById('fdEnvia').disabled=true;return;}" +
          // ----- foto: comprime até caber no limite do servidor (400 KB de base64) -----
          "document.getElementById('fdFoto').addEventListener('change',function(){var f=this.files&&this.files[0];this.value='';if(!f)return;" +
          "stat('Preparando a foto…');var img=new Image();var rd=new FileReader();" +
          "rd.onload=function(){img.onload=function(){" +
          "var tentativas=[[900,.72],[720,.66],[560,.6],[440,.5]];var saiu='';" +
          "for(var i=0;i<tentativas.length;i++){var lado=tentativas[i][0],q=tentativas[i][1];" +
          "var c=document.createElement('canvas');var k=lado/Math.max(img.width,img.height);if(k>1)k=1;" +
          "c.width=Math.round(img.width*k);c.height=Math.round(img.height*k);" +
          "c.getContext('2d').drawImage(img,0,0,c.width,c.height);" +
          "saiu=c.toDataURL('image/jpeg',q);if(saiu.length<=380000)break;}" +
          "if(saiu.length>380000){stat('Essa foto é pesada demais — tenta outra.');return;}" +
          "fotoNova=saiu;document.getElementById('fdPrevImg').src=saiu;document.getElementById('fdPrev').style.display='block';stat('');};" +
          "img.onerror=function(){stat('Não consegui ler essa imagem.');};img.src=rd.result;};" +
          "rd.onerror=function(){stat('Não consegui ler essa imagem.');};rd.readAsDataURL(f);});" +
          "document.getElementById('fdTira').addEventListener('click',function(){fotoNova='';document.getElementById('fdPrev').style.display='none';});" +
          // ----- publicar -----
          "document.getElementById('fdEnvia').addEventListener('click',function(){" +
          "var tx=document.getElementById('fdTexto').value.trim();" +
          "if(!tx&&!fotoNova){stat('Escreva algo ou escolha uma foto.');return;}" +
          "var bt=this;bt.disabled=true;stat('Publicando…');" +
          // se treinou hoje, o post já sai marcado com o treino do dia
          "var trHoje='';try{if(L('ptfeitos',{})[isoHj()])trHoje=(FICHAS_META[0]&&FICHAS_META[0].t)?String(FICHAS_META[0].t).slice(0,80):'Treinou hoje';}catch(e){}" +
          "rpcApp('app_aluno_posta',{t:TOKEN,p_nome:PRIMEIRO,p_texto:tx,p_foto:fotoNova,p_treino:trHoje}).then(function(r){bt.disabled=false;" +
          "if(r&&r.ok){document.getElementById('fdTexto').value='';fotoNova='';document.getElementById('fdPrev').style.display='none';" +
          "stat('');if(navigator.vibrate)navigator.vibrate(60);carrega();return;}" +
          "var e=(r&&r.erro)||'';" +
          "stat(e==='limite_diario'?'Você já postou bastante hoje — volta amanhã!':e==='foto_grande'?'A foto ficou grande demais.':'Não deu pra publicar agora — tenta de novo.');});});" +
          // ----- curtir, comentar e apagar -----
          "lista.addEventListener('click',function(e){" +
          "var lk=e.target.closest('[data-fdlike]');" +
          "if(lk){var id=lk.getAttribute('data-fdlike');lk.disabled=true;" +
          "rpcApp('app_aluno_reage',{t:TOKEN,p_post:'feed:'+id,p_tipo:'like',p_nome:PRIMEIRO,p_texto:''}).then(function(){carrega();});" +
          "if(navigator.vibrate)navigator.vibrate(8);return;}" +
          "var cm=e.target.closest('[data-fdcom]');" +
          "if(cm){var idc=cm.getAttribute('data-fdcom');var inp=lista.querySelector(\"[data-fdinp='\"+idc+\"']\");" +
          "var tx2=(inp&&inp.value||'').trim();if(!tx2)return;cm.disabled=true;" +
          "rpcApp('app_aluno_reage',{t:TOKEN,p_post:'feed:'+idc,p_tipo:'coment',p_nome:PRIMEIRO,p_texto:tx2}).then(function(){carrega();});return;}" +
          "var ap=e.target.closest('[data-fdrm]');" +
          "if(ap){if(!confirm('Apagar este post?'))return;ap.disabled=true;" +
          "rpcApp('app_aluno_feed_apaga',{t:TOKEN,p_id:ap.getAttribute('data-fdrm')}).then(function(){carrega();});return;}});" +
          // ----- pintar -----
          "function pinta(posts){" +
          "if(!posts.length){lista.innerHTML=\"<div class='vz'>Ninguém postou ainda — seja o primeiro a mostrar o treino de hoje!</div>\";return;}" +
          "lista.innerHTML=posts.map(function(p){" +
          "return \"<div style='border-top:1px solid var(--bg11);padding:14px 0;'>\"+" +
          "\"<div style='display:flex;align-items:center;gap:10px;'>\"+" +
          "\"<div style='width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,var(--cor),var(--corc));color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex:none;'>\"+eh(iniciais(p.nome))+\"</div>\"+" +
          // o selo Nv vem do retorno do próprio autor (app_aluno.retorno.nivel,
          // via SQL novo do app_aluno_feed) — sem o SQL atualizado, só não aparece
          "\"<div style='min-width:0;'><b style='font-size:14px;'>\"+eh(p.nome||'Aluno')+\"</b>\"+" +
          "(+p.nivel>0?\"<span style='margin-left:7px;font-size:10px;font-weight:800;padding:1.5px 8px;border-radius:99px;background:rgba(255,255,255,.08);color:var(--corc);vertical-align:2px;'>Nv \"+(+p.nivel)+\"</span>\":'')+" +
          "\"<div style='font-size:11.5px;color:#8a8695;'>\"+quando(p.criado)+(p.treino?' · '+eh(p.treino):'')+\"</div></div>\"+" +
          "(p.meu?\"<button data-fdrm='\"+eh(p.id)+\"' aria-label='Apagar meu post' style='margin-left:auto;background:none;border:none;color:#8a8695;font-size:13px;cursor:pointer;font-family:inherit;'>apagar</button>\":'')+\"</div>\"+" +
          "(p.texto?\"<div style='font-size:14.5px;line-height:1.45;margin-top:9px;white-space:pre-wrap;'>\"+eh(p.texto)+\"</div>\":'')+" +
          "(p.foto?\"<img src='\"+eh(p.foto)+\"' alt='foto do post' loading='lazy' style='width:100%;border-radius:12px;margin-top:9px;display:block;'>\":'')+" +
          "\"<div style='display:flex;align-items:center;gap:12px;margin-top:9px;'>\"+" +
          "\"<button data-fdlike='\"+eh(p.id)+\"' aria-label='Curtir' style='background:none;border:none;cursor:pointer;font-family:inherit;font-size:13px;font-weight:700;padding:0;color:\"+(p.curti?'var(--corc)':'#8a8695')+\"'>\"+" +
          "\"<svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true' style='vertical-align:-3px;margin-right:4px;'><path d='M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3'/></svg>\"+(p.curtidas||0)+\"</button>\"+" +
          "\"<span style='font-size:12.5px;color:#8a8695;'>\"+(p.comentarios||[]).length+\" comentário(s)</span></div>\"+" +
          "((p.comentarios||[]).map(function(c){" +
          "return \"<div style='font-size:13px;margin-top:7px;padding-left:10px;border-left:2px solid var(--bg11);'><b>\"+eh(c.nome||'Aluno')+\"</b> \"+eh(c.texto)+\"</div>\";}).join(''))+" +
          "\"<div style='display:flex;gap:6px;margin-top:9px;'>\"+" +
          "\"<input data-fdinp='\"+eh(p.id)+\"' maxlength='400' placeholder='Escrever um comentário…' style='flex:1;min-width:0;background:var(--bg4);border:1px solid var(--bg11);border-radius:99px;padding:8px 12px;color:inherit;font-family:inherit;font-size:13px;'>\"+" +
          "\"<button data-fdcom='\"+eh(p.id)+\"' style='background:none;border:none;color:var(--corc);font-weight:800;font-size:13px;cursor:pointer;font-family:inherit;'>Enviar</button></div></div>\";}).join('');}" +
          // ----- ranking da semana (reusa o placar por dias treinados) -----
          "function segunda(){var d=new Date();var w=(d.getDay()+6)%7;d.setDate(d.getDate()-w);return d.toISOString().slice(0,10);}" +
          "function rankSemana(){var ini=segunda();var fim=isoHj();" +
          "rpcApp('app_desafio_ranking',{t:TOKEN,p_ini:ini,p_fim:fim}).then(function(d){" +
          "var el=document.getElementById('fdRank');if(!el)return;var rk=(d&&d.ranking)||[];" +
          "if(!rk.length){el.innerHTML='';return;}" +
          "el.innerHTML=\"<div style='background:var(--bg4);border:1px solid var(--bg11);border-radius:14px;padding:11px 13px;'>\"+" +
          "\"<div style='font-size:10px;font-weight:800;letter-spacing:.14em;color:#8a8695;text-transform:uppercase;margin-bottom:7px;'>Ranking da semana</div>\"+" +
          "rk.slice(0,5).map(function(r,i){return \"<div style='display:flex;justify-content:space-between;font-size:13.5px;padding:3px 0;'><span><b style='color:\"+(i<3?'var(--corc)':'#8a8695')+\";margin-right:6px;'>\"+(i+1)+'\\u00ba</b>'+eh(r.nome||'Aluno')+\"</span><b>\"+r.dias+\"</b></div>\";}).join('')+" +
          "\"<div style='font-size:11.5px;color:#8a8695;margin-top:6px;'>Conta os dias em que cada um marcou <b>Treinei hoje!</b></div></div>\";});}" +
          // ----- carrega (cache local primeiro, pra abrir rápido e aguentar offline) -----
          "function carrega(){if(carregando)return;carregando=true;" +
          "rpcApp('app_aluno_feed',{t:TOKEN,p_limite:30}).then(function(r){carregando=false;" +
          "if(r&&r.ok&&Array.isArray(r.posts)){try{Sv('ptfeed',r.posts);}catch(e){}pinta(r.posts);return;}" +
          "pinta(L('ptfeed',[]));}).catch(function(){carregando=false;pinta(L('ptfeed',[]));});}" +
          "pinta(L('ptfeed',[]));carrega();rankSemana();" +
          "setInterval(function(){if(SEC==='feed')carrega();},45000);})();"
        : "") +
      // questionário do personal: trancado até a data de liberação; respostas
      // vão pela RPC pública app_quest_responde e viram métricas no perfil
      (qa ? "var QUESTAPP=" + jsonApp({ nome: qa.nome || "Questionário", ps: qa.ps, desde: qa.desde || "", repete: !!qa.repete, env: qa.enviadoEm || "" }) + ";" +
        "(function(){var el=document.getElementById('qaBox');if(!el)return;" +
        "function eh(s){return String(s==null?'':s).replace(/[&<>\"']/g,function(c){return '&#'+c.charCodeAt(0)+';';});}" +
        "function isoAdd(iso,n){var p=iso.split('-');var d=new Date(+p[0],+p[1]-1,+p[2]+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}" +
        "function diaBr(iso){return iso.slice(8,10)+'/'+iso.slice(5,7);}" +
        "var hj=isoHj();var desde=/^\\d{4}-\\d{2}-\\d{2}$/.test(QUESTAPP.desde)?QUESTAPP.desde:hj;" +
        "var per=desde;if(QUESTAPP.repete&&hj>=desde){per=isoAdd(desde,Math.floor((new Date(hj)-new Date(desde))/6048e5)*7);}" +
        "var chave=(QUESTAPP.env||'')+'|'+per;var R={};" +
        "function pinta(){var resp=L('ptqa',{});el.style.textAlign='left';" +
        "if(hj<desde){el.innerHTML='Seu personal mandou esse questionário — ele libera dia <b>'+diaBr(desde)+'</b>. Volta aqui nesse dia!';return;}" +
        "if(resp[chave]){el.innerHTML='Respondido — seu personal já recebeu.'+(QUESTAPP.repete?' O próximo libera dia <b>'+diaBr(isoAdd(per,7))+'</b>.':'');return;}" +
        "el.className='';" +
        "el.innerHTML=QUESTAPP.ps.map(function(p,i){var h=\"<div style='margin:10px 0 6px;font-weight:700;font-size:14px;'>\"+eh(p.texto)+\"</div>\";" +
        "if(p.tipo==='emoji'){h+=\"<div style='display:flex;gap:6px;flex-wrap:wrap;'>\"+(p.ops||[]).map(function(o,j){return \"<button data-qa='\"+i+\"' data-j='\"+j+\"' style='flex:1;min-width:56px;background:var(--bg4);border:1px solid rgba(255,255,255,.06);border-radius:9px;color:#d6d2df;font-size:19px;padding:8px 4px;cursor:pointer;font-family:inherit;'>\"+eh(o.e)+\"<div style='font-size:9.5px;margin-top:2px;'>\"+eh(o.r)+\"</div></button>\";}).join('')+'</div>';}" +
        "else if(p.tipo==='linear'){h+=\"<div style='display:flex;gap:4px;flex-wrap:wrap;'>\";for(var n=0;n<=10;n++)h+=\"<button data-qa='\"+i+\"' data-v='\"+n+\"' style='flex:1;min-width:26px;background:var(--bg4);border:1px solid rgba(255,255,255,.06);border-radius:7px;color:#d6d2df;font-size:13px;padding:7px 0;cursor:pointer;font-family:inherit;'>\"+n+\"</button>\";h+='</div>';}" +
        "else{h+=\"<input data-qat='\"+i+\"' placeholder='Escreva aqui…' style='width:100%;'>\";}" +
        "return h;}).join('')+\"<button class='btnx' id='qaEnvia' style='width:100%;margin-top:12px;'>Enviar respostas</button>\";}" +
        "el.addEventListener('click',function(ev){var b=ev.target.closest&&ev.target.closest('button[data-qa]');if(!b)return;var i=+b.dataset.qa;var p=QUESTAPP.ps[i]||{};" +
        "if(b.dataset.j!=null){var o=(p.ops||[])[+b.dataset.j]||{};R[i]={r:o.r||o.e||'',p:+o.p||0};}else{R[i]={r:b.dataset.v,p:+b.dataset.v};}" +
        "el.querySelectorAll(\"button[data-qa='\"+i+\"']\").forEach(function(x){var on=x===b;x.style.background=on?'linear-gradient(135deg,var(--cor),var(--corc))':'var(--bg4)';x.style.borderColor=on?'var(--corc)':'var(--bg11)';x.style.color=on?'#fff':'#d6d2df';});});" +
        "el.addEventListener('click',function(ev){if(ev.target.id!=='qaEnvia')return;" +
        "var faltam=false;var lista=QUESTAPP.ps.map(function(p,i){" +
        "if(p.tipo!=='emoji'&&p.tipo!=='linear'){var inp=el.querySelector(\"input[data-qat='\"+i+\"']\");var v=inp?inp.value.trim():'';if(!v)faltam=true;return {sigla:p.s||'',pergunta:p.texto,resposta:v,pontos:null,menos:!!p.mm};}" +
        "if(!R[i]){faltam=true;return null;}return {sigla:p.s||'',pergunta:p.texto,resposta:R[i].r,pontos:R[i].p,menos:!!p.mm};});" +
        "if(faltam){alert('Responde todas as perguntas antes de enviar.');return;}" +
        "var total=0,temP=false;lista.forEach(function(x){if(x&&x.pontos!=null){total+=(x.menos?-x.pontos:x.pontos);temP=true;}});" +
        "var btn=ev.target;btn.disabled=true;btn.textContent='Enviando…';" +
        "var fim=function(){var resp=L('ptqa',{});resp[chave]=1;Sv('ptqa',resp);pinta();};" +
        "if(NUVEM){rpcApp('app_quest_responde',{t:TOKEN,p_nome:QUESTAPP.nome,p_dados:{respostas:lista,pontuacao:temP?total:null}}).then(function(r){" +
        "if(r&&r.ok){fim();}else{btn.disabled=false;btn.textContent='Enviar respostas';alert((r&&r.erro)||'Não deu pra enviar agora — confere a internet e tenta de novo.');}});}" +
        "else{var msg=QUESTAPP.nome+' — '+PRIMEIRO+'\\n'+lista.map(function(x){return (x.sigla?x.sigla+': ':'')+x.resposta;}).join('\\n');" +
        "window.open('https://wa.me/'+(ZAPP?'55'+ZAPP:'')+'?text='+encodeURIComponent(msg),'_blank');fim();}});" +
        "pinta();})();"
        : "") +
      // hero "treino de hoje" + progresso rápido + XP (estilo Prime)
      // a foto do card do dia: a da ficha manda; sem ela, entra a geral da Personalização
      // a foto geral vai UMA vez só: repetir a mesma imagem em cada ficha inchava
      // o app (6 fichas × 235 KB viravam 1,4 MB de dado repetido no download do aluno)
      (function () {
        var imgOk = function (u) { return /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(String(u || "")) ? u : ""; };
        var geral = imgOk((st.config || {}).capaTreino);
        return "var CAPA_GERAL=" + jsonApp(geral) + ";" +
          "var FICHAS_META=" + jsonApp((fichasApp || []).map(function (f) {
            var propria = imgOk(f.capa);
            return { t: f.titulo || "Ficha", n: f.itens.length, c: propria === geral ? "" : propria };
          })) + ";";
      })() +
      "function pintaHero(){var el=document.getElementById('heroTreino');if(!el||!FICHAS_META.length)return;" +
      "var tot=Object.keys(L('ptfeitos',{})).length;var i=tot%FICHAS_META.length;var fm=FICHAS_META[i];" +
      "var par=String(fm.t).split('—');var rt=par.length>1?('TREINO '+par[0].trim()):('FICHA '+(i+1));var tit=par.length>1?par.slice(1).join('—').trim():fm.t;" +
      "document.getElementById('htRot').textContent=rt;document.getElementById('htTitulo').textContent=tit;" +
      "document.getElementById('htSub').textContent=fm.n+' exercício(s) te esperando';" +
      // foto da ficha do dia no card (com véu por cima pro texto continuar legível)
      "var hf=document.getElementById('htFoto'),hv2=document.getElementById('htVeu');" +
      "var cImg=fm.c||CAPA_GERAL;" +
      "if(hf){if(cImg){hf.src=cImg;hf.style.display='block';hv2.style.display='block';}else{hf.removeAttribute('src');hf.style.display='none';hv2.style.display='none';}}" +
      // a ficha do dia já abre pronta na aba Treino; as outras ficam recolhidas
      "var gav=document.querySelectorAll('.fichabox');" +
      "if(gav.length>1)for(var g=0;g<gav.length;g++)gav[g].open=(+gav[g].dataset.fi===i);}" +
      "var hv=document.getElementById('htVer');if(hv)hv.addEventListener('click',function(){if(window.__trocaSec)window.__trocaSec('treino');});" +
      "function pintaProgresso(){var el=document.getElementById('pgTiles');if(!el)return;" +
      "var pz=L('ptpeso',{});var pks=Object.keys(pz).sort();var agora=new Date();var mesK=agora.getFullYear()+'-'+String(agora.getMonth()+1).padStart(2,'0');" +
      "var pf=L('ptfeitos',{});var noMes=Object.keys(pf).filter(function(k){return k.slice(0,7)===mesK;}).length;" +
      "function tile(rt,val,sub,cor){return \"<div style='background:none;padding:2px 0;'>\"+" +
      "\"<div style='font-size:9.5px;font-weight:800;letter-spacing:.12em;color:#8a8695;text-transform:uppercase;'>\"+rt+\"</div>\"+" +
      "\"<div style='font-size:30px;font-weight:800;letter-spacing:-.02em;margin-top:4px;'>\"+val+\"</div>\"+" +
      "\"<div style='font-size:11px;color:\"+(cor||'#a9a4b5')+\";'>\"+sub+\"</div></div>\";}" +
      "var t1;if(pks.length){var pUlt=+pz[pks[pks.length-1]];var pd=Math.round((pUlt-(+pz[pks[0]]))*10)/10;" +
      "t1=tile(icx(ICO.peso,13)+' Peso',String(pUlt).replace('.',',')+' kg',(pd>0?'+':'')+String(pd).replace('.',',')+' kg desde o início',pd<0?'#4ade80':pd>0?'#f87171':'#a9a4b5');}" +
      "else{t1=tile(icx(ICO.peso,13)+' Peso','—','registre na aba Evolução');}" +
      "el.innerHTML=t1+tile(icx(ICO.cal,13)+' Treinos no mês',noMes,Object.keys(pf).length+' no total');}" +
      // XP calculado dos DADOS (nunca do #xpNum — o count-up anima o texto)
      "function xpDados(){var pf=L('ptfeitos',{});var hb=L('pthab',{});var nh=0;Object.keys(hb).forEach(function(k){var dd=hb[k];if(dd&&typeof dd==='object')Object.keys(dd).forEach(function(j){if(dd[j])nh++;});});" +
      "var nq=Object.keys(L('ptqa',{})).length;return Object.keys(pf).length*10+nh*2+nq*20;}" +
      /* nível: o XP acumulado vira nível numa curva quadrática — chegar ao
       * nível n custa 50·(n−1)·n XP. Os primeiros vêm rápido (nível 2 com uma
       * semana de treino) e cada um seguinte custa mais, que é o padrão dos
       * apps de hábito que seguram o usuário no longo prazo. */
      "function nvXpAte(n){return 50*(n-1)*n;}" +
      "function nivelDe(xp){var n=1;while(50*n*(n+1)<=xp)n++;return n;}" +
      "var NV_TIT=[[25,'Hall da Fama'],[20,'Mito'],[15,'Lenda'],[12,'Imparável'],[10,'Elite'],[9,'Fera'],[8,'Máquina'],[7,'Casca-grossa'],[6,'Raiz'],[5,'Firme'],[4,'Constante'],[3,'No ritmo'],[2,'Aquecendo']];" +
      "function nvTitulo(n){for(var i=0;i<NV_TIT.length;i++)if(n>=NV_TIT[i][0])return NV_TIT[i][1];return 'Iniciante';}" +
      "function pintaNivel(){var xp=xpDados();var n=nivelDe(xp);var el=document.getElementById('nvNum');if(el)el.textContent=n;" +
      "var base=nvXpAte(n),alvo=nvXpAte(n+1);var pct=Math.max(0,Math.min(100,Math.round(100*(xp-base)/(alvo-base))));" +
      "var card=document.getElementById('nvCard');if(card){var C2=2*Math.PI*26;" +
      "card.innerHTML=\"<div style='display:flex;gap:14px;align-items:center;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:13px 14px;'>\"+" +
      "\"<svg width='64' height='64' viewBox='0 0 64 64' style='flex:none;'><circle cx='32' cy='32' r='26' fill='none' stroke='rgba(255,255,255,.09)' stroke-width='6'/>\"+" +
      "\"<circle cx='32' cy='32' r='26' fill='none' stroke='var(--cor)' stroke-width='6' stroke-linecap='round' stroke-dasharray='\"+(C2*pct/100).toFixed(1)+' '+C2.toFixed(1)+\"' transform='rotate(-90 32 32)'/>\"+" +
      "\"<text x='32' y='39' text-anchor='middle' font-size='20' font-weight='800' fill='currentColor'>\"+n+'</text></svg>'+" +
      "\"<div style='flex:1;min-width:0;'><div style='font-weight:800;font-size:15px;'>Nível \"+n+' — '+nvTitulo(n)+\"</div>\"+" +
      "\"<div style='height:7px;background:rgba(255,255,255,.08);border-radius:99px;overflow:hidden;margin-top:7px;'><div style='height:100%;width:\"+pct+\"%;background:linear-gradient(90deg,var(--cor),var(--corc));'></div></div>\"+" +
      "\"<div style='font-size:11.5px;color:#8a8695;margin-top:6px;'>\"+xp+' XP — faltam '+(alvo-xp)+' pro nível '+(n+1)+(nvTitulo(n+1)!==nvTitulo(n)?' ('+nvTitulo(n+1)+')':'')+'</div></div></div>'+" +
      "\"<div style='font-size:11px;color:#8a8695;margin-top:7px;text-align:center;'>treino +10 XP · hábito do dia +2 · check-in respondido +20</div>\";}" +
      // celebra só quando SOBE: a 1ª abertura apenas anota o nível atual,
      // senão todo mundo ganhava festa do nada na atualização
      "var visto=+L('ptnivelok',0)||0;" +
      "if(!visto){Sv('ptnivelok',n);}else if(n>visto){Sv('ptnivelok',n);" +
      "try{confete();if(navigator.vibrate)navigator.vibrate([120,60,120,60,260]);" +
      "var t=document.createElement('div');t.style.cssText='position:fixed;top:16px;left:50%;transform:translateX(-50%);background:linear-gradient(90deg,var(--cor),var(--corc));color:#fff;padding:13px 22px;border-radius:13px;font-weight:800;z-index:9;text-align:center;';" +
      "t.innerHTML='SUBIU DE NÍVEL!<br><small>Nível '+n+' — '+nvTitulo(n)+'</small>';" +
      "document.body.appendChild(t);setTimeout(function(){t.remove();},3500);}catch(e){}}}" +
      "function pintaXP(){var el=document.getElementById('xpNum');if(!el)return;el.textContent=xpDados();pintaNivel();}" +
      "pintaHero();pintaProgresso();pintaXP();" +
      // barra de abas embaixo: agrupa os cards em seções e controla a navegação
      // (ícones de traço em SVG — herdam a cor da aba via currentColor)
      "(function(){function ic(p){return \"<svg width='21' height='21' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'>\"+p+'</svg>';}" +
      "var MENU=[" +
      "['inicio',\"<path d='M3 10 12 3l9 7'/><path d='M5 8.8V21h14V8.8'/><path d='M9.5 21v-6h5v6'/>\",'Início']," +
      "['treino',\"<path d='M7 7v10M4 9v6M17 7v10M20 9v6M7 12h10'/>\",'Treino']," +
      "['evolucao',\"<polyline points='3 17 9 11 13 15 21 7'/><polyline points='15 7 21 7 21 13'/>\",'Evolução']," +
      // com o feed ligado a Comunidade vira a 4ª aba fixa (a Agenda vai pro menu ☰)
      "['feed',\"<circle cx='9' cy='8' r='3.4'/><path d='M2.8 20c0-3.4 2.8-6.2 6.2-6.2s6.2 2.8 6.2 6.2'/><path d='M16 5.2a3.4 3.4 0 0 1 0 6.4M17.5 14.2c2 1.1 3.4 3.2 3.4 5.8'/>\",'Turma']," +
      "['agenda',\"<rect x='3' y='5' width='18' height='16' rx='2'/><path d='M16 3v4M8 3v4M3 11h18'/>\",'Agenda']," +
      "['chat',\"<path d='M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'/>\",'Chat']," +
      "['util',\"<path d='M14.5 6.5a4.2 4.2 0 0 0-5.7 5.4L3 17.7 6.3 21l5.8-5.8a4.2 4.2 0 0 0 5.4-5.7l-2.8 2.8-2.4-.6-.6-2.4z'/>\",'Utilidades']," +
      "['pagamento',\"<rect x='2' y='5' width='20' height='14' rx='2'/><path d='M2 10h20'/>\",'Plano']," +
      // Ajustes fica por último de propósito: aparece na gaveta ☰, não nas abas de baixo
      "['ajustes',\"<circle cx='12' cy='12' r='3.2'/><path d='M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z'/>\",'Ajustes']];" +
      // áreas desligadas pelo professor nas Configurações somem do menu
      "var OCULTA=" + jsonApp(menuOculta) + ";MENU=MENU.filter(function(m){return OCULTA.indexOf(m[0])===-1;});" +
      "function secDe(el){var h=el.querySelector&&el.querySelector('h2');var t=(h?h.textContent:'')||'';var tx=el.textContent||'';" +
      "if(/Meu treino|Diário de cargas|Raio-X|Modo circuito/.test(t))return 'treino';" +
      "if(/Conquistas|Minha evolução|Meu peso|Fotos de progresso/.test(t))return 'evolucao';" +
      "if(/Agenda|Minhas sessões/.test(t))return 'agenda';" +
      "if(/Comunidade/.test(t))return 'feed';" +
      "if(/Check-in|Fale com/.test(t))return 'chat';" +
      "if(/Pagamento|Mensalidade|Meus pacotes/.test(t)||/copia e cola/.test(tx))return 'pagamento';" +
      "if(/Minha conta|Meu login|Lembretes/.test(t))return 'ajustes';" +
      "if(/Mural|Minha semana|Hábitos|Desafio/.test(t))return 'inicio';" +
      "return null;}" +
      "var IGNORA={navApp:1,tmrBar:1,guiaBox:1,fundoMenuApp:1,menuApp:1};" +
      "Array.prototype.slice.call(document.body.children).forEach(function(el){" +
      "if(el.tagName==='SCRIPT'||IGNORA[el.id]||(el.className||'').indexOf('topo')>=0)return;" +
      "if(el.id==='qaCard'){el.setAttribute('data-sec','chat');return;}" +
      "if(el.id==='trTabs'||el.id==='cardWod'||el.id==='cardCardio'){el.setAttribute('data-sec','treino');return;}" +
      "if(/^util/.test(String(el.id||''))){el.setAttribute('data-sec','util');return;}" +
      "var s=secDe(el);el.setAttribute('data-sec',s||'inicio');});" +
      "var temSec={};document.querySelectorAll('[data-sec]').forEach(function(el){temSec[el.getAttribute('data-sec')]=1;});" +
      "var itens=MENU.filter(function(m){return temSec[m[0]];});" +
      // 4 abas fixas embaixo + o menu de três traços no canto direito com TODAS as áreas
      "var fixos=itens.slice(0,4);" +
      "function btnNav(m){" +
      "return \"<button class='nitem' data-msec='\"+m[0]+\"' style='flex:1;min-width:0;background:none;border:none;cursor:pointer;font-family:inherit;color:#8a8695;display:flex;flex-direction:column;align-items:center;gap:3px;padding:7px 2px 5px;border-radius:9px;position:relative;'>\"+" +
      "\"<span style='line-height:0;'>\"+ic(m[1])+\"</span>\"+" +
      "\"<span style='font-size:8.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;white-space:nowrap;'>\"+m[2]+\"</span>\"+" +
      "(m[0]==='chat'?\"<span class='ndot' style='display:none;position:absolute;top:3px;right:50%;margin-right:-17px;width:9px;height:9px;border-radius:50%;background:#f87171;border:2px solid var(--bg0);'></span>\":'')+'</button>';}" +
      "var nav=document.getElementById('navApp');" +
      "nav.innerHTML=fixos.map(btnNav).join('')+" +
      "\"<button class='nitem' id='navMenuApp' aria-label='Abrir o menu com todas as áreas' style='flex:1;min-width:0;background:none;border:none;cursor:pointer;font-family:inherit;color:#8a8695;display:flex;flex-direction:column;align-items:center;gap:3px;padding:7px 2px 5px;border-radius:9px;position:relative;'>\"+" +
      "\"<span style='line-height:0;'>\"+ic(\"<path d='M4 6.5h16M4 12h16M4 17.5h16'/>\")+\"</span>\"+" +
      "\"<span style='font-size:9px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;'>Menu</span>\"+" +
      "\"<span class='ndot' style='display:none;position:absolute;top:3px;right:50%;margin-right:-17px;width:9px;height:9px;border-radius:50%;background:#f87171;border:2px solid var(--bg0);'></span></button>\";" +
      // gaveta com todas as áreas
      "var gav=document.getElementById('menuApp');" +
      "gav.innerHTML=\"<div style='font-size:10px;font-weight:800;letter-spacing:.16em;color:#8a8695;text-transform:uppercase;padding:0 10px 10px;'>\"+STUDIO.toUpperCase().slice(0,26)+\"<span style='display:block;color:#fff;font-size:13px;margin-top:2px;'>Menu</span></div>\"+" +
      "itens.map(function(m){" +
      "return \"<button class='nitem' data-msec='\"+m[0]+\"' style='display:flex;align-items:center;gap:11px;background:none;border:none;cursor:pointer;font-family:inherit;color:#d6d2df;font-size:14px;font-weight:700;padding:12px 10px;border-radius:10px;text-align:left;position:relative;'>\"+" +
      "\"<span style='line-height:0;'>\"+ic(m[1])+\"</span><span>\"+m[2]+\"</span>\"+" +
      "(m[0]==='chat'?\"<span class='ndot' style='display:none;margin-left:auto;width:9px;height:9px;border-radius:50%;background:#f87171;'></span>\":'')+'</button>';}).join('');" +
      "function abreMenuApp(ab){document.getElementById('fundoMenuApp').style.display=ab?'block':'none';gav.style.transform=ab?'translateX(0)':'translateX(105%)';}" +
      "document.getElementById('fundoMenuApp').addEventListener('click',function(){abreMenuApp(false);});" +
      "gav.addEventListener('click',function(e){var mi=e.target.closest('.nitem');if(!mi)return;if(navigator.vibrate)navigator.vibrate(8);trocaSec(mi.getAttribute('data-msec'));abreMenuApp(false);});" +
      "var stSec=document.createElement('style');stSec.textContent='[data-sec-off]{display:none!important}';document.head.appendChild(stSec);" +
      "var SEC='inicio';" +
      "function mostraDot(on){document.querySelectorAll('.ndot').forEach(function(d){d.style.display=on?'block':'none';});}" +
      "function trocaSec(s){SEC=s;document.querySelectorAll('[data-sec]').forEach(function(el){" +
      "if(el.getAttribute('data-sec')===s)el.removeAttribute('data-sec-off');else el.setAttribute('data-sec-off','1');});" +
      "var CLARO=document.documentElement.classList.contains('claro');" +
      "document.querySelectorAll('.nitem').forEach(function(mi){var on=mi.getAttribute('data-msec')===s;" +
      "mi.style.background=on?'rgba(var(--cor-rgb),.16)':'none';mi.style.color=on?(CLARO?'var(--cor)':'var(--corc)'):(mi.parentElement&&mi.parentElement.id==='menuApp'?'#d6d2df':(CLARO?'#6c6678':'#8a8695'));});" +
      "var mb=document.getElementById('navMenuApp');if(mb){var eFixo=fixos.some(function(m){return m[0]===s;});" +
      "mb.style.background=eFixo?'none':'rgba(var(--cor-rgb),.16)';mb.style.color=eFixo?(CLARO?'#6c6678':'#8a8695'):(CLARO?'var(--cor)':'var(--corc)');}" +
      "var rot=itens.filter(function(m){return m[0]===s;})[0];" +
      "document.getElementById('secTit').textContent=rot?rot[2]:'';" +
      // entrou no chat = recados vistos; some a bolinha
      "if(s==='chat'){Sv('ptvisto',new Date().toISOString());mostraDot(false);}" +
      // GPS sempre ativo: acompanha a navegação (liga na área de cardio, desliga fora se não tem treino rodando)
      "try{if(s==='treino'&&trSub==='cardio')crAutoGps();else if(s!=='treino'&&!cr.run)crGpsPara();}catch(e){}" +
      "window.scrollTo(0,0);}" +
      "nav.addEventListener('click',function(e){var mi=e.target.closest('.nitem');if(!mi)return;" +
      "if(navigator.vibrate)navigator.vibrate(8);" +
      "if(mi.id==='navMenuApp'){abreMenuApp(true);return;}" +
      "trocaSec(mi.getAttribute('data-msec'));});" +
      // bolinha no Chat quando chega recado do personal que o aluno ainda não viu
      "window.__chatDot=function(ultima){if(ultima&&SEC!=='chat'&&String(ultima)>String(L('ptvisto','')))mostraDot(true);};" +
      // sub-abas do Treino: "Minha ficha" mostra a ficha; "Circuito (WOD)" mostra só o cronômetro
      "var trSub='ficha';" +
      "function trocaTrSub(s){trSub=s;" +
      "document.querySelectorAll(\"[data-sec='treino']\").forEach(function(el){if(el.id==='trTabs')return;" +
      "var idAlvo=s==='wod'?'cardWod':s==='cardio'?'cardCardio':null;" +
      "el.style.display=(idAlvo?el.id===idAlvo:(el.id!=='cardWod'&&el.id!=='cardCardio'))?'':'none';});" +
      // GPS sempre ativo: liga ao abrir a área de cardio, desliga ao sair (se não tem treino rodando)
      "try{if(s==='cardio')crAutoGps();else if(!cr.run)crGpsPara();}catch(e){}" +
      "document.querySelectorAll('[data-trsub]').forEach(function(b){var on=b.dataset.trsub===s;" +
      "b.style.background=on?'linear-gradient(135deg,var(--cor),var(--corc))':'var(--bg4)';b.style.border=on?'none':'1px solid var(--bg11)';b.style.color=on?'#fff':'#a9a4b5';});" +
      "window.scrollTo(0,0);}" +
      "document.addEventListener('click',function(e){var b=e.target.closest('[data-trsub]');if(b)trocaTrSub(b.dataset.trsub);});" +
      "window.__trSub=trocaTrSub;trocaTrSub('ficha');" +
      "window.__trocaSec=trocaSec;trocaSec('inicio');" +
      // modo claro × noturno: botão no rodapé da gaveta ☰ (escolha do aluno, guardada no aparelho)
      "var btTema=document.createElement('button');btTema.id='btnTemaApp';" +
      "btTema.style.cssText='margin-top:14px;background:none;border:1px solid rgba(255,255,255,.06);border-radius:16px;padding:11px;color:#a9a4b5;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;';" +
      "document.getElementById('menuApp').appendChild(btTema);" +
      "var icoTema=function(p){return \"<svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true' style='vertical-align:-2px;margin-right:6px;'>\"+p+'</svg>';};" +
      "function aplicaTemaApp(){var claro=+L('pttema',0)===1;document.documentElement.classList.toggle('claro',claro);" +
      "btTema.innerHTML=claro?icoTema(\"<path d='M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z'/>\")+'Modo noturno':icoTema(\"<circle cx='12' cy='12' r='4.2'/><path d='M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.2 5.2l1.7 1.7M17.1 17.1l1.7 1.7M18.8 5.2l-1.7 1.7M6.9 17.1l-1.7 1.7'/>\")+'Modo claro';" +
      "try{trocaSec(SEC);}catch(e){}}" +
      "btTema.addEventListener('click',function(){Sv('pttema',+L('pttema',0)===1?0:1);aplicaTemaApp();if(navigator.vibrate)navigator.vibrate(10);});" +
      "aplicaTemaApp();window.__temaApp=aplicaTemaApp;" +
      "var pc0=L('ptchat',[]);var uP0=null;pc0.forEach(function(m){if(m&&m.de&&m.de!=='aluno'&&m.de!=='aluno-local'&&m.de!=='bot')uP0=m.criado;});window.__chatDot(uP0);})();" +
      atualizador +
      "</" + "script>" +
      "<script>/* TORQUE camada visual: animações (aditiva — pode remover sem afetar a lógica) */(function(){var RM=matchMedia('(prefers-reduced-motion: reduce)').matches;function cascata(els){if(RM)return;els.forEach(function(el,i){el.style.setProperty('--ci',Math.min(i,8));el.classList.remove('sec-anim');void el.offsetWidth;el.classList.add('sec-anim');});}var pend=null;var mo=new MutationObserver(function(ms){var vis=[];ms.forEach(function(m){var el=m.target;if(m.attributeName==='data-sec-off'&&!el.hasAttribute('data-sec-off')&&vis.indexOf(el)<0)vis.push(el);});if(vis.length){clearTimeout(pend);pend=setTimeout(function(){cascata(vis);},0);}});document.querySelectorAll('[data-sec]').forEach(function(el){mo.observe(el,{attributes:true,attributeFilter:['data-sec-off']});});cascata([].slice.call(document.querySelectorAll('[data-sec]:not([data-sec-off])')).slice(0,10));var xp=document.getElementById('xpNum');if(xp&&!RM){var alvo=parseInt(xp.textContent,10)||0;if(alvo>0){var t0=performance.now();var up=function(t){var p=Math.min(1,(t-t0)/900);xp.textContent=Math.round(alvo*(1-Math.pow(1-p,3)));if(p<1)requestAnimationFrame(up);};requestAnimationFrame(up);}}})();</" + "script>" +
      "</body></html>";
    return htmlApp;
  }

  raiz.MT_APP_ALUNO = { monta: monta };
  raiz.MT_CQICONS = MT_CQICONS;
})(typeof self !== "undefined" ? self : this);
