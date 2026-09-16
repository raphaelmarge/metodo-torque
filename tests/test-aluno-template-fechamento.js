/* Regressões do player aprovado: zero descanso e fechamento canônico.
 * Fixture fictícia, rede de produção bloqueada pelo helper. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require(process.env.TORQUE_PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright');
const {open, fixture} = require('./test-aluno-template-player');
let passed = 0;
function ok(value, label) { assert.ok(value, label); passed++; console.log('OK '+label); }
function data(rest) {
  const d = fixture();
  for (const it of [...d.fichasApp[0].itens, ...d.guiaFichasP[0].it]) {
    it.descanso = rest; it.d = rest;
    if (it.seriesDetalhadas) for (const s of it.seriesDetalhadas) s.descanso = rest;
  }
  return d;
}
async function main() {
 const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 try {
  for (const rest of [0,90]) {
   const {p,ctx,errors,click} = await open(browser,390,'',data(rest));
   const count = () => p.evaluate(() => GP.conta(GUIA[0].it[0],0));
   ok(await p.isVisible('#gSerie'), rest+' s: registro inicial acessível');
   await click('#gSerie');
   ok(await count()===1,rest+' s: confirmar grava somente uma série');
   if(rest) {
    ok(await p.isVisible('#gTemplateSuccess')&&await p.isVisible('#gResta'), 'descanso positivo mantém feedback e cronômetro');
    await p.evaluate(()=>__zeraDescanso());
   }
   ok(await p.isVisible('#gSerie')&&await p.isVisible('#gKg')&&await p.inputValue('#gKg')==='70',rest+' s: próxima série fica editável sem navegação extra');
   await click('#gSerie'); if(rest)await p.evaluate(()=>__zeraDescanso());
   await click('#gSerie');
   ok(await count()===3,rest+' s: três confirmações, sem duplicação');
   ok(await p.isVisible('#gWRep')&&await p.isVisible('#gWKg')&&await p.isVisible('#gSalvar'),rest+' s: fechamento intermediário mantém réguas e Salvar visíveis');
   await p.fill('#gKg','0');await p.fill('#gReps','9');await click('#gSalvar');await click('#gSalvar');
   ok(await p.evaluate(()=>{const r=L('ptdc',{})['Supino teste'];return r.length===3&&r[2].kg===0&&r[2].r===9;}),rest+' s: salvar fechamento duas vezes preserva zero e não duplica');
   await click('#gPularEx');
   ok(await p.evaluate(()=>__gvDe().e===1),rest+' s: avança para o próximo exercício');
   await click('#gSemRegistro');
   ok(await p.isVisible('#gFecharTreino')&&await p.isVisible('#gSalvar'),rest+' s: último exercício expõe Terminar treino e revisão');
   ok(await p.evaluate(()=>{const r=L('ptdc',{})['Remada teste'];return r.length===1&&r[0].feito&&r[0].kg===null&&!r[0].r;}),rest+' s: sem anotar não inventa carga nem repetições');
   await click('#gFecharTreino');
   ok(await p.isVisible('#gFim')&&await p.isVisible('#gRevisaoSeries'),rest+' s: conclusão explícita abre recibo completo');
   ok(await p.evaluate(()=>!__acSessao.ler()),rest+' s: conclusão limpa checkpoint');
   for(const height of [844,667]) {
    await p.setViewportSize({width:height===667?375:390,height});
    ok(await p.evaluate(()=>{const b=document.getElementById('gFim'),r=b.getBoundingClientRect(),s=getComputedStyle(b),box=document.getElementById('guiaBox'),card=document.getElementById('gCard');return r.height>=58&&r.top>=0&&r.bottom<=innerHeight+1&&s.backgroundColor==='rgb(255, 255, 255)'&&getComputedStyle(box).backgroundImage.includes('radial-gradient')&&box.scrollWidth<=box.clientWidth+1&&card.scrollWidth<=card.clientWidth+1;}),rest+' s / '+height+' px: fechar destacado, alcançável e sem corte');
   }
   if(process.env.TORQUE_SCREENSHOTS){fs.mkdirSync(process.env.TORQUE_SCREENSHOTS,{recursive:true});await p.screenshot({path:path.join(process.env.TORQUE_SCREENSHOTS,'template-fechamento-'+rest+'.png')});}
   ok(errors.length===0,rest+' s: nenhuma exceção JavaScript: '+errors.join('; '));
   await ctx.close();
  }
  console.log(passed+' verificações de fechamento passaram'+(process.env.TORQUE_PREVIEW_MEMORY==='1'?' (prévia em memória; não substitui CI real).':'.'));
 } finally {await browser.close();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
