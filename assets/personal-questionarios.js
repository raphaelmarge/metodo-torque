/* Questionários: camada de apresentação, sem gravação direta nem chamadas remotas.
 * Mantém os nós, IDs e os handlers canônicos do personal.html (inclusive o CAS).
 * Os modelos abaixo só preenchem um rascunho; Salvar/Criar/Enviar são separados. */
(function () {
  "use strict";
  function $(id) { return document.getElementById(id); }
  function node(tag, cls, text) { var el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; }
  function button(text, fn) { var el = node("button", "btn sec", text); el.type = "button"; el.addEventListener("click", fn); return el; }
  function field(el, title) { var label = node("label", "qpx-field", title); if (el.id) label.htmlFor = el.id; label.appendChild(el); return label; }
  function details(title) { var d = node("details", "qpx-details"); d.appendChild(node("summary", "", title)); return d; }
  function read() { var s = window.MTStore.read("ptStudio", {}) || {}; return { ps: s.questPerguntas || [], qs: s.questionarios || [] }; }
  function normalize(s) { return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
  function uniqueCode(title) {
    var base = normalize(title).slice(0, 5) || "PERG", used = read().ps.map(function (p) { return normalize(p.sigla); });
    if (used.indexOf(base) < 0) return base;
    for (var n = 1; n < 10000; n++) { var suffix = String(n), code = base.slice(0, 5 - suffix.length) + suffix; if (used.indexOf(code) < 0) return code; }
    return "";
  }
  function reveal(el) { for (var p = el.parentElement; p; p = p.parentElement) if (p.tagName === "DETAILS") p.open = true; el.scrollIntoView({ block: "center", behavior: "auto" }); el.focus({ preventScroll: true }); }
  function init() {
    if (!$('qpNovoBox') || !window.__questPT || window.MT_QUESTIONARIOS) return;
    var root = $("vQuest"), form = $("qpNovoBox"), bank = form.closest('.card'), qform = $("qqNovoBox"), questionnaires = qform.closest('.card');
    var options = [], forQuestionnaire = false, autoCode = true, lastCode = "", saveIds = [], newQuestion = null;
    root.classList.add("qpx-root"); bank.classList.add("qpx-bank"); questionnaires.classList.add("qpx-questionnaires"); bank.before(questionnaires);
    bank.querySelector('h2').textContent = "Banco de perguntas"; questionnaires.querySelector('h2').textContent = "Meus questionários";
    bank.querySelector('h2').after(node('p', 'qpx-help', 'Crie uma vez e reutilize em diferentes questionários.'));
    questionnaires.querySelector('h2').after(node('p', 'qpx-help', 'Escolha as perguntas, confira e depois prepare o envio.'));
    var areaOption = root.querySelector('#qtArea option[value="montar"]'); if (areaOption) areaOption.textContent = "Criar e organizar";
    form.querySelector('summary').textContent = "Adicionar pergunta"; qform.querySelector('summary').textContent = "Criar questionário";
    var status = node('p', 'qpx-status'); status.id = 'qpxStatus'; status.setAttribute('role', 'status'); status.tabIndex = -1; form.before(status);
    var error = node('p', 'qpx-error'); error.id = 'qpxError'; error.setAttribute('role', 'alert'); error.hidden = true;
    function fail(text, input) { error.textContent = text; error.hidden = false; if (input) { input.setAttribute('aria-invalid', 'true'); reveal(input); } }
    function changed() { error.hidden = true; form.querySelectorAll('[aria-invalid]').forEach(function (el) { el.removeAttribute('aria-invalid'); }); preview(); }
    var body = node('div', 'qpx-editor'), title = $('qpTitulo'), question = $('qpTexto'), type = $('qpTipo'), code = $('qpSigla'), less = $('qpMenos'), save = $('qpAdd');
    var legacy = node('div'); legacy.hidden = true; legacy.className = 'qpx-legacy';
    var oldOptions = Array.from(form.querySelectorAll('.qpOp'));
    var presetBar = node('div', 'qpx-presets'); presetBar.setAttribute('aria-label', 'Modelos de pergunta');
    var presets = [
      { titulo: 'Disposição', texto: 'Como está sua disposição hoje?', tipo: 'linear', menosMelhor: false },
      { titulo: 'Sono', texto: 'Como foi a qualidade do seu sono?', tipo: 'linear', menosMelhor: false },
      { titulo: 'Dor', texto: 'De 0 a 10, qual foi a intensidade da dor?', tipo: 'linear', menosMelhor: true },
      { titulo: 'Recado', texto: 'Tem algo que gostaria de contar ao seu personal?', tipo: 'texto', menosMelhor: false }
    ];
    presets.forEach(function (p) { presetBar.appendChild(button(p.titulo, function () { draft(p); })); });
    body.appendChild(node('p', 'qpx-help', 'Comece do zero ou use um modelo:')); body.appendChild(presetBar);
    title.placeholder = 'Ex.: Disposição'; question.placeholder = 'O que você quer perguntar ao aluno?'; code.placeholder = 'Gerado automaticamente';
    body.appendChild(field(title, 'Nome da pergunta')); body.appendChild(field(question, 'Pergunta para o aluno'));
    type.options[0].textContent = 'Carinhas'; type.options[1].textContent = 'Nota de 0 a 10'; type.options[2].textContent = 'Texto livre';
    body.appendChild(field(type, 'Como o aluno responde?'));
    var direction = node('select'); direction.id = 'qpxDirection';
    [['maior', 'Nota maior é melhor'], ['menor', 'Nota menor é melhor']].forEach(function (x) { var op = node('option', '', x[1]); op.value = x[0]; direction.appendChild(op); });
    var directionField = field(direction, 'Como interpretar a nota?'); body.appendChild(directionField);
    directionField.appendChild(node('small', 'qpx-help', 'Ex.: disposição → maior; intensidade da dor → menor.'));
    direction.addEventListener('change', function () { less.checked = direction.value === 'menor'; changed(); });
    legacy.appendChild(less);
    var customize = details('Personalizar as carinhas'), optionBox = $('qpOpsBox');
    // Keep the original ops container and serialized inputs for the canonical saver.
    optionBox.replaceChildren(); optionBox.removeAttribute('style'); customize.appendChild(optionBox); body.appendChild(customize);
    var advanced = details('Opções avançadas: código e pontuação'); advanced.id = 'qpxAdvanced';
    advanced.appendChild(field(code, 'Código interno (até 5 letras)'));
    advanced.appendChild(node('p', 'qpx-help', 'O código identifica a pergunta nos relatórios. Você não precisa preenchê-lo.'));
    var points = node('div', 'qpx-points'); advanced.appendChild(points); body.appendChild(advanced);
    oldOptions.forEach(function (input, i) {
      var parts = input.value.split('|'), row = node('div', 'qpx-option'), label = node('input'), score = node('input');
      label.id = 'qpxLabel' + i; label.value = (parts[0] || '').trim(); label.maxLength = 80;
      score.id = 'qpxScore' + i; score.type = 'number'; score.step = 'any'; score.value = (parts[1] || '0').trim(); score.inputMode = 'decimal';
      var emoji = input.getAttribute('data-e'); row.appendChild(field(label, emoji + ' Resposta ' + (i + 1))); optionBox.appendChild(row);
      points.appendChild(field(score, emoji + ' Pontos da resposta ' + (i + 1))); legacy.appendChild(input);
      var op = { input: input, label: label, score: score }; options.push(op);
      function sync() { input.value = label.value.replace(/\|/g, ' ') + ' | ' + score.value; changed(); }
      label.addEventListener('input', sync); score.addEventListener('input', sync);
      input.addEventListener('input', function () { var value = input.value.split('|'); label.value = (value[0] || '').trim(); score.value = (value[1] || '0').trim(); changed(); });
    });
    var previewBox = node('section', 'qpx-preview'); previewBox.setAttribute('aria-label', 'Prévia da pergunta');
    previewBox.appendChild(node('h3', '', 'Prévia do aluno')); var previewContent = node('div'); previewContent.id = 'qpxPreview'; previewBox.appendChild(previewContent);
    previewBox.appendChild(node('p', 'qpx-help', 'Apenas uma prévia. Nada é enviado ao aluno ao criar uma pergunta.')); body.appendChild(previewBox);
    var actions = node('div', 'qpx-actions'); save.textContent = 'Salvar pergunta'; save.removeAttribute('style'); actions.appendChild(save);
    actions.appendChild(button('Limpar rascunho', function () { if ((title.value || question.value) && !confirm('Limpar a pergunta que ainda não foi salva?')) return; reset(); }));
    body.appendChild(error); body.appendChild(actions); body.appendChild(legacy);
    // Remove only empty presentation wrappers; all controls were moved above.
    while (form.children.length > 1) form.lastElementChild.remove(); form.appendChild(body);
    function preview() {
      var textual = type.value === 'texto', emoji = type.value === 'emoji'; directionField.hidden = textual; customize.hidden = !emoji; points.hidden = !emoji;
      direction.value = less.checked ? 'menor' : 'maior';
      previewContent.replaceChildren(node('p', 'qpx-preview-question', question.value.trim() || 'Sua pergunta aparece aqui'));
      var answers = node('div', 'qpx-preview-answers');
      if (textual) answers.appendChild(node('div', 'qpx-text-answer', 'O aluno escreve a resposta aqui…'));
      else if (emoji) options.forEach(function (op) { if (op.label.value.trim()) { var a = node('div', 'qpx-face'); a.appendChild(node('span', '', op.input.getAttribute('data-e'))); a.appendChild(node('small', '', op.label.value)); answers.appendChild(a); } });
      else for (var n = 0; n <= 10; n++) answers.appendChild(node('span', 'qpx-number', String(n)));
      previewContent.appendChild(answers);
    }
    function reset() {
      title.value = ''; question.value = ''; code.value = ''; less.checked = false; type.value = 'emoji'; autoCode = true; lastCode = ''; forQuestionnaire = false;
      var labels = ['Altíssimo', 'Alto', 'Médio', 'Baixo', 'Nenhum'];
      options.forEach(function (op, i) { op.label.value = labels[i]; op.score.value = String(2 - i); op.input.setAttribute('data-e', ['😍', '🙂', '😐', '🙁', '😫'][i]); op.input.value = labels[i] + ' | ' + (2 - i); });
      type.dispatchEvent(new Event('change', { bubbles: true })); changed();
    }
    function draft(p) {
      if ((title.value.trim() || question.value.trim()) && !confirm('Substituir o rascunho não salvo por este modelo?')) return;
      title.value = p.titulo || ''; question.value = p.texto || ''; type.value = p.tipo || 'linear'; less.checked = !!p.menosMelhor;
      autoCode = true; lastCode = uniqueCode(title.value); code.value = lastCode;
      if (p.tipo === 'emoji' && p.ops && p.ops.length <= options.length) options.forEach(function (op, i) { var x = p.ops[i]; op.label.value = x ? x.r : ''; op.score.value = String(x ? x.p : 0); if (x) op.input.setAttribute('data-e', x.e); op.input.value = op.label.value + ' | ' + op.score.value; });
      type.dispatchEvent(new Event('change', { bubbles: true })); changed(); form.open = true; reveal(title);
    }
    title.addEventListener('input', function () { if (autoCode && (!code.value || code.value === lastCode)) { lastCode = uniqueCode(title.value); code.value = lastCode; } changed(); });
    code.addEventListener('input', function () { autoCode = false; changed(); }); question.addEventListener('input', changed); type.addEventListener('change', changed);
    save.addEventListener('click', function (event) {
      error.hidden = true;
      function stop(message, input) { event.preventDefault(); event.stopImmediatePropagation(); fail(message, input); }
      if (!title.value.trim()) return stop('Dê um nome à pergunta.', title);
      if (!question.value.trim()) return stop('Escreva a pergunta que o aluno vai responder.', question);
      if (!code.value.trim() || autoCode) code.value = uniqueCode(title.value);
      var normalized = normalize(code.value).slice(0, 5);
      if (!normalized) return stop('Use letras ou números no código interno.', code);
      if (read().ps.some(function (p) { return normalize(p.sigla) === normalized; })) return stop('Este código já existe. Escolha outro para não confundir os relatórios.', code);
      code.value = normalized;
      if (type.value === 'emoji') {
        var visible = options.filter(function (op) { return op.label.value.trim(); });
        if (visible.length < 2) return stop('Preencha pelo menos duas respostas.', options[0].label);
        var invalid = visible.find(function (op) { return op.score.value.trim() === '' || !Number.isFinite(Number(op.score.value)); });
        if (invalid) return stop('Confira a pontuação: use um número válido.', invalid.score);
        options.forEach(function (op) { op.input.value = op.label.value.replace(/\|/g, ' ') + ' | ' + op.score.value; });
      }
      if (type.value === 'texto') less.checked = false;
      save.disabled = true;
      saveIds = read().ps.map(function (p) { return p.id; }); newQuestion = { code: code.value, forQuestionnaire: forQuestionnaire, title: title.value, text: question.value, less: less.checked };
      // The original click listener saves. Verify by reading AFTER it; never write here.
      setTimeout(function () {
        save.disabled = false;
        var added = read().ps.find(function (p) { return saveIds.indexOf(p.id) < 0 && p.sigla === newQuestion.code; });
        if (!added) { title.value = newQuestion.title; question.value = newQuestion.text; code.value = newQuestion.code; less.checked = newQuestion.less; changed(); fail('Não foi possível confirmar a gravação. O rascunho foi mantido; confira o armazenamento antes de tentar novamente.'); return; }
        if (newQuestion.forQuestionnaire) { var check = Array.from(document.querySelectorAll('.qqCheck')).find(function (c) { return c.value === added.id; }); if (check) check.checked = true; }
        status.textContent = 'Pergunta salva no banco.' + (newQuestion.forQuestionnaire ? ' Já está selecionada no questionário em montagem.' : ' Agora ela pode ser usada em um questionário.');
        var backToQuestionnaire = newQuestion.forQuestionnaire; reset(); form.open = false; form.querySelector('summary').focus({ preventScroll: true }); updateSelection();
        if (backToQuestionnaire) { qform.open = true; reveal($('qqNome')); }
      });
    }, true);
    // Questionnaire creation: name -> selection -> save, without a new data model.
    var qbody = node('div', 'qpx-editor'), qname = $('qqNome'), qchecks = $('qqPerguntas'), qsave = $('qqAdd');
    qbody.appendChild(field(qname, 'Nome do questionário')); qname.placeholder = 'Ex.: Check-in semanal';
    var selected = node('p', 'qpx-selected'); selected.id = 'qpxSelected'; selected.setAttribute('role', 'status'); qbody.appendChild(selected);
    qbody.appendChild(qchecks);
    var qerror = node('p', 'qpx-error'); qerror.id = 'qpxQuestionnaireError';
    qerror.setAttribute('role', 'alert'); qerror.hidden = true; qbody.appendChild(qerror);
    qbody.appendChild(button('+ Criar uma pergunta', function () { forQuestionnaire = true; form.open = true; reveal(title); }));
    var qactions = node('div', 'qpx-actions'); qsave.textContent = 'Criar questionário'; qactions.appendChild(qsave); qbody.appendChild(qactions);
    qbody.appendChild(node('p', 'qpx-help', 'Criar salva o modelo. O envio acontece na área “Enviar ao aluno”.'));
    while (qform.children.length > 1) qform.lastElementChild.remove(); qform.appendChild(qbody);
    function updateSelection() { var checks = Array.from(qchecks.querySelectorAll('.qqCheck')), count = checks.filter(function (c) { return c.checked; }).length; selected.textContent = count + (count === 1 ? ' pergunta selecionada' : ' perguntas selecionadas'); if (!checks.length) selected.textContent = 'Crie sua primeira pergunta no banco abaixo.'; }
    qchecks.addEventListener('change', updateSelection);
    // Captura o rascunho ANTES do handler canônico, que pode limpar os campos
    // mesmo quando o armazenamento recusa a gravação. Só ele continua gravando;
    // aqui confirmamos um ID novo e restauramos apenas a interface em caso de falha.
    qsave.addEventListener('click', function (event) {
      if (qsave.disabled) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      var pendingName = qname.value;
      var pendingIds = Array.from(qchecks.querySelectorAll('.qqCheck:checked')).map(function (c) { return c.value; });
      if (!pendingName.trim() || !pendingIds.length) return; // Validação canônica.
      var previousIds = read().qs.map(function (q) { return q.id; });
      qerror.hidden = true; qsave.disabled = true;
      setTimeout(function () {
        try {
          var added = read().qs.some(function (q) {
            return previousIds.indexOf(q.id) < 0 && q.nome === pendingName.trim() &&
              Array.isArray(q.perguntas) && q.perguntas.length === pendingIds.length &&
              q.perguntas.every(function (id, i) { return id === pendingIds[i]; });
          });
          if (!added) {
            qname.value = pendingName;
            qchecks.querySelectorAll('.qqCheck').forEach(function (c) { c.checked = pendingIds.indexOf(c.value) >= 0; });
            qerror.textContent = 'Não foi possível confirmar a gravação. O nome e a seleção foram mantidos; confira o armazenamento antes de tentar novamente.';
            qerror.hidden = false; qform.open = true; reveal(qname);
          } else {
            qform.open = false; qform.querySelector('summary').focus({ preventScroll: true });
          }
          updateSelection();
        } finally { qsave.disabled = false; }
      });
    }, true);
    function decorateQuestions() {
      var data = read(), counts = {}; data.ps.forEach(function (p) { var key = normalize(p.sigla); counts[key] = (counts[key] || 0) + 1; });
      $('qpLista').querySelectorAll('[data-qp-row]').forEach(function (row) {
        if (row.dataset.qpxReady) return;
        var remove = row.querySelector('[data-qprm]'), invert = row.querySelector('[data-qpinv]'); if (!remove) return;
        var p = data.ps.find(function (x) { return x.id === remove.getAttribute('data-qprm'); }); if (!p) return;
        row.dataset.qpxReady = '1'; row.className = 'qpx-question'; row.removeAttribute('style');
        var info = node('div', 'qpx-question-info'), heading = node('h3', '', p.titulo || p.sigla), meta = node('div', 'qpx-meta'); info.appendChild(heading);
        info.appendChild(node('p', 'qpx-question-text', p.texto));
        meta.appendChild(node('span', 'qpx-chip', p.tipo === 'emoji' ? 'Carinhas' : p.tipo === 'linear' ? 'Nota 0–10' : 'Texto livre'));
        if (p.tipo !== 'texto') meta.appendChild(node('span', 'qpx-chip', p.menosMelhor ? 'nota menor é melhor' : 'nota maior é melhor'));
        meta.appendChild(node('span', 'qpx-code', p.sigla)); info.appendChild(meta);
        if (counts[normalize(p.sigla)] > 1) info.appendChild(node('p', 'qpx-help', 'Código repetido no cadastro. As perguntas e respostas foram mantidas.'));
        var more = details('Opções'); more.classList.add('qpx-row-options');
        if (p.tipo !== 'texto' && invert) {
          var select = node('select'); select.id = 'qpxRead-' + p.id;
          [['maior', 'Nota maior é melhor'], ['menor', 'Nota menor é melhor']].forEach(function (x) { var o = node('option', '', x[1]); o.value = x[0]; select.appendChild(o); });
          select.value = p.menosMelhor ? 'menor' : 'maior'; more.appendChild(field(select, 'Interpretação atual'));
          more.appendChild(node('p', 'qpx-help', 'Mudar a leitura exige reenviar o questionário para valer nos próximos check-ins.'));
          select.addEventListener('change', function () { if ((select.value === 'menor') !== !!p.menosMelhor) invert.click(); });
        }
        if (invert) { invert.hidden = true; more.appendChild(invert); }
        if (!p.ops || p.ops.length <= options.length) more.appendChild(button('Usar como base', function () { draft(p); }));
        var used = data.qs.filter(function (q) { return (q.perguntas || []).indexOf(p.id) >= 0; }).length;
        if (used) { remove.hidden = true; more.appendChild(node('p', 'qpx-help', 'Usada em ' + used + ' questionário(s). Exclusão indisponível aqui para preservar os vínculos.')); }
        else { remove.hidden = false; remove.textContent = 'Excluir pergunta'; }
        more.appendChild(remove); row.replaceChildren(info, more);
      });
    }
    function decorateQuestionnaires() {
      var data = read();
      $('qqLista').querySelectorAll('[data-qqrm]').forEach(function (remove) {
        var row = remove.closest('.linha-flex'); if (!row || row.dataset.qpxReady) return;
        var q = data.qs.find(function (x) { return x.id === remove.getAttribute('data-qqrm'); }); if (!q) return;
        row.dataset.qpxReady = '1'; row.className = 'linha-flex qpx-saved'; row.removeAttribute('style');
        var info = node('div', 'qpx-question-info'); info.appendChild(node('h3', '', q.nome));
        info.appendChild(node('p', 'qpx-help', q.perguntas.length + ' pergunta(s) · Modelo salvo'));
        var actions = node('div', 'qpx-saved-actions');
        actions.appendChild(button('Preparar envio', function () { window.__qtAba('enviar'); $('qeQuest').value = q.id; $('qeQuest').dispatchEvent(new Event('change', { bubbles: true })); reveal($('qeAlunoBusca') || $('qeAluno')); }));
        var more = details('Opções'); more.appendChild(button('Usar como base', function () {
          if ($('qqNome').value.trim() && !confirm('Substituir o questionário ainda não salvo por este modelo?')) return;
          $('qqNome').value = q.nome + ' (cópia)'; qchecks.querySelectorAll('.qqCheck').forEach(function (c) { c.checked = q.perguntas.indexOf(c.value) >= 0; }); updateSelection(); qform.open = true; reveal($('qqNome'));
        })); more.appendChild(remove); actions.appendChild(more); row.replaceChildren(info, actions);
      });
    }
    function decorateSelection() {
      var data = read(); qchecks.querySelectorAll('.qqCheck').forEach(function (c) { var label = c.closest('label'), p = data.ps.find(function (x) { return x.id === c.value; }); if (!label || !p || label.dataset.qpxReady) return; label.dataset.qpxReady = '1'; label.className = 'qpx-choice'; label.removeAttribute('style'); label.replaceChildren(c, node('span', '', p.titulo + ' · ' + p.sigla)); }); updateSelection();
    }
    new MutationObserver(decorateQuestions).observe($('qpLista'), { childList: true, subtree: true });
    new MutationObserver(decorateQuestionnaires).observe($('qqLista'), { childList: true, subtree: true });
    new MutationObserver(decorateSelection).observe(qchecks, { childList: true, subtree: true });
    decorateQuestions(); decorateQuestionnaires(); decorateSelection(); preview();
    window.MT_QUESTIONARIOS = { ready: true };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
