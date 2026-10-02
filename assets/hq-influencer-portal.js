/* Private influencer portal, local preview by default. No public partner token,
 * direct table access, payout destination or second commission calculation. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.HQInfluencerPortal = api;
    if (root.document) root.document.addEventListener('DOMContentLoaded', function () {
      var target = root.document.getElementById('influencerPortal');
      if (target) api.mount(target, root.HQ_INFLUENCER_PORTAL_CONFIG || {enabled:false});
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var labels = {pending:'Em apuração',eligible:'Elegível',paid:'Pago',suspended:'Suspensa',reversed:'Revertida',active:'Ativo',paused:'Pausado',draft:'Rascunho',ready:'Preparado',accepted:'Aceito',revoked:'Revogado'};
  function fail(code) { var e = new Error(code); e.code = code; throw e; }
  function assert(value, code) { if (!value) fail(code); }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function(c) {return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function keys(obj, allowed) {
    assert(obj && typeof obj === 'object' && !Array.isArray(obj), 'invalid_payload');
    assert(Object.keys(obj).every(function(k) {return allowed.indexOf(k)>=0;}) && allowed.every(function(k) {return Object.prototype.hasOwnProperty.call(obj,k);}), 'unexpected_payload_fields');
  }
  function integer(n) { assert(Number.isSafeInteger(n) && n>=0,'invalid_amount'); }
  function text(s,max) { assert(typeof s==='string' && s.length>0 && s.length<=max,'invalid_text'); }
  function iso(s) { assert(typeof s==='string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(s) && Number.isFinite(Date.parse(s)),'invalid_date'); }
  function money(c) { integer(c); return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(c/100); }
  function date(s) { return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(s)); }
  function validateSnapshot(s) {
    assert(s && (s.version===1 || s.version===2),'unsupported_portal_version');
    keys(s,['version','asOf','partner','campaign','counts','balances','coupons','commissions','payments','limits','availability'].concat(s.version===2?['firstPayments']:[]));
    s=JSON.parse(JSON.stringify(s)); iso(s.asOf);
    keys(s.partner,['displayName','status']); text(s.partner.displayName,120); assert(s.partner.status==='active','partner_access_unavailable');
    keys(s.campaign,['enabled','monthlyCents','firstPaymentCents','commissionCents','trialDays']);
    assert(typeof s.campaign.enabled==='boolean' && s.campaign.monthlyCents===4990 && s.campaign.firstPaymentCents===2994 && s.campaign.commissionCents===1996 && s.campaign.trialDays===14,'unexpected_campaign');
    keys(s.counts,['attributed','firstPaymentsAfterTrial','commissions','payments']);
    ['attributed','commissions','payments'].forEach(function(k) {integer(s.counts[k]);});
    if(s.version===1) {
      integer(s.counts.firstPaymentsAfterTrial);
      // v1 counted commission rows. Preserve the statement, discard that KPI.
      s.counts.firstPaymentsAfterTrial=null;
      s.firstPayments={status:'unavailable',scope:'historical_first_payment',source:'legacy_unverified',verifiedAfterTrialCount:null,unknownCount:s.counts.attributed};
      s.version=2;
    }
    keys(s.firstPayments,['status','scope','source','verifiedAfterTrialCount','unknownCount']);
    var fp=s.firstPayments;
    assert(['ready','partial','unavailable'].indexOf(fp.status)>=0 && fp.scope==='historical_first_payment','invalid_payment_provenance');
    assert(['verified_ledger_events','unavailable','legacy_unverified'].indexOf(fp.source)>=0,'invalid_payment_provenance');
    integer(fp.unknownCount); assert(fp.unknownCount<=s.counts.attributed,'invalid_payment_coverage');
    if(fp.status==='unavailable') assert(fp.verifiedAfterTrialCount===null && s.counts.firstPaymentsAfterTrial===null && fp.unknownCount===s.counts.attributed,'invalid_unavailable_payment_count');
    else {
      assert(fp.source==='verified_ledger_events','invalid_payment_provenance'); integer(fp.verifiedAfterTrialCount);
      assert(fp.verifiedAfterTrialCount<=s.counts.attributed-fp.unknownCount,'invalid_payment_coverage');
      if(fp.status==='ready') assert(fp.unknownCount===0 && s.counts.firstPaymentsAfterTrial===fp.verifiedAfterTrialCount,'invalid_payment_coverage');
      else assert(fp.unknownCount>0 && fp.unknownCount<s.counts.attributed && s.counts.firstPaymentsAfterTrial===null,'invalid_payment_coverage');
    }
    keys(s.balances,['pendingCents','eligibleCents','suspendedCents','paidCents','atRiskCents','recoverableCents']); Object.keys(s.balances).forEach(function(k) {integer(s.balances[k]);});
    keys(s.limits,['commissions','payments']); assert(s.limits.commissions===100 && s.limits.payments===100,'invalid_limits');
    keys(s.availability,['invitationDelivery','payoutDetails','automaticTransfer']);
    assert(Object.keys(s.availability).every(function(k) {return s.availability[k]===false;}),'unsupported_live_capability');
    ['coupons','commissions','payments'].forEach(function(k) {assert(Array.isArray(s[k]),'invalid_list');});
    assert(s.commissions.length<=100 && s.payments.length<=100,'unexpected_list_size');
    s.coupons.forEach(function(c) {keys(c,['code','status']); assert(/^[A-Z0-9][A-Z0-9_-]{2,47}$/.test(c.code) && ['draft','ready','paused'].indexOf(c.status)>=0,'invalid_coupon');});
    s.commissions.forEach(function(c) {
      keys(c,['reference','createdAt','status','amountCents','payableCents','paidCents','atRiskCents','recoverableCents']); text(c.reference,80); iso(c.createdAt);
      assert(['pending','eligible','paid','suspended','reversed'].indexOf(c.status)>=0,'invalid_commission_status');
      ['amountCents','payableCents','paidCents','atRiskCents','recoverableCents'].forEach(function(k) {integer(c[k]);});
    });
    s.payments.forEach(function(p) {keys(p,['reference','createdAt','amountCents']); text(p.reference,80); iso(p.createdAt); integer(p.amountCents);});
    return JSON.parse(JSON.stringify(s));
  }
  function errorText(error) {
    var code=String(error && error.code || ''), message=String(error && error.message || '');
    if (/IP401|auth_required/.test(code+' '+message)) return 'Entre com sua conta para consultar o portal.';
    if (/IP403|42501|IP409|forbidden/.test(code+' '+message)) return 'Seu acesso não está disponível. Confirme o convite e o e-mail com a equipe Torque.';
    if (/PGRST202|42883/.test(code+' '+message)) return 'O serviço do portal ainda não está disponível. Nenhum saldo foi confirmado.';
    if (/payload|campaign|version|invalid_/.test(code+' '+message)) return 'A resposta do serviço não pôde ser validada. Os dados foram ocultados.';
    return 'Não foi possível atualizar. Ausência de resposta não significa saldo zero.';
  }
  function createClient(client) {
    assert(client && client.auth && typeof client.auth.getUser==='function' && typeof client.rpc==='function','invalid_client');
    async function identity() {var r=await client.auth.getUser(); if(r.error || !r.data || !r.data.user) fail('auth_required'); return r.data.user;}
    async function rpc(name,input) {await identity(); var r=input===undefined?await client.rpc(name):await client.rpc(name,{p_input:input}); if(r.error) throw r.error; return r.data;}
    return Object.freeze({
      load:async function() {return validateSnapshot(await rpc('influencer_portal_snapshot'));},
      accept:async function() {var r=await rpc('influencer_accept_invite'); keys(r,['accepted']); assert(r.accepted===true,'invalid_acceptance'); return r;},
      signIn:async function(email,password) {assert(typeof email==='string' && typeof password==='string' && email.trim() && password,'invalid_login'); var r=await client.auth.signInWithPassword({email:email.trim(),password:password}); if(r.error) throw r.error; return true;},
      signOut:async function() {var r=await client.auth.signOut({scope:'local'}); if(r.error) throw r.error; return true;},
      adminSnapshot:async function() {
        var r=await rpc('hq_influencer_admin_snapshot'); keys(r,['partners','invites','deliveryAvailable']); assert(r.deliveryAvailable===false && Array.isArray(r.partners) && Array.isArray(r.invites),'invalid_admin_snapshot');
        r.partners.forEach(function(p) {keys(p,['id','name']); text(p.id,36); text(p.name,120);});
        r.invites.forEach(function(i) {keys(i,['id','partnerId','email','status','expiresAt','createdAt','delivery']); text(i.id,36); text(i.partnerId,36); text(i.email,254); iso(i.expiresAt); iso(i.createdAt); assert(['pending','accepted','revoked'].indexOf(i.status)>=0 && i.delivery==='unavailable','invalid_invitation');});
        return JSON.parse(JSON.stringify(r));
      },
      prepareInvite:async function(input) {keys(input,['partnerId','email','expiresAt','reason']); return rpc('hq_influencer_prepare_invite',input);},
      revoke:async function(input) {keys(input,['inviteId','reason']); return rpc('hq_influencer_revoke_access',input);}
    });
  }
  function demoSnapshot() {
    return validateSnapshot({version:2,asOf:'2026-09-30T15:00:00Z',partner:{displayName:'Parceiro de demonstração',status:'active'},
      campaign:{enabled:false,monthlyCents:4990,firstPaymentCents:2994,commissionCents:1996,trialDays:14},
      counts:{attributed:8,firstPaymentsAfterTrial:null,commissions:3,payments:1},
      firstPayments:{status:'partial',scope:'historical_first_payment',source:'verified_ledger_events',verifiedAfterTrialCount:3,unknownCount:5},
      balances:{pendingCents:1996,eligibleCents:1996,suspendedCents:0,paidCents:1996,atRiskCents:0,recoverableCents:0},
      coupons:[{code:'DEMO40',status:'ready'}],commissions:[
        {reference:'EXEMPLO-3',createdAt:'2026-09-29T12:00:00Z',status:'pending',amountCents:1996,payableCents:0,paidCents:0,atRiskCents:0,recoverableCents:0},
        {reference:'EXEMPLO-2',createdAt:'2026-09-27T12:00:00Z',status:'eligible',amountCents:1996,payableCents:1996,paidCents:0,atRiskCents:0,recoverableCents:0},
        {reference:'EXEMPLO-1',createdAt:'2026-09-25T12:00:00Z',status:'paid',amountCents:1996,payableCents:0,paidCents:1996,atRiskCents:0,recoverableCents:0}],
      payments:[{reference:'REPASSE-EXEMPLO',createdAt:'2026-09-28T12:00:00Z',amountCents:1996}],limits:{commissions:100,payments:100},availability:{invitationDelivery:false,payoutDetails:false,automaticTransfer:false}});
  }
  function table(heads,rows,empty) {
    return rows.length?'<div class="ip-table-scroll"><table><thead><tr>'+heads.map(function(h){return '<th>'+esc(h)+'</th>';}).join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table></div>':'<p class="ip-empty">'+esc(empty)+'</p>';
  }
  function renderSnapshot(s,demo) {
    s=validateSnapshot(s);
    var fp=s.firstPayments, received=fp.status==='unavailable'?'—':fp.verifiedAfterTrialCount;
    var receivedLabel=fp.status==='unavailable'?'Indisponível':fp.status==='partial'?'Confirmados · parcial':'Histórico verificado';
    var coverage=fp.status==='unavailable'?'Prova histórica de recebimentos indisponível.':fp.status==='partial'?'Cobertura parcial: '+fp.unknownCount+' indicações sem prova histórica suficiente.':'Cobertura completa das indicações registradas.';
    var cards=[['Cadastros atribuídos',s.counts.attributed,false],['Primeiros recebimentos pós-trial',received,false,receivedLabel],['Em apuração',s.balances.pendingCents,true],['Elegível para repasse',s.balances.eligibleCents,true],['Repasses registrados',s.balances.paidCents,true],['Suspenso',s.balances.suspendedCents,true]];
    return (demo?'<div class="ip-notice">Demonstração local · valores fictícios · sem conexão ou movimentação financeira</div>':'')+
      '<div class="ip-heading"><div><span class="ip-eyebrow">SEU PORTAL DE PARCERIAS</span><h1>'+esc(s.partner.displayName)+'</h1><p>Atualizado em '+esc(date(s.asOf))+' · valores em reais</p></div></div>'+
      (!s.campaign.enabled?'<div class="ip-notice"><strong>Campanha inativa</strong><p>Os cupons estão em preparação. Não anuncie desconto ou disponibilidade de compra antes da confirmação da Torque.</p></div>':'')+
      '<div class="ip-kpis">'+cards.map(function(c){return '<article><span>'+esc(c[0])+'</span><strong>'+esc(c[2]?money(c[1]):c[1])+'</strong>'+(c[3]?'<span>'+esc(c[3])+'</span>':'')+'</article>';}).join('')+
      '<p class="ip-explain" data-ip-payment-coverage="'+esc(fp.status)+'">'+esc(coverage)+' Escopo: primeiros recebimentos históricos das indicações. Este número não mede assinaturas ativas, conversão ou receita líquida; comissões e repasses têm apuração própria.</p>'+
      '<p class="ip-explain">Cadastro e trial não geram comissão. A comissão única aprovada é de R$ 19,96 após o primeiro pagamento elegível pós-trial; renovações não geram nova comissão.</p>'+
      '<section class="ip-card"><h2>Seus cupons</h2>'+table(['Código','Situação'],s.coupons.map(function(c){return '<tr><td><code>'+esc(c.code)+'</code></td><td>'+esc(labels[c.status])+'</td></tr>';}),'Nenhum cupom preparado para sua parceria.')+'</section>'+
      '<section class="ip-card"><h2>Comissões</h2><p>Até 100 registros mais recentes, de '+s.counts.commissions+'. Referências internas não identificam os clientes.</p>'+table(['Referência','Data','Situação','Comissão','A pagar'],s.commissions.map(function(c){return '<tr><td>'+esc(c.reference)+'</td><td>'+esc(date(c.createdAt))+'</td><td>'+esc(labels[c.status])+'</td><td>'+esc(money(c.amountCents))+'</td><td>'+esc(money(c.payableCents))+'</td></tr>';}),'Ainda não há comissões apuradas.')+'</section>'+
      '<section class="ip-card"><h2>Repasses registrados</h2><p>Até 100 registros mais recentes, de '+s.counts.payments+'. O registro documenta uma transferência realizada fora do portal.</p>'+table(['Referência','Data','Valor'],s.payments.map(function(p){return '<tr><td>'+esc(p.reference)+'</td><td>'+esc(date(p.createdAt))+'</td><td>'+esc(money(p.amountCents))+'</td></tr>';}),'Nenhum repasse registrado.')+'</section>'+
      '<section class="ip-card"><h2>Ajustes e pendências</h2><p>Em disputa: <strong>'+esc(money(s.balances.atRiskCents))+'</strong> · A recuperar: <strong>'+esc(money(s.balances.recoverableCents))+'</strong></p><p>Disputa é provisória; recuperação depende de reversão confirmada. Dados bancários e documentos não são solicitados neste portal.</p><button type="button" disabled>Cadastro de recebimento indisponível</button></section>';
  }
  function mount(target,config) {
    assert(target && typeof target.querySelector==='function','invalid_root'); config=config||{};
    var generation=0, disposed=false, api=null, subscription=null, authTimer=null;
    var live=config.enabled===true && config.client;
    if(live) api=createClient(config.client);
    function shell() {target.innerHTML='<div id="ipControls"></div><div id="ipContent"></div><p id="ipStatus" role="status" aria-live="polite"></p>';}
    function el(id){return target.querySelector('#'+id);}
    function status(text){var e=el('ipStatus'); if(e)e.textContent=text;}
    function button(label,fn) {var b=target.ownerDocument.createElement('button'); b.type='button'; b.textContent=label; b.addEventListener('click',fn);el('ipControls').appendChild(b);return b;}
    function preview(){++generation;shell();el('ipContent').innerHTML=renderSnapshot(demoSnapshot(),true);button('Sair da demonstração',initial);}
    function initial(){++generation;shell();
      if(!live){el('ipContent').innerHTML='<section class="ip-card ip-intro"><span class="ip-eyebrow">TORQUE · PARCERIAS</span><h1>Seu portal está em preparação</h1><p>O acesso será individual e vinculado ao seu convite. O serviço de envio e a conexão ao ambiente real ainda não estão habilitados.</p><p>Você pode conhecer a apresentação com dados fictícios.</p></section>';button('Conhecer a demonstração',preview);return;}
      el('ipContent').innerHTML='<section class="ip-card ip-intro"><h1>Entrar no portal</h1><p>Use a conta do e-mail que recebeu o convite. Este portal não cria credenciais.</p><form id="ipLogin"><label>E-mail<input name="email" type="email" autocomplete="username" required></label><label>Senha<input name="password" type="password" autocomplete="current-password" required></label><button type="submit">Entrar</button></form><p>Um novo acesso depende do convite oficial da Torque. Recuperação e envio de convite ainda indisponíveis neste módulo.</p></section>';
      el('ipLogin').addEventListener('submit',async function(e){e.preventDefault();var form=e.currentTarget,epoch=++generation;form.querySelector('button').disabled=true;
        try{await api.signIn(form.elements.email.value,form.elements.password.value);form.elements.password.value='';if(epoch===generation&&!disposed)await load();}
        catch(err){if(epoch===generation&&!disposed){form.elements.password.value='';status(errorText(err));form.querySelector('button').disabled=false;}}});
      button('Já entrei · consultar acesso',load);
    }
    async function load(){var epoch=++generation;shell();status('Consultando seu acesso…');
      try{var data=await api.load();if(epoch!==generation||disposed)return;el('ipContent').innerHTML=renderSnapshot(data,false);status('Dados confirmados pelo serviço.');button('Atualizar',load);button('Sair',logout);}
      catch(err){if(epoch!==generation||disposed)return;el('ipContent').innerHTML='<section class="ip-card"><h1>Acesso pendente</h1><p>'+esc(errorText(err))+'</p><p>Se a equipe já preparou um convite para seu e-mail confirmado, você pode aceitar o vínculo abaixo.</p></section>';button('Aceitar meu convite',accept);button('Voltar',initial);button('Sair',logout);status('Nenhum dado financeiro foi exibido.');}}
    async function accept(){var epoch=++generation;status('Validando convite e identidade…');try{await api.accept();if(epoch===generation&&!disposed)await load();}catch(err){if(epoch===generation&&!disposed)status(errorText(err));}}
    async function logout(){++generation;shell();status('Encerrando sessão…');try{await api.signOut();}catch(err){status(errorText(err));}if(!disposed)initial();}
    if(live&&typeof config.client.auth.onAuthStateChange==='function') subscription=config.client.auth.onAuthStateChange(function(event){
      if(disposed)return;
      if(['SIGNED_OUT','USER_DELETED','SIGNED_IN','TOKEN_REFRESHED','USER_UPDATED','INITIAL_SESSION'].indexOf(event)<0)return;
      ++generation;if(authTimer!==null)clearTimeout(authTimer);authTimer=null;
      // Clear the previous identity synchronously, but call Auth/RPC only in a
      // later task, outside Supabase's Auth callback lock. Refresh also checks
      // revoked memberships and verified email; never retain an old statement.
      if(event==='SIGNED_OUT'||event==='USER_DELETED'){initial();return;}
      shell();status('Validando a sessão atual…');
      authTimer=setTimeout(function(){authTimer=null;if(!disposed)load();},0);
    });
    initial();
    if(!live && target.ownerDocument.defaultView && /(?:\?|&)demo=1(?:&|$)/.test(target.ownerDocument.defaultView.location.search))preview();
    return {dispose:function(){disposed=true;++generation;if(authTimer!==null)clearTimeout(authTimer);target.innerHTML='';if(subscription&&subscription.data&&subscription.data.subscription)subscription.data.subscription.unsubscribe();}};
  }
  function mountAdmin(target,client) {
    assert(target && typeof target.querySelector==='function','invalid_root');
    var api=createClient(client), generation=0, disposed=false, snapshot=null, authTimer=null;
    function message(text){var e=target.querySelector('[data-ip-admin-status]');if(e)e.textContent=text;}
    async function load(){var epoch=++generation;snapshot=null;target.innerHTML='<p role="status">Verificando autorização dos convites…</p>';
      try{var result=await api.adminSnapshot();if(epoch!==generation||disposed)return;snapshot=result;render();}
      catch(e){if(epoch===generation&&!disposed)target.innerHTML='<div class="ip-notice">'+esc(errorText(e))+'</div>';}}
    function render(){
      target.innerHTML='<section class="ip-card"><h2>Acesso dos influencers</h2><p>Prepare um vínculo individual com o e-mail confirmado. Preparar não envia mensagem nem cria uma conta. O envio oficial está indisponível.</p><form data-ip-invite><label>Parceiro<select name="partnerId" required>'+snapshot.partners.map(function(p){return '<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>';}).join('')+'</select></label><label>E-mail convidado<input name="email" type="email" maxlength="254" required></label><label>Validade (data e hora local)<input name="expiresAt" type="datetime-local" required></label><label>Motivo<input name="reason" maxlength="500" required></label><button type="submit"'+(!snapshot.partners.length?' disabled':'')+'>Preparar convite</button><button type="button" disabled>Enviar convite · serviço pendente</button></form><p role="status" data-ip-admin-status></p></section><section class="ip-card"><h3>Convites e acessos</h3>'+table(['E-mail','Situação','Validade','Ação'],snapshot.invites.map(function(i){return '<tr><td>'+esc(i.email)+'</td><td>'+esc(labels[i.status]||i.status)+'</td><td>'+esc(date(i.expiresAt))+'</td><td>'+(i.status!=='revoked'?'<button type="button" data-ip-revoke="'+esc(i.id)+'">Revogar</button>':'Revogado')+'</td></tr>';}),'Nenhum convite preparado.')+'</section>';
      var form=target.querySelector('[data-ip-invite]');
      form.addEventListener('submit',async function(e){e.preventDefault();var b=form.querySelector('button'),expires=new Date(form.elements.expiresAt.value);if(!Number.isFinite(expires.getTime())){message('Informe uma validade correta.');return;}b.disabled=true;
        try{await api.prepareInvite({partnerId:form.elements.partnerId.value,email:form.elements.email.value.trim(),expiresAt:expires.toISOString(),reason:form.elements.reason.value.trim()});if(!disposed){await load();message('Convite preparado. Nenhum e-mail foi enviado e nenhuma conta foi criada.');}}
        catch(err){if(!disposed){message(errorText(err));b.disabled=false;}}});
      target.querySelectorAll('[data-ip-revoke]').forEach(function(b){b.addEventListener('click',function(){
        var id=b.getAttribute('data-ip-revoke');var dialog=target.ownerDocument.createElement('dialog');dialog.className='ip-dialog';dialog.innerHTML='<form method="dialog"><h3>Revogar acesso</h3><p>A próxima consulta do parceiro será bloqueada. O histórico financeiro será preservado.</p><label>Motivo<input name="reason" required maxlength="500"></label><div><button value="cancel" formnovalidate>Cancelar</button><button value="confirm">Confirmar revogação</button></div></form>';target.appendChild(dialog);
        dialog.addEventListener('close',async function(){var confirmed=dialog.returnValue==='confirm',reason=dialog.querySelector('input').value.trim();dialog.remove();if(!confirmed||!reason)return;
          try{await api.revoke({inviteId:id,reason:reason});if(!disposed){await load();message('Acesso revogado; histórico preservado.');}}catch(err){if(!disposed)message(errorText(err));}});dialog.showModal();
      });});
    }
    var sub=client.auth.onAuthStateChange?client.auth.onAuthStateChange(function(event){
      if(disposed||['SIGNED_OUT','USER_DELETED','SIGNED_IN','TOKEN_REFRESHED','USER_UPDATED','INITIAL_SESSION'].indexOf(event)<0)return;
      ++generation;snapshot=null;if(authTimer!==null)clearTimeout(authTimer);authTimer=null;
      if(event==='SIGNED_OUT'||event==='USER_DELETED'){target.innerHTML='<p>A sessão foi encerrada.</p>';return;}
      target.innerHTML='<p>Validando autorização da sessão atual…</p>';
      authTimer=setTimeout(function(){authTimer=null;if(!disposed)load();},0);
    }):null;
    load();return {reload:load,dispose:function(){disposed=true;++generation;if(authTimer!==null)clearTimeout(authTimer);snapshot=null;target.innerHTML='';if(sub&&sub.data&&sub.data.subscription)sub.data.subscription.unsubscribe();}};
  }
  return Object.freeze({validateSnapshot:validateSnapshot,createClient:createClient,demoSnapshot:demoSnapshot,renderSnapshot:renderSnapshot,mount:mount,mountAdmin:mountAdmin});
});
