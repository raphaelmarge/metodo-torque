/* Início: carrossel do plano, hábitos acessíveis e retomada, com dados sintéticos. */
const assert = require('assert/strict');
const fs = require('fs');
let chromium;
try { chromium = require('playwright').chromium; } catch (_) { chromium = require('/opt/node22/lib/node_modules/playwright').chromium; }
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765';
global.self = global;
require('../app/aluno-skin.js'); require('../app/aluno-builder.js');
const capa = 'data:image/jpeg;base64,' + fs.readFileSync(require('path').join(__dirname, '../tools/demo-aluno/capa-treino.jpg')).toString('base64');
const capaCircuito = 'data:image/jpeg;base64,' + fs.readFileSync(require('path').join(__dirname, '../tools/demo-aluno/capa-circuito.jpg')).toString('base64');
const capaCorrida = 'data:image/jpeg;base64,' + fs.readFileSync(require('path').join(__dirname, '../tools/demo-aluno/capa-corrida.jpg')).toString('base64');
const linhas = [{reps:'5',carga:null,descanso:90},{reps:'8',carga:null,descanso:75},{reps:'10',carga:null,descanso:0}];
const D = {a:{nome:'Aluno de teste',id:'inicio-test'},studio:'Studio teste',COR:'#7c3aed',COR2:'#5925ba',CORC:'#b395ff',CORE:'#33155c',CORCL1:'#d6c4ff',CORCL2:'#e8ddff',PAL:['#0d0c10','#111015','#15131b','#191621','#211d2a','#272231','#2c2639','#342d42','#3b334b','#443a54','#4d425f','#574b6c','#62557a'],cfg:{capaTreino:capa},metaSemana:3,
  fichasApp:[{titulo:'A — Peito',itens:[{nome:'Supino teste',series:3,reps:'5',descanso:90,seriesDetalhadas:linhas}]}],
  guiaFichasP:[{n:'A — Peito',it:[{e:'Supino teste',s:3,r:'5',d:90,seriesDetalhadas:linhas}]}],fexs:[{n:'Supino teste',s:3}],sessApp:[],wodsApp:[],cardiosApp:[]};
let count=0; function ok(value, title){assert.ok(value,title);count++;console.log('  OK '+title);}
async function registros(page){
  return page.evaluate(()=>Object.fromEntries(['ptguiaSessao','ptdc','ptfeitos','ptwodres','ptcardio'].map(k=>[k,localStorage.getItem(k)])));
}
async function cardsVisiveis(page){
  return page.locator('#heroCarr').evaluate(el=>Array.from(el.children).filter(c=>!c.hidden&&getComputedStyle(c).display!=='none').map(c=>({id:c.id,titulo:(c.querySelector('.htit')||c).textContent.trim(),texto:c.textContent.trim()})));
}
async function arrastaProximo(page){
  const carr=page.locator('#heroCarr');await carr.scrollIntoViewIfNeeded();
  const box=await carr.boundingBox(),antes=await carr.evaluate(e=>e.scrollLeft);
  const y=Math.max(50,Math.min(box.y+box.height*.35,page.viewportSize().height-100));
  const cd=await page.context().newCDPSession(page);
  try {
    await cd.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width*.85,y}]});
    for(let i=1;i<=8;i++){
      await cd.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+box.width*(.85-.65*i/8),y}]});
      await page.waitForTimeout(25);
    }
    await cd.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForFunction(x=>document.getElementById('heroCarr').scrollLeft>x+100,antes);
  }finally{await cd.detach();}
}
async function escolheIndicador(page,indice){
  const dot=page.locator('#inicioIndicadores button').nth(indice),id=await dot.getAttribute('aria-controls');
  await dot.click();
  await page.waitForFunction(id=>{const c=document.getElementById('heroCarr').getBoundingClientRect(),r=document.getElementById(id).getBoundingClientRect();return Math.abs(c.left-r.left)<3;},id);
  ok(await dot.getAttribute('aria-pressed')==='true','indicador selecionado acompanha o card '+(indice+1));
  return page.locator('#'+id);
}
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/opt/pw-browsers/chromium')?'/opt/pw-browsers/chromium':undefined),args:['--no-sandbox']});
  try {
    const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,locale:'pt-BR',timezoneId:'America/Sao_Paulo',serviceWorkers:'block'});
    const errors=[];const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
    await ctx.route('**://*.supabase.co/**',r=>r.abort());
    await ctx.route(BASE+'/inicio-experiencia.html',r=>r.fulfill({contentType:'text/html',body:global.MT_APP_ALUNO.monta(D)}));
    await ctx.addInitScript(()=>{localStorage.setItem('pttour',JSON.stringify({como:'teste'}));localStorage.setItem('ptonb',JSON.stringify({feito:true}));});
    await p.goto(BASE+'/inicio-experiencia.html');await p.waitForFunction(()=>window.__inicioAtualiza);
    ok(await p.locator('#htFoto').evaluate(e=>e.complete&&e.naturalWidth>0),'foto escolhida pelo personal continua carregando');
    const destaque=await p.locator('#heroTreino').evaluate(el=>{const r=el.getBoundingClientRect(),img=el.querySelector('#htFoto'),ri=img.getBoundingClientRect();return {left:r.left,width:r.width,height:r.height,imgWidth:ri.width,imgHeight:ri.height,fit:getComputedStyle(img).objectFit};});
    ok(Math.round(destaque.left)===16&&Math.round(destaque.width)===358&&Math.round(destaque.height)===420&&Math.round(destaque.imgWidth)===358&&Math.round(destaque.imgHeight)===420&&destaque.fit==='cover','foto grande ocupa o destaque superior inteiro em 390px, com as proporções anteriores');
    ok(await p.locator('#habBox').isVisible()&&await p.locator('#habBox [data-hab]').count()===4,'os quatro hábitos estão visíveis no Início sem abrir uma seção');
    ok(await p.evaluate(()=>{const semana=document.getElementById('semBlock'),habitos=document.getElementById('habWrap');return semana.nextElementSibling===habitos&&semana.getBoundingClientRect().bottom<=habitos.getBoundingClientRect().top+1;}),'Minha semana fica acima de Hoje eu já, sem outro card entre datas e hábitos');
    const habito=p.locator('#habBox [data-hab="0"]');
    await habito.click();
    ok(await habito.getAttribute('aria-pressed')==='true'&&await p.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('pthab')||'{}')).some(d=>d[0]===true)),'tocar Água confirma o hábito e grava o registro do dia');
    await p.reload();await p.waitForFunction(()=>window.__inicioAtualiza);
    ok(await habito.isVisible()&&await habito.getAttribute('aria-pressed')==='true','hábito marcado continua visível e confirmado após recarregar');
    await habito.click();
    ok(await habito.getAttribute('aria-pressed')==='false'&&await p.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('pthab')||'{}')).every(d=>!d[0])),'tocar novamente desmarca o hábito persistido');
    await p.click('#semBlock summary');ok(await p.locator('#btnFeito').isVisible(),'registro manual e acompanhamento da semana continuam acessíveis');
    ok(!await p.locator('#htFicha').isVisible(),'hero não exibe a ação secundária Ver ficha');
    await p.click('#navApp [data-msec="treino"]');ok(await p.locator('#trFichasWrap').isVisible(),'Treinos permite consultar a prescrição pela navegação principal');
    ok(!await p.locator('#guiaBox').isVisible(),'consultar ficha não inicia sessão');
    await p.evaluate(()=>window.__trocaSec('inicio'));await p.click('#htVer');
    ok(await p.locator('#guiaBox').isVisible(),'Começar treino abre o player diretamente');
    ok(await p.evaluate(()=>window.__acSessao.ler().f===0),'início direto escolhe a ficha certa e salva checkpoint');
    await p.reload();await p.waitForFunction(()=>window.__inicioAtualiza);
    ok(await p.textContent('#htVer')==='Continuar treino','sessão salva vira a ação principal do Início');
    ok(!await p.locator('#acRetomar').isVisible(),'retomada não duplica a ação no Início');
    await p.click('#htVer');ok(await p.locator('#guiaBox').isVisible(),'retomada funciona pelo destaque com foto');
    await p.reload();await p.waitForFunction(()=>window.__inicioAtualiza);await p.evaluate(()=>window.__trocaSec('treino'));
    ok(await p.locator('#acRetomar').isVisible(),'atalho de retomada continua disponível também em Treinos');
    await p.evaluate(()=>window.__trocaSec('inicio'));
    for(const width of [360,390,430,1280]){await p.setViewportSize({width,height:844});ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Início sem rolagem horizontal em '+width+'px');}
    assert.deepEqual(errors,[]);await ctx.close();
    const segundaFicha={titulo:'B — Costas',itens:[{nome:'Remada teste',series:3,reps:'10',descanso:60}]};
    const basePlano={...D,fichasApp:[...D.fichasApp,segundaFicha],guiaFichasP:[...D.guiaFichasP,{n:'B — Costas',it:[{e:'Remada teste',s:3,r:'10',d:60}]}],
      wodsApp:[{id:'wod-teste',nome:'Circuito teste',tipo:'amrap',min:10,movs:[{q:'10',n:'Agachamento'}]}],
      cardiosApp:[{id:'cardio-teste',nome:'Corrida teste',mod:'corrida',tipo:'continuo',dist:5,tempo:30}]};
    async function variante(dados,verifica){
      const c=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,locale:'pt-BR',timezoneId:'America/Sao_Paulo',serviceWorkers:'block'});
      try {
        const page=await c.newPage();const errs=[];page.on('pageerror',e=>errs.push(e.message));
        await c.addInitScript(()=>{localStorage.setItem('pttour',JSON.stringify({como:'teste'}));localStorage.setItem('ptonb',JSON.stringify({feito:true}));});
        await c.route('**://*.supabase.co/**',r=>r.abort());
        await c.route(BASE+'/inicio-variante.html',r=>r.fulfill({contentType:'text/html',body:global.MT_APP_ALUNO.monta(dados)}));
        await page.goto(BASE+'/inicio-variante.html');await page.waitForFunction(()=>window.__inicioAtualiza);await verifica(page);assert.deepEqual(errs,[]);
      }finally{await c.close();}
    }
    const semana=itens=>Object.fromEntries([0,1,2,3,4,5,6].map(d=>[d,itens]));
    await variante({...basePlano,planoApp:semana([{tp:'cardio',i:0,n:'Corrida teste'},{tp:'ficha',i:1,n:'B — Costas'}])},async page=>{
      const cards=await cardsVisiveis(page);
      ok(!await page.locator('#htFicha').isVisible(),'hero de corrida não reexibe a ação secundária Ver programação');
      ok(cards.length===2&&cards[1].titulo.includes('Costas'),'carrossel mostra a ficha B do plano e não inclui circuito fora do dia: '+JSON.stringify(cards.map(c=>[c.id,c.titulo])));
      const card=await escolheIndicador(page,1);await card.locator('button.btnx').first().click();
      ok(await page.evaluate(()=>window.__acSessao.ler().f===1),'botão da ficha extra abre exatamente o treino anunciado');
    });
    await variante({...basePlano,planoApp:semana([{tp:'ficha',i:0,n:'A — Peito',h:'07:00'},{tp:'ficha',i:1,n:'B — Costas',h:'18:00'}])},async page=>{
      const antes=await registros(page),cards=await cardsVisiveis(page);
      ok(cards.length===2&&cards[0].titulo.includes('Peito')&&cards[1].titulo.includes('Costas'),'duas fichas no mesmo dia aparecem em cards separados, na ordem prescrita');
      ok(await page.locator('#inicioModalidades').count()===0,'o Início não repete as abas textuais de modalidade');
      const dots=page.locator('#inicioIndicadores button');
      ok(await dots.count()===2&&await dots.evaluateAll(es=>es.every(e=>(e.getAttribute('aria-label')||'').trim()&&e.getAttribute('aria-controls')&&e.textContent.trim()==='')),'indicadores sem texto visual têm nome acessível e apontam para cada treino');
      await arrastaProximo(page);
      await page.waitForFunction(()=>document.querySelectorAll('#inicioIndicadores button')[1].getAttribute('aria-pressed')==='true');
      ok(await dots.nth(1).getAttribute('aria-pressed')==='true','arrastar com toque revela a segunda ficha e atualiza o indicador');
      await dots.nth(1).focus();await page.keyboard.press('Home');
      await page.waitForFunction(()=>document.querySelector('#inicioIndicadores button').getAttribute('aria-pressed')==='true');
      ok(await dots.nth(0).evaluate(e=>e===document.activeElement),'teclado retorna ao primeiro treino e mantém foco no indicador');
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction(()=>document.querySelectorAll('#inicioIndicadores button')[1].getAttribute('aria-pressed')==='true');
      ok(await dots.nth(1).evaluate(e=>e===document.activeElement),'seta do teclado escolhe o próximo treino com foco correspondente');
      assert.deepEqual(await registros(page),antes);ok(true,'arrastar e escolher treinos não registra execução nem cria sessão');
      const card=await escolheIndicador(page,1);await card.locator('button.btnx').first().click();
      ok(await page.evaluate(()=>window.__acSessao.ler().f===1),'iniciar a segunda ficha usa seu índice e não troca pela primeira da mesma modalidade');
      await page.reload();await page.waitForFunction(()=>window.__inicioAtualiza);
      ok(await page.textContent('#htVer')==='Continuar treino'&&await page.evaluate(()=>window.__acSessao.ler().f===1),'retomada da segunda ficha permanece prioritária após recarregar');
      await page.click('#htVer');ok(await page.locator('#guiaBox').isVisible()&&await page.evaluate(()=>window.__acSessao.ler().f===1),'ação principal retoma a segunda ficha preservada');
    });
    const tresTipos={...basePlano,
      wodsApp:[...basePlano.wodsApp,{id:'wod-do-dia',nome:'Circuito do plano',tipo:'amrap',min:12,capa:capaCircuito,movs:[{q:'8',n:'Avanço do plano'}]}],
      cardiosApp:[...basePlano.cardiosApp,{id:'bike-do-dia',nome:'Bike do plano',mod:'bike',tipo:'continuo',dist:12,tempo:40,capa:capaCorrida}],
      planoApp:semana([{tp:'ficha',i:1,n:'B — Costas',h:'07:00'},{tp:'wod',i:1,n:'Circuito do plano',h:'12:00'},{tp:'cardio',i:1,n:'Bike do plano',h:'18:00'}])};
    for(const tipo of ['wod','cardio'])await variante(tresTipos,async page=>{
      const cards=await cardsVisiveis(page),antes=await registros(page);
      ok(cards.length===3&&cards[0].titulo.includes('Costas')&&cards[1].titulo.includes('Circuito do plano')&&cards[2].titulo.includes('Bike do plano'),'carrossel mostra os três treinos do plano com seus nomes corretos ('+tipo+')');
      const card=await escolheIndicador(page,tipo==='wod'?1:2);
      ok(await card.locator('img').first().getAttribute('src')===(tipo==='wod'?capaCircuito:capaCorrida),'foto de '+tipo+' pertence ao item de índice 1 anunciado');
      await card.locator('button.btnx').first().click();
      const destino=page.locator(tipo==='wod'?'#cardWod [data-wi="1"]':'#cardCardio [data-cri="1"]');
      ok(await destino.isVisible()&&await destino.evaluate(e=>e.open),'atalho '+tipo+' consulta o item anunciado de índice 1');
      assert.deepEqual(await registros(page),antes);ok(true,'consultar '+tipo+' não marca treino nem grava execução');
    });
    await variante({...basePlano,planoApp:semana([])},async page=>{
      const cards=await cardsVisiveis(page);
      ok(cards.length===1&&/recuperar|descanso/i.test(cards[0].texto),'dia de descanso mantém a orientação e não oferece os treinos de outros dias');
      ok(await page.locator('#inicioIndicadores button:visible').count()===0,'dia com um único card não mostra indicadores sem destino');
      ok(await page.evaluate(()=>window.__acSessao.ler()===null),'abrir dia de descanso não cria sessão');
    });
    await variante(basePlano,async page=>{
      const cards=await cardsVisiveis(page);
      ok(cards.length===3&&cards.some(c=>/Peito/.test(c.titulo))&&cards.some(c=>/Circuito teste/.test(c.titulo))&&cards.some(c=>/Corrida teste/.test(c.titulo)),'sem plano semanal, rodízio e modalidades disponíveis permanecem acessíveis');
    });
    for(const tipo of ['wod','cardio'])await variante({...basePlano,ve:{[tipo]:false},planoApp:semana([{tp:tipo,i:0,n:'Treino oculto'},{tp:'ficha',i:1,n:'B — Costas'}])},async page=>{
      ok(await page.locator('#heroTreino').getAttribute('data-tipo')==='ficha','modalidade '+tipo+' desativada não é oferecida como ação principal');
      await page.click('#htVer');ok(await page.evaluate(()=>window.__acSessao.ler().f===1),'plano com '+tipo+' oculto abre a ficha disponível e não uma tela vazia');
    });
    console.log(count+' verificações do Início aprovadas.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
