/* Agenda alimentar: projeção somente de leitura do plano vigente.
 * Builder real; conta fictícia, armazenamento em memória e rede bloqueada. */
process.env.TZ='America/Sao_Paulo';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(fs.existsSync('/opt/node22/lib/node_modules/playwright')?'/opt/node22/lib/node_modules/playwright':'playwright');
global.self=global;require('../assets/nutricao-core.js');require('../app/aluno-skin.js');require('../app/aluno-builder.js');
const TODAY='2026-09-10',FRIDAY='2026-09-11',SATURDAY='2026-09-12',SUNDAY='2026-09-13';
const food={id:'item',nome:'Alimento de teste',porcao:'porção de demonstração',qtd:1,k:1,pt:1,cb:1,g:1};
const PLAN={v:1,id:'plan-calendar',ativo:true,titulo:'Horários de demonstração',inicio:TODAY,fim:FRIDAY,refeicoes:[
 {id:'jantar',titulo:'Jantar',hora:'19:00',dias:[4,5],itens:[food]},
 {id:'cafe',titulo:'Café da manhã',hora:'07:30',dias:[4,5],itens:[food]},
 {id:'almoco',titulo:'Almoço',hora:'12:30',dias:[4,5],itens:[food]},
 {id:'livre',titulo:'Refeição sem horário',hora:'',dias:[5],itens:[food]}
]};
let browser,checks=0;const errors=[];
function eq(a,b,label){assert.deepEqual(a,b,label);checks++;console.log('OK '+label);}
function ok(a,label){assert.ok(a,label);checks++;console.log('OK '+label);}
async function mount(plan=PLAN){
 const ctx=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/Sao_Paulo',locale:'pt-BR',serviceWorkers:'block',reducedMotion:'reduce'});
 await ctx.route('**/*',r=>r.abort());const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.clock.setFixedTime(new Date(TODAY+'T15:00:00Z'));
 const D={a:{id:'calendar-fixture',nome:'Aluno de teste',appTokenP:'calendar-fixture'},studio:'Studio de teste',cfg:{},
 COR:'#7c3aed',COR2:'#5925ba',CORC:'#b395ff',CORE:'#33155c',CORCL1:'#d6c4ff',CORCL2:'#e8ddff',PAL:['#0d0c10','#111015','#15131b','#191621','#211d2a','#272231','#2c2639','#342d42','#3b334b','#443a54','#4d425f','#574b6c','#62557a'],metaSemana:3,
 fichasApp:[{titulo:'Treino A',itens:[{nome:'Movimento de teste',series:3,reps:'8',descanso:60}]}],guiaFichasP:[{n:'Treino A',it:[{e:'Movimento de teste',s:3,r:'8',d:60}]}],fexs:[{n:'Movimento de teste',s:3}],
 planoApp:{'4':[{tp:'ficha',i:0,n:'Treino A',h:'18:00'}],'6':[{tp:'ficha',i:0,n:'Treino A',h:'09:00'}]},sessApp:[],wodsApp:[],cardiosApp:[],nutricaoApp:plan};
 const seed={ptonb:'{"feito":true}',pttour:'{"como":"teste"}',ptfeitos:'{"2026-09-07":1}',ptdc:'{"teste":[]}',pthab:'{"2026-09-07":[1,0,0,0]}'};
 const inject='<script>var __calLS=(function(){var d='+JSON.stringify(seed)+';return {getItem:function(k){return Object.prototype.hasOwnProperty.call(d,k)?d[k]:null},setItem:function(k,v){d[k]=String(v)},removeItem:function(k){delete d[k]},key:function(i){return Object.keys(d)[i]},get length(){return Object.keys(d).length},snapshot:function(){return JSON.parse(JSON.stringify(d))}}})();</script>';
 const html=global.MT_APP_ALUNO.monta(D).replace(/localStorage/g,'__calLS').replace(/(<body[^>]*>)/,'$1'+inject);
 for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim())new Function(m[1]);
 await page.setContent(html,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__inicioAtualiza&&window.__agItens);
 await page.evaluate(()=>window.__trocaSec('inicio'));return {page,ctx};
}
async function snapshot(p){return p.evaluate(()=>({train:__calLS.getItem('ptdc'),habits:__calLS.getItem('pthab'),feitos:__calLS.getItem('ptfeitos'),state:window.__nutriAluno?.estado()||null,xp:window.__nutriAluno?.xp()||0,fila:window.__nutriAluno?__calLS.getItem(window.__nutriAluno.chaves.fila):null}));}
async function dots(p,selector,date,train,nutri){
 const cell=p.locator(selector.replace('$',date));
 eq(await cell.locator('.cal-treino').count(),train,'treino em '+selector+' '+date);
 eq(await cell.locator('.cal-alimentacao').count(),nutri,'alimentação em '+selector+' '+date);
 ok(await cell.getAttribute('aria-label'),'data com descrição acessível '+selector);
}
(async()=>{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/opt/pw-browsers/chromium',args:['--no-sandbox']});
 const {page:p,ctx}=await mount();const before=await snapshot(p);
 eq(await p.evaluate(d=>window.__nutriAluno.agenda(d).map(x=>x.h),TODAY),['07:30','12:30','19:00'],'refeições ordenadas pelo horário, não pela ordem do editor');
 eq(await p.evaluate(d=>window.__nutriAluno.agenda(d).map(x=>x.h),FRIDAY),['07:30','12:30','19:00',''],'horário ausente vem ao fim sem inventar 00:00');
 for(const d of ['2026-09-09',SATURDAY,'2026-02-30','invalid'])eq(await p.evaluate(d=>window.__nutriAluno.agenda(d),d),[],'vigência/data válida respeitadas '+d);
 for(const selector of ['[data-semd="$"]','[data-agdia="$"]','[data-cal-dia="$"]']){
  await dots(p,selector,TODAY,1,1);await dots(p,selector,FRIDAY,0,1);await dots(p,selector,SATURDAY,1,0);await dots(p,selector,SUNDAY,0,0);
 }
 await p.locator('[data-semd="'+TODAY+'"]').click();
 eq(await p.evaluate(()=>window.__semDia.itens().map(i=>i.h)),['07:30','12:30','18:00','19:00'],'gaveta da Home mistura treino e refeições na ordem do relógio');
 eq(await p.locator('#semDia [data-al-ref]').count(),3,'Home mostra três refeições programadas');
 await p.locator('#semDia [data-al-ref="cafe"]').click();
 ok(await p.locator('#nutriAluno').isVisible(),'atalho abre Alimentação');eq(await p.locator('#ntpData').inputValue(),TODAY,'atalho mantém a data selecionada');
 eq(await p.evaluate(()=>document.activeElement.dataset.ntpMeal),'cafe','atalho destaca a refeição correta');
 ok(!await p.locator('#ntpEditor').isVisible(),'consulta não abre um registro');eq(await snapshot(p),before,'abrir datas/refeições não altera registros, fila, XP, treinos ou hábitos');
 await p.evaluate(()=>window.__trocaSec('agenda'));await p.locator('[data-agdia="'+FRIDAY+'"]').click();
 eq(await p.locator('#agDia [data-al-ref]').count(),4,'Agenda tem refeições do dia futuro');
 await p.locator('#agDia [data-al-ref="cafe"]').click();
 eq(await p.locator('#ntpData').inputValue(),FRIDAY,'dia futuro não volta silenciosamente para hoje');
 eq(await p.locator('[data-ntp-comi]').count(),0,'consulta futura não oferece marcar como consumido');
 ok(await p.locator('#ntpNovo').isDisabled(),'novo registro indisponível para data futura');
 eq(await snapshot(p),before,'futuro não fabrica registro nem recompensa');
 await p.locator('#ntpAnt').click();eq(await p.locator('#ntpData').inputValue(),TODAY,'anterior volta ao dia atual');
 await p.locator('#ntpProx').click();eq(await p.locator('#ntpData').inputValue(),FRIDAY,'seta consulta plano do próximo dia');
 await p.locator('#ntpVoltaHoje').click();
 await p.locator('#ntpNovo').click();await p.locator('#ntpTitulo').fill('Rascunho que precisa permanecer');
 await p.evaluate(()=>window.__trocaSec('inicio'));await p.locator('[data-semd="'+FRIDAY+'"]').click();await p.locator('#semDia [data-al-ref="almoco"]').click();
 ok(await p.locator('#ntpEditor').isVisible(),'rascunho não é escondido pelo atalho');
 eq(await p.locator('#ntpTitulo').inputValue(),'Rascunho que precisa permanecer','rascunho não é substituído por outra refeição');
 eq(await p.locator('#ntpEdData').inputValue(),TODAY,'data do rascunho independente da data consultada');
 await p.locator('#ntpCancelar').click();await p.locator('#ntpVoltaHoje').click();
 await p.locator('[data-ntp-comi="cafe"]').click();
 eq(Object.keys((await snapshot(p)).state.registros).length,1,'confirmação continua funcionando no próprio dia');
 await dots(p,'[data-semd="$"]',TODAY,1,1);eq((await snapshot(p)).feitos,before.feitos,'consumo não vira treino concluído');
 const after=await snapshot(p);
 await p.evaluate(()=>{window.__trocaSec('evolucao');window.__evSub('conq');});
 await p.locator('#mapAnt').focus();await p.keyboard.press('Enter');
 eq(await p.evaluate(()=>document.activeElement.id),'mapAnt','mês anterior conserva foco de teclado após repintar os dias');
 await p.keyboard.press('Enter');eq(await p.evaluate(()=>window.__mapaMes.mes()),2,'teclado continua navegando a partir da seta focada');
 await p.locator('#mapProx').focus();await p.keyboard.press('Enter');
 eq(await p.evaluate(()=>document.activeElement.id),'mapProx','próximo mês conserva foco enquanto pode avançar');
 await p.keyboard.press('Enter');
 eq(await p.evaluate(()=>document.activeElement.id),'mapAnt','ao chegar ao mês atual, foco vai para a seta habilitada');
 ok(await p.locator('#mapProx').isDisabled(),'fim da navegação não habilita mês futuro indevidamente');
 await p.evaluate(()=>window.__mapaMes.pinta());eq(await p.evaluate(()=>document.activeElement.id),'mapAnt','atualização do calendário conserva foco da navegação');
 await p.locator('#navMenuApp').focus();await p.evaluate(()=>window.__mapaMes.pinta());
 eq(await p.evaluate(()=>document.activeElement.id),'navMenuApp','atualização não rouba o foco de outra área do app');
 eq(await snapshot(p),after,'navegação de teclado não grava dados de treino ou alimentação');
 await p.locator('[data-cal-dia="'+TODAY+'"]').click();
 ok(await p.locator('#agCal').isVisible(),'calendário da Evolução abre a Agenda do dia');eq(await p.locator('#agDia [data-al-ref]').count(),3,'Evolução chega aos mesmos horários');
 for(const width of [320,390,430,800,1280]){
  await p.setViewportSize({width,height:844});
  for(const light of [false,true]){
   await p.evaluate(x=>document.documentElement.classList.toggle('claro',x),light);
   for(const area of ['inicio','agenda','evolucao']){
    await p.evaluate(a=>{window.__trocaSec(a);if(a==='evolucao')window.__evSub('conq');},area);
    ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'sem overflow '+width+' '+area+' '+light);
    const target=area==='inicio'?'#diasSem [data-semd]':area==='agenda'?'#agCal [data-agdia]':'#mapaAno [data-cal-dia]';
    ok(await p.locator(target).evaluateAll(es=>es.every(e=>e.getBoundingClientRect().height>=40&&e.querySelectorAll('.cal-ponto').length<=2)),'alvos e no máximo duas bolinhas '+width+' '+area);
   }
  }
 }
 eq(await snapshot(p),after,'navegação após confirmação preserva o diário');
 if(process.env.TORQUE_SCREENSHOTS){
  fs.mkdirSync(process.env.TORQUE_SCREENSHOTS,{recursive:true});await p.setViewportSize({width:390,height:844});await p.evaluate(()=>document.documentElement.classList.remove('claro'));
  await p.evaluate(()=>window.__trocaSec('inicio'));await p.locator('[data-semd="'+TODAY+'"]').click();await p.locator('#semBlock').screenshot({path:path.join(process.env.TORQUE_SCREENSHOTS,'minha-semana.png')});
  await p.evaluate(()=>window.__trocaSec('agenda'));await p.locator('[data-agdia="'+TODAY+'"]').click();await p.locator('#agCal').scrollIntoViewIfNeeded();await p.screenshot({path:path.join(process.env.TORQUE_SCREENSHOTS,'agenda.png')});
 }
 await ctx.close();
 for(const plan of [null,{...PLAN,ativo:false},{...PLAN,refeicoes:[] }]){
  const x=await mount(plan);eq(await x.page.locator('#diasSem .cal-alimentacao').count(),0,'sem plano ativo/preenchido não inventa bolinhas');eq(await x.page.evaluate(d=>window.__agItens(d).filter(i=>i.k==='alimentacao').length,TODAY),0,'sem programação não cria horários');await x.ctx.close();
 }
 const legacy={v:1,id:'legacy',ativo:true,titulo:'Legado',refeicoes:[{id:'r"<&',titulo:'Refeição <teste> "legado"',hora:'',itens:[food]}]};
 const x=await mount(legacy);eq(await x.page.evaluate(d=>window.__nutriAluno.agenda(d).length,SUNDAY),1,'plano legado sem dias/vigência vale todos os dias');
 await x.page.locator('[data-semd="'+TODAY+'"]').click();eq(await x.page.locator('#semDia [data-al-ref]').getAttribute('data-al-ref'),'r"<&','ID arbitrário não quebra atributo HTML');
 ok((await x.page.locator('#semDia').textContent()).includes('Sem horário'),'hora desconhecida é anunciada explicitamente');
 await x.page.locator('#semDia [data-al-ref]').click();eq(await x.page.evaluate(()=>document.activeElement.dataset.ntpMeal),'r"<&','ID especial abre por comparação exata sem seletor inseguro');await x.ctx.close();
 eq(errors,[],'sem erros JavaScript');console.log(checks+' verificações de calendário/alimentação passaram.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
