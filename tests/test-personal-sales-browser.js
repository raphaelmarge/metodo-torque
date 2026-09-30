// Oferta/intenção: browser real, sem cobrança, rede externa ou conta real.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { chromium = require('playwright').chromium; }
catch (_) { try { chromium = require('./ci/node_modules/playwright').chromium; } catch (_) { chromium = require('/opt/node22/lib/node_modules/playwright').chromium; } }
const base = process.env.BASE_URL || 'http://127.0.0.1:8765';
const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const intent = require('../assets/personal-sales-intent.js');
const screenshots = process.env.SALES_SCREENSHOTS;
let browser;
let checks = 0;
function pass() { checks++; }
(async () => {
  assert.equal(intent.normalizeCode('<script>'), '');
  assert.equal(intent.normalizeCode(' TEST_40 '), 'TEST_40');
  assert.equal(intent.normalizeCode('A'.repeat(41)), '');
  assert(intent.fromSearch('?cupom=ONE&cupom=TWO').invalid);
  assert(intent.fromSearch('?ref=ONE&ref=TWO').invalid);
  assert.equal(intent.read({getItem(){throw Error('blocked');}}),null);
  assert.equal(intent.write({setItem(){throw Error('blocked');}},{code:'TEST_40'}),false);
  assert.equal(intent.read({getItem(){return '{bad';}}),null);
  assert.equal(intent.read({getItem(){return JSON.stringify({version:1,status:'approved',code:'TEST_40',discount:100});}}),null);
  pass();
  browser = await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
  for (const width of [320,390,768,1440]) {
    const context = await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});
    const outside = [], payments = [], errors = [];
    await context.route('**/*',route=>{
      const req=route.request();
      if(!req.url().startsWith(base+'/')) {outside.push(req.url());return route.abort();}
      if(req.method()!=='GET') payments.push({url:req.url(),method:req.method()});
      return route.continue();
    });
    const page=await context.newPage(); page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'/personal-assinatura.html?cupom=teste40&ref=parceiro_1&discount=100&paid=true');
    assert(await page.locator('#salesCheckout').isDisabled());
    assert.equal(await page.locator('.sales-price strong').innerText(),'R$ 49,90');
    assert.equal(await page.locator('#salesCoupon').inputValue(),'TESTE40');
    assert.match(await page.locator('#salesCouponStatus').innerText(),/não validado/);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.equal(await page.locator('[data-personal-trial]').getAttribute('href'),'personal.html?entrada=criar&cupom=TESTE40&ref=parceiro_1');
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('torque:sales:intent:v1')),null,'visita não grava rastreamento automaticamente');
    await page.locator('#salesCoupon').press('Enter');
    assert.match(await page.locator('#salesCouponStatus').innerText(),/guardado.*pendente/i);
    const stored=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('torque:sales:intent:v1')));
    assert.deepEqual(stored,{version:1,status:'unverified',code:'TESTE40',partnerRef:'parceiro_1'});
    await page.goto(base+'/personal-assinatura.html');
    assert.equal(await page.locator('#salesCoupon').inputValue(),'TESTE40');
    await page.evaluate(()=>document.getElementById('salesCheckout').disabled=false);
    await page.locator('#salesCheckout').click();
    assert.equal(await page.locator('.sales-price strong').innerText(),'R$ 49,90');
    assert.equal(await page.evaluate(()=>localStorage.getItem('mtapp:ptAssinatura')),null,'clique não libera assinatura');
    await page.locator('#salesCouponClear').click();
    assert.equal(await page.locator('#salesCoupon').inputValue(),'');
    assert.equal(await page.locator('[data-personal-trial]').getAttribute('href'),'personal.html?entrada=criar');
    await page.reload();
    assert.equal(await page.locator('#salesCoupon').inputValue(),'');
    assert(await page.locator('#salesCheckout').isDisabled());
    await page.evaluate(()=>window.scrollTo(0,0));
    if(screenshots){fs.mkdirSync(screenshots,{recursive:true});await page.screenshot({path:path.join(screenshots,`assinatura-${width}.png`),fullPage:true});}
    assert.deepEqual(payments,[]);assert.deepEqual(outside,[]);assert.deepEqual(errors,[]);
    pass();await context.close();
  }
  const context=await browser.newContext({viewport:{width:390,height:950},reducedMotion:'reduce'});
  await context.route('**/*',r=>r.request().url().startsWith(base+'/')?r.continue():r.abort());
  const page=await context.newPage();
  for(const url of ['?cupom=A&cupom=BCD','?cupom=%3Cimg%20src=x%20onerror=alert(1)%3E','?cupom='+('A'.repeat(41))]) {
    await page.goto(base+'/personal-assinatura.html'+url);
    assert.equal(await page.locator('#salesCoupon').inputValue(),'');
    assert.match(await page.locator('#salesCouponStatus').innerText(),/formato válido/);
    assert(await page.locator('#salesCheckout').isDisabled());
    assert.equal(await page.locator('.sales-card img').count(),0);
  }
  pass();
  await page.goto(base+'/personal-assinatura.html?ref=parceiro_1');
  assert.equal(await page.locator('#salesCoupon').inputValue(),'');
  assert.match(await page.locator('#salesReferralStatus').innerText(),/não aplica desconto/);
  pass();
  for(const entry of ['/personal-vendas.html','/app-personal-trainer.html','/torqueon.html']) {
    await page.goto(base+entry+'?cupom=teste40&ref=parceiro_1');
    assert(await page.locator('[data-sales-link]').count());
    const href=await page.locator('[data-sales-link]').first().getAttribute('href');
    assert.equal(href,'personal-assinatura.html?cupom=TESTE40&ref=parceiro_1');
    assert(await page.locator('[data-personal-trial]').evaluateAll(xs=>xs.length>0&&xs.every(a=>a.href.includes('entrada=criar'))));
    await page.locator('[data-sales-link]').first().click();
    assert.match(page.url(),/personal-assinatura\.html\?cupom=TESTE40/);
    assert.equal(await page.locator('#salesCoupon').inputValue(),'TESTE40');
  }
  pass();
  await page.goto(base+'/personal-vendas.html');
  await page.locator('#studentRange').fill('100');
  assert.match(await page.locator('#sliderCaption').innerText(),/R\$ 49,90\/mês/);
  pass();
  await context.close();
  const blocked=await browser.newContext();
  await blocked.addInitScript(()=>{Object.defineProperty(window,'sessionStorage',{get(){throw Error('storage blocked');}});});
  const blockedPage=await blocked.newPage();
  await blockedPage.goto(base+'/personal-assinatura.html');
  await blockedPage.locator('#salesCoupon').fill('TESTE40');
  await blockedPage.locator('#salesCoupon').press('Enter');
  assert.match(await blockedPage.locator('#salesCouponStatus').innerText(),/Não foi possível guardar/);
  assert(await blockedPage.locator('#salesCheckout').isDisabled());
  pass();await blocked.close();
  const nojs=await browser.newContext({javaScriptEnabled:false,viewport:{width:320,height:800}});
  const fallback=await nojs.newPage();
  await fallback.goto(base+'/personal-assinatura.html');
  assert(await fallback.locator('#salesCheckout').isDisabled());
  assert(await fallback.locator('[data-personal-trial]').isVisible());
  assert(await fallback.locator('#salesCouponForm').isHidden());
  assert.equal(await fallback.locator('.sales-price strong').innerText(),'R$ 49,90');
  pass();await nojs.close();
  console.log(`PASS personal sales browser: ${checks} groups; 4 viewports; no financial operation.`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
