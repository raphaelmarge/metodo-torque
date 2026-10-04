/* Mantém o HTML gerado offline e sem dependências de carregamento adicionais. */
'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),file=path.join(root,'app/aluno-builder.js');
const start='  // BEGIN GENERATED WORKOUT HISTORY\n',end='  // END GENERATED WORKOUT HISTORY\n';
const code=['core','sync','player'].map(n=>fs.readFileSync(path.join(root,'app/treino-historico-'+n+'.js'),'utf8')).join('\n');
const bundle=start+'  function runtimeHistorico() {\n'+code+'\n  }\n'+end;
let s=fs.readFileSync(file,'utf8');
if(s.includes(start))s=s.slice(0,s.indexOf(start))+bundle+s.slice(s.indexOf(end)+end.length);
else s=s.replace('  function monta(D) {',bundle+'\n  function monta(D) {');
fs.writeFileSync(file,s);
