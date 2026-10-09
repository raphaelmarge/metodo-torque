'use strict';

// Runs the real application functions in a browser-shaped VM. All Supabase
// methods are in-memory mocks; fetch and external modules are unavailable.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {randomUUID} = require('node:crypto');

const hostingPath = path.resolve(__dirname, '../.openai/hosting.json');
const staticDirectory = fs.existsSync(hostingPath)
  ? JSON.parse(fs.readFileSync(hostingPath, 'utf8')).static?.directory || 'dist'
  : 'dist';
const appCandidates = [
  path.resolve(__dirname, '..', staticDirectory, 'app.js'),
  path.resolve(__dirname, '../dist/app.js'),
  path.resolve(__dirname, '../app.js')
];
const appPath = appCandidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
assert(appPath, 'Application source not found in the configured static directory, dist/, or app.js beside checks/.');
const original = fs.readFileSync(appPath, 'utf8');
const source = original
  .replace(/^import \{createPlatform\} from '\.\/platform\.js';\r?\n/, '')
  .replace(/^start\(\)\.catch\([^\n]*\);\r?$/m, '');
assert.notEqual(source, original, 'The module import and automatic bootstrap must be intercepted.');
assert(!/^import /m.test(source), 'Unexpected import: update the isolated harness explicitly.');
assert(!/^start\(\)/m.test(source), 'Unexpected bootstrap: the harness must invoke start explicitly.');

const A = {id: 'unit-user-a', email: 'paciente-a@example.test', user_metadata: {}};
const B = {id: 'unit-user-b', email: 'paciente-b@example.test', user_metadata: {}};
const invite = 'a'.repeat(64);
const privateArrays = ['patients', 'plans', 'logs', 'appointments', 'messages', 'challenges', 'resources', 'records', 'finances', 'posts', 'interactions'];

class MemoryStorage {
  constructor() { this.items = new Map(); this.failRemove = false; }
  get length() { return this.items.size; }
  key(i) { return [...this.items.keys()][i] ?? null; }
  getItem(key) { return this.items.get(String(key)) ?? null; }
  setItem(key, value) { this.items.set(String(key), String(value)); }
  removeItem(key) { if (this.failRemove) throw Error('Simulated storage removal failure'); this.items.delete(String(key)); }
  clear() { this.items.clear(); }
}

function harness(options = {}) {
  const localStorage = options.localStorage || new MemoryStorage();
  const sessionStorage = options.sessionStorage || new MemoryStorage();
  const makeSession = user => user ? {user, access_token: 'unit-access-token', refresh_token: 'unit-refresh-token'} : null;
  let activeClient;
  let storageKey;
  const clients = [];
  const storedSession = () => JSON.parse(localStorage.getItem(storageKey) || 'null');
  const events = new Map();
  const calls = {signOut: [], signUp: [], resetPasswordForEmail: [], updateUser: [], rpc: [], load: 0, reload: 0, stopRefresh: 0, startRefresh: 0, getUser: 0};
  let bootstrapEvent = options.bootstrapEvent;
  const location = new URL(options.url || 'https://unit.invalid/');
  location.reload = () => { calls.reload++; };
  const history = {replaceState(_state, _title, next) { location.href = new URL(next, location).href; }};
  const nodes = new Map();
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, {
      id, value: '', textContent: '', style: {}, dataset: {}, disabled: false, isConnected: true, open: false,
      close() { this.open = false; }, showModal() { this.open = true; }, select() {},
      set innerHTML(html) {
        this.html = String(html);
        if (id !== 'app') return;
        for (const [key, value] of [...nodes]) if (!['app', 'modal', 'modal-body', 'toast'].includes(key)) {
          value.isConnected = false; nodes.delete(key);
        }
        for (const match of this.html.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)) {
          const el = node(match[1]);
          el.value = (match[0].match(/\bvalue="([^"]*)"/) || [])[1] || '';
          el.disabled = /\bdisabled(?:\s|>|=)/.test(match[0]);
        }
        if (nodes.has('auth-form')) {
          const submit = this.html.match(/<button[^>]*type="submit"[^>]*>/)?.[0] || '';
          node('auth-form button[type=submit]').disabled = /\bdisabled(?:\s|>|=)/.test(submit);
        }
      },
      get innerHTML() { return this.html || ''; }
    });
    return nodes.get(id);
  }
  for (const id of ['app', 'modal', 'modal-body', 'toast']) node(id);
  const document = {
    querySelector(selector) { return nodes.get(selector.replace(/^#/, '')) || null; },
    querySelectorAll() { return []; },
    documentElement: {style: {setProperty() {}}},
    body: {classList: {add() {}, remove() {}, toggle() {}}}
  };
  function createClient(url, _publishableKey, clientOptions = {}) {
    const clientStorage = clientOptions.auth?.storage || localStorage;
    const clientKey = clientOptions.auth?.storageKey || 'sb-' + new URL(url).hostname.split('.')[0] + '-auth-token';
    storageKey = clientKey;
    assert.equal(clientKey, 'sb-unit-project-auth-token', 'The application auth key must match its configured project URL.');
    if (!clients.length && 'user' in options) {
      const session = makeSession(options.user);
      if (session) localStorage.setItem(clientKey, JSON.stringify(session));
      else localStorage.removeItem(clientKey);
    }
    let listener;
    const readSession = async () => JSON.parse((await clientStorage.getItem(clientKey)) || 'null');
    const auth = {
    storageKey: clientKey, storage: clientStorage,
    onAuthStateChange(callback) { listener = callback; return {data: {subscription: {unsubscribe() { listener = null; }}}}; },
    async getSession() {
      const session = await readSession();
      if (bootstrapEvent) { const event = bootstrapEvent; bootstrapEvent = null; listener?.(event, session); }
      return {data: {session}, error: null};
    },
    async getUser() {
      calls.getUser++;
      const user = 'verifiedUser' in options ? options.verifiedUser : (await readSession())?.user || null;
      return {data: {user}, error: options.getUserError || null};
    },
    async signOut(config) {
      calls.signOut.push(config);
      if (options.signOutThrows) throw Error('Simulated network failure');
      if (options.signOutError) return {error: {message: 'Simulated network failure'}};
      await clientStorage.removeItem(clientKey);
      listener?.('SIGNED_OUT', null);
      return {error: null};
    },
    stopAutoRefresh() { calls.stopRefresh++; },
    startAutoRefresh() { calls.startRefresh++; },
    async updateUser(data) { calls.updateUser.push(data); return {data: {user: storedSession()?.user}, error: null}; },
    async signInWithPassword() { return {data: {user: storedSession()?.user, session: storedSession()}, error: null}; },
    async signUp(data) {
      if (!options.allowSignUp) throw Error('Sign-up is outside these regressions.');
      calls.signUp.push(data);
      return {data: {user: null, session: null}, error: null};
    },
    async resetPasswordForEmail(email, config) {
      calls.resetPasswordForEmail.push({email, config});
      return {data: {}, error: null};
    }
    };
    const client = {
      auth, from: query,
      emit(event, user) { return listener?.(event, makeSession(user)); },
      async rpc(name, data) { calls.rpc.push({name, data}); return {data: {}, error: null}; }
    };
    clients.push(client); activeClient = client; return client;
  }
  function query(table) {
    const filters = {};
    const q = {
      select() { return q; }, eq(key, value) { filters[key] = value; return q; },
      order() { return q; }, range() { return q; },
      async maybeSingle() { return options.queryError ? {data: null, error: {message: 'Simulated offline query failure'}} : {data: options.role === 'nutri' && table === 'clinics' ? clinic() : null, error: null}; },
      async single() { return {data: table === 'clinics' ? clinic() : null, error: null}; },
      then(resolve, reject) {
        const data = table === 'patients' && !options.noPatient ? [{id: 'unit-patient', clinic_id: 'unit-clinic', clinician_id: 'unit-nutri', user_id: storedSession()?.user?.id, name: 'Paciente', email: storedSession()?.user?.email, goal: 'Rotina', restrictions: ''}] : [];
        return Promise.resolve({data, error: null}).then(resolve, reject);
      }
    };
    return q;
  }
  function clinic() { return {id: 'unit-clinic', name: 'Consultório', professional_name: 'Nutricionista', color: '#5de0b4', weekly_goal: 5, logo: ''}; }
  const context = vm.createContext({
    URL, URLSearchParams, Date, console, TextEncoder, AbortController, crypto: {randomUUID},
    window: {TORQUE_NUTRI_CONFIG: {supabaseUrl: 'https://unit-project.supabase.test', publishableKey: 'unit-test'}},
    supabase: {createClient}, document, localStorage, sessionStorage, location, history,
    navigator: {onLine: options.online !== false}, requestAnimationFrame(fn) { fn(); }, scrollTo() {},
    setTimeout() { return 1; }, clearTimeout() {},
    addEventListener(event, fn) { events.set(event, fn); },
    fetch() { throw Error('Network access is forbidden in this test.'); },
    createPlatform() { return {
      pages: [['overview', 'O', 'Consultório']], patientPages: [], seed() {}, bind() {},
      views: {overview: () => '<div>Consultório</div>', today: () => '<div>Paciente</div>'},
      async load() { calls.load++; }, resources() { return []; }
    }; }
  });
  vm.runInContext(source + '\n;globalThis.__authAccess = {S,start,action,authSubmit,authView,joinView,loadData,cacheSnapshot,restoreSnapshot,getMode:()=>authMode,setMode:v=>authMode=v,getInvite:()=>pendingInvite};', context, {filename: appPath});
  const api = context.__authAccess;
  return {
    ...api, calls, nodes, localStorage, sessionStorage, location, storageKey, events, clients,
    emit(event, user = storedSession()?.user) { return activeClient.emit(event, user); },
    html() { return node('app').innerHTML; },
    setStoredUser(user) { if (user) localStorage.setItem(storageKey, JSON.stringify(makeSession(user))); else localStorage.removeItem(storageKey); },
    setPassword() { node('auth-password').value = 'unit-password-123'; },
    async submitPassword() { this.setMode('password'); this.S.page = 'auth'; this.authView(); this.setPassword(); return this.authSubmit(); }
  };
}

function addPrivateData(h, user = A) {
  for (const key of privateArrays) h.S[key] = [{private: true}];
  h.S.selected = 'unit-patient'; h.S.edit = {private: true};
  h.S.clinic = {id: 'private-clinic-id', name: 'Private Clinic', professional_name: 'Private Professional', logo: 'private-logo', color: '#123456'};
  h.nodes.get('modal').open = true;
  h.localStorage.setItem('torque-nutri-cache:' + user.id, '{"private":true}');
  h.sessionStorage.setItem('torque-nutri-draft:' + user.id + ':unit-patient', '{"private":true}');
}
function assertPrivateDataCleared(h, {cacheRemains = false} = {}) {
  assert.equal(h.S.user, null);
  assert.equal(h.S.selected, null);
  assert.equal(h.S.edit, null);
  assert.notEqual(h.S.clinic.id, 'private-clinic-id');
  assert.notEqual(h.S.clinic.name, 'Private Clinic');
  assert.notEqual(h.S.clinic.professional_name, 'Private Professional');
  assert.notEqual(h.S.clinic.logo, 'private-logo');
  for (const key of privateArrays) assert.equal(h.S[key].length, 0, key + ' must be cleared');
  if (!cacheRemains) assert.equal(h.localStorage.getItem('torque-nutri-cache:' + A.id), null);
  assert.equal(h.sessionStorage.getItem('torque-nutri-draft:' + A.id + ':unit-patient'), null);
  assert.equal(h.nodes.get('modal').open, false);
  assert.equal(h.S.page, 'auth');
}

const tests = [];
function test(name, fn) { tests.push({name, fn}); }

test('confirmation links and their callback remain under /nutri/ with the patient invitation', async () => {
  for (const entry of ['https://unit.invalid/nutri/', 'https://unit.invalid/nutri/index.html']) {
    const h = harness({url: entry + '?perfil=patient&convite=' + invite, user: null, allowSignUp: true});
    await h.start();
    h.setMode('signup'); h.authView(); h.setPassword();
    h.nodes.get('auth-email').value = ' Paciente-A@Example.Test ';
    await h.authSubmit();
    assert.equal(h.calls.signUp.length, 1);
    assert.equal(h.calls.signUp[0].email, A.email);
    const redirect = new URL(h.calls.signUp[0].options.emailRedirectTo);
    assert.equal(redirect.origin, 'https://unit.invalid');
    assert.equal(redirect.pathname, '/nutri/', 'Confirmation must not redirect to the ecosystem root.');
    assert.equal(redirect.searchParams.get('entrar'), '1');
    assert.equal(redirect.searchParams.get('perfil'), 'patient');
    assert.equal(redirect.searchParams.get('convite'), invite);
    assert.equal(redirect.searchParams.has('recuperar'), false);
    assert.equal(h.calls.rpc.length, 0);
    const callback = harness({url: redirect.href, user: A});
    await callback.start();
    assert.equal(callback.location.pathname, '/nutri/');
    assert.equal(callback.S.page, 'invite');
    assert.equal(callback.getInvite(), invite);
    assert.equal(callback.calls.rpc.filter(call => call.name === 'redeem_patient_invite').length, 0,
      'Confirmation must still require explicit invitation redemption.');
  }
});

test('recovery email redirects remain under /nutri/ and retain patient invitation context', async () => {
  for (const entry of ['https://unit.invalid/nutri/', 'https://unit.invalid/nutri/index.html']) {
    const h = harness({url: entry + '?perfil=patient&convite=' + invite, user: null});
    await h.start();
    h.setMode('recovery'); h.authView();
    h.nodes.get('auth-email').value = ' Paciente-A@Example.Test ';
    await h.authSubmit();
    assert.equal(h.calls.resetPasswordForEmail.length, 1);
    assert.equal(h.calls.resetPasswordForEmail[0].email, A.email);
    const redirect = new URL(h.calls.resetPasswordForEmail[0].config.redirectTo);
    assert.equal(redirect.origin, 'https://unit.invalid');
    assert.equal(redirect.pathname, '/nutri/', 'Recovery must not redirect to the ecosystem root.');
    assert.equal(redirect.searchParams.get('recuperar'), '1');
    assert.equal(redirect.searchParams.has('entrar'), false);
    assert.equal(redirect.searchParams.get('perfil'), 'patient');
    assert.equal(redirect.searchParams.get('convite'), invite);
    assert.equal(h.getInvite(), invite);
    assert.equal(h.calls.updateUser.length, 0);
    assert.equal(h.calls.rpc.length, 0);
  }
});

test('a verified recovery callback cleans tokens while preserving /nutri/ and invitation context', async () => {
  const h = harness({
    url: 'https://unit.invalid/nutri/?recuperar=1&code=unit-code&type=recovery&perfil=patient&convite=' + invite
      + '&keep=yes#access_token=unit&refresh_token=unit&type=recovery',
    user: A, bootstrapEvent: 'PASSWORD_RECOVERY'
  });
  await h.start();
  assert.equal(h.getMode(), 'password');
  h.setPassword(); await h.authSubmit();
  assert.equal(h.calls.updateUser.length, 1);
  assert.equal(h.location.origin, 'https://unit.invalid');
  assert.equal(h.location.pathname, '/nutri/', 'Auth URL cleanup must preserve the mounted app.');
  for (const key of ['recuperar', 'code', 'type']) assert.equal(h.location.searchParams.has(key), false, key);
  assert.equal(h.location.hash, '');
  assert.equal(h.location.searchParams.get('perfil'), 'patient');
  assert.equal(h.location.searchParams.get('convite'), invite);
  assert.equal(h.location.searchParams.get('keep'), 'yes');
  assert.equal(h.getInvite(), invite);
  assert.notEqual(h.getMode(), 'password');
  assert.equal(h.calls.rpc.filter(call => call.name === 'redeem_patient_invite').length, 0);
});

test('a recovery query without a session cannot update a password', async () => {
  const h = harness({url: 'https://unit.invalid/?recuperar=1', user: null});
  await h.start();
  assert.notEqual(h.getMode(), 'password');
  assert(!h.html().includes('Escolha uma nova senha.'));
  await assert.rejects(() => h.submitPassword());
  assert.equal(h.calls.updateUser.length, 0);
});

test('a normal authenticated session plus a recovery query is insufficient', async () => {
  const h = harness({url: 'https://unit.invalid/?recuperar=1', user: A});
  await h.start();
  assert.notEqual(h.getMode(), 'password');
  await assert.rejects(() => h.submitPassword());
  assert.equal(h.calls.updateUser.length, 0);
});

test('a PASSWORD_RECOVERY event for the verified current user permits one reset and cleans the URL', async () => {
  const h = harness({url: 'https://unit.invalid/?recuperar=1&code=unit-code&type=recovery&keep=yes#access_token=unit&refresh_token=unit&type=recovery', user: A, bootstrapEvent: 'PASSWORD_RECOVERY'});
  await h.start();
  assert.equal(h.getMode(), 'password');
  h.setPassword();
  await h.authSubmit();
  assert.equal(h.calls.updateUser.length, 1);
  assert(!h.location.search.includes('recuperar'));
  assert(!h.location.search.includes('code='));
  assert(!h.location.search.includes('type=recovery'));
  assert.equal(h.location.searchParams.get('keep'), 'yes');
  assert(!h.location.hash.includes('access_token'));
  assert(!h.location.hash.includes('refresh_token'));
  assert.notEqual(h.getMode(), 'password');
  await assert.rejects(() => h.submitPassword());
  assert.equal(h.calls.updateUser.length, 1);
});

test('a recovery event cannot reset a different verified account', async () => {
  const h = harness({url: 'https://unit.invalid/?recuperar=1', user: A, bootstrapEvent: 'PASSWORD_RECOVERY', verifiedUser: B});
  await h.start();
  await assert.rejects(() => h.submitPassword());
  assert.equal(h.calls.updateUser.length, 0);
});

test('changing accounts during recovery rejects the password reset', async () => {
  const h = harness({user: A, bootstrapEvent: 'PASSWORD_RECOVERY'});
  await h.start();
  h.setStoredUser(B); h.emit('SIGNED_IN', B);
  assert.equal(h.calls.reload, 1);
  await assert.rejects(() => h.submitPassword());
  assert.equal(h.calls.updateUser.length, 0);
});

test('a recovery event for another account removes the previous clinical data', async () => {
  const h = harness({user: B});
  await h.start(); addPrivateData(h, B);
  h.setStoredUser(A); h.emit('PASSWORD_RECOVERY', A);
  assert.equal(h.S.user.id, A.id);
  for (const key of privateArrays) assert.equal(h.S[key].length, 0, key);
  assert.notEqual(h.S.clinic.name, 'Private Clinic');
  assert.equal(h.localStorage.getItem('torque-nutri-cache:' + B.id), null);
  assert.equal(h.sessionStorage.getItem('torque-nutri-draft:' + B.id + ':unit-patient'), null);
  assert.equal(h.nodes.get('modal').open, false);
});

test('an existing patient session opens the pending invitation without redeeming it', async () => {
  const h = harness({url: 'https://unit.invalid/?convite=' + invite, user: A});
  await h.start();
  assert.equal(h.S.page, 'invite');
  assert(h.html().includes(A.email), 'The connected account must be visible before redemption.');
  assert(/Trocar|trocar/.test(h.html()), 'The invitation screen must offer account switching.');
  assert.equal(h.calls.rpc.filter(x => x.name === 'redeem_patient_invite').length, 0);
  assert.equal(h.getInvite(), invite);
});

test('switching accounts from an invitation preserves the code and clears the previous session', async () => {
  const h = harness({url: 'https://unit.invalid/?convite=' + invite, user: A});
  await h.start();
  await h.nodes.get('invite-switch').onclick();
  assert.equal(h.S.user, null);
  assert.equal(h.S.page, 'auth');
  assert.equal(h.getInvite(), invite);
  assert.equal(h.sessionStorage.getItem('torque-nutri-invite'), invite);
  assert.equal(h.localStorage.getItem(h.storageKey), null);
  assert.equal(h.calls.rpc.filter(x => x.name === 'redeem_patient_invite').length, 0);
});

test('a pending invitation is redeemed only after the explicit button and then removed', async () => {
  const h = harness({url: 'https://unit.invalid/?convite=' + invite, user: A});
  await h.start();
  assert.equal(h.calls.rpc.length, 0);
  await h.nodes.get('invite-redeem').onclick();
  assert.equal(h.calls.rpc.filter(x => x.name === 'redeem_patient_invite').length, 1);
  assert.equal(h.calls.rpc[0].data.p_code, invite);
  assert.equal(h.getInvite(), '');
  assert.equal(h.sessionStorage.getItem('torque-nutri-invite'), null);
  assert(!h.location.search.includes('convite'));
});

test('revocation observed online invalidates an earlier clinical snapshot before the next offline boot', async () => {
  const options = {url: 'https://unit.invalid/nutri/?perfil=patient', user: A};
  const h = harness(options);
  await h.start();
  h.S.records = [{id: 'private-assessment', patient_id: 'unit-patient', kind: 'assessment', data: {weight: 70}}];
  h.S.clinic.name = 'Previous Private Clinic';
  h.cacheSnapshot();
  const snapshotKey = 'torque-nutri-cache:' + A.id, queueKey = 'torque-nutri-queue:' + A.id;
  const draftKey = 'torque-nutri-draft:' + A.id + ':unit-patient';
  const queue = JSON.stringify([{operationId: randomUUID(), userId: A.id, patientId: 'unit-patient', day: '2026-10-08', patch: {waterDelta: 250}}]);
  h.localStorage.setItem(queueKey, queue);
  h.sessionStorage.setItem(draftKey, '{"clinicalDraft":true}');
  const before = harness({url: options.url, localStorage: h.localStorage, sessionStorage: h.sessionStorage, online: false, queryError: true});
  await before.start();
  assert.equal(before.S.page, 'today', 'A previously authorized snapshot must really be restorable before revocation.');
  assert.equal(before.S.records[0].id, 'private-assessment');

  options.noPatient = true;
  await h.loadData();
  assert.equal(h.S.user.id, A.id, 'Revocation of a care relationship must retain the authenticated account.');
  assert.equal(h.S.page, 'join');
  assert.equal(h.S.patients.length, 0);
  assert.equal(h.S.records.length, 0);
  assert.notEqual(h.S.clinic.name, 'Previous Private Clinic');
  assert.equal(h.localStorage.getItem(snapshotKey), null);
  assert.equal(h.sessionStorage.getItem(draftKey), null);
  assert.equal(h.localStorage.getItem(queueKey), queue, 'The per-user queue must be preserved.');

  const online = harness({url: options.url, localStorage: h.localStorage, sessionStorage: h.sessionStorage, noPatient: true});
  await online.start();
  assert.equal(online.S.page, 'join');
  assert.equal(online.calls.rpc.length, 0, 'Boot must not replay queued writes without an authorized patient relationship.');
  assert.equal(h.localStorage.getItem(queueKey), queue);
  const offline = harness({url: options.url, localStorage: h.localStorage, sessionStorage: h.sessionStorage, online: false, queryError: true});
  await offline.start();
  assert.equal(offline.S.page, 'auth');
  assert.equal(offline.restoreSnapshot(), false);
  assert(!offline.S.records.some(x => x.id === 'private-assessment'));
  assert.equal(h.localStorage.getItem(queueKey), queue);
});

test('known revocation cannot restore clinical data when snapshot removal fails', async () => {
  const options = {url: 'https://unit.invalid/nutri/?perfil=patient', user: A};
  const h = harness(options);
  await h.start();
  h.S.records = [{id: 'revoked-private-record', patient_id: 'unit-patient', data: {weight: 70}}];
  h.cacheSnapshot();
  const queueKey = 'torque-nutri-queue:' + A.id;
  h.localStorage.setItem(queueKey, '[{"preserved":true}]');
  options.noPatient = true;
  h.localStorage.failRemove = true;
  await assert.rejects(() => h.loadData(), /Não foi possível apagar todos os dados locais/);
  assert.equal(h.S.page, 'auth');
  assert.equal(h.S.records.length, 0);
  assert.equal(h.restoreSnapshot(), false, 'Pending cleanup must also block restoration within the current runtime.');
  assert(h.localStorage.getItem('torque-nutri-cache:' + A.id), 'The test must leave a failed-to-remove snapshot entry.');
  const offline = harness({url: options.url, localStorage: h.localStorage, sessionStorage: h.sessionStorage, online: false, queryError: true});
  await offline.start();
  assert.equal(offline.S.page, 'auth');
  assert.equal(offline.restoreSnapshot(), false, 'The persistent invalidation must survive a new runtime.');
  assert(!offline.S.records.some(x => x.id === 'revoked-private-record'));
  assert.equal(h.localStorage.getItem(queueKey), '[{"preserved":true}]');
  h.localStorage.failRemove = false;
  await h.loadData();
  assert.equal(h.S.page, 'join');
  assert.equal(h.localStorage.getItem('torque-nutri-cache:' + A.id), null);
  assert.equal(h.localStorage.getItem(queueKey), '[{"preserved":true}]');
});

for (const [label, behavior] of [['returned network error', {signOutError: true}], ['thrown network error', {signOutThrows: true}], ['successful remote logout', {}]]) {
  test('logout clears private state and persisted authentication after ' + label, async () => {
    const h = harness({user: A, ...behavior});
    await h.start(); addPrivateData(h);
    await h.action('logout');
    assertPrivateDataCleared(h);
    assert.equal(h.localStorage.getItem(h.storageKey), null);
    assert(h.calls.signOut.some(x => x?.scope === 'local'), 'Logout must revoke the session on this device.');
    const reload = harness({localStorage: h.localStorage, sessionStorage: h.sessionStorage, url: h.location.href});
    await reload.start();
    assert.equal(reload.S.user, null, 'Reload must not reopen the signed-out account.');
  });
}

test('an external SIGNED_OUT event clears private state and recovery permission', async () => {
  const h = harness({url: 'https://unit.invalid/?recuperar=1', user: A, bootstrapEvent: 'PASSWORD_RECOVERY'});
  await h.start(); addPrivateData(h);
  h.setStoredUser(null); h.emit('SIGNED_OUT', null);
  assertPrivateDataCleared(h);
  await assert.rejects(() => h.submitPassword());
  assert.equal(h.calls.updateUser.length, 0);
});

test('a retired client cannot restore tokens or remove a later account session', async () => {
  const h = harness({user: A, signOutError: true});
  await h.start();
  const oldClient = h.clients[0];
  await h.action('logout');
  assert.equal(h.localStorage.getItem(h.storageKey), null);
  await oldClient.auth.storage.setItem(h.storageKey, JSON.stringify({user: A}));
  assert.equal(h.localStorage.getItem(h.storageKey), null, 'A late refresh must not repersist the old account.');
  h.setStoredUser(B);
  await oldClient.auth.storage.removeItem(h.storageKey);
  assert.equal(JSON.parse(h.localStorage.getItem(h.storageKey)).user.id, B.id, 'The retired client must not erase a later login.');
  assert.equal((await oldClient.auth.getSession()).data.session, null, 'The retired client cannot reopen persisted authentication.');
});

test('a storage removal failure reports that logout is not guaranteed and blocks authentication', async () => {
  const h = harness({user: A, signOutError: true});
  await h.start(); addPrivateData(h);
  h.localStorage.failRemove = true;
  await assert.rejects(() => h.action('logout'), /não está garantida/);
  assertPrivateDataCleared(h, {cacheRemains: true});
  assert(h.localStorage.getItem(h.storageKey), 'The test must really leave the failed-to-remove token behind.');
  assert(h.html().includes('A saída local não está garantida'));
  assert.equal(h.nodes.get('auth-form button[type=submit]').disabled, true);
  assert(!h.nodes.get('toast').textContent.includes('Você saiu deste aparelho.'));
  assert.equal(h.clients.length, 1, 'A replacement client must not read the uncleared token.');
  await assert.rejects(() => h.authSubmit(), /não está garantida/);
  h.localStorage.failRemove = false;
  await h.nodes.get('auth-retry-logout').onclick();
  assert.equal(h.localStorage.getItem(h.storageKey), null);
  assert.equal(h.localStorage.getItem('torque-nutri-cache:' + A.id), null, 'Retry must clear the UID remembered before S.user was reset.');
  assert.equal(h.nodes.get('auth-form button[type=submit]').disabled, false);
});

test('SIGNED_OUT with failed private cleanup blocks login until a successful retry', async () => {
  const h = harness({user: A});
  await h.start(); addPrivateData(h);
  h.setStoredUser(null);
  h.localStorage.failRemove = true;
  h.emit('SIGNED_OUT', null);
  assertPrivateDataCleared(h, {cacheRemains: true});
  assert(h.html().includes('Não foi possível apagar todos os dados locais'));
  assert.equal(h.nodes.get('auth-form button[type=submit]').disabled, true);
  h.localStorage.failRemove = false;
  await h.nodes.get('auth-retry-logout').onclick();
  assert.equal(h.localStorage.getItem('torque-nutri-cache:' + A.id), null);
  assert.equal(h.nodes.get('auth-form button[type=submit]').disabled, false);
});

(async () => {
  let failed = 0;
  for (const {name, fn} of tests) {
    try { await fn(); console.log('PASS ' + name); }
    catch (error) { failed++; console.error('FAIL ' + name + '\n' + (error.stack || error)); }
  }
  console.log(`${tests.length - failed}/${tests.length} authentication regressions passed.`);
  if (failed) process.exitCode = 1;
})();
