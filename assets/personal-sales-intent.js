/* Intenção não confiável de indicação. Nunca aprova cupom, preço, acesso ou
 * comissão. Não chama API, não cria cobrança e só grava após ação explícita.
 * Sessão do navegador não é o registro de atribuição definitivo do servidor. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) api.mount(root);
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  var KEY = 'torque:sales:intent:v1';
  function code(value) {
    if (typeof value !== 'string') return '';
    var normalized = value.trim().toUpperCase();
    return /^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(normalized) ? normalized : '';
  }
  function ref(value) {
    return typeof value === 'string' && /^[A-Za-z0-9_-]{3,64}$/.test(value) ? value : '';
  }
  function fromSearch(search) {
    var query = new URLSearchParams(search), codes = query.getAll('cupom'), refs = query.getAll('ref');
    var selected = codes.length === 1 ? code(codes[0]) : '';
    var partner = refs.length === 1 ? ref(refs[0]) : '';
    return { code:selected, partnerRef:partner, hasCode:codes.length > 0,
      invalid:codes.length > 1 || refs.length > 1 || (codes.length === 1 && !selected) || (refs.length === 1 && !partner) };
  }
  function read(storage) {
    try {
      var raw = JSON.parse(storage.getItem(KEY) || 'null');
      if (!raw || raw.version !== 1 || raw.status !== 'unverified' || !code(raw.code)) return null;
      return { code:code(raw.code), partnerRef:ref(raw.partnerRef) };
    } catch (_) { return null; }
  }
  function write(storage, intent) {
    if (!code(intent.code)) return false;
    try {
      storage.setItem(KEY, JSON.stringify({version:1,status:'unverified',code:code(intent.code),partnerRef:ref(intent.partnerRef)}));
      return true;
    } catch (_) { return false; }
  }
  function remove(storage) { try { storage.removeItem(KEY); return true; } catch (_) { return false; } }
  function decorate(document, location, intent) {
    document.querySelectorAll('[data-sales-link], [data-personal-trial]').forEach(function (link) {
      var destination = new URL(link.getAttribute('href'), location.href);
      if (destination.origin !== location.origin || !/\/(?:personal-assinatura|personal)\.html$/.test(destination.pathname)) return;
      destination.searchParams.delete('cupom'); destination.searchParams.delete('ref');
      if (intent.code) destination.searchParams.set('cupom', intent.code);
      if (intent.partnerRef) destination.searchParams.set('ref', intent.partnerRef);
      link.setAttribute('href', destination.pathname.split('/').pop() + destination.search + destination.hash);
    });
  }
  function mount(win) {
    var doc = win.document, storage;
    try { storage = win.sessionStorage; } catch (_) { storage = null; }
    var incoming = fromSearch(win.location.search), saved = read(storage);
    // Origem ajusta apenas a apresentacao, nunca concede/renova trial ou acesso.
    var origins = new URLSearchParams(win.location.search).getAll('origem');
    if (origins.length === 1 && origins[0] === 'trial-vencido' && doc.getElementById('salesTrialAction')) {
      doc.getElementById('salesIntroCopy').textContent = 'Confira a assinatura para continuar após o teste. Seus dados continuam guardados.';
      doc.getElementById('salesAvailabilityCopy').textContent = 'O pagamento online ainda não foi liberado. Volte ao painel para consultar a situação do acesso ou baixar seus dados.';
      var back = doc.getElementById('salesTrialAction');
      back.textContent = 'Voltar ao painel';
      back.setAttribute('href', 'personal.html');
      back.removeAttribute('data-personal-trial');
    }
    // URL explícita inválida não recupera silenciosamente um cupom anterior.
    var intent = incoming.hasCode || incoming.invalid ? incoming : saved || incoming;
    if (incoming.partnerRef && !intent.partnerRef) intent.partnerRef = incoming.partnerRef;
    decorate(doc, win.location, intent);
    var form = doc.getElementById('salesCouponForm');
    if (!form) return;
    var input = doc.getElementById('salesCoupon'), status = doc.getElementById('salesCouponStatus');
    form.hidden = false; input.value = intent.code || '';
    status.textContent = incoming.invalid ? 'O código ou link não tem um formato válido. Confira com quem indicou o Torque.'
      : intent.code ? 'Código ainda não validado. Nenhum desconto foi aplicado.' : '';
    var referral = doc.getElementById('salesReferralStatus');
    if (intent.partnerRef) { referral.hidden = false; referral.textContent = 'Este link contém uma referência de indicação ainda não validada. Ela não aplica desconto.'; }
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var value = code(input.value);
      if (!value) { input.setAttribute('aria-invalid', 'true'); status.textContent = 'Confira o código: use de 3 a 40 letras, números, traços ou sublinhados.'; input.focus(); return; }
      input.removeAttribute('aria-invalid'); input.value = value;
      intent = {code:value, partnerRef:intent.partnerRef || ''};
      var stored = write(storage, intent);
      decorate(doc, win.location, intent);
      status.textContent = stored ? 'Código guardado nesta sessão, pendente de validação. Nenhum desconto ou cobrança foi aplicado.'
        : 'Não foi possível guardar nesta sessão. Anote seu código; nenhum desconto ou cobrança foi aplicado.';
    });
    doc.getElementById('salesCouponClear').addEventListener('click', function () {
      var removed = remove(storage);
      intent = {code:'',partnerRef:''}; input.value = ''; input.removeAttribute('aria-invalid');
      decorate(doc, win.location, intent); referral.hidden = true;
      try {
        var clean = new URL(win.location.href); clean.searchParams.delete('cupom'); clean.searchParams.delete('ref');
        win.history.replaceState(null, '', clean.pathname + clean.search + clean.hash);
      } catch (_) { /* A remoção da URL não autoriza cupom nem pagamento. */ }
      status.textContent = removed ? 'Código removido desta sessão.' : 'Código removido desta página. Não foi possível acessar o armazenamento da sessão.';
    });
    // Nem remover o atributo disabled no navegador cria uma operação financeira.
    // Não há adaptador de checkout registrado enquanto a integração não existe.
    doc.getElementById('salesCheckout').addEventListener('click', function (event) { event.preventDefault(); });
  }
  return Object.freeze({normalizeCode:code,fromSearch:fromSearch,read:read,write:write,remove:remove,mount:mount});
});
