'use strict';
// Actual Nutri modules and UI, with fictional records supplied only by this
// intercepted test module. External HTTP, API writes and sockets stay blocked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let chromium;
if (process.env.TORQUE_PLAYWRIGHT) ({chromium} = require(process.env.TORQUE_PLAYWRIGHT));
else { try { ({chromium} = require('playwright')); } catch { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } }
const BASE = (process.env.BASE_URL || 'http://127.0.0.1:8765').replace(/\/$/, '');
const ORIGIN = new URL(BASE).origin;
const OUT = process.env.TORQUE_TEST_OUTPUT_DIR || (process.env.RUNNER_TEMP && path.join(process.env.RUNNER_TEMP, 'torque-testes'));
const PROFESSIONAL = ['overview','patients','appointments','finance','plans','library','assessments','questionnaires','chat','challenges','reports','operations','community','brand','professional','images','settings','support'];
const PATIENT_MENU = ['journal','recipes','forms','clinical','documents','booking','chat','community','benefits','payments','achievements','goals','profile-settings','settings','support'];
let browser, checks = 0;
const contexts = [];
const pass = message => { checks++; console.log('PASS ' + message); };
async function isolated(role = 'nutri') {
  const context = await browser.newContext({serviceWorkers:'block',timezoneId:'America/Sao_Paulo',viewport:{width:1280,height:900}});
  contexts.push(context);
  const errors = [], writes = [], missing = [];
  await context.addInitScript(() => {
    const NativeDate = Date, fixed = NativeDate.parse('2026-10-11T12:00:00Z');
    window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [fixed])); } static now() { return fixed; } };
  });
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (!['GET','HEAD'].includes(request.method()) || /\.supabase\.co$/.test(url.hostname) || /\/(rest|auth|functions|storage)\/v\d\//.test(url.pathname)) {
      writes.push(url.origin + url.pathname); return route.abort();
    }
    if (url.origin !== ORIGIN) return route.abort();
    if (url.pathname.endsWith('/nutri/config.js')) return route.fulfill({contentType:'application/javascript',body:'window.TORQUE_NUTRI_CONFIG={};'});
    if (url.pathname.endsWith('/nutri/app.js')) {
      const source = fs.readFileSync(path.join(__dirname,'../nutri/app.js'),'utf8');
      return route.fulfill({contentType:'application/javascript',body:source+'\nwindow.__nutriFixture={S,render};\n'});
    }
    return route.continue();
  });
  assert.equal(typeof context.routeWebSocket, 'function');
  await context.routeWebSocket('**/*', socket => { writes.push('websocket'); socket.close(); });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() === 404 && new URL(response.url()).origin === ORIGIN) missing.push(response.url()); });
  await page.goto(BASE + '/nutri/demo-' + (role === 'nutri' ? 'nutricionista' : 'paciente') + '.html', {waitUntil:'domcontentloaded'});
  await page.locator('.demo-notice').waitFor();
  return {page,context,errors,writes,missing};
}
function clean(h) { assert.deepEqual(h.errors, []); assert.deepEqual(h.writes, []); assert.deepEqual(h.missing, []); }
async function nav(page, destination, keyboard = false) {
  let button = page.locator('.sidebar [data-page="' + destination + '"]');
  if (!await button.isVisible()) {
    await page.locator('.sidebar [data-page="more"]').click();
    button = page.locator('.module-grid [data-page="' + destination + '"]');
  }
  if (keyboard) { await button.focus(); await page.keyboard.press('Enter'); }
  else await button.click();
}
async function save(page) { await page.locator('#modal-form button[type="submit"]').click(); await page.waitForFunction(() => !document.querySelector('#modal').open); }
async function layout(page, label, screenshot = false) {
  await page.evaluate(() => document.fonts.ready);
  const geometry = await page.evaluate(() => {
    const width = document.documentElement.clientWidth, scroll = Math.max(document.documentElement.scrollWidth,document.body.scrollWidth);
    const offenders = scroll > width + 1 ? [...document.querySelectorAll('main *')].filter(element => {
      const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
      return rect.width && style.position !== 'fixed' && rect.right > width + 1;
    }).slice(0,8).map(element => ({tag:element.tagName,class:element.className,text:element.textContent.slice(0,70),width:element.getBoundingClientRect().width})) : [];
    return {width,scroll,offenders};
  });
  if (OUT && (screenshot || geometry.offenders.length)) {
    fs.mkdirSync(OUT,{recursive:true});
    await page.screenshot({path:path.join(OUT,'nutri-consolidation-'+label+'.png'),fullPage:true});
  }
  assert(geometry.scroll <= geometry.width + 1, label + ': horizontal overflow ' + JSON.stringify(geometry));
  if (geometry.width <= 375) {
    const financialRows = await page.locator('.finance-workspace .patient-row .grow').evaluateAll(elements => elements.map(element => ({text:element.getBoundingClientRect().width,row:element.closest('.patient-row').getBoundingClientRect().width})));
    assert(financialRows.every(row => row.text >= Math.min(160,row.row)),label + ': financial labels squeezed by their actions ' + JSON.stringify(financialRows));
  }
  assert.doesNotMatch(await page.locator('main').textContent(), /\[object Object\]|\bNaN\b/, label);
}
async function seedJournals(page) {
  await page.evaluate(() => {
    const {S,render} = window.__nutriFixture;
    const journal = (id,patient_id,title,version) => ({id,patient_id,clinician_id:'demo',created_by:'patient-demo',kind:'food_journal',visibility:'patient',version,title,created_at:'2026-10-11T11:00:00Z',data:{day:'2026-10-11',mealId:'lunch',planVersion:1,items:[{id:'food-'+id,nome:'Arroz informado na fixture',qtd:1,porcao:'100 g'}],note:'Registro fictício para conferir paciente e versão.'}});
    S.records.push(journal('qa-marina','demo-0','Almoço da Marina',1),journal('qa-lucas','demo-1','Almoço do Lucas',3));
    S.records.push({id:'qa-old-feedback',patient_id:'demo-1',clinician_id:'demo',created_by:'demo',kind:'nutrition_feedback',visibility:'patient',version:1,title:'Orientação anterior',created_at:'2026-10-10T11:00:00Z',data:{entryId:'qa-lucas',entryVersion:2,text:'Orientação da versão anterior.'}});
    S.selected = 'demo-0'; render();
  });
}
async function followUp() {
  const h = await isolated(), p = h.page;
  await seedJournals(p);
  assert.match(await p.locator('h1').textContent(), /Acompanhamento de hoje/);
  await nav(p,'operations');
  await p.locator('#follow-queue-type').selectOption('diary');
  const lucas = p.locator('.patient-row').filter({hasText:'Almoço do Lucas'});
  assert.equal(await lucas.count(),1);
  await lucas.locator('[data-follow-page="profile"]').click();
  assert.match(await p.locator('h1').textContent(),/Lucas Oliveira/);
  await p.locator('[data-follow-page="journal"][data-follow-patient="demo-1"]').first().click();
  assert.equal(await p.locator('#follow-journal-patient').inputValue(),'demo-1');
  assert.equal(await p.locator('.journal-entry').count(),1);
  assert.match(await p.locator('.journal-entry').textContent(),/Alterada após orientação/);
  assert.doesNotMatch(await p.locator('.journal-entry').textContent(),/Almoço da Marina/);
  pass('review queue and patient profile open the selected patient diary without carrying another patient');

  await p.locator('[data-x="journal-feedback"]').click();
  assert.match(await p.locator('#modal-body').textContent(),/Lucas Oliveira.*versão 3/);
  await p.locator('#x-feedback').fill('Não deve ser gravada na versão antiga.');
  await p.evaluate(() => { window.__nutriFixture.S.records.find(x=>x.id==='qa-lucas').version=4; });
  await p.locator('#modal-form button[type="submit"]').click();
  await p.waitForFunction(() => document.querySelector('#modal-feedback')?.textContent.includes('A refeição mudou'));
  assert.equal(await p.evaluate(() => window.__nutriFixture.S.records.filter(x=>x.kind==='nutrition_feedback').length),1);
  await p.locator('#cancel-modal').click();
  await p.locator('#follow-journal-status').selectOption('changed');
  await p.locator('[data-x="journal-feedback"]').click();
  await p.locator('#x-feedback').fill('Orientação revisada sobre a versão atual.');
  await save(p);
  assert.equal(await p.locator('.journal-entry').count(),0,'reviewed item leaves the changed-only filter');
  await p.locator('#follow-journal-status').selectOption('reviewed');
  assert.equal(await p.locator('.journal-entry').count(),1);
  assert.match(await p.locator('.journal-entry').textContent(),/sobre a versão 4/);
  const feedback = await p.evaluate(() => window.__nutriFixture.S.records.filter(x=>x.kind==='nutrition_feedback').at(-1));
  assert.equal(feedback.patient_id,'demo-1'); assert.equal(feedback.data.entryVersion,4); assert.equal(feedback.data.entryId,'qa-lucas');
  await p.locator('#follow-journal-patient').selectOption('demo-0');
  assert.equal(await p.locator('.journal-entry').count(),0);
  await p.locator('#follow-journal-status').selectOption('pending');
  assert.match(await p.locator('.journal-entry').textContent(),/Almoço da Marina/);
  pass('stale feedback is rejected and the reviewed filter uses the actual diary version and patient');

  await nav(p,'patients');
  await p.locator('#follow-patient-search').fill('Lucas');
  assert.equal(await p.locator('#follow-patients .patient-tile').count(),1);
  await p.locator('#follow-patient-filter').selectOption('paused');
  assert.equal(await p.locator('#follow-patients .patient-tile').count(),0);
  await p.locator('#follow-patient-filter').selectOption('all');
  await p.locator('#follow-patients [data-follow-page="profile"]').click();
  assert.match(await p.locator('h1').textContent(),/Lucas Oliveira/);
  await nav(p,'reports');
  await p.locator('#follow-report-from').fill('2026-10-11');
  await p.locator('#follow-report-to').fill('2026-10-11');
  await p.locator('#follow-report-patient').selectOption('demo-1');
  await p.locator('#follow-report-form button').click();
  const diary = p.locator('.measure-grid > div').filter({hasText:'Refeições no diário'});
  assert.equal(await diary.locator('b').textContent(),'1');
  await p.locator('#follow-report-from').fill('2026-10-01');
  await p.locator('#follow-report-to').fill('2026-10-10');
  await p.locator('#follow-report-form button').click();
  assert.equal(await diary.locator('b').textContent(),'0');
  pass('patient search, operational filter and reports preserve selected patient and exact date interval');
  clean(h); await h.context.close();
}
async function financeAndConsultation() {
  const h = await isolated(), p = h.page;
  await nav(p,'patients');
  await p.locator('[data-follow-page="profile"][data-follow-patient="demo-1"]').click();
  const before = await p.evaluate(() => { const s=window.__nutriFixture.S; return JSON.stringify([s.plans,s.appointments,s.finances]); });
  await p.locator('[data-x="session"]').click();
  await p.locator('#consultation-title').fill('Atendimento QA fictício');
  await p.locator('#consultation-reason').fill('Revisar a organização da rotina.');
  await p.locator('#consultation-text').fill('Registro demonstrativo sem orientação para pessoa real.');
  await save(p);
  let consultation = await p.evaluate(() => window.__nutriFixture.S.records.find(x=>x.title==='Atendimento QA fictício'));
  assert.equal(consultation.patient_id,'demo-1'); assert.equal(consultation.visibility,'private'); assert.equal(consultation.data.status,'draft');
  await p.locator('[data-x="record-detail"][data-id="'+consultation.id+'"]').click();
  await p.locator('[data-consultation-edit]').click();
  await p.locator('#consultation-status').selectOption('completed');
  await p.locator('#modal-form button[type="submit"]').click();
  await p.waitForFunction(() => document.querySelector('#modal-feedback')?.textContent.includes('Confirme a revisão'));
  await p.locator('#consultation-confirmed').check(); await save(p);
  consultation = await p.evaluate(() => window.__nutriFixture.S.records.find(x=>x.title==='Atendimento QA fictício'));
  assert.equal(consultation.data.status,'completed'); assert.equal(consultation.version,2);
  assert.equal(await p.evaluate(() => { const s=window.__nutriFixture.S; return JSON.stringify([s.plans,s.appointments,s.finances]); }),before);
  pass('guided consultation preserves a private draft and requires review without altering plan, agenda or money');

  await p.locator('[data-follow-page="finance"][data-follow-patient="demo-1"]').click();
  assert.equal(await p.locator('#finance-patient').inputValue(),'demo-1');
  assert.deepEqual(await p.locator('#finance-basis option').evaluateAll(options=>options.map(x=>x.value)),['due','paid']);
  assert.match(await p.locator('#finance-filters').textContent(),/Competência ainda não está cadastrada/);
  await p.locator('[data-x="financial-new"][data-id="income"]').click();
  assert.equal(await p.locator('#x-patient').inputValue(),'demo-1');
  assert.equal(await p.locator('#finance-installments,#finance-competency').count(),0);
  await p.locator('#x-title').fill('Receita QA novembro'); await p.locator('#x-amount').fill('125.50'); await p.locator('#x-due').fill('2026-11-05');
  await p.locator('#x-note').fill('Observação administrativa fictícia.'); await save(p);
  await p.locator('[data-x="finance-all"]').click();
  const row = p.locator('.patient-row').filter({hasText:'Receita QA novembro'});
  assert.equal(await row.count(),1); assert.match(await row.textContent(),/Lucas Oliveira/);
  await row.locator('[data-x="financial-paid"]').click();
  await p.locator('#x-paid').fill('2026-10-10');
  await p.locator('#modal-form button[type="submit"]').click();
  assert.equal(await p.locator('#modal').evaluate(x=>x.open),true);
  assert.equal(await p.evaluate(() => window.__nutriFixture.S.finances.find(x=>x.title==='Receita QA novembro').status),'pending');
  await p.locator('#finance-confirm-paid').check(); await save(p);
  const entry = await p.evaluate(() => window.__nutriFixture.S.finances.find(x=>x.title==='Receita QA novembro'));
  assert.equal(entry.amount_cents,12550); assert.equal(entry.status,'paid'); assert.equal(entry.paid_on,'2026-10-10'); assert.equal(entry.due_on,'2026-11-05');
  await p.locator('[data-x="finance-month"]').click();
  assert.equal(await row.count(),0,'November due date is outside October due filter');
  await p.locator('#finance-basis').selectOption('paid'); await p.locator('#finance-filters button[type="submit"]').click();
  assert.equal(await row.count(),1,'October payment is inside October cash filter');
  await row.locator('[data-x="receipt"]').click();
  assert.match(await p.locator('#modal-body').textContent(),/Lucas Oliveira/);
  assert.match(await p.locator('#modal-body').textContent(),/Não é documento fiscal nem confirmação bancária/);
  assert.equal(await p.locator('[data-x="financial-refund"]').count(),0);
  await p.locator('#close-modal').click();
  assert.equal(await p.evaluate(() => JSON.stringify([window.__nutriFixture.S.plans,window.__nutriFixture.S.appointments])),JSON.stringify(JSON.parse(before).slice(0,2)));
  pass('legacy finance requires manual confirmation and keeps payment date, due date and unavailable capabilities distinct');
  clean(h); await h.context.close();
}
async function navigationAndLayout() {
  const failures=[];
  const checkLayout=async(...args)=>{try{await layout(...args);}catch(error){failures.push(error.message);}};
  const pro = await isolated(), p = pro.page;
  await seedJournals(p);
  assert.deepEqual(await p.locator('.sidebar [data-page]').evaluateAll(buttons=>buttons.map(x=>x.dataset.page).filter(x=>x!=='more')),PROFESSIONAL);
  for (const width of [320,375,800,1280]) for (const theme of ['dark','light']) {
    await p.setViewportSize({width,height:900});
    await p.evaluate(light=>document.body.classList.toggle('theme-light',light),theme==='light');
    for (const destination of PROFESSIONAL) {
      await nav(p,destination,true);
      assert.equal(await p.evaluate(() => window.__nutriFixture.S.page),destination);
      await checkLayout(p,'professional-'+destination+'-'+width+'-'+theme,['overview','finance','patients','reports','challenges'].includes(destination) && [320,375,1280].includes(width));
    }
    await nav(p,'patients',true);
    const patientButton=p.locator('[data-follow-page="profile"][data-follow-patient="demo-1"]');
    await patientButton.focus(); await p.keyboard.press('Enter');
    await checkLayout(p,'professional-profile-'+width+'-'+theme,[375,1280].includes(width));
    const journalButton=p.locator('[data-follow-page="journal"][data-follow-patient="demo-1"]').first();
    await journalButton.focus(); await p.keyboard.press('Enter');
    assert.equal(await p.locator('#follow-journal-patient').inputValue(),'demo-1');
    await checkLayout(p,'professional-journal-'+width+'-'+theme,[375,1280].includes(width));
    await p.locator('[data-x="journal-feedback"]').focus(); await p.keyboard.press('Enter');
    assert.equal(await p.locator('#modal').evaluate(x=>x.open),true);
    await checkLayout(p,'professional-feedback-'+width+'-'+theme,width===375);
    await p.keyboard.press('Escape'); assert.equal(await p.locator('#modal').evaluate(x=>x.open),false);
  }
  clean(pro); await pro.context.close();

  const patient=await isolated('patient'), q=patient.page;
  for(const width of [320,375,800,1280]) for(const theme of ['dark','light']) {
    await q.setViewportSize({width,height:900});
    await q.evaluate(light=>document.body.classList.toggle('theme-light',light),theme==='light');
    await nav(q,'more',true);
    assert.deepEqual((await q.locator('.patient-menu-grid [data-page]').evaluateAll(buttons=>buttons.map(x=>x.dataset.page))).sort(),[...PATIENT_MENU].sort());
    await checkLayout(q,'patient-menu-'+width+'-'+theme,[375,1280].includes(width));
    for(const destination of PATIENT_MENU) {
      await q.locator('.patient-menu-grid [data-page="'+destination+'"]').focus(); await q.keyboard.press('Enter');
      assert.equal(await q.evaluate(() => window.__nutriFixture.S.page),destination);
      await checkLayout(q,'patient-'+destination+'-'+width+'-'+theme);
      await nav(q,'more',true);
    }
  }
  clean(patient); await patient.context.close();
  assert.deepEqual(failures,[], 'Every destination must fit the tested viewport and theme');
  pass('all 18 professional destinations, patient profile and diary work by keyboard at 320/375/800/1280 px in both themes');
  pass('all 15 patient menu destinations remain available by keyboard at 320/375/800/1280 px in both themes');
}
(async()=>{
  browser=await chromium.launch({headless:true});
  await followUp(); await financeAndConsultation(); await navigationAndLayout();
  console.log(checks+' Nutri consolidation browser checks passed.');
})().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(async()=>{for(const context of contexts)await context.close().catch(()=>{});await browser?.close();});
