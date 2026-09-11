/* DOM offline do HTML e módulo canônicos. Sem login, rede ou dados reais. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
let chromium;try{chromium=require('playwright').chromium;}catch(_){chromium=require('/opt/node22/lib/node_modules/playwright').chromium;}
const {MOCK_NUVEM}=require('./_nuvem');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('personal.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,tag=>{
 const m=tag.match(/href="([^"]+\.css)"/);return m&&fs.existsSync(path.join(root,m[1]))?'<style>'+read(m[1])+'</style>':'';
});
let browser,checks=0;function ok(v,label){assert.ok(v,label);checks++;console.log('OK '+label);}
(async()=>{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 const ctx=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),p=await ctx.newPage();
 p.setDefaultTimeout(5000);const errors=[];p.on('pageerror',e=>errors.push(e.message));await ctx.route('**/*',r=>r.abort());
 await p.setContent(html);await p.addScriptTag({content:MOCK_NUVEM});
 await p.evaluate(()=>{
  const memory=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)}});
  const item={id:'item1',nome:'Item fictício',porcao:'100 g',qtd:1,k:100,pt:1,cb:1,g:1};
  const record={id:'reg1',d:'2026-09-11',hora:'12:00',titulo:'Registro fictício',itens:[item],origem:'plano',atualizadoEm:'2026-09-11T12:00:00Z'};
  window.fixture={alunos:['a','b'].map(id=>({id,nome:'Fixture '+id,ativo:true,appTokenP:'token-ficticio-'+id,retorno:{nutricaoV1:{registros:{reg1:structuredClone(record)}}}})),nutricaoV1:{planos:{},favoritos:[],alimentos:[]},avaliacoes:[]};
  window.fixtureUser='conta-a@example.invalid';window.fixtureCalls=[];
  const nuvem=window.mockNuvem({aid:'fixture-academia',tabelas:{app_aluno:q=>fixture.alunos.filter(a=>a.appTokenP===q.filtros.token).map(a=>({retorno:a.retorno}))},rpc:(name,args)=>{fixtureCalls.push({name,args});return Promise.resolve({data:{ok:true,feedback:[]},error:null});}});
  window.MTStore={todayISO:()=> '2026-09-11',uid:()=> 'fixture-id',usuario:()=>({email:fixtureUser}),cloud:()=>nuvem};
  window.fixtureBridge={load:()=>structuredClone(fixture),save:()=>{throw Error('A fixture não permite gravações');},perfilId:()=> 'a'};
  document.querySelectorAll('.corpo > section').forEach(e=>e.hidden=e.id!=='vNutricao');
 });
 await p.addScriptTag({content:read('assets/nutricao-core.js')});
 await p.addScriptTag({content:read('assets/personal-nutricao.js')});
 await p.evaluate(()=>MT_PERSONAL_NUTRICAO.init(fixtureBridge));
 await p.locator('#pnAluno').selectOption('a');
 if(await p.locator('#pnArea').isVisible())await p.locator('#pnArea').selectOption('registros');else await p.locator('[data-pna="registros"]').click();
 const button=p.locator('#pnRegistros [data-pnfeedback="reg1"]'),detail=button.locator('xpath=ancestor::details');
 await p.waitForFunction(()=>document.getElementById('pnRegistros').textContent.includes('Registro fictício')&&!document.getElementById('pnRegistros').textContent.includes('Atualizando'));
 await detail.locator(':scope > summary').click();await button.focus();
 await p.evaluate(()=>{window.fixtureButton=document.querySelector('#pnRegistros [data-pnfeedback]');MT_PERSONAL_NUTRICAO.render();});
 ok(await button.evaluate(e=>e===window.fixtureButton),'Atualização idêntica conserva o botão existente');
 ok(await detail.evaluate(e=>e.open),'Repintura conserva o registro aberto');
 ok(await button.evaluate(e=>document.activeElement===e),'Repintura conserva foco de teclado');
 await button.click();ok(await p.locator('#pnFeedbackDialog').evaluate(e=>e.open),'Clique normal abre a conversa com navegação presente');
 ok(await p.evaluate(()=>fixtureCalls.filter(c=>c.name==='app_nutricao_feedback_envia').length===0),'Abrir a conversa não envia comentário');await p.locator('#pnFeedbackFechar').click();
 await p.evaluate(()=>{fixture.alunos[0].retorno.nutricaoV1.registros.reg1.titulo='Registro atualizado';document.getElementById('pnRegAtualizar').click();document.querySelector('#pnRegistros [data-pnfeedback]').focus();});
 await p.waitForFunction(()=>document.getElementById('pnRegistros').textContent.includes('Registro atualizado'));
 ok(await detail.evaluate(e=>e.open),'Resposta atualizada conserva expansão por identidade');
 ok(await button.evaluate(e=>document.activeElement===e),'Resposta atualizada conserva foco sem roubar o foco externo');
 await p.locator('#pnAluno').selectOption('b');ok(!await detail.evaluate(e=>e.open),'Mesmo ID de registro de outro aluno começa fechado');
 await detail.locator(':scope > summary').click();await p.evaluate(()=>{fixtureUser='conta-b@example.invalid';MT_PERSONAL_NUTRICAO.render();});await p.locator('#pnAluno').selectOption('b');
 await p.waitForSelector('#pnRegistros [data-pnfeedback="reg1"]',{state:'attached'});
 ok(!await detail.evaluate(e=>e.open),'Troca de conta não herda expansão de outra identidade');
 for(const theme of ['escuro','claro'])for(const width of [320,390,1280]){
  await p.setViewportSize({width,height:844});await p.evaluate(t=>document.documentElement.dataset.tema=t,theme);
  await detail.locator(':scope > summary').click();await button.focus();
  await p.waitForFunction(()=>{const b=document.querySelector('#pnRegistros [data-pnfeedback]'),r=b.getBoundingClientRect(),h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return h===b||b.contains(h);});
  ok(await p.locator(width<=800?'#navPt':'#abas').isVisible(),'Navegação responsiva permanece visível em '+width+'px '+theme);
  await button.click();ok(await p.locator('#pnFeedbackDialog').evaluate(e=>e.open),'Conversa acessível por clique real em '+width+'px '+theme);
  await p.locator('#pnFeedbackFechar').click();await detail.locator(':scope > summary').click();
 }
 await p.locator('#pnAluno').selectOption('a');
 await p.waitForFunction(()=>document.getElementById('pnRegistros').textContent.includes('Registro atualizado')&&!document.getElementById('pnRegistros').textContent.includes('Atualizando'));
 await p.evaluate(()=>{MT_PERSONAL_NUTRICAO.perfil('a');document.getElementById('pfNutriRegistros').open=true;document.querySelector('#pfNutricao details[data-pnrecord]').open=true;MT_PERSONAL_NUTRICAO.perfil('a');});
 ok(await p.locator('#pfNutricao details[data-pnrecord]').evaluate(e=>e.open),'Perfil também conserva o registro expandido');
 await p.evaluate(()=>MT_PERSONAL_NUTRICAO.perfil('b'));
 ok(!await p.locator('#pfNutriRegistros').evaluate(e=>e.open)&&!await p.locator('#pfNutricao details[data-pnrecord]').evaluate(e=>e.open),'Perfil de outro aluno não herda os detalhes abertos');
 await p.locator('#pnRegBusca').fill('Texto que não existe');
 ok(await p.locator('#pnRegistros details[data-pnrecord]').count()===0,'Filtro remove registros sem manter elementos antigos');
 await p.locator('#pnRegBusca').fill('');
 ok(!await detail.evaluate(e=>e.open),'Limpar o filtro não restaura expansão já removida');
 ok(errors.length===0,'Sem erros de JavaScript: '+errors.join('; '));console.log(checks+' verificações DOM passaram; sem autenticação ou servidor.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
