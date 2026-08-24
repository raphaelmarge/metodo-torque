/* TORQUE ON — skin do redesenho 2026 do app do aluno.
 *
 * O que é: a camada VISUAL do redesenho, separada do construtor. O aluno-builder.js
 * continua sendo a fonte única de lógica (sync, push, PIX, GPS, chat, onboarding) —
 * este arquivo só injeta CSS (e um ajuste mínimo de DOM) por cima do que ele monta.
 *
 * Regras (as mesmas do construtor):
 * - NADA de dado de aluno aqui. Cores continuam vindo do D pelas variáveis
 *   (--cor, --cor2, --corc, --cor-rgb, --bg0…--bg12) — um studio azul continua azul.
 * - !important só onde o alvo tem style inline no HTML montado (senão inline vence).
 * - O modo claro do construtor reescreve cores lendo [style*=…]; as regras daqui
 *   carregam DEPOIS, então empate de especificidade fica com o skin.
 *
 * Como liga: ver PATCH-APLICAR.md (1 include + 1 replace exato no builder).
 */
(function (raiz) {
  var css = ""
    /* ---------- base e tipo: três níveis de hierarquia ---------- */
    + "body{font-variant-numeric:tabular-nums}"
    + ".cardx{margin:26px 20px 0}"
    + ".cardx h2{font-size:10.5px;letter-spacing:.2em;color:#8a8695;margin-bottom:12px;font-weight:800}"
    + "html.claro .cardx h2{color:#6c6678}"
    + ".vz{font-size:12.5px}"

    /* ---------- alvos de toque: 44px é o piso ---------- */
    + ".btnx{min-height:46px;font-size:14px}"
    + ".btnx[style*='width:100%']{min-height:58px!important;font-size:16px!important;box-shadow:0 16px 40px -18px rgba(var(--cor-rgb),1)}"
    + ".tphab button{min-height:44px!important}"
    + "input,select,textarea{min-height:48px;border-radius:14px}"
    + ".rpebtn{min-height:48px;border-radius:16px;font-weight:800;font-size:13px}"
    + ".rperow{gap:6px}"
    + ".fichabox>summary{min-height:56px;align-items:center!important}"
    + ".kv{min-height:40px;align-items:center}"

    /* ---------- topo ---------- */
    + ".topo{border-radius:0 0 28px 28px}"
    + ".topo h1{font-size:26px;letter-spacing:-.02em}"
    + ".tpchip{padding:7px 12px}"

    /* ---------- bloco de hoje: o herói manda na tela (telas final-44/45/46) ----------
     * O carrossel do Início é FULL-BLEED: cards de tela cheia, título gigante,
     * risquinhos por card e o botão grandão. O construtor monta a estrutura;
     * aqui entra o acabamento. */
    + "#heroCarr{margin:0!important;padding:0!important;gap:0!important}"
    + "#heroCarr>div{border-radius:0!important}"
    + "#htTitulo,#heroCarr .htit{font-size:clamp(30px,10vw,44px)!important;font-weight:900!important;letter-spacing:-.035em!important;line-height:.94!important;text-transform:uppercase}"
    + "#htSub,#heroCarr .hsub{font-size:13.5px!important}"
    + "#heroCarr .btnx{min-height:58px;width:100%;font-size:17px;font-weight:800}"
    + "#diasSem>div>div,#diasSem>div{border-radius:12px!important}"

    /* ---------- barra de abas ---------- */
    + "#navApp{padding:8px 6px calc(14px + env(safe-area-inset-bottom,0px))!important}"
    + "#navApp .nitem{padding:8px 2px 6px!important;border-radius:12px;gap:4px!important}"
    + "#navApp .nitem svg{width:22px;height:22px}"
    + "#navApp .nitem span:last-child{font-size:9.5px!important;font-weight:800!important;letter-spacing:.1em!important}"

    /* ---------- player do treino guiado (classes .g*, sem inline) ---------- */
    + ".gtit{font-size:clamp(26px,8vw,36px);font-weight:900;letter-spacing:-.03em}"
    + ".gsets i{min-height:48px;border-radius:14px}"
    + ".gsets.mini i{min-height:28px;height:28px;border-radius:10px}" // fileira compacta acima dos tiles (tela 47)
    + ".gpe button{min-height:58px;border-radius:99px;font-weight:800}"
    + ".grelo b{font-variant-numeric:tabular-nums}"
    + ".gcard{border-radius:26px}"
    + ".gcard .rpebtn{min-height:48px}"

    /* ---------- treino guiado: mesma informação, menos ruído (2026-08) ----------
     * O Raphael: "não quero tirar, mas tá muita informação". Então nada some —
     * o que muda é o PESO de cada coisa. Três problemas concretos na tela:
     * o nome da ficha aparecia duas vezes a 40px de distância (no topo e
     * embaixo do 01/05), o card externo era uma moldura em volta de outras
     * molduras (card > tiles > "na última vez"), e o roxo estava em quatro
     * lugares brigando com o título. */

    /* 1. o nome da ficha, escrito duas vezes, fica só no topo.
     *    A regra do construtor é `.gcont #gProg span` — repetir a mesma
     *    especificidade aqui basta, porque o skin carrega depois. */
    + ".gcont #gProg span{display:none}"
    + ".gcont{margin-top:7px;align-items:center}"
    + "#gProg{font-size:12px;letter-spacing:.14em;color:#8a8695;font-weight:700}"
    + "#gProg b{font-size:12px;color:#cfcbdb}"
    + "#gReloTot{font-size:12px;color:#8a8695}"

    /* 2. o título é o herói; o "Série 1 de 4" desce um degrau e larga o roxo */
    + ".gtit{margin-top:14px;line-height:.96}"
    + ".ggrupo{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#8a8695;margin-top:8px;font-weight:800}"

    /* 3. a explicação da técnica vira uma linha discreta ao lado do selo */
    + ".gtecl{margin-top:10px;font-size:12.5px;line-height:1.45;color:#8a8695}"
    + ".gtecl .tecchip{font-size:9.5px;padding:4px 9px;vertical-align:1px}"

    /* 4. o card externo vira o próprio fundo da tela — uma moldura a menos.
     *    O padding CONTINUA (com margem negativa que devolve o alinhamento):
     *    com padding 0 o `overflow-y:auto` raspa o glifo da primeira letra. */
    + ".gwrap .gcard{background:none;border:none;box-shadow:none;padding:0 18px;margin:14px -18px 0}"

    /* 5. a fileira das séries encolhe, sem deixar de dizer qual é a de agora */
    + ".gsets.mini{gap:6px;margin-top:0}"
    + ".gsets.mini i{height:30px;min-height:30px;min-width:0;max-width:none;border-radius:9px;font-size:12.5px;font-weight:800}"

    /* 6. recado e dica continuam lá, sem gritar mais alto que o exercício */
    + ".gobs{margin-top:16px;padding-left:12px;border-left-width:2px}"
    + ".gobs em{font-size:9.5px;letter-spacing:.18em}"
    + ".gobs p{font-size:13.5px;line-height:1.4;font-weight:700}"
    + ".gdica{margin-top:10px;font-size:12.5px;line-height:1.5;color:#8a8695}"

    /* 7. os tiles passam a ser a ÚNICA superfície forte da tela */
    + ".gtiles{margin-top:18px}"
    + ".gtile{border-radius:16px;padding:12px 14px;min-height:82px}"

    /* 8. os blocos de apoio trocam moldura por um fio */
    + ".gsecrow{margin-top:10px}"
    + ".gultvez{background:none;border:none;border-top:1px solid var(--bg11);border-radius:0;padding:15px 2px 0;margin-top:18px}"
    + ".gultvez>span{font-size:9.5px;letter-spacing:.18em}"
    + ".guvrow{font-size:13px;color:#8a8695;margin-top:8px}"
    + ".guvrow b{color:#cfcbdb}"
    + ".gprox{margin-top:15px;padding-top:15px;border-top:1px solid var(--bg11);font-size:12.5px}"

    /* 9. o cronômetro para de flutuar solto entre o card e o botão */
    + ".gbase{margin-top:16px}"
    + ".grelo b{font-size:15px}"
    + ".grelo em{font-size:11px}"

    /* ---------- listas, conquistas, agenda ---------- */
    + "#cqGrid{gap:10px!important}"
    + "#cqGrid>div{border-radius:18px!important}"
    + "#agCal button{min-height:44px;min-width:40px;border-radius:12px}"
    + "#trTabs button{min-height:44px!important;border-radius:99px!important}"
    + "#menuApp .nitem{min-height:56px}"

    /* ---------- utilitários que as receitas novas usam ---------- */
    + ".carr{display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;margin:0 -20px;padding:0 20px}"
    + ".carr::-webkit-scrollbar{display:none}"
    + ".carr>*{flex:none;width:100%;scroll-snap-align:center}"
    + ".carrdots{display:flex;gap:5px;justify-content:center;margin-top:10px}"
    + ".carrdots i{width:6px;height:6px;border-radius:99px;background:var(--bg8)}"
    + ".carrdots i.on{background:var(--corc);width:16px}"
    + ".listrow{display:flex;align-items:center;gap:12px;min-height:62px;padding:0 2px;border-top:1px solid var(--bg5);font-size:14px}"
    + ".chipx{display:inline-flex;align-items:center;gap:6px;border-radius:99px;padding:7px 14px;font-size:11.5px;font-weight:800;background:var(--bg4);border:1px solid rgba(255,255,255,.06);color:#cfcbdb}"
    + "html.claro .chipx{background:#f3f1f7;border-color:#e4e1eb;color:#443f52}"
    + ".notabtn{min-height:58px;border-radius:16px;background:var(--bg4);border:1px solid rgba(255,255,255,.06);color:#fff;font-family:inherit;font-size:16px;font-weight:800;cursor:pointer}"
    + ".notabtn.on{background:var(--cor);border-color:var(--cor)}"
    + "html.claro .notabtn{background:#fff;border-color:#d9d5e3;color:#191622}"
    + "html.claro .notabtn.on{background:var(--cor);color:#fff}"

    /* respiro extra antes da barra de abas */
    + "body{padding-bottom:calc(112px + env(safe-area-inset-bottom,0px))}";

  var js = ""
    + "document.addEventListener('DOMContentLoaded',function(){try{"
    /* 1. 'Início' vira 'Hoje' na barra de abas (só o rótulo — a navegação não muda) */
    + "document.querySelectorAll('#navApp .nitem span').forEach(function(s){if(s.textContent.trim()==='In\\u00edcio')s.textContent='Hoje';});"
    /* 2. herói primeiro: com foto na ficha, o treino do dia sobe pra cima da faixa de dias */
    + "var h=document.getElementById('heroTreino'),d=document.getElementById('diasSem');"
    + "if(h&&d&&h.classList.contains('comfoto')&&h.parentElement===d.parentElement){h.parentElement.insertBefore(h,d);d.style.marginTop='10px';}"
    + "}catch(e){}});";

  raiz.MT_APP_SKIN = { css: css, js: js };
})(self);
