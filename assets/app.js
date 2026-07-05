/* Portal Método Torque — navegação, progresso e PWA */
(function () {
  "use strict";

  var MODULES = window.MT_MODULES;
  var DOCS = window.MT_DOCS;
  var APPS = window.MT_APPS || [];
  var bySlug = {};
  DOCS.forEach(function (d) { bySlug[d.slug] = d; });
  APPS.forEach(function (d) { d.type = "app"; bySlug[d.slug] = d; });

  function urlFor(doc) { return doc.file || "docs/" + doc.slug + ".html"; }

  var APOSTILAS = DOCS.filter(function (d) { return d.type === "apostila"; });

  // ---------- progresso (localStorage) ----------
  var LS_DONE = "mt:done";
  var LS_LAST = "mt:last";

  function getDone() {
    try { return JSON.parse(localStorage.getItem(LS_DONE)) || []; } catch (e) { return []; }
  }
  function setDone(list) {
    try { localStorage.setItem(LS_DONE, JSON.stringify(list)); } catch (e) {}
  }
  function isDone(slug) { return getDone().indexOf(slug) !== -1; }
  function toggleDone(slug) {
    var list = getDone();
    var i = list.indexOf(slug);
    if (i === -1) list.push(slug); else list.splice(i, 1);
    setDone(list);
  }
  function getLast() {
    try { return localStorage.getItem(LS_LAST); } catch (e) { return null; }
  }
  function setLast(slug) {
    try { localStorage.setItem(LS_LAST, slug); } catch (e) {}
  }

  // ---------- elementos ----------
  var el = function (id) { return document.getElementById(id); };
  var sideNav = el("sideNav");
  var homeView = el("homeView");
  var viewerView = el("viewerView");
  var docFrame = el("docFrame");
  var current = null;          // slug aberto
  var frameSlug = null;        // slug carregado no iframe

  // ---------- sidebar ----------
  function badgeFor(doc) {
    if (doc.type === "ferramenta") return "INTERATIVA";
    if (doc.type === "modelo") return "PREENCHÍVEL";
    return null;
  }

  function navItem(doc, num) {
    var a = document.createElement("a");
    a.className = "nav-item";
    if (doc.standalone) {
      a.href = urlFor(doc);
      a.target = "_blank";
      a.rel = "noopener";
    } else {
      a.href = "#/d/" + doc.slug;
    }
    a.dataset.slug = doc.slug;
    a.dataset.search = (doc.title + " " + doc.desc).toLowerCase();
    var html = "";
    if (num != null) html += '<span class="n">' + num + "</span>";
    if (doc.icone) html += '<span style="flex:none;">' + doc.icone + "</span>";
    html += '<span class="t">' + doc.title.replace(/^Apostila · /, "") + "</span>";
    var tag = badgeFor(doc);
    if (tag) html += '<span class="tag">' + tag + "</span>";
    if (doc.type === "apostila") html += '<span class="check">✓</span>';
    a.innerHTML = html;
    return a;
  }

  function navGroup(label) {
    var g = document.createElement("div");
    g.className = "nav-group";
    g.innerHTML = '<span class="nav-group-label">' + label + "</span>";
    return g;
  }

  function buildSidebar() {
    sideNav.innerHTML = "";

    var gA = navGroup("PROGRAMAS DO DIA A DIA");
    APPS.forEach(function (d) { gA.appendChild(navItem(d)); });
    sideNav.appendChild(gA);

    var g0 = navGroup("COMEÇO");
    g0.appendChild(navItem(bySlug["deck"]));
    if (bySlug["trilha-guiada"]) g0.appendChild(navItem(bySlug["trilha-guiada"]));
    g0.appendChild(navItem(bySlug["indice"]));
    sideNav.appendChild(g0);

    var g1 = navGroup("APOSTILAS DO CURSO");
    APOSTILAS.forEach(function (d) {
      var mod = MODULES[d.module - 1];
      g1.appendChild(navItem(d, mod.bonus ? "B" : mod.n));
    });
    sideNav.appendChild(g1);

    var g2 = navGroup("PLANILHAS INTERATIVAS");
    DOCS.filter(function (d) { return d.type === "ferramenta"; }).forEach(function (d) {
      g2.appendChild(navItem(d));
    });
    sideNav.appendChild(g2);

    var g3 = navGroup("FICHAS PREENCHÍVEIS");
    DOCS.filter(function (d) { return d.type === "modelo"; }).forEach(function (d) {
      g3.appendChild(navItem(d));
    });
    sideNav.appendChild(g3);

    var empty = document.createElement("div");
    empty.className = "nav-empty";
    empty.id = "navEmpty";
    empty.textContent = "Nenhum material encontrado.";
    empty.hidden = true;
    sideNav.appendChild(empty);
  }

  function refreshSidebarState() {
    var done = getDone();
    var items = sideNav.querySelectorAll(".nav-item");
    Array.prototype.forEach.call(items, function (a) {
      a.classList.toggle("active", a.dataset.slug === current);
      a.classList.toggle("done", done.indexOf(a.dataset.slug) !== -1);
    });
    var pct = Math.round((APOSTILAS.filter(function (d) { return done.indexOf(d.slug) !== -1; }).length / APOSTILAS.length) * 100);
    el("sideProgressPct").textContent = pct + "%";
    el("sideProgressBar").style.width = pct + "%";
  }

  // ---------- busca ----------
  el("searchInput").addEventListener("input", function () {
    var q = this.value.trim().toLowerCase();
    var any = false;
    Array.prototype.forEach.call(sideNav.querySelectorAll(".nav-item"), function (a) {
      var show = !q || a.dataset.search.indexOf(q) !== -1;
      a.style.display = show ? "" : "none";
      if (show) any = true;
    });
    Array.prototype.forEach.call(sideNav.querySelectorAll(".nav-group"), function (g) {
      var visible = Array.prototype.some.call(g.querySelectorAll(".nav-item"), function (a) {
        return a.style.display !== "none";
      });
      g.style.display = visible ? "" : "none";
    });
    el("navEmpty").hidden = any;
  });

  // ---------- home ----------
  function chip(doc, cls) {
    var done = doc.type === "apostila" && isDone(doc.slug);
    return '<a class="mat-chip ' + (cls || "") + (done ? " done-chip" : "") + '" href="#/d/' + doc.slug + '">' +
      (done ? "✓ " : "") + doc.title.replace(/^Apostila · Módulo.*/, "Apostila") + "</a>";
  }

  function buildHome() {
    // programas
    el("appGrid").innerHTML = APPS.map(function (d) {
      var href = d.standalone ? urlFor(d) : "#/d/" + d.slug;
      var extra = d.standalone ? ' target="_blank" rel="noopener"' : "";
      return '<a class="tool-card app-card" href="' + href + '"' + extra + '><span class="app-ico">' + d.icone + '</span><h3>' + d.title + "</h3><p>" + d.desc + "</p></a>";
    }).join("");

    // módulos
    var mg = el("modGrid");
    mg.innerHTML = MODULES.map(function (m) {
      var apostila = APOSTILAS[m.n - 1];
      var mats = DOCS.filter(function (d) { return d.module === m.n && d.type !== "apostila"; });
      var done = isDone(apostila.slug);
      return '<article class="mod-card">' +
        '<div class="mod-card-top"><span class="num">' + (m.bonus ? "B" : m.n) + "</span>" +
        '<span class="st' + (done ? " done" : "") + '">' + (done ? "✓ CONCLUÍDO" : "MÓDULO " + (m.bonus ? "BÔNUS" : m.n)) + "</span></div>" +
        "<h3>" + m.title + "</h3>" +
        '<div class="mod-mats">' + chip(apostila, "primary") + mats.map(function (d) { return chip(d); }).join("") + "</div>" +
        "</article>";
    }).join("");

    var tools = DOCS.filter(function (d) { return d.type === "ferramenta"; });
    el("toolGrid").innerHTML = tools.map(function (d) {
      return '<a class="tool-card" href="#/d/' + d.slug + '"><span class="tk">MÓDULO ' + d.module + " · INTERATIVA</span><h3>" + d.title + "</h3><p>" + d.desc + "</p></a>";
    }).join("");

    var models = DOCS.filter(function (d) { return d.type === "modelo"; });
    el("modelGrid").innerHTML = models.map(function (d) {
      return '<a class="tool-card" href="#/d/' + d.slug + '"><span class="tk">MÓDULO ' + d.module + " · PREENCHÍVEL</span><h3>" + d.title + "</h3><p>" + d.desc + "</p></a>";
    }).join("");

    // retomar
    var last = getLast();
    var card = el("resumeCard");
    if (last && bySlug[last]) {
      card.hidden = false;
      el("resumeTitle").textContent = bySlug[last].title;
      el("resumeBtn").href = "#/d/" + last;
    } else {
      card.hidden = true;
    }
  }

  // ---------- viewer ----------
  function moduleLabel(doc) {
    if (doc.type === "app") return "PROGRAMA";
    if (doc.type === "deck") return "APRESENTAÇÃO";
    if (doc.type === "inicio") return "COMECE POR AQUI";
    if (doc.type === "indice") return "APOSTILAS";
    var m = MODULES[doc.module - 1];
    return m.bonus ? "MÓDULO BÔNUS" : "MÓDULO " + m.n;
  }

  function showDoc(slug) {
    var doc = bySlug[slug];
    if (!doc) { location.hash = "#/"; return; }
    current = slug;
    setLast(slug);

    homeView.hidden = true;
    viewerView.hidden = false;

    el("viewerBadge").textContent = moduleLabel(doc);
    el("viewerTitle").textContent = doc.title;
    el("topbarDoc").textContent = doc.title;
    document.title = doc.title + " — Método Torque";

    var url = urlFor(doc);
    el("openBtn").href = url;
    if (frameSlug !== slug) {
      frameSlug = slug;
      docFrame.src = url;
    }

    var doneBtn = el("doneBtn");
    if (doc.type === "apostila") {
      doneBtn.hidden = false;
      syncDoneBtn();
    } else {
      doneBtn.hidden = true;
    }
    refreshSidebarState();
    closeNav();
    window.scrollTo(0, 0);
  }

  function showHome() {
    current = null;
    homeView.hidden = false;
    viewerView.hidden = true;
    el("topbarDoc").textContent = "";
    document.title = "Método Torque — Gestão de Academias de Alta Performance";
    buildHome();
    refreshSidebarState();
    closeNav();
  }

  function syncDoneBtn() {
    var btn = el("doneBtn");
    var done = isDone(current);
    btn.classList.toggle("is-done", done);
    btn.textContent = done ? "✓ Módulo concluído" : "Marcar como concluído";
  }

  el("doneBtn").addEventListener("click", function () {
    if (!current) return;
    toggleDone(current);
    syncDoneBtn();
    refreshSidebarState();
  });

  el("printBtn").addEventListener("click", function () {
    try { docFrame.contentWindow.focus(); docFrame.contentWindow.print(); } catch (e) { window.open(el("openBtn").href, "_blank"); }
  });

  // navegação interna do iframe (links entre documentos) → sincroniza o hash
  docFrame.addEventListener("load", function () {
    var path;
    try { path = docFrame.contentWindow.location.pathname; } catch (e) { return; }
    var m = /\/(docs|apps)\/([^\/]+)\.html$/.exec(path);
    var slug = null;
    if (m) {
      if (m[1] === "docs") slug = bySlug[m[2]] ? m[2] : null;
      else APPS.some(function (a) { if (a.file === "apps/" + m[2] + ".html") { slug = a.slug; return true; } return false; });
    }
    if (slug && slug !== current) {
      frameSlug = slug;
      location.hash = "#/d/" + slug;
    } else if (/\/index\.html$|\/$/.test(path) && !m) {
      // doc linkou de volta para a home
      frameSlug = null;
      location.hash = "#/";
    }
  });

  // ---------- rotas ----------
  function route() {
    var h = location.hash || "#/";
    var m = /^#\/d\/([\w-]+)$/.exec(h);
    if (m) showDoc(m[1]);
    else showHome();
  }
  window.addEventListener("hashchange", route);

  // ---------- menu mobile ----------
  function closeNav() { document.body.classList.remove("nav-open"); }
  el("menuBtn").addEventListener("click", function () { document.body.classList.toggle("nav-open"); });
  el("scrim").addEventListener("click", closeNav);
  sideNav.addEventListener("click", function (e) {
    if (e.target.closest(".nav-item")) closeNav();
  });

  // ---------- perfil do aluno ----------
  function syncPerfil() {
    var p = window.MT_perfil && window.MT_perfil();
    var box = el("sidePerfil");
    if (p && p.nome) {
      box.hidden = false;
      el("perfilNome").textContent = "👤 " + p.nome.split(" ")[0];
      box.title = p.nome + (p.email ? " · " + p.email : "");
    } else {
      box.hidden = true;
    }
  }
  el("sairBtn").addEventListener("click", function () { window.MT_sair && window.MT_sair(); });
  window.MT_onAcesso = syncPerfil;
  syncPerfil();

  // indicador de sincronização na nuvem
  window.MT_syncInfo = function (info) {
    var chip = el("syncChip");
    chip.hidden = !info.ativa;
    if (info.ultima) chip.title = "Sincronizado na nuvem às " + info.ultima.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  // ---------- logo da academia ----------
  function syncLogoBtns() {
    var tem = !!window.MTStore.getLogo();
    el("logoBtn").textContent = tem ? "🖼 Trocar logo" : "🖼 Logo da academia";
    el("logoDel").hidden = !tem;
  }
  el("logoBtn").addEventListener("click", function () { el("logoFile").click(); });
  el("logoFile").addEventListener("change", function () {
    var f = this.files[0];
    this.value = "";
    if (!f) return;
    window.MTStore.saveLogo(f).then(function () {
      syncLogoBtns();
      alert("Logo salva! Ela aparece nos programas do dia a dia e no modo TV.");
    }, function (e) {
      alert("Não foi possível salvar a logo: " + e.message);
    });
  });
  el("logoDel").addEventListener("click", function () {
    if (!confirm("Remover a logo da academia?")) return;
    window.MTStore.removeLogo();
    syncLogoBtns();
  });
  syncLogoBtns();

  // ---------- backup dos programas ----------
  el("backupExp").addEventListener("click", function () {
    window.MTStore.exportBackup();
  });
  el("backupImp").addEventListener("click", function () { el("backupFile").click(); });
  el("backupFile").addEventListener("change", function () {
    var f = this.files[0];
    if (!f) return;
    if (!confirm("Restaurar este backup? Os dados atuais dos programas serão substituídos.")) { this.value = ""; return; }
    window.MTStore.importBackup(f).then(function () {
      alert("Backup restaurado com sucesso.");
    }, function (e) {
      alert("Não foi possível restaurar: " + e.message);
    });
    this.value = "";
  });

  // ---------- PWA ----------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    });
  }

  // ---------- boot ----------
  buildSidebar();
  route();
})();
