'use strict';
// Regressions for narrow controls, uneven shortcuts and squeezed prescription
// content. All records come from the dedicated demo or explicit fictional fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let chromium;
if (process.env.TORQUE_PLAYWRIGHT) ({chromium} = require(process.env.TORQUE_PLAYWRIGHT));
else { try { ({chromium} = require('playwright')); } catch { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } }
const BASE = (process.env.BASE_URL || 'http://127.0.0.1:8765').replace(/\/$/, '');
const ORIGIN = new URL(BASE).origin;
const OUT = process.env.TORQUE_TEST_OUTPUT_DIR || (process.env.RUNNER_TEMP && path.join(process.env.RUNNER_TEMP, 'torque-testes'));
let browser, checks = 0;
const pass = message => { checks++; console.log('PASS ' + message); };
async function isolated(role = 'nutri') {
  const context = await browser.newContext({serviceWorkers:'block',timezoneId:'America/Sao_Paulo',viewport:{width:1280,height:900}});
  const errors = [], external = [], missing = [];
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== ORIGIN || !['GET','HEAD'].includes(request.method())) { external.push(url.origin + url.pathname); return route.abort(); }
    if (url.pathname.endsWith('/nutri/config.js')) return route.fulfill({contentType:'application/javascript',body:'window.TORQUE_NUTRI_CONFIG={};'});
    if (url.pathname.endsWith('/nutri/app.js')) return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(__dirname,'../nutri/app.js'),'utf8')+'\nwindow.__nutriVisualFixture={S,render};\n'});
    return route.continue();
  });
  await context.routeWebSocket('**/*', socket => { external.push('websocket'); socket.close(); });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() === 404 && new URL(response.url()).origin === ORIGIN) missing.push(response.url()); });
  await page.goto(BASE + '/nutri/demo-' + (role === 'nutri' ? 'nutricionista' : 'paciente') + '.html');
  await page.locator('.demo-notice').waitFor();
  return {page,context,errors,external,missing};
}
async function nav(page, destination) {
  let button = page.locator('.sidebar [data-page="' + destination + '"]');
  if (!await button.isVisible()) {
    await page.locator('.sidebar [data-page="more"]').click();
    button = page.locator('.module-grid [data-page="' + destination + '"]');
  }
  await button.focus(); await page.keyboard.press('Enter');
}
async function screenshot(page, label) {
  if (!OUT) return;
  fs.mkdirSync(OUT,{recursive:true});
  await page.screenshot({path:path.join(OUT,'nutri-workspace-'+label+'.png'),fullPage:true});
}
async function viewport(page, label) {
  await page.evaluate(() => document.fonts.ready);
  const sizes = await page.evaluate(() => ({width:document.documentElement.clientWidth,scroll:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)}));
  assert(sizes.scroll <= sizes.width + 1, label + ': content escapes the viewport ' + JSON.stringify(sizes));
}
async function targets(locator, label) {
  const sizes = await locator.evaluateAll(elements => elements.filter(e => e.getClientRects().length).map(e => {
    const r = e.getBoundingClientRect(); return {label:e.getAttribute('aria-label')||e.textContent.trim(),width:r.width,height:r.height};
  }));
  assert(sizes.length, label + ': no controls found');
  assert(sizes.every(r => r.width >= 43.5 && r.height >= 43.5), label + ': undersized controls ' + JSON.stringify(sizes.filter(r => r.width < 43.5 || r.height < 43.5)));
}
async function equalRows(locator, label, footer = false) {
  const boxes = await locator.evaluateAll((elements,withFooter) => elements.map(element => {
    const r = element.getBoundingClientRect(), f = withFooter ? element.querySelector('.sub')?.getBoundingClientRect() : null;
    return {text:element.textContent.trim(),y:r.y,width:r.width,height:r.height,bottom:r.bottom,footer:f?.bottom};
  }),footer);
  assert(boxes.length > 1, label + ': missing shortcuts');
  const rows = [];
  for (const box of boxes) { let row=rows.find(items=>Math.abs(items[0].y-box.y)<2); if (!row) rows.push(row=[]); row.push(box); }
  for (const row of rows) {
    assert(row.every(box=>Math.abs(box.width-row[0].width)<2 && Math.abs(box.height-row[0].height)<2),label + ': uneven shortcut row ' + JSON.stringify(row));
    if (footer) assert(row.every(box=>Math.abs(box.footer-row[0].footer)<2),label + ': Open links have different baselines ' + JSON.stringify(row));
  }
}
function clean(h) { assert.deepEqual(h.errors,[]); assert.deepEqual(h.external,[]); assert.deepEqual(h.missing,[]); }
async function sharedShortcuts() {
  const h = await isolated(), p = h.page;
  for (const width of [320,375,800,1280]) for (const light of [false,true]) {
    await p.setViewportSize({width,height:900});
    await p.evaluate(value=>document.body.classList.toggle('theme-light',value),light);
    await p.locator('.sidebar [data-page="more"]').evaluate(e=>e.click());
    await targets(p.locator('.topbar [data-action="theme"]'),'theme switch at '+width);
    await equalRows(p.locator('.module-grid .module-card'),'professional menu at '+width,true);
    await viewport(p,'professional menu at '+width);
    await screenshot(p,'professional-menu-'+width+'-'+(light?'light':'dark'));
    await nav(p,'library');
    const geometry = await p.locator('.heading').evaluate(element=>{
      const text=element.firstElementChild.getBoundingClientRect(), controls=element.querySelector('.actions').getBoundingClientRect();
      return {textBottom:text.bottom,controlTop:controls.top,textRight:text.right,controlLeft:controls.left};
    });
    assert(geometry.controlTop>=geometry.textBottom-1 || geometry.controlLeft>=geometry.textRight-1,'library actions overlap its title at '+width);
    if(width<=800) assert(geometry.controlTop>=geometry.textBottom-1,'library actions must have a full line below the copy at '+width);
    if(width<=800) await equalRows(p.locator('.heading .actions>.btn'),'library actions at '+width);
    await viewport(p,'library at '+width);
    await nav(p,'patients');
    await p.locator('[data-follow-page="profile"][data-follow-patient="demo-0"]').click();
    const shortcuts=p.locator('.follow-app>.card').filter({has:p.locator('h2',{hasText:'Ficha 360°'})}).locator('.actions>.btn');
    await targets(shortcuts,'patient record shortcuts at '+width);
    await equalRows(shortcuts,'patient record shortcuts at '+width);
    await viewport(p,'patient record at '+width);
  }
  pass('menu links, library actions and patient shortcuts keep equal rows and usable targets in four widths and both themes');
  clean(h); await h.context.close();
}
async function patientPlan() {
  const h=await isolated('patient'),p=h.page;
  await nav(p,'food');
  await p.locator('[data-plan-jump="plan-meal-3"]').focus();
  await p.keyboard.press('Enter');
  assert.equal(await p.evaluate(()=>document.activeElement.id),'plan-meal-3');
  const mealId=await p.locator('#plan-meal-3 [data-log-meal]').getAttribute('data-log-meal');
  await p.keyboard.press('Tab');
  assert.equal(await p.evaluate(()=>document.activeElement.getAttribute('data-log-meal')),mealId);
  await p.keyboard.press('Enter');
  await p.locator('#modal[open]').waitFor();
  assert.match(await p.locator('#modal').textContent(),/Jantar/);
  await p.locator('#cancel-modal').click();
  pass('patient meal index moves keyboard focus to the selected meal and its diary action');
  await p.evaluate(()=>{
    const {S,render}=window.__nutriVisualFixture;
    S.patients[0].name='Paciente de demonstração com nome composto muito extenso';
    const plan=S.plans.find(x=>x.patient_id==='demo-0'&&x.status==='published').data;
    plan.titulo='Plano de demonstração para dias de trabalho e finais de semana';
    plan.refeicoes[0].titulo='Café da manhã de demonstração com nome longo';
    plan.refeicoes[0].itens[0].nome='Alimento demonstrativo de nome extenso com descrição para conferir a legibilidade';
    plan.refeicoes[0].itens[0].porcao='1 unidade média (porção de demonstração)';
    document.body.classList.add('large-text');render();
  });
  for (const width of [320,375,800,1280]) for (const light of [false,true]) {
    await p.setViewportSize({width,height:900});
    await p.evaluate(value=>document.body.classList.toggle('theme-light',value),light);
    await viewport(p,'patient plan with long content at '+width);
    await targets(p.locator('.meal-plan button'),'patient plan actions at '+width);
    const rows=await p.locator('.plan-food-row').evaluateAll(elements=>elements.map(row=>{
      const name=row.firstElementChild.getBoundingClientRect(),portion=row.lastElementChild.getBoundingClientRect(),box=row.getBoundingClientRect();
      return {name:name.width,portion:portion.width,left:portion.left,nameRight:name.right,bottom:box.bottom,nameBottom:name.bottom,portionBottom:portion.bottom};
    }));
    assert(rows.every(r=>r.name>=100 && r.portion>=70 && r.left>=r.nameRight-1 && r.bottom>=Math.max(r.nameBottom,r.portionBottom)-1),'patient food names or portions collide at '+width+': '+JSON.stringify(rows));
    await screenshot(p,'patient-plan-long-'+width+'-'+(light?'light':'dark'));
  }
  pass('long meal, food, portion and patient labels remain readable with enlarged text in both themes');
  await p.evaluate(()=>{const {S,render}=window.__nutriVisualFixture;S.plans=[];render();});
  assert.match(await p.locator('.plan-empty').textContent(),/preparando seu plano/);
  assert.equal(await p.locator('[data-log-meal]').count(),0);
  await p.locator('.plan-empty [data-page="chat"]').focus();await p.keyboard.press('Enter');
  await p.locator('#message-body').waitFor();
  pass('empty patient plan offers a working conversation link without sample meals');
  clean(h);await h.context.close();
}
async function prescriptionWorkspace() {
  const h=await isolated(),p=h.page;
  await nav(p,'plans');
  await p.locator('[data-edit-plan="demo-0"]').click();
  const original=Number(await p.locator('[data-prescription-total="k"]').textContent());
  const originalMeal=Number(await p.locator('[data-meal-total="0"]').textContent());
  const perPortion=Number(await p.locator('[data-food-nutrient="0:0:k"]').textContent());
  const quantity=p.locator('[data-food-q="0:0"]');
  assert.equal(await quantity.inputValue(),'1');
  await quantity.fill('2');
  assert.equal(await p.locator('[data-prescription-total="k"]').textContent(),String(original+perPortion));
  assert.equal(await p.locator('[data-meal-total="0"]').textContent(),String(originalMeal+perPortion));
  assert.equal(await p.locator('[data-food-nutrient="0:0:k"]').textContent(),String(perPortion*2));
  assert.equal(await quantity.evaluate(e=>e===document.activeElement),true,'updating nutrition must not replace the focused quantity field');
  await p.locator('[data-meal-day="0:1"]').focus();await p.keyboard.press('Space');
  assert.equal(await p.locator('[data-meal-day="0:1"]').isChecked(),false);
  await p.locator('.prescription-settings>summary').focus();await p.keyboard.press('Enter');
  await p.locator('#plan-notes').fill('Orientação fictícia para conferir o rascunho.');
  await p.locator('[data-action="save-draft"]').click();
  await p.waitForFunction(()=>document.querySelector('[data-draft-status]')?.textContent==='Rascunho salvo');
  assert.match(await p.locator('.prescription-patient-heading').textContent(),/Publicado · v1/);
  await p.locator('[data-action="publish-plan"]').click();
  assert.match(await p.locator('#modal-body').textContent(),/Orientação fictícia para conferir o rascunho/);
  assert.equal(await p.locator('#confirm-plan-review').isChecked(),false);
  await p.locator('#cancel-modal').click();
  pass('portion edits update food, meal and plan totals without losing focus, while saving still requires publication review');

  for (const width of [320,375,800,1280]) for (const light of [false,true]) {
    await p.setViewportSize({width,height:900});
    await p.evaluate(value=>{document.body.classList.toggle('theme-light',value);document.querySelectorAll('.prescription-settings,.prescription-context,.prescription-disclosure').forEach(e=>e.open=false);scrollTo(0,0);},light);
    await viewport(p,'prescription editor at '+width);
    await targets(p.locator('[data-move-meal],[data-duplicate-meal],[data-remove-food],[data-move-food],[data-duplicate-food],[data-alternative],[data-add-food],[data-remove-meal]'),'prescription controls at '+width);
    await targets(p.locator('.prescription-day'),'weekday choices at '+width);
    const geometry=await p.evaluate(()=>({summary:document.querySelector('.prescription-summary').getBoundingClientRect().top,context:document.querySelector('.prescription-context').getBoundingClientRect().bottom,meal:document.querySelector('.prescription-meal').getBoundingClientRect().top}));
    if(width<=800) assert(geometry.summary<geometry.meal && geometry.context<geometry.meal,'mobile nutritional context is buried after the meal editor at '+width);
    await p.locator('.prescription-context>summary').focus();await p.keyboard.press('Enter');
    assert.equal(await p.locator('.prescription-context [data-x="record-edit"]').isVisible(),true);
    await p.locator('.prescription-context>summary').press('Enter');
    if(width===1280){
      await p.locator('.prescription-meal').last().scrollIntoViewIfNeeded();
      const summary=await p.locator('.prescription-summary').boundingBox();
      assert(summary.y>=0 && summary.y<100,'desktop nutrition summary disappears while editing later meals');
    }
    await p.evaluate(()=>scrollTo(0,0));
    await screenshot(p,'editor-'+width+'-'+(light?'light':'dark'));
  }
  pass('prescription controls and weekdays have usable targets, with accessible mobile context and a persistent desktop summary');
  await nav(p,'plans');
  await p.evaluate(()=>{
    const {S,render}=window.__nutriVisualFixture;
    S.patients[0].name='Paciente de demonstração com nome composto muito extenso';
    S.plans.filter(x=>x.patient_id==='demo-0').forEach(x=>{x.data.titulo='Plano de demonstração para dias de trabalho e finais de semana';});
    document.body.classList.add('large-text');render();
  });
  for(const width of [320,375,800,1280]){
    await p.setViewportSize({width,height:900});
    await viewport(p,'long patient plan list at '+width);
    const name=p.locator('.patient-row').filter({has:p.locator('[data-edit-plan="demo-0"]')}).locator('.grow');
    assert((await name.boundingBox()).width>=150,'publication status squeezes the patient name at '+width);
  }
  await p.locator('[data-edit-plan="demo-0"]').click();
  await p.evaluate(()=>{
    const {S,render}=window.__nutriVisualFixture;
    S.edit.refeicoes[0].itens[0].nome='Alimento demonstrativo de nome extenso com descrição para conferir a legibilidade';
    S.edit.refeicoes[0].itens[0].porcao='1 unidade média (porção de demonstração)';render();
  });
  for(const width of [320,375,800,1280])for(const light of [false,true]){
    await p.setViewportSize({width,height:900});await p.evaluate(value=>document.body.classList.toggle('theme-light',value),light);
    await viewport(p,'long prescription content at '+width);
    const food=p.locator('.prescription-food').first();
    const heading=await food.locator('h3').boundingBox(),remove=await food.locator('[data-remove-food]').boundingBox();
    assert(heading.width>=140 && heading.x+heading.width<=remove.x+1,'long food name is squeezed or covered by remove at '+width);
    await targets(food.locator('button'),'long food actions at '+width);
    await screenshot(p,'editor-long-'+width+'-'+(light?'light':'dark'));
  }
  pass('long patient and food names retain useful reading space alongside prescription controls');
  clean(h);await h.context.close();
}

(async()=>{
  try {
    browser = await chromium.launch({headless:true,args:['--no-sandbox']});
    await sharedShortcuts();
    await prescriptionWorkspace();
    await patientPlan();
    console.log(checks+'/'+checks+' Nutri visual workspace browser checks passed.');
  } finally { await browser?.close(); }
})().catch(error=>{ console.error(error.stack); process.exitCode=1; });
