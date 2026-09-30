/* HQ operational metrics. Pure functions; amounts are integer BRL cents.
 * Sources must explicitly be ready. No browser clock, network or storage.
 * Dates without a time are business calendar dates, never UTC instants.
 * Subscription history must include ended contracts; endsAt is exclusive.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HQOpsMetrics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var DAY = 86400000;
  var INVALID = /^(void|cancelled|canceled|anulada|cancelada)$/i;
  var INTERNAL = /^(internal|demo|test|teste|courtesy|cortesia|vitalicia)$/i;
  var PAID = /^(active|paid|ativa|past_due|atrasada|cancelled|canceled|expired|ended)$/i;
  var CLOSED = /^(closed|resolved|cancelled|canceled|resolvido|fechado)$/i;
  var CLOSED_EVENT = /^(account_closed|account_deactivated)$/;
  var OPEN_EVENT = /^(account_created|account_activated|account_reopened)$/;
  var PUBLISHED = /^(publication_confirmed|first_publication_confirmed)$/;
  var HUMAN = /^(human_activity|human_activity_confirmed)$/;
  var formatters = Object.create(null);

  function assert(ok, code) { if (!ok) throw new TypeError(code); }
  function cents(n) { return Number.isSafeInteger(n) && n >= 0; }
  function add(a, b) { var n = a + b; assert(Number.isSafeInteger(n), 'unsafe_money_total'); return n; }
  function sum(rows, fn) { return rows.reduce(function (n, r) { return add(n, fn(r)); }, 0); }
  function unique(rows) { return Array.from(new Set(rows)); }
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function money(n) {
    if (n === null || n === undefined) return 'Indisponível';
    assert(Number.isSafeInteger(n), 'money_requires_integer_cents');
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n / 100);
  }
  function calendar(day) {
    assert(typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day), 'invalid_calendar_date');
    var t = Date.parse(day + 'T00:00:00Z');
    assert(Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === day, 'invalid_calendar_date');
    return day;
  }
  function timezone(tz) {
    assert(typeof tz === 'string' && tz.length > 0, 'timeZone_required');
    if (!formatters[tz]) formatters[tz] = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
    });
    return formatters[tz];
  }
  function parseInstant(value) {
    assert(typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value), 'timestamp_requires_offset');
    calendar(value.slice(0, 10));
    var n = Date.parse(value); assert(Number.isFinite(n), 'invalid_timestamp'); return n;
  }
  function dateKey(value, tz) {
    var fmt = timezone(tz);
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return calendar(value);
    var parts = fmt.formatToParts(new Date(parseInstant(value))), fields = {};
    parts.forEach(function (p) { fields[p.type] = p.value; });
    return fields.year + '-' + fields.month + '-' + fields.day;
  }
  function nextDay(day, count) { return new Date(Date.parse(calendar(day) + 'T00:00:00Z') + (count || 1) * DAY).toISOString().slice(0, 10); }
  function dayStart(day, tz) {
    calendar(day); timezone(tz);
    // Find the first instant belonging to the local calendar day. This also
    // handles midnight DST transitions without assuming every day has 24h.
    var guess = Date.parse(day + 'T00:00:00Z'), lo = guess - 2 * DAY, hi = guess + 2 * DAY;
    while (hi - lo > 1) {
      var mid = Math.floor((lo + hi) / 2);
      if (dateKey(new Date(mid).toISOString(), tz) < day) lo = mid; else hi = mid;
    }
    assert(dateKey(new Date(hi).toISOString(), tz) === day, 'calendar_day_does_not_exist_in_timezone');
    return hi;
  }
  function timestamp(value, tz) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? dayStart(value, tz) : parseInstant(value);
  }
  function period(input) {
    assert(input && input.timeZone, 'timeZone_required');
    var from = dateKey(input.from, input.timeZone), to = dateKey(input.to, input.timeZone);
    assert(from <= to, 'invalid_period_order');
    assert((Date.parse(to) - Date.parse(from)) / DAY <= 3660, 'period_too_long');
    return { from: from, to: to, timeZone: input.timeZone,
      startAt: new Date(dayStart(from, input.timeZone)).toISOString(),
      endAtExclusive: new Date(dayStart(nextDay(to), input.timeZone)).toISOString() };
  }
  function percent(n, base) { return base > 0 ? n / base * 100 : null; }
  function sourceState(snapshot, domains) {
    var states = domains.map(function (d) {
      var s = snapshot.sources && snapshot.sources[d];
      if (!s) return 'unavailable';
      if (s.status === 'ready' && !Array.isArray(snapshot[d])) return 'error';
      return /^(ready|unavailable|error|stale)$/.test(s.status) ? s.status : 'unavailable';
    });
    return states.indexOf('error') >= 0 ? 'error' : states.indexOf('unavailable') >= 0 ? 'unavailable' : states.indexOf('stale') >= 0 ? 'stale' : 'ready';
  }

  function compute(snapshot, options) {
    assert(snapshot && typeof snapshot === 'object', 'snapshot_required');
    options = options || {};
    var p = period(options), tz = p.timeZone;
    // Account filters define the population BEFORE computing both numerator
    // and denominator. A generic status filter means account status only.
    var accountStatus = options.accountStatus || options.status;
    var scoped = !!(options.accountId || options.product || accountStatus || options.cohort);
    if (scoped) {
      var original = snapshot;
      snapshot = Object.assign({}, original, { sources: Object.assign({}, original.sources || {}) });
      var cohortFilter = options.cohort ? period({from:options.cohort.from,to:options.cohort.to,timeZone:tz}) : null;
      var accountState = sourceState(original, ['accounts']);
      snapshot.accounts = (original.accounts || []).filter(function (a) {
        if (options.accountId && a.id !== options.accountId) return false;
        if (options.product && a.product !== options.product) return false;
        if (accountStatus && a.status !== accountStatus) return false;
        if (cohortFilter) { var created = dateKey(a.createdAt, tz); if (created < cohortFilter.from || created > cohortFilter.to) return false; }
        return true;
      });
      var selected = new Set(snapshot.accounts.map(function (a) { return a.id; }));
      var invoiceOwners = new Map((original.invoices || []).map(function (i) { return [i.id, i.accountId]; }));
      ['subscriptions','invoices','payments','events','cases','incidents'].forEach(function (d) {
        snapshot[d] = (original[d] || []).filter(function (r) { return selected.has(r.accountId || (d === 'payments' ? invoiceOwners.get(r.invoiceId) : null)); });
        var originalState = sourceState(original, [d]);
        if (originalState !== 'ready') snapshot.sources[d] = Object.assign({}, snapshot.sources[d], {status:originalState});
        if (accountState !== 'ready') snapshot.sources[d] = Object.assign({}, snapshot.sources[d], {status:accountState,message:'account_population_unavailable'});
        if ((original[d] || []).some(function(r) {return !r.accountId && !(d==='payments' && invoiceOwners.get(r.invoiceId));})) {
          snapshot.sources[d] = Object.assign({}, snapshot.sources[d], {status:'unavailable',message:'scope_allocation_required'});
        }
      });
      // Global operational expenses cannot be assigned to a product or customer
      // by guessing. An explicit allocation is required for filtered finance.
      var missingAllocation = (original.expenses || []).some(function (e) { return !e.accountId; });
      snapshot.expenses = (original.expenses || []).filter(function (e) { return selected.has(e.accountId); });
      var expenseIds = new Set(snapshot.expenses.map(function (e) { return e.id; }));
      snapshot.expensePayments = (original.expensePayments || []).filter(function (e) { return expenseIds.has(e.expenseId); });
      if (missingAllocation || accountState !== 'ready') ['expenses','expensePayments'].forEach(function (d) {
        snapshot.sources[d] = Object.assign({}, snapshot.sources[d], {status:'unavailable',message:'expense_account_allocation_required'});
      });
    }
    var now = parseInstant(options.now || snapshot.now), start = parseInstant(p.startAt), end = parseInstant(p.endAtExclusive);
    var observedEnd = Math.min(end, now + 1), cut = observedEnd - 1;
    var today = dateKey(new Date(now).toISOString(), tz), metrics = {}, details = {};
    function list(domain) { return Array.isArray(snapshot[domain]) ? snapshot[domain] : []; }
    function business(a) { return !INTERNAL.test(a.status || '') && a.isInternal !== true && a.isDemo !== true; }
    var accounts = list('accounts').filter(business), accountIds = new Set(accounts.map(function (a) { return a.id; }));
    function inWindow(value) { var t = timestamp(value, tz); return t >= start && t < observedEnd; }
    function atNow(value) { return timestamp(value, tz) <= now; }
    function amount(row, key) { assert(cents(row[key]), 'invalid_' + key); return row[key]; }
    function baseMetric(key, domains, unit, status) {
      return { key: key, status: status, value: null, unit: unit, count: null, percentage: null, base: null,
        sourceDomains: domains.slice(), ids: [], sources: domains.map(function (d) {
          var s = snapshot.sources && snapshot.sources[d];
          return { domain: d, status: s ? s.status : 'unavailable', updatedAt: s && s.updatedAt || null,
            origin: s && s.origin || null, message: s && s.message || null };
        }) };
    }
    function build(key, domains, unit, fn, allowFuture) {
      var status = sourceState(snapshot, domains), m = baseMetric(key, domains, unit, status), rows = [];
      if (status === 'ready' && !allowFuture && start > now) { m.status = 'unavailable'; m.message = 'future_period'; }
      if (m.status === 'ready') {
        try {
          var result = fn();
          if (result.unavailable) { m.status = 'unavailable'; m.message = result.unavailable; }
          else {
            rows = result.rows || []; m.value = result.value; m.count = result.count === undefined ? rows.length : result.count;
            m.base = result.base === undefined ? null : result.base;
            m.percentage = m.base === null ? null : percent(m.count, m.base);
            m.ids = unique(rows.map(function (r) { return r.id || r.accountId; }).filter(Boolean));
            if (result.message) m.message = result.message;
          }
        } catch (e) { m.status = 'error'; m.message = e.message; rows = []; }
      }
      metrics[key] = m; details[key] = { metric: key, status: m.status, rows: copy(rows), period: p, message: m.message || null };
      return m;
    }
    function aliveAt(a, t) {
      if (timestamp(a.createdAt, tz) > t) return false;
      var lifecycle = list('events').filter(function (e) { return e.accountId === a.id && (CLOSED_EVENT.test(e.type) || OPEN_EVENT.test(e.type)) && timestamp(e.occurredAt, tz) <= t; })
        .sort(function (a, b) { return timestamp(a.occurredAt, tz) - timestamp(b.occurredAt, tz) || String(a.id).localeCompare(String(b.id)); });
      return !lifecycle.length || !CLOSED_EVENT.test(lifecycle[lifecycle.length - 1].type);
    }
    function opening() { return accounts.filter(function (a) { return aliveAt(a, start - 1); }); }
    build('openingAccounts', ['accounts', 'events'], 'count', function () { var r = opening(); return { value: r.length, rows: r }; });
    build('closingAccounts', ['accounts', 'events'], 'count', function () { var r = accounts.filter(function (a) { return aliveAt(a, cut); }); return { value: r.length, rows: r }; });
    build('accountEntries', ['accounts', 'events'], 'count', function () {
      var r = accounts.filter(function (a) { return inWindow(a.createdAt); }); return { value: r.length, rows: r, base: opening().length };
    });
    build('accountExits', ['accounts', 'events'], 'count', function () {
      var ids = new Set(list('events').filter(function (e) { return accountIds.has(e.accountId) && CLOSED_EVENT.test(e.type) && inWindow(e.occurredAt); }).map(function (e) { return e.accountId; }));
      var r = accounts.filter(function (a) { return ids.has(a.id); }); return { value: r.length, rows: r, base: opening().length };
    });

    function contracts() {
      return list('subscriptions').filter(function (s) {
        if (!accountIds.has(s.accountId) || !PAID.test(s.status || '')) return false;
        amount(s, 'monthlyCents'); timestamp(s.startsAt, tz);
        if (s.endsAt) assert(timestamp(s.endsAt, tz) >= timestamp(s.startsAt, tz), 'subscription_end_before_start');
        if (/^(cancelled|canceled|expired|ended)$/i.test(s.status)) assert(s.endsAt, 'ended_subscription_requires_endsAt');
        return s.monthlyCents > 0;
      });
    }
    function activeContracts(t) { return contracts().filter(function (s) { return timestamp(s.startsAt, tz) <= t && (!s.endsAt || timestamp(s.endsAt, tz) > t); }); }
    function paidAccounts(t) { var ids = new Set(activeContracts(t).map(function (s) { return s.accountId; })); return accounts.filter(function (a) { return ids.has(a.id); }); }
    var subDomains = ['accounts', 'subscriptions'];
    build('payingAccounts', subDomains, 'count', function () { var r = paidAccounts(cut); return { value: r.length, rows: r }; });
    build('churn', subDomains, 'percent', function () {
      var initial = paidAccounts(start - 1), current = new Set(paidAccounts(cut).map(function (a) { return a.id; }));
      var r = initial.filter(function (a) { return !current.has(a.id); }); return { value: percent(r.length, initial.length), rows: r, base: initial.length };
    });
    build('mrrOpening', subDomains, 'cents', function () { var r = activeContracts(start - 1); return { value: sum(r, function (s) { return s.monthlyCents; }), rows: r }; });
    build('mrr', subDomains, 'cents', function () { var r = activeContracts(cut); return { value: sum(r, function (s) { return s.monthlyCents; }), rows: r }; });
    function movements() {
      var grouped = {};
      contracts().forEach(function (s) {
        [{ at: s.startsAt, delta: s.monthlyCents }, { at: s.endsAt, delta: -s.monthlyCents }].forEach(function (m) {
          if (!m.at || !inWindow(m.at)) return;
          var iso = new Date(timestamp(m.at, tz)).toISOString(), key = s.accountId + '|' + iso;
          if (!grouped[key]) grouped[key] = { id: key, accountId: s.accountId, occurredAt: iso, deltaCents: 0, subscriptionIds: [] };
          grouped[key].deltaCents = add(grouped[key].deltaCents, m.delta); grouped[key].subscriptionIds.push(s.id);
        });
      });
      return Object.keys(grouped).map(function (k) { return grouped[k]; });
    }
    build('mrrGained', subDomains, 'cents', function () { var r = movements().filter(function (m) { return m.deltaCents > 0; }); return { value: sum(r, function (m) { return m.deltaCents; }), rows: r }; });
    build('mrrLost', subDomains, 'cents', function () { var r = movements().filter(function (m) { return m.deltaCents < 0; }); return { value: sum(r, function (m) { return -m.deltaCents; }), rows: r }; });
    build('arpa', subDomains, 'cents', function () {
      var r = paidAccounts(cut); return { value: r.length ? Math.round(sum(activeContracts(cut), function (s) { return s.monthlyCents; }) / r.length) : null, rows: r, base: r.length };
    });

    function payments(allTime) { return list('payments').filter(function (r) { return r.confirmed === true && (allTime ? atNow(r.paidAt) : inWindow(r.paidAt)); }).map(function (r) { amount(r, 'amountCents'); assert(r.kind === 'payment' || r.kind === 'refund', 'invalid_payment_kind'); return r; }); }
    function outgoing(allTime) { return list('expensePayments').filter(function (r) { return r.confirmed !== false && (allTime ? atNow(r.paidAt) : inWindow(r.paidAt)); }).map(function (r) { amount(r, 'amountCents'); return r; }); }
    build('cashIn', ['payments'], 'cents', function () { var r = payments(false).filter(function (r) { return r.kind === 'payment'; }); return { value: sum(r, function (r) { return r.amountCents; }), rows: r }; });
    build('refunds', ['payments'], 'cents', function () { var r = payments(false).filter(function (r) { return r.kind === 'refund'; }); return { value: sum(r, function (r) { return r.amountCents; }), rows: r }; });
    build('cashOut', ['expensePayments'], 'cents', function () { var r = outgoing(false); return { value: sum(r, function (r) { return r.amountCents; }), rows: r }; });
    build('netCash', ['payments', 'expensePayments'], 'cents', function () {
      var r = payments(false), out = outgoing(false); return { value: add(sum(r, function (r) { return r.kind === 'refund' ? -r.amountCents : r.amountCents; }), -sum(out, function (r) { return r.amountCents; })), rows: r.concat(out) };
    });
    function balances(domain) {
      var incoming = domain === 'invoices', txs = incoming ? payments(true) : outgoing(true);
      return list(domain).filter(function (r) { return !INVALID.test(r.status || ''); }).map(function (r) {
        var total = amount(r, 'totalCents'), due = dateKey(r.dueDate, tz);
        var applied = sum(txs.filter(function (t) { return (incoming ? t.invoiceId : t.expenseId) === r.id; }), function (t) { return incoming && t.kind === 'refund' ? -t.amountCents : t.amountCents; });
        return Object.assign({}, r, { dueDay: due, paidCents: applied, balanceCents: Math.max(0, add(total, -applied)) });
      });
    }
    ['ar', 'ap'].forEach(function (prefix) {
      var domain = prefix === 'ar' ? 'invoices' : 'expenses', deps = [domain, prefix === 'ar' ? 'payments' : 'expensePayments'];
      [['DueToday', function (r) { return r.dueDay === today; }], ['Overdue', function (r) { return r.dueDay < today; }],
        ['Projected', function (r) { return r.dueDay >= today && r.dueDay >= p.from && r.dueDay <= p.to; }]].forEach(function (rule) {
        build(prefix + rule[0], deps, 'cents', function () { var r = balances(domain).filter(function (r) { return r.balanceCents > 0 && rule[1](r); }); return { value: sum(r, function (r) { return r.balanceCents; }), rows: r }; }, true);
      });
    });
    [['incomeCompetence', 'invoices'], ['expenseCompetence', 'expenses']].forEach(function (rule) {
      build(rule[0], [rule[1]], 'cents', function () {
        var all = list(rule[1]).filter(function (r) { return !INVALID.test(r.status || ''); });
        if (all.some(function (r) { return !r.competenceDate; })) return { unavailable: 'explicit_competenceDate_required' };
        var rows = all.filter(function (r) { var day = dateKey(r.competenceDate, tz); return day >= p.from && day <= p.to; });
        return { value: sum(rows, function (r) { return amount(r, 'totalCents'); }), rows: rows };
      }, true);
    });

    build('trialsExpiring', ['accounts'], 'count', function () {
      var through = dayStart(nextDay(today, Number.isInteger(options.trialWindowDays) ? options.trialWindowDays : 7), tz);
      var r = accounts.filter(function (a) { return a.status === 'trial' && a.trialEndsAt && timestamp(a.trialEndsAt, tz) >= now && timestamp(a.trialEndsAt, tz) < through; });
      return { value: r.length, rows: r };
    }, true);
    [['publishedAccounts', PUBLISHED], ['activeAccounts', HUMAN]].forEach(function (rule) {
      build(rule[0], ['accounts', 'events'], 'count', function () {
        var ids = new Set(list('events').filter(function (e) { return accountIds.has(e.accountId) && rule[1].test(e.type) && inWindow(e.occurredAt); }).map(function (e) { return e.accountId; }));
        var r = accounts.filter(function (a) { return ids.has(a.id); }); return { value: r.length, rows: r };
      });
    });
    build('casesOverdue', ['cases'], 'count', function () {
      var r = list('cases').filter(function (c) { return !CLOSED.test(c.status || '') && c.nextActionAt && timestamp(c.nextActionAt, tz) < now; }); return { value: r.length, rows: r };
    }, true);
    build('openCases', ['cases'], 'count', function () { var r = list('cases').filter(function (c) { return !CLOSED.test(c.status || ''); }); return { value: r.length, rows: r }; }, true);
    build('openIncidents', ['incidents'], 'count', function () { var r = list('incidents').filter(function (i) { return !CLOSED.test(i.status || ''); }); return { value: r.length, rows: r }; }, true);
    build('paidWithoutAccess', ['accounts', 'payments'], 'count', function () {
      var all = payments(true).filter(function (r) { return r.kind === 'payment'; });
      if (all.some(function (r) { return typeof r.accessExpected !== 'boolean'; })) return { unavailable: 'explicit_access_reconciliation_required' };
      var threshold = now - (options.accessToleranceMinutes === undefined ? 5 : options.accessToleranceMinutes) * 60000;
      var ids = new Set(all.filter(function (r) { return r.accessExpected && timestamp(r.paidAt, tz) <= threshold && (!r.accessExpectedUntil || timestamp(r.accessExpectedUntil, tz) > now); }).map(function (r) { return r.accountId; }));
      var matched = accounts.filter(function (a) { return ids.has(a.id); });
      if (matched.some(function (a) { return !a.accessStatus; })) return { unavailable: 'access_status_unknown' };
      var r = matched.filter(function (a) { return !/^(active|allowed|granted|ativa|vitalicia)$/.test(a.accessStatus); }); return { value: r.length, rows: r };
    }, true);

    var cohortStatus = sourceState(snapshot, ['accounts', 'events', 'payments']);
    var cohort = { status: cohortStatus, size: null, mature: null, immature: null, published: null, checkout: null, paid: null, maturePaid: null, conversionPercentage: null,
      basis: 'account_created', observationDays: options.cohortObservationDays === undefined ? 30 : options.cohortObservationDays,
      drilldowns: {created:[],mature:[],immature:[],published:[],checkout:[],paid:[],maturePaid:[]},
      sequential: false, message: 'Marcos independentes da coorte de contas criadas; publicação não precisa anteceder checkout. Conversão usa a mesma janela fixa de observação.' };
    if (cohortStatus === 'ready') {
      try {
        var cohortAccounts = accounts.filter(function (a) { return inWindow(a.createdAt); });
        var observationDays = options.cohortObservationDays === undefined ? 30 : options.cohortObservationDays;
        assert(Number.isInteger(observationDays) && observationDays >= 0, 'invalid_cohort_window');
        var mature = cohortAccounts.filter(function (a) { return timestamp(a.createdAt, tz) + observationDays * DAY <= now; });
        function hasEvent(a, rx) { return list('events').some(function (e) { return e.accountId === a.id && rx.test(e.type) && timestamp(e.occurredAt, tz) >= timestamp(a.createdAt, tz) && atNow(e.occurredAt); }); }
        function hasPayment(a, fixedWindow) { return payments(true).some(function (r) {
          var paid = timestamp(r.paidAt, tz), created = timestamp(a.createdAt, tz);
          return r.accountId === a.id && r.kind === 'payment' && r.amountCents > 0 && paid >= created && (!fixedWindow || paid <= created + observationDays * DAY);
        }); }
        cohort.size = cohortAccounts.length; cohort.mature = mature.length; cohort.immature = cohortAccounts.length - mature.length;
        var matureIds = new Set(mature.map(function (a) { return a.id; }));
        cohort.drilldowns = copy({created:cohortAccounts,mature:mature,immature:cohortAccounts.filter(function (a) { return !matureIds.has(a.id); }),
          published:cohortAccounts.filter(function (a) { return hasEvent(a, PUBLISHED); }),
          checkout:cohortAccounts.filter(function (a) { return hasEvent(a, /^checkout_started$/); }),
          paid:cohortAccounts.filter(function (a) { return hasPayment(a, false); }),maturePaid:mature.filter(function (a) { return hasPayment(a, true); })});
        cohort.published = cohort.drilldowns.published.length;
        cohort.checkout = cohort.drilldowns.checkout.length;
        cohort.paid = cohort.drilldowns.paid.length; cohort.maturePaid = cohort.drilldowns.maturePaid.length;
        cohort.conversionPercentage = percent(cohort.maturePaid, mature.length);
      } catch (e) { cohort.status = 'error'; cohort.message = e.message; }
    }

    function buckets(granularity) {
      var keys = [], cursor = p.from;
      while (cursor <= p.to) { var key = granularity === 'monthly' ? cursor.slice(0, 7) : cursor; if (keys.indexOf(key) < 0) keys.push(key); cursor = nextDay(cursor); }
      return keys.map(function (key) {
        var point = { key: key, metrics: {} };
        ['cashIn', 'refunds', 'cashOut', 'netCash', 'incomeCompetence', 'expenseCompetence', 'arProjected', 'apProjected'].forEach(function (name) {
          var m = metrics[name], future = key > today.slice(0, key.length), projected = /Projected$|Competence$/.test(name);
          var status = m.status === 'ready' && future && !projected ? 'unavailable' : m.status;
          var value = null;
          if (status === 'ready') value = sum(details[name].rows.filter(function (r) {
            var d = /Projected$/.test(name) ? r.dueDate : /Competence$/.test(name) ? r.competenceDate : r.paidAt;
            return dateKey(d, tz).slice(0, key.length) === key;
          }), function (r) {
            if (/Projected$/.test(name)) return r.balanceCents;
            if (/Competence$/.test(name)) return r.totalCents;
            if (name === 'netCash') return r.kind === 'refund' || r.expenseId ? -r.amountCents : r.amountCents;
            return r.amountCents;
          });
          point.metrics[name] = { status: status, value: value, unit: 'cents' };
        });
        var lastDay = granularity === 'monthly' ? new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0)).toISOString().slice(0, 10) : key;
        var at = Math.min(dayStart(nextDay(lastDay < p.to ? lastDay : p.to), tz) - 1, now);
        var mrrState = sourceState(snapshot, subDomains);
        if (key > today.slice(0, key.length)) mrrState = 'unavailable';
        try { point.metrics.mrr = { status: mrrState, value: mrrState === 'ready' ? sum(activeContracts(at), function (s) { return s.monthlyCents; }) : null, unit: 'cents', basis: 'end_of_bucket_stock' }; }
        catch (e) { point.metrics.mrr = { status: 'error', value: null, unit: 'cents', message: e.message }; }
        return point;
      });
    }
    return { period: p, asOf: new Date(now).toISOString(), observedEndAtExclusive: new Date(observedEnd).toISOString(), today: today,
      metrics: metrics, charts: { daily: buckets('daily'), monthly: buckets('monthly') }, cohort: cohort, drilldowns: details };
  }
  function drilldown(snapshot, metric, filters) {
    var result = compute(snapshot, filters || {});
    assert(Object.prototype.hasOwnProperty.call(result.drilldowns, metric), 'unknown_metric');
    var out = result.drilldowns[metric], rows = out.rows;
    if (filters && filters.accountId) rows = rows.filter(function (r) { return (r.accountId || r.id) === filters.accountId; });
    if (filters && filters.rowStatus) rows = rows.filter(function (r) { return r.status === filters.rowStatus; });
    if (filters && filters.product) {
      var ids = new Set((snapshot.accounts || []).filter(function (a) { return a.product === filters.product; }).map(function (a) { return a.id; }));
      rows = rows.filter(function (r) { return ids.has(r.accountId || r.id); });
    }
    return Object.assign({}, out, { rows: rows, count: rows.length });
  }
  return Object.freeze({ money: money, dateKey: dateKey, period: period, compute: compute, drilldown: drilldown });
});
