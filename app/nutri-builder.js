/* TORQUE NUTRI — o CÓDIGO do app do paciente, servido pelo site (fonte única).
 *
 * A partir da v661 o app do paciente segue o MESMO desenho do app do aluno (v467):
 * o código mora AQUI e é igual pra todo mundo; o painel (nutricao.html) monta só o
 * pacote de DADOS daquele paciente (dadosAppPaciente) e grava em app_aluno.dados no
 * formato {html, dados, ver, stamp} com dados.tipo = "nutri". Quem abre /app/?t=…
 * junta os dois — um conserto de código chega em TODOS os pacientes sozinho.
 *
 * REGRA DE OURO: NADA de dado de paciente aqui dentro. Tudo entra pelo objeto D.
 * O html do pacote é só rede de segurança pra quem estiver com a página /app/
 * velha guardada. Mexeu no formato do D? Confira dadosAppPaciente no nutricao.html
 * e o teste de sintaxe (tests/test-app-sintaxe.js, bloco do Nutri).
 */
(function (raiz) {
  "use strict";
  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function jsonApp(v) { return JSON.stringify(v).replace(/</g, "\\u003c"); }
  function fmtDataN(iso) {
    var s = String(iso || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
    var pd = s.split("-");
    return pd[2] + "/" + pd[1] + "/" + pd[0];
  }
  function monta(D) {
    D = D || {};
    var p = D.p || {};
    var stamp = D.stamp || "";
    var studio = D.studio || "Minha Nutri";
    var COR = D.COR || "#16a34a";
    var COR2 = D.COR2 || "#15803d";
    var CORC = D.CORC || "#86efac";
    var CORTHEME = D.CORTHEME || "#14532d";
    var CORL = D.CORL || "#4ade80";
    var CORG2 = D.CORG2 || "#22c55e";
    var CORB = D.CORB || "#bbf7d0";
    var CORD = D.CORD || "#0e2417";
    var CORA = D.CORA || "rgba(22,163,74,.22)";
    var LOGO = D.LOGO || "";
    var zapN = D.zapN || "";
    var botApp = D.botApp || null;
    var primeiro = (p.nome || "").split(" ")[0];
    var refs = D.refs || [];
    var alvo = D.alvo || { alvo: 2000 };
    var macrosApp = D.macros || { prot: 0, carb: 0, gord: 0 };
    var aguaMl = D.aguaMl || 2000;
    var nuvemCfg = D.nuvem || {};
    var temNuvem = !!(nuvemCfg.u && nuvemCfg.k && p.appTokenN);
    var feedLigadoN = !!D.feedLigado && temNuvem;
    var avsN = D.avs || [];
    var metaSemN = Math.min(7, Math.max(1, parseInt(p.metaSemana, 10) || 5));
    var aldb = D.aldb || [];
    var pixAppN = D.pixApp || null;
    var mural = D.mural || [];

    return "<!DOCTYPE html><html lang='pt-BR'><head><meta charset='utf-8'>" +
      "<meta name='viewport' content='width=device-width, initial-scale=1'><meta name='theme-color' content='" + CORTHEME + "'>" +
      "<link rel='icon' href='/assets/icons/icon-nutri.svg' type='image/svg+xml'>" +
      "<title>" + esc(primeiro) + " · " + esc(studio) + "</title><style>" +
      "*{box-sizing:border-box;margin:0}body{font-family:system-ui,sans-serif;background:#0f1a12;color:#eef7f0;max-width:480px;margin:0 auto;padding:16px 14px calc(92px + env(safe-area-inset-bottom,0px))}" +
      "[data-secn-off]{display:none!important}" +
      ".cardx{background:#101a13;border:1px solid #29402f;border-radius:8px;padding:16px;margin-bottom:12px}" +
      "h1{font-size:20px}h2{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:" + CORC + ";margin-bottom:10px}" +
      ".btnx{background:linear-gradient(135deg," + COR + "," + COR2 + ");color:#fff;border:none;border-radius:5px;padding:12px 18px;font-weight:900;font-style:italic;letter-spacing:.04em;font-size:14px;cursor:pointer;font-family:inherit;box-shadow:0 12px 32px -12px " + COR + "}" +
      ".vz{color:#9fb8a6;font-size:12.5px;text-align:center;padding:8px 0}" +
      ".kv{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #29402f;font-size:14px}" +
      "input{background:#0f1a12;border:1px solid #29402f;border-radius:10px;color:#fff;padding:11px;font-family:inherit;font-size:14px}" +
      "details{border:1px solid #29402f;border-radius:12px;margin-bottom:8px;background:#101c14}summary{padding:12px 14px;cursor:pointer;font-weight:700;font-size:14px;list-style:none;display:flex;justify-content:space-between;gap:8px}" +
      ".agua-bar{height:16px;background:#0f1a12;border-radius:99px;overflow:hidden;border:1px solid #29402f;margin:8px 0}" +
      ".agua-fill{height:100%;background:linear-gradient(90deg,#0891b2,#22d3ee);transition:width .3s}" +
      ".refok{background:" + COR + ";border:none;color:#fff;border-radius:9px;padding:8px 14px;font-weight:800;cursor:pointer;font-family:inherit}" +
      ".refok.off{background:#29402f;color:#9fb8a6}" +
      // a camada VISUAL do redesenho mora em app/nutri-skin.js (MT_NUTRI_SKIN),
      // embutida aqui com guarda — sem skin, nada muda (mesmo desenho do aluno)
      "</style>" + (raiz.MT_NUTRI_SKIN && raiz.MT_NUTRI_SKIN.css ? "<style>" + raiz.MT_NUTRI_SKIN.css + "</style>" : "") + "</head><body>" +
      (raiz.MT_NUTRI_SKIN && raiz.MT_NUTRI_SKIN.js ? "<script>" + raiz.MT_NUTRI_SKIN.js + "<\/script>" : "") +
      // topo no padrão do app do aluno: marca, nome grande, seção atual e o chip de XP
      "<div class='topo' style='display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:8px 0 18px;'>" +
      "<div style='min-width:0;'>" +
      (LOGO ? "<img src='" + LOGO + "' alt='' style='height:34px;border-radius:9px;margin-bottom:6px;display:block;'>" : "") +
      "<div style='font-size:10px;letter-spacing:.2em;color:#7f9c88;font-weight:800;text-transform:uppercase;'>" + esc(studio).slice(0, 26) + "</div>" +
      "<h1 style='font-size:30px;font-weight:800;letter-spacing:-.02em;margin:2px 0 0;'>" + esc(primeiro) + "</h1>" +
      "<div id='secTitN' style='font-size:13px;font-weight:700;color:" + CORL + ";'></div></div>" +
      "<div style='flex:none;display:flex;align-items:center;gap:8px;'>" +
      // selo de nível separado do chip de XP (paridade com o app do aluno)
      "<span id='nvChipN' style='display:inline-flex;align-items:center;gap:4px;background:linear-gradient(135deg," + COR + "," + COR2 + ");border-radius:99px;padding:7px 11px;font-weight:800;font-size:12.5px;color:#fff;'>" +
      "<svg width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='#fff' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M12 3l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.4 6.7 19.1l1-5.8-4.2-4.1 5.9-.9z'/></svg>" +
      "Nv <b id='nvNumN'>1</b></span>" +
      "<div style='display:flex;align-items:center;gap:6px;background:#16241b;border:1px solid #29402f;border-radius:99px;padding:7px 13px;'>" +
      "<span style='color:" + CORL + ";display:flex;'><svg width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M13 3 5 13h6l-1 8 8-10h-6z'/></svg></span><b id='xpNumN' style='font-size:14px;'>0</b>" +
      "<span style='font-size:11px;color:#9fb8a6;'>XP</span></div></div></div>" +
      // hero: a dieta de hoje em destaque, como o card do treino no app do aluno
      "<div class='cardx' id='heroN' style='padding:22px 20px;border-color:" + COR + ";'>" +
      "<div style='font-size:10.5px;letter-spacing:.18em;color:" + CORL + ";font-weight:800;text-transform:uppercase;'>Hoje · sua meta</div>" +
      "<div style='font-size:34px;font-weight:800;letter-spacing:-.02em;margin:6px 0 2px;'>" + alvo.alvo + " <span style='font-size:18px;color:#9fb8a6;font-weight:700;'>kcal</span></div>" +
      "<div class='vz' style='text-align:left;padding:0 0 4px;' id='heroSubN'>" + refs.length + " refeição(ões) no plano · " + aguaMl + " ml</div>" +
      "<button class='btnx' id='heroVerN' style='margin-top:12px;border-radius:99px;padding:11px 22px;'>Ver minhas refeições ›</button></div>" +
      // minha semana: logo abaixo do hero, com a meta e o botão do dia (igual ao app do aluno)
      "<div class='cardx'><h2>Minha semana</h2>" +
      "<div id='diasSemN' style='display:flex;gap:6px;justify-content:space-between;margin-bottom:12px;'></div>" +
      "<div id='metaBoxN' style='margin-bottom:12px;'></div>" +
      "<button class='btnx' id='btnPlanoN' style='width:100%;padding:14px;font-size:15px;'>Segui o plano hoje!</button>" +
      "<div id='medalhasN' class='vz' style='margin-top:10px;'></div></div>" +
      (mural.length
        ? "<div class='cardx' style='border-color:" + COR + ";'><h2>Mural do consultório</h2>" +
          mural.map(function (av) {
            return "<div style='font-size:14px;padding:6px 0;border-bottom:1px dashed #29402f;'>" + esc(av) + "</div>";
          }).join("") + "</div>"
        : "") +
      "<div class='cardx'><h2>Próxima refeição</h2><div id='proxRef' class='vz' style='font-size:15px;color:#fff;font-weight:700;'></div></div>" +
      "<div class='cardx'><h2>Água de hoje</h2>" +
      "<div class='agua-bar'><div class='agua-fill' id='agFill' style='width:0%'></div></div>" +
      "<div style='display:flex;justify-content:space-between;align-items:center;'><span id='agTxt' class='vz' style='padding:0;'></span>" +
      "<button class='btnx' id='agAdd'>+ 1 copo (250 ml)</button></div>" +
      "<button class='btnx' id='agLembrete' style='width:100%;margin-top:10px;background:#0e7490;'>Me lembrar de beber água</button>" +
      "<div class='vz' id='agNota' style='font-size:11px;'>Com o app aberto, avisamos a cada hora.</div></div>" +
      "<div class='cardx'><h2>Minhas refeições</h2><div id='refProg' class='vz' style='padding:0 0 8px;'></div>" +
      (refs.length ? refs.map(function (r) {
        return "<details><summary><span>" + esc(r.h) + " · " + esc(r.t) + "</span><span style='color:" + CORC + "'>" + r.k + " kcal</span></summary>" +
          "<div style='padding:0 14px 12px;'>" +
          r.itens.map(function (it) { return "<div class='kv'><span>" + esc(it.n) + "</span><span style='color:#9fb8a6'>" + esc(it.q) + " · " + it.k + " kcal</span></div>"; }).join("") +
          "<button class='refok off' data-refok='" + r.id + "' data-k='" + r.k + "' style='width:100%;margin-top:10px;'>Marcar como feita ✓</button></div></details>";
      }).join("") : "<div class='vz'>Sua dieta aparece aqui quando " + esc(studio === "Minha Nutri" ? "o nutricionista" : studio) + " montar.</div>") + "</div>" +
      "<div class='cardx'><h2>Registrar o que comi</h2>" +
      "<div class='vz' style='text-align:left;padding:0 0 8px;'>Comeu algo fora da dieta? Busque no banco (" + aldb.length + " alimentos) e registre — entra na contagem do dia.</div>" +
      "<input id='diBusca' list='dlApp' placeholder='O que você comeu?' style='width:100%;margin-bottom:8px;'>" +
      "<datalist id='dlApp'></datalist>" +
      "<div style='display:flex;gap:8px;'><input id='diQtd' type='number' min='0.5' step='0.5' value='1' style='width:90px;' title='porções'><button class='btnx' id='diAdd' style='flex:1;'>+ Registrar</button></div>" +
      "<button class='btnx' id='diCodigo' style='width:100%;margin-top:8px;background:#0e7490;'>Registrar por código de barras</button>" +
      "<div id='diLista' style='margin-top:10px;'></div></div>" +
      "<div class='cardx'><h2>Meu dia</h2><div class='kv'><span>Refeições da dieta feitas</span><b id='kcalRef'>0 kcal</b></div>" +
      "<div class='kv'><span>Diário (o que registrei)</span><b id='kcalDiario'>0 kcal</b></div>" +
      "<div class='kv'><span><b>Total consumido</b></span><b id='kcalDia' style='color:" + CORC + "'>0 kcal</b></div>" +
      "<div class='kv'><span>Meta do dia</span><span>" + alvo.alvo + " kcal</span></div>" +
      "<div class='kv'><span>Proteína · Carbo · Gordura</span><b id='macroDia'>0 · 0 · 0 g</b></div>" +
      "<div class='kv'><span>Alvo de macros</span><span>" + macrosApp.prot + " · " + macrosApp.carb + " · " + macrosApp.gord + " g</span></div></div>" +
      // avaliação física registrada na consulta (mesma leitura do app do aluno)
      "<div class='cardx'><h2>Minha avaliação física</h2><div id='avnBoxApp'></div></div>" +
      "<div class='cardx'><h2>Meu peso</h2>" +
      "<div style='display:flex;gap:8px;margin-bottom:10px;'><input id='pzKg' inputmode='decimal' placeholder='Peso de hoje (kg)' style='flex:1;min-width:0'><button class='btnx' id='pzAdd'>Registrar</button></div>" +
      "<div id='pzGraf' class='vz'>Registre o peso — a curva aparece aqui.</div></div>" +
      "<div class='cardx'><h2>Fotos de progresso</h2>" +
      "<div id='fotosBox' class='vz'>Tire a primeira foto — daqui a uns meses você vai agradecer.</div>" +
      "<label class='btnx' id='fotoBtn' style='display:block;text-align:center;margin-top:10px;'>Adicionar foto de hoje" +
      "<input id='fotoInput' type='file' accept='image/*' capture='user' style='display:none;'></label>" +
      "<div class='vz' style='font-size:11px;'>A primeira e a última foto vão pra ficha do seu nutricionista (só ele vê); as outras ficam só neste aparelho.</div></div>" +
      (pixAppN ? "<div class='cardx'><h2>Pagamento da consulta</h2>" +
        (pixAppN.v ? "<div class='vz' style='padding:0 0 8px;'>Valor: <b style='color:" + CORC + "'>R$ " + pixAppN.v.toFixed(2).replace(".", ",") + "</b></div>" : "") +
        (pixAppN.qr ? "<div style='text-align:center;'><img src='" + pixAppN.qr + "' style='width:170px;height:170px;image-rendering:pixelated;background:#fff;padding:7px;border-radius:12px;'></div>" : "") +
        "<textarea id='pixPac' rows='3' readonly style='width:100%;margin-top:8px;background:#0f1a12;border:1px solid #29402f;border-radius:9px;color:#9fb8a6;font-family:monospace;font-size:10px;padding:8px;'>" + pixAppN.code + "</textarea>" +
        "<button class='btnx' id='pixCopiaPac' style='width:100%;margin-top:8px;'>Copiar Pix copia e cola</button></div>" : "") +
      "<div class='cardx' id='cardNotif' style='display:none;'><h2>Lembretes</h2>" +
      "<div class='vz' style='text-align:left;padding:0 0 8px;'>Ative as notificações pra receber lembrete das consultas e recados por aqui.</div>" +
      "<button class='btnx' id='btnNotif' style='width:100%;'>Ativar notificações</button></div>" +
      "<div class='cardx'><h2>Agenda</h2>" +
      "<div id='agCal'></div><div id='agDia' style='margin-top:10px;'></div>" +
      "<div id='agForm' style='display:none;margin-top:10px;'>" +
      "<div style='display:flex;gap:8px;'><select id='agHora' style='flex:1;background:#0f1a12;border:1px solid #29402f;border-radius:10px;color:#fff;padding:11px;font-family:inherit;font-size:14px;'></select><button class='btnx' id='agPede'>Pedir horário</button></div>" +
      "<input id='agObs' placeholder='Observação (opcional)' style='width:100%;margin-top:8px;'></div>" +
      "<div class='vz' id='agNotaCal' style='font-size:11.5px;'>Toque num dia pra ver consultas ou pedir horário.</div></div>" +
      "<div class='cardx'><h2>Conquistas</h2>" +
      "<div id='nvCardN' style='margin-bottom:12px;'></div>" +
      "<div id='cqGrid' style='display:grid;grid-template-columns:repeat(3,1fr);gap:8px;'></div>" +
      "<div id='cqGraf' style='margin-top:14px;'></div>" +
      "<button class='btnx' id='btnCardStories' style='display:block;width:100%;text-align:center;margin-top:10px;'>Gerar card pro Stories</button></div>" +
      // Comunidade: o mesmo feed do app do aluno (o nutricionista liga nas Configurações)
      (feedLigadoN
        ? "<div class='cardx'><h2>Comunidade</h2>" +
          "<div class='vz' style='text-align:left;padding:0 0 10px;'>O mural do consultório: conte como foi a semana, poste a foto do prato e puxe a galera. " +
          "Só quem é paciente daqui vê — nada disso vai pra fora.</div>" +
          "<div id='fdRankN' style='margin-bottom:12px;'></div>" +
          "<div style='background:#0f1a12;border:1px solid #29402f;border-radius:14px;padding:10px;'>" +
          "<textarea id='fdTextoN' rows='2' maxlength='600' placeholder='Ex.: bati a meta de proteína a semana toda!' " +
          "style='width:100%;background:transparent;border:none;outline:none;color:inherit;font-family:inherit;font-size:14px;resize:vertical;'></textarea>" +
          "<div id='fdPrevN' style='display:none;margin:6px 0;position:relative;'>" +
          "<img id='fdPrevImgN' alt='foto que você vai publicar' style='width:100%;border-radius:10px;display:block;'>" +
          "<button id='fdTiraN' aria-label='Tirar a foto do post' style='position:absolute;top:6px;right:6px;background:rgba(0,0,0,.65);border:none;color:#fff;border-radius:99px;width:28px;height:28px;font-size:15px;cursor:pointer;font-family:inherit;'>✕</button></div>" +
          "<div style='display:flex;gap:8px;margin-top:6px;'>" +
          "<label class='btnx' style='flex:1;background:#16241b;border:1px solid #29402f;color:#9fb8a6;box-shadow:none;text-align:center;cursor:pointer;font-style:normal;'>Foto" +
          "<input id='fdFotoN' type='file' accept='image/*' style='display:none;'></label>" +
          "<button class='btnx' id='fdEnviaN' style='flex:2;'>Publicar</button></div>" +
          "<div id='fdStatusN' class='vz' style='font-size:12px;padding:6px 0 0;'></div></div>" +
          "<div id='fdListaN' style='margin-top:14px;'></div></div>"
        : "") +
      "<div class='cardx'><h2>Fale com " + esc(studio.split(" ")[0]) + "</h2>" +
      "<div id='chMsgs' style='max-height:300px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;margin-bottom:10px;'><div class='vz'>Carregando…</div></div>" +
      "<div id='botChips' style='display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;'></div>" +
      "<div style='display:flex;gap:8px;'><input id='chTexto' placeholder='Escreva aqui…' style='flex:1;min-width:0'>" +
      "<button class='btnx' id='chEnvia' aria-label='Enviar'><svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M4 12l16-8-6 16-2-6-8-2z'/></svg></button></div></div>" +
      (temNuvem ? "<div class='cardx'><h2>Meu login</h2>" +
        "<div class='vz' style='text-align:left;padding:0 0 8px;'>Crie login e senha para abrir seu app de qualquer aparelho (página Entrar do app).</div>" +
        "<input id='lgLogin' placeholder='Seu e-mail ou celular com DDD' style='width:100%;margin-bottom:8px;'>" +
        "<input id='lgSenha' type='password' placeholder='Senha (mínimo 6 caracteres)' style='width:100%;margin-bottom:8px;'>" +
        "<button class='btnx' id='lgSalva' style='width:100%;'>Salvar meu login</button><div id='lgOk' class='vz' style='display:none;'></div></div>" : "") +
      (zapN ? "<a class='btnx' style='display:block;text-align:center;text-decoration:none;background:" + COR2 + ";' href='https://wa.me/55" + String(zapN).replace(/\D/g, "") + "?text=" + encodeURIComponent("Oi! Sou " + p.nome + ", sobre minha dieta:") + "' target='_blank' rel='noopener'>Falar com " + esc(studio.split(" ")[0]) + "</a>" : "") +
      "<div class='vz'>Gerado em " + esc(fmtDataN(stamp)) + " · " + esc(studio) + "</div>" +
      // o menu já nasce montado no HTML (aparece até em visualizador sem JS); o script refina depois
      "<nav id='navAppN' aria-label='Menu do app' style='position:fixed;bottom:0;left:0;right:0;max-width:480px;margin:0 auto;background:rgba(15,26,18,.95);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-top:1px solid #29402f;display:flex;z-index:50;padding:6px 4px calc(6px + env(safe-area-inset-bottom,0px));'>" +
      [["<path d='M3 10 12 3l9 7'/><path d='M5 8.8V21h14V8.8'/><path d='M9.5 21v-6h5v6'/>", "Início"],
        ["<path d='M12 7c-1-2-3-3-5-2-3 1.2-3 6 0 9.6 1.8 2.2 3.6 3.4 5 3.4s3.2-1.2 5-3.4c3-3.6 3-8.4 0-9.6-2-1-4 0-5 2z'/><path d='M12 7c0-2 1.2-3.4 3-4'/>", "Dieta"],
        ["<polyline points='3 17 9 11 13 15 21 7'/><polyline points='15 7 21 7 21 13'/>", "Evolução"],
        ["<rect x='3' y='5' width='18' height='16' rx='2'/><path d='M16 3v4M8 3v4M3 11h18'/>", "Agenda"],
        ["<path d='M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'/>", "Chat"]].map(function (mN) {
        return "<button class='nitemn' style='flex:1;background:none;border:none;border-radius:11px;padding:7px 2px 5px;font-family:inherit;color:#8fa896;display:flex;flex-direction:column;align-items:center;gap:3px;'>" +
          "<svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'>" + mN[0] + "</svg>" +
          "<span style='font-size:9.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;'>" + mN[1] + "</span></button>";
      }).join("") +
      "</nav>" +
      "<script>var REFS=" + jsonApp(refs.map(function (r) { return { id: r.id, h: r.h, t: r.t, k: r.k, pt: r.pt, cb: r.cb, gd: r.gd }; })) +
      ",ALDB=" + jsonApp(aldb) +
      ",AGUAML=" + aguaMl + ",KCALMETA=" + alvo.alvo +
      ",NUVEM=" + jsonApp(temNuvem ? { u: nuvemCfg.u, k: nuvemCfg.k } : null) +
      ",TOKEN=" + jsonApp(p.appTokenN || "") +
      ",ZAPN=" + jsonApp(String(zapN || "").replace(/\D/g, "")) + ";" +
      "function L(k,f){try{return JSON.parse(localStorage.getItem(k))||f;}catch(e){return f;}}" +
      "function Sv(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}" +
      // ntplano (os dias de "Segui o plano hoje") também devolve: é o que o ranking da turma conta
      "if(k==='ntpeso'||k==='ntfotos'||k==='ntplano'||k.indexOf('ntdi_')===0||k.indexOf('ntref_')===0||k.indexOf('ntag_')===0)devolveApp();}" +
      "function isoDe(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}" +
      "function isoHj(){return isoDe(new Date());}window.__isoDeN=isoDe;" +
      "function rpcApp(fn,corpo){if(!NUVEM)return Promise.resolve(null);" +
      "return fetch(NUVEM.u+'/rest/v1/rpc/'+fn,{method:'POST',headers:{apikey:NUVEM.k,Authorization:'Bearer '+NUVEM.k,'Content-Type':'application/json'},body:JSON.stringify(corpo)}).then(function(r){return r.json();}).catch(function(){return null;});}" +
      // devolve pro nutricionista o que o paciente registra (peso, diário, refeições, água, fotos)
      "var devT=null;function devolveApp(){if(!NUVEM||!TOKEN)return;clearTimeout(devT);devT=setTimeout(function(){" +
      "var fs=L('ntfotos',[]);var pri=fs[0]||null;var ult=fs.length>1?fs[fs.length-1]:null;" +
      "var rf=L('ntref_'+isoHj(),{});var nrf=0;for(var kk in rf)nrf++;" +
      // celular novo/limpo: sem registro local não devolve nada (senão apagaria o histórico da nuvem)
      "if(!L('ntpeso',[]).length&&!L('ntdi_'+isoHj(),[]).length&&!nrf&&!L('ntag_'+isoHj(),0)&&!fs.length&&!Object.keys(L('ntplano',{})).length)return;" +
      "rpcApp('app_aluno_devolve',{t:TOKEN,p_dados:{nome:" + jsonApp(primeiro) + ",nivel:nivelDeN(xpDadosN()),peso:L('ntpeso',[]),diario:L('ntdi_'+isoHj(),[])," +
      // feitos = {dia: 1} dos "Segui o plano hoje": o MESMO nome que o app do aluno usa — a RPC
      // app_desafio_ranking conta as chaves de retorno->'feitos'; sem isso o ranking vinha vazio
      "refsFeitas:nrf,refsTotal:REFS.length,agua:L('ntag_'+isoHj(),0),aguaMeta:AGUAML,kcalMeta:KCALMETA,dia:isoHj(),feitos:L('ntplano',{})," +
      "fotoAntes:pri?pri.img:null,fotoAntesD:pri?pri.d:null,fotoDepois:ult?ult.img:null,fotoDepoisD:ult?ult.d:null," +
      "atualizado:new Date().toISOString()}});},1800);}" +
      "setTimeout(devolveApp,2500);" +
      // fotos de progresso (só no aparelho) — ANTES × AGORA
      "function pintaFotos(){var fs=L('ntfotos',[]);var box=document.getElementById('fotosBox');if(!fs.length)return;" +
      "var pri=fs[0],ult=fs[fs.length-1];box.className='';" +
      "box.innerHTML=\"<div style='display:flex;gap:10px;'>\"+" +
      "\"<div style='flex:1;text-align:center;'><div style='font-size:10.5px;color:#9fb8a6;letter-spacing:.1em;margin-bottom:4px;'>ANTES · \"+pri.d.slice(8,10)+'/'+pri.d.slice(5,7)+\"</div><img src='\"+pri.img+\"' style='width:100%;border-radius:12px;'></div>\"+" +
      "(fs.length>1?\"<div style='flex:1;text-align:center;'><div style='font-size:10.5px;color:#9fb8a6;letter-spacing:.1em;margin-bottom:4px;'>AGORA · \"+ult.d.slice(8,10)+'/'+ult.d.slice(5,7)+\"</div><img src='\"+ult.img+\"' style='width:100%;border-radius:12px;'></div>\":'')+\"</div>\"+" +
      "\"<div class='vz' style='font-size:11.5px;'>\"+fs.length+(fs.length===1?\" foto guardada\":\" fotos guardadas\")+\"</div>\";" +
      "var dias=Math.round((new Date()-new Date(ult.d))/864e5);" +
      "if(dias>=30)document.getElementById('fotoBtn').firstChild.textContent='Faz '+dias+' dias — hora da foto do mês! ';}" +
      "document.getElementById('fotoInput').addEventListener('change',function(){var f=this.files&&this.files[0];if(!f)return;" +
      "var img=new Image();var rd=new FileReader();rd.onload=function(){img.onload=function(){" +
      "var c=document.createElement('canvas');var esc2=480/Math.max(img.width,img.height);if(esc2>1)esc2=1;" +
      "c.width=Math.round(img.width*esc2);c.height=Math.round(img.height*esc2);" +
      "c.getContext('2d').drawImage(img,0,0,c.width,c.height);" +
      "var fs=L('ntfotos',[]);fs.push({d:isoHj(),img:c.toDataURL('image/jpeg',.68)});if(fs.length>12)fs.shift();" +
      "try{Sv('ntfotos',fs);}catch(e){alert('Memória de fotos cheia — apague fotos antigas do app.');return;}pintaFotos();};" +
      "img.src=rd.result;};rd.readAsDataURL(f);this.value='';});" +
      "pintaFotos();" +
      // pix copia e cola
      "var pcp=document.getElementById('pixCopiaPac');" +
      "if(pcp)pcp.addEventListener('click',function(){var t=document.getElementById('pixPac');t.select();" +
      "try{document.execCommand('copy');pcp.textContent='Copiado! Cola no app do banco.';}catch(e){}" +
      "setTimeout(function(){pcp.textContent='Copiar Pix copia e cola';},2200);});" +
      // notificações push (quando o app abre pelo link hospedado)
      "(function(){if(!NUVEM||!('Notification'in window))return;" +
      "var VP='BCF653mK3mhwGp4W3c4Wq9MlprvFVwcfBGKDBmxVRdaI_S3y-umX1w6z1MyJuR_-WiO3IthaYSaDF9XMtK1O66I';" +
      "function va(s){var pad=new Array((4-s.length%4)%4+1).join('=');var b=(s+pad).replace(/-/g,'+').replace(/_/g,'/');" +
      "var raw=atob(b);var arr=new Uint8Array(raw.length);for(var i=0;i<raw.length;i++)arr[i]=raw.charCodeAt(i);return arr;}" +
      "function tenta(){if(!('serviceWorker'in navigator)||!('PushManager'in window)||location.protocol!=='https:')return;" +
      "navigator.serviceWorker.register('app-sw.js').then(function(reg){" +
      "return reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:va(VP)});" +
      "}).then(function(sub){rpcApp('app_aluno_push',{t:TOKEN,p_sub:sub.toJSON()});}).catch(function(e){});}" +
      "if(Notification.permission==='granted'){tenta();return;}" +
      "if(Notification.permission!=='default')return;" +
      "var card=document.getElementById('cardNotif'),btn=document.getElementById('btnNotif');" +
      "if(card&&btn){card.style.display='block';btn.addEventListener('click',function(){" +
      "Notification.requestPermission().then(function(p2){card.style.display='none';if(p2==='granted')tenta();});});}})();" +
      // água
      "function pintaAgua(){var ml=L('ntag_'+isoHj(),0);var pct=Math.min(100,Math.round(ml*100/AGUAML));" +
      "document.getElementById('agFill').style.width=pct+'%';" +
      "document.getElementById('agTxt').innerHTML='<b style=\"color:#22d3ee\">'+ml+' ml</b> de '+AGUAML+' ml ('+pct+'%)';}" +
      "document.getElementById('agAdd').addEventListener('click',function(){Sv('ntag_'+isoHj(),L('ntag_'+isoHj(),0)+250);pintaAgua();pintaXPN();" +
      "if(navigator.vibrate)navigator.vibrate(60);});pintaAgua();" +
      // lembretes de água (notificação local com o app aberto)
      // no Chrome do Android construir Notification na página lança "Illegal
      // constructor": o caminho certo é showNotification do service worker (o app
      // registra app-sw.js). Sem SW (computador) cai no construtor, dentro de try.
      "function agNotif(){var ml=L('ntag_'+isoHj(),0);if(ml>=AGUAML)return;var o={body:'Já foram '+ml+' ml de '+AGUAML+' ml hoje. Bora um copo?'};" +
      "function crua(){try{new Notification('Hora da água!',o);}catch(e){}}" +
      "try{if(navigator.serviceWorker&&navigator.serviceWorker.getRegistration){navigator.serviceWorker.getRegistration().then(function(reg){if(reg&&reg.showNotification)return reg.showNotification('Hora da água!',o);crua();}).catch(crua);return;}}catch(e){}crua();}" +
      "var agTimer=null;document.getElementById('agLembrete').addEventListener('click',function(){var b=this;" +
      "if(!('Notification' in window)){alert('Este navegador não permite notificações — deixa o app aberto que a barra de água te lembra.');return;}" +
      "Notification.requestPermission().then(function(perm){if(perm!=='granted'){alert('Permissão negada — ative nas configurações do navegador.');return;}" +
      "b.textContent='Lembretes ligados (a cada hora)';b.disabled=true;Sv('ntlembra',1);" +
      "agTimer=setInterval(agNotif,3600000);});});" +
      "if(L('ntlembra',0)&&('Notification' in window)&&Notification.permission==='granted'){document.getElementById('agLembrete').textContent='Lembretes ligados (a cada hora)';document.getElementById('agLembrete').disabled=true;" +
      "agTimer=setInterval(agNotif,3600000);}" +
      // diário alimentar (registrar o que comeu — MyFitnessPal style)
      "document.getElementById('dlApp').innerHTML=ALDB.map(function(a){return \"<option value='\"+a.n.replace(/'/g,'&#39;')+\"'>\"+a.p+' · '+a.k+' kcal</option>';}).join('');" +
      "function kcalDiario(){return L('ntdi_'+isoHj(),[]).reduce(function(t,x){return t+x.k;},0);}" +
      "function pintaDiario(){var l=L('ntdi_'+isoHj(),[]);var el=document.getElementById('diLista');" +
      "el.innerHTML=l.length?l.map(function(x,i){return \"<div class='kv'><span>\"+x.n+' ('+String(x.q).replace('.',',')+'x)</span><span>'+x.k+\" kcal <button data-dirm='\"+i+\"' aria-label='Apagar o item do diário' style='background:none;border:none;color:#f87171;cursor:pointer;font-size:14px;'>✕</button></span></div>\";}).join(''):'';" +
      "document.getElementById('kcalDiario').textContent=kcalDiario()+' kcal';pintaRefs();}" +
      "document.getElementById('diAdd').addEventListener('click',function(){var nome=document.getElementById('diBusca').value.trim();" +
      "var al=ALDB.filter(function(a){return a.n.toLowerCase()===nome.toLowerCase();})[0];" +
      "if(!al){alert('Digite e escolha um alimento da lista de sugestões.');return;}" +
      "var q=+document.getElementById('diQtd').value||1;var l=L('ntdi_'+isoHj(),[]);" +
      "l.push({n:al.n,q:q,k:Math.round(al.k*q),pt:Math.round((al.pt||0)*q),cb:Math.round((al.cb||0)*q),gd:Math.round((al.gd||0)*q)});Sv('ntdi_'+isoHj(),l);" +
      "document.getElementById('diBusca').value='';document.getElementById('diQtd').value='1';pintaDiario();pintaXPN();});" +
      "document.getElementById('diLista').addEventListener('click',function(e){var i=e.target.getAttribute&&e.target.getAttribute('data-dirm');if(i==null)return;" +
      "var l=L('ntdi_'+isoHj(),[]);l.splice(+i,1);Sv('ntdi_'+isoHj(),l);pintaDiario();pintaXPN();});" +
      "document.getElementById('diCodigo').addEventListener('click',function(){var cod=prompt('Digite o código de barras do produto (os números embaixo das barrinhas):');" +
      "if(!cod)return;cod=cod.replace(/\\D/g,'');if(cod.length<8){alert('Código inválido.');return;}" +
      "fetch('https://world.openfoodfacts.org/api/v2/product/'+cod+'.json').then(function(r){return r.json();}).then(function(d){" +
      "if(!d||d.status!==1||!d.product){alert('Produto não encontrado — registra pela busca mesmo.');return;}" +
      "var nut=d.product.nutriments||{};var k=Math.round(+nut['energy-kcal_100g']||(+nut.energy_100g||0)/4.184);" +
      // os mesmos campos que o painel lê do Open Food Facts (proteins/carbohydrates/fat _100g)
      "var pt=Math.round(+nut.proteins_100g||0),cb=Math.round(+nut.carbohydrates_100g||0),gd=Math.round(+nut.fat_100g||0);" +
      "var nome=d.product.product_name_pt||d.product.product_name||('Produto '+cod);" +
      "if(!k){alert('Achei \\''+nome+'\\' mas sem kcal no rótulo.');return;}" +
      "var l=L('ntdi_'+isoHj(),[]);l.push({n:nome+' (100 g)',q:1,k:k,pt:pt,cb:cb,gd:gd});Sv('ntdi_'+isoHj(),l);pintaDiario();pintaXPN();" +
      "}).catch(function(){alert('Precisa de internet pra buscar o código — registra pela busca.');});});" +
      // refeições feitas + kcal do dia + próxima
      "function pintaRefs(){var f=L('ntref_'+isoHj(),{});var kc=0,n=0;" +
      "document.querySelectorAll('[data-refok]').forEach(function(b){var ok=!!f[b.dataset.refok];b.classList.toggle('off',!ok);b.textContent=ok?'✓ Feita!':'Marcar como feita ✓';if(ok){kc+=+b.dataset.k;n++;}});" +
      "document.getElementById('kcalRef').textContent=kc+' kcal';" +
      "document.getElementById('kcalDia').textContent=(kc+kcalDiario())+' kcal';" +
      "var mp=0,mc=0,mg=0;REFS.forEach(function(r){if(f[r.id]){mp+=r.pt||0;mc+=r.cb||0;mg+=r.gd||0;}});" +
      "L('ntdi_'+isoHj(),[]).forEach(function(x){mp+=x.pt||0;mc+=x.cb||0;mg+=x.gd||0;});" +
      "var mdEl=document.getElementById('macroDia');if(mdEl)mdEl.textContent=Math.round(mp)+' · '+Math.round(mc)+' · '+Math.round(mg)+' g';" +
      "document.getElementById('refProg').innerHTML=REFS.length?('<b style=\"color:" + CORC + "\">'+n+' de '+REFS.length+'</b> refeições feitas hoje'+(n===REFS.length&&REFS.length?' — dia perfeito!':'')):'';" +
      "var ag=new Date();var hm=('0'+ag.getHours()).slice(-2)+':'+('0'+ag.getMinutes()).slice(-2);" +
      "var prox=REFS.filter(function(r){return r.h>=hm&&!f[r.id];})[0]||REFS.filter(function(r){return !f[r.id];})[0];" +
      "document.getElementById('proxRef').textContent=prox?(prox.h+' — '+prox.t+' ('+prox.k+' kcal)'):(REFS.length?'Todas as refeições de hoje feitas!':'Sem dieta ainda.');}" +
      "document.addEventListener('click',function(e){var b=e.target.closest('[data-refok]');if(!b)return;" +
      "var f=L('ntref_'+isoHj(),{});if(f[b.dataset.refok])delete f[b.dataset.refok];else f[b.dataset.refok]=1;Sv('ntref_'+isoHj(),f);pintaRefs();});pintaRefs();pintaDiario();" +
      // peso
      "function pintaPz(){var l=L('ntpeso',[]);if(!l.length)return;var el=document.getElementById('pzGraf');" +
      "el.innerHTML=l.slice(-10).map(function(x){return \"<div class='kv'><span>\"+x.d.split('-').reverse().slice(0,2).join('/')+\"</span><b>\"+String(x.kg).replace('.',',')+\" kg</b></div>\";}).join('');}" +
      "document.getElementById('pzAdd').addEventListener('click',function(){var kg=parseFloat(document.getElementById('pzKg').value.replace(',','.'));if(!kg)return;" +
      "var l=L('ntpeso',[]);l.push({d:isoHj(),kg:kg});if(l.length>90)l.shift();Sv('ntpeso',l);document.getElementById('pzKg').value='';pintaPz();pintaXPN();});pintaPz();" +
      // login e senha do aluno
      "var lgB=document.getElementById('lgSalva');if(lgB)lgB.addEventListener('click',function(){" +
      "var lg=document.getElementById('lgLogin').value.trim(),sn=document.getElementById('lgSenha').value;" +
      "if(lg.length<5||sn.length<6){alert('Preencha o login (e-mail ou celular) e uma senha de 6+ caracteres.');return;}" +
      "var b=this;b.disabled=true;rpcApp('aluno_define_login',{t:TOKEN,p_login:lg,p_senha:sn}).then(function(r){b.disabled=false;" +
      "if(r&&r.ok){var ok2=document.getElementById('lgOk');ok2.style.display='block';ok2.textContent='Pronto! Agora você entra de qualquer aparelho com '+r.login+' + sua senha.';document.getElementById('lgSenha').value='';}" +
      "else{alert((r&&r.erro)||'Não deu agora — tenta de novo.');}});});" +
      // agenda estilo calendário (pede consulta pela nuvem)
      "var AGSEL=null,AGMES=new Date();AGMES.setDate(1);" +
      "var MESES=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];" +
      "function agDados(){return L('ntagenda',[]);}" +
      "function carregaAgenda(){if(!NUVEM){pintaCal();return;}rpcApp('app_agenda_lista',{t:TOKEN}).then(function(l){if(Array.isArray(l)){Sv('ntagenda',l);}pintaCal();});}" +
      "function pintaCal(){var el=document.getElementById('agCal');var l=agDados();var y=AGMES.getFullYear(),m=AGMES.getMonth();" +
      "var ini=(new Date(y,m,1).getDay()+6)%7;var nd=new Date(y,m+1,0).getDate();" +
      "var pontos={};l.forEach(function(x){pontos[x.dia]=x.status==='confirmado'?'confirmado':(pontos[x.dia]||x.status);});" +
      "var h=\"<div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;'><button id='agAnt' aria-label='Mês anterior' style='background:#0f1a12;border:1px solid #29402f;color:#fff;border-radius:8px;padding:4px 12px;cursor:pointer;font-size:15px;'>‹</button><b style='font-size:14px;'>\"+MESES[m]+' '+y+\"</b><button id='agProx' aria-label='Próximo mês' style='background:#0f1a12;border:1px solid #29402f;color:#fff;border-radius:8px;padding:4px 12px;cursor:pointer;font-size:15px;'>›</button></div>\";" +
      "h+=\"<div style='display:grid;grid-template-columns:repeat(7,1fr);gap:3px;text-align:center;font-size:10px;color:#5d7a66;margin-bottom:4px;'>\"+['S','T','Q','Q','S','S','D'].map(function(x){return '<div>'+x+'</div>';}).join('')+'</div>';" +
      "h+=\"<div style='display:grid;grid-template-columns:repeat(7,1fr);gap:3px;'>\";" +
      "for(var i=0;i<ini;i++)h+='<div></div>';" +
      "for(var d2=1;d2<=nd;d2++){var iso=y+'-'+('0'+(m+1)).slice(-2)+'-'+('0'+d2).slice(-2);var st2=pontos[iso];var hoje2=iso===isoHj();" +
      "h+=\"<div data-agdia='\"+iso+\"' style='aspect-ratio:1;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:9px;cursor:pointer;font-size:12.5px;font-weight:600;\"+(AGSEL===iso?'background:linear-gradient(135deg," + COR + "," + CORG2 + ");color:#fff;':(hoje2?'border:1px solid " + CORL + ";color:#fff;':'background:#0f1a12;border:1px solid #1f3126;color:#d7e8dc;'))+\"'>\"+d2+" +
      "(st2?\"<span style='width:5px;height:5px;border-radius:50%;margin-top:2px;background:\"+(st2==='confirmado'?'#4ade80':st2==='pedido'?'#fbbf24':'#f87171')+\";'></span>\":\"<span style='height:7px;'></span>\")+'</div>';}" +
      "h+='</div>';el.innerHTML=h;" +
      "document.getElementById('agAnt').onclick=function(){AGMES.setMonth(AGMES.getMonth()-1);pintaCal();};" +
      "document.getElementById('agProx').onclick=function(){AGMES.setMonth(AGMES.getMonth()+1);pintaCal();};pintaDia();}" +
      "function pintaDia(){var box=document.getElementById('agDia');var form=document.getElementById('agForm');" +
      "if(!AGSEL){box.innerHTML='';form.style.display='none';return;}" +
      "var l=agDados().filter(function(x){return x.dia===AGSEL;});var pd=AGSEL.split('-');" +
      "box.innerHTML=\"<div style='font-size:13px;font-weight:800;margin-bottom:6px;'>\"+pd[2]+'/'+pd[1]+\"</div>\"+(l.length?l.map(function(x){" +
      "var cor=x.status==='confirmado'?'#4ade80':x.status==='pedido'?'#fbbf24':'#f87171';" +
      "var rot=x.status==='confirmado'?'confirmada':x.status==='pedido'?'aguardando':'não deu';" +
      "return \"<div class='kv'><span>\"+(x.hora||'horário a combinar')+(x.obs?\" · <small style='color:#9fb8a6'>\"+String(x.obs).replace(/</g,'&lt;')+'</small>':'')+\"</span><span><b style='color:\"+cor+\"'>\"+rot+'</b>'+(x.status==='confirmado'?\" <button data-agics='\"+x.dia+'|'+(x.hora||'')+\"' title='Salvar no calendário' style='background:" + CORD + ";border:1px solid " + COR + ";color:" + CORB + ";border-radius:8px;padding:3px 8px;cursor:pointer;font-size:12px;'><svg width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true' style='display:block;'><rect x='3' y='5' width='18' height='16' rx='2'/><path d='M16 3v4M8 3v4M3 11h18'/></svg></button>\":'')+'</span></div>';}).join(''):\"<div class='vz'>Nada marcado nesse dia.</div>\");" +
      "form.style.display=AGSEL>=isoHj()?'block':'none';}" +
      "(function(){var hs='';for(var hh=6;hh<=21;hh++){['00','30'].forEach(function(mm){hs+='<option>'+('0'+hh).slice(-2)+':'+mm+'</option>';});}document.getElementById('agHora').innerHTML=hs;})();" +
      "document.getElementById('agCal').addEventListener('click',function(e){var d3=e.target.closest('[data-agdia]');if(d3){AGSEL=d3.getAttribute('data-agdia');pintaCal();}});" +
      // salvar horário confirmado no calendário do celular (.ics)
      "var AGTIT=" + jsonApp("Consulta com " + studio.split(" ")[0] + " (TORQUE NUTRI)") + ";" +
      "document.getElementById('agDia').addEventListener('click',function(e){var d9=e.target.getAttribute&&e.target.getAttribute('data-agics');if(!d9)return;" +
      "var p9=d9.split('|');var h9=p9[1]||'08:00';var i9=p9[0].replace(/-/g,'')+'T'+h9.replace(':','')+'00';" +
      "var f9=new Date(p9[0]+'T'+h9+':00');f9.setMinutes(f9.getMinutes()+60);var p2=function(n){return('0'+n).slice(-2);};" +
      "var s9=f9.getFullYear()+p2(f9.getMonth()+1)+p2(f9.getDate())+'T'+p2(f9.getHours())+p2(f9.getMinutes())+'00';" +
      "var ics='BEGIN:VCALENDAR\\r\\nVERSION:2.0\\r\\nPRODID:-//TORQUE ON//App//PT-BR\\r\\nBEGIN:VEVENT\\r\\nUID:'+Date.now()+'@torqueon.com.br\\r\\nDTSTART:'+i9+'\\r\\nDTEND:'+s9+'\\r\\nSUMMARY:'+AGTIT+'\\r\\nEND:VEVENT\\r\\nEND:VCALENDAR';" +
      "var b9=new Blob([ics],{type:'text/calendar'});var a9=document.createElement('a');a9.href=URL.createObjectURL(b9);a9.download='consulta.ics';document.body.appendChild(a9);a9.click();setTimeout(function(){URL.revokeObjectURL(a9.href);a9.remove();},800);});" +
      "document.getElementById('agPede').addEventListener('click',function(){if(!AGSEL)return;var hr=document.getElementById('agHora').value;var ob=document.getElementById('agObs').value.trim();" +
      "if(NUVEM){var btn=this;btn.disabled=true;rpcApp('app_agenda_pede',{t:TOKEN,p_dia:AGSEL,p_hora:hr,p_obs:ob}).then(function(r){btn.disabled=false;" +
      "if(r&&r.ok){var l=L('ntagenda',[]);l.push({dia:AGSEL,hora:hr,status:'pedido',obs:ob});Sv('ntagenda',l);document.getElementById('agObs').value='';pintaCal();" +
      "alert('Pedido enviado! Aguarde a confirmação da consulta.');}else{alert((r&&r.erro==='muitos_pedidos')?'Você já tem muitos pedidos aguardando — espere a confirmação.':'Não deu pra enviar agora — tenta de novo.');}});}" +
      "else{var pd=AGSEL.split('-');window.open('https://wa.me/'+(ZAPN?'55'+ZAPN:'')+'?text='+encodeURIComponent('Oi! Queria marcar consulta dia '+pd[2]+'/'+pd[1]+' às '+hr+(ob?' — '+ob:'')),'_blank');}});" +
      "carregaAgenda();" +
      // conquistas: medalhas + gráfico de adesão
      "function diasCom(pf){var o={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&k.indexOf(pf)===0)o[k.slice(pf.length)]=1;}return o;}" +
      "function seqMax(m){var ks=Object.keys(m).sort();var mx=0,seq=0,ant=null;ks.forEach(function(k){" +
      "if(ant){var dif=(new Date(k)-new Date(ant))/864e5;seq=dif===1?seq+1:1;}else seq=1;if(seq>mx)mx=seq;ant=k;});return mx;}" +
      "function pintaConquistas(){var ativos={};[diasCom('ntref_'),diasCom('ntag_'),diasCom('ntdi_')].forEach(function(o){Object.keys(o).forEach(function(k){ativos[k]=1;});});" +
      "var nAtivos=Object.keys(ativos).length;var seq=seqMax(ativos);" +
      "var perf=0;Object.keys(diasCom('ntref_')).forEach(function(d6){var f=L('ntref_'+d6,{});if(REFS.length&&Object.keys(f).length>=REFS.length)perf++;});" +
      "var aguaOk=0;Object.keys(diasCom('ntag_')).forEach(function(d7){if(L('ntag_'+d7,0)>=AGUAML)aguaOk++;});" +
      "var pesagens=L('ntpeso',[]).length;" +
      "function icq(p){return \"<svg width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'>\"+p+'</svg>';}" +
      "var BADGES=[[\"<path d='M5 21V4M5 4h12l-2.5 4L17 12H5'/>\",'Primeiro dia',nAtivos,1],[\"<rect x='3' y='5' width='18' height='16' rx='2'/><path d='M16 3v4M8 3v4M3 11h18'/><path d='m9 16 2 2 4-4'/>\",'Dia perfeito',perf,1],[\"<path d='M13 3 5 13h6l-1 8 8-10h-6z'/>\",'3 dias seguidos',seq,3],[\"<path d='m12 3 2.7 5.7 6.3.8-4.6 4.3 1.2 6.2-5.6-3-5.6 3 1.2-6.2L3 9.5l6.3-.8z'/>\",'7 dias seguidos',seq,7],[\"<path d='M12 3s6 6.3 6 10.5a6 6 0 0 1-12 0C6 9.3 12 3 12 3z'/>\",'7 dias de água',aguaOk,7],[\"<path d='M4 20c0-8 4-14 16-16-1 12-7 16-13 16'/><path d='M4 20c2-5 6-9 12-12'/>\",'30 dias ativos',nAtivos,30],[\"<polyline points='3 7 9 13 13 9 21 17'/><polyline points='15 17 21 17 21 11'/>\",'10 pesagens',pesagens,10],[\"<path d='M8 21h8M12 17v4M6 3h12v5a6 6 0 0 1-12 0z'/><path d='M6 5H3c0 3 1.5 4.5 3 4.5M18 5h3c0 3-1.5 4.5-3 4.5'/>\",'7 dias perfeitos',perf,7],[\"<path d='M6 4h12l3 5-9 11L3 9zM3 9h18'/>\",'30 dias perfeitos',perf,30]];" +
      "document.getElementById('cqGrid').innerHTML=BADGES.map(function(b){var tem=b[2]>=b[3];" +
      "return \"<div style='text-align:center;padding:10px 4px;border-radius:11px;\"+(tem?'background:" + CORA + ";border:1px solid " + COR + ";':'background:#0f1a12;border:1px solid #1f3126;opacity:.55;')+\"'>\"+" +
      "\"<div style='line-height:0;padding:3px 0;color:\"+(tem?'" + CORL + "':'#5d7a66')+\";'>\"+icq(b[0])+\"</div><div style='font-size:10.5px;font-weight:700;margin-top:3px;line-height:1.25;'>\"+b[1]+'</div>'+" +
      "(tem?\"<div style='font-size:9.5px;color:#4ade80;font-weight:800;margin-top:2px;'>CONQUISTADA</div>\":\"<div style='font-size:9.5px;color:#5d7a66;margin-top:2px;'>\"+Math.min(b[2],b[3])+'/'+b[3]+'</div>')+'</div>';}).join('');" +
      "var bars='';var ds=[];for(var v2=13;v2>=0;v2--){var d8=new Date();d8.setDate(d8.getDate()-v2);var iso8=isoDe(d8);" +
      "var f8=L('ntref_'+iso8,{});var pct8=REFS.length?Math.min(100,Math.round(100*Object.keys(f8).length/REFS.length)):0;ds.push({d:d8,p:pct8,agua:L('ntag_'+iso8,0)>=AGUAML});}" +
      "bars=\"<div style='font-size:11px;color:#9fb8a6;margin-bottom:6px;'>Adesão à dieta (últimos 14 dias)</div><div style='display:flex;gap:4px;align-items:flex-end;height:80px;'>\"+ds.map(function(s8){" +
      "var hh8=Math.round(52*s8.p/100);" +
      "return \"<div style='flex:1;text-align:center;'><div style='height:\"+(52-hh8)+\"px;'></div><div style='height:\"+hh8+\"px;background:\"+(s8.p>=100?'linear-gradient(180deg," + CORL + "," + COR + ")':'#2b4433')+\";border-radius:3px 3px 0 0;min-height:2px;'></div>\"+" +
      "\"<div style='font-size:8px;margin-top:3px;color:\"+(s8.agua?'#22d3ee':'#3d5a47')+\";'>\"+('0'+s8.d.getDate()).slice(-2)+'</div></div>';}).join('')+'</div>'+" +
      "\"<div class='vz' style='font-size:10px;'>barra cheia = todas as refeições · número azul = água na meta</div>\";" +
      "document.getElementById('cqGraf').innerHTML=bars;}" +
      "pintaConquistas();document.addEventListener('click',function(e){if(e.target.closest('[data-refok]')||e.target.id==='agAdd'||e.target.id==='pzAdd')setTimeout(pintaConquistas,150);});" +
      // card de conquista pro Stories (canvas 1080×1080 verde com a marca do consultório)
      "var STUDION=" + jsonApp(studio) + ",PRIMEIRON=" + jsonApp(primeiro) + ";" +
      "document.getElementById('btnCardStories').addEventListener('click',function(){" +
      "var ativos={};[diasCom('ntref_'),diasCom('ntag_'),diasCom('ntdi_')].forEach(function(o){Object.keys(o).forEach(function(k){ativos[k]=1;});});" +
      "var nAtivos=Object.keys(ativos).length;var seq=seqMax(ativos);var pesagens=L('ntpeso',[]).length;" +
      "var c=document.createElement('canvas');c.width=1080;c.height=1080;var g=c.getContext('2d');" +
      "var gr=g.createLinearGradient(0,0,1080,1080);gr.addColorStop(0,'#0f1a12');gr.addColorStop(1,'#14532d');g.fillStyle=gr;g.fillRect(0,0,1080,1080);" +
      "g.fillStyle='" + CORC + "';g.font='700 42px system-ui,sans-serif';g.textAlign='center';g.fillText(STUDION.toUpperCase().slice(0,30),540,150);" +
      "g.fillStyle='#fff';g.font='800 84px system-ui,sans-serif';" +
      "g.fillText(nAtivos>0?nAtivos+(nAtivos===1?' dia firme!':' dias firmes!'):'Começando hoje!',540,380);" +
      "g.font='600 52px system-ui,sans-serif';g.fillStyle='#dcfce7';" +
      "g.fillText(nAtivos+' dias cuidando da dieta',540,560);" +
      "g.fillText('melhor sequência: '+seq+(seq===1?' dia':' dias'),540,655);" +
      "if(pesagens)g.fillText(pesagens+(pesagens===1?' pesagem':' pesagens'),540,750);" +
      "g.fillStyle='" + CORC + "';g.font='700 34px system-ui,sans-serif';g.fillText(PRIMEIRON+' · TORQUE NUTRI',540,990);" +
      "c.toBlob(function(bl){var fl=new File([bl],'conquista.png',{type:'image/png'});" +
      "if(navigator.canShare&&navigator.canShare({files:[fl]})){navigator.share({files:[fl]}).catch(function(){});}" +
      "else{var a2=document.createElement('a');a2.href=c.toDataURL('image/png');a2.download='conquista.png';a2.click();}});});" +
      // chat paciente ↔ nutricionista (+ robô de atendimento)
      "var BOT=" + jsonApp(botApp) + ";" +
      "function botHist(){return L('ntbotmsgs',[]);}" +
      "function botFala(tx){var h=botHist();h.push({de:'bot',texto:tx,criado:new Date().toISOString()});if(h.length>60)h.shift();Sv('ntbotmsgs',h);}" +
      "function pintaChat(msgs){var el=document.getElementById('chMsgs');var all=(msgs||[]).concat(botHist());" +
      "all.sort(function(a,b){return String(a.criado)<String(b.criado)?-1:1;});" +
      "if(!all.length){el.innerHTML=\"<div class='vz'>Manda a primeira mensagem!</div>\";return;}" +
      "el.innerHTML=all.map(function(m){var minha=m.de==='aluno'||m.de==='aluno-local';var bot=m.de==='bot';" +
      "return \"<div style='align-self:\"+(minha?'flex-end':'flex-start')+\";background:\"+(minha?'linear-gradient(135deg," + COR + "," + COR2 + ")':(bot?'" + CORD + "':'#101c14'))+\";border:1px solid \"+(bot?'" + COR + "':'#29402f')+\";border-radius:12px;padding:8px 12px;max-width:82%;font-size:13.5px;'>\"+(bot?\"<div style='font-size:10px;color:" + CORL + ";font-weight:800;margin-bottom:2px;'>assistente</div>\":'')+String(m.texto).replace(/</g,'&lt;')+\"<div style='font-size:10px;opacity:.6;margin-top:2px;'>\"+String(m.criado).slice(11,16)+\"</div></div>\";}).join('');" +
      "el.scrollTop=el.scrollHeight;}" +
      "function carregaChat(){if(!NUVEM){pintaChat(L('ntchat',[]));return;}" +
      "rpcApp('app_chat_lista',{t:TOKEN}).then(function(l){if(Array.isArray(l)){Sv('ntchat',l);pintaChat(l);}else{pintaChat(L('ntchat',[]));}});}" +
      "function pintaChips(){var el=document.getElementById('botChips');if(!BOT){el.style.display='none';return;}" +
      "el.innerHTML=BOT.ops.map(function(o,i){return \"<button data-bop='\"+i+\"' style='background:" + CORD + ";border:1px solid " + COR + ";color:" + CORB + ";border-radius:99px;padding:6px 13px;font-size:12px;font-family:inherit;cursor:pointer;'>\"+String(o.r).replace(/</g,'&lt;')+\"</button>\";}).join('');}" +
      "function botEscolhe(i){var o=BOT&&BOT.ops[i];if(!o)return;var h=botHist();h.push({de:'aluno-local',texto:o.r,criado:new Date().toISOString()});Sv('ntbotmsgs',h);" +
      "pintaChat(L('ntchat',[]));setTimeout(function(){botFala(o.t);pintaChat(L('ntchat',[]));},250);}" +
      "document.getElementById('botChips').addEventListener('click',function(e){var b=e.target.closest('[data-bop]');if(b)botEscolhe(+b.dataset.bop);});" +
      "if(BOT&&!botHist().length)botFala(BOT.oi);pintaChips();pintaChat(L('ntchat',[]));" +
      "document.getElementById('chEnvia').addEventListener('click',function(){" +
      "var inp=document.getElementById('chTexto');var tx=inp.value.trim();if(!tx)return;" +
      "if(BOT&&/^[0-9]{1,2}$/.test(tx)&&+tx>=1&&+tx<=BOT.ops.length){inp.value='';botEscolhe(+tx-1);return;}" +
      "if(NUVEM){var btn=this;btn.disabled=true;rpcApp('app_chat_envia',{t:TOKEN,p_texto:tx}).then(function(r){btn.disabled=false;" +
      "if(r&&r.ok){inp.value='';carregaChat();}else{alert('Não deu pra enviar agora — tenta de novo.');}});}" +
      "else{window.open('https://wa.me/'+(ZAPN?'55'+ZAPN:'')+'?text='+encodeURIComponent(tx),'_blank');inp.value='';}});" +
      "document.getElementById('chTexto').addEventListener('keydown',function(e){if(e.key==='Enter')document.getElementById('chEnvia').click();});" +
      "carregaChat();setInterval(function(){if(NUVEM)carregaChat();},30000);" +
      // menu fixo embaixo (paridade com o app do aluno do Personal): 5 áreas
      "var MENUN=[" +
      "['inicio',\"<path d='M3 10 12 3l9 7'/><path d='M5 8.8V21h14V8.8'/><path d='M9.5 21v-6h5v6'/>\",'In\\u00edcio']," +
      "['dieta',\"<path d='M12 7c-1-2-3-3-5-2-3 1.2-3 6 0 9.6 1.8 2.2 3.6 3.4 5 3.4s3.2-1.2 5-3.4c3-3.6 3-8.4 0-9.6-2-1-4 0-5 2z'/><path d='M12 7c0-2 1.2-3.4 3-4'/>\",'Dieta']," +
      "['evolucao',\"<polyline points='3 17 9 11 13 15 21 7'/><polyline points='15 7 21 7 21 13'/>\",'Evolu\\u00e7\\u00e3o']," +
      (feedLigadoN
        ? "['feed',\"<circle cx='9' cy='8' r='3.4'/><path d='M2.8 20c0-3.4 2.8-6.2 6.2-6.2s6.2 2.8 6.2 6.2'/><path d='M16 5.2a3.4 3.4 0 0 1 0 6.4M17.5 14.2c2 1.1 3.4 3.2 3.4 5.8'/>\",'Turma'],"
        : "['agenda',\"<rect x='3' y='5' width='18' height='16' rx='2'/><path d='M16 3v4M8 3v4M3 11h18'/>\",'Agenda'],") +
      "['chat',\"<path d='M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'/>\",'Chat']];" +
      "function secDeN(el){var h=el.querySelector&&el.querySelector('h2');var t=(h?h.textContent:'')||'';" +
      "if(/Minhas refei\\u00e7\\u00f5es|Registrar o que comi|Meu dia|\\u00c1gua de hoje/.test(t))return 'dieta';" +
      "if(/Meu peso|Fotos de progresso|Conquistas|Minha avalia\\u00e7\\u00e3o/.test(t))return 'evolucao';" +
      "if(/Comunidade/.test(t))return 'feed';" +
      "if(/Agenda|Pagamento/.test(t))return 'agenda';" +
      "if(/Fale com/.test(t))return 'chat';return 'inicio';}" +
      "document.querySelectorAll('body > .cardx').forEach(function(el){el.setAttribute('data-secn',secDeN(el));});" +
      // sem a aba Agenda na barra (quando a Turma entra), os cards dela vão pro Início
      (feedLigadoN ? "document.querySelectorAll(\"[data-secn='agenda']\").forEach(function(el){el.setAttribute('data-secn','inicio');});" : "") +
      // o título da seção acompanha a navegação, como no app do aluno
      "var ROTN={inicio:'In\\u00edcio',dieta:'Dieta',evolucao:'Evolu\\u00e7\\u00e3o',agenda:'Agenda',chat:'Chat',feed:'Turma'};" +
      "var navN=document.getElementById('navAppN');" +
      "navN.innerHTML=MENUN.map(function(m){return \"<button class='nitemn' data-msecn='\"+m[0]+\"' style='flex:1;background:none;border:none;border-radius:11px;padding:7px 2px 5px;cursor:pointer;font-family:inherit;color:#8fa896;display:flex;flex-direction:column;align-items:center;gap:3px;'>\"+" +
      "\"<svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'>\"+m[1]+\"</svg>\"+" +
      "\"<span style='font-size:9.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;'>\"+m[2]+'</span></button>';}).join('');" +
      "function trocaSecN(s){document.querySelectorAll('[data-secn]').forEach(function(el){" +
      "if(el.getAttribute('data-secn')===s)el.removeAttribute('data-secn-off');else el.setAttribute('data-secn-off','1');});" +
      "document.querySelectorAll('.nitemn').forEach(function(mi){var on=mi.getAttribute('data-msecn')===s;" +
      "mi.style.background=on?'" + CORA + "':'none';mi.style.color=on?'" + CORC + "':'#8fa896';});" +
      "var stn=document.getElementById('secTitN');if(stn)stn.textContent=ROTN[s]||'';" +
      "window.SECN=s;window.scrollTo(0,0);}" +
      "navN.addEventListener('click',function(e){var mi=e.target.closest('.nitemn');if(!mi)return;" +
      "if(navigator.vibrate)navigator.vibrate(8);trocaSecN(mi.getAttribute('data-msecn'));});" +
      "window.__trocaSecN=trocaSecN;trocaSecN('inicio');" +
      // ---------- avaliação física no app: o que mudou da primeira consulta até a última ----------
      "var AVSN=" + jsonApp(avsN) + ";" +
      "(function(){var el=document.getElementById('avnBoxApp');if(!el)return;" +
      "if(!AVSN.length){el.innerHTML=\"<div class='vz'>Suas medidas aparecem aqui quando " + esc(studio.split(" ")[0]).replace(/'/g, "\\'") + " registrar a avaliação na consulta.</div>\";return;}" +
      "function linha(rot,campo,menorMelhor){var com=AVSN.filter(function(v){return v[campo]!=null&&v[campo]!=='';});if(!com.length)return '';" +
      "var pri=+com[0][campo],ult=+com[com.length-1][campo];var d=Math.round((ult-pri)*10)/10;" +
      "var bom=menorMelhor?d<0:d>0;" +
      "var seta=d?(\" <b style='color:\"+(bom?'#4ade80':'#fbbf24')+\"'>\"+(d>0?'+':'')+String(d).replace('.',',')+\"</b>\"):'';" +
      "return \"<div class='kv'><span>\"+rot+\"</span><span><b>\"+String(ult).replace('.',',')+\"</b>\"+seta+\"</span></div>\";}" +
      "el.innerHTML=linha('Peso (kg)','peso',true)+linha('Gordura (%)','gordura',true)+linha('Cintura (cm)','cintura',true)+" +
      "linha('Quadril (cm)','quadril',true)+linha('Bra\\u00e7o (cm)','braco',false)+linha('Coxa (cm)','coxa',false)+" +
      "\"<div class='vz'>\"+AVSN.length+\" avalia\\u00e7\\u00e3o(\\u00f5es) \\u00b7 \\u00faltima em \"+AVSN[AVSN.length-1].data.split('-').reverse().join('/')+\"</div>\";})();" +
      // ---------- gamificação: XP, semana, meta e medalhas (paridade com o app do aluno) ----------
      "var META_SEM_N=" + metaSemN + ";" +
      "function planoDias(){return L('ntplano',{});}" +
      "function segundaISO(base){var d=base?new Date(base+'T12:00'):new Date();var w=(d.getDay()+6)%7;d.setDate(d.getDate()-w);" +
      "return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}" +
      "function diasDaSemana(){var ini=segundaISO();var l=[];for(var i=0;i<7;i++){var d=new Date(ini+'T12:00');d.setDate(d.getDate()+i);" +
      "l.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'));}return l;}" +
      "function naSemana(){var f=planoDias();return diasDaSemana().filter(function(d){return f[d];}).length;}" +
      // sequência: semanas seguidas em que bateu a meta
      "function sequenciaSem(){var f=planoDias();var n=0;for(var s=1;s<200;s++){var base=new Date();base.setDate(base.getDate()-s*7);" +
      "var ini=segundaISO(base.getFullYear()+'-'+String(base.getMonth()+1).padStart(2,'0')+'-'+String(base.getDate()).padStart(2,'0'));" +
      "var c=0;for(var i=0;i<7;i++){var d=new Date(ini+'T12:00');d.setDate(d.getDate()+i);" +
      "if(f[d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')])c++;}" +
      "if(c>=META_SEM_N)n++;else break;}return n;}" +
      "function pintaSemanaN(){var box=document.getElementById('diasSemN');if(!box)return;" +
      "var f=planoDias();var hoje=isoHj();var NOMES=['Seg','Ter','Qua','Qui','Sex','S\\u00e1b','Dom'];" +
      "box.innerHTML=diasDaSemana().map(function(d,i){var ok=!!f[d];var eHoje=d===hoje;" +
      "return \"<div style='flex:1;text-align:center;border-radius:12px;padding:8px 2px;border:1px solid \"+(eHoje?'" + CORL + "':'#29402f')+\";\"+" +
      "(ok?'background:linear-gradient(160deg," + COR + "," + CORG2 + ");':'')+\"'>\"+" +
      "\"<div style='font-size:9.5px;letter-spacing:.08em;font-weight:800;color:\"+(ok?'#fff':'#9fb8a6')+\"'>\"+NOMES[i].toUpperCase()+\"</div>\"+" +
      "\"<div style='font-size:16px;font-weight:800;color:\"+(ok?'#fff':'#eef7f0')+\"'>\"+(+d.slice(8,10))+\"</div>\"+" +
      "(ok?\"<div style='font-size:11px;color:#fff;'>\\u2713</div>\":'')+'</div>';}).join('');" +
      "var n=naSemana();var seq=sequenciaSem();var pct=Math.min(100,Math.round(100*n/META_SEM_N));" +
      "document.getElementById('metaBoxN').innerHTML=" +
      "\"<div style='display:flex;justify-content:space-between;font-size:14px;'><span>Meta da semana</span><b>\"+n+' de '+META_SEM_N+\"</b></div>\"+" +
      "\"<div style='height:8px;background:#0f1a12;border-radius:99px;overflow:hidden;margin-top:6px;border:1px solid #29402f;'>\"+" +
      "\"<div style='height:100%;width:\"+pct+\"%;background:linear-gradient(90deg," + COR + "," + CORL + ");'></div></div>\"+" +
      "(seq>0?\"<div style='margin-top:8px;font-size:13px;color:#fbbf24;font-weight:700;'>Sequ\\u00eancia de \"+seq+\" semana\"+(seq>1?'s':'')+\" batendo a meta \\u2014 n\\u00e3o deixa apagar!</div>\":'');" +
      "var bt=document.getElementById('btnPlanoN');if(bt){var jaHoje=!!f[hoje];" +
      "bt.textContent=jaHoje?'\\u2713 Plano seguido hoje':'Segui o plano hoje!';" +
      "bt.style.opacity=jaHoje?'.65':'1';}" +
      "var med=document.getElementById('medalhasN');if(med){var total=Object.keys(f).length;" +
      "var MED=[[7,'7 dias'],[30,'30 dias'],[90,'90 dias'],[180,'180 dias']];" +
      "med.innerHTML=MED.map(function(m){var ok=total>=m[0];" +
      "return \"<span style='display:inline-block;margin:0 4px;font-size:12px;font-weight:700;color:\"+(ok?'" + CORL + "':'inherit')+\";opacity:\"+(ok?1:.3)+\"'>\"+m[1]+'</span>';}).join('')+" +
      "\"<div style='margin-top:4px;'>\"+total+' dia(s) no plano no total</div>';}}" +
      "var btPl=document.getElementById('btnPlanoN');" +
      "if(btPl)btPl.addEventListener('click',function(){var f=planoDias();var hoje=isoHj();" +
      "if(f[hoje]){delete f[hoje];}else{f[hoje]=1;if(navigator.vibrate)navigator.vibrate(90);}" +
      "Sv('ntplano',f);pintaSemanaN();pintaXPN();});" +
      // XP calculado dos dados. Água: os dias de verdade ficam em ntag_<dia>
      // (a chave antiga ntagua era lida mas nunca escrita — água não pontuava);
      // as duas fontes somam, então dado antigo continua valendo.
      "function xpDadosN(){var dias=Object.keys(planoDias()).length;var pes=(L('ntpeso',[])||[]).length;" +
      "var agD=diasCom('ntag_');var agL=L('ntagua',{})||{};Object.keys(agL).forEach(function(k){agD[k]=1;});var ag=Object.keys(agD).length;" +
      /* diário é CUMULATIVO como as outras parcelas: contar só o dia de hoje
       * fazia o XP cair e o nível VOLTAR à meia-noite. */
      "var di=0;try{var dD=diasCom('ntdi_');Object.keys(dD).forEach(function(k){di+=(L('ntdi_'+k,[])||[]).length;});}catch(e){}" +
      "return dias*10+pes*5+ag*2+di*2;}" +
      /* nível: mesma curva do app do aluno — chegar ao nível n custa
       * 50·(n−1)·n XP; começa rápido e vai custando mais. */
      "function nvXpAteN(n){return 50*(n-1)*n;}" +
      "function nivelDeN(xp){var n=1;while(50*n*(n+1)<=xp)n++;return n;}" +
      "var NV_TITN=[[25,'Hall da Fama'],[20,'Mito'],[15,'Lenda'],[12,'Imparável'],[10,'Elite'],[9,'Fera'],[8,'Máquina'],[7,'Casca-grossa'],[6,'Raiz'],[5,'Firme'],[4,'Constante'],[3,'No ritmo'],[2,'Aquecendo']];" +
      "function nvTituloN(n){for(var i=0;i<NV_TITN.length;i++)if(n>=NV_TITN[i][0])return NV_TITN[i][1];return 'Iniciante';}" +
      "function confeteN(){if(!document.getElementById('cfCssN')){var st=document.createElement('style');st.id='cfCssN';" +
      "st.textContent='@keyframes cfQN{to{transform:translateY(105vh) rotate(720deg);opacity:.7}}';document.head.appendChild(st);}" +
      "var v=document.createElement('div');v.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:99;';" +
      "var cores=['" + COR + "','" + CORL + "','" + CORG2 + "','#fbbf24','#fff'];" +
      "for(var i=0;i<24;i++){var p=document.createElement('div');" +
      "p.style.cssText='position:absolute;width:9px;height:14px;top:-20px;left:'+Math.random()*100+'%;background:'+cores[i%cores.length]+';border-radius:2px;opacity:.95;animation:cfQN '+(1.6+Math.random()*1.4)+'s linear '+(Math.random()*.7)+'s forwards;transform:rotate('+Math.random()*360+'deg);';" +
      "v.appendChild(p);}document.body.appendChild(v);setTimeout(function(){v.remove();},3600);}" +
      "function pintaNivelN(){var xp=xpDadosN();var n=nivelDeN(xp);var el=document.getElementById('nvNumN');if(el)el.textContent=n;" +
      "var base=nvXpAteN(n),alvo=nvXpAteN(n+1);var pct=Math.max(0,Math.min(100,Math.round(100*(xp-base)/(alvo-base))));" +
      "var card=document.getElementById('nvCardN');if(card){var C2=2*Math.PI*26;" +
      "card.innerHTML=\"<div style='display:flex;gap:14px;align-items:center;background:#16241b;border:1px solid #29402f;border-radius:14px;padding:13px 14px;'>\"+" +
      "\"<svg width='64' height='64' viewBox='0 0 64 64' style='flex:none;'><circle cx='32' cy='32' r='26' fill='none' stroke='rgba(255,255,255,.09)' stroke-width='6'/>\"+" +
      "\"<circle cx='32' cy='32' r='26' fill='none' stroke='" + COR + "' stroke-width='6' stroke-linecap='round' stroke-dasharray='\"+(C2*pct/100).toFixed(1)+' '+C2.toFixed(1)+\"' transform='rotate(-90 32 32)'/>\"+" +
      "\"<text x='32' y='39' text-anchor='middle' font-size='20' font-weight='800' fill='#eef7f0'>\"+n+'</text></svg>'+" +
      "\"<div style='flex:1;min-width:0;'><div style='font-weight:800;font-size:15px;'>Nível \"+n+' — '+nvTituloN(n)+\"</div>\"+" +
      "\"<div style='height:7px;background:#0f1a12;border-radius:99px;overflow:hidden;margin-top:7px;border:1px solid #29402f;'><div style='height:100%;width:\"+pct+\"%;background:linear-gradient(90deg," + COR + "," + CORL + ");'></div></div>\"+" +
      "\"<div style='font-size:11.5px;color:#9fb8a6;margin-top:6px;'>\"+xp+' XP — '+((alvo-xp)===1?'falta':'faltam')+' '+(alvo-xp)+' pro nível '+(n+1)+(nvTituloN(n+1)!==nvTituloN(n)?' ('+nvTituloN(n+1)+')':'')+'</div></div></div>'+" +
      "\"<div style='font-size:11px;color:#9fb8a6;margin-top:7px;text-align:center;'>dia no plano +10 XP · pesagem +5 · dia com água +2 · item no diário +2</div>\";}" +
      // celebra só quando SOBE (a 1ª abertura apenas anota o nível atual)
      "var visto=+L('ntnivel',0)||0;" +
      "if(!visto){Sv('ntnivel',n);}else if(n>visto){Sv('ntnivel',n);" +
      "try{confeteN();if(navigator.vibrate)navigator.vibrate([120,60,120,60,260]);" +
      "var t=document.createElement('div');t.style.cssText='position:fixed;top:16px;left:50%;transform:translateX(-50%);background:linear-gradient(90deg," + COR + "," + CORL + ");color:#fff;padding:13px 22px;border-radius:13px;font-weight:800;z-index:99;text-align:center;';" +
      "t.innerHTML='SUBIU DE NÍVEL!<br><small>Nível '+n+' — '+nvTituloN(n)+'</small>';" +
      "document.body.appendChild(t);setTimeout(function(){t.remove();},3500);}catch(e){}}}" +
      "function pintaXPN(){var el=document.getElementById('xpNumN');if(!el)return;el.textContent=xpDadosN();pintaNivelN();}" +
      "pintaSemanaN();pintaXPN();" +
      "var hvN=document.getElementById('heroVerN');" +
      "if(hvN)hvN.addEventListener('click',function(){trocaSecN('dieta');});" +
      // ---------- Comunidade (o mesmo feed do app do aluno) ----------
      (feedLigadoN
        ? "(function(){var lista=document.getElementById('fdListaN');if(!lista)return;" +
          "var fotoNova='';var carregando=false;" +
          "function eh(s){return String(s==null?'':s).replace(/[&<>\"']/g,function(c){return '&#'+c.charCodeAt(0)+';';});}" +
          "function quando(iso){var d=new Date(iso);var m=Math.floor((Date.now()-d.getTime())/60000);" +
          "if(m<1)return'agora';if(m<60)return m+' min';var h=Math.floor(m/60);if(h<24)return h+' h';" +
          "var dd=Math.floor(h/24);if(dd<7)return dd+' d';return d.toLocaleDateString('pt-BR').slice(0,5);}" +
          "function iniciais(n){return String(n||'A').trim().split(/\\s+/).slice(0,2).map(function(x){return x.charAt(0).toUpperCase();}).join('');}" +
          "function stat(t){document.getElementById('fdStatusN').textContent=t||'';}" +
          "if(!NUVEM||!TOKEN){lista.innerHTML=\"<div class='vz'>A Comunidade precisa de internet e do app publicado pelo seu nutricionista.</div>\";" +
          "document.getElementById('fdEnviaN').disabled=true;return;}" +
          "document.getElementById('fdFotoN').addEventListener('change',function(){var f=this.files&&this.files[0];this.value='';if(!f)return;" +
          "stat('Preparando a foto\\u2026');var img=new Image();var rd=new FileReader();" +
          "rd.onload=function(){img.onload=function(){" +
          "var tent=[[900,.72],[720,.66],[560,.6],[440,.5]];var saiu='';" +
          "for(var i=0;i<tent.length;i++){var lado=tent[i][0],q=tent[i][1];" +
          "var c=document.createElement('canvas');var k=lado/Math.max(img.width,img.height);if(k>1)k=1;" +
          "c.width=Math.round(img.width*k);c.height=Math.round(img.height*k);" +
          "c.getContext('2d').drawImage(img,0,0,c.width,c.height);" +
          "saiu=c.toDataURL('image/jpeg',q);if(saiu.length<=380000)break;}" +
          "if(saiu.length>380000){stat('Essa foto \\u00e9 pesada demais \\u2014 tenta outra.');return;}" +
          "fotoNova=saiu;document.getElementById('fdPrevImgN').src=saiu;document.getElementById('fdPrevN').style.display='block';stat('');};" +
          "img.onerror=function(){stat('N\\u00e3o consegui ler essa imagem.');};img.src=rd.result;};" +
          "rd.onerror=function(){stat('N\\u00e3o consegui ler essa imagem.');};rd.readAsDataURL(f);});" +
          "document.getElementById('fdTiraN').addEventListener('click',function(){fotoNova='';document.getElementById('fdPrevN').style.display='none';});" +
          "document.getElementById('fdEnviaN').addEventListener('click',function(){" +
          "var tx=document.getElementById('fdTextoN').value.trim();" +
          "if(!tx&&!fotoNova){stat('Escreva algo ou escolha uma foto.');return;}" +
          "var bt=this;bt.disabled=true;stat('Publicando\\u2026');" +
          "var marca='';try{if(planoDias()[isoHj()])marca='Seguiu o plano hoje';}catch(e){}" +
          "rpcApp('app_aluno_posta',{t:TOKEN,p_nome:" + jsonApp(primeiro) + ",p_texto:tx,p_foto:fotoNova,p_treino:marca}).then(function(r){bt.disabled=false;" +
          "if(r&&r.ok){document.getElementById('fdTextoN').value='';fotoNova='';document.getElementById('fdPrevN').style.display='none';" +
          "stat('');if(navigator.vibrate)navigator.vibrate(60);carrega();return;}" +
          "var e=(r&&r.erro)||'';" +
          "stat(e==='limite_diario'?'Voc\\u00ea j\\u00e1 postou bastante hoje \\u2014 volta amanh\\u00e3!':e==='foto_grande'?'A foto ficou grande demais.':'N\\u00e3o deu pra publicar agora \\u2014 tenta de novo.');});});" +
          "lista.addEventListener('click',function(e){" +
          "var lk=e.target.closest('[data-fdlike]');" +
          "if(lk){lk.disabled=true;rpcApp('app_aluno_reage',{t:TOKEN,p_post:'feed:'+lk.getAttribute('data-fdlike'),p_tipo:'like',p_nome:" + jsonApp(primeiro) + ",p_texto:''}).then(function(){carrega();});" +
          "if(navigator.vibrate)navigator.vibrate(8);return;}" +
          "var cm=e.target.closest('[data-fdcom]');" +
          "if(cm){var idc=cm.getAttribute('data-fdcom');var inp=lista.querySelector(\"[data-fdinp='\"+idc+\"']\");" +
          "var tx2=(inp&&inp.value||'').trim();if(!tx2)return;cm.disabled=true;" +
          "rpcApp('app_aluno_reage',{t:TOKEN,p_post:'feed:'+idc,p_tipo:'coment',p_nome:" + jsonApp(primeiro) + ",p_texto:tx2}).then(function(){carrega();});return;}" +
          "var ap=e.target.closest('[data-fdrm]');" +
          "if(ap){if(!confirm('Apagar este post?'))return;ap.disabled=true;" +
          "rpcApp('app_aluno_feed_apaga',{t:TOKEN,p_id:ap.getAttribute('data-fdrm')}).then(function(){carrega();});return;}});" +
          "function pinta(posts){" +
          "if(!posts.length){lista.innerHTML=\"<div class='vz'>Ningu\\u00e9m postou ainda \\u2014 seja o primeiro a mostrar como foi a semana!</div>\";return;}" +
          "lista.innerHTML=posts.map(function(p2){" +
          "return \"<div style='border-top:1px solid #29402f;padding:14px 0;'>\"+" +
          "\"<div style='display:flex;align-items:center;gap:10px;'>\"+" +
          "\"<div style='width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg," + COR + "," + CORL + ");color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex:none;'>\"+eh(iniciais(p2.nome))+\"</div>\"+" +
          // selo Nv do autor (retorno.nivel via SQL do feed; sem o SQL novo, só não aparece)
          "\"<div style='min-width:0;'><b style='font-size:14px;'>\"+eh(p2.nome||'Paciente')+\"</b>\"+" +
          "(+p2.nivel>0?\"<span style='margin-left:7px;font-size:10px;font-weight:800;padding:1.5px 8px;border-radius:99px;background:rgba(255,255,255,.08);color:" + CORL + ";vertical-align:2px;'>Nv \"+(+p2.nivel)+\"</span>\":'')+" +
          "\"<div style='font-size:11.5px;color:#8fa896;'>\"+quando(p2.criado)+(p2.treino?' \\u00b7 '+eh(p2.treino):'')+\"</div></div>\"+" +
          "(p2.meu?\"<button data-fdrm='\"+eh(p2.id)+\"' aria-label='Apagar meu post' style='margin-left:auto;background:none;border:none;color:#8fa896;font-size:13px;cursor:pointer;font-family:inherit;'>apagar</button>\":'')+\"</div>\"+" +
          "(p2.texto?\"<div style='font-size:14.5px;line-height:1.45;margin-top:9px;white-space:pre-wrap;'>\"+eh(p2.texto)+\"</div>\":'')+" +
          "(p2.foto?\"<img src='\"+eh(p2.foto)+\"' alt='foto do post' loading='lazy' style='width:100%;border-radius:12px;margin-top:9px;display:block;'>\":'')+" +
          "\"<div style='display:flex;align-items:center;gap:12px;margin-top:9px;'>\"+" +
          "\"<button data-fdlike='\"+eh(p2.id)+\"' aria-label='Curtir' style='background:none;border:none;cursor:pointer;font-family:inherit;font-size:13px;font-weight:700;padding:0;color:\"+(p2.curti?'" + CORL + "':'#8fa896')+\"'>\"+" +
          "\"<svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true' style='vertical-align:-3px;margin-right:4px;'><path d='M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3'/></svg>\"+(p2.curtidas||0)+\"</button>\"+" +
          "\"<span style='font-size:12.5px;color:#8fa896;'>\"+(p2.comentarios||[]).length+\" coment\\u00e1rio(s)</span></div>\"+" +
          "((p2.comentarios||[]).map(function(c){" +
          "return \"<div style='font-size:13px;margin-top:7px;padding-left:10px;border-left:2px solid #29402f;'><b>\"+eh(c.nome||'Paciente')+\"</b> \"+eh(c.texto)+'</div>';}).join(''))+" +
          "\"<div style='display:flex;gap:6px;margin-top:9px;'>\"+" +
          "\"<input data-fdinp='\"+eh(p2.id)+\"' maxlength='400' placeholder='Escrever um coment\\u00e1rio\\u2026' style='flex:1;min-width:0;border-radius:99px;padding:8px 12px;font-size:13px;'>\"+" +
          "\"<button data-fdcom='\"+eh(p2.id)+\"' style='background:none;border:none;color:" + CORL + ";font-weight:800;font-size:13px;cursor:pointer;font-family:inherit;'>Enviar</button></div></div>\";}).join('');}" +
          "function rankSemana(){rpcApp('app_desafio_ranking',{t:TOKEN,p_ini:segundaISO(),p_fim:isoHj()}).then(function(d){" +
          "var el=document.getElementById('fdRankN');if(!el)return;var rk=(d&&d.ranking)||[];" +
          "if(!rk.length){el.innerHTML='';return;}var med=['1\\u00ba','2\\u00ba','3\\u00ba'];" +
          "el.innerHTML=\"<div style='background:#0f1a12;border:1px solid #29402f;border-radius:14px;padding:11px 13px;'>\"+" +
          "\"<div style='font-size:10px;font-weight:800;letter-spacing:.14em;color:#8fa896;text-transform:uppercase;margin-bottom:7px;'>Ranking da semana</div>\"+" +
          "rk.slice(0,5).map(function(r,i){return \"<div style='display:flex;justify-content:space-between;font-size:13.5px;padding:3px 0;'><span>\"+(med[i]||(i+1)+'\\u00ba')+' '+eh(r.nome||'Paciente')+\"</span><b>\"+r.dias+'</b></div>';}).join('')+" +
          "\"<div style='font-size:11.5px;color:#8fa896;margin-top:6px;'>Conta os dias em que cada um marcou <b>Segui o plano hoje!</b></div></div>\";});}" +
          "function carrega(){if(carregando)return;carregando=true;" +
          "rpcApp('app_aluno_feed',{t:TOKEN,p_limite:30}).then(function(r){carregando=false;" +
          "if(r&&r.ok&&Array.isArray(r.posts)){try{Sv('ntfeed',r.posts);}catch(e){}pinta(r.posts);return;}" +
          "pinta(L('ntfeed',[]));}).catch(function(){carregando=false;pinta(L('ntfeed',[]));});}" +
          "pinta(L('ntfeed',[]));carrega();rankSemana();" +
          "setInterval(function(){if(window.SECN==='feed')carrega();},45000);})();"
        : "") +
      "window.__appNutri=true;" +
      "<\/script></body></html>";
  }
  raiz.MT_APP_NUTRI = { monta: monta };
})(typeof self !== "undefined" ? self : this);
