/* Prescrição pelo painel real. Somente alunos sintéticos e rede externa bloqueada. */
const assert=require('node:assert/strict');
let chromium;try{chromium=require('playwright').chromium;}catch(_){chromium=require('/opt/node22/lib/node_modules/playwright').chromium;}
const {comMockNuvem}=require('./_nuvem.js');
const BASE=process.env.BASE_URL||'http://127.0.0.1:8765';
let browser,n=0;
function eq(a,b,m){assert.deepEqual(a,b,m);n++;console.log('OK '+m);}
function ok(a,m){assert.ok(a,m);n++;console.log('OK '+m);}
(async()=>{
 browser=comMockNuvem(await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']}));
 const ctx=await browser.newContext({viewport:{width:1280,height:1000},timezoneId:'America/Sao_Paulo',serviceWorkers:'block'});
 await ctx.route('**/*',r=>new URL(r.request().url()).origin===new URL(BASE).origin?r.continue():r.abort());
 const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 await p.clock.setFixedTime(new Date('2026-09-11T12:00:00-03:00'));
 await p.goto(BASE+'/demo-personal.html');await p.click('#btnDemo');await p.waitForURL(/personal\.html/);await p.waitForFunction(()=>window.__cardiosPT&&window.MT_RELATORIO_0809);
 await p.evaluate(()=>{
  const s=MTStore.read('ptStudio',{});
  s.alunos=[{id:'etapas-a',nome:'Corredor etapas A',ativo:true,appTokenP:'token-etapas-a-sintetico',appPubEm:'2026-09-01T12:00:00Z'},{id:'etapas-b',nome:'Corredor etapas B',ativo:true}];
  s.config=Object.assign({},s.config,{dia1Off:true,zapFilaOff:true});
  s.treinosV2={'etapas-a':{fichas:[{id:'forca-a',titulo:'Força preservada',itens:[]}],zonasCorrida:[{id:'zona-a',nome:'Rodagem original',tipo:'pace',min:300,max:360}],cardio:[{id:'legado',nome:'Contínuo legado',tipo:'continuo',mod:'corrida',dist:5,tempo:30,pace:'6:30',reps:8,tiro:60,desc:90,obs:'Ritmo conversável'}]},'etapas-b':{fichas:[],zonasCorrida:[],cardio:[]}};
  localStorage.setItem('mtapp:ptStudio',JSON.stringify(s));__ptStudio.render();
  document.querySelector('#abas [data-a="treinos"]').click();document.querySelector('#trAbas [data-tra="cardio"]').click();
 });
 const store=()=>p.evaluate(()=>MTStore.read('ptStudio',{}));
 const blocks=()=>p.evaluate(()=>JSON.parse(document.getElementById('cbBlocos').value||'[]'));
 async function quick(action,value,unit){await p.locator('[data-r827-add="'+action+'"]').click();if(value!==undefined)await p.locator('#r809AlvoValor').fill(String(value));if(unit)await p.locator('#r809AlvoUnidade').selectOption(unit);}
 async function effort(prefix,type,min,max=''){await p.locator('#'+prefix+'Esforco').selectOption(type);if(type&&type!=='zona'){await p.locator('#'+prefix+'Min').fill(min);await p.locator('#'+prefix+'Max').fill(max);}}
 const apply=()=>p.locator('#r809BlocoAdd').click();
 async function action(kind,index){const b=p.locator('[data-r809-block'+(kind==='remove'?'':'-'+kind)+'="'+index+'"]');await b.locator('xpath=ancestor::details[1]').locator('summary').click();await b.click();}
 async function edit(index){await p.locator('[data-r809-block-edit="'+index+'"]').click();}
 await p.locator('#cbAluno').selectOption('etapas-a');await p.locator('#cbEditor > summary').click();
 eq(await p.locator('#cbModo').inputValue(),'etapas','novo treino começa em etapas livres');
 ok(await p.locator('#r809BlocosBox').isVisible(),'sequência fica aberta sem expandir editor avançado');
 ok(!await p.locator('#cbSimples').isVisible(),'campos do formato simples ficam recolhidos');
 await p.locator('#cbNome').fill('Correr e caminhar 3,3 km');await p.locator('#cbSalva').click();
 ok((await p.locator('#cbStatus').innerText()).includes('pelo menos uma etapa'),'sequência vazia não salva treino contínuo por engano');
 await quick('correr',1,'km');ok(!await p.locator('#r809AlvoFaixa').isVisible(),'esforço é opcional por padrão');await apply();
 await quick('caminhar',100);eq(await p.locator('#r809AlvoUnidade').inputValue(),'m','atalho Caminhar começa em metros');await apply();
 await quick('correr',2,'km');await apply();await quick('caminhar',200,'m');await apply();
 const example=await blocks();
 eq(example.map(b=>[b.alvo.acao,b.alvo.valor,b.alvo.unidade]),[['correr',1,'km'],['caminhar',100,'m'],['correr',2,'km'],['caminhar',200,'m']],'exemplo preserva trechos diferentes na ordem prescrita');
 ok(example.every(b=>!b.alvo.esforco&&!b.alvo.zona),'trechos sem esforço não recebem metas inventadas');
 ok((await p.locator('#r809BlocosResumo').innerText()).includes('4 etapas · 3,3 km'),'resumo soma quilômetros e metros sem perder precisão');
 eq((await store()).treinosV2['etapas-a'].cardio.length,1,'montar etapas altera apenas o rascunho');
 await p.locator('#cbSalva').click();let s=await store(),saved=s.treinosV2['etapas-a'].cardio.find(c=>c.nome==='Correr e caminhar 3,3 km');
 ok(!!saved,'Salvar treino grava a sequência nomeada');eq(saved.blocos,example,'treino salvo preserva as quatro etapas');
 eq(s.alunos[0].appPubEm,'2026-09-01T12:00:00Z','salvar não simula publicação do app');
 ok(!!s.alunos[0].appEditEm,'salvar marca conteúdo pendente para publicação');
 const dto=await p.evaluate(()=>__dadosApp(MTStore.read('ptStudio',{}).alunos[0],'teste'));
 eq(dto.cardiosApp.find(c=>c.id===saved.id).blocos,example,'publicador canônico entrega exatamente a prescrição salva');
 eq((await store()).treinosV2['etapas-a'].fichas[0].titulo,'Força preservada','prescrição de corrida conserva musculação');
 // Edição, duplicação e ordem usam a linha principal e o menu de cada etapa.
 await p.locator('[data-cbed="'+saved.id+'"]').click();await edit(1);await p.locator('#r809AlvoValor').fill('150');await apply();
 await action('copy',1);eq((await blocks()).length,5,'duplicar cria uma etapa independente');
 await edit(2);await p.locator('#r809AlvoValor').fill('75');await apply();eq((await blocks())[1].alvo.valor,150,'editar cópia mantém a etapa original');
 await action('up',2);await action('down',0);eq((await blocks()).slice(0,3).map(b=>b.alvo.valor),[75,1,150],'subir e descer conservam etapas e alteram somente a ordem');
 await action('remove',0);eq((await blocks()).length,4,'remover afeta apenas a etapa escolhida');
 eq((await store()).treinosV2['etapas-a'].cardio.find(c=>c.id===saved.id).blocos,example,'ações da sequência permanecem no rascunho até Salvar treino');
 await p.locator('#cbLimpa').click();eq(await blocks(),[],'cancelar edição descarta somente o rascunho');
 // Esforços diretos são específicos da etapa e aceitam alvo único ou faixa.
 await p.locator('#cbNome').fill('Esforços diretos');
 const direct=[['rpe','4','',{tipo:'rpe',min:4,max:4}],['pace','5:30','6:00',{tipo:'pace',min:330,max:360}],['fc','140','155',{tipo:'fc',min:140,max:155}],['velocidade','8,5','10',{tipo:'velocidade',min:8.5,max:10}]];
 for(const [type,min,max,expected] of direct){await quick('correr',1,'km');await effort('r809Alvo',type,min,max);await apply();eq((await blocks()).at(-1).alvo.esforco,expected,'esforço '+type+' mantém unidade e limites');}
 await edit(0);await p.locator('#r809AlvoOrientacao').locator('xpath=ancestor::details[1]').locator('summary').click();await p.locator('#r809AlvoOrientacao').fill('Mantenha o percurso combinado.');await apply();
 eq((await blocks())[0].alvo.orientacao,'Mantenha o percurso combinado.','orientação fica na própria etapa');
 const valid=JSON.stringify(await blocks());
 for(const invalid of [{value:'0'},{value:'1',type:'rpe',min:'11',max:''},{value:'1',type:'pace',min:'5:99',max:'6:00'},{value:'1',type:'pace',min:'6:00',max:'5:00'},{value:'1',type:'fc',min:'140.5',max:'155'},{value:'1',type:'zona'}]){
  await quick('correr',invalid.value,'km');if(invalid.type)await effort('r809Alvo',invalid.type,invalid.min,invalid.max);await apply();
  eq(JSON.stringify(await blocks()),valid,'entrada inválida não altera sequência: '+(invalid.type||'distância'));
  ok(await p.locator('#r827EtapaEditor').isVisible(),'erro mantém editor para corrigir');await p.locator('#r809BlocoCancel').click();
 }
 await p.locator('#cbSalva').click();s=await store();const directs=s.treinosV2['etapas-a'].cardio.find(c=>c.nome==='Esforços diretos');ok(!!directs,'treino com esforços diretos é salvo');
 await p.locator('[data-cbed="'+directs.id+'"]').click();await edit(1);eq(await p.locator('#r809AlvoMin').inputValue(),'5:30','reabrir esforço de ritmo restaura minutos:segundos');await p.locator('#r809BlocoCancel').click();await p.locator('#cbLimpa').click();
 // Repetições preservam ação, distância/tempo e esforços de cada parte.
 await p.locator('#cbNome').fill('Repetições distintas');await quick('repetir',500,'m');await p.locator('#r809BlocoReps').fill('3');
 await effort('r809Alvo','rpe','6','7');await p.locator('#r809RecAcao').selectOption('caminhar');await p.locator('#r809RecValor').fill('60');await p.locator('#r809RecUnidade').selectOption('s');await effort('r809Rec','rpe','2');await apply();
 const rep=(await blocks())[0];eq([rep.tipo,rep.repeticoes,rep.alvo.acao,rep.recuperacao.acao],['repetir',3,'correr','caminhar'],'repetição mantém ações de esforço e recuperação');
 eq(rep.recuperacao.esforco,{tipo:'rpe',min:2,max:2},'recuperação possui alvo próprio');
 ok((await p.locator('#r809BlocosResumo').innerText()).includes('6 etapas · 1,5 km + 3 min'),'resumo expande repetições sem somar tempo à distância');
 // Rascunho de etapa e modo de criação são isolados por aluno.
 await quick('caminhar',125,'m');await effort('r809Alvo','rpe','3');await p.locator('#cbAluno').selectOption('etapas-b');
 eq(await blocks(),[],'outro aluno não recebe sequência do anterior');eq(await p.locator('#r809AlvoValor').inputValue(),'','outro aluno não recebe etapa em edição');
 await p.locator('#cbAluno').selectOption('etapas-a');eq((await blocks())[0],rep,'retorno ao aluno restaura sequência');eq(await p.locator('#r809AlvoValor').inputValue(),'125','retorno restaura quantidade ainda não aplicada');eq(await p.locator('#r809AlvoMin').inputValue(),'3','retorno restaura esforço ainda não aplicado');
 await p.locator('#cbSalva').click();ok(!(await store()).treinosV2['etapas-a'].cardio.some(c=>c.nome==='Repetições distintas'),'salvar com etapa incompleta não descarta seu rascunho');
 await p.locator('#r809BlocoCancel').click();await p.locator('#cbSalva').click();ok((await store()).treinosV2['etapas-a'].cardio.some(c=>c.nome==='Repetições distintas'),'após cancelar etapa pendente salva a sequência aplicada');
 // Zona continua sendo uma alternativa opcional, conservando snapshots.
 await p.locator('[data-cbed="'+saved.id+'"]').click();await edit(0);await effort('r809Alvo','zona');await p.locator('#r809ZonaAlvo').selectOption('zona-a');await apply();
 await p.locator('#r809ZonasBox > summary').click();await p.locator('[data-r809-zone-edit="zona-a"]').click();await p.locator('#r809ZonaMin').fill('4:30');await p.locator('#r809ZonaMax').fill('5:30');await p.locator('#r809ZonaAdd').click();
 eq((await blocks())[0].alvo.zona.min,300,'editar biblioteca conserva snapshot da etapa');
 await edit(0);eq(await p.locator('#r809AlvoEsforco').inputValue(),'zona','reabrir etapa identifica a zona prescrita');ok((await p.locator('#r809ZonaAlvo option:checked').innerText()).includes('Manter zona prescrita'),'zona prescrita antiga é explícita');
 await p.locator('#r809AlvoValor').fill('1.2');await apply();eq((await blocks())[0].alvo.zona.min,300,'alterar distância preserva faixa original da zona');
 await edit(0);await p.locator('#r809ZonaAlvo').selectOption('zona-a');await apply();eq((await blocks())[0].alvo.zona.min,270,'troca explícita usa a zona atualizada');await p.locator('#cbLimpa').click();
 // Treino legado abre no modo apropriado e mantém os parâmetros salvos.
 const legacy=(await store()).treinosV2['etapas-a'].cardio.find(c=>c.id==='legado');
 await p.locator('[data-cbed="legado"]').click();eq(await p.locator('#cbModo').inputValue(),'simples','treino legado abre no formato simples');
 ok(await p.locator('#cbSimples').isVisible(),'controles contínuos legados continuam disponíveis');eq(await blocks(),[],'treino simples não recebe etapas inventadas');
 await p.locator('#cbSalva').click();eq((await store()).treinosV2['etapas-a'].cardio.find(c=>c.id==='legado'),legacy,'salvar legado sem alteração preserva seus campos');
 eq((await store()).treinosV2['etapas-b'].cardio,[],'nenhum fluxo grava treino no outro aluno');
 eq(errors,[],'prescrição completa executa sem erros JavaScript');await ctx.close();console.log(n+' verificações de etapas no Personal passaram.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
