/* Concessão assíncrona, substituição pelo loader e descarte antes do lock. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(process.env.TORQUE_PLAYWRIGHT||'playwright');
const BASE=process.env.BASE_URL||'http://127.0.0.1:8765';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 try{
  const ctx=await browser.newContext({serviceWorkers:'block'});
  await ctx.route('**/*',r=>r.request().url()===BASE+'/lease-fixture'?r.fulfill({contentType:'text/html',body:'<!doctype html><p id="thStatus"></p>'}):r.abort());
  for(const name of ['core','player'])await ctx.addInitScript({content:fs.readFileSync(__dirname+'/../app/treino-historico-'+name+'.js','utf8')});
  const p=await ctx.newPage();await p.goto(BASE+'/lease-fixture');
  await p.evaluate(()=>{
   window.config={storage:localStorage,scope:'lease-test',active:()=>true,today:()=> '2026-05-05'};
   // Hold delivery of the initial lock callback, without granting any writer.
   window.realRequest=navigator.locks.request.bind(navigator.locks);
   navigator.locks.request=(name,opts,cb)=>new Promise(resolve=>{window.deliver=()=>resolve(realRequest(name,opts,cb));});
   window.bridge=MT_TREINO_HISTORICO_PLAYER.create(config);
  });
  assert.equal(await p.evaluate(()=>bridge.begin('corrida','pending','2026-05-05',{},false)),false);
  assert.equal(await p.locator('#thStatus').textContent(),'Preparando o histórico. Aguarde um instante antes de iniciar.');
  assert.deepEqual(await p.evaluate(()=>bridge.list()),[]);
  await p.evaluate(()=>{navigator.locks.request=realRequest;deliver();});await p.waitForFunction(()=>bridge.ready());
  assert.equal(await p.evaluate(()=>bridge.begin('corrida','accepted','2026-05-05',{km:5},false)),true);
  // Same-window document replacement must release the old journal lease.
  await p.evaluate(()=>{window.oldBridge=bridge;config.waitFor=bridge.dispose();document.open();document.write('<!doctype html><p id="thStatus"></p>');document.close();window.bridge=MT_TREINO_HISTORICO_PLAYER.create(config);});
  await p.waitForFunction(()=>bridge.ready());
  assert.equal(await p.evaluate(()=>oldBridge.begin('corrida','old-writer','2026-05-05',{},false)),false);
  assert.equal(await p.evaluate(()=>bridge.list().length),1);
  assert.equal(await p.locator('#thStatus').textContent(),'Histórico salvo neste aparelho.');
  assert.equal(await p.evaluate(()=>bridge.begin('circuito','new-writer','2026-05-05',{rounds:3},false)),true);
  // Disposal while acquisition is pending cannot resurrect the old writer.
  await p.evaluate(()=>{
   config.waitFor=bridge.dispose();navigator.locks.request=(name,opts,cb)=>new Promise(resolve=>{window.deliver=()=>resolve(realRequest(name,opts,cb));});
   window.abandoned=MT_TREINO_HISTORICO_PLAYER.create({...config,waitFor:null});config.waitFor=abandoned.dispose();navigator.locks.request=realRequest;deliver();
   window.bridge=MT_TREINO_HISTORICO_PLAYER.create(config);
  });
  await p.waitForFunction(()=>bridge.ready());
  assert.equal(await p.evaluate(()=>abandoned.ready()),false);
  assert.deepEqual(await p.evaluate(()=>bridge.list().map(s=>s.id).sort()),['accepted','new-writer']);
  assert.equal((await p.evaluate(()=>navigator.locks.query())).held.length,1);
  await p.evaluate(()=>{bridge.dispose();navigator.locks.request=(name,opts,cb)=>new Promise(resolve=>{window.deliver=()=>resolve(realRequest(name,opts,cb));});window.bridge=MT_TREINO_HISTORICO_PLAYER.create({...config,waitFor:null});window.dispatchEvent(new PageTransitionEvent('pagehide'));navigator.locks.request=realRequest;deliver();});
  await p.waitForFunction(async()=>(await navigator.locks.query()).held.length===0);
  assert.equal(await p.evaluate(()=>bridge.ready()),false);
  await p.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow')));await p.waitForFunction(()=>bridge.ready());
  assert.equal(await p.evaluate(()=>bridge.list().length),2);
  await ctx.close();console.log('13 verificações de concessão e substituição do documento passaram.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
