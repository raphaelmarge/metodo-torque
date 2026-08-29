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
    /* alvos que ficaram abaixo do piso de 44px do handoff (conferido tela a tela
     * em 2026-08-25 nas telas 44–51). Os três primeiros têm style inline no HTML
     * montado, então aqui precisa de !important — senão o inline vence. */
    + ".crModBt{min-height:44px!important}"          // Corrida / Caminhada / Bike: 32px
    + "#crMetaBtn{min-height:44px!important}"        // "Defina uma meta": 36px
    + "#avBtn2{min-height:44px;min-width:44px}"      // avatar do topo: 42px (segue redondo)
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
    /* junção foto → página com CONTINUIDADE (pedido do Raphael, 2026-08-29):
     * o véu do builder pulava de 8% pra 88% de escuridão em 40% da altura e a
     * foto terminava numa quina visível em cima do botão. A rampa vira um
     * degradê longo com passos pequenos (aproxima um ease-in), começando mais
     * cedo e escorrendo até o var(--bg0) da página — a foto "derrete" no fundo
     * e o card emenda no Minha semana sem borda. Mesmos pontos de partida e
     * chegada do véu original; só a curva muda. O alvo é por [style*] porque o
     * véu é inline no HTML montado (e só ele tem pointer-events:none + gradiente
     * dentro dos cards do carrossel). */
    + "#heroCarr>div>div[style*='pointer-events:none'][style*='linear-gradient(180deg']{background:linear-gradient(180deg,rgba(13,12,16,.55) 0%,rgba(13,12,16,.06) 30%,rgba(13,12,16,.12) 42%,rgba(13,12,16,.24) 51%,rgba(13,12,16,.4) 59%,rgba(13,12,16,.58) 67%,rgba(13,12,16,.75) 74%,rgba(13,12,16,.88) 82%,rgba(13,12,16,.96) 90%,var(--bg0) 100%)!important}"
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
     * O Raphael: "não quero tirar, mas tá muita informação" — e depois, vendo
     * duas propostas: a mais radical, porém com o DROP-SET e TODOS os blocos
     * de informação continuando visíveis. Então nada some da tela; o que muda
     * é o peso. Três coisas em primeiro plano — nome do exercício, tiles e
     * botão — e todo o resto vira apoio, num cinza só e num tamanho só. */

    /* 1. o nome da ficha estava escrito DUAS vezes a 40px de distância: no topo
     *    ("A · PEITO E TRÍCEPS") e de novo embaixo do 01/05. Fica só o de cima.
     *    A regra do construtor é `.gcont #gProg span` — repetir a mesma
     *    especificidade aqui basta, porque o skin carrega depois. */
    + ".gcont #gProg span{display:none}"
    + ".gcont{margin-top:7px;align-items:center}"
    + "#gProg{font-size:11.5px;letter-spacing:.16em;color:#6f6a7c;font-weight:700}"
    + "#gProg b{font-size:11.5px;color:#a9a4b5}"
    + "#gReloTot{font-size:11.5px;color:#6f6a7c;letter-spacing:.04em}"

    /* 2. os DOIS cronômetros passam a morar juntos no topo (são a mesma
     *    natureza de informação; separados, o do exercício ficava flutuando
     *    solto entre o conteúdo e o botão) */
    + ".gbase{order:2;margin:6px 0 0;justify-content:flex-start}"
    + ".grelo{color:#6f6a7c}"
    + ".grelo b{font-size:11.5px;font-weight:700}"
    + ".grelo em{font-size:11.5px;font-style:normal}"

    /* 3. o título ganha o palco; o "Série 1 de 4" larga o roxo e desce um degrau */
    + ".gtit{margin-top:20px;line-height:.94}"
    + ".ggrupo{font-size:11.5px;letter-spacing:.16em;text-transform:uppercase;color:#6f6a7c;margin-top:9px;font-weight:800}"

    /* 4. o selo da técnica CONTINUA (pedido explícito), com a explicação no
     *    mesmo tom do resto do apoio */
    + ".gtecl{margin-top:9px;font-size:12px;line-height:1.45;color:#6f6a7c}"
    + ".gtecl .tecchip{font-size:9px;padding:3px 8px;vertical-align:1px}"

    /* 5. o card externo era uma moldura em volta de outras molduras (card >
     *    tiles > "na última vez") e vira o próprio fundo. O padding CONTINUA,
     *    com margem negativa devolvendo o alinhamento: com padding 0 o
     *    `overflow-y:auto` raspa o glifo da primeira letra das linhas. */
    + ".gwrap .gcard{background:none;border:none;box-shadow:none;padding:0 18px;margin:18px -18px 0}"

    /* 6. as séries continuam com os NÚMEROS (tentei virar trilho liso e era a
     *    única informação que sumia de verdade). Viram pastilhas de 26px em vez
     *    de caixas de 52px, e estreitas — em largura cheia viravam gêmeas da
     *    barra de exercícios do topo, e duas barras iguais dizendo coisas
     *    diferentes confundem mais do que ajudam. */
    + ".gsets.mini{gap:5px;margin-top:0;max-width:196px}"
    + ".gsets.mini i{height:26px;min-height:26px;min-width:0;max-width:none;border-radius:8px;font-size:11.5px;font-weight:800;padding:0}"

    /* 7. recado e dica continuam inteiros, sem gritar mais que o exercício */
    + ".gobs{margin-top:18px;padding-left:11px;border-left-width:2px}"
    + ".gobs em{font-size:9px;letter-spacing:.2em;color:#6f6a7c}"
    + ".gobs p{font-size:12.5px;line-height:1.45;font-weight:600;color:#a9a4b5}"
    + ".gdica{margin-top:9px;font-size:12px;line-height:1.5;color:#6f6a7c}"

    /* 8. os tiles são o segundo herói — crescem e ganham respiro */
    + ".gtiles{margin-top:22px;gap:11px}"
    + ".gtile{border-radius:18px;padding:15px 16px;min-height:96px}"

    /* 9. o apoio depois dos tiles troca moldura por um fio */
    + ".gsecrow{margin-top:11px}"
    + ".gultvez{background:none;border:none;border-top:1px solid var(--bg11);border-radius:0;padding:16px 2px 0;margin-top:22px}"
    + ".gultvez>span{font-size:9px;letter-spacing:.2em;color:#6f6a7c}"
    + ".guvrow{font-size:12.5px;color:#6f6a7c;margin-top:9px}"
    + ".guvrow b{color:#a9a4b5;font-weight:700}"
    + ".gprox{margin-top:16px;padding-top:16px;border-top:1px solid var(--bg11);font-size:12px;color:#6f6a7c}"
    + ".gprox b{color:#a9a4b5}"

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

    /* ---------- áreas esquecidas: Evolução, Chat, Questionários, Utilidades (v669) ----------
     * Regras SÓ de geometria/tipo — nada de display (dezenas de nós alternam
     * por style.display) e nada de cor de fundo (o modo claro repinta lendo o
     * ATRIBUTO style por substring; vencer ele com id+!important deixaria card
     * escuro no tema claro). !important só onde o alvo tem style inline. */
    /* Evolução: os cards internos de Cargas/Marcas/Esforço sobem pro raio 22 do padrão */
    + "#cgBox div[style*='border-radius:20px'],#mkBox div[style*='border-radius:20px'],#esfBox div[style*='border-radius:20px']{border-radius:22px!important}"
    + "div:has(>#pzGraf){border-radius:22px!important}" // caixa do Meu peso (sem id; :has degrada limpo)
    /* Chat: bolha discriminada pelo RAIO (sem [style*] pegaria o divisor de data e o wrapper) */
    + "#chMsgs>div[style*='border-radius:18px 18px 6px 18px'],#chMsgs>div[style*='border-radius:18px 18px 18px 6px'],#chMsgs div[style*='border-radius:18px 18px 18px 6px']{padding:12px 15px!important;font-size:14.5px!important;line-height:1.5!important}"
    + "#chMsgs{gap:9px!important}"        // gap é inline
    + "#chTexto{min-height:52px}"          // min-height não é inline — sem !important
    /* Questionários: classes puras — o skin carrega depois e vence no empate */
    + ".qsbt{min-height:54px;border-radius:99px;font-weight:800}"
    + ".qaop{border-radius:22px}"
    /* Utilidades: tiles no raio padrão (inline 20px) */
    + "[data-utgo]{border-radius:22px!important}"
    /* Corrida (lista fechada de alvos seguros): o botão de começar cresce pro polegar */
    + "[data-cbstart]{min-height:52px!important}"

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
