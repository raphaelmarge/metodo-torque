/* TORQUE NUTRI — skin do redesenho 2026 do app do PACIENTE.
 *
 * O que é: a camada VISUAL, separada do construtor — o mesmo desenho do
 * app/aluno-skin.js. O app/nutri-builder.js continua sendo a fonte única de
 * lógica (dieta, água, diário, XP, feed, chat); este arquivo só injeta CSS
 * por cima do que ele monta, com guarda — sem skin, nada muda.
 *
 * Regras (as mesmas do skin do aluno):
 * - NADA de dado de paciente aqui. E nada de COR nova: as cores do consultório
 *   chegam baked no HTML pelo builder — o skin mexe só em tipo, raio, tamanho
 *   e espaço, então um consultório azul continua azul.
 * - !important só onde o alvo tem style inline no HTML montado (senão inline
 *   vence a folha).
 */
(function (raiz) {
  var css = ""
    /* ---------- base e tipo ---------- */
    + "body{font-variant-numeric:tabular-nums;padding-bottom:calc(112px + env(safe-area-inset-bottom,0px))}"
    + ".cardx{border-radius:22px;padding:18px 17px;margin-bottom:12px}"
    + "h2{font-size:10.5px;letter-spacing:.2em;margin-bottom:12px;font-weight:800}"
    /* o nome do paciente é o título da tela: peso máximo e traço apertado
       (inline no HTML montado → !important) */
    + "h1{font-size:clamp(30px,9.5vw,38px)!important;font-weight:900!important;letter-spacing:-.035em!important;line-height:.98}"
    + ".vz{font-size:12.5px}"

    /* ---------- alvos de toque: 44px é o piso ---------- */
    + ".btnx{min-height:48px;font-size:14px;border-radius:14px;font-style:normal;letter-spacing:.01em;font-weight:800}"
    + ".btnx[style*='width:100%']{min-height:56px!important;font-size:16px!important;border-radius:16px!important}"
    + "input{min-height:48px;border-radius:14px}"
    + ".kv{min-height:40px;align-items:center}"
    + ".refok{min-height:40px;border-radius:12px}"

    /* ---------- o herói: a meta de hoje manda na tela ---------- */
    + "#heroN{border-radius:26px!important;padding:26px 22px!important;margin-bottom:12px}"
    + "#heroN [style*='font-size:34px']{font-size:clamp(46px,13vw,58px)!important;font-weight:900!important;letter-spacing:-.04em!important;line-height:.96}"
    + "#heroVerN{min-height:52px;width:100%;font-size:15.5px}"

    /* ---------- refeições e listas ---------- */
    + "details{border-radius:16px;margin-bottom:10px}"
    + "summary{min-height:54px;align-items:center}"
    + ".agua-bar{height:12px;border-radius:99px}"

    /* ---------- minha semana ---------- */
    + "#diasSemN>div{border-radius:12px!important}"

    /* ---------- barra de abas (o mesmo acabamento do app do aluno) ---------- */
    + "#navAppN{padding:8px 6px calc(14px + env(safe-area-inset-bottom,0px))!important}"
    + ".nitemn{padding:8px 2px 6px!important;border-radius:12px!important;gap:4px!important}"
    + ".nitemn svg{width:22px;height:22px}"
    + ".nitemn span{font-size:9.5px!important;font-weight:800!important;letter-spacing:.1em!important}";

  raiz.MT_NUTRI_SKIN = { css: css, js: "" };
})(typeof self !== "undefined" ? self : this);
