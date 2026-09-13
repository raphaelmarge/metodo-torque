  function resolveConflito(k) {
    var c = sync.conflitos && sync.conflitos[k];
    if (!c) return Promise.resolve(false);
    if (c.resolvendo) return c.resolvendo;
    if (!c.local && (!sync.client || (sync.emEnvio || []).indexOf(k) >= 0)) {
      return Promise.resolve(falhaConflito(k, 'Aguarde a conexão e o salvamento em andamento, depois tente novamente.'));
    }
    var ciclo = sync.ciclo, aid = sync.aid, raw = c.local ? c.raw : localStorage.getItem(k);
    c.erro = '';
    var trabalho = preservaRascunho(k, raw, aid).then(function (copia) {
      if (!copia) return falhaConflito(k, 'Não houve espaço para preservar o rascunho. Nenhum dado foi substituído; salve uma cópia e tente novamente.');
      if (ciclo !== sync.ciclo || aid !== sync.aid || !sync.conflitos || sync.conflitos[k] !== c) return false;
      c.copia = copia;
      if (c.local) {
        if (c.raw !== raw) return falhaConflito(k, 'O rascunho mudou durante a recuperação. Tente novamente.');
        delete sync.conflitos[k]; notificaChave(k); avisaStatus(); return true;
      }
      if (!sync.client || localStorage.getItem(k) !== raw || (sync.emEnvio || []).indexOf(k) >= 0)
        return falhaConflito(k, 'O painel mudou durante a recuperação. O rascunho foi preservado; tente novamente.');
      return sync.client.from('dados').select('chave,valor,atualizado').eq('academia_id', aid).eq('chave', k).then(function (r) {
        if (ciclo !== sync.ciclo || aid !== sync.aid || !sync.client || sync.conflitos[k] !== c) return false;
        if (r && r.error) return falhaConflito(k, 'Não foi possível consultar a nuvem. Confira a conexão e tente novamente.');
        var row = r && Array.isArray(r.data) && r.data.length === 1 && r.data[0];
        if (!row || row.chave !== k || !row.valor || typeof row.valor !== 'object' || Array.isArray(row.valor) || !row.atualizado)
          return falhaConflito(k, 'A nuvem não retornou um painel válido para esta conta. A cópia local foi mantida.');
        if (localStorage.getItem(k) !== raw || (sync.emEnvio || []).indexOf(k) >= 0)
          return falhaConflito(k, 'O painel mudou durante a consulta. O rascunho foi preservado; tente novamente.');
        if (!aplicaProtegida(row, true))
          return falhaConflito(k, 'Ainda não há espaço para carregar o painel neste aparelho. O rascunho e a versão da nuvem foram preservados.');
        // Libera a trava antes de atualizar as telas; uma edição nova feita
        // por um ouvinte não pode ter sua fila apagada ao terminar a recuperação.
        delete sync.sujas[k]; delete sync.conflitos[k];
        if (localStorage.getItem(k) !== raw) notificaChave(k);
        avisaStatus(); return true;
      });
    }).catch(function () {
      return falhaConflito(k, 'A recuperação foi interrompida. A cópia local não foi descartada; tente novamente.');
    });
    c.resolvendo = trabalho.then(function (ok) { delete c.resolvendo; return ok; });
    return c.resolvendo;
  }
