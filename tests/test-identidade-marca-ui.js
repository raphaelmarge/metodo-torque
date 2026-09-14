/* Personal e aluno reais, dados sintéticos, rede externa bloqueada. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let chromium;try{chromium=require('playwright').chromium;}catch(_){try{chromium=require('./ci/node_modules/playwright').chromium;}catch(_){chromium=require('/opt/node22/lib/node_modules/playwright').chromium;}}
const {comMockNuvem}=require('./_nuvem');
let browser,checks=0;
const eq=(a,b,s)=>{assert.deepEqual(a,b,s);checks++;console.log('OK '+s);};
const ok=(a,s)=>{assert.ok(a,s);checks++;console.log('OK '+s);};
(async()=>{
 const opts={args:['--no-sandbox']};if(process.env.CHROMIUM_PATH)opts.executablePath=process.env.CHROMIUM_PATH;else if(fs.existsSync('/opt/pw-browsers/chromium'))opts.executablePath='/opt/pw-browsers/chromium';
 browser=comMockNuvem(await chromium.launch(opts));
 const context=await browser.newContext({viewport:{width:1280,height:1000},locale:'pt-BR',timezoneId:'America/Sao_Paulo',serviceWorkers:'block'});
 const ROOT=path.resolve(__dirname,'..'),BASE=(process.env.BASE_URL||'http://torque-marca.test').replace(/\/+$/,''),errors=[];let generated='';
 const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png','.jpg':'image/jpeg'};
 await context.route('**/*',route=>{
  const u=new URL(route.request().url());if(u.origin!==BASE)return route.abort();
  if(u.pathname==='/__marca-aluno')return route.fulfill({contentType:mime['.html'],body:generated});
  const file=path.resolve(ROOT,'.'+decodeURIComponent(u.pathname));
  if(!file.startsWith(ROOT+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
  return route.fulfill({contentType:mime[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
 });
 const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.dismiss());
 await p.goto(BASE+'/demo-personal.html');await p.click('#btnDemo');await p.waitForURL(/personal\.html/);await p.waitForFunction(()=>window.MT_PERSONAL_MARCA&&window.__ptStudio);
 await p.evaluate(()=>{const s=MTStore.read('ptStudio',{});s.config={...s.config,nome:'Cadastro original',professor:'Ana Silva',pixNome:'ANA LEGAL',pixChave:'pix-ficticio',reciboZap:false};delete s.config.identidadeMarca;localStorage.setItem('mtapp:ptStudio',JSON.stringify(s));__renderPT();document.querySelector('#abas [data-a="pers"]').click();});
 await p.waitForFunction(()=>window.MT_FERRAMENTAS&&MT_FERRAMENTAS.ready());
 ok(await p.locator('#marcaForm').isVisible(),'editor no caminho normal da Personalização');
 eq(await p.locator('#marcaForm').evaluate(e=>e.closest('.ptf-pane').dataset.ptfPane),'marca','identidade na área de marca existente');
 eq(await p.locator('#marcaPreviewPrincipal').innerText(),'Cadastro original','prévia antiga não muda identidade');
 const before=await p.evaluate(()=>localStorage.getItem('mtapp:ptStudio'));
 await p.locator('#marcaModo').selectOption('ambos');await p.locator('#marcaEstudio').fill('Studio Horizonte');await p.locator('#marcaProfissional').fill('Ana Silva');await p.locator('#marcaCurto').fill('Horizonte');await p.locator('#marcaSlogan').fill('Movimento com cuidado');
 eq(await p.locator('#marcaPreviewPrincipal').innerText(),'Studio Horizonte','prévia em tempo real');eq(await p.locator('#marcaPreviewSecundario').innerText(),'Treinamento por Ana Silva','prévia separa profissional');
 eq(await p.evaluate(()=>localStorage.getItem('mtapp:ptStudio')),before,'digitar não grava nem publica');
 await p.locator('#marcaSalvar').click();
 let data=await p.evaluate(()=>MTStore.read('ptStudio',{}));
 eq(data.config.nome,'Cadastro original','nome da conta intacto');eq(data.config.pixNome,'ANA LEGAL','recebedor Pix intacto');eq(data.config.professor,'Ana Silva','nome profissional distinto');
 ok(!!data.config.appEditGeralEm,'marca entra na fila canônica de publicação');ok((await p.locator('#marcaStatus').innerText()).includes('Use Publicar'),'salvo não é anunciado como publicado');
 let dto=await p.evaluate(()=>__dadosApp(__loadPT().alunos[0],new Date().toISOString()));
 eq(dto.studio,'Studio Horizonte','pacotes antigos também recebem primary escolhido');eq(dto.identidadeApp.secundario,'Treinamento por Ana Silva','pacote publica segunda linha');
 ok(!JSON.stringify(dto.identidadeApp).includes('ANA LEGAL'),'identidade pública não expõe nome bancário');
 // Opções não se confundem: só nome, só marca, combinada invertida.
 for(const mode of ['profissional','estudio','ambos']){
  await p.locator('#marcaModo').selectOption(mode);if(mode==='ambos')await p.locator('#marcaDestaque').selectOption('profissional');await p.locator('#marcaSalvar').click();
  dto=await p.evaluate(()=>__dadosApp(__loadPT().alunos[0],new Date().toISOString()));eq(dto.studio,mode==='estudio'?'Studio Horizonte':'Ana Silva','identidade correta em '+mode);
 }
 eq(dto.identidadeApp.secundario,'Studio Horizonte','combinada com profissional em primeiro');
 // Falha, conflito e permissão não devem descartar o rascunho.
 await p.locator('#marcaEstudio').fill('Rascunho preservado');
 await p.evaluate(()=>{window.__originalWrite=MTStore.write;MTStore.write=()=>false;});await p.locator('#marcaSalvar').click();
 eq(await p.locator('#marcaEstudio').inputValue(),'Rascunho preservado','falha mantém os campos');ok((await p.locator('#marcaStatus').innerText()).includes('Não foi possível salvar'),'erro de gravação visível');
 await p.evaluate(()=>{MTStore.write=window.__originalWrite;document.querySelector('#abas [data-a="pers"]').style.display='none';});await p.locator('#marcaSalvar').click();ok((await p.locator('#marcaStatus').innerText()).includes('permissão'),'revalida permissão');
 await p.evaluate(()=>{document.querySelector('#abas [data-a="pers"]').style.display='';const s=MTStore.read('ptStudio',{});s.config.identidadeMarca.nomeEstudio='Mudou em outra aba';localStorage.setItem('mtapp:ptStudio',JSON.stringify(s));});
 await p.locator('#marcaSalvar').click();ok((await p.locator('#marcaStatus').innerText()).includes('outra sessão'),'conflito não sobrescreve a marca de outra sessão');
 await p.evaluate(()=>{window.confirm=()=>true;});await p.locator('#marcaRecarregar').click();eq(await p.locator('#marcaEstudio').inputValue(),'Mudou em outra aba','recarregar explícito recupera valor atual');
 await p.locator('#marcaModo').selectOption('ambos');await p.locator('#marcaDestaque').selectOption('estudio');await p.locator('#marcaEstudio').fill('Studio Horizonte');await p.locator('#marcaSalvar').click();
 generated=await p.evaluate(()=>MT_APP_ALUNO.monta(__dadosApp(__loadPT().alunos[0],new Date().toISOString())));
 const student=await context.newPage();student.on('pageerror',e=>errors.push(e.message));await student.goto(BASE+'/__marca-aluno');
 await student.waitForSelector('#heroTopo .al-brand-primary');
 for(const width of [320,390,1280]){
  await p.setViewportSize({width,height:1000});await student.setViewportSize({width,height:1000});
  ok(await p.locator('.ptmarca').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'editor sem overflow '+width);
  ok(await student.locator('#heroTopo .al-brand-primary').isVisible(),'identidade destacada no aluno '+width);
  ok(await student.locator('#heroTopo').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'nome não estoura o cabeçalho '+width);
 }
 eq(await student.locator('#heroTopo .al-brand-primary').innerText(),'Studio Horizonte','nome integral na home');eq(await student.locator('#heroTopo .al-brand-secondary').innerText(),'Treinamento por Ana Silva','autoria separada na home');
 ok(await student.locator('#heroTopo .al-brand-primary').evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=17),'nome não fica como legenda minúscula');
 ok((await student.title()).includes('Studio Horizonte'),'título do navegador usa identidade');
 const getHtml=()=>p.evaluate(()=>MT_APP_ALUNO.monta(__dadosApp(__loadPT().alunos[0],new Date().toISOString())));
 // Longos e texto malicioso: a marca é texto, não template executável.
 await p.setViewportSize({width:1280,height:1000});await p.locator('#marcaEstudio').fill('Studio de Movimento '+ 'Horizonte '.repeat(10));await p.locator('#marcaSlogan').fill('Cuidado, movimento e acompanhamento individual com respeito ao seu ritmo.');await p.locator('#marcaSalvar').click();generated=await getHtml();await student.reload();await student.setViewportSize({width:320,height:1000});
 ok(await student.locator('#heroTopo').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'nome longo continua dentro da tela');
 await student.waitForTimeout(100);
 ok(await student.evaluate(()=>{const h=document.getElementById('heroTopo').getBoundingClientRect();return [...document.querySelectorAll('#heroCarr .htk')].filter(e=>e.getBoundingClientRect().width>0).every(e=>e.getBoundingClientRect().top>=h.bottom);}), 'nome longo não cobre título nem ação do treino');
 await p.locator('#marcaEstudio').fill('<img src=x onerror="window.__marcaXss=1">');await p.locator('#marcaSalvar').click();generated=await getHtml();await student.reload();
 eq(await student.evaluate(()=>window.__marcaXss),undefined,'marca maliciosa não executa código');eq(await student.locator('#heroTopo .al-brand-primary img').count(),0,'nome não cria elementos HTML');
 await p.locator('#marcaEstudio').fill('Studio Horizonte');await p.locator('#marcaSlogan').fill('Movimento com cuidado');await p.locator('#marcaSalvar').click();generated=await getHtml();await student.reload();
 if(process.env.TORQUE_EVIDENCE_DIR){fs.mkdirSync(process.env.TORQUE_EVIDENCE_DIR,{recursive:true});await p.setViewportSize({width:390,height:1000});await student.setViewportSize({width:390,height:1000});await p.locator('.ptmarca').screenshot({path:path.join(process.env.TORQUE_EVIDENCE_DIR,'identidade-editor-mobile.png')});await student.screenshot({path:path.join(process.env.TORQUE_EVIDENCE_DIR,'identidade-aluno-mobile.png')});}
 eq(errors,[],'nenhuma exceção JavaScript no Personal/aluno');
 console.log(checks+' verificações de identidade na interface passaram.');await context.close();
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
