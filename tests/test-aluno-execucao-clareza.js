/* Execução com dados sintéticos: campos visíveis, descanso e conclusão sem falso sucesso. */
'use strict';
const assert = require('node:assert/strict');
const {chromium} = require(process.env.TORQUE_PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright');
const {abrir} = require('./test-aluno-player-experiencia');
const {clicarControle} = require('./helpers/player-template');
let count = 0;
function ok(value, label) { assert.ok(value, label); count++; console.log('OK '+label); }
async function main() {
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || undefined,args:['--no-sandbox']});
  try {
    for (const width of [320,390,768,1440]) for (const tema of ['', 'claro']) {
      const {p,ctx,errors} = await abrir(browser,{width,tema});
      ok(await p.evaluate(() => {
        const field=document.getElementById('gKg').getBoundingClientRect(), reps=document.getElementById('gReps').getBoundingClientRect(), action=document.getElementById('gSerie').getBoundingClientRect();
        return field.top>=0&&reps.top>=0&&field.bottom<=action.top&&reps.bottom<=action.top&&action.bottom<=innerHeight;
      }),width+' '+tema+': valores realizados e confirmação cabem juntos antes de rolar');
      ok(await p.locator('[data-gpt-step]').evaluateAll(buttons=>buttons.every(b=>{const r=b.getBoundingClientRect();return r.width>=44&&r.height>=44;})),width+' '+tema+': ajustes de carga, reps e esforço têm alvos de 44 px');
      ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&document.getElementById('guiaBox').scrollWidth<=document.getElementById('guiaBox').clientWidth+1),width+' '+tema+': sem corte horizontal');
      await p.locator('#gKg').fill('42'); await clicarControle(p,'#gSerie');
      ok(await p.locator('#gResta').isVisible()&&(await p.locator('#gTemplateRestNext').innerText()).includes('série 2 de 3'),width+' '+tema+': descanso orienta próxima série');
      ok(await p.locator('#gResta').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),width+' '+tema+': descanso alcançável no primeiro plano');
      ok(errors.length===0,width+' '+tema+': sem erros JavaScript');
      await ctx.close();
    }
    const t=await abrir(browser),p=t.p;
    await p.setViewportSize({width:390,height:420}); await p.locator('#gKg').fill('55');
    ok(await p.locator('#gSerie').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),'altura reduzida pelo teclado mantém ação acessível');
    await p.setViewportSize({width:390,height:844}); await clicarControle(p,'#gSerie');
    await p.locator('[data-gserie="0"]').click();
    ok((await p.locator('#gTemplateRestNext').innerText()).includes('série 2 de 3 · 8 repetições'), 'revisar a série concluída durante o descanso mantém a próxima série pendente no recado');
    ok(await p.evaluate(()=>SR.indice(GUIA[0].it[0])===0&&GP.proxima(GUIA[0].it[0])===1), 'série em edição e próxima série de execução continuam independentes');
    await p.locator('[data-gserie="1"]').click();
    await p.evaluate(()=>{window.__storageOriginal=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='ptfeitos')throw new DOMException('Sem espaço','QuotaExceededError');return __storageOriginal.call(this,k,v);};gConclui();});
    ok(await p.locator('#gFimAviso').isVisible(),'falha no registro do dia aparece na tela de execução');
    ok(await p.evaluate(()=>!!__acSessao.ler()&&!__gvDe().fim&&!L('ptfeitos',{})[isoHj()]),'falha preserva checkpoint e não afirma conclusão');
    await p.evaluate(()=>{Storage.prototype.setItem=__storageOriginal;gConclui();});
    ok((await p.locator('.fim-mensagem').innerText()).includes('Treino parcial: 1 de 4'),'resumo identifica sessão parcial sem fabricar séries');
    ok(await p.evaluate(()=>L('ptfeitos',{})[isoHj()]===1&&!__acSessao.ler()),'nova tentativa confirma dia antes de remover checkpoint');
    ok((await p.locator('.ac-conclusao-status').innerText()).includes('Salvo neste aparelho'),'resumo distingue gravação local de envio');
    ok(await p.evaluate(()=>{__acRegistraConclusao({tipo:'corrida',id:'outro',data:isoHj()});return Object.keys(L('ptfeitos',{})).length===1;}),'duas modalidades no mesmo dia não duplicam constância');
    ok(await p.evaluate(()=>!__acRegistraConclusao({data:'2026-02-30'})&&!__acRegistraConclusao({data:'2999-01-01'})),'datas impossíveis ou futuras não recebem conclusão');
    ok(await p.evaluate(()=>{
      const base={d:'2026-09-01',tp:'amrap',du:600,cf:'rx',prescricao:'A',v:5,ex:2};
      const records=[base,{...base,v:50,du:1200},{...base,v:40,cf:'adp'},{...base,v:30,prescricao:'B'},{...base,v:60,parcial:true},{...base,v:5,ex:3,d:'2026-09-02'}];
      const best=mkWodMelhor(records);return best.v===5&&best.ex===3;
    }),'recorde de circuito compara prescrição, adaptação, duração e repetições extras');
    ok(await p.evaluate(()=>mkWodMelhor([{tp:'fortime',v:30,parcial:true}])===null),'resultado parcial não é recorde de circuito');
    ok(await p.evaluate(()=>{localStorage.setItem('tq_app_token','outra-identidade');return !__acRegistraConclusao({data:isoHj()});}),'aba antiga não conclui treino após troca de identidade');
    ok(t.errors.length===0,'ciclo de erro e recuperação sem exceções'); await t.ctx.close();
    const stale=await abrir(browser);
    await stale.p.locator('#gKg').fill('42');
    const staleResult=await stale.p.evaluate(()=>{
      const outro={
        ptdc:{'Exercício de outro aluno':[{d:isoHj(),kg:10,r:8}]},
        ptfeitos:{},ptguiaSessao:{token:'outra-identidade',d:isoHj(),rascunho:'sessão do outro aluno'},
        ptuso:{[isoHj()]:{inicios:1,conclusoes:0,falhasSync:0}}
      };
      Object.keys(outro).forEach(k=>localStorage.setItem(k,JSON.stringify(outro[k])));
      localStorage.setItem('tq_app_token','outra-identidade');
      const before=Object.fromEntries(Object.keys(outro).map(k=>[k,localStorage.getItem(k)]));
      gConclui();
      const stopped=!__gvDe().fim;
      const rejected=__gGrava('Supino teste',42,5,'0:0:0')===false;
      __acSessao.salvar();acUso('conclusoes');
      const after=Object.fromEntries(Object.keys(outro).map(k=>[k,localStorage.getItem(k)]));
      return {before,after,stopped,rejected,aviso:document.getElementById('gFimAviso').textContent};
    });
    ok(staleResult.stopped&&staleResult.aviso.includes('acesso mudou'), 'conclusão com rascunho e identidade trocada bloqueia antes de gravar ou fechar');
    ok(staleResult.rejected, 'gravação direta da série também recusa uma aba de identidade antiga');
    ok(JSON.stringify(staleResult.before)===JSON.stringify(staleResult.after), 'histórico, constância, checkpoint e métricas do outro aluno permanecem intactos');
    ok(stale.errors.length===0,'bloqueio da identidade com preenchimento pendente não gera exceções');
    await stale.ctx.close();
    const empty=await abrir(browser);
    await empty.p.evaluate(()=>gConclui());
    ok(await empty.p.evaluate(()=>Object.keys(L('ptfeitos',{})).length===0),'abrir e encerrar sem executar não marca o dia');
    ok((await empty.p.locator('.fim-mensagem').innerText()).includes('Nenhuma série concluída'),'sessão vazia recebe mensagem honesta');
    await empty.ctx.close();
    console.log(count+' verificações de clareza e conclusão passaram.');
  } finally { await browser.close(); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
