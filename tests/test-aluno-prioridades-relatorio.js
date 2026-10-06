/* Relatório de 06/10: agenda, data de abertura, retomada e estados honestos.
 * Somente fixtures locais e respostas HTTP sintéticas; não usa contas ou GPS. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let chromium;try{chromium=require(process.env.TORQUE_PLAYWRIGHT||'playwright').chromium;}catch(_){chromium=require('./ci/node_modules/playwright').chromium;}
const BASE=process.env.BASE_URL||'http://127.0.0.1:8765';
global.self=global;global.MT_CLOUD={url:'https://aluno-prioridades.invalid',anonKey:'somente-teste'};
require('../app/aluno-skin');require('../app/aluno-builder');
const week=items=>Object.fromEntries([0,1,2,3,4,5,6].map(d=>[d,items]));
const plan=[{tp:'ficha',i:0,n:'A — Teste'},{tp:'wod',i:0,n:'Circuito teste'},{tp:'cardio',i:0,n:'Corrida teste'}];
const D={a:{id:'prioridades',nome:'Aluno Sintético',appTokenP:'token-sintetico'},studio:'Studio Teste',metaSemana:3,
  COR:'#7c3aed',COR2:'#5925ba',CORC:'#b395ff',CORE:'#33155c',CORCL1:'#d6c4ff',CORCL2:'#e8ddff',PAL:['#0d0c10','#111015','#15131b','#191621','#211d2a','#272231','#2c2639','#342d42','#3b334b','#443a54','#4d425f','#574b6c','#62557a'],
  fichasApp:[{titulo:'A — Teste',itens:[{nome:'Supino teste',series:1,reps:'8',descanso:30}]}],
  guiaFichasP:[{n:'A — Teste',it:[{e:'Supino teste',s:1,r:'8',d:30}]}],fexs:[{n:'Supino teste',s:1}],
  wodsApp:[{id:'w-teste',nome:'Circuito teste',tipo:'amrap',min:10,movs:[{q:'10',n:'Movimento teste'}]}],
  cardiosApp:[{id:'c-teste',nome:'Corrida teste',mod:'corrida',tipo:'continuo',dist:5,tempo:30}],
  planoApp:week(plan),lojaApp:[{id:'produto',n:'Camiseta teste',v:50}],sessApp:[]};
let count=0;function ok(v,t){assert.ok(v,t);console.log('OK '+t);count++;}
async function until(predicate){const until=Date.now()+3000;while(!predicate()){if(Date.now()>until)throw Error('Resposta sintética não chegou no prazo.');await new Promise(r=>setTimeout(r,10));}}
async function open(browser,{data=D,demo=false,reply}={}){
  const ctx=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/Sao_Paulo',serviceWorkers:'block'}),p=await ctx.newPage(),errors=[],calls=[];
  p.on('pageerror',e=>errors.push(e.message));
  let html=MT_APP_ALUNO.monta(data);
  if(demo){let block=fs.readFileSync(path.join(__dirname,'../tools/demo-aluno/demo-bloco.html'),'utf8');html=html.replace(/localStorage/g,'__demoLS').replace('<head>','<head>'+block);}
  for(const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new Function(m[1]);
  await ctx.route('**/*',async r=>{
    const url=new URL(r.request().url());
    if(url.pathname==='/relatorio-teste.html')return r.fulfill({contentType:'text/html',body:html});
    if(url.hostname==='aluno-prioridades.invalid'){
      const name=url.pathname.split('/').pop(),body=r.request().postDataJSON();calls.push({name,body});
      let response=reply?await reply(name,body):undefined;
      if(response===undefined)response=name==='app_treino_eventos_lista'?{ok:true,eventos:[],cursor:'0',mais:false}:name==='app_treino_eventos_grava'?{ok:true,ids:body.p_eventos.map(e=>e.id)}:name==='app_agenda_lista'||name==='app_chat_lista'?[]:name==='app_aluno_busca'?null:{ok:true};
      return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(response)});
    }
    return url.origin===new URL(BASE).origin?r.continue():r.abort();
  });
  await ctx.addInitScript(()=>{localStorage.setItem('pttour',JSON.stringify({como:'teste'}));localStorage.setItem('ptonb',JSON.stringify({feito:true}));Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition:(ok,fail)=>fail({code:1}),watchPosition:(ok,fail)=>{fail({code:1});return 1;},clearWatch:()=>{}}});window.open=()=>null;});
  await p.clock.install({time:new Date('2026-10-06T10:00:00-03:00')});
  await p.goto(BASE+'/relatorio-teste.html');await p.waitForFunction(()=>window.__inicioAtualiza&&window.__treinoHistorico.ready());
  return {p,ctx,errors,calls};
}
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
  try{
    const schedule=await open(browser,{data:{...D,planoDatas:{'2026-10-06':[],'2026-10-07':[plan[2]]}}}),p=schedule.p;
    ok((await p.textContent('#htTitulo')).includes('recuperar'),'data sem treino mostra descanso no Hoje');
    ok(await p.evaluate(()=>__plnHoje().length===0&&__agItens('2026-10-06').filter(x=>x.k==='treino').length===0),'Hoje e calendário usam o mesmo descanso da data específica');
    ok(await p.locator('[data-plano-rotulo]').evaluateAll(es=>es.every(e=>e.textContent!=='Hoje')),'fichas, circuitos e corrida não recebem Hoje antigo gravado no HTML');
    await p.clock.setFixedTime(new Date('2026-10-07T10:00:00-03:00'));await p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
    ok((await p.textContent('#htTitulo')).includes('Corrida teste')&&await p.locator('[data-cri="0"] [data-plano-rotulo]').textContent()==='Hoje','reabrir em outra data recalcula indicação da corrida');
    ok(await p.evaluate(()=>__agItens('2026-10-07').filter(x=>x.k==='treino').length===1),'calendário não recoloca ficha semanal sobre a exceção da data');
    assert.deepEqual(schedule.errors,[]);await schedule.ctx.close();

    let releaseRequest;const agenda=await open(browser,{reply:async(name)=>{if(name==='app_agenda_pede')return new Promise(resolve=>releaseRequest=resolve);}});
    await agenda.p.evaluate(()=>{__trocaSec('agenda');AGSEL=isoHj();pintaCal();document.getElementById('agHora').value='08:00';document.getElementById('agObs').value='Observação original';document.getElementById('agPede').click();document.getElementById('agPede').dispatchEvent(new Event('click'));});
    await agenda.p.waitForFunction(()=>document.getElementById('agPede').disabled);await until(()=>releaseRequest);
    ok(agenda.calls.filter(x=>x.name==='app_agenda_pede').length===1,'clique duplo produz uma solicitação HTTP');
    await agenda.p.evaluate(()=>{AGSEL='2026-10-07';pintaCal();document.getElementById('agObs').value='Texto de outro dia';});releaseRequest({ok:true,id:'pedido-unico',status:'pedido',duplicado:false});
    await agenda.p.waitForFunction(()=>!document.getElementById('agPede').disabled);
    ok(await agenda.p.evaluate(()=>L('ptagenda',[]).length===1&&L('ptagenda',[])[0].dia==='2026-10-06'&&document.getElementById('agObs').value==='Texto de outro dia'),'resposta atrasada mantém a data enviada e preserva o formulário do outro dia');
    await agenda.p.evaluate(()=>{AGSEL='2026-10-06';document.getElementById('agHora').value='08:00';document.getElementById('agPede').click();});
    ok(agenda.calls.filter(x=>x.name==='app_agenda_pede').length===1&&(await agenda.p.textContent('#agPedidoStatus')).includes('já aguarda'),'pedido existente não vira segunda solicitação');
    await agenda.p.evaluate(()=>{localStorage.removeItem('ptagenda');document.getElementById('agPede').click();});await until(()=>agenda.calls.filter(x=>x.name==='app_agenda_pede').length===2);releaseRequest({ok:true,id:'pedido-unico',status:'confirmado',duplicado:true});
    await agenda.p.waitForFunction(()=>!document.getElementById('agPede').disabled);
    ok(await agenda.p.evaluate(()=>L('ptagenda',[]).length===1&&L('ptagenda',[])[0].status==='confirmado'),'retorno idempotente do servidor conserva confirmação do horário');
    assert.deepEqual(agenda.errors,[]);await agenda.ctx.close();

    const demo=await open(browser,{demo:true});await demo.p.clock.runFor(4000);
    ok(demo.calls.length===0,'demo não atinge transporte de conta real');
    ok(await demo.p.evaluate(()=>__treinoHistorico.syncState()==='demo')&&(await demo.p.textContent('#acSync')).includes('Demonstração'),'histórico e estado principal indicam simulação sem falso erro de servidor');
    await demo.p.evaluate(()=>{Sv('pthab',{[isoHj()]:{0:true}});document.querySelector('.lojabt').click();});await demo.p.clock.runFor(4000);
    ok(demo.calls.length===0&&!await demo.p.evaluate(()=>L('ptenvioPendente',false)),'registrar na demo não deixa fila de envio real');
    ok((await demo.p.textContent('#lojaStatus')).includes('nenhuma compra')&&await demo.p.locator('#demoPersonalConvite a').getAttribute('href')==='/personal.html','demo explica loja simulada e oferece entrada verdadeira do Personal');
    assert.deepEqual(demo.errors,[]);await demo.ctx.close();

    let failHistory=true;const sync=await open(browser,{reply:(name)=>name==='app_treino_eventos_lista'&&failHistory?{ok:true}:undefined});
    await sync.p.clock.runFor(2400);await sync.p.waitForFunction(()=>__treinoHistorico.syncState()==='erro');
    ok((await sync.p.textContent('#acSync')).includes('falha no envio')&&await sync.p.locator('#acSync button').isVisible(),'erro real de histórico mantém cópia local e oferece tentativa');
    failHistory=false;await sync.p.evaluate(()=>__treinoHistorico.synchronize());await sync.p.evaluate(()=>{Sv('pthab',{[isoHj()]:{0:true}});});await sync.p.clock.runFor(2400);
    await sync.p.waitForFunction(()=>document.getElementById('acSync').dataset.estado==='sincronizado');
    ok((await sync.p.textContent('#acSync')).includes('Registros sincronizados'),'sincronizado só aparece após confirmação dos dois transportes');
    assert.deepEqual(sync.errors,[]);await sync.ctx.close();

    const shop=await open(browser);await shop.p.evaluate(()=>document.querySelector('.lojabt').click());
    ok((await shop.p.inputValue('#chTexto')).includes('Camiseta teste')&&!shop.calls.some(x=>x.name==='app_chat_envia'),'loja sem pagamento prepara conversa sem enviá-la automaticamente');
    assert.deepEqual(shop.errors,[]);await shop.ctx.close();
    const checkout=await open(browser,{data:{...D,lojaPg:true,zapPersonal:'31900000000'},reply:name=>name==='pagamentos'?{ok:false}:undefined});
    await checkout.p.evaluate(()=>{window.__opened=[];window.open=url=>{__opened.push(url);return {};};document.querySelector('.lojabt').click();});await checkout.p.waitForFunction(()=>document.getElementById('lojaStatus').textContent.includes('Pagamento indisponível'));
    ok(await checkout.p.evaluate(()=>__opened.length===0)&&await checkout.p.locator('.lojabt').textContent()==='Ir ao pagamento','falha no checkout não redireciona silenciosamente para pedido no WhatsApp');
    assert.deepEqual(checkout.errors,[]);await checkout.ctx.close();

    const active=await open(browser);await active.p.evaluate(()=>{__trocaSec('treino');__trSub('wod');document.querySelector('[data-wodstart]').click();document.getElementById('wodGo').click();});await active.p.clock.runFor(1300);await active.p.reload();await active.p.waitForFunction(()=>__treinoHistorico.ready());
    ok(await active.p.textContent('#htVer')==='Continuar circuito','circuito preservado vira ação principal após recarga');
    ok(await active.p.locator('.al-outro-treino').count()>0,'outros treinos ficam como consulta secundária durante a sessão');
    const sid=await active.p.evaluate(()=>__wod.sid);await active.p.click('#htVer');
    ok(await active.p.evaluate(id=>__wod.sid===id&&!__wod.run,sid)&&await active.p.locator('#wfEstado').isVisible(),'Continuar reabre a mesma sessão pausada sem criar outra');
    await active.p.evaluate(()=>{__trocaSec('treino');__trSub('cardio');});
    ok(await active.p.locator('#crLimiteInicio').isVisible()&&(await active.p.textContent('#crLimiteInicio')).includes('Antes de iniciar')&&await active.p.locator('#crGo').getAttribute('aria-describedby')==='crLimiteInicio','limite web é apresentado e associado ao botão antes de iniciar corrida');
    assert.deepEqual(active.errors,[]);await active.ctx.close();
    const run=await open(browser,{data:{...D,fichasApp:null,guiaFichasP:[],fexs:[],planoApp:null,wodsApp:[]}});
    await run.p.evaluate(()=>{localStorage.setItem('ptcrCfg',JSON.stringify({cd:0,fb:'off'}));document.querySelector('[data-cbstart]').click();document.getElementById('crGo').click();});await run.p.clock.runFor(2000);await run.p.evaluate(()=>__crSessao.salva(true));const runId=await run.p.evaluate(()=>__cr.sid);
    await run.p.reload();await run.p.waitForFunction(()=>__treinoHistorico.ready());
    ok(await run.p.textContent('#htVer')==='Continuar corrida','aluno só de corrida também recebe retomada prioritária');
    await run.p.click('#htVer');ok(await run.p.evaluate(id=>__cr.sid===id&&!__cr.run,runId)&&await run.p.locator('#crFull').isVisible(),'retomada de corrida conserva sessão e reabre pausada');
    assert.deepEqual(run.errors,[]);await run.ctx.close();
    console.log(count+' verificações das prioridades do relatório passaram.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
