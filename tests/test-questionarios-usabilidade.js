/* Fixture DOM offline com o HTML e handlers CANÔNICOS de questionários.
 * Não inicializa autenticação/sync nem acessa a nuvem. Complementa (não substitui)
 * test-personal, test-acompanhamento-experiencia e test-sync-cas. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { chromium = require('playwright').chromium; } catch (_) { chromium = require('/opt/node22/lib/node_modules/playwright').chromium; }
const root = path.join(__dirname, '..'), read = p => fs.readFileSync(path.join(root,p),'utf8');
const html = read('personal.html');
const start = html.indexOf('<section id="vQuest"'), end = html.indexOf('</section>', start) + 10;
const section = html.slice(start,end).replace('<section id="vQuest" hidden>', '<section id="vQuest">');
const canonical = html.slice(html.indexOf('  function acxTexto('), html.indexOf('  function montaPayloadQuest('));
const payload = html.slice(html.indexOf('  function montaPayloadQuest('), html.indexOf('  $("qeGerar").addEventListener('));
const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(x=>x[1]);
for (const m of html.matchAll(/<link[^>]*href="([^"]+\.css)"[^>]*>/g)) if (fs.existsSync(path.join(root,m[1]))) styles.push(read(m[1]));
styles.push(read('assets/personal-questionarios.css'));
styles.push('body{margin:0!important;padding:20px 18px!important;min-width:0!important}#vQuest{max-width:820px;margin:auto}#vQuest [hidden]{display:none!important}');
const setup = `
var $=id=>document.getElementById(id);
var esc=t=>String(t==null?'':t).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
var state={alunos:[{id:'demo-a',nome:'Aluno de demonstração'}],questionarios:[{id:'q1',nome:'Check-in semanal',perguntas:['disp','dor']}],questPerguntas:[
{id:'disp',sigla:'DISP',titulo:'Disposição',texto:'Como está sua disposição hoje?',tipo:'linear',ops:[],menosMelhor:false},
{id:'dor',sigla:'DOR',titulo:'Dor',texto:'Qual foi a intensidade da dor?',tipo:'linear',ops:[],menosMelhor:true},
{id:'dor2',sigla:'DOR',titulo:'Dor após o treino',texto:'Sentiu dor após o treino?',tipo:'linear',ops:[],menosMelhor:true},
{id:'obs',sigla:'OBS',titulo:'Recado',texto:'O que gostaria de contar ao seu personal?',tipo:'texto',ops:[],menosMelhor:false}
]};
var writes=[],uid=0;var S=window.MTStore={read:()=>structuredClone(state),uid:()=>('created-'+(++uid)),todayISO:()=>('2026-09-08')};
function load(){return S.read();} function save(s){state=structuredClone(s);writes.push(structuredClone(s));return true;}
function sincronizaBusca(){}
${canonical}
${payload}
window.__questPT={render:renderQuest,payload:montaPayloadQuest};
window.__qtAba=function(value){$('qtArea').value=value;document.querySelectorAll('[data-qtsec]').forEach(x=>x.hidden=x.dataset.qtsec!==value);};
$('qtArea').addEventListener('change',()=>__qtAba($('qtArea').value));
$('qpBusca').addEventListener('input',()=>acxFiltra('qpLista','qpBusca','[data-qp-row]','qpResultado'));
__qtAba('montar');renderQuest();
`;
let browser, checks=0;
function ok(value,label){assert.ok(value,label);checks++;console.log('OK '+label);}
async function snapshot(p){return p.evaluate(()=>JSON.stringify(state));}
(async()=>{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 let requests=0;await context.route('**/*',r=>{requests++;return r.abort();});
 const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 await p.setContent('<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+styles.join('\n')+'</style></head><body>'+section+'</body></html>');
 await p.addScriptTag({content:setup});const before=await snapshot(p);
 await p.addScriptTag({content:read('assets/personal-questionarios.js')});
 await p.waitForFunction(()=>window.MT_QUESTIONARIOS&&MT_QUESTIONARIOS.ready);
 ok(await snapshot(p)===before,'Abrir e organizar não altera nenhum dado');
 ok(await p.evaluate(()=>writes.length===0),'Modelos/listas não gravam automaticamente');
 ok(await p.locator('#vQuest > .card[data-qtsec="montar"]').first().locator('h2').innerText()==='Meus questionários','Questionários vêm antes do banco de perguntas');
 ok(await p.locator('#qpLista [data-qp-row]').count()===4,'Duplicatas existentes permanecem separadas');
 const free=p.locator('#qpLista [data-qp-row]').filter({has:p.locator('[data-qprm="obs"]')});
 await free.locator('summary').click();ok(await free.locator('select').count()===0,'Texto livre não tem interpretação de nota');
 await p.locator('#qqNovoBox > summary').click();await p.locator('.qqCheck[value="disp"]').check();
 ok((await p.locator('#qpxSelected').innerText()).includes('1 pergunta'),'Seleção informa quantas perguntas estão marcadas');
 // Primeira captura: lista real de controles decorados, com dados fictícios.
 if(process.env.QPX_SHOTS){await p.locator('#qqNovoBox > summary').click();await p.screenshot({path:path.join(process.env.QPX_SHOTS,'questionarios-organizados.png'),fullPage:true});}
 await p.locator('#qpNovoBox > summary').click();
 await p.getByRole('button',{name:'Disposição',exact:true}).click();
 ok(await p.evaluate(()=>writes.length===0),'Usar modelo só preenche rascunho');
 await p.fill('#qpTitulo','Energia diária');await p.fill('#qpTexto','Como está sua energia hoje?');
 await p.selectOption('#qpTipo','texto');
 ok(!await p.locator('#qpxDirection').isVisible(),'Texto livre oculta escala e pontuação');
 await p.click('#qpAdd');await p.waitForFunction(()=>!document.getElementById('qpNovoBox').open);
 ok(await p.evaluate(()=>state.questPerguntas.some(p=>p.titulo==='Energia diária'&&p.tipo==='texto'&&p.menosMelhor===false&&p.sigla==='ENERG')),'Salvar usa código automático e handler original');
 ok(await p.evaluate(()=>state.questionarios[0].perguntas.join(',')==='disp,dor'),'Criar pergunta preserva questionários anteriores');
 await p.locator('#qpNovoBox > summary').click();await p.fill('#qpTitulo','Prontidão');await p.fill('#qpTexto','Como você se sente para a sessão de hoje?');
 await p.selectOption('#qpTipo','emoji');await p.locator('#qpxAdvanced > summary').click();await p.fill('#qpxScore0','');
 const n=await p.evaluate(()=>writes.length);await p.click('#qpAdd');
 ok(await p.evaluate(()=>writes.length)===n,'Pontuação vazia bloqueia gravação em vez de virar zero');
 await p.fill('#qpxScore0','2');await p.fill('#qpSigla','DOR');await p.click('#qpAdd');
 ok(await p.evaluate(()=>writes.length)===n,'Novo código duplicado é recusado sem apagar os antigos');
 await p.fill('#qpSigla','PRONT');await p.selectOption('#qpxDirection','menor');
 await p.locator('#qpxAdvanced > summary').click();
 if(process.env.QPX_SHOTS){await p.selectOption('#qpxDirection','maior');await p.locator('#qpNovoBox').scrollIntoViewIfNeeded();await p.locator('#qpNovoBox').screenshot({path:path.join(process.env.QPX_SHOTS,'criacao-pergunta.png')});await p.selectOption('#qpxDirection','menor');}
 await p.click('#qpAdd');await p.waitForFunction(()=>!document.getElementById('qpNovoBox').open);
 ok(await p.evaluate(()=>{const x=state.questPerguntas.find(p=>p.sigla==='PRONT');return x.menosMelhor&&x.ops[0].p===2&&x.ops[4].p===-2;}),'Carinhas preservam pontos negativos/zero e sentido escolhido');
 await p.locator('#qqNovoBox').evaluate(el=>{el.open=true;});await p.fill('#qqNome','Meu novo check-in');
 await p.locator('.qqCheck[value="dor"]').check();await p.click('#qqAdd');
 ok(await p.evaluate(()=>{const q=state.questionarios.at(-1);return q.nome==='Meu novo check-in'&&q.perguntas.includes('disp')&&q.perguntas.includes('dor');}),'Questionário usa IDs canônicos sem regravar perguntas');
 ok(await p.evaluate(()=>__questPT.payload(state,state.questionarios[0]).ps.find(p=>p.s==='DOR').mm),'Payload do aluno mantém a direção da dor');
 const used=p.locator('#qpLista [data-qp-row]').filter({has:p.locator('[data-qprm="dor"]')});await used.locator('summary').click();
 ok(!await used.locator('[data-qprm="dor"]').isVisible(),'Pergunta usada não oferece exclusão que quebraria vínculos');
 await used.locator('select').selectOption('maior');
 ok(await p.evaluate(()=>state.questPerguntas.find(p=>p.id==='dor').menosMelhor===false),'Alterar interpretação chama a operação existente, preservando ID');
 await p.locator('#qpNovoBox > summary').click();await p.fill('#qpTitulo','Rascunho preservado');await p.fill('#qpTexto','Ainda não salvei.');
 await p.evaluate(()=>__questPT.render());await p.waitForTimeout(30);
 ok(await p.inputValue('#qpTexto')==='Ainda não salvei.','Re-render não destrói o rascunho');
 const ids=await p.evaluate(()=>Array.from(document.querySelectorAll('[id]')).map(e=>e.id));ok(new Set(ids).size===ids.length,'Nenhum ID duplicado na página');
 for(const theme of ['escuro','claro'])for(const width of [320,375,390,430,1280]){
  await p.setViewportSize({width,height:844});await p.evaluate(t=>document.documentElement.dataset.tema=t,theme);
  ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Sem rolagem horizontal em '+width+'px '+theme);
 }
 ok(errors.length===0,'Sem erros JS: '+errors.join('; '));
 console.log(checks+' verificações aprovadas. Fixture offline; não atesta login, entrega remota ou Safari real.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
