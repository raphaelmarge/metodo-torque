/* Melhorias de navegação e consulta. Os registros continuam no fluxo canônico do painel. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var norm = function (v) { return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); };
  var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; }
  function field(id, label, type, options) {
    return '<label class="fg-field" for="' + id + '">' + label + (options ? '<select id="' + id + '">' + options.map(function (o) { return '<option value="' + esc(o[0]) + '">' + esc(o[1]) + '</option>'; }).join('') + '</select>' : '<input id="' + id + '" type="' + (type || 'search') + '">') + '</label>';
  }
  function wrap(id, label) {
    var e = $(id); if (!e || e.closest('label')) return;
    var node = e.dataset.busca && $(id+'Busca') ? e.parentElement : e;
    if(node!==e)node.setAttribute('data-busca-wrap','');
    var l = el('label', 'fg-field'); l.htmlFor = node===e?id:id+'Busca'; l.appendChild(document.createTextNode(label));
    node.before(l); l.appendChild(node);
    var row = l.closest('.linha-flex'); if (row) row.classList.add('fg-fields');
  }
  function foldCard(id, title, foldId) {
    var target = $(id), card = target && target.closest('.card'); if (!card) return;
    var d = el('details', 'fg-fold'); d.id = foldId;
    ['data-pgsec', 'data-relsec'].forEach(function (a) { if (card.hasAttribute(a)) { d.setAttribute(a, card.getAttribute(a)); card.removeAttribute(a); } });
    d.hidden = card.hidden; card.hidden = false;
    d.appendChild(el('summary', '', esc(title))); card.before(d); d.appendChild(card);
    var h = card.querySelector('h2'); if (h) h.remove();
    return d;
  }
  function foldForm(id, title, foldId, extra) {
    var e = $(id), row = e && e.closest('.linha-flex'); if (!row) return;
    var d = el('details', 'fg-fold'); d.id = foldId; d.appendChild(el('summary', '', esc(title)));
    row.before(d); d.appendChild(row); (extra || []).forEach(function (i) { if ($(i)) d.appendChild($(i)); }); return d;
  }
  function nav(selectId, label, tabsId, attr) {
    var tabs = $(tabsId); if (!tabs) return;
    var n = el('div', 'fg-area'), opts = Array.from(tabs.querySelectorAll('button[' + attr + ']'));
    n.innerHTML = '<label for="' + selectId + '">' + label + '</label><select id="' + selectId + '">' + opts.map(function (b) { return '<option value="' + esc(b.getAttribute(attr)) + '">' + esc(b.textContent.trim()) + '</option>'; }).join('') + '</select>';
    tabs.before(n);
    function sync() { var active = opts.find(function (b) { return b.classList.contains('ativa'); }); if (active) $(selectId).value = active.getAttribute(attr); opts.forEach(function (b) { b.setAttribute('aria-pressed', String(b === active)); }); }
    $(selectId).addEventListener('change', function () { var v = this.value; var b = opts.find(function (x) { return x.getAttribute(attr) === v; }); if (b) b.click(); });
    new MutationObserver(sync).observe(tabs, { subtree: true, attributes: true, attributeFilter: ['class'] }); sync();
  }
  function toolbar(before, html) { var bar = el('div', 'fg-toolbar', html); before.before(bar); return bar; }
  function hook(name) { return function () { if (window.__gestaoPT && window.__gestaoPT[name]) window.__gestaoPT[name](); }; }
  function bind(ids, name) { ids.forEach(function (id) { if ($(id)) $(id).addEventListener($(id).tagName === 'SELECT' ? 'change' : 'input', hook(name)); }); }
  function installMenu() {
    var menu = $('abas'); if (!menu) return;
    var groups = [
      ['Rotina', ['dash','alunos','agenda','treinos','chat']],
      ['Acompanhamento', ['nutricao','avaliacoes','quest','assessoria','desafio']],
      ['Gestão', ['pagamentos','relatorios']],
      ['Sua marca', ['sitepro','pers','imagens']],
      ['Preferências', ['config','conta','ajuda']]
    ];
    menu.querySelectorAll('.navgrupo').forEach(function (n) { n.remove(); });
    var cab = menu.querySelector('.menu-cab'), close = el('button', 'fg-menu-close', '×'); close.type = 'button'; close.id = 'fecharMenuPt'; close.setAttribute('aria-label','Fechar menu'); cab.appendChild(close);
    var search = el('div','fg-menu-search','<label for="menuBuscaPt">Encontrar uma área</label><input type="search" id="menuBuscaPt" placeholder="Buscar no menu">'); cab.after(search);
    var empty = el('p','fg-menu-empty','Nenhuma área encontrada. Tente outro termo.'); empty.hidden = true; search.after(empty);
    var last = empty, captions = [], buttons = [];
    groups.forEach(function (g) {
      var caption = el('div','fg-menu-group',esc(g[0])); last.after(caption); last = caption; var set = [];
      g[1].forEach(function (key) { var b = menu.querySelector('[data-a="' + key + '"]'); if (!b) return; last.after(b); last = b; set.push(b); buttons.push(b); }); captions.push([caption,set]);
    });
    // Só a lista rola: cabeçalho, busca e tema nunca disputam altura com os links.
    var items = el('div','fg-menu-items'); items.id = 'menuItensPt'; search.after(items); items.appendChild(empty);
    captions.forEach(function (g) { items.appendChild(g[0]); g[1].forEach(function (b) { items.appendChild(b); }); });
    var aliases = { nutricao:'alimentacao dieta alimento refeicao calorias macros biblioteca', pagamentos:'cobranca cobrancas mensalidades despesas caixa dinheiro planos contratos servicos', relatorios:'receita resultado indicadores metas', config:'integracao pix conta whatsapp preferencia', pers:'cor logo tema beneficio app', imagens:'foto fotos imagem imagens galeria capa', sitepro:'site endereco link pagina', conta:'nuvem backup acesso sincronizacao', ajuda:'suporte duvida tutorial chamado', quest:'perguntas check-in habitos formularios', assessoria:'online frequencia acompanhamento' };
    function filter() {
      var q = norm($('menuBuscaPt').value), count = 0;
      buttons.forEach(function (b) { var match = !q || norm((b.title || b.textContent) + ' ' + (aliases[b.dataset.a] || '')).indexOf(q) >= 0; b.toggleAttribute('data-menu-filtrado', !match); if (match && !b.hidden && getComputedStyle(b).display !== 'none') count++; });
      captions.forEach(function (g) { g[0].hidden = !g[1].some(function (b) { return !b.hasAttribute('data-menu-filtrado') && !b.hidden && getComputedStyle(b).display !== 'none'; }); }); empty.hidden = !q || count > 0;
    }
    $('menuBuscaPt').addEventListener('input', function () { filter(); items.scrollTop = 0; });
    function closeMenu() { document.body.classList.remove('menu-aberto'); $('btnMenuPt').focus(); }
    close.addEventListener('click', closeMenu);
    var wasOpen = false;
    new MutationObserver(function () {
      var open = document.body.classList.contains('menu-aberto'); $('btnMenuPt').setAttribute('aria-expanded', String(open));
      if (open && !wasOpen) { $('menuBuscaPt').value = ''; filter(); items.scrollTop = 0; if (matchMedia('(max-width:1099px)').matches) (matchMedia('(pointer:coarse)').matches ? close : $('menuBuscaPt')).focus({preventScroll:true}); }
      wasOpen = open;
    }).observe(document.body,{attributes:true,attributeFilter:['class']});
    menu.addEventListener('keydown', function (e) {
      if (!document.body.classList.contains('menu-aberto') || !matchMedia('(max-width:1099px)').matches) return;
      if (e.key === 'Escape') { e.preventDefault(); closeMenu(); return; }
      if (e.key !== 'Tab') return;
      var f = Array.from(menu.querySelectorAll('button,input,[tabindex="0"]')).filter(function (x) { return !x.disabled && x.getClientRects().length; }), first = f[0], end = f[f.length-1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); end.focus(); }
      else if (!e.shiftKey && document.activeElement === end) { e.preventDefault(); first.focus(); }
    });
    menu.addEventListener('click', function (e) { if (e.target.closest('[data-a]')) { $('menuBuscaPt').value=''; filter(); } });
    filter();
  }
  function init() {
    if (!$('vPagamentos') || !window.__pgAba) return;
    installMenu();
    nav('pgArea','Área financeira','pgAbas','data-pga'); nav('relArea','Relatório','relAbas','data-rela');
    var labels = {plNome:'Nome do plano',plValor:'Valor (R$)',plCobranca:'Forma de cobrança',plPacQtd:'Aulas no pacote',plCiclo:'Ciclo',plTreinos:'Treinos por semana',plModal:'Modalidade',plLink:'Link de assinatura (opcional)',svNome:'Nome do serviço',svValor:'Valor unitário (R$)',svVAluno:'Aluno',svVServ:'Serviço',svVQtd:'Quantidade',svVTotal:'Total combinado (R$)',svVForma:'Forma de pagamento',dpDesc:'Descrição',dpCat:'Categoria',dpValor:'Valor (R$)',dpData:'Data da despesa',pAluno:'Aluno',pValor:'Valor recebido (R$)',pForma:'Forma de pagamento'};
    Object.keys(labels).forEach(function(id){wrap(id,labels[id]);});
    ['plNome','plLink','svNome','dpDesc','svVAluno','svVServ','pAluno'].forEach(function (id) { if ($(id)) $(id).closest('label').classList.add('fg-wide'); });
    foldCard('pValor','Registrar recebimento','fgRecebimento');
    foldForm('plNome','Criar plano','fgPlanoNovo',['plDicaSessao']);
    foldForm('svNome','Cadastrar serviço','fgServicoNovo');
    foldCard('dpDesc','Lançar despesa','fgDespesaNova');
    foldCard('reguaOn','Cobrança automática','fgRegua');
    foldCard('bSaudeP','Histórico de pontualidade','fgSaude');
    var charts = $('pg6meses').closest('.dcols'), fold = el('details','fg-fold fg-analysis'); fold.setAttribute('data-pgsec','receb'); fold.appendChild(el('summary','','Análise dos recebimentos')); charts.before(fold); charts.removeAttribute('data-pgsec'); fold.appendChild(charts);
    toolbar($('listaPagamentos'), field('fgHistBusca','Buscar recebimento') + field('fgHistMes','Mês','month') + field('fgHistForma','Forma',null,[['','Todas'],['Pix','Pix'],['Dinheiro','Dinheiro'],['Cartão','Cartão'],['Transferência','Transferência'],['outro','Outras']]) + '<button class="btn sec" id="fgHistLimpar" type="button">Limpar filtros</button>');
    var hs=el('p','fg-status');hs.id='fgHistResumo';hs.setAttribute('role','status');$('listaPagamentos').before(hs);
    var hm=el('button','btn sec fg-more','Carregar mais recebimentos');hm.id='fgHistMais';hm.type='button';$('listaPagamentos').after(hm);
    var hx=el('button','btn sec','Exportar resultados em CSV');hx.id='fgHistCSV';hx.type='button';hm.after(hx);
    bind(['fgHistBusca','fgHistMes','fgHistForma'],'historico'); $('fgHistLimpar').onclick=function(){['fgHistBusca','fgHistMes','fgHistForma'].forEach(function(id){$(id).value='';});hook('historico')();};hm.onclick=hook('maisHistorico');hx.onclick=hook('exportaHistorico');
    toolbar($('plLista'),field('fgPlanoBusca','Buscar plano'));bind(['fgPlanoBusca'],'planos');
    toolbar($('ctLista'),field('fgContratoBusca','Buscar aluno ou plano') + field('fgContratoStatus','Situação',null,[['ativo','Ativos'],['encerrado','Encerrados'],['todos','Todos']]));bind(['fgContratoBusca','fgContratoStatus'],'planos');
    toolbar($('svLista'),field('fgServicoBusca','Buscar serviço'));bind(['fgServicoBusca'],'servicos');
    toolbar($('dpLista'),field('fgDespBusca','Buscar despesa') + field('fgDespTipo','Recorrência',null,[['','Todas'],['fixa','Mensais'],['avulsa','Avulsas']]) + field('fgDespCat','Categoria',null,[['','Todas as categorias']].concat(Array.from($('dpCat').options).map(function(o){return[o.value,o.textContent];}))));
    var ds=el('p','fg-status');ds.id='fgDespResumo';ds.setAttribute('role','status');$('dpLista').before(ds);bind(['fgDespBusca','fgDespTipo','fgDespCat'],'despesas');
    var cob = toolbar($('pgAtrasados'),field('fgCobrBusca','Buscar aluno nas cobranças') + field('fgCobrTipo','Exibir',null,[['','Todas as cobranças'],['atrasado','Vencidas'],['pendente','A vencer e pacotes']]));cob.setAttribute('data-pgsec','receb');
    var cobrStatus=el('p','fg-status');cobrStatus.id='fgCobrResumo';cobrStatus.setAttribute('data-pgsec','receb');cob.after(cobrStatus);
    var cobrLimite=5,cbMore=el('button','btn sec fg-more','Ver mais cobranças');cbMore.id='fgCobrMais';cbMore.type='button';cbMore.setAttribute('data-pgsec','receb');$('pgAtrasados').after(cbMore);
    function cobrancas() {
      var q=norm($('fgCobrBusca').value),tipo=$('fgCobrTipo').value,total=0,shown=0,matches=0;
      [['#pgAtrasados .pgatrlin','atrasado'],['#pendentes .sessao-pt','pendente']].forEach(function(par){var n=0;document.querySelectorAll(par[0]).forEach(function(row){total++;var match=(!q||norm(row.textContent).indexOf(q)>=0)&&(!tipo||tipo===par[1]);if(match){matches++;n++;}var show=match&&n<=cobrLimite;row.hidden=!show;if(show)shown++;});});
      var text=shown+' de '+matches+' cobranças'+(q||tipo?' encontradas (base: '+total+'). Os totais do mês permanecem gerais.':'.');if(cobrStatus.textContent!==text)cobrStatus.textContent=text;
      cbMore.hidden=matches<=shown&&cobrLimite===5;cbMore.textContent=matches>shown?'Ver mais cobranças ('+(matches-shown)+')':'Recolher cobranças';cbMore.dataset.recolher=String(matches<=shown);
    }
    window.MT_GESTAO.cobrancas=cobrancas;
    cbMore.onclick=function(){cobrLimite=cbMore.dataset.recolher==='true'?5:cobrLimite+10;cobrancas();};
    ['fgCobrBusca','fgCobrTipo'].forEach(function(id){$(id).addEventListener(id==='fgCobrBusca'?'input':'change',function(){cobrLimite=5;cobrancas();});});
    ['pgAtrasados','pendentes'].forEach(function(id){new MutationObserver(cobrancas).observe($(id),{childList:true,subtree:true});});cobrancas();
    var rel=$('vRelatorios'),head=el('header','fg-heading','<h2>Relatórios</h2><p>Escolha o assunto e o período para acompanhar os resultados do studio.</p>');rel.prepend(head);
    head.after(rel.querySelector('.fg-area'));
    var period=el('label','fg-field','Período<input type="month" id="relMesInput">');$('relPerBar').appendChild(period);
    $('relMesInput').addEventListener('change',function(){if(window.__gestaoPT)window.__gestaoPT.periodo(this.value);});
    foldCard('relLTV','Receita por aluno · histórico completo','fgReceitaAluno');
    foldCard('mtFatP','Metas do mês','fgMetas');
    foldCard('iaSemanaBt','Resumo da semana com IA','fgResumoIA');
    hook('historico')();hook('planos')();hook('despesas')();hook('relatorios')();
  }
  window.MT_GESTAO={norm:norm,esc:esc};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
