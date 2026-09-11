/* Contrato e execução reais do aluno. Somente pacotes sintéticos; rede de backend bloqueada. */
const assert=require('node:assert/strict'),vm=require('node:vm');
let chromium;try{chromium=require('playwright').chromium;}catch(_){chromium=require('/opt/node22/lib/node_modules/playwright').chromium;}
const {comMockNuvem}=require('./_nuvem.js');
const BASE=process.env.BASE_URL||'http://127.0.0.1:8765';
global.self=global;require('../app/aluno-skin.js');require('../app/aluno-builder.js');
const R=require('../assets/relatorio-0809.js');
let browser,n=0;function ok(v,m){assert.ok(v,m);n++;console.log('OK '+m);}function eq(v,w,m){assert.deepEqual(v,w,m);n++;console.log('OK '+m);}
const zone={id:'zona-sintetica',nome:'Faixa prescrita',tipo:'pace',min:300,max:360};
const blocks=[
 {tipo:'ativo',alvo:{acao:'correr',valor:1,unidade:'km',esforco:{tipo:'pace',min:330,max:360},orientacao:'Mantenha o percurso combinado.'}},
 {tipo:'ativo',alvo:{acao:'caminhar',valor:100,unidade:'m',esforco:{tipo:'rpe',min:2,max:3}}},
 {tipo:'ativo',alvo:{acao:'correr',valor:2,unidade:'km',zona:zone}},
 {tipo:'recuperacao',alvo:{acao:'caminhar',valor:200,unidade:'m',esforco:{tipo:'fc',min:110,max:130}}}
];
const D={a:{id:'runner-synthetic',nome:'Corredor Sintético'},studio:'Teste de corrida',COR:'#7c3aed',COR2:'#5925ba',CORC:'#b395ff',CORE:'#33155c',CORCL1:'#d6c4ff',CORCL2:'#e8ddff',cfg:{},cardiosApp:[]};
function htmlFor(bs){return MT_APP_ALUNO.monta({...D,cardiosApp:[{id:'etapas-sinteticas',nome:'Correr e caminhar',tipo:'continuo',mod:'corrida',dist:5,blocos:bs}]});}
function packageOf(html){const i=html.indexOf('var CARDIOS='),j=html.indexOf('function crAlvoTxt',i);assert.ok(i>0&&j>i);return JSON.parse(JSON.stringify(vm.runInNewContext(html.slice(i,j)+'CARDIOS')))[0];}
const html=htmlFor(blocks),pack=packageOf(html);
eq(pack.bl.map(b=>[b.n,b.km,b.s]),[['Correr',1,0],['Caminhar',.1,0],['Correr',2,0],['Caminhar',.2,0]],'exemplo completo preserva ações e converte metros para distância por etapa');
eq(pack.t,'blocos','prescrição estruturada seleciona o player de etapas');eq(pack.d,0,'distância antiga do treino simples não se mistura à sequência');
ok(pack.bl[0].d.includes('Ritmo 5:30–6:00 min/km')&&pack.bl[0].d.includes('Mantenha o percurso combinado.'),'ritmo e orientação chegam ao aluno');
ok(pack.bl[1].d.includes('100 m')&&pack.bl[1].d.includes('Esforço 2–3/10'),'metros e esforço percebido são legíveis');
ok(pack.bl[2].d.includes('Faixa prescrita')&&pack.bl[3].d.includes('FC 110–130 bpm'),'zona antiga e FC direta conservam unidades');
eq(pack.bl,R.expande(blocks),'editor e builder concordam em todas as etapas novas');
const snap=R.blocos(blocks);blocks[0].alvo.esforco.min=200;zone.nome='Biblioteca alterada';
eq(snap[0].alvo.esforco.min,330,'alvo direto salvo mantém snapshot independente');eq(snap[2].alvo.zona.nome,'Faixa prescrita','zona salva mantém snapshot independente');
blocks[0].alvo.esforco.min=330;zone.nome='Faixa prescrita';
const legacy=[{tipo:'aquecimento',alvo:{valor:5,unidade:'min'}},{tipo:'repetir',repeticoes:2,alvo:{valor:.2,unidade:'km',zona:zone},recuperacao:{valor:45,unidade:'s'}},{tipo:'recuperacao',alvo:{valor:2,unidade:'min'}}];
const old=packageOf(htmlFor(legacy));
eq(old.bl,R.expande(legacy),'editor e builder continuam iguais para treinos legados');
eq(old.bl.map(b=>b.n),['Aquecimento','Ativo 1 de 2','Recuperação 1 de 2','Ativo 2 de 2','Recuperação 2 de 2','Recuperação'],'rótulos antigos não mudam sem ação explícita');
eq(Object.keys(R.blocos(legacy)[0].alvo),['valor','unidade','zona'],'ausência de campos novos conserva objeto normalizado legado');
eq(old.bl[0],{k:'aq',n:'Aquecimento',d:'5 min',s:300,km:0},'formato expandido legado é idêntico');
const repeated=[{tipo:'repetir',repeticoes:2,alvo:{acao:'pedalar',valor:2,unidade:'min',esforco:{tipo:'velocidade',min:15,max:18}},recuperacao:{acao:'recuperar',valor:30,unidade:'s',esforco:{tipo:'rpe',min:2,max:2}}}];
const rep=packageOf(htmlFor(repeated));eq(rep.bl.map(b=>[b.n,b.s]),[['Pedalar 1 de 2',120],['Recuperar 1 de 2',30],['Pedalar 2 de 2',120],['Recuperar 2 de 2',30]],'repetições aceitam ações e esforço próprios no trabalho e recuperação');
ok(rep.bl[0].d.includes('Velocidade 15–18 km/h')&&rep.bl[1].d.includes('Esforço 2/10'),'velocidade e esforço único não duplicam limites');
eq(packageOf(htmlFor([{tipo:'aquecimento',alvo:{acao:'aquecer',valor:1,unidade:'min'}}])).bl[0].n,'Aquecer','aquecimento tem ação explícita');
const invalid=[
 {valor:0,unidade:'m'}, {valor:500001,unidade:'m'}, {valor:1,unidade:'yards'}, {valor:1,unidade:'km',acao:'voar'}, {valor:1,unidade:'km',acao:'toString'},
 {valor:1,unidade:'km',orientacao:'x'.repeat(241)}, {valor:1,unidade:'km',orientacao:123},
 ...[{tipo:'rpe',min:0,max:3},{tipo:'rpe',min:3,max:11},{tipo:'pace',min:400,max:300},{tipo:'pace',min:300.5,max:360},{tipo:'fc',min:110.5,max:130},{tipo:'fc',min:110,max:301},{tipo:'velocidade',min:5,max:201},{tipo:'other',min:1,max:2},{tipo:'rpe',min:'2',max:3}].map(esforco=>({valor:1,unidade:'km',esforco})),
 {valor:1,unidade:'km',zona:zone,esforco:{tipo:'pace',min:300,max:360}}
];
for(const [i,alvo] of invalid.entries()){const c=packageOf(htmlFor([{tipo:'ativo',alvo}]));ok(c.erro&&c.bl.length===0&&c.d===0,'alvo inválido '+(i+1)+' bloqueia execução sem cair no treino simples');assert.throws(()=>R.blocos([{tipo:'ativo',alvo}]));}
const injected='</script><script>window.corridaInjetada=true</script>';
const malicious=htmlFor([{tipo:'ativo',alvo:{valor:100,unidade:'m',acao:'caminhar',orientacao:injected}}]);
ok(!malicious.includes(injected),'orientação é serializada como dado, sem fechar script');

(async()=>{
 browser=comMockNuvem(await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']}));
 const ctx=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',timezoneId:'America/Sao_Paulo'}),errors=[];
 await ctx.route('**/*',r=>new URL(r.request().url()).origin===new URL(BASE).origin?r.continue():r.abort());
 await ctx.route(BASE+'/corrida-etapas-sinteticas.html',r=>r.fulfill({contentType:'text/html',body:html}));
 const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 await p.clock.setFixedTime(new Date('2026-09-11T12:00:00-03:00'));await p.goto(BASE+'/corrida-etapas-sinteticas.html');await p.waitForFunction(()=>window.__crGuia&&window.__pintaCr);
 await p.evaluate(()=>{localStorage.setItem('ptcrCfg',JSON.stringify({cd:0,fb:'off',ap:0,bl:0}));document.querySelector('[data-cbstart]').click();});
 const livePlan=await p.evaluate(()=>__crGuia.monta(__cr.plano));eq(livePlan,pack.bl,'player real lê o pacote e não adiciona aquecimento automático à sequência explícita');
 async function reset(plan=pack,gps=false){await p.evaluate(({plan,gps})=>{document.getElementById('crZera').click();Object.assign(__cr,{resumo:false,plano:plan,mod:'corrida',blocos:__crGuia.monta(plan),bi:0,bt0:0,bkm0:0,gpsOn:gps,km:0,acum:0,t0:Date.now(),run:true});document.getElementById('crKm').value='0';__pintaCr();},{plan,gps});}
 async function progress(km,seconds=30){return p.evaluate(({km,seconds})=>{if(__cr.gpsOn)__cr.km=km;else document.getElementById('crKm').value=String(km);__cr.t0=Date.now()-seconds*1000;__pintaCr();return {bi:__cr.bi,base:__cr.bkm0,bt:__cr.bt0,fase:document.getElementById('crFase').textContent,restante:document.getElementById('crBlocoT').textContent,info:document.getElementById('crInfo').textContent,run:__cr.run,reg:__cr.fimReg};},{km,seconds});}
 await reset();let state=await progress(0);eq(state.restante,'1 km','distância é visível mesmo sem GPS');
 state=await progress(1);eq(state.bi,1,'1 km manual conclui só a primeira etapa');eq(state.restante,'100 m','caminhada começa com seus 100 m completos');ok(state.fase.includes('CAMINHAR'),'player anuncia caminhada em vez de esforço genérico');
 state=await progress(1.05);eq(state.bi,1,'50 m não encerram uma caminhada de 100 m');eq(state.restante,'50 m','contador usa metros no trecho curto');
 state=await progress(1.1);eq(state.bi,2,'100 m completos avançam para a segunda corrida');eq(state.restante,'2 km','segunda corrida começa com alvo de 2 km');
 state=await progress(3.1);eq(state.bi,3,'distância cumulativa respeita todos os trechos anteriores');eq(state.restante,'200 m','recuperação final preserva 200 m');
 state=await progress(3.3,900);ok(!state.run&&state.reg&&state.reg.k===3.3,'últimos 200 m finalizam e registram 3,3 km, sem falha de ponto flutuante');
 await reset(pack,true);state=await progress(1.05);eq(state.bi,1,'GPS também conclui apenas o trecho percorrido');eq(state.restante,'50 m','GPS carrega excedente para o próximo trecho');
 state=await progress(1.15);eq(state.bi,2,'GPS continua entre distâncias desiguais');eq(state.restante,'1,95 km','excedente do GPS não é descartado na transição');
 await reset();state=await progress(3.15,900);eq(state.bi,3,'salto grande da distância manual percorre as três etapas completas');eq(state.restante,'150 m','salto grande mantém o excedente no último trecho');
 await reset(pack,true);state=await progress(3.15,900);eq(state.bi,3,'salto grande do GPS percorre todas as etapas concluídas');eq(state.restante,'150 m','salto grande de GPS não reinicia a última etapa');
 // Ligar/desligar GPS mantém a mesma distância acumulada, como no cronômetro real.
 await reset(pack,true);await progress(1.05);await p.evaluate(()=>{document.getElementById('crKm').value='1.05';__cr.gpsOn=false;});state=await progress(1.1);eq(state.bi,2,'trocar GPS por distância manual conserva a origem do trecho');eq(state.restante,'2 km','distância manual após GPS continua na segunda corrida');
 await p.evaluate(()=>{__cr.gpsOn=true;__cr.km=1.1;});state=await progress(1.2);eq(state.bi,2,'retorno do GPS não reinicia nem pula a etapa');eq(state.restante,'1,9 km','retorno do GPS conserva o alvo restante');
 await reset();await progress(1);await p.evaluate(()=>{__cr.run=false;__cr.acum=30;});state=await progress(1.1);eq(state.bi,1,'treino pausado não conclui etapa enquanto aluno ajusta distância');
 await p.evaluate(()=>{__cr.run=true;});state=await progress(1.1);eq(state.bi,2,'retomar aplica distância sem reiniciar as etapas');
 const mixed=packageOf(htmlFor([{tipo:'aquecimento',alvo:{acao:'aquecer',valor:30,unidade:'s'}},{tipo:'ativo',alvo:{acao:'caminhar',valor:100,unidade:'m'}},{tipo:'ativo',alvo:{acao:'correr',valor:1,unidade:'min'}},{tipo:'ativo',alvo:{acao:'correr',valor:1,unidade:'km'}}]));
 await reset(mixed);state=await progress(.05,30);eq(state.bi,1,'etapa por tempo avança no instante prescrito');eq(state.restante,'100 m','distância nova inicia na leitura manual atual após etapa por tempo');
 state=await progress(.15,40);eq(state.bi,2,'distância após tempo encerra nos 100 m próprios');eq(state.bt,40,'etapa seguinte por tempo inicia na transição real');
 state=await progress(.35,100);eq(state.bi,3,'minuto seguinte termina sem repetir tempo dos trechos anteriores');eq(state.restante,'1 km','distância após o minuto usa nova origem');
 // Legado misto com tempo E distância mantém a prioridade existente por disponibilidade do GPS.
 const legacyDual={n:'Legado misto',t:'misto',m:'corrida',d:1,tp:2,r:2,ti:30,de:45};
 await p.evaluate(()=>localStorage.setItem('ptcrCfg',JSON.stringify({cd:0,fb:'off',ap:0,bl:1})));
 const dualSteps=await p.evaluate(plan=>__crGuia.monta(plan),legacyDual);eq(dualSteps.map(b=>b.k),['aq','c','f','l','f','l','vc'],'misto legado mantém aquecimento, contínuo, tiros e volta à calma');
 eq(await p.evaluate(()=>{__cr.gpsOn=false;return [__crFimContinua(1,120,1.5,30),__crFimContinua(1,120,.1,120)];}),[false,true],'sem GPS o legado com dois alvos continua priorizando tempo');
 eq(await p.evaluate(()=>{__cr.gpsOn=true;return [__crFimContinua(1,120,.1,150),__crFimContinua(1,120,1,30)];}),[false,true],'com GPS o legado com dois alvos continua priorizando distância');
 // O aviso usa a ação e os alvos reais da próxima etapa.
 await reset();await p.evaluate(()=>{window.__falasCorrida=[];speechSynthesis.speak=u=>__falasCorrida.push(u.text);localStorage.setItem('ptcrCfg',JSON.stringify({cd:0,fb:'voz',ap:0,bl:0}));});await progress(1);
 const voice=await p.evaluate(()=>__falasCorrida);ok(voice.some(t=>t.includes('Caminhar')&&t.includes('100 m')&&t.includes('Esforço 2–3/10')),'voz conserva ação, distância e esforço prescrito');
 for(const width of [320,390,1280]){await p.setViewportSize({width,height:844});ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'aluno sem overflow em '+width+' px');}
 await p.evaluate(()=>document.getElementById('crZera').click());
 eq(errors,[],'execução nova e legada não causam erros de JavaScript');await ctx.close();console.log(n+' verificações de etapas de corrida no aluno passaram.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
