/* Administração de indicações: chamada somente após hq_sou_admin === true.
 * As RPCs repetem a autorização. Não há checkout, transferência ou ativação aqui. */
(function () {
  'use strict';
  var labels = {active:'Ativo',paused:'Pausado',draft:'Rascunho',ready:'Preparado',pending:'Pendente',eligible:'Elegível',paid:'Pago',reversed:'Estornado',suspended:'Suspenso',trial:'Em teste',needs_review:'Requer revisão',deferred:'Aguardando confirmação',attributed:'Atribuída',rejected:'Recusada'};
  var reasons = {campaign_inactive:'Campanha inativa',campaign_disabled:'Campanha inativa',payment_before_trial_end:'Pagamento anterior ao fim do teste grátis',first_payment_history_required:'Histórico do primeiro pagamento ainda necessário',not_verified_first_payment:'Primeiro pagamento ainda não verificado',first_payment_on_later_cycle_requires_policy:'Primeiro pagamento em ciclo posterior requer revisão',prior_adjustment_requires_reconciliation:'Ajuste anterior precisa de conciliação',cycle_payment_conflict:'Dados de pagamento do ciclo divergem',link_is_provisional:'Link de indicação ainda provisório',verified_first_payment_after_trial:'Primeiro pagamento confirmado após o teste grátis'};
  var money = new Intl.NumberFormat('pt-BR', {style:'currency',currency:'BRL'});
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function cents(value) { return Number.isSafeInteger(value) && value >= 0; }
  function brl(value) { return cents(value) ? money.format(value / 100) : 'Indisponível'; }
  function date(value) { if (!value) return 'Não informada'; var d = new Date(value); return Number.isFinite(d.getTime()) ? d.toLocaleDateString('pt-BR') : 'Não informada'; }
  function dateTime(value) { if (!value) return 'Não informada'; var d = new Date(value); return Number.isFinite(d.getTime()) ? d.toLocaleString('pt-BR') : 'Não informada'; }
  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    if (!window.crypto || !window.crypto.getRandomValues) throw Error('SECURE_ID_UNAVAILABLE');
    var b = new Uint8Array(16); window.crypto.getRandomValues(b); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    return Array.from(b, function (x, i) { return ([4,6,8,10].indexOf(i) >= 0 ? '-' : '') + x.toString(16).padStart(2,'0'); }).join('');
  }
  function validSnapshot(data) {
    if (!data || !data.campaign || data.campaign.enabled !== false || data.campaign.approved !== true) return false;
    if (!['basePriceCents','discountBps','commissionBps','reserveBps','torqueBps','trialDays'].every(function (k) { return cents(data.campaign[k]); })) return false;
    if (!['partners','coupons','referrals','commissions','payments','audit'].every(function (k) { return Array.isArray(data[k]); })) return false;
    return data.commissions.every(function (c) {
      return c && typeof c.id === 'string' && typeof c.partnerId === 'string' && Number.isSafeInteger(c.revision) &&
        ['pending','eligible','paid','reversed','suspended'].indexOf(c.status) >= 0 &&
        ['amountCents','payableCents','paidCents','recoverableCents','atRiskCents'].every(function (k) { return cents(c[k]); });
    });
  }
  function errorText(error) {
    var code = String((error || {}).code || ''), msg = String((error || {}).message || error || '');
    if (/PGRST202|42883|42P01/.test(code)) return 'O controle de indicações ainda não está disponível neste ambiente. A migração precisa ser aplicada antes de consultar ou salvar dados.';
    if (/42501|PGRST301|401|403/.test(code) || /admin_required|forbidden|unauthorized/i.test(msg)) return 'Seu acesso administrativo não foi confirmado. Entre novamente; nenhum saldo está sendo exibido.';
    if (/partner_balance_requires_reconciliation/.test(msg)) return 'Há saldo em disputa ou a recuperar deste parceiro. Concilie esse saldo antes de registrar outro pagamento.';
    if (code === 'HQ409' || /revision|conflict|stale/i.test(msg)) return 'O registro mudou desde a consulta. Feche esta janela e atualize os dados antes de continuar.';
    if (code === 'HQ422' || /eligible|eligibility|hold|review_window/i.test(msg)) return 'A comissão não está elegível ou a campanha continua inativa. Confira o prazo e os eventos da primeira mensalidade.';
    if (code === 'HQ400') return 'Confira os campos preenchidos. O servidor não aceitou os dados da operação.';
    if (code === 'HQ404') return 'O registro não foi encontrado. Feche esta janela e atualize os dados.';
    if (/duplicate|23505/i.test(code + ' ' + msg)) return 'Esse código ou registro já existe. Atualize os dados e confira antes de repetir.';
    return 'Não foi possível confirmar a operação. Confira a conexão e atualize os dados. Não considere o pagamento registrado sem confirmação.';
  }
  function mount(root, client) {
    if (!root || root.dataset.hqrMounted || !client || typeof client.rpc !== 'function') return;
    root.dataset.hqrMounted = 'true'; root.hidden = false;
    var snapshot = null, tab = 'partners', busy = false, request = 0, authorized = true, authGeneration = 0, authTimer = null;
    var dialog = document.createElement('dialog'); dialog.id = 'hqrDialog'; dialog.className = 'hqr-dialog'; dialog.setAttribute('aria-labelledby','hqrDialogTitle'); document.body.appendChild(dialog);
    function $(id) { return document.getElementById(id); }
    function partnerName(id) { var p = snapshot && snapshot.partners.find(function (x) { return x.id === id; }); return p ? p.name : 'Parceiro não encontrado'; }
    function badge(status, label) { return '<span class="hqr-badge">' + esc(label || labels[status] || status || 'Não informado') + '</span>'; }
    function status(text, failed) { var el = $('hqrStatus'); if (el) { el.textContent = text; el.dataset.error = failed ? 'true' : 'false'; } }
    function shell() {
      root.innerHTML = '<div class="hqr-head"><div><h2 id="hqrTitle">Indicações e recompensas</h2><p class="muted">Parceiros, cupons e apuração da primeira mensalidade paga do TORQUE PERSONAL.</p></div><button type="button" id="hqrReload" class="btn sec mini">Atualizar dados</button></div><div id="hqrBody"></div><p id="hqrStatus" class="hqr-status" role="status" aria-live="polite"></p>';
      $('hqrReload').addEventListener('click', load);
    }
    function sum(rows, key) { var n = rows.reduce(function (total, c) { return total + c[key]; }, 0); if (!cents(n)) throw Error('INVALID_TOTAL'); return n; }
    function table(headings, rows, empty) { return rows.length ? '<div class="hqr-table-wrap" tabindex="0" role="region" aria-label="Tabela com rolagem horizontal"><table><thead><tr>' + headings.map(function (s) { return '<th scope="col">' + esc(s) + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div><p class="hqr-scroll-hint">Deslize a tabela para consultar todas as colunas.</p>' : '<p class="hqr-empty">' + esc(empty) + '</p>'; }
    function paymentRows(id) { return snapshot.commissions.filter(function (c) { return c.partnerId === id && c.status === 'eligible' && c.payableCents > 0; }); }
    function paymentBlocked(id) { return snapshot.commissions.some(function (c) { return c.partnerId === id && (c.atRiskCents > 0 || c.recoverableCents > 0); }); }
    function paymentAction(id) {
      if (!paymentRows(id).length) return '';
      var blocked = paymentBlocked(id);
      return '<button type="button" class="btn mini" data-hqr-action="payment" data-id="' + esc(id) + '"' + (blocked ? ' disabled' : '') + '>Registrar pagamento</button>' + (blocked ? '<small>Concilie o saldo em disputa ou a recuperar antes de outro pagamento.</small>' : '');
    }
    function render() {
      var c = snapshot.campaign, base = c.basePriceCents, discount = Math.round(base * c.discountBps / 10000), commission = Math.round(base * c.commissionBps / 10000), reserve = Math.round(base * c.reserveBps / 10000), torque = Math.round(base * c.torqueBps / 10000);
      if (base !== 4990 || discount !== 1996 || commission !== 1996 || reserve !== 499 || torque !== 499 || c.trialDays !== 14) throw Error('UNEXPECTED_CAMPAIGN');
      var ledger = snapshot.commissions;
      $('hqrBody').innerHTML = '<div class="hqr-notice"><strong>Campanha inativa · pagamento online pendente</strong><p>Regra aprovada: 40% para desconto, 40% para o influenciador, 10% de reserva e 10% para o Torque, sobre a base de ' + brl(base) + '. Cadastrar um cupom não publica uma oferta.</p></div>' +
        '<dl class="hqr-policy">' + [['Cliente paga',base-discount],['Desconto · 40%',discount],['Comissão · 40%',commission],['Reserva · 10%',reserve],['Saldo Torque · 10%',torque]].map(function (x) { return '<div><dt>' + x[0] + '</dt><dd>' + brl(x[1]) + '</dd></div>'; }).join('') + '</dl>' +
        '<p class="muted">A reserva não representa a taxa real do gateway. Teste grátis de 14 dias; comissão só da primeira mensalidade confirmada. Elegibilidade depende do prazo e da revisão no servidor.</p>' +
        '<div class="hqr-summary">' + [['Pendente',sum(ledger.filter(function (x) { return x.status === 'pending'; }),'amountCents')],['A pagar',sum(ledger,'payableCents')],['Pago',sum(ledger,'paidCents')],['Em disputa',sum(ledger,'atRiskCents')],['A recuperar',sum(ledger,'recoverableCents')]].map(function (x) { return '<div class="hqr-total"><span>' + x[0] + '</span><strong>' + brl(x[1]) + '</strong></div>'; }).join('') + '</div><p class="muted">Em disputa é provisório, não é dívida a cobrar. A recuperar considera somente estorno ou perda de disputa confirmados.</p>' +
        '<nav class="abas hqr-nav" aria-label="Áreas das indicações">' + [['partners','Parceiros'],['coupons','Cupons'],['referrals','Indicações'],['commissions','Comissões'],['payments','Pagamentos'],['audit','Histórico']].map(function (x) { return '<button type="button" data-hqr-tab="' + x[0] + '" class="' + (tab === x[0] ? 'ativa' : '') + '" aria-pressed="' + (tab === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</nav><div id="hqrPanel"></div>';
      renderPanel();
    }
    function renderPanel() {
      var body = '', rows;
      if (tab === 'partners') {
        body = '<div class="hqr-section-head"><h3>Influenciadores</h3><button type="button" class="btn mini" data-hqr-action="partner-new">Cadastrar influenciador</button></div>';
        rows = snapshot.partners.map(function (p) {
          var cs = snapshot.commissions.filter(function (c) { return c.partnerId === p.id; }), payable = sum(cs,'payableCents');
          return '<tr><td><b>' + esc(p.name) + '</b><small>' + esc(p.contact) + '</small></td><td>' + badge(p.status) + '</td><td class="hqr-money">' + brl(payable) + '</td><td class="hqr-money">' + brl(sum(cs,'paidCents')) + '</td><td class="hqr-money">' + brl(sum(cs,'atRiskCents')) + '</td><td class="hqr-money">' + brl(sum(cs,'recoverableCents')) + '</td><td><button type="button" class="btn sec mini" data-hqr-action="partner-edit" data-id="' + esc(p.id) + '">Editar</button>' + paymentAction(p.id) + '</td></tr>';
        });
        body += table(['Parceiro','Situação','A pagar','Pago','Em disputa','A recuperar','Ações'],rows,'Nenhum influenciador cadastrado. Os valores serão apurados a partir de eventos confirmados.');
      } else if (tab === 'coupons') {
        body = '<div class="hqr-section-head"><h3>Cupons</h3><button type="button" class="btn mini" data-hqr-action="coupon-new"' + (!snapshot.partners.length ? ' disabled' : '') + '>Cadastrar cupom</button></div><p class="muted">Preparado significa revisado para uso futuro. A campanha permanece inativa e nenhum desconto está sendo ofertado.</p>';
        rows = snapshot.coupons.map(function (c) { return '<tr><td><b>' + esc(c.code) + '</b></td><td>' + esc(partnerName(c.partnerId)) + '</td><td>' + badge(c.status) + '</td><td><button type="button" class="btn sec mini" data-hqr-action="coupon-edit" data-id="' + esc(c.id) + '">Editar</button></td></tr>'; });
        body += table(['Código','Parceiro','Preparação','Ação'],rows,'Nenhum cupom cadastrado. Cadastre um influenciador antes de preparar seu código.');
      } else if (tab === 'referrals') {
        rows = snapshot.referrals.map(function (r) { return '<tr><td>' + esc(r.customerLabel || r.id) + '</td><td>' + esc(partnerName(r.partnerId)) + '</td><td>' + badge(r.status,r.status === 'paid' ? 'Pagamento confirmado' : '') + (r.reason ? '<small>' + esc(reasons[r.reason] || r.reason) + '</small>' : '') + '</td><td>' + date(r.createdAt) + '</td><td>' + date(r.firstPaymentAt) + '</td></tr>'; });
        body = '<h3>Indicações recebidas</h3>' + table(['Referência da conta','Parceiro','Situação','Indicação','Primeiro pagamento'],rows,'Nenhuma indicação registrada pelo servidor. Visitas e códigos guardados no navegador não são vendas confirmadas.');
      } else if (tab === 'commissions') {
        rows = snapshot.commissions.map(function (c) { return '<tr><td>' + esc(partnerName(c.partnerId)) + '<small>' + esc(c.referralId || c.id) + '</small></td><td>' + badge(c.status) + '</td><td class="hqr-money">' + brl(c.amountCents) + '</td><td class="hqr-money">' + brl(c.payableCents) + '</td><td class="hqr-money">' + brl(c.atRiskCents) + '</td><td class="hqr-money">' + brl(c.recoverableCents) + '</td><td>' + date(c.eligibleAt) + '</td><td>' + (['pending','eligible','suspended'].indexOf(c.status) >= 0 ? '<button type="button" class="btn sec mini" data-hqr-action="review" data-id="' + esc(c.id) + '">Revisar</button>' : 'Histórico preservado') + '</td></tr>'; });
        body = '<h3>Livro de comissões</h3>' + table(['Parceiro / indicação','Situação','Comissão','A pagar','Em disputa','A recuperar','Elegível a partir de','Ação'],rows,'Nenhuma comissão registrada. Não há saldo a liberar por visita, cadastro ou teste grátis.');
      } else if (tab === 'payments') {
        rows = snapshot.payments.map(function (p) { return '<tr><td>' + esc(partnerName(p.partnerId)) + '</td><td class="hqr-money">' + brl(p.amountCents) + '</td><td>' + esc(p.reference) + '</td><td>' + dateTime(p.createdAt) + '</td><td>' + esc(p.operationId || p.id) + '</td></tr>'; });
        body = '<h3>Pagamentos registrados</h3><p class="muted">Registros administrativos de pagamentos realizados fora deste painel. Esta tela não transfere dinheiro.</p>' + table(['Parceiro','Valor','Referência','Registro','Operação'],rows,'Nenhum pagamento registrado. Comissões elegíveis podem ser conferidas na aba Parceiros.');
      } else {
        rows = snapshot.audit.map(function (a) { return '<tr><td>' + dateTime(a.at || a.createdAt) + '</td><td>' + esc(a.action) + '</td><td>' + esc(a.actorLabel || a.actorId || 'Administrador') + '</td><td>' + esc(a.entityId || '') + '</td><td>' + esc(typeof a.details === 'string' ? a.details : JSON.stringify(a.details || {})) + '</td></tr>'; });
        body = '<h3>Histórico de alterações</h3>' + table(['Data','Ação','Responsável','Registro','Detalhes'],rows,'Nenhuma alteração registrada no histórico.');
      }
      $('hqrPanel').innerHTML = body;
    }
    async function load() {
      if (!authorized) return;
      var id = ++request; snapshot = null; shell(); $('hqrBody').innerHTML = '<p class="hqr-empty" role="status">Consultando indicações e apuração…</p>'; $('hqrReload').disabled = true;
      try {
        // Recheck the current server authorization before every fresh snapshot.
        var guard = await client.rpc('hq_sou_admin');
        if (id !== request || !authorized) return;
        if (!guard || guard.error || guard.data !== true) throw guard && guard.error || {code:'42501',message:'admin_required'};
        var result = await client.rpc('hq_referrals_snapshot');
        if (id !== request) return;
        if (result.error) throw result.error;
        if (!validSnapshot(result.data)) throw Error('INVALID_SNAPSHOT');
        snapshot = result.data; render(); status('Dados consultados agora.');
      } catch (error) {
        if (id !== request) return;
        snapshot = null; $('hqrBody').innerHTML = '<div class="hqr-error"><strong>Dados indisponíveis</strong><p>' + esc(errorText(error)) + '</p></div>';
        status('A ausência de resposta não significa saldo zero.',true);
      } finally { if (id === request) $('hqrReload').disabled = false; }
    }
    function openDialog(title, content, submit) {
      dialog.innerHTML = '<h2 id="hqrDialogTitle">' + esc(title) + '</h2><form id="hqrForm">' + content + '<p id="hqrDialogStatus" class="hqr-status" role="status" aria-live="polite"></p></form>';
      $('hqrForm').addEventListener('submit',function (event) { event.preventDefault(); if (!busy) submit(); });
      dialog.querySelectorAll('[data-hqr-close]').forEach(function (b) { b.addEventListener('click',function () { if (!busy) dialog.close(); }); });
      if (!dialog.open) dialog.showModal();
    }
    function actions(label) { return '<div class="hqr-actions"><button type="button" class="btn sec" data-hqr-close>Cancelar</button><button type="submit" class="btn" id="hqrSubmit">' + label + '</button></div>'; }
    function dialogError(text) { var el = $('hqrDialogStatus'); el.textContent = text; el.dataset.error = 'true'; }
    async function mutate(name, input, success) {
      if (busy || !snapshot || !authorized) return;
      var generation = authGeneration;
      busy = true; dialog.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
      try {
        var result = await client.rpc(name,{p_input:input});
        if (!authorized || generation !== authGeneration) return;
        if (result.error) throw result.error;
        if (!result.data || typeof result.data.id !== 'string') throw Error('INVALID_RESULT');
        dialog.close(); await load();
        if (authorized && generation === authGeneration) status(success + (snapshot ? '' : ' Atualize para consultar o resultado.'),!snapshot);
      } catch (error) { if (authorized && generation === authGeneration) dialogError(errorText(error)); }
      finally { if (generation === authGeneration) { busy = false; dialog.querySelectorAll('button').forEach(function (b) { b.disabled = false; }); } }
    }
    function partnerDialog(id) {
      var p = snapshot.partners.find(function (x) { return x.id === id; });
      openDialog(p ? 'Editar influenciador' : 'Cadastrar influenciador','<label for="hqrName">Nome</label><input id="hqrName" required maxlength="120" value="' + esc(p && p.name) + '"><label for="hqrContact">Contato</label><input id="hqrContact" maxlength="240" value="' + esc(p && p.contact) + '"><label for="hqrPartnerStatus">Situação</label><select id="hqrPartnerStatus"><option value="active">Ativo</option><option value="paused">Pausado</option></select>' + actions('Salvar influenciador'),function () {
        var input = {name:$('hqrName').value.trim(),contact:$('hqrContact').value.trim(),status:$('hqrPartnerStatus').value};
        if (!input.name) { dialogError('Informe o nome do influenciador.'); return; }
        if (p) { input.id = p.id; input.expectedRevision = p.revision; }
        mutate('hq_referrals_save_partner',input,'Influenciador salvo.');
      });
      $('hqrPartnerStatus').value = p ? p.status : 'active';
    }
    function couponDialog(id) {
      var c = snapshot.coupons.find(function (x) { return x.id === id; });
      if (!snapshot.partners.length) return;
      openDialog(c ? 'Editar cupom' : 'Cadastrar cupom','<p>A campanha continua inativa. Este cadastro não aplica desconto.</p><label for="hqrCode">Código</label><input id="hqrCode" required minlength="3" maxlength="48" pattern="[A-Za-z0-9][A-Za-z0-9_-]{2,47}" value="' + esc(c && c.code) + '"><label for="hqrCouponPartner">Influenciador</label><select id="hqrCouponPartner">' + snapshot.partners.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>'; }).join('') + '</select><label for="hqrCouponStatus">Preparação</label><select id="hqrCouponStatus"><option value="draft">Rascunho</option><option value="ready">Preparado · campanha inativa</option><option value="paused">Pausado</option></select>' + actions('Salvar cupom'),function () {
        var input = {code:$('hqrCode').value.trim().toUpperCase(),partnerId:$('hqrCouponPartner').value,status:$('hqrCouponStatus').value};
        if (!/^[A-Z0-9][A-Z0-9_-]{2,47}$/.test(input.code)) { dialogError('Use de 3 a 48 letras, números, traços ou sublinhados.'); return; }
        if (c) { input.id = c.id; input.expectedRevision = c.revision; }
        mutate('hq_referrals_save_coupon',input,'Cupom salvo. A campanha permanece inativa.');
      });
      if (c) { $('hqrCouponPartner').value = c.partnerId; $('hqrCouponStatus').value = c.status; }
    }
    function reviewDialog(id) {
      var c = snapshot.commissions.find(function (x) { return x.id === id; });
      if (!c || ['pending','eligible','suspended'].indexOf(c.status) < 0) return;
      var eligible = snapshot.campaign.enabled && Number.isFinite(Date.parse(c.eligibleAt)) && Date.parse(c.eligibleAt) <= Date.now(), operationId = uuid();
      openDialog('Revisar comissão','<p>' + esc(partnerName(c.partnerId)) + ' · ' + brl(c.amountCents) + '</p><p class="muted">Elegível a partir de ' + date(c.eligibleAt) + '. A decisão será validada no servidor.</p><label for="hqrDecision">Decisão</label><select id="hqrDecision"><option value="suspended">Suspender</option><option value="eligible"' + (!eligible ? ' disabled' : '') + '>Tornar elegível</option></select><label for="hqrReason">Motivo da revisão</label><textarea id="hqrReason" required minlength="1" maxlength="500" rows="3"></textarea>' + actions('Salvar revisão'),function () {
        var reason = $('hqrReason').value.trim(); if (reason.length < 1) { dialogError('Descreva o motivo da revisão.'); return; }
        mutate('hq_referrals_review',{commissionId:c.id,decision:$('hqrDecision').value,reason:reason,expectedRevision:c.revision,operationId:operationId},'Revisão registrada.');
      });
    }
    function paymentDialog(id) {
      if (paymentBlocked(id)) { status('Concilie o saldo em disputa ou a recuperar deste parceiro antes de registrar outro pagamento.',true); return; }
      var allRows = paymentRows(id), rows = allRows.slice(0,100); if (!rows.length) return;
      var total = sum(rows,'payableCents'), name = partnerName(id), revisions = {};
      var batchNote = allRows.length > rows.length ? '<p class="muted">Este registro cobre 100 de ' + allRows.length + ' comissões. As restantes continuam a pagar e precisam de outro registro.</p>' : '';
      rows.forEach(function (c) { revisions[c.id] = c.revision; });
      function prepare(reference) {
        openDialog('Conferir pagamento realizado','<p>Este registro não transfere dinheiro. Use somente para documentar um pagamento que você já realizou fora do painel.</p><div class="hqr-confirm-summary">' + esc(name) + '<strong>' + brl(total) + '</strong>' + rows.length + ' comissão(ões) elegível(is).</div>' + batchNote + '<label for="hqrReference">Referência do pagamento ou comprovante</label><input id="hqrReference" required minlength="1" maxlength="160" value="' + esc(reference) + '">' + actions('Revisar registro'),function () {
          var ref = $('hqrReference').value.trim(); if (ref.length < 1) { dialogError('Informe uma referência para identificar o pagamento realizado.'); return; }
          confirmPayment(ref);
        });
      }
      function confirmPayment(reference) {
        var input = {partnerId:id,commissionIds:rows.map(function (c) { return c.id; }),expectedRevisions:revisions,amountCents:total,reference:reference,confirmation:true,operationId:uuid()};
        openDialog('Confirmar registro manual','<div class="hqr-confirm-summary">' + esc(name) + '<strong>' + brl(total) + '</strong><span class="hqr-reference">Referência: ' + esc(reference) + '</span></div><p>O servidor conferirá as revisões e a elegibilidade de ' + rows.length + ' comissão(ões). Nenhuma transferência será executada por este painel.</p><label class="hqr-check"><input id="hqrPaymentConfirmed" type="checkbox" required><span>Confirmo que este pagamento já foi realizado e que conferi o favorecido, o valor e a referência.</span></label><div class="hqr-actions"><button type="button" class="btn sec" id="hqrPaymentBack">Voltar</button><button type="button" class="btn sec" data-hqr-close>Cancelar</button><button type="submit" class="btn" id="hqrSubmit" disabled>Confirmar registro</button></div>',function () {
          if (!$('hqrPaymentConfirmed').checked) return;
          mutate('hq_referrals_record_payment',input,'Pagamento manual registrado. Nenhuma transferência foi executada pelo painel.');
        });
        $('hqrPaymentConfirmed').addEventListener('change',function () { $('hqrSubmit').disabled = !this.checked; });
        $('hqrPaymentBack').addEventListener('click',function () { if (!busy) prepare(reference); });
      }
      prepare('');
    }
    function onClick(event) {
      if (!snapshot || busy) return;
      var t = event.target.closest('[data-hqr-tab]');
      if (t) { tab = t.dataset.hqrTab; render(); return; }
      var b = event.target.closest('[data-hqr-action]'); if (!b) return;
      try {
        var action = b.dataset.hqrAction, id = b.dataset.id;
        if (action === 'partner-new' || action === 'partner-edit') partnerDialog(id);
        if (action === 'coupon-new' || action === 'coupon-edit') couponDialog(id);
        if (action === 'review') reviewDialog(id);
        if (action === 'payment') paymentDialog(id);
      } catch (_) { status('Não foi possível preparar a operação. Atualize a página e tente novamente.',true); }
    }
    root.addEventListener('click',onClick);
    dialog.addEventListener('cancel',function (event) { if (busy) event.preventDefault(); });
    var authSubscription;
    function dispose() {
      authorized = false; ++request; ++authGeneration; if (authTimer !== null) clearTimeout(authTimer); authTimer = null;
      snapshot = null; root.innerHTML = ''; root.hidden = true; if (dialog.open) dialog.close(); dialog.innerHTML = ''; dialog.remove();
      root.removeEventListener('click',onClick); delete root.dataset.hqrMounted; delete root.__hqrDispose;
      if (authSubscription && authSubscription.data && authSubscription.data.subscription) authSubscription.data.subscription.unsubscribe();
    }
    root.__hqrDispose = dispose;
    if (client.auth && typeof client.auth.onAuthStateChange === 'function') authSubscription = client.auth.onAuthStateChange(function (event) {
      if (!authorized) return;
      if (event === 'SIGNED_OUT' || event === 'USER_DELETED') { dispose(); return; }
      if (['SIGNED_IN','TOKEN_REFRESHED','USER_UPDATED'].indexOf(event) < 0) return;
      // Clear synchronously; never reuse data or dialogs from the previous session.
      // Do not await Auth/RPC calls inside Supabase's auth callback lock.
      ++request; ++authGeneration; snapshot = null; busy = false;
      root.innerHTML = ''; if (dialog.open) dialog.close(); dialog.innerHTML = '';
      if (authTimer !== null) clearTimeout(authTimer);
      authTimer = setTimeout(function () { authTimer = null; if (authorized && root.isConnected) load(); },0);
    });
    load();
  }
  window.MT_HQ_REFERRALS = Object.freeze({mount:mount,unmount:function(root){if(root&&root.__hqrDispose)root.__hqrDispose();}});
})();
