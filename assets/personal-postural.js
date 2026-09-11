/* Editor aditivo de avaliação postural do Personal. Fotos nunca entram em ptStudio. */
(function(root){
  'use strict';
  var C=root.MT_POSTURAL_CORE, Store=root.MT_POSTURAL_STORE, S=root.MTStore;
  if(!C||!Store||!S||!document.getElementById('avAbas')||document.getElementById('ppRoot'))return;
  var NS='http://www.w3.org/2000/svg';
  var VIEWS={frente:'Frente',costas:'Costas',esquerda:'Lateral esquerda',direita:'Lateral direita'};
  var LABELS={move:'Mover',horizontal:'Ângulo horizontal',vertical:'Ângulo vertical',angle:'Ângulo de 3 pontos',note:'Anotar',plumb:'Prumo'};
  var HELP={move:'Arraste a imagem para mover. Arraste um ponto para ajustá-lo. Use + e − para ampliar.',
    horizontal:'Toque em 2 pontos. O resultado é a inclinação da linha em relação à horizontal da imagem ajustada.',
    vertical:'Toque em 2 pontos. O resultado é a inclinação da linha em relação à vertical da imagem ajustada.',
    angle:'Toque em 3 pontos: início, vértice e fim. O segundo ponto é o centro do ângulo.',
    note:'Toque na foto para colocar uma anotação. Escreva a observação no painel de marcações.',
    plumb:'Toque ou arraste para posicionar o fio de prumo vertical.'};
  var ctx=null,doc=null,selected='',tool='move',pending=[],dirty=false,busy=false,epoch=0,loadEpoch=0,historySeq=0,contextSeq=0,student='',parentId=null;
  var zoom=1,pan={x:0,y:0},undo=[],redo=[],rows=[],remoteRows=[],remoteOffset=0,hasMore=false;
  var pointers=new Map(),gesture=null,authSubscription=null,authClient=null;
  function $(id){return document.getElementById(id);}
  function el(tag,attrs,text){var n=document.createElement(tag);Object.keys(attrs||{}).forEach(function(k){n.setAttribute(k,attrs[k]);});if(text!=null)n.textContent=text;return n;}
  function svgEl(tag,attrs,text){var n=document.createElementNS(NS,tag);Object.keys(attrs||{}).forEach(function(k){n.setAttribute(k,attrs[k]);});if(text!=null)n.textContent=text;return n;}
  function say(text,error){$('ppStatus').textContent=text;$('ppStatus').classList.toggle('pp-error',!!error);}
  function setDirty(){dirty=true;say('Alterações não salvas.');}
  function dates(){return S.todayISO();}
  function active(){return !$('ppRoot').hidden && !$('vAvaliacoes').hidden;}
  function eligible(){return (S.read('ptStudio',{}).alunos||[]).some(function(a){return a.id===student;});}
  function contextValid(saved){return !!ctx && ctx.scope===saved.scope;}
  async function checkContext(){
    var seq=++contextSeq,fresh=await Store.context();
    if(seq!==contextSeq)return ctx||fresh;
    if(ctx && fresh.scope!==ctx.scope){epoch++;loadEpoch++;ctx=fresh;reset();student='';$('ppAluno').value='';rows=[];remoteRows=[];renderHistory();say('A conta mudou. Selecione novamente o aluno para continuar.',true);}
    else ctx=fresh;
    $('ppMode').textContent=ctx.demo?'Demonstração · só neste navegador':ctx.client?'Conta conectada · arquivo privado':'Sem login · só neste navegador';
    $('ppStorageHelp').textContent=ctx.client?'Os snapshots ficam separados dos treinos. A sincronização só é confirmada após a resposta da nuvem. Apenas o autor autenticado, dentro da mesma conta, acessa estes registros.':'As fotos salvas ficam apenas neste navegador. Limpar os dados do site pode apagá-las. Não use um dispositivo compartilhado para guardar fotos pessoais.';
    if(ctx.client!==authClient){
      if(authSubscription)authSubscription.unsubscribe();authClient=ctx.client;authSubscription=null;
      if(authClient && authClient.auth.onAuthStateChange){var a=authClient.auth.onAuthStateChange(function(){setTimeout(checkContext,0);});authSubscription=a.data&&a.data.subscription;}
    }
    return ctx;
  }
  function mount(){
    var button=el('button',{'type':'button','data-ava':'postural'},'Avaliação postural');$('avAbas').appendChild(button);
    $('avArea').appendChild(el('option',{value:'postural'},'Avaliação postural'));
    var box=el('section',{id:'ppRoot','data-avsec':'postural',hidden:'',class:'pp-root'});
    box.innerHTML='<header class="pp-heading"><div><span class="pp-eyebrow">REGISTRO FOTOGRÁFICO 2D</span><h2>Avaliação postural</h2><p>Importe uma foto, posicione os pontos e registre suas observações.</p></div><span id="ppMode" class="pp-chip"></span></header>'+
      '<div class="pp-context"><label>Aluno<select id="ppAluno"><option value="">Escolha o aluno</option></select></label><label>Data da avaliação<input id="ppDate" type="date"></label><label>Vista<select id="ppView"><option value="frente">Frente</option><option value="costas">Costas</option><option value="esquerda">Lateral esquerda</option><option value="direita">Lateral direita</option></select></label><button type="button" class="btn sec" data-pp-action="new">Nova avaliação</button></div>'+
      '<div class="pp-workspace"><div class="pp-image-column"><div class="pp-upload"><button type="button" class="btn" data-pp-action="photo">Escolher foto</button><button type="button" class="btn sec" data-pp-action="camera">Usar câmera</button><span>JPEG, PNG ou WebP · até 15 MB</span></div>'+
      '<input hidden type="file" id="ppFile" accept="image/jpeg,image/png,image/webp"><input hidden type="file" id="ppCamera" accept="image/jpeg,image/png,image/webp" capture="environment">'+
      '<div class="pp-stage" id="ppStage"><div id="ppEmpty" class="pp-empty"><svg viewBox="0 0 48 48" width="56" height="56" aria-hidden="true"><rect x="5" y="10" width="38" height="30" rx="6" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="24" cy="25" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 10V6h16v4" fill="none" stroke="currentColor" stroke-width="2"/></svg><strong>Uma foto. Um registro completo.</strong><p>Escolha um aluno e importe uma foto autorizada. Nada será enviado antes de você salvar.</p></div><svg id="ppSvg" xmlns="http://www.w3.org/2000/svg" tabindex="0" role="application" aria-label="Editor fotográfico. Use as ferramentas para marcar pontos. Com uma marcação selecionada, use as setas para mover o primeiro ponto e Delete para remover." hidden></svg><span id="ppZoomLabel" class="pp-zoom-label" hidden>100%</span></div>'+
      '<div class="pp-toolbar" id="ppTools" aria-label="Ferramentas de avaliação"></div><p class="pp-help" id="ppToolHelp" aria-live="polite"></p>'+
      '<div class="pp-view-tools"><button type="button" class="btn sec" data-pp-action="zoomOut" aria-label="Diminuir zoom">−</button><button type="button" class="btn sec" data-pp-action="zoomIn" aria-label="Aumentar zoom">+</button><button type="button" class="btn sec" data-pp-action="fit">Ajustar à tela</button><button type="button" class="btn sec" data-pp-action="mirror" aria-pressed="false" id="ppMirror">Espelhar</button><button type="button" class="btn sec" data-pp-action="undo" id="ppUndo">Desfazer</button><button type="button" class="btn sec" data-pp-action="redo" id="ppRedo">Refazer</button></div></div>'+
      '<aside class="pp-side"><details class="pp-adjustments" open><summary>Referências e enquadramento</summary><label>Rotação da foto (°)<input id="ppRotation" type="number" min="-180" max="180" step="0.1" value="0"></label><label class="pp-check"><input id="ppGrid" type="checkbox" checked> Mostrar grade</label><label>Colunas da grade<input id="ppColumns" type="range" min="4" max="30" step="1" value="12"></label><label>Visibilidade da grade<input id="ppOpacity" type="range" min="10" max="80" value="35"></label><label class="pp-check"><input id="ppPlumb" type="checkbox" checked> Mostrar fio de prumo</label><label>Posição do prumo<input id="ppPlumbX" type="range" min="0" max="100" step="0.1" value="50"></label></details>'+
      '<div class="pp-marks-heading"><h3>Marcações</h3><span id="ppCount">0 / 60</span></div><div id="ppMarks" class="pp-marks"></div><div id="ppEdit" class="pp-edit" hidden><label for="ppText">Observação da marcação selecionada</label><textarea id="ppText" rows="3" maxlength="2000"></textarea><button type="button" class="btn sec" data-pp-action="removeMark">Remover marcação</button></div>'+
      '<p class="pp-disclaimer">Medidas geométricas da fotografia, não um diagnóstico. Os pontos são definidos pelo profissional. Não há classificação automática nem indicação de tratamento.</p></aside></div>'+
      '<div class="pp-save"><label class="pp-check"><input type="checkbox" id="ppConsent"> Confirmo que o aluno ou responsável autorizou o registro e o armazenamento desta foto para a avaliação.</label><div class="pp-save-actions"><button type="button" class="btn" data-pp-action="save" id="ppSave">Salvar avaliação</button><button type="button" class="btn sec" data-pp-action="export">Exportar imagem anotada</button></div><p id="ppStatus" role="status" aria-live="polite"></p><p id="ppStorageHelp" class="pp-help"></p></div>'+
      '<section class="pp-history"><div class="pp-history-head"><div><h3>Histórico postural do aluno</h3><p>Cada salvamento cria uma versão. Uma avaliação anterior nunca é sobrescrita.</p></div><button type="button" class="btn sec" data-pp-action="refresh">Atualizar histórico</button></div><p id="ppHistoryStatus" role="status"></p><div id="ppHistory"></div><button type="button" class="btn sec" data-pp-action="more" id="ppMore" hidden>Carregar mais avaliações</button></section>';
    $('vAvaliacoes').appendChild(box);
    Object.keys(LABELS).forEach(function(t){$('ppTools').appendChild(el('button',{'type':'button','data-pp-tool':t,'aria-pressed':String(t==='move')},LABELS[t]));});
    $('ppDate').value=dates();$('ppDate').max=dates();
    if($('pfNovaAval')){var profile=el('button',{'type':'button','class':'btn sec mini',id:'ppProfile'},'Avaliação postural');$('pfNovaAval').after(profile);profile.onclick=function(){$('pfNovaAval').click();open($('avAluno').value);};}
    box.addEventListener('click',onAction);
    $('avAbas').addEventListener('click',function(e){if(e.target.closest('[data-ava="postural"]'))open();});
    $('ppAluno').addEventListener('change',changeStudent);
    ['ppDate','ppView','ppConsent'].forEach(function(id){$(id).addEventListener('change',function(){if(doc)setDirty();});});
    $('ppFile').onchange=$('ppCamera').onchange=importPhoto;
    ['ppRotation','ppGrid','ppColumns','ppOpacity','ppPlumb','ppPlumbX'].forEach(function(id){$(id).addEventListener('change',adjust);});
    $('ppText').addEventListener('input',function(){var m=mark();if(m){m.text=this.value;setDirty();paint();renderMarks(false);}});
    $('ppText').addEventListener('focus',function(){if(mark())remember();});
    var svg=$('ppSvg');svg.addEventListener('pointerdown',down);svg.addEventListener('pointermove',move);svg.addEventListener('pointerup',up);svg.addEventListener('pointercancel',cancelPointer);
    svg.addEventListener('keydown',keyboard);
    new ResizeObserver(function(){if(doc && active())paint();}).observe($('ppStage'));
    window.addEventListener('beforeunload',function(e){if(dirty||busy){e.preventDefault();e.returnValue='';}});
    window.addEventListener('storage',function(e){if(e.key && /academia|perfil/.test(e.key))checkContext();});
    window.addEventListener('focus',checkContext);
    S.onChange(function(key){if(key==='ptStudio')refreshStudents();if(/academia|perfil/.test(key||''))checkContext();});
    refreshStudents();selectTool('move');updateControls();checkContext();
  }
  function refreshStudents(){
    var sel=$('ppAluno'),value=student;
    sel.replaceChildren(el('option',{value:''},'Escolha o aluno'));
    (S.read('ptStudio',{}).alunos||[]).slice().sort(function(a,b){return String(a.nome).localeCompare(String(b.nome),'pt-BR');}).forEach(function(a){sel.appendChild(el('option',{value:a.id},a.nome+(a.ativo===false?' · inativo':'')));});
    sel.value=value;
    if(value && !eligible()){epoch++;reset();student='';rows=[];remoteRows=[];hasMore=false;renderHistory();say('O aluno não está mais disponível nesta conta.',true);}
  }
  async function open(id){
    await checkContext();refreshStudents();
    if(id && id!==student){if(dirty&&!confirm('Descartar as alterações não salvas desta avaliação?'))return;$('ppAluno').value=id;await changeStudent();}
    else if(!student && $('avAluno').value){$('ppAluno').value=$('avAluno').value;await changeStudent();}
    if(root.__avAba)root.__avAba('postural');
    requestAnimationFrame(paint);
    if(student)history(false);
  }
  async function changeStudent(){
    if(busy){$('ppAluno').value=student;say('Aguarde o salvamento em andamento.',true);return;}
    var id=$('ppAluno').value;
    if(id===student)return;
    if(dirty&&!confirm('Descartar as alterações não salvas antes de trocar o aluno?')){$('ppAluno').value=student;return;}
    student=id;epoch++;loadEpoch++;reset();rows=[];remoteRows=[];renderHistory();
    if(student)await history(false);
  }
  function reset(){
    loadEpoch++;historySeq++;document.querySelectorAll('.pp-compare').forEach(function(d){d.close();d.remove();});
    doc=null;selected='';pending=[];dirty=false;undo=[];redo=[];parentId=null;zoom=1;pan={x:0,y:0};
    pointers.clear();gesture=null;$('ppConsent').checked=false;$('ppDate').value=dates();$('ppView').value='frente';
    $('ppSave').textContent='Salvar avaliação';$('ppFile').value='';$('ppCamera').value='';say('');paint();renderMarks();updateControls();
  }
  function mark(){return doc && doc.marks.find(function(m){return m.id===selected;});}
  function remember(){if(!doc)return;undo.push({rotation:doc.rotation,mirrored:doc.mirrored,grid:C.clone(doc.grid),plumb:C.clone(doc.plumb),marks:C.clone(doc.marks)});if(undo.length>40)undo.shift();redo=[];}
  function state(){return {rotation:doc.rotation,mirrored:doc.mirrored,grid:C.clone(doc.grid),plumb:C.clone(doc.plumb),marks:C.clone(doc.marks)};}
  function restore(stack,other){if(!doc||!stack.length)return;other.push(state());Object.assign(doc,stack.pop());selected='';pending=[];setDirty();paint();renderMarks();updateControls();}
  function updateControls(){
    $('ppRoot').querySelectorAll('button,input,select,textarea').forEach(function(e){
      if(busy && !e.disabled){e.dataset.ppBusy='1';e.disabled=true;}
      else if(!busy && e.dataset.ppBusy){delete e.dataset.ppBusy;e.disabled=false;}
    });
    var off=!doc||busy;
    $('ppConsent').disabled=off;$('ppText').disabled=off||!mark();
    $('ppHistory').querySelectorAll('[data-pp-action=compare]').forEach(function(b){b.disabled=off;});
    $('ppSave').disabled=off||!student;
    $('ppUndo').disabled=off||!undo.length;$('ppRedo').disabled=off||!redo.length;
    ['ppRotation','ppGrid','ppColumns','ppOpacity','ppPlumb','ppPlumbX'].forEach(function(id){$(id).disabled=off;});
    if(doc){$('ppRotation').value=doc.rotation;$('ppGrid').checked=doc.grid.visible;$('ppColumns').value=doc.grid.columns;
      $('ppOpacity').value=doc.grid.opacity*100;$('ppPlumb').checked=doc.plumb.visible;$('ppPlumbX').value=doc.plumb.x*100;}
    $('ppMirror').setAttribute('aria-pressed',String(!!doc&&doc.mirrored));
    $('ppZoomLabel').hidden=!doc;$('ppZoomLabel').textContent=Math.round(zoom*100)+'%';
  }
  function selectTool(t){tool=t;pending=[];gesture=null;pointers.clear();$('ppTools').querySelectorAll('[data-pp-tool]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.ppTool===t));});$('ppToolHelp').textContent=HELP[t];paint();}
  function adjust(){
    if(!doc||busy)return;
    var angle=Number($('ppRotation').value);
    if(!Number.isFinite(angle)||angle < -180||angle > 180){say('Use uma rotação de −180° a 180°.',true);$('ppRotation').value=doc.rotation;return;}
    remember();doc.rotation=angle;doc.grid={visible:$('ppGrid').checked,columns:+$('ppColumns').value,opacity:+$('ppOpacity').value/100};
    doc.plumb={visible:$('ppPlumb').checked,x:+$('ppPlumbX').value/100};setDirty();paint();renderMarks();updateControls();
  }
  async function importPhoto(e){
    var file=e.target.files && e.target.files[0];e.target.value='';
    if(!file)return;
    if(!student||!eligible()){say('Escolha o aluno antes de importar uma foto.',true);return;}
    if(busy)return;
    if(doc&&!confirm('Substituir a foto? As marcações em edição serão removidas. As versões salvas continuam no histórico.'))return;
    if(!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>15*1024*1024){say('Use JPEG, PNG ou WebP de até 15 MB. Para HEIC, converta a foto para JPEG.',true);return;}
    var token=++loadEpoch,revision=epoch;busy=true;updateControls();
    say('Preparando a foto neste aparelho…');
    var url=URL.createObjectURL(file);
    try{
      var image=await new Promise(function(resolve,reject){var im=new Image();im.onload=function(){resolve(im);};im.onerror=function(){reject(new Error('Não foi possível abrir a foto. Escolha outro arquivo.'));};im.src=url;});
      if(token!==loadEpoch||revision!==epoch)return;
      if(!image.naturalWidth||image.naturalWidth*image.naturalHeight>40000000)throw new Error('A foto é grande demais. Use uma cópia com até 40 megapixels.');
      var factor=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(image.naturalWidth*factor));canvas.height=Math.max(1,Math.round(image.naturalHeight*factor));
      var c=canvas.getContext('2d');c.fillStyle='#ffffff';c.fillRect(0,0,canvas.width,canvas.height);c.drawImage(image,0,0,canvas.width,canvas.height);
      var data='',quality=.86;
      do{data=canvas.toDataURL('image/jpeg',quality);quality-=.1;}while(data.length>750000 && quality>=.35);
      if(data.length>750000)throw new Error('A foto ficou muito pesada. Recorte uma cópia menor antes de importar.');
      doc=C.create({data:data,width:canvas.width,height:canvas.height});C.validate(doc);
      selected='';pending=[];undo=[];redo=[];parentId=null;zoom=1;pan={x:0,y:0};$('ppConsent').checked=false;
      $('ppSave').textContent='Salvar avaliação';selectTool('move');setDirty();paint();renderMarks();updateControls();
    }catch(error){if(token===loadEpoch && revision===epoch)say(error.message,true);}finally{URL.revokeObjectURL(url);busy=false;updateControls();}
  }
  function scene(svg,d,opt){
    svg.replaceChildren();var b=C.bounds(d),z=opt.zoom||1,center=opt.pan||{x:0,y:0};
    svg.setAttribute('viewBox',[center.x-b.width/(2*z),center.y-b.height/(2*z),b.width/z,b.height/z].join(' '));
    var screenW=opt.width||800,screenH=opt.height||800,px=Math.max(b.width/screenW,b.height/screenH)/z;
    var g=svgEl('g',{transform:'rotate('+d.rotation+') scale('+(d.mirrored?-1:1)+' 1)'});
    g.appendChild(svgEl('image',{href:d.image.data,x:-d.image.width/2,y:-d.image.height/2,width:d.image.width,height:d.image.height}));svg.appendChild(g);
    if(d.grid.visible){var grid=svgEl('g',{stroke:'#ffffff','stroke-opacity':d.grid.opacity,'stroke-width':px,fill:'none'}),step=b.width/d.grid.columns;
      for(var x=-b.width/2;x<=b.width/2+.01;x+=step)grid.appendChild(svgEl('line',{x1:x,x2:x,y1:-b.height/2,y2:b.height/2}));
      for(var y=-b.height/2;y<=b.height/2+.01;y+=step)grid.appendChild(svgEl('line',{x1:-b.width/2,x2:b.width/2,y1:y,y2:y}));svg.appendChild(grid);}
    if(d.plumb.visible){var pl=(d.plumb.x-.5)*b.width;svg.appendChild(svgEl('line',{x1:pl,x2:pl,y1:-b.height/2,y2:b.height/2,stroke:'#ff7896','stroke-width':2*px,'stroke-dasharray':8*px+' '+5*px}));}
    function dot(p,fill,r){svg.appendChild(svgEl('circle',{cx:p.x,cy:p.y,r:r||6*px,fill:fill,stroke:'#ffffff','stroke-width':2*px}));}
    function caption(p,text,color){var w=(text.length*7+14)*px,h=23*px;
      svg.appendChild(svgEl('rect',{x:p.x-w/2,y:p.y-h/2,width:w,height:h,rx:5*px,fill:'#13151c','fill-opacity':.94}));
      svg.appendChild(svgEl('text',{x:p.x,y:p.y+4*px,fill:color||'#ffffff','font-size':12*px,'font-family':'Arial, sans-serif','font-weight':700,'text-anchor':'middle'},text));}
    d.marks.forEach(function(m,i){var points=m.points.map(function(p){return C.world(p,d);}),color=m.id===opt.selected?'#f8d875':'#7be9f8';
      if(m.type!=='note')svg.appendChild(svgEl('polyline',{points:points.map(function(p){return p.x+','+p.y;}).join(' '),stroke:color,'stroke-width':2.5*px,fill:'none'}));
      points.forEach(function(p){dot(p,color);});var p=points[0];
      if(m.type==='angle'){
        var a=Math.atan2(points[0].y-points[1].y,points[0].x-points[1].x),end=Math.atan2(points[2].y-points[1].y,points[2].x-points[1].x);
        var delta=((end-a+3*Math.PI)%(2*Math.PI))-Math.PI,r=Math.min(35*px,C.distance(points[0],points[1])/2,C.distance(points[2],points[1])/2),v=points[1];
        svg.appendChild(svgEl('path',{d:'M '+(v.x+Math.cos(a)*r)+' '+(v.y+Math.sin(a)*r)+' A '+r+' '+r+' 0 0 '+(delta>=0?1:0)+' '+(v.x+Math.cos(a+delta)*r)+' '+(v.y+Math.sin(a+delta)*r),stroke:color,'stroke-width':2*px,fill:'none'}));p=v;
      }else if(m.type!=='note')p={x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2};
      var value=C.measure(m,d),text=m.type==='note'?String(i+1):(i+1)+' · '+(value==null?'—':value.toFixed(1).replace('.',',')+'°');
      caption({x:p.x,y:p.y-20*px},text,color);
    });
    (opt.pending||[]).forEach(function(p){dot(C.world(p,d),'#f8d875');});
  }
  function paint(){
    if(!$('ppSvg'))return;var svg=$('ppSvg');$('ppEmpty').hidden=!!doc;svg.toggleAttribute('hidden',!doc);
    if(doc){var rect=$('ppStage').getBoundingClientRect();scene(svg,doc,{zoom:zoom,pan:pan,selected:selected,pending:pending,width:rect.width||800,height:rect.height||600});}
    else svg.replaceChildren();updateControls();
  }
  function renderMarks(updateEdit){
    var list=$('ppMarks');list.replaceChildren();$('ppCount').textContent=(doc?doc.marks.length:0)+' / 60';
    if(!doc||!doc.marks.length)list.appendChild(el('p',{class:'pp-help'},'Nenhuma marcação. Escolha uma ferramenta e toque na foto.'));
    (doc?doc.marks:[]).forEach(function(m,i){var button=el('button',{'type':'button','class':'pp-mark','data-pp-select':m.id,'aria-pressed':String(m.id===selected)});
      var value=C.measure(m,doc);button.appendChild(el('strong',{},(i+1)+'. '+LABELS[m.type]+(m.type==='note'?'':' · '+(value==null?'Pontos coincidentes':value.toFixed(1).replace('.',',')+'°'))));
      button.appendChild(el('span',{},m.text||'Sem observação'));list.appendChild(button);});
    if(updateEdit!==false){var m=mark();$('ppEdit').hidden=!m;$('ppText').value=m?m.text:'';}
  }
  function at(e){var svg=$('ppSvg'),matrix=svg.getScreenCTM();if(!matrix)return null;var p=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());return{x:p.x,y:p.y};}
  function nearest(e){var matrix=$('ppSvg').getScreenCTM(),best=null,min=24;
    doc.marks.forEach(function(m){m.points.forEach(function(p,i){var w=C.world(p,doc),screen=new DOMPoint(w.x,w.y).matrixTransform(matrix),d=Math.hypot(screen.x-e.clientX,screen.y-e.clientY);if(d<min){best={id:m.id,index:i};min=d;}});});return best;}
  function down(e){
    if(!doc||busy||e.button>0)return;e.preventDefault();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});$('ppSvg').setPointerCapture(e.pointerId);
    if(pointers.size===2){var pair=Array.from(pointers.values());gesture={type:'pinch',distance:C.distance(pair[0],pair[1]),zoom:zoom};return;}
    if(pointers.size>2)return;
    var hit=tool==='move'?nearest(e):null;
    gesture={type:hit?'point':tool==='move'?'pan':tool==='plumb'?'plumb':'add',start:{x:e.clientX,y:e.clientY},pan:C.clone(pan),hit:hit,moved:false,world:at(e)};
    if(hit){selected=hit.id;remember();renderMarks();}
    if(tool==='plumb'){remember();doc.plumb.visible=true;updatePlumb(e);}
  }
  function updatePlumb(e){var p=at(e);if(!p)return;doc.plumb.x=C.clamp(p.x/C.bounds(doc).width+.5,0,1);setDirty();paint();}
  function move(e){
    if(!doc||!gesture||!pointers.has(e.pointerId))return;e.preventDefault();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(gesture.type==='pinch'){if(pointers.size<2)return;var pair=Array.from(pointers.values());if(gesture.distance>0)zoom=C.clamp(gesture.zoom*C.distance(pair[0],pair[1])/gesture.distance,1,5);paint();return;}
    if(pointers.size>1)return;
    if(Math.hypot(e.clientX-gesture.start.x,e.clientY-gesture.start.y)>5)gesture.moved=true;
    if(gesture.type==='pan'){
      // Converte deltas usando a matriz linear: zoom/pan jamais alteram os pontos.
      var m=$('ppSvg').getScreenCTM();pan={x:gesture.pan.x-(e.clientX-gesture.start.x)/m.a,y:gesture.pan.y-(e.clientY-gesture.start.y)/m.d};paint();
    }else if(gesture.type==='point'){var p=C.original(at(e),doc),m=mark();m.points[gesture.hit.index]={x:C.clamp(p.x,0,1),y:C.clamp(p.y,0,1)};setDirty();paint();renderMarks(false);}
    else if(gesture.type==='plumb')updatePlumb(e);
  }
  function up(e){
    if(!pointers.has(e.pointerId))return;var g=gesture;pointers.delete(e.pointerId);if($('ppSvg').hasPointerCapture(e.pointerId))$('ppSvg').releasePointerCapture(e.pointerId);
    if(!g)return;if(g.type==='pinch'){if(!pointers.size)gesture=null;return;}
    gesture=null;if(!doc||g.moved||g.type!=='add')return;
    var p=C.original(at(e),doc);if(!C.inside(p)){say('Toque dentro da foto, não na margem.',true);return;}
    if(doc.marks.length>=60){say('Limite de 60 marcações por foto. Remova uma para continuar.',true);return;}
    pending.push(p);
    if(pending.length===C.types[tool]){var m={id:C.uuid(),type:tool,points:C.clone(pending),text:''};
      if(tool!=='note' && C.measure(m,doc)==null){pending.pop();say('Afaste os pontos: um ângulo precisa de segmentos distintos.',true);paint();return;}
      remember();doc.marks.push(m);selected=m.id;pending=[];setDirty();renderMarks();if(tool==='note')$('ppText').focus();
    }else $('ppToolHelp').textContent=HELP[tool]+' Ponto '+pending.length+' de '+C.types[tool]+'.';paint();
  }
  function cancelPointer(e){pointers.delete(e.pointerId);gesture=null;}
  function keyboard(e){
    if(!doc||busy)return;var m=mark();
    if(e.key==='Escape'){pending=[];selected='';selectTool('move');renderMarks();return;}
    if(!m)return;
    if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();removeMark();return;}
    var delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
    if(delta){e.preventDefault();remember();var p=C.world(m.points[0],doc),step=e.shiftKey?10:1;p.x+=delta[0]*step;p.y+=delta[1]*step;p=C.original(p,doc);m.points[0]={x:C.clamp(p.x,0,1),y:C.clamp(p.y,0,1)};setDirty();paint();renderMarks(false);}
  }
  function removeMark(){if(!mark())return;remember();doc.marks=doc.marks.filter(function(m){return m.id!==selected;});selected='';setDirty();paint();renderMarks();}
  async function save(){
    if(busy)return;
    if(!doc||!student||!eligible()){say('Escolha o aluno e importe uma foto.',true);return;}
    if(!$('ppConsent').checked){say('Confirme a autorização para registrar e armazenar a foto.',true);return;}
    if(pending.length){say('Conclua a marcação ou selecione Mover para cancelar os pontos temporários.',true);return;}
    var date=$('ppDate').value,iso=new Date(date+'T12:00:00Z');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||isNaN(iso.getTime())||iso.toISOString().slice(0,10)!==date||date>dates()){say('Informe uma data válida, até hoje.',true);return;}
    try{C.validate(doc);}catch(error){say(error.message,true);return;}
    var target=ctx,token=epoch;
    if(!target){say('Aguarde a verificação da conta e tente novamente.',true);return;}
    busy=true;updateControls();say('Salvando uma nova versão…');
    try{
      var fresh=await Store.context();if(fresh.scope!==target.scope){await checkContext();return;}
      if(token!==epoch||!doc||!contextValid(target)||!eligible())return;
      var rec={id:C.uuid(),scope:target.scope,alunoId:student,data:date,vista:$('ppView').value,criadoEm:new Date().toISOString(),documento:C.clone(doc),parentId:parentId,synced:false,cloudPending:!!target.client};
      await Store.localPut(rec);
      if(token!==epoch||!contextValid(target))return;
      dirty=false;parentId=rec.id;$('ppConsent').checked=false;$('ppSave').textContent='Salvar nova versão';say('Avaliação salva neste navegador.');
      if(target.client){
        try{await Store.remotePut(target,rec);rec.synced=true;rec.cloudPending=false;await Store.localPut(rec);if(token===epoch && contextValid(target))say('Avaliação salva neste aparelho e confirmada na nuvem.');}
        catch(error){if(token===epoch && contextValid(target))say('Salva apenas neste aparelho. '+error.message,true);}
      }
      if(token===epoch && contextValid(target))await history(false);
    }catch(error){if(token===epoch)say(error.message,true);}finally{busy=false;updateControls();}
  }
  async function history(more){
    if(!student){$('ppHistoryStatus').textContent='Escolha o aluno para ver o histórico.';return;}
    var current=await checkContext(),id=student,token=epoch,load=++historySeq;
    if(!id)return;
    $('ppHistoryStatus').textContent='Carregando histórico…';
    var previous=more?remoteRows.slice():[],offset=more?remoteOffset:0,nextMore=false;
    try{
      var local=await Store.localList(current.scope,id),warning='',next=previous;
      if(current.client){try{var remote=await Store.remoteList(current,id,offset);next=previous.concat(remote);offset+=remote.length;nextMore=remote.length===50;}catch(error){warning=error.message;}}
      var fresh=await Store.context();
      if(fresh.scope!==current.scope){await checkContext();return;}
      if(token!==epoch||load!==historySeq||id!==student||!contextValid(current))return;
      remoteRows=next;remoteOffset=offset;hasMore=nextMore;
      var all=new Map();local.forEach(function(r){all.set(r.id,r);});remoteRows.forEach(function(r){all.set(r.id,r);});
      rows=Array.from(all.values()).sort(function(a,b){return b.criadoEm.localeCompare(a.criadoEm)||b.id.localeCompare(a.id);});renderHistory();
      $('ppHistoryStatus').textContent=warning?'Histórico local disponível. '+warning:rows.length?rows.length+' versão(ões) carregada(s).':'Nenhuma avaliação postural salva para este aluno.';
    }catch(error){if(token===epoch && load===historySeq)$('ppHistoryStatus').textContent=error.message;}
  }
  function renderHistory(){
    var target=$('ppHistory');target.replaceChildren();
    rows.forEach(function(r){var card=el('article',{class:'pp-history-row'}),info=el('div',{});
      info.appendChild(el('strong',{},S.fmtData(r.data)+' · '+(VIEWS[r.vista]||r.vista)));
      info.appendChild(el('span',{},(r.synced?'Confirmada na nuvem':'Somente neste navegador')+' · '+new Date(r.criadoEm).toLocaleString('pt-BR')));card.appendChild(info);
      var buttons=el('div',{class:'pp-row-actions'});
      [['load','Abrir'],['compare','Comparar'],['retry','Sincronizar'],['delete','Excluir']].forEach(function(pair){if(pair[0]==='retry'&&(!ctx||!ctx.client||r.synced))return;var b=el('button',{'type':'button','class':'btn sec mini','data-pp-action':pair[0],'data-pp-record':r.id},pair[1]);if(pair[0]==='compare')b.disabled=!doc;buttons.appendChild(b);});card.appendChild(buttons);target.appendChild(card);
    });$('ppMore').hidden=!hasMore;
  }
  async function getRecord(id,target){
    var rec=await Store.localGet(target.scope,id);
    if(!rec && target.client){rec=await Store.remoteGet(target,id);await Store.localPut(rec);}
    if(!rec)throw new Error('A avaliação não está disponível neste aparelho.');
    C.validate(rec.documento);return rec;
  }
  async function recordAction(action,id){
    if(busy)return;var target=ctx,token=epoch,aluno=student;
    if(!target)return;
    if(action==='load' && dirty && !confirm('Descartar a edição não salva e abrir esta versão?'))return;
    if(action==='delete' && !confirm('Excluir esta versão e sua foto? Esta ação não pode ser desfeita.'))return;
    busy=true;updateControls();
    try{
      var fresh=await Store.context();if(fresh.scope!==target.scope){await checkContext();return;}
      var rec=await getRecord(id,target);
      fresh=await Store.context();if(fresh.scope!==target.scope){await checkContext();return;}
      if(token!==epoch||rec.alunoId!==student||student!==aluno||!contextValid(target))return;
      if(action==='load'){
        doc=C.clone(rec.documento);parentId=rec.id;selected='';pending=[];undo=[];redo=[];dirty=false;zoom=1;pan={x:0,y:0};
        $('ppDate').value=rec.data;$('ppView').value=rec.vista;$('ppConsent').checked=false;$('ppSave').textContent='Salvar nova versão';selectTool('move');paint();renderMarks();renderHistory();say('Versão aberta. Qualquer alteração será salva como uma nova versão.');
      }else if(action==='compare'){
        if(!doc){say('Abra uma avaliação para comparar com outra.',true);return;}
        if(rec.vista!==$('ppView').value){say('Compare fotos da mesma vista: frente, costas ou a mesma lateral.',true);return;}compare(rec);
      }else if(action==='retry'){
        await Store.remotePut(target,rec);rec.synced=true;rec.cloudPending=false;await Store.localPut(rec);if(token===epoch){say('Sincronização confirmada na nuvem.');await history(false);}
      }else if(action==='delete'){
        var listed=rows.find(function(r){return r.id===id;});
        if(rec.synced||rec.cloudPending||(listed&&listed.synced))await Store.remoteDelete(target,id);
        await Store.localDelete(target.scope,id);
        if(token===epoch){if(parentId===id){reset();}say('Versão excluída.');await history(false);}
      }
    }catch(error){if(token===epoch)say(error.message,true);}finally{busy=false;updateControls();}
  }
  function compare(rec){
    var dialog=el('dialog',{class:'pp-compare','aria-label':'Comparação de registros posturais'}),header=el('header',{});
    header.appendChild(el('h2',{},'Comparação de registros'));var close=el('button',{'type':'button','class':'btn sec'},'Fechar');close.onclick=function(){dialog.close();};header.appendChild(close);dialog.appendChild(header);
    dialog.appendChild(el('p',{},'Observe registros da mesma vista. Enquadramento, distância e rotação podem variar. Não há alinhamento automático, escala física ou pontuação de postura.'));
    var pair=el('div',{class:'pp-compare-grid'});
    [[doc,'Em edição · '+S.fmtData($('ppDate').value)],[rec.documento,'Versão salva · '+S.fmtData(rec.data)]].forEach(function(item){var panel=el('section',{});panel.appendChild(el('h3',{},item[1]));var svg=svgEl('svg',{xmlns:NS,role:'img','aria-label':item[1]});scene(svg,item[0],{width:500,height:650});panel.appendChild(svg);pair.appendChild(panel);});dialog.appendChild(pair);document.body.appendChild(dialog);dialog.addEventListener('close',function(){dialog.remove();});dialog.showModal();
  }
  async function exportImage(){
    if(!doc)return;
    if(!confirm('Exportar uma cópia da foto com as marcações? O arquivo exportado ficará fora das proteções de acesso do app.'))return;
    var token=epoch,target=ctx,exportDate=$('ppDate').value,exportView=$('ppView').value;
    var snapshot=C.clone(doc),b=C.bounds(snapshot),factor=Math.min(1,1800/Math.max(b.width,b.height)),svg=svgEl('svg',{xmlns:NS,width:Math.round(b.width*factor),height:Math.round(b.height*factor)});
    scene(svg,snapshot,{width:+svg.getAttribute('width'),height:+svg.getAttribute('height')});
    var blob=new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob);
    try{var img=await new Promise(function(resolve,reject){var im=new Image();im.onload=function(){resolve(im);};im.onerror=function(){reject(new Error('Não foi possível exportar a imagem neste navegador.'));};im.src=url;});
      var canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;var c=canvas.getContext('2d');c.fillStyle='#14161c';c.fillRect(0,0,canvas.width,canvas.height);c.drawImage(img,0,0);
      var output=await new Promise(function(resolve){canvas.toBlob(resolve,'image/png');});if(!output)throw new Error('Não foi possível gerar o arquivo.');
      var fresh=await Store.context();if(token!==epoch||!target||fresh.scope!==target.scope){await checkContext();return;}
      var file=URL.createObjectURL(output),a=el('a',{href:file,download:'avaliacao-postural-'+exportDate+'-'+exportView+'.png'});document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(file);},30000);say('Imagem exportada. As marcações editáveis continuam no app.');
    }catch(error){say(error.message,true);}finally{URL.revokeObjectURL(url);}
  }
  function onAction(e){
    var select=e.target.closest('[data-pp-select]');if(select){selected=select.dataset.ppSelect;renderMarks();paint();return;}
    var t=e.target.closest('[data-pp-tool]');if(t){if(!busy)selectTool(t.dataset.ppTool);return;}
    var button=e.target.closest('[data-pp-action]');if(!button)return;var action=button.dataset.ppAction;
    if(button.dataset.ppRecord){recordAction(action,button.dataset.ppRecord);return;}
    if(action==='save'){save();return;}
    if(busy){say('Aguarde a operação em andamento.',true);return;}
    if(action==='photo'||action==='camera'){if(!student){say('Escolha o aluno antes de importar uma foto.',true);return;}$(action==='photo'?'ppFile':'ppCamera').click();return;}
    if(action==='refresh'||action==='more'){history(action==='more');return;}
    if(action==='new'){if(dirty&&!confirm('Descartar as alterações não salvas?'))return;reset();return;}
    if(!doc){say('Importe uma foto para usar esta ferramenta.',true);return;}
    if(action==='zoomIn'||action==='zoomOut'){zoom=C.clamp(zoom*(action==='zoomIn'?1.25:.8),1,5);paint();}
    else if(action==='fit'){zoom=1;pan={x:0,y:0};paint();}
    else if(action==='mirror'){remember();doc.mirrored=!doc.mirrored;setDirty();paint();renderMarks();}
    else if(action==='undo')restore(undo,redo);
    else if(action==='redo')restore(redo,undo);
    else if(action==='removeMark')removeMark();
    else if(action==='export')exportImage();
  }
  mount();root.MT_PERSONAL_POSTURAL={open:open};
})(typeof self!=='undefined'?self:globalThis);
