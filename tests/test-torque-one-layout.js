/* Reference shell across breakpoints, while real routes and permissions remain in charge. */
const assert=require('assert/strict'),fs=require('fs');
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const {comMockNuvem}=require('./_nuvem');
const BASE=process.env.BASE_URL||'http://127.0.0.1:8765';
let browser,checks=0;function ok(v,label){assert.ok(v,label);checks++;console.log('OK '+label);}
(async()=>{
  browser=comMockNuvem(await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/opt/pw-browsers/chromium',args:['--no-sandbox']}));
  const ctx=await browser.newContext({viewport:{width:1280,height:900},locale:'pt-BR',timezoneId:'America/Sao_Paulo',serviceWorkers:'block'});
  await ctx.route('**://*.supabase.co/**',r=>r.abort());const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE+'/demo-personal.html');await p.locator('#btnDemo').click();await p.waitForURL(/personal.html/);await p.waitForFunction(()=>document.getElementById('oneBreadcrumb'));
  const routes=await p.locator('#abas [data-a]').evaluateAll(els=>els.map(e=>e.dataset.a));
  ok(routes.length===18&&new Set(routes).size===18,'18 áreas originais, sem navegação paralela');
  for(const [width,sidebar] of [[801,200],[1024,200],[1100,200],[1101,234],[1440,234]]){
    await p.setViewportSize({width,height:900});await p.waitForTimeout(280);
    const rect=await p.locator('#abas').boundingBox();ok(rect.x===0&&rect.width===sidebar,'Sidebar fixa Torque One em '+width+'px');
    ok(!await p.locator('#btnMenuPt').isVisible(),'Barra móvel recolhida em '+width+'px');
    ok(await p.locator('.corpo').evaluate(e=>e.getBoundingClientRect().left>=parseFloat(getComputedStyle(document.body).paddingLeft)),'Conteúdo fora da sidebar em '+width+'px');
    ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Sem overflow em '+width+'px');
    await p.locator('#btnMenuFino').click();await p.waitForTimeout(280);ok(Math.round((await p.locator('#abas').boundingBox()).width)===66,'Colapso preservado em '+width+'px');await p.locator('#btnMenuFino').click();await p.waitForTimeout(280);
  }
  for(const route of routes){await p.locator('#abas [data-a="'+route+'"]').click();ok(await p.locator('#abas [data-a="'+route+'"]').evaluate(e=>e.classList.contains('ativa')),'Destino preservado: '+route);}
  await p.locator('#abas [data-a=dash]').click();
  ok(await p.locator('#dashMes .dh-kpi').first().evaluate(e=>getComputedStyle(e).backgroundColor==='rgba(0, 0, 0, 0)'),'Indicadores abertos, sem caixas');
  await p.locator('[data-one-route=nutricao]').click();ok(await p.locator('#vNutricao').isVisible(),'Atalho de alimentação abre módulo real');
  await p.locator('#pnAluno').selectOption({index:1});ok(await p.locator('.pn-plan-summary').isVisible(),'Resumo usa plano existente');
  for(const width of [800,390,320]){
    await p.setViewportSize({width,height:844});await p.waitForTimeout(280);
    ok(await p.locator('#btnMenuPt').isVisible(),'Menu móvel em '+width+'px');
    ok(await p.locator('#buscaAluno').evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=16&&e.getBoundingClientRect().height>=44),'Busca legível e com alvo de toque em '+width+'px');
    await p.locator('#btnMenuPt').click();await p.locator('#menuBuscaPt').fill('fotos');ok(await p.locator('#abas [data-a=imagens]').isVisible(),'Pesquisa continua disponível em '+width+'px');await p.locator('#fecharMenuPt').click();
    for(const area of ['plano','biblioteca','registros']){await p.locator('#pnAbas [data-pna='+area+']').click();ok(await p.locator('[data-pnsec='+area+']').isVisible()&&await p.locator('#pnArea').inputValue()===area,'Aba '+area+' funcional em '+width+'px');}
    ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Nutrição sem overflow em '+width+'px');
  }
  await p.setViewportSize({width:1280,height:900});await p.waitForTimeout(280);
  await p.evaluate(()=>{document.getElementById('menuBuscaPt').value='';document.getElementById('menuBuscaPt').dispatchEvent(new Event('input'));document.querySelector('#abas [data-a=dash]').click();document.querySelector('#abas [data-a=nutricao]').hidden=true;});
  await p.waitForFunction(()=>document.querySelector('[data-one-route=nutricao]').hidden);ok(!await p.locator('[data-one-route=nutricao]').isVisible(),'Atalho respeita área restrita');
  await p.locator('#btnTemaPt').click();ok(await p.locator('#oneBreadcrumb').isVisible(),'Cabeçalho disponível no modo claro');ok(errors.length===0,'Sem erros JavaScript: '+errors.join('; '));
  ok(fs.readFileSync('sw.js','utf8').includes('assets/personal-torque-one.js'),'Camada visual incluída no cache offline');
  console.log('Torque One: '+checks+' verificações passaram.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
