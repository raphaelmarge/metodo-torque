/* Os testes do núcleo precisam corresponder ao código embarcado no HTML offline. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const lf=s=>s.replace(/\r\n/g,'\n');
const builder=lf(fs.readFileSync(path.join(root,'app/aluno-builder.js'),'utf8'));
const sources=['core','sync','player'].map(n=>lf(fs.readFileSync(path.join(root,'app/treino-historico-'+n+'.js'),'utf8')));
const source=sources.join('\n');
assert.ok(builder.includes('  function runtimeHistorico() {\n'+source+'\n  }'), 'regen-runtime deve incorporar exatamente as fontes testadas');
new Function(source);
console.log('OK bundle offline incorpora exatamente núcleo, transporte e interface testados');
const {regenerate}=require('../tools/treino-historico/regen-runtime');
for(const newline of ['\n','\r\n']) {
  const input=builder.replace(/\n/g,newline),mixedSources=sources.map((s,i)=>i%2?s.replace(/\n/g,'\r\n'):s);
  const once=regenerate(input,mixedSources),twice=regenerate(once,mixedSources);
  assert.equal(once,input,'fontes idênticas preservam o builder inteiro e seu estilo de quebra');
  assert.equal(twice,once,'regeneração repetida não acumula outro runtime');
  assert.equal((once.match(/function runtimeHistorico\(/g)||[]).length,1);
  const updated=regenerate(input,[...mixedSources.slice(0,2),mixedSources[2]+'\n// alteração sintética']);
  assert.equal(lf(updated).split('  // BEGIN GENERATED WORKOUT HISTORY\n')[0],builder.split('  // BEGIN GENERATED WORKOUT HISTORY\n')[0]);
  assert.equal(lf(updated).split('  // END GENERATED WORKOUT HISTORY\n')[1],builder.split('  // END GENERATED WORKOUT HISTORY\n')[1]);
  assert.equal(regenerate(updated,[...mixedSources.slice(0,2),mixedSources[2]+'\n// alteração sintética']),updated);
}
for(const malformed of [builder.replace('  // END GENERATED WORKOUT HISTORY\n',''),builder+'  // BEGIN GENERATED WORKOUT HISTORY\n']) {
  assert.throws(()=>regenerate(malformed,sources),/Marcadores/);
}
console.log('OK regeneração LF/CRLF idempotente, trecho externo preservado e marcadores inválidos recusados');
