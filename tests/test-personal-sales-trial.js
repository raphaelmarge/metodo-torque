// Jornada real no browser com dados ficticios locais e rede externa bloqueada.
// Nao compra, autentica ou modifica acesso em servidor.
const assert = require('node:assert/strict');
const fs = require('node:fs');
let chromium;
try { chromium = require('playwright').chromium; }
catch (_) { try { chromium = require('./ci/node_modules/playwright').chromium; } catch (_) { chromium = require('/opt/node22/lib/node_modules/playwright').chromium; } }
const base = process.env.BASE_URL || 'http://127.0.0.1:8765';
const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
let browser, checks = 0;
const locked = {status:'trial',travado:true,dia_do_teste:18,vence:'2026-01-14T00:00:00Z'};
async function contextFor({width=390, native=false, platform='android'}={}) {
  const context = await browser.newContext({viewport:{width,height:950},serviceWorkers:'block'});
  await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
  await context.addInitScript(({native,platform,locked}) => {
    if (window !== window.top) return;
    if (!localStorage.getItem('sales:trial:seeded')) {
      localStorage.setItem('sales:trial:seeded','1');
      localStorage.setItem('mtapp:ptSemConta','1');
      localStorage.setItem('mtapp:perfil',JSON.stringify({nome:'Fixture local'}));
      localStorage.setItem('mtapp:ptStudio',JSON.stringify({config:{nome:'Fixture local',onboardingFeito:true},alunos:[]}));
      localStorage.setItem('mtapp:ptAssinatura',JSON.stringify(locked));
      sessionStorage.setItem('torque:sales:intent:v1',JSON.stringify({version:1,status:'unverified',code:'TEST_ONLY',partnerRef:''}));
    }
    window.__salesNativeCalls = [];
    window.Capacitor = {isNativePlatform:()=>native,getPlatform:()=>platform,Plugins:{Purchases:{
      configure:async options=>{window.__salesNativeCalls.push(['configure',options.appUserID]);},
      getOfferings:async()=>({current:{availablePackages:[{identifier:'fixture-mensal'}]}}),
      purchasePackage:async options=>{window.__salesNativeCalls.push(['purchase',options.aPackage.identifier]);throw {userCancelled:true};}
    }}};
  },{native,platform,locked});
  const page = await context.newPage(), errors=[];
  page.on('pageerror', e=>errors.push(e.message));
  await page.goto(base+'/personal.html');
  await page.waitForFunction(()=>window.__assinatura && window.__telaAssinatura);
  return {context,page,errors};
}
async function snapshot(page) {
  return page.evaluate(()=>({ass:localStorage.getItem('mtapp:ptAssinatura'),studio:localStorage.getItem('mtapp:ptStudio'),
    academia:localStorage.getItem('mtapp:academia'),intent:sessionStorage.getItem('torque:sales:intent:v1')}));
}
(async()=>{
  browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
  for (const width of [390,1440]) {
    const {context,page,errors}=await contextFor({width});
    assert(await page.locator('#telaAssinatura').isVisible());
    assert(await page.locator('#taDepois').isHidden());
    assert(await page.locator('#taBackup').isVisible());
    assert(await page.locator('#taRever').isVisible());
    assert.equal(await page.locator('#taPreco').innerText(),'R$ 49,90');
    assert.match(await page.locator('#taCondicoes').innerText(),/indisponível/);
    assert.equal(await page.locator('#taAssinar').innerText(),'Ver assinatura no site');
    assert(!/loja do seu celular/.test(await page.locator('#taCondicoes').innerText()));
    const before=await snapshot(page);
    // Exportacao continua disponivel, sem substituir a funcao real do Store.
    const downloadPromise=page.waitForEvent('download');
    await page.locator('#taBackup').click();
    const download=await downloadPromise;
    assert.match(download.suggestedFilename(),/\.json$/);
    assert.deepEqual(await snapshot(page),before);
    await page.locator('#taAssinar').click();
    await page.waitForURL('**/personal-assinatura.html?origem=trial-vencido');
    assert(await page.locator('#salesCheckout').isDisabled());
    assert.equal(await page.locator('#salesTrialAction').innerText(),'Voltar ao painel');
    assert.equal(await page.locator('#salesTrialAction').getAttribute('href'),'personal.html');
    assert(!/iniciar o teste/.test(await page.locator('#salesAvailabilityCopy').innerText()));
    assert.equal(await page.locator('#salesCoupon').inputValue(),'TEST_ONLY');
    assert.deepEqual(await snapshot(page),before,'navegar nao paga, ativa, apaga ou cria conta');
    await page.goBack();
    await page.waitForFunction(()=>window.__assinatura);
    assert(await page.locator('#telaAssinatura').isVisible(),'voltar conserva trava do servidor');
    assert.deepEqual(await page.evaluate(()=>window.__salesNativeCalls),[]);
    assert.deepEqual(errors,[]);
    checks++;await context.close();
  }
  {
    const {context,page}=await contextFor();
    const before=await snapshot(page);
    await page.evaluate(()=>{
      window.__salesRpc=[];
      window.MTStore.cloud=()=>({client:{rpc:name=>{window.__salesRpc.push(name);return Promise.reject(new Error('fixture offline'));}}});
    });
    await page.locator('#taRever').click();
    assert(await page.locator('#taRever').isDisabled());
    await page.waitForFunction(()=>!document.getElementById('taRever').disabled);
    assert(await page.locator('#telaAssinatura').isVisible());
    assert(await page.locator('#taErro').isVisible());
    assert.deepEqual(await page.evaluate(()=>window.__salesRpc),['minha_assinatura']);
    assert.deepEqual(await snapshot(page),before,'reconsulta sem resposta nao altera a assinatura');
    const result=await page.evaluate(async()=>{
      const T=window.__assinatura, S=window.MTStore, dialog=document.getElementById('telaAssinatura');
      const close=()=>{dialog.hidden=true;};
      close();localStorage.removeItem('mtapp:ptAssinatura');T.aplica();const noStatus=dialog.hidden;
      localStorage.setItem('mtapp:ptAssinatura',JSON.stringify({status:'trial'}));T.aplica();const legacy=dialog.hidden;
      localStorage.setItem('mtapp:ptAssinatura',JSON.stringify({status:'vitalicia',travado:false}));T.aplica();const lifetime=dialog.hidden;
      // A reconsulta so altera o status se o servidor fornece um envelope valido.
      localStorage.setItem('mtapp:ptAssinatura',JSON.stringify({status:'trial',travado:true}));T.aplica();
      S.cloud=()=>({client:{rpc:()=>Promise.reject(new Error('fixture offline'))}});
      T.consulta();await new Promise(r=>setTimeout(r,0));const failureKeepsLock=T.travado();
      S.cloud=()=>({client:{rpc:()=>Promise.resolve({data:{status:'ativa',travado:false}})}});
      T.consulta();await new Promise(r=>setTimeout(r,0));const unlockedByServer=!T.travado();
      return {noStatus,legacy,lifetime,failureKeepsLock,unlockedByServer};
    });
    assert.deepEqual(result,{noStatus:true,legacy:true,lifetime:true,failureKeepsLock:true,unlockedByServer:true});
    checks++;await context.close();
  }
  for (const platform of ['android','ios']) {
    const {context,page,errors}=await contextFor({native:true,platform});
    assert.equal(await page.locator('#taPreco').innerText(),'R$ 49');
    assert.match(await page.locator('#taCondicoes').innerText(),/loja do seu celular/);
    assert.equal(await page.locator('#taAssinar').innerText(),'Assinar agora');
    assert(await page.locator('#faixaTesteZap').isHidden());
    await page.evaluate(platform=>{
      localStorage.setItem('mtapp:academia',JSON.stringify({id:'fixture-academia'}));
      self.MT_RC={[platform]:'fixture-only-not-a-credential'};
    },platform);
    const before=await snapshot(page);
    await page.locator('#taAssinar').click();
    await page.waitForFunction(()=>window.__salesNativeCalls.some(c=>c[0]==='purchase'));
    assert.deepEqual(await page.evaluate(()=>window.__salesNativeCalls),[['configure','fixture-academia'],['purchase','fixture-mensal']]);
    assert.equal(page.url(),base+'/personal.html');
    assert(await page.locator('#telaAssinatura').isVisible());
    assert(await page.locator('#taAssinar').isEnabled());
    assert.deepEqual(await snapshot(page),before,'cancelamento ficticio nativo nao modifica assinatura');
    assert.deepEqual(errors,[]);
    checks++;await context.close();
  }
  console.log(checks+' grupos de trial web/nativo passaram (sem transacao real).');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
