// Fixtures isoladas: nenhum login, cartão, cobrança ou mensagem real.
const assert = require('node:assert/strict');
const fs = require('node:fs');
let chromium;
try { chromium = require('playwright').chromium; } catch (_) { chromium = require('./ci/node_modules/playwright').chromium; }
const api = require('../assets/personal-saas-checkout.js');
const base = process.env.BASE_URL || 'http://127.0.0.1:8765';
const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const aid = '00000000-0000-4000-8000-000000000001', otherAid = '00000000-0000-4000-8000-000000000002';
const uid = '00000000-0000-4000-8000-000000000010';
const trial = new Date(Date.now()+14*86400000).toISOString();
const paidEnd = new Date(Date.now()+44*86400000).toISOString();
const pan = '4000000000000010', cvv = '987';
let browser, checks = 0;
const pass = name => { checks++; console.log('PASS '+name); };
const config = {ok:true,enabled:true,configured:true,managementEnabled:true,environment:'test',priceCents:4990,trialDays:14,publicKey:'pk_test_fixtureonly',tokenizeUrl:'https://api.pagar.me/core/v5/tokens'};
const status = {ok:true,enabled:true,academiaId:aid,state:'trial',trialEndsAt:trial,paidThrough:null,accessUntil:trial,accessActive:true,renewalCanceled:false,attemptId:null,retryAllowed:true,managed:false,canCancel:false};
async function fixture(opts={}) {
  const c=await browser.newContext({viewport:{width:opts.width||390,height:950}});
  await c.addInitScript(({uid,anonymous,blocked})=>{
    window.__billingSession=anonymous?null:{access_token:'fixture-session-only',user:{id:uid,email:'profissional@example.invalid'}};
    window.MT_supabase={auth:{getSession:async()=>({data:{session:window.__billingSession},error:null}),onAuthStateChange:fn=>{window.__billingAuthChanged=fn;return{data:{subscription:{unsubscribe(){}}}};}}};
    if(blocked)Object.defineProperty(window,'sessionStorage',{get(){throw Error('blocked');}});
  },{uid,anonymous:!!opts.anonymous,blocked:!!opts.blocked});
  const calls=[],external=[],errors=[]; let current={...status,...opts.status};
  await c.route('**/*',async route=>{
    const req=route.request(),url=req.url();
    if(url.includes('/functions/v1/personal-billing')) {
      const body=req.postDataJSON();calls.push({body,headers:req.headers()});
      if(opts.rpc) {const result=await opts.rpc(body,route);if(result===true)return;}
      let result;
      if(body.action==='config')result={...config,...opts.config};
      else if(body.action==='accounts')result={ok:true,accounts:opts.accounts||[{id:aid,nome:'Personal de teste',createdAt:new Date().toISOString()}]};
      else if(body.action==='status')result={...current,academiaId:opts.wrongAccount?otherAid:body.academiaId};
      else if(body.action==='checkout') {current={...current,state:'scheduled',managed:true,retryAllowed:false,attemptId:body.attemptId};result=current;}
      else if(body.action==='cancel') {current={...current,state:'canceled',renewalCanceled:true,retryAllowed:false};result=current;}
      else throw Error('action inesperada');
      await route.fulfill({json:result});return;
    }
    if(url.startsWith('https://api.pagar.me/core/v5/tokens')) {
      calls.push({token:true,body:req.postDataJSON(),headers:req.headers(),url});
      if(opts.token)return opts.token(route);
      await route.fulfill({json:{id:'token_fixtureonly'}});return;
    }
    if(!url.startsWith(base+'/')){external.push(url);return route.abort();}
    return route.continue();
  });
  const page=await c.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/personal-assinatura.html?paid=true&discount=100&plan_id=evil');
  if(!opts.anonymous)await page.waitForFunction(()=>{let p=document.querySelector('#billingMessage');return p&&!/Consultando sua conta|Consultando a situação/.test(p.textContent);});
  return {page,c,calls,external,errors,setStatus(v){current={...current,...v};},async close(){assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await c.close();}};
}
async function fill(page) {
  await page.locator('#salesCheckout').click();
  const values={billingName:'Profissional Fictício',billingEmail:'pessoa@example.invalid',billingAddress:'100, Rua de Teste, Centro',billingZip:'30110000',billingCity:'Belo Horizonte',billingState:'MG',billingCardHolder:'PESSOA TESTE',billingCardNumber:pan,billingCardExpiry:'12/'+(new Date().getFullYear()+2),billingCardCvv:cvv};
  for(const [id,value]of Object.entries(values))await page.locator('#'+id).fill(value);
  await page.locator('#billingConsent').check();
}
async function submit(page) {await page.locator('#billingSubmit').click();await page.waitForFunction(()=>document.querySelector('#billingPanel').getAttribute('aria-busy')==='false');}
(async()=>{
  assert.throws(()=>api.validConfig({...config,publicKey:'sk_test_secret'}));
  assert.throws(()=>api.validConfig({...config,priceCents:1}));
  assert.throws(()=>api.validConfig({...config,tokenizeUrl:'https://evil.invalid/tokens'}));
  assert.throws(()=>api.validStatus({...status,academiaId:otherAid},aid));
  assert.throws(()=>api.validStatus({...status,accessActive:true,accessUntil:null},aid));
  assert.throws(()=>api.validStatus({...status,state:'paid',paidThrough:null},aid));
  assert.throws(()=>api.validStatus({...status,state:'canceled',renewalCanceled:false},aid));
  assert.throws(()=>api.cardInput({holder:'TESTE PESSOA',number:pan,expiry:'00/2030',cvv}));
  pass('contratos rejeitam preço, chave secreta, destino, conta e acesso inválidos');
  browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
  {
    const f=await fixture({anonymous:true});
    assert(await f.page.locator('#salesCheckout').isDisabled());
    assert(await f.page.locator('#billingForm').isHidden());assert.equal(f.calls.length,0);
    await f.close();pass('visitante não consulta ou cria operações financeiras');
  }
  {
    const f=await fixture({config:{enabled:false,configured:false,managementEnabled:false,publicKey:null,tokenizeUrl:null}});
    assert(await f.page.locator('#salesCheckout').isDisabled());
    await f.page.evaluate(()=>{let b=document.querySelector('#salesCheckout');b.disabled=false;b.click();});
    assert(await f.page.locator('#billingForm').isHidden());assert(!f.calls.some(x=>x.token||x.body.action==='checkout'));
    assert.match(await f.page.locator('#salesAvailabilityTitle').innerText(),/indisponível/);
    await f.close();pass('gate OFF ignora manipulação de botão e parâmetros da URL');
  }
  for(const invalid of [{priceCents:1},{publicKey:'sk_test_secret'},{environment:'live'}]) {
    const f=await fixture({config:invalid});assert(await f.page.locator('#salesCheckout').isDisabled());await f.close();
  }
  pass('configuração inválida não abre cartão');
  for(const width of [320,390,768,1440]) {
    const f=await fixture({width});await fill(f.page);
    assert(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.equal(await f.page.locator('[data-card-field][name]').count(),0,'cartão nunca participa de submit HTML nativo');
    assert.match(await f.page.locator('#billingEnvironment').innerText(),/teste/);
    await f.page.locator('#billingConsent').uncheck();await f.page.locator('#billingConsent').focus();await f.page.keyboard.press('Space');
    assert(await f.page.locator('#billingConsent').isChecked());
    if(process.env.SAAS_SCREENSHOTS){fs.mkdirSync(process.env.SAAS_SCREENSHOTS,{recursive:true});await f.page.screenshot({path:require('node:path').join(process.env.SAAS_SCREENSHOTS,'checkout-'+width+'.png'),fullPage:true});}
    if(width===390) {
      await submit(f.page);
      assert.match(await f.page.locator('#billingStatus').innerText(),/agendada.*não confirma pagamento/);
      assert(await f.page.locator('#salesCheckout').isDisabled());
      const token=f.calls.find(x=>x.token), checkout=f.calls.find(x=>x.body.action==='checkout');
      assert(token.url.endsWith('?appId=pk_test_fixtureonly'));assert.equal(token.headers.authorization,undefined);
      assert.equal(token.body.type,'card');assert.equal(token.body.card.number,pan);assert.equal(token.body.card.cvv,cvv);
      assert(!JSON.stringify(checkout.body).includes(pan));assert(!JSON.stringify(checkout.body).includes(cvv));
      assert.deepEqual(Object.keys(checkout.body).sort(),['academiaId','action','attemptId','cardToken','customer']);
      assert.equal(checkout.body.customer.address.country,'BR');assert.equal(checkout.headers.authorization,'Bearer fixture-session-only');
      const storage=await f.page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}));
      assert(!storage.includes(pan));assert(!storage.includes('token_fixtureonly'));assert(!storage.includes('pessoa@example.invalid'));
      assert.equal(await f.page.locator('#billingCardNumber').inputValue(),'');
      assert.equal(f.calls.filter(x=>x.body.action==='checkout').length,1);
      assert.match(await f.page.locator('#billingTrialEnd').innerText(),/\d{2}\/\d{2}\/\d{4}/);
    }
    await f.close();
  }
  pass('4 larguras, teclado e tokenização direta sem PAN/CVV no Torque ou armazenamento');
  {
    const f=await fixture({rpc:async(body,route)=>{if(body.action==='checkout'){await route.abort('failed');return true;}}});
    await fill(f.page);await submit(f.page);
    assert.match(await f.page.locator('#billingMessage').innerText(),/não foi confirmada/);
    assert(await f.page.locator('#salesCheckout').isDisabled());
    const attempt=f.calls.find(x=>x.body.action==='checkout').body.attemptId;
    await f.page.reload();await f.page.waitForFunction(()=>document.querySelector('#billingMessage').textContent==='Situação consultada.');
    assert(await f.page.locator('#salesCheckout').isDisabled(),'status sem esta tentativa não libera nova contratação');
    assert(f.calls.some(x=>x.body.action==='status'&&x.body.attemptId===attempt));
    f.setStatus({state:'payment_failed',attemptId:attempt,retryAllowed:true,managed:true});
    await f.page.locator('#billingRefresh').click();await f.page.waitForFunction(()=>!document.querySelector('#salesCheckout').disabled);
    assert.equal(f.calls.filter(x=>x.body.action==='checkout').length,1,'consulta não repete compra');
    await f.close();pass('timeout persiste UUID, recarrega e só permite retry da falha definitiva correspondente');
  }
  {
    const f=await fixture({status:{state:'paid',managed:true,canCancel:true,retryAllowed:false,paidThrough:paidEnd,accessUntil:paidEnd},config:{enabled:false,configured:true,managementEnabled:true,publicKey:null,tokenizeUrl:null}});
    assert(await f.page.locator('#billingCancel').isVisible());await f.page.locator('#billingCancel').click();
    assert.equal(f.calls.filter(x=>x.body.action==='cancel').length,0);
    await f.page.locator('#billingCancelYes').click();await f.page.waitForFunction(()=>document.querySelector('#billingMessage').textContent==='Cancelamento confirmado.');
    assert.match(await f.page.locator('#billingStatus').innerText(),/Renovação cancelada e confirmada/);
    assert.equal(f.calls.filter(x=>x.body.action==='cancel').length,1);assert(await f.page.locator('#billingCancel').isHidden());
    assert.notEqual(await f.page.locator('#billingAccessEnd').innerText(),'Não confirmado');
    await f.close();pass('cancelamento explícito funciona com novas vendas OFF e conserva prazo pago');
  }
  {
    const f=await fixture({status:{state:'paid',managed:true,canCancel:true,retryAllowed:false,paidThrough:paidEnd,accessUntil:paidEnd},rpc:async(body,route)=>{if(body.action==='cancel'){await route.fulfill({json:{...status,state:'cancel_pending',managed:true,retryAllowed:false,paidThrough:paidEnd,accessUntil:paidEnd}});return true;}}});
    await f.page.locator('#billingCancel').click();await f.page.locator('#billingCancelYes').click();
    await f.page.waitForFunction(()=>document.querySelector('#billingPanel').getAttribute('aria-busy')==='false');
    assert.match(await f.page.locator('#billingStatus').innerText(),/ainda não está confirmada como cancelada/);
    assert(!/Cancelamento confirmado\./.test(await f.page.locator('#billingMessage').innerText()));
    await f.close();pass('cancel_pending não é exibido como cancelamento confirmado');
  }
  {
    const f=await fixture({accounts:[{id:aid,nome:'Conta A'},{id:otherAid,nome:'Conta B'}]});
    assert(!f.calls.some(x=>x.body.action==='status'));assert(await f.page.locator('#salesCheckout').isDisabled());
    await f.page.locator('#billingAccount').selectOption(otherAid);await f.page.waitForFunction(()=>!document.querySelector('#salesCheckout').disabled);
    assert.equal(f.calls.filter(x=>x.body.action==='status').at(-1).body.academiaId,otherAid);
    await f.close();pass('duas contas exigem seleção explícita');
  }
  {
    const f=await fixture({wrongAccount:true});assert(await f.page.locator('#salesCheckout').isDisabled());await f.close();
    pass('resposta de outra conta não habilita contratação');
  }
  {
    const f=await fixture({blocked:true});await fill(f.page);await submit(f.page);
    assert.match(await f.page.locator('#billingMessage').innerText(),/armazenamento/);assert(!f.calls.some(x=>x.token));assert(!f.calls.some(x=>x.body.action==='checkout'));
    await f.close();pass('armazenamento bloqueado impede tentativa sem referência recuperável');
  }
  {
    const f=await fixture({token:route=>route.fulfill({status:400,json:{error:'invalid_card',sensitive:pan}})});
    await fill(f.page);await submit(f.page);assert.match(await f.page.locator('#billingMessage').innerText(),/validar o cartão/);
    assert(!f.calls.some(x=>x.body.action==='checkout'));assert(!(await f.page.locator('#billingMessage').innerText()).includes(pan));await f.close();
    pass('falha do token não envia contratação nem exibe resposta sensível');
  }
  {
    let release, tokenRequested;const requested=new Promise(r=>tokenRequested=r);
    const held=new Promise(r=>release=r);
    const f=await fixture({token:async route=>{tokenRequested();await held;try{await route.fulfill({json:{id:'token_delayed'}});}catch(_){}}});
    await fill(f.page);await f.page.locator('#billingSubmit').click();await requested;
    await f.page.evaluate(()=>{window.__billingSession=null;window.__billingAuthChanged('SIGNED_OUT',null);});release();
    await f.page.waitForFunction(()=>document.querySelector('#billingPanel').hidden);
    assert(!f.calls.some(x=>x.body.action==='checkout'));assert.equal(await f.page.locator('#billingCardNumber').inputValue(),'');assert.equal(await f.page.locator('#billingAddress').inputValue(),'');
    assert(await f.page.locator('#salesCheckout').isDisabled());await f.close();pass('saída durante tokenização apaga campos e descarta resposta tardia');
  }
  {
    const f=await fixture({status:{accessKind:'lifetime',accessUntil:null,accessActive:true}});
    assert.equal(await f.page.locator('#billingAccessEnd').innerText(),'Sem prazo (benefício vitalício)');
    await f.close();pass('benefício vitalício explícito conserva ausência de prazo');
  }
  {
    const f=await fixture({status:{accessKind:'legacy',accessUntil:null,accessActive:true}});
    assert.match(await f.page.locator('#billingAccessEnd').innerText(),/anterior não informado/);
    assert(!/vitalício/.test(await f.page.locator('#billingAccessEnd').innerText()));
    await f.close();pass('prazo legado ausente não vira vitalícia nem prazo inventado');
  }
  {
    const f=await fixture({status:{state:'expired',accessActive:true}});
    assert.match(await f.page.locator('#billingStatus').innerText(),/acesso atual permanece/);
    await f.close();pass('fim do trial não apaga carência ou outro acesso confirmado');
  }
  {
    const f=await fixture({rpc:async(body,route)=>{if(body.action==='checkout'){await route.fulfill({status:422,json:{ok:false,error:'invalid_input'}});return true;}}});
    await fill(f.page);await submit(f.page);
    assert.match(await f.page.locator('#billingMessage').innerText(),/não foi iniciada/);
    assert(await f.page.locator('#salesCheckout').isDisabled());
    await f.page.locator('#billingRefresh').click();await f.page.waitForFunction(()=>!document.querySelector('#salesCheckout').disabled);
    assert.equal(f.calls.filter(x=>x.body.action==='checkout').length,1);
    await f.close();pass('rejeição anterior à reserva não deixa referência impossível de reconciliar');
  }
  {
    const f=await fixture({status:{state:'needs_review',managed:true,canCancel:true,retryAllowed:false}});
    assert(await f.page.locator('#salesCheckout').isDisabled());assert(await f.page.locator('#billingCancel').isVisible());
    await f.page.locator('#billingCancel').click();await f.page.locator('#billingCancelYes').click();
    await f.page.waitForFunction(()=>document.querySelector('#billingMessage').textContent==='Cancelamento confirmado.');
    await f.close();pass('assinatura conhecida sob revisão permite cancelar futuras renovações');
  }
  {
    const f=await fixture();await fill(f.page);await f.page.locator('#billingConsent').uncheck();
    await f.page.evaluate(()=>document.querySelector('#billingForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    assert(!f.calls.some(x=>x.token||x.body.action==='checkout'));
    await f.page.locator('#billingConsent').check();
    await f.page.evaluate(()=>{let form=document.querySelector('#billingForm');form.requestSubmit();form.requestSubmit();});
    await f.page.waitForFunction(()=>document.querySelector('#billingStatus').textContent.startsWith('Assinatura agendada.'));
    assert.equal(f.calls.filter(x=>x.token).length,1);assert.equal(f.calls.filter(x=>x.body.action==='checkout').length,1);
    await f.close();pass('consentimento obrigatório e envio duplo geram no máximo uma contratação');
  }
  {
    const f=await fixture({rpc:async(body,route)=>{if(body.action==='checkout'){await route.fulfill({json:{...status,state:'paid',managed:true,canCancel:true,retryAllowed:false,attemptId:body.attemptId,paidThrough:paidEnd,accessUntil:paidEnd}});return true;}}});
    await fill(f.page);await submit(f.page);
    assert.match(await f.page.locator('#billingStatus').innerText(),/^Pagamento confirmado/);
    assert.equal(await f.page.evaluate(()=>localStorage.getItem('mtapp:ptAssinatura')),null,'browser não concede assinatura local');
    assert(await f.page.locator('#billingCancel').isVisible());await f.close();pass('pagamento confirmado mostra prazo do servidor sem criar acesso local');
  }
  {
    const f=await fixture({token:async route=>{await f.page.evaluate(()=>{window.__billingSession=null;});await route.fulfill({json:{id:'token_fixtureonly'}});}});
    await fill(f.page);await submit(f.page);
    assert(!f.calls.some(x=>x.body.action==='checkout'));
    assert.match(await f.page.locator('#billingMessage').innerText(),/sessão terminou ou mudou/);
    assert.equal(await f.page.evaluate(()=>Object.keys(sessionStorage).filter(x=>x.startsWith('torque:billing:attempt:')).length),0,'falha local antes do POST não deixa tentativa inexistente');
    await f.close();pass('sessão vencida antes do POST não gera compra nem referência impossível');
  }
  console.log(`PASS personal SaaS checkout browser: ${checks} grupos isolados; nenhum gateway real.`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
