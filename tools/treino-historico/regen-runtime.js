/* Mantém o HTML gerado offline e sem dependências de carregamento adicionais. */
'use strict';
const fs=require('node:fs'),path=require('node:path');
const start='  // BEGIN GENERATED WORKOUT HISTORY\n',end='  // END GENERATED WORKOUT HISTORY\n';
const lf=s=>s.replace(/\r\n/g,'\n');
function regenerate(builder,sources) {
  const newline=builder.includes('\r\n')?'\r\n':'\n';
  let s=lf(builder);
  const code=sources.map(lf).join('\n');
  const bundle=start+'  function runtimeHistorico() {\n'+code+'\n  }\n'+end;
  const starts=s.split(start).length-1,ends=s.split(end).length-1;
  if(starts===1&&ends===1&&s.indexOf(start)<s.indexOf(end)) {
    s=s.slice(0,s.indexOf(start))+bundle+s.slice(s.indexOf(end)+end.length);
  } else if(starts===0&&ends===0&&!s.includes('function runtimeHistorico(')) {
    const target='  function monta(D) {';
    if(s.split(target).length!==2)throw Error('Não foi encontrada uma única função monta para incorporar o histórico.');
    s=s.replace(target,bundle+'\n'+target);
  } else throw Error('Marcadores do histórico ausentes, duplicados ou fora de ordem; builder preservado.');
  return newline==='\n'?s:s.replace(/\n/g,newline);
}
if(require.main===module) {
  const root=path.resolve(__dirname,'../..'),file=path.join(root,'app/aluno-builder.js');
  const sources=['core','sync','player'].map(n=>fs.readFileSync(path.join(root,'app/treino-historico-'+n+'.js'),'utf8'));
  fs.writeFileSync(file,regenerate(fs.readFileSync(file,'utf8'),sources));
}
module.exports={regenerate};
