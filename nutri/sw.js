const BASE = new URL('./', self.location.href);
const CACHE_PREFIX = 'torque-nutri-platform:' + encodeURIComponent(BASE.pathname) + ':';
const CACHE = CACHE_PREFIX + 'v16';
const FILES = ['./', 'index.html', 'demo-paciente.html', 'demo-nutricionista.html', 'app.js', 'platform.js', 'prescription.js', 'shopping.js', 'shopping-planner.js', 'day-summary.js', 'plan-changes.js', 'recipe-composition.js', 'reminders.js', 'reminder-settings.js', 'consultation.js', 'settings.js', 'follow-up.js', 'follow-up.css', 'meal-plan.css', 'prescription-workspace.css', 'finance.js', 'assessment.js', 'skinfolds.js', 'schedule.js', 'notifications.js', 'patient-experience.js', 'care-progress.js', 'journal-model.js', 'food-journal.js', 'plan-recipes.js', 'patient.css', 'vendor/medalha-visual.js', 'assets/nutrition-cover.png', 'style.css', 'config.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'vendor/supabase.js', 'vendor/nutricao-core.js', 'vendor/medalhas-core.js', 'vendor/identidade-marca.js', 'vendor/alimentos-db.js', 'vendor/receitas-db.js', 'vendor/composicao-corporal.js', 'assets/fonts/archivo.css', 'assets/fonts/files/archivo-latin-600-normal.woff2', 'assets/fonts/files/archivo-latin-700-normal.woff2', 'assets/fonts/files/archivo-latin-800-normal.woff2', 'assets/fonts/files/archivo-latin-500-normal.woff2', 'assets/fonts/files/archivo-latin-400-normal.woff2', 'assets/fonts/files/archivo-latin-ext-700-normal.woff2', 'assets/fonts/files/archivo-latin-ext-800-normal.woff2', 'assets/fonts/files/archivo-vietnamese-400-normal.woff2', 'assets/fonts/files/archivo-vietnamese-500-normal.woff2', 'assets/fonts/files/archivo-latin-ext-600-normal.woff2', 'assets/fonts/files/archivo-latin-ext-400-normal.woff2', 'assets/fonts/files/archivo-vietnamese-800-normal.woff2', 'assets/fonts/files/archivo-vietnamese-700-normal.woff2', 'assets/fonts/files/archivo-vietnamese-600-normal.woff2', 'assets/fonts/files/archivo-latin-ext-500-normal.woff2'];
const STATIC_URLS = new Set(FILES.map(file => new URL(file, BASE).href));
const INDEX_URL = new URL('index.html', BASE).href;

// The persisted binding is local to this worker scope. A queued push from a
// previous account is discarded even after the browser has been closed.
function reminderAccount(value,write=false){return new Promise((resolve,reject)=>{
 const request=indexedDB.open('torque-nutri-push:'+BASE.pathname,1);
 request.onupgradeneeded=()=>request.result.createObjectStore('account');
 request.onerror=()=>reject(request.error);
 request.onsuccess=()=>{const db=request.result,tx=db.transaction('account',write?'readwrite':'readonly'),store=tx.objectStore('account'),op=write?store.put(value,'active'):store.get('active');let result=null;op.onsuccess=()=>{result=op.result;};tx.oncomplete=()=>{db.close();resolve(result);};tx.onerror=()=>{db.close();reject(tx.error);};};
});}
self.addEventListener('message',event=>{
 if(event.data?.type!=='NUTRI_REMINDER_ACCOUNT')return;
 const userId=event.data.userId;
 if(userId!==null&&!/^[0-9a-f-]{36}$/i.test(userId||''))return;
 event.waitUntil((async()=>{
  const source=event.source?.id?await self.clients.get(event.source.id):null;
  if(!source||new URL(source.url).origin!==BASE.origin||!new URL(source.url).pathname.startsWith(BASE.pathname))throw Error('Invalid client');
  await reminderAccount(userId,true);
  for(const notification of await self.registration.getNotifications())if(notification.data?.userId!==userId)notification.close();
  event.ports[0]?.postMessage({ok:true});
 })().catch(()=>event.ports[0]?.postMessage({ok:false})));
});
self.addEventListener('push',event=>{
 event.waitUntil((async()=>{
  let data;try{data=event.data?.json();}catch{return;}
  if(!data||!['appointment','questionnaire'].includes(data.kind)||!data.userId||!data.tag)return;
  if(await reminderAccount()!==data.userId)return;
  await self.registration.showNotification('Torque Nutri',{body:data.kind==='appointment'?'Você tem um compromisso próximo. Abra o app para conferir.':'Há um lembrete para você. Abra o app para conferir.',icon:new URL('icon-192.png',BASE).href,badge:new URL('icon-192.png',BASE).href,tag:String(data.tag).slice(0,100),renotify:false,data:{userId:data.userId,page:data.kind==='appointment'?'booking':'forms'}});
  // A logout may finish while showNotification is waiting on the OS. Recheck
  // after display and close only this previous account's notification.
  if(await reminderAccount()!==data.userId)for(const notification of await self.registration.getNotifications({tag:String(data.tag).slice(0,100)}))if(notification.data?.userId===data.userId)notification.close();
 })().catch(()=>{}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();event.waitUntil((async()=>{
  const data=event.notification.data;if(await reminderAccount()!==data?.userId)return;
  const url=new URL('index.html',BASE);url.searchParams.set('reminder',data.page==='booking'?'booking':'forms');
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:false});
  for(const client of clients){if(new URL(client.url).pathname.startsWith(BASE.pathname)){await client.navigate(url.href);await client.focus();return;}}
  await self.clients.openWindow(url.href);
 })());
});

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll([...STATIC_URLS])));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;
  // Only public app files are cached. API calls and other Torque applications pass through.
  const cacheKey = new URL(url.pathname, BASE.origin).href;
  if (!STATIC_URLS.has(cacheKey)) return;
  event.respondWith(fetch(request).then(response => {
    const responseURL = response.url ? new URL(response.url) : url;
    const responseKey = new URL(responseURL.pathname, responseURL.origin).href;
    // Auth links may carry private codes in Response.url; never persist those responses.
    if (response.ok && !url.search && !responseURL.search && STATIC_URLS.has(responseKey)) {
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(cacheKey, response.clone())).catch(() => {}));
    }
    return response;
  }).catch(async () => {
    const cache = await caches.open(CACHE);
    const stored = await cache.match(cacheKey);
    if (stored) return stored;
    if (request.mode === 'navigate') return await cache.match(INDEX_URL) || Response.error();
    return Response.error();
  }));
});

