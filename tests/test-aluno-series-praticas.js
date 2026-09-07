/* v794: sugestões por campo nunca são execução sem confirmação explícita. */
process.env.TZ = 'America/Sao_Paulo';
const assert = require('assert/strict');
const { chromium } = require(process.env.TORQUE_PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright');
const { dados, abrir } = require('./test-aluno-player-experiencia.js');
let total = 0;
const ok = (cond, nome) => { assert.ok(cond, nome); total++; console.log('  ✅ ' + nome); };
function ficha(cargas = [60,70,80], reps = ['5','8','10']) {
  const D = dados(), linhas = reps.map((r,i) => ({reps:r,carga:cargas[i],descanso:0}));
  const it = D.fichasApp[0].itens[0]; it.seriesDetalhadas = linhas; it.series = linhas.length;
  D.fichasApp[0].itens = [it]; D.fexs = [{n:it.nome,s:linhas.length}];
  D.guiaFichasP[0].it = [{e:it.nome,s:linhas.length,r:reps[0],d:0,seriesDetalhadas:linhas}];
  return D;
}
const registro = p => p.evaluate(() => JSON.parse(localStorage.getItem('ptdc') || '{}')['Supino teste'] || []);
const volume = p => p.evaluate(() => window.__seriesAluno.volume(0,new Date().toLocaleDateString('en-CA')));
async function voltar(p) { await p.evaluate(() => document.querySelector('#acRetomar button').click()); }
async function main() {
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || undefined,args:['--no-sandbox']});
  const casos=[];
  async function caso(D,init) {const x=await abrir(browser,{D,init});casos.push(x);return x.p;}
  try {
    const p=await caso(ficha());
    ok(await p.evaluate(() => {const a=document.getElementById('gReps'),b=document.getElementById('gKg');return !!(a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING)&&a.getBoundingClientRect().x<b.getBoundingClientRect().x;}),'repetições vêm primeiro no DOM e à esquerda no celular');
    ok(await p.inputValue('#gReps')==='5'&&await p.inputValue('#gKg')==='60','primeira série traz reps e carga prescritas');
    ok((await p.textContent('#gSerie')).includes('Série feita')&&(await p.textContent('#gCgLab'))==='Ajuste se precisar','ação principal confirma a série em um toque');
    await p.click('[data-gserie="1"]');await p.click('[data-gserie="2"]');await p.click('[data-gserie="0"]');
    await p.click('.gserie-ajustes summary');await p.waitForTimeout(150);
    ok(await p.evaluate(() => !window.__gvDe().sujo&&document.getElementById('gWRep').compareDocumentPosition(document.getElementById('gWKg'))&Node.DOCUMENT_POSITION_FOLLOWING),'réguas seguem reps/carga; abrir opções não altera sugestão');
    await p.click('#gFechar');
    ok((await registro(p)).length===0&&await volume(p)===0,'abrir, trocar séries, abrir opções e sair não cria anotação nem volume');
    await voltar(p);
    ok(await p.inputValue('#gReps')==='5'&&await p.inputValue('#gKg')==='60','retomar sugestões intocadas mantém os valores visíveis');
    for(let i=0;i<3;i++){
      ok(await p.inputValue('#gReps')===String([5,8,10][i])&&await p.inputValue('#gKg')===String([60,70,80][i]),'cada série preserva a própria prescrição antes de confirmar '+(i+1));
      await p.click('#gSerie');
    }
    ok(JSON.stringify((await registro(p)).map(r=>[r.serie,r.r,r.kg,r.feito]))===JSON.stringify([[1,5,60,true],[2,8,70,true],[3,10,80,true]]),'três toques registram três séries distintas, sem digitação');
    ok(await volume(p)===1660,'volume usa apenas os três registros confirmados');

    const igual=await caso(ficha([60,60,60]));
    await igual.fill('#gKg','42');await igual.click('#gSerie');
    ok(await igual.inputValue('#gKg')==='42'&&await igual.inputValue('#gReps')==='8','carga ajustada uma vez é reutilizada se a próxima prescrição é igual');
    await igual.click('#gSerie');
    ok(await igual.inputValue('#gKg')==='42'&&await igual.inputValue('#gReps')==='10','reutilizar carga não copia as repetições da série anterior');
    await igual.click('#gSerie');
    ok((await registro(igual)).every(r=>r.kg===42),'as três séries confirmadas mantêm o ajuste de carga');

    const diversa=await caso(ficha([60,70,0]));
    await diversa.fill('#gKg','42');await diversa.click('#gSerie');
    ok(await diversa.inputValue('#gKg')==='70','prescrição de carga diferente vence o ajuste da série anterior');
    await diversa.click('#gSerie');
    ok(await diversa.inputValue('#gKg')==='0'&&await diversa.inputValue('#gReps')==='10','carga prescrita zero é preservada e não cai no histórico');
    await diversa.click('#gSerie');
    ok((await registro(diversa)).find(r=>r.serie===3).kg===0,'confirmar peso do corpo grava zero explícito');
    const zeroManual=await caso(ficha([60,60,60]));await zeroManual.fill('#gKg','0');await zeroManual.locator('#gKg').blur();
    ok(await zeroManual.inputValue('#gKg')==='0','zero digitado permanece zero após sair do campo');
    await zeroManual.click('#gSerie');
    ok((await registro(zeroManual))[0].kg===0&&await zeroManual.inputValue('#gKg')==='0','zero manual confirmado é reutilizado em prescrição igual');

    const fora=await caso(ficha([60,60,60]));
    await fora.click('[data-gserie="0"]');await fora.fill('#gKg','42');await fora.click('.gserie-ajustes summary');await fora.click('#gSalvar');
    await fora.click('[data-gserie="2"]');await fora.fill('#gKg','90');await fora.click('#gSerie');
    await fora.click('[data-gserie="0"]');await fora.click('#gSerie');
    ok(await fora.inputValue('#gKg')==='42'&&await fora.inputValue('#gReps')==='8','série anterior concluída vence ordem de inserção após conclusão fora de ordem');

    const hist=await caso(ficha([null,null,null]),()=>{
      const dia=n=>{const d=new Date();d.setDate(d.getDate()-n);return d.toLocaleDateString('en-CA');};
      localStorage.setItem('ptdc',JSON.stringify({'Supino teste':[
        {d:dia(8),kg:200,r:10},{d:dia(2),kg:35,r:4,g:2,i:'0:0:0',serie:1,feito:true},
        {d:dia(1),kg:80,r:7,g:2,i:'0:0:1',serie:2,feito:true},
        {d:dia(0),kg:99,r:5,g:2,i:'0:0:2',serie:3,feito:false},
        {d:dia(0),kg:150,r:5,g:2,i:'1:0:0',serie:1,feito:true}
      ]}));
    });
    ok(await hist.inputValue('#gKg')==='35'&&await hist.inputValue('#gReps')==='5','sem prescrição usa última carga pertinente, sem copiar recorde, outra ficha ou reps antigas');
    await hist.fill('#gKg','42');await hist.click('#gSerie');
    ok(await hist.inputValue('#gKg')==='42'&&await hist.inputValue('#gReps')==='8','carga confirmada hoje vence histórico quando não há prescrição de carga');
    await hist.click('[data-gserie="2"]');
    ok(await hist.inputValue('#gKg')==='99'&&await hist.inputValue('#gReps')==='5','anotação específica existente vence todas as sugestões');

    const vazio=await caso(ficha(),()=>{
      const d=new Date().toLocaleDateString('en-CA');localStorage.setItem('ptdc',JSON.stringify({'Supino teste':[
        {d,kg:null,g:2,i:'0:0:0',serie:1,feito:false},
        {d,kg:0,r:0,g:2,i:'0:0:1',serie:2,feito:false},
        {d,kg:null,g:2,i:'0:0:2',serie:3,feito:true}
      ]}));
    });
    ok(await vazio.inputValue('#gKg')===''&&await vazio.inputValue('#gReps')==='','registro específico vazio continua vazio');
    await vazio.click('[data-gserie="1"]');
    ok(await vazio.inputValue('#gKg')==='0'&&await vazio.inputValue('#gReps')==='0','registro específico zero vence a prescrição');
    await vazio.click('[data-gserie="2"]');
    ok(await vazio.inputValue('#gKg')===''&&await vazio.inputValue('#gReps')==='','série concluída sem anotação não recebe sugestão retroativa');

    const sem=await caso(ficha());
    await sem.click('#gSemRegistro');
    ok((await registro(sem))[0].feito&&(await registro(sem))[0].kg===null&&!(await registro(sem))[0].r,'Concluir sem anotar ignora sugestões intocadas sem exigir apagar os campos');
    await sem.fill('#gKg','42');await sem.click('#gSemRegistro');
    ok(!(await registro(sem)).some(r=>r.serie===2&&r.feito)&&(await sem.textContent('#gCgLab')).includes('preenchimento'),'Concluir sem anotar protege ajuste manual pendente');
    await sem.fill('#gKg','');await sem.click('#gSemRegistro');
    ok((await registro(sem)).find(r=>r.serie===2).kg===null&&!(await registro(sem)).find(r=>r.serie===2).r,'limpar só o ajuste manual permite ignorar a sugestão restante');

    const draft=await caso(ficha());
    await draft.fill('#gKg','42');await draft.click('[data-gserie="1"]');await draft.click('[data-gserie="0"]');
    ok(await draft.inputValue('#gKg')==='42'&&await draft.inputValue('#gReps')==='5','draft específico mantém ajuste manual e sugestão da outra coluna');
    await draft.click('#gFechar');
    let rows=await registro(draft);
    ok(rows.length===1&&rows[0].kg===42&&!rows[0].r&&!rows[0].feito,'sair preserva carga manual sem confirmar reps sugeridas');
    await draft.reload();await draft.waitForFunction(()=>window.__acSessao);await voltar(draft);
    ok(await draft.inputValue('#gKg')==='42'&&await draft.inputValue('#gReps')==='5','retomada após reload restaura os dois valores e suas origens');
    await draft.click('#gSerie');
    rows=await registro(draft);ok(rows[0].kg===42&&rows[0].r===5&&rows[0].feito,'Série feita confirma os valores do draft retomado');
    const soReps=await caso(ficha());await soReps.fill('#gReps','4');await soReps.click('#gFechar');
    rows=await registro(soReps);ok(rows[0].r===4&&rows[0].kg===null,'alterar apenas reps não confirma a carga sugerida ao sair');

    const faixa=await caso(ficha([null,null,null],['8–12','até falha','30s']));
    for(let i=0;i<3;i++){await faixa.click('[data-gserie="'+i+'"]');ok(await faixa.inputValue('#gReps')===''&&await faixa.inputValue('#gKg')==='','alvo não numérico e carga desconhecida ficam vazios: '+['8–12','até falha','30s'][i]);}
    ok((await faixa.locator('.gserie-context').textContent()).includes('carga não informada'),'ausência de carga tem indicação honesta');
    await faixa.click('#gSerie');
    rows=await registro(faixa);ok(rows[0].feito&&rows[0].kg===null&&!rows[0].r,'confirmar campo vazio não inventa execução numérica');
    for(const x of casos)ok(x.errors.length===0,'cenário sem erro JavaScript');
    console.log('\n'+total+' verificações passaram.');
  }finally{for(const x of casos)await x.ctx.close();await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
