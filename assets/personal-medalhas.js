/* Medalhas evolutivas: seleção e edição locais; publicação usa o fluxo do painel. */
(function (root) {
  'use strict';
  var C, M, limite = 24, editorId = '', baseEditor = '', soAtivas = false;
  var grupos = {treino:'Treino',circuito:'Circuito',crossfit:'CrossFit',hyrox:'HYROX',corrida:'Corrida',bike:'Bike',caminhada:'Caminhada',nutricao:'Nutrição',habitos:'Hábitos',outros:'Outros esportes'};
  function $(id) { return document.getElementById(id); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function norm(v) { return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(); }
  function status(t) { $('cqEStatus').textContent = t; }
  function configuradas() { return (C.load().config || {}).medalhasEvolutivas; }
  function selecionadas() { return M.pacote(configuradas()); }
  function def(id) { return M.catalogo.find(function(d){return d.id===id;}); }
  function icone(d) { var p=(root.MT_CQICONS||{})[d.icone] || (root.MT_CQICONS||{}).medalha || ''; return '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+p+'</svg>'; }
  function escolhas(ds) { return ds.map(function(d){return {id:d.id,nome:d.n,metas:d.metas.slice()};}); }
  function assinatura(id) { return JSON.stringify(selecionadas().find(function(d){return d.id===id;}) || null); }
  function grava(lista) {
    var selecoes;try{selecoes=M.normaliza(escolhas(lista));}catch(e){status(e.message||'Confira as medalhas selecionadas.');return false;}
    var st=C.load(); st.config=st.config||{};
    st.config.medalhasEvolutivas=selecoes;
    st.config.appEditGeralEm=new Date().toISOString();
    if(!C.save(st)){status('Não foi possível salvar. Suas alterações continuam aqui para tentar novamente.');return false;}
    status('Medalhas salvas. Use Publicar para atualizar os apps dos alunos.'); render(); return true;
  }
  function resultados() {
    var busca=norm($('cqEBusca').value),grupo=$('cqEGrupo').value,ativas=selecionadas(),ids=new Set(ativas.map(function(d){return d.id;}));
    return M.catalogo.filter(function(d){return (!grupo||d.grupo===grupo)&&(!soAtivas||ids.has(d.id))&&(!busca||norm(d.n+' '+(grupos[d.grupo]||d.grupo)+' '+(d.criterio||'')).includes(busca));});
  }
  function render() {
    if(!C)return;
    var atuais=selecionadas(),map=new Map(atuais.map(function(d){return[d.id,d];})),ds=resultados();
    $('cqEAtivas').textContent='Ativas ('+atuais.length+')'; $('cqEAtivas').setAttribute('aria-pressed',String(soAtivas));
    $('cqETodas').setAttribute('aria-pressed',String(!soAtivas));
    $('cqEContagem').textContent=ds.length+' opções · '+atuais.length+' ativas no app';
    $('cqELista').innerHTML=ds.slice(0,limite).map(function(d){var ligada=map.has(d.id),v=map.get(d.id)||d;return '<article class="cqe-item" data-cqe-item="'+esc(d.id)+'"><div class="cqe-symbol">'+icone(d)+'</div><div class="cqe-copy"><small>'+esc(grupos[d.grupo]||d.grupo)+'</small><h3>'+esc(v.n)+'</h3><p>'+esc(v.metas.join(' → '))+' '+esc(v.unidade||'registros')+'</p></div><div class="cqe-actions"><button type="button" class="btn sec mini" data-cqe-edit="'+esc(d.id)+'">Ajustar</button><button type="button" class="btn '+(ligada?'sec':'')+' mini" data-cqe-toggle="'+esc(d.id)+'" aria-pressed="'+ligada+'" aria-label="'+(ligada?'Desativar ':'Ativar ')+esc(v.n)+'">'+(ligada?'✓ Ativa':'+ Ativar')+'</button></div></article>';}).join('')||'<p class="muted">Nenhuma medalha encontrada. Tente outro nome ou modalidade.</p>';
    $('cqEMais').hidden=ds.length<=limite; $('cqEMais').textContent='Mostrar mais ('+Math.max(0,ds.length-limite)+')';
    $('cqEAtivarGrupo').hidden=!$('cqEGrupo').value&&!$('cqEBusca').value.trim();
    $('cqEAtivarGrupo').textContent='Ativar resultados ('+ds.filter(function(d){return !map.has(d.id);}).length+')';
    $('cqEAtivarGrupo').disabled=!ds.some(function(d){return !map.has(d.id);});
  }
  function edita(id) {
    var d=selecionadas().find(function(x){return x.id===id;})||def(id); if(!d)return;
    editorId=id;baseEditor=assinatura(id);
    $('cqEEditor').hidden=false;$('cqENome').value=d.n;$('cqEMetas').value=d.metas.join(', ');
    $('cqECriterio').textContent=d.criterio||'O progresso acompanha os registros do aluno.';
    $('cqEFonte').hidden=!/^https:\/\//.test(d.fonte||'');$('cqEFonte').href=$('cqEFonte').hidden?'#':d.fonte;
    $('cqETituloEditor').textContent='Personalizar '+d.n; preview();
    $('cqEEditor').scrollIntoView({block:'nearest',behavior:'smooth'});$('cqENome').focus();
  }
  function metas() { var partes=$('cqEMetas').value.split(/[,;\n]/).map(function(s){return s.trim();}); var ns=partes.map(Number); if(ns.length<2||ns.length>12||ns.some(function(n,i){return !partes[i]||!Number.isFinite(n)||n<=0||n>1000000||(i>0&&n<=ns[i-1]);}))return null;return ns; }
  function unidade(n,u) { if(n!==1)return u;return u.replace(/^dias\b/,'dia').replace(/^semanas\b/,'semana').replace(/^registros\b/,'registro').replace(/^corridas\b/,'corrida').replace(/^pedais\b/,'pedal').replace(/^caminhadas\b/,'caminhada').replace(/^pesagens\b/,'pesagem').replace(/^respostas\b/,'resposta').replace(/^dia marcados$/,'dia marcado'); }
  function preview() {
    var ns=metas(),d=def(editorId);$('cqEPrevia').textContent=ns?ns.map(function(n,i){return 'Etapa '+(i+1)+': '+n+' '+unidade(n,d.unidade||'registros');}).join('  →  '):'Use de 2 a 12 metas crescentes, separadas por vírgula.';
  }
  function init(ctx) {
    C=ctx;M=root.MT_MEDALHAS;if(!M||!$('cqPersonalCard'))return;
    if(!Array.isArray(root.MT_MEDALHAS_CATALOGO)){var aviso=document.createElement('p');aviso.textContent='Não foi possível carregar o catálogo de medalhas. Recarregue a página para editar.';$('cqPersonalCard').querySelector('h2').after(aviso);return;}
    var node=document.createElement('div');node.id='cqEvolutivas';
    node.innerHTML='<p class="cqe-intro">Escolha as medalhas e os próximos objetivos dos seus alunos.</p><div class="cqe-toolbar"><label>Buscar medalha<input id="cqEBusca" type="search" placeholder="Fran, HYROX, corrida, alimentação…" autocomplete="off"></label><label>Modalidade<select id="cqEGrupo"><option value="">Todas as modalidades</option></select></label></div><div class="cqe-view"><button type="button" class="btn sec mini" id="cqETodas" aria-pressed="true">Catálogo</button><button type="button" class="btn sec mini" id="cqEAtivas" aria-pressed="false">Ativas</button><span id="cqEContagem"></span><button type="button" class="btn sec mini" id="cqEAtivarGrupo" hidden></button></div><section id="cqEEditor" class="cqe-editor" hidden aria-labelledby="cqETituloEditor"><div class="cqe-editor-head"><h3 id="cqETituloEditor">Personalizar medalha</h3><button type="button" class="btn sec mini" id="cqEFechar" aria-label="Fechar edição de medalha">Fechar</button></div><div class="cqe-toolbar"><label>Nome da medalha<input id="cqENome" maxlength="80"></label><label>Metas de cada etapa<input id="cqEMetas" placeholder="1, 3, 5, 10, 20" aria-describedby="cqEPrevia"></label></div><p id="cqEPrevia" class="cqe-preview"></p><p id="cqECriterio" class="muted"></p><a id="cqEFonte" href="#" target="_blank" rel="noopener noreferrer" hidden>Consultar referência oficial ↗</a><div class="cqe-editor-actions"><button type="button" class="btn" id="cqESalvar">Salvar e ativar</button><button type="button" class="btn sec" id="cqERestaurar">Restaurar etapas sugeridas</button></div></section><p id="cqEStatus" class="muted" role="status" aria-live="polite"></p><div id="cqELista"></div><button type="button" class="btn sec" id="cqEMais" hidden>Mostrar mais</button>';
    $('cqPersonalCard').querySelector('h2').after(node);
    var presentes=new Set(M.catalogo.map(function(d){return d.grupo;}));
    presentes.forEach(function(g){var o=document.createElement('option');o.value=g;o.textContent=grupos[g]||g;$('cqEGrupo').appendChild(o);});
    ['cqEBusca','cqEGrupo'].forEach(function(id){$(id).addEventListener(id==='cqEBusca'?'input':'change',function(){limite=24;render();});});
    $('cqETodas').onclick=function(){soAtivas=false;limite=24;render();};$('cqEAtivas').onclick=function(){soAtivas=true;limite=24;render();};
    $('cqEMais').onclick=function(){limite+=24;render();};$('cqEFechar').onclick=function(){$('cqEEditor').hidden=true;editorId='';};
    $('cqEMetas').oninput=preview;
    $('cqERestaurar').onclick=function(){var d=def(editorId);if(d){$('cqEMetas').value=d.metas.join(', ');preview();}};
    $('cqESalvar').onclick=function(){var ns=metas(),nome=$('cqENome').value.trim();if(!nome||!ns){status('Preencha o nome e pelo menos duas metas crescentes.');return;}if(assinatura(editorId)!==baseEditor){status('Esta medalha mudou em outra edição. Abra Ajustar novamente para conferir.');return;}var lista=selecionadas().filter(function(d){return d.id!==editorId;}),d=Object.assign({},def(editorId),{n:nome,metas:ns});lista.push(d);if(grava(lista)){$('cqEEditor').hidden=true;editorId='';}};
    $('cqELista').onclick=function(e){var bt=e.target.closest('[data-cqe-edit],[data-cqe-toggle]');if(!bt)return;if(bt.dataset.cqeEdit){edita(bt.dataset.cqeEdit);return;}var id=bt.dataset.cqeToggle,lista=selecionadas(),ativa=lista.some(function(d){return d.id===id;});if(ativa)lista=lista.filter(function(d){return d.id!==id;});else lista.push(def(id));grava(lista);};
    $('cqEAtivarGrupo').onclick=function(){var lista=selecionadas(),ids=new Set(lista.map(function(d){return d.id;}));resultados().forEach(function(d){if(!ids.has(d.id))lista.push(d);});grava(lista);};
    root.__medalhasPersonal={render:render,edita:edita};render();
    if(ctx.onChange)ctx.onChange(function(){render();});
  }
  root.MT_PERSONAL_MEDALHAS={init:init};
})(typeof self!=='undefined'?self:this);
