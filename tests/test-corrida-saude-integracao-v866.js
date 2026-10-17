'use strict';
const assert=require('node:assert/strict');
let chromium;try{chromium=require(process.env.TORQUE_PLAYWRIGHT||'playwright').chromium;}catch(_){chromium=require('/opt/node22/lib/node_modules/playwright').chromium;}
const {comMockNuvem}=require('./_nuvem.js');
const BASE=process.env.BASE_URL||'http://127.0.0.1:8765';
global.self=global;require('../assets/corrida-analise.js');require('../app/corrida-export.js');require('../app/saude-conexoes.js');require('../app/aluno-skin.js');require('../app/aluno-builder.js');
const blocks=[{tipo:'ativo',alvo:{acao:'correr',valor:1,unidade:'km'}},{tipo:'recuperacao',alvo:{acao:'caminhar',valor:100,unidade:'m'}}];
const result={id:'real-synthetic',d:'2026-10-17',n:'Correr e caminhar',m:'corrida',s:430,k:1.1,origem:'gps',prescricao:{blocos:[{n:'Correr',s:0,km:1},{n:'Caminhar',s:0,km:.1}]},etapas:[{indice:0,nome:'Correr',segundos:360,km:1,status:'completo'},{indice:1,nome:'Caminhar',segundos:70,km:.1,status:'completo'}]};
let n=0;function ok(x,m){assert.ok(x,m);n++;}function eq(a,b,m){assert.deepEqual(a,b,m);n++;}
(async()=>{
const browser=comMockNuvem(await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined}));
try{
 const ctx=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await ctx.route('**/*',r=>new URL(r.request().url()).origin===new URL(BASE).origin?r.continue():r.abort());
 await ctx.addInitScript(record=>{window.__TORQUE_DEMO=true;localStorage.setItem('ptcardio',JSON.stringify([record]));},result);
 const html=MT_APP_ALUNO.monta({a:{id:'runner-health-synthetic',nome:'Corredor Teste'},studio:'Studio sintético',COR:'#7c3aed',COR2:'#5925ba',CORC:'#b395ff',CORE:'#33155c',CORCL1:'#d6c4ff',CORCL2:'#e8ddff',cfg:{},cardiosApp:[{id:'run',nome:'Correr e caminhar',tipo:'continuo',mod:'corrida',blocos:blocks}]});
 await ctx.route(BASE+'/__corrida-saude-v866.html',r=>r.fulfill({contentType:'text/html',body:html}));
 const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());await p.goto(BASE+'/__corrida-saude-v866.html');await p.waitForFunction(()=>window.__corridaEvolucao&&window.__saudeConexoes);
 ok(await p.locator('[data-cr-export]').count()>0,'builder monta ação de exportação');eq(await p.locator('[data-cr-analysis-list] details').count(),1,'builder monta comparação a partir de registro');
 await p.evaluate(()=>__saudeConexoes.open());ok(await p.getByText(/precisa da versão nativa/).isVisible(),'saúde em demo informa limite nativo');
 eq(await p.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('tqHealth:v2:'))),[],'demo saúde não cria cache privado');await p.getByRole('button',{name:'Fechar',exact:true}).click();
 await p.evaluate(()=>{__trocaSec('treino');__trSub('cardio');});await p.locator('[data-cr-analysis-list] summary').click();ok(await p.locator('[data-cr-analysis-list]').getByText('Prescrito',{exact:true}).first().isVisible(),'prescrição histórica visível no app real');
 const downloadWait=p.waitForEvent('download');await p.locator('[data-cr-export]').first().click();const download=await downloadWait;ok(download.suggestedFilename().endsWith('.tcx'),'download gerado no aluno real');
 ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'novo histórico aluno cabe no celular');eq(errors,[],'builder completo não introduz exceções');await ctx.close();
 const cp=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});await cp.route('**/*',r=>new URL(r.request().url()).origin===new URL(BASE).origin?r.continue():r.abort());const personal=await cp.newPage(),personalErrors=[];personal.on('pageerror',e=>personalErrors.push(e.message));personal.on('dialog',d=>d.accept());await personal.goto(BASE+'/demo-personal.html');await personal.click('#btnDemo');await personal.waitForURL(/personal\.html/);await personal.waitForFunction(()=>window.__cardiosPT&&window.__perfilPT);
 await personal.evaluate(({blocks,result})=>{const s=MTStore.read('ptStudio',{});s.alunos=[{id:'a',nome:'Corredor Sintético',ativo:true,demoRetorno:{cardio:[result]}}];s.config=Object.assign({},s.config,{dia1Off:true,zapFilaOff:true});s.treinosV2={a:{fichas:[],cardio:[{id:'run',nome:'Correr e caminhar',tipo:'continuo',mod:'corrida',blocos:blocks}]}};localStorage.setItem('mtapp:ptStudio',JSON.stringify(s));__ptStudio.render();document.querySelector('#abas [data-a="treinos"]').click();document.querySelector('#trAbas [data-tra="cardio"]').click();},{blocks,result});await personal.locator('#cbAluno').selectOption('a');ok(await personal.locator('[data-crexp="run"]').isVisible(),'personal oferece exportação do plano salvo');
 const pd=personal.waitForEvent('download');await personal.locator('[data-crexp="run"]').click();ok((await pd).suggestedFilename().endsWith('.tcx'),'personal baixa TCX real');
 await personal.evaluate(()=>{__perfilPT('a');document.querySelector('#pfAbas [data-pfa="app"]').click();});const summary=personal.getByText('Comparar etapas',{exact:true});ok(await summary.count()>0,'perfil recebe comparação');await summary.first().locator('xpath=ancestor::details[2]').locator(':scope > summary').click();await summary.first().click();ok(await personal.locator('.cr-analysis').first().getByText('Prescrito',{exact:true}).first().isVisible(),'prescrito e realizado no perfil');
 await personal.setViewportSize({width:390,height:844});ok(await personal.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'perfil mantém largura móvel');eq(personalErrors,[],'personal sem erros JS');await cp.close();
 console.log('Integração corrida/saúde v866: '+n+' verificações passaram.');
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});


