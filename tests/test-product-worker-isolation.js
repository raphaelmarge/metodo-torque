// Real legacy workers, updater and loader; local fixtures for the independent
// products. No customer data, external API, database or production deployment.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const pw=require(process.env.TORQUE_PLAYWRIGHT||'./ci/node_modules/playwright');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const version=read('assets/versao.js').match(/MT_VERSAO\s*=\s*"(mt-v\d+)"/)[1];
let base,offlineOne=false,rpcMode='offline',checks=0;
const same=(a,b)=>{assert.deepEqual(a,b);checks++;};
const oneCache='torque-one:fixture:%2Ftorque-one%2F:portal:precache-test';
const nutriCache='torque-nutri-platform:%2Fnutri%2F:v-fixture';
const retained=['mt-app-'+version,'mt-mapa-v1','mt-visao-v1',oneCache,nutriCache,'unrelated'];
function fixtureWorker(cache,scope){return `const CACHE=${JSON.stringify(cache)};self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.add('${scope}first.html')).then(()=>self.skipWaiting())));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method==='GET'&&u.origin===self.location.origin&&u.pathname.startsWith('${scope}'))e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));});`;}
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,base||'http://127.0.0.1'),p=url.pathname;
 if(offlineOne&&p.startsWith('/torque-one/')){req.socket.destroy();return;}
 res.setHeader('Cache-Control','no-store');
 if(p==='/coexistence-fixture.html'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Legacy fixture</title><main>LEGACY_PAGE</main>');return;}
 if(['/torque-one/first.html','/nutri/first.html','/unrelated/first.html'].includes(p)){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Independent fixture</title><main>'+p+'</main>');return;}
 if(p==='/torque-one/probe.js'){res.setHeader('Content-Type','application/javascript');res.end('ONE_NETWORK_PROBE');return;}
 if(['/torque-one/sw.js','/nutri/fixture-sw.js','/unrelated/sw.js'].includes(p)){
  const scope=p.slice(0,p.lastIndexOf('/')+1),cache=scope==='/torque-one/'?oneCache:scope==='/nutri/'?nutriCache:'unrelated';
  res.setHeader('Content-Type','application/javascript');res.end(fixtureWorker(cache,scope));return;
 }
 if(p==='/assets/cloud-config.js'){res.setHeader('Content-Type','application/javascript');res.end('self.MT_CLOUD='+JSON.stringify({url:base,anonKey:'test-only-public-key'})+';');return;}
 if(p.startsWith('/rest/v1/rpc/')){
  if(rpcMode==='offline'){req.socket.destroy();return;}
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:false,motivo:'revogado'}));return;
 }
 const file=path.resolve(root,'.'+decodeURIComponent(p),p.endsWith('/')?'index.html':'');
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.statusCode=404;res.end();return;}
 const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
 res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
async function register(page,script,scope){
 await page.evaluate(async({script,scope})=>{
  const r=await navigator.serviceWorker.register(script,{scope,updateViaCache:'none'}),w=r.installing||r.waiting||r.active;
  if(w&&w.state!=='activated')await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Worker activation timed out')),25000);
   function changed(){if(w.state==='activated'){clearTimeout(timer);resolve();}else if(w.state==='redundant'){clearTimeout(timer);reject(Error('Worker installation failed'));}}
   w.addEventListener('statechange',changed);changed();
  });
 },{script,scope});
}
async function state(page){return page.evaluate(async()=>({
 scopes:(await navigator.serviceWorker.getRegistrations()).map(r=>new URL(r.scope).pathname).sort(),
 keys:(await caches.keys()).sort(),values:{...localStorage}
}));}
async function run(browser){
 const context=await browser.newContext(),external=[];let page=await context.newPage();
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===base||['data:','blob:'].includes(u.protocol))return route.continue();external.push(u.origin);return route.abort();});
 try{
  offlineOne=false;rpcMode='offline';
  await page.goto(base+'/coexistence-fixture.html');
  await register(page,'/sw.js','/');await page.waitForFunction(()=>navigator.serviceWorker.controller);
  await page.evaluate(async(version)=>{
   const cache=await caches.open('runtime-'+version);
   await cache.put('/torque-one/probe.js',new Response('STALE_ONE_CODE'));
   await cache.put('/torque-one/first.html',new Response('<main>WRONG_LEGACY_FALLBACK</main>',{headers:{'Content-Type':'text/html'}}));
  },version);
  same(await page.evaluate(()=>fetch('/torque-one/probe.js').then(r=>r.text())),'ONE_NETWORK_PROBE');
  await page.goto(base+'/torque-one/first.html');same(await page.locator('main').textContent(),'/torque-one/first.html');
  // No independent worker yet: an unavailable One must fail, never open the
  // portal or stale One content from the root worker's cache.
  offlineOne=true;
  let failed=false;try{await page.goto(base+'/torque-one/first.html?offline-first=1',{timeout:15000});}catch{failed=true;}
  same(failed,true);
  // A rejected navigation can still be committing the browser's own error page.
  // Continue in the same profile, with a fresh tab rather than racing that page.
  await page.close();page=await context.newPage();
  offlineOne=false;await page.goto(base+'/coexistence-fixture.html');
  await register(page,'/app/app-sw.js','/app/');
  await register(page,'/torque-one/sw.js','/torque-one/');
  await register(page,'/nutri/fixture-sw.js','/nutri/');
  await register(page,'/unrelated/sw.js','/unrelated/');
  await page.evaluate(async({version,retained})=>{
   for(const key of [...retained,'precache-mt-v1','runtime-mt-v1']){const c=await caches.open(key);await c.put('/sentinel',new Response(key));}
   localStorage.setItem('mtapp:ptStudio','legacy-studio-fixture');
   localStorage.setItem('ptnutriFila:fixture','[{"id":"queued-fixture"}]');
   localStorage.setItem('torque-one:fixture:queue','one-pending-fixture');
   localStorage.setItem('nutri:fixture:queue','nutri-pending-fixture');
  },{version,retained});
  const before=await state(page);
  await page.addScriptTag({url:base+'/assets/pwa-update.js'});
  await Promise.all([page.waitForNavigation({waitUntil:'load'}),page.evaluate(()=>{void window.MT_ATUALIZA();})]);
  const after=await state(page);
  same(after.scopes,['/app/','/nutri/','/torque-one/','/unrelated/']);
  for(const key of retained)same(after.keys.includes(key),true);
  same(after.keys.some(k=>/^(precache|runtime)-mt-v\d+$/.test(k)),false);
  same(after.values,before.values);
  // The One worker/cache still serves its own page offline after legacy reset.
  offlineOne=true;await page.goto(base+'/torque-one/first.html');
  same(await page.locator('main').textContent(),'/torque-one/first.html');
  same(await page.evaluate(()=>new URL(navigator.serviceWorker.controller.scriptURL).pathname),'/torque-one/sw.js');
  offlineOne=false;await page.goto(base+'/coexistence-fixture.html');
  await register(page,'/sw.js','/');
  await page.evaluate(()=>{
   localStorage.setItem('tq_app_token','fixture-token');
   localStorage.setItem('mt_aluno_token','fixture-token');
   localStorage.setItem('tq_app_pacote',JSON.stringify({html:'<!doctype html><main id="offline-copy">OFFLINE_STUDENT_COPY</main>'}));
   localStorage.setItem('ptpeso','{"test":80}');
  });
  // Actual loader with a failed local RPC keeps its package, queue and workers.
  await page.goto(base+'/app/?t=fixture-token');await page.locator('#offline-copy').waitFor();
  const offline=await state(page);
  same(offline.scopes,['/','/app/','/nutri/','/torque-one/','/unrelated/']);
  same(offline.values['ptnutriFila:fixture'],before.values['ptnutriFila:fixture']);
  same(offline.values.tq_app_token,'fixture-token');
  rpcMode='revoked';await page.goto(base+'/app/?t=fixture-token');
  await page.getByText('Seu acesso foi encerrado por quem cuida do seu treino.').waitFor();
  await page.waitForFunction(async()=>!(await navigator.serviceWorker.getRegistrations()).some(r=>new URL(r.scope).pathname==='/app/'));
  const revoked=await state(page);
  same(revoked.scopes,['/','/nutri/','/torque-one/','/unrelated/']);
  for(const key of ['tq_app_token','mt_aluno_token','tq_app_pacote','ptpeso','ptnutriFila:fixture'])same(key in revoked.values,false);
  for(const key of ['mtapp:ptStudio','torque-one:fixture:queue','nutri:fixture:queue'])same(revoked.values[key],before.values[key]);
  for(const key of [oneCache,nutriCache,'unrelated','mt-mapa-v1','mt-visao-v1'])same(revoked.keys.includes(key),true);
  same(revoked.keys.some(k=>k.startsWith('mt-app-')),false);
  same(external,[]);
 }finally{await context.close();}
}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
 for(const name of (process.env.TORQUE_UPDATE_BROWSER||'chromium,webkit').split(',')){
  const browser=await pw[name].launch({headless:true,...(name==='chromium'&&process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  try{await run(browser);console.log('OK '+name+': convivência, primeira visita, atualização e revogação isoladas.');}finally{await browser.close();}
 }
 console.log(checks+' verificações passaram; somente servidor e dados locais fictícios.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
