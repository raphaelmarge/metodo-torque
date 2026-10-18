'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let chromium;if(process.env.TORQUE_PLAYWRIGHT)({chromium}=require(process.env.TORQUE_PLAYWRIGHT));else{try{({chromium}=require('playwright'));}catch{({chromium}=require('/opt/node22/lib/node_modules/playwright'));}}
const BASE=process.env.BASE_URL||'http://127.0.0.1:8765';
(async()=>{
 const browser=await chromium.launch({headless:true});let checks=0;
 try{
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}}),errors=[],external=[];
 await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==new URL(BASE).origin||route.request().method()!=='GET'){external.push(url.href);return route.abort();}if(url.pathname.endsWith('/nutri/config.js'))return route.fulfill({contentType:'application/javascript',body:'window.TORQUE_NUTRI_CONFIG={};'});if(url.pathname.endsWith('/nutri/app.js'))return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(__dirname,'../nutri/app.js'),'utf8')+'\nwindow.__fixture={S,render,published};'});return route.continue();});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const pass=name=>{checks++;console.log('PASS '+name);};
 async function fixture(){await page.locator('.demo-notice').waitFor();await page.evaluate(()=>{const f=window.__fixture;const p=f.published();p.version=2;p.data={titulo:'Plano semanal',refeicoes:[{id:'lunch',titulo:'Almoço',hora:'12:00',dias:[1,3,5],itens:[{id:'rice',nome:'Arroz',porcao:'100 g',qtd:1,k:130,pt:3,cb:28,g:0,substituicoes:[{id:'potato',nome:'Batata',porcao:'80 g',qtd:2,k:60,pt:1,cb:14,g:0}]}]}]};f.S.page='food';f.render();});}
 await page.goto(BASE+'/nutri/demo-paciente.html');await fixture();
 await page.locator('#shopping-start').fill('2026-10-12');await page.locator('#shopping-end').fill('2026-10-18');
 await page.locator('#shopping-choices summary').click();await page.locator('[data-shopping-choice="0:0"]').selectOption('0');
 await page.locator('#shopping-edit-day').selectOption('2026-10-12');await page.locator('[data-shopping-choice="0:0"]').selectOption('-1');
 await page.locator('#shopping-edit-day').selectOption('2026-10-16');await page.locator('[data-shopping-choice="0:0"]').selectOption('-1');
 await page.locator('#shopping-form button[type=submit]').click();
 assert.match(await page.locator('#shopping-result').innerText(),/Arroz\s+2 × 100 g/);assert.match(await page.locator('#shopping-result').innerText(),/Batata\s+2 × 80 g/);assert.match(await page.locator('#shopping-feedback').innerText(),/salvas/);
 pass('patient can choose different alternatives on each prescribed day');
 await page.reload();await fixture();
 assert.equal(await page.locator('#shopping-start').inputValue(),'2026-10-12');assert.match(await page.locator('#shopping-result').innerText(),/Batata\s+2 × 80 g/);assert.match(await page.locator('#shopping-feedback').innerText(),/recuperado/);
 pass('reload restores dates and daily choices without writing clinical data');
 await page.evaluate(()=>{const f=window.__fixture;f.S.selected=f.S.patients[1].id;f.render();});assert.equal(await page.locator('[data-shopping-choice]').count(),0);
 await page.evaluate(()=>{const f=window.__fixture;f.S.selected=f.S.patients[0].id;f.render();});assert.match(await page.locator('#shopping-result').innerText(),/Batata\s+2 × 80 g/);
 pass('switching patients isolates and restores their own planning');
 await page.evaluate(()=>{const f=window.__fixture;f.published().version++;f.render();});assert.equal(await page.locator('[data-shopping-choice]').inputValue(),'-1');
 pass('new publication starts clean instead of silently reusing old positions');
 await page.locator('#shopping-start').fill('2026-10-12');await page.locator('#shopping-end').fill('2026-10-18');
 await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('Quota','QuotaExceededError');};});
 await page.locator('#shopping-form button[type=submit]').click();assert.match(await page.locator('#shopping-feedback').innerText(),/Não foi possível salvar/);assert.equal(await page.locator('#shopping-result').isVisible(),true);
 pass('storage failure keeps usable result and explicitly reports unsaved choices');
 for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);pass('responsive interface has no JS errors or external writes');
 console.log(`${checks} weekly shopping browser checks passed`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
