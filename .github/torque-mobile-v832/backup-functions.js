  /* Rascunhos grandes não devem disputar a cota do localStorage com o painel.
   * Só considera o arquivo durável após o COMMIT da transação IndexedDB.
   * Falha, bloqueio ou falta de espaço nunca autorizam descartar o original. */
  function arquivaRascunho(nome, conteudo) {
    if (!window.indexedDB) return Promise.resolve(false);
    return new Promise(function (resolve) {
      var req, db, tx, terminou = false;
      var timer = setTimeout(function () {
        try { if (tx) tx.abort(); } catch (e) {}
        fim(false);
      }, 8000);
      function fim(ok) {
        if (terminou) return;
        terminou = true; clearTimeout(timer);
        try { if (db) db.close(); } catch (e) {}
        resolve(ok);
      }
      try {
        req = window.indexedDB.open('mt-sync-rascunhos', 1);
        req.onupgradeneeded = function () {
          if (!req.result.objectStoreNames.contains('rascunhos')) req.result.createObjectStore('rascunhos');
        };
        req.onerror = req.onblocked = function () { fim(false); };
        req.onsuccess = function () {
          db = req.result;
          if (terminou) { db.close(); return; }
          try {
            tx = db.transaction('rascunhos', 'readwrite');
            tx.oncomplete = function () { fim(true); };
            tx.onerror = tx.onabort = function () { fim(false); };
            tx.objectStore('rascunhos').put(conteudo, nome);
          } catch (e) { fim(false); }
        };
      } catch (e) { fim(false); }
    });
  }
  function preservaRascunho(k, raw, aid) {
    var c = sync.conflitos && sync.conflitos[k], nome = '', conteudo = '';
    // Reutiliza uma cópia idêntica: o botão antigo exigia uma SEGUNDA cópia
    // completa, falhava por cota e nem chegava a consultar a nuvem.
    if (c && c.copia && c.copia.indexOf('idb:') !== 0) {
      try {
        var existente = localStorage.getItem(c.copia), valor = JSON.parse(existente);
        if (valor && valor.chave === k && valor.raw === raw) { nome = c.copia; conteudo = existente; }
      } catch (e) {}
    }
    var copiaLocal = nome;
    if (!nome) {
      nome = 'mtsync:conflito:' + (aid || 'local') + ':' + Date.now() + ':' + Math.random().toString(36).slice(2);
      conteudo = JSON.stringify({ chave: k, em: new Date().toISOString(), raw: raw });
    }
    return arquivaRascunho(nome, conteudo).then(function (ok) {
      if (!ok) {
        // O fallback também precisa continuar existindo e conter o mesmo texto.
        if (copiaLocal && localStorage.getItem(copiaLocal) === conteudo) return copiaLocal;
        return guardaRascunho(k, raw, aid);
      }
      var prefixo = 'mtsync:conflito:' + (aid || 'local') + ':', antigos = [];
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var id = localStorage.key(i);
          if (!id || id.indexOf(prefixo) !== 0) continue;
          var texto = localStorage.getItem(id);
          try { if (JSON.parse(texto).chave === k) antigos.push({ id: id, texto: texto }); } catch (e) {}
        }
      } catch (e) {}
      // Libera somente cópias de conflito deste painel/equipe, uma por vez,
      // após arquivar integralmente. Nunca remove o painel, fotos ou outra conta.
      return antigos.reduce(function (fila, item) {
        return fila.then(function () {
          var salvo = item.id === nome && item.texto === conteudo ? Promise.resolve(true) : arquivaRascunho(item.id, item.texto);
          return salvo.then(function (confirmado) {
            if (!confirmado) return;
            try { if (localStorage.getItem(item.id) === item.texto) localStorage.removeItem(item.id); } catch (e) {}
          });
        });
      }, Promise.resolve()).then(function () { return 'idb:' + nome; });
    });
  }
  function falhaConflito(k, mensagem) {
    if (sync.conflitos && sync.conflitos[k]) sync.conflitos[k].erro = mensagem;
    return false;
  }
