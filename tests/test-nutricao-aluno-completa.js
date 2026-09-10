/* Experiência nutricional v814: clique explícito, quantidades, catálogo, receitas,
 * compras e conversa. Todas as RPCs são simuladas; não usa dados de pessoas reais. */
process.env.TZ='America/Sao_Paulo';
const assert=require('assert/strict'),fs=require('fs');
let chromium;try{chromium=require('playwright').chromium;}catch(_){chromium=require('/opt/node22/lib/node_modules/playwright').chromium;}
const BASE=process.env.BASE_URL||'http://127.0.0.1:8765',FAKE='https://aluno-nutricao-test.invalid',DAY='2026-09-07',STAMP=DAY+'T12:00:00.000Z';
global.self=global;global.MT_CLOUD={url:FAKE,anonKey:'fake'};
require('../assets/nutricao-core.js');require('../app/aluno-skin.js');require('../app/aluno-builder.js');
const N=global.MT_NUTRICAO,clone=x=>JSON.parse(JSON.stringify(x));let browser,checks=0;const errors=[],external=[];
function ok(v,label){assert.ok(v,label);checks++;console.log('  OK '+label);}
function eq(v,w,label){assert.deepEqual(v,w,label);checks++;console.log('  OK '+label);}
const banana={id:'banana',alimId:'banana',nome:'Banana prata',porcao:'1 unidade (70 g)',baseGramas:70,qtd:1,k:64,pt:.9,cb:16,g:.1};
const rice={id:'arroz',alimId:'arroz',nome:'Arroz branco cozido',porcao:'100 g',baseGramas:100,qtd:1,k:130,pt:2.5,cb:28,g:.2,medidas:[{nome:'Colher de servir',gramas:50}],fonte:'Catálogo demonstrativo',substituicoes:[banana]};
const beans={id:'feijao',alimId:'feijao',nome:'Feijão carioca cozido',porcao:'1 concha (80 g)',baseGramas:80,qtd:1,k:76,pt:4.8,cb:14,g:.5};
function plan(){return{v:1,ativo:true,id:'p814',versao:2,inicio:'2026-09-01',fim:'2026-09-30',titulo:'Rotina alimentar de teste',objetivo:'Organizar refeições',responsavel:'Nutricionista de teste',atualizadoEm:STAMP,metas:{k:2000,pt:100,cb:250,g:60},catalogo:[rice,beans,banana],refeicoes:[{id:'almoco',titulo:'Almoço',hora:'12:30',dias:[1,3,5],itens:[rice,beans]},{id:'lanche',titulo:'Lanche',hora:'16:00',itens:[banana]}],receitas:[{id:'r-banana',nome:'Banana em rodelas',tempo:5,rendimento:2,ingredientes:['2 bananas prata'],modo:['Corte as bananas em rodelas.'],itens:[{...banana,qtd:2}],fonte:'Receita demonstrativa'},{id:'r-legacy',nome:'Receita antiga',ingredientes:['A gosto'],modo:['Consulte o responsável'],k:120}]};}
async function fixture(overrides={},state={}){
  const D={a:{id:'a814',nome:'Aluno de teste',appTokenP:'token-aluno-814'},studio:'Studio de teste',cfg:{},metaSemana:3,fichasApp:[],guiaFichasP:[],fexs:[],sessApp:[],wodsApp:[],cardiosApp:[],nutricaoApp:plan(),atualizador:'',...overrides};
  state.calls=[];state.records=state.records||{};state.feedback=state.feedback||{};
  const ctx=await browser.newContext({viewport:{width:390,height:844},locale:'pt-BR',timezoneId:'America/Sao_Paulo',serviceWorkers:'block'});
  await ctx.addInitScript(token=>{localStorage.setItem('tq_app_token',token);localStorage.setItem('pttour',JSON.stringify({como:'teste'}));localStorage.setItem('ptonb',JSON.stringify({feito:true}));localStorage.setItem('pthab',JSON.stringify({'2026-09-07':[1,0,1,0]}));localStorage.setItem('ptdc',JSON.stringify({Supino:[{d:'2026-09-07',kg:30,r:10,feito:true}]}));},D.a.appTokenP);
  const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());await p.clock.setFixedTime(new Date(STAMP));
  await ctx.route('**/*',async route=>{
    const u=new URL(route.request().url());
    if(u.origin===new URL(BASE).origin){if(u.pathname==='/aluno-nutricao-completa-test.html')return route.fulfill({contentType:'text/html',body:global.MT_APP_ALUNO.monta(D)});return route.continue();}
    if(u.origin!==FAKE){external.push(u.origin+u.pathname);return route.abort();}
    const rpc=u.pathname.split('/').pop(),body=route.request().postDataJSON();state.calls.push({rpc,body});
    function reply(x){return route.fulfill({contentType:'application/json',body:JSON.stringify(x)});}
    if(rpc==='app_nutricao_estado')return reply({ok:true,nutricao:{v:1,registros:state.records}});
    if(rpc==='app_nutricao_salva'){if(state.offline)return reply({erro:'offline de teste'});for(const r of body.p_registros){const old=state.records[r.id];if(!old||Date.parse(r.atualizadoEm)>Date.parse(old.atualizadoEm))state.records[r.id]=clone(r);}return reply({ok:true,nutricao:{v:1,registros:state.records}});}
    if(rpc==='app_nutricao_feedback_lista'){const snapshot=clone(state.feedback[body.p_registro]||[]);if(state.feedbackHold)await new Promise(resolve=>{state.feedbackRelease=resolve;});return reply({ok:true,feedback:snapshot});}
    if(rpc==='app_nutricao_feedback_envia'){
      if(state.feedbackFail)return reply({erro:'sem conexão de teste'});
      const list=state.feedback[body.p_registro]||(state.feedback[body.p_registro]=[]);
      if(!list.some(x=>x.id===body.p_id))list.push({id:body.p_id,registroId:body.p_registro,autor:'aluno',nome:'Aluno de teste',texto:body.p_texto,revisado:false,criadoEm:STAMP,registroVersao:state.records[body.p_registro].atualizadoEm});
      return reply({ok:true,feedback:list});
    }
    if(rpc==='chat-envia')return reply({ok:true,itens:[banana],estimativa:true,observacao:'Estimativa de teste.'});
    return reply(null);
  });
  await p.goto(BASE+'/aluno-nutricao-completa-test.html');await p.waitForFunction(()=>window.__nutriAluno);await open(p);return{p,ctx,D,state};
}
async function open(p){await p.locator('#navMenuApp').click();await p.locator('#menuApp [data-msec=alimentacao]').click();}
async function area(p,id){await p.locator('[role=tab][aria-controls="'+id+'"]').click();}
async function details(p,id){const el=p.locator(id);const panel=await el.evaluate(x=>x.closest('[role=tabpanel]')?.id);if(panel)await area(p,panel);if(!await el.evaluate(x=>x.open))await el.locator(':scope>summary').click();}
const records=p=>p.evaluate(()=>window.__nutriAluno.estado().registros);
const active=p=>records(p).then(rs=>Object.values(rs).filter(r=>!r.apagado));
const qtd=(p,i)=>p.locator('#ntpItens [data-ntp-item="'+i+'"] [data-ncampo=qtd]');
async function sync(p){await p.evaluate(()=>window.__nutriAluno.sync());await p.waitForFunction(()=>Object.keys(JSON.parse(localStorage.getItem(window.__nutriAluno.chaves.fila)||'{}')).length===0);}
async function testMain(){
  const {p,ctx,state,D}=await fixture();
  const legacy=await p.evaluate(()=>[localStorage.getItem('pthab'),localStorage.getItem('ptdc')]);
  eq((await active(p)).length,0,'Abrir alimentação não confirma uma refeição');
  eq(await p.evaluate(()=>window.__nutriAluno.xp()),0,'Abrir metas, plano e compras não concede XP');
  ok((await p.locator('#ntpDetalhesDia').textContent()).includes('Sem registro não significa que você não comeu'),'Resumo distingue falta de registro de não comer');
  eq(await p.locator('[data-ntp-comi]').count(),2,'Plano de segunda exibe apenas refeições previstas para o dia');
  ok(!await p.locator('.ntp-week-details').evaluate(el=>el.open),'Acompanhamento semanal recolhido reduz a área antes das refeições');
  const acao=await p.locator('[data-ntp-comi=almoco]').boundingBox(),nav=await p.locator('#navApp').boundingBox();ok(acao.y+acao.height<=nav.y,'Primeira ação da refeição aparece antes da navegação no celular');
  await details(p,'.ntp-goals');ok((await p.locator('.ntp-targets').textContent()).includes('Meta: 2.000 kcal'),'Metas vêm do plano do profissional');
  await area(p,'ntpPlanoSec');await p.locator('[data-ntp-comi=almoco]').click();await sync(p);
  let rs=await active(p),id=rs[0].id;
  eq(rs.length,1,'Comi como planejado confirma diretamente um registro');
  ok(!await p.locator('#ntpEditor').isVisible(),'Registro direto não exige abrir formulário');
  eq(rs[0].itens.map(x=>x.qtd),[1,1],'Registro direto conserva porções prescritas');
  eq(await p.locator('[data-ntp-comi=almoco]').count(),0,'Refeição já confirmada não oferece novo clique de confirmação');
  eq(await p.evaluate(()=>window.__nutriAluno.xp()),2,'Registro direto soma os mesmos 2 XP existentes');
  await p.locator('[data-ntp-ref=almoco]').click();
  ok(!await p.locator('#ntpItem0k').isVisible(),'Macros conhecidos ficam em detalhes secundários');
  ok(await qtd(p,0).isVisible(),'Quantidade permanece imediatamente acessível');
  await p.locator('[data-ntp-medida="0"]').selectOption('0');
  eq(await qtd(p,0).inputValue(),'0.5','Medida caseira usa peso conhecido, sem inferir densidade');
  await details(p,'#ntpItens [data-ntp-item="0"] .ntp-swaps');await p.locator('[data-ntp-troca="0"]').first().click();
  eq(await qtd(p,0).inputValue(),'1','Troca aprovada aplica a quantidade revisada pelo profissional');
  eq((await records(p))[id].itens[0].nome,'Arroz branco cozido','Trocar no rascunho não altera o registro antes de confirmar');
  await p.locator('#ntpSalvar').click();await sync(p);
  rs=await active(p);eq(rs.length,1,'Editar porções e substituições conserva o mesmo registro');eq(rs[0].id,id,'ID estável preserva o histórico');eq(rs[0].itens[0].nome,'Banana prata','Substituição salva seu snapshot');eq(await p.evaluate(()=>window.__nutriAluno.xp()),2,'Editar não duplica XP');
  await p.locator('#ntpNovo').click();await p.locator('#ntpTitulo').fill('Jantar catalogado');await details(p,'#ntpBiblioteca');await p.locator('#ntpBusca').fill('feijao');
  eq(await p.locator('[data-ntp-alimento]').count(),1,'Busca da biblioteca ignora acentos');
  await p.locator('[data-ntp-alimento]').click();eq(await qtd(p,0).inputValue(),'1','Biblioteca preenche alimento sem pedir macros');await qtd(p,0).fill('1.5');await p.locator('#ntpSalvar').click();await sync(p);
  const jantar=(await active(p)).find(r=>r.titulo==='Jantar catalogado');eq(jantar.itens[0].qtd,1.5,'Quantidade fracionada é registrada a partir da biblioteca');
  await details(p,'#ntpRecentes');await p.locator('[data-ntp-repetir="'+jantar.id+'"]').click();eq((await active(p)).length,2,'Repetir prepara revisão sem auto-confirmar');await p.locator('#ntpSalvar').click();await sync(p);
  const repeated=(await active(p)).find(r=>r.id.startsWith('repetir:'));ok(!!repeated,'Repetição usa uma identidade própria por origem e data');eq(repeated.foto,'','Repetir não reaproveita foto de outro prato');
  await details(p,'#ntpRecentes');await p.locator('[data-ntp-repetir="'+repeated.id+'"]').count().then(async n=>{if(n)await p.locator('[data-ntp-repetir="'+repeated.id+'"]').click();else await p.locator('[data-ntp-repetir="'+jantar.id+'"]').click();});
  ok(await p.locator('#ntpEdData').evaluate(el=>el.readOnly),'Repetição mantém a data escolhida antes de abrir');await p.locator('#ntpEdData').evaluate(el=>el.value='2026-09-06');await p.locator('#ntpSalvar').click();await sync(p);eq((await active(p)).length,3,'Repetir novamente a mesma origem/data abre o registro existente, sem duplicar');eq((await active(p)).filter(r=>r.id.startsWith('repetir:')).length,1,'Repetir uma refeição já repetida conserva a origem idempotente');eq((await records(p))[repeated.id].d,DAY,'Mesmo uma alteração artificial da data não desacopla ID e dia da repetição');
  await details(p,'#ntpReceitas');await p.locator('#ntpReceitaBusca').fill('banana');await details(p,'.ntp-recipe');ok((await p.locator('#ntpReceitasLista').textContent()).includes('Rende 2'),'Receita informa rendimento');await p.locator('[data-ntp-receita="0"]').click();eq(await qtd(p,0).inputValue(),'1','Registrar receita divide ingredientes pelo rendimento');await p.locator('#ntpSalvar').click();await sync(p);
  await area(p,'ntpRecursos');await p.locator('#ntpReceitaBusca').fill('antiga');await details(p,'.ntp-recipe');eq(await p.locator('#ntpReceitasLista [data-ntp-receita]').count(),0,'Receita legada sem nutrientes completos fica somente para consulta');
  await details(p,'#ntpCompras');eq(await p.locator('[data-ntp-compra]').count(),3,'Lista agrega alimentos do plano por período');
  const expected=N.listaCompras(plan(),DAY,7);ok((await p.locator('#ntpComprasLista').textContent()).includes('3 × 100 g'),'Compra considera somente dias prescritos para o arroz');
  await p.locator('[data-ntp-compra="0"]').check();ok((await p.locator('#ntpMissoes').textContent()).includes('1 itens marcados'),'Missão de organização acompanha marcações da lista');
  const xp=await p.evaluate(()=>window.__nutriAluno.xp());await p.reload();await p.waitForFunction(()=>window.__nutriAluno);await open(p);await details(p,'#ntpCompras');ok(await p.locator('[data-ntp-compra="0"]').isChecked(),'Lista de compras persiste no aparelho por token');eq(await p.evaluate(()=>window.__nutriAluno.xp()),xp,'Compras e consulta não duplicam XP de registros');
  state.feedback[id]=[{id:'pro1',registroId:id,autor:'profissional',nome:'Nutricionista',texto:'Como você se sentiu após o almoço?',revisado:true,criadoEm:STAMP,registroVersao:(await records(p))[id].atualizadoEm}];
  await area(p,'ntpDiarioSec');await p.locator('[data-ntp-conversa="'+id+'"]').click();await p.waitForFunction(()=>document.getElementById('ntpComentarios').textContent.includes('Como você'));ok((await p.locator('#ntpComentarios').textContent()).includes('Refeição revisada'),'Selo da revisão corresponde à versão exata do registro');
  const count=(await active(p)).length;await p.locator('#ntpResposta').fill('Fiquei satisfeito <img src=x onerror=alert(1)>');state.feedbackFail=true;await p.locator('#ntpResponder').click();await p.waitForFunction(()=>document.getElementById('ntpConversaStatus').textContent.includes('Não foi possível enviar'));ok((await p.locator('#ntpResposta').inputValue()).includes('Fiquei satisfeito'),'Falha preserva texto da mensagem');
  const first=state.calls.filter(x=>x.rpc==='app_nutricao_feedback_envia').at(-1).body;state.feedbackFail=false;await p.locator('#ntpResponder').click();await p.waitForFunction(()=>document.getElementById('ntpConversaStatus').textContent==='Mensagem enviada.');const second=state.calls.filter(x=>x.rpc==='app_nutricao_feedback_envia').at(-1).body;eq(second.p_id,first.p_id,'Retentativa da mesma mensagem preserva ID idempotente');eq(second.p_origem,'aluno','Aluno nunca solicita autoria do profissional');eq(second.p_revisado,false,'Aluno nunca marca revisão profissional');eq(await p.locator('#ntpComentarios img').count(),0,'Mensagens são escapadas, sem interpretar HTML');eq((await active(p)).length,count,'Abrir e enviar conversa não cria refeição ou XP');
  await p.locator('[data-ntp-edita="'+id+'"]').click();await qtd(p,0).fill('2');await p.locator('#ntpSalvar').click();await sync(p);ok(!(await p.locator('#ntpComentarios').textContent()).includes('Refeição revisada'),'Editar invalida revisão imediatamente na conversa já aberta');await p.locator('#ntpConversaFechar').click();
  state.feedbackHold=true;await area(p,'ntpDiarioSec');await p.locator('[data-ntp-conversa="'+id+'"]').click();await p.waitForFunction(()=>document.getElementById('ntpConversaStatus').textContent==='Carregando conversa…');
  for(let i=0;i<100&&!state.feedbackRelease;i++)await p.waitForTimeout(20);ok(typeof state.feedbackRelease==='function','Consulta inicial atrasada está em andamento');await p.locator('#ntpResposta').fill('Nova mensagem antes do histórico chegar');await p.locator('#ntpResponder').click();await p.waitForFunction(()=>document.getElementById('ntpConversaStatus').textContent==='Mensagem enviada.');state.feedbackHold=false;state.feedbackRelease();await p.waitForTimeout(150);ok((await p.locator('#ntpComentarios').textContent()).includes('Nova mensagem antes do histórico chegar'),'GET atrasado não apaga a mensagem confirmada depois');
  await p.locator('#ntpConversaFechar').click();await area(p,'ntpDiarioSec');await p.locator('[data-ntp-conversa="'+repeated.id+'"]').click();await p.locator('[data-ntp-apaga="'+repeated.id+'"]').click();ok(!await p.locator('#ntpConversa').isVisible(),'Excluir refeição fecha sua conversa imediatamente');eq(await p.locator('#ntpComentarios').textContent(),'','Excluir limpa mensagens do painel aberto');
  await p.locator('#ntpAnt').click();eq(await p.locator('[data-ntp-comi=almoco]').count(),0,'Plano de domingo omite refeição definida somente para seg/qua/sex');eq(await p.locator('[data-ntp-comi=lanche]').count(),1,'Refeição diária continua disponível');await p.locator('#ntpData').fill('2026-08-31');await p.locator('#ntpData').dispatchEvent('change');eq(await p.locator('[data-ntp-comi]').count(),0,'Data anterior à vigência não oferece refeição do plano');
  await p.locator('#ntpData').fill(DAY);await p.locator('#ntpData').dispatchEvent('change');
  for(const width of[320,390,1280]){await p.setViewportSize({width,height:844});for(const claro of[false,true]){await p.evaluate(v=>document.documentElement.classList.toggle('claro',v),claro);ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Sem sobreposição horizontal em '+width+(claro?' claro':' escuro'));}}
  eq(await p.evaluate(()=>[localStorage.getItem('pthab'),localStorage.getItem('ptdc')]),legacy,'Alimentação conserva hábitos e execução de treino');
  await p.setViewportSize({width:390,height:844});await p.evaluate(()=>document.documentElement.classList.remove('claro'));await p.locator('#ntpHoje').scrollIntoViewIfNeeded();
  if(process.env.TORQUE_SCREENSHOTS){fs.mkdirSync(process.env.TORQUE_SCREENSHOTS,{recursive:true});await p.screenshot({path:process.env.TORQUE_SCREENSHOTS+'/aluno-alimentacao-v814.png',fullPage:true});}
  await ctx.close();
}
async function testOfflineAndIdentity(){
  const{p,ctx,state}=await fixture({}, {offline:true});await p.locator('[data-ntp-comi=almoco]').click();await p.waitForFunction(()=>document.getElementById('ntpSync').textContent.includes('offline de teste'));
  eq((await active(p)).length,1,'Registro direto continua disponível com falha de conexão');const id=(await active(p))[0].id;
  await area(p,'ntpDiarioSec');await p.locator('[data-ntp-conversa="'+id+'"]').click();await p.locator('#ntpResposta').fill('Mensagem guardada');await p.locator('#ntpResponder').click();await p.waitForFunction(()=>document.getElementById('ntpConversaStatus').textContent.includes('Primeiro sincronize'));eq(state.calls.filter(x=>x.rpc==='app_nutricao_feedback_envia').length,0,'Não envia conversa para registro ainda não sincronizado');
  await p.reload();await p.waitForFunction(()=>window.__nutriAluno);await open(p);await area(p,'ntpDiarioSec');await p.locator('[data-ntp-conversa="'+id+'"]').click();eq(await p.locator('#ntpResposta').inputValue(),'Mensagem guardada','Rascunho de resposta sobrevive ao recarregar');
  const before=state.calls.length;await p.evaluate(()=>{localStorage.setItem('tq_app_token','outra-pessoa');window.dispatchEvent(new StorageEvent('storage',{key:'tq_app_token',newValue:'outra-pessoa'}));});ok(!await p.locator('#ntpConversa').isVisible(),'Troca de acesso fecha conversa do aluno anterior');ok(await p.locator('#ntpNovo').isDisabled(),'Troca de identidade bloqueia ações pendentes');await p.waitForTimeout(100);eq(state.calls.length,before,'Troca de token não transfere mensagens ou registros');await ctx.close();
  const paused=await fixture({nutricaoApp:{...plan(),ativo:false}},{records:{anterior:{id:'anterior',d:DAY,refeicaoId:'',titulo:'Registro anterior',hora:'12:00',itens:[banana],origem:'manual',foto:'',atualizadoEm:STAMP,apagado:false}}});await paused.p.waitForFunction(()=>document.getElementById('ntpDiario').textContent.includes('Registro anterior'));eq(await paused.p.locator('[data-ntp-comi]').count(),0,'Plano pausado não permite novos registros diretos');ok(!await paused.p.locator('#ntpNovo').isVisible(),'Plano pausado mantém formulário indisponível');await paused.p.locator('[data-ntp-conversa=anterior]').click();ok(await paused.p.locator('#ntpResponder').isDisabled(),'Plano pausado permite consulta, sem envio de resposta');eq(await paused.p.evaluate(()=>window.__nutriAluno.xp()),2,'Plano pausado conserva XP anterior');await paused.ctx.close();
}
(async()=>{browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});await testMain();await testOfflineAndIdentity();eq(errors,[],'Sem erros JavaScript nos novos fluxos');eq(external,[],'Nenhuma chamada usa serviços externos');console.log('Nutrição aluno completa: '+checks+' verificações passaram.');})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
