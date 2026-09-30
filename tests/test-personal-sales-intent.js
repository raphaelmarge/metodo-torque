/* Intencao de cadastro: runtime isolado, sem rede, contas ou pagamentos reais. */
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const code = fs.readFileSync(path.join(__dirname, '../assets/modulo-conta.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

async function setup(opts = {}) {
  const nodes = {}, calls = [], events = {}, replacements = [];
  const memory = new Map(Object.entries(opts.local || {}).map(([key, value]) => [key, JSON.stringify(value)]));
  const el = id => nodes[id] || (nodes[id] = {
    id, style: { cssText: '' }, value: '', hidden: false, disabled: false,
    textContent: '', innerHTML: '', events: {}, attributes: {}, focus() {},
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(name, fn) { this.events[name] = fn; }
  });
  const location = new URL(opts.url || 'https://teste.invalid/personal.html');
  const historyState = { from: 'fixture' };
  const history = {
    state: historyState,
    replaceState(state, title, next) {
      if (opts.historyError) throw Error('history unavailable');
      replacements.push({ state, title, next });
      location.href = new URL(next, location).href;
    }
  };
  let finishSession;
  const sessionResult = () => ({ data: { session: opts.session || null } });
  const sb = {
    auth: {
      getSession() {
        calls.push({ op: 'getSession' });
        if (opts.deferSession) return new Promise(resolve => { finishSession = () => resolve(sessionResult()); });
        return opts.sessionError ? Promise.reject(Error('offline')) : Promise.resolve(sessionResult());
      },
      onAuthStateChange(fn) { events.auth = fn; },
      async signUp(body) { calls.push({ op: 'signUp', body }); return { data: {} }; },
      async signInWithPassword(body) { calls.push({ op: 'signIn', body }); return { error: { message: 'fixture' } }; }
    },
    from(table) {
      calls.push({ op: 'from', table });
      return {
        select() { return this; },
        eq(key, value) { calls.push({ op: 'filter', key, value }); return this; },
        then(ok, bad) {
          return Promise.resolve({ data: [{ academia_id: 'fixture-studio', papel: 'dono', nome: 'Teste', academias: { nome: 'Studio teste' } }] }).then(ok, bad);
        }
      };
    },
    async rpc(name) { calls.push({ op: 'rpc', name }); throw Error('Unexpected RPC'); }
  };
  const ctx = {
    self: null, window: null, URL, URLSearchParams, location, history,
    document: { createElement: () => el('gateModulo'), body: { appendChild() {} }, getElementById: el },
    localStorage: { getItem: key => memory.get(key) || null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) },
    MT_CLOUD: { url: 'https://isolado.invalid', anonKey: 'fake-public' }, MT_supabase: sb,
    MTStore: { iniciaSync() { calls.push({ op: 'sync' }); } },
    console, addEventListener(name, fn) { (events[name] || (events[name] = [])).push(fn); }
  };
  ctx.self = ctx; ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  const api = ctx.MT_moduloConta({ marca: opts.marca || 'PERSONAL', fundo: '#000', cardBg: '#111', borda: '#333', grad: '#7344ee', corTag: '#eee', flag: 'teste' });
  await tick();
  return {
    el, calls, memory, events, replacements, location, historyState, api,
    async resolveSession() { finishSession(); await tick(); },
    async click(id) { el(id).events.click(); await tick(); },
    async submit() { el('mgForm').events.submit({ preventDefault() {} }); await tick(); },
    emit(name) { (events[name] || []).forEach(fn => fn()); }
  };
}

function login(x) {
  assert.equal(x.el('gateModulo').hidden, false);
  assert.equal(x.el('mgNome').hidden, true);
  assert.equal(x.el('mgSenha').attributes.autocomplete, 'current-password');
}
function cadastro(x) {
  assert.equal(x.el('gateModulo').hidden, false);
  assert.equal(x.el('mgNome').hidden, false);
  assert.equal(x.el('mgNome').required, true);
  assert.equal(x.el('mgSenha').attributes.autocomplete, 'new-password');
  assert.equal(x.el('mgSenha2').hidden, true);
}
let count = 0;
async function test(name, fn) { await fn(); count++; console.log('  OK ' + name); }

(async () => {
  await test('Sem intencao continua em Entrar', async () => { login(await setup()); });
  await test('Intencao exata abre cadastro sem criar conta ou alterar dados', async () => {
    const local = { trialFixture: { expires: 'fixture' }, referralFixture: { status: 'pending' } };
    const x = await setup({ url: 'https://teste.invalid/personal.html?entrada=criar&cupom=NAO_VALIDADO&status=pago#contexto', local });
    cadastro(x);
    assert.deepEqual(x.calls.map(c => c.op), ['getSession']);
    assert.deepEqual([...x.memory], Object.entries(local).map(([k, v]) => [k, JSON.stringify(v)]));
    assert.equal(x.location.href, 'https://teste.invalid/personal.html?cupom=NAO_VALIDADO&status=pago#contexto');
    assert.equal(x.replacements.length, 1);
    assert.equal(x.replacements[0].state, x.historyState);
  });
  await test('Valores desconhecidos, injetados ou duplicados nao selecionam cadastro', async () => {
    for (const query of ['?entrada=', '?entrada=entrar', '?entrada=CRIAR', '?entrada=criar%20', '?entrada=%3Cscript%3E', '?Entrada=criar', '?entrada=criar&entrada=entrar', '?entrada=criar&entrada=criar', '?entrada=criar%26status%3Dpago']) {
      const x = await setup({ url: 'https://teste.invalid/personal.html' + query });
      login(x);
      assert.equal(x.replacements.length, 0, query);
      assert.deepEqual(x.calls.map(c => c.op), ['getSession']);
    }
  });
  await test('Intencao pertence somente ao produto PERSONAL', async () => {
    const x = await setup({ marca: 'NUTRI', url: 'https://teste.invalid/nutricao.html?entrada=criar' });
    login(x);
    assert.equal(x.location.search, '?entrada=criar');
  });
  await test('Entrada explicita supera experimentar sem apagar a flag ou o trabalho', async () => {
    const local = { teste: '1', 'mtapp:ptStudio': { alunos: [{ id: 'fixture-aluno' }] } };
    const x = await setup({ url: 'https://teste.invalid/personal.html?entrada=criar', local });
    cadastro(x);
    assert.deepEqual([...x.memory], Object.entries(local).map(([k, v]) => [k, JSON.stringify(v)]));
    assert.equal((await setup({ local })).el('gateModulo').hidden, true);
  });
  await test('Conta conhecida continua em login mesmo com modo local e entrada criar', async () => {
    for (const identity of [{ 'mtapp:perfil': { nuvem: true } }, { 'mtsync:identidade': { user_id: 'fixture-user' } }]) {
      login(await setup({ url: 'https://teste.invalid/personal.html?entrada=criar', local: { teste: '1', ...identity } }));
    }
  });
  await test('Sessao ativa segue vinculo existente sem cadastro nem nova ilha', async () => {
    const x = await setup({ url: 'https://teste.invalid/personal.html?entrada=criar', session: { user: { id: 'fixture-user', email: 'teste@example.invalid' } } });
    assert.equal(x.el('gateModulo').hidden, true);
    assert.ok(x.calls.some(c => c.op === 'filter' && c.key === 'user_id' && c.value === 'fixture-user'));
    assert.ok(x.calls.some(c => c.op === 'sync'));
    assert.ok(!x.calls.some(c => c.op === 'signUp' || c.op === 'rpc'));
  });
  await test('Recuperacao por fragmento vence com e sem sessao', async () => {
    for (const session of [null, { user: { id: 'fixture-user' } }]) {
      const x = await setup({ url: 'https://teste.invalid/personal.html?entrada=criar#type=recovery&token=fixture', session });
      assert.equal(x.el('mgNome').hidden, true);
      assert.equal(x.el('mgSenha2').hidden, !session);
      assert.equal(x.el('mgSenha').hidden, !session);
      assert.equal(x.location.hash, '#type=recovery&token=fixture');
      assert.deepEqual(x.calls.map(c => c.op), ['getSession']);
    }
  });
  await test('Evento de recuperacao prevalece antes de getSession responder', async () => {
    const x = await setup({ url: 'https://teste.invalid/personal.html?entrada=criar', deferSession: true, session: { user: { id: 'fixture-user' } } });
    x.events.auth('PASSWORD_RECOVERY');
    await x.resolveSession();
    assert.equal(x.el('mgSenha2').hidden, false);
    assert.equal(x.el('mgNome').hidden, true);
    assert.deepEqual(x.calls.map(c => c.op), ['getSession']);
  });
  await test('Falha ao verificar sessao mantem login e permite tentar novamente', async () => {
    const x = await setup({ url: 'https://teste.invalid/personal.html?entrada=criar', sessionError: true });
    login(x);
    assert.equal(x.el('mgErro').hidden, false);
    assert.deepEqual(x.calls.map(c => c.op), ['getSession']);
  });
  await test('Escolha explicita de login durante espera nao e sobrescrita', async () => {
    for (const viaApi of [false, true]) {
      const x = await setup({ url: 'https://teste.invalid/personal.html?entrada=criar', deferSession: true });
      if (viaApi) x.api.abre(); else await x.click('mgAbaEntrar');
      await x.resolveSession();
      login(x);
    }
  });
  await test('Conta divergente durante espera preserva o login de protecao', async () => {
    const x = await setup({ url: 'https://teste.invalid/personal.html?entrada=criar', deferSession: true });
    x.emit('mt:conta-divergente');
    await x.resolveSession();
    login(x);
  });
  await test('Reabrir e recarregar nao reaplicam a intencao consumida', async () => {
    const x = await setup({ url: 'https://teste.invalid/personal.html?entrada=criar' });
    cadastro(x);
    x.api.abre(); login(x);
    x.api.abre('criar'); cadastro(x);
    x.api.abre(); login(x);
    assert.equal(x.replacements.length, 1);
    login(await setup({ url: x.location.href }));
  });
  await test('Historico indisponivel nao impede a selecao segura da aba', async () => {
    cadastro(await setup({ url: 'https://teste.invalid/personal.html?entrada=criar', historyError: true }));
  });
  await test('Cadastro so e enviado pela acao do usuario com payload existente', async () => {
    const x = await setup({ url: 'https://teste.invalid/personal.html?entrada=criar&cupom=fixture&trial=999' });
    x.el('mgNome').value = 'Studio teste';
    x.el('mgEmail').value = 'teste@example.invalid';
    x.el('mgSenha').value = 'senha-fixture';
    await x.submit();
    const sent = x.calls.find(c => c.op === 'signUp');
    assert.deepEqual(JSON.parse(JSON.stringify(sent.body)), { email: 'teste@example.invalid', password: 'senha-fixture', options: { data: { nome: 'Studio teste' } } });
    login(x);
  });
  console.log(count + ' cenarios de intencao de cadastro passaram.');
})().catch(error => { console.error(error); process.exitCode = 1; });
