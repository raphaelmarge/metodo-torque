const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const files = ['demo-aluno.html', 'demo-aluno-cadastro.html', 'demo-aluno-sem-cadastro.html'];
const originals = files.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8'));
const times = files.map(f => fs.statSync(path.join(ROOT, f), {bigint:true}).mtimeNs);
const [principal, comCadastro, semCadastro] = originals;
const { gerarVariantes } = require('../tools/demo-aluno/regen-demos.js');
const marker = 'var __demoOnboardingAceite=null;';
let n=0;
function ok(value, label) { assert.ok(value, label); n++; console.log('OK '+label); }
const demos=gerarVariantes({comCadastro,semCadastro});
ok(principal===semCadastro, 'Link principal abre a mesma demo de acesso direto');
ok(demos.comCadastro===comCadastro&&demos.semCadastro===semCadastro,'Derivação reproduz as duas saídas canônicas');
for(const [label,html,gate] of [['com cadastro',comCadastro,true],['direta',semCadastro,false]]){
 ok(html.includes(gate?'com cadastro inicial</title>':'acesso direto</title>'),label+': título identifica a entrada');
 ok(html.split(marker).length===2&&!html.includes('demo-aceite-concluido'),label+': não fabrica uma assinatura nem pagamento');
 ok(html.includes('function runtime(cfg, api)')===gate,label+': bloqueio inicial presente somente quando solicitado');
 ok(html.includes('var QUESTAPP=')&&html.includes('Como você está?'),label+': questionário normal de acompanhamento permanece');
 ok(html.includes('id=\'heroTopo\'')||html.includes('id="heroTopo"'),label+': mantém o início do app');
 ok(html.includes('var __demoLS=')||html.includes('var __demoLS ='),label+': usa armazenamento simulado');
}
const minimal=(gate)=>'<title>Demo</title><script>'+marker+(gate?'function runtime(cfg, api) {}':'')+'</script><main>Fixture</main>';
const input={comCadastro:minimal(true),semCadastro:minimal(false)},before=JSON.stringify(input);
const a=gerarVariantes(input),b=gerarVariantes(input);
ok(JSON.stringify(a)===JSON.stringify(b)&&JSON.stringify(input)===before,'Derivação determinística sem alterar as entradas');
for(const bad of [null,{}, {comCadastro:minimal(true),semCadastro:minimal(true)}, {comCadastro:minimal(false),semCadastro:minimal(false)}, {comCadastro:minimal(true)+marker,semCadastro:minimal(false)}, {comCadastro:minimal(true),semCadastro:minimal(false)+'<title>Duplicado</title>'}]){
 assert.throws(()=>gerarVariantes(bad));n++;console.log('OK Recusa fonte ausente, ambígua ou com bloqueio no modo errado');
}
ok(files.every((f,i)=>fs.readFileSync(path.join(ROOT,f),'utf8')===originals[i]&&fs.statSync(path.join(ROOT,f),{bigint:true}).mtimeNs===times[i]),'Conferir não regrava demos nem fonte');
const regen=fs.readFileSync(path.join(ROOT,'tools/demo-aluno/regen-demo.js'),'utf8');
ok(regen.includes('window.__montaAppAluno(alex, stamp)')&&regen.includes('window.__montaAppAluno(direto, stamp)'),'Duas entradas geradas pelo builder canônico, sem fork manual');
console.log(n+' verificações das demos passaram.');
