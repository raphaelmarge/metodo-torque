/* Resumo novo: dados reais, carga zero, anotações/futuro e acesso por perfil. */
const assert = require('node:assert/strict');
const {chromium} = require('./ci/node_modules/playwright');
const {dados} = require('./test-aluno-player-experiencia');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765';
global.self=global;
require('../app/aluno-skin'); require('../app/aluno-builder');
function date(offset) { const d=new Date();d.setDate(d.getDate()+offset);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/opt/pw-browsers/chromium',args:['--no-sandbox']});
  try {
    const c=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
    await c.route('**/*',r=>r.request().url().startsWith(BASE)?r.continue():r.abort());
    const html=global.MT_APP_ALUNO.monta(dados());
    await c.route(BASE+'/experiencia-test.html',r=>r.fulfill({contentType:'text/html',body:html}));
    const init={pttour:{como:'teste'},ptonb:{feito:true},ptfeitos:{[date(-14)]:true,[date(0)]:true,[date(1)]:true,[date(-1)]:false},ptdc:{'Agachamento do teste':[
      {d:date(-14),i:'0:0:0',g:2,feito:true,kg:0,r:10},
      {d:date(0),i:'0:0',kg:200,r:10}, // substituído pelas séries detalhadas
      {d:date(0),i:'0:0:0',g:2,feito:true,kg:15,r:10},
      {d:date(0),i:'0:0:1',g:2,feito:false,kg:800,r:10},
      {d:date(1),i:'0:0:0',g:2,feito:true,kg:999,r:10}
    ]}};
    await c.addInitScript(init=>{for(const [k,v] of Object.entries(init))localStorage.setItem(k,JSON.stringify(v));},init);
    const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
    await p.goto(BASE+'/experiencia-test.html');await p.waitForFunction(()=>window.__evPanorama);
    await p.evaluate(()=>__trocaSec('evolucao'));await p.locator('#evPanorama').waitFor({state:'visible'});
    assert.equal(await p.locator('#evPanoramaStats strong').first().textContent(),'2');
    assert.match(await p.locator('.ev-load-row').textContent(),/0 → 15 kg\+15 kg/);
    const before=await p.evaluate(()=>JSON.stringify([L('ptdc',{}),L('ptfeitos',{}),L('ptconf',{})]));
    await p.click('[data-ev-period="7"]');
    assert.equal(await p.locator('#evPanoramaStats strong').first().textContent(),'1');
    assert.equal(await p.locator('.ev-load-row').count(),0);
    await p.click('[data-ev-period="90"]');
    assert.match(await p.locator('.ev-load-row').textContent(),/0 → 15 kg/);
    assert.equal(await p.evaluate(()=>JSON.stringify([L('ptdc',{}),L('ptfeitos',{}),L('ptconf',{})])),before);
    await p.click('#evPanoramaLoads');assert.equal(await p.locator('#evCargas').isVisible(),true);
    assert.deepEqual(errors,[]);
    await p.goto(BASE+'/entrar.html');await p.check('[value="profissional"]');
    assert.equal(await p.locator('#professionalFields').isVisible(),true);
    await p.selectOption('#product','personal');await p.click('.continue');await p.waitForURL(BASE+'/personal.html');
    await p.goto(BASE+'/entrar.html');await p.click('.continue');await p.waitForURL(BASE+'/aluno-login.html');
    await c.close();console.log('PASSOU: resumo preserva zeros, conclusões, período e leitura sem gravações; acesso chega ao perfil escolhido.');
  } finally {await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
