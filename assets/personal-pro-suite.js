/* Torque One — Central Pro v846. Dados e permissões permanecem nos contratos existentes. */
(function () {
  'use strict';
  if (window.__PT_PRO_SUITE__) return;
  window.__PT_PRO_SUITE__ = { version: 'v846' };

  var state = {ctx:null, students:[], selected:null, detail:null, importRows:[], session:null,
    exercises:[], members:[], busy:{}, loaded:false, loadSequence:0, selectionSequence:0, epoch:0, inert:[], returnFocus:null};
  var watchedClients=new WeakSet();
  var studentFields = ['ptProImportAluno','ptProSessAluno','ptProWaitAluno','ptProCredAluno','ptProTeamAluno'];
  var triggers = {'questionario.respondido':'Questionário respondido','aluno.novo':'Novo aluno','agenda.cancelada':'Sessão cancelada'};
  var actions = {revisar_aluno:'Revisar aluno',contatar_aluno:'Entrar em contato',revisar_planejamento:'Revisar planejamento'};
  function q(s,r){return (r||document).querySelector(s);}
  function qa(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function copy(v){return JSON.parse(JSON.stringify(v));}
  function id(){return window.crypto&&window.crypto.randomUUID?window.crypto.randomUUID():Date.now()+'-'+Math.random().toString(16).slice(2);}
  function text(v){return v==null?'':String(v);}
  function status(name,msg,kind){var e=q('#'+name);if(e){e.textContent=msg||'';e.className='ptpro-status'+(kind?' '+kind:'');}}
  function errorMessage(err){return err&&err.message?err.message:'Não foi possível concluir. Tente novamente.';}
  function sb(){if(!window.MT_supabase)throw new Error('Entre na sua conta para carregar os alunos.');return window.MT_supabase;}
  function normalize(v){return text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
  function initials(name){return text(name).trim().split(/\s+/).filter(Boolean).slice(0,2).map(function(s){return s[0];}).join('').toUpperCase();}
  function studentName(value){var s=state.students.find(function(a){return a.id===value;});return s?s.name:'Aluno indisponível';}
  function safePhoto(value){try{var u=new URL(value,location.href);return u.protocol==='https:'||u.origin===location.origin?u.href:'';}catch(_){return '';}}
  function avatar(s){var photo=safePhoto(s.photo||'');return '<span class="ptpro-avatar" aria-hidden="true">'+(s.photo&&photo?'<img src="'+esc(photo)+'" alt="" loading="lazy" referrerpolicy="no-referrer">':esc(initials(s.name)))+'</span>';}
  function empty(message){return '<p class="ptpro-empty">'+esc(message)+'</p>';}
  function field(label,control){return '<div class="ptpro-field">'+(label?'<label>'+label+'</label>':'')+control+'</div>';}
  function hiddenStudent(name){return '<input type="hidden" id="'+name+'">';}
  function labelFields(){qa('#ptProSuite .ptpro-field').forEach(function(f,i){var l=q('label',f),el=q('input:not([type=hidden]),select,textarea',f);if(l&&el){if(!el.id)el.id='ptProField-'+i+'-'+id();l.htmlFor=el.id;}});}
  function icon(name){var paths={search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',play:'<path d="m8 5 11 7-11 7z"/>',back:'<path d="m10 5-7 7 7 7M3 12h18"/>',leaf:'<path d="M20 3C8 2 2 8 5 15c3 6 14 4 15-12Z"/><path d="m4 21 11-12"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6M17 2v6M3 11h18"/>',check:'<path d="m5 12 4 4L19 6"/>',note:'<rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 2h6v4H9zM9 11h6M9 15h6"/>',edit:'<path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14z"/>'};
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">'+(paths[name]||paths.note)+'</svg>';}
  async function context(){
    var cli=sb();watchIdentity(cli);var epoch=state.epoch,r=await cli.auth.getSession();
    if(r.error)throw r.error;
    var user=r.data&&r.data.session&&r.data.session.user;
    if(!user){clearIdentity();throw new Error('Sessão não encontrada. Entre novamente na sua conta.');}
    var membership=cli.from('membros').select('academia_id,user_id,papel,nome,email').eq('user_id',user.id);
    var host=window.MTStore&&window.MTStore.cloud&&window.MTStore.cloud();
    if(host&&host.client===cli&&host.aid)membership=membership.eq('academia_id',host.aid);
    var m=await membership.limit(1);
    var confirmed=await cli.auth.getSession(),confirmedUser=confirmed.data&&confirmed.data.session&&confirmed.data.session.user;
    var hostNow=window.MTStore&&window.MTStore.cloud&&window.MTStore.cloud();
    if(epoch!==state.epoch||confirmed.error||!confirmedUser||confirmedUser.id!==user.id||window.MT_supabase!==cli||
      host&&(!hostNow||hostNow.client!==host.client||hostNow.aid!==host.aid)||
      !host&&hostNow&&(hostNow.client!==cli||m.data&&m.data[0]&&hostNow.aid!==m.data[0].academia_id)){
      clearIdentity();throw new Error('A conta mudou durante a consulta. Atualize a lista de alunos.');
    }
    if(m.error)throw m.error;
    if(!m.data||!m.data.length){clearIdentity();throw new Error('Sua conta ainda não tem um espaço de trabalho vinculado.');}
    var next={user:user,academia_id:m.data[0].academia_id,membro:m.data[0],epoch:state.epoch};
    if(state.ctx&&(state.ctx.user.id!==user.id||state.ctx.academia_id!==next.academia_id)){clearIdentity();state.ctx=next;throw new Error('A conta mudou. Atualize a lista de alunos antes de continuar.');}
    state.ctx=next;return next;
  }
  function clearIdentity(){
    state.epoch++;state.loadSequence++;state.selectionSequence++;
    state.loaded=false;state.students=[];state.selected=null;state.detail=null;state.session=null;state.exercises=[];state.ctx=null;
    state.queue=[];state.members=[];state.importRows=[];state.importSaved=false;state.creditReady=false;state.detailLoading=false;state.busy={};state.fileSequence=(state.fileSequence||0)+1;
    studentFields.forEach(function(f){if(q('#'+f))q('#'+f).value='';});
    if(q('#ptProStudentSearch')){
      q('#ptProStudentSearch').value='';q('#ptProStudentSearch').disabled=false;q('#ptProStudentResults').innerHTML='';hideResults();
      q('#ptProClearStudent').hidden=true;q('#ptProSessObs').value='';q('#ptProCredSaldo').value='';
      q('#ptProFile').value='';q('#ptProImportPreview').innerHTML='';q('#ptProImportPreview').hidden=true;q('#ptProImportSave').disabled=true;
      q('#ptProImportTarget').textContent='Rascunho sem aluno vinculado.';
      ['ptProAutoList','ptProQueueList','ptProWaitList','ptProTeamList','ptProResp','ptProSub'].forEach(function(key){q('#'+key).innerHTML='';});
      qa('#ptProSuite .ptpro-status').forEach(function(el){el.textContent='';});
      renderStudent();renderWorkouts();renderContext();updateSessionButtons();
      status('ptProStudentStatus','A conta mudou. Atualize a lista de alunos para continuar.');q('#ptProRetryStudents').hidden=false;
    }
  }
  function watchIdentity(client){
    if(watchedClients.has(client))return;watchedClients.add(client);
    if(client.auth&&client.auth.onAuthStateChange)client.auth.onAuthStateChange(function(event,session){
      var user=session&&session.user;
      if(event==='SIGNED_OUT'||state.ctx&&(!user||user.id!==state.ctx.user.id))clearIdentity();
    });
  }
  function assertContext(c){if(!c||c.epoch!==state.epoch||!state.ctx||c.user.id!==state.ctx.user.id||c.academia_id!==state.ctx.academia_id)throw new Error('A conta mudou durante a operação. Atualize a lista de alunos.');}
  async function run(key,statusId,task){
    if(state.busy[key])return;
    var epoch=state.epoch;state.busy[key]=true;var b=q('#'+key);if(b)b.disabled=true;updateSessionButtons();
    try{await task();}catch(err){if(epoch===state.epoch)status(statusId,errorMessage(err),'erro');}
    finally{if(epoch===state.epoch){state.busy[key]=false;if(b)b.disabled=false;updateSessionButtons();}}
  }
  function assertStudent(){if(!state.selected||!state.students.some(function(s){return s.id===state.selected.id;}))throw new Error('Selecione um aluno pela busca acima.');return state.selected.id;}
  function nav(key,n,title,subtitle){return '<button type="button" role="tab" id="ptProTab-'+key+'" data-ptpro-tab="'+key+'" aria-controls="ptProPanel-'+key+'" aria-selected="'+(key==='presencial')+'" tabindex="'+(key==='presencial'?0:-1)+'"'+(key==='presencial'?' class="ativa"':'')+'><b aria-hidden="true">'+n+'</b><div>'+title+'<span>'+subtitle+'</span></div></button>';}
  function panel(key,content){return '<section class="ptpro-view'+(key==='presencial'?' ativa':'')+'" id="ptProPanel-'+key+'" data-ptpro-view="'+key+'" role="tabpanel" aria-labelledby="ptProTab-'+key+'">'+content+'</section>';}
  function markup(){return '<section class="ptpro-shell" role="dialog" aria-modal="true" aria-labelledby="ptProTitle">'+
    '<header class="ptpro-top"><div class="ptpro-brand"><small>Personal / Central Pro</small><h2 id="ptProTitle">Central Pro</h2><p>Atendimento, agenda e equipe no mesmo lugar.</p></div><button class="ptpro-close" id="ptProClose" type="button" aria-label="Voltar ao Personal">'+icon('back')+'<span>Voltar ao Personal</span></button></header>'+
    '<div class="ptpro-layout"><nav class="ptpro-nav" role="tablist" aria-label="Central Pro">'+
    nav('import','1','Importar ficha','Arquivo e revisão')+nav('presencial','2','Modo presencial','Atendimento')+nav('automacoes','3','Automações','Regras e providências')+nav('agenda','4','Agenda inteligente','Espera e créditos')+nav('equipe','5','Equipe','Responsáveis')+'</nav>'+
    '<main class="ptpro-main"><div class="ptpro-student-picker"><label class="ptpro-search" for="ptProStudentSearch">'+icon('search')+'<input id="ptProStudentSearch" type="search" role="combobox" autocomplete="off" aria-autocomplete="list" aria-expanded="false" aria-controls="ptProStudentResults" aria-label="Buscar aluno por nome ou telefone" placeholder="Buscar aluno por nome ou telefone"><button type="button" class="ptpro-link" id="ptProClearStudent" aria-label="Limpar aluno selecionado" hidden>×</button></label><div class="ptpro-student-results" id="ptProStudentResults" role="listbox" aria-label="Alunos" hidden></div><div class="ptpro-row"><p id="ptProStudentStatus" class="ptpro-status" role="status"></p><button class="ptpro-link" id="ptProRetryStudents" type="button" hidden>Tentar novamente</button></div></div>'+
    '<div id="ptProSelectedStudent"></div>'+viewPresencial()+viewImport()+viewAutomacoes()+viewAgenda()+viewEquipe()+'</main></div></section>';}
  function viewPresencial(){return panel('presencial',hiddenStudent('ptProSessAluno')+
    '<div class="ptpro-workspace"><div class="ptpro-workout"><div class="ptpro-workout-toolbar"><div class="ptpro-workout-picker"><label for="ptProWorkout">Treino do atendimento</label><select id="ptProWorkout" aria-label="Treino do atendimento"><option value="">Selecione um aluno</option></select><p id="ptProWorkoutHint" class="ptpro-muted"></p></div><button type="button" class="ptpro-btn" id="ptProSessStart" disabled>'+icon('play')+' Começar sessão</button></div>'+
    '<div class="ptpro-table-head ptpro-exercise-row" aria-hidden="true"><span></span><span>Exercício</span><span>Prescrição</span><span>Última carga</span><span></span></div><div id="ptProSets" class="ptpro-session"></div>'+
    '<div class="ptpro-row"><button id="ptProAddSet" type="button" class="ptpro-link" disabled>+ Adicionar exercício</button></div>'+
    field('Observações da sessão','<textarea id="ptProSessObs" maxlength="4000" placeholder="Anote algo importante sobre o atendimento…" disabled></textarea>')+
    '<div class="ptpro-session-summary"><p id="ptProSessStatus" class="ptpro-status" role="status"></p><div class="ptpro-row"><button id="ptProSessSave" type="button" class="ptpro-btn sec" disabled>Salvar rascunho</button><button id="ptProSessFinish" type="button" class="ptpro-btn" disabled>Finalizar e salvar</button></div></div></div>'+
    '<aside id="ptProContext" class="ptpro-context" aria-label="Contexto do atendimento"><h3>Para este atendimento</h3>'+empty('Selecione um aluno para ver o acompanhamento.')+'</aside></div>');}
  function viewImport(){return panel('import','<div class="ptpro-head"><div><h3>Importar ficha</h3><p>Confira e ajuste o arquivo antes de salvar um rascunho.</p></div></div>'+hiddenStudent('ptProImportAluno')+
    '<div class="ptpro-grid"><div class="ptpro-card full"><div class="ptpro-drop">'+field('Arquivo da ficha','<input id="ptProFile" type="file" accept=".csv,.json,.txt,.xlsx,.xls,.pdf">')+'<p class="ptpro-muted">CSV, JSON ou texto. PDF e Excel dependem dos leitores disponíveis neste aparelho.</p></div><div id="ptProImportPreview" class="ptpro-preview" hidden></div><div class="ptpro-row"><p id="ptProImportTarget" class="ptpro-muted">Rascunho sem aluno vinculado.</p><button id="ptProImportSave" class="ptpro-btn" type="button" disabled>Salvar importação</button></div><p id="ptProImportStatus" class="ptpro-status" role="status"></p></div></div>');}
  function viewAutomacoes(){return panel('automacoes','<div class="ptpro-head"><div><h3>Automações</h3><p>Organize as providências da equipe a partir dos eventos dos alunos.</p></div></div><div class="ptpro-grid"><div class="ptpro-card third"><h4>Nova regra</h4>'+
    field('Nome','<input id="ptProAutoNome" maxlength="160" placeholder="Ex.: Revisar novo questionário">')+
    field('Quando acontecer','<select id="ptProAutoGatilho">'+options(triggers)+'</select>')+
    field('Providência','<select id="ptProAutoAcao">'+options(actions)+'</select>')+
    '<button id="ptProAutoSave" class="ptpro-btn" type="button">Criar automação</button><p id="ptProAutoStatus" class="ptpro-status" role="status"></p></div><div class="ptpro-card ptpro-wide"><h4>Suas regras</h4><div id="ptProAutoList" class="ptpro-list"></div><div class="ptpro-workout-toolbar"><h4>Fila de providências</h4><select id="ptProQueueFilter" aria-label="Filtrar providências"><option value="pendente">Pendentes</option><option value="all">Todas</option><option value="concluida">Concluídas</option></select></div><div id="ptProQueueList" class="ptpro-list"></div></div></div>');}
  function viewAgenda(){return panel('agenda','<div class="ptpro-head"><div><h3>Agenda inteligente</h3><p>Organize encaixes e acompanhe o saldo de sessões do aluno.</p></div></div><div class="ptpro-grid"><div class="ptpro-card"><h4>Entrar na lista de espera</h4>'+hiddenStudent('ptProWaitAluno')+
    '<div class="ptpro-row">'+field('Data','<input id="ptProWaitDia" type="date">')+field('Horário','<input id="ptProWaitHora" type="time">')+'</div>'+
    '<button id="ptProWaitSave" class="ptpro-btn" type="button">Adicionar à espera</button><p id="ptProWaitStatus" class="ptpro-status" role="status"></p></div><div class="ptpro-card"><h4>Créditos de sessões</h4>'+hiddenStudent('ptProCredAluno')+
    field('Saldo disponível','<input id="ptProCredSaldo" type="number" min="0" max="100000" step="1" value="0">')+
    '<button id="ptProCredSave" class="ptpro-btn sec" type="button" disabled>Atualizar saldo</button><p id="ptProCredStatus" class="ptpro-status" role="status"></p></div><div class="ptpro-card full"><h4>Lista de espera</h4><div id="ptProWaitList" class="ptpro-list"></div></div></div>');}
  function viewEquipe(){return panel('equipe','<div class="ptpro-head"><div><h3>Equipe</h3><p>Defina quem acompanha cada aluno e quem pode substituí-lo.</p></div></div><div class="ptpro-grid"><div class="ptpro-card third"><h4>Responsáveis pelo aluno</h4>'+hiddenStudent('ptProTeamAluno')+
    field('Responsável','<select id="ptProResp"></select>')+field('Substituto','<select id="ptProSub"><option value="">Sem substituto</option></select>')+
    '<button id="ptProTeamSave" type="button" class="ptpro-btn">Salvar equipe</button><p id="ptProTeamStatus" class="ptpro-status" role="status"></p></div><div class="ptpro-card ptpro-wide"><h4>Alunos atribuídos</h4><div id="ptProTeamList" class="ptpro-list"></div></div></div>');}
  function options(values){return Object.keys(values).map(function(k){return '<option value="'+esc(k)+'">'+esc(values[k])+'</option>';}).join('');}

  function mount(){
    var menu=q('#abas');if(!menu||q('#ptProSuiteBtn'))return;
    var b=document.createElement('button');b.id='ptProSuiteBtn';b.type='button';b.innerHTML=icon('note')+'<span>Central Pro</span>';menu.appendChild(b);
    var backdrop=document.createElement('div');backdrop.id='ptProSuite';backdrop.className='ptpro-backdrop';backdrop.setAttribute('aria-hidden','true');backdrop.inert=true;backdrop.innerHTML=markup();document.body.appendChild(backdrop);
    bind();labelFields();renderExercises();b.addEventListener('click',open);
  }
  function bind(){
    q('#ptProClose').onclick=close;
    q('#ptProSuite').addEventListener('click',function(e){if(e.target===this)close();});
    q('#ptProSuite').addEventListener('keydown',function(e){
      if(e.key==='Escape'){if(!q('#ptProStudentResults').hidden){hideResults();q('#ptProStudentSearch').focus();}else close();e.preventDefault();}
      if(e.key==='Tab'){
        var list=qa('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary',this).filter(function(el){return el.tabIndex>=0&&el.getClientRects().length&&!el.closest('[hidden]');});
        if(list.length&&e.shiftKey&&document.activeElement===list[0]){e.preventDefault();list[list.length-1].focus();}
        else if(list.length&&!e.shiftKey&&document.activeElement===list[list.length-1]){e.preventDefault();list[0].focus();}
      }
    });
    qa('[data-ptpro-tab]').forEach(function(b){b.onclick=function(){tab(b.dataset.ptproTab);};});
    q('.ptpro-nav').addEventListener('keydown',function(e){
      var tabs=qa('[data-ptpro-tab]'),i=tabs.indexOf(document.activeElement);if(i<0||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;
      e.preventDefault();var n=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowLeft'||e.key==='ArrowUp'?-1:1)+tabs.length)%tabs.length;tabs[n].click();tabs[n].focus();
    });
    var search=q('#ptProStudentSearch');
    search.addEventListener('input',showResults);search.addEventListener('focus',showResults);
    search.addEventListener('keydown',function(e){if(e.key==='ArrowDown'){e.preventDefault();showResults();var first=q('[data-ptpro-student]');if(first)first.focus();}});
    q('#ptProStudentResults').addEventListener('click',function(e){var b=e.target.closest('[data-ptpro-student]');if(b)selectStudent(b.dataset.ptproStudent);});
    q('#ptProStudentResults').addEventListener('keydown',function(e){
      var buttons=qa('[data-ptpro-student]',this),i=buttons.indexOf(document.activeElement);
      if((e.key==='ArrowDown'||e.key==='ArrowUp')&&buttons.length){e.preventDefault();buttons[(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();}
    });
    q('#ptProSuite').addEventListener('click',function(e){if(!e.target.closest('.ptpro-student-picker'))hideResults();});
    q('#ptProClearStudent').onclick=function(){selectStudent('');search.value='';search.focus();};
    q('#ptProRetryStudents').onclick=loadStudents;
    q('#ptProWorkout').onchange=function(){chooseWorkout(this.value);};
    q('#ptProFile').onchange=onFile;q('#ptProImportSave').onclick=saveImport;
    q('#ptProSessStart').onclick=startSession;q('#ptProAddSet').onclick=addSet;
    q('#ptProSessSave').onclick=function(){saveSession(false);};q('#ptProSessFinish').onclick=function(){saveSession(true);};
    q('#ptProSets').addEventListener('change',captureSets);q('#ptProSets').addEventListener('input',captureSets);
    q('#ptProSessObs').addEventListener('input',function(){if(state.session){state.session.dirty=true;updateSessionSummary();}});
    q('#ptProAutoSave').onclick=saveAuto;q('#ptProQueueFilter').onchange=renderQueue;
    q('#ptProWaitSave').onclick=saveWait;q('#ptProCredSave').onclick=saveCredit;q('#ptProTeamSave').onclick=saveTeam;
    q('#ptProAutoList').addEventListener('click',function(e){var b=e.target.closest('[data-auto-toggle]');if(b)toggleAuto(b);});
    q('#ptProQueueList').addEventListener('click',function(e){var b=e.target.closest('[data-queue-done]');if(b)completeQueue(b);});
  }
  function open(){
    var back=q('#ptProSuite');if(back.classList.contains('aberta'))return;
    state.returnFocus=document.activeElement;back.classList.add('aberta');back.setAttribute('aria-hidden','false');back.inert=false;
    state.inert=Array.from(document.body.children).filter(function(e){return e!==back;}).map(function(e){var old=e.inert;e.inert=true;return {el:e,value:old};});
    document.body.classList.add('ptpro-open');q('#ptProClose').focus();
    if(!state.session)loadStudents();refresh(currentTab());
    fitSidebar();
  }
  function close(){
    var back=q('#ptProSuite');if(!back.classList.contains('aberta'))return;
    hideResults();back.classList.remove('aberta');back.setAttribute('aria-hidden','true');back.inert=true;
    document.body.classList.remove('ptpro-open');state.inert.forEach(function(x){x.el.inert=x.value;});state.inert=[];
    var target=state.returnFocus&&state.returnFocus.isConnected?state.returnFocus:q('#ptProSuiteBtn');if(target)target.focus();
  }
  function fitSidebar(){
    var menu=q('#abas'),back=q('#ptProSuite'),rect=menu&&menu.getBoundingClientRect();
    var inset=document.documentElement.dataset.demo!=='central-pro'&&window.innerWidth>1000&&rect&&rect.width>100&&rect.width<350&&rect.left>=0?rect.right:0;
    back.style.setProperty('--ptpro-inset-inline-start',inset+'px');
  }
  function tab(key){
    var changed=currentTab()!==key;
    qa('[data-ptpro-tab]').forEach(function(b){var active=b.dataset.ptproTab===key;b.classList.toggle('ativa',active);b.setAttribute('aria-selected',active);b.tabIndex=active?0:-1;});
    qa('[data-ptpro-view]').forEach(function(v){v.classList.toggle('ativa',v.dataset.ptproView===key);});
    hideResults();if(changed)q('.ptpro-main').scrollTop=0;refresh(key);
  }
  function currentTab(){return q('[data-ptpro-tab].ativa').dataset.ptproTab;}
  function refresh(key){if(key==='automacoes')loadAutos();if(key==='agenda'){loadWait();loadCredit();}if(key==='equipe')loadTeam();}
  async function loadStudents(){
    var sequence=++state.loadSequence;status('ptProStudentStatus','Carregando seus alunos…');q('#ptProRetryStudents').hidden=true;
    try{
      var c=await context();if(!window.PTProContext)throw new Error('A lista de alunos não carregou. Atualize a página.');
      var data=await window.PTProContext.load({client:sb(),context:c});
      if(sequence!==state.loadSequence)return;
      if(data.available===false)throw new Error(data.reason||'Não foi possível carregar os alunos desta conta.');
      state.students=(data.students||[]).filter(function(s){return s&&s.id&&s.name;});state.loaded=true;
      status('ptProStudentStatus',state.students.length?'': 'Nenhum aluno disponível neste espaço de trabalho.');
      var selected=(state.selected&&state.selected.id)||data.selectedStudentId;
      if(selected&&state.students.some(function(s){return s.id===selected;}))await selectStudent(selected,false);
      else if(document.documentElement.dataset.demo==='central-pro'&&state.students.length)await selectStudent(state.students[0].id,false);
      else await selectStudent('',false);
    }catch(err){if(sequence===state.loadSequence){status('ptProStudentStatus',errorMessage(err),'erro');q('#ptProRetryStudents').hidden=false;}}
  }
  function showResults(){
    if(state.session)return;
    var value=normalize(q('#ptProStudentSearch').value),box=q('#ptProStudentResults');
    var matches=state.students.filter(function(s){return !value||normalize(s.name+' '+(s.phone||'')).includes(value)||text(s.phone).replace(/\D/g,'').includes(value.replace(/\D/g,''))&&/\d/.test(value);});
    box.innerHTML=matches.slice(0,30).map(function(s){return '<button class="ptpro-student-option" type="button" role="option" aria-selected="'+!!(state.selected&&state.selected.id===s.id)+'" data-ptpro-student="'+esc(s.id)+'">'+avatar(s)+'<span><strong>'+esc(s.name)+'</strong><small>'+esc(s.phone||'')+'</small></span></button>';}).join('')||empty(state.loaded?'Nenhum aluno encontrado.':'Aguarde a lista de alunos.');
    box.hidden=false;q('#ptProStudentSearch').setAttribute('aria-expanded','true');
  }
  function hideResults(){q('#ptProStudentResults').hidden=true;q('#ptProStudentSearch').setAttribute('aria-expanded','false');}
  async function selectStudent(value,focus){
    if(Object.keys(state.busy).some(function(k){return state.busy[k];}))return;
    if(state.session&&value!==state.session.aluno_id){status('ptProSessStatus','Finalize o atendimento atual antes de trocar de aluno.','erro');return;}
    var sequence=++state.selectionSequence;state.selected=state.students.find(function(s){return s.id===value;})||null;state.detail=state.selected;
    if(!state.session){q('#ptProSessObs').value='';status('ptProSessStatus','');state.detailLoading=false;}
    studentFields.forEach(function(f){q('#'+f).value=state.selected?state.selected.id:'';});
    q('#ptProStudentSearch').value=state.selected?state.selected.name:'';q('#ptProClearStudent').hidden=!state.selected;
    hideResults();renderStudent();if(!state.session)renderWorkouts();renderContext();
    q('#ptProImportTarget').textContent=state.selected?'Rascunho para '+state.selected.name+'.':'Rascunho sem aluno vinculado.';
    if(focus!==false)q('#ptProStudentSearch').focus();
    if(state.selected&&window.PTProContext.student){
      state.detailLoading=true;updateSessionButtons();
      try{var detail=await window.PTProContext.student(value,{client:sb(),context:state.ctx});if(sequence!==state.selectionSequence)return;if(detail){state.detail=detail;renderStudent();if(!state.session)renderWorkouts();renderContext();}}
      catch(err){if(sequence===state.selectionSequence)status('ptProStudentStatus','Aluno selecionado. '+errorMessage(err),'erro');}
      finally{if(sequence===state.selectionSequence){state.detailLoading=false;updateSessionButtons();}}
    }
    if(sequence===state.selectionSequence)refresh(currentTab());
  }
  function renderStudent(){
    var box=q('#ptProSelectedStudent'),s=state.detail||state.selected;
    box.innerHTML=s?'<div class="ptpro-student-header">'+avatar(s)+'<div class="ptpro-student-meta"><h3>'+esc(s.name)+'</h3><p>'+esc(s.subtitle||'Atendimento individual')+'</p></div><button id="ptProChangeStudent" type="button" class="ptpro-link"'+(state.session?' disabled':'')+'>Trocar aluno</button></div>':'';
    var change=q('#ptProChangeStudent');if(change)change.onclick=function(){q('#ptProStudentSearch').value='';q('#ptProStudentSearch').focus();showResults();};
  }
  function renderWorkouts(){
    var s=state.detail||state.selected,workouts=s&&s.workouts||[],select=q('#ptProWorkout');
    var before=select.value;select.innerHTML=workouts.length?workouts.map(function(w){return '<option value="'+esc(w.id)+'">'+esc(w.name)+'</option>';}).join(''):'<option value="">'+(s?'Sessão livre':'Selecione um aluno')+'</option>';
    if(workouts.some(function(w){return w.id===before;}))select.value=before;
    chooseWorkout(select.value);
  }
  function chooseWorkout(value){
    if(state.session)return;
    var s=state.detail||state.selected,w=s&&(s.workouts||[]).find(function(x){return x.id===value;});
    state.exercises=copy(w&&w.exercises||[]).map(function(ex){return {id:id(),sourceId:ex.id||'',name:ex.name||'Exercício',lastLoad:ex.lastLoad,lastLoadDate:ex.lastLoadDate,sets:(ex.sets||[]).map(function(set){return {id:id(),reps:text(set.reps),load:text(set.load),rest:set.rest,done:false};})};});
    q('#ptProWorkoutHint').textContent=w?state.exercises.length+' exercícios · Treino prescrito carregado':s?'Sem ficha disponível. Você pode registrar uma sessão livre.':'';
    renderExercises();updateSessionButtons();
  }
  function prescription(ex){
    var reps=ex.sets.map(function(s){return text(s.reps);});
    return !reps.length?'Sem séries':reps.every(function(v){return v===reps[0];})?reps.length+' × '+(reps[0]||'—'):reps.join(' / ')+' reps';
  }
  function renderExercises(){
    var active=!!state.session,box=q('#ptProSets');
    box.innerHTML=state.exercises.length?state.exercises.map(function(ex,i){
      return '<details class="ptpro-exercise" data-exercise="'+esc(ex.id)+'"><summary class="ptpro-exercise-row"><span class="ptpro-exercise-number">'+(i+1)+'</span><span class="ptpro-exercise-name">'+esc(ex.name)+'</span><span class="ptpro-exercise-meta">'+esc(prescription(ex))+'</span><span class="ptpro-exercise-meta">'+(ex.lastLoad!=null&&ex.lastLoad!==''?esc(ex.lastLoad)+' kg':'—')+'</span><span aria-label="Ver séries">'+icon('edit')+'</span></summary><div class="ptpro-exercise-sets">'+ex.sets.map(function(set,j){return setRow(ex,set,j,active);}).join('')+
        (active?'<button type="button" class="ptpro-link" data-add-series="'+esc(ex.id)+'">+ Série</button>':'<p class="ptpro-muted">Comece a sessão para registrar as séries.</p>')+'</div></details>';
    }).join(''):empty(state.selected?'O atendimento está pronto para uma sessão livre.':'Busque um aluno para carregar o treino.');
    qa('[data-add-series]',box).forEach(function(b){b.onclick=function(){var ex=state.exercises.find(function(x){return x.id===b.dataset.addSeries;});var last=ex.sets[ex.sets.length-1]||{};ex.sets.push({id:id(),reps:last.reps||'',load:last.load||'',done:false});state.session.dirty=true;renderExercises();var d=qa('[data-exercise]').find(function(x){return x.dataset.exercise===ex.id;});if(d)d.open=true;};});
    qa('[data-remove-set]',box).forEach(function(b){b.onclick=function(){state.exercises.forEach(function(ex){ex.sets=ex.sets.filter(function(s){return s.id!==b.dataset.removeSet;});});state.exercises=state.exercises.filter(function(ex){return ex.sets.length;});state.session.dirty=true;renderExercises();updateSessionSummary();};});
    labelFields();updateSessionSummary();
  }
  function setRow(ex,set,i,active){
    return '<div class="ptpro-set" data-set="'+esc(set.id)+'">'+
      '<div class="ptpro-field ptpro-ex">'+(ex.manual?'<label>Exercício</label><input data-k="exercicio" maxlength="160" value="'+esc(ex.name==='Novo exercício'?'':ex.name)+'"'+(!active?' disabled':'')+'>':'<span class="ptpro-muted">'+(i+1)+'ª série</span><input type="hidden" data-k="exercicio" value="'+esc(ex.name)+'">')+'</div>'+
      field('Reps','<input data-k="reps" inputmode="decimal" maxlength="32" value="'+esc(set.reps)+'"'+(!active?' disabled':'')+'>')+
      field('Carga (kg)','<input data-k="carga" inputmode="decimal" maxlength="32" value="'+esc(set.load)+'"'+(!active?' disabled':'')+'>')+
      '<label class="ptpro-set-done"><input type="checkbox" data-k="done"'+(set.done?' checked':'')+(!active?' disabled':'')+'> Feita</label>'+
      (active?'<button type="button" data-remove-set="'+esc(set.id)+'" class="ptpro-link" aria-label="Remover série '+(i+1)+' de '+esc(ex.name)+'">×</button>':'')+'</div>';
  }
  function captureSets(){
    if(!state.session)return;
    qa('#ptProSets .ptpro-set').forEach(function(row){state.exercises.forEach(function(ex){var set=ex.sets.find(function(s){return s.id===row.dataset.set;});if(!set)return;set.reps=q('[data-k=reps]',row).value.trim();set.load=q('[data-k=carga]',row).value.trim();set.done=q('[data-k=done]',row).checked;if(ex.manual)ex.name=q('[data-k=exercicio]',row).value.trim()||'Novo exercício';});});
    state.session.dirty=true;updateSessionSummary();
  }
  function updateSessionSummary(){
    if(!state.session)return;
    var total=0,done=0;state.exercises.forEach(function(ex){ex.sets.forEach(function(s){total++;if(s.done)done++;});});
    if(!state.busy.ptProSessSave&&!state.busy.ptProSessFinish)status('ptProSessStatus',done+' de '+total+' séries marcadas'+(state.session.dirty?' · Alterações ainda não salvas.':' · Rascunho salvo.'),state.session.dirty?'':'ok');
  }
  function updateSessionButtons(){
    if(!q('#ptProSessStart'))return;
    var writing=Object.keys(state.busy).some(function(k){return state.busy[k];});
    q('#ptProSessStart').disabled=!state.selected||!!state.session||writing||!!state.detailLoading;
    q('#ptProSessStart').hidden=!!state.session;
    ['ptProAddSet','ptProSessSave','ptProSessFinish'].forEach(function(key){q('#'+key).disabled=!state.session||!!state.busy.ptProSessSave||!!state.busy.ptProSessFinish;});
    q('#ptProSessObs').disabled=!state.session||writing;q('#ptProWorkout').disabled=!!state.session||writing;
    q('#ptProStudentSearch').disabled=!!state.session||writing;q('#ptProClearStudent').disabled=!!state.session||writing;
    if(q('#ptProChangeStudent'))q('#ptProChangeStudent').disabled=!!state.session||writing;
    qa('#ptProSets input, #ptProSets button').forEach(function(el){el.disabled=!state.session||writing;});
    q('#ptProCredSave').disabled=!state.selected||!state.creditReady||!!state.busy.ptProCredSave;
  }
  function sessionData(){
    var done=[];state.exercises.forEach(function(ex){ex.sets.forEach(function(set,i){if(set.done)done.push({exercicio:ex.name,exercicio_id:ex.sourceId||ex.id,serie:i+1,reps:set.reps,carga:set.load});});});
    return Object.assign({},state.session&&state.session.savedData||{},{origem:'central_pro',observacao:q('#ptProSessObs').value.trim(),series:done,planejado:copy(state.exercises),ficha:{id:q('#ptProWorkout').value,nome:q('#ptProWorkout').selectedOptions[0].textContent}});
  }
  function centralSession(row){
    var data=row&&row.dados;
    // v830 gravava somente observacao + series, antes de existir o fluxo integrado.
    var legacy=data&&!data.origem&&Array.isArray(data.series)&&data.series.every(function(s){return s&&typeof s.exercicio==='string'&&['reps','carga'].every(function(k){return s[k]==null||typeof s[k]==='string'||typeof s[k]==='number';});});
    return !!data&&(data.origem==='central_pro'||legacy);
  }
  async function startSession(){return run('ptProSessStart','ptProSessStatus',async function(){
    if(state.session)return;
    var aluno=assertStudent(),c=await context();
    var existing=await sb().from('personal_sessoes').select('id,aluno_id,iniciado_em,dados').eq('academia_id',c.academia_id).eq('profissional_id',c.user.id).eq('aluno_id',aluno).eq('status','em_andamento').order('iniciado_em',{ascending:false}).limit(100);
    if(existing.error)throw existing.error;
    assertContext(c);
    var sessions=existing.data||[];
    if(sessions.some(function(row){return row.dados&&row.dados.origem==='fluxo_v833';}))throw new Error('Já existe uma sessão em andamento no atendimento integrado do Personal. Finalize por lá antes de continuar na Central Pro.');
    if(sessions.length>=100||sessions.some(function(row){return !centralSession(row);}))throw new Error('Já existe uma sessão em andamento em outro fluxo. Finalize no local em que começou antes de iniciar na Central Pro.');
    var data=sessions[0];
    if(!data){
      state.exercises.forEach(function(ex){ex.sets.forEach(function(set){set.done=false;});});
      q('#ptProSessObs').value='';
      var insert=await sb().from('personal_sessoes').insert({academia_id:c.academia_id,aluno_id:aluno,profissional_id:c.user.id,status:'em_andamento',dados:sessionData()}).select('id,iniciado_em,dados').single();
      if(insert.error)throw insert.error;assertContext(c);data=insert.data;
    }else{
      var saved=data.dados||{};
      if(Array.isArray(saved.planejado))state.exercises=copy(saved.planejado);
      else state.exercises=(saved.series||[]).map(function(s){return {id:id(),name:s.exercicio,manual:true,sets:[{id:id(),reps:text(s.reps),load:text(s.carga),done:true}]};});
      q('#ptProSessObs').value=saved.observacao||'';
      if(saved.ficha&&!Array.from(q('#ptProWorkout').options).some(function(o){return o.value===saved.ficha.id;})){var opt=new Option(saved.ficha.nome,saved.ficha.id);q('#ptProWorkout').appendChild(opt);}
      if(saved.ficha)q('#ptProWorkout').value=saved.ficha.id;
    }
    state.session={id:data.id,aluno_id:aluno,academia_id:c.academia_id,profissional_id:c.user.id,savedData:copy(data.dados||{}),dirty:false};
    renderExercises();updateSessionButtons();q('#ptProWorkoutHint').textContent='Sessão em andamento · Marque as séries realizadas';
    if(!state.exercises.length)addSet();
  });}
  function addSet(){
    if(!state.session)return;
    state.exercises.push({id:id(),name:'Novo exercício',manual:true,sets:[{id:id(),reps:'',load:'',done:false}]});state.session.dirty=true;
    renderExercises();var details=qa('#ptProSets details').pop();if(details){details.open=true;q('input[data-k=exercicio]',details).focus();}
  }
  async function saveSession(finish){return run(finish?'ptProSessFinish':'ptProSessSave','ptProSessStatus',async function(){
    if(!state.session)throw new Error('Comece a sessão primeiro.');
    var c=await context(),ses=state.session;if(!ses||ses.academia_id!==c.academia_id||ses.profissional_id!==c.user.id)throw new Error('A conta do atendimento mudou. Atualize a página.');
    captureSets();var data=sessionData();
    if(finish&&!data.series.length)throw new Error('Marque ao menos uma série realizada antes de finalizar.');
    if(data.series.some(function(s){return !s.exercicio||s.exercicio==='Novo exercício';}))throw new Error('Informe o nome dos exercícios marcados.');
    var payload={dados:data};if(finish){payload.status='concluida';payload.encerrado_em=new Date().toISOString();}
    var update=sb().from('personal_sessoes').update(payload).eq('id',ses.id).eq('academia_id',c.academia_id).eq('profissional_id',c.user.id).eq('status','em_andamento');
    if(ses.savedData.origem==='central_pro')update=update.eq('dados->>origem','central_pro');
    var r=await update.select('id');
    if(r.error)throw r.error;assertContext(c);if(!r.data||!r.data.length)throw new Error('A sessão mudou em outro acesso. Reabra o atendimento antes de salvar.');
    ses.savedData=copy(data);
    if(finish){state.session=null;renderExercises();q('#ptProWorkoutHint').textContent='Atendimento concluído';status('ptProSessStatus',data.series.length+' séries salvas com autoria do profissional.','ok');}
    else{state.session.dirty=false;status('ptProSessStatus','Rascunho salvo. Você pode retomar este atendimento.','ok');}
  });}

  function renderContext(){
    var s=state.detail||state.selected,box=q('#ptProContext');if(!s){box.innerHTML='<h3>Para este atendimento</h3>'+empty('Selecione um aluno para ver o acompanhamento.');return;}
    var check=s.checkin||{},nutrition=s.nutrition||{},next=s.nextSession||{};
    box.innerHTML='<h3>Para este atendimento</h3>'+
      contextSection('note','Último check-in',check.summary||'Nenhuma resposta disponível',check.date?formatDate(check.date):'',check.summary?'Ver respostas':'','checkin')+
      contextSection('leaf','Nutrição',Number.isFinite(nutrition.pendingReviews)?nutrition.pendingReviews+' refeições para revisar':nutrition.summary||'Acompanhamento alimentar',nutrition.pendingReviews!=null?'Registros do aluno':nutrition.detail||'','Abrir acompanhamento','nutrition')+
      contextSection('calendar','Próxima sessão',next.time||'Sem sessão agendada',[next.date?formatDate(next.date):'',next.studentName||'',next.workoutName||''].filter(Boolean).join(' · '),'Ver agenda','agenda');
    qa('[data-context-area]',box).forEach(function(b){b.onclick=async function(){
      var area=b.dataset.contextArea,opened=false;
      if(window.PTProContext.openArea)try{opened=await window.PTProContext.openArea({checkin:'questionarios',nutrition:'nutricao',agenda:'agenda'}[area],s.id,{client:sb(),context:state.ctx});}catch(err){status('ptProStudentStatus',errorMessage(err),'erro');}
      if(opened){close();return;}
      var details=q('.ptpro-context-detail',b.parentElement);
      if(details){details.remove();return;}
      details=document.createElement('div');details.className='ptpro-context-detail';
      var info=area==='checkin'?(check.details||check.summary):area==='nutrition'?(nutrition.details||nutrition.summary):next.workoutName;
      details.textContent=typeof info==='string'?info:info?JSON.stringify(info):area==='agenda'?'Acesse a Agenda do Personal para agendar uma sessão.':'Abra o perfil do aluno no Personal para consultar o acompanhamento completo.';
      b.parentElement.appendChild(details);
    };});
  }
  function contextSection(symbol,title,headline,sub,action,area){return '<section class="ptpro-context-section'+(area==='nutrition'?' ptpro-nutrition':'')+'">'+icon(symbol)+'<div><p class="ptpro-muted">'+esc(title)+'</p><h4>'+esc(headline)+'</h4>'+(sub?'<p class="ptpro-muted">'+esc(sub)+'</p>':'')+(action?'<button class="ptpro-link" type="button" data-context-area="'+area+'">'+esc(action)+' →</button>':'')+'</div></section>';}
  function formatDate(value){var d=new Date(/^\d{4}-\d{2}-\d{2}$/.test(value)?value+'T12:00:00':value);return Number.isNaN(d.getTime())?'':d.toLocaleDateString('pt-BR',{day:'2-digit',month:'short'});}

  function parseCSV(source){
    var rows=[],row=[],cell='',quote=false;
    var separator=source.split(/\r?\n/)[0].includes(';')&&!source.split(/\r?\n/)[0].includes(',')?';':',';
    for(var i=0;i<source.length;i++){var c=source[i],n=source[i+1];if(c==='"'){if(quote&&n==='"'){cell+='"';i++;}else quote=!quote;}else if(c===separator&&!quote){row.push(cell.trim());cell='';}else if((c==='\n'||c==='\r')&&!quote){if(c==='\r'&&n==='\n')i++;row.push(cell.trim());cell='';if(row.some(Boolean))rows.push(row);row=[];}else cell+=c;}
    if(quote)throw new Error('O CSV contém aspas sem fechamento. Revise o arquivo.');
    row.push(cell.trim());if(row.some(Boolean))rows.push(row);return rows;
  }
  function normalizeRows(raw){if(!raw||!raw.length)return [];if(Array.isArray(raw[0])){var keys=raw[0];return raw.slice(1).map(function(row){var o={};keys.forEach(function(k,i){Object.defineProperty(o,k||'coluna_'+(i+1),{value:row[i]||'',enumerable:true,writable:true,configurable:true});});return o;});}return raw;}
  async function parseFile(file){
    if(file.size>5*1024*1024)throw new Error('Escolha um arquivo de até 5 MB.');
    var ext=(file.name.split('.').pop()||'').toLowerCase(),rows;
    if(ext==='csv')rows=normalizeRows(parseCSV(await file.text()));
    else if(ext==='json'){var j=JSON.parse(await file.text());rows=Array.isArray(j)?j:[j];}
    else if(ext==='txt')rows=(await file.text()).split(/\r?\n/).filter(Boolean).map(function(line,i){return {linha:i+1,conteudo:line};});
    else if((ext==='xlsx'||ext==='xls')&&window.XLSX){var wb=window.XLSX.read(await file.arrayBuffer(),{type:'array'});rows=window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''});}
    else if(ext==='pdf'&&window.pdfjsLib){var pdf=await window.pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;rows=[];for(var n=1;n<=pdf.numPages;n++){var pg=await pdf.getPage(n),tx=await pg.getTextContent();rows.push({pagina:n,conteudo:tx.items.map(function(x){return x.str;}).join(' ')});}}
    else throw new Error(['pdf','xlsx','xls'].includes(ext)?'O leitor deste formato não está disponível. Exporte como CSV ou texto para importar.':'Formato não reconhecido.');
    if(rows.length>1000)throw new Error('Use arquivos com até 1.000 linhas por importação.');
    if(rows.some(function(r){return !r||typeof r!=='object'||Array.isArray(r);}))throw new Error('Cada linha deve conter um objeto com os dados do exercício.');
    return rows;
  }
  async function onFile(e){
    var file=e.target.files&&e.target.files[0],sequence=(state.fileSequence||0)+1;state.fileSequence=sequence;state.importRows=[];state.importSaved=false;q('#ptProImportSave').disabled=true;q('#ptProImportPreview').hidden=true;if(!file)return;
    status('ptProImportStatus','Lendo '+file.name+'…');
    try{var rows=await parseFile(file);if(sequence!==state.fileSequence)return;state.importRows=rows;renderPreview(rows);q('#ptProImportSave').disabled=!rows.length;status('ptProImportStatus',rows.length+' linha(s) pronta(s) para revisão.','ok');}
    catch(err){if(sequence===state.fileSequence)status('ptProImportStatus',errorMessage(err),'erro');}
  }
  function renderPreview(rows){
    var box=q('#ptProImportPreview');if(!rows.length){box.hidden=true;return;}
    var keys=Object.keys(rows[0]).slice(0,8);
    box.innerHTML='<table><caption>Prévia editável · '+rows.length+' linhas'+(rows.length>100?' · Exibindo as primeiras 100':'')+'</caption><thead><tr>'+keys.map(function(k){return '<th scope="col">'+esc(k)+'</th>';}).join('')+'</tr></thead><tbody>'+rows.slice(0,100).map(function(row,index){return '<tr>'+keys.map(function(k,col){var value=row[k];return '<td>'+(value&&typeof value==='object'?esc(JSON.stringify(value)):'<input aria-label="'+esc(k)+', linha '+(index+1)+'" data-import-row="'+index+'" data-import-col="'+col+'" value="'+esc(value)+'" maxlength="4000">')+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table>';
    box.hidden=false;box.oninput=function(e){var inp=e.target.closest('[data-import-row]');if(inp){state.importRows[Number(inp.dataset.importRow)][keys[Number(inp.dataset.importCol)]]=inp.value;state.importSaved=false;q('#ptProImportSave').disabled=false;}};
  }
  async function saveImport(){return run('ptProImportSave','ptProImportStatus',async function(){
    if(!state.importRows.length||state.importSaved)throw new Error('Escolha um arquivo novo ou revise os dados antes de salvar.');
    var file=q('#ptProFile').files[0],c=await context();
    var r=await sb().from('personal_importacoes').insert({academia_id:c.academia_id,autor_id:c.user.id,aluno_id:state.selected?assertStudent():null,origem:(file.name.split('.').pop()||'arquivo').toLowerCase(),nome_arquivo:file.name,status:'revisar',dados:{linhas:state.importRows}}).select('id').single();
    if(r.error)throw r.error;assertContext(c);state.importSaved=true;status('ptProImportStatus','Importação salva como rascunho para revisão.','ok');
  }).then(function(){q('#ptProImportSave').disabled=state.importSaved||!state.importRows.length;});}

  async function saveAuto(){return run('ptProAutoSave','ptProAutoStatus',async function(){
    var c=await context(),name=q('#ptProAutoNome').value.trim();if(!name)throw new Error('Dê um nome à automação.');
    var r=await sb().from('personal_automacoes').insert({academia_id:c.academia_id,autor_id:c.user.id,nome:name,gatilho:q('#ptProAutoGatilho').value,acao:{tipo:q('#ptProAutoAcao').value},condicao:{},ativa:true});
    if(r.error)throw r.error;assertContext(c);q('#ptProAutoNome').value='';status('ptProAutoStatus','Automação criada.','ok');await loadAutos();
  });}
  async function loadAutos(){
    var epoch=state.epoch;
    try{
      var c=await context(),cli=sb(),results=await Promise.all([
        cli.from('personal_automacoes').select('id,nome,gatilho,acao,ativa,criado_em').eq('academia_id',c.academia_id).order('criado_em',{ascending:false}).limit(50),
        cli.from('personal_automacao_fila').select('id,aluno_id,gatilho,acao,status,criado_em').eq('academia_id',c.academia_id).order('criado_em',{ascending:false}).limit(100)]);
      if(results[0].error)throw results[0].error;if(results[1].error)throw results[1].error;
      assertContext(c);
      q('#ptProAutoList').innerHTML=(results[0].data||[]).map(function(a){return item(a.nome,(triggers[a.gatilho]||'Evento')+' → '+(actions[(a.acao||{}).tipo]||'Providência'),a.ativa?'Ativa':'Pausada','<button type="button" class="ptpro-link" data-auto-toggle="'+esc(a.id)+'" data-active="'+a.ativa+'">'+(a.ativa?'Pausar':'Ativar')+'</button>');}).join('')||empty('Nenhuma regra criada.');
      state.queue=results[1].data||[];renderQueue();
    }catch(err){if(epoch===state.epoch)status('ptProAutoStatus',errorMessage(err),'erro');}
  }
  function renderQueue(){
    var filter=q('#ptProQueueFilter').value,list=(state.queue||[]).filter(function(r){return filter==='all'||r.status===filter;});
    q('#ptProQueueList').innerHTML=list.map(function(r){return item(studentName(r.aluno_id),(triggers[r.gatilho]||'Evento')+' · '+(actions[(r.acao||{}).tipo]||'Revisar aluno'),r.status==='pendente'?'Pendente':r.status==='concluida'?'Concluída':'Ignorada',r.status==='pendente'?'<button class="ptpro-link" type="button" data-queue-done="'+esc(r.id)+'">Marcar resolvida</button>':'');}).join('')||empty(filter==='pendente'?'Nenhuma providência pendente.':'Nenhuma providência neste filtro.');
  }
  async function toggleAuto(button){
    if(button.disabled)return;button.disabled=true;
    try{var c=await context(),r=await sb().from('personal_automacoes').update({ativa:button.dataset.active!=='true',atualizado_em:new Date().toISOString()}).eq('academia_id',c.academia_id).eq('id',button.dataset.autoToggle).select('id');if(r.error)throw r.error;if(!r.data.length)throw new Error('Regra indisponível. Atualize a lista.');await loadAutos();}
    catch(err){status('ptProAutoStatus',errorMessage(err),'erro');button.disabled=false;}
  }
  async function completeQueue(button){
    if(button.disabled)return;button.disabled=true;
    try{var c=await context(),r=await sb().from('personal_automacao_fila').update({status:'concluida',concluido_em:new Date().toISOString()}).eq('academia_id',c.academia_id).eq('id',button.dataset.queueDone).eq('status','pendente').select('id');if(r.error)throw r.error;if(!r.data.length)throw new Error('Esta providência já mudou. Atualize a lista.');await loadAutos();}
    catch(err){status('ptProAutoStatus',errorMessage(err),'erro');button.disabled=false;}
  }
  async function saveWait(){return run('ptProWaitSave','ptProWaitStatus',async function(){
    var al=assertStudent(),c=await context(),day=q('#ptProWaitDia').value,time=q('#ptProWaitHora').value;
    if(!day||!time)throw new Error('Informe aluno, data e hora.');
    var r=await sb().from('personal_lista_espera').insert({academia_id:c.academia_id,aluno_id:al,dia:day,hora:time,status:'aguardando'});
    if(r.error)throw r.error;assertContext(c);status('ptProWaitStatus','Aluno adicionado à lista de espera.','ok');await loadWait();
  });}
  async function loadCredit(){
    var sequence=state.selectionSequence;state.creditReady=false;q('#ptProCredSave').disabled=true;
    if(!state.selected){q('#ptProCredSaldo').value='0';status('ptProCredStatus','Selecione um aluno para consultar os créditos.');return;}
    q('#ptProCredSaldo').value='';status('ptProCredStatus','Consultando saldo…');
    try{var aluno=assertStudent(),c=await context(),r=await sb().from('personal_creditos').select('saldo').eq('academia_id',c.academia_id).eq('aluno_id',aluno).limit(1);
      if(sequence!==state.selectionSequence)return;if(r.error)throw r.error;assertContext(c);
      q('#ptProCredSaldo').value=r.data&&r.data[0]?r.data[0].saldo:0;state.creditReady=true;status('ptProCredStatus','Saldo de '+state.selected.name+'.');q('#ptProCredSave').disabled=false;
    }catch(err){if(sequence===state.selectionSequence)status('ptProCredStatus',errorMessage(err),'erro');}
  }
  async function saveCredit(){return run('ptProCredSave','ptProCredStatus',async function(){
    var aluno=assertStudent(),c=await context(),saldo=Number(q('#ptProCredSaldo').value);
    if(!state.creditReady||q('#ptProCredSaldo').value.trim()===''||!Number.isInteger(saldo)||saldo<0||saldo>100000)throw new Error('Informe um saldo inteiro e válido.');
    var r=await sb().from('personal_creditos').upsert({academia_id:c.academia_id,aluno_id:aluno,saldo:saldo,atualizado_em:new Date().toISOString()},{onConflict:'academia_id,aluno_id'});
    if(r.error)throw r.error;assertContext(c);status('ptProCredStatus','Saldo atualizado.','ok');
  });}
  async function loadWait(){
    var epoch=state.epoch;
    try{var c=await context(),r=await sb().from('personal_lista_espera').select('id,aluno_id,dia,hora,status,criado_em').eq('academia_id',c.academia_id).eq('status','aguardando').order('dia').order('hora').limit(100);
      if(r.error)throw r.error;assertContext(c);q('#ptProWaitList').innerHTML=(r.data||[]).map(function(x){return item(studentName(x.aluno_id),formatDate(x.dia)+' · '+text(x.hora).slice(0,5),'Aguardando');}).join('')||empty('Lista de espera vazia.');
    }catch(err){if(epoch===state.epoch)status('ptProWaitStatus',errorMessage(err),'erro');}
  }
  async function loadTeam(){
    var sequence=state.selectionSequence;
    try{
      var c=await context(),results=await Promise.all([sb().from('membros').select('user_id,nome,email,papel').eq('academia_id',c.academia_id).order('nome'),
        sb().from('personal_aluno_equipe').select('aluno_id,responsavel_id,substituto_id,atualizado_em').eq('academia_id',c.academia_id).order('atualizado_em',{ascending:false}).limit(100)]);
      if(sequence!==state.selectionSequence)return;if(results[0].error)throw results[0].error;if(results[1].error)throw results[1].error;
      assertContext(c);
      state.members=results[0].data||[];var names={},opts=state.members.map(function(m){names[m.user_id]=m.nome||m.email||'Profissional';return '<option value="'+esc(m.user_id)+'">'+esc(names[m.user_id])+'</option>';}).join('');
      q('#ptProResp').innerHTML='<option value="">Escolha o responsável</option>'+opts;q('#ptProSub').innerHTML='<option value="">Sem substituto</option>'+opts;
      var list=results[1].data||[],current=list.find(function(r){return state.selected&&r.aluno_id===state.selected.id;});
      if(current){q('#ptProResp').value=current.responsavel_id;q('#ptProSub').value=current.substituto_id||'';}
      q('#ptProTeamList').innerHTML=list.map(function(r){return item(studentName(r.aluno_id),'Responsável: '+(names[r.responsavel_id]||'Membro indisponível')+(r.substituto_id?' · Substituto: '+(names[r.substituto_id]||'Membro indisponível'):''),'Equipe');}).join('')||empty('Nenhum aluno atribuído.');
    }catch(err){if(sequence===state.selectionSequence)status('ptProTeamStatus',errorMessage(err),'erro');}
  }
  async function saveTeam(){return run('ptProTeamSave','ptProTeamStatus',async function(){
    var aluno=assertStudent(),c=await context(),resp=q('#ptProResp').value,sub=q('#ptProSub').value||null;
    if(!resp)throw new Error('Escolha o responsável.');if(resp===sub)throw new Error('Responsável e substituto precisam ser pessoas diferentes.');
    if(!state.members.some(function(m){return m.user_id===resp;})||sub&&!state.members.some(function(m){return m.user_id===sub;}))throw new Error('Escolha membros disponíveis da equipe.');
    var r=await sb().from('personal_aluno_equipe').upsert({academia_id:c.academia_id,aluno_id:aluno,responsavel_id:resp,substituto_id:sub,atualizado_em:new Date().toISOString()},{onConflict:'academia_id,aluno_id'});
    if(r.error)throw r.error;assertContext(c);status('ptProTeamStatus','Equipe do aluno atualizada.','ok');await loadTeam();
  });}
  function item(title,sub,badge,button){return '<div class="ptpro-item"><div><strong>'+esc(title)+'</strong><small>'+esc(sub)+'</small></div><div class="ptpro-row"><span class="ptpro-badge">'+esc(badge)+'</span>'+(button||'')+'</div></div>';}

  function load(){
    if(q('#ptProSuiteBtn'))return;
    if(!q('link[href="assets/personal-pro-suite.css"]')){var link=document.createElement('link');link.rel='stylesheet';link.href='assets/personal-pro-suite.css';document.head.appendChild(link);}
    mount();
    window.addEventListener('resize',function(){if(q('#ptProSuite.aberta'))fitSidebar();});
    window.addEventListener('mt:conta-divergente',clearIdentity);
    window.addEventListener('beforeunload',function(event){if(state.session&&state.session.dirty){event.preventDefault();event.returnValue='';}});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load);else load();
})();
