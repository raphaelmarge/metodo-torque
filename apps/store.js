/* Método Torque — armazenamento compartilhado dos programas.
 * Dados em localStorage (JSON, prefixo mtapp:) e fotos em IndexedDB.
 * Mesma origem = os mesmos dados aparecem no shell, nos programas e no modo TV. */
(function () {
  "use strict";

  // proteção leve (só nas páginas de programas em /apps/, nunca no shell):
  // com o cadastro exigido e ainda não feito, volta à entrada
  try {
    if (self.MT_ACCESS && self.MT_ACCESS.exigirCadastro &&
        location.pathname.indexOf("/apps/") !== -1 &&
        !localStorage.getItem("mtapp:perfil")) {
      window.top.location.replace("../index.html");
    }
  } catch (e) {}

  var PREFIX = "mtapp:";

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(PREFIX + key);
      if (!raw) return fallback;
      var val = JSON.parse(raw);
      // dados parciais (sync/importação/versões antigas) não podem derrubar telas:
      // se o fallback é objeto plano, garante as chaves padrão que faltarem
      if (val && fallback && typeof val === "object" && typeof fallback === "object" &&
          !Array.isArray(val) && !Array.isArray(fallback)) {
        for (var k in fallback) { if (val[k] == null) val[k] = fallback[k]; }
      }
      return val;
    } catch (e) { return fallback; }
  }

  var ouvintes = [];
  var LOG_KEY = PREFIX + "logGeral";
  var LOG_MAX = 400;
  var SEM_LOG = { logGeral: 1, logo: 1, academia: 1 };
  window.__MT_IMPORTANDO = window.__MT_IMPORTANDO || false;

  function contaRegistros(v) {
    if (Array.isArray(v)) return v.length;
    if (v && typeof v === "object") {
      var maior = null;
      Object.keys(v).forEach(function (k) { if (Array.isArray(v[k]) && (maior == null || v[k].length > maior)) maior = v[k].length; });
      return maior;
    }
    return null;
  }
  function registraLog(key, antes, depois) {
    if (SEM_LOG[key] || window.__MT_IMPORTANDO) return;
    try {
      var por = "";
      try { por = (JSON.parse(localStorage.getItem(PREFIX + "perfil")) || {}).nome || ""; } catch (e) {}
      var na = contaRegistros(antes), nd = contaRegistros(depois);
      var resumo = na == null || nd == null ? "atualizado" :
        na === nd ? na + " registro(s) — editado" :
        nd > na ? "incluído (" + na + " → " + nd + ")" : "excluído (" + na + " → " + nd + ")";
      var log = [];
      try { log = JSON.parse(localStorage.getItem(LOG_KEY)) || []; } catch (e) {}
      log.push({ k: key, por: por, em: new Date().toISOString(), resumo: resumo });
      if (log.length > LOG_MAX) log = log.slice(-LOG_MAX);
      localStorage.setItem(LOG_KEY, JSON.stringify(log));
    } catch (e) {}
  }

  var AUD_IGNORA = { auditoria: 1, config: 0 };
  function auditoria(chave) {
    try {
      if (chave === "auditoria") return;
      var quem = (sync.email || (JSON.parse(localStorage.getItem("mtapp:perfil") || "{}").nome) || "aparelho local");
      var log = read("auditoria", { registros: [] });
      var ult = log.registros[log.registros.length - 1];
      var agora = new Date();
      var quando = todayISO() + "T" + agora.toTimeString().slice(0, 5);
      // não spam: mesma pessoa + mesmo módulo dentro do mesmo minuto = 1 registro
      if (ult && ult.k === chave && ult.quem === quem && ult.q === quando) return;
      log.registros.push({ q: quando, k: chave, quem: quem });
      if (log.registros.length > 800) log.registros = log.registros.slice(-800);
      try { localStorage.setItem(PREFIX + "auditoria", JSON.stringify(log)); } catch (e) {}
      marcaTs("auditoria");
      agendaEnvio("auditoria");
    } catch (e) {}
  }

  function write(key, value) {
    var antes;
    try { var raw = localStorage.getItem(PREFIX + key); antes = raw ? JSON.parse(raw) : null; } catch (e) { antes = null; }
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    registraLog(key, antes, value);
    marcaTs(PREFIX + key);
    agendaEnvio(PREFIX + key);
    ouvintes.forEach(function (cb) { try { cb(key); } catch (e) {} });    auditoria(key);
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function todayISO(d) {
    d = d || new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function monthKey(d) {
    d = d || new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1);
  }

  function fmtBRL(v) {
    return (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  }

  function fmtData(iso) {
    if (!iso) return "—";
    var p = iso.split("-");
    return p[2] + "/" + p[1] + "/" + p[0];
  }

  // ---------- fotos (IndexedDB) ----------
  var DB_NAME = "mt-fotos", STORE = "fotos", dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  // Comprime a imagem (máx. 1280px, JPEG) e salva; retorna o id.
  function savePhoto(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        var scale = Math.min(1, 1280 / Math.max(img.width, img.height));
        var c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        var dataUrl = c.toDataURL("image/jpeg", 0.8);
        var id = uid();
        openDB().then(function (db) {
          var tx = db.transaction(STORE, "readwrite");
          tx.objectStore(STORE).put(dataUrl, id);
          tx.oncomplete = function () { resolve(id); };
          tx.onerror = function () { reject(tx.error); };
        }, reject);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("imagem inválida")); };
      img.src = url;
    });
  }

  function getPhoto(id) {
    return openDB().then(function (db) {
      return new Promise(function (resolve) {
        var req = db.transaction(STORE).objectStore(STORE).get(id);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { resolve(null); };
      });
    });
  }

  function deletePhoto(id) {
    return openDB().then(function (db) {
      db.transaction(STORE, "readwrite").objectStore(STORE).delete(id);
    });
  }

  // ---------- logo da academia (do cliente) ----------
  // Guardada como dataURL PNG (preserva transparência), reduzida para caber no localStorage.
  function saveLogo(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        var scale = Math.min(1, 240 / img.height, 720 / img.width);
        var c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        var dataUrl = c.toDataURL("image/png");
        if (dataUrl.length > 900000) { reject(new Error("imagem muito pesada — use um arquivo menor")); return; }
        write("logo", dataUrl);
        resolve(dataUrl);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("imagem inválida")); };
      img.src = url;
    });
  }
  function getLogo() { return read("logo", null); }
  function removeLogo() { write("logo", null); }

  // Preenche <img id="logoCliente"> (se existir na página) com a logo salva.
  function aplicaLogo() {
    var el = document.getElementById("logoCliente");
    if (!el) return;
    var logo = getLogo();
    if (logo) { el.src = logo; el.hidden = false; }
    else { el.removeAttribute("src"); el.hidden = true; }
  }

  // ---------- backup ----------
  var BACKUP_KEYS = ["alunos", "metas", "manut", "checklist", "funil", "exper", "inad", "diario", "grade", "agenda", "contas", "treinos", "saude", "nps", "produtos", "caixa", "comissoes", "docs", "armarios", "wod", "equipe", "convenios", "vouchers", "turmas", "reajustes", "indicacoes", "parq", "fluxo", "personais", "fornecedores", "recompensas", "automacao", "bancos", "descontos", "adquirentes", "suspensoes", "contagens", "aprovacoes", "reposicoes", "niveis", "convidados", "config", "logo", "loja", "agregadores", "biometria", "permissoes", "funcionamento", "servicos", "wellhub", "areas", "atividades", "aulasPersonal", "appAluno", "auditoria", "feriados", "videoteca", "metasNegocio", "treinoDestaques"];

  function exportBackup() {
    var data = { formato: "metodo-torque-backup", versao: 1, exportado: new Date().toISOString() };
    BACKUP_KEYS.forEach(function (k) { data[k] = read(k, null); });
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "metodo-torque-backup-" + todayISO() + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importBackup(file) {
    return file.text().then(function (txt) {
      var data = JSON.parse(txt);
      if (data.formato !== "metodo-torque-backup") throw new Error("arquivo não é um backup do Método Torque");
      window.__MT_IMPORTANDO = true;
      try { BACKUP_KEYS.forEach(function (k) { if (data[k] != null) write(k, data[k]); }); }
      finally { window.__MT_IMPORTANDO = false; }
    });
  }

  // Notifica mudanças: no mesmo contexto (write) e entre abas/iframes (storage).
  // Preenche um <datalist> com os colaboradores ativos (programa Colaboradores)
  // e liga os inputs informados a ele — sugestão de professor/consultor em toda tela.
  function equipeDatalist(ids) {
    try {
      var eq = read("equipe", { colaboradores: [] }).colaboradores || [];
      var ativos = eq.filter(function (c) { return c.ativo !== false && c.nome; });
      if (!ativos.length) return;
      var dl = document.getElementById("mtEquipe");
      if (!dl) {
        dl = document.createElement("datalist");
        dl.id = "mtEquipe";
        document.body.appendChild(dl);
      }
      dl.innerHTML = ativos.map(function (c) {
        return "<option>" + String(c.nome).replace(/[<>&]/g, "") + "</option>";
      }).join("");
      (ids || []).forEach(function (id) {
        var el = document.getElementById(id);
        if (el && !el.getAttribute("list")) el.setAttribute("list", "mtEquipe");
      });
    } catch (e) {}
  }

  function onChange(cb) {
    ouvintes.push(cb);
    window.addEventListener("storage", function (e) {
      if (e.key && e.key.indexOf(PREFIX) === 0) cb(e.key.slice(PREFIX.length));
    });
  }

  /* ==================== SINCRONIZAÇÃO ONLINE (Supabase) ====================
   * Cada chave mtapp:/mtpf: vira uma linha (user_id, chave, valor, atualizado)
   * na tabela `dados`. Última escrita vence, por chave. Fotos (IndexedDB)
   * ficam locais nesta versão. */
  var SYNC_PREFIXES = ["mtapp:", "mtpf:"];
  var SYNC_IGNORA = { "mtapp:perfil": 1 };
  var TSKEY = "mtsync:ts";

  function tsMap() {
    try { return JSON.parse(localStorage.getItem(TSKEY)) || {}; } catch (e) { return {}; }
  }
  function marcaTs(chaveFull, quando) {
    var m = tsMap();
    m[chaveFull] = quando || new Date().toISOString();
    try { localStorage.setItem(TSKEY, JSON.stringify(m)); } catch (e) {}
  }

  var sync = { client: null, aid: null, sujas: {}, timer: null, aplicando: false, ultima: null };

  function sincronizavel(chaveFull) {
    if (SYNC_IGNORA[chaveFull]) return false;
    return SYNC_PREFIXES.some(function (p) { return chaveFull.indexOf(p) === 0; });
  }

  function agendaEnvio(chaveFull) {
    if (!sync.client || sync.aplicando || !sincronizavel(chaveFull)) return;
    sync.sujas[chaveFull] = true;
    clearTimeout(sync.timer);
    sync.timer = setTimeout(enviaSujas, 1200);
  }

  function enviaSujas() {
    if (!sync.client) return;
    var chaves = Object.keys(sync.sujas);
    if (!chaves.length) return;
    sync.sujas = {};
    var m = tsMap();
    var linhas = chaves.map(function (k) {
      var raw = localStorage.getItem(k);
      var valor = null;
      try { valor = raw == null ? null : JSON.parse(raw); } catch (e) { valor = raw; }
      return { academia_id: sync.aid, chave: k, valor: valor, atualizado: m[k] || new Date().toISOString() };
    });
    sync.client.from("dados").upsert(linhas).then(function (r) {
      if (r.error) {
        // devolve à fila para tentar de novo no próximo ciclo
        chaves.forEach(function (k) { sync.sujas[k] = true; });
      } else {
        avisaStatus();
      }
    }, function () {
      chaves.forEach(function (k) { sync.sujas[k] = true; });
    });
  }

  function puxa() {
    if (!sync.client) return Promise.resolve();
    return sync.client.from("dados").select("chave,valor,atualizado").eq("academia_id", sync.aid).then(function (r) {
      if (r.error || !r.data) return;
      var m = tsMap();
      var mudou = [];
      r.data.forEach(function (row) {
        if (!sincronizavel(row.chave)) return;
        var local = m[row.chave];
        if (!local || row.atualizado > local) {
          sync.aplicando = true;
          try {
            localStorage.setItem(row.chave, JSON.stringify(row.valor));
            marcaTs(row.chave, row.atualizado);
            mudou.push(row.chave);
          } catch (e) {}
          sync.aplicando = false;
        } else if (row.atualizado < local) {
          sync.sujas[row.chave] = true; // local mais novo: manda de volta
        }
      });
      // chaves locais que a nuvem ainda não tem
      var remotas = {};
      r.data.forEach(function (row) { remotas[row.chave] = 1; });
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (sincronizavel(k) && !remotas[k]) { marcaTs(k, tsMap()[k]); sync.sujas[k] = true; }
      }
      if (Object.keys(sync.sujas).length) enviaSujas();
      sync.ultima = new Date();
      avisaStatus();
      if (mudou.length) {
        ouvintes.forEach(function (cb) {
          mudou.forEach(function (k) {
            if (k.indexOf(PREFIX) === 0) { try { cb(k.slice(PREFIX.length)); } catch (e) {} }
          });
        });
      }
    }, function () {});
  }

  function avisaStatus() {
    if (window.MT_syncInfo) {
      try { window.MT_syncInfo({ ativa: !!sync.client, ultima: sync.ultima }); } catch (e) {}
    }
  }

  function iniciaSync() {
    var cfg = self.MT_CLOUD;
    if (!cfg || !cfg.url || !cfg.anonKey || !window.supabase || sync.client) return;
    var client = window.MT_supabase || window.supabase.createClient(cfg.url, cfg.anonKey);
    client.auth.getSession().then(function (r) {
      var sess = r.data && r.data.session;
      if (!sess) return; // sem login, sem sync
      sync.email = (sess.user && sess.user.email) || "";

      // resolve a academia do usuário (cache local para funcionar offline)
      var acad = null;
      try { acad = JSON.parse(localStorage.getItem("mtapp:academia")); } catch (e) {}
      var resolve = acad && acad.id
        ? Promise.resolve(acad.id)
        : client.from("membros").select("academia_id, papel, nome, academias(nome, codigo_equipe)").then(function (rm) {
            var m = rm.data && rm.data[0];
            if (!m) return null;
            try {
              localStorage.setItem("mtapp:academia", JSON.stringify({
                id: m.academia_id, papel: m.papel,
                nome: (m.academias && m.academias.nome) || "",
                codigo_equipe: m.papel === "dono" && m.academias ? m.academias.codigo_equipe : "",
              }));
            } catch (e) {}
            return m.academia_id;
          }, function () { return null; });

      resolve.then(function (aid) {
        if (!aid) return; // sem academia vinculada ainda
        sync.client = client;
        sync.aid = aid;
        depoisDeLigar();
      });
      return;

      function depoisDeLigar() {
      puxa();
      // aplica alterações vindas de iframes/outras abas deste aparelho
      window.addEventListener("storage", function (e) {
        if (e.key && sincronizavel(e.key) && !sync.aplicando) {
          marcaTs(e.key);
          agendaEnvio(e.key);
        }
      });
      // só a janela principal fica puxando da nuvem (evita tráfego repetido)
      if (window === window.top) {
        setInterval(puxa, 30000);
        window.addEventListener("focus", puxa);
        document.addEventListener("visibilitychange", function () {
          if (!document.hidden) puxa();
        });
      }
      }
    }, function () {});
  }

  // ---------- clientes ativos (regra do EVO: contrato especial/VIP não conta) ----------
  // recebe o objeto do aluno e a lista de planos; retorna o contrato "ativo que conta" ou null
  function contratoAtivoConta(aluno, planos) {
    planos = planos || (read("alunos", { planos: [] }).planos || []);
    var espId = {};
    planos.forEach(function (p) { if (p.especial) espId[p.id] = true; });
    return (aluno.contratos || []).find(function (c) {
      return (c.status === "ativo" || c.status === "congelado") && !c.principalId && !espId[c.planoId];
    }) || null;
  }
  function ehClienteAtivo(aluno, planos) {
    return aluno.status !== "inativo" && !!contratoAtivoConta(aluno, planos);
  }

  // ---------- feriados e horas de ponto (horista dom/feriado) ----------
  // Páscoa (algoritmo de Gauss) para os feriados móveis
  function pascoaDe(ano) {
    var a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
    var d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    var g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
    var m = Math.floor((a + 11 * h + 22 * l) / 451);
    var mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(ano, mes - 1, dia, 12);
  }
  function isoDe(dt) {
    return dt.getFullYear() + "-" + ("0" + (dt.getMonth() + 1)).slice(-2) + "-" + ("0" + dt.getDate()).slice(-2);
  }
  function feriadosDoAno(ano) {
    var fixos = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"];
    var set = {};
    fixos.forEach(function (md) { set[ano + "-" + md] = 1; });
    var pas = pascoaDe(ano);
    [-47, -2, 60].forEach(function (delta) { // Carnaval (terça), Sexta-feira Santa, Corpus Christi
      var d = new Date(pas); d.setDate(d.getDate() + delta);
      set[isoDe(d)] = 1;
    });
    return set;
  }
  function ehDomingoOuFeriado(iso) {
    if (!iso) return false;
    var d = new Date(iso.slice(0, 10) + "T12:00");
    if (d.getDay() === 0) return true;
    if (feriadosDoAno(d.getFullYear())[iso.slice(0, 10)]) return true;
    var extras = read("feriados", { datas: [] }).datas || [];
    if (extras.indexOf(iso.slice(0, 10)) !== -1) return true;
    var cadastrados = read("funcionamento", { feriados: [] }).feriados || [];
    return cadastrados.some(function (f) { return f.data === iso.slice(0, 10); });
  }
  // horário de funcionamento do dia: feriado cadastrado > feriado nacional (segue domingo) > dia da semana
  function horarioDoDia(iso) {
    iso = (iso || todayISO()).slice(0, 10);
    var f = read("funcionamento", { dias: {}, feriados: [], config: {} });
    function faixasDe(h) {
      var fx = [];
      if (h && h.de && h.ate) fx.push({ de: h.de, ate: h.ate });
      if (h && h.de2 && h.ate2) fx.push({ de: h.de2, ate: h.ate2 });
      return fx;
    }
    var fer = (f.feriados || []).find(function (x) { return x.data === iso; });
    if (fer) {
      var fx0 = faixasDe(fer.de ? { de: fer.de, ate: fer.ate } : null);
      return { faixas: fx0, fechado: !fx0.length, feriado: fer.nome || "feriado" };
    }
    var d = new Date(iso + "T12:00");
    var extras = read("feriados", { datas: [] }).datas || [];
    var nacional = !!feriadosDoAno(d.getFullYear())[iso] || extras.indexOf(iso) !== -1;
    var dias = f.dias || {};
    var cfg = f.config || {};
    if (nacional && cfg.feriadoComoDomingo !== false) {
      var hd = dias[0] || dias["0"];
      var fx1 = faixasDe(hd);
      return { faixas: fx1, fechado: !fx1.length, feriado: "feriado" };
    }
    var h = dias[d.getDay()] || dias[String(d.getDay())];
    var fx = faixasDe(h);
    return { faixas: fx, fechado: !fx.length, feriado: nacional ? "feriado" : "" };
  }
  function abertoAgora() {
    var hd = horarioDoDia(todayISO());
    var ag = new Date();
    var hhmm = ("0" + ag.getHours()).slice(-2) + ":" + ("0" + ag.getMinutes()).slice(-2);
    var aberto = hd.faixas.some(function (fx) { return hhmm >= fx.de && hhmm <= fx.ate; });
    return { aberto: aberto, hoje: hd };
  }

  // soma horas batidas (pares entrada→saída no mesmo dia) separando dom/feriado
  function horasPonto(ponto, nome, mesKey) {
    var pts = (ponto || []).filter(function (pt) { return pt.nome === nome && (pt.quando || "").slice(0, 7) === mesKey; })
      .sort(function (a, b) { return a.quando < b.quando ? -1 : 1; });
    var norm = 0, domfer = 0, aberta = null;
    pts.forEach(function (pt) {
      if (pt.tipo === "entrada") aberta = pt.quando;
      else if (pt.tipo === "saida" && aberta && aberta.slice(0, 10) === pt.quando.slice(0, 10)) {
        var h = (new Date(pt.quando) - new Date(aberta)) / 36e5;
        if (h > 0) { if (ehDomingoOuFeriado(aberta)) domfer += h; else norm += h; }
        aberta = null;
      }
    });
    return { norm: Math.round(norm * 100) / 100, domfer: Math.round(domfer * 100) / 100 };
  }

  // exporta linhas (array de arrays) como CSV que o Excel abre direto (BOM + ;)
  function baixaCSV(nomeArquivo, linhas) {
    var txt = "\ufeff" + linhas.map(function (l) {
      return l.map(function (c) {
        var v = String(c == null ? "" : c).replace(/"/g, '""');
        return /[;"\n]/.test(v) ? '"' + v + '"' : v;
      }).join(";");
    }).join("\n");
    var blob = new Blob([txt], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = nomeArquivo.replace(/\.csv$/i, "") + ".csv";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }

  window.MTStore = {
    baixaCSV: baixaCSV,
    ehDomingoOuFeriado: ehDomingoOuFeriado, horasPonto: horasPonto, feriadosDoAno: feriadosDoAno,
    horarioDoDia: horarioDoDia, abertoAgora: abertoAgora,
    read: read, write: write, uid: uid,
    contratoAtivoConta: contratoAtivoConta, ehClienteAtivo: ehClienteAtivo,
    todayISO: todayISO, monthKey: monthKey, fmtBRL: fmtBRL, fmtData: fmtData,
    savePhoto: savePhoto, getPhoto: getPhoto, deletePhoto: deletePhoto,
    saveLogo: saveLogo, getLogo: getLogo, removeLogo: removeLogo, aplicaLogo: aplicaLogo,
    exportBackup: exportBackup, importBackup: importBackup, onChange: onChange, equipeDatalist: equipeDatalist,
    iniciaSync: iniciaSync,
    // acesso à conexão da nuvem (para publicações como o App do Aluno)
    cloud: function () { return sync.client ? { client: sync.client, aid: sync.aid } : null; },
    backupKeys: function () { return BACKUP_KEYS.slice(); },
    usuario: function () {
      var acad = null, perfil = null;
      try { acad = JSON.parse(localStorage.getItem("mtapp:academia")); } catch (e) {}
      try { perfil = JSON.parse(localStorage.getItem("mtapp:perfil")); } catch (e) {}
      return {
        email: sync.email || "",
        papel: (acad && acad.papel) || "",
        nome: (perfil && perfil.nome) || "",
        logado: !!sync.email,
      };
    },
  };

  // nas páginas de programas e no modo TV, inicia a sincronização sozinho
  // telemetria: erros de JS vão para a nuvem (página Auditoria e Saúde)
  var errosEnviados = 0;
  function reportaErro(msg, pilha) {
    try {
      if (errosEnviados >= 5 || !sync.client || !sync.aid) return;
      errosEnviados++;
      sync.client.from("erros_js").insert({
        academia_id: sync.aid,
        pagina: location.pathname.split("/").pop() || "index",
        msg: String(msg || "").slice(0, 300),
        pilha: String(pilha || "").slice(0, 800),
        navegador: (navigator.userAgent || "").slice(0, 160),
        quem: sync.email || "",
      }).then(function () {}, function () {});
    } catch (e) {}
  }
  window.addEventListener("error", function (e) {
    reportaErro(e.message, e.error && e.error.stack);
  });
  window.addEventListener("unhandledrejection", function (e) {
    var r = e.reason || {};
    reportaErro(r.message || String(r), r.stack);
  });

  if (document.readyState !== "loading") iniciaSync();
  else document.addEventListener("DOMContentLoaded", iniciaSync);

  // aplica a logo automaticamente quando a página carrega e quando muda em outra aba
  if (document.readyState !== "loading") aplicaLogo();
  else document.addEventListener("DOMContentLoaded", aplicaLogo);
  onChange(function (key) { if (key === "logo") aplicaLogo(); });

  // ---------- atualização automática do app ----------
  // Quando uma versão nova é publicada, o service worker novo assume e a
  // página recarrega UMA vez sozinha — sem precisar "recarregar 2 vezes".
  try {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then(function (reg) { if (reg.update) reg.update(); }).catch(function () {});
      if (navigator.serviceWorker.controller) {
        var jaRecarregou = false;
        navigator.serviceWorker.addEventListener("controllerchange", function () {
          if (jaRecarregou) return;
          jaRecarregou = true;
          location.reload();
        });
      }
    }
  } catch (e) {}
})();
