/* Adaptador de referência web, isolado do app atual. Uma transação por sessão. */
(function (root) {
  'use strict';
  root.TorqueSessionStore = function (indexedDB, name = 'torque-aluno-sessions-v1') {
    const opened = new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      let blocked = false;
      request.onupgradeneeded = () => request.result.createObjectStore('sessions');
      request.onerror = () => reject(request.error);
      request.onblocked = () => { blocked = true; reject(new Error('STORAGE_BLOCKED')); };
      request.onsuccess = () => {
        if (blocked) { request.result.close(); return; }
        request.result.onversionchange = () => request.result.close(); resolve(request.result);
      };
    });
    async function transaction(key, change) {
      const db = await opened;
      return new Promise((resolve, reject) => {
        const tx = db.transaction('sessions', change ? 'readwrite' : 'readonly');
        const store = tx.objectStore('sessions');
        let value, failure;
        tx.oncomplete = () => resolve(value);
        tx.onabort = () => reject(failure || tx.error || new Error('STORAGE_ABORTED'));
        // Cursor distingue chave ausente de valor undefined/null corrompido.
        const req = store.openCursor(key);
        req.onsuccess = () => {
          try {
            if (req.result && req.result.value == null) throw new Error('CORRUPT_STORAGE');
            const previous = req.result ? req.result.value : null;
            value = change ? change(previous) : previous;
            if (change) store.put(value, key);
          }
          catch (e) { failure = e; tx.abort(); }
        };
      });
    }
    return { read: key => transaction(key), update: (key, change) => transaction(key, change), close: async () => (await opened).close() };
  };
})(globalThis);
