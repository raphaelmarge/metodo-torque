'use strict';
// Real Nutri demo forms and reports, using only fictional local assessments.
// The test exposes state for fixture setup/read-back; it never calls an API.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
let chromium;
if(process.env.TORQUE_PLAYWRIGHT)({chromium}=require(process.env.TORQUE_PLAYWRIGHT));
else{try{({chromium}=require('playwright'));}catch{({chromium}=require('/opt/node22/lib/node_modules/playwright'));}}
const BASE=(process.env.BASE_URL||'http://127.0.0.1:8765').replace(/\/$/,''),ORIGIN=new URL(BASE).origin;
const OUT=process.env.TORQUE_TEST_OUTPUT_DIR||(process.env.RUNNER_TEMP&&path.join(process.env.RUNNER_TEMP,'torque-testes'));
let browser,checks=0;
const contexts=[];
const pass=message=>{checks++;console.log('PASS '+message);};

async function isolated(role='nutri'){
 const context=await browser.newContext({serviceWorkers:'block',timezoneId:'America/Sao_Paulo',viewport:{width:1280,height:900}});
 contexts.push(context);const errors=[],requests=[],missing=[];
 await context.addInitScript(()=>{
  const NativeDate=Date,fixed=NativeDate.parse('2026-10-13T12:00:00Z');
  window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return fixed;}};
 });
 await context.route('**/*',route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!==ORIGIN||!['GET','HEAD'].includes(request.method())||/\/(rest|auth|functions|storage)\/v\d\//.test(url.pathname)){
   requests.push(request.method()+' '+url.origin+url.pathname);return route.abort();
  }
  if(url.pathname.endsWith('/nutri/config.js'))return route.fulfill({contentType:'application/javascript',body:'window.TORQUE_NUTRI_CONFIG={};'});
  if(url.pathname.endsWith('/nutri/app.js'))return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(__dirname,'../nutri/app.js'),'utf8')+'\nwindow.__skinfoldFixture={S,render};\n'});
  return route.continue();
 });
 await context.routeWebSocket('**/*',socket=>{requests.push('websocket');socket.close();});
 const page=await context.newPage();
 page.on('pageerror',error=>errors.push(error.message));
 page.on('response',response=>{if(response.status()>=400&&new URL(response.url()).origin===ORIGIN)missing.push(response.status()+' '+response.url());});
 await page.goto(BASE+'/nutri/demo-'+(role==='nutri'?'nutricionista':'paciente')+'.html',{waitUntil:'domcontentloaded'});
 await page.locator('.demo-notice').waitFor();
 return {page,context,errors,requests,missing};
}
function clean(h){assert.deepEqual(h.errors,[]);assert.deepEqual(h.requests,[]);assert.deepEqual(h.missing,[]);}
async function nav(page,destination){
 let button=page.locator('.sidebar [data-page="'+destination+'"]');
 if(!await button.isVisible()){
  await page.locator('.sidebar [data-page="more"]').click();
  button=page.locator('.module-grid [data-page="'+destination+'"]');
 }
 await button.focus();await page.keyboard.press('Enter');
}
const input=(page,id)=>page.locator('[id="body-'+id+'"]');
async function save(page){await page.locator('#modal-form button[type="submit"]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);}
async function assessment(page,title){return page.evaluate(name=>window.__skinfoldFixture.S.records.find(record=>record.kind==='assessment'&&record.title===name),title);}
async function layout(page,label){
 await page.evaluate(()=>document.fonts.ready);
 const geometry=await page.evaluate(()=>{
  const dialog=document.querySelector('#modal[open]');
  return {width:document.documentElement.clientWidth,scroll:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth),dialog:dialog?{width:dialog.clientWidth,scroll:dialog.scrollWidth}:null};
 });
 assert(geometry.scroll<=geometry.width+1,label+' overflows the viewport: '+JSON.stringify(geometry));
 assert(!geometry.dialog||geometry.dialog.scroll<=geometry.dialog.width+1,label+' overflows the assessment dialog: '+JSON.stringify(geometry));
 assert.doesNotMatch(await page.locator('main').textContent(),/\bNaN\b|\[object Object\]/,label);
 if(OUT){fs.mkdirSync(OUT,{recursive:true});await page.screenshot({path:path.join(OUT,'nutri-skinfolds-'+label+'.png'),fullPage:true});}
}

async function legacyAndEmpty(){
 const h=await isolated(),p=h.page;
 await p.evaluate(()=>{
  const {S,render}=window.__skinfoldFixture;
  S.records=S.records.filter(record=>!['assessment','measurement'].includes(record.kind));
  S.records.push({id:'qa-legacy',patient_id:'demo-0',clinician_id:'demo',created_by:'demo',kind:'assessment',visibility:'private',version:4,title:'Avaliação legada fictícia',created_at:'2026-09-09T12:00:00Z',data:{day:'2026-09-09',weight:70,height:170,fat:23.4,source:'Aparelho informado na avaliação legada',method:'Método legado livre',skinfolds:{triceps:15,externalSite:'preservar'},external:{reference:'fixture histórica'}}});
  S.selected='demo-0';render();
 });
 const before=JSON.stringify(await assessment(p,'Avaliação legada fictícia'));
 await nav(p,'assessments');
 for(const tab of ['body','measures','history','summary'])await p.locator('.body-tabs [data-body-tab="'+tab+'"]').click();
 assert.equal(JSON.stringify(await assessment(p,'Avaliação legada fictícia')),before,'reading an old assessment must not recalculate or annotate its JSON');
 await p.locator('.body-tabs [data-body-tab="history"]').click();
 await p.locator('[data-x="record-edit"][data-id="qa-legacy"]').click();
 assert.equal(await input(p,'age').inputValue(),'');
 assert.equal(await input(p,'sex').inputValue(),'');
 assert.equal(await input(p,'fat').inputValue(),'23.4');
 await save(p);
 const saved=await assessment(p,'Avaliação legada fictícia');
 assert.equal(saved.data.fat,23.4);assert.equal(saved.data.source,'Aparelho informado na avaliação legada');assert.equal(saved.data.method,'Método legado livre');
 assert.equal(saved.visibility,'private');assert.equal(saved.data.day,'2026-09-09');assert.equal(saved.data.skinfolds.triceps,15);assert.equal(saved.data.skinfolds.externalSite,'preservar');assert.deepEqual(saved.data.external,{reference:'fixture histórica'});
 pass('legacy assessments are never recalculated by reading and preserve manual values, provenance, private visibility and unknown JSON when saved');
 await p.evaluate(()=>{const {S,render}=window.__skinfoldFixture;S.records=S.records.filter(record=>!['assessment','measurement'].includes(record.kind));render();});
 await p.locator('.body-tabs [data-body-tab="body"]').click();
 assert.match(await p.locator('main').textContent(),/Registre a primeira avaliação/);
 assert.equal(await p.locator('[data-x="assessment-print"]').count(),0);
 assert.doesNotMatch(await p.locator('main').textContent(),/23[,.]4/);
 pass('an empty assessment area keeps an empty state without fabricated measurements');
 clean(h);await h.context.close();
}
async function requiredSites(page,expected){
 const actual=await page.locator('#body-skinfold-fields input').evaluateAll(elements=>elements.map(e=>e.id.replace('body-skinfolds.','')));
 assert.deepEqual(actual.sort(),[...expected].sort());
}
async function fillSites(page,values){for(const [site,value] of Object.entries(values))await input(page,'skinfolds.'+site).fill(String(value));}
async function openSaved(page,id){
 await page.locator('.body-tabs [data-body-tab="history"]').click();
 await page.locator('[data-x="record-edit"][data-id="'+id+'"]').click();
}
async function restoredCalculationDraft(){
 const h=await isolated(),p=h.page;
 const before=await p.evaluate(()=>JSON.stringify(window.__skinfoldFixture.S.records));
 await nav(p,'assessments');await p.locator('.heading [data-x="assessment"]').click();
 await input(p,'title').fill('Rascunho fictício ainda não salvo');await input(p,'day').fill('2026-09-21');
 await input(p,'fat').fill('31.2');await input(p,'sex').selectOption('F');await input(p,'age').fill('30');
 await p.locator('#body-skinfold-protocol').selectOption('p3');await fillSites(p,{triceps:10,suprailiac:20,thigh:30});
 await p.locator('#body-skinfold-use').click();
 assert.equal(await input(p,'fat').inputValue(),'24.1');
 await p.locator('#cancel-modal').click();
 await nav(p,'library');await nav(p,'assessments');
 await p.locator('.heading [data-x="assessment"]').click();
 assert.equal(await input(p,'title').inputValue(),'Rascunho fictício ainda não salvo');assert.equal(await input(p,'day').inputValue(),'2026-09-21');
 assert.equal(await p.locator('#body-skinfold-protocol').inputValue(),'p3');assert.equal(await input(p,'sex').inputValue(),'F');assert.equal(await input(p,'age').inputValue(),'30');
 for(const [site,value] of Object.entries({triceps:10,suprailiac:20,thigh:30}))assert.equal(await input(p,'skinfolds.'+site).inputValue(),String(value));
 assert.equal(await p.locator('#body-fat-source').inputValue(),'skinfolds');assert.equal(await input(p,'fat').inputValue(),'24.1');assert.equal(await input(p,'fat').evaluate(e=>e.readOnly),true);assert.equal(await p.locator('#body-fat-informed').inputValue(),'31.2');
 assert.match(await p.locator('#body-skinfold-result').textContent(),/24[,.]1\s*%/);
 await p.locator('#body-fat-source').selectOption('informed');assert.equal(await input(p,'fat').inputValue(),'31.2');assert.equal(await input(p,'fat').evaluate(e=>e.readOnly),false);
 await p.locator('#close-modal').click();await p.locator('.heading [data-x="assessment"]').click();
 assert.equal(await p.locator('#body-fat-source').inputValue(),'informed');assert.equal(await input(p,'fat').inputValue(),'31.2');assert.equal(await input(p,'fat').evaluate(e=>e.readOnly),false);
 await p.locator('#cancel-modal').click();
 assert.equal(await p.evaluate(()=>JSON.stringify(window.__skinfoldFixture.S.records)),before,'restoring a local modal draft must not save an assessment');
 pass('closing an unsaved calculated form restores protocol, inputs, readonly percentage and its manual backup without persisting a record');
 clean(h);await h.context.close();
}
async function protocolWorkflow(){
 const h=await isolated(),p=h.page;
 await nav(p,'assessments');await p.locator('.heading [data-x="assessment"]').click();
 await input(p,'title').fill('Dobras fictícias para QA');await input(p,'day').fill('2026-09-17');
 await input(p,'source').fill('Adipômetro de demonstração');await input(p,'method').fill('Condições descritas pelo profissional');
 await input(p,'fat').fill('28.5');
 const protocol=p.locator('#body-skinfold-protocol'),use=p.locator('#body-skinfold-use'),source=p.locator('#body-fat-source');
 assert.deepEqual(await protocol.locator('option').evaluateAll(elements=>elements.map(e=>e.value)),['','p3','p7','guedes']);
 await protocol.selectOption('p3');
 assert.equal(await use.isDisabled(),true,'sex and age must be explicit');
 await input(p,'sex').selectOption('F');await fillSites(p,{triceps:10,suprailiac:20,thigh:30});
 assert.equal(await use.isDisabled(),true,'folds cannot substitute an unreported age');
 assert.equal(await input(p,'fat').inputValue(),'28.5');
 await input(p,'age').fill('30');await requiredSites(p,['triceps','suprailiac','thigh']);
 assert.match(await p.locator('#body-skinfold-result').textContent(),/24[,.]1\s*%/);
 assert.equal(await source.inputValue(),'informed');assert.equal(await input(p,'fat').inputValue(),'28.5','preview must not overwrite a manually measured fat percentage');
 await input(p,'sex').selectOption('M');await requiredSites(p,['chest','abdominal','thigh']);
 await fillSites(p,{chest:12,abdominal:22,thigh:32});
 assert.equal(await input(p,'skinfolds.triceps').inputValue(),'10','changing sex must retain previously recorded sites');
 await protocol.selectOption('p7');await requiredSites(p,['chest','midaxillary','triceps','subscapular','abdominal','suprailiac','thigh']);
 assert.equal(await use.isDisabled(),true,'a seven-site calculation requires all seven actual measurements');
 await fillSites(p,{midaxillary:18,subscapular:16});assert.equal(await use.isDisabled(),false);
 await protocol.selectOption('guedes');await input(p,'age').fill('22');await requiredSites(p,['triceps','suprailiac','abdominal']);
 await input(p,'sex').selectOption('F');await input(p,'age').fill('25');await requiredSites(p,['subscapular','suprailiac','thighProximal']);
 assert.equal(await use.isDisabled(),true,'Guedes requires proximal thigh, not a previously measured Pollock mid-thigh');
 await fillSites(p,{subscapular:30,suprailiac:30,thighProximal:40});
 assert.match(await p.locator('#body-skinfold-result').textContent(),/32[,.]8\s*%/);
 assert.equal(await input(p,'fat').inputValue(),'28.5');
 assert.equal(await input(p,'skinfolds.chest').inputValue(),'12');assert.equal(await input(p,'skinfolds.abdominal').inputValue(),'22');
 pass('all three protocols use their sex-specific sites, require sex and age, retain measurements when switched and keep preview separate from manual fat');

 await protocol.selectOption('p3');await input(p,'age').fill('30');await fillSites(p,{triceps:10,suprailiac:20,thigh:30});
 await use.click();assert.equal(await source.inputValue(),'skinfolds');assert.equal(await input(p,'fat').inputValue(),'24.1');
 assert.equal(await input(p,'fat').evaluate(e=>e.readOnly),true);assert.equal(await p.locator('#body-fat-informed').inputValue(),'28.5');
 await input(p,'skinfolds.triceps').fill('20');
 assert.notEqual(await input(p,'fat').inputValue(),'24.1','a selected estimate must update after its measurements change');
 assert.equal(await input(p,'skinfolds.triceps').evaluate(e=>e===document.activeElement),true,'live calculation must preserve the input focus');
 await source.selectOption('informed');assert.equal(await input(p,'fat').inputValue(),'28.5');assert.equal(await input(p,'fat').evaluate(e=>e.readOnly),false);
 await input(p,'skinfolds.triceps').fill('10');await use.click();
 await input(p,'skinfolds.triceps').fill('0');assert.equal(await use.isDisabled(),true);
 await p.locator('#modal-form button[type="submit"]').click();
 assert.equal(await p.locator('#modal').evaluate(e=>e.open),true,'an invalid selected calculation must not be saved as an old percentage');
 assert.equal(await assessment(p,'Dobras fictícias para QA'),undefined);
 await input(p,'skinfolds.triceps').fill('10');
 for(const width of [375,1280])for(const light of [false,true]){
  await p.setViewportSize({width,height:900});await p.evaluate(value=>document.body.classList.toggle('theme-light',value),light);
  await p.locator('#body-skinfold-result').scrollIntoViewIfNeeded();await layout(p,'form-'+width+'-'+(light?'light':'dark'));
 }
 await save(p);
 const saved=await assessment(p,'Dobras fictícias para QA');
 assert.equal(saved.patient_id,'demo-0');assert.equal(saved.visibility,'patient');assert.equal(saved.data.day,'2026-09-17');
 assert.equal(saved.data.fat,24.1);assert.equal(saved.data.fatSource,'skinfolds');assert.equal(saved.data.fatInformed,28.5);assert.equal(saved.data.skinfoldProtocol,'p3');
 assert.equal(saved.data.source,'Adipômetro de demonstração');assert.equal(saved.data.method,'Condições descritas pelo profissional');
 assert.deepEqual(saved.data.skinfoldResult.sites,{triceps:10,suprailiac:20,thigh:30});
 assert.equal(saved.data.skinfoldResult.formulaVersion,1);assert.equal(saved.data.skinfoldResult.sex,'F');assert.equal(saved.data.skinfoldResult.age,30);assert.equal(saved.data.skinfoldResult.sum,60);
 assert(Math.abs(saved.data.skinfoldResult.density-1.0440221)<1e-9);assert(Math.abs(saved.data.skinfoldResult.fat-24.127894419093235)<1e-9);
 assert.equal(saved.data.skinfolds.chest,12);assert.equal(saved.data.skinfolds.abdominal,22);assert.equal(saved.data.skinfolds.subscapular,30);assert.equal(saved.data.skinfolds.thighProximal,40);
 await openSaved(p,saved.id);
 assert.equal(await input(p,'day').inputValue(),'2026-09-17');assert.equal(await protocol.inputValue(),'p3');assert.equal(await source.inputValue(),'skinfolds');assert.equal(await input(p,'fat').inputValue(),'24.1');
 assert.equal(await input(p,'skinfolds.triceps').inputValue(),'10');assert.equal(await input(p,'source').inputValue(),'Adipômetro de demonstração');
 await p.locator('#cancel-modal').click();
 pass('explicit application, live recalculation, manual restoration and save/reopen preserve the actual date, protocol and unrounded provenance');

 await p.locator('[data-x="body-open"][data-id="'+saved.id+'"]').click();
 assert.match(await p.locator('main').textContent(),/Estimativa.*Pollock/);
 const popupPromise=p.waitForEvent('popup');await p.locator('[data-x="assessment-print"][data-id="'+saved.id+'"]').click();const popup=await popupPromise;
 await popup.waitForLoadState('domcontentloaded');const printed=await popup.locator('body').textContent();
 assert.match(printed,/Imprimir \/ salvar PDF/);assert.match(printed,/Adipômetro de demonstração/);assert.match(printed,/Condições descritas pelo profissional/);assert.match(printed,/Estimativa.*Pollock/);assert.match(printed,/Siri/);assert.match(printed,/60(?:[,.]0)?\s*mm/);assert.match(printed,/30 anos/);assert.match(printed,/Compartilhado com o paciente/);
 await popup.close();pass('the actual PDF print window includes the estimate, sites, age, method and measurement source');

 await p.locator('.heading [data-x="assessment"]').click();await input(p,'title').fill('Percentual manual fora da faixa');
 await input(p,'sex').selectOption('F');await input(p,'age').fill('30');await input(p,'fat').fill('27');await protocol.selectOption('guedes');await fillSites(p,{subscapular:30,suprailiac:30,thighProximal:40});
 assert.equal(await use.isDisabled(),true);assert.equal(await source.inputValue(),'informed');assert.equal(await input(p,'fat').inputValue(),'27');
 await save(p);const manual=await assessment(p,'Percentual manual fora da faixa');assert.equal(manual.data.fat,27);assert.equal(manual.data.fatSource,'informed');assert.equal(manual.data.skinfoldResult,null);
 pass('out-of-range protocol inputs do not invent an estimate or prevent saving separately informed measurements');
 clean(h);await h.context.close();return saved;
}
async function patientProvenance(shared){
 const h=await isolated('patient'),p=h.page;
 await p.evaluate(record=>{
  const {S,render}=window.__skinfoldFixture;S.records=S.records.filter(x=>!['assessment','measurement'].includes(x.kind));
  S.records.push(record,{...structuredClone(record),id:'qa-private',visibility:'private',title:'PRIVATE_PROTOCOL_GUARD',data:{...structuredClone(record.data),day:'2026-10-12',source:'PRIVATE_SOURCE_GUARD',text:'PRIVATE_NOTE_GUARD'}},{...structuredClone(record),id:'qa-other-patient',patient_id:'demo-1',title:'OTHER_PATIENT_GUARD',data:{...structuredClone(record.data),text:'OTHER_NOTE_GUARD'}});
  render();
 },shared);
 const before=await p.evaluate(()=>JSON.stringify(window.__skinfoldFixture.S.records));
 await nav(p,'progress');
 for(const width of [375,1280])for(const light of [false,true]){
  await p.setViewportSize({width,height:900});await p.evaluate(value=>document.body.classList.toggle('theme-light',value),light);
  for(const tab of ['body','measures','history']){
   await p.locator('.body-tabs [data-body-tab="'+tab+'"]').click();
   const content=await p.locator('main').textContent();assert.doesNotMatch(content,/PRIVATE_(PROTOCOL|SOURCE|NOTE)_GUARD|OTHER_(PATIENT|NOTE)_GUARD/);
   assert.equal(await p.locator('[data-x="record-edit"]').count(),0);
   if(tab==='body')assert.match(content,/Estimativa.*Pollock/);
   if(tab==='measures'){assert.match(content,/Siri/);assert.match(content,/60(?:[,.]0)?\s*mm/);}
   await layout(p,'patient-'+tab+'-'+width+'-'+(light?'light':'dark'));
  }
 }
 assert.equal(await p.evaluate(()=>JSON.stringify(window.__skinfoldFixture.S.records)),before,'patient reading must display the saved snapshot without rewriting the estimate');
 await p.locator('.body-tabs [data-body-tab="body"]').click();
 const popupPromise=p.waitForEvent('popup');await p.locator('[data-x="assessment-print"]').click();const popup=await popupPromise;await popup.waitForLoadState('domcontentloaded');
 const printed=await popup.locator('body').textContent();assert.match(printed,/Estimativa.*Pollock/);assert.doesNotMatch(printed,/PRIVATE_(PROTOCOL|SOURCE|NOTE)_GUARD|OTHER_(PATIENT|NOTE)_GUARD/);await popup.close();
 pass('patient views and PDF identify the stored estimate while excluding private and other-patient assessments in both layouts and themes');
 clean(h);await h.context.close();
}

(async()=>{
 try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  await legacyAndEmpty();
  await restoredCalculationDraft();
  const shared=await protocolWorkflow();
  await patientProvenance(shared);
  console.log(checks+'/'+checks+' Nutri skinfold browser checks passed.');
 }finally{for(const context of contexts)await context.close().catch(()=>{});await browser?.close();}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
