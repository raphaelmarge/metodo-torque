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

  /* le(fonte) — devolve {landmarks, mascara, largura, altura}.
   * mascara é Uint8Array de 0/1 no tamanho da imagem. */
  V.le = function (fonte) {
    if (!pose) throw new Error("chame carrega() antes");
    var largura = fonte.naturalWidth || fonte.width;
    var altura = fonte.naturalHeight || fonte.height;
    var res = pose.detect(fonte);
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

  V.descarrega = function () {
    if (pose) { try { pose.close(); } catch (e) {} }
    pose = null; carregando = null;
  };

  raiz.MT_VISAO = V;
})(typeof self !== "undefined" ? self : this);
