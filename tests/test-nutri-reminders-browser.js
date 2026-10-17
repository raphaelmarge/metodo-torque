// Synthetic UI/worker fixtures; blocks all external requests and permission UI.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.TORQUE_PLAYWRIGHT||'playwright');
const BASE=(process.env.BASE_URL||'http://127.0.0.1:8765').replace(/\/$/,'');
(async()=>{const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}}),errors=[],external=[];
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==new URL(BASE).origin||route.request().method()!=='GET'){external.push(url.href);return route.abort();}if(url.pathname.endsWith('/nutri/config.js'))return route.fulfill({contentType:'application/javascript',body:'window.TORQUE_NUTRI_CONFIG={};'});return route.continue();});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(BASE+'/nutri/demo-paciente.html');await page.locator('.demo-notice').waitFor();
  await page.locator('[data-page="more"]').first().click();await page.locator('[data-page="settings"]').last().click();
  assert.match(await page.locator('main').innerText(),/demonstração não pede permissão/);
  assert.equal(await page.locator('#reminder-preferences').count(),0);
  console.log('OK demo mostra explicação e nunca solicita permissão.');
  const ui=await page.evaluate(async()=>{
   const {createReminderController}=await import('/nutri/reminders.js'),{createReminderSettings}=await import('/nutri/reminder-settings.js');
   const user='00000000-0000-4000-8000-000000000001',patient='00000000-0000-4000-8000-000000000002';
   let s={demo:false,role:'patient',user:{id:user},clinic:{id:'clinic'},patients:[{id:patient,user_id:user}],page:'settings'},calls=[],permissions=0,unsubscribed=0,sub=null;
   let data={enabled:true,public_key:'B'.repeat(87),devices:0,preferences:{appointments:true,questionnaires:true,appointment_minutes:60,questionnaire_time:'09:00',timezone:'America/Sao_Paulo'}};
   Object.defineProperty(Notification,'requestPermission',{configurable:true,value:async()=>{permissions++;return 'granted';}});
   Object.defineProperty(navigator.serviceWorker,'getRegistration',{configurable:true,value:async()=>({active:{postMessage:(message,ports)=>ports[0].postMessage({ok:true})},pushManager:{getSubscription:async()=>sub,subscribe:async()=>sub={endpoint:'https://fcm.googleapis.com/synthetic',toJSON:()=>({endpoint:'https://fcm.googleapis.com/synthetic',keys:{p256dh:'B'.repeat(87),auth:'A'.repeat(22)}}),unsubscribe:async()=>{unsubscribed++;sub=null;return true;}}}})});
   const db={rpc:async(name,args)=>{calls.push(args.p_action);if(args.p_action==='subscribe')data={...data,devices:1};if(args.p_action==='unsubscribe')data={...data,devices:0};if(args.p_action==='preferences')data={...data,preferences:args.p_data.preferences};return {data:structuredClone(data),error:null};}};
   const H={state:()=>s,database:()=>db,esc:x=>String(x??'').replace(/[&<>"']/g,'_'),run:fn=>fn(),render:()=>{document.querySelector('#fixture').innerHTML=settings.view();settings.bind();}};
   H.reminders=createReminderController(H);let settings=createReminderSettings(H);
   document.body.innerHTML='<main id="fixture"></main>';await H.reminders.load();H.render();await new Promise(resolve=>setTimeout(resolve,30));
   const passive=permissions;await H.reminders.enable(data.preferences);H.render();
   const enabled=H.reminders.snapshot().devices;await H.reminders.save({...data.preferences,questionnaire_time:'11:45'});const saved=H.reminders.snapshot().preferences.questionnaire_time;
   await H.reminders.disable();const disabled=H.reminders.snapshot().devices;
   const before=calls.filter(x=>x==='snapshot').length;await H.reminders.clearDevice();H.render();await new Promise(resolve=>setTimeout(resolve,50));
   return {passive,permissions,enabled,saved,disabled,unsubscribed,reloaded:calls.filter(x=>x==='snapshot').length>before};
  });
  assert.deepEqual(ui,{passive:0,permissions:1,enabled:1,saved:'11:45',disabled:0,unsubscribed:1,reloaded:true});
  console.log('OK opt-in por gesto, preferências, desligar e recarregar após saída/entrada da mesma conta.');
  const sw=fs.readFileSync(path.join(__dirname,'../nutri/sw.js'),'utf8');
  const guards=await page.evaluate(async(source)=>{
   const listeners={},shown=[],opened=[];let closed=0;
   const fake={location:{href:location.origin+'/nutri/sw.js'},addEventListener:(name,fn)=>{listeners[name]=fn;},registration:{showNotification:async(title,data)=>shown.push({title,...data}),getNotifications:async()=>[{close:()=>closed++}]},clients:{get:async id=>({id,url:location.origin+'/nutri/index.html'}),matchAll:async()=>[],openWindow:async url=>opened.push(url)}};
   new Function('self',source)(fake);
   const call=async(name,args)=>{let promise;listeners[name]({...args,waitUntil:p=>{promise=p;}});await promise;};
   const bind=userId=>call('message',{data:{type:'NUTRI_REMINDER_ACCOUNT',userId},source:{id:'synthetic'},ports:[{postMessage:()=>{}}]});
   const user='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
   const push=userId=>call('push',{data:{json:()=>({kind:'appointment',userId,tag:'stable',body:'NEVER SHOW THIS PRIVATE TEXT'})}});
   await bind(user);await push(other);const before=shown.length;await push(user);await push(user);
   await call('notificationclick',{notification:{data:{userId:user,page:'https://evil.test/'},close:()=>{}}});
   await bind(null);await push(user);const afterLogout=shown.length;
   // Reinstantiate listeners with the same real IndexedDB, simulating restart.
   new Function('self',source)(fake);await push(user);
   await call('notificationclick',{notification:{data:{userId:user,page:'booking'},close:()=>{}}});
   return {before,count:shown.length,afterLogout,closed,tags:shown.map(n=>n.tag),privateBody:shown.some(n=>n.body.includes('PRIVATE')),opened};
  },sw);
  assert.equal(guards.before,0);assert.equal(guards.count,2);assert.equal(guards.afterLogout,2);assert.equal(guards.closed,2);assert.deepEqual(guards.tags,['stable','stable']);assert.equal(guards.privateBody,false);assert.equal(guards.opened.length,1);assert.equal(new URL(guards.opened[0]).searchParams.get('reminder'),'forms');assert.equal(new URL(guards.opened[0]).origin,new URL(BASE).origin);
  const race=await page.evaluate(async(source)=>{
   const listeners={},visible=[];let displayed,release;
   const displayStarted=new Promise(resolve=>displayed=resolve),hold=new Promise(resolve=>release=resolve);
   const fake={location:{href:location.origin+'/nutri/sw.js'},addEventListener:(name,fn)=>listeners[name]=fn,registration:{showNotification:async(title,data)=>{displayed();await hold;const notification={...data,close:()=>{const i=visible.indexOf(notification);if(i>=0)visible.splice(i,1);}};visible.push(notification);},getNotifications:async(options)=>visible.filter(n=>!options?.tag||n.tag===options.tag)},clients:{get:async id=>({id,url:location.origin+'/nutri/index.html'})}};
   new Function('self',source)(fake);const call=async(name,args)=>{let p;listeners[name]({...args,waitUntil:x=>p=x});await p;};
   const user='00000000-0000-4000-8000-000000000001',bind=userId=>call('message',{data:{type:'NUTRI_REMINDER_ACCOUNT',userId},source:{id:'synthetic'},ports:[{postMessage:()=>{}}]});
   await bind(user);const pending=call('push',{data:{json:()=>({kind:'appointment',userId:user,tag:'race'})}});await displayStarted;await bind(null);release();await pending;return visible.length;
  },sw);
  assert.equal(race,0);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  console.log('OK worker isola contas, persiste saída, deduplica tag, ignora texto sensível e mantém clique na origem.');
  console.log('OK logout concorrente ao showNotification fecha aviso exibido depois da revogação.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
