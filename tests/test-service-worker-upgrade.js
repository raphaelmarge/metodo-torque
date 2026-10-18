// Actual sequential release updates in Chromium and WebKit, without clearing
// storage. Exercises the workers themselves, not a copy of their cache logic.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const pw=require(process.env.TORQUE_PLAYWRIGHT||'./ci/node_modules/playwright');
const root=path.resolve(__dirname,'..');
// Bind the test environment's local host, with an isolated ephemeral port.
const fixtureHost=new URL(process.env.BASE_URL||'http://127.0.0.1').hostname;
assert(['127.0.0.1','localhost'].includes(fixtureHost),'Use a local test server.');
const previous={portal:fs.readFileSync(path.join(__dirname,'fixtures/portal-sw-v865.js'),'utf8'),aluno:fs.readFileSync(path.join(__dirname,'fixtures/aluno-sw-v865.js'),'utf8')};
const latest={portal:fs.readFileSync(path.join(root,'sw.js'),'utf8'),aluno:fs.readFileSync(path.join(root,'app/app-sw.js'),'utf8')};
const version=fs.readFileSync(path.join(root,'assets/versao.js'),'utf8').match(/mt-v(\d+)/)[1];
assert(Number(version)>866,'integration must not reuse mt-v866');
let phase=865,broken=false,attempt=0;
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost'),p=url.pathname;
 if(p.endsWith('/upgrade-fixture.html')){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><meta charset="utf-8"><title>Upgrade</title><input id="draft" value="edição pendente">');}
 if(p==='/sw.js'||p==='/app/app-sw.js'){
  const product=p==='/sw.js'?'portal':'aluno';res.setHeader('Content-Type','application/javascript');res.setHeader('Cache-Control','no-store');
  return res.end((phase===Number(version)?latest[product]:previous[product].replaceAll('mt-v865','mt-v'+phase))+'\n// install attempt '+attempt);
 }
 if(broken&&p==='/app/tecnica-video.js'){res.statusCode=503;return res.end('interrupted install');}
 const file=path.resolve(root,'.'+decodeURIComponent(p),p.endsWith('/')?'index.html':'');
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.statusCode=404;return res.end();}
 res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','public, max-age=86400');
 if(p==='/app/aluno-builder.js')return res.end('/* release '+phase+' */\n'+fs.readFileSync(file,'utf8'));
 fs.createReadStream(file).pipe(res);
});
async function update(page,script){
 await page.evaluate(async script=>{
  const reg=await navigator.serviceWorker.register(script,{updateViaCache:'none'});
  await reg.update();
  const worker=reg.installing||reg.waiting||reg.active;
  if(worker&&!['activated','redundant'].includes(worker.state))await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{worker.removeEventListener('statechange',changed);reject(Error('worker lifecycle timed out'));},20000);
   function changed(){if(['activated','redundant'].includes(worker.state)){clearTimeout(timer);worker.removeEventListener('statechange',changed);resolve();}}
   worker.addEventListener('statechange',changed);changed();
  });
 },script);
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
}
async function run(browser,base,product,direct=false){
 phase=865;broken=false;attempt++;
 const context=await browser.newContext(),page=await context.newPage();
 const prefix=product==='portal'?'precache-mt-v':'mt-app-mt-v',script=product==='portal'?'/sw.js':'/app/app-sw.js';
 try{
  await page.goto(base+(product==='portal'?'':'/app')+'/upgrade-fixture.html');
  await page.evaluate(async()=>{
   window.originalDocument=document;
   localStorage.setItem('tq_app_pacote',JSON.stringify({html:'legacy fallback',dados:{a:{id:'synthetic'},fichasApp:[]},ver:'mt-v865',stamp:'old'}));
   localStorage.setItem('ptnutriFila:synthetic','[{"id":"queued"}]');
   for(const key of ['mt-mapa-v1','mt-visao-v1','torque-nutri-platform:%2Fnutri%2F:v17','unrelated']){
    const cache=await caches.open(key);await cache.put('/sentinel',new Response(key));
   }
  });
  await update(page,script);
  let prior=865;
  for(const next of (direct?[Number(version)]:[866,Number(version)])){
   phase=next;attempt++;
   if(next===Number(version)){
    broken=true;
    await update(page,script).catch(error=>{if(!/ServiceWorker|service worker|Failed to update/.test(error.message))throw error;});
    assert((await page.evaluate(()=>caches.keys())).includes(prefix+prior),'failed installation keeps previous precache');
    broken=false;attempt++;
   }
   await update(page,script);
   const keys=await page.evaluate(()=>caches.keys());
   assert(keys.includes(prefix+next));assert(!keys.includes(prefix+prior));prior=next;
   if(next===866&&product==='portal')await page.evaluate(async()=>{
    const old=await caches.open('runtime-mt-v866');await old.put('/app/aluno-builder.js',new Response('STALE_RUNTIME_866'));
   });
  }
  const data=await page.evaluate(async()=>({same:document===originalDocument,draft:document.querySelector('#draft').value,package:localStorage.getItem('tq_app_pacote'),queue:localStorage.getItem('ptnutriFila:synthetic'),keys:await caches.keys()}));
  assert(data.same);assert.equal(data.draft,'edição pendente');assert.match(data.package,/legacy fallback/);assert.match(data.queue,/queued/);
  assert(!data.keys.includes('runtime-mt-v866'));
  for(const key of ['mt-mapa-v1','mt-visao-v1','torque-nutri-platform:%2Fnutri%2F:v17','unrelated'])assert(data.keys.includes(key),key);
  await context.setOffline(true);
  const builder=await page.evaluate(async()=>await (await fetch('/app/aluno-builder.js')).text());
  assert(builder.startsWith('/* release '+version+' */'),'new precache wins over old runtime offline');
  const modules=['/app/evolucao-style.js','/app/tecnica-video.js','/app/treino-evolucao.js','/app/nutricao-semana.js','/assets/corrida-analise.js','/app/corrida-export.js','/app/saude-conexoes.js'];
  if(product==='portal')modules.push('/assets/personal-treino-evolucao.js','/assets/personal-treino-evolucao.css','/assets/jornadas-core.js','/assets/personal-jornadas.js','/assets/personal-jornadas.css','/assets/personal-tecnica-video.js','/app/tecnica-video.css');
  for(const file of modules)assert(await page.evaluate(async file=>(await fetch(file)).ok,file),file+' offline');
 }finally{await context.close();}
}
(async()=>{
 await new Promise(resolve=>server.listen(0,fixtureHost,resolve));const base='http://'+fixtureHost+':'+server.address().port;
 for(const name of (process.env.TORQUE_UPDATE_BROWSER||'chromium,webkit').split(',')){
  const browser=await pw[name].launch({headless:true,...(name==='chromium'&&process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  try{for(const product of ['portal','aluno']){await run(browser,base,product);await run(browser,base,product,true);console.log('OK '+name+' '+product+': 865 → 866 → '+version+' e 865 → '+version+', falha de instalação, recursos offline e dados preservados');}}finally{await browser.close();}
 }
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
