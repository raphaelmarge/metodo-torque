/* Torque Personal — Central Pro v830
 * Cinco fluxos aditivos: importar ficha, atendimento presencial, automações,
 * lista de espera/créditos e equipe. Não substitui rotas ou stores existentes.
 */
(function(){
  'use strict';
  if(window.__PT_PRO_SUITE__) return;
  window.__PT_PRO_SUITE__={version:'v830'};

  var state={sb:null,ctx:null,importRows:[],session:null,members:[]};
  function q(s,r){return (r||document).querySelector(s)}
  function qa(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function uid(){return (crypto&&crypto.randomUUID)?crypto.randomUUID():('ptp-'+Date.now()+'-'+Math.random().toString(16).slice(2))}
  function status(id,msg,kind){var e=q('#'+id);if(!e)return;e.textContent=msg||'';e.className='ptpro-status'+(kind?' '+kind:'')}
  function nowBR(){try{return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date())}catch(e){return new Date().toLocaleString()}}
  function sb(){return state.sb||window.MT_supabase||null}
  async function context(){
    if(state.ctx) return state.ctx;
    var cli=sb();
    if(!cli) throw new Error('Conecte sua conta para usar os recursos em nuvem.');
    state.sb=cli;
    var ses=await cli.auth.getSession();
    var user=ses&&ses.data&&ses.data.session&&ses.data.session.user;
    if(!user) throw new Error('Sessão não encontrada. Entre novamente na sua conta.');
    var r=await cli.from('membros').select('academia_id,user_id,papel,nome,email').eq('user_id',user.id).limit(1);
    if(r.error) throw r.error;
    if(!r.data||!r.data.length) throw new Error('Sua conta não está vinculada a uma academia.');
    state.ctx={user:user,academia_id:r.data[0].academia_id,membro:r.data[0]};
    return state.ctx;
  }
  async function loadMembers(){
    var c=await context(),cli=sb();
    var r=await cli.from('membros').select('user_id,nome,email,papel').eq('academia_id',c.academia_id).order('nome');
    if(r.error) throw r.error;
    state.members=r.data||[];
    return state.members;
  }
  function guessAluno(){
    var n=q('[data-aluno-id].ativa')||q('#vPerfil [data-aluno-id]')||q('#vPerfil [data-id-aluno]');
    if(n) return n.getAttribute('data-aluno-id')||n.getAttribute('data-id-aluno')||'';
    return '';
  }
  function mount(){
    var menu=q('#abas'); if(!menu||q('#ptProSuiteBtn')) return;
    var btn=document.createElement('button');
    btn.id='ptProSuiteBtn';btn.type='button';
    btn.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14"/><path d="M8 7h8M8 11h8M8 15h5"/></svg><span>Central Pro</span>';
    var place=menu.querySelector('.menu-cab');
    if(place&&place.parentNode) place.parentNode.appendChild(btn); else menu.appendChild(btn);
    var back=document.createElement('div'); back.className='ptpro-backdrop'; back.id='ptProSuite'; back.setAttribute('aria-hidden','true');
    back.innerHTML=markup(); document.body.appendChild(back);
    bind();
    btn.addEventListener('click',open);
  }
  function markup(){return ''+
   '<section class="ptpro-shell" role="dialog" aria-modal="true" aria-labelledby="ptProTitle">'+
    '<header class="ptpro-top"><div class="ptpro-brand"><small>Torque Personal</small><h2 id="ptProTitle">Central Pro</h2><p>Ferramentas avançadas sem mexer no que já funciona.</p></div><button class="ptpro-close" id="ptProClose" aria-label="Fechar">×</button></header>'+
    '<div class="ptpro-layout"><nav class="ptpro-nav" aria-label="Central Pro">'+
      nav('import','1','Importar ficha','PDF, planilha e texto')+nav('presencial','2','Modo presencial','Registre a sessão')+nav('automacoes','3','Automações','Questionários e jornadas')+nav('agenda','4','Agenda inteligente','Espera e créditos')+nav('equipe','5','Equipe','Responsável e substituto')+
    '</nav><main class="ptpro-main">'+
      viewImport()+viewPresencial()+viewAutomacoes()+viewAgenda()+viewEquipe()+
    '</main></div></section>'}
  function nav(id,n,t,s){return '<button type="button" data-ptpro-tab="'+id+'"'+(id==='import'?' class="ativa"':'')+'><b>'+n+'</b><div>'+t+'<span>'+s+'</span></div></button>'}
  function viewImport(){return '<section class="ptpro-view ativa" data-ptpro-view="import"><div class="ptpro-head"><div><h3>Importar ficha</h3><p>Transforme arquivos em uma prévia editável antes de levar qualquer coisa para o aluno.</p></div></div><div class="ptpro-grid"><div class="ptpro-card full"><div class="ptpro-drop"><input id="ptProFile" type="file" accept=".csv,.json,.txt,.xlsx,.xls,.pdf"><p class="ptpro-muted">CSV, JSON e texto funcionam sem dependências. PDF e Excel são lidos quando os parsers locais estiverem disponíveis.</p></div><div id="ptProImportPreview" class="ptpro-preview" hidden></div><div class="ptpro-row" style="margin-top:12px"><input id="ptProImportAluno" placeholder="ID do aluno (opcional)" style="min-height:44px;flex:1"><button class="ptpro-btn" id="ptProImportSave" disabled>Salvar importação</button></div><div id="ptProImportStatus" class="ptpro-status"></div></div></div></section>'}
  function viewPresencial(){return '<section class="ptpro-view" data-ptpro-view="presencial"><div class="ptpro-head"><div><h3>Modo presencial</h3><p>Abra uma sessão do aluno e registre o que foi feito, sem usar o celular dele.</p></div></div><div class="ptpro-grid"><div class="ptpro-card third"><div class="ptpro-field"><label>Aluno</label><input id="ptProSessAluno" placeholder="ID do aluno"></div><div class="ptpro-field"><label>Observação inicial</label><textarea id="ptProSessObs"></textarea></div><button class="ptpro-btn" id="ptProSessStart">Iniciar sessão</button><div id="ptProSessStatus" class="ptpro-status"></div></div><div class="ptpro-card" style="grid-column:span 8"><div class="ptpro-row" style="justify-content:space-between"><h4>Séries da sessão</h4><button class="ptpro-btn sec" id="ptProAddSet" disabled>+ Série</button></div><div id="ptProSets" class="ptpro-session"></div><div class="ptpro-row" style="margin-top:12px"><button class="ptpro-btn" id="ptProSessFinish" disabled>Finalizar e salvar</button></div></div></div></section>'}
  function viewAutomacoes(){return '<section class="ptpro-view" data-ptpro-view="automacoes"><div class="ptpro-head"><div><h3>Automações</h3><p>Uma resposta pode gerar uma providência para a equipe. Prescrição nunca é alterada automaticamente.</p></div></div><div class="ptpro-grid"><div class="ptpro-card third"><div class="ptpro-field"><label>Nome</label><input id="ptProAutoNome" placeholder="Ex.: Revisar disponibilidade"></div><div class="ptpro-field"><label>Gatilho</label><select id="ptProAutoGatilho"><option value="questionario.respondido">Questionário respondido</option><option value="aluno.novo">Novo aluno</option><option value="agenda.cancelada">Sessão cancelada</option></select></div><div class="ptpro-field"><label>Ação</label><select id="ptProAutoAcao"><option value="revisar_aluno">Criar tarefa de revisão</option><option value="contatar_aluno">Criar tarefa de contato</option><option value="revisar_planejamento">Revisar planejamento</option></select></div><button class="ptpro-btn" id="ptProAutoSave">Criar automação</button><div id="ptProAutoStatus" class="ptpro-status"></div></div><div class="ptpro-card" style="grid-column:span 8"><h4>Automações ativas</h4><div id="ptProAutoList" class="ptpro-list"></div><h4 style="margin-top:18px">Fila de providências</h4><div id="ptProQueueList" class="ptpro-list"></div></div></div></section>'}
  function viewAgenda(){return '<section class="ptpro-view" data-ptpro-view="agenda"><div class="ptpro-head"><div><h3>Agenda inteligente</h3><p>Lista de espera e saldo de sessões ficam juntos, sem alterar a agenda existente.</p></div></div><div class="ptpro-grid"><div class="ptpro-card"><h4>Entrar na lista de espera</h4><div class="ptpro-field"><label>Aluno</label><input id="ptProWaitAluno" placeholder="ID do aluno"></div><div class="ptpro-row"><div class="ptpro-field" style="flex:1"><label>Data</label><input id="ptProWaitDia" type="date"></div><div class="ptpro-field" style="flex:1"><label>Hora</label><input id="ptProWaitHora" type="time"></div></div><button class="ptpro-btn" id="ptProWaitSave">Adicionar</button><div id="ptProWaitStatus" class="ptpro-status"></div></div><div class="ptpro-card"><h4>Créditos de sessões</h4><div class="ptpro-field"><label>Aluno</label><input id="ptProCredAluno" placeholder="ID do aluno"></div><div class="ptpro-field"><label>Saldo</label><input id="ptProCredSaldo" type="number" min="0" step="1" value="0"></div><button class="ptpro-btn" id="ptProCredSave">Atualizar saldo</button><div id="ptProCredStatus" class="ptpro-status"></div></div><div class="ptpro-card full"><h4>Lista de espera</h4><div id="ptProWaitList" class="ptpro-list"></div></div></div></section>'}
  function viewEquipe(){return '<section class="ptpro-view" data-ptpro-view="equipe"><div class="ptpro-head"><div><h3>Equipe</h3><p>Defina quem responde pelo aluno e quem pode assumir como substituto autorizado.</p></div></div><div class="ptpro-grid"><div class="ptpro-card third"><div class="ptpro-field"><label>Aluno</label><input id="ptProTeamAluno" placeholder="ID do aluno"></div><div class="ptpro-field"><label>Responsável</label><select id="ptProResp"></select></div><div class="ptpro-field"><label>Substituto</label><select id="ptProSub"><option value="">Sem substituto</option></select></div><button class="ptpro-btn" id="ptProTeamSave">Salvar equipe</button><div id="ptProTeamStatus" class="ptpro-status"></div></div><div class="ptpro-card" style="grid-column:span 8"><h4>Alunos atribuídos</h4><div id="ptProTeamList" class="ptpro-list"></div></div></div></section>'}
  function bind(){
    q('#ptProClose').onclick=close;
    q('#ptProSuite').addEventListener('click',function(e){if(e.target.id==='ptProSuite')close()});
    document.addEventListener('keydown',function(e){if(e.key==='Escape'&&q('#ptProSuite').classList.contains('aberta'))close()});
    qa('[data-ptpro-tab]').forEach(function(b){b.onclick=function(){tab(b.dataset.ptproTab)}});
    q('#ptProFile').addEventListener('change',onFile);
    q('#ptProImportSave').onclick=saveImport;
    q('#ptProSessStart').onclick=startSession;q('#ptProAddSet').onclick=addSet;q('#ptProSessFinish').onclick=finishSession;
    q('#ptProAutoSave').onclick=saveAuto;
    q('#ptProWaitSave').onclick=saveWait;q('#ptProCredSave').onclick=saveCredit;
    q('#ptProTeamSave').onclick=saveTeam;
    ['ptProImportAluno','ptProSessAluno','ptProWaitAluno','ptProCredAluno','ptProTeamAluno'].forEach(function(id){var el=q('#'+id);if(el&&!el.value)el.value=guessAluno()});
  }
  function open(){var b=q('#ptProSuite');b.classList.add('aberta');b.setAttribute('aria-hidden','false');q('#ptProClose').focus();refreshCurrent()}
  function close(){var b=q('#ptProSuite');b.classList.remove('aberta');b.setAttribute('aria-hidden','true');q('#ptProSuiteBtn').focus()}
  function tab(id){qa('[data-ptpro-tab]').forEach(function(x){x.classList.toggle('ativa',x.dataset.ptproTab===id)});qa('[data-ptpro-view]').forEach(function(x){x.classList.toggle('ativa',x.dataset.ptproView===id)});refresh(id)}
  function currentTab(){var a=q('[data-ptpro-tab].ativa');return a?a.dataset.ptproTab:'import'}
  function refreshCurrent(){refresh(currentTab())}
  function refresh(id){if(id==='automacoes')loadAutos();if(id==='agenda')loadWait();if(id==='equipe')loadTeam()}

  function parseCSV(text){
    var rows=[],row=[],cell='',quote=false;
    for(var i=0;i<text.length;i++){var c=text[i],n=text[i+1];if(c==='"'){if(quote&&n==='"'){cell+='"';i++}else quote=!quote}else if(c===','&&!quote){row.push(cell.trim());cell=''}else if((c==='\n'||c==='\r')&&!quote){if(c==='\r'&&n==='\n')i++;row.push(cell.trim());cell='';if(row.some(Boolean))rows.push(row);row=[]}else cell+=c}
    row.push(cell.trim());if(row.some(Boolean))rows.push(row);return rows;
  }
  function normalizeRows(raw){
    if(!raw||!raw.length)return[];if(Array.isArray(raw[0])){var h=raw[0];return raw.slice(1).map(function(r){var o={};h.forEach(function(k,i){o[k||('coluna_'+(i+1))]=r[i]||''});return o})}return raw;
  }
  async function parseFile(file){
    var ext=(file.name.split('.').pop()||'').toLowerCase();
    if(ext==='csv')return normalizeRows(parseCSV(await file.text()));
    if(ext==='json'){var j=JSON.parse(await file.text());return Array.isArray(j)?j:[j]}
    if(ext==='txt'){return (await file.text()).split(/\r?\n/).filter(Boolean).map(function(l,i){return {linha:i+1,conteudo:l}})}
    if((ext==='xlsx'||ext==='xls')&&window.XLSX){var ab=await file.arrayBuffer(),wb=window.XLSX.read(ab,{type:'array'}),sh=wb.Sheets[wb.SheetNames[0]];return window.XLSX.utils.sheet_to_json(sh,{defval:''})}
    if(ext==='pdf'&&window.pdfjsLib){var p=await window.pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise,out=[];for(var n=1;n<=p.numPages;n++){var pg=await p.getPage(n),tx=await pg.getTextContent();out.push({pagina:n,conteudo:tx.items.map(function(x){return x.str}).join(' ')})}return out}
    throw new Error((ext==='pdf'||ext==='xlsx'||ext==='xls')?'O parser local deste formato ainda não está carregado nesta versão. Exporte como CSV ou texto para importar agora.':'Formato não reconhecido.');
  }
  async function onFile(e){
    var f=e.target.files&&e.target.files[0];state.importRows=[];q('#ptProImportSave').disabled=true;if(!f)return;
    status('ptProImportStatus','Lendo '+f.name+'…');
    try{var rows=await parseFile(f);state.importRows=rows;renderPreview(rows);q('#ptProImportSave').disabled=!rows.length;status('ptProImportStatus',rows.length+' linha(s) pronta(s) para revisão.','ok')}catch(err){q('#ptProImportPreview').hidden=true;status('ptProImportStatus',err.message,'erro')}
  }
  function renderPreview(rows){var box=q('#ptProImportPreview');if(!rows.length){box.hidden=true;return}var keys=Object.keys(rows[0]).slice(0,8),html='<table><thead><tr>'+keys.map(function(k){return'<th>'+esc(k)+'</th>'}).join('')+'</tr></thead><tbody>';rows.slice(0,25).forEach(function(r){html+='<tr>'+keys.map(function(k){return'<td>'+esc(typeof r[k]==='object'?JSON.stringify(r[k]):r[k])+'</td>'}).join('')+'</tr>'});html+='</tbody></table>';box.innerHTML=html;box.hidden=false}
  async function saveImport(){
    try{var c=await context(),f=q('#ptProFile').files[0],cli=sb();q('#ptProImportSave').disabled=true;var r=await cli.from('personal_importacoes').insert({academia_id:c.academia_id,autor_id:c.user.id,aluno_id:q('#ptProImportAluno').value.trim()||null,origem:(f.name.split('.').pop()||'arquivo').toLowerCase(),nome_arquivo:f.name,status:'revisar',dados:{linhas:state.importRows}}).select('id').single();if(r.error)throw r.error;status('ptProImportStatus','Importação salva como rascunho para revisão.','ok')}catch(err){status('ptProImportStatus',err.message,'erro')}finally{q('#ptProImportSave').disabled=!state.importRows.length}
  }

  async function startSession(){
    try{var aluno=q('#ptProSessAluno').value.trim();if(!aluno)throw new Error('Informe o aluno.');var c=await context(),r=await sb().from('personal_sessoes').insert({academia_id:c.academia_id,aluno_id:aluno,profissional_id:c.user.id,status:'em_andamento',dados:{observacao:q('#ptProSessObs').value.trim(),series:[]}}).select('id,iniciado_em').single();if(r.error)throw r.error;state.session={id:r.data.id,series:[]};q('#ptProAddSet').disabled=false;q('#ptProSessFinish').disabled=false;q('#ptProSets').innerHTML='';addSet();status('ptProSessStatus','Sessão iniciada às '+nowBR()+'.','ok')}catch(err){status('ptProSessStatus',err.message,'erro')}
  }
  function addSet(){if(!state.session)return;var id=uid(),d=document.createElement('div');d.className='ptpro-set';d.dataset.set=id;d.innerHTML='<div class="ptpro-field ptpro-ex"><label>Exercício</label><input data-k="exercicio"></div><div class="ptpro-field"><label>Reps</label><input data-k="reps" inputmode="numeric"></div><div class="ptpro-field"><label>Carga</label><input data-k="carga"></div><button class="ptpro-btn sec" type="button" aria-label="Remover série">×</button>';d.querySelector('button').onclick=function(){d.remove()};q('#ptProSets').appendChild(d)}
  async function finishSession(){try{if(!state.session)throw new Error('Inicie uma sessão primeiro.');var series=qa('#ptProSets .ptpro-set').map(function(d){return {exercicio:q('[data-k="exercicio"]',d).value.trim(),reps:q('[data-k="reps"]',d).value.trim(),carga:q('[data-k="carga"]',d).value.trim()}}).filter(function(x){return x.exercicio});var r=await sb().from('personal_sessoes').update({status:'concluida',encerrado_em:new Date().toISOString(),dados:{observacao:q('#ptProSessObs').value.trim(),series:series}}).eq('id',state.session.id);if(r.error)throw r.error;state.session=null;q('#ptProAddSet').disabled=true;q('#ptProSessFinish').disabled=true;status('ptProSessStatus','Sessão salva. O registro identifica que foi lançado pelo profissional.','ok')}catch(err){status('ptProSessStatus',err.message,'erro')}}

  async function saveAuto(){try{var c=await context(),nome=q('#ptProAutoNome').value.trim();if(!nome)throw new Error('Dê um nome à automação.');var r=await sb().from('personal_automacoes').insert({academia_id:c.academia_id,autor_id:c.user.id,nome:nome,gatilho:q('#ptProAutoGatilho').value,acao:{tipo:q('#ptProAutoAcao').value},condicao:{},ativa:true});if(r.error)throw r.error;q('#ptProAutoNome').value='';status('ptProAutoStatus','Automação criada.','ok');loadAutos()}catch(err){status('ptProAutoStatus',err.message,'erro')}}
  async function loadAutos(){try{var c=await context(),cli=sb(),a=await cli.from('personal_automacoes').select('id,nome,gatilho,acao,ativa,criado_em').eq('academia_id',c.academia_id).order('criado_em',{ascending:false}).limit(50),f=await cli.from('personal_automacao_fila').select('id,aluno_id,gatilho,acao,status,criado_em').eq('academia_id',c.academia_id).order('criado_em',{ascending:false}).limit(30);if(a.error)throw a.error;if(f.error)throw f.error;q('#ptProAutoList').innerHTML=(a.data||[]).map(function(x){return item(x.nome,x.gatilho+' · '+((x.acao||{}).tipo||'ação'),x.ativa?'ativa':'pausada')}).join('')||'<p class="ptpro-muted">Nenhuma automação criada.</p>';q('#ptProQueueList').innerHTML=(f.data||[]).map(function(x){return item(x.aluno_id||'Aluno',x.gatilho+' · '+((x.acao||{}).tipo||'ação'),x.status)}).join('')||'<p class="ptpro-muted">Nenhuma providência pendente.</p>'}catch(err){status('ptProAutoStatus',err.message,'erro')}}

  async function saveWait(){try{var c=await context(),al=q('#ptProWaitAluno').value.trim(),dia=q('#ptProWaitDia').value,h=q('#ptProWaitHora').value;if(!al||!dia||!h)throw new Error('Informe aluno, data e hora.');var r=await sb().from('personal_lista_espera').insert({academia_id:c.academia_id,aluno_id:al,dia:dia,hora:h,status:'aguardando'});if(r.error)throw r.error;status('ptProWaitStatus','Aluno adicionado à lista de espera.','ok');loadWait()}catch(err){status('ptProWaitStatus',err.message,'erro')}}
  async function saveCredit(){try{var c=await context(),al=q('#ptProCredAluno').value.trim(),saldo=Number(q('#ptProCredSaldo').value);if(!al||!Number.isFinite(saldo)||saldo<0)throw new Error('Informe aluno e saldo válido.');var r=await sb().from('personal_creditos').upsert({academia_id:c.academia_id,aluno_id:al,saldo:Math.floor(saldo),atualizado_em:new Date().toISOString()},{onConflict:'academia_id,aluno_id'});if(r.error)throw r.error;status('ptProCredStatus','Saldo atualizado.','ok')}catch(err){status('ptProCredStatus',err.message,'erro')}}
  async function loadWait(){try{var c=await context(),r=await sb().from('personal_lista_espera').select('id,aluno_id,dia,hora,status,criado_em').eq('academia_id',c.academia_id).eq('status','aguardando').order('dia').order('hora').limit(50);if(r.error)throw r.error;q('#ptProWaitList').innerHTML=(r.data||[]).map(function(x){return item(x.aluno_id,x.dia+' · '+String(x.hora).slice(0,5),x.status)}).join('')||'<p class="ptpro-muted">Lista de espera vazia.</p>'}catch(err){status('ptProWaitStatus',err.message,'erro')}}

  async function loadTeam(){try{var c=await context(),m=await loadMembers(),opts=m.map(function(x){return '<option value="'+esc(x.user_id)+'">'+esc(x.nome||x.email||x.user_id)+(x.papel==='dono'?' · dono':'')+'</option>'}).join('');q('#ptProResp').innerHTML=opts;q('#ptProSub').innerHTML='<option value="">Sem substituto</option>'+opts;var r=await sb().from('personal_aluno_equipe').select('aluno_id,responsavel_id,substituto_id,atualizado_em').eq('academia_id',c.academia_id).order('atualizado_em',{ascending:false}).limit(100);if(r.error)throw r.error;var names={};m.forEach(function(x){names[x.user_id]=x.nome||x.email||x.user_id});q('#ptProTeamList').innerHTML=(r.data||[]).map(function(x){return item(x.aluno_id,'Responsável: '+(names[x.responsavel_id]||x.responsavel_id)+(x.substituto_id?' · substituto: '+(names[x.substituto_id]||x.substituto_id):''),'equipe')}).join('')||'<p class="ptpro-muted">Nenhum aluno atribuído.</p>'}catch(err){status('ptProTeamStatus',err.message,'erro')}}
  async function saveTeam(){try{var c=await context(),al=q('#ptProTeamAluno').value.trim(),resp=q('#ptProResp').value,sub=q('#ptProSub').value||null;if(!al||!resp)throw new Error('Informe o aluno e o responsável.');if(resp===sub)throw new Error('Responsável e substituto precisam ser pessoas diferentes.');var r=await sb().from('personal_aluno_equipe').upsert({academia_id:c.academia_id,aluno_id:al,responsavel_id:resp,substituto_id:sub,atualizado_em:new Date().toISOString()},{onConflict:'academia_id,aluno_id'});if(r.error)throw r.error;status('ptProTeamStatus','Equipe do aluno atualizada.','ok');loadTeam()}catch(err){status('ptProTeamStatus',err.message,'erro')}}
  function item(title,sub,badge){return '<div class="ptpro-item"><div><strong>'+esc(title)+'</strong><small>'+esc(sub)+'</small></div><span class="ptpro-badge '+(badge==='ativa'||badge==='equipe'?'ok':'')+'">'+esc(badge)+'</span></div>'}

  function load(){
    if(q('#ptProSuiteBtn'))return;
    if(!q('link[href="assets/personal-pro-suite.css"]')){var l=document.createElement('link');l.rel='stylesheet';l.href='assets/personal-pro-suite.css';document.head.appendChild(l)}
    mount();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load);else load();
})();
