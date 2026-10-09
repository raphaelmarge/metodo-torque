/* Observabilidade da suíte existente: preserva literalmente as asserções.
 * Setas mantêm44px; dias são medidos à parte na grade de sete colunas.
 * A execução não muda arquivos versionados nem acessa dados reais. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const target = path.resolve(__dirname, '../../tests/test-aluno-evolucao-experiencia.js');
const original = fs.readFileSync(target, 'utf8');
const needle = "  await checkCalendarTargets(page,width+'px '+(claro?'claro':'escuro'));";
if (original.split(needle).length !== 2) {
  throw new Error('O teste canônico mudou; revisar o observador sem enfraquecer as verificações.');
}
const observed = original.replace(needle, needle + `
  const geometry = await page.locator('#mapaAno .ev800-map-nav button,#mapaAno [data-cal-dia]').evaluateAll(bs=>bs.map(b=>{
    const r=b.getBoundingClientRect(),s=getComputedStyle(b),grid=b.parentElement.getBoundingClientRect(),ancestors=[];
    for(let p=b.parentElement;p;p=p.parentElement){const c=getComputedStyle(p);if(c.transform!=='none'||c.animationName!=='none')ancestors.push({id:p.id,transform:c.transform,animation:c.animationName,delay:c.animationDelay});}
    return {id:b.id,date:b.dataset.calDia||null,kind:b.hasAttribute('data-cal-dia')?'day':'navigation',width:r.width,height:r.height,top:r.top,bottom:r.bottom,left:r.left,right:r.right,containerLeft:grid.left,containerRight:grid.right,containerOverflow:Math.max(0,grid.left-r.left,r.right-grid.right),offsetWidth:b.offsetWidth,offsetHeight:b.offsetHeight,minWidth:s.minWidth,minHeight:s.minHeight,transform:s.transform,active:b.matches(':active'),ancestors};
  }));
  console.log('CALENDAR_GEOMETRY '+JSON.stringify({viewport:width,theme:claro?'claro':'escuro',navigation:geometry.filter(r=>r.kind==='navigation'),days:geometry.filter(r=>r.kind==='day')}));
`);
if (process.argv.includes('--check')) {
  new Function('require', 'module', 'exports', '__filename', '__dirname', observed);
  console.log('Instrumentação compilada; todas as expectativas originais foram preservadas.');
} else {
  const fixture = new Module(target, module);
  fixture.filename = target;
  fixture.paths = Module._nodeModulePaths(path.dirname(target));
  fixture._compile(observed, target);
}
