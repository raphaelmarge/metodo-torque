/* TORQUE ON — carregador do leitor de imagem (MediaPipe Tasks Vision).
 *
 * Este é o ÚNICO arquivo que encosta na biblioteca de visão. Ele baixa o motor
 * sob demanda (só quando alguém abre as Medidas pela câmera), avisa o progresso
 * e devolve os 33 pontos do corpo + a silhueta recortada.
 *
 * A imagem NÃO sai do aparelho: não existe nenhuma chamada de rede aqui além do
 * download do próprio motor, que vem do nosso domínio.
 */
(function (raiz) {
  var V = {};
  var BASE = "assets/vendor/mediapipe/";
  var pose = null, carregando = null;

  V.suportado = function () {
    return typeof WebAssembly === "object" && typeof document !== "undefined" &&
      !!document.createElement("canvas").getContext("2d");
  };
  V.pronto = function () { return !!pose; };

  function url(base, p) {
    var r = (base == null ? "" : String(base)).replace(/\/+$/, "");
    return (r ? r + "/" : "") + p;
  }

  // injeta o bundle IIFE (vira o global Vision) — sem ESM, o projeto não tem build
  function carregaBundle(base) {
    if (raiz.Vision) return Promise.resolve(raiz.Vision);
    return new Promise(function (ok, erro) {
      var s = document.createElement("script");
      s.src = url(base, BASE + "vision_bundle.js");
      s.onload = function () { raiz.Vision ? ok(raiz.Vision) : erro(new Error("bundle carregou sem expor o Vision")); };
      s.onerror = function () { erro(new Error("não consegui baixar o leitor de imagem")); };
      document.head.appendChild(s);
    });
  }

  /* carrega(base, aviso) — aviso(texto) é chamado a cada etapa, pra tela contar
   * o que está acontecendo em vez de ficar parada. */
  V.carrega = function (base, aviso) {
    if (pose) return Promise.resolve(pose);
    if (carregando) return carregando;
    var diz = function (t) { if (aviso) try { aviso(t); } catch (e) {} };
    diz("Baixando o leitor de imagem (uma vez só)…");
    carregando = carregaBundle(base).then(function (mp) {
      diz("Preparando o motor…");
      return mp.FilesetResolver.forVisionTasks(url(base, BASE + "wasm")).then(function (fs) {
        diz("Carregando o modelo do corpo…");
        // CPU de propósito: testado, funciona com a máscara e roda em aparelho
        // sem WebGL2 — a GPU aqui não compensa o risco de ficar sem o recurso.
        return mp.PoseLandmarker.createFromOptions(fs, {
          baseOptions: { modelAssetPath: url(base, BASE + "models/pose_landmarker_lite.task"), delegate: "CPU" },
          runningMode: "IMAGE", numPoses: 1, outputSegmentationMasks: true,
        });
      });
    }).then(function (p) {
      pose = p; diz(""); return pose;
    }).catch(function (e) {
      carregando = null;
      throw e;
    });
    return carregando;
  };

  /* A foto de um celular moderno vem com uns 3000 px de largura, e mandar isso
   * inteiro pro modelo é desperdício: medido num aparelho intermediário, a foto
   * inteira leva 1063 ms e a mesma foto reduzida pra 1080 px leva 436 ms — 2,4
   * vezes mais rápido — com diferença de 0,4% na medida. Abaixo de 1080 o tempo
   * não cai mais (o gargalo passa a ser a inferência) e o erro cresce: em 540 px
   * já dá 3,3%. Então 1080 é o ponto certo. */
  V.LARGURA_ANALISE = 1080;
  /* No loop ao vivo a conta é outra: ali não precisa de medida, só de saber se a
   * pessoa está bem enquadrada. Num celular popular a análise na resolução de
   * medir roda a 2 quadros por segundo, o que deixa o semáforo lerdo demais pra
   * guiar alguém — então o loop usa uma resolução menor e ganha fluidez. */
  V.LARGURA_GUIA = 480;
  function paraAnalise(fonte, larguraAlvo) {
    var limite = larguraAlvo || V.LARGURA_ANALISE;
    var w = fonte.naturalWidth || fonte.videoWidth || fonte.width;
    var h = fonte.naturalHeight || fonte.videoHeight || fonte.height;
    if (!w || !h || w <= limite) return { fonte: fonte, largura: w, altura: h };
    var e = limite / w;
    var cv = document.createElement("canvas");
    cv.width = Math.round(w * e);
    cv.height = Math.round(h * e);
    var g = cv.getContext("2d");
    g.imageSmoothingQuality = "high";
    g.drawImage(fonte, 0, 0, cv.width, cv.height);
    return { fonte: cv, largura: cv.width, altura: cv.height };
  }

  /* le(fonte, opcoes) — devolve {landmarks, mascara, largura, altura}.
   * mascara é Uint8Array de 0/1 no tamanho analisado.
   * opcoes.video = true usa o modo de vídeo (loop ao vivo), que também devolve
   * a silhueta; opcoes.instante é o timestamp em ms exigido nesse modo. */
  /* O modo de vídeo exige carimbo de tempo ESTRITAMENTE crescente. Num celular
   * rápido dois quadros caem no mesmo milissegundo, e aí o motor não só recusa
   * o quadro: ele derruba o grafo de vez ("Packet timestamp mismatch"), e todo
   * o resto da sessão passa a falhar — inclusive as fotos soltas. Por isso o
   * carimbo é forçado a andar pelo menos 1 ms a cada leitura. */
  var ultimoInstante = 0;

  V.le = function (fonte, opcoes) {
    if (!pose) throw new Error("o leitor de imagem não está carregado; abra o recurso de novo");
    opcoes = opcoes || {};
    var red = paraAnalise(fonte, opcoes.largura || (opcoes.video ? V.LARGURA_GUIA : V.LARGURA_ANALISE));
    var largura = red.largura, altura = red.altura;
    var res;
    try {
      if (opcoes.video) {
        V.modo("VIDEO");
        var t = opcoes.instante == null ? performance.now() : opcoes.instante;
        if (t <= ultimoInstante) t = ultimoInstante + 1;
        ultimoInstante = t;
        res = pose.detectForVideo(red.fonte, t);
      } else {
        V.modo("IMAGE");
        res = pose.detect(red.fonte);
      }
    } catch (e) {
      // grafo quebrado não se conserta sozinho: joga fora pra próxima tentativa
      // nascer limpa, senão o erro contamina todas as leituras seguintes
      V.descarrega();
      throw e;
    }
    var lm = (res.landmarks || [])[0] || null;
    var mk = (res.segmentationMasks || [])[0] || null;
    var mascara = null;
    if (mk) {
      var d = mk.getAsFloat32Array(), fw = mk.width, fh = mk.height;
      mascara = new Uint8Array(largura * altura);
      for (var y = 0; y < altura; y++) {
        var sy = Math.min(fh - 1, (y * fh / altura) | 0);
        for (var x = 0; x < largura; x++) {
          mascara[y * largura + x] = d[sy * fw + Math.min(fw - 1, (x * fw / largura) | 0)] > 0.5 ? 1 : 0;
        }
      }
      try { mk.close(); } catch (e) {}
    }
    return { landmarks: lm, mascara: mascara, largura: largura, altura: altura };
  };

  /* O mesmo modelo atende os dois modos, mas ele precisa ser avisado quando a
   * gente troca: um landmarker em modo IMAGE não aceita detectForVideo. Trocar
   * é barato (só reconfigura), então dá pra alternar entre o loop ao vivo e a
   * leitura dos quadros da rajada sem carregar nada de novo. */
  var modoAtual = "IMAGE";
  V.modo = function (m) {
    if (!pose || m === modoAtual) return;
    pose.setOptions({ runningMode: m });
    modoAtual = m;
  };

  V.descarrega = function () {
    if (pose) { try { pose.close(); } catch (e) {} }
    pose = null; carregando = null; modoAtual = "IMAGE"; ultimoInstante = 0;
  };

  /* Mensagem de erro do motor vem em inglês técnico ("CalculatorGraph::Run()
   * failed…"), que não ajuda ninguém e ainda assusta. Guarda o detalhe no
   * console e devolve o que o professor pode fazer agora. */
  V.erroAmigavel = function (e) {
    var m = (e && e.message) || String(e || "");
    var tecnico = /[A-Z]{4,}_[A-Z]|::|CalculatorGraph|timestamp|Packet|wasm|WebAssembly|RuntimeError|Aborted|undefined is not|null is not/.test(m) || m.length > 160;
    if (!tecnico) return m;
    try { console.error("[medidas pela câmera]", m); } catch (x) {}
    return "O leitor de imagem travou. Feche e comece de novo — se insistir, use a fita métrica do card acima.";
  };

  raiz.MT_VISAO = V;
})(typeof self !== "undefined" ? self : this);
