/* Método Torque — armazenamento compartilhado dos programas.
 * Dados em localStorage (JSON, prefixo mtapp:) e fotos em IndexedDB.
 * Mesma origem = os mesmos dados aparecem no shell, nos programas e no modo TV. */
(function () {
  "use strict";

  var PREFIX = "mtapp:";

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(PREFIX + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }

  function write(key, value) {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
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
  function removeLogo() { localStorage.removeItem(PREFIX + "logo"); }

  // Preenche <img id="logoCliente"> (se existir na página) com a logo salva.
  function aplicaLogo() {
    var el = document.getElementById("logoCliente");
    if (!el) return;
    var logo = getLogo();
    if (logo) { el.src = logo; el.hidden = false; }
    else { el.removeAttribute("src"); el.hidden = true; }
  }

  // ---------- backup ----------
  var BACKUP_KEYS = ["metas", "manut", "checklist", "funil", "exper", "inad", "diario", "logo"];

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
      BACKUP_KEYS.forEach(function (k) { if (data[k] != null) write(k, data[k]); });
    });
  }

  // Notifica outras abas (modo TV) — localStorage já dispara 'storage' entre abas.
  function onChange(cb) {
    window.addEventListener("storage", function (e) {
      if (e.key && e.key.indexOf(PREFIX) === 0) cb(e.key.slice(PREFIX.length));
    });
  }

  window.MTStore = {
    read: read, write: write, uid: uid,
    todayISO: todayISO, monthKey: monthKey, fmtBRL: fmtBRL, fmtData: fmtData,
    savePhoto: savePhoto, getPhoto: getPhoto, deletePhoto: deletePhoto,
    saveLogo: saveLogo, getLogo: getLogo, removeLogo: removeLogo, aplicaLogo: aplicaLogo,
    exportBackup: exportBackup, importBackup: importBackup, onChange: onChange,
  };

  // aplica a logo automaticamente quando a página carrega e quando muda em outra aba
  if (document.readyState !== "loading") aplicaLogo();
  else document.addEventListener("DOMContentLoaded", aplicaLogo);
  onChange(function (key) { if (key === "logo") aplicaLogo(); });
})();
