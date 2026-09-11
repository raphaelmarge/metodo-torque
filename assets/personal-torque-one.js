/* Torque ONE: shell and presentation. Existing buttons remain the route owners. */
(function () {
  'use strict';
  function init() {
    var byId = function (id) { return document.getElementById(id); };
    var menu = byId('abas'), top = document.querySelector('.topo-marca');
    if (!menu || !top || byId('oneBreadcrumb')) return;
    byId('menuBuscaPt').setAttribute('aria-label', 'Buscar no menu');
    var brand = menu.querySelector('.mcab-txt');
    brand.innerHTML = '<b class="one-wordmark">TORQUE <em>ONE</em></b><span class="one-brand-caption">TORQUE PERSONAL</span>';
    var studio = document.createElement('div');
    studio.className = 'one-studio';
    studio.innerHTML = '<span class="one-studio-icon" aria-hidden="true">T</span><div><strong id="oneStudioName"></strong><span>Seu espaço de trabalho</span></div>';
    menu.querySelector('.menu-cab').after(studio);
    var crumb = document.createElement('div');
    crumb.id = 'oneBreadcrumb';
    crumb.innerHTML = '<span id="oneStudioCrumb"></span><span aria-hidden="true">/</span><strong id="oneRoute">Visão geral</strong>';
    top.prepend(crumb);
    function updateStudio() {
      var name = byId('tituloStudio').textContent || 'Meu Studio';
      byId('oneStudioName').textContent = name;
      byId('oneStudioCrumb').textContent = name;
      studio.querySelector('.one-studio-icon').textContent = name.trim().slice(0, 1).toUpperCase();
    }
    updateStudio();
    new MutationObserver(updateStudio).observe(byId('tituloStudio'), {childList:true, subtree:true, characterData:true});
    function updateRoute() {
      var active = menu.querySelector('button[data-a].ativa');
      var title = active ? active.getAttribute('title') || active.textContent.replace(/\d+/g, '').trim() : 'Visão geral';
      if (active && active.dataset.a === 'dash') title = 'Visão geral';
      if (byId('vPerfil') && !byId('vPerfil').hidden) title = 'Perfil do aluno';
      byId('oneRoute').textContent = title;
      document.querySelectorAll('[data-one-route]').forEach(function (button) {
        var destination = menu.querySelector('[data-a="' + button.dataset.oneRoute + '"]');
        button.hidden = !destination || destination.hidden || destination.style.display === 'none';
      });
      var planner = byId('onePlanner');
      if (planner) planner.hidden = !planner.querySelector('[data-one-route]:not([hidden])');
    }
    var observer = new MutationObserver(updateRoute);
    menu.querySelectorAll('button[data-a]').forEach(function (button) { observer.observe(button, {attributes:true, attributeFilter:['class','hidden','style']}); });
    if (byId('vPerfil')) observer.observe(byId('vPerfil'), {attributes:true, attributeFilter:['hidden']});
    updateRoute();
    document.addEventListener('click', function (event) {
      var link = event.target.closest('[data-one-route]');
      if (!link) return;
      var destination = menu.querySelector('[data-a="' + link.dataset.oneRoute + '"]');
      if (destination && !destination.hidden && destination.style.display !== 'none') destination.click();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

/* Postural: dependências isoladas, sem alterar o estado/pacote dos alunos. */
(function () {
  'use strict';
  function load() {
    if (!document.getElementById('avAbas')) return;
    var css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = 'assets/personal-postural.css';
    document.head.appendChild(css);
    var assets = ['assets/postural-core.js', 'assets/postural-store.js', 'assets/personal-postural.js'];
    function next() {
      var src = assets.shift();
      if (!src) return;
      var script = document.createElement('script');
      script.src = src; script.onload = next;
      script.onerror = function () {
        var aviso = document.createElement('p');
        aviso.setAttribute('role', 'status');
        aviso.textContent = 'A avaliação postural não carregou. Recarregue o app para tentar novamente. As outras avaliações continuam disponíveis.';
        document.getElementById('avAbas').after(aviso);
      };
      document.head.appendChild(script);
    }
    next();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
