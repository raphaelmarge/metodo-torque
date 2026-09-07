/* Regressões v785: dados semanais, prescrição, retomada, recibo final e envio.
 * Tudo usa alunos sintéticos e intercepta a nuvem, sem dados de produção. */
process.env.TZ = 'America/Sao_Paulo';
const assert = require('assert/strict');
const fs = require('fs');
let chromium;
try { chromium = require('playwright').chromium; }
catch (_) { chromium = require('/opt/node22/lib/node_modules/playwright').chromium; }
const A = require('../assets/acompanhamento.js');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765';
let browser, total = 0;
function ok(value, label) { assert.ok(value, label); console.log('  ✅ ' + label); total++; }

(async () => {
  const aluno = {id:'a',nome:'Aluno Teste',metaSemana:3,retorno:{
    feitos:{'2026-08-31':true,'2026-09-01':true,'2026-09-09':true},
    rpe:{'2026-08-31':1,'2026-09-01':3,'2026-09-02':999},
    cargas:{Supino:[{d:'2026-08-20',kg:20},{d:'2026-09-01',kg:25},{d:'2026-09-09',kg:200}]},
    notas:[{d:'2026-09-01',t:'Dúvida'},{d:'2026-09-09',t:'Futuro'}]
  }};
  const st = {alunos:[aluno],exercicios:[{id:'e',nome:'Supino'}],sessoes:[
    {alunoId:'a',data:'2026-08-31',feita:true},{alunoId:'a',data:'2026-09-02',feita:true},
    {alunoId:'outro',data:'2026-09-03',feita:true}],
    treinosV2:{a:{fichas:[{id:'f',titulo:'A',itens:[{exId:'e',series:3,reps:'12',descanso:60}]}],plano:{dias:{1:[{tp:'ficha'}],3:{tp:'ficha'}}}}}};
  const r = A.resumo(st,aluno,'2026-09-05');
  ok(r.realizados===3 && r.planejados===2, 'dias deduplicados entre agenda/app, por aluno, com plano antigo e novo');
  ok(r.rpe===2 && r.notas.length===1 && r.avancos[0].para===25,'datas futuras e esforço inválido ficam fora do resumo');
  const f={itens:[{series:3,reps:'12',descanso:60},{series:2,reps:'8',descanso:90}]};
  A.lote(f,[0],{descanso:'0',reps:'8–10'});
  ok(f.itens[0].descanso===0 && f.itens[0].series===3 && f.itens[1].descanso===90,'edição em lote preserva vazios, aceita zero e só muda selecionados');
  assert.throws(()=>A.lote(f,[0],{series:'0'}));
  ok(f.itens[0].series===3,'validação não deixa alteração parcial');
  const antes=A.snapshot(st,'a');st.treinosV2.a.fichas[0].itens[0].alternativas=['Flexão'];
  ok(A.diferencas(antes,A.snapshot(st,'a')).some(x=>x.includes('Flexão')),'comparação inclui alternativas aprovadas');
  st.treinosV2.a.plano.dias[2]=[{tp:'ficha'}];
  ok(!antes.plano.dias[2],'referência publicada é independente de edições posteriores');

  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium')?'/opt/pw-browsers/chromium':undefined),args:['--no-sandbox']});
  const ctx=await browser.newContext({viewport:{width:390,height:844},locale:'pt-BR',timezoneId:'America/Sao_Paulo',serviceWorkers:'block'});
  const p=await ctx.newPage(); const errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  await ctx.route('**://*.supabase.co/**',r=>r.abort());
  await p.goto(BASE+'/demo-personal.html');await p.click('#btnDemo');await p.waitForURL(/personal\.html/);
  await p.waitForFunction(()=>window.__acompPT && window.MTStore.read('ptStudio',{}).alunos.length);
  const id=await p.evaluate(()=>window.MTStore.read('ptStudio',{}).alunos[0].id);
  await p.evaluate(id=>window.__acompPT.revisar(id),id);
  await p.fill('#acTexto','Orientação revisada pelo personal.');await p.click('#acGuardar');
  ok((await p.textContent('#acStatus')).includes('Revisão salva'),'revisão semanal salva pelo formulário');
  await p.reload();await p.waitForFunction(()=>window.__acompPT);
  await p.evaluate(id=>window.__acompPT.revisar(id),id);
  ok(await p.inputValue('#acTexto')==='Orientação revisada pelo personal.','revisão permanece após recarregar');
  await p.click('[data-ac-fecha]');
  await p.evaluate(id=>window.__acompPT.previa(id,false),id);
  ok((await p.textContent('#acDialog')).includes('Semana programada') && await p.locator('#acPublicar').count()===0,'prévia consulta a prescrição sem publicar');
  await p.click('[data-ac-fecha]');
  await p.evaluate(id=>{window.__vaiMontarTreino ? window.__vaiMontarTreino(id) : null;},id);
  // A ficha e o seletor são os mesmos usados pelo professor; o gancho só abre o diálogo.
  await p.evaluate(id=>{const e=document.getElementById('tAluno');e.value=id;e.dispatchEvent(new Event('change'));},id);
  const fid=await p.evaluate(id=>window.MTStore.read('ptStudio',{}).treinosV2[id].fichas[0].id,id);
  await p.evaluate(fid=>window.__acompPT.lote(fid),fid);
  await p.fill('#acSeries','4');await p.click('#acAplicar');
  ok(await p.evaluate(id=>window.MTStore.read('ptStudio',{}).treinosV2[id].fichas[0].itens.every(x=>x.series===4),id),'edição em lote persiste a ficha real do painel');
  const D=await p.evaluate(id=>window.__dadosApp(window.MTStore.read('ptStudio',{}).alunos.find(a=>a.id===id),new Date().toISOString()),id);
  const modalidades=await p.evaluate(()=>{
    const st={alunos:[{id:'so-corrida',nome:'Somente corrida'}],sessoes:[],treinosV2:{'so-corrida':{cardio:[{nome:'Rodagem'}]}}};
    window.__acompPT.pendencias(st);const semAlerta=!document.querySelector('#acPendencias');
    st.treinosV2['so-corrida'].cardio=[];window.__acompPT.pendencias(st);
    return {semAlerta,semTreino:document.querySelector('#acPendencias').textContent};
  });
  ok(modalidades.semAlerta && modalidades.semTreino.includes('Sem treino prescrito'),'central reconhece prescrição só de corrida e distingue treino ausente');
  await ctx.close();

  global.self=global;global.MT_CLOUD={url:'https://torque-test.invalid',anonKey:'teste'};
  require('../app/aluno-skin.js');require('../app/aluno-builder.js');
  const itens=[{nome:'Supino teste',series:2,reps:'10',descanso:60,alts:['Flexão aprovada'],altsAprovadas:true},{nome:'Remada teste',series:1,reps:'12',descanso:30,alts:[]}];
  Object.assign(D,{a:{id:'teste',nome:'Aluno Teste',appTokenP:'token-teste'},atualizador:'',botApp:null,qa:null,avs:[],planoApp:null,
    fichasApp:[{titulo:'A — Teste',itens}],fexs:itens.map(x=>({n:x.nome,s:x.series})),
    guiaFichasP:[{n:'A — Teste',it:itens.map(x=>({e:x.nome,s:x.series,r:x.reps,d:x.descanso,v:''}))}],wodsApp:[],cardiosApp:[]});
  const html=global.MT_APP_ALUNO.monta(D);
  const ca=await browser.newContext({viewport:{width:390,height:844},locale:'pt-BR',timezoneId:'America/Sao_Paulo',serviceWorkers:'block'});
  const pa=await ca.newPage();pa.on('pageerror',e=>errors.push(e.message));
  let fail=true,posted=[];
  await ca.route('**://*.supabase.co/**',r=>r.abort());
  await ca.route('https://torque-test.invalid/**',route=>{
    const url=route.request().url();
    if(url.endsWith('/app_aluno_devolve')){posted.push(route.request().postDataJSON());return route.fulfill({status:fail?503:200,contentType:'application/json',body:JSON.stringify({ok:!fail})});}
    return route.fulfill({contentType:'application/json',body:'null'});
  });
  await ca.route(BASE+'/acomp-test.html',route=>route.fulfill({contentType:'text/html',body:html}));
  await ca.addInitScript(()=>{localStorage.setItem('pttour',JSON.stringify({como:'teste'}));localStorage.setItem('ptonb',JSON.stringify({feito:true}));});
  await pa.goto(BASE+'/acomp-test.html');await pa.waitForFunction(()=>window.__acSessao);
  ok(!/enviados ao personal/.test(await pa.textContent('#acSync')),'app novo não promete envio sem confirmação');
  await pa.setViewportSize({width:1280,height:900});
  ok(!await pa.isVisible('#menuApp'),'menu fechado fica invisível também no desktop');
  await pa.click('#navMenuApp');ok(await pa.isVisible('#menuApp'),'menu continua acessível pelo botão');
  await pa.click('#navMenuApp');await pa.setViewportSize({width:390,height:844});
  // O botão do treino é a entrada real do player.
  await pa.evaluate(()=>document.querySelector('.guiabtn').click());
  await pa.waitForFunction(()=>getComputedStyle(document.getElementById('guiaBox')).display==='flex');
  ok((await pa.textContent('#gMiolo')).includes('aprovadas'),'alternativa do professor tem origem explícita');
  await pa.click('#gSerie');
  const saved=await pa.evaluate(()=>window.__acSessao.ler());
  ok(saved.s===1 && saved.desc>Date.now(),'série e prazo do descanso salvos');
  ok(await pa.evaluate(()=>{const k='ptguiaSessao',raw=localStorage.getItem(k),x=JSON.parse(raw);x.token='outro';localStorage.setItem(k,JSON.stringify(x));const bloqueou=!window.__acSessao.ler();localStorage.setItem(k,raw);return bloqueou;}),'retomada não atravessa o acesso de outro aluno');
  await pa.reload();await pa.waitForFunction(()=>window.__acSessao);
  await pa.click('#navApp [data-msec="treino"]');
  ok(await pa.isVisible('#acRetomar'),'app oferece continuar depois de recarregar');
  await pa.click('#acRetomar button');
  ok(await pa.evaluate(()=>window.__gvDe().s===1 && window.__gvDe().timer!==null),'retomada mantém série e descanso');
  await pa.evaluate(()=>window.__zeraDescanso());await pa.click('#acRelatar');
  await pa.fill('.ac-feedback textarea','Preciso confirmar a pegada.');await pa.click('[data-ac-save]');
  const nota=await pa.evaluate(()=>JSON.parse(localStorage.getItem('ptnotas')).slice(-1)[0]);
  ok(nota.ex==='Supino teste' && nota.serie===2 && nota.ficha==='A — Teste','relato preserva exercício, ficha e série');
  await pa.click('[data-ac-close]');await pa.waitForFunction(()=>window.__acSync.pendente());
  await pa.waitForFunction(()=>document.querySelector('#acSync span').textContent.includes('envio pendente'),null,{timeout:10000});
  ok(await pa.evaluate(()=>JSON.parse(localStorage.getItem('ptnotas')).length===1),'falha no servidor mantém os registros locais');
  fail=false;await pa.evaluate(()=>document.querySelector('#acSync button').click());
  await pa.waitForFunction(()=>!window.__acSync.pendente(),null,{timeout:10000});
  ok(await pa.evaluate(()=>!!JSON.parse(localStorage.getItem('ptenvioUlt')) && document.getElementById('acSync').hidden && document.querySelector('#acSync span').textContent==='') && posted.some(x=>x.p_dados.notas.length),'confirmação do servidor quita a pendência e envia o relato sem deixar aviso no Início');
  await pa.click('#gSerie');await pa.evaluate(()=>window.__zeraDescanso());await pa.click('#gSerie');
  await pa.reload();await pa.waitForFunction(()=>window.__acSessao);await pa.click('#navApp [data-msec="treino"]');await pa.click('#acRetomar button');
  ok(await pa.isVisible('#gFecharTreino') && await pa.locator('#gSerie').count()===0,'última série retoma na confirmação, sem série extra');
  await pa.click('#gFecharTreino');
  await pa.waitForSelector('#gFim');
  ok(await pa.evaluate(()=>!window.__acSessao.ler()),'concluir limpa a retomada');
  const fimVisual=await pa.evaluate(()=>{
    const box=document.getElementById('guiaBox'),card=document.getElementById('gCard'),btn=document.getElementById('gFim');
    const rb=btn.getBoundingClientRect(),cb=getComputedStyle(btn);
    return {festa:box.classList.contains('festa'),recibo:card.classList.contains('recibo'),
      titulo:/Treino concluído|Meta da semana batida/.test(document.getElementById('gMiolo').textContent),
      tiles:card.querySelectorAll('.wtile2').length,rpes:card.querySelectorAll('[data-rpe]').length,
      rpeGrade:getComputedStyle(card.querySelector('.rperow')).display,
      botaoAlto:rb.height,botaoDentro:rb.top>=0&&rb.bottom<=innerHeight+1,botaoCor:cb.backgroundColor,
      semX:box.scrollWidth<=box.clientWidth+1&&card.scrollWidth<=card.clientWidth+1,
      rolagem:getComputedStyle(card).overflowY,fundo:getComputedStyle(box).backgroundImage};
  });
  ok(fimVisual.festa&&fimVisual.recibo&&fimVisual.titulo&&fimVisual.tiles>=2&&fimVisual.rpes===3,
    'recibo final reúne celebração, resumo, esforço e fechamento');
  ok(fimVisual.rpeGrade==='grid'&&fimVisual.botaoAlto>=58&&fimVisual.botaoDentro&&fimVisual.botaoCor==='rgb(255, 255, 255)',
    'ações finais mantêm três alvos iguais e Fechar destacado no alcance do polegar');
  ok(fimVisual.semX&&fimVisual.rolagem==='auto'&&fimVisual.fundo.includes('radial-gradient'),
    'tela 390×844 preserva marca, rolagem e não cria vazamento horizontal');
  await pa.setViewportSize({width:375,height:667});
  const fimBaixo=await pa.evaluate(()=>{
    const box=document.getElementById('guiaBox'),card=document.getElementById('gCard'),btn=document.getElementById('gFim');
    const r=btn.getBoundingClientRect();
    return {fecharVisivel:r.top>=0&&r.bottom<=innerHeight+1,rolavel:card.scrollHeight>card.clientHeight,
      semX:box.scrollWidth<=box.clientWidth+1&&card.scrollWidth<=card.clientWidth+1};
  });
  ok(fimBaixo.fecharVisivel&&fimBaixo.rolavel&&fimBaixo.semX,
    'tela 375×667 mantém Fechar visível e o recibo inteiro alcançável por rolagem');
  await pa.click('#gFim');ok(!await pa.isVisible('#guiaBox'),'Fechar encerra o resumo do treino');
  await pa.setViewportSize({width:390,height:844});
  // O descanso zero começa uma execução nova; a anterior foi concluída e
  // agora o player preserva corretamente seus slots g2 no mesmo dia.
  await pa.evaluate(()=>{
    ['ptdc','ptfeitos','ptguiaSessao'].concat(Object.keys(localStorage).filter(k=>k.startsWith('ptsets_')))
      .forEach(k=>localStorage.removeItem(k));
  });
  D.fichasApp[0].itens[0].descanso=0;D.guiaFichasP[0].it[0].d=0;
  await ca.route(BASE+'/acomp-zero.html',route=>route.fulfill({contentType:'text/html',body:global.MT_APP_ALUNO.monta(D)}));
  await pa.goto(BASE+'/acomp-zero.html');await pa.waitForFunction(()=>window.__acSessao);
  await pa.evaluate(()=>document.querySelector('.guiabtn').click());await pa.click('#gSerie');
  ok(await pa.evaluate(()=>window.__gvDe().s===1 && window.__gvDe().timer===null),'descanso zero entre séries avança sem inventar 60 segundos');
  ok(errors.length===0,'nenhum erro de JavaScript: '+errors.join('; '));
  await ca.close();
  console.log(total+' verificações passaram.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
