'use strict';
// Real dedicated demos; no session, external network, database or messaging.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let chromium;
if(process.env.TORQUE_PLAYWRIGHT)({chromium}=require(process.env.TORQUE_PLAYWRIGHT));
else{try{({chromium}=require('playwright'));}catch{({chromium}=require('/opt/node22/lib/node_modules/playwright'));}}
const BASE=(process.env.BASE_URL||'http://127.0.0.1:8765').replace(/\/$/,''),ORIGIN=new URL(BASE).origin;
const OUT=process.env.TORQUE_TEST_OUTPUT_DIR||(process.env.RUNNER_TEMP&&path.join(process.env.RUNNER_TEMP,'torque-testes'));
let browser,checks=0;
const pass=message=>{checks++;console.log('PASS '+message);};
async function isolated(role){
 const context=await browser.newContext({serviceWorkers:'block',timezoneId:'America/Sao_Paulo',viewport:{width:1280,height:900}}),errors=[],writes=[],missing=[];
 await context.addInitScript(()=>{const NativeDate=Date,t=NativeDate.parse('2026-10-09T12:00:00Z');window.Date=class extends NativeDate{constructor(...a){super(...(a.length?a:[t]));}static now(){return t;}};});
 await context.route('**/*',route=>{const r=route.request(),u=new URL(r.url());if(!['GET','HEAD'].includes(r.method())||/\.supabase\.co$/.test(u.hostname)||/\/(rest|auth|functions|storage)\/v\d\//.test(u.pathname)){writes.push(u.origin+u.pathname);return route.abort();}if(u.origin!==ORIGIN)return route.abort();if(u.pathname.endsWith('/nutri/config.js'))return route.fulfill({status:200,contentType:'application/javascript',body:'window.TORQUE_NUTRI_CONFIG={};'});return route.continue();});
 assert.equal(typeof context.routeWebSocket,'function');await context.routeWebSocket('**/*',socket=>{writes.push('websocket');socket.close();});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()===404&&new URL(r.url()).origin===ORIGIN)missing.push(r.url());});
 await page.goto(BASE+'/nutri/demo-'+(role==='patient'?'paciente':'nutricionista')+'.html',{waitUntil:'domcontentloaded'});
 await page.locator('.demo-notice').waitFor();
 return {page,context,errors,writes,missing};
}
async function checkLayout(page,label){
 await page.evaluate(()=>document.fonts.ready);
 const geometry=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)}));
 if(OUT){fs.mkdirSync(OUT,{recursive:true});await page.screenshot({path:path.join(OUT,'nutri-alignment-'+label+'.png'),fullPage:true});}
 assert(geometry.scroll<=geometry.width+1,label+': horizontal overflow '+JSON.stringify(geometry));
}
async function nav(page,dest){await page.locator('.nav-btn[data-page="'+dest+'"]').click();}
async function save(page){await page.locator('#modal-form button[type="submit"]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);}
function clean(h){assert.deepEqual(h.errors,[]);assert.deepEqual(h.writes,[]);assert.deepEqual(h.missing,[]);}
async function patient(){
 const h=await isolated('patient'),p=h.page;
 assert.equal(await p.locator('[data-action="water"]').count(),1);
 assert.equal(await p.locator('.home-evolution,.journey-strip,.water-panel').count(),0);
 await p.locator('#patient-notifications-button').click();
 assert(await p.locator('.notification-item').count()>0);
 await p.locator('#notifications-read-all').click();
 assert.equal(await p.locator('.notification-item.unread').count(),0);
 await p.locator('#close-modal').click();
 assert.equal(await p.locator('.notification-badge').count(),0);
 await p.locator('#patient-notifications-button').click();
 await p.locator('.notification-item').filter({hasText:'Mensagem da sua nutri'}).first().click();
 await p.locator('#message-body').waitFor();
 assert.equal(await p.locator('.sidebar [aria-current="page"]').getAttribute('data-page'),'more');
 pass('home has one hydration control and bell notices mark read and open the right destination');
 await nav(p,'booking');
 assert.equal(await p.locator('[data-calendar-day]').count(),42);
 assert.match(await p.locator('.schedule-hero').textContent(),/Próxima consulta/);
 await p.locator('[data-calendar-day="2026-10-15"]').click();
 await p.locator('[data-calendar-view="week"]').click();
 assert.equal(await p.locator('[data-calendar-day]').count(),7);
 assert.equal(await p.locator('[data-calendar-day="2026-10-15"]').getAttribute('aria-pressed'),'true');
 await p.locator('[data-calendar-new]').first().click();assert.equal(await p.locator('#x-time').inputValue(),'2026-10-15T09:00');
 await p.locator('#x-note').fill('Pedido fictício de retorno');await save(p);
 assert.match(await p.locator('.schedule-day-detail').textContent(),/Aguardando confirmação/);
 assert.equal(await p.locator('.schedule-day-detail [data-x="request-confirm"]').count(),0);
 pass('patient switches calendar zoom without losing selected day and requests that date');
 await p.locator('[data-calendar-today]').click();
 await p.locator('.schedule-hero [data-calendar-reschedule]').click();
 assert.match(await p.locator('#message-body').inputValue(),/Preciso remarcar/);
 assert.doesNotMatch(await p.locator('.chatbox').textContent(),/Preciso remarcar/);
 pass('rescheduling prepares a message without sending it');
 await nav(p,'more');assert.equal(await p.locator('.patient-menu-grid [data-page="chat"]').count(),1);
 await nav(p,'progress');await p.locator('.progress-hero').waitFor();await p.locator('#body-period').selectOption('30');
 assert.equal(await p.locator('#body-period').inputValue(),'30');await p.locator('#body-metric').selectOption('waist');
 assert.match(await p.locator('.chart-card').textContent(),/Cintura/);
 await p.locator('.body-tabs [data-body-tab="body"]').click();await p.locator('.body-map').waitFor();
 await p.locator('.body-tabs [data-body-tab="photos"]').click();
 assert.equal(await p.locator('#body-photo-slider').count(),0);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=','base64');
 for(const day of ['2026-09-01','2026-10-09']){
  await p.locator('[data-x="progress-photo"]').first().click();await p.locator('#photo-title').fill('Fixture '+day);await p.locator('#photo-day').fill(day);
  await p.locator('#photo-file').setInputFiles({name:'fixture.png',mimeType:'image/png',buffer:png});await save(p);
 }
 const slider=p.locator('#body-photo-slider');await slider.waitFor();await slider.focus();await p.keyboard.press('ArrowRight');assert.equal(await slider.inputValue(),'51');
 const box=await p.locator('#body-photo-stage').boundingBox();await p.mouse.move(box.x+box.width*.25,box.y+box.height*.5);await p.mouse.down();await p.mouse.move(box.x+box.width*.75,box.y+box.height*.5);await p.mouse.up();assert(Math.abs(Number(await slider.inputValue())-75)<2);
 await p.locator('[data-photo-mode="side"]').click();assert.equal(await p.locator('.photo-side-by-side figure').count(),2);
 await p.locator('[data-body-angle="back"]').click();assert.equal(await p.locator('#body-photo-slider').count(),0);assert.match(await p.locator('.photo-empty').textContent(),/primeira foto de costas/);
 await p.locator('[data-body-angle="front"]').click();await p.locator('[data-photo-mode="compare"]').click();
 pass('evolution keeps detailed measurements and compares uploaded photos by angle, pointer and keyboard');
 for(const width of [320,375,800])for(const theme of ['dark','light']){
  await p.setViewportSize({width,height:900});await p.evaluate(t=>document.body.classList.toggle('theme-light',t==='light'),theme);
  await nav(p,'today');
  const buttons=await p.locator('.sidebar .nav-btn').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {width:r.width,height:r.height,top:r.top};}));
  assert.equal(buttons.length,5);assert(buttons.every(r=>r.width>=44&&r.height>=44));
  assert(Math.max(...buttons.map(r=>r.top))-Math.min(...buttons.map(r=>r.top))<2);
  await checkLayout(p,'patient-home-'+width+'-'+theme);
  await p.locator('#patient-notifications-button').click();await checkLayout(p,'patient-notifications-'+width+'-'+theme);await p.locator('#close-modal').click();
  await nav(p,'booking');await p.locator('[data-calendar-view="month"]').click();await checkLayout(p,'patient-calendar-'+width+'-'+theme);
  const sizes=await p.locator('[data-calendar-day]').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return [r.width,r.height];}));assert(sizes.every(([w,h])=>w>=44&&h>=44));
  await nav(p,'progress');await p.locator('.body-tabs [data-body-tab="summary"]').click();await checkLayout(p,'patient-progress-'+width+'-'+theme);
  await p.locator('.body-tabs [data-body-tab="photos"]').click();await checkLayout(p,'patient-photos-'+width+'-'+theme);
 }
 pass('patient calendar, progress and photos fit 320/375/800px in both themes with 44px days');
 clean(h);await h.context.close();
}
async function professional(){
 const h=await isolated('nutri'),p=h.page;await nav(p,'appointments');
 assert.equal(await p.locator('[data-calendar-day]').count(),7);
 await checkLayout(p,'professional-week-1280');
 await p.locator('[data-calendar-view="month"]').click();await p.locator('[data-calendar-day="2026-10-15"]').click();
 const patientId=await p.locator('#schedule-patient option').nth(2).getAttribute('value');await p.locator('#schedule-patient').selectOption(patientId);
 await p.locator('[data-calendar-new]').first().click();assert.equal(await p.locator('#appointment-time').inputValue(),'2026-10-15T09:00');assert.equal(await p.locator('#appointment-patient').inputValue(),patientId);
 await p.locator('#appointment-note').fill('Consulta fictícia de revisão');await save(p);
 assert.match(await p.locator('.schedule-day-detail').textContent(),/Consulta fictícia de revisão/);
 await p.locator('.schedule-day-detail [data-x="appointment-edit"]').click();await p.locator('#x-time').fill('2026-10-15T10:00');await save(p);
 assert.match(await p.locator('.schedule-day-detail').textContent(),/10:00/);
 pass('professional filters patients, schedules the selected date and edits the appointment');
 for(const width of [375,1280]){await p.setViewportSize({width,height:900});await checkLayout(p,'professional-calendar-'+width);}
 clean(h);await h.context.close();
}
(async()=>{try{browser=await chromium.launch({headless:true});await patient();await professional();console.log(checks+'/'+checks+' Nutri Personal browser checks passed.');}finally{await browser?.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
