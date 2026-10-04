/* Os testes do núcleo precisam corresponder ao código embarcado no HTML offline. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const builder=fs.readFileSync(path.join(root,'app/aluno-builder.js'),'utf8');
const source=['core','sync','player'].map(n=>fs.readFileSync(path.join(root,'app/treino-historico-'+n+'.js'),'utf8')).join('\n');
assert.ok(builder.includes('  function runtimeHistorico() {\n'+source+'\n  }'), 'regen-runtime deve incorporar exatamente as fontes testadas');
new Function(source);
console.log('OK bundle offline incorpora exatamente núcleo, transporte e interface testados');
