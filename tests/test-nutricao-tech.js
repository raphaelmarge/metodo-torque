/* Revisão tecnológica: interações reais, dados sintéticos e rede bloqueada.
 * Reutiliza a mesma montagem do teste de navegação, sem criar outro app de teste. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const prefix=fs.readFileSync(path.join(__dirname,'test-nutricao-navegacao.js'),'utf8').split('async function run(){')[0];
const app=new Function('require','__dirname',prefix+`\nreturn {mount,tab,snapshot,errors,DEMO,TODAY,
  async start(){browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',args:['--no-sandbox']});},
  async close(){if(browser)await browser.close();}};`)(require,__dirname);
let checks=0;
function ok(v,label){assert.ok(v,label);checks++;console.log('OK '+label);}
function eq(v,w,label){assert.deepEqual(v,w,label);checks++;console.log('OK '+label);}
async function go(p,id){await p.locator('#'+id).click();}
(async()=>{
  await app.start();const {p,ctx}=await app.mount();
  ok(await p.locator('#nutriAluno.ntp-tech').isVisible(),'apresentação nova usa o builder do aluno');
  const before=await app.snapshot(p);
  eq(await p.locator('.ntp-meal.is-next h3').textContent(),'Almoço','horário de 9h destaca o almoço já prescrito, não o café passado');
  ok((await p.locator('.ntp-meal.is-next .ntp-meal-kicker').textContent()).includes('Próxima no plano'),'próxima se refere ao horário do plano');
  eq(await p.locator('[data-ntp-meal]').count(),app.DEMO.refeicoes.length,'destaque não duplica nenhuma refeição');
  eq(await p.locator('.ntp-orbit').getAttribute('aria-hidden'),'true','contador decorativo não anuncia uma nota de saúde');
  ok((await p.locator('.ntp-orbit').getAttribute('style')).includes('0%'),'contador não inventa registros');
  ok((await p.locator('#ntpDataLabel').textContent()).includes('10 de setembro'),'data legível em português sem ambiguidade de mês/dia');
  ok(await p.locator('#ntpRepetirRapido').isDisabled(),'repetição indisponível antes de existir um registro');
  await p.locator('[data-ntp-filtro=registradas]').click();
  eq(await p.locator('[data-ntp-meal]:visible').count(),0,'filtro de registradas não mostra refeições ainda sem registro');
  ok(await p.locator('#ntpFiltroVazio').isVisible(),'filtro vazio explica o estado e permite recuperação');
  await p.locator('[data-ntp-limpa-filtro]').click();
  eq(await p.locator('[data-ntp-meal]:visible').count(),4,'mostrar todas recupera a lista completa');
  await p.locator('.ntp-meal-search>summary').click();await p.locator('#ntpBuscaRefeicao').fill('CAFE');
  eq(await p.locator('[data-ntp-meal]:visible h3').allTextContents(),['Café da manhã'],'busca ignora acentos e caixa');
  await p.locator('#ntpBuscaRefeicao').fill('frango');
  eq(await p.locator('[data-ntp-meal]:visible h3').allTextContents(),['Almoço','Jantar'],'busca encontra os alimentos dentro das refeições');
  await p.locator('#ntpBuscaRefeicao').fill('<img src=x onerror=alert(1)>');
  eq(await p.locator('[data-ntp-meal]:visible').count(),0,'busca trata entrada como texto');
  eq(await p.locator('#nutriAluno img[src=x]').count(),0,'busca não injeta HTML');
  await p.locator('[data-ntp-limpa-filtro]').click();await p.locator('.ntp-meal-search>summary').click();
  eq(await app.snapshot(p),before,'busca e filtros não gravam diário nem alteram hábitos/treinos/XP');
  // Um registro do plano: continua pelo handler canônico com o mesmo ID.
  await p.locator('[data-ntp-comi="'+app.DEMO.refeicoes[0].id+'"]').click();
  const after=await app.snapshot(p),id=Object.keys(after.records.registros)[0];
  eq(Object.keys(after.records.registros).length,1,'confirmar gera exatamente um registro');
  ok((await p.locator('.ntp-orbit').getAttribute('style')).includes('25%'),'anel deriva somente do registro confirmado do plano');
  ok(!await p.locator('#ntpRepetirRapido').isDisabled(),'registro existente habilita a repetição');
  await p.locator('[data-ntp-filtro=registradas]').click();eq(await p.locator('[data-ntp-meal]:visible').count(),1,'filtro atualizado mostra o registro recém-confirmado');
  await p.locator('[data-ntp-filtro=pendentes]').click();eq(await p.locator('[data-ntp-meal]:visible').count(),3,'sem registro não inclui refeição confirmada');
  eq(await p.locator('[data-ntp-filtro][aria-pressed=true]').getAttribute('data-ntp-filtro'),'pendentes','seleção do filtro é anunciada');
  await p.locator('[data-ntp-filtro=todas]').click();
  await go(p,'ntpRepetirRapido');
  eq(await p.locator('#ntpTabDiario').getAttribute('aria-selected'),'true','atalho abre a aba de diário');
  ok(await p.locator('#ntpRecentes').evaluate(e=>e.open),'atalho abre os registros reais para escolher');
  eq(Object.keys((await app.snapshot(p)).records.registros).length,1,'atalho de repetir não confirma refeição automaticamente');
  await p.locator('[data-ntp-repetir="'+id+'"]').click();
  eq(await p.locator('#ntpTitulo').inputValue(),app.DEMO.refeicoes[0].titulo,'repetição preenche o rascunho usando o snapshot original');
  await p.locator('#ntpTitulo').fill('Rascunho preservado');
  const fileChooser=p.waitForEvent('filechooser');await go(p,'ntpFotoRapida');const chooser=await fileChooser;await chooser.setFiles([]);
  eq(await p.locator('#ntpTitulo').inputValue(),'Rascunho preservado','atalho de foto reutiliza o rascunho sem substituí-lo');
  eq(Object.keys((await app.snapshot(p)).records.registros).length,1,'cancelar foto não cria refeição ou pontos');
  await go(p,'ntpTabPlanejar');eq(await p.locator('#ntpTitulo').inputValue(),'Rascunho preservado','navegação mantém preenchimento da edição');
  ok(await p.locator('#ntpEditor').isVisible(),'editor não é escondido pela mudança de aba');
  ok(!await p.locator('#ntpAtalhos').isVisible(),'atalhos de registrar não se misturam ao planejamento');
  await go(p,'ntpCancelar');
  await p.locator('[data-ntp-planeja=ntpCompras]').click();
  ok(await p.locator('#ntpCompras').evaluate(e=>e.open),'atalho de compras abre a lista existente');
  await p.locator('[data-ntp-compra]').first().check();
  ok(await p.locator('[data-ntp-compra]').first().isChecked(),'lista mantém sua gravação real e escopo por aluno');
  await p.locator('[data-ntp-planeja=ntpReceitas]').click();ok(await p.locator('#ntpReceitas').evaluate(e=>e.open),'atalho de receitas abre o preparo existente');
  await go(p,'ntpTabRefeicoes');await go(p,'ntpAnt');
  ok(!(await p.locator('#ntpPlano').textContent()).includes('Próxima no plano'),'histórico não chama refeição antiga de próxima');
  await go(p,'ntpVoltaHoje');
  await p.clock.setFixedTime(new Date('2026-09-11T02:00:00.000Z')); // 23h de 10/09 em São Paulo.
  await p.locator('#ntpData').dispatchEvent('change');
  ok(!(await p.locator('#ntpPlano').textContent()).includes('Próxima no plano'),'depois dos horários não inventa próxima refeição');
  ok((await p.locator('.ntp-meal.is-next .ntp-meal-kicker').textContent()).includes('Ainda sem registro'),'pendência de anotação não significa não ter comido');
  await go(p,'ntpTabDiario');
  eq(await p.locator('#ntpDiarioResumo strong').allTextContents(),['1','0','1'],'resumo distingue registros, foto e armazenamento local');
  ok((await p.locator('#ntpDiarioResumo').textContent()).includes('Neste aparelho'),'demo local não é anunciada como sincronizada');
  for(const width of[320,390,430,800,1280]){
    await p.setViewportSize({width,height:844});
    for(const light of[false,true]){
      await p.evaluate(v=>document.documentElement.classList.toggle('claro',v),light);
      for(const tab of['ntpTabRefeicoes','ntpTabDiario','ntpTabPlanejar']){
        await go(p,tab);ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'sem overflow '+width+' '+light+' '+tab);
      }
    }
  }
  eq((await app.snapshot(p)).xp,after.xp,'atalhos, fotos canceladas, compras e calendário não geram pontos');
  eq((await app.snapshot(p)).train,before.train,'treinos preservados');eq((await app.snapshot(p)).habits,before.habits,'hábitos preservados');
  await ctx.close();
  const paused=await app.mount({...app.DEMO,ativo:false});
  ok(!await paused.p.locator('#ntpAtalhos').isVisible(),'modo consulta não permite atalhos de gravação');
  await go(paused.p,'ntpTabRefeicoes');eq(await paused.p.locator('.is-next').count(),0,'plano pausado não sugere ação de registro');await paused.ctx.close();
  const empty=await app.mount({...app.DEMO,refeicoes:[]});
  ok(!(await empty.p.locator('#ntpResumo').innerHTML()).includes('NaN'),'sem refeições não divide por zero');
  eq(await empty.p.locator('[data-ntp-comi]').count(),0,'sem plano diário não fabrica refeições');await empty.ctx.close();
  eq(app.errors,[],'interações novas sem erro JavaScript');
  console.log(checks+' verificações da interface tecnológica passaram.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>app.close());
