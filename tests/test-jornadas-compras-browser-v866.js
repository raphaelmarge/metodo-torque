/* UI real, mock de banco em memória; nenhuma chamada externa. */
const assert=require('node:assert/strict'),path=require('node:path');
const BASE=new URL(process.env.BASE_URL||'http://127.0.0.1:8765').origin;
let chromium;try{chromium=require('playwright').chromium;}catch(_){chromium=require('/opt/node22/lib/node_modules/playwright').chromium;}
let checks=0,browser;function eq(a,b,msg){assert.deepEqual(a,b,msg);checks++;}function ok(v,msg){assert.ok(v,msg);checks++;}
(async()=>{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});const p=await browser.newPage({viewport:{width:390,height:844}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html data-demo="central-pro"><body><main id="journey"></main><main id="week"></main></body></html>'}));await p.goto(BASE+'/journey-test');await p.clock.setFixedTime(new Date('2026-10-17T15:00:00Z'));p.on('dialog',d=>d.accept());
 for(const file of ['assets/jornadas-core.js','assets/personal-jornadas.js','assets/demo-central-pro-data.js','assets/nutricao-core.js','app/nutricao-semana.js'])await p.addScriptTag({path:path.resolve(__dirname,'..',file)});
 await p.addStyleTag({path:path.resolve(__dirname,'../app/nutricao-semana.css')});await p.addStyleTag({path:path.resolve(__dirname,'../assets/personal-jornadas.css')});
 await p.evaluate(()=>{window.selected={id:'demo-bruno',name:'Bruno de teste'};window.context={academia_id:'demo-academia',user:{id:'demo-prof-marina'},epoch:0};window.journey=PTJornadas.mount(document.querySelector('#journey'),{context:async()=>context,assertContext(c){if(c.epoch!==context.epoch)throw Error('Conta mudou');},client:()=>MT_CENTRAL_PRO_DEMO.client,student:()=>selected,openArea:async()=>true});return journey.refresh();});
 await p.locator('[data-j-create]').click();await p.locator('.ptj-list').waitFor();
 eq(await p.evaluate(()=>MT_CENTRAL_PRO_DEMO.snapshot().personal_automacoes.filter(x=>x.acao.student==='demo-bruno').length),1,'Início cria uma jornada, não etapas duplicadas no banco');
 await p.locator('[data-j-complete]').click();await p.waitForFunction(()=>document.querySelector('.ptj-list').textContent.includes('Concluída'));
 eq(await p.evaluate(()=>MT_CENTRAL_PRO_DEMO.snapshot().personal_automacoes.find(x=>x.acao.student==='demo-bruno').ativa),false,'Jornada não dispara automação externa do backend');
 await p.locator('[data-j-toggle]').click();await p.waitForFunction(()=>document.querySelector('[data-j-toggle]').textContent==='Retomar jornada');
 await p.locator('[data-j-toggle]').click();await p.waitForFunction(()=>document.querySelector('[data-j-toggle]').textContent==='Pausar jornada');
 await p.evaluate(()=>{window.selected={id:'demo-carla',name:'Carla de teste'};return journey.refresh();});ok(await p.locator('[data-j-create]').isVisible(),'Troca de aluno não mostra a jornada anterior');
 await p.evaluate(()=>{window.selected={id:'demo-bruno',name:'Bruno de teste'};return journey.refresh();});ok(await p.locator('.ptj-list').isVisible(),'Retorno recupera a mesma jornada');
 const before=await p.evaluate(()=>MT_CENTRAL_PRO_DEMO.snapshot());await p.evaluate(async()=>{const row=MT_CENTRAL_PRO_DEMO.snapshot().personal_automacoes.find(x=>x.acao.student==='demo-bruno');await MT_CENTRAL_PRO_DEMO.client.from('personal_automacoes').update({atualizado_em:'2030-01-01T00:00:00Z'}).eq('id',row.id);});
 await p.locator('[data-j-toggle]').click();await p.waitForFunction(()=>document.querySelector('[data-j-status]').textContent.includes('Nenhum registro'));eq(await p.evaluate(()=>MT_CENTRAL_PRO_DEMO.snapshot().personal_automacoes.find(x=>x.acao.student==='demo-bruno').acao.pausedOn),'','CAS recusa edição de versão antiga');
 await p.evaluate(()=>{window.context={...context,epoch:1};window.selected=null;journey.clear();});eq(await p.locator('#journey').innerText(),'','Troca de conta apaga a projeção da jornada');
 await p.evaluate(()=>{window.store={};window.allow=true;window.records=[{id:'meal-1',d:'2026-10-17',titulo:'Almoço',itens:[],atualizadoEm:'2026-10-17T12:00:00Z',observacao:''}];const food=(id,nome,porcao,qtd,extra={})=>({id,alimId:id,nome,porcao,qtd,k:10,pt:1,cb:1,g:1,...extra});window.plan=MT_NUTRICAO.normalizaPlano({id:'plan',versao:1,refeicoes:[{id:'ref',titulo:'Almoço',itens:[food('rice','Arroz','100 g',1,{substituicoes:[food('potato','Batata','100 g',2)]})]}]});window.week=MT_NUTRICAO_SEMANA.create().mount({host:document.querySelector('#week'),core:MT_NUTRICAO,plan,scope:'aluno-a',read:(k,d)=>store[k]||d,write:(k,v)=>(store[k]=v,true),isCurrent:()=>allow,getRecords:()=>records,onDifficulty:r=>(records=[r],true),demo:true});});
 await p.locator('[data-ns-meal]').selectOption('1');ok((await p.locator('.ns-shopping').innerText()).includes('Batata'),'Alternativa aprovada aparece nas compras');
 const potato=await p.locator('.ns-shopping>div').filter({hasText:'Batata'});await potato.locator('input').fill('50');await potato.locator('input').dispatchEvent('change');ok((await p.locator('.ns-shopping').innerText()).includes('Comprar 150 g'),'Despensa desconta na unidade exibida');
 eq(await p.evaluate(()=>plan.refeicoes[0].itens[0].nome),'Arroz','Escolha não muda o plano publicado');
 await p.locator('.ns-difficulty summary').click();await p.locator('[data-ns-note]').fill('Reunião atrasou');await p.evaluate(()=>week.refresh());eq(await p.locator('[data-ns-note]').inputValue(),'Reunião atrasou','Atualização mantém texto da dificuldade ainda não salvo');
 await p.locator('[data-ns-difficulty]').click();await p.waitForFunction(()=>records[0].observacao.includes('[Dificuldade]'));eq(await p.evaluate(()=>records.length),1,'Dificuldade atualiza a refeição existente sem novo consumo');
 await p.locator('[data-ns-difficulty]').click();eq(await p.evaluate(()=>records[0].observacao.split('[Dificuldade]').length),2,'Repetir relato não duplica a observação');
 eq(await p.evaluate(()=>Object.keys(store)),['ptnutriSemana:aluno-a'],'Compras guardadas no escopo fornecido do aluno');
 for(const width of [320,390,768]){await p.setViewportSize({width,height:844});ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Compras sem overflow em '+width);}
 await p.evaluate(()=>{window.allow=false;week.refresh();});eq(await p.locator('#week').innerText(),'','Troca de acesso limpa o planejamento anterior');
 eq(errors,[],'Nenhum erro JS na jornada ou planejamento');await browser.close();console.log(`PASS jornada/compras browser: ${checks} verificações`);
})().catch(async e=>{console.error(e);if(browser)await browser.close();process.exitCode=1;});
