// WebKit é gate obrigatório. Rede externa bloqueada pelas duas suítes.
const {execFileSync}=require('node:child_process'),path=require('node:path');
try{
 for(const file of ['test-confiabilidade-browser.js','test-aluno-recuperacao-browser.js'])
  execFileSync(process.execPath,[path.join(__dirname,file)],{env:{...process.env,TORQUE_BROWSER:'webkit'},stdio:'inherit',timeout:240000});
}catch(e){console.error('A verificação WebKit falhou.');process.exitCode=1;}
