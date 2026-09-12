/* Entrada dedicada: dados em memória e os mesmos handlers da Central Pro real. */
(function () {
  'use strict';
  if (document.documentElement.dataset.demo !== 'central-pro') return;
  var demo = window.MT_CENTRAL_PRO_DEMO;
  if (!demo) return;
  window.MT_supabase = demo.client;
  function byId(id) { return document.getElementById(id); }
  function init() {
    var back = byId('ptProSuite'), trigger = byId('ptProSuiteBtn'), home = byId('demoProInicio');
    if (!back || !trigger) { byId('demoProCarregando').textContent = 'Não foi possível abrir. Atualize a página para tentar novamente.'; return; }
    byId('demoProCarregando').hidden = true;
    var names = {};
    demo.alunos.forEach(function (a) { names[a.id] = a.nome; });
    var brand = back.querySelector('.ptpro-brand');
    brand.querySelector('small').textContent = 'TORQUE PERSONAL · Demo';
    brand.querySelector('p').textContent = 'Explore as cinco ferramentas com dados de exemplo.';
    back.querySelector('[data-ptpro-view="import"] .ptpro-head p').textContent = 'Confira os dados do arquivo e salve uma importação para revisão.';
    var tools = document.createElement('div'); tools.className = 'demo-pro-tools';
    tools.innerHTML = '<span class="demo-pro-demo-label">Dados fictícios · sem login</span><button type="button" class="ptpro-btn sec" id="demoProTema" aria-pressed="false">Modo claro</button><button type="button" class="ptpro-btn sec" id="demoProRecomecar">Recomeçar demo</button>';
    brand.appendChild(tools);
    byId('demoProTema').onclick = function () {
      var light = document.documentElement.dataset.tema !== 'claro';
      document.documentElement.dataset.tema = light ? 'claro' : 'escuro';
      this.textContent = light ? 'Modo escuro' : 'Modo claro'; this.setAttribute('aria-pressed', String(light));
    };
    byId('demoProRecomecar').onclick = function () { location.reload(); };
    function fillStudents(select, optional) {
      if (optional) { var blank = document.createElement('option'); blank.value = ''; blank.textContent = 'Sem aluno vinculado'; select.appendChild(blank); }
      demo.alunos.forEach(function (a) { var opt = document.createElement('option'); opt.value = a.id; opt.textContent = a.nome; select.appendChild(opt); });
      select.value = 'demo-ana';
    }
    ['ptProImportAluno','ptProSessAluno','ptProWaitAluno','ptProCredAluno','ptProTeamAluno'].forEach(function (id) {
      var old = byId(id), select = document.createElement('select'); select.id = id;
      select.setAttribute('aria-label', id === 'ptProImportAluno' ? 'Aluno da importação' : 'Aluno');
      fillStudents(select, id === 'ptProImportAluno'); old.replaceWith(select);
    });
    var d = new Date(); d.setDate(d.getDate() + 1);
    byId('ptProWaitDia').value = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    byId('ptProWaitHora').value = '08:00';
    byId('ptProSessObs').value = 'Sessão de demonstração — acompanhar execução e registrar as séries.';
    byId('ptProFile').setAttribute('aria-label', 'Escolher arquivo para importar');
    var example = document.createElement('div'); example.className = 'demo-pro-example';
    example.innerHTML = '<button type="button" id="demoProExemplo" class="ptpro-btn sec">Carregar ficha de exemplo</button><span class="ptpro-muted">Experimente a prévia e salve um rascunho neste demo.</span>';
    back.querySelector('.ptpro-drop').before(example);
    byId('demoProExemplo').onclick = function () {
      try {
        var file = new File(['Exercício,Séries,Repetições,Carga (kg)\nSupino reto,3,10,30\nRemada baixa,3,12,25\nAgachamento livre,3,10,40\n'], 'ficha-exemplo.csv', {type:'text/csv'});
        var dt = new DataTransfer(); dt.items.add(file); byId('ptProFile').files = dt.files;
        byId('ptProFile').dispatchEvent(new Event('change', {bubbles:true}));
      } catch (_) { byId('ptProImportStatus').textContent = 'Escolha um arquivo CSV, JSON ou texto para testar a importação neste navegador.'; }
    };
    var sim = document.createElement('section'); sim.className = 'demo-pro-simulate';
    sim.innerHTML = '<h4>Experimentar uma automação</h4><p class="ptpro-muted">Simule um evento e veja as providências das regras ativas aparecerem na fila.</p><div class="ptpro-field"><label for="demoProEvento">Evento de exemplo</label><select id="demoProEvento"><option value="questionario.respondido">Questionário respondido</option><option value="aluno.novo">Novo aluno</option><option value="agenda.cancelada">Sessão cancelada</option></select></div><div class="ptpro-field"><label for="demoProAlunoEvento">Aluno do exemplo</label><select id="demoProAlunoEvento"></select></div><button type="button" id="demoProSimular" class="ptpro-btn sec">Simular evento</button><p id="demoProSimStatus" class="ptpro-status" role="status"></p>';
    back.querySelector('[data-ptpro-view="automacoes"] .ptpro-card').appendChild(sim);
    fillStudents(byId('demoProAlunoEvento'));
    byId('demoProSimular').onclick = async function () {
      this.disabled = true;
      try {
        var r = await demo.simulate(byId('demoProEvento').value, byId('demoProAlunoEvento').value);
        if (r.error) throw new Error(r.error.message);
        byId('demoProSimStatus').textContent = r.count ? r.count + ' providência(s) criadas na demonstração.' : 'Nenhuma regra ativa corresponde a este evento.';
        back.querySelector('[data-ptpro-tab="automacoes"]').click();
      } catch (err) { byId('demoProSimStatus').textContent = err.message; }
      finally { this.disabled = false; }
    };
    var seq = 0;
    function accessibility() {
      back.querySelectorAll('.ptpro-field').forEach(function (field) {
        var label = field.querySelector('label'), input = field.querySelector('input,select,textarea');
        if (label && input) { if (!input.id) input.id = 'demoProCampo' + (++seq); if (label.htmlFor !== input.id) label.htmlFor = input.id; }
      });
      back.querySelectorAll('.ptpro-status').forEach(function (el) { if (!el.hasAttribute('role')) el.setAttribute('role','status'); });
      back.querySelectorAll('.ptpro-item strong').forEach(function (el) { if (names[el.textContent]) el.textContent = names[el.textContent]; });
      back.querySelectorAll('[data-ptpro-tab]').forEach(function (el) {
        var id = el.dataset.ptproTab, active = el.classList.contains('ativa');
        if (!el.id) el.id = 'demoProTab-' + id;
        var panel = back.querySelector('[data-ptpro-view="' + id + '"]');
        if (!panel.id) { panel.id = 'demoProPainel-' + id; panel.setAttribute('role','tabpanel'); panel.setAttribute('aria-labelledby',el.id); }
        el.setAttribute('aria-controls',panel.id);
        if (el.getAttribute('aria-selected') !== String(active)) el.setAttribute('aria-selected',String(active));
        el.setAttribute('role','tab');
        el.tabIndex = active ? 0 : -1;
      });
      home.inert = back.classList.contains('aberta');
    }
    back.querySelector('.ptpro-nav').setAttribute('role','tablist');
    back.querySelector('.ptpro-nav').addEventListener('keydown', function (ev) {
      var tabs = Array.from(this.querySelectorAll('[data-ptpro-tab]')), index = tabs.indexOf(document.activeElement);
      if (index < 0 || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(ev.key)) return;
      ev.preventDefault();
      var next = ev.key === 'Home' ? 0 : ev.key === 'End' ? tabs.length - 1 : (index + (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' ? -1 : 1) + tabs.length) % tabs.length;
      tabs[next].click(); tabs[next].focus();
    });
    back.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Tab' || !back.classList.contains('aberta')) return;
      var focusable = Array.from(back.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')).filter(function (el) { return el.tabIndex >= 0 && el.getClientRects().length; });
      if (!focusable.length) return;
      var first = focusable[0], last = focusable[focusable.length-1];
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    });
    // O módulo real devolve o foco ao botão ao fechar; liberar o fundo antes disso.
    byId('ptProClose').addEventListener('click', function () { home.inert = false; }, true);
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') home.inert = false; }, true);
    back.addEventListener('click', function (ev) { if (ev.target === back) home.inert = false; }, true);
    accessibility();
    new MutationObserver(accessibility).observe(back, {childList:true,subtree:true,attributes:true,attributeFilter:['class']});
    trigger.click(); byId('demoProExemplo').click(); accessibility();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
