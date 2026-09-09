/* Organização das ferramentas do PERSONAL. Move os controles existentes sem
 * duplicar IDs; rascunhos ficam somente na memória desta página. */
(function () {
  "use strict";
  var drafts = {}, groups = {}, ready = false;
  var configFields = "cfgAtraso cfgZapFila cfgReciboZap cfgVeWod cfgVeCardio cfgVeUtil cfgVeAgenda cfgVeChat cfgVePag cfgVeIndica cfgIndicaPremio cfgPlaylist cfgFeed cfgScan".split(" ");
  var siteFields = "spSlug spHeadline spSub spBio spExpHor spInsta spThreads spYoutube spFacebook spX spEmail spMostraPlanos spMostraServ spCor spFundo".split(" ");
  function $(id) { return document.getElementById(id); }
  function text(s) { return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
  function node(tag, cls, value) { var n = document.createElement(tag); if (cls) n.className = cls; if (value) n.textContent = value; return n; }
  function fieldValue(el) { return el.type === "checkbox" ? el.checked : el.value; }
  function restore(name) {
    Object.keys(drafts[name] || {}).forEach(function (id) { var el = $(id); if (el) { if (el.type === "checkbox") el.checked = drafts[name][id]; else if (el.value !== drafts[name][id]) el.value = drafts[name][id]; } });
    var out = $(name === "config" ? "cfgRascunho" : "spRascunho");
    if (out) out.textContent = Object.keys(drafts[name] || {}).length ? "Há alterações não salvas. Seu rascunho fica aqui enquanto o painel estiver aberto." : "";
  }
  function clear(name, ids) { if (!ids) delete drafts[name]; else ids.forEach(function (id) { if (drafts[name]) delete drafts[name][id]; }); restore(name); }
  function track(name, ids) {
    ids.forEach(function (id) { var el = $(id); if (!el) return;
      ["input", "change"].forEach(function (ev) { el.addEventListener(ev, function () { drafts[name] = drafts[name] || {}; drafts[name][id] = fieldValue(el); restore(name); }); });
    });
  }
  function reveal(el) {
    if (!el) return;
    var pane = el.closest(".ptf-pane");
    if (pane) Object.keys(groups).forEach(function (id) { var group = groups[id]; Object.keys(group.panes).forEach(function (key) { if (group.panes[key] === pane) group.show(key); }); });
    var parent = el.parentElement;
    while (parent) { if (parent.tagName === "DETAILS") parent.open = true; parent = parent.parentElement; }
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    if (/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(el.tagName)) el.focus({ preventScroll: true });
  }
  function disclosure(card, id, title, opened) {
    var d = node("details", "ptf-disclosure"); d.id = id; d.open = !!opened;
    d.appendChild(node("summary", "", title));
    var body = node("div", "ptf-detail-body");
    card.before(d); body.appendChild(card); d.appendChild(body);
    card.classList.add("ptf-content");
    var h = card.querySelector(":scope > h2"); if (h) h.classList.add("ptf-sr");
    return d;
  }
  function navigation(root, id, label, choices) {
    var wrap = node("div", "ptf-navigation"), lb = node("label", "ptf-field", label), sel = node("select"); sel.id = id;
    lb.htmlFor = id;
    choices.forEach(function (c) { var o = node("option", "", c[1]); o.value = c[0]; sel.appendChild(o); });
    lb.appendChild(sel); wrap.appendChild(lb); root.prepend(wrap);
    return sel;
  }
  function partition(root, id, label, choices) {
    var sel = navigation(root, id, label, choices), panes = {};
    choices.forEach(function (c) { var pane = node("section", "ptf-pane"); pane.dataset.ptfPane = c[0]; pane.setAttribute("aria-label", c[1]); root.appendChild(pane); panes[c[0]] = pane; });
    function show(key) { if (!panes[key]) return; sel.value = key; Object.keys(panes).forEach(function (k) { panes[k].hidden = k !== key; }); }
    sel.addEventListener("change", function () { show(sel.value); });
    groups[id] = { show: show, panes: panes }; show(choices[0][0]);
    return panes;
  }
  function labelInput(id, title) {
    var el = $(id); if (!el || el.closest("label")) return;
    var lb = node("label", "ptf-field", title); lb.htmlFor = id; el.before(lb); lb.appendChild(el);
  }
  function setupConfig() {
    var root = $("vConfig"); root.classList.add("ptf-tools");
    var cards = Array.from(root.querySelectorAll(":scope > .card[data-cfgsec]"));
    var choices = [["resumo", "Visão geral"], ["zap", "WhatsApp"], ["app", "App do aluno"], ["conta", "Cobrança, conta e aparelho"]];
    var sel = navigation(root, "cfgArea", "Área das configurações", choices);
    var canonical = window.__cfgAba;
    window.__cfgAba = function (key) { canonical(key); sel.value = key; root.querySelectorAll("#cfgAbas button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.cfga === key)); }); };
    sel.addEventListener("change", function () { window.__cfgAba(sel.value); });
    $("cfgAbas").addEventListener("click", function (e) { var b = e.target.closest("[data-cfga]"); if (b) window.__cfgAba(b.dataset.cfga); });
    var search = node("div", "ptf-search"), lb = node("label", "ptf-field", "Encontrar uma configuração"), input = node("input"); input.id = "cfgBusca"; input.type = "search"; input.placeholder = "Ex.: Pix, senha, playlist, backup"; lb.htmlFor = input.id; lb.appendChild(input); search.appendChild(lb);
    var results = node("div", "ptf-search-results"); results.id = "cfgBuscaResultados"; results.hidden = true; search.appendChild(results); sel.closest(".ptf-navigation").after(search);
    var entries = [], defaults = { conta: "cfgAtraso", zap: "autoLista", app: "cfgVeWod" };
    cards.forEach(function (card, i) {
      var key = card.dataset.cfgsec, h = card.querySelector("h2"), title = h ? h.textContent : "Configuração", opened = !!card.querySelector("#" + defaults[key]);
      var d = disclosure(card, "cfgGrupo" + i, title, opened); d.dataset.cfgsec = key; d.hidden = card.hidden; card.removeAttribute("data-cfgsec"); card.hidden = false;
      entries.push({ title: title, terms: text(card.textContent), key: key, target: d });
    });
    entries.push({title:"Pix, contato e backup dos dados",terms:"pix chave contato whatsapp backup restaurar exportar ilha",route:"conta",target:$("cfgPixChave")});
    input.addEventListener("input", function () {
      var q = text(input.value.trim()); results.replaceChildren(); results.hidden = !q;
      if (!q) return;
      var found = entries.filter(function (x) { return text(x.title + " " + x.terms).includes(q); });
      if (!found.length) { results.appendChild(node("p", "muted", "Nenhuma configuração encontrada. Tente outro termo.")); return; }
      found.forEach(function (x) { var bt = node("button", "ptf-result", x.title); bt.type = "button"; bt.addEventListener("click", function () {
        if (x.route) document.querySelector('#abas [data-a="' + x.route + '"]').click(); else window.__cfgAba(x.key);
        if (x.target.tagName === "DETAILS") x.target.open = true; reveal(x.target.querySelector ? x.target.querySelector("input,select,textarea,button") || x.target : x.target);
      }); results.appendChild(bt); });
    });
    var rail = $("cfgSalva").closest(".card"); rail.classList.add("ptf-savebar");
    var hint = $("cfgSalva").nextElementSibling; if (hint) { hint.textContent = "Integrações e termo usam seus próprios botões de salvar."; rail.before(hint); hint.classList.add("ptf-intro"); }
    var status = node("p", "muted ptf-draft"); status.id = "cfgRascunho"; status.setAttribute("role", "status"); rail.prepend(status);
    var discard = node("button", "btn sec mini", "Descartar alterações"); discard.id = "cfgDescartar"; discard.type = "button"; $("cfgSalva").after(discard);
    discard.addEventListener("click", function () { if (!Object.keys(drafts.config || {}).length || !confirm("Descartar as alterações não salvas das configurações?")) return; clear("config"); window.__configPT(); $("cfgStatus").textContent = "Preferências recarregadas. Nenhum dado foi alterado."; });
    track("config", configFields.concat(["cfgTermo"]));
    labelInput("cfgIndicaPremio", "Prêmio por indicação (opcional)"); labelInput("cfgPlaylist", "Link da playlist"); labelInput("cfgTermo", "Texto do termo");
    $("cfgAtraso").type = "number"; $("cfgAtraso").min = "0"; $("cfgAtraso").max = "28"; $("cfgAtraso").step = "1";
    window.__cfgAba(document.querySelector("#cfgAbas .ativa").dataset.cfga);
  }
  function setupPers() {
    var root = $("vPers"); root.classList.add("ptf-tools");
    var cards = Array.from(root.querySelectorAll(":scope > .card"));
    var panes = partition(root, "persArea", "Personalizar", [["marca", "Cores e logo"], ["fotos", "Fotos dos treinos"], ["beneficios", "Benefícios, loja e conquistas"]]);
    root.prepend(root.querySelector(".altopo"));
    cards.forEach(function (card, i) { var key = i < 2 ? "marca" : i === 4 || i === 5 ? "fotos" : "beneficios"; panes[key].appendChild(card); card.classList.add("ptf-content"); if (key === "beneficios" || i === 5) disclosure(card, "persGrupo" + i, card.querySelector("h2").textContent, false); });
    root.querySelectorAll(".fotoguia").forEach(function (g, i) { var d = disclosure(g, "persFotoGuia" + i, "Como preparar a foto", false); d.classList.add("ptf-instructions"); });
    labelInput("cqPersNome", "Nome da conquista"); labelInput("cqPersMeta", "Meta de treinos");
    $("persStatus").setAttribute("role", "status"); $("persPublica").title = "Publicar as alterações salvas nos apps dos alunos";
    var note = node("p", "muted ptf-intro", "As mudanças são salvas neste painel. Use Publicar para atualizar o app dos alunos."); $("persStatus").before(note);
  }
  function setupSite() {
    var root = $("vSitePro"); root.classList.add("ptf-tools");
    var card = $("spSlug").closest(".card"), form = $("spHeadline").closest("label").parentElement;
    var panes = partition(root, "spArea", "Editar minha página", [["texto", "Apresentação e endereço"], ["contato", "Contatos e aula experimental"], ["visual", "Fotos e aparência"], ["secoes", "Seções, planos e depoimentos"], ["previa", "Prévia da página"]]);
    root.prepend(root.querySelector(".altopo"));
    var children = Array.from(form.children), zone = "texto";
    children.forEach(function (el) {
      if (el.contains($("spExpHor"))) zone = "contato";
      if (el.contains($("spCapaBtn"))) zone = "visual";
      if (el.id === "spOrdem" || /Ordem das seções/.test(el.textContent)) zone = "secoes";
      panes[zone].appendChild(el);
    });
    var prevCard = $("spPreview").closest(".card"); panes.previa.appendChild(prevCard); prevCard.classList.add("ptf-content");
    var rail = node("div", "ptf-savebar"); rail.id = "spAcoes";
    root.appendChild(rail);
    rail.appendChild($("spSalvar").parentElement); rail.appendChild($("spStatus"));
    var hint = node("p", "muted ptf-draft"); hint.id = "spRascunho"; hint.setAttribute("role", "status"); rail.prepend(hint);
    var discard = node("button", "btn sec mini", "Descartar alterações"); discard.id = "spDescartar"; discard.type = "button"; $("spSalvar").after(discard);
    var more = node("details", "ptf-more-actions"), moreBody = node("div", "linha-flex"); more.appendChild(node("summary", "", "Mais ações")); rail.appendChild(more); more.appendChild(moreBody); moreBody.appendChild(discard); moreBody.appendChild($("spBaixar"));
    $("spSalvar").textContent = "Salvar e ver prévia";
    $("spPublicar").textContent = "Publicar página";
    discard.addEventListener("click", function () { if (!Object.keys(drafts.site || {}).length || !confirm("Descartar as alterações não salvas da sua página?")) return; clear("site"); window.__sitePro.render(); $("spStatus").textContent = "Dados salvos recarregados. A página publicada continua igual."; });
    var intro = node("p", "muted ptf-intro", "Salve para revisar a prévia. Publique quando estiver pronto para atualizar o link público."); root.querySelector(".ptf-navigation").after(intro);
    card.remove(); root.appendChild(rail); track("site", siteFields);
    $("spEmail").type = "email";
  }
  function setupConta() {
    var root = $("cardConta"); root.classList.add("ptf-tools", "ptf-account");
    var fields = $("cfgZap").closest(".linha-flex"), mural = $("cfgMural").closest("label"), actions = $("btnContaEntrar").parentElement, backup = $("btnBackup").parentElement.parentElement;
    var panes = partition(root, "ilhaArea", "Sua ilha", [["contato", "Contato, Pix e mural"], ["acesso", "Acesso e equipe"], ["backup", "Backup e exportação"]]);
    root.prepend(root.querySelector(":scope > h2"));
    panes.contato.appendChild(fields); panes.contato.appendChild($("ilhaSalvo")); panes.contato.appendChild(mural);
    var note = node("p", "muted ptf-intro", "Contato, Pix e mural são salvos ao sair do campo. Publique os apps após mudar informações que os alunos veem."); panes.contato.prepend(note);
    panes.acesso.appendChild(actions); panes.acesso.appendChild($("syncInfoPt")); panes.backup.appendChild(backup); backup.classList.add("ptf-content");
    var link = node("button", "btn sec mini", "Abrir personalização"); link.type = "button"; link.addEventListener("click", function () { document.querySelector('#abas [data-a="pers"]').click(); }); panes.contato.appendChild(link);
    var stale = Array.from(root.querySelectorAll(":scope > p")).find(function (p) { return p.textContent.includes("Cores e logo"); }); if (stale) stale.remove();
  }
  function setupImages() {
    var root = $("vImagens"); root.classList.add("ptf-tools");
    var tools = node("div", "ptf-gallery-tools"), lb = node("label", "ptf-field", "Buscar imagem"), inp = node("input"); inp.id = "imgBusca"; inp.type = "search"; inp.placeholder = "Nome da foto"; lb.htmlFor = inp.id; lb.appendChild(inp); tools.appendChild(lb);
    var order = node("label", "ptf-field", "Ordenar"), sel = node("select"); sel.id = "imgOrdem"; order.htmlFor = sel.id;
    [["recentes", "Mais recentes"], ["nome", "Nome A–Z"]].forEach(function (p) { var o = node("option", "", p[1]); o.value = p[0]; sel.appendChild(o); }); order.appendChild(sel); tools.appendChild(order); $("imgGaleria").before(tools);
    var status = node("p", "muted"); status.id = "imgStatus"; status.setAttribute("role", "status"); tools.after(status);
    inp.addEventListener("input", function () { window.__imagensPT.render(); }); sel.addEventListener("change", function () { window.__imagensPT.render(); });
    var first = root.querySelector(".card"); first.classList.add("ptf-content");
    var desc = first.querySelector("p"); var d = disclosure(desc, "imgComoFunciona", "Formato das fotos e armazenamento", false); d.classList.add("ptf-instructions");
  }
  function init() {
    if (ready || !$("vPers") || !window.__cfgAba) return;
    setupConfig(); setupPers(); setupSite(); setupConta(); setupImages();
    ["cfgStatus", "spStatus", "ilhaSalvo"].forEach(function (id) { if ($(id)) $(id).setAttribute("role", "status"); });
    ready = true;
  }
  window.MT_FERRAMENTAS = { restore: restore, clear: clear, reveal: reveal, ready: function () { return ready; }, configFields: configFields };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();

/* Extensão isolada de Questionários; a tela antiga continua utilizável se falhar. */
(function () {
  var source = document.currentScript && document.currentScript.src;
  if (!source || document.getElementById("qpxScript")) return;
  var css = document.createElement("link"); css.rel = "stylesheet";
  css.href = new URL("personal-questionarios.css", source).href; document.head.appendChild(css);
  var js = document.createElement("script"); js.id = "qpxScript";
  js.src = new URL("personal-questionarios.js", source).href; document.head.appendChild(js);
})();
