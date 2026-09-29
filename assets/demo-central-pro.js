/* A mesma Central Pro do Personal, com contexto e gravações fictícios em memória. */
(function () {
  'use strict';
  if (document.documentElement.dataset.demo !== 'central-pro') return;
  var demo = window.MT_CENTRAL_PRO_DEMO;
  if (!demo) return;
  window.MT_supabase = demo.client;
  function byId(id) { return document.getElementById(id); }
  function init() {
    var back = byId('ptProSuite'), trigger = byId('ptProSuiteBtn');
    if (!back || !trigger) { byId('demoProCarregando').textContent = 'Não foi possível abrir. Atualize a página para tentar novamente.'; return; }
    byId('demoProCarregando').hidden = true;
    var tools = document.createElement('div'); tools.className = 'demo-pro-tools';
    tools.innerHTML = '<span class="demo-pro-demo-label">Dados fictícios · sem login</span><button type="button" class="ptpro-btn sec" id="demoProTema" aria-pressed="false">Modo claro</button><button type="button" class="ptpro-btn sec" id="demoProRecomecar">Recomeçar demo</button>';
    back.querySelector('.ptpro-top').appendChild(tools);
    byId('demoProTema').onclick = function () {
      var light = document.documentElement.dataset.tema !== 'claro';
      document.documentElement.dataset.tema = light ? 'claro' : 'escuro';
      this.textContent = light ? 'Modo escuro' : 'Modo claro'; this.setAttribute('aria-pressed', String(light));
    };
    byId('demoProRecomecar').onclick = function () { location.reload(); };
    var d = new Date(); d.setDate(d.getDate() + 1);
    byId('ptProWaitDia').value = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    byId('ptProWaitHora').value = '08:00';
    byId('ptProFile').setAttribute('aria-label', 'Escolher arquivo para importar');
    var example = document.createElement('div'); example.className = 'demo-pro-example';
    example.innerHTML = '<button type="button" id="demoProExemplo" class="ptpro-btn sec">Carregar ficha de exemplo</button><span class="ptpro-muted">Confira a prévia e salve um rascunho quando estiver pronto.</span>';
    back.querySelector('.ptpro-drop').before(example);
    byId('demoProExemplo').onclick = function () {
      try {
        var file = new File(['Exercício,Séries,Repetições,Carga (kg)\nAgachamento livre,3,10,22\nLeg press 45°,3,12,60\nMesa flexora,3,12,20\n'], 'ficha-exemplo.csv', {type:'text/csv'});
        var dt = new DataTransfer(); dt.items.add(file); byId('ptProFile').files = dt.files;
        byId('ptProFile').dispatchEvent(new Event('change', {bubbles:true}));
      } catch (_) { byId('ptProImportStatus').textContent = 'Escolha um arquivo CSV, JSON ou texto para testar a importação neste navegador.'; }
    };
    var sim = document.createElement('section'); sim.className = 'demo-pro-simulate';
    sim.innerHTML = '<h4>Experimentar uma automação</h4><p class="ptpro-muted">Simule um evento e veja as providências das regras ativas aparecerem na fila.</p><div class="ptpro-field"><label for="demoProEvento">Evento de exemplo</label><select id="demoProEvento"><option value="questionario.respondido">Questionário respondido</option><option value="aluno.novo">Novo aluno</option><option value="agenda.cancelada">Sessão cancelada</option></select></div><div class="ptpro-field"><label for="demoProAlunoEvento">Aluno do exemplo</label><select id="demoProAlunoEvento"></select></div><button type="button" id="demoProSimular" class="ptpro-btn sec">Simular evento</button><p id="demoProSimStatus" class="ptpro-status" role="status"></p>';
    back.querySelector('[data-ptpro-view="automacoes"] .ptpro-card').appendChild(sim);
    demo.alunos.forEach(function (a) { var opt = document.createElement('option'); opt.value = a.id; opt.textContent = a.nome; byId('demoProAlunoEvento').appendChild(opt); });
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
    // Busca, rascunho, abas, teclado e foco são responsabilidade do módulo real.
    // A importação só recebe um exemplo quando o visitante pede explicitamente.
    trigger.click();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
