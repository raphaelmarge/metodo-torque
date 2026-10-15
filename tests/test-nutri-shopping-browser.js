'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let chromium;
if(process.env.TORQUE_PLAYWRIGHT)({chromium}=require(process.env.TORQUE_PLAYWRIGHT));
else{try{({chromium}=require('playwright'));}catch{({chromium}=require('/opt/node22/lib/node_modules/playwright'));}}
const BASE=process.env.BASE_URL||'http://127.0.0.1:8765';
(async()=>{
 const browser=await chromium.launch({headless:true});let checks=0;
 try{
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:900}}),errors=[],external=[];
 await context.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.origin!==new URL(BASE).origin||route.request().method()!=='GET'){external.push(url.href);return route.abort();}
  if(url.pathname.endsWith('/nutri/config.js'))return route.fulfill({contentType:'application/javascript',body:'window.TORQUE_NUTRI_CONFIG={};'});
  if(url.pathname.endsWith('/nutri/app.js'))return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(__dirname,'../nutri/app.js'),'utf8')+'\nwindow.__fixture={S,render,openEditor,published,printPlan};'});
  return route.continue();
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const pass=name=>{checks++;console.log('PASS '+name);};
 await page.goto(BASE+'/nutri/demo-nutricionista.html');await page.locator('.demo-notice').waitFor();
 await page.evaluate(()=>{const f=window.__fixture;const food={id:'main',nome:'Arroz cozido',alimId:'manual',porcao:'100 g',qtd:1,k:130,pt:3,cb:28,g:0,custom:'preservar',substituicoes:[{id:'alt',nome:'Batata cozida',porcao:'1 unidade',qtd:1,k:80,pt:2,cb:18,g:0,custom:'alternativa manual'}]};f.published().data.refeicoes=[{id:'lunch',titulo:'Almoço',hora:'12:00',dias:[1,3,5],itens:[food]}];return f.openEditor(f.S.selected);});
 await page.locator('[data-edit-alternative="0:0:0"]').click();
 await page.locator('#alt-quantity').fill('2.5');await page.locator('#alt-portion').fill('80 g');await page.locator('#alt-k').fill('64');await page.locator('#alt-reviewed').check();await page.locator('#modal-form button[type=submit]').click();
 assert.match(await page.locator('.prescription-substitutions').innerText(),/2,5 × 80 g/);
 assert.equal(await page.evaluate(()=>window.__fixture.S.edit.refeicoes[0].itens[0].substituicoes[0].custom),'alternativa manual');
 assert.equal(await page.evaluate(()=>window.__fixture.published().data.refeicoes[0].itens[0].substituicoes[0].qtd),1);
 pass('alternative edits preserve manual metadata and published version until explicit publication');
 await page.locator('[data-action="save-draft"]').click();
 await page.evaluate(()=>window.__fixture.openEditor(window.__fixture.S.selected));
 assert.match(await page.locator('.prescription-substitutions').innerText(),/2,5 × 80 g/);
 pass('saved draft reopens with the exact alternative portions');
 const out=process.env.TORQUE_TEST_OUTPUT_DIR;if(out){fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'nutri-substituicoes-desktop.png'),fullPage:true});}
 await page.locator('[data-action="publish-plan"]').click();
 assert.match(await page.locator('#modal-body').innerText(),/2,5 × 80 g/);
 await page.locator('#confirm-plan-review').check();await page.locator('#modal-form button[type=submit]').click();
 await page.waitForFunction(()=>window.__fixture.published().version===2);
 pass('review and demo publication preserve prescribed alternatives and history');
 const popupPromise=page.waitForEvent('popup');await page.evaluate(()=>window.__fixture.printPlan(window.__fixture.published().data));const popup=await popupPromise;await popup.waitForLoadState();assert.match(await popup.locator('body').innerText(),/Batata cozida — 2,5 × 80 g/);await popup.close();
 pass('print/PDF includes the same alternative quantity and portion');
 await page.evaluate(()=>{window.__fixture.S.role='patient';window.__fixture.S.page='food';window.__fixture.render();});
 await page.locator('.plan-alternatives summary').click();
 assert.match(await page.locator('.plan-alternatives').innerText(),/2,5 × 80 g/);
 await page.locator('#shopping-start').fill('2026-10-12');await page.locator('#shopping-end').fill('2026-10-18');await page.locator('#shopping-form details summary').click();await page.locator('[data-shopping-choice="0:0"]').selectOption('0');await page.locator('#shopping-form button').click();
 assert.match(await page.locator('#shopping-result').innerText(),/7,5 × 80 g/);assert(!/Arroz/.test(await page.locator('#shopping-result').innerText()));await page.locator('#shopping-result details summary').click();assert.match(await page.locator('#shopping-result').innerText(),/3 vezes/);
 pass('patient shopping uses only chosen alternative on Monday, Wednesday and Friday');
 await page.locator('#shopping-end').fill('2026-10-11');await page.locator('#shopping-form button').click();assert.match(await page.locator('#shopping-feedback').innerText(),/1 a 31 dias/);assert.equal(await page.locator('#shopping-result').isVisible(),false);
 await page.locator('#shopping-end').fill('2026-10-18');await page.locator('#shopping-form button').click();
 pass('invalid dates hide stale results and announce validation');
 for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
 await page.setViewportSize({width:390,height:844});if(out)await page.screenshot({path:path.join(out,'nutri-compras-mobile.png'),fullPage:true});
 await page.evaluate(()=>document.body.classList.add('theme-light'));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(out)await page.screenshot({path:path.join(out,'nutri-compras-claro.png'),fullPage:true});
 pass('shopping controls fit mobile/tablet/desktop and light theme');
 await page.evaluate(()=>{const f=window.__fixture;f.S.selected=f.S.patients[1].id;f.render();});assert.equal(await page.locator('[data-shopping-choice]').count(),0);assert(!/Batata cozida/.test(await page.locator('#shopping-result').innerText()));
 pass('switching patient resets choices and excludes previous patient data');
 await page.evaluate(()=>{const f=window.__fixture;f.S.role='nutri';f.S.selected=f.S.patients[0].id;return f.openEditor(f.S.selected);});
 await page.locator('[data-remove-alternative="0:0:0"]').click();assert.equal(await page.locator('[data-edit-alternative]').count(),0);assert.equal(await page.evaluate(()=>window.__fixture.published().data.refeicoes[0].itens[0].substituicoes.length),1);assert.equal(await page.locator('[data-alternative="0:0"]').evaluate(e=>e===document.activeElement),true);
 pass('removal affects only draft and restores keyboard focus');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);pass('no browser errors or external writes');
 console.log(`${checks} shopping browser checks passed`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
