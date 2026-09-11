/* Navegação da alimentação com o builder real, memória isolada e rede bloqueada.
 * Não acessa contas, dados de produção ou a origem do app. */
process.env.TZ = 'America/Sao_Paulo';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({chromium} = require('playwright')); }
catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
global.self = global;
require('../assets/nutricao-core.js');
require('../app/aluno-skin.js');
require('../app/aluno-builder.js');
const DEMO = JSON.parse(fs.readFileSync(path.join(__dirname,'../tools/demo-aluno/nutricao-demo.json'),'utf8'));
const TODAY = '2026-09-10';
let browser, checks = 0;
const errors = [];
function ok(value, label) { assert.ok(value,label); checks++; console.log('OK '+label); }
function eq(value, expected, label) { assert.deepEqual(value,expected,label); checks++; console.log('OK '+label); }
async function mount(plan=DEMO, seed={}) {
  const ctx = await browser.newContext({viewport:{width:390,height:844},locale:'pt-BR',timezoneId:'America/Sao_Paulo',serviceWorkers:'block',reducedMotion:'reduce'});
  await ctx.route('**/*',r=>r.abort());
  const p = await ctx.newPage();
  p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
  await p.clock.setFixedTime(new Date(TODAY+'T12:00:00.000Z'));
  const D = {a:{id:'nutri-layout-demo',nome:'Alex',appTokenP:'nutri-layout-demo'},studio:'Studio TORQUE Demo',COR:'#7c3aed',COR2:'#5925ba',CORC:'#b395ff',CORE:'#33155c',CORCL1:'#d6c4ff',CORCL2:'#e8ddff',PAL:['#0d0c10','#111015','#15131b','#191621','#211d2a','#272231','#2c2639','#342d42','#3b334b','#443a54','#4d425f','#574b6c','#62557a'],cfg:{},metaSemana:3,fichasApp:[],guiaFichasP:[],fexs:[],sessApp:[],wodsApp:[],cardiosApp:[],nutricaoApp:plan};
  const memory = {pttour:JSON.stringify({como:'teste'}),ptonb:JSON.stringify({feito:true}),pthab:'{"teste":[1,0,0,0]}',ptdc:'{"teste":[]}',...seed};
  const inject = '<script>var __ntUiLS=(function(){var data='+JSON.stringify(memory).replace(/</g,'\\u003c')+';return {getItem:function(k){return Object.prototype.hasOwnProperty.call(data,k)?data[k]:null},setItem:function(k,v){data[k]=String(v)},removeItem:function(k){delete data[k]},key:function(i){return Object.keys(data)[i]},get length(){return Object.keys(data).length},snapshot:function(){return JSON.parse(JSON.stringify(data))}}})();<\/script>';
  const html = global.MT_APP_ALUNO.monta(D).replace(/localStorage/g,'__ntUiLS').replace(/(<body[^>]*>)/,'$1'+inject);
  await p.setContent(html,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window.__inicioAtualiza);
  await p.locator('#navMenuApp').click();
  if(plan) {await p.locator('#menuApp [data-msec=alimentacao]').click();await p.waitForFunction(()=>window.__nutriAluno);}
  return {p,ctx};
}
async function tab(p,id){await p.locator('#'+id).click();}
async function snapshot(p){return p.evaluate(()=>({records:window.__nutriAluno.estado(),xp:window.__nutriAluno.xp(),train:__ntUiLS.getItem('ptdc'),habits:__ntUiLS.getItem('pthab')}));}
async function run(){
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium')?'/opt/pw-browsers/chromium':undefined),args:['--no-sandbox']});
  const {p,ctx}=await mount();
  ok(await p.locator('#nutriAluno').isVisible(),'abre Alimentação pelo menu existente');
  eq(await p.locator('#nutriAluno [role=tabpanel]:visible').count(),1,'só um painel visível');
  eq(await p.locator('#nutriAluno [role=tab][aria-selected=true]').getAttribute('id'),'ntpTabRefeicoes','entrada no plano de refeições');
  eq(await p.locator('#ntpNovo').count(),1,'um único botão Registrar refeição');
  ok(await p.locator('.ntp-food-preview small').first().isVisible(),'porção visível sem abrir detalhes');
  const action=await p.locator('[data-ntp-comi]').first().boundingBox(),nav=await p.locator('#navApp').boundingBox();
  ok(action.y+action.height<=nav.y,'primeira ação cabe acima da barra inferior em 390x844');
  const before=await snapshot(p);
  for(const id of ['ntpTabDiario','ntpTabPlanejar','ntpTabRefeicoes']){
    await tab(p,id);eq(await p.locator('#nutriAluno [role=tabpanel]:visible').count(),1,'uma tarefa visível ao trocar para '+id);
    eq(await p.locator('#'+id).getAttribute('aria-selected'),'true','seleção anunciada em '+id);
  }
  eq(await snapshot(p),before,'navegar não registra refeições, não dá XP nem altera treino/hábitos');
  await p.locator('#ntpTabRefeicoes').focus();await p.keyboard.press('ArrowRight');
  eq(await p.evaluate(()=>document.activeElement.id),'ntpTabDiario','seta direita muda foco e seleção');
  await p.keyboard.press('End');eq(await p.evaluate(()=>document.activeElement.id),'ntpTabPlanejar','End vai para Planejar');
  await p.keyboard.press('ArrowRight');eq(await p.evaluate(()=>document.activeElement.id),'ntpTabRefeicoes','teclado volta à primeira aba');
  await p.keyboard.press('Home');eq(await p.locator('[role=tab][tabindex="0"]').count(),1,'somente a aba ativa entra na sequência Tab');
  await tab(p,'ntpTabDiario');ok(await p.locator('.ntp-empty').isVisible(),'diário vazio tem explicação, não uma lista em branco');
  ok(!await p.locator('.ntp-targets').isVisible(),'valores técnicos continuam secundários');
  await p.locator('#ntpAnt').click();ok(await p.locator('#ntpVoltaHoje').isVisible(),'data anterior oferece voltar a hoje');
  await p.locator('#ntpVoltaHoje').click();eq(await p.locator('#ntpData').inputValue(),TODAY,'voltar a hoje conserva calendário local');
  await tab(p,'ntpTabRefeicoes');
  const meal=await p.locator('[data-ntp-comi]').first().getAttribute('data-ntp-comi');
  await p.locator('[data-ntp-comi]').first().click();
  const recorded=await snapshot(p), ids=Object.keys(recorded.records.registros);
  eq(ids.length,1,'confirmação direta continua criando um registro');
  eq(await p.locator('[data-ntp-comi="'+meal+'"]').count(),0,'mesma refeição não oferece confirmação duplicada');
  eq(await p.locator('#ntpTabRefeicoes').getAttribute('aria-selected'),'true','confirmar diretamente não desloca para outra tarefa');
  await p.locator('[data-ntp-ref="'+meal+'"]').click();ok(await p.locator('#ntpEditor').isVisible(),'revisão abre fora dos painéis');
  await p.locator('#ntpTitulo').fill('Refeição revisada de teste');
  await tab(p,'ntpTabPlanejar');eq(await p.locator('#ntpTitulo').inputValue(),'Refeição revisada de teste','troca de aba preserva preenchimento');
  ok(await p.locator('#ntpEditor').isVisible(),'aba diferente não esconde rascunho aberto');
  await p.locator('#ntpSalvar').click();eq(await p.locator('#ntpTabDiario').getAttribute('aria-selected'),'true','salvar mostra o registro no Diário');
  eq(Object.keys((await snapshot(p)).records.registros),ids,'revisão mantém o mesmo ID');eq((await snapshot(p)).xp,recorded.xp,'revisão não duplica XP');
  await p.locator('[data-ntp-edita="'+ids[0]+'"]').click();await p.locator('#ntpTitulo').fill(DEMO.refeicoes[0].titulo);await p.locator('#ntpSalvar').click();
  await tab(p,'ntpTabPlanejar');ok(await p.locator('#ntpReceitas').evaluate(el=>el.open),'receitas acessíveis ao abrir Planejar');
  ok(!await p.locator('#ntpHoje').isVisible(),'calendário dos registros não confunde o período das compras');
  await p.locator('#ntpCompras>summary').click();ok(await p.locator('#ntpCompraInicio').isVisible(),'compras mantém seu período próprio');
  await p.locator('[data-ntp-compra]').first().check();ok(await p.locator('[data-ntp-compra]').first().isChecked(),'lista mantém marcações funcionais');
  for(const width of [320,390,430,800,1280]){
    await p.setViewportSize({width,height:844});
    for(const light of [false,true]){
      await p.evaluate(v=>document.documentElement.classList.toggle('claro',v),light);
      for(const id of ['ntpTabRefeicoes','ntpTabDiario','ntpTabPlanejar']){
        await tab(p,id);
        ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'sem rolagem lateral '+width+' '+light+' '+id);
        const sizes=await p.locator('#nutriAluno [role=tab]').evaluateAll(ts=>ts.every(t=>t.getBoundingClientRect().height>=44));
        ok(sizes,'abas com área de toque em '+width+' '+id);
      }
    }
  }
  const after=await snapshot(p);eq(after.train,before.train,'treinos preservados');eq(after.habits,before.habits,'hábitos preservados');
  if(process.env.TORQUE_SCREENSHOTS){
    fs.mkdirSync(process.env.TORQUE_SCREENSHOTS,{recursive:true});
    await p.setViewportSize({width:390,height:844});await p.evaluate(()=>document.documentElement.classList.remove('claro'));
    for(const [id,file] of [['ntpTabRefeicoes','alimentacao-refeicoes'],['ntpTabDiario','alimentacao-diario'],['ntpTabPlanejar','alimentacao-planejar']]){
      await tab(p,id);await p.evaluate(()=>window.scrollTo(0,0));await p.screenshot({path:path.join(process.env.TORQUE_SCREENSHOTS,file+'.png')});
    }
    await tab(p,'ntpTabRefeicoes');await p.evaluate(()=>{document.documentElement.classList.add('claro');window.scrollTo(0,0);});await p.screenshot({path:path.join(process.env.TORQUE_SCREENSHOTS,'alimentacao-claro.png')});
  }
  await ctx.close();
  const paused=await mount({...DEMO,ativo:false});eq(await paused.p.locator('#ntpTabDiario').getAttribute('aria-selected'),'true','plano pausado inicia na consulta do Diário');ok(!await paused.p.locator('#ntpNovo').isVisible(),'plano pausado não oferece novo registro');await tab(paused.p,'ntpTabRefeicoes');eq(await paused.p.locator('[data-ntp-comi]').count(),0,'navegação não libera confirmação em plano pausado');await paused.ctx.close();
  const absent=await mount(null);eq(await absent.p.locator('#nutriAluno').count(),0,'sem plano nem histórico não inventa conteúdo');await absent.ctx.close();
  eq(errors,[],'sem erros JavaScript');console.log('Navegação da alimentação: '+checks+' verificações passaram.');
}
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
