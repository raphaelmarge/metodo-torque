/* TORQUE ON — armazenamento compartilhado dos programas.
 * Dados em localStorage (JSON, prefixo mtapp:) e fotos em IndexedDB.
 * Mesma origem = os mesmos dados aparecem no shell, nos programas e no modo TV. */
(function () {
  "use strict";

  // proteção leve (só nas páginas de programas em /apps/, nunca no shell):
  // com o cadastro exigido e ainda não feito, volta à entrada
  try {
    if (self.MT_ACCESS && self.MT_ACCESS.exigirCadastro &&
        location.pathname.indexOf("/apps/") !== -1 &&
        location.pathname.indexOf("/hq.html") === -1 && // HQ tem tranca própria de administrador
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
  /* Tamanho de CADA lista de um valor sincronizado, uma por uma.
   *
   * A contaRegistros acima devolve só o tamanho da MAIOR lista — e a maior lista
   * do painel do personal é o catálogo de exercícios, que o onboarding semeia com
   * uma dezena de itens num aparelho zerado. Por causa disso a trava que existia
   * pra impedir que um celular recém-instalado apagasse a base da nuvem nunca
   * disparava: o aparelho "vazio" já contava dez. Um professor perdeu a lista de
   * alunos assim — o aparelho subiu o estado curto por cima da nuvem cheia. */
  function listasDe(v) {
    var out = {};
    if (Array.isArray(v)) { out["#"] = v.length; return out; }
    if (v && typeof v === "object") {
      Object.keys(v).forEach(function (k) {
        var val = v[k];
        if (Array.isArray(val)) { out[k] = val.length; return; }
        // mapas (treinosV2, dietas, treinos): conta o tamanho do mapa E as listas
        // de dentro — antes só arrays de 1º nível entravam, então apagar todas as
        // fichas/dietas da nuvem não disparava a trava
        if (val && typeof val === "object") {
          out[k + "#"] = Object.keys(val).length;
          Object.keys(val).forEach(function (id) {
            var sub = val[id];
            if (Array.isArray(sub)) { out[k + "." + id] = sub.length; return; }
            if (sub && typeof sub === "object") {
              Object.keys(sub).forEach(function (kk) {
                if (Array.isArray(sub[kk])) out[k + "." + id + "." + kk] = sub[kk].length;
              });
            }
          });
        }
      });
    }
    return out;
  }
  // a nuvem tem lista MAIOR que a do aparelho? então mandar o aparelho por cima
  // apagaria registro de gente — e apagar é o único erro que não dá pra desfazer
  /* v745: a nuvem só vence uma escrita local MAIS NOVA quando o aparelho está
   * (quase) VAZIO naquela lista — lista local zerada, ou a da nuvem bem maior
   * (1,5× + 3). Antes bastava a nuvem ter UM item a mais: o professor apagava
   * uma ficha velha numa sessão offline e, na abertura seguinte, o dia inteiro
   * de trabalho era descartado e a ficha apagada voltava. */
  function nuvemTemMais(local, nuvem) {
    var lNuv = listasDe(nuvem), lLoc = listasDe(local);
    return Object.keys(lNuv).some(function (k) {
      var n = lNuv[k], l = lLoc[k] || 0;
      return n > 0 && (l === 0 || n > l * 1.5 + 3);
    });
  }
  window.__nuvemTemMais = nuvemTemMais; window.__sincronizavel = sincronizavel; // testes
  /* v747: quantos registros cada chave tinha na ÚLTIMA gravação/aplicação —
   * o logGeral precisa do "antes" pra dizer "incluído (3 → 4)", e até aqui o
   * write() fazia JSON.parse do valor ANTERIOR inteiro (o ptStudio tem MBs)
   * só pra contar. A memória vale enquanto a chave não muda por fora: a
   * puxada da nuvem e o evento storage de outra aba apagam a entrada, e aí
   * a próxima gravação volta a contar do localStorage uma vez. */
  var contagem = {};
  function contagemDe(chaveFull) {
    if (Object.prototype.hasOwnProperty.call(contagem, chaveFull)) return contagem[chaveFull];
    var v = null;
    try { var raw = localStorage.getItem(chaveFull); v = raw ? JSON.parse(raw) : null; } catch (e) { v = null; }
    return contaRegistros(v);
  }
  function registraLog(key, na, nd) {
    if (SEM_LOG[key] || window.__MT_IMPORTANDO) return;
    try {
      var por = "";
      try { por = (JSON.parse(localStorage.getItem(PREFIX + "perfil")) || {}).nome || ""; } catch (e) {}
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

  /* v747: a trilha "quem mexeu em quê" agora VIAJA. Antes ela era gravada
   * com o prefixo (mtapp:auditoria) mas marcada e agendada SEM ele — e
   * sincronizavel("auditoria") é falso, então nada subia e o mtsync:ts ganhava
   * uma entrada lixo. Cada aparelho tinha a própria trilha, justamente na tela
   * que existe pra responder "quem apagou isso". Durante a restauração de um
   * backup ela fica calada: ~60 chaves no mesmo minuto virariam ~60 registros
   * iguais; o importBackup grava UM registro "backup restaurado" no fim. */
  function auditoria(chave, forca) {
    try {
      if (chave === "auditoria") return;
      if (window.__MT_IMPORTANDO && !forca) return;
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
      contagem[PREFIX + "auditoria"] = log.registros.length;
      marcaTs(PREFIX + "auditoria");
      agendaEnvio(PREFIX + "auditoria");
    } catch (e) {}
  }

  /* v747: devolve true quando gravou e false quando a cota estourou — assim
   * quem chama pode reagir (o alert de 10 em 10 min continua). */
  /* v756 — A TRAVA DO APAGÃO. Apagar é o único erro que não dá pra desfazer, e
   * nenhuma gravação legítima leva uma lista de GENTE ou de DINHEIRO de 3+
   * registros direto pra ZERO numa tacada só: o professor apaga um por um, e
   * "encerrar aluno" nem apaga (marca ativo:false). Quando isso acontece é
   * bug — foi assim que a limpeza do demo levou o estúdio de um professor.
   * A gravação é RECUSADA, o que ela tentava gravar fica guardado em
   * mtsync:bak: e o professor é avisado em português. Quem limpa DE PROPÓSITO
   * (excluir minha conta, demo confirmado) marca window.__MT_LIMPANDO. */
  /* SÓ as listas que DEFINEM o estúdio: se os alunos (ou pacientes) continuam
   * lá, o estúdio não foi apagado. Sessões, pagamentos e despesas ficam DE
   * FORA de propósito — trocar o objeto inteiro por um recorte (restaurar um
   * backup, uma tela que remonta o estúdio) zeraria uma delas sem que nada de
   * ruim tivesse acontecido, e um alerta falso é o começo do próximo problema. */
  var GENTE = { alunos: 1, pacientes: 1 };
  function gentesDe(v) {
    var o = {};
    if (v && typeof v === "object" && !Array.isArray(v)) {
      Object.keys(GENTE).forEach(function (k) { if (Array.isArray(v[k])) o[k] = v[k].length; });
    }
    return o;
  }
  var gentes = {};
  function gentesAntes(chaveFull) {
    if (Object.prototype.hasOwnProperty.call(gentes, chaveFull)) return gentes[chaveFull];
    var v = null;
    try { var raw = localStorage.getItem(chaveFull); v = raw ? JSON.parse(raw) : null; } catch (e) { v = null; }
    return gentesDe(v);
  }
  function zerouTudo(antes, depois) {
    var qual = "";
    Object.keys(antes).forEach(function (k) {
      if (!qual && antes[k] >= 3 && (depois[k] || 0) === 0) qual = k;
    });
    return qual;
  }
  window.__zerouTudo = zerouTudo; // testes

  function write(key, value) {
    var na = contagemDe(PREFIX + key);
    var gAntes = gentesAntes(PREFIX + key);
    var gDepois = gentesDe(value);
    var perdeu = (window.__MT_LIMPANDO || window.__MT_IMPORTANDO) ? "" : zerouTudo(gAntes, gDepois);
    if (perdeu) {
      try { localStorage.setItem("mtsync:bak:" + PREFIX + key, JSON.stringify(value)); } catch (e0) {}
      try { console.warn("MTStore: gravação RECUSADA — " + perdeu + " ia de " + gAntes[perdeu] + " pra 0", key); } catch (e1) {}
      alert("⚠️ Isto apagaria os seus " + gAntes[perdeu] + " " + perdeu + " de uma vez só, e não parece proposital — então eu NÃO salvei.\n\nSeus dados continuam como estavam. Se você quis mesmo tirar todo mundo, apague um por um.");
      return false;
    }
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (e) {
      /* cota do navegador estourou — avisa e não derruba a página. v742: o
       * aviso volta a cada 10 minutos (era UMA vez por sessão: depois do
       * primeiro estouro toda gravação seguinte falhava calada, e o professor
       * marcava Feita, registrava pagamento, montava ficha… sem nada ficar).
       * O console registra toda falha, com a chave. */
      try { console.warn("MTStore: cota cheia, NÃO gravou", key, e && e.name); } catch (e2) {}
      var agoraQ = Date.now();
      if (!write._avisouEm || agoraQ - write._avisouEm > 600000) {
        write._avisouEm = agoraQ;
        alert("⚠️ A memória do navegador encheu e este dado NÃO foi salvo (" + key + ").\n\nApague fotos/avaliações antigas ou entre na sua conta da nuvem pra liberar espaço — até lá, nada do que você fizer fica guardado.");
      }
      return false;
    }
    var nd = contaRegistros(value);
    contagem[PREFIX + key] = nd;
    gentes[PREFIX + key] = gDepois;
    registraLog(key, na, nd);
    marcaTs(PREFIX + key);
    agendaEnvio(PREFIX + key);
    ouvintes.forEach(function (cb) { try { cb(key); } catch (e) {} });
    auditoria(key);
    return true;
  }

  /* v756: quem apaga uma chave DE PROPÓSITO (a limpeza do demo, por exemplo)
   * avisa aqui — senão a trava do apagão vê o "antes" que ficou na memória e
   * recusa a primeira gravação legítima depois da limpeza. */
  function esqueceChave(key) {
    delete contagem[PREFIX + key];
    delete gentes[PREFIX + key];
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

  /* "2 foto(s) guardadas" resolvia o singular do substantivo e esquecia o
   * resto da frase. plural() recebe o número e as duas versões inteiras, então
   * "1 ficha prescrita" e "3 fichas prescritas" saem certas as duas. */
  function plural(n, um, varios) {
    return n + " " + (Math.abs(n) === 1 ? um : varios);
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

  // guarda um dataURL já pronto no IndexedDB (fotos fora do localStorage/sync)
  function savePhotoData(dataUrl) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var id = uid();
        var tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(String(dataUrl), id);
        tx.oncomplete = function () { resolve(id); };
        tx.onerror = function () { reject(tx.error); };
      });
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
  var BACKUP_KEYS = ["alunos", "metas", "manut", "checklist", "funil", "exper", "inad", "diario", "grade", "agenda", "contas", "treinos", "saude", "nps", "produtos", "caixa", "comissoes", "docs", "armarios", "wod", "equipe", "convenios", "vouchers", "turmas", "reajustes", "indicacoes", "parq", "fluxo", "personais", "fornecedores", "recompensas", "automacao", "bancos", "descontos", "adquirentes", "suspensoes", "contagens", "aprovacoes", "reposicoes", "niveis", "convidados", "config", "logo", "loja", "agregadores", "biometria", "permissoes", "funcionamento", "servicos", "wellhub", "areas", "atividades", "aulasPersonal", "appAluno", "auditoria", "feriados", "videoteca", "metasNegocio", "treinoDestaques", "riscoHist", "ptStudio", "ptImagens", "hqLeads", "hqConfig", "desafios", "ntStudio", "tvAvisos",
    // v747: gravadas com S.write mas esquecidas da lista — restaurar num aparelho
    // novo voltava a matrícula online sem Pix e o copiloto sem histórico
    "matriculaOnline", "copiloto"];
  var DOC_PREFIX = "mtpf:"; // respostas dos documentos preenchíveis (docs/preenchivel.js)

  function exportBackup() {
    var data = { formato: "metodo-torque-backup", versao: 1, exportado: new Date().toISOString(),
      // dito no próprio arquivo, pra ninguém descobrir só na hora de restaurar
      aviso: "As fotos guardadas no IndexedDB (avaliações/progresso) NÃO vão neste arquivo." };
    BACKUP_KEYS.forEach(function (k) { data[k] = read(k, null); });
    // v747: os documentos preenchidos (mtpf:<slug>) vão juntos, num mapa só
    var docs = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var kd = localStorage.key(i);
        if (kd && kd.indexOf(DOC_PREFIX) === 0) {
          try { docs[kd.slice(DOC_PREFIX.length)] = JSON.parse(localStorage.getItem(kd)); }
          catch (e) { docs[kd.slice(DOC_PREFIX.length)] = localStorage.getItem(kd); }
        }
      }
    } catch (e) {}
    data._preenchiveis = docs;
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
      if (data.formato !== "metodo-torque-backup") throw new Error("arquivo não é um backup do TORQUE ON");
      window.__MT_IMPORTANDO = true;
      try {
        BACKUP_KEYS.forEach(function (k) { if (data[k] != null) write(k, data[k]); });
        var docs = data._preenchiveis;
        if (docs && typeof docs === "object") {
          Object.keys(docs).forEach(function (slug) {
            try {
              localStorage.setItem(DOC_PREFIX + slug, JSON.stringify(docs[slug]));
              marcaTs(DOC_PREFIX + slug); agendaEnvio(DOC_PREFIX + slug);
            } catch (e) {}
          });
        }
      }
      finally { window.__MT_IMPORTANDO = false; }
      // um registro só na trilha, em vez de sessenta iguais no mesmo minuto
      auditoria("backup restaurado (" + (data.exportado || "").slice(0, 10) + ")", true);
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
  /* v745: o que é DESTE aparelho não viaja. mtapp:academia é a identidade do
   * login daqui (papel + código da equipe) e subia pros outros membros; as
   * marcas do demo (ptDemo/ptDemoNuvem) subiam e viravam demo em todo
   * aparelho da conta, sem saída; preferências de tela idem. */
  var SYNC_IGNORA = { "mtapp:perfil": 1, "mtapp:academia": 1, "mtapp:ptDemo": 1, "mtapp:ptDemoNuvem": 1,
    "mtapp:seeded": 1, "mtapp:ptSemConta": 1, "mtapp:ntSemConta": 1, "mtapp:tema": 1,
    "mtapp:ptMenuFino": 1, "mtapp:ptAgVis": 1,
    /* v747: mais coisa que é DESTE aparelho e o varredor da 1ª puxada subia
     * mesmo assim (qualquer mtapp: que a nuvem não tivesse): a marca de
     * intenção do login (access.js), quem está no caixa (checklist), o
     * fechamento já visto, o espelho da assinatura e o logGeral — que é
     * histórico local por desenho (SEM_LOG) e ninguém marca com ts. */
    "mtapp:intento": 1, "mtapp:quem": 1, "mtapp:fechVisto": 1, "mtapp:logGeral": 1,
    "mtapp:ptAssinatura": 1, "mtapp:ptAssinaturaVista": 1 };
  var TSKEY = "mtsync:ts";

  function tsMap() {
    try { return JSON.parse(localStorage.getItem(TSKEY)) || {}; } catch (e) { return {}; }
  }
  // carimbo vindo do Postgres termina em fuso (+00:00); o local, em "Z"
  function carimboDaNuvem(ts) { return /[+-]\d\d:?\d\d$/.test(String(ts || "")); }
  function marcaTs(chaveFull, quando) {
    var m = tsMap();
    m[chaveFull] = quando || new Date().toISOString();
    try { localStorage.setItem(TSKEY, JSON.stringify(m)); } catch (e) {}
  }

  /* reconciliou: a REGRA DE FERRO da sessão. Nenhum envio sobe antes de a
   * primeira puxada da nuvem ter chegado e sido aplicada. Foi por aqui que uma
   * base inteira sumiu DUAS vezes: um aparelho recém-zerado (navegador limpo,
   * aba anônima, app recém-instalado) escrevia o estúdio vazio no boot, o
   * timer de 1,2 s empurrava esse vazio pra nuvem ANTES de a primeira puxada
   * voltar, e a nuvem cheia era substituída pelo nada. A trava nuvemTemMais
   * protege o caminho de BAIXAR; esta protege o de ENVIAR. */
  var sync = { client: null, aid: null, sujas: {}, timer: null, aplicando: false, ultima: null, reconciliou: false };

  function sincronizavel(chaveFull) {
    if (SYNC_IGNORA[chaveFull]) return false;
    return SYNC_PREFIXES.some(function (p) { return chaveFull.indexOf(p) === 0; });
  }

  function agendaEnvio(chaveFull) {
    if (!sync.client || sync.aplicando || !sincronizavel(chaveFull)) return;
    sync.sujas[chaveFull] = true;
    avisaStatus();
    clearTimeout(sync.timer);
    sync.timer = setTimeout(enviaSujas, 1200);
  }

  function enviaSujas() {
    if (!sync.client) return;
    // regra de ferro: só envia depois da primeira puxada da sessão. A fila
    // fica guardada e sobe assim que a puxada reconciliar (o puxa chama
    // enviaSujas no fim) — aparelho zerado nunca mais apaga a nuvem no boot.
    if (!sync.reconciliou) { avisaStatus(); return; }
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
    /* v747: pede de volta o carimbo que o SERVIDOR pôs (o gatilho dados_carimba
     * ignora o do cliente e carimba a chegada). Sem isso o eco do próprio
     * envio voltava "mais novo" na puxada seguinte, era reaplicado (conteúdo
     * igual) e disparava os ouvintes — o painel inteiro repintava 30 s depois
     * de qualquer salvamento, ou ao voltar do WhatsApp. Com o carimbo do
     * servidor guardado, o eco compara igual e nem entra no branch. O .select
     * só é encadeado quando existe: os mocks de teste devolvem só a promessa. */
    var q = sync.client.from("dados").upsert(linhas);
    if (q && typeof q.select === "function") { try { q = q.select("chave,atualizado"); } catch (e) {} }
    q.then(function (r) {
      if (r.error) {
        // devolve à fila para tentar de novo no próximo ciclo
        chaves.forEach(function (k) { sync.sujas[k] = true; });
      } else {
        (Array.isArray(r.data) ? r.data : []).forEach(function (row) {
          // só se a chave não foi escrita DE NOVO enquanto o envio viajava
          if (row && row.chave && row.atualizado && !sync.sujas[row.chave]) marcaTs(row.chave, row.atualizado);
        });
        avisaStatus();
      }
    }, function () {
      chaves.forEach(function (k) { sync.sujas[k] = true; });
    });
  }

  function puxa() {
    if (!sync.client) return Promise.resolve();
    // 1ª puxada da sessão: completa (semeia o aparelho e acha chaves só-locais).
    // Depois: só o que mudou desde a marca d'água — corta o tráfego dos ciclos de 30 s.
    if (sync.marcaAid !== sync.aid) { sync.marca = ""; sync.marcaAid = sync.aid; sync.reconciliou = false; }
    var primeira = !sync.marca;
    var consulta = sync.client.from("dados").select("chave,valor,atualizado").eq("academia_id", sync.aid);
    if (!primeira) consulta = consulta.gt("atualizado", sync.marca);
    return consulta.then(function (r) {
      if (r.error || !r.data) return;
      var m = tsMap();
      var mudou = [];
      var maxTs = sync.marca || "";
      r.data.forEach(function (row) {
        if (row.atualizado > maxTs) maxTs = row.atualizado;
        if (!sincronizavel(row.chave)) return;
        /* v745: escrita local ainda NA FILA (ainda não subiu) nunca é coberta
         * pela nuvem. O servidor carimba o upsert na CHEGADA, então o eco do
         * envio anterior volta "mais novo" que uma escrita feita logo depois —
         * e a puxada devolvia a lista ao estado de antes. A chave fica na fila
         * e sobe no próximo ciclo. */
        if (sync.sujas[row.chave]) return;
        var local = m[row.chave];
        /* v756: chave que NÃO está no aparelho sempre recebe a da nuvem — não
         * há nada local pra proteger. Sem isto, uma chave apagada do
         * localStorage com o carimbo IGUAL ao da nuvem (o estado normal logo
         * depois de um envio) não caía em nenhum dos dois braços: a nuvem
         * nunca era reaplicada, o painel abria vazio e o vazio subia por cima.
         * Foi assim que a limpeza do demo levou o estúdio de um professor. */
        var faltaAqui = false;
        try { faltaAqui = localStorage.getItem(row.chave) == null; } catch (e) {}
        if (faltaAqui || !local || row.atualizado > local) {
          sync.aplicando = true;
          try {
            var novoRaw = JSON.stringify(row.valor);
            var igual = localStorage.getItem(row.chave) === novoRaw;
            /* v747: o carimbo da nuvem entra ANTES do setItem — é ele que a
             * OUTRA aba lê no evento storage pra saber que isso veio da nuvem
             * e não deve subir de volta (sync.aplicando é por janela). */
            marcaTs(row.chave, row.atualizado);
            if (!igual) {
              localStorage.setItem(row.chave, novoRaw);
              delete contagem[row.chave]; delete gentes[row.chave];
              mudou.push(row.chave); // conteúdo igual não acorda ninguém
            }
          } catch (e) {}
          sync.aplicando = false;
        } else if (row.atualizado < local) {
          /* local mais novo: manda de volta — MAS na 1ª puxada da sessão, se a
           * nuvem tem alguma lista MAIOR que a do aparelho, a nuvem vence.
           *
           * Antes a nuvem só vencia com o aparelho COMPLETAMENTE vazio, medido
           * pela maior lista — que num painel recém-semeado já vem com o catálogo
           * de exercícios dentro. Na prática a trava nunca pegava, e bastava o
           * aparelho abrir com a lista curta pra apagar a base inteira na nuvem.
           *
           * Apagar sem querer é o único erro que não dá pra desfazer, então na
           * dúvida a nuvem ganha. Exclusão de verdade não é atrapalhada por isto:
           * quando o professor encerra um aluno, a mudança sobe na hora, e na
           * abertura seguinte a nuvem já está com a lista curta também. */
          var nuvemMaior = false;
          if (primeira) {
            var locVal = null;
            try { locVal = JSON.parse(localStorage.getItem(row.chave)); } catch (e) {}
            nuvemMaior = nuvemTemMais(locVal, row.valor);
          }
          if (nuvemMaior) {
            sync.aplicando = true;
            try {
              // v745: antes de a nuvem vencer uma escrita local MAIS NOVA, guarda a
              // cópia local — trabalho offline nunca some sem rastro
              try { localStorage.setItem("mtsync:bak:" + row.chave, JSON.stringify({ em: new Date().toISOString(), valor: JSON.parse(localStorage.getItem(row.chave)) })); } catch (eB) {}
              marcaTs(row.chave, row.atualizado);
              localStorage.setItem(row.chave, JSON.stringify(row.valor));
              delete contagem[row.chave]; delete gentes[row.chave];
              mudou.push(row.chave);
            } catch (e) {}
            sync.aplicando = false;
          } else {
            sync.sujas[row.chave] = true;
          }
        }
      });
      if (maxTs) sync.marca = maxTs;
      // chaves locais que a nuvem ainda não tem (só faz sentido na puxada completa)
      if (primeira) {
        var remotas = {};
        r.data.forEach(function (row) { remotas[row.chave] = 1; });
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (sincronizavel(k) && !remotas[k]) { marcaTs(k, tsMap()[k]); sync.sujas[k] = true; }
        }
      }
      // a partir daqui a sessão está reconciliada com a nuvem: os envios que
      // ficaram segurados (regra de ferro) podem subir
      sync.reconciliou = true;
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
      try { window.MT_syncInfo({ ativa: !!sync.client, ultima: sync.ultima, pendentes: Object.keys(sync.sujas).length }); } catch (e) {}
    }
  }

  /* Sessão derrubada pela nuvem: o painel não pode seguir dizendo "conectado
   * como fulano" com o crachá morto — senão o botão que aparece é Sair, e não
   * Entrar, que é o que a pessoa precisa. */
  self.addEventListener("mt:sessao-caiu", function () { sync.email = ""; });

  function iniciaSync() {
    var cfg = self.MT_CLOUD;
    if (!cfg || !cfg.url || !cfg.anonKey || !window.supabase || sync.client) return;
    /* UM cliente por página, sempre. Antes o store criava o dele sem publicar
     * em window.MT_supabase, então o modulo-conta criava um SEGUNDO. Dois
     * clientes com o mesmo login = dois relógios renovando o mesmo crachá: um
     * renova, o crachá antigo morre, e o outro tenta com o morto, leva
     * "refresh token already used" e DERRUBA a sessão. É o "funciona por um
     * tempo e depois dá erro" na origem. */
    var client = window.MT_supabase || window.supabase.createClient(cfg.url, cfg.anonKey);
    window.MT_supabase = client;
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
        if (!e.key || !sincronizavel(e.key)) return;
        delete contagem[e.key]; delete gentes[e.key];
        if (sync.aplicando) return;
        /* v747: a outra aba acabou de APLICAR uma linha da nuvem (o carimbo dela
         * já está no mtsync:ts, gravado antes do setItem). Antes esta aba via o
         * evento, marcava "agora" e subia de volta um conteúdo que ninguém
         * daqui escreveu — upload inteiro da chave a cada mudança remota e,
         * se o outro aparelho escreveu de novo nesse meio tempo, o eco atrasado
         * ganhava do valor mais novo. */
        if (carimboDaNuvem(tsMap()[e.key])) return;
        marcaTs(e.key);
        agendaEnvio(e.key);
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

  // ---------- clientes ativos (contrato especial/VIP não conta) ----------
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

  // gancho de teste: a regra que decide quem vence quando aparelho e nuvem
  // discordam é a que evita perder a base de alunos — precisa ser testável
  window.__MTSync = { listasDe: listasDe, nuvemTemMais: nuvemTemMais,
    enviaSujas: enviaSujas, puxa: puxa, _estado: sync, // _estado/enviaSujas/puxa: só pros testes
    carimboDaNuvem: carimboDaNuvem, contagemDe: contagemDe, auditoria: auditoria };
  window.MTStore = {
    baixaCSV: baixaCSV,
    ehDomingoOuFeriado: ehDomingoOuFeriado, horasPonto: horasPonto, feriadosDoAno: feriadosDoAno,
    horarioDoDia: horarioDoDia, abertoAgora: abertoAgora,
    read: read, write: write, uid: uid, esqueceChave: esqueceChave,
    contratoAtivoConta: contratoAtivoConta, ehClienteAtivo: ehClienteAtivo,
    todayISO: todayISO, monthKey: monthKey, fmtBRL: fmtBRL, fmtData: fmtData, plural: plural,
    savePhoto: savePhoto, savePhotoData: savePhotoData, getPhoto: getPhoto, deletePhoto: deletePhoto,
    saveLogo: saveLogo, getLogo: getLogo, removeLogo: removeLogo, aplicaLogo: aplicaLogo,
    exportBackup: exportBackup, importBackup: importBackup, onChange: onChange, equipeDatalist: equipeDatalist,
    iniciaSync: iniciaSync,
    // acesso à conexão da nuvem (para publicações como o App do Aluno)
    cloud: function () { return sync.client ? { client: sync.client, aid: sync.aid } : null; },
    /* Token de login pra chamar Edge Function.
     * As funções que agem em nome do usuário (whatsapp, pagarme) exigem role
     * "authenticated"; a anonKey tem role "anon" e leva 401 SEMPRE. Quem chama
     * essas funções tem que usar este token — a anonKey só serve de apikey. */
    tokenNuvem: function () {
      if (!sync.client) return Promise.resolve("");
      /* O crachá vale ~1 hora. Com a tela aberta o dia todo ele vencia e a
       * chamada levava 401 — o famoso "funciona por um tempo e depois dá
       * erro". MT_FUNCAO.token renova antes de vencer. */
      if (self.MT_FUNCAO && self.MT_FUNCAO.token) return self.MT_FUNCAO.token(sync.client);
      return sync.client.auth.getSession()
        .then(function (s) { return (s && s.data && s.data.session && s.data.session.access_token) || ""; })
        .catch(function () { return ""; });
    },
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

  /* v747: a atualização automática do service worker SAIU daqui. Ela vive no
   * assets/pwa-update.js (páginas de produto) e no assets/app.js (portal) —
   * este arquivo era o terceiro lugar com o mesmo bloco, e o painel carregava
   * dois deles: dois listeners de controllerchange, dois reload(). Os programas
   * em iframe (apps/*.html) não precisam: quando a página de cima recarrega,
   * eles vêm junto. */
})();
