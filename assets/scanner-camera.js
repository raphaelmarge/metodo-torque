/* TORQUE ON — captura ao vivo guiada das Medidas pela câmera.
 *
 * Abre a câmera em tela cheia, desenha um gabarito por cima e vai dizendo o que
 * corrigir enquanto a pessoa se posiciona. Quando fica tudo certo por alguns
 * quadros seguidos, conta 3, 2, 1 e tira a foto sozinho — assim dá pra medir
 * sem ninguém segurando o celular.
 *
 * Por que existe: com foto tirada na mão, quem está sozinho não consegue se
 * enquadrar, e enquadramento errado é o que mais estraga a medida.
 *
 * A imagem continua sem sair do aparelho: o vídeo é analisado quadro a quadro
 * em memória e o que sobra no fim são os dois quadros escolhidos, que o medidor
 * consome e descarta. Nada é gravado, nada é enviado.
 */
(function (raiz) {
  var C = {};

  C.CONFIG = {
    verdesPraDisparar: 4,   // quadros bons seguidos antes de começar a contagem
    segundosContagem: 3,
    pitchMaximo: 4,         // graus de inclinação do celular tolerados
    intervaloMinimo: 60,    // ms entre análises (dá respiro pro aparelho)
  };

  C.suportado = function () {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) &&
      !!(raiz.MT_VISAO && raiz.MT_VISAO.suportado());
  };

  /* ---------- inclinação do celular ----------
   * Celular inclinado distorce a medida e a pessoa não percebe. No iOS é preciso
   * pedir permissão a partir de um toque; onde o sensor não existe, a gente
   * simplesmente não trava por isso (melhor medir do que travar todo mundo). */
  var pitchAtual = null, ouvindoOrientacao = false;
  function aoGirar(e) {
    if (e.beta == null) return;
    // beta é a inclinação frente-trás; com o celular em pé fica perto de 90°
    pitchAtual = Math.abs(90 - Math.abs(e.beta));
  }
  C.pedePermissaoInclinacao = function () {
    if (ouvindoOrientacao) return Promise.resolve(true);
    var D = raiz.DeviceOrientationEvent;
    if (!D) return Promise.resolve(false);
    var liga = function () {
      raiz.addEventListener("deviceorientation", aoGirar);
      ouvindoOrientacao = true;
      return true;
    };
    if (typeof D.requestPermission === "function") {
      return D.requestPermission().then(function (r) { return r === "granted" ? liga() : false; })
        .catch(function () { return false; });
    }
    return Promise.resolve(liga());
  };
  C.inclinacao = function () { return pitchAtual; };

  function fala(texto) {
    try {
      if (!raiz.speechSynthesis || !texto) return;
      var f = new SpeechSynthesisUtterance(texto);
      f.lang = "pt-BR"; f.rate = 1.05;
      raiz.speechSynthesis.cancel();
      raiz.speechSynthesis.speak(f);
    } catch (e) {}
  }
  function vibra(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }

  /* ---------- gabarito na tela ----------
   * Uma silhueta simples mostrando onde o corpo deve ficar: braços em V na foto
   * de frente, braços à frente na de lado. */
  C.desenhaGuia = function (ctx, w, h, modo, cor) {
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.strokeStyle = cor;
    ctx.lineWidth = Math.max(2, w * 0.006);
    ctx.setLineDash([w * 0.02, w * 0.02]);
    ctx.globalAlpha = 0.85;
    var cx = w / 2, topo = h * 0.08, base = h * 0.94, alt = base - topo;
    var cabeca = alt * 0.075;
    ctx.beginPath();
    ctx.arc(cx, topo + cabeca, cabeca, 0, Math.PI * 2);
    ctx.stroke();
    var ombro = topo + alt * 0.20, quadril = topo + alt * 0.52;
    var meioOmbro = alt * (modo === "lado" ? 0.045 : 0.115);
    var meioQuadril = alt * (modo === "lado" ? 0.055 : 0.095);
    ctx.beginPath();                                   // tronco
    ctx.moveTo(cx - meioOmbro, ombro);
    ctx.lineTo(cx + meioOmbro, ombro);
    ctx.lineTo(cx + meioQuadril, quadril);
    ctx.lineTo(cx - meioQuadril, quadril);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();                                   // pernas
    ctx.moveTo(cx - meioQuadril * 0.7, quadril); ctx.lineTo(cx - meioQuadril * 0.8, base);
    ctx.moveTo(cx + meioQuadril * 0.7, quadril); ctx.lineTo(cx + meioQuadril * 0.8, base);
    ctx.stroke();
    ctx.beginPath();                                   // braços
    if (modo === "lado") {
      ctx.moveTo(cx, ombro); ctx.lineTo(cx + alt * 0.16, ombro + alt * 0.02);
    } else {
      ctx.moveTo(cx - meioOmbro, ombro); ctx.lineTo(cx - meioOmbro - alt * 0.075, quadril);
      ctx.moveTo(cx + meioOmbro, ombro); ctx.lineTo(cx + meioOmbro + alt * 0.075, quadril);
    }
    ctx.stroke();
    ctx.restore();
  };

  /* ---------- o loop ----------
   * abre({video, canvas, modo, alturaCm, aoEstado, aoFoto}) devolve um objeto
   * com .para(). aoEstado recebe {cor, fala, contando} a cada análise.
   */
  C.abre = function (op) {
    if (!C.suportado()) return Promise.reject(new Error("este aparelho não tem câmera disponível pro navegador"));
    var video = op.video, canvas = op.canvas, modo = op.modo || "frente";
    var vivo = true, stream = null, contagem = 0, verdes = 0, ultimoAviso = "", disparando = false;

    function estado(cor, texto, extra) {
      if (op.aoEstado) op.aoEstado({ cor: cor, fala: texto, contando: extra || 0 });
    }
    function encerra() {
      vivo = false;
      if (stream) stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
      stream = null;
      try { raiz.speechSynthesis && raiz.speechSynthesis.cancel(); } catch (e) {}
    }

    return navigator.mediaDevices.getUserMedia({
      video: { facingMode: op.frontal ? "user" : "environment", width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false,
    }).then(function (s) {
      stream = s;
      video.srcObject = s;
      video.setAttribute("playsinline", "");
      video.muted = true;
      return video.play().catch(function () {});
    }).then(function () {
      return raiz.MT_VISAO.carrega(op.base || "", op.aoAviso);
    }).then(function () {
      var ctx = canvas.getContext("2d");
      var falhas = 0;

      function analisa() {
        if (!vivo) return;
        var t0 = Date.now();
        var cor = "#f87171", texto = "", pronto = false;
        try {
          if (video.videoWidth) {
            canvas.width = video.clientWidth || video.videoWidth;
            canvas.height = video.clientHeight || video.videoHeight;
            var leitura = raiz.MT_VISAO.le(video, { video: true, instante: t0 });
            var q = raiz.MT_SCANNER.avaliaFoto(leitura, modo);
            var incl = C.inclinacao();
            if (!q.ok) { texto = q.fala; cor = q.cod === "ninguem" ? "#f87171" : "#fbbf24"; }
            else if (incl != null && incl > C.CONFIG.pitchMaximo) {
              texto = "Endireite o celular: ele está inclinado.";
              cor = "#fbbf24";
            } else { pronto = true; cor = "#4ade80"; texto = "Perfeito, não se mexa!"; }
            falhas = 0;
          } else { texto = "Ligando a câmera…"; }
        } catch (e) {
          // uma falha solta acontece (quadro chegou torto); várias seguidas
          // significam motor caído — aí é melhor sair do que fingir que mede
          if (++falhas >= 4) {
            encerra();
            if (op.aoErro) op.aoErro(e);
            return;
          }
          texto = "Não consegui ler a imagem agora.";
        }

        C.desenhaGuia(ctx, canvas.width, canvas.height, modo, cor);

        if (pronto) {
          verdes++;
          if (verdes >= C.CONFIG.verdesPraDisparar && !disparando) {
            disparando = true;
            contagem = C.CONFIG.segundosContagem;
            conta();
            return;
          }
        } else {
          verdes = 0;
          // só repete a instrução quando ela muda: repetir a mesma frase o tempo
          // todo deixa qualquer um irritado
          if (texto && texto !== ultimoAviso) { fala(texto); ultimoAviso = texto; }
        }
        estado(cor, texto, 0);
        setTimeout(analisa, Math.max(0, C.CONFIG.intervaloMinimo - (Date.now() - t0)));
      }

      function conta() {
        if (!vivo) return;
        if (contagem > 0) {
          estado("#4ade80", String(contagem), contagem);
          fala(String(contagem));
          vibra(60);
          contagem--;
          setTimeout(conta, 1000);
          return;
        }
        vibra([80, 60, 120]);
        estado("#4ade80", "Prontinho!", 0);
        // o quadro que vale é lido na resolução de medir, não na do guia
        var quadro = document.createElement("canvas");
        quadro.width = video.videoWidth;
        quadro.height = video.videoHeight;
        quadro.getContext("2d").drawImage(video, 0, 0);
        encerra();
        if (op.aoFoto) op.aoFoto(quadro);
      }

      analisa();
      return { para: encerra, ativo: function () { return vivo; } };
    }).catch(function (e) {
      encerra();
      throw e;
    });
  };

  raiz.MT_CAMERA = C;
})(typeof self !== "undefined" ? self : this);
