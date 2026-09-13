  function aplicaProtegida(row, silencioso) {
    var k = row.chave, raw = JSON.stringify(row.valor), anterior = localStorage.getItem(k);
    var bk = baseKey(), tsAnterior = localStorage.getItem(TSKEY), baseAnterior = localStorage.getItem(bk);
    var m = tsMap(), b = bases(); m[k] = row.atualizado; b[k] = row.atualizado;
    try {
      // Metadados primeiro; setItem do painel é atômico. Se a cota impedir
      // qualquer etapa, o painel anterior permanece e as revisões são revertidas.
      localStorage.setItem(TSKEY, JSON.stringify(m));
      localStorage.setItem(bk, JSON.stringify(b));
      localStorage.setItem(k, raw);
    } catch (e) {
      try { if (tsAnterior === null) localStorage.removeItem(TSKEY); else localStorage.setItem(TSKEY, tsAnterior); } catch (eTs) {}
      try { if (baseAnterior === null) localStorage.removeItem(bk); else localStorage.setItem(bk, baseAnterior); } catch (eBase) {}
      sinalizaConflito(k, 'A memória do aparelho está cheia. A cópia da nuvem não foi aplicada.');
      return false;
    }
    if (anterior !== raw && !silencioso) notificaChave(k);
    return true;
  }
