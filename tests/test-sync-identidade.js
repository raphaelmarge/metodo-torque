/* Contratos de sincronização: contas fictícias, nenhuma rede ou navegador. */
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const code = fs.readFileSync(require('node:path').join(__dirname, '../apps/store.js'), 'utf8');
const tick = () => new Promise(r => setImmediate(r));
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
async function setup(opts = {}) {
  const memory = new Map(Object.entries(opts.local || {}).map(([k,v]) => [k, JSON.stringify(v)])), events = {}, calls = [];
  let authListener;
  const state = { session: opts.session === null ? null : { user: { id: 'user-a', email: 'a@example.invalid' } }, offline: !!opts.offline,
    memberError: opts.memberError, members: opts.members || [{ academia_id: 'academy-a', papel: 'funcionario', academias: { nome: 'Equipe fictícia' } }] };
  const client = { auth: { getSession: async () => { if (state.offline) throw Error('offline'); return { data: { session: state.session } }; }, onAuthStateChange: fn => authListener = fn },
    rpc(name, args) {
      const call = { rpc: name, args }; calls.push(call);
      if (typeof opts.rpc === 'function') return Promise.resolve(opts.rpc(name, args, call));
      if (name === 'dados_cas') {
        if (opts.sendPromise) return opts.sendPromise;
        return Promise.resolve({ data: [{ chave: args.p_chave, atualizado: '2026-09-06T13:00:00+00:00' }] });
      }
      if (name === 'dados_grava') {
        if (opts.sendPromise) return opts.sendPromise;
        return Promise.resolve({ data: args.p_linhas.map(x => ({ chave: x.chave, atualizado: '2026-09-06T13:00:00+00:00' })) });
      }
      if (name === 'app_aluno_publica_cas') {
        const fonte = (opts.rows || []).find(x => x.chave === 'mtapp:ptStudio');
        if (fonte && fonte.atualizado !== args.p_source_atualizado)
          return Promise.resolve({ error: { code: 'PT409', message: 'Conflito fictício' } });
        call.rows = args.p_linhas;
        return Promise.resolve({ data: { ok: true, publicados: args.p_linhas.length } });
      }
      if (name === 'app_aluno_publica') {
        call.rows = args.p_linhas;
        return Promise.resolve({ data: { ok: true, publicados: args.p_linhas.length } });
      }
      return Promise.resolve({ data: null });
    },
    from(table) {
      const call = { table, filters: [] }; calls.push(call);
      const query = { select() { return this; }, eq(k,v) { call.filters.push([k,v]); return this; }, gt() { return this; },
        upsert(rows) { call.rows = rows; return this; },
        then(ok,bad) { const result = table === 'membros' ? opts.membersPromise || Promise.resolve(state.memberError ? { error: { message: 'denied' } } : { data: state.members })
          : call.rows ? opts.sendPromise || Promise.resolve({ data: call.rows.map(x => ({ chave: x.chave, atualizado: '2026-09-06T13:00:00+00:00' })) })
          : opts.pullPromise || Promise.resolve({ data: opts.rows || [] });
          return result.then(ok,bad); }
      }; return query;
    }
  };
  const ctx = { console, Promise, Date, JSON, Math, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, alert() {},
    CustomEvent: function(type) { this.type = type; }, location: { pathname: '/personal.html' },
    document: { readyState: 'loading', hidden: false, addEventListener() {} },
    localStorage: { get length() { return memory.size; }, key: i => [...memory.keys()][i], getItem: k => memory.get(k) || null, setItem: (k,v) => memory.set(k,String(v)), removeItem: k => memory.delete(k) },
    addEventListener: (type,fn) => (events[type] ||= []).push(fn), dispatchEvent: e => (events[e.type] || []).forEach(fn => fn(e)),
    MT_CLOUD: { url: 'https://isolado.invalid', anonKey: 'ficticio' }, supabase: { createClient: () => client } };
  ctx.window = ctx; ctx.self = ctx; ctx.top = ctx; vm.createContext(ctx); vm.runInContext(code, ctx);
  const flush = async () => { await tick(); await tick(); };
  const start = async () => { ctx.MTStore.iniciaSync(); await flush(); };
  const emit = async type => { ctx.dispatchEvent({type}); await flush(); };
  const logout = async () => { authListener('SIGNED_OUT'); await flush(); };
  const changeAccount = async () => { authListener('SIGNED_IN',{user:{id:'user-b',email:'b@example.invalid'}}); await flush(); };
  return { ctx, calls, memory, state, start, emit, logout, flush, changeAccount };
}
let count = 0;
async function test(name, fn) { await fn(); count++; console.log('  ✅ ' + name); }
(async () => {
  await test('Cache não autoriza outra academia nem inventa papel de dono', async () => {
    const x = await setup({ local: { 'mtapp:academia': { id: 'academy-invasora', papel: 'dono' } } }); await x.start();
    assert.equal(x.ctx.MTStore.cloud().aid, 'academy-a');
    assert.equal(JSON.parse(x.memory.get('mtapp:academia')).papel, 'funcionario');
    assert.ok(x.calls[0].filters.some(([k,v]) => k === 'user_id' && v === 'user-a'));
    assert.ok(x.calls.filter(c => c.table === 'dados').every(c => !c.filters.some(([k,v]) => k === 'academia_id' && v !== 'academy-a')));
  });
  await test('Sem sessão, vínculo ou confirmação do servidor não acessa dados', async () => {
    for (const opts of [{session:null}, {members:[]}, {memberError:true}]) {
      const x = await setup(opts); await x.start(); assert.equal(x.ctx.MTStore.cloud(), null); assert.equal(x.calls.filter(c => c.table === 'dados').length, 0);
    }
  });
  await test('Outra pessoa não recebe nem envia o trabalho da conta anterior', async () => {
    const x = await setup({local:{'mtsync:identidade':{user_id:'user-b'}, 'mtapp:ptStudio':{alunos:[{id:'aluno-b'}]}}});
    let blocked = false; x.ctx.addEventListener('mt:conta-divergente', () => blocked = true); await x.start();
    assert.equal(blocked,true); assert.equal(x.calls.length,0); assert.match(x.memory.get('mtapp:ptStudio'), /aluno-b/);
  });
  await test('Mudança de equipe não transfere automaticamente dados da equipe anterior', async () => {
    const x = await setup({local:{'mtsync:identidade':{user_id:'user-a',academia_id:'academy-antiga'}}}); await x.start();
    assert.equal(x.ctx.MTStore.cloud(),null); assert.ok(!x.calls.some(c => c.table === 'dados'));
  });
  await test('Logout durante consulta de vínculo não restaura acesso nem cache', async () => {
    const pending = deferred(), x = await setup({membersPromise:pending.promise}); await x.start(); await x.logout();
    pending.resolve({data:[{academia_id:'academy-a',papel:'dono'}]}); await x.flush();
    assert.equal(x.ctx.MTStore.cloud(),null); assert.equal(x.memory.has('mtsync:identidade'),false); assert.ok(!x.calls.some(c => c.table === 'dados'));
  });
  await test('Resposta atrasada depois do logout não aplica dados remotos', async () => {
    const pending = deferred(), x = await setup({pullPromise:pending.promise}); await x.start(); await x.logout();
    pending.resolve({data:[{chave:'mtapp:ptStudio',valor:{alunos:[{id:'atrasado'}]},atualizado:'2026-09-06T13:00:00+00:00'}]}); await x.flush();
    assert.equal(x.memory.has('mtapp:ptStudio'),false); assert.equal(x.ctx.MTStore.cloud(),null);
  });
  await test('Troca de login em outra aba interrompe a sincronização imediatamente', async () => {
    const x = await setup(); await x.start(); let blocked=false;
    x.ctx.addEventListener('mt:conta-divergente',()=>blocked=true); await x.changeAccount();
    assert.equal(x.ctx.MTStore.cloud(),null); assert.equal(blocked,true);
  });
  await test('Sessão expirada conserva na fila o envio que estava em andamento', async () => {
    const pending = deferred(), x = await setup({sendPromise:pending.promise}); await x.start();
    x.ctx.MTStore.write('ptStudio',{alunos:[{id:'pendente'}]}); x.ctx.__MTSync.enviaSujas(); await x.emit('mt:sessao-caiu');
    assert.equal(x.ctx.__MTSync._estado.sujas['mtapp:ptStudio'],true); assert.match(x.memory.get('mtapp:ptStudio'),/pendente/);
    pending.resolve({data:[]}); await x.flush(); assert.equal(x.ctx.__MTSync._estado.sujas['mtapp:ptStudio'],true);
  });
  await test('Primeira abertura offline retoma ao voltar a conexão', async () => {
    const x = await setup({offline:true}); await x.start(); assert.equal(x.ctx.MTStore.cloud(),null);
    x.state.offline = false; await x.emit('online'); assert.equal(x.ctx.MTStore.cloud().aid,'academy-a');
  });
  await test('Membro removido com sessão válida para antes de consultar dados de novo', async () => {
    const x = await setup(); await x.start(); const antes=x.calls.filter(c=>c.table==='dados').length;
    x.state.members=[]; await x.emit('focus'); assert.equal(x.ctx.MTStore.cloud(),null);
    assert.equal(x.calls.filter(c=>c.table==='dados').length,antes);
  });
  await test('Mudança de papel interrompe a sessão anterior e pede nova validação', async () => {
    const x = await setup(); await x.start(); x.state.members=[{academia_id:'academy-a',papel:'dono'}];
    await x.emit('online'); assert.equal(x.ctx.MTStore.cloud(),null);
  });
  await test('Indisponibilidade da consulta não é tratada como revogação', async () => {
    const x = await setup(); await x.start(); x.state.memberError=true;
    await x.emit('online'); assert.ok(x.ctx.MTStore.cloud());
  });
  await test('Reconexão da mesma conta espera a nuvem antes de enviar pendências', async () => {
    const pull = deferred(), x = await setup({pullPromise:pull.promise}); await x.start();
    x.ctx.MTStore.write('ptStudio',{alunos:[{id:'pendente'}]}); x.ctx.__MTSync.enviaSujas();
    assert.ok(!x.calls.some(c => c.rows || c.rpc === 'dados_cas' || c.rpc === 'dados_grava')); pull.resolve({data:[]}); await x.flush();
    assert.ok(x.calls.some(c => c.rpc === 'dados_cas' && c.args.p_valor && c.args.p_valor.alunos && c.args.p_valor.alunos[0].id === 'pendente'));
  });
  console.log(count + ' cenários de identidade e reconexão passaram.');
})().catch(e => { console.error(e); process.exitCode = 1; });
