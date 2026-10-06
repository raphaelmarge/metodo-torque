/* Executa o handler real com Auth, banco e gateway inteiramente fictícios. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const code = stripTypeScriptTypes(fs.readFileSync(require('node:path').join(__dirname, '../supabase/functions/pagarme/index.ts'), 'utf8'));
let checks = 0;
async function test(label, run) { await run(); checks++; console.log('OK ' + label); }
function setup(opts = {}) {
  const calls = []; let handler, consultasMembros = 0;
  const env = { SUPABASE_URL: 'https://banco.invalid', SUPABASE_ANON_KEY: 'anon-ficticia', SUPABASE_SERVICE_ROLE_KEY: 'servico-ficticio', PAGARME_SECRET_KEY: 'gateway-ficticio', PAGARME_PUBLIC_KEY: 'publica-ficticia' };
  const context = { Request, Response, URL, console, btoa, encodeURIComponent,
    Deno: { env: { get: key => env[key] || '' }, serve: fn => { handler = fn; } },
    fetch: async (url, args = {}) => {
      const u = new URL(url), method = args.method || 'GET', body = args.body ? JSON.parse(args.body) : null;
      calls.push({ url: u, method, body });
      if (u.origin === env.SUPABASE_URL && u.pathname === '/auth/v1/user') {
        assert.equal(args.headers.apikey, env.SUPABASE_SERVICE_ROLE_KEY);
        return Response.json(opts.anonymous ? { id: 'user-ficticio', is_anonymous: true } : { id: 'user-ficticio' }, { status: opts.authError ? 401 : 200 });
      }
      if (u.origin === env.SUPABASE_URL && u.pathname === '/rest/v1/membros') {
        consultasMembros++;
        assert.equal(u.searchParams.get('papel'), 'eq.dono');
        assert.equal(u.searchParams.get('user_id'), 'eq.user-ficticio');
        assert.equal(u.searchParams.get('limit'), null, 'Não deve escolher o primeiro vínculo arbitrariamente');
        assert.equal(args.headers.Authorization, 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY);
        if (opts.memberNetwork) throw new Error('Rede fictícia');
        if (opts.memberError || (opts.memberErrorAfter && consultasMembros > 1)) return Response.json({}, { status: 500 });
        if (opts.memberMalformed) return Response.json({ rows: [] });
        return Response.json(opts.revokedAfter && consultasMembros > 1 ? [] : opts.members || [{ academia_id: 'academia-a', papel: 'dono' }]);
      }
      assert.equal(u.origin, 'https://api.pagar.me');
      assert.ok(/^\/core\/v5\/(orders|subscriptions)(\/[^/]+)?$/.test(u.pathname));
      assert.equal(args.headers.Authorization, 'Basic ' + btoa(env.PAGARME_SECRET_KEY + ':'));
      if (opts.gatewayNetwork && method === opts.gatewayNetwork) throw new Error('Gateway fictício indisponível');
      if (opts.gatewayError && method === opts.gatewayError) return Response.json({ message: 'Falha fictícia' }, { status: 503 });
      if (method === 'POST') return Response.json({ id: u.pathname.endsWith('orders') ? 'or_nova' : 'sub_nova', status: 'active', charges: [{ id: 'ch_ficticia', status: 'pending', last_transaction: { qr_code: 'PIX-FICTICIO' } }], card: { brand: 'Fictícia', last_four_digits: '0000' } });
      if (method === 'DELETE') return Response.json(opts.deleteResource || { id: 'sub_propria', status: 'canceled' });
      return Response.json(opts.resource || { id: decodeURIComponent(u.pathname.split('/').pop()), metadata: { academia_id: 'academia-a' }, status: 'active', next_billing_at: '2026-11-01', items: [{ pricing_scheme: { price: 12300 } }], charges: [{ status: 'paid', paid_at: '2026-10-06' }] });
    }
  };
  vm.runInNewContext(code, context);
  return { calls, get memberCalls() { return consultasMembros; }, async send(body, auth = 'Bearer jwt-ficticio') {
    const headers = { 'Content-Type': 'application/json' }; if (auth) headers.Authorization = auth;
    const r = await handler(new Request('https://edge.invalid/', { method: 'POST', headers, body: JSON.stringify(body) }));
    return { status: r.status, body: await r.json() };
  }, api() { return calls.filter(x => x.url.origin === 'https://api.pagar.me'); } };
}
const criar = { acao: 'criar', nome: 'Aluno fictício', valorCentavos: 12300, metodo: 'pix' };
const assinar = { acao: 'assinar', nome: 'Aluno fictício', valorCentavos: 12300, tokenCartao: 'token-ficticio' };
const cancelar = { acao: 'assinatura_cancela', assinaturaId: 'sub_propria' };
(async () => {
  for (const [label, auth, opts] of [['sem token', '', {}], ['chave anon', 'Bearer anon-ficticia', {}], ['sessão inválida', 'Bearer jwt-ficticio', { authError: true }], ['Auth anônimo', 'Bearer jwt-ficticio', { anonymous: true }]]) {
    await test(label + ' não alcança banco nem gateway', async () => { const x = setup(opts); assert.equal((await x.send(criar, auth)).status, 401); assert.equal(x.api().length, 0); assert.equal(x.memberCalls, 0); });
  }
  await test('JSON nulo e lista não causam erro interno', async () => { const x = setup(); assert.equal((await x.send(null)).status, 400); assert.equal((await x.send([])).status, 400); assert.equal(x.api().length, 0); });
  for (const members of [[], [{ academia_id: 'academia-a', papel: 'funcionario' }]]) {
    await test('Sem vínculo de dono, todas as ações financeiras são negadas', async () => {
      for (const body of [criar, assinar, cancelar, { acao: 'status', orderId: 'or_1' }, { acao: 'assinatura-status', assinaturaId: 'sub_1' }]) {
        const x = setup({ members }); assert.equal((await x.send(body)).status, 403); assert.equal(x.api().length, 0);
      }
    });
  }
  for (const opts of [{ memberError: true }, { memberMalformed: true }, { memberNetwork: true }]) {
    await test('Falha na leitura de autorização não vira vínculo vazio nem acesso', async () => { const x = setup(opts); assert.equal((await x.send(cancelar)).status, 503); assert.equal(x.api().length, 0); });
  }
  await test('Criação usa exclusivamente academia autorizada do servidor e preserva o valor do aluno', async () => {
    const x = setup(); const r = await x.send({ ...criar, metadata: { academia_id: 'academia-vitima' } });
    assert.equal(r.status, 200); assert.equal(r.body.orderId, 'or_nova'); assert.equal(r.body.pixCopiaECola, 'PIX-FICTICIO');
    assert.deepEqual(x.api()[0].body.metadata, { academia_id: 'academia-a', product: 'torque_aluno' }); assert.equal(x.api()[0].body.items[0].amount, 12300);
  });
  await test('Assinatura legada aceita tokenCartao e dia do vencimento sem mudar preços', async () => {
    const x = setup(); const r = await x.send({ ...assinar, diaVencimento: 31 }); assert.equal(r.body.assinaturaId, 'sub_nova');
    const b = x.api()[0].body; assert.equal(b.card_token, 'token-ficticio'); assert.equal(b.billing_day, 28); assert.equal(b.items[0].pricing_scheme.price, 12300); assert.equal(b.metadata.academia_id, 'academia-a');
  });
  const multi = [{ academia_id: 'academia-a', papel: 'dono' }, { academia_id: 'academia-b', papel: 'dono' }];
  await test('Dono de duas academias precisa escolher uma para criar, sem limit=1', async () => { const x = setup({ members: multi }); assert.equal((await x.send(criar)).status, 409); assert.equal((await x.send(assinar)).status, 409); assert.equal(x.api().length, 0); });
  await test('Escolha explícita de academia própria é aceita; academia alheia é negada', async () => {
    const x = setup({ members: multi }); assert.equal((await x.send({ ...criar, academiaId: 'academia-b' })).status, 200); assert.equal(x.api()[0].body.metadata.academia_id, 'academia-b');
    const y = setup({ members: multi }); assert.equal((await y.send({ ...assinar, academiaId: 'academia-vitima' })).status, 403); assert.equal(y.api().length, 0);
  });
  for (const body of [criar, assinar, cancelar]) await test('Pedido SaaS é bloqueado na API legada de alunos', async () => { const x = setup(); assert.equal((await x.send({ ...body, product: 'torque_personal_saas' })).status, 403); assert.equal(x.api().length, 0); });
  await test('Marcador SaaS não pode ser escondido dentro da metadata do pedido', async () => { const x = setup(); assert.equal((await x.send({ ...assinar, metadata: { product: 'torque_personal_saas' } })).status, 403); assert.equal(x.api().length, 0); });
  for (const [name, resource] of [
    ['outro profissional', { id: 'sub_propria', metadata: { academia_id: 'academia-b' }, status: 'active', private: 'não exibir' }],
    ['sem metadata', { id: 'sub_propria', status: 'active' }],
    ['metadata vazia', { id: 'sub_propria', metadata: { academia_id: '' } }],
    ['produto SaaS', { id: 'sub_propria', metadata: { academia_id: 'academia-a', product: 'torque_personal_saas' } }],
    ['ID divergente', { id: 'sub_outra', metadata: { academia_id: 'academia-a' } }]
  ]) await test(name + ': consulta e cancelamento sem permissão não retornam dados nem DELETE', async () => {
    for (const acao of ['assinatura_status', 'assinatura-cancelar']) {
      const x = setup({ resource }); const r = await x.send({ acao, assinaturaId: 'sub_propria', metadata: { academia_id: 'academia-a' } });
      assert.equal(r.status, 403); assert.deepEqual(Object.keys(r.body), ['erro']); assert.equal(x.api().filter(x => x.method === 'DELETE').length, 0);
    }
  });
  await test('Cobrança de outro profissional e cobrança sem vínculo não vazam status', async () => {
    for (const metadata of [undefined, { academia_id: 'academia-b' }, { academia_id: 'academia-a', product: 'torque_personal_saas' }]) {
      const x = setup({ resource: { id: 'or_1', metadata, status: 'paid' } }); assert.equal((await x.send({ acao: 'status', orderId: 'or_1' })).status, 403);
    }
  });
  await test('Consulta própria mantém resposta e alias com hífen', async () => {
    const x = setup(); assert.deepEqual(await x.send({ acao: 'assinatura-status', assinaturaId: 'sub_propria' }), { status: 200, body: { ok: true, status: 'active', proximaCobranca: '2026-11-01', valor: 12300 } });
    assert.deepEqual(await x.send({ acao: 'status', orderId: 'or_1' }), { status: 200, body: { ok: true, status: 'paid', pagoEm: '2026-10-06' } });
  });
  await test('Dono multiacademia consulta objeto pela metadata canônica, inclusive segunda academia', async () => {
    const x = setup({ members: multi, resource: { id: 'sub_b', metadata: { academia_id: 'academia-b' }, status: 'active' } }); assert.equal((await x.send({ acao: 'assinatura_status', assinaturaId: 'sub_b' })).status, 200);
    assert.equal((await x.send({ acao: 'assinatura_status', assinaturaId: 'sub_b', academiaId: 'academia-a' })).status, 403);
  });
  await test('Cancelamento próprio com alias consulta vínculo canônico e revalida dono antes de DELETE', async () => {
    const x = setup(); const r = await x.send({ ...cancelar, acao: 'assinatura-cancelar' }); assert.deepEqual(r, { status: 200, body: { ok: true, status: 'canceled' } });
    assert.deepEqual(x.api().map(x => x.method), ['GET', 'DELETE']); assert.equal(x.memberCalls, 2);
  });
  for (const opts of [{ revokedAfter: true }, { memberErrorAfter: true }]) await test('Vínculo revogado ou indisponível durante consulta impede DELETE', async () => { const x = setup(opts); const r = await x.send(cancelar); assert.ok(r.status === 403 || r.status === 503); assert.deepEqual(x.api().map(x => x.method), ['GET']); });
  for (const opts of [{ gatewayError: 'GET' }, { gatewayNetwork: 'GET' }]) await test('Falha ao consultar no gateway não tenta cancelamento', async () => { const x = setup(opts); assert.equal((await x.send(cancelar)).status, 502); assert.deepEqual(x.api().map(x => x.method), ['GET']); });
  for (const opts of [{ gatewayError: 'DELETE' }, { gatewayNetwork: 'DELETE' }]) await test('Falha no cancelamento não anuncia sucesso', async () => { const x = setup(opts); const r = await x.send(cancelar); assert.equal(r.status, 502); assert.equal(r.body.ok, undefined); });
  for (const deleteResource of [{}, { id: 'sub_propria', status: 'active' }, { id: 'sub_outra', status: 'canceled' }]) {
    await test('HTTP200 sem cancelamento confirmado da mesma assinatura não anuncia sucesso', async () => {
      const x = setup({ deleteResource }); const r = await x.send(cancelar);
      assert.equal(r.status, 502); assert.equal(r.body.ok, undefined); assert.match(r.body.erro, /não confirmou/);
    });
  }
  await test('Ping e chave pública mantêm os contratos existentes', async () => { const x = setup(); const r = await x.send({ acao: 'ping' }); assert.equal(r.body.chaveConfigurada, true); assert.ok(r.body.regras.includes('acao-normalizada')); assert.deepEqual((await x.send({ acao: 'chave_publica' })).body, { ok: true, publicKey: 'publica-ficticia' }); assert.equal(x.api().length, 0); });
  console.log(checks + ' cenários de autorização Pagar.me passaram; nenhuma chamada externa real.');
})().catch(e => { console.error(e); process.exitCode = 1; });
