// Chromium/WebKit reais; IndexedDB real; nuvem fictícia e rede externa bloqueada.
const assert=require('node:assert/strict'),path=require('node:path');
const pw=require(process.env.TORQUE_PLAYWRIGHT||'/opt/node22/lib/node_modules/playwright');
const {comMockNuvem}=require('./_nuvem.js');
const BASE=process.env.BASE_URL||'http://127.0.0.1:8765',engine=process.env.TORQUE_BROWSER||'chromium';
let count=0;function ok(c,m){assert.ok(c,m);console.log('OK '+engine+': '+m);count++;}
(async()=>{
 const browser=comMockNuvem(await pw[engine].launch(engine==='chromium'?{executablePath:process.env.CHROMIUM_PATH||'/opt/pw-browsers/chromium',args:['--no-sandbox']}:{}));
 try{
 const ctx=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',locale:'pt-BR'});
 await ctx.route('**/*',r=>r.request().url().startsWith(BASE+'/')?r.continue():r.abort());
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto(BASE+'/tests/fixtures/confiabilidade.html');
 const captured=await page.evaluate(async()=>{
  const S=MTStore,png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const photo=await S.savePhotoData(png),unrelated=await S.savePhotoData(png);
  S.write('ptStudio',{alunos:[{id:'a',nome:'Antes',foto:photo}],treinosV2:{a:{fichas:[{id:'f1',nome:'A'}]}},config:{}});
  S.write('config',{exemplo:'anterior'});localStorage.setItem('mtpf:contrato',JSON.stringify({campo:'antes'}));localStorage.setItem('sb-ficticio-auth-token','segredo-ficticio');
  const canvas=document.createElement('canvas');canvas.width=1;canvas.height=1;
  const documento=MT_POSTURAL_CORE.create({width:1,height:1,data:canvas.toDataURL('image/jpeg')});
  await MT_POSTURAL_STORE.localPut({id:'postural-local',scope:'local',alunoId:'a',data:'2026-09-01',vista:'frente',documento});
  await MT_POSTURAL_STORE.localPut({id:'postural-outra-conta',scope:'account:outra:pessoa',alunoId:'a',data:'2026-09-01',vista:'frente',documento});
  window.backupOriginal=await S.exportBackup({dataOnly:true});
  return {data:backupOriginal,photo,unrelated};
 });
 ok(captured.data.versao===2&&captured.data.integridade.length===64,'backup completo tem versão e integridade');
 ok(captured.data.fotos.length===1&&captured.data.fotos[0].key===captured.photo,'leva a foto referenciada e não a foto sem vínculo');
 ok(captured.data.postural.length===1&&captured.data.postural[0].value.scope==='local','inclui postural próprio e exclui outra conta');
 ok(!JSON.stringify(captured.data).includes('segredo-ficticio'),'não inclui a sessão de autenticação');
 const restored=await page.evaluate(async()=>{
  const S=MTStore;let st=S.read('ptStudio');st.alunos[0].nome='Estado antes de restaurar';S.write('ptStudio',st);S.write('config',{exemplo:'atual'});
  const result=await S.importBackup(new File([JSON.stringify(backupOriginal)],'backup.json'));
  st=S.read('ptStudio');const copies=await S.copiasAnteriores();
  return {result,nome:st.alunos[0].nome,foto:st.alunos[0].foto,image:await S.getPhoto(st.alunos[0].foto),copies,doc:localStorage.getItem('mtpf:contrato')};
 });
 ok(restored.result.ok&&restored.nome==='Antes'&&restored.image===captured.data.fotos[0].value,'restaura dados e foto de fato');
 ok(restored.foto!==captured.photo&&restored.copies.length===1,'não substitui fotos antigas e preserva cópia anterior');
 const prior=await page.evaluate(async()=>{
  const db=await new Promise((res,rej)=>{const q=indexedDB.open('mt-backup-v2',1);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);});
  try{return await new Promise((res,rej)=>{const q=db.transaction('journal').objectStore('journal').getAll();q.onsuccess=()=>res(q.result[0].backup);q.onerror=()=>rej(q.error);});}finally{db.close();}
 });
 ok(prior.dados['mtapp:ptStudio'].alunos[0].nome==='Estado antes de restaurar'&&prior.fotos.length===1,'cópia anterior contém o estado e a própria imagem');
 for(const mode of ['corrompido','outra-conta','pendente']){
  const r=await page.evaluate(async mode=>{
   const old=localStorage.getItem('mtapp:ptStudio'),identity=localStorage.getItem('mtsync:identidade'),data=JSON.parse(JSON.stringify(backupOriginal));
   if(mode==='corrompido')data.dados['mtapp:ptStudio'].alunos[0].nome='Adulterado';
   if(mode==='outra-conta')localStorage.setItem('mtsync:identidade',JSON.stringify({academia_id:'outra',user_id:'outro'}));
   if(mode==='pendente')__MTSync._estado.sujas={'mtapp:ptStudio':true};
   let error;try{await MTStore.importBackup(new File([JSON.stringify(data)],'b.json'));}catch(e){error=e.message;}
   finally{if(identity===null)localStorage.removeItem('mtsync:identidade');else localStorage.setItem('mtsync:identidade',identity);__MTSync._estado.sujas={};}
   return {error,same:localStorage.getItem('mtapp:ptStudio')===old};
  },mode);ok(r.error&&r.same,'recusa '+mode+' antes de substituir dados');
 }
 const failure=await page.evaluate(async()=>{
  MTStore.write('config',{exemplo:'proteger'});let st=MTStore.read('ptStudio');st.alunos[0].nome='Proteger';MTStore.write('ptStudio',st);
  const before={studio:localStorage.getItem('mtapp:ptStudio'),config:localStorage.getItem('mtapp:config')},original=Storage.prototype.setItem;let failed=false,error;
  Storage.prototype.setItem=function(k,v){if(k==='mtapp:ptStudio'&&!failed){failed=true;throw new DOMException('Cota fictícia','QuotaExceededError');}return original.call(this,k,v);};
  try{await MTStore.importBackup(new File([JSON.stringify(backupOriginal)],'b.json'));}catch(e){error=e.message;}finally{Storage.prototype.setItem=original;}
  return {error,same:before.studio===localStorage.getItem('mtapp:ptStudio')&&before.config===localStorage.getItem('mtapp:config'),locked:!!localStorage.getItem('mtbackup:restauracao')};
 });ok(failure.error&&failure.same&&!failure.locked,'falha no meio da gravação reverte todas as chaves');
 const interrupted=await page.evaluate(async()=>{
  const original=Storage.prototype.setItem;let failed=false;
  Storage.prototype.setItem=function(k,v){if(k==='mtapp:ptStudio'&&!failed){failed=true;throw Error('interrupção fictícia');}if(failed&&k==='mtapp:config')throw Error('rollback indisponível');return original.call(this,k,v);};
  try{await MTStore.importBackup(new File([JSON.stringify(backupOriginal)],'b.json'));}catch(e){}finally{Storage.prototype.setItem=original;}
  return {locked:!!localStorage.getItem('mtbackup:restauracao'),blocked:MTStore.write('diario',{texto:'não gravar'})===false};
 });ok(interrupted.locked&&interrupted.blocked,'restauração interrompida bloqueia novas gravações');
 await page.reload();await page.waitForFunction(()=>!localStorage.getItem('mtbackup:restauracao'));
 ok(await page.evaluate(()=>MTStore.read('ptStudio').alunos[0].nome==='Proteger'&&MTStore.read('config').exemplo==='proteger'),'reabertura recupera o estado anterior pelo diário persistido');
 await page.evaluate(()=>{
  window.cloudOriginal=MTStore.cloud;
  const c=mockNuvem({aid:'academia-ficticia',rpc:async(name,args)=>{
   (window.callsUI||(window.callsUI=[])).push({name,args});
   if(name==='personal_sessoes')return {data:[{id:'sessao-ficticia',atual:true,navegador:'WebKit fictício',criada_em:'2026-09-01T12:00:00Z'}]};
   return {data:[]};
  },auth:{signOut:async opts=>{window.signOutOptions=opts;return {error:null};}},tabelas:{personal_alteracoes:[{id:'historico-ficticio',autor_nome:'Pessoa fictícia',criado_em:'2026-09-01T12:00:00Z',caminho:['alunos','a'],origem:'edicao',antes:{existe:true,valor:{nome:'Antes',appTokenP:'NUNCA-EXIBIR'}},depois:{existe:true,valor:{nome:'Depois'}}}]}});
  MTStore.cloud=()=>c;localStorage.setItem('mtsync:identidade',JSON.stringify({academia_id:c.aid,user_id:'pessoa-ficticia'}));
 });
 await page.getByText('Aparelhos conectados',{exact:true}).click();await page.getByRole('button',{name:'Consultar aparelhos',exact:true}).click();
 ok(await page.getByText('Este aparelho',{exact:true}).isVisible(),'mostra a sessão atual');
 await page.getByRole('button',{name:'Sair dos outros aparelhos',exact:true}).click();await page.waitForFunction(()=>!!window.signOutOptions);
 ok(await page.evaluate(()=>signOutOptions.scope==='others'),'revoga as outras sessões sem pedir saída desta');
 await page.getByText('Histórico de alterações',{exact:true}).click();await page.getByRole('button',{name:'Consultar histórico',exact:true}).click();
 await page.locator('#ptConfiabilidade details details summary').click();await page.getByRole('button',{name:'Ver antes e depois',exact:true}).click();
 ok(await page.locator('#ptConfiabilidade pre').count()===2&&!((await page.locator('#ptConfiabilidade').innerText()).includes('NUNCA-EXIBIR')),'histórico mostra antes/depois e oculta tokens');
 if(process.env.RUNNER_TEMP)await page.screenshot({path:path.join(process.env.RUNNER_TEMP,'torque-testes','confiabilidade-'+engine+'.png'),fullPage:true});
 await page.evaluate(()=>{MTStore.cloud=cloudOriginal;localStorage.removeItem('mtsync:identidade');});
 ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'manutenção cabe na largura do iPhone');
 ok(errors.length===0,'sem erros JavaScript: '+errors.join('; '));
 await ctx.close();console.log(count+' verificações de confiabilidade no '+engine+' aprovadas.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
