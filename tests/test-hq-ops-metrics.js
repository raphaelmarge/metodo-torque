'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const M = require('../assets/hq-ops-metrics.js');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('ok ' + passed + ' - ' + name); }
const domains = ['accounts','subscriptions','invoices','payments','expenses','expensePayments','events','cases','incidents'];
function empty() {
  const s = { now:'2026-09-30T15:00:00Z', sources:{} };
  for (const d of domains) { s[d] = []; s.sources[d] = {status:'ready',origin:'synthetic',updatedAt:s.now}; }
  return s;
}
const opts = {from:'2026-09-01',to:'2026-09-30',timeZone:'America/Sao_Paulo',now:'2026-09-30T15:00:00Z'};
const account = (id,createdAt,status='active') => ({id,name:id,product:'personal',createdAt,status,accessStatus:'active'});
const subscription = (id,accountId,startsAt,endsAt,monthlyCents=4990) => ({id,accountId,startsAt,endsAt,monthlyCents,status:endsAt?'ended':'active'});
function fixture() {
  const s = empty();
  s.accounts = [account('base','2026-08-01T10:00:00Z'),account('keep','2026-08-01T10:00:00Z'),account('in-out','2026-09-03T10:00:00Z'),account('new','2026-09-10T10:00:00Z')];
  s.subscriptions = [subscription('s1','base','2026-08-01T10:00:00Z','2026-09-10T10:00:00Z'),subscription('s2','keep','2026-08-01T10:00:00Z',null),subscription('s3','in-out','2026-09-03T10:00:00Z','2026-09-04T10:00:00Z'),subscription('s4','new','2026-09-10T10:00:00Z',null)];
  s.events = [{id:'closed1',accountId:'base',type:'account_closed',occurredAt:'2026-09-10T10:00:00Z'},{id:'closed2',accountId:'in-out',type:'account_closed',occurredAt:'2026-09-04T10:00:00Z'}];
  return s;
}
test('CommonJS and browser export the same pure API', () => {
  const ctx={Intl,Date,Set,Map}; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/hq-ops-metrics.js'),'utf8'),ctx);
  assert.deepEqual(Object.keys(ctx.HQOpsMetrics),Object.keys(M));
  assert.equal(typeof ctx.HQOpsMetrics.compute,'function');
});
test('centavos preservados, null explícito, decimal e overflow recusados', () => {
  assert.match(M.money(4990),/49,90/); assert.match(M.money(2994),/29,94/); assert.match(M.money(1996),/19,96/);
  assert.match(M.money(-499),/-.*4,99/); assert.equal(M.money(null),'Indisponível');
  assert.throws(()=>M.money(49.9),/integer_cents/); assert.throws(()=>M.money(Number.MAX_SAFE_INTEGER+1),/integer_cents/);
});
test('instantes respeitam o fuso; datas contábeis não mudam de dia', () => {
  assert.equal(M.dateKey('2026-10-01T01:30:00Z','America/Sao_Paulo'),'2026-09-30');
  assert.equal(M.dateKey('2026-10-01','America/Sao_Paulo'),'2026-10-01');
  assert.throws(()=>M.dateKey('2026-09-30T12:00:00','America/Sao_Paulo'),/offset/);
  assert.throws(()=>M.dateKey('2026-02-30','UTC'),/invalid_calendar/);
});
test('período inclui último dia local via limite exclusivo, inclusive DST', () => {
  const p=M.period({from:'2026-09-30',to:'2026-09-30',timeZone:'America/Sao_Paulo'});
  assert.equal(p.startAt,'2026-09-30T03:00:00.000Z'); assert.equal(p.endAtExclusive,'2026-10-01T03:00:00.000Z');
  const spring=M.period({from:'2026-03-08',to:'2026-03-08',timeZone:'America/New_York'});
  const fall=M.period({from:'2026-11-01',to:'2026-11-01',timeZone:'America/New_York'});
  assert.equal((Date.parse(spring.endAtExclusive)-Date.parse(spring.startAt))/3600000,23);
  assert.equal((Date.parse(fall.endAtExclusive)-Date.parse(fall.startAt))/3600000,25);
  const brazil=M.period({from:'2018-11-04',to:'2018-11-04',timeZone:'America/Sao_Paulo'});
  assert.equal(brazil.startAt,'2018-11-04T03:00:00.000Z');
});
test('sem fonte e fonte stale/error não viram zero; pronto vazio é zero', () => {
  const s=empty(); delete s.sources.payments; s.sources.events.status='stale'; s.sources.expensePayments.status='error';
  let r=M.compute(s,opts); assert.equal(r.metrics.cashIn.status,'unavailable'); assert.equal(r.metrics.cashIn.value,null);
  assert.equal(r.metrics.activeAccounts.status,'stale'); assert.equal(r.metrics.activeAccounts.value,null);
  assert.equal(r.metrics.cashOut.status,'error'); assert.equal(r.metrics.cashOut.value,null);
  assert.equal(r.metrics.arDueToday.value,null); assert.equal(r.charts.daily[0].metrics.cashIn.value,null);
  r=M.compute(empty(),opts); assert.equal(r.metrics.cashIn.value,0); assert.equal(r.metrics.churn.value,null);
  assert.equal(r.metrics.accountEntries.percentage,null); assert.equal(r.cohort.conversionPercentage,null);
  const malformed=empty(); delete malformed.payments; assert.equal(M.compute(malformed,opts).metrics.cashIn.status,'error');
});
test('churn inclui só a base inicial; entradas e saídas conservam seus denominadores', () => {
  const r=M.compute(fixture(),opts);
  assert.equal(r.metrics.openingAccounts.value,2); assert.equal(r.metrics.closingAccounts.value,2);
  assert.equal(r.metrics.accountEntries.value,2); assert.equal(r.metrics.accountEntries.percentage,100);
  assert.equal(r.metrics.accountExits.value,2); assert.equal(r.metrics.accountExits.percentage,100);
  assert.equal(r.metrics.churn.count,1); assert.equal(r.metrics.churn.base,2); assert.equal(r.metrics.churn.value,50);
  assert.deepEqual(r.drilldowns.churn.rows.map(x=>x.id),['base']);
});
test('MRR ganho e perdido incluem entrada/saída no mês, sem misturar caixa', () => {
  const r=M.compute(fixture(),opts);
  assert.equal(r.metrics.mrrOpening.value,9980); assert.equal(r.metrics.mrr.value,9980);
  assert.equal(r.metrics.mrrGained.value,9980); assert.equal(r.metrics.mrrLost.value,9980);
  assert.equal(r.metrics.cashIn.value,0); assert.equal(r.metrics.arpa.value,4990);
});
test('troca de plano no mesmo instante calcula expansão, não churn de contrato', () => {
  const s=empty(); s.accounts=[account('a','2026-08-01T10:00:00Z')];
  s.subscriptions=[subscription('old','a','2026-08-01T10:00:00Z','2026-09-15T10:00:00Z',4990),subscription('next','a','2026-09-15T10:00:00Z',null,9990)];
  const r=M.compute(s,opts); assert.equal(r.metrics.mrrGained.value,5000); assert.equal(r.metrics.mrrLost.value,0); assert.equal(r.metrics.churn.value,0);
});
test('AR/AP do dia abatem parciais, reversões e ignoram anulados e pagamentos futuros', () => {
  const s=empty();
  s.invoices=[{id:'i',accountId:'a',dueDate:'2026-09-30',totalCents:4990,status:'open'},{id:'v',dueDate:'2026-09-30',totalCents:99999,status:'void'},{id:'late',dueDate:'2026-09-29',totalCents:1000,status:'open'}];
  s.payments=[{id:'p',invoiceId:'i',accountId:'a',paidAt:'2026-09-29T12:00:00Z',amountCents:2994,kind:'payment',confirmed:true},{id:'r',invoiceId:'i',accountId:'a',paidAt:'2026-09-30T12:00:00Z',amountCents:994,kind:'refund',confirmed:true},{id:'future',invoiceId:'i',paidAt:'2026-10-01T12:00:00Z',amountCents:500,kind:'payment',confirmed:true},{id:'notconfirmed',invoiceId:'i',paidAt:'2026-09-29T12:00:00Z',amountCents:1000,kind:'payment',confirmed:false}];
  s.expenses=[{id:'x',dueDate:'2026-09-30',totalCents:2000,status:'open',competenceDate:'2026-09-01'},{id:'z',dueDate:'2026-09-30',totalCents:99999,status:'cancelled',competenceDate:'2026-09-01'}];
  s.expensePayments=[{id:'xp',expenseId:'x',paidAt:'2026-09-29T12:00:00Z',amountCents:500}];
  const r=M.compute(s,opts); assert.equal(r.metrics.arDueToday.value,2990); assert.equal(r.metrics.arOverdue.value,1000);
  assert.equal(r.metrics.apDueToday.value,1500); assert.equal(r.metrics.cashIn.value,2994); assert.equal(r.metrics.refunds.value,994);
  assert.equal(r.metrics.cashOut.value,500); assert.equal(r.metrics.netCash.value,1500);
  assert.equal(r.metrics.incomeCompetence.status,'unavailable'); assert.equal(r.metrics.expenseCompetence.value,2000);
  assert.equal(r.metrics.arProjected.value,2990); assert.equal(r.metrics.apProjected.value,1500);
  assert.equal(r.charts.daily.find(x=>x.key==='2026-09-30').metrics.refunds.value,994);
  assert.equal(r.charts.monthly[0].metrics.netCash.value,1500);
});
test('limites locais se aplicam a pagamentos e gráficos, sem vazamento do dia seguinte', () => {
  const s=empty(); s.now='2026-10-02T12:00:00Z';
  s.payments=[{id:'end',paidAt:'2026-10-01T02:59:59.999Z',amountCents:2994,kind:'payment',confirmed:true},{id:'outside',paidAt:'2026-10-01T03:00:00Z',amountCents:4990,kind:'payment',confirmed:true}];
  const r=M.compute(s,{...opts,now:s.now}); assert.equal(r.metrics.cashIn.value,2994);
  assert.equal(r.charts.daily.at(-1).metrics.cashIn.value,2994); assert.equal(r.charts.monthly[0].metrics.cashIn.value,2994);
});
test('publicação/trial não contam como atividade humana; marcos não são funil sequencial', () => {
  const s=empty(); s.accounts=[account('a','2026-09-01T10:00:00Z','trial'),account('b','2026-09-29T10:00:00Z','trial')];
  s.accounts[1].trialEndsAt='2026-10-01T10:00:00Z';
  s.events=[{id:'e',accountId:'a',type:'publication_confirmed',occurredAt:'2026-09-10T10:00:00Z'}];
  s.payments=[{id:'p',accountId:'a',paidAt:'2026-09-15T10:00:00Z',amountCents:4990,kind:'payment',confirmed:true}];
  const r=M.compute(s,{...opts,cohortObservationDays:14}); assert.equal(r.metrics.publishedAccounts.value,1); assert.equal(r.metrics.activeAccounts.value,0);
  assert.equal(r.cohort.mature,1); assert.equal(r.cohort.immature,1); assert.equal(r.cohort.conversionPercentage,100);
  assert.equal(r.cohort.paid,1); assert.equal(r.cohort.checkout,0); assert.equal(r.cohort.sequential,false);
  assert.equal(r.metrics.trialsExpiring.value,1);
});
test('pagou sem acesso exige evidência explícita, vigência e tolerância', () => {
  const s=empty(); s.accounts=[{...account('a','2026-08-01T10:00:00Z'),accessStatus:'blocked'}];
  s.payments=[{id:'p',accountId:'a',paidAt:'2026-09-30T14:00:00Z',amountCents:4990,kind:'payment',confirmed:true}];
  assert.equal(M.compute(s,opts).metrics.paidWithoutAccess.status,'unavailable');
  s.payments[0].accessExpected=true; assert.equal(M.compute(s,opts).metrics.paidWithoutAccess.value,1);
  s.payments[0].paidAt='2026-09-30T14:59:00Z'; assert.equal(M.compute(s,opts).metrics.paidWithoutAccess.value,0);
  s.payments[0].paidAt='2026-09-30T14:00:00Z'; s.payments[0].accessExpectedUntil='2026-09-30T14:30:00Z';
  assert.equal(M.compute(s,opts).metrics.paidWithoutAccess.value,0);
});
test('casos/incidentes canônicos PT encerrados não entram em filas abertas', () => {
  const s=empty(); s.cases=[{id:'c',status:'resolvido',nextActionAt:'2026-09-29T10:00:00Z'},{id:'o',status:'aberto',nextActionAt:'2026-09-29T10:00:00Z'}];
  s.incidents=[{id:'i',status:'resolvido'},{id:'j',status:'monitorando'}];
  const r=M.compute(s,opts); assert.equal(r.metrics.casesOverdue.value,1); assert.equal(r.metrics.openCases.value,1); assert.equal(r.metrics.openIncidents.value,1);
});
test('drilldown corresponde à métrica e compute não modifica entradas', () => {
  const s=fixture(), before=JSON.stringify(s), o=JSON.stringify(opts);
  const d=M.drilldown(s,'churn',opts); assert.equal(d.status,'ready'); assert.equal(d.rows.length,1); assert.equal(d.rows[0].id,'base');
  d.rows[0].name='changed'; assert.equal(JSON.stringify(s),before); assert.equal(JSON.stringify(opts),o);
  assert.throws(()=>M.compute(s,{...opts,now:undefined,timeZone:undefined}),/timeZone/);
  const n=empty(); delete n.now; assert.throws(()=>M.compute(n,{...opts,now:undefined}),/timestamp/);
});
test('estouro e valores inválidos viram erro, nunca receita zero', () => {
  const s=empty(); s.payments=[{id:'bad',amountCents:49.90,kind:'payment',confirmed:true,paidAt:'2026-09-20T12:00:00Z'}];
  const r=M.compute(s,opts); assert.equal(r.metrics.cashIn.status,'error'); assert.equal(r.metrics.cashIn.value,null);
  assert.equal(r.charts.monthly[0].metrics.cashIn.value,null);
});
test('filtro de produto/coorte/status mantém numerador, denominador e drilldown iguais', () => {
  const s=fixture(); s.accounts.find(a=>a.id==='keep').product='nutri';
  const o={...opts,product:'personal'}, r=M.compute(s,o);
  assert.equal(r.metrics.churn.base,1); assert.equal(r.metrics.churn.count,1); assert.equal(r.metrics.churn.value,100);
  assert.equal(r.metrics.mrrOpening.value,4990); assert.equal(r.metrics.mrr.value,4990);
  assert.deepEqual(M.drilldown(s,'churn',o).rows.map(a=>a.id),r.drilldowns.churn.rows.map(a=>a.id));
  assert.equal(M.compute(s,{...o,cohort:{from:'2026-09-01',to:'2026-09-30'}}).metrics.churn.base,0);
  assert.equal(M.compute(s,{...o,accountStatus:'trial'}).metrics.accountEntries.value,0);
  s.expenses=[{id:'shared',dueDate:'2026-09-30',totalCents:3000,competenceDate:'2026-09-01',status:'open'}];
  const filtered=M.compute(s,o); assert.equal(filtered.metrics.apDueToday.status,'unavailable'); assert.equal(filtered.metrics.apDueToday.value,null);
  assert.equal(M.compute(s,opts).metrics.apDueToday.value,3000);
});
test('coorte usa janela fixa e apresenta tabelas exatas; pagamento tardio não infla conversão', () => {
  const s=empty(); s.accounts=[account('a','2026-09-01T10:00:00Z'),account('b','2026-09-25T10:00:00Z')];
  s.payments=[{id:'late',accountId:'a',paidAt:'2026-09-25T10:00:00Z',amountCents:4990,kind:'payment',confirmed:true}];
  const r=M.compute(s,{...opts,cohortObservationDays:14}); assert.equal(r.cohort.size,2); assert.equal(r.cohort.mature,1); assert.equal(r.cohort.paid,1);
  assert.equal(r.cohort.maturePaid,0); assert.equal(r.cohort.conversionPercentage,0);
  for(const [field,list] of [['size','created'],['mature','mature'],['immature','immature'],['paid','paid'],['published','published'],['checkout','checkout'],['maturePaid','maturePaid']]) assert.equal(r.cohort[field],r.cohort.drilldowns[list].length);
  r.cohort.drilldowns.created[0].name='changed'; assert.equal(s.accounts[0].name,'a');
  assert.equal(M.compute(s,{...opts,cohortObservationDays:28}).cohort.conversionPercentage,100);
});
test('janela analítica padrão30 permite conversão pós-trial14 sem confundir maturidade', () => {
  const s=empty(); s.accounts=[account('a','2026-09-01T10:00:00Z')];
  s.payments=[{id:'post-trial',accountId:'a',paidAt:'2026-09-15T10:01:00Z',amountCents:2994,kind:'payment',confirmed:true}];
  const immature=M.compute(s,opts); assert.equal(immature.cohort.observationDays,30); assert.equal(immature.cohort.conversionPercentage,null);
  const mature=M.compute(s,{...opts,now:'2026-10-01T10:01:00Z'}); assert.equal(mature.cohort.maturePaid,1); assert.equal(mature.cohort.conversionPercentage,100);
});
test('incidente global sem atribuição não vira zero ao filtrar produto', () => {
  const s=empty();s.accounts=[account('a','2026-09-01T10:00:00Z')];s.incidents=[{id:'global',status:'aberto'}];
  const result=M.compute(s,{...opts,product:'personal'});assert.equal(result.metrics.openIncidents.status,'unavailable');assert.equal(result.metrics.openIncidents.value,null);
  assert.equal(M.compute(s,opts).metrics.openIncidents.value,1);
});
console.log(passed + ' grupos de testes passaram. Nenhuma rede ou dado real utilizado.');
