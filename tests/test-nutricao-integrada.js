/* Nutrição integrada: planos por aluno, snapshots confirmados e fila offline.
 * Dados sintéticos e RPCs interceptadas; nenhuma chamada usa a nuvem real. */
process.env.TZ = 'America/Sao_Paulo';
const assert = require('assert/strict');
const fs = require('fs');
const vm = require('vm');
let chromium;
try { chromium = require('playwright').chromium; }
catch (_) { chromium = require('/opt/node22/lib/node_modules/playwright').chromium; }
const { comMockNuvem } = require('./_nuvem.js');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765';
const FAKE = 'https://nutricao-test.invalid';
const DAY = '2026-09-07', STAMP = DAY + 'T12:00:00.000Z';
global.self = global;
require('../assets/nutricao-core.js');
const Core = global.MT_NUTRICAO;
const clone = x => JSON.parse(JSON.stringify(x));
function nutriKeys(token){let a=2166136261,b=5381,s=String(token||'local');for(let i=0;i<s.length;i++){a=Math.imul(a^s.charCodeAt(i),16777619);b=Math.imul(b,33)^s.charCodeAt(i);}const x=(a>>>0).toString(36)+(b>>>0).toString(36);return{estado:'ptnutricao:'+x,fila:'ptnutriFila:'+x,rascunho:'ptnutriRascunho:'+x};}
let browser, checks = 0;
function ok(value, label) { assert.ok(value, label); checks++; console.log('  OK ' + label); }
function eq(value, expected, label) { assert.deepEqual(value, expected, label); checks++; console.log('  OK ' + label); }
function near(value, expected, label) { ok(Math.abs(value - expected) < 1e-9, label); }
const rice = { id:'it-arroz', alimId:'al-arroz', nome:'Arroz branco cozido', porcao:'100 g', qtd:1, k:130, pt:2.5, cb:28, g:.2 };
const beans = { id:'it-feijao', alimId:'al-feijao', nome:'Feijão carioca cozido', porcao:'1 concha (80 g)', qtd:1, k:76, pt:4.8, cb:14, g:.5 };
const chicken = { id:'it-frango', alimId:'al-frango', nome:'Peito de frango grelhado', porcao:'100 g', qtd:1, k:165, pt:31, cb:0, g:3.6 };
const tomato = { id:'it-tomate', alimId:'al-tomate', nome:'Tomate', porcao:'1 unidade (90 g)', qtd:1, k:19, pt:.9, cb:3.5, g:.2 };
function plan(id='plano-a', title='Plano de alimentação A') {
  return { v:1, ativo:true, id, titulo:title, objetivo:'Rotina de refeições', orientacoes:'Plano fictício para testar o aplicativo.',
    responsavel:'Profissional de teste', crn:'DEMO', atualizadoEm:STAMP,
    refeicoes:[{id:'almoco',hora:'12:30',titulo:'Almoço',itens:[clone(rice),clone(beans),clone(chicken),clone(tomato)]},
      {id:'lanche',hora:'16:00',titulo:'Lanche',itens:[{id:'it-banana',alimId:'al-banana',nome:'Banana prata',porcao:'1 unidade (70 g)',qtd:1,k:64,pt:.9,cb:16,g:.1}]}] };
}
function record(id='registro-servidor', more={}) {
  return { id,d:DAY,refeicaoId:'',titulo:'Registro confirmado',hora:'09:00',itens:[clone(rice)],origem:'manual',foto:'',atualizadoEm:STAMP,apagado:false,...more };
}
function testCore() {
  const meal = plan().refeicoes[0].itens, sum = Core.totalItens(meal);
  near(sum.k,390,'Quatro porções brasileiras somam390kcal');
  near(sum.pt,39.2,'Proteínas somadas a partir das porções');
  near(sum.cb,45.5,'Carboidratos somados a partir das porções');
  near(sum.g,4.5,'Gorduras somadas a partir das porções');
  const fraction = Core.totalItens([{...rice,qtd:.25},{...beans,qtd:1.5}]);
  near(fraction.k,146.5,'Quantidade fracionada multiplica a energia da porção');
  near(fraction.pt,7.825,'Frações preservam precisão sem arredondar cada ingrediente');
  for (const qtd of ['',null,false,0,-1,'abc',Infinity,1001]) eq(Core.normalizaItem({...rice,qtd}),null,'Quantidade inválida é recusada: '+String(qtd));
  ok(!!Core.normalizaItem({...rice,qtd:'0,5',k:0,pt:0,cb:0,g:0}),'Meia porção e nutrientes zero são valores válidos');
  eq(Core.normalizaItem({...rice,k:-1}),null,'Nutriente negativo é recusado');
  eq(Core.normalizaItem({...rice,pt:Infinity}),null,'Nutriente não finito é recusado');
  eq(Core.normalizaRegistro(record('bad',{d:'2026-02-29'})),null,'Dia impossível não entra no diário');
  ok(!!Core.normalizaRegistro(record('leap',{d:'2024-02-29'})),'Fevereiro bissexto permanece válido');
  eq(Core.normalizaRegistro(record('bad',{atualizadoEm:'ontem'})),null,'Carimbo inválido não entra na sincronização');
  const source = plan(), snapshot = Core.normalizaPlano(source); source.refeicoes[0].itens[0].qtd=7;
  eq(snapshot.refeicoes[0].itens[0].qtd,1,'Snapshot normalizado não compartilha itens com o rascunho');
  const serial = vm.runInNewContext('('+Core.runtime.toString()+')()');
  near(serial.totalItens(meal).k,390,'Core serializado do app offline calcula o mesmo total do painel');
}
const errors = [], unexpectedNetwork = [];
function attachErrors(page) { page.on('pageerror',error=>errors.push(error.message)); }
async function appFixture(overrides={}, initial={}, state={}) {
  global.MT_CLOUD={url:FAKE,anonKey:'mock'};
  require('../app/aluno-skin.js'); require('../app/aluno-builder.js');
  const D={a:{id:'nutri-a',nome:'Aluno Nutri A',appTokenP:'token-nutricao-a'},studio:'Studio teste',
    metaSemana:3,cfg:{},fichasApp:[],guiaFichasP:[],fexs:[],sessApp:[],wodsApp:[],cardiosApp:[],nutricaoApp:plan(),atualizador:'',...overrides};
  const html=global.MT_APP_ALUNO.monta(D),ctx=await browser.newContext({viewport:{width:390,height:844},locale:'pt-BR',timezoneId:'America/Sao_Paulo',serviceWorkers:'block'});
  const nk=nutriKeys(D.a.appTokenP),seed={...initial};if(Object.prototype.hasOwnProperty.call(seed,'ptnutricao')){seed[nk.estado]=seed.ptnutricao;delete seed.ptnutricao;}if(Object.prototype.hasOwnProperty.call(seed,'ptnutriFila')){seed[nk.fila]=seed.ptnutriFila;delete seed.ptnutriFila;}if(Object.prototype.hasOwnProperty.call(seed,'ptnutriRascunho')){seed[nk.rascunho]=seed.ptnutriRascunho;delete seed.ptnutriRascunho;}
  const p=await ctx.newPage();attachErrors(p);await p.clock.setFixedTime(new Date(STAMP));
  state.calls=[];state.records=state.records||{};
  await ctx.route('**/*',async route=>{
    const u=new URL(route.request().url());
    if(u.origin===new URL(BASE).origin){
      if(u.pathname==='/nutricao-integrada-test.html')return route.fulfill({contentType:'text/html',body:state.html||html});
      return route.continue();
    }
    if(u.origin!==FAKE){unexpectedNetwork.push(u.origin+u.pathname);return route.abort();}
    const body=route.request().postDataJSON(),rpc=u.pathname.split('/').pop();state.calls.push({rpc,body});
    if(rpc==='chat-envia'){
      if(state.photoHold)await new Promise(resolve=>{state.photoRelease=resolve;});
      return route.fulfill({contentType:'application/json',body:JSON.stringify(state.photoResponse||{ok:true,itens:[rice],estimativa:true,observacao:'Estimativa fictícia: confira a porção.'})});
    }
    if(rpc==='app_nutricao_estado')return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,nutricao:{v:1,registros:state.records}})});
    if(rpc==='app_nutricao_salva'){
      if(state.fail)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({erro:'offline de teste'})});
      // Apenas o contrato do transporte é simulado; a mescla SQL possui teste próprio.
      (body.p_registros||[]).forEach(reg=>{const old=state.records[reg.id];if(!old||Date.parse(reg.atualizadoEm)>Date.parse(old.atualizadoEm))state.records[reg.id]=clone(reg);});
      if(state.hold){await new Promise(resolve=>{state.release=resolve;});}
      return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,nutricao:{v:1,registros:state.records}})});
    }
    return route.fulfill({contentType:'application/json',body:'null'});
  });
  await ctx.addInitScript(({seed,token})=>{
    localStorage.setItem('pttour',JSON.stringify({como:'teste'}));localStorage.setItem('ptonb',JSON.stringify({feito:true}));
    localStorage.setItem('tq_app_token',token);
    Object.entries(seed).forEach(([key,value])=>localStorage.setItem(key,JSON.stringify(value)));
  },{seed,token:D.a.appTokenP});
  await p.goto(BASE+'/nutricao-integrada-test.html');
  await p.waitForFunction(present=>present?!!window.__nutriAluno:!!window.__inicioAtualiza,!!D.nutricaoApp);
  p.on('dialog',dialog=>dialog.accept());
  return {p,ctx,D,state};
}
async function openNutrition(p) {
  if(!await p.locator('#menuApp').isVisible())await p.locator('#navMenuApp').click();
  await p.locator('#menuApp [data-msec="alimentacao"]').click();
  ok(await p.locator('#nutriAluno').isVisible(),'Alimentação abre pela navegação real do aluno');
}
async function reveal(p, selector) {
  const ancestors=p.locator(selector).locator('xpath=ancestor::details');
  for(let i=0;i<await ancestors.count();i++)if(!await ancestors.nth(i).evaluate(el=>el.open))await ancestors.nth(i).locator(':scope > summary').click();
}
const getRecords=p=>p.evaluate(()=>window.__nutriAluno.estado().registros);
const getQueue=p=>p.evaluate(()=>JSON.parse(localStorage.getItem(window.__nutriAluno.chaves.fila)||'{}'));
const field=(p,i,name)=>p.locator('#ntpItens [data-ntp-item="'+i+'"] [data-ncampo="'+name+'"]');
async function synced(p){await p.waitForFunction(()=>Object.keys(JSON.parse(localStorage.getItem(window.__nutriAluno.chaves.fila)||'{}')).length===0);}
async function until(check,label){const end=Date.now()+10000;while(!check()){if(Date.now()>end)throw new Error('Tempo excedido: '+label);await new Promise(resolve=>setTimeout(resolve,25));}}
async function testApp() {
  const training={ptdc:{Supino:[{d:DAY,kg:30,r:10,g:2,i:'0:0:0',serie:1,feito:true}]},ptfeitos:{[DAY]:true},pthab:{[DAY]:[1,0,0,0]}};
  const {p,ctx,D,state}=await appFixture({},training,{fail:true});
  await openNutrition(p);
  eq(await getRecords(p),{},'Abrir plano não cria refeição realizada');
  eq(await p.evaluate(()=>window.__nutriAluno.xp()),0,'Refeição planejada não concede XP');
  const original=JSON.stringify(training);
  await reveal(p,'[data-ntp-ref="almoco"]');await p.locator('[data-ntp-ref="almoco"]').click();
  eq(await p.locator('#ntpItens [data-ntp-item]').count(),4,'Plano preenche as quatro porções para revisão');
  eq(await getRecords(p),{},'Revisar a proposta ainda não registra nem soma nutrientes');
  await field(p,0,'qtd').fill('0');await p.locator('#ntpSalvar').click();
  eq(await getRecords(p),{},'Quantidade zero bloqueia confirmação sem excluir os outros alimentos');
  ok(await p.locator('#ntpEditor').isVisible()&&await p.locator('#ntpItens [data-ntp-item]').count()===4,'Formulário inválido conserva as quatro linhas');
  await field(p,0,'qtd').fill('2');await p.locator('#ntpSalvar').click();
  let records=await getRecords(p),id=Object.keys(records)[0];
  eq(Object.keys(records).length,1,'Confirmar cria um único registro da refeição');
  near(Core.totalItens(records[id].itens).k,520,'Confirmar duas porções de arroz salva520kcal realizadas');
  eq(records[id].origem,'plano','Registro conserva origem no plano');
  eq(await p.evaluate(()=>window.__nutriAluno.xp()),2,'Só a refeição confirmada acrescenta2XP');
  await p.waitForFunction(()=>document.getElementById('ntpSync').textContent.includes('offline de teste'));
  ok(Object.keys(await getQueue(p)).length===1,'Falha de envio conserva o registro na fila local');
  await p.reload();await p.waitForFunction(()=>window.__nutriAluno);await openNutrition(p);
  near(Core.totalItens((await getRecords(p))[id].itens).k,520,'Reload offline do servidor conserva o snapshot realizado');
  await p.locator('#ntpTabDiario').click();await p.locator('[data-ntp-edita="'+id+'"]').click();await field(p,0,'qtd').fill('.5');await p.locator('#ntpSalvar').click();
  records=await getRecords(p);eq(Object.keys(records).length,1,'Editar conserva a identidade sem duplicar a refeição');
  near(Core.totalItens(records[id].itens).k,325,'A edição recalcula apenas os valores efetivamente informados');
  eq(await p.evaluate(()=>window.__nutriAluno.xp()),2,'Editar a mesma refeição não duplica XP');
  D.nutricaoApp.id='plano-a-atualizado';D.nutricaoApp.refeicoes[0].itens[0].qtd=9;state.html=global.MT_APP_ALUNO.monta(D);
  await p.reload();await p.waitForFunction(()=>window.__nutriAluno);await openNutrition(p);
  eq((await getRecords(p))[id].itens[0].qtd,.5,'Novo plano publicado não reescreve a quantidade já realizada');
  near(Core.totalItens((await getRecords(p))[id].itens).k,325,'Histórico usa seu snapshot, não as calorias do plano atualizado');
  await p.locator('#ntpTabDiario').click();await p.locator('[data-ntp-edita="'+id+'"]').click();await p.locator('#ntpTitulo').fill('Almoço editado após novo plano');await p.locator('#ntpSalvar').click();
  eq(Object.keys(await getRecords(p)),[id],'Editar registro de plano antigo conserva seu ID após publicar outro plano');
  eq((await getRecords(p))[id].titulo,'Almoço editado após novo plano','Revisão altera o snapshot existente sem duplicar a refeição');
  state.fail=false;await p.locator('#ntpTentar').click();await synced(p);
  eq(state.records[id].itens[0].qtd,.5,'Retentar entrega a última edição ao servidor simulado');
  ok(state.calls.filter(x=>x.rpc==='app_nutricao_salva').every(x=>x.body.t==='token-nutricao-a'&&x.body.p_registros.length<=20),'RPC dedicada recebe token correto e lote limitado');
  ok(!state.calls.filter(x=>x.rpc==='app_aluno_devolve').some(x=>'nutricaoV1' in (x.body.p_dados||{})||'nutricao' in (x.body.p_dados||{})),'Retorno geral de treino não transporta a alimentação');
  await p.locator('[data-ntp-apaga="'+id+'"]').click();await synced(p);
  ok((await getRecords(p))[id].apagado&&state.records[id].apagado,'Excluir propaga tombstone mantendo a identidade');
  eq(await p.locator('#ntpDiario [data-ntp-edita]').count(),0,'Tombstone não permanece como refeição ativa no diário');
  eq(await p.evaluate(()=>window.__nutriAluno.xp()),0,'Excluir retira os pontos do registro desfeito');
  await ctx.setOffline(true);await p.locator('#ntpNovo').click();await p.locator('#ntpTitulo').fill('Refeição sem estimativa');await p.locator('#ntpSalvar').click();
  const manual=Object.values(await getRecords(p)).find(x=>!x.apagado);
  eq(manual.itens,[],'Registro só com título não inventa alimentos nem nutrientes');
  ok(Object.keys(await getQueue(p)).length===1,'Registro sem conexão permanece pendente no aparelho');
  await ctx.setOffline(false);await p.evaluate(()=>window.dispatchEvent(new Event('online')));await synced(p);
  ok(!!state.records[manual.id],'Reconexão envia a refeição pendente');
  await p.locator('#ntpAnt').click();eq(await p.locator('#ntpData').inputValue(),'2026-09-06','Consulta anterior usa o dia local correto');
  eq(await p.locator('#ntpDiario [data-ntp-edita]').count(),0,'Outro dia não mistura a refeição de hoje');
  await p.locator('#ntpProx').click();eq(await p.locator('#ntpData').inputValue(),DAY,'Volta ao dia atual');
  const antesFuturo=await getRecords(p);
  await p.locator('#ntpProx').click();eq(await p.locator('#ntpData').inputValue(),'2026-09-08','Calendário permite consultar plano futuro');
  ok(await p.locator('#ntpNovo').isDisabled(),'Consulta futura não permite registrar consumo');
  eq(await p.locator('[data-ntp-comi]').count(),0,'Plano futuro não oferece confirmação de consumo');
  eq(await getRecords(p),antesFuturo,'Consultar o futuro não modifica os registros existentes');
  await p.locator('#ntpVoltaHoje').click();
  eq(await p.evaluate(()=>JSON.stringify(Object.fromEntries(['ptdc','ptfeitos','pthab'].map(k=>[k,JSON.parse(localStorage.getItem(k))])))),original,'Plano, edição, exclusão e sync preservam treino e hábitos legados');
  for(const width of [360,390,1280]){await p.setViewportSize({width,height:844});ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Alimentação sem overflow em '+width+'px');}
  await ctx.close();

  const rs={},queue={};for(let i=0;i<23;i++){const r=record('fila-'+i);rs[r.id]=r;queue[r.id]=r.atualizadoEm;}
  const batch=await appFixture({}, {ptnutricao:{v:1,registros:rs},ptnutriFila:queue});
  await batch.p.evaluate(()=>window.__nutriAluno.sync());await synced(batch.p);
  eq(batch.state.calls.filter(x=>x.rpc==='app_nutricao_salva').map(x=>x.body.p_registros.length),[20,3],'Fila maior é enviada em dois lotes completos sem perder registros');
  eq(Object.keys(batch.state.records).length,23,'Todos os registros chegaram ao servidor simulado');
  eq(await batch.p.evaluate(()=>window.__nutriAluno.xp()),10,'Muitas refeições no mesmo dia respeitam teto10XP');
  await batch.ctx.close();

  const local=record('conflito',{itens:[{...rice,qtd:2}],atualizadoEm:DAY+'T13:00:00.000Z'});
  const conflict=await appFixture({}, {ptnutricao:{v:1,registros:{conflito:local}},ptnutriFila:{conflito:local.atualizadoEm}}, {records:{conflito:record('conflito')},fail:true});
  await conflict.p.waitForFunction(()=>document.getElementById('ntpSync').textContent.includes('offline de teste'));
  eq((await getRecords(conflict.p)).conflito.itens[0].qtd,2,'Hidratação antiga não sobrescreve edição local mais recente');
  ok('conflito' in await getQueue(conflict.p),'Hidratação não confirma uma edição que ainda não foi enviada');
  await conflict.ctx.close();

  const tie=await appFixture({}, {ptnutricao:{v:1,registros:{empate:record('empate')}},ptnutriFila:{empate:STAMP}}, {records:{empate:record('empate',{itens:[{...rice,qtd:4}]})}});
  await tie.p.evaluate(()=>window.__nutriAluno.sync());await synced(tie.p);
  eq((await getRecords(tie.p)).empate.itens[0].qtd,4,'ACK empatado adota o snapshot já confirmado no servidor');
  eq(await getQueue(tie.p),{},'Empate só quita a fila quando o estado local está conciliado');
  await tie.ctx.close();

  const ack=await appFixture({}, {ptnutricao:{v:1,registros:{corrida:record('corrida')}},ptnutriFila:{corrida:STAMP}}, {hold:true});
  await openNutrition(ack.p);const flight=ack.p.evaluate(()=>window.__nutriAluno.sync());
  await ack.p.waitForTimeout(100);await ack.p.waitForFunction(()=>document.getElementById('ntpSync').textContent.includes('Sincronizando'));
  await until(()=>!!ack.state.release,'primeiro envio aguardando confirmação');
  await ack.p.locator('#ntpTabDiario').click();await ack.p.locator('[data-ntp-edita="corrida"]').click();await field(ack.p,0,'qtd').fill('3');await ack.p.locator('#ntpSalvar').click();
  ack.state.hold=false;ack.state.release();await synced(ack.p);await flight;
  eq(ack.state.records.corrida.itens[0].qtd,3,'Resposta antiga não quita edição feita durante o envio');
  ok(ack.state.calls.filter(x=>x.rpc==='app_nutricao_salva').length>=2,'Edição durante envio recebe confirmação própria');
  await ack.ctx.close();

  const quota=await appFixture();await openNutrition(quota.p);await quota.p.locator('#ntpNovo').click();await quota.p.locator('#ntpTitulo').fill('Preservar formulário');
  await quota.p.evaluate(()=>{window.__setNutriOriginal=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===window.__nutriAluno.chaves.fila)throw new DOMException('Cota cheia','QuotaExceededError');return window.__setNutriOriginal.call(this,k,v);};});
  await quota.p.locator('#ntpSalvar').click();eq(await getRecords(quota.p),{},'Falha na fila reverte a gravação parcial do diário');
  ok(await quota.p.locator('#ntpEditor').isVisible()&&await quota.p.locator('#ntpTitulo').inputValue()==='Preservar formulário','Cota cheia conserva o preenchimento para tentar novamente');
  await quota.p.evaluate(()=>{Storage.prototype.setItem=window.__setNutriOriginal;});await quota.p.locator('#ntpSalvar').click();
  eq(Object.keys(await getRecords(quota.p)).length,1,'Correção do armazenamento permite confirmar sem refazer a refeição');
  await quota.ctx.close();

  const photo=await appFixture();await openNutrition(photo.p);await photo.p.locator('#ntpNovo').click();await photo.p.locator('#ntpTitulo').fill('Foto de teste');
  const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCDsAAAAASUVORK5CYII=','base64');
  await photo.p.locator('#ntpFoto').setInputFiles({name:'prato-ficticio.png',mimeType:'image/png',buffer:image});await photo.p.waitForSelector('#ntpPreview:visible');
  eq(photo.state.calls.filter(x=>x.rpc==='chat-envia').length,0,'Anexar foto não chama IA automaticamente');
  eq(await getRecords(photo.p),{},'Anexar foto não confirma refeição');
  await photo.p.locator('#ntpAnalisa').click();await photo.p.waitForFunction(()=>document.getElementById('ntpIAAviso').textContent.includes('Estimativa por foto'));
  eq(await getRecords(photo.p),{},'Estimativa continua rascunho até confirmação humana');
  eq(await photo.p.evaluate(()=>window.__nutriAluno.xp()),0,'Analisar imagem não somaXP');
  await field(photo.p,0,'qtd').fill('.5');await photo.p.locator('#ntpSalvar').click();
  const photographed=Object.values(await getRecords(photo.p))[0];near(Core.totalItens(photographed.itens).k,65,'Quantidade corrigida na revisão da foto define os nutrientes salvos');
  ok(photographed.estimativa&&photographed.origem==='foto'&&photographed.foto.length<=60000,'Origem estimada permanece explícita e miniatura respeita o limite');
  eq(photo.state.calls.find(x=>x.rpc==='chat-envia').body.acao,'ia_prato','Foto usa a operação dedicada de estimativa');
  photo.state.photoHold=true;await photo.p.locator('#ntpNovo').click();await photo.p.locator('#ntpTitulo').fill('Foto que será cancelada');
  await photo.p.locator('#ntpFoto').setInputFiles({name:'outra-foto.png',mimeType:'image/png',buffer:image});await photo.p.waitForSelector('#ntpPreview:visible');
  await photo.p.locator('#ntpAnalisa').click();await until(()=>!!photo.state.photoRelease,'análise de foto pendente');
  await photo.p.locator('#ntpCancelar').click();await photo.p.locator('#ntpNovo').click();await photo.p.locator('#ntpTitulo').fill('Preenchimento novo');
  photo.state.photoHold=false;photo.state.photoRelease();await photo.p.waitForTimeout(100);
  eq(await photo.p.locator('#ntpTitulo').inputValue(),'Preenchimento novo','Resposta da foto cancelada preserva o novo formulário');
  eq(await photo.p.locator('#ntpItens [data-ntp-item]').count(),0,'Análise atrasada não insere alimentos no rascunho seguinte');
  eq(Object.keys(await getRecords(photo.p)).length,1,'Cancelar análise não confirma uma segunda refeição');
  await photo.ctx.close();

  const absent=await appFixture({nutricaoApp:null});eq(await absent.p.locator('#nutriAluno').count(),0,'Sem nutrição nem histórico não cria uma área vazia');eq(absent.state.calls.filter(x=>x.rpc.startsWith('app_nutricao_')).length,0,'Recurso ausente não consulta dados nutricionais');await absent.ctx.close();
  const paused=await appFixture({nutricaoApp:{...plan(),ativo:false}}, {ptnutricao:{v:1,registros:{anterior:record('anterior')}}});
  await openNutrition(paused.p);eq(await paused.p.locator('#ntpDiario [data-ntp-edita]:visible').count(),0,'Plano pausado não oferece edição de registros anteriores');
  ok((await paused.p.locator('#ntpDiario').textContent()).includes('Registro confirmado'),'Plano pausado mantém consulta do histórico');
  eq(await paused.p.evaluate(()=>window.__nutriAluno.xp()),2,'Pausar o plano conserva pontos do que já foi realizado');
  ok(!await paused.p.locator('#ntpNovo').isVisible()||await paused.p.locator('#ntpNovo').isDisabled(),'Plano pausado não permite confirmar novas refeições');
  await paused.ctx.close();
}
async function testTokenIsolation() {
  const ctx=await browser.newContext({viewport:{width:390,height:844},locale:'pt-BR',timezoneId:'America/Sao_Paulo',serviceWorkers:'block'}),p=await ctx.newPage(),calls=[];
  let releaseA;
  attachErrors(p);p.on('dialog',dialog=>dialog.accept());await p.clock.setFixedTime(new Date(STAMP));
  const data=token=>({a:{id:token,nome:token.endsWith('-a')?'Ágata':'Beatriz',appTokenP:token},studio:'Studio teste',metaSemana:3,cfg:{},fichasApp:[],guiaFichasP:[],fexs:[],sessApp:[],wodsApp:[],cardiosApp:[],nutricaoApp:plan(token),atualizador:''});
  await ctx.route('**/*',async route=>{
    const u=new URL(route.request().url());
    if(u.origin===new URL(BASE).origin){if(u.pathname==='/assets/cloud-config.js')return route.fulfill({contentType:'application/javascript',body:'self.MT_CLOUD='+JSON.stringify({url:FAKE,anonKey:'mock'})+';'});return route.continue();}
    if(u.origin!==FAKE){unexpectedNetwork.push(u.origin+u.pathname);return route.abort();}
    const rpc=u.pathname.split('/').pop(),body=route.request().postDataJSON();calls.push({rpc,body});
    let out=null;
    if(rpc==='app_aluno_estado')out={ok:true,dados:{html:'',dados:data(body.t),stamp:STAMP}};
    if(rpc==='app_aluno_busca')out={html:'',dados:data(body.t),stamp:STAMP};
    if(rpc==='app_nutricao_estado')out={ok:true,nutricao:{v:1,registros:body.t.endsWith('-b')?{beatriz:record('beatriz',{titulo:'Somente Beatriz'})}:{}}};
    if(rpc==='app_nutricao_salva'){
      if(body.t==='token-nutricao-a'){
        const confirmed=Object.fromEntries(body.p_registros.map(r=>[r.id,clone(r)]));
        await new Promise(resolve=>{releaseA=resolve;});out={ok:true,nutricao:{v:1,registros:confirmed}};
      }else out={erro:'envio indisponível no teste'};
    }
    return route.fulfill({contentType:'application/json',body:JSON.stringify(out)});
  });
  await ctx.addInitScript(()=>{localStorage.setItem('pttour',JSON.stringify({como:'teste'}));localStorage.setItem('ptonb',JSON.stringify({feito:true}));});
  await p.goto(BASE+'/app/?t=token-nutricao-a');await p.waitForFunction(()=>window.__nutriAluno);await openNutrition(p);
  await p.locator('#ntpNovo').click();await p.locator('#ntpTitulo').fill('Refeição exclusiva de Ágata');await p.locator('#ntpSalvar').click();
  ok(Object.keys(await getQueue(p)).length===1,'Primeiro aluno possui fila pendente antes de trocar acesso');
  await until(()=>!!releaseA,'ACK do primeiro aluno pendente');
  await p.locator('#ntpNovo').click();await p.locator('#ntpTitulo').fill('Rascunho exclusivo de Ágata');
  const b=await ctx.newPage();attachErrors(b);await b.clock.setFixedTime(new Date(STAMP));
  await b.goto(BASE+'/app/?t=token-nutricao-b');await b.waitForFunction(()=>window.__nutriAluno&&window.__nutriAluno.estado().registros.beatriz);
  eq(Object.keys(await getRecords(b)),['beatriz'],'Loader real troca token antes de hidratar o histórico do segundo aluno');
  eq(await getQueue(b),{},'Fila do aluno anterior não migra para o novo token');
  ok(!(await b.evaluate(()=>localStorage.getItem(window.__nutriAluno.chaves.rascunho))),'Rascunho alimentar do primeiro acesso não aparece no segundo');
  const stored=()=>b.evaluate(()=>Object.fromEntries(Object.values(window.__nutriAluno.chaves).map(k=>[k,localStorage.getItem(k)]))),before=await stored();
  releaseA();await p.waitForTimeout(150);
  eq(await stored(),before,'ACK da aba antiga não regrava diário, fila ou rascunho do segundo aluno');
  if(await p.locator('#ntpEditor').isVisible()){
    await p.locator('#ntpTitulo').fill('Edição em aba com acesso antigo');
    if(await p.locator('#ntpSalvar').isVisible()&&await p.locator('#ntpSalvar').isEnabled())await p.locator('#ntpSalvar').click();
  }
  eq(await stored(),before,'Interagir na aba antiga não salva alimentação no novo acesso');
  ok(!calls.filter(x=>x.rpc==='app_nutricao_salva'&&x.body.t==='token-nutricao-b').some(x=>x.body.p_registros.some(r=>r.titulo.includes('Ágata'))),'RPC nunca envia refeição de Ágata com token de Beatriz');
  await ctx.close();
}
async function testPersonal() {
  const ctx=await browser.newContext({viewport:{width:390,height:844},locale:'pt-BR',timezoneId:'America/Sao_Paulo',serviceWorkers:'block'}),p=await ctx.newPage();
  attachErrors(p);p.on('dialog',dialog=>dialog.accept());await p.clock.setFixedTime(new Date(STAMP));
  await ctx.route('**://*.supabase.co/**',route=>{unexpectedNetwork.push(route.request().url());return route.abort();});
  await p.goto(BASE+'/demo-personal.html');await p.locator('#btnDemo').click();await p.waitForURL(/personal\.html/);
  await p.waitForFunction(()=>window.MT_PERSONAL_NUTRICAO&&window.mockNuvem);
  const seed={a:plan(),b:plan('plano-b','Plano exclusivo de Beatriz'),retA:record('record-a',{titulo:'Registro exclusivo de Ágata'}),retB:record('record-b',{titulo:'Registro exclusivo de Beatriz'})};
  await p.evaluate(seed=>{
    const S=window.MTStore,st=S.read('ptStudio',{});
    st.alunos=[{id:'nutri-a',nome:'Ágata Oliveira',ativo:true,appTokenP:'token-nutricao-a',acessoEm:'2026-09-01',email:'agata@example.test',metaSemana:3},
      {id:'nutri-b',nome:'Beatriz Santana',ativo:true,appTokenP:'token-nutricao-b',acessoEm:'2026-09-01',email:'beatriz@example.test',metaSemana:3}];
    st.alunos.forEach((a,i)=>{a.appVer=window.MT_VERSAO;a.appPubEm='2026-09-07T12:00:00.000Z';a.retorno={nutricaoV1:{v:1,registros:i?{'record-b':seed.retB}:{'record-a':seed.retA}}};});
    st.sessoes=[];st.pagamentos=[];st.avaliacoes=[];st.contratosPT=[];st.planosPT=[];st.agFixas=[];st.bloqueios=[];
    st.config={...st.config,dia1Off:true,zapFilaOff:true};
    const exId=st.exercicios[0].id;st.treinosV2={'nutri-a':{fichas:[{id:'f-a',titulo:'A',itens:[{exId,series:3,reps:'10',descanso:60}]}]}};
    st.nutricaoV1={planos:{'nutri-a':seed.a,'nutri-b':seed.b},favoritos:[],alimentos:[]};
    window.__nutriTestWrites=[];window.__nutriTestOriginalCloud=S.cloud;window.__nutriTestOriginalWrite=S.write;
    S.cloud=()=>window.mockNuvem({aid:'nutri-test',tabelas:{app_aluno:q=>q.colunas==='retorno'?[{retorno:(S.read('ptStudio',{}).alunos.find(a=>a.appTokenP===q.filtros.token)||{}).retorno||{}}]:[]},onEscreve:w=>window.__nutriTestWrites.push({tabela:w.tabela,acao:w.acao,corpo:w.corpo})});
    window.__nutriRestoreCas=window.mockPublicacaoCas(S.cloud());
    localStorage.setItem('mtapp:ptStudio',JSON.stringify(st));window.__renderPT();
  },seed);
  async function main(k){if(await p.locator('#btnMenuPt').isVisible()&&!await p.locator('body').evaluate(el=>el.classList.contains('menu-aberto')))await p.locator('#btnMenuPt').click();await p.locator('#abas [data-a="'+k+'"]').click();}
  async function area(k){if(await p.locator('#pnArea').isVisible())await p.locator('#pnArea').selectOption(k);else await p.locator('#pnAbas [data-pna="'+k+'"]').click();}
  const savedPlans=()=>p.evaluate(()=>window.MTStore.read('ptStudio',{}).nutricaoV1.planos);
  const initialPlans=await savedPlans(),protectedBefore=await p.evaluate(()=>{const s=window.MTStore.read('ptStudio',{});return JSON.stringify([s.treinosV2,s.alunos.map(a=>a.retorno)]);});
  await main('nutricao');await p.locator('#pnAluno').selectOption('nutri-a');
  ok((await p.locator('#pnPlano').textContent()).includes('Plano de alimentação A'),'Nutrição seleciona o plano do aluno correto');
  await p.locator('#pnEditar').click();await p.locator('#pnTitulo').fill('Rascunho exclusivo de Ágata');
  await p.locator('#pnAluno').selectOption('nutri-b');ok((await p.locator('#pnPlano').textContent()).includes('Plano exclusivo de Beatriz'),'Trocar aluno consulta o plano da outra pessoa');
  ok(!await p.locator('#pnEditor').isVisible(),'Rascunho de Ágata não aparece no formulário de Beatriz');
  await p.locator('#pnAluno').selectOption('nutri-a');eq(await p.locator('#pnTitulo').inputValue(),'Rascunho exclusivo de Ágata','Retornar ao aluno recupera seu próprio rascunho');
  eq(await savedPlans(),initialPlans,'Trocar aluno e editar rascunho não alteram os planos aplicados');
  await p.locator('[data-pnqref="0"][data-pnqitem="0"]').fill('0');await p.locator('#pnRevisar').click();
  ok(await p.locator('#pnEditor').isVisible()&&!await p.locator('#pnRevisao').isVisible(),'Porção inválida bloqueia revisão sem descartar o formulário');
  eq(await savedPlans(),initialPlans,'Revisão inválida não muda dados salvos');
  await p.locator('[data-pnqref="0"][data-pnqitem="0"]').fill('2');
  await p.locator('[data-pnfood="0"]').click();await p.locator('#pnPickBusca').fill('banana prata');
  await p.locator('#pnPickLista [data-pnadd]').filter({hasText:'Adicionar'}).first().click();
  eq(await p.locator('[data-pnqref="0"]').count(),5,'Biblioteca adiciona alimento ao rascunho que já estava editado');
  eq(await p.locator('[data-pnqref="0"][data-pnqitem="0"]').inputValue(),'2','Adicionar alimento preserva quantidade alterada anteriormente');
  await p.locator('#pnRevisar').click();ok(await p.locator('#pnRevisao').isVisible(),'Revisão exibe a proposta antes de aplicar');
  eq(await savedPlans(),initialPlans,'Prévia não aplica o plano automaticamente');
  await p.evaluate(()=>{window.MTStore.write=function(k,v){if(k==='ptStudio')return false;return window.__nutriTestOriginalWrite(k,v);};});
  await p.locator('#pnAplicar').click();eq(await savedPlans(),initialPlans,'Falha de armazenamento não promete plano aplicado');
  ok(await p.locator('#pnRevisao').isVisible(),'Falha ao aplicar preserva a revisão para nova tentativa');
  await p.evaluate(()=>{window.MTStore.write=window.__nutriTestOriginalWrite;});await p.locator('#pnAplicar').click();
  const applied=await savedPlans();eq(applied['nutri-a'].titulo,'Rascunho exclusivo de Ágata','Aplicar salva o plano revisado para Ágata');
  eq(applied['nutri-b'],initialPlans['nutri-b'],'Aplicar não altera o plano de Beatriz');
  near(Core.totalItens(applied['nutri-a'].refeicoes[0].itens).k,584,'Plano aplicado soma quantidade editada e alimento acrescentado');
  ok(!await p.locator('#pnEditor').isVisible()&&await p.locator('#pnPublicar').isVisible(),'Após aplicar, publicar fica explícito e separado');
  await p.evaluate(()=>{window.__nutriTestWrites=[];});await p.locator('#pnPublicar').click();
  await p.waitForFunction(()=>window.__nutriTestWrites.some(x=>x.tabela==='app_aluno'&&x.acao==='upsert'));
  const publication=await p.evaluate(()=>window.__nutriTestWrites.filter(x=>x.tabela==='app_aluno'&&x.acao==='upsert').flatMap(x=>x.corpo));
  eq(publication.length,1,'Publicação envia somente o aluno escolhido');eq(publication[0].token,'token-nutricao-a','Pacote usa o token da pessoa revisada');
  const nutritionPacket=clone(publication[0].dados.dados.nutricaoApp),packetCatalog=nutritionPacket.catalogo,packetRecipes=nutritionPacket.receitas;
  delete nutritionPacket.catalogo;delete nutritionPacket.receitas;
  eq(nutritionPacket,applied['nutri-a'],'Pacote do app carrega exatamente o plano aplicado, com biblioteca separada');
  ok(Array.isArray(packetCatalog)&&packetCatalog.length>0&&packetCatalog.every(x=>!!Core.normalizaItem(x)),'Biblioteca publicada oferece apenas alimentos com valores válidos');
  ok(Array.isArray(packetRecipes)&&packetRecipes.every(x=>!!Core.normalizaReceita(x)),'Receitas publicadas preservam o contrato normalizado');
  eq(publication[0].dados.html,'','Publicação preserva o pacote de dados sem HTML duplicado');
  ok(!('nutricaoV1' in publication[0].dados.dados)&&!JSON.stringify(publication[0].dados.dados).includes('Plano exclusivo de Beatriz'),'DTO não inclui o mapa com planos de outros alunos');
  await area('registros');ok((await p.locator('#pnRegistros').textContent()).includes('Registro exclusivo de Ágata')&&!(await p.locator('#pnRegistros').textContent()).includes('Registro exclusivo de Beatriz'),'Registros filtram pelo aluno selecionado');
  await p.locator('#pnAluno').selectOption('nutri-b');ok((await p.locator('#pnRegistros').textContent()).includes('Registro exclusivo de Beatriz')&&!(await p.locator('#pnRegistros').textContent()).includes('Registro exclusivo de Ágata'),'Troca de aluno não deixa refeição anterior na consulta');
  await area('biblioteca');await p.locator('#pnBusca').fill('feijao carioca');
  ok((await p.locator('#pnCatalogo').textContent()).includes('Feijão carioca'),'Busca da biblioteca ignora acentos');
  const favorite=p.locator('#pnCatalogo [data-pnfav]').first(),favoriteId=await favorite.getAttribute('data-pnfav');await favorite.click();
  await p.locator('#pnFavoritos').click();eq(await p.locator('#pnCatalogo [data-pnfav]').count(),1,'Filtro favoritos conserva só o alimento marcado');
  eq(await p.locator('#pnCatalogo [data-pnfav]').first().getAttribute('data-pnfav'),favoriteId,'Favorito mantém a identidade do alimento');
  await p.locator('#pnFavoritos').click();await p.locator('#pnBusca').fill('');
  eq(await p.locator('#pnCatalogo [data-pnfav]').count(),40,'Biblioteca inicia com página limitada');await p.locator('#pnMais').click();eq(await p.locator('#pnCatalogo [data-pnfav]').count(),80,'Mostrar mais carrega a página seguinte da biblioteca');
  eq(await p.evaluate(()=>{const s=window.MTStore.read('ptStudio',{});return JSON.stringify([s.treinosV2,s.alunos.map(a=>a.retorno)]);}),protectedBefore,'Planos, publicação e favoritos preservam treinos e registros realizados');
  await p.evaluate(()=>window.__perfilPT('nutri-b'));await p.locator('#pfArea').selectOption('alimentacao');await p.locator('#pfNutricaoAbrir').click();
  eq(await p.locator('#pnAluno').inputValue(),'nutri-b','Atalho do perfil abre Nutrição com o aluno correto');
  for(const width of [360,390,1280]){await p.setViewportSize({width,height:844});for(const section of ['plano','biblioteca','registros']){await area(section);ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Painel '+section+' sem overflow em '+width+'px');}}
  await p.setViewportSize({width:390,height:844});await area('plano');await p.locator('#pnAluno').selectOption('nutri-a');await p.locator('#pnEditar').click();
  await p.locator('#pnTitulo').fill('Manual antes da IA');
  await p.evaluate(()=>{window.__nutriFunctionOriginal=window.MT_FUNCAO.chama;window.MT_FUNCAO.chama=(client,name,body)=>{window.__nutriIARequest=body;return new Promise(resolve=>{window.__nutriIAResolve=resolve;});};});
  await reveal(p,'#pnIAGerar');await p.locator('#pnIAGerar').click();
  const request=await p.evaluate(()=>window.__nutriIARequest);
  ok(request.acao==='ia_dieta'&&request.dados.includes('Ágata Oliveira')&&!request.dados.includes('Beatriz Santana'),'Geração usa somente o cadastro do destinatário capturado');
  await p.locator('#pnAluno').selectOption('nutri-b');
  await p.evaluate(()=>window.__nutriIAResolve({ok:true,texto:JSON.stringify({refeicoes:[{titulo:'Proposta exclusiva da IA',hora:'14:00',itens:[{nome:'Arroz branco cozido',qtd:2}]}]})}));
  await p.waitForTimeout(100);ok((await p.locator('#pnPlano').textContent()).includes('Plano exclusivo de Beatriz')&&!await p.locator('#pnRevisao').isVisible(),'Resposta de Ágata não invade a tela de Beatriz');
  eq(await savedPlans(),applied,'Geração e troca de aluno não aplicam proposta automaticamente');
  await p.locator('#pnAluno').selectOption('nutri-a');ok(await p.locator('#pnRevisao').isVisible(),'Proposta continua disponível só no aluno original para revisão');
  await p.locator('#pnDescartarIA').click();eq(await p.locator('#pnTitulo').inputValue(),'Manual antes da IA','Descartar IA restaura o rascunho manual anterior');
  eq(await p.locator('[data-pnqref="0"]').count(),5,'Descartar proposta recupera todos os alimentos editados manualmente');
  await reveal(p,'#pnIAGerar');await p.locator('#pnIAGerar').click();await p.locator('#pnIACancelar').click();
  await p.evaluate(()=>window.__nutriIAResolve({ok:true,texto:JSON.stringify({refeicoes:[{titulo:'Resposta cancelada',hora:'14:00',itens:[{nome:'Arroz branco cozido',qtd:2}]}]})}));
  await p.waitForTimeout(100);ok(await p.locator('#pnEditor').isVisible()&&!await p.locator('#pnRevisao').isVisible(),'Geração cancelada não reabre a prévia ao responder');
  eq(await p.locator('#pnTitulo').inputValue(),'Manual antes da IA','Cancelamento conserva a edição manual');
  await p.locator('#pnCancelar').click();await p.evaluate(()=>{window.MT_FUNCAO.chama=window.__nutriFunctionOriginal;});
  await p.evaluate(()=>{window.__nutriRestoreCas();window.MTStore.cloud=window.__nutriTestOriginalCloud;});await ctx.close();
}
(async()=>{
  testCore();
  browser=comMockNuvem(await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/opt/pw-browsers/chromium')?'/opt/pw-browsers/chromium':undefined),args:['--no-sandbox']}));
  await testPersonal();await testApp();await testTokenIsolation();
  eq(errors,[],'Sem erros JavaScript nos fluxos integrados');
  eq(unexpectedNetwork,[],'Nenhuma chamada atingiu serviços externos');
  console.log('Nutrição integrada: '+checks+' verificações passaram.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
