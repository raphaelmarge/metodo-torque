/* SaaS web: tokenização direta, confirmação pelo servidor e retomada sem nova cobrança. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) api.mount(root);
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  var TOKEN_URL = 'https://api.pagar.me/core/v5/tokens';
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  var STATES = ['not_started', 'trial', 'pending', 'scheduled', 'paid', 'expired', 'payment_failed', 'cancel_pending', 'canceled', 'needs_review'];
  function fail(code) { var e = new Error(code); e.code = code; return e; }
  function validDate(v) { return typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) && Number.isFinite(Date.parse(v)); }
  function validConfig(c) {
    if (!c || c.ok !== true || c.priceCents !== 4990 || c.trialDays !== 14 || !['test', 'live'].includes(c.environment)) throw fail('invalid_config');
    if (c.enabled === true && (c.configured !== true || c.tokenizeUrl !== TOKEN_URL || typeof c.publicKey !== 'string' || !/^pk_(test_|live_)?[a-z0-9]+$/i.test(c.publicKey))) throw fail('invalid_config');
    if (c.enabled === true && ((c.environment === 'test' && !c.publicKey.startsWith('pk_test_')) || (c.environment === 'live' && c.publicKey.startsWith('pk_test_')))) throw fail('invalid_config');
    return c;
  }
  function validStatus(s, aid) {
    if (!s || s.ok !== true || s.academiaId !== aid || !STATES.includes(s.state) || typeof s.retryAllowed !== 'boolean' || typeof s.managed !== 'boolean' || typeof s.renewalCanceled !== 'boolean' || typeof s.accessActive !== 'boolean') throw fail('invalid_status');
    if (!validDate(s.trialEndsAt) || (s.attemptId !== null && !UUID.test(s.attemptId))) throw fail('invalid_status');
    for (var key of ['paidThrough', 'accessUntil']) if (s[key] !== null && !validDate(s[key])) throw fail('invalid_status');
    if (s.accessActive && !validDate(s.accessUntil) && !['lifetime','legacy'].includes(s.accessKind)) throw fail('invalid_status');
    if (s.state === 'paid' && !validDate(s.paidThrough)) throw fail('invalid_status');
    if (s.state === 'canceled' && !s.renewalCanceled) throw fail('invalid_status');
    return s;
  }
  function cardInput(values, now) {
    var expiry = String(values.expiry || '').match(/^(\d{2})\s*\/\s*(\d{2}|\d{4})$/);
    var number = String(values.number || '').replace(/[\s-]/g, '');
    var holder = String(values.holder || '').trim();
    var cvv = String(values.cvv || '');
    if (!expiry || !/^\d{13,19}$/.test(number) || !/^\d{3,4}$/.test(cvv) || !/^[\p{L} .'-]{2,64}$/u.test(holder)) throw fail('invalid_card');
    var month = Number(expiry[1]), year = Number(expiry[2]); if (year < 100) year += 2000;
    var d = new Date(now || Date.now());
    if (month < 1 || month > 12 || year < d.getFullYear() || (year === d.getFullYear() && month < d.getMonth() + 1) || year > d.getFullYear() + 30) throw fail('invalid_card');
    return { type: 'card', card: { number: number, holder_name: holder, exp_month: month, exp_year: year, cvv: cvv } };
  }
  function mount(w) {
    var d = w.document, $ = function (id) { return d.getElementById(id); };
    if (!$('billingPanel')) return;
    var client, sessionId = '', aid = '', config = null, snapshot = null, busy = false, unknown = false, epoch = 0, timer = null, polls = 0, disposed = false;
    var requests = new Set();
    function show(id, yes) { $(id).hidden = !yes; }
    function text(id, value) { $(id).textContent = value; }
    function clearCard() { d.querySelectorAll('[data-card-field]').forEach(function (el) { el.value = ''; }); }
    function clearCustomer() { ['billingName','billingEmail','billingDocument','billingPhone','billingAddress','billingAddressExtra','billingZip','billingCity','billingState'].forEach(function (id) { $(id).value = ''; }); }
    function closeForm() { clearCard(); $('billingConsent').checked = false; show('billingForm', false); }
    function key() { return 'torque:billing:attempt:v1:' + sessionId + ':' + aid; }
    function marker() { try { var v = w.sessionStorage.getItem(key()); return UUID.test(v || '') ? v : ''; } catch (_) { return ''; } }
    function remember(id) { try { w.sessionStorage.setItem(key(), id); return w.sessionStorage.getItem(key()) === id; } catch (_) { return false; } }
    function forget() { try { w.sessionStorage.removeItem(key()); } catch (_) {} }
    function stale(e) { return disposed || e !== epoch; }
    function abortAll() { requests.forEach(function (c) { c.abort(); }); requests.clear(); }
    function stopPoll() { w.clearTimeout(timer); timer = null; }
    function setBusy(value) {
      busy = value;
      $('billingFields').disabled = value;
      $('billingAccount').disabled = value;
      $('billingRefresh').disabled = value;
      $('billingCancel').disabled = value;
      $('billingCancelYes').disabled = value;
      $('billingCancelNo').disabled = value;
      $('billingPanel').setAttribute('aria-busy', String(value));
      $('salesCheckout').disabled = value || !canCheckout();
      $('salesCheckout').classList.toggle('sales-button-disabled', $('salesCheckout').disabled);
    }
    function canCheckout() {
      return !!(config && config.enabled === true && config.configured === true && snapshot && snapshot.retryAllowed === true && !unknown && !marker() && ['not_started', 'trial', 'expired', 'payment_failed'].includes(snapshot.state));
    }
    function safeMessage(e) {
      if (e && ['auth_required', 'session_changed'].includes(e.code)) return 'Sua sessão terminou ou mudou. Entre novamente no Personal e atualize esta página.';
      if (e && e.code === 'owner_required') return 'Esta assinatura só pode ser gerenciada pelo responsável da conta.';
      if (e && e.code === 'invalid_card') return 'Confira o número, o nome, a validade e o código de segurança do cartão.';
      if (e && e.code === 'token_failed') return 'Não foi possível validar o cartão. Confira os dados e tente novamente. Nenhuma contratação foi enviada ao Torque.';
      if (e && e.code === 'billing_disabled') return 'A contratação ainda não está disponível. Seu teste e sua conta continuam separados deste pagamento.';
      return 'Não foi possível confirmar a situação. Confira sua conexão e use Atualizar situação. Não faça outra contratação enquanto isso.';
    }
    function authorityError(e) { return e && ['auth_required','owner_required','session_changed'].includes(e.code); }
    function invalidateProof() {
      snapshot = null; unknown = true; stopPoll(); closeForm(); clearCustomer();
      show('billingDates', false); show('billingCancel', false); show('billingCancelConfirm', false); show('billingRefresh', true);
      text('billingStatus', 'A situação desta conta não está confirmada para esta sessão.');
    }
    async function request(url, options) {
      var controller = new w.AbortController(); requests.add(controller);
      var timeout = w.setTimeout(function () { controller.abort(); }, 15000);
      try {
        var response = await w.fetch(url, Object.assign({}, options, {signal:controller.signal, cache:'no-store', credentials:'omit', referrerPolicy:'no-referrer'}));
        var body; try { body = await response.json(); } catch (_) { throw fail('invalid_response'); }
        if (!response.ok || !body || body.ok === false) throw fail(body && /^[a-z_]{1,60}$/.test(body.error || '') ? body.error : 'request_failed');
        return body;
      } finally { w.clearTimeout(timeout); requests.delete(controller); }
    }
    async function session() {
      var t;
      try {
        return await Promise.race([client.auth.getSession(), new Promise(function (_resolve, reject) { t = w.setTimeout(function () { reject(fail('auth_timeout')); }, 15000); })]);
      } finally { w.clearTimeout(t); }
    }
    async function rpc(action, extra, e) {
      var s;
      try { s = await session(); } catch (err) { err.notSent = true; throw err; }
      if (stale(e) || s.error || !s.data || !s.data.session || s.data.session.user.id !== sessionId) { var changed = fail('session_changed'); changed.notSent = true; throw changed; }
      var token = s.data.session.access_token;
      if (!token) { var missing = fail('auth_required'); missing.notSent = true; throw missing; }
      return request(w.MT_CLOUD.url.replace(/\/$/, '') + '/functions/v1/personal-billing', {
        method:'POST', headers:{'Content-Type':'application/json',Authorization:'Bearer ' + token}, body:JSON.stringify(Object.assign({action:action}, extra || {}))
      });
    }
    function date(v) { return validDate(v) ? new Date(v).toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : 'Não confirmado'; }
    function render(s) {
      snapshot = s;
      var pending = marker();
      // Uma resposta sem esta tentativa não prova que um POST demorado nunca chegou.
      if (pending && s.attemptId === pending && (s.retryAllowed || ['scheduled','paid','canceled'].includes(s.state))) forget();
      unknown = !!marker() && s.attemptId !== marker();
      var descriptions = {
        not_started:'Nenhuma assinatura contratada para esta conta.',
        trial:'Você pode usar o teste gratuito sem cadastrar cartão. Confira abaixo o fim do teste e o prazo de acesso atual.',
        pending:'Contratação em processamento. Estamos consultando a mesma tentativa; não envie outra.',
        scheduled:'Assinatura agendada. Isso ainda não confirma pagamento. A primeira cobrança respeitará os 14 dias completos do teste.',
        paid:'Pagamento confirmado para o período informado abaixo.',
        expired:s.accessActive ? 'Seu teste gratuito terminou. O acesso atual permanece até a data confirmada abaixo.' : 'Seu período de acesso terminou. Consulte a contratação para continuar.',
        payment_failed:'O pagamento não foi confirmado. Confira a situação antes de uma nova tentativa.',
        cancel_pending:'Cancelamento solicitado, aguardando confirmação. A renovação ainda não está confirmada como cancelada.',
        canceled:'Renovação cancelada e confirmada. O acesso já confirmado permanece até a data informada abaixo.',
        needs_review:'A situação precisa de conferência. Não faça outra contratação enquanto verificamos.'
      };
      text('billingStatus', unknown ? 'Ainda não foi possível localizar a confirmação da sua tentativa. Atualize a situação; não faça uma nova contratação.' : descriptions[s.state]);
      text('billingTrialEnd', date(s.trialEndsAt)); text('billingAccessEnd', s.accessActive && s.accessKind === 'lifetime' ? 'Sem prazo (benefício vitalício)' : (s.accessKind === 'legacy' && s.accessUntil === null ? 'Prazo da assinatura anterior não informado' : date(s.accessUntil))); show('billingDates', true);
      text('billingChargeNotice', 'R$ 49,90 por mês. A primeira cobrança ocorre somente após os 14 dias completos de teste (a partir de ' + date(s.trialEndsAt) + '). Se o teste já terminou, a cobrança pode ocorrer nesta contratação. Renovação mensal até o cancelamento. Nenhum desconto está aplicado.');
      show('billingRefresh', true);
      show('billingCancel', !!(config.managementEnabled && s.canCancel === true && !s.renewalCanceled));
      text('billingCancel', s.state === 'cancel_pending' ? 'Tentar cancelamento novamente' : 'Cancelar renovação');
      text('salesCheckout', canCheckout() ? 'Contratar por R$ 49,90/mês' : (config.enabled ? 'Confira a situação da assinatura' : 'Pagamento indisponível'));
      if (!canCheckout()) closeForm();
      setBusy(false);
      if (unknown || ['pending','cancel_pending'].includes(s.state)) schedule(); else stopPoll();
    }
    function schedule() {
      stopPoll();
      // Retomada manual permanece disponível após a janela curta de acompanhamento.
      if (polls >= 12 || disposed) return;
      timer = w.setTimeout(function () { polls++; refresh(false); }, 5000);
    }
    async function refresh(manual) {
      if (busy || !aid || !sessionId) return;
      if (manual) polls = 0;
      var e = epoch; setBusy(true); closeForm(); show('billingCancelConfirm', false); text('billingMessage', 'Consultando a situação da assinatura…');
      try {
        var s = await rpc('status', {academiaId:aid, attemptId:marker() || undefined}, e);
        if (stale(e)) return;
        render(validStatus(s, aid)); text('billingMessage', 'Situação consultada.');
      } catch (err) {
        if (stale(e)) return;
        invalidateProof(); setBusy(false); text('billingMessage', safeMessage(err));
      }
    }
    async function boot() {
      var e = ++epoch; stopPoll(); abortAll(); closeForm(); clearCustomer(); aid = ''; config = null; snapshot = null; unknown = false; busy = false;
      show('billingPanel', false); show('billingCancelConfirm', false); show('billingCancel', false); show('billingDates', false); show('billingRefresh', false); show('billingEnvironment', false);
      text('billingStatus', ''); text('billingMessage', ''); $('billingAccount').replaceChildren(new w.Option('Selecione sua conta', '')); setBusy(false);
      try {
        var s = await session(); if (stale(e)) return;
        sessionId = s && !s.error && s.data && s.data.session && s.data.session.user && s.data.session.user.id || '';
        if (!sessionId) {
          text('salesAvailabilityTitle', 'Entre na sua conta para consultar a contratação.');
          text('salesAvailabilityCopy', 'O teste gratuito continua disponível sem cartão. A contratação só é liberada quando o pagamento estiver disponível para sua conta.');
          return;
        }
        show('billingPanel', true); text('billingMessage', 'Consultando sua conta…'); setBusy(true);
        $('salesTrialAction').href = 'personal.html'; $('salesTrialAction').removeAttribute('data-personal-trial'); text('salesTrialAction', 'Voltar ao meu painel');
        var result = await Promise.all([rpc('config', {}, e), rpc('accounts', {}, e)]); if (stale(e)) return;
        config = validConfig(result[0]); var accounts = result[1].accounts;
        if (!Array.isArray(accounts) || accounts.some(function (a) { return !a || !UUID.test(a.id) || typeof a.nome !== 'string'; })) throw fail('invalid_accounts');
        show('billingEnvironment', config.environment === 'test' && (config.enabled || config.managementEnabled));
        text('salesAvailabilityTitle', config.enabled ? 'Contratação disponível para sua conta.' : 'Pagamento online ainda indisponível.');
        text('salesAvailabilityCopy', config.enabled ? 'Confira a conta e a situação abaixo antes de contratar. Seu teste gratuito não será reiniciado nem encurtado.' : 'Novas contratações estão desativadas. Você pode consultar uma assinatura existente ou continuar seu teste grátis.');
        text('salesCheckoutHelp', config.enabled ? 'Mensalidade de R$ 49,90, com renovação automática até o cancelamento.' : 'A contratação será liberada após a configuração e os testes do pagamento.');
        $('billingAccount').replaceChildren(new w.Option('Selecione sua conta', ''));
        accounts.forEach(function (a) { $('billingAccount').add(new w.Option(a.nome, a.id)); });
        $('billingEmail').value = s.data.session.user.email || '';
        $('billingName').value = ''; // Dados de perfil não conferem autoridade ou titularidade de cobrança.
        setBusy(false);
        if (accounts.length === 1) { aid = accounts[0].id; $('billingAccount').value = aid; await refresh(false); }
        else text('billingMessage', accounts.length ? 'Escolha a conta do Personal que deseja gerenciar.' : 'Nenhuma conta de Personal sob sua responsabilidade foi encontrada. Acesse seu painel para conferir seu cadastro.');
      } catch (err) {
        if (stale(e)) return;
        config = null; snapshot = null; setBusy(false); text('billingMessage', safeMessage(err));
        text('salesAvailabilityTitle', 'Contratação não confirmada como disponível.');
        text('salesAvailabilityCopy', 'Entre novamente no painel ou recarregue a página para consultar a disponibilidade.');
      }
    }
    $('billingAccount').addEventListener('change', function () {
      if (busy) return;
      epoch++; stopPoll(); abortAll(); closeForm(); aid = $('billingAccount').value; snapshot = null; unknown = false; polls = 0;
      text('billingStatus', ''); text('billingMessage', ''); show('billingDates', false); show('billingCancel', false); show('billingCancelConfirm', false); show('billingRefresh', false); setBusy(false);
      if (aid) refresh(false);
    });
    $('salesCheckout').addEventListener('click', function () {
      if (busy || !canCheckout()) return;
      show('billingForm', true); text('billingMessage', ''); $('billingName').focus();
    });
    $('billingClose').addEventListener('click', function () { closeForm(); $('salesCheckout').focus(); });
    $('billingRefresh').addEventListener('click', function () { refresh(true); });
    $('billingCancel').addEventListener('click', function () {
      if (busy || !snapshot || !config.managementEnabled) return;
      stopPoll(); show('billingCancelConfirm', true); $('billingCancelYes').focus();
    });
    $('billingCancelNo').addEventListener('click', function () { show('billingCancelConfirm', false); $('billingCancel').focus(); if (snapshot && snapshot.state === 'cancel_pending') schedule(); });
    $('billingCancelYes').addEventListener('click', async function () {
      if (busy || !snapshot || !config.managementEnabled || $('billingCancel').hidden) return;
      var e = epoch; setBusy(true); stopPoll(); closeForm(); show('billingCancelConfirm', false); text('billingMessage', 'Solicitando o cancelamento da renovação…');
      try {
        var s = await rpc('cancel', {academiaId:aid}, e); if (stale(e)) return;
        render(validStatus(s, aid)); text('billingMessage', s.state === 'canceled' && s.renewalCanceled ? 'Cancelamento confirmado.' : 'Solicitação enviada. Consulte a situação até receber a confirmação.');
      } catch (err) {
        if (stale(e)) return;
        invalidateProof(); setBusy(false); text('billingMessage', (authorityError(err) ? safeMessage(err) + ' ' : '') + 'O cancelamento ainda não foi confirmado. Atualize a situação antes de tentar novamente.');
      }
    });
    $('billingForm').addEventListener('submit', async function (event) {
      event.preventDefault();
      if (busy || !canCheckout() || !$('billingConsent').checked || !$('billingForm').reportValidity()) return;
      var e = epoch, dispatched = false, preflight = false, token = '', card = null, attemptKey = '';
      try {
        var customer = {name:$('billingName').value.trim(),email:$('billingEmail').value.trim()};
        var document = $('billingDocument').value.replace(/\D/g, ''), phone = $('billingPhone').value.replace(/\D/g, '');
        if (customer.name.length < 2 || (document && !/^(\d{11}|\d{14})$/.test(document)) || (phone && !/^\d{10,11}$/.test(phone))) { text('billingMessage', 'Confira o nome, CPF/CNPJ e celular com DDD.'); return; }
        if (document) customer.document = document;
        if (phone) customer.phone = {country_code:'55',area_code:phone.slice(0,2),number:phone.slice(2)};
        customer.address = {line_1:$('billingAddress').value.trim(),zip_code:$('billingZip').value.replace(/\D/g,''),city:$('billingCity').value.trim(),state:$('billingState').value.trim().toUpperCase(),country:'BR'};
        if ($('billingAddressExtra').value.trim()) customer.address.line_2 = $('billingAddressExtra').value.trim();
        if (customer.address.line_1.length < 3 || !/^\d{8}$/.test(customer.address.zip_code) || customer.address.city.length < 2 || !/^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/.test(customer.address.state)) { text('billingMessage', 'Confira o endereço de cobrança, CEP, cidade e estado.'); return; }
        card = cardInput({number:$('billingCardNumber').value,holder:$('billingCardHolder').value,expiry:$('billingCardExpiry').value,cvv:$('billingCardCvv').value});
        setBusy(true); stopPoll(); text('billingMessage', 'Validando o cartão diretamente no Pagar.me…');
        preflight = true;
        var current = await rpc('status', {academiaId:aid}, e); if (stale(e)) return;
        snapshot = validStatus(current, aid);
        preflight = false;
        if (!canCheckout()) { render(snapshot); text('billingMessage', 'A situação da conta mudou. Confira os dados antes de continuar.'); return; }
        var attempt = w.crypto.randomUUID();
        // Persistimos exclusivamente o UUID; não persistimos cliente, cartão nem token.
        if (!remember(attempt)) throw fail('storage_unavailable');
        forget(); // Testa a disponibilidade antes de enviar dados ao processador.
        var response;
        try { response = await request(TOKEN_URL + '?appId=' + encodeURIComponent(config.publicKey), {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(card)}); }
        catch (_) { throw fail('token_failed'); }
        finally { card = null; clearCard(); }
        if (stale(e)) return;
        token = response && response.id; response = null;
        if (typeof token !== 'string' || !/^token_[a-z0-9]+$/i.test(token)) throw fail('token_failed');
        if (!remember(attempt)) throw fail('storage_unavailable');
        attemptKey = key();
        text('billingMessage', 'Registrando a contratação. Aguarde a confirmação…');
        dispatched = true;
        var outcome = await rpc('checkout', {academiaId:aid,attemptId:attempt,cardToken:token,customer:customer}, e);
        token = ''; if (stale(e)) return;
        render(validStatus(outcome, aid)); closeForm(); text('billingMessage', 'Contratação enviada. A situação acima mostra o que já foi confirmado.');
      } catch (err) {
        // A sessão pode expirar antes de fetch: neste caso sabemos que não houve POST.
        if (err.notSent && attemptKey) { try { w.sessionStorage.removeItem(attemptKey); } catch (_) {} }
        if (stale(e)) return;
        if (authorityError(err) || preflight) {
          invalidateProof(); text('billingMessage', safeMessage(err) + (dispatched && !err.notSent ? ' O resultado da contratação ainda não foi confirmado; não envie outra tentativa.' : ''));
        } else if (dispatched && err.notSent) {
          snapshot = null; unknown = false; closeForm(); show('billingRefresh', true); text('billingMessage', safeMessage(err));
        } else if (dispatched && ['invalid_input', 'billing_disabled'].includes(err.code)) {
          // Estes dois códigos são rejeições anteriores à reserva no contrato da Edge.
          forget(); snapshot = null; unknown = false; closeForm(); show('billingRefresh', true);
          text('billingMessage', err.code === 'invalid_input' ? 'Os dados não foram aceitos e a contratação não foi iniciada. Confira os dados e atualize a situação antes de tentar novamente.' : safeMessage(err));
        } else if (dispatched) {
          unknown = true; snapshot = null; closeForm(); show('billingRefresh', true); show('billingCancel', false);
          text('billingStatus', 'Resultado da contratação ainda não confirmado.');
          text('billingMessage', 'A resposta não foi confirmada. Consulte a mesma tentativa em Atualizar situação; não envie outra contratação.');
          schedule();
        } else text('billingMessage', err.code === 'storage_unavailable' ? 'O navegador não permitiu guardar a referência da tentativa. Habilite o armazenamento desta sessão antes de contratar. Nenhuma contratação foi enviada.' : safeMessage(err));
        setBusy(false);
      } finally { card = null; token = ''; clearCard(); if (!stale(e)) setBusy(false); }
    });
    w.addEventListener('pagehide', function () { disposed = true; epoch++; stopPoll(); abortAll(); closeForm(); });
    w.addEventListener('pageshow', function (event) { if (event.persisted) { disposed = false; boot(); } });
    try {
      var c = w.MT_CLOUD;
      if (!c || !/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(c.url || '') || !c.anonKey || !w.supabase) return;
      client = w.MT_supabase || w.supabase.createClient(c.url, c.anonKey); w.MT_supabase = client;
      client.auth.onAuthStateChange(function (_event, s) {
        var next = s && s.user && s.user.id || '';
        if (next !== sessionId) { epoch++; stopPoll(); abortAll(); closeForm(); clearCustomer(); show('billingPanel', false); config = null; snapshot = null; setBusy(false); w.setTimeout(boot, 0); }
      });
      boot();
    } catch (_) { /* Sem sessão/configuração verificável, o HTML mantém contratação desativada. */ }
  }
  return Object.freeze({mount:mount,validConfig:validConfig,validStatus:validStatus,cardInput:cardInput});
});
