/* Início v793: atalhos reais, retomada e recursos recolhidos, com dados sintéticos. */
const assert = require('assert/strict');
const fs = require('fs');
let chromium;
try { chromium = require('playwright').chromium; } catch (_) { chromium = require('/opt/node22/lib/node_modules/playwright').chromium; }
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765';
global.self = global;
require('../app/aluno-skin.js'); require('../app/aluno-builder.js');
const capa = 'data:image/jpeg;base64,' + fs.readFileSync(require('path').join(__dirname, '../tools/demo-aluno/capa-treino.jpg')).toString('base64');
const linhas = [{reps:'5',carga:null,descanso:90},{reps:'8',carga:null,descanso:75},{reps:'10',carga:null,descanso:0}];
const D = {a:{nome:'Aluno de teste',id:'inicio-test'},studio:'Studio teste',COR:'#7c3aed',COR2:'#5925ba',CORC:'#b395ff',CORE:'#33155c',CORCL1:'#d6c4ff',CORCL2:'#e8ddff',PAL:['#0d0c10','#111015','#15131b','#191621','#211d2a','#272231','#2c2639','#342d42','#3b334b','#443a54','#4d425f','#574b6c','#62557a'],cfg:{capaTreino:capa},metaSemana:3,
  fichasApp:[{titulo:'A — Peito',itens:[{nome:'Supino teste',series:3,reps:'5',descanso:90,seriesDetalhadas:linhas}]}],
  guiaFichasP:[{n:'A — Peito',it:[{e:'Supino teste',s:3,r:'5',d:90,seriesDetalhadas:linhas}]}],fexs:[{n:'Supino teste',s:3}],sessApp:[],wodsApp:[],cardiosApp:[]};
let count=0; function ok(value, title){assert.ok(value,title);count++;console.log('  OK '+title);}
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/opt/pw-browsers/chromium')?'/opt/pw-browsers/chromium':undefined),args:['--no-sandbox']});
  try {
    const ctx=await browser.newContext({viewport:{width:390,height:844},locale:'pt-BR',timezoneId:'America/Sao_Paulo',serviceWorkers:'block'});
    const errors=[];const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
    await ctx.route('**://*.supabase.co/**',r=>r.abort());
    await ctx.route(BASE+'/inicio-experiencia.html',r=>r.fulfill({contentType:'text/html',body:global.MT_APP_ALUNO.monta(D)}));
    await ctx.addInitScript(()=>{localStorage.setItem('pttour',JSON.stringify({como:'teste'}));localStorage.setItem('ptonb',JSON.stringify({feito:true}));});
    await p.goto(BASE+'/inicio-experiencia.html');await p.waitForFunction(()=>window.__inicioAtualiza);
    ok(await p.locator('#htFoto').evaluate(e=>e.complete&&e.naturalWidth>0),'foto escolhida pelo personal continua carregando');
    ok(await p.locator('#habWrap details').count()===1&&!await p.locator('#habWrap details').evaluate(e=>e.open),'hábitos ficam recolhidos e conservam os controles');
    await p.click('#habWrap summary');ok(await p.locator('#habBox').isVisible(),'hábitos abrem pela interação nativa');
    await p.click('#semBlock summary');ok(await p.locator('#btnFeito').isVisible(),'registro manual e acompanhamento da semana continuam acessíveis');
    await p.click('#htFicha');ok(await p.locator('#trFichasWrap').isVisible(),'Ver ficha consulta a prescrição');
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
      const c=await browser.newContext({viewport:{width:390,height:844},locale:'pt-BR',timezoneId:'America/Sao_Paulo',serviceWorkers:'block'});
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
      ok((await page.textContent('#hfTit')).includes('Costas'),'card extra mostra a ficha B prescrita no plano do dia');
      await page.locator('#heroFicha [data-carrver="ficha"]').click();
      ok(await page.evaluate(()=>window.__acSessao.ler().f===1),'botão da ficha extra abre exatamente o treino anunciado');
    });
    for(const tipo of ['wod','cardio'])await variante({...basePlano,ve:{[tipo]:false},planoApp:semana([{tp:tipo,i:0,n:'Treino oculto'},{tp:'ficha',i:1,n:'B — Costas'}])},async page=>{
      ok(await page.locator('#heroTreino').getAttribute('data-tipo')==='ficha','modalidade '+tipo+' desativada não é oferecida como ação principal');
      await page.click('#htVer');ok(await page.evaluate(()=>window.__acSessao.ler().f===1),'plano com '+tipo+' oculto abre a ficha disponível e não uma tela vazia');
    });
    console.log(count+' verificações do Início aprovadas.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
