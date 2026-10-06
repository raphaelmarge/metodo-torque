/* Recibos reais do builder; respostas atrasadas/falhas sintéticas, sem conta ou rede externa. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.TORQUE_PLAYWRIGHT||'./ci/node_modules/playwright');
const {dados}=require('./test-aluno-player-experiencia');
const BASE=process.env.BASE_URL||'http://127.0.0.1:8765';
global.self=global;global.MT_CLOUD={url:'https://recibos.invalid',anonKey:'fixture-publica'};
require('../app/aluno-skin');require('../app/aluno-builder');
let checks=0;function ok(v,m){assert.ok(v,m);checks++;console.log('OK '+m);}
async function until(fn){const deadline=Date.now()+5000;while(!fn()){if(Date.now()>deadline)throw Error('Transporte fictício não foi chamado.');await new Promise(r=>setTimeout(r,10));}}
async function fixture(browser,{demo=false}={}){
  const D=dados();D.wodsApp=[{id:'wod-fixture',nome:'Circuito de teste',tipo:'fortime',cap:10,movs:[{q:'5',n:'Movimento de teste'}]}];
  D.cardiosApp=[{id:'corrida-fixture',nome:'Corrida de teste',mod:'corrida',tipo:'continuo',dist:1}];
  let html=MT_APP_ALUNO.monta(D);
  if(demo)html=html.replace(/localStorage/g,'__demoLS').replace('<head>','<head>'+fs.readFileSync(path.join(__dirname,'../tools/demo-aluno/demo-bloco.html'),'utf8'));
  const ctx=await browser.newContext({viewport:{width:390,height:844},locale:'pt-BR',timezoneId:'America/Sao_Paulo',serviceWorkers:'block'});
  const modes={app_treino_eventos_grava:'hold',app_aluno_devolve:'hold'},waiting={},calls=[],errors=[];
  const release=(name,mode='ok')=>{modes[name]=mode;(waiting[name]||[]).splice(0).forEach(resolve=>resolve(mode));};
  await ctx.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/recibos-fixture.html')return route.fulfill({contentType:'text/html',body:html});
    if(url.hostname==='recibos.invalid'){
      const name=url.pathname.split('/').pop(),body=route.request().postDataJSON();calls.push({name,body});
      let mode=modes[name];if(mode==='hold')mode=await new Promise(resolve=>(waiting[name]||=[]).push(resolve));
      const result=mode==='error'?{ok:false}:name==='app_treino_eventos_lista'?{ok:true,eventos:[],cursor:'0',mais:false}:name==='app_treino_eventos_grava'?{ok:true,ids:body.p_eventos.map(x=>x.id)}:name==='app_chat_lista'||name==='app_agenda_lista'?[]:{ok:true};
      return route.fulfill({json:result});
    }
    return url.origin===new URL(BASE).origin?route.continue():route.abort();
  });
  await ctx.addInitScript(()=>{localStorage.setItem('pttour',JSON.stringify({como:'teste'}));localStorage.setItem('ptonb',JSON.stringify({feito:true}));localStorage.setItem('ptcrCfg',JSON.stringify({cd:0,fb:'off',ap:0,bl:0}));Object.defineProperty(navigator,'geolocation',{value:{watchPosition:()=>1,clearWatch(){}}});});
  const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
  await p.clock.install({time:new Date('2026-10-06T10:00:00-03:00')});
  await p.goto(BASE+'/recibos-fixture.html');await p.waitForFunction(()=>window.__treinoHistorico&&__treinoHistorico.ready());
  return {p,ctx,release,calls,errors,async close(){release('app_treino_eventos_grava');release('app_aluno_devolve');assert.deepEqual(errors,[]);await ctx.close();}};
}
async function finish(p,kind,{empty=false}={}){
  if(kind==='musculacao'){
    await p.evaluate(()=>document.querySelector('.guiabtn').click());
    if(!empty){await p.locator('#gKg').fill('20');await p.evaluate(()=>document.getElementById('gSerie').click());}
    await p.evaluate(()=>gConclui());return '.ac-conclusao-status';
  }
  if(kind==='corrida'){
    await p.evaluate(()=>{Sv('ptcrCfg',{cd:0,fb:'off',ap:0,bl:0});__trocaSec('treino');__trSub('cardio');document.querySelector('[data-cbstart]').click();document.getElementById('crGo').click();});
    await p.evaluate(()=>{__cr.t0=Date.now()-15000;document.getElementById('crKm').value='.1';__cr.rota=[{lat:-20,lng:-44},{lat:-20.001,lng:-44.001},{lat:-20.002,lng:-44.002,quebra:true},{lat:-20.003,lng:-44.003}];__pintaCr();document.getElementById('crFim').click();});
    return '#crResumoF .cr-registro-status:first-of-type';
  }
  await p.evaluate(()=>{__trocaSec('treino');__trSub('wod');document.querySelector('[data-wodstart]').click();document.getElementById('wodGo').click();});
  await p.clock.runFor(1500);await p.evaluate(()=>document.getElementById('wfFim').click());
  await p.locator('#wpSalvar').waitFor();await p.evaluate(()=>document.getElementById('wpSalvar').click());return '#wodFimBox';
}
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
  try{
    for(const kind of ['musculacao','corrida','circuito']){
      const f=await fixture(browser),p=f.p,selector=await finish(p,kind);
      await p.clock.runFor(2400);await until(()=>f.calls.some(x=>x.name==='app_treino_eventos_grava')&&f.calls.some(x=>x.name==='app_aluno_devolve'));
      ok(!/sincronizados/i.test(await p.locator(selector).innerText()),kind+': recibo não afirma envio antes das respostas');
      f.release('app_treino_eventos_grava');await p.waitForFunction(()=>__treinoHistorico.syncState()==='sincronizado');
      ok(!/sincronizados/i.test(await p.locator(selector).innerText()),kind+': só histórico confirmado ainda não basta');
      f.release('app_aluno_devolve',kind==='musculacao'?'error':'ok');
      if(kind==='musculacao'){
        await p.waitForFunction(()=>document.getElementById('acSync').dataset.estado==='erro');
        ok(/falha no envio/.test(await p.locator(selector).innerText()),'musculação: recibo aberto acompanha falha posterior do retorno');
        f.release('app_aluno_devolve');await p.evaluate(()=>__devolveApp());await p.clock.runFor(2400);
      }
      await p.waitForFunction(()=>document.getElementById('acSync').dataset.estado==='sincronizado');
      ok(/Registros sincronizados/.test(await p.locator(selector).innerText()),kind+': recibo aberto atualiza após confirmar os dois transportes');
      if(kind==='corrida')ok((await p.locator('#crResumoF').innerText()).includes('Trajeto com interrupções'),'corrida: aviso do trajeto permanece intacto');
      if(kind==='circuito')ok((await p.locator('#wodFimBox').innerText()).includes('Placar salvo!'),'circuito: placar não é substituído pela sincronização');
      await p.evaluate(()=>{window.__storageOriginal=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='ptdc')throw new DOMException('Quota fictícia','QuotaExceededError');return __storageOriginal.call(this,k,v);};Sv('ptdc',L('ptdc',{}));});
      ok(/Não foi possível salvar neste aparelho/.test(await p.locator(selector).innerText()),kind+': falha local posterior não conserva confirmação antiga');
      await p.evaluate(()=>{__treinoHistorico.synchronize();__devolveApp();});await p.clock.runFor(2400);
      ok(/Não foi possível salvar neste aparelho/.test(await p.locator(selector).innerText()),kind+': confirmação remota não encobre falha local');
      await p.evaluate(()=>{Storage.prototype.setItem=__storageOriginal;Sv('ptdc',L('ptdc',{}));});await p.clock.runFor(2400);
      await p.waitForFunction(()=>document.getElementById('acSync').dataset.estado==='sincronizado');
      ok(/Registros sincronizados/.test(await p.locator(selector).innerText()),kind+': nova gravação local bem-sucedida permite recuperar confirmação');
      await f.close();
    }
    const empty=await fixture(browser);const emptySelector=await finish(empty.p,'musculacao',{empty:true});
    empty.release('app_treino_eventos_grava');empty.release('app_aluno_devolve');
    await empty.p.evaluate(()=>Sv('pthab',{[isoHj()]:{0:true}}));await empty.p.clock.runFor(2400);
    await empty.p.waitForFunction(()=>document.getElementById('acSync').dataset.estado==='sincronizado');
    ok((await empty.p.locator(emptySelector).innerText())==='Confira os registros abaixo.','musculação sem séries conserva orientação própria mesmo quando outro registro sincroniza');await empty.close();
    for(const kind of ['musculacao','corrida','circuito']){
      const f=await fixture(browser,{demo:true}),selector=await finish(f.p,kind);await f.p.clock.runFor(2400);
      ok(/Demonstração/.test(await f.p.locator(selector).innerText())&&f.calls.length===0,kind+': demo informa simulação e não envia registros');await f.close();
    }
    console.log(checks+' verificações de recibos e sincronização passaram.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
