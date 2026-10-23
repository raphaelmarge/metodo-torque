/* Contratos aluno/anamnese: relato não aprova treino; isolamento, offline e retorno. */
'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path');
let pw;try{pw=require('playwright');}catch(e){pw=require(process.env.PLAYWRIGHT_PATH||'/opt/node22/lib/node_modules/playwright');}
const root=path.resolve(__dirname,'..'),BASE='http://127.0.0.1:8794';
global.self=global;global.MT_CLOUD={url:'https://mensal-test.invalid',anonKey:'fixture'};
require('../app/aluno-skin.js');require('../app/aluno-builder.js');
const monthly={version:1,active:{id:'ciclo-outubro',start:'2026-10-01',end:'2026-10-31',summary:'Consolidar o planejamento.',watch:['Registrar esforço.'],approvedAt:'2026-10-01'},privateHealth:'NAO_PODE_PUBLICAR',profile:{diagnosis:'NAO_PODE_PUBLICAR'}};
const base={a:{id:'aluno-fixture',nome:'Aluno Teste',appTokenP:'fixture-token-aluno-12345'},studio:'Studio teste',cfg:{},avs:[],atualizador:'',wodsApp:[],cardiosApp:[],geradorMensal:monthly,
  fichasApp:[{id:'ficha-mensal-1',titulo:'A — Treino',itens:[{exId:'gm-remada',nome:'Remada',grupo:'Costas',series:1,reps:'10',descanso:60,alts:['Alternativa automática indevida'],geradorMensal:{unit:'kg',loadBasis:'total',variation:'remada',equipment:'polia',context:{id:'gm-context-fixture',source:'prescribed_configuration',reviewRequired:true}}}]}],
  aqPorFicha:[[['Polichinelo automático indevido','60s'],['Prancha automática indevida','20s']]],
  guiaFichasP:[{id:'ficha-mensal-1',n:'A — Treino',it:[{e:'Remada',s:1,r:'10',d:60}]}],fexs:[{n:'Remada',s:1}],
  COR:'#7c3aed',COR2:'#5b21b6',CORC:'#a78bfa',CORE:'#4c1d95',CORCL1:'#ddd6fe',CORCL2:'#ede9fe',PAL:['#0d0c10','#111017','#18151f','#1e1927','#25202f','#2b2536','#312b3d','#383045','#40374e','#473f58','#504660','#594e6a','#625874']};
const html=MT_APP_ALUNO.monta(base),legacy=MT_APP_ALUNO.monta({...base,geradorMensal:null});
for(const body of [html,legacy])for(const s of body.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))if(s[1].trim())new Function(s[1]);
assert(!html.includes('NAO_PODE_PUBLICAR'),'Somente campos públicos do ciclo entram no pacote do aluno');
assert(!html.includes('Alternativa automática indevida')&&!html.includes('Polichinelo automático indevido'),'A etapa mensal não incorpora substituições nem aquecimento automáticos');
let browser,checks=0;function ok(v,m){assert.ok(v,m);checks++;console.log('OK '+m);}
(async()=>{
  browser=await pw.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/opt/pw-browsers/chromium',headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/Sao_Paulo',locale:'pt-BR',serviceWorkers:'block'}),page=await context.newPage(),returns=[],errors=[];
  let rpcOk=true;
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',route=>{const url=new URL(route.request().url());
    if(url.hostname==='mensal-test.invalid'){if(url.pathname.endsWith('/app_aluno_devolve')){returns.push(route.request().postDataJSON());return route.fulfill({json:rpcOk?{ok:true}:{erro:'fixture failure'}});}return route.fulfill({json:[]});}
    if(url.origin!==BASE)return route.abort();
    if(url.pathname==='/mensal.html')return route.fulfill({contentType:'text/html',body:html});
    if(url.pathname==='/legacy.html')return route.fulfill({contentType:'text/html',body:legacy});
    if(url.pathname==='/assets/cloud-config.js')return route.fulfill({contentType:'application/javascript',body:'self.MT_CLOUD={url:"https://mensal-test.invalid",anonKey:"fixture"};'});
    const file=path.join(root,url.pathname.slice(1));if(file.startsWith(root)&&fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({contentType:file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':'text/plain',body:fs.readFileSync(file)});return route.abort();
  });
  await page.clock.setFixedTime(new Date('2026-10-23T12:00:00Z'));
  await context.addInitScript(()=>{localStorage.setItem('tq_app_token','fixture-token-aluno-12345');localStorage.setItem('pttour','{}');localStorage.setItem('ptonb','{"feito":true}');localStorage.setItem('ptdc',JSON.stringify({Remada:[{d:'2026-10-20',kg:20,r:10},{d:'2026-10-21',kg:20,r:10}]}));});
  await page.goto(BASE+'/mensal.html');await page.waitForFunction(()=>window.__gmAluno);
  ok(await page.evaluate(()=>window.__gSugere('Remada','10',0))===0,'Ciclo mensal desativa sugestão autônoma de carga');
  ok(await page.evaluate(()=>GUIA[0].it[0].exercicioId==='gm-remada'&&GUIA[0].it[0].geradorMensal.loadBasis==='total'),'GUIA conserva identidade e contexto explícitos da prescrição');
  ok(await page.evaluate(()=>GUIA[0].fichaId==='ficha-mensal-1'&&GUIA[0].aq===null&&!GUIA[0].it[0].al.length),'Guia mantém fichaId e exclui acréscimos fora da proposta');
  await page.waitForFunction(()=>TH.ready());
  await page.evaluate(()=>abreGuia(0));
  ok(await page.locator('#gKg').inputValue()==='','Carga mensal a definir não é preenchida pelo histórico legado');
  ok(await page.evaluate(()=>{GIF={b:'https://fixture.invalid/',p:'traco'};return gifUrl('Remada','')==='';}),'Mídia mensal não é deduzida pelo nome do exercício');
  ok(await page.evaluate(()=>{if(!gGrava('Remada',20,10,'0:0:0',7))return false;var r=L('ptdc',{}).Remada.filter(r=>r.g===2).pop();return r.fichaId==='ficha-mensal-1'&&r.exercicioId==='gm-remada'&&r.context.id==='gm-context-fixture';}),'Novo registro real conserva ficha, exercício e contexto da etapa');
  await page.locator('#gTemplateTab-tips').evaluate(el=>{for(var p=el.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;});await page.click('#gTemplateTab-tips');
  await page.click('#acRelatar');await page.fill('dialog.ac-feedback textarea','Mudança no apoio durante este exercício.');await page.click('#acRelatarSaude');
  ok((await page.locator('#gmReport_healthChanges').inputValue()).includes('Remada')&&await page.locator('#gmAlunoForm').isVisible(),'Relato no exercício encaminha contexto para saúde sem enviar automaticamente');
  ok(await page.evaluate(()=>{var r={};contextoSerieMensal(r,GUIA[0].it[0],null);return r.context.id==='gm-context-fixture'&&r.context!==GUIA[0].it[0].geradorMensal.context;}),'Registro novo recebe cópia do contexto prescrito versionado');
  ok(await page.evaluate(()=>{var r={};contextoSerieMensal(r,GUIA[0].it[0],{});return !r.unit;}),'Registro legado não ganha contexto do catálogo retroativamente');
  await page.evaluate(()=>window.__gmAluno.open('monthly'));
  ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Formulário mensal cabe na largura do celular');
  ok(await page.locator('#gmAlunoForm button[type=submit]').isDisabled(),'Fechamento aguarda fim do ciclo ou solicitação do personal');
  await page.fill('#gmReport_difficulty','Meu relato em rascunho');await page.reload();await page.waitForFunction(()=>window.__gmAluno);
  ok(await page.locator('#gmReport_difficulty').inputValue()==='Meu relato em rascunho','Rascunho mensal sobrevive à reabertura');
  await page.evaluate(()=>window.__gmAluno.open('health'));await page.fill('#gmReport_healthChanges','Nova limitação informada para revisão.');await page.selectOption('#gmReport_symptoms','sim');
  const health=await page.evaluate(()=>window.__gmAluno.submit());ok(health&&health.kind==='health'&&health.author==='aluno','Sintomas podem ser relatados antes do fechamento');
  await page.waitForTimeout(2200);
  ok(returns.some(r=>r.p_dados.geradorMensal?.reports['ciclo-outubro']?.revisions[health.id]),'Relato usa app_aluno_devolve com token do aluno');
  ok(!JSON.stringify(health).includes('approved')&&!JSON.stringify(health).includes('confirmed'),'Relato não cria aprovação do personal');
  await page.evaluate(()=>{GERADOR_MENSAL.reviewRequested=true;window.__gmAluno.open('monthly');});
  await page.selectOption('#gmReport_perception','melhorou');await page.selectOption('#gmReport_recovery','boa');await page.selectOption('#gmReport_routineChanged','nao');await page.selectOption('#gmReport_symptoms','nao');await page.fill('#gmReport_healthChanges','');
  await page.fill('#gmReport_minutes','500');ok(await page.evaluate(()=>window.__gmAluno.submit())===false,'Duração fora dos limites é rejeitada');await page.check('[name=gmReportDay][value="1"]');await page.check('[name=gmReportDay][value="3"]');await page.check('[name=gmReportDay][value="5"]');await page.fill('#gmReport_minutes','45');
  const report=await page.evaluate(()=>window.__gmAluno.submit());ok(report&&report.kind==='monthly'&&report.data.minutes===45,'Fechamento solicitado produz revisão própria');
  ok(await page.evaluate(()=>Object.keys(window.__gmAluno.packet().reports['ciclo-outubro'].revisions).length)===2,'Nova revisão mantém relato de saúde anterior');
  await page.evaluate(()=>{window.__gmAluno.open('health');window.__oldStorageSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.includes(':revision:'))throw Error('QuotaExceeded');return window.__oldStorageSet.call(this,k,v);};});
  await page.fill('#gmReport_healthChanges','Falha de gravação');ok(await page.evaluate(()=>window.__gmAluno.submit())===false,'Falha de armazenamento não declara relato salvo');
  ok(await page.locator('#gmAlunoForm').isVisible(),'Falha conserva o formulário preenchido');
  await page.evaluate(()=>{Storage.prototype.setItem=window.__oldStorageSet;localStorage.setItem('tq_app_token','outro-token');});
  ok(await page.evaluate(()=>window.__gmAluno.submit())===false,'Troca de identidade bloqueia a gravação');
  ok(await page.evaluate(()=>Object.keys(window.__gmAluno.packet().reports).length)===0,'Troca de identidade não exporta relato do aluno anterior');
  await page.goto(BASE+'/legacy.html');await page.waitForFunction(()=>window.__gSugere);
  ok(await page.evaluate(()=>window.__gSugere('Remada','10',0))===22.5,'Pacote legado preserva sugestão existente');
  await page.goto(BASE+'/anamnese.html?t=fixture-token-anamnese-67890');
  ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Anamnese cabe na largura do celular');
  ok(await page.locator('#gmGoal option').count()===6,'Anamnese oferece exatamente cinco objetivos do núcleo');
  await page.selectOption('#fNivel','intermediario');await page.selectOption('#gmGoal','hipertrofia');await page.check('[name=gmDay][value="1"]');await page.check('[name=gmDay][value="3"]');await page.fill('#gmMinutes','45');
  await page.selectOption('#gmHealth','reported');await page.check('#gmDiabetes');await page.selectOption('#gmDiabetesType','type2');await page.fill('#gmDiabetesTreatment','Orientação informada, a conferir');await page.check('[name=gmEquipment][value="halteres"]');await page.check('[name=gmAvailable][value="grip_single"]');
  ok(await page.locator('#gmDiabetesType').isVisible(),'Perguntas adicionais aparecem conforme condições relatadas');
  await page.reload();ok(await page.locator('#gmDiabetes').isChecked()&&await page.locator('#gmGoal').inputValue()==='hipertrofia','Anamnese recupera rascunho por token');
  const profile=await page.evaluate(()=>window.__anamnese.monta());
  ok(profile.geradorMensal.level==='intermediario'&&profile.geradorMensal.days.length===2&&profile.dias==='2','Perfil estruturado preserva campos legados e usa enums do motor');
  ok(profile.geradorMensal.source==='aluno'&&!profile.geradorMensal.reviewedAt&&!profile.geradorMensal.guidance?.reviewed,'Anamnese é relato sem confirmação clínica');
  rpcOk=false;await page.click('#btnEnviar');await page.waitForTimeout(150);ok(await page.locator('#form').isVisible()&&await page.locator('#gmMinutes').inputValue()==='45','Falha de envio da anamnese preserva preenchimento');
  rpcOk=true;await page.click('#btnEnviar');await page.waitForSelector('#fim',{state:'visible'});ok(returns.some(r=>r.t==='fixture-token-anamnese-67890'&&r.p_dados.anamnese?.geradorMensal),'Anamnese envia complemento no retorno existente');
  ok(errors.length===0,'Interfaces executam sem erros JavaScript: '+errors.join('; '));
  await browser.close();console.log(checks+' verificações passaram.');
})().catch(async e=>{console.error(e);if(browser)await browser.close();process.exitCode=1;});
