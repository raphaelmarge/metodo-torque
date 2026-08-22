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
