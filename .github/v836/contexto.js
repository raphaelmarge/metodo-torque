    // Referências não são resultados de hoje. Este bloco nunca grava nem confirma uma série.
    function referencias(a, u) {
      var reps = /^\d+$/.test(a.reps) ? a.reps + ' reps' : a.reps;
      var prescrito = reps + ' · ' + (a.carga == null ? 'carga não definida' : gnum(a.carga) + ' kg');
      var anterior = u ? (u.r == null ? 'reps não anotadas' : u.r + ' reps') + ' · ' + gnum(u.kg) + ' kg' : 'Sem carga anterior anotada';
      var data = u ? ' · ' + u.d.slice(8, 10) + '/' + u.d.slice(5, 7) : '';
      return '<dl class="gserie-referencias" aria-label="Referências da série"><div><dt>Prescrito</dt><dd data-gref="prescrito">' + esc2(prescrito) + '</dd></div>' +
        '<div><dt>Anterior com carga' + esc2(data) + '</dt><dd data-gref="anterior">' + esc2(anterior) + '</dd></div></dl>';
    }
    function textoOrigem(done, reg, sug, dirty) {
      if (dirty) return done ? 'Alteração em rascunho. Salve para atualizar esta série.' : 'Preenchimento em rascunho. ' + (gv.fim ? 'Salve a anotação para registrá-lo.' : 'Toque em Série feita para confirmar.');
      if (done) return 'Série concluída. Salve qualquer alteração do registro.';
      if (gv.fim) return 'Série não concluída. Salvar uma anotação não confirma a execução.';
      if (reg) return 'Anotação salva; série ainda pendente. Toque em Série feita para confirmar.';
      return (sug.kg || sug.reps ? 'Valores sugeridos, ainda não confirmados. ' : 'Série pendente. ') + 'Toque em Série feita depois de realizar.';
    }
    function pintaOrigem() {
      var el = gEl('gOrigemSerie'), fs = gv.formSerie;
      if (!el || !fs) return;
      var it = GUIA[fs.fi] && GUIA[fs.fi].it[fs.ei]; if (!it) return;
      el.textContent = textoOrigem(feita(it, fs.si, fs.ei), SR.registro(it, fs.si, fs.fi, fs.ei), fs.sugeridos || {}, !!gv.sujo);
    }
