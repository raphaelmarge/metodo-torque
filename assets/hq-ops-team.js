/* Cadastro administrativo de equipe. Nenhum usuario Auth, convite ou grant.
 * Dados reais somente por RPCs protegidas; previa explicita somente em memoria. */
(function (global) {
  'use strict';
  var ROLES = {admin:'Administrador',finance:'Financeiro',sales:'Vendas',support:'Suporte',engineering:'Engenharia',viewer:'Leitura'};
  var AREAS = {sales:'Comercial',customers:'Clientes',finance:'Financeiro',support:'Atendimento',health:'Saúde do produto',audit:'Auditoria',team:'Cadastro da equipe',reports:'Relatórios'};
  var REVIEW = {pending:'Revisão pendente',approved:'Proposta aprovada',rejected:'Proposta recusada'};
  var ACTIONS = {'team.create':'Cadastro criado','team.update':'Cadastro editado','team.setStatus':'Estado alterado','team.review':'Proposta revisada'};
  var mounts = new WeakMap();
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function uuid() { return global.crypto.randomUUID(); }
  function date(v) { var d = new Date(v); return v && Number.isFinite(d.getTime()) ? d.toLocaleString('pt-BR') : 'Não informada'; }
  function error(code,message) { var e=new Error(message);e.code=code;return e; }
  function forbidden(e) { return /42501|HQ403|401|403|PGRST301/.test(String(e && e.code)) || /forbidden|unauthorized|admin_required|session_required/i.test(String(e && e.message)); }
  function errorText(e) {
    if(forbidden(e)) return 'Seu acesso administrativo não foi confirmado. Nenhum cadastro está sendo exibido.';
    if(/PGRST202|42883|42P01/.test(String(e && e.code))) return 'Backend de equipe pendente neste ambiente. O cadastro estará disponível após a instalação e validação do contrato.';
    if(/40001|409|revision|version|conflict/.test(String(e && e.code)+' '+String(e && e.message))) return 'Este cadastro mudou desde a consulta. Atualize os dados e confira a nova versão antes de repetir.';
    if(/22023|400|422/.test(String(e && e.code))) return 'Confira os campos e o motivo. A operação não foi aceita pelo servidor.';
    return 'Não foi possível confirmar a operação. Atualize os dados antes de considerar a alteração salva. Para mudar os campos, feche esta janela e atualize antes de tentar novamente.';
  }
  function validRow(r) {
    return r && typeof r.id==='string' && typeof r.name==='string' && typeof r.contact==='string' &&
      Object.hasOwn(ROLES,r.proposedRole) && ['active','inactive'].includes(r.status) && Object.hasOwn(REVIEW,r.reviewStatus) &&
      ['accessPending','disabled'].includes(r.accessState) && r.effectiveAccess===false && Number.isSafeInteger(r.version) && r.version>0;
  }
  function validSnapshot(s,uid,demo) {
    return s && s.schemaVersion===1 && s.currentUserId===uid && Array.isArray(s.permissions) && s.permissions.includes('team.read') &&
      Array.isArray(s.team) && s.team.every(validRow) && Array.isArray(s.audit) && s.sources && s.sources.team &&
      s.sources.team.status==='ready' && s.sources.team.scope==='administrativeRegistryOnly' && s.meta &&
      s.meta.scope==='administrativeRegistryOnly' && s.meta.accessProvisioningAvailable===false &&
      (!demo || s.meta.synthetic===true);
  }
  function matrix(s) {
    var rows=s.meta.roleMatrix;
    if(s.meta.roleMatrixKind!=='referenceOnly' || !Array.isArray(rows) || !rows.length) return '<p class="hqt-empty">Matriz de referência indisponível nesta consulta.</p>';
    return '<div class="hqt-table-wrap" tabindex="0" aria-label="Matriz de referência dos perfis"><table class="hqt-table"><thead><tr><th>Perfil proposto</th><th>Visualizar</th><th>Editar</th><th>Aprovar</th></tr></thead><tbody>'+rows.filter(function(r){return Object.hasOwn(ROLES,r.role)&&Array.isArray(r.permissions)&&r.effectiveAccess===false;}).map(function(r){
      function permissions(suffix){return r.permissions.filter(function(p){return typeof p==='string'&&p.endsWith('.'+suffix);}).map(function(p){return AREAS[p.split('.')[0]]||p;}).join(', ')||'Nenhum nesta referência';}
      return '<tr><th scope="row">'+esc(ROLES[r.role])+'</th><td>'+esc(permissions('read'))+'</td><td>'+esc(permissions('write'))+'</td><td>'+esc(r.permissions.includes('team.review')?'Propostas de cadastro da equipe':'Nenhuma aprovação prevista')+'</td></tr>';
    }).join('')+'</tbody></table></div><p class="hqt-note">Referência dos perfis existentes. Esta matriz não concede permissões. Aprovar uma proposta de cadastro não aprova pagamentos nem libera acesso.</p>';
  }
  function createDemoClient(options) {
    options=options||{};var role='admin',now=options.now||'2026-09-30T15:00:00.000Z',uid='00000000-0000-4000-8000-000000009000';
    var rows=[],audit=[],operations=new Map();
    var roleMatrix=Object.keys(ROLES).map(function(r){return {role:r,permissions:((options.permissions||{})[r]||[]).concat(r==='admin'?['team.read','team.write','team.review']:[]),effectiveAccess:false};});
    return {__hqTeamDemo:true,setRole:function(r){role=r;},rpc:async function(name,args){
      if(role!=='admin')return {error:{code:'HQ403',message:'demo_admin_required'}};
      if(name==='hq_sou_admin')return {data:true};
      if(name==='hq_team_snapshot')return {data:{schemaVersion:1,currentUserId:uid,permissions:['team.read','team.write','team.review'],team:clone(rows).sort(function(a,b){return a.name.localeCompare(b.name);}),audit:clone(audit).reverse(),sources:{team:{status:'ready',scope:'administrativeRegistryOnly',updatedAt:now}},meta:{scope:'administrativeRegistryOnly',auditLimit:100,auditHasMore:false,synthetic:true,accessProvisioningAvailable:false,staffGateEnabled:false,roleMatrixKind:'referenceOnly',roleMatrix:roleMatrix}}};
      if(name!=='hq_team_command')return {error:{code:'PGRST202',message:'unknown_demo_rpc'}};
      var c=args&&args.p_input,p=c&&c.payload;
      if(!c||!p||!ACTIONS[c.type]||typeof c.reason!=='string'||c.reason.trim().length<3||c.reason.length>500||typeof c.idempotencyKey!=='string')return {error:{code:'HQ400',message:'invalid_demo_command'}};
      var receipt=operations.get(c.idempotencyKey);if(receipt)return JSON.stringify(receipt.input)===JSON.stringify(c)?{data:Object.assign(clone(receipt.result),{replayed:true})}:{error:{code:'HQ409',message:'idempotency_conflict'}};
      var row=c.type==='team.create'?null:rows.find(function(r){return r.id===p.id;}),before=row?{proposedRole:row.proposedRole,status:row.status,reviewStatus:row.reviewStatus,version:row.version}:null;
      if(c.type!=='team.create'&&(!row||row.version!==p.expectedVersion))return {error:{code:'HQ409',message:'version_conflict'}};
      if(['team.create','team.update'].includes(c.type)) {
        if(typeof p.name!=='string'||p.name.trim().length<2||p.name.length>160||typeof p.contact!=='string'||p.contact.length>254||!Object.hasOwn(ROLES,p.proposedRole))return {error:{code:'HQ400',message:'invalid_demo_fields'}};
        if(row&&row.name===p.name.trim()&&row.contact===p.contact.trim()&&row.proposedRole===p.proposedRole)return {error:{code:'22023',message:'no_change'}};
        if(!row){row={id:uuid(),status:'active',createdAt:now,version:0,effectiveAccess:false};rows.push(row);}
        Object.assign(row,{name:p.name.trim(),contact:p.contact.trim(),proposedRole:p.proposedRole,reviewStatus:'pending',reviewedAt:null,reviewedBy:null});
      }else if(c.type==='team.setStatus') {
        if(row.status===p.status||!['active','inactive'].includes(p.status))return {error:{code:'HQ400',message:'invalid_status'}};
        row.status=p.status;if(p.status==='active'){row.reviewStatus='pending';row.reviewedAt=null;row.reviewedBy=null;}
      }else {
        if(row.status!=='active'||row.reviewStatus!=='pending'||!['approved','rejected'].includes(p.reviewStatus))return {error:{code:'HQ400',message:'invalid_review'}};
        row.reviewStatus=p.reviewStatus;row.reviewedAt=now;row.reviewedBy=uid;
      }
      row.version++;row.updatedAt=now;row.accessState=row.status==='inactive'?'disabled':'accessPending';
      audit.push({id:uuid(),actorId:uid,action:c.type,objectId:row.id,reason:c.reason,createdAt:now,changedFields:Object.keys(p).filter(function(k){return !['id','expectedVersion'].includes(k);}),before:before,after:{proposedRole:row.proposedRole,status:row.status,reviewStatus:row.reviewStatus,version:row.version}});
      var result={ok:true,id:row.id,type:c.type,member:clone(row),replayed:false,externalEffect:false,accessGranted:false};operations.set(c.idempotencyKey,{input:clone(c),result:result});return {data:clone(result)};
    }};
  }
  function mount(root,client,options) {
    options=options||{};unmount(root);var demo=options.demo===true,snapshot=null,generation=0,disposed=false,dialog=null,busy=false,timer=null,subscription=null,uid=null;
    if(!root)return {dispose:function(){}};
    function closeDialog(){if(dialog){dialog.remove();dialog=null;}}
    function clear(){generation++;snapshot=null;busy=false;closeDialog();root.replaceChildren();}
    function unavailable(message){root.innerHTML='<section class="hqt hq-card"><h2>Funcionários e equipe</h2><div class="hqt-empty" role="status">'+esc(message)+'</div><button class="hq-btn" data-hqt-action="reload">Tentar novamente</button></section>';}
    async function rpc(name,args){var result=await client.rpc(name,args);if(result&&result.error)throw result.error;if(!result||!Object.hasOwn(result,'data'))throw error('INVALID_RESPONSE','missing_data');return result.data;}
    async function currentUser(){if(demo)return '00000000-0000-4000-8000-000000009000';if(!client||!client.auth)throw error('HQ403','session_required');var result=client.auth.getUser?await client.auth.getUser():await client.auth.getSession();var user=result&&result.data&&(result.data.user||result.data.session&&result.data.session.user);if(result.error||!user||!user.id)throw error('HQ403','session_required');return user.id;}
    function can(p){return !!snapshot&&snapshot.permissions.includes(p);}
    async function load(){clear();var token=generation;root.innerHTML='<section class="hqt hq-card" role="status">Verificando acesso ao cadastro da equipe…</section>';
      try {
        if(!client||typeof client.rpc!=='function'||demo&&client.__hqTeamDemo!==true||!demo&&client.__hqTeamDemo===true)throw error('INVALID_CLIENT','invalid_client');
        var user=await currentUser();if(disposed||token!==generation)return;
        if(await rpc('hq_sou_admin')!==true)throw error('HQ403','hq_admin_required');if(disposed||token!==generation)return;
        var data=await rpc('hq_team_snapshot');if(disposed||token!==generation)return;
        if(await currentUser()!==user)throw error('HQ403','session_changed');if(disposed||token!==generation)return;
        if(!validSnapshot(data,user,demo))throw error('INVALID_SNAPSHOT','invalid_snapshot');
        uid=user;snapshot=data;render();
      }catch(e){if(disposed||token!==generation)return;clear();unavailable(errorText(e));}
    }
    function render(){
      var s=snapshot;root.innerHTML='<section class="hqt hq-card" aria-labelledby="hqtTitle">'+(demo?'<div class="hqt-demo"><strong>PRÉVIA LOCAL · CADASTROS FICTÍCIOS</strong><br>Use somente nomes e contatos de teste. Nada é enviado ou salvo fora desta sessão.</div>':'')+
        '<div class="hqt-head"><div><p class="hq-kicker">Administração</p><h2 id="hqtTitle">Funcionários e equipe</h2><p>Organize os cadastros, proponha perfis e registre a revisão administrativa.</p></div><div class="hqt-actions"><button class="hq-btn" data-hqt-action="reload">Atualizar equipe</button>'+(can('team.write')?'<button class="hq-btn primary" data-hqt-action="create">Cadastrar funcionário</button>':'')+'</div></div>'+
        '<div class="hqt-notice"><strong>Cadastro e acesso são etapas separadas.</strong> Cadastrar, aprovar ou inativar aqui não cria usuário, envia convite, concede ou revoga acesso. A gestão efetiva de acesso está indisponível neste fluxo.</div>'+
        '<div class="hqt-counts"><div><strong>'+s.team.length+'</strong><span>Cadastros</span></div><div><strong>'+s.team.filter(function(r){return r.status==='active';}).length+'</strong><span>Cadastros ativos</span></div><div><strong>'+s.team.filter(function(r){return r.status==='active'&&r.reviewStatus==='pending';}).length+'</strong><span>Propostas para revisar</span></div></div>'+
        (s.team.length?'<div class="hqt-table-wrap" tabindex="0" aria-label="Cadastros da equipe"><table class="hqt-table"><thead><tr><th>Funcionário</th><th>Perfil proposto</th><th>Cadastro</th><th>Revisão</th><th>Acesso efetivo</th><th>Ações</th></tr></thead><tbody>'+s.team.map(function(r){return '<tr><td><strong>'+esc(r.name)+'</strong><small>'+esc(r.contact||'Contato não informado')+'</small></td><td>'+esc(ROLES[r.proposedRole])+'</td><td>'+esc(r.status==='active'?'Ativo':'Inativo')+'</td><td>'+esc(REVIEW[r.reviewStatus])+'</td><td>Não concedido por este cadastro<small>'+esc(r.status==='active'?'Provisionamento pendente':'Cadastro inativo; acessos existentes não são alterados')+'</small></td><td><div class="hqt-actions">'+(can('team.write')?'<button class="hq-btn" data-hqt-action="edit" data-id="'+esc(r.id)+'">Editar</button><button class="hq-btn" data-hqt-action="status" data-id="'+esc(r.id)+'">'+(r.status==='active'?'Inativar':'Reativar')+'</button>':'')+(can('team.review')&&r.status==='active'&&r.reviewStatus==='pending'?'<button class="hq-btn" data-hqt-action="review" data-id="'+esc(r.id)+'">Revisar proposta</button>':'')+'</div></td></tr>';}).join('')+'</tbody></table></div>':'<div class="hqt-empty">Nenhum funcionário cadastrado nesta fonte. Comece cadastrando uma pessoa da equipe; isso não cria acesso.</div>')+
        '<details class="hqt-matrix"><summary>Matriz dos perfis: visualizar, editar e aprovar</summary>'+matrix(s)+'</details><details class="hqt-audit"><summary>Histórico dos cadastros ('+s.audit.length+')</summary>'+(s.audit.length?'<ol>'+s.audit.map(function(a){return '<li><strong>'+esc(ACTIONS[a.action]||'Alteração administrativa')+'</strong><span>'+esc(date(a.createdAt))+' · '+esc(a.actorId===uid?'Administrador desta sessão':a.actorId||'Responsável não informado')+'</span><p>'+esc(a.reason||'Motivo não informado')+'</p><small>Registro '+esc(a.objectId)+' · Versão '+esc(a.after&&a.after.version||'não informada')+'</small></li>';}).join('')+'</ol>':'<p>Nenhuma alteração registrada nesta fonte.</p>')+(s.meta.auditHasMore?'<p class="hqt-note">Exibindo as últimas '+esc(s.meta.auditLimit||100)+' alterações. Há registros anteriores fora desta consulta.</p>':'')+'</details><p class="hqt-note">Última consulta da fonte: '+esc(date(s.sources.team.updatedAt))+'. A revisão vale para o cadastro proposto.</p><p data-hqt-message role="status"></p></section>';
    }
    function openForm(action,row){if(!snapshot||busy)return;var permission=action==='review'?'team.review':'team.write';if(!can(permission)||action==='review'&&(!row||row.status!=='active'||row.reviewStatus!=='pending'))return;
      closeDialog();var type=({create:'team.create',edit:'team.update',status:'team.setStatus',review:'team.review'})[action],operation=uuid(),token=generation;
      dialog=document.createElement('dialog');dialog.className='hqt-dialog';dialog.setAttribute('aria-labelledby','hqtDialogTitle');
      var title=({create:'Cadastrar funcionário',edit:'Editar cadastro',status:row&&row.status==='active'?'Inativar cadastro':'Reativar cadastro',review:'Revisar proposta de perfil'})[action];
      var fields=action==='create'||action==='edit'?'<label>Nome<input name="name" minlength="2" maxlength="160" required autocomplete="off" value="'+esc(row&&row.name)+'"></label><label>Contato <small>Opcional; não será usado para enviar convite.</small><input name="contact" maxlength="254" autocomplete="off" value="'+esc(row&&row.contact)+'"></label><label>Perfil proposto<select name="proposedRole">'+Object.keys(ROLES).map(function(role){return '<option value="'+role+'"'+(role===(row&&row.proposedRole||'viewer')?' selected':'')+'>'+ROLES[role]+'</option>';}).join('')+'</select></label>':action==='review'?'<p>'+esc(row.name)+' · '+esc(ROLES[row.proposedRole])+'</p><label>Decisão sobre a proposta<select name="reviewStatus"><option value="approved">Aprovar proposta de cadastro</option><option value="rejected">Recusar proposta de cadastro</option></select></label>':'<p>'+esc(row.name)+'. '+(row.status==='active'?'A inativação afeta somente este cadastro. Ela não revoga permissões existentes.':'A reativação exige nova revisão da proposta e não libera acesso.')+'</p>';
      dialog.innerHTML='<h2 id="hqtDialogTitle">'+title+'</h2>'+(demo?'<p class="hqt-demo">Somente dados fictícios nesta prévia local.</p>':'')+'<p class="hqt-notice">Nenhum acesso ou convite será criado por esta operação.</p><form>'+fields+'<label>Motivo da alteração<textarea name="reason" minlength="3" maxlength="500" required rows="3"></textarea></label><p data-hqt-error role="alert"></p><div class="hqt-actions"><button type="button" class="hq-btn" data-hqt-cancel>Cancelar</button><button type="submit" class="hq-btn primary">'+(action==='review'?'Registrar revisão':'Salvar cadastro')+'</button></div></form>';
      document.body.appendChild(dialog);var currentDialog=dialog;dialog.querySelector('[data-hqt-cancel]').onclick=closeDialog;
      dialog.addEventListener('cancel',function(e){if(busy)e.preventDefault();});
      dialog.querySelector('form').onsubmit=async function(e){e.preventDefault();if(busy||token!==generation||!can(permission))return;var f=new FormData(e.target),payload={},reason=String(f.get('reason')||'').trim();
        if(reason.length<3||reason.length>500)return currentDialog.querySelector('[data-hqt-error]').textContent='Informe um motivo com 3 a 500 caracteres.';
        if(action==='create'||action==='edit'){payload={name:String(f.get('name')||'').trim(),contact:String(f.get('contact')||'').trim(),proposedRole:f.get('proposedRole')};if(payload.name.length<2||payload.name.length>160||payload.contact.length>254||!Object.hasOwn(ROLES,payload.proposedRole))return currentDialog.querySelector('[data-hqt-error]').textContent='Confira nome, contato e perfil proposto.';}
        if(row){payload.id=row.id;payload.expectedVersion=row.version;}if(action==='status')payload.status=row.status==='active'?'inactive':'active';if(action==='review')payload.reviewStatus=f.get('reviewStatus');
        busy=true;currentDialog.querySelectorAll('button,input,select,textarea').forEach(function(el){el.disabled=true;});
        try {
          if(await currentUser()!==uid||await rpc('hq_sou_admin')!==true)throw error('HQ403','hq_admin_required');if(disposed||token!==generation)return;
          var result=await rpc('hq_team_command',{p_input:{type:type,payload:payload,reason:reason,idempotencyKey:operation}});
          if(disposed||token!==generation)return;if(await currentUser()!==uid)throw error('HQ403','session_changed');if(disposed||token!==generation)return;
          if(!result||result.ok!==true||result.externalEffect!==false||result.accessGranted!==false||result.type!==type||!validRow(result.member))throw error('INVALID_RESPONSE','invalid_command_result');
          var commandUser=uid;closeDialog();await load();var message=root.querySelector('[data-hqt-message]');if(message&&snapshot&&snapshot.currentUserId===commandUser)message.textContent='Cadastro atualizado. Nenhum acesso foi concedido por esta operação.';
        }catch(err){if(disposed||token!==generation)return;if(forbidden(err)){clear();unavailable(errorText(err));}else if(currentDialog.isConnected)currentDialog.querySelector('[data-hqt-error]').textContent=errorText(err);}
        finally{if(token===generation){busy=false;if(currentDialog.isConnected)currentDialog.querySelectorAll('button,input,select,textarea').forEach(function(el){el.disabled=false;});}}
      };dialog.showModal();
    }
    function onClick(e){var b=e.target.closest('[data-hqt-action]');if(!b||!root.contains(b))return;var action=b.dataset.hqtAction;if(action==='reload')return load();var row=snapshot&&snapshot.team.find(function(r){return r.id===b.dataset.id;});if(action==='create'||row)openForm(action,row);}
    root.addEventListener('click',onClick);
    if(!demo&&client&&client.auth&&client.auth.onAuthStateChange)subscription=client.auth.onAuthStateChange(function(event,session){
      if(disposed)return;
      if(!['SIGNED_OUT','USER_DELETED','SIGNED_IN','TOKEN_REFRESHED','USER_UPDATED'].includes(event))return;
      clear();if(timer)clearTimeout(timer);if(event==='SIGNED_OUT'||event==='USER_DELETED'){unavailable('Sessão encerrada. Os cadastros foram removidos desta tela.');return;}
      root.innerHTML='<section class="hqt hq-card" role="status">Verificando novamente o acesso à equipe…</section>';
      timer=setTimeout(function(){if(!disposed&&root.isConnected&&session&&session.user)load();},0);
    });
    var controller={refresh:load,dispose:function(){if(disposed)return;disposed=true;if(timer)clearTimeout(timer);clear();root.removeEventListener('click',onClick);var sub=subscription&&subscription.data&&subscription.data.subscription;if(sub)sub.unsubscribe();mounts.delete(root);}};
    mounts.set(root,controller);load();return controller;
  }
  function unmount(root){var prior=root&&mounts.get(root);if(prior)prior.dispose();}
  global.HQOpsTeam={mount:mount,unmount:unmount,createDemoClient:createDemoClient};
}(typeof window==='undefined'?globalThis:window));
