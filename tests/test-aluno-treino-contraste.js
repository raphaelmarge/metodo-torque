/* Contraste do treino no claro, com a fonte canônica e dados fictícios.
 * Compõe fundos transparentes antes de medir; não depende de demo regenerada. */
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { chromium } = require(process.env.TORQUE_PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE_URL || process.env.MT_BASE || 'http://127.0.0.1:8765';
const ORIGIN = new URL(BASE).origin;
global.self = global;
require('../app/aluno-skin.js'); require('../app/aluno-builder.js');
const D = {
  a:{id:'contraste-ficticio',nome:'Aluno fictício'},studio:'Studio fictício',
  COR:'#7c3aed',COR2:'#5925ba',CORC:'#b395ff',CORE:'#33155c',CORCL1:'#d6c4ff',CORCL2:'#e8ddff',
  PAL:['#0d0c10','#111015','#15131b','#191621','#211d2a','#272231','#2c2639','#342d42','#3b334b','#443a54','#4d425f','#574b6c','#62557a'],
  fichasApp:[{titulo:'A — Peito',itens:[{nome:'Supino reto',series:3,reps:'8',descanso:60,tec:'up'}],
    p2:{n:'Cardio e alongamento',l:[{t:'Caminhada',v:'5 min',o:'Ritmo leve'},{t:'Alongamento',v:'30 s'}]}}],
  guiaFichasP:[{n:'A — Peito',it:[{e:'Supino reto',s:3,r:'8',d:60,tec:'up'}]}],
  fexs:[{n:'Supino reto',s:3}],aqPorFicha:{0:[['Mobilidade dos ombros','30 s'],['Marcha no lugar','2 min']]},
  raioX:[{g:'Peito',s:3}],mesApp:{musculacao:{s:2,f:'subir carga',a:'Mantenha a execução controlada.'}},
  wodsApp:[{id:'circuito-ficticio',nome:'Circuito fictício',t:'amrap',min:5,mov:["Agachamento"],movs:[{q:'10',n:'Agachamento'}]}],
  cardiosApp:[{id:'corrida-ficticia',nome:'Corrida fictícia',mod:'corrida',tipo:'continuo',dist:3,tempo:20}],sessApp:[]
};
const selectors = {
  ficha:['#trMes b','#trMes span','.aqbox summary','.aqbox .kv b','.exrow .tecchip','.ex-tecnica',
    '.p2box>div:first-child>span:first-child','.p2box>div:first-child b','.p2row>b','.p2box .tmrbtn',
    '#trRaioX h2','#thHistory button.sec'],
  wod:['#wodHist .wpk'],
  cardio:['#crLivre','#crGpsTit','#crGpsTxt','#crGpsNao','#crTela [style*="color:#6e6a78"]',
    '#crSinal','#fcCard>div:first-child','#fcCard label','#fcMaxT','#fcDica']
};
let checks=0;
function ok(value,label){assert.ok(value,label);checks++;console.log('OK '+label);}
async function contrast(page,selector){
  return page.locator(selector).evaluateAll(els=>{
    const rgb=s=>{const v=s.match(/[\d.]+/g).map(Number);return[v[0],v[1],v[2],v.length>3?v[3]:1];};
    const mix=(f,b)=>f.slice(0,3).map((n,i)=>n*f[3]+b[i]*(1-f[3]));
    const lum=c=>c.map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;})
      .reduce((n,x,i)=>n+x*[.2126,.7152,.0722][i],0);
    return els.map(el=>{
      const chain=[];for(let a=el;a;a=a.parentElement)chain.unshift(a);
      const visible=chain.every(a=>{const s=getComputedStyle(a);return s.display!=='none'&&s.visibility!=='hidden';});
      const hasImage=chain.some(a=>getComputedStyle(a).backgroundImage!=='none');
      let bg=[255,255,255];for(const a of chain)bg=mix(rgb(getComputedStyle(a).backgroundColor),bg);
      const fg=mix(rgb(getComputedStyle(el).color),bg),a=lum(fg),b=lum(bg);
      return{text:el.textContent.trim(),visible,hasImage,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
    });
  });
}
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
  try{
    const ctx=await browser.newContext({viewport:{width:390,height:900},serviceWorkers:'block'});
    const errors=[],requests=[];
    const html=MT_APP_ALUNO.monta(D).replace(/localStorage/g,'__demoLS').replace('<head>','<head>'+
      fs.readFileSync(path.join(__dirname,'../tools/demo-aluno/demo-bloco.html'),'utf8'));
    await ctx.route('**/*',r=>{
      const u=new URL(r.request().url());
      if(u.origin===ORIGIN&&u.pathname==='/contraste-ficticio.html')return r.fulfill({contentType:'text/html',body:html});
      requests.push(r.request().method()+' '+u.origin+u.pathname);return r.abort();
    });
    await ctx.addInitScript(()=>{
      window.__hardwareCalls=0;
      Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(){window.__hardwareCalls++;},watchPosition(){window.__hardwareCalls++;return 0;},clearWatch(){}}});
      Object.defineProperty(navigator,'permissions',{value:{query:async()=>({state:'denied',onchange:null})}});
      Object.defineProperty(navigator,'bluetooth',{value:{requestDevice(){window.__hardwareCalls++;return Promise.reject(Error('Dispositivo fictício'));}}});
    });
    const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
    await p.clock.setFixedTime(new Date('2026-10-06T12:00:00Z'));
    await p.goto(ORIGIN+'/contraste-ficticio.html');
    await p.waitForFunction(()=>window.__treinoHistorico&&window.__treinoHistorico.ready());
    for(const width of [320,390,768,1440]){
      await p.setViewportSize({width,height:900});
      await p.evaluate(()=>{__demoLS.setItem('pttema','1');__temaApp();});
      await p.locator('#navApp [data-msec=treino]').click();
      for(const sub of ['ficha','wod','cardio']){
        await p.locator('[data-trsub="'+sub+'"]').click();
        await p.evaluate(()=>document.querySelectorAll('[data-sec="treino"] details').forEach(d=>d.open=true));
        if(sub==='cardio')await p.locator('#crGpsTit').waitFor({state:'visible'});
        for(const selector of selectors[sub]){
          const rows=await contrast(p,selector);
          ok(rows.length>0&&rows.every(r=>r.visible&&r.text&&!r.hasImage&&r.ratio>=4.5),
            width+' claro '+selector+': '+rows.map(r=>r.ratio.toFixed(2)).join('/')+':1');
        }
        ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),width+' '+sub+': sem transbordar');
        if(process.env.EVIDENCE_DIR){fs.mkdirSync(process.env.EVIDENCE_DIR,{recursive:true});await p.screenshot({path:path.join(process.env.EVIDENCE_DIR,width+'-claro-'+sub+'.png'),fullPage:true,animations:'disabled'});}
      }
      // A troca de tema não deve impor os acentos claros à paleta escura.
      await p.evaluate(()=>{__demoLS.setItem('pttema','0');__temaApp();});
      await p.locator('[data-trsub=ficha]').click();
      ok(await p.locator('.aqbox summary').evaluate(el=>getComputedStyle(el).color==='rgb(253, 186, 116)'),width+' escuro: acento original preservado');
      ok(await p.locator('#trMes b').evaluate(el=>getComputedStyle(el).color==='rgba(255, 255, 255, 0.8)'),width+' escuro: faixa original preservada');
    }
    ok(errors.length===0,'sem erros JavaScript: '+errors.join('; '));
    ok(!requests.some(r=>!r.startsWith('GET ')||/\/rest\/|\/rpc\//.test(r)),'nenhuma chamada de API ou escrita externa');
    ok(await p.evaluate(()=>__hardwareCalls===0),'sem acionar GPS ou Bluetooth real');
    await ctx.close();console.log(checks+' verificações aprovadas.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
