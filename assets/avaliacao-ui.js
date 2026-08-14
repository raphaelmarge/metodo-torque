/* TORQUE ON — visual da área de avaliação (window.MT_AVAL_UI).
 *
 * Só desenha: recebe o laudo pronto do MT_CORPO e as medidas do MT_SCANNER e
 * devolve HTML (cards com selo, donut de gordura, boneco com as medidas por
 * segmento e o tutorial das poses). Nenhuma conta de saúde mora aqui — quem
 * calcula e classifica são os motores; se um selo parecer errado, o conserto
 * é lá, não neste arquivo.
 *
 * Todas as funções devolvem string, de propósito: dá pra testar em node puro
 * e usar tanto no Personal quanto no Nutri (e no app do aluno, um dia).
 */
(function (raiz) {
  var U = {};

  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  function vg(v, casas) {
    if (v == null || v === "" || !isFinite(v)) return "—";
    var c = casas == null ? 1 : casas;
    return (c === 0 ? String(Math.round(v)) : Number(v).toFixed(c)).replace(".", ",");
  }
  U.fmt = vg;

  /* ---------- selo (a pílula colorida de classificação) ---------- */
  var TONS = {
    ok: ["rgba(34,197,94,.16)", "#4ade80"],
    atencao: ["rgba(251,191,36,.14)", "#fbbf24"],
    ruim: ["rgba(248,113,113,.16)", "#f87171"],
    info: ["rgba(96,165,250,.14)", "#60a5fa"],
    neutro: ["rgba(124,58,237,.16)", "#a78bfa"],
  };
  U.selo = function (texto, tom) {
    if (!texto) return "";
    var t = TONS[tom] || TONS.neutro;
    return "<span class='av-selo' style='display:inline-block;font-size:10.5px;font-weight:800;letter-spacing:.02em;border-radius:999px;padding:2.5px 9px;background:" + t[0] + ";color:" + t[1] + ";'>" + esc(texto) + "</span>";
  };

  // tom do selo a partir do "abaixo | normal | acima" que o motor devolve
  function tomDe(classe, abaixoTom) {
    if (classe === "normal") return "ok";
    if (classe === "abaixo") return abaixoTom || "info";
    if (classe === "acima") return "ruim";
    return "neutro";
  }
  // rótulos por risco (cintura, RCQ)
  function seloRisco(risco) {
    if (risco === "baixo") return U.selo("Adequado", "ok");
    if (risco === "moderado") return U.selo("Atenção", "atencao");
    if (risco === "alto") return U.selo("Inadequado", "ruim");
    return "";
  }

  /* ---------- card de métrica ---------- */
  U.card = function (o) {
    return "<div class='av-card' style='flex:1;min-width:132px;background:rgba(124,58,237,.07);border:1px solid var(--linha,#322e3d);border-radius:14px;padding:12px 14px;'>" +
      "<div style='font-size:9.5px;font-weight:800;letter-spacing:.11em;color:#8a8695;text-transform:uppercase;'>" + esc(o.rot) + "</div>" +
      "<div style='display:flex;align-items:baseline;gap:4px;margin-top:2px;'>" +
      "<span style='font-size:23px;font-weight:900;letter-spacing:-.02em;" + (o.cor ? "color:" + o.cor + ";" : "") + "'>" + o.valor + "</span>" +
      (o.unidade ? "<span style='font-size:11px;font-weight:700;color:#8a8695;'>" + esc(o.unidade) + "</span>" : "") +
      "</div>" +
      (o.selo ? "<div style='margin-top:5px;'>" + o.selo + "</div>" : "") +
      (o.sub ? "<div style='font-size:10.5px;color:#a9a4b5;margin-top:4px;'>" + o.sub + "</div>" : "") +
      "</div>";
  };

  /* ---------- painel de cards do laudo (estilo "Medidas" do print) ----------
   * l = retorno de MT_CORPO.calcula(). Só pinta o que existe. */
  U.cardsLaudo = function (l) {
    if (!l || !l.ok) return "";
    var cards = [];
    if (l.pontuacao) cards.push(U.card({ rot: "Pontuação", valor: l.pontuacao + "<span style='font-size:13px;color:#8a8695;'>/100</span>", cor: "#a78bfa" }));
    cards.push(U.card({ rot: "Peso", valor: vg(l.peso), unidade: "kg",
      selo: l.classePeso ? U.selo(l.classePeso === "normal" ? "Na faixa" : l.classePeso === "abaixo" ? "Abaixo da faixa" : "Acima da faixa", tomDe(l.classePeso)) : "",
      sub: l.faixaPeso ? "faixa " + vg(l.faixaPeso[0], 0) + "–" + vg(l.faixaPeso[1], 0) + " kg" : "" }));
    if (l.altura) cards.push(U.card({ rot: "Altura", valor: vg(l.altura, 0), unidade: "cm" }));
    cards.push(U.card({ rot: "IMC", valor: vg(l.imc), selo: U.selo(l.classeImc, l.imc < 18.5 ? "info" : l.imc < 25 ? "ok" : l.imc < 30 ? "atencao" : "ruim") }));
    if (l.gordura != null) cards.push(U.card({ rot: "Gordura", valor: vg(l.gordura), unidade: "%",
      selo: U.selo(l.classeGordura === "normal" ? "Na faixa" : l.classeGordura === "abaixo" ? "Abaixo da faixa" : "Acima da faixa", tomDe(l.classeGordura)),
      sub: "faixa " + l.faixaGordura[0] + "–" + l.faixaGordura[1] + "%" }));
    if (l.mme) cards.push(U.card({ rot: "Músculo", valor: vg(l.mme), unidade: "kg",
      selo: l.smi ? U.selo(l.smiBaixo ? "Índice baixo" : "Índice ok", l.smiBaixo ? "ruim" : "ok") : "",
      sub: l.smi ? "índice " + vg(l.smi) + " kg/m²" : "" }));
    cards.push(U.card({ rot: "Basal (TMB)", valor: vg(l.tmb, 0), unidade: "kcal", sub: "gasto no dia " + vg(l.ingestao, 0) + " kcal" }));
    if (l.rcq) cards.push(U.card({ rot: "Cintura-quadril", valor: vg(l.rcq, 2), selo: seloRisco(l.riscoRcq) }));
    else if (l.cintura) cards.push(U.card({ rot: "Cintura", valor: vg(l.cintura), unidade: "cm", selo: seloRisco(l.riscoCintura) }));
    if (l.agua && l.peso) {
      var hid = l.agua / l.peso * 100;
      var classeAgua = l.faixaAgua ? (l.agua < l.faixaAgua[0] ? "abaixo" : l.agua > l.faixaAgua[1] ? "acima" : "normal") : "";
      cards.push(U.card({ rot: "Hidratação", valor: vg(hid), unidade: "%",
        selo: classeAgua ? U.selo(classeAgua === "normal" ? "Na faixa" : classeAgua === "abaixo" ? "Pouca água" : "Acima da faixa", tomDe(classeAgua, "atencao")) : "",
        sub: vg(l.agua) + " L de água corporal" }));
    }
    return "<div class='av-cards' style='display:flex;gap:8px;flex-wrap:wrap;'>" + cards.join("") + "</div>";
  };

  /* ---------- donut de gordura (massa gorda × massa magra) ---------- */
  U.donut = function (pct, opts) {
    opts = opts || {};
    var v = Math.max(0, Math.min(100, +pct || 0));
    var R = 52, C = 2 * Math.PI * R;
    var px = opts.px || 150;
    return "<svg viewBox='0 0 140 140' width='" + px + "' height='" + px + "' role='img' aria-label='" + esc(opts.rotulo || "Gordura corporal") + " " + vg(v) + "%'>" +
      "<circle cx='70' cy='70' r='" + R + "' fill='none' stroke='rgba(124,58,237,.15)' stroke-width='15'/>" +
      "<circle cx='70' cy='70' r='" + R + "' fill='none' stroke='" + (opts.cor || "#7c3aed") + "' stroke-width='15' stroke-linecap='round' " +
      "stroke-dasharray='" + (C * v / 100).toFixed(1) + " " + C.toFixed(1) + "' transform='rotate(-90 70 70)'/>" +
      "<text x='70' y='68' text-anchor='middle' font-size='25' font-weight='900' fill='" + (opts.corTexto || "#fff") + "'>" + vg(v) + "%</text>" +
      "<text x='70' y='87' text-anchor='middle' font-size='9.5' font-weight='700' fill='#8a8695'>" + esc(opts.rotulo || "gordura") + "</text>" +
      "</svg>";
  };

  /* Bloco completo: donut + legenda de massa gorda/magra (estilo o print do
   * resultado). l pode ser o laudo do MT_CORPO ou {gordura, massaGordura,
   * massaMagra, peso}. */
  U.blocoGordura = function (l) {
    if (!l || l.gordura == null) return "";
    var leg = "";
    if (l.massaGordura != null && l.massaMagra != null) {
      var li = function (cor, rot, val) {
        return "<div style='display:flex;align-items:center;gap:7px;font-size:12.5px;'>" +
          "<span style='width:9px;height:9px;border-radius:3px;background:" + cor + ";flex:none;'></span>" +
          "<span style='color:#a9a4b5;'>" + rot + "</span><b style='margin-left:auto;'>" + vg(val) + " kg</b></div>";
      };
      leg = "<div style='flex:1;min-width:150px;display:flex;flex-direction:column;gap:7px;justify-content:center;'>" +
        (l.peso ? li("rgba(124,58,237,.35)", "Peso total", l.peso) : "") +
        li("#7c3aed", "Massa gorda", l.massaGordura) +
        li("#4ade80", "Massa magra", l.massaMagra) + "</div>";
    }
    return "<div class='av-gordura' style='display:flex;gap:14px;align-items:center;flex-wrap:wrap;'>" +
      "<div style='flex:none;'>" + U.donut(l.gordura, { rotulo: "gordura corporal" }) + "</div>" + leg + "</div>";
  };

  /* ---------- boneco com as medidas por segmento ----------
   * circ = {braco, antebraco, torax, cintura, quadril, coxa, panturrilha} em cm
   * confianca = {cintura: "alta" | "média" | "baixa", ...} (opcional)
   * O boneco fica no centro e cada medida vira uma etiqueta ligada por um
   * tracinho na altura certa — igualzinho a um laudo de bioimpedância.
   */
  U.corpo = function (circ, confianca, opts) {
    circ = circ || {}; confianca = confianca || {}; opts = opts || {};
    var cor = opts.cor || "#7c3aed";
    var tinta = opts.corTexto || "#fff";
    // [chave, rótulo, lado, y da etiqueta, x onde o corpo está nessa altura]
    // (o boneco fica deslocado +20 porque o palco tem 360 de largura)
    var PONTOS = [
      ["braco", "Braço", "e", 126, 125],
      ["antebraco", "Antebraço", "e", 192, 100],
      ["coxa", "Coxa", "e", 300, 160],
      ["torax", "Tórax", "d", 122, 216],
      ["cintura", "Cintura", "d", 185, 218],
      ["quadril", "Quadril", "d", 235, 217],
      ["panturrilha", "Panturrilha", "d", 372, 197],
    ];
    var tem = PONTOS.filter(function (p) { return circ[p[0]] != null && isFinite(circ[p[0]]); });
    if (!tem.length) return "";
    var etiquetas = tem.map(function (p) {
      var k = p[0], lado = p[2], y = p[3], xCorpo = p[4];
      var conf = confianca[k];
      var xTxt = lado === "e" ? 70 : 290;   // fim/começo da linha, perto da etiqueta
      var linha = "<line x1='" + xCorpo + "' y1='" + y + "' x2='" + xTxt + "' y2='" + y + "' stroke='" + cor + "' stroke-width='1' stroke-dasharray='3 3' opacity='.55'/>" +
        "<circle cx='" + xCorpo + "' cy='" + y + "' r='2.6' fill='" + cor + "'/>";
      var anc = lado === "e" ? "end" : "start";
      var xA = lado === "e" ? 66 : 294;
      return linha +
        "<text x='" + xA + "' y='" + (y - 3) + "' text-anchor='" + anc + "' font-size='10' font-weight='700' fill='#8a8695'>" + p[1] + (conf && conf !== "alta" ? " ~" : "") + "</text>" +
        "<text x='" + xA + "' y='" + (y + 12) + "' text-anchor='" + anc + "' font-size='13' font-weight='900' fill='" + tinta + "'>" + vg(circ[k]) + " cm</text>";
    }).join("");
    return "<svg class='av-corpo' viewBox='0 0 360 470' style='width:100%;max-width:370px;display:block;margin:0 auto;' role='img' aria-label='Medidas por região do corpo'>" +
      U.silhueta(180, 0, 1, cor) + etiquetas + "</svg>";
  };

  /* silhueta de frente (braços em V, pés afastados — a própria pose da foto).
   * cx centra, dy desloca, s escala; reaproveitada no tutorial.
   * O contorno é UM caminho só, fechado — desenhar cada membro separado
   * deixava emendas visíveis no preenchimento translúcido. */
  U.silhueta = function (cx, dy, s, cor) {
    cor = cor || "#7c3aed";
    return "<g transform='translate(" + (cx - 160) + "," + (dy || 0) + ") scale(" + (s || 1) + ")' " +
      "fill='rgba(124,58,237,.16)' stroke='" + cor + "' stroke-width='3' stroke-linejoin='round' stroke-linecap='round'>" +
      "<circle cx='160' cy='40' r='23'/>" +
      "<path d='M 152,68 C 152,74 150,78 146,82 C 132,86 122,90 118,96 C 104,112 92,132 82,154 C 72,176 62,196 52,216 L 74,230 " +
      "C 86,210 96,190 106,168 C 112,156 118,148 124,142 C 124,158 122,172 120,186 C 118,202 126,214 126,228 C 126,244 120,252 120,262 " +
      "C 122,296 128,326 132,354 C 134,380 134,404 132,424 L 112,438 L 152,438 L 150,424 C 152,396 154,370 154,344 C 155,322 158,300 160,282 " +
      "C 162,300 165,322 166,344 C 166,370 168,396 170,424 L 168,438 L 208,438 L 188,424 C 186,404 186,380 188,354 C 192,326 198,296 200,262 " +
      "C 200,252 194,244 194,228 C 194,214 202,202 200,186 C 198,172 196,158 196,142 C 202,148 208,156 214,168 C 224,190 234,210 246,230 " +
      "L 268,216 C 258,196 248,176 238,154 C 228,132 216,112 202,96 C 198,90 188,86 174,82 C 170,78 168,74 168,68 Z'/>" +
      "</g>";
  };

  /* silhueta de lado (virada pra esquerda, braços esticados pra frente na
   * altura do ombro — de perfil os dois braços viram um só) */
  U.silhuetaLado = function (cx, dy, s, cor) {
    cor = cor || "#7c3aed";
    return "<g transform='translate(" + (cx - 160) + "," + (dy || 0) + ") scale(" + (s || 1) + ")' " +
      "fill='rgba(124,58,237,.16)' stroke='" + cor + "' stroke-width='3' stroke-linejoin='round' stroke-linecap='round'>" +
      "<circle cx='152' cy='42' r='22'/>" +
      "<path d='M 148,64 C 150,70 150,74 148,80 C 142,88 138,94 137,100 L 62,102 C 58,102 56,106 56,112 C 56,118 58,122 62,122 L 136,126 " +
      "C 135,140 136,152 137,162 C 135,180 132,198 130,214 C 129,230 133,244 136,256 C 138,288 141,318 145,348 C 147,378 147,402 145,424 " +
      "L 120,438 L 168,438 L 167,424 C 169,398 170,374 170,350 C 172,320 175,290 176,258 C 180,244 184,230 183,214 C 182,196 180,178 179,162 " +
      "C 179,148 180,134 180,120 C 180,104 176,90 168,80 C 165,74 164,70 165,64 Z'/>" +
      "</g>";
  };

  /* ---------- tutorial das poses (carrossel) ----------
   * Cada passo tem título, texto e um desenho. A navegação (Avançar/Pular)
   * é de quem usa — aqui só sai o HTML de um passo + as bolinhas. */
  function slideSvg(miolo) {
    return "<svg viewBox='0 0 320 300' style='width:100%;max-width:230px;display:block;margin:0 auto;'>" + miolo + "</svg>";
  }
  U.TUTORIAL = [
    { t: "Roupa colada no corpo", x: "Camiseta larga vira gordura no resultado. Top/regata e shorts justos são o ideal — e sempre a mesma roupa nas próximas, pra comparar certo.", e: "👕" },
    { t: "Fundo limpo, luz boa", x: "De frente pra uma parede lisa, sem porta nem cortina atrás, com luz acesa. O sistema precisa separar a pessoa do fundo.", e: "🧱" },
    { t: "Celular apoiado na altura do umbigo", x: "Apoie o celular (não segure na mão) e deixe a pessoa a uns 3 passos largos, descalça, aparecendo da cabeça aos pés.", e: "📱" },
    { t: "1ª foto — de frente", x: "Braços afastados formando um V, palmas pra frente, pés na largura do quadril. Olhe reto e distribua o peso nos dois pés.",
      svg: slideSvg(U.silhueta(221, 4, 0.62)) },
    { t: "2ª foto — de lado", x: "Vire o corpo todo pro seu lado esquerdo e estique os dois braços pra frente, na altura do ombro. O quadril não pode apontar pra câmera.",
      svg: slideSvg(U.silhuetaLado(239, 4, 0.62)) },
    { t: "O disparo é automático", x: "Quando o enquadramento estiver certo, aparece a contagem de 5 segundos — é só ficar parado. Se precisar, o botão “Tirar agora” dispara na hora.", e: "⏱️" },
  ];
  U.tutorialPasso = function (i) {
    var n = U.TUTORIAL.length;
    i = Math.max(0, Math.min(n - 1, i | 0));
    var p = U.TUTORIAL[i];
    var bolinhas = [];
    for (var k = 0; k < n; k++) {
      bolinhas.push("<span style='width:" + (k === i ? 18 : 7) + "px;height:7px;border-radius:99px;background:" +
        (k === i ? "#7c3aed" : "rgba(124,58,237,.28)") + ";transition:width .2s;'></span>");
    }
    return "<div class='av-tuto-passo' data-tuto-i='" + i + "'>" +
      "<div style='min-height:150px;display:flex;align-items:center;justify-content:center;padding:6px 0 2px;'>" +
      (p.svg ? p.svg : "<div style='font-size:64px;line-height:1;'>" + p.e + "</div>") + "</div>" +
      "<div style='text-align:center;font-weight:800;font-size:15.5px;margin-top:6px;'>" + esc(p.t) + "</div>" +
      "<div class='muted' style='text-align:center;font-size:12.5px;line-height:1.6;margin:6px auto 10px;max-width:430px;'>" + esc(p.x) + "</div>" +
      "<div style='display:flex;gap:5px;justify-content:center;align-items:center;'>" + bolinhas.join("") + "</div>" +
      "</div>";
  };

  raiz.MT_AVAL_UI = U;
})(typeof self !== "undefined" ? self : this);
