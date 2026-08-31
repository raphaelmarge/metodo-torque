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
  // foto de capa (ficha, circuito ou corrida): só data: de imagem entra no app
  function capaOk(u) { return /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(String(u || "")) ? String(u) : ""; }
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
    /* foto do aluno no topo. O pacote vem da nuvem, então o endereço da imagem
     * é conferido aqui antes de virar src: só data: de imagem em base64 passa.
     * Sem foto (ou com foto estranha), o círculo mostra as iniciais dele. */
    var FOTOAL = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(String(a.foto || "")) ? a.foto : "";
    var INICIAIS = String(a.nome || "?").trim().split(/\s+/).slice(0, 2)
      .map(function (p) { return (p[0] || "").toUpperCase(); }).join("") || "?";
    var st = { config: D.cfg || {}, desafio: D.desafio || null };
    var studio = D.studio || "Meu Personal";
    var COR = D.COR, COR2 = D.COR2, CORC = D.CORC, CORE = D.CORE, CORCL1 = D.CORCL1, CORCL2 = D.CORCL2;
    var PAL = D.PAL || [], LOGOAPP = D.LOGOAPP || "";
    var zapPersonal = D.zapPersonal || "", metaSemana = D.metaSemana || 3;
    var sessApp = D.sessApp || [], vidsApp = D.vidsApp || [], qa = D.qa || null;
    var clubeApp = D.clubeApp || []; // v697: parcerias do professor com cupom
    var lojaApp = D.lojaApp || [];   // v698: vitrine do professor (produtos + serviços)
    var ctApp = D.ctApp || null, plApp = D.plApp || null, pixApp = D.pixApp || null, svApp = D.svApp || [];
    var treino = D.treino || "", t2 = D.t2 || null, fichaVenceApp = D.fichaVenceApp || "";
    var fichasApp = D.fichasApp || null, fexs = D.fexs || [], guiaFichasP = D.guiaFichasP || [];
    var GIF = D.gif || null;
    var aqPorFicha = D.aqPorFicha || {}, raioX = D.raioX || null;
    var wodsApp = D.wodsApp || [], cardiosApp = D.cardiosApp || [];
    var planoApp = D.planoApp || null; // semana do aluno: dia → {tp, i, n}, já resolvido no painel
    var menuOculta = D.menuOculta || [], feedLigado = !!D.feedLigado;
    var avs = D.avs || [], botApp = D.botApp || null, atualizador = D.atualizador || "";
    var vem = D.ve || {};
    var ve = function (k) { return vem[k] !== false; };
    /* rótulo "· terça" / "· hoje" pra qualquer treino amarrado na Semana do
     * aluno — a ficha já fazia isso na mão; agora circuito e corrida usam o
     * mesmo texto, porque viraram gaveta igual à dela. */
    var diaDoPlano = function (tipo, idx) {
      if (!planoApp) return "";
      var rot7 = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
      var hj7 = String(new Date().getDay()), out = "";
      Object.keys(planoApp).some(function (dk) {
        if (planoApp[dk].tp === tipo && planoApp[dk].i === idx) { out = " · " + (dk === hj7 ? "hoje" : rot7[+dk]); return true; }
        return false;
      });
      return out;
    };
    /* ===== AJUDA DO APP (v706) =====
     * Tela própria (data-sec 'ajuda'), aberta só pelo menu. O conteúdo mora
     * AQUI no builder — é código, igual pra todos, e uma correção no texto
     * chega em todo mundo sem republicar. As figuras são mockups montados com
     * os próprios elementos do app (pesam quase nada e funcionam offline);
     * o elemento que o passo manda tocar ganha o anel roxo com rótulo. */
    var ajudaCardHtml = (function () {
      var bA = function (txt, pri) {
        return "<span style='display:inline-flex;align-items:center;height:32px;padding:0 13px;border-radius:10px;font-size:12px;font-weight:800;" +
          (pri ? "background:var(--cor);color:#fff;" : "background:var(--bg2);border:1px solid var(--bg11);color:var(--corc);") + "'>" + txt + "</span>";
      };
      var focoA = function (html, rot) {
        return "<span style='position:relative;display:inline-flex;border-radius:12px;outline:2px solid var(--cor);outline-offset:3px;margin:6px 6px 20px 4px;'>" + html +
          "<i style='position:absolute;left:50%;transform:translateX(-50%);top:calc(100% + 7px);white-space:nowrap;font-size:10px;font-weight:800;font-style:normal;color:var(--corc);'>" + (rot || "toque aqui") + "</i></span>";
      };
      var figA = function (html) {
        return "<div style='margin-top:6px;border:1px dashed var(--bg11);border-radius:12px;padding:10px 12px 12px;background:var(--bg2);'>" +
          "<span style='display:block;font-size:9.5px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:#8a8695;margin-bottom:8px;'>como aparece no app</span>" +
          "<div style='display:flex;flex-wrap:wrap;gap:8px;align-items:center;'>" + html + "</div></div>";
      };
      /* v708: foto REAL da tela com a seta apontando onde tocar (geradas por
       * tools/ajuda/gera-shots.js). Caminho ABSOLUTO porque o mesmo HTML roda
       * em /app/, na demo e nos testes (lição do MapLibre); sem internet o
       * onerror esconde o quadro — o texto do passo continua valendo. */
      var imgA = function (arq, alt) {
        return "<div style='margin-top:6px;'><img src='/assets/ajuda/" + arq + "' alt='" + alt + "' loading='lazy' " +
          "style='display:block;max-width:100%;border-radius:12px;border:1px solid var(--bg11);' " +
          "onerror=\"this.parentElement.style.display='none'\"></div>";
      };
      var passos = function (lst) {
        // o número é escrito no build (content de CSS não entra por style inline)
        return "<ol style='margin:10px 0 0;padding:0;list-style:none;'>" + lst.map(function (px, i9) {
          return "<li style='position:relative;padding:0 0 11px 32px;font-size:13px;line-height:1.55;color:#cfcbdb;'>" +
            "<span style='position:absolute;left:0;top:1px;width:21px;height:21px;border-radius:50%;background:var(--cor);color:#fff;font-size:11px;font-weight:900;display:flex;align-items:center;justify-content:center;' aria-hidden='true'>" + (i9 + 1) + "</span>" + px + "</li>";
        }).join("") + "</ol>";
      };
      var det = function (t, mio, aberto) {
        return "<details class='ajdt'" + (aberto ? " open" : "") + " style='border:1px solid var(--bg11);border-radius:14px;padding:12px 14px;margin-bottom:8px;'>" +
          "<summary style='cursor:pointer;font-size:14px;font-weight:800;list-style:none;'>" + t + "</summary>" + mio + "</details>";
      };
      var TOPICOS = [
        det("Começando: o app é seu", passos([
          "Este app foi montado pelo seu personal, só pra você — o treino, as metas e as cores são do studio dele.",
          "Guarde o link: entrar de novo é só abrir o mesmo endereço, ou entrar com seu <b>e-mail</b> na página de login.",
          "Ele funciona <b>sem internet</b>: o treino abre na academia mesmo sem sinal, e o que você marcar sobe quando a internet voltar.",
        ]) + figA(bA("Adicionar à Tela de Início") + "<span style='font-size:12px;color:#a9a4b5;'>no iPhone: Compartilhar → Adicionar à Tela de Início · no Android: menu do navegador → Instalar</span>") + imgA("a-menu.jpg", "O botão Menu na barra de baixo do app, marcado com a seta"), true),
        det("Início — sua semana", passos([
          "Os chips <b>seg–dom</b> mostram os dias que você já treinou na semana.",
          "Terminou o treino? Toque em <b>Treinei hoje!</b> — é ele que conta sua sequência e suas medalhas.",
          "Os quatro botões de hábito (água, comida, sono, cardio) são um toque por dia — seu personal vê a média deles.",
          "O card do dia mostra o treino de HOJE, seguindo o plano da semana que seu personal montou.",
        ]) + figA(focoA(bA("Treinei hoje!", 1), "conta a sequência") + bA("💧 Água") + bA("🍎 Comida")) + imgA("a-treinei.jpg", "O botão Treinei hoje no card da semana")),
        det("Treinos — ficha, circuito e corrida", passos([
          "Em <b>Treinos</b>, cada ficha é uma gaveta (A, B, C…) — a do dia já abre aberta.",
          "O botão <b>Começar treino</b> abre o modo guiado: um exercício por vez, com séries, descanso cronometrado e a carga da última vez.",
          "Toque em <b>Mudar a carga</b> pra anotar o peso — é isso que desenha sua evolução.",
          "Tem <b>parte 2</b> (A2)? Ela aparece dentro da gaveta da ficha, com as linhas pra marcar.",
          "Na <b>corrida</b>, o app desenha o trajeto pelo GPS, fala os quilômetros e guarda pace e batimento.",
          "No fim do treino vem o <b>resumo</b>: dá pra escrever como foi (seu personal lê) e compartilhar o card do treino.",
        ]) + figA(focoA(bA("Começar treino", 1), "modo guiado") + bA("Mudar a carga")) + imgA("a-ficha.jpg", "A gaveta da ficha do dia na área Treinos")),
        det("Evolução — seu progresso", passos([
          "<b>Conquistas</b>: medalhas, sequência, o mapa do mês e a retrospectiva.",
          "<b>Corpo</b>: a curva do peso e as fotos de progresso (antes × depois).",
          "<b>Cargas</b>: quanto você levantou em cada exercício, treino a treino.",
          "<b>Marcas</b>: seus recordes — maior carga, maior corrida, melhor pace.",
        ])),
        det("Chat e agenda", passos([
          "No <b>Chat</b> você fala direto com seu personal — ele responde quando puder.",
          "Quando a sessão do dia aparecer no Início, toque em <b>Confirmo presença</b> (ou avise que não vai).",
          "No <b>Calendário</b> dá pra <b>pedir horário</b>: escolha dia e hora e espere a confirmação dele.",
        ]) + figA(focoA(bA("Confirmo presença", 1), "avisa seu personal") + bA("Não vou conseguir"))),
        det("Check-in e questionários", passos([
          "Uma vez por semana o app pede um <b>check-in</b>: 30 segundos, uma pergunta por tela.",
          "Seu personal também pode mandar <b>questionários</b> — o sininho do menu avisa quando tem um esperando.",
          "Responder de verdade ajuda: é assim que ele ajusta seu treino sem você precisar pedir.",
        ]) + imgA("a-quest.jpg", "A entrada Questionários no menu, com o aviso de quantos esperam") + imgA("a-checkin.jpg", "O convite do check-in da semana")),
        det("Utilidades — ferramentas do treino", passos([
          "No menu, <b>Utilidades</b> junta as ferramentas avulsas: cronômetro, contador de água e as calculadoras.",
          "A calculadora de <b>1RM</b> estima sua carga máxima a partir do que você levantou.",
          "A de <b>anilhas</b> diz o que pôr de cada lado da barra pra chegar no peso.",
        ])),
        (plApp && ve("pag") ? det("Meu plano e pagamentos", passos([
          "Em <b>Meu plano</b> (menu) você vê seu plano, o valor e o dia do vencimento.",
          "Na hora de pagar aparecem os caminhos que seu personal usa — Pix, link de cartão ou combinar direto.",
          "Pagou? O comprovante e o histórico ficam ali também.",
        ])) : ""),
        (vidsApp.length ? det("Conteúdos e vídeos", passos([
          "Em <b>Conteúdos e vídeos</b> (menu) ficam os vídeos que seu personal publicou pra você: técnica, mobilidade, alongamento.",
          "Eles tocam dentro do próprio app.",
        ])) : ""),
        (feedLigado ? det("Comunidade — sua turma", passos([
          "Na <b>Minha turma</b> você vê os treinos do pessoal do studio, curte e comenta.",
          "Terminou um treino? O app oferece postar — só vai pro feed se você quiser.",
        ])) : ""),
        (clubeApp.length || lojaApp.length ? det("Clube de vantagens e Loja", passos(
          (clubeApp.length ? [
            "No <b>Clube de vantagens</b> (menu) estão as parcerias do seu personal: toque no cupom pra <b>copiar o código</b> e use no parceiro.",
            "Alguns cupons têm o botão <b>Ir pro site do parceiro</b>.",
          ] : []).concat(lojaApp.length ? [
            "Na <b>Loja</b> (menu) você vê os produtos e serviços do seu personal — o botão fecha a compra com ele.",
          ] : []))) : ""),
        det("Ajustes e privacidade", passos([
          "Em <b>Ajustes</b> você troca o modo claro/escuro, liga os lembretes e configura a corrida.",
          "Toque na sua <b>foto no topo</b> pra trocar a foto de perfil — ela é reduzida no seu próprio celular.",
          "Tem cinta de batimento? O app conecta por Bluetooth e mostra sua zona durante o treino.",
          "<b>Baixar meus dados</b> entrega tudo que é seu num arquivo; <b>Excluir minha conta</b> apaga de verdade.",
        ])),
      ].join("");
      return "<div class='cardx' id='ajudaCard'><h2>Ajuda</h2>" +
        "<div class='vz' style='text-align:left;padding:2px 0 10px;'>Como usar cada parte do app, passo a passo. Dúvida que não está aqui? Chama seu personal no Chat.</div>" +
        TOPICOS + "</div>";
    })();
    /* Resumo do treino de cardio numa linha. O tipo 'misto' e o pedido do
     * professor: a MESMA folha tem parte CONTINUA e TIROS, e o resumo mostra
     * os dois na ordem em que o aluno vai fazer. Gemeo do crAlvoTxt() la
     * dentro do app (que le as chaves curtas) — mexeu num, confira o outro. */
    var alvoCardio = function (c) {
      var cont = [(+c.dist ? String(c.dist).replace(".", ",") + " km" : ""),
        (+c.tempo ? c.tempo + " min" : ""), (c.pace ? "pace " + c.pace : "")].filter(Boolean).join(" · ");
      var tiros = (c.reps || 8) + "× " + (c.tiro || 60) + "s forte / " + (c.desc || 90) + "s leve";
      if (c.tipo === "intervalado") return tiros;
      if (c.tipo === "misto") return (cont || "parte contínua") + " + " + tiros;
      return cont || "livre";
    };
    // gaveta igual à da ficha: quadradinho com a letra, nome, resumo e seta
    var gavetaTop = function (letra, nome, sub) {
      return "<summary style='list-style:none;cursor:pointer;display:flex;align-items:center;gap:12px;padding:15px 16px;'>" +
        "<span style='flex:none;width:44px;height:44px;border-radius:14px;background:rgba(var(--cor-rgb),.25);color:var(--corc);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:16px;'>" + esc(letra) + "</span>" +
        "<span style='flex:1;min-width:0;'><b style='display:block;font-size:16px;font-weight:800;'>" + esc(nome) + "</b>" +
        "<span style='display:block;font-size:12.5px;color:#8a8695;margin-top:2px;'>" + esc(sub) + "</span></span>" +
        "<span class='fseta' style='color:#6e6a78;font-size:13px;'>▾</span></summary>";
    };
    /* Técnicas de intensidade no MESMO exercício (v588) — o professor marca no
     * painel e aqui só mostramos. O que muda (peso ou repetição) ele escreve na
     * observação; o nome é o que o aluno reconhece na hora. */
    /* foto do treino: a escolhida na ficha vence; sem ela vale a do TIPO
     * (grupo muscular, circuito, corrida...), que o professor sobe uma vez so;
     * sem nenhuma das duas, o app cai na geral. */
    var CAPT = (D.cfg && D.cfg.capasTipo) || {};
    var capaTipo = function (o) { return capaOk(o && o.capa) || capaOk(CAPT[(o && o.ck) || ""]) || ""; };
    /* Nos pacotes (FICHAS_META, WODS, CARDIOS) a foto do TIPO viaja como CHAVE,
     * não como imagem: três fichas de perna guardariam a mesma foto três vezes.
     * O mapa vai uma vez em CAPAS_TIPO e o app resolve com capaFM(). */
    var capaRef = function (o) {
      var pp = capaOk(o && o.capa);
      if (pp) return pp;
      var k = (o && o.ck) || "";
      return (k && capaOk(CAPT[k])) ? k : "";
    };
    var TECS_APP = { drop: ["Drop-set", "chega na falha, tira peso (ou repetições) e continua sem descanso"],
      up: ["Up set", "sobe o peso (ou as repetições) a cada série"],
      rest: ["Rest-pause", "vai até a falha, para 15-20 s e faz mais algumas repetições"],
      bi: ["Bi-set", "emenda no próximo exercício sem descanso no meio"],
      iso: ["Isometria", "segura parado no ponto mais difícil do movimento"] };
    var tecChip = function (k) {
      var t = TECS_APP[k];
      return t ? "<span class='tecchip'>" + esc(t[0]) + "</span>" : "";
    };
    /* Parte 2 do dia (A2, B2…): cardio e alongamento que o professor escreveu
     * em linhas de tempo/distância. Fica DENTRO da gaveta da ficha, depois do
     * botão de começar — é o mesmo dia, não outro treino. Cada linha vira um
     * item marcável; linha com minutos ganha o cronômetro (o mesmo do descanso,
     * com rótulo próprio). O que foi marcado vale só pro dia de hoje. */
    var minutosDe = function (v) {
      var m = /(\d+)\s*(min|m\b)/i.exec(String(v || ""));
      if (m) return Math.min(90, +m[1]) * 60;
      var sg = /(\d+)\s*s\b/i.exec(String(v || ""));
      return sg ? Math.min(600, +sg[1]) : 0;
    };
    var blocoP2 = function (gi, letra, p2) {
      var linhas = (p2 && p2.l) || [];
      return "<div class='p2box' style='margin:14px 16px 0;background:rgba(96,165,250,.08);border:1px solid rgba(96,165,250,.32);border-radius:18px;overflow:hidden;'>" +
        "<div style='display:flex;align-items:center;gap:10px;padding:12px 14px 8px;'>" +
        "<span style='flex:none;width:34px;height:34px;border-radius:11px;background:rgba(96,165,250,.22);color:#93c5fd;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:13px;'>" + esc(letra + "2") + "</span>" +
        "<span style='flex:1;min-width:0;'><b style='display:block;font-size:14.5px;color:#bfdbfe;'>" + esc((p2 && p2.n) || "Cardio e alongamento") + "</b>" +
        "<span style='display:block;font-size:11.5px;color:#8a8695;margin-top:1px;'>parte 2 do mesmo dia · " + linhas.length + (linhas.length === 1 ? " item" : " itens") + "</span></span></div>" +
        "<div style='padding:0 14px 12px;'>" +
        linhas.map(function (ln, li) {
          var seg = minutosDe(ln.v);
          return "<div class='p2row' data-p2='" + gi + ":" + li + "' style='display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid rgba(96,165,250,.14);font-size:13.5px;'>" +
            "<span class='p2ck' style='flex:none;width:24px;height:24px;border-radius:50%;border:1.5px solid rgba(96,165,250,.5);display:flex;align-items:center;justify-content:center;font-size:13px;color:#93c5fd;cursor:pointer;'></span>" +
            "<span style='flex:1;min-width:0;'><b style='display:block;font-weight:700;'>" + esc(ln.t) + "</b>" +
            (ln.o ? "<span style='display:block;font-size:11.5px;color:#8a8695;margin-top:1px;'>" + esc(ln.o) + "</span>" : "") + "</span>" +
            (ln.v ? "<b style='flex:none;color:#93c5fd;white-space:nowrap;'>" + esc(ln.v) + "</b>" : "") +
            (seg ? "<button class='tmrbtn' data-s='" + seg + "' data-rot='" + esc(ln.t) + "' style='flex:none;background:rgba(96,165,250,.18);border:1px solid transparent;color:#bfdbfe;border-radius:99px;padding:7px 13px;font-size:12px;font-family:inherit;cursor:pointer;font-weight:700;'>▶</button>" : "") +
            "</div>";
        }).join("") + "</div></div>";
    };
    var htmlApp = "<!DOCTYPE html><html lang='pt-BR'><head><meta charset='utf-8'>" +
      "<meta name='viewport' content='width=device-width,initial-scale=1'>" +
      "<link rel='icon' href='/assets/icons/icon-personal.svg' type='image/svg+xml'>" +
      "<link rel='apple-touch-icon' href='/assets/icons/icon-personal-192.png'>" +
      // a Archivo é a cara do redesenho: o CSS pedia a fonte mas ninguém a
      // carregava — o app inteiro caía na fonte do sistema e ficava "diferente
      // do Claude Design". font-display:swap: sem internet o texto não some.
      "<link rel='preload' href='/assets/fonts/files/archivo-latin-700-normal.woff2' as='font' type='font/woff2' crossorigin>" +
      "<link rel='preload' href='/assets/fonts/files/archivo-latin-800-normal.woff2' as='font' type='font/woff2' crossorigin>" +
      "<link rel='stylesheet' href='/assets/fonts/archivo.css'>" +
      "<title>" + esc(a.nome.split(" ")[0]) + " · " + esc(studio) + "</title>" +
      "<style>:root{" +
      "--cor:" + COR + ";--cor2:" + COR2 + ";--corc:" + CORC + ";" +
      "--cor-esc:" + CORE + ";--cor-cl1:" + CORCL1 + ";--cor-cl2:" + CORCL2 + ";" +
      "--cor-rgb:" + rgbDe(COR) + ";--corc-rgb:" + rgbDe(CORC) + ";--bg0-rgb:" + rgbDe(PAL[0]) + ";" +
      PAL.map(function (c, i) { return "--bg" + i + ":" + c + ";"; }).join("") +
      "}" +
      "*{box-sizing:border-box;margin:0}body{font-family:'Archivo',system-ui,sans-serif;background:var(--bg0);color:#fff;max-width:480px;margin:0 auto;padding:0 0 calc(104px + env(safe-area-inset-bottom,0px));-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}a{color:var(--corc)}a:hover{color:var(--cor-cl1)}" +
      // faixa colorida no topo: o app do aluno abre com a cor do studio, e a
      // sequência e os hábitos do dia moram DENTRO dela (só no Início — nas
      // outras áreas a faixa fica curta, só com nome, nível e XP).
      ".topo{padding:calc(30px + env(safe-area-inset-top,0px)) 20px 18px;background:linear-gradient(160deg,var(--cor),var(--cor2));border-radius:0 0 26px 26px;color:#fff}" +
      ".tpmarca{display:flex;align-items:center;gap:9px;margin-bottom:13px}" +
      ".tpmarca img{flex:none;height:26px;border-radius:7px;display:block}" +
      ".topo .k{min-width:0;font-size:9.5px;letter-spacing:.2em;color:rgba(255,255,255,.7);font-weight:700;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      ".topo h1{font-size:27px;font-weight:800;letter-spacing:-.02em}" +
      // os dois chips do topo ficam translúcidos: sobre a faixa colorida, um
      // chip da própria cor sumiria dentro do fundo
      ".tpchip{flex:none;display:inline-flex;align-items:center;gap:4px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.26);border-radius:99px;padding:6px 10px;font-weight:800;font-size:11.5px;color:#fff}" +
      // foto do aluno; sem foto, as iniciais dele no mesmo círculo
      ".tpav{position:relative;flex:none;width:46px;height:46px;padding:0;border-radius:50%;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.3);display:flex;align-items:center;justify-content:center;font-family:inherit;font-weight:800;font-size:15px;letter-spacing:.02em;color:#fff;cursor:pointer}" +
      ".tpav img{width:100%;height:100%;object-fit:cover;display:block;border-radius:50%}" +
      // selinho de câmera: sem ele ninguém descobre que dá pra tocar na foto
      ".tpavc{position:absolute;right:-2px;bottom:-2px;width:18px;height:18px;border-radius:50%;background:var(--cor2);border:1.5px solid rgba(255,255,255,.85);color:#fff;display:flex;align-items:center;justify-content:center;line-height:0}" +
      // um cartão só dentro da faixa: sequência grande à esquerda, os quatro
      // hábitos do dia em linhas finas à direita
      "#topoExtra{display:flex;gap:12px;margin-top:14px;background:rgba(255,255,255,.13);border:1px solid rgba(255,255,255,.16);border-radius:18px;padding:10px 12px}" +
      ".tpsk{flex:none;width:42%;display:flex;align-items:center;gap:9px}" +
      ".tpskico{flex:none;width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;line-height:0}" +
      ".tpskt{min-width:0}" +
      // line-height folgado: com a caixa apertada o acento sumia cortado em cima
      ".tpskn{display:block;font-size:25px;font-weight:800;line-height:1.15;letter-spacing:-.02em}" +
      ".tpskn small{font-size:12px;font-weight:700;margin-left:3px}" +
      ".tpsklab{display:block;font-style:normal;font-size:8.5px;letter-spacing:.14em;font-weight:800;text-transform:uppercase;color:rgba(255,255,255,.62);margin-top:2px}" +
      ".tpskrec{display:block;font-style:normal;font-size:9.5px;font-weight:700;color:rgba(255,255,255,.45);margin-top:2px}" +
      ".tphab{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;border-left:1px solid rgba(255,255,255,.16);padding-left:12px}" +
      ".tphab button{display:flex;align-items:center;gap:7px;width:100%;min-height:34px;background:none;border:none;padding:0;color:rgba(255,255,255,.66);font-family:inherit;font-size:11.5px;font-weight:700;cursor:pointer;text-align:left}" +
      ".tphab button.on{color:#fff}" +
      ".tphab i{flex:none;font-style:normal;line-height:0}" +
      ".tphab span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      ".tphab u{flex:none;text-decoration:none;font-size:10.5px;font-weight:800;font-variant-numeric:tabular-nums;color:rgba(255,255,255,.45)}" +
      ".tphab button.on u{color:rgba(255,255,255,.85)}" +
      ".cardx{background:none;border:none;border-radius:0;margin:32px 20px 0;padding:0;box-shadow:none}" +
      ".cardx h2{font-size:10.5px;letter-spacing:.22em;color:#6e6a78;text-transform:uppercase;margin-bottom:14px;font-weight:700}" +
      "pre{white-space:pre-wrap;font-family:inherit;font-size:14.5px;line-height:1.7;color:#d6d2df}" +
      "input,select,textarea{background:var(--bg2);border:1.5px solid rgba(255,255,255,.07);border-radius:12px;color:#fff;padding:12px 14px;font-family:inherit;font-size:15px}" +
      "input:focus,select:focus,textarea:focus{outline:none;border-color:var(--cor)}" +
      ".btnx{background:var(--cor);color:#fff;border:none;border-radius:99px;padding:13px 24px;font-weight:800;letter-spacing:.02em;font-size:13.5px;font-family:inherit;cursor:pointer;box-shadow:0 10px 30px -14px rgba(var(--cor-rgb),.9)}" +
      // botão do questionário: mora DENTRO da faixa roxa, então vira branco
      ".qsbt{display:block;width:100%;min-height:52px;margin-top:16px;background:#fff;color:var(--cor-esc,#3b2b63);font-size:15.5px;box-shadow:none}" +
      ".kv{display:flex;justify-content:space-between;font-size:14px;padding:7px 0;border-bottom:none}" +
      ".vz{color:#6e6a78;font-size:13px;text-align:center;padding:14px 0}" +
      // "Como foi o treino?" aparece em dois fundos: o card escuro da área de
      // Treino e o recibo (lavanda claro) do fim da sessão. Uma classe só, com
      // a variação do recibo escrita como filha de .gcard.
      ".rpelab{font-size:13px;font-weight:800;margin-bottom:8px}" +
      ".rperow{display:flex;gap:6px}" +
      ".rpebtn{flex:1;background:var(--bg4);border:1px solid rgba(255,255,255,.06);border-radius:16px;padding:11px 0;color:#fff;font-family:inherit;font-size:12.5px;font-weight:700;cursor:pointer;min-height:44px}" +
      ".rpeok{color:#6e6a78;font-size:13px;text-align:center;padding:6px 0}" +
      ".ntbox{margin-top:14px}" +
      ".ntTxt{width:100%;background:var(--bg4);border:1px solid rgba(255,255,255,.08);border-radius:14px;color:#fff;font-family:inherit;font-size:14px;padding:11px 13px;resize:vertical;min-height:64px}" +
      ".ntSalva{display:block;width:100%;min-height:44px;margin-top:8px;background:var(--bg4);border:1px solid var(--bg11);border-radius:14px;color:var(--corc);font-family:inherit;font-size:13.5px;font-weight:800;cursor:pointer}" +
      "html.claro .ntTxt{background:#fff;border-color:#d9d5e3;color:#191622}" +
      "html.claro .rpebtn{background:#fff;border-color:#d9d5e3;color:#191622}" +
      ".gcard .rpelab{color:#1d1729}" +
      ".gcard .rpebtn{background:rgba(var(--cor-rgb),.12);border:1px solid rgba(var(--cor-rgb),.4);color:var(--cor2)}" +
      ".gcard .rpeok{color:#544c68}" +
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
      "html.claro #menuApp{background:#f4f3f7!important}" +
      "html.claro .mgcard{background:#fff;border-color:#e7e4ee}" +
      "html.claro .mgrow{border-color:#eceaf1;color:#6c6678}" +
      "html.claro .mgtit{color:#191622}" +
      "html.claro .mgsub{color:#6c6678}" +
      "html.claro .mgchev{color:#a9a4b5}" +
      "html.claro .mgsw{background:#d8d3e4}html.claro .mgsw.on{background:var(--cor)}" +
      "html.claro .mgq{background:rgba(var(--cor-rgb),.08);color:var(--cor)}" +
      "html.claro .mgq .mgsub{color:var(--cor)}" +
      "html.claro .aghoje{background:rgba(var(--cor-rgb),.16);border:1px solid var(--corc)}" +
      // o topo é colorido nos dois temas, então os chips dele não mudam no claro
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
      /* card do treino de hoje COM foto: o véu por cima da imagem é escuro nos
       * dois temas, então o texto tem que ser claro nos dois. Sem isto, no modo
       * claro o nome do treino saía escuro em cima do véu escuro. */
      "#heroTreino.comfoto #htTitulo{color:#fff!important}" +
      "#heroTreino.comfoto #htSub{color:#d6d2df!important}" +
      "html.claro #heroTreino.comfoto #htTitulo{color:#fff!important}" +
      "html.claro #heroTreino.comfoto #htSub{color:#d6d2df!important}" +
      "html.claro #heroTreino.comfoto .htk{color:var(--cor-cl1)!important}" +
      // no fundo branco o verde e o vermelho claros somem; escurece os dois
      "html.claro [style*='color:#4ade80']{color:#15803d!important}" +
      "html.claro [style*='color:#f87171']{color:#dc2626!important}" +
      "html.claro [style*='color:#d6d2df']{color:#3a3547!important}" +
      "html.claro [style*='color:#cfcbdb']{color:#443f52!important}" +
      "html.claro [style*='color:#8a8695']{color:#6c6678!important}" +
      "html.claro [style*='color:#6e6a78']{color:#77718a!important}" +
      "html.claro [style*='color:var(--corc)']{color:var(--cor2)!important}" +
      "html.claro [style*='color:var(--cor-cl1)']{color:var(--cor2)!important}" +
      // as opções do assistente ficam sobre um véu da cor: no claro o tom médio
      // não dava contraste suficiente no texto pequeno, então usa o tom escuro
      "html.claro [data-bop],html.claro [data-agics]{color:var(--cor-esc)!important}" +
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
      // na tela de anotar carga o NOME do exercício fica (tela 22) — só os
      // chips somem; a linha roxa vira a pergunta 'Com quanto você fechou?'
      ".gwrap.reg .gmeta{display:none!important}"+
      ".gwrap.reg .ggrupo{color:#8a8695}"+
      ".gwrap.reg .gcard{max-height:80vh}"+
      ".gwrap.reg .gsets,.gwrap.reg .ghist{display:none}"+
      ".gcard.compacto .gcg .gwval input{font-size:34px}"+
      ".gcard.compacto .gcg .gwval.sm input{font-size:22px}" +
      ".gbiglab{text-align:center;font-size:10px;letter-spacing:.22em;font-weight:800;text-transform:uppercase;color:#6f6688}" +
      ".gtrilho{height:5px;border-radius:3px;background:#ded7ee;width:100%;margin:12px auto 0;max-width:220px;overflow:hidden}" +
      ".gtrilho b{display:block;height:100%;background:var(--cor);border-radius:3px}" +
      ".gcg{margin-top:16px}" +
      ".gcglab{font-size:9.5px;letter-spacing:.2em;font-weight:800;text-transform:uppercase;color:#6f6688}" +
      /* Régua deslizante no lugar dos botões + e −. Botão de passo era lento:
         pra sair de 20 kg e chegar em 95 eram 30 toques. Aqui um arrasto passa
         dezenas de quilos, o valor gruda no traço (scroll-snap) e quem quiser
         um número exato ainda pode tocar no número e digitar. */
      ".gcg .gwbox{margin-top:10px}" +
      ".gcg .gwval{display:flex;align-items:baseline;justify-content:center;gap:7px}" +
      ".gcg .gwval input{width:3.3em;background:none;border:none;text-align:right;color:#1d1729;font-family:inherit;" +
      "font-size:44px;font-weight:800;font-variant-numeric:tabular-nums;padding:0;min-height:50px}" +
      ".gcg .gwval input::placeholder{color:#b3aac6;font-size:19px;font-weight:700}" +
      ".gcg .gwval input:focus{outline:2px solid var(--cor);outline-offset:4px;border-radius:10px}" +
      ".gcg .gwval u{font-style:normal;text-decoration:none;font-size:15px;font-weight:800;color:#6f6688}" +
      ".gcg .gwval.sm input{font-size:27px;min-height:36px;width:2.6em}" +
      ".gwrail{position:relative;margin-top:2px;-webkit-mask-image:linear-gradient(90deg,transparent,#000 14%,#000 86%,transparent);" +
      "mask-image:linear-gradient(90deg,transparent,#000 14%,#000 86%,transparent)}" +
      ".gwheel{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;padding:8px calc(50% - 9px) 0;touch-action:pan-x;" +
      "-webkit-overflow-scrolling:touch;scrollbar-width:none;overscroll-behavior-x:contain}" +
      ".gwheel::-webkit-scrollbar{display:none}" +
      ".gwheel i{flex:none;height:40px;scroll-snap-align:center;display:flex;flex-direction:column;align-items:center;font-style:normal}" +
      ".gwheel i:before{content:\'\';width:2px;height:12px;border-radius:2px;background:#cfc6e4}" +
      ".gwheel i.f:before{height:20px;background:rgba(var(--cor-rgb),.55)}" +
      ".gwheel i b{font-size:10.5px;font-weight:800;color:#6f6688;margin-top:3px;font-variant-numeric:tabular-nums}" +
      ".gwmk{position:absolute;left:50%;top:2px;width:3px;height:30px;border-radius:3px;background:var(--cor);transform:translateX(-1.5px);pointer-events:none;z-index:2;box-shadow:0 0 0 4px rgba(var(--cor-rgb),.14)}" +
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
      /* ---------- player escuro no desenho da tela 47 ----------
       * O título sobe pro topo (ordem do flex — a LÓGICA não muda de lugar) e o
       * card lavanda vira escuro. Tudo por classe, como o resto do player. */
      ".gwrap{background:var(--bg0)}" +
      // título primeiro, "Série 3 de 4" logo abaixo (tela 47) — só a ORDEM do
      // flex muda; o #gGrupo continua o mesmo elemento de sempre
      ".gtopo{order:0}.gbarra{order:1}.gcont{order:2}.gtit{order:3}.ggrupo{order:4}.gcard{order:5}.gbase{order:6}.gpe{order:7}" +
      ".gtecl{order:4;margin-top:8px;line-height:1.5}" +
      ".gtopo .gx{order:-1;margin-right:2px}" +
      ".gtopo #gPularEx{display:none}" + // pular mora no miolo (#gPulaEx2); o clique de teste segue vivo
      ".gmarca{text-align:center;color:#8a8695}" +
      ".ggrupo{margin-top:5px;font-size:14px;letter-spacing:0;text-transform:none;font-weight:700}" +
      ".gtit{font-size:clamp(26px,8vw,36px);letter-spacing:-.03em;line-height:1.04;margin-top:14px}" +
      ".gcard{background:var(--bg1);color:#fff;box-shadow:none;border:1px solid var(--bg11);margin-top:14px}" +
      ".ggif{background:var(--bg4);border:1.5px dashed var(--bg12);box-shadow:none}" +
      ".gchip{color:var(--corc);background:rgba(var(--cor-rgb),.16)}" +
      ".gchip.verde{color:#4ade80;background:rgba(74,222,128,.15)}" + // selo '✓ 4 séries feitas' (tela 22)
      ".gcgult{margin:10px 0 2px;font-size:12.5px;color:#8a8695;text-align:center}" +
      // botão do peso sugerido: aparece só quando o aluno bateu as reps
      ".gsug{display:block;width:100%;margin:9px 0 0;min-height:46px;border-radius:99px;cursor:pointer;font-family:inherit;font-size:13.5px;font-weight:800;background:rgba(34,211,238,.14);border:1px solid rgba(34,211,238,.5);color:#67e8f9}" +
      ".gsug.on{background:rgba(74,222,128,.16);border-color:rgba(74,222,128,.55);color:#4ade80}" +
      ".gsets i{background:var(--bg4);color:#8a8695}" +
      ".gsets i.now{background:var(--bg2);color:var(--corc);box-shadow:inset 0 0 0 2px var(--cor)}" +
      ".gobs em{color:#8a8695}.gobs p{color:var(--corc)}" +
      ".gdica{color:#a9a4b5}.ghist{color:#8a8695}" +
      ".gcard .vidbtn{color:var(--corc)}" +
      ".gbig{color:#fff}.gbiglab{color:#8a8695}" +
      ".gtrilho{background:var(--bg5)}" +
      ".gcglab{color:#8a8695}" +
      ".gcg .gwval input{color:#fff}.gcg .gwval input::placeholder{color:#55506b}.gcg .gwval u{color:#8a8695}" +
      ".gwheel i:before{background:var(--bg12)}.gwheel i b{color:#8a8695}" +
      ".gsemcarga{border-color:var(--bg11);color:#8a8695}" +
      ".gfalta{color:var(--corc)}" +
      /* tiles REPETIÇÕES/CARGA, atalhos e o card "NA ÚLTIMA VEZ" (tela 47).
       * Cinzas fixos de propósito: o player é escuro nos dois temas. */
      ".gmeta{display:none}" + // séries × reps agora moram no tile (o texto segue preenchido pros testes)
      ".gtiles{display:flex;gap:10px;margin-top:14px}" +
      ".gtile{flex:1;min-width:0;background:var(--bg2);border:1px solid var(--bg11);border-radius:18px;padding:13px 14px;min-height:88px}" +
      ".gtile span{display:block;font-size:9px;letter-spacing:.18em;font-weight:800;text-transform:uppercase;color:#8a8695}" +
      ".gtile b{display:block;font-size:31px;font-weight:800;letter-spacing:-.02em;line-height:1.12;margin-top:5px;color:#fff}" +
      ".gtile b u{font-size:14px;font-weight:800;color:#8a8695;text-decoration:none;margin-left:2px}" +
      ".gtile em{display:block;font-style:normal;font-size:11px;font-weight:700;margin-top:3px;color:#4ade80}" +
      ".gtile em.mn{color:#8a8695}" +
      ".gsecrow{display:flex;gap:10px;margin-top:12px}" +
      ".gsecrow button{flex:1;min-height:50px;border-radius:99px;border:none;background:var(--bg4);color:#d6d3de;font-family:inherit;font-size:13.5px;font-weight:700;cursor:pointer}" +
      ".gultvez{background:var(--bg2);border:1px solid var(--bg11);border-radius:18px;padding:13px 14px 15px;margin-top:14px}" +
      // aquecimento e alternativas no player (v670) — laranja #fdba74 é o tom
      // que o aquecimento e as técnicas já usam; o player é escuro nos 2 temas
      ".gaq{background:rgba(251,146,60,.08);border:1px solid rgba(251,146,60,.45);border-radius:18px;padding:11px 14px;margin-bottom:12px}" +
      ".gaq summary{cursor:pointer;list-style:none;font-size:13px;font-weight:800;color:#fdba74}" +
      ".gaqrow{display:flex;justify-content:space-between;gap:10px;margin-top:9px;font-size:13.5px;color:#b9b4c6}" +
      ".gaqrow b{color:#fdba74;white-space:nowrap;font-weight:700}" +
      ".gaqp{margin-top:9px;font-size:11px;color:#8a8695}" +
      ".galt{margin-top:12px}" +
      ".galt .altbtn{background:none;border:none;color:#8a8695;font-size:12.5px;text-decoration:underline;cursor:pointer;font-family:inherit;padding:0}" +
      ".galt .altbox{margin-top:6px;font-size:13px;color:#b9b4c6;line-height:1.5}" +
      ".galt .altbox b{color:#fff;font-weight:700}" +
      ".gultvez span{display:block;font-size:9px;letter-spacing:.18em;font-weight:800;text-transform:uppercase;color:#8a8695}" +
      ".ghist{margin-top:10px}" +
      ".ghist summary{list-style:none;cursor:pointer;font-size:12.5px;font-weight:800;color:var(--corc);padding:5px 2px}" +
      ".ghist summary::-webkit-details-marker{display:none}" +
      ".ghist .ghrow{display:flex;align-items:center;gap:10px;background:var(--bg2);border:1px solid var(--bg11);border-radius:12px;padding:9px 12px;margin-top:6px;font-size:13.5px}" +
      ".ghist .ghrow span{color:#8a8695;font-weight:800;font-size:11.5px;min-width:44px}" +
      ".ghist .ghrow b{font-size:14.5px}" +
      ".ghist .ghrow i{margin-left:auto;font-style:normal;color:#8a8695;font-size:11.5px}" +
      ".guvrow{display:flex;justify-content:space-between;align-items:center;margin-top:10px;font-size:14px;color:#b9b4c6}" +
      ".guvrow b{color:#fff;font-weight:700}" +
      ".gprox{margin-top:13px;font-size:13px;color:#8a8695}" +
      ".gprox b{color:#fff;font-weight:700}" +
      /* barra de descanso no rodapé (tela 47) — só aparece com .resta no wrap */
      "#gResta{display:none;position:absolute;left:0;right:0;bottom:0;z-index:3;background:var(--bg1);border-top:1px solid var(--bg11);padding:12px 20px calc(14px + env(safe-area-inset-bottom,0px))}" +
      ".gwrap.resta #gResta{display:block}" +
      ".gwrap.resta .gpe,.gwrap.resta .gbase{display:none}" + // o rodapé de botões dá lugar à barra
      ".gwrap.resta .gcard{margin-bottom:8px}" +
      "#gResta .grk{font-size:10px;letter-spacing:.22em;font-weight:800;text-transform:uppercase;color:#8a8695}" +
      "#gResta .gbig{font-size:32px;margin:0;text-align:left;color:#fff}" +
      "#gResta .gbiglab{font-size:10px;margin:0;color:#8a8695}" +
      "#gResta button{min-height:44px;border:none;border-radius:99px;background:none;font-family:inherit;font-size:14px;font-weight:800;color:var(--corc);cursor:pointer;padding:0 12px;flex:none}" +
      "#gResta button.prin{background:linear-gradient(135deg,var(--cor),var(--cor2));color:#fff;padding:0 20px}" +
      "#gResta .gtrilho{margin:10px 0 0;max-width:none;background:var(--bg5)}" +
      /* ---------- fim do treino em festa (tela 48): fundo na cor do studio ---------- */
      ".gwrap.festa{background:linear-gradient(180deg,var(--cor) 0%,var(--cor2) 100%)}" +
      ".gwrap.festa .gcard{background:none;border:none;box-shadow:none;max-height:none}" +
      ".gwrap.festa .gbarra,.gwrap.festa .gcont,.gwrap.festa .ggrupo,.gwrap.festa .gbase,.gwrap.festa .gtit,.gwrap.festa .gchip,.gwrap.festa .gtecl{display:none}" +
      ".gwrap.festa .gmarca{color:rgba(255,255,255,.8)}" +
      ".gwrap.festa .gtopo button{color:#fff}" +
      ".wtile2{background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.28);border-radius:18px;padding:12px 6px;text-align:center;color:#fff}" +
      ".wtile2 b{display:block;font-size:23px;font-weight:900;font-variant-numeric:tabular-nums;line-height:1}" +
      ".wtile2 i{display:block;font-style:normal;font-size:8.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.75);margin-top:5px}" +
      ".gwrap.festa .rpelab{color:#fff}" +
      ".gwrap.festa .rpebtn{background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.3);color:#fff}" +
      ".gwrap.festa .rpeok{color:rgba(255,255,255,.85)}" +
      ".gwrap.festa .gcglab{color:rgba(255,255,255,.8)}" +
      ".gwrap.festa .gfalta{background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.35);color:#fff}" +
      ".gwrap.festa .btnx{background:#fff!important;color:var(--cor-esc,#3b2b63)!important;box-shadow:none!important}" +
      ".gwrap.festa .vz{color:rgba(255,255,255,.7)}" +
      // ajuda (v706): a setinha do details é nossa (o marker nativo destoa)
      ".ajdt summary{list-style:none;position:relative;padding-right:24px}" +
      ".ajdt summary::-webkit-details-marker{display:none}" +
      ".ajdt summary:after{content:'\\2039';position:absolute;right:4px;top:-2px;transform:rotate(-90deg);color:#8a8695;font-size:17px}" +
      ".ajdt[open] summary:after{transform:rotate(90deg)}" +
      ".gwrap.festa .gpe .prin{background:rgba(255,255,255,.16);color:#fff;box-shadow:none;border:1px solid rgba(255,255,255,.3)}" +
      /* ---------- Início do redesenho (telas final-44/45/46) ----------
       * No Início a faixa colorida do topo some: o cabeçalho (saudação + avatar)
       * vive DENTRO do herói. As outras áreas continuam com a faixa de sempre.
       * Os textos do herói usam CLASSE de propósito: o modo claro reescreve
       * cores lendo o style inline, e o herói é escuro nos dois temas. */
      "body.semtopo .topo{display:none}" +
      ".htk2{font-size:10px;font-weight:800;letter-spacing:.26em;color:var(--corc);text-transform:uppercase}" +
      ".htit{font-weight:900;line-height:.94;letter-spacing:-.035em;text-transform:uppercase;margin:10px 0 8px;color:#fff;font-size:clamp(30px,10vw,44px)}" +
      ".hsub{font-size:13.5px;color:#cfcbdb}" +
      ".hgline{font-size:17px;font-weight:800;letter-spacing:-.01em;color:rgba(255,255,255,.16);padding:3px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      ".htdash{display:flex;align-items:center;gap:8px;margin:14px 0}" +
      ".htdash span{flex:none;height:6px;border-radius:99px}" +
      ".htdash .htn{flex:none;margin-left:auto;font-size:10.5px;font-weight:800;letter-spacing:.1em;color:rgba(255,255,255,.62);text-transform:uppercase}" +
      /* ---------- menu (tela 01): a gaveta vira página inteira ----------
       * Classes de propósito (não inline): o menu é montado em runtime e o
       * modo claro precisa de regra própria pra cada superfície dele. */
      ".mghd{background:linear-gradient(160deg,var(--cor),var(--cor2));border-radius:0 0 28px 28px;color:#fff;padding:calc(30px + env(safe-area-inset-top,0px)) 20px 28px;display:flex;align-items:center;gap:14px}" +
      ".mgav{width:62px;height:62px;border-radius:50%;background:rgba(255,255,255,.28);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:21px;overflow:hidden;flex:none}" +
      ".mgav img{width:100%;height:100%;object-fit:cover;border-radius:50%}" +
      ".mgnome{display:block;font-size:24px;font-weight:900;letter-spacing:-.02em;line-height:1.05}" +
      ".mgstudio{display:block;font-size:13.5px;color:rgba(255,255,255,.82);font-weight:700;margin-top:3px}" +
      ".mgcard{background:var(--bg2);border:1px solid rgba(255,255,255,.04);border-radius:24px;margin:14px 16px 0;padding:2px 16px}" +
      ".mgrow{display:flex;align-items:center;gap:13px;width:100%;min-height:64px;padding:12px 0;background:none;border:none;border-top:1px solid var(--bg5);cursor:pointer;font-family:inherit;text-align:left;color:#b9b4c6}" +
      ".mgrow:first-child{border-top:none}" +
      ".mgtit{display:block;font-size:16.5px;font-weight:800;color:#fff;letter-spacing:-.01em}" +
      ".mgsub{display:block;font-size:12.5px;color:#8a8695;margin-top:2px}" +
      ".mgbadge{margin-left:auto;min-width:27px;height:27px;border-radius:99px;background:var(--cor);color:#fff;font-size:13px;font-weight:800;display:flex;align-items:center;justify-content:center;padding:0 8px;flex:none}" +
      ".mgchev{margin-left:auto;flex:none;color:#57525f;line-height:0}" +
      // interruptor das preferências (tela 11): bolinha desliza e o fundo acende
      ".mgsw{margin-left:auto;flex:none;width:46px;height:28px;border-radius:99px;background:var(--bg4);position:relative;transition:background .18s}" +
      ".mgsw i{position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;transition:left .18s;box-shadow:0 1px 4px rgba(0,0,0,.35)}" +
      ".mgsw.on{background:var(--cor)}.mgsw.on i{left:21px}" +
      // conquistas encolhidas: só as 6 primeiras aparecem até o Ver todas
      /* !important de propósito: o botão da medalha nasce com display:block no
       * PRÓPRIO elemento, e estilo inline ganha da folha — sem isto o "Ver
       * todas / Mostrar menos" trocava o texto e a classe mas não escondia
       * medalha nenhuma. */
      "#cqGrid.enc>button:nth-child(n+7){display:none!important}" +
      /* ---------- conquista em tela cheia (estilo Nike Run) ----------
       * A medalha gira em 3D acompanhando o celular (giroscópio) e o brilho
       * caminha junto. Sem giroscópio, o dedo arrasta — e sozinha ela balança
       * de leve, pra nunca ficar parada e sem graça. */
      "#cqFull{display:none;position:fixed;inset:0;z-index:78;background:radial-gradient(120% 80% at 50% 18%,var(--cor-esc,#2a1b52) 0%,var(--bg0) 62%);" +
      "flex-direction:column;align-items:center;justify-content:center;padding:26px 22px calc(26px + env(safe-area-inset-bottom,0px));max-width:480px;margin:0 auto;overflow-y:auto}" +
      "#cqFull.on{display:flex}" +
      "#cqPalco{perspective:900px;flex:none;margin-bottom:6px}" +
      "#cqMed{position:relative;width:min(62vw,230px);aspect-ratio:1;border-radius:50%;transform-style:preserve-3d;" +
      "transition:transform .12s ease-out;display:flex;align-items:center;justify-content:center;" +
      "box-shadow:0 30px 70px -20px rgba(0,0,0,.85)}" +
      "#cqMed .aro{position:absolute;inset:0;border-radius:50%;background:conic-gradient(from 210deg,var(--cor),var(--corc),#fff,var(--corc),var(--cor));" +
      "-webkit-mask:radial-gradient(circle,transparent 0 62%,#000 63%);mask:radial-gradient(circle,transparent 0 62%,#000 63%)}" +
      "#cqMed .disco{position:absolute;inset:9%;border-radius:50%;background:linear-gradient(150deg,var(--cor2),var(--cor) 55%,var(--cor-esc,#241848));" +
      "border:1px solid rgba(255,255,255,.16)}" +
      "#cqMed .brilho{position:absolute;inset:0;border-radius:50%;pointer-events:none;" +
      "background:radial-gradient(60% 60% at var(--bx,32%) var(--by,26%),rgba(255,255,255,.55),rgba(255,255,255,.10) 45%,transparent 68%)}" +
      "#cqMed .ico{position:relative;color:#fff;line-height:0;transform:translateZ(26px);filter:drop-shadow(0 6px 14px rgba(0,0,0,.5))}" +
      "#cqMed .ico svg{width:min(26vw,96px);height:min(26vw,96px);stroke-width:1.3}" +
      "#cqMed.travada .disco{background:linear-gradient(150deg,var(--bg7),var(--bg4))}" +
      "#cqMed.travada .aro{background:conic-gradient(from 210deg,var(--bg7),var(--bg11),var(--bg7))}" +
      "#cqFull h3{font-size:clamp(24px,7vw,32px);font-weight:900;letter-spacing:-.02em;text-align:center;margin:18px 0 0}" +
      "#cqFull .cqsub{font-size:14px;color:#a9a4b5;text-align:center;margin-top:8px;line-height:1.5;max-width:300px}" +
      "#cqFull .cqsel{margin-top:12px;font-size:11px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:var(--corc)}" +
      "#cqFull .cqbar{width:min(280px,80%);height:6px;border-radius:4px;background:var(--bg5);margin-top:14px;overflow:hidden}" +
      "#cqFull .cqbar b{display:block;height:100%;background:linear-gradient(90deg,var(--cor),var(--corc))}" +
      "#cqFull .cqpe{display:flex;gap:10px;margin-top:26px;width:100%;max-width:330px}" +
      "#cqFull .cqpe button{flex:1;min-height:54px;border-radius:99px;border:none;font-family:inherit;font-size:15px;font-weight:800;cursor:pointer}" +
      "#cqFull .cqpe .prin{background:#fff;color:var(--cor-esc,#2a1b52)}" +
      "#cqFull .cqpe .sec{background:rgba(255,255,255,.10);color:#d6d2df}" +
      "@media (prefers-reduced-motion: reduce){#cqMed{transition:none}}" +
      "html.claro #cqVerMais{color:#544d63}" +
      ".mgq{display:flex;align-items:center;gap:13px;width:calc(100% - 32px);min-height:64px;background:rgba(var(--cor-rgb),.10);border:1px solid rgba(var(--cor-rgb),.5);border-radius:22px;margin:18px 16px 0;padding:14px 16px;cursor:pointer;font-family:inherit;text-align:left;color:var(--corc)}" +
      ".mgq .mgsub{color:var(--corc)}" +
      /* agenda (tela 14): o dia de hoje é o quadradinho branco; no claro vira
       * véu da cor (o teste do tema lê texto escuro + fundo não transparente) */
      ".aghoje{background:#fff;color:#191622;font-weight:800}" +
      // hábitos do dia em grade (HOJE EU JÁ) — feito = contorno da cor do studio
      ".habgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}" +
      ".habgrid button{min-height:62px;background:var(--bg2);border:1px solid var(--bg11);border-radius:16px;color:#8a8695;font-family:inherit;font-size:10.5px;font-weight:800;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;cursor:pointer;padding:6px 2px}" +
      ".habgrid button.on{background:rgba(var(--cor-rgb),.16);border-color:var(--cor);color:#fff}" +
      ".habgrid i{font-style:normal;line-height:0}" +
      ".habgrid u{display:none}" +
      "html.claro .habgrid button{background:#fff;border-color:#d9d5e3;color:#6c6678}" +
      "html.claro .habgrid button.on{background:rgba(var(--cor-rgb),.12);border-color:var(--cor);color:#241f31}" +
      /* ---------- placar do circuito (telas 07/08/09) ----------
       * Tela de resultado por tipo (AMRAP / For Time / EMOM-Tabata). Tudo por
       * CLASSE e escuro nos DOIS temas de propósito, igual ao player do treino
       * guiado — o modo claro reescreve cores lendo style inline, e aqui não. */
      /* cores por VARIÁVEL de propósito: o "fundo do app" das Configurações
       * troca a família --bg inteira, e o placar acompanha */
      "#wodPlacar{position:fixed;inset:0;z-index:71;overflow:auto;background:var(--bg0);color:#fff}" +
      ".wpcard{background:var(--bg1);border-radius:22px;padding:16px 18px;margin-top:14px}" +
      ".wpk{font-size:10.5px;font-weight:800;letter-spacing:.2em;color:#8a8695;text-transform:uppercase;margin-bottom:10px}" +
      ".wptile{background:var(--bg4);border:1px solid var(--bg11);border-radius:16px;padding:12px 8px;text-align:center;color:#fff}" +
      ".wptile i{display:block;font-style:normal;font-size:9.5px;font-weight:800;letter-spacing:.14em;color:#8a8695;text-transform:uppercase;margin-bottom:6px}" +
      ".wptile b{font-size:30px;font-weight:900;line-height:1;font-variant-numeric:tabular-nums}" +
      ".wptile b small{font-size:13px;font-weight:800;color:#8a8695;margin-left:2px}" +
      ".wpr{cursor:pointer;font-family:inherit}" +
      ".wpr.pior{border-color:var(--cor);background:rgba(var(--cor-rgb),.12)}" +
      ".wpchip{flex:1;min-height:52px;border-radius:16px;background:var(--bg2);border:1px solid var(--bg11);color:#8a8695;font-family:inherit;font-size:14px;font-weight:800;cursor:pointer}" +
      ".wpchip.on{background:rgba(var(--cor-rgb),.16);border-color:var(--cor);color:#fff}" +
      ".wpctipo{display:inline-flex;align-items:center;border-radius:99px;padding:7px 14px;font-size:11.5px;font-weight:800;letter-spacing:.06em;background:rgba(var(--cor-rgb),.18);border:1px solid rgba(var(--cor-rgb),.45);color:var(--corc);text-transform:uppercase}" +
      ".wplin{display:flex;align-items:center;gap:12px;min-height:48px;font-size:14.5px;border-top:1px solid var(--bg11)}" +
      ".wplin:first-of-type{border-top:none}" +
      ".wptg{flex:none;width:52px;height:30px;border-radius:99px;background:var(--bg8);border:none;position:relative;cursor:pointer}" +
      ".wptg::after{content:'';position:absolute;top:3px;left:3px;width:24px;height:24px;border-radius:50%;background:#fff;transition:left .15s}" +
      ".wptg.on{background:var(--cor)}.wptg.on::after{left:25px}" +
      ".wpobs{width:100%;background:var(--bg4);border:1px solid var(--bg11);border-radius:14px;color:#fff;font-family:inherit;font-size:14px;padding:12px;min-height:84px}" +
      /* ---------- questionário paginado (telas 02-06) ---------- */
      "#qaFluxo,#ckFluxo{position:fixed;inset:0;z-index:71;overflow:auto;background:var(--bg0);color:#fff}" +
      ".qaop{display:flex;align-items:center;gap:14px;width:100%;min-height:72px;background:var(--bg2);border:1px solid var(--bg11);border-radius:20px;padding:0 18px;font-family:inherit;color:#fff;cursor:pointer;margin-top:10px}" +
      ".qaop.on{border-color:var(--cor);background:rgba(var(--cor-rgb),.12)}" +
      ".qaop .qe{font-size:32px;line-height:1}" +
      ".qabar{display:flex;gap:6px;margin-top:12px}" +
      ".qabar i{flex:1;height:6px;border-radius:99px;background:var(--bg8)}" +
      ".qabar i.on{background:var(--cor)}" +
      /* ---------- frequencia cardiaca ao vivo (cinta/pulseira Bluetooth) ----------
       * So aparece quando existe caminho REAL: Web Bluetooth (Chrome no Android,
       * servico padrao 0x180D) ou a ponte do app de loja (window.MTNativo.fc).
       * Sem um dos dois, nem botao nasce — nada de botao que finge conectar. */
      "#fcCard{background:var(--bg5);border:1px solid rgba(255,255,255,.06);border-radius:14px;padding:12px;margin-top:10px;text-align:left}" +
      "#fcBt{width:100%;min-height:46px;border-radius:99px;background:var(--bg4);border:1px solid rgba(255,255,255,.08);color:#d6d2df;font-family:inherit;font-size:13.5px;font-weight:800;cursor:pointer}" +
      "#fcBt.on{border-color:#f87171;color:#f87171}" +
      "#fcVivo{display:none;align-items:center;gap:13px;margin-top:11px}" +
      "#fcVivo.on{display:flex}" +
      "#fcBpm{font-size:36px;font-weight:900;font-variant-numeric:tabular-nums;line-height:1}" +
      ".fcbat{display:inline-block;font-style:normal;line-height:1}" +
      "@keyframes fcbate{0%,100%{transform:scale(1)}16%{transform:scale(1.25)}34%{transform:scale(1)}}" +
      ".fcbat.pulsa{animation:fcbate 1s infinite}" +
      "@media (prefers-reduced-motion: reduce){.fcbat.pulsa{animation:none}}" +
      ".fczb{display:flex;gap:3px;margin-top:7px}" +
      ".fczb i{flex:1;height:7px;border-radius:3px;background:var(--bg11)}" +
      "#gFc{display:none;margin-left:auto;align-items:center;gap:5px;font-size:12px;font-weight:800;color:#f87171;background:rgba(248,113,113,.12);border-radius:99px;padding:0 12px;min-height:34px}" +
      "#gFc.on{display:inline-flex}" +
      ".gwrap.festa #gFc{display:none}" +
      // selo da técnica de intensidade (drop-set, up set…) — laranja porque é
      // aviso de esforço, não é a cor do studio
      ".tecchip{display:inline-block;font-size:9.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#fdba74;background:rgba(251,146,60,.14);border:1px solid rgba(251,146,60,.4);border-radius:99px;padding:2px 8px;vertical-align:middle;margin-left:7px;white-space:nowrap}" +
      ".gwrap .tecchip{margin:0;font-size:10px;padding:4px 11px}" +
      "</style>" + (raiz.MT_APP_SKIN ? "<style>" + raiz.MT_APP_SKIN.css + "</style>" : "") + "</head><body class='semtopo'>" + (raiz.MT_APP_SKIN ? "<script>" + raiz.MT_APP_SKIN.js + "<\/script>" : "") +
      "<div class='topo'>" +
      // a marca do studio ganha uma linha inteira: dividindo espaço com a foto
      // e os chips, um nome comprido virava três linhas ou saía cortado
      "<div class='tpmarca'>" + (LOGOAPP ? "<img src='" + LOGOAPP + "' alt=''>" : "") + "<span class='k'>" + esc(studio).toUpperCase() + "</span></div>" +
      "<div style='display:flex;align-items:center;gap:11px;'>" +
      // tocar no avatar troca a foto (a do painel vem no pacote; a que o aluno
      // escolher aqui vale mais, porque é ele mesmo se vendo)
      "<button type='button' class='tpav' id='avBtn' aria-label='Trocar a sua foto'>" +
      "<img id='avImg' alt=''" + (FOTOAL ? " src='" + FOTOAL + "'" : " style='display:none;'") + ">" +
      "<span id='avIni'" + (FOTOAL ? " style='display:none;'" : "") + ">" + esc(INICIAIS) + "</span>" +
      "<span class='tpavc' aria-hidden='true'><svg width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><path d='M3 8.5h3.5L8 6h8l1.5 2.5H21V19H3z'/><circle cx='12' cy='13' r='3.2'/></svg></span></button>" +
      "<input id='avFile' type='file' accept='image/*' style='display:none;'>" +
      "<div style='flex:1;min-width:0;'><h1 style='padding:0;margin:0;'>" + esc(a.nome.split(" ")[0]) + "</h1><div id='secTit' style='color:rgba(255,255,255,.82);font-size:12.5px;font-weight:700;margin-top:2px;'></div></div>" +
      // selo de nível SEPARADO do chip de XP: o teste lê o primeiro número do
      // #xpChip como XP — um "Nv 3" lá dentro quebraria a conta
      "<span id='nvChip' class='tpchip'>" +
      "<svg width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='#fff' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M12 3l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.4 6.7 19.1l1-5.8-4.2-4.1 5.9-.9z'/></svg>" +
      "Nv <b id='nvNum'>1</b></span>" +
      "<span id='xpChip' class='tpchip'>" +
      "<svg width='13' height='13' viewBox='0 0 24 24' fill='#fff' aria-hidden='true'><path d='M13 2 3 14h7l-1 8 10-12h-7z'/></svg>" +
      "<span><b id='xpNum'>0</b> XP</span></span></div>" +
      // sequência e hábitos do dia dentro da faixa — trocaSec só mostra no Início
      "<div id='topoExtra'>" +
      "<div class='tpsk'><span class='tpskico'>" + crIco(MT_CQICONS.fogo, 17) + "</span>" +
      "<span class='tpskt'><b id='habStreak' class='tpskn'></b>" +
      "<i class='tpsklab'>Sequência</i><i id='habRec' class='tpskrec'></i></span></div></div></div>" +
      // barra de abas fixa embaixo (estilo app nativo — itens preenchidos pelo script)
      // o menu já nasce montado no HTML (aparece até em visualizador sem JS); o script refina depois
      "<nav id='navApp' aria-label='Menu do app' style='position:fixed;bottom:0;left:0;right:0;max-width:480px;margin:0 auto;background:rgba(var(--bg0-rgb),.88);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-top:1px solid rgba(255,255,255,.04);display:flex;z-index:50;padding:6px 4px calc(6px + env(safe-area-inset-bottom,0px));'>" +
      [["<path d='M3 10 12 3l9 7'/><path d='M5 8.8V21h14V8.8'/><path d='M9.5 21v-6h5v6'/>", "Hoje"],
        ["<path d='M7 7v10M4 9v6M17 7v10M20 9v6M7 12h10'/>", "Treinos"],
        ["<polyline points='3 17 9 11 13 15 21 7'/><polyline points='15 7 21 7 21 13'/>", "Evolução"],
        ["<path d='M4 6.5h16M4 12h16M4 17.5h16'/>", "Menu"]].map(function (mN) {
        return "<button class='nitem' style='flex:1;min-width:0;background:none;border:none;font-family:inherit;color:#8a8695;display:flex;flex-direction:column;align-items:center;gap:3px;padding:7px 2px 5px;border-radius:9px;'>" +
          "<span style='line-height:0;'><svg width='21' height='21' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'>" + mN[0] + "</svg></span>" +
          "<span style='font-size:8.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;white-space:nowrap;'>" + mN[1] + "</span></button>";
      }).join("") +
      "</nav>" +
      // menu (tela 01): a gaveta é uma PÁGINA inteira que desliza da direita,
      // por baixo da barra de abas (z 49 < 50) — o aluno continua vendo HOJE/
      // TREINOS/EVOLUÇÃO/MENU embaixo, igual ao desenho final
      "<div id='fundoMenuApp' style='display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:48;'></div>" +
      "<div id='menuApp' aria-label='Todas as áreas do app' style='position:fixed;top:0;bottom:0;left:0;right:0;max-width:480px;margin:0 auto;background:var(--bg0);z-index:49;transform:translateX(105%);transition:transform .24s ease;padding:0 0 calc(110px + env(safe-area-inset-bottom,0px));overflow:auto;'></div>" +
      // ---------- Início do redesenho (telas final-44/45/46 do Claude Design) ----------
      // O carrossel É a tela: cada treino prescrito vira um herói de tela cheia
      // (foto/gradiente, lista fantasma de exercícios, data, título gigante,
      // risquinhos "1 de 3 · arraste" e o botão grandão). O cabeçalho com a
      // saudação e o avatar flutua por cima e não se move com o arrasto.
      (function () {
        var cardCss = "flex:none;width:100%;scroll-snap-align:center;position:relative;overflow:hidden;height:clamp(470px,64vh,570px);background:var(--bg0);";
        var botCss = "position:absolute;left:0;right:0;bottom:0;padding:0 20px 18px;";
        var btnCss = "width:100%;min-height:56px;font-size:16px;";
        var ghost = function (linhas) {
          return "<div style='position:absolute;left:20px;top:112px;right:40px;'>" + linhas.map(function (l) {
            return "<div class='hgline'>" + esc(l) + "</div>";
          }).join("") + "</div>";
        };
        var hero = (fichasApp || planoApp)
          ? "<div id='heroTreino' style='" + cardCss + "'>" +
            // fundo: gradiente da cor do studio + círculos decorativos
            "<div style='position:absolute;inset:0;background:linear-gradient(160deg,var(--cor),var(--cor2) 52%,var(--bg0) 100%);overflow:hidden;'>" +
            "<div style='position:absolute;top:-70px;right:-90px;width:320px;height:320px;border-radius:50%;background:rgba(255,255,255,.09);'></div>" +
            "<div style='position:absolute;top:30px;right:-170px;width:320px;height:320px;border-radius:50%;border:1.5px solid rgba(255,255,255,.14);'></div></div>" +
            // lista fantasma: os exercícios da ficha do dia, apagadinhos (o script preenche)
            "<div id='htGhost' style='position:absolute;left:20px;top:112px;right:40px;'></div>" +
            // foto da ficha do dia (o professor escolhe uma por ficha) — some quando não tem
            "<img id='htFoto' alt='' style='display:none;position:absolute;inset:0;width:100%;height:100%;object-fit:cover;'>" +
            // o véu fica SEMPRE: escurece embaixo pro texto valer nos dois fundos
            "<div id='htVeu' style='position:absolute;inset:0;background:linear-gradient(180deg,rgba(13,12,16,.55) 0%,rgba(13,12,16,.08) 34%,rgba(13,12,16,.88) 74%,var(--bg0) 100%);pointer-events:none;'></div>" +
            "<div style='" + botCss + "'>" +
            "<div class='htk htk2'><span id='htRot'></span></div>" +
            "<div id='htTitulo' class='htit'></div>" +
            "<div id='htSub' class='hsub'></div>" +
            "<div class='htdash'></div>" +
            "<button id='htVer' class='btnx' style='" + btnCss + "'>Começar treino</button></div></div>"
          : "";
        /* cards extras: nascem escondidos e o script mostra os que NÃO repetem o
         * treino que o card principal já está mostrando (plano do dia). O rótulo
         * de cada um sai do data-hk lá embaixo — "HOJE" só no primeiro card. */
        // musculação: em dia de circuito/corrida/descanso o aluno não tinha
        // como chegar na ficha pelo carrossel (o script preenche pelo rodízio)
        var fichaCard = "";
        if (fichasApp && fichasApp.length) {
          fichaCard = "<div id='heroFicha' style='display:none;" + cardCss + "'>" +
            "<div style='position:absolute;inset:0;background:linear-gradient(160deg,var(--cor),var(--cor2) 52%,var(--bg0) 100%);overflow:hidden;'>" +
            "<div style='position:absolute;top:-70px;right:-90px;width:320px;height:320px;border-radius:50%;background:rgba(255,255,255,.09);'></div></div>" +
            "<div id='hfGhost' style='position:absolute;left:20px;top:112px;right:40px;'></div>" +
            "<img id='hfFoto' alt='' style='display:none;position:absolute;inset:0;width:100%;height:100%;object-fit:cover;'>" +
            "<div style='position:absolute;inset:0;background:linear-gradient(180deg,rgba(13,12,16,.55) 0%,rgba(13,12,16,.08) 34%,rgba(13,12,16,.88) 74%,var(--bg0) 100%);pointer-events:none;'></div>" +
            "<div style='" + botCss + "'>" +
            "<div class='htk htk2' data-hk='MUSCULAÇÃO'>MUSCULAÇÃO</div>" +
            "<div class='htit' id='hfTit'></div>" +
            "<div class='hsub' id='hfSub'></div>" +
            "<div class='htdash'></div>" +
            "<button data-carrver='ficha' class='btnx' style='" + btnCss + "'>Começar treino</button></div></div>";
        }
        var wodCard = "";
        if (ve("wod") && wodsApp.length) {
          var w0 = wodsApp[0];
          var movsG = (w0.movs && w0.movs.length ? w0.movs.map(function (m) { return ((m.q ? m.q + " " : "") + (m.n || "")).trim(); })
            : (w0.mov || [])).filter(Boolean).slice(0, 7);
          var capaW = capaTipo(w0);
          wodCard = "<div id='heroWod' style='display:none;" + cardCss + "'>" +
            (capaW ? "<img alt='' style='position:absolute;inset:0;width:100%;height:100%;object-fit:cover;' src='" + capaW + "'>" : ghost(movsG)) +
            "<div style='position:absolute;inset:0;background:linear-gradient(180deg,rgba(13,12,16,.45) 0%,rgba(13,12,16,0) 34%,rgba(13,12,16,.86) 74%,var(--bg0) 100%);pointer-events:none;'></div>" +
            "<div style='" + botCss + "'>" +
            "<div class='htk htk2' data-hk='CIRCUITO'>CIRCUITO</div>" +
            "<div class='htit'>" + esc(w0.nome || "Circuito") + "</div>" +
            "<div class='hsub'>" + esc((w0.resumo || "circuito completo") + " · " + (((w0.movs && w0.movs.length) || (w0.mov && w0.mov.length)) || 0) + " movimentos") + "</div>" +
            "<div class='htdash'></div>" +
            "<button data-carrver='wod' class='btnx' style='" + btnCss + "'>Começar circuito</button></div></div>";
        }
        var crCard = "";
        if (ve("cardio") && cardiosApp.length) {
          var c0 = cardiosApp[0];
          var alvoCr = alvoCardio(c0) === "livre" ? "treino livre" : alvoCardio(c0);
          var rotCr = { corrida: "CORRIDA", caminhada: "CAMINHADA", bike: "BIKE" }[c0.mod] || "CARDIO";
          var btnCr = { corrida: "Começar corrida", caminhada: "Começar caminhada", bike: "Começar pedal" }[c0.mod] || "Começar";
          var capaC = capaTipo(c0);
          crCard = "<div id='heroCr' style='display:none;" + cardCss + "'>" +
            // foto do treino quando tem; senão o traçado decorativo do GPS
            (capaC ? "<img alt='' style='position:absolute;inset:0;width:100%;height:100%;object-fit:cover;' src='" + capaC + "'>"
              : "<svg viewBox='0 0 200 200' aria-hidden='true' style='position:absolute;top:36px;right:-24px;width:72%;opacity:.5;stroke:var(--cor);' fill='none' stroke-width='10' stroke-linecap='round'><path d='M30 172 C 18 120, 82 132, 92 92 S 152 64, 152 32 S 102 12, 112 48'/></svg>") +
            "<div style='position:absolute;inset:0;background:linear-gradient(180deg,rgba(13,12,16,.45) 0%,rgba(13,12,16,0) 34%,rgba(13,12,16,.86) 74%,var(--bg0) 100%);pointer-events:none;'></div>" +
            "<div style='" + botCss + "'>" +
            "<div class='htk htk2' data-hk='" + rotCr + "'>" + rotCr + "</div>" +
            "<div class='htit'>" + esc(c0.nome || "Cardio") + "</div>" +
            "<div class='hsub'>" + esc(alvoCr) + "</div>" +
            "<div class='htdash'></div>" +
            "<button data-carrver='cardio' class='btnx' style='" + btnCss + "'>" + btnCr + "</button></div></div>";
        }
        // cabeçalho flutuante: marca do studio + saudação + avatar (o mesmo
        // toque de trocar a foto do topo — aqui o topo colorido fica escondido)
        var heroTopo = "<div id='heroTopo' style='position:absolute;top:0;left:0;right:0;padding:calc(14px + env(safe-area-inset-top,0px)) 20px 0;display:flex;align-items:center;gap:12px;z-index:2;pointer-events:none;'>" +
          "<div style='min-width:0;flex:1;'>" +
          "<div style='font-size:9.5px;letter-spacing:.22em;font-weight:800;color:rgba(255,255,255,.72);text-transform:uppercase;'>" + esc(studio).toUpperCase() + "</div>" +
          "<div id='heroSauda' style='font-size:19px;font-weight:800;color:#fff;letter-spacing:-.01em;margin-top:3px;'>" + esc(a.nome.split(" ")[0]) + "</div></div>" +
          "<button type='button' id='avBtn2' aria-label='Trocar a sua foto' style='pointer-events:auto;flex:none;width:42px;height:42px;padding:0;border-radius:50%;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.3);display:flex;align-items:center;justify-content:center;font-size:13.5px;font-weight:800;color:#fff;font-family:inherit;cursor:pointer;overflow:hidden;'>" +
          "<img id='avImg2' alt='' style='width:100%;height:100%;object-fit:cover;border-radius:50%;" + (FOTOAL ? "" : "display:none;") + "'" + (FOTOAL ? " src='" + FOTOAL + "'" : "") + ">" +
          "<span id='avIni2'" + (FOTOAL ? " style='display:none;'" : "") + ">" + esc(INICIAIS) + "</span></button></div>";
        if (!hero && !fichaCard && !wodCard && !crCard) {
          /* aluno ainda sem treino prescrito: a faixa com a saudação + o card do
           * PRIMEIRO DIA (v667) — antes era um retângulo mudo e o aluno novo não
           * tinha nenhum caminho: nem "seu treino está sendo montado", nem chat,
           * nem as 3 perguntinhas (que ficavam enterradas embaixo de dois cards
           * vazios). O card fica DENTRO do #blocoHoje de propósito: filho de
           * blocoHoje herda o data-sec dele e não passa pelo classificador. */
          return "<div id='blocoHoje' style='position:relative;'>" +
            "<div style='height:170px;background:linear-gradient(160deg,var(--cor),var(--cor2));border-radius:0 0 26px 26px;'></div>" + heroTopo +
            "<div class='cardx' id='primeiroDia' style='border-color:var(--cor);'>" +
            "<h2>Seu primeiro dia aqui</h2>" +
            "<div class='vz' style='text-align:left;padding:2px 0 10px;'>" + esc(studio.split(" ")[0]) + " está montando o seu treino — assim que publicar, ele aparece aqui em cima. Enquanto isso:</div>" +
            "<button class='btnx' id='pdOnb' data-ajgo='inicio' data-ajgoto='onbCard' style='width:100%;margin-bottom:9px;'>Responder 3 perguntinhas (30 s)</button>" +
            "<button class='btnx' data-ajgo='chat' style='width:100%;background:var(--bg4);border:1px solid rgba(255,255,255,.08);'>Falar com " + esc(studio.split(" ")[0]) + "</button>" +
            (vidsApp.length ? "<button class='btnx' data-ajgo='inicio' data-ajgoto='vidCard' style='width:100%;margin-top:9px;background:var(--bg4);border:1px solid rgba(255,255,255,.08);'>Ver os conteúdos de " + esc(studio.split(" ")[0]) + "</button>" : "") +
            "</div></div>";
        }
        return "<div id='blocoHoje' style='position:relative;'>" +
          "<div class='carr' id='heroCarr' aria-label='Treinos de hoje'>" + hero + fichaCard + wodCard + crCard + "</div>" + heroTopo + "</div>";
      })() +
      /* ---------- MINHA SEMANA: um card só ----------
       * Estavam separados o card do coach (com anel X/Y), os chips seg-dom e um
       * terceiro card com a barra "Meta da semana" + o Treinei hoje!. Os três
       * diziam a MESMA coisa ("4 de 4 nesta semana") em três desenhos, e a ação
       * principal ficava enterrada no fim. Agora: recado do coach, os dias, uma
       * linha de resumo e o botão — nessa ordem, num bloco só.
       * A sequência de SEMANAS na meta saiu daqui pras Conquistas (é conquista,
       * não é status de hoje) e a de DIAS DE HÁBITO foi pro card dos hábitos,
       * que é do que ela fala — embaixo dos chips de treino ela era lida como
       * "dias treinados", que é outra coisa. */
      "<div class='cardx' id='semBlock'><h2>Minha semana</h2>" +
      "<div style='background:var(--bg2);border-radius:22px;padding:18px;'>" +
      "<div id='coachTxt' style='font-size:14px;line-height:1.5;color:#cfcbdb;font-weight:600;margin-bottom:16px;'></div>" +
      "<div id='diasSem' style='display:flex;gap:6px;justify-content:space-between;'></div>" +
      "<div id='semResumo' style='display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:14px 0 16px;font-size:14px;font-weight:800;'></div>" +
      "<button class='btnx' id='btnFeito' style='width:100%;padding:15px;font-size:15px;'>Treinei hoje!</button>" +
      "<div id='medalhas' style='font-size:11.5px;color:#6e6a78;text-align:center;margin-top:10px;'></div></div></div>" +
      // depoimento (v694): só aparece quando o PROFESSOR pediu (D.pedeDepo) e
      // o aluno ainda não escreveu — a lógica de mostrar mora perto do TERMO
      "<div class='cardx' id='depoCard' style='display:none;'>" +
      "<h2>Seu personal pediu um depoimento 💜</h2>" +
      "<div class='vz' style='text-align:left;padding:2px 0 8px;'>Conta em poucas linhas como está sendo treinar — ele pode usar na página dele, com o seu primeiro nome.</div>" +
      "<textarea id='depoTx' maxlength='300' rows='3' style='width:100%;'></textarea>" +
      "<button class='btnx' id='depoBt' style='width:100%;margin-top:10px;'>Enviar pro professor</button></div>" +
      // hábitos do dia em grade, estilo "HOJE EU JÁ" — com a sequência de dias
      // de hábito logo abaixo (era #stkLine, que morava embaixo dos chips)
      "<div class='cardx' id='habWrap'><h2>Hoje eu já</h2><div id='habBox' class='habgrid' aria-label='Hábitos de hoje'></div>" +
      "<div id='stkLine' style='display:none;align-items:center;gap:7px;margin-top:12px;font-size:13px;font-weight:700;color:#fb923c;'></div></div>" +
      // onboarding de 30 segundos (só aparece no primeiro uso — some depois de responder)
      "<div class='cardx' id='onbCard' style='display:none;border-color:var(--cor);'>" +
      "<h2>Bora começar!</h2><div class='vz' style='text-align:left;padding:2px 0 8px;'>3 perguntinhas rápidas pro " + esc(a.nome.split(" ")[0]) + " do futuro agradecer:</div>" +
      "<div style='font-size:12.5px;font-weight:700;margin-bottom:5px;'>Seu objetivo principal</div>" +
      "<div id='onbObj' style='display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;'></div>" +
      "<div style='font-size:12.5px;font-weight:700;margin-bottom:5px;'>Quantos dias por semana dá pra treinar?</div>" +
      "<div id='onbDias' style='display:flex;gap:6px;margin-bottom:10px;'></div>" +
      "<input id='onbDor' placeholder='Alguma dor ou limitação? (opcional)' style='width:100%;margin-bottom:10px;'>" +
      "<button class='btnx' id='onbOk' style='width:100%;'>Pronto, bora treinar!</button></div>" +
      // Progresso e retrospectiva saíram daqui (pedido do Raphael): moram na
      // aba Conquistas, e sem os dados de CORPO — peso e gordura ficam no Corpo
      // recado do professor (tela 13): avatar com as iniciais do studio,
      // kicker "Recado do <studio>" e o selo "fixado" — filete da cor na esquerda
      (((st.config || {}).mural || []).length
        ? "<div class='cardx'><div style='background:var(--bg2);border-radius:22px;padding:18px 20px;border-left:3px solid var(--cor);'>" +
          "<div style='display:flex;align-items:center;gap:10px;margin-bottom:8px;'>" +
          "<span aria-hidden='true' style='flex:none;width:34px;height:34px;border-radius:50%;background:rgba(var(--cor-rgb),.22);color:var(--corc);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;overflow:hidden;'>" +
          (LOGOAPP ? "<img src='" + LOGOAPP + "' alt='' style='width:100%;height:100%;object-fit:cover;'>" : esc(String(studio || "?").trim().split(/\s+/).slice(0, 2).map(function (w) { return (w[0] || "").toUpperCase(); }).join(""))) + "</span>" +
          "<div style='flex:1;font-size:10.5px;font-weight:800;letter-spacing:.18em;color:#8a8695;text-transform:uppercase;'>Recado do " + esc(studio.split(" ")[0]) + "</div>" +
          "<span style='font-size:11px;color:#6e6a78;'>fixado</span></div>" +
          ((st.config || {}).mural || []).map(function (av) {
            return "<div style='font-size:14.5px;line-height:1.55;padding:5px 0;'>" + esc(av) + "</div>";
          }).join("") + "</div></div>"
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
      // ---------- Agenda (tela 14): cabeçalho com a próxima sessão ----------
      // Preenchido em runtime (pintaAgTopo) porque a próxima sessão pode vir
      // da nuvem (ptagenda) e muda quando o aluno pede horário.
      "<div class='cardx' id='agTopo' style='margin:0;'>" +
      "<div style='background:linear-gradient(160deg,var(--cor),var(--cor2));padding:26px 20px 22px;color:#fff;'>" +
      "<div style='font-size:9.5px;letter-spacing:.22em;font-weight:800;text-transform:uppercase;color:rgba(255,255,255,.75);'>Minha agenda</div>" +
      "<div id='agProxTit' style='font-size:30px;font-weight:900;letter-spacing:-.03em;margin-top:2px;'>Nada marcado</div>" +
      "<div id='agProxSub' style='font-size:13px;color:rgba(255,255,255,.85);margin-top:2px;'></div>" +
      "<div id='agTopoBts' style='display:flex;gap:10px;margin-top:14px;'></div></div></div>" +
      (sessApp.length ? "<div class='cardx'><h2>Minhas sessões com " + esc(studio) + "</h2>" +
        sessApp.map(function (x, si) {
          var pd = x.d.split("-");
          return "<div class='kv'><span>" + pd[2] + "/" + pd[1] + (x.h ? " às " + x.h : "") + "</span><span>te espero!</span></div>" +
            (si === 0 ? "<div id='sconfBox' data-d='" + x.d + "' data-h='" + esc(x.h) + "' style='display:flex;gap:8px;margin:8px 0 4px;'>" +
              "<button data-pconf='1' style='flex:1;background:linear-gradient(135deg,var(--cor),var(--corc));border:none;color:#fff;border-radius:99px;padding:9px 0;font-weight:800;font-size:13px;font-family:inherit;cursor:pointer;'>Confirmo presença ✓</button>" +
              "<button data-pconf='0' style='flex:1;background:var(--bg4);border:1px solid rgba(255,255,255,.06);color:#a9a4b5;border-radius:99px;padding:9px 0;font-size:13px;font-family:inherit;cursor:pointer;'>Não vou conseguir</button></div>" : "");
        }).join("") + "</div>" : "") +
      "<div class='cardx'><h2>Agenda</h2>" +
      "<div id='agCal'></div>" +
      // legenda da tela 14: quadradinho cheio = confirmado; tracejado = pedido
      "<div style='display:flex;gap:16px;align-items:center;margin-top:10px;font-size:12px;color:#8a8695;'>" +
      "<span style='display:inline-flex;align-items:center;gap:6px;'><i style='width:12px;height:12px;border-radius:4px;background:linear-gradient(135deg,var(--cor),var(--corc));'></i>confirmado</span>" +
      "<span style='display:inline-flex;align-items:center;gap:6px;'><i style='width:12px;height:12px;border-radius:4px;border:1.5px dashed var(--corc);'></i>esperando resposta</span></div>" +
      "<div id='agDia' style='margin-top:12px;'></div>" +
      "<div id='agForm' style='display:none;margin-top:10px;'>" +
      "<div style='display:flex;gap:8px;'><select id='agHora' style='flex:1'></select></div>" +
      "<input id='agObs' placeholder='Observação (opcional)' style='width:100%;margin-top:8px;'>" +
      "<button class='btnx' id='agPede' style='width:100%;min-height:58px;font-size:16px;margin-top:10px;'>+ Pedir um horário</button></div>" +
      // atalho da tela 14: o botão fica visível SEMPRE — tocar seleciona o dia
      // de hoje e abre o formulário de pedido logo acima
      "<button class='btnx' id='agPedeJa' style='width:100%;min-height:58px;font-size:16px;margin-top:12px;'>+ Pedir um horário</button>" +
      "<div class='vz' id='agNota' style='font-size:11.5px;'>Toque num dia pra ver os horários ou pedir um novo.</div>" +
      "<div id='agPend' style='text-align:center;font-size:12.5px;color:#8a8695;margin-top:8px;'></div></div>" +
      // ---------- Evolução (telas 49/41/42/32): cabeçalho por aba + 4 pílulas ----------
      // Conquistas mostra o anel do nível; Corpo/Cargas/Marcas trocam o
      // cabeçalho pelo número da aba (delta de peso, recordes e marcas do mês)
      "<div class='cardx' id='evTopo' style='margin:0;'>" +
      "<div style='background:linear-gradient(160deg,var(--cor),var(--cor2));padding:24px 20px 20px;color:#fff;display:flex;align-items:center;gap:16px;'>" +
      "<span id='evTopoNv' style='display:flex;align-items:center;gap:16px;flex:1;min-width:0;'>" +
      "<div id='evRing' style='flex:none;width:86px;height:86px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:conic-gradient(#fff 0 0%,rgba(255,255,255,.25) 0% 100%);'>" +
      "<div style='width:70px;height:70px;border-radius:50%;background:rgba(0,0,0,.28);display:flex;flex-direction:column;align-items:center;justify-content:center;'>" +
      "<b id='evNvNum' style='font-size:26px;font-weight:900;line-height:1;'>1</b>" +
      "<span style='font-size:8px;font-weight:800;letter-spacing:.18em;margin-top:2px;'>NÍVEL</span></div></div>" +
      "<div style='min-width:0;flex:1;'>" +
      "<div style='font-size:9.5px;letter-spacing:.22em;font-weight:800;text-transform:uppercase;color:rgba(255,255,255,.75);'>Minha evolução</div>" +
      "<div id='evXp' style='font-size:26px;font-weight:900;letter-spacing:-.02em;margin-top:2px;'>0 XP</div>" +
      "<div style='font-size:11.5px;color:rgba(255,255,255,.85);margin-top:3px;'>treino = 10 XP · hábito = 2 XP · check-in = 20 XP</div>" +
      "<div id='evFalta' style='font-size:11.5px;font-weight:700;color:rgba(255,255,255,.9);'></div></div></span>" +
      "<span id='evTopoAlt' style='display:none;flex:1;min-width:0;'>" +
      "<span id='evAltK' style='display:block;font-size:9.5px;letter-spacing:.22em;font-weight:800;text-transform:uppercase;color:rgba(255,255,255,.75);'></span>" +
      "<span style='display:flex;align-items:baseline;gap:10px;margin-top:2px;'>" +
      "<b id='evAltN' style='font-size:42px;font-weight:900;letter-spacing:-.03em;line-height:1.05;'></b>" +
      "<span id='evAltS' style='font-size:13.5px;font-weight:700;color:rgba(255,255,255,.9);'></span></span></span></div>" +
      "<div id='evAbas' style='display:flex;gap:8px;padding:14px 20px 0;overflow-x:auto;scrollbar-width:none;'>" +
      "<button type='button' data-evsub-bt='conq' style='flex:none;min-height:44px;padding:0 18px;border-radius:99px;background:var(--cor);border:1px solid var(--cor);color:#fff;font-family:inherit;font-size:14px;font-weight:800;cursor:pointer;'>Conquistas</button>" +
      "<button type='button' data-evsub-bt='corpo' style='flex:none;min-height:44px;padding:0 18px;border-radius:99px;background:var(--bg4);border:1px solid var(--bg11);color:#a9a4b5;font-family:inherit;font-size:14px;font-weight:800;cursor:pointer;'>Corpo</button>" +
      "<button type='button' data-evsub-bt='cargas' style='flex:none;min-height:44px;padding:0 18px;border-radius:99px;background:var(--bg4);border:1px solid var(--bg11);color:#a9a4b5;font-family:inherit;font-size:14px;font-weight:800;cursor:pointer;'>Cargas</button>" +
      "<button type='button' data-evsub-bt='marcas' style='flex:none;min-height:44px;padding:0 18px;border-radius:99px;background:var(--bg4);border:1px solid var(--bg11);color:#a9a4b5;font-family:inherit;font-size:14px;font-weight:800;cursor:pointer;'>Marcas</button></div></div>" +
      // páginas novas (telas 42 e 32) — pintadas em runtime dos dados do aparelho
      // o #esfBox mora DENTRO do cardx da pílula Cargas de propósito: herda o
      // data-sec/data-evsub do pai e pintaCargas só reescreve o #cgBox, nunca o irmão
      "<div class='cardx' id='evCargas'><div id='mcBox'></div><div id='cgBox' class='vz'>Anote as cargas nos treinos e elas aparecem aqui.</div><div id='esfBox'></div></div>" +
      "<div class='cardx' id='evMarcas'><div id='mkBox' class='vz'>Suas marcas aparecem aqui.</div></div>" +
      "<div class='cardx'><h2>Conquistas</h2>" +
      "<div id='nvCard' style='margin-bottom:12px;'></div>" +
      "<div id='cqGrid' style='display:grid;grid-template-columns:repeat(3,1fr);gap:8px;'></div>" +
      // a grade é retrátil: nascem 6 medalhas e o resto abre por aqui (pedido
      // do Raphael — a lista só cresce com o tempo)
      "<button type='button' id='cqVerMais' style='display:none;width:100%;min-height:48px;margin-top:10px;border-radius:99px;border:1px solid var(--bg11);background:var(--bg2);color:#b9b4c6;font-family:inherit;font-size:13.5px;font-weight:700;cursor:pointer;'></button>" +
      // ordem do Raphael: medalhas → peso/sequência → semanas → mapa do ano →
      // retrospectiva; o botão do Stories fecha a página. O ranking da turma
      // saiu na v607 — ele mora na Comunidade
      "<div id='cqTiles' style='display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px;'></div>" +
      "<div id='cqGraf' style='margin-top:14px;'></div>" +
      "<div id='mapaAno' style='margin-top:14px;'></div>" +
      // retrospectiva do mês fechado: aparece no comecinho do mês seguinte,
      // logo abaixo do mapa do ano, e some ao fechar (sem dado de corpo)
      "<div id='retroCard' style='display:none;margin-top:14px;background:var(--bg2);border:1px solid rgba(255,255,255,.04);border-radius:20px;padding:14px 16px;'>" +
      "<div class='wpk' id='retroTit' style='margin:0 0 6px;'>Retrospectiva</div>" +
      "<div id='retroBox'></div>" +
      "<div style='display:flex;gap:8px;margin-top:12px;'>" +
      "<button class='btnx' id='retroShare' style='flex:2;'>Compartilhar meu mês</button>" +
      "<button class='btnx' id='retroFecha' style='flex:1;background:var(--bg4);border:1px solid rgba(255,255,255,.06);color:#a9a4b5;box-shadow:none;'>Fechar</button></div></div>" +
      "<button class='btnx' id='btnCardStories' style='display:block;width:100%;text-align:center;margin-top:10px;'>Gerar card pro Stories</button></div>" +
      /* ---------- cabeçalho da área Treinos: faixa roxa + as três abas ----------
       * A faixa vinha DEPOIS das abas e só existia dentro da lista de fichas —
       * na tela as abas apareciam soltas lá em cima, antes de qualquer título.
       * Agora é o mesmo desenho da Evolução: faixa colorida em cima, pílulas
       * logo abaixo dela, tudo num bloco só que fica visível nas três abas. O
       * texto da faixa troca junto com a aba (trocaTrSub → TRHEAD). */
      "<div class='cardx' id='trTopo' style='margin:0;'>" +
      "<div style='background:linear-gradient(160deg,var(--cor),var(--cor2));padding:24px 20px 18px;color:#fff;'>" +
      "<div style='font-size:9.5px;letter-spacing:.22em;font-weight:800;text-transform:uppercase;color:rgba(255,255,255,.75);'>Meu treino</div>" +
      "<div style='display:flex;align-items:baseline;gap:10px;margin-top:4px;flex-wrap:wrap;'>" +
      "<span id='trTopN' style='font-size:34px;font-weight:900;letter-spacing:-.02em;line-height:1;'></span>" +
      "<span id='trTopS' style='font-size:13.5px;font-weight:700;color:rgba(255,255,255,.85);'></span></div>" +
      "<div id='trTopSub' style='font-size:12.5px;color:rgba(255,255,255,.8);margin-top:4px;'></div>" +
      "<div id='trMes' style='display:none;margin-top:12px;background:rgba(0,0,0,.22);border:1px solid rgba(255,255,255,.18);border-radius:14px;padding:10px 13px;'></div></div>" +
      ((ve("wod") || ve("cardio")) ? "<div id='trTabs' style='display:flex;gap:8px;padding:14px 20px 16px;'>" +
      "<button data-trsub='ficha' style='flex:1;min-height:44px;padding:0 6px;border-radius:99px;font-family:inherit;font-size:13px;font-weight:800;cursor:pointer;background:linear-gradient(135deg,var(--cor),var(--corc));border:none;color:#fff;'>Minha ficha</button>" +
      (ve("wod") ? "<button data-trsub='wod' style='flex:1;min-height:44px;padding:0 6px;border-radius:99px;font-family:inherit;font-size:13px;font-weight:800;cursor:pointer;background:var(--bg4);border:1px solid rgba(255,255,255,.06);color:#a9a4b5;'>Circuito (WOD)</button>" : "") +
      (ve("cardio") ? "<button data-trsub='cardio' style='flex:1;min-height:44px;padding:0 6px;border-radius:99px;font-family:inherit;font-size:13px;font-weight:800;cursor:pointer;background:var(--bg4);border:1px solid rgba(255,255,255,.06);color:#a9a4b5;'>Corrida e bike</button>" : "") +
      "</div>" : "") + "</div>" +
      // "Como foi o treino?" mora aqui, na área de Treino, e não na primeira
      // tela: a pergunta só faz sentido depois de treinar. Quem termina pelo
      // player responde no recibo; este card pega quem só marcou "Treinei hoje!".
      // Fica DEPOIS do cabeçalho: antes abria a área e empurrava a faixa pra baixo.
      "<div class='cardx' id='cardRpe' data-rpebox style='display:none;'></div>" +
      // ---------- aba Treinos (tela 25): as fichas em cards ----------
      "<div class='cardx' id='trFichasWrap' style='margin:0;'>" +
      "<div style='padding:0 20px;'>" +
      (fichaVenceApp ? "<div style='background:rgba(217,119,6,.15);border:1px solid #d97706;border-radius:16px;padding:10px 13px;font-size:13px;color:#fbbf24;margin-top:12px;'>" + appIco(APPIC.relogio, 13) + "Sua ficha venceu em " + esc(S.fmtData(fichaVenceApp)) + " — cobra o treino novo de " + esc(studio.split(" ")[0]) + "!</div>" : "") +
      // cada ficha (A, B, C…) é um card-gaveta: a do dia abre sozinha
      (fichasApp ? fichasApp.map(function (f, gi) {
        // "A — Peito e tríceps" → letra no quadradinho + nome limpo
        var parT = String(f.titulo || "").split("—");
        var letra = parT.length > 1 ? parT[0].trim().slice(0, 2) : String.fromCharCode(65 + gi);
        var nomeF = parT.length > 1 ? parT.slice(1).join("—").trim() : (f.titulo || "Ficha");
        var serF = 0; f.itens.forEach(function (it) { serF += (+it.series || 3); });
        // parte 2 do MESMO dia (A2, B2…): cardio e alongamento em linhas de tempo
        var p2L = (f.p2 && f.p2.l) || [];
        // dia da semana amarrado na Semana do aluno (se houver)
        var diaTxt = "";
        if (planoApp) {
          var rot7 = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
          var hj7 = String(new Date().getDay());
          Object.keys(planoApp).some(function (dk) {
            if (planoApp[dk].tp === "ficha" && planoApp[dk].i === gi) { diaTxt = " · " + (dk === hj7 ? "hoje" : rot7[+dk]); return true; }
            return false;
          });
        }
        return "<details class='fichabox' data-fi='" + gi + "'" + (gi === 0 ? " open" : "") + " style='margin:12px 0 0;background:var(--bg1);border-radius:22px;overflow:hidden;'>" +
          "<summary style='list-style:none;cursor:pointer;display:flex;align-items:center;gap:12px;padding:15px 16px;'>" +
          "<span style='flex:none;width:44px;height:44px;border-radius:14px;background:rgba(var(--cor-rgb),.25);color:var(--corc);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:16px;'>" + esc(letra) + "</span>" +
          "<span style='flex:1;min-width:0;'><b style='display:block;font-size:16px;font-weight:800;'>" + esc(nomeF) + "</b>" +
          "<span style='display:block;font-size:12.5px;color:#8a8695;margin-top:2px;'>" + f.itens.length + " exercício" + (f.itens.length === 1 ? "" : "s") + " · " + serF + " séries" + (p2L.length ? " · + " + esc(letra) + "2" : "") + esc(diaTxt) + "</span></span>" +
          "<span class='fseta' style='color:#6e6a78;font-size:13px;'>▾</span></summary>" +
          "<div style='padding:0 0 14px;'>" +
          (aqPorFicha[gi] && aqPorFicha[gi].length > 1
            ? "<details class='aqbox' style='background:rgba(251,146,60,.08);border:1px solid rgba(251,146,60,.45);border-radius:16px;margin:2px 16px 8px;overflow:hidden;'>" +
              "<summary style='padding:10px 13px;cursor:pointer;list-style:none;font-size:13px;font-weight:800;color:#fdba74;'>Aquecimento do dia (~4 min) ›</summary>" +
              "<div style='padding:0 13px 10px;font-size:13px;color:#d6d2df;'>" +
              aqPorFicha[gi].map(function (aq) { return "<div class='kv' style='border-color:rgba(251,146,60,.2);'><span>" + esc(aq[0]) + "</span><b style='color:#fdba74;white-space:nowrap;'>" + esc(aq[1]) + "</b></div>"; }).join("") +
              "<div class='vz' style='font-size:11px;padding:6px 0 0;'>Aquecer evita lesão e melhora o treino — não pula!</div></div></details>"
            : "") +
          f.itens.map(function (it, ii) {
            var rst = +it.descanso || 60, rAlt = rst === 90 ? 60 : 90;
            // linha no estilo da tela 25: nome + última carga à esquerda,
            // prescrição e kg (pintados do diário do aparelho) à direita
            return "<details class='exrow' style='border-top:1px solid var(--bg11);'>" +
              "<summary style='padding:12px 16px;cursor:pointer;list-style:none;display:flex;align-items:center;gap:10px;font-size:14px;'>" +
              "<span style='flex:1;min-width:0;'><b style='display:block;font-size:14.5px;'>" + esc(it.nome) + tecChip(it.tec) + "</b>" +
              "<span class='exult' data-exn='" + esc(it.nome) + "' style='display:block;font-size:11.5px;color:#6e6a78;margin-top:2px;'>sem carga anotada</span></span>" +
              "<span style='flex:none;font-size:14.5px;font-weight:800;white-space:nowrap;'>" + it.series + " × " + esc(String(it.reps)) + "</span>" +
              "<span class='exkg' data-exn='" + esc(it.nome) + "' style='flex:none;min-width:44px;text-align:right;font-size:14px;font-weight:800;color:var(--corc);white-space:nowrap;'></span></summary>" +
              "<div style='padding:0 16px 12px;font-size:13.5px;color:#d6d2df;line-height:1.6;'>" +
              (it.desc ? "<div style='margin-bottom:8px;'>" + esc(it.desc) + "</div>" : "") +
              (TECS_APP[it.tec] ? "<div style='color:#fdba74;margin-bottom:8px;'><b>" + esc(TECS_APP[it.tec][0]) + "</b> — " + esc(TECS_APP[it.tec][1]) + "</div>" : "") +
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
          }).join("") +
          // o botão grandão fecha o card, igual à tela 25
          (f.itens.length ? "<div style='padding:12px 16px 0;'><button class='btnx guiabtn' data-g='" + gi + "' style='display:block;width:100%;min-height:54px;text-align:center;font-size:15.5px;'>Começar essa ficha</button></div>" : "") +
          (p2L.length ? blocoP2(gi, letra, f.p2) : "") +
          "</div></details>";
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
      }).join("") + "</div>" : "<div class='vz'>Seu treino aparece aqui — peça ao seu personal.</div>") + "</div></div>" +
      // Raio-X no desenho da tela 25: grupo à esquerda, barra no meio, número à direita
      (raioX.length ? "<div class='cardx'><div style='background:var(--bg1);border-radius:22px;padding:16px 18px;'>" +
        "<h2 style='margin-bottom:2px;letter-spacing:0;font-size:17px;color:#fff;text-transform:none;font-weight:800;'>Raio-X do treino</h2>" +
        "<div style='font-size:12.5px;color:#8a8695;margin-bottom:12px;'>séries por grupo, somando as " + (fichasApp ? fichasApp.length : 0) + " fichas</div>" +
        (function () {
          var maxS = raioX[0].s || 1;
          return raioX.map(function (r) {
            return "<div style='display:flex;align-items:center;gap:12px;margin:10px 0;'>" +
              "<span style='flex:none;width:104px;font-size:13px;color:#d6d2df;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'>" + esc(r.g) + "</span>" +
              "<div style='flex:1;height:6px;background:var(--bg5);border-radius:99px;overflow:hidden;'><div style='height:100%;width:" + Math.round(100 * r.s / maxS) + "%;background:linear-gradient(90deg,var(--cor),var(--corc));border-radius:99px;'></div></div>" +
              "<b style='flex:none;min-width:20px;text-align:right;font-size:14px;'>" + r.s + "</b></div>";
          }).join("");
        })() + "</div></div>" : "") +
      // modo circuito (WOD), no desenho da tela 50: cabeçalho com a data, folha
      // com borda da cor, "Sua última vez" em verde, "Seus circuitos" e o
      // montador manual escondido atrás do botão
      (ve("wod") ? "<div class='cardx' id='cardWod'>" +
      "<div style='display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:12px;'>" +
      "<h2 style='margin-bottom:0;'>Modo circuito (WOD)</h2><span id='wodHoje' style='font-size:12px;color:#8a8695;white-space:nowrap;'></span></div>" +
      (wodsApp.length ? wodsApp.map(function (w, wi) {
        // folha de WOD estilo quadro da academia: tipo em destaque, blocos com rótulos
        var bloco = function (rot, html) {
          return "<div style='margin-top:14px;'><div style='color:var(--corc);font-size:10.5px;font-weight:800;letter-spacing:.18em;'>" + rot + "</div>" + html + "</div>";
        };
        var movsH = (w.movs && w.movs.length ? w.movs : w.mov.map(function (l) { return { q: "", n: l }; })).map(function (m) {
          return "<div style='display:flex;gap:12px;align-items:baseline;font-size:16px;padding:7px 0;border-bottom:1px dashed var(--bg11);'>" +
            (m.q ? "<b style='color:var(--corc);flex:none;min-width:60px;'>" + esc(m.q) + "</b>" : "") +
            "<span>" + esc(m.n) + "</span></div>";
        }).join("");
        var nMov = (w.movs && w.movs.length) ? w.movs.length : (w.mov || []).length;
        var subW = [w.resumo || "", nMov ? nMov + (nMov === 1 ? " movimento" : " movimentos") : ""].filter(Boolean).join(" · ") + diaDoPlano("wod", wi);
        return "<details class='fichabox' data-wi='" + wi + "'" + (wi === 0 ? " open" : "") + " style='margin:12px 0 0;background:var(--bg1);border-radius:22px;overflow:hidden;'>" +
          gavetaTop(String.fromCharCode(65 + wi), w.nome, subW) +
          "<div style='padding:0 18px 18px;'>" +
          (w.aq ? bloco("AQUECIMENTO", "<div style='font-size:14px;color:#d6d2df;white-space:pre-wrap;line-height:1.6;margin-top:3px;'>" + esc(w.aq) + "</div>") : "") +
          bloco("WOD", "<div style='margin-top:3px;'>" + movsH + "</div>") +
          (w.obs ? bloco("ESCALAS / OBS", "<div style='font-size:13px;color:#a9a4b5;white-space:pre-wrap;line-height:1.6;margin-top:3px;'>" + esc(w.obs) + "</div>") : "") +
          "<div class='wodres' data-wid='" + w.id + "' style='font-size:13.5px;font-weight:700;color:#4ade80;margin-top:10px;'></div>" +
          "<button class='btnx' data-wodstart='" + w.id + "' style='display:block;width:100%;min-height:54px;text-align:center;font-size:15.5px;margin-top:12px;'>Começar circuito</button></div></details>";
      }).join("") : "") +
      "<div id='wodHist'></div>" +
      (wodsApp.length ? "<button type='button' class='btnx' id='wodLivreBt' style='display:block;width:100%;background:var(--bg4);border:1px solid var(--bg11);color:#d6d2df;box-shadow:none;margin-top:10px;'>Montar o meu circuito</button>" : "") +
      "<div id='wodLivre'" + (wodsApp.length ? " style='display:none;margin-top:10px;'" : "") + ">" +
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
      "</div>" + // fecha o #wodLivre — a caixinha de fim fica FORA, sempre visível
      "<div id='wodFimBox' style='display:none;margin-top:10px;'></div></div>" : "") +
      // corrida e bike: folhas prescritas + cronômetro próprio com pace (min/km), GPS e tiros
      (ve("cardio") ? "<div class='cardx' id='cardCardio'><h2>Corrida e bike</h2>" +
      (cardiosApp.length ? cardiosApp.map(function (c, ci) {
        var rotMod = { corrida: "CORRIDA", caminhada: "CAMINHADA", bike: "BIKE" }[c.mod] || "CARDIO";
        var alvo = alvoCardio(c);
        return "<details class='fichabox' data-cri='" + ci + "'" + (ci === 0 ? " open" : "") + " style='margin:12px 0 0;background:var(--bg1);border-radius:22px;overflow:hidden;'>" +
          gavetaTop(String.fromCharCode(65 + ci), c.nome, rotMod.charAt(0) + rotMod.slice(1).toLowerCase() + " · " + alvo + diaDoPlano("cardio", ci)) +
          "<div style='padding:0 18px 18px;'>" +
          (c.obs ? "<div style='font-size:13px;color:#a9a4b5;white-space:pre-wrap;line-height:1.6;'>" + esc(c.obs) + "</div>" : "") +
          "<button class='btnx' data-cbstart='" + c.id + "' style='display:block;width:100%;min-height:54px;text-align:center;font-size:15.5px;margin-top:10px;'>Começar</button></div></details>";
      }).join("") + "<div style='font-size:11.5px;color:#6e6a78;margin:14px 0 10px;'>Ou treine livre aqui embaixo:</div>" : "") +
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
      // tela 51: quatro cartões — PACE, MÉDIO, KM e KCAL (as calorias já eram
      // calculadas pro modo tela cheia; agora aparecem aqui também)
      "<div style='display:flex;gap:7px;justify-content:center;margin-top:8px;'>" +
      "<div style='flex:1;min-width:0;background:var(--bg5);border-radius:16px;padding:8px 2px;'><div style='font-size:9px;font-weight:800;letter-spacing:.1em;color:#6e6a78;'>PACE</div><div id='crPace' style='font-size:17px;font-weight:900;color:var(--corc);'>--:--</div><div style='font-size:9px;color:#6e6a78;'>min/km</div></div>" +
      "<div style='flex:1;min-width:0;background:var(--bg5);border-radius:16px;padding:8px 2px;'><div style='font-size:9px;font-weight:800;letter-spacing:.1em;color:#6e6a78;'>MÉDIO</div><div id='crPaceMed' style='font-size:17px;font-weight:900;'>--:--</div><div style='font-size:9px;color:#6e6a78;'>min/km</div></div>" +
      "<div style='flex:1;min-width:0;background:var(--bg5);border-radius:16px;padding:8px 2px;'><div style='font-size:9px;font-weight:800;letter-spacing:.1em;color:#6e6a78;'>KM</div><div id='crDist' style='font-size:17px;font-weight:900;'>0,00</div><div style='font-size:9px;color:#6e6a78;'>km</div></div>" +
      "<div style='flex:1;min-width:0;background:var(--bg5);border-radius:16px;padding:8px 2px;'><div style='font-size:9px;font-weight:800;letter-spacing:.1em;color:#6e6a78;'>KCAL</div><div id='crKcalV' style='font-size:17px;font-weight:900;'>0</div><div style='font-size:9px;color:#6e6a78;'>kcal</div></div></div>" +
      "<div id='crInfo' style='font-size:12px;color:#a9a4b5;margin-top:8px;'></div>" +
      // tela 51: confronto com o alvo de pace + barra da meta da corrida
      "<div id='crAlvo' style='display:none;font-size:12.5px;font-weight:800;margin-top:8px;'></div>" +
      "<div id='crMetaBar' style='display:none;margin-top:10px;text-align:left;'>" +
      "<div style='display:flex;justify-content:space-between;font-size:12px;font-weight:800;'><span>Meta da corrida</span><b id='crMetaTxt'></b></div>" +
      "<div style='height:6px;border-radius:4px;background:var(--bg5);margin-top:6px;overflow:hidden;'><b id='crMetaFill' style='display:block;height:100%;width:0;background:linear-gradient(90deg,var(--cor),var(--corc));transition:width .3s;'></b></div></div></div>" +
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
      // tela 40: com a corrida pausada dá pra jogar fora sem salvar nada
      "<button id='crDescarta' style='display:none;width:100%;margin-top:8px;min-height:44px;background:none;border:none;color:#f87171;font-family:inherit;font-size:13.5px;font-weight:800;cursor:pointer;'>Descartar esta corrida</button>" +
      // sincronia com relógio/band: todo smartwatch exporta GPX ou TCX — o
      // aluno importa e a corrida entra com km, tempo, pace e data de verdade
      "<label class='btnx' style='display:block;text-align:center;margin-top:10px;background:var(--bg4);border:1px solid rgba(255,255,255,.08);color:#d6d2df;box-shadow:none;cursor:pointer;'>Importar do relógio (GPX/TCX)" +
      "<input id='crImp' type='file' accept='.gpx,.tcx,.xml' style='display:none;'></label>" +
      "<div class='vz' style='font-size:11px;padding:4px 0 0;'>Apple Watch, Garmin, Xiaomi, Polar… — exporta o treino no app do relógio e traz o arquivo pra cá.</div>" +
      // batimentos ao vivo: cinta/pulseira Bluetooth (o card nasce escondido e
      // so acende quando existe caminho real de conexao — ver bloco HR no motor)
      "<div id='fcCard' style='display:none;'>" +
      "<div style='font-size:10.5px;font-weight:800;letter-spacing:.2em;color:#8a8695;text-transform:uppercase;margin-bottom:9px;'>Batimentos ao vivo</div>" +
      "<button type='button' id='fcBt'>Conectar cinta ou pulseira</button>" +
      "<div id='fcVivo'>" +
      "<div style='flex:none;'><span id='fcBpm'>--</span><span style='font-size:12px;font-weight:800;color:#8a8695;margin-left:4px;'>bpm</span></div>" +
      "<div style='flex:1;min-width:0;'><div id='fcZona' style='font-size:12.5px;font-weight:800;'>--</div>" +
      "<div class='fczb' id='fcBar'><i></i><i></i><i></i><i></i><i></i></div></div></div>" +
      "<div style='display:flex;align-items:center;gap:9px;margin-top:11px;'>" +
      "<label for='fcIdade' style='font-size:12px;color:#8a8695;'>Sua idade</label>" +
      "<input id='fcIdade' inputmode='numeric' maxlength='2' placeholder='30' style='width:66px;text-align:center;'>" +
      "<span id='fcMaxT' style='font-size:11.5px;color:#8a8695;'></span></div>" +
      "<div class='vz' id='fcDica' style='font-size:11px;padding:7px 0 0;text-align:left;'></div></div>" +
      // arte da corrida pro aluno postar (aparece depois de finalizar): trajeto +
      // números + marca do studio — cada corrida compartilhada é propaganda
      "<div id='crShare' style='display:none;margin-top:10px;'>" +
      "<div style='display:flex;gap:8px;'>" +
      "<label class='btnx' style='flex:1;text-align:center;'>Compartilhar essa corrida com sua foto" +
      "<input id='crShareArq' type='file' accept='image/*' style='display:none;'></label>" +
      "<button type='button' class='btnx' data-crsem style='flex:none;background:var(--bg4);box-shadow:none;color:#d6d2df;'>Sem foto</button></div>" +
      "<div class='vz' style='font-size:11px;padding:6px 0 0;'>Sua foto com o tra\u00e7ado do GPS por cima \u2014 pronto pro Stories ou feed. A foto n\u00e3o sai do seu celular.</div></div>" +
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
      "<div style='flex:1;'><b id='crKcalF' style='font-size:21px;font-weight:900;color:#fff;font-variant-numeric:tabular-nums;'>0</b><div style='font-size:9.5px;font-weight:800;letter-spacing:.14em;color:rgba(255,255,255,.75);'>CALORIAS</div></div>" +
      "<div id='crBpmC' style='flex:1;display:none;'><b id='crBpmF' style='font-size:21px;font-weight:900;color:#fff;font-variant-numeric:tabular-nums;'>--</b><div style='font-size:9.5px;font-weight:800;letter-spacing:.14em;color:rgba(255,255,255,.75);'>BATIMENTOS</div></div></div>" +
      "<div id='crFaseF' style='text-align:center;font-size:11px;font-weight:800;letter-spacing:.1em;color:rgba(255,255,255,.85);text-transform:uppercase;margin-top:4px;'>Pronto?</div>" +
      "<div id='crInfoF' style='text-align:center;font-size:11.5px;color:rgba(255,255,255,.8);'></div>" +
      // player guiado: trilho dos blocos + o bloco de agora e o de depois
      "<div id='crBlocoBox' style='display:none;margin-top:10px;'>" +
      "<div id='crTrilho' style='display:flex;gap:3px;'></div>" +
      "<div style='display:flex;align-items:center;gap:10px;margin-top:8px;text-align:left;'>" +
      "<span id='crBlocoD' style='flex:1;min-width:0;font-size:11.5px;color:rgba(255,255,255,.72);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'></span>" +
      "<b id='crBlocoT' style='flex:none;font-size:22px;font-weight:900;color:#fff;font-variant-numeric:tabular-nums;'></b>" +
      "<button id='crPulaF' style='flex:none;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.3);border-radius:99px;padding:7px 13px;color:#fff;font-family:inherit;font-size:12px;font-weight:800;cursor:pointer;'>Pular \u203a</button></div></div>" +
      "<div id='crZonaFx' style='display:none;text-align:center;margin-top:10px;color:#fff;'></div></div>" +
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
      "<div id='crResumoF' style='display:none;position:absolute;inset:0;z-index:5;background:var(--bg0);overflow:auto;padding:calc(22px + env(safe-area-inset-top,0px)) 18px calc(26px + env(safe-area-inset-bottom,0px));'></div>" +
      "<div id='crLockOverF' style='display:none;position:absolute;inset:0;z-index:5;background:rgba(var(--bg0-rgb),.55);flex-direction:column;align-items:center;justify-content:center;gap:10px;'>" +
      "<div style='color:#fff;line-height:0;'>" + crIco(CRICO_LOCK_P, 46) + "</div><div style='color:#fff;font-weight:800;font-size:14px;'>Tela bloqueada</div>" +
      "<button id='crUnlockF' style='background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.35);border-radius:99px;padding:12px 26px;color:#fff;font-family:inherit;font-size:13.5px;font-weight:800;cursor:pointer;'>Segure pra destravar</button></div>" +
      "<button id='crFullFecha' aria-label='Fechar tela cheia' style='position:absolute;top:calc(14px + env(safe-area-inset-top,0px));right:12px;z-index:4;width:42px;height:42px;border-radius:50%;background:rgba(var(--bg0-rgb),.74);border:1px solid rgba(255,255,255,.22);color:#fff;font-size:17px;cursor:pointer;'>✕</button>" +
      "</div></div>" : "") +
      // o diário manual de cargas saiu daqui (pedido do Raphael): a carga entra
      // pelo player e a leitura mora em Evolução → Cargas; o recorde e a
      // sugestão de progressão agora festejam direto no gGrava
      // tela 41: curva do peso (registros + avaliações na MESMA curva), meta
      // com barra e a última avaliação com deltas — tudo dos dados que já existem
      "<div class='cardx'><h2>Meu peso</h2>" +
      "<div style='background:var(--bg2);border:1px solid rgba(255,255,255,.04);border-radius:20px;padding:16px;'>" +
      "<div style='display:flex;justify-content:space-between;align-items:baseline;'><span class='wpk' style='margin:0;'>Peso</span><span id='pzTopo'></span></div>" +
      "<div id='pzGraf' class='vz' style='padding:8px 0 0;'>Registre o peso de hoje — a curva aparece aqui.</div>" +
      "<div id='pzNota' style='font-size:12px;color:#8a8695;margin-top:8px;'></div></div>" +
      "<div style='background:var(--bg2);border:1px solid rgba(255,255,255,.04);border-radius:20px;padding:16px;margin-top:12px;'>" +
      "<div style='display:flex;justify-content:space-between;align-items:center;'><span class='wpk' style='margin:0;'>Meu peso</span><span id='mpMetaTxt' style='font-size:14px;color:#d6d2df;'></span></div>" +
      "<div id='mpBarra' style='margin-top:10px;'></div>" +
      "<div style='display:flex;gap:8px;margin-top:12px;'><input id='pzKg' inputmode='decimal' placeholder='Peso de hoje (kg)' style='flex:1;min-width:0'><button class='btnx' id='pzAdd'>Registrar</button></div>" +
      "<div id='mpForm' style='display:none;gap:8px;margin-top:8px;'><input id='mpAlvo' inputmode='decimal' placeholder='Minha meta (kg)' style='flex:1;min-width:0'><button class='btnx' id='mpSalva' style='padding:11px 16px;'>Definir meta</button></div>" +
      "<div id='pzUlt' style='font-size:11.5px;color:#8a8695;margin-top:8px;'></div></div></div>" +
      "<div class='cardx'><h2>Última avaliação</h2><div id='evoBox'></div></div>" +
      // ---- UTILIDADES (gaveta ☰): água, cronômetro, 1RM, anilhas, IMC ----
      // ---------- Utilidades (tela 15): cabeçalho próprio + água + grade ----------
      // O hub mostra água e a grade de ferramentas; tocar numa ferramenta esconde
      // o hub e mostra só ela, com o Voltar em cima (telas 16-18). Nada de lógica
      // nova: as calculadoras e o cronômetro são os mesmos, só mudam de roupa.
      "<div class='cardx' id='utilTopo' style='margin:0;'>" +
      "<div style='background:linear-gradient(160deg,var(--cor),var(--cor2));padding:26px 20px 22px;color:#fff;'>" +
      "<div style='font-size:9.5px;letter-spacing:.22em;font-weight:800;text-transform:uppercase;color:rgba(255,255,255,.75);'>Utilidades</div>" +
      "<div style='font-size:30px;font-weight:900;letter-spacing:-.03em;margin-top:2px;'>Caixa de ferramentas</div></div></div>" +
      "<div class='cardx' id='utilVoltar' style='display:none;align-items:center;justify-content:space-between;'>" +
      "<button type='button' id='utVoltBt' class='btnx' style='background:var(--bg4);border:1px solid rgba(255,255,255,.06);color:#d6d2df;box-shadow:none;padding:11px 24px;border-radius:99px;'>Voltar</button>" +
      "<span id='utVoltNome' style='font-size:11px;font-weight:800;letter-spacing:.18em;color:#8a8695;'></span></div>" +
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
      // grade 2×2 de ferramentas (tela 15) — cada tile abre a própria página
      "<div class='cardx' id='utilHub'><h2>Ferramentas</h2>" +
      "<div style='display:grid;grid-template-columns:1fr 1fr;gap:12px;'>" +
      (function () {
        var sv = function (p) { return "<svg width='25' height='25' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'>" + p + "</svg>"; };
        return [
          ["crono", sv("<circle cx='12' cy='13.5' r='7.5'/><path d='M12 9.8v3.7l2.6 1.6M9.5 2.5h5M12 2.5V6'/>"), "Cronômetro", "crono, timer, tabata, EMOM e AMRAP"],
          ["anilha", sv("<circle cx='12' cy='12' r='8'/><circle cx='12' cy='12' r='2.6'/><path d='M12 4v3M12 17v3M4 12h3M17 12h3'/>"), "Anilhas", "quais colocar em cada lado da barra"],
          ["rm", sv("<path d='M7 7v10M4 9v6M17 7v10M20 9v6M7 12h10'/>"), "1RM", "seu máximo e as porcentagens"],
          ["imc", sv("<path d='M4.5 17.5a8 8 0 1 1 15 0'/><path d='M12 13.5 15.5 9'/><circle cx='12' cy='14' r='1.4'/>"), "IMC", "com a sua altura já preenchida"],
        ].map(function (t) {
          return "<button type='button' data-utgo='" + t[0] + "' style='background:var(--bg4);border:1px solid rgba(255,255,255,.05);border-radius:20px;padding:16px 14px;text-align:left;cursor:pointer;font-family:inherit;color:#fff;min-height:118px;'>" +
            "<span style='display:block;line-height:0;color:var(--corc);margin-bottom:12px;'>" + t[1] + "</span>" +
            "<b style='font-size:16.5px;font-weight:800;letter-spacing:-.01em;'>" + t[2] + "</b>" +
            "<span style='display:block;font-size:12px;color:#8a8695;margin-top:3px;line-height:1.35;'>" + t[3] + "</span></button>";
        }).join("");
      })() +
      "</div></div>" +
      "<div class='cardx' id='utilCrono'><h2>Cronômetro e timers de treino</h2>" +
      "<div id='ucTipos' style='display:flex;gap:5px;margin-bottom:10px;flex-wrap:wrap;'></div>" +
      "<div id='ucCfg' style='display:none;gap:8px;margin-bottom:10px;'></div>" +
      // tela 16: tempo gigante sem caixa e botões redondos (Zerar · Iniciar · Volta)
      "<div id='ucTela' style='text-align:center;padding:20px 10px 6px;'>" +
      "<div id='ucFase' style='font-size:11px;font-weight:800;letter-spacing:.2em;color:#a9a4b5;text-transform:uppercase;'>Pronto?</div>" +
      "<div id='ucTempo' style='font-size:clamp(58px,21vw,86px);font-weight:900;font-variant-numeric:tabular-nums;line-height:1.05;letter-spacing:-.03em;'>0:00.0</div>" +
      "<div id='ucInfo' style='font-size:12px;color:#a9a4b5;'></div></div>" +
      "<div style='display:flex;gap:18px;margin-top:16px;align-items:center;justify-content:center;'>" +
      "<button class='btnx' id='ucZera' style='flex:none;width:76px;height:76px;border-radius:50%;background:var(--bg4);border:1px solid rgba(255,255,255,.07);color:#d6d2df;box-shadow:none;font-size:13px;padding:0;'>Zerar</button>" +
      "<button class='btnx' id='ucGo' style='flex:none;width:118px;height:118px;border-radius:50%;font-size:17px;padding:0;'>Iniciar</button>" +
      "<button class='btnx' id='ucVolta' style='flex:none;width:76px;height:76px;border-radius:50%;background:var(--bg4);border:1px solid rgba(255,255,255,.07);color:#d6d2df;box-shadow:none;font-size:13px;padding:0;'>Volta</button></div>" +
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
      // (os hábitos de hoje subiram pra faixa colorida do topo)
      // tela 41: fotos por ângulo (Frente/Lado/Costas) + comparador com alça
      "<div class='cardx'><div style='display:flex;justify-content:space-between;align-items:baseline;'><h2>Fotos de progresso</h2>" +
      "<span style='font-size:11.5px;color:#8a8695;'>só você e seu personal veem</span></div>" +
      "<div id='ftAbas' style='display:flex;gap:8px;margin-bottom:12px;'></div>" +
      "<div id='fotosBox' class='vz'>Tire a primeira foto — daqui a uns meses você vai agradecer.</div>" +
      "<label class='btnx' id='fotoBtn' style='display:block;text-align:center;margin-top:12px;min-height:54px;line-height:32px;font-size:15.5px;cursor:pointer;'>+ Adicionar foto de frente" +
      "<input id='fotoInput' type='file' accept='image/*' style='display:none;'></label>" +
      "<div class='vz' style='font-size:11px;'>Tirar na hora ou pegar da galeria — o celular pergunta. As fotos ficam com você e com o seu personal — mais ninguém vê.</div></div>" +
      (vidsApp.length ? "<div class='cardx' id='vidCard'><h2>Conteúdos de " + esc(studio.split(" ")[0]) + "</h2>" +
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
      /* 🎁 Clube de vantagens (v697): as parcerias do professor com cupom pro
       * aluno — só nasce no HTML quando existe parceria cadastrada. Tocar no
       * cupom copia o código (handler .cupbt, perto do bloco do depoimento). */
      (clubeApp.length ? "<div class='cardx' id='clubeCard'><h2>Clube de vantagens</h2>" +
        "<div class='vz' style='text-align:left;padding:2px 0 8px;'>Parcerias de " + esc(studio.split(" ")[0]) + " pra quem treina aqui:</div>" +
        clubeApp.map(function (p) {
          return "<div style='border:1px solid var(--bg11);border-radius:14px;padding:12px 14px;margin-bottom:8px;'>" +
            "<b style='font-size:14.5px;'>" + esc(p.n) + "</b>" +
            "<div style='font-size:13px;color:#cfcbdb;margin-top:2px;'>" + esc(p.b) + "</div>" +
            (p.c ? "<button class='cupbt' data-cup='" + esc(p.c) + "' style='margin-top:9px;background:var(--bg2);border:1px dashed var(--cor);color:var(--corc);border-radius:10px;padding:9px 14px;font-family:inherit;font-weight:800;font-size:13.5px;cursor:pointer;letter-spacing:.06em;'>" + esc(p.c) + " · copiar</button>" : "") +
            (p.u ? "<a href='" + esc(p.u) + "' target='_blank' rel='noopener' style='display:block;margin-top:9px;text-align:center;background:var(--bg2);border:1px solid var(--bg11);color:var(--corc);border-radius:11px;padding:11px 14px;font-size:13.5px;font-weight:800;text-decoration:none;'>Ir pro site do parceiro</a>" : "") +
            "</div>";
        }).join("") + "</div>" : "") +
      /* 🛍 Loja (v698): vitrine do professor — o Quero esse cai no WhatsApp
       * dele com o nome do item (a venda fecha como sempre, o dinheiro cai
       * direto com o professor). Sem WhatsApp cadastrado, o botão orienta pro
       * chat em vez de fingir que compra. Só nasce com item na vitrine. */
      (lojaApp.length ? "<div class='cardx' id='lojaCard'><h2>Loja de " + esc(studio.split(" ")[0]) + "</h2>" +
        lojaApp.map(function (p) {
          var precoL = "R$ " + (Math.round((+p.v) * 100) / 100).toFixed(2).replace(".", ",");
          return "<div style='display:flex;align-items:center;gap:12px;border:1px solid var(--bg11);border-radius:14px;padding:12px 14px;margin-bottom:8px;'>" +
            // v700: foto do produto (o painel só manda data:image validada)
            (p.f && /^data:image\//.test(p.f) ? "<img src='" + p.f + "' alt='' style='width:56px;height:56px;object-fit:cover;border-radius:12px;flex:none;'>" : "") +
            "<span style='flex:1;min-width:0;'><b style='font-size:14.5px;display:block;'>" + esc(p.n) + "</b>" +
            (p.d ? "<span style='font-size:12.5px;color:#a9a4b5;'>" + esc(p.d) + "</span>" : "") +
            "<span style='display:block;font-size:14px;font-weight:900;color:var(--corc);margin-top:3px;'>" + precoL + "</span></span>" +
            "<button class='lojabt' data-item='" + esc(p.n) + "' data-preco='" + precoL + "' style='flex:none;background:var(--cor);border:none;color:#fff;border-radius:11px;padding:11px 15px;font-family:inherit;font-weight:800;font-size:13px;cursor:pointer;'>" + (D.lojaPg ? "Comprar" : "Quero esse") + "</button>" +
            "</div>";
        }).join("") + "</div>" : "") +
      // ❓ Ajuda (v706): tela própria aberta pelo menu, montada lá em cima
      ajudaCardHtml +
      // ---------- Chat (tela 10): cabeçalho do personal no alto da área ----------
      "<div class='cardx' id='chTopo' style='margin:0;'>" +
      "<div style='background:linear-gradient(160deg,var(--cor),var(--cor2));padding:22px 20px;color:#fff;display:flex;align-items:center;gap:13px;'>" +
      "<span style='width:54px;height:54px;border-radius:50%;background:rgba(255,255,255,.25);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;overflow:hidden;flex:none;'>" +
      (LOGOAPP ? "<img src='" + LOGOAPP + "' alt='' style='width:100%;height:100%;object-fit:cover;'>" : esc(String(studio || "?").trim().split(/\s+/).slice(0, 2).map(function (w) { return (w[0] || "").toUpperCase(); }).join(""))) + "</span>" +
      "<span style='flex:1;min-width:0;'><span style='display:block;font-size:22px;font-weight:900;letter-spacing:-.02em;'>" + esc(studio) + "</span>" +
      "<span style='display:block;font-size:12.5px;color:rgba(255,255,255,.85);margin-top:2px;'>seu personal · responde quando puder</span></span></div></div>" +
      "<div class='cardx'><h2>Fale com " + esc(studio) + "</h2>" +
      "<div id='chMsgs' style='max-height:52vh;overflow-y:auto;display:flex;flex-direction:column;gap:7px;margin-bottom:10px;'><div class='vz'>Carregando…</div></div>" +
      "<div id='botChips' style='display:flex;gap:7px;flex-wrap:wrap;margin-bottom:10px;'></div>" +
      "<div style='display:flex;gap:8px;align-items:center;'><input id='chTexto' placeholder='Escreve pro seu personal…' style='flex:1;min-width:0;border-radius:99px;padding-left:18px;'>" +
      "<button class='btnx' id='chEnvia' aria-label='Enviar' style='flex:none;width:52px;height:52px;border-radius:50%;padding:0;'><svg width='19' height='19' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M4 12h14M12 6l6 6-6 6'/></svg></button></div></div>" +
      // R3: o card virou o CONVITE do questionário (tela 03) — o fluxo abre por cima
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
      // ---------- Ajustes (tela 11): cabeçalho + preferências + meus dados ----------
      "<div class='cardx' id='ajTopo' style='margin:0;'>" +
      "<div style='background:linear-gradient(160deg,var(--cor),var(--cor2));padding:26px 20px 24px;color:#fff;display:flex;align-items:center;gap:14px;'>" +
      "<span class='mgav' style='width:56px;height:56px;font-size:19px;'>" +
      "<img id='ajImg' alt=''" + (FOTOAL ? " src='" + FOTOAL + "'" : " style='display:none;'") + ">" +
      "<span id='ajIni'" + (FOTOAL ? " style='display:none;'" : "") + ">" + esc(INICIAIS) + "</span></span>" +
      "<span style='flex:1;min-width:0;'><span style='display:block;font-size:23px;font-weight:900;letter-spacing:-.02em;'>" + esc(a.nome) + "</span>" +
      "<span style='display:block;font-size:12.5px;color:rgba(255,255,255,.85);margin-top:2px;'>" + esc(studio) + (plApp ? " · plano " + esc(plApp.nome) : "") + "</span></span></div></div>" +
      // preferências (tela 11): tema e notificações com interruptor, lembrete
      // de água apontando pras utilidades e a linha honesta do idioma
      "<div class='mgcard' id='ajPrefs' style='margin-top:16px;'>" +
      "<button class='mgrow' id='btnTemaApp'><span style='line-height:0;' id='mgTemaIco'></span>" +
      "<span style='flex:1;min-width:0;'><span class='mgtit' id='mgTemaTit'></span><span class='mgsub'>o escuro é o padrão</span></span>" +
      "<span class='mgsw' id='swTema' aria-hidden='true'><i></i></span></button>" +
      "<button class='mgrow' id='ajNotif' style='display:none;'><span style='line-height:0;'>" + appIco(APPIC.sino, 22) + "</span>" +
      "<span style='flex:1;min-width:0;'><span class='mgtit'>Notificações</span><span class='mgsub'>lembrete das sessões e recados por aqui</span></span>" +
      "<span class='mgsw' id='swNotif' aria-hidden='true'><i></i></span></button>" +
      "<button class='mgrow' data-ajgo='util'><span style='line-height:0;'><svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z'/></svg></span>" +
      "<span style='flex:1;min-width:0;'><span class='mgtit'>Lembrete de água</span><span class='mgsub' id='ajAguaSub'>desligado</span></span>" +
      "<span class='mgchev'><svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M9 6l6 6-6 6'/></svg></span></button>" +
      "<div class='mgrow' style='cursor:default;'><span style='line-height:0;'><svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><circle cx='12' cy='12' r='9'/><path d='M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z'/></svg></span>" +
      "<span style='flex:1;min-width:0;'><span class='mgtit'>Idioma</span><span class='mgsub'>Português (Brasil)</span></span></div></div>" +
      "<div class='mgcard' id='ajDados'>" +
      "<div class='wpk' style='margin:14px 0 2px;'>Meus dados</div>" +
      (function () {
        var sv = function (p) { return "<svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'>" + p + "</svg>"; };
        var chev = "<span class='mgchev'><svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M9 6l6 6-6 6'/></svg></span>";
        var rows = "";
        if (plApp && ve("pag")) rows += "<button class='mgrow' data-ajgo='pagamento'><span style='line-height:0;'>" + sv("<rect x='2' y='5' width='20' height='14' rx='2'/><path d='M2 10h20'/>") + "</span>" +
          "<span style='flex:1;min-width:0;'><span class='mgtit'>Meu plano</span><span class='mgsub'>" + esc(plApp.nome) + " · R$ " + (+plApp.valor).toLocaleString("pt-BR") + "/mês" + (ctApp && ctApp.diaVenc ? " · vence dia " + ctApp.diaVenc : "") + "</span></span>" + chev + "</button>";
        if (+a.altura) rows += "<div class='mgrow' style='cursor:default;'><span style='line-height:0;'>" + sv("<path d='M12 3v18M8.5 6.5 12 3l3.5 3.5M8.5 17.5 12 21l3.5-3.5'/>") + "</span>" +
          "<span style='flex:1;min-width:0;'><span class='mgtit'>Altura</span><span class='mgsub'>" + String((+a.altura / 100).toFixed(2)).replace(".", ",") + " m · quem mede é seu personal</span></span></div>";
        // o check-in da semana também é questionário — sem qa a linha leva nele
        rows += "<button class='mgrow' data-ajgo='quest'><span style='line-height:0;'>" + sv("<path d='M9 4.5h6v3H9z'/><path d='M15 4.5h3a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 20V6A1.5 1.5 0 0 1 6 4.5h3'/><path d='M8.5 12h7M8.5 15.5h5'/>") + "</span>" +
          "<span style='flex:1;min-width:0;'><span class='mgtit'>Meus questionários</span><span class='mgsub'>" + (qa ? "responder leva 1 minuto" : "o check-in da semana mora aqui") + "</span></span>" + chev + "</button>";
        // baixar meus dados (LGPD na prática): um arquivo com tudo do aparelho
        rows += "<button class='mgrow' id='ajBaixa'><span style='line-height:0;'>" + sv("<path d='M12 3v12M7.5 10.5 12 15l4.5-4.5'/><path d='M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2'/>") + "</span>" +
          "<span style='flex:1;min-width:0;'><span class='mgtit'>Baixar meus dados</span><span class='mgsub'>treinos, cargas e avaliações num arquivo</span></span>" + chev + "</button>";
        return rows;
      })() + "</div>" +
      // seção APP (tela 11): instalar como aplicativo e a página de privacidade
      "<div class='mgcard' id='ajApp'>" +
      "<div class='wpk' style='margin:14px 0 2px;'>App</div>" +
      "<button class='mgrow' id='ajInstala' style='display:none;'><span style='line-height:0;'><svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><rect x='5' y='2.5' width='14' height='19' rx='2.5'/><path d='M12 8v6M9 11.5 12 14.5l3-3'/></svg></span>" +
      "<span style='flex:1;min-width:0;'><span class='mgtit'>Instalar na tela de início</span><span class='mgsub'>abre sem navegador, direto do ícone</span></span>" +
      "<span class='mgchev'><svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M9 6l6 6-6 6'/></svg></span></button>" +
      // cinta/pulseira de batimento: acende com Web Bluetooth ou com a ponte nativa
      "<button class='mgrow' id='ajFc' style='display:none;'><span style='line-height:0;color:#f87171;'><svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M20.8 8.6c0 4.6-8.8 10.4-8.8 10.4S3.2 13.2 3.2 8.6a4.6 4.6 0 0 1 8.8-1.9 4.6 4.6 0 0 1 8.8 1.9z'/></svg></span>" +
      "<span style='flex:1;min-width:0;'><span class='mgtit'>Conectar cinta de batimento</span><span class='mgsub' id='ajFcSub'>cinta ou pulseira por Bluetooth</span></span>" +
      "<span class='mgchev'><svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M9 6l6 6-6 6'/></svg></span></button>" +
      // ponte do app de verdade (nativo/SAUDE.md): quando o shell da loja
      // injetar window.MTNativo.saude, esta linha acende sozinha
      "<button class='mgrow' id='ajSaude' style='display:none;'><span style='line-height:0;'><svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><circle cx='12' cy='12' r='6.5'/><path d='M12 9v3l2 1.5M9 3.5h6M9 20.5h6'/></svg></span>" +
      "<span style='flex:1;min-width:0;'><span class='mgtit'>Conectar relógio e saúde</span><span class='mgsub'>Apple Saúde / Health Connect</span></span>" +
      "<span class='mgchev'><svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M9 6l6 6-6 6'/></svg></span></button>" +
      "<a class='mgrow' href='/privacidade.html' target='_blank' rel='noopener' style='text-decoration:none;'><span style='line-height:0;'><svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M12 2.5 4.5 5.5v6c0 4.6 3.2 8 7.5 9.5 4.3-1.5 7.5-4.9 7.5-9.5v-6z'/><path d='M9 12l2 2 4-4'/></svg></span>" +
      "<span style='flex:1;min-width:0;'><span class='mgtit'>Sobre e privacidade</span><span class='mgsub'>seus dados e como cuidamos deles</span></span>" +
      "<span class='mgchev'><svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M9 6l6 6-6 6'/></svg></span></a></div>" +
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
      // tela 13: o convite virou uma linha compacta com seta — tocar já abre o
      // WhatsApp com a mensagem pronta (aria mantém o nome antigo pros leitores)
      (ve("indica") ? "<div class='cardx'>" +
      "<a aria-label='Indique um amigo — Convidar no WhatsApp' target='_blank' rel='noopener' style='display:flex;align-items:center;gap:13px;background:var(--bg2);border:1px solid rgba(255,255,255,.04);border-radius:20px;padding:16px;text-decoration:none;color:#fff;min-height:64px;' href='https://wa.me/?text=" +
      encodeURIComponent("Treino com " + studio + " e tô curtindo demais! Chama no WhatsApp pra fechar um horário: https://wa.me/" + (zapPersonal ? "55" + zapPersonal : "") + " — fala que quem indicou foi " + a.nome.split(" ")[0]) + "'>" +
      "<span style='flex:none;color:var(--corc);line-height:0;'>" + appIco(APPIC.presente, 22) + "</span>" +
      "<span style='flex:1;min-width:0;'><b style='display:block;font-size:16px;font-weight:800;'>Chamar um amigo</b>" +
      "<span style='display:block;font-size:12.5px;color:#8a8695;margin-top:2px;'>treinar em dupla rende mais — manda o convite no WhatsApp</span></span>" +
      "<span style='flex:none;color:#57525f;line-height:0;'><svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M9 6l6 6-6 6'/></svg></span></a></div>" : "") +
      /* ---------- Questionários: área PRÓPRIA (a partir da v585) ----------
       * O check-in da semana e o questionário do personal moravam embaixo da
       * conversa, na área do Chat. Quem abria o chat pra mandar um recado caía
       * num formulário grande logo abaixo; e quem queria responder tinha que
       * rolar a conversa inteira. Agora é uma área só deles, com entrada
       * própria no menu (o botão Questionários, com o badge de pendências). */
      "<div class='cardx' id='qsTopo' style='margin:0;'>" +
      "<div style='background:linear-gradient(160deg,var(--cor),var(--cor2));padding:24px 20px 20px;color:#fff;'>" +
      "<div style='font-size:9.5px;letter-spacing:.22em;font-weight:800;text-transform:uppercase;color:rgba(255,255,255,.75);'>Meus questionários</div>" +
      "<div id='qsTopN' style='font-size:26px;font-weight:900;letter-spacing:-.02em;margin-top:3px;'>Tudo em dia</div>" +
      "<div id='qsTopS' style='font-size:12.5px;color:rgba(255,255,255,.85);margin-top:4px;'>o que seu personal mandar aparece aqui</div></div></div>" +
      (qa ? "<div class='cardx' id='qaCard'><div id='qaBox' class='vz'>Carregando…</div></div>" : "") +
      /* UM card por questionário (v610). Antes eram três caixas empilhadas pra
       * dizer "responde isso": a faixa roxa, um parágrafo explicando pra que
       * serve e a lista de tudo o que ia ser perguntado. O aluno já sabe pra
       * que serve, e a lista de perguntas ele vê na hora de responder. */
      "<div class='cardx' id='ckCard'>" +
      "<div id='ckOk' class='vz' style='display:none;'>Check-in enviado — seu personal já viu. Até semana que vem!</div>" +
      "<div id='ckForm'>" +
      "<div style='background:linear-gradient(160deg,var(--cor),var(--cor2));border-radius:22px;padding:18px 20px 18px;color:#fff;'>" +
      "<div style='font-size:9.5px;font-weight:800;letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.75);'>Toda semana</div>" +
      "<div style='font-size:24px;font-weight:900;letter-spacing:-.02em;margin-top:4px;'>Como foi a sua semana?</div>" +
      "<div style='font-size:13.5px;color:rgba(255,255,255,.85);margin-top:4px;'>3 perguntas · leva 30 segundos</div>" +
      "<button class='btnx qsbt' id='ckAbrir'>Fazer meu check-in</button>" +
      "</div></div></div>" +
      // area vazia tem que dizer que esta vazia: o check-in ja respondido some
      // (pedido do Raphael), e sem isso sobrava so a faixa roxa sozinha
      "<div class='cardx' id='qsVazio' style='display:none;'>" +
      "<div class='vz' style='padding:30px 18px;line-height:1.6;'>Nada pra responder agora.<br>O check-in da semana volta na segunda, e o que seu personal mandar cai aqui.</div></div>" +
      "<div id='tmrBar' style='display:none;position:fixed;bottom:calc(62px + env(safe-area-inset-bottom,0px));left:0;right:0;max-width:480px;margin:0 auto;background:linear-gradient(90deg,var(--cor),var(--corc));color:#fff;font-weight:800;text-align:center;padding:13px;font-size:15px;z-index:8;'></div>" +
      /* Treino guiado: uma tela por exercício, estilo story. O aluno olha de
       * longe (barra, número, cronômetro), toca em coisa grande, e no fim de
       * cada exercício anota a carga sem teclado. */
      "<div id='guiaBox' class='gwrap'>" +
      "<div class='gtopo'>" +
      "<span class='gmarca'>" + esc(studio) + "</span>" +
      "<button id='gVoltaEx' class='gvolta' aria-label='Exercício anterior'>‹</button>" +
      "<button id='gPularEx'>Pular exercício</button>" +
      "<button type='button' id='gFc' aria-label='Batimentos'></button>" +
      "<button id='gFechar' class='gx' aria-label='Fechar o treino guiado'>✕</button></div>" +
      "<div class='gbarra' id='gBarra' aria-hidden='true'></div>" +
      "<div class='gcont'><div id='gProg'></div><span id='gReloTot'></span></div>" +
      "<div class='gcard' id='gCard'>" +
      "<span class='gchip' id='gEstado'></span>" +
      "<div class='ggif' id='gGif' style='display:none;'></div>" +
      "<div id='gMiolo'></div>" +
      "<div id='gMiolo2'></div>" +
      "<button id='gVideo' class='vidbtn' style='display:none;'>Como fazer</button>" +
      "<div class='vidbox' style='display:none;'></div>" +
      "<div class='ghist' id='gHist'></div></div>" +
      "<div class='ggrupo' id='gGrupo'></div>" +
      "<div class='gtit' id='gEx'></div>" +
      "<div class='gtecl' id='gTec' style='display:none;'></div>" +
      "<div class='gbase'><div class='gmeta' id='gMeta'></div>" +
      "<div class='grelo'><b id='gRelo'>0:00</b><em id='gReloLab'>neste exercício</em></div></div>" +
      "<div class='gpe' id='gPe'>" +
      "<button class='prin' id='gSerie'>Série feita ✓</button></div>" +
      /* Descanso no rodapé (tela 47): o exercício continua na tela e a contagem
       * mora numa barra fixa embaixo — número, rótulo, +15 s, Pular e o trilho.
       * Os ids são os MESMOS de sempre (o número segue sendo só o #gDesc). */
      "<div id='gResta'>" +
      "<div style='display:flex;align-items:center;gap:9px;'>" +
      "<span class='grk'>Descanso</span>" +
      "<div class='gbig' id='gDesc' style='display:none;'></div>" +
      "<div class='gbiglab' id='gDescLab' style='display:none;'>segundos</div>" +
      "<span style='flex:1;'></span>" +
      "<button class='sec mais' id='gMais15' style='display:none;'>+15 s</button>" +
      "<button class='sec' id='gPular' style='display:none;'>Pular descanso</button></div>" +
      "<div class='gtrilho' id='gTrilhoCx' style='display:none;'><b id='gTrilho'></b></div>" +
      "</div>" +
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
      /* Manifest com o TOKEN (v696): o manifest fixo tinha start_url "./" e o
       * app salvo na tela inicial abria /app/ SEM o ?t= — e no iPhone o app
       * instalado ganha um cofre de dados SEPARADO do Safari, então nem a
       * reserva do localStorage existia lá: tela de "link incompleto". O
       * manifest agora é montado aqui com o link COMPLETO do aluno; os ícones
       * vão com endereço absoluto porque, dentro de um data:, o relativo não
       * resolve contra o site. Sem suporte a manifest em data:, o navegador
       * cai no comportamento antigo — salvar a página atual, que TEM o ?t=. */
      "(function(){try{if(location.protocol.indexOf('http'))return;" +
      "var man={name:'TORQUE FIT \\u2014 Meu app',short_name:'TORQUE FIT',display:'standalone',background_color:CV('bg'),theme_color:CV('cor')," +
      "start_url:TOKEN?location.origin+'/app/?t='+encodeURIComponent(TOKEN):location.href," +
      "scope:location.origin+'/app/'," +
      "icons:[{src:location.origin+'/assets/icons/icon-192.png',sizes:'192x192',type:'image/png'},{src:location.origin+'/assets/icons/icon-512.png',sizes:'512x512',type:'image/png'},{src:location.origin+'/assets/icons/icon-maskable-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'}]};" +
      "var ln=document.querySelector(\"link[rel='manifest']\")||document.createElement('link');ln.rel='manifest';" +
      "ln.href='data:application/manifest+json;charset=utf-8,'+encodeURIComponent(JSON.stringify(man));" +
      "if(!ln.parentNode)document.head.appendChild(ln);window.__manApp=man;}catch(e){}})();" +
      "function L(k,f){try{return JSON.parse(localStorage.getItem(k))||f;}catch(e){return f;}}" +
      "function pl(n,s1,s2){return n+' '+(n===1?s1:s2);}" +
      "function Sv(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}" +
      "if(k==='ptpeso'||k==='ptdc'||k==='ptfeitos'||k==='ptfotos'||k==='pthab'||k==='ptrpe'||k==='ptonb'||k==='ptwodres'||k==='ptcardio'||k==='ptfc'||k==='ptidade'||k==='ptfotoperfil'||k==='ptaceite'||k==='ptnotas'||k==='ptdepo')devolveApp();" +
      "if(k==='ptfeitos'||k==='pthab'||k==='ptpeso'||k==='ptqa'){try{pintaHero();pintaCqTiles();pintaXP();}catch(e){}}}" +
      // devolve pro personal o que o aluno registra (peso, cargas, treinos, fotos antes/depois)
      "var devT=null;function devolveApp(){if(!NUVEM||!TOKEN)return;clearTimeout(devT);devT=setTimeout(function(){" +
      // o antes/depois que vai pro painel prioriza as fotos de FRENTE (tela 41)
      "var fs=L('ptfotos',[]);var fr=fs.filter(function(x){return (x.tipo||'frente')==='frente';});if(!fr.length)fr=fs;" +
      "var pri=fr[0]||null;var ult=fr.length>1?fr[fr.length-1]:null;" +
      // celular novo/limpo: sem nenhum registro local não devolve nada (senão apagaria o histórico que já está na nuvem)
      "if(!Object.keys(L('ptpeso',{})).length&&!Object.keys(L('ptdc',{})).length&&!Object.keys(L('ptfeitos',{})).length&&!Object.keys(L('pthab',{})).length&&!fs.length&&!L('ptonb',null)&&!Object.keys(L('ptrpe',{})).length&&!L('ptfotoperfil',''))return;" +
      /* FOTO SÓ QUANDO MUDA (v611). Este devolve dispara a cada peso, carga,
       * treino marcado, hábito, corrida ou batimento — e num treino de verdade
       * as anotações estão minutos umas das outras, então a folga de 1,8 s não
       * junta quase nada: era um envio por anotação, cada um carregando as TRÊS
       * fotos de novo (antes, depois e perfil), sem terem mudado. Ordem de 30 MB
       * por aluno por mês de banda jogada fora.
       *
       * Some as chaves de foto quando a marca bate com a do último envio que
       * DEU CERTO. Omitir é seguro porque o app_retorno_mescla só mexe nas
       * chaves que chegam: o que não vem fica como está na nuvem. E a marca só
       * é guardada quando o servidor responde ok — envio que falhou manda a
       * foto de novo na próxima. */
      "var perf9=L('ptfotoperfil','')||null;" +
      "function mrc9(x){if(!x||!x.img)return '-';var im=String(x.img);return x.d+':'+im.length+':'+im.slice(-24);}" +
      "var marca9=[mrc9(pri),mrc9(ult),perf9?(perf9.length+':'+perf9.slice(-24)):'-'].join('|');" +
      "var dd9={nome:PRIMEIRO,nivel:nivelDe(xpDados()),peso:L('ptpeso',{}),cargas:L('ptdc',{}),feitos:L('ptfeitos',{}),habitos:L('pthab',{}),rpe:L('ptrpe',{}),onb:L('ptonb',null),wodres:L('ptwodres',{}),cardio:L('ptcardio',[]),fc:L('ptfc',{}),idade:+L('ptidade',0)||0," +
      "aceite:L('ptaceite',null)," +
      "notas:L('ptnotas',[])," +
      "depo:L('ptdepo',null)," +
      "atualizado:new Date().toISOString()};" +
      "if(marca9!==L('ptdevfoto','')){dd9.fotoAntes=pri?pri.img:null;dd9.fotoAntesD=pri?pri.d:null;" +
      "dd9.fotoDepois=ult?ult.img:null;dd9.fotoDepoisD=ult?ult.d:null;dd9.fotoPerfil=perf9;}" +
      "rpcApp('app_aluno_devolve',{t:TOKEN,p_dados:dd9}).then(function(r9){if(r9&&r9.ok)Sv('ptdevfoto',marca9);});},1800);}" +
      "window.__devolveApp=devolveApp;" +
      "setTimeout(devolveApp,2500);" +
      /* 📜 Termo de responsabilidade (contrato digital): o professor escreve o
       * texto em Configurações e ele viaja como {t, v} — v é a DATA de salvar,
       * a versão. Aluno que ainda não aceitou ESTA versão vê a tela cheia ao
       * abrir: o texto rolável, "Li e aceito" (grava ptaceite = {v, em}, que o
       * devolveApp manda pro professor) e "Deixar pra depois" (fecha; volta na
       * próxima abertura — nada trava o treino de quem está sem tempo).
       * Sem termo configurado, NADA aparece. */
      "var TERMO=" + jsonApp(D.termoApp || null) + ";" +
      "(function(){if(!TERMO||!TERMO.t)return;var ac=L('ptaceite',null);if(ac&&ac.v===TERMO.v)return;" +
      "var ov=document.createElement('div');ov.id='termoOv';" +
      "ov.style.cssText='position:fixed;inset:0;z-index:120;background:var(--bg);display:flex;flex-direction:column;padding:22px 18px calc(18px + env(safe-area-inset-bottom,0px));';" +
      "var h=document.createElement('div');h.innerHTML=\"<b style='font-size:19px;font-weight:900;'>Termo de responsabilidade</b><div style='font-size:12.5px;color:#8a8695;margin-top:2px;'>do seu personal — leia antes de continuar</div>\";" +
      "var tx=document.createElement('div');tx.style.cssText='flex:1;overflow-y:auto;margin:14px 0;background:var(--bg2);border:1px solid rgba(255,255,255,.05);border-radius:16px;padding:16px;font-size:13.5px;line-height:1.6;white-space:pre-wrap;';tx.textContent=TERMO.t;" +
      "var bt=document.createElement('button');bt.type='button';bt.textContent='Li e aceito';bt.style.cssText='min-height:52px;background:var(--cor);color:#fff;border:none;border-radius:14px;font-family:inherit;font-weight:900;font-size:15px;cursor:pointer;';" +
      "var dp=document.createElement('button');dp.type='button';dp.textContent='Deixar pra depois';dp.style.cssText='min-height:44px;background:none;border:none;color:#8a8695;font-family:inherit;font-size:13px;cursor:pointer;margin-top:6px;';" +
      "bt.addEventListener('click',function(){Sv('ptaceite',{v:TERMO.v,em:isoHj()});ov.remove();});" +
      "dp.addEventListener('click',function(){ov.remove();});" +
      "ov.appendChild(h);ov.appendChild(tx);ov.appendChild(bt);ov.appendChild(dp);document.body.appendChild(ov);})();" +
      "window.__termo={v:TERMO&&TERMO.v||null};" +
      /* Depoimento (v694): o card do Início só aparece quando o PROFESSOR pediu
       * (chega no pacote como PDEPO) e o aluno ainda não escreveu. O texto vai
       * pro personal dentro do retorno (ptdepo) — sem SQL novo. */
      "var PDEPO=" + (D.pedeDepo ? 1 : 0) + ";" +
      "(function(){var cx=document.getElementById('depoCard');if(!cx)return;" +
      "var jd=L('ptdepo',null);if(!PDEPO||(jd&&jd.t))return;cx.style.display='';" +
      "document.getElementById('depoBt').addEventListener('click',function(){" +
      "var t=String(document.getElementById('depoTx').value||'').trim().slice(0,300);if(!t)return;" +
      "Sv('ptdepo',{t:t,em:isoHj()});" +
      "cx.innerHTML=\"<h2>Obrigado! \\ud83d\\udc9c</h2><div class='vz' style='text-align:left;'>Seu depoimento foi direto pro seu personal.</div>\";});})();" +
      "window.__depo={pede:!!PDEPO};" +
      // 🎁 cupom do clube (v697): tocar copia o código — com reserva pro
      // navegador sem clipboard (textarea + execCommand)
      "document.addEventListener('click',function(e){var cb=e.target.closest&&e.target.closest('.cupbt');if(!cb)return;" +
      "var cd=cb.getAttribute('data-cup');" +
      "function feito(){cb.textContent='Copiado! \\u2713';setTimeout(function(){cb.textContent=cd+' \\u00b7 copiar';},2200);}" +
      "if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(cd).then(feito,feito);}" +
      "else{try{var ta=document.createElement('textarea');ta.value=cd;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();feito();}catch(e9){}}});" +
      /* Comprar na loja (v698/v701): com o gateway do professor ligado
       * (LOJAPG), o toque pede o link de pagamento pra função pagamentos —
       * ação 'loja', autenticada pelo TOKEN do aluno, e o PREÇO sai do
       * servidor (o app manda só o nome do item). Deu qualquer erro, cai no
       * caminho de sempre: WhatsApp com o pedido pronto, ou o chat. */
      "var LOJAPG=" + (D.lojaPg ? 1 : 0) + ";" +
      "document.addEventListener('click',function(e){var lb=e.target.closest&&e.target.closest('.lojabt');if(!lb||lb.disabled)return;" +
      "var it=lb.getAttribute('data-item'),pr=lb.getAttribute('data-preco');" +
      "var rot0=LOJAPG?'Comprar':'Quero esse';" +
      "function porZap(){if(ZAPP){window.open('https://wa.me/55'+ZAPP+'?text='+encodeURIComponent('Oi! Quero comprar: '+it+' ('+pr+'). Como fa\\u00e7o?'),'_blank');}" +
      "else{lb.textContent='Pe\\u00e7a pelo chat';setTimeout(function(){lb.textContent=rot0;},2600);}}" +
      "if(LOJAPG&&NUVEM&&TOKEN){lb.disabled=true;lb.textContent='Gerando\\u2026';" +
      "fetch(NUVEM.u+'/functions/v1/pagamentos',{method:'POST',headers:{apikey:NUVEM.k,Authorization:'Bearer '+NUVEM.k,'Content-Type':'application/json'},body:JSON.stringify({acao:'loja',t:TOKEN,item:it})})" +
      ".then(function(r){return r.json();}).then(function(d){lb.disabled=false;lb.textContent=rot0;" +
      "if(d&&d.ok&&d.link){window.open(d.link,'_blank');}else{porZap();}})" +
      ".catch(function(){lb.disabled=false;lb.textContent=rot0;porZap();});}" +
      "else{porZap();}});" +
      /* O ALUNO troca a própria foto tocando no avatar. A imagem é cortada em
       * quadrado e reduzida pra 320 px aqui no aparelho — a mesma medida que o
       * painel usa — antes de ser guardada e de viajar pro personal. A foto
       * original nunca sai do celular: o que vai é a versão pequena. */
      // a mesma foto aparece no topo, no herói do Início, no menu e nos Ajustes
      "function avPinta(src){[['avImg','avIni'],['avImg2','avIni2'],['mgImg','mgIni'],['ajImg','ajIni']].forEach(function(par){" +
      "var im=document.getElementById(par[0]),ini=document.getElementById(par[1]);if(!im||!ini)return;" +
      "if(src){im.src=src;im.style.display='';ini.style.display='none';}else{im.removeAttribute('src');im.style.display='none';ini.style.display='';}});}" +
      "(function(){var fl=document.getElementById('avFile'),bt=document.getElementById('avBtn');if(!fl||!bt)return;" +
      // a foto escolhida pelo aluno vence a que veio do painel
      "var minha=L('ptfotoperfil','');if(minha)avPinta(minha);" +
      "bt.addEventListener('click',function(){fl.click();});" +
      "var bt2=document.getElementById('avBtn2');if(bt2)bt2.addEventListener('click',function(){fl.click();});" +
      "fl.addEventListener('change',function(){var f=fl.files&&fl.files[0];fl.value='';if(!f)return;" +
      "var rd=new FileReader();rd.onload=function(){var im=new Image();" +
      "im.onerror=function(){alert('Não consegui abrir essa imagem. Tenta outra foto.');};" +
      "im.onload=function(){var lado=Math.min(im.width,im.height);" +
      "var cv=document.createElement('canvas');cv.width=cv.height=Math.min(320,lado);" +
      "cv.getContext('2d').drawImage(im,(im.width-lado)/2,(im.height-lado)/2,lado,lado,0,0,cv.width,cv.height);" +
      "var dado=cv.toDataURL('image/jpeg',.82);" +
      "if(dado.length>380000){alert('Essa foto ficou pesada demais. Tenta outra.');return;}" +
      // Sv já avisa o personal (a chave está na lista que chama o devolveApp)
      "Sv('ptfotoperfil',dado);avPinta(dado);};im.src=rd.result;};" +
      "rd.onerror=function(){alert('Não consegui ler essa imagem. Tenta outra foto.');};rd.readAsDataURL(f);});})();" +
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
      "var VP='BCF653mK3mhwGp4W3c4Wq9MlprvFVwcfBGKDBmxVRdaI_S3y-umX1w6z1MyJuR_-WiO3IthaYSaDF9XMtK1O66I';" +
      "function va(s){var pad=new Array((4-s.length%4)%4+1).join('=');var b=(s+pad).replace(/-/g,'+').replace(/_/g,'/');" +
      "var raw=atob(b);var arr=new Uint8Array(raw.length);for(var i=0;i<raw.length;i++)arr[i]=raw.charCodeAt(i);return arr;}" +
      "function tentaPushP(){if(!('serviceWorker'in navigator)||!('PushManager'in window)||location.protocol!=='https:')return;" +
      "navigator.serviceWorker.register('app-sw.js').then(function(reg){" +
      "return reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:va(VP)});" +
      "}).then(function(sub){rpcApp('app_aluno_push',{t:TOKEN,p_sub:sub.toJSON()});}).catch(function(e){});}" +
      "if(Notification.permission==='granted'){tentaPushP();return;}" +
      "if(Notification.permission!=='default')return;" +
      "var card=document.getElementById('cardNotif'),btn=document.getElementById('btnNotif');" +
      // a linha Notificações dos Ajustes (tela 11) assumiu o papel deste card —
      // ele só volta a aparecer se a linha não existir
      "if(card&&btn&&!document.getElementById('ajNotif')){card.style.display='block';btn.addEventListener('click',function(){" +
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
      // RPE de 1 toque: como foi o treino de hoje? Os botões saem daqui pros
      // dois lugares que perguntam — o recibo do fim da sessão e o card da
      // área de Treino — pra pergunta e resposta serem sempre as mesmas.
      "function rpeHtml(){return \"<div class='rpelab'>Como foi o treino de hoje?</div><div class='rperow'>\"+" +
      "[['1','Leve'],['2','Na medida'],['3','Pesado']].map(function(o){return \"<button type='button' class='rpebtn' data-rpe='\"+o[0]+\"'>\"+o[1]+\"</button>\";}).join('')+'</div>';}" +
      "function mostraRpe(){var iso=isoHj();var r=L('ptrpe',{});var bx=document.getElementById('cardRpe');if(!bx)return;" +
      "if(!L('ptfeitos',{})[iso]||r[iso]){bx.style.display='none';bx.innerHTML='';return;}" +
      "bx.style.display='block';bx.innerHTML=rpeHtml();}" +
      "document.addEventListener('click',function(e){var b=e.target.closest('[data-rpe]');if(!b)return;" +
      "var r=L('ptrpe',{});r[isoHj()]=+b.dataset.rpe;var ks=Object.keys(r).sort();if(ks.length>90)delete r[ks[0]];Sv('ptrpe',r);" +
      "if(window.__pintaEsforco)window.__pintaEsforco();" +
      "var cx=b.closest('[data-rpebox]');if(!cx)return;" +
      "cx.innerHTML=\"<div class='rpeok'>Anotado! Seu personal vê isso e ajusta o próximo treino.</div>\";" +
      // respondeu no recibo → o card da área de Treino não pode perguntar de novo
      "if(cx.id==='cardRpe'){setTimeout(function(){cx.style.display='none';},2600);return;}" +
      "var cr=document.getElementById('cardRpe');if(cr){cr.style.display='none';cr.innerHTML='';}});" +
      /* 📝 resumo ESCRITO do treino (v686): o RPE dá a nota, aqui o aluno conta
       * com as próprias palavras ("senti o ombro no supino", "sobrou gás").
       * Um widget só pros TRÊS fins — musculação, corrida e circuito — no
       * mesmo desenho do RPE: montador + clique delegado no document, então
       * funciona em qualquer tela que o incluir. Guarda em ptnotas (teto 60),
       * que viaja pro professor no retorno e entra nos dados da IA. Vazio não
       * grava nada — o campo é opcional de verdade. */
      "function notaBox(tp){return \"<div class='ntbox' data-notabox><div class='rpelab'>Quer contar como foi? (opcional)</div>\"+" +
      "\"<textarea class='ntTxt' maxlength='400' rows='3' placeholder='ex.: senti o ombro no supino, sobrou g\\u00e1s no final\\u2026'></textarea>\"+" +
      "\"<button type='button' class='ntSalva' data-notasalva='\"+tp+\"'>Guardar resumo</button></div>\";}" +
      "document.addEventListener('click',function(e){var b=e.target.closest('[data-notasalva]');if(!b)return;" +
      "var cx=b.closest('[data-notabox]');var ta=cx&&cx.querySelector('.ntTxt');" +
      "var tx=ta?ta.value.trim().slice(0,400):'';if(!tx)return;" +
      "var lst=L('ptnotas',[]);lst.push({d:isoHj(),tp:b.dataset.notasalva,t:tx});if(lst.length>60)lst.shift();Sv('ptnotas',lst);" +
      // ⚠️ nada de citar IA pro ALUNO: quem monta o treino, aos olhos dele, é
      // o PROFESSOR — a IA é ferramenta do professor, não personagem do app
      "cx.innerHTML=\"<div class='rpeok'>Anotado! Vai direto pro seu personal \\u2014 ele leva isso em conta no seu pr\\u00f3ximo treino.</div>\";});" +
      "window.__trNota={lista:function(){return L('ptnotas',[]);},box:notaBox};" +
      // semana: bolinhas seg-dom + meta + streak + medalhas
      "function pintaSemana(){var f=L('ptfeitos',{});var hj=new Date();var seg=new Date(hj);seg.setDate(seg.getDate()-((seg.getDay()+6)%7));" +
      "var rot=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];var html='';var naSem=0;" +
      "for(var i=0;i<7;i++){var d=new Date(seg);d.setDate(d.getDate()+i);var iso=isoLoc(d);var fez=!!f[iso];if(fez)naSem++;" +
      "var hoje=iso===isoHj();html+=\"<div style='flex:1;min-width:0;'><div style='border-radius:9px;padding:7px 0 5px;text-align:center;\"+(fez?'background:linear-gradient(135deg,var(--cor),var(--corc));':'background:var(--bg4);border:1px solid var(--bg10);')+(hoje?'outline:2px solid var(--corc);outline-offset:1px;':'')+\"'>\"+" +
      "\"<div style='font-size:8.5px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:\"+(fez?'rgba(255,255,255,.85)':'#6e6a78')+\";'>\"+rot[i]+\"</div>\"+" +
      "\"<div style='font-size:14px;font-weight:800;margin-top:1px;color:\"+(fez?'#fff':'#d6d2df')+\";'>\"+d.getDate()+\"</div></div></div>\";}" +
      "document.getElementById('diasSem').innerHTML=html;" +
      /* a linha de resumo substitui o anel 4/4 E a barra "Meta da semana":
       * os chips seg-dom acima já mostram quantos e QUAIS dias foram. */
      "var sq9=seqAtual(f);var sr9=document.getElementById('semResumo');" +
      "if(sr9)sr9.innerHTML=\"<span>\"+naSem+' de '+META+' na semana</span>'+" +
      "(sq9>0?\"<span style='color:#3c3846;'>\\u2022</span><span style='color:#fb923c;display:inline-flex;align-items:center;gap:5px;'>\"+icx(ICO.chama,17)+sq9+' dia'+(sq9>1?'s':'')+' seguido'+(sq9>1?'s':'')+'</span>':'');" +
      // a dica do treino de HOJE (carga, circuito ou pace) vence o recado
      // genérico da semana — é o que o desenho chama de recado do coach
      "var ct=document.getElementById('coachTxt');if(ct)ct.innerHTML=(typeof coachDica==='function'?coachDica():null)||(naSem>=META?" +
      "'Semana fechada: <b>'+naSem+' de '+META+'</b> treinos. Orgulho define — mantém o ritmo!':" +
      "naSem>0?'Você já fez <b>'+naSem+' de '+META+'</b> treinos essa semana — hoje dá pra somar mais um.':" +
      "'Bora abrir a semana: <b>'+META+' treino'+(META>1?'s':'')+'</b> te esperando.');" +
      "var total=Object.keys(f).length;var marcos=[100,50,25,10,5];" +
      "var falta=null;for(var j=marcos.length-1;j>=0;j--){if(total<marcos[j]){falta=marcos[j];break;}}" +
      "var md9=document.getElementById('medalhas');" +
      "if(md9)md9.innerHTML='<b>'+pl(total,'treino registrado','treinos registrados')+'</b>'+(falta?\" \\u00b7 faltam \"+(falta-total)+\" pra marca de \"+falta:'');}" +
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
      "var EMO=['Péssima','Ruim','Normal','Boa','Incrível'];" +
      "var FACES=[\"<circle cx='12' cy='12' r='9'/><path d='M9 9.5v.01M15 9.5v.01'/><path d='M8.5 16.2c1-1.5 2.3-2.2 3.5-2.2s2.5.7 3.5 2.2'/>\"," +
      "\"<circle cx='12' cy='12' r='9'/><path d='M9 9.5v.01M15 9.5v.01'/><path d='M9 15.6c1-.7 2-1 3-1s2 .3 3 1'/>\"," +
      "\"<circle cx='12' cy='12' r='9'/><path d='M9 9.5v.01M15 9.5v.01'/><path d='M9 15h6'/>\"," +
      "\"<circle cx='12' cy='12' r='9'/><path d='M9 9.5v.01M15 9.5v.01'/><path d='M8.5 14c1 1.5 2.3 2.2 3.5 2.2s2.5-.7 3.5-2.2'/>\"," +
      "\"<circle cx='12' cy='12' r='9'/><path d='M9 9.5v.01M15 9.5v.01'/><path d='M8 13.5a4.2 4.2 0 0 0 8 0z'/>\"];" +
      "function semanaCK(){return semDe(new Date());}" +
      // o menu Questionários conta o check-in pendente da semana junto
      "window.__ckPend=function(){return L('ptck','')===semanaCK()?0:1;};" +
      // check-in da semana já enviado? O card SOME até a semana virar (pedido
      // do Raphael) — a confirmação só aparece na hora do envio (fim())
      "if(L('ptck','')===semanaCK()){var ckc9=document.getElementById('ckCard');if(ckc9)ckc9.style.display='none';}" +
      // check-in semanal — uma pergunta por tela (mesma casca do #qaFluxo do questionário)
      "(function(){var abre=document.getElementById('ckAbrir');if(!abre)return;" +
      "var CKP=[{k:'nota',t:'Como foi a sua semana de treino?'},{k:'peso',t:'Quanto você tá pesando hoje?'},{k:'texto',t:'Algum recado pro seu personal?'}];" +
      "var T=CKP.length,fx=null,st9=null;" +
      "function dLe(){var d=L('ptckdraft',{})[semanaCK()];return d?{i:Math.min(+d.i||0,T-1),nota:+d.nota||0,peso:d.peso||'',texto:d.texto||''}:{i:0,nota:0,peso:'',texto:''};}" +
      "function dSalva(){var a9=L('ptckdraft',{});a9[semanaCK()]=st9;Sv('ptckdraft',a9);}" +
      "function dLimpa(){var a9=L('ptckdraft',{});delete a9[semanaCK()];Sv('ptckdraft',a9);}" +
      "function fecha(){if(fx){fx.remove();fx=null;}}" +
      "function pinta(){var p=CKP[st9.i],ultima=st9.i===T-1,ok=p.k!=='nota'||!!st9.nota,corpo='';" +
      "var barra=CKP.map(function(x,xi){return \"<i class='\"+(xi===st9.i?'on':'')+\"'></i>\";}).join('');" +
      "if(p.k==='nota'){corpo=EMO.map(function(e,i){var on=st9.nota===i+1;" +
      "return \"<button class='qaop\"+(on?' on':'')+\"' data-ckn='\"+(i+1)+\"'><span class='qe' style='line-height:0;color:var(--corc);'>\"+icx(FACES[i],30)+\"</span><span style='flex:1;text-align:left;font-size:17px;font-weight:800;'>\"+e+'</span>'+(on?\"<span style='font-size:20px;'>✓</span>\":'')+'</button>';}).join('')+" +
      "\"<div style='text-align:center;font-size:12.5px;color:#6e6a78;margin-top:12px;'>toque numa opção pra avançar automático</div>\";}" +
      "else if(p.k==='peso'){corpo=\"<div style='display:flex;align-items:baseline;justify-content:center;gap:8px;margin-top:8px;'><input id='ckPeso' inputmode='decimal' placeholder='0,0' style='width:4.2em;background:none;border:none;text-align:right;color:#fff;font-size:52px;font-weight:900;font-variant-numeric:tabular-nums;padding:0;min-height:60px;'><u style='font-style:normal;text-decoration:none;font-size:17px;font-weight:800;color:#8a8695;'>kg</u></div>\"+" +
      "\"<div style='text-align:center;font-size:12.5px;color:#6e6a78;margin-top:10px;'>opcional — sem peso hoje, toca em Próxima</div>\";}" +
      "else{corpo=\"<textarea id='ckTexto' rows='4' class='wpobs' placeholder='Escreve aqui… (opcional)'></textarea>\";}" +
      "fx.innerHTML=\"<div style='max-width:480px;margin:0 auto;min-height:100%;display:flex;flex-direction:column;padding:calc(12px + env(safe-area-inset-top,0px)) 18px calc(20px + env(safe-area-inset-bottom,0px));'>\"+" +
      "\"<div style='display:flex;align-items:center;gap:10px;'><button id='ckX' aria-label='Fechar o check-in' style='flex:none;width:44px;height:44px;border-radius:50%;background:var(--bg2);border:1px solid var(--bg11);color:#fff;font-size:16px;font-family:inherit;cursor:pointer;'>✕</button>\"+" +
      "\"<span style='flex:1;text-align:center;font-size:10.5px;font-weight:800;letter-spacing:.22em;color:#8a8695;text-transform:uppercase;'>Check-in da semana</span>\"+" +
      "\"<span style='flex:none;font-size:15px;font-weight:900;'>\"+(st9.i+1)+\"<span style='color:#6e6a78;'>/\"+T+'</span></span></div>'+" +
      "\"<div class='qabar'>\"+barra+'</div>'+" +
      "\"<div style='font-size:clamp(24px,7vw,30px);font-weight:900;letter-spacing:-.02em;line-height:1.15;margin:22px 0 14px;'>\"+p.t+'</div>'+" +
      "\"<div style='flex:1;'>\"+corpo+'</div>'+" +
      "\"<button id='ckProx' class='btnx' style='width:100%;min-height:58px;font-size:17px;margin-top:16px;\"+(ok?'':'opacity:.45;')+\"'>\"+(ultima?'Enviar check-in':'Próxima')+'</button>'+" +
      "(st9.i>0?\"<button id='ckAnt' style='background:none;border:none;color:#8a8695;font-family:inherit;font-size:13.5px;font-weight:700;padding:12px;cursor:pointer;'>‹ pergunta anterior</button>\":'')+'</div>';" +
      "var pi=document.getElementById('ckPeso');if(pi)pi.value=st9.peso;" +
      "var tx=document.getElementById('ckTexto');if(tx)tx.value=st9.texto;}" +
      "function avanca(){if(!fx)return;if(CKP[st9.i].k==='nota'&&!st9.nota)return;" +
      "if(st9.i<T-1){st9.i++;dSalva();pinta();}else{envia();}}" +
      "function enviadoTela(){if(!fx)return;fx.innerHTML=\"<div style='min-height:100%;background:linear-gradient(180deg,var(--cor) 0%,var(--cor2) 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px 24px calc(24px + env(safe-area-inset-bottom,0px));'>\"+" +
      "\"<div style='width:82px;height:82px;border-radius:50%;background:rgba(255,255,255,.22);border:1.5px solid rgba(255,255,255,.4);display:flex;align-items:center;justify-content:center;font-size:38px;color:#fff;'>✓</div>\"+" +
      "\"<div style='font-size:11px;font-weight:800;letter-spacing:.26em;color:rgba(255,255,255,.75);text-transform:uppercase;margin-top:22px;'>Check-in enviado</div>\"+" +
      "\"<div style='font-size:30px;font-weight:900;color:#fff;letter-spacing:-.02em;margin-top:8px;'>Semana registrada</div>\"+" +
      "\"<div style='font-size:15px;color:rgba(255,255,255,.85);margin-top:10px;max-width:320px;line-height:1.5;'>Seu personal já viu. O próximo check-in abre na segunda.</div>\"+" +
      "\"<div style='flex:1;min-height:24px;'></div>\"+" +
      "\"<button id='ckVoltaIni' style='width:100%;min-height:58px;border-radius:99px;background:#fff;border:none;color:var(--cor-esc,#3b2b63);font-family:inherit;font-size:17px;font-weight:800;cursor:pointer;'>Voltar pro início</button>\"+" +
      "\"<button id='ckChat' style='width:100%;min-height:52px;border-radius:99px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.3);color:#fff;font-family:inherit;font-size:15px;font-weight:800;cursor:pointer;margin-top:10px;'>Falar com o seu personal</button></div>\";" +
      "var vi=document.getElementById('ckVoltaIni');if(vi)vi.onclick=function(){fecha();if(window.__trocaSec)window.__trocaSec('inicio');};" +
      "var fc=document.getElementById('ckChat');if(fc)fc.onclick=function(){fecha();if(window.__trocaSec)window.__trocaSec('chat');};}" +
      "function envia(){var peso=parseFloat(String(st9.peso||'').replace(',','.'))||null,texto=String(st9.texto||'').trim();" +
      "var bt=document.getElementById('ckProx');if(bt){bt.disabled=true;bt.textContent='Enviando…';}" +
      "var fim=function(){Sv('ptck',semanaCK());dLimpa();" +
      "var fo=document.getElementById('ckForm'),ok9=document.getElementById('ckOk');if(fo)fo.style.display='none';if(ok9)ok9.style.display='';" +
      "if(window.__menuBadges)window.__menuBadges();enviadoTela();};" +
      "if(NUVEM){rpcApp('app_aluno_checkin',{t:TOKEN,p_nota:st9.nota,p_texto:texto,p_peso:peso}).then(function(r){" +
      "if(r&&r.ok){fim();}else{if(bt){bt.disabled=false;bt.textContent='Enviar check-in';}alert('Não deu pra enviar agora — tenta de novo em instantes.');}});}" +
      "else{var msg='Check-in da semana — '+PRIMEIRO+'\\nSemana: '+EMO[st9.nota-1]+(peso?'\\nPeso: '+peso+' kg':'')+(texto?'\\n'+texto:'');" +
      "window.open('https://wa.me/'+(ZAPP?'55'+ZAPP:'')+'?text='+encodeURIComponent(msg),'_blank');fim();}}" +
      "function abreFluxo(){st9=dLe();fx=document.createElement('div');fx.id='ckFluxo';document.body.appendChild(fx);" +
      "fx.addEventListener('input',function(e){if(e.target.id==='ckPeso'){st9.peso=e.target.value;dSalva();}" +
      "if(e.target.id==='ckTexto'){st9.texto=e.target.value;dSalva();}});" +
      "fx.addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;" +
      "if(b.id==='ckX'){dSalva();fecha();" +
      "var ab=document.getElementById('ckAbrir');if(ab&&(st9.nota||st9.peso||st9.texto))ab.textContent='Continuar de onde parou';return;}" +
      "if(b.id==='ckAnt'){st9.i=Math.max(0,st9.i-1);pinta();return;}" +
      "if(b.id==='ckProx'){avanca();return;}" +
      "if(b.dataset.ckn!=null){st9.nota=+b.dataset.ckn;dSalva();pinta();setTimeout(avanca,350);return;}});" +
      "pinta();}" +
      "abre.addEventListener('click',abreFluxo);window.__ckFluxo=abreFluxo;" +
      "var d9=L('ptckdraft',{})[semanaCK()];" +
      "if(d9&&(d9.nota||d9.peso||d9.texto))abre.textContent='Continuar de onde parou';" +
      "})();" +
      "pintaSemana();mostraRpe();" +
      // onboarding de 30 segundos: 3 respostas que personalizam o acompanhamento
      // quem já respondeu perde o CTA do card do primeiro dia (antes do return cedo!)
      "(function(){var pd9=document.getElementById('pdOnb');if(pd9&&L('ptonb',null))pd9.style.display='none';" +
      "var card=document.getElementById('onbCard');if(!card||L('ptonb',null))return;card.style.display='block';" +
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
      // tela 14: confirmado = quadradinho na cor do studio; pedido = tracejado;
      // hoje = quadradinho branco (classe, pro modo claro ter regra própria)
      "for(var d2=1;d2<=nd;d2++){var iso=y+'-'+('0'+(m+1)).slice(-2)+'-'+('0'+d2).slice(-2);var st2=pontos[iso];var hoje2=iso===isoHj();" +
      "var sty='',cls='';" +
      "if(AGSEL===iso)sty='background:linear-gradient(135deg,var(--cor),var(--corc));color:#fff;';" +
      "else if(hoje2)cls='aghoje';" +
      "else if(st2==='confirmado')sty='background:linear-gradient(160deg,var(--corc),var(--cor));color:#fff;';" +
      "else if(st2==='pedido')sty='border:1.5px dashed var(--corc);color:#d6d2df;';" +
      "else if(st2)sty='border:1.5px dashed #f87171;color:#d6d2df;';" +
      "else sty='color:#a9a4b5;';" +
      "var pon=(AGSEL===iso||st2==='confirmado')&&!cls?'rgba(255,255,255,.9)':cls?'var(--cor)':st2==='pedido'?'var(--corc)':'#f87171';" +
      "h+=\"<div data-agdia='\"+iso+\"'\"+(cls?\" class='\"+cls+\"'\":'')+\" style='aspect-ratio:1;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:13px;cursor:pointer;font-size:13.5px;font-weight:700;\"+sty+\"'>\"+d2+" +
      "(st2||((AGSEL===iso||hoje2)&&pontos[iso])?\"<span style='width:5px;height:5px;border-radius:50%;margin-top:2px;background:\"+pon+\";'></span>\":\"<span style='height:7px;'></span>\")+'</div>';}" +
      "h+='</div>';el.innerHTML=h;" +
      "document.getElementById('agAnt').onclick=function(){AGMES.setMonth(AGMES.getMonth()-1);pintaCal();};" +
      "document.getElementById('agProx').onclick=function(){AGMES.setMonth(AGMES.getMonth()+1);pintaCal();};pintaDia();pintaAgTopo();}" +
      // cabeçalho da agenda (tela 14): a próxima sessão confirmada + os dois botões
      "function pintaAgTopo(){var el=document.getElementById('agProxTit');if(!el)return;var hj9=isoHj();" +
      "var fut=agDados().filter(function(x){return x.status==='confirmado'&&x.dia>=hj9;}).sort(function(a9,b9){return (a9.dia+(a9.hora||'')).localeCompare(b9.dia+(b9.hora||''));})[0];" +
      "var bts=document.getElementById('agTopoBts');var sub=document.getElementById('agProxSub');" +
      "if(!fut){el.textContent='Nada marcado';sub.textContent='pede um horário aqui embaixo';bts.innerHTML='';return;}" +
      "var dt8=new Date(fut.dia+'T12:00:00');var nm8=DSEMA[dt8.getDay()];nm8=nm8.charAt(0)+nm8.slice(1).toLowerCase();" +
      "el.textContent=nm8+', '+(fut.hora||'a combinar');" +
      "sub.textContent='é o próximo — dia '+String(fut.dia).slice(8,10)+'/'+String(fut.dia).slice(5,7);" +
      "var pill='flex:1;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.35);color:#fff;border-radius:99px;min-height:48px;font-weight:800;font-size:13.5px;font-family:inherit;cursor:pointer;';" +
      "bts.innerHTML=\"<button type='button' data-agics='\"+fut.dia+'|'+(fut.hora||'')+\"' style='\"+pill+\"'>Salvar no meu celular</button>\"+" +
      "\"<button type='button' data-agrem='\"+fut.dia+'|'+(fut.hora||'')+\"' style='\"+pill+\"'>Preciso remarcar</button>\";}" +
      // nomes locais porque o DSEM_ global só nasce mais pra baixo no script
      "var DSEMA=['DOMINGO','SEGUNDA','TERÇA','QUARTA','QUINTA','SEXTA','SÁBADO'];" +
      "function pintaDia(){var box=document.getElementById('agDia');var form=document.getElementById('agForm');" +
      "var pend9=document.getElementById('agPend');if(pend9){var np9=agDados().filter(function(x){return x.status==='pedido'&&x.dia>=isoHj();}).length;" +
      "pend9.textContent=np9?'você tem '+pl(np9,'pedido esperando','pedidos esperando')+' resposta':'';}" +
      "if(!AGSEL){box.innerHTML='';form.style.display='none';return;}" +
      "var l=agDados().filter(function(x){return x.dia===AGSEL;});var pd=AGSEL.split('-');" +
      "var dt9=new Date(AGSEL+'T12:00:00');" +
      "box.innerHTML=\"<div style='display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;'>\"+" +
      "\"<span class='wpk' style='margin:0;'>\"+DSEMA[dt9.getDay()]+', '+(+pd[2])+' DE '+MESES[+pd[1]-1].toUpperCase()+\"</span>\"+" +
      "(AGSEL===isoHj()?\"<span style='background:rgba(74,222,128,.14);color:#4ade80;border-radius:99px;padding:4px 12px;font-size:10.5px;font-weight:800;letter-spacing:.08em;'>HOJE</span>\":'')+'</div>'+(l.length?l.map(function(x){" +
      "var cor=x.status==='confirmado'?'#4ade80':x.status==='pedido'?'#fbbf24':'#f87171';" +
      "var rot=x.status==='confirmado'?'confirmado':x.status==='pedido'?'aguardando':'não deu';" +
      "return \"<div class='kv'><span>\"+(x.hora||'horário a combinar')+(x.obs?\" · <small style='color:#a9a4b5'>\"+String(x.obs).replace(/</g,'&lt;')+'</small>':'')+\"</span><span><b style='color:\"+cor+\"'>\"+rot+'</b>'+(x.status==='confirmado'?\" <button data-agics='\"+x.dia+'|'+(x.hora||'')+\"' title='Salvar no calendário' style='background:rgba(var(--cor-rgb),.14);border:1px solid var(--cor);color:var(--cor-cl1);border-radius:14px;padding:3px 8px;cursor:pointer;font-size:0;line-height:0;' aria-label='Salvar no calendário'><svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' aria-hidden='true'><rect x='3' y='5' width='18' height='16' rx='2'/><path d='M16 3v4M8 3v4M3 11h18'/></svg></button>\":'')+'</span></div>';}).join(''):\"<div class='vz'>Nada marcado nesse dia.</div>\");" +
      "form.style.display=AGSEL>=isoHj()?'block':'none';}" +
      "(function(){var hs='';for(var hh=6;hh<=21;hh++){['00','30'].forEach(function(mm){hs+='<option>'+('0'+hh).slice(-2)+':'+mm+'</option>';});}document.getElementById('agHora').innerHTML=hs;})();" +
      "document.getElementById('agCal').addEventListener('click',function(e){var d3=e.target.closest('[data-agdia]');if(d3){AGSEL=d3.getAttribute('data-agdia');pintaCal();}});" +
      // salvar horário confirmado no calendário do celular (.ics)
      "var AGTIT=" + jsonApp("Sessão com " + studio.split(" ")[0] + " (TORQUE ON)") + ";" +
      "function agIcsBaixa(d9){" +
      "var p9=d9.split('|');var h9=p9[1]||'08:00';var i9=p9[0].replace(/-/g,'')+'T'+h9.replace(':','')+'00';" +
      "var f9=new Date(p9[0]+'T'+h9+':00');f9.setMinutes(f9.getMinutes()+60);var p2=function(n){return('0'+n).slice(-2);};" +
      "var s9=f9.getFullYear()+p2(f9.getMonth()+1)+p2(f9.getDate())+'T'+p2(f9.getHours())+p2(f9.getMinutes())+'00';" +
      "var ics='BEGIN:VCALENDAR\\r\\nVERSION:2.0\\r\\nPRODID:-//TORQUE ON//App//PT-BR\\r\\nBEGIN:VEVENT\\r\\nUID:'+Date.now()+'@torqueon.com.br\\r\\nDTSTART:'+i9+'\\r\\nDTEND:'+s9+'\\r\\nSUMMARY:'+AGTIT+'\\r\\nEND:VEVENT\\r\\nEND:VCALENDAR';" +
      "var b9=new Blob([ics],{type:'text/calendar'});var a9=document.createElement('a');a9.href=URL.createObjectURL(b9);a9.download='treino.ics';document.body.appendChild(a9);a9.click();setTimeout(function(){URL.revokeObjectURL(a9.href);a9.remove();},800);}" +
      "document.getElementById('agDia').addEventListener('click',function(e){var t9=e.target.closest&&e.target.closest('[data-agics]');if(t9)agIcsBaixa(t9.getAttribute('data-agics'));});" +
      // os botões do cabeçalho: salvar .ics e "preciso remarcar" (abre o chat já escrito)
      "document.getElementById('agTopo').addEventListener('click',function(e){" +
      "var t9=e.target.closest&&e.target.closest('[data-agics]');if(t9){agIcsBaixa(t9.getAttribute('data-agics'));return;}" +
      "var r9=e.target.closest&&e.target.closest('[data-agrem]');if(!r9)return;var p9=r9.getAttribute('data-agrem').split('|');" +
      "if(window.__trocaSec)window.__trocaSec('chat');var ct9=document.getElementById('chTexto');" +
      "if(ct9){ct9.value='Preciso remarcar a sessão de '+p9[0].slice(8,10)+'/'+p9[0].slice(5,7)+(p9[1]?' às '+p9[1]:'')+' — pode ser?';ct9.focus();}});" +
      "document.getElementById('agPede').addEventListener('click',function(){if(!AGSEL)return;var hr=document.getElementById('agHora').value;var ob=document.getElementById('agObs').value.trim();" +
      "if(NUVEM){var btn=this;btn.disabled=true;rpcApp('app_agenda_pede',{t:TOKEN,p_dia:AGSEL,p_hora:hr,p_obs:ob}).then(function(r){btn.disabled=false;" +
      "if(r&&r.ok){var l=L('ptagenda',[]);l.push({dia:AGSEL,hora:hr,status:'pedido',obs:ob});Sv('ptagenda',l);document.getElementById('agObs').value='';pintaCal();" +
      "alert('Pedido enviado! '+PRIMEIRO+', seu personal confirma em breve.');}else{alert((r&&r.erro==='muitos_pedidos')?'Você já tem muitos pedidos aguardando — espere a confirmação.':'Não deu pra enviar agora — tenta de novo.');}});}" +
      "else{var pd=AGSEL.split('-');window.open('https://wa.me/'+(ZAPP?'55'+ZAPP:'')+'?text='+encodeURIComponent('Oi! Queria marcar horário dia '+pd[2]+'/'+pd[1]+' às '+hr+(ob?' — '+ob:'')),'_blank');}});" +
      // o atalho de baixo: seleciona HOJE no calendário e abre o formulário
      "var apj=document.getElementById('agPedeJa');if(apj)apj.addEventListener('click',function(){" +
      "if(!AGSEL){var c9=document.querySelector(\"[data-agdia='\"+isoHj()+\"']\");if(c9)c9.click();}" +
      "var f9=document.getElementById('agForm');if(f9&&f9.style.display!=='none')f9.scrollIntoView({behavior:'smooth',block:'center'});});" +
      "carregaAgenda();" +
      // conquistas: medalhas + gráfico de treinos por semana
      "function seqMax(f){var ks=Object.keys(f).sort();var max2=0,seq=0,ant=null;ks.forEach(function(k){" +
      "if(ant){var dif=(new Date(k)-new Date(ant))/864e5;seq=dif===1?seq+1:1;}else seq=1;if(seq>max2)max2=seq;ant=k;});return max2;}" +
      // Ver todas × Mostrar menos: o estado mora FORA do pintaConquistas pra
      // sobreviver às repinturas; o clique repinta a grade
      // desenha a medalha (o mesmo traço serve a grade e a tela cheia)
      "function icq(p){return \"<svg width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'>\"+p+'</svg>';}" +
      "var cqAberto=false;var CQATUAL=[];" +
      "document.addEventListener('click',function(e5){if(!e5.target||e5.target.id!=='cqVerMais')return;" +
      "cqAberto=!cqAberto;try{pintaConquistas();}catch(e6){}" +
      "if(!cqAberto){var g6=document.getElementById('cqGrid');if(g6)g6.scrollIntoView({block:'start'});}});" +
      /* ---------- conquista em tela cheia (estilo Nike Run) ----------
       * Tocou numa medalha: abre por cima, a medalha gigante gira com o
       * movimento do celular e o brilho anda junto. O <div> é criado na hora
       * (fora do classificador de seções, que já rodou) e vive no <body>. */
      "var cqGiro=null;" + // {handler} do giroscópio ligado agora
      "function cqFecha(){var f=document.getElementById('cqFull');if(f)f.classList.remove('on');" +
      "if(cqGiro){window.removeEventListener('deviceorientation',cqGiro);cqGiro=null;}" +
      "document.body.style.overflow='';}" +
      "window.__cqFecha=cqFecha;" +
      "function cqAbre(i){var b=CQATUAL[i];if(!b)return;var tem=b.v>=b.m;" +
      "var f=document.getElementById('cqFull');" +
      "if(!f){f=document.createElement('div');f.id='cqFull';document.body.appendChild(f);}" +
      "var falta=Math.max(0,b.m-b.v);" +
      "var comoFaz=tem?'':(falta>0?(falta===1?'Falta <b>1</b> pra destravar':'Faltam <b>'+falta+'</b> pra destravar'):'Ainda não destravou');" +
      "f.innerHTML=\"<div id='cqPalco'><div id='cqMed'\"+(tem?'':\" class='travada'\")+\">\"+" +
      "\"<span class='aro'></span><span class='disco'></span>\"+" +
      "\"<span class='ico'>\"+(tem?(b.emo?\"<span style='font-size:74px;line-height:1;'>\"+b.p+'</span>':icq(b.p))" +
      ":icq(\"<rect x='5' y='11' width='14' height='10' rx='2'/><path d='M8 11V8a4 4 0 0 1 8 0v3'/>\"))+'</span>'+" +
      "\"<span class='brilho'></span></div></div>\"+" +
      "\"<div class='cqsel'>\"+(tem?'Conquistada':'Bloqueada')+'</div>'+" +
      "'<h3>'+esc2(b.n)+'</h3>'+" +
      "(tem?(b.d?\"<div class='cqsub'>Você conquistou em \"+b.d.slice(8,10)+'/'+b.d.slice(5,7)+'/'+b.d.slice(0,4)+'</div>':\"<div class='cqsub'>Está no seu mural — orgulho define.</div>\")" +
      ":\"<div class='cqsub'>\"+comoFaz+\"</div><div class='cqbar'><b style='width:\"+Math.round(100*Math.min(1,b.v/(b.m||1)))+\"%'></b></div>\"+" +
      "\"<div class='cqsub' style='margin-top:8px;font-weight:800;color:#8a8695;'>\"+Math.min(b.v,b.m)+' de '+b.m+'</div>')+" +
      "\"<div class='cqpe'>\"+(tem?\"<button type='button' class='prin' id='cqShare'>Compartilhar</button>\":'')+" +
      "\"<button type='button' class='sec' id='cqVolta'>Fechar</button></div>\";" +
      "f.classList.add('on');document.body.style.overflow='hidden';" +
      "document.getElementById('cqVolta').addEventListener('click',cqFecha);" +
      "var sh=document.getElementById('cqShare');if(sh)sh.addEventListener('click',function(){cqArte(b);});" +
      "cqLigaGiro(document.getElementById('cqMed'));" +
      "if(navigator.vibrate)navigator.vibrate(12);}" +
      // giroscópio (iOS pede permissão DENTRO do toque) com o dedo de reserva
      "function cqLigaGiro(med){if(!med)return;var ax=0,ay=0;" +
      "function poe(rx,ry){med.style.transform='rotateX('+rx.toFixed(1)+'deg) rotateY('+ry.toFixed(1)+'deg)';" +
      "med.style.setProperty('--bx',(50-ry*1.6).toFixed(0)+'%');med.style.setProperty('--by',(38+rx*1.6).toFixed(0)+'%');}" +
      "poe(0,0);" +
      "function liga(){if(cqGiro)return;cqGiro=function(ev){var be=ev.beta,ga=ev.gamma;if(be==null||ga==null)return;" +
      "ax=Math.max(-22,Math.min(22,(be-42)*0.55));ay=Math.max(-22,Math.min(22,ga*0.55));poe(-ax,ay);};" +
      "window.addEventListener('deviceorientation',cqGiro);}" +
      "try{var DOE=window.DeviceOrientationEvent;" +
      "if(DOE&&typeof DOE.requestPermission==='function')DOE.requestPermission().then(function(r){if(r==='granted')liga();}).catch(function(){});" +
      "else if(DOE)liga();}catch(e9){}" +
      // arrastar com o dedo: funciona no computador e quando o giro não vem
      "var arr=false,x0=0,y0=0,rx0=0,ry0=0;" +
      "med.addEventListener('pointerdown',function(ev){arr=true;x0=ev.clientX;y0=ev.clientY;rx0=-ax;ry0=ay;med.setPointerCapture&&med.setPointerCapture(ev.pointerId);});" +
      "med.addEventListener('pointermove',function(ev){if(!arr)return;" +
      "var rx=Math.max(-26,Math.min(26,rx0-(ev.clientY-y0)*0.28));var ry=Math.max(-26,Math.min(26,ry0+(ev.clientX-x0)*0.28));poe(rx,ry);});" +
      "['pointerup','pointercancel','pointerleave'].forEach(function(t9){med.addEventListener(t9,function(){arr=false;});});}" +
      // arte da conquista pro Stories, pela MESMA prévia do resto do app
      "function cqArte(b){var c=document.createElement('canvas');c.width=1080;c.height=1350;var g=c.getContext('2d');" +
      "var gr=g.createLinearGradient(0,0,0,1350);gr.addColorStop(0,CV('cor'));gr.addColorStop(1,CV('cor-esc'));g.fillStyle=gr;g.fillRect(0,0,1080,1350);" +
      "g.textAlign='center';" +
      "g.fillStyle='rgba(255,255,255,.75)';g.font='800 34px system-ui,sans-serif';g.fillText(STUDIO.toUpperCase().slice(0,28),540,140);" +
      "g.fillStyle='rgba(255,255,255,.14)';g.beginPath();g.arc(540,600,250,0,7);g.fill();" +
      "g.strokeStyle='rgba(255,255,255,.55)';g.lineWidth=8;g.beginPath();g.arc(540,600,250,0,7);g.stroke();" +
      "g.fillStyle='rgba(255,255,255,.9)';g.font='800 30px system-ui,sans-serif';g.fillText('CONQUISTA DESBLOQUEADA',540,980);" +
      "g.fillStyle='#fff';g.font='900 74px system-ui,sans-serif';" +
      "var nm=String(b.n);if(nm.length>18){var pr=nm.split(' ');var meio=Math.ceil(pr.length/2);" +
      "g.fillText(pr.slice(0,meio).join(' '),540,1080);g.fillText(pr.slice(meio).join(' '),540,1160);}" +
      "else g.fillText(nm,540,1110);" +
      "g.fillStyle='rgba(255,255,255,.8)';g.font='600 36px system-ui,sans-serif';" +
      "g.fillText(b.d?b.d.slice(8,10)+'/'+b.d.slice(5,7)+'/'+b.d.slice(0,4):PRIMEIRO,540,1250);" +
      // a medalha (SVG) entra por cima como imagem; sem ela a arte sai igual
      "var sv=\"<svg xmlns='http://www.w3.org/2000/svg' width='260' height='260' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='1.3' stroke-linecap='round' stroke-linejoin='round'>\"+b.p+'</svg>';" +
      "var im=new Image();im.onload=function(){g.drawImage(im,540-130,600-130,260,260);arteMostra(c,'conquista.png');};" +
      "im.onerror=function(){arteMostra(c,'conquista.png');};" +
      "im.src='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(sv)));}" +
      // clique num card da grade → abre a tela cheia
      "document.addEventListener('click',function(e8){var b8=e8.target.closest&&e8.target.closest('[data-cqi]');" +
      "if(b8)cqAbre(+b8.getAttribute('data-cqi'));});" +
      "window.__cqAbre=cqAbre;" +
      "function pintaConquistas(){var f=L('ptfeitos',{});var total=Object.keys(f).length;var seq=seqMax(f);" +
      "var pz=Object.keys(L('ptpeso',{})).length;var dc=L('ptdc',{});var recs=Object.keys(dc).length;" +
      "var semMeta=0;var porSem={};Object.keys(f).forEach(function(k){var w=semDe(k);porSem[w]=(porSem[w]||0)+1;});" +
      "Object.keys(porSem).forEach(function(w){if(porSem[w]>=META)semMeta++;});" +
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
      // tela 31: cards lisos sem contorno — conquistada tem o ícone COLORIDO
      // (a cor varia por medalha), bloqueada vira cadeado cinza com o progresso
      // pequenininho; o estado vai no data-cqok (é o que os testes leem)
      "var CQCOR=['var(--corc)','#fb923c','#4ade80','#fbbf24'];" +
      /* Data da conquista: pro tipo "N treinos" dá pra saber o dia exato — é o
       * N-ésimo treino registrado. Nas outras (sequência, pace, peso) não há
       * como cravar sem inventar, então a tela cheia simplesmente não mostra
       * data — melhor sem do que com data errada. */
      "function cqData(nome,alvo){if(!/treino/i.test(nome)||/seguidos|meta/i.test(nome))return '';" +
      "var ks=Object.keys(L('ptfeitos',{})).sort();return ks.length>=alvo?ks[alvo-1]:'';}" +
      "document.getElementById('cqGrid').innerHTML=BADGES.map(function(b,i5){var tem=b[2]>=b[3];var cor5=CQCOR[i5%CQCOR.length];" +
      "return \"<button type='button' data-cqok='\"+(tem?1:0)+\"' data-cqi='\"+i5+\"' style='display:block;width:100%;font-family:inherit;color:#fff;cursor:pointer;text-align:center;padding:16px 6px 14px;border-radius:20px;background:var(--bg2);border:1px solid rgba(255,255,255,.04);\"+(tem?'':'opacity:.6;')+\"'>\"+" +
      "(tem?(b[4]?\"<div style='font-size:24px;line-height:1.3;'>\"+b[0]+\"</div>\":\"<div style='line-height:0;padding:4px 0;color:\"+cor5+\";'>\"+icq(b[0])+'</div>')" +
      ":\"<div style='line-height:0;padding:4px 0;color:#57525f;'>\"+icq(\"<rect x='5' y='11' width='14' height='10' rx='2'/><path d='M8 11V8a4 4 0 0 1 8 0v3'/>\")+'</div>')+" +
      "\"<div style='font-size:12px;font-weight:800;margin-top:8px;line-height:1.25;\"+(tem?'':'color:#6e6a78;')+\"'>\"+b[1]+'</div>'+" +
      "(tem?'':\"<div style='font-size:9.5px;color:#57525f;margin-top:2px;'>\"+Math.min(b[2],b[3])+'/'+b[3]+'</div>')+'</button>';}).join('');" +
      // a tela cheia lê daqui (o clique só manda o índice)
      "CQATUAL=BADGES.map(function(b,i5){return {p:b[0],n:b[1],v:b[2],m:b[3],emo:b[4]||'',cor:CQCOR[i5%CQCOR.length],d:(b[2]>=b[3]?cqData(b[1],b[3]):'')};});" +
      // retrátil: com mais de 6 medalhas, encolhe e o botão diz quantas tem
      "var g5=document.getElementById('cqGrid'),vm5=document.getElementById('cqVerMais');" +
      "if(g5&&vm5){var enc5=!cqAberto&&BADGES.length>6;g5.classList.toggle('enc',enc5);" +
      "vm5.style.display=BADGES.length>6?'':'none';" +
      "vm5.textContent=cqAberto?'Mostrar menos':'Ver todas as '+BADGES.length+' conquistas';}" +
      // tela 31: MINHAS SEMANAS — número verde quando bateu a meta da semana
      // (o aria-label mantém o nome antigo 'Treinos por semana' pros leitores)
      "var bars='';var hj5=new Date();var seg5=new Date(hj5);seg5.setDate(seg5.getDate()-((seg5.getDay()+6)%7));var max5=1;var sems=[];" +
      "for(var w2=5;w2>=0;w2--){var d5=new Date(seg5);d5.setDate(d5.getDate()-7*w2);var n5=porSem[isoLoc(d5)]||0;if(n5>max5)max5=n5;sems.push({d:d5,n:n5});}" +
      "var cq9=document.getElementById('cqGraf');if(cq9)cq9.style.cssText='margin-top:14px;background:var(--bg2);border:1px solid rgba(255,255,255,.04);border-radius:20px;padding:14px 16px;';" +
      "bars=\"<div style='display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;'><span class='wpk' style='margin:0;'>Minhas semanas</span><span style='font-size:12px;color:#8a8695;'>meta de \"+META+\" por semana</span></div>\"+" +
      "\"<div style='display:flex;gap:8px;align-items:flex-end;height:100px;' aria-label='Treinos por semana'>\"+sems.map(function(s5){" +
      "var hh5=Math.round(66*s5.n/max5);var bateu=s5.n>=META;" +
      "return \"<div style='flex:1;text-align:center;'><div style='font-size:12px;font-weight:800;color:\"+(bateu?'#4ade80':'#8a8695')+\";'>\"+s5.n+\"</div><div style='height:\"+(66-hh5)+\"px;'></div><div style='height:\"+Math.max(hh5,4)+\"px;background:\"+(bateu?'linear-gradient(180deg,var(--corc),var(--cor))':'var(--bg7)')+\";border-radius:8px 8px 2px 2px;'></div><div style='font-size:9.5px;color:#6e6a78;margin-top:4px;'>\"+('0'+s5.d.getDate()).slice(-2)+'/'+('0'+(s5.d.getMonth()+1)).slice(-2)+'</div></div>';}).join('')+'</div>';" +
      "document.getElementById('cqGraf').innerHTML=bars;pintaMapaAno();}" +
      // mapa de constância: 52 semanas, cada quadradinho é um dia (estilo GitHub/Strava)
      // tela 31: o mapa do ano virou um card com os meses embaixo
      /* Mapa de calor do MÊS (v599). A fita de 52 semanas ficava com 364
       * quadradinhos de 4 px num celular de 480 — bonita de longe, ilegível
       * de perto. Agora é o mês em calendário, com ‹ › pra andar pra trás, e
       * a cor conta QUANTO foi treinado naquele dia: as séries marcadas
       * (ptsets_<dia>) em três degraus; dia que só foi marcado como treinado,
       * sem série anotada (uma corrida, por exemplo), fica no degrau leve. */
      "var MESN=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];" +
      "var mapMes=0;" + // 0 = mês atual, 1 = o anterior, e assim por diante
      "function forcaDoDia(iso,f){if(!f[iso])return 0;var st=L('ptsets_'+iso,null);" +
      "if(!st)return 1;var n=0;for(var k in st)if(Object.prototype.hasOwnProperty.call(st,k))n+=+st[k]||0;" +
      "return n>=20?3:(n>=10?2:1);}" +
      "function treinosDoMes(f,y,m){var n=0;for(var k in f){if(!Object.prototype.hasOwnProperty.call(f,k))continue;" +
      "if(+k.slice(0,4)===y&&+k.slice(5,7)===m+1)n++;}return n;}" +
      /* A FITA DO ANO voltou (pedido do Raphael): o calendario do mes ficou,
       * mas quem quiser ver o ano inteiro toca em "Ano". A fita agora rola de
       * lado com quadradinho de 13px em vez de 4px espremidos na largura da
       * tela, entao da' pra enxergar dia por dia. A escolha fica guardada em
       * ptmapv, pra nao ter que trocar toda vez que abre. */
      "var mapVis=L('ptmapv','mes')==='ano'?'ano':'mes';" +
      "function mapCor(fo,fut){return fo===3?'var(--cor)':(fo===2?'rgba(var(--cor-rgb),.62)':(fo===1?'rgba(var(--cor-rgb),.3)':(fut?'transparent':'var(--bg8)')));}" +
      "function mapPil(id,rot,on){return \"<button type='button' id='\"+id+\"' style='padding:0 11px;height:30px;border-radius:10px;font-family:inherit;font-size:11.5px;font-weight:800;cursor:pointer;border:1px solid \"+(on?'transparent':'var(--bg11)')+\";background:\"+(on?'var(--cor)':'var(--bg4)')+\";color:\"+(on?'#fff':'#a9a4b5')+\";'>\"+rot+'</button>';}" +
      "function mapSeta(id,rot,lab,off){return \"<button type='button' id='\"+id+\"' aria-label='\"+lab+\"'\"+(off?\" disabled style='opacity:.35;\":\" style='\")+\"width:30px;height:30px;border-radius:10px;background:var(--bg4);border:1px solid var(--bg11);color:#a9a4b5;font-family:inherit;font-size:15px;cursor:pointer;'>\"+rot+'</button>';}" +
      // 52 semanas em colunas de 7 dias, a mais nova na direita (estilo GitHub)
      "function mapaAnoHtml(f){var hoje=new Date();var fim=new Date(hoje);fim.setDate(fim.getDate()+(6-((fim.getDay()+6)%7)));" +
      "var MES3B=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];" +
      "var cols='',labs='',tot=0,ultM=-1;" +
      "for(var w=51;w>=0;w--){var dSeg=new Date(fim);dSeg.setDate(dSeg.getDate()-w*7-6);" +
      "var mrc=dSeg.getMonth()!==ultM;ultM=dSeg.getMonth();" +
      "labs+=\"<div style='width:13px;flex:none;white-space:nowrap;font-size:9.5px;font-weight:800;color:#6e6a78;'>\"+(mrc?MES3B[dSeg.getMonth()]:'')+'</div>';" +
      "cols+=\"<div style='width:13px;flex:none;display:flex;flex-direction:column;gap:3px;'>\";" +
      "for(var d=0;d<7;d++){var dt=new Date(fim);dt.setDate(dt.getDate()-w*7-(6-d));var iso=isoLoc(dt);" +
      "if(f[iso])tot++;var fut=dt>hoje&&iso!==isoHj();var fo=forcaDoDia(iso,f);" +
      "cols+=\"<div title='\"+iso+\"' style='width:13px;height:13px;border-radius:4px;background:\"+mapCor(fo,fut)+\";\"+(fut?'border:1px dashed rgba(255,255,255,.13);':'')+(iso===isoHj()?'box-shadow:0 0 0 2px var(--corc);':'')+\"'></div>\";}" +
      "cols+='</div>';}" +
      /* direction:rtl no rolador (e ltr de volta por dentro) faz a fita NASCER
       * encostada na direita, ou seja, em hoje. Ajustar o scrollLeft na mao nao
       * servia: quando o app abre, a aba Conquistas ainda esta escondida, a
       * largura e' zero e o ajuste vira nada — quem deixou o app na aba Ano
       * voltava e via janeiro do ano passado. */
      "return {tot:tot,html:\"<div id='mapaAnoRol' style='direction:rtl;overflow-x:auto;overflow-y:hidden;margin-top:12px;padding:3px 3px 0;-webkit-overflow-scrolling:touch;'>\"+" +
      "\"<div style='direction:ltr;display:flex;gap:3px;width:max-content;'>\"+cols+'</div>'+" +
      "\"<div style='direction:ltr;display:flex;gap:3px;width:max-content;margin-top:5px;'>\"+labs+'</div></div>'};}" +
      "function pintaMapaAno(){var el=document.getElementById('mapaAno');if(!el)return;var f=L('ptfeitos',{});" +
      "el.style.cssText='margin-top:14px;background:var(--bg2);border:1px solid rgba(255,255,255,.04);border-radius:20px;padding:14px 16px;';" +
      "var hoje=new Date();var ano=mapVis==='ano';var corpo='',tit='',sub='';" +
      "if(ano){var ra=mapaAnoHtml(f);corpo=ra.html;" +
      "tit=ra.tot+(ra.tot===1?' treino':' treinos')+' em 12 meses';" +
      "sub=ra.tot?'cada quadradinho \\u00e9 um dia \\u00b7 arraste pro lado':'nenhum treino marcado ainda';}" +
      "else{var base=new Date(hoje.getFullYear(),hoje.getMonth()-mapMes,1);" +
      "var y=base.getFullYear(),m=base.getMonth();" +
      "var nMes=treinosDoMes(f,y,m);" +
      // recorde: o melhor mês ANTES deste, pra não competir consigo mesmo
      "var rec=0,mesesV={};for(var k9 in f){if(!Object.prototype.hasOwnProperty.call(f,k9))continue;" +
      "var ch=k9.slice(0,7);if(ch>=(y+'-'+('0'+(m+1)).slice(-2)))continue;mesesV[ch]=(mesesV[ch]||0)+1;}" +
      "for(var c9 in mesesV)if(mesesV[c9]>rec)rec=mesesV[c9];" +
      "tit=nMes+(nMes===1?' treino':' treinos')+' em '+MESN[m];" +
      "sub=nMes===0?'nenhum treino marcado ainda':(rec&&nMes>rec?('seu melhor m\\u00eas at\\u00e9 agora \\u00b7 o recorde era '+rec):(rec?('seu recorde \\u00e9 '+rec+' num m\\u00eas'):'primeiro m\\u00eas de treinos'));" +
      // a semana começa na segunda, igual aos chips do Início
      "var pri=new Date(y,m,1);var vazias=(pri.getDay()+6)%7;var ult=new Date(y,m+1,0).getDate();" +
      "var cels='';for(var v=0;v<vazias;v++)cels+=\"<div></div>\";" +
      "for(var d=1;d<=ult;d++){var dt=new Date(y,m,d);var iso=isoLoc(dt);" +
      "var fut=dt>hoje&&iso!==isoHj();var hj=iso===isoHj();var fo=forcaDoDia(iso,f);" +
      "cels+=\"<div style='aspect-ratio:1;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:11.5px;font-weight:\"+(fo?'800':'600')+\";\"+" +
      "\"background:\"+mapCor(fo,fut)+\";color:\"+(fo?'#fff':(fut?'#4b4856':'#8a8695'))+\";\"+" +
      "(fut?'border:1px dashed rgba(255,255,255,.13);':'')+(hj?'box-shadow:0 0 0 2px var(--corc);':'')+\"'>\"+d+'</div>';}" +
      "var DSEM3=['S','T','Q','Q','S','S','D'];" +
      "corpo=\"<div style='display:grid;grid-template-columns:repeat(7,1fr);gap:5px;margin-top:12px;font-size:10px;font-weight:800;letter-spacing:.06em;color:#6e6a78;text-align:center;'>\"+" +
      "DSEM3.map(function(x9){return '<div>'+x9+'</div>';}).join('')+'</div>'+" +
      "\"<div style='display:grid;grid-template-columns:repeat(7,1fr);gap:5px;margin-top:5px;'>\"+cels+'</div>';}" +
      "el.innerHTML=\"<div style='display:flex;align-items:flex-start;gap:8px;'>\"+" +
      "\"<span style='flex:1;min-width:0;'><b style='display:block;font-size:17px;font-weight:900;letter-spacing:-.02em;'>\"+tit+'</b>'+" +
      "\"<span style='display:block;font-size:12px;color:#8a8695;margin-top:2px;'>\"+sub+'</span></span>'+" +
      "\"<span style='flex:none;display:flex;gap:5px;align-items:center;'>\"+" +
      "mapPil('mapVm','M\\u00eas',!ano)+mapPil('mapVa','Ano',ano)+" +
      "(ano?'':(mapSeta('mapAnt','\\u2039','M\\u00eas anterior',false)+mapSeta('mapProx','\\u203a','Pr\\u00f3ximo m\\u00eas',mapMes<=0)))+" +
      "'</span></div>'+corpo+" +
      "\"<div style='display:flex;align-items:center;gap:7px;font-size:10.5px;color:#6e6a78;margin-top:11px;'><span>menos</span>\"+" +
      "[['var(--bg8)'],['rgba(var(--cor-rgb),.3)'],['rgba(var(--cor-rgb),.62)'],['var(--cor)']].map(function(c8){" +
      "return \"<i style='width:13px;height:13px;border-radius:4px;background:\"+c8[0]+\";'></i>\";}).join('')+'<span>mais</span>'+" +
      "\"<span style='margin-left:auto;'>quanto mais forte a cor, mais treino</span></div>\";" +
      "function mapVai(v){if(mapVis===v)return;mapVis=v;Sv('ptmapv',v);pintaMapaAno();}" +
      "var bm=document.getElementById('mapVm');if(bm)bm.addEventListener('click',function(){mapVai('mes');});" +
      "var by=document.getElementById('mapVa');if(by)by.addEventListener('click',function(){mapVai('ano');});" +
      "var ba=document.getElementById('mapAnt');if(ba)ba.addEventListener('click',function(){mapMes++;pintaMapaAno();});" +
      "var bp=document.getElementById('mapProx');if(bp)bp.addEventListener('click',function(){if(mapMes>0){mapMes--;pintaMapaAno();}});}" +
      "window.__mapaMes={forca:forcaDoDia,mes:function(){return mapMes;},pinta:pintaMapaAno," +
      "vis:function(){return mapVis;},ve:function(v){mapVis=v==='ano'?'ano':'mes';Sv('ptmapv',mapVis);pintaMapaAno();}};" +
      // tela 49: cartões PESO e SEQUÊNCIA embaixo da grade de conquistas
      "function seqAtual(f){var n=0;var d=new Date();for(var k=0;k<400;k++){var iso=isoLoc(d);" +
      "if(f[iso])n++;else if(iso!==isoHj())break;d.setDate(d.getDate()-1);}return n;}" +
      // o cartão de PESO saiu daqui (pedido do Raphael) — o peso mora na aba
      // Corpo; fica só a SEQUÊNCIA, na largura toda
      "function pintaCqTiles(){var el=document.getElementById('cqTiles');if(!el)return;" +
      "var f=L('ptfeitos',{});var sq=seqAtual(f);var rec=seqMax(f);" +
      "function cqTile(rot,val,un9,sub,cor){return \"<div style='background:var(--bg2);border:1px solid rgba(255,255,255,.04);border-radius:18px;padding:14px 16px;'><div class='wpk' style='margin:0 0 4px;'>\"+rot+'</div>'+" +
      "\"<b style='font-size:24px;font-weight:900;'>\"+val+(un9?\"<small style='font-size:12px;font-weight:800;'> \"+un9+'</small>':'')+'</b>'+" +
      "(sub?\"<div style='font-size:12px;font-weight:800;margin-top:2px;color:\"+(cor||'#8a8695')+\";'>\"+sub+'</div>':'')+'</div>';}" +
      // treinos do mês veio do Início; a comparação é com o MESMO pedaço do mês
      // passado (até o mesmo dia), senão "-6 que em julho" no dia 20 desanima
      "var ag9=new Date();var mesK9=ag9.getFullYear()+'-'+String(ag9.getMonth()+1).padStart(2,'0');" +
      "var noMes9=Object.keys(f).filter(function(k){return k.slice(0,7)===mesK9;}).length;" +
      "var MES39=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];" +
      "var dAnt9=new Date(ag9.getFullYear(),ag9.getMonth()-1,1);" +
      "var antK9=dAnt9.getFullYear()+'-'+String(dAnt9.getMonth()+1).padStart(2,'0');var diaHj9=ag9.getDate();" +
      "var noAnt9=Object.keys(f).filter(function(k){return k.slice(0,7)===antK9&&+k.slice(8,10)<=diaHj9;}).length;" +
      "var tot9=Object.keys(f).length;var s29,c29;" +
      "if(noAnt9){var dif9=noMes9-noAnt9;var mn9=MES39[dAnt9.getMonth()];" +
      "s29=dif9?Math.abs(dif9)+(dif9>0?' a mais':' a menos')+' que em '+mn9+' até aqui':'igual a '+mn9+' até aqui';" +
      "c29=dif9>0?'#4ade80':dif9<0?'#f87171':'#8a8695';}" +
      "else{s29=tot9>noMes9?tot9+' no total':'seu primeiro mês';}" +
      "el.innerHTML=cqTile('Sequência',sq,sq===1?'dia':'dias',rec?'recorde de '+rec+(rec===1?' dia':' dias'):'','#fbbf24')+" +
      "cqTile('Treinos no mês',noMes9,'',s29,c29)+" +
      "(function(){var sw9=streakSem(f);" +
      "return \"<div style='grid-column:1/-1;background:var(--bg2);border:1px solid rgba(255,255,255,.04);border-radius:18px;padding:14px 16px;'>\"+" +
      "\"<div class='wpk' style='margin:0 0 4px;'>Semanas batendo a meta</div>\"+" +
      "\"<b style='font-size:24px;font-weight:900;'>\"+(sw9||'\\u2014')+(sw9?\"<small style='font-size:12px;font-weight:800;'> \"+(sw9===1?'semana':'semanas')+'</small>':'')+'</b>'+" +
      "\"<div style='font-size:12px;font-weight:800;margin-top:2px;color:\"+(sw9?'#fb923c':'#8a8695')+\";'>\"+" +
      "(sw9?'seguidas \\u2014 n\\u00e3o deixa apagar!':'bata a meta desta semana pra acender')+'</div></div>';})();}" +
      "pintaCqTiles();" +
      /* O "Ranking da turma" saiu daqui (pedido do Raphael, v607): ele repetia
       * o Ranking da semana que a Comunidade ja' mostra, e no meio das
       * Conquistas — que sao do aluno consigo mesmo — a comparacao com os
       * colegas ficava fora de lugar. A RPC app_desafio_ranking continua viva:
       * quem usa e' a Comunidade (#fdRank) e o placar do Desafio. */
      "pintaConquistas();document.getElementById('btnFeito').addEventListener('click',function(){setTimeout(function(){pintaConquistas();pintaCqTiles();},150);});" +
      // card de conquista pro Stories (canvas 1080×1080 com a marca do studio)
      "var STUDIO=" + jsonApp(studio) + ";" +
      /* R4 (telas 26-30): a arte do post por cima da FOTO que o aluno tira na
       * hora — badge do tipo, data, título gigante, números do dia e a marca do
       * studio. Sem foto, entra o gradiente da cor. A foto nunca sai do celular:
       * tudo é desenhado aqui e vai direto pra folha de compartilhar. */
      "function artePost(foto,op,soCanvas){op=op||{};var c=document.createElement('canvas');c.width=1080;c.height=1350;var g=c.getContext('2d');" +
      "if(foto){var rz=Math.max(1080/(foto.width||1),1350/(foto.height||1));var w9=(foto.width||1)*rz,h9=(foto.height||1)*rz;" +
      "g.drawImage(foto,(1080-w9)/2,(1350-h9)/2,w9,h9);" +
      "g.fillStyle='rgba(10,8,14,.26)';g.fillRect(0,0,1080,1350);" +
      "var gv2=g.createLinearGradient(0,700,0,1350);gv2.addColorStop(0,'rgba(10,8,14,0)');gv2.addColorStop(1,'rgba(10,8,14,.92)');g.fillStyle=gv2;g.fillRect(0,700,1080,650);" +
      "var gt2=g.createLinearGradient(0,0,0,240);gt2.addColorStop(0,'rgba(10,8,14,.6)');gt2.addColorStop(1,'rgba(10,8,14,0)');g.fillStyle=gt2;g.fillRect(0,0,1080,240);}" +
      "else{var gr2=g.createLinearGradient(0,0,1080,1350);gr2.addColorStop(0,CV('bg4'));gr2.addColorStop(1,CV('cor-esc'));g.fillStyle=gr2;g.fillRect(0,0,1080,1350);}" +
      "var bg9=String(op.badge||'').toUpperCase();" +
      "if(bg9){g.font='800 34px system-ui,sans-serif';var bw=g.measureText(bg9).width;" +
      "g.strokeStyle='rgba(255,255,255,.85)';g.lineWidth=3;g.beginPath();" +
      "if(g.roundRect)g.roundRect(60,58,bw+64,74,37);else g.rect(60,58,bw+64,74);g.stroke();" +
      "g.fillStyle='#fff';g.textAlign='left';g.fillText(bg9,92,108);}" +
      "var MES3A=['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];var dh9=new Date();" +
      "g.textAlign='right';g.font='800 34px system-ui,sans-serif';g.fillStyle='rgba(255,255,255,.85)';g.fillText(dh9.getDate()+' '+MES3A[dh9.getMonth()],1020,108);" +
      // título com quebra em até 2 linhas
      "g.textAlign='left';g.fillStyle='#fff';g.font='900 88px system-ui,sans-serif';" +
      "var tit9=String(op.titulo||'').toUpperCase();var linhas=[];var atual='';" +
      "tit9.split(' ').forEach(function(w0){var t9=atual?atual+' '+w0:w0;if(g.measureText(t9).width>940&&atual){linhas.push(atual);atual=w0;}else atual=t9;});" +
      "if(atual)linhas.push(atual);linhas=linhas.slice(0,2);" +
      "var yT=1035-(linhas.length-1)*96;linhas.forEach(function(l9,i9){g.fillText(l9,60,yT+i9*96);});" +
      // números do dia (até 3)
      "var x9=60;(op.stats||[]).slice(0,3).forEach(function(s9){" +
      "g.fillStyle='#fff';g.font='800 76px system-ui,sans-serif';var v9=String(s9[0]);var wv=g.measureText(v9).width;g.fillText(v9,x9,1165);" +
      "g.fillStyle='rgba(255,255,255,.7)';g.font='800 30px system-ui,sans-serif';var lb9=String(s9[1]).toUpperCase();var wl=g.measureText(lb9).width;g.fillText(lb9,x9,1212);" +
      "x9+=Math.max(wv,wl)+70;});" +
      // rodapé: marca do studio + o tipo
      "g.font='800 30px system-ui,sans-serif';g.fillStyle='rgba(255,255,255,.75)';g.fillText(STUDIO.toUpperCase().slice(0,32),60,1296);" +
      "g.textAlign='right';g.fillStyle='rgba(255,255,255,.55)';g.fillText(String(op.rodape||'').toUpperCase(),1020,1296);g.textAlign='left';" +
      "if(soCanvas)return c;arteMostra(c,'treino.png');return null;}" +
      /* No iPhone o navigator.share só funciona DENTRO do toque do usuário —
       * chamado depois do carregamento da foto + toBlob, o iOS recusava em
       * silêncio e "nada acontecia". Agora a arte abre numa PRÉVIA (telas
       * 27-30) e o Compartilhar sai do próprio toque, que o iOS aceita. */
      "function arteMostra(c,nome){nome=nome||'treino.png';var old=document.getElementById('artePrev');if(old)old.remove();" +
      "var bl9=null;try{c.toBlob(function(b){bl9=b;},'image/png');}catch(e){}" +
      "var ov=document.createElement('div');ov.id='artePrev';" +
      "ov.style.cssText='position:fixed;inset:0;z-index:80;background:rgba(8,7,12,.94);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;';" +
      "ov.innerHTML=\"<img src='\"+c.toDataURL('image/png')+\"' style='max-width:82%;max-height:60vh;border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.6);' alt='Arte do treino'>\"+" +
      "\"<div style='display:flex;gap:10px;margin-top:18px;width:100%;max-width:340px;'>\"+" +
      "\"<button type='button' id='arteShare' class='btnx' style='flex:1;min-height:54px;font-size:15.5px;'>Compartilhar</button>\"+" +
      "\"<button type='button' id='arteBaixa' class='btnx' style='flex:none;background:var(--bg4);box-shadow:none;color:#d6d2df;min-height:54px;'>Salvar</button></div>\"+" +
      "\"<button type='button' id='arteFecha' style='margin-top:10px;background:none;border:none;color:#a9a4b5;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;padding:10px 20px;'>Fechar</button>\";" +
      "document.body.appendChild(ov);" +
      "document.getElementById('arteFecha').addEventListener('click',function(){ov.remove();});" +
      "document.getElementById('arteBaixa').addEventListener('click',function(){var a2=document.createElement('a');a2.href=c.toDataURL('image/png');a2.download=nome;document.body.appendChild(a2);a2.click();setTimeout(function(){a2.remove();},400);});" +
      "document.getElementById('arteShare').addEventListener('click',function(){" +
      "var fl=bl9?new File([bl9],nome,{type:'image/png'}):null;" +
      "if(fl&&navigator.canShare&&navigator.canShare({files:[fl]})){navigator.share({files:[fl]}).catch(function(){});}" +
      "else document.getElementById('arteBaixa').click();});" +
      "window.__artePrev=ov;}" +
      "window.__artePost=function(op){return artePost(null,op,true);};" +
      // liga um par foto/sem-foto (input de arquivo + botão) na arte do post
      "function ligaArte(idArq,idSem,op){var aq=document.getElementById(idArq);" +
      "if(aq)aq.addEventListener('change',function(){var f9=this.files&&this.files[0];this.value='';if(!f9)return;" +
      "var u9=URL.createObjectURL(f9);var im9=new Image();" +
      "im9.onload=function(){URL.revokeObjectURL(u9);artePost(im9,op);};" +
      "im9.onerror=function(){URL.revokeObjectURL(u9);alert('Não consegui abrir essa foto — tenta outra.');};im9.src=u9;});" +
      "var sm=document.getElementById(idSem);if(sm)sm.addEventListener('click',function(){artePost(null,op);});}" +
      "function arteBtns(idArq,idSem){return \"<div style='display:flex;gap:8px;margin-top:14px;'>\"+" +
      "\"<label class='btnx' style='flex:1;text-align:center;cursor:pointer;'>Compartilhar com foto<input id='\"+idArq+\"' type='file' accept='image/*' style='display:none;'></label>\"+" +
      "\"<button type='button' class='btnx' id='\"+idSem+\"' style='flex:none;background:var(--bg4);box-shadow:none;color:#d6d2df;'>Sem foto</button></div>\"+" +
      "\"<div class='vz' style='font-size:11px;padding:4px 0 0;'>Sua foto com os números do treino por cima — a foto não sai do seu celular.</div>\";}" +
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
      // mesma prévia do fim de treino: o share sai do toque, que o iPhone aceita
      "arteMostra(c,'conquista.png');});" +
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
      "card.style.display='block';document.getElementById('retroTit').textContent='Seu m\\u00eas de '+d.nome;" +
      "var linhas=[['Treinos registrados','<b>'+d.tr+'</b>']];" +
      "if(d.rec)linhas.push(['Maior carga do m\\u00eas','<b>'+String(d.rec.ex).replace(/[<>&]/g,'').slice(0,26)+' \\u2014 '+String(d.rec.kg).replace('.',',')+' kg</b>']);" +

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

      "if(d.nh){g.fillText(d.nh+' h\\u00e1bitos marcados',540,y);}" +
      "g.fillStyle=CV('corc');g.font='700 34px system-ui,sans-serif';g.fillText(PRIMEIRO+' \\u00b7 TORQUE PERSONAL',540,990);" +
      // mesma prévia do fim do treino: o share sai do TOQUE, senão o iPhone recusa calado
      "arteMostra(c,'retro.png');});" +
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
      "var t=e.target.closest('.tmrbtn');if(t){iniciaTmr(+t.dataset.s,t.dataset.rot||'');return;}" +
      // parte 2 do dia: marcar/desmarcar a linha (vale só pro dia de hoje)
      "var pk=e.target.closest('.p2row');if(pk&&e.target.closest('.p2ck')){p2Marca(pk.dataset.p2);return;}});" +
      "function p2Feitos(){var o=L('ptp2',{});return (o&&o.d===isoHj()&&o.f)?o.f:{};}" +
      "function p2Marca(k){var f=p2Feitos();if(f[k])delete f[k];else f[k]=1;Sv('ptp2',{d:isoHj(),f:f});p2Pinta();" +
      "if(navigator.vibrate)navigator.vibrate(8);}" +
      "function p2Pinta(){var f=p2Feitos();document.querySelectorAll('.p2row').forEach(function(r){" +
      "var on=!!f[r.dataset.p2];var ck=r.querySelector('.p2ck');if(ck){ck.textContent=on?'\u2713':'';" +
      "ck.style.background=on?'#60a5fa':'transparent';ck.style.color=on?'#0b1020':'#93c5fd';}" +
      "r.style.opacity=on?'.55':'1';});}" +
      "p2Pinta();window.__p2={marca:p2Marca,feitos:p2Feitos,pinta:p2Pinta};" +
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
      "var WODS=" + jsonApp(wodsApp.map(function (w) {
        return { id: w.id, n: w.nome, t: w.tipo, cap: +w.cap || 0, min: +w.min || 10, rd: +w.rounds || 8, wk: +w.work || 20, rs: +w.rest || 10,
          cp: capaRef(w),
          mv: ((w.movs && w.movs.length) || (w.mov && w.mov.length) || 0),
          // a lista de movimentos vai junto: a tela cheia mostra a volta atual
          ms: (w.movs && w.movs.length ? w.movs.map(function (m) { return { q: String(m.q || ""), n: String(m.n || "") }; })
            : (w.mov || []).map(function (n) { return { q: "", n: String(n) }; })).slice(0, 12) };
      })) + ";" +
      "var wod={tipo:'fortime',run:false,iv:null,t0:0,acum:0,voltas:0,gi:0,laps:[],ultMin:-1,ultFase:'',wodId:null,wodNome:'',ultCd:0};" +
      "function wodCd(resta){if(!wod.run)return;var cd=(resta<=3.05&&resta>0.05)?Math.ceil(resta):0;" +
      "if(cd&&cd!==wod.ultCd){bip(600,110);if(navigator.vibrate)navigator.vibrate(60);}wod.ultCd=cd;}" +
      // último resultado de cada circuito prescrito aparece no card
      "function pintaWodRes(){var wr=L('ptwodres',{});document.querySelectorAll('.wodres').forEach(function(el){" +
      "var lst=wr[el.dataset.wid]||[];if(!lst.length){el.textContent='';return;}var u=lst[lst.length-1];" +
      "el.textContent='Sua última vez: '+u.r;});" +
      // "Seus circuitos": os últimos placares de todos os circuitos (tela 50)
      "var eh8=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');};" +
      "var rowsH=[];Object.keys(wr).forEach(function(k){(Array.isArray(wr[k])?wr[k]:[]).forEach(function(x){if(x&&x.d)rowsH.push(x);});});" +
      "rowsH.sort(function(a,b){return a.d<b.d?1:-1;});" +
      "var hh=document.getElementById('wodHist');if(hh){hh.innerHTML=rowsH.length?" +
      "\"<div class='wpk' style='margin:16px 0 2px;'>Seus circuitos</div>\"+rowsH.slice(0,5).map(function(x,xi){" +
      "var res=x.tp==='fortime'&&x.v!=null?wodFmt(x.v):x.tp==='amrap'&&x.v!=null?(x.ex?x.v+' + '+x.ex:x.v+' voltas'):" +
      "(x.tp==='tabata'||x.tp==='emom')&&x.v!=null?x.v+' na pior série':eh8(String(x.r||'').slice(0,16));" +
      "return \"<div style='display:flex;gap:12px;align-items:center;min-height:46px;font-size:14px;\"+(xi?'border-top:1px solid var(--bg11);':'')+\"'>\"+" +
      "\"<b style='flex:none;width:48px;'>\"+x.d.slice(8,10)+'/'+x.d.slice(5,7)+'</b>'+" +
      "\"<span style='flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#d6d2df;'>\"+eh8(x.n)+'</span>'+" +
      "\"<b style='flex:none;color:#4ade80;'>\"+res+'</b></div>';}).join(''):'';}}" +
      "document.addEventListener('click',function(e){var b=e.target.closest('[data-wodstart]');if(!b)return;" +
      "var w=WODS.find(function(x){return x.id===b.dataset.wodstart;});if(!w||wod.run)return;" +
      "wod.tipo=w.t;wod.voltas=0;wod.gi=0;wod.laps=[];wod.acum=0;wod.ultMin=-1;wod.ultFase='';wod.wodId=w.id;wod.wodNome=w.n;wodChips();wodCfg();" +
      "if(w.t==='fortime')document.getElementById('wodCap').value=w.cap;" +
      "else if(w.t==='tabata'){document.getElementById('wodRounds').value=w.rd;document.getElementById('wodWork').value=w.wk;document.getElementById('wodRest').value=w.rs;}" +
      "else document.getElementById('wodMin').value=w.min;" +
      "document.getElementById('wodTempo').textContent='0:00';document.getElementById('wodFase').textContent=w.n.toUpperCase().slice(0,24)+' — PRONTO?';document.getElementById('wodFimBox').style.display='none';" +
      "var tela=document.getElementById('wodTela');tela.style.borderColor='var(--corc)';setTimeout(function(){tela.style.borderColor='var(--bg11)';},1500);" +
      // o cronômetro mora no bloco manual: abre ele antes de rolar até lá
      "var lv9=document.getElementById('wodLivre');if(lv9)lv9.style.display='block';" +
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
      "fase.textContent='FOR TIME';tmp.textContent=wodFmt(el2);info.textContent=(wod.voltas?pl(wod.voltas,'volta','voltas')+' · ':'')+(cap?'limite '+wodFmt(cap):'sem limite');" +
      "if(cap)wodCd(cap-el2);if(cap&&el2>=cap)wodFim('TEMPO! '+wodFmt(cap)+(wod.voltas?' · '+pl(wod.voltas,'volta','voltas'):''));return;}" +
      "if(wod.tipo==='amrap'){var tot=60*(parseInt(document.getElementById('wodMin').value,10)||10);var resta=tot-el2;" +
      "fase.textContent='AMRAP '+Math.round(tot/60)+' MIN';tmp.textContent=wodFmt(resta);info.textContent=pl(wod.voltas,'volta completada','voltas completadas');" +
      "wodCd(resta);if(resta<=0)wodFim(pl(wod.voltas,'volta','voltas')+' em '+wodFmt(tot)+'!',wod.voltas);return;}" +
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
      "function wodTick(){var el2=(Date.now()-wod.t0)/1000;wodPinta(el2);espelhaW();}" +
      /* ---------- tela cheia do circuito (telas 35/36) ----------
       * ESPELHO do cronômetro do card: só lê o estado e aperta os botões de
       * verdade (wodGo/wodVolta/wodTermina) — a lógica do timer não muda. */
      "var wodF=null,wfRisc={},wfUltVoltas=-1;" +
      "function criaWodFull(){if(wodF)return;wodF=document.createElement('div');wodF.id='wodFull';" +
      "wodF.style.cssText='display:none;position:fixed;inset:0;z-index:71;overflow:auto;background:var(--bg0);color:#fff;';" +
      "wodF.innerHTML=\"<div style='max-width:480px;margin:0 auto;min-height:100%;display:flex;flex-direction:column;padding:0 0 calc(20px + env(safe-area-inset-bottom,0px));'>\"+" +
      "\"<div id='wfTopo' style='padding:calc(16px + env(safe-area-inset-top,0px)) 18px 20px;'>\"+" +
      "\"<div style='display:flex;align-items:flex-start;gap:8px;'>\"+" +
      "\"<div style='flex:1;min-width:0;'><div id='wfKick' style='font-size:10.5px;font-weight:800;letter-spacing:.2em;color:var(--corc);text-transform:uppercase;'></div>\"+" +
      "\"<div id='wfNome' style='font-size:17px;font-weight:800;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'></div></div>\"+" +
      "\"<button id='wfPausa' style='flex:none;background:rgba(255,255,255,.12);border:none;border-radius:99px;padding:0 20px;min-height:44px;color:#fff;font-family:inherit;font-size:14px;font-weight:800;cursor:pointer;'>Pausar</button>\"+" +
      "\"<button id='wfMin' aria-label='Voltar pro card do circuito' style='flex:none;width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.12);border:none;color:#fff;font-size:16px;font-family:inherit;cursor:pointer;'>✕</button></div>\"+" +
      "\"<div id='wfFase' style='text-align:center;font-size:12px;font-weight:800;letter-spacing:.26em;text-transform:uppercase;color:#8a8695;margin-top:16px;'></div>\"+" +
      "\"<div id='wfTempo' style='text-align:center;font-size:clamp(78px,28vw,124px);font-weight:900;font-variant-numeric:tabular-nums;line-height:.95;letter-spacing:-.04em;'></div>\"+" +
      "\"<div id='wfSub' style='text-align:center;font-size:13.5px;font-weight:700;color:#cfcbdb;margin-top:8px;min-height:18px;'></div>\"+" +
      "\"<div style='height:6px;background:var(--bg5);border-radius:99px;overflow:hidden;margin-top:16px;'><div id='wfBar' style='height:100%;width:0;background:linear-gradient(90deg,var(--cor),var(--corc));border-radius:99px;'></div></div></div>\"+" +
      "\"<div style='padding:0 18px;flex:1;'>\"+" +
      "\"<div id='wfPlacar' style='display:none;background:var(--bg1);border-radius:20px;padding:14px 16px;'></div>\"+" +
      "\"<div id='wfAgora' style='display:none;background:var(--bg1);border-radius:20px;padding:14px 16px;'></div>\"+" +
      "\"<div id='wfMovs' style='margin-top:14px;'></div></div>\"+" +
      "\"<div style='padding:10px 18px 0;'>\"+" +
      "\"<button id='wfVolta' class='btnx' style='display:none;width:100%;min-height:62px;font-size:19px;'>Fechei a volta</button>\"+" +
      "\"<button id='wfFim' style='display:block;width:100%;min-height:48px;margin-top:8px;background:none;border:none;color:#8a8695;font-family:inherit;font-size:14.5px;font-weight:800;cursor:pointer;'>Terminar agora</button></div></div>\";" +
      "document.body.appendChild(wodF);" +
      "wodF.addEventListener('click',function(e){var b=e.target.closest('button,[data-wfmov]');if(!b)return;" +
      "if(b.id==='wfMin'){wodF.style.display='none';return;}" +
      "if(b.id==='wfPausa'){document.getElementById('wodGo').click();espelhaW();return;}" +
      "if(b.id==='wfVolta'){wod.gi=0;var bv=document.getElementById('wodVolta');if(bv)bv.click();return;}" +
      "if(b.id==='wfFeito'){wfAvanca();return;}" +
      "if(b.id==='wfFim'){var el9=wod.run?(Date.now()-wod.t0)/1000:wod.acum;if(el9<1)return;" +
      "if(wod.tipo==='fortime'){document.getElementById('wodTermina').click();return;}" +
      "if(wod.tipo==='amrap'){wodFim(pl(wod.voltas,'volta','voltas')+' — terminou antes do tempo',wod.voltas);return;}" +
      "wodFim('Circuito encerrado');return;}" +
      "var mv=b.getAttribute&&b.getAttribute('data-wfmov');if(mv==null)return;" +
      "if(wod.tipo==='amrap'||wod.tipo==='fortime'){wod.gi=+mv;espelhaW();return;}" +
      "wfRisc[mv]=!wfRisc[mv];espelhaW();});}" +
      /* Feito ›: anda um movimento. Passou do último, a VOLTA fecha sozinha —
       * pelo mesmo botão de sempre (wodVolta), pra não existirem dois caminhos
       * de contar volta. */
      "function wfAvanca(){var wmA=WODS.find(function(x){return x.id===wod.wodId;})||{};" +
      "var n=(wmA.ms||[]).length;if(!n)return;" +
      "if(navigator.vibrate)navigator.vibrate(35);" +
      "if(wod.gi+1<n){wod.gi++;bip(920,90);espelhaW();return;}" +
      "wod.gi=0;var bv2=document.getElementById('wodVolta');" +
      "if(bv2&&wod.run)bv2.click();else espelhaW();}" +
      "function abreWodFull(){criaWodFull();wfRisc={};wfUltVoltas=wod.voltas;wodF.style.display='block';espelhaW();}" +
      "function fechaWodFull(){if(wodF)wodF.style.display='none';}" +
      "function espelhaW(){if(!wodF||wodF.style.display==='none')return;" +
      "var el2=wod.run?(Date.now()-wod.t0)/1000:wod.acum;" +
      "var wm=WODS.find(function(x){return x.id===wod.wodId;})||{};var ms=wm.ms||[];" +
      "var eh7=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');};" +
      "var pvi7=function(id,d){return parseInt((document.getElementById(id)||{}).value,10)||d;};" +
      "var TIP={fortime:'For Time',amrap:'AMRAP',emom:'EMOM',tabata:'Tabata'};" +
      "document.getElementById('wfNome').textContent=wod.wodNome||('Circuito '+(TIP[wod.tipo]||''));" +
      "var go=document.getElementById('wodGo');document.getElementById('wfPausa').textContent=go.textContent==='Pausar'?'Pausar':'Continuar';" +
      "var topo=document.getElementById('wfTopo'),kick=document.getElementById('wfKick'),fase=document.getElementById('wfFase'),sub=document.getElementById('wfSub');" +
      "var tempo=document.getElementById('wfTempo'),bar=document.getElementById('wfBar'),plc=document.getElementById('wfPlacar'),ago=document.getElementById('wfAgora'),mv9=document.getElementById('wfMovs');" +
      "topo.style.background='none';kick.style.color='var(--corc)';fase.style.color='#8a8695';sub.style.color='#cfcbdb';" +
            // o botão da volta volta ao normal a cada pintura: só o guiado o rebaixa
      "var bvR=document.getElementById('wfVolta');bvR.className='btnx';bvR.textContent='Fechei a volta';" +
      "bvR.style.cssText='display:none;width:100%;min-height:62px;font-size:19px;';" +
      "plc.style.display='none';ago.style.display='none';mv9.innerHTML='';" +
      "if(wod.voltas!==wfUltVoltas){wfRisc={};wfUltVoltas=wod.voltas;}" +
      "function listaMovs(titulo,gd){if(!ms.length)return;" +
      "mv9.innerHTML=\"<div class='wpk'>\"+titulo+'</div>'+ms.map(function(m,i){var r=gd?(i<wod.gi):wfRisc[String(i)];" +
      "var ag=gd&&i===wod.gi;" +
      "return \"<div data-wfmov='\"+i+\"' style='display:flex;gap:14px;align-items:baseline;font-size:17px;padding:9px 0;border-bottom:1px dashed var(--bg11);cursor:pointer;\"+(r?'opacity:.4;text-decoration:line-through;':'')+(ag?'background:rgba(var(--cor-rgb),.14);border-radius:12px;padding-left:10px;padding-right:10px;':'')+\"'>\"+" +
      "(m.q?\"<b style='color:var(--corc);flex:none;min-width:60px;'>\"+eh7(m.q)+'</b>':'')+'<span>'+eh7(m.n)+'</span></div>';}).join('');}" +
      /* Guiado no circuito: um movimento por vez, igual à musculação. Vale
       * pra AMRAP e For Time, que são os tipos em que o aluno anda pela lista;
       * EMOM e Tabata seguem pelo relógio, que é o que define os dois. */
      "function wfGuia(){if(!ms.length)return;var i=Math.min(wod.gi,ms.length-1);var m=ms[i]||{};" +
      "var prox=ms[i+1];ago.style.display='block';" +
      "ago.innerHTML=\"<div class='wpk'>Agora \u00b7 \"+(i+1)+' de '+ms.length+'</div>'+" +
      "\"<div style='display:flex;align-items:baseline;gap:12px;margin-top:2px;'>\"+" +
      "(m.q?\"<b style='flex:none;font-size:38px;font-weight:900;color:var(--corc);letter-spacing:-.03em;'>\"+eh7(m.q)+'</b>':'')+" +
      "\"<b style='flex:1;min-width:0;font-size:21px;font-weight:800;line-height:1.15;'>\"+eh7(m.n)+'</b></div>'+" +
      "\"<div style='font-size:12.5px;color:#8a8695;margin-top:6px;'>\"+(prox?('depois: '+(prox.q?eh7(prox.q)+' ':'')+eh7(prox.n)):'\u00faltimo da volta \u2014 fecha e recome\u00e7a')+'</div>'+" +
      "\"<button id='wfFeito' class='btnx' style='display:block;width:100%;min-height:58px;font-size:18px;margin-top:12px;'>Feito \u203a</button>\";" +
      "var bv9=document.getElementById('wfVolta');" +
      "if(bv9){bv9.className='';bv9.textContent='Fechei a volta inteira';" +
      "bv9.style.cssText='display:block;width:100%;min-height:52px;font-size:15px;font-weight:800;font-family:inherit;cursor:pointer;background:var(--bg4);border:1px solid var(--bg11);color:#a9a4b5;border-radius:99px;';}}" +
      "if(wod.tipo==='amrap'){var tot=60*pvi7('wodMin',wm.min||10);var resta=Math.max(0,tot-el2);" +
      "kick.textContent='AMRAP '+Math.round(tot/60)+' MIN';fase.textContent='Falta';tempo.textContent=wodFmt(resta);sub.textContent='';" +
      "bar.style.width=Math.min(100,Math.round(100*el2/tot))+'%';" +
      "var ant=(L('ptwodres',{})[wod.wodId]||[]).slice(-1)[0];var ritmo='';" +
      "if(ant&&ant.v!=null){var alvo9=ant.v*el2/tot;" +
      "ritmo=\"<div style='text-align:right;min-width:0;'>\"+(wod.voltas>=alvo9?\"<div style='color:#4ade80;font-weight:800;font-size:13.5px;'>no ritmo do recorde</div>\":'')+" +
      "\"<div style='color:#8a8695;font-size:12px;'>em \"+String(ant.d||'').slice(8,10)+'/'+String(ant.d||'').slice(5,7)+' fechou '+ant.v+(ant.ex?' + '+ant.ex:'')+'</div></div>';}" +
      "plc.style.display='block';plc.innerHTML=\"<div style='display:flex;align-items:center;gap:12px;justify-content:space-between;'>\"+" +
      "\"<div><b style='font-size:34px;font-weight:900;'>\"+wod.voltas+\"</b><div style='font-size:9.5px;letter-spacing:.18em;font-weight:800;color:#8a8695;text-transform:uppercase;'>Voltas completas</div></div>\"+ritmo+'</div>';" +
      "document.getElementById('wfVolta').style.display='block';" +
      "if(wod.run||wod.acum>0)wfGuia();listaMovs('Volta '+(wod.voltas+1),true);}" +
      "else if(wod.tipo==='fortime'){var cap=60*pvi7('wodCap',0);" +
      "kick.textContent='FOR TIME'+(cap?' · LIMITE '+Math.round(cap/60)+' MIN':'');fase.textContent='Tempo';tempo.textContent=wodFmt(el2);" +
      "sub.textContent=wod.voltas?pl(wod.voltas,'volta','voltas'):'';bar.style.width=cap?Math.min(100,Math.round(100*el2/cap))+'%':'0';" +
      "document.getElementById('wfVolta').style.display='block';" +
      "if(wod.run||wod.acum>0)wfGuia();listaMovs('O circuito',true);}" +
      "else if(wod.tipo==='emom'){var totE=60*pvi7('wodMin',wm.min||10);var mn=Math.floor(el2/60);var segRes=60-Math.floor(el2%60);" +
      "kick.textContent='EMOM '+Math.round(totE/60)+' MIN';fase.textContent='Minuto '+(mn+1)+' de '+Math.round(totE/60);tempo.textContent=wodFmt(segRes);" +
      "sub.textContent='novo movimento a cada minuto cheio';bar.style.width=Math.min(100,Math.round(100*el2/totE))+'%';" +
      "if(ms.length){ago.style.display='block';var mE=ms[mn%ms.length];" +
      "ago.innerHTML=\"<div class='wpk'>Agora</div><div style='font-size:22px;font-weight:900;'>\"+(mE.q?eh7(mE.q)+' ':'')+eh7(mE.n)+'</div>';}}" +
      "else{var rd=pvi7('wodRounds',wm.rd||8),wk=pvi7('wodWork',wm.wk||20),rs=pvi7('wodRest',wm.rs||10);" +
      "var ciclo=wk+rs;var totT=rd*ciclo;var pos=el2%ciclo;var trab=pos<wk;var rAt=Math.min(rd,Math.floor(el2/ciclo)+1);" +
      "kick.textContent='TABATA · '+rd+' ROUNDS';fase.textContent=trab?'Trabalha':'Descansa';tempo.textContent=wodFmt(trab?wk-pos:ciclo-pos);" +
      "sub.textContent='Round '+rAt+' de '+rd+' · '+wk+'s trabalho / '+rs+'s descanso';" +
      "bar.style.width=Math.min(100,Math.round(100*el2/totT))+'%';" +
      // o fundo muda com a fase (tela 36): trabalho na cor do studio, descanso em azul
      "topo.style.background=trab?'linear-gradient(160deg,var(--cor),var(--cor2))':'linear-gradient(160deg,#0e7490,#155e75)';" +
      "kick.style.color='rgba(255,255,255,.85)';fase.style.color='rgba(255,255,255,.9)';sub.style.color='rgba(255,255,255,.9)';" +
      "if(ms.length){ago.style.display='block';var mT=ms[(rAt-1)%ms.length];" +
      "ago.innerHTML=\"<div class='wpk'>Agora</div><div style='font-size:22px;font-weight:900;'>\"+(mT.q?eh7(mT.q)+' ':'')+eh7(mT.n)+'</div>'+" +
      "\"<div style='font-size:13px;color:#8a8695;margin-top:4px;'>bip e vibração na troca de fase e nos últimos 3 segundos</div>\";}}}" +
      "window.__wodFull=function(){abreWodFull();};" +
      // caixinha verde + "Registrar treino" (o fim de sempre); com op, entra o
      // "Compartilhar com foto" da R4 (tela 28 — post do circuito)
      "function wodMsgFim(msg,op){var fb=document.getElementById('wodFimBox');fb.style.display='block';" +
      "fb.innerHTML=\"<div style='text-align:center;font-weight:800;color:#4ade80;font-size:14.5px;margin-bottom:8px;'>\"+msg+\"</div>\"+" +
      "(!L('ptfeitos',{})[isoHj()]?\"<button class='btnx' id='wodFeito' style='display:block;width:100%;text-align:center;'>Registrar treino de hoje</button>\":'')+" +
      "notaBox('wod')+" +
      "(op?arteBtns('wodShareArq','wodShareSem'):'');" +
      "var wf=document.getElementById('wodFeito');if(wf)wf.addEventListener('click',function(){document.getElementById('btnFeito').click();fb.style.display='none';});" +
      "if(op)ligaArte('wodShareArq','wodShareSem',op);}" +
      "function wodFim(msg,val){clearInterval(wod.iv);wod.run=false;wod.iv=null;soltaTela();fechaWodFull();" +
      "document.getElementById('wodGo').textContent='Iniciar';" +
      "document.getElementById('wodFase').textContent='FIM!';" +
      "if(navigator.vibrate)navigator.vibrate([250,100,250,100,400]);bip(1300,350);confete();" +
      // circuito PRESCRITO ganha a tela de resultado (receita R2, telas 07/08/09);
      // o timer livre continua com a caixinha de sempre
      "if(wod.wodId){wodPlacar(msg,val);return;}" +
      "wodMsgFim(msg);}" +
      /* ---------- R2: placar de circuito por tipo ----------
       * AMRAP: voltas confirmadas + reps da última volta + tempo de cada volta
       * (dos toques no cronômetro) + comparação com a vez anterior.
       * For Time: tempo (toque pra corrigir) + "não terminei" + suas vezes.
       * EMOM/Tabata: reps de cada round + total/pior/média + observação.
       * Salvar grava em ptwodres — o mesmo lugar de antes, com campos a mais
       * (tp/cf/ex/nf/sp/rp/ob) — e o Sv devolve pro painel do personal. */
      "function wodPlacar(msg,val){var wm=WODS.find(function(x){return x.id===wod.wodId;})||{};" +
      "var eh=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');};" +
      "var dd=function(d){return String(d||'').slice(8,10)+'/'+String(d||'').slice(5,7);};" +
      "var tipo=wod.tipo;var pvi=function(id,d){return parseInt((document.getElementById(id)||{}).value,10)||d;};" +
      "var minA=pvi('wodMin',wm.min||10);var wk2=pvi('wodWork',wm.wk||20);var rs2=pvi('wodRest',wm.rs||10);" +
      "var rd=tipo==='tabata'?pvi('wodRounds',wm.rd||8):minA;" +
      "var lst0=(L('ptwodres',{}))[wod.wodId]||[];var ant=lst0.length?lst0[lst0.length-1]:null;" +
      "var st={v:wod.voltas,ex:0,cf:'',reps:[],ob:'',nf:0,t:val==null?null:Math.round(val)};" +
      "if(tipo==='emom'||tipo==='tabata')for(var q=0;q<Math.min(rd,24);q++)st.reps.push(null);" +
      "var laps=wod.laps.slice();var ov=document.createElement('div');ov.id='wodPlacar';document.body.appendChild(ov);" +
      "var cardW=function(rot,html){return \"<div class='wpcard'>\"+(rot?\"<div class='wpk'>\"+rot+'</div>':'')+html+'</div>';};" +
      "var comoFez=function(){return cardW('Como você fez',\"<div style='display:flex;gap:8px;'>\"+[['rx','RX'],['esc','Escalado'],['adp','Adaptado']].map(function(o){" +
      "return \"<button class='wpchip\"+(st.cf===o[0]?' on':'')+\"' data-wpcf='\"+o[0]+\"'>\"+o[1]+'</button>';}).join('')+'</div>');};" +
      "function pr(){var chip='',sub='',corpo='',nota='o seu personal vê o placar no painel';" +
      "var reps=st.reps.filter(function(x){return x!=null;});var tot=reps.reduce(function(a,b){return a+b;},0);" +
      "var pior=reps.length?Math.min.apply(null,reps):null;" +
      "if(tipo==='amrap'){chip='AMRAP '+minA+' MIN';sub=(wm.mv?wm.mv+' movimentos · ':'')+'terminou em '+wodFmt(minA*60);nota='vira uma marca em Evolução · Marcas';" +
      "corpo=cardW('Quantas voltas você fechou?',\"<div style='display:flex;gap:10px;'>\"+" +
      "\"<div class='wptile' style='flex:1;'><i>Voltas</i><b>\"+st.v+'</b></div>'+" +
      "\"<button class='wptile wpr' id='wpExB' style='flex:1;'><i>+ reps</i><b>\"+st.ex+'</b></button></div>'+" +
      "\"<div style='display:flex;gap:10px;margin-top:10px;'><button class='wpchip' id='wpMenos'>− 1 volta</button><button class='wpchip' id='wpMais'>+ 1 volta</button></div>\"+" +
      "\"<div style='font-size:12.5px;color:#6e6a78;margin-top:10px;'>o app conta as voltas que você tocou no cronômetro — só confirma · toque em + reps pra anotar a volta que ficou pela metade</div>\")+comoFez();" +
      "if(laps.length){corpo+=cardW('Tempo de cada volta',laps.map(function(lp,i){var dur=lp-(i?laps[i-1]:0);var antD=i?laps[i-1]-(i>1?laps[i-2]:0):null;" +
      "var df=antD==null?null:dur-antD;" +
      "return \"<div class='wplin'><span style='flex:1;font-weight:800;'>Volta \"+(i+1)+\"</span><b style='font-variant-numeric:tabular-nums;'>\"+wodFmt(dur)+'</b>'+" +
      "\"<span style='width:52px;text-align:right;font-size:12.5px;font-variant-numeric:tabular-nums;color:\"+(df==null?'#6e6a78':df<0?'#4ade80':'#8a8695')+\";'>\"+(df==null?'—':(df<0?'-':'+')+wodFmt(Math.abs(df)))+'</span></div>';}).join(''));}" +
      "if(ant&&ant.v!=null){var mel=st.v>ant.v||(st.v===ant.v&&st.ex>(ant.ex||0));" +
      "corpo+=cardW('',\"<div style='display:flex;gap:12px;align-items:center;'><span style='font-size:22px;'>\"+(mel?'⭐':'📌')+'</span><div>'+" +
      "\"<b style='font-size:14.5px;'>\"+(mel?'Melhor que em '+dd(ant.d):'Sua marca de '+dd(ant.d)+' segue na frente')+'</b>'+" +
      "\"<div style='font-size:13px;color:#8a8695;'>você fez \"+ant.v+(ant.ex?' voltas + '+ant.ex:' voltas')+' · agora '+st.v+(st.ex?' + '+st.ex:'')+'</div></div></div>');}}" +
      "else if(tipo==='fortime'){chip='FOR TIME';sub=(wm.mv?wm.mv+' movimentos':'circuito completo');" +
      "corpo=cardW('',\"<div style='text-align:center;'><div class='wpk'>Seu tempo</div>\"+" +
      "\"<b id='wpT' style='font-size:56px;font-weight:900;font-variant-numeric:tabular-nums;line-height:1;cursor:pointer;'>\"+wodFmt(st.t||0)+'</b>'+" +
      "\"<div style='font-size:12.5px;color:#6e6a78;margin-top:8px;'>medido pelo cronômetro · toque pra corrigir</div></div>\"+" +
      "\"<div class='wplin' style='margin-top:12px;'><span style='flex:1;'>Não terminei o WOD</span><button id='wpNf' aria-pressed='\"+(st.nf?'true':'false')+\"' class='wptg\"+(st.nf?' on':'')+\"'></button></div>\")+comoFez();" +
      "if(lst0.length){var cfN={rx:'RX',esc:'escalado',adp:'adaptado'};" +
      "corpo+=cardW('Suas vezes no '+eh(wod.wodNome),\"<div class='wplin'><span style='width:56px;font-weight:800;'>hoje</span><span style='flex:1;color:#8a8695;'>\"+(cfN[st.cf]||'—')+\"</span><b style='color:#4ade80;font-variant-numeric:tabular-nums;'>\"+wodFmt(st.t||0)+'</b></div>'+" +
      "lst0.slice(-3).reverse().map(function(x){return \"<div class='wplin'><span style='width:56px;font-weight:800;'>\"+dd(x.d)+\"</span><span style='flex:1;color:#8a8695;'>\"+(cfN[x.cf]||'')+'</span><b style=\\\"font-variant-numeric:tabular-nums;\\\">'+(x.v!=null?wodFmt(x.v):eh(String(x.r||'').slice(0,12)))+'</b></div>';}).join(''));" +
      "var mel2=lst0.filter(function(x){return x.v!=null&&!x.nf;}).map(function(x){return x.v;});" +
      "if(mel2.length&&st.t!=null&&!st.nf&&st.t<Math.min.apply(null,mel2))nota=wodFmt(Math.min.apply(null,mel2)-st.t)+' mais rápido que a sua melhor marca';}}" +
      "else{chip=tipo==='tabata'?'TABATA · '+rd+' ROUNDS':'EMOM '+minA+' MIN';" +
      "sub=tipo==='tabata'?wk2+'s trabalho / '+rs2+'s descanso':'um movimento a cada minuto cheio';nota='o seu personal vê o placar e a observação no painel';" +
      "corpo=cardW('Reps de cada round',\"<div style='display:grid;grid-template-columns:repeat(4,1fr);gap:8px;'>\"+st.reps.map(function(v,i){" +
      "return \"<button class='wptile wpr\"+(v!=null&&v===pior?' pior':'')+\"' data-wpr='\"+i+\"'><i>R\"+(i+1)+'</i><b>'+(v==null?'—':v)+'</b></button>';}).join('')+'</div>'+" +
      "\"<div style='font-size:12.5px;color:#6e6a78;margin-top:10px;'>toque num round pra anotar as reps\"+(tipo==='tabata'&&pior!=null?\" · em Tabata o placar é a <b style='color:#fff;'>pior série: \"+pior+'</b>':'')+'</div>');" +
      "if(reps.length)corpo+=cardW('',\"<div style='display:flex;gap:10px;'>\"+" +
      "\"<div class='wptile' style='flex:1;'><i>Total</i><b>\"+tot+'<small>reps</small></b></div>'+" +
      "\"<div class='wptile' style='flex:1;'><i>Pior série</i><b>\"+pior+'</b></div>'+" +
      "\"<div class='wptile' style='flex:1;'><i>Média</i><b>\"+String(Math.round(10*tot/reps.length)/10).replace('.',',')+'</b></div></div>');" +
      "corpo+=cardW('Uma observação pro seu personal',\"<textarea id='wpObs' rows='3' maxlength='300' class='wpobs' placeholder='Ex.: caiu no R6, ombro cansado…'></textarea>\");}" +
      "ov.innerHTML=\"<div style='max-width:480px;margin:0 auto;padding:calc(14px + env(safe-area-inset-top,0px)) 18px calc(28px + env(safe-area-inset-bottom,0px));'>\"+" +
      "\"<div style='display:flex;align-items:center;margin-bottom:16px;'><button id='wpVoltar' class='wpchip' style='flex:none;padding:0 20px;'>Voltar</button><span style='margin-left:auto;font-size:10.5px;font-weight:800;letter-spacing:.22em;color:#8a8695;'>MEU RESULTADO</span></div>\"+" +
      "\"<span class='wpctipo'>\"+chip+'</span>'+" +
      "\"<div style='font-size:clamp(26px,8vw,38px);font-weight:900;letter-spacing:-.03em;text-transform:uppercase;line-height:1;margin:10px 0 6px;'>\"+eh(wod.wodNome)+'</div>'+" +
      "\"<div style='font-size:13.5px;color:#8a8695;'>\"+sub+'</div>'+corpo+" +
      "\"<button id='wpSalvar' class='btnx' style='width:100%;min-height:58px;font-size:17px;margin-top:18px;'>Salvar resultado</button>\"+" +
      "\"<div style='text-align:center;font-size:12.5px;color:#6e6a78;margin-top:10px;'>\"+nota+'</div></div>';" +
      "var obn=document.getElementById('wpObs');if(obn)obn.value=st.ob;}" +
      "ov.addEventListener('input',function(e){if(e.target.id==='wpObs')st.ob=e.target.value;});" +
      "ov.addEventListener('click',function(e){var t=e.target.closest('button,#wpT');if(!t)return;" +
      "if(t.id==='wpVoltar'){ov.remove();wodMsgFim(msg);return;}" +
      "if(t.id==='wpMenos'){st.v=Math.max(0,st.v-1);pr();return;}" +
      "if(t.id==='wpMais'){st.v++;pr();return;}" +
      "if(t.id==='wpExB'){var ex=prompt('Reps da volta que ficou pela metade:',st.ex||'');if(ex!=null&&ex!=='')st.ex=Math.max(0,parseInt(ex,10)||0);pr();return;}" +
      "if(t.id==='wpNf'){st.nf=st.nf?0:1;pr();return;}" +
      "if(t.id==='wpT'){var tv=prompt('Corrige o tempo (mm:ss):',wodFmt(st.t||0));if(tv){var pt=String(tv).split(':');var sg=60*(parseInt(pt[0],10)||0)+(parseInt(pt[1],10)||0);if(sg>0)st.t=sg;}pr();return;}" +
      "if(t.dataset&&t.dataset.wpcf){st.cf=st.cf===t.dataset.wpcf?'':t.dataset.wpcf;pr();return;}" +
      "if(t.dataset&&t.dataset.wpr!=null){var rp=prompt('Reps do round '+(1+ +t.dataset.wpr)+':',st.reps[+t.dataset.wpr]==null?'':st.reps[+t.dataset.wpr]);" +
      "if(rp!=null&&rp!=='')st.reps[+t.dataset.wpr]=Math.max(0,parseInt(rp,10)||0);pr();return;}" +
      "if(t.id==='wpSalvar'){var reps2=st.reps.filter(function(x){return x!=null;});var tot2=reps2.reduce(function(a,b){return a+b;},0);" +
      "var pior2=reps2.length?Math.min.apply(null,reps2):null;" +
      "var cfT={rx:' · RX',esc:' · escalado',adp:' · adaptado'}[st.cf]||'';var r,v;" +
      "if(tipo==='amrap'){v=st.v;r=pl(st.v,'volta','voltas')+(st.ex?' + '+st.ex+' reps':'')+' em '+wodFmt(minA*60)+cfT;}" +
      "else if(tipo==='fortime'){v=st.t;r=(st.nf?'não terminou · ':'')+'tempo '+wodFmt(st.t||0)+cfT;}" +
      "else{v=pior2;r=(reps2.length?tot2+' reps · pior série '+pior2:'circuito completo')+cfT;}" +
      "if(st.ob)r+=' — obs: '+st.ob.slice(0,120);" +
      "var wr2=L('ptwodres',{});var lst2=wr2[wod.wodId]||[];var ant2=lst2.length?lst2[lst2.length-1]:null;" +
      "if(ant2&&v!=null&&ant2.v!=null&&!st.nf){if(tipo==='fortime'?v<ant2.v:v>ant2.v)r+=' — BATEU o resultado anterior!';}" +
      "lst2.push({d:isoHj(),n:wod.wodNome,r:r,v:v==null?null:Math.round(v),tp:tipo,cf:st.cf||'',ex:st.ex||0,nf:st.nf?1:0," +
      "sp:laps.map(function(x){return Math.round(x);}),rp:st.reps,ob:st.ob.slice(0,300)});" +
      "if(lst2.length>20)lst2.shift();wr2[wod.wodId]=lst2;Sv('ptwodres',wr2);pintaWodRes();" +
      // R4: o fim do circuito oferece o post com a foto (números do placar)
      "var stW=tipo==='amrap'?[[st.v+(st.ex?'+'+st.ex:''),'voltas'],[wodFmt(minA*60),'tempo']]:" +
      "tipo==='fortime'?[[wodFmt(st.t||0),'tempo']].concat(st.cf?[[{rx:'RX',esc:'ESCALADO',adp:'ADAPTADO'}[st.cf],'como fez']]:[]):" +
      "[[tot2,'reps'],[pior2!=null?pior2:'—','pior série']];" +
      "var rotW={amrap:'AMRAP',fortime:'For Time',emom:'EMOM',tabata:'Tabata'}[tipo]||'Circuito';" +
      "ov.remove();wodMsgFim('Placar salvo! '+r,{badge:'CIRCUITO',titulo:wod.wodNome,stats:stW,rodape:rotW});return;}});" +
      "pr();window.__wodPlacarEl=ov;}" +
      "window.__wodPlacar=wodPlacar;" +
      "document.getElementById('wodTermina').addEventListener('click',function(){if(!wod.run)return;var el2=(Date.now()-wod.t0)/1000;" +
      "wodFim('Seu tempo: '+wodFmt(el2)+(wod.voltas?' · '+pl(wod.voltas,'volta','voltas'):''),el2);});" +
      "document.getElementById('wodTipos').addEventListener('click',function(e){var b=e.target.closest('[data-wodt]');if(!b||wod.run)return;" +
      "wod.tipo=b.dataset.wodt;wod.voltas=0;wod.gi=0;wod.acum=0;wod.ultMin=-1;wod.ultFase='';wod.wodId=null;wod.wodNome='';wodChips();wodCfg();" +
      "document.getElementById('wodTempo').textContent='0:00';document.getElementById('wodFase').textContent='Pronto?';document.getElementById('wodInfo').textContent='';document.getElementById('wodFimBox').style.display='none';});" +
      "document.getElementById('wodGo').addEventListener('click',function(){" +
      "if(wod.run){clearInterval(wod.iv);wod.iv=null;wod.run=false;wod.acum=(Date.now()-wod.t0)/1000;this.textContent='Continuar';soltaTela();return;}" +
      "wod.run=true;wod.t0=Date.now()-wod.acum*1000;if(wod.acum<1)wod.gi=0;this.textContent='Pausar';document.getElementById('wodFimBox').style.display='none';ligaTela();" +
      "bip(880,120);wod.iv=setInterval(wodTick,200);wodTick();abreWodFull();});" +
      "document.getElementById('wodZera').addEventListener('click',function(){clearInterval(wod.iv);wod.iv=null;wod.run=false;wod.acum=0;wod.voltas=0;wod.gi=0;wod.laps=[];wod.ultMin=-1;wod.ultFase='';soltaTela();fechaWodFull();" +
      "document.getElementById('wodGo').textContent='Iniciar';document.getElementById('wodTempo').textContent='0:00';document.getElementById('wodFase').textContent='Pronto?';document.getElementById('wodInfo').textContent='';document.getElementById('wodFimBox').style.display='none';});" +
      // cada volta guarda o instante: vira a lista "tempo de cada volta" do placar
      "document.getElementById('wodVolta').addEventListener('click',function(){if(!wod.run)return;wod.voltas++;wod.laps.push((Date.now()-wod.t0)/1000);if(navigator.vibrate)navigator.vibrate(70);wodTick();});" +
      "wodChips();wodCfg();pintaWodRes();" +
      // data no cabeçalho e o montador manual atrás do botão (tela 50)
      "(function(){var wh=document.getElementById('wodHoje');if(wh){var d0=new Date();" +
      "var ds=['domingo','segunda','terça','quarta','quinta','sexta','sábado'];var ms=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];" +
      "wh.textContent=ds[d0.getDay()]+', '+d0.getDate()+' de '+ms[d0.getMonth()];}" +
      "var lb=document.getElementById('wodLivreBt');if(lb)lb.addEventListener('click',function(){" +
      "var lv=document.getElementById('wodLivre');lv.style.display=lv.style.display==='none'?'block':'none';});})();" +
      "window.__wod=wod;window.__wodGuia={avanca:wfAvanca};" +
      "}" +
      // ---- corrida e bike: cronômetro com pace — só roda se o card existe (Configurações) ----
      "if(document.getElementById('cardCardio')){" +
      "var CARDIOS=" + jsonApp(cardiosApp.map(function (c) { return { id: c.id, n: c.nome, m: c.mod, t: c.tipo, d: +c.dist || 0, tp: +c.tempo || 0, p: c.pace || "", r: +c.reps || 8, ti: +c.tiro || 60, de: +c.desc || 90, cp: capaRef(c) }; })) + ";" +
      /* O resumo do treino de cardio numa linha. 'misto' e o pedido do
       * professor: a MESMA folha tem parte continua E tiros, entao o resumo
       * mostra os dois na ordem em que o aluno vai fazer. Gemeo do
       * alvoCardio() aqui de cima — mexeu num, confira o outro. */
      "function crAlvoTxt(c){if(!c)return 'livre';" +
      "var ct=[(c.d?String(c.d).replace('.',',')+' km':''),(c.tp?c.tp+' min':''),(c.p?'pace '+c.p:'')].filter(Boolean).join(' \\u00b7 ');" +
      "var ti=(c.r||8)+'\\u00d7 '+(c.ti||60)+'s forte / '+(c.de||90)+'s leve';" +
      "if(c.t==='intervalado')return ti;if(c.t==='misto')return (ct||'parte cont\\u00ednua')+' + '+ti;return ct||'livre';}" +
      "var CRMODS={corrida:'Corrida',caminhada:'Caminhada',bike:'Bike'};" +
      "var CRICOS={mapa:\"" + CRICO_MAPA + "\",painel:\"" + CRICO_PAINEL + "\"};" +
      "var cr={resumo:false,blocos:null,bi:0,bt0:0,bkm0:0,run:false,iv:null,t0:0,acum:0,km:0,gpsOn:false,watch:null,lastPos:null,plano:null,mod:'corrida',ultFase:'',ultCd:0,ultKm:0,jan:[],alvoBipou:false,rota:[],autoP:false,lastMove:0,metaD:0,metaT:0,cdIv:null,pagF:0,gigaF:0,lockF:false,swF:0};" +
      "function crEl(id){return document.getElementById(id);}" +
      "function crCfg(){var c=L('ptcrCfg',null)||{};return {cd:(c.cd==null?3:+c.cd),fb:c.fb||'voz',ap:c.ap==null?1:+c.ap,mp:c.mp||'auto',bl:(c.bl==null?1:+c.bl)};}" +
      "function crFala(txt){try{if(!window.speechSynthesis)return false;var u=new SpeechSynthesisUtterance(txt);u.lang='pt-BR';speechSynthesis.speak(u);return true;}catch(e){return false;}}" +
      /* mapa de ruas quando on-line; sem internet cai no traçado offline.
       * Estilos: CARTO (escuro/claro/colorido, com @2x pra tela retina),
       * satélite da Esri e o OSM cru. Tile que não carrega cai no OSM —
       * o mapa nunca fica em branco por causa do estilo escolhido. */
      "var CRMAPS={" +
      "escuro:{n:'Escuro',u:'https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png',s:'abcd',hd:1,bg:'#1a1c20',a:'\u00a9 OpenStreetMap \u00b7 CARTO'}," +
      "claro:{n:'Claro',u:'https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png',s:'abcd',hd:1,bg:'#eceae5',a:'\u00a9 OpenStreetMap \u00b7 CARTO'}," +
      "colorido:{n:'Colorido',u:'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',s:'abcd',hd:1,bg:'#eceae5',a:'\u00a9 OpenStreetMap \u00b7 CARTO'}," +
      "satelite:{n:'Sat\u00e9lite',u:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',bg:'#20242a',veu:'rgba(0,0,0,.18)',a:'Esri, Maxar, Earthstar'}," +
      "ruas:{n:'Ruas (OSM)',u:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',bg:'#eceae5',lava:1,a:'\u00a9 OpenStreetMap'}};" +
      "var CRMAPOSM='https://tile.openstreetmap.org/{z}/{x}/{y}.png';" +
      "function crDpr(){return Math.min(2,Math.max(1,window.devicePixelRatio||1));}" +
      // 'auto' = segue o tema do app (noturno -> mapa escuro)
      "function crEstiloId(){var m=crCfg().mp;if(m&&CRMAPS[m])return m;" +
      "return document.documentElement.classList.contains('claro')?'claro':'escuro';}" +
      "function crEstilo(){return CRMAPS[crEstiloId()]||CRMAPS.ruas;}" +
      /* A chave do CARTO entra por AQUI, num lugar so, porque o canvas e o 3D
       * montam endereco por caminhos diferentes e esquecer um deixaria metade
       * do app carimbada.
       *
       * Em 2026-08 o CARTO passou a exigir chave: sem ela o ladrilho ainda
       * BAIXA, mas vem com "API KEY REQUIRED" escrito dentro da imagem. Por
       * isso nenhum teste pegou — pra qualquer codigo, a imagem carregou.
       *
       * A chave e publica (vive dentro do app, como a anonKey do Supabase); o
       * que protege a cota e a restricao por dominio no painel do CARTO.
       * Sem chave, tudo segue funcionando, so carimbado. */
      "function crChave(u){try{var k9=(self.MT_MAPA||{}).cartoKey||'';" +
      "if(!k9||String(u).indexOf('cartocdn.com')<0)return u;" +
      "return u+(u.indexOf('?')>-1?'&':'?')+'api_key='+encodeURIComponent(k9);}catch(e){return u;}}" +
      "function crUrl(tpl,e,z,x,y){return String(tpl).replace('{s}',(e&&e.s)?e.s[(x+y)%e.s.length]:'a')" +
      ".replace('{z}',z).replace('{x}',x).replace('{y}',y).replace('{r}',(e&&e.hd&&crDpr()>1.4)?'@2x':'');}" +
      "function crUrlK(tpl,e,z,x,y){return crChave(crUrl(tpl,e,z,x,y));}" +
      "var crTiles={};var crMapaErro=0;" +
      "function merc(lat,lng,z){var n=Math.pow(2,z);var x=(lng+180)/360*n;var la=lat*Math.PI/180;" +
      "var y=(1-Math.log(Math.tan(la)+1/Math.cos(la))/Math.PI)/2*n;return {x:x,y:y};}" +
      "function crTile(z,x,y){var n=Math.pow(2,z);if(y<0||y>=n)return null;x=((x%n)+n)%n;" +
      "var es=crEstiloId(),e9=CRMAPS[es];var k=es+'/'+z+'/'+x+'/'+y;var t=crTiles[k];" +
      /* O LADRILHO QUE FALHOU PRECISA PODER TENTAR DE NOVO.
       *
       * Antes esta linha era "if(t)return t;" — o objeto ficava guardado pra
       * sempre, inclusive quando a imagem tinha falhado. Comecar a corrida com
       * sinal ruim (a tela do celular mostrando UMA barra) derrubava os
       * ladrilhos que estavam a vista; eles viravam cadaver no cache; e o mapa
       * ficava preto o RESTO DA CORRIDA inteira, mesmo depois de o sinal
       * voltar. E o que o Raphael fotografou aos 0:02 de treino.
       *
       * Nao era o CORS: medido no iPhone dele em 27/08, os cinco estilos
       * carregam COM crossOrigin em 43 a 741 ms. Tirar o crossOrigin (v641)
       * foi correto — a exigencia era mesmo desnecessaria — mas nao era este
       * o defeito.
       *
       * Agora quem falhou espera e tenta de novo, com a espera crescendo a
       * cada tentativa (6s, 12s, 18s… ate 1 min) pra nao martelar o servidor
       * durante uma queda longa. O mesmo objeto Image e reaproveitado, entao
       * os tratadores de onload/onerror continuam valendo. */
      "if(t){if(!t.mau)return t;" +
      "var esp=Math.min(6000*(t.tent||1),60000);if(Date.now()-t.quando<esp)return t;" +
      "t.mau=0;t.fb=0;t.tent=(t.tent||1)+1;t.quando=Date.now();t.img.src=crUrlK(e9.u,e9,z,x,y);return t;}" +
      "if(Object.keys(crTiles).length>200)crTiles={};" +
      /* NADA de crossOrigin aqui: o canvas do mapa (#crMapa / #crMapaFull) nunca
       * e lido de volta — quem exporta imagem sao OUTROS canvas (a arte da
       * corrida, a foto, o card do treino). Sem leitura nao existe canvas sujo,
       * entao a exigencia nao comprava nada e so podia atrapalhar. */
      "t={img:new Image(),ok:false,fb:0,tent:1,quando:0};crTiles[k]=t;" +
      "t.img.onload=function(){t.ok=true;t.mau=0;t.tent=1;crMapaErro=0;try{desenhaRota();}catch(e){}};" +
      "t.img.onerror=function(){if(t.fb){t.mau=1;t.quando=Date.now();" +
      "if(!crMapaErro){crMapaErro=1;try{desenhaRota();}catch(e){}}return;}" +
      "t.fb=1;t.img.src=crUrl(CRMAPOSM,null,z,x,y);};" +
      "t.img.src=crUrlK(e9.u,e9,z,x,y);return t;}" +
      /* Sinal de volta = tenta tudo de novo NA HORA, sem esperar a escada.
       * Sem isso, sair do tunel e ficar 1 minuto olhando o mapa preto. */
      "window.addEventListener('online',function(){var mudou=0;" +
      "for(var k9 in crTiles){var t9=crTiles[k9];if(t9&&t9.mau){t9.mau=0;t9.fb=0;t9.tent=1;t9.quando=0;mudou=1;}}" +
      "if(mudou){crMapaErro=0;try{desenhaRota();}catch(e){}}});" +
      /* ===== PRA QUE LADO O ALUNO ESTA INDO =====
       * O GPS do celular so entrega "heading" quando esta em movimento, e
       * mesmo assim ele treme parado no semaforo. Entao: usa o do aparelho
       * quando ele vem confiavel, e senao calcula pelo proprio trajeto —
       * sempre entre pontos com pelo menos 8 m de distancia, porque o rumo
       * entre dois pontos colados e so o erro do GPS girando. */
      "function crBear(a,b){var r9=Math.PI/180;" +
      "var y9=Math.sin((b.lng-a.lng)*r9)*Math.cos(b.lat*r9);" +
      "var x9=Math.cos(a.lat*r9)*Math.sin(b.lat*r9)-Math.sin(a.lat*r9)*Math.cos(b.lat*r9)*Math.cos((b.lng-a.lng)*r9);" +
      "return (Math.atan2(y9,x9)*180/Math.PI+360)%360;}" +
      "function crRumo(){if(cr.rumo!=null&&isFinite(cr.rumo))return cr.rumo;" +
      "var r9=cr.rota;if(!r9||r9.length<2)return null;" +
      "for(var i=r9.length-1;i>0;i--){if(havKm(r9[i-1],r9[i])*1000>=8)return crBear(r9[i-1],r9[i]);}" +
      "return null;}" +
      /* A seta so aparece quando existe rumo DE VERDADE. Parado, volta a ser a
       * bolinha: seta apontando pra um lado inventado e pior que ponto nenhum. */
      "function crSeta(g,x,y,rumo){g.save();g.translate(x,y);" +
      "if(rumo==null){g.fillStyle='#fff';g.beginPath();g.arc(0,0,10,0,7);g.fill();" +
      "g.fillStyle='#2563eb';g.beginPath();g.arc(0,0,6.5,0,7);g.fill();g.restore();return;}" +
      "g.rotate(rumo*Math.PI/180);" +
      "g.fillStyle='#fff';g.beginPath();g.arc(0,0,11,0,7);g.fill();" +
      "g.fillStyle='#2563eb';g.beginPath();" +
      "g.moveTo(0,-9);g.lineTo(7.2,7.5);g.lineTo(0,4.2);g.lineTo(-7.2,7.5);g.closePath();g.fill();" +
      "g.restore();}" +
      "function crFullAberto(){var f=crEl('crFull');return !!f&&f.style.display!=='none';}" +
      // o canvas guarda pixel de VERDADE (largura na tela x densidade), senão
      // no iPhone o mapa sai borrado; o desenho continua em pixel de CSS
      "function crDim(cv){if(!cv)return;var r=cv.getBoundingClientRect();var d=crDpr();" +
      "if(r.width>0&&Math.abs(cv.width-Math.round(r.width*d))>4){cv.width=Math.round(r.width*d);cv.height=Math.round(r.height*d);}}" +
      "function crFullDim(){crDim(crEl('crMapaFull'));}" +
      "function desenhaRota(){crDim(crEl('crMapa'));desenhaCv(crEl('crMapa'));if(crFullAberto()){crFullDim();desenhaCv(crEl('crMapaFull'));}}" +
      "function desenhaCv(cv){if(!cv)return;var g=cv.getContext('2d');var dp=crDpr();" +
      "var W=cv.width/dp,H=cv.height/dp;g.setTransform(dp,0,0,dp,0,0);g.clearRect(0,0,W,H);" +
      "var CLR=document.documentElement.classList.contains('claro');" +
      "var centro=cr.rota.length?cr.rota[cr.rota.length-1]:cr.lastPos;" +
      "if(navigator.onLine&&centro){" +
      /* CORRENDO, O MAPA SEGUE O ALUNO — zoom fixo e ele no meio.
       *
       * Antes valia sempre a regra de baixo: a cada posicao nova o mapa
       * reenquadrava o percurso INTEIRO. Conforme a rota crescia, o centro
       * escorregava e o zoom descia de degrau em degrau — dava a impressao de
       * "avanca quadro a quadro", e o aluno nunca ficava no meio da tela.
       * Correndo, o que serve e o contrario: eu no centro, escala constante.
       * Parado (fim da corrida, historico), a visao do percurso todo volta a
       * ser a util. */
      "var z=16;var b=null;" +
      "if(cr.run&&cr.rota.length){centro=cr.rota[cr.rota.length-1];}" +
      "else if(cr.rota.length>1){b={la1:1/0,la2:-1/0,lo1:1/0,lo2:-1/0};" +
      "cr.rota.forEach(function(pp){if(pp.lat<b.la1)b.la1=pp.lat;if(pp.lat>b.la2)b.la2=pp.lat;if(pp.lng<b.lo1)b.lo1=pp.lng;if(pp.lng>b.lo2)b.lo2=pp.lng;});" +
      "centro={lat:(b.la1+b.la2)/2,lng:(b.lo1+b.lo2)/2};" +
      "for(z=17;z>12;z--){var q1=merc(b.la2,b.lo1,z),q2=merc(b.la1,b.lo2,z);" +
      "if((q2.x-q1.x)*256<W-60&&(q2.y-q1.y)*256<H-60)break;}}" +
      "var c0=merc(centro.lat,centro.lng,z);var px0=c0.x*256-W/2,py0=c0.y*256-H/2;" +
      "var EST=crEstilo();g.fillStyle=EST.bg||'#eceae5';g.fillRect(0,0,W,H);var pintou9=0;" +
      "for(var tx=Math.floor(px0/256);tx<=Math.floor((px0+W)/256);tx++){for(var ty=Math.floor(py0/256);ty<=Math.floor((py0+H)/256);ty++){" +
      "var tl=crTile(z,tx,ty);if(tl&&tl.ok)try{g.drawImage(tl.img,Math.round(tx*256-px0),Math.round(ty*256-py0),256,256);pintou9++;}catch(e){}}}" +
      /* visual clean, estilo app de corrida: tira a cor berrante dos tiles
       * (composição 'saturation' — o filtro de canvas não roda em iPhone
       * antigo, composição roda em tudo) e passa um véu claro por cima.
       * A rota e a posição são pintadas DEPOIS, então continuam vivas. */
      "if(EST.lava){g.globalCompositeOperation='saturation';g.fillStyle='hsl(0, 14%, 50%)';g.fillRect(0,0,W,H);" +
      "g.globalCompositeOperation='source-over';g.fillStyle='rgba(244,242,237,.42)';g.fillRect(0,0,W,H);}" +
      "else if(EST.veu){g.fillStyle=EST.veu;g.fillRect(0,0,W,H);}" +
      "var pj=function(pp){var m2=merc(pp.lat,pp.lng,z);return {x:m2.x*256-px0,y:m2.y*256-py0};};" +
      "if(cr.rota.length>1){g.lineJoin='round';g.lineCap='round';" +
      "g.strokeStyle='rgba(255,255,255,.9)';g.lineWidth=8;g.beginPath();" +
      "cr.rota.forEach(function(pp,i){var q=pj(pp);if(i)g.lineTo(q.x,q.y);else g.moveTo(q.x,q.y);});g.stroke();" +
      "g.strokeStyle=CV('cor');g.lineWidth=5;g.beginPath();" +
      "cr.rota.forEach(function(pp,i){var q=pj(pp);if(i)g.lineTo(q.x,q.y);else g.moveTo(q.x,q.y);});g.stroke();" +
      "var i0=pj(cr.rota[0]);g.fillStyle='#4ade80';g.beginPath();g.arc(i0.x,i0.y,7,0,7);g.fill();}" +
      // onde o aluno está e pra que lado vai (seta quando há rumo, ponto quando não)
      "var posAt=cr.rota.length?cr.rota[cr.rota.length-1]:centro;" +
      "var pAt=pj(posAt);crSeta(g,pAt.x,pAt.y,crRumo());" +
      // atribuição obrigatória do OpenStreetMap
      "var atb=EST.a||'\\u00a9 OpenStreetMap';g.font='11px system-ui,sans-serif';g.textAlign='right';" +
      "var atw=Math.round(g.measureText(atb).width)+16;" +
      "g.fillStyle='rgba(255,255,255,.85)';g.fillRect(W-atw,H-22,atw,22);" +
      "g.fillStyle='#444';g.fillText(atb,W-8,H-7);" +
      "if(!pintou9&&crMapaErro){var mm9='N\u00e3o deu pra carregar as ruas';" +
      "g.font='700 12px system-ui,sans-serif';g.textAlign='center';" +
      "var mw9=Math.round(g.measureText(mm9).width)+22;" +
      "g.fillStyle='rgba(0,0,0,.6)';g.fillRect(Math.round(W/2-mw9/2),8,mw9,24);" +
      "g.fillStyle='#fff';g.fillText(mm9,W/2,24);" +
      "g.font='11px system-ui,sans-serif';g.fillStyle=CLR?'rgba(0,0,0,.45)':'rgba(255,255,255,.5)';" +
      "g.fillText('seu trajeto continua sendo gravado',W/2,46);}" +
      "return;}" +
      // offline (ou ainda sem posição): grade + traçado do percurso
      "g.strokeStyle=CLR?'rgba(0,0,0,.07)':'rgba(255,255,255,.05)';g.lineWidth=1;" +
      "for(var gx=40;gx<W;gx+=40){g.beginPath();g.moveTo(gx,0);g.lineTo(gx,H);g.stroke();}" +
      "for(var gy=40;gy<H;gy+=40){g.beginPath();g.moveTo(0,gy);g.lineTo(W,gy);g.stroke();}" +
      // 22px cravado nao cabia num celular de 390: a frase saia cortada nas DUAS
      // pontas e o quadro parecia quebrado. Agora o texto encolhe ate caber.
      "if(cr.rota.length<2){g.fillStyle=CLR?'rgba(0,0,0,.35)':'rgba(255,255,255,.3)';g.textAlign='center';" +
      "var ms9=cr.gpsOn?'Seu trajeto vai aparecer aqui':'Ligue o GPS pra desenhar o trajeto';" +
      "var fs9=20;g.font='700 '+fs9+'px system-ui,sans-serif';" +
      "while(fs9>11&&g.measureText(ms9).width>W-30){fs9--;g.font='700 '+fs9+'px system-ui,sans-serif';}" +
      "g.fillText(ms9,W/2,H/2+Math.round(fs9/3));return;}" +
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
      "if(cr.run&&cr.gpsOn&&crCfg().ap&&cr.lastMove&&Date.now()-cr.lastMove>8000&&!cr.blocos&&!(cr.plano&&(cr.plano.t==='intervalado'||cr.plano.t==='misto'))){" +
      "cr.autoP=true;cr.run=false;cr.acum=(Date.now()-cr.t0)/1000;crEl('crGo').textContent='Continuar';if(navigator.vibrate)navigator.vibrate(120);}" +
      "var el2=cr.run?(Date.now()-cr.t0)/1000:cr.acum;var km=crKmAtual();" +
      "crEl('crTempo').textContent=wodFmt(el2);" +
      "crEl('crDist').textContent=km.toFixed(2).replace('.',',');" +
      "var med=km>0.015?(el2/60)/km:null;crEl('crPaceMed').textContent=med?paceFmt(med):'--:--';" +
      "var atual=med;if(cr.gpsOn&&cr.jan.length>1){var a0=cr.jan[0],a1=cr.jan[cr.jan.length-1];" +
      "if(a1.km-a0.km>0.02)atual=((a1.t-a0.t)/60000)/(a1.km-a0.km);}" +
      "crEl('crPace').textContent=atual?paceFmt(atual):'--:--';" +
      "var kcV=crEl('crKcalV');if(kcV)kcV.textContent=String(crKcal(km));" +
      "crEl('crFim').style.display=(cr.run||cr.acum>0)?'block':'none';" +
      "var dsc=crEl('crDescarta');if(dsc)dsc.style.display=(!cr.run&&cr.acum>5)?'block':'none';" +
      // tela 51: confronto com o alvo de pace e a barra da meta (fora dos tiros)
      "(function(){var alv=crEl('crAlvo'),mb=crEl('crMetaBar');if(!alv||!mb)return;" +
      "var p3=cr.plano;var ehInt=p3&&p3.t==='intervalado';var vivo=cr.run||cr.acum>0;" +
      "var alvoP=!ehInt&&p3&&p3.p?(function(s){var pr=String(s).split(':');return (+pr[0]||0)+((+pr[1]||0)/60);})(p3.p):0;" +
      "if(vivo&&alvoP&&med){var dif=Math.round((alvoP-med)*60);alv.style.display='block';" +
      "if(dif>=0){alv.style.color='#4ade80';alv.textContent='\\u2713 '+(dif<1?'cravado no alvo de '+p3.p:dif+' segundo'+(dif>1?'s':'')+' por km mais r\\u00e1pido que o alvo de '+p3.p);}" +
      "else{alv.style.color='#fbbf24';alv.textContent=(-dif)+' s por km acima do alvo de '+p3.p+' \\u2014 segura o ritmo';}}" +
      "else alv.style.display='none';" +
      "var mD=!ehInt&&p3&&p3.d?+p3.d:(!ehInt&&cr.metaD?+cr.metaD:0);" +
      "var mT=!ehInt&&!mD&&p3&&p3.tp?+p3.tp:(!ehInt&&!mD&&cr.metaT?+cr.metaT:0);" +
      "if(vivo&&(mD||mT)){mb.style.display='block';" +
      "var frac=mD?Math.min(1,km/mD):Math.min(1,el2/(mT*60));" +
      "crEl('crMetaFill').style.width=Math.round(frac*100)+'%';" +
      "crEl('crMetaTxt').textContent=mD?(km.toFixed(2).replace('.',',')+' de '+String(mD).replace('.',',')+' km'):(Math.floor(el2/60)+' de '+mT+' min');}" +
      "else mb.style.display='none';})();" +
      "var p2=cr.plano;var fase=crEl('crFase'),info=crEl('crInfo');" +
      // com o player guiado ligado, é o BLOCO que manda no texto e no ritmo
      "var rb9=cr.blocos?crBlocos(el2,km):0;if(rb9===2)return;" +
      "if(rb9){var b5=crBlocoAtual();" +
      "fase.textContent=b5.n.toUpperCase();" +
      "fase.style.color=b5.k==='f'?'var(--corc)':(b5.k==='aq'||b5.k==='vc'?'#22d3ee':'#a9a4b5');" +
      "info.textContent=(b5.d||'')+' · bloco '+(cr.bi+1)+' de '+cr.blocos.length;" +
      "try{espelhaCr();}catch(e){}return;}" +
      "var cbx=crEl('crBlocoBox');if(cbx)cbx.style.display='none';" +
      /* Sem o player guiado (o aluno desligou aquecimento/volta a calma), o
       * misto ainda precisa saber QUANDO os tiros comecam: pelo tempo alvo da
       * parte continua, ou pela distancia dela quando so ha km prescrito. */
      "if(p2&&p2.t==='misto'){var iniM=(+p2.tp||0)*60;" +
      "var vaiM=p2.tp?el2>=iniM:(p2.d?km>=(+p2.d):false);" +
      "if(!vaiM){fase.textContent='PARTE CONTÍNUA';fase.style.color='#a9a4b5';" +
      "info.textContent=p2.n+' — depois vêm '+p2.r+' tiros de '+p2.ti+'s';return;}" +
      "if(cr.mistoT0==null)cr.mistoT0=el2;" +
      "var elM=el2-cr.mistoT0,cicM=p2.ti+p2.de,totM=p2.r*cicM;" +
      "if(cr.run&&elM>=totM){crFinaliza('CONTÍNUO + '+p2.r+' TIROS COMPLETOS!');return;}" +
      "var rdM=Math.min(p2.r,Math.floor(elM/cicM)+1),posM=elM%cicM,ftM=posM<p2.ti;" +
      "fase.textContent=(ftM?'FORTE':'LEVE')+' \\u00b7 TIRO '+rdM+' DE '+p2.r;fase.style.color=ftM?'var(--corc)':'#22d3ee';" +
      "info.textContent=p2.ti+'s forte / '+p2.de+'s leve — a parte contínua já foi';" +
      "var fM=(ftM?'F':'L')+rdM;if(cr.run&&fM!==cr.ultFase){cr.ultFase=fM;if(elM>0.3){if(navigator.vibrate)navigator.vibrate(ftM?[90,50,90]:200);bip(ftM?1100:600,200);}}" +
      "crCd(ftM?p2.ti-posM:cicM-posM);return;}" +
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
      /* ---------- frequencia cardiaca ao vivo (HR) ----------
       * Dois caminhos REAIS de conexao, nesta ordem:
       *   1) window.MTNativo.fc  — a ponte do app de loja (cobre iPhone e Android)
       *   2) navigator.bluetooth — Web Bluetooth, servico padrao de batimento
       *      0x180D (Chrome no Android; o Safari do iPhone nao tem)
       * Sem nenhum dos dois, hrSuporta() e falso e NADA aparece: o app nunca
       * mostra botao que nao consegue conectar (mesma regra do ajSaude).
       * O batimento cru fica so no aparelho enquanto o treino roda; o que e
       * guardado (e devolvido pro professor) e o RESUMO: media e maximo. */
      "var HRZN=['Z1 leve','Z2 tranquilo','Z3 moderado','Z4 forte','Z5 m\\u00e1ximo'];" +
      "var HRZC=['#60a5fa','#4ade80','#facc15','#fb923c','#f87171'];" +
      "var HR={dev:null,ch:null,on:false,nat:false,bpm:0,mx:0,soma:0,n:0};" +
      "function hrEl(i){return document.getElementById(i);}" +
      "function hrIdade(){var v=+L('ptidade',0)||0;return v>=8&&v<=99?v:0;}" +
      "function hrMax(){return 220-(hrIdade()||30);}" +
      "function hrZ(b){var p=b/hrMax();return p<.6?0:p<.7?1:p<.8?2:p<.9?3:4;}" +
      "function hrSuporta(){return !!(window.MTNativo&&window.MTNativo.fc&&window.MTNativo.fc.conectar)||!!(navigator.bluetooth&&navigator.bluetooth.requestDevice);}" +
      "function hrZera(){HR.mx=0;HR.soma=0;HR.n=0;}" +
      "function hrResumo(){return HR.n?{m:Math.round(HR.soma/HR.n),x:HR.mx}:null;}" +
      "function hrPinta(){var b=HR.bpm,z=b>0?hrZ(b):-1,cor=z>=0?HRZC[z]:'#8a8695';" +
      "var v=hrEl('fcVivo');if(v)v.className=HR.on?'on':'';" +
      "var bt=hrEl('fcBt');if(bt){bt.textContent=HR.on?'Desconectar a cinta':'Conectar cinta ou pulseira';bt.className=HR.on?'on':'';}" +
      "var e1=hrEl('fcBpm');if(e1){e1.textContent=b>0?b:'--';e1.style.color=cor;}" +
      "var e2=hrEl('fcZona');if(e2){e2.textContent=z>=0?HRZN[z]+' \\u00b7 '+Math.round(100*b/hrMax())+'% da m\\u00e1xima':(HR.on?'esperando o primeiro batimento\\u2026':'sem cinta conectada');e2.style.color=cor;}" +
      "var e3=hrEl('fcBar');if(e3)for(var i9=0;i9<e3.children.length;i9++)e3.children[i9].style.background=(i9<=z?HRZC[i9]:'');" +
      "var g=hrEl('gFc');if(g){g.className=hrSuporta()?'on':'';" +
      "g.innerHTML=HR.on?\"<span class='fcbat pulsa'>\\u2665</span> \"+(b>0?b:'--'):\"<span class='fcbat'>\\u2665</span> Cinta\";" +
      "g.style.color=(HR.on&&b>0)?cor:'';}" +
      "var cc=hrEl('crBpmC'),cb=hrEl('crBpmF');if(cc)cc.style.display=HR.on?'block':'none';if(cb)cb.textContent=b>0?b:'--';" +
      "try{if(typeof crFullAberto==='function'&&crFullAberto())espelhaCr();}catch(e){}" +
      "var aj=hrEl('ajFcSub');if(aj)aj.textContent=HR.on?(b>0?b+' bpm agora \\u00b7 toque pra desconectar':'conectada \\u00b7 esperando batimento'):'cinta ou pulseira por Bluetooth';}" +
      "function hrAmostra(b){b=+b||0;if(b<25||b>240)return;HR.bpm=b;if(b>HR.mx)HR.mx=b;HR.soma+=b;HR.n++;hrPinta();}" +
      "function hrLe(ev){var d=ev.target.value;if(!d||d.byteLength<2)return;" +
      "hrAmostra((d.getUint8(0)&1)?d.getUint16(1,true):d.getUint8(1));}" +
      "function hrSolta(){try{if(HR.ch)HR.ch.removeEventListener('characteristicvaluechanged',hrLe);}catch(e){}" +
      "try{if(HR.ch)HR.ch.stopNotifications();}catch(e){}" +
      "try{if(HR.dev&&HR.dev.gatt&&HR.dev.gatt.connected)HR.dev.gatt.disconnect();}catch(e){}" +
      "try{if(HR.nat&&window.MTNativo.fc.parar)window.MTNativo.fc.parar();}catch(e){}" +
      "HR.ch=null;HR.dev=null;HR.on=false;HR.nat=false;HR.bpm=0;hrPinta();}" +
      "function hrConecta(){if(HR.on){hrSolta();return;}" +
      "var nv=window.MTNativo&&window.MTNativo.fc;" +
      "if(nv&&nv.conectar){try{nv.conectar(function(b){hrAmostra(b);});HR.nat=true;HR.on=true;hrZera();hrPinta();}" +
      "catch(e){alert('N\\u00e3o deu pra conectar a cinta agora.');}return;}" +
      "if(!(navigator.bluetooth&&navigator.bluetooth.requestDevice)){alert('Este navegador n\\u00e3o conecta cinta por Bluetooth. No Android, use o Chrome; no iPhone vai funcionar pelo app da loja.');return;}" +
      "var bt9=hrEl('fcBt');if(bt9)bt9.textContent='Procurando a cinta\\u2026';" +
      "navigator.bluetooth.requestDevice({filters:[{services:['heart_rate']}]}).then(function(d){" +
      "HR.dev=d;d.addEventListener('gattserverdisconnected',function(){HR.on=false;HR.bpm=0;hrPinta();});return d.gatt.connect();})" +
      ".then(function(sv){return sv.getPrimaryService('heart_rate');})" +
      ".then(function(sr){return sr.getCharacteristic('heart_rate_measurement');})" +
      ".then(function(ch){HR.ch=ch;ch.addEventListener('characteristicvaluechanged',hrLe);return ch.startNotifications();})" +
      ".then(function(){HR.on=true;hrZera();hrPinta();})" +
      ".catch(function(e){HR.on=false;hrPinta();" +
      "if(e&&(e.name==='NotFoundError'||e.name==='AbortError'))return;" +
      "alert('N\\u00e3o deu pra conectar: '+((e&&e.message)||'ligue a cinta e deixe o celular perto.'));});}" +
      "(function(){var bt=hrEl('fcBt');if(bt)bt.addEventListener('click',hrConecta);" +
      "var g=hrEl('gFc');if(g)g.addEventListener('click',hrConecta);" +
      "var aj=hrEl('ajFc');if(aj)aj.addEventListener('click',hrConecta);" +
      "function pintaMax(){var t=hrEl('fcMaxT');if(t)t.textContent='FC m\\u00e1xima estimada: '+hrMax()+' bpm';}" +
      "var ia=hrEl('fcIdade');if(ia){ia.value=hrIdade()||'';" +
      "ia.addEventListener('change',function(){var v=parseInt(ia.value,10)||0;" +
      "if(v>=8&&v<=99)Sv('ptidade',v);else{ia.value='';Sv('ptidade',0);}pintaMax();hrPinta();});}" +
      "pintaMax();" +
      "if(!hrSuporta())return;" +
      "var cd=hrEl('fcCard');if(cd)cd.style.display='block';" +
      "var aj2=hrEl('ajFc');if(aj2)aj2.style.display='';" +
      "var dc=hrEl('fcDica');if(dc)dc.textContent=(window.MTNativo&&window.MTNativo.fc)?'Cinta, pulseira ou rel\\u00f3gio pelo app.':'Funciona com cinta e pulseira de batimento (padr\\u00e3o Bluetooth). Ligue a cinta antes de tocar em conectar.';" +
      "hrPinta();})();" +
      "window.__fc=HR;window.__fcAmostra=hrAmostra;window.__fcConecta=hrConecta;window.__fcResumo=hrResumo;window.__fcZera=hrZera;" +
      /* A corrida que tem trajeto guardado (campo r, a partir da v643) ganha um
       * "3D" clicavel na propria linha. Corridas antigas nao tem o campo e
       * seguem como texto — nada quebra, so nao tem o que mostrar. */
      "function pintaCrHist(){var el=crEl('crHist');if(!el)return;var lst=L('ptcardio',[]);" +
      "var vis=lst.slice(-5).reverse();" +
      "el.innerHTML=lst.length?'<b>Seus \\u00faltimos treinos:</b><br>'+vis.map(function(x,i9){" +
      "return String(x.d).slice(8,10)+'/'+String(x.d).slice(5,7)+' \\u2014 '+String(x.n).replace(/[<>&]/g,'')+': '+" +
      "(x.k?x.k.toFixed(2).replace('.',',')+' km \\u00b7 ':'')+wodFmt(x.s)+(x.p?' \\u00b7 pace '+x.p:'')+(x.fc?' \\u00b7 '+x.fc+' bpm':'')+" +
      "(x.r?\" <button type='button' data-cr3d='\"+i9+\"' style='min-height:26px;padding:1px 9px;margin-left:6px;border-radius:99px;background:var(--bg4);border:1px solid var(--bg11);color:var(--cor);font-family:inherit;font-size:11px;font-weight:800;cursor:pointer;vertical-align:1px;'>3D</button>\":'');}).join('<br>'):'';" +
      "el.querySelectorAll('[data-cr3d]').forEach(function(b9){b9.addEventListener('click',function(){" +
      "var x9=vis[+b9.getAttribute('data-cr3d')];if(x9&&x9.r)cr3DAbre(x9.r,x9.n);});});}" +
      // medalhas de corrida (mesmos critérios do card Conquistas): usado pra
      // avisar NA HORA quando a corrida recém-terminada conquista uma
      "var CRMEDN=['Primeira corrida','10 corridas','5 km numa corrida','10 km numa corrida','100 km somados','Pace abaixo de 6:00'];" +
      "function crMedQ(lst2){var q=lst2.filter(function(x){return x.m==='corrida';});" +
      "var n=q.length,mx=0,so=0,rp=0;q.forEach(function(x){var k9=+x.k||0;if(k9>mx)mx=k9;so+=k9;" +
      "if(k9>=3&&+x.s>0&&((+x.s/60)/k9)<=6.05)rp=1;});" +
      "return [n>=1,n>=10,mx>=5,mx>=10,so>=100,rp>=1];}" +
      /* Tela de resumo do fim da corrida: os números que antes eram duas
       * linhas de texto dentro do card viram tiles grandes na tela cheia,
       * com as medalhas/recordes e o botão de postar. */
      "function crEh(t){return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}" +
      /* ===== GUARDAR O TRAJETO DA CORRIDA =====
       *
       * Ate a v642 a rota vivia SO na memoria (cr.fimRota) e sumia quando o
       * aluno fechava o app: nao existia mapa de corrida passada, so os
       * numeros. Agora ela entra no proprio registro, no campo "r".
       *
       * Guardada comprimida (polilinha codificada, o formato classico de mapa)
       * porque o ptcardio inteiro viaja pro professor no devolveApp — a mesma
       * conta que na v611 mostrou 9 MB/mes por aluno so de foto. Medido: 600
       * pontos crus em JSON dao ~13 KB; simplificados e codificados, ~700
       * bytes. Trinta corridas guardadas passam de 400 KB pra ~20 KB.
       *
       * Precisao de 5 casas = ~1,1 m, mais do que o GPS de celular entrega. */
      "function crEncNum(v){v=v<0?~(v<<1):(v<<1);var o='';" +
      "while(v>=32){o+=String.fromCharCode((32|(v&31))+63);v>>=5;}" +
      "return o+String.fromCharCode(v+63);}" +
      "function crEncPoly(rt){var o='',pa=0,pn=0;" +
      "for(var i=0;i<rt.length;i++){var la=Math.round(rt[i].lat*1e5),ln=Math.round(rt[i].lng*1e5);" +
      "o+=crEncNum(la-pa)+crEncNum(ln-pn);pa=la;pn=ln;}return o;}" +
      "function crDecPoly(s){var pts=[],i=0,la=0,ln=0,b,sh,re;if(!s)return pts;" +
      "while(i<s.length){sh=0;re=0;do{b=s.charCodeAt(i++)-63;re|=(b&31)<<sh;sh+=5;}while(b>=32);" +
      "la+=(re&1)?~(re>>1):(re>>1);sh=0;re=0;" +
      "do{b=s.charCodeAt(i++)-63;re|=(b&31)<<sh;sh+=5;}while(b>=32);" +
      "ln+=(re&1)?~(re>>1):(re>>1);pts.push({lat:la/1e5,lng:ln/1e5});}return pts;}" +
      /* Douglas-Peucker com pilha em vez de recursao: 600 pontos numa aba de
       * celular nao merecem risco de estourar a pilha de chamadas. Tolerancia
       * de 0,00005 grau (~5,5 m) — abaixo do erro do GPS, entao o desenho nao
       * perde curva nenhuma que o aluno tenha realmente feito. */
      "function crSimpl(rt,tol){if(!rt||rt.length<3)return (rt||[]).slice();" +
      "var fica=new Array(rt.length);fica[0]=fica[rt.length-1]=1;" +
      "var pilha=[[0,rt.length-1]];" +
      "while(pilha.length){var par=pilha.pop(),a=par[0],z=par[1];if(z-a<2)continue;" +
      "var xa=rt[a].lng,ya=rt[a].lat,xz=rt[z].lng,yz=rt[z].lat;" +
      "var dx=xz-xa,dy=yz-ya,den=dx*dx+dy*dy,pior=-1,idx=-1;" +
      "for(var i=a+1;i<z;i++){var px=rt[i].lng-xa,py=rt[i].lat-ya;" +
      "var t=den?(px*dx+py*dy)/den:0;t=t<0?0:(t>1?1:t);" +
      "var ex=px-t*dx,ey=py-t*dy,d=ex*ex+ey*ey;" +
      "if(d>pior){pior=d;idx=i;}}" +
      "if(idx>0&&pior>tol*tol){fica[idx]=1;pilha.push([a,idx]);pilha.push([idx,z]);}}" +
      "var saiu=[];for(var j=0;j<rt.length;j++)if(fica[j])saiu.push(rt[j]);return saiu;}" +
      /* Teto de 200 pontos: mesmo depois de simplificar, uma corrida longa em
       * rua sinuosa ainda passa disso. Sem o teto, uma unica corrida grande
       * inchava o pacote que vai pro professor. */
      "function crRotaSalva(rt){if(!rt||rt.length<2)return '';" +
      "var s9=crSimpl(rt,0.00005);" +
      "if(s9.length>200){var pl=[],pa9=(s9.length-1)/199;" +
      "for(var i=0;i<200;i++)pl.push(s9[Math.round(i*pa9)]);s9=pl;}" +
      "return crEncPoly(s9);}" +
      /* crResTile, NAO crTile: existe uma crTile(z,x,y) la em cima que baixa o
       * ladrilho do mapa. As duas moram no MESMO escopo, entao a segunda
       * declaracao apagava a primeira (declaracao de funcao sobe pro topo e a
       * ultima vence) — e desenhaCv passou a receber um TEXTO HTML no lugar do
       * ladrilho, testar tl.ok (que nao existe num texto) e nunca desenhar rua
       * nenhuma. O mapa ficou preto da v602 ate a v642, com a bolinha azul e o
       * credito por cima, porque esses sao pintados depois do laco. Nenhum
       * pedido de imagem chegou a sair. */
      "function crResTile(v,r){return \"<div style='background:var(--bg1);border-radius:18px;padding:14px 10px;text-align:center;'>\"+" +
      "\"<b style='display:block;font-size:26px;font-weight:900;font-variant-numeric:tabular-nums;'>\"+v+'</b>'+" +
      "\"<span style='display:block;font-size:9.5px;font-weight:800;letter-spacing:.14em;color:#8a8695;text-transform:uppercase;margin-top:3px;'>\"+r+'</span></div>';}" +
      /* ===== TRAJETO EM 3D (MapLibre) =====
       *
       * Fica na tela de RESUMO e no historico, nunca durante a corrida. Tres
       * motivos, nessa ordem: (1) relevo so aparece com a camera inclinada, e
       * mapa inclinado e pior de ler correndo; (2) e onde o Strava tambem
       * mostra; (3) aqui o aluno esta parado, com sinal, e o GPS ja desligou —
       * se o mapa falhar, ninguem perde treino.
       *
       * O motor NAO e carregado junto com o app: so quando o aluno toca no
       * botao. Quem nunca abrir o 3D nao baixa 1 byte a mais, e a demo publica
       * segue sem pedir nada pra fora.
       *
       * O mapa da CORRIDA continua sendo o canvas de sempre. Nao existe troca
       * de motor: existe uma tela nova. */
      "var crGLp=null;" +
      /* Tres travas, iguais as do scanner-visao.js: o global ja existe, a
       * promessa ja esta em voo, e zerar a promessa no erro (senao uma falha de
       * rede tranca o recurso pra sempre naquela sessao).
       * ⚠️ conferir window.maplibregl DEPOIS do onload e obrigatorio: o
       * app-sw.js devolve o index.html com status 200 pra qualquer arquivo de
       * mesma origem que falte, entao o <script> "carrega" com HTML dentro e o
       * onerror nunca dispara.
       * ⚠️ caminho ABSOLUTO: o mesmo HTML roda em /app/, em /demo-aluno.html e
       * nos testes — caminho relativo acerta num e da 404 nos outros. */
      "function crGL(){if(window.maplibregl)return Promise.resolve(window.maplibregl);" +
      "if(crGLp)return crGLp;" +
      "crGLp=new Promise(function(ok,nao){" +
      "try{" +
      "var css=document.createElement('link');css.rel='stylesheet';" +
      "css.href='/assets/vendor/maplibre/maplibre-gl.css';document.head.appendChild(css);" +
      "var sc=document.createElement('script');sc.src='/assets/vendor/maplibre/maplibre-gl.js';" +
      "sc.onload=function(){if(window.maplibregl)ok(window.maplibregl);" +
      "else nao(new Error('o arquivo do mapa carregou sem trazer o motor'));};" +
      "sc.onerror=function(){nao(new Error('nao deu pra baixar o motor do mapa'));};" +
      "document.head.appendChild(sc);" +
      "}catch(e){nao(e);}" +
      "});" +
      "crGLp['catch'](function(){crGLp=null;});" +
      "return crGLp;}" +
      /* Estilo do 3D: a MESMA fonte de ladrilho que o aluno escolheu no mapa
       * comum (CRMAPS), mais o relevo. tileSize 256 nas DUAS fontes porque o
       * padrao do MapLibre e 512 e o CARTO/OSM e o relevo sao 256 — errar isso
       * nao da erro, so deixa o mapa borrado no zoom errado.
       * O relevo vem do conjunto aberto de altitude da AWS (terrarium), sem
       * chave. "terrarium" tem de ser minusculo exato.
       * terrain vai DENTRO do estilo de proposito: setTerrain solto estoura se
       * a fonte de altitude ainda nao entrou. */
      "function cr3DEstilo(){var e9=crEstilo(),dp9=crDpr()>1.4?'@2x':'';" +
      "var urls=[];var ss=(e9.s||'a').split('');" +
      "for(var i=0;i<ss.length;i++)urls.push(crChave(String(e9.u).replace('{s}',ss[i]).replace('{r}',e9.hd?dp9:'')));" +
      "return {version:8,sources:{" +
      "ruas:{type:'raster',tiles:urls,tileSize:256,attribution:''}," +
      "alto:{type:'raster-dem',tiles:['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png']," +
      "tileSize:256,maxzoom:14,encoding:'terrarium'}}," +
      "layers:[{id:'fundo',type:'background',paint:{'background-color':e9.bg||CV('bg0')}}," +
      "{id:'ruas',type:'raster',source:'ruas'}]," +
      "terrain:{source:'alto',exaggeration:1.4}," +
      /* ⚠️ o estilo do MapLibre e um objeto JS, e igual ao canvas ele NAO
       * entende var(): a cor tem de ser resolvida com CV() na hora, senao o
       * ceu sai da paleta do studio e o teste do fundo do app reprova. */
      "sky:{'sky-color':CV('bg0'),'horizon-color':CV('cor2')||CV('cor'),'fog-color':CV('bg2'),'fog-ground-blend':0.5}};}" +
      "function cr3DFecha(){var o=document.getElementById('cr3D');if(!o)return;" +
      "try{if(o.__mapa)o.__mapa.remove();}catch(e){}o.__mapa=null;o.remove();}" +
      /* Abre a tela do 3D pra uma rota ja codificada (o campo r do registro). */
      "function cr3DAbre(cod,titulo){var rt=crDecPoly(cod||'');if(rt.length<2)return;" +
      "cr3DFecha();" +
      "var o=document.createElement('div');o.id='cr3D';" +
      "o.style.cssText='position:fixed;inset:0;z-index:99;background:var(--bg0);';" +
      "o.innerHTML=\"<div id='cr3Dm' style='position:absolute;inset:0;'></div>\"+" +
      "\"<div id='cr3Dav' style='position:absolute;left:0;right:0;top:44%;text-align:center;color:#8a8695;font-size:13.5px;padding:0 24px;'>Abrindo o trajeto em 3D\\u2026</div>\"+" +
      "\"<div style='position:absolute;left:14px;right:14px;top:calc(env(safe-area-inset-top,0px) + 12px);display:flex;align-items:center;gap:10px;'>\"+" +
      "\"<button type='button' id='cr3Dx' style='flex:none;width:44px;height:44px;border-radius:99px;background:var(--bg2);border:1px solid var(--bg11);color:#fff;font-size:19px;font-family:inherit;'>\\u00d7</button>\"+" +
      "\"<div style='flex:1;min-width:0;font-size:14px;font-weight:800;color:#fff;text-shadow:0 1px 6px rgba(0,0,0,.8);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'>\"+crEh(titulo||'Seu trajeto')+'</div></div>'+" +
      "\"<div id='cr3Dcr' style='position:absolute;right:8px;bottom:calc(env(safe-area-inset-bottom,0px) + 8px);font-size:9.5px;color:var(--tx2,#cfcbdb);background:var(--bg2);padding:3px 7px;border-radius:6px;'></div>\";" +
      "document.body.appendChild(o);" +
      "var bx=document.getElementById('cr3Dx');if(bx)bx.addEventListener('click',cr3DFecha);" +
      "var av=function(t){var e=document.getElementById('cr3Dav');if(e)e.textContent=t;};" +
      "crGL().then(function(gl){" +
      "if(!document.getElementById('cr3D'))return;" +
      /* 1 worker: no iPhone o padrao sobe ate 3, e isso disputa CPU com o resto
       * do celular numa tela que e so pra olhar. */
      "try{if(gl.setWorkerCount)gl.setWorkerCount(1);}catch(e){}" +
      "var la1=1/0,la2=-1/0,ln1=1/0,ln2=-1/0;" +
      "rt.forEach(function(q){if(q.lat<la1)la1=q.lat;if(q.lat>la2)la2=q.lat;if(q.lng<ln1)ln1=q.lng;if(q.lng>ln2)ln2=q.lng;});" +
      "var mapa=new gl.Map({container:'cr3Dm',style:cr3DEstilo()," +
      "center:[(ln1+ln2)/2,(la1+la2)/2],zoom:14,pitch:62,bearing:-18," +
      "attributionControl:false,preserveDrawingBuffer:false});" +
      "o.__mapa=mapa;" +
      "var cr9=document.getElementById('cr3Dcr');if(cr9)cr9.textContent=crEstilo().a||'\\u00a9 OpenStreetMap';" +
      /* COMO SABER SE AS RUAS VIERAM.
       *
       * Nao da pra perguntar isso ao MapLibre: medido aqui, o evento 'data' com
       * .tile NAO dispara pra fonte raster nem quando o ladrilho carrega nem
       * quando falha (os eventos que apareciam eram da camada da rota, que e
       * geojson). E areTilesLoaded() fica falso enquanto o relevo nao vier,
       * mesmo com as ruas inteiras na tela.
       *
       * Entao a pergunta e feita direto: uma SONDA baixa um ladrilho do centro
       * do trajeto, com crossOrigin='anonymous' — exatamente a exigencia que o
       * MapLibre faz, porque WebGL so aceita textura CORS-limpa. Se a sonda
       * passa, as ruas vem; se falha, nao vem. Simples de entender e, o que
       * mais importa, possivel de testar nos DOIS sentidos.
       *
       * Enquanto a sonda nao respondeu, __ruasOk fica indefinido e o cronometro
       * nao acusa nada — sinal lento nao merece recado de erro. */
      "o.__erros=0;mapa.on('error',function(){o.__erros++;});" +
      "try{var so9=new Image();so9.crossOrigin='anonymous';" +
      "so9.onload=function(){o.__ruasOk=1;};so9.onerror=function(){o.__ruasOk=0;};" +
      "var e8=crEstilo(),cm9=merc((la1+la2)/2,(ln1+ln2)/2,14);" +
      "so9.src=crUrlK(e8.u,e8,14,Math.floor(cm9.x),Math.floor(cm9.y));}catch(e){}" +
      /* Passou o tempo e a sonda disse que as ruas NAO vem: fala a verdade em
       * vez de deixar a tela escura calada. O trajeto ja esta desenhado a essa
       * altura (ele entra no style.load), entao o aluno nao fica sem nada. */
      "setTimeout(function(){try{if(!document.getElementById('cr3D'))return;" +
      "if(o.__ruasOk===0){var e9=document.getElementById('cr3Dav');if(e9){" +
      "e9.style.cssText='position:absolute;left:0;right:0;bottom:64px;text-align:center;color:#cfcbdb;font-size:12.5px;padding:0 24px;';" +
      "e9.innerHTML=\"N\\u00e3o deu pra carregar as ruas<br><span style='color:#8a8695;font-size:11.5px;'>seu trajeto est\\u00e1 a\\u00ed do mesmo jeito</span>\";}}}catch(e){}},9000);" +
      /* style.load, NAO load: o 'load' so dispara quando o mapa inteiro esta
       * pronto, ladrilhos inclusive — sem internet ele nunca vem, e o aluno
       * ficaria sem ver nem o proprio trajeto. O 'style.load' vem assim que o
       * estilo existe, entao a rota aparece mesmo que nenhuma rua carregue.
       * A rota e o que importa: as ruas sao o pano de fundo. */
      "mapa.on('style.load',function(){try{" +
      "av('');" +
      "mapa.addSource('trj',{type:'geojson',data:{type:'Feature',properties:{}," +
      "geometry:{type:'LineString',coordinates:rt.map(function(q){return [q.lng,q.lat];})}}});" +
      "mapa.addLayer({id:'trjB',type:'line',source:'trj',layout:{'line-join':'round','line-cap':'round'}," +
      "paint:{'line-color':'#ffffff','line-width':9,'line-opacity':.85}});" +
      "mapa.addLayer({id:'trjA',type:'line',source:'trj',layout:{'line-join':'round','line-cap':'round'}," +
      "paint:{'line-color':CV('cor'),'line-width':5}});" +
      /* O enquadramento e feito com a camera RETA e a inclinacao entra depois:
       * o fitBounds com pitch cabe o trajeto dentro do tronco de visao
       * inclinado, que e bem maior que a tela, e o desenho sai pequeno no
       * meio. Medido: com pitch no fitBounds a volta da Pampulha ocupava um
       * terco da largura. O respiro de cima e maior por causa do titulo, e o
       * de baixo por causa do credito. */
      "mapa.fitBounds([[ln1,la1],[ln2,la2]],{padding:{top:96,bottom:104,left:34,right:34},pitch:0,bearing:0,duration:0,maxZoom:16});" +
      "mapa.easeTo({pitch:62,bearing:-18,duration:900});" +
      "}catch(e){}});" +
      "})['catch'](function(e){av('N\\u00e3o deu pra abrir o 3D: '+(e&&e.message?e.message:'tente de novo com internet'));});}" +
      "function crResumo(reg,extras){var el=crEl('crResumoF');if(!el)return;" +
      "abreCrFull(0);cr.resumo=true;" +
      "var tiles=[];" +
      "if(reg.k>0)tiles.push(crResTile(String(reg.k).replace('.',','),'quil\u00f4metros'));" +
      "tiles.push(crResTile(wodFmt(reg.s),'tempo'));" +
      "if(reg.p)tiles.push(crResTile(reg.p,'pace m\u00e9dio'));" +
      "tiles.push(crResTile(String(crKcal(reg.k||0)),'calorias'));" +
      "if(reg.fc)tiles.push(crResTile(reg.fc+' bpm','batimento m\u00e9dio'));" +
      "if(reg.fcx)tiles.push(crResTile(reg.fcx+' bpm','pico'));" +
      "el.innerHTML=\"<div style='max-width:440px;margin:0 auto;'>\"+" +
      "\"<div style='text-align:center;color:#4ade80;font-size:10.5px;font-weight:800;letter-spacing:.24em;text-transform:uppercase;'>Treino registrado</div>\"+" +
      "\"<div style='text-align:center;font-size:clamp(26px,8vw,34px);font-weight:900;letter-spacing:-.02em;line-height:1.1;margin-top:6px;'>\"+crEh(reg.n)+'</div>'+" +
      "\"<div style='text-align:center;font-size:12.5px;color:#8a8695;margin-top:4px;'>\"+(CRMODS[reg.m]||'Cardio')+' \u00b7 '+String(reg.d).slice(8,10)+'/'+String(reg.d).slice(5,7)+'</div>'+" +
      "\"<div style='display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px;'>\"+tiles.join('')+'</div>'+" +
      "((extras&&extras.length)?\"<div style='margin-top:16px;'>\"+extras.map(function(x){" +
      "return \"<div style='background:rgba(74,222,128,.12);border:1px solid rgba(74,222,128,.4);border-radius:14px;padding:10px 14px;font-size:13.5px;color:#4ade80;font-weight:700;margin-top:8px;'>\"+crEh(x)+'</div>';}).join('')+'</div>':'')+" +
      /* So aparece quando existe trajeto guardado: corrida de esteira, bike sem
       * GPS ou treino curto demais nao ganham botao que nao leva a lugar
       * nenhum. */
      "((reg.r)?\"<button type='button' id='crRs3D' style='display:block;width:100%;min-height:52px;margin-top:16px;border-radius:99px;background:var(--bg4);border:1px solid var(--bg11);color:#fff;font-family:inherit;font-size:14.5px;font-weight:800;cursor:pointer;'>Ver o trajeto em 3D</button>\":'')+" +
      "notaBox('corrida')+" +
      "\"<div style='display:flex;gap:8px;margin-top:20px;'>\"+" +
      "\"<label class='btnx' id='crRsFoto' style='flex:1;text-align:center;cursor:pointer;min-height:54px;line-height:34px;'>Postar com foto<input id='crRsArq' type='file' accept='image/*' style='display:none;'></label>\"+" +
      "\"<button type='button' id='crRsSem' style='flex:1;min-height:54px;border-radius:99px;background:var(--bg4);border:1px solid var(--bg11);color:#cfcbdb;font-family:inherit;font-size:14.5px;font-weight:800;cursor:pointer;'>S\u00f3 os n\u00fameros</button></div>\"+" +
      "\"<button type='button' id='crRsFechar' style='display:block;width:100%;min-height:50px;margin-top:10px;background:none;border:none;color:#8a8695;font-family:inherit;font-size:14.5px;font-weight:700;cursor:pointer;'>Fechar</button></div>\";" +
      "el.style.display='block';" +
      "var bf=document.getElementById('crRsFechar');if(bf)bf.addEventListener('click',crResumoFecha);" +
      "var bs=document.getElementById('crRsSem');if(bs)bs.addEventListener('click',function(){cardCorrida(null);});" +
      "var b3=document.getElementById('crRs3D');" +
      "if(b3)b3.addEventListener('click',function(){cr3DAbre(reg.r,reg.n);});" +
      "var ba=document.getElementById('crRsArq');if(ba)ba.addEventListener('change',function(){" +
      "var f=this.files&&this.files[0];this.value='';if(!f)return;" +
      "var im=new Image();var rd=new FileReader();rd.onload=function(){im.onload=function(){cardCorrida(im);};im.src=rd.result;};rd.readAsDataURL(f);});}" +
      "function crResumoFecha(){cr.resumo=false;var el=crEl('crResumoF');if(el)el.style.display='none';fechaCrFull();}" +
      "function crFinaliza(msg){var el2=cr.run?(Date.now()-cr.t0)/1000:cr.acum;if(el2<5)return;" +
      "cr.blocos=null;cr.bi=0;cr.mistoT0=null;var cb8=crEl('crBlocoBox');if(cb8)cb8.style.display='none';" +
      "clearInterval(cr.iv);cr.iv=null;cr.run=false;cr.acum=0;soltaTela();crGpsPara();" +
      "var km=crKmAtual();var med=km>0.015?(el2/60)/km:null;" +
      "var reg={d:isoHj(),n:cr.plano?cr.plano.n:'Livre \\u2014 '+(CRMODS[cr.mod]||'Cardio'),m:cr.plano?cr.plano.m:cr.mod,s:Math.round(el2),k:Math.round(km*100)/100,p:med?paceFmt(med):null};" +
      "var fcR=hrResumo();if(fcR){reg.fc=fcR.m;reg.fcx=fcR.x;}hrZera();" +
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
      "if(fcR)extras.push('Batimentos \\u00b7 '+fcR.m+' bpm m\\u00e9dio \\u00b7 '+fcR.x+' m\\u00e1x');" +
      "cr.fimReg=reg;cr.fimRota=cr.rota.slice();" +
      /* a rota entra no registro que JA foi salvo acima: por isso o Sv de
       * novo. Guardar antes exigiria mexer no calculo de recorde, que le a
       * lista sem a rota. */
      "try{var rr9=crRotaSalva(cr.rota);if(rr9){reg.r=rr9;var lz=L('ptcardio',[]);" +
      "if(lz.length&&lz[lz.length-1]&&lz[lz.length-1].d===reg.d){lz[lz.length-1].r=rr9;Sv('ptcardio',lz);}}}catch(e){}" +
      "crEl('crGo').textContent='Iniciar';crEl('crFase').textContent=msg||(extras.length?extras[0]:'BOA! Treino registrado');crEl('crFase').style.color='#4ade80';" +
      "crEl('crInfo').textContent=extras.slice(msg?0:1).join(' \\u00b7 ');" +
      "var bSh=crEl('crShare');if(bSh)bSh.style.display='block';" +
      "if(navigator.vibrate)navigator.vibrate([250,100,250,100,400]);bip(1300,350);confete();pintaCrHist();" +
      "cr.km=0;cr.ultKm=0;cr.jan=[];cr.alvoBipou=false;cr.rota=[];cr.rumo=null;cr.autoP=false;cr.lastMove=0;crEl('crKm').value='';try{desenhaRota();}catch(e){}" +
      "try{crResumo(reg,extras);}catch(e){}}" +
      /* ---------- importar do relógio (GPX/TCX) ----------
       * Todo smartwatch/band exporta o treino nesses formatos. Lê o arquivo NO
       * aparelho (nada sobe pra rede), tira km/tempo/pace/data reais e grava
       * no mesmo ptcardio das corridas do GPS — medalhas e recordes contam.
       * A ponte do app nativo (nativo/SAUDE.md) usa esta MESMA função. */
      "function crImporta(txt,rotulo,auto){var doc=null;" +
      "try{doc=new DOMParser().parseFromString(String(txt||''),'text/xml');}catch(e){}" +
      "if(!doc||doc.getElementsByTagName('parsererror').length){if(!auto)alert('Não consegui ler esse arquivo — exporta do app do relógio como GPX ou TCX.');return null;}" +
      "var pts=[];var tk=doc.getElementsByTagName('trkpt');" +
      "if(tk.length){for(var i=0;i<tk.length;i++){var p9=tk[i];var t9=p9.getElementsByTagName('time')[0];" +
      "pts.push({lat:+p9.getAttribute('lat'),lng:+p9.getAttribute('lon'),t:t9?Date.parse(t9.textContent):null,dm:null});}}" +
      "else{var tc=doc.getElementsByTagName('Trackpoint');for(var i2=0;i2<tc.length;i2++){var q9=tc[i2];" +
      "var tt=q9.getElementsByTagName('Time')[0];var la=q9.getElementsByTagName('LatitudeDegrees')[0];" +
      "var lo=q9.getElementsByTagName('LongitudeDegrees')[0];var dm=q9.getElementsByTagName('DistanceMeters')[0];" +
      "pts.push({lat:la?+la.textContent:null,lng:lo?+lo.textContent:null,t:tt?Date.parse(tt.textContent):null,dm:dm?+dm.textContent:null});}}" +
      "pts=pts.filter(function(x){return x.t;});" +
      "if(pts.length<2){if(!auto)alert('Esse arquivo veio sem os pontos do treino — tenta exportar de novo como GPX.');return null;}" +
      // distância: o TCX costuma trazer o total pronto; senão soma pelo GPS
      "var km=0;var comDm=pts.filter(function(x){return x.dm!=null;});" +
      "if(comDm.length>1){km=(comDm[comDm.length-1].dm-comDm[0].dm)/1000;}" +
      "else{for(var j=1;j<pts.length;j++){var a9=pts[j-1],b9=pts[j];" +
      "if(a9.lat!=null&&b9.lat!=null){var d9=havKm(a9,b9);if(d9<0.5)km+=d9;}}}" +
      "km=Math.round(km*100)/100;" +
      "var seg=Math.round((pts[pts.length-1].t-pts[0].t)/1000);" +
      "if(!(seg>=60)||!(km>0.1)){if(!auto)alert('Treino muito curto ou sem distância — confere se exportou o arquivo certo.');return null;}" +
      "var med=(seg/60)/km;var quando=new Date(pts[0].t);" +
      "var nomeTrk='';var nEl=doc.getElementsByTagName('name')[0];if(nEl)nomeTrk=String(nEl.textContent||'').trim().slice(0,32);" +
      "var reg={d:isoLoc(quando),n:(nomeTrk||rotulo||'Importada do relógio'),m:cr.mod||'corrida',s:seg,k:km,p:paceFmt(med)};" +
      "var lst0=L('ptcardio',[]);for(var dd0=0;dd0<lst0.length;dd0++){var x0=lst0[dd0];" +
      "if(x0&&x0.d===reg.d&&Math.abs((+x0.s||0)-reg.s)<=5&&Math.abs((+x0.k||0)-reg.k)<=0.06)return null;}" +
      "if(!auto&&!confirm('Importar: '+String(km).replace('.',',')+' km em '+wodFmt(seg)+' (pace '+reg.p+') de '+reg.d.slice(8,10)+'/'+reg.d.slice(5,7)+' como '+(CRMODS[reg.m]||'Corrida')+'?'))return null;" +
      "var lst=L('ptcardio',[]);var antes=crMedQ(lst);" +
      "var mxAnt=0,pcAnt=1/0;lst.forEach(function(x){if(x.m!=='corrida')return;var k9=+x.k||0;if(k9>mxAnt)mxAnt=k9;" +
      "if(k9>=3&&+x.s>0){var pq=(+x.s/60)/k9;if(pq<pcAnt)pcAnt=pq;}});" +
      "lst.push(reg);lst.sort(function(a,b){return String(a.d)<String(b.d)?-1:1;});if(lst.length>30)lst.shift();Sv('ptcardio',lst);" +
      "var extras=[];if(reg.m==='corrida'){var depois=crMedQ(lst);" +
      "depois.forEach(function(t8,i8){if(t8&&!antes[i8])extras.push('Medalha nova: '+CRMEDN[i8]);});" +
      "if(mxAnt&&reg.k>mxAnt)extras.push('RECORDE: sua corrida mais longa');" +
      "if(reg.k>=3&&isFinite(pcAnt)&&med<pcAnt)extras.push('RECORDE: seu melhor pace');}" +
      "if(!auto){crEl('crFase').textContent='RELÓGIO IMPORTADO — '+String(km).replace('.',',')+' km registrados';crEl('crFase').style.color='#4ade80';" +
      "crEl('crInfo').textContent=extras.join(' · ');" +
      "if(extras.length)confete();if(navigator.vibrate)navigator.vibrate([150,80,150]);}" +
      "pintaCrHist();return reg;}" +
      "window.__crImporta=crImporta;" +
      "(function(){var inp=crEl('crImp');if(!inp)return;inp.addEventListener('change',function(){" +
      "var f=this.files&&this.files[0];this.value='';if(!f)return;" +
      "var rd=new FileReader();rd.onload=function(){crImporta(String(rd.result||''),f.name.replace(/\\.(gpx|tcx|xml)$/i,''));};" +
      "rd.readAsText(f);});})();" +
      "function crGpsPara(){if(cr.watch!=null&&navigator.geolocation){navigator.geolocation.clearWatch(cr.watch);}cr.watch=null;cr.gpsOn=false;cr.lastPos=null;" +
      "var b=crEl('crGps');b.innerHTML='Ligar<br>GPS';b.style.borderColor='var(--bg11)';b.style.color='#a9a4b5';try{desenhaRota();}catch(e){}}" +
      // GPS sempre ativo: liga sozinho ao entrar na área de cardio (preferência ptgpsAuto, padrão ligado)
      "var crGpsNeg=false;" +
      "function crGpsLiga(auto){if(cr.watch!=null)return;if(auto&&crGpsNeg)return;" +
      "if(!navigator.geolocation){if(!auto)crEl('crInfo').textContent='Esse aparelho n\\u00e3o tem GPS dispon\\u00edvel \\u2014 digite os km na m\\u00e3o.';return;}" +
      "var b=crEl('crGps');b.innerHTML='GPS\\u2026';" +
      "cr.watch=navigator.geolocation.watchPosition(function(pos){" +
      // tela 51: o botão vira o TERMÔMETRO do sinal (bom/ok/fraco pela precisão)
      "cr.gpsOn=true;crGpsNeg=false;var ac9=pos.coords?pos.coords.accuracy:null;" +
      "b.innerHTML=ac9==null?'GPS ligado':ac9<=30?'GPS<br>bom':ac9<=70?'GPS<br>ok':'GPS<br>fraco';" +
      "var cq9=ac9!=null&&ac9>70?'#fbbf24':'#4ade80';b.style.borderColor=cq9;b.style.color=cq9;" +
      "if(pos.coords.accuracy>40)return;var pt={lat:pos.coords.latitude,lng:pos.coords.longitude};" +
      /* rumo do proprio aparelho, quando ele da: so vale em movimento
       * (speed acima de 0,7 m/s, ~2,5 km/h). Parado o heading do GPS gira
       * sozinho e a seta ficaria rodopiando no semaforo. Sem isso, o
       * crRumo() calcula pelo trajeto. */
      "var hd9=pos.coords.heading,sp9=pos.coords.speed;" +
      "if(hd9!=null&&isFinite(hd9)&&sp9!=null&&sp9>0.7)cr.rumo=hd9;" +
      "else if(sp9!=null&&sp9<=0.3)cr.rumo=null;" +
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
      "cr.plano=null;cr.mod=b.dataset.crmod;cr.alvoBipou=false;cr.mistoT0=null;crChips();pintaCr();});" +
      "document.addEventListener('click',function(e){var b=e.target.closest('[data-cbstart]');if(!b)return;" +
      "var p3=null;CARDIOS.forEach(function(x){if(x.id===b.dataset.cbstart)p3=x;});if(!p3)return;" +
      "clearInterval(cr.iv);cr.iv=null;cr.run=false;cr.acum=0;cr.km=0;cr.ultKm=0;cr.jan=[];cr.alvoBipou=false;cr.plano=p3;cr.mod=p3.m;" +
      "cr.blocos=null;cr.bi=0;cr.bt0=0;cr.bkm0=0;cr.mistoT0=null;" +
      "crEl('crGo').textContent='Iniciar';crChips();crAutoGps();pintaCr();crEl('crTela').scrollIntoView({behavior:'smooth',block:'center'});});" +
      /* ---------- player guiado por blocos ----------
       * O treino prescrito vira uma FILA de blocos: aquecimento, o miolo
       * (rodagem ou os tiros) e a volta à calma. Cada bloco acaba pelo tempo
       * OU pela distância, e a troca fala em voz alta e vibra — o aluno não
       * precisa olhar a tela. Aquecer e desaquecer entram sozinhos, do mesmo
       * jeito que o aquecimento da musculação já entra (o professor prescreve
       * o miolo; a moldura é do app), e o aluno desliga na engrenagem. */
      "var AQ_SEG=300,VC_SEG=180;" +
      "function crMMSS(sg){sg=Math.max(0,Math.round(sg));return Math.floor(sg/60)+':'+('0'+(sg%60)).slice(-2);}" +
      /* A fila de blocos do treino guiado. 'misto' e o pedido do professor: o
       * MESMO treino tem uma parte continua E os tiros. Ela entra como continuo
       * PRIMEIRO e tiros depois — e a ordem que o corpo aguenta. */
      "function crMontaBlocos(p){if(!p||!crCfg().bl)return null;" +
      "var b=[{k:'aq',n:'Aquecimento',d:'ritmo leve — dá pra conversar',s:AQ_SEG}];" +
      "var temC=p.t==='continuo'||p.t==='misto',temI=p.t==='intervalado'||p.t==='misto';" +
      "if(!temC&&!temI)temC=true;" +
      "if(temC){var alvo=[];if(p.d)alvo.push(p.d+' km');if(p.tp)alvo.push(p.tp+' min');if(p.p)alvo.push('pace '+p.p);" +
      "b.push({k:'c',n:p.t==='misto'?'Parte contínua':(p.n||'Rodagem'),d:alvo.join(' · ')||'no seu ritmo',s:(+p.tp||0)*60,km:+p.d||0});}" +
      "if(temI){for(var i=0;i<p.r;i++){" +
      "b.push({k:'f',n:'Tiro '+(i+1)+' de '+p.r,d:'forte',s:p.ti});" +
      "b.push({k:'l',n:'Leve '+(i+1)+' de '+p.r,d:'recupera',s:p.de});}}" +
      "b.push({k:'vc',n:'Volta à calma',d:'solta o corpo e respira',s:VC_SEG});return b;}" +
      "function crBlocoAtual(){return cr.blocos?cr.blocos[cr.bi]:null;}" +
      // aviso do bloco novo: voz quando o aluno escolheu voz, senão bipe
      "function crAvisaBloco(b2){if(!b2)return;var fb9=crCfg().fb;" +
      "var forte=b2.k==='f';if(navigator.vibrate)navigator.vibrate(forte?[90,60,90,60,90]:[180]);" +
      "var falou=fb9==='voz'&&crFala(b2.n+'. '+(b2.d||''));" +
      "if(!falou&&fb9!=='off')bip(forte?1150:640,220);}" +
      "function crAvanca(modo){var ant=cr.blocos[cr.bi];cr.bi++;" +
      "if(cr.bi>=cr.blocos.length){cr.bi=cr.blocos.length-1;crFinaliza('TREINO GUIADO COMPLETO!');return false;}" +
      "var agora=(Date.now()-cr.t0)/1000;" +
      "cr.bt0=(modo==='t'&&ant&&ant.s)?((cr.bt0||0)+ant.s):agora;" +
      "cr.bkm0=(modo==='k'&&ant&&ant.km)?((cr.bkm0||0)+ant.km):cr.km;" +
      "crAvisaBloco(crBlocoAtual());return true;}" +
      "function crPulaBloco(){if(!cr.blocos)return;if(crAvanca(''))pintaCr();}" +
      "function crTrilhoPinta(){var tr=crEl('crTrilho');if(!tr||!cr.blocos)return;" +
      "tr.innerHTML=cr.blocos.map(function(b3,i3){" +
      "var cor=i3<cr.bi?'rgba(255,255,255,.85)':(i3===cr.bi?'#fff':'rgba(255,255,255,.22)');" +
      "return \"<i style='flex:1;height:4px;border-radius:99px;background:\"+cor+\";'></i>\";}).join('');}" +
      // desenha o bloco de agora e decide se ele já acabou (tempo OU distância)
      "function crBlocos(el2,km){var cx=crEl('crBlocoBox');" +
      "if(!cr.blocos){if(cx)cx.style.display='none';return false;}" +
      // acerta a fila inteira: quem deixou o celular no bolso volta minutos depois
      "if(cr.run){var giro=0;while(cr.blocos&&giro++<60){var bx=cr.blocos[cr.bi];if(!bx)break;" +
      "var pkX=!!(bx.km&&cr.gpsOn);" +
      "var fimX=pkX?((km-(cr.bkm0||0))>=bx.km):(!!bx.s&&(el2-(cr.bt0||0))>=bx.s);" +
      "if(!fimX)break;if(!crAvanca(pkX?'k':'t'))return 2;}}" +
      "var b4=crBlocoAtual();" +
      "if(!b4){if(cx)cx.style.display='none';return false;}" +
      "if(cx)cx.style.display='block';" +
      "var pas=el2-(cr.bt0||0),falta=b4.s?Math.max(0,b4.s-pas):0;" +
      "var fkm=b4.km?Math.max(0,b4.km-(km-(cr.bkm0||0))):0;" +
      "crTrilhoPinta();" +
      "var bd=crEl('crBlocoD'),bt=crEl('crBlocoT');" +
      "var prox=cr.blocos[cr.bi+1];" +
      "if(bd)bd.textContent=prox?('depois: '+prox.n):'último bloco';" +
      "var porKm=!!(b4.km&&cr.gpsOn);" +
      "if(bt)bt.textContent=porKm?(String(Math.round(fkm*100)/100).replace('.',',')+' km'):(b4.s?crMMSS(falta):'livre');" +
      "if(!porKm&&b4.s&&falta<=3.05&&falta>0.05&&cr.run)crCd(falta);" +
      "return true;}" +
      "function crLarga(){hrZera();cr.run=true;cr.autoP=false;cr.t0=Date.now()-cr.acum*1000;crEl('crGo').textContent='Pausar';ligaTela();bip(880,110);" +
      "var bS8=crEl('crShare');if(bS8)bS8.style.display='none';" +
      "if(!cr.blocos&&cr.acum<1){cr.blocos=crMontaBlocos(cr.plano);cr.bi=0;cr.bt0=0;cr.bkm0=0;" +
      "if(cr.blocos)crAvisaBloco(crBlocoAtual());}" +
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
      "\"<label style='display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:13px;padding:7px 0;border-bottom:1px dashed var(--bg11);'>Estilo do mapa<select id='crCfgMp' style='width:120px;'>\"+" +
      "[['auto','Autom\\u00e1tico']].concat(Object.keys(CRMAPS).map(function(k9){return [k9,CRMAPS[k9].n];}))" +
      ".map(function(o){return \"<option value='\"+o[0]+\"'\"+(c.mp===o[0]?' selected':'')+'>'+o[1]+'</option>';}).join('')+'</select></label>'+" +
      "\"<label style='display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:13px;padding:7px 0;border-bottom:1px dashed var(--bg11);'>Contagem regressiva<select id='crCfgCd' style='width:120px;'>\"+" +
      "[0,3,5,10].map(function(v){return \"<option value='\"+v+\"'\"+(c.cd===v?' selected':'')+'>'+(v?v+' segundos':'Desligada')+'</option>';}).join('')+'</select></label>'+" +
      "\"<label style='display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:13px;padding:7px 0;border-bottom:1px dashed var(--bg11);'>Aviso a cada km<select id='crCfgFb' style='width:120px;'>\"+" +
      "[['voz','Voz'],['bip','Bipe'],['off','Desligado']].map(function(o){return \"<option value='\"+o[0]+\"'\"+(c.fb===o[0]?' selected':'')+'>'+o[1]+'</option>';}).join('')+'</select></label>'+" +
      "\"<label style='display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:13px;padding:7px 0;border-bottom:1px dashed var(--bg11);'>Pausa autom\\u00e1tica (com GPS)<input type='checkbox' id='crCfgAp' style='width:18px;height:18px;'\"+(c.ap?' checked':'')+'>'+'</label>'+" +
      "\"<label style='display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:13px;padding:7px 0;'><span>Aquecimento e volta \\u00e0 calma<span style='display:block;font-size:11px;color:#6e6a78;'>5 min antes e 3 min depois, guiados por voz</span></span><input type='checkbox' id='crCfgBl' style='width:18px;height:18px;flex:none;'\"+(c.bl?' checked':'')+'>'+'</label>';" +
      "['crCfgMp','crCfgCd','crCfgFb','crCfgAp','crCfgBl'].forEach(function(id2){crEl(id2).addEventListener('change',function(){" +
      "Sv('ptcrCfg',{cd:+crEl('crCfgCd').value,fb:crEl('crCfgFb').value,ap:crEl('crCfgAp').checked?1:0,mp:crEl('crCfgMp').value,bl:crEl('crCfgBl').checked?1:0});" +
      "crMapaErro=0;" +
      "try{desenhaRota();}catch(e9){}});});}" +
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
      // Descartar (tela 40): confirma e joga fora — é o Zerar com aviso
      "var crDs=crEl('crDescarta');if(crDs)crDs.addEventListener('click',function(){" +
      "if(!confirm('Descartar esta corrida? Nada será salvo.'))return;crEl('crZera').click();});" +
      "crEl('crZera').addEventListener('click',function(){clearInterval(cr.iv);cr.iv=null;cr.run=false;cr.acum=0;cr.km=0;cr.ultKm=0;cr.jan=[];cr.alvoBipou=false;" +
      "cr.blocos=null;cr.bi=0;cr.bt0=0;cr.bkm0=0;var cb9=crEl('crBlocoBox');if(cb9)cb9.style.display='none';" +
      "cr.rota=[];cr.autoP=false;cr.lastMove=0;if(cr.cdIv){clearInterval(cr.cdIv);cr.cdIv=null;crEl('crContagem').style.display='none';var fZ=crEl('crContagemF');if(fZ)fZ.style.display='none';}soltaTela();crGpsPara();" +
      "crEl('crGo').textContent='Iniciar';crEl('crKm').value='';crEl('crFase').style.color='#a9a4b5';" +
      "var bS7=crEl('crShare');if(bS7)bS7.style.display='none';desenhaRota();pintaCr();});" +
      "crEl('crKm').addEventListener('input',function(){if(!cr.gpsOn)pintaCr();});" +
      // arte da corrida (1080x1350): trajeto em branco sobre a cor da marca,
      // km gigante, tempo/pace e o nome do studio — share nativo ou download
      /* A arte da corrida sai em dois sabores: sobre a FOTO que o aluno escolher
       * (estilo Strava — a foto \u00e9 lida no aparelho e nunca sai dele) ou sobre o
       * gradiente da cor do studio. Com foto entram os v\u00e9us escuros em cima e
       * embaixo e a sombra no tra\u00e7ado, sen\u00e3o linha branca some em c\u00e9u claro. */
      "function cardCorrida(foto,soCanvas){var rg=cr.fimReg;if(!rg)return null;" +
      "var c=document.createElement('canvas');c.width=1080;c.height=1350;var g=c.getContext('2d');" +
      "if(foto){var rz=Math.max(1080/(foto.width||1),1350/(foto.height||1));" +
      "var w9=(foto.width||1)*rz,h9=(foto.height||1)*rz;" +
      "g.drawImage(foto,(1080-w9)/2,(1350-h9)/2,w9,h9);" +
      "g.fillStyle='rgba(10,8,14,.26)';g.fillRect(0,0,1080,1350);" +
      "var gv=g.createLinearGradient(0,740,0,1350);gv.addColorStop(0,'rgba(10,8,14,0)');gv.addColorStop(1,'rgba(10,8,14,.9)');g.fillStyle=gv;g.fillRect(0,740,1080,610);" +
      "var gt=g.createLinearGradient(0,0,0,230);gt.addColorStop(0,'rgba(10,8,14,.55)');gt.addColorStop(1,'rgba(10,8,14,0)');g.fillStyle=gt;g.fillRect(0,0,1080,230);}" +
      "else{var gr=g.createLinearGradient(0,0,1080,1350);gr.addColorStop(0,CV('bg4'));gr.addColorStop(1,CV('cor'));g.fillStyle=gr;g.fillRect(0,0,1080,1350);}" +
      "var rt=cr.fimRota||[];var temRota=rt.length>1;" +
      "if(temRota){var la1=1/0,la2=-1/0,lo1=1/0,lo2=-1/0;rt.forEach(function(pp){if(pp.lat<la1)la1=pp.lat;if(pp.lat>la2)la2=pp.lat;if(pp.lng<lo1)lo1=pp.lng;if(pp.lng>lo2)lo2=pp.lng;});" +
      "var dLa=Math.max(la2-la1,1e-5),dLo=Math.max(lo2-lo1,1e-5);var zz=Math.min(700/dLo,520/dLa);" +
      "if(foto){g.shadowColor='rgba(0,0,0,.65)';g.shadowBlur=18;}" +
      "g.strokeStyle='rgba(255,255,255,.96)';g.lineWidth=16;g.lineJoin='round';g.lineCap='round';g.beginPath();" +
      "rt.forEach(function(pp,i9){var x9=190+(pp.lng-lo1)*zz+(700-dLo*zz)/2;var y9=830-(pp.lat-la1)*zz-(520-dLa*zz)/2;if(i9)g.lineTo(x9,y9);else g.moveTo(x9,y9);});g.stroke();g.shadowBlur=0;}" +
      "g.textAlign='center';g.fillStyle='rgba(255,255,255,.85)';g.font='700 40px system-ui,sans-serif';g.fillText(STUDIO.toUpperCase().slice(0,30),540,120);" +
      "var yK=temRota?1010:660;" +
      "g.fillStyle='#fff';g.font='900 170px system-ui,sans-serif';" +
      "g.fillText(rg.k>0?(String(rg.k).replace('.',',')+' km'):wodFmt(rg.s),540,yK);" +
      "g.font='600 52px system-ui,sans-serif';g.fillStyle='rgba(255,255,255,.9)';" +
      "var lin2=rg.k>0?(wodFmt(rg.s)+(rg.p?' \\u00b7 pace '+rg.p:'')):'';" +
      "if(rg.fc)lin2+=(lin2?' \\u00b7 ':'')+rg.fc+' bpm';" +
      "g.fillText(lin2+(lin2?' \\u00b7 ':'')+(CRMODS[rg.m]||'Cardio'),540,yK+95);" +
      "g.font='700 36px system-ui,sans-serif';g.fillStyle='rgba(255,255,255,.75)';" +
      "g.fillText(PRIMEIRO+' \\u00b7 '+String(rg.d).slice(8,10)+'/'+String(rg.d).slice(5,7),540,1250);" +
      "if(soCanvas)return c;" +
      /* A arte passa pela MESMA prévia do fim do treino (arteMostra): o
       * navigator.share tem que sair do TOQUE do aluno. Antes o share era
       * chamado dentro do toBlob (assíncrono) e o iPhone recusava calado —
       * o aluno tocava em compartilhar e não acontecia nada. */
      "arteMostra(c,'corrida.png');return null;}" +
      "window.__crCard=function(im){return cardCorrida(im,true);};" +
      "crEl('crShare').addEventListener('click',function(e){if(e.target.closest('[data-crsem]'))cardCorrida(null);});" +
      "crEl('crShareArq').addEventListener('change',function(){var f=this.files&&this.files[0];this.value='';if(!f)return;" +
      "var u=URL.createObjectURL(f);var im=new Image();" +
      "im.onload=function(){URL.revokeObjectURL(u);cardCorrida(im);};" +
      "im.onerror=function(){URL.revokeObjectURL(u);alert('N\u00e3o consegui abrir essa foto \u2014 tenta outra.');};" +
      "im.src=u;});" +
      // tela cheia estilo NRC: página 0 = painel de cor chapada com a métrica gigante,
      // página 1 = mapa; pausado força o mapa + grade de métricas; ✕ volta sem parar
      // o crFull vai pro <body> na primeira abertura: dentro do card, a animação de entrada
      // da seção (transform) prende o position:fixed e a tela cheia sai clipada
      "function abreCrFull(pg){var f=crEl('crFull');if(!f)return;if(f.parentElement!==document.body)document.body.appendChild(f);" +
      "if(pg===0||pg===1)cr.pagF=pg;f.style.display='block';crFullDim();espelhaCr();try{desenhaRota();}catch(e){}}" +
      "function fechaCrFull(){var f=crEl('crFull');if(!f)return;f.style.display='none';cr.lockF=false;crEl('crLockOverF').style.display='none';}" +
      "var GIGAS=[['km','QUIL\\u00d4METROS'],['tempo','TEMPO'],['pace','PACE M\\u00c9DIO'],['kcal','CALORIAS']];" +
      /* Tela por zona de batimento: com a cinta ligada, o fundo da tela cheia
       * passa a ser a cor da zona (Z1 azul ... Z5 vermelho) e a voz avisa a
       * troca. Sem cinta, hrSuporta()/HR.on são falsos e a tela segue como
       * sempre foi — mesma regra honesta do resto do batimento. */
      "var crZAnt=-1,crZDesde=0;" +
      "function crZonaPinta(mapaAberto){var pf=crEl('crPainelF');if(!pf)return;" +
      "var z=(HR.on&&HR.bpm>0)?hrZ(HR.bpm):-1;" +
      "var fx=crEl('crZonaFx');" +
      "if(z<0){if(crZAnt!==-1){pf.style.background='linear-gradient(165deg,var(--cor) 0%,var(--cor) 58%,var(--corc) 175%)';crZAnt=-1;}" +
      "if(fx)fx.style.display='none';return;}" +
      "if(z!==crZAnt){" +
      "pf.style.background='linear-gradient(165deg,'+HRZC[z]+' 0%,'+HRZC[z]+' 58%,rgba(255,255,255,.35) 210%)';" +
      // a voz só entra depois que a zona se firma, senão fala a cada batida
      "if(crZAnt>=0&&cr.run&&Date.now()-crZDesde>12000){var fb8=crCfg().fb;" +
      "if(navigator.vibrate)navigator.vibrate(z>crZAnt?[70,50,70]:[160]);" +
      "var falou8=fb8==='voz'&&crFala('Zona '+(z+1)+'. '+HRZN[z].split(' ').slice(1).join(' '));" +
      "if(!falou8&&fb8!=='off')bip(z>crZAnt?1100:640,180);}" +
      "crZAnt=z;crZDesde=Date.now();}" +
            // com o fundo colorido da zona, a faixa do bloco em ciano some — vai a branco
      "var ff=crEl('crFaseF');if(ff)ff.style.color='#fff';" +
      "if(fx){fx.style.display=mapaAberto?'none':'block';" +
      "fx.innerHTML=\"<b style='font-size:13px;font-weight:900;letter-spacing:.16em;text-transform:uppercase;'>\"+HRZN[z]+'</b>'+" +
      "\"<span style='display:block;font-size:11.5px;opacity:.85;margin-top:2px;'>\"+HR.bpm+' bpm \u00b7 '+Math.round(100*HR.bpm/hrMax())+'% da m\u00e1xima</span>';}}" +
      "function espelhaCr(){if(!crFullAberto()||cr.resumo)return;" +
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
      "try{crZonaPinta(mapa);}catch(e){}" +
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
      "var bp9=crEl('crPulaF');if(bp9)bp9.addEventListener('click',function(){if(cr.blocos)crPulaBloco();});" +
      "crChips();pintaCr();pintaCrHist();desenhaRota();window.__cr=cr;window.__pintaCr=pintaCr;window.__crRota=desenhaRota;" +
      "window.__crGuia={monta:crMontaBlocos,pula:crPulaBloco,atual:crBlocoAtual};" +
      "window.__crMapa={estilos:CRMAPS,url:crUrl,urlK:crUrlK,estilo:crEstiloId,dpr:crDpr,tiles:crTiles,tile:crTile,erro:function(){return crMapaErro;}," +
      "rota:{cod:crEncPoly,dec:crDecPoly,simpl:crSimpl,salva:crRotaSalva}," +
      "abre3D:cr3DAbre,fecha3D:cr3DFecha,estilo3D:cr3DEstilo,motor:function(){return crGL();}," +
      "desenha:desenhaRota,rumo:crRumo,bear:crBear," +
      /* gancho de teste: encena um estado de corrida (correndo, rota, rumo)
       * sem precisar de GPS de verdade. */
      "set:function(o){for(var k9 in o)cr[k9]=o[k9];}};" +
      "}" +
      "var tmrI=null;function tmrFmt(s){return s>=90?(Math.floor(s/60)+':'+('0'+(s%60)).slice(-2)):(s+'s');}" +
      /* Os cronômetros de descanso contam pelo RELÓGIO (deadline), não por
       * decremento: em segundo plano o navegador estrangula o setInterval e o
       * contador travava. Com deadline, ao voltar pro app o mostrador recalcula
       * na hora (listener de visibilitychange lá embaixo). E se o fim chegar com
       * o app escondido, avisaFim manda a notificação local — mesmo padrão do
       * lembrete de água, só com permissão JÁ dada, nunca pedindo de novo. */
      "var tmrTick=null,gDescTick=null;" +
      "function avisaFim(txt){try{if(!document.hidden)return;if('Notification'in window&&Notification.permission==='granted'&&navigator.serviceWorker)navigator.serviceWorker.ready.then(function(reg){reg.showNotification('TORQUE \\u2014 treino',{body:txt});}).catch(function(){});}catch(e){}}" +
      "function iniciaTmr(sg,rot){var bar=document.getElementById('tmrBar');clearInterval(tmrI);ligaTela();" +
      "var tit=rot||'Descanso';var fim=Date.now()+sg*1000,ult=sg,meuId=null;" +
      "bar.style.display='block';bar.textContent=tit+': '+tmrFmt(sg);" +
      "tmrTick=function(){if(tmrI!==meuId)return;var resta=Math.max(0,Math.ceil((fim-Date.now())/1000));if(resta===ult)return;ult=resta;" +
      "if(resta<=0){clearInterval(tmrI);tmrI=null;tmrTick=null;bar.textContent=rot?('Feito! '+rot):'Bora! Próxima série!';" +
      "if(navigator.vibrate)navigator.vibrate([200,100,200]);bip(1300,300);avisaFim(rot?('Feito! '+rot):'Descanso acabou — bora!');setTimeout(function(){bar.style.display='none';},2200);}" +
      "else{bar.textContent=tit+': '+tmrFmt(resta);if(resta<=3)bip(600,100);}};" +
      "meuId=tmrI=setInterval(tmrTick,1000);}" +
      "pintaSets();" +
      // modo treino guiado: conduz série a série; a série 'feita' clica no setbtn
      // real do exercício, reaproveitando toda a lógica existente (dia completo etc.)
      // GUIA enriquecido DENTRO do builder: grupo, dica e recado do professor já
      // vêm em fichasApp, então o pacote do aluno não engorda nem um byte e
      // ninguém precisa republicar pra ganhar o player novo.
      "var GUIA=" + jsonApp((function () {
        var extra = (fichasApp || []).map(function (f) {
          return (f.itens || []).map(function (it) {
            return { g: it.grupo || "", dc: it.desc || "", ob: it.obs || "", tc: it.tec || "", al: (it.alts || []).slice(0, 2) };
          });
        });
        // parte 2 do dia: entra no recibo do fim do treino ("ainda falta o A2")
        var p2s = (fichasApp || []).map(function (f, fi) {
          var l2 = (f.p2 && f.p2.l) || [];
          if (!l2.length) return null;
          var parP = String(f.titulo || "").split("—");
          var letP = parP.length > 1 ? parP[0].trim().slice(0, 2) : String.fromCharCode(65 + fi);
          return { k: letP + "2 · " + ((f.p2 && f.p2.n) || "Cardio e alongamento"),
            l: l2.map(function (ln) { return { t: ln.t, v: ln.v || "" }; }) };
        });
        return (guiaFichasP || []).map(function (f, fi) {
          // al (alternativas) e aq (aquecimento) entram como chaves FINAIS de
          // propósito: o teste de escape do GUIA olha os 500 primeiros chars
          return { n: f.n, p2: p2s[fi] || null, it: (f.it || []).map(function (it, ii) {
            var x = (extra[fi] || [])[ii] || {};
            return { e: it.e, s: it.s, r: it.r, d: it.d, v: it.v, g: x.g || "", dc: x.dc || "", ob: x.ob || "", tc: x.tc || "", al: x.al || [] };
          }), aq: (aqPorFicha[fi] && aqPorFicha[fi].length > 1) ? aqPorFicha[fi] : null };
        });
      })()) + ";" +
      "var TECS_G=" + jsonApp(TECS_APP) + ";" +
      "function gPoeTec(it){var el=gEl('gTec');if(!el)return;var t=TECS_G[(it&&it.tc)||''];" +
      "if(!t){el.style.display='none';el.innerHTML='';return;}" +
      "el.style.display='block';el.innerHTML=\"<span class='tecchip'>\"+esc2(t[0])+\"</span> <span style='color:#8a8695;font-size:12.5px;'>\"+esc2(t[1])+'</span>';}" +
      "function beepG(){try{var ac=new (window.AudioContext||window.webkitAudioContext)();var o=ac.createOscillator(),ga=ac.createGain();" +
      "o.connect(ga);ga.connect(ac.destination);o.frequency.value=880;ga.gain.value=.25;o.start();" +
      "setTimeout(function(){o.frequency.value=1320;},180);setTimeout(function(){o.stop();ac.close();},380);}catch(e){}}" +
      // gv.feitas guarda quantas séries de cada exercício já foram marcadas nesta
      // sessão do player (pra barra e pros blocos sobreviverem ao voltar exercício)
      "var gv={mexe:false,f:0,e:0,s:0,timer:null,pend:false,feitas:{},cargas:{},t0:0,tex:0,relo:null,sujo:false,fim:false};" +
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
      "function gnum(v){return String(Math.round(v*100)/100).replace('.',',');}" +
      "function gultimo(ex){var l=(L('ptdc',{})[ex]||[]);return l.length?l[l.length-1]:null;}" +
      /* Peso sugerido na série: se da última vez o aluno BATEU as repetições
       * prescritas naquela carga (e não acabou de subir), o app sugere o
       * próximo degrau. O campo continua nascendo na carga de sempre — a
       * sugestão é um botão que o aluno toca se quiser; nada sobe sozinho. */
      "function gPasso(kg){return kg<20?1:2.5;}" +
      "function gSugereKg(ex,repsAlvo){var l=(L('ptdc',{})[ex]||[]);if(!l.length)return 0;" +
      "var u=l[l.length-1];var kg=+u.kg||0;if(kg<=0)return 0;" +
      "var alvo=parseInt(repsAlvo,10)||0;if(!alvo)return 0;" +
      "if((+u.r||0)<alvo)return 0;" +
      // acabou de subir no treino passado: deixa consolidar antes de subir de novo
      "if(l.length>=2&&+l[l.length-2].kg<kg)return 0;" +
      "return Math.round((kg+gPasso(kg))*100)/100;}" +
      "window.__gSugere=gSugereKg;" +
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
      // recorde compara com TUDO que veio antes, menos a anotação de hoje que
      // está sendo corrigida (senão editar a carga de hoje nunca vira recorde)
      "var maxA=0;for(var k9=0;k9<l.length;k9++){if(k9!==i&&+l[k9].kg>maxA)maxA=+l[k9].kg;}" +
      "if(i>=0)l[i]=reg;else l.push(reg);" +
      "if(l.length>60)l.shift();h[ex]=l;Sv('ptdc',h);" +
      "gv.cargas[ex]=kg;try{gFesteja(ex,kg,maxA,l);}catch(e2){}return true;}" +
      "window.__gGrava=gGrava;" +
      // festinha do recorde e sugestão de progressão — vinham do diário manual
      // (removido a pedido do Raphael); agora acompanham quem salva pelo player
      "function gFesteja(ex,kg,maxA,l){" +
      "if(maxA>0&&kg>maxA){if(navigator.vibrate)navigator.vibrate([120,60,220]);try{confete();}catch(e9){}" +
      "var t=document.createElement('div');t.style.cssText='position:fixed;top:16px;left:50%;transform:translateX(-50%);background:linear-gradient(90deg,var(--cor),var(--corc));color:#fff;padding:13px 20px;border-radius:13px;font-weight:800;z-index:80;text-align:center;';" +
      "t.innerHTML=icx(ICO.estrela,20)+' NOVO RECORDE!<br><small>'+esc2(ex)+': '+gnum(kg)+' kg</small>';document.body.appendChild(t);setTimeout(function(){t.remove();},3500);return;}" +
      // progressão sugerida (estilo Hevy): 3 registros seguidos na MESMA carga → hora de subir
      "var ult3=l.slice(-3);if(ult3.length===3&&ult3.every(function(x){return +x.kg===kg;})){" +
      "var sug=kg<20?1:2.5;var t2=document.createElement('div');" +
      "t2.style.cssText='position:fixed;top:16px;left:50%;transform:translateX(-50%);background:linear-gradient(90deg,#0891b2,#22d3ee);color:#fff;padding:13px 20px;border-radius:13px;font-weight:800;z-index:80;text-align:center;';" +
      "t2.innerHTML=icx(ICO.alta,20)+' 3 treinos em '+gnum(kg)+' kg!<br><small>Bora tentar '+gnum(kg+sug)+' kg no próximo?</small>';" +
      "document.body.appendChild(t2);setTimeout(function(){t2.remove();},4500);window.__sugestaoProg=kg+sug;}}" +
      // gv.reg diz de QUEM é o formulário aberto: na repescagem o exercício não é
      // o gv.e, e sem isso a carga ia parar no exercício errado
      "function gSalvaSeSujo(){if(!gv.sujo)return;gv.sujo=false;" +
      "var c=gEl('gKg'),r=gEl('gReps');if(!c||!gv.reg)return;" +
      "gGrava(gv.reg,parseFloat(String(c.value).replace(',','.')),r?parseFloat(r.value):0,gv.regi);}" +
      // ---------- abrir / fechar ----------
      "function abreGuia(fi,ei){var f=GUIA[fi];if(!f||!f.it.length)return;clearInterval(gv.timer);clearInterval(gv.relo);" +
      "gv={f:fi,e:Math.min(+ei||0,f.it.length-1),s:0,timer:null,pend:false,feitas:{},cargas:{},t0:Date.now(),tex:Date.now(),relo:null,sujo:false,fim:false};" +
      "ligaTela();gEl('guiaBox').style.display='flex';gEl('guiaBox').classList.remove('festa');document.body.style.overflow='hidden';" +
      "gEl('gCard').classList.remove('recibo');" +
      "gEl('gVoltaEx').style.display='';gEl('gPularEx').style.display='';" +
      // gPular e gMais15 agora são fixos na barra do rodapé — só o gSerie volta
      "gEl('gPe').innerHTML=\"<button class='prin' id='gSerie'>Série feita ✓</button>\";" +
      "hrZera();gv.relo=setInterval(gTicRelo,1000);gTicRelo();pintaGuia();}" +
      "function fechaGuia(){gSalvaSeSujo();clearInterval(gv.timer);clearInterval(gv.relo);" +
      "gEl('guiaBox').classList.remove('resta');" +
      "var vb=gEl('gVideo');if(vb){var bx=vb.nextElementSibling;if(bx&&bx.classList.contains('vidbox')){bx.innerHTML='';bx.style.display='none';}}" +
      "gEl('guiaBox').style.display='none';gEl('guiaBox').classList.remove('festa');document.body.style.overflow='';soltaTela();}" +
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
      // o centro do topo mostra o TREINO (tela 47), não a marca do studio
      "var gm9=document.querySelector('#guiaBox .gmarca');if(gm9)gm9.textContent=String(f.n||'').toUpperCase().replace('—','·');" +
      "pintaBarra();}" +
      "function esc2(t){return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}" +
      "function gBlocos(mini){var f=GUIA[gv.f],it=f.it[gv.e],h='';" +
      "for(var i=1;i<=it.s;i++){var c=i<=gv.s?'ok':(i===gv.s+1?'now':'');" +
      "h+=\"<i class='\"+c+\"'>\"+(i<=gv.s?'✓':i)+'</i>';}" +
      "return \"<div class='gsets\"+(mini?' mini':'')+\"'>\"+h+'</div>';}" +
      "function gHistTxt(ex){var u=gultimo(ex),rc=grecorde(ex);" +
      "if(!u)return 'Primeira vez nesse exercício.';" +
      "return 'última vez '+gnum(u.kg)+' kg'+(+u.r>0?' × '+u.r:'')+(rc?' · recorde '+gnum(rc)+' kg':'');}" +
      // ---------- diário agrupado por dia (tiles e card 'NA ÚLTIMA VEZ') ----------
      "function gDias(ex){var l=(L('ptdc',{})[ex]||[]),m={};l.forEach(function(x){(m[x.d]=m[x.d]||[]).push(x);});" +
      "return {m:m,ds:Object.keys(m).sort()};}" +
      // a 'última vez' de verdade é a sessão ANTERIOR a hoje; sem ela, vale a mais recente
      "function gUltDia(ex){var g=gDias(ex),hj=isoHj();" +
      "for(var i=g.ds.length-1;i>=0;i--){if(g.ds[i]<hj)return {d:g.ds[i],l:g.m[g.ds[i]]};}" +
      "return g.ds.length?{d:g.ds[g.ds.length-1],l:g.m[g.ds[g.ds.length-1]]}:null;}" +
      /* histórico rápido (v685): os dias ANTERIORES à 'última vez', mais novo
       * primeiro — melhor série de cada dia + quantas séries. É a olhada de 3
       * segundos que o aluno dá antes de escolher a carga do supino; a leitura
       * completa (barras, recorde, 1RM) continua morando em Evolução → Cargas. */
      "function gHistDias(ex){var uv=gUltDia(ex);if(!uv)return [];var g=gDias(ex);" +
      "return g.ds.filter(function(d9){return d9<uv.d;}).slice(-5).reverse().map(function(d9){" +
      "var l9=g.m[d9],mx=null;l9.forEach(function(x){if(x&&x.kg!=null&&(!mx||+x.kg>+mx.kg))mx=x;});" +
      "return {d:d9,kg:mx?+mx.kg:0,r:mx&&+mx.r>0?+mx.r:0,n:l9.length};});}" +
      "window.__gHist=gHistDias;" +
      "function gCargaAtual(ex){if(gv.cargas[ex]!=null)return gv.cargas[ex];var u=gultimo(ex);return u?+u.kg:0;}" +
      // delta do tile: carga de agora × maior carga do último dia ANTERIOR ao dela
      "function gDeltaKg(ex,cv){if(!isFinite(+cv)||!(+cv>0))return 0;var g=gDias(ex);" +
      "var ref=(gv.cargas[ex]!=null)?isoHj():(g.ds.length?g.ds[g.ds.length-1]:null);if(!ref)return 0;" +
      "for(var i=g.ds.length-1;i>=0;i--){if(g.ds[i]<ref){var m9=0;g.m[g.ds[i]].forEach(function(x){if(+x.kg>m9)m9=+x.kg;});" +
      "return m9>0?(+cv)-m9:0;}}return 0;}" +
      "function pintaGuia(){var f=GUIA[gv.f],it=f.it[gv.e];if(!it)return;" +
      "gv.tex=gv.tex||Date.now();gCabeca();" +
      "gEl('gEstado').style.display='none';" +
      "var m='';" +
      /* aquecimento no 1º exercício (v670): lembrete em <details> nativo — zero
       * listener, zero id, e some sozinho na primeira série marcada (pintaGuia
       * repinta com gv.s=1). O estado aberto se perde na repintura: aceitável,
       * é lembrete e não passo — gv.e continua indexando só exercícios. */
      "if(gv.e===0&&gv.s===0&&f.aq){m+=\"<details class='gaq'><summary>Aquecimento do dia (~4 min) ›</summary>\";" +
      "f.aq.forEach(function(aq9){m+=\"<div class='gaqrow'><span>\"+esc2(aq9[0])+'</span><b>'+esc2(aq9[1])+'</b></div>';});" +
      "m+=\"<div class='gaqp'>Aquecer evita lesão e melhora o treino — não pula!</div></details>\";}" +
      "m+=gBlocos(true);" +
      "if(it.ob)m+=\"<div class='gobs'><em>Recado do professor</em><p>\"+esc2(it.ob)+'</p></div>';" +
      "if(it.dc)m+=\"<div class='gdica'>\"+esc2(it.dc)+'</div>';" +
      // tiles da tela 47: repetições da ficha + carga de agora com o delta verde
      "var cv=gCargaAtual(it.e),dl=gDeltaKg(it.e,cv);" +
      "var tc=cv==='corpo'?\"<b style='font-size:19px;padding-top:9px;'>sem carga</b>\":" +
      "(+cv>0?'<b>'+gnum(+cv)+'<u>kg</u></b>':\"<b style='color:#8a8695;'>—</b>\");" +
      "if(dl)tc+=\"<em\"+(dl>0?'':\" class='mn'\")+'>'+(dl>0?'+':'\\u2212')+gnum(Math.abs(dl))+' kg desde a última</em>';" +
      "m+=\"<div class='gtiles'><div class='gtile'><span>Repetições</span><b>\"+esc2(it.r||'—')+'</b></div>'+" +
      "\"<div class='gtile'><span>Carga</span>\"+tc+'</div></div>';" +
      "var sgT=(gv.cargas[it.e]==null)?gSugereKg(it.e,it.r):0;" +
      "if(sgT)m+=\"<button type='button' class='gsug' id='gSugT' data-kg='\"+sgT+\"'>Bateu as \"+(parseInt(it.r,10)||0)+\" na \u00faltima \u2014 tenta \"+gnum(sgT)+' kg hoje \u203a</button>';" +
      "m+=\"<div class='gsecrow'><button type='button' id='gMudaCarga'>Mudar a carga</button>\"+" +
      "\"<button type='button' id='gPulaEx2'>Pular exercício</button></div>\";" +
      // card 'NA ÚLTIMA VEZ · 17 de agosto' com as anotações daquele dia
      "var uv=gUltDia(it.e);" +
      "if(uv){m+=\"<div class='gultvez'><span>Na última vez · \"+(+uv.d.slice(8,10))+' de '+MESES[+uv.d.slice(5,7)-1].toLowerCase()+'</span>';" +
      "uv.l.slice(0,4).forEach(function(x,i){m+=\"<div class='guvrow'>Série \"+(i+1)+'<b>'+(+x.r>0?x.r+' × ':'')+gnum(+x.kg)+' kg</b></div>';});" +
      "m+='</div>';}" +
      // 📜 histórico do exercício (v685): as sessões ANTES da última, dobradas
      // num <details> — só aparece com 2+ sessões passadas, nada de card vazio
      "var gh9=gHistDias(it.e);" +
      "if(gh9.length){m+=\"<details class='ghist'><summary>Histórico deste exercício ›</summary>\";" +
      "gh9.forEach(function(h9){m+=\"<div class='ghrow'><span>\"+(+h9.d.slice(8,10))+'/'+h9.d.slice(5,7)+'</span><b>'+(h9.kg>0?gnum(h9.kg)+' kg'+(h9.r?' × '+h9.r:''):'sem carga')+'</b><i>'+h9.n+(h9.n===1?' série':' séries')+'</i></div>';});" +
      "m+='</details>';}" +
      /* alternativas NO GUIADO (v670): é aqui que o aparelho está ocupado na
       * frente do aluno. Reusar a classe .altbtn entrega o toggle de graça (o
       * handler delegado no document alterna o nextElementSibling em qualquer
       * lugar, inclusive dentro do #guiaBox) — zero JS novo, zero id novo. */
      "if(it.al&&it.al.length){m+=\"<div class='galt'><button type='button' class='altbtn'>Sem esse aparelho hoje?</button>\"+" +
      "\"<div class='altbox' style='display:none;'>Troca por <b>\"+it.al.map(function(nA){return esc2(nA);}).join('</b> ou <b>')+'</b> — mesmo padrão de movimento.</div></div>';}" +
      "var nx=f.it[gv.e+1];" +
      "m+=nx?\"<div class='gprox'>Depois vem <b>\"+esc2(nx.e)+'</b> · '+nx.s+' × '+esc2(nx.r||'?')+'</div>':" +
      "\"<div class='gprox'>Último exercício do treino 💪</div>\";" +
      "gEl('gMiolo').innerHTML=m;gEl('gMiolo2').innerHTML='';gEl('gCard').classList.remove('compacto');" +
      "gEl('guiaBox').classList.remove('reg');gEl('guiaBox').classList.remove('resta');" +
      "gEl('gDescLab').style.display='none';gEl('gTrilhoCx').style.display='none';" +
      // o resumo antigo em texto segue preenchido (os testes leem), mas a régua
      // visual agora é o card de cima — só aparece quando NÃO tem card
      "gEl('gHist').textContent=gHistTxt(it.e);gEl('gHist').style.display=uv?'none':'';" +
      // demonstração: o GIF do banco aparece sozinho (é leve e mudo); o vídeo do
      // professor continua atrás do botão, porque tem som e pesa
      "var gg=gEl('gGif');if(gg){var gu=gifUrl(it.e);" +
      "gg.innerHTML=gu?\"<img src='\"+gu+\"' alt='' loading='lazy' onerror='this.parentNode.style.display=\\\"none\\\"'>\":'';" +
      "gg.style.display=gu?'block':'none';}" +
      "var gvd=gEl('gVideo');if(gvd){gvd.dataset.v=it.v||'';gvd.style.display=it.v?'inline-block':'none';gvd.textContent='Como fazer';" +
      "var gbx=gvd.nextElementSibling;if(gbx&&gbx.classList.contains('vidbox')){gbx.innerHTML='';gbx.style.display='none';}}" +
      // a linha roxa embaixo do título virou a posição na série (tela 47); o
      // grupo muscular continua nas listas de treino, onde sempre esteve
      "gEl('gGrupo').textContent='Série '+Math.min(gv.s+1,it.s)+' de '+it.s;gEl('gGrupo').style.display='block';" +
      "gEl('gEx').textContent=it.e;gPoeTec(it);" +
      "gEl('gMeta').innerHTML=\"<i class='forte'>\"+it.s+' × '+esc2(it.r||'?')+\"</i><i>\"+(it.d||60)+' s descanso</i>';" +
      "gEl('gReloLab').textContent='neste exercício';" +
      "gEl('gDesc').style.display='none';" +
      "gEl('gSerie').style.display='block';gEl('gSerie').textContent='Série feita ✓';" +
      "gEl('gPular').style.display='none';gEl('gMais15').style.display='none';" +
      "gEl('gCard').scrollTop=0;}" +
      // ---------- descanso ----------
      // gancho de teste: força o fim do descanso sem esperar o relógio de verdade
      "window.__zeraDescanso=function(){if(gv.pend&&(gv.sujo||gv.mexe)){gSegura();return 'segurou';}gFimDesc();return 'avancou';};" +
      "function gSegura(){clearInterval(gv.timer);gv.timer=null;gDescTick=null;" +
      "var d2=gEl('gDesc');if(d2)d2.textContent='0';" +
      "var lb=gEl('gDescLab');if(lb)lb.textContent='descanso acabou — sem pressa';" +
      "var tr2=gEl('gTrilho');if(tr2)tr2.style.width='0%';" +
      "var pu2=gEl('gPular');if(pu2){pu2.textContent='Próximo exercício';pu2.classList.add('prin');pu2.classList.remove('sec');}" +
      "var m15=gEl('gMais15');if(m15)m15.style.display='none';}" +
      // gv.timer e gDescTick zerados aqui e no gSegura: sem isso, o tick forçado
      // do visibilitychange re-dispararia o fim e pularia DOIS exercícios
      "function gFimDesc(){clearInterval(gv.timer);gv.timer=null;gDescTick=null;gv.mexe=false;gSalvaSeSujo();" +
      "if(gv.pend){gv.feitas[gv.e]=gv.s;gv.e++;gv.s=0;gv.pend=false;gv.tex=Date.now();" +
      "if(gv.e>=GUIA[gv.f].it.length){gConclui();return;}}" +
      "pintaGuia();}" +
      "function gDescanso(sg,trocaEx){gv.pend=trocaEx;gv.mexe=false;var fim=Date.now()+sg*1000,tot=sg||1,ult=sg,meuId=null;" +
      "var pu0=gEl('gPular');if(pu0){pu0.textContent='Pular descanso';pu0.classList.remove('prin');pu0.classList.add('sec');}" +
      "var lb0=gEl('gDescLab');if(lb0)lb0.textContent='segundos';" +
      "var f=GUIA[gv.f],it=f.it[gv.e];" +
      // selo verde no fim do exercício (tela 22); entre séries segue 'Descanso'
      "var ge=gEl('gEstado');ge.style.display='inline-block';" +
      "ge.textContent=trocaEx?('✓ '+it.s+(it.s>1?' séries feitas':' série feita')):'Descanso';" +
      "ge.classList.toggle('verde',!!trocaEx);pintaBarra();" +
      // no descanso entre séries a linha roxa já anuncia a PRÓXIMA série; na
      // anotação de carga ela vira a pergunta
      "gEl('gGrupo').textContent=trocaEx?'Com quanto você fechou?':'Série '+Math.min(gv.s+1,it.s)+' de '+it.s;" +
      "var gg2=gEl('gGif');if(gg2&&trocaEx)gg2.style.display='none';" +
      "gEl('gSerie').style.display='none';" +
      "var pu=gEl('gPular');pu.style.display='block';pu.style.pointerEvents='none';pu.style.opacity='.55';" +
      "setTimeout(function(){pu.style.pointerEvents='';pu.style.opacity='';},700);" +
      "gEl('gMais15').style.display='block';" +
      // o #gDesc continua sendo SÓ o número (é o que o teste lê); agora ele e o
      // trilho moram na barra fixa do rodapé (.resta) — entre séries o miolo
      // fica como está (a tela inteira do exercício continua visível)
      "gEl('guiaBox').classList.add('resta');" +
      "if(trocaEx)gEl('gMiolo').innerHTML=gBlocos(true);" +
      "var d=gEl('gDesc');d.style.display='block';d.textContent=sg;" +
      "gEl('gDescLab').style.display='block';gEl('gTrilhoCx').style.display='block';gEl('gTrilho').style.width='100%';" +
      "gEl('gCard').classList.toggle('compacto',!!trocaEx);" +
      "gEl('guiaBox').classList.toggle('reg',!!trocaEx);" +
      "gEl('gMiolo2').innerHTML=trocaEx?gCargaHtml(it):'';" +
      "if(trocaEx)ligaStepper(it,gv.f+':'+gv.e);" +
      "clearInterval(gv.timer);" +
      "gv.mais=0;" +
      "gDescTick=function(){if(gv.timer!==meuId)return;" +
      "if(gv.mais){fim+=gv.mais*1000;tot+=gv.mais;gv.mais=0;}" +
      "var resta=Math.max(0,Math.ceil((fim-Date.now())/1000));if(resta===ult)return;ult=resta;" +
      "var tr=gEl('gTrilho');if(tr)tr.style.width=Math.max(0,Math.round(100*resta/tot))+'%';" +
      "if(resta<=0){clearInterval(gv.timer);gv.timer=null;gDescTick=null;beepG();if(navigator.vibrate)navigator.vibrate([200,100,200]);" +
      "avisaFim('Descanso acabou — bora pra próxima série!');" +
      /* Zerou enquanto o aluno anota a carga? Segura. Trocar de exercício com o
         dedo na régua fazia o formulário sumir no meio do arrasto — parecia que
         a tela fechava sozinha. Quem não encostou em nada segue no automático. */
      "if(gv.pend&&(gv.sujo||gv.mexe)){gSegura();return;}" +
      "gFimDesc();return;}" +
      "d.textContent=resta;if(resta<=3)bip(600,100);};" +
      "meuId=gv.timer=setInterval(gDescTick,1000);}" +
      // ao voltar do 2º plano os cronômetros recalculam NA HORA (deadline por
      // relógio); o listener do wake lock (lá em cima) é OUTRO — não juntar
      "document.addEventListener('visibilitychange',function(){if(document.hidden)return;try{if(tmrTick)tmrTick();}catch(e0){}try{if(gDescTick)gDescTick();}catch(e1){}});" +
      // ---------- registro da carga (steppers, sem teclado obrigatório) ----------
      // ---------- régua deslizante (carga e repetições) ----------
      // Um traço por passo; o do meio é o valor escolhido. Arrastar percorre
      // dezenas de quilos de uma vez, que é o que os botões + e − não davam.
      "var GW={kg:{min:0,max:300,p:1,px:18},rep:{min:0,max:60,p:1,px:18}};" +
      "function gRegua(id,cfg,val){var h='',n=Math.round((cfg.max-cfg.min)/cfg.p);" +
      "for(var i=0;i<=n;i++){var v=Math.round((cfg.min+i*cfg.p)*100)/100;var f=(i%5===0);" +
      "h+=\"<i style='width:\"+cfg.px+\"px' data-v='\"+v+\"'\"+(f?\" class='f'\":'')+'>'+(f?'<b>'+gnum(v)+'</b>':'')+'</i>';}" +
      "return \"<div class='gwrail'><div class='gwheel' id='\"+id+\"' aria-hidden='true'>\"+h+\"</div><span class='gwmk'></span></div>\";}" +
      "function gIdx(cfg,v){return Math.max(0,Math.min(Math.round((cfg.max-cfg.min)/cfg.p),Math.round(((+v||0)-cfg.min)/cfg.p)));}" +
      // liga a régua ao campo: rolou -> escreve o número; digitou -> anda a régua
      "function ligaRegua(id,cfg,campo,formata){var rd=gEl(id);if(!rd)return;var t=null,ultimo=null;" +
      // encostar na régua já conta como 'estou anotando': é o que segura o
      // cronômetro de trocar de exercício embaixo do dedo do aluno
      "rd.addEventListener('touchstart',function(){gv.mexe=true;},{passive:true});" +
      "rd.addEventListener('pointerdown',function(){gv.mexe=true;});" +
      "campo.addEventListener('focus',function(){gv.mexe=true;});" +
      "function poe(v,semRolar){var s=formata(v);if(campo.value!==s){campo.value=s;gv.sujo=true;}" +
      "if(!semRolar)rd.scrollLeft=gIdx(cfg,v)*cfg.px;}" +
      "rd.addEventListener('scroll',function(){if(t)clearTimeout(t);" +
      "gv.mexe=true;t=setTimeout(function(){var i=Math.round(rd.scrollLeft/cfg.px);" +
      "var v=Math.round((cfg.min+i*cfg.p)*100)/100;if(v===ultimo)return;ultimo=v;" +
      "poe(v,true);if(navigator.vibrate)navigator.vibrate(6);},60);});" +
      "campo.addEventListener('change',function(){var v=parseFloat(String(campo.value).replace(',','.'))||0;" +
      "ultimo=v;poe(v);});" +
      "return poe;}" +
      "function gCargaHtml(it){var u=gultimo(it.e);var v=u?+u.kg:0;var r=u&&+u.r>0?+u.r:(parseInt(it.r,10)||0);" +
      "return \"<div class='gcg'><div class='gcglab' id='gCgLab'>Carga de hoje</div>\"+" +
      "\"<div class='gwbox'><div class='gwval'>\"+" +
      "\"<input id='gKg' inputmode='decimal' value='\"+(v?gnum(v):'')+\"' placeholder='0' aria-label='Carga em quilos'><u>kg</u></div>\"+" +
      "gRegua('gWKg',GW.kg,v)+\"</div>\"+" +
      "\"<div class='gwbox'><div class='gwval sm'>\"+" +
      "\"<input id='gReps' inputmode='numeric' value='\"+(r||'')+\"' placeholder='—' aria-label='Repetições'><u>reps</u></div>\"+" +
      "gRegua('gWRep',GW.rep,r)+\"</div>\"+" +
      // lembrete da sessão anterior, igual à tela 22 ('na última vez você fez 30')
      "(u?\"<div class='gcgult'>na última vez você fez \"+gnum(+u.kg)+' kg'+(+u.r>0?' × '+u.r:'')+'</div>':'')+" +
      "(function(){var sg=gSugereKg(it.e,it.r);if(!sg)return '';" +
      "return \"<button type='button' class='gsug' id='gSug' data-kg='\"+sg+\"'>Bateu as \"+(parseInt(it.r,10)||0)+\" \u2014 tenta \"+gnum(sg)+' kg \u203a</button>';})()+" +
      "\"<button type='button' class='gsalvar' id='gSalvar'>Salvar carga</button>\"+" +
      "\"<button type='button' class='gsemcarga' id='gSemCarga'>Foi sem carga (peso do corpo)</button></div>\";}" +
      "function ligaStepper(it,slot){var kg=gEl('gKg'),rp=gEl('gReps');if(!kg)return;gv.reg=it.e;gv.regi=slot||'';" +
      "ligaRegua('gWKg',GW.kg,kg,function(v){return v?gnum(v):'';});" +
      "ligaRegua('gWRep',GW.rep,rp,function(v){return v?String(Math.round(v)):'';});" +
      // a régua nasce no valor de hoje (última carga daquele exercício): no caso
      // comum o aluno repete a carga e não precisa arrastar nada
      "requestAnimationFrame(function(){var a=gEl('gWKg'),b=gEl('gWRep');" +
      "if(a)a.scrollLeft=gIdx(GW.kg,parseFloat(String(kg.value).replace(',','.'))||0)*GW.kg.px;" +
      "if(b)b.scrollLeft=gIdx(GW.rep,parseInt(rp.value,10)||0)*GW.rep.px;});" +
      "var bs9=gEl('gSug');if(bs9)bs9.onclick=function(){kg.value=gnum(+bs9.dataset.kg);gv.sujo=true;" +
      "var a9=gEl('gWKg');if(a9)a9.scrollLeft=gIdx(GW.kg,+bs9.dataset.kg)*GW.kg.px;" +
      "bs9.textContent='Vamos nessa! \u2713';bs9.classList.add('on');if(navigator.vibrate)navigator.vibrate(40);};" +
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
      // resumo dos batimentos do treino (media e maximo) — 90 dias de historico
      "var fcR9=hrResumo();if(fcR9){var fcH=L('ptfc',{});fcH[hjR]=fcR9;" +
      "var kf9=Object.keys(fcH).sort();if(kf9.length>90)delete fcH[kf9[0]];Sv('ptfc',fcH);}" +
      "var marc=0,pres=0,anot=0,faltam=[];" +
      "f.it.forEach(function(it,i){pres+=it.s;" +
      "marc+=Math.min(Math.max(gv.feitas[i]||0,stR[it.e]||0),it.s);" +
      "var temC=gv.cargas[it.e]||(dcR[it.e]||[]).some(function(x){return x.d===hjR;});" +
      "if(temC)anot++;else faltam.push({i:i,e:it.e});});" +
      "var gec=gEl('gEstado');gec.style.display='none';" +
      "var gg3=gEl('gGif');if(gg3)gg3.style.display='none';" +
      "gEl('gBarra').innerHTML=f.it.map(function(){return \"<i class='past'></i>\";}).join('');" +
      "gEl('gProg').innerHTML='<b>'+g2(f.it.length)+'</b> / '+g2(f.it.length)+\"<span>\"+esc2(f.n)+'</span>';" +
      "gEl('gCard').classList.add('recibo');gEl('guiaBox').classList.add('festa');gEl('guiaBox').classList.remove('resta');" +
      "gEl('gVoltaEx').style.display='none';gEl('gPularEx').style.display='none';" +
      "var vb=gEl('gVideo');if(vb){vb.style.display='none';var bx=vb.nextElementSibling;" +
      "if(bx&&bx.classList.contains('vidbox')){bx.innerHTML='';bx.style.display='none';}}" +
      // volume do dia (kg × reps × séries do que teve carga anotada) — vale pros
      // tiles E pra arte do post
      "var vol9=0;f.it.forEach(function(it){var reg9=(dcR[it.e]||[]).filter(function(x){return x.d===hjR;}).pop();" +
      "var kg9=reg9?+reg9.kg:(gv.cargas[it.e]?+gv.cargas[it.e]:0);var r9=(reg9&&+reg9.r)?+reg9.r:(parseInt(it.r,10)||10);" +
      "if(kg9>0)vol9+=kg9*r9*(+it.s||3);});" +
      // a festa (tela 48): troféu, meta da semana, tiles e a régua de XP
      "var f9=L('ptfeitos',{});var naS=0;var sg9=new Date();sg9.setDate(sg9.getDate()-((sg9.getDay()+6)%7));" +
      "for(var i9=0;i9<7;i9++){var d9=new Date(sg9);d9.setDate(d9.getDate()+i9);if(f9[isoLoc(d9)])naS++;}" +
      "if(!f9[hjR])naS++;" + // o dia de hoje conta mesmo se o registro ainda não caiu
      "var diasC=((new Date().getDay()+6)%7)+1;var bateu=naS>=META;var stk9=streakSem(f9);" +
      "var xp9=xpDados();var nv9=nivelDe(xp9);var alvoN=nvXpAte(nv9+1);var falta9=Math.max(0,alvoN-xp9);" +
      "var pctN=Math.min(100,Math.round(100*(xp9-nvXpAte(nv9))/Math.max(1,alvoN-nvXpAte(nv9))));" +
      "var m=\"<div style='text-align:center;color:#fff;'>\"+" +
      "\"<div style='width:84px;height:84px;margin:2px auto 0;border-radius:50%;background:rgba(255,255,255,.2);border:1.5px solid rgba(255,255,255,.45);display:flex;align-items:center;justify-content:center;color:#fde047;'>\"+icx(ICO.trofeu,40)+'</div>'+" +
      "\"<div style='font-size:10.5px;font-weight:800;letter-spacing:.26em;text-transform:uppercase;color:rgba(255,255,255,.8);margin-top:12px;'>\"+(bateu?'Meta da semana batida':'Treino concluído')+'</div>'+" +
      "\"<div style='font-size:clamp(28px,9vw,38px);font-weight:900;line-height:1.05;margin-top:6px;'>\"+naS+(naS===1?' treino':' treinos')+' em '+diasC+(diasC===1?' dia':' dias')+'</div>'+" +
      "(stk9>0?\"<div style='font-size:13.5px;color:rgba(255,255,255,.85);margin-top:8px;'>\"+(stk9===1?'Primeira semana batendo a meta':stk9+'ª semana seguida batendo a meta')+'. Orgulho define.</div>':'')+'</div>'+" +
      "\"<div style='display:flex;gap:8px;margin-top:16px;'>\"+" +
      "\"<div class='wtile2' style='flex:1;'><b>\"+gmmss((Date.now()-gv.t0)/1000)+'</b><i>no treino</i></div>'+" +
      "(vol9>0?\"<div class='wtile2' style='flex:1;'><b>\"+Math.round(vol9).toLocaleString('pt-BR')+'</b><i>kg no total</i></div>':'')+" +
      "\"<div class='wtile2' style='flex:1;'><b>\"+marc+'</b><i>séries</i></div></div>'+" +
      "\"<div style='background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.28);border-radius:18px;padding:12px 16px;margin-top:10px;color:#fff;'>\"+" +
      "\"<div style='display:flex;justify-content:space-between;gap:8px;font-size:13.5px;font-weight:800;'><span>\"+xp9+' XP</span>'+" +
      "\"<span style='color:rgba(255,255,255,.8);font-weight:700;'>faltam \"+falta9+' pro Nv '+(nv9+1)+'</span></div>'+" +
      "\"<div style='height:8px;background:rgba(255,255,255,.22);border-radius:99px;overflow:hidden;margin-top:8px;'><div style='height:100%;width:\"+pctN+\"%;background:#fff;border-radius:99px;'></div></div></div>\";" +
      // o detalhe do dia (o recibo de sempre, agora discreto)
      "m+=\"<div class='gdica' style='margin-top:12px;font-size:13.5px;color:rgba(255,255,255,.85);text-align:center;'>\"+" +
      "'Séries feitas aqui · '+marc+' de '+pres+\" — Cargas anotadas · \"+anot+' de '+f.it.length+" +
      "' — Tempo de treino · '+gmmss((Date.now()-gv.t0)/1000)+(fcR9?' \u2014 Batimentos \u00b7 '+fcR9.m+' bpm m\u00e9dio \u00b7 '+fcR9.x+' m\u00e1x':'')+'</div>';" +
      // emenda: o dia so acaba depois da parte 2 (A2 — cardio e alongamento)
      "if(f.p2&&f.p2.l&&f.p2.l.length){m+=\"<div class='gcglab' style='margin-top:16px;'>Ainda falta \"+esc2(f.p2.k)+'</div>'+" +
      "\"<div style='background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.28);border-radius:16px;padding:6px 14px;color:#fff;font-size:13.5px;'>\"+" +
      "f.p2.l.map(function(ln){return \"<div style='display:flex;justify-content:space-between;gap:10px;padding:7px 0;'><span>\"+esc2(ln.t)+\"</span><b style='color:#bfdbfe;white-space:nowrap;'>\"+esc2(ln.v||'')+'</b></div>';}).join('')+'</div>';}" +
      // a pergunta chega no momento certo: acabou de treinar, ainda ofegante
      "if(!L('ptrpe',{})[hjR])m+=\"<div data-rpebox style='margin-top:16px;'>\"+rpeHtml()+'</div>';" +
      "m+=notaBox('musc');" +
      "if(faltam.length)m+=\"<div class='gcglab' style='margin-top:16px;'>Faltou anotar \"+faltam.length+(faltam.length>1?' cargas':' carga')+'</div>'+" +
      "faltam.map(function(x){return \"<button type='button' class='gfalta' data-gfalta='\"+x.i+\"'>\"+esc2(x.e)+' ›</button>';}).join('');" +
      // R4: compartilhar o treino com a foto — o gatilho mora no recibo
      "m+=arteBtns('gShareArq','gShareSem');" +
      "m+=\"<button type='button' id='gVerEvo' style='width:100%;min-height:50px;margin-top:10px;border-radius:99px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.3);color:#fff;font-family:inherit;font-size:15px;font-weight:800;cursor:pointer;'>Ver minha evolução</button>\";" +
      "gEl('gMiolo').innerHTML=m;gEl('gMiolo2').innerHTML='';gEl('gHist').textContent='';gEl('gCard').classList.remove('compacto');gEl('guiaBox').classList.remove('reg');" +
      "var opG={badge:'MUSCULAÇÃO',titulo:f.n,rodape:'Musculação',stats:(function(){var s9=[[gmmss((Date.now()-gv.t0)/1000),'tempo']];" +
      "if(vol9>0)s9.push([Math.round(vol9).toLocaleString('pt-BR'),'kg no total']);" +
      "s9.push([marc,marc===1?'série':'séries']);return s9;})()};" +
      "ligaArte('gShareArq','gShareSem',opG);" +
      "var gve=document.getElementById('gVerEvo');if(gve)gve.addEventListener('click',function(){fechaGuia();if(window.__trocaSec)window.__trocaSec('evolucao');});" +
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
      "var gea=gEl('gEstado');gea.style.display='inline-block';gea.textContent='Anotar carga';gea.classList.remove('verde');gEl('gEx').textContent=it.e;" +
      "gEl('gGrupo').textContent=it.g||'';gEl('gGrupo').style.display=it.g?'block':'none';gPoeTec(it);" +
      "gEl('gMiolo').innerHTML='';gEl('gMiolo2').innerHTML=gCargaHtml(it);" +
      "gEl('gHist').textContent=gHistTxt(it.e);gEl('gHist').style.display='';" +
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
      // 'Pular exercício' do miolo é só um apelido do botão de sempre do topo
      "if(e.target.id==='gPulaEx2'){var bp9=gEl('gPularEx');if(bp9)bp9.click();return;}" +
      /* 'Mudar a carga': abre o MESMO formulário de régua do fim do exercício,
         dentro do card. Salvou (ou marcou sem carga) → fecha e o tile CARGA já
         acorda com o número novo; tocar de novo no botão também fecha. */
      // aceitar a sugestão = a carga de hoje passa a ser ela (o tile CARGA muda
      // na hora); nada é gravado ainda — quem grava é o Salvar de sempre
      "if(e.target.id==='gSugT'){if(gv.fim)return;var itS=GUIA[gv.f].it[gv.e];" +
      "gv.cargas[itS.e]=+e.target.dataset.kg;gv.sujo=true;" +
      "gGrava(itS.e,+e.target.dataset.kg,parseInt(itS.r,10)||0,gv.f+':'+gv.e);" +
      "if(navigator.vibrate)navigator.vibrate(45);pintaGuia();return;}" +
      "if(e.target.id==='gMudaCarga'){if(gv.fim)return;var itM=GUIA[gv.f].it[gv.e],m2=gEl('gMiolo2');" +
      "if(m2.innerHTML){gSalvaSeSujo();m2.innerHTML='';gv.reg='';gv.regi='';pintaGuia();return;}" +
      "m2.innerHTML=gCargaHtml(itM);ligaStepper(itM,gv.f+':'+gv.e);" +
      "var sv9=gEl('gSalvar'),o9=sv9.onclick;sv9.onclick=function(){o9();" +
      "var l9=gEl('gCgLab');if(l9&&/Anotado/.test(l9.textContent))setTimeout(function(){" +
      "if(gv.pend||gv.fim)return;gEl('gMiolo2').innerHTML='';gv.reg='';gv.regi='';pintaGuia();},450);};" +
      "var sc9=gEl('gSemCarga'),o8=sc9.onclick;sc9.onclick=function(){o8();setTimeout(function(){" +
      "if(gv.pend||gv.fim)return;gEl('gMiolo2').innerHTML='';gv.reg='';gv.regi='';pintaGuia();},450);};" +
      "m2.scrollIntoView({block:'nearest'});return;}" +
      "if(e.target.id==='gVoltaEx'){if(gv.fim||gv.e<=0)return;" +
      "gSalvaSeSujo();clearInterval(gv.timer);" +
      // no 'Terminar treino' o rodapé virou um botão só e o gSerie sumiu: sem
      // remontar, o pintaGuia estoura no gSerie e o ‹ fica morto na tela
      "if(!gEl('gSerie'))gEl('gPe').innerHTML=\"<button class='prin' id='gSerie'>Série feita ✓</button>\";" +
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
      "pintaBarra();var gef=gEl('gEstado');gef.style.display='inline-block';" +
      "gef.textContent='✓ '+it.s+(it.s>1?' séries feitas':' série feita');gef.classList.add('verde');" +
      "gEl('gGrupo').textContent='Com quanto você fechou?';" +
      "gEl('gCard').classList.add('compacto');gEl('guiaBox').classList.add('reg');" +
      "gEl('gMiolo').innerHTML='';gEl('gDesc').style.display='none';" +
      "gEl('gDescLab').style.display='none';gEl('gTrilhoCx').style.display='none';" +
      "gEl('gMiolo2').innerHTML=gCargaHtml(it);ligaStepper(it,gv.f+':'+gv.e);gEl('gCard').scrollTop=0;" +
      "gEl('gVoltaEx').style.display='none';gEl('gPularEx').style.display='none';" +
      "gEl('gPe').innerHTML=\"<button class='prin' id='gFecharTreino'>Terminar treino</button>\";return;}" +
      // entre séries a tela do exercício fica INTEIRA (tela 47): repinta com a
      // série nova marcada e só então liga a barra de descanso no rodapé
      "if(!fimEx)pintaGuia();" +
      "gDescanso(it.d,fimEx);return;}" +
      "if(e.target.id==='gFecharTreino'){clearInterval(gv.timer);gSalvaSeSujo();gConclui();return;}});" +
      // deslizar pro lado troca de exercício (o card rolando não conta)
      "(function(){var x0=0,y0=0,rol=false;var w=gEl('guiaBox');if(!w)return;" +
      "w.addEventListener('touchstart',function(ev){var t=ev.touches[0];x0=t.clientX;y0=t.clientY;" +
      "rol=!!(e2Alvo(ev.target));},{passive:true});" +
      "function e2Alvo(el){while(el&&el!==w){" +
      "if(el.id==='gKg'||el.id==='gReps'||el.id==='gWKg'||el.id==='gWRep')return true;" +
      "if(/\\b(gcg|gwbox|gwrail|gwheel)\\b/.test(String(el.className||'')))return true;" +
      "if(el.id==='gCard'&&el.scrollHeight>el.clientHeight+2)return true;el=el.parentElement;}return false;}" +
      "w.addEventListener('touchend',function(ev){if(gv.fim||rol)return;var t=ev.changedTouches[0];" +
      "var dx=t.clientX-x0,dy=t.clientY-y0;if(Math.abs(dx)<50||Math.abs(dx)<Math.abs(dy)*1.5)return;" +
      "var b=document.getElementById(dx<0?'gPularEx':'gVoltaEx');if(b)b.click();},{passive:true});})();" +
      // o gráfico por exercício do diário manual foi embora junto com o card —
      // a leitura de cargas (barras, recorde, 1RM Epley) mora em Evolução → Cargas
      // peso diário
      // tela 41: curva de LINHA com pontos — registros do aluno + peso das
      // avaliações do personal na MESMA curva; tocar num ponto mostra o dia
      "function pintaPeso(){var pz=L('ptpeso',{});var pts={};Object.keys(pz).forEach(function(k){pts[k]=+pz[k];});" +
      "(AVS||[]).forEach(function(v){if(v.peso!=null&&v.data&&pts[v.data]==null)pts[v.data]=+v.peso;});" +
      "var ks=Object.keys(pts).sort();var g=document.getElementById('pzGraf');var topo=document.getElementById('pzTopo');" +
      "if(!ks.length){if(topo)topo.textContent='';return;}" +
      "var l=ks.slice(-6);var vals=l.map(function(k){return pts[k];});" +
      "var atual=vals[vals.length-1];var dif=Math.round((atual-pts[ks[0]])*10)/10;" +
      "if(topo)topo.innerHTML=\"<b style='font-size:24px;font-weight:900;'>\"+String(atual).replace('.',',')+\"<small style='font-size:13px;font-weight:800;'> kg</small></b>\"+" +
      "(dif?\"<b style='font-size:13px;font-weight:800;margin-left:7px;color:\"+(dif<0?'#4ade80':'#f87171')+\";'>\"+(dif>0?'+':'')+String(dif).replace('.',',')+\"</b>\":'');" +
      "var min=Math.min.apply(null,vals),max=Math.max.apply(null,vals);var fx=(max-min)||1;" +
      "var W=320,H=104,PX=22,PT=26,PB=24;" +
      "var xs=l.map(function(k,i){return PX+(W-2*PX)*(l.length===1?0.5:i/(l.length-1));});" +
      "var ys=vals.map(function(v){return PT+(H-PT-PB)*(1-(v-min)/fx);});" +
      "var linha='';xs.forEach(function(x,i){linha+=(i?' L':'M')+x+' '+ys[i];});" +
      "var sv=\"<svg viewBox='0 0 \"+W+' '+H+\"' style='width:100%;display:block;'>\";" +
      // ATENCAO: a cor entra por style= (propriedade CSS). Atributo de SVG
      // (fill='...' / stroke='...') NAO entende var(): o valor vira invalido e
      // o navegador cai no inicial — stroke none (linha some) e fill preto
      // (o ponto some no fundo escuro). Foi exatamente isso que apagou a curva.
      "sv+=\"<path d='\"+linha+\"' fill='none' style='stroke:var(--corc)' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/>\";" +
      "xs.forEach(function(x,i){var ult=i===xs.length-1;" +
      "sv+=\"<circle cx='\"+x+\"' cy='\"+ys[i]+\"' r='\"+(ult?6:5)+\"' stroke-width='2.5' data-pzk='\"+l[i]+\"' data-pzv='\"+String(vals[i]).replace('.',',')+\"' style='cursor:pointer;stroke:var(--corc);fill:\"+(ult?'var(--corc)':'var(--bg2)')+\";'/>\";" +
      "sv+=\"<text x='\"+x+\"' y='\"+(ys[i]-11)+\"' text-anchor='middle' font-size='12' font-weight='\"+(ult?'900':'700')+\"' style='fill:\"+(ult?'var(--corc)':'#8a8695')+\";'>\"+String(vals[i]).replace('.',',')+\"</text>\";" +
      "sv+=\"<text x='\"+x+\"' y='\"+(H-4)+\"' text-anchor='middle' font-size='10' fill='#6e6a78'>\"+l[i].slice(8,10)+'/'+l[i].slice(5,7)+\"</text>\";});" +
      "sv+='</svg>';g.className='';g.innerHTML=sv;" +
      "var nota=document.getElementById('pzNota');if(nota){var nav9=(AVS||[]).filter(function(v){return v.peso!=null;}).length;" +
      "nota.textContent=(nav9?pl(nav9,'avaliação do seu personal na curva','avaliações do seu personal na curva')+' · ':'')+'toque num ponto pra ver o dia';}" +
      "var ult9=null;Object.keys(pz).sort().forEach(function(k){ult9=k;});" +
      "var pu=document.getElementById('pzUlt');if(pu&&ult9)pu.textContent='Último registro seu: '+String(pz[ult9]).replace('.',',')+' kg em '+ult9.slice(8,10)+'/'+ult9.slice(5,7)+' · avaliações do seu personal entram na mesma curva';}" +
      "document.getElementById('pzGraf').addEventListener('click',function(e){var c9=e.target.closest&&e.target.closest('[data-pzk]');if(!c9)return;" +
      "var k9=c9.getAttribute('data-pzk');var nota=document.getElementById('pzNota');" +
      "if(nota)nota.textContent='Dia '+k9.slice(8,10)+'/'+k9.slice(5,7)+': '+c9.getAttribute('data-pzv')+' kg';});" +
      "document.getElementById('pzAdd').addEventListener('click',function(){var v=parseFloat((document.getElementById('pzKg').value||'').replace(',','.'));" +
      "if(!v||v<20||v>400){alert('Confere o peso.');return;}var pz=L('ptpeso',{});pz[isoHj()]=v;Sv('ptpeso',pz);document.getElementById('pzKg').value='';pintaPeso();" +
      "var ck=document.getElementById('ckPeso');if(ck&&!ck.value)ck.value=String(v).replace('.',',');pintaMetaPeso();});" +
      "pintaPeso();" +
      // meta de peso: alvo definido pelo aluno vira barra de progresso
      // tela 41: 'meta 62 kg' à direita, barra, 'faltam X kg' + 'Mudar a meta'
      "function pintaMetaPeso(){var box=document.getElementById('mpBarra');if(!box)return;var alvo=parseFloat(L('ptmetapeso',''));" +
      "var mt=document.getElementById('mpMetaTxt');" +
      "var pz=L('ptpeso',{});var ks=Object.keys(pz).sort();" +
      "if(mt)mt.innerHTML=alvo?\"meta <b>\"+String(alvo).replace('.',',')+\" kg</b>\":'';" +
      "if(!alvo||!ks.length){box.innerHTML=\"<button type='button' id='mpMuda' style='background:none;border:none;color:var(--corc);font-family:inherit;font-size:13px;font-weight:800;cursor:pointer;padding:0;'>\"+(alvo?'Mudar a meta':'Definir uma meta')+'</button>'+" +
      "(alvo?\"<div class='vz' style='font-size:12px;text-align:left;padding:4px 0 0;'>registre o peso pra ver o progresso</div>\":'');return;}" +
      "var ini=+pz[ks[0]],atual=+pz[ks[ks.length-1]];" +
      "var total=ini-alvo;var feito=ini-atual;var falta=Math.round((atual-alvo)*10)/10;" +
      "var pct=total!==0?Math.max(0,Math.min(100,Math.round(100*feito/total))):100;" +
      "var bateu=(total>=0&&atual<=alvo)||(total<0&&atual>=alvo);" +
      "box.innerHTML=\"<div style='height:10px;background:var(--bg4);border-radius:99px;overflow:hidden;'><div style='height:100%;width:\"+(bateu?100:pct)+\"%;background:linear-gradient(90deg,\"+(bateu?'#16a34a,#4ade80':'var(--cor),var(--corc)')+\");border-radius:99px;transition:width .5s;'></div></div>\"+" +
      "\"<div style='display:flex;justify-content:space-between;align-items:center;font-size:13px;margin-top:8px;'><b style='color:\"+(bateu?'#4ade80':'inherit')+\";'>\"+(bateu?'META BATIDA!':'faltam <b>'+Math.abs(falta).toString().replace('.',',')+' kg</b>')+\"</b>\"+" +
      "\"<button type='button' id='mpMuda' style='background:none;border:none;color:var(--corc);font-family:inherit;font-size:13px;font-weight:800;cursor:pointer;padding:0;'>Mudar a meta</button></div>\";" +
      "if(bateu&&!L('ptmetaok','')){Sv('ptmetaok','1');confete();}}" +
      "document.getElementById('mpBarra').addEventListener('click',function(e){if(!e.target.closest||!e.target.closest('#mpMuda'))return;" +
      "var f9=document.getElementById('mpForm');f9.style.display=f9.style.display==='none'?'flex':'none';});" +
      "document.getElementById('mpSalva').addEventListener('click',function(){var v=parseFloat((document.getElementById('mpAlvo').value||'').replace(',','.'));" +
      "if(!v||v<20||v>400){alert('Confere a meta.');return;}Sv('ptmetapeso',String(v));Sv('ptmetaok','');document.getElementById('mpAlvo').value='';document.getElementById('mpForm').style.display='none';pintaMetaPeso();});" +
      "(function(){var alvo=L('ptmetapeso','');if(alvo)document.getElementById('mpAlvo').placeholder='Meta atual: '+String(alvo).replace('.',',')+' kg';})();" +
      "pintaMetaPeso();" +
      // ---- utilidades: água com copinhos animados ----
      "function agCfg(){var c=L('ptaguaCfg',null)||{copos:8,ml:250};return c;}" +
      "function agN(){return +L('ptaguaN_'+isoHj(),0)||0;}" +
      "function pintaAgua(anima){var cfg=agCfg(),n=agN();var box=document.getElementById('agCopos');if(!box)return;" +
      "document.getElementById('agMetaSel').value=String(cfg.copos);document.getElementById('agMlSel').value=String(cfg.ml);" +
      // copo com CARA de copo (afunila embaixo) e água AZUL — água não é da
      // cor do studio (pedido do Raphael: laranja não parecia água)
      "var html='';for(var i=0;i<cfg.copos;i++){var cheio=i<n;" +
      "html+=\"<div class='copo' data-ci='\"+i+\"' style='width:44px;height:54px;position:relative;cursor:pointer;clip-path:polygon(6% 0,94% 0,81% 100%,19% 100%);background:var(--bg4);\"+(anima&&i===n-1?'animation:copoPop .4s;':'')+\"'>\"+" +
      "\"<div style='position:absolute;left:0;right:0;bottom:0;height:\"+(cheio?'92%':'0')+\";background:linear-gradient(180deg,#7dd3fc,#0284c7);transition:height .35s;'></div></div>\";}" +
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
      "if(window.__aguaSub)window.__aguaSub();" + // a linha dos Ajustes espelha a escolha
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
      "inf.textContent=uc.voltas.length?pl(uc.voltas.length,'volta marcada','voltas marcadas'):'';return;}" +
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
      // tela 16: cada volta vira uma linha com o tempo DELA e a diferença pra
      // anterior (verde quando foi mais rápida) — a mais nova em cima
      "if(uc.tipo==='crono'){uc.voltas.push(el2);if(navigator.vibrate)navigator.vibrate(50);" +
      "var vs=uc.voltas;var rows='';for(var i2=vs.length-1;i2>=0;i2--){var lap=vs[i2]-(i2>0?vs[i2-1]:0);" +
      "var ant2=i2>0?vs[i2-1]-(i2>1?vs[i2-2]:0):null;var df=ant2==null?null:lap-ant2;" +
      "var dtx=df==null?'—':(df<=-0.05?'-':'+')+ucFmt(Math.abs(df),false);" +
      "rows+=\"<div style='display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--bg5);padding:10px 2px;font-size:14.5px;'><span>Volta \"+(i2+1)+\"</span>\"+" +
      "\"<span style='display:flex;gap:12px;align-items:center;'><b style='font-variant-numeric:tabular-nums;'>\"+ucFmt(lap,false)+\"</b>\"+" +
      "\"<i style='font-style:normal;font-size:12.5px;font-weight:800;min-width:44px;text-align:right;color:\"+(df!=null&&df<=-0.05?'#4ade80':'#8a8695')+\";'>\"+dtx+\"</i></span></div>\";}" +
      "ucEl('ucVoltas').innerHTML=\"<div class='wpk' style='margin:16px 0 2px;'>\"+vs.length+(vs.length===1?' volta marcada':' voltas marcadas')+'</div>'+rows;return;}" +
      "if(uc.tipo==='amrap'){uc.voltas.push(el2);if(navigator.vibrate)navigator.vibrate(80);bip(760,90);" +
      "var n2=uc.voltas.length;var ant=n2>1?uc.voltas[n2-2]:0;" +
      "ucEl('ucVoltas').innerHTML='<b>'+n2+'</b> round'+(n2===1?'':'s')+' — último em '+ucFmt(el2-ant,false);ucPinta();}});" +
      "ucSel('crono');pintaUcHist();" +
      // ---- utilidades: hub (tela 15) — a grade abre cada ferramenta sozinha ----
      "var UTT={crono:['utilCrono','Cronômetro'],anilha:['utilAnilha','Anilhas'],rm:['utilRm','1RM'],imc:['utilImc','IMC']};" +
      "function utilVai(t){Object.keys(UTT).forEach(function(k){var el=document.getElementById(UTT[k][0]);if(el)el.style.display=t===k?'':'none';});" +
      "['utilTopo','utilAgua','utilHub'].forEach(function(id2){var el=document.getElementById(id2);if(el)el.style.display=t?'none':'';});" +
      "var vb2=document.getElementById('utilVoltar');if(vb2){vb2.style.display=t?'flex':'none';document.getElementById('utVoltNome').textContent=t?UTT[t][1].toUpperCase():'';}" +
      "window.scrollTo(0,0);}" +
      "document.addEventListener('click',function(e){var b=e.target.closest('[data-utgo]');" +
      "if(b){if(navigator.vibrate)navigator.vibrate(8);utilVai(b.getAttribute('data-utgo'));return;}" +
      "if(e.target.closest('#utVoltBt'))utilVai(null);});" +
      "utilVai(null);window.__utilVai=utilVai;" +
      // linhas de Ajustes que levam pra outra área (Meu plano, Meus questionários)
      "document.addEventListener('click',function(e){var b=e.target.closest('[data-ajgo]');if(!b)return;" +
      "if(navigator.vibrate)navigator.vibrate(8);if(window.__trocaSec)window.__trocaSec(b.getAttribute('data-ajgo'));" +
      "var go=b.getAttribute('data-ajgoto');if(go){var ge=document.getElementById(go);if(ge)setTimeout(function(){ge.scrollIntoView({behavior:'smooth',block:'start'});},80);}});" +
      // ---- utilidades: calculadora de 1RM (fórmula de Epley) ----
      "function pintaRm(){var kg=parseFloat((document.getElementById('rmKg').value||'').replace(',','.'));" +
      "var reps=parseInt(document.getElementById('rmReps').value,10);var out=document.getElementById('rmOut');" +
      "if(!kg||!reps||reps<1||reps>20){out.innerHTML='';return;}" +
      "var rm=reps===1?kg:kg*(1+reps/30);var rmv=(Math.round(rm*2)/2).toString().replace('.',',');" +
      // tela 17: card roxo com o número gigante + tabela de objetivos (80% em destaque)
      "out.innerHTML=\"<div style='background:linear-gradient(160deg,var(--cor),var(--cor2));border-radius:22px;padding:20px;text-align:center;color:#fff;'>\"+" +
      "\"<div style='font-size:9.5px;font-weight:800;letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.8);'>Seu 1RM estimado</div>\"+" +
      "\"<div style='font-size:52px;font-weight:900;letter-spacing:-.03em;line-height:1.15;'>\"+rmv+\"<small style='font-size:22px;font-weight:800;'> kg</small></div>\"+" +
      "\"<div style='font-size:12.5px;color:rgba(255,255,255,.85);margin-top:2px;'>pela fórmula de Epley · \"+String(kg).replace('.',',')+\" kg × \"+reps+\" reps</div></div>\"+" +
      "\"<div class='wpk' style='margin:16px 0 2px;'>Quanto usar em cada objetivo</div>\"+" +
      "[[95,'força máxima'],[90,'força'],[85,'força / hipertrofia'],[80,'hipertrofia'],[75,'hipertrofia'],[70,'resistência'],[60,'resistência / técnica']].map(function(pr){var p=pr[0];" +
      "return \"<div style='display:flex;align-items:center;gap:12px;border-top:1px solid var(--bg5);padding:12px 8px;font-size:14px;\"+(p===80?'background:rgba(var(--cor-rgb),.14);border-radius:14px;border-top-color:transparent;':'')+\"'><b style='width:44px;'>\"+p+\"%</b><span style='flex:1;color:#8a8695;'>\"+pr[1]+\"</span><b>\"+(Math.round(rm*p/100*2)/2).toString().replace('.',',')+\" kg</b></div>\";}).join('');" +
      // guarda o último 1RM no aparelho: a calculadora de anilhas usa (tela 18)
      "Sv('ptrm1',{kg:kg,reps:reps,rm:Math.round(rm*2)/2});}" +
      "document.getElementById('rmKg').addEventListener('input',pintaRm);document.getElementById('rmReps').addEventListener('input',pintaRm);" +
      // ---- utilidades: calculadora de anilhas ----
      "function pintaAnilha(){var alvo=parseFloat((document.getElementById('anKg').value||'').replace(',','.'));" +
      "var barra=+document.getElementById('anBarra').value;var out=document.getElementById('anOut');" +
      "if(!alvo||alvo<=barra){out.innerHTML=alvo?\"<div class='vz'>O alvo precisa ser maior que a barra (\"+barra+\" kg).</div>\":'';return;}" +
      "var lado=(alvo-barra)/2;var resto=lado;var PL=[25,20,15,10,5,2.5,1.25];var usa=[];" +
      "PL.forEach(function(pl){var q=Math.floor(resto/pl+1e-9);if(q>0){usa.push([pl,q]);resto=Math.round((resto-q*pl)*100)/100;}});" +
      "var montado=barra+2*(lado-resto);" +
      // tela 18: a barra desenhada — anilha maior é mais alta e mais forte na cor
      "var AH={25:92,20:86,15:74,10:62,5:48,2.5:38,1.25:30};" +
      "function anPl(u){var h=AH[u[0]]||34;var cor2=u[0]>=20?'linear-gradient(180deg,var(--corc),var(--cor))':u[0]>=10?'rgba(var(--cor-rgb),.55)':'var(--bg8)';var b='';" +
      "for(var q=0;q<Math.min(u[1],4);q++)b+=\"<span style='display:inline-block;flex:none;width:\"+(u[0]>=10?15:11)+\"px;height:\"+h+\"px;border-radius:6px;background:\"+cor2+\";'></span>\";return b;}" +
      "var esq=usa.map(anPl).join(''),dir=usa.slice().reverse().map(anPl).join('');" +
      "out.innerHTML=\"<div style='background:var(--bg2);border:1px solid rgba(255,255,255,.04);border-radius:20px;padding:16px;'>\"+" +
      "\"<div style='font-size:13.5px;color:#d6d2df;'>Em <b>cada lado</b> da barra:</div>\"+" +
      "\"<div style='display:flex;align-items:center;justify-content:center;gap:3px;margin:18px 0 14px;min-height:96px;'>\"+esq+\"<span style='flex:none;width:64px;height:9px;border-radius:99px;background:var(--bg8);margin:0 4px;'></span>\"+dir+'</div>'+" +
      "\"<div style='display:flex;gap:8px;flex-wrap:wrap;justify-content:center;'>\"+(usa.length?usa.map(function(u){return \"<span style='background:rgba(var(--cor-rgb),.14);border:1.5px solid var(--cor);border-radius:99px;padding:9px 16px;font-weight:800;font-size:14px;'>\"+u[1]+\" × \"+String(u[0]).replace('.',',')+\" kg</span>\";}).join(''):\"<span class='vz'>só a barra</span>\")+'</div>'+" +
      "\"<div style='text-align:center;font-size:13px;color:#8a8695;margin-top:12px;'>barra \"+barra+\" + \"+String(Math.round(2*(lado-resto)*100)/100).toString().replace('.',',')+\" em anilhas = <b>\"+montado.toString().replace('.',',')+\" kg</b></div>\"+" +
      "(resto>0.01?\"<div class='vz' style='font-size:12px;text-align:center;'>não fecha exato com anilhas padrão — esse é o mais próximo</div>\":'')+'</div>'+" +
      // se o aluno já calculou o 1RM, mostra as cargas dos objetivos aqui também
      "(function(){var r1=L('ptrm1',null);if(!r1||!r1.rm)return '';" +
      "return \"<div style='background:var(--bg2);border:1px solid rgba(255,255,255,.04);border-radius:20px;padding:14px 16px;margin-top:12px;'>\"+" +
      "\"<div style='display:flex;justify-content:space-between;align-items:center;'><span class='wpk'>Do seu 1RM</span><b style='font-size:20px;'>\"+String(r1.rm).replace('.',',')+\" kg</b></div>\"+" +
      "[[90,'força'],[80,'hipertrofia'],[70,'resistência']].map(function(pr){return \"<div style='display:flex;gap:12px;border-top:1px solid var(--bg5);padding:9px 2px;font-size:13.5px;'><b style='width:40px;'>\"+pr[0]+\"%</b><span style='flex:1;color:#8a8695;'>\"+pr[1]+\"</span><b>\"+(Math.round(r1.rm*pr[0]/100*2)/2).toString().replace('.',',')+\" kg</b></div>\";}).join('')+'</div>';})();}" +
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
      // na faixa do topo o espaço é curto: cada hábito é uma linha fina com
      // ícone, apelido e a sequência dele; o nome inteiro fica no aria-label
      "var HABS=[[ICO.gota,'Água em dia','Água'],[ICO.maca,'Alimentação no plano','Comida'],[ICO.lua,'Dormi 7h+','Sono'],[ICO.ativ,'Cardio / passos','Cardio']];" +
      // sequência de UM hábito: dias seguidos até hoje (o dia de hoje ainda não
      // marcado não quebra a conta — ele só não soma)
      "function stkHab(h,i){var n=0;var d=new Date();" +
      "for(var k=0;k<400;k++){var iso=isoLoc(d);if((h[iso]||{})[i])n++;else if(iso!==isoHj())break;d.setDate(d.getDate()-1);}return n;}" +
      // recorde: maior sequência de dias com 3+ hábitos em toda a história
      "function recHab(h){var rec=0,cur=0,ant=null;" +
      "Object.keys(h).sort().forEach(function(iso){var dia=h[iso]||{};var n=0;HABS.forEach(function(_,j){if(dia[j])n++;});" +
      "if(n<3){cur=0;ant=null;return;}var d=new Date(iso+'T12:00:00');" +
      "cur=(ant&&Math.round((d-ant)/864e5)===1)?cur+1:1;ant=d;if(cur>rec)rec=cur;});return rec;}" +
      "function pintaHab(){var h=L('pthab',{});var hoje=h[isoHj()]||{};" +
      "document.getElementById('habBox').innerHTML=HABS.map(function(x,i){var on=!!hoje[i];var dh=stkHab(h,i);" +
      "return \"<button type='button' data-hab='\"+i+\"' class='\"+(on?'on':'')+\"' aria-pressed='\"+(on?'true':'false')+\"' aria-label='\"+x[1]+\"'>\"+" +
      "'<i>'+icx(x[0],15)+'</i><span>'+x[2]+'</span><u>'+(dh?dh+' dia'+(dh>1?'s':''):'—')+'</u></button>';}).join('');" +
      "var streak=0;var d=new Date();" +
      "for(var i=0;i<400;i++){var iso=isoLoc(d);var dia=h[iso]||{};var n=0;HABS.forEach(function(_,j){if(dia[j])n++;});" +
      "if(n>=3)streak++;else if(iso!==isoHj())break;d.setDate(d.getDate()-1);}" +
      "document.getElementById('habStreak').innerHTML=streak+\" <small>dia\"+(streak===1?'':'s')+'</small>';" +
      "var rec=recHab(h);" +
      "document.getElementById('habRec').textContent=rec>1?'Recorde: '+rec+' dias':'Marque 3 pra contar o dia';" +
      // a chama embaixo da semana (telas finais): sequência de dias com 3+ hábitos
      "var sl=document.getElementById('stkLine');if(sl){if(streak>0){sl.style.display='flex';" +
      // diz COM QUE a sequencia e: a do card da semana conta dias TREINADOS, e
      // duas linhas "N dias seguidos" com numeros diferentes na mesma tela confunde
      "sl.innerHTML=icx(ICO.chama,16)+'<b>'+streak+' dia'+(streak===1?'':'s')+'</b> seguido'+(streak===1?'':'s')+' com 3+ h\\u00e1bitos'+" +
      "(rec>1?\"<span style='color:#6e6a78;font-weight:600;'>· recorde \"+rec+' dias</span>':'');}" +
      "else{sl.style.display='none';}}}" +
      "document.getElementById('habBox').addEventListener('click',function(e){var b=e.target.closest('[data-hab]');if(!b)return;" +
      "var h=L('pthab',{});var hoje=h[isoHj()]||{};hoje[b.dataset.hab]=!hoje[b.dataset.hab];h[isoHj()]=hoje;Sv('pthab',h);pintaHab();});" +
      "pintaHab();" +
      // fotos de progresso (só no aparelho)
      // tela 41: cada foto tem um ângulo (frente/lado/costas — foto antiga sem
      // ângulo conta como frente) e o comparador ganhou a alça de arrastar
      "var ftTipo='frente';var FTT=[['frente','Frente'],['lado','Lado'],['costas','Costas']];" +
      "function ftDe(fs,t){return fs.filter(function(x){return (x.tipo||'frente')===t;});}" +
      "function pintaFotos(){var fs=L('ptfotos',[]);var box=document.getElementById('fotosBox');if(!box)return;" +
      "var abas=document.getElementById('ftAbas');" +
      "if(abas)abas.innerHTML=FTT.map(function(par){var n=ftDe(fs,par[0]).length;var on=ftTipo===par[0];" +
      "return \"<button type='button' data-fttipo='\"+par[0]+\"' style='flex:1;min-height:52px;border-radius:14px;cursor:pointer;font-family:inherit;text-align:center;padding:6px 2px;\"+(on?'background:rgba(var(--cor-rgb),.14);border:1.5px solid var(--corc);color:#fff;':'background:var(--bg4);border:1px solid var(--bg11);color:#a9a4b5;')+\"'>\"+" +
      "\"<b style='display:block;font-size:14px;'>\"+par[1]+\"</b><span style='font-size:10.5px;color:\"+(on?'var(--corc)':'#6e6a78')+\";'>\"+(n?pl(n,'foto','fotos'):'nenhuma')+\"</span></button>\";}).join('');" +
      "var bt0=document.getElementById('fotoBtn');if(bt0&&bt0.firstChild)bt0.firstChild.textContent='+ Adicionar foto de '+ftTipo+' ';" +
      "var l=ftDe(fs,ftTipo);var pri=l[0],ult=l[l.length-1];" +
      "if(!l.length){box.className='vz';box.innerHTML='Tire a primeira foto de '+ftTipo+' — daqui a uns meses você vai agradecer.';return;}" +
      "box.className='';" +
      "if(l.length>1){" +
      // comparador com slider: AGORA por baixo, ANTES recortada por cima — arrasta e vê a evolução
      "box.innerHTML=\"<div id='ftWrap' style='position:relative;border-radius:16px;overflow:hidden;'>\"+" +
      "\"<img src='\"+ult.img+\"' style='width:100%;display:block;'>\"+" +
      "\"<div id='ftCorte' style='position:absolute;top:0;left:0;bottom:0;overflow:hidden;width:50%;'><img id='ftImgAntes' src='\"+pri.img+\"' style='display:block;max-width:none;'></div>\"+" +
      "\"<div id='ftLinha' style='position:absolute;top:0;bottom:0;left:50%;width:2px;background:rgba(255,255,255,.85);box-shadow:0 0 8px rgba(0,0,0,.6);'>\"+" +
      "\"<span style='position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:44px;height:44px;border-radius:50%;background:rgba(0,0,0,.45);border:2px solid #fff;display:flex;align-items:center;justify-content:center;color:#fff;font-size:15px;font-weight:800;letter-spacing:-.05em;'>\\u2039\\u203a</span></div>\"+" +
      "\"<span style='position:absolute;top:10px;left:10px;background:rgba(0,0,0,.6);color:#fff;font-size:10px;font-weight:800;letter-spacing:.08em;padding:4px 10px;border-radius:99px;'>ANTES · \"+pri.d.slice(8,10)+'/'+pri.d.slice(5,7)+\"</span>\"+" +
      "\"<span style='position:absolute;top:10px;right:10px;background:rgba(0,0,0,.6);color:#fff;font-size:10px;font-weight:800;letter-spacing:.08em;padding:4px 10px;border-radius:99px;'>AGORA · \"+ult.d.slice(8,10)+'/'+ult.d.slice(5,7)+\"</span></div>\"+" +
      "\"<input type='range' id='ftRange' min='0' max='100' value='50' style='width:100%;margin-top:8px;padding:0;border:none;background:transparent;accent-color:var(--cor);' aria-label='Comparar antes e agora'>\"+" +
      "\"<div class='vz' style='font-size:11.5px;'>Arrasta pra comparar · \"+ftTipo+', '+pl(l.length,'foto guardada','fotos guardadas')+\"</div>\";" +
      "var wrap=document.getElementById('ftWrap');" +
      "var ajusta=function(){var ia=document.getElementById('ftImgAntes');if(ia&&wrap.clientWidth)ia.style.width=wrap.clientWidth+'px';};" +
      "setTimeout(ajusta,60);window.addEventListener('resize',ajusta);" +
      "document.getElementById('ftRange').addEventListener('input',function(){document.getElementById('ftCorte').style.width=this.value+'%';document.getElementById('ftLinha').style.left=this.value+'%';});" +
      "}else{" +
      "box.innerHTML=\"<div style='text-align:center;'><div style='font-size:10.5px;color:#a9a4b5;letter-spacing:.1em;margin-bottom:4px;'>ANTES · \"+pri.d.slice(8,10)+'/'+pri.d.slice(5,7)+\"</div><img src='\"+pri.img+\"' style='width:100%;border-radius:16px;'></div>\"+" +
      "\"<div class='vz' style='font-size:11.5px;'>Tire a próxima foto de \"+ftTipo+\" pra liberar o comparador antes × agora</div>\";}" +
      "var dias=Math.round((new Date()-new Date(ult.d))/864e5);" +
      "if(dias>=30&&bt0&&bt0.firstChild)bt0.firstChild.textContent='Faz '+dias+' dias — hora da foto do mês! ';}" +
      "var ftA=document.getElementById('ftAbas');if(ftA)ftA.addEventListener('click',function(e){var b=e.target.closest('[data-fttipo]');if(!b)return;" +
      "ftTipo=b.getAttribute('data-fttipo');pintaFotos();if(navigator.vibrate)navigator.vibrate(8);});" +
      "function guardaFotoProg(f){if(!f)return;" +
      "var img=new Image();var rd=new FileReader();rd.onload=function(){img.onload=function(){" +
      "var c=document.createElement('canvas');var esc2=480/Math.max(img.width,img.height);if(esc2>1)esc2=1;" +
      "c.width=Math.round(img.width*esc2);c.height=Math.round(img.height*esc2);" +
      "c.getContext('2d').drawImage(img,0,0,c.width,c.height);" +
      "var fs=L('ptfotos',[]);fs.push({d:isoHj(),img:c.toDataURL('image/jpeg',.68),tipo:ftTipo});if(fs.length>12)fs.shift();" +
      "try{Sv('ptfotos',fs);}catch(e){alert('Memória de fotos cheia — apague fotos antigas do app.');return;}pintaFotos();};" +
      "img.onerror=function(){alert('N\u00e3o consegui abrir esse arquivo — escolha uma foto.');};" +
      "img.src=rd.result;};rd.readAsDataURL(f);}" +
      "window.__fotoProg=guardaFotoProg;" +
      "document.getElementById('fotoInput').addEventListener('change',function(){" +
      "guardaFotoProg(this.files&&this.files[0]);this.value='';});" +
      "pintaFotos();" +
      // chat aluno ↔ personal (+ robô de atendimento)
      "var BOT=" + jsonApp(botApp) + ";" +
      "function botHist(){return L('ptbotmsgs',[]);}" +
      // avatarzinho do personal ao lado das bolhas dele (tela 10)
      "var CHAV=" + jsonApp("<span style='flex:none;width:30px;height:30px;border-radius:50%;background:rgba(var(--cor-rgb),.28);border:1px solid rgba(var(--cor-rgb),.5);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:var(--corc);overflow:hidden;'>" +
        (LOGOAPP ? "<img src='" + LOGOAPP + "' alt='' style='width:100%;height:100%;object-fit:cover;'>" : esc(String(studio || "?").trim().split(/\s+/).slice(0, 2).map(function (w) { return (w[0] || "").toUpperCase(); }).join(""))) + "</span>") + ";" +
      "function botFala(tx){var h=botHist();h.push({de:'bot',texto:tx,criado:new Date().toISOString()});if(h.length>60)h.shift();Sv('ptbotmsgs',h);}" +
      // tela 10: balões arredondados (o meu na cor, o do personal escuro),
      // com divisor de data HOJE / ONTEM / DD/MM entre os dias
      "function pintaChat(msgs){var el=document.getElementById('chMsgs');var all=(msgs||[]).concat(botHist());" +
      "all.sort(function(a,b){return String(a.criado)<String(b.criado)?-1:1;});" +
      "if(!all.length){el.innerHTML=\"<div class='vz'>Manda a primeira mensagem!</div>\";return;}" +
      "var ontem9=isoLoc(new Date(Date.now()-864e5));" +
      "el.innerHTML=all.map(function(m,ix){var minha=m.de==='aluno'||m.de==='aluno-local';var bot=m.de==='bot';" +
      "var d0=String(m.criado).slice(0,10);var ant=ix>0?String(all[ix-1].criado).slice(0,10):null;var div='';" +
      "if(d0!==ant){var lab=d0===isoHj()?'HOJE':d0===ontem9?'ONTEM':d0.slice(8,10)+'/'+d0.slice(5,7);" +
      "div=\"<div style='align-self:center;font-size:10px;font-weight:800;letter-spacing:.2em;color:#6e6a78;margin:10px 0 4px;'>\"+lab+\"</div>\";}" +
      // mensagem do personal ganha o avatarzinho encostado na bolha (tela 10)
      "var pess=!minha&&!bot;" +
      "var bolha=\"<div style='\"+(pess?'':('align-self:'+(minha?'flex-end':'flex-start')+';'))+\"background:\"+(minha?'linear-gradient(135deg,var(--cor),var(--cor2))':(bot?'rgba(var(--cor-rgb),.14)':'var(--bg4)'))+\";border:1px solid \"+(bot?'var(--cor)':'rgba(255,255,255,.05)')+\";\"+(minha?'color:#fff;':'')+\"border-radius:\"+(minha?'18px 18px 6px 18px':'18px 18px 18px 6px')+\";padding:11px 14px;max-width:\"+(pess?'100%':'84%')+\";font-size:14px;line-height:1.45;'>\"+(bot?\"<div style='font-size:10px;color:var(--corc);font-weight:800;margin-bottom:2px;'>assistente</div>\":'')+String(m.texto).replace(/</g,'&lt;')+\"<div style='font-size:10px;opacity:.6;margin-top:3px;\"+(minha?'text-align:right;':'')+\"'>\"+String(m.criado).slice(11,16)+\"</div></div>\";" +
      "return div+(pess?\"<div style='align-self:flex-start;display:flex;align-items:flex-end;gap:7px;max-width:86%;'>\"+CHAV+bolha+'</div>':bolha);}).join('');" +
      "el.scrollTop=el.scrollHeight;" +
      "var ultP=null;all.forEach(function(m){if(m&&m.de&&m.de!=='aluno'&&m.de!=='aluno-local'&&m.de!=='bot')ultP=m.criado;});" +
      "if(window.__chatDot)window.__chatDot(ultP);}" +
      "function carregaChat(){if(!NUVEM){pintaChat(L('ptchat',[]));return;}" +
      "rpcApp('app_chat_lista',{t:TOKEN}).then(function(l){if(Array.isArray(l)){Sv('ptchat',l);pintaChat(l);}else{pintaChat(L('ptchat',[]));}});}" +
      // sem robô configurado, as pílulas viram respostas rápidas (tela 10):
      // tocar só PREENCHE a mensagem — quem envia é o aluno
      "function pintaChips(){var el=document.getElementById('botChips');" +
      "if(!BOT){el.innerHTML=['Vou faltar hoje','Posso remarcar?','Tô com dor'].map(function(t9){return \"<button data-bpre='\"+t9+\"' class='chipx' style='cursor:pointer;'>\"+t9+\"</button>\";}).join('');return;}" +
      "el.innerHTML=BOT.ops.map(function(o,i){return \"<button data-bop='\"+i+\"' style='background:rgba(var(--cor-rgb),.14);border:1px solid var(--cor);color:var(--cor-cl1);border-radius:99px;padding:6px 13px;font-size:12px;font-family:inherit;cursor:pointer;'>\"+String(o.r).replace(/</g,'&lt;')+\"</button>\";}).join('');}" +
      "function botEscolhe(i){var o=BOT&&BOT.ops[i];if(!o)return;var h=botHist();h.push({de:'aluno-local',texto:o.r,criado:new Date().toISOString()});Sv('ptbotmsgs',h);" +
      "pintaChat(L('ptchat',[]));setTimeout(function(){botFala(o.t);pintaChat(L('ptchat',[]));},250);}" +
      "document.getElementById('botChips').addEventListener('click',function(e){var b=e.target.closest('[data-bop]');if(b){botEscolhe(+b.dataset.bop);return;}" +
      "var pr=e.target.closest('[data-bpre]');if(pr){var ct8=document.getElementById('chTexto');ct8.value=pr.getAttribute('data-bpre');ct8.focus();}});" +
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
      // o formulário manual do diário de cargas morava aqui — saiu a pedido
      // do Raphael; a festa do recorde e a progressão moram no gFesteja
      // (chamado pelo gGrava, o caminho do player)
      // tela 41: última avaliação com deltas coloridos + histórico dobrável
      "(function(){var el=document.getElementById('evoBox');if(!AVS.length){el.innerHTML=\"<div class='vz'>Suas avaliações físicas aparecem aqui quando o personal registrar.</div>\";return;}" +
      "var ult=AVS[AVS.length-1];" +
      /* série histórica da avaliação (v671): curvas de % gordura e massa magra.
       * avMg é a MESMA régua da tela 43 (bia vence a estimativa peso*gordura/10,
       * mesmo arredondamento) — dois números diferentes pro mesmo aluno em dois
       * lugares é defeito. Filtro !=='' de propósito: o !=null do linha() deixa
       * string vazia passar e NaN quebraria o path sem erro nenhum. */
      "function avMg(v){return v.bia&&v.bia.massaGordura!=null?+v.bia.massaGordura:(v.peso!=null&&v.peso!==''&&v.gordura!=null&&v.gordura!==''?Math.round(v.peso*v.gordura/10)/10:null);}" +
      "function avSerie(lista,fn){var s=[];lista.forEach(function(v){var x=fn(v);if(x!=null&&x!==''&&isFinite(+x))s.push({d:v.data,v:+x});});return s.slice(-8);}" +
      "function avMini(rot,s,unid,cor){if(s.length<2)return '';" +
      "var W=320,H=92,PX=22,PT=22,PB=20;var min=1e9,max=-1e9;s.forEach(function(p){if(p.v<min)min=p.v;if(p.v>max)max=p.v;});var fx=(max-min)||1;" +
      "var pts=s.map(function(p,i){return {x:PX+(W-2*PX)*(s.length>1?i/(s.length-1):0),y:PT+(H-PT-PB)*(1-(p.v-min)/fx),p:p};});" +
      "var ln='';pts.forEach(function(p,i){ln+=(i?'L':'M')+Math.round(p.x)+' '+Math.round(p.y)+' ';});" +
      "var sv=\"<div class='wpk' style='margin:10px 0 0;'>\"+rot+\"</div><svg viewBox='0 0 \"+W+' '+H+\"' style='width:100%;display:block;'>\";" +
      "sv+=\"<path d='\"+ln+\"' fill='none' style='stroke:\"+cor+\"' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/>\";" +
      "pts.forEach(function(p,i){sv+=\"<circle cx='\"+Math.round(p.x)+\"' cy='\"+Math.round(p.y)+\"' r='3' style='fill:\"+cor+\"'/>\";" +
      "if(i===0||i===pts.length-1){sv+=\"<text x='\"+Math.round(p.x)+\"' y='\"+Math.round(p.y-8)+\"' text-anchor='middle' font-size='11' font-weight='800' style='fill:\"+cor+\"'>\"+String(p.p.v).replace('.',',')+unid+'</text>';" +
      "sv+=\"<text x='\"+Math.round(p.x)+\"' y='\"+(H-4)+\"' text-anchor='middle' font-size='9' fill='#6e6a78'>\"+p.p.d.slice(8,10)+'/'+p.p.d.slice(5,7)+'</text>';}});" +
      "return sv+'</svg>';}" +
      "function avGrafsDe(lista){var sG=avSerie(lista,function(v){return v.gordura;});" +
      "var sM=avSerie(lista,function(v){var mg=avMg(v);return mg!=null&&v.peso!=null&&v.peso!==''?Math.round((+v.peso-mg)*10)/10:null;});" +
      "return {g:sG,mm:sM,html:avMini('Gordura (%)',sG,'%','#fbbf24')+avMini('Massa magra (kg)',sM,' kg','var(--corc)')};}" +
      "var gf9=avGrafsDe(AVS);" +
      "window.__avGraf={g:gf9.g.map(function(p){return p.v;}),mm:gf9.mm.map(function(p){return p.v;}),de:function(l9){return avGrafsDe(l9||[]).html;}};" +
      "function linha(rot,campo,unid,inv){var com=AVS.filter(function(v){return v[campo]!=null;});if(com.length<1)return '';" +
      "var pri=com[0][campo],u=com[com.length-1][campo];var d=Math.round((u-pri)*10)/10;" +
      "var bom=inv?d>0:d<0;" +
      "return \"<div style='display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--bg5);padding:11px 2px;font-size:15px;'><span>\"+rot+\"</span>\"+" +
      "\"<span style='display:flex;gap:12px;align-items:baseline;'><b style='font-size:16px;'>\"+String(u).replace('.',',')+unid+\"</b>\"+" +
      "\"<i style='font-style:normal;font-weight:800;font-size:13px;min-width:42px;text-align:right;color:\"+(d?(bom?'#4ade80':'#f87171'):'#8a8695')+\";'>\"+(d?(d>0?'+':'')+String(d).replace('.',','):'—')+\"</i></span></div>\";}" +
      "el.innerHTML=\"<div class='wpk' style='margin:0 0 4px;'>\"+pl(AVS.length,'avaliação','avaliações')+' · última em '+ult.data.slice(8,10)+'/'+ult.data.slice(5,7)+\"</div>\"+" +
      // regra honesta: série com <2 pontos não vira gráfico; as duas vazias, nem o bloco entra
      "(gf9.html?\"<div id='avGraf' style='margin:8px 0 4px;'>\"+gf9.html+'</div>':'')+" +
      "linha('Peso','peso',' kg')+linha('Gordura','gordura','%')+linha('Cintura','cintura',' cm')+linha('Braço','braco',' cm',true)+" +
      "\"<button type='button' id='evoLaudo' class='btnx' style='width:100%;margin-top:12px;background:var(--bg4);border:1px solid rgba(255,255,255,.07);color:#d6d2df;box-shadow:none;min-height:52px;'>Ver a avaliação completa ›</button>\";})();" +
      // ---------- laudo da avaliação (tela 43): tela cheia, criada só quando abre ----------
      "var avCmpPri=false;" +
      "function avNum(x){return String(x==null?'':x).replace('.',',');}" +
      "function avDelta(u,p,inv,suf){if(u==null||p==null)return '';var d=Math.round((u-p)*10)/10;if(!d)return '';var bom=inv?d>0:d<0;" +
      "return \"<div style='font-size:12.5px;font-weight:800;margin-top:2px;color:\"+(bom?'#4ade80':'#f87171')+\";'>\"+(d>0?'+':'')+avNum(d)+(suf||'')+'</div>';}" +
      "function pintaLaudo(){var box=document.getElementById('avFull');if(!box||!AVS.length)return;" +
      "var u=AVS[AVS.length-1];var base=AVS.length>1?(avCmpPri?AVS[0]:AVS[AVS.length-2]):null;var p=base||{};" +
      "var MESL8=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];" +
      "var mg=u.bia&&u.bia.massaGordura!=null?+u.bia.massaGordura:(u.peso!=null&&u.gordura!=null?Math.round(u.peso*u.gordura/10)/10:null);" +
      "var mm9=u.peso!=null&&mg!=null?Math.round((u.peso-mg)*10)/10:null;" +
      "var mgP=p.bia&&p.bia.massaGordura!=null?+p.bia.massaGordura:(p.peso!=null&&p.gordura!=null?Math.round(p.peso*p.gordura/10)/10:null);" +
      "var mmP=p.peso!=null&&mgP!=null?Math.round((p.peso-mgP)*10)/10:null;" +
      "function tile(rot,val,suf,delta){return \"<div style='background:var(--bg2);border:1px solid rgba(255,255,255,.04);border-radius:18px;padding:14px 16px;'>\"+" +
      "\"<div class='wpk' style='margin:0 0 4px;'>\"+rot+\"</div><b style='font-size:26px;font-weight:900;'>\"+val+\"<small style='font-size:13px;font-weight:800;'> \"+suf+'</small></b>'+delta+'</div>';}" +
      "var h=\"<div style='background:linear-gradient(160deg,var(--cor),var(--cor2));padding:calc(18px + env(safe-area-inset-top,0px)) 16px 18px;color:#fff;'>\"+" +
      "\"<div style='display:flex;align-items:center;gap:12px;'>\"+" +
      "\"<button type='button' id='avFecha' aria-label='Voltar' style='flex:none;width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.16);border:none;color:#fff;font-size:19px;cursor:pointer;'>‹</button>\"+" +
      "\"<span style='flex:1;min-width:0;'><span style='display:block;font-size:9.5px;letter-spacing:.22em;font-weight:800;text-transform:uppercase;color:rgba(255,255,255,.75);'>Avaliação física</span>\"+" +
      "\"<span style='display:block;font-size:24px;font-weight:900;letter-spacing:-.02em;'>\"+(+u.data.slice(8,10))+' de '+MESL8[+u.data.slice(5,7)-1]+\"</span></span>\"+" +
      "\"<span style='flex:none;background:rgba(255,255,255,.16);border-radius:99px;padding:7px 14px;font-size:12px;font-weight:800;'>com o studio</span></div>\"+" +
      "(base?\"<div style='display:flex;gap:10px;margin-top:14px;'><button type='button' id='avCmp' style='flex:1;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.35);color:#fff;border-radius:99px;min-height:46px;font-weight:800;font-size:13.5px;font-family:inherit;cursor:pointer;'>Comparando com \"+base.data.slice(8,10)+'/'+base.data.slice(5,7)+(avCmpPri?' (a primeira)':' (a anterior)')+\"</button>\"+" +
      "\"<span style='flex:none;display:flex;align-items:center;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.35);border-radius:99px;padding:0 16px;font-size:12.5px;font-weight:800;'>As \"+AVS.length+\"</span></div>\":'')+'</div>';" +
      "h+=\"<div style='padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:12px;'>\"+" +
      "(u.peso!=null?tile('Peso',avNum(u.peso),'kg',avDelta(u.peso,p.peso,false,' kg')):'')+" +
      "(u.gordura!=null?tile('Gordura',avNum(u.gordura),'%',avDelta(u.gordura,p.gordura,false,' pontos')):'')+" +
      "(mm9!=null?tile('Massa magra',avNum(mm9),'kg',avDelta(mm9,mmP,true,' kg')):'')+" +
      "(u.cintura!=null?tile('Cintura',avNum(u.cintura),'cm',avDelta(u.cintura,p.cintura,false,' cm')):'')+'</div>';" +
      "if(mg!=null&&mm9!=null){var pctG=Math.round(100*mg/(mg+mm9));" +
      "h+=\"<div style='margin:0 16px 12px;background:var(--bg2);border:1px solid rgba(255,255,255,.04);border-radius:18px;padding:14px 16px;'>\"+" +
      "\"<div style='display:flex;justify-content:space-between;align-items:center;'><span class='wpk' style='margin:0;'>Composição</span>\"+" +
      "\"<span style='background:rgba(74,222,128,.14);color:#4ade80;border-radius:99px;padding:4px 12px;font-size:10px;font-weight:800;letter-spacing:.08em;'>\"+(u.bia&&u.bia.massaGordura!=null?'MEDIDO NA BALANÇA':'ESTIMADO PELO %')+\"</span></div>\"+" +
      "\"<div style='display:flex;height:14px;border-radius:99px;overflow:hidden;margin-top:12px;'><div style='width:\"+pctG+\"%;background:#fbbf24;'></div><div style='flex:1;background:linear-gradient(90deg,var(--cor),var(--corc));'></div></div>\"+" +
      "\"<div style='display:flex;gap:18px;margin-top:10px;font-size:13px;'><span><i style='display:inline-block;width:10px;height:10px;border-radius:3px;background:#fbbf24;margin-right:6px;'></i>Gordura <b>\"+avNum(mg)+\" kg</b></span>\"+" +
      "\"<span><i style='display:inline-block;width:10px;height:10px;border-radius:3px;background:var(--corc);margin-right:6px;'></i>Magra <b>\"+avNum(mm9)+\" kg</b></span></div></div>\";}" +
      "var CIRCN={pescoco:'Pescoço',torax:'Tórax',cintura:'Cintura',abdomen:'Abdômen',quadril:'Quadril',braco:'Braço',antebraco:'Antebraço',coxa:'Coxa',panturrilha:'Panturrilha'};" +
      "var cu={};Object.keys(CIRCN).forEach(function(k){var v9=(u.circ&&u.circ[k]!=null)?u.circ[k]:u[k];if(v9!=null)cu[k]=+v9;});" +
      "var cp={};Object.keys(CIRCN).forEach(function(k){var v9=(p.circ&&p.circ[k]!=null)?p.circ[k]:p[k];if(v9!=null)cp[k]=+v9;});" +
      "var cks=Object.keys(cu);" +
      "if(cks.length){h+=\"<div style='margin:0 16px 12px;background:var(--bg2);border:1px solid rgba(255,255,255,.04);border-radius:18px;padding:14px 16px;'>\"+" +
      "\"<div style='display:flex;justify-content:space-between;'><b style='font-size:16px;font-weight:800;'>Circunferências</b><span style='font-size:12px;color:#8a8695;'>\"+pl(cks.length,'medida · fita','medidas · fita')+\"</span></div>\"+" +
      // braço/antebraço/coxa/panturrilha crescendo é BOM (verde); o resto, diminuindo
      "\"<div style='display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px 10px;margin-top:14px;'>\"+cks.map(function(k){var d9=cp[k]!=null?Math.round((cu[k]-cp[k])*10)/10:null;" +
      "var cresceBom={braco:1,antebraco:1,coxa:1,panturrilha:1}[k];var bom9=cresceBom?d9>0:d9<0;" +
      "return \"<div><div style='font-size:12px;color:#8a8695;'>\"+CIRCN[k]+\"</div><b style='font-size:17px;'>\"+avNum(cu[k])+'</b>'+(d9?\" <i style='font-style:normal;font-size:12px;font-weight:800;color:\"+(bom9?'#4ade80':'#f87171')+\";'>\"+(d9>0?'+':'')+avNum(d9)+'</i>':'')+'</div>';}).join('')+'</div>'+" +
      "(u.rcq!=null?\"<div style='border-top:1px solid var(--bg5);margin-top:14px;padding-top:10px;font-size:12.5px;color:#8a8695;'>Tudo em cm · cintura ÷ quadril <b style='color:#fff;'>\"+avNum(u.rcq)+'</b>'+(u.riscoRcq?\" · <b style='color:#fbbf24;'>\"+String(u.riscoRcq).replace(/</g,'&lt;')+'</b>':'')+'</div>':'')+'</div>';}" +
      "if(u.dobras){var soma=0,nd=0;Object.keys(u.dobras).forEach(function(k){if(+u.dobras[k]>0){soma+=+u.dobras[k];nd++;}});" +
      "if(nd){var MET={p3:'Pollock 3',p7:'Pollock 7',guedes:'Guedes'};" +
      "h+=\"<div style='margin:0 16px 12px;background:var(--bg2);border:1px solid rgba(255,255,255,.04);border-radius:18px;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;'>\"+" +
      "\"<b style='font-size:16px;font-weight:800;'>Dobras cutâneas</b><span style='font-size:12.5px;color:#8a8695;'>\"+(MET[u.metodoDobras]||pl(nd,'dobra','dobras'))+' · soma '+avNum(Math.round(soma*10)/10)+\" mm</span></div>\";}}" +
      "if(u.bia){var BIAN=[['agua','Água corporal','L'],['proteina','Proteína','kg'],['mineral','Minerais','kg'],['massaGordura','Massa de gordura','kg'],['mme','Músculo esquelético','kg'],['visceral','Gordura visceral','nível'],['anguloFase','Ângulo de fase','°']];" +
      "var brs=BIAN.filter(function(par){return u.bia[par[0]]!=null;});" +
      "if(brs.length){h+=\"<div style='margin:0 16px 12px;background:var(--bg2);border:1px solid rgba(255,255,255,.04);border-radius:18px;padding:6px 16px 10px;'>\"+" +
      "\"<b style='display:block;font-size:16px;font-weight:800;padding:8px 0 4px;'>Bioimpedância</b>\"+" +
      "brs.map(function(par){return \"<div style='display:flex;justify-content:space-between;border-top:1px solid var(--bg5);padding:9px 2px;font-size:14px;'><span style='color:#d6d2df;'>\"+par[1]+\"</span><b>\"+avNum(u.bia[par[0]])+' '+par[2]+'</b></div>';}).join('')+'</div>';}" +
      "if(u.bia.segmentar&&u.bia.segmentar.length){h+=\"<div style='margin:0 16px 12px;background:var(--bg2);border:1px solid rgba(255,255,255,.04);border-radius:18px;padding:6px 16px 10px;'>\"+" +
      "\"<b style='display:block;font-size:16px;font-weight:800;padding:8px 0 4px;'>Massa magra por segmento</b>\"+" +
      "u.bia.segmentar.map(function(s9){return \"<div style='display:flex;justify-content:space-between;border-top:1px solid var(--bg5);padding:9px 2px;font-size:14px;'><span style='color:#d6d2df;'>\"+String(s9.nome).replace(/</g,'&lt;')+\"</span><b>\"+avNum(s9.magra)+' kg</b></div>';}).join('')+'</div>';}}" +
      "h+=\"<div style='height:calc(30px + env(safe-area-inset-bottom,0px));'></div>\";" +
      "box.innerHTML=h;box.querySelector('.wpk');}" +
      "function abreLaudo(){var box=document.getElementById('avFull');" +
      "if(!box){box=document.createElement('div');box.id='avFull';" +
      "box.style.cssText='display:none;position:fixed;inset:0;z-index:72;background:var(--bg0);overflow:auto;max-width:480px;margin:0 auto;';" +
      "document.body.appendChild(box);" +
      "box.addEventListener('click',function(e){if(e.target.closest&&e.target.closest('#avFecha')){box.style.display='none';return;}" +
      "if(e.target.closest&&e.target.closest('#avCmp')){avCmpPri=!avCmpPri;pintaLaudo();}});}" +
      "pintaLaudo();box.style.display='block';box.scrollTop=0;}" +
      "document.addEventListener('click',function(e){if(e.target.closest&&e.target.closest('#evoLaudo')){abreLaudo();if(navigator.vibrate)navigator.vibrate(8);}});" +
      "window.__laudoAv=abreLaudo;" +
      // ---------- Cargas (tela 42): grupos musculares com busca ----------
      // O grupo de cada exercício vem das fichas (objeto D) — carga é dado do
      // aparelho (ptdc), então tudo aqui é pintura em runtime.
      "var EXGRP=" + jsonApp((function () {
        var m = {};
        (fichasApp || []).forEach(function (f) {
          (f.itens || []).forEach(function (it) { if (it.nome && it.grupo) m[it.nome] = it.grupo; });
        });
        return m;
      })()) + ";" +
      // ATENÇÃO: pernas vem ANTES de braço — 'Quadríceps' também termina em
      // 'íceps' e caía no grupo errado (o Leg press aparecia em Braço)
      "function gcanon(g){g=String(g||'').toLowerCase();" +
      "if(/peito|peitoral/.test(g))return 'Peito';if(/costas|dorsal|trap/.test(g))return 'Costas';" +
      "if(/perna|quadr|posterior|gl\\u00fateo|gluteo|panturr|adutor|abdutor/.test(g))return 'Pernas';" +
      "if(/\\u00edceps|iceps|antebra|bra\\u00e7o|braco/.test(g))return 'Braço';" +
      "if(/ombro|deltoide/.test(g))return 'Ombro';" +
      "if(/abd|core|lombar/.test(g))return 'Abdômen';return 'Outros';}" +
      "function cgDados(){var dc=L('ptdc',{});var gs={};var mesK=isoHj().slice(0,7);" +
      "Object.keys(dc).forEach(function(n){var lst=dc[n]||[];if(!lst.length)return;" +
      "var max=null;lst.forEach(function(e){if(e&&e.kg!=null&&(!max||+e.kg>+max.kg))max=e;});" +
      "var ult=lst[lst.length-1];var noMes=lst.some(function(e){return e&&String(e.d||'').slice(0,7)===mesK;});" +
      "var g=gcanon(EXGRP[n]);gs[g]=gs[g]||{exs:[]};" +
      "gs[g].exs.push({n:n,max:max?+max.kg:0,maxD:max?max.d:'',maxR:max?+max.r||0:0,ult:ult,noMes:noMes,lst:lst});});" +
      "Object.keys(gs).forEach(function(g){gs[g].exs.sort(function(a,b){return b.max-a.max;});gs[g].best=gs[g].exs[0]?gs[g].exs[0].max:0;});return gs;}" +
      "var cgAberto=null,cgBusca='';" +
      // painel de histórico de UM exercício (recorde, 1RM, +% e as barras) —
      // serve pro destaque do grupo E pra qualquer linha clicada
      "var cgEx='';function cgK(n){return String(n).replace(/['\"<>&]/g,'');}" +
      "function cgDest(top){var pri=null;top.lst.forEach(function(e){if(e&&e.kg!=null&&!pri)pri=e;});" +
      "var pctS=pri&&+pri.kg?Math.round(100*(top.max-pri.kg)/pri.kg):0;" +
      "var rm9=top.maxR>1?Math.round((top.max*(1+top.maxR/30))*2)/2:top.max;" +
      "return \"<div style='background:var(--bg4);border-radius:16px;padding:14px;margin:4px 0 12px;'>\"+" +
      "\"<div style='display:flex;justify-content:space-between;font-size:13.5px;'><b>\"+top.n.replace(/</g,'&lt;')+\"</b><span style='color:#8a8695;'>1RM est. <b style='color:#fff;'>\"+String(rm9).replace('.',',')+\" kg</b></span></div>\"+" +
      "\"<div style='display:flex;align-items:baseline;gap:8px;margin-top:2px;'><b style='font-size:26px;font-weight:900;'>\"+String(top.max).replace('.',',')+\"<small style='font-size:14px;'> kg</small></b>\"+" +
      "(pctS>0&&pri?\"<b style='font-size:12.5px;color:#4ade80;'>+\"+pctS+\"% desde \"+String(pri.d||'').slice(8,10)+'/'+String(pri.d||'').slice(5,7)+\"</b>\":'')+'</div>'+" +
      "\"<div style='display:flex;gap:6px;align-items:flex-end;height:74px;margin-top:10px;'>\"+(function(){var l6=top.lst.filter(function(e){return e&&e.kg!=null;}).slice(-6);" +
      "var mx6=0;l6.forEach(function(e){if(+e.kg>mx6)mx6=+e.kg;});" +
      "return l6.map(function(e,i){var hh=Math.round(18+44*(+e.kg)/(mx6||1));var ult9=i===l6.length-1;" +
      "return \"<div style='flex:1;max-width:72px;text-align:center;'><div style='font-size:10px;color:\"+(ult9?'var(--corc)':'#8a8695')+\";font-weight:800;'>\"+String(e.kg).replace('.',',')+\"</div>\"+" +
      "\"<div style='height:\"+hh+\"px;background:\"+(ult9?'linear-gradient(180deg,var(--corc),var(--cor))':'var(--bg7)')+\";border-radius:7px;margin-top:2px;'></div>\"+" +
      "\"<div style='font-size:9px;color:#6e6a78;margin-top:3px;'>\"+String(e.d||'').slice(8,10)+'/'+String(e.d||'').slice(5,7)+\"</div></div>\";}).join('');})()+'</div></div>';}" +
      "function pintaCargas(){var el=document.getElementById('cgBox');if(!el)return;var gs=cgDados();" +
      "var ordem=[['Superiores',['Peito','Costas','Braço','Ombro']],['Inferiores',['Pernas','Abdômen']],['',['Outros']]];" +
      "var tem=Object.keys(gs).length;if(!tem){el.className='vz';el.innerHTML='Anote as cargas nos treinos e elas aparecem aqui.';return;}" +
      "el.className='';var h='';var mesK=isoHj().slice(0,7);" +
      "if(cgAberto==null){var mx=0;Object.keys(gs).forEach(function(g){if(gs[g].best>mx){mx=gs[g].best;cgAberto=g;}});}" +
      "ordem.forEach(function(par){var comG=par[1].filter(function(g){return gs[g];});if(!comG.length)return;" +
      "if(par[0])h+=\"<div class='wpk' style='margin:14px 0 6px;'>\"+par[0]+'</div>';" +
      "comG.forEach(function(g){var d9=gs[g];var ab=cgAberto===g;var nm=d9.exs.filter(function(x){return x.noMes;}).length;" +
      "h+=\"<div style='background:var(--bg2);border:1px solid rgba(255,255,255,.04);border-radius:20px;padding:4px 16px;margin-bottom:10px;'>\"+" +
      "\"<button type='button' data-cgab='\"+g+\"' style='display:flex;align-items:center;gap:10px;width:100%;min-height:56px;background:none;border:none;cursor:pointer;font-family:inherit;color:#fff;text-align:left;padding:8px 0;'>\"+" +
      "\"<b style='font-size:17px;font-weight:800;'>\"+g+\"</b><span style='flex:1;font-size:12px;color:#8a8695;'>\"+pl(d9.exs.length,'exercício','exercícios')+(nm?' · '+nm+' este mês':'')+\"</span>\"+" +
      "\"<b style='font-size:15px;'>\"+(d9.best?String(d9.best).replace('.',',')+' kg':'sem carga')+\"</b>\"+" +
      "\"<span class='mgchev' style='margin:0;transform:rotate(\"+(ab?'-90':'90')+\"deg);'><svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M9 6l6 6-6 6'/></svg></span></button>\";" +
      "if(ab){var top=d9.exs[0];" +
      "if(top&&top.max)h+=cgDest(top);" +
      "h+=\"<input data-cgbusca='1' placeholder='Buscar em \"+g.toLowerCase()+\"' value='\"+cgBusca.replace(/[<'\"]/g,'')+\"' style='width:100%;margin-bottom:10px;border-radius:99px;padding-left:16px;'>\";" +
      "var fil=d9.exs.filter(function(x){return !cgBusca||x.n.toLowerCase().indexOf(cgBusca.toLowerCase())>=0;});" +
      "var doMes=fil.filter(function(x){return x.noMes;});var resto=fil.filter(function(x){return !x.noMes;});" +
      // cada linha com carga é CLICÁVEL: abre o histórico daquele exercício
      // logo abaixo (mesmo painel de barras do destaque) — pedido do Raphael
      "function rowEx(x){var pode=!!x.max;var sel=pode&&cgEx===cgK(x.n);" +
      "var linha=\"<\"+(pode?\"button type='button' data-cgex='\"+cgK(x.n)+\"'\":'div')+\" style='display:flex;align-items:center;justify-content:space-between;width:100%;border-top:1px solid var(--bg5);border-left:none;border-right:none;border-bottom:none;padding:10px 2px;font-size:14px;background:none;font-family:inherit;color:inherit;\"+(pode?'cursor:pointer;':'')+\"'><span style='flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left;\"+(sel?'color:var(--corc);font-weight:800;':'')+\"'>\"+x.n.replace(/</g,'&lt;')+\"</span>\"+" +
      "\"<b style='margin-left:10px;'>\"+(x.max?String(x.max).replace('.',',')+' kg':'corpo')+\"</b><span style='font-size:11px;color:#6e6a78;margin-left:10px;min-width:38px;text-align:right;'>\"+String(x.maxD||'').slice(8,10)+'/'+String(x.maxD||'').slice(5,7)+\"</span></\"+(pode?'button':'div')+\">\";" +
      "return linha+(sel?cgDest(x):'');}" +
      "if(doMes.length)h+=\"<div class='wpk' style='margin:4px 0 2px;'>Mexeu este mês</div>\"+doMes.map(rowEx).join('');" +
      "if(resto.length)h+=(doMes.length?\"<div class='wpk' style='margin:10px 0 2px;'>Os outros</div>\":'')+resto.map(rowEx).join('');" +
      "h+=\"<div style='height:8px;'></div>\";}" +
      "h+='</div>';});});el.innerHTML=h;}" +
      "document.addEventListener('click',function(e){var b=e.target.closest('[data-cgab]');if(!b)return;" +
      "var g=b.getAttribute('data-cgab');cgAberto=cgAberto===g?'':g;cgBusca='';cgEx='';pintaCargas();if(navigator.vibrate)navigator.vibrate(8);});" +
      // linha de exercício clicada → abre/fecha o histórico dele ali mesmo
      "document.addEventListener('click',function(e){var b=e.target.closest('[data-cgex]');if(!b)return;" +
      "var n=b.getAttribute('data-cgex');cgEx=cgEx===n?'':n;pintaCargas();if(navigator.vibrate)navigator.vibrate(8);});" +
      "document.addEventListener('input',function(e){if(!e.target.matches||!e.target.matches('[data-cgbusca]'))return;" +
      "cgBusca=e.target.value;var v9=e.target.value;var p9=e.target.selectionStart;pintaCargas();" +
      "var n9=document.querySelector('[data-cgbusca]');if(n9){n9.focus();n9.value=v9;try{n9.setSelectionRange(p9,p9);}catch(e2){}}});" +
      // 🎯 meta de carga: o aluno escolhe UM exercício e um alvo em kg — a barra
      // acompanha o recorde real (ptdc) e comemora UMA vez ao bater (a marca
      // ptmetacargaok guarda 'ex|alvo': meta nova re-arma o confete sozinha).
      // Sem carga anotada nenhuma, o card nem aparece — nada de botão que finge.
      "function mcMeta(){try{return JSON.parse(L('ptmetacarga',''))||null;}catch(e){return null;}}" +
      "function mcMax(ex){var l=(L('ptdc',{})[ex]||[]);var m=0;l.forEach(function(x){if(x&&+x.kg>m)m=+x.kg;});return m;}" +
      "function pintaMetaCarga(){var box=document.getElementById('mcBox');if(!box)return;var m=mcMeta();" +
      "var exs=Object.keys(L('ptdc',{})).filter(function(n){return mcMax(n)>0;});" +
      "if(!m){box.innerHTML=exs.length?\"<div style='background:var(--bg2);border:1px solid rgba(255,255,255,.04);border-radius:20px;padding:14px 16px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;'><b style='font-size:14px;'>🎯 Meta de carga</b><button type='button' id='mcDef' style='background:none;border:none;color:var(--corc);font-family:inherit;font-size:13px;font-weight:800;cursor:pointer;padding:0;'>Definir uma meta</button></div>\":'';return;}" +
      "var atual=mcMax(m.ex);var pct=m.alvo?Math.max(0,Math.min(100,Math.round(100*atual/m.alvo))):0;var bateu=atual>=m.alvo&&m.alvo>0;" +
      "box.innerHTML=\"<div style='background:var(--bg2);border:1px solid rgba(255,255,255,.04);border-radius:20px;padding:14px 16px;margin-bottom:12px;'>\"+" +
      "\"<div style='display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:13.5px;'><b style='min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'>🎯 \"+String(m.ex).replace(/</g,'&lt;')+\"</b><span style='flex-shrink:0;'>meta <b>\"+String(m.alvo).replace('.',',')+\" kg</b></span></div>\"+" +
      "\"<div style='height:10px;background:var(--bg4);border-radius:99px;overflow:hidden;margin-top:8px;'><div style='height:100%;width:\"+pct+\"%;background:linear-gradient(90deg,\"+(bateu?'#16a34a,#4ade80':'var(--cor),var(--corc)')+\");border-radius:99px;transition:width .5s;'></div></div>\"+" +
      "\"<div style='display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:13px;margin-top:8px;'><b style='min-width:0;color:\"+(bateu?'#4ade80':'inherit')+\";'>\"+(bateu?'META BATIDA! 💪':(atual?String(atual).replace('.',',')+' kg — faltam '+String(Math.round((m.alvo-atual)*10)/10).replace('.',',')+' kg':'anote a carga desse exercício pra ver o progresso'))+\"</b>\"+" +
      "\"<button type='button' id='mcDef' style='background:none;border:none;color:var(--corc);font-family:inherit;font-size:13px;font-weight:800;cursor:pointer;padding:0;flex-shrink:0;'>Mudar</button></div></div>\";" +
      "if(bateu&&L('ptmetacargaok','')!==m.ex+'|'+m.alvo){Sv('ptmetacargaok',m.ex+'|'+m.alvo);try{confete();}catch(e){}}}" +
      "document.getElementById('mcBox').addEventListener('click',function(e){" +
      "if(e.target.closest&&e.target.closest('#mcSalva')){var ex=(document.getElementById('mcEx')||{}).value;var v=parseFloat(String((document.getElementById('mcKg')||{}).value||'').replace(',','.'));" +
      "if(!ex||!v||v<1||v>500){alert('Escolha o exercício e um alvo em kg.');return;}Sv('ptmetacarga',JSON.stringify({ex:ex,alvo:v}));pintaMetaCarga();return;}" +
      "if(e.target.closest&&e.target.closest('#mcTira')){Sv('ptmetacarga','');pintaMetaCarga();return;}" +
      "if(!e.target.closest||!e.target.closest('#mcDef'))return;" +
      "var exs=Object.keys(L('ptdc',{})).filter(function(n){return mcMax(n)>0;}).sort();var m=mcMeta()||{};" +
      "var ops=exs.map(function(n){return \"<option\"+(m.ex===n?' selected':'')+\">\"+n.replace(/</g,'&lt;')+\"</option>\";}).join('');" +
      "document.getElementById('mcBox').innerHTML=\"<div style='background:var(--bg2);border:1px solid rgba(255,255,255,.04);border-radius:20px;padding:14px 16px;margin-bottom:12px;'>\"+" +
      "\"<b style='font-size:14px;'>🎯 Meta de carga</b><div style='display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;'>\"+" +
      "\"<select id='mcEx' style='flex:2;min-width:120px;'>\"+ops+\"</select>\"+" +
      "\"<input id='mcKg' type='number' inputmode='decimal' placeholder='kg' value='\"+(m.alvo||'')+\"' style='flex:1;min-width:70px;'>\"+" +
      "\"<button type='button' id='mcSalva' style='flex:1;min-width:90px;min-height:40px;background:var(--cor);color:#fff;border:none;border-radius:12px;font-family:inherit;font-weight:800;font-size:13.5px;cursor:pointer;'>Salvar</button></div>\"+" +
      "(m.ex?\"<button type='button' id='mcTira' style='background:none;border:none;color:#8a8695;font-family:inherit;font-size:12px;cursor:pointer;padding:8px 0 0;'>tirar a meta</button>\":'')+'</div>';});" +
      "pintaCargas();pintaMetaCarga();window.__pintaCargas=pintaCargas;window.__metaCarga={pinta:pintaMetaCarga,de:mcMeta,max:mcMax};" +
      /* ---------- Esforço e batimento (v668): o dado que o aluno gera volta pra ele ----------
       * RPE (ptrpe) vira barras por semana com os MESMOS cortes do painel (média
       * >=2,5 pesado / >=1,6 na medida / senão leve — os dois lados contam a mesma
       * história); batimento (ptfc) só aparece com dado REAL (sem cinta, nada — a
       * regra honesta da v580) e zona só com idade (v581): sem ptidade a barra sai
       * na cor da marca, sem rótulo Zn, com a dica de informar a idade. */
      "function pintaEsforco(){var el=document.getElementById('esfBox');if(!el)return;var h='';" +
      "function cx9(m9){return \"<div style='background:var(--bg2);border:1px solid rgba(255,255,255,.04);border-radius:20px;padding:14px 16px;margin-top:10px;'>\"+m9+'</div>';}" +
      "var r9=L('ptrpe',{}),rks=Object.keys(r9).filter(function(k){return /^\\d{4}-\\d{2}-\\d{2}$/.test(k)&&[1,2,3].indexOf(+r9[k])>-1;}).sort();" +
      "if(!rks.length){h+=cx9(\"<div class='wpk'>COMO OS TREINOS PESARAM</div><div class='vz' style='text-align:left;padding:6px 0 0;'>Responda a pergunta do fim do treino (Leve, Na medida ou Pesado) que a leitura aparece aqui.</div>\");}" +
      "else{var c28=new Date();c28.setDate(c28.getDate()-28);var iso28=isoLoc(c28);var n1=0,n2=0,n3=0;" +
      "rks.forEach(function(k){if(k<iso28)return;var v9=+r9[k];if(v9===1)n1++;else if(v9===2)n2++;else n3++;});" +
      "var dom=n3&&n3>=n2&&n3>=n1?'Pesado':(n2&&n2>=n1?'Na medida':(n1?'Leve':''));" +
      "var sem9={};rks.forEach(function(k){var s9=semDe(k);(sem9[s9]=sem9[s9]||[]).push(+r9[k]);});" +
      "var sks=Object.keys(sem9).sort().slice(-8);" +
      "h+=cx9(\"<div class='wpk'>COMO OS TREINOS PESARAM</div>\"+" +
      "(dom?\"<div style='font-size:17px;font-weight:800;margin-top:6px;'>\"+dom+\"<span style='font-size:11.5px;color:#8a8695;font-weight:700;'> · últimos 28 dias: \"+n1+' leve'+(n1===1?'':'s')+' · '+n2+' na medida · '+n3+' pesado'+(n3===1?'':'s')+'</span></div>':'')+" +
      "\"<div style='display:flex;gap:6px;align-items:flex-end;height:74px;margin-top:10px;'>\"+sks.map(function(s9){" +
      "var l9=sem9[s9],med=l9.reduce(function(t,v9){return t+v9;},0)/l9.length;" +
      "var hh=Math.round(18+44*(med-1)/2);var cor=med>=2.5?'#fb923c':(med>=1.6?'var(--corc)':'#4ade80');" +
      "return \"<div style='flex:1;max-width:72px;text-align:center;'><div style='font-size:10px;color:#8a8695;font-weight:800;'>\"+String(Math.round(med*10)/10).replace('.',',')+\"</div>\"+" +
      "\"<div style='height:\"+hh+\"px;background:\"+cor+\";border-radius:7px;margin-top:2px;'></div>\"+" +
      "\"<div style='font-size:9px;color:#6e6a78;margin-top:3px;'>\"+s9.slice(8,10)+'/'+s9.slice(5,7)+\"</div></div>\";}).join('')+'</div>'+" +
      "\"<div style='font-size:11px;color:#6e6a78;margin-top:8px;'>média da semana: 1 leve · 2 na medida · 3 pesado</div>\");}" +
      "var f9=L('ptfc',{}),fks=Object.keys(f9).filter(function(k){var v9=f9[k];return /^\\d{4}-\\d{2}-\\d{2}$/.test(k)&&v9&&+v9.m>=25&&+v9.m<=240&&+v9.x>=25&&+v9.x<=240;}).sort();" +
      "if(fks.length){var l6f=fks.slice(-6);var minM=999,maxX=0;l6f.forEach(function(k){if(+f9[k].m<minM)minM=+f9[k].m;if(+f9[k].x>maxX)maxX=+f9[k].x;});" +
      "var piso=Math.max(30,minM-6),teto=maxX+4,idd=hrIdade();" +
      "h+=cx9(\"<div class='wpk'>BATIMENTO NOS TREINOS</div>\"+" +
      "\"<div style='display:flex;gap:6px;align-items:flex-end;height:74px;margin-top:10px;'>\"+l6f.map(function(k){" +
      "var m9=+f9[k].m;var hh=Math.round(18+44*(m9-piso)/((teto-piso)||1));" +
      "var cor=idd>0?HRZC[hrZ(m9)]:'linear-gradient(180deg,var(--corc),var(--cor))';" +
      "return \"<div style='flex:1;max-width:72px;text-align:center;'><div style='font-size:10px;color:#8a8695;font-weight:800;'>\"+Math.round(m9)+\"</div>\"+" +
      "\"<div style='height:\"+hh+\"px;background:\"+cor+\";border-radius:7px;margin-top:2px;'></div>\"+" +
      "\"<div style='font-size:9px;color:#6e6a78;margin-top:3px;'>\"+k.slice(8,10)+'/'+k.slice(5,7)+\"</div></div>\";}).join('')+'</div>'+" +
      "\"<div style='font-size:11px;color:#6e6a78;margin-top:8px;'>\"+(idd>0?('máxima estimada '+hrMax()+' bpm · última média em '+HRZN[hrZ(+f9[l6f[l6f.length-1]].m)]):'Diga sua idade no card da cinta pra ver as zonas de batimento')+\" · escala a partir de \"+piso+\" bpm</div>\");}" +
      "el.innerHTML=h;}" +
      "pintaEsforco();window.__pintaEsforco=pintaEsforco;" +
      // ---------- Marcas (tela 32): corrida, força e circuitos ----------
      "function mkCorrida(){var corr=L('ptcardio',[]).filter(function(x){return x.m==='corrida'&&+x.k>0.05;});var out=[];" +
      "if(!corr.length)return out;var mesK=isoHj().slice(0,7);" +
      "function add(rot,val,d){if(val!=null)out.push({rot:rot,val:val,d:d,nova:String(d||'').slice(0,7)===mesK});}" +
      "var mxK=null;corr.forEach(function(x){if(!mxK||+x.k>+mxK.k)mxK=x;});add('Maior distância',String(mxK.k).replace('.',',')+' km',mxK.d);" +
      "var mp=null;corr.forEach(function(x){if(+x.k>=3&&x.p){if(!mp||x.p<mp.p)mp=x;}});if(mp)add('Melhor pace médio (3 km+)',mp.p,mp.d);" +
      "[[5,'5 km'],[10,'10 km']].forEach(function(par){var mel=null;corr.forEach(function(x){if(+x.k>=par[0]*0.95&&+x.k<=par[0]*1.12){if(!mel||+x.s<+mel.s)mel=x;}});" +
      "if(mel)add(par[1],Math.floor(mel.s/60)+':'+('0'+Math.round(mel.s%60)).slice(-2),mel.d);});" +
      "return out;}" +
      "function pintaMarcas(){var el=document.getElementById('mkBox');if(!el)return;el.className='';var mesK=isoHj().slice(0,7);" +
      "var corr=mkCorrida();" +
      "function card(tit,sub,dir,corpo){return \"<div style='background:var(--bg2);border:1px solid rgba(255,255,255,.04);border-radius:20px;padding:14px 16px;margin-bottom:10px;'>\"+" +
      "\"<div style='display:flex;align-items:center;justify-content:space-between;'><span><b style='font-size:17px;font-weight:800;'>\"+tit+\"</b><span style='display:block;font-size:12px;color:#8a8695;margin-top:1px;'>\"+sub+\"</span></span><b style='font-size:13px;color:#d6d2df;'>\"+dir+\"</b></div>\"+corpo+'</div>';}" +
      "function rowMk(m){return \"<div style='display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--bg5);padding:10px 2px;font-size:14px;margin-top:2px;'><span>\"+m.rot+" +
      "(m.nova?\"<span style='background:rgba(251,191,36,.14);color:#fbbf24;border-radius:99px;padding:2px 9px;font-size:9.5px;font-weight:800;letter-spacing:.08em;margin-left:8px;'>NOVA</span>\":'')+\"</span>\"+" +
      "\"<span style='display:flex;gap:10px;align-items:baseline;'><b style='font-size:15px;'>\"+m.val+\"</b><span style='font-size:11px;color:#6e6a78;'>\"+String(m.d||'').slice(8,10)+'/'+String(m.d||'').slice(5,7)+\"</span></span></div>\";}" +
      "var h='';" +
      "h+=card('Corrida','entram sozinhas quando você corre no app',pl(corr.length,'marca','marcas'),corr.length?corr.map(rowMk).join(''):\"<div class='vz' style='text-align:left;padding:8px 0 0;'>Corre com o app aberto que as marcas entram aqui.</div>\");" +
      "var dc=L('ptdc',{});var forca=[];Object.keys(dc).forEach(function(n){var mx=null;(dc[n]||[]).forEach(function(e){if(e&&e.kg!=null&&(!mx||+e.kg>+mx.kg))mx=e;});" +
      "if(mx&&+mx.kg>0)forca.push({rot:n.replace(/</g,'&lt;'),val:String(mx.kg).replace('.',',')+' kg',d:mx.d,nova:String(mx.d||'').slice(0,7)===mesK,kg:+mx.kg});});" +
      "forca.sort(function(a,b){return b.kg-a.kg;});" +
      "h+=card('Força','suas maiores cargas anotadas',pl(forca.length,'levantamento','levantamentos'),forca.length?forca.slice(0,6).map(rowMk).join(''):\"<div class='vz' style='text-align:left;padding:8px 0 0;'>Anota as cargas no treino que os recordes aparecem.</div>\");" +
      "var wr=L('ptwodres',{});var feitos=0;var bhs=[];(typeof WODS!=='undefined'?WODS:[]).forEach(function(w){var lst=wr[w.id]||[];if(!lst.length)return;feitos++;" +
      "var ult=lst[lst.length-1];bhs.push({rot:String(w.n).replace(/</g,'&lt;'),val:String(ult.r||'').replace(/</g,'&lt;'),d:ult.d,nova:String(ult.d||'').slice(0,7)===mesK});});" +
      "if(typeof WODS!=='undefined'&&WODS.length)h+=card('Circuitos',bhs.length?'seu último resultado em cada um':'os circuitos que o professor montou',feitos+' de '+WODS.length+' feitos',bhs.map(rowMk).join(''));" +
      "var mm=L('ptmarcas',[]);if(mm.length)h+=card('Marcadas na mão','anotadas por você',pl(mm.length,'marca','marcas'),mm.slice().reverse().map(function(m){return rowMk({rot:String(m.n).replace(/</g,'&lt;'),val:String(m.v).replace(/</g,'&lt;'),d:m.d,nova:String(m.d||'').slice(0,7)===mesK});}).join(''));" +
      "h+=\"<button type='button' id='mkAdd' class='btnx' style='width:100%;background:var(--bg4);border:1px solid rgba(255,255,255,.07);color:#d6d2df;box-shadow:none;'>+ Marcar na mão</button>\";" +
      "el.innerHTML=h;}" +
      "document.addEventListener('click',function(e){if(!e.target.closest||!e.target.closest('#mkAdd'))return;" +
      "var n9=prompt('Qual marca? (ex.: Prancha, Flexões seguidas)');if(!n9)return;var v9=prompt('Qual foi o resultado? (ex.: 2:30, 25 reps)');if(!v9)return;" +
      "var mm=L('ptmarcas',[]);mm.push({n:String(n9).slice(0,40),v:String(v9).slice(0,20),d:isoHj()});if(mm.length>30)mm.shift();Sv('ptmarcas',mm);pintaMarcas();});" +
      "pintaMarcas();window.__pintaMarcas=pintaMarcas;" +
      // cabeçalho da Evolução por aba (corpo = delta do peso; cargas/marcas = novidades do mês)
      "window.__evTopoPinta=function(aba){var nv9=document.getElementById('evTopoNv'),alt=document.getElementById('evTopoAlt');if(!nv9||!alt)return;" +
      "if(aba==='conq'){nv9.style.display='flex';alt.style.display='none';return;}" +
      "nv9.style.display='none';alt.style.display='block';" +
      "var K=document.getElementById('evAltK'),N=document.getElementById('evAltN'),S=document.getElementById('evAltS');var mesK=isoHj().slice(0,7);" +
      "var MESL9=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];var mesNome=MESL9[+mesK.slice(5,7)-1];" +
      "if(aba==='corpo'){K.textContent='Minha evolução';" +
      "var pz=L('ptpeso',{});var pts={};Object.keys(pz).forEach(function(k){pts[k]=+pz[k];});(AVS||[]).forEach(function(v){if(v.peso!=null&&pts[v.data]==null)pts[v.data]=+v.peso;});" +
      "var ks=Object.keys(pts).sort();" +
      "if(ks.length<2){N.textContent='Corpo';S.textContent='registre seu peso pra acompanhar';return;}" +
      "var d9=Math.round((pts[ks[ks.length-1]]-pts[ks[0]])*10)/10;" +
      "N.innerHTML=(d9>0?'+':'')+String(d9).replace('.',',')+\"<small style='font-size:18px;'> kg</small>\";" +
      "var cin=(AVS||[]).filter(function(v){return v.cintura!=null;});var cinTx='';" +
      "if(cin.length>1){var dc9=Math.round((cin[cin.length-1].cintura-cin[0].cintura)*10)/10;if(dc9)cinTx='e '+(dc9>0?'+':'')+String(dc9).replace('.',',')+' cm de cintura ';}" +
      "S.textContent=cinTx+'desde '+MESL9[+ks[0].slice(5,7)-1];return;}" +
      "if(aba==='cargas'){K.textContent='Minhas cargas';var dc=L('ptdc',{});var rec=0;" +
      "Object.keys(dc).forEach(function(n){var lst=dc[n]||[];var mx=null;lst.forEach(function(e){if(e&&e.kg!=null&&(!mx||+e.kg>+mx.kg))mx=e;});" +
      "if(mx&&String(mx.d||'').slice(0,7)===mesK&&lst.filter(function(e){return e&&e.kg!=null;}).length>1)rec++;});" +
      "N.textContent=rec;S.textContent=(rec===1?'recorde novo':'recordes novos')+' em '+mesNome;return;}" +
      "K.textContent='Minhas marcas';var nova=mkCorrida().filter(function(m){return m.nova;}).length;" +
      "var mm=L('ptmarcas',[]).filter(function(m){return String(m.d||'').slice(0,7)===mesK;}).length;" +
      "var dc9=L('ptdc',{});Object.keys(dc9).forEach(function(n){var mx=null;(dc9[n]||[]).forEach(function(e){if(e&&e.kg!=null&&(!mx||+e.kg>+mx.kg))mx=e;});" +
      "if(mx&&String(mx.d||'').slice(0,7)===mesK)nova++;});" +
      "N.textContent=nova+mm;S.textContent=((nova+mm)===1?'marca nova':'marcas novas')+' em '+mesNome;};" +
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
          "\"<span>\"+(med[i]||(i+1)+'º')+' '+(r.nome||'Aluno')+\"</span><b>\"+pl(r.dias,'treino','treinos')+\"</b></div>\";}).join('');});})();"
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
          "\"<span style='font-size:12.5px;color:#8a8695;'>\"+pl((p.comentarios||[]).length,'comentário','comentários')+\"</span></div>\"+" +
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
          "if(r&&r.ok&&Array.isArray(r.posts)){try{Sv('ptfeed',r.posts.map(function(p){var q=Object.assign({},p);delete q.foto;return q;}));}catch(e){}pinta(r.posts);return;}" +
          "pinta(L('ptfeed',[]));}).catch(function(){carregando=false;pinta(L('ptfeed',[]));});}" +
          "pinta(L('ptfeed',[]));carrega();rankSemana();" +
          /* Olha o DOM em vez da variável SEC: SEC é private do IIFE do menu
           * (lá embaixo), então aqui ela nunca existiu — o timer estourava
           * "SEC is not defined" a cada 45 s e a Comunidade nunca recarregava
           * sozinha. O atributo data-sec-off é a mesma verdade, e é público. */
          "setInterval(function(){if(document.querySelector(\"[data-sec='feed']:not([data-sec-off])\"))carrega();},45000);})();"
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
        "var chave=(QUESTAPP.env||'')+'|'+per;var T=QUESTAPP.ps.length;" +
        // o menu (tela 01) pergunta se tem questionário esperando — 1 ou 0
        "window.__qaPend=function(){if(hj<desde)return 0;return L('ptqa',{})[chave]?0:1;};" +
        /* R3: fluxo paginado (telas 02-06) — uma pergunta por tela, resposta
         * parcial guardada no aparelho (dá pra parar no meio e voltar), e o
         * envio final é o MESMO de antes: app_quest_responde com a mesma lista */
        "function draftLe(){var d=L('ptqadraft',{});return d[chave]||{i:0,R:{},T:{}};}" +
        "function draftSalva(d){var all=L('ptqadraft',{});all[chave]=d;Sv('ptqadraft',all);}" +
        "function draftLimpa(){var all=L('ptqadraft',{});delete all[chave];Sv('ptqadraft',all);}" +
        // responder/destrancar também atualiza o badge do menu (tela 01)
        "function pinta(){pinta0();if(window.__menuBadges)window.__menuBadges();}" +
        "function pinta0(){var resp=L('ptqa',{});el.className='';el.style.textAlign='left';" +
        // a faixa roxa É o card: o que vier em "dentro" fica junto dela
        "function cabQ(dentro){return \"<div style='background:linear-gradient(160deg,var(--cor),var(--cor2));border-radius:22px;padding:18px 20px;color:#fff;'>\"+" +
        "\"<div style='font-size:9.5px;font-weight:800;letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.75);'>Do seu personal pra você</div>\"+" +
        "\"<div style='font-size:24px;font-weight:900;letter-spacing:-.02em;margin-top:4px;'>\"+eh(QUESTAPP.nome)+'</div>'+" +
        "\"<div style='font-size:13.5px;color:rgba(255,255,255,.85);margin-top:4px;'>\"+pl(T,'pergunta','perguntas')+' · leva 1 minuto</div>'+(dentro||'')+'</div>';}" +
        "var cab=cabQ('');" +
        "if(hj<desde){el.innerHTML=cab+\"<div style='border:1.5px dashed var(--bg11);border-radius:18px;padding:14px 16px;margin-top:12px;'><b style='font-size:14.5px;'>Trancado até \"+diaBr(desde)+\"</b><div style='font-size:12.5px;color:#8a8695;margin-top:2px;'>seu personal libera nesse dia — volta aqui</div></div>\";return;}" +
        "if(resp[chave]){el.innerHTML=cab+\"<div style='background:var(--bg2);border-radius:18px;padding:14px 16px;margin-top:12px;font-size:14px;color:#d6d2df;'>Respondido — seu personal já recebeu.\"+(QUESTAPP.repete?' O próximo libera dia <b>'+diaBr(isoAdd(per,7))+'</b>.':'')+'</div>';return;}" +
        "var d0=L('ptqadraft',{})[chave];var temD=!!(d0&&(Object.keys(d0.R||{}).length||Object.keys(d0.T||{}).length));" +
        // o botão entra DENTRO da faixa roxa: um card só, sem o parágrafo de
        // "pra que serve" nem a lista de perguntas (que ele vê ao responder)
        "el.innerHTML=cabQ(\"<button class='btnx qsbt' id='qaAbrir'>\"+(temD?'Continuar de onde parou':'Responder agora')+'</button>');}" +
        "var fx=null,stq=null;" +
        "function fechaFluxo(){if(fx){fx.remove();fx=null;}pinta();}" +
        "function respondida(i){var p=QUESTAPP.ps[i]||{};if(p.tipo==='emoji'||p.tipo==='linear')return stq.R[i]!=null;return true;}" +
        "function prF(){var p=QUESTAPP.ps[stq.i]||{};var done=respondida(stq.i);var ultima=stq.i===T-1;" +
        "var barra=QUESTAPP.ps.map(function(x,xi){return \"<i class='\"+(xi===stq.i?'on':'')+\"'></i>\";}).join('');" +
        "var corpo='';" +
        "if(p.tipo==='emoji'){corpo=(p.ops||[]).map(function(o,j){var on=stq.R[stq.i]&&stq.R[stq.i].j===j;" +
        "return \"<button class='qaop\"+(on?' on':'')+\"' data-qj='\"+j+\"'><span class='qe'>\"+eh(o.e)+\"</span><span style='flex:1;text-align:left;font-size:17px;font-weight:800;'>\"+eh(o.r)+'</span>'+(on?\"<span style='font-size:20px;'>✓</span>\":'')+'</button>';}).join('')+" +
        "\"<div style='text-align:center;font-size:12.5px;color:#6e6a78;margin-top:12px;'>toque numa opção pra avançar automático</div>\";}" +
        "else if(p.tipo==='linear'){var sel=stq.R[stq.i]?String(stq.R[stq.i].r):null;var ns='';" +
        "for(var n=0;n<=10;n++)ns+=\"<button class='notabtn\"+(sel===String(n)?' on':'')+\"' data-qv='\"+n+\"'>\"+n+'</button>';" +
        "corpo=\"<div style='display:grid;grid-template-columns:repeat(6,1fr);gap:8px;'>\"+ns+'</div>'+" +
        "\"<div style='display:flex;justify-content:space-between;font-size:12.5px;color:#6e6a78;margin-top:10px;'><span>0 · mínimo</span><span>10 · máximo</span></div>\";}" +
        "else{corpo=\"<textarea id='qaTxt' rows='4' class='wpobs' placeholder='Escreva aqui… (opcional)'></textarea>\";}" +
        "fx.innerHTML=\"<div style='max-width:480px;margin:0 auto;min-height:100%;display:flex;flex-direction:column;padding:calc(12px + env(safe-area-inset-top,0px)) 18px calc(20px + env(safe-area-inset-bottom,0px));'>\"+" +
        "\"<div style='display:flex;align-items:center;gap:10px;'><button id='qaX' aria-label='Fechar o questionário' style='flex:none;width:44px;height:44px;border-radius:50%;background:var(--bg2);border:1px solid var(--bg11);color:#fff;font-size:16px;font-family:inherit;cursor:pointer;'>✕</button>\"+" +
        "\"<span style='flex:1;text-align:center;font-size:10.5px;font-weight:800;letter-spacing:.22em;color:#8a8695;text-transform:uppercase;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'>\"+eh(QUESTAPP.nome)+'</span>'+" +
        "\"<span style='flex:none;font-size:15px;font-weight:900;'>\"+(stq.i+1)+\"<span style='color:#6e6a78;'>/\"+T+'</span></span></div>'+" +
        "\"<div class='qabar'>\"+barra+'</div>'+" +
        "\"<div style='font-size:clamp(24px,7vw,30px);font-weight:900;letter-spacing:-.02em;line-height:1.15;margin:22px 0 14px;'>\"+eh(p.texto)+'</div>'+" +
        "\"<div style='flex:1;'>\"+corpo+'</div>'+" +
        "\"<button id='qaProx' class='btnx' style='width:100%;min-height:58px;font-size:17px;margin-top:16px;\"+(done?'':'opacity:.45;')+\"'>\"+(ultima?'Enviar':'Próxima')+'</button>'+" +
        "(stq.i>0?\"<button id='qaAnt' style='background:none;border:none;color:#8a8695;font-family:inherit;font-size:13.5px;font-weight:700;padding:12px;cursor:pointer;'>‹ pergunta anterior</button>\":'')+'</div>';" +
        "var tx=document.getElementById('qaTxt');if(tx)tx.value=stq.T[stq.i]||'';}" +
        "function avanca(){if(!respondida(stq.i)||!fx)return;if(stq.i<T-1){stq.i++;draftSalva({i:stq.i,R:stq.R,T:stq.T});prF();}else{envia();}}" +
        "function abreFluxo(){var d=draftLe();stq={i:Math.min(+d.i||0,T-1),R:d.R||{},T:d.T||{}};" +
        "fx=document.createElement('div');fx.id='qaFluxo';document.body.appendChild(fx);" +
        "fx.addEventListener('input',function(e){if(e.target.id==='qaTxt'){stq.T[stq.i]=e.target.value;draftSalva({i:stq.i,R:stq.R,T:stq.T});}});" +
        "fx.addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;" +
        "if(b.id==='qaX'){draftSalva({i:stq.i,R:stq.R,T:stq.T});fechaFluxo();return;}" +
        "if(b.id==='qaAnt'){stq.i=Math.max(0,stq.i-1);prF();return;}" +
        "if(b.id==='qaProx'){avanca();return;}" +
        "if(b.dataset.qj!=null){var p2=QUESTAPP.ps[stq.i]||{};var o=(p2.ops||[])[+b.dataset.qj]||{};" +
        "stq.R[stq.i]={r:o.r||o.e||'',p:+o.p||0,j:+b.dataset.qj};draftSalva({i:stq.i,R:stq.R,T:stq.T});prF();setTimeout(avanca,350);return;}" +
        "if(b.dataset.qv!=null){stq.R[stq.i]={r:b.dataset.qv,p:+b.dataset.qv};draftSalva({i:stq.i,R:stq.R,T:stq.T});prF();return;}});" +
        "prF();}" +
        "function enviadoTela(){fx.innerHTML=\"<div style='min-height:100%;background:linear-gradient(180deg,var(--cor) 0%,var(--cor2) 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px 24px calc(24px + env(safe-area-inset-bottom,0px));'>\"+" +
        "\"<div style='width:82px;height:82px;border-radius:50%;background:rgba(255,255,255,.22);border:1.5px solid rgba(255,255,255,.4);display:flex;align-items:center;justify-content:center;font-size:38px;color:#fff;'>✓</div>\"+" +
        "\"<div style='font-size:11px;font-weight:800;letter-spacing:.26em;color:rgba(255,255,255,.75);text-transform:uppercase;margin-top:22px;'>Respondido</div>\"+" +
        "\"<div style='font-size:30px;font-weight:900;color:#fff;letter-spacing:-.02em;margin-top:8px;'>Seu personal já recebeu</div>\"+" +
        "\"<div style='font-size:15px;color:rgba(255,255,255,.85);margin-top:10px;max-width:320px;line-height:1.5;'>Ele vai olhar isso antes de montar a sua semana. Se algo mudar, manda no chat.</div>\"+" +
        "(QUESTAPP.repete?\"<div style='margin-top:18px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.3);border-radius:16px;padding:12px 18px;color:#fff;font-size:14px;'>O próximo libera dia <b>\"+diaBr(isoAdd(per,7))+'</b> — o app avisa.</div>':'')+" +
        "\"<div style='flex:1;min-height:24px;'></div>\"+" +
        "\"<button id='qaVoltaIni' style='width:100%;min-height:58px;border-radius:99px;background:#fff;border:none;color:var(--cor-esc,#3b2b63);font-family:inherit;font-size:17px;font-weight:800;cursor:pointer;'>Voltar pro início</button>\"+" +
        "\"<button id='qaChat' style='width:100%;min-height:52px;border-radius:99px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.3);color:#fff;font-family:inherit;font-size:15px;font-weight:800;cursor:pointer;margin-top:10px;'>Falar com o seu personal</button></div>\";" +
        "var vi=document.getElementById('qaVoltaIni');if(vi)vi.onclick=function(){fechaFluxo();if(window.__trocaSec)window.__trocaSec('inicio');};" +
        "var fc=document.getElementById('qaChat');if(fc)fc.onclick=function(){fechaFluxo();if(window.__trocaSec)window.__trocaSec('chat');};}" +
        "function envia(){var lista=QUESTAPP.ps.map(function(p,i){" +
        "if(p.tipo!=='emoji'&&p.tipo!=='linear')return {sigla:p.s||'',pergunta:p.texto,resposta:String(stq.T[i]||'').trim(),pontos:null,menos:!!p.mm};" +
        "var r=stq.R[i]||{};return {sigla:p.s||'',pergunta:p.texto,resposta:r.r,pontos:r.p,menos:!!p.mm};});" +
        "var total=0,temP=false;lista.forEach(function(x){if(x&&x.pontos!=null){total+=(x.menos?-x.pontos:x.pontos);temP=true;}});" +
        "var bt=document.getElementById('qaProx');if(bt){bt.disabled=true;bt.textContent='Enviando…';}" +
        "var fim=function(){var resp=L('ptqa',{});resp[chave]=1;Sv('ptqa',resp);draftLimpa();enviadoTela();};" +
        "if(NUVEM){rpcApp('app_quest_responde',{t:TOKEN,p_nome:QUESTAPP.nome,p_dados:{respostas:lista,pontuacao:temP?total:null}}).then(function(r){" +
        "if(r&&r.ok){fim();}else{if(bt){bt.disabled=false;bt.textContent='Enviar';}alert((r&&r.erro)||'Não deu pra enviar agora — confere a internet e tenta de novo.');}});}" +
        "else{var msg=QUESTAPP.nome+' — '+PRIMEIRO+'\\n'+lista.map(function(x){return (x.sigla?x.sigla+': ':'')+x.resposta;}).join('\\n');" +
        "window.open('https://wa.me/'+(ZAPP?'55'+ZAPP:'')+'?text='+encodeURIComponent(msg),'_blank');fim();}}" +
        "el.addEventListener('click',function(ev){if(ev.target.closest&&ev.target.closest('#qaAbrir'))abreFluxo();});" +
        "window.__qaFluxo=abreFluxo;" +
        "pinta();})();"
        : "") +
      // hero "treino de hoje" + progresso rápido + XP (estilo Prime)
      // a foto do card do dia: a da ficha manda; sem ela, entra a geral da Personalização
      // a foto geral vai UMA vez só: repetir a mesma imagem em cada ficha inchava
      // o app (6 fichas × 235 KB viravam 1,4 MB de dado repetido no download do aluno)
      (function () {
        var imgOk = function (u) { return /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(String(u || "")) ? u : ""; };
        var geral = imgOk((st.config || {}).capaTreino);
        // só os tipos realmente usados por este aluno (o painel já filtra)
        var usadas = {};
        Object.keys(CAPT).forEach(function (k) { if (imgOk(CAPT[k])) usadas[k] = CAPT[k]; });
        return "var CAPA_GERAL=" + jsonApp(geral) + ";var CAPAS_TIPO=" + jsonApp(usadas) + ";" +
          "function capaFM(c){return c?(String(c).slice(0,5)==='data:'?c:(CAPAS_TIPO[c]||'')):'';}" +
          "var FICHAS_META=" + jsonApp((fichasApp || []).map(function (f) {
            var propria = imgOk(f.capa) || (f.ck && imgOk(CAPT[f.ck] || "") ? f.ck : "");
            // duração estimada: séries × (execução ~40s + descanso), em blocos de 5 min
            var seg = f.itens.reduce(function (t, it) { return t + (parseInt(it.series, 10) || 3) * (40 + (+it.descanso || 60)); }, 0);
            // e = nomes dos primeiros exercícios: viram a lista fantasma do herói
            return { t: f.titulo || "Ficha", n: f.itens.length, c: propria === geral ? "" : propria,
              m: Math.max(10, Math.round(seg / 60 / 5) * 5),
              e: f.itens.slice(0, 7).map(function (it) { return String(it.nome || "").slice(0, 40); }) };
          })) + ";" +
          // semana do aluno: dia da semana → treino planejado (já resolvido no painel)
          "var PLANO=" + jsonApp(planoApp) + ";" +
          // texto da faixa roxa dos Treinos, um por aba (o script só troca o texto)
          "var MESAPP=" + jsonApp(D.mesApp || {}) + ";" +
          "var TRHEAD=" + jsonApp((function () {
            var porStudio = "montado por " + studio;
            var totSer = 0;
            (fichasApp || []).forEach(function (f) { f.itens.forEach(function (it) { totSer += (+it.series || 3); }); });
            var nw = (wodsApp || []).length, nc = (cardiosApp || []).length;
            return {
              ficha: fichasApp && fichasApp.length
                ? { n: fichasApp.length + (fichasApp.length === 1 ? " ficha" : " fichas"), s: totSer + " séries na semana",
                    sub: porStudio + (fichaVenceApp ? " · vale até " + S.fmtData(fichaVenceApp) : "") }
                : { n: "Seu treino", s: "", sub: porStudio },
              wod: nw ? { n: nw + (nw === 1 ? " circuito" : " circuitos"), s: "prontos pra você", sub: porStudio }
                : { n: "Circuito", s: "cronômetro livre", sub: "monte o seu aqui mesmo" },
              cardio: nc ? { n: nc + (nc === 1 ? " treino" : " treinos"), s: "de corrida e bike", sub: porStudio }
                : { n: "Corrida e bike", s: "treino livre", sub: "comece quando quiser" },
            };
          })()) + ";";
      })() +
      // com a Semana do aluno (PLANO), o card HOJE segue o plano do professor:
      // ficha abre a gaveta certa, circuito/corrida apontam a sub-aba, dia sem
      // treino vira descanso; sem plano, vale o rodízio de sempre
      "var DSEM_=['DOMINGO','SEGUNDA','TERÇA','QUARTA','QUINTA','SEXTA','SÁBADO'];" +
      "var MESL_=['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];" +
      /* recado do coach sobre o treino de HOJE (telas 44/45/46): carga da
       * última vez na ficha, placar a bater no circuito, pace na corrida.
       * Sem dado nenhum, devolve null e o card segue com o recado da semana. */
      "function coachDica(){try{" +
      "function e9(t){return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;');}" +
      "var pj=PLANO&&PLANO[String(new Date().getDay())];var fm=null;" +
      "if(PLANO){if(pj&&pj.tp==='ficha'&&FICHAS_META[pj.i])fm=FICHAS_META[pj.i];" +
      "else if(pj&&pj.tp==='wod'){var w=WODS[pj.i];if(!w)return null;" +
      "var u=(L('ptwodres',{})[w.id]||[]).slice(-1)[0];" +
      "return u?'Última vez no <b>'+e9(w.n)+'</b>: <b>'+e9(String(u.r||'').slice(0,20))+'</b>. Bora passar disso hoje?':" +
      "'Circuito novo na área: <b>'+e9(w.n)+'</b>. Anota o placar no fim!';}" +
      "else if(pj&&pj.tp==='cardio'){var c=CARDIOS[pj.i];if(!c)return null;" +
      "return c.t==='misto'?('Faz a parte cont\\u00ednua inteira ANTES dos tiros — e nos '+c.ti+'s fortes n\\u00e3o segura nada.'):" +
      "c.t==='intervalado'?('Segura o forte nos '+c.ti+' segundos e recupera DE VERDADE nos '+c.de+'s leves. Sem pressa na largada.'):" +
      "(c.p?'Segura o pace de <b>'+e9(c.p)+'</b> do começo ao fim — terminar com sobra é o plano.':" +
      "'Ritmo de conversa do começo ao fim — constância vale mais que velocidade.');}" +
      "else return null;}" + // dia de descanso no plano → recado da semana
      "if(!fm&&!PLANO&&FICHAS_META.length)fm=FICHAS_META[Object.keys(L('ptfeitos',{})).length%FICHAS_META.length];" +
      "if(!fm||!fm.e)return null;" +
      // o exercício da ficha com anotação mais recente vira sugestão de carga
      "var h=L('ptdc',{}),ml=null;" +
      "fm.e.forEach(function(nm){var l=h[nm]||[];var u2=l[l.length-1];" +
      "if(u2&&+u2.kg>0&&(!ml||String(u2.d)>String(ml.u.d)))ml={n:nm,u:u2};});" +
      "if(!ml)return null;var kg=+ml.u.kg,sg=kg+(kg<20?1:2.5);" +
      "return 'Na última <b>'+e9(ml.n)+'</b> você fechou '+(+ml.u.r>0?ml.u.r+'×':'')+gnum(kg)+' kg — hoje vale tentar <b>'+gnum(sg)+' kg</b>.';" +
      "}catch(e){return null;}}" +
      // resumo curto de um circuito (mesmo texto do quadro da academia)
      "function wodResumo(w){if(!w)return '';return w.t==='amrap'?'AMRAP '+w.min+' min':" +
      "w.t==='fortime'?('For Time'+(w.cap?' · limite '+w.cap+' min':'')):" +
      "w.t==='emom'?'EMOM '+w.min+' min':w.t==='tabata'?('Tabata '+w.rd+'×'+w.wk+'/'+w.rs+'s'):'Circuito';}" +
      // há quantos dias esse treino foi feito (pelo diário dos exercícios dele)
      "function fichaFezHa(fm){if(!fm||!fm.e)return null;var h=L('ptdc',{}),hj=isoHj(),max='';" +
      "fm.e.forEach(function(nm){(h[nm]||[]).forEach(function(x){if(x.d&&x.d<hj&&x.d>max)max=x.d;});});" +
      "if(!max)return null;var dd=Math.round((new Date(hj)-new Date(max))/864e5);return dd>0?dd:null;}" +
      // melhor pace guardado (m:ss por km) da mesma modalidade, pra meta ter régua
      "function melhorPace(mod){var l=L('ptcardio',[]);if(!Array.isArray(l))return '';var mp=0;" +
      "l.forEach(function(x){if(x&&x.m===mod&&+x.k>=1&&+x.s>0){var pc=(+x.s)/(+x.k);if(!mp||pc<mp)mp=pc;}});" +
      "if(!mp)return '';var mn=Math.floor(mp/60),sg=Math.round(mp%60);return mn+':'+String(sg).padStart(2,'0');}" +
      "function pintaHero(){var el=document.getElementById('heroTreino');if(!el||(!FICHAS_META.length&&!PLANO))return;" +
      "var i=-1,fm=null,rt='',tit='',sub='',cImg='',btn='Começar treino',gLin=null,gSvg='';" +
      "var hjD=new Date();var dataHj=DSEM_[hjD.getDay()]+', '+hjD.getDate()+' DE '+MESL_[hjD.getMonth()];" +
      "var pj=PLANO&&PLANO[String(hjD.getDay())];" +
      "if(PLANO){" +
      "if(pj&&pj.tp==='ficha'&&FICHAS_META[pj.i]){i=pj.i;fm=FICHAS_META[i];}" +
      // circuito do plano: o card ganha o resumo do quadro, a contagem de
      // movimentos, o último resultado e a lista fantasma (tela 45)
      "else if(pj&&pj.tp==='wod'){var w9=WODS[pj.i]||null;rt='HOJE · CIRCUITO';tit=pj.n;cImg=capaFM(w9&&w9.cp)||CAPA_GERAL;btn='Começar circuito';" +
      "sub=w9?wodResumo(w9)+' · '+pl(w9.mv,'movimento','movimentos'):'circuito completo te esperando';" +
      "if(w9){var uw=(L('ptwodres',{})[w9.id]||[]).slice(-1)[0];" +
      "if(uw&&uw.d)sub+=' · em '+uw.d.slice(8,10)+'/'+uw.d.slice(5,7)+' você fez '+String(uw.r||'').slice(0,18);" +
      "gLin=w9.ms.slice(0,7).map(function(m){return ((m.q?m.q+' ':'')+m.n).trim();});}}" +
      // corrida/bike do plano: alvo do treino + seu melhor pace + o traçado (tela 46)
      "else if(pj&&pj.tp==='cardio'){var c9=CARDIOS[pj.i]||null;" +
      "var rotC={corrida:'CORRIDA',caminhada:'CAMINHADA',bike:'BIKE'}[c9&&c9.m]||'CORRIDA E BIKE';" +
      "rt='HOJE · '+rotC;tit=pj.n;cImg=capaFM(c9&&c9.cp)||CAPA_GERAL;" +
      "btn={corrida:'Começar corrida',caminhada:'Começar caminhada',bike:'Começar pedal'}[c9&&c9.m]||'Começar corrida';" +
      "if(c9){sub=crAlvoTxt(c9);" +
      "var bp=melhorPace(c9.m);if(bp)sub+=' · seu melhor: '+bp;}else{sub='treino prescrito te esperando';}" +
      "gSvg=\"<svg viewBox='0 0 200 200' aria-hidden='true' style='position:absolute;top:0;right:0;width:78%;opacity:.5;stroke:rgba(255,255,255,.55);' fill='none' stroke-width='10' stroke-linecap='round'><path d='M30 172 C 18 120, 82 132, 92 92 S 152 64, 152 32 S 102 12, 112 48'/></svg>\";}" +
      "else{rt='HOJE · DESCANSO';tit='Dia de recuperar';sub='alongue, caminhe leve e durma bem — amanhã tem mais';cImg=CAPA_GERAL;btn='Ver meus treinos';}" +
      "}else{var tot=Object.keys(L('ptfeitos',{})).length;i=tot%FICHAS_META.length;fm=FICHAS_META[i];}" +
      // a ficha do dia: a DATA vira o rótulo, a letra entra no título e o
      // subtítulo conta o tamanho e quando foi a última vez (tela 44)
      "if(fm){var par=String(fm.t).split('—');rt=dataHj;tit=par.length>1?('Treino '+par[0].trim()+' '+par.slice(1).join('—').trim()):fm.t;" +
      "sub=pl(fm.n,'exercício','exercícios')+(fm.m?' · ~'+fm.m+' min':'');" +
      "var dd9=fichaFezHa(fm);if(dd9===1)sub+=' · você fez esse treino ontem';else if(dd9)sub+=' · você fez esse treino há '+dd9+' dias';" +
      "cImg=capaFM(fm.c)||CAPA_GERAL;}" +
      "document.getElementById('htRot').textContent=rt;document.getElementById('htTitulo').textContent=tit;" +
      "document.getElementById('htSub').textContent=sub;" +
      "var hb0=document.getElementById('htVer');if(hb0)hb0.textContent=btn;" +
      // lista fantasma: exercícios da ficha OU movimentos do circuito; na
      // corrida entra o traçado tipo GPS no lugar das linhas
      "var hg=document.getElementById('htGhost');if(hg){" +
      "if(gSvg){hg.innerHTML=gSvg;}else{var ge=gLin||(fm&&fm.e)||[];hg.innerHTML=ge.map(function(){return \"<div class='hgline'></div>\";}).join('');" +
      "for(var g2=0;g2<hg.children.length;g2++)hg.children[g2].textContent=ge[g2]||'';}}" +
      // foto da ficha do dia no card (o véu fica sempre, pro texto valer)
      "var hf=document.getElementById('htFoto');" +
      "if(hf){if(cImg){hf.src=cImg;hf.style.display='block';}else{hf.removeAttribute('src');hf.style.display='none';}" +
      "el.classList.toggle('comfoto',!!cImg);}" +
      // a ficha do dia já abre pronta na aba Treino; as outras ficam recolhidas
      "var gav=document.querySelectorAll('#trFichasWrap .fichabox');" +
      "if(gav.length>1&&i>=0)for(var g=0;g<gav.length;g++)gav[g].open=(+gav[g].dataset.fi===i);}" +
      // Começar treino: além de ir pra área de Treino, cai na SUB-ABA do dia (plano)
      "var hv=document.getElementById('htVer');if(hv)hv.addEventListener('click',function(){if(window.__trocaSec)window.__trocaSec('treino');" +
      "var pj2=PLANO&&PLANO[String(new Date().getDay())];if(pj2&&window.__trSub)window.__trSub(pj2.tp==='wod'?'wod':pj2.tp==='cardio'?'cardio':'ficha');});" +
      // carrossel de treinos do dia (telas final-44/45/46): cada card mostra os
      // próprios risquinhos ("2 de 3 · arraste →") e o botão leva pro fluxo certo
      "(function(){" +
      "var sa=document.getElementById('heroSauda');if(sa){var hh=new Date().getHours();sa.textContent=(hh<12?'Bom dia':hh<18?'Boa tarde':'Boa noite')+', '+PRIMEIRO;}" +
      "var cr=document.getElementById('heroCarr');if(!cr)return;" +
      "var pj3=PLANO&&PLANO[String(new Date().getDay())];var tpHoje=pj3?pj3.tp:'ficha';" +
      "var cw=document.getElementById('heroWod');if(cw&&tpHoje!=='wod')cw.style.display='';" +
      "var cc=document.getElementById('heroCr');if(cc&&tpHoje!=='cardio')cc.style.display='';" +
      "var cf=document.getElementById('heroFicha');" +
      "if(cf&&tpHoje!=='ficha'&&FICHAS_META.length){" +
      "var ti9=Object.keys(L('ptfeitos',{})).length%FICHAS_META.length;var fm9=FICHAS_META[ti9];" +
      "var pr9=String(fm9.t).split('\u2014');" +
      "document.getElementById('hfTit').textContent=pr9.length>1?('Treino '+pr9[0].trim()+' '+pr9.slice(1).join('\u2014').trim()):fm9.t;" +
      "var s9=pl(fm9.n,'exerc\u00edcio','exerc\u00edcios')+(fm9.m?' \u00b7 ~'+fm9.m+' min':'');" +
      "var d9=fichaFezHa(fm9);if(d9===1)s9+=' \u00b7 voc\u00ea fez esse treino ontem';else if(d9)s9+=' \u00b7 voc\u00ea fez esse treino h\u00e1 '+d9+' dias';" +
      "document.getElementById('hfSub').textContent=s9;" +
      "var im9=capaFM(fm9.c)||CAPA_GERAL;var hi9=document.getElementById('hfFoto');" +
      "if(im9&&hi9){hi9.src=im9;hi9.style.display='block';}" +
      "var hg9=document.getElementById('hfGhost'),ge9=fm9.e||[];" +
      "if(hg9){hg9.innerHTML=ge9.map(function(){return \"<div class='hgline'></div>\";}).join('');" +
      "for(var q9=0;q9<hg9.children.length;q9++)hg9.children[q9].textContent=ge9[q9]||'';}" +
      "cf.style.display='';}" +
      "var cards=Array.prototype.filter.call(cr.children,function(x){return x.style.display!=='none';});" +
      "cards.forEach(function(c,ci){var k9=c.querySelector('[data-hk]');" +
      "if(k9)k9.textContent=(ci===0?'HOJE \u00b7 ':'TAMB\u00c9M \u00b7 ')+k9.getAttribute('data-hk');});" +
      "cards.forEach(function(c,ci){var d=c.querySelector('.htdash');if(!d)return;" +
      "if(cards.length<2){d.style.display='none';return;}" +
      "d.innerHTML=cards.map(function(x,xi){return \"<span style='\"+(xi===ci?'width:26px;background:#fff;':'width:6px;background:rgba(255,255,255,.42);')+\"'></span>\";}).join('')+" +
      "\"<span class='htn'>\"+(ci+1)+' de '+cards.length+' · arraste →</span>';});" +
      "document.addEventListener('click',function(e){var b=e.target.closest('[data-carrver]');if(!b)return;" +
      "if(window.__trocaSec)window.__trocaSec('treino');if(window.__trSub)window.__trSub(b.getAttribute('data-carrver'));});})();" +
      // pintaProgresso saiu com o card Progresso do Início: agora quem mostra
      // treinos do mês é o pintaCqTiles, na aba Conquistas
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
      "\"<circle cx='32' cy='32' r='26' fill='none' style='stroke:var(--cor)' stroke-width='6' stroke-linecap='round' stroke-dasharray='\"+(C2*pct/100).toFixed(1)+' '+C2.toFixed(1)+\"' transform='rotate(-90 32 32)'/>\"+" +
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
      "function pintaXP(){var el=document.getElementById('xpNum');if(!el)return;el.textContent=xpDados();pintaNivel();" +
      // cabeçalho da Evolução (tela 49): anel do nível + XP + quanto falta
      "var ev=document.getElementById('evTopo');if(ev){var xp=xpDados();var nv=nivelDe(xp);" +
      "var base=nvXpAte(nv),alvo=nvXpAte(nv+1);var pct=Math.min(100,Math.round(100*(xp-base)/Math.max(1,alvo-base)));" +
      "document.getElementById('evNvNum').textContent=nv;" +
      "document.getElementById('evXp').textContent=xp+' XP';" +
      "document.getElementById('evFalta').textContent='faltam '+Math.max(0,alvo-xp)+' pro nível '+(nv+1);" +
      "document.getElementById('evRing').style.background='conic-gradient(#fff 0 '+pct+'%,rgba(255,255,255,.25) '+pct+'% 100%)';}}" +
      // repinta a semana DEPOIS do herói: agora o coachDica já enxerga o plano
      "pintaHero();pintaXP();try{pintaSemana();pintaCqTiles();}catch(e0){}" +
      // barra de abas embaixo: agrupa os cards em seções e controla a navegação
      // (ícones de traço em SVG — herdam a cor da aba via currentColor)
      "(function(){function ic(p){return \"<svg width='21' height='21' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'>\"+p+'</svg>';}" +
      "var MENU=[" +
      "['inicio',\"<path d='M3 10 12 3l9 7'/><path d='M5 8.8V21h14V8.8'/><path d='M9.5 21v-6h5v6'/>\",'Hoje']," +
      "['treino',\"<path d='M7 7v10M4 9v6M17 7v10M20 9v6M7 12h10'/>\",'Treinos']," +
      "['evolucao',\"<polyline points='3 17 9 11 13 15 21 7'/><polyline points='15 7 21 7 21 13'/>\",'Evolução']," +
      // com o feed ligado a Comunidade vira a 4ª aba fixa (a Agenda vai pro menu ☰)
      "['feed',\"<circle cx='9' cy='8' r='3.4'/><path d='M2.8 20c0-3.4 2.8-6.2 6.2-6.2s6.2 2.8 6.2 6.2'/><path d='M16 5.2a3.4 3.4 0 0 1 0 6.4M17.5 14.2c2 1.1 3.4 3.2 3.4 5.8'/>\",'Turma']," +
      "['agenda',\"<rect x='3' y='5' width='18' height='16' rx='2'/><path d='M16 3v4M8 3v4M3 11h18'/>\",'Agenda']," +
      "['chat',\"<path d='M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'/>\",'Chat']," +
      "['quest',\"<path d='M9 4.5h6v3H9z'/><path d='M15 4.5h3a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 20V6A1.5 1.5 0 0 1 6 4.5h3'/><path d='M8.5 12h7M8.5 15.5h5'/>\",'Questionários']," +
      "['util',\"<path d='M14.5 6.5a4.2 4.2 0 0 0-5.7 5.4L3 17.7 6.3 21l5.8-5.8a4.2 4.2 0 0 0 5.4-5.7l-2.8 2.8-2.4-.6-.6-2.4z'/>\",'Utilidades']," +
      "['pagamento',\"<rect x='2' y='5' width='20' height='14' rx='2'/><path d='M2 10h20'/>\",'Plano']," +
      // Ajustes fica por último de propósito: aparece na gaveta ☰, não nas abas de baixo
      "['ajustes',\"<circle cx='12' cy='12' r='3.2'/><path d='M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z'/>\",'Ajustes']];" +
      // áreas desligadas pelo professor nas Configurações somem do menu
      "var OCULTA=" + jsonApp(menuOculta) + ";MENU=MENU.filter(function(m){return OCULTA.indexOf(m[0])===-1;});" +
      "function secDe(el){var h=el.querySelector&&el.querySelector('h2');var t=(h?h.textContent:'')||'';var tx=el.textContent||'';" +
      "if(/Meu treino|Raio-X|Modo circuito/.test(t))return 'treino';" +
      "if(/Conquistas|Minha evolução|Avaliações físicas|Última avaliação|Meu peso|Fotos de progresso/.test(t))return 'evolucao';" +
      "if(/Agenda|Minhas sessões/.test(t))return 'agenda';" +
      "if(/Comunidade/.test(t))return 'feed';" +
      "if(/Fale com/.test(t))return 'chat';" +
      "if(/Pagamento|Mensalidade|Meus pacotes/.test(t)||/copia e cola/.test(tx))return 'pagamento';" +
      "if(/Minha conta|Meu login|Lembretes/.test(t))return 'ajustes';" +
      "if(/Mural|Minha semana|Hábitos|Desafio/.test(t))return 'inicio';" +
      "return null;}" +
      // últimas cargas do diário pintadas na lista da ficha (tela 25) — o kg é
      // dado do APARELHO (ptdc), então entra por pintura, nunca pelo HTML fixo
      "function pintaUltimas(){var dc=L('ptdc',{});" +
      "document.querySelectorAll('.exult').forEach(function(el){var lst=dc[el.dataset.exn]||[];var u=lst[lst.length-1];" +
      "el.textContent=u?('última: '+(u.r?u.r+' reps · ':'')+String(u.kg).replace('.',',')+' kg'):'sem carga anotada';});" +
      "document.querySelectorAll('.exkg').forEach(function(el){var lst=dc[el.dataset.exn]||[];var u=lst[lst.length-1];" +
      "el.textContent=u?String(u.kg).replace('.',',')+' kg':'';});}" +
      "pintaUltimas();window.__pintaUlt=pintaUltimas;" +
      "var IGNORA={navApp:1,tmrBar:1,guiaBox:1,fundoMenuApp:1,menuApp:1};" +
      "Array.prototype.slice.call(document.body.children).forEach(function(el){" +
      "if(el.tagName==='SCRIPT'||IGNORA[el.id]||(el.className||'').indexOf('topo')>=0)return;" +
      "if(el.id==='qsTopo'||el.id==='qaCard'||el.id==='ckCard'||el.id==='qsVazio'){el.setAttribute('data-sec','quest');return;}" +
      "if(el.id==='trTopo'||el.id==='cardWod'||el.id==='cardCardio'||el.id==='cardRpe'||el.id==='trFichasWrap'){el.setAttribute('data-sec','treino');return;}" +
      "if(el.id==='evTopo'||el.id==='evCargas'||el.id==='evMarcas'){el.setAttribute('data-sec','evolucao');return;}" +
      "if(el.id==='agTopo'){el.setAttribute('data-sec','agenda');return;}" +
      // clube e loja (v699): telas próprias, abertas SÓ pelo menu — o Raphael não
      // quis os cards ocupando a tela inicial do app
      "if(el.id==='clubeCard'){el.setAttribute('data-sec','clube');return;}" +
      "if(el.id==='lojaCard'){el.setAttribute('data-sec','loja');return;}" +
      "if(el.id==='ajudaCard'){el.setAttribute('data-sec','ajuda');return;}" +
      "if(el.id==='chTopo'){el.setAttribute('data-sec','chat');return;}" +
      "if(/^aj/.test(String(el.id||''))){el.setAttribute('data-sec','ajustes');return;}" +
      "if(/^util/.test(String(el.id||''))){el.setAttribute('data-sec','util');return;}" +
      "var s=secDe(el);el.setAttribute('data-sec',s||'inicio');});" +
      // pílulas da Evolução (telas 49/41/42/32): Conquistas × Corpo × Cargas × Marcas
      "(function(){document.querySelectorAll(\"[data-sec='evolucao']\").forEach(function(el){if(el.id==='evTopo')return;" +
      "if(el.id==='evCargas'){el.setAttribute('data-evsub','cargas');return;}" +
      "if(el.id==='evMarcas'){el.setAttribute('data-evsub','marcas');return;}" +
      "var h=el.querySelector('h2');el.setAttribute('data-evsub',/Conquistas/.test(h?h.textContent:'')?'conq':'corpo');});" +
      "var atual='conq';function pintaEv(){document.querySelectorAll(\"[data-sec='evolucao'][data-evsub]\").forEach(function(el){" +
      "el.style.display=el.getAttribute('data-evsub')===atual?'':'none';});" +
      "document.querySelectorAll('[data-evsub-bt]').forEach(function(b){var on=b.getAttribute('data-evsub-bt')===atual;" +
      "b.style.background=on?'var(--cor)':'var(--bg4)';b.style.color=on?'#fff':'#a9a4b5';b.style.borderColor=on?'var(--cor)':'var(--bg11)';});" +
      // o cabeçalho e as páginas repintam com os dados mais frescos do aparelho
      "if(window.__evTopoPinta)window.__evTopoPinta(atual);" +
      "if(atual==='cargas'&&window.__pintaCargas)window.__pintaCargas();" +
      "if(atual==='cargas'&&window.__metaCarga)window.__metaCarga.pinta();" +
      "if(atual==='cargas'&&window.__pintaEsforco)window.__pintaEsforco();" +
      "if(atual==='marcas'&&window.__pintaMarcas)window.__pintaMarcas();" +
      // a retrospectiva tem regra própria (só no comecinho do mês, some ao
      // fechar) — a sub-aba mostra, ela decide se fica
      "if(atual==='conq'&&window.__retro)try{window.__retro();}catch(e9){}}" +
      "document.addEventListener('click',function(e){var b=e.target.closest('[data-evsub-bt]');if(!b)return;" +
      "atual=b.getAttribute('data-evsub-bt');pintaEv();if(navigator.vibrate)navigator.vibrate(8);});" +
      "pintaEv();window.__evSub=function(s2){atual=s2;pintaEv();};" +
      // o selo de nível antigo dentro de Conquistas repetia o cabeçalho novo
      "var nc9=document.getElementById('nvCard');if(nc9&&document.getElementById('evTopo'))nc9.style.display='none';})();" +
      "var temSec={};document.querySelectorAll('[data-sec]').forEach(function(el){temSec[el.getAttribute('data-sec')]=1;});" +
      "var itens=MENU.filter(function(m){return temSec[m[0]];});" +
      // 3 abas fixas embaixo + o Menu no canto direito com TODAS as áreas
      // (as telas finais do redesenho têm 4 botões: Hoje, Treinos, Evolução, Menu)
      "var fixos=itens.slice(0,3);" +
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
      // menu (tela 01): página com cabeçalho roxo (foto + nome + studio),
      // atalho do questionário com badge, um grupo com as áreas e o card de
      // Ajustes com o modo claro. Nome de gente e de plano entram por
      // textContent, nunca por innerHTML.
      "var gav=document.getElementById('menuApp');" +
      "var MGNOME=" + jsonApp(a.nome || "") + ",PLSUB=" + jsonApp(plApp ? (plApp.nome + " · R$ " + (+plApp.valor).toLocaleString("pt-BR") + "/mês" + (plApp.diaVenc ? " · vence dia " + plApp.diaVenc : "")) : "mensalidade e comprovantes") + ";" +
      "var CHEV=\"<svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M9 6l6 6-6 6'/></svg>\";" +
      "var MICO={};itens.forEach(function(m){MICO[m[0]]=m[1];});" +
      "var MTIT={chat:'Chat',agenda:'Calendário',treino:'Minhas fichas',util:'Utilidades',feed:'Minha turma',pagamento:'Meu plano',ajustes:'Ajustes'};" +
      "function mgRow(sec,extra){return \"<button class='nitem mgrow' data-msec='\"+sec+\"'>\"+" +
      "\"<span style='line-height:0;'>\"+ic(MICO[sec])+\"</span>\"+" +
      "\"<span style='flex:1;min-width:0;'><span class='mgtit'>\"+(MTIT[sec]||sec)+\"</span><span class='mgsub'></span></span>\"+" +
      "(extra||\"<span class='mgchev'>\"+CHEV+'</span>')+'</button>';}" +
      "var mgg=['chat','agenda','treino','util','feed','pagamento'].filter(function(s){return MICO[s];});" +
      "gav.innerHTML=" +
      "\"<div class='mghd'><span class='mgav'><img id='mgImg' alt='' style='display:none;'><span id='mgIni'></span></span>\"+" +
      "\"<span style='flex:1;min-width:0;'><span class='mgnome'></span><span class='mgstudio'></span></span></div>\"+" +
      // o atalho existe com questionário do personal OU com o check-in da semana
      "(MICO.quest?\"<button class='nitem mgq' id='mgQaBt' data-msec='quest'>\"+" +
      "\"<span style='line-height:0;'>\"+ic(\"<path d='M9 4.5h6v3H9z'/><path d='M15 4.5h3a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 20V6A1.5 1.5 0 0 1 6 4.5h3'/><path d='M8.5 12h7M8.5 15.5h5'/>\")+\"</span>\"+" +
      "\"<span style='flex:1;min-width:0;'><span class='mgtit'>Questionários</span><span class='mgsub' id='mgQaSub'></span></span>\"+" +
      "\"<span class='mgbadge' id='mgQaB' style='display:none;'></span></button>\":'')+" +
      "(mgg.length?\"<div class='mgcard'>\"+mgg.map(function(s){return mgRow(s,s==='chat'?\"<span class='mgbadge' id='mgChatB' style='display:none;'></span><span class='mgchev'>\"+CHEV+'</span>':null);}).join('')+'</div>':'')+" +
      /* a videoteca ganha entrada própria (v667): o card #vidCard mora no FIM do
       * Início e quem não rolasse até lá nunca descobria que existe — o atalho
       * leva direto (o handler da gaveta já sabe rolar via data-mgoto). O portão
       * é do BUILDER: sem vídeo publicado, a linha nem nasce no HTML. */
      (vidsApp.length ? "\"<div class='mgcard'><button class='nitem mgrow' data-msec='inicio' data-mgoto='vidCard'>\"+" +
        "\"<span style='line-height:0;'>\"+ic(\"<rect x='3.5' y='5' width='17' height='14' rx='2.5'/><path d='M10 9.4l4.6 2.6L10 14.6z'/>\")+\"</span>\"+" +
        "\"<span style='flex:1;min-width:0;'><span class='mgtit'>Conteúdos e vídeos</span><span class='mgsub'>" + vidsApp.length + (vidsApp.length > 1 ? " vídeos" : " vídeo") + " do seu personal</span></span>\"+" +
        "\"<span class='mgchev'>\"+CHEV+'</span></button></div>'+" : "") +
      // 🎁 clube de vantagens (v697): mesmo desenho da videoteca — atalho no
      // menu que rola até o card; sem parceria cadastrada, a linha nem nasce
      (clubeApp.length ? "\"<div class='mgcard'><button class='nitem mgrow' data-msec='clube'>\"+" +
        "\"<span style='line-height:0;'>\"+ic(\"<rect x='3.5' y='8.5' width='17' height='12' rx='2.5'/><path d='M3.5 12h17M12 8.5V20.5M8.2 8.5C6 8.5 5 6.8 5.8 5.6c.9-1.3 3.4-.8 4.6 1.4l.8 1.5m2.6 0c2.2 0 3.2-1.7 2.4-2.9-.9-1.3-3.4-.8-4.6 1.4l-.8 1.5'/>\")+\"</span>\"+" +
        "\"<span style='flex:1;min-width:0;'><span class='mgtit'>Clube de vantagens</span><span class='mgsub'>" + clubeApp.length + (clubeApp.length > 1 ? " parcerias exclusivas" : " parceria exclusiva") + " pra você</span></span>\"+" +
        "\"<span class='mgchev'>\"+CHEV+'</span></button></div>'+" : "") +
      // 🛍 loja (v698): atalho no menu, gated pelo builder como os outros
      (lojaApp.length ? "\"<div class='mgcard'><button class='nitem mgrow' data-msec='loja'>\"+" +
        "\"<span style='line-height:0;'>\"+ic(\"<path d='M5 8h14l-1.2 12a1.8 1.8 0 0 1-1.8 1.6H8a1.8 1.8 0 0 1-1.8-1.6z'/><path d='M8.6 10.5V6.8a3.4 3.4 0 0 1 6.8 0v3.7'/>\")+\"</span>\"+" +
        "\"<span style='flex:1;min-width:0;'><span class='mgtit'>Loja</span><span class='mgsub'>" + lojaApp.length + (lojaApp.length > 1 ? " itens" : " item") + " de " + esc(studio.split(" ")[0]) + " pra você</span></span>\"+" +
        "\"<span class='mgchev'>\"+CHEV+'</span></button></div>'+" : "") +
      // ❓ Ajuda (v706): sempre presente — todo app tem a tela de ajuda
      "\"<div class='mgcard'><button class='nitem mgrow' data-msec='ajuda'>\"+" +
      "\"<span style='line-height:0;'>\"+ic(\"<circle cx='12' cy='12' r='8.5'/><path d='M9.6 9.3a2.5 2.5 0 0 1 4.9.7c0 1.6-2.4 2-2.4 3.5'/><circle cx='12' cy='16.8' r='.5'/>\")+\"</span>\"+" +
      "\"<span style='flex:1;min-width:0;'><span class='mgtit'>Ajuda</span><span class='mgsub'>como usar cada parte do app</span></span>\"+" +
      "\"<span class='mgchev'>\"+CHEV+'</span></button></div>'+" +
      "(MICO.ajustes?\"<div class='mgcard'>\"+mgRow('ajustes')+'</div>':'');" +
      "gav.querySelector('.mgnome').textContent=MGNOME;gav.querySelector('.mgstudio').textContent=STUDIO;" +
      // iniciais e foto copiadas do avatar do topo, que já resolveu painel × aluno
      "(function(){var ai=document.getElementById('avIni'),ii=document.getElementById('mgIni');if(ai&&ii)ii.textContent=ai.textContent;" +
      "var av=document.getElementById('avImg');if(av&&ii&&av.getAttribute('src')&&av.style.display!=='none'){var mi9=document.getElementById('mgImg');mi9.src=av.src;mi9.style.display='';ii.style.display='none';}})();" +
      // subtítulos calculados: agenda = próxima sessão; fichas = treinos ativos
      "var MSUB={chat:'fale com seu personal',util:'cronômetro, 1RM, anilhas, água',feed:'o feed da sua turma',pagamento:PLSUB,ajustes:'tema, lembretes, minha conta'," +
      "agenda:(function(){var hj9=isoHj();var pr=(SESS||[]).filter(function(s9){return s9.d>=hj9;})[0];if(!pr)return 'sem sessão marcada';var dw=new Date(pr.d+'T12:00:00').getDay();return (dw===0||dw===6?'próximo ':'próxima ')+DSEM_[dw].toLowerCase()+(pr.h?', '+pr.h:'');})()," +
      "treino:(function(){var n9=(FICHAS_META||[]).length+(WODS||[]).length+(CARDIOS||[]).length;return n9?pl(n9,'treino ativo','treinos ativos'):'seus treinos';})()};" +
      "gav.querySelectorAll('.mgrow[data-msec]').forEach(function(b){var s9=MSUB[b.getAttribute('data-msec')];var el9=b.querySelector('.mgsub');if(el9&&s9!=null)el9.textContent=s9;});" +
      // badges vivos: questionário esperando + recados não lidos no chat
      "function pintaMB(){var qb=document.getElementById('mgQaB'),qs=document.getElementById('mgQaSub');" +
      // o badge soma o questionário do personal e o check-in da semana; o toque
      // leva pro primeiro que estiver esperando
      "if(qb){var pq=window.__qaPend?window.__qaPend():0;var pk=window.__ckPend?window.__ckPend():0;var p9=pq+pk;" +
      "qb.style.display=p9?'flex':'none';qb.textContent=p9||'';" +
      "if(qs)qs.textContent=p9?p9+' esperando você':'em dia — nada esperando';" +
      "var tn9=document.getElementById('qsTopN'),ts9=document.getElementById('qsTopS');" +
      "if(tn9)tn9.textContent=p9?p9+(p9>1?' pra responder':' pra responder'):'Tudo em dia';" +
      "if(ts9)ts9.textContent=p9?'leva 1 minuto \\u2014 seu personal l\\u00ea tudo':'o que seu personal mandar aparece aqui';" +
      "var qv9=document.getElementById('qsVazio');if(qv9){var vis9=false;" +
      "document.querySelectorAll(\"[data-sec='quest']\").forEach(function(e9){" +
      "if(e9.id!=='qsTopo'&&e9.id!=='qsVazio'&&e9.style.display!=='none')vis9=true;});" +
      "qv9.style.display=vis9?'none':'';}}" +
      "var cb=document.getElementById('mgChatB');if(cb){var pc9=L('ptchat',[]);var vi9=String(L('ptvisto',''));var n9=0;" +
      "pc9.forEach(function(m9){if(m9&&m9.de&&m9.de!=='aluno'&&m9.de!=='aluno-local'&&m9.de!=='bot'&&String(m9.criado||'')>vi9)n9++;});" +
      "cb.style.display=n9?'flex':'none';cb.textContent=n9>9?'9+':n9;var cv9=cb.parentElement.querySelector('.mgchev');if(cv9)cv9.style.display=n9?'none':'';}}" +
      "window.__menuBadges=pintaMB;pintaMB();" +
      "var gavAberta=false;" +
      // pinta as 4 abas de baixo num lugar só: com o menu aberto, só o MENU acende
      "function pintaAbas(s){var CLARO=document.documentElement.classList.contains('claro');" +
      "document.querySelectorAll('#navApp .nitem').forEach(function(mi){var on=!gavAberta&&mi.getAttribute('data-msec')===s;" +
      "mi.style.background=on?'rgba(var(--cor-rgb),.16)':'none';mi.style.color=on?(CLARO?'var(--cor)':'var(--corc)'):(CLARO?'#6c6678':'#8a8695');});" +
      "var mb=document.getElementById('navMenuApp');if(mb){var eFixo=fixos.some(function(m){return m[0]===s;});var liga=gavAberta||!eFixo;" +
      "mb.style.background=liga?'rgba(var(--cor-rgb),.16)':'none';mb.style.color=liga?(CLARO?'var(--cor)':'var(--corc)'):(CLARO?'#6c6678':'#8a8695');}}" +
      "function abreMenuApp(ab){gavAberta=ab;document.getElementById('fundoMenuApp').style.display=ab?'block':'none';" +
      // Chrome espelha o raio de baixo do cabeçalho nos cantos de cima quando o
      // painel rola (overflow) DENTRO de um transform — então o transform só
      // existe durante o deslize e vira none assim que a animação termina
      "if(ab){gav.style.transform='translateX(0)';setTimeout(function(){if(gavAberta)gav.style.transform='none';},280);pintaMB();gav.scrollTop=0;}" +
      "else gav.style.transform='translateX(105%)';" +
      "pintaAbas(SEC);}" +
      "gav.addEventListener('transitionend',function(){if(gavAberta)gav.style.transform='none';});" +
      "document.getElementById('fundoMenuApp').addEventListener('click',function(){abreMenuApp(false);});" +
      "gav.addEventListener('click',function(e){var mi=e.target.closest('.nitem');if(!mi)return;if(navigator.vibrate)navigator.vibrate(8);trocaSec(mi.getAttribute('data-msec'));abreMenuApp(false);" +
      "var go=mi.getAttribute('data-mgoto');if(go){var ge=document.getElementById(go);if(ge)setTimeout(function(){ge.scrollIntoView({behavior:'smooth',block:'start'});},80);}});" +
      "var stSec=document.createElement('style');stSec.textContent='[data-sec-off]{display:none!important}';document.head.appendChild(stSec);" +
      "var SEC='inicio';" +
      "function mostraDot(on){document.querySelectorAll('.ndot').forEach(function(d){d.style.display=on?'block':'none';});}" +
      "function trocaSec(s){SEC=s;document.querySelectorAll('[data-sec]').forEach(function(el){" +
      "if(el.getAttribute('data-sec')===s)el.removeAttribute('data-sec-off');else el.setAttribute('data-sec-off','1');});" +
      "var CLARO=document.documentElement.classList.contains('claro');" +
      // só a barra de baixo recolore: as linhas do menu-página têm cor própria
      "pintaAbas(s);" +
      "var rot=itens.filter(function(m){return m[0]===s;})[0];" +
      "document.getElementById('secTit').textContent=rot?rot[2]:'';" +
      // no Início, Treinos, Evolução e Utilidades a faixa colorida some: cada
      // área tem o próprio cabeçalho — roxo em cima de roxo, nunca mais
      "document.body.classList.toggle('semtopo',s==='inicio'||s==='treino'||s==='evolucao'||s==='util'||s==='agenda'||s==='chat'||s==='quest'||s==='ajustes'||s==='clube'||s==='loja'||s==='ajuda');" +
      // entrar na área de treino repinta as últimas cargas (tela 25)
      "if(s==='treino'&&window.__pintaUlt)window.__pintaUlt();" +
      // entrar nas Utilidades sempre começa no hub (água + grade)
      "if(s==='util'&&window.__utilVai)window.__utilVai(null);" +
      // a sequência e os hábitos são conteúdo do Início: fora dele a faixa
      // colorida fica curta, só com o nome, o nível e o XP
      "var tpx=document.getElementById('topoExtra');if(tpx)tpx.style.display=(s==='inicio'?'':'none');" +
      // entrou no chat = recados vistos; some a bolinha e o badge do menu
      "if(s==='chat'){Sv('ptvisto',new Date().toISOString());mostraDot(false);if(window.__menuBadges)window.__menuBadges();}" +
      // GPS sempre ativo: acompanha a navegação (liga na área de cardio, desliga fora se não tem treino rodando)
      "try{if(s==='treino'&&trSub==='cardio')crAutoGps();else if(s!=='treino'&&!cr.run)crGpsPara();}catch(e){}" +
      "window.scrollTo(0,0);}" +
      "nav.addEventListener('click',function(e){var mi=e.target.closest('.nitem');if(!mi)return;" +
      "if(navigator.vibrate)navigator.vibrate(8);" +
      // tocar em MENU de novo fecha; tocar numa aba fixa fecha e navega
      "if(mi.id==='navMenuApp'){abreMenuApp(!gavAberta);return;}" +
      "trocaSec(mi.getAttribute('data-msec'));abreMenuApp(false);});" +
      // bolinha no Chat quando chega recado do personal que o aluno ainda não viu
      "window.__chatDot=function(ultima){if(ultima&&SEC!=='chat'&&String(ultima)>String(L('ptvisto','')))mostraDot(true);if(window.__menuBadges)window.__menuBadges();};" +
      // sub-abas do Treino: "Minha ficha" mostra a ficha; "Circuito (WOD)" mostra só o cronômetro
      "(function(){var pj9=PLANO&&PLANO[String(new Date().getDay())];" +
      "[['data-wi','wod'],['data-cri','cardio']].forEach(function(par){" +
      "var gv9=document.querySelectorAll('['+par[0]+']');if(gv9.length<2)return;" +
      "var alvo9=(pj9&&pj9.tp===par[1]&&typeof pj9.i==='number')?pj9.i:0;" +
      "for(var k9=0;k9<gv9.length;k9++)gv9[k9].open=(+gv9[k9].getAttribute(par[0])===alvo9);});})();" +
      "var trSub='ficha';" +
      "function trocaTrSub(s){trSub=s;" +
      "var th=TRHEAD[s]||TRHEAD.ficha;" +
      "var tn=document.getElementById('trTopN');if(tn)tn.textContent=th.n;" +
      "var ts=document.getElementById('trTopS');if(ts)ts.textContent=th.s;" +
      "var tb=document.getElementById('trTopSub');if(tb)tb.textContent=th.sub;" +
      // plano do mês: a semana em que o aluno está e o que muda nela
      "var mEh=function(t9){return String(t9==null?'':t9).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');};" +
      "var mk=s==='wod'?'wod':(s==='cardio'?'corrida':'musculacao');var mw=MESAPP[mk];" +
      "var mb=document.getElementById('trMes');" +
      "if(mb){if(mw){mb.style.display='block';" +
      "mb.innerHTML=\"<b style='display:block;font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.8);'>Semana \"+mw.s+' de 4'+(mw.f?' \u00b7 '+mEh(mw.f):'')+'</b>'+" +
      "(mw.a?\"<span style='display:block;font-size:12.5px;color:rgba(255,255,255,.92);margin-top:3px;line-height:1.45;'>\"+mEh(mw.a)+'</span>':'');}" +
      "else mb.style.display='none';}" +
      "document.querySelectorAll(\"[data-sec='treino']\").forEach(function(el){if(el.id==='trTopo')return;" +
      "var idAlvo=s==='wod'?'cardWod':s==='cardio'?'cardCardio':null;" +
      "el.style.display=(idAlvo?el.id===idAlvo:(el.id!=='cardWod'&&el.id!=='cardCardio'))?'':'none';});" +
      // GPS sempre ativo: liga ao abrir a área de cardio, desliga ao sair (se não tem treino rodando)
      "try{if(s==='cardio'){crAutoGps();desenhaRota();}else if(!cr.run)crGpsPara();}catch(e){}" +
      "document.querySelectorAll('[data-trsub]').forEach(function(b){var on=b.dataset.trsub===s;" +
      "b.style.background=on?'linear-gradient(135deg,var(--cor),var(--corc))':'var(--bg4)';b.style.border=on?'none':'1px solid var(--bg11)';b.style.color=on?'#fff':'#a9a4b5';});" +
      "window.scrollTo(0,0);}" +
      "document.addEventListener('click',function(e){var b=e.target.closest('[data-trsub]');if(b)trocaTrSub(b.dataset.trsub);});" +
      "window.__trSub=trocaTrSub;trocaTrSub('ficha');" +
      "window.__trocaSec=trocaSec;trocaSec('inicio');" +
      // modo claro × noturno: linha no card de Ajustes do menu (tela 01) —
      // a escolha do aluno continua guardada no aparelho (pttema)
      "var btTema=document.getElementById('btnTemaApp');" +
      "var icoTema=function(p){return \"<svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'>\"+p+'</svg>';};" +
      "function aplicaTemaApp(){var claro=+L('pttema',0)===1;document.documentElement.classList.toggle('claro',claro);" +
      "var sw9=document.getElementById('swTema');if(sw9)sw9.classList.toggle('on',claro);" +
      "if(btTema){document.getElementById('mgTemaTit').textContent=claro?'Modo noturno':'Modo claro';" +
      "document.getElementById('mgTemaIco').innerHTML=icoTema(claro?\"<path d='M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z'/>\":\"<circle cx='12' cy='12' r='4.2'/><path d='M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.2 5.2l1.7 1.7M17.1 17.1l1.7 1.7M18.8 5.2l-1.7 1.7M6.9 17.1l-1.7 1.7'/>\");}" +
      "try{trocaSec(SEC);}catch(e){}try{desenhaRota();}catch(e){}}" +
      "if(btTema)btTema.addEventListener('click',function(){Sv('pttema',+L('pttema',0)===1?0:1);aplicaTemaApp();if(navigator.vibrate)navigator.vibrate(10);});" +
      "aplicaTemaApp();window.__temaApp=aplicaTemaApp;" +
      // ---- Ajustes (tela 11): notificações com interruptor ----
      "(function(){var row=document.getElementById('ajNotif'),sw=document.getElementById('swNotif');" +
      "if(!row||!sw||!('Notification' in window))return;row.style.display='';" +
      "var p=function(){sw.classList.toggle('on',Notification.permission==='granted');};p();" +
      "row.addEventListener('click',function(){" +
      "if(Notification.permission==='granted'){alert('Notificações já estão ligadas — lembretes e recados chegam por aqui. Pra desligar, use os ajustes do celular.');return;}" +
      "if(Notification.permission==='denied'){alert('O celular está bloqueando as notificações deste app. Libere nos ajustes do navegador.');return;}" +
      "Notification.requestPermission().then(function(r){p();if(r==='granted'&&typeof tentaPushP==='function')try{tentaPushP();}catch(e9){}});});})();" +
      // ---- Ajustes: sub do lembrete de água (o valor mora nas Utilidades) ----
      "function pintaAguaSub(){var el=document.getElementById('ajAguaSub');if(!el)return;var v=+L('ptaguaLem',0)||0;" +
      "el.textContent=v===60?'a cada 1 hora':v===90?'a cada 1h30':v===120?'a cada 2 horas':'desligado — liga aqui';}" +
      "pintaAguaSub();window.__aguaSub=pintaAguaSub;" +
      // ---- Ajustes: baixar meus dados (LGPD na prática — arquivo local) ----
      "(function(){var b=document.getElementById('ajBaixa');if(!b)return;b.addEventListener('click',function(){" +
      "var dados={gerado:new Date().toISOString(),aluno:PRIMEIRO," +
      "peso:L('ptpeso',{}),cargas:L('ptdc',{}),treinos_feitos:L('ptfeitos',{}),habitos:L('pthab',{})," +
      "como_foi_o_treino:L('ptrpe',{}),circuitos:L('ptwodres',{}),corridas:L('ptcardio',[]),batimentos:L('ptfc',{}),marcas:L('ptmarcas',[])," +
      "agua:L('ptaguaCfg',null),avaliacoes:AVS};" +
      "var bl=new Blob([JSON.stringify(dados,null,1)],{type:'application/json'});" +
      "var a9=document.createElement('a');a9.href=URL.createObjectURL(bl);a9.download='meus-dados-torque.json';" +
      "document.body.appendChild(a9);a9.click();setTimeout(function(){URL.revokeObjectURL(a9.href);a9.remove();},400);});})();" +
      // ---- Ajustes: instalar na tela de início (PWA) ----
      "(function(){var row=document.getElementById('ajInstala');if(!row)return;var evt=null;" +
      "if(matchMedia('(display-mode: standalone)').matches||navigator.standalone)return;" + // já instalado
      "window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();evt=e;row.style.display='';});" +
      "if(/iphone|ipad|ipod/i.test(navigator.userAgent))row.style.display='';" +
      "row.addEventListener('click',function(){if(evt){evt.prompt();return;}" +
      "alert('No Safari: toca no botão Compartilhar (o quadradinho com a seta) e escolhe Adicionar à Tela de Início. O app ganha ícone próprio.');});})();" +
      // ---- ponte do app nativo (contrato em nativo/SAUDE.md) ----
      // o shell da loja injeta window.MTNativo.saude ANTES do app carregar;
      // aqui só acendemos a linha e delegamos — a web nunca finge que conecta
      "(function(){var nv=window.MTNativo&&window.MTNativo.saude;var row=document.getElementById('ajSaude');" +
      "if(!nv||!row)return;row.style.display='';" +
      "row.addEventListener('click',function(){try{nv.abrir();}catch(e9){alert('Não deu pra abrir a conexão de saúde agora.');}});" +
      /* importador automático (v671): quando o shell nativo oferecer
       * saude.treinos()/saude.peso(), o app passa a puxar SOZINHO no boot e ao
       * voltar pro app. Regras: busy-flag com soltura por timeout (o callback
       * nativo pode nunca responder), intervalo mínimo de 15 min, marca
       * ptsaudeSync em ISO UTC com recuo de 48 h (o relógio sincroniza horas
       * depois — o dedupe do crImporta absorve a sobreposição), teto de 20
       * treinos por rodada, e o peso só preenche data VAZIA (o que o aluno
       * digitou vence). ptsaudeSync NÃO entra na lista do devolveApp (laço).
       * Sem cardio no app, window.__crImporta nem existe — o peso importa
       * mesmo assim. Tudo em try/catch: roda em timer, erro solto mataria o
       * resto do boot dos Ajustes. */
      "var sBusy=false,sUlt=0;" +
      "function saudePuxa(forca){" +
      "if(sBusy)return;if(!forca&&Date.now()-sUlt<9e5)return;sBusy=true;sUlt=Date.now();setTimeout(function(){sBusy=false;},10000);" +
      "if(nv.treinos&&window.__crImporta){try{" +
      "var mk=L('ptsaudeSync','');var desde=mk?new Date(Date.parse(mk)-48*3600*1000).toISOString():new Date(Date.now()-30*24*3600*1000).toISOString();" +
      "nv.treinos(desde,function(lista){try{if(!Array.isArray(lista))return;var n=0;" +
      "lista.slice(0,20).forEach(function(t9){var r9=window.__crImporta(String(t9||''),'Do relógio',true);if(r9)n++;});" +
      "Sv('ptsaudeSync',new Date().toISOString());" +
      "if(n>0){var sb=row.querySelector('.mgsub');if(sb)sb.textContent=n+(n>1?' treinos importados do relógio':' treino importado do relógio');}" +
      "}catch(e1){}});}catch(e2){}}" +
      "if(nv.peso){try{nv.peso(function(o){try{if(!o)return;var kg=+o.kg,d9=String(o.data||'');" +
      "if(!(kg>=20&&kg<=400)||!/^\\d{4}-\\d{2}-\\d{2}$/.test(d9))return;" +
      "var pz=L('ptpeso',{});if(pz[d9]!=null)return;pz[d9]=kg;Sv('ptpeso',pz);" +
      "try{pintaPeso();pintaMetaPeso();}catch(e3){}}catch(e4){}});}catch(e5){}}}" +
      "setTimeout(function(){saudePuxa();},3000);" +
      "document.addEventListener('visibilitychange',function(){if(!document.hidden)saudePuxa();});" +
      "window.__saudeSync={puxa:saudePuxa,desde:function(){return L('ptsaudeSync','');}};})();" +
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
