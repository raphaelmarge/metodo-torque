/* Método Torque — camada preenchível.
 * Transforma fichas e modelos estáticos em documentos que se preenchem na
 * tela, como um programa: linhas de preenchimento (____) viram campos,
 * células vazias de tabela viram editáveis e quadradinhos de checklist viram
 * checkboxes. Tudo salvo por documento neste navegador (localStorage). */
(function () {
  "use strict";

  var slug = (location.pathname.split("/").pop() || "doc").replace(".html", "");
  var KEY = "mtpf:" + slug;

  function loadState() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  var state = loadState();
  var saveT = null;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(function () {
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
    }, 250);
  }

  var seq = 0;
  function nid() { return "f" + (seq++); }

  // ---------- transformações ----------

  // 1. linhas de preenchimento: trechos de ___ viram inputs
  function transformaSublinhados(root) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!/_{3,}/.test(n.nodeValue)) return NodeFilter.FILTER_SKIP;
        var t = n.parentElement && n.parentElement.tagName;
        if (t === "SCRIPT" || t === "STYLE" || t === "TEXTAREA") return NodeFilter.FILTER_SKIP;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (node) {
      var partes = node.nodeValue.split(/(_{3,})/);
      var frag = document.createDocumentFragment();
      partes.forEach(function (p) {
        if (/^_{3,}$/.test(p)) {
          var inp = document.createElement("input");
          inp.className = "pf-in";
          inp.dataset.pf = nid();
          inp.style.width = Math.min(320, Math.max(70, p.length * 7)) + "px";
          frag.appendChild(inp);
        } else if (p) {
          frag.appendChild(document.createTextNode(p));
        }
      });
      node.parentNode.replaceChild(frag, node);
    });
  }

  // 2. células de tabela vazias viram editáveis
  function transformaCelulas(root) {
    Array.prototype.forEach.call(root.querySelectorAll("td"), function (td) {
      if (td.querySelector("input,img,button,a")) return;
      var txt = td.textContent.replace(/[\s ]/g, "");
      if (txt === "" || /^_{1,}$/.test(txt)) {
        if (/^_{1,}$/.test(txt)) td.textContent = "";
        td.contentEditable = "true";
        td.classList.add("pf-cell");
        td.dataset.pf = nid();
      }
    });
  }

  // 2b. linhas de escrever estilizadas (elemento vazio só com borda inferior)
  function transformaLinhas(root) {
    Array.prototype.forEach.call(root.querySelectorAll("div, span"), function (el) {
      if (el.dataset.pf || el.children.length || el.textContent.trim() !== "") return;
      var cs = getComputedStyle(el);
      var temBaixo = parseFloat(cs.borderBottomWidth) >= 1 && cs.borderBottomStyle !== "none";
      var semOutras = parseFloat(cs.borderTopWidth) === 0 && parseFloat(cs.borderLeftWidth) === 0 && parseFloat(cs.borderRightWidth) === 0;
      var w = el.offsetWidth, h = el.offsetHeight;
      if (temBaixo && semOutras && w >= 40 && w <= 480 && h <= 26) {
        el.contentEditable = "true";
        el.classList.add("pf-cell");
        el.dataset.pf = nid();
        el.style.minHeight = "1.2em";
      }
    });
  }

  // 3. quadradinhos visuais (divs pequenas com borda, vazias) viram checkboxes
  function transformaQuadrados(root) {
    Array.prototype.forEach.call(root.querySelectorAll("div, span"), function (el) {
      if (el.childNodes.length && el.textContent.trim() !== "" && el.textContent.trim() !== "☐" && el.textContent.trim() !== "□") return;
      if (el.dataset.pf) return;
      var isChar = el.textContent.trim() === "☐" || el.textContent.trim() === "□";
      if (!isChar) {
        if (el.children.length) return;
        var cs = getComputedStyle(el);
        var w = el.offsetWidth, h = el.offsetHeight;
        var temBorda = parseFloat(cs.borderTopWidth) >= 1 && cs.borderTopStyle !== "none";
        if (!(temBorda && w >= 10 && w <= 30 && h >= 10 && h <= 30 && Math.abs(w - h) <= 6)) return;
      }
      el.classList.add("pf-check");
      el.dataset.pf = nid();
      if (isChar) el.textContent = "";
      el.addEventListener("click", function () {
        var on = el.classList.toggle("pf-on");
        el.textContent = on ? "✓" : "";
        state[el.dataset.pf] = on;
        save();
      });
    });
  }

  function restaura(root) {
    Array.prototype.forEach.call(root.querySelectorAll("[data-pf]"), function (el) {
      var v = state[el.dataset.pf];
      if (v == null) return;
      if (el.classList.contains("pf-check")) {
        if (v) { el.classList.add("pf-on"); el.textContent = "✓"; }
      } else if (el.tagName === "INPUT") {
        el.value = v;
      } else {
        el.textContent = v;
      }
    });
  }

  function liga(root) {
    root.addEventListener("input", function (e) {
      var el = e.target;
      if (!el.dataset || !el.dataset.pf) return;
      state[el.dataset.pf] = el.tagName === "INPUT" ? el.value : el.textContent;
      save();
    });
  }

  // ---------- estilo + selo ----------
  function estilo() {
    var s = document.createElement("style");
    s.textContent =
      ".pf-in{border:none;border-bottom:1.5px solid rgba(124,58,237,.5);background:rgba(124,58,237,.05);font:inherit;color:inherit;padding:0 4px;min-width:60px;box-sizing:border-box;}" +
      ".pf-in:focus{outline:none;border-bottom-color:#7C3AED;background:rgba(124,58,237,.1);}" +
      ".pf-cell{background:rgba(124,58,237,.04);cursor:text;min-width:40px;}" +
      ".pf-cell:focus{outline:2px solid rgba(124,58,237,.5);outline-offset:-2px;background:rgba(124,58,237,.08);}" +
      ".pf-check{cursor:pointer;display:inline-flex;align-items:center;justify-content:center;color:#16A34A;font-weight:800;user-select:none;}" +
      ".pf-check:hover{background:rgba(22,163,74,.12);}" +
      ".pf-badge{position:fixed;right:16px;bottom:16px;z-index:9999;display:flex;align-items:center;gap:10px;background:#121016;color:#E8E5F0;font:600 12.5px 'Archivo',sans-serif;padding:9px 14px;border:1px solid #2E2A38;border-left:3px solid #7C3AED;box-shadow:0 6px 24px rgba(0,0,0,.35);}" +
      ".pf-badge button{background:none;border:1px solid #3A3644;color:#A09AAE;font:600 11px 'Archivo',sans-serif;padding:4px 9px;cursor:pointer;}" +
      ".pf-badge button:hover{border-color:#7C3AED;color:#fff;}" +
      "@media print{.pf-badge{display:none!important}.pf-in{border-bottom-color:#999;background:none}.pf-cell{background:none}}";
    document.head.appendChild(s);
  }

  function selo(total) {
    var b = document.createElement("div");
    b.className = "pf-badge";
    b.innerHTML = "✎ Ficha preenchível — salva neste navegador <button>Limpar</button>";
    b.querySelector("button").addEventListener("click", function () {
      if (!confirm("Limpar tudo o que foi preenchido nesta ficha?")) return;
      localStorage.removeItem(KEY);
      location.reload();
    });
    document.body.appendChild(b);
  }

  // ---------- boot: espera o documento dc renderizar ----------
  var tent = 0, ultimo = -1, estaveis = 0;
  var timer = setInterval(function () {
    tent++;
    var len = (document.body.innerText || "").length;
    if (len > 150 && len === ultimo) estaveis++;
    else estaveis = 0;
    ultimo = len;
    if (estaveis >= 2 || tent > 40) {
      clearInterval(timer);
      if (len < 150) return;
      try {
        estilo();
        transformaSublinhados(document.body);
        transformaCelulas(document.body);
        transformaLinhas(document.body);
        transformaQuadrados(document.body);
        if (seq > 0) {
          restaura(document.body);
          liga(document.body);
          selo(seq);
        }
      } catch (e) { /* nunca quebrar o documento */ }
    }
  }, 350);
})();
