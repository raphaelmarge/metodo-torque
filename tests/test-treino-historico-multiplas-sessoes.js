/* Execuções diferentes na mesma data, revisão offline e retomada transacional. */
'use strict';
const assert=require('node:assert/strict');
const {chromium}=require(process.env.TORQUE_PLAYWRIGHT||'./ci/node_modules/playwright');
const BASE=process.env.BASE_URL||'http://127.0.0.1:8765';
global.self=global;global.MT_CLOUD=null;require('../app/aluno-skin');require('../app/aluno-builder');
function data(load=12){return {a:{id:'multi-student',nome:'Aluno Sintético',appTokenP:'multi-token'},studio:'Teste isolado',cfg:{},fichasApp:[{titulo:'Ficha de teste',itens:[{nome:'Exercício sintético',series:1,reps:'5',descanso:0}]}],guiaFichasP:[{n:'Ficha de teste',it:[{e:'Exercício sintético',s:1,r:'5',d:0,seriesDetalhadas:[{reps:'5',carga:load,descanso:0}]}]}],fexs:[{n:'Exercício sintético',s:1}],cardiosApp:[{id:'run-fixture',nome:'Corrida sintética',mod:'corrida',tipo:'continuo',blocos:[{tipo:'ativo',alvo:{acao:'correr',valor:60,unidade:'s'}}]}],wodsApp:[{id:'wod-fixture',nome:'Circuito sintético',tipo:'amrap',min:12,movs:[{q:'10',n:'Movimento sintético'}]}]};}
let html=MT_APP_ALUNO.monta(data()),count=0;
function eq(a,b,m){assert.deepEqual(a,b,m);console.log('OK '+m);count++;}
function ok(a,m){assert.ok(a,m);console.log('OK '+m);count++;}
(async()=>{
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
try{
 const ctx=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844},timezoneId:'UTC'});
 await ctx.route('**/*',r=>new URL(r.request().url()).origin===new URL(BASE).origin?r.continue():r.abort());
 await ctx.route(BASE+'/multi-session-fixture',r=>r.fulfill({contentType:'text/html',body:html}));
 await ctx.addInitScript(()=>{localStorage.setItem('pttour','{"como":"teste"}');localStorage.setItem('ptonb','{"feito":true}');localStorage.setItem('ptcrCfg','{"cd":0,"fb":"off","ap":0,"bl":0}');});
 const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 await p.clock.install({time:new Date('2026-05-05T12:00:00Z')});
 async function load(){await p.goto(BASE+'/multi-session-fixture');await p.waitForFunction(()=>window.__treinoHistorico&&__treinoHistorico.ready());await p.evaluate(()=>__trocaSec('treino'));}
 const sessions=()=>p.evaluate(()=>__treinoHistorico.list('2026-05-05'));
 async function finishMuscle(kg,reps){await p.fill('#gKg',String(kg));await p.fill('#gReps',String(reps));await p.click('#gSerie');await p.click('#gFecharTreino');await p.click('#gFim');}
 await load();await p.evaluate(()=>document.querySelector('.guiabtn').click());await finishMuscle(10,3);
 const first=(await sessions())[0],receipt=first.finish;
 eq(first.targets['0:0:0'].value.kg,10,'primeira execução tem seu resultado e UUID');
 await p.evaluate(()=>{const b=document.querySelector('[data-th-new-muscle="0"]');b.click();b.click();});
 eq((await sessions()).length,2,'Novo treino explícito e duplo toque criam uma única execução adicional');
 eq(await p.inputValue('#gKg'),'12','nova execução não herda a carga realizada nem a conclusão anterior');
 eq(await p.evaluate(()=>GP.conta(GUIA[0].it[0],0)),0,'contador começa vazio apenas na nova execução');
 await finishMuscle(20,4);let all=await sessions();
 eq(new Set(all.map(s=>s.id)).size,2,'duas execuções da mesma ficha/data têm identidades distintas');
 eq(all.find(s=>s.id===first.id).targets['0:0:0'].value.kg,10,'segunda execução não sobrescreve a primeira');
 eq(await p.evaluate(()=>JSON.parse(localStorage.getItem('ptdc'))['Exercício sintético'].length),2,'compatibilidade também conserva dois registros com o mesmo slot/data');
 eq(await p.evaluate(()=>SR.volume(0,'2026-05-05')),110,'volume soma resultados reais das duas execuções sem colapsar o slot');
 const reward=await p.evaluate(()=>({xp:xpDados(),feitos:localStorage.getItem('ptfeitos'),uso:localStorage.getItem('ptuso')}));
 await ctx.setOffline(true);await p.evaluate(()=>{document.getElementById('thHistory').open=true;__treinoHistorico.render();});
 const card=p.locator('[data-session="'+first.id+'"]');await card.getByRole('button',{name:'Corrigir resultado',exact:true}).click();await card.locator('input[name=kg]').fill('9');await card.locator('input[name=reason]').fill('Correção offline da primeira execução');await card.getByRole('button',{name:'Salvar correção',exact:true}).click();
 all=await sessions();const corrected=all.find(s=>s.id===first.id);
 eq(corrected.targets['0:0:0'].value.kg,9,'editor offline escolhe a execução exata entre duas na mesma data');eq(corrected.targets['0:0:0'].original[0].value.kg,10,'revisão offline mantém original');eq(corrected.finish,receipt,'revisão mantém o recibo de encerramento original');
 eq(await p.evaluate(()=>({xp:xpDados(),feitos:localStorage.getItem('ptfeitos'),uso:localStorage.getItem('ptuso')})),reward,'correção não gera XP, check-in ou conclusão');
 eq(await p.evaluate(()=>SR.volume(0,'2026-05-05')),107,'volume usa a revisão da primeira e mantém resultado da segunda');
 await ctx.setOffline(false);html=MT_APP_ALUNO.monta(data(50));await load();
 await p.evaluate(()=>document.querySelector('.guiabtn').click());eq((await sessions()).length,2,'ficha alterada não reescreve a sessão anterior ao tentar reabrir');
 await p.evaluate(()=>document.querySelector('[data-th-new-muscle="0"]').click());eq(await p.inputValue('#gKg'),'50','nova execução usa a prescrição atual após alteração da ficha');await finishMuscle(30,2);
 all=await sessions();eq(all.length,3,'terceira execução fica separada na mesma data');eq(all.map(s=>s.prescribed.it[0].seriesDetalhadas[0].carga).sort((a,b)=>a-b),[12,12,50],'cada execução conserva sua prescrição mesmo após republicação');eq(await p.evaluate(()=>SR.volume(0,'2026-05-05')),167,'três execuções não duplicam nem perdem volume');
 // Replay pós-reload e concorrência real entre abas.
 await load();eq((await sessions()).length,3,'reload não cria nova execução');
 const peer=await ctx.newPage();await peer.goto(BASE+'/multi-session-fixture');await peer.waitForFunction(()=>window.__treinoHistorico);
 await peer.evaluate(()=>document.querySelector('[data-th-new-muscle="0"]').click());eq((await sessions()).length,3,'aba sem concessão não cria outra execução nem altera a seleção');await peer.close();
 // Falha entre snapshot e reset: retry usa UUID persistido e não reaproveita os sets antigos.
 await p.evaluate(()=>{window.oldSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('ptsets_'))throw new DOMException('Quota','QuotaExceededError');return oldSetItem.call(this,k,v);};document.querySelector('[data-th-new-muscle="0"]').click();});
 const pending=(await sessions()).find(s=>!s.finished);ok(pending&&!Object.keys(pending.targets).length,'falha de reset conserva snapshot sem fabricar resultados');
 await load();await p.evaluate(()=>document.querySelector('.guiabtn').click());eq((await sessions()).length,4,'retomada da criação pendente não cria outro UUID');eq(await p.evaluate(()=>GP.conta(GUIA[0].it[0],0)),0,'retry aplica reset antes de liberar nova execução');await finishMuscle(0,0);
 eq((await sessions()).find(s=>s.id===pending.id).targets['0:0:0'].value.r,0,'repetição zero explícita é preservada, sem virar ausência');
 // Corrida e circuito já têm identidades por execução: exercitar duas de cada na mesma data.
 for(let i=0;i<2;i++){
  await p.evaluate(()=>{__trSub('cardio');document.querySelector('[data-cbstart]').click();document.getElementById('crGo').click();});await p.clock.runFor(7000);await p.evaluate(()=>{document.getElementById('crKm').value='0.2';document.getElementById('crFim').click();});await p.click('#crRsFechar');
  await p.evaluate(()=>{__trSub('wod');document.querySelector('[data-wodstart]').click();document.getElementById('wodGo').click();});await p.clock.runFor(7000);await p.evaluate(()=>document.getElementById('wfFim').click());await p.locator('#wodPlacar button').filter({hasText:/Salvar/}).click();
 }
 all=await sessions();for(const kind of ['corrida','circuito']){const list=all.filter(s=>s.kind===kind);eq(list.length,2,kind+': duas execuções na mesma data preservadas');eq(new Set(list.map(s=>s.id)).size,2,kind+': IDs de execução diferentes');ok(list.every(s=>s.finished&&s.targets.result.original.length===1),kind+': uma origem e um encerramento por execução');}
 eq(all.filter(s=>s.kind==='musculacao').length,4,'outras modalidades não misturam nem removem sessões de musculação');eq(errors,[],'múltiplas sessões e falhas de recuperação sem exceções JavaScript');
 await ctx.close();console.log(count+' verificações de múltiplas sessões aprovadas.');
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
