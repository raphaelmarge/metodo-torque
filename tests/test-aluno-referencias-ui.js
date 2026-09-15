/* Contexto compacto do player real: dados fictícios, nenhuma gravação remota. */
process.env.TZ='America/Sao_Paulo';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const {dados,abrir}=require('./test-aluno-player-experiencia.js');
let browser,n=0;
const ok=(v,m)=>{assert.ok(v,m);n++;console.log('OK '+m);};
(async()=>{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/opt/pw-browsers/chromium',args:['--no-sandbox']});
 for(const tema of ['','claro'])for(const width of [320,390,1280]){
  const D=dados(),it=D.fichasApp[0].itens[0];
  it.seriesDetalhadas.forEach(s=>s.descanso=0);it.seriesDetalhadas[2].carga=0;
  D.guiaFichasP[0].it[0].seriesDetalhadas=it.seriesDetalhadas;
  const {p,ctx,errors}=await abrir(browser,{D,width,tema,init:()=>{
   const dia=n=>{const d=new Date();d.setDate(d.getDate()-n);return d.toLocaleDateString('en-CA');};
   localStorage.setItem('ptdc',JSON.stringify({'Supino teste':[
    {d:dia(1),kg:50,r:6,g:2,i:'0:0:0',serie:1,feito:true},
    {d:dia(5),kg:90,r:10,g:2,i:'0:0:0',serie:1,feito:true}
   ]}));
  }});
  const tag=width+' '+(tema||'escuro'),hist=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('ptdc'))['Supino teste']);
  ok((await p.textContent('[data-gref="prescrito"]'))==='5 reps · 60 kg',tag+': referência prescrita visível');
  ok((await p.textContent('[data-gref="anterior"]'))==='6 reps · 50 kg',tag+': registro anterior por data, não por chegada');
  ok((await p.textContent('#gOrigemSerie')).includes('ainda não confirmados'),tag+': sugestão não é resultado');
  const before=JSON.stringify(await hist());
  await p.fill('#gKg','55');await p.fill('#gReps','4');
  ok((await p.textContent('[data-gref="prescrito"]'))==='5 reps · 60 kg'&&(await p.textContent('[data-gref="anterior"]'))==='6 reps · 50 kg',tag+': digitação não reescreve prescrição ou histórico');
  ok((await p.textContent('#gOrigemSerie')).includes('rascunho')&&JSON.stringify(await hist())===before,tag+': rascunho distinto e sem confirmação automática');
  await p.locator('.gserie-ajustes summary').click();await p.click('#gSalvar');
  ok((await p.textContent('#gOrigemSerie')).includes('série ainda pendente'),tag+': salvar anotação não conclui');
  await p.click('#gSerie');await p.click('[data-gserie="0"]');
  ok((await p.textContent('#gOrigemSerie')).includes('Série concluída.')&&await p.inputValue('#gKg')==='55',tag+': realização confirmada mantém valor próprio');
  ok((await p.textContent('[data-gref="anterior"]'))==='6 reps · 50 kg',tag+': execução de hoje não substitui referência anterior');
  await p.fill('#gKg','54');ok((await p.textContent('#gOrigemSerie')).includes('Alteração em rascunho'),tag+': alteração da série concluída não anuncia salvamento');
  await p.click('#gSerie');await p.click('[data-gserie="2"]');
  ok((await p.textContent('[data-gref="prescrito"]'))==='10 reps · 0 kg'&&(await p.textContent('[data-gref="anterior"]')).includes('Sem carga anterior anotada'),tag+': zero explícito distinto de ausência');
  await p.fill('#gReps','9');await p.click('#gFechar');await p.reload();await p.waitForFunction(()=>window.__acSessao);
  await p.evaluate(()=>document.querySelector('#acRetomar button').click());
  ok(await p.inputValue('#gReps')==='9'&&(await p.textContent('#gOrigemSerie')).includes('rascunho'),tag+': retomada mantém preenchimento e origem');
  ok(await p.locator('#gKg').getAttribute('aria-describedby')==='gOrigemSerie'&&await p.locator('#gReps').getAttribute('aria-describedby')==='gOrigemSerie',tag+': origem acessível nos dois campos');
  ok(await p.locator('#gMiolo2').evaluate(el=>el.scrollWidth<=el.clientWidth+1),tag+': referências não causam rolagem horizontal');
  if(width===390&&process.env.ART_DIR){fs.mkdirSync(process.env.ART_DIR,{recursive:true});await p.screenshot({path:path.join(process.env.ART_DIR,'player-referencias-'+(tema||'escuro')+'.png')});}
  ok(errors.length===0,tag+': sem erro JavaScript: '+errors.join(';'));
  await ctx.close();
 }
 console.log(n+' verificações da interface de referências passaram.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
