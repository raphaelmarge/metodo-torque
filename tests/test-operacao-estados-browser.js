'use strict';
// Isolated browser documents, synthetic RPC replies, no production requests.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.TORQUE_PLAYWRIGHT||'./ci/node_modules/playwright');
const BASE=process.env.BASE_URL||process.env.MT_BASE||'http://127.0.0.1:8765';
let checks=0;function ok(v,m){assert.ok(v,m);console.log('OK '+(++checks)+' '+m);}
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});try{
 const ctx=await browser.newContext({acceptDownloads:true,serviceWorkers:'block'}),p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="pt-BR"><body><div id="ptFlowAutoResumo"></div><div id="ptFlowAutoList"></div><main id="hq"></main></body></html>'}));await p.goto(BASE+'/isolated-operations');
 const js=fs.readFileSync(path.join(__dirname,'../assets/personal-fluxo.js'),'utf8'),start=js.indexOf('  function loadAutomationPanel()'),end=js.indexOf('  function triggerLabel(',start);
 await p.addScriptTag({content:`var state={autosBusy:false},loadCalls=0;function $(id){return document.getElementById(id);}function read(){return {alunos:[]};}function esc(v){return String(v);}function aluno(){return null;}function triggerLabel(v){return v;}function actionLabel(v){return v;}var responses={};function cloudCtx(){loadCalls++;return Promise.resolve({aid:'fixture',client:{from:function(name){var q={select:function(){return q;},eq:function(){return q;},order:function(){return q;},limit:function(){return Promise.resolve(responses[name]);}};return q;}}});}${js.slice(start,end)}`});
 async function load(a,b){await p.evaluate(({a,b})=>{responses={personal_automacoes:a,personal_automacao_fila:b};loadAutomationPanel();},{a,b});await p.waitForFunction(()=>!state.autosBusy);}
 await load({error:{message:'forbidden'}},{data:[]});ok(/indisponíveis/.test(await p.locator('#ptFlowAutoResumo').innerText()),'resposta Supabase com erro aparece indisponível');ok(!/0 ativa|Fila vazia/.test(await p.locator('body').innerText()),'falha não exibe zero nem fila vazia');ok(await p.locator('[data-ptf="reload-autos"]').count()===1,'falha oferece recarregar');
 await load({data:[]},{data:null});ok(await p.locator('[role=alert]').count()===1,'resposta nula não é lista vazia');
 await load({data:[]},{data:[]});ok(/0 ativa/.test(await p.locator('#ptFlowAutoResumo').innerText())&&/Fila vazia/.test(await p.locator('#ptFlowAutoList').innerText()),'zero é apresentado somente após duas listas válidas');
 await p.evaluate(()=>{cloudCtx=()=>new Promise(resolve=>window.releaseAuto=resolve);loadAutomationPanel();});ok(/Consultando/.test(await p.locator('#ptFlowAutoResumo').innerText()),'nova consulta retira contagem antiga enquanto carrega');
 for(const file of ['hq-ops-metrics.js','hq-ops-data.js','hq-ops-sections.js','hq-ops-reports.js','hq-ops-app.js'])await p.addScriptTag({content:fs.readFileSync(path.join(__dirname,'../assets',file),'utf8')});
 await p.evaluate(()=>{window.auditCalls=[];window.auditFail=true;const s=HQOpsData.sampleSnapshot('2026-09-30T15:00:00Z');s.meta.mode='server';s.meta.exportAuditAvailable=true;const client={auth:{getSession:async()=>({data:{session:{user:{id:s.currentUserId}}}})},rpc:async(name,args)=>name==='hq_sou_admin'?{data:true}:name==='hq_ops_snapshot'?{data:s}:name==='hq_ops_export_audit'?(auditCalls.push(args),auditFail?{error:{code:'42501'}}:{data:{ok:true,id:'synthetic-receipt'}}):{error:{code:'PGRST202'}}};window.hq=HQOpsApp.mount(document.getElementById('hq'),{client});});
 await p.waitForSelector('[data-hq-updated]');ok(/Última consulta confirmada:/.test(await p.locator('[data-hq-updated]').innerText()),'HQ mostra o horário da consulta confirmada');
 await p.locator('#hqFilters [name=from]').fill('2026-09-01');await p.locator('#hqFilters [name=to]').fill('2026-09-30');await p.locator('#hqFilters button').click();
 await p.locator('[data-nav=reports]').first().click();await p.locator('[data-hqr-report=pipeline]').click();let downloads=0;p.on('download',()=>downloads++);
 await p.locator('[data-hqr-export]').click();await p.waitForFunction(()=>document.querySelector('[data-hqr-notice]').textContent.includes('Nenhum download'));ok(downloads===0,'auditoria recusada impede download');
 await p.evaluate(()=>auditFail=false);const downloadPromise=p.waitForEvent('download');await p.locator('[data-hqr-export]').click();const dl=await downloadPromise;await p.waitForFunction(()=>document.querySelector('[data-hqr-notice]').textContent.includes('Solicitação de exportação registrada'));
 ok(dl.suggestedFilename().includes('pipeline')&&downloads===1,'auditoria confirmada precede um download');
 const audit=await p.evaluate(()=>auditCalls.at(-1));ok(/^[a-f0-9]{64}$/.test(audit.p_content_sha256)&&audit.p_rows===21,'auditoria recebe hash do CSV completo além da página visível');ok(!/Conta Exemplo|Oportunidade Exemplo|notes|csv/.test(JSON.stringify(audit)),'auditoria contém metadados sem nomes, notas ou CSV');
 await p.evaluate(()=>hq.dispose());ok(errors.length===0,'sem erros de execução: '+errors.join(';'));
 console.log(checks+' verificações de estados e exportação no navegador passaram.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
