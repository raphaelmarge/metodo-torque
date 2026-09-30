/* HQ real com RPCs e store substituídos somente por rotas do Playwright.
 * Não usa contas, assinaturas, parceiros ou pagamentos de produção. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { chromium = require('playwright').chromium; }
catch (_) { try { chromium = require('./ci/node_modules/playwright').chromium; } catch (_) { chromium = require('/opt/node22/lib/node_modules/playwright').chromium; } }
const base = process.env.BASE_URL || 'http://127.0.0.1:8765';
const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const screenshots = process.env.HQ_SCREENSHOTS;
const ids = Array.from({length:20}, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12,'0')}`);
const clone = value => JSON.parse(JSON.stringify(value));
function fixture(empty = false) {
  const data = {campaign:{approved:true,enabled:false,basePriceCents:4990,discountBps:4000,commissionBps:4000,reserveBps:1000,torqueBps:1000,trialDays:14},partners:[],coupons:[],referrals:[],commissions:[],payments:[],audit:[]};
  if (empty) return data;
  data.partners = [{id:ids[0],name:'Parceira demonstração A',contact:'Contato fictício A',status:'active',revision:1},{id:ids[1],name:'Parceiro demonstração B',contact:'Contato fictício B',status:'active',revision:2},{id:ids[2],name:'Parceira demonstração C',contact:'Contato fictício C',status:'paused',revision:1}];
  data.coupons = [{id:ids[3],code:'DEMO_A',partnerId:ids[0],status:'ready',revision:1}];
  data.referrals = [{id:ids[4],partnerId:ids[0],customerLabel:'Conta fictícia 01',status:'paid',createdAt:'2026-09-01T10:30:00Z',firstPaymentAt:'2026-09-15T10:30:00Z'}];
  function commission(index, partnerId, status, payable, paid, recoverable, risk) {
    return {id:ids[index],partnerId,referralId:ids[4],status,amountCents:1996,payableCents:payable,paidCents:paid,recoverableCents:recoverable,atRiskCents:risk,revision:index,eligibleAt:'2026-09-15T10:30:00Z'};
  }
  data.commissions = [commission(5,ids[0],'eligible',1996,0,0,0),commission(6,ids[0],'pending',0,0,0,0),commission(7,ids[1],'paid',0,1996,0,0),commission(8,ids[1],'suspended',0,1996,0,1996),commission(9,ids[2],'reversed',0,1996,1996,0)];
  data.payments = [{id:ids[10],partnerId:ids[1],amountCents:1996,reference:'COMPROVANTE FICTÍCIO 01',createdAt:'2026-09-20T12:30:00Z',operationId:ids[11],commissionIds:[ids[7]]}];
  data.audit = [{id:ids[12],action:'partner.created',at:'2026-09-01T10:30:00Z',actorLabel:'Administrador fictício',entityId:ids[0],details:{source:'teste local'}}];
  return data;
}
let browser, groups = 0;
async function setup(opts = {}) {
  const data = clone(opts.data || fixture()), calls = [], outside = [], errors = [];
  const context = await browser.newContext({viewport:{width:opts.width || 1440,height:1050},serviceWorkers:'block',reducedMotion:'reduce'});
  let release, markPending, paymentFailures = opts.paymentFailures || 0;
  const pendingReady = new Promise(resolve => { markPending = resolve; });
  await context.route('**/*',async route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(base).origin) { outside.push(url.href); return route.abort(); }
    if (url.pathname === '/assets/cloud-config.js') return route.fulfill({contentType:'application/javascript',body:'window.MT_CLOUD={url:"https://fixture.invalid",anonKey:"fixture-only"};'});
    if (url.pathname === '/assets/vendor/supabase.js') return route.fulfill({contentType:'application/javascript',body:`
      window.__hqFixtureAuth=[];
      window.__hqFixtureUser='fixture-admin';window.__hqFixtureRpcInsideAuth=0;window.__hqFixtureInAuth=false;
      window.__hqFixtureEmit=function(event,user){if(user)window.__hqFixtureUser=user;window.__hqFixtureInAuth=true;try{window.__hqFixtureAuth.slice().forEach(fn=>fn(event,{user:{id:window.__hqFixtureUser}}));}finally{window.__hqFixtureInAuth=false;}};
      window.MT_supabase={auth:{getUser:async()=>({data:{user:{id:window.__hqFixtureUser}}}),getSession:async()=>({data:{session:{user:{id:window.__hqFixtureUser,email:'admin@example.invalid'}}}}),onAuthStateChange:function(fn){window.__hqFixtureAuth.push(fn);queueMicrotask(()=>fn('INITIAL_SESSION',{user:{id:window.__hqFixtureUser}}));return {data:{subscription:{unsubscribe:function(){window.__hqFixtureAuth=window.__hqFixtureAuth.filter(x=>x!==fn);}}}};}},rpc:async function(name,args){if(window.__hqFixtureInAuth)window.__hqFixtureRpcInsideAuth++;return fetch('/__hq_fixture_rpc/'+name,{method:'POST',headers:{'Content-Type':'application/json','X-Fixture-User':window.__hqFixtureUser},body:JSON.stringify(args||{})}).then(r=>r.json());}};
    `});
    if (url.pathname === '/apps/store.js') return route.fulfill({contentType:'application/javascript',body:'window.MTStore={read:(key,fallback)=>fallback,write:()=>{},onChange:()=>{},todayISO:()=>"2026-09-30",uid:()=>"fixture-only",baixaCSV:()=>{}};'});
    if (!url.pathname.startsWith('/__hq_fixture_rpc/')) return route.continue();
    const name = url.pathname.split('/').pop(), args = route.request().postDataJSON(); calls.push({name,args});
    if(name==='hq_ops_snapshot'||name==='hq_influencer_admin_snapshot')return route.fulfill({contentType:'application/json',body:JSON.stringify({error:{code:'PGRST202',message:'local contract not installed'}})});
    let result;
    if (name === 'hq_sou_admin') result = opts.authError ? {error:{code:'HQ403',message:'fixture denied'}} : {data:opts.admin !== false && route.request().headers()['x-fixture-user'] === 'fixture-admin'};
    else if (name === 'hq_referrals_snapshot') {
      if (opts.delaySnapshot) await new Promise(resolve => { release = resolve; markPending(); });
      result = opts.snapshotError ? {error:opts.snapshotError} : {data};
    } else if (name === 'hq_referrals_save_partner') {
      const input = args.p_input, old = data.partners.find(x=>x.id===input.id);
      if (old) Object.assign(old,input,{revision:old.revision+1});
      else data.partners.push({...input,id:ids[13],revision:1});
      result={data:old || data.partners[data.partners.length-1]};
    } else if (name === 'hq_referrals_save_coupon') {
      const input=args.p_input,old=data.coupons.find(x=>x.id===input.id);
      if(old)Object.assign(old,input,{revision:old.revision+1});else data.coupons.push({...input,id:ids[14],revision:1});
      result={data:old || data.coupons[data.coupons.length-1]};
    } else if (name === 'hq_referrals_review') {
      const input=args.p_input,c=data.commissions.find(x=>x.id===input.commissionId);
      Object.assign(c,{status:input.decision,revision:c.revision+1,payableCents:0});result={data:c};
    } else if (name === 'hq_referrals_record_payment') {
      if (opts.delayPayment) await new Promise(resolve=>{release=resolve;markPending();});
      if (paymentFailures-- > 0) result={error:{code:'fixture_network',message:'offline'}};
      else {
        const input=args.p_input;
        data.commissions.filter(c=>input.commissionIds.includes(c.id)).forEach(c=>{c.status='paid';c.paidCents+=c.payableCents;c.payableCents=0;c.revision++;});
        const payment={...input,id:ids[15],createdAt:'2026-09-30T12:30:00Z'};data.payments.push(payment);result={data:payment};
      }
    } else if (name === 'hq_kpis') result={data:{}};
    else if (name === 'hq_uso_recursos') result={data:{recursos:[]}};
    else result={data:[]};
    try { return await route.fulfill({contentType:'application/json',body:JSON.stringify(result)}); } catch (_) {}
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/apps/hq.html'+(opts.modern?'':'?legacy=1'));
  if(opts.modern){await page.locator('.hq-nav [data-nav="referrals"]').click();await page.waitForFunction(()=>document.getElementById('hqrReload')&&!document.getElementById('hqrReload').disabled);return {context,page,data,calls,outside,errors};}
  await page.waitForFunction(()=>document.getElementById('hqLock').hidden || !document.getElementById('hqLockMsg').textContent.includes('Verificando'));
  if(opts.admin!==false&&!opts.authError&&!opts.delaySnapshot)await page.waitForFunction(()=>document.getElementById('hqrReload')&&!document.getElementById('hqrReload').disabled);
  return {context,page,data,calls,outside,errors,pendingReady,release:()=>release&&release()};
}
async function capture(page,name,selector='#hqReferrals') {
  if(!screenshots)return;
  fs.mkdirSync(screenshots,{recursive:true});
  await page.locator(selector).evaluate(el=>{const label=document.createElement('div');label.textContent='DEMONSTRAÇÃO LOCAL — DADOS FICTÍCIOS';label.style.cssText='padding:12px;margin-bottom:16px;background:#fbbf24;color:#17120b;border-radius:8px;font:bold 14px Arial;';label.dataset.fixtureLabel='true';el.prepend(label);});
  await page.locator(selector).screenshot({path:path.join(screenshots,name)});
  await page.locator('[data-fixture-label]').evaluateAll(xs=>xs.forEach(x=>x.remove()));
  console.log('SCREENSHOT '+path.join(screenshots,name));
}
async function paymentReview(x) {
  await x.page.locator('[data-hqr-action="payment"]').first().click();
  await x.page.locator('#hqrReference').fill('COMPROVANTE FICTÍCIO 2026');
  await x.page.locator('#hqrSubmit').click();
  assert(await x.page.locator('#hqrPaymentConfirmed').isVisible());
}
(async()=>{
  browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
  // Captura pronta cedo: somente fixtures, antes das demais verificações.
  const desktop=await setup();
  assert.match(await desktop.page.locator('#hqrBody').innerText(),/Campanha inativa/);
  assert.match(await desktop.page.locator('.hqr-policy').innerText(),/29,94/);
  assert.match(await desktop.page.locator('.hqr-policy').innerText(),/19,96/);
  assert.match(await desktop.page.locator('.hqr-policy').innerText(),/4,99/);
  await capture(desktop.page,'hq-referrals-desktop.png');
  assert(await desktop.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await paymentReview(desktop);
  await capture(desktop.page,'hq-referrals-confirmacao.png','#hqrDialog');
  assert(await desktop.page.locator('#hqrSubmit').isDisabled());
  assert.equal(desktop.calls.filter(c=>c.name==='hq_referrals_record_payment').length,0);
  await desktop.page.locator('#hqrSubmit').evaluate(el=>{el.disabled=false;});
  await desktop.page.locator('#hqrSubmit').click();
  assert.equal(desktop.calls.filter(c=>c.name==='hq_referrals_record_payment').length,0,'remover disabled sem confirmar não registra pagamento');
  await desktop.page.locator('[data-hqr-close]').click();
  assert.equal(desktop.calls.filter(c=>c.name==='hq_referrals_record_payment').length,0);
  await desktop.page.evaluate(()=>{document.documentElement.dataset.tema='claro';});
  assert(await desktop.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const light=await desktop.page.locator('#hqReferrals').evaluate(el=>({text:getComputedStyle(el).color,background:getComputedStyle(el).backgroundColor}));
  assert.notEqual(light.text,light.background);
  await capture(desktop.page,'hq-referrals-claro.png');
  assert.deepEqual(desktop.outside,[]);assert.deepEqual(desktop.errors,[]);groups++;await desktop.context.close();
  for(const opts of [{admin:false},{authError:true}]) {
    const x=await setup(opts);
    assert(await x.page.locator('#hqReferrals').isHidden());
    assert.equal(x.calls.filter(c=>c.name.startsWith('hq_referrals_')).length,0);
    await x.context.close();groups++;
  }
  for(const snapshotError of [{code:'PGRST202',message:'missing'},{code:'fixture_network',message:'offline'},{code:'HQ403',message:'forbidden'}]) {
    const x=await setup({snapshotError});
    assert.match(await x.page.locator('#hqrBody').innerText(),/Dados indisponíveis/);
    assert.equal(await x.page.locator('.hqr-total').count(),0);
    assert.equal(await x.page.locator('[data-hqr-action]').count(),0);
    await x.context.close();groups++;
  }
  const incomplete=fixture();delete incomplete.commissions;
  const malformed=await setup({data:incomplete});
  assert.match(await malformed.page.locator('#hqrBody').innerText(),/Dados indisponíveis/);
  assert.equal(await malformed.page.locator('.hqr-total').count(),0);
  groups++;await malformed.context.close();
  const reasons=fixture();reasons.referrals=[{id:ids[4],partnerId:ids[0],customerLabel:'Conta fictícia para revisão',status:'needs_review',reason:'payment_before_trial_end',createdAt:'2026-09-01T10:30:00Z',firstPaymentAt:null},{id:ids[16],partnerId:ids[1],customerLabel:'Conta fictícia aguardando histórico',status:'deferred',reason:'first_payment_history_required',createdAt:'2026-09-02T10:30:00Z',firstPaymentAt:null}];
  const reasonCase=await setup({data:reasons});await reasonCase.page.locator('[data-hqr-tab="referrals"]').click();
  assert.match(await reasonCase.page.locator('#hqrPanel').innerText(),/Requer revisão/);
  assert.match(await reasonCase.page.locator('#hqrPanel').innerText(),/Aguardando confirmação/);
  assert.match(await reasonCase.page.locator('#hqrPanel').innerText(),/Pagamento anterior ao fim do teste grátis/);
  groups++;await reasonCase.context.close();
  const empty=await setup({data:fixture(true)});
  assert.match(await empty.page.locator('#hqrPanel').innerText(),/Nenhum influenciador/);
  assert.equal(await empty.page.locator('.hqr-total').count(),5);
  assert(!/Dados indisponíveis/.test(await empty.page.locator('#hqrBody').innerText()));
  await empty.page.locator('[data-hqr-action="partner-new"]').click();
  await empty.page.locator('#hqrName').fill('<img src=x onerror=alert(1)>');
  await empty.page.locator('#hqrContact').fill('fixture@example.invalid');
  await empty.page.locator('#hqrSubmit').click();
  await empty.page.waitForFunction(()=>!document.getElementById('hqrDialog').open);
  assert.equal(await empty.page.locator('#hqReferrals img').count(),0);
  assert.match(await empty.page.locator('#hqrPanel').innerText(),/<img src=x onerror=alert\(1\)>/);
  await empty.page.locator('[data-hqr-action="partner-edit"]').click();
  await empty.page.locator('#hqrName').fill('Parceiro fictício editado');
  await empty.page.locator('#hqrSubmit').click();
  await empty.page.waitForFunction(()=>!document.getElementById('hqrDialog').open);
  assert.equal(empty.calls.filter(c=>c.name==='hq_referrals_save_partner')[1].args.p_input.expectedRevision,1);
  await empty.page.locator('[data-hqr-tab="coupons"]').click();
  await empty.page.locator('[data-hqr-action="coupon-new"]').click();
  await empty.page.locator('#hqrCode').fill('DEMO_TEST');
  await empty.page.locator('#hqrCouponStatus').selectOption('ready');
  await empty.page.locator('#hqrSubmit').click();
  await empty.page.waitForFunction(()=>!document.getElementById('hqrDialog').open);
  assert.match(await empty.page.locator('#hqrPanel').innerText(),/campanha permanece inativa/);
  await empty.page.locator('[data-hqr-action="coupon-edit"]').click();
  await empty.page.locator('#hqrCouponStatus').selectOption('paused');
  await empty.page.locator('#hqrSubmit').click();
  await empty.page.waitForFunction(()=>!document.getElementById('hqrDialog').open);
  assert.equal(empty.calls.filter(c=>c.name==='hq_referrals_save_coupon')[1].args.p_input.expectedRevision,1);
  assert.equal(empty.data.campaign.enabled,false);
  assert.deepEqual(empty.errors,[]);groups++;await empty.context.close();
  const mobile=await setup({width:390});
  await mobile.page.locator('[data-hqr-tab="commissions"]').click();
  assert(await mobile.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await capture(mobile.page,'hq-referrals-mobile.png');
  await mobile.page.locator('[data-hqr-action="review"]').first().click();
  assert(await mobile.page.locator('#hqrDecision option[value="eligible"]').isDisabled(),'campanha OFF não oferece liberação');
  assert(await mobile.page.locator('#hqrDialog').evaluate(el=>el.getBoundingClientRect().right<=innerWidth&&el.getBoundingClientRect().left>=0));
  await mobile.page.locator('#hqrReason').fill('Revisão fictícia para teste');
  await mobile.page.locator('#hqrSubmit').click();
  await mobile.page.waitForFunction(()=>!document.getElementById('hqrDialog').open);
  assert.equal(mobile.calls.filter(c=>c.name==='hq_referrals_record_payment').length,0);
  assert.deepEqual(mobile.errors,[]);groups++;await mobile.context.close();
  const paid=await setup({paymentFailures:1});
  await paymentReview(paid);
  await paid.page.locator('#hqrPaymentConfirmed').check();
  await paid.page.locator('#hqrSubmit').click();
  await paid.page.waitForFunction(()=>document.getElementById('hqrDialogStatus').textContent.includes('Não foi possível'));
  await paid.page.locator('#hqrSubmit').click();
  await paid.page.waitForFunction(()=>!document.getElementById('hqrDialog').open);
  const records=paid.calls.filter(c=>c.name==='hq_referrals_record_payment').map(c=>c.args.p_input);
  assert.equal(records.length,2);assert.deepEqual(records[0],records[1]);
  assert.match(records[0].operationId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(records[0].amountCents,1996);assert.equal(records[0].confirmation,true);
  assert.deepEqual(records[0].commissionIds,[ids[5]]);assert.equal(records[0].expectedRevisions[ids[5]],5);
  assert.equal(paid.data.commissions[0].status,'paid');assert.equal(paid.data.commissions[1].status,'pending');
  assert.deepEqual(paid.outside,[]);assert.deepEqual(paid.errors,[]);groups++;await paid.context.close();
  const riskData=fixture();riskData.commissions.push({...riskData.commissions[0],id:ids[16],partnerId:ids[1]});
  const risk=await setup({data:riskData});
  assert(await risk.page.locator(`[data-hqr-action="payment"][data-id="${ids[1]}"]`).isDisabled());
  assert.match(await risk.page.locator('#hqrPanel').innerText(),/Concilie o saldo em disputa/);
  assert.equal(risk.calls.filter(c=>c.name==='hq_referrals_record_payment').length,0);groups++;await risk.context.close();
  const batchData=fixture(), template=batchData.commissions[0];
  batchData.commissions=Array.from({length:101},(_,i)=>({...template,id:`10000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`}));
  const batch=await setup({data:batchData});
  await batch.page.locator('[data-hqr-action="payment"]').click();
  assert.match(await batch.page.locator('#hqrDialog').innerText(),/100 de 101/);
  await batch.page.locator('#hqrReference').fill('LOTE FICTÍCIO 100');await batch.page.locator('#hqrSubmit').click();
  await batch.page.locator('#hqrPaymentConfirmed').check();await batch.page.locator('#hqrSubmit').click();
  await batch.page.waitForFunction(()=>!document.getElementById('hqrDialog').open);
  const batchInput=batch.calls.find(c=>c.name==='hq_referrals_record_payment').args.p_input;
  assert.equal(batchInput.commissionIds.length,100);assert.equal(batchInput.amountCents,199600);
  assert.equal(batch.data.commissions.filter(c=>c.status==='eligible').length,1);groups++;await batch.context.close();
  for (const pending of ['snapshot','payment']) {
    const options=pending==='snapshot'?{delaySnapshot:true}:{delayPayment:true};
    const x=await setup(options);
    if(pending==='payment'){await paymentReview(x);await x.page.locator('#hqrPaymentConfirmed').check();await x.page.locator('#hqrSubmit').click();}
    await x.page.waitForFunction(()=>window.__hqFixtureAuth.length>0);
    await x.page.evaluate(()=>window.__hqFixtureAuth.slice().forEach(fn=>fn('SIGNED_OUT')));
    x.release();await x.page.waitForTimeout(100);
    assert(await x.page.locator('#hqReferrals').isHidden());
    assert.equal(await x.page.locator('#hqReferrals').innerHTML(),'');
    assert.equal(await x.page.locator('#hqrDialog').count(),0);
    assert.equal(await x.page.locator('#hqReferrals').getAttribute('data-hqr-mounted'),null);
    assert.equal(await x.page.evaluate(()=>window.__hqFixtureAuth.length),0);
    options.delaySnapshot=false;options.delayPayment=false;
    await x.page.evaluate(()=>window.MT_HQ_REFERRALS.mount(document.getElementById('hqReferrals'),window.MT_supabase));
    await x.page.waitForFunction(()=>document.getElementById('hqrReload')&&!document.getElementById('hqrReload').disabled);
    assert(await x.page.locator('#hqReferrals').isVisible());
    assert.equal(await x.page.locator('#hqrDialog').count(),1);
    assert.equal(await x.page.evaluate(()=>window.__hqFixtureAuth.length),1);
    assert.deepEqual(x.errors,[]);groups++;await x.context.close();
  }
  const modern=await setup({modern:true});assert.equal(await modern.page.locator('a[href="hq.html?legacy=1"]').count(),1);assert.equal(await modern.page.evaluate(()=>!!window.MTStore),false);assert.match(await modern.page.locator('#hqrBody').innerText(),/Campanha inativa/);await modern.page.locator('.hq-nav [data-nav="overview"]').click();await modern.page.locator('.hq-nav [data-nav="referrals"]').click();assert.equal(await modern.page.locator('#hqrDialog').count(),1);assert.deepEqual(modern.errors,[]);assert.deepEqual(modern.outside,[]);groups++;await modern.context.close();
  const switched=await setup();
  await paymentReview(switched);
  const readsBeforeSwitch=switched.calls.filter(c=>c.name==='hq_referrals_snapshot').length;
  assert.deepEqual(await switched.page.evaluate(()=>{
    window.__hqFixtureEmit('SIGNED_IN','fixture-nonadmin');
    return {content:document.getElementById('hqReferrals').innerHTML,dialog:document.getElementById('hqrDialog').innerHTML,open:document.getElementById('hqrDialog').open};
  }),{content:'',dialog:'',open:false},'troca de identidade limpa conteudo e dialog sincronamente');
  await switched.page.waitForFunction(()=>document.querySelector('.hqr-error'));
  assert.equal(switched.calls.filter(c=>c.name==='hq_referrals_snapshot').length,readsBeforeSwitch,'nova identidade negada antes de consultar o ledger');
  assert.equal(await switched.page.locator('.hqr-total,[data-hqr-action]').count(),0);
  assert.equal(await switched.page.evaluate(()=>window.__hqFixtureRpcInsideAuth),0);
  assert.deepEqual(switched.errors,[]);assert.deepEqual(switched.outside,[]);groups++;await switched.context.close();

  for (const pending of ['snapshot','payment']) {
    const options=pending==='snapshot'?{delaySnapshot:true}:{delayPayment:true};
    const x=await setup(options);
    const pendingRpc=pending==='snapshot'?'hq_referrals_snapshot':'hq_referrals_record_payment';
    if(pending==='payment'){await paymentReview(x);await x.page.locator('#hqrPaymentConfirmed').check();await x.page.locator('#hqrSubmit').click();}
    await x.pendingReady;
    options.delaySnapshot=false;options.delayPayment=false;
    const staleResponse=x.page.waitForResponse(response=>response.url().endsWith('/'+pendingRpc));
    await x.page.evaluate(()=>window.__hqFixtureEmit('SIGNED_IN','fixture-nonadmin'));
    await x.page.waitForFunction(()=>document.querySelector('.hqr-error'));
    x.release();await (await staleResponse).finished();
    const afterStale=await x.page.evaluate(()=>new Promise(resolve=>setTimeout(()=>resolve({
      denied:!!document.querySelector('.hqr-error'),rows:document.querySelectorAll('.hqr-total,[data-hqr-action]').length,
      dialog:document.getElementById('hqrDialog').innerHTML,open:document.getElementById('hqrDialog').open
    }),0)));
    assert.deepEqual(afterStale,{denied:true,rows:0,dialog:'',open:false},'resposta antiga nao restaura dados nem sucesso na sessao negada');
    // A fresh permitted read proves the old response cannot resurrect a dialog,
    // stale success message or busy state in this same mounted instance.
    await x.page.evaluate(()=>window.__hqFixtureEmit('TOKEN_REFRESHED','fixture-admin'));
    await x.page.waitForFunction(()=>document.querySelectorAll('.hqr-total').length===5&&!document.getElementById('hqrReload').disabled);
    assert.equal(await x.page.locator('#hqrDialog').innerHTML(),'');assert.equal(await x.page.locator('#hqrDialog').evaluate(el=>el.open),false);
    assert.equal(await x.page.evaluate(()=>window.__hqFixtureRpcInsideAuth),0);
    assert.equal(await x.page.evaluate(()=>window.__hqFixtureAuth.length),1);
    assert.deepEqual(x.errors,[]);assert.deepEqual(x.outside,[]);groups++;await x.context.close();
  }

  const refreshed=await setup();
  for(const event of ['TOKEN_REFRESHED','USER_UPDATED','SIGNED_IN']){
    const before=refreshed.calls.filter(c=>c.name==='hq_referrals_snapshot').length;
    assert.equal(await refreshed.page.evaluate(event=>{window.__hqFixtureEmit(event);return document.getElementById('hqReferrals').innerHTML;},event),'');
    await refreshed.page.waitForFunction(()=>document.querySelectorAll('.hqr-total').length===5&&!document.getElementById('hqrReload').disabled);
    assert.equal(refreshed.calls.filter(c=>c.name==='hq_referrals_snapshot').length,before+1,'uma leitura apos renovar a mesma sessao');
    assert.equal(await refreshed.page.evaluate(()=>window.__hqFixtureAuth.length),1,'INITIAL_SESSION nao remonta nem duplica listener');
  }
  assert.equal(await refreshed.page.evaluate(()=>window.__hqFixtureRpcInsideAuth),0);
  assert.deepEqual(refreshed.errors,[]);assert.deepEqual(refreshed.outside,[]);groups++;await refreshed.context.close();
  console.log(`PASS HQ referrals browser: ${groups} groups; all financial operations were test fixtures.`);
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
