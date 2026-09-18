/* Template aprovado: executor canônico, fixture fictícia e nenhuma rede de produção.
 * O modo offline de prévia usa armazenamento em memória e não substitui o CI real. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {chromium} = require(process.env.TORQUE_PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright');
const {dados} = require('./test-aluno-player-experiencia');
const BASE=process.env.BASE_URL||'http://127.0.0.1:8765';
const PREVIEW=process.env.TORQUE_PREVIEW_MEMORY==='1';
const OUT=process.env.TORQUE_SCREENSHOTS||(process.env.RUNNER_TEMP?path.join(process.env.RUNNER_TEMP,'torque-testes','conclusao'):null);
let passed=0;
function ok(v,label){assert.ok(v,label);passed++;console.log('OK '+label);}
function fixture(){const d=dados();d.guiaFichasP[0].it[0].rpe=8;d.fichasApp[0].itens[0].rpe=8;return d;}
async function open(browser,width=390,theme='',D=fixture(),store){
  global.self=global;global.MT_CLOUD={url:'https://player.invalid',anonKey:'ficticio'};
  require('../app/aluno-skin');require('../app/aluno-builder');
  let html=global.MT_APP_ALUNO.monta(D);
  for(const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new Function(script[1]);
  const ctx=await browser.newContext({viewport:{width,height:1000},locale:'pt-BR',timezoneId:'America/Sao_Paulo',serviceWorkers:'block'});
  await ctx.route('**/*',r=>r.request().url().startsWith(BASE)?r.continue():r.abort());
  await ctx.route(BASE+'/template-player-test.html',r=>r.fulfill({contentType:'text/html',body:html}));
  const init={pttour:JSON.stringify({como:'teste'}),ptonb:JSON.stringify({feito:true}),...store};
  const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  if(PREVIEW){
    // Ambiente local não permite navegação HTTP. setContent não altera essa política.
    html=html.replace(/localStorage/g,'__previewStorage');
    await p.evaluate(init=>{let m={...init};window.__previewStorage={getItem:k=>m[k]??null,setItem:(k,v)=>{m[k]=String(v)},removeItem:k=>{delete m[k]},key:n=>Object.keys(m)[n]??null,get length(){return Object.keys(m).length}};},init);
    await p.setContent(html,{waitUntil:'domcontentloaded'});
  }else{
    await ctx.addInitScript(init=>{for(const[k,v]of Object.entries(init))localStorage.setItem(k,v);},init);
    await p.goto(BASE+'/template-player-test.html');
  }
  await p.waitForFunction(()=>window.__playerTemplate&&window.__acSessao);
  if(theme)await p.evaluate(theme=>document.documentElement.classList.add(theme),theme);
  await p.evaluate(()=>abreGuia(0));
  const click=async selector=>{await p.locator(selector).evaluate(n=>{for(let a=n.parentElement;a;a=a.parentElement)if(a.tagName==='DETAILS')a.open=true;});await p.click(selector);};
  return {p,ctx,errors,click};
}
async function main(){
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 try{
  const t=await open(browser),{p,click}=t;
  const records=()=>p.evaluate(()=>L('ptdc',{})['Supino teste']||[]);
  const completed=()=>p.evaluate(()=>GP.conta(GUIA[0].it[0],0));
  const reference=()=>p.locator('#gTemplatePrescription').innerText();
  ok(await p.isVisible('#gTemplateHero')&&await p.isVisible('#gTemplateTabs'),'hero e três abas pertencem ao executor real');
  ok(await p.isVisible('#gSerie'),'ação de registro acessível ao abrir');
  ok((await records()).length===0&&await p.inputValue('#gRpe')==='','abrir não registra série nem preenche esforço realizado com o prescrito');
  const before=await reference();ok(before.includes('60 kg')&&before.includes('90 s')&&before.includes('8'),'prescrição exibe dados reais, incluindo alvo de esforço');
  for(const tab of ['instructions','tips','video','instructions','video'])await click('#gTemplateTab-'+tab);
  ok(await p.locator('#gTec').count()===1,'alternar abas preserva controle técnico único');
  await p.locator('#gTemplateTab-video').focus();await p.keyboard.press('ArrowRight');
  ok(await p.locator('#gTemplateTab-instructions').getAttribute('aria-selected')==='true','teclado alterna abas e estado ARIA');
  await click('#gTemplateTab-video');
  await click('[data-gpt-step="gKg"][data-delta="1"]');
  ok(await p.inputValue('#gKg')==='61'&&(await records()).length===0,'stepper altera só o rascunho');
  await p.fill('#gReps','6');await p.fill('#gRpe','8,5');
  await click('[data-gserie="1"]');await click('[data-gserie="0"]');
  ok(await p.inputValue('#gRpe')==='8,5'&&await p.inputValue('#gKg')==='61','RPE e carga retomam na série correta');
  ok(await reference()===before,'editar resultado não altera prescrição');
  await p.fill('#gRpe','11');await click('#gSerie');
  ok(await completed()===0&&(await records()).length===0,'RPE inválido impede gravação e conclusão');
  ok((await p.locator('#gCgLab').innerText()).includes('RPE'),'erro identifica o campo de esforço opcional');
  await p.fill('#gRpe','8,5');await click('#gSerie');
  let r=(await records())[0];ok(r.feito&&r.kg===61&&r.r===6&&r.rpe===8.5,'confirmar grava um resultado por série com esforço informado');
  ok(await p.isVisible('#gTemplateSuccess')&&!await p.isVisible('#gMiolo2'),'confirmação abre tabela e feedback sem duplicar formulário');
  ok((await p.locator('[data-gpt-row="0"]').innerText()).includes('61 kg'),'tabela usa carga realizada');
  ok((await p.locator('[data-gpt-row="1"]').innerText()).includes('— kg'),'série pendente não recebe a carga prescrita na tabela');
  await click('[data-gpt-edit="0"]');await p.fill('#gKg','59');await click('#gSerie');
  r=(await records())[0];ok(await completed()===1&&(await records()).length===1&&r.kg===59&&r.rpe===8.5,'editar não duplica execução e conserva esforço');
  await p.evaluate(()=>__gGrava('Supino teste','58','6','0:0:0'));
  ok((await records())[0].rpe===8.5,'chamada antiga sem argumento RPE conserva dado já salvo');
  await click('[data-gserie="0"]');await p.fill('#gRpe','');await click('#gSerie');
  ok(!Object.hasOwn((await records())[0],'rpe'),'limpar RPE explicitamente remove só esse campo');
  await click('#gDesfazSerie');ok(await completed()===0&&(await records())[0].kg===58,'desfazer mantém anotação e remove conclusão');
  await click('#gTemplateFavorite');ok(await p.evaluate(()=>L('ptconf',{}).playerFavoritos.includes('Supino teste')),'favorito salva preferência sem criar execução');
  await click('#gTemplateFavorite');ok(await completed()===0,'remover favorito não toca séries');
  await p.fill('#gKg','0');await p.fill('#gReps','5');await p.fill('#gRpe','7');await click('#gSerie');
  ok((await records())[0].kg===0&&(await records())[0].rpe===7,'zero explícito preservado e distinto de ausência');
  await p.evaluate(()=>__zeraDescanso());
  ok(await p.isVisible('#gKg')&&await p.inputValue('#gKg')==='70','fim de descanso apresenta próxima série e seu alvo');
  await p.fill('#gKg','64');await p.fill('#gRpe','6,5');await click('#gFechar');
  await p.evaluate(()=>abreGuia(0));
  ok(await p.inputValue('#gRpe')==='6,5','fechar e retomar recupera esforço sem marcar execução');
  ok(await completed()===1,'retomada não conclui série pendente');
  const snapshot=await p.evaluate(()=>{const s={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);s[k]=localStorage.getItem(k);}return s;}).catch(()=>null);
  // Na prévia em memória, exportar o mesmo checkpoint pelo stub explícito.
  const persisted=snapshot||await p.evaluate(()=>{const s={};for(let i=0;i<__previewStorage.length;i++){const k=__previewStorage.key(i);s[k]=__previewStorage.getItem(k);}return s;});
  const resumed=await open(browser,390,'',fixture(),persisted);
  ok(await resumed.p.inputValue('#gRpe')==='6,5','novo documento recupera checkpoint sem transferir esforço para outra série');
  await resumed.ctx.close();
  await click('#gPularEx');ok(await p.evaluate(()=>__gvDe().e===1)&&await completed()===1,'próximo exercício preserva pendências sem fabricar conclusão');
  await p.fill('#gKg','');await p.fill('#gReps','');await p.fill('#gRpe','');await click('#gSerie');
  ok(await p.isVisible('#gFecharTreino'),'última série mantém Terminar treino visível na revisão');
  await click('#gFecharTreino');
  ok(await p.isVisible('#gRevisaoSeries'),'último exercício abre resumo canônico');
  await click('#gRevisaoSeries summary');await click('[data-grever="1"][data-ge="0"]');
  ok(await p.isVisible('#gRpe'),'resumo permite rever esforço da série exata');
  await p.fill('#gRpe','4');await click('#gSalvar');
  ok((await records()).find(x=>x.serie===2).rpe===4&&await completed()===1,'anotação tardia de esforço não conclui série pendente');
  await click('#gVoltaFim');ok(await p.isVisible('#gRevisaoSeries'),'voltar ao resumo mantém recibo legível');
  ok(t.errors.length===0,'ciclo sem exceções JavaScript: '+t.errors.join('; '));await t.ctx.close();
  for(const width of [320,390,1280])for(const theme of ['', 'claro']){
   const x=await open(browser,width,theme),q=x.p;
   ok(await q.evaluate(()=>{const b=document.getElementById('guiaBox'),c=document.getElementById('gCard');return b.scrollWidth<=b.clientWidth+1&&c.scrollWidth<=c.clientWidth+1;}),width+' '+theme+': sem corte horizontal');
   ok(await q.locator('#gTemplateTabs [role=tab]').count()===3,width+' '+theme+': três abas únicas');
   ok(await q.locator('#gSerie').evaluate(b=>getComputedStyle(b).color==='rgb(255, 255, 255)'),width+' '+theme+': texto da ação principal com contraste');
   ok(await q.evaluate(()=>{const a=document.getElementById('gSerie').getBoundingClientRect(),n=document.getElementById('gTemplateBottom').getBoundingClientRect();return a.top>=0&&a.bottom<=n.top+1&&n.bottom<=innerHeight+1;}),width+' '+theme+': ação fixa não fica sob a navegação');
   await q.fill('#gRpe','8');await x.click('#gSerie');
   ok(await q.isVisible('#gTemplateSuccess'),width+' '+theme+': feedback após confirmação');
   await x.click('#gPularEx');
   await q.fill('#gKg','0');await q.fill('#gReps','12');await x.click('#gSerie');
   ok(await q.isVisible('#gFecharTreino'),width+' '+theme+': término disponível sem sair da revisão');
   ok(await q.locator('#gFecharTreino').evaluate(b=>{const r=b.getBoundingClientRect();return r.height>=44&&r.top>=0&&r.bottom<=innerHeight+1;}),width+' '+theme+': término alcançável na tela');
   await x.click('#gFecharTreino');
   ok(await q.isVisible('#gFim') && await q.locator('#gFim').evaluate(b=>b.getBoundingClientRect().height>=58),width+' '+theme+': recibo preserva fechamento destacado');
   ok(await q.locator('#gMiolo .fim-celebracao').isVisible() && await q.locator('#gMiolo .wtile2').count()===2 && await q.locator('#gMiolo .rperow').isVisible(),width+' '+theme+': conclusão destaca a conquista, só dois números e o esforço');
   ok(await q.locator('#gMiolo .fim-detalhes').evaluate(d=>!d.open&&/Séries feitas aqui/.test(d.textContent)&&/Cargas anotadas/.test(d.textContent)&&/Tempo de treino/.test(d.textContent)),width+' '+theme+': recibo técnico permanece recolhido e disponível');
   ok(!await q.isVisible('.gpt-top') && !await q.isVisible('.gpt-progress'),width+' '+theme+': conclusão remove cabeçalho de progresso redundante');
   ok(!await q.isVisible('#gTemplateHero') && !await q.isVisible('#gMiolo2'),width+' '+theme+': conclusão não deixa cartões vazios do exercício');
   ok(x.errors.length===0,width+' '+theme+': nenhuma exceção');
   if(OUT){fs.mkdirSync(OUT,{recursive:true});await q.screenshot({path:path.join(OUT,'template-'+width+'-'+(theme||'escuro')+'.png')});}
   await x.ctx.close();
  }
  console.log(passed+' verificações passaram'+(PREVIEW?' (prévia em memória; falta armazenamento real/CI).':'.'));
 }finally{await browser.close();}
}
module.exports={open,fixture};if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
