/* TORQUE ON — medidas corporais a partir de duas fotos.
 *
 * Recebe o que o leitor de imagem devolveu (33 pontos do corpo + silhueta) das
 * fotos de FRENTE e de LADO, e transforma em circunferências em centímetros.
 *
 * Como a conta é feita:
 *   1. RÉGUA — a altura informada vira escala. Em vez de confiar num único
 *      trecho, calcula a escala por vários caminhos (ombro→tornozelo,
 *      quadril→tornozelo, topo→pés) e usa a mediana. Se os caminhos discordarem
 *      muito, a foto é recusada: discordância = corpo girado ou celular torto.
 *   2. LARGURA — para cada altura do corpo, mede o trecho CONTÍNUO de silhueta
 *      que contém o eixo do tronco. Varrendo assim, o vão entre o braço e o
 *      corpo interrompe a medida sozinho, e o braço não vira cintura. É por isso
 *      que a captura pede braços afastados.
 *   3. CIRCUNFERÊNCIA — largura (foto de frente) e profundidade (foto de lado)
 *      formam uma elipse; o perímetro sai pela fórmula de Ramanujan, que é
 *      exata para o que a gente precisa. Como o corpo é um pouco mais "cheio"
 *      que uma elipse perfeita, cada região leva um fator de correção medido.
 *
 * O número principal NÃO é a cintura em cm: é a RAZÃO CINTURA/ALTURA, que sai
 * da divisão de dois valores em pixels — ou seja, não depende da régua nem de a
 * pessoa ter digitado a altura certa. Por isso é a medida mais confiável daqui.
 *
 * Tudo aqui é ESTIMATIVA POR FOTO: serve pra acompanhar a evolução da pessoa
 * com ela mesma, não pra substituir fita, adipômetro ou bioimpedância.
 */
(function (raiz) {
  var A = {};

  var P = {
    nariz: 0, olhoE: 2, olhoD: 5, orelhaE: 7, orelhaD: 8,
    ombroE: 11, ombroD: 12, cotoveloE: 13, cotoveloD: 14, punhoE: 15, punhoD: 16,
    quadrilE: 23, quadrilD: 24, joelhoE: 25, joelhoD: 26,
    tornozeloE: 27, tornozeloD: 28, calcanharE: 29, calcanharD: 30,
  };
  A.PONTOS = P;

  function r1(v) { return Math.round(v * 10) / 10; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function med(a, b) { return (a + b) / 2; }
  function mediana(a) {
    var v = a.slice().sort(function (x, y) { return x - y; });
    if (!v.length) return 0;
    var m = v.length >> 1;
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  }

  /* ---------- perímetro de elipse (Ramanujan) ----------
   * Confere: com largura = profundidade dá 2·pi·r exato. */
  A.perimetroElipse = function (larguraCm, profundidadeCm) {
    var a = larguraCm / 2, b = profundidadeCm / 2;
    if (!(a > 0) || !(b > 0)) return 0;
    return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
  };

  /* Corpo não é elipse perfeita — é um pouco mais cheio nos cantos, e esse
   * empeno é o que estes fatores corrigem.
   * Os valores não são chute: saem da comparação da elipse com o contorno real
   * de 31 corpos diferentes num simulador com câmera de verdade. A primeira
   * versão usava 1,026 e 1,033, escolhidos no olho, e isso sozinho inflava o
   * quadril em 3,4 cm em todo mundo. Com os valores medidos, o viés do quadril
   * cai pra menos de meio centímetro. */
  A.FATOR = { cintura: 1.013, quadril: 1.002, torax: 1.010, coxa: 1.010, panturrilha: 1.008, braco: 1.008 };

  /* Proporções médias usadas quando falta a foto de lado (profundidade
   * estimada como fração da largura). Menos preciso — a tela avisa. */
  A.PROF_PADRAO = { cintura: 0.72, quadril: 0.78, torax: 0.72 };

  /* ---------- silhueta ----------
   * Para cada linha: onde o corpo começa/termina no total, e o trecho CONTÍNUO
   * que contém o eixo do tronco (é este que serve pra medir). */
  A.perfil = function (mascara, largura, altura, eixoX) {
    var linhas = new Array(altura);
    var alvo = Math.max(0, Math.min(largura - 1, Math.round(eixoX)));
    for (var y = 0; y < altura; y++) {
      var base = y * largura, esq = -1, dir = -1;
      for (var x = 0; x < largura; x++) if (mascara[base + x]) { if (esq < 0) esq = x; dir = x; }
      var c = -1;
      if (esq >= 0) {
        if (mascara[base + alvo]) c = alvo;
        else for (var d = 1; d < largura && c < 0; d++) {
          if (alvo - d >= 0 && mascara[base + alvo - d]) c = alvo - d;
          else if (alvo + d < largura && mascara[base + alvo + d]) c = alvo + d;
        }
      }
      var tE = -1, tD = -1;
      if (c >= 0) {
        tE = c; while (tE > 0 && mascara[base + tE - 1]) tE--;
        tD = c; while (tD < largura - 1 && mascara[base + tD + 1]) tD++;
      }
      linhas[y] = { esq: esq, dir: dir, larg: esq < 0 ? 0 : dir - esq + 1,
        tEsq: tE, tDir: tD, tronco: tE < 0 ? 0 : tD - tE + 1 };
    }
    return linhas;
  };

  A.limites = function (linhas) {
    var topo = 0, base = linhas.length - 1;
    while (topo < linhas.length && !linhas[topo].larg) topo++;
    while (base > topo && !linhas[base].larg) base--;
    return { topo: topo, base: base, alturaPx: base - topo };
  };

  // suaviza a largura (mediana móvel) pra um pixel solto não virar "a cintura"
  A.suave = function (linhas, y, janela) {
    var j = janela || 5, v = [];
    for (var k = y - (j >> 1); k <= y + (j >> 1); k++) {
      if (k >= 0 && k < linhas.length && linhas[k].tronco > 0) v.push(linhas[k].tronco);
    }
    return v.length ? mediana(v) : (linhas[y] ? linhas[y].tronco : 0);
  };

  /* Cintura é a linha mais estreita da janela; quadril, a mais larga.
   * Testamos trocar o extremo puro por percentil (15/85, 8/92) e por mediana das
   * linhas mais extremas, achando que o ruído do contorno estaria enviesando a
   * medida. Num simulador 3D com câmera de verdade e 31 corpos diferentes, as
   * três deram o MESMO erro (RMSE 2,45 a 2,49 cm na cintura). O erro que
   * importa é de variância, não de viés — então fica o jeito simples. */
  A.maisEstreito = function (linhas, y1, y2) {
    var achado = -1, valor = Infinity;
    for (var y = Math.max(0, y1); y <= Math.min(linhas.length - 1, y2); y++) {
      var t = A.suave(linhas, y);
      if (t > 0 && t < valor) { valor = t; achado = y; }
    }
    return achado < 0 ? null : { y: achado, px: valor, naBorda: achado <= y1 + 1 || achado >= y2 - 1 };
  };
  A.maisLargo = function (linhas, y1, y2) {
    var achado = -1, valor = 0;
    for (var y = Math.max(0, y1); y <= Math.min(linhas.length - 1, y2); y++) {
      var t = A.suave(linhas, y);
      if (t > valor) { valor = t; achado = y; }
    }
    return achado < 0 ? null : { y: achado, px: valor, naBorda: achado <= y1 + 1 || achado >= y2 - 1 };
  };

  /* ---------- régua ----------
   * Vários caminhos independentes até a altura total; a mediana vira a escala e
   * a discordância entre eles vira o teste de "a foto presta?".
   * As frações são proporções médias do corpo humano adulto. */
  A.FRACAO = { ombroTornozelo: 0.779, quadrilTornozelo: 0.491, ombroJoelho: 0.533 };
  A.escala = function (lm, linhas, altura, alturaCm) {
    var lim = A.limites(linhas);
    var yPx = function (i) { return lm[i].y * altura; };
    var cand = [];
    var yOmbro = med(yPx(P.ombroE), yPx(P.ombroD));
    var yQuadril = med(yPx(P.quadrilE), yPx(P.quadrilD));
    var yJoelho = med(yPx(P.joelhoE), yPx(P.joelhoD));
    var yTornozelo = med(yPx(P.tornozeloE), yPx(P.tornozeloD));
    if (yTornozelo > yOmbro) cand.push((yTornozelo - yOmbro) / A.FRACAO.ombroTornozelo);
    if (yTornozelo > yQuadril) cand.push((yTornozelo - yQuadril) / A.FRACAO.quadrilTornozelo);
    if (yJoelho > yOmbro) cand.push((yJoelho - yOmbro) / A.FRACAO.ombroJoelho);
    // silhueta inteira, descontando o cabelo: o alto da cabeça fica ~6,4% da
    // altura acima dos olhos — cabelo armado passa disso e seria contado a mais
    var yOlhos = med(yPx(P.olhoE), yPx(P.olhoD));
    var previsto = yOlhos - 0.064 * lim.alturaPx;
    var topoUtil = Math.max(lim.topo, previsto);
    if (lim.base > topoUtil) cand.push(lim.base - topoUtil);
    if (!cand.length) return { ok: false, motivo: "não consegui achar o corpo inteiro" };
    var m = mediana(cand);
    var disp = cand.reduce(function (t, v) { return Math.max(t, Math.abs(v - m) / m); }, 0);
    return { ok: disp <= 0.06, alturaPx: m, cmPorPx: alturaCm / m, dispersao: r2(disp * 100),
      candidatos: cand.map(function (v) { return Math.round(v); }),
      motivo: disp > 0.06 ? "a pessoa parece girada ou o celular está inclinado" : "" };
  };

  /* ---------- qualidade da foto ----------
   * Devolve UM problema por vez, do mais grave pro menos: quem lê cinco
   * correções de uma vez não corrige nenhuma. */
  A.LIMITES_QA = { visibilidade: 0.6, ocupacaoMin: 0.60, ocupacaoMax: 0.94, margem: 0.02,
    desnivel: 0.055, ombrosDeFrente: 0.10, ombrosDeLado: 0.13, quadrilDeLado: 0.085, bracoMin: 0.02 };
  A.avaliaFoto = function (leitura, modo) {
    var lm = leitura.landmarks;
    if (!lm || !lm.length) return { ok: false, cod: "ninguem", fala: "Não achei ninguém na foto. A pessoa precisa aparecer inteira." };
    if (!leitura.mascara) return { ok: false, cod: "sem-silhueta", fala: "Não consegui separar a pessoa do fundo. Procure uma parede lisa." };
    var Q = A.LIMITES_QA, alt = leitura.altura;
    var vis = function (i) { var p = lm[i]; return p && p.visibility != null ? p.visibility : 1; };
    var eixo = med(lm[P.quadrilE].x, lm[P.quadrilD].x) * leitura.largura;
    var linhas = A.perfil(leitura.mascara, leitura.largura, alt, eixo);
    var lim = A.limites(linhas);
    var faltando = [P.ombroE, P.ombroD, P.quadrilE, P.quadrilD, P.tornozeloE, P.tornozeloD]
      .filter(function (i) { return vis(i) < Q.visibilidade; }).length;
    if (faltando > (modo === "lado" ? 3 : 1)) return { ok: false, cod: "cortado", fala: "O corpo inteiro precisa aparecer, da cabeça aos pés." };
    if (lim.topo <= alt * Q.margem) return { ok: false, cod: "cabeca", fala: "A cabeça ficou cortada. Afaste mais o celular." };
    if (lim.base >= alt * (1 - Q.margem)) return { ok: false, cod: "pes", fala: "Os pés ficaram cortados. Afaste mais o celular." };
    var ocupa = lim.alturaPx / alt;
    if (ocupa < Q.ocupacaoMin) return { ok: false, cod: "longe", fala: "Você está longe demais. Chegue mais perto do celular." };
    if (ocupa > Q.ocupacaoMax) return { ok: false, cod: "perto", fala: "Está perto demais. Dê dois passos pra trás." };
    var largOmbros = Math.abs(lm[P.ombroE].x - lm[P.ombroD].x);
    if (modo === "lado") {
      /* Aqui a trava é apertada de propósito: é da foto de LADO que sai a
       * profundidade do corpo, e ela é a medida mais sensível de todas. Medido
       * nos bonecos: com o corpo 10° fora do perfil a cintura já erra +4 cm, e
       * com 20° erra +13 cm — enquanto a largura da foto de frente mal se mexe.
       * Ou seja, quase todo o estrago do "corpo girado" entra por esta foto. */
      if (largOmbros > Q.ombrosDeLado) return { ok: false, cod: "nao-virou", fala: "Nesta foto é de lado: vire o corpo todo e olhe pra frente." };
      var quadrilAberto = Math.abs(lm[P.quadrilE].x - lm[P.quadrilD].x);
      if (quadrilAberto > Q.quadrilDeLado) return { ok: false, cod: "meio-virou", fala: "Vire mais: o quadril ainda está apontando pra câmera." };
    } else {
      if (largOmbros < Q.ombrosDeFrente) return { ok: false, cod: "de-lado", fala: "Nesta foto é de frente: vire o corpo pra câmera." };
      if (Math.abs(lm[P.ombroE].y - lm[P.ombroD].y) > Q.desnivel ||
          Math.abs(lm[P.quadrilE].y - lm[P.quadrilD].y) > Q.desnivel) {
        return { ok: false, cod: "torto", fala: "Fique reto, de frente, com o peso nos dois pés." };
      }
      // braços precisam estar afastados, senão o braço entra na conta da cintura
      var yCint = Math.round(med(lm[P.ombroE].y, lm[P.quadrilE].y) * alt);
      var l = linhas[yCint];
      if (l && l.larg > 0 && l.tronco > 0 && (l.larg - l.tronco) / leitura.largura < Q.bracoMin) {
        return { ok: false, cod: "bracos", fala: "Afaste os braços do corpo, formando um V." };
      }
    }
    return { ok: true, cod: "ok", fala: "", linhas: linhas, lim: lim };
  };

  /* ---------- análise de uma foto ---------- */
  A.analisaFoto = function (leitura, modo, alturaCm) {
    var q = A.avaliaFoto(leitura, modo);
    if (!q.ok) return { ok: false, cod: q.cod, fala: q.fala };
    var esc = A.escala(leitura.landmarks, q.linhas, leitura.altura, alturaCm);
    if (!esc.ok) return { ok: false, cod: "geometria", fala: "Repita a foto: " + esc.motivo + "." };
    return { ok: true, lm: leitura.landmarks, linhas: q.linhas, lim: q.lim,
      largura: leitura.largura, altura: leitura.altura, escala: esc };
  };

  /* ---------- % de gordura: RFM (Relative Fat Mass) ----------
   * Escolhido de propósito no lugar da fórmula da Marinha: a Marinha depende do
   * PESCOÇO, que é a pior medida possível numa foto (some no queixo, no cabelo e
   * no ombro). O RFM usa só altura e cintura — e, como é uma razão, não muda se
   * a pessoa digitar a altura errada. */
  A.rfm = function (sexo, alturaCm, cinturaCm) {
    if (!(alturaCm > 0) || !(cinturaCm > 0)) return null;
    return r1(64 - 20 * (alturaCm / cinturaCm) + (sexo === "F" ? 12 : 0));
  };

  /* ---------- calibração pela fita ----------
   * O erro de cada pessoa é quase sempre o mesmo desvio, então UMA medida de
   * fita já ancora as próximas. pares = [{fita, foto}]. */
  A.calibra = function (pares) {
    var v = (pares || []).filter(function (p) { return p && p.fita > 0 && p.foto > 0; });
    if (!v.length) return { desvio: 0, n: 0 };
    var soma = v.reduce(function (t, p) { return t + (p.fita - p.foto); }, 0);
    return { desvio: r1(soma / v.length), n: v.length };
  };

  /* ---------- medidas ----------
   * frente e lado vêm de analisaFoto(). dados = {alturaCm, sexo, idade, peso,
   * calibracao:{desvio}}. */
  A.medidas = function (frente, lado, dados) {
    dados = dados || {};
    var alturaCm = +dados.alturaCm;
    if (!(alturaCm > 80 && alturaCm < 250)) return { ok: false, erro: "Informe a altura em centímetros (entre 80 e 250)." };
    if (!frente || !frente.ok) return { ok: false, erro: "A foto de frente não deu certo." };

    var lmF = frente.lm, linF = frente.linhas, hF = frente.altura;
    // a régua sai da altura passada AGORA, não da que foi usada na análise da
    // foto — assim corrigir a altura no formulário corrige as medidas na hora
    var escF = alturaCm / frente.escala.alturaPx;
    var yPx = function (i) { return Math.round(lmF[i].y * hF); };
    var yOmbro = Math.round(med(yPx(P.ombroE), yPx(P.ombroD)));
    var yQuadrilLm = Math.round(med(yPx(P.quadrilE), yPx(P.quadrilD)));
    var yJoelho = Math.round(med(yPx(P.joelhoE), yPx(P.joelhoD)));
    var yTornozelo = Math.round(med(yPx(P.tornozeloE), yPx(P.tornozeloD)));
    var T = yQuadrilLm - yOmbro;                   // vão do tronco: tudo é fração dele
    if (T <= 10) return { ok: false, erro: "Não consegui separar o tronco na foto." };

    // cintura entre o fim das costelas e a bacia; quadril na parte mais cheia
    var cint = A.maisEstreito(linF, yOmbro + Math.round(T * 0.35), yOmbro + Math.round(T * 0.80));
    var quad = A.maisLargo(linF, yQuadrilLm - Math.round(T * 0.12), yQuadrilLm + Math.round(T * 0.22));
    var tor = A.maisLargo(linF, yOmbro + Math.round(T * 0.15), yOmbro + Math.round(T * 0.35));
    var yCoxa = yQuadrilLm + Math.round((yJoelho - yQuadrilLm) * 0.30);
    var yPant = yJoelho + Math.round((yTornozelo - yJoelho) * 0.30);

    // profundidade: mesma FRAÇÃO do tronco na foto de lado (a pessoa se mexe
    // entre um clique e outro, então casar por pixel daria errado)
    var profEm = function (yF) {
      if (!lado || !lado.ok) return null;
      var f = (yF - frente.lim.topo) / frente.lim.alturaPx;
      var yl = lado.lim.topo + Math.round(f * lado.lim.alturaPx);
      if (yl < 0 || yl >= lado.linhas.length) return null;
      var t = A.suave(lado.linhas, yl) || lado.linhas[yl].larg;
      return t > 0 ? t * (alturaCm / lado.escala.alturaPx) : null;
    };

    var circ = {}, confianca = {}, avisos = [];
    function poe(nome, ponto, padrao, conf) {
      if (!ponto || !ponto.px) return;
      var largCm = ponto.px * escF;
      var profCm = profEm(ponto.y);
      var usouPadrao = false;
      if (!profCm && padrao) { profCm = largCm * padrao; usouPadrao = true; }
      if (!profCm) return;
      circ[nome] = r1(A.perimetroElipse(largCm, profCm) * (A.FATOR[nome] || 1));
      confianca[nome] = usouPadrao ? "baixa" : (ponto.naBorda ? "média" : (conf || "alta"));
    }
    poe("cintura", cint, A.PROF_PADRAO.cintura);
    poe("quadril", quad, A.PROF_PADRAO.quadril);
    poe("torax", tor, A.PROF_PADRAO.torax, "baixa");

    // coxa e panturrilha: metade da largura do corpo (é uma perna só)
    [["coxa", yCoxa, 0.90], ["panturrilha", yPant, 0.95]].forEach(function (t) {
      var l = linF[t[1]];
      if (!l || l.larg <= 0) return;
      var largCm = (l.larg * escF) / 2;
      circ[t[0]] = r1(A.perimetroElipse(largCm, largCm * t[2]) * (A.FATOR[t[0]] || 1));
      confianca[t[0]] = "média";
    });
    // braço: o que sobra da largura total depois de tirar o tronco, dos dois lados
    var yBraco = Math.round(med(lmF[P.ombroE].y, lmF[P.cotoveloE].y) * hF);
    var lb = linF[yBraco];
    if (lb && lb.larg > 0 && lb.tronco > 0) {
      var sobra = (lb.larg - lb.tronco) * escF / 2;
      if (sobra > 4) {
        circ.braco = r1(A.perimetroElipse(sobra, sobra * 0.92) * A.FATOR.braco);
        confianca.braco = "baixa";
      }
    }

    // calibração pela fita: uma medida real ancora todas as próximas
    var cal = dados.calibracao || {};
    if (cal.desvio) {
      Object.keys(circ).forEach(function (k) { circ[k] = r1(circ[k] + cal.desvio); });
    }

    /* RAZÃO CINTURA/ALTURA — o número que a tela destaca.
     * É a CIRCUNFERÊNCIA da cintura dividida pela estatura, que é como a
     * literatura define (corte de risco em 0,50). Cuidado que já custou caro:
     * usar a LARGURA em vez da circunferência dá ~0,17 e faria todo mundo
     * parecer saudável.
     * Continua sem depender da altura digitada, porque a circunferência é
     * proporcional à escala e a escala é a própria altura — os dois se cancelam
     * na divisão. Só a calibração por fita, que é um acréscimo em centímetros,
     * quebra essa invariância de propósito.
     * Três casas, não duas: com valor perto de 0,5 cada centésimo vale ~1 cm de
     * cintura, e arredondar cedo demais multiplicava o erro por 2,4. */
    var rcest = circ.cintura ? Math.round(circ.cintura / alturaCm * 1000) / 1000 : null;
    var rcq = (circ.cintura && circ.quadril) ? r2(circ.cintura / circ.quadril) : null;
    var gord = circ.cintura ? A.rfm(dados.sexo, alturaCm, circ.cintura) : null;

    /* Roupa larga é, de longe, o maior estrago: no simulador, uma camiseta que
     * sobra 2 cm de cada lado joga a cintura 14 cm pra cima — mais do que
     * qualquer erro de cálculo. Dá pra desconfiar dela porque os PONTOS do corpo
     * que a IA marca seguem o esqueleto, enquanto a silhueta segue o tecido:
     * quando o tronco fica muito mais largo do que os ombros permitiriam, é pano.
     * O corte de 1,20 foi escolhido pra NÃO acusar ninguém à toa — com roupa
     * justa, nenhum dos 31 corpos passou de 1,13. */
    var ombroPx = Math.abs(lmF[P.ombroE].x - lmF[P.ombroD].x) * frente.largura;
    var troncoMeio = A.suave(linF, yOmbro + Math.round(T * 0.55));
    if (ombroPx > 0 && troncoMeio > 0) {
      var proporcao = troncoMeio / ombroPx;
      if (proporcao > 1.20) {
        avisos.push("A roupa parece estar sobrando e engordando o contorno — refaça com roupa mais colada.");
        Object.keys(confianca).forEach(function (k) { confianca[k] = "baixa"; });
      }
    }
    if (!lado || !lado.ok) avisos.push("Sem a foto de lado a profundidade é estimada — tire as duas pra ficar mais preciso.");
    if (cint && cint.naBorda) avisos.push("A cintura ficou no limite da área analisada; confira com a fita.");
    if (!cal.desvio) avisos.push("Meça a cintura com fita uma vez e registre: a partir daí a câmera acerta a régua deste aluno.");

    return {
      ok: !!(circ.cintura || circ.quadril),
      circ: circ, confianca: confianca,
      rcest: rcest, rcq: rcq,
      gordura: gord == null ? null : { valor: gord, faixa: [Math.max(3, r1(gord - 5)), r1(gord + 5)], metodo: "RFM" },
      margemCm: cal.desvio ? 1.5 : 3,
      calibrado: !!cal.desvio,
      avisos: avisos,
      escala: { cmPorPx: r2(escF), dispersao: frente.escala.dispersao },
      fonte: "foto",
    };
  };

  /* ---------- pacote pro laudo de composicao-corporal.js ---------- */
  A.paraLaudo = function (r, dados) {
    if (!r || !r.ok) return null;
    var circ = {};
    ["cintura", "quadril", "torax", "coxa", "panturrilha", "braco"].forEach(function (k) {
      if (r.circ[k]) circ[k] = r.circ[k];
    });
    return {
      sexo: dados.sexo || "M", idade: dados.idade || null, altura: dados.alturaCm,
      peso: dados.peso || null, circ: circ,
      scan: { gordura: r.gordura ? r.gordura.valor : null, rcest: r.rcest },
    };
  };

  A.TEXTO_LIMITE = "Medida estimada por foto: serve pra acompanhar a evolução entre as avaliações, " +
    "não substitui fita métrica, adipômetro nem bioimpedância.";

  raiz.MT_SCANNER = A;
})(typeof self !== "undefined" ? self : this);
