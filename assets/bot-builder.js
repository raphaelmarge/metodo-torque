/* TORQUE ON — construtor visual de automações (compartilhado: Personal e Nutrição).
 * Vários fluxos nomeados, balões arrastáveis, ligações por toque e paleta de ações.
 * Mesmo formato de blocos do chatbot da academia (chat.html/webhook):
 * { ativo, inicio, blocos: [{ id, nome, tipo, texto, destino?, opcoes?, pos:{x,y} }] }. */
(function () {
  function esc(t) { return String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }

  var TIPOS = {
    mensagem: { icone: "💬", nome: "Mensagem" },
    menu: { icone: "🔢", nome: "Menu" },
    pergunta: { icone: "❓", nome: "Pergunta" },
    equipe: { icone: "🙋", nome: "Equipe" },
  };

  self.MT_BotBuilder = function (opts) {
    var raiz = opts.raiz;
    var cor = opts.cor || "#7c3aed";
    var reg = opts.reg;
    if (!reg || !reg.lista || !reg.lista.length) {
      reg = { principal: "a1", lista: [{ id: "a1", nome: "Automação principal", dados: { ativo: true, inicio: "b1", blocos: [{ id: "b1", nome: "Boas-vindas", tipo: "mensagem", texto: "Olá! 👋", pos: { x: 30, y: 30 } }] } }] };
    }
    var selId = reg.lista.some(function (a) { return a.id === reg.principal; }) ? reg.principal : reg.lista[0].id;
    var ligando = null; // { blocoId, opIdx (ou null p/ destino direto) }
    var arraste = null;

    function salva() { if (opts.salva) opts.salva(reg); }
    function autoDe(id) { return reg.lista.find(function (a) { return a.id === id; }); }
    function fluxo() { return autoDe(selId).dados; }
    function bloco(id) { return (fluxo().blocos || []).find(function (b) { return b.id === id; }); }
    function novoIdAuto() { var i = 1; while (reg.lista.some(function (a) { return a.id === "a" + i; })) i++; return "a" + i; }
    function novoIdBloco() { var i = 1; while (fluxo().blocos.some(function (b) { return b.id === "b" + i; })) i++; return "b" + i; }

    function blocoHTML(b) {
      var f = fluxo();
      var ehInicio = f.inicio === b.id;
      var t = TIPOS[b.tipo] || TIPOS.mensagem;
      var h = '<div class="bb-bloco" data-bb="' + b.id + '" style="position:absolute;left:' + (b.pos.x || 30) + "px;top:" + (b.pos.y || 30) + 'px;width:250px;background:#fff;border:1.5px solid ' + (ehInicio ? cor : "#d8d4e2") + ';border-radius:12px;box-shadow:0 2px 8px rgba(20,16,30,.08);' + (ligando ? "outline:2px dashed " + cor + ";outline-offset:2px;cursor:crosshair;" : "") + '">';
      h += '<div class="bb-drag" data-bbdrag="' + b.id + '" style="display:flex;align-items:center;gap:6px;padding:8px 10px;cursor:grab;border-bottom:1px solid #eee;background:#faf9fd;border-radius:12px 12px 0 0;touch-action:none;">' +
        '<button data-bbinicio="' + b.id + '" title="A conversa começa aqui" style="background:none;border:none;cursor:pointer;font-size:13px;opacity:' + (ehInicio ? 1 : 0.35) + ';">▶</button>' +
        '<b style="font-size:11px;letter-spacing:.05em;color:' + cor + ';">' + t.icone + " " + t.nome.toUpperCase() + "</b>" +
        '<span style="flex:1"></span><button data-bbrm="' + b.id + '" style="background:none;border:none;color:#e11d48;cursor:pointer;font-weight:800;">✕</button></div>';
      h += '<div style="padding:8px 10px;display:flex;flex-direction:column;gap:6px;">' +
        '<input data-bbnome="' + b.id + '" value="' + esc(b.nome) + '" placeholder="Nome do passo" style="width:100%;border:1px solid #e5e2ee;border-radius:7px;padding:6px 8px;font-family:inherit;font-size:12.5px;font-weight:700;">' +
        '<textarea data-bbtexto="' + b.id + '" rows="2" placeholder="' + (b.tipo === "equipe" ? "Mensagem antes de chamar você (opcional)" : "O que o robô fala…") + '" style="width:100%;border:1px solid #e5e2ee;border-radius:7px;padding:6px 8px;font-family:inherit;font-size:12.5px;resize:vertical;">' + esc(b.texto) + "</textarea>";
      if (b.tipo === "menu") {
        h += (b.opcoes || []).map(function (o, i) {
          var alvo = o.destino && bloco(o.destino);
          return '<div style="display:flex;gap:5px;align-items:center;">' +
            '<span style="font-size:11px;color:#888;">' + (i + 1) + "</span>" +
            '<input data-bbop="' + b.id + ":" + i + '" value="' + esc(o.rotulo) + '" placeholder="Opção ' + (i + 1) + '" style="flex:1;min-width:0;border:1px solid #e5e2ee;border-radius:7px;padding:5px 7px;font-family:inherit;font-size:12px;">' +
            '<button data-bbliga="' + b.id + ":" + i + '" title="Ligar esta opção num passo" style="background:' + (alvo ? cor : "#fff") + ";color:" + (alvo ? "#fff" : cor) + ";border:1.5px solid " + cor + ';border-radius:99px;padding:4px 9px;font-size:10.5px;cursor:pointer;font-family:inherit;white-space:nowrap;">' + (alvo ? "→ " + esc(alvo.nome).slice(0, 10) : "🎯 ligar") + "</button>" +
            '<button data-bboprm="' + b.id + ":" + i + '" style="background:none;border:none;color:#e11d48;cursor:pointer;">✕</button></div>';
        }).join("") + '<button data-bbopadd="' + b.id + '" style="background:none;border:1.5px dashed #cfc9de;border-radius:8px;padding:5px;font-size:11.5px;color:#666;cursor:pointer;font-family:inherit;">+ opção</button>';
      } else if (b.tipo !== "equipe") {
        var alvoD = b.destino && bloco(b.destino);
        h += '<button data-bbliga="' + b.id + ':d" style="align-self:flex-end;background:' + (alvoD ? cor : "#fff") + ";color:" + (alvoD ? "#fff" : cor) + ";border:1.5px solid " + cor + ';border-radius:99px;padding:4px 11px;font-size:10.5px;cursor:pointer;font-family:inherit;">' + (alvoD ? "→ " + esc(alvoD.nome).slice(0, 14) : "🎯 ligar próximo passo") + "</button>";
      }
      return h + "</div></div>";
    }

    function linhas() {
      var f = fluxo();
      var svg = "";
      function curva(a, b2, tracejada) {
        var ba = bloco(a), bb = bloco(b2);
        if (!ba || !bb) return "";
        var x1 = (ba.pos.x || 0) + 250, y1 = (ba.pos.y || 0) + 40;
        var x2 = bb.pos.x || 0, y2 = (bb.pos.y || 0) + 40;
        return '<path d="M' + x1 + " " + y1 + " C " + (x1 + 50) + " " + y1 + ", " + (x2 - 50) + " " + y2 + ", " + x2 + " " + y2 + '" fill="none" stroke="' + cor + '" stroke-width="1.8" opacity=".65"' + (tracejada ? ' stroke-dasharray="5 4"' : "") + "/>";
      }
      (f.blocos || []).forEach(function (b) {
        if (b.destino) svg += curva(b.id, b.destino);
        (b.opcoes || []).forEach(function (o) { if (o.destino) svg += curva(b.id, o.destino); });
      });
      return svg;
    }

    function render() {
      var f = fluxo();
      var maxX = 0, maxY = 0;
      (f.blocos || []).forEach(function (b) { maxX = Math.max(maxX, b.pos.x || 0); maxY = Math.max(maxY, b.pos.y || 0); });
      var largura = Math.max(640, maxX + 300), altura = Math.max(340, maxY + 260);
      raiz.innerHTML =
        '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:10px;">' +
        '<select id="bbSel" style="min-width:170px;padding:7px 8px;border:1px solid var(--linha);border-radius:8px;font-family:inherit;font-size:13px;">' +
        reg.lista.map(function (a) { return '<option value="' + a.id + '"' + (a.id === selId ? " selected" : "") + ">" + esc(a.nome) + (a.id === reg.principal ? " · 📶" : "") + "</option>"; }).join("") + "</select>" +
        '<button class="btn sec mini" id="bbNova">+ Nova</button>' +
        '<button class="btn sec mini" id="bbRenomear">Renomear</button>' +
        '<button class="btn sec mini" id="bbDuplicar">Duplicar</button>' +
        '<button class="btn sec mini" id="bbExcluir">✕</button>' +
        '<span style="flex:1"></span>' +
        '<button class="btn mini" id="bbPrincipal" style="background:' + (selId === reg.principal ? "#16a34a" : cor) + ';">' + (selId === reg.principal ? "📶 Esta vai pro WhatsApp" : "📶 Usar esta no WhatsApp") + "</button></div>" +
        '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px;">' +
        Object.keys(TIPOS).map(function (t) { return '<button class="btn sec mini" data-bbadd="' + t + '">+ ' + TIPOS[t].icone + " " + TIPOS[t].nome + "</button>"; }).join("") +
        '<button class="btn sec mini" data-bbadd="link">+ 🔗 Link</button></div>' +
        (ligando ? '<div style="background:#fff7e6;border:1px solid #f0c36d;border-radius:8px;padding:7px 10px;font-size:12px;margin-bottom:8px;">🎯 Toque no balão de DESTINO (ou <button id="bbCancelaLiga" style="border:none;background:none;color:#b45309;font-weight:700;cursor:pointer;text-decoration:underline;">cancelar</button>)</div>' : "") +
        '<div id="bbWrap" style="overflow:auto;border:1px solid var(--linha);border-radius:12px;background:#faf9fd;max-height:480px;">' +
        '<div id="bbCanvas" style="position:relative;width:' + largura + "px;height:" + altura + 'px;">' +
        '<svg style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;">' + linhas() + "</svg>" +
        (f.blocos || []).map(blocoHTML).join("") + "</div></div>";
      liga();
    }

    function liga() {
      raiz.querySelector("#bbSel").onchange = function () { selId = this.value; ligando = null; render(); };
      raiz.querySelector("#bbNova").onclick = function () {
        var nome = prompt("Nome da nova automação (ex.: Cobrança, Boas-vindas, Reagendamento):");
        if (!nome || !nome.trim()) return;
        var id = novoIdAuto();
        reg.lista.push({ id: id, nome: nome.trim(), dados: { ativo: true, inicio: "b1", blocos: [{ id: "b1", nome: "Boas-vindas", tipo: "mensagem", texto: "Olá! 👋", pos: { x: 30, y: 30 } }] } });
        selId = id; salva(); render();
      };
      raiz.querySelector("#bbRenomear").onclick = function () {
        var a = autoDe(selId);
        var nome = prompt("Novo nome:", a.nome);
        if (nome && nome.trim()) { a.nome = nome.trim(); salva(); render(); }
      };
      raiz.querySelector("#bbDuplicar").onclick = function () {
        var a = autoDe(selId);
        var id = novoIdAuto();
        reg.lista.push({ id: id, nome: a.nome + " (cópia)", dados: JSON.parse(JSON.stringify(a.dados)) });
        selId = id; salva(); render();
      };
      raiz.querySelector("#bbExcluir").onclick = function () {
        if (reg.lista.length <= 1) { alert("Essa é a única automação — crie outra antes de excluir."); return; }
        if (!confirm('Excluir a automação "' + autoDe(selId).nome + '"?')) return;
        reg.lista = reg.lista.filter(function (a) { return a.id !== selId; });
        if (reg.principal === selId) reg.principal = reg.lista[0].id;
        selId = reg.lista[0].id; salva(); render();
      };
      raiz.querySelector("#bbPrincipal").onclick = function () { reg.principal = selId; salva(); render(); };
      var cancela = raiz.querySelector("#bbCancelaLiga");
      if (cancela) cancela.onclick = function () { ligando = null; render(); };

      raiz.querySelectorAll("[data-bbadd]").forEach(function (btn) {
        btn.onclick = function () {
          var tipo = btn.dataset.bbadd;
          var ehLink = tipo === "link";
          if (ehLink) tipo = "mensagem";
          var f = fluxo();
          var b = { id: novoIdBloco(), nome: ehLink ? "Enviar link" : TIPOS[tipo].nome, tipo: tipo,
            texto: ehLink ? "Aqui está o link: https://www.torqueon.com.br" : "",
            pos: { x: 30 + (f.blocos.length % 3) * 290, y: 30 + Math.floor(f.blocos.length / 3) * 210 } };
          if (tipo === "menu") b.opcoes = [{ rotulo: "", destino: "" }];
          f.blocos.push(b);
          if (!f.inicio || !bloco(f.inicio)) f.inicio = b.id;
          salva(); render();
        };
      });

      var canvas = raiz.querySelector("#bbCanvas");
      canvas.addEventListener("click", function (e) {
        var alvo = e.target.closest("[data-bb]");
        if (ligando && alvo) {
          var destinoId = alvo.getAttribute("data-bb");
          var b = bloco(ligando.blocoId);
          if (b && destinoId !== ligando.blocoId) {
            if (ligando.opIdx === "d") b.destino = destinoId;
            else b.opcoes[+ligando.opIdx].destino = destinoId;
          }
          ligando = null; salva(); render();
          return;
        }
        var liga2 = e.target.closest("[data-bbliga]");
        if (liga2) {
          var pl = liga2.getAttribute("data-bbliga").split(":");
          ligando = { blocoId: pl[0], opIdx: pl[1] };
          render(); return;
        }
        var ini = e.target.closest("[data-bbinicio]");
        if (ini) { fluxo().inicio = ini.getAttribute("data-bbinicio"); salva(); render(); return; }
        var rm = e.target.closest("[data-bbrm]");
        if (rm) {
          var f2 = fluxo(), id2 = rm.getAttribute("data-bbrm");
          f2.blocos = f2.blocos.filter(function (b2) { return b2.id !== id2; });
          f2.blocos.forEach(function (b2) {
            if (b2.destino === id2) delete b2.destino;
            (b2.opcoes || []).forEach(function (o) { if (o.destino === id2) o.destino = ""; });
          });
          if (f2.inicio === id2) f2.inicio = f2.blocos.length ? f2.blocos[0].id : "";
          salva(); render(); return;
        }
        var opadd = e.target.closest("[data-bbopadd]");
        if (opadd) { bloco(opadd.getAttribute("data-bbopadd")).opcoes.push({ rotulo: "", destino: "" }); salva(); render(); return; }
        var oprm = e.target.closest("[data-bboprm]");
        if (oprm) { var pr = oprm.getAttribute("data-bboprm").split(":"); bloco(pr[0]).opcoes.splice(+pr[1], 1); salva(); render(); return; }
      });
      canvas.addEventListener("change", function (e) {
        var nome = e.target.getAttribute && e.target.getAttribute("data-bbnome");
        var texto = e.target.getAttribute && e.target.getAttribute("data-bbtexto");
        var op = e.target.getAttribute && e.target.getAttribute("data-bbop");
        if (nome) { bloco(nome).nome = e.target.value; salva(); render(); }
        else if (texto) { bloco(texto).texto = e.target.value; salva(); }
        else if (op) { var po = op.split(":"); bloco(po[0]).opcoes[+po[1]].rotulo = e.target.value; salva(); render(); }
      });
      canvas.addEventListener("pointerdown", function (e) {
        var alca = e.target.closest("[data-bbdrag]");
        if (!alca || e.target.closest("button")) return;
        var b = bloco(alca.getAttribute("data-bbdrag"));
        arraste = { b: b, x0: e.clientX, y0: e.clientY, px: b.pos.x || 0, py: b.pos.y || 0 };
        e.preventDefault();
      });
      canvas.addEventListener("pointermove", function (e) {
        if (!arraste) return;
        arraste.b.pos.x = Math.max(0, arraste.px + (e.clientX - arraste.x0));
        arraste.b.pos.y = Math.max(0, arraste.py + (e.clientY - arraste.y0));
        var el2 = canvas.querySelector('[data-bb="' + arraste.b.id + '"]');
        if (el2) { el2.style.left = arraste.b.pos.x + "px"; el2.style.top = arraste.b.pos.y + "px"; }
        canvas.querySelector("svg").innerHTML = linhas();
      });
      ["pointerup", "pointercancel", "pointerleave"].forEach(function (ev) {
        canvas.addEventListener(ev, function () { if (arraste) { arraste = null; salva(); } });
      });
    }

    render();
    return {
      reg: function () { return reg; },
      principal: function () { return JSON.parse(JSON.stringify(autoDe(reg.principal).dados)); },
      render: render,
    };
  };
})();
