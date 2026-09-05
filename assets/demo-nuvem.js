/* TORQUE ON — simulador de nuvem do DEMO do painel (personal.html).
 *
 * Por que existe: o demo público (demo-personal.html) roda 100% neste
 * navegador, sem conta. Só que TRÊS telas do painel vivem da nuvem — Chat,
 * Questionários e Comunidade — e sem ela elas só sabem dizer "precisa da sua
 * conta". Quem abre o demo pra conhecer o produto via caixa vazia.
 *
 * O que este arquivo faz: troca window.MTStore.cloud() por um cliente de
 * mentira, resolvido em memória. Nenhuma chamada sai do navegador.
 *
 * O que ele NÃO faz, de propósito:
 *   - não mexe em sync.client, então o motor de sincronização do store
 *     continua desligado: o demo nunca escreve em banco nenhum;
 *   - não deixa chamar Edge Function de verdade (whatsapp, pagamentos, IA) —
 *     um demo público não pode disparar mensagem nem link de cobrança;
 *   - não devolve assinatura ativa, pra a faixa "Modo teste" continuar
 *     dizendo a verdade sobre o que o demo é.
 *
 * Trava dupla: só liga com mtapp:ptDemo E mtapp:ptDemoNuvem, as duas gravadas
 * só pelo demo-personal.html. O professor de verdade não tem nenhuma das duas.
 */
(function (raiz) {
  "use strict";
  var LIGADO = false;
  try {
    LIGADO = localStorage.getItem("mtapp:ptDemo") === "1" &&
             localStorage.getItem("mtapp:ptDemoNuvem") === "1";
  } catch (e) { LIGADO = false; }
  if (!LIGADO || !raiz.MTStore) return;

  var AID = "demo-studio";
  var SEQ = 1;
  var BASE = null;   // { tabela: [linhas] } — montado na primeira consulta

  // ---------- datas sempre relativas a HOJE (senão o demo envelhece) ----------
  function dia(atras) {
    var d = new Date();
    d.setDate(d.getDate() - atras);
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }
  /* Sem "Z" de proposito: o Chat le a hora por fatia de string (slice 11..16)
   * mas a Comunidade le com new Date(iso).getHours() — com o Z o post das 07:58
   * apareceria as 04:58 no fuso do Brasil. */
  function inst(atras, hhmm) { return dia(atras) + "T" + hhmm + ":00"; }
  function diasDesdeSegunda() { return (new Date().getDay() + 6) % 7; }

  /* ---------- de onde vêm os nomes ----------
   * Os alunos saem do próprio studio de exemplo já gravado no localStorage.
   * Assim o Chat fala com a Carla que está na lista de Alunos — e se o demo
   * mudar de elenco amanhã, isto acompanha sozinho. */
  function alunos() {
    try {
      var st = JSON.parse(localStorage.getItem("mtapp:ptStudio") || "{}");
      return (st.alunos || []).filter(function (a) { return a.ativo !== false && a.appTokenP; });
    } catch (e) { return []; }
  }
  function primeiro(nome) { return String(nome || "").split(" ")[0]; }

  // ---------- as linhas de mentira ----------
  function monta() {
    var as = alunos();
    var b = {
      app_chat: [], app_checkin: [], app_quest: [], app_feed: [],
      app_agenda: [], app_treino_log: [], app_aluno: [],
      pagarme_eventos: [], pag_eventos: [], site_pro: [], chat_config: [],
    };
    if (!as.length) return b;

    // --- app_aluno: um pacote publicado por aluno.
    // A coluna `ver` existe porque o painel pede select("token,ver:dados->>ver"):
    // sem ela TODO aluno viraria "app congelado" e a faixa vermelha assustaria
    // quem só veio conhecer.
    as.forEach(function (a) {
      b.app_aluno.push({
        token: a.appTokenP, academia_id: AID, ver: raiz.MT_VERSAO || "mt-v621",
        atualizado: inst(2, "09:00"), dados: { ver: raiz.MT_VERSAO || "mt-v621" }, retorno: null,
      });
    });

    // --- Chat: seis conversas, em ordem crescente (a lista mostra a ÚLTIMA
    // mensagem como prévia, então a ordem é o que faz a tela dizer a verdade).
    var CONVERSAS = [
      { i: 2, msgs: [
        ["aluno", 0, "08:41", "Professor, consigo trocar a de quinta pra sexta?", false],
        ["aluno", 0, "08:42", "É que entrou uma reunião no fim da tarde 🙈", false],
      ] },
      { i: 10, msgs: [
        ["aluno", 1, "19:30", "Terminei o treino B hoje, o ombro nem reclamou!", true],
        ["personal", 1, "20:05", "Boa! Semana que vem eu subo a carga do desenvolvimento então.", true],
        ["aluno", 0, "07:12", "Obrigada! 💪", false],
      ] },
      { i: 0, msgs: [
        ["aluno", 0, "06:58", "Bom dia! O agacho hoje foi 55 kg, consegui as 4 séries", true],
        ["personal", 0, "07:20", "Que orgulho, " + "{nome}" + "! Anota aí que semana que vem a gente sobe pra 57,5.", true],
      ] },
      { i: 17, msgs: [
        ["aluno", 3, "11:02", "Professor, dá pra parcelar a mensalidade desse mês?", false],
      ] },
      { i: 8, msgs: [
        ["aluno", 6, "18:44", "Fecho o mês com 20 treinos! 🔥", true],
        ["personal", 6, "19:10", "Melhor mês seu desde que começou. Bora repetir.", true],
      ] },
      { i: 23, msgs: [
        ["personal", 9, "10:00", "Deixei o treino novo no app — é o de força que a gente conversou.", true],
      ] },
    ];
    CONVERSAS.forEach(function (c) {
      var a = as[c.i % as.length];
      if (!a) return;
      c.msgs.forEach(function (m) {
        b.app_chat.push({
          id: "dmc" + (SEQ++), academia_id: AID, token: a.appTokenP,
          de: m[0], criado: inst(m[1], m[2]),
          texto: String(m[3]).replace("{nome}", primeiro(a.nome)), lida: m[4],
        });
      });
    });

    // --- Check-in da semana: a maioria respondeu, três pedem atenção.
    var desdeSeg = diasDesdeSegunda();
    var TEXTOS = [
      "Semana boa, dormi melhor. Só o ombro que incomodou no supino.",
      "Consegui os três treinos, tô me sentindo bem mais disposta.",
      "Semana corrida no trabalho, faltei uma. Volto firme.",
      "Joelho deu uma fisgada no agacho, peguei leve.",
      "Tudo certo! Já tô sentindo a roupa mais folgada.",
      "", "Dormi mal a semana toda, tô arrastando.", "",
    ];
    as.forEach(function (a, i) {
      if (i % 7 === 3) return;                       // ~1 em 7 não respondeu
      var atras = Math.min(desdeSeg, (i % 3) + 1);   // dentro desta semana
      var nota = i % 11 === 2 ? 2 : i % 13 === 5 ? 1 : (3 + (i % 3));
      b.app_checkin.push({
        id: "dck" + (SEQ++), token: a.appTokenP, dia: dia(atras), nota: nota,
        texto: TEXTOS[i % TEXTOS.length],
        peso: Math.round((58 + (i % 40)) * 10) / 10,
      });
    });
    // e um histórico de 4 semanas, que é o que a Assessoria mostra
    as.forEach(function (a, i) {
      [7, 14, 21].forEach(function (d, k) {
        b.app_checkin.push({
          id: "dck" + (SEQ++), token: a.appTokenP, dia: dia(d + (i % 3)),
          nota: 3 + ((i + k) % 3), texto: k === 0 ? TEXTOS[(i + 1) % TEXTOS.length] : "",
          peso: Math.round((58 + (i % 40) + (k * 0.4)) * 10) / 10,
        });
      });
    });

    // --- Questionário do professor: quatro perguntas, duas em que nota BAIXA
    // é melhor (dor e estresse) — é o que faz a tela 3b separar quem pede
    // atenção de quem está bem.
    var PERGS = [
      { sigla: "DISP", pergunta: "Disposição", menos: false },
      { sigla: "SONO", pergunta: "Sono", menos: false },
      { sigla: "DOR", pergunta: "Dor no ombro", menos: true },
      { sigla: "EST", pergunta: "Estresse", menos: true },
    ];
    as.forEach(function (a, i) {
      if (i % 3 !== 0) return;                      // um terço respondeu o questionário
      var atras = Math.min(desdeSeg, 1 + (i % 2));
      var ruim = i % 9 === 0;
      b.app_quest.push({
        id: "dqs" + (SEQ++), token: a.appTokenP, questionario: "Como você está?",
        criado: inst(atras, "20:14"),
        dados: {
          pontuacao: ruim ? -1 : 2,
          respostas: PERGS.map(function (p, k) {
            var v = p.menos ? (ruim && k === 2 ? 8 : 2 + (i % 3))
                            : (ruim ? 3 : 6 + ((i + k) % 4));
            return { sigla: p.sigla, pergunta: p.pergunta, resposta: String(v), pontos: v, menos: p.menos };
          }).concat([{ sigla: "LIVRE", pergunta: "Quer me contar mais alguma coisa?",
            resposta: ruim ? "O ombro tá incomodando no fim das séries de ombro. O resto tá tranquilo."
                           : "Semana boa, tô gostando do A2 de esteira." }]),
        },
      });
    });

    // --- Comunidade: cinco posts, um escondido pra mostrar a moderação
    var POSTS = [
      { i: 11, d: 0, h: "07:58", t: "Primeira vez fazendo as 4 voltas sem parar 🎉", tr: "Circuito de 4 voltas" },
      { i: 0, d: 0, h: "19:12", t: "50 kg no supino — antes eram 46!", tr: "Treino A · Peito" },
      { i: 16, d: 1, h: "06:40", t: "5 km hoje antes do trabalho. Bora que dá!", tr: "Corrida leve" },
      { i: 8, d: 2, h: "21:03", t: "Fechei a semana com 5 treinos pela primeira vez 💪", tr: "Treino C · Pernas" },
      { i: 20, d: 3, h: "20:12", t: "Alguém vende um par de halteres de 12 kg?", tr: "", oculto: true },
    ];
    POSTS.forEach(function (p) {
      var a = as[p.i % as.length];
      if (!a) return;
      b.app_feed.push({
        id: "dfd" + (SEQ++), academia_id: AID, nome: a.nome, texto: p.t,
        foto: "", treino: p.tr, oculto: !!p.oculto, criado: inst(p.d, p.h),
      });
    });

    // --- Pedidos de horário pelo app (a faixa roxa da Agenda)
    [{ i: 2, d: 2, h: "08:00", o: "Só consigo de manhã essa semana" },
     { i: 19, d: 3, h: "09:00", o: "" }].forEach(function (p) {
      var a = as[p.i % as.length];
      if (!a) return;
      b.app_agenda.push({
        id: "dag" + (SEQ++), academia_id: AID, token: a.appTokenP,
        dia: dia(-p.d), hora: p.h, obs: p.o, status: "pedido",
      });
    });

    // --- Treinos que os alunos marcaram no app (aba Assessoria)
    var EXS = ["Agachamento livre", "Supino reto com barra", "Remada curvada com barra",
      "Leg press 45°", "Puxada alta na polia", "Elevação pélvica"];
    as.forEach(function (a, i) {
      var freq = 2 + (i % 4);
      for (var d = 1; d <= 28; d++) {
        if ((d + i) % Math.max(2, Math.round(7 / freq)) !== 0) continue;
        b.app_treino_log.push({
          id: "dtl" + (SEQ++), token: a.appTokenP, dia: dia(d),
          exercicio: EXS[(i + d) % EXS.length],
        });
      }
    });
    return b;
  }

  function base() { if (!BASE) BASE = monta(); return BASE; }

  /* ---------- o cliente de mentira ----------
   * Uma cadeia igual à do supabase-js, resolvida em memória. Os filtros são
   * aplicados DE VERDADE (eq, in, gte, order, limit) porque o painel conta com
   * eles: sem o order ascendente, a prévia do chat mostraria a mensagem mais
   * velha; sem o eq(token), a conversa da Carla teria a fala do Bruno.
   */
  function casa(l, f) {
    var v = l[f.col];
    if (f.op === "eq") return String(v) === String(f.val);
    if (f.op === "neq") return String(v) !== String(f.val);
    if (f.op === "gt") return v > f.val;
    if (f.op === "gte") return v >= f.val;
    if (f.op === "lt") return v < f.val;
    if (f.op === "lte") return v <= f.val;
    if (f.op === "in") return (f.val || []).some(function (x) { return String(x) === String(v); });
    if (f.op === "is") return f.val === null ? (v === null || v === undefined) : v === f.val;
    return true;
  }
  function chavePrim(tab) { return tab === "site_pro" ? "slug" : tab === "app_aluno" ? "token" : "id"; }

  function tabela(nome) {
    var e = { tab: nome, filtros: [], ordem: null, limite: 0, um: false, acao: null, corpo: null };
    var api = {};
    ["eq", "neq", "gt", "gte", "lt", "lte", "in", "is"].forEach(function (op) {
      api[op] = function (col, val) { e.filtros.push({ op: op, col: col, val: val }); return api; };
    });
    // o que o simulador não precisa entender só não pode quebrar a cadeia
    ["match", "not", "or", "filter", "like", "ilike", "contains", "overlaps", "textSearch"]
      .forEach(function (m) { api[m] = function () { return api; }; });
    api.select = function () { return api; };
    api.order = function (col, o) { e.ordem = { col: col, asc: !o || o.ascending !== false }; return api; };
    api.limit = function (n) { e.limite = +n || 0; return api; };
    api.range = function (a, z) { e.limite = (+z - +a) + 1; return api; };
    api.single = api.maybeSingle = function () { e.um = true; return api; };
    ["insert", "update", "upsert", "delete"].forEach(function (acao) {
      api[acao] = function (corpo) { e.acao = acao; e.corpo = corpo; return api; };
    });

    function resolve() {
      var linhas = base()[e.tab] || (base()[e.tab] = []);
      var passa = function (l) { return e.filtros.every(function (f) { return casa(l, f); }); };
      // escrita: mexe na base de mentira pra o demo parecer vivo — a mensagem
      // que o professor manda aparece, o post que ele esconde some
      if (e.acao === "insert" || e.acao === "upsert") {
        var novas = [].concat(e.corpo || []).map(function (r) {
          var c = {};
          for (var k in r) if (Object.prototype.hasOwnProperty.call(r, k)) c[k] = r[k];
          if (!c.id) c.id = "dm" + (SEQ++);
          if (!c.criado) c.criado = new Date().toISOString();
          if (!c.academia_id) c.academia_id = AID;
          // até a v775 o pacote levava o app inteiro (~500 KB de HTML); desde a
          // v776 vai vazio, mas linha velha ainda pode chegar cheia — o demo só
          // precisa saber que existe, então descarta de qualquer jeito
          if (c.dados && c.dados.html) c.dados = { ver: c.dados.ver, stamp: c.dados.stamp };
          if (c.dados && c.dados.ver) c.ver = c.dados.ver;
          return c;
        });
        if (e.acao === "upsert") {
          var k2 = chavePrim(e.tab);
          novas.forEach(function (c) {
            var i = -1;
            linhas.forEach(function (l, n) { if (l[k2] === c[k2]) i = n; });
            if (i >= 0) { for (var p in c) linhas[i][p] = c[p]; } else linhas.push(c);
          });
        } else { linhas.push.apply(linhas, novas); }
        return { data: novas, error: null };
      }
      if (e.acao === "update") {
        var mexidas = [];
        linhas.forEach(function (l) {
          if (!passa(l)) return;
          for (var p in e.corpo) if (Object.prototype.hasOwnProperty.call(e.corpo, p)) l[p] = e.corpo[p];
          mexidas.push(l);
        });
        return { data: mexidas, error: null };
      }
      if (e.acao === "delete") {
        var fora = linhas.filter(passa);
        base()[e.tab] = linhas.filter(function (l) { return !passa(l); });
        return { data: fora, error: null };
      }
      var saida = linhas.filter(passa);
      if (e.ordem) {
        var c2 = e.ordem.col, sinal = e.ordem.asc ? 1 : -1;
        saida = saida.slice().sort(function (x, y) {
          var a = x[c2], z = y[c2];
          return a === z ? 0 : (a > z ? 1 : -1) * sinal;
        });
      }
      if (e.limite) saida = saida.slice(0, e.limite);
      saida = saida.map(function (l) {
        var c = {};
        for (var k in l) if (Object.prototype.hasOwnProperty.call(l, k)) c[k] = l[k];
        return c;
      });
      return { data: e.um ? (saida[0] || null) : saida, error: null };
    }

    // thenable de verdade: o painel joga o objeto cru dentro de Promise.all
    // em dois lugares, e usa .then(ok, err).catch(fn) em outros
    api.then = function (ok, ruim) { return Promise.resolve().then(resolve).then(ok, ruim); };
    api.catch = function (ruim) { return api.then(null, ruim); };
    api.finally = function (fn) { return api.then(fn, fn); };
    return api;
  }

  // ---------- as RPCs ----------
  function rpc(nome, args) {
    var d = null;
    if (nome === "app_desafio_ranking") {
      var as = alunos().slice(0, 6);
      d = { ok: true, ranking: as.map(function (a, i) {
        return { nome: a.nome, dias: 15 - i * 2, ultimo: dia(i % 3) };
      }) };
    } else if (nome === "app_alunos_vistos") {
      // três ainda não abriram: é o que dá assunto pro card "quem não abriu"
      d = (args && args.p_tokens || []).map(function (t, i) {
        return { token: t, publicado_em: inst(20 - (i % 10), "10:00"),
          visto_em: i % 8 === 3 ? null : inst((i % 5) + 1, "19:20") };
      });
    } else if (nome === "app_aluno_faxina") {
      d = { revogados: 0 };
    } else if (nome === "zap_config_ve" || nome === "pag_config_ve") {
      // nada configurado no demo: WhatsApp oficial e gateway proprio aparecem
      // como desligados, que e a verdade de quem acabou de conhecer o sistema
      d = {};
    } else if (nome === "minha_assinatura") {
      // de propósito sem status: a faixa "Modo teste" tem que continuar
      // dizendo a verdade sobre o que este demo é
      d = null;
    } else {
      d = { ok: true };   // aluno_define_login, revoga, religa…
    }
    return Promise.resolve({ data: d, error: null });
  }

  // ---------- o cliente ----------
  var CLIENTE = {
    from: tabela,
    rpc: rpc,
    // sem sessão: as Edge Functions ficam de fora (ver o embrulho abaixo)
    auth: {
      getSession: function () { return Promise.resolve({ data: { session: null }, error: null }); },
      getUser: function () { return Promise.resolve({ data: { user: null }, error: null }); },
      refreshSession: function () { return Promise.resolve({ data: { session: null }, error: null }); },
    },
    channel: function () { return { on: function () { return this; }, subscribe: function () { return this; } }; },
    removeChannel: function () {},
  };

  raiz.MTStore.cloud = function () { return { client: CLIENTE, aid: AID }; };

  /* Edge Function no demo, não. São elas que mandam WhatsApp de verdade, geram
   * link de cobrança e chamam a IA — nada disso pode sair de uma página pública
   * de demonstração. O recado diz a verdade em vez de dar erro de rede. */
  if (raiz.MT_FUNCAO && typeof raiz.MT_FUNCAO.chama === "function") {
    raiz.MT_FUNCAO.chama = function (client, nome, corpo, oQue) {
      return Promise.resolve({
        erro: (oQue || "Isso") + " não roda no demo — aqui é uma demonstração, " +
          "sem conta e sem internet. No sistema de verdade funciona normalmente.",
      });
    };
  }

  raiz.__demoNuvem = { base: base, monta: monta, cliente: CLIENTE }; // testes
})(typeof self !== "undefined" ? self : this);
