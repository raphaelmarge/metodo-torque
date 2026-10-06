/* Demo e produção continuam distintas; somente fixtures e transporte sintético.
 * Regressão visual do cartão de retomada nos temas e larguras suportados. */
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { chromium } = require(process.env.TORQUE_PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE_URL || process.env.MT_BASE || 'http://127.0.0.1:8765';
const ORIGIN = new URL(BASE).origin, API = 'https://nutri-status.invalid';
global.self = global; global.MT_CLOUD = { url: API, anonKey: 'somente-fixture' };
require('../assets/nutricao-core.js'); require('../app/aluno-skin.js'); require('../app/aluno-builder.js');
const D = { a: { id: 'status-fixture', nome: 'Aluno fictício', appTokenP: 'token-ficticio' }, studio: 'Studio de teste',
  COR:'#7c3aed',COR2:'#5925ba',CORC:'#b395ff',CORE:'#33155c',CORCL1:'#d6c4ff',CORCL2:'#e8ddff',
  PAL:['#0d0c10','#111015','#15131b','#191621','#211d2a','#272231','#2c2639','#342d42','#3b334b','#443a54','#4d425f','#574b6c','#62557a'],
  fichasApp:[{titulo:'Ficha de teste',itens:[{nome:'Movimento fictício',series:1,reps:'8',descanso:30}]}],
  guiaFichasP:[{n:'Ficha de teste',it:[{e:'Movimento fictício',s:1,r:'8',d:30}]}],fexs:[{n:'Movimento fictício',s:1}],
  wodsApp:[],cardiosApp:[],sessApp:[],
  nutricaoApp:{v:1,id:'plano-teste',ativo:true,titulo:'Plano fictício',refeicoes:[{id:'refeicao',titulo:'Refeição teste',hora:'12:30',
    itens:[{id:'alimento',nome:'Alimento fictício',porcao:'porção',qtd:1,k:1,pt:1,cb:1,g:1}]}]} };
let checks = 0;
function ok(value, label) { assert.ok(value, label); checks++; console.log('OK ' + label); }
async function fixture(browser, demo) {
  const ctx = await browser.newContext({ viewport:{width:390,height:900}, timezoneId:'America/Sao_Paulo', serviceWorkers:'block' });
  const state = { fail:false, calls:[], records:{}, external:[], errors:[] };
  let finishInitialRead;
  state.initialRead = new Promise(resolve=>{finishInitialRead=resolve;});
  let html = MT_APP_ALUNO.monta(D);
  if (demo) html = html.replace(/localStorage/g,'__demoLS').replace('<head>', '<head>' +
    fs.readFileSync(path.join(__dirname,'../tools/demo-aluno/demo-bloco.html'),'utf8'));
  await ctx.addInitScript(() => { localStorage.setItem('pttour','{"como":"teste"}'); localStorage.setItem('ptonb','{"feito":true}'); });
  await ctx.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === ORIGIN && url.pathname === '/teste.html') return route.fulfill({contentType:'text/html',body:html});
    if (url.origin !== API) { state.external.push(url.origin+url.pathname); return route.abort(); }
    const fn = url.pathname.split('/').pop(), body = route.request().postDataJSON(); state.calls.push(fn);
    let value = {ok:true};
    if (fn === 'app_nutricao_estado') value = {ok:true,nutricao:{v:1,registros:state.records}};
    if (fn === 'app_nutricao_salva') {
      if (state.retryGate) await state.retryGate;
      if (state.fail) value = {erro:'Falha fictícia'};
      else { for (const r of body.p_registros) state.records[r.id]=r; value={ok:true,nutricao:{v:1,registros:state.records}}; }
    }
    if (fn === 'app_treino_eventos_lista') value = {ok:true,eventos:[],cursor:'0',mais:false};
    if (fn === 'app_treino_eventos_grava') value = {ok:true,ids:body.p_eventos.map(e=>e.id)};
    if (fn === 'app_agenda_lista' || fn === 'app_chat_lista') value = [];
    if (fn === 'app_aluno_busca') value = null;
    await route.fulfill({contentType:'application/json',body:JSON.stringify(value)});
    if (fn === 'app_nutricao_estado') finishInitialRead();
  });
  const p = await ctx.newPage(); p.on('pageerror',e=>state.errors.push(e.message));
  await p.clock.setFixedTime(new Date('2026-10-06T12:00:00Z'));
  await p.goto(ORIGIN+'/teste.html');
  await p.waitForFunction(()=>window.__nutriAluno && window.__treinoHistorico.ready());
  await p.locator('#navApp [data-msec=alimentacao]').click();
  return {ctx,p,state};
}
async function measureContrast(p) {
  return p.locator('#acRetomar').evaluate(el=>{
    const luminance = color => { const v=color.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;});return .2126*v[0]+.7152*v[1]+.0722*v[2]; };
    const bg=getComputedStyle(el).backgroundColor, b=luminance(bg);
    const colors=['b','span'].map(selector=>getComputedStyle(el.querySelector(selector)).color);
    return {background:bg,colors,ratios:colors.map(color=>{const a=luminance(color);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);})};
  });
}
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
  try {
    const real=await fixture(browser,false);
    try {
      // Consumir a consulta automática de 1200 ms antes de criar uma pendência.
      // Um evento online adicional deixava a consulta original competir com a retentativa.
      await new Promise((resolve,reject)=>{
        const timeout=setTimeout(()=>reject(Error('Consulta inicial não respondeu.')),10000);
        real.state.initialRead.then(()=>{clearTimeout(timeout);resolve();});
      });
      await real.p.waitForFunction(()=>document.getElementById('ntpSync').textContent==='Alimentação sincronizada.');
      ok(real.state.calls.includes('app_nutricao_estado'),'produção mantém confirmação após resposta real do contrato, aqui simulada');
      real.state.fail=true; await real.p.locator('[data-ntp-comi="refeicao"]').click();
      // Deixar o debounce real de 700 ms tentar uma única vez; chamar sync() aqui
      // não cancelava esse timer e criava uma segunda tentativa concorrente.
      await real.p.waitForFunction(()=>document.getElementById('ntpSync').textContent.includes('Falha fictícia'));
      ok((await real.p.locator('#ntpSync').innerText()).includes('aguardando envio'),'falha real mantém registro pendente e não informa simulação ou sucesso');
      ok(await real.p.locator('#ntpTentar').isVisible(),'produção oferece retentativa quando o envio falha');
      ok(await real.p.evaluate(()=>Object.keys(__nutriAluno.estado().registros).length===1),'falha de envio preserva a refeição no aparelho');
      const beforeRetry=real.state.calls.filter(fn=>fn==='app_nutricao_salva').length;
      ok(beforeRetry===1,'falha veio de uma única tentativa automática já encerrada');
      await real.p.evaluate(()=>document.getElementById('ntpTentar').addEventListener('click',e=>{
        window.__trustedRetryClick=e.isTrusted;
      },{once:true}));
      real.state.retryGate=new Promise(resolve=>{real.state.releaseRetry=resolve;});
      real.state.fail=false;
      await Promise.all([real.p.waitForRequest(r=>r.url().endsWith('/app_nutricao_salva')),
        real.p.locator('#ntpTentar').click()]);
      ok(await real.p.evaluate(()=>window.__trustedRetryClick===true) &&
        real.state.calls.filter(fn=>fn==='app_nutricao_salva').length===beforeRetry+1,
        'clique real do usuário iniciou exatamente a próxima tentativa');
      ok(await real.p.locator('#ntpTentar').isDisabled() && Object.keys(real.state.records).length===0,
        'resposta controlada mantém envio em andamento sem fabricar confirmação');
      real.state.releaseRetry();
      await real.p.waitForFunction(()=>document.getElementById('ntpSync').textContent==='Alimentação sincronizada.');
      ok(Object.keys(real.state.records).length===1,'retentativa confirma o mesmo registro no servidor simulado');
      ok(!await real.p.locator('#ntpTentar').isVisible(),'confirmação real oculta retentativa sem negar o sucesso');
      ok(real.state.errors.length===0,'produção sintética sem erro JavaScript');
    } finally { if(real.state.releaseRetry)real.state.releaseRetry(); await real.ctx.close(); }
    const demo=await fixture(browser,true);
    try {
      ok(/Demonstração.*simulada.*sem envio ao personal/.test(await demo.p.locator('#ntpSync').innerText()),'demo informa simulação na alimentação');
      await demo.p.locator('[data-ntp-comi="refeicao"]').click(); await demo.p.evaluate(()=>window.__nutriAluno.sync());
      ok(/Demonstração.*simulada/.test(await demo.p.locator('#ntpSync').innerText()),'registro demonstrativo não passa a afirmar sincronização real');
      ok(!await demo.p.locator('#ntpTentar').isVisible(),'demo não oferece envio real inexistente');
      ok(!demo.state.calls.some(fn=>/^app_nutricao_/.test(fn)),'alimentação da demo não alcança nenhuma RPC real');
      await demo.p.locator('#navApp [data-msec=treino]').click();
      const ficha=demo.p.locator('details[data-fi="0"]');if(!await ficha.evaluate(el=>el.open))await ficha.locator(':scope>summary').click();
      await demo.p.locator('.guiabtn[data-g="0"]').click();await demo.p.locator('#guiaBox').waitFor({state:'visible'});
      await demo.p.locator('#gFechar').click();await demo.p.locator('#guiaBox').waitFor({state:'hidden'});
      for(const width of [320,390,768,1440])for(const theme of ['escuro','claro']){
        await demo.p.setViewportSize({width,height:900});
        await demo.p.evaluate(theme=>{__demoLS.setItem('pttema',theme==='claro'?'1':'0');__temaApp();},theme);
        await demo.p.locator('#navApp [data-msec=treino]').click();
        ok(await demo.p.locator('#acRetomar').isVisible(),width+' '+theme+': retomada continua disponível');
        const c=await measureContrast(demo.p);
        ok(c.ratios.every(r=>r>=4.5),width+' '+theme+': contraste título/descrição '+c.ratios.map(r=>r.toFixed(2)).join('/')+':1');
        ok(await demo.p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),width+' '+theme+': ajuste preserva largura da tela');
        if(process.env.EVIDENCE_DIR){fs.mkdirSync(process.env.EVIDENCE_DIR,{recursive:true});await demo.p.screenshot({path:path.join(process.env.EVIDENCE_DIR,width+'-'+theme+'-retomada.png'),animations:'disabled'});}
      }
      ok(demo.state.errors.length===0,'demo sintética sem erro JavaScript');
    } finally { await demo.ctx.close(); }
    console.log(checks+' verificações aprovadas; sem contas ou transporte externo.');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
