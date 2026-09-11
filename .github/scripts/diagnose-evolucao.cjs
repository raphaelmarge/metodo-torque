/* Observabilidade temporária da suíte existente: mesma fixture, sequência e
 * limite de 44 px. Não muda os arquivos versionados nem acessa dados reais. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const target = path.resolve(__dirname, '../../tests/test-aluno-evolucao-experiencia.js');
const original = fs.readFileSync(target, 'utf8');
const needle = "  ok(await page.locator('#mapaAno button').evaluateAll(bs=>bs.every(b=>{const r=b.getBoundingClientRect();return r.width>=44&&r.height>=44;})),'Calendário tem alvos de toque de44px em '+width+'px');";
if (original.split(needle).length !== 2) {
  throw new Error('O teste canônico mudou; revisar o observador sem enfraquecer as verificações.');
}
const observed = original.replace(needle, `
  const geometry = await page.locator('#mapaAno button').evaluateAll(bs=>bs.map(b=>{
    const r=b.getBoundingClientRect(),s=getComputedStyle(b),ancestors=[];
    for(let p=b.parentElement;p;p=p.parentElement){const c=getComputedStyle(p);if(c.transform!=='none'||c.animationName!=='none')ancestors.push({id:p.id,transform:c.transform,animation:c.animationName,delay:c.animationDelay});}
    return {id:b.id,width:r.width,height:r.height,top:r.top,bottom:r.bottom,left:r.left,right:r.right,offsetWidth:b.offsetWidth,offsetHeight:b.offsetHeight,minWidth:s.minWidth,minHeight:s.minHeight,transform:s.transform,active:b.matches(':active'),ancestors};
  }));
  console.log('CALENDAR_GEOMETRY '+JSON.stringify({viewport:width,theme:claro?'claro':'escuro',buttons:geometry}));
  ok(geometry.every(r=>r.width>=44&&r.height>=44),'Calendário tem alvos de toque de44px em '+width+'px: '+JSON.stringify(geometry));
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
