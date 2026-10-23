// Actual browser lifecycle, with the published v14 worker as the old client.
// No backend, account, permission prompt or external network is used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const pw = require(process.env.TORQUE_PLAYWRIGHT || './ci/node_modules/playwright');
const root = path.resolve(__dirname, '..');
// Bind the test environment's local host, with an isolated ephemeral port.
const fixtureHost=new URL(process.env.BASE_URL||'http://127.0.0.1').hostname;
assert(['127.0.0.1','localhost'].includes(fixtureHost),'Use a local test server.');
const legacy = fs.readFileSync(path.join(__dirname, 'fixtures/nutri-sw-v14.js'), 'utf8');
const current = fs.readFileSync(path.join(root, 'nutri/sw.js'), 'utf8');
const prefix = 'torque-nutri-platform:%2Fnutri%2F:';
const user = '00000000-0000-4000-8000-000000000001';
const types = {'.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml'};
let upgraded = false, broken = false, unavailable = false;
const server = http.createServer((req, res) => {
  if(unavailable){req.socket.destroy();return;}
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/nutri/upgrade-fixture.html') {
    res.setHeader('Content-Type', 'text/html');
    return res.end('<!doctype html><meta charset="utf-8"><title>Atualização sintética</title><textarea id="draft">rascunho não salvo</textarea>');
  }
  if (url.pathname === '/nutri/sw.js') {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(upgraded ? current : legacy);
  }
  if (upgraded && broken && url.pathname === '/nutri/day-summary.js') { res.statusCode = 503; return res.end('install interrupted'); }
  const file = path.resolve(root, '.' + decodeURIComponent(url.pathname), url.pathname.endsWith('/') ? 'index.html' : '');
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  // The upgrade must revalidate even when old HTTP cache entries are fresh.
  res.setHeader('Cache-Control', 'public, max-age=86400');
  fs.createReadStream(file).pipe(res);
});
async function scenario(browser, base, failInstall) {
  upgraded = false; broken = failInstall; unavailable = false;
  const context = await browser.newContext();
  // This fixture has no OS push service or subscription. WebKitGTK exposes
  // PushManager but its getSubscription can stay pending without that service.
  // Worker install/cache/messaging and account binding remain real.
  await context.addInitScript(()=>{if(globalThis.PushManager)Object.defineProperty(PushManager.prototype,'getSubscription',{configurable:true,value:async()=>null});});
  try {
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '/nutri/upgrade-fixture.html');
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/nutri/sw.js');
      await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await page.evaluate(async (id) => {
      window.originalDocument = document;
      window.draft = {note:'sem perder a edição'};
      localStorage.setItem('torque-nutri-queue:' + id, '[{"operationId":"pending"}]');
      for (const key of ['mt-app-mt-v865', 'precache-mt-v865', 'mt-mapa-v1', 'mt-visao-v1']) {
        const cache = await caches.open(key); await cache.put('/sentinel', new Response(key));
      }
      window.module = await import('/nutri/reminders.js');
      const state = {demo:false,role:'patient',user:{id},clinic:{id:'synthetic'},patients:[{id:'patient',user_id:id}]};
      window.controller = module.createReminderController({state:()=>state,database:()=>null,workerReady:()=>window.updating});
      await controller.setContext(); // v14 has no protocol and no push subscription.
      await controller.clearDevice(); // legacy logout must not report a false revocation failure.
      await controller.setContext();
      navigator.serviceWorker.addEventListener('controllerchange', () => controller.rebind().catch(()=>{}));
    }, user);
    upgraded = true;
    await page.evaluate(async () => {
      window.updating = module.registerReminderWorker(new URL('/nutri/', location.href));
      await updating;
      await controller.rebind();
    });
    const result = await page.evaluate(async (id) => ({
      sameDocument:originalDocument===document, draft:window.draft.note,
      field:document.querySelector('#draft').value,
      queue:localStorage.getItem('torque-nutri-queue:'+id), keys:await caches.keys()
    }), user);
    assert.equal(result.sameDocument, true); assert.equal(result.draft, 'sem perder a edição');
    assert.equal(result.field, 'rascunho não salvo'); assert.match(result.queue, /pending/);
    for (const key of ['mt-app-mt-v865', 'precache-mt-v865', 'mt-mapa-v1', 'mt-visao-v1']) assert(result.keys.includes(key), key);
    if (failInstall) {
      assert(result.keys.includes(prefix+'v14'), 'failed install retains the old working cache');
      assert.equal(await page.evaluate(async () => {
        const reg=await navigator.serviceWorker.getRegistration();
        return reg.active.state;
      }), 'activated');
    } else {
      assert(!result.keys.includes(prefix+'v14'));
      assert(result.keys.includes(prefix+'v21'));
      const binding = await page.evaluate(() => new Promise((resolve,reject) => {
        const open=indexedDB.open('torque-nutri-push:/nutri/',1);
        open.onerror=()=>reject(open.error);
        open.onsuccess=()=>{const db=open.result,tx=db.transaction('account'),req=tx.objectStore('account').get('active');req.onsuccess=()=>resolve(req.result);tx.oncomplete=()=>db.close();};
      }));
      assert.equal(binding, user, 'activated worker receives the current account');
      // Playwright 1.63 WebKit kills SW responses with setOffline(true)
      // (microsoft/playwright#42775). A real origin outage exercises fallback.
      unavailable=true;
      assert(await page.evaluate(()=>fetch('/uncached-network-probe',{cache:'no-store'}).then(()=>false,()=>true)),'origin is unreachable');
      for (const file of ['app.js','patient-food-choices.js','patient-experience.js','food-journal.js','recipe-composition.js','shopping-planner.js','day-summary.js','reminders.js','food-catalog-data.js','food-measures.js','food-catalog.js','food-substitutions.js','food-substitution-ui.js','food-catalog.css','data/taco.json','data/openfoodfacts.json','data/README.md']) {
        assert(await page.evaluate(async file => (await fetch('/nutri/'+file)).ok, file), file+' works offline');
      }
    }
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
}
(async () => {
  await new Promise(resolve=>server.listen(0,fixtureHost,resolve));
  const base='http://'+fixtureHost+':'+server.address().port;
  // CI installs both engines. Local diagnostic runs can explicitly select one.
  for (const name of (process.env.TORQUE_UPDATE_BROWSER || 'chromium,webkit').split(',')) {
    const browser=await pw[name].launch({headless:true,...(name==='chromium'&&process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
    try {
      await scenario(browser,base,false);
      console.log('OK '+name+': v14 → v21 sem reload, vínculo/rascunho/fila preservados, catálogo e medidas offline, caches isolados');
      await scenario(browser,base,true);
      console.log('OK '+name+': instalação interrompida mantém a versão anterior utilizável');
    } finally { await browser.close(); }
  }
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
