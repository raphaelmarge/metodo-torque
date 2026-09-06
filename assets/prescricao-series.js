/* Editor de prescrição. A mesma normalização acompanha o pacote e o player. */
(function (root) {
  'use strict';
  var C;
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function individual(it) { return Array.isArray(it.seriesDetalhadas) && it.seriesDetalhadas.length > 0; }
  function series(it) { return root.MT_APP_ALUNO.normalizaSeries(it); }
  function resumo(it) {
    var s = series(it);
    if (individual(it)) return s.length + ' séries · ' + s.slice(0,4).map(function (x) { return x.reps; }).join(' / ') + (s.length > 4 ? ' / …' : '') + ' · por série';
    return s.length + ' × ' + s[0].reps + (s[0].carga != null ? ' · ' + s[0].carga + ' kg' : '') + ' · ' + s[0].descanso + ' s';
  }
  function input(label, attr, value, field) {
    var numeric = field !== 'reps', rules = field === 'series' ? ' min="1" max="30" step="1"' : field === 'descanso' ? ' min="0" max="1800" step="1"' : ' min="0" max="2000" step="any"';
    return '<label>' + label + '<input ' + attr + ' value="' + esc(value) + '"' + (numeric ? ' type="number" inputmode="' + (field === 'carga' ? 'decimal' : 'numeric') + '"' + rules : ' maxlength="40" placeholder="10, 8–12 ou 30s"') + (field === 'carga' ? ' placeholder="Opcional"' : ' required') + '></label>';
  }
  function editor(it, key, aberto, opcoesTec) {
    var ind = individual(it), s = series(it), k = esc(key);
    var html = '<div class="tdedit sp-editor"' + (aberto ? '' : ' hidden') + '><div class="sp-modes" role="group" aria-label="Como prescrever as séries">' + ['uniform','individual'].map(function (mode) {
      return '<button type="button" class="btn sec" data-sermode="' + k + '" data-mode="' + mode + '" aria-pressed="' + ((mode === 'individual') === ind) + '">' + (mode === 'uniform' ? 'Todas iguais' : 'Por série') + '</button>';
    }).join('') + '</div>';
    if (ind) {
      html += '<p class="sp-help">Defina cada série na ordem em que o aluno vai executar.</p><div class="sp-rows">' + s.map(function (x, i) {
        var attr = 'data-serfld="' + k + ':' + i + ':';
        return '<div class="sp-row"><b class="sp-number">' + (i + 1) + '<span>ª série</span></b>' + input('Reps ou tempo', attr + 'reps"', x.reps, 'reps') + input('Carga (kg)', attr + 'carga"', x.carga, 'carga') + input('Descanso (s)', attr + 'descanso"', x.descanso, 'descanso') + '<button type="button" class="sp-remove" data-serremove="' + k + ':' + i + '" aria-label="Remover série ' + (i + 1) + '"' + (s.length === 1 ? ' disabled' : '') + '>×</button></div>';
      }).join('') + '</div><button type="button" class="btn sec sp-add" data-seradd="' + k + '"' + (s.length >= 30 ? ' disabled' : '') + '>+ Adicionar série</button>';
    } else {
      html += '<div class="sp-uniform">' + input('Séries', 'data-tfld="' + k + ':series"', s.length, 'series') + input('Reps ou tempo', 'data-tfld="' + k + ':reps"', s[0].reps, 'reps') + input('Carga (kg)', 'data-tfld="' + k + ':carga"', s[0].carga, 'carga') + input('Descanso (s)', 'data-tfld="' + k + ':descanso"', s[0].descanso, 'descanso') + '</div>';
    }
    return html + '<div class="sp-footer"><span class="sp-help">Carga vazia = sem carga definida.</span><button type="button" class="btn sec mini" data-serpreview="' + k + '">Ver como aluno</button></div><details class="sp-extras" data-serextras="' + k + '"><summary>Orientações e opções extras</summary><div class="sp-extra-fields"><label>Tipo de série<select data-tfld="' + k + ':tec">' + opcoesTec(it.tec) + '</select></label><label>Observação para o aluno<input data-tfld="' + k + ':obs" value="' + esc(it.obs) + '" maxlength="120" placeholder="Ex.: pegada fechada, desce devagar"></label><label>Seu vídeo neste exercício<input data-tfld="' + k + ':video" value="' + esc(it.video) + '" placeholder="Link do YouTube, Vimeo ou .mp4"></label><label>Alternativas aprovadas<input data-tfld="' + k + ':alternativas" value="' + esc((it.alternativas || []).join('; ')) + '" maxlength="250" placeholder="Separe até duas alternativas com ponto e vírgula"></label></div></details><p class="sp-status" role="status"></p></div>';
  }
  function localiza(key, aluno) {
    if (aluno && aluno !== C.aluno()) return null;
    var parts = key.split(':'), st = C.load(), id = C.aluno();
    var f = C.treino(st, id).fichas.find(function (x) { return x.id === parts[0]; });
    var it = f && f.itens[+parts[1]];
    return it ? { st: st, id: id, f: f, it: it } : null;
  }
  function status(key, msg) {
    var el = C.box.querySelector('[data-tdex="' + key + '"] .sp-status');
    if (el) el.textContent = msg;
  }
  function salva(x, key, render) {
    C.marcar(x.st, x.id);
    if (C.write(x.st) === false) { status(key, 'Não foi possível salvar. Confira o espaço do dispositivo e tente novamente.'); return false; }
    if (render) { C.abrir(key); C.render(); }
    else C.atualizar(x, key);
    return true;
  }
  function valor(el, field) {
    var v = el.value.trim(), n = Number(v), msg = '';
    if (field === 'reps') { if (!v || v.length > 40) msg = 'Informe repetições ou tempo (até 40 caracteres).'; }
    else if (field === 'carga' && !v) n = null;
    else if (!v || !isFinite(n) || n < (field === 'series' ? 1 : 0) || n > (field === 'series' ? 30 : field === 'descanso' ? 1800 : 2000) || (field !== 'carga' && !Number.isInteger(n))) msg = field === 'series' ? 'Use entre 1 e 30 séries.' : field === 'descanso' ? 'Informe de 0 a 1800 segundos inteiros.' : 'Informe uma carga entre 0 e 2000 kg ou deixe vazio.';
    el.setCustomValidity(msg); el.setAttribute('aria-invalid', msg ? 'true' : 'false');
    return { ok: !msg, value: field === 'reps' ? v : n, mensagem: msg };
  }
  function valida() {
    if (!C) return true;
    var bad = C.box.querySelector('.sp-editor input[aria-invalid="true"]');
    if (!bad) return true;
    var ed = bad.closest('.sp-editor'); ed.hidden = false;
    var det = bad.closest('details'); if (det) det.open = true;
    bad.focus(); bad.reportValidity(); return false;
  }
  // O rascunho vive no formulário da ficha, sem gravar exercício antes de Adicionar.
  // Trocar o modo preserva os dois preenchimentos até a confirmação da inclusão.
  function novo(fid) {
    var k = esc(fid);
    return '<div class="sp-composer tdaw" data-exprescricao="' + k + '"><div class="sp-modes" role="group" aria-label="Como prescrever as séries">' +
      '<button type="button" class="btn sec" data-exmode="uniform" aria-pressed="true">Todas iguais</button><button type="button" class="btn sec" data-exmode="individual" aria-pressed="false">Por série</button></div>' +
      '<div class="sp-uniform" data-exuniform>' + input('Séries', 'data-exser="' + k + '"', 3, 'series') + input('Repetições', 'data-exrep="' + k + '"', '12', 'reps') +
      input('Carga (kg)', 'data-excarga="' + k + '"', '', 'carga') + input('Descanso (s)', 'data-exdes="' + k + '"', 60, 'descanso') + '</div>' +
      '<div data-exindividual hidden><p class="sp-help">Defina cada série na ordem em que o aluno vai executar.</p><div class="sp-rows"></div><button type="button" class="btn sec sp-add" data-exseriesadd>+ Adicionar série</button></div><p class="sp-status" role="status"></p></div>';
  }
  function camposNovos(box) {
    var ind = !box.querySelector('[data-exindividual]').hidden;
    return Array.from(box.querySelectorAll(ind ? '[data-exseriesfld]' : '[data-exuniform] input'));
  }
  function campoNovo(el) {
    if (el.hasAttribute('data-exseriesfld')) return el.getAttribute('data-exseriesfld').split(':')[1];
    return el.hasAttribute('data-exser') ? 'series' : el.hasAttribute('data-exrep') ? 'reps' : el.hasAttribute('data-excarga') ? 'carga' : 'descanso';
  }
  function validaNovo(box, reportar) {
    var primeiro;
    camposNovos(box).forEach(function(el) { var v = valor(el, campoNovo(el)); if (!v.ok && !primeiro) primeiro = el; });
    box.querySelector('.sp-status').textContent = primeiro ? primeiro.validationMessage : '';
    if (primeiro && reportar) { primeiro.focus(); primeiro.reportValidity(); }
    return !primeiro;
  }
  function linhasNovas(box) {
    return Array.from(box.querySelectorAll('.sp-row')).map(function(row) {
      var s = {};
      row.querySelectorAll('input').forEach(function(el) { s[campoNovo(el)] = el.value; });
      return s;
    });
  }
  function pintaNovas(box, s) {
    box.querySelector('.sp-rows').innerHTML = s.map(function(x, i) {
      var attr = 'data-exseriesfld="' + i + ':';
      return '<div class="sp-row"><b class="sp-number">' + (i + 1) + '<span>ª série</span></b>' + input('Reps ou tempo', attr + 'reps"', x.reps, 'reps') + input('Carga (kg)', attr + 'carga"', x.carga, 'carga') + input('Descanso (s)', attr + 'descanso"', x.descanso, 'descanso') +
        '<button type="button" class="sp-remove" data-exseriesremove="' + i + '" aria-label="Remover série ' + (i + 1) + '"' + (s.length === 1 ? ' disabled' : '') + '>×</button></div>';
    }).join('');
    box.querySelector('[data-exseriesadd]').disabled = s.length >= 30;
  }
  function lerNovo(fid) {
    var box = C.box.querySelector('[data-exprescricao="' + fid + '"]');
    if (!box || !validaNovo(box, true)) return null;
    var it = {};
    if (box.querySelector('[data-exindividual]').hidden) {
      camposNovos(box).forEach(function(el) { var field = campoNovo(el); it[field] = valor(el, field).value; });
    } else {
      it.seriesDetalhadas = linhasNovas(box).map(function(s) { return {reps:s.reps.trim(), carga:s.carga === '' ? null : Number(s.carga), descanso:Number(s.descanso)}; });
      it.series = it.seriesDetalhadas.length;
      it.reps = it.seriesDetalhadas[0].reps; it.descanso = it.seriesDetalhadas[0].descanso;
    }
    return it;
  }
  function initNovo() {
    C.box.addEventListener('input', function(e) {
      var box = e.target.closest('[data-exprescricao]');
      if (box && e.target.matches('input')) validaNovo(box, false);
    });
    C.box.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-exmode],[data-exseriesadd],[data-exseriesremove]');
      if (!btn) return;
      var box = btn.closest('[data-exprescricao]'), ind = box.querySelector('[data-exindividual]'), s;
      if (btn.hasAttribute('data-exmode')) {
        var mode = btn.getAttribute('data-exmode');
        if (mode === 'individual' && !ind.querySelector('.sp-row')) {
          if (!validaNovo(box, true)) return;
          var it = lerNovo(box.getAttribute('data-exprescricao'));
          pintaNovas(box, series(it));
        }
        ind.hidden = mode !== 'individual'; box.querySelector('[data-exuniform]').hidden = mode !== 'uniform';
        box.querySelectorAll('[data-exmode]').forEach(function(b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-exmode') === mode)); });
        validaNovo(box, false); return;
      }
      s = linhasNovas(box);
      if (btn.hasAttribute('data-exseriesremove')) {
        if (s.length <= 1) return;
        var index = Number(btn.getAttribute('data-exseriesremove'));
        s.splice(index, 1); pintaNovas(box, s); validaNovo(box, false);
        box.querySelector('[data-exseriesfld="' + Math.min(index, s.length - 1) + ':reps"]').focus();
      } else {
        if (s.length >= 30 || !validaNovo(box, true)) return;
        s.push(Object.assign({}, s[s.length - 1])); pintaNovas(box, s);
        box.querySelector('[data-exseriesfld="' + (s.length - 1) + ':reps"]').focus();
      }
    });
  }
  function dialog(id, title, content) {
    var prev = document.getElementById(id); if (prev) prev.remove();
    var d = document.createElement('dialog'); d.id = id; d.className = 'ac-dialog sp-dialog';
    d.setAttribute('aria-labelledby', id + 'Titulo'); d.innerHTML = '<h2 id="' + id + 'Titulo">' + esc(title) + '</h2>' + content;
    document.body.appendChild(d); d.addEventListener('close', function () { d.remove(); }); d.showModal(); return d;
  }
  function uniformiza(key, x) {
    var s = series(x.it), base = JSON.stringify(x.it), d = dialog('spUniformiza', 'Usar todas as séries iguais', '<p>Este padrão substituirá as ' + s.length + ' séries individuais deste exercício. Confira antes de aplicar.</p><div class="sp-uniform">' + input('Séries', 'id="spQtd"', s.length, 'series') + input('Reps ou tempo', 'id="spReps"', s[0].reps, 'reps') + input('Carga (kg)', 'id="spCarga"', s[0].carga, 'carga') + input('Descanso (s)', 'id="spDesc"', s[0].descanso, 'descanso') + '</div><p class="sp-status" role="status"></p><div class="ac-actions"><button type="button" class="btn sec" id="spCancelarPadrao">Cancelar</button><button type="button" class="btn" id="spConfirmarPadrao">Aplicar padrão</button></div>');
    d.querySelector('#spCancelarPadrao').onclick = function () { d.close(); };
    d.querySelector('#spConfirmarPadrao').onclick = function () {
      var next = {}, good = true;
      [['spQtd','series'],['spReps','reps'],['spCarga','carga'],['spDesc','descanso']].forEach(function (p) { var el = d.querySelector('#' + p[0]), v = valor(el, p[1]); next[p[1]] = v.value; if (!v.ok) { good = false; el.reportValidity(); } });
      if (!good) return;
      var fresh = localiza(key, x.id);
      if (!fresh || JSON.stringify(fresh.it) !== base) { d.querySelector('.sp-status').textContent = 'A ficha mudou. Feche esta janela e confira o exercício novamente.'; return; }
      Object.assign(fresh.it, next); delete fresh.it.seriesDetalhadas;
      if (salva(fresh, key, true)) d.close(); else d.querySelector('.sp-status').textContent = 'Não foi possível salvar. Tente novamente.';
    };
  }
  function previa(key, x) {
    var s = series(x.it), i = 0, ex = C.ex(x.st, x.it.exId) || {}, d = dialog('spPrevia', 'Como o aluno vai receber', '<p>' + esc(ex.nome || 'Exercício') + '</p><div class="sp-preview"></div><div class="ac-actions"><button class="btn sec" data-sp-ant>Anterior</button><button class="btn sec" data-sp-prox>Próxima série</button><button class="btn" data-sp-fechar>Fechar prévia</button></div>');
    function paint() { var v = s[i]; d.querySelector('.sp-preview').innerHTML = '<span>Série ' + (i + 1) + ' de ' + s.length + '</span><strong>' + esc(v.reps) + (/^\d+(?:[–-]\d+)?$/.test(v.reps) ? ' repetições' : '') + '</strong><p>' + (v.carga == null ? 'Carga não definida' : v.carga === 0 ? '0 kg · peso do corpo' : esc(v.carga) + ' kg') + '</p><p>Descanso após esta série: ' + v.descanso + ' s</p>'; d.querySelector('[data-sp-ant]').disabled = i === 0; d.querySelector('[data-sp-prox]').disabled = i === s.length - 1; }
    d.querySelector('[data-sp-ant]').onclick = function () { i--; paint(); }; d.querySelector('[data-sp-prox]').onclick = function () { i++; paint(); }; d.querySelector('[data-sp-fechar]').onclick = function () { d.close(); }; paint();
  }
  function init(context) {
    C = context;
    initNovo();
    function field(e) {
      var attr = e.target.getAttribute && e.target.getAttribute('data-serfld'); if (!attr) return;
      var p = attr.split(':'), key = p.slice(0,2).join(':'), x = localiza(key), v = valor(e.target, p[3]);
      status(key, v.mensagem); if (!v.ok || !x || !individual(x.it)) return;
      x.it.seriesDetalhadas = series(x.it); if (!x.it.seriesDetalhadas[+p[2]]) return;
      x.it.seriesDetalhadas[+p[2]][p[3]] = v.value; x.it.series = x.it.seriesDetalhadas.length;
      if (!salva(x, key, false)) { e.target.setCustomValidity('Não foi possível salvar. Tente novamente.'); e.target.setAttribute('aria-invalid','true'); }
    }
    C.box.addEventListener('input', field); C.box.addEventListener('change', field);
    C.box.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-sermode],[data-seradd],[data-serremove],[data-serpreview]'); if (!btn) return;
      var key = btn.getAttribute('data-sermode') || btn.getAttribute('data-seradd') || btn.getAttribute('data-serremove') || btn.getAttribute('data-serpreview'), parts = key.split(':'), row = +parts[2]; key = parts.slice(0,2).join(':');
      var x = localiza(key); if (!x) return;
      if (btn.hasAttribute('data-serremove')) {
        var otherBad = Array.from(C.box.querySelectorAll('[aria-invalid="true"]')).some(function(el){return (el.getAttribute('data-serfld') || '').indexOf(key + ':' + row + ':') !== 0;});
        if (otherBad && !valida()) return;
        var all = series(x.it); if (all.length < 2) return; all.splice(row,1); x.it.seriesDetalhadas = all; x.it.series = all.length; salva(x,key,true); return;
      }
      if (!valida()) return;
      if (btn.hasAttribute('data-serpreview')) { previa(key,x); return; }
      if (btn.hasAttribute('data-seradd')) { var s = series(x.it); if (s.length >= 30) return; s.push(Object.assign({},s[s.length-1])); x.it.seriesDetalhadas = s; x.it.series = s.length; salva(x,key,true); return; }
      if (btn.dataset.mode === 'individual' && !individual(x.it)) { x.it.seriesDetalhadas = series(x.it); x.it.series = x.it.seriesDetalhadas.length; salva(x,key,true); }
      else if (btn.dataset.mode === 'uniform' && individual(x.it)) uniformiza(key,x);
    });
    C.box.addEventListener('click', function(e) {
      if (!e.target.closest('[data-exab],[data-additem],[data-sobe],[data-desce],[data-exadd],[data-rmitem],[data-rmficha]')) return;
      if (!valida()) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
  }
  root.MT_PRESCRICAO = { editor: editor, novo: novo, lerNovo: lerNovo, init: init, resumo: resumo, individual: individual, series: series, valida: valida, valor: valor };
})(typeof window !== 'undefined' ? window : globalThis);
