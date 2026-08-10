/* TORQUE ON — demonstrações animadas dos exercícios (100% offline, sem vídeo externo).
 * Um boneco articulado desenhado em SVG: cada padrão de movimento tem duas poses
 * (início e fim) e o SVG interpola sozinho, em loop. Nada de YouTube, nada de download.
 * Uso: MT_ANIM.svg(MT_ANIM.padrao(nome, grupo), "#7c3aed", 150) → string SVG. */
(function () {
  // ── boneco: ângulos em graus, 0 = apontando pra cima, cresce no sentido horário ──
  var L = { tronco: 30, pescoco: 11, braco: 15, ante: 15, coxa: 20, perna: 20, cabeca: 8 };
  function dir(a, d) { var r = a * Math.PI / 180; return [d * Math.sin(r), -d * Math.cos(r)]; }
  function som(p, v) { return [p[0] + v[0], p[1] + v[1]]; }
  function pt(p) { return Math.round(p[0] * 10) / 10 + "," + Math.round(p[1] * 10) / 10; }
  // pose: {hx, hy, tr, om, cot, qua, joe, ar} → pontos crus do esqueleto
  var CHAO = 112;
  function crua(P) {
    var q = [P.hx, P.hy];
    var om = som(q, dir(P.tr, L.tronco));
    var cab = som(om, dir(P.tr, L.pescoco));
    var cot = som(om, dir(P.om, L.braco));
    var mao = som(cot, dir(P.om + (P.cot || 0), L.ante));
    var joe = som(q, dir(P.qua, L.coxa));
    var pe = som(joe, dir(P.qua + (P.joe || 0), L.perna));
    // membros do lado de trás: por padrão quase junto (dá volume ao boneco);
    // em corrida/afundo eles são explícitos (om2/qua2), aí o movimento fica alternado
    var om2 = P.om2 == null ? P.om + 13 : P.om2, cot2 = P.cot2 == null ? (P.cot || 0) : P.cot2;
    var qua2 = P.qua2 == null ? P.qua - 11 : P.qua2, joe2 = P.joe2 == null ? (P.joe || 0) : P.joe2;
    var cotB = som(om, dir(om2, L.braco));
    var maoB = som(cotB, dir(om2 + cot2, L.ante));
    var joeB = som(q, dir(qua2, L.coxa));
    var peB = som(joeB, dir(qua2 + joe2, L.perna));
    return { cab: cab, om: om, q: q, cot: cot, mao: mao, joe: joe, pe: pe,
      cotB: cotB, maoB: maoB, joeB: joeB, peB: peB, ar: P.ar || 0 };
  }
  // o par de poses é ancorado junto: o apoio mais baixo encosta no chão (menos o "ar" do salto)
  // e as duas usam o MESMO deslocamento lateral — senão o movimento horizontal sumiria
  function par(p1, p2) {
    var e = [crua(p1), crua(p2)];
    var minX = 1e9, maxX = -1e9;
    e.forEach(function (s) {
      var pts = [s.cab, s.om, s.q, s.cot, s.mao, s.joe, s.pe, s.cotB, s.maoB, s.joeB, s.peB];
      var baixo = Math.max.apply(null, pts.map(function (p) { return p[1] + (p === s.cab ? L.cabeca : 0); }));
      s.dy = CHAO - s.ar - baixo;
      pts.forEach(function (p) {
        var r = p === s.cab ? L.cabeca : 0;
        minX = Math.min(minX, p[0] - r); maxX = Math.max(maxX, p[0] + r);
      });
    });
    var dx = 60 - (minX + maxX) / 2, alto = 1e9;
    var poses = e.map(function (s) {
      var m = function (p) { return [p[0] + dx, p[1] + s.dy]; };
      [s.cab, s.om, s.q, s.cot, s.mao, s.joe, s.pe, s.cotB, s.maoB, s.joeB, s.peB].forEach(function (p) {
        alto = Math.min(alto, p[1] + s.dy - (p === s.cab ? L.cabeca : 0));
      });
      return { cab: m(s.cab), tronco: pt(m(s.om)) + " " + pt(m(s.q)),
        braco: pt(m(s.om)) + " " + pt(m(s.cot)) + " " + pt(m(s.mao)),
        perna: pt(m(s.q)) + " " + pt(m(s.joe)) + " " + pt(m(s.pe)),
        bracoB: pt(m(s.om)) + " " + pt(m(s.cotB)) + " " + pt(m(s.maoB)),
        pernaB: pt(m(s.q)) + " " + pt(m(s.joeB)) + " " + pt(m(s.peB)) };
    });
    // o quadro acompanha o movimento: sem faixa vazia em cima nos exercícios deitados
    var y0 = Math.max(0, Math.round(alto - 8));
    poses.vb = "0 " + y0 + " 120 " + (CHAO + 8 - y0);
    return poses;
  }

  // ── padrões de movimento: [poseInício, poseFim] ──
  var POSES = {
    agacho: [{ hx: 58, hy: 62, tr: 0, om: 178, cot: 4, qua: 180, joe: 0 },
      { hx: 62, hy: 78, tr: 34, om: 104, cot: 8, qua: 132, joe: 76 }],
    afundo: [{ hx: 58, hy: 62, tr: 2, om: 176, cot: 4, qua: 180, joe: 0 },
      { hx: 58, hy: 74, tr: 6, om: 172, cot: 6, qua: 142, joe: 44, qua2: 208, joe2: -62 }],
    salto: [{ hx: 60, hy: 74, tr: 26, om: 214, cot: -10, qua: 138, joe: 70 },
      { hx: 58, hy: 48, tr: 0, om: 14, cot: 6, qua: 184, joe: -6, ar: 24 }],
    empurra_h: [{ hx: 46, hy: 70, tr: 74, om: 174, cot: 4, qua: 100, joe: 6 },
      { hx: 46, hy: 76, tr: 74, om: 214, cot: 68, qua: 100, joe: 6 }],
    empurra_v: [{ hx: 58, hy: 64, tr: 0, om: 152, cot: -108, qua: 180, joe: 0 },
      { hx: 58, hy: 64, tr: 0, om: 8, cot: 4, qua: 180, joe: 0 }],
    puxa_v: [{ hx: 58, hy: 64, tr: 0, om: 8, cot: 2, qua: 180, joe: -12 },
      { hx: 58, hy: 56, tr: 0, om: 26, cot: 118, qua: 180, joe: -14 }],
    puxa_h: [{ hx: 58, hy: 66, tr: 62, om: 168, cot: 4, qua: 178, joe: 6 },
      { hx: 58, hy: 66, tr: 62, om: 206, cot: 96, qua: 178, joe: 6 }],
    rosca: [{ hx: 58, hy: 64, tr: 0, om: 176, cot: 6, qua: 180, joe: 0 },
      { hx: 58, hy: 64, tr: 0, om: 176, cot: -128, qua: 180, joe: 0 }],
    triceps: [{ hx: 58, hy: 64, tr: 0, om: 152, cot: -118, qua: 180, joe: 0 },
      { hx: 58, hy: 64, tr: 0, om: 158, cot: -8, qua: 180, joe: 0 }],
    elev_lateral: [{ hx: 58, hy: 64, tr: 0, om: 176, cot: 4, qua: 180, joe: 0 },
      { hx: 58, hy: 64, tr: 0, om: 92, cot: 4, qua: 180, joe: 0 }],
    dobradica: [{ hx: 58, hy: 62, tr: 2, om: 176, cot: 4, qua: 180, joe: -4 },
      { hx: 62, hy: 64, tr: 76, om: 176, cot: 4, qua: 190, joe: -14 }],
    abdominal: [{ hx: 44, hy: 84, tr: 96, om: 40, cot: 30, qua: 128, joe: 96 },
      { hx: 44, hy: 84, tr: 56, om: 20, cot: 30, qua: 128, joe: 96 }],
    prancha: [{ hx: 50, hy: 74, tr: 76, om: 186, cot: 8, qua: 106, joe: 4 },
      { hx: 50, hy: 71, tr: 78, om: 190, cot: 6, qua: 104, joe: 4 }],
    panturrilha: [{ hx: 58, hy: 62, tr: 0, om: 178, cot: 4, qua: 180, joe: 0 },
      { hx: 58, hy: 62, tr: 0, om: 178, cot: 4, qua: 180, joe: 0, ar: 9 }],
    corrida: [{ hx: 58, hy: 62, tr: 10, om: 148, cot: -76, qua: 148, joe: 44, om2: 212, cot2: -70, qua2: 214, joe2: 34 },
      { hx: 58, hy: 60, tr: 10, om: 212, cot: -70, qua: 214, joe: 34, om2: 148, cot2: -76, qua2: 148, joe2: 44 }],
    along: [{ hx: 58, hy: 62, tr: 2, om: 176, cot: 4, qua: 180, joe: 0 },
      { hx: 58, hy: 62, tr: 22, om: 30, cot: 8, qua: 196, joe: -8 }],
    aquatico: [{ hx: 56, hy: 70, tr: 6, om: 150, cot: -60, qua: 158, joe: 34 },
      { hx: 56, hy: 68, tr: 6, om: 210, cot: -60, qua: 202, joe: 24 }],
  };

  // ── de qual padrão é cada exercício (nome primeiro, grupo como rede de segurança) ──
  var REGRAS = [
    // o aquático vem primeiro: "corrida na água" e "prancha na borda" são natação, não corrida/core
    [/\bnado\b|\bnada\b|piscina|aqu[aá]tic|bra[çc]ada|pernada|\bhidro|na água|pull buoy|flutuador/i, "aquatico"],
    [/prancha|isometr|hollow|bird ?dog|ponte de gl/i, "prancha"],
    [/abdominal|abdôm|crunch|canivete|elevaç(ão|ões) de pernas|russian|sit.?up|obl[ií]qu/i, "abdominal"],
    [/panturrilha|calcanhar|gemelar|s[oó]leo/i, "panturrilha"],
    [/afundo|avanço|passada|b[uú]lgaro|step|subida no banco/i, "afundo"],
    [/salto|pliom|jump|box jump|burpee|polichinelo|tuck/i, "salto"],
    [/corrida|correr|caminhada|trote|esteira|bike|bicicleta|el[ií]ptico|remo erg|escada|pular corda|sprint|tiro/i, "corrida"],
    [/along|mobilidade|alongue|yoga|pilates|respira|gato.?camelo|cachorro olhando/i, "along"],
    [/rosca|b[ií]ceps|curl/i, "rosca"],
    [/tr[ií]ceps|coice|testa|franc[êe]s|mergulho|paralel/i, "triceps"],
    [/elevaç(ão|ões) lateral|elevaç(ão|ões) frontal|crucifixo invertido|abduç(ão|ões) de ombro|face pull|puxada de face/i, "elev_lateral"],
    [/desenvolvimento|militar|press.*(ombro|cabeça|acima)|arremesso|thruster|overhead|push press|landmine press/i, "empurra_v"],
    [/supino|flex(ão|ões) de bra|crucifixo|push.?up|peck|cross ?over|flexão de peito|apoio de solo/i, "empurra_h"],
    [/barra fixa|puxada|pulldown|pull.?up|chin.?up|muscle.?up/i, "puxa_v"],
    [/remada|serrote|row|puxada horizontal|face|encolhimento/i, "puxa_h"],
    [/terra|stiff|good ?morning|levantamento|kettlebell swing|swing|romeno|extens(ão|ões) lombar|hiperextens/i, "dobradica"],
    [/agachamento|agacho|squat|leg press|cadeira extensora|flexora|hack|sumo|cadeirinha/i, "agacho"],
  ];
  var POR_GRUPO = {
    "Peito": "empurra_h", "Costas": "puxa_h", "Ombros": "empurra_v", "Bíceps": "rosca", "Tríceps": "triceps",
    "Quadríceps": "agacho", "Posterior e glúteo": "dobradica", "Core": "abdominal", "Cardio": "corrida",
    "Funcional e Cross": "salto", "Mobilidade e alongamento": "along", "Boxe e lutas": "corrida",
    "Pilates e yoga": "along", "Reabilitação e terceira idade": "along", "Ginástica e calistenia": "empurra_h",
    "Natação e aquático": "aquatico",
  };
  function padrao(nome, grupo) {
    var n = String(nome || "");
    for (var i = 0; i < REGRAS.length; i++) if (REGRAS[i][0].test(n)) return REGRAS[i][1];
    return POR_GRUPO[grupo] || "agacho";
  }

  // ── o SVG: as poses viram valores animados (o navegador interpola sozinho) ──
  function svg(pad, cor, tam) {
    var p2 = POSES[pad] || POSES.agacho;
    var pp = par(p2[0], p2[1]), a = pp[0], b = pp[1];
    var t = tam || 150, c = cor || "#7c3aed";
    var vals = function (x, y) { return x + ";" + y + ";" + x; };
    var an = function (attr, v1, v2) {
      return "<animate attributeName='" + attr + "' values='" + vals(v1, v2) +
        "' dur='2.6s' repeatCount='indefinite' calcMode='spline' keyTimes='0;0.5;1' keySplines='.4 0 .2 1;.4 0 .2 1'/>";
    };
    var linha = function (nome, fundo) {
      return "<polyline points='" + a[nome] + "' fill='none' stroke='" + c + "' stroke-width='" + (fundo ? 4 : 5) +
        "' stroke-linecap='round' stroke-linejoin='round'" + (fundo ? " opacity='.42'" : "") + ">" +
        an("points", a[nome], b[nome]) + "</polyline>";
    };
    return "<svg viewBox='" + pp.vb + "' width='" + t + "' height='" + t + "' role='img' aria-label='demonstração do movimento' style='display:block;'>" +
      "<line x1='8' y1='112' x2='112' y2='112' stroke='" + c + "' stroke-width='2' stroke-linecap='round' opacity='.28'/>" +
      linha("pernaB", 1) + linha("bracoB", 1) + linha("tronco") + linha("perna") + linha("braco") +
      "<circle cx='" + (Math.round(a.cab[0] * 10) / 10) + "' cy='" + (Math.round(a.cab[1] * 10) / 10) + "' r='" + L.cabeca + "' fill='" + c + "'>" +
      an("cx", Math.round(a.cab[0] * 10) / 10, Math.round(b.cab[0] * 10) / 10) +
      an("cy", Math.round(a.cab[1] * 10) / 10, Math.round(b.cab[1] * 10) / 10) + "</circle></svg>";
  }

  // ── versão compacta pro app do aluno: só os pontos prontos (o motor pesado fica no painel) ──
  // O app recebe ~4 KB e remonta o mesmo SVG com 5 linhas (veja animSvg no builder).
  function compacto() {
    var out = {};
    Object.keys(POSES).forEach(function (k) {
      var pp = par(POSES[k][0], POSES[k][1]);
      var l = pp.map(function (s) {
        return [s.tronco, s.perna, s.braco, s.pernaB, s.bracoB,
          Math.round(s.cab[0] * 10) / 10 + "," + Math.round(s.cab[1] * 10) / 10];
      });
      l.push(pp.vb);
      out[k] = l;
    });
    return out;
  }
  self.MT_ANIM = { padrao: padrao, svg: svg, poses: POSES, compacto: compacto, raio: L.cabeca };
})();
