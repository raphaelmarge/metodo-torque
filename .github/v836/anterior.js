      // A ordem de chegada/sincronização não é a ordem da execução.
      // Só usa carga registrada antes de hoje; empate de data preserva o último registro.
      return (L("ptdc", {})[it.e] || []).reduce(function (last, r) {
        if (!cargaConcluida(r) || typeof r.d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.d) ||
            !isFinite(Date.parse(r.d + 'T12:00:00Z')) || r.d >= isoHj() || (r.g === 2 && r.serie !== si + 1)) return last;
        return !last || r.d >= last.d ? r : last;
      }, null);
