  /* Player aprovado em 15/09/2026. Projeção visual do executor canônico:
   * mantém os controles/handlers, o checkpoint e a conclusão explícita. */
  function playerTemplate() {
    'use strict';
    function ready() {
      var box = document.getElementById('guiaBox');
      if (!box || !window.GP || !window.SR || window.__playerTemplate) return;
      var mode = 'entry', tab = 'video', exercise = '', rendering = false;
      var card = document.getElementById('gCard');
      var $ = function (id) { return document.getElementById(id); };
      function el(tag, cls, text) { var node = document.createElement(tag); if (cls) node.className = cls; if (text != null) node.textContent = text; return node; }
      function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
      function number(v, suffix) { return v == null || v === '' ? '—' : String(v).replace('.', ',') + (suffix || ''); }
      function rpe(v) { var n = typeof v === 'boolean' || v == null || String(v).trim() === '' ? NaN : Number(String(v).replace(',', '.')); return isFinite(n) && n >= 1 && n <= 10 ? n : null; }
      function current() { var s = window.__gvDe(), f = window.GUIA[s.f], ei = s.fim && s.formSerie ? s.formSerie.ei : s.e; if(f)ei=Math.min(ei,f.it.length-1); return { s:s, f:f, ei:ei, it:f && f.it[ei] }; }
      function mount() {
        box.classList.add('player-template');
        var header = el('header', 'gpt-top'); header.id = 'gTemplateTop';
        var back = $('gFechar'); back.textContent = '←'; back.setAttribute('aria-label','Voltar ao treino');
        header.appendChild(back);
        var title = el('div', 'gpt-heading'); title.innerHTML = '<h1 id="gTemplateTitle"></h1><p id="gTemplatePosition"></p>'; header.appendChild(title);
        var options = el('details', 'gpt-options'); options.innerHTML = '<summary aria-label="Mais opções do treino">⋮</summary><div class="gpt-options-body"></div>';
        var tools = options.lastElementChild;
        ['gFc','gVoz','gPlay','gReloTot'].forEach(function(id){if($(id)) tools.appendChild($(id));});
        var oldbase = box.querySelector('.gbase'); if(oldbase)tools.appendChild(oldbase);
        header.appendChild(options); box.insertBefore(header, box.firstChild);
        var progress = el('div', 'gpt-progress'); progress.id = 'gTemplateProgress'; progress.innerHTML = '<progress max="100" value="0" aria-label="Séries concluídas no treino"></progress><span></span>';
        header.insertAdjacentElement('afterend', progress);
        var hero = el('section','gpt-hero'); hero.id = 'gTemplateHero';
        hero.innerHTML = '<div class="gpt-thumb" id="gTemplateThumb"></div><div class="gpt-ex-title"></div><button type="button" class="gpt-favorite" id="gTemplateFavorite" aria-label="Favoritar exercício" aria-pressed="false">☆</button>';
        hero.children[1].appendChild($('gEx')); hero.children[1].appendChild(el('span','gpt-group')); card.insertBefore(hero,card.firstChild);
        var tabs = el('div','gpt-tabs'); tabs.id = 'gTemplateTabs'; tabs.setAttribute('role','tablist'); tabs.setAttribute('aria-label','Orientações do exercício');
        [['video','▶','Vídeo'],['instructions','☷','Instruções'],['tips','♙','Dicas do prof.']].forEach(function(t){
          var b=el('button','',t[1]+'  '+t[2]); b.type='button'; b.id='gTemplateTab-'+t[0]; b.dataset.gptTab=t[0]; b.setAttribute('role','tab'); b.setAttribute('aria-controls','gTemplatePanel-'+t[0]); tabs.appendChild(b);
          var panel=el('section','gpt-panel');panel.id='gTemplatePanel-'+t[0];panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',b.id);panel.tabIndex=0;card.appendChild(panel);
        }); card.appendChild(tabs);
        var video=$('gVideo'), videoBox=video.nextElementSibling, vp=$('gTemplatePanel-video');
        vp.appendChild($('gGif')); vp.appendChild(video); vp.appendChild(videoBox);
        var empty=el('p','gpt-empty','Demonstração não disponível para este exercício.'); empty.id='gTemplateMediaEmpty';vp.appendChild(empty);
        var presc=el('section','gpt-card gpt-prescription');presc.id='gTemplatePrescription';card.appendChild(presc);
        var hist=el('section','gpt-card gpt-history');hist.id='gTemplateHistory';card.appendChild(hist);
        var success=el('div','gpt-success');success.id='gTemplateSuccess';success.setAttribute('role','status');card.appendChild(success);
        box.appendChild($('gPe')); card.appendChild($('gResta'));
        var nav=el('nav','gpt-bottom');nav.id='gTemplateBottom';nav.setAttribute('aria-label','Navegar entre exercícios');
        nav.appendChild($('gVoltaEx'));nav.appendChild($('gPularEx'));box.appendChild(nav);
      }
      function selectTab(name, focus) {
        tab=name;
        ['video','instructions','tips'].forEach(function(t){var b=$('gTemplateTab-'+t),p=$('gTemplatePanel-'+t),active=t===name;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;p.hidden=!active;});
        if(focus)$('gTemplateTab-'+name).focus();
      }
      function references(c) {
        var si=window.SR.indice(c.it), a=window.SR.alvo(c.it,si), u=window.SR.anterior(c.it,si);
        var target=rpe(c.it.rpePorSerie && c.it.rpePorSerie[si]);if(target==null)target=rpe(c.it.rpe);
        $('gTemplatePrescription').innerHTML='<header><h2>Sua prescrição</h2><span>'+c.it.s+' séries</span></header><dl>'+[['CARGA',number(a.carga,' kg')],['REPETIÇÕES',a.reps||'—'],['RPE',number(target)],['DESCANSO',number(a.descanso,' s')]].map(function(x){return '<div><dt>'+x[0]+'</dt><dd>'+esc(x[1])+'</dd></div>';}).join('')+'</dl>';
        $('gTemplatePrescription').setAttribute('aria-label','Prescrição da série '+(si+1));
        var hist=$('gTemplateHistory'),previousDetails=$('gMiolo').querySelector('.ghist')||hist.querySelector('details');hist.innerHTML='<header><h2>Seu histórico</h2><button type="button" data-gpt-history>Ver evolução <span aria-hidden="true">›</span></button></header>'+(u?'<div class="gpt-last"><span>Última vez<small>'+esc(u.d.slice(8,10)+'/'+u.d.slice(5,7)+'/'+u.d.slice(0,4))+'</small></span><b>'+esc(number(u.kg,' kg'))+'</b><b>'+esc(number(u.r,' reps'))+'</b><b>RPE '+esc(number(rpe(u.rpe)))+'</b></div>':'<p class="gpt-empty">Sem registro anterior com carga para esta série.</p>');
        if(previousDetails)hist.appendChild(previousDetails);
      }
      function rows(c) {
        var group=$('gMiolo').querySelector('.gseries-nav');if(!group)return;
        group.querySelectorAll('.gpt-set-row').forEach(function(row){var b=row.querySelector('[data-gserie]');if(b)group.appendChild(b);row.remove();});var oldTitle=$('gMiolo').querySelector('.gpt-series-title');if(oldTitle)oldTitle.remove();
        var heading=el('h2','gpt-series-title','Séries deste treino');group.insertAdjacentElement('beforebegin',heading);
        group.querySelectorAll('[data-gserie]').forEach(function(b){
          var si=Number(b.dataset.gserie),r=window.SR.registro(c.it,si),done=window.GP.feita(c.it,si),row=el('div','gpt-set-row'+(done?' done':''));
          row.dataset.gptRow=si;
          b.insertAdjacentElement('beforebegin',row);row.appendChild(b);b.title='Selecionar série '+(si+1);
          var mark=el('span','gpt-set-mark',done?'✓':'');mark.setAttribute('aria-hidden','true');row.insertBefore(mark,b);
          // A conclusão sem anotação não recebe números da prescrição.
          [['gpt-kg',r&&r.kg!=null?number(r.kg,' kg'):'— kg'],['gpt-reps',r&&r.r!=null?number(r.r,' reps'):'— reps'],['gpt-effort','RPE '+number(rpe(r&&r.rpe))],['gpt-state',done?'Registrada':r?'Anotação':'A registrar']].forEach(function(x){row.appendChild(el('span',x[0],x[1]));});
          var edit=el('button','gpt-row-edit','⋮');edit.type='button';edit.dataset.gptEdit=si;edit.setAttribute('aria-label',(done?'Editar':'Registrar')+' série '+(si+1));row.appendChild(edit);
        });
      }
      function steppers() {
        ['gKg','gReps','gRpe'].forEach(function(id){var input=$(id);if(!input||input.closest('.gpt-stepper'))return;
          var wrap=el('div','gpt-stepper'),caption=id==='gKg'?'carga':id==='gReps'?'repetições':'RPE';input.parentNode.insertBefore(wrap,input);
          [-1,1].forEach(function(d){var b=el('button','',d<0?'−':'+');b.type='button';b.dataset.gptStep=id;b.dataset.delta=d;b.setAttribute('aria-label',(d<0?'Diminuir ':'Aumentar ')+caption);wrap.appendChild(b);});wrap.insertBefore(input,wrap.lastChild);
        });
        var form=box.querySelector('.gserie-form');if(!form)return;
        var h=el('header','gpt-entry-head');h.innerHTML='<h2>Registrar série</h2><span></span>';form.insertBefore(h,form.firstChild);
        var c=current();h.lastChild.textContent='Série '+((c.s.fim && c.s.formSerie ? c.s.formSerie.si : window.SR.indice(c.it))+1)+' de '+c.it.s;
        var refs=form.querySelector('.gserie-referencias');if(refs){refs.hidden=true;refs.setAttribute('aria-hidden','true');}
        var re=$('gRpe');if(re)re.oninput=window.GP.entrada;
      }
      function updateView() {
        var c=current();if(!c.it)return;
        var finished=!!c.s.fim;box.classList.toggle('gpt-review',mode==='sets'&&!finished);box.classList.toggle('gpt-finished',finished);
        $('gTemplateFavorite').hidden=finished;
        var b=$('gSerie');if(b){if(mode==='entry')b.style.display='block';b.textContent=window.GP.feita(c.it,window.SR.indice(c.it))?'Salvar alteração da série':'Registrar série';}
        $('gPularEx').textContent=c.s.e>=c.f.it.length-1?'Concluir treino  →':'Próximo exercício  →';
        $('gPularEx').setAttribute('aria-label',c.s.e>=c.f.it.length-1?'Conferir conclusão do treino':'Próximo exercício');
        $('gVoltaEx').textContent='←  Exercício anterior';$('gVoltaEx').disabled=c.s.e===0;
        var n=window.GP.conta(c.it),msg=$('gTemplateSuccess');msg.hidden=!n||finished;
        msg.innerHTML=n?'<span class="gpt-trophy" aria-hidden="true">🏆</span><div><strong>Mandou bem!</strong><p>'+(n>=c.it.s?'Exercício concluído. Seus registros estão salvos.':'Série registrada. Continue no seu ritmo.')+'</p></div>':'';
      }
      function render() {
        if(rendering)return;var c=current();if(!c.it)return;rendering=true;
        try {
          var key=c.s.f+':'+c.s.e;
          if(key!==exercise){exercise=key;tab='video';mode='entry';}
          var title=String(c.f.n||'Treino'),parts=title.split(/\s+[—·]\s+/);
          $('gTemplateTitle').textContent=parts.length>1&&/^([A-Z]\d?|Treino [A-Z])$/i.test(parts[0])?(/^Treino/i.test(parts[0])?parts[0]:'Treino '+parts[0]):title;
          $('gTemplatePosition').textContent=(parts.length>1?parts.slice(1).join(' · ')+' · ':'')+(c.s.e+1)+' de '+c.f.it.length+' exercícios';
          var total=0,done=0;c.f.it.forEach(function(it,ei){total+=it.s;done+=window.GP.conta(it,ei);});var pc=total?Math.round(100*done/total):0;
          $('gTemplateProgress').querySelector('progress').value=pc;$('gTemplateProgress').lastChild.textContent=pc+'%';
          var thumb=$('gTemplateThumb'),src=window.gifUrl(c.it.e);if(thumb.dataset.src!==src){thumb.innerHTML='';thumb.dataset.src=src;if(src){var img=el('img');img.src=src;img.alt='';img.addEventListener('error',function(){thumb.textContent='◇';});thumb.appendChild(img);}else thumb.textContent='◇';}
          var badge=$('gTemplateHero').querySelector('.gpt-group');badge.textContent=c.it.g||'';badge.hidden=!c.it.g;
          var conf=window.L('ptconf',{}),fav=Array.isArray(conf.playerFavoritos)?conf.playerFavoritos:[],on=fav.indexOf(c.it.e)>=0;
          $('gTemplateFavorite').setAttribute('aria-pressed',String(on));$('gTemplateFavorite').textContent=on?'★':'☆';
          var instr=$('gTemplatePanel-instructions'),tips=$('gTemplatePanel-tips');var legacy=$('gMiolo'),legacyRow=legacy.querySelector('.gsecrow'),fresh=(legacyRow && !legacyRow.dataset.gptTaken)||instr.dataset.exercise!==key;
          if(fresh){var technique=$('gTec');instr.innerHTML='';tips.innerHTML='';instr.dataset.exercise=key;if(legacyRow)legacyRow.dataset.gptTaken='1';
          ['.gaq','.gdica','.galt'].forEach(function(sel){var n=legacy.querySelector(sel);if(n)instr.appendChild(n);});
          if(!instr.children.length)instr.appendChild(el('p','gpt-empty','Sem instrução adicional cadastrada.'));
          if(technique)instr.appendChild(technique);
          var note=legacy.querySelector('.gobs');if(note)tips.appendChild(note);else tips.appendChild(el('p','gpt-empty','Sem recado adicional do personal.'));
          var report=legacy.querySelector('#acRelatar');if(report)tips.appendChild(report);var skip=legacy.querySelector('#gPulaEx2'),oldSkip=box.querySelector('.gpt-options #gPulaEx2');if(oldSkip)oldSkip.remove();if(skip)box.querySelector('.gpt-options-body').appendChild(skip);}
          var video=$('gVideo'),hasVideo=!!c.it.v;video.textContent='▶  Ver execução completa';
          $('gTemplateMediaEmpty').hidden=hasVideo||!!src;
          if(!c.s.fim){references(c);rows(c);}if(!box.querySelector('.gpt-entry-head'))steppers();
          var sem=$('gSemRegistro'),opts=box.querySelector('.gserie-ajustes');if(sem&&opts)opts.appendChild(sem);
          selectTab(tab,false);updateView();
        } finally {rendering=false;}
      }
      mount();
      // Os nomes globais já são o contrato do player/testes. As fábricas de dados
      // e a sincronização não são substituídas por esta camada de apresentação.
      ['pintaGuia','gDescanso','acUltimaCarga','gRepesca','gConclui'].forEach(function(name){var original=window[name];if(typeof original!=='function')return;window[name]=function(){if(name==='pintaGuia'||name==='gRepesca')mode='entry';var value=original.apply(this,arguments);render();return value;};});
      var confirmSet=window.GP.conclui;
      window.GP.conclui=function(){var c=current(),before=c.it&&window.GP.conta(c.it,c.ei),value=confirmSet.apply(this,arguments);if(c.it&&window.GP.conta(c.it,c.ei)>before && current().s.e===c.ei)mode='sets';render();return value;};
      box.addEventListener('click',function(e){
        var b=e.target.closest&&e.target.closest('button');if(!b)return;
        if(b.dataset.gptTab){selectTab(b.dataset.gptTab,false);return;}
        if(b.dataset.gptStep){var input=$(b.dataset.gptStep),n=Number(String(input.value).replace(',','.'));if(!isFinite(n))return;var effort=input.id==='gRpe',min=effort?1:0,max=effort?10:input.id==='gKg'?2000:1000,step=effort ? 0.5 : 1;input.value=String(Math.min(max,Math.max(min,Math.round(((input.value===''?min:n)+Number(b.dataset.delta)*step)*100)/100))).replace('.',',');input.dispatchEvent(new Event('input',{bubbles:true}));return;}
        if(b.hasAttribute('data-gpt-edit')){var sel=box.querySelector('[data-gserie="'+b.dataset.gptEdit+'"]');if(sel){mode='entry';sel.click();}return;}
        if(b.hasAttribute('data-gserie')){mode='entry';setTimeout(updateView,0);return;}
        if(b.hasAttribute('data-gpt-history')){var d=$('gTemplateHistory').querySelector('details');if(d){d.open=!d.open;return;}var p=$('gTemplateHistory').querySelector('[data-gpt-no-history]');if(!p){p=el('p','gpt-empty','Ainda não há outros registros anteriores para exibir.');p.dataset.gptNoHistory='1';$('gTemplateHistory').appendChild(p);}return;}
        if(b.id==='gTemplateFavorite'){var c=current(),conf=window.L('ptconf',{}),list=Array.isArray(conf.playerFavoritos)?conf.playerFavoritos.slice():[],i=list.indexOf(c.it.e);if(i<0)list.push(c.it.e);else list.splice(i,1);conf.playerFavoritos=list.slice(-150);if(window.Sv('ptconf',conf)!==false){b.textContent=i<0?'★':'☆';b.setAttribute('aria-pressed',String(i<0));}return;}
      });
      $('gTemplateTabs').addEventListener('keydown',function(e){var names=['video','instructions','tips'],i=names.indexOf(tab),n=e.key==='ArrowRight'?(i+1)%3:e.key==='ArrowLeft'?(i+2)%3:e.key==='Home'?0:e.key==='End'?2:-1;if(n>=0){e.preventDefault();selectTab(names[n],true);}});
      window.__playerTemplate={version:'mt-v837',render:render,entry:function(){mode='entry';updateView();}};
      render();
    }
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready);else ready();
  }
