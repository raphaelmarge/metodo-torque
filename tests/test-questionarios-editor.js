// Regressões do editor: ordem, modelo existente, concorrência e escopo de conta.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
let chromium;try{chromium=require('playwright').chromium;}catch(_){chromium=require('/opt/node22/lib/node_modules/playwright').chromium;}
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),html=read('personal.html');
const start=html.indexOf('<section id="vQuest"'),section=html.slice(start,html.indexOf('</section>',start)+10).replace('<section id="vQuest" hidden>','<section id="vQuest">');
const canonical=html.slice(html.indexOf('  function acxTexto('),html.indexOf('  function montaPayloadQuest('));
const payload=html.slice(html.indexOf('  function montaPayloadQuest('),html.indexOf('  $("qeGerar").addEventListener('));
const styles=[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(x=>x[1]);
for(const m of html.matchAll(/<link[^>]*href="([^"]+\.css)"[^>]*>/g))if(fs.existsSync(path.join(root,m[1])))styles.push(read(m[1]));
styles.push(read('assets/personal-questionarios.css'),'body{margin:0!important;padding:18px!important}#vQuest{max-width:820px;margin:auto}#vQuest [hidden]{display:none!important}');
const setup=`
var $=id=>document.getElementById(id),esc=t=>String(t==null?'':t).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
var state={alunos:[],questionarios:[{id:'q1',nome:'Original',perguntas:['a','b']}],questPerguntas:[{id:'a',titulo:'Sono',sigla:'SONO',texto:'Como você dormiu?',tipo:'linear'},{id:'b',titulo:'Recado',sigla:'REC',texto:'Como foi a alimentação?',tipo:'texto'},{id:'c',titulo:'Energia',sigla:'ENE',texto:'Sua disposição hoje?',tipo:'linear'}],enviados:[{nome:'Original',ps:[{texto:'Como você dormiu?'}]}]};
var accountId='studio-a',writes=0,saveFailures=0,uid=0,S=window.MTStore={read:()=>structuredClone(state),cloud:()=>({aid:accountId}),uid:()=>('new-'+(++uid)),todayISO:()=>('2026-09-11')};
function load(){return S.read();}function save(s){if(saveFailures-- >0){renderQuest();return false;}state=structuredClone(s);writes++;renderQuest();return true;}function sincronizaBusca(){}
${canonical}
${payload}
window.__questPT={render:renderQuest,payload:montaPayloadQuest};window.__qtAba=v=>{$('qtArea').value=v;document.querySelectorAll('[data-qtsec]').forEach(e=>e.hidden=e.dataset.qtsec!==v);};__qtAba('montar');renderQuest();`;
let b,n=0;function check(v,m){assert.ok(v,m);n++;console.log('OK '+m);}
(async()=>{b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});const ctx=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});let requests=0;await ctx.route('**/*',r=>{requests++;return r.abort();});const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
await p.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+styles.join('\n')+'</style></head><body>'+section+'</body></html>');await p.addScriptTag({content:setup});await p.addScriptTag({content:read('assets/personal-questionarios.js')});
const edit=()=>p.locator('[data-qpx-edit="q1"]').click(),order=()=>p.locator('.qqCheck:checked').evaluateAll(es=>es.map(e=>e.value).join(','));
await edit();check(await p.inputValue('#qqNome')==='Original','Editar abre nome e perguntas existentes');
await p.fill('#qpxSearch','alimentacao');check(await p.locator('#qqPerguntas .qpx-choice:visible').count()===1,'Busca encontra enunciado sem depender de acento');check(await order()==='a,b','Busca não remove perguntas já selecionadas');await p.fill('#qpxSearch','');
await p.locator('[data-qpx-id="b"][data-qpx-move="-1"]').click();check(await order()==='b,a','Mover pergunta altera ordem canônica');await p.evaluate(()=>renderQuest());await p.waitForTimeout(20);check(await order()==='b,a','Re-render conserva a ordem do rascunho');
await p.locator('#qpxWholePreview>summary').click();check((await p.locator('.qpx-preview-row').first().innerText()).includes('Como foi a alimentação?'),'Prévia completa respeita texto e ordem');
await p.fill('#qqNome','Semanal editado');await p.evaluate(()=>{state.questionarios.push({id:'q2',nome:'Outro modelo',perguntas:['c']});saveFailures=1;});await p.click('#qqAdd');await p.waitForTimeout(25);
check(await p.inputValue('#qqNome')==='Semanal editado'&&await order()==='b,a','Falha preserva nome e ordem');check(await p.locator('#qpxQuestionnaireError').isVisible(),'Falha informa erro acessível');check(await p.evaluate(()=>state.questionarios[0].nome==='Original'&&writes===0),'Falha não altera modelo salvo');
await p.click('#qqAdd');await p.waitForFunction(()=>!document.getElementById('qqNovoBox').open);
check(await p.evaluate(()=>state.questionarios.length===2&&state.questionarios[0].id==='q1'&&state.questionarios[0].nome==='Semanal editado'&&state.questionarios[0].perguntas.join(',')==='b,a'),'Edição mantém ID sem criar cópia e preserva outro modelo');
check(await p.evaluate(()=>state.enviados[0].nome==='Original'&&state.enviados[0].ps[0].texto==='Como você dormiu?'),'Questionários já enviados permanecem intactos');
check(await p.evaluate(()=>__questPT.payload(state,state.questionarios[0]).ps[0].texto==='Como foi a alimentação?'),'Próximo envio usa a ordem atualizada');
await edit();await p.fill('#qqNome','Rascunho local');await p.evaluate(()=>{state.questionarios[0].nome='Mudança em outro aparelho';});await p.click('#qqAdd');await p.waitForTimeout(25);
check((await p.locator('#qpxQuestionnaireError').innerText()).includes('outra sessão'),'Conflito no mesmo modelo impede sobrescrita');check(await p.inputValue('#qqNome')==='Rascunho local'&&await p.evaluate(()=>state.questionarios[0].nome==='Mudança em outro aparelho'),'Conflito conserva rascunho e versão mais nova');
await p.click('#qpxCancelEdit');await p.evaluate(()=>renderQuest());await edit();
const more=p.locator('#qqLista .qpx-saved').filter({has:p.locator('[data-qpx-edit="q1"]')}).locator('details');await more.locator('summary').click();await more.getByRole('button',{name:'Usar como base',exact:true}).click();check(await order()==='b,a','Usar como base conserva ordem do modelo');check(await p.locator('#qqAdd').getAttribute('data-qq-edit')===null,'Cópia sai do modo edição');
await p.click('#qqAdd');await p.waitForFunction(()=>!document.getElementById('qqNovoBox').open);check(await p.evaluate(()=>state.questionarios.length===3&&state.questionarios[2].perguntas.join(',')==='b,a'),'Cópia cria somente modelo e reutiliza perguntas na ordem correta');
await edit();await p.fill('#qqNome','Não cruzar contas');await p.evaluate(()=>{accountId='studio-b';});await p.click('#qqAdd');await p.waitForTimeout(25);check(await p.evaluate(()=>state.questionarios.every(q=>q.nome!=='Não cruzar contas')),'Troca de conta impede gravar rascunho na conta errada');
await p.evaluate(()=>renderQuest());await p.waitForTimeout(20);check(await p.inputValue('#qqNome')==='','Troca de conta limpa editor anterior');
await p.locator('#qpNovoBox').evaluate(e=>e.open=true);await p.fill('#qpTitulo','Pergunta da conta anterior');await p.fill('#qpTexto','Rascunho que não deve cruzar contas');await p.selectOption('#qpTipo','texto');
const beforeQuestion=await p.evaluate(()=>JSON.stringify(state));await p.evaluate(()=>{accountId='studio-c';});await p.click('#qpAdd');
check(await p.evaluate(()=>JSON.stringify(state))===beforeQuestion,'Pergunta iniciada em outra conta não é gravada após troca de conta');
check((await p.locator('#qpxError').innerText()).includes('conta'),'Criação da pergunta explica mudança de conta');
await p.evaluate(()=>renderQuest());await p.waitForTimeout(20);check(await p.inputValue('#qpTitulo')==='','Re-render da outra conta limpa também o rascunho de pergunta');
await p.locator('#qqNovoBox').evaluate(e=>e.open=true);await p.getByRole('button',{name:'+ Criar uma pergunta',exact:true}).click();await p.fill('#qpTitulo','Retorno da conta anterior');await p.fill('#qpTexto','Pergunta com retorno tardio');await p.selectOption('#qpTipo','texto');
await p.evaluate(()=>{window.saveQuestionOriginal=save;save=function(s){var result=saveQuestionOriginal(s);accountId='studio-d';return result;};document.getElementById('qpxStatus').textContent='Aguardando verificação';});
await p.click('#qpAdd');await p.waitForTimeout(25);
check(await order()==='','Retorno de salvamento anterior não seleciona pergunta na outra conta, mesmo com ID coincidente');
check(!(await p.locator('#qpxStatus').innerText()).includes('Pergunta salva'),'Retorno anterior não confirma sucesso na conta atual');
check((await p.locator('#qpxError').innerText()).includes('conta anterior'),'Retorno anterior orienta conferir a conta de origem');await p.evaluate(()=>{save=saveQuestionOriginal;renderQuest();});
await edit();await p.locator('.qqCheck[value="c"]').check();for(const theme of ['claro','escuro'])for(const width of [320,390,1280]){await p.setViewportSize({width,height:844});await p.evaluate(t=>document.documentElement.dataset.tema=t,theme);check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Editor cabe em '+width+' '+theme);const targets=await p.locator('.qpx-order-actions button').evaluateAll(es=>es.map(e=>e.getBoundingClientRect()));check(targets.every(r=>r.width>=44&&r.height>=44),'Controles de ordem têm área de toque adequada');}
check(requests===0,'Nenhuma requisição externa');check(errors.length===0,'Sem erros JS: '+errors.join(';'));console.log(n+' verificações de edição de questionários passaram.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(b)await b.close();});
