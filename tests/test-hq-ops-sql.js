/* Banco PostgreSQL/WASM descartavel. Nao usa URL, rede, credenciais ou Supabase real. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('./runtime/node_modules/@electric-sql/pglite');
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const users = { admin: uid(1), finance: uid(2), sales: uid(3), support: uid(4), engineering: uid(5), viewer: uid(6), outsider: uid(7), sales2: uid(8), support2: uid(9), disabled: uid(10) };
const accountA = uid(101), accountB = uid(102);
let checks = 0, seq = 0;
function check(value, label) { assert.ok(value, label); checks++; console.log('OK ' + label); }
async function main() {
  const db = new PGlite();
  let current = 'admin';
  const schema = fs.readFileSync(path.join(__dirname, '../supabase/hq-ops-proposal.sql'), 'utf8');
  async function actor(name, role = 'authenticated') {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [users[name] || '']);
    await db.exec(`set role ${role}`); current = name;
  }
  async function owner(sql, params = []) {
    await db.exec('reset role');
    try { return await db.query(sql, params); }
    finally { await actor(current); }
  }
  async function snapshot() { return (await db.query('select public.hq_ops_snapshot() as value')).rows[0].value; }
  function envelope(type, payload, key = `test-hq-${++seq}`) { return { type, payload, idempotencyKey: key, reason: 'Conferencia manual de teste' }; }
  async function command(type, payload, key) {
    return (await db.query('select public.hq_ops_command($1::jsonb) as value', [JSON.stringify(envelope(type, payload, key))])).rows[0].value;
  }
  async function rejects(fn, pattern, label) { await assert.rejects(fn, pattern, label); checks++; console.log('OK ' + label); }
  try {
    await db.exec(`create role anon nologin; create role authenticated nologin;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema public,auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
      create table public.saas_admins(user_id uuid primary key references auth.users(id));
      create table public.academias(id uuid primary key,nome text,criada timestamptz default now(),assinatura_status text);
      create table public.saas_clientes(academia_id uuid primary key references public.academias(id),tipo text,status text);
      alter table public.saas_admins enable row level security;
      alter table public.academias enable row level security;
      alter table public.saas_clientes enable row level security;`);
    await db.query('insert into auth.users(id) select unnest($1::uuid[])', [Object.values(users)]);
    await db.query('insert into public.saas_admins values($1)', [users.admin]);
    await db.query("insert into public.academias values($1,'Empresa teste A',now(),'trial'),($2,'Empresa teste B',now(),'ativa')", [accountA, accountB]);
    await db.query("insert into public.saas_clientes values($1,'personal','trial'),($2,'academia','ativo')", [accountA, accountB]);
    await db.exec(schema);
    check((await db.query('select count(*)::int n from torque_hq.staff')).rows[0].n === 0, 'proposta nao cria acesso administrativo');
    for (const role of ['finance','sales','support','engineering','viewer']) await db.query('insert into torque_hq.staff(user_id,role,enabled) values($1,$2,true)', [users[role], role]);
    for (const [name, role] of [['sales2','sales'],['support2','support'],['disabled','finance']]) await db.query('insert into torque_hq.staff(user_id,role,enabled) values($1,$2,$3)', [users[name], role, name !== 'disabled']);
    const secure = (await db.query(`select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='torque_hq' and c.relkind='r'`)).rows;
    check(secure.length === 12 && secure.every(t => t.relrowsecurity), '12 tabelas privadas com RLS');
    check((await db.query("select has_function_privilege('anon','public.hq_ops_snapshot()','execute') a,has_function_privilege('anon','public.hq_ops_command(jsonb)','execute') b")).rows.every(r => !r.a && !r.b), 'anon sem EXECUTE nas RPCs');
    await actor('outsider');
    await rejects(snapshot, /restrito/, 'usuario comum nao abre HQ');
    await rejects(() => command('lead.create',{ name:'Nao deve existir' }), /restrito/, 'usuario comum nao grava');
    await actor('disabled'); await rejects(snapshot, /restrito/, 'staff desabilitado nao abre HQ');
    await actor('', 'authenticated'); await rejects(snapshot, /Autenticacao/, 'ausencia de auth.uid recusada');
    await actor('admin','anon'); await rejects(snapshot, /permission denied/, 'anon recusado mesmo com sub sintetico de admin');
    await actor('admin');
    await rejects(() => db.query('select * from torque_hq.staff'), /permission denied/, 'admin do app nao le tabela diretamente');
    await rejects(() => db.query("insert into torque_hq.staff values($1,'finance',true,now())", [users.outsider]), /permission denied/, 'cliente nao concede staff');
    let snap = await snapshot();
    check(snap.meta.commandsAvailable && snap.currentUserId === users.admin, 'contrato do snapshot e ator real');
    check(snap.permissions.includes('reports.export') && snap.accounts.length === 2, 'admin enxerga contas autorizadas e exportacao');
    check(snap.sources.subscriptions.status === 'unavailable' && snap.subscriptions.length === 0 && snap.accounts[0].trialEndsAt === null, 'assinaturas e trial nao sao fabricados');
    check(snap.sources.finance.scope === 'manualOnly' && snap.sources.integrations.status === 'unavailable', 'origem manual e ausencia gateway explicitas');
    check(snap.sources.cases.scope==='opsOnly' && /historico/i.test(snap.sources.cases.message), 'fila declara cobertura somente dos casos novos');
    check(snap.sources.legacySupport.status==='unavailable' && snap.sources.legacySupport.migrationPending && snap.sources.legacySupport.updatedAt===null, 'historico legado ausente nao vira fonte pronta ou zero');
    const lead = await command('lead.create',{name:'Lead proprio',owner:users.sales,stage:'novo'});
    const otherLead = await command('lead.create',{name:'Lead reservado',owner:users.sales2});
    await actor('sales'); snap=await snapshot();
    check(snap.leads.length===1 && snap.leads[0].id===lead.id && snap.accounts.length===0, 'comercial ve apenas leads proprios sem listar clientes globais');
    check(snap.invoices.length===0 && snap.audit.length===0 && snap.sources.payments.status==='unavailable', 'comercial nao recebe financeiro ou auditoria nem contagens');
    check(snap.sources.legacySupport.reason==='forbidden' && !snap.sources.legacySupport.migrationPending, 'metadados de cobertura respeitam dominio autorizado');
    await rejects(() => command('lead.update',{id:otherLead.id,stage:'contato'}), /autorizado/, 'comercial nao altera lead alheio por ID');
    await rejects(() => command('lead.update',{id:lead.id,owner:users.sales2}), /atribuir/, 'comercial nao transfere propriedade');
    await rejects(() => command('lead.update',{id:lead.id,stage:'perdido'}), /motivo/, 'perda requer motivo');
    await command('lead.update',{id:lead.id,stage:'perdido',lossReason:'Cliente adiou'});
    check((await snapshot()).leads[0].stage==='perdido', 'transicao comercial persiste');
    await rejects(() => command('invoice.create',{accountId:accountA,dueDate:'2026-10-21',totalCents:4990}), /Permissao/, 'comercial nao cria fatura');
    await actor('finance');
    const invBody={accountId:accountA,dueDate:'2026-10-21',totalCents:4990,label:'Mensalidade manual'};
    const inv=await command('invoice.create',invBody,'invoice-fixed-idempotency');
    const replay=await command('invoice.create',invBody,'invoice-fixed-idempotency');
    check(replay.replayed && replay.id===inv.id && !inv.externalEffect, 'replay do mesmo payload retorna ID sem repetir efeito');
    await rejects(() => command('invoice.create',{...invBody,totalCents:2994},'invoice-fixed-idempotency'), /outro conteudo/, 'chave idempotente com payload diferente recusada');
    for (const bad of [0,-1,49.9,'4990',null,100000000001]) await rejects(() => command('invoice.create',{...invBody,totalCents:bad}), /Centavos|limite/, `centavos invalidos ${bad} recusados`);
    await rejects(() => command('invoice.create',{...invBody,dueDate:'2026-02-30'}), /date|Data/, 'data impossivel recusada');
    await rejects(() => command('invoice.create',{...invBody,accountId:uid(999)}), /inexistente/, 'fatura exige conta real');
    await command('invoice.recordPayment',{id:inv.id,amountCents:2994,paidAt:'2020-01-01',reference:'recebimento-1'});
    snap=await snapshot();
    check(snap.invoices[0].status==='partial' && snap.payments[0].amountCents===2994, 'recebimento parcial preserva saldo AR');
    check(snap.payments[0].origin==='manual' && snap.payments[0].confirmed && snap.payments[0].accountId===accountA, 'recebimento manual vinculado a conta da fatura');
    await rejects(() => command('invoice.recordPayment',{id:inv.id,amountCents:1,paidAt:'2020-01-01',reference:'recebimento-1'}), /unique/, 'mesma referencia nao duplica recebimento com outra chave');
    await rejects(() => command('invoice.recordPayment',{id:inv.id,amountCents:2000,paidAt:'2020-01-01'}), /excede/, 'AR nao aceita valor acima do saldo');
    await rejects(() => command('invoice.recordPayment',{id:inv.id,amountCents:1,paidAt:'2099-01-01'}), /futuro/, 'baixa futura nao e confirmada');
    await command('invoice.recordPayment',{id:inv.id,amountCents:1996,paidAt:'2020-01-01'});
    check((await snapshot()).invoices[0].status==='paid', 'AR fecha ao atingir total exato');
    const expense=await command('expense.create',{payee:'Fornecedor sintetico',label:'Infraestrutura',dueDate:'2026-10-10',competenceDate:'2026-10-01',totalCents:10000});
    await command('expense.recordPayment',{id:expense.id,amountCents:4000,paidAt:'2020-01-01'});
    check((await snapshot()).expenses[0].status==='partial', 'AP suporta pagamento parcial');
    await rejects(() => command('expense.recordPayment',{id:expense.id,amountCents:6001,paidAt:'2020-01-01'}), /excede/, 'AP limita ao saldo');
    await command('expense.recordPayment',{id:expense.id,amountCents:6000,paidAt:'2020-01-01'});
    check((await snapshot()).expenses[0].status==='paid', 'AP fecha por pagamentos registrados sem transferir');
    check((await snapshot()).expensePayments.every(p=>p.confirmed && p.kind==='payment' && p.origin==='manual'), 'AP confirma somente registros manuais para contrato de metricas');
    const request=await command('subscription.requestCancel',{accountId:accountA,note:'Solicitacao recebida',effectiveAt:'2026-10-21'});
    snap=await snapshot();
    check(!request.externalEffect && snap.subscriptionRequests.length===1 && snap.accounts.find(a=>a.id===accountA).accessStatus==='trial', 'cancelamento e somente pedido sem mudar acesso');
    check(snap.sources.subscriptionRequests.status==='ready' && snap.sources.subscriptionRequests.scope==='requestsOnly', 'fila de pedidos declara origem e disponibilidade propria');
    await actor('engineering');
    const incident=await command('incident.create',{title:'Falha sintetica',severity:'alta',accountIds:[accountA],release:'mt-v-local'});
    await command('incident.update',{id:incident.id,status:'monitorando'});
    snap=await snapshot(); check(snap.incidents[0].status==='monitorando' && snap.accounts.length===0 && snap.payments.length===0, 'engenharia opera incidentes sem PII/financeiro');
    await rejects(() => command('incident.create',{title:'Invalid',accountIds:[uid(999)]}), /inexistente/, 'incidente valida contas referenciadas');
    await actor('admin');
    const case1=await command('case.create',{accountId:accountA,subject:'Duvida sintetica',owner:users.support,incidentId:incident.id});
    const case2=await command('case.create',{accountId:accountB,subject:'Reservado',owner:users.support2});
    await actor('support'); snap=await snapshot();
    check(snap.cases.length===1 && snap.accounts.length===1 && snap.accounts[0].id===accountA, 'atendente recebe apenas casos atribuidos e contas vinculadas');
    await rejects(() => command('case.update',{id:case2.id,status:'resolvido'}), /autorizado/, 'atendente nao modifica caso alheio');
    await rejects(() => command('case.message',{id:case2.id,text:'Invasao'}), /autorizado/, 'mensagem respeita propriedade do caso');
    await command('case.message',{id:case1.id,text:'Nota interna',visibility:'internal'});
    await command('case.message',{id:case1.id,text:'Resposta para revisao',visibility:'customer'});
    snap=await snapshot();
    check(snap.cases[0].messages.length===2 && snap.cases[0].messages.some(m=>m.delivery==='not_sent'), 'resposta externa e rascunho nao enviado');
    check(snap.cases[0].firstResponseAt===null, 'rascunho nao falsifica primeira resposta/SLA');
    await command('case.update',{id:case1.id,status:'resolvido'});
    check(!!(await snapshot()).cases[0].resolvedAt, 'resolucao recebe horario servidor');
    await command('case.update',{id:case1.id,status:'em_andamento'});
    check((await snapshot()).cases[0].resolvedAt===null, 'reabertura limpa resolucao corrente');
    await actor('viewer'); snap=await snapshot();
    check(snap.accounts.every(a=>a.name==='Conta') && snap.payments.length===0 && !snap.permissions.includes('reports.export'), 'viewer recebe contas mascaradas sem financeiro/exportacao');
    await rejects(() => command('case.create',{subject:'Nao permitido'}), /Permissao/, 'viewer nao grava');
    await actor('admin'); snap=await snapshot();
    check(snap.audit.length>10 && snap.audit.every(a=>a.actorId && a.reason && a.payloadHash.length===64), 'todas operacoes confirmadas tem ator motivo hash e horario');
    check(snap.audit.filter(a=>a.idempotencyKey==='invoice-fixed-idempotency').length===1, 'replay nao duplica auditoria');
    check(!JSON.stringify(snap.audit).includes('Resposta para revisao'), 'snapshot auditoria minimiza texto de mensagens');
    const counts=(await owner('select (select count(*)::int from torque_hq.commands) commands,(select count(*)::int from torque_hq.audit) audit')).rows[0];
    check(counts.commands===counts.audit, 'falha reverte reserva idempotente e auditoria atomicamente');
    const financialActor=(await owner('select actor_id from torque_hq.payments limit 1')).rows[0].actor_id;
    check(financialActor===users.finance, 'ator financeiro vem de auth.uid e nao payload');
    await rejects(() => command('gateway.cancel',{id:'sub_fake'}), /nao permitida/, 'comandos externos fora da allowlist');
    await rejects(() => db.query('select public.hq_ops_command($1::jsonb)', [JSON.stringify({...envelope('lead.create',{name:'X'}),actor:users.finance})]), /desconhecido/, 'envelope rejeita ator forjado');
    await rejects(() => command('lead.create',{name:'X',actorId:users.finance}), /desconhecido/, 'payload rejeita campo privilegiado desconhecido');
    await owner('update torque_hq.staff set enabled=false where user_id=$1', [users.finance]);
    await actor('finance'); await rejects(snapshot,/restrito/,'revogacao staff vale na proxima RPC');
    await actor('admin'); await owner('delete from public.saas_admins where user_id=$1',[users.admin]);
    await rejects(snapshot,/restrito/,'remocao do saas_admins vale imediatamente');
    console.log(`PASS ${checks} verificacoes HQ SQL locais; nenhum backend remoto acessado.`);
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode=1; });
