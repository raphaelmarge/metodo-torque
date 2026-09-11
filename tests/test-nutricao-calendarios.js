/* Programação integrada: builder real, contas sintéticas, sem rede de produção. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
let prefix=fs.readFileSync(path.join(__dirname,'test-nutricao-navegacao.js'),'utf8').split('async function run(){')[0];
prefix=prefix.replace('async function mount(plan=DEMO, seed={})','async function mount(plan=DEMO, seed={}, overrides={})')
 .replace('  const memory = {','  Object.assign(D,overrides);\n  const memory = {');
const app=new Function('require','__dirname',prefix+`\nreturn {mount,snapshot,errors,DEMO,TODAY,
 async start(){browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/opt/pw-browsers/chromium',args:['--no-sandbox']});},
 async close(){if(browser)await browser.close();}};`)(require,__dirname);
let count=0;function ok(v,m){assert.ok(v,m);count++;console.log('OK '+m);}function eq(v,w,m){assert.deepEqual(v,w,m);count++;console.log('OK '+m);}
const clone=v=>JSON.parse(JSON.stringify(v));
const plan={...clone(app.DEMO),inicio:'2026-09-10',fim:'2026-09-30',refeicoes:clone(app.DEMO.refeicoes.slice(0,2)).map(r=>({...r,dias:[4,5]}))};
const training={planoApp:{'2':[{tp:'ficha',i:0,h:'18:00',n:'Treino de teste'}],'4':[{tp:'ficha',i:0,h:'18:00',n:'Treino de teste'}]},
 fichasApp:[{titulo:'Treino de teste',itens:[{nome:'Movimento teste',series:1,reps:'5',descanso:60}]}],
 guiaFichasP:[{n:'Treino de teste',it:[{e:'Movimento teste',s:1,r:'5',d:60}]}],fexs:[{n:'Movimento teste',s:1}]};
async function view(p,v){await p.evaluate(v=>{window.__trocaSec(v);if(v==='evolucao')window.__evSub('conq');},v);}
async function marks(p,selector){return p.locator(selector+' .mt-dia-pontos i').evaluateAll(xs=>xs.map(x=>x.className));}
(async()=>{
 await app.start();const {p,ctx}=await app.mount(plan,{},training);
 await p.waitForFunction(()=>window.__nutriCal&&document.querySelector('#diasSem .mt-ponto-alimentacao'));
 const before=await app.snapshot(p);
 eq(await p.evaluate(()=>window.__nutriAluno.programadas('2026-09-10').map(r=>r.h)),['07:30','12:30'],'horários derivam do plano publicado');
 for(const d of ['2026-09-09','2026-09-12','2026-10-01','invalid','2026-02-31'])eq(await p.evaluate(d=>window.__nutriAluno.programadas(d),d),[],'sem refeição fora da vigência/dias ou data inválida '+d);
 eq(await p.evaluate(()=>window.__agItens('2026-09-10').map(i=>i.h)),['07:30','12:30','18:00'],'refeições e treino aparecem na ordem do relógio');
 await view(p,'inicio');
 eq(await marks(p,'[data-semd="2026-09-10"]'),['mt-ponto-treino','mt-ponto-alimentacao'],'Minha semana exibe as duas bolinhas independentes');
 eq(await marks(p,'[data-semd="2026-09-11"]'),['mt-ponto-alimentacao'],'dia só com alimentação recebe apenas verde');
 eq(await marks(p,'[data-semd="2026-09-08"]'),['mt-ponto-treino'],'dia só com treino recebe apenas roxa');
 eq(await marks(p,'[data-semd="2026-09-12"]'),[],'dia livre não inventa programação');
 await p.locator('[data-semd="2026-09-10"]').click();
 eq(await p.locator('#semDia [data-nutri-dia]').count(),2,'gaveta da primeira página inclui as duas refeições');
 eq(await p.locator('#semDia [data-semt]').count(),1,'atalho de treino original foi preservado');
 await p.locator('#semDia [data-nutri-ref="cafe"]').click();
 eq(await p.locator('#ntpData').inputValue(),'2026-09-10','clicar na refeição abre a mesma data');
 ok(await p.locator('#nutriAluno').isVisible(),'refeição abre Alimentação');
 eq(await p.evaluate(()=>document.activeElement.dataset.ntpMeal),'cafe','foco vai à refeição escolhida');
 eq(await app.snapshot(p),before,'consultar a programação não cria registro nem XP');
 // A programação futura é consulta: nunca confirmação antecipada.
 await view(p,'agenda');
 eq(await marks(p,'[data-agdia="2026-09-10"]'),['mt-ponto-treino','mt-ponto-alimentacao'],'calendário principal possui as duas bolinhas');
 await p.locator('[data-agdia="2026-09-11"]').focus();await p.keyboard.press('Enter');
 eq(await p.locator('#agDia [data-nutri-dia]').count(),2,'dia futuro abre refeições usando teclado');
 await p.locator('#agDia [data-nutri-ref="almoco"]').click();
 eq(await p.locator('#ntpData').inputValue(),'2026-09-11','o calendário não redireciona uma data futura para hoje');
 eq(await p.locator('[data-ntp-comi]').count(),0,'plano futuro não oferece confirmação de consumo');
 ok(!await p.locator('#ntpNovo').isVisible()&&!await p.locator('#ntpAtalhos').isVisible(),'atalhos de registro ficam indisponíveis na programação futura');
 ok((await p.locator('#ntpPlano').textContent()).includes('Programada'),'consulta futura é identificada');
 await p.locator('#ntpProx').click();eq(await p.locator('#ntpData').inputValue(),'2026-09-12','seta consulta o próximo dia do plano');
 await p.locator('#ntpVoltaHoje').click();
 ok(await p.locator('#ntpNovo').isVisible(),'voltar a hoje restaura os controles');
 await p.locator('#ntpNovo').click();await p.locator('#ntpTitulo').fill('Rascunho preservado');
 await p.evaluate(()=>window.__nutriAluno.abrirDia('2026-09-11','almoco'));
 eq(await p.locator('#ntpTitulo').inputValue(),'Rascunho preservado','abrir uma programação não substitui o editor');
 eq(await p.locator('#ntpEdData').inputValue(),'2026-09-10','data do rascunho permanece independente da consulta');
 await p.locator('#ntpEdData').fill('2026-09-11');await p.locator('#ntpSalvar').click();
 eq(Object.keys((await app.snapshot(p)).records.registros).length,0,'tentar salvar data futura é bloqueado');
 await p.locator('#ntpCancelar').click();await p.locator('#ntpVoltaHoje').click();
 await p.locator('[data-ntp-comi="cafe"]').click();
 const recorded=await app.snapshot(p);eq(Object.keys(recorded.records.registros).length,1,'registro de hoje mantém o handler real');
 await view(p,'inicio');eq(await marks(p,'[data-semd="2026-09-10"]'),['mt-ponto-treino','mt-ponto-alimentacao'],'registrar não apaga a bolinha de programação');
 await view(p,'evolucao');
 eq(await marks(p,'[data-agenda-iso="2026-09-10"]'),['mt-ponto-treino','mt-ponto-alimentacao'],'calendário mensal da Evolução também integra alimentação');
 const year=await p.locator('#mapaAnoRol').innerHTML();
 await p.locator('#mapAnt').click();eq(await p.locator('#mapaAno [data-agenda-iso]').count(),31,'calendário de agosto conserva todos os dias');
 eq(await p.locator('#mapaAno .mt-ponto-alimentacao').count(),1,'somente a legenda é verde antes da vigência');
 eq(await p.locator('#mapaAnoRol').innerHTML(),year,'histórico anual não é modificado pela programação');
 await p.locator('#mapProx').click();await p.locator('[data-agenda-iso="2026-09-11"]').click();
 ok(await p.locator('#agCal').isVisible(),'dia da Evolução abre o calendário principal');
 eq(await p.locator('#agDia [data-nutri-dia="2026-09-11"]').count(),2,'abertura pelo mensal mantém a data e suas refeições');
 for(const w of[320,390,430,800,1280]){await p.setViewportSize({width:w,height:844});for(const light of[false,true]){
  await p.evaluate(v=>document.documentElement.classList.toggle('claro',v),light);
  for(const v of['inicio','agenda','evolucao']){await view(p,v);ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'sem overflow '+w+' '+light+' '+v);}
 }}
 eq((await app.snapshot(p)).xp,recorded.xp,'navegar pelos calendários não dá pontos');
 eq((await app.snapshot(p)).train,before.train,'treinos não são regravados');eq((await app.snapshot(p)).habits,before.habits,'hábitos não são regravados');
 if(process.env.TORQUE_SCREENSHOTS){fs.mkdirSync(process.env.TORQUE_SCREENSHOTS,{recursive:true});await p.setViewportSize({width:390,height:844});await p.evaluate(()=>document.documentElement.classList.remove('claro'));
  await view(p,'inicio');await p.locator('#semBlock').scrollIntoViewIfNeeded();await p.screenshot({path:path.join(process.env.TORQUE_SCREENSHOTS,'minha-semana.png')});
  await view(p,'agenda');await p.locator('[data-agdia="2026-09-10"]').click();await p.locator('#agCal').scrollIntoViewIfNeeded();await p.screenshot({path:path.join(process.env.TORQUE_SCREENSHOTS,'agenda.png')});
 }
 await ctx.close();
 const paused=await app.mount({...plan,ativo:false},{},training);eq(await paused.p.evaluate(()=>window.__nutriAluno.programadas('2026-09-10')),[],'plano pausado não cria programação');await paused.ctx.close();
 const absent=await app.mount(null,{},training);eq(await absent.p.locator('#diasSem .mt-ponto-alimentacao').count(),0,'sem plano não há bolinhas falsas');await absent.ctx.close();
 const arbitrary=await app.mount({...plan,refeicoes:[{...plan.refeicoes[0],id:'id" de teste',titulo:'<img src=x onerror=alert(1)>',hora:''}]},{},training);
 await view(arbitrary.p,'inicio');await arbitrary.p.locator('[data-semd="2026-09-10"]').click();
 eq(await arbitrary.p.locator('#semDia img').count(),0,'nomes e identificadores do plano são escapados');
 await arbitrary.p.locator('#semDia [data-nutri-dia]').click();eq(await arbitrary.p.evaluate(()=>document.activeElement.dataset.ntpMeal),'id" de teste','identificador não padronizado abre a refeição correta');await arbitrary.ctx.close();
 eq(app.errors,[],'nenhum erro JavaScript nos calendários');console.log(count+' verificações dos calendários passaram.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>app.close());
