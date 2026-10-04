/* Editor aditivo: não modifica catálogo ou conquistas legadas. */
(function(root){
  'use strict';
  function init(C){
    var M=root.MT_METAS_PESSOAIS,card=document.getElementById('cqPersonalCard');if(!M||!card)return;
    var box=document.createElement('details');box.id='mpEditor';box.className='cqe-editor';
    box.innerHTML='<summary>Metas personalizadas: carga e distância</summary><p>Novas metas começam em uma data futura. Só novos registros feitos após o app receber a meta e desde a data de início contam. Não são recordes pessoais nem certificados de prova.</p><div class="cqe-toolbar"><label>Nome da meta<input id="mpNome" maxlength="80"></label><label>Critério<select id="mpTipo"><option value="distancia">Distância acumulada (km)</option><option value="carga">Carga-alvo em uma série concluída (kg)</option></select></label><label id="mpModLabel">Modalidade<select id="mpModalidade"><option value="corrida">Corrida</option><option value="bike">Bike</option><option value="caminhada">Caminhada</option></select></label><label id="mpExLabel" hidden>Exercício<select id="mpExercicio"></select></label><label>Valor da meta <span id="mpUnidade">(km)</span><input id="mpAlvo" type="number" min="0.01" max="1000000" step="0.01"></label><label>Data de início<input id="mpInicio" type="date"></label><label>Ícone<select id="mpIcone"><option value="mapa">Percurso</option><option value="halter">Halter</option><option value="bandeira">Chegada</option><option value="alvo">Alvo</option><option value="montanha">Montanha</option><option value="bike">Bike</option><option value="corrida">Corrida</option></select></label></div><p id="mpRegra" class="muted"></p><button type="button" class="btn" id="mpSalvar">Criar meta</button><p id="mpStatus" role="status"></p><div id="mpLista"></div><p class="muted">Validação manual, metas de tempo e recordes comparáveis não estão habilitados nesta etapa. O histórico de concessões fica somente neste aparelho do aluno. Não sincroniza entre dispositivos e pode ser perdido ao limpar os dados.</p>';
    card.querySelector('h2').after(box);
    var $=function(id){return document.getElementById(id);};
    function today(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
    function tomorrow(){var d=new Date(today()+'T12:00:00');d.setDate(d.getDate()+1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
    function render(){
      var st=C.load(),chosen=$('mpExercicio').value,exercises=(st.exercicios||[]).filter(function(e){return typeof e.id==='string'&&e.id&&e.nome;}).slice().sort(function(a,b){return a.nome.localeCompare(b.nome);});
      $('mpExercicio').replaceChildren();exercises.forEach(function(e){var o=document.createElement('option');o.value=e.id;o.dataset.nome=e.nome;o.textContent=e.nome+(exercises.filter(function(x){return x.nome===e.nome;}).length>1?' · '+(e.grupo||'Exercício')+' · código '+e.id:'');$('mpExercicio').appendChild(o);});if(exercises.some(function(e){return e.id===chosen;}))$('mpExercicio').value=chosen;
      $('mpInicio').min=tomorrow();if(!$('mpInicio').value)$('mpInicio').value=tomorrow();
      $('mpLista').replaceChildren();((st.config||{}).metasPersonalizadas||[]).forEach(function(raw){var d;try{d=M.definition(raw);}catch(_){return;}var row=document.createElement('p'),text=document.createElement('span');text.textContent=d.nome+' · '+d.alvo+' '+d.unidade+' · '+(d.exercicio||d.modalidade)+' · desde '+d.inicio+(d.encerrada?' · encerrada':'');row.appendChild(text);if(!d.encerrada){var b=document.createElement('button');b.type='button';b.className='btn sec mini';b.textContent='Encerrar meta';b.style.marginLeft='8px';b.onclick=function(){var next=JSON.parse(JSON.stringify(C.load())),item=(next.config.metasPersonalizadas||[]).find(function(x){return x.id===d.id;});if(!item)return;item.encerrada=true;next.config.appEditGeralEm=new Date().toISOString();if(C.save(next)){$('mpStatus').textContent='Meta encerrada. Publique para atualizar os alunos; o histórico permanece.';render();}else $('mpStatus').textContent='Não foi possível salvar. A meta permanece como estava.';};row.appendChild(b);}$('mpLista').appendChild(row);});
    }
    function type(){var carga=$('mpTipo').value==='carga';$('mpExLabel').hidden=!carga;$('mpExLabel').style.display=carga?'':'none';$('mpModLabel').hidden=carga;$('mpModLabel').style.display=carga?'none':'';$('mpUnidade').textContent=carga?'(kg)':'(km)';$('mpRegra').textContent=carga?'Usa o identificador do exercício em uma série concluída. Registros antigos sem identificação são dados insuficientes, mesmo com nome igual. Não estima 1RM nem concede PR.':'Soma distâncias em km com até duas casas decimais, de atividades com identificador, tempo válido e status completo. Sem estimar distância nem misturar modalidades.';}
    $('mpTipo').onchange=type;
    $('mpSalvar').onclick=function(){
      var st=JSON.parse(JSON.stringify(C.load()));st.config=st.config||{};
      var d={id:'mp_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10),nome:$('mpNome').value,tipo:$('mpTipo').value,alvo:Number($('mpAlvo').value),inicio:$('mpInicio').value,criadaDia:today(),modalidade:$('mpModalidade').value,exercicio:($('mpExercicio').selectedOptions[0]||{}).dataset?.nome||'',exercicioId:$('mpExercicio').value,icone:$('mpIcone').value};
      try{d=M.definition(d);st.config.metasPersonalizadas=M.list((st.config.metasPersonalizadas||[]).concat(d));}catch(e){$('mpStatus').textContent=e.message;return;}
      st.config.appEditGeralEm=new Date().toISOString();if(!C.save(st)){$('mpStatus').textContent='Não foi possível salvar. Seu rascunho foi mantido.';return;}
      $('mpNome').value='';$('mpAlvo').value='';$('mpStatus').textContent='Meta criada. Use Publicar para atualizar os alunos.';render();
    };
    render();type();if(C.onChange)C.onChange(render);
  }
  root.MT_PERSONAL_METAS={init:init};
})(window);
