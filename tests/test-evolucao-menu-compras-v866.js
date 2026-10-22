'use strict';
const assert=require('node:assert/strict');const {chromium}=require(process.env.TORQUE_PLAYWRIGHT||'./ci/node_modules/playwright');const BASE=process.env.BASE_URL||'http://127.0.0.1:8765';
// A leitura do diário chama refresh durante o uso da despensa. Exercitar essa
// chegada exatamente entre digitar e sair do campo, sem depender de um timer.
async function checkShoppingRefresh(p){
 const url=BASE+'/__shopping-refresh-fixture.html';
 await p.route(url,r=>r.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html><head><meta charset="utf-8"></head><body><div id="shopping"></div><script src="/assets/nutricao-core.js"></script><script src="/app/nutricao-semana.js"></script></body></html>'}));
 await p.goto(url);
 await p.evaluate(()=>{
  window.__shoppingAllowed=true;window.__shoppingSaved=null;window.__shoppingRecords=[];
  const plan=MT_NUTRICAO.normalizaPlano({id:'refresh-fixture',ativo:true,refeicoes:[{id:'almoco',titulo:'Almoço',itens:[{id:'arroz',nome:'Arroz',porcao:'100 g',qtd:1,k:130,pt:3,cb:28,g:0}]}]});
  window.__shopping=MT_NUTRICAO_SEMANA.create().mount({host:document.getElementById('shopping'),core:MT_NUTRICAO,plan,scope:'fixture',read:()=>null,write:(_key,value)=>{__shoppingSaved=JSON.parse(JSON.stringify(value));return true;},isCurrent:()=>__shoppingAllowed,getRecords:()=>__shoppingRecords});
 });
 const pantry=p.locator('[data-ns-pantry]').first();
 await pantry.fill('100000');
 await p.evaluate(()=>__shopping.refresh());
 assert.equal(await pantry.inputValue(),'100000','atualização do diário preserva o valor ainda em edição');
 assert.equal(await pantry.evaluate(e=>e===document.activeElement),true,'atualização preserva o foco do campo');
 assert.equal(await p.evaluate(()=>__shoppingSaved),null,'atualização não confirma um rascunho automaticamente');
 await pantry.press('Tab');
 await p.waitForFunction(()=>document.querySelector('.ns-shopping').textContent.includes('Já tem o suficiente'));
 assert.equal(await p.evaluate(()=>Object.values(__shoppingSaved.pantry)[0].amount),100000,'sair do campo confirma a quantidade digitada');
 await pantry.focus();
 await p.evaluate(()=>{__shoppingRecords=[{id:'refeicao-fixture',d:'2026-01-01',titulo:'Refeição de exemplo'}];__shopping.refresh();});
 assert.equal(await p.locator('[data-ns-record] option').count(),0,'nova refeição aguarda o término da edição para repintar o formulário');
 await pantry.press('Tab');
 await p.locator('[data-ns-record] option').waitFor({state:'attached'});
 assert.equal(await p.locator('[data-ns-record] option').count(),1,'sair sem alterar o campo também aplica a atualização pendente');
 const saved=await p.evaluate(()=>JSON.stringify(__shoppingSaved));
 await p.locator('[data-ns-pantry]').first().fill('123');
 await p.evaluate(()=>{__shoppingAllowed=false;__shopping.refresh();});
 assert.equal(await p.locator('#shopping input').count(),0,'troca de acesso limpa o formulário mesmo durante edição');
 assert.equal(await p.evaluate(()=>JSON.stringify(__shoppingSaved)),saved,'troca de acesso não confirma o rascunho anterior');
 return 8;
}
(async()=>{let b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});let n=0;try{const c=await b.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});const p=await c.newPage(),errors=[],external=[];p.on('pageerror',e=>errors.push(e.message));await p.route('**/*',r=>{if(new URL(r.request().url()).origin===new URL(BASE).origin)return r.continue();external.push(r.request().url());return r.abort();});n+=await checkShoppingRefresh(p);await p.goto(BASE+'/demo-aluno-sem-cadastro.html');await p.locator('#navApp [data-msec=alimentacao]').click();await p.locator('#ntpTabPlanejar').click();await p.locator('#ntpCompras > summary').click();await p.locator('[data-ns-start]').waitFor({state:'visible'});assert.equal(await p.locator('#ntpCompraInicio').isVisible(),false);n++;await p.locator('[data-ns-pantry]').first().fill('100000');await p.locator('[data-ns-pantry]').first().press('Tab');await p.waitForFunction(()=>document.querySelector('.ns-shopping')?.textContent.includes('Já tem o suficiente'));assert.ok((await p.locator('.ns-shopping').innerText()).includes('Já tem o suficiente'));n++;await p.getByRole('button',{name:'Lista rápida',exact:true}).click();assert.equal(await p.locator('#ntpCompraInicio').isVisible(),true);assert.equal(await p.locator('[data-ns-start]').isVisible(),false);n+=2;const bought=p.locator('[data-ntp-compra]').first();await bought.check();await p.getByRole('button',{name:'Planejar compras',exact:true}).click();assert.equal(await p.locator('[data-ns-pantry]').first().inputValue(),'100000');await p.getByRole('button',{name:'Lista rápida',exact:true}).click();assert.equal(await bought.isChecked(),true);n+=2;assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));n++;await p.evaluate(()=>document.getElementById('ajTecnica').click());await p.locator('.tq-tech').waitFor({state:'visible'});assert.ok((await p.locator('.tq-tech').innerText()).includes('Demonstração'));n++;await p.locator('.tq-tech [data-close]').click();assert.deepEqual(errors,[]);assert.ok(external.every(u=>!u.includes('functions/v1')&&!u.includes('rest/v1')));n+=2;console.log(n+' verificações de compras integradas, lista anterior e menu de análise aprovadas.');}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
