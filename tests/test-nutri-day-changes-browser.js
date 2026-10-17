'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.TORQUE_PLAYWRIGHT||'playwright');
const BASE=(process.env.BASE_URL||'http://127.0.0.1:8765').replace(/\/$/,''),ORIGIN=new URL(BASE).origin;
let browser,checks=0;const pass=name=>{checks++;console.log('PASS '+name);};
(async()=>{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
  const context=await browser.newContext({serviceWorkers:'block',timezoneId:'America/Sao_Paulo',viewport:{width:1280,height:900}}),external=[],errors=[];
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin!==ORIGIN||!['GET','HEAD'].includes(route.request().method())){external.push(url.origin+url.pathname);return route.abort();}
    if(url.pathname.endsWith('/nutri/config.js'))return route.fulfill({contentType:'application/javascript',body:'window.TORQUE_NUTRI_CONFIG={};'});
    if(url.pathname.endsWith('/nutri/app.js'))return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(__dirname,'../nutri/app.js'),'utf8')+'\nwindow.__dayChangesFixture={S,render,openEditor};'});
    return route.continue();
  });
  await context.routeWebSocket('**/*',socket=>{external.push('websocket');socket.close();});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(BASE+'/nutri/demo-nutricionista.html');await page.locator('.demo-notice').waitFor();
  await page.evaluate(()=>{
    const {S}=window.__dayChangesFixture;
    const item={id:'shared-food',nome:'Arroz',porcao:'100 g',qtd:1,k:100,pt:2,cb:20,g:0,manual:'PRESERVE',substituicoes:[{id:'alt',nome:'Batata',porcao:'100 g',qtd:1,k:80,pt:1,cb:15,g:0}]};
    const plan={v:1,titulo:'Semana de teste',aguaMl:2000,orientacoes:'Orientação inicial',refeicoes:[{id:'mon',titulo:'Almoço segunda',hora:'12:00',dias:[1],itens:[item]},{id:'tue',titulo:'Almoço terça',hora:'13:00',dias:[2],itens:[{...item,qtd:2,k:200}]}]};
    S.plans.find(p=>p.patient_id==='demo-0'&&p.status==='published').data=plan;
    window.__dayChangesFixture.openEditor('demo-0');
  });
  await page.locator('#prescription-date').fill('2026-10-12');await page.locator('#prescription-date').dispatchEvent('change');
  assert.equal(await page.locator('[data-prescription-total="k"]').textContent(),'100');
  await page.locator('[data-plan-day="2026-10-13"]').click();assert.equal(await page.locator('[data-prescription-total="k"]').textContent(),'400');
  await page.locator('[data-plan-day="2026-10-12"]').click();await page.locator('[data-food-q="0:0"]').fill('2');
  assert.equal(await page.locator('[data-prescription-total="k"]').textContent(),'200');
  assert.equal(await page.locator('[data-food-q="0:0"]').evaluate(e=>e===document.activeElement),true);
  await page.locator('[data-plan-day="2026-10-13"]').click();assert.equal(await page.locator('[data-prescription-total="k"]').textContent(),'400');
  pass('editor switches weekdays and updates only that day while preserving portion focus');

  await page.evaluate(()=>{const {S,render}=window.__dayChangesFixture;S.edit.refeicoes[0].itens[0].qtd='1,5';S.localDirty=false;render();});
  assert.equal(await page.locator('[data-food-q="0:0"]').inputValue(),'1.5');
  await page.locator('[data-plan-day="2026-10-12"]').click();
  assert.equal(await page.locator('[data-prescription-total="k"]').textContent(),'150');
  assert.equal(await page.evaluate(()=>window.__dayChangesFixture.S.edit.refeicoes[0].itens[0].qtd),'1,5');
  assert.equal(await page.evaluate(()=>window.__dayChangesFixture.S.localDirty),false);
  await page.locator('[data-meal-time="0"]').fill('12:15');
  assert.equal(await page.evaluate(()=>window.__dayChangesFixture.S.edit.refeicoes[0].itens[0].qtd),'1,5');
  assert.equal(await page.evaluate(()=>window.__dayChangesFixture.S.edit.refeicoes[0].itens[0].manual),'PRESERVE');
  await page.locator('[data-food-q="0:0"]').fill('2');await page.locator('[data-plan-day="2026-10-13"]').click();
  pass('legacy decimal-comma portions survive day-only navigation and unrelated edits without dirtying or losing manual data');

  await page.locator('.prescription-settings>summary').click();
  await page.locator('#plan-start').fill('2026-10-13');assert.equal(await page.locator('[data-prescription-total="k"]').textContent(),'400');
  await page.locator('[data-plan-day="2026-10-12"]').click();assert.equal(await page.locator('[data-prescription-total="k"]').textContent(),'0');
  assert.match(await page.locator('[data-prescription-day-note]').textContent(),/não começou/);
  await page.locator('.prescription-settings>summary').click();await page.locator('#plan-start').fill('2026-10-12');await page.locator('#plan-end').fill('2026-10-12');
  await page.locator('[data-plan-day="2026-10-13"]').click();assert.equal(await page.locator('[data-prescription-total="k"]').textContent(),'400');assert.match(await page.locator('[data-prescription-day-note]').textContent(),/posterior à revisão/);
  pass('future dates suppress totals while the review date warns without expiring meals');

  await page.locator('[data-action="publish-plan"]').click();
  assert.match(await page.locator('.plan-week-summary').textContent(),/Segunda 12\/10/);
  assert.match(await page.locator('.plan-changes').textContent(),/Porção/);
  await page.locator('.plan-changes summary').click();assert.match(await page.locator('.plan-changes').textContent(),/1 × 100 g/);assert.match(await page.locator('.plan-changes').textContent(),/2 × 100 g/);
  await page.locator('#confirm-plan-review').check();await page.locator('#modal-form button[type="submit"]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);
  assert.equal(await page.evaluate(()=>window.__dayChangesFixture.S.records.filter(r=>r.kind==='plan_version'&&r.patient_id==='demo-0').length),2);
  pass('review exposes the weekly table and exact changes before explicitly publishing snapshots');

  await page.evaluate(()=>{const {S,render}=window.__dayChangesFixture;S.role='patient';S.page='food';render();});
  await page.locator('#patient-plan-date').fill('2026-10-12');await page.locator('#patient-plan-date').dispatchEvent('change');
  assert.equal(await page.locator('.plan-meal').count(),1);assert.match(await page.locator('.plan-meal').textContent(),/Almoço segunda/);
  assert.match(await page.locator('.nutrient-k dd').textContent(),/200 kcal/);
  assert.match(await page.locator('main .plan-changes').textContent(),/Versão 1 → 2/);
  assert.match(await page.locator('main .plan-changes').textContent(),/Porção/);
  await page.locator('[data-plan-day="2026-10-13"]').click();assert.match(await page.locator('.nutrient-k dd').textContent(),/400 kcal/);assert.match(await page.locator('.plan-meal').textContent(),/Almoço terça/);
  pass('published patient plan shows only selected-day meals and compares the previous published version');

  await page.locator('[data-plan-day="2026-10-14"]').click();assert.equal(await page.locator('.plan-meal').count(),0);assert.match(await page.locator('.plan-meal-list').textContent(),/Nenhuma refeição prevista nesta data/);await page.locator('[data-plan-day="2026-10-13"]').click();
  pass('a day without scheduled meals explains the empty date without claiming the published plan is empty');

  await page.evaluate(()=>{window.__printed='';window.open=()=>({document:{write:html=>{window.__printed=html;},close:()=>{}},set onload(fn){}});});
  await page.locator('[data-action="print"]').click();
  const printed=await page.evaluate(()=>window.__printed);assert.match(printed,/Resumo por dia da semana/);assert.match(printed,/Segunda 12\/10/);assert.match(printed,/<td>200<\/td>/);assert.match(printed,/<td>400<\/td>/);assert.doesNotMatch(printed,/>600</);
  pass('print/PDF source includes the same week and per-day nutrient values');

  await page.evaluate(()=>{const {S,render}=window.__dayChangesFixture;const pub=S.plans.find(p=>p.patient_id==='demo-0'&&p.status==='published');pub.data.refeicoes[1].itens[0].cb=null;const old=S.records.find(r=>r.kind==='plan_version'&&r.data.planVersion===1);old.visibility='clinician';old.data.plan.orientacoes='PRIVATE-SNAPSHOT-MUST-NOT-LEAK';render();});
  assert.match(await page.locator('.nutrient-cb dd').textContent(),/Não informado/);assert.match(await page.locator('.nutrient-g dd').textContent(),/0 g/);
  assert.match(await page.locator('main .plan-changes').textContent(),/não está disponível/);assert.doesNotMatch(await page.locator('main').textContent(),/PRIVATE-SNAPSHOT/);
  pass('missing nutrition remains unknown and private snapshots never appear in comparisons');

  for(const width of [320,390,768,1280]){
    await page.setViewportSize({width,height:900});
    for(const light of [false,true]){
      await page.evaluate(value=>{document.body.classList.toggle('theme-light',value);document.body.classList.add('large-text');},light);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1),false,'patient width '+width);
    }
  }
  await page.evaluate(()=>{const {S,render}=window.__dayChangesFixture;S.role='nutri';S.page='editor';S.edit.refeicoes[0].itens[0].cb=null;S.prescriptionDay='2026-10-12';render();});
  for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1),false,'editor width '+width);}
  pass('day controls, unknown values and comparisons fit mobile and desktop in both themes with large text');
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);pass('all browser checks remain in isolated demo without external reads or writes');
  await context.close();await browser.close();browser=null;console.log(checks+' day-summary and plan-change browser checks passed.');
})().catch(async error=>{console.error(error);if(browser)await browser.close();process.exitCode=1;});
