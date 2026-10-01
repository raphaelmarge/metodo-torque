/* Real HQ route and its legacy CSS cascade. Synthetic Auth/RPC fixtures only.
 * Default CI gate: Chromium + WebKit. HQ_BROWSERS=chromium is a local partial run.
 * HQ_MOBILE_BASELINE_REF overrides only hq-ops.css, never application code/data.
 * HQ_SCREENSHOTS writes PNGs; HQ_GEOMETRY_REPORT_ONLY=1 records an old CSS baseline.
 */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const pw=require(process.env.PLAYWRIGHT_MODULE||'./ci/node_modules/playwright');
const Data=require('../assets/hq-ops-data.js');
const {createServer}=require('../tools/hq-ops/serve.cjs');
const engines=(process.env.HQ_BROWSERS||'chromium,webkit').split(',');
const baseline=process.env.HQ_MOBILE_BASELINE_REF;
const beforeCSS=baseline?execFileSync('git',['show',baseline+':assets/hq-ops.css'],{cwd:path.join(__dirname,'..'),encoding:'utf8'}):null;
const reportOnly=process.env.HQ_GEOMETRY_REPORT_ONLY==='1';
async function measure(page){return page.evaluate(()=>{
 const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
 const fields=[...document.querySelectorAll('#hqFilters .hq-field,[data-hqr-filters] .hq-field')];
 const controls=[...document.querySelectorAll('#hqFilters input,#hqFilters select,#hqFilters button,[data-hqr-filters] input,[data-hqr-filters] select,[data-hqr-filters] button')];
 const invalid=[],overlaps=[];
 controls.forEach(el=>{const r=rect(el),field=el.closest('.hq-field');if(r.left<0||r.right>innerWidth+1||r.height<43.5||field&&(r.left<rect(field).left-1||r.right>rect(field).right+1))invalid.push({name:el.name||el.textContent,...r,field:field&&rect(field)});});
 // Include labels: a button must not cover the next field's title or input.
 const boxes=[...fields,...controls.filter(el=>el.tagName==='BUTTON')];
 boxes.forEach((el,i)=>boxes.slice(i+1).forEach(other=>{const a=rect(el),b=rect(other);if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)overlaps.push([el.textContent.trim(),other.textContent.trim()]);}));
 const rgba=color=>{const n=(color.match(/[\d.]+/g)||[]).map(Number);return {rgb:n.slice(0,3),alpha:n.length>3?n[3]:1};};
 const lum=c=>c.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
 const disabled=[...document.querySelectorAll('.hq-report-stat:disabled')].map(el=>{
  const style=getComputedStyle(el),text=getComputedStyle(el.querySelector('strong')),bg=rgba(style.backgroundColor).rgb,fg=rgba(text.webkitTextFillColor==='currentcolor'?text.color:text.webkitTextFillColor||text.color);let opacity=1;for(let p=el;p;p=p.parentElement)opacity*=Number(getComputedStyle(p).opacity);
  const alpha=fg.alpha*opacity,blended=fg.rgb.map((v,i)=>v*alpha+bg[i]*(1-alpha)),a=lum(blended),b=lum(bg);
  return {text:el.textContent.trim(),disabled:el.disabled,opacity,textAlpha:fg.alpha,color:text.color,textFill:text.webkitTextFillColor,background:style.backgroundColor,contrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),...rect(el)};
 });
 return {width:innerWidth,pageWidth:document.documentElement.scrollWidth,invalid,overlaps,disabled};
});}
(async()=>{
 const configured=process.env.BASE_URL;
 if(configured)assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(configured).hostname),'local fixture server only');
 const server=configured?null:createServer();if(server)await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=(configured||'http://127.0.0.1:'+server.address().port).replace(/\/$/,''),origin=new URL(base).origin;
 const snapshots=[];let browser;
 try{
  for(const name of engines){assert.ok(['chromium','webkit'].includes(name),'supported browser');
   browser=await pw[name].launch({headless:true,...(name==='chromium'?{executablePath:process.env.CHROMIUM_PATH||(['C:/Program Files/Google/Chrome/Application/chrome.exe','/opt/pw-browsers/chromium'].find(p=>fs.existsSync(p))),args:['--no-sandbox']}:{} )});
   const context=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:1,isMobile:true,hasTouch:true,locale:'pt-BR',serviceWorkers:'block'}),external=[],errors=[];
   await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin){external.push(u.origin);return route.abort();}if(beforeCSS&&u.pathname==='/assets/hq-ops.css')return route.fulfill({contentType:'text/css',body:beforeCSS});return route.continue();});
   const s=Data.sampleSnapshot('2026-09-30T15:00:00Z');s.meta.mode='server';s.meta.authenticated=true;
   ['accounts','subscriptions','events','payments'].forEach(k=>{s[k]=[];s.sources[k]={status:'unavailable',origin:'fixture_missing_source',updatedAt:null,message:'Fonte sintética indisponível para teste visual.'};});
   await context.addInitScript(snapshot=>{window.__mobileCalls=[];window.MT_supabase={auth:{getSession:async()=>({data:{session:{user:{id:snapshot.currentUserId}}}}),getUser:async()=>({data:{user:{id:snapshot.currentUserId}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},rpc:async(name)=>{window.__mobileCalls.push(name);if(name==='hq_sou_admin')return {data:true};if(name==='hq_ops_snapshot')return {data:JSON.parse(JSON.stringify(snapshot))};return {error:{code:'PGRST202',message:'fixture unavailable'}};}};},s);
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/apps/hq.html');await page.locator('#hqSearch').waitFor();
   assert.equal(await page.evaluate(()=>!!window.MTStore),false,'no tenant store');
   assert.ok(await page.locator('link[href="apps.css"]').count(),'real legacy CSS included');
   await page.locator('#hqMenu').click();await page.locator('.hq-nav [data-nav="reports"]').click();await page.locator('[data-hqr-report="subscriptions"]').click();await page.locator('[data-hqr-filters]').waitFor();await page.evaluate(()=>document.fonts.ready);
   let measured=await measure(page);snapshots.push({engine:name,baseline:baseline||null,...measured});console.log(JSON.stringify(snapshots.at(-1)));
   assert.ok(measured.disabled.length>0,'unavailable source really renders disabled summaries');
   assert.ok(measured.disabled.every(x=>x.disabled&&/indisponível|consulta|pendente/i.test(x.text)),'unavailable state remains explicit, never zero');
   if(process.env.HQ_SCREENSHOTS){
    fs.mkdirSync(process.env.HQ_SCREENSHOTS,{recursive:true});const prefix=name+'-393-'+(baseline?'before-'+baseline:'after');
    await page.locator('[data-hqr-root]').screenshot({path:path.join(process.env.HQ_SCREENSHOTS,prefix+'-unavailable.png')});
    await page.screenshot({path:path.join(process.env.HQ_SCREENSHOTS,prefix+'-full.png'),fullPage:true});
    const clip=await page.evaluate(()=>{const a=document.querySelector('[data-hqr-filters]').getBoundingClientRect(),b=document.querySelector('.hq-reports-summary').getBoundingClientRect();return {x:Math.floor(Math.min(a.left,b.left)+scrollX),y:Math.floor(a.top+scrollY),width:Math.ceil(Math.max(a.right,b.right)-Math.min(a.left,b.left)),height:Math.ceil(b.bottom-a.top)};});
    await page.screenshot({path:path.join(process.env.HQ_SCREENSHOTS,prefix+'-filters-cards.png'),fullPage:true,clip});
   }
   if(!reportOnly){assert.ok(measured.pageWidth<=394,'no document overflow');assert.deepEqual(measured.invalid,[],'native controls fit fields and viewport');assert.deepEqual(measured.overlaps,[],'filters and labels never overlap');assert.ok(measured.disabled.every(x=>x.opacity===1&&x.textAlpha===1&&x.contrast>=4.5),'disabled summaries keep readable text and contrast');}
   const form=page.locator('[data-hqr-filters]');await form.locator('[name="from"]').fill('2026-09-01');await form.locator('[name="to"]').fill('2026-09-30');await form.locator('[name="cohort"]').fill('2026-08');await form.locator('[type="submit"]').click();assert.equal(await page.locator('[data-hqr-filters] [name="cohort"]').inputValue(),'2026-08','filters remain usable');
   assert.deepEqual(external,[],'no external requests');assert.deepEqual(errors,[],'no page errors');await browser.close();browser=null;
  }
  if(process.env.HQ_SCREENSHOTS)fs.writeFileSync(path.join(process.env.HQ_SCREENSHOTS,(baseline?'before-'+baseline:'after')+'-measurements.json'),JSON.stringify(snapshots,null,2));
  console.log('HQ real mobile393: '+engines.join('+')+' '+(reportOnly?'baseline measured':'PASS')+'; synthetic unavailable sources.');
 }finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
