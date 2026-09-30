/* Rota HQ real + fixtures locais. Nenhuma chamada externa, pessoa real ou Auth write. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
let chromium;try{chromium=require('playwright').chromium;}catch(_){chromium=require('./ci/node_modules/playwright').chromium;}
const {createServer}=require('../tools/hq-ops/serve.cjs');
const Data=require('../assets/hq-ops-data.js');
const A='00000000-0000-4000-8000-000000009000',B='00000000-0000-4000-8000-000000009001';
let checks=0;function ok(value,label){assert.ok(value,label);checks++;console.log('OK '+label);}
(async()=>{
 const server=process.env.BASE_URL?null:createServer();if(server)await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=(process.env.BASE_URL||'http://127.0.0.1:'+server.address().port).replace(/\/$/,''),origin=new URL(base).origin;
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','/opt/pw-browsers/chromium'].find(p=>fs.existsSync(p)),args:['--no-sandbox']});
 const contexts=[],errors=[],outside=[];
 async function setup(options={}){
  const context=await browser.newContext({viewport:{width:options.width||1440,height:1000},serviceWorkers:'block'});contexts.push(context);
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){outside.push(route.request().url());return route.abort();}return route.continue();});
  const snapshot=Data.sampleSnapshot('2026-09-30T15:00:00Z');snapshot.meta.mode='server';snapshot.meta.authenticated=true;snapshot.currentUserId=A;
  await context.addInitScript(({options,snapshot,permissions,A,B})=>{
   const state=window.__teamTest={user:A,role:'admin',admin:true,calls:[],listeners:[],pending:[],inside:false,insideRpc:0,delayRead:false,delayCommand:false,denyCommand:false,denyTeam:!!options.denyTeam,missing:!!options.missing,conflict:false};
   state.emit=(event,user)=>{if(user)state.user=user;state.inside=true;try{state.listeners.slice().forEach(fn=>fn(event,event==='SIGNED_OUT'?null:{user:{id:state.user}}));}finally{state.inside=false;}};
   state.release=()=>{state.pending.splice(0).forEach(fn=>fn());};
   // This is explicitly injected by the test before any live app module runs.
   let delegate=null;
   window.MT_supabase={auth:{getSession:async()=>({data:{session:{user:{id:state.user}}}}),getUser:async()=>({data:{user:{id:state.user}}}),onAuthStateChange(fn){state.listeners.push(fn);queueMicrotask(()=>fn('INITIAL_SESSION',{user:{id:state.user}}));return {data:{subscription:{unsubscribe(){state.listeners=state.listeners.filter(x=>x!==fn);}}}};},signOut:async()=>{state.emit('SIGNED_OUT');return {error:null};}},rpc:async(name,args)=>{
    state.calls.push({name,args,user:state.user});if(state.inside)state.insideRpc++;
    if(name==='hq_sou_admin')return {data:state.admin&&state.role==='admin'&&state.user===A};
    if(name==='hq_ops_snapshot'){const s=JSON.parse(JSON.stringify(snapshot));s.currentUserId=state.user;s.role=state.role;s.permissions=permissions[state.role];return {data:s};}
    if(name==='hq_team_snapshot'||name==='hq_team_command'){
      if(state.user!==A||!state.admin||state.role!=='admin'||state.denyTeam||name==='hq_team_command'&&state.denyCommand)return {error:{code:'42501',message:'fixture denied'}};
      if(state.missing)return {error:{code:'PGRST202',message:'fixture missing'}};
      if(name==='hq_team_command'&&state.conflict)return {error:{code:'40001',message:'version_conflict'}};
      if(!delegate)delegate=window.HQOpsTeam.createDemoClient({permissions});
      const result=await delegate.rpc(name,args);
      if(name==='hq_team_snapshot'&&result.data){delete result.data.meta.synthetic;result.data.currentUserId=state.user;if(options.invalidContract)result.data.meta.accessProvisioningAvailable=true;}
      if(name==='hq_team_snapshot'&&state.delayRead||name==='hq_team_command'&&state.delayCommand)await new Promise(resolve=>state.pending.push(resolve));
      return result;
    }
    return {error:{code:'PGRST202',message:'fixture unavailable'}};
   }};
  },{options,snapshot,permissions:Data.permissions,A,B});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/apps/hq.html');await page.locator('#hqSearch').waitFor();
  if(options.width&&options.width<780)await page.locator('#hqMenu').click();
  await page.locator('.hq-nav [data-nav="admin"]').click();
  await page.waitForFunction(()=>document.querySelector('#hqAdminContent')?.textContent&&!document.querySelector('#hqAdminContent').textContent.includes('Verificando acesso'));
  return {page,context};
 }
 async function create(page,name='Pessoa fictícia A',role='sales'){
  await page.getByRole('button',{name:'Cadastrar funcionário',exact:true}).click();const dialog=page.locator('.hqt-dialog[open]');
  await dialog.locator('[name="name"]').fill(name);await dialog.locator('[name="contact"]').fill('teste@example.invalid');await dialog.locator('[name="proposedRole"]').selectOption(role);await dialog.locator('[name="reason"]').fill('Cadastro fictício para validação');await dialog.locator('[type="submit"]').click();await page.waitForFunction(()=>!document.querySelector('.hqt-dialog'));await page.locator('.hqt-table').first().waitFor();
 }
 async function saveAction(page,action,field,value){
  await page.locator('[data-hqt-action="'+action+'"]').first().click();const d=page.locator('.hqt-dialog[open]');if(field)await d.locator('[name="'+field+'"]').selectOption(value);await d.locator('[name="reason"]').fill('Alteração fictícia justificada');await d.locator('[type="submit"]').click();await page.waitForFunction(()=>!document.querySelector('.hqt-dialog'));
 }
 try{
  const {page:p}=await setup();ok((await p.locator('#hqAdminContent').innerText()).includes('Nenhum funcionário cadastrado'),'fonte pronta vazia não inventa pessoas');
  await create(p,'<img src=x onerror=alert(1)>','admin');ok(await p.locator('#hqAdminContent img').count()===0,'nome é texto, sem executar HTML');
  ok((await p.locator('#hqAdminContent').innerText()).includes('Não concedido por este cadastro'),'perfil admin proposto não se apresenta como grant');
  await saveAction(p,'review','reviewStatus','approved');ok((await p.locator('#hqAdminContent').innerText()).includes('Proposta aprovada'),'aprovação administrativa permanece separada do acesso');
  ok(await p.locator('[data-hqt-action="review"]').count()===0,'proposta aprovada não oferece nova revisão sem edição');
  await p.locator('[data-hqt-action="edit"]').first().click();let d=p.locator('.hqt-dialog');await d.locator('[name="name"]').fill('Funcionário fictício editado');await d.locator('[name="proposedRole"]').selectOption('finance');await d.locator('[name="reason"]').fill('Troca de proposta de perfil');await d.locator('[type="submit"]').click();await p.waitForFunction(()=>!document.querySelector('.hqt-dialog'));
  ok((await p.locator('#hqAdminContent').innerText()).includes('Revisão pendente'),'edição exige nova revisão');
  await saveAction(p,'status');ok((await p.locator('#hqAdminContent').innerText()).includes('Cadastro inativo; acessos existentes não são alterados'),'inativação não promete revogar Auth');
  ok(await p.locator('[data-hqt-action="review"]').count()===0,'cadastro inativo não oferece aprovação');
  await saveAction(p,'status');ok((await p.locator('#hqAdminContent').innerText()).includes('Provisionamento pendente'),'reativação mantém acesso pendente');
  await p.locator('.hqt-matrix summary').click();ok(await p.locator('.hqt-matrix tbody tr').count()===6,'matriz usa seis perfis existentes');
  ok((await p.locator('.hqt-matrix').innerText()).includes('não aprova pagamentos'),'aprovação se limita à proposta da equipe');
  await p.locator('.hqt-audit summary').click();ok(await p.locator('.hqt-audit li').count()===5,'histórico registra criar, revisar, editar, inativar e reativar');
  const writes=await p.evaluate(()=>__teamTest.calls.filter(c=>c.name==='hq_team_command').map(c=>c.args.p_input));
  ok(writes.length===5&&writes.every(x=>x.reason.length>=3&&x.idempotencyKey.length>=8),'comandos têm motivo e idempotência');
  ok(writes.slice(1).every(x=>Number.isInteger(x.payload.expectedVersion)),'edições/revisões usam versão consultada');
  ok(await p.evaluate(()=>__teamTest.calls.every(c=>['hq_sou_admin','hq_ops_snapshot','hq_team_snapshot','hq_team_command'].includes(c.name))),'nenhum convite, grant ou RPC Auth mutante');
  await p.locator('[data-hq-admin-tab="audit"]').click();ok(await p.locator('#hqAdminContent .hqt').count()===0,'navegação desmonta equipe');await p.locator('[data-hq-admin-tab="team"]').click();await p.locator('.hqt-table').first().waitFor();ok((await p.locator('#hqAdminContent').innerText()).includes('Funcionário fictício editado'),'volta consulta snapshot real do contrato');

  const {page:mobile}=await setup({width:320});await create(mobile,'Pessoa fictícia no celular','viewer');
  ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'equipe cabe na tela de320px');await mobile.locator('[data-hqt-action="edit"]').first().click();
  ok(await mobile.locator('.hqt-dialog').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&el.scrollWidth<=el.clientWidth;}),'formulário cabe em320px sem corte lateral');
  ok(await mobile.locator('.hqt-dialog [type="submit"]').evaluate(el=>{const s=getComputedStyle(el);return s.backgroundColor==='rgb(117, 64, 212)'&&s.color!==s.backgroundColor;}),'ação primária do diálogo mantém fundo e contraste fora do shell');
  ok(await mobile.locator('.hqt-dialog [name="proposedRole"] option').count()===6,'formulário oferece todos os perfis');await mobile.locator('[data-hqt-cancel]').click();

  for(const option of [{missing:true},{denyTeam:true},{invalidContract:true}]){const {page:q}=await setup(option);ok(await q.locator('[data-hqt-action="create"]').count()===0,'backend ausente/negado/incompatível não oferece gravação');ok(!(await q.locator('#hqAdminContent').innerText()).includes('Nenhum funcionário cadastrado'),'indisponível não vira fila vazia');if(option.missing)ok((await q.locator('#hqAdminContent').innerText()).includes('Backend de equipe pendente'),'dependência de instalação explícita');}

  const {page:validation}=await setup();await validation.locator('[data-hqt-action="create"]').click();await validation.locator('.hqt-dialog [name="name"]').fill('A');await validation.locator('.hqt-dialog [name="reason"]').fill('Motivo suficiente');
  await validation.locator('.hqt-dialog form').evaluate(el=>el.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  ok(await validation.evaluate(()=>__teamTest.calls.filter(c=>c.name==='hq_team_command').length)===0,'bypass HTML não salva nome inválido');await validation.locator('[data-hqt-cancel]').click();await create(validation,'Versão fictícia');await validation.locator('[data-hqt-action="edit"]').click();await validation.locator('.hqt-dialog [name="reason"]').fill('Revisão de versão');await validation.evaluate(()=>__teamTest.conflict=true);await validation.locator('.hqt-dialog [type="submit"]').click();await validation.getByText('Este cadastro mudou desde a consulta.',{exact:false}).waitFor();
  ok(await validation.locator('.hqt-dialog').count()===1,'conflito40001 não é apresentado como sucesso');await validation.locator('[data-hqt-cancel]').click();

  const {page:denied}=await setup();await create(denied,'Cadastro privado A');await denied.locator('[data-hqt-action="edit"]').first().click();await denied.locator('.hqt-dialog [name="reason"]').fill('Revisão de teste');await denied.evaluate(()=>__teamTest.denyCommand=true);await denied.locator('.hqt-dialog [type="submit"]').click();
  await denied.getByText('Seu acesso administrativo não foi confirmado.',{exact:false}).waitFor();ok(await denied.locator('.hqt-dialog').count()===0&&!((await denied.locator('body').innerText()).includes('Cadastro privado A')),'comando negado remove dados e formulário');

  const {page:changed}=await setup();await create(changed,'Cadastro privado troca A');await changed.locator('[data-hqt-action="edit"]').first().click();await changed.evaluate(B=>__teamTest.emit('SIGNED_IN',B),B);
  ok(await changed.locator('.hqt-dialog').count()===0&&!((await changed.locator('body').innerText()).includes('Cadastro privado troca A')),'troca A→B limpa dados e dialog imediatamente');
  ok(await changed.evaluate(()=>__teamTest.insideRpc)===0,'callback Auth não aguarda nem inicia RPC síncrona');

  for(const [kind,event] of [['read','SIGNED_OUT'],['command','SIGNED_OUT'],['read','SIGNED_IN'],['command','SIGNED_IN']]){
    const {page:q}=await setup();await create(q,'Cadastro pendente '+kind);
    if(kind==='read'){await q.evaluate(()=>__teamTest.delayRead=true);await q.locator('[data-hqt-action="reload"]').click();}
    else {await q.locator('[data-hqt-action="edit"]').first().click();await q.locator('.hqt-dialog [name="reason"]').fill('Teste de resposta atrasada');await q.evaluate(()=>__teamTest.delayCommand=true);await q.locator('.hqt-dialog [type="submit"]').click();}
    await q.waitForFunction(()=>__teamTest.pending.length===1);await q.evaluate(({event,B})=>{__teamTest.emit(event,event==='SIGNED_IN'?B:null);__teamTest.release();},{event,B});
    await q.waitForTimeout(60);ok(!((await q.locator('body').innerText()).includes('Cadastro pendente'))&&await q.locator('.hqt-dialog').count()===0,'resposta '+kind+' atrasada não restaura dados após '+event);
  }
  const {page:refresh}=await setup();await create(refresh,'Cadastro refresh');await refresh.evaluate(()=>__teamTest.emit('TOKEN_REFRESHED'));await refresh.locator('.hqt-table').first().waitFor();ok((await refresh.locator('#hqAdminContent').innerText()).includes('Cadastro refresh'),'refresh da mesma sessão reautoriza e recupera consulta');
  ok(await refresh.evaluate(()=>__teamTest.insideRpc)===0,'refresh agenda consulta fora do listener Auth');

  // Forced module mount does not bypass server role checks, even if menus are altered.
  for(const role of ['finance','sales','support','engineering','viewer']){
    const {page:q}=await setup();await q.evaluate(role=>{__teamTest.role=role;const host=document.createElement('div');host.id='forcedTeam';document.body.appendChild(host);HQOpsTeam.mount(host,MT_supabase);},role);
    await q.locator('#forcedTeam').getByText('Seu acesso administrativo não foi confirmado.',{exact:false}).waitFor();ok(await q.locator('#forcedTeam [data-hqt-action="create"]').count()===0,'perfil '+role+' não administra equipe por montagem forçada');
  }
  const demoContext=await browser.newContext({viewport:{width:320,height:1000},serviceWorkers:'block'});contexts.push(demoContext);await demoContext.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());const demoPage=await demoContext.newPage();demoPage.on('pageerror',e=>errors.push(e.message));await demoPage.goto(base+'/apps/hq-ops-preview.html');await demoPage.locator('#hqMenu').click();await demoPage.locator('.hq-nav [data-nav="admin"]').click();await demoPage.getByText('Nenhum funcionário cadastrado nesta fonte.',{exact:false}).waitFor();
  ok((await demoPage.locator('#hqAdminContent').innerText()).includes('PRÉVIA LOCAL · CADASTROS FICTÍCIOS'),'prévia separada inicia vazia e identificada');await create(demoPage,'Pessoa fictícia da prévia','engineering');await demoPage.reload();await demoPage.locator('#hqMenu').click();await demoPage.locator('.hq-nav [data-nav="admin"]').click();await demoPage.getByText('Nenhum funcionário cadastrado nesta fonte.',{exact:false}).waitFor();ok(!((await demoPage.locator('#hqAdminContent').innerText()).includes('Pessoa fictícia da prévia')),'prévia não persiste pessoas entre sessões');
  ok(outside.length===0,'rede externa não foi acessada');ok(errors.length===0,'sem exceções no navegador');console.log('PASS '+checks+' verificações equipe browser; somente fixtures locais.');
 }finally{await Promise.all(contexts.map(c=>c.close()));await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
