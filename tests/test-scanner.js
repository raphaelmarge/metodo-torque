// Medidas pela câmera: valida a MATEMÁTICA com um boneco sintético de medidas
// conhecidas. Não usa câmera nem imagem real de propósito — o que precisa ser
// garantido aqui é a conta, não o hardware.
const path = require("path");
const RAIZ = path.join(__dirname, "..");

global.self = {};
require(path.join(RAIZ, "assets/scanner-corporal.js"));
const S = self.MT_SCANNER;
const P = S.PONTOS;

let falhas = 0;
function ok(cond, nome) {
  console.log((cond ? "  ✅ " : "  ❌ ") + nome);
  if (!cond) falhas++;
}
const perto = (a, b, tol) => a != null && Math.abs(a - b) <= tol;

/* ---------- boneco sintético ----------
 * Larguras em centímetros viram pixels pela escala escolhida, então dá pra
 * conferir se a medição devolve exatamente o que foi desenhado.
 */
const W = 640, H = 1000;
const TOPO = 50, BASE = 950;          // corpo com 900 px de altura
const ALTURA_PX = BASE - TOPO;
const ALTURA_CM = 175;
const CM_PX = ALTURA_CM / ALTURA_PX;  // 0,19444 cm por pixel
const cm = (v) => Math.round(v / CM_PX);   // centímetros -> pixels

// pontos nas mesmas frações que o motor usa pra calcular a régua
const yOmbro = TOPO + Math.round(ALTURA_PX * 0.182);
const yTornozelo = yOmbro + Math.round(ALTURA_PX * S.FRACAO.ombroTornozelo);
const yQuadril = yTornozelo - Math.round(ALTURA_PX * S.FRACAO.quadrilTornozelo);
const yJoelho = yOmbro + Math.round(ALTURA_PX * S.FRACAO.ombroJoelho);
const yOlhos = TOPO + Math.round(ALTURA_PX * 0.064);
const T = yQuadril - yOmbro;

const LARG = { ombro: 44, cintura: 30, quadril: 37, coxa: 19, panturrilha: 12, braco: 9 };

// largura do TRONCO em cada altura (cm), interpolando entre os pontos-chave
function larguraTroncoCm(y) {
  if (y < TOPO || y > BASE) return 0;
  if (y < yOmbro - 40) return 15;                                  // cabeça/pescoço
  if (y < yOmbro + Math.round(T * 0.25)) return LARG.ombro;        // ombros
  const yCint = yOmbro + Math.round(T * 0.62);                     // cintura no meio da janela
  if (y <= yCint) {
    const f = (y - (yOmbro + Math.round(T * 0.25))) / (yCint - (yOmbro + Math.round(T * 0.25)));
    return LARG.ombro + (LARG.cintura - LARG.ombro) * f;
  }
  const yQuadMax = yQuadril + Math.round(T * 0.10);
  if (y <= yQuadMax) {
    const f = (y - yCint) / (yQuadMax - yCint);
    return LARG.cintura + (LARG.quadril - LARG.cintura) * f;
  }
  if (y <= yJoelho) return LARG.coxa * 2;        // as duas coxas, coladas
  return LARG.panturrilha * 2;
}

// desenha a máscara: tronco no centro + braços separados por um vão
function montaMascara(comBracos) {
  const m = new Uint8Array(W * H);
  const cx = W >> 1;
  for (let y = TOPO; y <= BASE; y++) {
    const larg = cm(larguraTroncoCm(y));
    const meia = larg >> 1;
    for (let x = cx - meia; x <= cx + meia; x++) if (x >= 0 && x < W) m[y * W + x] = 1;
    if (comBracos && y > yOmbro && y < yQuadril) {
      const vao = cm(4), lb = cm(LARG.braco);
      [[cx - meia - vao - lb, cx - meia - vao], [cx + meia + vao, cx + meia + vao + lb]].forEach((par) => {
        for (let x = par[0]; x <= par[1]; x++) if (x >= 0 && x < W) m[y * W + x] = 1;
      });
    }
  }
  return m;
}

function landmarks() {
  const l = new Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, visibility: 1 }));
  const px = (x) => x / W, py = (y) => y / H;
  const cx = W >> 1;
  const meiaOmbro = cm(LARG.ombro) >> 1, meiaQuadril = cm(LARG.quadril) >> 1;
  l[P.ombroE] = { x: px(cx + meiaOmbro), y: py(yOmbro), visibility: 1 };
  l[P.ombroD] = { x: px(cx - meiaOmbro), y: py(yOmbro), visibility: 1 };
  l[P.quadrilE] = { x: px(cx + meiaQuadril), y: py(yQuadril), visibility: 1 };
  l[P.quadrilD] = { x: px(cx - meiaQuadril), y: py(yQuadril), visibility: 1 };
  l[P.joelhoE] = { x: px(cx + 30), y: py(yJoelho), visibility: 1 };
  l[P.joelhoD] = { x: px(cx - 30), y: py(yJoelho), visibility: 1 };
  l[P.tornozeloE] = { x: px(cx + 25), y: py(yTornozelo), visibility: 1 };
  l[P.tornozeloD] = { x: px(cx - 25), y: py(yTornozelo), visibility: 1 };
  l[P.olhoE] = { x: px(cx + 12), y: py(yOlhos), visibility: 1 };
  l[P.olhoD] = { x: px(cx - 12), y: py(yOlhos), visibility: 1 };
  l[P.cotoveloE] = { x: px(cx + 90), y: py(yOmbro + Math.round(T * 0.5)), visibility: 1 };
  l[P.cotoveloD] = { x: px(cx - 90), y: py(yOmbro + Math.round(T * 0.5)), visibility: 1 };
  return l;
}

const leitura = (comBracos) => ({ landmarks: landmarks(), mascara: montaMascara(comBracos !== false), largura: W, altura: H });

console.log("Fórmula do perímetro:");
ok(perto(S.perimetroElipse(20, 20), 2 * Math.PI * 10, 0.001), "elipse com largura = profundidade dá a circunferência exata do círculo");
ok(perto(S.perimetroElipse(36, 25), 96.6, 0.1), "elipse 36 × 25 cm = 96,6 cm");
ok(S.perimetroElipse(0, 20) === 0 && S.perimetroElipse(-5, 10) === 0, "medida inválida devolve zero em vez de número inventado");

console.log("Régua (escala pela altura):");
const linhas = S.perfil(leitura().mascara, W, H, W >> 1);
const esc = S.escala(landmarks(), linhas, H, ALTURA_CM);
ok(esc.ok, "os caminhos de medição concordam entre si (dispersão " + esc.dispersao + "%)");
ok(perto(esc.cmPorPx, CM_PX, CM_PX * 0.02), "recupera a escala com menos de 2% de erro (" + esc.cmPorPx.toFixed(4) + " vs " + CM_PX.toFixed(4) + " cm/px)");

console.log("Silhueta: o braço não pode virar cintura:");
const comBraco = S.perfil(leitura(true).mascara, W, H, W >> 1);
const semBraco = S.perfil(leitura(false).mascara, W, H, W >> 1);
const yTeste = yOmbro + Math.round(T * 0.62);
ok(comBraco[yTeste].larg > semBraco[yTeste].larg, "com os braços afastados a largura TOTAL da linha aumenta");
ok(comBraco[yTeste].tronco === semBraco[yTeste].tronco, "mas a largura do TRONCO (a que vale) fica igual — o vão do braço corta a varredura");

console.log("Pontos anatômicos:");
const cint = S.maisEstreito(comBraco, yOmbro + Math.round(T * 0.35), yOmbro + Math.round(T * 0.80));
const quad = S.maisLargo(comBraco, yQuadril - Math.round(T * 0.12), yQuadril + Math.round(T * 0.22));
ok(cint && perto(cint.px * CM_PX, LARG.cintura, 1), "acha a cintura no ponto mais estreito (" + (cint ? (cint.px * CM_PX).toFixed(1) : "?") + " cm, desenhado " + LARG.cintura + ")");
ok(quad && perto(quad.px * CM_PX, LARG.quadril, 1), "acha o quadril no ponto mais largo (" + (quad ? (quad.px * CM_PX).toFixed(1) : "?") + " cm, desenhado " + LARG.quadril + ")");

console.log("Medidas completas:");
const frente = S.analisaFoto(leitura(), "frente", ALTURA_CM);
ok(frente.ok, "a foto de frente passa no controle de qualidade" + (frente.ok ? "" : " — " + frente.fala));
const r = S.medidas(frente, null, { alturaCm: ALTURA_CM, sexo: "M" });
ok(r.ok && r.circ.cintura > 0 && r.circ.quadril > 0, "sai cintura e quadril em centímetros");
ok(r.circ.cintura > 70 && r.circ.cintura < 100, "a cintura dá um valor de gente de verdade (" + r.circ.cintura + " cm)");
ok(r.confianca.cintura === "baixa", "sem a foto de lado, a cintura vem marcada como confiança baixa");
ok(/foto de lado/.test(r.avisos.join(" ")), "e a tela avisa que falta a foto de lado");

console.log("Razão cintura/altura não depende da altura digitada:");
const rBaixo = S.medidas(frente, null, { alturaCm: 160, sexo: "M" });
const rAlto = S.medidas(frente, null, { alturaCm: 190, sexo: "M" });
ok(rBaixo.rcest === r.rcest && rAlto.rcest === r.rcest,
  "a razão fica igual com 160, 175 ou 190 cm (" + r.rcest + ") — sai de pixels, não da régua");
ok(rBaixo.circ.cintura !== rAlto.circ.cintura, "já a cintura em cm muda, como tem que mudar");

console.log("Percentual de gordura (RFM):");
ok(perto(S.rfm("M", 175, 90), 25.1, 0.1), "homem 175 cm com 90 de cintura: 25,1%");
ok(S.rfm("F", 175, 90) - S.rfm("M", 175, 90) === 12, "a fórmula soma os 12 pontos da referência feminina");
ok(S.rfm("M", 0, 90) === null && S.rfm("M", 175, 0) === null, "sem altura ou sem cintura não inventa percentual");
ok(r.gordura && r.gordura.faixa[1] - r.gordura.faixa[0] === 10, "o percentual sempre sai em faixa de 10 pontos, nunca cravado");

console.log("Calibração pela fita:");
ok(S.calibra([]).desvio === 0 && S.calibra(null).n === 0, "sem medida de fita, nenhum ajuste");
ok(S.calibra([{ fita: 88, foto: 85 }]).desvio === 3, "uma medida de fita vira o ajuste (+3 cm)");
const rCal = S.medidas(frente, null, { alturaCm: ALTURA_CM, sexo: "M", calibracao: { desvio: 3 } });
ok(perto(rCal.circ.cintura, r.circ.cintura + 3, 0.11), "o ajuste entra em todas as medidas");
ok(rCal.calibrado && rCal.margemCm < r.margemCm, "e a margem de erro declarada cai pela metade");

console.log("Controle de qualidade da foto:");
function comLandmarks(muda) {
  const l = landmarks(); muda(l);
  return { landmarks: l, mascara: montaMascara(true), largura: W, altura: H };
}
ok(S.avaliaFoto({ landmarks: null, mascara: null, largura: W, altura: H }, "frente").cod === "ninguem", "foto sem ninguém é recusada");
ok(S.avaliaFoto({ landmarks: landmarks(), mascara: null, largura: W, altura: H }, "frente").cod === "sem-silhueta", "sem separar do fundo é recusada");
const torto = S.avaliaFoto(comLandmarks((l) => { l[P.ombroE].y += 0.09; }), "frente");
ok(torto.cod === "torto" && /reto/.test(torto.fala), "ombros desnivelados: pede pra ficar reto");
const deLado = S.avaliaFoto(comLandmarks((l) => { l[P.ombroE].x = 0.5; l[P.ombroD].x = 0.5; }), "frente");
ok(deLado.cod === "de-lado", "de perfil na foto de frente: pede pra virar pra câmera");
const naoVirou = S.avaliaFoto(leitura(), "lado");
ok(naoVirou.cod === "nao-virou", "de frente na foto de lado: pede pra virar de lado");
const semVisiveis = S.avaliaFoto(comLandmarks((l) => { l[P.tornozeloE].visibility = 0.1; l[P.tornozeloD].visibility = 0.1; }), "frente");
ok(semVisiveis.cod === "cortado", "pés fora do quadro: pede o corpo inteiro");
ok(S.avaliaFoto(leitura(), "frente").ok, "a foto boa passa");
ok(S.avaliaFoto(leitura(false), "frente").cod === "bracos", "braços colados no corpo: pede pra afastar em V");

console.log("Razão cintura/altura no padrão clínico:");
// o corte de risco da literatura (0,50) vale pra CIRCUNFERÊNCIA dividida pela
// estatura. Usar a largura daria ~0,17 e faria todo mundo parecer saudável.
ok(r.rcest > 0.30 && r.rcest < 0.80, "a razão sai na escala certa, comparável ao corte de 0,50 (" + r.rcest + ")");
ok(perto(r.rcest, r.circ.cintura / ALTURA_CM, 0.002), "é mesmo a circunferência dividida pela altura");
ok(String(r.rcest).replace("0.", "").length >= 3, "vem com 3 casas: arredondar pra 2 valia ~1 cm de cintura");

console.log("Fatores de correção medidos, não chutados:");
ok(S.FATOR.cintura > 1 && S.FATOR.cintura < 1.02, "o fator da cintura ficou no valor medido no simulador (" + S.FATOR.cintura + ")");
ok(S.FATOR.quadril > 1 && S.FATOR.quadril < 1.01, "o do quadril também (" + S.FATOR.quadril + ") — o chute antigo inflava 3,4 cm");

console.log("Roupa larga é denunciada:");
// tronco muito mais largo do que os ombros permitem = pano sobrando
function comRoupa(extraPx) {
  const m = montaMascara(true);
  const cx = W >> 1;
  for (let y = yOmbro; y <= yQuadril; y++) {
    for (let k = 1; k <= extraPx; k++) {
      const larg = cm(larguraTroncoCm(y)) >> 1;
      if (cx - larg - k >= 0) m[y * W + cx - larg - k] = 1;
      if (cx + larg + k < W) m[y * W + cx + larg + k] = 1;
    }
  }
  return { landmarks: landmarks(), mascara: m, largura: W, altura: H };
}
const justa = S.medidas(S.analisaFoto(leitura(), "frente", ALTURA_CM), null, { alturaCm: ALTURA_CM, sexo: "M" });
/* Camiseta larga faz a silhueta inchar SEM mexer nos pontos do corpo: a IA marca
 * o ombro onde está o osso, não onde está o pano. É essa diferença que a gente
 * usa pra desconfiar — então o teste reproduz exatamente ela, mantendo a
 * silhueta e estreitando os ombros do esqueleto. */
const comPano = {
  landmarks: (function () {
    const l = landmarks();
    const cx = 0.5, meia = (cm(LARG.ombro) >> 1) / W * 0.55;
    l[P.ombroE] = { x: cx + meia, y: l[P.ombroE].y, visibility: 1 };
    l[P.ombroD] = { x: cx - meia, y: l[P.ombroD].y, visibility: 1 };
    return l;
  })(),
  mascara: montaMascara(true), largura: W, altura: H,
};
const fPano = S.analisaFoto(comPano, "frente", ALTURA_CM);
const larga = fPano.ok ? S.medidas(fPano, null, { alturaCm: ALTURA_CM, sexo: "M" }) : null;
ok(!/roupa/i.test(justa.avisos.join(" ")), "com roupa justa não acusa nada");
ok(larga && larga.ok && /roupa/i.test(larga.avisos.join(" ")),
  "quando a silhueta fica bem mais larga do que os ombros permitem, avisa pra refazer");
ok(larga && larga.confianca.cintura === "baixa", "e rebaixa a confiança de todas as medidas");

console.log("Textos obrigatórios:");
ok(/não substitui fita métrica/.test(S.TEXTO_LIMITE), "o aviso de que não substitui fita/bioimpedância está no código");

console.log(falhas ? "\n💥 " + falhas + " FALHA(S)" : "\n🏁 TUDO PASSOU");
process.exit(falhas ? 1 : 0);
