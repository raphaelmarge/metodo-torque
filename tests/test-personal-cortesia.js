// Funcoes reais do Personal, com RPC/DOM locais. Sem credenciais ou dados de clientes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../personal.html'), 'utf8');
function extract(name) {
  const start = html.indexOf('  function ' + name + '(');
  assert(start >= 0, 'Funcao ausente: ' + name);
  const rest = html.slice(start), end = rest.search(/^  \}/m);
  assert(end > 0, 'Fim da funcao ausente: ' + name);
  return rest.slice(0, end + 3);
}
const courtesy = {status: 'cortesia', via: 'cortesia', cortesia: true,
  vence: '2030-04-15T02:30:00Z', travado: false};
function harness(initial = courtesy) {
  const nodes = new Map(), storage = new Map(), intervals = new Map(), events = new Map(), calls = [];
  const state = {native: false, logged: true, result: {data: courtesy, error: null}, cloud: null, now: '2029-01-01T12:00:00Z'};
  if (initial) storage.set('mtapp:ptAssinatura', JSON.stringify(initial));
  function $(id) {
    if (!nodes.has(id)) {
      let content = '';
      nodes.set(id, {hidden: false, style: {},
        get textContent() { return content; }, set textContent(v) { content = v; },
        get innerHTML() { return content; }, set innerHTML(v) { content = v; },
        querySelector: () => $('modalTitle')});
    }
    return nodes.get(id);
  }
  let timerId = 0;
  const context = vm.createContext({Intl, Math, JSON, String, isNaN,
    Date: class extends Date { static now() { return Date.parse(state.now); } },
    document: {hidden: false, addEventListener: (n, fn) => events.set('document:' + n, fn)},
    window: {addEventListener: (n, fn) => events.set('window:' + n, fn),
      Capacitor: {isNativePlatform: () => state.native}}, navigator: {userAgent: ''},
    localStorage: {getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v)},
    setInterval: (fn, ms) => {const id = ++timerId; intervals.set(id, {fn, ms}); return id;},
    clearInterval: id => intervals.delete(id), timerSeguro: fn => fn, $,
    S: {usuario: () => ({logado: state.logged}), cloud: () => state.cloud,
      todayISO: () => '2029-01-01', fmtData: v => v, plural: (n, s, p) => n + ' ' + (n === 1 ? s : p)}});
  vm.runInContext('var assConsultaSeq = 0; var assTimer = null;', context);
  for (const name of ['ehAppNativo', 'lojaAssinaturasUrl', 'leAssinatura', 'configuraOfertaAssinatura',
    'renderAssinatura', 'consultaAssinatura', 'reconsultaCortesia', 'iniciaConsultaAssinatura',
    'estaTravado', 'aplicaTrava', 'mostraTelaAssinatura']) vm.runInContext(extract(name), context);
  const pollingStart = html.indexOf('  setInterval(timerSeguro(reconsultaCortesia)');
  const pollingEnd = html.indexOf('  // A nuvem pode ficar pronta', pollingStart);
  assert(pollingStart >= 0 && pollingEnd > pollingStart, 'Registro de timer e retomada ausente');
  vm.runInContext(html.slice(pollingStart, pollingEnd), context);
  state.cloud = {aid: 'fixture-studio', client: {rpc: name => {
    calls.push(name);
    return state.reply ? state.reply() : Promise.resolve(state.result);
  }}};
  return {context, state, nodes, storage, intervals, events, calls, $,
    seed: ass => ass ? storage.set('mtapp:ptAssinatura', JSON.stringify(ass)) : storage.delete('mtapp:ptAssinatura')};
}
let checks = 0;
async function run(name, fn) {await fn(); checks++; console.log('PASS ' + name);}
const flush = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  await run('Cortesia informa data de Brasilia e nenhuma cobranca automatica', () => {
    const h = harness(); h.context.renderAssinatura();
    assert.match(h.$('assinaturaInfo').textContent, /14\/04\/2030, 23:30/);
    assert.match(h.$('assinaturaInfo').textContent, /Sem renovação nem cobrança automática/);
    assert.equal(h.$('faixaAssinatura').hidden, true);
    assert.equal(h.$('faixaAssinaturaBtn').hidden, true);
  });
  await run('Somente o veredito do servidor decide a trava, mesmo com relogio local errado', () => {
    const h = harness(); h.state.now = '2040-01-01T00:00:00Z';
    assert.equal(h.context.estaTravado(), false);
    h.seed({...courtesy, travado: true}); h.state.now = '2000-01-01T00:00:00Z';
    assert.equal(h.context.estaTravado(), true);
  });
  await run('Cortesia encerrada bloqueia e preserva exportacao e verificacao', () => {
    const h = harness({...courtesy, travado: true});
    h.context.renderAssinatura(); h.context.aplicaTrava();
    assert.match(h.$('assinaturaInfo').textContent, /Cortesia encerrada/);
    assert.equal(h.$('modalTitle').textContent, 'Sua cortesia terminou');
    for (const id of ['telaAssinatura', 'taBackup', 'taRever']) assert.equal(h.$(id).hidden, false);
    assert.equal(h.$('taDepois').hidden, true);
  });
  await run('Vencimento ausente ou invalido nao interrompe aplicacao da trava', async () => {
    for (const vence of [null, '', 'fixture-invalid']) {
      const h = harness(); h.state.result = {data: {...courtesy, vence, travado: true}, error: null};
      h.context.consultaAssinatura(); await flush();
      assert.equal(h.context.estaTravado(), true);
      assert.equal(h.$('telaAssinatura').hidden, false);
      assert.equal(h.$('modalTitle').textContent, 'Sua cortesia terminou');
    }
  });
  await run('Oferta nativa nao interrompe cortesia, mesmo quando forcada', () => {
    const h = harness(); h.state.native = true; h.$('telaAssinatura').hidden = true;
    h.context.mostraTelaAssinatura(true);
    assert.equal(h.$('telaAssinatura').hidden, true);
  });
  await run('Resposta de cortesia liberada remove a trava trial antiga', async () => {
    const h = harness({status: 'trial', travado: true}); h.context.aplicaTrava();
    assert.equal(h.$('telaAssinatura').hidden, false);
    h.context.consultaAssinatura(); await flush();
    assert.equal(h.context.estaTravado(), false);
    assert.equal(h.$('telaAssinatura').hidden, true);
    assert.deepEqual(h.calls, ['minha_assinatura']);
    assert.deepEqual([...h.storage.keys()], ['mtapp:ptAssinatura']);
  });
  await run('Timer de 60 segundos aplica novo veredito expirado', async () => {
    const h = harness(); h.$('telaAssinatura').hidden = true;
    const timers = [...h.intervals.values()].filter(t => t.ms === 60000);
    assert.equal(timers.length, 1);
    h.state.result = {data: {...courtesy, travado: true}, error: null};
    timers[0].fn(); await flush();
    assert.equal(h.context.estaTravado(), true);
    assert.equal(h.$('telaAssinatura').hidden, false);
  });
  await run('Retomar aba ou foco consulta cortesia visivel sem consultar outros status', async () => {
    const h = harness();
    h.context.document.hidden = true; h.events.get('document:visibilitychange')();
    assert.equal(h.calls.length, 0);
    h.context.document.hidden = false; h.events.get('document:visibilitychange')(); await flush();
    h.events.get('window:focus')(); await flush();
    assert.equal(h.calls.length, 2);
    h.seed({status: 'ativa', travado: false}); h.context.reconsultaCortesia();
    assert.equal(h.calls.length, 2);
  });
  await run('Resposta liberada antiga nao substitui resposta expirada mais recente', async () => {
    const h = harness(), pending = [];
    h.state.reply = () => new Promise(resolve => pending.push(resolve));
    h.context.consultaAssinatura(); h.context.consultaAssinatura();
    pending[1]({data: {...courtesy, travado: true}}); await flush();
    pending[0]({data: courtesy}); await flush();
    assert.equal(h.context.estaTravado(), true);
    assert.equal(h.$('telaAssinatura').hidden, false);
  });
  await run('Resposta de outra sessao ou academia nao contamina o cache', async () => {
    for (const change of ['tenant', 'client', 'logout']) {
      const h = harness({status: 'trial', travado: true}); let resolve;
      const before = h.storage.get('mtapp:ptAssinatura');
      h.state.reply = () => new Promise(r => {resolve = r;});
      h.context.consultaAssinatura();
      h.state.cloud = change === 'logout' ? null : {...h.state.cloud,
        ...(change === 'tenant' ? {aid: 'fixture-other'} : {client: {}})};
      resolve({data: courtesy}); await flush();
      assert.equal(h.storage.get('mtapp:ptAssinatura'), before);
    }
  });
  await run('Login tardio rearma consulta e aguarda a identidade da nuvem', async () => {
    const h = harness({status: 'trial', travado: true}), cloud = h.state.cloud;
    h.state.cloud = null; h.context.iniciaConsultaAssinatura();
    let retry = [...h.intervals.values()].find(t => t.ms === 3000);
    for (let i = 0; i < 21; i++) retry.fn();
    assert.equal([...h.intervals.values()].some(t => t.ms === 3000), false);
    const login = html.match(/depois: function \(\) \{ verificaOnboarding\(\); render\(\); ([^}]+) \},/);
    assert(login, 'Callback real de login ausente');
    vm.runInContext(login[1], h.context);
    retry = [...h.intervals.values()].find(t => t.ms === 3000);
    assert(retry, 'Login deve rearmar consulta depois do timer inicial terminar');
    h.state.cloud = {...cloud, aid: null}; retry.fn(); assert.equal(h.calls.length, 0);
    h.state.cloud = cloud; retry.fn(); await flush();
    assert.equal(h.context.estaTravado(), false);
    assert.equal(h.$('telaAssinatura').hidden, true);
  });
  await run('Falha de rede ou envelope invalido preserva ultimo veredito', async () => {
    for (const travado of [true, false]) {
      const h = harness({...courtesy, travado}), before = h.storage.get('mtapp:ptAssinatura');
      h.state.reply = () => Promise.reject(new Error('fixture offline'));
      h.context.consultaAssinatura(); await flush();
      assert.equal(h.storage.get('mtapp:ptAssinatura'), before);
      h.state.reply = null;
      for (const result of [null, {data: null}, {error: {message: 'fixture'}}, {data: {travado: !travado}}]) {
        h.state.result = result; h.context.consultaAssinatura(); await flush();
        assert.equal(h.storage.get('mtapp:ptAssinatura'), before);
      }
    }
    const h = harness(null); assert.equal(h.context.estaTravado(), false);
    h.seed({status: 'cortesia', cortesia: true}); assert.equal(h.context.estaTravado(), false);
  });
  for (const [status, label, banner] of [
    ['ativa', /Assinatura ativa/, false], ['vitalicia', /Acesso vitalício/, false],
    ['trial', /Teste grátis/, false], ['atrasada', /pagamento da assinatura/, true],
    ['bloqueada', /Assinatura vencida/, true], ['desconhecida', /Assinatura vencida/, true]
  ]) await run('Render legado preservado: ' + status, () => {
    const h = harness({status, vence: '2030-04-15T02:30:00Z', dias_ate_travar: 4});
    h.context.renderAssinatura();
    assert.match(h.$('assinaturaInfo').innerHTML, label);
    assert.equal(h.$('faixaAssinatura').hidden, !banner);
    assert(!h.$('assinaturaInfo').innerHTML.includes('Cortesia gratuita'));
  });
  await run('Scripts inline do Personal continuam sintaticamente validos', () => {
    let scripts = 0;
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (/\bsrc\s*=|application\/ld\+json/i.test(match[1])) continue;
      new vm.Script(match[2], {filename: 'personal-inline-' + (++scripts)});
    }
    assert(scripts > 0);
  });
  console.log(checks + ' grupos de cortesia passaram (somente fixtures locais).');
})().catch(error => {console.error(error); process.exitCode = 1;});
