/* Controles reais do circuito livre: geometria e ações, sem rede externa. */
'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium}=require(process.env.TORQUE_PLAYWRIGHT||'./ci/node_modules/playwright');
const BASE=process.env.BASE_URL||'http://127.0.0.1:8765';
global.self=global;global.MT_CLOUD=null;
require('../app/aluno-skin');require('../app/aluno-builder');
// Duas causas da regressão: PAL omitida tornava fundos transparentes na fixture;
// serialização de style pela UI remove a correspondência dos seletores textuais antigos.
const PADFUNDO=['#0d0c10','#100e15','#121016','#141218','#14121a','#1b1724','#1c1826','#1d1a24','#221f2b','#26222e','#26222f','#322e3d','#3a3346'];
const brands=[
  {name:'padrao',COR:'#7c3aed',COR2:'#6d28d9',CORC:'#a78bfa',CORE:'#4c1d95',CORCL1:'#ede9fe',CORCL2:'#ddd6fe',PAL:PADFUNDO},
  {name:'azul',COR:'#2563eb',COR2:'#1d4ed8',CORC:'#93c5fd',CORE:'#1e3a8a',CORCL1:'#dbeafe',CORCL2:'#eff6ff',
    PAL:[0,.035,.045,.05,.05,.09,.095,.10,.115,.13,.13,.2,.23].map(f=>'#'+[16,27,46].map(v=>Math.round(v+(255-v)*f).toString(16).padStart(2,'0')).join(''))}
];
const ids=['wodGo','wodVolta','wodTermina','wodZera'];
let checks=0;function ok(v,m){assert.ok(v,m);checks++;console.log('OK '+m);}
async function geometry(p,label){
  await p.locator('#wodGo').scrollIntoViewIfNeeded();
  const boxes=await p.evaluate(ids=>{
    const group=document.getElementById(ids[0]).parentElement,r=group.getBoundingClientRect();
    return ids.map(id=>{const e=document.getElementById(id),b=e.getBoundingClientRect();return {id,x:b.x,right:b.right,y:b.y,bottom:b.bottom,w:b.width,h:b.height,inside:b.left>=Math.max(0,r.left)-1&&b.right<=Math.min(innerWidth,r.right)+1,unclipped:e.scrollWidth<=e.clientWidth+1};});
  },ids);
  ok(boxes.every(b=>b.inside&&b.unclipped&&b.w>=44&&b.h>=44)&&boxes.every((a,i)=>boxes.slice(i+1).every(b=>a.right<=b.x+1||b.right<=a.x+1||a.bottom<=b.y+1||b.bottom<=a.y+1)),label+': quatro controles legíveis, dentro da área e sem sobreposição '+JSON.stringify(boxes));
}
async function contrast(p,label){
  const results=await p.evaluate(()=>{
    const rgb=s=>{const v=s.match(/[\d.]+/g).map(Number);return [v[0],v[1],v[2],v.length>3?v[3]:1];};
    const over=(fg,bg)=>fg.slice(0,3).map((v,i)=>v*fg[3]+bg[i]*(1-fg[3]));
    const lum=c=>c.map(v=>{v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4);}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
    return ['#wodVolta','#wodTermina','#wodPreparo h3','#wodPreparo p','#wodSomTeste'].map(selector=>{
      const el=document.querySelector(selector),layers=[],unknown=[];
      for(let e=el;e;e=e.parentElement){const s=getComputedStyle(e);if(s.backgroundImage!=='none'||Number(s.opacity)!==1)unknown.push({node:e.id||e.tagName,image:s.backgroundImage,opacity:s.opacity});layers.unshift(rgb(s.backgroundColor));}
      const bg=layers.reduce((base,layer)=>over(layer,base),[255,255,255]),fg=over(rgb(getComputedStyle(el).color),bg),a=lum(fg),b=lum(bg);
      return {selector,backgroundsKnown:unknown.length===0,unknown,foreground:fg,background:bg,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
    });
  });
  ok(results.every(r=>r.backgroundsKnown&&r.ratio>=4.5),label+': contraste dos controles, preparo e som sobre fundos renderizados ≥4,5:1 '+JSON.stringify(results));
}
const setTheme=(p,light)=>p.evaluate(light=>{Sv('pttema',light?1:0);window.__temaApp();},light);
const appearance=p=>p.evaluate(()=>['wodGo','wodVolta','wodTermina','wodZera','wodPreparo','wodSomTeste'].map(id=>{const s=getComputedStyle(document.getElementById(id));return {id,color:s.color,background:s.backgroundColor,image:s.backgroundImage,border:s.borderColor};}));
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
  try{
    for(const brand of brands)for(const width of [320,390,768,1440])for(const light of [false,true]){
      const html=MT_APP_ALUNO.monta({...brand,a:{id:'circuito-layout',nome:'Aluno de teste',appTokenP:'token-ficticio-layout'},studio:'Teste isolado',cfg:{},wodsApp:[]});
      const ctx=await browser.newContext({viewport:{width,height:900},locale:'pt-BR',timezoneId:'America/Sao_Paulo',serviceWorkers:'block',reducedMotion:'reduce'}),p=await ctx.newPage(),errors=[];
      await ctx.route('**/*',r=>new URL(r.request().url()).pathname==='/circuito-layout.html'?r.fulfill({contentType:'text/html',body:html}):new URL(r.request().url()).origin===new URL(BASE).origin?r.continue():r.abort());
      await ctx.addInitScript(()=>{localStorage.setItem('pttour','{"como":"teste"}');localStorage.setItem('ptonb','{"feito":true}');});
      p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
      await p.clock.install({time:new Date('2026-10-06T10:00:00-03:00')});await p.goto(BASE+'/circuito-layout.html');
      await p.waitForFunction(()=>window.__wodSessao);
      await setTheme(p,light);
      await p.evaluate(()=>{__trocaSec('treino');__trSub('wod');document.querySelector('[data-wodt="fortime"]').click();document.getElementById('wodCap').value='0';});
      const label=brand.name+' '+width+'px '+(light?'claro':'escuro');
      await geometry(p,label+' pronto');
      await contrast(p,label);
      const initial=await appearance(p);
      await setTheme(p,!light);await geometry(p,label+' tema oposto');await contrast(p,label+' tema oposto');
      await setTheme(p,light);await geometry(p,label+' tema restaurado');await contrast(p,label+' tema restaurado');
      ok(JSON.stringify(await appearance(p))===JSON.stringify(initial),label+': ida e volta pela API real preserva todas as cores, inclusive a ação principal');
      await p.locator('#wodGo').click();await p.clock.runFor(2200);await p.locator('#wfMin').click();await p.locator('#wodVolta').click();
      ok(await p.evaluate(()=>__wod.run&&__wod.voltas===1),label+': iniciar e registrar volta mantêm ações reais');
      await p.locator('#wodGo').click();await geometry(p,label+' pausado');
      await p.locator('#wodTermina').click();
      ok(await p.evaluate(()=>JSON.parse(localStorage.getItem('ptwodres')).livre.length===1)&&/Seu tempo:/.test(await p.locator('#wodFimBox').innerText()),label+': terminar salva uma única execução');
      await geometry(p,label+' concluído');
      if(process.env.MT_EVIDENCE_DIR){fs.mkdirSync(process.env.MT_EVIDENCE_DIR,{recursive:true});await p.screenshot({path:path.join(process.env.MT_EVIDENCE_DIR,'circuito-controles-'+brand.name+'-'+width+'-'+(light?'claro':'escuro')+'.png')});}
      await p.locator('#wodZera').click();
      ok((await p.locator('#wodTempo').innerText())==='0:00'&&await p.evaluate(()=>JSON.parse(localStorage.getItem('ptwodres')).livre.length===1),label+': zerar restaura cronômetro e preserva o resultado salvo');
      ok(errors.length===0,label+': sem erro JavaScript');await ctx.close();
    }
    console.log(checks+' verificações de controles responsivos passaram.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
